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
