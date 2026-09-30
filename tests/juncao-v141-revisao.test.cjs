/* REVISÃO DA JUNÇÃO F16+E7 (v141, 30/09/2026): os quatro defeitos que a
   revisão da junção do cancelamento (F16) com a baixa que respeita a entrega
   parcial (E7) achou com prova, cada teste começando pelo caso ruim. As
   correções foram decididas:
     D1  a baixa do ERP finalizava a O.S. parcial cancelada no PCP: o motor lê
         o saldo da cancelada como cancelado, a O.S. deixava de ser "parcial"
         e a baixa passava por cima do "Manter aberta"; desfeito o
         cancelamento, o saldo ficava preso numa O.S. finalizada
     D2  o card da parcial cancelada voltava a oferecer "Confirmar baixa" (e
         o menu Etapa mandava confirmar a baixa e desfazer o cancelamento ao
         mesmo tempo)
     D3  o "Finalizar" da ficha funcionava numa O.S. cancelada
     D4  a lista da E7 aberta antes do cancelamento dizia "Não há saldo", e o
         "Manter aberta" gravava, numa O.S. cancelada
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
const J = JSON.stringify;
const tique = (ms = 2) => new Promise(r => setTimeout(r, ms));
const DIA_ERP = '2026-09-25';
const MOTIVO = 'Cliente pediu para suspender tudo';
const NAO_DECIDE = /O\.S\. cancelada: desfaça o cancelamento para decidir/;

const marca = (id, qtde = 1, dia = '2026-09-20') => ({id, tipo: 'entregue', qtde, dia, via: 'gestao', por: 'Gestor Teste', porId: '111222', em: dia + 'T12:00:00.000Z'});
const item = (num, k, entregas) => ({uid: `${num}:${k}:1`, item: String(k), descricao: 'Placa fictícia ' + k, qtde: '1', subtotal: '100.00', ...(entregas ? {entregas} : {})});
// Cinco itens de R$ 100: 2 de 5 entregues por marca (a entrega parcial da E7).
const doisDeCinco = num => [1, 2, 3, 4, 5].map(k => item(num, k, k <= 2 ? [marca(`m${num}-${k}`)] : null));
const semMarca = num => [1, 2, 3, 4, 5].map(k => item(num, k, null));
const osAberta = (id, num, extra = {}) => ({id, numero: num, rev: 4, origemMubisys: true, tipo: 'externo', cliente: 'Cliente Fictício ' + num,
  servico: 'Fachada fictícia', equipe: [], instalacao: {data: '2026-09-01'}, valorTotal: 500, itens: doisDeCinco(num),
  atualizadoEm: '2026-09-30T11:00:00.000Z', atualizadoPor: 'Gestor Teste', ...extra});
// O checklist completo do Finalizar (a mesma O.S. "pronta" da revisão da E4).
const PRONTA = {liberadoPCP: true, confirmacao: 'Confirmado', embarqueConferidoPor: 'Gestor Teste', produtosConferidosPor: 'Gestor Teste',
  ferramentasConferidas: true, carroLiberado: true, horaSaida: '08:00', saidaEm: '2026-09-29T11:00:00.000Z', instalacaoOK: true,
  conferidoPor: 'Gestor Teste', fotosCheckinIds: ['foto-saida'], fotosRetornoIds: ['foto-volta'], retornoEm: '2026-09-29T19:00:00.000Z',
  horaRetorno: '16:00', equipe: ['100001']};
const osPronta = (id, num, extra = {}) => { const o = {...osAberta(id, num), ...PRONTA, ...extra}; delete o.instalacao; return o; };
// O cancelamento como o servidor grava (carimbarCancelamento).
const CANCELADA = {ativo: true, motivo: MOTIVO, por: 'Gestor Teste', porId: '111222', em: '2026-09-29T10:00:00.000Z'};
const linha = (reg, atualizado_em = '2026-09-30T11:00:00.000Z') => ({id: reg.id, colecao: 'os', apagado: false, atualizado_em, registro: js(reg)});
const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('gestor-teste', 'Gestor Teste', 'gestor', '111.222.333-44'), ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111')];
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const situacoes = o => o.itens.map(i => E.situacaoItem(i, o).situacao);

/* O SERVIDOR: pcp-sync e pcp-mubisys de verdade no MESMO banco. O ERP da
   bancada responde o que cada teste manda: [{numero, status, data}]. */
async function servidor(registros, erp = []) {
  const sync = await edge('pcp-sync', {pcp_registros: registros, registros: js(FICHAS),
    pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
  const mub = await edge('pcp-mubisys', {});
  mub.db.pcp_registros = sync.db.pcp_registros;
  mub.run('console = {...console, warn(){}, log(){}}');
  const responder = lista => mub.run(`erpGet = async () => ({data:${J(lista.map(x => ({sequencial_ordem: x.numero, status: x.status, data_entregue: x.data || ''})))}})`);
  responder(erp);
  const gravada = id => js(sync.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro);
  return {sync, mub, erp: responder, gravada,
    baixar: () => mub.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`),
    // A gestão grava pela porta de dados (o upsert da tela), a partir do gravado.
    gravar: (id, mudar) => sync.call({action: 'upsert', os: {...gravada(id), ...mudar}}, GESTOR)};
}

/* A TELA DA GESTÃO: app.js, casa.js e performance.js com o store de verdade
   falando com o pcp-sync do `srv`, num DOM de mentira. `ficha(id)` pinta a
   ficha de verdade (renderModal) e devolve o HTML. `pacotes`: os entregues
   do ERP por mês. */
function domFalso() {
  const porId = new Map();
  const el = tag => ({tag, id: '', className: '', innerHTML: '', textContent: '', value: '', dataset: {}, hidden: false, style: {},
    classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); }, scrollIntoView() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const modal = el('div');
  const body = el('body');
  const doc = {activeElement: null, body, addEventListener() {}, querySelector: sel => (sel === '#modal-os' ? modal : null), querySelectorAll: () => [],
    getElementById: id => porId.get(id) || null, createElement: tag => el(tag)};
  return {doc, porId, modal};
}
async function telaCompleta(srv, {papel = 'pcp', cracha = GESTOR, pacotes = null} = {}) {
  const e = srv.sync;
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', J(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
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
  run(`STATE.user = {nome:${J(cracha.nome)}, papel:${J(papel)}};
    __pintarFicha = renderModal;
    bindModalEvents = () => {}; ligarEquipeDaFicha = () => {}; ligarHistoricoAlteracoes = () => {}; ligarStatusEntregaDaFicha = () => {};
    renderModal = () => {}; renderActiveTab = () => {}; renderEntregas = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = (m, fn) => { __toasts.push([m, 'desfazer']); __desfazer = fn; };`);
  const S = run('STORE');
  if (pacotes) S.entreguesMes = m => pacotes[m] || null;
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await tique(); } };
  const abrir = id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${J(id)}))); STATE.modalOSId = ${J(id)}; _modalDirty = false;`);
  return {S, ctx, run, d, toasts, esvaziar, abrir,
    card: id => run(`osCardHTML(STORE.getOS(${J(id)}))`),
    etapaFinalizar: id => js(run(`etapasDoCard(STORE.getOS(${J(id)})).find(e => e.aba === 'finalizados')`)),
    lista: () => js(run('listaErpComSaldo(STORE.getAllOS()).map(l => ({id: l.os.id, status: l.aviso.status, selo: l.aviso.selo}))')),
    // A ficha pintada de verdade, com o rascunho aberto (abrir antes, ou já aberto).
    ficha: id => { if (id) abrir(id); run('__pintarFicha()'); return d.modal.innerHTML; },
    // Cancelar e desfazer pela ficha, como a gestão: rascunho, fila, pcp-sync.
    cancelar: async id => { abrir(id); run(`_modalDraft.cancelamento = {cancelar:true, motivo:${J(MOTIVO)}}; saveDraft();`); await esvaziar(); },
    desfazer: async id => { abrir(id); run('_modalDraft.cancelamento = {desfazer:true}; saveDraft();'); await esvaziar(); }};
}

/* ───────────── D1: a baixa do ERP poupa a parcial cancelada no PCP ───────────── */

test('revisão: a baixa do ERP não finaliza a parcial que a gestão mandou manter aberta e depois cancelou; desfeito o cancelamento, ela segue aberta com o saldo a entregar', async () => {
  const srv = await servidor([linha(osAberta('mub-10', '10'))], [{numero: '10', status: 'ENTREGUE', data: DIA_ERP}]);
  // A E7: a baixa poupa a parcial e põe a marca da lista.
  let r = await srv.baixar();
  assert.equal(r.marcadasComSaldo, 1, J(r));
  const selo = srv.gravada('mub-10').erpComSaldo.selo;
  assert.equal(selo, 'ENTREGUE|2026-09-25');
  // A gestão decide "Manter aberta" e depois cancela a O.S. (pcp-sync real).
  assert.equal((await srv.gravar('mub-10', {erpSaldoDecisao: {tipo: 'manter', selo}})).status, 200);
  assert.equal((await srv.gravar('mub-10', {cancelamento: {cancelar: true, motivo: MOTIVO}})).status, 200);
  let g = srv.gravada('mub-10');
  assert.equal(g.cancelamento.ativo, true);assert.equal(g.erpSaldoDecisao.tipo, 'manter');
  // Caso ruim: a baixa da hora seguinte (o ERP segue dizendo ENTREGUE) finalizava a O.S.
  r = await srv.baixar();
  g = srv.gravada('mub-10');
  assert.ok(!g.finalizadaEm, 'a baixa finalizou a parcial que a gestão mandou manter aberta, só porque estava cancelada');
  assert.equal(r.baixadas, 0, J(r));
  assert.equal(r.poupadasComSaldo, 1, J(r));
  assert.match(r.comSaldo[0].causa, /entrega parcial marcada no PCP: 2 de 5 itens com entrega, 3 unidades de saldo; o ERP diz ENTREGUE/);
  assert.ok(!g.baixaAutoERP);
  assert.equal(g.erpComSaldo.selo, selo, 'a marca da lista fica como estava');
  assert.equal(g.erpSaldoDecisao.tipo, 'manter', 'o "Manter aberta" é respeitado');
  // Cancelada, a O.S. fica fora da lista (a gestão desfaz o cancelamento para decidir).
  let t = await telaCompleta(srv);
  assert.deepEqual(t.lista(), []);
  // A gestão desfaz o cancelamento: a O.S. está aberta, com o saldo a entregar.
  assert.equal((await srv.gravar('mub-10', {cancelamento: {desfazer: true}})).status, 200);
  g = srv.gravada('mub-10');
  assert.equal(g.cancelamento.ativo, false);assert.ok(!g.finalizadaEm);
  assert.deepEqual(situacoes(g), ['entregue', 'entregue', 'a entregar', 'a entregar', 'a entregar']);
  assert.equal(E.resumoOS(g).situacao, 'parcial');
  const v = E.validarEvento({id: 'x1', tipo: 'entregue', qtde: 1, dia: '2026-09-30', via: 'gestao'}, g.itens[2], {papel: 'pcp', os: g, hoje: '2026-09-30'});
  assert.ok(v.ok, 'o saldo aceita a marca de entrega: ' + v.erro);
  // O "Manter aberta" vale para o mesmo aviso do ERP: fora da lista, e a baixa seguinte poupa de novo.
  t = await telaCompleta(srv);
  assert.deepEqual(t.lista(), []);
  r = await srv.baixar();
  assert.ok(!srv.gravada('mub-10').finalizadaEm, J(r));
  assert.equal(r.baixadas, 0);
});

test('revisão: a parcial cancelada no PCP fica poupada pela baixa (ENTREGUE e FINALIZADO), fora da lista e sem aviso no card enquanto cancelada, e volta à lista quando o cancelamento é desfeito', async () => {
  for (const [id, num, status] of [['mub-20', '20', 'ENTREGUE'], ['mub-21', '21', 'FINALIZADO']]) {
    const srv = await servidor([linha(osAberta(id, num, {cancelamento: CANCELADA}))], [{numero: num, status, data: status === 'ENTREGUE' ? DIA_ERP : ''}]);
    // Caso ruim: a baixa finalizava a O.S. cancelada, e o desfazer deixava o saldo "a entregar" numa O.S. finalizada.
    const r = await srv.baixar();
    let g = srv.gravada(id);
    assert.ok(!g.finalizadaEm, `${status}: a baixa finalizou a parcial cancelada no PCP`);
    assert.equal(r.baixadas, 0, J(r));assert.equal(r.poupadasComSaldo, 1, J(r));assert.equal(r.marcadasComSaldo, 1, J(r));
    assert.equal(g.erpComSaldo.status, status);
    assert.equal(g.cancelamento.ativo, true, 'o cancelamento fica como estava');
    // Enquanto cancelada: fora da lista, e o card não manda decidir em Entregas.
    let t = await telaCompleta(srv);
    assert.deepEqual(t.lista(), [], `${status}: a lista mostra a O.S. cancelada`);
    let html = t.card(id);
    assert.doesNotMatch(html, /data-erp-saldo-lista/, `${status}: o card da cancelada manda para a lista que não a mostra`);
    assert.doesNotMatch(html, /data-erp-baixa/);
    // A gestão desfaz o cancelamento pela ficha: a O.S. volta à lista, e o card aponta para ela.
    await t.desfazer(id);
    g = srv.gravada(id);
    assert.equal(g.cancelamento.ativo, false);assert.ok(!g.finalizadaEm);
    assert.deepEqual(situacoes(g), ['entregue', 'entregue', 'a entregar', 'a entregar', 'a entregar']);
    t = await telaCompleta(srv);
    assert.deepEqual(t.lista(), [{id, status, selo: g.erpComSaldo.selo}]);
    html = t.card(id);
    assert.match(html, /data-erp-saldo-lista/);
    assert.doesNotMatch(html, /data-erp-baixa/);
  }
  // Controle: CANCELADO no ERP numa parcial cancelada no PCP é baixada como sempre (o ERP cancelou).
  const srv = await servidor([linha(osAberta('mub-22', '22', {cancelamento: CANCELADA}))], [{numero: '22', status: 'CANCELADO'}]);
  const r = await srv.baixar();
  const g = srv.gravada('mub-22');
  assert.equal(r.baixadas, 1, J(r));assert.ok(g.finalizadaEm);assert.equal(g.baixaAutoERP.status, 'CANCELADO');assert.ok(!g.erpComSaldo);
  // Controle: a cancelada sem marca de item é baixada como antes (a regra da E7 só vale com parcial marcada).
  const srv2 = await servidor([linha(osAberta('mub-23', '23', {cancelamento: CANCELADA, itens: semMarca('23')}))], [{numero: '23', status: 'ENTREGUE', data: DIA_ERP}]);
  const r2 = await srv2.baixar();
  assert.equal(r2.baixadas, 1, J(r2));assert.ok(srv2.gravada('mub-23').finalizadaEm);
});

/* ───────────── D2: o card da cancelada não oferece "Confirmar baixa" ───────────── */

test('revisão: o card da parcial cancelada (O.S. que saiu da carteira) não oferece "Confirmar baixa", e o clique de um card velho não finaliza', async () => {
  const srv = await servidor([linha(osAberta('mub-95', '95', {erpSaiuDaCarteiraEm: '2026-09-28T13:20:00.000Z'}))]);
  const pacotes = {'2026-09': {v: 3, os: [{numero: '95', data: '2026-09-28', valor: 500}]}};
  let t = await telaCompleta(srv, {pacotes});
  // Aberta e parcial: o card manda para a lista da E7, sem "Confirmar baixa".
  assert.doesNotMatch(t.card('mub-95'), /data-erp-baixa/);
  assert.deepEqual(t.lista().map(l => l.id), ['mub-95']);
  // A gestão cancela pela ficha (rascunho, fila, pcp-sync real).
  await t.cancelar('mub-95');
  assert.equal(srv.gravada('mub-95').cancelamento.ativo, true);
  t = await telaCompleta(srv, {pacotes});
  // Caso ruim: cancelada, o motor dava a O.S. por "completa" e o "Confirmar baixa" voltava ao card.
  const html = t.card('mub-95');
  assert.doesNotMatch(html, /data-erp-baixa/, 'o card da parcial cancelada oferece "Confirmar baixa"');
  assert.doesNotMatch(html, /data-erp-saldo-lista/, 'a lista não mostra a cancelada: o card não manda para lá');
  assert.doesNotMatch(html, /confirme a baixa/);
  assert.deepEqual(t.lista(), []);
  // O menu Etapa não manda confirmar a baixa: manda desfazer o cancelamento.
  const etapa = t.etapaFinalizar('mub-95');
  assert.equal(etapa.acao, '');
  assert.doesNotMatch(etapa.sub, /confirme a baixa|aviso acima/, etapa.sub);
  assert.match(etapa.motivo, /desfaça o cancelamento/);
  // O aviso do ERP é avaliado sem o cancelamento da gestão: para o ERP, a O.S. segue parcial.
  assert.equal(t.run(`erpSaldoNaOS(STORE.getOS('mub-95')).resumo.situacao`), 'parcial');
  // O clique de um card desenhado antes do cancelamento: recusa, com aviso, e nada é gravado.
  t.run(`erpConfirmarBaixa('mub-95')`);
  await t.esvaziar();
  assert.ok(!srv.gravada('mub-95').finalizadaEm, 'o "Confirmar baixa" finalizou a O.S. cancelada');
  assert.ok(!t.S.getOS('mub-95').finalizadaEm);
  assert.match(t.toasts.at(-1)[0], /cancelada/);assert.equal(t.toasts.at(-1)[1], 'error');
  // Desfeito o cancelamento: a O.S. volta à lista, o card aponta para ela, e segue sem "Confirmar baixa".
  await t.desfazer('mub-95');
  const g = srv.gravada('mub-95');
  assert.ok(!g.finalizadaEm);assert.equal(g.cancelamento.ativo, false);
  assert.deepEqual(situacoes(g), ['entregue', 'entregue', 'a entregar', 'a entregar', 'a entregar']);
  t = await telaCompleta(srv, {pacotes});
  assert.deepEqual(t.lista().map(l => l.id), ['mub-95']);
  assert.match(t.card('mub-95'), /data-erp-saldo-lista/);
  assert.doesNotMatch(t.card('mub-95'), /data-erp-baixa/);
});

test('revisão: a O.S. da carteira sem entrega parcial, cancelada no PCP, também não confirma a baixa; desfeito o cancelamento, o botão volta', async () => {
  const srv = await servidor([linha(osAberta('mub-96', '96', {erpSaiuDaCarteiraEm: '2026-09-28T13:20:00.000Z', itens: semMarca('96'), cancelamento: CANCELADA}))]);
  let t = await telaCompleta(srv);
  // Caso ruim: o card oferecia "Confirmar baixa", e o clique finalizava a O.S. cancelada.
  const html = t.card('mub-96');
  assert.doesNotMatch(html, /data-erp-baixa/, 'o card da cancelada oferece "Confirmar baixa"');
  assert.doesNotMatch(html, /confirme a baixa/);
  assert.doesNotMatch(t.etapaFinalizar('mub-96').sub, /confirme a baixa|aviso acima/);
  t.run(`erpConfirmarBaixa('mub-96')`);
  await t.esvaziar();
  assert.ok(!srv.gravada('mub-96').finalizadaEm, 'o "Confirmar baixa" finalizou a O.S. cancelada');
  assert.match(t.toasts.at(-1)[0], /cancelada/);
  // Controle: desfeito o cancelamento, a gestão confirma a baixa como antes.
  await t.desfazer('mub-96');
  t = await telaCompleta(srv);
  assert.match(t.card('mub-96'), /data-erp-baixa="mub-96"/);
  assert.match(t.etapaFinalizar('mub-96').sub, /confirme a baixa no aviso acima/);
  t.run(`erpConfirmarBaixa('mub-96')`);
  await t.esvaziar();
  assert.ok(srv.gravada('mub-96').finalizadaEm, 'sem o cancelamento, a baixa confirmada finaliza');
});

/* ───────────── D3: o Finalizar da ficha numa O.S. cancelada ───────────── */

test('revisão: o "Finalizar" da ficha não aparece nem finaliza numa O.S. cancelada (instalação e cliente retira)', async () => {
  const interna = {...osAberta('mub-71', '71'), tipo: 'interno', liberadoPCP: true, cancelamento: CANCELADA};
  const srv = await servidor([linha(osPronta('mub-70', '70', {cancelamento: CANCELADA})), linha(interna)]);
  const t = await telaCompleta(srv);
  // Caso ruim: o Finalizar da ficha finalizava a instalação cancelada.
  t.abrir('mub-70');
  t.run(`perguntarRetrabalho = (d, fn) => fn(); finalizarDaFicha(false);`);
  await t.esvaziar();
  assert.ok(!srv.gravada('mub-70').finalizadaEm, 'o Finalizar da ficha finalizou a O.S. cancelada');
  assert.ok(!t.run('_modalDraft.finalizadaEm'));
  assert.equal(t.run(`document.getElementById('saldo-entrega-box')`), null, 'nem pergunta pelo saldo');
  assert.match(t.toasts.at(-1)[0], /cancelada/);assert.equal(t.toasts.at(-1)[1], 'error');
  // O "Cliente retirou" da O.S. interna cancelada também não finaliza.
  t.abrir('mub-71');
  t.run('finalizarDaFicha(true);');
  await t.esvaziar();
  assert.ok(!srv.gravada('mub-71').finalizadaEm, 'o Cliente retirou finalizou a O.S. cancelada');
  // Os dois botões somem da ficha da cancelada.
  assert.doesNotMatch(t.ficha('mub-70'), /id="btn-finalizar"/);
  assert.doesNotMatch(t.ficha('mub-71'), /id="btn-finalizar-interno"/);
  // O pedido de cancelamento ainda no rascunho (antes de ir ao servidor) já vale.
  await t.desfazer('mub-70');
  assert.match(t.ficha('mub-70'), /id="btn-finalizar"/, 'controle: sem o cancelamento, o botão está lá');
  t.abrir('mub-70');
  t.run(`_modalDraft.cancelamento = {cancelar:true, motivo:${J(MOTIVO)}};`);
  assert.doesNotMatch(t.ficha(), /id="btn-finalizar"/);
  t.run(`perguntarRetrabalho = (d, fn) => fn(); finalizarDaFicha(false);`);
  assert.ok(!t.run('_modalDraft.finalizadaEm'), 'o pedido de cancelamento no rascunho não finaliza');
  // Controle: sem cancelamento, o "Cliente retirou" aparece na interna.
  await t.desfazer('mub-71');
  assert.match(t.ficha('mub-71'), /id="btn-finalizar-interno"/);
});

/* ───────────── D4: a lista da E7 aberta antes do cancelamento ───────────── */

test('revisão: a lista da E7 aberta antes do cancelamento não decide numa O.S. cancelada ("Entregar o saldo" e "Manter aberta")', async () => {
  const erp = {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|2026-09-25', desde: '2026-09-26T10:00:00.000Z', em: '2026-09-26T10:00:00.000Z'};
  const srv = await servidor([linha(osAberta('mub-41', '41', {erpComSaldo: erp}))]);
  const t = await telaCompleta(srv);
  // A lista aberta: a O.S. está lá.
  assert.deepEqual(t.lista().map(l => l.id), ['mub-41']);
  // A gestão cancela a O.S. pela ficha (a lista desenhada antes continua na tela).
  await t.cancelar('mub-41');
  assert.equal(srv.gravada('mub-41').cancelamento.ativo, true);
  const antes = J(t.S.getOS('mub-41'));
  // Caso ruim: "Entregar o saldo" dizia "Não há saldo a entregar" (o saldo está cancelado, não entregue).
  const ent = js(t.run(`entregarSaldoERP('mub-41', 'ENTREGUE|2026-09-25')`));
  assert.match(ent.erro, NAO_DECIDE, ent.erro);
  // Caso ruim: "Manter aberta" gravava a decisão numa O.S. cancelada.
  const man = js(t.run(`manterAbertaSaldoERP('mub-41', 'ENTREGUE|2026-09-25')`));
  assert.match(man.erro, NAO_DECIDE, man.erro);
  // Nada é gravado: nem no aparelho, nem na fila, nem no servidor.
  assert.equal(J(t.S.getOS('mub-41')), antes);
  assert.equal(t.S.getQueue().length, 0);
  await t.esvaziar();
  const g = srv.gravada('mub-41');
  assert.ok(!g.erpSaldoDecisao, 'a decisão foi gravada numa O.S. cancelada');
  assert.deepEqual(g.itens.map(i => (i.entregas || []).length), [1, 1, 0, 0, 0]);
  // O pedido de cancelamento ainda na fila (antes do envio) também já vale.
  await t.desfazer('mub-41');
  t.abrir('mub-41');
  t.run(`_modalDraft.cancelamento = {cancelar:true, motivo:${J(MOTIVO)}}; saveDraft();`);
  assert.match(js(t.run(`manterAbertaSaldoERP('mub-41', 'ENTREGUE|2026-09-25')`)).erro, NAO_DECIDE);
  assert.match(js(t.run(`entregarSaldoERP('mub-41', 'ENTREGUE|2026-09-25')`)).erro, NAO_DECIDE);
  await t.esvaziar();
  // Controle: desfeito o cancelamento, a lista decide como antes.
  await t.desfazer('mub-41');
  assert.deepEqual(t.lista().map(l => l.id), ['mub-41']);
  assert.equal(js(t.run(`manterAbertaSaldoERP('mub-41', 'ENTREGUE|2026-09-25')`)).erro, '');
  await t.esvaziar();
  assert.equal(srv.gravada('mub-41').erpSaldoDecisao.tipo, 'manter');
});
