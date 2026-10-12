/* ONDA OPERAÇÃO, ITEM 1: M3 da auditoria de 11/10/2026. Uma régua só para o
   atraso: o prazo combinado no PCP contra o dia da entrega, que é a
   CONFERÊNCIA da gestão, senão o lançamento, senão a finalização (a mesma
   ordem da apuração, perfFonte). A ficha, o relatório de pontualidade e as
   ocorrências da comissão (D-011: ocorrência, sem tirar nada) leem a mesma
   conta (atrasoDaOS, nas duas cópias). Mais o ponto de atenção do prazo
   mudado no mesmo minuto ou a mais de 20 dias da previsão do ERP
   (prazoParaConferir, nas duas cópias). Cada caso começa pelo caso ruim da
   v170. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const O = require('../operacao.js');
const C = require('../conferencia-entrega.js');
const {edge} = require('./helpers/edge.cjs');
const {telaFicha} = require('./helpers/ficha-tela.cjs');
const B = require('./helpers/lote-bancada.cjs');

const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const integridade = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const js = v => JSON.parse(JSON.stringify(v));
const texto = html => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const ITENS = [{uid:'t:1:1', item:'1', descricao:'Placa fictícia', qtde:'2', subtotal:'200'}, {uid:'t:2:1', item:'2', descricao:'Adesivo fictício', qtde:'1', subtotal:'100'}];
// Uma conferência por entrega: `qtdes` é a quantidade de cada item do catálogo (0 = fora desta entrega).
function conf(os, id, dia, qtdes) {
  const cat = C.catalogo(os);
  return {id, dia, itens:cat.map((it, i) => ({chave:it.chave, identidade:it.identidade, qtde:qtdes[i] || 0})).filter(p => p.qtde > 0)};
}
function osBase(extra = {}) {
  const os = {id:'m3', numero:'91001', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'], liberadoPCP:true,
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-10-05', fonte:'agenda', dias:1}, itens:ITENS, ...extra};
  return os;
}
const comConf = (os, lista) => ({...os, conferenciasEntrega:lista.map(([id, dia, q]) => conf(os, id, dia, q))});

test('M3: a O.S. conferida inteira no dia do prazo e finalizada três dias depois está no prazo (antes: 3 dias de atraso pelo clique)', async () => {
  const S = await servidor();
  const os = comConf(osBase({finalizadaEm:'2026-10-08T21:00:00.000Z', finalizadoPor:'Gestor Teste'}), [['e1', '2026-10-05', [2, 1]]]);
  const a = O.statusEntrega(os, '2026-10-12');
  assert.equal(a.estado, 'no_prazo', a.motivo);
  assert.equal(a.dataEntrega, '2026-10-05');
  assert.equal(a.fonteEntrega, 'conferencia');
  assert.match(a.motivo, /último dia de conferência/);
  assert.deepEqual(js(S.statusEntrega(os, '2026-10-12')), js(a), 'as duas cópias');
  assert.deepEqual(js(O.atrasoDaOS(os, '2026-10-12')), js(S.atrasoDaOS(os, '2026-10-12')));
  assert.equal(O.atrasoDaOS(os, '2026-10-12').situacao, 'no_prazo');
});

test('M3: conferência em dois dias; vale o último, e o atraso é contado dele (1 dia)', async () => {
  const S = await servidor();
  const os = comConf(osBase({finalizadaEm:'2026-10-09T21:00:00.000Z', finalizadoPor:'Gestor Teste'}), [['e1', '2026-10-04', [1, 1]], ['e2', '2026-10-06', [1, 0]]]);
  const a = O.statusEntrega(os, '2026-10-12');
  assert.equal(a.estado, 'atraso');
  assert.equal(a.diasAtraso, 1);
  assert.equal(a.dataEntrega, '2026-10-06');
  assert.deepEqual(js(S.statusEntrega(os, '2026-10-12')), js(a));
  const m = O.atrasoDaOS(os, '2026-10-12');
  assert.deepEqual([m.situacao, m.dias, m.prazo, m.entrega, m.fonte], ['atraso', 1, '2026-10-05', '2026-10-06', 'conferencia']);
});

test('M3: com saldo a conferir, a encerrada no PCP fica no dia mais tarde entre a conferência e a finalização', async () => {
  const os = comConf(osBase({finalizadaEm:'2026-10-08T21:00:00.000Z', finalizadoPor:'Gestor Teste'}), [['e1', '2026-10-03', [1, 0]]]);
  const a = O.statusEntrega(os, '2026-10-12');
  assert.equal(a.dataEntrega, '2026-10-08');
  assert.equal(a.fonteEntrega, 'conferenciaParcial');
  assert.equal(a.diasAtraso, 3);
  assert.match(a.motivo, /encerrada com saldo a conferir/);
});

test('M3: a baixa do ERP depois do corte, sem lançamento e conferida inteira, usa o dia da conferência (antes: "a lançar", sem julgar o prazo)', async () => {
  const S = await servidor();
  const base = osBase({finalizadaEm:'2026-10-09T18:00:00', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-10-09T18:00:00', status:'ENTREGUE'}});
  const inteira = comConf(base, [['e1', '2026-10-06', [2, 1]]]);
  const a = O.statusEntrega(inteira, '2026-10-12');
  assert.equal(a.estado, 'atraso');
  assert.deepEqual([a.dataEntrega, a.fonteEntrega, a.semProva, a.diasAtraso], ['2026-10-06', 'conferencia', false, 1]);
  assert.deepEqual(js(S.statusEntrega(inteira, '2026-10-12')), js(a));
  // Com saldo a conferir: entregue, sem dia, e o prazo não é julgado (nunca "no prazo" nem zero).
  const parcial = comConf(base, [['e1', '2026-10-06', [1, 0]]]);
  const b = O.statusEntrega(parcial, '2026-10-12');
  assert.equal(b.estado, 'entregue');
  assert.equal(b.rotulo, 'Entregue (saldo a conferir)');
  assert.equal(b.dataEntrega, '');
  assert.equal(O.atrasoDaOS(parcial, '2026-10-12').situacao, 'nao_medido');
  assert.equal(O.atrasoDaOS(parcial, '2026-10-12').motivo, 'saldo a conferir');
  assert.deepEqual(js(S.statusEntrega(parcial, '2026-10-12')), js(b));
});

test('M3: a cancelada com parte conferida fica com o dia da última conferência; sem conferência, vale o lançamento, senão a finalização', async () => {
  const os = comConf(osBase({cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço fictício', por:'Gestor Teste', em:'2026-10-07T10:00:00Z'}}), [['e1', '2026-10-04', [1, 0]]]);
  const a = O.statusEntrega(os, '2026-10-12');
  assert.equal(a.estado, 'cancelado');
  assert.equal(a.dataEntrega, '2026-10-04');
  // A ordem: conferência, senão o lançamento, senão a finalização (sem conferência, nada muda).
  const semConf = osBase({finalizadaEm:'2026-10-08T21:00:00.000Z', finalizadoPor:'Gestor Teste', entregaLancada:{data:'2026-10-07'}});
  assert.equal(O.statusEntrega(semConf, '2026-10-12').dataEntrega, '2026-10-07');
  assert.equal(O.statusEntrega({...semConf, entregaLancada:undefined}, '2026-10-12').dataEntrega, '2026-10-08');
});

test('M3: o relatório de pontualidade leva, em cada O.S. do PCP, a mesma medida da ficha (antes: só a previsão do ERP)', async () => {
  const card = comConf(osBase({finalizadaEm:'2026-10-08T21:00:00.000Z', finalizadoPor:'Gestor Teste', previsaoEntrega:'2026-10-20'}), [['e1', '2026-10-06', [2, 1]]]);
  const linhas = [{numero:'91001', cliente:'Cliente fictício', data:'2026-10-08', previsao:'', valor:10}, {numero:'91999', cliente:'Fora do PCP', data:'2026-10-08', previsao:'2026-10-09', valor:5}];
  const e = await edge('pcp-sync', {pcp_registros:[B.osRow(card)], pcp_meta:[{chave:'entregues:2026-10', valor:{v:3, os:linhas}}]});
  const r = await e.call({action:'relatorioEntregas', ano:2026}, {papel:'pcp'});
  assert.equal(r.status, 200);
  const out = r.meses[9].entregas;
  const doPCP = out.find(x => x.numero === '91001'), fora = out.find(x => x.numero === '91999');
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  assert.ok(doPCP.pcp, 'a O.S. do PCP leva a régua do PCP');
  assert.deepEqual(js(doPCP.pcp), js(O.atrasoDaOS(card, hoje)), 'a mesma conta da ficha');
  assert.deepEqual([doPCP.pcp.situacao, doPCP.pcp.dias, doPCP.pcp.entrega], ['atraso', 1, '2026-10-06']);
  // A previsão do ERP que falta no pacote vem do cartão do PCP (a mesma reserva do quadro de Entregas).
  assert.equal(doPCP.previsao, '2026-10-20');
  assert.equal(doPCP.previsaoFonte, 'pcp');
  assert.equal(fora.pcp, null, 'fora do PCP: sem medida, nunca zero');
  assert.match(r.notas.pontualidadePCP, /mesma da ficha/);
});

test('M3: a tela do relatório mostra a régua do PCP ao lado da documental do ERP, e o não medido fica à parte', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const ctx = vm.createContext({console, Date, Set, Number, Object, Map, Intl, MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'], esc:s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;')});
  vm.runInContext(fs.readFileSync('relatorios-entregas.js', 'utf8'), ctx);
  ctx.fixture = [{mes:'2026-10', entregasCarregadas:true, entregas:[
    {numero:'1', cliente:'A', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:{situacao:'atraso', dias:3, prazo:'2026-10-05', entrega:'2026-10-08'}},
    {numero:'2', cliente:'B', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:{situacao:'no_prazo', dias:0, prazo:'2026-10-09', entrega:'2026-10-08', alerta:{tipo:'erp', motivo:'fictício'}}},
    {numero:'3', cliente:'C', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:{situacao:'nao_medido', motivo:'sem prazo combinado no PCP'}},
    {numero:'4', cliente:'D', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:null}]}];
  const p = vm.runInContext('relEntPontualidade(fixture)', ctx);
  // Pela régua do ERP as quatro estão no prazo; pela do PCP, uma atrasou.
  assert.equal(p.atrasadas, 0);
  assert.deepEqual([p.pcp.medidas, p.pcp.noPrazo, p.pcp.atrasadas, p.pcp.naoMedidas, p.pcp.foraDoPCP, p.pcp.alertas], [2, 1, 1, 1, 1, 1]);
  assert.equal(p.pcp.percentualNoPrazo, 50);
  vm.runInContext("REL_ENT.dados={ate:'2026-10-31',meses:fixture};REL_ENT.ano=2026;REL_ENT.foco='10';REL_ENT.abertos.pontualidade=true", ctx);
  const h = texto(vm.runInContext('relEntPontualidadeHTML()', ctx));
  assert.match(h, /Régua do PCP \(a mesma da ficha e das ocorrências da comissão\)/);
  assert.match(h, /3 dias de atraso/);
  assert.match(h, /Fora do PCP/);
  assert.match(h, /Não medido: sem prazo combinado no PCP/);
  assert.match(h, /Prazos para conferir/);
  assert.match(h, /não tira pontos nem comissão sozinha/);
});

test('M3: o prazo para conferir (mesmo minuto, mais de 20 dias do ERP) é o mesmo nas duas cópias; o corrigido sai da lista', async () => {
  const S = await integridade();
  const casos = [
    // A agenda foi digitada num dia e corrigida 8 segundos depois de o prazo congelar.
    [{prazoCombinado:{data:'2026-10-18', fonte:'agenda', em:'2026-09-20T10:00:00.000Z'}, agendaLog:[{de:'', data:'2026-10-02', em:'2026-09-20T10:00:08.000Z'}], previsaoEntrega:'2026-10-02'}, 'minuto'],
    // O mês trocado: 30/10 no lugar de 30/09.
    [{prazoCombinado:{data:'2026-10-30', fonte:'agenda', em:'2026-09-20T10:00:00.000Z'}, previsaoEntrega:'2026-09-30'}, 'erp'],
    // 20 dias exatos ainda não é alerta; a remarcação de outro dia também não.
    [{prazoCombinado:{data:'2026-10-20', fonte:'agenda', em:'2026-09-20T10:00:00.000Z'}, previsaoEntrega:'2026-09-30', agendaLog:[{de:'2026-10-20', data:'2026-10-22', em:'2026-09-25T10:00:00.000Z'}]}, null],
    // Corrigido pela gestão, com motivo: sai do ponto de atenção.
    [{prazoCombinado:{data:'2026-10-30', fonte:'correcao', motivo:'Data corrigida pela gestão fictícia', em:'2026-09-21T10:00:00.000Z'}, previsaoEntrega:'2026-09-30'}, null],
    [{}, null], [{prazoCombinado:{data:'', fonte:'semAgenda'}, previsaoEntrega:'2026-01-01'}, null],
  ];
  for (const [os, tipo] of casos) {
    const a = O.prazoParaConferir(os), s = S.prazoParaConferir(os);
    assert.deepEqual(js(a), js(s), JSON.stringify(os));
    assert.equal(a ? a.tipo : null, tipo, JSON.stringify(os));
  }
  assert.equal(O.PRAZO_ERP_DIFERENCA_DIAS, 20);
});

test('M3: a ficha da gestão mostra o prazo para conferir e abre o "Corrigir o prazo"', async () => {
  const os = {id:'pz', numero:'9pz', tipo:'externo', cliente:'Cliente Fictício pz', liberadoPCP:true, equipe:['100001'], instalacao:{data:'2026-11-05', periodo:'Manhã', duracaoDias:1},
    previsaoEntrega:'2026-10-05', prazoCombinado:{data:'2026-11-05', fonte:'agenda', em:'2026-10-01T10:00:00.000Z'}};
  const t = await telaFicha([os]);
  t.abrir('pz');
  const html = t.run('prazoRetornoHTML(_modalDraft, false)');
  assert.match(html, /data-prazo-conferir="erp"/);
  assert.match(texto(html), /Prazo para conferir: o prazo combinado \(05\/11\/2026\) difere 31 dias da previsão do ERP/);
  assert.match(html, /<details class="prazo-corrigir" open>/);
});
