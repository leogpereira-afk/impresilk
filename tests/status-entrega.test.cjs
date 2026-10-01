/* STATUS DA ENTREGA EM 7 ESTADOS (F16, 30/09/2026). A tabela de cada estado e
   da precedência (Cancelado > Retrabalho > Retorno antecipado > Com atraso >
   No prazo > Em execução > Agendado), sempre com o motivo; a O.S. de vários
   dias; a entrega por item em dois dias (o prazo é julgado pela ÚLTIMA
   entrega); o cancelado da O.S. cancela o saldo e o item cancelado sozinho
   não cancela a O.S.; e o fuso fixo (o mesmo resultado com o processo em
   qualquer fuso). Cada bloco começa pelo caso ruim. Dados fictícios: o
   repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const O = require('../operacao.js');
const E = require('../entrega-item.js');
const R = require('../regras.js');

const HOJE = '2026-09-20';
// A O.S. externa agendada no PCP para 10/09 (prazo combinado gravado, congelado).
const os = (extra = {}) => ({id:'s1', numero:'9101', tipo:'externo', cliente:'Cliente Fictício', equipe:['Ana'],
  instalacao:{data:'2026-09-10', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-10', fonte:'agenda'}, ...extra});
const fin = dia => ({finalizadaEm:dia + 'T15:00:00.000Z', finalizadoPor:'Gestor Teste'});
const st = (o, hoje = HOJE, regra) => O.statusEntrega(o, hoje, regra);
const estados = s => s.aplicaveis.map(a => a.estado);
const cancel = (extra = {}) => ({ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', em:'2026-09-15T13:00:00.000Z', ...extra});

/* ───────────── a tabela ───────────── */
const TABELA = [
  // [nome, O.S., hoje, estado, rótulo, pedaço do motivo]
  ['aberta sem data nenhuma: "A agendar", nunca "Agendado"', os({instalacao:{data:''}, prazoCombinado:undefined}), HOJE, 'agendado', 'A agendar', 'sem data na agenda do PCP'],
  ['aberta só com a previsão do ERP: não é agenda de ninguém', os({origemMubisys:true, equipe:[], previsaoEntrega:'2026-09-25', instalacao:{data:'2026-09-25'}, prazoCombinado:undefined}), HOJE, 'agendado', 'A agendar', 'previsão do ERP 25/09'],
  ['aberta agendada no futuro', os({instalacao:{data:'2026-09-25'}, prazoCombinado:{data:'2026-09-25', fonte:'agenda'}}), HOJE, 'agendado', 'Agendado', 'agendada para 25/09'],
  ['remarcada para depois: mostra a data nova e o prazo combinado', os({instalacao:{data:'2026-09-28'}, prazoCombinado:{data:'2026-09-25', fonte:'agenda'}}), HOJE, 'agendado', 'Agendado', 'agendada para 28/09 (prazo combinado 25/09)'],
  ['no dia da agenda, sem saída registrada: em execução', os(), '2026-09-10', 'execucao', 'Em execução', 'no dia da agenda'],
  ['no dia da agenda SEM equipe escalada: a data sozinha não é execução', os({equipe:[]}), '2026-09-10', 'agendado', 'Agendado', 'agendada para 10/09'],
  ['saída registrada sem retorno: em execução', os({horaSaida:'08:00', saidaEm:'2026-09-10T11:00:00.000Z'}), '2026-09-10', 'execucao', 'Em execução', 'saída registrada, sem retorno'],
  ['voltou e ninguém finalizou: em execução', os({horaSaida:'08:00', horaRetorno:'12:00'}), '2026-09-10', 'execucao', 'Em execução', 'falta finalizar'],
  ['aberta com o prazo vencido: com atraso, ainda sem entrega', os(), HOJE, 'atraso', 'Com atraso', 'prazo (10/09) vencido há 10 dias, sem entrega registrada'],
  ['REMARCAR NÃO MOVE O PRAZO: agenda nova no futuro, prazo combinado vencido', os({instalacao:{data:'2026-09-28'}}), HOJE, 'atraso', 'Com atraso', 'prazo (10/09) vencido há 10 dias'],
  ['finalizada no dia do prazo: no prazo', os(fin('2026-09-10')), HOJE, 'no_prazo', 'No prazo', 'entregue em 10/09 (finalizada no PCP), dentro do prazo (10/09)'],
  ['finalizada dois dias depois: com atraso', os(fin('2026-09-12')), HOJE, 'atraso', 'Com atraso', 'entregue em 12/09 (finalizada no PCP), 2 dias depois do prazo (10/09)'],
  ['a entrega lançada à mão vale antes da baixa do ERP', os({finalizadaEm:'2026-09-15T15:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-09-15T15:00:00.000Z', status:'ENTREGUE'}, entregaLancada:{data:'2026-09-10', por:'Gestor Teste'}}), HOJE, 'no_prazo', 'No prazo', '(lançada à mão)'],
  ['baixa do ERP sem lançamento: vale a data da baixa, sem prova', os({finalizadaEm:'2026-09-11T15:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-09-11T15:00:00.000Z', status:'ENTREGUE'}}), HOJE, 'atraso', 'Com atraso', 'baixa do ERP, sem prova'],
  ['entregue sem prazo combinado ("sem prazo" da F15): neutro, sem atraso a medir (revisão da F16)', os({...fin('2026-09-30'), prazoCombinado:{data:'', fonte:'semAgenda'}}), '2026-10-01', 'entregue', 'Entregue, sem prazo combinado', 'sem prazo combinado no PCP'],
  ['retrabalho marcado e entregue no prazo', os({...fin('2026-09-10'), retrabalho:true, problema:'Adesivo descolou'}), HOJE, 'retrabalho', 'Retrabalho', 'retrabalho marcado: Adesivo descolou'],
  ['retrabalho em O.S. ainda aberta também é retrabalho', os({retrabalho:true, instalacao:{data:'2026-09-25'}, prazoCombinado:{data:'2026-09-25', fonte:'agenda'}}), HOJE, 'retrabalho', 'Retrabalho', 'retrabalho marcado'],
  ['cancelada à mão pela gestão', os({cancelamento:cancel()}), HOJE, 'cancelado', 'Cancelado', 'cancelada por Gestor Teste em 15/09: Cliente desistiu do serviço'],
  ['cancelada no ERP (baixa automática CANCELADO)', os({finalizadaEm:'2026-09-12T15:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:'2026-09-12T15:00:00.000Z', status:'CANCELADO'}}), HOJE, 'cancelado', 'Cancelado', 'cancelada no ERP (baixa de 12/09)'],
  ['o pedido de cancelar ainda não enviado já mostra cancelado, marcado "a enviar"', os({cancelamento:{cancelar:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste'}}), HOJE, 'cancelado', 'Cancelado', '(a enviar)'],
  ['cancelamento desfeito não vale', os({...fin('2026-09-10'), cancelamento:cancel({ativo:false, desfeitoEm:'2026-09-16T10:00:00Z', desfeitoPor:'Admin Teste'})}), HOJE, 'no_prazo', 'No prazo', 'dentro do prazo'],
  ['marca forjada sem motivo não cancela', os({...fin('2026-09-10'), cancelamento:{ativo:true, motivo:'  '}}), HOJE, 'no_prazo', 'No prazo', 'dentro do prazo'],
  ['pedido de desfazer não cancela', os({...fin('2026-09-10'), cancelamento:{desfazer:true}}), HOJE, 'no_prazo', 'No prazo', 'dentro do prazo'],
  ['cliente retira no dia combinado', os({tipo:'interno', ...fin('2026-09-10')}), HOJE, 'no_prazo', 'No prazo', 'retirada em 10/09'],
];
test('a tabela: cada estado com o rótulo e o motivo', () => {
  for (const [nome, o, hoje, estado, rotulo, motivo] of TABELA) {
    const s = st(o, hoje);
    assert.equal(s.estado, estado, nome + ' → ' + JSON.stringify(s.aplicaveis));
    assert.equal(s.rotulo, rotulo, nome);assert.equal(s.aplicaveis[0].rotulo, rotulo, nome + ': o mesmo rótulo na lista');
    assert.ok(s.motivo.includes(motivo), `${nome}: motivo "${s.motivo}" sem "${motivo}"`);
    assert.ok(s.aplicaveis.length >= 1 && s.aplicaveis[0].estado === estado && s.aplicaveis.every(a => a.motivo), nome + ': sempre com o motivo');
    assert.doesNotMatch(s.motivo + s.aplicaveis.map(a => a.motivo).join(' '), /—/, nome + ': sem travessão');
  }
});

test('precedência: retrabalho com atraso mostra Retrabalho e diz que também atrasou; cancelado passa na frente de tudo', () => {
  const ra = st(os({...fin('2026-09-13'), retrabalho:true}));
  assert.equal(ra.estado, 'retrabalho');
  assert.deepEqual(estados(ra), ['retrabalho', 'atraso'], 'o atraso não some: vem logo abaixo');
  assert.equal(ra.diasAtraso, 3);assert.equal(ra.dataEntrega, '2026-09-13');
  const tudo = st(os({...fin('2026-09-13'), retrabalho:true, cancelamento:cancel()}));
  assert.equal(tudo.estado, 'cancelado');
  assert.deepEqual(estados(tudo), ['cancelado', 'retrabalho'], 'a cancelada não é julgada no prazo (sai da apuração)');
  // A ordem de `aplicaveis` é sempre a da precedência.
  for (const [, o, hoje] of TABELA) {
    const idx = st(o, hoje).aplicaveis.map(a => O.ESTADOS_ENTREGA.indexOf(a.estado));
    assert.deepEqual(idx, idx.slice().sort((a, b) => a - b));
  }
  assert.deepEqual(O.ESTADOS_ENTREGA, ['cancelado', 'retrabalho', 'retorno_antecipado', 'atraso', 'no_prazo', 'entregue', 'execucao', 'agendado']);
  // Aberta, atrasada e em execução: o atraso manda, a execução vem junto.
  const ae = st(os({horaSaida:'08:00', saidaEm:'2026-09-19T11:00:00.000Z'}));
  assert.deepEqual(estados(ae), ['atraso', 'execucao']);assert.equal(ae.entregue, false);
});

/* TROCADO DE PROPÓSITO NA F17 (30/09/2026): o retorno antecipado passou a ser
   medido pela chegada conferida da gestão (tests/ocorrencias-f17.test.cjs).
   Aqui fica o que continua: a hora que a EQUIPE anotou é só declaração, e
   sem chegada conferida o retorno é "sem dado", nunca perda. */
test('retorno antecipado: a hora anotada pela equipe é declaração; sem chegada conferida, "sem dado"', () => {
  // Caso ruim: retorno previsto 17:00, a equipe anotou 10:00. Quem decide é a chegada conferida pela gestão, que não veio.
  const o = os({...fin('2026-09-10'), retornoPrevisto:[{dia:'2026-09-10', hora:'17:00'}], horaSaida:'08:00', horaRetorno:'10:00', retornoEm:'2026-09-10T13:00:00.000Z'});
  const s = st(o, HOJE, R.REGRA_EMBUTIDA);
  assert.equal(s.estado, 'no_prazo');
  assert.ok(!estados(s).includes('retorno_antecipado'));
  assert.equal(s.retornoAntecipado.situacao, 'sem dado');
  assert.match(s.retornoAntecipado.motivo, /a equipe anotou 10:00, que é só declaração/);
  assert.ok(!s.perdas.includes('retornoAntecipado'));
});

test('perdas pela regra: retrabalho e atraso da entregue contam; o atraso da aberta ainda não; sem regra, nenhuma', () => {
  const regra = R.REGRA_EMBUTIDA;
  assert.deepEqual(st(os({...fin('2026-09-13'), retrabalho:true}), HOJE, regra).perdas, ['retrabalho', 'atraso']);
  assert.deepEqual(st(os(), HOJE, regra).perdas, [], 'aberta atrasada: ainda pode ser abonada ou cancelada');
  assert.deepEqual(st(os({...fin('2026-09-13'), retrabalho:true}), HOJE, null).perdas, []);
  assert.deepEqual(st(os({...fin('2026-09-13')}), HOJE, {...regra, perdas:['retrabalho']}).perdas, [], 'regra sem a perda de atraso');
});

/* ───────────── O.S. de vários dias ───────────── */
test('O.S. de três dias: o prazo vai até o último dia; execução no meio, atraso no dia seguinte ao fim', () => {
  const tres = (extra = {}) => os({instalacao:{data:'2026-09-10', periodo:'Manhã', duracaoDias:3}, ...extra});
  // Caso ruim: julgar pelo primeiro dia punia o serviço de vários dias.
  assert.equal(st(tres(fin('2026-09-12'))).estado, 'no_prazo');
  assert.match(st(tres(fin('2026-09-12'))).motivo, /dentro do prazo \(10\/09 a 12\/09\)/);
  const um = st(tres(fin('2026-09-13')));
  assert.equal(um.estado, 'atraso');assert.equal(um.diasAtraso, 1);assert.equal(um.prazo, '2026-09-12');assert.equal(um.prazoInicio, '2026-09-10');
  assert.equal(st(tres(), '2026-09-11').estado, 'execucao', 'segundo dia da agenda');
  assert.equal(st(tres(), '2026-09-12').estado, 'execucao', 'último dia');
  const vencida = st(tres(), '2026-09-13');
  assert.equal(vencida.estado, 'atraso');assert.match(vencida.motivo, /vencido há 1 dia,/);
  assert.equal(st(tres(), '2026-09-09').estado, 'agendado');
  // O prazo congelado vale mesmo com a agenda remarcada; a duração é a de agora.
  assert.equal(O.prazoDaEntrega(tres({instalacao:{data:'2026-09-20', duracaoDias:3}})).fim, '2026-09-12');
  assert.equal(O.prazoDaEntrega(os({tipo:'interno', instalacao:{data:'2026-09-10', duracaoDias:4}})).fim, '2026-09-10', 'cliente retira: o próprio dia');
});

/* ───────────── entrega por item ───────────── */
const marca = (id, dia, extra = {}) => ({id, tipo:'entregue', dia, via:'gestao', por:'Gestor Teste', em:dia + 'T12:00:00Z', ...extra});
const itens = (a = [], b = [], c) => [
  {uid:'9101:1:1', item:'1', descricao:'Placa ACM', qtde:'1', subtotal:'600', entregas:a},
  {uid:'9101:2:1', item:'2', descricao:'Totem', qtde:'1', subtotal:'400', entregas:b},
  {uid:'9101:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'100', ...(c ? {entregas:c} : {})},
];
test('entrega por item em dois dias: o prazo é julgado pela ÚLTIMA entrega', () => {
  const prazo11 = {instalacao:{data:'2026-09-11', duracaoDias:1}, prazoCombinado:{data:'2026-09-11', fonte:'agenda'}};
  // Caso ruim: o primeiro item foi no prazo, o segundo não. A O.S. atrasou.
  const dois = os({...prazo11, itens:itens([marca('e1', '2026-09-10', {qtde:1})], [marca('e2', '2026-09-12', {qtde:1})])});
  const s = st(dois);
  assert.equal(s.estado, 'atraso');assert.equal(s.dataEntrega, '2026-09-12');assert.equal(s.fonteEntrega, 'itens');assert.equal(s.diasAtraso, 1);
  assert.match(s.motivo, /entregue em 12\/09 \(última entrega por item\)/);
  assert.equal(s.entregue, true, 'todos os itens entregues por marca: entregue, mesmo sem finalizar');
  // A finalização depois não muda a data: vale a última entrega física.
  assert.equal(st({...dois, ...fin('2026-09-15')}).dataEntrega, '2026-09-12');
  // Só o primeiro item foi: em execução, "entrega parcial 1 de 2".
  const um = os({...prazo11, itens:itens([marca('e1', '2026-09-10', {qtde:1})])});
  const p = st(um, '2026-09-10');
  assert.equal(p.estado, 'execucao');assert.match(p.motivo, /^entrega parcial 1 de 2/);
  assert.deepEqual({entregues:p.parcial.entregues, total:p.parcial.total}, {entregues:1, total:2});
  // Vencido o prazo com a parcial: com atraso, e a parcial vem junto.
  const v = st(um, '2026-09-12');
  assert.deepEqual(estados(v), ['atraso', 'execucao']);assert.match(v.aplicaveis[1].motivo, /entrega parcial 1 de 2/);
  // Encerrada com item sem marca: o saldo conta na finalização (implícito), e ela é a última entrega.
  const f = st({...um, ...fin('2026-09-11')});
  assert.equal(f.estado, 'no_prazo');assert.equal(f.dataEntrega, '2026-09-11');
  // Um item só, em parte: a conta é de unidades.
  const unico = os({...prazo11, itens:[{uid:'u1', item:'1', descricao:'Placa', qtde:'10', entregas:[marca('p1', '2026-09-10', {qtde:6})]}]});
  assert.match(st(unico, '2026-09-10').motivo, /^entrega parcial 6 de 10/);
  // Dois itens, um em parte e nenhum completo: a conta de itens diz quantos estão em parte.
  const mista = os({...prazo11, itens:[{uid:'u1', item:'1', descricao:'Placa', qtde:'10', entregas:[marca('p1', '2026-09-10', {qtde:6})]}, {uid:'u2', item:'2', descricao:'Totem', qtde:'1'}]});
  assert.match(st(mista, '2026-09-10').motivo, /^entrega parcial 0 de 2 \(1 item em parte\)/);
  // Item com problema aberto: em execução, com o problema no motivo.
  const prob = os({...prazo11, itens:itens([{id:'x1', tipo:'problema', dia:'2026-09-10', motivo:'Placa riscada', via:'gestao'}])});
  assert.match(st(prob, '2026-09-10').motivo, /1 item com problema de entrega/);
});

test('cancelado: o da O.S. cancela todo o saldo e o entregue fica; o item cancelado sozinho não cancela a O.S.', () => {
  const entregueUm = itens([marca('e1', '2026-09-10', {qtde:1})]);
  // Caso ruim: o cancelamento da O.S. apagava a entrega que já tinha ido.
  const c = os({itens:entregueUm, cancelamento:cancel()});
  const s = st(c);
  assert.equal(s.estado, 'cancelado');assert.equal(s.entregue, true);assert.equal(s.dataEntrega, '2026-09-10');
  assert.match(s.motivo, /o que já foi entregue fica/);
  const L = E.lancamentosDaOS(c);
  assert.deepEqual(L.itens.map(x => x.situacao), ['entregue', 'cancelado', 'cancelado'], 'o saldo (item 2 e o serviço) é cancelado');
  assert.equal(L.saldo, 0);assert.ok(L.cancelado > 0);assert.equal(L.entregue, L.lancamentos.reduce((t, l) => t + l.valor, 0));
  assert.equal(E.canceladaOS(c), true);assert.equal(E.resumoOS(c).cancelados, 1, 'o totem (o serviço conta à parte)');assert.equal(E.resumoOS(c).entregues, 1);
  // A O.S. cancelada não recebe marca nova (a tela e o servidor usam o mesmo validador).
  const v = E.validarEvento({id:'n1', tipo:'entregue', dia:'2026-09-15', qtde:1}, c.itens[1], {papel:'pcp', os:c, hoje:HOJE});
  assert.equal(v.ok, false);assert.match(v.erro, /O\.S\. cancelada/);
  // Item cancelado sozinho: a O.S. segue, entregue no dia do item que foi.
  const soItem = os({itens:itens([marca('e1', '2026-09-10', {qtde:1})], [{id:'c2', tipo:'cancelado', dia:'2026-09-11', motivo:'Cliente tirou o totem', via:'gestao'}])});
  const si = st(soItem);
  assert.notEqual(si.estado, 'cancelado');assert.equal(si.cancelamento, null);
  assert.equal(si.estado, 'no_prazo');assert.equal(si.dataEntrega, '2026-09-10');
  assert.equal(E.canceladaOS(soItem), false);
  // Todos os itens cancelados um a um, sem entrega: a O.S. não vira cancelada sozinha.
  const todos = os({instalacao:{data:'2026-09-25'}, prazoCombinado:{data:'2026-09-25', fonte:'agenda'},
    itens:itens([{id:'c1', tipo:'cancelado', dia:'2026-09-11', motivo:'sem uso', via:'gestao'}], [{id:'c2', tipo:'cancelado', dia:'2026-09-11', motivo:'sem uso', via:'gestao'}])});
  assert.equal(st(todos).estado, 'agendado');
  // Cancelada no ERP sem marca: nada entregue.
  const erp = st(os({finalizadaEm:'2026-09-12T15:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:'2026-09-12T15:00:00.000Z', status:'CANCELADO'}}));
  assert.equal(erp.entregue, false);assert.equal(erp.cancelamento.origem, 'erp');
});

/* ───────────── a O.S. cancelada fora das listas de trabalho ───────────── */
test('cancelada: o status de agenda (que o Painel copia) não muda; sai de pendências, atrasadas, agenda e destaque', () => {
  const aberta = os({liberadoPCP:true, confirmacao:'Confirmado', instalacao:{data:HOJE, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-10', fonte:'agenda'}, veiculo:'Fiorino'});
  const c = {...aberta, cancelamento:cancel()};
  // Caso ruim: mexer no OPERACAO.status quebraria calado a cópia do Painel.
  assert.equal(O.status(c), O.status(aberta));assert.equal(O.status(c), 'confirmada');
  assert.ok(O.pendencias(aberta).length > 0);assert.deepEqual(O.pendencias(c), []);
  assert.equal(O.atrasada({...aberta, instalacao:{data:'2026-09-10'}}, HOJE), true);
  assert.equal(O.atrasada({...c, instalacao:{data:'2026-09-10'}}, HOJE), false);
  assert.deepEqual(O.programadas([aberta, c], HOJE, HOJE).map(o => o.id), [aberta.id]);
  const r = O.resumo([{...c, id:'c'}, {...aberta, id:'a'}], HOJE);
  assert.deepEqual(r.hoje.map(o => o.id), ['a']);
  assert.equal(O.destaqueDoDia([{...c, id:'c'}], HOJE), null);
  // Finalizada no PCP e cancelada depois: não é conclusão (produtividade, Painel do PCP).
  const feita = os({id:'f', ...fin('2026-09-12')});
  assert.deepEqual(O.conclusoes([feita, {...feita, id:'fc', cancelamento:cancel()}]).map(o => o.id), ['f']);
  // O pedido ainda não enviado já tira das listas; o desfeito volta.
  assert.deepEqual(O.pendencias({...aberta, cancelamento:{cancelar:true, motivo:'Cliente desistiu do serviço'}}), []);
  assert.ok(O.pendencias({...aberta, cancelamento:cancel({ativo:false, desfeitoEm:'x'})}).length > 0);
});

/* ───────────── fuso fixo ───────────── */
test('fuso fixo: o mesmo status com o processo em São Paulo, em UTC e em Tóquio', () => {
  // Caso ruim: finalizada às 23h30 de 29/09 na fábrica (02h30 de 30/09 em UTC).
  const script = `
    const O = require(${JSON.stringify(path.join(__dirname, '..', 'operacao.js'))});
    const casos = [
      {id:'f1', tipo:'externo', equipe:['Ana'], instalacao:{data:'2026-09-29'}, prazoCombinado:{data:'2026-09-29', fonte:'agenda'}, finalizadaEm:'2026-09-30T02:30:00.000Z', finalizadoPor:'Ana'},
      {id:'f2', tipo:'externo', equipe:['Ana'], instalacao:{data:'2026-09-29'}, prazoCombinado:{data:'2026-09-29', fonte:'agenda'}, finalizadaEm:'2026-09-30T03:30:00.000Z', finalizadoPor:'Ana'},
      {id:'f3', tipo:'externo', equipe:['Ana'], instalacao:{data:'2026-09-29', duracaoDias:2}, prazoCombinado:{data:'2026-09-29', fonte:'agenda'}, horaSaida:'08:00', saidaEm:'2026-09-29T11:00:00.000Z'},
      {id:'f4', tipo:'externo', cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço', em:'2026-09-30T02:30:00.000Z'}},
    ];
    process.stdout.write(JSON.stringify(casos.map(o => O.statusEntrega(o, '2026-09-30'))));`;
  const rodar = tz => execFileSync(process.execPath, ['-e', script], {env:{...process.env, TZ:tz, NODE_OPTIONS:''}, encoding:'utf8'});
  const sp = rodar('America/Sao_Paulo');
  assert.equal(rodar('UTC'), sp, 'UTC');
  assert.equal(rodar('Asia/Tokyo'), sp, 'Tóquio');
  const [f1, f2, f3, f4] = JSON.parse(sp);
  assert.equal(f1.dataEntrega, '2026-09-29');assert.equal(f1.estado, 'no_prazo', '23h30 da fábrica ainda é o dia do prazo');
  assert.equal(f2.dataEntrega, '2026-09-30');assert.equal(f2.estado, 'atraso');
  assert.equal(f3.estado, 'execucao');
  assert.match(f4.motivo, / em 29\/09:/, 'o dia do cancelamento também é o da fábrica');
});
