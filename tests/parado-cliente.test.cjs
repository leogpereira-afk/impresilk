/* "PARADO NO CLIENTE" E REGRA, NAO ETAPA.
 *
 * Nasceu como etapa do funil, entre `apto` e `agendada`. Durou um dia: como
 * etapa ela obrigava a inventar ordem ("vem antes ou depois de agendar?") e
 * colidia com o `confirmacao`, que ja e um portao do cliente logo adiante.
 * Virou uma VISTA do PCP -- "Ativos | Parado Cliente | Retrabalho | Arquivados"
 * -- mais um atalho na barra lateral.
 *
 * O que estes testes guardam agora e o PREDICADO, `OPERACAO.paradoNoCliente`,
 * porque ele e usado em TRES lugares que precisam concordar: a lista da vista,
 * o selo do card e o "proximo passo". Duas reguas para o mesmo estado e como a
 * tela e o servidor discordarem -- um dos dois esta mentindo.
 *
 * O caso que mais doe esta aqui: a O.S marcada e DEPOIS agendada. Se o
 * predicado nao a soltasse, ela ficaria na vista para sempre, e ninguem saberia
 * como tirar -- o botao de desmarcar nem aparece quando ja ha agenda.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const OPERACAO = require('../operacao.js');

const externa = (extra = {}) => ({ liberadoPCP: true, tipo: 'externo', instalacao: {}, equipe: [], ...extra });
const AGENDA = { data: '2026-09-20', periodo: 'Manhã' };
const MARCA = '2026-09-14T10:00:00Z';

test('marcada e sem agenda: esta parada no cliente', () => {
  assert.equal(OPERACAO.paradoNoCliente(externa({ paradoClienteEm: MARCA })), true);
});

test('sem a marca nao esta parada -- o estado e marcado, nunca deduzido', () => {
  assert.equal(OPERACAO.paradoNoCliente(externa()), false);
});

test('marcada e DEPOIS agendada sai sozinha (senao vira fantasma na vista)', () => {
  const os = externa({ paradoClienteEm: MARCA, instalacao: AGENDA, equipe: ['Ana'] });
  assert.equal(OPERACAO.paradoNoCliente(os), false);
});

test('finalizada nao esta parada', () => {
  assert.equal(OPERACAO.paradoNoCliente(externa({ paradoClienteEm: MARCA, finalizadaEm: '2026-09-14' })), false);
});

test('CLIENTE RETIRA nunca fica parada no cliente: nao ha instalacao para liberar', () => {
  assert.equal(OPERACAO.paradoNoCliente(externa({ tipo: 'interno', paradoClienteEm: MARCA })), false);
});

test('antes do PCP liberar nao conta: o servico ainda nem esta pronto', () => {
  assert.equal(OPERACAO.paradoNoCliente(externa({ liberadoPCP: false, paradoClienteEm: MARCA })), false);
});

test('A ETAPA SAIU DO FUNIL: marcada continua calculando como apto', () => {
  // Se voltar a existir 'parado_cliente' em status(), o stepper ganha um passo
  // fantasma e os chips passam a contar uma etapa que a vista ja mostra.
  assert.equal(OPERACAO.status(externa({ paradoClienteEm: MARCA })), 'apto');
  assert.equal(OPERACAO.status(externa()), 'apto');
});

test('O.S sem o campo novo nao muda de lugar', () => {
  assert.equal(OPERACAO.status(externa({ instalacao: AGENDA, equipe: ['Ana'] })), 'agendada');
  assert.equal(OPERACAO.paradoNoCliente(externa({ instalacao: AGENDA, equipe: ['Ana'] })), false);
});

/* "Cliente liberou" não apaga a história (23/09/2026). */
test('cliente liberou: o período parado vai para o log com de e até, e a O.S sai da vista', () => {
  const os = externa({ paradoClienteEm: MARCA, paradoClientePor: 'Gestor' });
  assert.equal(OPERACAO.fecharParado(os, '2026-09-18T15:00:00Z', 'Outra', 'cliente liberou'), true);
  assert.equal(OPERACAO.paradoNoCliente(os), false, 'volta para a fila de agendamento');
  assert.equal(os.paradoClienteEm, '');
  assert.equal(os.paradoClienteLog.length, 1);
  const p = os.paradoClienteLog[0];
  assert.equal(p.de, MARCA); assert.equal(p.ate, '2026-09-18T15:00:00Z');
  assert.equal(p.marcouPor, 'Gestor'); assert.equal(p.fechouPor, 'Outra'); assert.equal(p.motivo, 'cliente liberou');
});

test('fechar sem marca viva não inventa período; marcar de novo acumula no log', () => {
  const os = externa({});
  assert.equal(OPERACAO.fecharParado(os, '2026-09-18T15:00:00Z', 'X'), false);
  assert.equal(os.paradoClienteLog, undefined);
  os.paradoClienteEm = MARCA; OPERACAO.fecharParado(os, '2026-09-15T10:00:00Z', 'X');
  os.paradoClienteEm = '2026-09-16T10:00:00Z'; OPERACAO.fecharParado(os, '2026-09-17T10:00:00Z', 'X');
  assert.equal(os.paradoClienteLog.length, 2, 'dois períodos, nenhum sobrescrito');
});

/* Espelho do instalador: o cartão grande (23/09/2026). */
test('espelho: O.S vencida há meses NÃO vira "Sua próxima instalação"; a de hoje vira', () => {
  const hoje = '2026-09-23';
  const vencida = { id:'v', tipo:'externo', liberadoPCP:true, instalacao:{ data:'2026-06-10', periodo:'Manhã' } };
  const deHoje  = { id:'h', tipo:'externo', liberadoPCP:true, instalacao:{ data:hoje, periodo:'Tarde' } };
  const futura  = { id:'f', tipo:'externo', liberadoPCP:true, instalacao:{ data:'2026-09-25', periodo:'Manhã' } };
  assert.equal(OPERACAO.destaqueDoDia([vencida, deHoje, futura], hoje).id, 'h');
  assert.equal(OPERACAO.destaqueDoDia([vencida, futura], hoje).id, 'f', 'sem hoje: a próxima data, não a vencida');
  assert.equal(OPERACAO.destaqueDoDia([vencida], hoje), null, 'só vencida: cartão grande vazio, ela fica na lista');
});
test('espelho: retirada de hoje (interna, sem agenda) entra pelo prazo', () => {
  const hoje = '2026-09-23';
  const retirada = { id:'r', tipo:'interno', liberadoPCP:true, instalacao:{ data:hoje } };
  assert.equal(OPERACAO.destaqueDoDia([retirada], hoje).id, 'r');
});

test('programar fecha o parado com "agora"; marca antiga fecha no dia em que foi agendada, não hoje', () => {
  const nova = externa({ paradoClienteEm: MARCA, instalacao: AGENDA, equipe: ['Ana'] });
  assert.equal(OPERACAO.fecharParadoPorAgenda(nova, false, '2026-09-20T09:00:00Z', 'G'), true);
  assert.equal(nova.paradoClienteLog[0].ate, '2026-09-20T09:00:00Z');
  assert.equal(nova.paradoClienteLog[0].motivo, 'programada');
  // Revisão de 23/09: marcada em 01/09, agendada em 02/09, finalizada em 05/09; alguém salva a ficha em 23/09.
  const antiga = externa({ paradoClienteEm: '2026-09-01T10:00:00Z', instalacao: AGENDA, equipe: ['Ana'], finalizadaEm: '2026-09-05T10:00:00Z',
    historico: [{ etapa: 'apto', em: '2026-08-30T10:00:00Z' }, { etapa: 'agendada', em: '2026-09-02T10:00:00Z' }] });
  OPERACAO.fecharParadoPorAgenda(antiga, true, '2026-09-23T10:00:00Z', 'G');
  assert.equal(antiga.paradoClienteLog[0].ate, '2026-09-02T10:00:00Z', '1 dia parado, não 22');
  assert.equal(antiga.paradoClienteLog[0].motivo, 'legado');
  const semHist = externa({ paradoClienteEm: MARCA, instalacao: AGENDA, equipe: ['Ana'] });
  OPERACAO.fecharParadoPorAgenda(semHist, true, '2026-09-23T10:00:00Z', 'G');
  assert.equal(semHist.paradoClienteLog[0].ate, '', 'sem histórico: não inventa o fim');
  const semAgenda = externa({ paradoClienteEm: MARCA });
  assert.equal(OPERACAO.fecharParadoPorAgenda(semAgenda, false, 'agora', 'G'), false, 'sem agenda completa, segue parado');
});
test('espelho: serviço que já voltou hoje sai da frente; O.S. só com previsão de entrega não vira "próxima instalação"', () => {
  const hoje = '2026-09-23';
  const manha = { id:'m', tipo:'externo', liberadoPCP:true, instalacao:{ data:hoje, periodo:'Manhã' }, horaSaida:'08:00', horaRetorno:'11:30' };
  const tarde = { id:'t', tipo:'externo', liberadoPCP:true, instalacao:{ data:hoje, periodo:'Tarde' } };
  assert.equal(OPERACAO.destaqueDoDia([manha, tarde], hoje).id, 't');
  const soPrevisao = { id:'p', tipo:'externo', liberadoPCP:true, previsaoEntrega:'2026-09-24', instalacao:{} };
  const programada = { id:'g', tipo:'externo', liberadoPCP:true, instalacao:{ data:'2026-09-26', periodo:'Manhã' } };
  assert.equal(OPERACAO.destaqueDoDia([soPrevisao, programada], hoje).id, 'g');
});
