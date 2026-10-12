/* ONDA ACABAMENTO, ITEM 2 (M18 da auditoria de 11/10/2026): a fila do
   aparelho não fica presa por O.S. excluída.
   - a edição de uma O.S. que outro gestor excluiu (e a O.S. nova com o número
     de uma excluída) recebia 422 sem `definitivo` e ficava na fila para
     sempre, com o Sair e o resto da O.S.; agora a recusa é definitiva: sai da
     fila com a frase, e a edição recusada fica no Histórico da O.S. excluída;
   - a exclusão antiga, sem motivo (fila de até a v147), recebia 422 e o store
     nunca descarta exclusão: presa para sempre, escondendo a O.S. viva;
     agora sai da fila com aviso e a O.S. continua valendo;
   - STORE.deleteOS, sem quem chame, saiu.
   Os stores da v171 (tirados do git) e o desta onda esvaziam a fila igual.
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const doGit = f => execFileSync('git', ['show', `3affd9a:${f}`], {cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

const FICHAS = [{colecao: 'colaboradores', id: 'gestor-f', apagado: false, registro: {id: 'gestor-f', nome: 'Gestor Teste', apelido: 'gestor', cpf: '11122233344'}}];
const row = (id, registro, extra = {}) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', ...extra, registro: {id, rev: 3, ...registro}});
const os = (id, numero) => ({numero, tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001']});
const banco = () => ({pcp_registros: [row('x', os('x', '7001'), {apagado: true}), row('y', os('y', '7002')), row('z', os('z', '7003')), row('morta', os('morta', '7004'), {apagado: true})],
  registros: structuredClone(FICHAS), equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}],
  pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const MONTAGEM = {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'};
const linha = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id);
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);

function loja(textoStore, {lista = [], fila = []}, responder) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', JSON.stringify(fila)]]);
  const db = {transaction() { const tx = {objectStore: () => ({get() { const req = {}; queueMicrotask(() => req.onsuccess?.({target: {result: null}})); return req; }, put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.get(k) || null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const req = {}; queueMicrotask(() => req.onsuccess({target: {result: db}})); return req; }},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; }});
  vm.runInContext(textoStore, ctx);
  vm.runInContext(ler('operacao.js'), ctx);
  return vm.runInContext('STORE', ctx);
}
async function esvaziar(s) { for (let i = 0; i < 60 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); } }

test('M18: a edição de O.S. excluída recebe recusa definitiva (gestão e montagem com senha); a lápide fica e a edição vai para o Histórico', async () => {
  for (const quem of [GESTOR, MONTAGEM]) {
    const e = await edge('pcp-sync', banco());
    const r = await e.call({action: 'upsert', os: {id: 'x', rev: 3, ...os('x', '7001'), obsTecnicas: 'edição fictícia feita sem sinal'}}, quem);
    // Caso ruim (v171): 422 sem `definitivo`, e a edição ficava na fila para sempre.
    assert.equal(r.status, 422, quem.sub);
    assert.equal(r.definitivo, true, quem.sub + ': sai da fila');
    assert.equal(r.restauracaoNecessaria, true);
    assert.match(r.error, /excluída pela gestão: a edição deste aparelho não foi gravada e saiu da fila/);
    assert.equal(linha(e, 'x').apagado, true, 'a lápide continua lápide');
    assert.equal(linha(e, 'x').registro.obsTecnicas, undefined);
    const d = diario(e).find(a => a.osId === 'x');
    assert.equal(d && d.acao, 'edicao-recusada', quem.sub + ': a edição recusada está no Histórico');
    assert.ok(d.campos.includes('obsTecnicas'));
  }
  // A O.S. nova com o número de uma excluída: a mesma recusa, no Histórico da excluída.
  const e = await edge('pcp-sync', banco());
  const r = await e.call({action: 'upsert', os: {id: 'nova', ...os('nova', '7004'), obsTecnicas: 'nova fictícia'}}, GESTOR);
  assert.equal(r.status, 422);
  assert.equal(r.definitivo, true);
  assert.equal(linha(e, 'nova'), undefined);
  assert.equal(diario(e).find(a => a.osId === 'morta').acao, 'edicao-recusada');
});

test('M18: a exclusão antiga sem motivo (fila de até a v147) sai da fila com aviso e a O.S. continua; a de agora, sem motivo, segue pedindo motivo', async () => {
  const e = await edge('pcp-sync', banco());
  const r = await e.call({action: 'delete', id: 'z'}, GESTOR);
  // Caso ruim (v171): 422, que o store nunca tira da fila.
  assert.equal(r.status, 403);
  assert.match(r.error, /Exclusão antiga não enviada: ela saiu da fila e a O.S. continua valendo/);
  assert.equal(linha(e, 'z').apagado, false);
  // A exclusão de agora (com rev, pela tela, na hora) sem motivo continua recusada pedindo o motivo.
  assert.equal((await e.call({action: 'delete', id: 'z', rev: 3}, GESTOR)).status, 422);
});

for (const [nome, texto] of [['desta onda', () => ler('store.js')], ['da v171', () => doGit('store.js')]]) {
  test(`M18: o store ${nome} esvazia a fila: a edição da excluída e a exclusão antiga saem com aviso, e a O.S. viva grava`, async () => {
    const e = await edge('pcp-sync', banco());
    const agora = new Date().toISOString();
    const fila = [
      {action: 'delete', id: 'z', enfileiradoEm: agora},
      {action: 'upsert', os: {id: 'x', rev: 3, ...os('x', '7001'), obsTecnicas: 'edição fictícia', atualizadoEm: agora}, enfileiradoEm: agora},
      {action: 'upsert', os: {id: 'y', rev: 3, ...os('y', '7002'), obsTecnicas: 'gravou', atualizadoEm: agora}, enfileiradoEm: agora},
    ];
    const s = loja(texto(), {lista: [{id: 'x', rev: 3, ...os('x', '7001')}, {id: 'y', rev: 3, ...os('y', '7002')}, {id: 'z', rev: 3, ...os('z', '7003')}], fila}, q => e.call(q, GESTOR));
    const recusas = [];
    s.on('item-recusado', d => recusas.push(d));
    await s.pronto();
    await esvaziar(s);
    assert.equal(s.getQueue().length, 0, 'nada preso na fila');
    assert.equal(linha(e, 'y').registro.obsTecnicas, 'gravou', 'a O.S. viva gravou');
    assert.equal(linha(e, 'z').apagado, false, 'a exclusão antiga não excluiu');
    assert.deepEqual(recusas.map(r => r.item.action).sort(), ['delete', 'upsert']);
    assert.ok(recusas.every(r => r.motivo && /saiu da fila/.test(r.motivo)), JSON.stringify(recusas.map(r => r.motivo)));
  });
}

test('M18: STORE.deleteOS saiu (ninguém chamava: a exclusão é pela ficha, na hora, com motivo)', () => {
  const s = loja(ler('store.js'), {}, async () => ({}));
  assert.equal(s.deleteOS, undefined);
  assert.equal(typeof loja(doGit('store.js'), {}, async () => ({})).deleteOS, 'function', 'a v171 ainda tinha');
  for (const f of fs.readdirSync(RAIZ).filter(f => f.endsWith('.js'))) assert.doesNotMatch(ler(f), /\bdeleteOS\b/, f);
});

test('M18: o Histórico da O.S. tem nome para a edição recusada', () => {
  assert.match(ler('entregas-os.js'), /'edicao-recusada': 'tentou alterar a O\.S\. excluída/);
});
