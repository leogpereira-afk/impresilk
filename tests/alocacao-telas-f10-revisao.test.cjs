/* F10, REVISÃO (30/09/2026): os defeitos que as duas revisões adversariais
   acharam na alocação da ficha, da Agenda e do Lançar entrega. Cada teste
   começa pelo caso ruim, reproduzido a partir da prova da revisão.
   PCP_BASELINE aponta para outra cópia do código (a de antes do conserto),
   para provar que o teste falha lá. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = process.env.PCP_BASELINE || path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-05';

const ELENCO = {pessoas: [
  {chave: 'adriano-f', id: '100001', nome: 'Adriano Fictício Souza', apelido: 'adriano', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
  {chave: 'eva-f', id: '100005', nome: 'Eva Fictícia', apelido: 'eva', area: 'Montagem', ativo: true},
], antigos: [], ferias: [], ausencias: [], fichaRH: true};
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001'}, {chave: '100002'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', liderPadraoId: '100005', membros: [{chave: '100005'}, {chave: '100003'}], ativo: true},
];
const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const osBase = (extra = {}) => ({id: 'o1', numero: '8001', tipo: 'externo', cliente: 'Cliente Fictício', liberadoPCP: true, equipe: [],
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, veiculo: '', valorTotal: 5000, rev: 1, itens: [], ...extra});
const DataFixa = class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } };

/* A tela da gestão sem a ficha (a do tests/alocacao-telas-f10.test.cjs):
   operacao, divisao, regras, performance, o componente, o casa.js e o seletor
   de pessoas do app.js. STORE de mentira que conta o que grava. */
function tela({lista = [], papel = 'pcp', elenco = ELENCO, cfg: cfgX} = {}) {
  const cfg = cfgX || {instaladores: ['Adriano'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const salvos = [], toasts = [];
  const STORE = {getCFG: () => cfg, saveCFG() {}, getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => elenco, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null, valores: () => ({}),
    pullPhoto: async () => null, uuid: () => 'u1'};
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste'}}, console, setTimeout, clearTimeout, navigator: {onLine: true}, Date: DataFixa,
    esc: escH, toast: (m, t) => toasts.push([m, t]), confirm: () => true,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    document: {getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, body: {appendChild() {}, classList: {add() {}, remove() {}, contains: () => false}}},
    emptyState: () => '', bindCardClicks() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    hojeISO: () => HOJE, nowISO: () => HOJE + 'T12:00:00Z', renderEntregas() {}, voltaEquipeHTML: () => '', VOLTA_ROTULO: {},
    registrarRemarcacao() {}, perguntarRetrabalho: (o, cb) => cb()};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js', 'casa.js']) vm.runInContext(ler(f), c, {filename: f});
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename: 'app.js (seletor)'});
  return {c, A: vm.runInContext('ALOCUI', c), run: code => vm.runInContext(code, c), cfg, salvos, toasts, lista};
}

/* O formulário "+ Adicionar O.S ao dia" num DOM falso. Cada chamada é uma
   PINTURA NOVA (o innerHTML da Agenda refeito): campos com o valor padrão do
   HTML, dentro de um <details> que abre e fecha. */
function formAgenda(t, dia = HOJE) {
  const host = {innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const campo = v => ({value: v, padrao: v, ouvintes: [], addEventListener(tipo, fn) { this.ouvintes.push([tipo, fn]); },
    mudar(nv) { this.value = nv; for (const [tp, fn] of this.ouvintes) if (tp === 'input' || tp === 'change') fn(); }});
  const sel = campo('');
  sel.options = t.lista.map(o => ({value: o.id}));
  const campos = {periodo: campo('Manhã'), hora: campo(''), dias: campo('1'), veiculo: campo('')};
  campos.veiculo.options = ['', 'Carro 1', 'Carro 2', 'Carro 3'].map(v => ({value: v, textContent: v || 'sem veículo', dataset: {}}));
  const aoAlternar = [];
  const caixa = {open: true, addEventListener(tipo, fn) { if (tipo === 'toggle') aoAlternar.push(fn); }, fechar() { this.open = false; aoAlternar.forEach(fn => fn()); }};
  const nomeDe = q => (/name="(\w+)"/.exec(q) || [])[1];
  const form = {querySelector: q => q === '[data-aloc-host]' ? host : q === '[name="osId"]' ? sel : nomeDe(q) ? campos[nomeDe(q)] || null : null,
    querySelectorAll: () => [], closest: q => (q === 'details' ? caixa : null),
    reset() { for (const x of [sel, ...Object.values(campos)]) x.value = x.padrao; }};
  t.c.document.getElementById = id => (id === 'ag-add' ? form : null);
  t.c.FormData = class { get(k) { return k === 'osId' ? sel.value : campos[k] ? campos[k].value : ''; } getAll() { return []; } };
  let gravou = 0;
  t.run('(el, cb) => wireAddOSCasa(el, "ag-add", "' + dia + '", cb)')({querySelectorAll: () => []}, () => { gravou++; });
  return {host, sel, campos, caixa, submeter: () => { form.onsubmit({preventDefault() {}}); return gravou; }};
}

/* A FICHA DA O.S. DE VERDADE: o app.js inteiro, com renderModal, o campo
   Equipe (componente só pessoas) e o bloco 5 (Divisão da equipe). O DOM falso
   refaz os elementos a cada pintura do modal, como o navegador. `aoSincronizar`
   faz o papel do servidor dentro do trySync. */
function ficha({papel = 'admin', lista = [], aoSincronizar} = {}) {
  let html = '', blocos = [], els = new Map();
  const classes = () => { const s = new Set(); return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, contains: c => s.has(c)}; };
  const tag = id => (new RegExp('<[^>]*\\sid="' + id + '"[^>]*>').exec(html) || [''])[0];
  const el = id => {
    if (!els.has(id)) { const t0 = tag(id); els.set(id, {id, innerHTML: '', textContent: '', hidden: /\shidden[\s>]/.test(t0), disabled: /\sdisabled[\s>]/.test(t0),
      classList: classes(), querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, focus() {}}); }
    return els.get(id);
  };
  const modal = {get innerHTML() { return html; },
    set innerHTML(v) { html = v; els = new Map(); blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false})); },
    classList: classes(), querySelector: () => null, querySelectorAll: () => []};
  const overlay = {classList: classes()};
  const doc = {querySelector: s => (s === '#modal-os' ? modal : s === '#modal-overlay' ? overlay : null), querySelectorAll: s => (s === '#modal-os .card-fs' ? blocos : []),
    getElementById: id => (html.includes(`id="${id}"`) ? el(id) : null), addEventListener() {}, activeElement: null,
    body: {contains: () => false, classList: classes(), appendChild() {}}, visibilityState: 'visible'};
  const salvos = [], toasts = [], ouvintes = {};
  const cfg = {instaladores: ['Adriano'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const emitir = (ev, d) => (ouvintes[ev] || []).forEach(fn => fn(d));
  const STORE = {getAllOS: () => lista, getCFG: () => cfg, getOS: id => lista.find(o => o.id === id) || null, elenco: () => ELENCO,
    saveOS(o) { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    getQueue: () => [], trySync: async () => { if (aoSincronizar) await aoSincronizar({lista, salvos, emitir}); },
    on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); }, onConflict() {}, uuid: () => 'u1', valores: () => ({}), regrasLocais: () => null, carimbarMomento() {}};
  const ctx = vm.createContext({console, Date: DataFixa, document: doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, STORE, setTimeout() {}, clearTimeout() {}, setInterval() {}, __toasts: toasts});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user={nome:'Gestor Teste',papel:'${papel}'}; bindModalEvents=()=>{}; ligarHistoricoAlteracoes=()=>{}; renderActiveTab=()=>{}; toast=(m,t)=>__toasts.push([m,t||'']);`, ctx);
  const run = code => vm.runInContext(code, ctx);
  // Um toque num botão do componente (a delegação lê data-aloc-acao do alvo).
  const clicar = (hostId, dataset) => doc.getElementById(hostId).onclick({target: {closest: () => ({dataset, disabled: false})}});
  return {run, el: id => doc.getElementById(id), clicar, salvos, toasts, lista};
}

/* ───────────── 1. Agenda: a repintura repõe o formulário inteiro ───────────── */

test('revisão: a repintura da Agenda repõe período, hora, duração e veículo junto com a O.S. e a equipe, e os ocupados são os do período reposto', () => {
  const outra = osBase({id: 'o2', numero: '8002', equipe: ['100002'], veiculo: 'Carro 3', instalacao: {data: HOJE, periodo: 'Tarde', duracaoDias: 1}});
  const os = osBase({instalacao: {}, veiculo: 'Carro 1'});
  const t = tela({papel: 'pcp', lista: [os, outra]});
  const f1 = formAgenda(t);
  f1.sel.mudar('o1');
  f1.campos.periodo.mudar('Tarde');
  f1.campos.dias.mudar('2');
  f1.campos.veiculo.mudar('Carro 2');
  assert.equal(t.A.executar('agenda:ag-add', {alocAcao: 'equipe', e: 'eq-aguia'}), '');
  // Caso ruim: o pull repinta a Agenda e o formulário voltava em Manhã, 1 dia, sem veículo, com a O.S. e a equipe.
  const f2 = formAgenda(t);
  assert.equal(f2.sel.value, 'o1', 'a O.S. volta');
  assert.equal(f2.campos.periodo.value, 'Tarde', 'o período volta');
  assert.equal(f2.campos.dias.value, '2', 'a duração volta');
  assert.equal(f2.campos.veiculo.value, 'Carro 2', 'o veículo volta');
  const st = t.A.estado('agenda:ag-add');
  assert.equal(st.aloc.grupos[0].equipeId, 'eq-aguia', 'a equipe montada volta');
  assert.ok(st.ocupados.has('100002'), 'a Bia está na 8002 à tarde: os ocupados são os do período reposto');
  assert.equal(f2.campos.veiculo.options[3].textContent, 'Carro 3 · ocupado na O.S. 8002', 'e o carro também');
  // O que foi mexido depois da repintura também fica guardado.
  f2.campos.hora.mudar('13:30');
  const f3 = formAgenda(t);
  assert.equal(f3.campos.hora.value, '13:30');
  assert.equal(f3.submeter(), 1);
  const g = t.salvos[0];
  assert.equal(g.instalacao.periodo, 'Tarde');
  assert.equal(g.instalacao.hora, '13:30');
  assert.equal(g.instalacao.duracaoDias, 2);
  assert.equal(g.veiculo, 'Carro 2');
  assert.equal(g.alocacao.grupos[0].equipeId, 'eq-aguia');
  // Programou: a escolha acabou.
  const f4 = formAgenda(t);
  assert.equal(f4.sel.value, '');
  assert.equal(f4.campos.periodo.value, 'Manhã');
});

test('revisão: fechar o formulário da Agenda sem programar desiste da O.S., da equipe e dos campos', () => {
  const t = tela({papel: 'pcp', lista: [osBase({instalacao: {}})]});
  const f1 = formAgenda(t);
  f1.sel.mudar('o1');
  f1.campos.periodo.mudar('Tarde');
  t.A.executar('agenda:ag-add', {alocAcao: 'equipe', e: 'eq-leao'});
  // Caso ruim: a escolha sobrevivia ao fechar e voltava na próxima pintura, com a equipe montada.
  f1.caixa.fechar();
  assert.equal(t.A.estado('agenda:ag-add'), null, 'a montagem acabou');
  assert.equal(f1.sel.value, '', 'o formulário fechado volta ao começo');
  assert.equal(f1.campos.periodo.value, 'Manhã');
  const f2 = formAgenda(t);
  assert.equal(f2.sel.value, '', 'a repintura não traz a O.S. de volta');
  assert.equal(f2.campos.periodo.value, 'Manhã');
  assert.equal(t.A.estado('agenda:ag-add'), null);
  f2.submeter();
  assert.equal(t.salvos.length, 0, 'nada é programado');
  // Escolher de novo começa da O.S., sem a equipe de antes.
  f2.sel.mudar('o1');
  assert.equal(t.A.estado('agenda:ag-add').tocado, false);
  assert.deepEqual(js(t.A.paraEquipe('agenda:ag-add').equipe), []);
});

/* ───────────── 2. Ficha: "Trazer equipe" no campo Equipe e fechar ───────────── */

test('revisão: na ficha, "Trazer equipe" no campo Equipe grava o equipeId ao fechar, numa gravação só', () => {
  const t = ficha({papel: 'admin', lista: [osBase({id: 'f1', equipe: []})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  t.clicar('ficha-equipe', {alocAcao: 'equipe', e: 'eq-leao'});
  const n0 = t.salvos.length;
  assert.deepEqual(t.salvos.at(-1).equipe, ['100005', '100003'], 'o campo Equipe grava as pessoas, como sempre');
  assert.equal(t.salvos.at(-1).alocacao ?? null, null, 'o toque não grava a divisão (o histórico dela tem teto)');
  assert.equal(t.run(`ALOCUI.estado('ficha-div:f1').aloc.grupos[0].equipeId`), 'eq-leao', 'o bloco 5 mostra a Leão');
  // Caso ruim: fechar deixava alocacao null, e a equipe escolhida se perdia calada.
  t.run('closeModal()');
  assert.equal(t.salvos.length, n0 + 1, 'fechar grava uma vez');
  const g = t.salvos.at(-1);
  assert.equal(g.alocacao.grupos.length, 1);
  assert.equal(g.alocacao.grupos[0].equipeId, 'eq-leao');
  assert.equal(g.alocacao.grupos[0].liderId, '100005');
  assert.deepEqual(g.alocacao.grupos[0].membros.map(m => [m.pessoaId, m.papel]), [['100005', 'lider'], ['100003', 'ajudante']]);
  assert.deepEqual(g.equipe, ['100005', '100003']);
  assert.equal(t.run('ALOCUI.estado("ficha-div:f1")'), null, 'e a ficha esquece a montagem');
});

test('revisão: fechar a ficha não grava divisão que ninguém trouxe, nem a mexida à mão sem Confirmar (e diz)', () => {
  // A O.S. com a composição da Águia, aberta e fechada: a sugestão que ninguém conferiu não vira divisão.
  const a = ficha({papel: 'pcp', lista: [osBase({id: 'f1', equipe: ['100001', '100002']})]});
  a.run(`openModal(STORE.getOS('f1')); closeModal();`);
  assert.equal(a.salvos.length, 0);
  // Tirar alguém não é trazer equipe.
  const b = ficha({papel: 'pcp', lista: [osBase({id: 'f1', equipe: ['100001', '100002']})]});
  b.run(`openModal(STORE.getOS('f1'))`);
  b.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'});
  b.run('closeModal()');
  assert.ok(b.salvos.length >= 1);
  assert.equal(b.salvos.at(-1).alocacao ?? null, null);
  // Trouxe a Leão, mas mexeu na divisão à mão e não confirmou: não grava, e o aviso diz.
  const c = ficha({papel: 'admin', lista: [osBase({id: 'f1', equipe: []})]});
  c.run(`openModal(STORE.getOS('f1'))`);
  c.clicar('ficha-equipe', {alocAcao: 'equipe', e: 'eq-leao'});
  assert.equal(c.run(`ALOCUI.executar('ficha-div:f1', {alocAcao: 'lider', g: '0', p: '100003'})`), '');
  c.run('closeModal()');
  assert.equal(c.salvos.at(-1).alocacao ?? null, null);
  assert.ok(c.toasts.some(([m, tp]) => /divisão mexida na etapa Divisão não foi confirmada e não foi gravada/.test(m) && tp === 'error'), JSON.stringify(c.toasts));
  assert.doesNotMatch(c.toasts.map(([m]) => m).join(' '), /—/, 'sem travessão no texto');
  // A operação não divide: a equipe vai, a divisão não.
  const d = ficha({papel: 'operacao', lista: [osBase({id: 'f1', equipe: []})]});
  d.run(`openModal(STORE.getOS('f1'))`);
  d.clicar('ficha-equipe', {alocAcao: 'equipe', e: 'eq-leao'});
  d.run('closeModal()');
  assert.deepEqual(d.salvos.at(-1).equipe, ['100005', '100003']);
  assert.equal(d.salvos.at(-1).alocacao ?? null, null);
});

test('revisão: trazer outra equipe na ficha e fechar mantém o ajuste confirmado da equipe que ninguém mexeu, igual à Agenda', () => {
  // A Leão confirmada à mão em 55/45, com o cadeado no Caio.
  const alocacao = {grupos: [{equipeId: 'eq-leao', cota: 10000, liderId: '100005', membros: [
    {pessoaId: '100005', papel: 'lider', cota: 5500}, {pessoaId: '100003', papel: 'ajudante', cota: 4500, fixo: true}]}], manual: true, em: '2026-10-04T10:00:00Z', por: 'Gestor'};
  const osCom = D => { const a = js(alocacao); a.final = js(D.finais(a)); return osBase({id: 'f1', equipe: ['100005', '100003'], instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, alocacao: a, rev: 2}); };
  const resumo = a => a.grupos.map(g => ({equipeId: g.equipeId, cota: g.cota, liderId: g.liderId, fixo: g.fixo === true,
    membros: g.membros.map(m => [m.pessoaId, m.papel, m.cota, m.fixo === true])}));
  // Ficha: "Trazer equipe" Águia no campo Equipe e fechar.
  const lista = [];
  const t = ficha({papel: 'admin', lista});
  lista.push(osCom(t.run('DIVISAO')));
  t.run(`openModal(STORE.getOS('f1'))`);
  t.clicar('ficha-equipe', {alocAcao: 'equipe', e: 'eq-aguia'});
  t.run('closeModal()');
  const naFicha = t.salvos.at(-1).alocacao;
  // Caso ruim: a Leão voltava ao padrão (60/40, sem cadeado), calada.
  assert.deepEqual(resumo(naFicha)[0].membros, [['100005', 'lider', 5500, false], ['100003', 'ajudante', 4500, true]], 'a Leão mantém 55/45 e o cadeado');
  assert.deepEqual(resumo(naFicha)[1].membros, [['100001', 'lider', 6000, false], ['100002', 'ajudante', 4000, false]], 'só a Águia entra pelo padrão');
  assert.deepEqual(naFicha.grupos.map(g => g.cota), [5000, 5000], 'a parte entre as equipes é redistribuída pela regra (2 + 2 pessoas)');
  assert.equal(naFicha.em, '2026-10-04T10:00:00Z', 'devolve o carimbo da divisão gravada');
  // Agenda: o mesmo gesto sobre a mesma O.S.
  const ag = tela({papel: 'admin', lista: []});
  ag.lista.push(osCom(ag.run('DIVISAO')));
  const f = formAgenda(ag);
  f.sel.mudar('f1');
  assert.equal(ag.A.executar('agenda:ag-add', {alocAcao: 'equipe', e: 'eq-aguia'}), '');
  f.submeter();
  const naAgenda = ag.salvos.at(-1).alocacao;
  assert.deepEqual(resumo(naFicha), resumo(naAgenda), 'a ficha grava o mesmo que a Agenda');
  assert.equal(naFicha.manual, naAgenda.manual);
});

/* ───────────── 3. Ficha: depois do descarte, a divisão do servidor ───────────── */

test('revisão: na ficha, depois do descarte do servidor, o bloco 5 mostra a divisão do servidor, não a recusada', async () => {
  const lista = [];
  let servidor = null;
  const t = ficha({papel: 'pcp', lista, aoSincronizar: ({lista: l, salvos, emitir}) => {
    // O servidor descarta a divisão e o store repõe a versão dele.
    const enviado = salvos.at(-1);
    l[l.findIndex(o => o.id === 'f1')] = js(servidor);
    emitir('os-gravada', {id: 'f1', os: js(servidor), enviado, descartado: ['alocacao'], motivo: {alocacao: 'Motivo fictício.'}});
  }});
  const alocacao = {grupos: [{equipeId: 'eq-aguia', cota: 10000, liderId: '100001', membros: [
    {pessoaId: '100001', papel: 'lider', cota: 6000}, {pessoaId: '100002', papel: 'ajudante', cota: 4000}]}], manual: false, em: '2026-10-05T10:00:00Z', por: 'Gestor'};
  alocacao.final = js(t.run(`DIVISAO.finais(${JSON.stringify(alocacao)})`));
  servidor = osBase({id: 'f1', equipe: ['100001', '100002'], alocacao, rev: 3});
  lista.push(js(servidor));
  t.run(`openModal(STORE.getOS('f1'))`);
  assert.equal(t.run(`ALOCUI.estado('ficha-div:f1').origem`), 'gravada');
  assert.equal(t.run(`ALOCUI.executar('ficha-div:f1', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'})`), '');
  await t.el('ficha-div-ok').onclick();
  assert.match(t.el('ficha-div-status').textContent, /O servidor não gravou a divisão: Motivo fictício\. Este aparelho voltou à divisão que está no servidor\./);
  // Caso ruim: a mensagem dizia "voltou à divisão do servidor", e o bloco seguia com os 70/30 recusados.
  const cotas = js(t.run(`ALOCUI.estado('ficha-div:f1').aloc.grupos[0].membros.map(m => [m.pessoaId, m.cota])`));
  assert.deepEqual(cotas, [['100001', 6000], ['100002', 4000]], 'o bloco mostra a divisão do servidor');
  assert.equal(t.run(`ALOCUI.mudou('ficha-div:f1')`), false, 'nada pendente para reenviar a mesma recusa');
  assert.deepEqual(js(t.run('_modalDraft.alocacao.grupos[0].membros.map(m => m.cota)')), [6000, 4000]);
  assert.equal(t.el('ficha-div-recomecar').hidden, true, 'não há o que recomeçar: já está na do servidor');
});

/* ───────────── 4. Confirmar divisão: um envio, sem ficar "pendente" à toa ───────────── */

test('revisão: na ficha, Confirmar divisão com o rascunho sujo grava uma vez só, com o digitado e a divisão juntos', async () => {
  const t = ficha({papel: 'pcp', lista: [osBase({id: 'f1', equipe: ['100005', '100003']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  assert.equal(t.run(`ALOCUI.bloqueio('ficha-div:f1')`), '', 'a divisão sugerida da Leão fecha');
  t.run(`_modalDraft.obsAgenda = 'digitado agora'; markDirty();`);
  const n0 = t.salvos.length;
  // Caso ruim: gravava o rascunho antes e de novo no Confirmar (dois envios; o segundo esperava o próximo ciclo).
  await t.el('ficha-div-ok').onclick();
  assert.equal(t.salvos.length - n0, 1, 'uma confirmação = uma gravação');
  const g = t.salvos.at(-1);
  assert.equal(g.obsAgenda, 'digitado agora', 'o digitado vai junto');
  assert.equal(g.alocacao.grupos[0].equipeId, 'eq-leao');
});

/* O store.js DE VERDADE, com um servidor falso que responde em 80 ms: o
   caminho do "O servidor ainda não respondeu" da prova da revisão. */
async function confirmarComStoreReal(comEnvioEmVoo) {
  const os0 = {id: 'o1', numero: '8001', tipo: 'externo', equipe: ['100001', '100002'], instalacao: {data: HOJE, periodo: 'Manhã'}, rev: 3, atualizadoEm: '2026-10-05T10:00:00Z'};
  const ls = new Map([['impresilk_inst_os', JSON.stringify([os0])], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  let rev = 3;
  const enviados = [];
  const c = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    document: {addEventListener() {}, visibilityState: 'visible'},
    localStorage: {getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout, clearTimeout, AbortController, API_BASE: 'http://teste', queueMicrotask,
    fetch: async (_u, req) => {
      const body = JSON.parse(req.body);
      await new Promise(r => setTimeout(r, 80));
      if (body.action !== 'upsert') return {ok: true, status: 200, json: async () => ({ok: true})};
      enviados.push(!!body.os.alocacao);
      rev++;
      const os = {...js(body.os), rev};
      if (os.alocacao) os.alocacao = {...os.alocacao, em: 'srv-' + rev};
      return {ok: true, status: 200, json: async () => ({ok: true, os})};
    }});
  vm.runInContext(ler('store.js'), c, {filename: 'store.js'});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), c, {filename: f});
  const S = vm.runInContext('STORE', c), A = vm.runInContext('ALOCUI', c);
  S.elenco = () => ({pessoas: [{chave: 'a', id: '100001', nome: 'Adriano', ativo: true}, {chave: 'b', id: '100002', nome: 'Bia', ativo: true}], antigos: []});
  const rascunho = js(S.getOS('o1'));
  A.iniciar('ficha-div:o1', {os: rascunho, equipes: [], papel: 'pcp', modo: 'divisao', semAntigo: true, seguirEquipe: true});
  A.executar('ficha-div:o1', {alocAcao: 'lider', g: '0', p: '100001'});
  A.executar('ficha-div:o1', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'});
  const salvar = () => { rascunho.atualizadoEm = new Date().toISOString(); S.saveOS(rascunho); };
  // Outra gravação desta O.S. logo antes (o campo Equipe, o texto digitado): o envio dela está em voo.
  if (comEnvioEmVoo) { rascunho.obsAgenda = 'digitado agora'; salvar(); }
  await new Promise(r => setTimeout(r, 2));
  const r = await A.gravarNaOS('ficha-div:o1', {store: S, usuario: 'Gestor Teste', alvo: () => rascunho, salvar, prazoMs: 1500});
  await new Promise(r2 => setTimeout(r2, 200));
  return {estado: r.estado, mensagem: r.mensagem, enviados, naFila: S.getQueue().filter(x => x.action === 'upsert').length};
}

test('revisão: Confirmar com outro envio da O.S. em voo não fica "pendente" até o próximo ciclo: a divisão vai assim que ele acaba', async () => {
  // Caso ruim: o trySync voltava na hora (envio em voo), e a divisão ficava na fila 30 s, com "O servidor ainda não respondeu".
  const r = await confirmarComStoreReal(true);
  assert.equal(r.estado, 'gravada', r.mensagem);
  assert.deepEqual(r.enviados, [false, true], 'o primeiro envio (sem a divisão) e logo depois o da divisão');
  assert.equal(r.naFila, 0);
  // Sem envio em voo: um envio só (o reenvio não martela o servidor).
  const s = await confirmarComStoreReal(false);
  assert.equal(s.estado, 'gravada', s.mensagem);
  assert.deepEqual(s.enviados, [true]);
  assert.equal(s.naFila, 0);
});

/* ───────────── servidor 1. Pessoa travada oferecida livre pelo nome ───────────── */

test('revisão: nome da lista de instaladores que é de cadastro travado (ID repetido, contrato sem CPF) não entra livre pelo nome', () => {
  const elenco = js(ELENCO);
  elenco.pessoas.push({chave: 'rita-f', id: '100009', nome: 'Rita Fictícia', apelido: 'rita', area: 'Montagem', ativo: true, idRepetido: true});
  elenco.pessoas.push({chave: 'fl-2', id: '', nome: 'Pedro Prestador', apelido: 'pedro', ativo: true, freelancer: true, semCpf: true});
  const cfg = {instaladores: ['Adriano', 'Rita', 'Pedro', 'Osmane V.'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const os = osBase({equipe: []});
  const t = tela({papel: 'operacao', lista: [os], elenco, cfg});
  t.A.iniciar('p', {os, equipes: EQUIPES, papel: 'operacao', modo: 'pessoas'});
  t.A.executar('p', {alocAcao: 'painel'});
  const busca = q => { t.A.estado('p').painel.busca = q; return t.A.resultadosHTML('p'); };
  // Caso ruim: "rita" mostrava a Rita Fictícia travada e, logo acima, "Rita · sem ficha no RH: entra pelo nome", livre.
  for (const [q, motivo] of [['rita', /ID repetido entre ficha e contrato/], ['pedro', /Contrato de freelancer sem CPF/]]) {
    const h = busca(q);
    assert.doesNotMatch(h, /data-aloc-acao="nome"/, q + ': não entra livre pelo nome');
    assert.doesNotMatch(h, /entra pelo nome/, q);
    assert.match(h, motivo, q + ': a linha do nome diz o motivo da trava');
  }
  // Nem pela ação direta (a porta do botão).
  assert.match(t.A.executar('p', {alocAcao: 'nome', nome: 'Rita'}), /ID repetido/);
  assert.match(t.A.executar('p', {alocAcao: 'nome', nome: 'pedro'}), /sem CPF/);
  assert.deepEqual(js(t.A.paraEquipe('p').equipe), []);
  // O seletor antigo lê a mesma lista: a linha do nome trava também lá.
  const ops = t.run('opcoesEquipe([])');
  assert.match(ops.find(o => o.nome === 'Rita').bloqueio, /ID repetido/);
  assert.match(ops.find(o => o.nome === 'Pedro').bloqueio, /sem CPF/);
  // O nome sem cadastro nenhum continua entrando pelo nome, como sempre.
  assert.match(busca('osmane'), /data-aloc-acao="nome" data-nome="Osmane V\."/);
  assert.equal(t.A.executar('p', {alocAcao: 'nome', nome: 'Osmane V.'}), '');
  assert.deepEqual(js(t.A.paraEquipe('p').equipe), ['Osmane V.']);
  // A decisão salva de que o nome não é ninguém do RH (terceiro) continua valendo: a Rita terceira entra pelo nome.
  cfg.vinculosRH = [{apelido: 'Rita', semFicha: true}];
  assert.equal(t.run('opcoesEquipe([])').find(o => o.nome === 'Rita').bloqueio, '');
  t.A.executar('p', {alocAcao: 'painel'});
  assert.match(busca('rita'), /data-aloc-acao="nome" data-nome="Rita"/);
  assert.equal(t.A.executar('p', {alocAcao: 'nome', nome: 'Rita'}), '');
});
