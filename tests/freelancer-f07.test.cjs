/* F07: FREELANCER COM ID E TAG NO SELETOR (caminho B, decisão do dono de
   29/09/2026). O freelancer que instala mora no CONTRATO de freelancer do RH
   (coleção 'freelancers'), nunca na ficha de Colaboradores; o ID de 6 dígitos
   sai do CPF do contrato. Estes testes partem dos casos ruins: o CPF inteiro
   descendo ao aparelho, o nome antigo casando com o freelancer por prefixo, o
   mesmo ID em ficha e contrato de pessoas diferentes, o ex-colaborador que
   virou freelancer contado duas vezes, e a pessoa recém-cadastrada que não
   aparece por causa do cache de 60 s. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const O = require('../operacao.js');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');

/* ------------------------------------------------------------ régua */
const PESSOAS = [
  {chave:'lucas-ferreira', id:'300001', nome:'Lucas Ferreira Gomes', apelido:''},
  {chave:'rita-moraes', id:'300003', nome:'Rita Moraes', apelido:'rita'},
  {chave:'freelancer:fl-lucas', id:'300006', nome:'Lucas Prado', apelido:'', freelancer:true},
  {chave:'freelancer:fl-pantera', id:'300005', nome:'Gilberto Pantera Souza', apelido:'pantera', freelancer:true},
  {chave:'freelancer:fl-renan', id:'300003', nome:'Renan Brito', apelido:'renan', freelancer:true},
];
const DADOS = {pessoas:PESSOAS, vinculos:[], lista:['Lucas', 'Pantera']};

test('régua: freelancer entra na conta de ambiguidade; "Lucas" deixa de casar sozinho com a ficha', () => {
  const sem = O.resolverPessoas({...DADOS, pessoas:PESSOAS.filter(p => !p.freelancer)});
  assert.equal(sem.idDe('Lucas'), '300001', 'sem o contrato, o prefixo era só da ficha');
  const r = O.resolverPessoas(DADOS);
  assert.equal(r.idDe('Lucas'), '', 'com o Lucas freelancer, "Lucas" é ambíguo e não escolhe');
  assert.equal(r.chave('Lucas'), 'nome:lucas');
  assert.equal(r.idDe('Lucas Prado'), '300006');
  assert.equal(r.idDe('Pantera'), '300005', 'o apelido do contrato leva ao freelancer');
  assert.equal(r.nome('300005'), 'Pantera', 'a palavra da lista de instaladores é o nome de exibição');
});

test('régua: ID repetido entre ficha e contrato não casa ninguém pelo nome', () => {
  const r = O.resolverPessoas(DADOS);
  assert.equal(r.repetido('300003'), true);
  assert.equal(r.repetido('300001'), false);
  assert.equal(r.idDe('Rita'), '', 'o apelido da ficha não leva a um ID que dois cadastros dividem');
  assert.equal(r.idDe('Renan'), '', 'nem o do contrato');
  assert.equal(r.chave('Rita'), 'nome:rita');
  assert.equal(r.idDe('300003'), '300003', 'o ID gravado continua sendo o ID');
  // O servidor marca a repetição; o aparelho respeita a marca mesmo sem o par.
  const marcado = O.resolverPessoas({pessoas:[{chave:'zeca', id:'300009', nome:'Zeca Lopes', apelido:'zeca', idRepetido:true}]});
  assert.equal(marcado.idDe('Zeca'), '');
  assert.equal(marcado.repetido('300009'), true);
});

test('régua: dois contratos do mesmo freelancer não se tornam ambíguos entre si', () => {
  const r = O.resolverPessoas({pessoas:[
    {chave:'freelancer:a', id:'300005', nome:'Gilberto Pantera Souza', apelido:'pantera', freelancer:true, desligado:true},
    {chave:'freelancer:b', id:'300005', nome:'Gilberto Pantera Souza', apelido:'pantera', freelancer:true},
  ]});
  assert.equal(r.repetido('300005'), false, 'contrato com contrato não é ficha com contrato');
});

test('servidor e aparelho chegam à MESMA pessoa com freelancer na lista (cópia da régua em _shared)', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const a = O.resolverPessoas(DADOS), b = S.resolverPessoas(DADOS);
  for (const x of ['Lucas', 'lucas prado', 'Lucas Ferreira', 'Pantera', 'Gilberto', 'Rita', 'Renan', 'Renan Brito', '300003', '300005', '300006', '999999', '']) {
    assert.equal(b.idDe(x), a.idDe(x), 'idDe ' + x);
    assert.equal(b.chave(x), a.chave(x), 'chave ' + x);
    assert.equal(b.nome(x), a.nome(x), 'nome ' + x);
    assert.equal(b.repetido(b.idDe(x)), a.repetido(a.idDe(x)), 'repetido ' + x);
  }
  assert.equal(b.repetido('300003'), true);
});

/* ------------------------------------------------ juntarFreelancers */
const CONTRATO = (id, extra) => ({id, nome:'', apelido:'', cpf:'', funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31', ...extra});

test('contrato vira pessoa pelo ID do CPF, e o CPF inteiro nunca sai', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers([], [
    CONTRATO('fl-pantera', {nome:'Gilberto Pantera Souza', apelido:'pantera', cpf:'300.005.987-39'}),
    CONTRATO('fl-sem', {nome:'Tiago Sem Documento'}),
    CONTRATO('fl-fim', {nome:'Vitor Encerrado', cpf:'30000776505', situacao:'encerrado'}),
    CONTRATO('fl-venceu', {nome:'Wagner Vencido', cpf:'30000865443', contratoFim:'2020-01-01'}),
  ], {hoje:'2026-09-29'});
  const pantera = r.contratos.find(c => c.chave === 'freelancer:fl-pantera');
  assert.equal(pantera.id, '300005');
  assert.equal(pantera.freelancer, true);
  assert.equal(pantera.ativo, true);
  assert.equal(pantera.situacaoContrato, 'ativo');
  const sem = r.contratos.find(c => c.chave === 'freelancer:fl-sem');
  assert.equal(sem.id, '', 'sem CPF não há ID');
  assert.equal(sem.semCpf, true);
  assert.equal(r.contratos.find(c => c.chave === 'freelancer:fl-fim').desligado, true);
  const venceu = r.contratos.find(c => c.chave === 'freelancer:fl-venceu');
  assert.equal(venceu.desligado, true, 'vencido sem ninguém encerrar também não é escolha');
  assert.equal(venceu.situacaoContrato, 'vencido');
  const tudo = JSON.stringify(r);
  for (const cpf of ['98739', '30000598739', '76505', '65443']) assert.ok(!tudo.includes(cpf), 'nenhum pedaço do CPF além do ID: ' + cpf);
  assert.ok(!r.contratos.some(c => 'cpf' in c));
});

test('renovação em cadastro novo: dois contratos com o mesmo CPF são uma pessoa só', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers([], [
    CONTRATO('velho', {nome:'Gilberto Pantera Souza', apelido:'pantera', cpf:'30000598739', situacao:'encerrado', contratoFim:'2025-12-31'}),
    CONTRATO('novo', {nome:'Gilberto Pantera Souza', apelido:'pantera', cpf:'30000598739'}),
  ], {hoje:'2026-09-29'});
  assert.deepEqual(r.contratos.map(c => c.chave), ['freelancer:novo']);
  assert.equal(r.repetidos.size, 0);
  assert.deepEqual(r.avisos, []);
});

test('ex-colaborador que virou freelancer (mesmo CPF): o contrato ativo representa a pessoa, a ficha antiga sai da régua', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers(
    [{chave:'osmar-teixeira', id:'300002', nome:'Osmar Teixeira', apelido:'', desligado:true, cpf:'30000222283'}],
    [CONTRATO('fl-osmar', {nome:'Osmar Teixeira', apelido:'osmar', cpf:'300.002.222-83'})], {hoje:'2026-09-29'});
  assert.deepEqual([...r.fichasFora], ['osmar-teixeira']);
  assert.equal(r.contratos.length, 1);
  assert.equal(r.repetidos.size, 0, 'mesma pessoa não é ID repetido');
  assert.deepEqual(r.avisos, []);
});

test('ficha fora da ativa (inativo, sem desligamento) e contrato ativo do mesmo CPF: vale o contrato', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers(
    [{chave:'osmar-teixeira', id:'300002', nome:'Osmar Teixeira', apelido:'', desligado:false, ativo:false, cpf:'30000222283'}],
    [CONTRATO('fl-osmar', {nome:'Osmar Teixeira', apelido:'osmar', cpf:'30000222283'})], {hoje:'2026-09-29'});
  assert.deepEqual([...r.fichasFora], ['osmar-teixeira']);
  assert.equal(r.contratos.length, 1);
  assert.deepEqual(r.avisos, []);
});

test('ficha ativa e contrato ativo da mesma pessoa: vale a ficha, e a gestão é avisada', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers(
    [{chave:'bruno-pires', id:'300004', nome:'Bruno Pires', apelido:'', desligado:false, cpf:'30000444421'}],
    [CONTRATO('fl-bruno', {nome:'Bruno Pires', cpf:'30000444421'})], {hoje:'2026-09-29'});
  assert.equal(r.contratos.length, 0);
  assert.equal(r.fichasFora.size, 0);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /Bruno Pires/);
  assert.match(r.avisos[0], /vale a ficha/);
});

test('6 primeiros dígitos iguais, CPFs diferentes: ID repetido, aviso, e nenhum dos dois casa', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers(
    [{chave:'rita-moraes', id:'300003', nome:'Rita Moraes', apelido:'rita', desligado:false, cpf:'30000333352'}],
    [CONTRATO('fl-renan', {nome:'Renan Brito', apelido:'renan', cpf:'30000399965'})], {hoje:'2026-09-29'});
  assert.deepEqual([...r.repetidos], ['300003']);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /ID 300003/);
  assert.match(r.avisos[0], /Rita Moraes/);
  assert.match(r.avisos[0], /Renan Brito/);
  assert.ok(!r.avisos[0].includes('33352') && !r.avisos[0].includes('99965'), 'o aviso não mostra o CPF');
  assert.equal(r.contratos[0].idRepetido, true);
});

/* ---------------------------------------------------------------- servidor */
const colab = (chave, cpf, nome, extra = {}) => ({id:chave, colecao:'colaboradores', apagado:false, registro:{id:chave, nome, apelido:'', cpf, statusId:'ativo', ...extra}});
const free = (id, extra) => ({id, colecao:'freelancers', apagado:false, registro:CONTRATO(id, extra)});
const RH = [
  colab('lucas-ferreira', '30000111104', 'Lucas Ferreira Gomes'),
  colab('osmar-teixeira', '30000222283', 'Osmar Teixeira', {dataDesligamento:'2026-06-22'}),
  colab('rita-moraes', '30000333352', 'Rita Moraes', {apelido:'rita'}),
  free('fl-pantera', {nome:'Gilberto Pantera Souza', apelido:'pantera', cpf:'30000598739'}),
  free('fl-osmar', {nome:'Osmar Teixeira', apelido:'osmar', cpf:'30000222283'}),
  free('fl-renan', {nome:'Renan Brito', apelido:'renan', cpf:'30000399965'}),
  free('fl-sem', {nome:'Tiago Sem Documento'}),
  free('fl-fim', {nome:'Vitor Encerrado', cpf:'30000776505', situacao:'encerrado'}),
  {id:'fl-apagado', colecao:'freelancers', apagado:true, registro:CONTRATO('fl-apagado', {nome:'Apagado Fulano', cpf:'30000954381'})},
];
const cfg = extra => [{id:true, config:{instaladores:['Pantera', 'Lucas Ferreira'], vinculosRH:[], ...extra}, atualizado_em:'2026-09-19T10:00:00Z'}];
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, numero:id, tipo:'externo', cliente:'Cliente', liberadoPCP:true, ...registro}});
const toque = nome => ({nome, sub:nome, papel:'montagem', montagemIndividual:true});

test('elenco para o PCP: freelancer com tag e contrato; CPF inteiro nunca desce', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg()});
  const r = await e.call({action:'elenco', freelancers:true}, {papel:'pcp', nome:'Gestor'});
  assert.equal(r.status, 200, r.error);
  const pantera = r.pessoas.find(p => p.chave === 'freelancer:fl-pantera');
  assert.equal(pantera.id, '300005');
  assert.equal(pantera.freelancer, true);
  assert.equal(pantera.ativo, true);
  assert.equal(pantera.contratoFim, '2099-12-31');
  assert.equal(pantera.situacaoContrato, 'ativo');
  assert.equal(pantera.cargo, 'Instalador');
  const sem = r.pessoas.find(p => p.chave === 'freelancer:fl-sem');
  assert.equal(sem.id, ''); assert.equal(sem.semCpf, true);
  assert.ok(!r.pessoas.some(p => p.chave === 'freelancer:fl-fim'), 'contrato encerrado não é escolha');
  assert.ok(!r.pessoas.some(p => p.chave === 'freelancer:fl-apagado'));
  assert.ok(r.antigos.some(p => p.chave === 'freelancer:fl-fim' && p.desligado), 'mas dá nome ao histórico');
  // Osmar: a ficha antiga sai, o contrato fica.
  assert.ok(!r.antigos.some(p => p.chave === 'osmar-teixeira'));
  assert.ok(r.pessoas.some(p => p.chave === 'freelancer:fl-osmar' && p.id === '300002'));
  // Rita x Renan: marcados e avisados.
  assert.equal(r.pessoas.find(p => p.chave === 'rita-moraes').idRepetido, true);
  assert.equal(r.pessoas.find(p => p.chave === 'freelancer:fl-renan').idRepetido, true);
  assert.ok(r.avisos.some(a => /ID 300003/.test(a)));
  const tudo = JSON.stringify(r);
  for (const cpf of ['30000598739', '98739', '30000399965', '99965']) assert.ok(!tudo.includes(cpf), 'CPF no pacote: ' + cpf);
});

/* Revisão da F07: tag, CPF pendente e ID repetido são cadastro do RH e servem
   a quem escolhe gente no seletor. O celular (toque e conta de grupo da
   montagem) não escolhe: recebe o contrato com ID como pessoa comum. */
test('elenco para quem entrou sem senha e para a montagem: sem tag, sem CPF pendente, sem ID repetido', async () => {
  for (const quem of [toque('Pantera'), {papel:'montagem', nome:'Montagem'}]) {
    const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg()});
    const r = await e.call({action:'elenco', leve:true, freelancers:true}, quem);
    assert.equal(r.status, 200, r.error);
    const pantera = r.pessoas.find(p => p.chave === 'freelancer:fl-pantera');
    assert.ok(pantera, 'o contrato com ID continua dando nome à equipe');
    assert.equal(pantera.id, '300005');
    for (const p of r.pessoas) for (const campo of ['freelancer', 'semCpf', 'cpfInvalido', 'idRepetido', 'contratoFim', 'situacaoContrato'])
      assert.equal(p[campo], undefined, `${p.nome}: ${campo}`);
    assert.equal(pantera.cargo, '', 'nem a função do contrato');
    assert.ok(!r.pessoas.some(p => p.chave === 'freelancer:fl-sem'), 'contrato sem ID não serve ao celular');
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.antigos, []);
  }
});

test('elenco para a operação (monta equipe na gestão): tag e travas sim, contrato e avisos não', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg()});
  const r = await e.call({action:'elenco', freelancers:true}, {papel:'operacao', nome:'Operação'});
  assert.equal(r.status, 200, r.error);
  const pantera = r.pessoas.find(p => p.chave === 'freelancer:fl-pantera');
  assert.equal(pantera.freelancer, true);
  assert.equal(pantera.contratoFim, undefined);
  assert.equal(r.pessoas.find(p => p.chave === 'freelancer:fl-sem').semCpf, true);
  assert.equal(r.pessoas.find(p => p.chave === 'rita-moraes').idRepetido, true);
  assert.deepEqual(r.avisos, []);
});

test('tela antiga (sem pedir freelancers): o elenco sai como antes, sem contrato nenhum', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg()});
  const r = await e.call({action:'elenco'}, {papel:'pcp', nome:'Gestor'});
  assert.equal(r.status, 200, r.error);
  assert.ok(!r.pessoas.some(p => String(p.chave).startsWith('freelancer:') || p.freelancer || p.idRepetido));
  assert.ok(!r.antigos.some(p => String(p.chave).startsWith('freelancer:')));
  assert.ok(r.antigos.some(p => p.chave === 'osmar-teixeira'), 'a ficha antiga continua dando nome ao histórico');
  assert.deepEqual(r.avisos, []);
  // E a presença da v135 (sem saber o que é freelancer) não conta o Pantera.
  assert.ok(!r.pessoas.some(p => /Pantera/.test(p.nome)));
  // A régua do servidor conhece o contrato mesmo assim: o crachá do Pantera abre a O.S. dele.
  const e2 = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['300005']})]});
  const ok = await e2.call({action:'upsert', os:{...e2.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Pantera'));
  assert.equal(ok.status, 200, ok.error);
});

test('crachá de toque do freelancer abre a O.S. gravada pelo ID do contrato; o colega não', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['300005']})]});
  const ok = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Pantera'));
  assert.equal(ok.status, 200, ok.error);
  const nao = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, toque('Lucas Ferreira'));
  assert.equal(nao.status, 422);
});

test('Atualizar elenco: o "forcar" passa por cima do cache de 60 s da régua do servidor', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg({instaladores:['Pantera', 'Lucas Ferreira', 'Ivo']}), pcp_registros:[row('1', {equipe:['300010']})]});
  // Primeira volta: a régua do servidor fica em cache sem o Ivo.
  const antes = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Ivo'));
  assert.equal(antes.status, 422);
  e.db.registros.push(free('fl-ivo', {nome:'Ivo Novato', apelido:'ivo', cpf:'30001012339'}));
  const cache = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:30'}}, toque('Ivo'));
  assert.equal(cache.status, 422, 'sem forçar, o cache ainda não conhece o contrato novo');
  const el = await e.call({action:'elenco', forcar:true, freelancers:true}, {papel:'pcp', nome:'Gestor'});
  assert.ok(el.pessoas.some(p => p.id === '300010'));
  const depois = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, toque('Ivo'));
  assert.equal(depois.status, 200, depois.error);
});

/* ------------------------------------------------ seletor da equipe */
function telaPicker(elenco, cfg = {}) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', style:{}, querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}});
    return nodes.get(sel);
  }
  const chamadas = [];
  const STORE = {getAllOS:()=>[], getCFG:()=>({instaladores:[], ...cfg}), getOS:()=>null, uuid:()=>'x', saveOS(){},
    elenco:()=>elenco, pullElenco:async (...a) => { chamadas.push(a); return true; }};
  const ctx = vm.createContext({console, Date, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}}, window:{}, navigator:{onLine:true},
    localStorage:{getItem:()=>null}, STORE, setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'pcp'}; renderModal=()=>{}; renderActiveTab=()=>{}; toast=()=>{};`, ctx);
  return {run:code => vm.runInContext(code, ctx), html:() => node('#picker-list').innerHTML, chamadas};
}
const ELENCO = {pessoas:[
  {chave:'lucas-ferreira', id:'300001', nome:'Lucas Ferreira Gomes', apelido:'', area:'Montagem', ativo:true},
  {chave:'rita-moraes', id:'300003', nome:'Rita Moraes', apelido:'rita', area:'Montagem', ativo:true, idRepetido:true},
  {chave:'freelancer:fl-pantera', id:'300005', nome:'Gilberto Pantera Souza', apelido:'pantera', area:'', cargo:'Instalador', ativo:true, freelancer:true},
  {chave:'freelancer:fl-renan', id:'300003', nome:'Renan Brito', apelido:'renan', area:'', ativo:true, freelancer:true, idRepetido:true},
  {chave:'freelancer:fl-sem', id:'', nome:'Tiago Sem Documento', apelido:'', area:'', ativo:true, freelancer:true, semCpf:true},
], antigos:[], avisos:['O ID 300003 aparece em dois cadastros.'], em:'2026-09-29T10:00:00Z'};

test('seletor: freelancer no grupo Freelancers, com a tag, e busca por nome, apelido e ID', () => {
  const t = telaPicker(ELENCO);
  const ops = t.run('opcoesEquipe([])');
  const pantera = ops.find(o => o.id === '300005');
  assert.equal(pantera.grupo, 'Freelancers');
  assert.equal(pantera.freelancer, true);
  assert.equal(pantera.bloqueio, '');
  t.run(`_modalDraft={id:'o1', equipe:[]}; abrirPickerEquipe();`);
  const html = t.html();
  const linha = html.split('<label').find(l => l.includes('value="300005"'));
  assert.ok(linha, 'o Pantera aparece');
  assert.match(linha, /tag-freelancer[^>]*>Freelancer</);
  const busca = /data-busca="([^"]*)"/.exec(linha)[1];
  assert.ok(busca.includes('300005'), 'acha pelos 6 dígitos do ID');
  assert.ok(busca.includes('pantera'), 'acha pelo apelido');
  assert.ok(busca.includes('gilberto pantera souza'), 'acha pelo nome');
  assert.ok(!busca.includes('98765'), 'pedaço de CPF que não é o ID não acha');
  assert.match(html, /placeholder="Buscar por nome, apelido ou ID"/);
});

test('seletor: contrato sem CPF e ID repetido aparecem, travados, com o motivo', () => {
  const t = telaPicker(ELENCO);
  t.run(`_modalDraft={id:'o1', equipe:[]}; abrirPickerEquipe();`);
  const html = t.html();
  const linha = nome => html.split('<label').find(l => l.includes(nome));
  const sem = linha('Tiago Sem Documento');
  assert.ok(sem, 'sem CPF não some calado');
  assert.match(sem, /disabled/);
  assert.match(sem, /sem CPF/i);
  assert.match(linha('Rita Moraes'), /disabled/);
  assert.match(linha('Rita Moraes'), /ID repetido/);
  assert.match(linha('Renan Brito'), /disabled/, 'uma linha travada por cadastro');
  assert.match(html, /O ID 300003 aparece em dois cadastros/, 'o aviso do servidor aparece para a gestão');
  // Quem já está na O.S. com o ID repetido continua marcado, e pode sair.
  t.run(`_modalDraft={id:'o2', equipe:['300003']}; abrirPickerEquipe();`);
  const rita = t.html().split('<label').find(l => l.includes('Rita Moraes'));
  assert.match(rita, /checked/);
  assert.doesNotMatch(rita, /disabled/);
});

test('seletor: "Cadastrar novo" abre o RH em outra aba; "Atualizar elenco" força a leitura sem cache', async () => {
  const t = telaPicker(ELENCO);
  t.run(`_modalDraft={id:'o1', equipe:[]}; abrirPickerEquipe();`);
  const html = t.html();
  const link = /<a[^>]*data-picker-cadastrar[^>]*>/.exec(html);
  assert.ok(link, 'o link existe');
  assert.match(link[0], /href="https:\/\/leogpereira-afk\.github\.io\/impresilkrh\/freelancers"/);
  assert.match(link[0], /target="_blank"/);
  assert.match(link[0], /rel="noopener"/);
  assert.match(html, /data-picker-atualizar/);
  await t.run('atualizarElencoDoPicker()');
  assert.equal(t.chamadas.length, 1);
  assert.equal(t.chamadas[0][0], true, 'força');
  assert.equal(t.chamadas[0][1].semCache, true, 'e pede ao servidor que passe por cima do cache');
});

/* ---------------------------------------------------------------- chips */
test('chips do Lançar entrega: o freelancer leva a tag', () => {
  const ctx = vm.createContext({console, Date,
    STORE:{getAllOS:()=>[], getCFG:()=>({instaladores:['Pantera']}), elenco:()=>ELENCO, valores:()=>({})},
    STATE:{}, document:{getElementById:()=>null, querySelectorAll:()=>[], body:{classList:{add(){}, remove(){}, contains:()=>false}}},
    localStorage:{getItem:()=>null, setItem(){}, removeItem(){}}, esc:s => String(s ?? '')});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  const chips = vm.runInContext(`pessoasDosChips({equipe:['300001']})`, ctx);
  const pantera = chips.find(c => c.valor === '300005');
  assert.equal(pantera.freelancer, true);
  assert.match(pantera.dica, /Freelancer/);
  assert.equal(chips.find(c => c.valor === '300001').freelancer, false);
});

test('presença da fábrica: freelancer não conta como gente da casa', () => {
  const ctx = vm.createContext({console, Date,
    STORE:{getAllOS:()=>[], getCFG:()=>({}), elenco:()=>({...ELENCO, fichaRH:true, ferias:[], ausencias:[]}), valores:()=>({})},
    STATE:{}, document:{getElementById:()=>null, querySelectorAll:()=>[], body:{classList:{add(){}, remove(){}, contains:()=>false}}},
    localStorage:{getItem:()=>null, setItem(){}, removeItem(){}}, esc:s => String(s ?? '')});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  const nomes = vm.runInContext(`presencaRH('2026-09-29').presentes.map(p => p.nome).join('|')`, ctx);
  assert.equal(nomes, 'Lucas Ferreira Gomes|Rita Moraes');
});

/* =============================================================== revisão F07
   Os defeitos que a revisão achou, cada um pelo caso ruim. */

// Alta: o apelido do contrato passava por cima do começo de nome da ficha.
test('revisão: contrato com apelido igual ao primeiro nome de uma ficha não captura o nome antigo (as duas réguas)', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const ficha = {chave:'lucas-ferreira', id:'300001', nome:'Lucas Ferreira Gomes', apelido:'lucasf'};
  const contrato = {chave:'freelancer:fl-lucas', id:'300006', nome:'Lucas Prado', apelido:'lucas', freelancer:true};
  for (const M of [O, S]) {
    assert.equal(M.resolverPessoas({pessoas:[ficha]}).idDe('Lucas'), '300001', 'antes do contrato');
    const r = M.resolverPessoas({pessoas:[ficha, contrato]});
    assert.equal(r.idDe('Lucas'), '', '"Lucas" fica ambíguo, não passa ao freelancer');
    assert.equal(r.chave('Lucas'), 'nome:lucas');
    assert.equal(r.idDe('lucasf'), '300001', 'o apelido da ficha continua dela');
    assert.equal(r.idDe('Lucas Prado'), '300006');
    assert.equal(r.idDe('Lucas Ferreira'), '300001');
  }
  // Paridade com o caso na lista de instaladores e o apelido que só o contrato tem.
  const dados = {pessoas:[ficha, contrato, {chave:'freelancer:fl-p', id:'300005', nome:'Gilberto Pantera Souza', apelido:'pantera', freelancer:true}], lista:['Lucas', 'Pantera']};
  const a = O.resolverPessoas(dados), b = S.resolverPessoas(dados);
  for (const x of ['Lucas', 'lucas', 'lucasf', 'Lucas Prado', 'Lucas Ferreira', 'Pantera', 'Gilberto', '300001', '300006'])
    for (const f of ['idDe', 'chave', 'nome']) assert.equal(b[f](x), a[f](x), f + ' ' + x);
  assert.equal(a.idDe('Pantera'), '300005', 'apelido de contrato sem xará continua levando ao freelancer');
});

test('revisão: crachá de toque "Lucas" (ID 300001) não perde a própria O.S. para o freelancer de apelido "lucas"', async () => {
  const RH2 = [
    colab('lucas-ferreira', '30000111104', 'Lucas Ferreira Gomes', {apelido:'lucasf'}),
    free('fl-lucas', {nome:'Lucas Prado', apelido:'lucas', cpf:'30000612316'}),
  ];
  const e = await edge('pcp-sync', {registros:RH2, pcp_config_global:cfg({instaladores:['Lucas']}), pcp_registros:[row('A', {equipe:['300001']}), row('B', {equipe:['300006']})]});
  const cracha = {nome:'Lucas', sub:'Lucas', papel:'montagem', montagemIndividual:true, id:'300001'};
  const propria = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, cracha);
  assert.equal(propria.status, 200, propria.error);
  const alheia = await e.call({action:'upsert', os:{...e.db.pcp_registros[1].registro, horaSaida:'08:00'}}, cracha);
  assert.equal(alheia.status, 422, 'a O.S. do freelancer não abre para o crachá do empregado');
  const lista = await e.call({action:'list'}, cracha);
  const ids = (lista.os || []).map(x => (x.registro || x).id);
  assert.ok(!ids.includes('B'), 'o pull não entrega a O.S. do freelancer: ' + JSON.stringify(ids));
  const autores = e.db.pcp_registros.filter(x => x.colecao === 'auditoria').map(x => x.registro.autor || {});
  assert.ok(!autores.some(a => a.porId === '300006'), 'o diário não assina com o ID do freelancer');
});

// Média: ficha com a situação "freelancer" e contrato ativo do mesmo CPF (o Osmane de hoje).
test('revisão: ficha com situação Freelancer e contrato ativo do mesmo CPF: vale o contrato, sem mandar encerrar nada', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers(
    [{chave:'osmane-ficticio', id:'300002', nome:'Osmane Ficticio Silva', apelido:'', desligado:false, ativo:true, statusId:'freelancer', cpf:'30000222283'}],
    [CONTRATO('fl-osmane', {nome:'Osmane Ficticio Silva', apelido:'osmane', cpf:'300.002.222-83'})], {hoje:'2026-09-29'});
  assert.deepEqual([...r.fichasFora], ['osmane-ficticio']);
  assert.equal(r.contratos.length, 1);
  assert.equal(r.contratos[0].freelancer, true);
  assert.deepEqual(r.avisos, []);
  // Ficha REALMENTE na ativa: vale a ficha, e o aviso pede para ajustar a situação dela.
  const ativa = S.juntarFreelancers(
    [{chave:'osmane-ficticio', id:'300002', nome:'Osmane Ficticio Silva', apelido:'', desligado:false, ativo:true, statusId:'ativo', cpf:'30000222283'}],
    [CONTRATO('fl-osmane', {nome:'Osmane Ficticio Silva', cpf:'30000222283'})], {hoje:'2026-09-29'});
  assert.equal(ativa.avisos.length, 1);
  assert.doesNotMatch(ativa.avisos[0], /encerr/i, 'o aviso nunca manda encerrar o contrato');
  assert.match(ativa.avisos[0], /situação/);
});

test('revisão: servidor leva a situação da ficha até a junção (elenco e régua)', async () => {
  const RH2 = [
    colab('osmane-ficticio', '30000222283', 'Osmane Ficticio Silva', {statusId:'freelancer'}),
    free('fl-osmane', {nome:'Osmane Ficticio Silva', apelido:'osmane', cpf:'30000222283'}),
  ];
  const e = await edge('pcp-sync', {registros:RH2, pcp_config_global:cfg({instaladores:['Osmane']}), pcp_registros:[row('1', {equipe:['300002']})]});
  const r = await e.call({action:'elenco', freelancers:true}, {papel:'pcp', nome:'Gestor'});
  assert.equal(r.status, 200, r.error);
  const osmane = r.pessoas.filter(p => p.id === '300002');
  assert.equal(osmane.length, 1, 'uma pessoa só');
  assert.equal(osmane[0].freelancer, true, 'pelo contrato, com a tag');
  assert.equal(osmane[0].contratoFim, '2099-12-31');
  assert.deepEqual(r.avisos, []);
  const ok = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Osmane'));
  assert.equal(ok.status, 200, ok.error);
});

// Média: CPF que o RH não aceita (verificador errado, dígitos repetidos) não vira ID no PCP.
test('revisão: o PCP usa o mesmo CPF válido do RH; CPF que não confere fica sem ID, travado', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const rhSrc = fs.readFileSync(path.join(root, '../impresilkrh/supabase/functions/_shared/freelancerContrato.ts'), 'utf8');
  const casos = ['300.005.987-39', '300.005.987-38', '000.000.000-00', '111.111.111-11', '30000111104', '3000011110', '', 'abc'];
  if (/export function cpfValido/.test(rhSrc)) {
    // A régua do RH, sem os tipos: as duas dizem o mesmo para cada CPF.
    const corpo = /export function cpfValido\(v: unknown\): boolean \{([\s\S]*?)\n\}/.exec(rhSrc)[1].replace(/\(base: string, peso: number\)/, '(base, peso)');
    const soDig = v => String(v ?? '').replace(/\D/g, '');
    const rhValido = new Function('soDigitosCpf', 'v', corpo).bind(null, soDig);
    for (const c of casos) assert.equal(S.cpfValido(c), rhValido(c), 'cpfValido ' + c);
  }
  const r = S.juntarFreelancers([], [
    CONTRATO('fl-dv', {nome:'Prestador DV Errado', cpf:'300.005.987-38'}),
    CONTRATO('fl-a', {nome:'Prestador Alfa', cpf:'000.000.000-00'}),
    CONTRATO('fl-b', {nome:'Prestador Beta', cpf:'000.000.000-00', contratoFim:'2099-12-30'}),
  ], {hoje:'2026-09-29'});
  const dv = r.contratos.find(c => c.nome === 'Prestador DV Errado');
  assert.equal(dv.id, '', 'sem ID');
  assert.equal(dv.semCpf, true);
  assert.equal(dv.cpfInvalido, true);
  assert.deepEqual(r.contratos.map(c => c.nome).sort(), ['Prestador Alfa', 'Prestador Beta', 'Prestador DV Errado'], 'nenhum some');
  // No seletor, o motivo é o CPF que não confere.
  const t = telaPicker({pessoas:[{chave:'freelancer:fl-dv', id:'', nome:'Prestador DV Errado', apelido:'', ativo:true, freelancer:true, semCpf:true, cpfInvalido:true}], antigos:[], avisos:[]});
  t.run(`_modalDraft={id:'o1', equipe:[]}; abrirPickerEquipe();`);
  const linha = t.html().split('<label').find(l => l.includes('Prestador DV Errado'));
  assert.match(linha, /disabled/);
  assert.match(linha, /CPF que não confere/);
});

// Baixa: contrato sem ID conta na ambiguidade, nunca é o resultado.
test('revisão: contrato sem CPF entra na conta de ambiguidade, e o nome antigo não muda de dono quando o CPF chega', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const ficha = {chave:'lucas-ferreira', id:'300001', nome:'Lucas Ferreira Gomes', apelido:''};
  const semCpf = {chave:'freelancer:fl-lucas', id:'', nome:'Lucas Prado', apelido:'', freelancer:true, semCpf:true};
  const comCpf = {...semCpf, id:'300006', semCpf:undefined};
  for (const M of [O, S]) {
    const antes = M.resolverPessoas({pessoas:[ficha, semCpf]}), depois = M.resolverPessoas({pessoas:[ficha, comCpf]});
    assert.equal(antes.chave('Lucas'), 'nome:lucas', 'o contrato sem CPF já deixa "Lucas" ambíguo');
    assert.equal(depois.chave('Lucas'), 'nome:lucas', 'e continua igual quando o CPF chega');
    assert.equal(antes.idDe('Lucas Prado'), '', 'sem ID, nunca é o resultado');
    assert.equal(antes.chave('Lucas Prado'), 'nome:lucas prado');
    assert.equal(antes.idDe('Lucas Ferreira'), '300001');
  }
  const d = {pessoas:[ficha, semCpf], lista:['Lucas']};
  const a = O.resolverPessoas(d), b = S.resolverPessoas(d);
  for (const x of ['Lucas', 'Lucas Prado', 'Lucas Ferreira', '300001'])
    for (const f of ['idDe', 'chave', 'nome']) assert.equal(b[f](x), a[f](x), f + ' ' + x);
});

// Baixa: vínculo salvo não liga nome a ID repetido.
test('revisão: vínculo salvo que aponta para ID repetido não resolve (as duas réguas), e a tela não oferece esse ID', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const pessoas = [
    {chave:'rita-moraes', id:'300003', nome:'Rita Moraes', apelido:'rita', idRepetido:true},
    {chave:'freelancer:fl-renan', id:'300003', nome:'Renan Brito', apelido:'renan', freelancer:true, idRepetido:true},
  ];
  const vinculos = [{apelido:'Rita', id:'300003', chave:'rita-moraes', nome:'Rita Moraes'}];
  for (const M of [O, S]) {
    const r = M.resolverPessoas({pessoas, vinculos});
    assert.equal(r.idDe('Rita'), '');
    assert.equal(r.chave('Rita'), 'nome:rita');
  }
  const ctx = vm.createContext({console, Date,
    STORE:{getAllOS:()=>[], getCFG:()=>({instaladores:['Rita'], vinculosRH:[]}), saveCFG(){}, elenco:()=>({pessoas:[...pessoas.map(p => ({...p, ativo:true}))], antigos:[], avisos:[], fichaRH:true}), valores:()=>({})},
    STATE:{}, document:{getElementById:()=>null, querySelectorAll:()=>[], body:{classList:{add(){}, remove(){}, contains:()=>false}}},
    localStorage:{getItem:()=>null, setItem(){}, removeItem(){}}, esc:s => String(s ?? ''), CSS:{escape:s => s}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  vm.runInContext(`OPERACAO.usarPessoas(() => ({pessoas: STORE.elenco().pessoas, vinculos: STORE.getCFG().vinculosRH, lista: STORE.getCFG().instaladores}))`, ctx);
  const html = vm.runInContext('ligacaoRHHTML()', ctx);
  const opcoes = html.match(/<option value="(rita-moraes|freelancer:fl-renan)"[^>]*>[^<]*/g) || [];
  assert.ok(opcoes.length >= 2);
  for (const o of opcoes) { assert.match(o, /disabled/); assert.match(o, /ID repetido/); }
  assert.equal(vm.runInContext(`ligarApelidoRH('Rita', 'rita-moraes')`, ctx), false, 'nem pela porta do botão');
});

// Baixa: seletor com o ID repetido já na O.S.
test('revisão: ID repetido já na O.S. é UMA linha; desmarcar tira o ID ao confirmar', () => {
  const t = telaPicker(ELENCO);
  t.run(`_modalDraft={id:'o2', equipe:['300003']}; abrirPickerEquipe();`);
  const linhas = t.html().split('<label').slice(1);
  const doId = linhas.filter(l => /value="300003"/.test(l));
  assert.equal(doId.length, 1, 'uma linha só para o ID');
  assert.match(doId[0], /checked/);
  assert.doesNotMatch(doId[0], /disabled/);
  assert.match(doId[0], /Rita Moraes/); assert.match(doId[0], /Renan Brito/);
  // O OK grava os valores das caixas marcadas: sem a linha do ID, o ID sai.
  const gravar = marcadas => [...new Set(marcadas.filter(Boolean))];
  const caixas = linhas.map(l => ({v:/value="([^"]*)"/.exec(l)[1], on:/<input[^>]*checked/.test(l)}));
  caixas.find(c => c.v === '300003').on = false;
  assert.deepEqual(gravar(caixas.filter(c => c.on).map(c => c.v)), []);
  // Sem estar na O.S., continuam as linhas travadas de cada cadastro.
  t.run(`_modalDraft={id:'o3', equipe:[]}; abrirPickerEquipe();`);
  assert.equal(t.html().split('<label').filter(l => /value="300003"/.test(l) && /disabled/.test(l)).length, 2);
});

// Baixa: Atualizar elenco lia as caixas antes do pedido.
test('revisão: o que a gestão marca com o "Atualizar elenco" no ar continua marcado', async () => {
  const nodes = new Map();
  const node = sel => { if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', style:{}, querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}}); return nodes.get(sel); };
  const caixas = [{value:'300001', checked:false}, {value:'300005', checked:false}];
  let soltar; const noAr = new Promise(r => soltar = r);
  const STORE = {getAllOS:()=>[], getCFG:()=>({instaladores:[]}), getOS:()=>null, uuid:()=>'x', saveOS(){}, elenco:()=>ELENCO,
    pullElenco: async () => { await noAr; return true; }};
  const ctx = vm.createContext({console, Date, document:{querySelector:node, querySelectorAll:sel => sel.includes('input[type=checkbox]') ? caixas : [], addEventListener(){}},
    window:{}, navigator:{onLine:true}, localStorage:{getItem:()=>null}, STORE, setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'R',papel:'pcp'}; renderModal=()=>{}; toast=()=>{}; _modalDraft={id:'o1', equipe:[]}; _pickerField='equipe'; abrirPickerEquipe();`, ctx);
  const p = vm.runInContext('atualizarElencoDoPicker()', ctx);
  caixas[1].checked = true;
  soltar(); await p;
  const linha = node('#picker-list').innerHTML.split('<label').find(l => l.includes('value="300005"'));
  assert.match(linha, /<input[^>]*checked/);
});

// Baixa: pacote da gestão no tablet compartilhado.
function storeComElenco(pacote, papel) {
  const db = {transaction() { const tx = {objectStore:() => ({
    get(k) { const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:k === 'elenco' ? pacote : null}})); return req; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); },
  })}; return tx; }};
  const ls = new Map([['impresilk_inst_user', JSON.stringify({nome:'Quem', papel})]]);
  const ctx = vm.createContext({console:{log(){}, warn(){}, error(){}}, navigator:{onLine:false}, window:{addEventListener(){}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout:() => 1, clearTimeout() {}, AbortController, API_BASE:'http://teste', fetch:async () => ({ok:true, status:200, json:async () => ({})})});
  vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), ctx);
  return vm.runInContext('STORE', ctx);
}
test('revisão: o elenco que a gestão deixou no disco chega podado à montagem (antigos, tag e travas)', async () => {
  const pacote = {em:'2026-09-29T10:00:00Z', papel:'pcp', fichaRH:true, ferias:[{chave:'x'}], ausencias:[{chave:'x'}], avisos:['aviso'],
    pessoas:[...ELENCO.pessoas.map(p => ({...p, contratoFim:'2099-12-31', situacaoContrato:'ativo'}))],
    antigos:[{chave:'freelancer:fl-fim', id:'300007', nome:'Vitor Encerrado', desligado:true, freelancer:true}, {chave:'osmar', id:'300002', nome:'Osmar', desligado:true}]};
  const m = storeComElenco(pacote, 'montagem');
  await m.pronto();
  const el = m.elenco();
  assert.equal(el.antigos.length, 0, 'quem saiu não passa à montagem');
  assert.equal(el.ferias.length + el.ausencias.length + el.avisos.length, 0);
  assert.ok(!el.pessoas.some(p => p.chave === 'freelancer:fl-sem'), 'contrato sem ID fica fora');
  for (const p of el.pessoas) for (const c of ['freelancer', 'semCpf', 'idRepetido', 'contratoFim', 'situacaoContrato']) assert.equal(p[c], undefined, p.nome + ' ' + c);
  const op = storeComElenco(pacote, 'operacao');
  await op.pronto();
  assert.equal(op.elenco().antigos.length, 0);
  assert.equal(op.elenco().pessoas.find(p => p.chave === 'freelancer:fl-pantera').freelancer, true, 'a operação escolhe gente: a tag fica');
  assert.equal(op.elenco().pessoas.find(p => p.chave === 'freelancer:fl-sem').semCpf, true);
  const pcp = storeComElenco(pacote, 'pcp');
  await pcp.pronto();
  assert.equal(pcp.elenco().antigos.length, 2, 'admin e pcp continuam com tudo');
});

test('revisão: a tela nova pede os freelancers ao servidor', async () => {
  const pedidos = [];
  const ls = new Map([['impresilk_inst_user', JSON.stringify({nome:'Gestor', papel:'pcp'})]]);
  const ctx = vm.createContext({console:{log(){}, warn(){}, error(){}}, navigator:{onLine:true}, window:{addEventListener(){}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const req = {}; const db = {transaction() { const tx = {objectStore:() => ({
      get() { const r = {}; queueMicrotask(() => r.onsuccess?.({target:{result:null}})); return r; },
      put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
      queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout:() => 1, clearTimeout() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { pedidos.push(JSON.parse(req.body)); return {ok:true, status:200, json:async () => ({pessoas:[], antigos:[]})}; }});
  vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), ctx);
  const s = vm.runInContext('STORE', ctx);
  await s.pronto();
  await s.pullElenco(true);
  const pedido = pedidos.find(p => p.action === 'elenco');
  assert.ok(pedido, 'pediu o elenco');
  assert.equal(pedido.freelancers, true);
});
