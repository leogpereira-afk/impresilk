/* ONDA ACABAMENTO, ITEM 9 (da verificação da v170, baixas): O ID DE QUEM
   GRAVOU FALHA FECHADO.
   - idDaConta (a conta da gestão, em ID, pela Central de Acessos) não
     conferia acesso_conta.valido_ate: a conta vencida continuava dando o ID
     (e contava como quem aprova a comissão pela tela). Agora a conta vencida
     (valido_ate antes de hoje, em São Paulo) não dá ID nenhum, nem pelo
     apelido; sem validade, ou válida até hoje, vale como antes;
   - se a leitura do RH falhava, o ID assinado no crachá entrava como se fosse
     único, mesmo que estivesse repetido no RH. Agora o ID de quem gravou fica
     em branco nessa gravação (falha fechada só para o ID), a gravação segue,
     com aviso; nunca 422 nem fila presa.
   Em 12/10/2026 (SELECT, só contagens) nenhuma das 17 contas da Central tinha
   validade. Cada teste começa pelo caso ruim. Tudo fictício. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now()), ONTEM = diaSP(Date.now() - 864e5), AMANHA = diaSP(Date.now() + 864e5);
const FICHAS = [{id: 'g', nome: 'Gestor Teste', apelido: 'gestor', cpf: '11122233344'}];
const regua = async () => (await shared()).resolverPessoas({pessoas: FICHAS.map(f => ({...f, id: '111222'})), lista: []});

test('item 9: a conta vencida na Central não dá ID (nem pelo apelido); sem validade ou válida até hoje, dá', async () => {
  const {idDaConta} = await shared();
  const r = await regua();
  const conta = extra => [{usuario: 'gestor', id_pessoa: '111222', ativo: true, tipo: 'pessoa', ...extra}];
  // Caso ruim (v171): valido_ate não era lido, e a conta vencida ontem continuava dando o ID.
  assert.equal(idDaConta('gestor', conta({valido_ate: ONTEM}), r), '');
  assert.equal(idDaConta('gestor', [{usuario: 'gestor', ativo: true, tipo: 'pessoa', valido_ate: ONTEM}], r), '', 'nem pelo apelido');
  assert.equal(idDaConta('gestor', conta({valido_ate: HOJE}), r), '111222', 'vale até o fim do dia');
  assert.equal(idDaConta('gestor', conta({valido_ate: AMANHA}), r), '111222');
  assert.equal(idDaConta('gestor', conta({valido_ate: null}), r), '111222', 'sem validade, como antes');
  assert.equal(idDaConta('gestor', [], r), '111222', 'sem conta na Central, o apelido, como antes');
});

test('item 9: com o RH fora do ar, o ID assinado no crachá não entra no diário como único; a gravação segue com aviso', async () => {
  const row = {id: '1', colecao: 'os', apagado: false, atualizado_em: '2026-10-01T10:00:00Z', registro: {id: '1', rev: 1, numero: '8101', tipo: 'externo', cliente: 'Cliente Fictício', equipe: []}};
  // Duas fichas de pessoas diferentes com o mesmo começo de CPF: o ID 111222 está repetido no RH.
  const fichas = [{colecao: 'colaboradores', id: 'a', apagado: false, registro: {id: 'a', nome: 'Pessoa Um', apelido: 'um', cpf: '11122233344'}},
    {colecao: 'colaboradores', id: 'b', apagado: false, registro: {id: 'b', nome: 'Pessoa Dois', apelido: 'dois', cpf: '11122299988'}}];
  const e = await edge('pcp-sync', {pcp_registros: [row], registros: fichas, pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T00:00:00Z'}]});
  const original = e.cliente.from.bind(e.cliente);
  e.cliente.from = t => { const q = original(t); if (t === 'registros') q.then = resolve => resolve({data: null, error: {message: 'RH fora do ar'}}); return q; };
  const quem = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor', id: '111222'};
  const o = structuredClone(row.registro); o.veiculo = 'Carro fictício';
  const r = await e.call({action: 'upsert', os: o}, quem);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(e.db.pcp_registros.find(x => x.colecao === 'os').registro.veiculo, 'Carro fictício', 'a gravação seguiu');
  const d = e.db.pcp_registros.filter(x => x.colecao === 'auditoria').map(x => x.registro);
  assert.equal(d.length, 1);
  // Caso ruim (v171): o diário levava porId 111222, que no RH é de duas pessoas.
  assert.equal(d[0].autor.porId, '', 'o ID fica em branco quando o RH não pôde conferir');
  assert.equal(d[0].autor.login, 'gestor', 'o login continua');
  assert.ok((r.avisos || []).some(a => /O RH não respondeu agora/.test(a)), JSON.stringify(r.avisos));
});
