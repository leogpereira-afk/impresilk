import { mesclarConfiguracao, mesclarToqueNoNome, validarMomentos, carimbarExecucao, pertenceEquipe, validarConclusao, validarPerformance, composicoesAtivasRepetidas } from "../_shared/pcp-integridade.mjs";
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
  const corpo = { sis: "pcp", sub: nome, nome, papel: "montagem", montagemIndividual:true, iat: agora, exp: agora + 30 * 86400 };
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
// Config com o carimbo: o cliente manda `seVersao` e, se nada mudou, recebe
// 40 bytes em vez da config inteira. Ela mudou pela ultima vez em 18/08 e era
// baixada a cada 30 s por todo aparelho.
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
async function perfHash(v:any) {
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function perfFonte(body:any) {
  const periodo=perfPeriodo(body), inicio=new Date().toISOString();
  const cfgAntes=await getCfgComVersao();
  const lista:any[]=[]; let after="", terminou=false;
  for(let pagina=0;pagina<100;pagina++) {
    let q=sb.from("pcp_registros").select("id,registro,atualizado_em").eq("colecao","os").eq("apagado",false).order("id").limit(500);
    if(after) q=q.gt("id",after);
    const {data,error}=await q; if(error) throw new Error(error.message);
    const rows=data || [];
    for(const row of rows) {
      const o=row.registro, fim=perfDia(o?.finalizadaEm);
      if(!fim || o.tipo==="interno") continue;
      const erp=o.baixaAutoERP?.em===o.finalizadaEm || /^Mubisys\b/i.test(o.finalizadoPor || "");
      if(erp && !o.entregaLancada && fim>="2026-09-15") continue;
      const dia=(o.entregaLancada && perfDia(o.entregaLancada.data)) || fim;
      if(dia>=periodo.de && dia<=periodo.ate) lista.push({...o,id:row.id,_dia:dia});
    }
    if(rows.length<500){terminou=true;break;}
    const proximo=String(rows[rows.length-1].id);if(proximo<=after)throw new Error("Paginação inconsistente. Refaça a consulta.");after=proximo;
  }
  if(!terminou)throw new Error("Consulta excedeu o limite; nenhum fechamento foi criado.");
  const valores:Record<string,number>={};
  const nums=[...new Set(lista.map(o=>String(o.numero || "").trim()).filter(Boolean))];
  for(let i=0;i<nums.length;i+=300){
    const {data,error}=await sb.from("painel_ordens").select("numero,valor").in("numero",nums.slice(i,i+300));
    if(error)throw new Error(error.message);
    for(const r of data || []) if(r.valor!==null && r.valor!=="" && Number.isFinite(Number(r.valor)))valores[String(r.numero)]=Number(r.valor);
  }
  const cfgDepois=await getCfgComVersao();
  const {data:mudancas,error:erroMudancas}=await sb.from("pcp_registros").select("id").eq("colecao","os").gte("atualizado_em",inicio).limit(1);
  if(erroMudancas)throw new Error(erroMudancas.message);
  if(cfgAntes.versao!==cfgDepois.versao || mudancas?.length)throw new Error("A base mudou durante a consulta. Atualize para conferir novamente.");
  const participacoes=cfgAntes.config?.performancePCP?.participacoes || [];
  const num=(v:any)=>v==null||v===""?NaN:typeof v==="number"?v:Number(String(v).includes(",")?String(v).replace(/\./g,"").replace(",","."):v);
  const registros=lista.map(o=>{
    const p=participacoes.find((x:any)=>x.id===o.id);
    let valor=num(o.valorTotal), origem="O.S. do PCP";
    const mudou=o.erpAlteracoes?.some((h:any)=>h.campos?.some((x:any)=>x.campo==="valorTotal"));
    if(!mudou && Number.isFinite(valores[String(o.numero)])){valor=valores[String(o.numero)];origem="Painel / ERP";}
    if(!Number.isFinite(valor)||valor<0){const itens=(o.itens||[]).map((x:any)=>num(x.subtotal)).filter((v:number)=>Number.isFinite(v)&&v>0);valor=itens.length?itens.reduce((a:number,b:number)=>a+b,0):null;origem="Itens da O.S.";}
    const nomes=[...new Set((o.equipe||[]).map((n:any)=>String(n).trim()).filter(Boolean))];
    const membros=p?.membros || nomes.map((n,i)=>({chave:n,nome:n,percentual:(Math.floor(10000/nomes.length)+(i<10000%nomes.length?1:0))/100}));
    const confirmado=!!p && !validarPerformance({equipes:p.equipeId?[{id:p.equipeId,nome:p.equipeNome || "Equipe",emblema:p.emblema || "🤝",membros}]:[],participacoes:[p]});
    /* A CONFERÊNCIA DA VOLTA (carro e equipamentos) entra na base para pesar
       na avaliação individual. Só "sim"/"nao" passam; o resto é "não
       conferido" (null) e não pesa contra ninguém. */
    const snv=(v:any)=>v==="sim"||v===true?"sim":(v==="nao"||v===false?"nao":null);
    const rc=o.retornoConf&&typeof o.retornoConf==="object"?o.retornoConf:null;
    /* 24/09/2026: "arrumado" (conta junto com "limpo") e "sem avaria" (não
       conta, mas a tela mostra) vieram com a fila da volta do carro. */
    const PERGUNTAS=["carroLimpo","carroArrumado","equipamentosOk","semAvaria"];
    const retornoConf=rc&&PERGUNTAS.some(k=>snv(rc[k]))?{...Object.fromEntries(PERGUNTAS.map(k=>[k,snv(rc[k])])),por:String(rc.por||"").slice(0,120),porId:String(rc.porId||"").slice(0,120),em:String(rc.em||"").slice(0,40)}:null;
    return {id:o.id,numero:String(o.numero||""),cliente:String(o.cliente||""),dia:o._dia,valor,origemValor:valor===null?"Sem valor":origem,membros,confirmado,equipeId:p?.equipeId||"",equipeNome:p?.equipeNome||"",emblema:p?.emblema||"🤝",obs:p?.obs||"",por:p?.por||"",em:p?.em||"",retrabalho:!!o.retrabalho,retornoConf};
  });
  /* performance-2: cada registro leva a conferência da volta, e a apuração
     leva os PESOS DA NOTA em vigor. Eles entram no hash: quem fecha sela os
     pesos que viu (trocá-los entre consultar e fechar dá 409), e uma revisão
     fechada não muda de ordem quando a gestão mexe nos pesos depois. */
  const pesosCfg=cfgAntes.config?.performancePCP?.criterios;
  const criterios=pesosCfg && !validarPerformance({equipes:[],participacoes:[],criterios:pesosCfg})
    ? {producao:pesosCfg.producao,limpeza:pesosCfg.limpeza,equipamentos:pesosCfg.equipamentos}
    : {producao:60,limpeza:20,equipamentos:20};
  const conteudo={periodo,regra:"performance-2",criterios,registros};
  return {...conteudo,hash:await perfHash(conteudo),consultadoEm:new Date().toISOString(),completo:true,fonte:"Todas as instalações registradas no PCP no período; não certifica serviços ausentes do ERP."};
}
async function perfFechamentos(periodo:any) {
  const {data,error}=await sb.from("pcp_registros").select("id,registro").eq("colecao","performance_fechamentos").eq("apagado",false).eq("registro->>de",periodo.de).eq("registro->>ate",periodo.ate).order("id").limit(1000);
  if(error)throw new Error(error.message);if(data?.length===1000)throw new Error("Limite de revisões atingido.");
  return (data||[]).map((r:any)=>r.registro).sort((a:any,b:any)=>b.revisao-a.revisao);
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
  if (cracha && !ehMaquina && (await crachaRevogado(cracha))) {
    return resp({ error: "Seu acesso ao PCP foi encerrado. Fale com a gestão.", semSessao: true }, 401);
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
    return resp({token:await assinarCrachaMontagem(bate),nome:bate,papel:"montagem"});
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
    if (acao === "upsert" && ehToqueNoNome && body?.os) {
      const veio = body.os as Record<string, unknown>;
      const id = String(veio.id ?? "");
      const atual = id ? await getReg("os", id) : null;
      if (!atual) {
        return resp({ error: "Quem entra pelo nome não cria O.S. Fale com o PCP." }, 403);
      }
      if (!pertenceEquipe(atual, cracha.nome || cracha.sub)) return resp({error:"Esta O.S. não está na sua equipe."},403);
      const mescla = mesclarToqueNoNome(atual, veio, String(cracha.nome || cracha.sub), new Date().toISOString());
      if (mescla.erro) return resp({ error: mescla.erro }, 422);
      body.os = mescla.os;
    }

    if (acao === "delete" && ehToqueNoNome) {
      return resp({ error: "Quem entra pelo nome não apaga O.S. Fale com o PCP." }, 403);
    }
  }

  if (ehToqueNoNome && ["getPhoto","deletePhoto"].includes(acao)) {
    const {data,error} = await sb.from("pcp_registros").select("registro").eq("colecao","os").eq("apagado",false)
      .contains("registro",{equipe:[String(cracha.nome || cracha.sub)]});
    if (error) return resp({error:"Não foi possível conferir o vínculo da foto."},503);
    const permitida = (data || []).some((r: any) => [r.registro.layoutFotoId,...(r.registro.fotosCheckinIds || []),...(r.registro.fotosRetornoIds || []),...(r.registro.itens || []).map((i: any) => i?.fotoProbId)].filter(Boolean).includes(body.fileId));
    if (!permitida) return resp({error:"Esta foto não está vinculada às O.S. da sua equipe."},403);
  }

  try {
    switch (acao) {
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
          perfFonte({de,ate}),
        ]);
        if(fluxo.error || cache.error)throw new Error("Não foi possível ler as fontes do relatório.");
        // perfFonte já verifica paginação e alterações concorrentes; só detalhes operacionais mínimos.
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
          }).map((r:any)=>({numero:r.numero,cliente:r.cliente,data:r.data,valor:numero(r.valor)}));
          const vendas=ordens.filter(r=>String(r.data).startsWith(mes)).map(r=>({numero:r.numero,cliente:r.cliente,data:r.data,valor:numero(r.valor)}));
          const instalacoes=operacao.registros.filter((r:any)=>r.dia.startsWith(mes));
          const retrabalhos=instalacoes.filter((r:any)=>r.retrabalho===true).map((r:any)=>({numero:r.numero,cliente:r.cliente,data:r.dia}));
          return {mes,entregue:pacote?.v>=2 && Array.isArray(pacote.os)?soma(entregas):null,
            vendido:vendas.length?soma(vendas):null,recebido:entradas && Object.prototype.hasOwnProperty.call(entradas,mes)?numero(entradas[mes]):null,
            retrabalho:instalacoes.length?100*retrabalhos.length/instalacoes.length:null,baseRetrabalho:instalacoes.length,
            entregas,vendas,retrabalhos,entregasEm:pacote?.em || null};
        });
        return resp({ano,de,ate,meses:linhas,consultadoEm:new Date().toISOString(),recebimentosEm:fluxo.data?.atualizado_em || null,
          notas:{vendido:"O.S. por data de cadastro no Mubisys, valor líquido. Não equivale a faturamento fiscal. Histórico depende da carga do ERP; mês sem registros não confirma venda zero.",
          recebido:"Pagamentos de contas a receber pela data de pagamento/crédito, no fluxo mensal do Painel. Fonte agregada: não contém títulos individuais. Anos preservados podem ter atualização anterior à carga indicada.",
          retrabalho:"Instalações finalizadas no PCP no mês com marca de retrabalho ÷ instalações finalizadas registradas no mesmo mês. Histórico operacional pode ser incompleto; ausência de marca não comprova inspeção de qualidade.",
          entregue:"O.S. com status entregue no Mubisys pela data de entrega, incluindo retiradas. Valores líquidos; alterações posteriores dependem de nova sincronização."}});
      }

      case "performancePeriodo":
      case "performanceFechamentos":
      case "performanceFechar": {
        if(!ehMaquina && !["admin","pcp"].includes(String(cracha?.papel || "")))return resp({error:"Apuração restrita à gestão do PCP."},403);
        let periodo;try{periodo=perfPeriodo(body);}catch(e){return resp({error:(e as Error).message},422);}
        if(acao==="performancePeriodo")return resp(await perfFonte(body));
        const fechamentos=await perfFechamentos(periodo);
        if(acao==="performanceFechamentos")return resp({fechamentos});
        const requestId=String(body.requestId || "");
        if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId))return resp({error:"Identificação do fechamento inválida."},422);
        const repetido=fechamentos.find((r:any)=>r.requestId===requestId);if(repetido)return resp({ok:true,fechamento:repetido});
        const anterior=fechamentos[0];
        if((anterior?.id || "")!==String(body.anterior || ""))return resp({error:"Outro fechamento foi criado. Recarregue as revisões."},409);
        const motivo=String(body.motivo || "").trim();
        if(motivo.length<5 || motivo.length>500)return resp({error:"Informe um motivo de 5 a 500 caracteres para o fechamento ou revisão."},422);
        const fonte=await perfFonte(body);
        if(fonte.hash!==body.hash)return resp({error:"Os dados mudaram. Atualize, confira e tente novamente."},409);
        if(!fonte.registros.length || fonte.registros.some((r:any)=>!r.confirmado || r.valor===null))return resp({error:"Confirme todas as participações e confira os valores antes de fechar."},422);
        const revisao=(anterior?.revisao || 0)+1,id=periodo.de+":"+periodo.ate+":"+String(revisao).padStart(6,"0");
        const registro={...fonte,...periodo,id,revisao,anterior:anterior?.id||null,requestId,motivo,fechadoEm:new Date().toISOString(),fechadoPor:cracha?.nome || "Integração autorizada"};
        const {error}=await sb.from("pcp_registros").insert({colecao:"performance_fechamentos",id,registro,apagado:false,atualizado_em:registro.fechadoEm});
        if(error){if(error.code==="23505")return resp({error:"O período recebeu outra revisão. Atualize antes de fechar."},409);throw new Error(error.message);}
        return resp({ok:true,fechamento:registro});
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
        const podar = (r: any) => { if (!soExecucao) return r; const { cnpjCpf, ...resto } = r ?? {}; return resto; };

        if (body.since) {
          const since = String(body.since);
          const { data, error } = await sb.from("pcp_registros")
            .select("id, registro, apagado, atualizado_em")
            .eq("colecao", "os").gt("atualizado_em", since)
            .order("atualizado_em").limit(500);
          if (error) throw new Error(error.message);
          const linhas = data ?? [];
          return resp({
            os: linhas.map((r: any) => r.apagado || (soExecucao && !pertenceEquipe(r.registro, cracha.nome || cracha.sub)) ? { id: r.id, apagado: true } : podar(r.registro)),
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
          if (termo) q = q.or(`registro->>numero.ilike.*${termo}*,registro->>cliente.ilike.*${termo}*`);
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
        /* CPF/CNPJ NAO VAI PARA QUEM ENTROU PELO NOME (ver `podar`): o cracha
           de toque sai de um primeiro nome, sem senha; precisa de cliente,
           endereco e contato, nao do documento de ninguem. */
        return resp({
          os: linhas.filter((r: any) => !soExecucao || pertenceEquipe(r.registro,cracha.nome || cracha.sub)).map((r: any) => podar(r.registro)),
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
            if (canonico) return resp({ ok: true, os: canonico, duplicataEvitada: true });
          }
        }

        const {data:linhaAtual,error:erroAtual} = await sb.from("pcp_registros").select("registro,atualizado_em,apagado").eq("colecao","os").eq("id",os.id).maybeSingle();
        if (erroAtual) throw new Error(erroAtual.message);
        const existing = linhaAtual?.registro ?? null;
        const erroConclusao = validarConclusao(os,existing,String(cracha?.papel || ''));
        if (erroConclusao) return resp({error:erroConclusao},422);
        if (os.finalizadaEm && !existing?.finalizadaEm && os.justificativaConclusao) {
          os.excecaoConclusao = {motivo:String(os.justificativaConclusao).trim(),por:cracha?.nome || cracha?.sub,em:new Date().toISOString()};
        }
        const erroMomento = validarMomentos(os);
        if (erroMomento) return resp({error:erroMomento},400);
        // Remarcar invalida a confirmação anterior; não inventa confirmação de hoje.
        if (existing && JSON.stringify(existing.instalacao) !== JSON.stringify(os.instalacao) && !(os.confirmacao === "Confirmado" && os.confEm && os.confEm !== existing.confEm)) {
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
            existing.paradoClienteEm);
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
            const mudou = PERGUNTAS.some((k) => n[k] !== sn(antes?.[k]));
            if (!PERGUNTAS.some((k) => n[k])) { n.por = ""; n.porId = ""; n.em = ""; }
            else if (mudou) { n.por = cracha?.nome || cracha?.sub || ""; n.porId = String(cracha?.sub ?? ""); n.em = new Date().toISOString(); }
            else { n.por = antes?.por || ""; n.porId = antes?.porId || ""; n.em = antes?.em || ""; }
            os.retornoConf = n;
          }
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
        if (os.carroLiberado && !existing?.carroLiberado) {
          const diaSP = (x: string) => Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)-3*3600*1000).toISOString().slice(0,10) : '';
          const diaSaida = diaSP(os.carroLiberadoEm || '');
          if (!diaSaida || os.confirmacao !== 'Confirmado' || diaSP(os.confEm || '') !== diaSaida)
            return resp({error:"Confirme o cliente no dia da saída antes de liberar o veículo."},422);
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
        // Preserva o atualizadoEm do autor: reescrever com o relogio do servidor
        // misturava duas fontes de tempo e o proprio autor levava "conflito".
        // (Ele segue valendo para EXIBIR "alterado em"; quem decide conflito e o rev.)
        const gravar = { ...carimbarExecucao(os, existing, cracha?.nome || cracha?.sub || "Integração", new Date().toISOString()), rev: revAtual + 1 };
        try {
          if (linhaAtual) {
            const {data,error} = await sb.from("pcp_registros").update({registro:gravar,atualizado_em:new Date(Math.max(Date.now(),Date.parse(linhaAtual.atualizado_em)+1 || 0)).toISOString(),apagado:false})
              .eq("colecao","os").eq("id",os.id).eq("atualizado_em",linhaAtual.atualizado_em).select("id");
            if (error) throw new Error(error.message);
            if (!data?.length) return resp({conflito:true,servidor:await getReg("os",os.id)});
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
        // PostgREST corta em 1000 linhas por pedido: pergunta em fatias.
        for (let i = 0; i < lista.length; i += 500) {
          const { data: po, error: e2 } = await sb.from("painel_ordens")
            .select("numero, valor").in("numero", lista.slice(i, i + 500));
          if (e2) return resp({ error: e2.message }, 500);
          for (const r of po ?? []) {
            const v = Number(r.valor);
            if (r.numero && Number.isFinite(v)) valores[String(r.numero)] = v;
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
        return resp({ valores, anos, em: new Date().toISOString() });
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
              foto: foto.startsWith("data:image") && foto.length < 200000 ? foto : "",
            };
          })
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
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
        return resp({ pessoas, veiculos, hoje: hojeUTC, em: new Date().toISOString(), fichaRH: verFichaRH,
                      ferias: verFichaRH ? ferias : [], ausencias: verFichaRH ? ausencias : [] });
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
          return resp({ cfg: publico, versao });
        }
        return resp({ cfg, versao });
      }

      case "setCfg": {
        if (!body.cfg || typeof body.cfg !== "object" || Array.isArray(body.cfg)) return resp({ error: "Configuração inválida" }, 400);
        const visivel = (cfg: any) => {
          const {usuarios,funcionarios,...out} = cfg || {}; return out;
        };
        for (let tentativa=0;tentativa<3;tentativa++) {
          const {config,versao} = await getCfgComVersao();
          const atual = config || {};
          if (!body.baseCfg) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:["Configuração salva por versão antiga; revise antes de reaplicar."]},409);
          const base = visivel(body.baseCfg), local = visivel(body.cfg), remoto = visivel(atual);
          if (cracha?.papel === "pcp" && !ehMaquina) {
            const permitidas = new Set(["agendaPCP","bonusPCP","performancePCP","vinculosRH","mensagemDia"]);
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
          const result = mesclarConfiguracao(base,local,remoto);
          if (result.conflitos.length) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:result.conflitos},409);
          const limpo = {...atual,...result.cfg};
          for (const k of Object.keys(remoto)) if (!(k in result.cfg)) delete limpo[k];
          if (JSON.stringify(limpo.performancePCP) !== JSON.stringify(atual.performancePCP)) {
            const erroPerf = validarPerformance(limpo.performancePCP);
            if (erroPerf) return resp({error:erroPerf},422);
            // Repetição NOVA de equipe ativa vira conflito (409), não recusa: o
            // 422 da v124 era lido como rede e travava a fila inteira.
            const repetidasAntes = composicoesAtivasRepetidas(atual.performancePCP, atual.vinculosRH);
            const novas = [...composicoesAtivasRepetidas(limpo.performancePCP, limpo.vinculosRH)].filter(k => !repetidasAntes.has(k));
            if (novas.length) return resp({conflitoCfg:true,servidorCfg:visivel(atual),campos:["performancePCP.equipes: duas equipes ativas com os mesmos integrantes. Desative uma delas."]},409);
            if(limpo.performancePCP) limpo.performancePCP.participacoes = limpo.performancePCP.participacoes.map((p:any)=>{
              const antes=atual.performancePCP?.participacoes?.find((x:any)=>x.id===p.id);
              return JSON.stringify(antes)===JSON.stringify(p) ? p : {...p,por:cracha?.nome || 'Gestão',em:new Date().toISOString()};
            });
          }
          if (JSON.stringify(limpo) === JSON.stringify(atual)) return resp({ok:true,cfg:visivel(atual),versao});
          const novaVersao = new Date(Math.max(Date.now(),Date.parse(versao || '')+1 || 0)).toISOString();
          const query = sb.from("pcp_config_global");
          const {data,error} = versao ? await query.update({config:limpo,atualizado_em:novaVersao}).eq("id",true).eq("atualizado_em",versao).select("id")
            : await query.insert({id:true,config:limpo,atualizado_em:novaVersao}).select("id");
          if (error) { if (error.code === "23505") continue; throw new Error(error.message); }
          if (data?.length) return resp({ok:true,cfg:visivel(limpo),versao:novaVersao});
        }
        return resp({error:"Outro aparelho está salvando. Sua alteração continua na fila; tente novamente."},503);
      }

      case "putPhoto": {
        const { base64, mime, fileId } = body;
        if (!base64) return resp({ error: "base64 ausente" }, 400);
        const id = fileId || "foto_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        const { error } = await sb.storage.from(BUCKET).upload(id, b64ParaBytes(base64), {
          contentType: mimeDaDataUrl(base64, mime || "image/jpeg"),
          upsert: false,
        });
        if (error && !(String((error as any).statusCode) === "409" || /already exists|duplicate/i.test(error.message))) throw new Error("upload: " + error.message);
        return resp({ fileId: id });
      }

      case "deletePhoto": {
        if (!body.fileId) return resp({ error: "fileId ausente" }, 400);
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
