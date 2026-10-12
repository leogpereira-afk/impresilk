/* ONDA OPERAÇÃO, ITEM 8: item 19 da fila de 11/10/2026. O cancelamento é
   estado final no funil: o status de agenda (OPERACAO.status, o que a tela e
   o Painel leem) diz "cancelada" para a O.S. cancelada no ERP ou pela gestão
   (e para o pedido ainda na fila deste aparelho); o "Em aberto" e as etapas
   não a contam; a linha do tempo a vê cancelada desde o carimbo; o histórico
   de etapas (lead time) ganha a etapa "cancelada"; desfazer devolve a etapa.
   A cópia do Painel recebe o mesmo por patch (docs/patches). Cada caso começa
   pelo caso ruim da v170. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const O = require('../operacao.js');
const {telaFicha} = require('./helpers/ficha-tela.cjs');

const CANCEL = {ativo:true, motivo:'Cliente desistiu do serviço fictício', por:'Gestor Teste', porId:'444555', em:'2026-11-06T10:00:00.000Z'};
const base = (id, extra = {}) => ({id, numero:'95' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, liberadoPCP:true, equipe:['100001'], veiculo:'Carro 1',
  confirmacao:'Confirmado', instalacao:{data:'2026-11-10', periodo:'Manhã', duracaoDias:1}, criadoEm:'2026-11-01T10:00:00.000Z', dataEntrada:'2026-11-01', ...extra});

test('item 19: o status de agenda da cancelada é "cancelada" (antes: "confirmada", contando no funil)', () => {
  assert.equal(O.status(base('a')), 'confirmada');
  assert.equal(O.status(base('b', {cancelamento:CANCEL})), 'cancelada');
  assert.equal(O.status(base('c', {cancelamento:{cancelar:true, motivo:'Cliente desistiu do serviço fictício'}})), 'cancelada', 'o pedido deste aparelho já conta');
  assert.equal(O.status(base('d', {cancelamento:{...CANCEL, ativo:false, desfeitoEm:'2026-11-07T10:00:00Z'}})), 'confirmada', 'desfeito: volta à etapa dela');
  const erp = base('e', {finalizadaEm:'2026-11-08T18:00:00', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:'2026-11-08T18:00:00', status:'CANCELADO'}});
  assert.equal(O.status(erp), 'cancelada');
  assert.equal(O.status(base('f', {finalizadaEm:'2026-11-10T20:00:00.000Z', finalizadoPor:'Gestor Teste'})), 'finalizada');
});

test('item 19: na tela, a cancelada sai do "Em aberto", tem o chip e o rótulo próprios, a linha do tempo e o histórico de etapas a veem cancelada', async () => {
  const t = await telaFicha([base('a'), base('b', {cancelamento:CANCEL, historico:[{etapa:'confirmada', em:'2026-11-03T10:00:00.000Z', por:'Gestor Teste'}]})], undefined, '2026-11-12');
  assert.equal(t.run(`STATUS_LABEL.cancelada`), 'Cancelada');
  assert.deepEqual(t.json(`STATUS_FINAIS_FUNIL`), ['finalizada', 'cancelada']);
  assert.equal(t.run(`calcStatus(STORE.getOS('b'))`), 'cancelada');
  // "Em aberto" (o filtro do quadro do PCP) não traz a cancelada.
  assert.deepEqual(t.json(`STORE.getAllOS().filter(o => !STATUS_FINAIS_FUNIL.includes(calcStatus(o))).map(o => o.id)`), ['a']);
  assert.match(fs.readFileSync('app.js', 'utf8'), /if \(STATE\.pcpStatus === 'todos'\) list = list\.filter\(o => !STATUS_FINAIS_FUNIL\.includes\(calcStatus\(o\)\)\);/);
  // A linha do tempo: antes do carimbo do cancelamento, a etapa de então; depois, cancelada.
  assert.equal(t.run(`etapaEmT(STORE.getOS('b'), new Date('2026-11-05T12:00:00Z'))`), 'confirmada');
  assert.equal(t.run(`etapaEmT(STORE.getOS('b'), new Date('2026-11-07T12:00:00Z'))`), 'cancelada');
  // O histórico de etapas (lead time) ganha a etapa final.
  t.run(`registrarEtapa(STORE.getOS('b'))`);
  const hist = t.json(`STORE.getOS('b').historico`);
  assert.equal(hist[hist.length - 1].etapa, 'cancelada');
  // A régua mostra o que foi registrado e não marca a etapa final.
  const st = t.run(`stepperHTML(STORE.getOS('b'), true)`);
  assert.equal((st.match(/step cur/g) || []).length, 0);
  assert.ok((st.match(/step done/g) || []).length >= 1);
});

test('item 19: o celular e o histórico da ficha conhecem o rótulo; o patch do Painel diz o mesmo', () => {
  assert.match(fs.readFileSync('equipe.js', 'utf8'), /cancelada:'Cancelada'/);
  assert.match(fs.readFileSync('entregas-os.js', 'utf8'), /cancelada: 'Cancelada'/);
  const patch = fs.readFileSync('docs/patches/painel-status-cancelada.patch', 'utf8');
  assert.match(patch, /\+  if \(canceladaPCP\(o\) \|\| canceladaNoERP\(o\)\) return "cancelada";/);
  assert.match(patch, /\+  cancelada: "Cancelada",/);
});
