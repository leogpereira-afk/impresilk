/* S2 DA AUDITORIA DE 12/10/2026: o registro dos lotes de categorias
   (cfg.lotesCategoria) crescia sem teto a cada gravação (no fbc56b9, três
   gravações de 1000 lotes ficavam com 3001 lotes e 3 MB na configuração) e
   descia até quem não é da gestão, inclusive o celular do crachá de toque.
   Agora há teto no total (1000 lotes e 3000 descrições somando todos), o lote
   que passaria do teto fica fora com aviso (nunca 422) e só a gestão recebe o
   registro. Dados fictícios. */
const test = require('node:test'), assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const motivo = 'Revisão fictícia das categorias de teste';
const lote = (i, n = 1) => ({id: 'lote-ficticio-' + i, busca: 'x', categoria: 'Adesivos', motivo, descricoes: Array.from({length: n}, (_, k) => `descricao ficticia ${i}-${k}`)});
const banco = (extra = {}) => ({pcp_registros: [], equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}],
  pcp_config_global: [{id: true, config: {instaladores: [], ...extra}, atualizado_em: '2026-10-01T10:00:00Z'}]});
const gravar = async (e, lotes) => {
  const base = structuredClone(e.db.pcp_config_global[0].config);
  return e.call({action: 'setCfg', baseCfg: base, cfg: {...base, lotesCategoria: [...(base.lotesCategoria || []), ...lotes]}}, GESTOR);
};

test('S2: o total de lotes tem teto, somando as gravações; o que passa fica fora com aviso, 200', async () => {
  const e = await edge('pcp-sync', banco());
  let r = await gravar(e, Array.from({length: 1000}, (_, i) => lote('a' + i)));
  assert.equal(r.status, 200, JSON.stringify(r).slice(0, 300));
  assert.equal(e.db.pcp_config_global[0].config.lotesCategoria.length, 1000);
  r = await gravar(e, Array.from({length: 5}, (_, i) => lote('b' + i)));
  assert.equal(r.status, 200);
  assert.equal(e.db.pcp_config_global[0].config.lotesCategoria.length, 1000, 'não passa de 1000');
  assert.ok((r.avisos || []).some(a => /5 lotes de categorias não tiveram o registro gravado: o registro dos lotes chegou ao teto/.test(a)), JSON.stringify(r.avisos));
});

test('S2: as descrições somando todos os lotes têm teto de 3000', async () => {
  const e = await edge('pcp-sync', banco());
  let r = await gravar(e, [lote('c1', 2000), lote('c2', 900)]);
  assert.equal(r.status, 200);
  r = await gravar(e, [lote('c3', 200)]);
  assert.equal(r.status, 200);
  const cfg = e.db.pcp_config_global[0].config;
  assert.deepEqual(cfg.lotesCategoria.map(l => l.id), ['lote-ficticio-c1', 'lote-ficticio-c2']);
  assert.ok((r.avisos || []).some(a => /Um lote de categorias não teve o registro gravado/.test(a)));
  r = await gravar(e, [lote('c4', 100)]);
  assert.equal(e.db.pcp_config_global[0].config.lotesCategoria.length, 3, 'o que ainda cabe entra');
});

test('S2: o registro dos lotes só desce para a gestão', async () => {
  const cfg = {lotesCategoria: [{...lote('d1'), por: 'Gestor Teste', em: '2026-10-02T10:00:00Z'}], categoriasServico: [{descricao: 'descricao ficticia d1-0', categoria: 'Adesivos'}]};
  const e = await edge('pcp-sync', banco(cfg));
  for (const quem of [GESTOR, {papel: 'admin', nome: 'Admin Teste', sub: 'admin1'}]) assert.equal((await e.call({action: 'getCfg'}, quem)).cfg.lotesCategoria.length, 1);
  for (const quem of [{papel: 'operacao', nome: 'Operação Teste', sub: 'op1'}, {papel: 'comercial', nome: 'Comercial Teste', sub: 'co1'},
    {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'}, {nome: 'Ana', sub: 'Ana', id: '100001', papel: 'montagem', montagemIndividual: true}]) {
    const c = await e.call({action: 'getCfg'}, quem);
    assert.equal(c.status, 200);
    assert.ok(!('lotesCategoria' in c.cfg), 'sem o registro dos lotes: ' + quem.sub);
  }
});

test('S2: a operação grava a configuração sem o registro e ele continua no servidor', async () => {
  const cfg = {lotesCategoria: [{...lote('e1'), por: 'Gestor Teste', em: '2026-10-02T10:00:00Z'}]};
  const e = await edge('pcp-sync', banco(cfg));
  const op = {papel: 'operacao', nome: 'Operação Teste', sub: 'op1'};
  const c = (await e.call({action: 'getCfg'}, op)).cfg;
  const r = await e.call({action: 'setCfg', baseCfg: c, cfg: {...c, mensagemDia: 'Bom dia fictício'}}, op);
  assert.notEqual(r.status, 422);
  assert.equal(e.db.pcp_config_global[0].config.lotesCategoria.length, 1, 'o registro fica');
});
