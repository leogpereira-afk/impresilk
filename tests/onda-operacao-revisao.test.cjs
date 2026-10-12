/* REVISÃO DA ONDA OPERAÇÃO (12/10/2026): os achados da revisão de uso (U1 a
   U8) e da revisão de dados (D1 e D2) sobre f33877d. Cada caso começa pelo
   caso ruim do ramo revisado. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const B = require('./helpers/lote-bancada.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor', exp:EXP};
const aloc = id => D.montar([{equipeId:null, liderId:id, membros:[id]}]);
const g = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const pausa = () => new Promise(ok => setTimeout(ok, 3));
const sel = (os, n, qtde) => { const i = C.catalogo(os)[n]; return {chave:i.chave, identidade:i.identidade, qtde}; };
const MOTIVO = 'Revisão fictícia da entrega conferida pela gestão';

/* ── D1: cancelar o resto de um item já conferido em parte ──────────────── */
function osParcial(id = 'q3') {
  const o = {id, numero:'93103', rev:1, tipo:'externo', cliente:'Cliente fictício', valorTotal:1000, equipe:['100001'],
    itens:[{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'2', subtotal:'500'}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'1', subtotal:'500'}],
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}};
  o.conferenciasEntrega = [{id:'e1', dia:'2026-10-05', itens:[sel(o, 0, 1), sel(o, 1, 1)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'444555', em:'2026-10-05T20:00:00.000Z'}];
  return o;
}
const bancoParcial = o => ({pcp_registros:[{id:o.id, colecao:'os', registro:o, apagado:false, atualizado_em:'2026-10-06T21:00:00Z'}], painel_ordens:[{numero:o.numero, valor:1000}], registros:B.FICHAS,
  pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[]}}}]});
const cancelarResto = async (e, id) => {
  const gr0 = structuredClone(g(e, id));
  return e.call({action:'upsert', os:{...gr0, itens:[{...gr0.itens[0], entregas:[{id:'mc1', tipo:'cancelado', dia:'2026-10-07', motivo:'Cliente desistiu do resto fictício'}]}, gr0.itens[1]]}}, gestor);
};

test('revisão operação: D1, o item cancelado depois de conferido em parte não tira a parte conferida da apuração (validar e motor, nas duas cópias)', async () => {
  const e = await edge('pcp-sync', bancoParcial(osParcial()));
  const periodo = async () => {
    const p = await e.call({action:'performancePeriodo', de:'2026-10-01', ate:'2026-10-31', notaPorValor:true}, gestor);
    return (p.registros || []).filter(r => String(r.id || '').startsWith('q3')).map(r => ({id:r.id, valor:r.valorCentavos ?? r.valor ?? null}));
  };
  const antes = await periodo();
  assert.deepEqual(antes, [{id:'q3::entrega:e1', valor:750}]);
  const r = await cancelarResto(e, 'q3');
  assert.equal(r.status, 200, JSON.stringify(r));
  const gr = g(e, 'q3');
  assert.ok(gr.itens[0].entregas.some(m => m.tipo === 'cancelado'), 'o cancelamento do saldo entrou');
  // Caso ruim (f33877d): "Item cancelado não pode entrar na entrega." e a entrega saía da apuração (750 → null).
  assert.equal(C.validar(gr, gr.conferenciasEntrega), '', 'a parcial continua se lendo');
  assert.deepEqual(await periodo(), antes, 'a entrega conferida continua na apuração, com o mesmo valor');
  const est = C.estado(gr, 1000);
  assert.equal(est.situacao, 'saldo_concluido', 'o saldo do item cancelado não fica a conferir');
  assert.equal(est.itens[0].conferido, 1);
  assert.equal(est.itens[0].saldo, 0);
  assert.equal(est.canceladoUnidades, 1, 'a unidade cancelada vai à parte');
  // A cópia do servidor dá o mesmo.
  const S = await import(path.join(RAIZ, 'supabase/functions/_shared/pcp-conferencia-entrega.mjs'));
  const CS = S.CONFERENCIA_ENTREGA || S.default;
  assert.equal(CS.validar(gr, gr.conferenciasEntrega), '');
  assert.deepEqual(JSON.parse(JSON.stringify(CS.estado(gr, 1000))), JSON.parse(JSON.stringify(est)));
});

test('revisão operação: D1, a entrega nova não leva o item cancelado e a revisão mantém dele no máximo o que já tinha', async () => {
  const e = await edge('pcp-sync', bancoParcial(osParcial()));
  await cancelarResto(e, 'q3');
  await pausa();
  let gr = g(e, 'q3');
  // A entrega nova com a unidade cancelada: recusada (o cancelamento vale para o saldo).
  let r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e2', dia:'2026-10-08', itens:[sel(gr, 0, 1)], alocacao:aloc('100001')}}, gestor);
  assert.equal(r.status, 422);
  assert.match(String(r.error), /Item cancelado não pode entrar na entrega/);
  // Editar a e1 mantendo a unidade conferida do item cancelado: aceita (antes: 422, a parcial não se consertava).
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 1), sel(gr, 1, 1)], alocacao:aloc('100001')}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(g(e, 'q3').conferenciasEntrega[0].dia, '2026-10-06');
  await pausa();
  gr = g(e, 'q3');
  // A revisão com motivo também aceita o item cancelado com a parte conferida...
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 1), sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  await pausa();
  gr = g(e, 'q3');
  // ...mas não aumenta o que ela tinha do item cancelado.
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 2), sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 422);
  assert.match(String(r.error), /no máximo o que já tinha sido conferido \(1\)/);
  // E pode tirar a unidade do item cancelado da entrega (reduzir).
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(C.validar(g(e, 'q3'), g(e, 'q3').conferenciasEntrega), '');
});

test('revisão operação: D1, a tela da conferência deixa a entrega editada manter (ou tirar) o item cancelado e não o seleciona no saldo', () => {
  const ui = ler('conferencia-entrega-ui.js');
  assert.match(ui, /validar\(os,\[\.\.\.outros,entrega\],hojeV,\{novas:new Map\(\[\[id,anterior\|\|null\]\]\)\}\)/);
  assert.match(ui, /validarRevisao\(os,outros,entrega,hojeV,anterior\|\|null\)/);
  assert.match(ui, /esta entrega mantém até \$\{tinhaC\} já conferida/);
  assert.match(ui, /if\(el\.disabled\|\|catalogo\[\+el\.dataset\.confItem\]\.cancelado\)return/);
});
