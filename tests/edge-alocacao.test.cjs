/* ALOCAÇÃO DENTRO DA O.S. (F08, 29/09/2026). A divisão da equipe passa a
   morar na O.S. (os.alocacao, formato do motor DIVISAO) e só admin e pcp a
   mudam. O servidor confere com o motor da cópia _shared e com a chave
   estrangeira (equipe no cadastro, pessoa nas fichas e contratos do RH),
   recalcula o final, deriva os.equipe, guarda o histórico (alocacaoLog, teto
   40) e escreve no diário. O que não passa é descartado com aviso e
   `descartado` na resposta, nunca 422: o aparelho repõe a versão do servidor
   e mostra um aviso fixo. Aba antiga que troca só os.equipe marca a divisão
   `desatualizada`, e a performance só confirma divisão válida e atual.
   Cada teste começa pelo caso ruim. Dados fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const O = require('../operacao.js');
const RAIZ = path.join(__dirname, '..');
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

// CPF fictício com os dígitos verificadores certos (o contrato de freelancer exige).
function cpf(base9) {
  const dv = (b, p) => { let s = 0; for (let i = 0; i < b.length; i++) s += Number(b[i]) * (p - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base9, 10), d2 = dv(base9 + d1, 11);
  return base9 + d1 + d2;
}
const ficha = (id, nome, apelido, cpfTxt, extra = {}) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf: cpfTxt, ...extra}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '100001.111-11'.replace(/\D/g, '')),
  ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
  ficha('caio-f', 'Caio Fictício', 'caio', '10000333333', {dataDesligamento: '2026-09-20'}),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  {colecao: 'freelancers', id: 'fl-1', apagado: false, registro: {id: 'fl-1', nome: 'Davi Prestador', apelido: 'davi', cpf: cpf('300004123'), funcao: 'Instalador', situacao: 'ativo', contratoFim: ''}},
];
const ID_DAVI = cpf('300004123').slice(0, 6);
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', emblema: '🦅', membros: [{chave: '100001', nome: 'Ana'}, {chave: '100002', nome: 'Bia'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', emblema: '🦁', membros: [{chave: ID_DAVI, nome: 'Davi'}], ativo: true},
];
const CFG = {instaladores: ['Ana', 'Bia'], performancePCP: {equipes: EQUIPES, participacoes: []}};
const row = (id, registro, extra = {}) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', ...extra, registro: {id, rev: 1, ...registro}});
const base = (extra = {}) => row('1', {numero: '5001', tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001', '100002'], veiculo: 'Fiorino',
  instalacao: {data: '2026-09-30', periodo: 'Manhã', hora: '', duracaoDias: 1}, ...extra});
const banco = (regs, extra = {}) => ({pcp_registros: regs, registros: structuredClone(FICHAS),
  pcp_config_global: [{id: true, config: structuredClone(CFG), atualizado_em: '2026-09-19T10:00:00Z'}],
  equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}], ...extra});
const gestor = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const admin = {papel: 'admin', nome: 'Admin Teste', sub: 'admin1'};
const operacao = {papel: 'operacao', nome: 'Operação Teste', sub: 'operacao1'};
const montagem = {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'};
const toque = {nome: 'Ana', sub: 'Ana', id: '100001', papel: 'montagem', montagemIndividual: true};
const gravada = (e, id = '1') => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const copia = (e, id = '1') => structuredClone(gravada(e, id));
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
// A divisão da Águia no padrão (líder Ana 60, Bia 40).
const aguia = () => JSON.parse(JSON.stringify(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}])));
// O RH fora do ar: toda leitura de `registros` falha.
function rhFora(e) {
  const original = e.cliente.from.bind(e.cliente);
  e.cliente.from = t => { const q = original(t); if (t === 'registros') q.then = resolve => resolve({data: null, error: {message: 'RH fora do ar'}}); return q; };
}
// Grava uma divisão válida pela gestão e devolve a O.S. como ficou.
async function comAlocacao(e, aloc = aguia()) {
  const r = await e.call({action: 'upsert', os: {...copia(e), alocacao: aloc}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!r.descartado, JSON.stringify(r));
  return gravada(e);
}

/* ───────────── motor: a regra única de "confirmada" ───────────── */

test('motor: confirmada só com divisão válida, não desatualizada e com a mesma gente de os.equipe (as duas cópias)', async () => {
  const M = await import('../supabase/functions/_shared/pcp-divisao.mjs');
  const a = aguia();
  for (const X of [D, M]) {
    // Caso ruim 1: a aba antiga trocou os.equipe e a divisão continua dizendo Ana e Bia.
    assert.equal(X.alocacaoConfirmada({equipe: ['100001', ID_DAVI], alocacao: a}), false);
    // Caso ruim 2: marcada desatualizada pelo servidor.
    assert.equal(X.alocacaoConfirmada({equipe: ['100001', '100002'], alocacao: {...a, desatualizada: true}}), false);
    // Caso ruim 3: soma quebrada.
    const quebrada = structuredClone(a); quebrada.grupos[0].membros[0].cota = 7000;
    assert.equal(X.alocacaoConfirmada({equipe: ['100001', '100002'], alocacao: quebrada}), false);
    assert.equal(X.alocacaoConfirmada({equipe: ['100002', '100001'], alocacao: a}), true, 'a ordem não importa');
    assert.equal(X.alocacaoConfirmada({equipe: ['100001', '100002']}), false, 'sem divisão não confirma');
    assert.equal(X.mesmaGente(['100001', ' 100002 ', '100001'], a), true);
  }
});

/* ───────────── quem pode mudar ───────────── */

test('operação, montagem com senha, toque e máquina não mudam a divisão gravada (e ninguém leva 422)', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  const antes = await comAlocacao(e);
  const forjada = aguia(); forjada.grupos[0].membros[0].cota = 5000; forjada.grupos[0].membros[1].cota = 5000;
  for (const quem of [operacao, montagem, 'machine']) {
    const r = await e.call({action: 'upsert', os: {...copia(e), alocacao: forjada}}, quem);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(gravada(e).alocacao, antes.alocacao, 'a divisão gravada fica: ' + JSON.stringify(quem));
    assert.deepEqual(gravada(e).equipe, ['100001', '100002']);
  }
  // Operação ouve o porquê e o aparelho recebe `descartado` para repor.
  const r = await e.call({action: 'upsert', os: {...copia(e), alocacao: forjada}}, operacao);
  assert.deepEqual(r.descartado, ['alocacao']);
  assert.match(r.avisos.join(' '), /Só a gestão/);
  // Toque: a mescla parte do gravado; nada da divisão entra, e o check-in grava.
  const t = await e.call({action: 'upsert', os: {id: '1', rev: gravada(e).rev, alocacao: forjada, alocacaoLog: [], horaSaida: '08:10', saidaEm: '2026-09-30T11:10:00.000Z'}}, toque);
  assert.equal(t.status, 200, JSON.stringify(t));
  assert.deepEqual(gravada(e).alocacao, antes.alocacao);
  assert.deepEqual(gravada(e).alocacaoLog, antes.alocacaoLog);
  assert.equal(gravada(e).horaSaida, '08:10');
});

test('esqueleto do ERP (reimportação sem rev) não apaga a divisão', async () => {
  const e = await edge('pcp-sync', banco([row('mub-9', {numero: '9', origemMubisys: true, tipo: 'externo', cliente: 'ERP', equipe: ['100001', '100002'],
    instalacao: {data: '2026-09-30', periodo: 'Manhã', hora: '', duracaoDias: 1}})]));
  const r0 = await e.call({action: 'upsert', os: {...copia(e, 'mub-9'), alocacao: aguia()}}, gestor);
  assert.equal(r0.status, 200, JSON.stringify(r0));
  const antes = copia(e, 'mub-9');
  const esqueleto = {id: 'mub-9', numero: '9', origemMubisys: true, tipo: 'externo', cliente: 'ERP', equipe: [], atualizadoPor: 'Mubisys (auto)'};
  const r = await e.call({action: 'upsert', os: esqueleto}, 'machine');
  assert.equal(r.status, 200);
  assert.deepEqual(gravada(e, 'mub-9').alocacao, antes.alocacao);
  assert.deepEqual(gravada(e, 'mub-9').equipe, ['100001', '100002']);
});

test('baixa do ERP concorrente não apaga a divisão gravada no meio', async () => {
  const aberta = row('mub-1', {numero: '1', origemMubisys: true, tipo: 'externo', cliente: 'ERP', equipe: [], instalacao: {data: '2026-09-01'}});
  const e = await edge('pcp-mubisys', {pcp_registros: [aberta]});
  e.run(`erpGet = async () => ({data:[{sequencial_ordem:'1',status:'ENTREGUE'}]})`);
  e.run(`console = {...console, warn:()=>{}}`);
  const aloc = {...aguia(), por: 'Gestor Teste', em: '2026-09-29T15:00:00Z'};
  e.cliente.beforeWrite = db => { const r = db.pcp_registros[0]; r.atualizado_em = '2026-09-29T15:00:00Z'; r.registro = {...r.registro, equipe: ['100001', '100002'], alocacao: aloc, alocacaoLog: [{acao: 'criar'}], rev: 2}; };
  const res = await e.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`);
  assert.equal(res.baixadas, 1, JSON.stringify(res));
  const g = gravada(e, 'mub-1');
  assert.deepEqual(g.alocacao, aloc);assert.deepEqual(g.alocacaoLog, [{acao: 'criar'}]);assert.ok(g.finalizadaEm);
});

/* ───────────── a gestão grava: conferida, recalculada, derivada ───────────── */

test('soma errada vinda do admin é descartada com aviso e resposta 200; o resto da gravação passa; o diário registra', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  const quebrada = aguia(); quebrada.grupos[0].membros[1].cota = 3000;
  const r = await e.call({action: 'upsert', os: {...copia(e), alocacao: quebrada, obsPCP: 'recado do PCP'}}, admin);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.descartado, ['alocacao']);
  assert.match(r.descartadoMotivo.alocacao, /somar 100%/);
  assert.match(r.avisos.join(' '), /não foi gravada/);
  assert.ok(!('alocacao' in gravada(e)), 'nada novo nasce de uma divisão inválida');
  assert.equal(gravada(e).obsPCP, 'recado do PCP', 'o resto da O.S. grava');
  const d = diario(e).find(x => x.acao === 'descartar');
  assert.ok(d, 'o descarte entra no diário');
  assert.deepEqual(d.campos, ['alocacao']);
  assert.match(d.depois.alocacao.descartada, /somar 100%/);
  assert.equal(d.autor.login, 'admin1');
});

test('o final mandado pelo aparelho é ignorado e recalculado; o carimbo é do crachá; freelancer vem do RH', async () => {
  const e = await edge('pcp-sync', banco([base({equipe: []})]));
  const a = JSON.parse(JSON.stringify(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}, {equipeId: 'eq-leao', liderId: ID_DAVI, membros: [ID_DAVI]}])));
  // Caso ruim: o aparelho manda um final forjado (Davi com 90%), carimbo e marcas forjados.
  const veio = {...a, final: [{pessoaId: ID_DAVI, grupo: 1, equipeId: 'eq-leao', papel: 'lider', freelancer: false, cota: 9000}], por: 'Forjado', porId: '999999', desatualizada: true};
  veio.grupos[1].membros[0].freelancer = false;
  const r = await e.call({action: 'upsert', os: {...copia(e), alocacao: veio}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = gravada(e);
  assert.deepEqual(g.alocacao.final, D.finais(a).map(f => f.pessoaId === ID_DAVI ? {...f, freelancer: true} : f));
  assert.equal(g.alocacao.final.reduce((s, f) => s + f.cota, 0), 10000);
  assert.equal(g.alocacao.grupos[1].membros[0].freelancer, true, 'a marca de freelancer sai do contrato do RH');
  assert.equal(g.alocacao.por, 'Gestor Teste');assert.equal(g.alocacao.porId, '111222');
  assert.ok(!('desatualizada' in g.alocacao));
  assert.deepEqual(g.equipe, ['100001', '100002', ID_DAVI], 'os.equipe derivada da divisão');
  assert.ok(g.rev > 1, 'a versão sobe');
});

test('pessoa ou equipe inexistente é descartada; RH fora aceita e marca para conferir', async () => {
  let e = await edge('pcp-sync', banco([base()]));
  const semFicha = JSON.parse(JSON.stringify(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '777777']}])));
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: semFicha}}, gestor);
  assert.equal(r.status, 200);assert.deepEqual(r.descartado, ['alocacao']);
  assert.match(r.descartadoMotivo.alocacao, /777777/);
  assert.ok(!('alocacao' in gravada(e)));
  assert.deepEqual(gravada(e).equipe, ['100001', '100002'], 'a lista gravada fica quando a que veio saiu da divisão recusada');
  const semEquipe = aguia(); semEquipe.grupos[0].equipeId = 'eq-inventada';
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: semEquipe}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.match(r.descartadoMotivo.alocacao, /cadastro de equipes/);
  // RH fora do ar: aceita, marca e avisa. A equipe continua conferida (vem da config).
  e = await edge('pcp-sync', banco([base()]));
  rhFora(e);
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: semFicha}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!r.descartado);
  assert.equal(gravada(e).alocacao.conferirRH, true);
  assert.match(r.avisos.join(' '), /RH não respondeu/);
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: semEquipe}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao'], 'equipe inexistente é descartada mesmo com o RH fora');
});

test('ficha desligada: vale para O.S. de antes da saída; depois dela é descartada', async () => {
  const caio = () => JSON.parse(JSON.stringify(D.montar([{equipeId: null, liderId: '100003', membros: ['100003', '100001']}])));
  // Caso ruim: O.S. de outubro com quem saiu em 20/09.
  let e = await edge('pcp-sync', banco([base({instalacao: {data: '2026-10-02', periodo: 'Manhã', hora: '', duracaoDias: 1}})]));
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: caio()}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao'], JSON.stringify(r));
  assert.match(r.descartadoMotivo.alocacao, /saiu em 20\/09\/2026/);
  // Pendência de setembro: serviço lançado em 18/09, dois dias antes da saída.
  e = await edge('pcp-sync', banco([base({finalizadaEm: '2026-09-25T18:00:00Z', entregaLancada: {data: '2026-09-18'}})]));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: caio()}}, gestor);
  assert.equal(r.status, 200);assert.ok(!r.descartado, JSON.stringify(r));
  assert.deepEqual(gravada(e).equipe, ['100003', '100001']);
});

test('os.equipe derivada: a chave da volta e a trava da equipe ficam iguais antes e depois', async () => {
  const {pertenceEquipe, resolverPessoas} = await shared();
  const e = await edge('pcp-sync', banco([base({equipe: ['100002', '100001'], retornoEm: '2026-09-30T18:00:00Z'})]));
  const antes = copia(e);
  await comAlocacao(e);
  const depois = copia(e);
  assert.equal(O.chaveDaVolta(depois), O.chaveDaVolta(antes));
  const pessoas = resolverPessoas({pessoas: [{id: '100001', nome: 'Ana Fictícia', apelido: 'ana'}, {id: '100002', nome: 'Bia Fictícia', apelido: 'bia'}], lista: ['Ana', 'Bia']});
  for (const quem of [{nome: 'Ana', id: '100001'}, {nome: 'Bia', id: '100002'}, {nome: 'Caio', id: '100003'}])
    assert.equal(pertenceEquipe(depois, quem, pessoas), pertenceEquipe(antes, quem, pessoas), quem.nome);
});

test('aba v133 que muda só os.equipe: fica a lista nova e a divisão é marcada desatualizada (e volta quando a gente volta)', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  await comAlocacao(e);
  const v133 = copia(e); delete v133.alocacao; delete v133.alocacaoLog; v133.equipe = ['100001', ID_DAVI];
  let r = await e.call({action: 'upsert', os: v133}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!r.descartado);
  const g = gravada(e);
  assert.deepEqual(g.equipe, ['100001', ID_DAVI], 'a lista nova fica');
  assert.equal(g.alocacao.desatualizada, true);
  assert.equal(g.alocacaoLog.at(-1).acao, 'desatualizar');
  assert.ok(diario(e).some(x => x.campos.includes('alocacao') && x.depois.alocacao?.desatualizada === true), 'o diário registra');
  // A mesma aba devolvendo a divisão como recebeu não conta como mudança dela.
  r = await e.call({action: 'upsert', os: {...copia(e), obsPCP: 'x'}}, gestor);
  assert.ok(!r.descartado);assert.equal(gravada(e).alocacao.desatualizada, true);
  // A equipe volta a ser a da divisão: a marca sai.
  r = await e.call({action: 'upsert', os: {...copia(e), equipe: ['100002', '100001']}}, operacao);
  assert.equal(r.status, 200);
  assert.ok(!('desatualizada' in gravada(e).alocacao));
});

test('alocacaoLog: só acréscimo, montado pelo servidor, com autor, antes e depois, e teto de 40', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  let g = await comAlocacao(e);
  assert.equal(g.alocacaoLog.length, 1);
  assert.equal(g.alocacaoLog[0].acao, 'criar');assert.equal(g.alocacaoLog[0].antes, null);
  assert.equal(g.alocacaoLog[0].por, 'Gestor Teste');assert.equal(g.alocacaoLog[0].porId, '111222');
  assert.deepEqual(g.alocacaoLog[0].depois.grupos[0].membros.map(m => m.cota), [6000, 4000]);
  // Caso ruim: o aparelho manda um log reescrito.
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacaoLog: [{acao: 'forjada'}]}}, gestor);
  assert.deepEqual(gravada(e).alocacaoLog, g.alocacaoLog, 'o log do aparelho nunca entra');
  // 45 edições: o log guarda as 40 últimas.
  for (let i = 0; i < 45; i++) {
    const a = aguia(); const v = i % 2 ? 6000 : 5000;
    a.grupos[0].membros[0].cota = v; a.grupos[0].membros[1].cota = 10000 - v; a.manual = true;
    r = await e.call({action: 'upsert', os: {...copia(e), alocacao: a}}, gestor);
    assert.ok(!r.descartado, JSON.stringify(r));
  }
  g = gravada(e);
  assert.equal(g.alocacaoLog.length, 40);
  assert.equal(g.alocacaoLog.at(-1).acao, 'alterar');
  assert.ok(g.alocacaoLog.at(-1).antes && g.alocacaoLog.at(-1).depois, 'antes e depois');
  // Limpar de propósito (gestão, null) fica no log.
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: null}}, gestor);
  assert.equal(gravada(e).alocacao, null);assert.equal(gravada(e).alocacaoLog.at(-1).acao, 'limpar');
  assert.equal(gravada(e).alocacaoLog.length, 40);
  // O diário guarda do histórico só o tamanho e as linhas novas, não as 40 duas vezes.
  const ultima = diario(e).filter(x => x.campos.includes('alocacaoLog')).at(-1);
  assert.deepEqual(ultima.antes.alocacaoLog, {linhas: 40});
  assert.equal(ultima.depois.alocacaoLog.linhas, 40);
  assert.equal(ultima.depois.alocacaoLog.novas.length, 1);assert.equal(ultima.depois.alocacaoLog.novas[0].acao, 'limpar');
});

/* ───────────── o que desce para cada aparelho ───────────── */

test('list e getCfg do toque e da montagem com senha sem percentuais; operação sem o ID de quem gravou', async () => {
  const cfg = structuredClone(CFG);
  cfg.performancePCP.participacoes = [{id: '1', membros: [{chave: '100001', nome: 'Ana', percentual: 60}, {chave: '100002', nome: 'Bia', percentual: 40}]}];
  const e = await edge('pcp-sync', banco([base()], {pcp_config_global: [{id: true, config: cfg, atualizado_em: '2026-09-19T10:00:00Z'}]}));
  await comAlocacao(e);
  for (const quem of [toque, montagem]) {
    const l = await e.call({action: 'list', escopo: 'tudo'}, quem);
    assert.equal(l.status, 200, JSON.stringify(l));
    const os = (l.os || []).find(o => o.id === '1');
    assert.ok(os, 'a O.S. desce');
    assert.ok(!('alocacao' in os) && !('alocacaoLog' in os), 'sem divisão: ' + quem.sub);
    const c = await e.call({action: 'getCfg'}, quem);
    assert.ok(!c.cfg.performancePCP || !('participacoes' in c.cfg.performancePCP), 'sem participações: ' + quem.sub);
  }
  const l = await e.call({action: 'list', escopo: 'tudo'}, operacao);
  const os = l.os.find(o => o.id === '1');
  assert.ok(os.alocacao && !('porId' in os.alocacao), 'operação vê a divisão sem o ID de quem gravou');
  assert.ok(os.alocacaoLog.every(x => !('porId' in x)));
  const g = (await e.call({action: 'list', escopo: 'tudo'}, gestor)).os.find(o => o.id === '1');
  assert.equal(g.alocacao.porId, '111222', 'a gestão vê tudo');
});

test('podarToque tira a divisão e o histórico (regra pura)', async () => {
  const {podarToque, podarAlocacao, podarIdsAlocacao} = await shared();
  const r = {id: '1', equipe: ['100001'], alocacao: {grupos: [], porId: '111222'}, alocacaoLog: [{acao: 'criar', porId: '111222'}]};
  assert.deepEqual(podarToque(r).equipe, ['100001']);
  assert.ok(!('alocacao' in podarToque(r)) && !('alocacaoLog' in podarToque(r)));
  assert.ok(!('alocacao' in podarAlocacao(r)));
  assert.deepEqual(podarIdsAlocacao(r).alocacao, {grupos: []});
  assert.deepEqual(podarIdsAlocacao(r).alocacaoLog, [{acao: 'criar'}]);
});

/* ───────────── performance: confirmado = divisão válida e atual ───────────── */

test('perfFonte: divisão válida confirma com o final; desatualizada vira sugestão; sem divisão, a participação antiga vale', async () => {
  const cfg = structuredClone(CFG);
  cfg.performancePCP.participacoes = [
    {id: '2', membros: [{chave: '100001', nome: 'Ana', percentual: 50}, {chave: '100002', nome: 'Bia', percentual: 50}], por: 'Gestor', em: '2026-09-20'},
    {id: '3', membros: [{chave: '100001', nome: 'Ana', percentual: 50}, {chave: '100002', nome: 'Bia', percentual: 50}]},
  ];
  const fim = {finalizadaEm: '2026-09-25T18:00:00Z', entregaLancada: {data: '2026-09-25'}};
  const a = {...aguia(), por: 'Gestor Teste', em: '2026-09-25T18:00:00Z'};
  const regs = [
    row('1', {numero: '5001', tipo: 'externo', equipe: ['100001', '100002'], alocacao: a, ...fim}),
    row('2', {numero: '5002', tipo: 'externo', equipe: ['100001', '100002'], ...fim}),
    // Caso ruim: participação antiga confirmada E divisão desatualizada. Não confirma.
    row('3', {numero: '5003', tipo: 'externo', equipe: ['100001', ID_DAVI], alocacao: {...a, desatualizada: true}, ...fim}),
  ];
  const e = await edge('pcp-sync', banco(regs, {pcp_config_global: [{id: true, config: cfg, atualizado_em: '2026-09-19T10:00:00Z'}]}));
  const r = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-30'}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const por = id => r.registros.find(x => x.id === id);
  assert.equal(por('1').confirmado, true);assert.equal(por('1').fonte, 'alocacao');
  assert.deepEqual(por('1').membros.map(m => [m.chave, m.percentual]), [['100001', 60], ['100002', 40]]);
  assert.equal(por('1').equipeId, 'eq-aguia');assert.equal(por('1').equipeNome, 'Águia');
  assert.equal(por('2').confirmado, true, 'a participação antiga continua valendo');assert.equal(por('2').fonte, 'participacao');
  assert.equal(por('3').confirmado, false);assert.equal(por('3').fonte, 'alocacao-desatualizada');
  assert.deepEqual(por('3').membros.map(m => m.chave).sort(), ['100001', ID_DAVI].sort(), 'a sugestão sai da equipe atual');
});

test('aparelho (performance.js): mesma régua de confirmado', () => {
  const c = {STORE: {getCFG: () => ({}), getAllOS: () => []}, STATE: {user: {papel: 'admin'}}, OPERACAO: {emIntervalo: () => true, equipe: o => o.equipe || [], ehIdPessoa: v => /^\d{6}$/.test(String(v))},
    diaEntrega: () => '', valorDaOS: () => 100, nomeExibicaoCasa: n => ({id: /^\d{6}$/.test(n) ? n : '', chave: n, nome: 'Pessoa ' + n}), pessoasRH: () => [], avatarRH: () => '', esc: s => String(s), dinheiroCasa: n => String(n), filtroPeriodoHTML: () => ''};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'divisao.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'performance.js'), 'utf8'), c);
  const cfg = {equipes: EQUIPES, participacoes: [{id: '3', membros: [{chave: '100001', nome: 'Ana', percentual: 100}]}]};
  const ok = c.perfRegistro({id: '1', equipe: ['100001', '100002'], alocacao: aguia()}, cfg);
  assert.equal(ok.confirmado, true);assert.equal(ok.fonte, 'alocacao');assert.equal(ok.equipeId, 'eq-aguia');
  assert.deepEqual(JSON.parse(JSON.stringify(ok.membros.map(m => [m.chave, m.percentual]))), [['100001', 60], ['100002', 40]]);
  const velha = c.perfRegistro({id: '3', equipe: ['100001', ID_DAVI], alocacao: {...aguia(), desatualizada: true}}, cfg);
  assert.equal(velha.confirmado, false, 'desatualizada nunca confirma, nem com participação antiga');
  const antiga = c.perfRegistro({id: '3', equipe: ['100001']}, cfg);
  assert.equal(antiga.confirmado, true);assert.equal(antiga.fonte, 'participacao');
});

/* ───────────── aparelho: repor a versão do servidor e o aviso fixo ───────────── */

function store({lista = [], responder}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const eventos = [];
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; }, put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_u, req) => { const r = await responder(JSON.parse(req.body)); return {ok: true, status: 200, json: async () => r}; }});
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'store.js'), 'utf8'), ctx);
  const s = vm.runInContext('STORE', ctx);
  for (const ev of ['alocacao-descartada', 'item-aviso']) s.on(ev, d => eventos.push([ev, d]));
  return {s, ls, eventos};
}
const espera = (ms = 15) => new Promise(r => setTimeout(r, ms));
const js = x => JSON.parse(JSON.stringify(x));

test('store: resposta "descartado" repõe a divisão e a lista do servidor, limpa a fila e guarda o aviso fixo', async () => {
  const servidor = {id: 'a', numero: '77', rev: 2, equipe: ['100001', '100002'], alocacao: {...aguia(), por: 'Gestor Teste'}, alocacaoLog: [{acao: 'criar'}], atualizadoEm: '2026-09-29T09:00:00'};
  const quebrada = aguia(); quebrada.grupos[0].membros[1].cota = 1;
  let chamadas = 0;
  const o = store({lista: [{...servidor, rev: 1}], responder: b => {
    if (b.action !== 'upsert') return {os: []};
    chamadas++;
    return {ok: true, os: {...servidor, rev: 2 + chamadas, atualizadoEm: b.os.atualizadoEm, obsPCP: b.os.obsPCP}, avisos: ['A divisão da equipe não foi gravada. As cotas...'],
      descartado: ['alocacao'], descartadoMotivo: {alocacao: 'Os percentuais dentro de cada equipe precisam somar 100%.'}};
  }});
  await o.s.pronto();
  o.s.saveOS({...servidor, rev: 1, alocacao: quebrada, equipe: ['100001', '100002', '100003'], obsPCP: 'recado', atualizadoEm: '2026-09-29T09:05:00'});
  await espera(); await o.s.trySync();
  const local = js(o.s.getOS('a'));
  assert.deepEqual(local.alocacao, js(servidor.alocacao), 'a divisão recusada não fica no aparelho');
  assert.deepEqual(local.equipe, servidor.equipe);
  assert.equal(local.obsPCP, 'recado', 'o resto do que foi editado fica');
  assert.equal(o.s.getQueue().length, 0);
  const avisos = js(o.s.avisosAlocacao());
  assert.equal(avisos.length, 1);assert.equal(avisos[0].numero, '77');
  assert.match(avisos[0].motivo, /somar 100%/);
  assert.ok(o.eventos.some(([ev]) => ev === 'alocacao-descartada'));
  // O aviso é fixo: continua depois de outra leitura, até alguém dispensar.
  assert.equal(o.s.avisosAlocacao().length, 1);
  o.s.dispensarAvisoAlocacao('a');
  assert.equal(o.s.avisosAlocacao().length, 0);
});

test('Sobrescrever do conflito fica com a divisão do servidor (não ressuscita nem regrava a velha)', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const manter = new Function('casarItensSeguro', app.slice(app.indexOf('const CAMPOS_EXECUCAO_RUA'), app.indexOf('function initConflictDialog')) + '; return manterExecucaoDoServidor;')(() => []);
  const velha = aguia(), nova = {...aguia(), por: 'Outro tablet'}; nova.grupos[0].membros[0].cota = 5000; nova.grupos[0].membros[1].cota = 5000;
  let local = {id: 'c1', obsPCP: 'minha', alocacao: velha, alocacaoLog: [{acao: 'criar'}]};
  manter(local, {id: 'c1', obsPCP: 'dele', alocacao: nova, alocacaoLog: [{acao: 'criar'}, {acao: 'alterar'}]});
  assert.deepEqual(local.alocacao, nova);assert.equal(local.alocacaoLog.length, 2);assert.equal(local.obsPCP, 'minha');
  // A gestão limpou a divisão no servidor: a cópia velha não a traz de volta.
  local = {id: 'c1', alocacao: velha};
  manter(local, {id: 'c1', alocacao: null});
  assert.equal(local.alocacao, null);
  local = {id: 'c1', alocacao: velha};
  manter(local, {id: 'c1'});
  assert.ok(!('alocacao' in local));
});

test('app.js: o aviso fixo da divisão recusada existe e dispensa pelo id', () => {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  assert.match(app, /STORE\.on\('alocacao-descartada'/);
  assert.match(app, /function pintarAvisosAlocacao\(\)/);
  assert.match(app, /dispensarAvisoAlocacao\(/);
  assert.ok(!/—/.test(app.slice(app.indexOf('function pintarAvisosAlocacao'), app.indexOf('function mostrarConflitoCFG'))), 'sem travessão no texto');
});

test('store: o que a pessoa mexeu de novo durante o envio não é trocado pela versão do servidor', async () => {
  const servidor = {id: 'b', numero: '78', rev: 2, equipe: ['100001', '100002'], alocacao: aguia(), atualizadoEm: '2026-09-29T09:00:00'};
  const quebrada = aguia(); quebrada.grupos[0].membros[1].cota = 1;
  let o;
  o = store({lista: [{...servidor, rev: 1}], responder: b => {
    if (b.action !== 'upsert') return {os: []};
    // Enquanto o envio ia, a pessoa trocou a equipe da O.S. (nova edição na fila).
    if (!o.editou) { o.editou = true; o.s.saveOS({...js(o.s.getOS('b')), equipe: ['100001', ID_DAVI], atualizadoEm: '2026-09-29T09:07:00'}); }
    // Como o servidor: a lista que saiu da divisão recusada volta à gravada; a editada à parte fica.
    const equipe = D.mesmaGente(b.os.equipe, b.os.alocacao) ? servidor.equipe : b.os.equipe;
    return {ok: true, os: {...servidor, equipe, rev: b.os.rev + 1, atualizadoEm: b.os.atualizadoEm}, descartado: ['alocacao'], descartadoMotivo: {alocacao: 'Os percentuais dentro de cada equipe precisam somar 100%.'}};
  }});
  await o.s.pronto();
  o.s.saveOS({...servidor, rev: 1, alocacao: quebrada, atualizadoEm: '2026-09-29T09:05:00'});
  await espera(); await o.s.trySync();
  const local = js(o.s.getOS('b'));
  assert.deepEqual(local.equipe, ['100001', ID_DAVI], 'a lista editada depois fica');
  assert.deepEqual(local.alocacao, js(servidor.alocacao), 'a divisão recusada sai');
});

test('reenvio da mesma gravação com a divisão descartada: a resposta repete o "descartado"', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  await comAlocacao(e);
  const quebrada = aguia(); quebrada.grupos[0].membros[1].cota = 1;
  const envio = {...copia(e), alocacao: quebrada, obsPCP: 'x', atualizadoEm: '2026-09-29T10:00:00.000Z'};
  const r1 = await e.call({action: 'upsert', os: envio}, gestor);
  assert.deepEqual(r1.descartado, ['alocacao']);
  // A resposta se perdeu; o aparelho manda de novo o mesmo envio (rev antigo).
  const r2 = await e.call({action: 'upsert', os: envio}, gestor);
  assert.equal(r2.repetido, true, JSON.stringify(r2));
  assert.deepEqual(r2.descartado, ['alocacao']);
});

/* ───────────── revisão da F08 (29/09/2026) ───────────── */

test('revisão: freelancer com contrato vencido vale para O.S. de antes do fim; depois, descartada com a data certa', async () => {
  // Caso ruim: o contrato do Davi venceu em 20/09 (hoje é depois); O.S. lançada em 15/09.
  const comContrato = (contrato) => ({...banco([base({equipe: ['100001', ID_DAVI], finalizadaEm: '2026-09-16T18:00:00Z', entregaLancada: {data: '2026-09-15'}})]),
    registros: [...structuredClone(FICHAS).filter(f => f.colecao !== 'freelancers'),
      {colecao: 'freelancers', id: 'fl-1', apagado: false, registro: {id: 'fl-1', nome: 'Davi Prestador', apelido: 'davi', cpf: cpf('300004123'), funcao: 'Instalador', ...contrato}}]});
  const div = () => JSON.parse(JSON.stringify(D.montar([{equipeId: null, liderId: '100001', membros: ['100001', ID_DAVI]}])));
  let e = await edge('pcp-sync', comContrato({situacao: 'ativo', contratoFim: '2026-09-20'}));
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: div()}}, gestor);
  assert.equal(r.status, 200);assert.ok(!r.descartado, JSON.stringify(r.descartadoMotivo));
  assert.equal(gravada(e).alocacao.grupos[0].membros.find(m => m.pessoaId === ID_DAVI).freelancer, true, 'a marca de freelancer vem do contrato');
  // O.S. de depois do fim do contrato: descartada, dizendo quando o contrato acabou.
  e = await edge('pcp-sync', comContrato({situacao: 'ativo', contratoFim: '2026-09-10'}));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: div()}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.match(r.descartadoMotivo.alocacao, /saiu em 10\/09\/2026/);
  // Encerrado no RH com o fim combinado já passado: o fim é a saída.
  e = await edge('pcp-sync', comContrato({situacao: 'encerrado', contratoFim: '2026-09-20'}));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: div()}}, gestor);
  assert.ok(!r.descartado, JSON.stringify(r.descartadoMotivo));
  // Encerrado antes do fim combinado (fim no futuro): o RH não tem o dia; recusa com o motivo certo.
  e = await edge('pcp-sync', comContrato({situacao: 'encerrado', contratoFim: '2099-12-31'}));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: div()}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.match(r.descartadoMotivo.alocacao, /encerrado no RH antes do fim combinado/);
  assert.ok(!/não tem a data da saída/.test(r.descartadoMotivo.alocacao));
});

test('revisão: O.S. do ERP já entregue que ganha equipe só pela divisão fica "sem prazo", como pela lista', async () => {
  const erp = () => row('mub-7', {numero: '7', origemMubisys: true, tipo: 'externo', cliente: 'ERP', equipe: [], previsaoEntrega: '2026-09-10',
    instalacao: {data: '2026-09-10', periodo: '', hora: '', duracaoDias: 1}, finalizadaEm: '2026-09-12T18:00:00Z', finalizadoPor: 'Gestor Teste'});
  let e = await edge('pcp-sync', banco([erp()]));
  let r = await e.call({action: 'upsert', os: {...copia(e, 'mub-7'), alocacao: aguia()}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!r.descartado, JSON.stringify(r));
  assert.deepEqual(gravada(e, 'mub-7').equipe, ['100001', '100002']);
  assert.equal(gravada(e, 'mub-7').prazoCombinado?.fonte, 'semAgenda', 'a previsão do ERP não virou prazo combinado');
  assert.equal(O.prazoCombinadoDe(gravada(e, 'mub-7')), null);
  // Controle: a mesma equipe pela lista.
  e = await edge('pcp-sync', banco([erp()]));
  r = await e.call({action: 'upsert', os: {...copia(e, 'mub-7'), equipe: ['100001', '100002']}}, gestor);
  assert.equal(gravada(e, 'mub-7').prazoCombinado?.fonte, 'semAgenda');
});

test('revisão: cópia velha da divisão (Sobrescrever da aba antiga) é descartada; a gravada fica; edição a partir da gravada passa', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  await comAlocacao(e);
  const abaAntiga = copia(e); // leu a divisão X (60/40), com o carimbo do servidor
  const y = structuredClone(gravada(e).alocacao); y.grupos[0].membros[0].cota = 5000; y.grupos[0].membros[1].cota = 5000; y.manual = true;
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: y}}, admin);
  assert.ok(!r.descartado, JSON.stringify(r));
  const emY = gravada(e).alocacao.em;
  // Caso ruim: Sobrescrever da aba antiga, com o rev do servidor e a cópia local inteira.
  r = await e.call({action: 'upsert', os: {...abaAntiga, obsPCP: 'recado', rev: gravada(e).rev, atualizadoEm: '2026-09-29T23:00:00.000Z'}}, gestor);
  assert.equal(r.status, 200);assert.deepEqual(r.descartado, ['alocacao']);
  assert.match(r.descartadoMotivo.alocacao, /versão anterior/);
  const g = gravada(e);
  assert.deepEqual(g.alocacao.grupos[0].membros.map(m => m.cota), [5000, 5000], 'a divisão do outro tablet fica');
  assert.equal(g.alocacao.em, emY);assert.equal(g.obsPCP, 'recado', 'o resto da gravação passa');
  assert.equal(g.alocacaoLog.at(-1).acao, 'alterar');assert.equal(g.alocacaoLog.at(-1).por, 'Admin Teste');
  // A tela que edita a partir da gravada (com o `em` dela) grava normalmente.
  const z = structuredClone(g.alocacao); z.grupos[0].membros[0].cota = 7000; z.grupos[0].membros[1].cota = 3000;
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: z}}, gestor);
  assert.ok(!r.descartado, JSON.stringify(r));
  assert.deepEqual(gravada(e).alocacao.grupos[0].membros.map(m => m.cota), [7000, 3000]);
  // Cópia de antes da limpeza também é velha: não recria a divisão limpa.
  const antesDeLimpar = copia(e);
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: null}}, gestor);
  assert.equal(gravada(e).alocacao, null);
  r = await e.call({action: 'upsert', os: {...antesDeLimpar, rev: gravada(e).rev}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.equal(gravada(e).alocacao, null);
});

test('revisão: divisão gravada com o RH fora não confirma; com o RH de volta é conferida (passa e sai a marca, ou fica e avisa)', async () => {
  const {alocacaoConfirmada: confServidor} = await shared();
  const marcada = {equipe: ['100001', '100002'], alocacao: {...aguia(), conferirRH: true}};
  assert.equal(D.alocacaoConfirmada(marcada), false, 'aparelho');
  assert.equal(confServidor(marcada), false, 'servidor');
  const fim = {finalizadaEm: '2026-09-25T18:00:00Z', entregaLancada: {data: '2026-09-25'}};
  // Caso ruim: pessoa que não existe no RH, gravada com o RH fora.
  let e = await edge('pcp-sync', banco([base(fim)]));
  const volta = e.cliente.from.bind(e.cliente);
  rhFora(e);
  const semFicha = JSON.parse(JSON.stringify(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '777777']}])));
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: semFicha}}, gestor);
  assert.ok(!r.descartado);assert.equal(gravada(e).alocacao.conferirRH, true);
  e.cliente.from = volta; // o RH volta
  r = await e.call({action: 'upsert', os: {...copia(e), obsPCP: 'x'}}, gestor);
  assert.equal(gravada(e).alocacao.conferirRH, true, 'não passou: continua marcada');
  assert.match((r.avisos || []).join(' '), /não passou na conferência.*777777/);
  await espera(5);
  let p = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  let reg = p.registros.find(x => x.id === '1');
  assert.equal(reg.confirmado, false);assert.equal(reg.fonte, 'alocacao-conferir-rh');
  const f = await e.call({action: 'performanceFechar', de: '2026-09-01', ate: '2026-09-29', hash: p.hash, requestId: 'req-f08-conferir-1', motivo: 'fechar setembro', anterior: ''}, gestor);
  assert.notEqual(f.status, 200, 'o fechamento não sela a divisão a conferir');
  // Gente certa gravada com o RH fora: a próxima gravação da gestão confere e tira a marca.
  e = await edge('pcp-sync', banco([base(fim)]));
  const volta2 = e.cliente.from.bind(e.cliente);
  rhFora(e);
  await e.call({action: 'upsert', os: {...copia(e), alocacao: aguia()}}, gestor);
  assert.equal(gravada(e).alocacao.conferirRH, true);
  e.cliente.from = volta2;
  await espera(5);
  p = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  assert.equal(p.registros.find(x => x.id === '1').confirmado, false, 'antes de conferir, não confirma');
  const emAntes = gravada(e).alocacao.em;
  // A operação não confere (só a gestão).
  await e.call({action: 'upsert', os: {...copia(e), obsPCP: 'op'}}, operacao);
  assert.equal(gravada(e).alocacao.conferirRH, true);
  r = await e.call({action: 'upsert', os: {...copia(e), obsPCP: 'y'}}, gestor);
  assert.ok(!r.descartado);
  const g = gravada(e);
  assert.ok(!('conferirRH' in g.alocacao), 'passou: a marca sai');
  assert.equal(g.alocacao.em, emAntes, 'o carimbo da divisão fica o de quem a fez');
  assert.equal(g.alocacaoLog.at(-1).acao, 'conferir');assert.equal(g.alocacaoLog.at(-1).por, 'Gestor Teste');
  await espera(5);
  p = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  reg = p.registros.find(x => x.id === '1');
  assert.equal(reg.confirmado, true);assert.equal(reg.fonte, 'alocacao');
});

test('revisão: o dia da conferência da ficha desligada é o da apuração (O.S. do ERP finalizada antes da previsão)', async () => {
  const {diaDaOS} = await shared();
  const os = row('mub-8', {numero: '8', origemMubisys: true, tipo: 'externo', cliente: 'ERP', equipe: ['100003'], previsaoEntrega: '2026-09-25',
    instalacao: {data: '2026-09-25', periodo: '', hora: '', duracaoDias: 1}, finalizadaEm: '2026-09-18T18:00:00Z', finalizadoPor: 'Gestor Teste'});
  assert.equal(diaDaOS(os.registro), '2026-09-18');
  assert.equal(diaDaOS({...os.registro, entregaLancada: {data: '2026-09-17'}}), '2026-09-17');
  // Aberta, do ERP, sem equipe: a previsão não é dia de ninguém.
  assert.equal(diaDaOS({origemMubisys: true, equipe: [], previsaoEntrega: '2026-09-25', instalacao: {data: '2026-09-25'}}), '');
  assert.equal(diaDaOS({equipe: ['100001'], instalacao: {data: '2026-09-25'}, saidaEm: '2026-09-24T08:00:00Z'}), '2026-09-24');
  const e = await edge('pcp-sync', banco([os]));
  await espera(5);
  const p = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  assert.equal(p.registros.find(x => x.id === 'mub-8').dia, '2026-09-18');
  const caio = JSON.parse(JSON.stringify(D.montar([{equipeId: null, liderId: '100003', membros: ['100003']}])));
  const r = await e.call({action: 'upsert', os: {...copia(e, 'mub-8'), alocacao: caio}}, gestor);
  assert.ok(!r.descartado, JSON.stringify(r.descartadoMotivo));
});

test('revisão: limpar a divisão não ressuscita a participação antiga (servidor e aparelho); participação confirmada depois vale', async () => {
  const {participacaoVale} = await shared();
  const cfg = structuredClone(CFG);
  cfg.performancePCP.participacoes = [{id: '1', membros: [{chave: '100001', nome: 'Ana', percentual: 50}, {chave: '100002', nome: 'Bia', percentual: 50}], em: '2026-09-20T10:00:00.000Z'}];
  const e = await edge('pcp-sync', banco([base({finalizadaEm: '2026-09-25T18:00:00Z', entregaLancada: {data: '2026-09-25'}})], {pcp_config_global: [{id: true, config: cfg, atualizado_em: '2026-09-19T10:00:00Z'}]}));
  await comAlocacao(e);
  await e.call({action: 'upsert', os: {...copia(e), alocacao: null}}, gestor);
  const g = gravada(e);
  assert.equal(g.alocacao, null);assert.equal(g.alocacaoLog.at(-1).acao, 'limpar');
  await espera(5);
  const p = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  const reg = p.registros.find(x => x.id === '1');
  assert.equal(reg.confirmado, false);assert.equal(reg.fonte, 'sugestao');
  // Regra pura: a participação confirmada depois da limpeza vale; a de antes, não; sem divisão nunca, vale.
  const velha = cfg.performancePCP.participacoes[0];
  const nova = {...velha, em: '2099-01-01T00:00:00.000Z'};
  assert.equal(participacaoVale(g, velha), null);
  assert.equal(participacaoVale(g, nova), nova);
  assert.equal(participacaoVale({id: '9'}, velha), velha);
  assert.equal(participacaoVale({id: '9', alocacao: aguia()}, nova), null);
  // Aparelho (performance.js): a mesma régua.
  const c = {STORE: {getCFG: () => ({}), getAllOS: () => []}, STATE: {user: {papel: 'admin'}}, OPERACAO: {emIntervalo: () => true, equipe: o => o.equipe || [], ehIdPessoa: v => /^\d{6}$/.test(String(v))},
    diaEntrega: () => '', valorDaOS: () => 100, nomeExibicaoCasa: n => ({id: /^\d{6}$/.test(n) ? n : '', chave: n, nome: 'Pessoa ' + n}), pessoasRH: () => [], avatarRH: () => '', esc: s => String(s), dinheiroCasa: n => String(n), filtroPeriodoHTML: () => ''};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'divisao.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'performance.js'), 'utf8'), c);
  const noAparelho = c.perfRegistro(structuredClone(g), {equipes: EQUIPES, participacoes: [velha]});
  assert.equal(noAparelho.confirmado, false);assert.equal(noAparelho.fonte, 'sugestao');
  assert.equal(c.perfRegistro(structuredClone(g), {equipes: EQUIPES, participacoes: [nova]}).fonte, 'participacao');
  assert.equal(c.perfRegistro({id: '1', equipe: ['100001', '100002'], alocacao: {...aguia(), conferirRH: true}}, {equipes: EQUIPES, participacoes: [nova]}).fonte, 'alocacao-conferir-rh');
});

test('revisão: quem está na O.S. só pelo nome, sem ID no RH, trava a divisão (não some calado); nome que o RH resolve passa', async () => {
  let e = await edge('pcp-sync', banco([base({equipe: ['100001', 'Zeca']})]));
  const soAna = JSON.parse(JSON.stringify(D.montar([{equipeId: null, liderId: '100001', membros: ['100001']}])));
  let r = await e.call({action: 'upsert', os: {...copia(e), alocacao: soAna}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.match(r.descartadoMotivo.alocacao, /"Zeca".*não tem ID no RH/);
  assert.deepEqual(gravada(e).equipe, ['100001', 'Zeca']);
  // A tela manda a lista derivada (sem o Zeca): a gravada ainda tem, trava igual e a lista fica.
  r = await e.call({action: 'upsert', os: {...copia(e), equipe: ['100001'], alocacao: soAna}}, gestor);
  assert.deepEqual(r.descartado, ['alocacao']);assert.deepEqual(gravada(e).equipe, ['100001', 'Zeca']);
  // Nome antigo que o RH resolve (Bia = 100002) e está na divisão: passa.
  e = await edge('pcp-sync', banco([base({equipe: ['100001', 'Bia']})]));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: aguia()}}, gestor);
  assert.ok(!r.descartado, JSON.stringify(r.descartadoMotivo));assert.deepEqual(gravada(e).equipe, ['100001', '100002']);
});

test('revisão: vazio não é mudança da divisão (reenvio da limpeza com "" e operação mandando "")', async () => {
  let e = await edge('pcp-sync', banco([base()]));
  await comAlocacao(e);
  const envio = {...copia(e), alocacao: '', atualizadoEm: '2026-09-29T11:00:00.000Z'};
  let r = await e.call({action: 'upsert', os: envio}, gestor);
  assert.ok(!r.descartado);assert.equal(gravada(e).alocacao, null);
  r = await e.call({action: 'upsert', os: envio}, gestor); // a resposta se perdeu
  assert.equal(r.repetido, true, JSON.stringify(r));assert.ok(!r.descartado, 'a limpeza gravou; o reenvio não diz descartado');
  e = await edge('pcp-sync', banco([base()]));
  r = await e.call({action: 'upsert', os: {...copia(e), alocacao: ''}}, operacao);
  assert.equal(r.status, 200);assert.ok(!r.descartado, JSON.stringify(r));
  assert.ok(!r.avisos || !r.avisos.some(a => /Só a gestão/.test(a)));
});

test('revisão: o histórico da ficha mostra a divisão com nome e percentual final, a recusa como recusa e o histórico da divisão', async () => {
  const e = await edge('pcp-sync', banco([base()]));
  await comAlocacao(e);
  const quebrada = structuredClone(gravada(e).alocacao); quebrada.grupos[0].membros[1].cota = 1;
  await e.call({action: 'upsert', os: {...copia(e), alocacao: quebrada}}, gestor);
  const entradas = diario(e);
  const node = () => ({innerHTML: '', textContent: '', value: '', querySelector: node, querySelectorAll: () => [], setAttribute() {}, classList: {toggle() {}, add() {}, remove() {}}, focus() {}, scrollIntoView() {}, insertAdjacentHTML() {}});
  const ctx = vm.createContext({console, document: {querySelector: node, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null},
    STORE: {getAllOS: () => [], getCFG: () => ({performancePCP: {equipes: EQUIPES}})}, setTimeout() {}, clearTimeout() {}});
  for (const f of ['operacao.js', 'divisao.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx);
  ctx.ENTRADAS = JSON.parse(JSON.stringify(entradas));
  const html = vm.runInContext('htmlHistoricoAlteracoes({entradas: ENTRADAS})', ctx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(html, /Divisão da equipe : \(vazio\) → Águia · ID 100001 60%, ID 100002 40%/);
  assert.match(html, /Histórico da divisão : 0 registros → 1 registro \(novo: criou por Gestor Teste\)/);
  assert.match(html, /Tentou alterar a divisão da equipe \(recusado\) Divisão da equipe : Águia · ID 100001 60%, ID 100002 40% → Recusada: Os percentuais/);
  assert.ok(!/alocacao|Alterou alocacao|Linhas:/.test(html), 'sem a chave crua');
  assert.ok(!/porId|Por id|111222/i.test(html), 'sem o ID de quem gravou');
  assert.ok(!html.includes('—'), 'sem travessão');
});
