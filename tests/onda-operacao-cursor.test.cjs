/* ONDA OPERAÇÃO, ITEM 9: item 23 da fila de 11/10/2026 (EI-AL10). A margem
   no cursor do pull incremental: a gravação de outro aparelho carimbada um
   pouco antes do "agora" do servidor, mas que só ficou visível depois da
   consulta, ficava atrás do cursor e não chegava a este aparelho pelo
   incremental. Agora o incremental pede desde o cursor menos 2 minutos; o
   que vem de novo não muda nada. Começa pelo caso ruim da v170. Dados
   fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');

const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor', exp:EXP};
const CURSOR = 'impresilk_inst_cursor_v2';
function aparelho(e, lista) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]'], ['impresilk_inst_conferencia_completa', JSON.stringify(Date.now())]]);
  const db = {transaction() { const tx = {objectStore:() => ({get() { const r = {}; queueMicrotask(() => r.onsuccess?.({target:{result:null}})); return r; }, put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const pedidos = [];
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const r = {}; queueMicrotask(() => r.onsuccess({target:{result:db}})); return r; }},
    setTimeout:() => 1, clearTimeout() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const q = JSON.parse(req.body); pedidos.push(q); const r = await e.call(q, gestor); const {status, ...corpo} = r; return {ok:!(status >= 400), status:status || 200, json:async () => corpo}; }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8'), ctx);
  return {s:vm.runInContext('STORE', ctx), ls, pedidos};
}
const linha = (id, em, cliente) => ({colecao:'os', id, apagado:false, atualizado_em:em, registro:{id, rev:1, numero:'96' + id, cliente, atualizadoEm:em}});

test('item 23: a gravação carimbada logo antes do cursor, visível só depois da consulta, chega no incremental seguinte', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[linha('a', '2026-10-12T09:00:00.000Z', 'Cliente Fictício A')]});
  const ap = aparelho(e, [{id:'a', rev:1, cliente:'Cliente Fictício A', atualizadoEm:'2026-10-12T09:00:00.000Z'}]);
  ap.ls.set(CURSOR, JSON.stringify({em:new Date(Date.now() - 60000).toISOString(), modo:'incremental'}));
  await ap.s.pronto();
  await ap.s.pull();
  const cursor = JSON.parse(ap.ls.get(CURSOR)).em;
  // Outro aparelho gravou 1 segundo antes do "agora" desta consulta, mas a linha só apareceu depois dela.
  e.db.pcp_registros.push(linha('b', new Date(Date.parse(cursor) - 1000).toISOString(), 'Cliente Fictício B'));
  await ap.s.pull();
  assert.ok(ap.s.getOS('b'), 'caso ruim (v170): o incremental pedia desde o cursor e a O.S. b nunca chegava');
  const ult = ap.pedidos[ap.pedidos.length - 1];
  assert.equal(Date.parse(cursor) - Date.parse(ult.since), 120000, 'o pedido vai com a margem de 2 minutos');
  assert.equal(JSON.parse(ap.ls.get(CURSOR)).modo, 'incremental', 'o cursor guardado continua sendo o do servidor');
  // O que vem de novo dentro da margem não muda nada (mesmo rev, mesmo atualizadoEm).
  const antes = JSON.stringify(ap.s.getAllOS());
  const r = await ap.s.pull();
  assert.equal(r.updated, false);
  assert.equal(JSON.stringify(ap.s.getAllOS()), antes);
});
