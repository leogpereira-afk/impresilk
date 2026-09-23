import { atualizarOrigemERP, atualizarSituacaoERP, temTrabalhoHumano } from "../_shared/pcp-integridade.mjs";
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

/* ── A MENSAGEM DE ERRO NAO PODE CARREGAR A CHAVE ─────────────────────────
   A rota do Mubisys leva a chave publica no CAMINHO:

     https://api.mubisys.com/api/<CHAVE>/ordem-servico?status=PRODUCAO&...

   Quando o ERP cai, o erro do Deno cita a URL INTEIRA ("error sending request
   for url (...)"). Essa mensagem era gravada crua em  e o app
   mostrava no aviso vermelho embaixo das abas -- visto em 14/09/2026, com a
   chave legivel para qualquer pessoa que abrisse o PCP. O aviso e util; a
   chave dentro dele nao.

   Duas redes de seguranca, porque uma so falha calada:
   1. o VALOR da chave, quando ja resolvemos as credenciais -- e o corte exato;
   2. a FORMA da URL (o segmento logo depois de /api/), que pega tambem o caso
      de a chave ter mudado, ou de o erro nascer antes do getCreds.
   O resto da mensagem fica inteiro: qual rota, qual erro, qual codigo. */
let CHAVE_CONHECIDA = "";
export function semCredencial(texto: unknown): string {
  let t = String(texto ?? "");
  if (CHAVE_CONHECIDA.length >= 8) t = t.split(CHAVE_CONHECIDA).join("<chave>");
  return t
    .replace(/(https?:\/\/[^/\s)]+\/api\/)[^/\s?)]+/gi, "$1<chave>")
    .replace(/([?&](?:apikey|api_key|token|access[-_]?token)=)[^&\s)]+/gi, "$1<oculto>");
}

async function getCreds() {
  const cfg = (await getMeta("mubisys")) ?? {};
  const bruta = String(cfg.base || Deno.env.get("MUBI_BASE_URL") || DEFAULT_BASE).replace(/\/+$/, "");
  const base = baseConfiavel(bruta) ? bruta : DEFAULT_BASE;
  if (base !== bruta) console.warn("[pcp-mubisys] base recusada:", bruta);
  const chave = cfg.publicKey || Deno.env.get("MUBI_PUBLIC_KEY") || "";
  CHAVE_CONHECIDA = String(chave);
  return {
    publicKey: chave,
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
    // Valor cobrado: bruto menos desconto (a regra do Painel, conferida em
    // 200 O.S). Fica no card so como RESERVA para O.S que o Painel ainda nao
    // carregou; a tela prefere sempre painel_ordens (acao 'valores').
    dataEntrega: entregaIso || "",
    // data_entrega e a PREVISAO combinada; data_entregue e quando saiu de fato.
    // E por data_entregue que o ERP filtra ENTREGA -- e e ela que vale para
    // "entregue no mes". Confundir as duas derrubou janeiro de 165 para 135.
    dataEntregue: isoData(pick(o, "data_entregue", "dataEntregue")) || "",
    valorTotal: (() => {
      const entrada = pick(o, "valor_total", "valorTotal", "total");
      if (entrada == null || String(entrada).trim() === "") return null;
      const bruto = Number(String(entrada).replace(",", "."));
      const desc = Number(String(pick(o, "valor_desconto", "valorDesconto", "desconto") ?? "0").replace(",", "."));
      return Number.isFinite(bruto) ? Math.max(0, bruto - (Number.isFinite(desc) ? desc : 0)) : null;
    })(),
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

/* O ERP PODE NAO RESPONDER -- E QUANDO ISSO ACONTECE ELE NAO DIZ NADA.
   Em 14/09/2026 o Mubisys parou de responder ao PCP e TODA chamada ficou
   pendurada ate a Edge Function ser morta pela plataforma aos 150s
   (IDLE_TIMEOUT). Como a morte vem de fora, o `catch` que grava
   `sync_status: {ok:false}` NUNCA rodava: a importacao morria calada, e a
   unica pista era o heartbeat velho. Cinco horas se passaram sem ninguem
   saber por que.

   Com prazo proprio, a chamada falha ANTES da plataforma, o catch roda, e o
   app passa a dizer "o ERP nao respondeu" em vez de "ha 5h sem rodar". */
/* AS REGRAS DO MUBISYS QUE O PAINEL JA SABIA E O PCP NAO.
   Fonte: painel/netlify/functions/lib/mubi.js, o cliente que carrega o Painel
   ha meses sem cair -- e a trava de regressao painel/scripts/conferir-404.mjs.

   1. **404 NAO E ERRO**: quer dizer "nenhum registro neste filtro". Medido em
      31/07/2026: `contas-pagar?status=VENCIDO` na janela de -30 dias devolve
      404, e a MESMA consulta desde 2015 devolve 201 com 9 titulos.
   2. **O ERP PISCA 404 em recurso valido.** Por isso vazio so vale quando DOIS
      404 CONCORDAM e o ultimo que se ouviu foi 404. Um 404 sozinho virando
      "lista vazia" ja apagou o vinculo de vendedor do Painel inteiro, gravado
      como sucesso.
   3. **401 = credencial errada, 403 = plano sem MubiPro**: fatais, nao adianta
      repetir.
   4. **5xx e timeout NUNCA viram vazio** -- vazio apaga, erro preserva. Entre
      errar para o lado de nao atualizar e para o lado de zerar, o primeiro.

   O que muda aqui em relacao ao Painel: la cada tentativa espera ate 280s
   (uma pagina de 500 itens ja foi medida em 206s no horario comercial) porque
   ele roda no GitHub Actions. Esta funcao morre aos 150s, entao as tentativas
   cabem dentro do prazo que o chamador der -- e quando nao cabem, falha
   dizendo isso, em vez de morrer calada. */
/* A LINHA DE UMA O.S ENTREGUE, num lugar so.
 *
 * Este pacote e montado em DOIS pontos -- a acao `entreguesMes` (quando a tela
 * pede um mes) e o robo horario dentro de `importar` (que renova o mes
 * corrente). Eles nasceram iguais e foi so questao de tempo: ao acrescentar
 * `previsao` para o SLA da tela de Entregas, o primeiro passou a gravar v3 com
 * o prazo e o segundo continuou gravando v2 sem ele -- e como o robo roda a
 * cada hora, ele APAGARIA o prazo do mes corrente logo depois de a tela
 * grava-lo. O campo simplesmente nunca existiria justamente no mes que mais se
 * olha. Mesmo dado, duas portas, reguas diferentes: agora e uma funcao so.
 *
 * `previsao` e o prazo COMBINADO (data_entrega) e `data` e a saida REAL
 * (data_entregue): dois campos distintos do mesmo registro do ERP.
 */
function linhaEntregue(o: any) {
  return {
    numero: o.numero, cliente: o.cliente || "", servico: o.servico || "", tipo: o.tipo,
    data: o.dataEntregue || "", valor: o.valorTotal, previsao: o.previsaoEntrega || "",
  };
}

/* A VERSAO DO PACOTE DE ENTREGUES. v2 = `data` e a entrega real; v3 = cada O.S
   leva tambem `previsao`. Quem le aceita v2 OU v3 (piso, nunca igualdade), para
   um campo novo nao derrubar o app de quem ainda nao recarregou a aba. */
const ENTREGUES_V = 3;

/* QUE MES E HOJE -- NO FUSO DA EMPRESA, nao em UTC.
   `new Date().toISOString()` vira o mes as 21h de Brasilia. Nas ultimas tres
   horas do mes o servidor ja considerava o mes SEGUINTE como corrente: o mes
   que estava fechando caia na regua de "mes fechado" (parava de atualizar
   justamente na noite em que o numero mais importa) e o robo horario passava a
   renovar um mes que ainda nao comecou. A casa opera em America/Sao_Paulo
   (UTC-3, sem horario de verao desde 2019). */
const mesLocal = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

/* Quantos meses de distancia do mes corrente. 0 = este mes, 1 = o passado. */
function distanciaMeses(mes: string, hoje: string): number {
  const [y1, m1] = mes.split("-").map(Number);
  const [y2, m2] = hoje.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/* QUANTO TEMPO O PACOTE DE UM MES VALE NO SERVIDOR.
 *
 * Era binario -- 1 h para o mes corrente, 24 h para TODO o resto -- e por isso
 * a tela voltava a dizer "carregando 7 de 9 meses" quase todo dia: medido no
 * banco em 15/09/2026, oito dos nove meses de 2026 estavam vencidos ao mesmo
 * tempo, remontados 31 h antes. Cada mes vencido custa uma varredura de 25-40 s
 * no ERP, tres por vez: o dono esperava minutos por um numero que o sistema ja
 * tinha inteiro em disco.
 *
 * Marco de 2026 nao muda mais. O que de fato muda num mes encerrado e
 * lancamento retroativo e estorno, e isso acontece na virada, nao meio ano
 * depois. Entao a validade passa a seguir a IDADE do mes.
 *
 * DUAS TRAVAS, as duas necessarias:
 * 1. Pacote em versao ANTIGA nunca ganha validade longa (teto de 24 h). Sem
 *    isso, subir a versao do pacote -- foi o que aconteceu com `previsao`, a
 *    regua do SLA -- congelaria o campo novo por meio ano nos meses velhos,
 *    justamente os de pior cobertura. Cada mes se reconstroi UMA vez ao subir a
 *    versao e so entao dorme.
 * 2. A validade do servidor tem de ser ESTRITAMENTE mais longa que a do cliente
 *    (store.js: 30 dias para mes antigo). Se as duas vencessem juntas, o
 *    cliente repergunta e encontra o servidor igualmente vencido -- e paga a
 *    varredura mensalmente. Por isso 180 dias no fim da escada.
 */
function validadeEntregues(mes: string, versao: number): number {
  const d = distanciaMeses(mes, mesLocal());
  if (Number(versao) < ENTREGUES_V) return 24 * 3600_000;   // remonta uma vez para virar v3
  if (d <= 0) return 60 * 60_000;        // mes corrente: 1 h
  if (d === 1) return 12 * 3600_000;     // mes passado: ainda recebe lancamento
  if (d <= 3) return 7 * 864e5;          // trimestre recente: 7 dias
  return 180 * 864e5;                    // historia: so por pedido explicito
}

/* VARRE UM MES NO ERP e devolve as linhas prontas do pacote.
 *
 * Existe para haver UM lugar so que monta isto. Ja houve dois -- a acao
 * `entreguesMes` e o robo horario dentro de `importar` -- e eles divergiram no
 * primeiro campo novo (`previsao`): o robo, que roda a cada hora, apagava o
 * campo que a tela acabara de gravar, calado. Agora um terceiro chamador (o
 * aquecimento de mes vencido) entra sem repetir nada.
 *
 * `datafinal` e o 1o dia do mes SEGUINTE porque o ERP corta na meia-noite, e
 * pedir 31/08 perdia o dia 31; por isso a filtragem por `dataEntregue` depois.
 */
async function varrerMesEntregues(
  mes: string, base: string, publicKey: string, headers: any,
  opts: { prazoMs?: number; sobra?: () => number } = {},
) {
  const [y, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const lista: any[] = [];
  for (let page = 1; page <= 10; page++) {
    if (opts.sobra && opts.sobra() < 12_000) break;
    const q = new URLSearchParams({
      status: "ENTREGUE", filtrodata: "ENTREGA",
      datainicial: `${mes}-01`, datafinal: fim, page: String(page), per_page: "500",
    });
    const prazo = opts.sobra
      ? Math.min(40_000, Math.max(12_000, opts.sobra() - 10_000))
      : (opts.prazoMs ?? 45_000);
    const data = await erpGet(`${base}/${publicKey}/ordem-servico?${q}`, headers, prazo);
    const pag = extrairLista(data);
    lista.push(...pag);
    if (pag.length < 500) break;
  }
  const vistos = new Set<string>();
  return lista.map(mapearOS).filter((o: any) => o.numero).filter((o: any) => {
    if (o.dataEntregue && !String(o.dataEntregue).startsWith(mes)) return false;
    if (vistos.has(String(o.numero))) return false;
    vistos.add(String(o.numero)); return true;
  }).map(linhaEntregue);
}

/* O pacote gravado, sempre com a mesma forma e a mesma versao. */
const pacoteEntregues = (mes: string, os: any[]) =>
  ({ v: ENTREGUES_V, em: new Date().toISOString(), mes, total: os.length, os });

async function erpGet(url: string, headers: any, prazoTotalMs: number): Promise<any> {
  const ate = Date.now() + Math.max(8000, prazoTotalMs);
  const ESPERA = 1500;
  let n404 = 0, ultimoFoi404 = false, ultimoFoiRede = false, ultimoErro: Error | null = null;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const sobra = ate - Date.now();
    if (sobra < 6000) break;
    try {
      const r = await fetchERP(url, headers, Math.min(sobra - 2000, 60000));
      if (r.status === 401) throw Object.assign(new Error("o Mubisys recusou a credencial (401)"), { fatal: true });
      if (r.status === 403) throw Object.assign(new Error("o Mubisys recusou (403): o plano precisa do pacote MubiPro"), { fatal: true });
      if (r.status === 404) {
        n404 += 1; ultimoFoi404 = true; ultimoFoiRede = false;
        if (n404 >= 2) return { data: [] };          // dois 404 concordando = vazio de verdade
        ultimoErro = new Error("o Mubisys devolveu 404 uma vez (pode ser piscada)");
        await new Promise((r2) => setTimeout(r2, ESPERA * tentativa));
        continue;
      }
      if (!r.ok) throw Object.assign(new Error(`o Mubisys respondeu HTTP ${r.status}`), { httpStatus: r.status });
      return await r.json();
    } catch (e) {
      if ((e as any)?.fatal) throw e;
      ultimoFoi404 = false;
      ultimoFoiRede = !(e as any)?.httpStatus;      // timeout/rede: nunca vira vazio
      ultimoErro = e as Error;
      if (tentativa < 4 && ate - Date.now() > 6000) await new Promise((r2) => setTimeout(r2, ESPERA * tentativa));
    }
  }
  // Vazio so no caso que a regra promete. 5xx e estouro de prazo explodem, para
  // a importacao falhar e o que ja esta gravado ser preservado.
  if (n404 >= 2 && (ultimoFoi404 || ultimoFoiRede)) return { data: [] };
  throw ultimoErro || new Error("o Mubisys não respondeu dentro do prazo");
}

async function fetchERP(url: string, headers: any, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const limite = Math.max(5000, ms);
  const t = setTimeout(() => ctrl.abort(), limite);
  try {
    return await fetch(url, { headers, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(`o ERP (Mubisys) nao respondeu em ${Math.round(limite / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function baixaAutomatica(sb: any, base: string, publicKey: string, headers: any, opts: any = {}) {
  const simular = opts.simular !== false ? opts.simular === true : false;
  /* A JANELA E DO TAMANHO DO QUE ESTA ABERTO, nao de 545 dias. Pedir status
     TODOS de um ano e meio era a consulta mais pesada do sistema, toda hora.
     So interessa o que o PCP tem aberto: a mais antiga hoje e de fevereiro. */
  const hoje = new Date();
  const { data: abertasNoPcp } = await sb.from("pcp_registros")
    .select("registro->>dataEntrada, registro->>criadoEm")
    .eq("colecao", "os").eq("apagado", false).or("registro->>finalizadaEm.is.null,registro->>finalizadaEm.eq.");
  let maisAntiga = "";
  for (const r of (abertasNoPcp ?? []) as any[]) {
    const d = String(r.dataEntrada || r.criadoEm || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!maisAntiga || d < maisAntiga)) maisAntiga = d;
  }
  const ini = maisAntiga ? new Date(maisAntiga + "T12:00:00Z") : new Date(hoje);
  ini.setDate(ini.getDate() - (maisAntiga ? 7 : 365));   // margem de uma semana
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 1);
  const q = new URLSearchParams({
    status: "TODOS",
    filtrodata: "CADASTRO",
    datainicial: ini.toISOString().slice(0, 10),
    datafinal: fim.toISOString().slice(0, 10),
  });
  const data = await erpGet(`${base}/${publicKey}/ordem-servico?${q}`, headers, opts.prazoMs || 60000);
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
  const divergencias: any[] = [];
  let agendadas = 0;
  for (const l of abertas) {
    const num = String(l.registro?.numero || "").trim();
    if (!num) continue;
    const st = statusPorNumero.get(num);
    if (st === undefined) { semNoticia++; divergencias.push({id:l.id, numero:num, motivo:"Sem retorno do ERP nesta consulta"}); continue; }  // o ERP nao falou dela: nao mexe
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
    divergencias,
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
  if (remoto.valorTotal != null) os.valorTotal = remoto.valorTotal;
  if (remoto.tipo === "interno" || remoto.tipo === "externo") os.tipo = remoto.tipo;
  if (remoto.observacao) os.obsPCP = remoto.observacao;
  if (remoto.instalacao) os.instalacao = Object.assign(os.instalacao, remoto.instalacao);
  if (Array.isArray(remoto.itens) && remoto.itens.length) os.itens = remoto.itens;
  os.origemMubisys = true;
  const sit = atualizarSituacaoERP(os, remoto.statusCarteira || remoto.statusERP, agora);
  if (sit) { os.statusERP = sit.statusERP; os.statusERPDesde = sit.statusERPDesde; }
  return os;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function janelaDatas(body: any) {
  if (body.datainicial && body.datafinal) return { datainicial: body.datainicial, datafinal: body.datafinal };
  const hoje = new Date();
  /* DOIS ANOS, NAO 180 DIAS -- e o numero saiu de medicao, nao de palpite.
     A busca e por data de CADASTRO: O.S que o ERP mantem em PRODUCAO e que foi
     cadastrada antes da janela nunca e trazida, e some da conta sem erro
     nenhum. Em 14/09/2026 o dono viu 148 no Mubi contra 138 no PCP e apontou
     que ha pedido em aberto com mais de 180 dias.

     A sonda (painel-impresilk, scripts/sondar-mubi.mjs) rodou a MESMA consulta
     em quatro larguras:

       180 dias  108     <- o que se buscava
       1 ano     114     (+6)
       2 anos    116     (+2)
       5 anos    116     (+0)   <- nao existe nada alem disso

     Ou seja: a janela antiga escondia OITO O.S em producao, e dois anos pega
     todas. Cinco anos nao acrescenta nada e so pesa.

     Tirar a janela nao e opcao: sem `datainicial`/`datafinal` o ERP responde
     422. Por isso alargar, e alargar ate onde a medicao mostrou fundo. */
  const ini = new Date(hoje); ini.setDate(ini.getDate() - 730);
  // O filtro e por data de CADASTRO, que nunca esta no futuro: 180 dias a
  // frente era peso puro no ERP. +1 porque ele corta na meia-noite.
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 1);
  return { datainicial: ymd(ini), datafinal: ymd(fim) };
}

/* GRAVACAO DAS O.S IMPORTADAS -- usada por DOIS caminhos.
   `importar` busca no ERP aqui dentro (e morre aos 150s quando o Mubisys
   esta lento). `importarLote` recebe a lista JA BUSCADA pelo GitHub Actions,
   que tem 900s de teto. A logica de deduplicacao, lapide e preservacao de
   trabalho humano e a MESMA nos dois -- ela mora aqui, e nao duplicada. */
async function gravarImportadas(sb: any, remotas: any[]) {
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
        .select("id, registro, apagado, atualizado_em")
        .eq("colecao", "os")
        .in("registro->>numero", numeros);
      if (erroLeitura) throw new Error(erroLeitura.message);
      const existentes = new Set((jaTem ?? []).map((r: any) => String(r.registro?.numero)));

      // Só campos da origem; alteração concorrente na oficina ganha e será
      // reconciliada na próxima importação. Lápides e conclusões são preservadas.
      const porNumeroERP = new Map(remotas.map(r => [String(r.numero ?? '').trim(), r]));
      let atualizadas = 0, conflitosAtualizacao = 0;
      const em = new Date().toISOString();
      for (const linha of (jaTem ?? [])) {
        if (linha.apagado) continue;
        const remoto = porNumeroERP.get(String(linha.registro?.numero)) || {};
        const r = atualizarOrigemERP(linha.registro, remoto, em);
        // A situação do ERP anda sem somar ao rev: o pcp-sync a preserva contra a
        // cópia do aparelho, então ela não precisa (nem deve) virar conflito.
        const sit = atualizarSituacaoERP(r.registro, remoto.statusCarteira || remoto.statusERP, em);
        if (!r.alteracoes.length && !sit) continue;
        const registroNovo = sit || r.registro;
        const {data, error} = await sb.from("pcp_registros")
          .update({registro:registroNovo, atualizado_em:em})
          .eq("colecao","os").eq("id",linha.id).eq("apagado",false)
          .eq("atualizado_em",linha.atualizado_em).select("id");
        if (error) throw new Error(error.message);
        if (data?.length) atualizadas++; else conflitosAtualizacao++;
      }
      // Deduplicação de novas O.S. dentro do lote.
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
  return { novas, atualizadas, conflitosAtualizacao, jaExistiam, total: remotas.length, semNumero };
}

// Carteira do acompanhamento: concluída na produção ainda aguarda entrega.
const STATUS_CARTEIRA = ['PRODUCAO', 'PENDENTE', 'PAUSADO', 'CONCLUIDO'];
async function buscarCarteiraCompleta(base: string, publicKey: string, headers: any, fim: string) {
  const lotes = await Promise.all(STATUS_CARTEIRA.map(async status => {
    const lista: any[] = [], vistos = new Set<string>();
    for (let page = 1; page <= 20; page++) {
      const q = new URLSearchParams({status, filtrodata:'CADASTRO', datainicial:'2020-01-01', datafinal:fim, per_page:'500', page:String(page)});
      const data = await erpGet(`${base}/${publicKey}/ordem-servico?${q}`, headers, 60000);
      if (![data,data?.data,data?.items,data?.results].some(Array.isArray)) throw new Error('Formato inesperado na carteira ERP; nenhuma baixa aplicada.');
      const pag = extrairLista(data).map(mapearOS);
      if (pag.some(o => !o.numero)) throw new Error('Carteira ERP incompleta: O.S. sem número.');
      if (pag.length && pag.every(o => vistos.has(o.numero))) throw new Error('Paginação ERP repetida; carteira mantida.');
      for (const o of pag) { vistos.add(o.numero); lista.push({ ...o, statusCarteira: status }); }
      if (pag.length < 500) return lista;
    }
    throw new Error('Limite de páginas da carteira atingido; carteira mantida.');
  }));
  // Uma O.S. pode aparecer em duas situações durante uma transição no ERP.
  const unicas = new Map<string, any>();
  for (const lote of lotes) for (const o of lote) if (!unicas.has(o.numero)) unicas.set(o.numero,o);
  if (!unicas.size) throw new Error('Carteira ERP vazia: aguardando conferência, sem arquivamento automático.');
  return [...unicas.values()];
}

async function reconciliarCarteira(sb: any, remotas: any[]) {
  const em = new Date().toISOString();
  const numeros = new Set(remotas.map(o => String(o.numero)));
  if (!numeros.size || remotas.some(o => !o.numero) || numeros.size !== remotas.length) throw new Error('Carteira inválida.');
  const {data:linhas,error} = await sb.from('pcp_registros').select('id,registro,apagado,atualizado_em').eq('colecao','os');
  if (error) throw new Error(error.message);
  const abertas = (linhas || []).filter((l:any) => !l.apagado && !l.registro.finalizadaEm);
  if (abertas.length > 20 && numeros.size < abertas.length * 0.5) throw new Error('Carteira ERP caiu mais de 50%; mantida para conferência.');
  const restaurar = (linhas || []).filter((l:any) => numeros.has(String(l.registro.numero)) && (l.apagado || (l.registro.finalizadaEm && l.registro.baixaAutoERP?.em === l.registro.finalizadaEm) || (!l.registro.finalizadaEm && l.registro.erpSaiuDaCarteiraEm)));
  const fora = abertas.filter((l:any) => l.registro.origemMubisys && !numeros.has(String(l.registro.numero)));
  /* O.S COM TRABALHO DE GENTE NÃO É FECHADA PELO ERP. Ela fica aberta com a
     marca erpSaiuDaCarteiraEm, e o card pede "ERP fechou: confirmar". Sem
     trabalho humano (o esqueleto que só o ERP preencheu), segue a baixa de
     sempre. A marca só é gravada uma vez: ela diz DESDE QUANDO. */
  const arquivar = fora.filter((l:any) => !temTrabalhoHumano(l.registro));
  const marcar = fora.filter((l:any) => temTrabalhoHumano(l.registro) && !l.registro.erpSaiuDaCarteiraEm);
  // Cópia recuperável antes da primeira alteração. Não apaga execução/equipe.
  const alvos = [...restaurar,...arquivar,...marcar];
  if (alvos.length) {
    const {error:e} = await sb.from('pcp_meta').upsert({chave:`carteira-auditoria:${em}`,valor:{em,origem:'Mubisys · quatro situações',numeros:[...numeros],antes:alvos}},{onConflict:'chave'});
    if (e) throw new Error(e.message);
  }
  let restauradas=0, arquivadas=0, marcadas=0, conflitos=0;
  const marcarIds = new Set(marcar.map((l:any) => l.id));
  for (const l of alvos) {
    const volta = numeros.has(String(l.registro.numero));
    const r = {...l.registro,rev:(Number(l.registro.rev)||0)+1,atualizadoEm:em,atualizadoPor:'Mubisys · conciliação de carteira'};
    if (volta) {
      if (r.finalizadaEm && r.baixaAutoERP?.em === r.finalizadaEm) { r.finalizadaEm='';r.finalizadoPor='';delete r.baixaAutoERP;delete r.arquivadaEm; }
      delete r.erpSaiuDaCarteiraEm;
      r.erpCarteira={aberta:true,em};
    } else if (marcarIds.has(l.id)) {
      r.erpSaiuDaCarteiraEm=em;
      r.erpCarteira={aberta:false,em};
    } else {
      r.finalizadaEm=em;r.finalizadoPor='Mubisys · saiu da carteira aberta';r.arquivadaEm=em;
      r.baixaAutoERP={em,status:'FORA DA CARTEIRA ABERTA',carteira:true};
      r.erpCarteira={aberta:false,em};
    }
    const {data,error:e}=await sb.from('pcp_registros').update({registro:r,apagado:false,atualizado_em:em})
      .eq('colecao','os').eq('id',l.id).eq('atualizado_em',l.atualizado_em).select('id');
    if(e) throw new Error(e.message);
    if(!data?.length) conflitos++;else if(volta) restauradas++;else if(marcarIds.has(l.id)) marcadas++;else arquivadas++;
  }
  const importacao = await gravarImportadas(sb,remotas);
  return {...importacao,restauradas,arquivadas,marcadasParaConferir:marcadas,conflitosCarteira:conflitos,carteiraCompleta:true};
}

/* O BATIMENTO GUARDA DUAS DATAS: a da ultima TENTATIVA e a da ultima que DEU
   CERTO. Ate 14/09/2026 so havia uma -- e um dia inteiro de ERP fora apagava
   do registro a hora em que a importacao funcionou pela ultima vez. "Desde
   quando?" e a primeira pergunta de quem ve o aviso, e o painel nao tinha
   como responder. Falha carrega o ultimo sucesso para a frente; sucesso o
   renova. TODA gravacao de sync_status passa por aqui. */
async function gravarBatimento(novo: any) {
  const anterior = (await getMeta("sync_status")) ?? {};
  const ultimoSucesso = novo.ok === false
    ? (anterior.ultimoSucesso
        ?? (anterior.ok !== false && anterior.em ? { em: anterior.em, novas: anterior.novas ?? 0 } : undefined))
    : { em: novo.em, novas: novo.novas ?? 0 };
  const st = ultimoSucesso ? { ...novo, ultimoSucesso } : novo;
  await setMeta("sync_status", st);   // a ÚNICA escrita direta; o resto passa por aqui
  return st;
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
  const ehCron = !!CRON_TOKEN && token === CRON_TOKEN && (action === "importar" || action === "baixaAuto" || action === "entreguesMes" || action === "pingERP" || action === "importarLote");
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

    /* SONDA DO ERP: um dia so, prazo curto, e diz o que aconteceu.
       Quando o Mubisys para de responder, toda acao do PCP trava e a unica
       coisa que sabemos e "nao voltou". Esta sonda pede a menor janela
       possivel com 20s de prazo e separa os tres casos que exigem providencias
       diferentes: RESPONDEU (ok), RECUSOU (credencial/permissao mudou -- HTTP
       401/403) e MUDO (nao respondeu no prazo -- ERP fora do ar ou lento). */
    if (action === "pingERP") {
      const hoje = new Date();
      const de = body.datainicial || ymd(hoje);
      const ate = body.datafinal || ymd(hoje);
      const q1 = new URLSearchParams({
        status: body.status || creds.status,
        filtrodata: body.filtrodata || "CADASTRO",
        datainicial: de,
        datafinal: ate,
      });
      if (body.per_page) { q1.set("per_page", String(body.per_page)); q1.set("page", String(body.page || 1)); }
      const inicio = Date.now();
      try {
        const r = await fetchERP(`${creds.base}/${creds.publicKey}/ordem-servico?${q1}`, headers, body.conferirNumeros === true ? 60000 : 20000);
        const corpo = await r.text().catch(() => "");
        return resp({
          estado: r.ok ? "respondeu" : "recusou",
          http: r.status,
          ms: Date.now() - inicio,
          amostra: corpo.slice(0, 200),
          janela: { datainicial: de, datafinal: ate, per_page: q1.get("per_page"), page: q1.get("page") },
          itens: (() => { try { const d = JSON.parse(corpo); return Array.isArray(d) ? d.length : (Array.isArray(d?.data) ? d.data.length : null); } catch { return null; } })(),
          // Diagnóstico somente-leitura: identifica divergências sem expor clientes ou valores.
          ordens: body.conferirNumeros === true ? (() => {
            try { return extrairLista(JSON.parse(corpo)).map(mapearOS).map(o => ({ numero: o.numero, status: o.statusERP })); }
            catch { return null; }
          })() : undefined,
          status: q1.get("status"),
        });
      } catch (e) {
        return resp({ estado: "mudo", ms: Date.now() - inicio, erro: String((e as Error)?.message || e) });
      }
    }

    if (action === "ping") {
      const r = await fetchERP(urlOS, headers, 30000);
      return resp({ ok: r.ok, http: r.status });
    }

    if (action === "preview") {
      const r = await fetchERP(urlOS, headers, 30000);
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      const lista = extrairLista(data);
      return resp({ total: lista.length, periodo: { datainicial, datafinal }, amostra: lista.slice(0, 2) });
    }

    if (action === "listarOS") {
      const r = await fetchERP(urlOS, headers, 30000);
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      const lista = extrairLista(data);
      return resp({ os: lista.map(mapearOS), total: lista.length });
    }

    if (action === "getOS") {
      if (!body.numero) return resp({ error: "numero ausente" }, 400);
      const r = await fetchERP(`${creds.base}/${creds.publicKey}/ordem-servico/numero/${encodeURIComponent(body.numero)}`, headers, 30000);
      const data = await r.json().catch(() => null);
      if (!r.ok) return resp({ error: `Mubisys retornou HTTP ${r.status}`, detalhe: data }, 502);
      return resp({ os: mapearOS(extrairUm(data)) });
    }

    // ---- entreguesMes: o que o ERP diz que foi ENTREGUE no mes, pela DATA DE ENTREGA ----
    //
    // Por que existe (14/09/2026): a tela de Entregas somava so as O.S que o
    // PCP conhece (desde junho) e pela data da BAIXA -- o robo baixou em
    // setembro coisas entregues em julho/agosto. Nem o mes nem o ano batiam
    // com o ERP. A verdade do "valor entregue" e esta consulta: status
    // ENTREGUE filtrado pela data de entrega, todas as O.S, paginado.
    //
    // O ERP leva 25-40 s por pagina, entao o mes fica em cache no pcp_meta:
    // mes corrente vale 1 h; mes fechado vale 24 h. `forcar` ignora o cache.
    // E dinheiro da casa: mesma regua da acao 'valores' (admin/pcp).
    if (action === "entreguesMes") {
      const mes = String(body.mes || "").trim();
      if (!/^\d{4}-\d{2}$/.test(mes)) return resp({ error: "mes no formato AAAA-MM" }, 400);
      if (cracha && !ehMaquina && !ehCron && !["admin", "pcp"].includes(String(cracha.papel ?? ""))) {
        return resp({ error: "Entregas do ERP só para a gestão do PCP." }, 403);
      }
      const chave = `entregues:${mes}`;
      const cache = await getMeta(chave);
      /* ACEITA v2 E v3: a v3 so acrescentou `previsao`. Exigir a versao nova
         aqui invalidaria os dez meses em cache de uma vez, e cada remontagem
         custa 25-40 s por pagina num ERP lento. O v2 serve ate vencer -- e
         `validadeEntregues` da a ele teto de 24 h justamente para que remonte
         uma vez e vire v3, em vez de congelar meio ano sem a regua do SLA. */
      const validade = validadeEntregues(mes, Number(cache?.v ?? 0));
      if (cache?.em && Number(cache?.v) >= 2 && !body.forcar && Date.now() - new Date(cache.em).getTime() < validade) {
        return resp({ ...cache, cache: true });
      }
      /* O ERP FALHANDO NAO PODE APAGAR O QUE JA ESTAVA CERTO.
         Antes, qualquer erro subia e virava 502: a tela mostrava "sem resposta
         do ERP" em branco para agosto -- um mes que nao muda mais e cujo numero
         estava guardado a um SELECT de distancia -- e o aparelho gravava uma
         lapide de erro por cima. Agora a falha devolve o pacote velho, dizendo
         que e velho e por que. Sem cache nenhum, ai sim e erro de verdade. */
      let os: any[];
      try {
        os = await varrerMesEntregues(mes, creds.base, creds.publicKey, headers, { prazoMs: 45_000 });
      } catch (e) {
        const motivo = (e as Error)?.message ?? String(e);
        if (cache?.em && Number(cache?.v) >= 2) {
          return resp({ ...cache, cache: true, velho: true, avisoErro: motivo });
        }
        throw e;
      }

      /* LISTA VAZIA (OU QUE DESABOU) NAO E VERDADE SOBRE UM MES QUE JA TINHA
         NUMERO. O ERP responde 200 com zero registro quando tropeca no filtro,
         e isso gravava "entregue no mes: R$ 0" com cara de dado fresco por cima
         de 200+ O.S corretas -- calado, e por ate 30 dias no aparelho. Zero so
         vale quando nunca houve nada. Ver a licao: zero nao e resultado. */
      const tinha = Number(cache?.total ?? 0);
      const desabou = tinha > 0 && os.length < tinha * 0.5;
      if (desabou && cache?.em && Number(cache?.v) >= 2) {
        return resp({ ...cache, cache: true, velho: true,
          avisoErro: `o ERP devolveu ${os.length} O.S para um mes que tinha ${tinha}; mantido o numero anterior` });
      }

      /* `previsao` sai do MESMO objeto ja baixado -- nenhuma chamada a mais ao
         ERP. Sem ela o SLA da tela so alcancava as O.S que o aparelho ainda
         guarda (abertas + finalizadas de 60 dias): medido no banco, a cobertura
         caia de 93% em setembro para 20% em junho e ZERO antes de maio. */
      const pacote = pacoteEntregues(mes, os);
      await setMeta(chave, pacote);
      return resp(pacote);
    }

    /* ---- entreguesMeses: varios meses de uma vez, SO do que ja esta guardado ----
     *
     * O chip de um ano pede nove a doze meses. Um a um, com teto de tres em voo,
     * isso e uma fila que so anda quando a tela repinta -- e no primeiro acesso
     * de qualquer aparelho, ou depois de sair e entrar (a saida apaga o disco
     * local), vira a espera que o dono descreveu como "subir toda vez".
     *
     * Esta acao NUNCA vai ao ERP. Ela le o pcp_meta num `.in()` so e devolve o
     * que existe, dizendo quais meses NAO tem (nunca cortar calado). Com ela a
     * tela pinta o ano inteiro num pedido, e a fila lenta de tres em tres fica
     * so para o que realmente falta. Mesma trava de papel da acao acima: e
     * dinheiro da casa.
     */
    /* ---- entreguesResumo: o mes a mes e a tendencia, sem descer as O.S ----
     *
     * Pedido do dono (15/09/2026): "aqui em baixo ter todos os meses e ao final
     * uma aba de relatorio que posso puxar de todos os anos, ver as tendencias".
     *
     * Trazer 84 meses de pacote cheio para o aparelho seriam ~2,7 MB para
     * desenhar 84 barras. Aqui o servidor agrega os MESMOS pacotes que a tela
     * ja usa -- mesma origem, mesma soma, nenhuma segunda verdade sobre
     * dinheiro -- e devolve uma linha por mes.
     *
     * O que NAO tem pacote guardado sai em `faltando`, nunca como zero: mes sem
     * dado e mes sem dado, e a tela precisa poder dizer isso. Zero calado num
     * grafico de tendencia inventa uma queda que nunca houve.
     */
    if (action === "entreguesResumo") {
      if (cracha && !ehMaquina && !ehCron && !["admin", "pcp"].includes(String(cracha.papel ?? ""))) {
        return resp({ error: "Entregas do ERP só para a gestão do PCP." }, 403);
      }
      const pedidos = Array.isArray(body.meses) ? body.meses.map((x: any) => String(x || "").trim()) : [];
      const meses = [...new Set(pedidos.filter((x: string) => /^\d{4}-\d{2}$/.test(x)))].sort();
      if (!meses.length) return resp({ error: "meses: lista de AAAA-MM" }, 400);
      const TETO = 300;
      const usar = meses.slice(0, TETO);
      const { data, error } = await sb.from("pcp_meta").select("chave, valor")
        .in("chave", usar.map((mm: string) => `entregues:${mm}`));
      if (error) throw new Error(error.message);
      const linhas: any[] = [];
      const achados = new Set<string>();
      for (const linha of data ?? []) {
        const mm = String(linha.chave).slice("entregues:".length);
        const p = linha.valor;
        if (!p || !Array.isArray(p.os) || Number(p.v) < 2) continue;
        achados.add(mm);
        let valor = 0, semValor = 0, instal = 0, retiradas = 0;
        let comPrazo = 0, noPrazo = 0, somaAtraso = 0, atrasadas = 0;
        for (const o of p.os) {
          const v = Number(o?.valor);
          if (Number.isFinite(v) && o?.valor !== null) valor += v; else semValor++;
          if (o?.tipo === "interno") retiradas++; else instal++;
          /* O PRAZO VEM JUNTO porque a pergunta "como estamos indo" e a mesma:
             faturou quanto E entregou no prazo. So conta o que tem regua. */
          const prev = String(o?.previsao || "").slice(0, 10);
          const ent = String(o?.data || "").slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(prev) && /^\d{4}-\d{2}-\d{2}$/.test(ent)) {
            comPrazo++;
            const d = Math.round((Date.parse(ent + "T12:00:00Z") - Date.parse(prev + "T12:00:00Z")) / 86400000);
            if (d <= 0) noPrazo++; else { atrasadas++; somaAtraso += d; }
          }
        }
        linhas.push({
          mes: mm, valor: Math.round(valor * 100) / 100, os: p.os.length,
          instalacoes: instal, retiradas, semValor,
          comPrazo, noPrazo, atrasadas,
          mediaAtraso: atrasadas ? Math.round(somaAtraso / atrasadas * 10) / 10 : null,
          em: p.em, v: p.v,
        });
      }
      linhas.sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
      return resp({
        meses: linhas,
        faltando: usar.filter((mm: string) => !achados.has(mm)),
        ...(meses.length > usar.length ? { cortados: meses.length - usar.length } : {}),
      });
    }

    if (action === "entreguesMeses") {
      if (cracha && !ehMaquina && !ehCron && !["admin", "pcp"].includes(String(cracha.papel ?? ""))) {
        return resp({ error: "Entregas do ERP só para a gestão do PCP." }, 403);
      }
      const pedidos = Array.isArray(body.meses) ? body.meses.map((x: any) => String(x || "").trim()) : [];
      const meses = [...new Set(pedidos.filter((x: string) => /^\d{4}-\d{2}$/.test(x)))];
      if (!meses.length) return resp({ error: "meses: lista de AAAA-MM" }, 400);
      /* TETO DECLARADO, nunca corte mudo: 300 meses sao 25 anos, mais do que a
         tela oferece em chips. Se um dia passar disso, a resposta DIZ quantos
         ficaram de fora. Ver a licao do `.slice(0,20)` que descartava
         candidatura em silencio no Painel. */
      const TETO = 300;
      const usar = meses.slice(0, TETO);
      const { data, error } = await sb.from("pcp_meta").select("chave, valor")
        .in("chave", usar.map((mm: string) => `entregues:${mm}`));
      if (error) throw new Error(error.message);
      const pacotes: Record<string, any> = {};
      for (const linha of data ?? []) {
        const mm = String(linha.chave).slice("entregues:".length);
        const p = linha.valor;
        if (p && Number(p.v) >= 2 && Array.isArray(p.os)) pacotes[mm] = { ...p, cache: true };
      }
      return resp({
        pacotes,
        // O que o servidor ainda nao tem: a tela pede pela fila normal, sem
        // achar que o ano esta completo.
        faltando: usar.filter((mm: string) => !pacotes[mm]),
        ...(meses.length > usar.length ? { cortados: meses.length - usar.length } : {}),
      });
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
    /* IMPORTACAO VINDA DE FORA (GitHub Actions).
       A busca no ERP saiu daqui em 14/09/2026: uma pagina do Mubisys ja levou
       206s no horario comercial e esta funcao morre aos 150s -- ela nunca teve
       folga, so funcionava enquanto o ERP respondia em 15-20s. Quem busca agora
       e o workflow `importar-mubisys.yml`, que tem 900s e usa as mesmas regras
       de 404/tentativa do cliente do Painel. Aqui chega a lista JA BUSCADA.

       O trabalho de banco (deduplicacao, lapide, preservar trabalho humano)
       continua sendo feito AQUI, por `gravarImportadas` -- a mesma funcao que o
       `importar` usa. Mover a busca nao pode significar duplicar a regra. */
    if (action === "importarLote") {
      const lista = Array.isArray(body.os) ? body.os : null;
      if (!lista) return resp({ error: "mande { os: [...] } com o que o ERP devolveu" }, 400);
      // LISTA VAZIA NAO E SUCESSO. Quem busca ja aplica a regra dos dois 404;
      // se mesmo assim veio vazio, gravar "importacao ok, 0 novas" carimbaria
      // saude num ciclo que nao trouxe nada. Melhor recusar e o workflow falhar.
      if (!lista.length && !body.vazioEsperado) {
        return resp({ error: "lote vazio recusado: use vazioEsperado:true se o ERP realmente não tem O.S na janela" }, 400);
      }
      try {
        const remotas = lista.map(mapearOS);
        const r = await gravarImportadas(sb, remotas);
        const st = { em: new Date().toISOString(), ok: true, origem: "actions", ...r };
        await gravarBatimento(st);
        console.log(`[pcp-mubisys] lote do Actions: ${r.novas} nova(s) de ${r.total}.`);
        return resp(st);
      } catch (e) {
        await gravarBatimento({
          em: new Date().toISOString(), ok: false, origem: "actions",
          erro: (e as Error)?.message ?? String(e),
        }).catch(() => {});
        throw e;
      }
    }

    if (action === "importar") {
      /* ORCAMENTO DE TEMPO. A Edge Function morre aos 150s, e `importar` faz
         TRES trabalhos que batem no ERP: trazer O.S nova (o que a fabrica
         precisa), dar baixa no que o ERP ja fechou, e renovar o mes de
         entregas. Quando o ERP fica lento, os tres juntos nao cabem -- e o
         primeiro, que e o critico, morria junto com os outros dois.
         Agora cada etapa so comeca se houver tempo, e o BATIMENTO e gravado
         assim que a importacao termina, nao no fim de tudo. */
      const ATE = Date.now() + 118_000;   // 32s de folga para gravar e responder
      const sobra = () => ATE - Date.now();
      try {
        // Prazo vem do orcamento: as tentativas cabem no que sobrar da rodada.
        const remotas = await buscarCarteiraCompleta(creds.base, creds.publicKey, headers, datafinal);
        const conciliacao = await reconciliarCarteira(sb, remotas);
        const {novas,jaExistiam} = conciliacao;
        const parcial = {em:new Date().toISOString(),ok:true,...conciliacao,duplicatasRemovidas:0};
        await gravarBatimento(parcial);
        const baixa = {ok:conciliacao.conflitosCarteira===0,abertasNoPcp:remotas.length,conferidas:remotas.length,semNoticiaDoErp:0,baixadas:conciliacao.arquivadas,restauradas:conciliacao.restauradas,carteiraCompleta:true};

        // Renova o mes corrente de "entregues" (valor entregue da tela de
        // Entregas) na mesma hora: uma consulta a mais ao ERP por hora, e a
        // gestao abre a tela com o numero pronto. Falha aqui nao derruba nada.
        let entregues: any = null;
        if (sobra() < 20_000) {
          entregues = { pulado: "sem tempo nesta rodada (ERP lento); tenta na próxima hora" };
        } else try {
          // Fuso da empresa, nao UTC: as 21h do ultimo dia o robo renovava o
          // mes SEGUINTE, que ainda nao comecou, e o mes que fechava parava.
          const mesAtual = mesLocal();
          const os = await varrerMesEntregues(mesAtual, creds.base, creds.publicKey, headers, { sobra });
          const anterior = await getMeta(`entregues:${mesAtual}`);
          const tinha = Number(anterior?.total ?? 0);
          // Mesma trava da acao: lista que desabou nao apaga mes que tinha numero.
          if (tinha > 0 && os.length < tinha * 0.5) {
            entregues = { mes: mesAtual, recusado: `ERP devolveu ${os.length} de ${tinha}; mantido o anterior` };
          } else {
            await setMeta(`entregues:${mesAtual}`, pacoteEntregues(mesAtual, os));
            entregues = { mes: mesAtual, total: os.length };
          }

          /* AQUECER UM MES VENCIDO POR RODADA.
             Sem isto, a conta da remontagem cai sempre sobre quem abre a tela
             primeiro -- segunda de manha, e sempre a mesma pessoa. O robo roda
             de hora em hora e quase nunca tem o que fazer aqui (com a escada de
             validade, historia so vence a cada 180 dias): quando tem, resolve um
             mes por vez, de madrugada, sem ninguem esperando. Do mais recente
             para o mais antigo, que e a ordem em que alguem vai olhar. */
          if (sobra() > 45_000) {
            const doAno = [];
            const [ay, am] = mesAtual.split("-").map(Number);
            for (let d = 1; d <= 11; d++) {
              const dt = new Date(Date.UTC(ay, am - 1 - d, 1));
              doAno.push(dt.toISOString().slice(0, 7));
            }
            const { data: linhas } = await sb.from("pcp_meta").select("chave, valor")
              .in("chave", doAno.map((mm) => `entregues:${mm}`));
            const porMes: Record<string, any> = {};
            for (const l of linhas ?? []) porMes[String(l.chave).slice("entregues:".length)] = l.valor;
            const vencido = doAno.find((mm) => {
              const p = porMes[mm];
              if (!p?.em) return true;   // nunca montado: aquecer tambem
              return Date.now() - new Date(p.em).getTime() >= validadeEntregues(mm, Number(p.v ?? 0));
            });
            if (vencido && sobra() > 45_000) {
              const osV = await varrerMesEntregues(vencido, creds.base, creds.publicKey, headers, { sobra });
              const tinhaV = Number(porMes[vencido]?.total ?? 0);
              if (!(tinhaV > 0 && osV.length < tinhaV * 0.5)) {
                await setMeta(`entregues:${vencido}`, pacoteEntregues(vencido, osV));
                entregues = { ...entregues, aquecido: { mes: vencido, total: osV.length } };
              } else {
                entregues = { ...entregues, aquecido: { mes: vencido, recusado: `${osV.length} de ${tinhaV}` } };
              }
            }
          }
        } catch (e) { entregues = { ...(entregues || {}), erro: String((e as Error)?.message || e) }; }

        const st = { ...parcial, em: new Date().toISOString(), baixa, entregues };
        await gravarBatimento(st);
        console.log(`[pcp-mubisys] ${novas} nova(s) de ${remotas.length}.`);
        return resp(st);
      } catch (e) {
        // Registra a falha: o painel de saude do app precisa denunciar que a
        // importacao parou, senao ela morre em silencio.
        await gravarBatimento({
          em: new Date().toISOString(), ok: false, erro: semCredencial((e as Error)?.message ?? e),
        }).catch(() => {});
        throw e;
      }
    }

    return resp({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error("[pcp-mubisys] erro:", e);
    return resp({ error: semCredencial((e as Error)?.message ?? "Erro interno") }, 500);
  }
});
