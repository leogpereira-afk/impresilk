/* ONDA OPERAÇÃO, ITEM 7: item 18 da fila de 11/10/2026. O diário também
   para a máquina: a baixa automática (e a poupada pela E7), a baixa desfeita
   pela conciliação (a O.S. voltou à carteira), a finalizada por sair da
   carteira, a reimportação do ERP e a mudança do ERP vista depois da
   finalização (não aplicada, registrada uma vez) entram no Histórico de
   alterações (coleção 'auditoria', origem 'maquina'). O diário que falha não
   para a baixa. Cada caso começa pelo caso ruim da v170 (nenhuma entrada).
   Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');

const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-10-01T10:00:00Z', registro:{id, rev:1, ...registro}});
const aberta = (num, extra = {}) => row('mub-' + num, {numero:num, origemMubisys:true, tipo:'externo', cliente:'Cliente Fictício ' + num, servico:'Fachada fictícia', equipe:[],
  instalacao:{data:'2026-09-01'}, valorTotal:500, itens:[{uid:num + ':1:1', item:'1', descricao:'Placa fictícia', qtde:'2', subtotal:'500'}], ...extra});
const diario = (e, acao) => e.db.pcp_registros.filter(r => r.colecao === 'auditoria' && (!acao || r.registro.acao === acao)).map(r => r.registro);
const gravada = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
async function bancada(registros, erp) {
  const e = await edge('pcp-mubisys', {pcp_registros:registros});
  e.run(`erpGet = async () => ({data:${JSON.stringify(erp.map(x => ({sequencial_ordem:x.numero, status:x.status, data_entregue:x.data || ''})))}})`);
  e.run("console = {...console, warn:()=>{}, log:()=>{}}");
  return {...e, baixar:() => e.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`)};
}

test('item 18: a baixa automática e a poupada pela E7 entram no diário da O.S., com a máquina como autor', async () => {
  const comConf = aberta('51');
  comConf.registro.conferenciasEntrega = [{id:'c1', dia:'2026-10-05', itens:[{chave:C.catalogo(comConf.registro)[0].chave, identidade:C.catalogo(comConf.registro)[0].identidade, qtde:1}]}];
  const e = await bancada([aberta('50'), comConf], [{numero:'50', status:'ENTREGUE', data:'2026-10-08'}, {numero:'51', status:'ENTREGUE', data:'2026-10-08'}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 1);
  assert.equal(res.marcadasComSaldo, 1);
  // Caso ruim (v170): nenhuma linha no diário.
  const [b] = diario(e, 'baixa-automatica');
  assert.ok(b, 'a baixa automática está no diário');
  assert.deepEqual([b.osId, b.origem, b.autor.nome, b.autor.papel], ['mub-50', 'maquina', 'Mubisys (auto)', 'maquina']);
  assert.deepEqual(b.campos.sort(), ['baixaAutoERP', 'finalizadaEm', 'finalizadoPor']);
  assert.equal(b.antes.finalizadaEm, null);
  assert.equal(b.depois.baixaAutoERP.status, 'ENTREGUE');
  const [p] = diario(e, 'baixa-poupada');
  assert.deepEqual([p.osId, p.campos], ['mub-51', ['erpComSaldo']]);
  // A segunda rodada com a mesma resposta não grava nada nem repete o diário.
  await e.baixar();
  assert.equal(diario(e).length, 2);
});

test('item 18: a conciliação registra a baixa desfeita, a finalizada por sair da carteira e a marca de saída', async () => {
  const baixada = aberta('60', {finalizadaEm:'2026-10-05T18:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-10-05T18:00:00.000Z', status:'ENTREGUE'}});
  const semGente = aberta('61');
  const comGente = aberta('62', {liberadoPCP:true, equipe:['100001']});
  const naCarteira = aberta('63');
  const e = await edge('pcp-mubisys', {pcp_registros:[baixada, semGente, comGente, naCarteira]});
  e.run("console = {...console, warn:()=>{}, log:()=>{}}");
  const r = await e.run(`reconciliarCarteira(sb, ${JSON.stringify([{numero:'60', statusCarteira:'PRODUCAO'}, {numero:'63', statusCarteira:'PRODUCAO'}])})`);
  assert.deepEqual([r.restauradas, r.arquivadas, r.marcadasParaConferir], [1, 1, 1]);
  assert.equal(gravada(e, 'mub-60').finalizadaEm, '', 'a baixa foi desfeita');
  const d = diario(e, 'baixa-desfeita');
  assert.equal(d.length, 1, 'caso ruim: a baixa desfeita não deixava rastro');
  assert.equal(d[0].osId, 'mub-60');
  assert.equal(d[0].antes.finalizadaEm, '2026-10-05T18:00:00.000Z');
  assert.equal(d[0].depois.finalizadaEm, '');
  assert.equal(diario(e, 'baixa-carteira')[0].osId, 'mub-61');
  assert.equal(diario(e, 'erp-saiu-da-carteira')[0].osId, 'mub-62');
});

test('item 18: a reimportação registra o que o ERP mudou; depois da finalização, registra sem aplicar, uma vez por mudança', async () => {
  const aberto = aberta('70', {cliente:'Cliente Fictício Antigo'});
  const fim = aberta('71', {valorTotal:500, finalizadaEm:'2026-10-05T20:00:00.000Z', finalizadoPor:'Gestor Teste'});
  const e = await edge('pcp-mubisys', {pcp_registros:[aberto, fim]});
  e.run("console = {...console, warn:()=>{}, log:()=>{}}");
  const remotas = [{numero:'70', cliente:'Cliente Fictício Novo'}, {numero:'71', valorTotal:650}];
  let r = await e.run(`gravarImportadas(sb, ${JSON.stringify(remotas)})`);
  assert.equal(r.atualizadas, 1);
  const [ri] = diario(e, 'reimportacao-erp');
  assert.deepEqual([ri.osId, ri.campos, ri.antes.cliente, ri.depois.cliente], ['mub-70', ['cliente'], 'Cliente Fictício Antigo', 'Cliente Fictício Novo']);
  // Finalizada: a O.S. não muda (como sempre), e o diário diz o que o ERP mudou depois.
  assert.equal(gravada(e, 'mub-71').valorTotal, 500);
  const df = diario(e, 'erp-depois-da-finalizacao');
  assert.equal(df.length, 1, 'caso ruim: a mudança depois da finalização não era registrada');
  assert.deepEqual([df[0].osId, df[0].antes.valorTotal, df[0].depois.valorTotal], ['mub-71', 500, 650]);
  // A mesma resposta na hora seguinte não repete; uma mudança nova entra.
  await new Promise(ok => setTimeout(ok, 3));
  r = await e.run(`gravarImportadas(sb, ${JSON.stringify(remotas)})`);
  assert.equal(diario(e, 'erp-depois-da-finalizacao').length, 1);
  await new Promise(ok => setTimeout(ok, 3));
  r = await e.run(`gravarImportadas(sb, ${JSON.stringify([{numero:'71', valorTotal:700}])})`);
  assert.equal(diario(e, 'erp-depois-da-finalizacao').length, 2);
});

test('item 18: o diário que falha não para a baixa; a falha conta em auditoria_falhas', async () => {
  const e = await bancada([aberta('80'), aberta('81')], [{numero:'80', status:'ENTREGUE', data:'2026-10-08'}, {numero:'81', status:'ENTREGUE', data:'2026-10-08'}]);
  // O mesmo id para as duas entradas: o banco recusa o lote do diário.
  e.run("const uuidReal = crypto.randomUUID.bind(crypto); globalThis.__uuidReal = uuidReal; crypto.randomUUID = () => 'repetido'");
  try {
    const res = await e.baixar();
    assert.equal(res.baixadas, 2, 'a baixa seguiu');
    assert.equal(diario(e).length, 0);
    const meta = e.db.pcp_meta.find(m => m.chave === 'auditoria_falhas');
    assert.equal(meta.valor.total, 2);
  } finally { e.run('crypto.randomUUID = globalThis.__uuidReal'); }
});
