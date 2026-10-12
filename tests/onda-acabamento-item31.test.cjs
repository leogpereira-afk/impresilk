/* ONDA ACABAMENTO, ITEM 4 (item 31 da fila de 11/10/2026; R14 e R15).
   - porConta (o login da conta da gestão) descia para quem não é gestão
     (montagem com senha, operação, comercial) dentro da resposta do
     retrabalho e do lançamento da entrega; o porId já era podado. Agora o
     login sai igual ao ID, nas duas cópias da poda (aparelho e servidor,
     iguais por sorteio);
   - a cópia podada voltava e a resposta do retrabalho, comparada inteira,
     dava "A resposta da pergunta do retrabalho não foi gravada" a cada
     gravação de quem não é gestão; agora compara só a resposta e o "em", e a
     gravada fica com o ID e o login.
   Cada teste começa pelo caso ruim. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const PV = require('../privacidade-valores.js');

const FICHAS = [{colecao: 'colaboradores', id: 'gestor-f', apagado: false, registro: {id: 'gestor-f', nome: 'Gestor Teste', apelido: 'gestor', cpf: '11122233344'}}];
const row = registro => ({id: '1', colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id: '1', rev: 1, ...registro}});
const banco = () => ({pcp_registros: [row({numero: '8101', tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001'], finalizadaEm: '2026-10-01T18:00:00.000Z', finalizadoPor: 'Gestor Teste'})],
  registros: structuredClone(FICHAS), equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}],
  pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const PAPEIS = [{papel: 'operacao', nome: 'Operação Teste', sub: 'operacao1'}, {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'}, {papel: 'comercial', nome: 'Comercial Teste', sub: 'comercial1'}];
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;

test('item 31: o login de quem gravou não desce para quem não é gestão, e a cópia podada que volta não dá aviso falso de retrabalho', async () => {
  const e = await edge('pcp-sync', banco());
  // A gestão responde a pergunta do retrabalho e lança a entrega: os dois levam o carimbo (nome, login e ID).
  const g = structuredClone(gravada(e));
  g.retrabalhoPerguntado = {resposta: 'nao', em: '2026-10-01T18:05:00.000Z'};
  g.entregaLancada = {data: '2026-10-01'};
  assert.equal((await e.call({action: 'upsert', os: g}, GESTOR)).status, 200);
  assert.equal(gravada(e).retrabalhoPerguntado.porConta, 'gestor');
  assert.equal(gravada(e).entregaLancada.porConta, 'gestor');
  for (const quem of PAPEIS) {
    const lista = await e.call({action: 'list'}, quem);
    const minha = structuredClone(lista.os.find(o => o.id === '1'));
    // Caso ruim (v171): "porConta":"gestor" descia na resposta do retrabalho e no lançamento.
    assert.doesNotMatch(JSON.stringify(minha), /PorConta|porConta|"porId"/, quem.papel);
    assert.equal(minha.retrabalhoPerguntado.por, 'Gestor Teste', quem.papel + ': o nome continua');
    if (quem.papel === 'comercial') continue; // o comercial lê
    minha.obsTecnicas = 'gravação fictícia de ' + quem.papel;
    const r = await e.call({action: 'upsert', os: minha}, quem);
    assert.equal(r.status, 200, quem.papel);
    // Caso ruim (v171): "A resposta da pergunta do retrabalho não foi gravada" a cada gravação.
    assert.ok(!(r.avisos || []).some(a => /pergunta do retrabalho/.test(a)), quem.papel + ': ' + JSON.stringify(r.avisos));
    assert.doesNotMatch(JSON.stringify(r.os), /porConta/, quem.papel + ': a resposta do upsert também');
    const gr = gravada(e);
    assert.deepEqual([gr.retrabalhoPerguntado.resposta, gr.retrabalhoPerguntado.porConta, gr.entregaLancada.porConta], ['nao', 'gestor', 'gestor'], quem.papel + ': o gravado fica inteiro');
  }
  // Quem não é gestão mudando a resposta continua sem gravar, com o aviso de verdade.
  const op = structuredClone((await e.call({action: 'list'}, PAPEIS[0])).os.find(o => o.id === '1'));
  op.retrabalhoPerguntado = {...op.retrabalhoPerguntado, resposta: 'sim'};
  const r = await e.call({action: 'upsert', os: op}, PAPEIS[0]);
  assert.ok(r.avisos.some(a => /pergunta do retrabalho não foi gravada/.test(a)));
  assert.equal(gravada(e).retrabalhoPerguntado.resposta, 'nao');
});

test('item 31: as duas cópias da poda (aparelho e servidor) dão o mesmo em 300 objetos sorteados', async () => {
  const {podarValoresPCP} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  let a = 31 >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const um = xs => xs[Math.floor(r() * xs.length)];
  const CHAVES = ['porId', 'porConta', 'desfeitoPorConta', 'revogadoPorConta', 'por', 'em', 'valorTotal', 'subtotal', 'resposta', 'conta', 'porContaX', 'id', 'pessoaId'];
  const gerar = n => n <= 0 ? um(['x', 1, null, true]) : r() < 0.3 ? Array.from({length: 1 + Math.floor(r() * 3)}, () => gerar(n - 1))
    : Object.fromEntries(Array.from({length: 1 + Math.floor(r() * 5)}, () => [um(CHAVES), gerar(n - 1)]));
  for (let i = 0; i < 300; i++) {
    const o = gerar(3);
    assert.deepEqual(PV.podar(o), podarValoresPCP(o), JSON.stringify(o));
  }
  assert.deepEqual(PV.podar({porConta: 'g', desfeitoPorConta: 'g', revogadoPorConta: 'g', porId: '111222', por: 'Nome', conta: 'c'}), {por: 'Nome', conta: 'c'});
});
