/* REVISÃO DA E5 (30/09/2026): os defeitos que as duas revisões adversariais
   acharam na entrega declarada pelo celular, cada teste começando pelo caso
   ruim. As correções foram decididas pelo dono:
     D1  o Instalado fechava o problema aberto pela gestão (o retido ia a 0)
     D2  a fila do celular esvaziada por quem tem senha tirava o "declarado"
     D3  finalizar pelo celular sem tocar nos itens dava tudo CONFERIDO
         (implícito), e tocar em cada item dava tudo declarado; a montagem
         com senha, pelo card, também
     D4  o dia da declaração não tinha piso (2020 entrava) e o relógio
         adiantado perdia a marca
     D5  o celular marcava "retirado" numa O.S. externa
     cache misto: equipe.js novo com o motor da v139 dava erro vermelho no
         Instalado e travava o Finalizar
     montagem: o diálogo e o aviso diziam "marcar" para quem só declara
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const D = require('../entrega-item.js');
const root = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const servidor = async () => (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const copias = async () => [['aparelho', D], ['servidor', await servidor()]];
const FRASE_PROBLEMA = 'Este item está com problema marcado pela gestão; fale com o PCP.';

const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now()), ONTEM = diaSP(Date.now() - 864e5);

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bruno-f', 'Bruno Fictício', 'bruno', '10000222222'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('oper-f', 'Operador Teste', 'oper', '12312312312'),
];
const ITENS = () => [
  {uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10', valorUnit:'100', subtotal:'1000'},
  {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1', valorUnit:'500', subtotal:'500'},
  {uid:'8101:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', valorUnit:'200', subtotal:'200'},
];
// O que o servidor exige para finalizar a O.S. externa: a foto do serviço pronto e o retorno.
const PROVA = {fotosCheckinIds:['c1'], fotosRetornoIds:['r1'], horaSaida:'08:00', horaRetorno:'15:00', retornoEm:HOJE + 'T15:00:00'};
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
const base = (extra = {}) => row('1', {numero:'8101', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001', '100002'],
  liberadoPCP:true, confirmacao:'Confirmado', valorTotal:'1700', itens:ITENS(), ...extra});
const banco = (regs = [base()]) => ({pcp_registros:regs, registros:structuredClone(FICHAS),
  pcp_config_global:[{id:true, config:{instaladores:['Ana', 'Bruno']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const oper = {papel:'operacao', nome:'Operador Teste', sub:'oper'};
const ana = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const entregas = (e, uid) => (gravada(e).itens.find(i => i.uid === uid) || {}).entregas || [];
async function doCelular(e, quem = ana) {
  const r = await e.call({action:'list', escopo:'abertas'}, quem);
  return structuredClone(r.os.find(o => o.id === '1'));
}
function comMarca(os, uid, ...eventos) {
  const o = structuredClone(os);
  const it = o.itens.find(i => i.uid === uid);
  it.entregas = [...(it.entregas || []), ...eventos];
  return o;
}
const ev = (id, tipo, extra = {}) => ({id, tipo, dia:HOJE, ...extra});
// O celular finaliza (o Finalizar do equipe.js grava finalizadaEm e o nome de quem está no crachá).
const finalizar = (os, por = 'Ana') => Object.assign(structuredClone(os), {finalizadaEm:new Date().toISOString(), finalizadoPor:por});

/* O celular de verdade (equipe.js) num DOM de mentira. `motor`: o texto do
   entrega-item.js a carregar (false = sem motor). */
function celular(os, {motor = ler('entrega-item.js'), confirmar = true} = {}) {
  const nodes = new Map(), toasts = [], salvas = [];
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:() => [], setAttribute(){},
      classList:{toggle(){}, add(){}, remove(){}}, focus(){}});
    return nodes.get(sel);
  }
  const ctx = vm.createContext({console, Date, crypto:webcrypto, document:{querySelector:node, querySelectorAll:() => [], addEventListener(){}}, window:{},
    localStorage:{getItem:() => null, setItem(){}},
    STORE:{getCFG:() => ({}), getAllOS:() => [], getOS:() => null, getQueue:() => [], pullPhoto:async () => null,
      saveOS:o => salvas.push(JSON.parse(JSON.stringify(o))), carimbarMomento(){}},
    setTimeout(){}, mostrarCelebracao(){}, confirm:m => { toasts.push('?' + m); return confirmar; }});
  vm.runInContext(ler('operacao.js'), ctx);
  if (motor) vm.runInContext(motor, ctx);
  vm.runInContext(ler('equipe.js'), ctx);
  vm.runInContext('toast=(m,t)=>__toasts.push(m); fraseAleatoria=()=>""; EQ.instalador="Ana";', Object.assign(ctx, {__toasts:toasts}));
  ctx.__os = os;
  vm.runInContext('_draft=__os; EQ.modalId=__os.id; renderModal()', ctx);
  return {html:() => node('#modal-os').innerHTML, node, toasts, salvas, run:c => vm.runInContext(c, ctx), draft:() => JSON.parse(vm.runInContext('JSON.stringify(_draft)', ctx))};
}
const naRua = (extra = {}) => ({id:'1', numero:'8101', tipo:'externo', equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado', rev:3,
  instalacao:{data:HOJE, periodo:'Manhã'}, ...PROVA, instalacaoOK:true,
  itens:[{uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10'}, {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1'},
    {uid:'8101:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1'}], ...extra});

// A ficha da gestão (app.js) sem store, para os selos e as ações do item.
function gestao(papel = 'pcp') {
  const ctx = vm.createContext({console, Date, document:{querySelector:() => ({innerHTML:'', classList:{toggle(){}, add(){}, remove(){}}, setAttribute(){}}), querySelectorAll:() => [], addEventListener(){}},
    window:{}, localStorage:{getItem:() => null}, STORE:{getAllOS:() => [], getCFG:() => ({}), getOS:() => null}, setTimeout(){}});
  for (const f of ['operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx);
  vm.runInContext(`STATE.user = {nome:'Fulano Teste', papel:${JSON.stringify(papel)}};`, ctx);
  return code => vm.runInContext(code, ctx);
}

// A tela (app.js) com o store de verdade falando com o pcp-sync de verdade, num DOM de mentira.
const MONTAGEM = {papel:'montagem', nome:'Conta Montagem', sub:'montagem1'};
const pronta = (extra = {}) => ({numero:'8101', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'],
  liberadoPCP:true, confirmacao:'Confirmado', embarqueConferidoPor:'Gestor Teste', produtosConferidosPor:'Gestor Teste',
  ferramentasConferidas:true, carroLiberado:true, horaSaida:'08:00', saidaEm:'2026-09-29T11:00:00.000Z',
  instalacaoOK:true, conferidoPor:'Gestor Teste', fotosCheckinIds:['foto-saida'], fotosRetornoIds:['foto-volta'],
  retornoEm:'2026-09-29T19:00:00.000Z', horaRetorno:'16:00', valorTotal:1700, itens:ITENS(), ...extra});
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add(){}, remove(){}, toggle(){}, contains:() => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
    querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const doc = {activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)};
  return {doc, porId};
}
async function bancada({registros = [], papel = 'pcp', cracha = gestor} = {}) {
  const e = await edge('pcp-sync', {pcp_registros:registros, registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}], equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [];
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), cracha); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:${JSON.stringify(cracha.nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = (m, fn) => { __toasts.push([m, 'desfazer']); __desfazer = fn; };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, run, d, toasts, esvaziar};
}

/* ═════════════ D1: a declaração não fecha o problema da gestão ═════════════ */

test('revisão: D1 o Instalado do celular num item com problema aberto pela gestão é descartado com a frase, 200, e o problema e o retido ficam', async () => {
  const e = await edge('pcp-sync', banco());
  const g = structuredClone(gravada(e));
  g.itens[1].entregas = [ev('e-prob', 'problema', {motivo:'Peça veio riscada, não entregar'})];
  await e.call({action:'upsert', os:g}, gestor);
  const retidoAntes = D.lancamentosDaOS(gravada(e)).retido;
  assert.ok(retidoAntes > 0);
  // Caso ruim: o instalador toca Instalado no item que a gestão segurou.
  const r = await e.call({action:'upsert', os:comMarca(await doCelular(e), '8101:2:1', ev('e-t-ok', 'entregue', {qtde:1}))}, ana);
  assert.equal(r.status, 200, 'nunca 422: a fila do celular não prende');
  const os = gravada(e);
  assert.equal(D.situacaoItem(os.itens[1], os).situacao, 'problema', 'a declaração não fechou o problema');
  assert.deepEqual(entregas(e, '8101:2:1').map(m => m.id), ['e-prob']);
  assert.equal(D.lancamentosDaOS(os).retido, retidoAntes, 'o saldo segue retido');
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => [x.id, x.uid, x.motivo]), [['e-t-ok', '8101:2:1', FRASE_PROBLEMA]]);
  // A gestão entrega e fecha o problema, como sempre.
  const g2 = structuredClone(gravada(e));
  g2.itens[1].entregas = [...g2.itens[1].entregas, ev('e-g-ok', 'entregue', {qtde:1})];
  await e.call({action:'upsert', os:g2}, gestor);
  assert.equal(D.situacaoItem(gravada(e).itens[1], gravada(e)).situacao, 'entregue');
});

test('revisão: D1 motor (as duas cópias): declaração com problema aberto é recusada, também a da fila do celular enviada pela gestão; a declaração antiga com dia depois do problema não o fecha', async () => {
  for (const [nome, E] of await copias()) {
    const it = () => ({uid:'u', item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000',
      entregas:[{id:'p1', tipo:'problema', dia:'2026-09-29', motivo:'riscada', via:'gestao'}]});
    // Caso ruim: o celular (crachá sem senha e montagem com senha) declarava por cima do problema.
    for (const papel of ['toque', 'montagem']) {
      const v = E.validarEvento({id:'t1', tipo:'entregue', qtde:2, dia:'2026-09-30'}, it(), {papel, os:{}, hoje:'2026-09-30'});
      assert.deepEqual([v.ok, v.erro], [false, FRASE_PROBLEMA], `${nome}: ${papel}`);
    }
    const fila = E.validarEvento({id:'t2', tipo:'entregue', qtde:2, dia:'2026-09-30', via:'toque', declarado:true}, it(), {papel:'pcp', os:{}, hoje:'2026-09-30'});
    assert.deepEqual([fila.ok, fila.erro], [false, FRASE_PROBLEMA], `${nome}: a fila do celular pela gestão`);
    // A entrega da gestão (conferida) passa e fecha.
    const g = E.validarEvento({id:'g1', tipo:'entregue', qtde:2, dia:'2026-09-30'}, it(), {papel:'pcp', os:{}, hoje:'2026-09-30'});
    assert.equal(g.ok, true, nome);
    const fechado = it(); fechado.entregas.push(g.evento);
    assert.equal(E.situacaoItem(fechado, {}).situacao, 'parcial', `${nome}: a gestão fecha o problema`);
    // A declaração gravada antes do problema, com dia depois dele (a gestão apontou o problema com dia anterior), não fecha.
    const velho = {uid:'u', item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000', entregas:[
      {id:'d1', tipo:'entregue', qtde:4, dia:'2026-09-30', via:'toque', declarado:true},
      {id:'p1', tipo:'problema', dia:'2026-09-29', motivo:'riscada', via:'gestao'}]};
    assert.equal(E.situacaoItem(velho, {}).situacao, 'problema', `${nome}: a declaração não fecha o problema`);
    const L = E.lancamentosDaOS({valorTotal:'1000', itens:[velho]});
    assert.deepEqual([L.declarado, L.retido, L.entregue], [40000, 60000, 0], nome);
  }
});

test('revisão: D1 celular: o item com problema aberto não oferece Entregar parte, e o Instalado não declara e diz a frase', () => {
  const os = naRua();
  os.itens[0].entregas = [{id:'e-g4', tipo:'entregue', qtde:4, dia:HOJE, via:'gestao', por:'Gestor Teste'},
    {id:'e-p1', tipo:'problema', dia:HOJE, motivo:'placa trincada, refazer', via:'gestao', por:'Gestor Teste'}];
  const t = celular(os);
  // Caso ruim: "Entregar parte" aparecia no item que a gestão segurou.
  assert.doesNotMatch(t.html(), /data-iparte="0"/, 'item com problema não oferece Entregar parte');
  assert.match(t.html(), /Com problema de entrega: placa trincada, refazer\. Fale com o PCP\./);
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const it = t.draft().itens[0];
  assert.deepEqual(it.entregas.map(m => m.id), ['e-g4', 'e-p1'], 'nada declarado');
  assert.equal(D.situacaoItem(it, t.draft()).situacao, 'problema');
  assert.equal(t.toasts.at(-1), FRASE_PROBLEMA);
  // O item sem problema continua declarando.
  t.run(`marcarStatusItem(1, '8101:2:1', 'ok')`);
  assert.deepEqual(t.draft().itens[1].entregas.map(m => [m.tipo, m.qtde, m.declarado]), [['entregue', 1, true]]);
});

test('revisão: D1 ficha da montagem com senha: o item com problema aberto não oferece Entregar; a gestão continua podendo', () => {
  const os = {id:'1', numero:'8101', tipo:'externo', itens:[{uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10',
    entregas:[{id:'e-p1', tipo:'problema', dia:HOJE, motivo:'placa trincada', via:'gestao', por:'Gestor Teste'}]}]};
  const acoes = papel => gestao(papel)(`(() => { const os = ${JSON.stringify(os)}; return acoesEntregaDoItem(os.itens[0], os); })()`);
  // Caso ruim: a montagem via "Entregar tudo" e "Entregar parte", e o servidor recusaria.
  assert.deepEqual([...acoes('montagem')], []);
  assert.deepEqual([...acoes('pcp')], ['tudo', 'parte', 'cancelar', 'desfazer']);
});

/* ═════════════ D2: a fila do celular esvaziada com senha segue declarada ═════════════ */

test('revisão: D2 a fila do celular esvaziada pelo balcão ou pela gestão segue DECLARADA, com o autor do envio; nada vira entregue conferido', async () => {
  for (const [quem, via, por, porId] of [[oper, 'balcao', 'Operador Teste', '123123'], [gestor, 'gestao', 'Gestor Teste', '111222']]) {
    const e = await edge('pcp-sync', banco());
    // A marca do celular com a bandeira, e a que só tem o via do celular.
    const cel = comMarca(comMarca(await doCelular(e), '8101:1:1', ev('e-q1', 'entregue', {qtde:10, via:'toque', declarado:true, por:'Ana'})),
      '8101:2:1', ev('e-q2', 'entregue', {qtde:1, via:'toque'}));
    const r = await e.call({action:'upsert', os:cel}, quem);
    assert.equal(r.status, 200);
    // Caso ruim: a marca virava entregue conferido por quem só esvaziou a fila.
    const [m] = entregas(e, '8101:1:1');
    assert.deepEqual([m.via, m.declarado, m.por, m.porId], [via, true, por, porId], `${via}: o autor é o do envio, e a marca segue declarada`);
    assert.equal(entregas(e, '8101:2:1')[0].declarado, true, `${via}: via 'toque' sem a bandeira também`);
    const L = D.lancamentosDaOS(gravada(e));
    assert.equal(L.entregue, 0, `${via}: nada virou entregue conferido`);
    assert.equal(L.declarado, L.total, via);
  }
  // O aparelho só REBAIXA: a marca da própria gestão com declarado:false continua conferida.
  const e = await edge('pcp-sync', banco());
  const g = structuredClone(gravada(e));
  g.itens[0].entregas = [ev('e-g10', 'entregue', {qtde:10, declarado:false, via:'gestao'})];
  await e.call({action:'upsert', os:g}, gestor);
  assert.equal(entregas(e, '8101:1:1')[0].declarado, undefined);
  assert.ok(D.lancamentosDaOS(gravada(e)).entregue > 0);
});

/* ═════════════ D3: finalizar pelo celular é declaração ═════════════ */

test('revisão: D3 o celular finaliza sem tocar em Instalado: o implícito sai DECLARADO, igual a quem tocou em cada item, com o carimbo do servidor', async () => {
  // Caso ruim: finalizar sem tocar dava tudo entregue conferido.
  const e = await edge('pcp-sync', banco([base(PROVA)]));
  const semTocar = finalizar(await doCelular(e));
  let r = await e.call({action:'upsert', os:semTocar}, ana);
  assert.equal(r.status, 200);
  const os = gravada(e);
  assert.ok(os.finalizadaEm, 'finalizou');
  const LB = D.lancamentosDaOS(os);
  assert.equal(LB.entregue, 0, 'nada entregue conferido');
  assert.equal(LB.declarado, LB.total);
  assert.deepEqual(LB.lancamentos, []);
  assert.deepEqual(LB.declaracoes.map(l => [l.tipo, l.declarado]), [['implicito', true], ['implicito', true], ['servico', true]]);
  // O carimbo é do servidor: o crachá, o ID do RH e a finalização a que ele se refere.
  const c = os.finalizadaPorCampo;
  assert.deepEqual([c.finalizadaEm, c.por, c.porId], [os.finalizadaEm, 'Ana', '100001']);
  assert.ok(Number.isFinite(Date.parse(c.em)));
  // O diário registra quem finalizou pelo celular.
  const diario = e.db.pcp_registros.filter(x => x.colecao === 'auditoria').map(x => x.registro);
  assert.ok(diario.some(d => d.campos.includes('finalizadaPorCampo')), 'o carimbo entra no diário');
  // O instalador cuidadoso: Instalado em cada item e Finalizar. O mesmo resultado.
  const e2 = await edge('pcp-sync', banco([base(PROVA)]));
  const tocou = finalizar(comMarca(comMarca(await doCelular(e2), '8101:1:1', ev('e-a1', 'entregue', {qtde:10})), '8101:2:1', ev('e-a2', 'entregue', {qtde:1})));
  r = await e2.call({action:'upsert', os:tocou}, ana);
  assert.equal(r.status, 200);
  const LA = D.lancamentosDaOS(gravada(e2));
  assert.deepEqual([LA.entregue, LA.declarado], [LB.entregue, LB.declarado], 'tocar ou não tocar dá o mesmo');
});

test('revisão: D3 reabrir e finalizar pela gestão confere; o Desfazer do reabrir devolve a finalização do celular (declarada); a finalização só da gestão continua conferida', async () => {
  // Caso ruim: a finalização do celular devolvida pelo Desfazer do reabrir contava conferida.
  const e = await edge('pcp-sync', banco([base(PROVA)]));
  await e.call({action:'upsert', os:finalizar(await doCelular(e))}, ana);
  const T1 = gravada(e).finalizadaEm, carimbo = structuredClone(gravada(e).finalizadaPorCampo);
  let g = structuredClone(gravada(e)); g.finalizadaEm = ''; g.finalizadoPor = '';
  await e.call({action:'upsert', os:g}, gestor);                    // Reabrir
  assert.equal(gravada(e).finalizadaEm, '');
  assert.deepEqual(gravada(e).finalizadaPorCampo, carimbo, 'reabrir não apaga o carimbo');
  g = structuredClone(gravada(e)); g.finalizadaEm = T1; g.finalizadoPor = 'Ana';
  await e.call({action:'upsert', os:g}, gestor);                    // Desfazer do reabrir
  let L = D.lancamentosDaOS(gravada(e));
  assert.deepEqual([L.entregue, L.declarado], [0, L.total], 'a finalização é a do celular: declarada');
  // A gestão reabre e finaliza de novo: a finalização é dela, e confere.
  g = structuredClone(gravada(e)); g.finalizadaEm = ''; g.finalizadoPor = '';
  await e.call({action:'upsert', os:g}, gestor);
  g = structuredClone(gravada(e)); g.finalizadaEm = new Date(Date.now() + 1000).toISOString(); g.finalizadoPor = 'Gestor Teste';
  await e.call({action:'upsert', os:g}, gestor);
  L = D.lancamentosDaOS(gravada(e));
  assert.deepEqual([L.entregue, L.declarado], [L.total, 0], 'a finalização da gestão confere');
  assert.equal(gravada(e).finalizadaPorCampo.finalizadaEm, T1, 'o carimbo antigo fica, sem efeito');
  // Finalização só da gestão: sem carimbo, implícito conferido, como antes.
  const e2 = await edge('pcp-sync', banco([base(PROVA)]));
  g = structuredClone(gravada(e2)); g.finalizadaEm = new Date().toISOString(); g.finalizadoPor = 'Gestor Teste';
  const r = await e2.call({action:'upsert', os:g}, gestor);
  assert.equal(r.status, 200);
  assert.equal(gravada(e2).finalizadaPorCampo, undefined);
  L = D.lancamentosDaOS(gravada(e2));
  assert.deepEqual([L.entregue, L.declarado], [L.total, 0]);
});

test('revisão: D3 o carimbo finalizadaPorCampo é do servidor: a gestão e o celular não o forjam, a aba que não o conhece não o apaga, e o ID não desce ao celular', async () => {
  // Caso ruim: a gestão finaliza e manda o carimbo pronto (o aparelho escolheria declarado ou conferido).
  const e = await edge('pcp-sync', banco([base(PROVA)]));
  const T = new Date().toISOString();
  let g = structuredClone(gravada(e));
  Object.assign(g, {finalizadaEm:T, finalizadoPor:'Gestor Teste', finalizadaPorCampo:{finalizadaEm:T, por:'Ana', porId:'100001', em:T}});
  await e.call({action:'upsert', os:g}, gestor);
  assert.equal(gravada(e).finalizadaPorCampo, undefined, 'o carimbo da gestão não entra');
  assert.equal(D.lancamentosDaOS(gravada(e)).declarado, 0);
  // O celular manda outro autor no carimbo: fica o do crachá.
  const e2 = await edge('pcp-sync', banco([base(PROVA)]));
  const cel = finalizar(await doCelular(e2));
  cel.finalizadaPorCampo = {finalizadaEm:'2020-01-01T00:00:00.000Z', por:'Gestor Teste', porId:'111222', em:'x'};
  await e2.call({action:'upsert', os:cel}, ana);
  const carimbo = structuredClone(gravada(e2).finalizadaPorCampo);
  assert.deepEqual([carimbo.finalizadaEm, carimbo.por, carimbo.porId], [gravada(e2).finalizadaEm, 'Ana', '100001']);
  // A aba antiga (sem o campo), o null explícito da gestão e o do balcão não apagam.
  for (const [quem, mexe] of [[gestor, o => { delete o.finalizadaPorCampo; o.obsPCP = 'aba antiga'; }], [gestor, o => { o.finalizadaPorCampo = null; }],
    [oper, o => { o.finalizadaPorCampo = {finalizadaEm:'', por:'', porId:'', em:''}; }]]) {
    g = structuredClone(gravada(e2)); mexe(g);
    const r = await e2.call({action:'upsert', os:g}, quem);
    assert.equal(r.status, 200);
    assert.deepEqual(gravada(e2).finalizadaPorCampo, carimbo, `${quem.papel}: o carimbo fica`);
  }
  // O ID de quem finalizou não desce para o celular nem para a montagem; o nome desce.
  const {podarToque, podarCarimbosF15} = await regras();
  for (const podar of [podarToque, podarCarimbosF15]) {
    const p = podar(structuredClone(gravada(e2)));
    assert.equal(p.finalizadaPorCampo.porId, undefined);
    assert.equal(p.finalizadaPorCampo.por, 'Ana');
    assert.equal(p.finalizadaPorCampo.finalizadaEm, gravada(e2).finalizadaEm, 'a montagem com senha lê a mesma declaração');
  }
});

test('revisão: D3 motor (as duas cópias): o carimbo da mesma finalização declara o implícito e o serviço; outra finalização, a entrega lançada e a baixa do ERP não', async () => {
  const T = '2026-09-30T18:00:00.000Z';
  const osF = (extra = {}) => ({id:'x', valorTotal:'1700', finalizadaEm:T, finalizadoPor:'Ana', itens:ITENS(), ...extra});
  const doCampo = {finalizadaPorCampo:{finalizadaEm:T, por:'Ana', porId:'100001', em:T}};
  for (const [nome, E] of await copias()) {
    // Caso ruim: o implícito da finalização do celular saía entregue conferido.
    assert.deepEqual(E.entregaImplicita(osF(doCampo)), {dia:'2026-09-30', fonte:'finalizada', marca:'implicito', declarado:true}, nome);
    const L = E.lancamentosDaOS(osF(doCampo));
    assert.deepEqual([L.entregue, L.declarado, L.total], [0, 170000, 170000], nome);
    assert.equal(L.entregue + L.declarado + L.saldo + L.cancelado + L.retido + L.semItem, L.total, `${nome}: a conta fecha`);
    assert.equal(E.situacaoItem(osF(doCampo).itens[2], osF(doCampo)).declarado, 1, `${nome}: o serviço vai declarado`);
    // Só serviço: declarado também.
    const soServico = osF({...doCampo, itens:[ITENS()[2]]});
    assert.deepEqual([E.lancamentosDaOS(soServico).entregue, E.lancamentosDaOS(soServico).declarado], [0, 170000], nome);
    // Outra finalização (a gestão reabriu e finalizou): conferido.
    assert.deepEqual(E.entregaImplicita(osF({finalizadaPorCampo:{...doCampo.finalizadaPorCampo, finalizadaEm:'2026-09-29T18:00:00.000Z'}})),
      {dia:'2026-09-30', fonte:'finalizada', marca:'implicito'}, nome);
    for (const lixo of [null, 'x', [], {}, {finalizadaEm:''}]) assert.equal(E.lancamentosDaOS(osF({finalizadaPorCampo:lixo})).declarado, 0, `${nome}: ${JSON.stringify(lixo)}`);
    // Entrega lançada à mão pela gestão vale mais que o carimbo: conferida.
    assert.equal(E.lancamentosDaOS(osF({...doCampo, entregaLancada:{data:'2026-09-29'}})).entregue, 170000, nome);
    // Baixa do ERP: segue 'sem prova', conferida como antes.
    const erp = {finalizadaEm:T, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:T, status:'ENTREGUE'}};
    assert.equal(E.lancamentosDaOS(osF({...doCampo, ...erp})).entregue, 170000, nome);
  }
});

test('revisão: D3 ficha da gestão: o implícito da finalização do celular mostra "declarado pela equipe na finalização", não "entregue"', () => {
  const run = gestao('pcp');
  const T = new Date().toISOString(), dia = HOJE.slice(8, 10) + '/' + HOJE.slice(5, 7);
  const selo = os => run(`(() => { const os = ${JSON.stringify(os)}; const it = os.itens[1]; return seloEntregaItemHTML(it, ENTREGA_ITEM.situacaoItem(it, os), os); })()`);
  const os = {id:'1', numero:'8101', tipo:'externo', finalizadaEm:T, finalizadoPor:'Ana', itens:ITENS()};
  // Caso ruim: "entregue DD/MM na finalização" do que ninguém conferiu.
  const doCampo = selo({...os, finalizadaPorCampo:{finalizadaEm:T, por:'Ana', porId:'100001', em:T}});
  assert.match(doCampo, new RegExp(`class="ent-selo st-declarado"[^>]*>declarado pela equipe ${dia} na finalização<`));
  assert.doesNotMatch(doCampo, /st-entregue/);
  // A finalização da gestão continua "entregue na finalização".
  assert.match(selo(os), new RegExp(`class="ent-selo st-entregue"[^>]*>entregue ${dia} na finalização<`));
  // O diário da ficha diz quem finalizou pelo celular, sem o ID.
  const hist = run(`htmlHistoricoAlteracoes({entradas:[{acao:'alterar', origem:'toque', em:${JSON.stringify(T)}, autor:{nome:'Ana', papel:'montagem'},
    campos:['finalizadaPorCampo'], antes:{}, depois:{finalizadaPorCampo:{finalizadaEm:${JSON.stringify(T)}, por:'Ana', porId:'100001', em:${JSON.stringify(T)}}}}]})`);
  assert.match(hist, /Finalizada pelo celular \(declarada\)<\/strong>: \(vazio\) → Finalizada em: [^<]*Por: Ana/);
  assert.doesNotMatch(hist, /100001/);
});

test('revisão: D3 montagem com senha finaliza pelo card uma O.S. sem marca: o implícito sai declarado, com o carimbo da conta', async () => {
  const b = await bancada({registros:[row('1', pronta())], papel:'montagem', cracha:MONTAGEM});
  b.run(`perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Conta Montagem', resposta: 'nao'}; cb(); };`);
  // Caso ruim: finalizar pelo card sem marca dava tudo entregue conferido.
  b.run(`finalizarServicoDoCard('1')`);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  const L = D.lancamentosDaOS(g);
  assert.deepEqual([L.entregue, L.declarado], [0, L.total], 'nada entregue conferido');
  assert.deepEqual([g.finalizadaPorCampo?.por, g.finalizadaPorCampo?.finalizadaEm], ['Conta Montagem', g.finalizadaEm], 'o carimbo é da conta que finalizou');
});

/* ═════════════ D4: o dia da declaração tem piso e teto ═════════════ */

test('revisão: D4 o dia da declaração do celular: 2020 e amanhã (relógio adiantado) entram com o dia de hoje; até 30 dias atrás vale', async () => {
  const e = await edge('pcp-sync', banco());
  const AMANHA = diaSP(Date.now() + 864e5), DEZ = diaSP(Date.now() - 10 * 864e5);
  const os = comMarca(await doCelular(e), '8101:1:1', ev('e-2020', 'entregue', {qtde:1, dia:'2020-01-02'}), ev('e-amanha', 'entregue', {qtde:1, dia:AMANHA}),
    ev('e-dez', 'entregue', {qtde:1, dia:DEZ}));
  const r = await e.call({action:'upsert', os}, ana);
  assert.equal(r.status, 200);
  // Caso ruim: o dia de 2020 entrava (a declaração ia para um mês fechado) e a de amanhã era perdida.
  assert.deepEqual(entregas(e, '8101:1:1').map(m => [m.id, m.dia]), [['e-2020', HOJE], ['e-amanha', HOJE], ['e-dez', DEZ]]);
  assert.equal(r.descartado, undefined);
});

test('revisão: D4 motor (as duas cópias): o celular vai de 30 dias atrás a hoje; a gestão continua recusando o dia depois de hoje e pode lançar o antigo', async () => {
  const hoje = '2026-09-30', it = () => ({descricao:'Placa ACM', qtde:'10'});
  for (const [nome, E] of await copias()) {
    const dia = (papel, d) => { const v = E.validarEvento({id:'d1', tipo:'entregue', qtde:1, dia:d}, it(), {papel, os:{}, hoje}); return v.ok ? v.evento.dia : v.erro; };
    // Caso ruim: 2020 entrava pelo crachá sem senha.
    assert.equal(dia('toque', '2020-01-02'), hoje, nome);
    assert.equal(dia('toque', '2026-08-30'), hoje, `${nome}: 31 dias atrás`);
    assert.equal(dia('toque', '2026-08-31'), '2026-08-31', `${nome}: 30 dias atrás vale`);
    assert.equal(dia('montagem', '2026-10-01'), hoje, `${nome}: relógio adiantado`);
    assert.equal(dia('toque', '30/09/2026'), 'Dia da marca inválido.', nome);
    assert.equal(dia('pcp', '2026-10-01'), 'O dia da marca não pode ser depois de hoje.', nome);
    assert.equal(dia('pcp', '2026-08-01'), '2026-08-01', `${nome}: a gestão lança o antigo`);
  }
});

/* ═════════════ D5: o tipo do celular segue o tipo da O.S. ═════════════ */

test('revisão: D5 o celular marca "retirado" numa O.S. externa ou "entregue" numa interna: descartado com aviso; o certo de cada uma grava', async () => {
  const e = await edge('pcp-sync', banco());
  // Caso ruim: a retirada entrava na O.S. de instalação.
  let r = await e.call({action:'upsert', os:comMarca(await doCelular(e), '8101:1:1', ev('e-ret', 'retirado', {qtde:10, retirou:'Fulano'}))}, ana);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8101:1:1'), []);
  assert.deepEqual(r.descartado, ['entregas']);
  assert.match(r.entregasRecusadas[0].motivo, /O\.S\. de instalação o celular só marca "entregue"/);
  const ei = await edge('pcp-sync', banco([base({tipo:'interno'})]));
  r = await ei.call({action:'upsert', os:comMarca(await doCelular(ei), '8101:1:1', ev('e-ent', 'entregue', {qtde:10}), ev('e-ok', 'retirado', {qtde:10}))}, ana);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(ei, '8101:1:1').map(m => [m.id, m.tipo]), [['e-ok', 'retirado']]);
  assert.match(r.entregasRecusadas[0].motivo, /O\.S\. interna o celular só marca "retirado"/);
  // A gestão marca o que precisar.
  for (const [nome, E] of await copias()) {
    assert.equal(E.validarEvento({id:'g', tipo:'retirado', qtde:1, dia:HOJE}, {descricao:'Placa', qtde:'2'}, {papel:'pcp', os:{}, hoje:HOJE}).ok, true, nome);
    assert.equal(E.validarEvento({id:'m', tipo:'retirado', qtde:1, dia:HOJE}, {descricao:'Placa', qtde:'2'}, {papel:'montagem', os:{}, hoje:HOJE}).ok, false, nome);
  }
});

/* ═════════════ Cache misto: equipe.js novo com o motor da v139 ═════════════ */

/* O motor da v139 não conhece o celular: PERMISSOES sem 'toque' e sem
   'montagem' (o resto do arquivo existe). É o que o sw.js serve com o sinal
   fraco quando o equipe.js novo já chegou. */
function motorV139() {
  const novo = ler('entrega-item.js');
  const velho = novo.replace(/\n {2}toque:Object\.freeze\(\['entregue', 'retirado'\]\),\n {2}montagem:Object\.freeze\(\['entregue', 'retirado'\]\),/, '');
  assert.notEqual(velho, novo, 'o motor velho foi montado');
  return velho;
}

test('revisão: cache misto: com o motor da v139 o celular funciona como antes da E5 (sem erro vermelho, sem Entregar parte, e o Finalizar não trava)', () => {
  // Caso ruim: o Instalado dava "Seu acesso (crachá sem senha) não pode marcar" em vermelho.
  const a = celular(naRua(), {motor:motorV139()});
  assert.doesNotMatch(a.html(), /Entregar parte/);
  a.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  assert.equal(a.draft().itens[0].statusInst, 'ok');
  assert.equal(a.draft().itens[0].entregas, undefined);
  assert.ok(!a.toasts.some(m => /não pode marcar/.test(m)), a.toasts.join(' | '));
  // A O.S. com marca da gestão finaliza (antes travava: "Item 2: Seu acesso ... A O.S. não foi finalizada").
  const comMarcaDaGestao = () => { const os = naRua(); os.itens[1].entregas = [{id:'e-g1', tipo:'entregue', qtde:1, dia:HOJE, via:'gestao', por:'Gestor Teste'}]; return os; };
  const b = celular(comMarcaDaGestao(), {motor:motorV139()});
  b.node('#m-finalizar').onclick();
  assert.ok(b.draft().finalizadaEm, b.toasts.join(' | '));
  assert.deepEqual(b.draft().itens.map(i => (i.entregas || []).length), [0, 1, 0], 'nada declarado com o motor velho');
  // Com o motor novo, o mesmo Finalizar declara o saldo.
  const c = celular(comMarcaDaGestao());
  c.node('#m-finalizar').onclick();
  assert.ok(c.draft().finalizadaEm);
  assert.deepEqual(c.draft().itens[0].entregas.map(m => [m.qtde, m.declarado]), [[10, true]]);
});

/* ═════════════ Montagem com senha: o texto diz declarar ═════════════ */

test('revisão: montagem com senha finaliza pelo card: o diálogo diz "Declarar os N restantes como entregues pela equipe hoje", o aviso diz declarados e "fale com o PCP", sem Desfazer', async () => {
  const itens = ITENS().map(it => it.uid === '8101:1:1' ? {...it, entregas:[{id:'e-g4', tipo:'entregue', qtde:4, dia:'2026-09-20', via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-20T12:00:00Z'}]} : it);
  const b = await bancada({registros:[row('1', pronta({itens}))], papel:'montagem', cracha:MONTAGEM});
  // Caso ruim: o botão dizia "Marcar os 2 restantes como entregues hoje" a quem só declara.
  const html = (b.run(`perguntarSaldoEntrega(STORE.getOS('1'), saldoAFinalizar(STORE.getOS('1')), () => {})`), b.d.porId.get('saldo-entrega-box').innerHTML);
  assert.match(html, /Declarar os 2 restantes como entregues pela equipe hoje/);
  assert.doesNotMatch(html, /Marcar os/);
  b.run(`perguntarSaldoEntrega = (os, p, cb) => cb('marcar');
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Conta Montagem', resposta: 'nao'}; cb(); };`);
  b.run(`finalizarServicoDoCard('1')`);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  assert.ok(b.toasts.some(([m]) => /Serviço finalizado 🏁 · 2 itens declarados pela equipe hoje\. Para desfazer, fale com o PCP\./.test(m)), JSON.stringify(b.toasts));
  assert.ok(!b.toasts.some(([, t]) => t === 'desfazer'), 'a montagem não desfaz marca: sem o Desfazer de um toque');
  // O que a montagem declarou está declarado; só a marca da gestão é entregue conferido.
  const L = D.lancamentosDaOS(g);
  assert.deepEqual(L.lancamentos.map(l => l.eventoId), ['e-g4']);
  assert.ok(L.declaracoes.length >= 3);
  // A gestão continua vendo "Marcar".
  const bg = await bancada({registros:[row('1', pronta({itens}))]});
  const htmlG = (bg.run(`perguntarSaldoEntrega(STORE.getOS('1'), saldoAFinalizar(STORE.getOS('1')), () => {})`), bg.d.porId.get('saldo-entrega-box').innerHTML);
  assert.match(htmlG, /Marcar os 2 restantes como entregues hoje/);
});
