/* A REVISÃO DA JUNÇÃO v144 (01/10/2026): F23 (ficha em etapas) + E8 (itens
 * do ERP, mescla desligada). A revisão deu "pode publicar" com 1 MÉDIO e 6
 * BAIXOS; cada teste "v144: ..." é um deles e começa pelo caso ruim, que
 * falha no 79106da e passa depois. Para rodar contra outra cópia (git
 * archive):
 *   PCP_BASELINE=<pasta> node --test tests/v144-revisao.test.cjs
 *
 * - A (MÉDIO): o checklist, o progresso da Divisão e o resumo decidem "vale
 *   o programa" pelo MESMO dia do Status da entrega e da apuração
 *   (regraDoDiaTela(diaDaRegraDe(os))), e cada efeito sai da própria regra.
 * - B: trocar de etapa (e a caixa Retrabalho) atualiza o selo do topo e o
 *   Próximo passo, sem repintar a ficha.
 * - C: a marca "não gravou" da Divisão sai quando a sincronização ou o
 *   Recarregar traz a divisão confirmada.
 * - D: a ficha avisa que a apuração do programa entra numa versão seguinte.
 * - E e F: na formatoItens (pcp-mubisys de verdade, contra um ERP falso), o
 *   prazo cobre a leitura do corpo, e o primeiro 429 para tudo.
 * - G: o selo "Falta" não repete o verbo do texto.
 *
 * A tela: o app.js roda inteiro num DOM falso (o mesmo de
 * tests/ficha-etapas-revisao.test.cjs). O servidor: helpers/edge.cjs, com o
 * fetch de verdade do Node apontado para um ERP falso local e um relógio
 * acelerado (50 vezes) dentro do vm do servidor. Dados fictícios: o
 * repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const path = require('node:path');
const root = path.join(__dirname, '..');
const base = process.env.PCP_BASELINE || root;
const ler = f => fs.readFileSync(path.join(base, f), 'utf8');
const HOJE = '2026-10-05';
const js = v => JSON.parse(JSON.stringify(v));
class DataFixa extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return new Date(HOJE + 'T12:00:00').getTime(); } }

/* ───────────── a tela (DOM falso, o de ficha-etapas-revisao) ───────────── */
function classes(ini) {
  const s = new Set(ini || []);
  return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }};
}
const ATTR = '(?:[^>"]|"[^"]*")*';
const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
function elementos(getHTML, doc) {
  let cache = new Map(), porId = new Map(), visto = null;
  const novoEl = (p = {}) => {
    const attrs = new Map();
    return {id: '', textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, tagName: 'DIV', dataset: {}, classList: classes(), style: {},
      focus() { doc.activeElement = this; }, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getAttribute: k => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k), ...p};
  };
  const zerarSeMudou = () => { const h = getHTML(); if (h !== visto) { visto = h; cache = new Map(); porId = new Map(); } return h; };
  const deTag = (m, tag, texto) => {
    const id = (/\sid="([^"]+)"/.exec(tag) || [])[1] || '';
    if (id && porId.has(id)) return porId.get(id);
    const ds = {};
    for (const [, k, v] of tag.matchAll(/\sdata-([\w-]+)(?:="([^"]*)")?/g)) ds[camel(k)] = v === undefined ? '' : v;
    const cls = ((/\sclass="([^"]*)"/.exec(tag) || [])[1] || '').split(/\s+/).filter(Boolean);
    const el = novoEl({id, tagName: m.toUpperCase(), dataset: ds, classList: classes(cls), textContent: texto || '', hidden: /\shidden(\s|$|=)/.test(tag)});
    for (const [, k, v] of tag.matchAll(/\s(aria-[\w-]+|tabindex)="([^"]*)"/g)) el.setAttribute(k, v);
    if (id) porId.set(id, el);
    return el;
  };
  const comAtributo = (attr, valor) => {
    const h = zerarSeMudou();
    const chave = attr + '=' + (valor || '');
    if (!cache.has(chave)) {
      const alvo = valor === undefined ? `\\s${attr}(?:="[^"]*")?` : `\\s${attr}="${valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`;
      cache.set(chave, [...h.matchAll(new RegExp(`<(\\w+)(${ATTR}${alvo}${ATTR})>([^<]*)`, 'g'))].map(m => deTag(m[1], m[2], m[3])));
    }
    return cache.get(chave);
  };
  const porIdDoHTML = id => {
    const h = zerarSeMudou();
    if (porId.has(id)) return porId.get(id);
    const m = new RegExp(`<(\\w+)(${ATTR}\\sid="${id}"${ATTR})>([^<]*)`).exec(h);
    return m ? deTag(m[1], m[2], m[3]) : null;
  };
  const qsa = s => {
    let m;
    if ((m = /^\[([\w-]+)\]$/.exec(s))) return comAtributo(m[1]);
    if ((m = /^#([\w-]+)$/.exec(s))) { const e = porIdDoHTML(m[1]); return e ? [e] : []; }
    return [];
  };
  return {comAtributo, porIdDoHTML, qsa};
}
function domFalso() {
  let html = '', blocos = [], secs = [], pinturas = 0;
  const doc = {activeElement: null, body: {contains: () => false, classList: classes(), appendChild() {}}, visibilityState: 'visible', addEventListener() {}};
  const E = elementos(() => html, doc);
  const modal = {classList: classes(), scrollTop: 0,
    get innerHTML() { return html; },
    set innerHTML(v) { pinturas++; html = v;
      blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false}));
      secs = [...v.matchAll(/<section class="ficha-etapa" data-etapa-sec="(\w+)"([^>]*)>/g)].map(m => ({dataset: {etapaSec: m[1]}, hidden: /\shidden(\s|$)/.test(m[2])})); },
    querySelector: () => null, querySelectorAll: E.qsa};
  const overlay = {classList: classes()};
  // O diálogo do conflito (initConflictDialog): o texto e os dois botões.
  const conflito = Object.fromEntries(['#conflict-dialog', '#conflict-msg', '#conflict-reload', '#conflict-overwrite'].map(k => [k, {classList: classes(), textContent: '', onclick: null}]));
  doc.querySelector = s => (s === '#modal-os' ? modal : s === '#modal-overlay' ? overlay : conflito[s] || null);
  doc.querySelectorAll = s => (s === '#modal-os .card-fs' ? blocos : s === '#modal-os .ficha-etapa' ? secs
    : s === '#modal-os [data-fmsg]' ? E.comAtributo('data-fmsg')
    : s === '#ficha-etapas [data-ir-etapa]' ? E.comAtributo('data-ir-etapa').filter(b => b.dataset.irFoco === 'passo') : []);
  doc.getElementById = id => E.porIdDoHTML(id);
  return {doc, modal, conflito, html: () => html, secs: () => secs, pinturas: () => pinturas};
}
function tela({papel = 'admin', lista = [], versoes = [], extra = ''} = {}) {
  const d = domFalso();
  const toasts = [];
  const cfg = {instaladores: ['Ana'], responsaveis: ['Gestor Fictício'], vinculosRH: [], performancePCP: {equipes: [], participacoes: []}};
  const STORE = {getAllOS: () => lista, getCFG: () => cfg, getOS: id => lista.find(o => o.id === id) || null, elenco: () => ({pessoas: [], antigos: []}),
    saveOS(o) { const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    getQueue: () => [], on() {}, uuid: () => 'u1', valores: () => ({}), carimbarMomento() {}, pullPhoto: async () => null};
  const ctx = vm.createContext({console, Date: DataFixa, document: d.doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, STORE, setTimeout() {}, clearTimeout() {}, setInterval() {},
    __toasts: toasts, __versoes: versoes});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user = {nome: 'Gestor Fictício', papel: '${papel}'};
    bindModalEvents = () => {}; ligarEquipeDaFicha = () => {}; ligarHistoricoAlteracoes = () => {};
    renderActiveTab = () => {}; toast = (m, t, o) => __toasts.push([m, t || '', o || null]);
    // O index.html sempre carrega o casa.js: as versões da regra vêm dele.
    var versoesRegrasCasa = () => __versoes;
    ${extra}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  const secoes = () => Object.fromEntries(d.html().split('<section class="ficha-etapa" ').slice(1).map(p => {
    const k = /^data-etapa-sec="(\w+)"/.exec(p)[1];
    const fim = p.indexOf('id="modal-pdf"');
    return [k, fim >= 0 ? p.slice(0, fim) : p];
  }));
  // O stepper que está na tela: o repintado ao vivo, se houve, senão o da pintura.
  const passoVivo = k => { const nav = d.doc.getElementById('ficha-etapas'); const h = nav && nav.innerHTML ? nav.innerHTML : d.html(); return (new RegExp(`data-ir-etapa="${k}" data-ir-foco="passo"[^>]*aria-label="([^"]*)"`).exec(h) || [])[1] || ''; };
  const classePasso = k => { const nav = d.doc.getElementById('ficha-etapas'); const h = nav && nav.innerHTML ? nav.innerHTML : d.html(); return (new RegExp(`class="fe-passo ([\\w-]+)" data-ir-etapa="${k}"`).exec(h) || [])[1] || ''; };
  const abrirOS = (id, alvo) => run(`openModal(STORE.getOS(${JSON.stringify(id)})${alvo ? ', ' + JSON.stringify(alvo) : ''})`);
  // O pedaço repintado ao vivo, se houve, senão o da pintura.
  const vivo = (id, re) => { const el = d.doc.getElementById(id); return el && el.innerHTML ? el.innerHTML : ((re.exec(d.html()) || [])[0] || ''); };
  const checklist = () => vivo('fe-checklist', /id="fe-checklist"[\s\S]*?<\/section>/);
  return {run, d, toasts, lista, secoes, passoVivo, classePasso, abrirOS, vivo, checklist, el: id => d.doc.getElementById(id), html: () => d.html()};
}

const osBase = (extra = {}) => ({id: 'f1', numero: '7101', tipo: 'externo', cliente: 'Cliente Fictício', responsavelPCP: 'Gestor Fictício', liberadoPCP: true,
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, equipe: ['Ana'], veiculo: 'Carro 1', itens: [{uid: 'f1:1:1', item: '1', descricao: 'Placa fictícia', qtde: '1', pronto: true}], ...extra});
const osPronta = (extra = {}) => osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00', embarqueConferidoPor: 'Gestor Fictício', produtosConferidosPor: 'Gestor Fictício',
  ferramentasConferidas: true, ferramentasConferidasPor: 'Gestor Fictício', carroLiberado: true, horaSaida: '08:00', saidaEm: HOJE + 'T08:00:00',
  instalacaoOK: true, conferidoPor: 'Gestor Fictício', fotosCheckinIds: ['foto-saida-1'], fotosRetornoIds: ['foto-volta-1'], horaRetorno: '15:00', retornoEm: HOJE + 'T15:00:00', ...extra});
const RESPONDIDO_NAO = {resposta: 'nao', em: HOJE + 'T16:00:00', por: 'Gestor Fictício'};
// A volta conferida: carro limpo e arrumado (bônus) e equipamento com "não" (redutor).
const VOLTA = {carroLimpo: 'sim', carroArrumado: 'sim', equipamentosOk: 'nao', semAvaria: 'sim', por: 'Gestor Fictício', em: HOJE + 'T17:00:00'};
const chegada = (dia, hora = '18:10') => ({dia, hora, fonte: 'lote', por: 'Gestor Fictício', em: dia + 'T21:15:00.000Z', recebidoEm: dia + 'T21:15:05.000Z'});
/* Entregue (chegada conferida no Fechar o dia) num dia, com prazo no dia
   anterior, a volta conferida e o retrabalho respondido. */
const entregueEm = (dia, extra = {}) => {
  const ant = new Date(Date.UTC(...dia.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - 86400000).toISOString().slice(0, 10);
  return osPronta({id: 'v1', numero: '7130', retornoConferido: chegada(dia), prazoCombinado: {data: ant, fonte: 'agenda', em: ant + 'T08:00:00'},
    instalacao: {data: dia, periodo: 'Manhã', duracaoDias: 1}, retornoPrevisto: [{dia, hora: '18:00', por: 'Gestor Fictício', em: ant + 'T10:00:00'}],
    retornoConf: VOLTA, retrabalhoPerguntado: RESPONDIDO_NAO, ...extra});
};
const itensDoChecklist = h => [...h.matchAll(/<li class="fe-ck fe-ck-(\w+)">([\s\S]*?)<\/li>/g)].map(m => ({estado: m[1], html: m[2], rotulo: (/<strong>([^<]*)<\/strong>/.exec(m[2]) || [])[1]}));
const doChecklist = (h, rotulo) => itensDoChecklist(h).find(c => c.rotulo === rotulo) || null;
const texto = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const EFEITOS = /não pontua|bônus da volta|redutor da volta|fica neutra|tira a O\.S\. da pontuação/;

/* ───────────── A · o checklist e o Status da entrega pelo mesmo dia ───────────── */
test('v144: A, entregue em 30/09 e finalizada em 01/10 não "não pontua": checklist, Divisão e resumo usam o dia e a regra do Status da entrega', () => {
  // A O.S. que o Thiago fecha nesta semana: chegada conferida em 30/09 (Fechar o dia), prazo 29/09, finalizada hoje.
  const v30f = entregueEm('2026-09-30', {finalizadaEm: '2026-10-01T09:05:00', finalizadoPor: 'Gestor Fictício'});
  const t = tela({lista: [v30f]});
  t.abrirOS('v1', 'fechamento');
  // Premissa: o Status da entrega e a apuração usam o dia da chegada, que está fora do programa.
  assert.equal(t.run('diaDaRegraDe(_modalDraft)'), '2026-09-30');
  assert.equal(t.run('regraDoDiaTela("2026-09-30")'), null);
  assert.deepEqual(js(t.run('statusEntregaDe(_modalDraft).perdas')), [], 'o Status da entrega: nenhuma perda valendo');
  // Caso ruim: o checklist dizia "Entregue com atraso: a O.S. não pontua" e "bônus da volta" pelo dia da finalização.
  const ck = t.checklist();
  assert.doesNotMatch(ck, EFEITOS);
  assert.match(texto(ck), /Entregue antes de 01\/10\/2026: os efeitos do programa não valem para ela\./);
  assert.match(doChecklist(ck, 'Prazo').html, /com atraso\./, 'o atraso aparece, sem efeito');
  assert.equal(t.passoVivo('divisao'), 'Divisão: entregue antes do programa, sem divisão confirmada');
  assert.equal(t.classePasso('divisao'), 'fe-neutro');
  // A mesma O.S. ainda aberta: "Já passou do prazo... não pontua" também não.
  const t2 = tela({lista: [entregueEm('2026-09-30')]});
  t2.abrirOS('v1', 'fechamento');
  assert.doesNotMatch(t2.checklist(), EFEITOS);
  assert.match(texto(t2.checklist()), /Entregue antes de 01\/10\/2026/);
  // A baixa do ERP lançada com data de setembro e finalizada em outubro: o dia é o do lançamento.
  const erp = osPronta({id: 'e1', numero: '7131', finalizadaEm: '2026-10-01T03:00:00', finalizadoPor: 'Mubisys · baixa automática', baixaAutoERP: {em: '2026-10-01T03:00:00', status: 'ENTREGUE'},
    prazoCombinado: {data: '2026-09-25', fonte: 'agenda', em: '2026-09-20T10:00:00'}, entregaLancada: {em: '2026-10-01T09:00:00', por: 'Gestor Fictício', data: '2026-09-29'}, retornoConf: VOLTA, retrabalhoPerguntado: RESPONDIDO_NAO});
  const t3 = tela({lista: [erp]});
  t3.abrirOS('e1', 'fechamento');
  assert.equal(t3.run('diaDaRegraDe(_modalDraft)'), '2026-09-29');
  assert.doesNotMatch(t3.checklist(), EFEITOS);
  // Entregue em outubro: o efeito volta, e o checklist diz o mesmo que o Status da entrega.
  const t4 = tela({lista: [entregueEm('2026-10-02', {finalizadaEm: '2026-10-03T09:00:00', finalizadoPor: 'Gestor Fictício'})]});
  t4.abrirOS('v1', 'fechamento');
  assert.ok(t4.run('statusEntregaDe(_modalDraft).perdas').includes('atraso'), 'premissa: em outubro o atraso é perda');
  const ck4 = t4.checklist();
  assert.match(doChecklist(ck4, 'Prazo').html, /Entregue com atraso: a O\.S\. não pontua\. O abono devolve\./);
  assert.match(doChecklist(ck4, 'Limpeza e equipamentos da volta').html, /Carro limpo e arrumado: bônus da volta\. Equipamento com &quot;não&quot;: redutor da volta\./);
  assert.doesNotMatch(texto(ck4), /Entregue antes de 01\/10/);
  assert.equal(t4.passoVivo('divisao'), 'Divisão: divisão a confirmar');
});

test('v144: A, os efeitos saem da regra do dia: a versão gravada sem o atraso nas perdas e sem bônus não promete nem um nem outro', () => {
  const tVer = tela();
  const versao = {...js(tVer.run(`REGRAS.completarRegra({validaDesde: '2026-10-01', perdas: ['retornoAntecipado'], volta: {carroLimpoBp: 0, equipamentoFaltaBp: 1000, naoConferida: 'neutra'}})`)), id: 'r1', versao: 1};
  assert.equal(tVer.run(`REGRAS.validarRegra(${JSON.stringify(versao)})`), '', 'premissa: a versão é válida');
  const os = entregueEm('2026-10-02', {finalizadaEm: '2026-10-03T09:00:00', finalizadoPor: 'Gestor Fictício', retrabalho: true, problema: 'Placa torta fictícia'});
  const t = tela({lista: [os], versoes: [versao]});
  t.abrirOS('v1', 'fechamento');
  const perdas = js(t.run('statusEntregaDe(_modalDraft).perdas'));
  assert.ok(!perdas.includes('atraso') && !perdas.includes('retrabalho'), 'premissa: o Status da entrega não perde por atraso nem por retrabalho');
  // Caso ruim: o texto era fixo, e prometia o efeito que a regra do dia não tem.
  const ck = t.checklist();
  assert.doesNotMatch(doChecklist(ck, 'Prazo').html, /não pontua/);
  assert.doesNotMatch(doChecklist(ck, 'Retrabalho').html, /tira a O\.S\. da pontuação/);
  const volta = doChecklist(ck, 'Limpeza e equipamentos da volta').html;
  assert.doesNotMatch(volta, /bônus/);
  assert.match(volta, /Equipamento com &quot;não&quot;: redutor da volta\./, 'o redutor está na regra');
  // A volta não conferida: neutra só no que a regra tem.
  const t2 = tela({lista: [{...js(os), retornoConf: {}}], versoes: [versao]});
  t2.abrirOS('v1', 'fechamento');
  assert.match(doChecklist(t2.checklist(), 'Limpeza e equipamentos da volta').html, /Sem a conferência, a volta fica neutra: sem redutor\./);
});

/* ───────────── B · o alto da ficha acompanha ───────────── */
test('v144: B, a caixa Retrabalho e a troca de etapa atualizam o selo do topo e o Próximo passo, sem repintar a ficha', () => {
  const t = tela({lista: [osPronta({horaRetorno: '', retornoEm: '', fotosRetornoIds: []})]});
  t.abrirOS('f1', 'exec');
  const selo = () => t.vivo('fe-selo-topo', /<button type="button" class="fe-selo"[\s\S]*?<\/button>/);
  const pp = () => t.vivo('fe-pp', /<div class="prox-passo prox-passo-modal">[\s\S]*?<\/div>/);
  assert.doesNotMatch(selo(), /Retrabalho/, 'premissa');
  const ppAntes = t.run('proximoPasso(_modalDraft).label');
  const antes = t.d.pinturas();
  // A caixa Retrabalho da Jornada (bindModalEvents): grava e repinta só as pendências.
  t.run(`setField('retrabalho', true); saveDraft(); pintarPendenciasFicha();`);
  assert.equal(t.run('statusEntregaDe(_modalDraft).rotulo'), 'Retrabalho');
  const ppAgora = t.run('proximoPasso(_modalDraft).label');
  assert.notEqual(ppAgora, ppAntes, 'premissa: a falta do problema entra no próximo passo');
  // Caso ruim: o selo seguia "Em execução" e o Próximo passo com a conta velha.
  assert.match(selo(), /aria-label="Status da entrega: Retrabalho\. Ver no Fechamento, com as ocorrências"/);
  assert.match(selo(), /Retrabalho<\/span><\/button>$/);
  assert.match(pp(), new RegExp(`<strong>${ppAgora}</strong>`));
  // Trocar para o Fechamento: o Status da entrega e o selo dizem o mesmo; o "Ir para Jornada" aparece.
  t.run(`irParaEtapaFicha('fechamento')`);
  assert.match(t.el('fe-status').innerHTML, /Retrabalho/);
  assert.match(selo(), /Status da entrega: Retrabalho/);
  assert.match(pp(), /class="btn-ghost btn-sm fe-ir" id="fe-ir-pp" data-ir-etapa="jornada" data-ir-foco="titulo">Ir para Jornada<\/button>/);
  // De volta à Jornada, o "Ir para" do próximo passo some sem sair do lugar (B1 da F23).
  t.run(`irParaEtapaFicha('jornada')`);
  assert.match(pp(), /class="btn-ghost btn-sm fe-ir fe-invisivel" id="fe-ir-pp" data-ir-etapa="jornada" data-ir-foco="titulo" aria-hidden="true" tabindex="-1">/);
  assert.equal(t.d.pinturas(), antes, 'nenhuma pintura da ficha inteira');
  // O pedaço não ocupa lugar: o layout do alto da ficha não muda.
  assert.match(ler('styles.css'), /\.fe-host \{ display: contents; \}/);
});

/* ───────────── C · o "não gravou" sai com a divisão que chega do servidor ───────────── */
test('v144: C, a marca "não gravou" da Divisão sai quando a sincronização ou o Recarregar traz a divisão confirmada', async () => {
  const equipe = ['900001', '900002'];
  const t = tela({lista: [osBase({equipe, rev: 3})]});
  const aloc = js(t.run(`DIVISAO.montar([{equipeId: null, liderId: '900001', membros: ['900001', '900002']}])`));
  assert.equal(t.run(`DIVISAO.alocacaoConfirmada(${JSON.stringify({equipe, alocacao: aloc})})`), true, 'premissa: a divisão da outra aba confirma');
  t.abrirOS('f1', 'divisao');
  let solta;
  t.run(`ALOCUI.iniciar = () => ({}); ALOCUI.montar = () => {}; ALOCUI.bloqueio = () => ''; ALOCUI.estrutura = () => [];`);
  t.run('ALOCUI').gravarNaOS = () => new Promise(r => { solta = r; });
  t.run(`ligarDivisaoDaFicha(document.getElementById('ficha-divisao'), new Map())`);
  const envio = t.el('ficha-div-ok').onclick();
  t.run(`irParaEtapaFicha('jornada')`);
  solta({ok: false, estado: 'conflito', mensagem: 'A divisão desta O.S. foi mudada em outro aparelho (fictício). Nada foi gravado.'});
  await envio;
  assert.match(t.passoVivo('divisao'), /^Divisão: a divisão não foi gravada: /, 'premissa: a falha marca a Divisão (D8)');
  const sincroniza = o => { t.lista[0] = o; t.run(`_modalDirty = false; _saveDraftTimer = null; atualizarFichaAberta()`); };
  // A sincronização que traz a O.S. ainda sem divisão: a marca fica.
  sincroniza({...osBase({equipe}), rev: 5});
  assert.equal(t.run('_modalDraft.rev'), 5, 'premissa: o rascunho virou o do servidor');
  assert.match(t.passoVivo('divisao'), /não foi gravada/);
  // Caso ruim: a outra aba gravou a divisão, a sincronização a trouxe, e o stepper seguia "não gravou".
  sincroniza({...osBase({equipe}), alocacao: aloc, rev: 9});
  assert.equal(t.passoVivo('divisao'), 'Divisão: divisão confirmada');
  assert.equal(t.classePasso('divisao'), 'fe-ok');
  // O Recarregar do diálogo do conflito (aceita a versão do servidor e reabre a mesma ficha) também tira a marca.
  const STORE = t.run('STORE');
  let aoConflito = null;
  STORE.onConflict = fn => { aoConflito = fn; };
  STORE.aceitarServidor = r => { t.lista[0] = js(r); };
  t.run('initConflictDialog()');
  t.lista[0] = {...osBase({equipe}), rev: 9};   // a cópia deste aparelho, sem a divisão
  t.run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS('f1'))); _divErroFicha.set('f1', 'Não foi possível gravar (fictício).'); reRenderModalKeepOpen();`);
  assert.equal(t.classePasso('divisao'), 'fe-erro', 'premissa');
  aoConflito(js(t.lista[0]), {...osBase({equipe}), alocacao: aloc, rev: 12, atualizadoPor: 'Outra aba fictícia'});
  t.d.conflito['#conflict-reload'].onclick();
  assert.equal(t.run('_modalDraft.rev'), 12, 'premissa: a ficha reabriu com a versão do servidor');
  assert.equal(t.passoVivo('divisao'), 'Divisão: divisão confirmada');
  assert.deepEqual(js(t.run('[..._divErroFicha.keys()]')), []);
});

/* ───────────── D · a apuração do programa entra depois ───────────── */
const APURACAO = 'A apuração do programa (pontos e comissão de outubro) entra numa versão seguinte. Até lá, a aba Performance mostra a contagem de hoje.';
test('v144: D, o checklist e as Instruções avisam que a apuração do programa entra numa versão seguinte', () => {
  const t = tela({lista: [osPronta({retrabalhoPerguntado: RESPONDIDO_NAO})]});
  t.abrirOS('f1', 'fechamento');
  // Caso ruim: a ficha dizia "não pontua" e a aba Performance contava a O.S., sem nada explicar.
  assert.ok(texto(t.checklist()).includes(APURACAO), 'a linha no checklist');
  const app = ler('app.js');
  const ini = app.indexOf('function abrirInstrucoes()');
  const manual = app.slice(ini, app.indexOf('\n}', ini));
  const linhaManual = manual.split('<p>').find(x => x.includes('checklist de fechamento</strong> não trava')).split('</p>')[0];
  assert.match(linhaManual, /O efeito segue o dia da entrega, o mesmo do Status da entrega: o que foi entregue antes de 01\/10\/2026 fica fora do programa\. A apuração do programa \(pontos e comissão de outubro\) entra numa versão seguinte; até lá, a aba Performance mostra a contagem de hoje\./);
  for (const s of [APURACAO, linhaManual]) assert.ok(!s.includes('—'), 'sem travessão');
  // Fora do programa (entregue em 30/09) e na cancelada, a linha não aparece.
  const fora = tela({lista: [entregueEm('2026-09-30', {finalizadaEm: '2026-10-01T09:05:00'})]});
  fora.abrirOS('v1', 'fechamento');
  assert.ok(!texto(fora.checklist()).includes('apuração do programa'));
  const canc = tela({lista: [osBase({cancelamento: {ativo: true, motivo: 'Cliente desistiu do pedido fictício', por: 'Gestor Fictício', em: HOJE + 'T09:00:00'}})]});
  canc.abrirOS('f1', 'fechamento');
  assert.ok(!texto(canc.checklist()).includes('apuração do programa'));
  // Com o motor do programa carregado (F19, PONTUACAO), a linha sai sozinha.
  const f19 = tela({lista: [osPronta()], extra: `var PONTUACAO = {INICIO_PROGRAMA: '2026-10-01'};`});
  f19.abrirOS('f1', 'fechamento');
  assert.ok(!texto(f19.checklist()).includes('apuração do programa'));
});

/* ───────────── G · sem "Falta falta" ───────────── */
test('v144: G, o selo "Falta" não repete o verbo do texto', () => {
  const casos = [
    osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00'}),                                     // aberta: retrabalho e volta sem resposta
    osPronta({finalizadaEm: HOJE + 'T16:00:00', finalizadoPor: 'Gestor Fictício'}),                     // finalizada sem conferir a volta
    osPronta({retornoConf: {carroLimpo: 'sim', por: 'Gestor Fictício', em: HOJE + 'T17:00:00'}}),        // volta conferida em parte
  ];
  for (const o of casos) {
    const t = tela({lista: [o]});
    t.abrirOS('f1', 'fechamento');
    const ck = t.checklist();
    // Caso ruim: "Retrabalho: Falta falta responder se gerou retrabalho."
    assert.doesNotMatch(texto(ck), /Falta falta/i);
    for (const c of itensDoChecklist(ck).filter(x => x.estado === 'falta')) {
      const depois = texto(c.html.split('<span class="fe-ck-selo">Falta</span>')[1] || '');
      assert.doesNotMatch(depois, /^falta\b/i, c.rotulo);
    }
  }
  const t = tela({lista: [casos[0]]});
  t.abrirOS('f1', 'fechamento');
  assert.match(texto(doChecklist(t.checklist(), 'Retrabalho').html), /Retrabalho : Falta responder se gerou retrabalho\./);
  assert.match(texto(doChecklist(t.checklist(), 'Limpeza e equipamentos da volta').html), /Falta conferir o carro e os equipamentos/);
});

/* ───────────── E e F · formatoItens contra um ERP falso ───────────── */
const {edge} = require(path.join(base, 'tests/helpers/edge.cjs'));
const ADMIN = {papel: 'admin', nome: 'Admin Teste', sub: 'admin'};
const RAPIDO = 50;   // o relógio do servidor de teste anda 50 vezes mais rápido
const osDoERP = (n, dia) => ({sequencial_ordem: n, cliente: 'Cliente Sigiloso', data_cadastro: dia + ' 10:00:00', itens: [{posicao: '1', item: 'Placa fictícia', quantidade: '1', sub_total: '100'}]});
/* O pcp-mubisys de verdade (helpers/edge.cjs), com o fetch do Node e o
   fetchERP do próprio index.ts, contra um ERP falso local. O relógio do vm
   (Date.now e setTimeout) anda RAPIDO vezes mais rápido: 140 s viram 2,8 s. */
async function servidorComERP(responder) {
  const chamadas = [];
  const srv = http.createServer((req, res) => { chamadas.push(req.url); responder(req, res, chamadas.length); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const e = await edge('pcp-mubisys', {pcp_meta: [{chave: 'mubisys', valor: {publicKey: 'pk-ficticia', accessToken: 'tk-ficticio'}}]});
  e.run('console = {...console, warn(){}, log(){}, error(){}}');
  const g = e.run('globalThis');
  const local = `http://127.0.0.1:${srv.address().port}/api`;
  g.fetch = (url, init) => fetch(String(url).replace(/^https:\/\/api\.mubisys\.com\/api/, local), init);
  g.AbortController = AbortController;
  g.setTimeout = (fn, ms, ...a) => setTimeout(fn, Math.max(0, Number(ms) || 0) / RAPIDO, ...a);
  g.clearTimeout = clearTimeout;
  e.run(`{ const real = Date.now.bind(Date), t0 = real(); Date.now = () => t0 + (real() - t0) * ${RAPIDO}; }`);
  const fechar = () => { srv.closeAllConnections(); srv.close(); };
  // A chamada, com o limite da função (150 s no relógio do servidor): passou, é falha, não espera.
  const chamar = async body => {
    let t;
    const limite = new Promise(ok => { t = setTimeout(() => ok({limite: true}), 150000 / RAPIDO); });
    try { return await Promise.race([e.call({action: 'formatoItens', ...body}, ADMIN), limite]); } finally { clearTimeout(t); }
  };
  return {chamadas, chamar, fechar};
}
const json = (res, status, corpo) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(corpo)); };
const segurarCorpo = res => { res.writeHead(201, {'Content-Type': 'application/json'}); res.write('{"data":'); /* e o resto nunca chega */ };
const numeroDa = url => (/\/numero\/(\d+)/.exec(url) || [])[1] || '';

test('v144: E, formatoItens: o prazo vale até o corpo inteiro; estourado, devolve as já medidas e lista as outras em naoMedidas', async () => {
  // 1) A 9302 manda os cabeçalhos e segura o corpo; a 9301 e a 9303 respondem.
  let s = await servidorComERP((req, res) => (numeroDa(req.url) === '9302' ? segurarCorpo(res) : json(res, 201, {data: osDoERP(numeroDa(req.url), '2026-09-20')})));
  try {
    const r = await s.chamar({numeros: ['9301', '9302', '9303'], lista: false});
    // Caso ruim: o r.json() da 9302 esperava para sempre, e a função morria no limite sem devolver nada.
    assert.ok(!r.limite, 'a função responde antes do limite de 150 s');
    assert.equal(r.status, 200);
    assert.deepEqual(r.os.map(o => o.numero), ['9301', '9303']);
    assert.equal(r.naoMedidas.length, 1);
    assert.equal(r.naoMedidas[0].numero, '9302');
    assert.match(r.naoMedidas[0].motivo, /o ERP \(Mubisys\) nao respondeu em 30s/);
  } finally { s.fechar(); }
  // 2) A lista do dia também segura o corpo: a O.S. sai medida pela busca por número, com o motivo da lista.
  s = await servidorComERP((req, res) => (numeroDa(req.url) ? json(res, 201, {data: osDoERP(numeroDa(req.url), '2026-09-20')}) : segurarCorpo(res)));
  try {
    const r = await s.chamar({numeros: ['9311']});
    assert.ok(!r.limite, 'a função responde antes do limite de 150 s');
    assert.equal(r.os.length, 1);
    assert.match(r.os[0].lista.motivo, /^a lista do dia do cadastro falhou: o ERP \(Mubisys\) nao respondeu em \d+s$/);
    assert.deepEqual(r.naoMedidas, []);
  } finally { s.fechar(); }
  // 3) Só a primeira responde; as outras seguram: estourado o prazo total, a medida volta e as outras vão para naoMedidas.
  s = await servidorComERP((req, res) => (numeroDa(req.url) === '9321' ? json(res, 201, {data: osDoERP('9321', '2026-09-20')}) : segurarCorpo(res)));
  try {
    const numeros = Array.from({length: 10}, (_, i) => String(9321 + i));
    const r = await s.chamar({numeros, lista: false});
    assert.ok(!r.limite, 'a função responde antes do limite de 150 s');
    assert.deepEqual(r.os.map(o => o.numero), ['9321']);
    assert.deepEqual(r.naoMedidas.map(o => o.numero), numeros.slice(1), 'todas as outras, nenhuma perdida');
    const motivos = r.naoMedidas.map(o => o.motivo);
    assert.ok(motivos.some(m => /nao respondeu em 30s/.test(m)), 'as que seguraram o corpo');
    assert.ok(motivos.some(m => m === 'o tempo acabou: peça de novo só as que faltaram'), 'as que ficaram para pedir de novo');
    assert.ok(motivos.every(m => /nao respondeu em 30s|^o tempo acabou/.test(m)));
  } finally { s.fechar(); }
});

test('v144: F, formatoItens: o primeiro 429 do ERP para tudo, sem repetir, e devolve o que já mediu com o motivo', async () => {
  const CALMA = 'o ERP pediu para esperar (HTTP 429); peça de novo mais tarde';
  const numeros = Array.from({length: 10}, (_, i) => String(9401 + i));
  const diaDe = n => '2026-09-' + String(10 + Number(n) - 9401).padStart(2, '0');   // dez dias diferentes: dez listas
  // 1) A lista do dia responde 429.
  let s = await servidorComERP((req, res) => (numeroDa(req.url) ? json(res, 201, {data: osDoERP(numeroDa(req.url), diaDe(numeroDa(req.url)))}) : json(res, 429, {message: 'Too Many Attempts.'})));
  try {
    const r = await s.chamar({numeros});
    assert.ok(!r.limite, 'a função responde antes do limite de 150 s');
    // Caso ruim: cada lista repetia o 429 quatro vezes (1,5 s, 3 s e 4,5 s), 50 chamadas em 90 s.
    assert.equal(s.chamadas.length, 2, 'a busca da 9401 e a lista do dia dela, e nada mais: ' + s.chamadas.join(' '));
    assert.deepEqual(r.os.map(o => o.numero), ['9401'], 'a já medida pela busca por número volta');
    assert.equal(r.os[0].lista.motivo, 'a lista do dia do cadastro falhou: ' + CALMA);
    assert.deepEqual(r.naoMedidas, numeros.slice(1).map(numero => ({numero, motivo: CALMA})));
  } finally { s.fechar(); }
  // 2) A busca por número responde 429 na segunda O.S.
  s = await servidorComERP((req, res) => (numeroDa(req.url) === '9402' ? json(res, 429, {message: 'Too Many Attempts.'}) : json(res, 201, {data: osDoERP(numeroDa(req.url), '2026-09-20')})));
  try {
    const r = await s.chamar({numeros, lista: false});
    assert.ok(!r.limite);
    assert.equal(s.chamadas.length, 2, 'a 9401 e a 9402, e nada mais: ' + s.chamadas.join(' '));
    assert.deepEqual(r.os.map(o => o.numero), ['9401']);
    assert.deepEqual(r.naoMedidas, numeros.slice(1).map(numero => ({numero, motivo: CALMA})));
  } finally { s.fechar(); }
});
