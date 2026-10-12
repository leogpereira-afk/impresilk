/* ONDA OPERAÇÃO, ITEM 10: item 37 da fila de 11/10/2026 (FP-33). A ficha da
   O.S. de correção grava o ID da O.S. original (osOriginalId) junto com o
   número (osOriginal), quando o número aponta uma O.S. só; a porta confere o
   ID (existe, não é a própria, tem o número) e só a gestão grava; o que não
   passa fica o gravado, com aviso, nunca 422. A medição do custo do
   retrabalho já vem com a original preenchida. Começa pelo caso ruim da
   v170 (o campo da gestão não aceitava valor novo). Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {edge} = require('./helpers/edge.cjs');
const {telaFicha} = require('./helpers/ficha-tela.cjs');
const B = require('./helpers/lote-bancada.cjs');

const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor', exp:EXP};
const operacao = {papel:'operacao', nome:'Operação Teste', sub:'operacao1', exp:EXP};
const os = (id, numero, extra = {}) => ({id, numero, tipo:'externo', cliente:'Cliente Fictício', servico:'Fachada fictícia', ...extra});
const linha = o => ({colecao:'os', id:o.id, apagado:false, atualizado_em:'2026-10-01T10:00:00Z', registro:{rev:1, ...o}});
const g = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;

test('item 37: a gestão grava o ID da original junto com o número; a porta confere o número; outro papel não grava', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[linha(os('orig', '97001')), linha(os('outra', '97002')), linha(os('corr', '97050', {servico:'RETRABALHO fictício'}))], registros:B.FICHAS});
  let r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97001', osOriginalId:'orig'}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(g(e, 'corr').osOriginalId, 'orig', 'caso ruim (v170): o ID não entrava (campo da gestão sem regra de gravação)');
  await new Promise(ok => setTimeout(ok, 3));
  // O ID de outra O.S. (número diferente): fica o gravado, com aviso, 200.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginalId:'outra'}}, gestor);
  assert.equal(r.status, 200);
  assert.equal(g(e, 'corr').osOriginalId, 'orig');
  assert.match(String(r.avisos), /não é de uma O\.S\. com o número 97001/);
  await new Promise(ok => setTimeout(ok, 3));
  // A própria O.S. também não.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97050', osOriginalId:'corr'}}, gestor);
  assert.equal(g(e, 'corr').osOriginalId, 'orig');
  await new Promise(ok => setTimeout(ok, 3));
  // A operação não grava o vínculo (fica o gravado), sem 422.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97002', osOriginalId:'outra'}}, operacao);
  assert.equal(r.status, 200);
  assert.equal(g(e, 'corr').osOriginalId, 'orig');
  assert.match(String(r.avisos), /é da gestão/);
  await new Promise(ok => setTimeout(ok, 3));
  // O vazio da gestão limpa.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'', osOriginalId:''}}, gestor);
  assert.equal(g(e, 'corr').osOriginalId, null);
});

test('item 37: a ficha liga o número ao ID quando há uma O.S. só com ele; a medição vem preenchida', async () => {
  const t = await telaFicha([os('orig', '97001'), os('corr', '97050'), os('d1', '97003'), os('d2', '97003')]);
  t.abrir('corr');
  t.run(`_modalDraft.osOriginal = '97001'`);
  assert.deepEqual(t.json(`ligarOsOriginal(_modalDraft)`), {id:'orig', situacao:'ligada'});
  assert.equal(t.run(`_modalDraft.osOriginalId`), 'orig');
  t.run(`_modalDraft.osOriginal = '97003'`);
  assert.equal(t.json(`ligarOsOriginal(_modalDraft)`).situacao, 'varias');
  t.run(`_modalDraft.osOriginal = ''`);
  assert.equal(t.json(`ligarOsOriginal(_modalDraft)`).situacao, 'vazio');
  assert.equal(t.run(`_modalDraft.osOriginalId`), null);
  // A medição do retrabalho preenche a original já ligada.
  assert.match(fs.readFileSync('operacao-revisao.js', 'utf8'), /const ligada=\(STORE\.getOS\(ev\.target\.value\)\|\|\{\}\)\.osOriginalId\|\|''/);
});
