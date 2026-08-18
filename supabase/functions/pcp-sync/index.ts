// ============================================================================
// pcp-sync — Edge Function do PCP / Instalacao (substitui netlify/functions/os.js)
//
// O CONTRATO DE ACOES E O MESMO: o app manda { action, ... } com o header
// x-token e recebe a mesma resposta. So o backend mudou:
//   store "os"          -> pcp_registros (colecao='os')
//   store "cfg"         -> pcp_config_global
//   store "integracoes" -> pcp_meta (status da importacao horaria)
//   store "fotos"       -> bucket pcp-arquivos
//
// PROJETO COMPARTILHADO com o RH (nomes crus) e o Brief (brief_*): o nome desta
// function PRECISA do prefixo. Publicar uma "sync" sobrescreve a do RH.
//
// verify_jwt = false: o preflight CORS chega sem token e o gateway barraria
// antes de a funcao rodar. A autorizacao e feita aqui dentro, com o x-token.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("PCP_TOKEN") ?? "";
// Credencial de MONITORAMENTO (vigia diário): só libera as ações de saúde
// (ping/diag/saude) — nunca lê nem escreve O.S. Girável sem afetar ninguém.
const SAUDE_TOKEN = Deno.env.get("PCP_SAUDE_TOKEN") ?? "";
const JWT_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";

// AUTORIZACAO (mudou em 05/08/2026): ate aqui a unica porta era o x-token, e
// esse token estava escrito em texto puro no config.js, servido ao navegador.
// Quem abrisse o codigo-fonte da pagina lia as O.S. da casa sem login. Mesmo
// buraco que o DRE tinha; consertado do mesmo jeito.
//
//   GENTE   -> Authorization: Bearer <cracha da equipe-auth>, com sis = "pcp"
//   MAQUINA -> x-token, so para o backup do Hub, que nao faz login
async function lerCracha(token: string): Promise<any | null> {
  if (!JWT_SECRET || !token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey(
      "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const b64url = (x: string) => {
      x = x.replace(/-/g, "+").replace(/_/g, "/");
      while (x.length % 4) x += "=";
      const bin = atob(x);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    const ok = await crypto.subtle.verify(
      "HMAC", chave, b64url(partes[2]), enc.encode(`${partes[0]}.${partes[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
    // exp OBRIGATORIO e numerico: cracha sem exp (ou string) nao pode valer p/ sempre.
    if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
    if (p.sis !== "pcp") return null;
    return p;
  } catch {
    return null;
  }
}

// Assina um cracha de MONTAGEM (mesma chave da equipe-auth). Usado so pela
// entrada sem senha do espelho: o instalador toca no nome (validado contra a
// lista de instaladores) e recebe um cracha papel 'montagem' de 30 dias.
const b64urlSign = (bytes: Uint8Array) => {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function assinarCrachaMontagem(nome: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { sis: "pcp", sub: nome, nome, papel: "montagem", iat: agora, exp: agora + 30 * 86400 };
  const cab = b64urlSign(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const meio = `${cab}.${b64urlSign(enc.encode(JSON.stringify(corpo)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(meio)));
  return `${meio}.${b64urlSign(sig)}`;
}
const BUCKET = "pcp-arquivos";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------- revogacao
// O cracha e um JWT stateless de 30 dias guardado no localStorage. Ate aqui,
// "desativar a conta" na Central nao fechava porta nenhuma deste lado: o token
// ja emitido continuava lendo e gravando O.S ate expirar, e a unica forma de
// cortar era girar o EQUIPE_JWT_SECRET — que derruba os SETE sistemas de uma vez.
//
// A REGRA E `public.acesso_revogado`, no banco -- a mesma que as outras onze
// portas de dados consultam. Aqui fica so o cache de 60s e a decisao de aceitar
// quando o banco nao responde.
//
// Ela recusa com PROVA: conta desativada no proprio sistema; pessoa ou papel
// desativado no quadro unico; instalador tirado da lista (papel montagem sem
// conta); prazo de terceirizado vencido; ou ficha marcada como desligada no RH.
// Ausencia de qualquer uma ACEITA -- trancar por ausencia derrubaria quem entrou
// por um caminho que nao provisiona conta aqui, e o prejuizo de trancar a fabrica
// e maior que o de um cracha durar ate expirar. Banco fora do ar tambem aceita,
// e nao guarda no cache.
const CACHE_REVOG = new Map<string, { ate: number; revogado: boolean }>();
const CACHE_REVOG_MS = 60_000; // uma consulta por pessoa por minuto, nao por request

async function crachaRevogado(cracha: any): Promise<boolean> {
  const sub = String(cracha?.sub ?? "").trim();
  const papel = String(cracha?.papel ?? "");
  if (!sub) return false;
  const chave = papel + ":" + sub;
  const agora = Date.now();
  const emCache = CACHE_REVOG.get(chave);
  if (emCache && emCache.ate > agora) return emCache.revogado;

  let revogado = false;
  try {
    /* A REGRA MORA NO BANCO, E NAO AQUI.
       Ate 17/08/2026 esta funcao reimplementava a revogacao inteira: conta em
       `equipe_contas`, conta na Central, e a lista de instaladores para o cracha
       de toque no nome. A implementacao estava certa -- e era uma COPIA. As
       outras onze portas de dados perguntam a `public.acesso_revogado`, e no
       mesmo dia essa funcao ganhou duas regras que esta copia jamais aprenderia:
       prazo vencido de terceirizado, e ficha marcada como desligada no RH.
       O PCP seguiria abrindo para quem as outras onze ja tinham fechado, e nada
       acusaria a diferenca -- que e exatamente a doenca que a funcao no banco
       existe para curar.

       A funcao de la e superconjunto do que havia aqui, inclusive a separacao
       dos DOIS crachas de papel `montagem`: quem TEM conta e conferido como
       conta; quem nao tem (o instalador, que entra tocando no nome) e conferido
       contra a lista. Sem essa guarda, a conta `montagem` -- que nao e nome de
       instalador nenhum -- caia como revogada, e a pessoa nao entrava por
       caminho nenhum. */
    const { data, error } = await sb.rpc("acesso_revogado", {
      p_sistema: "pcp", p_sub: sub, p_papel: papel,
    });
    if (error) throw new Error(error.message);
    revogado = data === true;
  } catch (e) {
    // Banco fora do ar ACEITA e nao guarda no cache -- trancar a fabrica por
    // erro de infraestrutura custa mais que um cracha durar ate expirar.
    console.error("[pcp-sync] revogacao indisponivel:", (e as Error).message);
    return false;
  }
  CACHE_REVOG.set(chave, { ate: agora + CACHE_REVOG_MS, revogado });
  return revogado;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------- registros

// APAGADO E LAPIDE, nao sumico: o delete marca `apagado` em vez de remover a
// linha (a coluna existe desde o 0001_init). Motivo: a importacao horaria decide
// o que e novo perguntando quais NUMEROS ja existem na tabela — com a linha
// removida, o numero "nao existe" e a O.S excluida voltava como esqueleto zerado
// na hora seguinte, para sempre. A lapide continua ocupando o numero (o indice
// unico vale para ela tambem) e barra a reinsercao sozinha.
//
// Em troca, TODA leitura que serve o app precisa filtrar apagado — senao a O.S
// excluida continua na tela.
async function getReg(colecao: string, id: string): Promise<any | null> {
  const { data } = await sb
    .from("pcp_registros").select("registro")
    .eq("colecao", colecao).eq("id", id).eq("apagado", false).maybeSingle();
  return data?.registro ?? null;
}

async function setReg(colecao: string, id: string, registro: any) {
  const { error } = await sb.from("pcp_registros").upsert(
    { colecao, id, registro, atualizado_em: new Date().toISOString(), apagado: false },
    { onConflict: "colecao,id" },
  );
  if (error) throw new Error(error.message);
}

// Gravacao escrita explicitamente RESSUSCITA a lapide (apagado: false acima). E
// deliberado: um aparelho que estava offline com edicao pendente prefere ver o
// trabalho de volta a perde-lo calado. Quem nao ressuscita e a importacao.
async function delReg(colecao: string, id: string) {
  // Confere o erro (o supabase-js NAO lanca — devolve {error}). Sem isso, um
  // delete que falhou respondia ok:true e o cliente tirava o item da fila.
  const { error } = await sb.from("pcp_registros")
    .update({ apagado: true, atualizado_em: new Date().toISOString() })
    .eq("colecao", colecao).eq("id", id);
  if (error) throw new Error(error.message);
}

async function contarRegs(colecao: string): Promise<number> {
  const { count } = await sb
    .from("pcp_registros").select("id", { count: "exact", head: true })
    .eq("colecao", colecao).eq("apagado", false);
  return count ?? 0;
}

// ---------------------------------------------------------------- meta / cfg

async function getMeta(chave: string): Promise<any | null> {
  const { data } = await sb.from("pcp_meta").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

async function getCfg(): Promise<any> {
  const { data } = await sb.from("pcp_config_global").select("config").eq("id", true).maybeSingle();
  return data?.config ?? null;
}

// ---------------------------------------------------------------- fotos
// O app manda (e espera de volta) uma DATA URL, que vai direto para img.src.
// Guardamos os bytes puros + o mime e remontamos a data url na leitura. No
// Brief, devolver so o miolo fazia TODAS as fotos sumirem da tela -- e a
// contagem continuava batendo, entao so a comparacao byte a byte pegou.

const b64ParaBytes = (b64: string) =>
  Uint8Array.from(atob(b64.includes(",") ? b64.split(",")[1] : b64), (c) => c.charCodeAt(0));

function bytesParaB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const BLOCO = 0x8000; // de uma vez so, o apply() estoura a pilha
  for (let i = 0; i < bytes.length; i += BLOCO) s += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  return btoa(s);
}

const mimeDaDataUrl = (b64: string, padrao: string) =>
  /^data:([^;,]+)[;,]/.exec(b64 || "")?.[1] ?? padrao;

// ---------------------------------------------------------------- handler

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return resp({ error: "JSON inválido" }, 400);
  }

  const acao = String(body.action);

  // ENTRADA DA MONTAGEM (sem senha, por decisao do dono): o instalador toca no
  // nome; validamos contra a lista de instaladores e emitimos um cracha de 30
  // dias. Nao exige credencial previa — e o unico caminho assim, e so cria
  // cracha papel 'montagem' (que nao pode setCfg). Substitui o #i=NOME antigo,
  // que aceitava QUALQUER nome. Rodada ANTES do portao.
  if (acao === "entrarMontagem") {
      /* FREIO. Esta porta e um oraculo: ela responde 200 para nome que esta na
         lista e 403 para o que nao esta -- ou seja, da para varrer nomes ate
         achar um que abra, e cada acerto vale 30 dias de acesso. Nao havia
         limite nenhum. A contagem e a mesma das outras portas de senha, so que
         aqui a "senha" e o nome. */
      {
        const alvoNome = String(body.nome ?? "").trim().toLowerCase();
        const { data: travado } = await sb.rpc("porta_travada", { p_sistema: "pcp", p_usuario: alvoNome || "-" });
        if (travado === true) {
          return resp({ error: "Muitas tentativas. Espere 15 minutos e tente de novo." }, 429);
        }
      }
    const nome = String(body.nome ?? "").trim();
    if (!nome) return resp({ error: "nome ausente" }, 400);
    const cfg = (await getCfg()) ?? {};
    const lista: string[] = Array.isArray(cfg.instaladores) ? cfg.instaladores : [];
    const bate = lista.find((n) => String(n).trim().toLowerCase() === nome.toLowerCase());
    if (!bate) {
        await sb.rpc("porta_registrar", {
          p_sistema: "pcp", p_usuario: String(body.nome ?? "").trim().toLowerCase(),
          p_acao: "login-falhou", p_por: "-", p_detalhe: "nome fora da lista de instaladores",
        }).then(() => {}, () => {});
        /* FREIO PELO RELOGIO, e nao por bloqueio.
           Esta porta e um oraculo: 200 para nome da lista, 403 para o resto --
           da para varrer nomes ate achar um que abra, e cada acerto vale 30
           dias de acesso. Contar por NOME nao adianta (o varredor troca de nome
           a cada tentativa, e foi o que o meu proprio teste mostrou); e travar a
           porta depois de N erros trancaria a FABRICA -- o instalador chega na
           obra e nao entra.
           Entao a resposta errada custa 1,5s. Quem toca no proprio nome acerta
           de primeira e nao sente; quem varre cai de milhares de tentativas por
           minuto para quarenta. */
        await new Promise((r) => setTimeout(r, 1500));
        return resp({ error: "Nome não está na lista de instaladores." }, 403);
      }
    return resp({ token: await assinarCrachaMontagem(bate), nome: bate, papel: "montagem" });
  }

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const cracha = m ? await lerCracha(m[1]) : null;
  const token = req.headers.get("x-token") ?? body.token;
  const ehMaquina = !!TOKEN && token === TOKEN;
  const ehVigia = !!SAUDE_TOKEN && token === SAUDE_TOKEN &&
    ["ping", "diag", "saude"].includes(acao);
  if (!cracha && !ehMaquina && !ehVigia) return resp({ error: "Entre no sistema.", semSessao: true }, 401);

  // Assinatura valida nao basta: a conta pode ter sido desativada DEPOIS de o
  // cracha ser emitido (ele vale 30 dias). semSessao:true de proposito — o app
  // preserva a fila e pede para entrar de novo em vez de descartar trabalho.
  if (cracha && !ehMaquina && (await crachaRevogado(cracha))) {
    return resp({ error: "Seu acesso ao PCP foi encerrado. Fale com a gestão.", semSessao: true }, 401);
  }

  // AUTORIZACAO POR PAPEL no SERVIDOR (05/08 fechou o token publico, mas o
  // switch executava tudo sem olhar papel: um cracha 'comercial' se promovia a
  // admin via setCfg ou apagava O.S). A porta de MAQUINA (backup do Hub) segue
  // com poder total. Papeis com editar=true: admin/pcp/montagem/operacao.
  let ehToqueNoNome = false;
  if (cracha && !ehMaquina) {
    const papel = String(cracha.papel ?? "");
    const podeEditar = ["admin", "pcp", "montagem", "operacao"].includes(papel);
    const ESCRITA = ["upsert", "delete", "putPhoto", "deletePhoto"];
    if (acao === "setCfg" && papel !== "admin") {
      return resp({ error: "Só o administrador altera as configurações." }, 403);
    }
    if (ESCRITA.includes(acao) && !podeEditar) {
      return resp({ error: "Seu acesso é somente leitura." }, 403);
    }
    /* APAGAR O.S NAO E COISA DE QUEM ENTROU SEM SENHA.
       O cracha do TOQUE NO NOME nasce de um primeiro nome da lista de
       instaladores -- sem senha nenhuma. Medido em 17/08/2026: com o nome
       "Osmane" sai um cracha, e com ele `delete` respondia 200 e apagava O.S.
       Nomes dessa lista sao nomes comuns (Charles, Douglas, Lucas, Saulo), e
       ela e publica para quem abre o espelho.

       Escrever o proprio trabalho e o motivo do cracha existir, e continua
       liberado (upsert, fotos). Apagar ordem de servico nunca foi trabalho de
       instalador em cima de andaime -- e apagada, a O.S nao volta.

       Conta de verdade com papel `montagem` (com senha, em equipe_contas)
       continua podendo: quem tem senha e quem responde por ela. E a mesma
       distincao que o crachaRevogado faz. */
    /* O QUE O CRACHA DE TOQUE ESCREVE: so a execucao.
       Ele nasce de um primeiro nome, sem senha. Poder gravar o registro inteiro
       significa poder reescrever o CLIENTE, o ENDERECO e o VENDEDOR de uma O.S
       -- coisas que o instalador nunca preenche e que o PCP nao teria como
       saber que mudaram. A lista abaixo saiu do que a tela dele de fato salva
       (equipe.js: checkin, checkinGPS, checkout, fotos, carro liberado,
       conclusao), mais os campos de conferencia que a mesma tela usa.

       Campo fora da lista NAO derruba a gravacao: ele e descartado e o resto
       passa. Recusar tudo faria o aparelho na rua, offline ha horas, perder o
       checkin inteiro por causa de um campo a mais. */
    /* "Entrou pelo nome" = papel montagem SEM conta em equipe_contas. E a mesma
       distincao do crachaRevogado; calculada uma vez e usada nas tres regras
       (nao apaga, escreve so execucao, nao ve documento). */
    const { data: contaDoCracha } = papel === "montagem"
      ? await sb.from("equipe_contas").select("usuario").eq("sistema", "pcp")
          .eq("usuario", String(cracha.sub ?? "")).maybeSingle()
      : { data: null };
    ehToqueNoNome = papel === "montagem" && !contaDoCracha;

    const CAMPOS_MONTAGEM = new Set([
      "id", "atualizadoEm", "atualizadoPor",
      "checkin", "checkinGPS", "checkout", "conclusao",
      "fotosCheckinIds", "fotosRetornoIds",
      "carroLiberado", "carroLiberadoEm", "carroLiberadoPor",
      "equipe", "obsTecnicas", "instalacaoOK", "problema",
      "ferramentasConferidas", "ferramentasConferidasPor",
      "kmSaida", "kmRetorno", "horaSaida", "horaRetorno",
    ]);
    /* MESCLA, NAO FILTRA -- e a diferenca entre proteger e destruir.
       O upsert do PCP SUBSTITUI a O.S inteira (nao funde campo a campo). Entao
       "deixar passar so os campos de execucao" apagava cliente, endereco e
       vendedor a cada checkin de instalador: o filtro protegeria esses campos de
       serem reescritos e os destruiria por omissao. Peguei isso testando, e o
       estrago teria sido diario e silencioso.

       O certo e partir do que JA ESTA gravado e deixar o cracha de toque mudar
       so os campos dele. O.S que ainda nao existe: nao ha o que preservar, e
       criar O.S nunca foi trabalho de instalador.

       (O upsert recebe a O.S em `body.os`, e nao em `registro` como os outros
       sistemas da casa -- apontar para o campo errado nao daria erro nenhum,
       passaria tudo.) */
    if (acao === "upsert" && ehToqueNoNome && body?.os) {
      const veio = body.os as Record<string, unknown>;
      const id = String(veio.id ?? "");
      const atual = id ? await getReg("os", id) : null;
      if (!atual) {
        return resp({ error: "Quem entra pelo nome não cria O.S. Fale com o PCP." }, 403);
      }
      const mesclado: Record<string, unknown> = { ...atual };
      for (const k of Object.keys(veio)) if (CAMPOS_MONTAGEM.has(k)) mesclado[k] = veio[k];
      body.os = mesclado;
    }

    if (acao === "delete" && ehToqueNoNome) {
      return resp({ error: "Quem entra pelo nome não apaga O.S. Fale com o PCP." }, 403);
    }
  }

  try {
    switch (acao) {
      case "ping":
        return resp({ ok: true });

      // Antes testava os dois caminhos de auth do Blobs. Agora diz se o banco e
      // o bucket estao de pe -- mesma finalidade.
      case "diag": {
        const out: Record<string, unknown> = { backend: "supabase" };
        try {
          out.banco = "ok (" + (await contarRegs("os")) + " O.S)";
        } catch (e) {
          out.banco = "ERR: " + (e as Error).message;
        }
        const { data, error } = await sb.storage.from(BUCKET).list("", { limit: 1 });
        out.bucket = error ? "ERR: " + error.message : "ok (" + BUCKET + ")";
        return resp(out);
      }

      // Pagina NO BANCO (antes carregava todas as chaves e fatiava na memoria --
      // com 496 O.S isso ja era uma varredura completa a cada consulta).
      case "list": {
        const PAGE = 150;
        let q = sb.from("pcp_registros").select("id, registro")
          .eq("colecao", "os").eq("apagado", false).order("id").limit(PAGE);
        if (body.after != null) q = q.gt("id", String(body.after));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const linhas = data ?? [];
        /* CPF/CNPJ NAO VAI PARA QUEM ENTROU PELO NOME.
           O cracha de toque sai de um primeiro nome da lista, sem senha. Ele
           precisa do cliente, do endereco e do contato -- e o servico dele: ele
           vai ao lugar e liga para avisar. Nao precisa do documento de ninguem.

           O filtro NAO e por equipe, e a razao esta no dado: de 615 O.S, apenas
           81 tem `equipe` preenchida. Escopar por ela deixaria o instalador
           enxergando 13% do trabalho, e as outras 534 nao apareceriam para
           ninguem. Enquanto o PCP nao preencher equipe, isso e decisao do dono,
           nao conserto. */
        const soExecucao = ehToqueNoNome;
        return resp({
          os: linhas.map((r: any) => {
            if (!soExecucao) return r.registro;
            const { cnpjCpf, ...resto } = r.registro ?? {};
            return resto;
          }),
          total: await contarRegs("os"),
          nextAfter: linhas.length === PAGE ? linhas[linhas.length - 1].id : null,
          nextOffset: null, // paginacao por chave; offset era so compatibilidade
        });
      }

      case "upsert": {
        const os = body.os;
        if (!os?.id) return resp({ error: "O.S sem id" }, 400);

        // Blindagem anti-duplicata: app desatualizado importando do Mubisys com
        // id aleatorio, quando o pedido ja existe na chave canonica (mub-<n>).
        // Se o que chegou e um esqueleto intocado, devolve a ficha canonica em
        // vez de criar copia (o aparelho converge no proximo pull).
        if (os.origemMubisys && os.numero) {
          const canonicalId = "mub-" + String(os.numero).trim();
          const semTrabalho = (os.atualizadoPor || "Mubisys (auto)") === "Mubisys (auto)" &&
            !os.liberadoPCP && !os.finalizadaEm &&
            !(os.fotosCheckinIds ?? []).length && !(os.fotosRetornoIds ?? []).length;
          if (os.id !== canonicalId && semTrabalho) {
            const canonico = await getReg("os", canonicalId);
            if (canonico) return resp({ ok: true, os: canonico, duplicataEvitada: true });
          }
        }

        const existing = await getReg("os", os.id);

        // Cache velho: aparelho re-importa um ESQUELETO por cima de ficha ja
        // trabalhada no servidor (mesmo id canonico, atualizadoEm mais novo).
        // Esqueleto nunca vence ficha com trabalho — devolve a do servidor e o
        // pull realinha o aparelho.
        if (os.origemMubisys && existing) {
          const semTrabalho = !os.liberadoPCP && !os.finalizadaEm &&
            !(os.fotosCheckinIds ?? []).length && !(os.fotosRetornoIds ?? []).length &&
            !(os.equipe ?? []).length && !os.confirmacao && !os.horaSaida;
          const comTrabalho = !!(existing.liberadoPCP || existing.finalizadaEm ||
            (existing.fotosCheckinIds ?? []).length || (existing.fotosRetornoIds ?? []).length ||
            (existing.equipe ?? []).length || existing.confirmacao || existing.horaSaida);
          if (semTrabalho && comTrabalho) return resp({ ok: true, os: existing, duplicataEvitada: true });
        }

        // CONFLITO POR VERSAO DO SERVIDOR, nao por relogio de parede.
        //
        // `atualizadoEm` e carimbado pelo CLIENTE (de proposito — ver abaixo).
        // Comparar o carimbo de dois aparelhos e comparar dois relogios: o
        // celular 40 min adiantado do instalador "vencia" e transformava edicao
        // legitima do escritorio em conflito ate o tempo real alcanca-lo. Agora
        // cada gravacao aceita incrementa `rev`, e o cliente devolve o rev que
        // leu: divergiu, houve outra escrita no meio.
        //
        // COMPATIBILIDADE: app em cache antigo nao manda `rev`. Para esse cai a
        // regra velha do relogio — se exigissemos rev dele, o "Sobrescrever" do
        // proprio banner de conflito reenviaria sem rev e o aparelho ficaria
        // preso em conflito eterno, sem conseguir subir o trabalho do dia.
        const revAtual = typeof existing?.rev === "number" ? existing.rev : 0;
        if (existing) {
          if (typeof os.rev === "number") {
            if (revAtual !== os.rev) return resp({ conflito: true, servidor: existing });
          } else if (
            existing.atualizadoEm && os.atualizadoEm &&
            new Date(existing.atualizadoEm).getTime() > new Date(os.atualizadoEm).getTime()
          ) {
            return resp({ conflito: true, servidor: existing });
          }
        }

        // Preserva o atualizadoEm do autor: reescrever com o relogio do servidor
        // misturava duas fontes de tempo e o proprio autor levava "conflito".
        // (Ele segue valendo para EXIBIR "alterado em"; quem decide conflito e o rev.)
        const gravar = { ...os, rev: revAtual + 1 };
        try {
          await setReg("os", os.id, gravar);
        } catch (e) {
          // O indice unico de numero e a ultima linha de defesa contra duas O.S
          // com o mesmo numero. Se bateu nele, devolve a que ja existe em vez de
          // estourar erro na cara do instalador.
          const msg = (e as Error).message || "";
          // Colisao no indice de numero: devolve a ficha que ja existe. Antes so
          // procurava a canonica mub-<n>; se a sobrevivente tem id aleatorio
          // (O.S antiga/manual), procura pelo NUMERO — senao o erro estourava
          // 500 e travava a fila do aparelho para sempre.
          if ((/duplicate key|pcp_os_numero_idx|23505/i).test(msg) && os.numero) {
            const num = String(os.numero).trim();
            let sobrevivente = await getReg("os", "mub-" + num);
            if (!sobrevivente) {
              const { data } = await sb.from("pcp_registros").select("registro")
                .eq("colecao", "os").eq("apagado", false)
                .eq("registro->>numero", num).limit(1).maybeSingle();
              sobrevivente = data?.registro ?? null;
            }
            if (sobrevivente) return resp({ ok: true, os: sobrevivente, duplicataEvitada: true });

            // Ninguem VIVO com esse numero: quem o ocupa e uma lapide (a O.S foi
            // excluida e alguem esta criando outra com o mesmo numero). Devolver
            // a lapide como se fosse a ficha ressuscitaria na tela uma O.S
            // apagada; recusar prenderia a fila do aparelho. Entao a linha morta
            // recebe o conteudo novo e volta a viver com o id dela — o aparelho
            // converge no proximo pull, como no caso da duplicata canonica.
            const { data: morta } = await sb.from("pcp_registros").select("id, registro")
              .eq("colecao", "os").eq("apagado", true)
              .eq("registro->>numero", num).limit(1).maybeSingle();
            if (morta?.id) {
              const revMorta = typeof morta.registro?.rev === "number" ? morta.registro.rev : 0;
              const revivido = { ...os, id: morta.id, rev: revMorta + 1 };
              await setReg("os", morta.id, revivido);
              return resp({ ok: true, os: revivido, duplicataEvitada: true });
            }
          }
          throw e;
        }
        return resp({ ok: true, os: gravar });
      }

      case "delete": {
        const id = body.id;
        if (!id) return resp({ error: "id ausente" }, 400);
        const existing = await getReg("os", id);
        // Apaga a LINHA primeiro (e confere o erro). Só depois remove as fotos
        // do bucket — se a foto some mas a linha fica, o app finge que apagou.
        await delReg("os", id);
        if (existing) {
          const ids = [
            ...(existing.fotosCheckinIds ?? []),
            ...(existing.fotosRetornoIds ?? []),
            existing.layoutFotoId,
          ].filter(Boolean);
          if (ids.length) {
            const { error } = await sb.storage.from(BUCKET).remove(ids);
            if (error) console.error("[pcp-sync] fotos órfãs no delete de", id, error.message);
          }
        }
        return resp({ ok: true });
      }

      case "getCfg": {
        const cfg = (await getCfg()) ?? {};
        // Papel nao-admin nao recebe dados sensiveis: a lista de usuarios (com
        // senha em texto no CFG_DEFAULT) e a agenda de funcionarios (telefones).
        // Maquina/Hub recebe tudo (backup).
        if (cracha && !ehMaquina && String(cracha.papel ?? "") !== "admin") {
          const { usuarios: _u, funcionarios: _f, ...publico } = cfg;
          return resp({ cfg: publico });
        }
        return resp({ cfg });
      }

      case "setCfg": {
        if (!body.cfg) return resp({ error: "cfg ausente" }, 400);
        const { error } = await sb.from("pcp_config_global").upsert(
          { id: true, config: body.cfg, atualizado_em: new Date().toISOString() },
          { onConflict: "id" },
        );
        if (error) throw new Error(error.message);
        return resp({ ok: true });
      }

      case "putPhoto": {
        const { base64, mime, fileId } = body;
        if (!base64) return resp({ error: "base64 ausente" }, 400);
        const id = fileId || "foto_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        const { error } = await sb.storage.from(BUCKET).upload(id, b64ParaBytes(base64), {
          contentType: mimeDaDataUrl(base64, mime || "image/jpeg"),
          upsert: true,
        });
        if (error) throw new Error("upload: " + error.message);
        return resp({ fileId: id });
      }

      case "deletePhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
        await sb.storage.from(BUCKET).remove([body.fileId]).catch(() => {});
        return resp({ ok: true });
      }

      case "getPhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
        const { data, error } = await sb.storage.from(BUCKET).download(body.fileId);
        if (error || !data) return resp({ error: "Foto não encontrada" }, 404);
        const tipo = data.type || "image/jpeg";
        // Data url completa, como o os.js devolvia -- o app joga isto em img.src.
        return resp({ base64: `data:${tipo};base64,${bytesParaB64(await data.arrayBuffer())}`, mime: tipo });
      }

      case "saude":
        return resp({
          ok: true,
          totalOS: await contarRegs("os"),
          ultimaImportacao: await getMeta("sync_status"),
        });

      default:
        return resp({ error: `Ação desconhecida: ${body.action}` }, 400);
    }
  } catch (e) {
    console.error("[pcp-sync] erro:", e);
    return resp({ error: (e as Error)?.message ?? "Erro interno" }, 500);
  }
});
