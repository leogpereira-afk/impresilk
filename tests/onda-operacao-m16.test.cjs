/* ONDA OPERAÇÃO, ITEM 2: M16 da auditoria de 11/10/2026. A O.S. com todos
   os itens conferidos pela gestão, e ainda não finalizada, é entregue no
   último dia de conferência: não fica "atrasada" nem "sem entrega
   registrada" (na tela e na cópia do servidor). A parcial conferida aparece
   como execução, com as unidades. Cada caso começa pelo caso ruim da v170.
   Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const O = require('../operacao.js');
const C = require('../conferencia-entrega.js');
const OPREV = require('../operacao-revisao.js');
const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const js = v => JSON.parse(JSON.stringify(v));

const ITENS = [{uid:'u:1:1', item:'1', descricao:'Placa fictícia', qtde:'2', subtotal:'200'}, {uid:'u:2:1', item:'2', descricao:'Adesivo fictício', qtde:'1', subtotal:'100'}];
function conf(os, id, dia, qtdes) {
  const cat = C.catalogo(os);
  return {id, dia, itens:cat.map((it, i) => ({chave:it.chave, identidade:it.identidade, qtde:qtdes[i] || 0})).filter(p => p.qtde > 0)};
}
const aberta = (lista, extra = {}) => {
  const os = {id:'m16', numero:'92001', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado', responsavelPCP:'Gestor Teste', veiculo:'Carro 1',
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-10-05', fonte:'agenda', dias:1}, itens:ITENS, ...extra};
  return {...os, conferenciasEntrega:lista.map(([id, dia, q]) => conf(os, id, dia, q))};
};
const HOJE = '2026-10-12';

test('M16: a O.S. conferida inteira e não finalizada é entregue no último dia de conferência (antes: "sem entrega registrada", com atraso)', async () => {
  const S = await servidor();
  const os = aberta([['e1', '2026-10-04', [1, 1]], ['e2', '2026-10-05', [1, 0]]]);
  const a = O.statusEntrega(os, HOJE);
  assert.doesNotMatch(a.motivo, /sem entrega registrada/);
  assert.equal(a.estado, 'no_prazo', a.motivo);
  assert.deepEqual([a.entregue, a.dataEntrega, a.fonteEntrega, a.diasAtraso], [true, '2026-10-05', 'conferencia', 0]);
  assert.equal(a.ocorrencias.some(x => x.tipo === 'atraso'), false, 'sem ocorrência de atraso');
  assert.deepEqual(js(S.statusEntrega(os, HOJE)), js(a), 'o mesmo no servidor');
  assert.deepEqual(js(O.conferidaInteira(os)), {dia:'2026-10-05', unidades:3});
  // Conferida inteira depois do prazo: o atraso é o do último dia de conferência, não o de hoje.
  const tarde = aberta([['e1', '2026-10-07', [2, 1]]]);
  const b = O.statusEntrega(tarde, HOJE);
  assert.deepEqual([b.estado, b.diasAtraso, b.dataEntrega], ['atraso', 2, '2026-10-07']);
  assert.deepEqual(js(S.statusEntrega(tarde, HOJE)), js(b));
});

test('M16: a conferida inteira sai de "atrasadas" na agenda e nas Prioridades do dia; a parcial continua', () => {
  const inteira = aberta([['e1', '2026-10-05', [2, 1]]]);
  const parcial = aberta([['e1', '2026-10-05', [1, 0]]], {id:'m16p', numero:'92002'});
  assert.equal(O.atrasada(inteira, HOJE), false);
  assert.equal(O.atrasada(parcial, HOJE), true);
  const p = OPREV.prioridades([inteira, parcial], HOJE, O, {});
  assert.deepEqual(p.filter(x => /prazo vencido/.test(x.motivo)).map(x => x.numero), ['92002']);
});

test('M16: a parcial conferida aparece em execução com as unidades, e o prazo vencido continua marcado', async () => {
  const S = await servidor();
  const os = aberta([['e1', '2026-10-05', [1, 0]]]);
  const a = O.statusEntrega(os, HOJE);
  assert.equal(a.entregue, false);
  assert.equal(a.estado, 'atraso');
  assert.ok(a.aplicaveis.some(x => x.estado === 'execucao' && /entrega parcial conferida: 1 de 3 unidades/.test(x.motivo)), JSON.stringify(a.aplicaveis));
  assert.equal(a.parcial.conferida, true);
  assert.deepEqual(js(S.statusEntrega(os, HOJE)), js(a));
  assert.equal(O.conferidaInteira(os), null);
  // Cancelada: não é "conferida inteira" (o saldo foi cancelado, não entregue).
  const canc = aberta([['e1', '2026-10-05', [1, 0]]], {cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço fictício', por:'Gestor Teste', em:'2026-10-06T10:00:00Z'}});
  assert.equal(O.conferidaInteira(canc), null);
});
