/* A ETAPA "PARADO · CLIENTE" NAO PODE VAZAR NEM SUMIR.
 *
 * Ela existe para separar o que esta parado por nossa conta do que esta parado
 * esperando o cliente -- as duas coisas caiam em "Apto" e ficavam
 * indistinguiveis na tela. Como a etapa e DERIVADA (nao ha campo `status`
 * gravado), errar a ordem dos ifs em operacao.js nao quebra nada: o chip
 * simplesmente conta zero para sempre, e ninguem ve erro.
 *
 * Os dois casos que mais doem estao aqui de proposito:
 *  - o fluxo INTERNO (cliente retira) nao tem instalacao para liberar, entao a
 *    etapa nunca pode aparecer la;
 *  - a O.S ANTIGA nao tem o campo novo, e precisa continuar exatamente onde
 *    estava -- a mudanca e retroativa sobre a carteira inteira.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const OPERACAO = require('../operacao.js');

const externa = (extra = {}) => ({ liberadoPCP: true, tipo: 'externo', instalacao: {}, equipe: [], ...extra });
const AGENDA = { data: '2026-09-20', periodo: 'Manhã' };
const MARCA = '2026-09-14T10:00:00Z';

test('externa pronta e marcada fica em parado_cliente', () => {
  assert.equal(OPERACAO.status(externa({ paradoClienteEm: MARCA })), 'parado_cliente');
});

test('sem a marca continua apto -- a etapa e marcada, nunca deduzida', () => {
  assert.equal(OPERACAO.status(externa()), 'apto');
});

test('agenda completa vence a marca: ninguem precisa lembrar de desmarcar', () => {
  const os = externa({ paradoClienteEm: MARCA, instalacao: AGENDA, equipe: ['Ana'] });
  assert.equal(OPERACAO.status(os), 'agendada');
});

test('finalizada vence a marca', () => {
  const os = externa({ paradoClienteEm: MARCA, finalizadaEm: '2026-09-14' });
  assert.equal(OPERACAO.status(os), 'finalizada');
});

test('CLIENTE RETIRA nunca entra na etapa, mesmo marcada', () => {
  const os = externa({ tipo: 'interno', paradoClienteEm: MARCA });
  assert.equal(OPERACAO.status(os), 'apto');
});

test('O.S sem o campo novo nao muda de etapa', () => {
  assert.equal(OPERACAO.status(externa({ instalacao: AGENDA, equipe: ['Ana'] })), 'agendada');
  assert.equal(OPERACAO.status(externa({ liberadoPCP: false })), 'aguardando_producao');
});

test('a etapa so vale depois do PCP liberar', () => {
  const os = externa({ liberadoPCP: false, paradoClienteEm: MARCA });
  assert.equal(OPERACAO.status(os), 'aguardando_producao');
});

test('paradoNoCliente concorda com status (as duas leituras nao podem divergir)', () => {
  const marcada = externa({ paradoClienteEm: MARCA });
  assert.equal(OPERACAO.paradoNoCliente(marcada), true);
  assert.equal(OPERACAO.status(marcada), 'parado_cliente');
  const agendada = externa({ paradoClienteEm: MARCA, instalacao: AGENDA, equipe: ['Ana'] });
  assert.equal(OPERACAO.paradoNoCliente(agendada), false);
  assert.notEqual(OPERACAO.status(agendada), 'parado_cliente');
});
