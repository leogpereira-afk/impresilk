'use strict';
/* ONDA ACABAMENTO B, ITEM 1 (itens 22 e 34 da fila de 11/10/2026): o
   rascunho automático da conferência por entrega e dos formulários longos
   que faltavam (o Lançar entrega avulso, a Agenda, a divisão da ficha, o
   Conferir da Performance e a nova versão da regra). No aparelho, pela conta
   e pela O.S., sem R$, e some ao salvar. Cada teste começa pelo caso ruim
   (na v172, fechar a tela no meio perdia o que foi marcado). DOM falso
   mínimo; tudo fictício (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-05';
const tique = () => new Promise(r => setImmediate(r));

const ELENCO = {pessoas: [
  {chave: 'juviano-f', id: '100001', nome: 'Juviano Fictício', apelido: 'juviano', area: 'Montagem', ativo: true},
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
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, veiculo: '', valorTotal: 4321, rev: 1, ...extra});
const APP = ler('app.js');
const trecho = (de, ate) => { const i = APP.indexOf(de), j = APP.indexOf(ate, i); assert.ok(i >= 0 && j > i, 'trecho do app.js: ' + de); return APP.slice(i, j); };

/* A tela da gestão: operacao, divisao, regras, performance, o componente, o
   casa.js e, do app.js, o seletor de pessoas e a base dos rascunhos (sem
   IndexedDB: a memória da aba). Os relógios são do teste. */
function tela({lista = [], papel = 'pcp'} = {}) {
  const cfg = {instaladores: [], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const salvos = [], toasts = [], timers = [];
  const STORE = {getCFG: () => cfg, saveCFG() {}, getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => ELENCO, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null, valores: () => ({}),
    pullPhoto: async () => null, uuid: () => 'u1'};
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste', usuario: 'gestor.teste'}}, console, navigator: {onLine: true},
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc: escH, toast: (m, t) => toasts.push([m, t]), confirm: () => true,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    document: {getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: tag => elemento(tag), body: {appendChild() {}, classList: {add() {}, remove() {}, contains: () => false}}},
    emptyState: () => '', bindCardClicks() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    hojeISO: () => HOJE, nowISO: () => new Date(Date.now()).toISOString(), renderEntregas() {}, voltaEquipeHTML: () => '', VOLTA_ROTULO: {},
    registrarRemarcacao() {}, perguntarRetrabalho: (o, cb) => cb()};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js', 'casa.js']) vm.runInContext(ler(f), c, {filename: f});
  vm.runInContext(trecho('const RH_CONTRATOS_FREELANCER', '/* `marcadosAgora` e `novas`'), c, {filename: 'app.js (seletor)'});
  vm.runInContext(trecho('const RASC_BASE', '/* ══════'), c, {filename: 'app.js (rascunhos)'});
  const correr = () => { const xs = timers.splice(0); xs.forEach(fn => fn && fn()); };
  return {c, A: vm.runInContext('ALOCUI', c), run: code => vm.runInContext(code, c), cfg, salvos, toasts, lista, correr,
    guardados: () => js([...vm.runInContext('_rascMem', c).entries()])};
}
function elemento(tag = 'p') {
  const el = {tagName: String(tag).toUpperCase(), attrs: {}, filhos: [], textContent: '', className: '', classList: {contains: c => String(el.className).split(' ').includes(c), add() {}, remove() {}, toggle() {}},
    setAttribute(k, v) { this.attrs[k] = v; }, append(...xs) { this.filhos.push(...xs); this.textContent = xs.map(x => typeof x === 'string' ? x : x.textContent).join(''); }, remove() { this.removido = true; }};
  return el;
}
// Um pai que guarda o aviso do rascunho que voltou.
function pai() { return {avisos: [], insertBefore(n) { this.avisos.push(n); }}; }
// Um clique no componente (montar liga por delegação): a ação pelo nome que a tela usa.
const clicar = (host, ds) => host.onclick({target: {closest: () => ({dataset: ds, disabled: false})}, timeStamp: 0, detail: 1});

/* ─────────────────────────── a base e o retrato ─────────────────────────── */

test('rascunho de tela inteira: guarda o estado pela conta, tela e O.S., volta ao reabrir só se é desta tela, e some ao salvar', async () => {
  const t = tela();
  // Caso ruim (v172): não havia rascunho de estado; só o de campos com nome, que não guarda itens marcados nem a equipe montada.
  assert.equal(t.run('typeof ligarRascunhoEstado'), 'function');
  let estado = {itens: [['a', 2]], obs: ''};
  const abrir = (assin = 'x', o = {}) => { const voltou = []; const h = t.run('ligarRascunhoEstado')('conf-teste', 'os1', {assinatura: () => assin, ler: () => js(estado),
    aplicar: (e, como) => { if (!como.descartar) voltou.push(js(e)); estado = js(e); return true; }, aoRecuperar: () => voltou.push('aviso'), ...o}); return {h, voltou}; };
  const a = abrir();
  await tique();
  estado = {itens: [['a', 2], ['b', 1]], obs: 'anotação fictícia'};
  a.h.mudou(); t.correr(); await tique();
  const guardado = t.guardados();
  assert.equal(guardado.length, 1);
  assert.equal(guardado[0][0], 'gestor.teste|conf-teste|os1', 'pela conta, pela tela e pela O.S.');
  // A tela fechou no meio: reabrir devolve, com o aviso.
  estado = {itens: [['a', 2]], obs: ''};
  const b = abrir();
  await tique();
  assert.deepEqual(b.voltou, [{itens: [['a', 2], ['b', 1]], obs: 'anotação fictícia'}, 'aviso']);
  // Outra entrega (outra assinatura) não recebe o rascunho.
  estado = {itens: [], obs: ''};
  const c = abrir('outra');
  await tique();
  assert.deepEqual(c.voltou, []);
  // Outra conta no mesmo aparelho não vê o rascunho.
  t.run(`STATE.user = {papel: 'pcp', nome: 'Gestor Teste', usuario: 'outra.conta'}`);
  const d = abrir();
  await tique();
  assert.deepEqual(d.voltou, []);
  t.run(`STATE.user = {papel: 'pcp', nome: 'Gestor Teste', usuario: 'gestor.teste'}`);
  // Salvou: some.
  b.h.limpar(); await tique();
  assert.deepEqual(t.guardados(), []);
  const e = abrir(); await tique();
  assert.deepEqual(e.voltou, []);
  // Rascunho com mais de 7 dias não volta.
  t.run(`_rascMem.set(chaveRascunhoF24('conf-teste', 'os1'), {em: '2026-09-20T12:00:00Z', assinatura: 'x', estado: {itens: [['z', 9]], obs: 'velho'}})`);
  const f = abrir(); await tique();
  assert.deepEqual(f.voltou, []);
});

test('o retrato da equipe montada: volta igual, sem R$, e nunca por cima da O.S. mudada em outro aparelho nem com a soma diferente de 100%', () => {
  const os = osBase({equipe: ['100001', '100002'], valorTotal: 4321});
  const t = tela({lista: [os]});
  t.A.iniciar('k', {os, equipes: EQUIPES, papel: 'pcp', modo: 'divisao', valor: 4321, semAntigo: true});
  // Caso ruim (v172): o componente não sabia entregar nem receber o que estava montado.
  assert.equal(typeof t.A.retrato, 'function');
  assert.equal(t.A.executar('k', {alocAcao: 'equipe', e: 'eq-leao'}), '');
  const r = t.A.retrato('k');
  assert.doesNotMatch(JSON.stringify(r), /valor|R\$|4321/, 'o retrato não leva R$');
  const montada = js(t.A.estado('k').aloc);
  t.A.esquecer('k');
  t.A.iniciar('k', {os, equipes: EQUIPES, papel: 'pcp', modo: 'divisao', valor: 4321, semAntigo: true, reiniciar: true});
  assert.notDeepEqual(js(t.A.estado('k').aloc), montada);
  assert.equal(t.A.aplicarRetrato('k', r), true);
  assert.deepEqual(js(t.A.estado('k').aloc), montada);
  assert.equal(t.A.estado('k').tocado, true, 'o que voltou conta como mexido (a tela grava)');
  // A equipe da O.S. mudou em outro aparelho: o rascunho não volta por cima.
  const outra = {...os, equipe: ['100003']};
  t.A.iniciar('k2', {os: outra, equipes: EQUIPES, papel: 'pcp', modo: 'divisao', semAntigo: true});
  assert.equal(t.A.aplicarRetrato('k2', r), false);
  // A divisão que não fecha 100% não entra.
  t.A.iniciar('k3', {os, equipes: EQUIPES, papel: 'pcp', modo: 'divisao', semAntigo: true, reiniciar: true});
  const torto = js(r); torto.aloc.grupos[0].cota = 7000;
  const antes = js(t.A.estado('k3').aloc);
  assert.equal(t.A.aplicarRetrato('k3', torto), false);
  assert.deepEqual(js(t.A.estado('k3').aloc), antes, 'recusou sem mexer');
  // Gente sem ID também não.
  const semId = js(r); semId.aloc.grupos[0].membros[0].pessoaId = 'Fulano';
  assert.equal(t.A.aplicarRetrato('k3', semId), false);
});

/* ─────────────────────────── a Agenda ─────────────────────────── */

function agenda(t) {
  const host = {innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const ouvintes = [], ouvF = [];
  const sel = {value: '', options: t.lista.map(o => ({value: o.id})), addEventListener: (_, fn) => ouvintes.push(fn)};
  const campo = v => ({value: v, addEventListener() {}});
  const campos = {periodo: campo('Manhã'), hora: campo(''), dias: campo('1'), veiculo: {value: '', options: [{value: ''}, {value: 'Carro 2'}], addEventListener() {}}};
  const p = pai();
  const form = {firstChild: {parentNode: p}, firstElementChild: {parentNode: p}, addEventListener: (_, fn) => ouvF.push(fn),
    querySelector: q => q === '[data-aloc-host]' ? host : q === '[name="osId"]' ? sel : (/name="(\w+)"/.exec(q) || [])[1] ? campos[/name="(\w+)"/.exec(q)[1]] || null : null,
    querySelectorAll: () => []};
  t.c.document.getElementById = id => (id === 'ag-add' ? form : null);
  t.c.FormData = class { get(k) { return k === 'osId' ? sel.value : k === 'dias' ? '1' : (campos[k] || {}).value || ''; } getAll() { return []; } };
  let gravou = 0;
  t.run('(el, cb) => wireAddOSCasa(el, "ag-add", "' + HOJE + '", cb)')({querySelectorAll: () => []}, () => { gravou++; });
  return {host, sel, campos, avisos: p.avisos, escolher: id => { sel.value = id; ouvintes.forEach(fn => fn()); }, mexer: () => ouvF.forEach(fn => fn()),
    submeter: () => { form.onsubmit({preventDefault() {}}); return gravou; }, chave: 'agenda:ag-add'};
}

test('Agenda: a programação montada (O.S., período, veículo e equipe) volta depois de fechar a aba, e some ao programar', async () => {
  const os = osBase({instalacao: {}});
  const t = tela({lista: [os]});
  const ag = agenda(t);
  ag.escolher('o1');
  ag.campos.periodo.value = 'Tarde'; ag.campos.veiculo.value = 'Carro 2'; ag.mexer();
  clicar(ag.host, {alocAcao: 'equipe', e: 'eq-aguia'});
  t.correr(); await tique();
  // A aba fechou (a memória da aba, STATE._agAddEscolha, se perdeu) e a Agenda abriu de novo.
  t.run('STATE._agAddEscolha = {}; ALOCUI.esquecer("agenda:ag-add")');
  const ag2 = agenda(t);
  await tique();
  // Caso ruim (v172): o formulário voltava vazio, sem a O.S. e sem a equipe.
  assert.equal(ag2.sel.value, 'o1');
  assert.equal(ag2.campos.periodo.value, 'Tarde');
  assert.equal(ag2.campos.veiculo.value, 'Carro 2');
  assert.equal(t.A.estado(ag2.chave).aloc.grupos[0].equipeId, 'eq-aguia');
  assert.equal(ag2.avisos.length, 1);
  assert.match(ag2.avisos[0].textContent, /Voltou a programação/);
  assert.doesNotMatch(JSON.stringify(t.guardados()), /R\$|"valor"|4321/, 'sem R$ no rascunho');
  assert.equal(ag2.submeter(), 1);
  assert.equal(t.salvos[0].alocacao.grupos[0].equipeId, 'eq-aguia');
  assert.equal(t.salvos[0].instalacao.periodo, 'Tarde');
  await tique();
  assert.deepEqual(t.guardados(), [], 'programou: o rascunho saiu');
});

/* ─────────────────────────── o Lançar entrega ─────────────────────────── */

function lancar(t, osId) {
  const host = {innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const ouvF = [], p = pai();
  const data = {name: 'data', type: 'date', tagName: 'INPUT', value: '', onchange: null};
  const form = {parentNode: p, addEventListener: (_, fn) => ouvF.push(fn), querySelectorAll: q => /casa-chip/.test(q) ? [] : [data]};
  const box = {innerHTML: '', style: {}, querySelectorAll: () => [], remove() {}, querySelector: q => q === '#lancar-form' ? form : q === '#lancar-form input[name="data"]' ? data : null};
  t.c.document.createElement = tag => tag === 'div' ? box : elemento(tag);
  t.c.document.getElementById = id => ({'lancar-form': form, 'lancar-x': {}, 'lancar-aloc': host}[id] || null);
  t.c.FormData = class { get(k) { return k === 'data' ? data.value : ''; } getAll() { return []; } };
  t.run(`lancarEntregaManual('${osId}')`);
  return {host, data, avisos: p.avisos, mexer: () => ouvF.forEach(fn => fn()), submeter: () => form.onsubmit({preventDefault() {}, target: form}), chave: 'lancar:' + osId};
}
const baixada = (extra = {}) => osBase({finalizadaEm: '2026-10-02T18:00:00', finalizadoPor: 'Mubisys (auto)', baixaAutoERP: {em: '2026-10-02T18:00:00', status: 'ENTREGUE'}, ...extra});

test('Lançar entrega avulso: a data e a equipe montada voltam depois de fechar, e somem ao lançar', async () => {
  const t = tela({lista: [baixada()], papel: 'admin'});
  const l = lancar(t, 'o1');
  l.data.value = '2026-10-01'; l.mexer();
  clicar(l.host, {alocAcao: 'equipe', e: 'eq-leao'});
  t.correr(); await tique();
  // Fechou no X (o componente é esquecido) e abriu de novo.
  t.A.esquecer(l.chave);
  const l2 = lancar(t, 'o1');
  await tique();
  // Caso ruim (v172): voltava com a data sugerida e a equipe da O.S.
  assert.equal(l2.data.value, '2026-10-01');
  assert.equal(t.A.estado(l2.chave).aloc.grupos[0].equipeId, 'eq-leao');
  assert.match(l2.avisos[0].textContent, /não chegou a lançar/);
  assert.doesNotMatch(JSON.stringify(t.guardados()), /R\$|"valor"|4321/);
  l2.submeter();
  assert.equal(t.salvos[0].entregaLancada.data, '2026-10-01');
  assert.equal(t.salvos[0].alocacao.grupos[0].equipeId, 'eq-leao');
  await tique();
  assert.deepEqual(t.guardados(), [], 'lançou: o rascunho saiu');
});

/* ─────────────────────────── a divisão da ficha ─────────────────────────── */

test('ficha: a divisão mexida e não confirmada volta ao reabrir a ficha (antes só avisava "não foi gravada"), e Recomeçar apaga', async () => {
  const os = osBase({equipe: ['100001', '100002']});
  const t = tela({lista: [os]});
  vm.runInContext(trecho('let _fichaDivEnviando = false;', 'function ligarDivisaoDaFicha('), t.c, {filename: 'app.js (ficha)'});
  const abrir = reiniciar => t.A.iniciar('ficha-div:o1', {os, equipes: EQUIPES, papel: 'pcp', modo: 'divisao', semAntigo: true, reiniciar});
  const p = pai(), box = {parentNode: p, previousElementSibling: null};
  abrir(true);
  // Caso ruim (v172): não existia rascunho da divisão da ficha.
  assert.equal(t.run('typeof rascunhoDivisaoDaFicha'), 'function');
  const h = t.run('rascunhoDivisaoDaFicha')(box, 'ficha-div:o1', 'o1');
  await tique();
  assert.equal(t.A.executar('ficha-div:o1', {alocAcao: 'pct', g: '0', p: '100001', valor: '55'}), '');
  const montada = js(t.A.estado('ficha-div:o1').aloc);
  h.mudou(); t.correr(); await tique();
  // Fechou a ficha sem confirmar; abriu de novo.
  t.A.esquecer('ficha-div:o1');
  abrir(true);
  t.run('rascunhoDivisaoDaFicha')(box, 'ficha-div:o1', 'o1');
  await tique();
  assert.deepEqual(js(t.A.estado('ficha-div:o1').aloc), montada);
  assert.match(p.avisos[0].textContent, /não chegou a confirmar/);
  // A mesma montagem ligada de novo (a ficha repinta) não lê outro rascunho nem duplica o aviso.
  box.previousElementSibling = p.avisos[0]; p.avisos[0].className = 'rasc-aviso';
  t.run('rascunhoDivisaoDaFicha')(box, 'ficha-div:o1', 'o1');
  assert.equal(p.avisos.length, 1);
  // O texto do fechamento da ficha diz que fica guardada.
  assert.match(APP, /não foi confirmada e não foi gravada; ela fica guardada neste aparelho/);
  // Recomeçar (e o Confirmar) apaga o rascunho.
  assert.match(APP, /recomecar\.onclick = \(\) => \{ const h0 = _rascDivFicha\.get\(ALOCUI\.estado\(k\.div\)\); if \(h0\) h0\.limpar\(\);/);
  assert.match(APP, /if \(r\.ok\) \{\n\s+if \(rascAgora\) rascAgora\.limpar\(\);/);
});

/* ─────────────────────────── a conferência por entrega ─────────────────────────── */

function conferencia(os, {api} = {}) {
  const novo = (extra = {}) => ({textContent: '', value: '', hidden: false, disabled: false, checked: false, dataset: {}, classList: {add() {}, remove() {}, toggle() {}}, focus() {}, scrollIntoView() {}, addEventListener() {}, removeEventListener() {}, ...extra});
  const n = (os.itens || []).length;
  const caixas = Array.from({length: n}, (_, i) => novo({dataset: {confItem: String(i)}}));
  const qtdes = Array.from({length: n}, (_, i) => novo({value: '1', max: String(Number(os.itens[i].qtde)), disabled: true, dataset: {confQtde: String(i)}}));
  const p = pai();
  const fixos = {'#conf-data': novo({value: ''}), '#conf-rev-motivo': null, '.conf-campos': novo({parentNode: p}), '#conf-salvar': novo(), '#conf-status': novo(), '#conf-aloc': novo(), '#conf-mes-fechado': novo(), '#conf-resumo': novo(), '#conf-parte-titulo': novo(), '#conf-parte-itens': novo(), '#conf-parte-valor': novo(), '#conf-todos': novo(), '#conf-editar-itens': novo(), '#conf-cancelar': novo(), '#conf-volta-dia': novo()};
  const d = novo({open: true, close() { this.open = false; }, querySelector: sel => { const m = /data-conf-qtde="(\d+)"/.exec(sel); if (m) return qtdes[+m[1]]; return sel in fixos ? fixos[sel] : novo(); },
    querySelectorAll: sel => sel === '[data-conf-item]' ? caixas : sel === '[data-conf-qtde]' ? qtdes : []});
  const aplicados = [];
  return {d, caixas, qtdes, fixos, avisos: p.avisos, aplicados,
    ALOCUI: {iniciar() {}, montar() {}, estado: () => ({}), bloqueio: () => '', repintar() {}, definirDataEntrega() {}, esquecer() {}, paraGravar: () => ({alocacao: {grupos: []}}),
      retrato: () => ({base: 'b', aloc: {grupos: [{membros: [{pessoaId: '100001', cota: 10000}], cota: 10000}]}, tocado: false}), aplicarRetrato: (_k, r) => { aplicados.push(js(r)); return true; }}};
}
async function abrirConferencia(ctx, dom, os) {
  ctx.ALOCUI = dom.ALOCUI;
  ctx.perfDialog = () => dom.d;
  await vm.runInContext(`conferirItensEntrega(${JSON.stringify(os.id)}, '')`, ctx);
}

test('conferência por entrega: o dia, os itens, as quantidades e a equipe marcados voltam depois de fechar, sem R$, e somem ao confirmar', async () => {
  const os = {id: 'c1', numero: '90201', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 8500, equipe: ['100001'], finalizadaEm: '2026-10-03T15:00:00Z',
    itens: [{uid: 'a', item: '1', descricao: 'Painel fictício A', qtde: '4', subtotal: '5000'}, {uid: 'b', item: '2', descricao: 'Placa fictícia B', qtde: '2', subtotal: '3500'}]};
  const enviados = [], timers = [];
  const ctx = vm.createContext({console, Map, Set, JSON, Promise, crypto: {randomUUID: () => 'nova-0001'}, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    STATE: {user: {papel: 'pcp', nome: 'Gestor Teste', usuario: 'gestor.teste'}}, esc: escH, nowISO: () => new Date(Date.now()).toISOString(),
    document: {createElement: elemento},
    STORE: {getQueue: () => [], api: async p => { if (p.entrega) { enviados.push(p); return {ok: true, os}; } return {os, valor: 8500, fechados: [], inteira: null}; }},
    perfPodeEditar: () => true, perfConfig: () => ({equipes: []}), perfRegrasFonte: () => ({versoes: []}), diaEntrega: () => '2026-10-03', dinheiroCasa: v => 'R$ ' + v, toast() {}, perfDepoisDeGravar() {}, perfErroTxt: String});
  for (const f of ['entrega-item.js', 'divisao.js', 'conferencia-entrega.js', 'conferencia-entrega-ui.js']) vm.runInContext(ler(f).replace(/^const (ENTREGA_ITEM|CONFERENCIA_ENTREGA|DIVISAO) =/m, 'var $1 ='), ctx, {filename: f});
  vm.runInContext(trecho('const RASC_BASE', '/* ══════'), ctx, {filename: 'app.js (rascunhos)'});
  const a = conferencia(os);
  await abrirConferencia(ctx, a, os);
  // Marca o item B com 2 unidades e troca o dia.
  a.caixas[1].checked = true; a.caixas[1].onchange();
  a.qtdes[1].value = '2'; a.qtdes[1].oninput();
  a.fixos['#conf-data'].value = '2026-10-02'; a.fixos['#conf-data'].onchange({target: a.fixos['#conf-data']});
  timers.splice(0).forEach(fn => fn()); await tique();
  const guardado = js([...vm.runInContext('_rascMem', ctx).entries()]);
  assert.equal(guardado.length, 1);
  assert.equal(guardado[0][0], 'gestor.teste|conferencia-entrega|c1:nova');
  assert.doesNotMatch(JSON.stringify(guardado), /R\$|valor|8500|5000|3500/, 'o rascunho não leva R$');
  // Fechou a tela sem confirmar; abriu de novo a conferência da mesma O.S.
  const b = conferencia(os);
  await abrirConferencia(ctx, b, os);
  await tique();
  // Caso ruim (v172): a conferência abria em branco.
  assert.equal(b.caixas[1].checked, true);
  assert.equal(b.qtdes[1].value, '2');
  assert.equal(b.caixas[0].checked, false);
  assert.equal(b.fixos['#conf-data'].value, '2026-10-02');
  assert.equal(b.aplicados.length, 1, 'a equipe montada volta pelo retrato');
  assert.match(b.avisos[0].textContent, /Voltou o que você tinha marcado nesta conferência/);
  // Confirmou: o rascunho sai.
  await b.fixos['#conf-salvar'].onclick();
  assert.equal(enviados.length, 1, JSON.stringify(b.fixos['#conf-status'].textContent));
  assert.deepEqual(enviados[0].entrega.itens.map(i => i.qtde), [2]);
  assert.match(enviados[0].entrega.itens[0].chave, /b|2/);
  assert.equal(enviados[0].entrega.dia, '2026-10-02');
  await tique();
  assert.deepEqual(js([...vm.runInContext('_rascMem', ctx).entries()]), []);
  const c = conferencia(os);
  await abrirConferencia(ctx, c, os); await tique();
  assert.equal(c.caixas[1].checked, false, 'depois de salvar, abre como sempre');
  assert.equal(c.avisos.length, 0);
});

/* ─────────────── o Conferir da Performance e a nova versão da regra ─────────────── */

test('Conferir da Performance e nova versão da regra: ligam o rascunho, apagam ao gravar, e o Recomeçar apaga', () => {
  const perf = ler('performance.js');
  // Caso ruim (v172): nenhum dos dois guardava o que foi digitado.
  assert.match(perf, /ligarRascunhoEstado\('perf-conferir', id, \{/);
  assert.match(perf, /recomecar\.onclick = \(\) => \{ if \(rasc\) rasc\.limpar\(\); abrirComponente\(true\);/);
  assert.match(perf, /if \(r\.estado === 'gravada' \|\| r\.estado === 'pendente' \|\| r\.estado === 'sem-mudanca'\) \{\n\s+if \(rasc\) rasc\.limpar\(\);/);
  assert.match(perf, /if \(rasc\) rasc\.limpar\(\);\n\s+ALOCUI\.esquecer\(chave\); d\.close\(\);/, 'o jeito antigo também apaga ao confirmar');
  assert.match(perf, /ligarRascunhoForm\(form, 'regra-nova', anterior \|\| 'embutida'/);
  assert.match(perf, /throw new Error\(r\?\.error \|\| 'Não foi possível gravar a nova versão\.'\);\n\s+rasc\.limpar\(\);/);
});
