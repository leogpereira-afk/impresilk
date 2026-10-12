/* A FICHA DA GESTÃO NUM VM (onda operação): o store, a operação, o motor,
   a divisão, as regras, a conferência e o app.js de verdade, falando com o
   pcp-sync de verdade (helpers/edge.cjs). O mesmo arranjo de
   tests/retrabalho-instalacao-revisao.test.cjs, para outros testes usarem.
   Tudo fictício: o repositório é público. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('./lote-bancada.cjs');
const {edge, osRow, FICHAS, GESTOR, js} = B;
const RAIZ = path.join(__dirname, '..', '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const longe = q => ({...q, exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)});
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add() {}, remove() {}, toggle() {}, contains:() => false},
    setAttribute() {}, getAttribute() {}, focus() {}, addEventListener() {}, remove() {}, querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  return {doc:{activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)}, porId};
}
async function telaFicha(lista, quem = GESTOR, hoje = '2026-11-12') {
  const e = await edge('pcp-sync', {pcp_registros:lista.map(osRow), registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), longe(quem)); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'divisao.js', 'regras.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = []; ctx.__repintou = 0;
  run(`STATE.user = {nome:${JSON.stringify(quem.nome)}, papel:${JSON.stringify(quem.papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; reRenderModalKeepOpen = () => { __repintou++; }; toast = (m, t) => __toasts.push([m, t]);
    var versoesRegrasCasa = () => [];
    hojeISO = () => ${JSON.stringify(hoje)};`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, ctx, esvaziar, json:c => js(run(c)),
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
module.exports = {telaFicha, domFalso};
