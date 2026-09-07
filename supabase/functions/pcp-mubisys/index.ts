// ============================================================================
// pcp-mubisys — integracao com o ERP (substitui mubisys.js + mubisys-sync.mjs)
//
// As duas viraram UMA: a importacao horaria ja chamava a outra por dentro, via
// um POST em process.env.URL -- variavel que so existe no Netlify. Juntando,
// a dependencia some e sobra uma chamada de funcao.
//
// Acoes: salvarConfig, statusConfig, ping, preview, listarOS, getOS, importar.
// "importar" e o que o pg_cron chama de hora em hora.
//
// De-para: store "integracoes" chave "mubisys" -> pcp_meta chave "mubisys";
// o batimento "sync_status" -> pcp_meta chave "sync_status".
//
// PROJETO COMPARTILHADO: prefixo obrigatorio no nome da function.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("PCP_TOKEN") ?? "";
// Credencial DEDICADA do robô horário (pg_cron): libera SÓ a ação "importar".
// Separada do PCP_TOKEN do Hub — girável sem coordenar com o backup, e vive só
// no cron.job (banco privado), não no repo público.
const CRON_TOKEN = Deno.env.get("PCP_CRON_TOKEN") ?? "";
const DEFAULT_BASE = "https://api.mubisys.com/api";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function getMeta(chave: string): Promise<any | null> {
  const { data } = await sb.from("pcp_meta").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}
async function setMeta(chave: string, valor: unknown) {
  await sb.from("pcp_meta").upsert(
    { chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
}

// Hosts em que e seguro mandar o Access-Token do ERP.
//
// NOVO em relacao ao mubisys.js original, que aceitava qualquer `base`. O campo
// e cadastravel pelo app e o token que autoriza esse cadastro viaja no bundle:
// sem a trava, quem tivesse o token podia apontar a base para o proprio servidor
// e o PCP entregaria a credencial do ERP -- alvo muito maior que o PCP. O Brief
// ja tinha essa protecao; aqui faltava.
function baseConfiavel(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const envBase = String(Deno.env.get("MUBI_BASE_URL") ?? "").trim();
  if (envBase) {
    try { if (new URL(envBase).host === u.host) return true; } catch { /* env torta nao derruba */ }
  }
  const host = u.host.toLowerCase();
  return host === "mubisys.com" || host.endsWith(".mubisys.com");
}

async function getCreds() {
  const cfg = (await getMeta("mubisys")) ?? {};
  const bruta = String(cfg.base || Deno.env.get("MUBI_BASE_URL") || DEFAULT_BASE).replace(/\/+$/, "");
  const base = baseConfiavel(bruta) ? bruta : DEFAULT_BASE;
  if (base !== bruta) console.warn("[pcp-mubisys] base recusada:", bruta);
  return {
    publicKey: cfg.publicKey || Deno.env.get("MUBI_PUBLIC_KEY") || "",
    accessToken: cfg.accessToken || Deno.env.get("MUBI_TOKEN") || "",
    base,
    status: cfg.status || "PRODUCAO",
  };
}

// ---------------------------------------------------------------- helpers

const pick = (o: any, ...ks: string[]) => {
  if (!o) return "";
  for (const k of ks) { const v = o[k]; if (v != null && v !== "") return v; }
  return "";
};
const extrairLista = (d: any): any[] =>
  Array.isArray(d) ? d
  : Array.isArray(d?.data) ? d.data
  : Array.isArray(d?.items) ? d.items
  : Array.isArray(d?.results) ? d.results
  : d?.data ? [d.data] : [];
const extrairUm = (d: any) => (d?.data && !Array.isArray(d.data)) ? d.data : (extrairLista(d)[0] || d || {});

function isoData(str: any): string {
  if (!str) return "";
  const s = String(str);
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
const isoHora = (str: any) => String(str ?? "").match(/(\d{2}):(\d{2})/)?.slice(1, 3).join(":") ?? "";
const parsePrazoDias = (p: any) => p ? (String(p).match(/\d+/) ? parseInt(String(p).match(/\d+/)![0], 10) : null) : null;
function addDias(iso: string, n: number | null): string {
  if (!iso || n == null) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function montarEndereco(c: any): string {
  c = c || {};
  const direto = pick(c, "enderecoCompleto", "endereco");
  if (direto && typeof direto === "string") return direto;
  return [
    pick(c, "logradouro", "rua"), pick(c, "numero"), pick(c, "complemento"), pick(c, "bairro"),
    pick(c, "cep") ? "CEP: " + pick(c, "cep") : "",
    [pick(c, "cidade", "municipio"), pick(c, "estado", "uf")].filter(Boolean).join(" - "),
  ].filter(Boolean).join(" - ");
}
// Sem hora de entrega o periodo fica em branco: assumir "Manha" criava um
// agendamento matinal ficticio que ninguem escolheu.
const definirPeriodo = (hora: string) => !hora ? "" : (parseInt(hora.split(":")[0], 10) >= 12 ? "Tarde" : "Manhã");

function mapearItem(it: any, i: number) {
  it = it || {};
  const med = pick(it, "medidas", "medida", "dimensoes");
  const larg = pick(it, "largura", "pcp_largura"), alt = pick(it, "altura", "pcp_altura");
  return {
    item: String(pick(it, "posicao") || (i + 1)),
    descricao: pick(it, "descricao", "item", "produto", "nome") || "Item",
    medidas: med || (larg && alt ? `${larg}x${alt}` : ""),
    qtde: String(pick(it, "quantidade", "qtde", "qtd") || "1"),
    valorUnit: String(pick(it, "valor_unitario", "valorUnitario", "preco", "valor") || ""),
    subtotal: String(pick(it, "sub_total", "subtotal", "valor_final", "total") || ""),
    pronto: false,
  };
}

function mapearOS(o: any) {
  o = o || {};
  const contato = (Array.isArray(o.cliente_contato) && o.cliente_contato[0]) || {};
  const endereco = (Array.isArray(o.cliente_endereco) && o.cliente_endereco[0]) || {};
  const entregaIso = isoData(pick(o, "data_entrega", "dataEntrega", "entrega", "data_instalacao", "dataInstalacao"));
  const entregaHr = isoHora(pick(o, "hora_entrega", "horaEntrega", "entrega", "hora_instalacao", "horaInstalacao"));
  // Logistica define o tipo: "Cliente retira" -> interno; o resto -> externo.
  const logistica = String(pick(o, "logistica", "tipo_logistica", "tipo_entrega", "modalidade_entrega", "entrega_tipo") || "");
  const dataAprov = isoData(pick(o, "data_aprovacao", "data_cadastro"));
  return {
    tipo: /retir/i.test(logistica) ? "interno" : "externo",
    numero: String(pick(o, "sequencial_ordem", "numero", "numeroOS", "codigo") || ""),
    // Situacao da O.S no ERP. E o que permite a BAIXA AUTOMATICA: quando o
    // pedido sai de producao la, ele nao pode continuar ocupando a mesa aqui.
    statusERP: String(pick(o, "status", "situacao", "status_os") || "").trim().toUpperCase(),
    servico: pick(o, "nome_trabalho", "referencia", "titulo", "descricao"),
    vendedor: pick(o, "vendedor", "atendente", "vendedorNome"),
    dataEntrada: isoData(pick(o, "data_cadastro", "data_aprovacao")),
    previsaoEntrega: entregaIso || addDias(dataAprov, parsePrazoDias(pick(o, "prazo"))),
    cliente: typeof o.cliente === "string" ? o.cliente : pick(o.cliente || {}, "nome", "razaoSocial"),
    contato: pick(contato, "nome_contato", "nome", "contato", "responsavel"),
    whatsapp: pick(contato, "celular", "telefone", "whatsapp", "fone"),
    cnpjCpf: pick(o, "cpf_cnpj", "cpfcnpj", "cnpj", "cpf") || pick(contato, "cpf_cnpj", "cpfcnpj"),
    endereco: montarEndereco(endereco),
    observacao: pick(o, "observacao_geral", "observacao_producao"),
    instalacao: { data: entregaIso, hora: entregaHr, periodo: definirPeriodo(entregaHr) },
    itens: (o.itens || o.produtos || o.items || []).map(mapearItem),
    _origemMubisys: true,
  };
}

// ── BAIXA AUTOMATICA ────────────────────────────────────────────────────────
//
// O PROBLEMA: a O.S entra aqui quando o ERP a poe em producao, mas quando ela
// SAI de producao la (concluida, entregue, cancelada) ninguem avisa o PCP. A
// equipe entrega e esquece de finalizar no app, e a mesa vai entupindo: em
// 07/09/2026 havia 341 cards ativos, 309 deles "aguardando producao", muitos
// atrasados ha mais de 40 dias -- pedidos que ja tinham saido no ERP.
//
// A REGRA: quem manda no ciclo de vida e o ERP. O.S que o ERP reporta em
// situacao final recebe baixa aqui, com carimbo de quem deu (nunca deducao
// muda: o status vem escrito na resposta do ERP). A equipe pode desfazer pelo
// botao "Reabrir / voltar status" do proprio card.
//
// O QUE NUNCA ACONTECE:
//  - baixar O.S que o ERP NAO mencionou (fora da janela de datas): ausencia da
//    lista nao e prova de conclusao, e so o que o ERP AFIRMA vale;
//  - apagar qualquer coisa: baixa e finalizar, o card vai para Finalizados e
//    depois para Arquivados, com todo o historico;
//  - baixar em massa por engano: o freio abaixo interrompe se a conta passar
//    do razoavel, porque uma resposta estranha do ERP nao pode virar faxina.
const STATUS_FINAIS = new Set(["CONCLUIDO", "CONCLUÍDO", "ENTREGUE", "CANCELADO", "FINALIZADO"]);
// Acima deste tanto de baixas numa passada so mexe com confirmacao explicita
// (body.forcar). Protege contra o ERP devolver uma lista torta.
const TETO_BAIXAS = 60;

async function baixaAutomatica(sb: any, base: string, publicKey: string, headers: any, opts: any = {}) {
  const simular = opts.simular !== false ? opts.simular === true : false;
  // Janela larga: o mesmo -180/+180 da importacao, por data de CADASTRO.
  const hoje = new Date();
  const ini = new Date(hoje); ini.setDate(ini.getDate() - 365);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 180);
  const q = new URLSearchParams({
    status: "TODOS",
    filtrodata: "CADASTRO",
    datainicial: ini.toISOString().slice(0, 10),
    datafinal: fim.toISOString().slice(0, 10),
  });
  const r = await fetch(`${base}/${publicKey}/ordem-servico?${q}`, { headers });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Mubisys retornou HTTP ${r.status} na conferencia de status`);
  const doErp = extrairLista(data).map(mapearOS);
  // Lista vazia nao e "tudo concluido" -- e resposta suspeita. Nao mexe.
  if (!doErp.length) return { ok: false, motivo: "o ERP nao devolveu nenhuma O.S nesta janela", baixadas: 0 };

  const statusPorNumero = new Map<string, string>();
  for (const o of doErp) if (o.numero) statusPorNumero.set(String(o.numero), o.statusERP || "");

  // As que estao ABERTAS aqui (nao apagadas, sem finalizacao).
  const { data: linhas, error } = await sb
    .from("pcp_registros").select("id, registro")
    .eq("colecao", "os").eq("apagado", false);
  if (error) throw new Error(error.message);
  const abertas = (linhas ?? []).filter((l: any) => !String(l.registro?.finalizadaEm || "").trim());

  // Dia de hoje no fuso da empresa (UTC-3): a agenda da equipe e local, e
  // comparar com a data UTC tiraria da mesa, de madrugada, o servico de hoje.
  const hojeLocal = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  const alvos: any[] = [];
  let semNoticia = 0;
  let agendadas = 0;
  for (const l of abertas) {
    const num = String(l.registro?.numero || "").trim();
    if (!num) continue;
    const st = statusPorNumero.get(num);
    if (st === undefined) { semNoticia++; continue; }  // o ERP nao falou dela: nao mexe
    if (!STATUS_FINAIS.has(st)) continue;              // segue viva la
    // A EQUIPE TEM VISITA MARCADA: nao tira da mesa. O ERP costuma marcar
    // ENTREGUE quando o material sai da fabrica, e a instalacao ainda esta por
    // vir -- baixar aqui sumiria com a agenda de quem vai subir no andaime.
    const dataAgenda = String(l.registro?.instalacao?.data || "").trim();
    if (dataAgenda && dataAgenda >= hojeLocal) { agendadas++; continue; }
    alvos.push({ id: l.id, registro: l.registro, statusERP: st });
  }

  const resumo = {
    ok: true,
    abertasNoPcp: abertas.length,
    conferidas: abertas.length - semNoticia,
    semNoticiaDoErp: semNoticia,
    poupadasComAgenda: agendadas,
    baixadas: 0,
    candidatas: alvos.length,
    porStatus: alvos.reduce((acc: any, a: any) => { acc[a.statusERP] = (acc[a.statusERP] || 0) + 1; return acc; }, {}),
    exemplos: alvos.slice(0, 8).map((a: any) => `${a.registro.numero} ${String(a.registro.cliente || "").slice(0, 28)} [${a.statusERP}]`),
    simulado: !!simular,
    freado: false as boolean | string,
  };

  if (simular) return resumo;

  // BAIXA EM PARCELAS, e nao tudo de uma vez. O teto nao existe para impedir a
  // limpeza -- existe para que um erro nao vire estrago grande antes de alguem
  // ver. Com o atraso acumulado (177 na primeira vez), as primeiras 60 saem
  // agora e o resto nas proximas rodadas de hora em hora: a mesa se limpa
  // sozinha em pouco tempo e qualquer coisa errada aparece cedo, pequena e
  // reversivel (o card tem "Reabrir / voltar status").
  const lote = opts.forcar ? alvos : alvos.slice(0, TETO_BAIXAS);
  if (alvos.length > lote.length) {
    resumo.freado = `${alvos.length} candidatas: baixando ${lote.length} agora, o restante nas próximas rodadas.`;
  }

  const agora = new Date().toISOString();
  const linhasBaixa = lote.map((a: any) => ({
    colecao: "os",
    id: a.id,
    registro: {
      ...a.registro,
      finalizadaEm: agora,
      finalizadoPor: `Mubisys (baixa automática · ${a.statusERP})`,
      baixaAutoERP: { em: agora, status: a.statusERP },
      atualizadoEm: agora,
      atualizadoPor: "Mubisys (auto)",
    },
    atualizado_em: agora,
    apagado: false,
  }));
  for (let i = 0; i < linhasBaixa.length; i += 100) {
    const { error: e2 } = await sb.from("pcp_registros")
      .upsert(linhasBaixa.slice(i, i + 100), { onConflict: "colecao,id" });
    if (e2) throw new Error(e2.message);
  }
  resumo.baixadas = linhasBaixa.length;
  return resumo;
}

// Esqueleto identico ao novaOS() do app, preenchido com os campos do Mubisys.
function montarOSImportada(remoto: any) {
  const agora = new Date().toISOString();
  const os: any = {
    id: "", numero: "", tipo: "externo",
    criadoEm: agora, criadoPor: "Mubisys (auto)",
    atualizadoEm: agora, atualizadoPor: "Mubisys (auto)",
    cliente: "", contato: "", whatsapp: "", cnpjCpf: "", endereco: "",
    servico: "", vendedor: "", dataEntrada: "", previsaoEntrega: "",
    responsavelPCP: "", obsPCP: "", layoutFotoId: "", liberadoPCP: false, aptoPor: "", aptoEm: "",
    acesso: "", fixacao: "", ferramentas: [], suprimentos: [], itens: [],
    instalacao: { data: "", periodo: "", hora: "", duracaoDias: 1 },
    equipe: [], veiculo: "", responsavelAgenda: [], obsAgenda: "",
    confirmacao: "", confCanal: "", confHora: "", confPor: "", confObs: "",
    confAcompanha: "", confAcompanhaContato: "",
    embarqueConferidoPor: "", produtosConferidosPor: "",
    ferramentasConferidas: false, ferramentasConferidasPor: "",
    carroLiberado: false, carroLiberadoPor: "", carroLiberadoEm: "",
    horaSaida: "", horaRetorno: "", kmSaida: "", kmRetorno: "", instalacaoOK: false, conferidoPor: "",
    retrabalho: false, problema: "", causa: "", resolvidoPor: "", dataResolvido: "",
    obsTecnicas: "", fotosCheckinIds: [], fotosRetornoIds: [], checkinGPS: null,
    checkout: { situacao: "", hora: "", por: "", obs: "", confirmado: false },
    finalizadaEm: "", finalizadoPor: "",
  };
  for (const k of ["numero", "servico", "vendedor", "dataEntrada", "previsaoEntrega", "cliente", "contato", "whatsapp", "cnpjCpf", "endereco"]) {
    if (remoto[k]) os[k] = remoto[k];
  }
  if (remoto.tipo === "interno" || remoto.tipo === "externo") os.tipo = remoto.tipo;
  if (remoto.observacao) os.obsPCP = remoto.observacao;
  if (remoto.instalacao) os.instalacao = Object.assign(os.instalacao, remoto.instalacao);
  if (Array.isArray(remoto.itens) && remoto.itens.length) os.itens = remoto.itens;
  os.origemMubisys = true;
  return os;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function janelaDatas(body: any) {
  if (body.datainicial && body.datafinal) return { datainicial: body.datainicial, datafinal: body.datafinal };
  const hoje = new Date();
  const ini = new Date(hoje); ini.setDate(ini.getDate() - 180);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 180);
  return { datainicial: ymd(ini), datafinal: ymd(fim) };
}

// ---------------------------------------------------------------- handler


// Confere o cracha da pessoa: assinatura (HS256 com o EQUIPE_JWT_SECRET),
// validade e de QUAL sistema ele e -- cracha de outro sistema nao abre este.
const JWT_SECRET_EQUIPE = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";
async function lerCracha(token: string): Promise<any | null> {
  if (!JWT_SECRET_EQUIPE || !token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey(
      "raw", enc.encode(JWT_SECRET_EQUIPE), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const b64url = (t: string) => {
      t = t.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      const bin = atob(t);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    const ok = await crypto.subtle.verify(
      "HMAC", chave, b64url(partes[2]), enc.encode(`${partes[0]}.${partes[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
    if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
    if (p.sis !== "pcp") return null;
    return p;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- revogacao
// GEMEA da funcao de mesmo nome no pcp-sync — as duas precisam existir, senao
// "desativar a conta" fecharia so metade da casa: a pessoa desligada perderia
// as O.S mas continuaria consultando o ERP por aqui ate o cracha expirar (30
// dias). A REGRA EM SI nao mora mais aqui: as duas chamam
// `public.acesso_revogado`, no banco. Ate 18/08/2026 cada uma tinha a sua copia,
// e o aviso que ficava nesta linha ("se mudar a regra la, mude aqui") foi
// desobedecido no mesmo dia em que a regra mudou. So recusa com PROVA, e erro de
// banco
// ou ausencia de linha ACEITAM.
const CACHE_REVOG = new Map<string, { ate: number; revogado: boolean }>();
const CACHE_REVOG_MS = 60_000;
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
    /* A REGRA MORA NO BANCO -- e esta funcao e a prova de por que.
       O comentario acima dizia "Se mudar a regra la, mude aqui". Em 17/08/2026 a
       regra mudou no pcp-sync e ninguem mudou aqui: por horas o PCP fechava as
       O.S. para quem foi desligado e continuava servindo o ERP pela porta gemea,
       ate o cracha de 30 dias vencer. Um aviso em comentario nao e mecanismo.
       Agora as duas perguntam a mesma `public.acesso_revogado`, junto com as
       outras onze portas de dados: uma mudanca, doze portas. */
    const { data, error } = await sb.rpc("acesso_revogado", {
      p_sistema: "pcp", p_sub: sub, p_papel: papel,
    });
    if (error) throw new Error(error.message);
    revogado = data === true;
  } catch (e) {
    // Banco fora do ar ACEITA e nao guarda no cache.
    console.error("[pcp-mubisys] revogacao indisponivel:", (e as Error).message);
    return false;
  }
  CACHE_REVOG.set(chave, { ate: agora + CACHE_REVOG_MS, revogado });
  return revogado;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return resp({ error: "JSON inválido" }, 400); }

  /* DUAS FORMAS DE ENTRAR, como no pcp-sync.
     Antes so o x-token valia -- e ele vinha do config.js, que era publico. Ao
     tirar o segredo do bundle (o app passou a mandar so o cracha), esta porta
     ficou fechada para as PESSOAS: a busca de O.S. respondia 401 para todo
     mundo. O x-token continua, agora so para maquina. */
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const cracha = m ? await lerCracha(m[1]) : null;
  const token = req.headers.get("x-token") ?? body.token;
  const ehMaquina = !!TOKEN && token === TOKEN;
  const action = body.action as string;
  const ehCron = !!CRON_TOKEN && token === CRON_TOKEN && (action === "importar" || action === "baixaAuto");
  if (!cracha && !ehMaquina && !ehCron) return resp({ error: "Entre no sistema.", semSessao: true }, 401);

  // Conta desativada depois do cracha emitido (ver crachaRevogado, acima).
  if (cracha && !ehMaquina && (await crachaRevogado(cracha))) {
    return resp({ error: "Seu acesso ao PCP foi encerrado. Fale com a gestão.", semSessao: true }, 401);
  }

  // Configurar o ERP (chave da API) é coisa de ADMIN. Antes qualquer crachá
  // válido salvava credencial ou lia a publicKey/token mascarado do Mubisys.
  if (cracha && !ehMaquina && (action === "salvarConfig" || action === "statusConfig")
      && String(cracha.papel ?? "") !== "admin") {
    return resp({ error: "Só o administrador configura a integração." }, 403);
  }

  try {
    if (action === "salvarConfig") {
      const atual = (await getMeta("mubisys")) ?? {};
      if (body.base && String(body.base).trim() && !baseConfiavel(String(body.base).trim().replace(/\/+$/, ""))) {
        return resp({ error: "Endereço do Mubisys não permitido. Use o endereço oficial (…mubisys.com)." }, 400);
      }
      await setMeta("mubisys", {
        publicKey: (body.publicKey != null ? String(body.publicKey).trim() : atual.publicKey) || "",
        // Token vazio mantem o atual (permite editar so a publicKey).
        accessToken: (body.accessToken ? String(body.accessToken).trim() : atual.accessToken) || "",
        base: (body.base ? String(body.base).trim() : atual.base) || "",
        status: body.status || atual.status || "PRODUCAO",
      });
      return resp({ ok: true });
    }

    if (action === "statusConfig") {
      const c = await getCreds();
      const t = c.accessToken || "";
      return resp({
        configurado: !!(c.publicKey && c.accessToken),
        publicKey: c.publicKey, base: c.base, status: c.status,
        tokenMascarado: t ? "•".repeat(Math.max(0, t.length - 4)) + t.slice(-4) : "",
      });
    }

    const creds = await getCreds();
    if (!creds.publicKey || !creds.accessToken) {
      return resp({ error: "Credenciais do Mubisys não cadastradas. Vá em Painel de Controle → Integração Mubisys." }, 400);
    }
    const headers = { "Access-Token": creds.accessToken, Accept: "application/json" };
    const { datainicial, datafinal } = janelaDatas(body);
    const q = new URLSearchParams({
      status: body.status || creds.status,
      filtrodata: body.filtrodata || "CADASTRO",
      datainicial, datafinal,
    });
    const urlOS = `${creds.base}/${creds.publicKey}/ordem-servico?${q}`;

    if (action === "ping") {
      const r = await fetch(urlOS, { headers });
      return resp({ ok: r.ok, http: r.status });
    }

    if (action === "preview") {
      const r = await fetch(urlOS, { headers });
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      const lista = extrairLista(data);
      return resp({ total: lista.length, periodo: { datainicial, datafinal }, amostra: lista.slice(0, 2) });
    }

    if (action === "listarOS") {
      const r = await fetch(urlOS, { headers });
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      const lista = extrairLista(data);
      return resp({ os: lista.map(mapearOS), total: lista.length });
    }

    if (action === "getOS") {
      if (!body.numero) return resp({ error: "numero ausente" }, 400);
      const r = await fetch(`${creds.base}/${creds.publicKey}/ordem-servico/numero/${encodeURIComponent(body.numero)}`, { headers });
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      return resp({ os: mapearOS(extrairUm(data)) });
    }

    // ---- baixaAuto: da baixa no que o ERP ja fechou ----
    // Sem "simular: false" explicito ela so CONTA, nunca escreve: conferir a
    // lista antes de mexer em 300 cards e o minimo.
    if (action === "baixaAuto") {
      if (cracha && !ehMaquina && !ehCron && String(cracha.papel ?? "") !== "admin" && body.simular === false) {
        return resp({ error: "Só o administrador dá baixa em lote." }, 403);
      }
      const res = await baixaAutomatica(sb, creds.base, creds.publicKey, headers, {
        simular: body.simular !== false,
        forcar: body.forcar === true,
      });
      return resp(res);
    }

    // ---- importar: o que o pg_cron chama de hora em hora ----
    //
    // A FAXINA DE DUPLICATAS FOI APOSENTADA de proposito. Ela existia porque o
    // Blobs nao conseguia impedir duas O.S com o mesmo numero (o agendador do
    // Netlify as vezes disparava execucoes em paralelo, e cada uma criava a sua
    // copia). O indice unico pcp_os_numero_idx torna isso impossivel: a segunda
    // gravacao e recusada pelo banco. Sem a faxina, some tambem a varredura
    // completa que rodava de hora em hora so para procurar repetidos.
    if (action === "importar") {
      try {
        const r = await fetch(urlOS, { headers });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`Mubisys retornou HTTP ${r.status}`);
        const remotas = extrairLista(data).map(mapearOS);

        // TUDO NUMA GRAVACAO SO. Uma linha por vez estourava o teto de 150s da
        // Edge Function: ~123 O.S vindas do ERP viravam 123 idas e voltas ao
        // banco, somadas a uma API do Mubisys que ja e lenta por natureza.
        let semNumero = 0;
        const linhas = [];
        for (const remoto of remotas) {
          const num = String(remoto.numero ?? "").trim();
          if (!num) { semNumero++; continue; } // sem numero nao da para deduplicar
          const os = montarOSImportada(remoto);
          os.id = "mub-" + num; // id deterministico: gravar duas vezes e inocuo
          linhas.push({ colecao: "os", id: os.id, registro: os });
        }
        if (semNumero) console.warn(`[pcp-mubisys] ${semNumero} O.S sem numero ignoradas.`);

        // Filtra por NUMERO antes de inserir, em vez de confiar no ON CONFLICT.
        //
        // Por que: o "ignoreDuplicates" do cliente vira ON CONFLICT (colecao,id)
        // DO NOTHING -- cobre so a chave primaria. Mas existe O.S antiga gravada
        // com id aleatorio e o MESMO numero que o ERP devolve; ao inserir com o
        // id novo (mub-<numero>), o choque acontece no indice do NUMERO, que o
        // ON CONFLICT nao estava cobrindo, e o lote inteiro morria.
        //
        // Conferir antes e mais barato e mais explicito: uma consulta, e so
        // entra o que realmente falta. O indice continua como rede de seguranca
        // contra duas execucoes simultaneas.
        // NAO FILTRE `apagado` AQUI. E de proposito: a O.S excluida no app vira
        // LAPIDE (pcp-sync marca apagado=true em vez de remover a linha), e e
        // esta consulta que a enxerga e barra a reinsercao. Com o filtro, o
        // pedido cancelado que segue PRODUCAO no ERP voltaria como esqueleto
        // zerado na hora seguinte -- excluir de novo so compraria mais 60 min,
        // toda hora, por meses.
        const numeros = linhas.map((l) => l.registro.numero);
        const { data: jaTem, error: erroLeitura } = await sb
          .from("pcp_registros")
          .select("registro->>numero")
          .eq("colecao", "os")
          .in("registro->>numero", numeros);
        if (erroLeitura) throw new Error(erroLeitura.message);
        const existentes = new Set((jaTem ?? []).map((r: any) => String(r.numero)));

        // O.S que ja existe NAO e sobrescrita -- pode ter trabalho humano em
        // cima (fotos de check-in, equipe montada, conferencia do carro).
        // Dedup por id DENTRO do lote (dois números iguais no mesmo payload do
        // ERP viram o mesmo mub-<n> e o insert multi-linha morreria inteiro).
        const porId = new Map<string, any>();
        for (const l of linhas.filter((l) => !existentes.has(String(l.registro.numero)))) porId.set(l.id, l);
        const novasLinhas = [...porId.values()];
        if (novasLinhas.length) {
          // upsert ignoreDuplicates: se o cron do minuto :20 correr junto com o
          // botão "Importar agora", a colisão de chave NÃO derruba o lote todo.
          const { error } = await sb.from("pcp_registros")
            .upsert(novasLinhas, { onConflict: "colecao,id", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        }
        const novas = novasLinhas.length;
        const jaExistiam = linhas.length - novas;

        // Depois de trazer as novas, tira da mesa as que o ERP ja fechou. Se
        // esta parte falhar, a importacao continua valendo -- sao dois
        // trabalhos independentes, e perder a baixa nao pode derrubar a
        // entrada de O.S nova.
        let baixa: any = null;
        try {
          baixa = await baixaAutomatica(sb, creds.base, creds.publicKey, headers, { simular: false });
        } catch (e) {
          baixa = { ok: false, erro: String((e as Error)?.message || e) };
        }

        const st = { em: new Date().toISOString(), ok: true, novas, total: remotas.length, jaExistiam, duplicatasRemovidas: 0, baixa };
        await setMeta("sync_status", st);
        console.log(`[pcp-mubisys] ${novas} nova(s) de ${remotas.length}.`);
        return resp(st);
      } catch (e) {
        // Registra a falha: o painel de saude do app precisa denunciar que a
        // importacao parou, senao ela morre em silencio.
        await setMeta("sync_status", {
          em: new Date().toISOString(), ok: false, erro: (e as Error)?.message ?? String(e),
        }).catch(() => {});
        throw e;
      }
    }

    return resp({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error("[pcp-mubisys] erro:", e);
    return resp({ error: (e as Error)?.message ?? "Erro interno" }, 500);
  }
});
