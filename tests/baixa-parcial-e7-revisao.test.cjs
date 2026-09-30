/* REVISÃO DA E7 (30/09/2026): os defeitos que as duas revisões adversariais
   acharam na baixa do ERP que respeita a entrega parcial, cada teste
   começando pelo caso ruim. As correções foram decididas:
     D1  a marca da baixa trocava o atualizadoEm sem subir o rev: com o PC de
         relógio adiantado, a marca não chegava a aparelho nenhum
     D2  o reenvio da mesma gravação virava conflito quando a baixa marcava
         no meio
     D3  com "Sobrescrever", o lote da cópia velha punha o item com problema
         aberto em saldo 0, preso
     1   "Entregar o saldo em DD/MM" não levava a data do ERP para a conta da
         O.S. (a baixa seguinte finalizava e ela contava no dia da baixa)
     2   o "Confirmar baixa" do card passava por cima da lista na O.S. que
         veio pela carteira
     3   o Finalizar da ficha e do card ignorava o aviso do ERP
     4   a Performance deixava de ver a O.S. segurada
     5   sem data de entrega do ERP, a tela usava o dia do primeiro aviso de
         qualquer situação
   Bancadas: o store de verdade (store.js) falando com o pcp-sync de verdade,
   e o pcp-mubisys de verdade no MESMO banco (helpers/edge.cjs); a tela
   (app.js, casa.js, performance.js) com esse store, num DOM de mentira.
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const E = require('../entrega-item.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const tique = (ms = 2) => new Promise(r => setTimeout(r, ms));
const DIA_ERP = '2026-09-25';
const PROBLEMA_NO_LOTE = 'Este item está com problema aberto: o saldo dele não entra no lote. Resolva o problema no item.';

const marca = (id, qtde = 1, dia = '2026-09-20', extra = {}) => ({id, tipo: 'entregue', qtde, dia, via: 'gestao', por: 'Gestor Teste', porId: '111222', em: dia + 'T12:00:00.000Z', ...extra});
const item = (num, k, entregas) => ({uid: `${num}:${k}:1`, item: String(k), descricao: 'Placa fictícia ' + k, qtde: '1', subtotal: '100.00', ...(entregas ? {entregas} : {})});
// Cinco itens de R$ 100; `marcas[k]` são as marcas do item k (1 a 5).
const itens = (num, marcas = {}) => [1, 2, 3, 4, 5].map(k => item(num, k, marcas[k]));
const doisDeCinco = num => itens(num, {1: [marca('m' + num + '-1')], 2: [marca('m' + num + '-2')]});
// A O.S. do ERP, aberta no PCP, com 2 de 5 itens entregues por marca.
const osAberta = (id, num, extra = {}) => ({id, numero: num, rev: 4, origemMubisys: true, tipo: 'externo', cliente: 'Cliente Fictício ' + num,
  servico: 'Fachada fictícia', equipe: [], instalacao: {data: '2026-09-01'}, valorTotal: 500, itens: doisDeCinco(num),
  atualizadoEm: '2026-09-30T11:00:00.000Z', atualizadoPor: 'Gestor Teste', ...extra});
// O checklist completo do Finalizar (a mesma O.S. "pronta" da revisão da E4).
const PRONTA = {liberadoPCP: true, confirmacao: 'Confirmado', embarqueConferidoPor: 'Gestor Teste', produtosConferidosPor: 'Gestor Teste',
  ferramentasConferidas: true, carroLiberado: true, horaSaida: '08:00', saidaEm: '2026-09-29T11:00:00.000Z', instalacaoOK: true,
  conferidoPor: 'Gestor Teste', fotosCheckinIds: ['foto-saida'], fotosRetornoIds: ['foto-volta'], retornoEm: '2026-09-29T19:00:00.000Z',
  horaRetorno: '16:00', equipe: ['100001']};
const osPronta = (id, num, extra = {}) => { const o = {...osAberta(id, num), ...PRONTA, ...extra}; delete o.instalacao; return o; };
const linha = (reg, atualizado_em = '2026-09-30T11:00:00.000Z') => ({id: reg.id, colecao: 'os', apagado: false, atualizado_em, registro: js(reg)});
const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('gestor-teste', 'Gestor Teste', 'gestor', '111.222.333-44'), ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111')];
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};

/* O SERVIDOR: pcp-sync e pcp-mubisys de verdade no MESMO banco. O ERP da
   bancada responde o que cada teste manda: [{numero, status, data}]. */
async function servidor(registros, erp = []) {
  const sync = await edge('pcp-sync', {pcp_registros: registros, registros: js(FICHAS),
    pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
  const mub = await edge('pcp-mubisys', {});
  mub.db.pcp_registros = sync.db.pcp_registros;
  mub.run('console = {...console, warn(){}, log(){}}');
  const responder = lista => mub.run(`erpGet = async () => ({data:${JSON.stringify(lista.map(x => ({sequencial_ordem: x.numero, status: x.status, data_entregue: x.data || ''})))}})`);
  responder(erp);
  return {sync, mub, erp: responder,
    baixar: () => mub.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`),
    gravada: id => js(sync.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro)};
}
// O relógio do pcp-mubisys (a hora em que a baixa roda).
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);

/* O APARELHO: o store de verdade, com o disco de mentira. `responder` é o
   servidor (quem quiser perde a resposta ou fica sem rede). */
function aparelho({lista = [], responder, tela = false, papel = 'pcp'}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({
    get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; },
    STATE: {user: {papel, nome: 'Gestor Teste'}}, esc: s => String(s ?? ''), toast() {}, nowISO: () => new Date().toISOString(),
    document: {getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, body: {classList: {add() {}, remove() {}, contains: () => false}}}});
  const arquivos = ['store.js', 'operacao.js', ...(tela ? ['entrega-item.js', 'casa.js'] : [])];
  for (const f of arquivos) vm.runInContext(ler(f), ctx, {filename: f});
  const S = vm.runInContext('STORE', ctx);
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await tique(); } };
  return {S, esvaziar, run: c => vm.runInContext(c, ctx)};
}

/* A TELA DA GESTÃO: app.js, casa.js e performance.js com o store de verdade
   falando com o pcp-sync do `srv`, num DOM de mentira. Os diálogos ficam
   observáveis pelo id. `pacotes`: os entregues do ERP por mês. */
function domFalso() {
  const porId = new Map();
  const el = tag => ({tag, id: '', className: '', innerHTML: '', textContent: '', value: '', dataset: {}, hidden: false, style: {},
    classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); }, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  // Os controles de dentro do Lançar, que a tela liga pelo id depois de desenhar a caixa.
  const dentro = new Map(['lancar-x', 'lancar-form', 'lancar-aloc'].map(id => [id, el('div')]));
  const body = el('body');
  const doc = {activeElement: null, body, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: id => porId.get(id) || dentro.get(id) || null, createElement: tag => el(tag)};
  return {doc, porId};
}
async function telaCompleta(srv, {papel = 'pcp', cracha = GESTOR, pacotes = null} = {}) {
  const e = srv.sync;
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const conflitos = [];
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}}, location: {reload() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_u, req) => { const r = await e.call(JSON.parse(req.body), cracha); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; },
    document: d.doc, confirm: () => true});
  for (const f of ['store.js', 'operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'app.js', 'casa.js', 'performance.js']) vm.runInContext(ler(f), ctx, {filename: f});
  const run = c => vm.runInContext(c, ctx);
  const toasts = [];
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:${JSON.stringify(cracha.nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; renderEntregas = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = (m, fn) => { __toasts.push([m, 'desfazer']); __desfazer = fn; };`);
  const S = run('STORE');
  if (pacotes) S.entreguesMes = m => pacotes[m] || null;
  S.onConflict((local, remoto) => conflitos.push([local, remoto]));
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await tique(); } };
  return {S, ctx, run, d, toasts, conflitos, esvaziar,
    abrir: id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}

/* ───────────── D1 e D2: a marca da baixa não mexe no atualizadoEm ───────────── */

test('revisão D1: com o PC de relógio adiantado, a marca da baixa chega ao aparelho (pull incremental e completo)', async () => {
  const doPC = new Date(Date.now() + 40 * 60000).toISOString();   // o PC da fábrica 40 minutos adiantado gravou por último
  const reg = osAberta('mub-501', '501', {atualizadoEm: doPC});
  const srv = await servidor([linha(reg)], [{numero: '501', status: 'ENTREGUE', data: DIA_ERP}]);
  const a = aparelho({lista: [js(reg)], responder: q => srv.sync.call(q, GESTOR), tela: true});
  await a.S.pronto();
  const r0 = await a.S.pull(null, {completo: true});
  assert.ok(r0.completo, JSON.stringify(r0));
  assert.equal(a.run('listaErpComSaldo(STORE.getAllOS()).length'), 0);
  await tique(5);
  const res = await srv.baixar();
  assert.equal(res.marcadasComSaldo, 1, JSON.stringify(res));
  const g = srv.gravada('mub-501');
  assert.ok(g.erpComSaldo && !g.finalizadaEm);
  // Caso ruim: o pull incremental de todo dia (mesmo rev; a marca não é edição de ninguém).
  const r1 = await a.S.pull();
  assert.ok(r1.incremental, JSON.stringify(r1));
  assert.deepEqual(js(a.S.getOS('mub-501').erpComSaldo || null), g.erpComSaldo, 'a marca da baixa não chegou ao aparelho');
  assert.equal(a.run('listaErpComSaldo(STORE.getAllOS()).length'), 1, 'a lista "ERP diz entregue, PCP tem saldo" aparece no aparelho');
  // Nada além da marca entra por essa via: o resto da cópia é o que era.
  const {erpComSaldo: _m, ...resto} = js(a.S.getOS('mub-501'));
  assert.deepEqual(resto, js(reg));
  // O registro no servidor: rev, atualizadoEm e atualizadoPor ficam os gravados.
  assert.equal(g.rev, 4);assert.equal(g.atualizadoEm, doPC);assert.equal(g.atualizadoPor, 'Gestor Teste');
  // O pull completo (outro aparelho, com a cópia de antes da marca) também traz.
  const b = aparelho({lista: [js(reg)], responder: q => srv.sync.call(q, GESTOR), tela: true});
  await b.S.pronto();
  await b.S.pull(null, {completo: true});
  assert.deepEqual(js(b.S.getOS('mub-501').erpComSaldo || null), g.erpComSaldo);
  assert.equal(b.run('listaErpComSaldo(STORE.getAllOS()).length'), 1);
});

test('revisão D2: o reenvio da mesma gravação depois da marca da baixa volta "repetido", sem conflito', async () => {
  const reg = osAberta('mub-502', '502');
  const srv = await servidor([linha(reg)], [{numero: '502', status: 'ENTREGUE', data: DIA_ERP}]);
  let perder = true;
  const respostas = [], conflitos = [];
  const a = aparelho({lista: [js(reg)], responder: async q => {
    const r = await srv.sync.call(q, GESTOR);
    if (q.action === 'upsert') {
      respostas.push({ok: !!r.ok, repetido: !!r.repetido, conflito: !!r.conflito});
      if (perder) { perder = false; throw new Error('a resposta se perdeu no wifi da fábrica'); }
    }
    return r;
  }});
  a.S.onConflict((local, remoto) => conflitos.push([local, remoto]));
  await a.S.pronto();
  const ed = js(a.S.getOS('mub-502'));
  ed.obsPCP = 'cliente pediu para ligar antes';ed.atualizadoEm = new Date().toISOString();ed.atualizadoPor = 'Gestor Teste';
  a.S.saveOS(ed);
  for (let i = 0; i < 100 && respostas.length < 1; i++) await tique();
  await tique(5);
  assert.equal(srv.gravada('mub-502').obsPCP, 'cliente pediu para ligar antes', 'a primeira gravação entrou; só a resposta se perdeu');
  assert.equal(a.S.getQueue().length, 1, 'o aparelho não sabe e vai reenviar');
  // No meio, a baixa do ERP marca a O.S.
  const res = await srv.baixar();
  assert.equal(res.marcadasComSaldo, 1, JSON.stringify(res));
  // Caso ruim: o reenvio da mesma gravação.
  await a.esvaziar();
  assert.deepEqual(respostas[1], {ok: true, repetido: true, conflito: false}, 'o reenvio virou conflito contra a própria escrita');
  assert.equal(conflitos.length, 0);
  assert.equal(a.S.getQueue().length, 0);
  const g = srv.gravada('mub-502');
  assert.equal(g.rev, 5);assert.equal(g.obsPCP, 'cliente pediu para ligar antes');assert.equal(g.atualizadoEm, ed.atualizadoEm);
  assert.ok(g.erpComSaldo, 'a marca da baixa fica');
  assert.deepEqual(js(a.S.getOS('mub-502').erpComSaldo || null), g.erpComSaldo, 'e a resposta do reenvio a traz ao aparelho');
});

test('revisão D1: com gravação pendente na fila, o campo do servidor é copiado e a edição pendente não se perde', async () => {
  const reg = osAberta('mub-503', '503');
  const srv = await servidor([linha(reg)], [{numero: '503', status: 'ENTREGUE', data: DIA_ERP}]);
  let semRede = true, tentou = 0;
  const a = aparelho({lista: [js(reg)], tela: true, responder: async q => {
    if (q.action === 'upsert' && semRede) { tentou++; throw new Error('sem rede para gravar'); }
    return srv.sync.call(q, GESTOR);
  }});
  await a.S.pronto();
  await a.S.pull(null, {completo: true});
  const ed = js(a.S.getOS('mub-503'));
  ed.obsPCP = 'nota que ainda não subiu';ed.atualizadoEm = new Date().toISOString();ed.atualizadoPor = 'Gestor Teste';
  a.S.saveOS(ed);
  for (let i = 0; i < 100 && !tentou; i++) await tique();
  await tique(5);
  const filaAntes = js(a.S.getQueue());
  assert.equal(filaAntes.length, 1);
  await tique(5);
  await srv.baixar();
  const m = srv.gravada('mub-503').erpComSaldo;
  assert.ok(m);
  // Caso ruim: o pull (incremental) com a O.S. pendente na fila.
  const r = await a.S.pull();
  assert.ok(r.incremental, JSON.stringify(r));
  const local = a.S.getOS('mub-503');
  assert.deepEqual(js(local.erpComSaldo || null), m, 'a marca do servidor não chegou à O.S. pendente');
  assert.equal(local.obsPCP, 'nota que ainda não subiu', 'a edição pendente ficou');
  assert.equal(local.atualizadoEm, ed.atualizadoEm);
  assert.deepEqual(js(a.S.getQueue()), filaAntes, 'a fila não foi mexida');
  assert.equal(a.run('listaErpComSaldo(STORE.getAllOS()).length'), 1);
  // O pull completo não muda nada de novo, e a fila sobe sem conflito.
  await a.S.pull(null, {completo: true});
  assert.equal(a.S.getOS('mub-503').obsPCP, 'nota que ainda não subiu');
  semRede = false;
  await a.esvaziar();
  const g = srv.gravada('mub-503');
  assert.equal(g.obsPCP, 'nota que ainda não subiu');assert.deepEqual(g.erpComSaldo, m);assert.equal(a.S.getQueue().length, 0);
});

/* ───────────── D3: o lote não passa por cima do problema aberto ───────────── */

test('revisão D3: o "Sobrescrever" da cópia velha não põe em lote o item com problema aberto (200, descartado e aviso)', async () => {
  const prob = {id: 'p3', tipo: 'problema', dia: '2026-09-28', motivo: 'Estrutura amassada no transporte', via: 'balcao', por: 'Operador Teste', em: '2026-09-28T12:00:00.000Z'};
  const erpComSaldo = {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|' + DIA_ERP, desde: '2026-09-26T10:00:00.000Z', em: '2026-09-26T10:00:00.000Z'};
  const copiaPC = osAberta('mub-507', '507', {erpComSaldo});          // a cópia do PC, de antes do problema
  const noServidor = {...js(copiaPC), rev: 5, itens: copiaPC.itens.map((i, k) => k === 2 ? {...i, entregas: [prob]} : i)};
  const srv = await servidor([linha(noServidor)]);
  // O PC toca "Entregar o saldo" na cópia velha: lote nos itens 3, 4 e 5.
  const lote = k => ({id: 'lote-' + k, tipo: 'entregue', qtde: 1, dia: DIA_ERP, via: 'lote', por: 'Gestor Teste', em: '2026-09-30T13:00:00.000Z'});
  const envio = {...js(copiaPC), atualizadoEm: '2026-09-30T13:00:00.000Z', itens: copiaPC.itens.map((i, k) => k > 1 ? {...i, entregas: [lote(k + 1)]} : i)};
  const r1 = await srv.sync.call({action: 'upsert', os: envio}, GESTOR);
  assert.equal(r1.conflito, true, 'a cópia velha vira conflito');
  // Caso ruim: "Sobrescrever".
  const r2 = await srv.sync.call({action: 'upsert', os: {...envio, rev: 5}}, GESTOR);
  assert.equal(r2.status, 200, JSON.stringify(r2));
  const g = srv.gravada('mub-507');
  const s3 = E.situacaoItem(g.itens[2], g);
  assert.ok(!(s3.situacao === 'problema' && s3.saldo === 0), 'o item ficou preso: problema aberto com saldo 0');
  assert.equal(s3.situacao, 'problema');assert.equal(s3.saldo, 1, 'o saldo do item com problema continua segurado');
  assert.deepEqual(g.itens[2].entregas.map(x => x.id), ['p3']);
  assert.deepEqual(r2.descartado, ['entregas']);
  assert.deepEqual(r2.entregasRecusadas.map(x => x.id), ['lote-3']);
  assert.equal(r2.entregasRecusadas[0].motivo, PROBLEMA_NO_LOTE);
  assert.deepEqual(g.itens.slice(3).map(i => i.entregas.map(x => x.via)), [['lote'], ['lote']], 'os outros itens entram');
  assert.equal(E.lancamentosDaOS(g, {liquido: '500.00'}).retido, 10000, 'os R$ 100 do item com problema ficam retidos');
});

test('revisão D3: as duas cópias do motor recusam o lote no item com problema aberto, com a mesma frase; a marca no item segue valendo', async () => {
  const S = (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
  for (const [nome, M] of [['aparelho', E], ['servidor', S]]) {
    const it = {uid: '1:1:1', item: '1', descricao: 'Placa', qtde: '2', subtotal: '100', entregas: [{id: 'p', tipo: 'problema', dia: '2026-09-28', motivo: 'Amassado', via: 'gestao'}]};
    const os = {id: 'x', tipo: 'externo', itens: [it]};
    const ctx = {papel: 'pcp', os, hoje: '2026-09-30'};
    const v = M.validarEvento({id: 'l1', tipo: 'entregue', qtde: 2, dia: '2026-09-29', via: 'lote'}, it, ctx);
    assert.equal(v.ok, false, nome + ': o lote passou por cima do problema');
    assert.equal(v.erro, PROBLEMA_NO_LOTE, nome);
    // A marca da gestão NO ITEM (sem lote) resolve o problema, como sempre.
    const g = M.validarEvento({id: 'g1', tipo: 'entregue', qtde: 2, dia: '2026-09-29'}, it, ctx);
    assert.equal(g.ok, true, nome);assert.equal(g.evento.via, 'gestao');
    // Sem problema, o lote passa.
    assert.equal(M.validarEvento({id: 'l2', tipo: 'entregue', qtde: 2, dia: '2026-09-29', via: 'lote'}, {...it, entregas: []}, ctx).evento.via, 'lote', nome);
  }
});

/* ───────────── 1. a data do ERP vai para a conta da O.S. ───────────── */

test('revisão 1: "Entregar o saldo em 29/09" decidido depois: a O.S. conta em 29/09 e o Lançar cita e propõe 29/09', async () => {
  const reg = osAberta('mub-1', '1', {itens: itens('1', {1: [marca('m1', 1, '2026-09-27')], 2: [marca('m2', 1, '2026-09-27')]})});
  const srv = await servidor([linha(reg, '2026-09-28T10:00:00Z')], [{numero: '1', status: 'ENTREGUE', data: '2026-09-29'}]);
  relogio(srv.mub, '2026-09-29T20:00:00Z');
  const b1 = await srv.baixar();
  assert.equal(b1.marcadasComSaldo, 1, JSON.stringify(b1));
  // A gestão entrega o saldo pela lista, na data do ERP, e o aparelho sobe.
  const t = await telaCompleta(srv);
  const r = t.run(`entregarSaldoERP('mub-1','ENTREGUE|2026-09-29')`);
  assert.equal(r.erro, '', r.erro);
  await t.esvaziar();
  assert.deepEqual(srv.gravada('mub-1').itens.map(i => i.entregas.map(m => m.dia).join()), ['2026-09-27', '2026-09-27', '2026-09-29', '2026-09-29', '2026-09-29']);
  // A baixa de 02/10 não vê mais parcial e finaliza a O.S. nesse dia.
  relogio(srv.mub, '2026-10-02T16:00:00Z');
  const b2 = await srv.baixar();
  assert.equal(b2.baixadas, 1, JSON.stringify(b2));
  const g = srv.gravada('mub-1');
  assert.equal(g.finalizadaEm.slice(0, 10), '2026-10-02');
  const t2 = await telaCompleta(srv);
  assert.deepEqual(js(t2.run(`classificarEntregas(STORE.getAllOS()).aLancar.map(o => o.numero)`)), ['1']);
  // Caso ruim: a O.S. contava em outubro (regra nova) com os itens de setembro.
  assert.equal(t2.run(`diaEntrega(STORE.getOS('mub-1'))`), '2026-09-29');
  t2.run(`lancarEntregaManual('mub-1')`);
  const caixa = t2.d.porId.get('lancar-box');
  assert.ok(caixa, 'o Lançar abriu');
  assert.match(caixa.innerHTML, /O ERP baixou em 29\/09\./);
  assert.match(caixa.innerHTML, /name="data" type="date" required value="2026-09-29"/);
});

test('revisão 1: sem data do ERP, com todo item marcado, vale o último dia de marca; sem marca, o dia da baixa, como antes', async () => {
  const todos = osAberta('mub-2', '2', {itens: itens('2', {1: [marca('a1', 1, '2026-09-22')], 2: [marca('a2', 1, '2026-09-24')], 3: [marca('a3', 1, '2026-09-23')],
    4: [marca('a4', 1, '2026-09-22')], 5: [{id: 'c5', tipo: 'cancelado', dia: '2026-09-26', motivo: 'Cliente desistiu', via: 'gestao'}]})});
  const semMarca = osAberta('mub-3', '3', {itens: itens('3')});
  const srv = await servidor([linha(todos), linha(semMarca)], [{numero: '2', status: 'FINALIZADO'}, {numero: '3', status: 'FINALIZADO'}]);
  relogio(srv.mub, '2026-10-01T16:00:00Z');
  const b = await srv.baixar();
  assert.equal(b.baixadas, 2, JSON.stringify(b));
  const t = await telaCompleta(srv);
  assert.equal(t.run(`diaEntrega(STORE.getOS('mub-2'))`), '2026-09-24', 'o último dia de marca, e não o dia da baixa');
  assert.equal(t.run(`diaEntrega(STORE.getOS('mub-3'))`), '2026-10-01', 'sem marca: o dia da baixa, como sempre');
});

/* ───────────── 2. o card não passa por cima da lista ───────────── */

test('revisão 2: na O.S. com entrega parcial, o card não oferece "Confirmar baixa"; card e ficha dizem o que o ERP disse, nos dois caminhos', async () => {
  const carteira = osAberta('mub-95', '95', {erpSaiuDaCarteiraEm: '2026-09-28T13:20:00.000Z'});
  const pelaBaixa = osAberta('mub-96', '96', {erpComSaldo: {status: 'ENTREGUE', dataEntregue: '2026-09-28', selo: 'ENTREGUE|2026-09-28', desde: '2026-09-29T10:00:00.000Z', em: '2026-09-29T10:00:00.000Z'}});
  const semMarca = osAberta('mub-97', '97', {erpSaiuDaCarteiraEm: '2026-09-28T13:20:00.000Z', itens: itens('97')});
  const srv = await servidor([linha(carteira), linha(pelaBaixa), linha(semMarca)]);
  const pacotes = {'2026-09': {v: 3, os: [{numero: '95', data: '2026-09-28', valor: 500}, {numero: '97', data: '2026-09-28', valor: 500}]}};
  const t = await telaCompleta(srv, {pacotes});
  const card = id => t.run(`osCardHTML(STORE.getOS(${JSON.stringify(id)}))`);
  // Caso ruim: o "Confirmar baixa" na O.S. da carteira que está na lista.
  assert.doesNotMatch(card('mub-95'), /data-erp-baixa/, 'o card oferece "Confirmar baixa" por cima da lista');
  const FRASE = /O ERP diz entregue em 28\/09<\/b> e o PCP tem saldo: decida em Entregas\./;
  for (const id of ['mub-95', 'mub-96']) {
    assert.match(card(id), FRASE, id);
    assert.match(card(id), /data-erp-saldo-lista/, id + ': o link para a lista');
    assert.match(t.run(`blocoItens(STORE.getOS(${JSON.stringify(id)}), false, false)`), FRASE, id + ': a ficha cita o ERP do mesmo jeito');
  }
  // Sem marca parcial, o card da carteira segue como antes.
  assert.match(card('mub-97'), /data-erp-baixa="mub-97"/);
  // O botão de um card desenhado antes não finaliza: relida, a O.S. vai para a decisão.
  t.run(`erpConfirmarBaixa('mub-95')`);
  await t.esvaziar();
  assert.ok(!srv.gravada('mub-95').finalizadaEm, 'a baixa confirmada passou por cima da lista');
  assert.ok(!t.S.getOS('mub-95').finalizadaEm);
  assert.equal(t.run(`listaErpComSaldo(STORE.getAllOS()).map(x => x.os.id).sort().join()`), 'mub-95,mub-96');
  // Quem não decide lê o mesmo aviso, sem o link.
  const op = await telaCompleta(srv, {papel: 'operacao', cracha: {papel: 'operacao', nome: 'Operador Teste', sub: 'oper'}, pacotes});
  const cardOp = op.run(`osCardHTML(STORE.getOS('mub-95'))`);
  assert.match(cardOp, /O ERP diz entregue em 28\/09<\/b> e o PCP tem saldo: a gestão decide em Entregas\./);
  assert.doesNotMatch(cardOp, /data-erp-saldo-lista|data-erp-baixa/);
});

/* ───────────── 3. o Finalizar respeita o aviso do ERP ───────────── */

test('revisão 3: o Finalizar do card, com o ERP dizendo entregue, marca o saldo na data do ERP; "Manter aberta" grava a decisão da lista', async () => {
  const erp = {status: 'ENTREGUE', dataEntregue: '2026-09-27', selo: 'ENTREGUE|2026-09-27', desde: '2026-09-28T10:00:00.000Z', em: '2026-09-28T10:00:00.000Z'};
  const srv = await servidor([linha(osPronta('mub-70', '70', {erpComSaldo: erp})), linha(osPronta('mub-71', '71', {erpComSaldo: js(erp)}))]);
  const t = await telaCompleta(srv);
  // A pergunta de verdade cita o ERP e oferece a data dele.
  t.run(`perguntarSaldoEntrega(STORE.getOS('mub-70'), saldoAFinalizar(STORE.getOS('mub-70')), () => {})`);
  const html = t.d.porId.get('saldo-entrega-box').innerHTML;
  assert.doesNotMatch(html, /entregues hoje/, 'a pergunta oferece a data de hoje, e não a do ERP');
  assert.match(html, /Marcar os 3 restantes como entregues em 27\/09 \(data do ERP\)/);
  assert.match(html, /O ERP diz entregue em 27\/09 e o PCP tem saldo\./);
  t.run(`perguntarSaldoEntrega = (os, p, cb) => cb(__escolha);
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); };`);
  // "Marcar": as marcas saem no dia do ERP.
  t.ctx.__escolha = 'marcar';
  t.run(`finalizarServicoDoCard('mub-70')`);
  await t.esvaziar();
  const g = srv.gravada('mub-70');
  assert.ok(g.finalizadaEm);
  assert.deepEqual(g.itens.slice(2).map(i => i.entregas.map(m => m.dia)), [['2026-09-27'], ['2026-09-27'], ['2026-09-27']]);
  assert.ok(t.toasts.some(([m]) => /Serviço finalizado 🏁 · 3 itens marcados em 27\/09, a data do ERP/.test(m)), JSON.stringify(t.toasts));
  // "Manter aberta, entrega parcial": a mesma decisão da lista, carimbada pelo servidor.
  assert.equal(t.run(`listaErpComSaldo(STORE.getAllOS()).map(x => x.os.id).join()`), 'mub-71');
  t.ctx.__escolha = 'manter';
  t.run(`finalizarServicoDoCard('mub-71')`);
  assert.equal(t.run(`listaErpComSaldo(STORE.getAllOS()).length`), 0, 'a O.S. seguia na lista pedindo a decisão já tomada');
  await t.esvaziar();
  const g2 = srv.gravada('mub-71');
  assert.ok(!g2.finalizadaEm);
  assert.equal(g2.erpSaldoDecisao.tipo, 'manter');assert.equal(g2.erpSaldoDecisao.selo, 'ENTREGUE|2026-09-27');assert.equal(g2.erpSaldoDecisao.porId, '111222');
  assert.equal(t.conflitos.length, 0);
  assert.match(t.run(`osCardHTML(STORE.getOS('mub-71'))`), /a gestão manteve a O\.S\. aberta: entrega parcial/);
});

test('revisão 3: o "Manter aberta" da ficha grava a decisão no próprio rascunho, e a gravação seguinte da ficha não vira conflito', async () => {
  const erp = {status: 'ENTREGUE', dataEntregue: '2026-09-27', selo: 'ENTREGUE|2026-09-27', desde: '2026-09-28T10:00:00.000Z', em: '2026-09-28T10:00:00.000Z'};
  const srv = await servidor([linha(osPronta('mub-72', '72', {erpComSaldo: erp}))]);
  const t = await telaCompleta(srv);
  t.abrir('mub-72');
  t.run(`perguntarSaldoEntrega = (os, p, cb) => cb('manter');`);
  // Caso ruim: o "Manter aberta" da ficha só dizia "continua aberta".
  t.run('finalizarDaFicha(false)');
  assert.equal(t.run(`listaErpComSaldo(STORE.getAllOS()).length`), 0, 'a O.S. seguia na lista');
  await t.esvaziar();
  assert.equal(srv.gravada('mub-72').erpSaldoDecisao.selo, 'ENTREGUE|2026-09-27');
  // A ficha segue aberta e grava outra coisa: sem conflito contra a própria escrita.
  t.run(`_modalDraft.obsPCP = 'cliente liga amanhã'; saveDraft();`);
  await t.esvaziar();
  assert.equal(t.conflitos.length, 0);
  const g = srv.gravada('mub-72');
  assert.equal(g.obsPCP, 'cliente liga amanhã');assert.equal(g.erpSaldoDecisao.porId, '111222');assert.ok(!g.finalizadaEm);
});

/* ───────────── 4. a Performance vê a O.S. segurada ───────────── */

test('revisão 4: a faixa da Performance avisa a O.S. que o PCP segurou, pela data do aviso do ERP', async () => {
  const reg = osAberta('mub-40', '40', {equipe: ['Ana'], itens: itens('40', {1: [marca('m1', 1, '2026-09-22')], 2: [marca('m2', 1, '2026-09-22')]})});
  const srv = await servidor([linha(reg, '2026-09-23T10:00:00Z')], [{numero: '40', status: 'ENTREGUE', data: DIA_ERP}]);
  await srv.baixar();
  assert.ok(srv.gravada('mub-40').erpComSaldo);
  const t = await telaCompleta(srv);
  const setembro = t.run(`perfCoberturaHTML([], {de:'2026-09-01', ate:'2026-09-30'})`);
  // Caso ruim: a O.S. não era instalação nem "a lançar", e sumia das contas sem aviso.
  assert.match(setembro, /1 entrega o ERP diz entregue e o PCP ainda tem saldo; decida em Entregas\./);
  assert.match(setembro, /data-perf-erp-saldo/);
  assert.doesNotMatch(t.run(`perfCoberturaHTML([], {de:'2026-10-01', ate:'2026-10-31'})`), /PCP ainda tem saldo/, 'fora do período não conta');
  assert.ok(!/—/.test(setembro.replace(/<[^>]+>/g, '')), 'sem travessão no texto');
});

/* ───────────── 5. o dia do aviso é o da situação de agora ───────────── */

test('revisão 5: sem data de entrega, o dia do ENTREGUE é o do aviso ENTREGUE, e não o do FINALIZADO de antes', async () => {
  const srv = await servidor([linha(osAberta('mub-9', '9'))], [{numero: '9', status: 'FINALIZADO'}]);
  relogio(srv.mub, '2026-09-20T14:00:00Z');
  await srv.baixar();
  assert.equal(srv.gravada('mub-9').erpComSaldo.selo, 'FINALIZADO|');
  srv.erp([{numero: '9', status: 'ENTREGUE'}]);
  relogio(srv.mub, '2026-09-28T14:00:00Z');
  await srv.baixar();
  const m = srv.gravada('mub-9').erpComSaldo;
  assert.equal(m.selo, 'ENTREGUE|');
  assert.equal(m.desde, '2026-09-28T14:00:00.000Z', 'a situação mudou: `desde` recomeça');
  const t = await telaCompleta(srv);
  const html = t.run('erpComSaldoHTML(listaErpComSaldo(STORE.getAllOS()))');
  // Caso ruim: "Entregar o saldo em 20/09", o dia do aviso FINALIZADO.
  assert.doesNotMatch(html, /20\/09/);
  assert.match(html, /Entregar o saldo em 28\/09/);
  assert.match(html, /entregue em 28\/09/);
  // Só a data mudando (mesma situação), `desde` fica o da primeira vez.
  srv.erp([{numero: '9', status: 'ENTREGUE', data: '2026-09-27'}]);
  relogio(srv.mub, '2026-09-29T14:00:00Z');
  await srv.baixar();
  assert.equal(srv.gravada('mub-9').erpComSaldo.desde, '2026-09-28T14:00:00.000Z');
});

/* ───────────── 1 (decisão do dono): "Manter aberta" tira a data do ERP da conta ───────────── */

test('revisão: ERP diz 29/09, a gestão manteve aberta e o resto foi entregue em 05/10: a O.S. conta e o Lançar propõe 05/10', async () => {
  const reg = osAberta('mub-80', '80', {itens: itens('80', {1: [marca('m1', 1, '2026-09-27')], 2: [marca('m2', 1, '2026-09-27')]})});
  const srv = await servidor([linha(reg, '2026-09-28T10:00:00Z')], [{numero: '80', status: 'ENTREGUE', data: '2026-09-29'}]);
  relogio(srv.mub, '2026-09-29T20:00:00Z');
  assert.equal((await srv.baixar()).marcadasComSaldo, 1);
  // A gestão decide "Manter aberta": não foi entregue em 29/09.
  const t = await telaCompleta(srv);
  assert.equal(t.run(`manterAbertaSaldoERP('mub-80','ENTREGUE|2026-09-29').erro`), '');
  await t.esvaziar();
  assert.equal(srv.gravada('mub-80').erpSaldoDecisao.selo, 'ENTREGUE|2026-09-29');
  // Em 05/10 a gestão entrega o resto, marcando cada item (o servidor com o relógio de 05/10).
  relogio(srv.sync, '2026-10-05T15:00:00Z');
  const g0 = srv.gravada('mub-80');
  const resto = {...g0, atualizadoEm: '2026-10-05T15:00:00.000Z', itens: g0.itens.map((i, k) => k > 1 ? {...i, entregas: [marca('r' + k, 1, '2026-10-05')]} : i)};
  const up = await srv.sync.call({action: 'upsert', os: resto}, {...GESTOR, exp: Math.floor(Date.parse('2026-10-06T00:00:00Z') / 1000)});
  assert.equal(up.status, 200, JSON.stringify(up));assert.ok(!up.entregasRecusadas, JSON.stringify(up.entregasRecusadas));
  // A baixa de 05/10 vê tudo entregue e finaliza.
  relogio(srv.mub, '2026-10-05T18:00:00Z');
  assert.equal((await srv.baixar()).baixadas, 1);
  const g = srv.gravada('mub-80');
  assert.equal(g.erpComSaldo.dataEntregue, '2026-09-29');assert.equal(g.erpSaldoDecisao.tipo, 'manter');
  const t2 = await telaCompleta(srv);
  // Caso ruim: a data do ERP vencia a decisão da gestão, e a O.S. contava em 29/09 (setembro).
  assert.equal(t2.run(`diaEntrega(STORE.getOS('mub-80'))`), '2026-10-05', 'a data que a gestão recusou venceu');
  t2.run(`lancarEntregaManual('mub-80')`);
  const caixa = t2.d.porId.get('lancar-box');
  assert.match(caixa.innerHTML, /name="data" type="date" required value="2026-10-05"/);
  assert.match(caixa.innerHTML, /O ERP baixou em 05\/10\./);
  // Mantida e sem todo item marcado: vale o dia da finalização, nunca a data recusada.
  const semTudo = {...js(g), itens: g.itens.map((i, k) => k === 4 ? {...i, entregas: []} : i)};
  assert.equal(t2.run(`diaDaBaixaERP(${JSON.stringify(semTudo)})`), '2026-10-05');
  // Sem a decisão, a ordem de antes: a data do ERP.
  const {erpSaldoDecisao: _d, ...semDecisao} = js(g);
  assert.equal(t2.run(`diaDaBaixaERP(${JSON.stringify(semDecisao)})`), '2026-09-29');
});
