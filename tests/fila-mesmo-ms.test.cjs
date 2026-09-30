/* Fila do aparelho: gravações da mesma O.S. no mesmo milissegundo. Bancada da
   E4 (tests/ficha-entregas.test.cjs): a tela (app.js) com o store de verdade
   (store.js), falando com o pcp-sync de verdade (helpers/edge.cjs), num DOM de
   mentira. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const motorServidor = () => import(require('node:url').pathToFileURL(path.join(RAIZ, 'supabase/functions/_shared/pcp-entrega-item.mjs')).href);
const integridade = () => import(require('node:url').pathToFileURL(path.join(RAIZ, 'supabase/functions/_shared/pcp-integridade.mjs')).href);

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('olga-f', 'Olga Balcão', 'operacao1', '12312312312'),
];
const GESTOR = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const OPERACAO_C = {papel:'operacao', nome:'Olga Balcão', sub:'operacao1'};
const ITENS = () => [
  {uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10', valorUnit:'1234.56', subtotal:'12345.6'},
  {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1', valorUnit:'500', subtotal:'500'},
  {uid:'8101:3:1', item:'3', descricao:'Totem - evento de sábado na praça', qtde:'2', valorUnit:'300', subtotal:'600'},
  {uid:'8101:4:1', item:'4', descricao:'Servicos de instalação', qtde:'1', valorUnit:'200', subtotal:'200'},
];
// A O.S. externa com o checklist completo: só falta finalizar.
const pronta = (extra = {}) => ({numero:'8101', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'],
  liberadoPCP:true, confirmacao:'Confirmado', embarqueConferidoPor:'Gestor Teste', produtosConferidosPor:'Gestor Teste',
  ferramentasConferidas:true, carroLiberado:true, horaSaida:'08:00', saidaEm:'2026-09-29T11:00:00.000Z',
  instalacaoOK:true, conferidoPor:'Gestor Teste', fotosCheckinIds:['foto-saida'], fotosRetornoIds:['foto-volta'],
  retornoEm:'2026-09-29T19:00:00.000Z', horaRetorno:'16:00', valorTotal:9999.99, itens:ITENS(), ...extra});
const row = (id, registro, rev = 1) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev, atualizadoEm:'2026-09-19T10:00:00.000Z', ...registro}});
const marca = (id, tipo, qtde, extra = {}) => ({id, tipo, ...(qtde ? {qtde} : {}), dia:'2026-09-20', via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-20T12:00:00Z', ...extra});
const comMarcas = (itens, uid, lista) => itens.map(it => it.uid === uid ? {...it, entregas:lista} : it);
const gravada = (e, id = '1') => js(e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro);
const marcasDe = (os, uid) => ((os.itens || []).find(i => i.uid === uid) || {}).entregas || [];
const resumo = lista => lista.map(m => [m.tipo, m.qtde ?? null]);

/* DOM de mentira: o que a tela procura pelo seletor devolve um nó que guarda
   o que recebe; os blocos da ficha e os diálogos são observáveis. */
function domFalso() {
  const porId = new Map(), nos = new Map();
  let blocos = [];
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add(){}, remove(){}, toggle(){}, contains:() => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
    querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const body = el('body');
  const doc = {activeElement:null, body, addEventListener() {},
    querySelector:sel => no(sel), querySelectorAll:sel => sel === '#modal-os .card-fs' ? blocos : [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)};
  return {doc, no, porId, blocos:() => blocos, setBlocos:b => { blocos = b; }};
}

async function bancada({registros = [], lista = null, papel = 'pcp', cracha = GESTOR, e = null} = {}) {
  e = e || await edge('pcp-sync', {pcp_registros:registros, registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}], equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
  const inicial = lista || e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [], respostas = [];
  let quem = cracha;
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => respostas.length ? respostas.shift() : true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  const nome = cracha && cracha.nome ? cracha.nome : 'Gestor Teste';
  run(`STATE.user = {nome:${JSON.stringify(nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = m => __toasts.push([m, 'desfazer']);`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, ctx, run, d, toasts, respostas, esvaziar, json:c => JSON.parse(run(`JSON.stringify(${c})`)), setCracha:c => { quem = c; },
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
// Um botão da coluna Entrega como a tela desenha (o handler lê o dataset).
const botao = (acao, uid, ient) => ({dataset:{entAcao:acao, iuid:uid, ient:String(ient)}});


/* A MESMA O.S. GRAVADA DUAS VEZES NO MESMO MILISSEGUNDO. Marcar "Entregar
   tudo" e desfazer em seguida (ou dois toques rápidos) levam o mesmo
   atualizadoEm; o _removeFromQueue, que só olhava o relógio, tirava a segunda
   gravação da fila junto com a primeira, e o "desfeito" nunca chegava ao
   servidor (achado da revisão da E4, 30/09/2026). A senha `fila` de cada
   gravação desempata. */
for (const mesmoMs of [true, false]) test('revisão: duas gravações da mesma O.S. no mesmo milissegundo chegam as duas ao servidor (mesmo ms=' + mesmoMs + ')', async () => {
  const b = await bancada({registros:[row('1', pronta())]});
  if (mesmoMs) b.run("nowISO = () => '2026-09-30T12:00:00.000Z'");
  b.abrir('1');
  assert.equal(b.run("executarEntregaItem('tudo', '8101:2:1', '1')"), '');
  assert.equal(b.run("executarEntregaItem('desfazer', '8101:2:1', '1', {motivo:'Marquei no item errado'})"), '');
  await b.esvaziar();
  assert.deepEqual(resumo(marcasDe(gravada(b.e), '8101:2:1')), [['entregue', 1], ['desfeito', null]]);
  assert.equal(b.S.getQueue().length, 0, 'nada preso na fila');
});
