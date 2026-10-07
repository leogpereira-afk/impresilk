/* REVISÃO ADVERSARIAL DA F09 (30/09/2026). Duas lentes (servidor e
   corretude) acharam defeitos no componente de alocação (alocacao-ui.js), no
   Conferir da Performance e na adoção do `em` no store.js, cada um com prova.
   Cada teste aqui começa pelo caso ruim da prova e fica como guarda. Dados
   fictícios (o repositório é público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const pausa = ms => new Promise(r => setTimeout(r, ms));
const semTags = h => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');

const ELENCO = {pessoas: [
  {chave: 'ana-f', id: '100001', nome: 'Ana Fictícia', apelido: 'ana', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
  {chave: 'eva-f', id: '100005', nome: 'Eva Fictícia', apelido: 'eva', area: 'Montagem', ativo: true},
  {chave: 'rita-f', id: '100009', nome: 'Rita Fictícia', apelido: 'rita', area: 'Montagem', ativo: true, idRepetido: true},
], antigos: []};
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', emblema: '🦅', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001', nome: 'Ana'}, {chave: '100002', nome: 'Bia'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', emblema: '🦁', animal: 'leao', cor: 'laranja', liderPadraoId: '100005', membros: [{chave: '100005', nome: 'Eva'}, {chave: '100003', nome: 'Caio'}], ativo: true},
];
const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const fichaRH = (id, nome, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido: nome.split(' ')[0].toLowerCase(), cpf}});
const RH = [fichaRH('ana-f', 'Ana Fictícia', '10000111111'), fichaRH('bia-f', 'Bia Fictícia', '10000222222'), fichaRH('caio-f', 'Caio Fictício', '10000333333')];
const gestor = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const osBase = (extra = {}) => ({id: '1', numero: '5001', tipo: 'externo', cliente: 'Cliente Fictício', equipe: [], valorTotal: 4200, finalizadaEm: '2026-10-02T15:00:00', rev: 1, ...extra});
const alvo = ds => ({dataset: ds, disabled: false, closest() { return this; }});
const cfgInicial = () => ({instaladores: ['Ana'], performancePCP: {equipes: js(EQUIPES), participacoes: []}});
const banco = (oss, extra = {}) => ({
  pcp_registros: oss.map(o => ({id: o.id, colecao: 'os', apagado: false, atualizado_em: '2026-09-20T15:00:00Z', registro: o})),
  registros: RH, pcp_config_global: [{id: true, config: cfgInicial(), atualizado_em: '2026-09-01T10:00:00Z'}], ...extra});
const noServidor = (e, id = '1') => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
function rhFora(e) {
  const original = e.cliente.from.bind(e.cliente);
  e.cliente.from = t => { const q = original(t); if (t === 'registros') q.then = resolve => resolve({data: null, error: {message: 'RH fora do ar'}}); return q; };
  return () => { e.cliente.from = original; };
}

/* O <dialog id="perf-dialog"> DE VERDADE É UM SÓ: perfDialog troca o
   conteúdo e reabre o mesmo elemento; os ouvintes de 'close' acumulam (once). */
function dialogoCompartilhado() {
  let els = {};
  const ouvintes = [];
  const d = {open: false, corpo: '', titulo: '',
    get els() { return els; },
    querySelector: q => (els[q] = els[q] || {innerHTML: '', textContent: '', hidden: q === '#perf-aloc-recomecar', disabled: false, classList: {add() {}, remove() {}, toggle() {}}}),
    querySelectorAll: () => [],
    addEventListener: (ev, f, o) => { ouvintes.push({ev, f, once: !!(o && o.once)}); },
    close() { if (!d.open) return; d.open = false; for (const x of ouvintes.splice(0)) { if (x.ev !== 'close') { ouvintes.push(x); continue; } x.f(); if (!x.once) ouvintes.push(x); } },
    abrir(titulo, corpo) { els = {}; d.titulo = titulo; d.corpo = corpo; d.open = true; return d; }};
  return d;
}
// As globais da tela da gestão que o Conferir usa (o resto do app fica de fora).
const globaisTela = (toasts, extra = {}) => ({
  STATE: {user: {papel: 'pcp', nome: 'Gestor Teste'}}, esc: escH, toast: (m, t) => toasts.push([m, t]),
  dinheiroCasa: n => 'R$ ' + Number(n).toFixed(2).replace('.', ','), valorDaOS: o => o.valorTotal ?? null,
  nomeExibicaoCasa: n => { const p = ELENCO.pessoas.find(x => x.id === n || x.apelido === n || x.chave === n); return p ? {chave: p.chave, id: p.id, nome: p.nome} : {chave: n, id: '', nome: n}; },
  pessoasRH: () => ELENCO.pessoas, avatarRH: (p, cl) => `<span class="casa-avatar ${cl}">${escH((p.nome || '?')[0])}</span>`,
  periodoOuMes: () => ({de: '2026-10-01', ate: '2026-10-31'}), classificarEntregas: os => ({instalacoes: os, aLancar: []}),
  renderPerformanceCasa: () => {}, normNome: s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), ...extra});
function carregarTela(c) {
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js']) vm.runInContext(ler(f), c, {filename: f});
  // O diaEntrega de verdade (casa.js): entrega lançada, senão a finalização, no fuso local.
  vm.runInContext('function diaEntrega(o){return (o.entregaLancada && OPERACAO.dia(o.entregaLancada.data)) || OPERACAO.dia(o.finalizadaEm);}', c);
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename: 'app.js (seletor)'});
}
/* A tela com um STORE de mentira que conta o que grava (saveOS e saveCFG). */
function tela({lista = [], loja = {}, cfg: cfgDado, papel = 'pcp'} = {}) {
  const cfg = cfgDado || {instaladores: ['Ana'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const salvos = [], cfgs = [], toasts = [];
  const STORE = {getCFG: () => cfg, saveCFG: x => cfgs.push(js(x)), getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => ELENCO, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null,
    api: async () => ({}), pullCFG: async () => false, ...loja};
  const dlg = dialogoCompartilhado();
  const c = vm.createContext({STORE, console, setTimeout, clearTimeout, navigator: {onLine: true}, ...globaisTela(toasts)});
  c.STATE.user.papel = papel;
  carregarTela(c);
  c.perfDialog = (titulo, corpo) => dlg.abrir(titulo, corpo);
  return {c, A: vm.runInContext('ALOCUI', c), cfg, salvos, cfgs, toasts, STORE, dlg, run: code => vm.runInContext(code, c)};
}
/* A tela com o store.js DE VERDADE (fila, eventos, adoção do `em`) e o fetch
   indo ao pcp-sync de verdade (tests/helpers/edge.cjs). */
function completo({lista = [], e, quem = gestor, filtrar}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; }, put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [], dlg = dialogoCompartilhado();
  const cfg = {instaladores: ['Ana'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const c = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout, clearTimeout, AbortController, API_BASE: 'http://teste', queueMicrotask,
    fetch: async (_u, req) => { const body = JSON.parse(req.body); const r = await e.call(body, quem); if (filtrar) filtrar(body, r); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; },
    ...globaisTela(toasts)});
  vm.runInContext(ler('store.js'), c, {filename: 'store.js'});
  const S = vm.runInContext('STORE', c);
  S.getCFG = () => cfg; S.elenco = () => ELENCO; S.saveCFG = () => {};
  carregarTela(c);
  vm.runInContext('perfCarregarFonte = async () => {};', c);
  c.perfDialog = (t, corpo) => dlg.abrir(t, corpo);
  return {c, S, A: vm.runInContext('ALOCUI', c), dlg, toasts};
}
const pct = (el, p, valor, g = '0') => el.onchange({target: {dataset: {alocPct: '', g, p}, value: valor}});

/* ═══════════════ lente servidor, defeito 1 ═══════════════ */

test('revisão: a equipe da O.S. mudou em outro aparelho com o Conferir aberto; confirmar não tira calado quem entrou', async () => {
  for (const comDivisao of [false, true]) {
    const e = await edge('pcp-sync', banco([osBase({equipe: ['100001', '100002']})]));
    if (comDivisao) {
      const r0 = await e.call({action: 'upsert', os: {...js(noServidor(e)), alocacao: js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]))}}, gestor);
      assert.ok(!r0.descartado && !r0.conflito, JSON.stringify(r0));
    }
    const lista = [js(noServidor(e))];
    const {c, A, salvos, dlg} = tela({lista});
    await c.perfEditarParticipacao('1');
    const box = dlg.els['#perf-aloc'], ok = dlg.els['#perf-aloc-ok'], status = dlg.els['#perf-aloc-status'], rec = dlg.els['#perf-aloc-recomecar'];
    // Enquanto isso, o PCP (outro aparelho) põe o Caio na equipe da O.S. pela ficha; o pull traz.
    const b = js(noServidor(e)); b.equipe = [...b.equipe, '100003']; b.atualizadoEm = new Date().toISOString();
    assert.equal((await e.call({action: 'upsert', os: b}, {papel: 'pcp', nome: 'Outro Gestor', sub: 'outro'})).status, 200);
    if (comDivisao) assert.equal(noServidor(e).alocacao.desatualizada, true, 'o servidor marcou a divisão');
    lista[0] = js(noServidor(e));
    // Caso ruim: a gestora mexe no percentual e confirma a divisão de antes (Ana e Bia).
    pct(box, '100001', '70');
    await ok.onclick();
    assert.equal(salvos.length, 0, `nada vai ao servidor (${comDivisao ? 'com' : 'sem'} divisão)`);
    assert.match(status.textContent, /A equipe desta O\.S\. foi mudada em outro aparelho \(Outro Gestor\) enquanto você editava\. Nada foi gravado\. Toque em Recomeçar/);
    assert.equal(rec.hidden, false, 'oferece recomeçar');
    assert.equal(dlg.open, true);
    // Recomeçar parte de quem está na O.S. agora: o Caio entra na sugestão e continua na O.S.
    rec.onclick();
    assert.deepEqual(js(D.derivarEquipe(A.estado('perf:1').aloc)).sort(), ['100001', '100002', '100003']);
    c.confirm=()=>true; // A gestão aceita a prévia do novo líder; o conflito de outro aparelho continua protegido.
    box.onclick({target: alvo({alocAcao: 'lider', g: '0', p: '100001'})});
    ok.disabled = false;
    await ok.onclick();
    assert.equal(salvos.length, 1);
    const r = await e.call({action: 'upsert', os: salvos[0]}, gestor);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.ok(!r.descartado, JSON.stringify(r));
    assert.ok(noServidor(e).equipe.includes('100003'), 'o Caio continua na O.S.');
  }
  // A mesma gente escrita de outro jeito (o apelido que o servidor devolve como ID) não é mudança.
  const lista = [osBase({equipe: ['ana', 'bia']})];
  const {A, salvos} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'});
  lista[0] = {...lista[0], equipe: ['100002', '100001']};
  assert.equal((await A.gravarNaOS('t', {usuario: 'Gestor', prazoMs: 50})).estado, 'gravada');
  assert.equal(salvos.length, 1);
});

/* ═══════════════ lente servidor 2 = lente corretude 5 ═══════════════ */

test('revisão: divisão a conferir no RH; confirmar com o RH fora (ou com alguém que não passa) não diz "gravada"', async () => {
  for (const caso of ['rh-fora', 'nao-passa']) {
    const e = await edge('pcp-sync', banco([osBase({equipe: ['100001', '100002']})]));
    const volta = rhFora(e);
    await e.call({action: 'upsert', os: {...js(noServidor(e)), alocacao: js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]))}}, gestor);
    assert.equal(noServidor(e).alocacao.conferirRH, true);
    if (caso === 'nao-passa') { volta(); e.db.registros = e.db.registros.filter(r => r.id !== 'bia-f'); }
    const t = completo({lista: [js(noServidor(e))], e});
    await t.S.pronto();
    await t.c.perfEditarParticipacao('1');
    assert.match(t.dlg.els['#perf-aloc'].innerHTML, /Confirmar confere as pessoas no RH/);
    // Caso ruim: confirmar sem mudar nada; a v de antes fechava com "Divisão gravada na O.S." em verde.
    await t.dlg.els['#perf-aloc-ok'].onclick();
    await pausa(5);
    assert.ok(!t.toasts.some(([m]) => /Divisão gravada/.test(m)), JSON.stringify(t.toasts));
    assert.equal(noServidor(e).alocacao.conferirRH, true, `${caso}: continua a conferir no servidor`);
    assert.equal(t.dlg.open, true, 'a tela fica aberta com o motivo');
    const st = t.dlg.els['#perf-aloc-status'].textContent;
    assert.match(st, /ainda não conta na performance/);
    if (caso === 'rh-fora') assert.match(st, /o RH não respondeu/);
    else assert.match(st, /não passou na conferência: A pessoa de ID 100002 não está nas fichas/, 'o motivo do servidor vai junto');
    assert.equal(t.dlg.els['#perf-aloc-ok'].disabled, false, 'dá para confirmar de novo quando o RH voltar');
    assert.doesNotMatch(st, /—/);
    if (caso === 'rh-fora') {
      // O RH volta: confirmar de novo confere, a marca sai e agora sim é "gravada".
      volta();
      await t.dlg.els['#perf-aloc-ok'].onclick();
      await pausa(5);
      assert.ok(!('conferirRH' in noServidor(e).alocacao), 'passou na conferência');
      assert.deepEqual(t.toasts.at(-1), ['Divisão gravada na O.S. 5001.', 'success']);
    }
  }
});

/* ═══════════════ lente servidor, defeito 3 ═══════════════ */

test('revisão: O.S. do histórico, a 2a conferência depois do pull completo não é descartada como cópia velha', async () => {
  const dia = '2026-07-10';
  const e = await edge('pcp-sync', banco([osBase({equipe: ['100001', '100002'], finalizadaEm: dia + 'T15:00:00', entregaLancada: {data: dia}})]));
  await e.call({action: 'upsert', os: {...js(noServidor(e)), alocacao: js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]))}}, gestor);
  // O banco de mentira não aplica o .or() do escopo 'recentes': o corte por finalizadaEm (o do servidor) vai aqui.
  const t = completo({e, filtrar: (q, r) => {
    if (q.action === 'list' && q.escopo === 'recentes' && Array.isArray(r.os)) { const corte = new Date(Date.now() - (q.dias || 60) * 864e5).toISOString(); r.os = r.os.filter(o => !o.finalizadaEm || o.finalizadaEm >= corte); }
  }});
  const {S, A} = t;
  await S.pronto();
  await S.buscarHistorico({de: '', ate: '', q: '5001'});
  assert.ok(!S.getAllOS().some(o => o.id === '1') && S.getOS('1'), 'fora da lista, achada no histórico');
  A.iniciar('k1', {os: S.getOS('1'), equipes: EQUIPES, papel: 'pcp', dia, reiniciar: true});
  A.executar('k1', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'});
  assert.equal((await A.gravarNaOS('k1', {store: S, usuario: 'Gestor Teste', prazoMs: 2000})).estado, 'gravada');
  A.esquecer('k1');
  // O pull completo tira a O.S. de julho da lista; o getOS cai no histórico.
  await S.pull(null, {completo: true});
  assert.ok(!S.getAllOS().some(o => o.id === '1'));
  // Caso ruim: o histórico guardava o `em` de antes da 1a conferência.
  assert.equal(S.getOS('1').alocacao.em, noServidor(e).alocacao.em, 'o histórico tem o em da divisão aceita');
  A.iniciar('k2', {os: S.getOS('1'), equipes: EQUIPES, papel: 'pcp', dia, reiniciar: true});
  A.executar('k2', {alocAcao: 'pct', g: '0', p: '100001', valor: '80'});
  const r2 = await A.gravarNaOS('k2', {store: S, usuario: 'Gestor Teste', prazoMs: 2000});
  assert.equal(r2.estado, 'gravada', r2.mensagem);
  assert.deepEqual(noServidor(e).alocacao.grupos[0].membros.map(m => m.cota), [8000, 2000]);
  assert.equal(js(S.avisosAlocacao()).length, 0, 'nenhum descarte');
});

/* ═══════════════ lente servidor, defeito 4 ═══════════════ */

// A mesma conferência de casca do teste de alocacao-ui.test.cjs, pela versão de APP_VERSAO.
function cascaDoComponente(index, sw, config) {
  const v = /const APP_VERSAO = '(v\d+)'/.exec(config)[1];
  const erros = [];
  if (!new RegExp(`<script src="performance\\.js\\?v=${v}"></script>\\s*<script src="alocacao-ui\\.js\\?v=${v}"></script>`).test(index)) erros.push('index.html');
  if (!/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].includes(`'alocacao-ui.js?v=${v}'`)) erros.push('SHELL');
  if (!sw.includes(`const CACHE = 'impresilk-shell-${v}'`)) erros.push('CACHE');
  return erros;
}
test('revisão: a conferência da casca do componente segue APP_VERSAO; a subida de versão não trava o deploy', () => {
  const index = ler('index.html'), sw = ler('sw.js'), config = ler('config.js');
  const atual = /const APP_VERSAO = 'v(\d+)'/.exec(config)[1], prox = 'v' + (Number(atual) + 1);
  const subir = s => s.split('v' + atual).join(prox);
  // Caso ruim: o teste antigo fixava a versão no texto e falhava na subida seguinte.
  const fixo = /<script src="performance\.js\?v=v138"><\/script>\s*<script src="alocacao-ui\.js\?v=v138"><\/script>/;
  assert.equal(fixo.test(subir(index)), false, 'a régua fixa quebrava com a versão nova');
  assert.deepEqual(cascaDoComponente(index, sw, config), [], 'hoje');
  assert.deepEqual(cascaDoComponente(subir(index), subir(sw), subir(config)), [], 'com a versão seguinte');
  // E ainda pega o componente esquecido na versão velha.
  assert.deepEqual(cascaDoComponente(subir(index).replace(`alocacao-ui.js?v=${prox}`, `alocacao-ui.js?v=v${atual}`), subir(sw), subir(config)), ['index.html']);
  // O teste de casca do alocacao-ui.test.cjs lê a versão (nenhum ?v= escrito à mão).
  assert.doesNotMatch(ler('tests/alocacao-ui.test.cjs'), /alocacao-ui\\\.js\\\?v=v\d+|alocacao-ui\.js\?v=v\d+|shell-v\d+/);
});

/* ═══════════════ lente corretude, defeito 1 ═══════════════ */

test('revisão: o resultado atrasado do Conferir da O.S. A não fecha nem apaga o Conferir da O.S. B; o motivo vira aviso', async () => {
  for (const desfecho of ['gravada', 'descartada']) {
    const ouv = {};
    const lista = [osBase({equipe: ['100001', '100002']}), osBase({id: '2', numero: '5002', equipe: ['100005', '100003']})];
    // Rede ruim: o envio de A fica na fila e a resposta vem depois (evento do store).
    const t = tela({lista, loja: {on: (ev, f) => { (ouv[ev] = ouv[ev] || []).push(f); }, getQueue: () => [{action: 'upsert', os: {id: '1'}}]}});
    const {c, A, dlg, salvos, toasts} = t;
    await c.perfEditarParticipacao('1');
    pct(dlg.els['#perf-aloc'], '100001', '70');
    const envioA = dlg.els['#perf-aloc-ok'].onclick();
    await new Promise(r => setImmediate(r));
    assert.equal(salvos.length, 1);
    dlg.close();                                   // fecha no X e segue a lista
    await c.perfEditarParticipacao('2');           // abre o Conferir de B
    pct(dlg.els['#perf-aloc'], '100005', '75');
    const statusB = dlg.els['#perf-aloc-status'];
    for (const f of ouv['os-gravada']) f({id: '1', os: {id: '1'}, enviado: salvos[0], descartado: desfecho === 'gravada' ? [] : ['alocacao'], motivo: {alocacao: 'A pessoa de ID 100002 saiu antes da data desta O.S.'}});
    await envioA;
    // Caso ruim: o resultado de A fechava o diálogo de B e apagava a montagem dele.
    assert.equal(dlg.open, true, `${desfecho}: o Conferir de B continua aberto`);
    assert.equal(A.estado('perf:2').aloc.grupos[0].membros[0].cota, 7500, 'a montagem de B (75%) fica');
    assert.equal(statusB.textContent, '', 'nada de A escrito em B');
    assert.equal(A.estado('perf:1'), null, 'o estado de A foi solto');
    if (desfecho === 'gravada') assert.deepEqual(toasts.at(-1), ['Divisão gravada na O.S. 5001.', 'success']);
    else assert.match(toasts.at(-1)[0], /^O\.S\. 5001: O servidor não gravou a divisão: A pessoa de ID 100002 saiu antes/, 'o motivo de A vira aviso');
  }
  // O Conferir da MESMA O.S. reaberto enquanto o envio ia: o resultado de antes não apaga o de agora.
  const ouv = {};
  const lista = [osBase({equipe: ['100001', '100002']})];
  const t = tela({lista, loja: {on: (ev, f) => { (ouv[ev] = ouv[ev] || []).push(f); }, getQueue: () => [{action: 'upsert', os: {id: '1'}}]}});
  await t.c.perfEditarParticipacao('1');
  pct(t.dlg.els['#perf-aloc'], '100001', '70');
  const envio = t.dlg.els['#perf-aloc-ok'].onclick();
  await new Promise(r => setImmediate(r));
  t.dlg.close();
  await t.c.perfEditarParticipacao('1');
  pct(t.dlg.els['#perf-aloc'], '100001', '55');
  for (const f of ouv['os-gravada']) f({id: '1', os: {id: '1'}, enviado: t.salvos[0], descartado: []});
  await envio;
  assert.equal(t.dlg.open, true);
  assert.equal(t.A.estado('perf:1').aloc.grupos[0].membros[0].cota, 5500, 'a reabertura mantém o que está sendo montado');
});

/* ═══════════════ lente corretude, defeito 2 ═══════════════ */

test('revisão: Conferir de O.S. fora da janela busca só pelo número; acha a finalizada às 22h30 de SP e a lançada noutro dia', async () => {
  const os1 = osBase({id: 'a1', numero: '7001', equipe: ['100001', '100002'], finalizadaEm: '2026-07-16T01:30:00.000Z', rev: 3});   // 15/07 às 22:30 em SP
  const os2 = osBase({id: 'a2', numero: '7002', equipe: ['100001', '100002'], finalizadaEm: '2026-07-12T15:00:00.000Z', entregaLancada: {data: '2026-07-10'}, rev: 3});
  const os3 = osBase({id: 'a3', numero: '7003', equipe: ['100001', '100002'], finalizadaEm: '2026-07-20T15:00:00.000Z', rev: 3});
  // Outra O.S. que também casa com o número buscado ("7001" dentro de "17001"): vale a do id.
  const outra = osBase({id: 'z9', numero: '17001', equipe: ['100005'], finalizadaEm: '2026-03-02T15:00:00.000Z', rev: 1});
  const e = await edge('pcp-sync', banco([os1, os2, os3, outra]));
  const per = await e.call({action: 'performancePeriodo', de: '2026-07-01', ate: '2026-07-31'}, gestor);
  assert.equal(per.status, 200);
  assert.deepEqual(Object.fromEntries(per.registros.map(r => [r.id, r.dia])), {a1: '2026-07-15', a2: '2026-07-10', a3: '2026-07-20'});
  const historico = new Map(), buscas = [];
  const {c, A, dlg, run} = tela({loja: {
    getOS: id => historico.get(id) || null,
    buscarHistorico: async ({de, ate, q}) => { const r = await e.call({action: 'list', escopo: 'finalizadas', de, ate, q}, gestor); buscas.push([de, ate, q]); for (const o of r.os) historico.set(o.id, o); return {itens: r.os}; },
  }});
  run(`perfRemoto = {chave: '2026-10-01|2026-10-31', dados: ${JSON.stringify(per)}, fechamentos: [], carregando: false, erro: '', selecionado: '', tentado: true};`);
  for (const [id, numero] of [['a1', '7001'], ['a2', '7002'], ['a3', '7003']]) {
    historico.clear();   // cada O.S. vem da sua própria busca
    await c.perfEditarParticipacao(id);
    // Caso ruim: com de = até = dia da apuração, a1 e a2 não voltavam ("Conecte-se", com rede).
    assert.doesNotMatch(dlg.corpo, /não está neste aparelho/, id);
    assert.equal(dlg.titulo, 'Conferir divisão · O.S. ' + numero);
    assert.equal(A.estado('perf:' + id).osId, id, 'a O.S. certa, pelo id');
    dlg.close();
  }
  assert.deepEqual(buscas.map(b => b.slice(0, 2)), [['', ''], ['', ''], ['', '']], 'sem período na busca');
  // Com rede e sem a O.S. na resposta, a tela não manda "conectar": diz que a busca não a trouxe.
  run(`perfRemoto.dados.registros.push({...perfRemoto.dados.registros[0], id: 'x1', numero: '99999'})`);
  await c.perfEditarParticipacao('x1');
  assert.match(dlg.corpo, /a busca pelo número 99999 no servidor não a trouxe/);
  assert.doesNotMatch(dlg.corpo, /Conecte-se/);
});

/* ═══════════════ lente corretude, defeito 3 (decisão do dono) ═══════════════ */

test('revisão: O.S. antiga com nome sem ficha confirma pelo jeito antigo; o servidor confirma e o Fechar período passa', async () => {
  const fim = {finalizadaEm: '2026-09-20T15:00:00', entregaLancada: {data: '2026-09-20'}};
  const e = await edge('pcp-sync', banco([osBase({equipe: ['100001', 'Terceiro Fictício'], ...fim})]));
  const lista = [js(noServidor(e))];
  const {c, A, salvos, cfgs, cfg, dlg, toasts} = tela({lista});
  let foiAoRH = false;
  c.document = {querySelector: q => q === '[data-quadro="perf-rh"]' ? {open: false, scrollIntoView() { foiAoRH = true; }} : null};
  await c.perfEditarParticipacao('1');
  const box = dlg.els['#perf-aloc'], ok = dlg.els['#perf-aloc-ok'], status = dlg.els['#perf-aloc-status'];
  // Caso ruim: a F09 deixava o botão desligado e não havia como confirmar a O.S. (o Fechar período travava).
  assert.equal(ok.disabled, false, 'dá para confirmar');
  assert.equal(status.textContent, '');
  assert.match(semTags(box.innerHTML), /Esta O\.S\. tem nome sem ficha no RH\. A confirmação vale pelo jeito antigo; ligue o nome em Conferir nomes para gravar a divisão na O\.S\./);
  assert.match(box.innerHTML, /data-aloc-acao="ir-rh"[^>]*>Conferir nomes</);
  assert.match(box.innerHTML, /data-aloc-acao="ir-ficha"[^>]*>Abrir a ficha da O\.S\.</);
  assert.match(dlg.corpo, />Confirmar pelo jeito antigo</);
  // Mostra a divisão de quem está na O.S., com o nome sem ficha marcado.
  assert.match(box.innerHTML, /<b[^>]*>Ana<\/b>[\s\S]*?value="50"[\s\S]*<b[^>]*>Terceiro Fictício<\/b><span class="aloc-badges"><span class="aloc-badge alerta">sem ficha no RH<\/span>[\s\S]*?value="50"/);
  assert.match(box.innerHTML, /Total 100%/);
  // Edita: 70 para a Ana, o resto vai para o Terceiro; e 100% para um só é recusado.
  box.onchange({target: {dataset: {alocPctAntigo: '', p: '100001'}, value: '100'}});
  assert.equal(ok.disabled, true);
  assert.match(status.textContent, /^Para gravar: Toda pessoa da O\.S\. precisa de uma parte maior que 0%/);
  box.onchange({target: {dataset: {alocPctAntigo: '', p: '100001'}, value: '70'}});
  assert.equal(ok.disabled, false);
  assert.match(box.innerHTML, /data-p="Terceiro Fictício" data-aloc-k="pct:antigo:Terceiro Fictício" value="30"/);
  // A divisão nunca vai para a O.S. por este caminho.
  assert.equal((await A.gravarNaOS('perf:1', {usuario: 'Gestor'})).estado, 'invalida');
  await ok.onclick();
  assert.equal(salvos.length, 0, 'nada vai para os.alocacao');
  assert.equal(dlg.open, false, 'confirmou e fechou');
  assert.equal(cfgs.length, 1, 'uma gravação da participação');
  const p = cfgs[0].performancePCP.participacoes.find(x => x.id === '1');
  assert.deepEqual(p.membros.map(m => [m.chave, m.nome, m.percentual]), [['100001', 'Ana', 70], ['Terceiro Fictício', 'Terceiro Fictício', 30]]);
  assert.equal(p.por, 'Gestor Teste');
  assert.match(toasts.at(-1)[0], /Alteração salva no aparelho/);
  // O servidor aceita a participação (setCfg do pcp), confirma a O.S. por ela e o Fechar período passa.
  const base = js(e.db.pcp_config_global[0].config);
  const rs = await e.call({action: 'setCfg', cfg: {...base, performancePCP: cfgs[0].performancePCP}, baseCfg: base}, gestor);
  assert.equal(rs.status, 200, JSON.stringify(rs));
  await pausa(5);
  const per = await e.call({action: 'performancePeriodo', de: '2026-09-01', ate: '2026-09-29'}, gestor);
  const reg = per.registros.find(x => x.id === '1');
  assert.equal(reg.confirmado, true, JSON.stringify(reg));
  assert.equal(reg.fonte, 'participacao');
  assert.deepEqual(reg.membros.map(m => [m.chave, m.percentual]), [['100001', 70], ['Terceiro Fictício', 30]]);
  const f = await e.call({action: 'performanceFechar', de: '2026-09-01', ate: '2026-09-29', hash: per.hash, requestId: 'req-f09-jeito-antigo', motivo: 'fechar setembro', anterior: ''}, gestor);
  assert.equal(f.status, 200, JSON.stringify(f));
  // Reabrir a O.S. confirmada mostra o que foi confirmado (70/30), não um 50/50 novo.
  cfg.performancePCP = js(cfgs[0].performancePCP);
  await c.perfEditarParticipacao('1');
  assert.match(dlg.els['#perf-aloc'].innerHTML, /data-p="100001" data-aloc-k="pct:antigo:100001" value="70"/);
  assert.match(dlg.corpo, /Ela conta na performance e abre abaixo como foi confirmada/);
  // Conferir nomes continua levando ao quadro do RH.
  dlg.els['#perf-aloc'].onclick({target: alvo({alocAcao: 'ir-rh'})});
  assert.equal(foiAoRH, true);
  assert.doesNotMatch(dlg.corpo + box.innerHTML, /—/);
});

test('revisão: jeito antigo com divisão gravada de antes do nome: não confirma por cima dela e diz o que fazer', async () => {
  const velha = {...js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}])), em: '2026-09-18T12:00:00.000Z', desatualizada: true};
  const lista = [osBase({equipe: ['100001', '100002', 'Terceiro Fictício'], finalizadaEm: '2026-09-20T15:00:00', alocacao: velha})];
  const {c, cfgs, salvos, dlg} = tela({lista});
  await c.perfEditarParticipacao('1');
  // Caso ruim: a participação do blob não vale com divisão na O.S. (participacaoVale); gravar seria sucesso falso.
  assert.equal(dlg.els['#perf-aloc-ok'].disabled, true);
  assert.match(dlg.els['#perf-aloc-status'].textContent, /já tem uma divisão gravada, de antes de o nome entrar na equipe/);
  await dlg.els['#perf-aloc-ok'].onclick();
  assert.equal(cfgs.length + salvos.length, 0);
});

/* ═══════════════ lente corretude, defeito 4 ═══════════════ */

test('revisão: servidor recusa a divisão; o 2o Confirmar não acusa "outro aparelho" nem fecha com "Nada mudou"', async () => {
  const gravada = {...js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}])), em: '2026-10-02T16:00:00.000Z', por: 'Gestor Teste'};
  // (a) 400 de validação: a gravação FICA na fila (store.js anota o motivo e avisa item-pendente).
  {
    const ouv = {}, fila = [];
    const lista = [osBase({equipe: ['100001', '100002'], alocacao: js(gravada)})];
    const t = tela({lista, loja: {on: (ev, f) => { (ouv[ev] = ouv[ev] || []).push(f); }, getQueue: () => fila,
      saveOS: o => {
        t.salvos.push(js(o)); lista[0] = o;
        fila.splice(0, fila.length, {action: 'upsert', os: js(o), recusa: {status: 400, motivo: 'O retorno não pode ser anterior à saída.'}});
        queueMicrotask(() => { for (const f of ouv['item-pendente'] || []) f({item: {action: 'upsert', os: js(o)}, motivo: 'O retorno não pode ser anterior à saída.', status: 400}); });
      }}});
    const {c, dlg, toasts} = t;
    await c.perfEditarParticipacao('1');
    const ok = dlg.els['#perf-aloc-ok'], st = dlg.els['#perf-aloc-status'];
    pct(dlg.els['#perf-aloc'], '100001', '70');
    await ok.onclick();
    assert.match(st.textContent, /A gravação fica na fila deste aparelho/);
    // Caso ruim 1: o segundo Confirmar dizia "foi mudada em outro aparelho" (foi este).
    await ok.onclick();
    assert.doesNotMatch(st.textContent, /outro aparelho/);
    assert.match(st.textContent, /^A gravação desta O\.S\. ainda não foi aceita pelo servidor: ela está na fila deste aparelho, com esta divisão\. Motivo da recusa: O retorno não pode ser anterior à saída\. Nada novo foi enviado\./);
    assert.equal(t.salvos.length, 1, 'nada novo foi enviado');
    // Caso ruim 2: depois do Recomeçar, "Nada mudou: a divisão gravada continua valendo" em verde, com ela presa na fila.
    dlg.els['#perf-aloc-recomecar'].onclick();
    await ok.onclick();
    assert.ok(!toasts.some(([m]) => /Nada mudou/.test(m)), JSON.stringify(toasts));
    assert.equal(dlg.open, true);
    assert.match(st.textContent, /^A gravação desta O\.S\. ainda não foi aceita pelo servidor/);
  }
  // (b) Recusa definitiva (sai da fila): o segundo Confirmar repete a recusa, não diz "Nada mudou".
  {
    const ouv = {};
    const lista = [osBase({equipe: ['100001', '100002'], alocacao: js(gravada)})];
    const t = tela({lista, loja: {on: (ev, f) => { (ouv[ev] = ouv[ev] || []).push(f); }, getQueue: () => [],
      trySync: async () => { for (const f of ouv['item-recusado'] || []) f({item: {action: 'upsert', os: js(lista[0])}, motivo: 'Esta O.S. foi excluída.', status: 422}); }}});
    const {c, dlg, toasts} = t;
    await c.perfEditarParticipacao('1');
    pct(dlg.els['#perf-aloc'], '100001', '70');
    await dlg.els['#perf-aloc-ok'].onclick();
    assert.match(dlg.els['#perf-aloc-status'].textContent, /O servidor recusou a gravação: Esta O\.S\. foi excluída\./);
    dlg.els['#perf-aloc-recomecar'].onclick();
    await dlg.els['#perf-aloc-ok'].onclick();
    assert.ok(!toasts.some(([m]) => /Nada mudou/.test(m)), JSON.stringify(toasts));
    assert.match(dlg.els['#perf-aloc-status'].textContent, /O servidor recusou a gravação: Esta O\.S\. foi excluída\./);
    assert.equal(t.salvos.length, 1);
  }
});

/* ═══════════════ lente corretude, defeito 6 ═══════════════ */

test('revisão: ID repetido vindo da O.S. antiga trava a gravação e marca o chip, como no seletor', async () => {
  const lista = [osBase({equipe: ['100001', '100009']})];
  const {A, salvos} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'lider', g: '0', p: '100001'});
  // Caso ruim: nada travava e a divisão ia (o servidor a descartava pelo ID em dois cadastros).
  assert.match(A.bloqueio('t'), /^Rita: ID repetido no RH \(ficha e contrato\)\. O RH precisa conferir o CPF\. Até lá, tire essa pessoa da divisão para gravar\./);
  const chip = /<li class="aloc-chip[^"]*">(?:(?!<\/li>)[\s\S])*?ID 100009[\s\S]*?<\/li>/.exec(A.html('t'))[0];
  assert.match(chip, /<span class="aloc-badge alerta">ID repetido no RH<\/span>/);
  assert.equal((await A.gravarNaOS('t', {usuario: 'Gestor', prazoMs: 20})).estado, 'invalida');
  assert.equal(salvos.length, 0, 'nada foi enviado');
  // Tirar a Rita libera.
  A.executar('t', {alocAcao: 'remover', g: '0', p: '100009'});
  assert.equal(A.bloqueio('t'), '');
});

/* ═══════════════ lente corretude, defeito 7 ═══════════════ */

test('revisão: o aviso da divisão desatualizada mostra o dia de São Paulo, não o dia UTC do carimbo', () => {
  const velha = {...js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}])), em: '2026-10-01T01:30:00.000Z', por: 'Gestor Teste', desatualizada: true};
  const lista = [osBase({equipe: ['100001', '100003'], alocacao: velha})];
  const {A} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  // Caso ruim: gravada às 22:30 de 30/09 em SP, a tela dizia 01/10 (o dia UTC).
  assert.match(A.html('t'), /A divisão gravada por Gestor Teste em 30\/09\/2026 não bate mais/);
  assert.equal(A.dataBR('2026-10-01T02:59:00.000Z'), '30/09/2026');
  assert.equal(A.dataBR('2026-10-01T03:00:00.000Z'), '01/10/2026');
  assert.equal(A.dataBR('2026-09-29'), '29/09/2026', 'dia puro não passa pelo fuso');
  assert.equal(A.dataBR(''), '');
});
