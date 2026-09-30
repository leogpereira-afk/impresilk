/* PERFORMANCE LÊ A ALOCAÇÃO E MOSTRA A COBERTURA (F11, 30/09/2026).
 *
 * Uma régua só no aparelho (PERF, em performance.js) e na apuração do
 * servidor (perfFonte, no pcp-sync):
 *  - divisão da O.S. válida e atual: confirmada, equipe pelo equipeId, e o
 *    valor da equipe é a SOMA DAS COTAS (a O.S. com duas equipes não conta
 *    inteira nas duas);
 *  - sem divisão: a participação antiga do blob, como antes; a equipe pela
 *    composição é SUGESTÃO e só com exatamente uma equipe ativa daquela gente;
 *  - divisão desatualizada ou esperando o RH: aparece com a marca e não
 *    confirma; nome sem ficha (o jeito antigo da F09) confirma pela
 *    participação.
 * A régua da equipe mora num bloco que é o mesmo texto nos dois lados
 * (performance.js e _shared/pcp-integridade.mjs). O hash do período aberto
 * pode mudar; o de uma revisão fechada, nunca. Cada teste começa pelo caso
 * ruim. Dados fictícios: o repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const P = require('../performance.js');

const RAIZ = path.join(__dirname, '..');
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
const plano = v => JSON.parse(JSON.stringify(v));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/* ───────────── dados fictícios ───────────── */
const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS_RH = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
  ficha('caio-f', 'Caio Fictício', 'caio', '10000333333'),
  ficha('edu-f', 'Edu Fictício', 'edu', '10000555555'),
  ficha('fabi-f', 'Fabi Fictícia', 'fabi', '10000666666'),
  ficha('davi-f', 'Davi Fictício', 'davi', '30000412345'),
  ficha('gil-f', 'Gil Fictício', 'gil', '30000712345'),
];
// As mesmas fichas como o elenco as entrega ao aparelho (chave = id do documento, id = 6 dígitos do CPF).
const FICHAS = FICHAS_RH.map(f => ({chave:f.id, id:f.registro.cpf.slice(0, 6), nome:f.registro.nome, apelido:f.registro.apelido, ativo:true}));
const EQUIPES = [
  // Águia gravada com um membro pelo slug do RH (aba v133): a régua converte.
  {id:'eq-aguia', nome:'Águia', emblema:'🦅', animal:'aguia', cor:'marinho', liderPadraoId:'100001', membros:[{chave:'ana-f', nome:'Ana'}, {chave:'100002', nome:'Bia'}], ativo:true},
  {id:'eq-leao', nome:'Leão', emblema:'🦁', animal:'leao', cor:'laranja', liderPadraoId:'300004', membros:[{chave:'300004', nome:'Davi'}], ativo:true},
  {id:'eq-onca', nome:'Onça', emblema:'🐆', animal:'onca', cor:'ocre', liderPadraoId:'300007', membros:[{chave:'300007', nome:'Gil'}], ativo:true},
  // Duas ativas com a MESMA gente: nenhuma é deduzida.
  {id:'eq-tigre', nome:'Tigre', emblema:'🐯', membros:[{chave:'100005', nome:'Edu'}, {chave:'100006', nome:'Fabi'}], ativo:true},
  {id:'eq-touro', nome:'Touro', emblema:'🐂', membros:[{chave:'100006', nome:'Fabi'}, {chave:'100005', nome:'Edu'}], ativo:true},
  // Desativada com a gente da Águia: não disputa a composição.
  {id:'eq-velha', nome:'Velha', emblema:'🦁', membros:[{chave:'100001', nome:'Ana'}, {chave:'100002', nome:'Bia'}], ativo:false},
];
const fim = {finalizadaEm:'2026-09-25T18:00:00Z', entregaLancada:{data:'2026-09-25'}};
const aguia = () => plano(D.montar([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]));
const duas = (leao = 'eq-leao', davi = '300004') => plano(D.montar([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:leao, liderId:davi, membros:[davi]}]));
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Fiorino', ...fim, ...registro}});
const PARTICIPACOES = [
  {id:'L1', numero:'7001', membros:[{chave:'100001', nome:'Ana', percentual:50}, {chave:'100002', nome:'Bia', percentual:50}], equipeId:'eq-aguia', equipeNome:'Águia', emblema:'🦅', por:'Gestor', em:'2026-09-26T10:00:00.000Z'},
  // O jeito antigo da F09: alguém só pelo nome, sem ficha no RH.
  {id:'L4', numero:'7004', membros:[{chave:'100001', nome:'Ana', percentual:70}, {chave:'Zeca', nome:'Zeca', percentual:30}], por:'Gestor', em:'2026-09-26T10:00:00.000Z'},
];
function osFixas() {
  return [
    row('A1', {numero:'5001', equipe:['100001', '100002'], alocacao:{...aguia(), por:'Gestor', em:'2026-09-25T18:00:00Z'}, valorTotal:1000}),
    row('A2', {numero:'5002', equipe:['100001', '100002', '300004'], alocacao:{...duas(), por:'Gestor', em:'2026-09-25T18:00:00Z'}, valorTotal:1000}),
    // Uma aba antiga trocou a equipe (Caio no lugar da Bia) sem mandar a divisão.
    row('A3', {numero:'5003', equipe:['100001', '100003'], alocacao:{...aguia(), desatualizada:true}, valorTotal:300}),
    row('A4', {numero:'5004', equipe:['100001', '100002'], alocacao:{...aguia(), conferirRH:true}, valorTotal:200}),
    row('L1', {numero:'7001', equipe:['Ana', 'Bia'], valorTotal:500}),
    row('L2', {numero:'7002', equipe:['100001', '100002'], valorTotal:400}),
    row('L3', {numero:'7003', equipe:['100005', '100006'], valorTotal:250}),
    row('L4', {numero:'7004', equipe:['100001', 'Zeca'], valorTotal:150}),
    row('L5', {numero:'7005', equipe:['ana', 'bia'], valorTotal:100}),
    row('S1', {numero:'9001', equipe:[], valorTotal:80}),
  ];
}
const cfgBase = (extra = {}) => ({instaladores:['Ana', 'Bia', 'Zeca'], performancePCP:{equipes:plano(EQUIPES), participacoes:plano(PARTICIPACOES), ...extra}});
const bancoCom = (regs, cfg = cfgBase()) => ({pcp_registros:regs, registros:plano(FICHAS_RH), pcp_config_global:[{id:true, config:cfg, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const periodo = {de:'2026-09-01', ate:'2026-09-29'};
async function apurar(e) { const r = await e.call({action:'performancePeriodo', ...periodo}, gestor); assert.equal(r.status, 200, JSON.stringify(r)); return r; }
const porId = (regs, id) => regs.find(r => r.id === id);

/* ───────────── o aparelho (performance.js com divisao.js e operacao.js) ───────────── */
function aparelho({cfg = cfgBase(), papel = 'pcp', src = null, osLocal = [], fila = []} = {}) {
  const c = {console, setTimeout, clearTimeout,
    STORE:{getCFG:() => cfg, getAllOS:() => osLocal, getQueue:() => fila, getOS:id => osLocal.find(o => o.id === id)},
    STATE:{user:{papel}, _perfPessoaMedida:'nota', _perfRankMedida:'entregas'},
    periodoOuMes:() => ({...periodo}), classificarEntregas:xs => ({instalacoes:xs, aLancar:[]}),
    diaEntrega:o => String((o && o.entregaLancada && o.entregaLancada.data) || (o && o.finalizadaEm) || '').slice(0, 10),
    valorDaOS:o => o.valorTotal == null ? null : Number(o.valorTotal),
    pessoasRH:() => FICHAS, avatarRH:() => '', esc, dinheiroCasa:n => 'R$' + Number(n).toFixed(2), filtroPeriodoHTML:() => '', normCasa:s => String(s || '').toLowerCase()};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'operacao.js'), 'utf8'), c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'divisao.js'), 'utf8'), c);
  vm.runInContext("OPERACAO.usarPessoas(() => ({pessoas:" + JSON.stringify(FICHAS) + ", vinculos:[], lista:['Ana','Bia','Zeca']}));", c);
  // O nome de exibição pela mesma régua de pessoas (fichaDoApelido, no casa.js).
  c.nomeExibicaoCasa = n => { const id = c.OPERACAO_ID(n); const f = id ? FICHAS.find(p => p.id === id) : null; return f ? {chave:f.chave, id:f.id, nome:f.nome, pessoa:f} : {chave:n, id:'', nome:n}; };
  vm.runInContext('var OPERACAO_ID = v => OPERACAO.idPessoa(v);', c);
  vm.runInContext(src || fs.readFileSync(path.join(RAIZ, 'performance.js'), 'utf8'), c);
  return c;
}
// A base do servidor dentro da tela, como a gestão vê (perfCarregarFonte).
function comBase(c, fonte, {fechamentos = [], selecionado = ''} = {}) {
  c.__f = fonte; c.__h = fechamentos; c.__s = selecionado;
  vm.runInContext("perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__s;perfRemoto.tentado=true;", c);
  return c;
}
const cortar = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* ───────────── a régua é o mesmo texto nos dois lados ───────────── */

test('régua da equipe: o bloco é o mesmo texto em performance.js e em _shared/pcp-integridade.mjs', () => {
  const bloco = arquivo => {
    const s = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const ini = s.indexOf('/* ==== RÉGUA DA EQUIPE NA APURAÇÃO'), fimB = s.indexOf('/* ==== FIM DA RÉGUA DA EQUIPE ==== */');
    assert.ok(ini >= 0 && fimB > ini, arquivo + ': marcas da régua não encontradas');
    return s.slice(ini, fimB);
  };
  assert.equal(bloco('performance.js'), bloco('supabase/functions/_shared/pcp-integridade.mjs'), 'mudou uma cópia e não a outra');
});

/* Os 400 casos gerados que rodavam as duas cópias com o MESMO idDe saíram
   (revisão da F11): com o texto idêntico (teste acima), eles não podiam
   falhar. No lugar, tests/performance-alocacao-f11-revisao.test.cjs gera
   casos que passam pela apuração do servidor (perfFonte) e pela do aparelho
   (perfRegistro), cada uma com a régua de pessoas dela e um elenco com quem
   saiu da empresa. */

/* ───────────── paridade: a apuração do servidor e a da tela ───────────── */

test('paridade: servidor (perfFonte) e aparelho (perfRegistro) dão a mesma confirmação, gente, equipes e sugestão', async () => {
  const e = await edge('pcp-sync', bancoCom(osFixas()));
  const srv = await apurar(e);
  const c = aparelho();
  const cfg = {equipes:plano(EQUIPES), participacoes:plano(PARTICIPACOES)};
  const essencial = r => plano({confirmado:r.confirmado, fonte:r.fonte, membros:r.membros.map(m => [String(m.chave), m.percentual]),
    equipeId:r.equipeId || '', grupos:(r.grupos || []).map(g => [g.equipeId, g.cota, g.membros]),
    sugerida:r.confirmado ? 'confirmada' : (r.equipeSugerida ? r.equipeSugerida.equipeId : null)});
  const ids = osFixas().map(o => o.id);
  assert.equal(srv.registros.length, ids.length, 'toda O.S. do período entra na apuração');
  for (const o of osFixas()) {
    const noAparelho = c.perfRegistro(plano(o.registro), cfg);
    assert.deepEqual(essencial(noAparelho), essencial(porId(srv.registros, o.id)), 'O.S. ' + o.id);
  }
  // O que cada caso tem de dar (o caso ruim primeiro).
  const s = id => porId(srv.registros, id);
  assert.equal(s('A3').confirmado, false);assert.equal(s('A3').fonte, 'alocacao-desatualizada');
  assert.equal(s('A4').confirmado, false);assert.equal(s('A4').fonte, 'alocacao-conferir-rh');
  assert.equal(s('L3').equipeSugerida, null, 'Tigre e Touro têm a mesma gente: nenhuma é deduzida');
  assert.equal(s('L2').equipeSugerida.equipeId, 'eq-aguia', 'uma só ativa com essa gente (a Velha está desativada)');
  assert.equal(s('L5').equipeSugerida.equipeId, 'eq-aguia', 'apelidos antigos viram a mesma gente pela régua');
  assert.equal(s('S1').equipeSugerida, null);assert.deepEqual(s('S1').membros, []);
  assert.equal(s('L4').confirmado, true, 'o jeito antigo (nome sem ficha) confirma pela participação');assert.equal(s('L4').fonte, 'participacao');
  assert.ok(!('equipeSugerida' in s('A1')) && !('equipeSugerida' in s('L1')), 'confirmada não leva sugestão');
});

/* ───────────── duas equipes: a soma das cotas ───────────── */

test('duas equipes na divisão: cada uma leva a SUA cota do valor, e a O.S. conta uma vez em cada', async () => {
  const e = await edge('pcp-sync', bancoCom([osFixas()[1]]));
  const [a2] = (await apurar(e)).registros;
  // Caso ruim de antes: sem `grupos`, a O.S. inteira ia para uma composição avulsa.
  assert.equal(a2.equipeId, '', 'duas equipes: o registro não tem equipe única');
  assert.deepEqual(plano(a2.grupos.map(g => [g.equipeId, g.cota, g.membros])), [['eq-aguia', 6667, ['100001', '100002']], ['eq-leao', 3333, ['300004']]]);
  const eqs = P.resumir([a2]).equipes;
  const v = Object.fromEntries(eqs.map(x => [x.chave, x]));
  assert.equal(v['eq-aguia'].valor, 666.7);assert.equal(v['eq-leao'].valor, 333.3);
  assert.equal(Math.round((v['eq-aguia'].valor + v['eq-leao'].valor) * 100), 100000, 'a soma é o valor da O.S., nem um centavo a mais');
  assert.equal(v['eq-aguia'].os, 1);assert.equal(v['eq-leao'].os, 1);
  assert.ok(!eqs.some(x => x.chave.startsWith('avulsa:')), 'nenhuma composição avulsa com a O.S. inteira');
  // Cada pessoa pela parte final dela (40,01 + 26,66 + 33,33).
  const pessoas = Object.fromEntries(P.resumir([a2]).pessoas.map(x => [x.chave, x.valor]));
  assert.deepEqual(pessoas, {100001:400.1, 100002:266.6, 300004:333.3});
  // Centavo que sobra fica com a equipe com mais gente, e a soma fecha em qualquer valor.
  for (const valor of [0.01, 0.02, 1, 99.99, 1234.57, -10]) {
    const partes = P.ratearGrupos(valor, [{cota:3333, membros:[1]}, {cota:6667, membros:[1, 2]}]);
    assert.equal(partes.reduce((s, x) => s + x, 0), Math.round(valor * 100), 'valor ' + valor);
  }
  // Sem valor: as duas equipes contam a entrega "sem valor", nenhuma vira zero.
  const semValor = P.resumir([{...a2, valor:null}]).equipes;
  assert.ok(semValor.every(x => x.semValor === 1 && x.valor === 0));
  // A nota de 0 a 100 é a mesma com ou sem `grupos` (só o valor da equipe muda).
  const {grupos: _g, ...sem} = a2;
  assert.deepEqual(plano(P.avaliar([a2])), plano(P.avaliar([sem])));
  // O dossiê do relatório põe a O.S. nas duas, com a parte de cada uma.
  const dos = Object.fromEntries(P.dossie([{...a2, confirmado:true}]).map(g => [g.chave, g]));
  assert.equal(dos['eq-aguia'].valor, 666.7);assert.equal(dos['eq-leao'].valor, 333.3);
  assert.deepEqual(dos['eq-leao'].membros.map(m => m.chave), ['300004']);
});

/* ───────────── a marca de desatualizada ───────────── */

test('divisão desatualizada: aparece com a marca na lista, na faixa e no detalhe, e não confirma', async () => {
  const e = await edge('pcp-sync', bancoCom(osFixas()));
  const srv = await apurar(e);
  const c = comBase(aparelho(), srv);
  const html = c.performanceEquipesHTML();
  const linha = html.match(/<tr data-perf-id="A3">[\s\S]*?<\/tr>/)[0];
  assert.match(linha, /badge perf-st-desat">Divisão desatualizada</);
  assert.doesNotMatch(linha, /Confirmada/);
  assert.match(html.match(/<tr data-perf-id="A4">[\s\S]*?<\/tr>/)[0], /perf-st-desat">Divisão a conferir no RH</);
  const faixa = cortar(c.perfCoberturaHTML(c.perfUnirPessoas(srv.registros.map(r => c.perfRegistro({id:r.id, _perf:r}, c.perfConfig()))), periodo));
  assert.match(faixa, /1 com a divisão desatualizada/);assert.match(faixa, /1 com pessoa a conferir no RH/);
  assert.match(html, /<option value="desatualizada">Divisão desatualizada ou a conferir no RH<\/option>/, 'dá para filtrar a lista pela marca');
  assert.ok(!html.includes('—'), 'sem travessão nos textos');
});

/* ───────────── sem divisão: o legado ───────────── */

test('O.S. sem divisão usa o legado: participação antiga confirma como antes; sem ela, divisão igual sugerida', async () => {
  const e = await edge('pcp-sync', bancoCom(osFixas()));
  const srv = await apurar(e);
  const l1 = porId(srv.registros, 'L1'), l2 = porId(srv.registros, 'L2');
  assert.equal(l1.confirmado, true);assert.equal(l1.fonte, 'participacao');assert.equal(l1.equipeId, 'eq-aguia');
  assert.deepEqual(plano(l1.membros.map(m => m.percentual)), [50, 50]);
  assert.equal(l2.confirmado, false);assert.equal(l2.fonte, 'sugestao');
  assert.deepEqual(plano(l2.membros.map(m => m.percentual)), [50, 50], 'sugestão continua dividindo igual (a nota não muda)');
  // Na tela: a equipe sugerida aparece com o nome e a marca "sugerida"; a confirmada, sem a marca.
  const c = comBase(aparelho(), srv);
  const html = c.performanceEquipesHTML();
  assert.match(html.match(/<tr data-perf-id="L2">[\s\S]*?<\/tr>/)[0], /Águia<\/strong> <span class="perf-sugerida">sugerida<\/span>/);
  assert.doesNotMatch(html.match(/<tr data-perf-id="L1">[\s\S]*?<\/tr>/)[0], /perf-sugerida/);
  assert.doesNotMatch(html.match(/<tr data-perf-id="L3">[\s\S]*?<\/tr>/)[0], /Tigre|Touro/, 'duas com a mesma gente: nenhum nome');
});

test('duas equipes ativas com a mesma composição não deduzem nenhuma (servidor, aparelho e tela)', async () => {
  const S = await shared();
  const idDe = m => m.chave;
  const gente = [{chave:'100005'}, {chave:'100006'}];
  assert.equal(S.equipeDaComposicao(gente, EQUIPES, idDe), null);
  assert.equal(P.equipeDaComposicao(gente, [...EQUIPES].reverse(), idDe), null, 'a ordem do cadastro não decide');
  assert.equal(P.equipeDoRegistro({id:'x', membros:P.iguais([{chave:'100005', nome:'Edu'}, {chave:'100006', nome:'Fabi'}])}, EQUIPES), null);
  // Desativada uma das duas, sobra exatamente uma, e ela vale (nos dois lados).
  const umaSo = EQUIPES.map(q => q.id === 'eq-touro' ? {...q, ativo:false} : q);
  assert.equal(S.equipeDaComposicao(gente, umaSo, idDe).id, 'eq-tigre');
  assert.equal(P.equipeDaComposicao(gente, umaSo, idDe).id, 'eq-tigre');
  const cfg = cfgBase();cfg.performancePCP.equipes = umaSo;
  const e = await edge('pcp-sync', bancoCom(osFixas(), cfg));
  assert.equal(porId((await apurar(e)).registros, 'L3').equipeSugerida.equipeId, 'eq-tigre');
});

/* ───────────── a cobertura bate com a contagem ───────────── */

test('cobertura: a faixa "Equipe nas entregas" diz confirmadas, sugeridas, sem equipe e o valor, e bate com a lista', async () => {
  const e = await edge('pcp-sync', bancoCom(osFixas()));
  const srv = await apurar(e);
  const c = comBase(aparelho(), srv);
  const html = c.performanceEquipesHTML();
  // A contagem da lista (os selos de situação de cada linha).
  const selos = [...html.matchAll(/badge perf-st-(\w+)"/g)].map(m => m[1]);
  const conta = t => selos.filter(x => t.includes(x)).length;
  assert.equal(selos.length, 10);
  const conf = conta(['ok']), sug = conta(['sug', 'desat', 'erro']), sem = conta(['sem']);
  assert.deepEqual([conf, sug, sem], [4, 5, 1], 'A1, A2, L1 e L4 confirmadas; A3, A4, L2, L3 e L5 sugeridas; S1 sem equipe');
  const faixa = html.match(/<section class="perf-cobertura[\s\S]*?<\/section>/)[0];
  assert.match(faixa, /<strong>9 de 10<\/strong> entregas com equipe/);
  assert.match(faixa, new RegExp(`<b>${conf}</b> confirmadas \\(2 pela participação antiga\\)`));
  assert.match(faixa, new RegExp(`<b>${sug}</b> sugeridas, a conferir`));
  assert.match(faixa, new RegExp(`<b>${sem}</b> sem equipe`));
  // O valor: 1000 + 1000 + 500 + 150 confirmados de 3980 no período.
  const k = c.perfCoberturaConta(c.perfUnirPessoas(srv.registros.map(r => c.perfRegistro({id:r.id, _perf:r}, c.perfConfig()))));
  assert.deepEqual(plano(k.valor), {conf:2650, sug:1250, sem:80, total:3980});
  assert.match(cortar(faixa), /R\$2650\.00 · 67% do valor/);assert.match(cortar(faixa), /R\$80\.00 · 2% do valor/);
  assert.match(cortar(faixa), /Valor do período: R\$3980\.00, com R\$2650\.00 em entregas confirmadas \(67%\)/);
  // "Completar equipes" continua levando à conferência filtrada em "Sem equipe".
  assert.match(faixa, /data-perf-filtrar="sem-equipe">Completar equipes</);
  // Quem não vê R$ (montagem) vê as contagens e não o valor.
  const m = comBase(aparelho({papel:'montagem'}), srv);
  const mont = m.perfCoberturaHTML(m.perfUnirPessoas(srv.registros.map(r => m.perfRegistro({id:r.id, _perf:r}, m.perfConfig()))), periodo);
  assert.doesNotMatch(mont, /R\$|do valor|Valor do período/);assert.match(mont, /<b>4<\/b> confirmadas/);
});

/* ───────────── hash: aberto muda, fechado não ───────────── */

test('hash: período fechado continua com o mesmo hash e conteúdo; o aberto muda e o hash velho não fecha (409)', async () => {
  const regs = osFixas().filter(o => ['A1', 'A2', 'L1', 'L4'].includes(o.id));
  const e = await edge('pcp-sync', bancoCom(regs));
  const fonte = await apurar(e);
  assert.ok(fonte.registros.every(r => r.confirmado), 'participação antiga e divisão confirmam juntas');
  const f = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-fechar-0001', motivo:'Fechamento de teste', anterior:'', leGrupos:true}, gestor);
  assert.equal(f.ok, true, JSON.stringify(f));
  const selado = f.fechamento.hash;
  assert.equal(selado, fonte.hash);
  // O selo confere com o próprio conteúdo guardado (a mesma conta do servidor).
  const conteudo = x => ({periodo:x.periodo, regra:x.regra, criterios:x.criterios, registros:x.registros});
  assert.equal(sha(conteudo(f.fechamento)), selado);
  // Depois de fechar: a segunda equipe da A2 vira outra (mesma gente), a Águia muda de nome e surge equipe nova.
  const a2 = e.db.pcp_registros.find(r => r.id === 'A2').registro;
  a2.alocacao.grupos[1].equipeId = 'eq-onca';
  const cfg = e.db.pcp_config_global[0].config;
  cfg.performancePCP.equipes = cfg.performancePCP.equipes.map(q => q.id === 'eq-aguia' ? {...q, nome:'Águia Dourada'} : q);
  const aberta = await apurar(e);
  assert.notEqual(aberta.hash, fonte.hash, 'o hash do período aberto muda: a equipe da parte do Davi mudou');
  assert.equal(porId(aberta.registros, 'A2').grupos[1].equipeId, 'eq-onca');
  const velho = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-fechar-0002', motivo:'Com o hash velho', anterior:f.fechamento.id, leGrupos:true}, gestor);
  assert.equal(velho.status, 409, 'fechar com o hash de antes da troca é recusado');
  const hist = await e.call({action:'performanceFechamentos', ...periodo}, gestor);
  const [rev] = hist.fechamentos;
  assert.equal(rev.hash, selado, 'a revisão fechada continua com o MESMO hash');
  assert.equal(sha(conteudo(rev)), selado, 'e o conteúdo dela ainda bate com o selo');
  assert.equal(porId(rev.registros, 'A2').grupos[1].equipeId, 'eq-leao', 'a revisão guarda a equipe da época');
  assert.equal(porId(rev.registros, 'A1').equipeNome, 'Águia', 'e o nome da época');
  // Na tela, a revisão fechada mostra o que foi selado: Leão com a parte dele, Águia com o nome de antes.
  const c = comBase(aparelho({cfg}), aberta, {fechamentos:hist.fechamentos, selecionado:rev.id});
  c.STATE._perfModo = 'equipes';c.STATE._perfRankMedida = 'valor';
  const tela = cortar(c.performanceEquipesHTML());
  assert.match(tela, /Leão/);assert.doesNotMatch(tela, /Onça R\$/);assert.doesNotMatch(tela, /Águia Dourada/);
});

test('hash: revisão fechada antes da F11 (duas equipes sem `grupos`) fica como foi selada, na tela e no servidor', async () => {
  // O retrato da v138: a O.S. com duas equipes ia inteira para a composição avulsa.
  const registros = [{id:'A2', numero:'5002', cliente:'Cliente Fictício A2', dia:'2026-08-20', valor:1000, origemValor:'O.S. do PCP',
    membros:[{chave:'100001', nome:'Ana Fictícia', percentual:40.01}, {chave:'100002', nome:'Bia Fictícia', percentual:26.66}, {chave:'300004', nome:'Davi Fictício', percentual:33.33}],
    confirmado:true, fonte:'alocacao', equipeId:'', equipeNome:'', emblema:'🤝', obs:'', por:'Gestor', em:'2026-08-21', retrabalho:false, retornoConf:null, voltou:true, volta:'2026-08-20|fiorino|100001+100002+300004'}];
  const per = {de:'2026-08-01', ate:'2026-08-31'};
  const conteudo = {periodo:per, regra:'performance-3', criterios:{producao:60, limpeza:20, equipamentos:20}, registros};
  const antiga = {...conteudo, hash:sha(conteudo), consultadoEm:'2026-09-01T10:00:00Z', completo:true, fonte:'teste', ...per, id:'2026-08-01:2026-08-31:000001', revisao:1, anterior:null, requestId:'antiga-000001', motivo:'Agosto', fechadoEm:'2026-09-01T10:00:00Z', fechadoPor:'Gestor'};
  const banco = bancoCom([]);banco.pcp_registros.push({colecao:'performance_fechamentos', id:antiga.id, apagado:false, atualizado_em:antiga.fechadoEm, registro:plano(antiga)});
  const e = await edge('pcp-sync', banco);
  const hist = await e.call({action:'performanceFechamentos', ...per}, gestor);
  assert.deepEqual(plano(hist.fechamentos[0]), plano(antiga), 'o servidor novo devolve a revisão intacta');
  // A conta da tela para a revisão selada é a de quando foi selada: sem `grupos`, a O.S. inteira na composição.
  const eqs = P.resumir(P.comEquipes(hist.fechamentos[0].registros, EQUIPES, {historico:true})).equipes;
  assert.equal(eqs.length, 1);assert.ok(eqs[0].chave.startsWith('avulsa:'));assert.equal(eqs[0].valor, 1000);
});

test('hash por regra: período que a v138 fecharia (tudo confirmado, uma equipe por O.S.) não ganha campo novo', async () => {
  const regs = osFixas().filter(o => ['A1', 'L1', 'L4'].includes(o.id));
  const e = await edge('pcp-sync', bancoCom(regs));
  const fonte = await apurar(e);
  const CAMPOS_V138 = ['id', 'numero', 'cliente', 'dia', 'valor', 'origemValor', 'membros', 'confirmado', 'fonte', 'equipeId', 'equipeNome', 'emblema', 'obs', 'por', 'em', 'retrabalho', 'retornoConf', 'voltou', 'volta'];
  for (const r of fonte.registros) assert.deepEqual(Object.keys(r), CAMPOS_V138, 'registro ' + r.id + ': o conteúdo do hash da performance-3 é o de hoje');
  assert.equal(fonte.regra, 'performance-3');
});

test('hash por regra: com o código da v138 ao lado (histórico do git), o hash do mesmo período é idêntico', async t => {
  let antigo = '';
  try { antigo = execFileSync('git', ['-C', RAIZ, 'show', 'c6ca608:supabase/functions/pcp-sync/index.ts'], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch (e) { antigo = ''; }
  // Na CI do Pages o clone é raso: sem o histórico, este teste não tem com o que comparar.
  if (!antigo) { t.skip('sem o histórico do git (clone raso)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-v138-'));
  fs.mkdirSync(path.join(dir, 'fn'));fs.writeFileSync(path.join(dir, 'fn', 'index.ts'), antigo);
  const tipo = path.relative(path.join(RAIZ, 'supabase/functions'), path.join(dir, 'fn'));
  const regs = () => osFixas().filter(o => ['A1', 'L1', 'L4'].includes(o.id));
  const [novo, velho] = [await edge('pcp-sync', bancoCom(regs())), await edge(tipo, bancoCom(regs()))];
  const [hn, hv] = [(await apurar(novo)).hash, (await apurar(velho)).hash];
  assert.equal(hn, hv, 'período fechável sem duas equipes: o hash da performance-3 é o mesmo da v138');
  // Com duas equipes ou sugestão, muda (o período aberto pode mudar).
  const [n2, v2] = [await edge('pcp-sync', bancoCom(osFixas())), await edge(tipo, bancoCom(osFixas()))];
  assert.notEqual((await apurar(n2)).hash, (await apurar(v2)).hash);
  fs.rmSync(dir, {recursive:true, force:true});
});

/* ───────────── Fechar período: participação antiga e divisão ───────────── */

test('Fechar período funciona com participação antiga e com divisão; desatualizada ou sugerida trava, no servidor e na tela', async () => {
  const soConfirmadas = osFixas().filter(o => ['A1', 'A2', 'L1', 'L4'].includes(o.id));
  let e = await edge('pcp-sync', bancoCom(soConfirmadas));
  let fonte = await apurar(e);
  const c = comBase(aparelho(), fonte);
  assert.equal(c.perfFechamentoBloqueio(fonte, 0), '', 'a tela deixa fechar');
  const ok = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-misto-0001', motivo:'Setembro misto', anterior:'', leGrupos:true}, gestor);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.fechamento.registros.map(r => r.fonte).sort(), ['alocacao', 'alocacao', 'participacao', 'participacao']);
  // Caso ruim: uma divisão desatualizada no período trava, e a tela diz por quê.
  e = await edge('pcp-sync', bancoCom([...soConfirmadas, osFixas()[2]]));
  fonte = await apurar(e);
  assert.match(comBase(aparelho(), fonte).perfFechamentoBloqueio(fonte, 0), /1 entrega sem participação confirmada/);
  const recusa = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-misto-0002', motivo:'Com desatualizada', anterior:'', leGrupos:true}, gestor);
  assert.equal(recusa.status, 422);
});

/* ───────────── ranking por Valor ───────────── */

test('ranking por Valor: só o confirmado, a equipe pela soma das cotas; desatualizada e sugerida ficam fora', async () => {
  const e = await edge('pcp-sync', bancoCom(osFixas()));
  const srv = await apurar(e);
  const c = comBase(aparelho(), srv);
  c.STATE._perfModo = 'equipes';c.STATE._perfRankMedida = 'valor';
  const regs = c.perfUnirPessoas(srv.registros.map(r => c.perfRegistro({id:r.id, _perf:r}, c.perfConfig())));
  const vis = P.comEquipes(regs, EQUIPES, {resolver:c.perfIdMembro});
  const conf = Object.fromEntries(P.resumir(vis.filter(r => r.confirmado)).equipes.map(x => [x.nome, x.valor]));
  // Águia: A1 inteira (1000) + a parte dela na A2 (666,70) + L1 (500, participação com a equipe).
  assert.equal(conf['Águia'], 2166.7);assert.equal(conf['Leão'], 333.3);
  assert.equal(Object.keys(conf).length, 3, 'Águia, Leão e a composição da L4 (nome sem ficha)');
  assert.ok(!('Tigre' in conf) && !('Touro' in conf), 'sugerida não entra no valor');
  const html = cortar(c.performanceEquipesHTML());
  assert.match(html, /R\$2166\.70 confirmado/);assert.match(html, /R\$333\.30 confirmado/);
  assert.doesNotMatch(html, /R\$2666\.70|R\$2966\.70|R\$3166\.70/, 'as sugeridas (L2 e L5) e a desatualizada (A3) não somam na Águia');
  // No ranking por Entregas a sugerida conta (a L2 e a L5 na Águia).
  c.STATE._perfRankMedida = 'entregas';
  const todas = Object.fromEntries(P.resumir(vis).equipes.map(x => [x.nome, x.os]));
  /* Revisão da F11: a A3 (desatualizada, com o Caio no lugar da Bia) entra na
     Águia porque é a equipe que a DIVISÃO escolheu; antes ela era deduzida
     pela composição (Ana e Caio, nenhuma equipe) e ficava de fora. */
  assert.equal(todas['Águia'], 7, 'A1, A2 e L1 confirmadas; L2 e L5 sugeridas pela composição; A3 e A4 pela equipe da divisão');assert.equal(todas['Leão'], 1);
  // "Ver entregas" da Leão acha a A2 (a O.S. das duas equipes).
  assert.deepEqual(P.chavesDeEquipe(vis.find(r => r.id === 'A2')), ['eq-aguia', 'eq-leao']);
  // Pessoas por valor: só o confirmado, cada um pela parte final.
  const pes = Object.fromEntries(P.resumir(regs.filter(r => r.confirmado)).pessoas.map(x => [x.chave, x.valor]));
  assert.equal(pes['300004'], 333.3);
  assert.equal(pes['100001'], 1355.1, 'A1 60% (600) + A2 40,01% (400,10) + L1 50% (250) + L4 70% (105)');
});

/* ───────────── a aba presa na v138 com o servidor novo ───────────── */

/* A ABA PRESA NA v138 com o servidor novo. Decisão do dono (revisão da F11):
   a v138 não lê `grupos` e mostra a O.S. de duas equipes inteira numa
   composição avulsa, mas o selo gravaria a parte de cada equipe. Quem fecha
   aprovaria números diferentes dos que o registro guarda. Por isso o servidor
   só fecha período com `grupos` quando a tela manda leGrupos:true (só a tela
   nova manda); o período sem `grupos` continua fechando pela aba antiga. O
   Fechar roda fora da fila (STORE.api na hora), então o 422 não prende nada. */
test('aba presa na v138: lê a apuração do servidor novo sem quebrar; fecha período sem `grupos` e recebe 422 no que tem', async t => {
  let antigo = '';
  try { antigo = execFileSync('git', ['-C', RAIZ, 'show', 'c6ca608:performance.js'], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch (e) { antigo = ''; }
  if (!antigo) { t.skip('sem o histórico do git (clone raso)'); return; }
  // Caso ruim: período com a O.S. de duas equipes (A2). A v138 renderiza, deixa clicar, e o servidor recusa.
  const comGrupos = osFixas().filter(o => ['A1', 'A2', 'L1', 'L4'].includes(o.id));
  const e = await edge('pcp-sync', bancoCom(comGrupos));
  const fonte = await apurar(e);
  assert.ok(porId(fonte.registros, 'A2').grupos, 'o servidor novo manda `grupos`');
  const c = comBase(aparelho({src:antigo}), fonte);
  for (const modo of ['pessoas', 'equipes']) for (const medida of ['nota', 'valor', 'entregas']) {
    c.STATE._perfModo = modo;c.STATE._perfPessoaMedida = medida === 'entregas' ? 'peso' : medida;c.STATE._perfRankMedida = medida === 'nota' ? 'entregas' : medida;
    assert.doesNotThrow(() => c.performanceEquipesHTML(), modo + ' ' + medida);
  }
  assert.equal(c.perfFechamentoBloqueio(fonte, 0), '', 'a v138 vê tudo confirmado e deixa clicar');
  const recusa = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-v138-00001', motivo:'Fechado pela aba antiga', anterior:''}, gestor);
  assert.equal(recusa.status, 422);
  assert.equal(recusa.error, 'Recarregue a página para fechar: este período tem O.S. dividida entre duas equipes e esta tela é de uma versão anterior.');
  assert.equal(e.db.pcp_registros.filter(r => r.colecao === 'performance_fechamentos').length, 0, 'nada foi selado');
  // A tela nova (leGrupos:true) fecha o mesmo período com o mesmo hash.
  const nova = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f11-nova-00001', motivo:'Fechado pela tela nova', anterior:'', leGrupos:true}, gestor);
  assert.equal(nova.ok, true, JSON.stringify(nova));
  // Sem `grupos` no período: a aba presa na v138 continua fechando, com o hash que ela manda.
  const semGrupos = osFixas().filter(o => ['A1', 'L1', 'L4'].includes(o.id));
  const e1 = await edge('pcp-sync', bancoCom(semGrupos));
  const f1 = await apurar(e1);
  assert.ok(f1.registros.every(r => !('grupos' in r)));
  assert.equal(comBase(aparelho({src:antigo}), f1).perfFechamentoBloqueio(f1, 0), '');
  const r = await e1.call({action:'performanceFechar', ...periodo, hash:f1.hash, requestId:'f11-v138-00002', motivo:'Fechado pela aba antiga', anterior:''}, gestor);
  assert.equal(r.ok, true, 'o hash que a v138 manda é o que o servidor novo confere');
  // Com sugestão no período, a v138 ignora os campos novos: nada quebra.
  const e2 = await edge('pcp-sync', bancoCom(osFixas()));
  const f2 = await apurar(e2);
  const c2 = comBase(aparelho({src:antigo}), f2);c2.STATE._perfModo = 'equipes';
  assert.doesNotThrow(() => c2.performanceEquipesHTML());
});
