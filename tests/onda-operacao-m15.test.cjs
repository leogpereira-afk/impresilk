/* ONDA OPERAÇÃO, ITEM 6: M15 da auditoria de 11/10/2026. A Fila diária é
   montada pela régua de Entregas ("a lançar"), mais o ERP que fechou a O.S.
   aberta, o saldo a conferir, as saídas sem retorno e os pedidos de revisão
   sem resposta; sem internas, canceladas, retiradas e já classificadas, nem a
   baixa de antes do corte; ordenada por dias parados. Antes (v170) a fila
   pegava toda baixa automática. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../conferencia-entrega.js');

const RAIZ = path.join(__dirname, '..');
const HOJE = '2026-10-12';
const js = x => JSON.parse(JSON.stringify(x));
function tela(lista) {
  const STORE = {getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[]}), getQueue:() => [], saveOS() {},
    entreguesMes:() => null, elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), valores:() => ({})};
  const c = {STORE, STATE:{user:{papel:'pcp', nome:'Gestor Teste'}}, console,
    Date:class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    toast() {}, nowISO:() => HOJE + 'T15:00:00.000Z', emptyState:() => '', bindCardClicks() {}, perfDialog:(t, h) => ({titulo:t, html:h}),
    resumoEntregaFichaTexto:() => '', localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    document:{addEventListener() {}, getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}}};
  vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'casa.js', 'controle-entrega-ui.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), c, {filename:f});
  return {run:code => vm.runInContext(code, c)};
}
const baixa = (id, dia, extra = {}) => ({id, numero:'94' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, liberadoPCP:true, equipe:[], instalacao:{data:dia},
  finalizadaEm:dia + 'T18:00:00', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:dia + 'T18:00:00', status:'ENTREGUE'}, ...extra});
const ITENS = id => [{uid:id + ':1:1', item:'1', descricao:'Placa fictícia', qtde:'2', subtotal:'100'}];

test('M15: a fila diária segue a régua de Entregas e ordena por dias parados (antes: toda baixa automática)', () => {
  const parcial = {id:'J', numero:'94J', tipo:'externo', cliente:'Cliente Fictício J', equipe:['100001'], itens:ITENS('J'), finalizadaEm:'2026-10-04T20:00:00.000Z', finalizadoPor:'Gestor Teste'};
  parcial.conferenciasEntrega = [{id:'c1', dia:'2026-10-04', itens:[{chave:C.catalogo(parcial)[0].chave, identidade:C.catalogo(parcial)[0].identidade, qtde:1}]}];
  const lista = [
    baixa('A', '2026-10-02'),                                                       // a lançar, 10 dias
    baixa('B', '2026-09-10'),                                                       // antes do corte: já conta, fora
    baixa('C', '2026-10-03', {conferenciaERP:{classificacao:'retirada', em:'2026-10-05T10:00:00Z'}}),
    baixa('D', '2026-10-03', {tipo:'interno'}),
    baixa('E', '2026-10-03', {conferenciaERP:{classificacao:'total', em:'2026-10-05T10:00:00Z'}}),
    baixa('E2', '2026-10-06', {conferenciaERP:{classificacao:'divergencia', em:'2026-10-07T10:00:00Z'}}), // a resolver: continua
    {id:'F', numero:'94F', tipo:'externo', cliente:'Cliente Fictício F', liberadoPCP:true, erpSaiuDaCarteiraEm:'2026-09-30T10:00:00Z'},           // o ERP fechou, 12 dias
    {id:'G', numero:'94G', tipo:'externo', cliente:'Cliente Fictício G', liberadoPCP:true, horaSaida:'08:00', saidaEm:'2026-10-08T08:00:00', instalacao:{data:'2026-10-08'}}, // sem retorno
    {id:'H', numero:'94H', tipo:'externo', cliente:'Cliente Fictício H', revisaoSolicitada:[{motivo:'Conferir fictício', por:'Ana', em:'2026-10-11T10:00:00Z'}]},
    {id:'I', numero:'94I', tipo:'externo', cliente:'Cliente Fictício I', revisaoSolicitada:[{motivo:'Conferir fictício', por:'Ana', em:'2026-10-01T10:00:00Z'}], conferenciaERP:{classificacao:'total', em:'2026-10-02T10:00:00Z'}},
    parcial,                                                                         // saldo a conferir
    baixa('K', '2026-10-01', {cancelamento:{ativo:true, motivo:'Cliente desistiu fictício', por:'Gestor', em:'2026-10-02T10:00:00Z'}}),
  ];
  const t = tela(js(lista));
  const fila = js(t.run('filaDiaria(STORE.getAllOS(), "2026-10-12")'));
  assert.deepEqual(fila.map(x => [x.os.id, x.diasParados, x.motivos.map(m => m.tipo).join('+')]), [
    ['F', 12, 'erpFechou'], ['A', 10, 'aLancar'], ['J', 8, 'saldoConferir'], ['E2', 6, 'aLancar'], ['G', 4, 'semRetorno'], ['H', 1, 'revisao']]);
  const html = t.run('controleFila().html');
  assert.match(html, /6 O\.S\. · Baixa do ERP a lançar: 2 · O ERP fechou a O\.S\.: a gestão decide: 1 · Saldo a conferir: 1 · Saída sem retorno: 1 · Revisão pedida à gestão: 1/);
  assert.match(html, /12 dias parada/);
  assert.match(html, /data-controle="lancar" data-controle-os="A"/);
  assert.doesNotMatch(html, /data-fila-os="B"/, 'a baixa de antes do corte não entra');
  assert.ok(!/\s—\s/.test(html), 'sem travessão');
});
