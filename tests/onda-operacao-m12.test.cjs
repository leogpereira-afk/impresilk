/* ONDA OPERAÇÃO, ITEM 5: M12 da auditoria de 11/10/2026. (1) O item citado
   numa conferência por entrega fica protegido na ficha, como o item com
   marca: mudar a identidade dele (número, descrição, medida, quantidade,
   unidade) ou tirá-lo da lista não entra, com aviso, nunca 422; (2) a gestão
   revisa ou anula uma parcial pela tela, com motivo de 15 letras ou mais, e a
   revisão valida SÓ a entrega editada (antes, com duas parciais quebradas,
   nenhuma se consertava). Mês fechado continua recusado. Quem não é da gestão
   não recebe o diário das revisões. Cada caso começa pelo caso ruim da v170.
   Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');
const {edge} = require('./helpers/edge.cjs');

const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor', exp:EXP};
const montagem = {papel:'montagem', nome:'Conta Montagem', sub:'montagem1', exp:EXP};
const aloc = id => D.montar([{equipeId:null, liderId:id, membros:[id]}]);
const ITENS = () => [{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'4', subtotal:'5000'}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'2', subtotal:'5000'}];
const sel = (os, n, qtde) => { const i = C.catalogo(os)[n]; return {chave:i.chave, identidade:i.identidade, qtde}; };
const MOTIVO = 'Item corrigido pela gestão fictícia depois da conferência';
function osConferida() {
  const os = {id:'m12', numero:'93001', rev:1, tipo:'externo', cliente:'Cliente fictício', valorTotal:10000, equipe:['100001'], itens:ITENS(),
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}};
  os.conferenciasEntrega = [
    {id:'e1', dia:'2026-10-05', itens:[sel(os, 0, 2), sel(os, 1, 1)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'444555', em:'2026-10-05T20:00:00.000Z'},
    {id:'e2', dia:'2026-10-06', itens:[sel(os, 0, 1), sel(os, 1, 1)], alocacao:aloc('100002'), por:'Gestor Teste', porId:'444555', em:'2026-10-06T20:00:00.000Z'}];
  return os;
}
const banco = (os, extra = {}) => ({pcp_registros:[{id:os.id, colecao:'os', registro:os, apagado:false, atualizado_em:'2026-10-06T21:00:00Z'}], painel_ordens:[{numero:os.numero, valor:10000}],
  registros:[{id:'ana', colecao:'colaboradores', apagado:false, registro:{nome:'Ana Fictícia', cpf:'10000111111'}}, {id:'bia', colecao:'colaboradores', apagado:false, registro:{nome:'Bia Fictícia', cpf:'10000222222'}},
    {id:'g', colecao:'colaboradores', apagado:false, registro:{nome:'Gestor Teste', apelido:'gestor', cpf:'44455566677'}}], ...extra});
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === 'm12').registro;
const pausa = () => new Promise(ok => setTimeout(ok, 3));

test('M12: a ficha não muda a descrição nem a quantidade de um item conferido, nem o tira da lista (aviso, nunca 422)', async () => {
  const e = await edge('pcp-sync', banco(osConferida()));
  const g = structuredClone(gravada(e));
  // Caso ruim (v170): a mudança entrava calada e as duas parciais ficavam inválidas.
  const mudado = {...g, itens:[{...g.itens[0], descricao:'Painel fictício A corrigido', qtde:'5'}, g.itens[1]]};
  let r = await e.call({action:'upsert', os:mudado}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(gravada(e).itens[0].descricao, 'Painel fictício A');
  assert.equal(gravada(e).itens[0].qtde, '4');
  // U5 da revisão da onda operação: o nome do campo na tela (não "descricao, qtde") e onde revisar.
  assert.match(String(r.avisos), /item 1 \(Painel fictício A\) está numa entrega conferida e não mudou \(descrição, quantidade\): para corrigir o item, revise ou anule antes a entrega conferida, com motivo, em "Conferir itens e equipe"/);
  assert.equal(C.validar(gravada(e), gravada(e).conferenciasEntrega), '', 'as parciais continuam válidas');
  await pausa();
  // Tirar o item da lista: ele volta ao lugar dele.
  const g2 = structuredClone(gravada(e));
  r = await e.call({action:'upsert', os:{...g2, itens:[g2.itens[1]]}}, gestor);
  assert.equal(r.status, 200);
  assert.deepEqual(gravada(e).itens.map(i => i.uid), ['a', 'b']);
  assert.match(String(r.avisos), /continua na O\.S\.: para tirá-lo, revise ou anule antes a entrega conferida/);
  // O valor do item (não é identidade) segue mudando.
  await pausa();
  const g3 = structuredClone(gravada(e));
  r = await e.call({action:'upsert', os:{...g3, itens:[{...g3.itens[0], subtotal:'5100'}, g3.itens[1]]}}, gestor);
  assert.equal(gravada(e).itens[0].subtotal, '5100');
});

test('M12: com duas parciais quebradas (o item mudou fora da ficha), a gestão revisa cada uma com motivo, validando só a editada', async () => {
  const os = osConferida();
  os.itens[0] = {...os.itens[0], descricao:'Painel fictício A, nova descrição do ERP'};
  const e = await edge('pcp-sync', banco(os));
  const g = gravada(e), novo = C.catalogo(g);
  assert.ok(C.validar(g, g.conferenciasEntrega), 'as duas parciais não se leem mais');
  const e1 = {id:'e1', dia:'2026-10-05', itens:[{chave:novo[0].chave, identidade:novo[0].identidade, qtde:2}, sel(g, 1, 1)], alocacao:aloc('100001')};
  // Caso ruim (v170): refazer uma parcial dava 422 porque a outra continuava inválida.
  let r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:e1}, gestor);
  assert.equal(r.status, 422);
  // Com a revisão e sem motivo: 400, nada gravado.
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:e1, revisao:{acao:'revisar', motivo:'curto'}}, gestor);
  assert.equal(r.status, 400);
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:e1, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  await pausa();
  const depois = gravada(e);
  assert.equal(depois.conferenciasRevisoes.length, 1);
  assert.deepEqual([depois.conferenciasRevisoes[0].acao, depois.conferenciasRevisoes[0].entregaId, depois.conferenciasRevisoes[0].motivo, depois.conferenciasRevisoes[0].porId], ['revisar', 'e1', MOTIVO, '444555']);
  // A segunda: o saldo conta a primeira (já revisada); passar do item é recusado, o certo entra.
  const e2 = q => ({id:'e2', dia:'2026-10-06', itens:[{chave:novo[0].chave, identidade:novo[0].identidade, qtde:q}, sel(depois, 1, 1)], alocacao:aloc('100002')});
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:depois.rev, entrega:e2(3), revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 422);
  assert.match(r.error, /ultrapassa o saldo/);
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:depois.rev, entrega:e2(1), revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(C.validar(gravada(e), gravada(e).conferenciasEntrega), '', 'a O.S. volta a se ler');
});

test('M12: anular uma parcial tira a entrega, deixa o diário, só para a gestão; mês fechado recusa; quem não é da gestão não vê o diário', async () => {
  const fechamento = {colecao:'performance_fechamentos', id:'f-set', apagado:false, atualizado_em:'2026-10-02T00:00:00Z', registro:{de:'2026-09-01', ate:'2026-09-30', revisao:1, fechadoEm:'2026-10-02T00:00:00Z'}};
  const os = osConferida();
  os.conferenciasEntrega.push({id:'e0', dia:'2026-09-20', itens:[sel(os, 0, 1)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'444555', em:'2026-09-20T20:00:00.000Z'});
  const e = await edge('pcp-sync', banco(os, {pcp_registros:[{id:'m12', colecao:'os', registro:os, apagado:false, atualizado_em:'2026-10-06T21:00:00Z'}, fechamento]}));
  const g = gravada(e);
  let r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:{id:'e2'}, revisao:{acao:'anular', motivo:MOTIVO}}, montagem);
  assert.equal(r.status, 403);
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:{id:'e0'}, revisao:{acao:'anular', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 409);
  assert.match(r.error, /período já fechado/);
  r = await e.call({action:'conferenciaEntrega', osId:'m12', rev:g.rev, entrega:{id:'e2'}, revisao:{acao:'anular', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  await pausa();
  const depois = gravada(e);
  assert.deepEqual(depois.conferenciasEntrega.map(x => x.id).sort(), ['e0', 'e1']);
  assert.equal(depois.conferenciasRevisoes[0].acao, 'anular');
  assert.equal(depois.conferenciasRevisoes[0].antes.dia, '2026-10-06');
  // O aparelho não reescreve o diário nem as conferências.
  r = await e.call({action:'upsert', os:{...structuredClone(depois), conferenciasRevisoes:[], conferenciasEntrega:[]}}, gestor);
  assert.equal(gravada(e).conferenciasRevisoes.length, 1);
  assert.equal(gravada(e).conferenciasEntrega.length, 2);
  // A operação não recebe o diário (motivo, ID e login de quem fez); a gestão recebe.
  const operacao = {papel:'operacao', nome:'Operação Teste', sub:'operacao1', exp:EXP};
  const vista = ((await e.call({action:'list', escopo:'tudo'}, operacao)).os || []).find(o => o.id === 'm12');
  assert.ok(vista, 'a operação vê a O.S.');
  assert.equal(vista.conferenciasRevisoes, undefined);
  const daGestao = ((await e.call({action:'list', escopo:'tudo'}, gestor)).os || []).find(o => o.id === 'm12');
  assert.equal(daGestao.conferenciasRevisoes.length, 1);
});

test('M12: a revisão do aparelho e a do servidor validam igual (as duas cópias da conferência)', async () => {
  const S = (await import('../supabase/functions/_shared/pcp-conferencia-entrega.mjs')).CONFERENCIA_ENTREGA;
  const os = osConferida();
  os.itens[1] = {...os.itens[1], qtde:'1'};
  const nova = {id:'e1', dia:'2026-10-05', itens:[sel(os, 0, 2), sel(os, 1, 1)]};
  for (const q of [1, 2]) {
    const ed = {...nova, itens:[sel(os, 0, 2), sel(os, 1, q)]};
    assert.equal(C.validarRevisao(os, os.conferenciasEntrega.slice(1), ed, '2026-10-12'), S.validarRevisao(os, os.conferenciasEntrega.slice(1), ed, '2026-10-12'));
  }
  assert.equal(C.validarRevisao(os, os.conferenciasEntrega.slice(1), nova, '2026-10-12'), '');
  assert.deepEqual(C.lidasParaSaldo(os, os.conferenciasEntrega.slice(1)).map(e => e.itens.length), [1], 'a parte que não se lê fica fora do saldo');
});
