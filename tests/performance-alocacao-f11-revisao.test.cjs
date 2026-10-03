/* REVISÃO DA F11 (30/09/2026): os defeitos que as duas revisões adversariais
 * acharam na Performance que lê a alocação. Cada teste começa pelo caso ruim
 * e falha na versão de antes do conserto.
 *  1. A faixa contava a mesma O.S. em "sem equipe" e na marca das sugeridas.
 *  2. A equipe escolhida na divisão era ignorada: a sugestão vinha da
 *     composição (decisão: seguir o plano, a composição só vale sem divisão).
 *  3. Divisão com duas equipes, uma em 0%: o registro ganhava equipe única e
 *     o hash mudava sem campo novo. Agora o registro é o da v138 (sem equipe
 *     única) e a divisão vai em `grupos`: a mudança do hash é esperada e vem
 *     do campo novo.
 *  4. O centavo entre equipes não seguia o motor quando alguém ficava em 0%.
 *  5. O 409 do Fechar não recarregava a apuração.
 *  6. A sugestão do servidor e a do aparelho divergiam quando a equipe guarda
 *     o slug de quem saiu; o teste antigo (mesmo texto, mesmo idDe) não pegava.
 *     Agora os casos gerados passam por perfFonte e por perfRegistro.
 *  7. A aba presa na v138 fechava período com duas equipes vendo outra conta
 *     (decisão: o servidor recusa sem leGrupos:true, com a mensagem).
 * Dados fictícios: o repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const P = require('../performance.js');

const RAIZ = path.join(__dirname, '..');
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
const plano = v => JSON.parse(JSON.stringify(v));
const cortar = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const git = arquivo => { try { return execFileSync('git', ['-C', RAIZ, 'show', 'c6ca608:' + arquivo], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch (e) { return ''; } };

/* ───────────── dados fictícios ───────────── */
const ficha = (id, nome, apelido, cpf, extra = {}) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf, ...extra}});
// Davi e Hugo SAÍRAM da empresa: o servidor ainda tem a ficha; o aparelho da gestão os tem em `antigos`.
const FICHAS_RH = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
  ficha('caio-f', 'Caio Fictício', 'caio', '10000333333'),
  ficha('edu-f', 'Edu Fictício', 'edu', '10000555555'),
  ficha('davi-f', 'Davi Fictício', 'davi', '30000412345', {dataDesligamento:'2026-10-10'}),
  ficha('hugo-f', 'Hugo Fictício', 'hugo', '30000812345', {dataDesligamento:'2026-09-20'}),
];
const ativa = f => !f.registro.dataDesligamento;
// O elenco como o servidor o manda à gestão: quem está na casa, e quem saiu em `antigos`.
const ELENCO = FICHAS_RH.filter(ativa).map(f => ({chave:f.id, id:f.registro.cpf.slice(0, 6), nome:f.registro.nome, apelido:f.registro.apelido, ativo:true}));
const ANTIGOS = FICHAS_RH.filter(f => !ativa(f)).map(f => ({chave:f.id, id:f.registro.cpf.slice(0, 6), nome:f.registro.nome, apelido:f.registro.apelido, ativo:false, desligado:true}));
const EQUIPES = [
  {id:'eq-aguia', nome:'Águia', emblema:'🦅', animal:'aguia', cor:'marinho', liderPadraoId:'100001', membros:[{chave:'100001', nome:'Ana'}, {chave:'100002', nome:'Bia'}], ativo:true},
  {id:'eq-leao', nome:'Leão', emblema:'🦁', animal:'leao', cor:'laranja', liderPadraoId:'100003', membros:[{chave:'100003', nome:'Caio'}], ativo:true},
];
const fim = {finalizadaEm:'2026-09-25T18:00:00Z', entregaLancada:{data:'2026-09-25'}};
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Fiorino', ...fim, ...registro}});
const cfgBase = (equipes = EQUIPES, participacoes = []) => ({instaladores:['Ana', 'Bia', 'Zeca'], performancePCP:{equipes:plano(equipes), participacoes:plano(participacoes)}});
const bancoCom = (regs, cfg = cfgBase()) => ({pcp_registros:regs, registros:plano(FICHAS_RH), pcp_config_global:[{id:true, config:cfg, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const periodo = {de:'2026-09-01', ate:'2026-09-29'};
async function apurar(e, notaPorValor=false) { const r = await e.call({action:'performancePeriodo', ...periodo, notaPorValor}, gestor); assert.equal(r.status, 200, JSON.stringify(r)); return r; }
const porId = (regs, id) => regs.find(r => r.id === id);
const aloc = grupos => plano(D.montar(grupos));

/* ───────────── o aparelho da gestão ─────────────
   Como no index.html: operacao.js liga a régua de pessoas ao elenco
   (pessoas + antigos, operacao.js), pessoasRH() é só quem está na casa
   (casa.js) e o nome de exibição passa pela mesma régua (fichaDoApelido). */
function aparelho({cfg = cfgBase(), papel = 'pcp', src = null, api = null, fila = [], ler = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')} = {}) {
  const toasts = [];
  const c = {console, setTimeout, clearTimeout, toasts,
    STORE:{getCFG:() => cfg, getAllOS:() => [], getQueue:() => fila, getOS:() => null, elenco:() => ({pessoas:ELENCO, antigos:ANTIGOS}), uuid:() => 'req-' + Math.random().toString(16).slice(2, 14), ...(api ? {api} : {})},
    STATE:{user:{papel}, _perfPessoaMedida:'nota', _perfRankMedida:'entregas'},
    periodoOuMes:() => ({...periodo}), classificarEntregas:xs => ({instalacoes:xs, aLancar:[]}),
    diaEntrega:o => String((o && o.entregaLancada && o.entregaLancada.data) || (o && o.finalizadaEm) || '').slice(0, 10),
    valorDaOS:o => o.valorTotal == null ? null : Number(o.valorTotal),
    pessoasRH:() => ELENCO, avatarRH:() => '', esc, dinheiroCasa:n => 'R$' + Number(n).toFixed(2), filtroPeriodoHTML:() => '', normCasa:s => String(s || '').toLowerCase(),
    toast:(msg, tipo) => toasts.push([msg, tipo || '']), renderPerformanceCasa:() => {}};
  vm.createContext(c);
  vm.runInContext(ler('operacao.js'), c);
  vm.runInContext(ler('divisao.js'), c);
  const OP = vm.runInContext('OPERACAO', c);
  c.nomeExibicaoCasa = n => {
    const p = OP.pessoaDe(n);
    if (!p) return {chave:n, nome:n, id:''};
    return p.semFicha ? {chave:'', id:p.id, nome:'ID ' + p.id} : {chave:p.chave || p.id || n, nome:p.nome || n, id:p.id || ''};
  };
  vm.runInContext(src || ler('performance.js'), c);
  return c;
}
function comBase(c, fonte, {fechamentos = [], selecionado = ''} = {}) {
  c.__f = fonte; c.__h = fechamentos; c.__s = selecionado;
  vm.runInContext("perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__s;perfRemoto.tentado=true;", c);
  return c;
}
const naTela = (c, srv) => c.perfUnirPessoas(srv.registros.map(r => c.perfRegistro({id:r.id, _perf:r}, c.perfConfig())));

/* O STORE.api de verdade diante do servidor (store.js): 2xx e 409 voltam com o
   corpo; o resto lança o erro com a mensagem do servidor. */
function apiDe(e, pedidos) {
  return async body => {
    pedidos.push(plano(body));
    const {status, ...corpo} = await e.call(body, gestor);
    if (status >= 400 && status !== 409) throw Object.assign(new Error(corpo.error || 'HTTP ' + status), {status});
    return corpo;
  };
}
/* Um DOM mínimo para o Fechar (perfWireFonte e perfDialog): o botão, o
   diálogo com o formulário, o campo de erro e o FormData com o motivo. */
function domDoFechar(c, motivo) {
  const no = () => ({onclick:null, disabled:false, textContent:'', value:''});
  const botoes = {'#perf-fechar':no(), '#perf-atualizar-fonte':no(), '#perf-versao':no()};
  const dialogo = {aberto:false, fechado:0, innerHTML:'', id:'',
    partes:{form:{onsubmit:null, valores:{motivo}}, '[type="submit"]':no(), '#perf-fechar-erro':no(), '[aria-label="Fechar edição"]':no()},
    querySelector(sel) { return this.partes[sel] || null; }, showModal() { this.aberto = true; }, close() { this.aberto = false; this.fechado++; }};
  c.document = {getElementById:() => null, createElement:() => dialogo, body:{appendChild() {}}};
  c.FormData = class { constructor(f) { this.f = f; } get(k) { return this.f.valores[k]; } };
  const el = {querySelector:sel => botoes[sel] || null};
  c.perfWireFonte(el);
  return {botoes, dialogo, async enviar() { await dialogo.partes.form.onsubmit({preventDefault() {}, target:dialogo.partes.form}); }};
}

/* ───────────── 1. a faixa conta cada entrega num lugar só ───────────── */

test('revisão: a divisão desatualizada que ficou SEM gente conta só em "sem equipe", não também na marca das sugeridas', async () => {
  const regs = [
    row('X1', {numero:'8001', equipe:['100001', '100002'], valorTotal:100}),
    // Caso ruim: uma aba antiga esvaziou os.equipe e a divisão ficou desatualizada.
    row('X2', {numero:'8002', equipe:[], alocacao:{...aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]), desatualizada:true}, valorTotal:200}),
    // Com gente, a desatualizada leva a marca (é sugerida).
    row('X3', {numero:'8003', equipe:['100001', '100003'], alocacao:{...aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]), desatualizada:true}, valorTotal:300}),
  ];
  const srv = await apurar(await edge('pcp-sync', bancoCom(regs)));
  const c = comBase(aparelho(), srv);
  const html = c.performanceEquipesHTML();
  const faixa = cortar(html.match(/<section class="perf-cobertura[\s\S]*?<\/section>/)[0]);
  assert.match(faixa, /1 sem equipe/);
  assert.match(faixa, /2 sugeridas, a conferir \(1 com a divisão desatualizada\)/, 'só a X3 (com gente) leva a marca');
  // O selo da X2 é "Sem equipe", e a faixa bate com os selos da lista, marca por marca.
  assert.match(html.match(/<tr data-perf-id="X2">[\s\S]*?<\/tr>/)[0], /badge perf-st-sem">Sem equipe</);
  const k = c.perfCoberturaConta(naTela(c, srv));
  const selos = [...html.matchAll(/badge perf-st-(\w+)">([^<]+)</g)].map(m => m[2]);
  assert.equal(k.sem, selos.filter(s => s === 'Sem equipe').length);
  assert.equal(k.desatualizadas, selos.filter(s => s === 'Divisão desatualizada').length);
  assert.equal(k.confirmadas + k.sugeridas + k.sem, k.total, 'cada entrega num grupo só');
  // O filtro "Divisão desatualizada ou a conferir no RH" usa a mesma régua: a X2 está em "Sem equipe".
  assert.deepEqual(naTela(c, srv).filter(r => c.perfSituacaoEntrega(r)[2]).map(r => r.id), ['X3']);
});

/* ───────────── 2. a equipe escolhida na divisão manda ───────────── */

test('revisão: a divisão que espera o RH ou está desatualizada sugere a equipe que ELA escolheu, nunca a da composição', async () => {
  // Caso ruim: a divisão diz Leão, com a gente que o cadastro tem na Águia.
  const aLeao = aloc([{equipeId:'eq-leao', liderId:'100001', membros:['100001', '100002']}]);
  const duasD = aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003']}]);
  const regs = [
    row('R1', {numero:'8101', equipe:['100001', '100002'], alocacao:{...aLeao, conferirRH:true}, valorTotal:500}),
    // Desatualizada com duas equipes: as duas, cada uma sugerida (a Bia saiu da O.S. numa aba antiga).
    row('R2', {numero:'8102', equipe:['100001', '100003'], alocacao:{...duasD, desatualizada:true}, valorTotal:600}),
    // Sem divisão: a composição continua valendo.
    row('R3', {numero:'8103', equipe:['100001', '100002'], valorTotal:700}),
  ];
  const e = await edge('pcp-sync', bancoCom(regs));
  const srv = await apurar(e);
  const r1 = porId(srv.registros, 'R1');
  assert.equal(r1.confirmado, false);
  assert.equal(r1.equipeSugerida && r1.equipeSugerida.equipeId, 'eq-leao', 'a sugestão é a equipe da divisão');
  const r2 = porId(srv.registros, 'R2');
  assert.equal(r2.equipeSugerida, null);
  assert.deepEqual(plano(r2.grupos.map(g => g.equipeId)), ['eq-aguia', 'eq-leao']);
  assert.equal(porId(srv.registros, 'R3').equipeSugerida.equipeId, 'eq-aguia');
  // O aparelho, sem o servidor, dá o mesmo (a mesma régua).
  const c = comBase(aparelho(), srv);
  for (const o of regs) {
    const local = c.perfRegistro(plano(o.registro), c.perfConfig()), s = porId(srv.registros, o.id);
    assert.deepEqual(plano({sug:local.equipeSugerida, grupos:(local.grupos || []).map(g => g.equipeId)}), plano({sug:s.equipeSugerida, grupos:(s.grupos || []).map(g => g.equipeId)}), o.id);
  }
  // Ranking por Entregas: Leão com a R1 e a R2; Águia com a R2 e a R3. Nada no valor confirmado.
  const vis = P.comEquipes(naTela(c, srv), EQUIPES, {resolver:c.perfIdMembro});
  assert.deepEqual(Object.fromEntries(P.resumir(vis).equipes.map(x => [x.nome, x.os])), {'Águia':2, 'Leão':2});
  assert.deepEqual(P.resumir(vis.filter(r => r.confirmado)).equipes, []);
  // Na lista, cada equipe da divisão aparece marcada "sugerida".
  const html = c.performanceEquipesHTML();
  assert.match(html.match(/<tr data-perf-id="R1">[\s\S]*?<\/tr>/)[0], /Leão<\/strong> <span class="perf-sugerida">sugerida<\/span>/);
  const linhaR2 = html.match(/<tr data-perf-id="R2">[\s\S]*?<\/tr>/)[0];
  assert.match(linhaR2, /Águia<\/strong> <small>[^<]+% da O\.S\.<\/small> <span class="perf-sugerida">sugerida<\/span>/);
  assert.match(linhaR2, /Leão<\/strong> <small>[^<]+% da O\.S\.<\/small> <span class="perf-sugerida">sugerida<\/span>/);
  // Registro de um servidor de antes da F11 (sem equipeSugerida) com divisão: não deduz pela composição.
  assert.equal(P.equipeDoRegistro({id:'v', confirmado:false, fonte:'alocacao-conferir-rh', membros:[{chave:'100001'}, {chave:'100002'}]}, EQUIPES), null);
  assert.equal(P.equipeDoRegistro({id:'v', confirmado:false, fonte:'sugestao', membros:[{chave:'100001'}, {chave:'100002'}]}, EQUIPES).id, 'eq-aguia');
});

/* ───────────── 3. equipe em 0%: o registro da v138 e o campo novo ───────────── */

test('revisão: divisão com duas equipes e uma em 0% não vira equipe única; a mudança do hash vem só do `grupos`', async () => {
  let a = D.montar([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003']}]);
  a = D.editar(a, {nivel:'equipes', grupo:1}, 0).alocacao;
  assert.equal(D.validar(a), '', 'divisão válida com a Leão em 0%');
  const regs = () => [row('Z1', {numero:'8201', equipe:['100001', '100002', '100003'], alocacao:{...plano(a), por:'Gestor', em:'2026-09-25T18:00:00Z'}, valorTotal:1000})];
  const srv = await apurar(await edge('pcp-sync', bancoCom(regs())));
  const [z1] = srv.registros;
  // Caso ruim de antes: equipeId 'eq-aguia' sem campo novo (o hash mudava calado).
  assert.equal(z1.confirmado, true);
  assert.equal(z1.equipeId, '', 'como na v138: a divisão não era de uma equipe só');
  assert.deepEqual(plano(z1.grupos.map(g => [g.equipeId, g.cota, g.membros, g.tamanho])), [['eq-aguia', 10000, ['100001', '100002'], 2]]);
  // No ranking a Águia leva a O.S. inteira (a Leão ficou em 0%), sem composição avulsa.
  assert.deepEqual(P.resumir([z1]).equipes.map(x => [x.chave, x.valor]), [['eq-aguia', 1000]]);
  // Com a v138 ao lado: o registro é o mesmo, tirando o campo novo.
  const antigo = git('supabase/functions/pcp-sync/index.ts');
  if (antigo) {
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-v138-rev-'));
    fs.mkdirSync(path.join(dir, 'fn'));fs.writeFileSync(path.join(dir, 'fn', 'index.ts'), antigo);
    const velho = await apurar(await edge(path.relative(path.join(RAIZ, 'supabase/functions'), path.join(dir, 'fn')), bancoCom(regs())));
    fs.rmSync(dir, {recursive:true, force:true});
    const {grupos: _g, ...semGrupos} = z1;
    assert.deepEqual(plano(semGrupos), plano(velho.registros[0]), 'sem o `grupos`, o registro é o da v138');
    assert.notEqual(srv.hash, velho.hash, 'mudança esperada: o hash muda pelo campo novo, e só nesse período');
  }
});

/* ───────────── 4. o centavo entre equipes é o do motor ───────────── */

test('revisão: o centavo que sobra entre as equipes vai para a mesma equipe que o motor escolhe', () => {
  // Caso ruim: cotas 5000/5000, R$0,01, e a Leão com três pessoas (uma em 0%).
  let a = D.montar([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003', '100005', '300004']}]);
  a = D.editar(a, {nivel:'equipes', grupo:0}, 5000).alocacao;
  a = D.editar(a, {nivel:'membros', grupo:1, pessoaId:'300004'}, 0).alocacao;
  assert.equal(D.validar(a), '');
  const noRanking = (al, valor) => {
    const fs_ = D.finais(al);
    const grupos = P.gruposApurados(al, fs_, [{id:'e0', nome:'E0'}, {id:'e1', nome:'E1'}, {id:'e2', nome:'E2'}, ...EQUIPES]);
    const membros = fs_.filter(f => f.cota > 0).map(f => ({chave:f.pessoaId, nome:f.pessoaId, percentual:f.cota / 100}));
    const r = {id:'C1', membros, valor, confirmado:true, ...(grupos.length > 1 ? {grupos} : {})};
    return Object.fromEntries(P.resumir([r]).equipes.map(x => [x.chave, Math.round(x.valor * 100)]));
  };
  const doMotor = (al, valor) => { const out = {}; for (const x of D.ratearCentavosLider(Math.round(valor * 100), al)) { const k = al.grupos[x.grupo].equipeId; out[k] = (out[k] || 0) + x.centavos; } return out; };
  assert.deepEqual(noRanking(a, 0.01), {'eq-aguia':0, 'eq-leao':1}, 'a Leão tem mais gente na divisão (quem está em 0% conta)');
  assert.deepEqual(noRanking(a, 0.01), doMotor(a, 0.01));
  // Casos gerados: duas ou três equipes, gente em 0%, valores quebrados. A equipe leva o que o motor dá.
  let s = 20260930;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const ids = ['100001', '100002', '100003', '100005', '300004', '300008', '100006', '100007', '100008'];
  for (let i = 0; i < 300; i++) {
    const nG = 2 + Math.floor(r() * 2), livres = [...ids];
    const grupos = Array.from({length:nG}, (_, g) => { const ms = livres.splice(0, 1 + Math.floor(r() * 3)); return {equipeId:'e' + g, liderId:ms[0], membros:ms}; });
    let al = D.montar(grupos);
    if (r() < 0.6) { const g = Math.floor(r() * nG), m = al.grupos[g].membros[al.grupos[g].membros.length - 1]; if (al.grupos[g].membros.length > 1) al = D.editar(al, {nivel:'membros', grupo:g, pessoaId:m.pessoaId}, 0).alocacao; }
    if (r() < 0.5) al = D.editar(al, {nivel:'equipes', grupo:Math.floor(r() * nG)}, Math.floor(r() * 10001)).alocacao;
    if (D.validar(al)) continue;
    const valor = [0.01, 0.02, 0.03, 1, 9.99, 1234.57, Math.round(r() * 100000) / 100][i % 7];
    const ranking = noRanking(al, valor), motor = Object.fromEntries(Object.entries(doMotor(al, valor)).filter(([, v]) => v));
    const comValor = Object.fromEntries(Object.entries(ranking).filter(([, v]) => v));
    assert.deepEqual(comValor, motor, 'caso ' + i + ' ' + JSON.stringify(al.grupos.map(g => [g.cota, g.membros.map(m => m.cota)])));
  }
});

/* ───────────── 5. o 409 do Fechar recarrega a apuração ───────────── */

test('revisão: o 409 do Fechar recarrega a apuração sozinho e pede para conferir e fechar de novo', async () => {
  const a = aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]);
  const e = await edge('pcp-sync', bancoCom([row('H1', {numero:'8301', equipe:['100001', '100002'], alocacao:{...a, por:'G', em:'2026-09-25T18:00:00Z'}, valorTotal:100})]));
  const antes = await apurar(e, true);
  const pedidos = [];
  const c = comBase(aparelho({api:apiDe(e, pedidos)}), antes);
  const {botoes, dialogo, enviar} = domDoFechar(c, 'Fechamento de setembro');
  botoes['#perf-fechar'].onclick();
  assert.equal(dialogo.aberto, true, 'o diálogo de conferência abriu');
  // Caso ruim: depois da consulta, o valor da O.S. mudou (ou a tela nova foi publicada): o hash da tela é velho.
  e.db.pcp_registros.find(x => x.id === 'H1').registro.valorTotal = 150;
  await enviar();
  const fechar = pedidos.find(p => p.action === 'performanceFechar');
  assert.equal(dialogo.aberto, false, 'o diálogo fecha');
  assert.ok(pedidos.some((p, i) => p.action === 'performancePeriodo' && i > pedidos.indexOf(fechar)), 'a apuração foi pedida de novo');
  const agora = vm.runInContext('perfRemoto.dados', c);
  assert.notEqual(agora.hash, antes.hash, 'a tela está com a apuração nova');
  assert.equal(agora.registros[0].valor, 150);
  assert.deepEqual(c.toasts.at(-1), ['Os dados mudaram desde a consulta. A apuração foi atualizada: confira e feche de novo.', 'error']);
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_fechamentos').length, 0, 'nada foi selado');
  assert.equal(fechar.leGrupos, true, 'a tela nova diz ao servidor que lê `grupos`');
  // A aba de uma versão anterior mostra a mensagem do servidor: ela diz onde está o botão.
  const r = await e.call({action:'performanceFechar', ...periodo, hash:antes.hash, requestId:'rev-409-000001', motivo:'Com o hash velho', anterior:''}, gestor);
  assert.equal(r.status, 409);
  assert.match(r.error, /Atualizar apuração/);
  // Com a apuração nova, fecha.
  const {botoes: b2, dialogo: d2, enviar: enviar2} = domDoFechar(c, 'Fechamento de setembro');
  b2['#perf-fechar'].onclick();await enviar2();
  assert.equal(d2.partes['#perf-fechar-erro'].textContent, '');
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_fechamentos').length, 1);
});

/* ───────────── 6. paridade de verdade: servidor e aparelho ───────────── */

test('revisão: equipe gravada com o slug de quem SAIU é sugerida igual no servidor e no aparelho', async () => {
  // A Leão foi salva pela aba v133 com o slug do Davi, que saiu depois. A O.S. dele não está confirmada.
  const equipes = [{id:'eq-leao', nome:'Leão', emblema:'🦁', membros:[{chave:'davi-f', nome:'Davi Fictício', apelido:'davi'}], ativo:true}];
  const o = row('L6', {numero:'7006', equipe:['300004'], valorTotal:300});
  const srv = await apurar(await edge('pcp-sync', bancoCom([o], cfgBase(equipes))));
  assert.equal(srv.registros[0].equipeSugerida.equipeId, 'eq-leao');
  const c = aparelho({cfg:cfgBase(equipes)});
  assert.equal(c.perfIdMembro({chave:'davi-f', nome:'Davi Fictício', apelido:'davi'}), '300004', 'o slug de quem saiu vira o ID pelos antigos do elenco');
  const local = c.perfRegistro(plano(o.registro), c.perfConfig());
  assert.deepEqual(plano(local.equipeSugerida), plano(srv.registros[0].equipeSugerida));
});

test('revisão: casos gerados passam pela apuração do servidor (perfFonte) e pela do aparelho (perfRegistro) e dão o mesmo', async () => {
  let s = 424242;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const um = xs => xs[Math.floor(r() * xs.length)];
  const IDS = ['100001', '100002', '100003', '100005', '300004', '300008'];
  const SLUG = {100001:'ana-f', 100002:'bia-f', 100003:'caio-f', 100005:'edu-f', 300004:'davi-f', 300008:'hugo-f'};
  const NOME = {100001:'Ana Fictícia', 100002:'Bia Fictícia', 100003:'Caio Fictício', 100005:'Edu Fictício', 300004:'Davi Fictício', 300008:'Hugo Fictício'};
  // O membro como a tela o grava (perfMarcados): pelo ID, pelo slug da ficha (aba v133) ou pelo nome antigo do PCP.
  const membro = id => { const x = r(); return x < 0.45 ? {chave:id, nome:NOME[id], apelido:NOME[id].split(' ')[0].toLowerCase()} : x < 0.85 ? {chave:SLUG[id], nome:NOME[id], apelido:NOME[id].split(' ')[0].toLowerCase()} : {chave:NOME[id].split(' ')[0], nome:NOME[id].split(' ')[0], apelido:NOME[id].split(' ')[0]}; };
  const gente = (min, max) => { const n = min + Math.floor(r() * (max - min + 1)); const xs = [...IDS].sort(() => r() - 0.5); return xs.slice(0, n); };
  const essencial = x => plano({confirmado:x.confirmado, fonte:x.fonte, membros:x.membros.map(m => [String(m.chave), m.percentual]), equipeId:x.equipeId || '',
    grupos:(x.grupos || []).map(g => [g.equipeId, g.cota, g.membros, g.tamanho]), sugerida:x.confirmado ? 'confirmada' : (x.equipeSugerida ? x.equipeSugerida.equipeId : null)});
  let comparados = 0, comSugestao = 0, comSlugDeQuemSaiu = 0, comGrupos = 0, divisaoSugerida = 0;
  for (let caso = 0; caso < 40; caso++) {
    const idsDe = new Map();
    const equipes = Array.from({length:1 + Math.floor(r() * 4)}, (_, k) => { const ids = gente(1, 3); idsDe.set('e' + k, ids); return {id:'e' + k, nome:'Equipe ' + k, emblema:'🐺', ativo:r() < 0.85, membros:ids.map(membro)}; });
    const participacoes = [], oss = [];
    for (let i = 0; i < 8; i++) {
      // Metade das O.S. com a gente exata de uma equipe do cadastro: é aí que a sugestão pela composição aparece.
      const id = 'G' + caso + '-' + i, eq = r() < 0.5 ? [...idsDe.get(um(equipes).id)] : gente(0, 3), tipo = r();
      const reg = {numero:String(9000 + caso * 10 + i), equipe:r() < 0.15 ? eq.map(x => NOME[x].split(' ')[0]) : [...eq], valorTotal:r() < 0.1 ? null : Math.round(r() * 100000) / 100};
      if (tipo < 0.45 && eq.length) {
        // Com divisão: uma, duas ou três equipes; às vezes alguém ou uma equipe em 0%; às vezes desatualizada ou esperando o RH.
        const nG = Math.min(eq.length, 1 + Math.floor(r() * 3)), pedacos = Array.from({length:nG}, () => []);
        eq.forEach((p, j) => pedacos[j % nG].push(p));
        let al = D.montar(pedacos.map(ms => ({equipeId:r() < 0.8 ? um([...equipes.map(q => q.id), 'eq-fora']) : null, liderId:ms[0], membros:ms})));
        if (nG > 1 && r() < 0.3) al = D.editar(al, {nivel:'equipes', grupo:nG - 1}, 0).alocacao;
        if (D.validar(al)) continue;
        const x = r();
        reg.alocacao = {...plano(al), por:'Gestor', em:'2026-09-25T18:00:00Z', ...(x < 0.2 ? {desatualizada:true} : x < 0.35 ? {conferirRH:true} : {})};
        if (r() < 0.2) reg.equipe = eq.slice(1);
      } else if (tipo < 0.7 && eq.length) {
        // Participação antiga do blob, com chaves pelo ID ou pelo slug.
        const ps = eq.map((p, j) => ({chave:r() < 0.7 ? p : SLUG[p], nome:NOME[p], percentual:(Math.floor(10000 / eq.length) + (j < 10000 % eq.length ? 1 : 0)) / 100}));
        participacoes.push({id, numero:reg.numero, membros:ps, por:'Gestor', em:'2026-09-26T10:00:00.000Z', ...(r() < 0.5 ? {equipeId:um(equipes).id, equipeNome:'x', emblema:'🐺'} : {})});
      }
      oss.push(row(id, reg));
    }
    const cfg = cfgBase(equipes, participacoes);
    const srv = await apurar(await edge('pcp-sync', bancoCom(oss, cfg)));
    const c = aparelho({cfg});
    for (const o of oss) {
      const s_ = porId(srv.registros, o.id), local = c.perfRegistro(plano(o.registro), c.perfConfig());
      assert.deepEqual(essencial(local), essencial(s_), 'caso ' + caso + ' O.S. ' + o.id + ' ' + JSON.stringify({equipe:o.registro.equipe, alocacao:o.registro.alocacao && o.registro.alocacao.grupos.map(g => [g.equipeId, g.cota]), equipes:equipes.map(q => [q.id, q.ativo, q.membros.map(m => m.chave)])}));
      // E a tela lendo o registro do servidor põe a entrega nas mesmas linhas do ranking que a conta local.
      const vis = x => plano(P.chavesDeEquipe(P.comEquipes([x], equipes, {resolver:c.perfIdMembro})[0]));
      assert.deepEqual(vis(c.perfRegistro({id:o.id, _perf:s_}, c.perfConfig())), vis(local), 'ranking ' + o.id);
      comparados++;
      if (!s_.confirmado && s_.equipeSugerida) comSugestao++;
      if (s_.grupos) comGrupos++;
      if (!s_.confirmado && /^alocacao-/.test(s_.fonte) && (s_.equipeSugerida || s_.grupos)) divisaoSugerida++;
      const sugerida = !s_.confirmado && s_.equipeSugerida ? equipes.find(q => q.id === s_.equipeSugerida.equipeId) : null;
      if (sugerida && sugerida.membros.some(m => m.chave === 'davi-f' || m.chave === 'hugo-f')) comSlugDeQuemSaiu++;
    }
  }
  // Os casos têm de exercitar o que importa, senão a paridade é de mentira.
  assert.ok(comparados >= 200, 'comparados ' + comparados);
  assert.ok(comSugestao >= 15, 'com sugestão ' + comSugestao);
  assert.ok(comGrupos >= 10, 'com grupos ' + comGrupos);
  assert.ok(divisaoSugerida >= 10, 'sugestão pela equipe da divisão ' + divisaoSugerida);
  assert.ok(comSlugDeQuemSaiu >= 5, 'sugestão que depende do slug de quem saiu ' + comSlugDeQuemSaiu);
});

/* ───────────── 7. a aba presa na v138 não fecha período com `grupos` ───────────── */

test('revisão: período com O.S. de duas equipes só fecha pela tela que lê `grupos`; a aba antiga recebe 422 com a causa, fora da fila', async () => {
  const duasD = aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003']}]);
  const regs = [row('A2', {numero:'5002', equipe:['100001', '100002', '100003'], alocacao:{...duasD, por:'Gestor', em:'2026-09-25T18:00:00Z'}, valorTotal:1000})];
  const e = await edge('pcp-sync', bancoCom(regs));
  const fonte = await apurar(e);
  assert.ok(fonte.registros[0].grupos);
  // Caso ruim: o pedido sem a marca (o da aba v138) fechava e selava números que ela não mostrou.
  const sem = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'rev-grupos-0001', motivo:'Aba antiga', anterior:''}, gestor);
  assert.equal(sem.status, 422);
  assert.equal(sem.error, 'Recarregue a página para fechar: este período tem O.S. dividida entre duas equipes e esta tela é de uma versão anterior.');
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_fechamentos').length, 0);
  // A aba v138 de verdade (histórico do git): o 422 aparece no diálogo e a fila não é tocada.
  const antigo = git('performance.js');
  if (antigo) {
    const pedidos = [], fila = [];
    const c = comBase(aparelho({src:antigo, api:apiDe(e, pedidos), fila}), fonte);
    const {botoes, dialogo, enviar} = domDoFechar(c, 'Fechamento pela aba antiga');
    botoes['#perf-fechar'].onclick();await enviar();
    assert.equal(dialogo.partes['#perf-fechar-erro'].textContent, sem.error, 'a aba antiga mostra a causa');
    assert.equal(dialogo.aberto, true);
    assert.deepEqual(fila, [], 'o Fechar vai direto ao servidor: nada entra na fila');
    assert.equal(pedidos.filter(p => p.action === 'performanceFechar').length, 1);
  }
  // A tela nova manda leGrupos:true e fecha.
  const pedidos = [];
  const c = comBase(aparelho({api:apiDe(e, pedidos)}), await apurar(e, true));
  const {botoes, enviar} = domDoFechar(c, 'Fechamento pela tela nova');
  botoes['#perf-fechar'].onclick();await enviar();
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_fechamentos').length, 1, JSON.stringify(c.toasts));
  // Período sem `grupos` continua fechando sem a marca (a aba v138 fecha como antes).
  const e1 = await edge('pcp-sync', bancoCom([row('A1', {numero:'5001', equipe:['100001', '100002'], alocacao:{...aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]), por:'Gestor', em:'2026-09-25T18:00:00Z'}, valorTotal:500})]));
  const f1 = await apurar(e1);
  const ok = await e1.call({action:'performanceFechar', ...periodo, hash:f1.hash, requestId:'rev-grupos-0002', motivo:'Aba antiga', anterior:''}, gestor);
  assert.equal(ok.ok, true, JSON.stringify(ok));
});

/* ───────────── as abas presas na v137 e na v138 leem a apuração nova ───────────── */

test('revisão: as abas presas na v137 e na v138 leem a apuração nova (equipe da divisão, `grupos` sugeridos, equipe em 0%) sem quebrar', async t => {
  const versoes = [['v137', 'fc82f6f'], ['v138', 'c6ca608']];
  const lerDe = commit => arquivo => { try { return execFileSync('git', ['-C', RAIZ, 'show', commit + ':' + arquivo], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch (e) { return ''; } };
  if (!lerDe('c6ca608')('performance.js')) { t.skip('sem o histórico do git (clone raso)'); return; }
  let zero = D.montar([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003']}]);
  zero = D.editar(zero, {nivel:'equipes', grupo:1}, 0).alocacao;
  const duasD = aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}, {equipeId:'eq-leao', liderId:'100003', membros:['100003']}]);
  const regs = [
    row('V1', {numero:'8501', equipe:['100001', '100002'], alocacao:{...aloc([{equipeId:'eq-leao', liderId:'100001', membros:['100001', '100002']}]), conferirRH:true}, valorTotal:100}),
    row('V2', {numero:'8502', equipe:['100001', '100003'], alocacao:{...duasD, desatualizada:true}, valorTotal:200}),
    row('V3', {numero:'8503', equipe:['100001', '100002', '100003'], alocacao:{...plano(zero), por:'G', em:'2026-09-25T18:00:00Z'}, valorTotal:300}),
    row('V4', {numero:'8504', equipe:['100001', '100002', '100003'], alocacao:{...duasD, por:'G', em:'2026-09-25T18:00:00Z'}, valorTotal:400}),
    row('V5', {numero:'8505', equipe:[], alocacao:{...aloc([{equipeId:'eq-aguia', liderId:'100001', membros:['100001', '100002']}]), desatualizada:true}, valorTotal:500}),
    row('V6', {numero:'8506', equipe:['100001', '100002'], valorTotal:600}),
  ];
  const srv = await apurar(await edge('pcp-sync', bancoCom(regs)));
  assert.ok(porId(srv.registros, 'V2').grupos && !porId(srv.registros, 'V2').confirmado, 'há `grupos` numa entrega não confirmada');
  for (const [nome, commit] of versoes) {
    const ler = lerDe(commit);
    const c = comBase(aparelho({ler, src:ler('performance.js')}), srv);
    for (const modo of ['pessoas', 'equipes']) for (const medida of ['nota', 'valor', 'entregas']) {
      c.STATE._perfModo = modo;c.STATE._perfPessoaMedida = medida === 'entregas' ? 'peso' : medida;c.STATE._perfRankMedida = medida === 'nota' ? 'entregas' : medida;
      assert.doesNotThrow(() => c.performanceEquipesHTML(), nome + ' ' + modo + ' ' + medida);
    }
    assert.doesNotThrow(() => c.performanceRelatorioHTML(), nome + ' relatório');
    assert.match(c.perfFechamentoBloqueio(srv, 0), /entregas sem participação confirmada/, nome + ': as não confirmadas travam o Fechar como antes');
  }
});
