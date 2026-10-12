/* REVISÃO DA ONDA ACABAMENTO (12/10/2026). A revisão de uso disse "não" (U1 a
   U4) e a de dados disse "sim" com dois achados (D1 e D2). Cada teste começa
   pelo caso ruim, o que a onda acabamento (acfaae1) fazia. Tudo fictício: o
   repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* A O.S. das provas da revisão de dados: dois itens de R$ 500, uma entrega
   conferida com 1 das 2 unidades do item A (R$ 250,00 pelo rateio). */
const FICHAS = [{colecao: 'colaboradores', id: 'g', apagado: false, registro: {id: 'g', nome: 'Gestor Teste', apelido: 'gestor', cpf: '44455566677'}}];
const osBase = () => {
  const o = {id: 'v1', numero: '93201', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'], manual: true,
    itens: [{uid: 'm-a0000000001', item: '1', descricao: 'Painel fictício A', qtde: '2', valorUnit: '250', subtotal: 500, manual: true},
      {uid: 'm-b0000000001', item: '2', descricao: 'Painel fictício B', qtde: '1', valorUnit: '500', subtotal: 500, manual: true}],
    instalacao: {data: '2026-10-05', periodo: 'Manhã', duracaoDias: 1}};
  const i = C.catalogo(o)[0];
  o.conferenciasEntrega = [{id: 'e1', dia: '2026-10-05', itens: [{chave: i.chave, identidade: i.identidade, qtde: 1}], alocacao: D.montar([{equipeId: null, liderId: '100001', membros: ['100001']}]),
    por: 'Gestor Teste', porId: '444555', em: '2026-10-05T20:00:00.000Z'}];
  return o;
};
const banco = () => ({pcp_registros: [{id: 'v1', colecao: 'os', apagado: false, atualizado_em: '2026-10-05T20:00:00Z', registro: osBase()}], registros: structuredClone(FICHAS),
  pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T00:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === 'v1').registro;
const valorE1 = o => C.apurar(o, o.valorTotal).entregas[0]?.valor ?? null;

test('revisão acabamento: o item conferido enviado sem a chave do valor fica com o valor gravado (D2, PROVA 3)', async () => {
  const e = await edge('pcp-sync', banco());
  const antes = valorE1(gravada(e));
  const o = structuredClone(gravada(e));
  delete o.itens[0].subtotal; delete o.itens[0].valorUnit;
  o.obsPCP = 'gravação fictícia';
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = gravada(e);
  // Caso ruim (acfaae1): o ausente apagava, o item ficava sem valor e a entrega conferida, sem valor (null).
  assert.deepEqual([g.itens[0].valorUnit, g.itens[0].subtotal], ['250', 500], 'o ausente nunca apaga: fica o gravado');
  assert.equal(valorE1(g), antes, 'o valor da entrega conferida não muda');
  assert.equal(g.obsPCP, 'gravação fictícia', 'o resto da gravação passou');
  assert.ok(!(r.avisos || []).some(a => /valor não mudou/.test(a)), 'sem aviso: ninguém pediu mudança');
  // O valor presente e diferente continua protegido, com aviso (onda acabamento, item 8).
  const o2 = structuredClone(gravada(e)); delete o2.itens[0].subtotal; o2.itens[0].valorUnit = '900';
  const r2 = await e.call({action: 'upsert', os: o2}, GESTOR);
  assert.deepEqual([gravada(e).itens[0].valorUnit, gravada(e).itens[0].subtotal], ['250', 500]);
  assert.ok(r2.avisos.some(a => /o valor não mudou/.test(a)), JSON.stringify(r2.avisos));
});
