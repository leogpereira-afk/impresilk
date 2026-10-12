import { demandasPCP } from "../_shared/pcp-demandas.mjs";
import { fotoFreelancerRH } from "../_shared/foto-freelancer.mjs";
import { podeVerRankingEquipe, rankingEquipeSeguro } from "../_shared/pcp-ranking-publico.mjs";
import { podarValoresPCP, preservarValoresPCP, CONFERENCIA_ENTREGA, mesclarConfiguracao, mesclarToqueNoNome, validarMomentos, carimbarExecucao, pertenceEquipe, validarConclusao, validarPerformance, preservarCamposEquipe, sanearEquipes, conferirEquipesAtivas, idDoMembro, sanearVoltaEquipe, PERGUNTAS_VOLTA, voltaConferida, registrarVoltas, comVoltaLegado, podarToque, acertarMomentosToque, canon, resolverPessoas, ehIdPessoa, idDoCracha, idDaGestao, diffAuditavel, diffCfgAuditavel, entradaAuditoria, temCampoGestao, preservarAusentes, carimbarEntregaLancada, entregaLancadaMudou, carimbarFinalizacaoCampo, finalizacaoMudou, carimbarIds, carimbosQueMudaram, carimbarRetornoPrevisto, carimbarPrazoCombinado, carimbarRetornoConferido, carimbarChegadas, guardarAgendaLog, podarCarimbosF15, guardarRetrabalho, preservarItens, guardarEntregasItens, entregasNaoGravadas, temEntregaItem, juntarFreelancers, sanearAlocacao, alocacaoMudou, diarioDescarteAlocacao, podarAlocacao, podarIdsAlocacao, alocacaoConfirmada, finaisAlocacao, participacaoVale, equipesDaDivisao, sugestaoApurada, guardarSaldoERP, guardarItensERP, MESCLA_ITENS_ERP } from "../_shared/pcp-integridade.mjs";
import { COMISSAO } from "../_shared/pcp-comissao.mjs";
import { REGRAS } from "../_shared/pcp-regras.mjs";
import { cancelada, carimbarCancelamento, cancelamentoMudou, cancelamentoParaMarcas, guardarOcorrencias, guardarAbonos, abonosPedidos, ocorrenciasDaOS, voltaDoRetorno, guardarOrigemRetrabalho } from "../_shared/pcp-status.mjs";
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
//              (a copia completa sai pela acao exportarBackup, so dela)
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
async function assinarCrachaMontagem(nome: string, id = ""): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  // `id` = a pessoa do RH que a gestao escolheu (6 digitos). `sub` segue
  // sendo o nome da lista: e por ele que acesso_revogado confere a porta.
  const corpo = { sis: "pcp", sub: nome, nome, ...(ehIdPessoa(id) ? { id } : {}), papel: "montagem", montagemIndividual:true, iat: agora, exp: agora + 30 * 86400 };
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
// O.S. da equipe de cada crachá de toque, para a trava das fotos: a lista do
// espelho abre várias miniaturas seguidas, e cada uma varria todas as O.S.
const CACHE_FOTOS_EQUIPE = new Map<string, { ate: number; ids: string[] }>();
const CACHE_REVOG_MS = 60_000; // uma consulta por pessoa por minuto, nao por request

async function crachaRevogado(cracha: any, estrito = false): Promise<boolean> {
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
    if (estrito && typeof data !== "boolean") throw new Error("Resposta de revogação indisponível.");
    revogado = data === true;
  } catch (e) {
    // Banco fora do ar ACEITA e nao guarda no cache -- trancar a fabrica por
    // erro de infraestrutura custa mais que um cracha durar ate expirar.
    console.error("[pcp-sync] revogacao indisponivel:", (e as Error).message);
    // Acompanhamento remoto não é execução offline. Sem conferir a conta,
    // não libera o ranking; a operação conserva seu comportamento anterior.
    if (estrito) throw new Error("Não foi possível conferir seu acesso ao ranking. Tente novamente.");
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
// Falha de leitura LANÇA (vira 5xx, que o aparelho reenvia). Antes o erro era
// ignorado e virava "não existe": um soluço do banco respondia ao instalador
// "Quem entra pelo nome não cria O.S." (403) e o check-in saía da fila.
async function getReg(colecao: string, id: string): Promise<any | null> {
  const { data, error } = await sb
    .from("pcp_registros").select("registro")
    .eq("colecao", colecao).eq("id", id).eq("apagado", false).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.registro ?? null;
}

async function setReg(colecao: string, id: string, registro: any) {
  // As gravações auxiliares também respeitam lápides e concorrência.
  if (colecao === "os") {
    const {data:row,error:err}=await sb.from("pcp_registros").select("apagado,atualizado_em").eq("colecao",colecao).eq("id",id).maybeSingle();
    if(err) throw new Error(err.message);
    if(row?.apagado) throw new Error("O.S. excluída: restauração exige gestão e motivo.");
    const novo={colecao,id,registro,atualizado_em:new Date(Math.max(Date.now(),Date.parse(row?.atualizado_em)+1 || 0)).toISOString(),apagado:false};
    const q=row?sb.from("pcp_registros").update(novo).eq("colecao",colecao).eq("id",id).eq("apagado",false).eq("atualizado_em",row.atualizado_em):sb.from("pcp_registros").insert(novo);
    const {data,error}=await q.select("id");
    if(error)throw new Error(error.message);
    if(!data?.length)throw new Error("O.S. alterada durante a gravação. Atualize.");
    return;
  }
  const { error } = await sb.from("pcp_registros").upsert(
    { colecao, id, registro, atualizado_em: new Date().toISOString(), apagado: false },
    { onConflict: "colecao,id" },
  );
  if (error) throw new Error(error.message);
}

async function contarRegs(colecao: string): Promise<number> {
  const { count } = await sb
    .from("pcp_registros").select("id", { count: "exact", head: true })
    .eq("colecao", colecao).eq("apagado", false);
  return count ?? 0;
}

// ---------------------------------------------------------------- exportacao
/* A PORTA DE EXPORTACAO DO BACKUP (M20, M21, M29 e a linha Baixa "O.S.
   excluida pode voltar numa restauracao feita so pelo Hub", auditoria de
   11/10/2026). O painel-backup lia o PCP pelo `list`, que entrega so O.S.
   vivas: ficavam fora 1.158 de 2.228 linhas (74 lapides, 1.034 do diario, 50
   horarios de foto), as Demandas e, assim que existirem, o selo do mes, as
   regras e a comissao aprovada. Sem a lapide, uma restauracao feita so pelo
   arquivo do Hub deixava o importador recriar a O.S. excluida; sem o selo, o
   mes fechado reabria.

   Esta porta e SO DE LEITURA e SO DA MAQUINA (o x-token do backup): nenhum
   cracha de pessoa passa, nem o da gestao. Entrega TODAS as linhas de
   pcp_registros (qualquer colecao, apagada ou nao, com o `apagado` e o
   `atualizado_em` de cada uma), a tabela pcp_demandas e a configuracao.

   AS COLECOES SAEM DO BANCO, NAO DE UMA LISTA: a varredura pula de colecao em
   colecao pelo indice (a proxima maior que a atual), entao uma colecao nova
   entra sozinha. A lista abaixo so garante que as conhecidas aparecam na
   contagem mesmo vazias: o Hub confere que nenhuma sumiu da porta.

   CURSOR ESTAVEL: [fase, colecao, id] da ULTIMA linha entregue (fase "r" =
   pcp_registros, "d" = pcp_demandas, "m" = pcp_meta, cuja chave e o id),
   nunca da colecao em que o laco parou.
   Pagina que enche na fronteira entre colecoes retoma pela proxima sem pular
   nem repetir (a licao do Diamond, 25/08/2026).

   CONTAGEM: a primeira pagina traz a contagem por colecao de ANTES de ler, e
   a ultima a de DEPOIS. Nada e apagado de pcp_registros (lapide, nao sumico),
   entao o que foi exportado fica entre as duas; fora disso, ou colecao
   faltando, o Hub marca a copia como falha. */
const COLECOES_EXPORTACAO = ["os", "auditoria", "foto_evento", "performance_fechamentos",
  "performance_regras", "performance_comissao", "performance_comissao_os_versoes"];
const EXPORTACAO_PAGINA = 500; // abaixo do max_rows de 1000 do PostgREST
/* pcp_META TAMBÉM VAI (revisão da onda-w1-backup, R4, 11/10/2026). Lá mora a
   "cópia recuperável antes da primeira alteração" que o robô do ERP grava
   antes de fechar, arquivar ou marcar O.S. (carteira-auditoria:*), o cache
   mensal do ERP (entregues:*), o status da importação e a auditoria das
   entregas. Numa volta só pelo Hub, a cópia de desfazer do robô se perdia.
   FICA SEMPRE DE FORA a chave "mubisys": é onde o pcp-mubisys guarda a
   credencial do ERP (salvarConfig). Segredo não vai para cópia nenhuma; ele
   volta pela tela da integração. A fase "m" vem depois das demandas, com o
   mesmo cursor ([fase, "", chave]) e a mesma contagem antes e depois. */
const META_FORA_DA_COPIA = ["mubisys"];
const EXPORTACAO_TETO_BYTES = 4_000_000;

async function proximaColecao(depois: string): Promise<string | null> {
  let q = sb.from("pcp_registros").select("colecao").order("colecao").limit(1);
  if (depois) q = q.gt("colecao", depois);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data?.length ? String((data[0] as any).colecao) : null;
}

async function contagemExportacao() {
  const colecoes = new Set(COLECOES_EXPORTACAO);
  let n = 0;
  for (let c = await proximaColecao(""); c !== null; c = await proximaColecao(c)) {
    if (++n > 500) throw new Error("Coleções demais para exportar.");
    colecoes.add(c);
  }
  const contar = async (c: string, soApagados: boolean) => {
    let q = sb.from("pcp_registros").select("id", { count: "exact", head: true }).eq("colecao", c);
    if (soApagados) q = q.eq("apagado", true);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    if (typeof count !== "number") throw new Error("Contagem indisponível: " + c);
    return count;
  };
  const pcp_registros: Record<string, { total: number; apagados: number }> = {};
  for (const c of [...colecoes].sort()) {
    const [total, apagados] = await Promise.all([contar(c, false), contar(c, true)]);
    pcp_registros[c] = { total, apagados };
  }
  const { count, error } = await sb.from("pcp_demandas").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if (typeof count !== "number") throw new Error("Contagem indisponível: pcp_demandas");
  let qm = sb.from("pcp_meta").select("chave", { count: "exact", head: true });
  for (const c of META_FORA_DA_COPIA) qm = qm.neq("chave", c);
  const meta = await qm;
  if (meta.error) throw new Error(meta.error.message);
  if (typeof meta.count !== "number") throw new Error("Contagem indisponível: pcp_meta");
  return { pcp_registros, pcp_demandas: count, pcp_meta: meta.count };
}

// null = começo; undefined = cursor que não foi esta porta que deu.
function lerCursorExportacao(v: unknown): { fase: string; colecao: string; id: string } | null | undefined {
  if (v == null || v === "") return null;
  let a: any;
  try { a = JSON.parse(String(v)); } catch { return undefined; }
  if (!Array.isArray(a) || a.length !== 3 || a.some((x) => typeof x !== "string")) return undefined;
  const [fase, colecao, id] = a;
  if (!id || id.length > 300) return undefined;
  if (fase === "r" && colecao && colecao.length <= 100) return { fase, colecao, id };
  if ((fase === "d" || fase === "m") && colecao === "") return { fase, colecao, id };
  return undefined;
}

async function paginaExportacao(cursor: { fase: string; colecao: string; id: string } | null, limite: number) {
  const registros: any[] = [], demandas: any[] = [], meta: any[] = [];
  let ultimo = cursor, bytes = 0, cheio = false, terminou = false;
  // A primeira linha de uma página sempre entra: página nunca volta vazia no meio.
  const cabe = (linha: unknown) => {
    const t = JSON.stringify(linha).length;
    if (registros.length + demandas.length + meta.length > 0 && bytes + t > EXPORTACAO_TETO_BYTES) return false;
    bytes += t;
    return true;
  };
  let fase = cursor?.fase ?? "r";
  let colecao: string | null = cursor?.fase === "r" ? cursor.colecao : null;
  let depois = cursor?.id ?? "";
  if (fase === "r" && colecao === null) {
    colecao = await proximaColecao("");
    if (colecao === null) fase = "d";
  }
  while (fase === "r" && !cheio) {
    const falta = limite - registros.length;
    let q = sb.from("pcp_registros").select("colecao, id, registro, apagado, atualizado_em")
      .eq("colecao", colecao).order("id").limit(falta);
    if (depois) q = q.gt("id", depois);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as any[];
    for (const l of lote) {
      if (!cabe(l)) { cheio = true; break; }
      registros.push(l);
      ultimo = { fase: "r", colecao: String(colecao), id: String(l.id) };
    }
    if (cheio || registros.length >= limite) { cheio = true; break; }
    // A coleção acabou: segue para a próxima, do começo dela.
    const prox = await proximaColecao(String(colecao));
    depois = "";
    if (prox === null) fase = "d"; else colecao = prox;
  }
  if (fase === "d" && !cheio) {
    const falta = limite - registros.length - demandas.length;
    if (falta <= 0) cheio = true;
    else {
      let q = sb.from("pcp_demandas").select("id, registro, revision, mutation_id, atualizado_em").order("id").limit(falta);
      if (depois) q = q.gt("id", depois);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const lote = (data ?? []) as any[];
      for (const l of lote) {
        if (!cabe(l)) { cheio = true; break; }
        demandas.push(l);
        ultimo = { fase: "d", colecao: "", id: String(l.id) };
      }
      // As demandas acabaram: segue para o pcp_meta, do começo.
      if (!cheio && lote.length < falta) { fase = "m"; depois = ""; }
    }
  }
  if (fase === "m" && !cheio) {
    const falta = limite - registros.length - demandas.length;
    if (falta <= 0) cheio = true;
    else {
      let q = sb.from("pcp_meta").select("chave, valor, atualizado_em");
      for (const c of META_FORA_DA_COPIA) q = q.neq("chave", c);
      q = q.order("chave").limit(falta);
      if (depois) q = q.gt("chave", depois);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const lote = (data ?? []) as any[];
      for (const l of lote) {
        if (META_FORA_DA_COPIA.includes(String(l.chave))) continue;
        if (!cabe(l)) { cheio = true; break; }
        meta.push(l);
        ultimo = { fase: "m", colecao: "", id: String(l.chave) };
      }
      if (!cheio && lote.length < falta) terminou = true;
    }
  }
  return { registros, demandas, meta, terminou,
    nextCursor: terminou ? null : JSON.stringify([ultimo!.fase, ultimo!.colecao, ultimo!.id]) };
}

/* A PROVA DA ENTREGA FICA CARIMBADA NO SERVIDOR (revisão da onda-w1-backup,
   R1 e S1, 11/10/2026). A trava A2 olhava só o estado ATUAL da O.S., e
   operação e montagem com senha mudam esse estado: regravar a O.S. finalizada
   com a lista de fotos vazia, ou Reabrir (o botão da ficha não confere papel),
   e depois pedir o deletePhoto tirava a prova do bucket sem motivo e sem
   diário. Agora a prova é o que o SERVIDOR carimbou, não o que o aparelho
   manda:

   - fotosProva: os ids de foto que a O.S. citava enquanto estava finalizada
     (check-in, retorno, item, volta do carro, conferência da volta, layout,
     embarque e fotosTiradas). Só acréscimo, só do servidor: o valor que vem
     do aparelho é ignorado, e reabrir, regravar ou mandar a lista vazia não o
     apaga. Carimbado em toda gravação de O.S. cuja versão GRAVADA está
     finalizada, então as O.S. finalizadas antes desta versão ganham o carimbo
     na primeira gravação, antes de qualquer mudança passar;
   - quem não é a gestão do PCP (admin ou pcp) não tira a prova da O.S.: a foto
     carimbada que sumiu da lista volta para ela, com aviso (nada de 422, que
     prenderia a fila). A gestão tira, e o arquivo continua protegido pelo
     carimbo até o pedido de apagar com motivo. */
const FOTOS_PROVA_TETO = 500;
const idFotoProva = (x: unknown) => typeof x === "string" && x.length > 0 && x.length <= 200;
function idsDeFotoDaOS(o: any): string[] {
  if (!o || typeof o !== "object") return [];
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return [...new Set([o.layoutFotoId, o.embarqueFotoId, ...lista(o.fotosCheckinIds), ...lista(o.fotosRetornoIds),
    ...lista(o.itens).map((i: any) => i?.fotoProbId), ...lista(o.voltaEquipe?.fotos), ...lista(o.retornoConf?.fotos),
    ...lista(o.fotosTiradas)].filter(idFotoProva))] as string[];
}
function guardarFotosProva(os: any, existing: any, { gestao }: { gestao: boolean }) {
  const avisos: string[] = [];
  const prova = new Set<string>((Array.isArray(existing?.fotosProva) ? existing.fotosProva : []).filter(idFotoProva));
  if (existing?.finalizadaEm) for (const id of idsDeFotoDaOS(existing)) prova.add(id);
  if (prova.size) os.fotosProva = [...prova].slice(0, FOTOS_PROVA_TETO); else delete os.fotosProva;
  if (gestao || !prova.size || !existing) return { os, avisos };
  const voltaram = new Set<string>();
  // Mesma ordem da versão gravada; o que é novo vem depois.
  const repor = (velho: unknown, novo: unknown) => {
    const v = Array.isArray(velho) ? velho : [], n = Array.isArray(novo) ? novo : [];
    const faltam = v.filter((id) => prova.has(id) && !n.includes(id));
    if (!faltam.length) return null;
    for (const id of faltam) voltaram.add(id);
    return [...v.filter((id) => n.includes(id) || faltam.includes(id)), ...n.filter((id) => !v.includes(id))];
  };
  for (const campo of ["fotosCheckinIds", "fotosRetornoIds"]) {
    const r = repor(existing[campo], os[campo]);
    if (r) os[campo] = r;
  }
  for (const campo of ["voltaEquipe", "retornoConf"]) {
    const n = os[campo];
    if (!n || typeof n !== "object" || Array.isArray(n)) continue;
    const r = repor(existing[campo]?.fotos, n.fotos);
    if (r) os[campo] = { ...n, fotos: r };
  }
  if (Array.isArray(existing.itens) && Array.isArray(os.itens)) {
    os.itens = os.itens.map((it: any) => {
      if (!it || typeof it !== "object" || !it.uid) return it;
      const v = existing.itens.find((x: any) => x && x.uid === it.uid);
      if (!v?.fotoProbId || !prova.has(v.fotoProbId) || it.fotoProbId === v.fotoProbId) return it;
      voltaram.add(v.fotoProbId);
      return { ...it, fotoProbId: v.fotoProbId };
    });
  }
  if (voltaram.size) {
    // A foto que voltou não fica anotada como tirada: a mescla do celular a tiraria de novo.
    if (Array.isArray(os.fotosTiradas)) os.fotosTiradas = os.fotosTiradas.filter((id: unknown) => !voltaram.has(String(id)));
    const n = voltaram.size;
    avisos.push(`${n === 1 ? "Uma foto continua" : n + " fotos continuam"} na O.S.: a foto de O.S. que já foi finalizada é a prova da entrega, e só a gestão do PCP apaga, com motivo.`);
  }
  return { os, avisos };
}

/* AS O.S. QUE GUARDAM A FOTO COMO PROVA (A2, com a revisão R1/S1). Vale a O.S.
   viva que (a) tem a foto no carimbo fotosProva, ou (b) está finalizada, ou já
   foi reaberta (reabertaEm, carimbado pelo servidor), e cita a foto em
   QUALQUER campo (check-in, retorno, item, volta do carro, conferência,
   layout, embarque e fotosTiradas: a tela tira a foto da lista e anota em
   fotosTiradas ANTES de o pedido de apagar chegar, e a fila pode mandar a O.S.
   gravada antes dele). O (b) cobre a O.S. finalizada ou reaberta antes do
   carimbo existir. null = a varredura não terminou (foto preservada). */
async function osComProvaDaFoto(fileId: string): Promise<{ id: string; numero: string }[] | null> {
  const alvo = JSON.stringify(fileId), achadas: { id: string; numero: string }[] = [];
  let cursor = "";
  for (let pagina = 0; pagina < 100; pagina++) {
    let q = sb.from("pcp_registros").select("id, registro").eq("colecao", "os").eq("apagado", false).order("id").limit(200);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as any[]) {
      const o = row.registro;
      if (!o || typeof o !== "object") continue;
      const carimbada = Array.isArray(o.fotosProva) && o.fotosProva.includes(fileId);
      if (carimbada || ((o.finalizadaEm || o.reabertaEm) && JSON.stringify(o).includes(alvo)))
        achadas.push({ id: String(row.id), numero: String(o.numero ?? "") });
    }
    if (!data?.length || data.length < 200) return achadas;
    cursor = String((data[data.length - 1] as any).id);
  }
  return null;
}

// ---------------------------------------------------------------- diario
/* DIARIO DE AUDITORIA (F03, 29/09/2026): quem mudou o que, e quando. A regra
   do que entra mora em _shared/pcp-integridade.mjs (CAMPOS_AUDITADOS,
   diffAuditavel); aqui fica so a gravacao.

   SO INSERCAO, NA MESMA TABELA, COLECAO PROPRIA ('auditoria'). Nenhuma porta
   de leitura do app olha essa colecao: o list (completo e incremental), o
   getReg e as consultas da performance filtram colecao='os'. O diario so sai
   pela acao auditoriaOS, que e da gestao. Assim ele nunca desce ao aparelho
   (os 7 sistemas dividem 5 MB de localStorage) nem ao cracha sem senha.

   FALHAR AQUI NAO DERRUBA A GRAVACAO DA O.S. O diario e testemunha, nao
   porteiro: perder um check-in porque o diario nao gravou seria o pior dos
   dois mundos. A falha vira aviso no log e um contador que a acao `saude`
   mostra -- em memoria (vale ate a funcao reciclar) e, quando o banco deixa,
   em pcp_meta 'auditoria_falhas', que sobrevive ao reciclar. Log que ninguem
   abre nao e log: o contador e o que a tela de Conexoes e o vigia leem. */
const FALHAS_AUDITORIA = { total: 0, ultimaEm: "", ultimoErro: "" };
async function gravarAuditoria(registro: any): Promise<boolean> {
  try {
    const { error } = await sb.from("pcp_registros").insert({
      colecao: "auditoria", id: registro.id, registro, apagado: false, atualizado_em: registro.em || new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    await falhaAuditoria(String((e as Error)?.message ?? e), registro?.osId);
    return false;
  }
}
async function falhaAuditoria(msg: string, osId?: string) {
  const em = new Date().toISOString(), erro = msg.slice(0, 200);
  console.warn("[pcp-sync] diario de auditoria nao gravou:", osId ?? "", erro);
  FALHAS_AUDITORIA.total++; FALHAS_AUDITORIA.ultimaEm = em; FALHAS_AUDITORIA.ultimoErro = erro;
  // Melhor esforco: se o banco recusou o diario, pode recusar isto tambem.
  // Ler-somar-gravar pode perder uma conta em corrida; e aviso, nao razao.
  try {
    const antes = await getMeta("auditoria_falhas");
    await sb.from("pcp_meta").upsert(
      { chave: "auditoria_falhas", valor: { total: (Number(antes?.total) || 0) + 1, ultimaEm: em, ultimoErro: erro, osId: String(osId ?? "") }, atualizado_em: em },
      { onConflict: "chave" });
  } catch { /* o contador em memoria ja contou */ }
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
// Config com o carimbo: o cliente manda `seVersao` e, se nada mudou, recebe
// 40 bytes em vez da config inteira. Ela mudou pela ultima vez em 18/08 e era
// baixada a cada 30 s por todo aparelho.
/* PESSOA PELO ID (ordem do dono, 29/09/2026: "usar o ID em todo o sistema e
   padrao pra nao ter erro"). A O.S. nova grava o ID do RH (6 primeiros
   digitos do CPF) na equipe; a antiga guarda o nome que o PCP digitava. Esta
   porta chega a MESMA pessoa que o aparelho: fichas do RH (desligado entra
   so para dar nome ao historico, nunca para casar), vinculos salvos e lista
   de instaladores, pela regua de _shared/pcp-integridade.mjs. Uma leitura do
   RH por minuto, nao por request. */
let _fichasRH: { ate: number; fichas: any[] } | null = null;
/* CONTRATOS DE FREELANCER DO RH (F07, caminho B): o prestador que instala
   entra na régua pelo contrato, com o ID do CPF do contrato. Só os campos que
   a régua usa; o CPF inteiro fica neste servidor (juntarFreelancers). */
async function contratosFreelancerRH(comFoto = false): Promise<any[]> {
  const { data, error } = await sb.from("registros")
    .select("registro->>id, registro->>nome, registro->>apelido, registro->>cpf, registro->>funcao, registro->>situacao, registro->>contratoFim" + (comFoto ? ", registro->>exColaboradorId, registro->>fotoDataUrl" : ""))
    .eq("colecao", "freelancers").eq("apagado", false);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}
async function fichasRH(): Promise<any[]> {
  if (_fichasRH && _fichasRH.ate > Date.now()) return _fichasRH.fichas;
  const { data, error } = await sb.from("registros")
    .select("registro->>id, registro->>nome, registro->>apelido, registro->>cpf, registro->>dataDesligamento, registro->>statusId")
    .eq("colecao", "colaboradores").eq("apagado", false);
  if (error) throw new Error(error.message);
  // `ativo` com a mesma regra do elenco: ficha inativa com contrato ativo do
  // mesmo CPF cede lugar ao contrato nos dois lados (juntarFreelancers).
  const FORA = new Set(["inativo", "abandono", "externo"]);
  const brutas = ((data ?? []) as any[]).map((g) => {
    const d = String(g.cpf || "").replace(/\D/g, "");
    return { chave: String(g.id || ""), id: d.length === 11 ? d.slice(0, 6) : "", nome: String(g.nome || "").trim(),
             apelido: String(g.apelido || "").trim(), desligado: !!String(g.dataDesligamento || "").trim(),
             // A data da saída confere a divisão de O.S. antiga de quem saiu depois (F08). Não desce para aparelho nenhum.
             desligadoEm: String(g.dataDesligamento || "").trim().slice(0, 10),
             ativo: !FORA.has(String(g.statusId || "").trim()), cpf: d, statusId: String(g.statusId || "").trim() };
  }).filter((p) => p.nome);
  // Freelancer entra na conta de ambiguidade: "Lucas" com um Lucas na ficha e
  // outro no contrato não escolhe nenhum dos dois.
  const junta = juntarFreelancers(brutas, await contratosFreelancerRH(), { hoje: perfDia(new Date().toISOString()) });
  const fichas = [
    ...brutas.filter((p) => !junta.fichasFora.has(p.chave)).map(({ cpf: _cpf, statusId: _st, ...p }) => junta.repetidos.has(p.id) ? { ...p, idRepetido: true } : p),
    /* O fim do contrato e a situação dele conferem a divisão de O.S. antiga
       do freelancer cujo contrato venceu depois (F08). Ficam no servidor: a
       régua não desce para aparelho nenhum. */
    ...junta.contratos.map((c: any) => ({ chave: c.chave, id: c.id, nome: c.nome, apelido: c.apelido, desligado: c.desligado, freelancer: true,
      contratoFim: c.contratoFim, situacaoContrato: c.situacaoContrato, ...(c.idRepetido ? { idRepetido: true } : {}) })),
  ];
  _fichasRH = { ate: Date.now() + 60_000, fichas };
  return fichas;
}
async function pessoasDoPCP(config?: any) {
  const cfg = config ?? (await getCfg()) ?? {};
  return resolverPessoas({ pessoas: await fichasRH(), vinculos: cfg.vinculosRH, lista: cfg.instaladores });
}
async function getCfgComVersao(): Promise<{ config: any; versao: string }> {
  const { data } = await sb.from("pcp_config_global").select("config, atualizado_em").eq("id", true).maybeSingle();
  return { config: data?.config ?? null, versao: String(data?.atualizado_em ?? "") };
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

// Performance consulta o servidor inteiro; nunca usa a janela local de 60 dias.
function perfDia(v: any): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v); if (!Number.isFinite(+d)) return "";
  return new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
}
function perfPeriodo(body: any) {
  const de=String(body.de || ""), ate=String(body.ate || "");
  const valido=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
  if(!valido(de)||!valido(ate)||de>ate||(Date.parse(ate)-Date.parse(de))/864e5>366) throw new Error("Escolha um período válido de até um ano.");
  return {de,ate};
}
/* O FECHAMENTO É DE MÊS CALENDÁRIO (item 3 da fila de 11/10/2026). Fechar de
   01 a 19/09, de 10 a 30/09 e só o dia 15/09 dava 200 nos três e gravava três
   selos com a mesma O.S.: o dinheiro ficava protegido, mas o ranking e a Nota
   contavam em dobro. Agora o selo novo é sempre do dia 01 ao último dia do
   mês, só depois que o mês terminou (no relógio de São Paulo) e sem cruzar
   outro período já fechado. O selo antigo de período livre continua legível
   (performanceFechamentos, o ranking dos funcionários e a comissão o leem
   pelo período exato); ele só não ganha revisão nova. Em 12/10/2026 a
   produção tinha 0 fechamentos (SELECT na coleção performance_fechamentos). */
const PERF_MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const perfDiaBR = (d:string) => String(d||"").split("-").reverse().join("/");
function perfUltimoDiaDoMes(mes:string) {
  const [a,m]=mes.split("-").map(Number);
  return mes+"-"+String(new Date(Date.UTC(a,m,0)).getUTCDate()).padStart(2,"0");
}
const perfEhMesCalendario = (p:{de:string,ate:string}) => /^\d{4}-\d{2}-01$/.test(p.de) && p.ate===perfUltimoDiaDoMes(p.de.slice(0,7));
const perfMesTxt = (mes:string) => PERF_MESES[Number(mes.slice(5,7))-1]+" de "+mes.slice(0,4);
function perfDiaSeguinte(d:string) { return new Date(Date.parse(d+"T12:00:00Z")+864e5).toISOString().slice(0,10); }
/* OS PERÍODOS JÁ FECHADOS, um por período (a revisão conta uma vez), com a
   última revisão. Uma leitura só de colunas pequenas. Serve à trava do Fechar
   (sobreposição), à conferência por entrega (M7), ao aviso do mês sem
   fechamento (item 11) e à tela do mês fechado (M8). */
async function perfPeriodosFechados() {
  const {data,error}=await sb.from("pcp_registros").select("id, de:registro->>de, ate:registro->>ate, revisao:registro->revisao, fechadoEm:registro->>fechadoEm")
    .eq("colecao","performance_fechamentos").eq("apagado",false).limit(1000);
  if(error)throw new Error(error.message);
  if((data||[]).length>=1000)throw new Error("Limite de fechamentos atingido na leitura.");
  const dataOk=(d:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(d??""));
  const porPeriodo=new Map<string,any>();
  for(const f of (data??[]) as any[]){
    if(!dataOk(f.de)||!dataOk(f.ate)||f.de>f.ate)continue;
    const k=f.de+":"+f.ate, atual=porPeriodo.get(k)||{de:String(f.de),ate:String(f.ate),revisoes:0,ultimaRevisao:0,ultimoEm:"",ultimoId:""};
    atual.revisoes++;
    const rev=Number(f.revisao)||0;
    // ultimoId: a linha da revisão que vale, para a trava da O.S. já selada inteira (D1) ler só ela.
    if(rev>=atual.ultimaRevisao){atual.ultimaRevisao=rev;atual.ultimoEm=String(f.fechadoEm||"");atual.ultimoId=String(f.id||"");}
    porPeriodo.set(k,atual);
  }
  return [...porPeriodo.values()].sort((a,b)=>a.de.localeCompare(b.de)||a.ate.localeCompare(b.ate));
}
const perfPeriodoDoDia = (fechados:any[], dia:string) => (fechados||[]).find((f:any)=>dia>=f.de&&dia<=f.ate)||null;
/* O PERÍODO FECHADO EM QUE A O.S. JÁ ENTROU INTEIRA (D1 da revisão da onda
   fechamento), com o dia em que ela contou. ONDA VOLTA (12/10/2026): a v167
   achava o dia pelo estado de HOJE da O.S. (o dia do lançamento ou da
   finalização) e o Reabrir apaga o finalizadaEm: a O.S. selada inteira em
   novembro, reaberta em dezembro, recebia a primeira conferência por item com
   dia de dezembro e o mesmo valor contava nos dois meses. Agora a trava
   procura o id da O.S. nos fechamentos que valem (a última revisão de cada
   período fechado), sem depender do estado de hoje: a O.S. está inteira no
   selo quando um registro dele tem o id dela (a entrega por item tem o id
   "<O.S.>::entrega:<id>" e não conta aqui). Só a linha da última revisão de
   cada período é lida, e só a lista de registros dela. */
async function perfInteiraFechada(osId:string, fechados:any[]) {
  const vale=(fechados||[]).filter((f:any)=>f&&f.ultimoId);
  if(!osId||!vale.length)return null;
  const porId=new Map<string,any[]>();
  for(let i=0;i<vale.length;i+=100){
    const {data,error}=await sb.from("pcp_registros").select("id, registros:registro->registros").eq("colecao","performance_fechamentos").eq("apagado",false).in("id",vale.slice(i,i+100).map((f:any)=>f.ultimoId));
    if(error)throw new Error(error.message);
    for(const row of (data||[]) as any[])porId.set(String(row.id),Array.isArray(row.registros)?row.registros:[]);
  }
  for(const f of vale){
    const r=(porId.get(f.ultimoId)||[]).find((x:any)=>String(x?.id??"")===osId);
    if(r)return {dia:/^\d{4}-\d{2}-\d{2}$/.test(String(r.dia||""))?String(r.dia):"",de:f.de,ate:f.ate,ultimaRevisao:f.ultimaRevisao};
  }
  return null;
}
/* A FRASE DO MÊS FECHADO NA CONFERÊNCIA (revisão da onda fechamento, U2): não
   empurra a pessoa a trocar a data para um mês aberto (a entrega de setembro
   contaria em outubro). O ajuste de mês fechado depende da pergunta 3 da fila
   do dono (P-006 a P-010) e ainda não existe. */
const PERF_AJUSTE_FECHADO = "o ajuste de mês fechado ainda não existe; fale com a gestão.";
// A confirmação escrita do Fechar com a cobertura do valor abaixo de 50% (item 2): a mesma frase da tela.
const PERF_FRASE_COBERTURA = "fechar com cobertura baixa";
/* A BASE QUE MUDA DURANTE A CONSULTA É 409, NÃO 500 (item 14). A tela trata o
   409 como "tente de novo" e o diário de erros não se enche de falha falsa. */
const perfBaseMudou = () => Object.assign(new Error("A base mudou durante a consulta. Atualize para conferir novamente."),{baseMudou:true});
/* OS DEMONSTRATIVOS QUE COBREM O RECORTE (revisão da onda w3, R1). A aba
   Perdas por retrabalho pode estar em qualquer recorte (quinzena, últimos 30
   dias), e o demonstrativo da comissão é de um período fechado, quase sempre o
   mês. Pela lista do período exato, a O.S. que o demonstrativo do mês já
   julgou aparecia "a decidir" em todo outro recorte. Vão junto, resumidas, as
   revisões dos OUTROS períodos que cobrem algum dia do recorte: a última de
   cada um e, se ela for uma compensação, também a última que não é (a tela
   escolhe, perdas.js). Só o que a aba lê: decisões, montagem interna e as
   linhas sem os pagamentos; a mesma regra de acesso da lista (admin e pcp). */
function perfComissaoCobrem(todas:any[], periodo:{de:string,ate:string}) {
  const grupos=new Map<string,any[]>();
  for(const r of todas||[]){
    if(!r||typeof r!=="object"||typeof r.de!=="string"||typeof r.ate!=="string")continue;
    if((r.de===periodo.de&&r.ate===periodo.ate)||r.de>periodo.ate||r.ate<periodo.de)continue;
    const k=r.de+":"+r.ate;grupos.set(k,[...(grupos.get(k)||[]),r]);
  }
  const resumo=(r:any)=>{
    const ap=r.apuracao||{},ent=r.entrada||{},entregas:any={};
    for(const [id,e] of Object.entries(ent.entregas||{})){
      const i=(e as any)?.interna;
      if(i&&typeof i==="object")entregas[id]={interna:{situacao:i.situacao,partes:Array.isArray(i.partes)?i.partes.map((p:any)=>({pessoaId:p?.pessoaId,cota:p?.cota})):[]}};
    }
    return {de:r.de,ate:r.ate,id:r.id,revisao:r.revisao,tipo:r.tipo,em:r.em,fechamentoId:r.fechamentoId,resumo:true,entrada:{decisoes:ent.decisoes||{},entregas},
      apuracao:{compensacaoDe:ap.compensacaoDe||null,config:{modo:ap.config?.modo},linhas:(Array.isArray(ap.linhas)?ap.linhas:[]).map((l:any)=>({id:l.id,osId:l.osId,numero:l.numero,dia:l.dia,
        decisao:l.decisao,pendencias:l.pendencias,baseLiquidaCentavos:l.baseLiquidaCentavos,comissaoCentavos:l.comissaoCentavos,
        perda:l.perda,etapaOrigem:l.etapaOrigem,comissaoPerdidaCentavos:l.comissaoPerdidaCentavos,origemADefinir:l.origemADefinir}))}};
  };
  const out:any[]=[];
  for(const rs of grupos.values()){
    const ordem=rs.slice().sort((a:any,b:any)=>(Number(b.revisao)||0)-(Number(a.revisao)||0));
    const topo=ordem[0];out.push(resumo(topo));
    if(topo.apuracao?.compensacaoDe){const base=ordem.find((r:any)=>!r.apuracao?.compensacaoDe);if(base)out.push(resumo(base));}
  }
  return out;
}
async function perfHash(v:any) {
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
// A impressão digital de um texto (o CSV aprovado, M21): sha256 dos bytes UTF-8, em hexadecimal.
async function sha256Texto(t:string) {
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
/* O CORTE DO LANÇAMENTO MANUAL (decisão do dono, 14/09/2026): baixa do ERP
   anterior a este dia conta como entregue sem lançamento; a partir dele,
   espera o lançamento à mão. Constante ÚNICA deste lado; o aparelho tem a
   dele em casa.js (CORTE_LANCAMENTO_MANUAL), e tests/cancelamento-f16.test.cjs
   confere que as duas dizem o mesmo dia (F16). */
const CORTE_LANCAMENTO_MANUAL = "2026-09-15";
// A conferência e a apuração por item precisam da mesma base líquida.
// Não substituímos um líquido ausente pela soma bruta dos produtos.
function valorConferencia(os:any, erp:any[]) {
  const numero=(v:any)=>v==null||v===""?NaN:Number(typeof v==="string" && v.includes(",")?v.replace(/\./g,"").replace(",","."):v);
  let valor=numero(os.valorTotal);
  const mudou=os.erpAlteracoes?.some((h:any)=>h.campos?.some((x:any)=>x.campo==="valorTotal"));
  if(!mudou && erp.length===1 && Number.isFinite(numero(erp[0].valor))) valor=numero(erp[0].valor);
  return Number.isFinite(valor) && valor>=0 ? valor : null;
}
/* `estrito` é a trava de "a base mudou durante a consulta": vale para a
   apuração, que sela um hash. O relatório de entregas só lê; com a equipe
   sincronizando o dia inteiro, ele falhava sem motivo.
   A RÉGUA DAS PERDAS (D-010 e D-011, _shared/pcp-regras.mjs): a apuração sai
   com a régua de hoje (REGRAS.REGUA_PERDAS); cada entrega com retrabalho, no
   programa, leva a etapa de origem (vazia: a definir) e a de instalação leva
   perda:'retrabalho_instalacao' (REGRAS.perdaNaApuracao, a mesma conta da
   prévia do aparelho), e então o id da régua entra no conteúdo (regraPerdas)
   e no hash. Quem decide
   a régua é o servidor, nunca o corpo do pedido: o recálculo de um selo
   (perfParametrosDoSelo) usa a do selo, e o selo de antes da régua (sem
   regraPerdas) é recalculado sem ela, com o hash de sempre. */
async function perfFonte(body:any, {estrito=true, reguaPerdas=REGRAS.REGUA_PERDAS.id, regraVolta=REGRA_VOLTA}:{estrito?:boolean,reguaPerdas?:string,regraVolta?:string}={}) {
  const regua=reguaPerdas?REGRAS.reguaPorId(reguaPerdas):null;
  if(reguaPerdas&&!regua)throw new Error("A régua das perdas deste fechamento não existe neste servidor. Atualize antes de conferir.");
  const periodo=perfPeriodo(body), inicio=new Date().toISOString();
  const cfgAntes=await getCfgComVersao();
  const lista:any[]=[], aLancar:any[]=[]; let after="", terminou=false;
  for(let pagina=0;pagina<100;pagina++) {
    let q=sb.from("pcp_registros").select("id,registro,atualizado_em").eq("colecao","os").eq("apagado",false).order("id").limit(500);
    if(after) q=q.gt("id",after);
    const {data,error}=await q; if(error) throw new Error(error.message);
    const rows=data || [];
    for(const row of rows) {
      const o=row.registro, fim=perfDia(o?.finalizadaEm);
      if(["baixa_administrativa","retirada"].includes(o?.conferenciaERP?.classificacao)) continue;
      if((!fim && !o?.conferenciasEntrega?.length) || o?.tipo==="interno") continue;
      /* A O.S. CANCELADA (F16), no ERP ou à mão pela gestão, não é entrega:
         sai da base. O hash do período aberto muda; a revisão selada é lida
         do selo e fica como foi.
         A CANCELADA DEPOIS DE TER PARTE ENTREGUE (item 4 da fila de
         11/10/2026): o cancelamento cancela o SALDO; a parte que a gestão já
         conferiu (conferenciasEntrega) continua contando pela parte entregue,
         no ranking e na comissão. Conferir de novo depois do cancelamento
         continua recusado (D-009). A cancelada sem conferência sai, como antes. */
      if(cancelada(o) && !o?.conferenciasEntrega?.length) continue;
      const erp=o.baixaAutoERP?.em===o.finalizadaEm || /^Mubisys\b/i.test(o.finalizadoPor || "");
      /* A BAIXA DO ERP A LANÇAR fica fora da base (baixa não prova entrega
         física, D-007), mas entra na COBERTURA do período (item 2): quem
         fecha vê quantas e quanto ficam de fora. */
      if(erp && !o.entregaLancada && !o.conferenciasEntrega?.length && fim>=CORTE_LANCAMENTO_MANUAL){if(fim>=periodo.de && fim<=periodo.ate)aLancar.push({...o,id:row.id});continue;}
      const dia=(o.entregaLancada && perfDia(o.entregaLancada.data)) || fim;
      if(o.conferenciasEntrega?.length) {
        for(const e of o.conferenciasEntrega) if(e.dia>=periodo.de && e.dia<=periodo.ate) lista.push({...o,id:row.id+"::entrega:"+e.id,_osId:row.id,_dia:e.dia,_conferencia:e});
      } else if(dia>=periodo.de && dia<=periodo.ate) lista.push({...o,id:row.id,_dia:dia});
    }
    if(rows.length<500){terminou=true;break;}
    const proximo=String(rows[rows.length-1].id);if(proximo<=after)throw new Error("Paginação inconsistente. Refaça a consulta.");after=proximo;
  }
  if(!terminou)throw new Error("Consulta excedeu o limite; nenhum fechamento foi criado.");
  const valores:Record<string,number>={};
  const valoresItens:Record<string,any[]>={};
  const nums=[...new Set([...lista,...aLancar].map(o=>String(o.numero || "").trim()).filter(Boolean))];
  for(let i=0;i<nums.length;i+=300){
    const {data,error}=await sb.from("painel_ordens").select("numero,valor").in("numero",nums.slice(i,i+300));
    if(error)throw new Error(error.message);
    for(const r of data || []) {
      (valoresItens[String(r.numero)] ||= []).push(r);
      if(r.valor!==null && r.valor!=="" && Number.isFinite(Number(r.valor)))valores[String(r.numero)]=Number(r.valor);
    }
  }
  const cfgDepois=await getCfgComVersao();
  const {data:mudancas,error:erroMudancas}=await sb.from("pcp_registros").select("id").eq("colecao","os").gte("atualizado_em",inicio).limit(1);
  if(erroMudancas)throw new Error(erroMudancas.message);
  if(estrito && (cfgAntes.versao!==cfgDepois.versao || mudancas?.length))throw perfBaseMudou();
  const participacoes=cfgAntes.config?.performancePCP?.participacoes || [];
  // A equipe pela PESSOA (ID): a mesma régua do aparelho (OPERACAO.equipe).
  const pessoasPerf=await pessoasDoPCP(cfgAntes.config);
  const equipesPerf:any[]=Array.isArray(cfgAntes.config?.performancePCP?.equipes)?cfgAntes.config.performancePCP.equipes:[];
  const num=(v:any)=>v==null||v===""?NaN:typeof v==="number"?v:Number(String(v).includes(",")?String(v).replace(/\./g,"").replace(",","."):v);
  /* A régua da volta só entra no conteúdo quando muda alguma entrega (como a
     régua das perdas): o período em que as duas réguas dizem o mesmo fica com
     o conteúdo e o hash de antes. */
  let voltaMudou=false;
  const registros=lista.map(o=>{
    const p=participacoes.find((x:any)=>x.id===o.id);
    let valor=num(o.valorTotal), origem="O.S. do PCP";
    const avisoValor=valoresItens[String(o.numero)]?.length>1?"Há mais de um valor do ERP para este número. Confira a origem; foi preservado o líquido da O.S. no PCP.":"";
    const mudou=o.erpAlteracoes?.some((h:any)=>h.campos?.some((x:any)=>x.campo==="valorTotal"));
    if(!mudou && valoresItens[String(o.numero)]?.length===1 && Number.isFinite(valores[String(o.numero)])){valor=valores[String(o.numero)];origem="Painel / ERP";}
    // Sem líquido não somar somente os produtos que têm preço: omite itens e descontos.
    if(!Number.isFinite(valor)||valor<0){valor=null;origem="Sem valor";}
    let dadosEntrega:any={}, voltaDaEntrega=true;
    /* A VOLTA DO CARRO (onda volta, 12/10/2026). Régua nova (volta-1): a
       volta de cada entrega é a da viagem dela (CONFERENCIA_ENTREGA, as
       viagens que o servidor guarda em `voltas`; sem elas, a de hoje). Régua
       da v167: os campos da O.S., pela fotografia de antes da primeira
       mudança da viagem (voltaLegado) quando ela existe, e as contas de
       sempre. As duas são feitas; a nova vale quando a apuração é nova. */
    const oVolta=comVoltaLegado(o);
    let viagem:any=null;
    const subtotais=(Array.isArray(o.itens)?o.itens:[]).map((it:any)=>num(it.subtotal));
    const bruto=subtotais.length&&subtotais.every((v:number)=>Number.isFinite(v)&&v>=0)?subtotais.reduce((a:number,b:number)=>a+b,0):null;
    let valorBrutoCentavos=bruto===null?null:Math.round(bruto*100);
    if(o._conferencia) {
      /* A O.S. COMO ESTAVA NO FIM DO PERÍODO (revisão da onda fechamento, D2):
         o estado e o saldo das entregas do período saem só do que aconteceu
         até o último dia dele (CONFERENCIA_ENTREGA.noFimDoDia, a mesma régua
         nas duas cópias do motor). A parcial de novembro fechado continua
         parcial quando o resto chega em dezembro, e o recálculo do selo
         (Aprovar e Exportar) confere. O valor de cada entrega não muda. */
      const oFim=CONFERENCIA_ENTREGA.noFimDoDia(o,periodo.ate);
      const a=CONFERENCIA_ENTREGA.apurar(oFim,valorConferencia(o,valoresItens[String(o.numero)] || [])), e=a.entregas.find((x:any)=>x.id===o._conferencia.id);
      if(bruto!==null){const bruta=CONFERENCIA_ENTREGA.apurar(oFim,bruto).entregas.find((x:any)=>x.id===o._conferencia.id);valorBrutoCentavos=bruta?.valor??null;}
      const indiceEntrega=a.entregas.findIndex((x:any)=>x.id===o._conferencia.id);
      const baseAnteriorCentavos=indiceEntrega>=0&&a.entregas.slice(0,indiceEntrega).every((x:any)=>x.valor!==null)?a.entregas.slice(0,indiceEntrega).reduce((s:number,x:any)=>s+x.valor,0):null;
      dadosEntrega={estadoEntrega:CONFERENCIA_ENTREGA.estado(oFim,valorConferencia(o,valoresItens[String(o.numero)] || [])),baseAnteriorCentavos,osId:o._osId,entregaId:o._conferencia.id,itensEntrega:e?.itens || [],saldoItens:a.saldoItens?.length || 0,erroConferencia:a.erro || "",fracaoOS:a.total>0 && e?.valor!=null?e.valor/a.total:0};
      const idsEntrega=finaisAlocacao(o._conferencia.alocacao).map((m:any)=>m.pessoaId).sort();
      const idsOperacionais=(oVolta.equipe || []).map((n:any)=>pessoasPerf.chave(String(n))).sort();
      const diaRetorno=perfDia(oVolta.retornoEm) || perfDia(oVolta.entregaLancada?.data) || perfDia(oVolta.finalizadaEm);
      voltaDaEntrega=JSON.stringify(idsEntrega)===JSON.stringify(idsOperacionais) && diaRetorno===o._dia;
      /* M11 da auditoria de 11/10/2026 (régua nova): a volta do dia da
         entrega, com a equipe contida uma na outra (a conferência que pôs
         alguém a mais ou a menos não descarta a volta). */
      if(regraVolta)viagem=CONFERENCIA_ENTREGA.voltaDaEntrega(o,o._dia,a.erro?[]:idsEntrega,(n:any)=>pessoasPerf.chave(String(n)));
      valor=e?.valor==null?null:e.valor/100; origem="Itens desta entrega · líquido proporcional";
      o={...o,alocacao:a.erro?null:o._conferencia.alocacao,equipe:a.erro?[]:finaisAlocacao(o._conferencia.alocacao).map((m:any)=>m.pessoaId),entregaLancada:{data:o._dia}};
    }
    /* "Lucas" antigo e o ID dele na mesma O.S. são um membro só. O membro não
       confirmado leva o ID como chave e o nome de exibição; nome antigo sem
       ficha segue como era (chave = o próprio nome). */
    const vistosEq=new Set<string>(), nomes:string[]=[];
    for(const n of (Array.isArray(o.equipe)?o.equipe:[])){const x=String(n??"").trim();if(!x)continue;const k=pessoasPerf.chave(x);if(vistosEq.has(k))continue;vistosEq.add(k);nomes.push(x);}
    /* A DIVISÃO DENTRO DA O.S. (F08) vem primeiro: confirmada quando é
       válida, não está desatualizada e tem a mesma gente de os.equipe
       (alocacaoConfirmada, a mesma régua do aparelho). O percentual de cada
       pessoa é o FINAL do motor (quem ficou com 0% não entra). Divisão
       desatualizada ou inválida: a sugestão sai de os.equipe e nunca conta
       como confirmada, nem com participação antiga. Sem divisão na O.S., a
       participação antiga do blob continua valendo como era. */
    const aloc=o.alocacao&&typeof o.alocacao==="object"&&!Array.isArray(o.alocacao)?o.alocacao:null;
    const alocOk=!!aloc&&alocacaoConfirmada(o);
    /* A participação antiga só vale na O.S. que nunca teve divisão, ou
       confirmada depois da última mudança dela (participacaoVale): a divisão
       limpa de propósito não ressuscita a conferência velha do blob. */
    const pAntiga=participacaoVale(o,p);
    const sugestao=()=>nomes.map((n,i)=>({chave:pessoasPerf.idDe(n)||n,nome:pessoasPerf.nome(n),percentual:(Math.floor(10000/nomes.length)+(i<10000%nomes.length?1:0))/100}));
    const finais=alocOk?finaisAlocacao(aloc):[];
    const membros=alocOk
      ? finais.filter((f:any)=>f.cota>0).map((f:any)=>({chave:f.pessoaId,nome:pessoasPerf.nome(f.pessoaId),percentual:f.cota/100}))
      : pAntiga?.membros || sugestao();
    /* AS EQUIPES DA DIVISÃO (F11), pela régua única (equipesDaDivisao, a
       mesma do aparelho). Divisão de UMA equipe: ela é a equipe do registro,
       como sempre foi, e o registro fica igual ao de antes (o hash da
       performance-3 também). Divisão de DUAS OU MAIS, mesmo com uma em 0%: as
       equipes com parte vão em `grupos`, cada uma com a cota dela, e o
       registro fica sem equipe única; o valor de cada equipe no ranking é a
       soma das cotas, nunca a O.S. inteira nas duas. Só nesse período o hash
       muda (o campo novo). */
    const divisao=alocOk?equipesDaDivisao(aloc,finais,equipesPerf):null;
    const eqAloc=divisao?divisao.unica:null;
    const confirmado=alocOk
      ? !validarPerformance({equipes:[],participacoes:[{id:o.id,membros}]})
      : !!pAntiga && !validarPerformance({equipes:pAntiga.equipeId?[{id:pAntiga.equipeId,nome:pAntiga.equipeNome || "Equipe",emblema:pAntiga.emblema || "🤝",membros}]:[],participacoes:[pAntiga]});
    const fonte=alocOk?"alocacao":pAntiga?"participacao":aloc?(aloc.conferirRH===true?"alocacao-conferir-rh":"alocacao-desatualizada"):"sugestao";
    /* A CONFERÊNCIA DA VOLTA (carro e equipamentos) entra na base para pesar
       na avaliação individual. Só "sim"/"nao" passam; o resto é "não
       conferido" (null) e não pesa contra ninguém. */
    const snv=(v:any)=>v==="sim"||v===true?"sim":(v==="nao"||v===false?"nao":null);
    /* 24/09/2026: "arrumado" (conta junto com "limpo") e "sem avaria" (não
       conta, mas a tela mostra) vieram com a fila da volta do carro. */
    const PERGUNTAS=["carroLimpo","carroArrumado","equipamentosOk","semAvaria"];
    const confDe=(rc:any)=>rc&&typeof rc==="object"&&PERGUNTAS.some(k=>snv(rc[k]))?{...Object.fromEntries(PERGUNTAS.map(k=>[k,snv(rc[k])])),por:String(rc.por||"").slice(0,120),porId:String(rc.porId||"").slice(0,120),em:String(rc.em||"").slice(0,40)}:null;
    /* performance-3: A VOLTA DO CARRO É UMA POR VIAGEM, não uma por O.S. A
       fila (OPERACAO.voltasDoCarro) agrupa por dia + carro + equipe e confere
       uma vez; a nota contava cada O.S. da viagem, e três serviços pequenos no
       mesmo carro sujo pesavam triplo. `volta` é a mesma chave da fila (dia da
       volta como OPERACAO.diaDaVolta), e `voltou` é o mesmo filtro: baixa do
       ERP sem retorno nem lançamento não prova viagem e não entra na conta do
       carro (a fila nunca a mostra para conferir). */
    const norm=(x:any)=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
    /* A RÉGUA DA v167. A O.S. da volta é a fotografia (oVolta) com as mesmas
       trocas que a entrega por item faz acima (a equipe e o lançamento dela);
       sem fotografia, é a própria O.S. e tudo sai como antes. */
    const vo=o._conferencia?{...oVolta,alocacao:o.alocacao,equipe:o.equipe,entregaLancada:o.entregaLancada}:oVolta;
    // Nomes da volta: os da entrega (por item) ou os da fotografia (O.S. inteira).
    const nomesVolta:string[]=[];
    if(o._conferencia)nomesVolta.push(...nomes);
    else{const vistos=new Set<string>();for(const n of (Array.isArray(vo.equipe)?vo.equipe:[])){const x=String(n??"").trim();if(!x)continue;const k=pessoasPerf.chave(x);if(vistos.has(k))continue;vistos.add(k);nomesVolta.push(x);}}
    const baixaV167=vo.baixaAutoERP?.em===vo.finalizadaEm || /^Mubisys\b/i.test(vo.finalizadoPor || "");
    /* SEM CARRO ("Instalação interna", 29/09/2026): a equipe foi sem carro, então
       não há volta do carro para conferir nem para pesar na nota. O mesmo nome
       de OPERACAO.SEM_CARRO na tela. */
    const semCarroV167=norm(vo.veiculo)==="instalacao interna";
    const diaVoltaV167=perfDia(vo.retornoEm) || (vo.horaRetorno ? (perfDia(vo.saidaEm) || perfDia(vo.instalacao?.data)) : "") || (vo.entregaLancada ? perfDia(vo.entregaLancada.data) : "") || perfDia(vo.finalizadaEm);
    const daV167={retornoConf:confDe(voltaDaEntrega?vo.retornoConf:null),
      voltou:voltaDaEntrega && nomesVolta.length>0 && !semCarroV167 && !!(vo.retornoEm || vo.horaRetorno || !baixaV167 || vo.entregaLancada),
      volta:[diaVoltaV167,norm(vo.veiculo),nomesVolta.map((n:string)=>pessoasPerf.chave(n)).sort().join("+")].join("|")};
    let daVolta=daV167;
    if(regraVolta){
      /* A RÉGUA NOVA (volta-1): a entrega por item volta só com a viagem do
         dia dela; a O.S. inteira, pelo filtro de sempre (o mesmo de
         OPERACAO.voltou), com a conferência da viagem de hoje. A chave é a da
         viagem: dia, carro (pelo id do Ativos quando a O.S. o tem, item 16) e
         a equipe da viagem. */
      if(!o._conferencia)viagem=CONFERENCIA_ENTREGA.voltaDaOS(o);
      const baixaERP=o.baixaAutoERP?.em===o.finalizadaEm || /^Mubisys\b/i.test(o.finalizadoPor || "");
      const nova={retornoConf:confDe(viagem?.retornoConf),
        voltou:o._conferencia
          ? !!viagem && nomes.length>0 && !CONFERENCIA_ENTREGA.semCarroV(viagem)
          : nomes.length>0 && !CONFERENCIA_ENTREGA.semCarroV(o) && !!(o.retornoEm || o.horaRetorno || !baixaERP || o.entregaLancada),
        volta:viagem?CONFERENCIA_ENTREGA.chaveDaViagem(viagem,(n:any)=>pessoasPerf.chave(String(n))):""};
      if(canon(nova)!==canon(daV167))voltaMudou=true;
      daVolta=nova;
    }
    const {retornoConf,voltou,volta}=daVolta;
    const quem=alocOk?{equipeId:eqAloc?eqAloc.equipeId:"",equipeNome:eqAloc?eqAloc.equipeNome:"",emblema:eqAloc?eqAloc.emblema:"🤝",obs:"",por:String(aloc.por||""),em:String(aloc.em||"")}
      :{equipeId:pAntiga?.equipeId||"",equipeNome:pAntiga?.equipeNome||"",emblema:pAntiga?.emblema||"🤝",obs:pAntiga?.obs||"",por:pAntiga?.por||"",em:pAntiga?.em||""};
    /* A EQUIPE SUGERIDA (F11) vai só na entrega NÃO confirmada, pela régua
       única (sugestaoApurada, a mesma do aparelho): com divisão na O.S.
       (desatualizada, esperando o RH ou inválida), a equipe que a própria
       divisão escolheu, e duas ou mais em `grupos`; sem divisão, a única
       equipe ativa com exatamente a mesma gente. Entrega sem gente fica sem
       sugestão. Nunca confirma nem entra no valor confirmado. Entrega não
       confirmada não é selada (o fechamento exige todas confirmadas), então
       a sugestão nunca entra num fechamento. */
    const idMembro=(m:any)=>idDoMembro(m,pessoasPerf);
    const camposEquipe=confirmado
      ? (divisao&&divisao.grupos?{grupos:divisao.grupos}:{})
      : sugestaoApurada(membros,aloc,aloc?finaisAlocacao(aloc):[],equipesPerf,idMembro);
    return {id:o.id,...dadosEntrega,...(valorBrutoCentavos!==null&&valor!==null?{valorBrutoCentavos,descontoCentavos:valorBrutoCentavos-Math.round(valor*100)}:{}),numero:String(o.numero||""),cliente:String(o.cliente||""),dia:o._dia,valor,origemValor:valor===null?"Sem valor":origem,...(avisoValor?{avisoValor}:{}),membros,confirmado,fonte,...quem,retrabalho:!!o.retrabalho,...(regua?REGRAS.perdaNaApuracao(o,o._dia,regua):{}),retornoConf,voltou,volta,...camposEquipe};
  });
  /* performance-2: cada registro leva a conferência da volta, e a apuração
     leva os PESOS DA NOTA em vigor. Eles entram no hash: quem fecha sela os
     pesos que viu (trocá-los entre consultar e fechar dá 409), e uma revisão
     fechada não muda de ordem quando a gestão mexe nos pesos depois. */
  const pesosCfg=cfgAntes.config?.performancePCP?.criterios;
  const criterios=pesosCfg && !validarPerformance({equipes:[],participacoes:[],criterios:pesosCfg})
    ? {producao:pesosCfg.producao,limpeza:pesosCfg.limpeza,equipamentos:pesosCfg.equipamentos}
    : {producao:60,limpeza:20,equipamentos:20};
  // A régua monetária entra no hash e na revisão. Clientes antigos mantêm
  // sua régua explícita; uma revisão antiga nunca é reinterpretada pela tela.
  /* O id da régua entra no conteúdo (e no hash) só quando ela julgou alguma
     entrega (alguma com retrabalho, no programa): o período sem retrabalho
     fica com o conteúdo e o hash de antes da régua, e o selo antigo confere
     igual. Sem entrega julgada, a régua não muda nada na comissão. */
  const julgou=!!regua&&registros.some((r:any)=>Object.prototype.hasOwnProperty.call(r,"etapaOrigem"));
  /* A régua da volta (onda volta) entra no conteúdo e no hash só quando
     muda alguma entrega: o selo diz que foi feito com a volta de cada viagem,
     e o recálculo dele usa a mesma régua; o selo sem a marca (o da v167 e o
     período em que as duas réguas dizem o mesmo) recalcula pela de antes,
     que lê a fotografia guardada na primeira mudança da viagem. */
  const conteudo={periodo,regra:"performance-3",...(body.notaPorValor===true?{regraNota:REGRA_NOTA_VALOR}:{}),...(julgou?{regraPerdas:regua.id}:{}),...(voltaMudou?{regraVolta}:{}),criterios,registros};
  /* A COBERTURA DO PERÍODO (itens 2 e 29 da fila de 11/10/2026), FORA do
     conteúdo e do hash: o que entrou na base e o que ficou de fora (as baixas
     do ERP a lançar), em centavos. Vai no selo como ele foi visto no
     fechamento; recalcular o selo não a compara. */
  const centavosDe=(o:any)=>{
    const lista=valoresItens[String(o.numero)]||[];
    let v=num(o.valorTotal);
    const mudou=o.erpAlteracoes?.some((h:any)=>h.campos?.some((x:any)=>x.campo==="valorTotal"));
    if(!mudou && lista.length===1 && Number.isFinite(valores[String(o.numero)]))v=valores[String(o.numero)];
    return Number.isFinite(v)&&v>=0?Math.round(v*100):null;
  };
  const baseConhecida=registros.filter((r:any)=>r.valor!==null&&Number.isFinite(r.valor));
  const entregasCentavos=baseConhecida.reduce((s:number,r:any)=>s+Math.round(r.valor*100),0);
  const foraCentavos=aLancar.map(centavosDe);
  const aLancarCentavos=foraCentavos.reduce((s:number,c:any)=>s+(c??0),0);
  const totalCentavos=entregasCentavos+aLancarCentavos;
  const pctValor=totalCentavos>0?Math.floor(100*entregasCentavos/totalCentavos):(aLancar.length?0:100);
  const cobertura={entregas:registros.length,entregasCentavos,entregasSemValor:registros.length-baseConhecida.length,
    aLancar:aLancar.length,aLancarCentavos,aLancarSemValor:foraCentavos.filter((c:any)=>c===null).length,
    aLancarNumeros:[...new Set(aLancar.map((o:any)=>String(o.numero||"").trim()).filter(Boolean))].sort().slice(0,100),
    pctValor,baixa:registros.length+aLancar.length>0&&pctValor<50};
  return {...conteudo,hash:await perfHash(conteudo),consultadoEm:new Date().toISOString(),completo:true,fonte:"Todas as instalações registradas no PCP no período; não certifica serviços ausentes do ERP.",cobertura};
}
/* A RÉGUA DO SELO (A1, auditoria da v164, 11/10/2026). A tela fecha com a
   nota por valor (performance.js manda notaPorValor:true na apuração e no
   fechamento) e a marca entra no hash como regraNota. Quem recalcula para
   conferir o selo (Aprovar e Exportar a comissão) chamava perfFonte(body), e o
   corpo desses pedidos não traz a marca: o hash nunca batia e a resposta era
   sempre 409 "A fonte mudou depois do fechamento". Os parâmetros do recálculo
   saem do PRÓPRIO selo, nunca do corpo do pedido: selo com 'nota-valor-1'
   recalcula com a nota por valor; selo sem regraNota (performance-3 antigo)
   recalcula como sempre; régua que este servidor não conhece fica sem a marca,
   o hash não bate e continua 409 (nunca vira aceite). Mudança real na fonte
   segue mudando o hash. */
const REGRA_NOTA_VALOR = "nota-valor-1";
// A volta de cada viagem (onda volta, 12/10/2026).
const REGRA_VOLTA = "volta-1";
function perfParametrosDoSelo(selo:any, periodo:any) {
  return {de:periodo.de, ate:periodo.ate, ...(selo?.regraNota===REGRA_NOTA_VALOR?{notaPorValor:true}:{})};
}
/* A RÉGUA DAS PERDAS DO SELO (D-010): a que ele guardou em regraPerdas; selo
   de antes da régua, nenhuma (recalcula como foi selado). */
const perfReguaDoSelo = (selo:any) => typeof selo?.regraPerdas==="string" ? selo.regraPerdas : "";
/* A RÉGUA DA VOLTA DO SELO (onda volta): a que ele guardou em regraVolta; o
   selo de antes (v167) recalcula pela régua de antes (os campos da O.S., pela
   fotografia voltaLegado). Régua que este servidor não conhece fica com a de
   antes: o hash não bate e continua 409 (nunca vira aceite). */
const perfRegraVoltaDoSelo = (selo:any) => selo?.regraVolta===REGRA_VOLTA ? REGRA_VOLTA : "";
async function perfFechamentos(periodo:any) {
  const {data,error}=await sb.from("pcp_registros").select("id,registro").eq("colecao","performance_fechamentos").eq("apagado",false).eq("registro->>de",periodo.de).eq("registro->>ate",periodo.ate).order("id").limit(1000);
  if(error)throw new Error(error.message);if(data?.length===1000)throw new Error("Limite de revisões atingido.");
  return (data||[]).map((r:any)=>r.registro).sort((a:any,b:any)=>b.revisao-a.revisao);
}

/* AS REVISÕES DA COMISSÃO QUE COBREM UM PERÍODO (revisão da onda a3, D-004
   nos pontos), para o ranking dos funcionários ler a falha comprovada que
   vale (COMISSAO.demonstrativosVigentes). Paginada pela chave; só uma página
   vazia confirma o fim. Nada daqui sai na resposta além do ranking.
   SÓ O PERÍODO E SÓ OS CAMPOS QUE A RÉGUA LÊ (verificação da v166): a cada
   60 s o ranking lia todas as revisões, com o registro inteiro (evidências,
   rateios, CSV), e filtrava o período no código. Agora o banco filtra pelo
   período (de até o fim do recorte, até a partir do início) e devolve só o
   que demonstrativosVigentes usa: id, período, revisão, tipo, hora, as
   decisões da entrada, a compensação e as linhas da apuração. */
async function perfComissaoQueCobrem(periodo:{de:string,ate:string}) {
  const out:any[]=[];let cursor="";
  for(let pagina=0;pagina<400;pagina++){
    let q=sb.from("pcp_registros").select("id, de:registro->>de, ate:registro->>ate, revisao:registro->revisao, tipo:registro->>tipo, em:registro->>em, decisoes:registro->entrada->decisoes, compensacaoDe:registro->apuracao->compensacaoDe, linhas:registro->apuracao->linhas")
      .eq("colecao","performance_comissao").eq("apagado",false).lte("registro->>de",periodo.ate).gte("registro->>ate",periodo.de).order("id").limit(500);
    if(cursor)q=q.gt("id",cursor);
    const {data,error}=await q;if(error)throw new Error(error.message);
    const rows=data||[];
    if(!rows.length)return out;
    for(const row of rows){
      if(typeof row?.id!=="string"||row.id<=cursor)throw new Error("Leitura da comissão inconsistente. Atualize o ranking.");
      cursor=row.id;
      if(typeof row.de!=="string"||typeof row.ate!=="string"||row.de>periodo.ate||row.ate<periodo.de)continue;
      out.push({id:row.id,de:row.de,ate:row.ate,revisao:row.revisao,tipo:row.tipo,em:row.em,
        entrada:{decisoes:row.decisoes&&typeof row.decisoes==="object"?row.decisoes:{}},
        apuracao:{compensacaoDe:row.compensacaoDe??null,linhas:Array.isArray(row.linhas)?row.linhas:[]}});
    }
  }
  throw new Error("Revisões da comissão excederam o limite da leitura.");
}
// Compartilhar o endereço não compartilha o crachá. Cache só da projeção
// permitida, após autenticação e revogação, para não reler toda a base por celular.
const CACHE_RANKING_EQUIPE = new Map<string, {ate:number, dados:any}>();
const RANKING_EQUIPE_EM_CURSO = new Map<string, Promise<any>>();
async function rankingEquipeDoPeriodo(periodo:any, porValor=false) {
  const chave = periodo.de + ":" + periodo.ate + (porValor ? ":valor" : ":producao"), cache = CACHE_RANKING_EQUIPE.get(chave);
  if (cache && cache.ate > Date.now()) return cache.dados;
  if (RANKING_EQUIPE_EM_CURSO.has(chave)) return RANKING_EQUIPE_EM_CURSO.get(chave);
  const consulta = (async () => {
    const fechamentos = await perfFechamentos(periodo);
    const fonteBase = fechamentos[0] || await perfFonte(periodo, {estrito:false});
    /* D-004 NOS PONTOS (revisão da onda a3): a falha comprovada que vale no
       demonstrativo da comissão que cobre a entrega tira os pontos dela aqui
       também, como na tela da gestão (COMISSAO.comFalhasComprovadas, a mesma
       régua). Só leitura: o fechamento e o hash dele não mudam. */
    /* Se a leitura das decisões falhar, o ranking sai sem elas e com o aviso,
       em vez de cair (verificação da v166); essa resposta não fica no cache. */
    let demos:any[] = [], avisoDecisoes = "";
    try { demos = COMISSAO.demonstrativosVigentes(await perfComissaoQueCobrem(periodo), periodo); }
    catch { avisoDecisoes = "Não foi possível ler as decisões da comissão agora. A falha comprovada julgada pela gestão pode não aparecer neste ranking; atualize daqui a pouco."; }
    const fonte = demos.length ? {...fonteBase, registros:COMISSAO.comFalhasComprovadas(fonteBase.registros, demos)} : fonteBase;
    const cfg = await getCfg();
    // Como a gestão, unifica a mesma ficha em formatos antigos só na visão.
    // Fonte, nome histórico da equipe e hash do fechamento ficam intactos.
    const pessoas = await pessoasDoPCP(cfg);
    const dados = {...rankingEquipeSeguro(fonte, cfg?.performancePCP?.equipes || [], pessoas, porValor), ...(avisoDecisoes ? {avisoDecisoes} : {})};
    if (avisoDecisoes) return dados;
    if (CACHE_RANKING_EQUIPE.size >= 24) CACHE_RANKING_EQUIPE.delete(CACHE_RANKING_EQUIPE.keys().next().value!);
    CACHE_RANKING_EQUIPE.set(chave, {ate:Date.now()+60_000, dados});
    return dados;
  })();
  RANKING_EQUIPE_EM_CURSO.set(chave, consulta);
  try { return await consulta; } finally { RANKING_EQUIPE_EM_CURSO.delete(chave); }
}

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
  if (cracha && (!ehMaquina || acao === "performanceRankingEquipe")) {
    try {
      if (await crachaRevogado(cracha, acao === "performanceRankingEquipe" || acao === "demandas")) {
        return resp({ error: "Seu acesso ao PCP foi encerrado. Fale com a gestão.", semSessao: true }, 401);
      }
    } catch {
      return resp({error:"Não foi possível conferir seu acesso ao ranking. Tente novamente."},503);
    }
  }

  // Um nome sozinho não autoriza aparelho novo. Gestão autentica e autoriza
  // a visão de execução; a equipe continua trabalhando offline após a entrada.
  if (acao === "entrarMontagem") {
    if (!cracha || !["admin", "pcp"].includes(String(cracha.papel)))
      return resp({error:"Entre com sua conta do PCP. Um novo aparelho de montagem precisa ser autorizado pela gestão."},403);
    const cfg = (await getCfg()) || {};
    const nome = String(body.nome || '').trim();
    const bate = (cfg.instaladores || []).find((n: string) => n.trim().toLowerCase() === nome.toLowerCase());
    if (!bate) return resp({error:"Instalador não cadastrado."},400);
    let idBate = "", aviso = "";
    try {
      const r = await pessoasDoPCP(cfg);
      idBate = r.idDe(bate);
      // Nome da lista sem ficha e sem decisao salva: a O.S. gravada pelo ID
      // nao aparece para ele. A gestao fica sabendo na hora de autorizar.
      if (!idBate && !r.fixado(bate)) aviso = `"${bate}" não está ligado a uma ficha do RH: as O.S. gravadas pelo ID não aparecem para ele. Ligue em Performance › Conferir nomes do PCP × fichas do RH.`;
    } catch { idBate = ""; }
    return resp({token:await assinarCrachaMontagem(bate, idBate),nome:bate,id:idBate,papel:"montagem",...(aviso ? { aviso } : {})});
  }

  // AUTORIZACAO POR PAPEL no SERVIDOR (05/08 fechou o token publico, mas o
  // switch executava tudo sem olhar papel: um cracha 'comercial' se promovia a
  // admin via setCfg ou apagava O.S). A porta de MAQUINA (backup do Hub) segue
  // com poder total. Papeis com editar=true: admin/pcp/montagem/operacao.
  let ehToqueNoNome = false;
  /* Quem é o crachá de toque: o ID que a gestão autorizou (crachá novo) e o
     nome da lista. A régua de pessoas é montada uma vez por request. */
  const quemToque = () => ({ id: String(cracha?.id ?? ""), nome: String(cracha?.nome || cracha?.sub || "") });
  let _pessoasReq: any = null;
  const pessoasReq = async () => (_pessoasReq ??= await pessoasDoPCP());
  // O que foi deixado de fora de um envio do crachá de toque; volta no 200.
  const avisosToque: string[] = [];
  /* A entrega declarada pelo celular que não achou item (o PCP tirou o item
     da lista): volta em `descartado` junto com as recusadas pelo motor (E5). */
  let entregasForaToque: any[] = [];
  if (cracha && !ehMaquina) {
    const papel = String(cracha.papel ?? "");
    const podeEditar = ["admin", "pcp", "montagem", "operacao"].includes(papel);
    const ESCRITA = ["upsert", "delete", "putPhoto", "deletePhoto"];
    /* O PCP PRECISA GRAVAR A ESCALA -- SO NAO A CHAVE DE CASA.
       Ate aqui setCfg era admin e mais ninguem, e a razao continua valida: o
       CFG carrega `niveis` (quem pode o que), `usuarios` e a lista de
       instaladores, que e por onde se entra sem senha. Deixar papel qualquer
       gravar isso seria deixar o sistema se promover.

       So que o CFG tambem carrega o TRABALHO das telas novas: plantao e evento
       (agendaPCP), bonus e ponto (bonusPCP), o vinculo apelido->ficha do RH
       (vinculosRH) e o registro de envio da mensagem do dia (mensagemDia). O
       papel `pcp` -- a gestao da producao, dona dessas telas -- levava 403 em
       todos, e o 403 travava a fila inteira do aparelho.

       Entao a regua deixa de ser "quem" e passa a ser "o que": o papel `pcp`
       grava APENAS as chaves de operacao, mescladas sobre o que ja esta no
       banco. Chave fora da lista e ignorada, nao recusada -- recusar faria o
       aparelho perder o plantao inteiro por causa de um campo a mais, como ja
       aprendemos no upsert da montagem. */
    if (acao === "setCfg" && papel !== "admin") {
      if (papel !== "pcp") {
        return resp({ error: "Só a gestão do PCP altera as configurações." }, 403);
      }
      // O filtro de campos e a mescla ocorrem sobre a mesma revisão no setCfg.

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
    ehToqueNoNome = papel === "montagem" && (cracha.montagemIndividual === true || !contaDoCracha);

    // A lista de campos e a mescla moram em _shared/pcp-integridade.mjs (CAMPOS_MONTAGEM).
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
    /* 403 TIRA O ENVIO DA FILA DO CELULAR, e o espelho não mostra nada: o
       check-in e as fotos sumiam calados. Por isso só "criar O.S." é 403 (o
       espelho nunca cria). O.S. que saiu da equipe ou foi excluída enquanto o
       instalador estava sem sinal é 422: o envio fica guardado no aparelho e o
       aviso aparece. Falha de leitura é 503 (rede: o aparelho reenvia).
       Esses dois 422 levam `definitivo`: nenhum reenvio vai passar enquanto
       a O.S. estiver excluída ou fora da equipe, e o envio parado na fila
       travava o Sair, a troca de instalador e a entrada da gestão no celular.
       O store tira da fila e o espelho guarda a cópia com o aviso fixo. */
    if (acao === "upsert" && ehToqueNoNome && body?.os) {
      const veio = body.os as Record<string, unknown>;
      const id = String(veio.id ?? "");
      let atual: any = null, lapide: any = null;
      try {
        atual = id ? await getReg("os", id) : null;
        if (!atual && id) {
          const { data, error } = await sb.from("pcp_registros").select("id")
            .eq("colecao", "os").eq("id", id).eq("apagado", true).maybeSingle();
          if (error) throw new Error(error.message);
          lapide = data;
        }
      } catch {
        return resp({ error: "Não foi possível ler a O.S. agora. O envio fica guardado e vai de novo." }, 503);
      }
      if (lapide) return resp({ error: "Esta O.S. foi excluída pelo PCP. O que você registrou continua neste aparelho. Avise a gestão.", definitivo: true }, 422);
      if (!atual) {
        return resp({ error: "Quem entra pelo nome não cria O.S. Fale com o PCP." }, 403);
      }
      let pessoasUp: any = null;
      try { pessoasUp = await pessoasReq(); } catch {
        return resp({ error: "Não foi possível conferir a equipe agora. O envio fica guardado e vai de novo." }, 503);
      }
      if (!pertenceEquipe(atual, quemToque(), pessoasUp)) return resp({error:"Esta O.S. não está mais na sua equipe. O que você registrou continua neste aparelho. Avise a gestão.", definitivo: true},422);
      const mescla = mesclarToqueNoNome(atual, veio, String(cracha.nome || cracha.sub), new Date().toISOString());
      if (mescla.erro) return resp({ error: mescla.erro }, 422);
      avisosToque.push(...(mescla.avisos || []), ...acertarMomentosToque(mescla.os, atual));
      entregasForaToque = Array.isArray(mescla.entregasFora) ? mescla.entregasFora : [];
      body.os = mescla.os;
    }

    if (acao === "delete" && ehToqueNoNome) {
      return resp({ error: "Quem entra pelo nome não apaga O.S. Fale com o PCP." }, 403);
    }
  }

  if (ehToqueNoNome && ["getPhoto","deletePhoto"].includes(acao)) {
    /* PELO ID: a O.S. nova guarda o ID na equipe, e o filtro do banco pelo
       nome não a acharia. Lê só a equipe de todas (leve), confere pela mesma
       régua do upsert e só então traz as O.S. da equipe. */
    const data: any[] = [];
    try {
      const pessoas = await pessoasReq(), quem = quemToque();
      const chaveCache = quem.id + "|" + quem.nome.toLowerCase();
      const guardadas = CACHE_FOTOS_EQUIPE.get(chaveCache);
      let minhas: string[] = guardadas && guardadas.ate > Date.now() ? guardadas.ids : [];
      if (!guardadas || guardadas.ate <= Date.now()) {
        let cursor = "";
        for (let pag = 0; pag < 100; pag++) {
          let q = sb.from("pcp_registros").select("id, equipe:registro->equipe").eq("colecao","os").eq("apagado",false).order("id").limit(1000);
          if (cursor) q = q.gt("id", cursor);
          const { data: lote, error } = await q;
          if (error) throw new Error(error.message);
          for (const r of (lote ?? []) as any[]) if (pertenceEquipe({ equipe: Array.isArray(r.equipe) ? r.equipe : [] }, quem, pessoas)) minhas.push(String(r.id));
          if (!lote || lote.length < 1000) break;
          cursor = String(lote[lote.length - 1].id);
        }
        CACHE_FOTOS_EQUIPE.set(chaveCache, { ate: Date.now() + 60_000, ids: minhas });
      }
      for (let i = 0; i < minhas.length; i += 200) {
        const { data: regs, error } = await sb.from("pcp_registros").select("registro").eq("colecao","os").eq("apagado",false).in("id", minhas.slice(i, i + 200));
        if (error) throw new Error(error.message);
        data.push(...(regs ?? []));
      }
    } catch {
      return resp({error:"Não foi possível conferir o vínculo da foto."},503);
    }
    /* A foto do carro que a equipe registrou (voltaEquipe.fotos) vai em todas
       as O.S. da volta: o colega do mesmo carro, em outro celular, precisa
       abri-la, senão vê "registrada por Ana" com a miniatura quebrada. Só para
       LER: apagar pelo crachá de toque tiraria a foto das outras O.S. da volta,
       e o espelho nunca apaga essa foto (o × só a tira da lista). */
    const fotosDaVolta = (r: any) => acao === "getPhoto" && Array.isArray(r.registro?.voltaEquipe?.fotos) ? r.registro.voltaEquipe.fotos : [];
    /* APAGAR é mais estreito que abrir: o layout é do PCP, e a foto de O.S.
       finalizada é a prova que validarConclusao exigiu. Quem entrou sem senha
       apaga só foto de execução de O.S. ainda aberta. */
    const apagando = acao === "deletePhoto";
    /* E a trava vale pelo id, não pela O.S.: pôr o id da prova de uma O.S.
       finalizada (ou do layout) na lista de uma O.S. aberta e depois pedir o
       apagar passava, porque a aberta "tinha" a foto. Id que aparece em O.S.
       finalizada, como layout, na limpeza do carro ou na conferência da volta
       não é apagado por este crachá. */
    const execucao = (r: any) => [...(r.registro.fotosCheckinIds || []),...(r.registro.fotosRetornoIds || []),...(r.registro.itens || []).map((i: any) => i?.fotoProbId)];
    const protegida = apagando && (data || []).some((r: any) => [r.registro.layoutFotoId,...(r.registro.voltaEquipe?.fotos || []),...(r.registro.retornoConf?.fotos || []),...(r.registro.finalizadaEm ? execucao(r) : [])].filter(Boolean).includes(body.fileId));
    const permitida = !protegida && (data || []).some((r: any) => !(apagando && r.registro.finalizadaEm) && [apagando ? "" : r.registro.layoutFotoId,...execucao(r),...fotosDaVolta(r)].filter(Boolean).includes(body.fileId));
    if (!permitida) return resp({error:apagando ? "Esta foto não pode ser apagada por este aparelho." : "Esta foto não está vinculada às O.S. da sua equipe."},403);
  }

  // Toda O.S. que sai desta porta para o crachá de toque passa por aqui. O ID
  // e o login de quem digitou o prazo e o retorno previstos (F15) só descem
  // para a gestão (admin, pcp) e a máquina.
  const gestaoVeTudo = ehMaquina || ["admin", "pcp"].includes(String(cracha?.papel ?? ""));
  /* A DIVISÃO DA EQUIPE (alocacao, F08): a montagem com senha também não
     recebe os percentuais nem o histórico deles (o celular não mostra
     divisão); os outros papéis recebem sem o ID de quem gravou. */
  const ehMontagem = String(cracha?.papel ?? "") === "montagem";
  const podarControle = (r:any) => {
    if(!r || gestaoVeTudo)return r;
    const limpo=(x:any):any=>Array.isArray(x)?x.map(limpo):x && typeof x==="object"?Object.fromEntries(Object.entries(x).filter(([k])=>!["porId","responsavelId"].includes(k)).map(([k,v])=>[k,limpo(v)])):x;
    const out={...r};for(const campo of ["conferenciaERP","regularizacaoSaida","revisaoSolicitada","cicloRegistro"])if(out[campo])out[campo]=limpo(out[campo]);return out;
  };
  const saidaBase = (r: any) => ehToqueNoNome ? podarToque(r) : gestaoVeTudo ? r : podarCarimbosF15(ehMontagem ? podarAlocacao(r) : podarIdsAlocacao(r));

  const saida = (r:any) => gestaoVeTudo ? podarControle(saidaBase(r)) : podarValoresPCP(podarControle(saidaBase(r)));

  /* QUEM ASSINA A ENTRADA DO DIARIO: o cracha, nunca o corpo do pedido. Um
     `porId` que viesse do aparelho seria o aparelho dizendo quem ele e --
     justamente o que o diario existe para nao aceitar.
     - Toque: a MESMA regua da trava de equipe (idDoCracha): o vinculo de hoje
       vence o id antigo do cracha. Sem RH no ar, o id assinado no cracha.
     - Gestao: o cracha nao traz ID; so a ficha unica cujo apelido e o login
       (idDaGestao). Nome de exibicao e comeco de nome nunca dao identidade:
       sem essa ficha, porId vazio e o login basta (revisao da F03). */
  let _autorAud: any = null;
  const autorAuditoria = async () => {
    if (_autorAud) return _autorAud;
    if (!cracha) return (_autorAud = { nome: "Integração", login: "", papel: "maquina", porId: "" });
    const login = String(cracha.sub ?? "").trim(), nome = String(cracha.nome || login).trim();
    let porId = "";
    if (ehToqueNoNome) {
      try { porId = idDoCracha(quemToque(), await pessoasReq()); }
      catch { porId = ehIdPessoa(cracha.id) ? String(cracha.id).trim() : ""; }
    } else if (ehIdPessoa(cracha.id)) {
      porId = String(cracha.id).trim();
    } else {
      try { porId = idDaGestao(login, await pessoasReq()); } catch { porId = ""; }
    }
    return (_autorAud = { nome, login, papel: String(cracha.papel ?? ""), porId });
  };
  const origemAuditoria = ehMaquina ? "maquina" : ehToqueNoNome ? "toque" : "tela";
  // Nunca lanca: qualquer erro daqui vira falha contada, e a gravacao segue.
  const auditar = async (osId: string, acao: string, diff: any, numero?: string) => {
    if (!diff || !diff.campos?.length) return;
    try {
      const registro = entradaAuditoria({ id: crypto.randomUUID(), osId, numero: String(numero ?? ""), acao, diff,
        autor: await autorAuditoria(), origem: origemAuditoria, em: new Date().toISOString() });
      await gravarAuditoria(registro);
    } catch (e) {
      await falhaAuditoria(String((e as Error)?.message ?? e), osId).catch(() => {});
    }
  };

  try {
    if (acao === "demandas") {
      try { return resp(await demandasPCP(body,{sb,cracha,ehMaquina})); }
      catch(e:any) { return resp({error:e.message||"Falha nas demandas."},e.status||503); }
    }
    switch (acao) {
      case "performanceRankingEquipe": {
        // Nem token de backup nem parâmetros de papel/ID no corpo autorizam.
        // O mesmo crachá já autorizado no espelho de montagem pode acompanhar.
        if (!podeVerRankingEquipe(cracha)) return resp({error:"Entre com seu acesso de funcionário do PCP.",semSessao:!cracha},cracha?403:401);
        let periodo;try{periodo=perfPeriodo(body);}catch(e){return resp({error:(e as Error).message},422);}
        if (periodo.ate > perfDia(new Date().toISOString())) return resp({error:"Escolha um período até hoje."},422);
        const resposta = resp(await rankingEquipeDoPeriodo(periodo, body.ordemValor===true));
        resposta.headers.set("Cache-Control", "no-store");
        return resposta;
      }
      case "relatorioEntregas": {
        if(!ehMaquina && !["admin","pcp"].includes(String(cracha?.papel || "")))return resp({error:"Relatórios restritos à gestão do PCP."},403);
        const hoje=perfDia(new Date().toISOString()), ano=Number(body.ano);
        if(!Number.isInteger(ano) || ano<2000 || ano>Number(hoje.slice(0,4)))return resp({error:"Ano inválido."},422);
        const de=`${ano}-01-01`, ate=ano===Number(hoje.slice(0,4))?hoje:`${ano}-12-31`;
        const meses=Array.from({length:12},(_,i)=>`${ano}-${String(i+1).padStart(2,"0")}`);
        // Paginação por chave: não aceitar o limite padrão do PostgREST como um ano inteiro.
        async function lerOrdens() {
          const todos:any[]=[];let after="";
          for(let i=0;i<100;i++){
            let q=sb.from("painel_ordens").select("id,numero,cliente,data,valor,atualizado_em").gte("data",de).lte("data",ate).order("id").limit(500);
            if(after)q=q.gt("id",after);
            const {data,error}=await q;if(error)throw new Error(error.message);
            const rows=data || [];todos.push(...rows);if(rows.length<500)return todos;
            const next=String(rows[rows.length-1].id);if(next<=after)throw new Error("Paginação de vendas inconsistente.");after=next;
          }throw new Error("Ano excedeu o limite da consulta.");
        }
        const [ordens,fluxo,cache,operacao]=await Promise.all([
          lerOrdens(),
          sb.from("painel_cache").select("valor,atualizado_em").eq("chave","fluxo_mensal").maybeSingle(),
          sb.from("pcp_meta").select("chave,valor").in("chave",meses.map(m=>"entregues:"+m)),
          perfFonte({de,ate},{estrito:false}),
        ]);
        if(fluxo.error || cache.error)throw new Error("Não foi possível ler as fontes do relatório.");
        // perfFonte verifica a paginação; mudança concorrente não derruba o relatório (só lê).
        const pacotes=new Map((cache.data || []).map((r:any)=>[r.chave,r.valor]));
        const entradas=fluxo.data?.valor?.anos?.[ano]?.entradas;
        const numero=(v:any)=>v!==null && v!==undefined && v!=="" && Number.isFinite(Number(v))?Number(v):null;
        const soma=(rows:any[])=>rows.some(r=>numero(r.valor)===null)?null:Math.round(rows.reduce((n,r)=>n+Number(r.valor),0)*100)/100;
        const linhas=meses.map(mes=>{
          if(mes>ate.slice(0,7))return {mes,futuro:true};
          const pacote:any=pacotes.get("entregues:"+mes);
          const vistos=new Set();
          const entregas=(Array.isArray(pacote?.os)?pacote.os:[]).filter((r:any)=>{
            const dia=String(r.data || "").slice(0,10), n=String(r.numero || "");
            if(!n || vistos.has(n) || !dia.startsWith(mes) || dia>ate)return false;vistos.add(n);return true;
          }).map((r:any)=>({numero:r.numero,cliente:r.cliente,data:r.data,previsao:String(r.previsao || ""),valor:numero(r.valor)}));
          const vendas=ordens.filter(r=>String(r.data).startsWith(mes)).map(r=>({numero:r.numero,cliente:r.cliente,data:r.data,valor:numero(r.valor)}));
          const instalacoes=operacao.registros.filter((r:any)=>r.dia.startsWith(mes));
          const retrabalhos=instalacoes.filter((r:any)=>r.retrabalho===true).map((r:any)=>({numero:r.numero,cliente:r.cliente,data:r.dia}));
          return {mes,entregue:pacote?.v>=2 && Array.isArray(pacote.os)?soma(entregas):null,
            vendido:vendas.length?soma(vendas):null,recebido:entradas && Object.prototype.hasOwnProperty.call(entradas,mes)?numero(entradas[mes]):null,
            retrabalho:instalacoes.length?100*retrabalhos.length/instalacoes.length:null,baseRetrabalho:instalacoes.length,
            entregasCarregadas:!!(pacote?.v>=2 && Array.isArray(pacote.os)),entregas,vendas,retrabalhos,entregasEm:pacote?.em || null};
        });
        return resp({ano,de,ate,meses:linhas,consultadoEm:new Date().toISOString(),recebimentosEm:fluxo.data?.atualizado_em || null,
          notas:{vendido:"O.S. por data de cadastro no Mubisys, valor líquido. Não equivale a faturamento fiscal. Histórico depende da carga do ERP; mês sem registros não confirma venda zero.",
          recebido:"Pagamentos de contas a receber pela data de pagamento/crédito, no fluxo mensal do Painel. Fonte agregada: não contém títulos individuais. Anos preservados podem ter atualização anterior à carga indicada.",
          retrabalho:"Instalações finalizadas no PCP no mês com marca de retrabalho ÷ instalações finalizadas registradas no mesmo mês. Histórico operacional pode ser incompleto; ausência de marca não comprova inspeção de qualidade.",
          entregue:"O.S. com status entregue no Mubisys pela data de entrega, incluindo retiradas. Valores líquidos; alterações posteriores dependem de nova sincronização.",
          pontualidade:"Previsão do Mubisys comparada à entrega efetiva, por O.S., incluindo retiradas. Entrega antecipada ou na data conta como no prazo; atraso em dias corridos. Percentuais usam somente O.S. com as duas datas válidas. Previsão conforme a última carga do ERP (pode incluir previsão calculada a partir do prazo cadastrado); não é a primeira agenda congelada do PCP. Não mede pedidos ainda em aberto nem altera abonos ou comissões."}});
      }

      // Alteração estreita: nunca reaplica os integrantes atuais sobre a entrega.
      case "performanceVincularEquipe": {
        if(ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha?.papel || "")))return resp({error:"Só a gestão pode conferir vínculos de equipes."},403);
        if(body.revisaoFechada)return resp({error:"Revisão fechada é somente leitura. Abra os dados atuais."},422);
        const osId=String(body.osId || ""), entregaId=String(body.entregaId || "");
        const {data:row,error}=await sb.from("pcp_registros").select("registro,atualizado_em,apagado").eq("colecao","os").eq("id",osId).maybeSingle();
        if(error)throw new Error(error.message);
        const os=row?.registro;
        if(!os || row.apagado)return resp({error:"O.S. não encontrada."},404);
        if(body.rev!==os.rev)return resp({error:"A O.S. mudou. Reabra a comparação.",conflito:true},409);
        const entrega=entregaId?(os.conferenciasEntrega || []).find((x:any)=>x.id===entregaId):null;
        if(entregaId&&!entrega || !entregaId&&os.conferenciasEntrega?.length)return resp({error:"Selecione a entrega específica, preservando as outras parciais."},422);
        const aloc=entrega?entrega.alocacao:os.alocacao, indice=body.grupo;
        const virtual={...os,alocacao:aloc,equipe:entrega?finaisAlocacao(aloc).map((m:any)=>m.pessoaId):os.equipe};
        if(!aloc || !alocacaoConfirmada(virtual) || !Number.isInteger(indice) || !aloc.grupos[indice])return resp({error:"Confirme a divisão e a identidade das pessoas antes de vincular."},422);
        const cfgAntes=await getCfgComVersao(), equipe=(cfgAntes.config?.performancePCP?.equipes || []).find((x:any)=>x.id===body.equipeId);
        if(!equipe || equipe.ativo===false)return resp({error:"Equipe indisponível ou inativa. Revise o cadastro."},422);
        if(JSON.stringify(equipe)!==body.baseEquipe)return resp({error:"O cadastro da equipe mudou. Reabra a comparação.",conflito:true},409);
        const pessoas=await pessoasReq(), grupo=aloc.grupos[indice];
        if(grupo.membros.some((m:any)=>{const p=pessoas.pessoa(m.pessoaId);return !/^\d{6}$/.test(m.pessoaId)||!p||p.semFicha||p.idRepetido||pessoas.repetido?.(m.pessoaId)||(pessoas.fichas || []).filter((x:any)=>x.id===m.pessoaId).length>1;}))return resp({error:"Identidade de pessoa não confirmada. Confira os vínculos no RH."},422);
        const nova=JSON.parse(JSON.stringify(aloc));nova.grupos[indice].equipeId=equipe.id;
        if(grupo.equipeId===equipe.id)return resp({error:"Esta entrega já está vinculada a esta equipe."},422);
        const cfgAgora=await getCfgComVersao();
        if(cfgAgora.versao!==cfgAntes.versao)return resp({error:"O cadastro mudou durante a conferência.",conflito:true},409);
        const autor=await autorAuditoria(), agora=new Date().toISOString();
        const vinculo={entregaId,grupo:indice,antes:grupo.equipeId || null,depois:equipe.id,equipeNome:equipe.nome,por:autor.nome,porId:autor.porId,em:agora};
        // Assinatura original da entrega fica preservada; a associação tem sua própria autoria.
        const gravar={...os,...(entrega?{conferenciasEntrega:os.conferenciasEntrega.map((x:any)=>x.id===entregaId?{...x,alocacao:nova}:x)}:{alocacao:nova}),vinculosEquipes:[...(os.vinculosEquipes || []),vinculo],rev:(Number(os.rev)||0)+1,atualizadoEm:agora,atualizadoPor:autor.nome};
        // The database locks configuration and checks both versions in one transaction.
        const {data:salva,error:err}=await sb.rpc("pcp_vincular_equipe_cas", {
          p_os_id:osId, p_os_versao:row.atualizado_em, p_cfg_versao:cfgAntes.versao,
          p_equipe_id:equipe.id, p_registro:gravar,
          p_atualizado_em:new Date(Math.max(Date.now(),Date.parse(row.atualizado_em)+1 || 0)).toISOString()
        });
        if(err)throw new Error(err.message);
        if(salva!==true)return resp({error:"O cadastro ou a O.S. mudou. Reabra a comparação.",conflito:true},409);
        await auditar(osId,"vincular-equipe",vinculo,os.numero);
        return resp({ok:true,os:saida(gravar)});
      }

      case "conferenciaEntrega": {
        if(ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha?.papel || ""))) return resp({error:"Só a gestão confere itens e a divisão de cada entrega."},403);
        const osId=String(body.osId || "");
        const {data:row,error}=await sb.from("pcp_registros").select("registro,atualizado_em,apagado").eq("colecao","os").eq("id",osId).maybeSingle();
        if(error) throw new Error(error.message);
        const os=row?.registro;
        if(!os || row.apagado) return resp({error:"O.S. não encontrada."},404);
        if(os.tipo==="interno" || cancelada(os)) return resp({error:"Esta O.S. não permite conferir entrega de instalação."},422);
        if(!body.entrega) {
          const {data:erp,error:err}=await sb.from("painel_ordens").select("numero,valor").eq("numero",String(os.numero || "")).limit(2);
          if(err) throw new Error(err.message);
          /* Os períodos fechados vão junto (M7): o diálogo diz antes de salvar
             que o dia cai em mês fechado. Sem eles, o diálogo abre igual e a
             gravação confere aqui. */
          let fechados:any[]|null=null;try{fechados=await perfPeriodosFechados();}catch{fechados=null;}
          /* A O.S. que já entrou inteira num período fechado (D1): o diálogo diz
             antes de salvar e fica só leitura (a gravação recusa aqui). */
          let inteira:any=null;if(fechados){try{inteira=await perfInteiraFechada(osId,fechados);}catch{inteira=null;}}
          return resp({os:saida(os),valor:valorConferencia(os,erp || []),fechados:fechados&&fechados.map(({ultimoId:_u,...f}:any)=>f),inteira});
        }
        if(body.rev!==os.rev) return resp({error:"A O.S. mudou. Reabra a conferência antes de salvar.",conflito:true},409);
        if(["baixa_administrativa","retirada"].includes(os.conferenciaERP?.classificacao)) return resp({error:"Revise a classificação ERP para divergência antes de conferir uma instalação. A classificação anterior será preservada no histórico."},422);
        const velho=(os.conferenciasEntrega || []).find((e:any)=>e.id===body.entrega.id);
        const pedido=body.entrega, hoje=perfDia(new Date().toISOString());
        const entrega={id:pedido.id,dia:pedido.dia,itens:pedido.itens,alocacao:pedido.alocacao};
        const demais=(os.conferenciasEntrega || []).filter((e:any)=>e.id!==entrega.id);
        const erro=CONFERENCIA_ENTREGA.validar(os,[...demais,entrega],hoje);
        if(erro) return resp({error:erro},422);
        /* CONFERIR EM MÊS FECHADO (M7 da auditoria de 11/10/2026, pela
           recomendação dela): a conferência nova com o dia num período fechado
           ficava fora de tudo sem aviso, e mover uma parcial do mês selado para
           o aberto contava a mesma unidade duas vezes (no selo e na apuração
           aberta). Se o dia novo ou o antigo cai num período fechado, recusa
           com a causa e nada se grava. Esta ação é chamada na hora, fora da
           fila do aparelho: a recusa não prende nada. */
        const fechadosConf=await perfPeriodosFechados();
        const fNovo=perfPeriodoDoDia(fechadosConf,String(entrega.dia||"")), fVelho=velho?perfPeriodoDoDia(fechadosConf,String(velho.dia||"")):null;
        if(fVelho)return resp({error:`Esta entrega foi conferida em ${perfDiaBR(velho.dia)}, num período já fechado (${perfDiaBR(fVelho.de)} a ${perfDiaBR(fVelho.ate)}, revisão ${fVelho.ultimaRevisao}). Mês fechado não se recalcula: ela não pode mudar nem ir para outro mês. Se algo está errado nela, ${PERF_AJUSTE_FECHADO} Nada foi gravado.`,periodoFechado:{de:fVelho.de,ate:fVelho.ate}},409);
        /* U2 (revisão da onda fechamento): a frase não empurra a trocar o dia
           para um mês aberto; a entrega de setembro contaria em outubro. */
        if(fNovo)return resp({error:`O dia ${perfDiaBR(entrega.dia)} cai num período já fechado (${perfDiaBR(fNovo.de)} a ${perfDiaBR(fNovo.ate)}, revisão ${fNovo.ultimaRevisao}). Mês fechado não se recalcula: nada foi gravado. Se a data está errada, corrija. Se a entrega foi mesmo em ${perfMesTxt(String(entrega.dia).slice(0,7))}, ela não pode ser conferida agora: ${PERF_AJUSTE_FECHADO}`,periodoFechado:{de:fNovo.de,ate:fNovo.ate}},409);
        /* A O.S. QUE JÁ ENTROU INTEIRA NUM PERÍODO FECHADO (D1 da revisão da
           onda fechamento; a M7 ficou incompleta sem isto): sem conferência por
           item, ela contou inteira no selo pelo dia do lançamento ou da
           finalização; a primeira conferência por item com o dia num mês aberto
           contaria a mesma unidade de novo. Recusa, como a M7. O ajuste de mês
           fechado depende da pergunta 3 da fila do dono (P-006 a P-010). */
        const fInteira=!velho&&!demais.length?await perfInteiraFechada(osId,fechadosConf):null;
        if(fInteira)return resp({error:`Esta O.S. já entrou inteira no fechamento de ${perfDiaBR(fInteira.de)} a ${perfDiaBR(fInteira.ate)} (revisão ${fInteira.ultimaRevisao}), com a entrega de ${perfDiaBR(fInteira.dia)}. Conferir os itens agora contaria a mesma entrega de novo em outro mês: ${PERF_AJUSTE_FECHADO} Nada foi gravado.`,periodoFechado:{de:fInteira.de,ate:fInteira.ate},inteiraNoFechamento:true},409);
        const cfg=(await getCfg()) || {}, pessoas=await pessoasReq(), autor=await autorAuditoria(), agora=new Date().toISOString();
        const anterior={...os,equipe:velho?.alocacao?finaisAlocacao(velho.alocacao).map((m:any)=>m.pessoaId):[],alocacao:velho?.alocacao};
        const virtual={...os,entregaLancada:{data:entrega.dia},equipe:pedido.alocacao?.grupos?.flatMap((g:any)=>g.membros?.map((m:any)=>m.pessoaId) || []) || []};
        const ra=sanearAlocacao(entrega.alocacao,virtual,anterior,{pode:true,avisar:true,autor,agora,equipes:cfg.performancePCP?.equipes || [],pessoas});
        if(ra.descartado || !ra.os.alocacao || !alocacaoConfirmada(ra.os)) return resp({error:ra.descartado?.motivo || "Confira a equipe e os vínculos no RH antes de confirmar."},422);
        const limpa={id:entrega.id,dia:entrega.dia,itens:entrega.itens.map((i:any)=>({chave:i.chave,identidade:i.identidade,qtde:i.qtde})),alocacao:ra.os.alocacao,por:autor.nome,porId:autor.porId,em:agora};
        const conferenciasEntrega=[...demais,limpa].sort((a:any,b:any)=>a.dia.localeCompare(b.dia)||a.id.localeCompare(b.id));
        const gravar={...os,conferenciasEntrega,rev:(Number(os.rev)||0)+1,atualizadoEm:agora,atualizadoPor:autor.nome};
        const {data:salva,error:erroSalvar}=await sb.from("pcp_registros").update({registro:gravar,atualizado_em:new Date(Math.max(Date.now(),Date.parse(row.atualizado_em)+1 || 0)).toISOString()}).eq("colecao","os").eq("id",osId).eq("atualizado_em",row.atualizado_em).select("id");
        if(erroSalvar) throw new Error(erroSalvar.message);
        if(!salva?.length) return resp({error:"Outra pessoa alterou a O.S. Reabra a conferência.",conflito:true},409);
        await auditar(osId,"conferir-entrega",{campos:["conferenciasEntrega"],antes:{conferenciasEntrega:os.conferenciasEntrega || []},depois:{conferenciasEntrega}},os.numero);
        return resp({ok:true,os:saida(gravar)});
      }

      /* OS PERÍODOS JÁ FECHADOS, de todos os meses (M8 e itens 3 e 11 da fila
         de 11/10/2026): só leitura. A tela avisa o mês que terminou sem
         fechamento, trava o Fechar que cruzaria outro período e diz no
         Conferir que o dia está num mês fechado.
         U1 (revisão da onda fechamento): o selo do mês na Performance e na TV
         de quem não lê a apuração (montagem, operação, comercial e o crachá de
         toque, que é montagem) dizia "Mês aberto" num mês fechado, enquanto o
         ranking.html dizia "Período fechado · revisão N". Agora a ação responde
         a todos os papéis que veem o ranking (podeVerRankingEquipe), só com os
         períodos e os números de revisão: nada de R$, de quem fechou nem de
         quando. A gestão continua recebendo a lista inteira. */
      case "performanceFechados": {
        const gestaoFech=ehMaquina || ["admin","pcp"].includes(String(cracha?.papel || ""));
        if(!gestaoFech && !podeVerRankingEquipe(cracha))return resp({error:"Entre com seu acesso de funcionário do PCP.",semSessao:!cracha},cracha?403:401);
        const lista=await perfPeriodosFechados();
        return resp({fechados:gestaoFech?lista.map(({ultimoId:_u,...f}:any)=>f):lista.map((f:any)=>({de:f.de,ate:f.ate,revisoes:f.revisoes,ultimaRevisao:f.ultimaRevisao})),hoje:perfDia(new Date().toISOString())});
      }

      case "performancePeriodo":
      case "performanceFechamentos":
      case "performanceFechar": {
        if(!ehMaquina && !["admin","pcp"].includes(String(cracha?.papel || "")))return resp({error:"Apuração restrita à gestão do PCP."},403);
        let periodo;try{periodo=perfPeriodo(body);}catch(e){return resp({error:(e as Error).message},422);}
        if(acao==="performancePeriodo")return resp(await perfFonte(body));
        const fechamentos=await perfFechamentos(periodo);
        if(acao==="performanceFechamentos")return resp({fechamentos});
        /* SÓ MÊS CALENDÁRIO QUE JÁ TERMINOU (item 3 da fila de 11/10/2026).
           Um "até" no futuro viraria o último dia fechado e travaria toda regra
           nova até lá; um período livre (01 a 19/09, 10 a 30/09) gravava selos
           que se cruzam e o ranking contava em dobro. O mês só fecha depois do
           último dia dele, no relógio de São Paulo. A tela chama esta ação na
           hora, fora da fila, então o 422 aqui não prende nada e mostra a causa. */
        if(!perfEhMesCalendario(periodo))return resp({error:`O fechamento é só de mês inteiro, do dia 01 ao último dia (por exemplo, ${perfDiaBR(periodo.de.slice(0,8)+"01")} a ${perfDiaBR(perfUltimoDiaDoMes(periodo.de.slice(0,7)))}). Escolha o mês no período e feche de novo.`,mesInteiro:true},422);
        const hojeFechar=perfDia(new Date().toISOString());
        /* Outubro de 2026 é teste (D-005; P-005 e P-008 abertas): a recusa não
           marca data para fechá-lo (U11 da revisão da onda fechamento). */
        if(periodo.ate>=hojeFechar)return resp({error:periodo.de==="2026-10-01"?"Outubro de 2026 é mês de teste e não tem data para ser fechado: a gestão ainda decide se ele será fechado.":`O mês ainda não terminou: ${perfMesTxt(periodo.de.slice(0,7))} pode ser fechado a partir de ${perfDiaBR(perfDiaSeguinte(periodo.ate))}.`},422);
        const requestId=String(body.requestId || "");
        if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId))return resp({error:"Identificação do fechamento inválida."},422);
        const repetido=fechamentos.find((r:any)=>r.requestId===requestId);if(repetido)return resp({ok:true,fechamento:repetido});
        const anterior=fechamentos[0];
        if((anterior?.id || "")!==String(body.anterior || ""))return resp({error:"Outro fechamento foi criado. Recarregue as revisões."},409);
        const motivo=String(body.motivo || "").trim();
        if(motivo.length<5 || motivo.length>500)return resp({error:"Informe um motivo de 5 a 500 caracteres para o fechamento ou revisão."},422);
        /* SEM SOBREPOR OUTRO PERÍODO JÁ FECHADO (item 3): uma revisão nova do
           MESMO mês continua valendo; um selo antigo de período livre que cruza
           o mês trava o fechamento com a causa (mês fechado não se recalcula). */
        const sobreposto=(await perfPeriodosFechados()).find((f:any)=>!(f.de===periodo.de&&f.ate===periodo.ate)&&!(f.de>periodo.ate||f.ate<periodo.de));
        if(sobreposto)return resp({error:`O mês se sobrepõe a um período já fechado (${perfDiaBR(sobreposto.de)} a ${perfDiaBR(sobreposto.ate)}). Mês fechado não se recalcula: nada foi gravado.`,sobreposto:{de:sobreposto.de,ate:sobreposto.ate}},409);
        const fonte=await perfFonte(body);
        /* A ABA PRESA NUMA VERSÃO ANTERIOR À F11 não lê `grupos`: mostra a O.S.
           dividida entre duas equipes inteira numa composição avulsa, e o selo
           gravaria a parte de cada equipe. Quem fecha aprovaria números que não
           são os do registro. Só a tela que lê `grupos` manda leGrupos:true;
           período sem `grupos` continua fechando pela aba antiga (o registro é
           o mesmo de antes). O Fechar é chamado na hora, fora da fila: o 422
           aqui não prende nada e a tela mostra a mensagem. Vem antes do hash
           para a aba velha ouvir a causa certa, e não "os dados mudaram". */
        if(body.leGrupos!==true && fonte.registros.some((r:any)=>Array.isArray(r.grupos)))return resp({error:"Recarregue a página para fechar: este período tem O.S. dividida entre duas equipes e esta tela é de uma versão anterior."},422);
        if(body.leEntregasItens!==true && fonte.registros.some((r:any)=>r.entregaId))return resp({error:"Recarregue a página para fechar: este período tem entregas por itens e esta tela é de uma versão anterior."},422);
        /* A tela nova recarrega a apuração sozinha neste 409; a aba numa versão
           anterior mostra a mensagem, então ela diz onde está o botão. */
        if(fonte.hash!==body.hash)return resp({error:"Os dados mudaram desde a consulta. Toque em Atualizar apuração (no quadro Base e fechamento), confira e feche de novo."},409);
        if(!fonte.registros.length || fonte.registros.some((r:any)=>!r.confirmado || r.valor===null))return resp({error:"Confirme todas as participações e confira os valores antes de fechar."},422);
        if(fonte.registros.some((r:any)=>r.avisoValor))return resp({error:"Confira os valores conflitantes no ERP antes de fechar. Veja as pendências da auditoria."},422);
        /* A COBERTURA DENTRO DA CONFIRMAÇÃO (item 2): abaixo de 50% do valor do
           mês na base (as baixas do ERP a lançar ficam de fora), o Fechar pede
           a frase escrita. Não trava o mês: quem fecha sabe o que fica de fora. */
        const cob=fonte.cobertura;
        const fraseCobertura=String(body.confirmaCobertura || "").trim().toLowerCase().replace(/\s+/g," ");
        if(cob?.baixa && fraseCobertura!==PERF_FRASE_COBERTURA)return resp({error:`Só ${cob.pctValor}% do valor do mês está na base: ${cob.aLancar} ${cob.aLancar===1?"baixa do ERP a lançar fica":"baixas do ERP a lançar ficam"} de fora. Para fechar assim, escreva "${PERF_FRASE_COBERTURA}" na confirmação (recarregue a página se o campo não aparecer).`,coberturaBaixa:true,cobertura:cob},422);
        const revisao=(anterior?.revisao || 0)+1,id=periodo.de+":"+periodo.ate+":"+String(revisao).padStart(6,"0");
        const registro={...fonte,...periodo,id,revisao,anterior:anterior?.id||null,requestId,motivo,fechadoEm:new Date().toISOString(),fechadoPor:cracha?.nome || "Integração autorizada",...(cob?.baixa?{coberturaBaixaConfirmada:PERF_FRASE_COBERTURA}:{})};
        const {error}=await sb.from("pcp_registros").insert({colecao:"performance_fechamentos",id,registro,apagado:false,atualizado_em:registro.fechadoEm});
        if(error){if(error.code==="23505")return resp({error:"O período recebeu outra revisão. Atualize antes de fechar."},409);throw new Error(error.message);}
        return resp({ok:true,fechamento:registro});
      }

      // Apuração financeira separada do ranking: fatos vêm de fechamento imutável.
      // Todas as gravações são INSERT; aprovação é outro evento, nunca um campo do cliente.
      case "performanceComissaoListar":
      case "performanceComissaoNova":
      case "performanceComissaoAprovar":
      case "performanceComissaoExportar": {
        if(!cracha || ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha.papel)))return resp({error:"Comissão restrita à gestão autenticada do PCP."},403);
        let periodo;try{periodo=perfPeriodo(body);}catch(e){return resp({error:(e as Error).message},422);}
        // Ler o relógio por O.S. ANTES do histórico: qualquer aprovação que
        // altere os saldos depois desta leitura disputa a mesma próxima versão.
        // Cursor de chave primária: o limite é de cada página, não do histórico.
        // Só uma página vazia confirma o fim (PostgREST pode limitar abaixo de500).
        const prazoLeitura = Date.now()+25000;
        const lerFinanceiro = async (colecao:string) => {
          const todos:any[]=[];let cursor="";
          while(true){
            if(Date.now()>prazoLeitura)throw new Error("Leitura financeira excedeu o tempo permitido. Consulta incompleta; ação bloqueada.");
            let q=sb.from("pcp_registros").select("id,registro").eq("colecao",colecao).eq("apagado",false).order("id").limit(500);
            if(cursor)q=q.gt("id",cursor);
            const {data,error}=await q;
            if(error)throw new Error(error.message);
            if(!Array.isArray(data))throw new Error("Página financeira ausente. Consulta incompleta; ação bloqueada.");
            if(!data.length)return todos;
            for(const row of data){
              if(typeof row?.id!=="string" || !row.id || row.id<=cursor || !row.registro || typeof row.registro!=="object")throw new Error("Cursor financeiro inconsistente. Consulta incompleta; ação bloqueada.");
              cursor=row.id;todos.push(row);
            }
          }
        };
        const versoes=await lerFinanceiro("performance_comissao_os_versoes");
        const versoesOS=new Map<string,number>();
        for(const row of versoes||[]){const r=row.registro;versoesOS.set(String(r.osId),Math.max(versoesOS.get(String(r.osId))||0,r.versao));}
        const historico=await lerFinanceiro("performance_comissao");
        const todas=(historico||[]).map((r:any)=>r.registro);
        const revisoes=todas.filter((r:any)=>r.de===periodo.de&&r.ate===periodo.ate).sort((a:any,b:any)=>b.revisao-a.revisao);
        const ultima=revisoes[0], chave=periodo.de+":"+periodo.ate;
        if(acao==="performanceComissaoListar"){
          const fichas=await fichasRH(), regua=resolverPessoas({pessoas:fichas});
          const pessoas=[...new Map(fichas.filter((p:any)=>p.id&&regua.pessoa(p.id)&&!regua.pessoa(p.id).semFicha).map((p:any)=>[p.id,{id:p.id,nome:p.nome}])).values()];
          return resp({revisoes,pessoas,cobrem:perfComissaoCobrem(todas,periodo)});
        }
        if(acao==="performanceComissaoExportar"){
          if(!ultima || ultima.id!==body.id)return resp({error:"Selecione a última revisão aprovada. Uma nova prévia suspende a exportação anterior."},409);
          const osExportadas=new Set((ultima.apuracao?.linhas||[]).map((l:any)=>l.osId));
          const divergencias=COMISSAO.divergencias(todas,ultima.apuracao?.config?.modo).filter((d:any)=>d.periodo<=chave&&osExportadas.has(d.osId));
          if(divergencias.length)return resp({error:"O acumulado financeiro mudou. Gere e aprove a conciliação destes períodos, em ordem, antes de exportar: "+[...new Set(divergencias.map((d:any)=>d.periodo.split(":").map((data:string)=>data.split("-").reverse().join("/")).join(" a ")))].join("; "),conciliacoesPendentes:divergencias},409);
          if(!ultima.apuracao?.compensacaoDe){
          const fechamentos=await perfFechamentos(periodo);
          if(ultima.fechamentoId!==fechamentos[0]?.id)return resp({error:"Há outra revisão operacional. Concilie o demonstrativo antes de exportar."},409);
          const fonteAtual=await perfFonte(perfParametrosDoSelo(fechamentos[0],periodo),{reguaPerdas:perfReguaDoSelo(fechamentos[0]),regraVolta:perfRegraVoltaDoSelo(fechamentos[0])});
          if(fonteAtual.hash!==fechamentos[0]?.hash)return resp({error:"A fonte mudou depois do fechamento. Revise antes de exportar."},409);
          }
          const arquivo="comissao-"+periodo.de+"-r"+ultima.revisao+".csv";
          const aviso=(sha:string)=>"Exportação para conferência; não realiza pagamento. Não importar novamente sem conciliação. Impressão digital (sha256) do CSV: "+sha+".";
          /* O CSV QUE FOI APROVADO (M21): a aprovação guardou o CSV e a
             impressão digital dele; sai ESTE, conferido, e não um recalculado.
             Guardado que não confere com a impressão digital não sai. */
          if(typeof ultima.csv==="string"){
            const sha=String(ultima.csvSha256||"");
            if(!/^[a-f0-9]{64}$/.test(sha)||await sha256Texto(ultima.csv)!==sha)return resp({error:"O CSV guardado na aprovação não confere com a impressão digital dele. Nada foi exportado; avise a gestão."},409);
            return resp({ok:true,csv:ultima.csv,csvSha256:sha,arquivo,aviso:aviso(sha)});
          }
          // Aprovação de antes desta versão (sem CSV guardado): o CSV sai do registro aprovado, como antes.
          try{const csv=COMISSAO.csv(ultima),sha=await sha256Texto(csv);return resp({ok:true,csv,csvSha256:sha,arquivo,aviso:aviso(sha)});}catch(e){return resp({error:(e as Error).message},422);}
        }
        const requestId=String(body.requestId||""), motivo=String(body.motivo||"").trim();
        if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId)||motivo.length<5||motivo.length>500)return resp({error:"Informe identificação do pedido e motivo de 5 a 500 caracteres."},422);
        const assinatura=await perfHash({acao,compensarId:body.compensarId||null,fechamentoId:body.fechamentoId||null,entrada:body.entrada||null,anterior:body.anterior||"",hash:body.hash||null,motivo,confirmacao:body.confirmacao===true});
        const repetida=revisoes.find((r:any)=>r.requestId===requestId);
        if(repetida)return repetida.assinatura===assinatura?resp({ok:true,revisao:repetida,repetida:true}):resp({error:"Pedido já utilizado com conteúdo diferente."},409);
        if(String(body.anterior||"")!==String(ultima?.id||""))return resp({error:"Outra revisão foi criada. Atualize o demonstrativo."},409);
        let apuracao:any, entrada:any, tipo="previa", fechamentoId:string;
        if(acao==="performanceComissaoNova"&&body.compensarId){
          const alvo=revisoes.find((r:any)=>r.id===body.compensarId&&r.tipo==="aprovacao");
          const ativa=alvo&&COMISSAO.ativas(todas,alvo.apuracao.config.modo).find((r:any)=>r.de===periodo.de&&r.ate===periodo.ate);
          if(!alvo||ativa?.id!==alvo.id||alvo.apuracao.compensacaoDe)return resp({error:"Selecione a aprovação ativa para preparar compensação integral."},409);
          apuracao=COMISSAO.compensar(alvo);entrada={compensarId:alvo.id};fechamentoId=alvo.fechamentoId;
        }else if(acao==="performanceComissaoNova"){
          fechamentoId=String(body.fechamentoId||"");
          const fechamentos=await perfFechamentos(periodo), fonte=fechamentos.find((f:any)=>f.id===fechamentoId);
          if(!fonte || fonte.id!==fechamentos[0]?.id)return resp({error:"Selecione a última revisão do fechamento operacional para criar a prévia."},409);
          entrada=body.entrada&&typeof body.entrada==="object"?body.entrada:{};
          if(JSON.stringify(entrada).length>250000)return resp({error:"Demonstrativo excede o tamanho permitido."},422);
          apuracao=COMISSAO.apurar(fonte,entrada,{aprovacoes:todas});
          // Nenhum nome inferido: o ID precisa existir no RH e não ser ambíguo.
          const pessoas=await pessoasDoPCP();
          for(const p of apuracao.pessoas){const ficha=pessoas.pessoa(p.pessoaId);if(!ficha||ficha.semFicha){apuracao.pendencias.push("Cadastro inexistente ou ambíguo: "+p.pessoaId);}else p.nome=ficha.nome;}
          for(const l of apuracao.linhas)for(const p of l.pagamentos)p.nome=apuracao.pessoas.find((x:any)=>x.pessoaId===p.pessoaId)?.nome||p.pessoaId;
          apuracao=COMISSAO.conciliar(apuracao,revisoes.find((r:any)=>r.tipo==="aprovacao"&&r.apuracao.config.modo===apuracao.config.modo));
          apuracao.aprovavel=apuracao.pendencias.length===0;
        }else{
          const erro=COMISSAO.erroAprovacao(ultima,body.hash,body.confirmacao);
          if(erro)return resp({error:erro},422);
          if(!ultima.apuracao.compensacaoDe){
          const fechamentos=await perfFechamentos(periodo);
          if(ultima.fechamentoId!==fechamentos[0]?.id)return resp({error:"O fechamento operacional recebeu outra revisão. Gere e confira uma nova prévia."},409);
          const atual=await perfFonte(perfParametrosDoSelo(fechamentos[0],periodo),{reguaPerdas:perfReguaDoSelo(fechamentos[0]),regraVolta:perfRegraVoltaDoSelo(fechamentos[0])});
          if(atual.hash!==fechamentos[0]?.hash)return resp({error:"A fonte mudou depois do fechamento. Crie uma revisão operacional e outra prévia financeira."},409);
          }
          if(!ultima.versoesOS)return resp({error:"Prévia anterior ao controle de versões por O.S. Gere uma nova prévia."},409);
          for(const [osId,versao] of Object.entries(ultima.versoesOS))if((versoesOS.get(osId)||0)!==versao)return resp({error:"Outra aprovação alterou o saldo desta O.S. Gere uma nova prévia e confira os centavos."},409);
          apuracao=ultima.apuracao;entrada=ultima.entrada;fechamentoId=ultima.fechamentoId;tipo="aprovacao";
        }
        const anteriorAprovada=COMISSAO.ativas(todas,apuracao.config.modo).find((r:any)=>r.de===periodo.de&&r.ate===periodo.ate);
        // Inclui O.S. removidas/compensadas: liberar saldo também disputa versão.
        const afetadas=[...new Set([...apuracao.linhas,...(anteriorAprovada?.apuracao.linhas||[])].map((l:any)=>String(l.osId)))].sort();
        const referenciaVersoes=Object.fromEntries(afetadas.map(osId=>[osId,versoesOS.get(osId)||0]));
        const revisao=(ultima?.revisao||0)+1,id=chave+":"+String(revisao).padStart(6,"0"),em=new Date().toISOString();
        const hash=await perfHash({apuracao,entrada,fechamentoId});
        const registro:any={...periodo,id,revisao,tipo,anterior:ultima?.id||null,requestId,assinatura,motivo,fechamentoId,entrada,apuracao,hash,versoesOS:referenciaVersoes,em,autor:{login:String(cracha.sub||""),nome:String(cracha.nome||"")}};
        /* O CSV APROVADO E A IMPRESSÃO DIGITAL DELE (M21; revisão da onda
           onda-w1-backup, R2 e S5). A aprovação de período efetivo guarda, no
           próprio registro (só inserção, como tudo aqui), o CSV que vai à
           conferência de pagamento e o sha256 dele. O registro vai inteiro na
           porta de exportação do backup; a exportação da tela devolve este
           CSV, conferido. Período de teste (outubro) não exporta, então não
           guarda. O hash do registro (apuração, entrada, fechamento) não muda. */
        if(tipo==="aprovacao"&&apuracao?.config?.modo==="efetivo"&&apuracao.aprovavel){
          try{const csv=COMISSAO.csv(registro);registro.csv=csv;registro.csvSha256=await sha256Texto(csv);}catch{/* sem CSV de pagamento: a exportação diz o motivo */}
        }
        const inserts:any[]=[];
        if(tipo==="aprovacao"){
          // Projeção ATIVA (histórico permanece imutável). Revisão do mesmo
          // período substitui suas entregas; compensação aprovada libera-as.
          const ativas=COMISSAO.ativas(todas,apuracao.config.modo).filter((r:any)=>r.de!==periodo.de||r.ate!==periodo.ate);
          const fracoes=new Map<string,number>(), entregasAtivas=new Set<string>();
          for(const r of ativas)for(const l of r.apuracao.linhas){fracoes.set(l.osId,(fracoes.get(l.osId)||0)+l.fracaoOS);entregasAtivas.add(l.id);}
          for(const l of apuracao.linhas){
            if(entregasAtivas.has(l.id))return resp({error:"Entrega já aprovada em outro período. Prepare e aprove a compensação anterior antes de reapurar."},409);
            fracoes.set(l.osId,(fracoes.get(l.osId)||0)+l.fracaoOS);
          }
          if([...fracoes.values()].some(v=>!Number.isFinite(v)||v>1.000001))return resp({error:"As entregas aprovadas entre períodos ultrapassam a O.S. integral. Prepare a compensação anterior ou corrija a revisão."},409);
          // Compare-and-insert: sempre uma nova versão para CADA O.S., mesmo
          // com âncora antiga, outra entrega ou outro período. O lote é atômico.
          for(const osId of afetadas){const versao=(versoesOS.get(osId)||0)+1;
            inserts.push({colecao:"performance_comissao_os_versoes",id:osId+":"+String(versao).padStart(8,"0"),registro:{osId,versao,aprovacaoId:id,anterior:versao-1,compensacaoDe:apuracao.compensacaoDe||null},apagado:false,atualizado_em:em});
          }
          // As coleções antigas de claims/âncoras ficam como histórico. Não
          // decidem mais saldos: sua projeção era imutável e impedia corrigir.
        }
        inserts.push({colecao:"performance_comissao",id,registro,apagado:false,atualizado_em:em});
        const {error}=await sb.from("pcp_registros").insert(inserts);
        if(error){if(error.code==="23505")return resp({error:"Outra aprovação ou revisão foi gravada ao mesmo tempo. Atualize e concilie."},409);throw new Error(error.message);}
        return resp({ok:true,revisao:registro});
      }

      /* REGRAS DO PROGRAMA DAS EQUIPES (F05, 29/09/2026). Coleção própria
         (performance_regras), SÓ DE INSERÇÃO: versão nova nunca edita a
         antiga. Só admin e pcp leem e criam (a regra decide comissão e
         ranking; nada disso desce ao crachá sem senha nem à montagem), e o
         list das O.S. nunca a traz (filtra colecao='os'). A validação é a de
         _shared/pcp-regras.mjs, a mesma do formulário. O autor é o do
         crachá; id, versão e hora são daqui. A regra vale a partir de uma
         DATA e é recusada se cair em período já fechado (409), porque mês
         fechado não se recalcula. 422 aqui não prende fila nenhuma: a tela
         chama esta ação na hora, com rede, e mostra a causa. */
      case "performanceRegras":
      case "performanceRegraNova": {
        const papelRegra = String(cracha?.papel ?? "");
        if (acao === "performanceRegraNova" && (!cracha || ehMaquina || ehToqueNoNome || !["admin", "pcp"].includes(papelRegra)))
          return resp({ error: "Só a gestão do PCP (admin ou pcp) cria versão da regra do programa." }, 403);
        if (!ehMaquina && (ehToqueNoNome || !["admin", "pcp"].includes(papelRegra)))
          return resp({ error: "Regras do programa restritas à gestão do PCP." }, 403);
        const lerVersoes = async () => {
          const { data, error } = await sb.from("pcp_registros").select("id,registro")
            .eq("colecao", "performance_regras").eq("apagado", false).order("id").limit(1000);
          if (error) throw new Error(error.message);
          if ((data || []).length >= 1000) throw new Error("Limite de versões da regra atingido.");
          return (data || []).map((r: any) => r.registro).filter((r: any) => r && typeof r === "object")
            .sort((a: any, b: any) => (Number(b.versao) || 0) - (Number(a.versao) || 0));
        };
        // O último dia já fechado: o maior `ate` dos fechamentos gravados.
        const lerFechadoAte = async () => {
          const { data, error } = await sb.from("pcp_registros").select("registro->>ate")
            .eq("colecao", "performance_fechamentos").eq("apagado", false).limit(1000);
          if (error) throw new Error(error.message);
          if ((data || []).length >= 1000) throw new Error("Limite de fechamentos atingido na leitura.");
          return (data || []).map((r: any) => String(r.ate ?? "")).filter((d: string) => REGRAS.dataValida(d)).sort().pop() || "";
        };
        const [versoes, fechadoAte] = await Promise.all([lerVersoes(), lerFechadoAte()]);
        if (acao === "performanceRegras") {
          const vigente = REGRAS.regraVigente(versoes, perfDia(new Date().toISOString()));
          return resp({ versoes, fechadoAte, embutida: REGRAS.REGRA_EMBUTIDA, vigenteHoje: vigente ? vigente.id : null });
        }
        const requestId = String(body.requestId || "");
        if (!/^[a-zA-Z0-9-]{10,80}$/.test(requestId)) return resp({ error: "Identificação do pedido inválida." }, 422);
        /* Mesmo pedido de novo (rede caiu na resposta): a mesma versão, sem
           gravar outra. Mas só se o CONTEÚDO for o mesmo: mesmo pedido com outra
           comissão, outra data ou outro motivo (corrigido depois de um erro de
           rede) é 409, para a tela nunca dizer "gravada" sobre um valor que não
           foi o gravado. A regra pedida é completada com a mesma base da
           gravação original (a versão anterior a ela, ou a embutida). */
        const repetida = versoes.find((v: any) => v.requestId === requestId);
        if (repetida) {
          const baseRep = versoes.find((v: any) => Number(v.versao) === Number(repetida.versao) - 1) || REGRAS.REGRA_EMBUTIDA;
          const pedida = JSON.stringify(REGRAS.normalizarRegra(REGRAS.completarRegra(body.regra, baseRep)));
          const gravada = JSON.stringify(REGRAS.normalizarRegra(repetida));
          if (pedida !== gravada || String(body.motivo || "").trim() !== String(repetida.motivo || ""))
            return resp({ error: `Este pedido já gravou a versão ${repetida.versao} com outros valores. Recarregue as regras e crie outra versão, se precisar.` }, 409);
          return resp({ ok: true, regra: repetida, repetida: true });
        }
        const ultima = versoes[0] || null;
        if (String(ultima?.id || "") !== String(body.anterior || ""))
          return resp({ error: "Outra versão da regra foi criada. Recarregue as regras e confira antes de gravar." }, 409);
        const motivo = String(body.motivo || "").trim();
        if (motivo.length < 5 || motivo.length > 300)
          return resp({ error: "Informe o motivo da nova versão, de 5 a 300 caracteres." }, 422);
        const regra = REGRAS.completarRegra(body.regra, ultima || REGRAS.REGRA_EMBUTIDA);
        const erroRegra = REGRAS.validarRegra(regra);
        if (erroRegra) return resp({ error: erroRegra }, 422);
        if (REGRAS.fechamentoBloqueia(regra.validaDesde, fechadoAte))
          return resp({ error: `A data ${REGRAS.dataBR(regra.validaDesde)} cai em período já fechado (até ${REGRAS.dataBR(fechadoAte)}). Escolha uma data depois de ${REGRAS.dataBR(fechadoAte)}.` }, 409);
        /* ANTES DO PROGRAMA (revisão da onda a3): uma versão que começa antes de
           01/10/2026 punha setembro no programa e a ficha dizia uma perda que a
           apuração não aplica. Recusa com a frase da régua (o formulário diz a
           mesma); esta ação é chamada na hora, fora da fila, e nada se grava. */
        if (REGRAS.antesDoPrograma(regra.validaDesde)) return resp({ error: REGRAS.TEXTO_ANTES_DO_PROGRAMA }, 409);
        const autor = await autorAuditoria();
        const versao = (Number(ultima?.versao) || 0) + 1, criadaEm = new Date().toISOString();
        const registro = { ...regra, id: crypto.randomUUID(), versao, requestId, motivo, criadaEm,
          autor: { nome: String(autor.nome || "").slice(0, 120), login: String(autor.login || "").slice(0, 120), papel: String(autor.papel || ""), porId: ehIdPessoa(autor.porId) ? String(autor.porId) : "" } };
        // A linha leva o número da versão: duas gravações ao mesmo tempo batem na chave (23505).
        const { error } = await sb.from("pcp_registros").insert({ colecao: "performance_regras", id: "v" + String(versao).padStart(6, "0"), registro, apagado: false, atualizado_em: criadaEm });
        if (error) {
          if (error.code === "23505") return resp({ error: "Outra versão da regra foi criada ao mesmo tempo. Recarregue as regras e confira antes de gravar." }, 409);
          throw new Error(error.message);
        }
        await auditar("regras", "regra-nova", { campos: ["performanceRegras"], antes: { performanceRegras: ultima }, depois: { performanceRegras: registro } });
        return resp({ ok: true, regra: registro });
      }

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

      // A cópia do Hub (M20): só a máquina, só leitura. Ver paginaExportacao.
      case "exportarBackup": {
        if (!ehMaquina || cracha) return resp({ error: "A exportação completa é só da cópia de segurança do Hub." }, 403);
        const cursor = lerCursorExportacao(body.cursor);
        if (cursor === undefined) return resp({ error: "Cursor de exportação inválido. Recomece do início." }, 400);
        const limite = Number.isInteger(body.limite) && body.limite >= 1 && body.limite <= EXPORTACAO_PAGINA ? body.limite : EXPORTACAO_PAGINA;
        const out: Record<string, unknown> = { ok: true, formato: "pcp-exportacao-1", geradoEm: new Date().toISOString() };
        if (!cursor) {
          // A contagem de ANTES vem antes da primeira leitura.
          out.contagemInicio = await contagemExportacao();
          const { config, versao } = await getCfgComVersao();
          out.cfg = config; out.cfgVersao = versao;
        }
        const pag = await paginaExportacao(cursor, limite);
        out.registros = pag.registros; out.demandas = pag.demandas; out.meta = pag.meta; out.nextCursor = pag.nextCursor;
        if (pag.terminou) out.contagemFim = await contagemExportacao();
        return resp(out);
      }

      // Pagina NO BANCO (antes carregava todas as chaves e fatiava na memoria --
      // com 496 O.S isso ja era uma varredura completa a cada consulta).
      case "list": {
        /* TRES MODOS, UMA PORTA (14/09/2026). Medido no app parado: 6 paginas
           de 150 O.S a cada 30 s, 5 MB por minuto e meio POR APARELHO, para
           receber em media 2 O.S por hora. Em 44 das ultimas 48 horas nada
           mudou. Numa fabrica com wifi fraco isso e "a conexao esta ruim".

           1. INCREMENTAL (`since`): so o que mudou depois do carimbo -- inclui
              LAPIDES (apagado=true) como {id, apagado:true}, senao a exclusao
              feita em outro aparelho nunca chega. Devolve `agora` (relogio do
              SERVIDOR) para o proximo cursor: relogio de tablet nao serve.
           2. COMPLETO por ESCOPO (`escopo`): 'recentes' = abertas + finalizadas
              nos ultimos `dias` (ordem do dono: "so baixar as abertas; as
              finalizadas so se um dia fizer pesquisa" -- as recentes ficam
              porque Performance/Entregas/Retrabalho leem delas). 'tudo' e o
              que o app antigo pede e continua funcionando.
           3. BUSCA (`escopo:'finalizadas'` + de/ate/q): historico sob demanda,
              paginado, sem entrar no cache do aparelho. */
        const PAGE = 150;
        const agora = new Date().toISOString();
        const soExecucao = ehToqueNoNome;
        const podar = saida;
        const pessoasPull = soExecucao ? await pessoasReq() : null;
        const daEquipe = (reg: any) => pertenceEquipe(reg, quemToque(), pessoasPull);

        if (body.since) {
          const since = String(body.since);
          const { data, error } = await sb.from("pcp_registros")
            .select("id, registro, apagado, atualizado_em")
            .eq("colecao", "os").gt("atualizado_em", since)
            .order("atualizado_em").limit(500);
          if (error) throw new Error(error.message);
          const linhas = data ?? [];
          return resp({
            os: linhas.map((r: any) => r.apagado || (soExecucao && !daEquipe(r.registro)) ? { id: r.id, apagado: true } : podar(r.registro)),
            agora, incremental: true,
            // O aparelho da gestão precisa saber que este crachá só registra a
            // execução (crachá de toque antigo não traz montagemIndividual).
            soExecucao,
            // 500 mudancas desde o cursor nao e "incremental": o cliente refaz completo.
            cheio: linhas.length >= 500,
            total: await contarRegs("os"),
          });
        }

        const escopo = String(body.escopo || "tudo");
        const dias = Math.min(365, Math.max(7, Number(body.dias) || 60));
        let q = sb.from("pcp_registros").select("id, registro")
          .eq("colecao", "os").eq("apagado", false).order("id").limit(PAGE);
        if (escopo === "abertas") {
          q = q.or("registro->>finalizadaEm.is.null,registro->>finalizadaEm.eq.");
        } else if (escopo === "recentes") {
          const corte = new Date(Date.now() - dias * 864e5).toISOString();
          q = q.or(`registro->>finalizadaEm.is.null,registro->>finalizadaEm.eq.,registro->>finalizadaEm.gte.${corte}`);
        } else if (escopo === "finalizadas") {
          q = q.not("registro->>finalizadaEm", "is", null).neq("registro->>finalizadaEm", "");
          if (body.de) q = q.gte("registro->>finalizadaEm", String(body.de));
          if (body.ate) q = q.lte("registro->>finalizadaEm", String(body.ate) + "T23:59:59.999Z");
          const termo = String(body.q ?? "").trim().replace(/[%,()*]/g, " ").trim();
          // A tela promete buscar também por endereço e serviço.
          if (termo) q = q.or(`registro->>numero.ilike.*${termo}*,registro->>cliente.ilike.*${termo}*,registro->>endereco.ilike.*${termo}*,registro->>servico.ilike.*${termo}*`);
        }
        // `faixa`: a primeira e a ultima finalizacao que existem -- os chips de
        // ano da vista Arquivados nascem daqui, nao de um chute. Duas consultas
        // de uma linha, so quando pedido.
        let faixa: any = undefined;
        if (body.faixa) {
          const base = () => sb.from("pcp_registros").select("registro->>finalizadaEm").eq("colecao", "os").eq("apagado", false)
            .not("registro->>finalizadaEm", "is", null).neq("registro->>finalizadaEm", "").limit(1);
          const [{ data: a }, { data: z }] = await Promise.all([
            base().order("registro->>finalizadaEm", { ascending: true }),
            base().order("registro->>finalizadaEm", { ascending: false }),
          ]);
          faixa = { de: String(a?.[0]?.finalizadaEm ?? "").slice(0, 10), ate: String(z?.[0]?.finalizadaEm ?? "").slice(0, 10) };
        }
        if (body.after != null) q = q.gt("id", String(body.after));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const linhas = data ?? [];
        /* CPF/CNPJ E VALOR NAO VAO PARA QUEM ENTROU PELO NOME (ver podarToque):
           o cracha de toque sai de um primeiro nome, sem senha; precisa de
           cliente, endereco e contato, nao do documento de ninguem. */
        return resp({
          os: linhas.filter((r: any) => !soExecucao || daEquipe(r.registro)).map((r: any) => podar(r.registro)),
          total: await contarRegs("os"),
          nextAfter: linhas.length === PAGE ? linhas[linhas.length - 1].id : null,
          nextOffset: null,
          agora, escopo, dias, faixa, soExecucao,
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
            if (canonico) return resp({ ok: true, os: saida(canonico), duplicataEvitada: true });
          }
        }

        const {data:linhaAtual,error:erroAtual} = await sb.from("pcp_registros").select("registro,atualizado_em,apagado").eq("colecao","os").eq("id",os.id).maybeSingle();
        if (erroAtual) throw new Error(erroAtual.message);
        if(linhaAtual?.apagado) return resp({error:"O.S. excluída. Sua edição continua pendente; peça à gestão para recuperar o registro antes de reenviar.",restauracaoNecessaria:true},422);
        if(!linhaAtual && os.numero) {
          const {data:morta,error:err}=await sb.from("pcp_registros").select("id").eq("colecao","os").eq("apagado",true).eq("registro->>numero",String(os.numero).trim()).limit(1).maybeSingle();
          if(err)throw new Error(err.message);
          if(morta)return resp({error:"Número de O.S. excluída. A gestão precisa recuperar o registro original com motivo; sua edição permanece pendente.",restauracaoNecessaria:true},422);
        }
        const existing = linhaAtual?.registro ?? null;
        /* REENVIO DA MESMA GRAVAÇÃO. Com sinal ruim a O.S. chega e grava, mas a
           resposta não volta em 15 s; o aparelho reenvia o mesmo item com o rev
           antigo, e isso abria "Conflito de edição" com a versão do próprio
           autor. Mesmo atualizadoEm do autor e rev logo seguinte ao que ele
           leu = é a gravação dele: responde como se tivesse gravado agora. */
        if (existing && typeof os.rev === "number" && typeof existing.rev === "number" && existing.rev === os.rev + 1 &&
            existing.atualizadoEm && existing.atualizadoEm === os.atualizadoEm) {
          /* A divisão que o aparelho reenviou e não é a gravada foi descartada
             na primeira vez (a resposta se perdeu): diz de novo, para ele repor. */
          const reenviouDescartada = !ehToqueNoNome && alocacaoMudou(os.alocacao, existing.alocacao);
          // As marcas de entrega que caíram na primeira vez (E3): diz de novo.
          const marcasFora = ehToqueNoNome ? [] : entregasNaoGravadas(os, existing);
          const desc = [...(reenviouDescartada ? ["alocacao"] : []), ...(marcasFora.length ? ["entregas"] : [])];
          return resp({ ok: true, os: saida(existing), repetido: true,
            ...(desc.length ? { descartado: desc } : {}),
            ...(reenviouDescartada ? { descartadoMotivo: { alocacao: "A divisão enviada não é a que ficou gravada no servidor." } } : {}),
            ...(marcasFora.length ? { entregasRecusadas: marcasFora } : {}) });
        }
        const erroConclusao = validarConclusao(os,existing,String(cracha?.papel || ''));
        /* Para o crachá de toque a conclusão sem prova não derruba o envio: a
           finalização fica de fora, com aviso, e check-in, fotos e itens gravam.
           O 422 prendia tudo na fila do celular. */
        if (erroConclusao && ehToqueNoNome) {
          delete os.finalizadaEm; delete os.finalizadoPor;
          avisosToque.push("A O.S. não foi finalizada. " + erroConclusao);
        } else if (erroConclusao) return resp({error:erroConclusao},422);
        if (os.finalizadaEm && !existing?.finalizadaEm && os.justificativaConclusao) {
          os.excecaoConclusao = {motivo:String(os.justificativaConclusao).trim(),por:cracha?.nome || cracha?.sub,em:new Date().toISOString()};
        }
        const erroMomento = validarMomentos(os);
        if (erroMomento) return resp({error:erroMomento},400);
        /* Local do check-in: só os quatro campos que as telas gravam, com número
           de verdade (a mesma régua do mesclarToqueNoNome). Qualquer outra forma
           vira texto no mapa da gestão; fica o que já estava gravado. */
        if (os.checkinGPS != null && os.checkinGPS !== "") {
          const g = os.checkinGPS;
          const ok = g && typeof g === "object" && !Array.isArray(g) && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng));
          os.checkinGPS = ok
            ? { lat: Number(g.lat), lng: Number(g.lng), precisao: Number.isFinite(Number(g.precisao)) ? Number(g.precisao) : 0, ts: String(g.ts ?? "").slice(0, 40) }
            : (existing?.checkinGPS ?? null);
        }
        // Remarcar invalida a confirmação anterior; não inventa confirmação de hoje.
        // Por conteúdo (canon): o jsonb devolve as chaves em outra ordem.
        /* MENOS COM A EQUIPE NA RUA (saiu e não voltou), a mesma exceção do
           setField do app.js: estender a duração com a equipe no cliente não é
           remarcar. Zerar aqui fazia a O.S. em andamento voltar a "Agendada" e
           o servidor recusar a finalização do espelho por falta de confirmação. */
        const equipeNaRua = !!(existing && (existing.horaSaida || existing.saidaEm) && !(existing.horaRetorno || existing.retornoEm));
        if (existing && !equipeNaRua && canon(existing.instalacao) !== canon(os.instalacao) && !(os.confirmacao === "Confirmado" && os.confEm && os.confEm !== existing.confEm)) {
          os.confirmacao = ''; os.confEm = ''; os.confHora = ''; os.confPor = '';
          os.carroLiberado = false; os.carroLiberadoEm = ''; os.carroLiberadoPor = '';
        }
        if (os.confirmacao === "Confirmado" && (existing?.confirmacao !== "Confirmado" || os.confEm !== existing?.confEm)) {
          os.confPor = cracha?.nome || cracha?.sub || 'Integração';
          if (!os.confEm || !Number.isFinite(Date.parse(os.confEm))) os.confEm = new Date().toISOString();
          os.confRecebidoEm = new Date().toISOString();
        }

        // Cache velho: aparelho re-importa um ESQUELETO por cima de ficha ja
        // trabalhada no servidor (mesmo id canonico, atualizadoEm mais novo).
        // Esqueleto nunca vence ficha com trabalho — devolve a do servidor e o
        // pull realinha o aparelho.
        /* Só o que chega SEM rev pode ser esqueleto: cache velho e reimportação
           nascem sem ele. Gravação do app carrega o rev que leu (rev velho já
           vira conflito logo abaixo). Sem esta condição, "Voltar ao PCP" e o
           Desfazer de liberar/parado numa O.S. do ERP ainda sem equipe tinham
           a cara de esqueleto e eram descartados calados (revisão de 23/09). */
        if (os.origemMubisys && existing && typeof os.rev !== "number") {
          /* `paradoClienteEm` entra nas duas listas de proposito, ainda
             que hoje seja redundante: marcar "o cliente nao liberou" so
             aparece em O.S ja liberada pelo PCP, e `liberadoPCP` ja esta aqui.
             A protecao existe, mas por TABELA -- some no dia em que alguem
             permitir marcar antes da liberacao do PCP, e some em silencio: o
             esqueleto do Mubisys passa por cima e a marca do cliente
             desaparece sem erro nenhum. Uma palavra a mais custa nada; achar
             esse defeito depois custa uma tarde. */
          const semTrabalho = !os.liberadoPCP && !os.finalizadaEm &&
            !(os.fotosCheckinIds ?? []).length && !(os.fotosRetornoIds ?? []).length &&
            !(os.equipe ?? []).length && !os.confirmacao && !os.horaSaida &&
            !os.paradoClienteEm;
          const comTrabalho = !!(existing.liberadoPCP || existing.finalizadaEm ||
            (existing.fotosCheckinIds ?? []).length || (existing.fotosRetornoIds ?? []).length ||
            (existing.equipe ?? []).length || existing.confirmacao || existing.horaSaida ||
            existing.paradoClienteEm || temCampoGestao(existing) || temEntregaItem(existing));
          if (semTrabalho && comTrabalho) return resp({ ok: true, os: saida(existing), duplicataEvitada: true });
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
            if (revAtual !== os.rev) return resp({ conflito: true, servidor: saida(existing) });
          } else if (
            existing.atualizadoEm && os.atualizadoEm &&
            new Date(existing.atualizadoEm).getTime() > new Date(os.atualizadoEm).getTime()
          ) {
            return resp({ conflito: true, servidor: saida(existing) });
          }
        }

        /* TROCA O CONTEUDO DE `os` NO LUGAR: o resto do upsert le este mesmo
           objeto. */
        const trocarOS = (novo: any) => { for (const k of Object.keys(os)) if (!(k in novo)) delete os[k]; Object.assign(os, novo); };
        const papelUp = String(cracha?.papel ?? "");
        /* CODIGO FIXO DO ITEM (E1): item sem codigo ganha o dele nesta
           gravacao (sem gravacao em lote); a aba antiga que manda a lista sem
           codigo recebe de volta o codigo gravado, casando pelo casamento de
           hoje. Vale para todos, toque e maquina inclusive. Nada aqui recusa. */
        if (!gestaoVeTudo) {
          try { trocarOS(preservarValoresPCP(os, existing)); }
          catch(e) { return resp({error:(e as Error).message},422); }
        }
        trocarOS(preservarItens(os, existing).os);
        /* CANCELAMENTO DA O.S. (F16). Regras em _shared/pcp-status.mjs
           (carimbarCancelamento): so o PEDIDO muda o campo ({ cancelar: true,
           motivo } ou { desfazer: true }), so de admin e pcp, com motivo de 15
           letras ou mais; o carimbo e do cracha e do servidor; desfazer guarda
           quem desfez. A copia da aba antiga, o null e a marca forjada ficam
           com o gravado. Nada aqui e 422: o que nao entra vira aviso. So le o
           RH quando o pedido muda o gravado.
           Decide ANTES das marcas de item (revisao da F16): a fila junta o
           "Desfazer cancelamento" e a marca feita depois dele no mesmo envio,
           e a marca lia o cancelamento gravado e era recusada. As marcas e o
           lancamento veem o desfazer aceito neste envio; o pedido de cancelar
           so vale depois da gravacao (cancelamentoParaMarcas). O campo e
           gravado depois do preservarAusentes, como antes. */
        const veioCancelamento = Object.prototype.hasOwnProperty.call(os, "cancelamento") ? os.cancelamento : undefined;
        const cancelamentoDecidido: { tem: boolean, valor: any, avisos: string[] } = { tem: false, valor: undefined, avisos: [] };
        {
          const gestaoCanc = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraCanc = new Date().toISOString();
          // A base e o gravado: o que o preservarAusentes deixa no campo (cancelamento so cresce por pedido).
          const baseCanc = preservarAusentes(os, existing, {}, ["cancelamento"]);
          const rodarCanc = (autor: any) => carimbarCancelamento(veioCancelamento, baseCanc, existing, autor, agoraCanc, { pode: gestaoCanc, avisar: !ehMaquina && !ehToqueNoNome });
          let rc = rodarCanc({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (cancelamentoMudou(baseCanc.cancelamento, rc.os.cancelamento)) rc = rodarCanc(await autorAuditoria());
          cancelamentoDecidido.tem = Object.prototype.hasOwnProperty.call(rc.os, "cancelamento");
          cancelamentoDecidido.valor = rc.os.cancelamento;
          cancelamentoDecidido.avisos = rc.avisos;
        }
        const cancelamentoDoEnvio = cancelamentoParaMarcas(existing?.cancelamento, cancelamentoDecidido.valor);
        /* MARCAS DE ENTREGA POR ITEM (E3). Regras em _shared
           (guardarEntregasItens): só acréscimo, parte do gravado; marca nova
           de admin, pcp e operação com senha (balcão), conferida pelo motor
           da E2 (permissão, saldo, dia, teto); autor, ID e hora do crachá e
           do servidor; id repetido ignorado; item com marca não sai da lista.
           O celular (E5: o toque, cuja mescla já partiu do gravado e trouxe
           só as marcas de id novo, e a montagem com senha) só entrega e
           retira, e a marca sai DECLARADA; a máquina não marca. O que não
           passa vira aviso, nunca 422. O autor só é lido do RH quando entra
           marca nova, e é o crachá DESTE envio. */
        /* A marca recusada volta na resposta (`descartado` com os ids), para o
           aparelho tirá-la da cópia e da fila: senão a mesma cópia a mandava
           de novo e, com o saldo liberado, ela entrava calada. */
        let entregasRecusadas: any[] = [];
        {
          const papelEnt = ehMaquina ? "maquina" : ehToqueNoNome ? "toque" : papelUp;
          const agoraEnt = new Date().toISOString();
          const rodarEnt = (autor: any) => guardarEntregasItens(os, existing, { papel: papelEnt, avisar: !ehMaquina, autor, agora: agoraEnt, cancelamento: cancelamentoDoEnvio });
          let ge = rodarEnt({ nome: String(cracha?.nome || cracha?.sub || ""), porId: "" });
          if (ge.eventos.length) ge = rodarEnt(await autorAuditoria());
          trocarOS(ge.os);
          avisosToque.push(...ge.avisos);
          if (!ehMaquina && ge.recusadas.length) entregasRecusadas = ge.recusadas;
          if (ehToqueNoNome && entregasForaToque.length) entregasRecusadas = [...entregasRecusadas, ...entregasForaToque].slice(0, 200);
        }
        /* CAMPOS DA GESTAO (F01): ausente fica o gravado, valor novo ainda nao
           entra, null explicito de admin/pcp limpa. O toque ja parte do gravado
           (mesclarToqueNoNome) e nao limpa; a maquina fica com o gravado. */
        // O que o aparelho mandou de prazo e retorno (F15), antes da preservacao.
        const veioRetorno = Object.prototype.hasOwnProperty.call(os, "retornoPrevisto") ? os.retornoPrevisto : undefined;
        const veioPrazo = Object.prototype.hasOwnProperty.call(os, "prazoCombinado") ? os.prazoCombinado : undefined;
        // A chegada conferida do carro (F14), antes da preservacao.
        const veioChegada = Object.prototype.hasOwnProperty.call(os, "retornoConferido") ? os.retornoConferido : undefined;
        // As chegadas conferidas por dia da jornada (revisão da F17), antes da preservação.
        const veioChegadas = Object.prototype.hasOwnProperty.call(os, "chegadasConferidas") ? os.chegadasConferidas : undefined;
        // A divisão da equipe que o aparelho mandou (F08), antes da preservação.
        const veioAlocacao = Object.prototype.hasOwnProperty.call(os, "alocacao") ? os.alocacao : undefined;
        // As ocorrências manuais e os abonos (F17), antes da preservação: só os PEDIDOS entram.
        const veioOcorrencias = Object.prototype.hasOwnProperty.call(os, "ocorrencias") ? os.ocorrencias : undefined;
        const veioAbonos = Object.prototype.hasOwnProperty.call(os, "abonos") ? os.abonos : undefined;
        // A etapa de origem do retrabalho (D-010), antes da guarda do retrabalho, que a devolve calada a quem não é da gestão.
        const veioOrigem = Object.prototype.hasOwnProperty.call(os, "etapaOrigem") ? os.etapaOrigem : undefined;
        trocarOS(preservarAusentes(os, existing, { podeLimpar: !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp) }));
        /* O RETRABALHO GRAVADO SÓ A GESTÃO DESMARCA (F17). Regras em _shared
           (guardarRetrabalho): marcar vale na hora, venha de onde vier;
           montagem com senha, operação e máquina ficam com o gravado, com
           aviso para quem tem senha. O toque já partiu do gravado na mescla. */
        {
          const podeRetrab = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraRetrab = new Date().toISOString();
          const rodarRetrab = (autor: any) => guardarRetrabalho(os, existing, { pode: podeRetrab, avisar: !ehMaquina && !ehToqueNoNome, autor, agora: agoraRetrab });
          let gr = rodarRetrab({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          // A resposta nova da pergunta leva o ID do RH de quem respondeu (o RH só é lido quando ela muda).
          if (gr.mudouPergunta) gr = rodarRetrab(await autorAuditoria());
          trocarOS(gr.os);
          if (gr.aviso) avisosToque.push(gr.aviso);
        }
        /* A ETAPA DE ORIGEM DO RETRABALHO (D-010). Regras em _shared
           (guardarOrigemRetrabalho): decide dinheiro pela régua das perdas
           (o retrabalho de Instalação tira os pontos e a comissão), então só
           admin e pcp gravam; marcar pela gestão exige a origem; trocar a
           gravada exige o motivo (o pedido etapaOrigemMotivo nunca é gravado);
           o retrabalho que o celular marca entra com a origem a definir.
           Carimbo do crachá e do servidor em etapaOrigemLog, e o diário leva o
           antes e o depois. Nada aqui é 422: o que não entra vira aviso. */
        {
          const podeOrigem = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraOrigem = new Date().toISOString();
          const rodarOrigem = (autor: any) => guardarOrigemRetrabalho(os, existing, autor, agoraOrigem, { pode: podeOrigem, avisar: !ehMaquina && !ehToqueNoNome, veio: veioOrigem });
          let go = rodarOrigem({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (go.mudou) go = rodarOrigem(await autorAuditoria());
          trocarOS(go.os);
          avisosToque.push(...go.avisos);
        }
        /* ERP DIZ ENTREGUE, PCP TEM SALDO (E7). Regras em _shared
           (guardarSaldoERP): a marca da baixa (erpComSaldo) é só do servidor,
           e a cópia do aparelho não a cria nem a apaga; o "Manter aberta"
           (erpSaldoDecisao) só admin e pcp gravam, com autor e ID do crachá.
           O que não entra vira aviso, nunca 422. Só lê o RH quando decide. */
        {
          const gestaoE7 = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraE7 = new Date().toISOString();
          const rodarE7 = (autor: any) => guardarSaldoERP(os, existing, { pode: gestaoE7, avisar: !ehMaquina, autor, agora: agoraE7 });
          let g7 = rodarE7({ nome: String(cracha?.nome || cracha?.sub || ""), porId: "" });
          if (g7.decidiu) g7 = rodarE7(await autorAuditoria());
          trocarOS(g7.os);
          if (g7.aviso) avisosToque.push(g7.aviso);
        }
        /* A DIVISÃO DA EQUIPE DENTRO DA O.S. (F08). Regras em _shared
           (sanearAlocacao): só admin e pcp mudam; conferida pelo motor e pela
           chave estrangeira (equipe no cadastro, pessoa no RH); o final é
           recalculado aqui; os.equipe sai dela; inválida é descartada com
           aviso e `descartado` na resposta, nunca 422. O RH e o cadastro só
           são lidos quando a gestão mandou uma divisão diferente da gravada
           (ou quando a gravada espera a conferência do RH). Roda ANTES do
           prazo combinado (F15): a equipe que sai da divisão é a que o F15
           tem de ver (O.S. já entregue que ganha equipe só pela divisão fica
           "sem prazo", como a que ganha pela lista). */
        let descarteAlocacao: any = null;
        {
          const podeAloc = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          // A divisão gravada com o RH fora do ar é conferida na próxima gravação da gestão.
          const conferir = podeAloc && (alocacaoMudou(veioAlocacao, existing?.alocacao) || existing?.alocacao?.conferirRH === true);
          let pessoasAloc: any = null, equipesAloc: any[] = [];
          if (conferir) {
            try { pessoasAloc = await pessoasReq(); } catch { pessoasAloc = null; }
            equipesAloc = ((await getCfg()) ?? {})?.performancePCP?.equipes ?? [];
          }
          const agoraAloc = new Date().toISOString();
          const rodarAloc = (autor: any) => sanearAlocacao(veioAlocacao, os, existing, { pode: podeAloc, avisar: !ehMaquina && !ehToqueNoNome,
            autor, agora: agoraAloc, equipes: equipesAloc, pessoas: pessoasAloc });
          let ra = rodarAloc({ nome: String(cracha?.nome || cracha?.sub || (ehMaquina ? "Integração" : "")), porId: "" });
          if (ra.mudou) ra = rodarAloc(await autorAuditoria());
          trocarOS(ra.os);
          avisosToque.push(...ra.avisos);
          if (ra.descartado) descarteAlocacao = { ...ra.descartado, diario: diarioDescarteAlocacao(existing, veioAlocacao, ra.descartado.motivo) };
        }
        /* PRAZO COMBINADO E RETORNO PREVISTO (F15). Regras em _shared: o
           retorno previsto so admin e pcp digitam, carimbado por dia; o prazo
           nasce uma vez (primeira data agendada), nao anda com a remarcacao e
           so a gestao corrige, com motivo. Fora de instalacao: nao zera a
           confirmacao nem o carro. Nada aqui e 422: o que nao entra vira aviso.
           Roda primeiro sem ler o RH; so quando algo muda busca o autor. */
        {
          const gestaoF15 = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraF15 = new Date().toISOString();
          /* O historico de remarcacoes so cresce, e so quando a data muda (o
             prazo das O.S. sem prazo gravado e lido dele): o que o aparelho
             reescreveu no trecho gravado nao entra. */
          trocarOS(guardarAgendaLog(os, existing, { por: String(cracha?.nome || cracha?.sub || ""), agora: agoraF15, maquina: ehMaquina }));
          const rodarF15 = (autor: any) => {
            const rp = carimbarRetornoPrevisto(veioRetorno, os, existing, autor, agoraF15, { pode: gestaoF15, avisar: !ehMaquina && !ehToqueNoNome });
            const pc = carimbarPrazoCombinado(veioPrazo, rp.os, existing, autor, agoraF15, { podeCorrigir: gestaoF15, toque: ehToqueNoNome, avisar: !ehMaquina && !ehToqueNoNome });
            return { os: pc.os, avisos: [...rp.avisos, ...pc.avisos] };
          };
          let f15 = rodarF15({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (canon(f15.os.retornoPrevisto) !== canon(os.retornoPrevisto) || canon(f15.os.prazoCombinado) !== canon(os.prazoCombinado))
            f15 = rodarF15(await autorAuditoria());
          trocarOS(f15.os);
          avisosToque.push(...f15.avisos);
        }
        /* O CANCELAMENTO DECIDIDO LA EM CIMA (F16) entra aqui, depois do
           preservarAusentes (que deixou o gravado): o pedido aceito troca o
           campo; sem pedido, fica o gravado. */
        if (cancelamentoDecidido.tem) os.cancelamento = cancelamentoDecidido.valor; else delete os.cancelamento;
        avisosToque.push(...cancelamentoDecidido.avisos);
        /* CHEGADA CONFERIDA DO CARRO (F14, retornoConferido). Regras em _shared
           (carimbarRetornoConferido): so admin e pcp gravam; o carimbo (quem,
           ID, login, recebidoEm) e daqui; a mesma hora mantem o carimbo; a
           copia de outra versao (recebidoEm diferente do gravado) nao apaga;
           invalido fica de fora com aviso, nunca 422. O RH so e lido quando
           a chegada muda. */
        {
          const gestaoChegada = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const agoraChegada = new Date().toISOString();
          const rodarChegada = (autor: any) => carimbarRetornoConferido(veioChegada, os, existing, autor, agoraChegada, { pode: gestaoChegada, avisar: !ehMaquina && !ehToqueNoNome });
          let rc = rodarChegada({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (canon(rc.os.retornoConferido) !== canon(existing?.retornoConferido)) rc = rodarChegada(await autorAuditoria());
          trocarOS(rc.os);
          avisosToque.push(...rc.avisos);
          /* AS CHEGADAS POR DIA DA JORNADA (revisão da F17). Regras em _shared
             (carimbarChegadas): cada dia muda só pelo pedido do dia, sem
             apagar os outros; a aba v142, que só manda o retornoConferido,
             alimenta a lista no dia dele; o retornoConferido vira a chegada
             do último dia. Só admin e pcp; nada aqui é 422. */
          const rodarChegadas = (autor: any) => carimbarChegadas(veioChegadas, os, existing, autor, agoraChegada, { pode: gestaoChegada, avisar: !ehMaquina && !ehToqueNoNome });
          let cs = rodarChegadas({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (canon(cs.os.chegadasConferidas ?? null) !== canon(existing?.chegadasConferidas ?? null)) cs = rodarChegadas(await autorAuditoria());
          trocarOS(cs.os);
          avisosToque.push(...cs.avisos);
        }
        /* ENTREGA LANCADA (F01): carimbo do servidor (por, porConta, porId, em).
           Lanca quem tem o botao e entrou com senha; o toque sem senha, a
           maquina e o comercial ficam com o gravado. Nada aqui e 422: data
           invalida fica de fora com aviso. */
        {
          const podeLancar = !ehMaquina && !ehToqueNoNome && ["admin", "pcp", "operacao", "montagem"].includes(papelUp);
          const autorEntrega = podeLancar ? (entregaLancadaMudou(os, existing) ? await autorAuditoria() : { nome: "", login: "", porId: "" }) : null;
          // Desfazer so por pedido explicito ({ desfazer: true }) e so da gestao (revisao da F01).
          const podeDesfazer = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          // O.S. cancelada (revisão da F16): o lançamento fica o gravado, com aviso; a mesma régua das marcas de item.
          const canceladaLanc = !!existing && cancelada({ ...existing, cancelamento: cancelamentoDoEnvio });
          const el = carimbarEntregaLancada(os, existing, autorEntrega, new Date().toISOString(), { podeDesfazer, cancelada: canceladaLanc });
          trocarOS(el.os);
          if (el.aviso) avisosToque.push(el.aviso);
        }
        /* CONFERÊNCIA DA VOLTA (carro limpo, equipamentos): pesa na nota de cada
           instalador, então só a gestão escreve e o autor é o CRACHÁ. Revisão
           de 23/09/2026: "por" e "em" vinham do aparelho, e a conta de grupo
           'montagem' (com senha) gravava a própria avaliação. Outro papel não
           leva recusa -- um 422 trancaria a fila do aparelho --, só não muda o
           que está gravado. Ausência não apaga (cliente antigo não conhece o
           campo); apagar é responder "não conferido" nos dois. Resposta igual
           à gravada mantém o carimbo de quem respondeu. */
        {
          const antes = existing?.retornoConf && typeof existing.retornoConf === "object" ? existing.retornoConf : null;
          const gestao = !ehMaquina && ["admin", "pcp"].includes(String(cracha?.papel ?? ""));
          if (!gestao || os.retornoConf == null) {
            if (antes) os.retornoConf = antes; else delete os.retornoConf;
          } else {
            /* 24/09/2026: "arrumado" e "sem avaria" entraram com a fila da volta
               do carro, e as fotos da volta. Campo que o aparelho NÃO mandou fica
               como estava: a aba na v127 não conhece "arrumado" e, relida como
               vazio, apagaria a resposta de quem já está na versão nova. */
            const sn = (x: any) => x === "sim" || x === "nao" ? x : "";
            const rc = typeof os.retornoConf === "object" ? os.retornoConf : {};
            const PERGUNTAS = ["carroLimpo", "carroArrumado", "equipamentosOk", "semAvaria"];
            const n: any = {};
            for (const k of PERGUNTAS) n[k] = k in rc ? sn(rc[k]) : sn(antes?.[k]);
            n.obs = String(("obs" in rc ? rc.obs : antes?.obs) ?? "").slice(0, 300);
            const fotos = "fotos" in rc ? rc.fotos : antes?.fotos;
            n.fotos = Array.isArray(fotos) ? fotos.filter((f: unknown) => typeof f === "string" && f).slice(0, 10) : [];
            /* A CONFERÊNCIA É DA VIAGEM (onda volta, 12/10/2026): o servidor
               carimba o dia da volta que ela confere (dia). O aparelho que
               confere uma viagem nova manda o dia dela: a mesma resposta da
               viagem anterior, com outro dia, é conferência nova. A cópia que
               só devolve o que está gravado (o mesmo dia, ou sem o dia) não
               recarimba nada. */
            const diaViagem = CONFERENCIA_ENTREGA.diaDaVolta(os);
            const outroDia = "dia" in rc && String(rc.dia ?? "").trim() !== String(antes?.dia ?? "").trim();
            const mudou = PERGUNTAS.some((k) => n[k] !== sn(antes?.[k])) || outroDia;
            /* O ID DE 6 DÍGITOS EM porId (item 17 da fila de 11/10/2026): a
               pessoa é o ID do RH, não o login; o login vai em porConta. Sem
               ficha que dê o ID, porId fica vazio. A resposta igual mantém o
               carimbo de quem respondeu, como sempre. */
            if (!PERGUNTAS.some((k) => n[k])) { n.por = ""; n.porId = ""; n.em = ""; }
            else if (mudou) { const autorVolta = await autorAuditoria(); n.por = cracha?.nome || cracha?.sub || ""; n.porId = autorVolta.porId || ""; n.porConta = String(cracha?.sub ?? ""); n.em = new Date().toISOString(); if (diaViagem) n.dia = diaViagem; }
            else { n.por = antes?.por || ""; n.porId = antes?.porId || ""; if (antes?.porConta) n.porConta = antes.porConta; n.em = antes?.em || ""; if (antes?.dia) n.dia = antes.dia; }
            os.retornoConf = n;
          }
        }
        /* LIMPEZA DO CARRO REGISTRADA PELA EQUIPE (voltaEquipe, 25/09/2026). O
           espelho do instalador declara como o carro voltou; a gestão só lê.
           Espelho da regra acima: só quem entra pelo nome escreve (tem nome de
           pessoa, e a equipe já foi conferida na mescla), e o autor é o crachá.
           Gestão, operação, a conta de grupo 'montagem' e a máquina ficam com o
           que está gravado: a cópia velha da gestão salvando a volta não apaga
           nem forja a declaração. Depois de o PCP conferir, ela não muda mais.
           Nada aqui recusa: um 422 trancaria a fila do aparelho. */
        {
          const antes = existing?.voltaEquipe && typeof existing.voltaEquipe === "object" && !Array.isArray(existing.voltaEquipe) ? existing.voltaEquipe : null;
          const pode = ehToqueNoNome && !!existing && existing.tipo !== "interno" && !voltaConferida(existing.retornoConf);
          const agoraVe = new Date().toISOString();
          const rodarVe = (id: string) => sanearVoltaEquipe(os.voltaEquipe, antes, { nome: String(cracha?.nome || cracha?.sub || ""), sub: String(cracha?.sub ?? ""), id }, agoraVe);
          let r = pode ? rodarVe("") : antes;
          // A declaração nova leva o ID de 6 dígitos de quem registrou (item 17); o RH só é lido quando ela muda.
          if (pode && r && r !== antes && r.recebidoEm === agoraVe) r = rodarVe((await autorAuditoria()).porId || "");
          // Declaração do aparelho que ficou de fora por ser mais velha que a gravada: dito.
          if (pode && r && r === antes && os.voltaEquipe && typeof os.voltaEquipe === "object" && canon(os.voltaEquipe) !== canon(antes)
            && PERGUNTAS_VOLTA.some((k) => os.voltaEquipe[k] === "sim" || os.voltaEquipe[k] === "nao"))
            avisosToque.push(`A limpeza do carro não foi trocada: ${antes.por || "a equipe"} registrou depois. Confira com o colega.`);
          if (r) os.voltaEquipe = r; else delete os.voltaEquipe;
        }
        if (existing?.origemMubisys) {
          /* "✓ Conferi" da gestão apaga o selo do ERP: é a única escrita que
             estes campos aceitam do aparelho, e o carimbo é do crachá. O Conferi
             diz QUAL selo foi visto (erpConferiuSelo). Só o estado não basta:
             uma cópia velha com o selo vazio (o "Sobrescrever" do conflito)
             apagaria um selo NOVO que ninguém viu (revisão de 23/09/2026). */
          const conferiuERP = !!existing.erpConferirEm && !!os.erpConferiuSelo && os.erpConferiuSelo === existing.erpConferirEm && !ehMaquina && ["admin", "pcp"].includes(String(cracha?.papel ?? ""));
          delete os.erpConferiuSelo;
          for (const campo of ['cliente','servico','vendedor','dataEntrada','cnpjCpf','valorTotal','erpAlteracoes','erpConferirEm','erpConferidoEm','erpConferidoPor','statusERP','statusERPDesde','erpCarteira','erpSaiuDaCarteiraEm']) {
            if (campo in existing) os[campo] = existing[campo];
          }
          if (conferiuERP) { os.erpConferirEm = ""; os.erpConferidoEm = new Date().toISOString(); os.erpConferidoPor = cracha?.nome || cracha?.sub || ""; }
        }
        /* OS ITENS DO ERP (E8). SÓ COM A MESCLA LIGADA (MESCLA_ITENS_ERP, em
           _shared, hoje desligada até medir o formato do item no ERP):
           desligada, a gravação dos itens é exatamente a da v143. Regras em
           _shared (guardarItensERP), no molde do bloco acima: o que a mescla
           horária do ERP gravou nos itens não muda pela cópia do aparelho.
           Item que o ERP tirou não volta pela cópia velha; a marca 'saiu do
           ERP', a chave do ERP e a pergunta do produto são as gravadas
           (descrição, quantidade e valor não são travados aqui: a mescla da
           hora seguinte os acerta). Roda depois das marcas de entrega (E3): a
           entrega feita sem rede num item que o ERP tirou fica, com a marca
           'saiu do ERP'. Vale para todos; no toque, o item que o ERP tirou já
           ficou de fora antes, no mesclarToqueNoNome (pendência anotada no
           plano). Nada aqui recusa. */
        if (MESCLA_ITENS_ERP) {
          const gi = guardarItensERP(os, existing, { avisar: !ehMaquina && !ehToqueNoNome, agora: new Date().toISOString() });
          trocarOS(gi.os);
          avisosToque.push(...gi.avisos);
        }
        if (os.carroLiberado && !existing?.carroLiberado) {
          const diaSP = (x: string) => Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)-3*3600*1000).toISOString().slice(0,10) : '';
          const diaSaida = diaSP(os.carroLiberadoEm || '');
          if (!diaSaida || os.confirmacao !== 'Confirmado' || diaSP(os.confEm || '') !== diaSaida) {
            /* O espelho manda a O.S. inteira num envio só: recusar aqui prendia
               na fila, dali em diante, fotos, itens, retorno e finalização. Para
               o crachá de toque só a liberação fica de fora, com aviso. */
            if (!ehToqueNoNome) return resp({error:"Confirme o cliente no dia da saída antes de liberar o veículo."},422);
            os.carroLiberado = !!existing?.carroLiberado; os.carroLiberadoEm = existing?.carroLiberadoEm || ''; os.carroLiberadoPor = existing?.carroLiberadoPor || '';
            avisosToque.push("O carro não foi liberado: o cliente precisa ser confirmado no dia da saída. Fale com o PCP.");
          }
        }
        /* REABRIR FICA CARIMBADO NO SERVIDOR. Quem tira a finalização (o botão
           Reabrir, o "Sobrescrever" do conflito, um aparelho com app antigo) deixa
           reabertaEm/reabertaPor do crachá -- e a conciliação do ERP não fecha
           de novo O.S. reaberta depois da última baixa (temTrabalhoHumano). Antes,
           a O.S. reaberta voltava a ser "do ERP, fora da carteira" e era
           arquivada outra vez na hora seguinte. */
        if (existing?.finalizadaEm && !os.finalizadaEm) {
          os.reabertaEm = new Date().toISOString();
          os.reabertaPor = cracha?.nome || cracha?.sub || (ehMaquina ? "Integração" : "");
          delete os.arquivadaEm;
        }
        /* FINALIZADA PELO CELULAR (revisão da E5). Regras em _shared
           (carimbarFinalizacaoCampo): quem põe a finalização é o crachá sem
           senha ou a montagem com senha (papel 'montagem', os dois) => o
           servidor carimba finalizadaPorCampo, e o implícito dessa finalização
           é DECLARADO, não conferido. O aparelho não forja nem apaga o
           carimbo. Roda depois de toda regra que pode tirar a finalização
           (validarConclusao do toque) e só lê o RH quando carimba. */
        {
          const doCampo = !ehMaquina && (ehToqueNoNome || papelUp === "montagem");
          const autorFin = doCampo && finalizacaoMudou(os, existing) ? await autorAuditoria() : null;
          trocarOS(carimbarFinalizacaoCampo(os, existing, autorFin, new Date().toISOString()));
        }
        // Preserva o atualizadoEm do autor: reescrever com o relogio do servidor
        // misturava duas fontes de tempo e o proprio autor levava "conflito".
        // (Ele segue valendo para EXIBIR "alterado em"; quem decide conflito e o rev.)
        /* O ID DE QUEM MARCOU (F01): o carimbo de nome novo que É do cracha
           ganha o ID do RH resolvido pelo cracha (a mesma regua do diario); a
           marca que volta (Desfazer, Sobrescrever) reusa o ID do par que o
           servidor ja carimbou; nome de outra pessoa fica sem ID. O que o
           aparelho mandou como ID nunca entra. Sem carimbo novo, nem le o RH. */
        /* OCORRÊNCIAS MANUAIS E ABONOS (F17). Regras em _shared/pcp-status.mjs
           (guardarOcorrencias, guardarAbonos): só acréscimo a partir do
           gravado; só o PEDIDO entra (registrar, anular, abonar, revogar); só
           admin e pcp; autor e hora do crachá e daqui; nada é 422. O abono só
           aponta ocorrência que a O.S. tem DEPOIS das regras acima (a chegada
           e a conferência deste mesmo envio contam), abonável (atraso e
           retorno antecipado) e sem outro abono valendo. O retorno antecipado
           é medido pela volta: as O.S. com a mesma chegada conferida são lidas
           do banco só quando um abono novo aponta para ele; a regra do dia
           (tolerância) também. Falha dessas leituras cai na O.S. sozinha e na
           tolerância embutida. O RH só é lido quando algo muda. */
        {
          const gestaoF17 = !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp);
          const avisarF17 = !ehMaquina && !ehToqueNoNome;
          const agoraF17 = new Date().toISOString();
          const rodarOc = (autor: any) => guardarOcorrencias(veioOcorrencias, os, existing, autor, agoraF17, { pode: gestaoF17, avisar: avisarF17 });
          let go = rodarOc({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (go.mudou) go = rodarOc(await autorAuditoria());
          trocarOS(go.os);
          avisosToque.push(...go.avisos);
          const pedidos = gestaoF17 ? abonosPedidos(veioAbonos, existing) : [];
          let volta: any[] = [os], regraDia: any = null;
          /* O retorno antecipado é um por dia da jornada (revisão da F17): o id
             termina no dia ('osId:retorno_antecipado:AAAA-MM-DD'). A volta
             daquele dia é lida das O.S. cuja última chegada é desse dia até
             31 dias depois (a O.S. de vários dias guarda no retornoConferido
             a chegada do último dia); voltaDoRetorno fica só com as que têm
             chegada no mesmo dia, o mesmo carro e a mesma equipe. */
          const prefixoRetorno = `${os.id}:retorno_antecipado:`;
          const diasRetorno = [...new Set(pedidos.map((p: any) => String(p?.ocorrenciaId ?? "")).filter((x: string) => x.startsWith(prefixoRetorno)).map((x: string) => x.slice(prefixoRetorno.length)))]
            .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
          if (diasRetorno.length) {
            const ateDia = new Date(Date.parse(diasRetorno[diasRetorno.length - 1] + "T12:00:00Z") + 31 * 864e5).toISOString().slice(0, 10);
            try {
              const { data, error } = await sb.from("pcp_registros").select("registro").eq("colecao", "os").eq("apagado", false)
                .gte("registro->retornoConferido->>dia", diasRetorno[0]).lte("registro->retornoConferido->>dia", ateDia).limit(1000);
              if (error) throw new Error(error.message);
              volta = voltaDoRetorno(os, (data || []).map((r: any) => r.registro).filter((r: any) => r && r.id !== os.id));
            } catch { volta = [os]; }
            try {
              const { data, error } = await sb.from("pcp_registros").select("registro").eq("colecao", "performance_regras").eq("apagado", false).limit(1000);
              if (error) throw new Error(error.message);
              regraDia = REGRAS.regraVigente((data || []).map((r: any) => r.registro), diasRetorno[0]);
            } catch { regraDia = null; }
          }
          const ocorrenciasF17 = pedidos.length ? ocorrenciasDaOS(os, regraDia, volta, perfDia(agoraF17)) : [];
          const rodarAb = (autor: any) => guardarAbonos(veioAbonos, os, existing, autor, agoraF17, { pode: gestaoF17, avisar: avisarF17, ocorrencias: ocorrenciasF17 });
          let ga = rodarAb({ nome: String(cracha?.nome || cracha?.sub || ""), login: String(cracha?.sub ?? ""), porId: "" });
          if (ga.mudou) ga = rodarAb(await autorAuditoria());
          trocarOS(ga.os);
          avisosToque.push(...ga.avisos);
        }
        for (const campo of ["conferenciaERP","regularizacaoSaida","revisaoSolicitada","cicloRegistro"]) { if (existing?.[campo]) os[campo]=existing[campo]; else delete os[campo]; }
        if (existing?.vinculosEquipes) os.vinculosEquipes=existing.vinculosEquipes; else delete os.vinculosEquipes;
        if (existing?.conferenciasEntrega) os.conferenciasEntrega = existing.conferenciasEntrega; else delete os.conferenciasEntrega;
        /* O CARRO PELO ID DO ATIVOS (item 16 da fila de 11/10/2026): a tela
           grava veiculoId junto com o nome escolhido na lista do Ativos. O id
           só vale com o nome com que foi escolhido: trocar o carro numa aba
           que não conhece o id deixava o id do carro anterior (fica de fora);
           sem carro, sem id; id fora do formato também não entra. Nada aqui
           recusa. */
        {
          const idV = String(os.veiculoId ?? "").trim();
          const trocouCarro = !!existing && String(os.veiculo ?? "").trim() !== String(existing.veiculo ?? "").trim() && idV === String(existing.veiculoId ?? "").trim();
          if (!idV || !String(os.veiculo ?? "").trim() || trocouCarro || !/^[\w.:-]{1,80}$/.test(idV)) delete os.veiculoId; else os.veiculoId = idV;
        }
        /* A VOLTA DE CADA VIAGEM (onda volta; regras em _shared,
           registrarVoltas): o servidor guarda a viagem de hoje em `voltas`, e
           na primeira mudança da viagem a fotografia da O.S. de antes
           (voltaLegado). Só daqui; nada é 422. */
        {
          const agoraVoltas = new Date().toISOString();
          trocarOS(registrarVoltas(os, existing, { agora: agoraVoltas, hoje: perfDia(agoraVoltas) }).os);
        }
        /* A PROVA DA ENTREGA (revisão da onda-w1-backup, R1/S1): ver
           guardarFotosProva. Depois de todas as regras acima (a mescla do
           celular, a volta do carro, a conferência), para nenhuma delas
           tirar de novo o que voltou. */
        {
          const gp = guardarFotosProva(os, existing, { gestao: !ehMaquina && !ehToqueNoNome && ["admin", "pcp"].includes(papelUp) });
          trocarOS(gp.os);
          if (!ehMaquina) avisosToque.push(...gp.avisos);
        }
        const executado = carimbarExecucao(os, existing, cracha?.nome || cracha?.sub || "Integração", new Date().toISOString());
        const autorCarimbo = carimbosQueMudaram(executado, existing).length ? await autorAuditoria() : { nome: "", login: "", porId: "" };
        const gravar = { ...carimbarIds(executado, existing, autorCarimbo), rev: revAtual + 1 };
        try {
          if (linhaAtual) {
            const {data,error} = await sb.from("pcp_registros").update({registro:gravar,atualizado_em:new Date(Math.max(Date.now(),Date.parse(linhaAtual.atualizado_em)+1 || 0)).toISOString(),apagado:false})
              .eq("colecao","os").eq("id",os.id).eq("apagado",false).eq("atualizado_em",linhaAtual.atualizado_em).select("id");
            if (error) throw new Error(error.message);
            if (!data?.length) return resp({conflito:true,servidor:saida(await getReg("os",os.id))});
          } else {
            const {error} = await sb.from("pcp_registros").insert({colecao:"os",id:os.id,registro:gravar,atualizado_em:new Date().toISOString(),apagado:false});
            if (error) throw new Error(error.message);
          }
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
            if (sobrevivente) return resp({ ok: true, os: saida(sobrevivente), duplicataEvitada: true });

            // Uma colisão com lápide continua pendente no aparelho; só a ação
            // de recuperação assinada pela gestão pode restaurar o original.
            const { data: morta } = await sb.from("pcp_registros").select("id, registro")
              .eq("colecao", "os").eq("apagado", true)
              .eq("registro->>numero", num).limit(1).maybeSingle();
            if (morta?.id) {
              return resp({error:"Número de O.S. excluída. Recupere o registro original pela gestão antes de reenviar.",restauracaoNecessaria:true},422);
            }
          }
          throw e;
        }
        /* DIARIO: o que mudou entre o que estava gravado e o que acabou de
           gravar (depois de todas as regras acima, nao o que o aparelho mandou).
           Lapide que volta a viver conta como 'apagado: true -> false'. */
        {
          const eraLapide = !!linhaAtual?.apagado;
          const diff = diffAuditavel(existing, gravar);
          const d = eraLapide ? { campos: ["apagado", ...(diff?.campos ?? [])], antes: { apagado: true, ...(diff?.antes ?? {}) }, depois: { apagado: false, ...(diff?.depois ?? {}) } } : diff;
          await auditar(String(os.id), eraLapide ? "restaurar" : existing ? "alterar" : "criar", d, gravar.numero);
          if (descarteAlocacao) await auditar(String(os.id), "descartar", descarteAlocacao.diario, gravar.numero);
        }
        /* `descartado`: o aparelho volta à divisão (e à lista) da resposta e
           mostra o aviso fixo. O resto da gravação passou. */
        const descartado = [...(descarteAlocacao ? ["alocacao"] : []), ...(entregasRecusadas.length ? ["entregas"] : [])];
        return resp({ ok: true, os: saida(gravar), ...(avisosToque.length ? { avisos: avisosToque } : {}),
          ...(descartado.length ? { descartado } : {}),
          ...(descarteAlocacao ? { descartadoMotivo: { alocacao: descarteAlocacao.motivo } } : {}),
          ...(entregasRecusadas.length ? { entregasRecusadas } : {}) });
      }

      case "delete":
      case "restaurarOS": {
        if(ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha?.papel || ""))) return resp({error:"Só admin e PCP podem excluir ou recuperar O.S. Solicite revisão à gestão."},403);
        const id=String(body.id || ""), motivo=String(body.motivo || "").trim(), apagar=acao==="delete";
        if(motivo.length<5 || motivo.length>500)return resp({error:"Informe o motivo, de 5 a 500 caracteres."},422);
        const {data:row,error}=await sb.from("pcp_registros").select("registro,apagado,atualizado_em").eq("colecao","os").eq("id",id).maybeSingle();
        if(error)throw new Error(error.message);
        if(!row)return resp({error:"O.S. não encontrada."},404);
        if(body.rev!==row.registro.rev)return resp({error:"O.S. alterada. Atualize antes de continuar."},409);
        if(row.apagado===apagar)return resp({error:apagar?"O.S. já excluída.":"O.S. já recuperada."},409);
        const autor=await autorAuditoria(),em=new Date().toISOString();
        const evento={acao:apagar?"excluir":"restaurar",motivo,em,por:autor.nome,porId:autor.porId};
        const os={...row.registro,cicloRegistro:[...(row.registro.cicloRegistro || []),evento],rev:(Number(row.registro.rev)||0)+1};
        const {data:salva,error:err}=await sb.from("pcp_registros").update({registro:os,apagado:apagar,atualizado_em:new Date(Math.max(Date.now(),Date.parse(row.atualizado_em)+1 || 0)).toISOString()}).eq("colecao","os").eq("id",id).eq("apagado",row.apagado).eq("atualizado_em",row.atualizado_em).select("id");
        if(err)throw new Error(err.message);
        if(!salva?.length)return resp({error:"O.S. alterada durante a operação. Atualize."},409);
        await auditar(id,evento.acao,{campos:["apagado","cicloRegistro"],antes:{apagado:row.apagado},depois:{apagado:apagar,evento}},os.numero);
        return resp({ok:true,...(!apagar?{os:saida(os)}:{})});
      }
      case "excluidasOS": {
        if(ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha?.papel || "")))return resp({error:"Recuperação só para admin e PCP."},403);
        const {data,error}=await sb.from("pcp_registros").select("id,registro").eq("colecao","os").eq("apagado",true).order("id").gt("id",String(body.after || "")).limit(100);
        if(error)throw new Error(error.message);
        return resp({os:(data || []).map((r:any)=>saida(r.registro)),after:data?.length===100?data[99].id:null});
      }
      case "controleEntrega": {
        const gestao=!ehMaquina && !ehToqueNoNome && ["admin","pcp"].includes(String(cracha?.papel || ""));
        if(!gestao && body.tipo!=="solicitarRevisao")return resp({error:"Conferência e regularização só para admin e PCP."},403);
        if(ehMaquina || ehToqueNoNome || !["admin","pcp","montagem","operacao","comercial"].includes(String(cracha?.papel || "")))return resp({error:"Entre com uma sessão autenticada."},403);
        const id=String(body.osId || "");
        const {data:row,error}=await sb.from("pcp_registros").select("registro,apagado,atualizado_em").eq("colecao","os").eq("id",id).maybeSingle();
        if(error)throw new Error(error.message);
        if(!row || row.apagado)return resp({error:"O.S. não encontrada."},404);
        const os=row.registro;
        if(String(cracha?.papel)==="montagem" && !(os.equipe || []).some((v:any)=>(v===cracha?.nome || v===cracha?.sub))) {
          const pessoas=await pessoasReq(),quem=idDoCracha(quemToque(),pessoas);
          if(!quem || !(os.equipe || []).some((v:any)=>pessoas.idDe(v)===quem))return resp({error:"O.S. fora da sua equipe."},403);
        }
        if(body.rev!==os.rev)return resp({error:"A O.S. mudou. Atualize a ficha."},409);
        const p=body.pedido || {},motivo=String(p.motivo || "").trim();
        if(motivo.length<5 || motivo.length>500)return resp({error:"Descreva o motivo, de 5 a 500 caracteres."},422);
        const autor=await autorAuditoria(),em=new Date().toISOString(),evento:any={motivo,em,por:autor.nome,porId:autor.porId};
        let campo="";
        const gravar={...os,rev:(Number(os.rev)||0)+1,atualizadoEm:em,atualizadoPor:autor.nome};
        if(body.tipo==="solicitarRevisao") {campo="revisaoSolicitada";gravar[campo]=[...(os[campo] || []),evento];}
        else if(["erp","saida"].includes(body.tipo)) {
          const pessoas=await pessoasReq(),pessoa=pessoas.pessoa(String(p.responsavelId || ""));
          if(!pessoa || pessoa.semFicha || pessoa.idRepetido || pessoa.desligado || pessoa.ativo===false || pessoas.idDe(String(p.responsavelId || ""))!==String(p.responsavelId || ""))return resp({error:"Selecione um responsável com cadastro confirmado e ativo."},422);
          const prazo=String(p.prazo || ""),evidencia=String(p.evidencia || "").trim();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(prazo) || !Number.isFinite(Date.parse(prazo)) || new Date(prazo).toISOString().slice(0,10)!==prazo || evidencia.length<5 || evidencia.length>1000)return resp({error:"Informe prazo válido e evidência ou última informação (5 a 1000 caracteres)."},422);
          Object.assign(evento,{responsavelId:p.responsavelId,responsavelNome:pessoa.nome,prazo,evidencia});
          if(body.tipo==="erp") {
            campo="conferenciaERP";
            if(!os.baixaAutoERP && !os.erpComSaldo && !os.erpSaiuDaCarteiraEm && !os.conferenciaERP)return resp({error:"Esta O.S. não tem baixa ERP a conferir."},422);
            if(!["total","parcial","retirada","baixa_administrativa","divergencia"].includes(p.classificacao))return resp({error:"Selecione a classificação da diferença."},422);
            const estado=CONFERENCIA_ENTREGA.estado(os);
            if(p.classificacao==="total" && estado.situacao!=="saldo_concluido")return resp({error:"Confira todos os itens antes de classificar entrega total."},422);
            if(p.classificacao==="parcial" && estado.situacao!=="parcial")return resp({error:"Confira os itens da entrega parcial primeiro."},422);
            if(["baixa_administrativa","retirada"].includes(p.classificacao) && os.conferenciasEntrega?.length)return resp({error:"Há entregas conferidas. Classifique a divergência para revisão, sem apagar a evidência."},422);
            evento.classificacao=p.classificacao;
          } else {
            campo="regularizacaoSaida";
            if(perfDia(os.saidaEm || os.instalacao?.data)>=perfDia(em))return resp({error:"A saída de hoje permanece no acompanhamento atual. Regularize apenas saídas anteriores."},422);
            if(!(os.saidaEm || os.horaSaida))return resp({error:"Não há saída registrada para regularizar."},422);
            evento.saidaOriginal=os.saidaEm || "";
            evento.saidaReferencia={em:os.saidaEm || "",dia:perfDia(os.saidaEm) || perfDia(os.instalacao?.data),hora:os.horaSaida || ""};
            evento.situacao=p.situacao==="regularizada"?"regularizada":"em_conferencia";
          }
          gravar[campo]={...evento,historico:[...(os[campo]?.historico || []),evento]};
        } else return resp({error:"Ação de conferência inválida."},422);
        const {data:salva,error:err}=await sb.from("pcp_registros").update({registro:gravar,atualizado_em:new Date(Math.max(Date.now(),Date.parse(row.atualizado_em)+1 || 0)).toISOString()}).eq("colecao","os").eq("id",id).eq("apagado",false).eq("atualizado_em",row.atualizado_em).select("id");
        if(err)throw new Error(err.message);
        if(!salva?.length)return resp({error:"Outra pessoa alterou a O.S. Atualize."},409);
        await auditar(id,"controle-entrega",{campos:[campo],antes:{[campo]:os[campo] || null},depois:{[campo]:gravar[campo]}},os.numero);
        return resp({ok:true,os:saida(gravar)});
      }

      // ---- valores: quanto vale cada O.S, lido do cache do Painel ----
      //
      // O PCP nunca soube o valor do servico: o card guarda so itens com
      // subtotal (nem sempre preenchido) e nenhuma tela somava. A verdade do
      // valor ja existe no MESMO banco -- painel_ordens, alimentada pela carga
      // do Painel a cada 20 min, com o rateio de unioes conferido. Uma base so:
      // em vez de copiar o numero para dentro de cada O.S (segunda verdade que
      // envelhece), a tela pergunta aqui e recebe {numero: valor}.
      //
      // E dinheiro da casa: so quem enxerga Entregas/Performance recebe
      // (admin e pcp). Montagem, operacao e comercial levam 403 -- e o app
      // trata como "sem valor", nao como erro.
      case "valores": {
        if (cracha && !ehMaquina && !["admin", "pcp"].includes(String(cracha.papel ?? ""))) {
          return resp({ error: "Valores só para a gestão do PCP." }, 403);
        }
        /* Os números vêm PAGINADOS: o banco corta toda leitura em 1000 linhas,
           calado (eram 905 O.S. vivas em 23/09/2026). Sem isto, a O.S. de
           número 1001 em diante ficaria "sem valor" no card. */
        const nums: any[] = [];
        for (let depois = "", pagina = 0; ; pagina++) {
          if (pagina >= 200) return resp({ error: "Leitura das O.S. passou do limite." }, 500);
          let q = sb.from("pcp_registros").select("id, registro->>numero").eq("colecao", "os").eq("apagado", false).order("id").limit(1000);
          if (depois) q = q.gt("id", depois);
          const { data: lote, error: e1 } = await q;
          if (e1) return resp({ error: e1.message }, 500);
          nums.push(...(lote ?? []));
          if ((lote ?? []).length < 1000) break;
          const ultimo = String(lote[lote.length - 1].id);
          if (ultimo <= depois) return resp({ error: "Paginação inconsistente nas O.S." }, 500);
          depois = ultimo;
        }
        const lista = [...new Set((nums ?? []).map((r: any) => String(r.numero || "").trim()).filter(Boolean))];
        const valores: Record<string, number> = {};
        const vistos=new Set<string>(), duplicados=new Set<string>();
        // PostgREST corta em 1000 linhas por pedido: pergunta em fatias.
        for (let i = 0; i < lista.length; i += 500) {
          const { data: po, error: e2 } = await sb.from("painel_ordens")
            .select("numero, valor").in("numero", lista.slice(i, i + 500));
          if (e2) return resp({ error: e2.message }, 500);
          for (const r of po ?? []) {
            const n=String(r.numero || ""),v=Number(r.valor);
            if(!n)continue;
            if(vistos.has(n)){duplicados.add(n);delete valores[n];continue;}vistos.add(n);
            if(r.valor!==null && r.valor!=="" && Number.isFinite(v) && v>=0)valores[n]=v;
          }
        }
        /* OS ANOS QUE EXISTEM SAO OS QUE O BANCO TEM, nao uma constante.
           A tela de Entregas oferece um chip por ano e precisa saber ate onde
           voltar. Chutar "tres anos" foi o que criou o chip que nunca carregava.
           `painel_ordens` e a carga historica do ERP no MESMO banco (2020+),
           entao a lista sai de la e se mantem sozinha. Vai junto do `valores`
           de proposito: mesma tela, mesma trava de papel, zero ida extra. */
        const { data: faixa } = await sb.from("painel_ordens")
          .select("data").not("data", "is", null).order("data", { ascending: true }).limit(1);
        const primeiro = Number(String(faixa?.[0]?.data ?? "").slice(0, 4));
        const anoAtual = new Date().getFullYear();
        const anos: number[] = [];
        // Teto de 20 para uma data corrompida no banco nao virar 2 mil chips.
        if (primeiro >= 2000 && primeiro <= anoAtual) {
          for (let a = anoAtual; a >= Math.max(primeiro, anoAtual - 19); a--) anos.push(a);
        }
        return resp({ valores, anos, numerosDuplicados:[...duplicados], em: new Date().toISOString() });
      }

      // ---- elenco: quem instala (RH) e com que carro (Ativos do Painel) ----
      //
      // "Usar uma base de dados apenas" (ordem do dono, 14/09/2026): o PCP
      // deixa de manter lista propria de nomes e carros. As pessoas vem da
      // ficha do RH (id = 6 primeiros digitos do CPF, nome completo, apelido,
      // setor) e os veiculos do modulo Ativos do Painel (nome, categoria,
      // placa, modelo, e os campos de lotacao quando cadastrados).
      //
      // So estes campos saem daqui. Salario, endereco, telefone e o resto da
      // ficha NUNCA passam por esta porta -- a regua larga fica na porta de
      // dados, nao na tela.
      /* ---- equipeHistorico: QUANTA GENTE A CASA TINHA EM CADA MES ----
       *
       * Pedido do dono (15/09/2026), olhando o historico de entregas: "adicionar
       * a qntd de funcionarios ativos na epoca ate pra gente entender puxando do
       * rh e colocando os de producao adm etc". O uso e comparar faturamento com
       * tamanho da equipe: R$ 400 mil com 30 pessoas nao e R$ 400 mil com 45.
       *
       * SO DESCE CONTAGEM. Nenhum nome, nenhuma data de admissao, nenhuma ficha
       * -- a resposta e {mes, total, porArea:{...}}. Contagem por area e leitura
       * de tamanho de operacao; ficha de pessoa nao tem por que atravessar esta
       * porta, e a regra da casa e cortar na PORTA, nao na tela.
       *
       * O LIMITE DO DADO VIAJA JUNTO. O RH da casa so passou a registrar
       * desligamento a partir de 2025 (conferido no banco: nenhuma saida antes
       * disso). Para meses anteriores, quem saiu antes da implantacao nunca foi
       * cadastrado -- entao a contagem e um PISO, nao o total. Devolver esse
       * numero sem dizer isso faria a tela afirmar que a empresa era menor do
       * que era, e a comparacao com faturamento sairia ao contrario.
       */
      case "equipeHistorico": {
        if (!ehMaquina && !["admin", "pcp"].includes(String(cracha?.papel ?? ""))) {
          return resp({ error: "Tamanho da equipe é da gestão do PCP." }, 403);
        }
        const pedidos = Array.isArray(body.meses) ? body.meses.map((x: any) => String(x || "").trim()) : [];
        const meses = [...new Set(pedidos.filter((x: string) => /^\d{4}-\d{2}$/.test(x)))].sort();
        if (!meses.length) return resp({ error: "meses: lista de AAAA-MM" }, 400);
        const usar = meses.slice(0, 300);

        const col:any[]=[];let cursor="", completo=false;
        for(let pagina=0;pagina<100;pagina++){
          let q=sb.from("registros").select("id,registro").eq("colecao","colaboradores").eq("apagado",false).order("id").limit(500);
          if(cursor)q=q.gt("id",cursor);
          const {data,error}=await q;if(error)throw new Error(error.message);
          const rows=data || [];col.push(...rows);if(rows.length<500){completo=true;break;}
          const next=String(rows[rows.length-1].id);if(next<=cursor)throw new Error("Paginação do RH inconsistente.");cursor=next;
        }
        if(!completo)throw new Error("Não foi possível concluir a leitura do RH.");
        const { data: ar,error:areaErro } = await sb.from("registros")
          .select("registro->>id, registro->>nome").eq("colecao", "areas").eq("apagado", false);
        if(areaErro)throw new Error(areaErro.message);
        const areaNome: Record<string, string> = {};
        for (const r of (ar ?? []) as any[]) if (r.id) areaNome[String(r.id)] = String(r.nome ?? "");

        const gente = (col ?? []).map((r: any) => r.registro || {})
          .map((g: any) => ({
            admissao: String(g.dataAdmissao || "").slice(0, 10),
            saida: String(g.dataDesligamento || "").slice(0, 10),
            area: areaNome[String(g.areaId || "")] || "(sem área)",
          }))
          .filter((g: any) => /^\d{4}-\d{2}-\d{2}$/.test(g.admissao));

        /* ATE QUANDO A BASE NAO SABE DE SAIDAS. Antes da primeira saida
           registrada, a ausencia de desligamento nao prova que a pessoa estava
           na casa -- prova que o RH ainda nao existia. */
        const saidas = gente.map((g: any) => g.saida).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        const primeiraSaida = saidas[0] || "";

        const linhas = usar.map((mes: string) => {
          const ini = `${mes}-01`;
          const [y, m] = mes.split("-").map(Number);
          const fim = [new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), perfDia(new Date().toISOString())].sort()[0]; // até hoje no mês corrente
          const porArea: Record<string, number> = {};
          let total = 0;
          for (const g of gente) {
            if (g.admissao > fim) continue;                       // ainda nao tinha entrado
            if (g.saida && g.saida < ini) continue;               // ja tinha saido
            total++;
            porArea[g.area] = (porArea[g.area] || 0) + 1;
          }
          return {
            mes, total, porArea,
            // `piso` = a base nao registra quem saiu antes desta data.
            piso: !primeiraSaida || fim < primeiraSaida,
          };
        });

        return resp({
          meses: linhas,
          areas: [...new Set(gente.map((g: any) => g.area))].sort(),
          desdeQuando: primeiraSaida,
          em: new Date().toISOString(),
        });
      }

      case "elenco": {
        /* "Atualizar elenco" (F07): a pessoa acabou de ser cadastrada no RH em
           outra aba. A régua do servidor guarda as fichas por 60 s; sem jogar
           o cache fora, a O.S. gravada com o ID novo seria recusada ao crachá
           dela no minuto seguinte. Ler de novo é tudo o que o pedido causa. */
        if (body.forcar === true) _fichasRH = null;
        // DUAS REGUAS NA MESMA PORTA. Quem entra pela montagem NAO DIGITA SENHA
        // -- basta escolher o nome na lista. Esse cracha pode saber quem sao os
        // colegas (a mensagem do dia precisa do nome completo, e a foto e o
        // cargo sao inocuos dentro da fabrica), mas NAO pode saber que fulano
        // esta de atestado, em aviso previo ou de ferias: isso e ficha de RH e
        // so sobe para admin/pcp. Sem o gate, o botao Equipe entregaria a
        // situacao de 35 pessoas a quem entrou sem senha.
        const verFichaRH = ehMaquina || ["admin", "pcp"].includes(String(cracha?.papel ?? ""));
        // A FICHA DO RH VEM INTEIRA? NAO. So o que a tela de instalacao usa:
        // quem e a pessoa (nome/apelido), onde trabalha (setor/area/cargo), se
        // esta na ativa (status) e a cara dela (foto). Salario, endereco,
        // telefone, CPF completo e o resto NUNCA passam por esta porta.
        const { data: col, error: e1 } = await sb.from("registros")
          .select("registro").eq("colecao", "colaboradores").eq("apagado", false);
        if (e1) return resp({ error: e1.message }, 500);
        // Tabelas de apoio do RH: cargo, area e status sao ids, nao textos.
        const apoio = async (colecao: string) => {
          const { data } = await sb.from("registros")
            .select("registro->>id, registro->>nome").eq("colecao", colecao).eq("apagado", false);
          const m: Record<string, string> = {};
          for (const r of (data ?? []) as any[]) if (r.id) m[String(r.id)] = String(r.nome ?? "");
          return m;
        };
        const [cargos, areas, situacoes] = await Promise.all([apoio("cargos"), apoio("areas"), apoio("status")]);
        // Quem saiu da empresa some da lista; quem esta inativo/abandono fica,
        // marcado `ativo:false` -- a TELA e que tira das escolhas. Apagar aqui
        // quebraria o historico: O.S antiga ficaria com nome sem ficha.
        const FORA = new Set(["inativo", "abandono", "externo"]);
        const pessoas = (col ?? [])
          .map((r: any) => r.registro || {})
          .filter((g: any) => String(g.nome || "").trim() && !String(g.dataDesligamento || "").trim())
          .map((g: any) => {
            const d = String(g.cpf || "").replace(/\D/g, "");
            const st = String(g.statusId || "").trim();
            const foto = String(g.fotoDataUrl || "");
            return {
              chave: String(g.id || ""),                       // id do RH (slug) -- casa ferias/ausencias
              id: d.length === 11 ? d.slice(0, 6) : "",        // id de pessoa da casa (6 primeiros do CPF)
              nome: String(g.nome).trim(),
              apelido: String(g.apelido || "").trim(),
              setor: String(g.setor || "").trim(),
              area: areas[String(g.areaId || "")] || "",
              cargo: cargos[String(g.cargoId || "")] || String(g.cargoLivre || g.funcao || ""),
              statusId: verFichaRH ? st : "",
              status: verFichaRH ? (situacoes[st] || st) : "",
              ativo: !FORA.has(st),
              // `leve` (espelho do instalador): só quem é quem, sem a foto.
              foto: !body.leve && foto.startsWith("data:image") && foto.length < 200000 ? foto : "",
            };
          })
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
        /* QUEM JA SAIU, SO PARA DAR NOME AO HISTORICO. A O.S. nova grava o ID
           da pessoa (ordem do dono, 29/09/2026); quando ela sai da empresa, a
           O.S. antiga continua com o ID e precisa de nome. Vai o minimo:
           id, chave, nome e apelido. Nunca entra nas escolhas nem no
           casamento de nome antigo (desligado:true). */
        const antigos = (col ?? [])
          .map((r: any) => r.registro || {})
          .filter((g: any) => String(g.nome || "").trim() && String(g.dataDesligamento || "").trim())
          .map((g: any) => {
            const d = String(g.cpf || "").replace(/\D/g, "");
            return { chave: String(g.id || ""), id: d.length === 11 ? d.slice(0, 6) : "", nome: String(g.nome).trim(),
                     apelido: String(g.apelido || "").trim(), ativo: false, desligado: true };
          })
          .filter((g: any) => g.id);
        /* FREELANCER PELO CONTRATO DO RH (F07, caminho B). O contrato ativo
           entra nas escolhas com a tag `freelancer`; o encerrado ou vencido so
           da nome ao historico (antigos). O fim e a situacao do contrato sao
           do RH e so sobem para admin/pcp, como a situacao da ficha. O CPF
           inteiro fica aqui: juntarFreelancers compara e devolve so o ID.
           Ex-colaborador que voltou como freelancer (mesmo CPF) conta uma vez. */
        /* SÓ PARA QUEM PEDE (body.freelancers, mandado pela tela da F07). A
           tela antiga (v135) não conhece o freelancer: contaria o contrato
           como gente da fábrica no "Equipe hoje". Sem o pedido, a porta
           responde como antes, e a ordem de publicar tela e servidor deixa de
           importar. A régua do servidor (fichasRH) conhece os contratos sempre. */
        const querContratos = body.freelancers === true;
        /* Tag, CPF pendente e ID repetido são cadastro do RH e servem a quem
           ESCOLHE gente no seletor: admin, pcp e operação (que monta equipe na
           gestão). A montagem (toque e conta de grupo) não escolhe gente:
           recebe o contrato com ID como pessoa comum, sem as marcas, e não
           recebe o contrato sem ID, que não serve ao celular. */
        const veContrato = verFichaRH || String(cracha?.papel ?? "") === "operacao";
        const cpfPorChave = new Map<string, string>(), statusPorChave = new Map<string, string>();
        for (const r of (col ?? []) as any[]) {
          const g = r.registro || {};
          cpfPorChave.set(String(g.id || ""), String(g.cpf || "").replace(/\D/g, ""));
          statusPorChave.set(String(g.id || ""), String(g.statusId || "").trim());
        }
        let contratosRH: any[] = [];
        if (querContratos) {
          try { contratosRH = await contratosFreelancerRH(!body.leve); }
          catch (e) { return resp({ error: (e as Error).message }, 500); }
        }
        const junta = juntarFreelancers([...pessoas, ...antigos].map((p: any) => ({ ...p, cpf: cpfPorChave.get(p.chave) || "", statusId: statusPorChave.get(p.chave) || "" })),
          contratosRH, { hoje: perfDia(new Date().toISOString()) });
        const marcar = (p: any) => veContrato && junta.repetidos.has(p.id) ? { ...p, idRepetido: true } : p;
        const contratosPorChave = new Map(contratosRH.map((c: any) => [`freelancer:${String(c.id).trim()}`, c]));
        const fichasParaFoto = (col ?? []).map((r: any) => r.registro || {});
        const contratoParaTela = (c: any) => ({
          chave: c.chave, id: c.id, nome: c.nome, apelido: c.apelido, setor: "", area: "", cargo: veContrato ? c.funcao : "",
          statusId: "", status: "", ativo: true,
          foto: fotoFreelancerRH(contratosPorChave.get(c.chave), fichasParaFoto, { leve: !!body.leve }),
          ...(veContrato ? { freelancer: true } : {}),
          ...(veContrato && c.semCpf ? { semCpf: true } : {}), ...(veContrato && c.cpfInvalido ? { cpfInvalido: true } : {}),
          ...(veContrato && c.idRepetido ? { idRepetido: true } : {}),
          ...(verFichaRH ? { contratoFim: c.contratoFim, situacaoContrato: c.situacaoContrato } : {}),
        });
        const pessoasComContrato = [
          ...pessoas.filter((p: any) => !junta.fichasFora.has(p.chave)).map(marcar),
          ...junta.contratos.filter((c: any) => c.ativo && (veContrato || c.id)).map(contratoParaTela),
        ].sort((a: any, b: any) => a.nome.localeCompare(b.nome));
        const antigosComContrato = [
          ...antigos.filter((p: any) => !junta.fichasFora.has(p.chave)).map(marcar),
          ...junta.contratos.filter((c: any) => !c.ativo && c.id).map((c: any) => ({ chave: c.chave, id: c.id, nome: c.nome,
            apelido: c.apelido, ativo: false, desligado: true, freelancer: true, ...(c.idRepetido ? { idRepetido: true } : {}) })),
          /* O CONTRATO ENCERRADO SEM CPF CONTA NA AMBIGUIDADE (revisão da F12).
             A régua do servidor (fichasRH) conta todo contrato sem ID: "Lucas"
             com a ficha do Lucas Ferreira e o contrato encerrado do Lucas Prado
             não é de ninguém. Sem ele no aparelho, a tela confirmava "Lucas"
             como o Lucas Ferreira, e a troca pelo ID gravava o que o servidor
             não lê. Vai só o que a conta usa: nome e apelido, desligado. */
          ...junta.contratos.filter((c: any) => !c.ativo && !c.id).map((c: any) => ({ id: "", nome: c.nome, apelido: c.apelido,
            ativo: false, desligado: true, freelancer: true })),
        ];
        // Presenca: ferias e ausencias vem CRUAS (o dia local quem sabe e a
        // tela; aqui e UTC). Janela curta para o pacote nao inchar.
        const hojeUTC = new Date().toISOString().slice(0, 10);
        const de = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
        const { data: fer } = verFichaRH ? await sb.from("registros")
          .select("registro->>colaboradorId, registro->>dataInicio, registro->>dataRetorno, registro->>status")
          .eq("colecao", "ferias").eq("apagado", false) : { data: [] };
        const ferias = ((fer ?? []) as any[])
          .map((r) => ({ chave: String(r.colaboradorId || ""), de: String(r.dataInicio || "").slice(0, 10),
                         ate: String(r.dataRetorno || "").slice(0, 10), status: String(r.status || "") }))
          .filter((f) => f.chave && f.ate && f.ate >= de);
        const { data: aus } = verFichaRH ? await sb.from("registros")
          .select("registro->>colaboradorId, registro->>data, registro->>tipo, registro->>horas")
          .eq("colecao", "ausencias").eq("apagado", false).gte("registro->>data", de) : { data: [] };
        const ausencias = ((aus ?? []) as any[])
          .map((r) => ({ chave: String(r.colaboradorId || ""), data: String(r.data || "").slice(0, 10),
                         tipo: String(r.tipo || ""), horas: Number(r.horas) || 0 }))
          .filter((a) => a.chave && a.data);
        const { data: ativos, error: e2 } = await sb.from("painel_registros")
          .select("id, registro").eq("colecao", "ativo");
        if (e2) return resp({ error: e2.message }, 500);
        const veiculos = (ativos ?? [])
          .filter((r: any) => r.registro?.tipo === "veiculo" && String(r.registro?.nome || "").trim())
          .map((r: any) => {
            const g = r.registro || {}, e = g.especificacao || {};
            // A lotacao mora na FICHA TECNICA do Painel (especificacao), ao lado
            // da placa -- e a unica tela que edita isso. Aceita tambem na raiz
            // por tolerancia a registro antigo.
            const lug = Number(e.lugares ?? g.lugares);
            const grade = String(e.possuiGrade ?? g.possuiGrade ?? "").toLowerCase();
            return { id: r.id, nome: String(g.nome).trim(), categoria: String(g.categoria || ""),
                     placa: String(e.placa || g.identificacao || ""), modelo: String(e.marcaModelo || ""),
                     lugares: Number.isFinite(lug) && lug > 0 ? lug : null,
                     grade: grade === "sim" || grade === "true",
                     motorista: String(e.motorista || g.motorista || g.responsavel || "").trim() };
          })
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
        // `fichaRH` DIZ SE A LISTA DE AUSENCIAS E VAZIA OU SO ESCONDIDA.
        // Sem este aviso o cliente nao tem como distinguir "ninguem esta de
        // ferias hoje" de "voce nao tem acesso a essa informacao" -- e o botao
        // Equipe escrevia "0 fora hoje" para quem entrou sem senha, com uma
        // pessoa de atestado na fabrica. Lista vazia nao e resposta; quem sabe
        // por que ela veio vazia e esta porta, entao e ela que precisa contar.
        // Quem entrou sem senha nao recebe a lista de quem ja saiu (o celular
        // dele so mostra as O.S. da propria equipe, que sao de agora).
        // `avisos`: ID repetido entre ficha e contrato, ou pessoa com ficha e
        // contrato ativos ao mesmo tempo. Conferência do RH: só admin/pcp.
        return resp({ pessoas: pessoasComContrato, antigos: verFichaRH ? antigosComContrato : [], veiculos, hoje: hojeUTC, em: new Date().toISOString(), fichaRH: verFichaRH,
                      ferias: verFichaRH ? ferias : [], ausencias: verFichaRH ? ausencias : [], avisos: verFichaRH ? junta.avisos : [] });
      }

      case "getCfg": {
        const { config, versao } = await getCfgComVersao();
        if (body.seVersao && versao && String(body.seVersao) === versao) return resp({ semMudanca: true, versao });
        const cfg = config ?? {};
        // Papel nao-admin nao recebe dados sensiveis: a lista de usuarios (com
        // senha em texto no CFG_DEFAULT) e a agenda de funcionarios (telefones).
        // Maquina/Hub recebe tudo (backup).
        if (cracha && !ehMaquina && String(cracha.papel ?? "") !== "admin") {
          const { usuarios: _u, funcionarios: _f, ...publico } = cfg;
          if(!["admin","pcp"].includes(String(cracha?.papel)))delete publico.medicoesRetrabalho;
          /* Quem entrou pelo nome também não recebe bônus (orçamento, teto e
             pontos de cada colega) nem a apuração da performance (percentuais,
             participações e logos): a ação "valores" já recusa esse crachá, e
             o espelho não usa nada disso. */
          if (ehToqueNoNome) { delete publico.bonusPCP; delete publico.performancePCP; }
          /* A montagem com senha também não recebe as participações (os
             percentuais de cada colega, F08); as equipes continuam descendo. */
          else if (ehMontagem && publico.performancePCP && typeof publico.performancePCP === "object") {
            const { participacoes: _p, ...perf } = publico.performancePCP;
            publico.performancePCP = perf;
          }
          return resp({ cfg: gestaoVeTudo ? publico : podarValoresPCP(publico), versao });
        }
        return resp({ cfg, versao });
      }

      case "setCfg": {
        if (!body.cfg || typeof body.cfg !== "object" || Array.isArray(body.cfg)) return resp({ error: "Configuração inválida" }, 400);
        const visivel = (cfg: any) => {
          const {usuarios,funcionarios,...out} = cfg || {}; return out;
        };
        /* A AGENDA DE CONTATOS É DO ADMIN. A mescla usava `visivel` para todo
           mundo, e o contato que o admin cadastrava (funcionarios) nunca chegava
           ao banco: sumia na troca de aparelho. O admin mescla funcionarios;
           usuarios (senhas) continuam fora, e o pcp segue sem nenhum dos dois. */
        const ehAdminCfg = String(cracha?.papel ?? "") === "admin" && !ehMaquina;
        const paraMescla = (cfg: any) => {
          if (!ehAdminCfg) return visivel(cfg);
          const {usuarios,...out} = cfg || {}; return out;
        };
        for (let tentativa=0;tentativa<3;tentativa++) {
          const {config,versao} = await getCfgComVersao();
          const atual = config || {};
          if (!body.baseCfg) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:["Configuração salva por versão antiga; revise antes de reaplicar."]},409);
          const base = paraMescla(body.baseCfg), local = paraMescla(body.cfg), remoto = paraMescla(atual);
          if (cracha?.papel === "pcp" && !ehMaquina) {
            const permitidas = new Set(["agendaPCP","bonusPCP","performancePCP","vinculosRH","mensagemDia","veiculosAliases","categoriasServico","medicoesRetrabalho","prioridadesPCP"]);
            for (const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remoto)])) {
              if (!permitidas.has(k)) { delete base[k]; delete local[k]; delete remoto[k]; }
            }
          }
          /* Aba na versão anterior não conhece os pesos da nota: regrava
             performancePCP sem eles, e a mescla leria "apagou" (local sem a
             chave, remoto igual à base) -- os pesos voltariam calados a
             60/20/20. Nenhuma tela apaga os pesos de propósito (o editor
             sempre grava os três), então ausência aqui é versão velha, não
             decisão. */
          if (base.performancePCP?.criterios && local.performancePCP && typeof local.performancePCP === "object" && !("criterios" in local.performancePCP)) {
            local.performancePCP = { ...local.performancePCP, criterios: base.performancePCP.criterios };
          }
          // A mesma coisa com animal, cor e líder de cada equipe (F06): a aba v133
          // que só renomeia a equipe não pode apagar os três.
          if (local.performancePCP && typeof local.performancePCP === "object") {
            local.performancePCP = preservarCamposEquipe(base.performancePCP, { ...local.performancePCP });
          }
          /* OS PESOS SÃO UM VALOR SÓ. Mesclados chave a chave, dois ajustes válidos
             (cada um somando 100) viravam uma soma torta sem conflito, e o
             segundo levava 422 culpando o que ele digitou (revisão de 23/09).
             Os dois lados mudaram para valores diferentes: conflito. Um lado só
             mudou: vale o objeto inteiro desse lado. */
          if (local.performancePCP && typeof local.performancePCP === "object" && remoto.performancePCP && typeof remoto.performancePCP === "object") {
            const j = (x: any) => JSON.stringify(x ?? null);
            const bC = base.performancePCP?.criterios, lC = local.performancePCP.criterios, rC = remoto.performancePCP.criterios;
            const lMudou = j(lC) !== j(bC), rMudou = j(rC) !== j(bC);
            if (lMudou && rMudou && j(lC) !== j(rC)) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:["performancePCP.criterios: os pesos da nota foram mudados em outro aparelho. Confira e salve de novo."]},409);
            if (lMudou || rMudou) {
              const vence = lMudou ? lC : rC;
              base.performancePCP = { ...(base.performancePCP || {}), criterios: vence };
              local.performancePCP = { ...local.performancePCP, criterios: vence };
              remoto.performancePCP = { ...remoto.performancePCP, criterios: vence };
            }
          }
          // Novos cadastros operacionais usam a mesma mescla/CAS e autoria do servidor.
          for(const k of ["veiculosAliases","categoriasServico","medicoesRetrabalho","prioridadesPCP"]){
            if(k in base && !(k in local))local[k]=base[k]; // aba anterior não apaga campo desconhecido
          }
          const result = mesclarConfiguracao(base,local,remoto);
          if (result.conflitos.length) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:result.conflitos},409);
          const limpo = {...atual,...result.cfg};
          for (const k of Object.keys(remoto)) if (!(k in result.cfg)) delete limpo[k];
          /* Avisos do que foi gravado pela metade (animal, cor ou líder
             ignorados; pessoa fixa em duas equipes). Voltam na resposta, e o
             aparelho mostra (store.js, 'item-aviso'). */
          const avisosCfg: string[] = [];
          if (JSON.stringify(limpo.performancePCP) !== JSON.stringify(atual.performancePCP)) {
            // Uma leitura das fichas do RH para os dois lados; sem RH, fica a
            // chave crua e a conferência segue do mesmo jeito que antes.
            const fichas = await fichasRH().catch(() => null);
            const regua = (c: any) => fichas ? resolverPessoas({ pessoas: fichas, vinculos: c.vinculosRH, lista: c.instaladores }) : null;
            // Animal, cor e líder inválidos são ignorados com aviso, nunca 422
            // (o 422 desfaz a configuração inteira no aparelho da aba antiga).
            const saneado = sanearEquipes(limpo.performancePCP, atual.performancePCP, regua(limpo));
            limpo.performancePCP = saneado.perf; avisosCfg.push(...saneado.avisos);
            const erroPerf = validarPerformance(limpo.performancePCP);
            if (erroPerf) return resp({error:erroPerf},422);
            /* EQUIPES FIXAS (F06): a regra "uma equipe ativa por composição"
               saiu; o que não pode repetir entre as ativas é o NOME. Repetição
               NOVA vira conflito (409), não recusa: o 422 da v124 era lido como
               rede e travava a fila inteira. A que já estava no banco não trava
               nada. Pessoa fixa em duas equipes ativas grava, com aviso. */
            const antes = conferirEquipesAtivas(atual.performancePCP, regua(atual));
            const depois = conferirEquipesAtivas(limpo.performancePCP, regua(limpo));
            const reguaLimpo = regua(limpo);
            const nomesNovos = [...depois.nomes.keys()].filter(k => !antes.nomes.has(k));
            if (nomesNovos.length) {
              const nomeDe = (id: string) => String((limpo.performancePCP.equipes.find((e: any) => e && e.id === id) || {}).nome || id);
              return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:nomesNovos.map(k => `performancePCP.equipes: já existe uma equipe ativa chamada "${nomeDe(depois.nomes.get(k)[0])}". Use outro nome ou desative a outra.`)},409);
            }
            for (const [id, eqs] of depois.pessoasEmDuas) {
              const eram = antes.pessoasEmDuas.get(id) || [];
              if (eqs.every((x: string) => eram.includes(x))) continue;
              const equipesDela = eqs.map((x: string) => limpo.performancePCP.equipes.find((e: any) => e && e.id === x)).filter(Boolean);
              // A chave do membro fica como veio (slug, apelido ou ID): o nome sai pela mesma conversão.
              const membro = equipesDela.flatMap((e: any) => e.membros || []).find((m: any) => m && idDoMembro(m, reguaLimpo) === id);
              avisosCfg.push(`${membro?.nome || "ID " + id} aparece em mais de uma equipe ativa (${equipesDela.map((e: any) => e.nome).join(" e ")}). Confira o cadastro.`);
            }
            if(limpo.performancePCP) limpo.performancePCP.participacoes = limpo.performancePCP.participacoes.map((p:any)=>{
              const antes=atual.performancePCP?.participacoes?.find((x:any)=>x.id===p.id);
              return JSON.stringify(antes)===JSON.stringify(p) ? p : {...p,por:cracha?.nome || 'Gestão',em:new Date().toISOString()};
            });
          }
          const mudancaOperacional=["veiculosAliases","categoriasServico","medicoesRetrabalho","prioridadesPCP"].filter(k=>JSON.stringify(limpo[k])!==JSON.stringify(atual[k]));
          if(mudancaOperacional.length){
            if(ehMaquina || !["admin","pcp"].includes(String(cracha?.papel)))return resp({error:"Só a gestão confirma cadastros operacionais."},403);
            const autor=await autorAuditoria(),em=new Date().toISOString();
            const assinar=(x:any)=>({...x,por:autor.nome,porId:autor.porId,em});
            if(mudancaOperacional.includes("veiculosAliases")){
              if(!Array.isArray(limpo.veiculosAliases)||limpo.veiculosAliases.length>1000)return resp({error:"Lista de veículos inválida."},422);
              const {data:ativos,error}=await sb.from("painel_registros").select("id,registro").eq("colecao","ativo");if(error)throw new Error(error.message);
              const vistos=new Set();const out=[];
              for(const v of limpo.veiculosAliases){
                if(!v || typeof v.alias!=="string" || !v.alias.trim() || v.alias.length>150 || vistos.has(v.alias))return resp({error:"Alias de veículo inválido ou repetido."},422);vistos.add(v.alias);
                const antigo=(atual.veiculosAliases || []).find((x:any)=>x.alias===v.alias);
                if(JSON.stringify(antigo)===JSON.stringify(v)){out.push(antigo);continue;}
                const ficha=(ativos || []).find((x:any)=>String(x.id)===String(v.id)&&x.registro?.tipo==="veiculo"),placa=ficha?.registro?.especificacao?.placa || ficha?.registro?.identificacao;
                if(!ficha || !placa || String(placa)!==String(v.placa))return resp({error:"Confira ID e placa na ficha atual do Ativos."},422);
                out.push(assinar({alias:v.alias,id:String(ficha.id),nome:ficha.registro.nome,placa:String(placa)}));
              }limpo.veiculosAliases=out;
            }
            if(mudancaOperacional.includes("categoriasServico")){
              const permitidas=["Adesivos","Fachadas","Letreiros","Sinalização","Estruturas","Impressos","Outros"],vistos=new Set();
              if(!Array.isArray(limpo.categoriasServico)||limpo.categoriasServico.length>3000)return resp({error:"Categorias inválidas."},422);
              const out=[];for(const x of limpo.categoriasServico){if(!x||typeof x.descricao!=="string"||!x.descricao.trim()||x.descricao.length>1000||!permitidas.includes(x.categoria)||vistos.has(x.descricao))return resp({error:"Categoria ou descrição inválida/repetida."},422);vistos.add(x.descricao);const antigo=(atual.categoriasServico||[]).find((v:any)=>v.descricao===x.descricao);out.push(JSON.stringify(x)===JSON.stringify(antigo)?antigo:assinar({descricao:x.descricao,categoria:x.categoria}));}limpo.categoriasServico=out;
            }
            if(mudancaOperacional.includes("medicoesRetrabalho")){
              if(!limpo.medicoesRetrabalho||typeof limpo.medicoesRetrabalho!=="object"||Array.isArray(limpo.medicoesRetrabalho)||Object.keys(limpo.medicoesRetrabalho).length>3000)return resp({error:"Medições inválidas."},422);
              const out:any={};for(const [id,x] of Object.entries(limpo.medicoesRetrabalho) as [string,any][]){
                if(JSON.stringify(x)===JSON.stringify(atual.medicoesRetrabalho?.[id])){out[id]=x;continue;}
                const os=await getReg("os",id);if(!os?.osOriginal)return resp({error:"Medição exige O.S. de correção ligada à original."},422);
                const original=await getReg("os",String(x?.originalId || ""));if(!original || original.id===os.id || String(original.numero)!==String(os.osOriginal))return resp({error:"Confirme a O.S. original por ID; o número deve corresponder ao da correção."},422);
                if(!x || ["material","horas","km"].some(k=>x[k]!==null&&(typeof x[k]!=="number"||!Number.isFinite(x[k])||x[k]<0)) || typeof x.causa!=="string" || x.causa.length>500 || typeof x.prevencao!=="string" || x.prevencao.length>1000)return resp({error:"Medição, causa ou prevenção inválida."},422);
                out[id]=assinar({material:x.material,horas:x.horas,km:x.km,causa:x.causa,prevencao:x.prevencao,osOriginal:os.osOriginal,originalId:original.id});
              }limpo.medicoesRetrabalho=out;
            }
            if(mudancaOperacional.includes("prioridadesPCP")){
              if(typeof limpo.prioridadesPCP?.dono!=="string"||limpo.prioridadesPCP.dono.length>150)return resp({error:"Responsável inválido."},422);
              limpo.prioridadesPCP=assinar({dono:limpo.prioridadesPCP.dono.trim()});
            }
          }
          const comAvisos = avisosCfg.length ? { avisos: avisosCfg } : {};
          if (JSON.stringify(limpo) === JSON.stringify(atual)) return resp({ok:true,cfg:visivel(atual),versao,...comAvisos});
          const novaVersao = new Date(Math.max(Date.now(),Date.parse(versao || '')+1 || 0)).toISOString();
          const query = sb.from("pcp_config_global");
          const {data,error} = versao ? await query.update({config:limpo,atualizado_em:novaVersao}).eq("id",true).eq("atualizado_em",versao).select("id")
            : await query.insert({id:true,config:limpo,atualizado_em:novaVersao}).select("id");
          if (error) { if (error.code === "23505") continue; throw new Error(error.message); }
          if (data?.length) {
            // Diário: quem instala, quem é quem no RH, equipes, pesos e percentuais.
            await auditar("cfg", "configuracao", diffCfgAuditavel(atual, limpo));
            if(mudancaOperacional.length)await auditar("cfg","conferencia-operacional",{campos:mudancaOperacional,antes:Object.fromEntries(mudancaOperacional.map(k=>[k,atual[k]??null])),depois:Object.fromEntries(mudancaOperacional.map(k=>[k,limpo[k]]))});
            return resp({ok:true,cfg:visivel(limpo),versao:novaVersao,...comAvisos});
          }
        }
        return resp({error:"Outro aparelho está salvando. Sua alteração continua na fila; tente novamente."},503);
      }

      case "fotosEvento": {
        if(ehMaquina)return resp({error:"Entre com uma sessão do PCP."},403);
        const os=await getReg("os",String(body.osId || ""));
        if(!os)return resp({error:"O.S. não encontrada."},404);
        if(String(cracha?.papel)==="montagem" && !pertenceEquipe(os,quemToque(),await pessoasReq()))return resp({error:"O.S. fora da sua equipe."},403);
        const ids=[os.layoutFotoId,os.embarqueFotoId,...(os.fotosCheckinIds || []),...(os.fotosRetornoIds || []),...(os.itens || []).map((i:any)=>i.fotoProbId)].filter(Boolean);
        if(body.fileId) {
          if(!["admin","pcp","montagem","operacao"].includes(String(cracha?.papel || "")) || !ids.includes(body.fileId))return resp({error:"Foto fora do escopo de edição."},403);
          const ocorridoEm=String(body.ocorridoEm || ""),motivo=String(body.motivo || "").trim();
          if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ocorridoEm) || !Number.isFinite(Date.parse(ocorridoEm)) || Date.parse(ocorridoEm)>Date.now() || motivo.length<5 || motivo.length>500)return resp({error:"Confirme a data/hora real até agora e o motivo (5 a 500 caracteres)."},422);
          const {data:row,error}=await sb.from("pcp_registros").select("registro,atualizado_em").eq("colecao","foto_evento").eq("id",body.fileId).maybeSingle();
          if(error)throw new Error(error.message);
          if(!row)return resp({error:"Foto ainda sem recebimento confirmado. Aguarde sincronizar."},409);
          if(body.rev!==(row.registro.rev || 0))return resp({error:"Horário corrigido por outra pessoa. Atualize."},409);
          const autor=await autorAuditoria(),em=new Date().toISOString(),evento={ocorridoEm,motivo,por:autor.nome,porId:autor.porId,em};
          const registro={...row.registro,ocorridoEm,capturadoEm:ocorridoEm,confirmacao:evento,historico:[...(row.registro.historico || []),evento],rev:(row.registro.rev || 0)+1};
          const {data:salva,error:err}=await sb.from("pcp_registros").update({registro,atualizado_em:new Date(Math.max(Date.now(),Date.parse(row.atualizado_em)+1 || 0)).toISOString()}).eq("colecao","foto_evento").eq("id",body.fileId).eq("atualizado_em",row.atualizado_em).select("id");
          if(err)throw new Error(err.message);
          if(!salva?.length)return resp({error:"Outra pessoa corrigiu este horário. Atualize."},409);
          await auditar(os.id,"horario-foto",{campos:["foto_evento"],antes:{ocorridoEm:row.registro.ocorridoEm || null},depois:{fileId:body.fileId,...evento}},os.numero);
        }
        const {data,error}=await sb.from("pcp_registros").select("id,registro").eq("colecao","foto_evento").eq("apagado",false).in("id",ids);
        if(error)throw new Error(error.message);
        return resp({fotos:ids.map((id:any)=>{const foto={id,...((data || []).find((r:any)=>r.id===id)?.registro || {})};if(!gestaoVeTudo){const limpar=(x:any)=>{if(!x)return x;const {porId,...resto}=x;return resto;};foto.confirmacao=limpar(foto.confirmacao);foto.historico=(foto.historico || []).map(limpar);}return foto;})});
      }
      case "putPhoto": {
        const { base64, mime, fileId } = body;
        if (!base64) return resp({ error: "base64 ausente" }, 400);
        const id = fileId || "foto_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        const bytes = b64ParaBytes(base64), tipo = mimeDaDataUrl(base64, mime || "image/jpeg");
        /* TETO DO QUE UM CRACHÁ SOBE. O bucket é do projeto que o PCP divide
           com o RH e o Brief, e foi criado sem limite. O app sobe JPEG de até
           1280 px (STORE.pushPhoto, uns 300 KB) com id foto_<hora>_<sorteio>.
           Tipo que o navegador executaria (html, svg), arquivo grande ou id
           com caminho é recusado. A máquina (backup do Hub) segue livre.
           A FOTO LIGADA À O.S. (F24, 01/10/2026): a ficha da gestão manda
           foto_<id da O.S.>_<hora>_<sorteio> (letras, números e hífen no id
           da O.S., até 60; o UUID dá 62 no total, o mub-<número> uns 35). O
           total cabe nos 100 do idFoto do _shared. O formato antigo continua. */
        if (!ehMaquina) {
          if (bytes.length > 2_000_000) return resp({ error: "Foto grande demais. Tire a foto de novo." }, 422);
          if (!["image/jpeg", "image/png", "image/webp"].includes(tipo)) return resp({ error: "Tipo de arquivo não aceito. Envie uma foto." }, 422);
          if (id.length > 100 || !/^foto_(?:[A-Za-z0-9-]{1,60}_)?\d{10,}_[a-z0-9]{1,16}$/.test(id)) return resp({ error: "Identificação da foto inválida." }, 422);
        }
        const { error } = await sb.storage.from(BUCKET).upload(id, bytes, {
          contentType: tipo,
          upsert: false,
        });
        if (error && !(String((error as any).statusCode) === "409" || /already exists|duplicate/i.test(error.message))) throw new Error("upload: " + error.message);
        // O primeiro recebimento é imutável, inclusive após reenvio offline.
        const em=new Date().toISOString(),anexo=String(body.anexadoEm || "");
        const registro={id,anexadoEm:Number.isFinite(Date.parse(anexo)) && Date.parse(anexo)<=Date.now()?anexo:null,recebidoEm:em,capturadoEm:null,ocorridoEm:null,por:String(cracha?.nome || cracha?.sub || "Integração"),rev:0};
        const {error:err}=await sb.from("pcp_registros").upsert({colecao:"foto_evento",id,registro,apagado:false,atualizado_em:em},{onConflict:"colecao,id",ignoreDuplicates:true});
        if(err)throw new Error(err.message);
        const eventoFoto=await getReg("foto_evento",id);
        return resp({ fileId: id,evento:podarControle({cicloRegistro:[eventoFoto]}).cicloRegistro[0] });
      }

      case "deletePhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
        // Fotos referenciadas por exclusão lógica fazem parte da recuperação.
        // Nem uma fila antiga nem outra O.S. que reutilize o arquivo as apaga.
        let cursor="",concluiu=false;
        for(let pagina=0;pagina<100;pagina++) {
          const {data,error}=await sb.from("pcp_registros").select("id,registro").eq("colecao","os").eq("apagado",true).gt("id",cursor).order("id").limit(500);
          if(error)throw new Error(error.message);
          for(const row of data || []) {
            const o=row.registro,refs=[o.layoutFotoId,o.embarqueFotoId,...(o.fotosCheckinIds || []),...(o.fotosRetornoIds || []),...(o.itens || []).map((i:any)=>i.fotoProbId),...(o.voltaEquipe?.fotos || []),...(o.retornoConf?.fotos || [])];
            if(refs.includes(body.fileId))return resp({error:"Foto preservada para recuperar uma O.S. excluída. Solicite revisão à gestão."},409);
          }
          if(!data?.length || data.length<500){concluiu=true;break;}
          cursor=data[data.length-1].id;
        }
        if(!concluiu)return resp({error:"Não foi possível conferir todas as referências da foto. Arquivo preservado."},409);
        /* A PROVA DA ENTREGA (A2, auditoria de 11/10/2026). A foto citada por
           O.S. finalizada (check-in, retorno, item, volta do carro) é o que
           mostra a entrega física; até aqui qualquer crachá com senha a
           apagava do bucket, sem cópia nenhuma. Vale também a O.S. já
           reaberta e a foto carimbada em fotosProva (osComProvaDaFoto):
           reabrir ou regravar a lista vazia não tira a proteção (R1/S1).
           Agora só a gestão do PCP (admin ou pcp) apaga, com motivo, e o
           pedido entra no diário da O.S. ANTES de o arquivo sair: sem
           diário, a foto fica (503, a fila tenta de novo). Os outros papéis,
           a máquina e o crachá de toque recebem 403 com o motivo: a fila do
           aparelho tira o item e diz a recusa (403 não prende a fila; 422
           prenderia). */
        const finalizadas = await osComProvaDaFoto(String(body.fileId));
        if (finalizadas === null) return resp({error:"Não foi possível conferir todas as referências da foto. Arquivo preservado."},409);
        if (finalizadas.length) {
          if (!cracha || ehMaquina || ehToqueNoNome || !["admin","pcp"].includes(String(cracha.papel ?? "")))
            return resp({error:"Foto de O.S. que já foi finalizada é a prova da entrega: só a gestão do PCP (admin ou pcp) apaga, com motivo. A foto continua guardada."},403);
          const motivo = String(body.motivo ?? "").trim();
          if (motivo.length < 5 || motivo.length > 500)
            return resp({error:"Foto de O.S. que já foi finalizada: para apagar, informe o motivo (5 a 500 caracteres). A foto continua guardada."},403);
          const autor = await autorAuditoria(), em = new Date().toISOString();
          for (const o of finalizadas) {
            const entrada = entradaAuditoria({ id: crypto.randomUUID(), osId: o.id, numero: o.numero, acao: "foto-apagada",
              // Campos que a tela do histórico mostra (S2): "foto" e "motivo", antes e depois.
              diff: { campos: ["foto", "motivo"], antes: { foto: String(body.fileId), motivo: null }, depois: { foto: null, motivo } },
              autor, origem: origemAuditoria, em });
            if (!(await gravarAuditoria(entrada)))
              return resp({error:"Não foi possível registrar o pedido no diário da O.S. A foto continua guardada; o pedido vai de novo."},503);
          }
        }
        const {error} = await sb.storage.from(BUCKET).remove([body.fileId]);
        if (error) throw new Error(error.message);
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

      // O batimento da importação é da gestão: quem entrou pelo nome só
      // precisa saber que a porta responde.
      case "saude": {
        /* `auditoria`: quantas vezes o diário não gravou (o maior entre o
           contador guardado no banco e o desta instância, que pode ter contado
           uma falha que nem o banco aceitou). Zero aqui é "nenhuma falha
           registrada", não prova de diário completo: a importação do ERP ainda
           grava direto, fora do diário. */
        let auditoria: any = undefined;
        if (!ehToqueNoNome) {
          const salvo = await getMeta("auditoria_falhas").catch(() => null);
          const doBanco = Number(salvo?.total) || 0;
          const usarMem = FALHAS_AUDITORIA.total > doBanco || !salvo;
          auditoria = {
            falhas: Math.max(doBanco, FALHAS_AUDITORIA.total),
            ultimaFalhaEm: (usarMem ? FALHAS_AUDITORIA.ultimaEm : salvo?.ultimaEm) || "",
            ultimoErro: (usarMem ? FALHAS_AUDITORIA.ultimoErro : salvo?.ultimoErro) || "",
          };
        }
        return resp({
          ok: true,
          totalOS: await contarRegs("os"),
          ...(ehToqueNoNome ? {} : { ultimaImportacao: await getMeta("sync_status"), auditoria }),
        });
      }

      /* HISTÓRICO DE ALTERAÇÕES DE UMA O.S. (diário, F03). Só a gestão (admin
         e pcp) e a máquina (backup do Hub): o diário guarda valor em R$ e o
         antes e o depois de tudo. Montagem, operação e o crachá de toque
         levam 403, e nada disso passa pelo list. `osId: 'cfg'` é o diário da
         configuração. Lido sob demanda, quando a ficha abre a seção. O
         backup do Hub não passa por aqui: copia o diário inteiro pela
         exportarBackup (até 11/10/2026 não copiava nada dele). */
      case "auditoriaOS": {
        if (!ehMaquina && !["admin", "pcp"].includes(String(cracha?.papel ?? ""))) {
          return resp({ error: "Histórico de alterações restrito à gestão do PCP." }, 403);
        }
        const osId = String(body.osId ?? "").trim();
        if (!osId || osId.length > 200) return resp({ error: "Informe a O.S." }, 400);
        const TETO = 500;
        const { data, error } = await sb.from("pcp_registros").select("registro")
          .eq("colecao", "auditoria").eq("registro->>osId", osId)
          .order("atualizado_em", { ascending: false }).limit(TETO);
        if (error) throw new Error(error.message);
        const entradas = ((data ?? []) as any[]).map((r) => r.registro).filter(Boolean)
          .sort((a: any, b: any) => String(b.em || "").localeCompare(String(a.em || "")));
        return resp({ osId, entradas, cortado: entradas.length >= TETO });
      }

      /* A RÉGUA DO SERVIDOR PARA A TROCA DO NOME PELO ID (revisão da F12,
         30/09/2026). A tela "Conferir nomes" grava em lote o ID no lugar do
         nome antigo, e isso decide quem pontua e quem recebe comissão. O
         aparelho decidia com o retrato que tinha: configuração de até 5 min,
         elenco de até 30 min, dias sem rede. Esta porta devolve a resolução
         DAQUI: o vinculosRH gravado e o RH de agora (a cópia de 60 s das
         fichas é jogada fora), pela MESMA régua de _shared/pcp-integridade.mjs
         (pessoasDoPCP → resolverPessoas), sem cópia nova. O lote só troca o
         nome em que as duas respostas batem.
         Junto, para o lote não gravar às cegas: o estado de cada O.S. pedida
         ('viva', 'excluida' ou 'ausente': a excluída exige recuperação explícita) e os períodos já fechados da Performance (o fechamento selado
         não muda). SÓ LEITURA, SÓ admin e pcp: a régua cruza nomes com fichas
         do RH, e nada disso desce à operação, à montagem nem ao crachá sem
         senha. A tela chama na hora, fora da fila: o 403 e o 422 não prendem
         nada. */
      case "conferirNomes": {
        if (!cracha || ehMaquina || ehToqueNoNome || !["admin", "pcp"].includes(String(cracha.papel ?? "")))
          return resp({ error: "A conferência dos nomes com o RH é só da gestão do PCP (admin e pcp)." }, 403);
        const TETO_NOMES = 500, TETO_IDS = 500;
        const nomesPedidos = Array.isArray(body.nomes) ? body.nomes : [];
        const idsPedidos = Array.isArray(body.ids) ? body.ids : [];
        if (nomesPedidos.length > TETO_NOMES || idsPedidos.length > TETO_IDS)
          return resp({ error: `Confira no máximo ${TETO_NOMES} nomes e ${TETO_IDS} O.S. por vez.` }, 422);
        const nomes = [...new Set(nomesPedidos.map((n: any) => String(n ?? "").trim().slice(0, 120)).filter(Boolean))];
        const ids = [...new Set(idsPedidos.map((x: any) => String(x ?? "").trim().slice(0, 200)).filter(Boolean))];
        // O RH de AGORA: a cópia de 60 s pode ser de antes da correção do cadastro.
        _fichasRH = null;
        const r = await pessoasDoPCP((await getCfg()) ?? {});
        const resolvidos = nomes.map((nome) => ({ nome, id: r.idDe(nome), fixado: r.fixado(nome) }));
        const os: Record<string, string> = {};
        for (let i = 0; i < ids.length; i += 100) {
          const parte = ids.slice(i, i + 100);
          const { data, error } = await sb.from("pcp_registros").select("id,apagado").eq("colecao", "os").in("id", parte);
          if (error) throw new Error(error.message);
          for (const l of (data ?? []) as any[]) os[String(l.id)] = l.apagado ? "excluida" : "viva";
          for (const id of parte) if (!os[id]) os[id] = "ausente";
        }
        // Os períodos fechados (uma linha por revisão: o período conta uma vez).
        const { data: fech, error: erroFech } = await sb.from("pcp_registros").select("registro->>de, registro->>ate")
          .eq("colecao", "performance_fechamentos").eq("apagado", false).limit(1000);
        if (erroFech) throw new Error(erroFech.message);
        if ((fech || []).length >= 1000) throw new Error("Limite de fechamentos atingido na leitura.");
        const dataOk = (d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
        const periodos = new Map<string, { de: string; ate: string }>();
        for (const f of (fech ?? []) as any[]) if (dataOk(f.de) && dataOk(f.ate) && f.de <= f.ate) periodos.set(f.de + ":" + f.ate, { de: String(f.de), ate: String(f.ate) });
        const fechados = [...periodos.values()].sort((a, b) => a.de.localeCompare(b.de));
        return resp({ nomes: resolvidos, os, fechados, em: new Date().toISOString() });
      }

      default:
        return resp({ error: `Ação desconhecida: ${body.action}` }, 400);
    }
  } catch (e) {
    // A base que mudou durante a consulta (item 14): "tente de novo", não erro do servidor.
    if ((e as any)?.baseMudou) return resp({ error: (e as Error).message, tenteDeNovo: true }, 409);
    console.error("[pcp-sync] erro:", e);
    return resp({ error: (e as Error)?.message ?? "Erro interno" }, 500);
  }
});
