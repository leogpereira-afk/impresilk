'use strict';
/* ONDA PESSOAS, ITEM 5 (fila de 11/10/2026; D-015): O ID GRAVADO NO RH MANDA.
   O ID da pessoa nasce com a ficha (e com o contrato de freelancer) e não muda
   quando o RH corrige um CPF digitado errado. O RH grava o ID no campo
   `idPessoa` do registro; o pcp-sync lê o campo e só calcula pelos 6
   primeiros dígitos do CPF quando ele falta. Os casos ruins: o CPF corrigido
   que mudava a pessoa de ID em silêncio (ela perdia equipes, divisões,
   ranking e comissão), o gravado e o CPF discordando sem aviso, e um
   fechamento feito pela v169 que recalculasse diferente. Dados fictícios: o
   repositório é público (CPFs inventados, com os verificadores certos onde a
   régua do contrato exige). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');

// CPF fictício com os dois verificadores certos, a partir de 9 dígitos.
function cpf(nove) {
  const dv = base => { let s = 0; for (let i = 0; i < base.length; i++) s += Number(base[i]) * (base.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(nove), d2 = dv(nove + d1);
  return nove + d1 + d2;
}
const colab = (chave, cpfTxt, nome, extra = {}) => ({id:chave, colecao:'colaboradores', apagado:false, registro:{id:chave, nome, apelido:'', cpf:cpfTxt, statusId:'ativo', ...extra}});
const CONTRATO = (id, extra) => ({id, nome:'', apelido:'', cpf:'', funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31', ...extra});
const free = (id, extra) => ({id, colecao:'freelancers', apagado:false, registro:CONTRATO(id, extra)});
const cfg = extra => [{id:true, config:{instaladores:['Vera', 'Caio'], vinculosRH:[], ...extra}, atualizado_em:'2026-09-19T10:00:00Z'}];
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, numero:id, tipo:'externo', cliente:'Cliente fictício', liberadoPCP:true, ...registro}});
const toque = nome => ({nome, sub:nome, papel:'montagem', montagemIndividual:true});
const gestao = {papel:'pcp', nome:'Gestor fictício'};

/* ------------------------------------------------------------ a régua */
test('régua: o ID gravado manda; o CPF só quando o campo falta; discordância marcada; o CPF nunca sai', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  assert.equal(S.CAMPO_ID_PESSOA, 'idPessoa');
  assert.deepEqual(S.idDoCadastroRH({cpf:'51000111111'}), {id:'510001', fonte:'cpf', divergente:false, gravadoInvalido:false});
  assert.deepEqual(S.idDoCadastroRH({cpf:'51000111111', idPessoa:'510001'}), {id:'510001', fonte:'gravado', divergente:false, gravadoInvalido:false});
  // O CPF foi corrigido: o ID gravado continua o mesmo, com a marca.
  assert.deepEqual(S.idDoCadastroRH({cpf:'52000111111', idPessoa:'510001'}), {id:'510001', fonte:'gravado', divergente:true, gravadoInvalido:false});
  // Gravado sem CPF: vale o gravado (não há o que comparar).
  assert.deepEqual(S.idDoCadastroRH({idPessoa:' 510001 '}), {id:'510001', fonte:'gravado', divergente:false, gravadoInvalido:false});
  // Campo fora do formato não vale: fica o do CPF, com a marca para o aviso.
  assert.deepEqual(S.idDoCadastroRH({cpf:'51000111111', idPessoa:'5100'}), {id:'510001', fonte:'cpf', divergente:false, gravadoInvalido:true});
  // A régua do contrato exige CPF válido para calcular; o gravado vale sem ele.
  assert.equal(S.idDoCadastroRH({cpf:'51000111111'}, {exigirCpfValido:true}).id, '');
  assert.equal(S.idDoCadastroRH({cpf:cpf('510002111')}, {exigirCpfValido:true}).id, '510002');
  assert.equal(S.idDoCadastroRH({cpf:'51000111111', idPessoa:'510009'}, {exigirCpfValido:true}).id, '510009');
  const aviso = S.avisoIdDoCadastro({nome:'Vera Fictícia', id:'510001', idDivergente:true});
  assert.match(aviso, /ID 510001/); assert.match(aviso, /vale o ID gravado/); assert.ok(!/52000111111|111111/.test(aviso));
  assert.equal(S.avisoIdDoCadastro({nome:'Sem Marca', id:'510001'}), '');
});

test('contrato de freelancer: o ID gravado manda sobre o do CPF, e a discordância vira aviso sem CPF', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const novo = cpf('530003222');
  const r = S.juntarFreelancers([], [CONTRATO('fl-caio', {nome:'Caio Fictício', cpf:novo, idPessoa:'530099'})], {hoje:'2026-10-12'});
  assert.equal(r.contratos[0].id, '530099');
  assert.equal(r.contratos[0].idDivergente, true);
  assert.equal(r.contratos[0].semCpf, undefined);
  assert.ok(r.avisos.some(a => /contrato de freelancer de Caio Fictício/.test(a) && /ID 530099/.test(a)));
  assert.ok(!JSON.stringify(r).includes(novo), 'o CPF não sai da junção');
  // Sem o campo, como antes: o ID do CPF, sem aviso.
  const antes = S.juntarFreelancers([], [CONTRATO('fl-caio', {nome:'Caio Fictício', cpf:novo})], {hoje:'2026-10-12'});
  assert.equal(antes.contratos[0].id, '530003'); assert.deepEqual(antes.avisos, []);
});

test('mesmo CPF na ficha e no contrato com IDs gravados diferentes: aviso para o RH deixar um só', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const c = cpf('540004333');
  const r = S.juntarFreelancers([{chave:'ana-x', id:'540004', nome:'Ana Fictícia', desligado:true, ativo:false, cpf:c}],
    [CONTRATO('fl-ana', {nome:'Ana Fictícia', cpf:c, idPessoa:'540077'})], {hoje:'2026-10-12'});
  assert.ok(r.avisos.some(a => /IDs gravados diferentes \(540004 e 540077\)/.test(a)), JSON.stringify(r.avisos));
});

/* ------------------------------------------------------------ o servidor */
// O caso ruim: a Vera tinha o CPF digitado errado; o ID dela (510001) está nas
// O.S. O RH corrige o CPF (agora começa por 520001) e grava o ID que ela já tinha.
const RH_CORRIGIDO = [
  colab('vera', '52000111111', 'Vera Fictícia', {apelido:'vera', idPessoa:'510001'}),
  colab('davi', '56000111111', 'Davi Fictício', {apelido:'davi'}),
  free('fl-caio', {nome:'Caio Fictício', apelido:'caio', cpf:cpf('530003222'), idPessoa:'530003'}),
];

test('elenco: a pessoa com o CPF corrigido continua com o ID gravado; a gestão recebe o aviso; o CPF não desce', async () => {
  const e = await edge('pcp-sync', {registros:RH_CORRIGIDO, pcp_config_global:cfg()});
  const r = await e.call({action:'elenco', freelancers:true}, gestao);
  assert.equal(r.status, 200, r.error);
  assert.equal(r.pessoas.find(p => p.chave === 'vera').id, '510001', 'o ID gravado, não o do CPF corrigido');
  assert.equal(r.pessoas.find(p => p.chave === 'davi').id, '560001', 'sem o campo, o do CPF, como antes');
  assert.equal(r.pessoas.find(p => p.chave === 'freelancer:fl-caio').id, '530003');
  assert.ok(r.avisos.some(a => /A ficha de Vera Fictícia/.test(a) && /ID 510001/.test(a)), JSON.stringify(r.avisos));
  const tudo = JSON.stringify(r);
  for (const x of ['52000111111', '56000111111', cpf('530003222'), 'idPessoa', 'idDivergente']) assert.ok(!tudo.includes(x), 'no pacote: ' + x);
  // A montagem e o crachá sem senha: o mesmo ID, e nenhum aviso.
  for (const quem of [toque('Vera'), {papel:'montagem', nome:'Montagem'}, {papel:'operacao', nome:'Operação'}]) {
    const m = await e.call({action:'elenco', leve:true, freelancers:true}, quem);
    assert.equal(m.status, 200, m.error);
    assert.equal(m.pessoas.find(p => p.chave === 'vera').id, '510001');
    assert.deepEqual(m.avisos, []);
  }
});

test('crachá de toque da pessoa com o CPF corrigido continua abrindo a O.S. gravada com o ID dela', async () => {
  // Antes desta onda: o ID virava 520001 e o crachá da Vera era recusado na O.S. dela.
  const e = await edge('pcp-sync', {registros:RH_CORRIGIDO, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['510001']})]});
  const ok = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Vera'));
  assert.equal(ok.status, 200, ok.error);
  const nao = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, toque('Davi'));
  assert.equal(nao.status, 422, 'o colega de fora continua recusado');
});

test('a lista de pessoas da comissão usa o ID gravado', async () => {
  const e = await edge('pcp-sync', {registros:RH_CORRIGIDO, pcp_config_global:cfg()});
  const r = await e.run('fichasRH()');
  const vera = r.find(p => p.chave === 'vera');
  assert.equal(vera.id, '510001');
  assert.equal(vera.idDivergente, true);
});

/* ------------------------------- o fechamento da v169 recalcula igual */
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor fictício', sub:'gestor', exp:EXP};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const FICHAS = [colab('p1', '10000111111', 'Pessoa fictícia'), colab('p2', '20000222222', 'Pessoa fictícia dois'), colab('g', '44455566677', 'Gestor fictício', {apelido:'gestor'})];
function bancoNov() {
  const o = (id, numero, equipe, dia) => ({id, numero, rev:3, tipo:'externo', cliente:'Cliente fictício', valorTotal:8500, equipe, veiculo:'Carro fictício',
    horaRetorno:'18:00', retornoEm:dia + 'T18:00:00', finalizadaEm:dia + 'T21:00:00.000Z', finalizadoPor:'Gestor fictício', entregaLancada:{data:dia, em:dia + 'T21:00:00.000Z', por:'Gestor fictício'}});
  const oss = [o('A', '90601', ['100001'], '2026-11-05'), o('B', '90602', ['100001', '200002'], '2026-11-12')];
  return {pcp_registros:oss.map(x => ({colecao:'os', id:x.id, apagado:false, atualizado_em:'2026-11-20T00:00:00Z', registro:x})), registros:FICHAS,
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[
      {id:'A', membros:[{chave:'100001', nome:'Pessoa fictícia', percentual:100}], por:'Gestor fictício', em:'2026-11-06T00:00:00Z'},
      {id:'B', membros:[{chave:'100001', nome:'Pessoa fictícia', percentual:60}, {chave:'200002', nome:'Pessoa fictícia dois', percentual:40}], por:'Gestor fictício', em:'2026-11-13T00:00:00Z'}]}}}],
    painel_ordens:oss.map(x => ({numero:x.numero, valor:8500}))};
}
const recalculo = (e, selo) => { const s = JSON.stringify({regraNota:selo.regraNota, regraPerdas:selo.regraPerdas, regraVolta:selo.regraVolta}); return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`); };
function v169(t) {
  let src = '';
  try { src = execFileSync('git', ['-C', RAIZ, 'show', '8ab34b6:supabase/functions/pcp-sync/index.ts'], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch { src = ''; }
  if (!src) { t.skip('sem o histórico do git (clone raso ou cópia por git archive)'); return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-v169-'));
  fs.mkdirSync(path.join(dir, 'fn')); fs.mkdirSync(path.join(dir, '_shared'));
  fs.writeFileSync(path.join(dir, 'fn', 'index.ts'), src);
  const lista = execFileSync('git', ['-C', RAIZ, 'ls-tree', '--name-only', '8ab34b6', 'supabase/functions/_shared/'], {encoding:'utf8'}).split('\n').filter(Boolean);
  for (const f of lista) fs.writeFileSync(path.join(dir, '_shared', path.basename(f)), execFileSync('git', ['-C', RAIZ, 'show', '8ab34b6:' + f], {encoding:'utf8'}));
  return {dir, tipo:path.relative(path.join(RAIZ, 'supabase/functions'), path.join(dir, 'fn')), shared:path.join(dir, '_shared')};
}

test('o fechamento feito pela v169 recalcula igual depois desta onda: sem o campo, com o campo gravado e com o CPF corrigido', async t => {
  const velho = v169(t); if (!velho) return;
  try {
    const antigo = await edge(velho.tipo, bancoNov(), {shared:velho.shared});
    relogio(antigo, '2026-12-02T12:00:00Z');
    const fonte = await antigo.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
    assert.equal(fonte.status, 200, JSON.stringify(fonte));
    const f = await antigo.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:'fechar-v169-nov', motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
    assert.equal(f.status, 200, JSON.stringify(f));
    const selo = f.fechamento;
    // 1. O banco passa ao servidor novo como está (nenhuma ficha com o campo, como hoje na produção).
    const novo = await edge('pcp-sync', structuredClone(antigo.db));
    relogio(novo, '2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo, selo)).hash, selo.hash, 'sem o campo');
    // 2. O RH grava o campo em todas as fichas, igual ao CPF (o preenchimento das antigas).
    const com = structuredClone(antigo.db);
    for (const r of com.registros) r.registro.idPessoa = r.registro.cpf.slice(0, 6);
    const novo2 = await edge('pcp-sync', com);
    relogio(novo2, '2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo2, selo)).hash, selo.hash, 'com o campo gravado');
    // 3. Depois de gravado, o RH corrige o CPF de uma pessoa: o ID não muda, o recálculo também não.
    const corrigido = structuredClone(com);
    corrigido.registros.find(r => r.id === 'p2').registro.cpf = '29000222222';
    const novo3 = await edge('pcp-sync', corrigido);
    relogio(novo3, '2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo3, selo)).hash, selo.hash, 'com o CPF corrigido e o ID gravado');
    // O caso ruim, para medir: sem o campo, a correção do CPF mudava a pessoa (e o recálculo).
    const semCampo = structuredClone(antigo.db);
    semCampo.registros.find(r => r.id === 'p2').registro.cpf = '29000222222';
    const novo4 = await edge('pcp-sync', semCampo);
    relogio(novo4, '2026-12-03T12:00:00Z');
    assert.ok(!(await novo4.run('fichasRH()')).some(p => p.id === '200002'), 'sem o campo, a correção do CPF tirava a pessoa do ID dela (comissão: "cadastro inexistente")');
    assert.ok((await novo3.run('fichasRH()')).some(p => p.id === '200002'), 'com o campo, ela continua no ID dela');
  } finally { fs.rmSync(velho.dir, {recursive:true, force:true}); }
});
