/* ONDA ACABAMENTO, ITEM 5 (item 33 da fila de 11/10/2026; R68 e FP-47; a
   linha Baixa "Histórico da divisão apaga 'voltou a valer'").
   O histórico da divisão junta, do mesmo autor e em 10 minutos, o par
   "ficou desatualizada" e "voltou a valer" (tirar alguém e tocar Desfazer não
   gasta linha). Mas juntava nas DUAS ordens: "voltou a valer" seguido de
   "ficou desatualizada" é uma mudança nova da equipe, e o histórico apagava o
   "voltou a valer", mostrando a divisão como se nunca tivesse voltado. Só a
   ordem do Desfazer (desatualizar e depois reatualizar) se anula. Refeito à
   mão a partir do trabalho sem commit do worktree impresilk-f22s (o ramo não
   foi juntado). Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');

const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'), ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
  ficha('caio-f', 'Caio Fictício', 'caio', '10000333333'), ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344')];
const EQUIPES = [{id: 'eq-aguia', nome: 'Águia', emblema: '🦅', membros: [{chave: '100001', nome: 'Ana'}, {chave: '100002', nome: 'Bia'}], ativo: true}];
const row = registro => ({id: '1', colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id: '1', rev: 1, ...registro}});
const banco = () => ({pcp_registros: [row({numero: '5001', tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001', '100002'], veiculo: 'Carro fictício',
  instalacao: {data: '2026-09-30', periodo: 'Manhã', hora: '', duracaoDias: 1}})], registros: structuredClone(FICHAS),
  pcp_config_global: [{id: true, config: {instaladores: ['Ana', 'Bia'], performancePCP: {equipes: EQUIPES, participacoes: []}}, atualizado_em: '2026-09-19T10:00:00Z'}],
  equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const copia = e => structuredClone(gravada(e));
const acoes = e => gravada(e).alocacaoLog.map(x => x.acao);
const aguia = () => JSON.parse(JSON.stringify(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}])));
// A aba antiga que muda só os.equipe (sem a divisão): marca ou desmarca "desatualizada".
async function equipe(e, lista) {
  const o = copia(e); delete o.alocacao; delete o.alocacaoLog; o.equipe = lista;
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
}
const envelhecer = (e, min) => { gravada(e).alocacaoLog.at(-1).em = new Date(Date.now() - min * 60000).toISOString(); };

test('item 33: "voltou a valer" seguido de "ficou desatualizada" do mesmo autor fica no histórico (são duas mudanças, não um Desfazer)', async () => {
  const e = await edge('pcp-sync', banco());
  assert.equal((await e.call({action: 'upsert', os: {...copia(e), alocacao: aguia()}}, GESTOR)).status, 200);
  await equipe(e, ['100001', '100003']);           // ficou desatualizada
  envelhecer(e, 11);                               // há 11 minutos: a volta é outra sessão
  await equipe(e, ['100001', '100002']);           // voltou a valer
  assert.deepEqual(acoes(e), ['criar', 'desatualizar', 'reatualizar']);
  await equipe(e, ['100001', '100003']);           // ficou desatualizada de novo, agora mesmo
  // Caso ruim (v171): o par era anulado nas duas ordens e o histórico ficava ['criar', 'desatualizar'].
  assert.deepEqual(acoes(e), ['criar', 'desatualizar', 'reatualizar', 'desatualizar']);
  assert.equal(gravada(e).alocacao.desatualizada, true);
});

test('item 33 (controle): o Desfazer (ficou desatualizada e voltou a valer, mesmo autor, em 10 minutos) continua sem gastar linha', async () => {
  const e = await edge('pcp-sync', banco());
  assert.equal((await e.call({action: 'upsert', os: {...copia(e), alocacao: aguia()}}, GESTOR)).status, 200);
  await equipe(e, ['100001', '100003']);
  await equipe(e, ['100001', '100002']);
  assert.deepEqual(acoes(e), ['criar']);
  assert.ok(!gravada(e).alocacao.desatualizada);
});
