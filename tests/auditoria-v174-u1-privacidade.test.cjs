/* U1 DA AUDITORIA DE 12/10/2026 (privacidade): os percentuais, as cotas e as
   participações de colegas não descem para operação e comercial, como já não
   desciam para a montagem e o crachá de toque. A gestão (admin, pcp) e a
   máquina continuam recebendo tudo. Começa pelo caso ruim (no fbc56b9 a
   operação e o comercial recebiam a divisão inteira e as participações).
   Dados fictícios (repositório público). */
const test = require('node:test'), assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');

const cfg = {instaladores: ['Ana'], performancePCP: {equipes: [{id: 'eq-a', nome: 'A', membros: [{chave: '900001'}, {chave: '900002'}], ativo: true}],
  participacoes: [{id: '1', equipeId: 'eq-a', membros: [{chave: '900001', nome: 'X', percentual: 70}, {chave: '900002', nome: 'Y', percentual: 30}]}]}};
const os = {id: '1', rev: 1, numero: 'T1', equipe: ['900001', '900002'], valorTotal: 1000, finalizadaEm: '2026-10-05T12:00:00Z',
  alocacao: {grupos: [{equipeId: 'eq-a', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 7000}, {pessoaId: '900002', papel: 'ajudante', cota: 3000}]}], porId: '900009', em: '2026-10-05T12:00:00Z'},
  alocacaoLog: [{acao: 'gravar', por: 'Gestor', porId: '900009', em: '2026-10-05T12:00:00Z'}],
  conferenciasEntrega: [{id: 'e1', dia: '2026-10-05', itens: [], alocacao: {grupos: [{equipeId: 'eq-a', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 7000}, {pessoaId: '900002', papel: 'ajudante', cota: 3000}]}]}, por: 'Gestor', porId: '900009', em: '2026-10-05T12:00:00Z'}]};
const banco = () => ({pcp_config_global: [{id: true, config: structuredClone(cfg), atualizado_em: '2026-10-01T00:00:00Z'}],
  equipe_contas: [{sistema: 'pcp', usuario: 'pessoa.montagem'}],
  pcp_registros: [{colecao: 'os', id: '1', registro: structuredClone(os), apagado: false, atualizado_em: '2026-10-05T12:00:00Z'}]});
const pessoa = papel => ({papel, nome: 'Pessoa Teste', sub: 'pessoa.' + papel});

for (const papel of ['montagem', 'operacao', 'comercial']) test(`U1: ${papel} não recebe percentuais, cotas nem participações de colegas`, async () => {
  const e = await edge('pcp-sync', banco());
  const c = await e.call({action: 'getCfg'}, pessoa(papel));
  assert.equal(c.status, 200);
  assert.ok(c.cfg.performancePCP, 'as equipes continuam descendo');
  assert.equal(c.cfg.performancePCP.equipes.length, 1);
  assert.ok(!('participacoes' in c.cfg.performancePCP), 'sem participações: ' + papel);
  const l = await e.call({action: 'list', since: '2000-01-01'}, pessoa(papel));
  const o = (l.os || []).find(x => x.id === '1');
  assert.ok(o, 'a O.S. desce');
  for (const k of ['alocacao', 'alocacaoLog', 'conferenciasEntrega', 'conferenciasRevisoes']) assert.ok(!(k in o), `${papel} sem ${k}`);
  assert.ok(!/"cota"|"percentual"/.test(JSON.stringify(o)), 'nenhuma cota na O.S.');
});

for (const papel of ['admin', 'pcp']) test(`U1: a gestão (${papel}) continua vendo a divisão e as participações`, async () => {
  const e = await edge('pcp-sync', banco());
  const c = await e.call({action: 'getCfg'}, pessoa(papel));
  assert.equal(c.cfg.performancePCP.participacoes.length, 1);
  const o = (await e.call({action: 'list', since: '2000-01-01'}, pessoa(papel))).os.find(x => x.id === '1');
  assert.equal(o.alocacao.grupos[0].membros[0].cota, 7000);
  assert.equal(o.conferenciasEntrega.length, 1);
});

test('U1: a operação grava a O.S. sem a divisão e a divisão gravada fica (campo ausente nunca apaga)', async () => {
  const e = await edge('pcp-sync', banco());
  const l = await e.call({action: 'list', since: '2000-01-01'}, pessoa('operacao'));
  const o = l.os.find(x => x.id === '1');
  const r = await e.call({action: 'upsert', os: {...o, obsPCP: 'nota da operação'}}, pessoa('operacao'));
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = e.db.pcp_registros.find(x => x.colecao === 'os' && x.id === '1').registro;
  assert.equal(g.obsPCP, 'nota da operação');
  assert.equal(g.alocacao.grupos[0].membros[0].cota, 7000, 'a divisão gravada fica');
  assert.equal(g.conferenciasEntrega.length, 1, 'a conferência gravada fica');
  assert.ok(!('alocacao' in r.os), 'a resposta também vem podada');
});
