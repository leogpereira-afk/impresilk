/* ENTRADAS RÁPIDAS (F24, 01/10/2026): desfazer, câmera, atalhos, máscara R$,
 * cliente tolerante, animações e rascunho dos diálogos.
 *
 * - O Desfazer de um toque devolve o estado de antes DE VERDADE, inclusive no
 *   servidor: a tela (app.js) com o store de verdade (store.js), falando com o
 *   pcp-sync de verdade (helpers/edge.cjs), num DOM de mentira.
 * - Onde o servidor não aceitaria a volta (o carro liberado em outro dia que
 *   não o da confirmação, a confirmação que já existia), a pergunta fica.
 * - Atalhos da ficha: nunca dentro de campo de texto.
 * - Máscara R$ só onde o dinheiro já existe (itens da O.S. manual).
 * - Cliente achado com erro de digitação; movimento reduzido desliga tudo.
 * - A foto nasce ligada à O.S. e passa nas duas réguas do servidor.
 * - O celular (equipe.js) só mudou os rótulos "antes" e "depois".
 * Cada teste começa pelo caso ruim. Tudo fictício: o repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const tique = () => new Promise(r => setTimeout(r, 2));

/* ════════════════════ A BANCADA: tela + store + servidor de verdade ════════════════════ */
const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'), ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'), ficha('olga-f', 'Olga Balcão', 'operacao1', '12312312312')];
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const OPERACAO_C = {papel: 'operacao', nome: 'Olga Balcão', sub: 'operacao1'};
const agora = () => new Date().toISOString();
const ontem = () => new Date(Date.now() - 26 * 3600 * 1000).toISOString();
const hojeSP = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
const row = (id, registro, rev = 1) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id, rev, atualizadoEm: '2026-09-19T10:00:00.000Z', ...registro}});
// A O.S. programada para hoje e liberada do PCP; `extra` põe o que o caso pede.
const agendada = (extra = {}) => ({numero: '9101', tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001'], responsavelPCP: 'Gestor Teste',
  liberadoPCP: true, aptoPor: 'Gestor Teste', aptoEm: '2026-09-28T12:00:00.000Z', instalacao: {data: hojeSP(), periodo: 'Manhã', hora: '', duracaoDias: 1},
  confirmacao: '', confPor: '', confEm: '', confHora: '', carroLiberado: false, carroLiberadoPor: '', carroLiberadoEm: '', ...extra});
const gravada = (e, id = '1') => js(e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro);

function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id: '', className: '', innerHTML: '', textContent: '', value: '', dataset: {}, hidden: false, style: {},
    classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const body = el('body');
  const doc = {activeElement: null, body, addEventListener() {}, querySelector: sel => no(sel), querySelectorAll: () => [],
    getElementById: id => porId.get(id) || null, createElement: tag => el(tag)};
  return {doc, no};
}
async function bancada({registros = [], papel = 'pcp', cracha = GESTOR} = {}) {
  const e = await edge('pcp-sync', {pcp_registros: registros, registros: structuredClone(FICHAS),
    pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}], equipe_contas: [{sistema: 'pcp', usuario: 'operacao1'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const perguntas = [];
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}}, location: {reload() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_u, req) => { const r = await e.call(JSON.parse(req.body), cracha); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; },
    document: d.doc, confirm: msg => { perguntas.push(String(msg)); return true; }, __toasts: [], __desfazer: []});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  const run = c => vm.runInContext(c, ctx);
  run(`STATE.user = {nome: ${JSON.stringify(cracha.nome)}, papel: ${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t || '']); toastDesfazer = (m, fn) => { __toasts.push([m, 'desfazer']); __desfazer.push(fn); };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await tique(); } };
  return {e, S, run, d, perguntas, esvaziar, toasts: ctx.__toasts, desfazer: ctx.__desfazer,
    // A ficha aberta: o rascunho da O.S. do aparelho e os botões ligados (bindModalEvents de verdade).
    abrir: id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false; bindModalEvents(_modalDraft, false);`),
    tocar: sel => d.no(sel).onclick(),
    draft: () => js(run('_modalDraft'))};
}

/* ───────────── 1. Desfazer: Liberar carro e Cancelar carro, no servidor de verdade ───────────── */

test('F24: desfazer o Liberar carro devolve os carimbos, na tela e no servidor (pcp-sync)', async () => {
  const b = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00'}))]});
  b.abrir('1');
  b.tocar('#btn-liberar-carro');
  assert.deepEqual(b.perguntas, [], 'liberar não pergunta');
  assert.ok(b.toasts.some(([m, t]) => m === 'Carro liberado' && t === 'desfazer'), JSON.stringify(b.toasts));
  await b.esvaziar();
  let g = gravada(b.e);
  assert.equal(g.carroLiberado, true);
  assert.equal(g.carroLiberadoPor, 'Gestor Teste');
  assert.equal(g.carroLiberadoPorId, '111222', 'o servidor carimbou o ID de quem liberou');
  const em = g.carroLiberadoEm;
  // Caso ruim: o Desfazer que só mexesse na tela deixaria o carro liberado no servidor.
  b.desfazer.at(-1)();
  assert.equal(b.draft().carroLiberado, false);
  await b.esvaziar();
  g = gravada(b.e);
  assert.equal(g.carroLiberado, false, 'o servidor voltou a não ter o carro liberado');
  assert.equal(g.carroLiberadoPor, '');
  assert.equal(g.carroLiberadoEm, '');
  assert.equal(g.carroLiberadoPorId ?? '', '', 'nem o ID de quem liberou');
  assert.ok(em, 'a liberação tinha um carimbo de hora');
  assert.ok(b.toasts.some(([m, t]) => m === 'Desfeito' && t === 'success'));
});

test('F24: Cancelar o carro no mesmo dia da confirmação não pergunta; o Desfazer devolve quem liberou, a hora e o ID', async () => {
  const b = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00'}))]});
  b.abrir('1');
  b.tocar('#btn-liberar-carro');
  await b.esvaziar();
  const antes = gravada(b.e);
  b.tocar('#btn-cancelar-carro');
  assert.deepEqual(b.perguntas, [], 'o Desfazer entra no lugar da pergunta');
  assert.ok(b.toasts.some(([m, t]) => m === 'Carro cancelado' && t === 'desfazer'));
  await b.esvaziar();
  assert.equal(gravada(b.e).carroLiberado, false);
  // Caso ruim: devolver só o "true" carimbaria quem desfez, e a hora de agora.
  b.desfazer.at(-1)();
  await b.esvaziar();
  const g = gravada(b.e);
  assert.equal(g.carroLiberado, true);
  assert.equal(g.carroLiberadoPor, antes.carroLiberadoPor);
  assert.equal(g.carroLiberadoEm, antes.carroLiberadoEm, 'a hora da liberação é a de antes');
  assert.equal(g.carroLiberadoPorId, '111222', 'o servidor reconheceu o par (nome, hora) e devolveu o ID');
  assert.equal(b.S.getQueue().length, 0, 'nada preso na fila (sem 422)');
});

test('F24: Cancelar o carro liberado em outro dia que não o da confirmação continua perguntando, sem Desfazer (o servidor recusaria a volta)', async () => {
  const b = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00',
    carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: ontem()}))]});
  b.abrir('1');
  assert.equal(b.run('podeVoltarCarro(_modalDraft)'), false);
  b.tocar('#btn-cancelar-carro');
  assert.deepEqual(b.perguntas, ['Cancelar o carro liberado desta O.S.?']);
  assert.ok(!b.toasts.some(([, t]) => t === 'desfazer'), 'sem o Desfazer que levaria 422');
  await b.esvaziar();
  assert.equal(gravada(b.e).carroLiberado, false);
  // A régua é a do servidor: a liberação de volta com outro dia é recusada lá.
  const r = await b.e.call({action: 'upsert', os: {...gravada(b.e), carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: ontem()}}, GESTOR);
  assert.equal(r.status, 422);
});

/* ───────────── 2. Desfazer: Confirmei, Liberar PCP, a guarda ───────────── */

test('F24: o Desfazer do Confirmei apaga a confirmação no servidor (e o confRecebidoEm); a O.S. já confirmada fica sem Desfazer', async () => {
  const b = await bancada({registros: [row('1', agendada())]});
  b.abrir('1');
  b.tocar('#btn-confirmei');
  await b.esvaziar();
  let g = gravada(b.e);
  assert.equal(g.confirmacao, 'Confirmado');
  assert.ok(g.confRecebidoEm, 'o servidor carimbou o recebimento');
  b.desfazer.at(-1)();
  await b.esvaziar();
  g = gravada(b.e);
  assert.equal(g.confirmacao, '');
  assert.equal(g.confPor, '');
  assert.equal(g.confEm, '');
  assert.ok(!('confRecebidoEm' in g), 'o carimbo do servidor da confirmação desfeita some junto');
  // Caso ruim: a confirmação de ontem voltaria com o nome de quem desfez (o servidor recarimba confPor).
  const c = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Outra Pessoa', confEm: ontem(), confHora: '09:00'}))]});
  c.abrir('1');
  c.tocar('#btn-confirmei');
  assert.ok(c.toasts.some(([m, t]) => m === 'Cliente confirmado' && t === 'success'));
  assert.equal(c.desfazer.length, 0, 'sem Desfazer');
});

test('F24: Liberar do PCP e Cancelar a liberação se desfazem num toque, sem pergunta; o ID de quem liberou volta com o par', async () => {
  const b = await bancada({registros: [row('1', agendada({liberadoPCP: false, aptoPor: '', aptoEm: ''}))]});
  b.abrir('1');
  b.tocar('#btn-liberar');
  await b.esvaziar();
  let g = gravada(b.e);
  assert.equal(g.liberadoPCP, true);
  assert.equal(g.aptoPorId, '111222');
  const par = [g.aptoPor, g.aptoEm];
  b.tocar('#btn-cancelar-liberar');
  assert.deepEqual(b.perguntas, [], 'a pergunta saiu');
  await b.esvaziar();
  assert.equal(gravada(b.e).liberadoPCP, false);
  b.desfazer.at(-1)();
  await b.esvaziar();
  g = gravada(b.e);
  assert.equal(g.liberadoPCP, true);
  assert.deepEqual([g.aptoPor, g.aptoEm], par);
  assert.equal(g.aptoPorId, '111222');
  // O histórico de etapas volta junto: a etapa de "aguardando produção" do cancelamento desfeito não sobra.
  const etapas = (b.draft().historico || []).map(h => h.etapa);
  assert.equal(etapas.length, 1, JSON.stringify(etapas));
  assert.ok(!etapas.includes('aguardando_producao'), JSON.stringify(etapas));
});

test('F24: o Desfazer não mexe se a O.S. mudou depois (confirmou e liberou o carro: desfazer a confirmação é recusado)', async () => {
  const b = await bancada({registros: [row('1', agendada())]});
  b.abrir('1');
  b.tocar('#btn-confirmei');
  const desfazerConfirmacao = b.desfazer.at(-1);
  b.tocar('#btn-liberar-carro');
  assert.equal(b.draft().carroLiberado, true);
  desfazerConfirmacao();
  const d = b.draft();
  assert.equal(d.confirmacao, 'Confirmado', 'a confirmação fica: o carro saiu em cima dela');
  assert.equal(d.carroLiberado, true);
  assert.ok(b.toasts.some(([m, t]) => /Não deu para desfazer: a O\.S\. mudou depois/.test(m) && t === 'error'));
});

/* ───────────── 3. Desfazer: Finalizar da ficha ───────────── */

const pronta = (extra = {}) => agendada({numero: '9105', confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00',
  embarqueConferidoPor: 'Gestor Teste', produtosConferidosPor: 'Gestor Teste', ferramentasConferidas: true, carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: agora(),
  horaSaida: '08:00', saidaEm: agora(), instalacaoOK: true, conferidoPor: 'Gestor Teste', fotosCheckinIds: ['foto_1758300000000_abc123'], fotosRetornoIds: ['foto_1758300000001_def456'],
  horaRetorno: '15:00', retornoEm: agora(), checkout: {situacao: '', hora: '', por: '', obs: 'obs fictícia', confirmado: false},
  // O item 1 já tem uma entrega parcial: a O.S. tem saldo, e o Finalizar pergunta e marca o resto (E4).
  itens: [{uid: '9105:1:1', item: '1', descricao: 'Placa fictícia', qtde: '2', pronto: true,
    entregas: [{id: 'mk-parcial', tipo: 'entregue', qtde: 1, dia: '2026-09-20', via: 'gestao', por: 'Gestor Teste', porId: '111222', em: '2026-09-20T12:00:00Z'}]},
  {uid: '9105:2:1', item: '2', descricao: 'Adesivo fictício', qtde: '1', pronto: true}], ...extra});

test('F24: o Desfazer do Finalizar da ficha volta a finalização e desfaz as marcas do saldo, na mesma gravação, no servidor', async () => {
  const b = await bancada({registros: [row('1', pronta())]});
  b.abrir('1');
  b.run(`perguntarRetrabalho = (d, fn) => { d.retrabalhoPerguntado = {em: nowISO(), por: STATE.user.nome, resposta: 'nao'}; fn(); };
    finalizarComSaldo = (os, seguir) => seguir('marcar');`);
  b.run('finalizarDaFicha(false)');
  assert.ok(b.toasts.some(([m, t]) => /^Instalação finalizada 🏁 · 2 itens marcados entregues hoje$/.test(m) && t === 'desfazer'), JSON.stringify(b.toasts));
  await b.esvaziar();
  let g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  assert.equal(g.checkout.situacao, 'Finalizado');
  const marcas = g.itens.flatMap(it => (it.entregas || []).filter(x => x.tipo === 'entregue' && x.id !== 'mk-parcial').map(x => x.id));
  assert.equal(marcas.length, 2);
  // Caso ruim: reabrir sem desfazer as marcas deixava o saldo "entregue hoje", valendo R$.
  b.desfazer.at(-1)();
  await b.esvaziar();
  g = gravada(b.e);
  assert.ok(!g.finalizadaEm, 'a O.S. voltou a aberta no servidor');
  assert.equal(g.checkout.situacao, '', 'o checkout de antes');
  assert.equal(g.checkout.obs, 'obs fictícia');
  for (const id of marcas) assert.ok(g.itens.some(it => (it.entregas || []).some(x => x.tipo === 'desfeito' && x.alvo === id)), 'cada marca ganhou o desfeito');
  assert.ok(!g.itens.some(it => (it.entregas || []).some(x => x.tipo === 'desfeito' && x.alvo === 'mk-parcial')), 'a entrega de antes da finalização fica');
  assert.ok(g.reabertaEm, 'o rastro do servidor: desfazer a finalização que chegou lá é reabrir');
  assert.equal(g.retrabalhoPerguntado.resposta, 'nao', 'a resposta do retrabalho fica (só a gestão responde por ela)');
  assert.ok(b.toasts.some(([m]) => m === 'Desfeito: a finalização e 2 marcas de entrega'));
});

test('F24: quem não desfaz marca de entrega (operação) não recebe o Desfazer da finalização que marcou saldo', async () => {
  const b = await bancada({registros: [row('1', pronta())], papel: 'operacao', cracha: OPERACAO_C});
  b.abrir('1');
  b.run(`perguntarRetrabalho = (d, fn) => fn(); finalizarComSaldo = (os, seguir) => seguir('marcar');`);
  b.run('finalizarDaFicha(false)');
  assert.equal(b.desfazer.length, 0);
  assert.ok(b.toasts.some(([m]) => /Para desfazer, fale com o PCP\.$/.test(m)), JSON.stringify(b.toasts));
});

/* ───────────── 4. A limpeza explícita (preservarAusentes) ───────────── */

test('F24: campo que o servidor guarda quando não vem volta ao vazio com null presente; o de só acréscimo não desfaz', async () => {
  const rp = [{dia: hojeSP(), hora: '17:00'}];
  const b = await bancada({registros: [row('1', agendada({retornoPrevisto: rp}))]});
  b.abrir('1');
  // Caso ruim: devolver "não existia" apagando a chave deixava o valor no servidor (ausente = não mexe).
  b.run(`delete _modalDraft.retornoPrevisto; markDirty(); saveDraft();`);
  await b.esvaziar();
  assert.ok(gravada(b.e).retornoPrevisto, 'ausente: o servidor guardou o gravado');
  b.abrir('1');
  assert.equal(b.run(`devolverCampos(_modalDraft, {retornoPrevisto: null})`), '');
  assert.equal(b.run('_modalDraft.retornoPrevisto'), null, 'o null vai presente');
  b.run('markDirty(); saveDraft();');
  await b.esvaziar();
  assert.equal(gravada(b.e).retornoPrevisto ?? null, null, 'com o null presente, a gestão limpa');
  // Só acréscimo (prazo combinado, histórico da divisão...) não volta ao vazio: não mexe e diz.
  b.run(`_modalDraft.prazoCombinado = {data: '2026-10-01', fonte: 'agenda'};`);
  assert.match(b.run(`devolverCampos(_modalDraft, {prazoCombinado: null, liberadoPCP: false})`), /só cresce e não volta ao vazio/);
  assert.equal(b.run('_modalDraft.liberadoPCP'), true, 'nada mudou');
  // A lista da tela é a mesma do _shared: limpável + só acréscimo = CAMPOS_GESTAO.
  const {CAMPOS_GESTAO, preservarAusentes} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const limpavel = js(b.run('F24_GESTAO_LIMPAVEL')), soCresce = js(b.run('F24_GESTAO_SO_ACRESCIMO'));
  assert.deepEqual([...limpavel, ...soCresce].sort(), [...CAMPOS_GESTAO].sort());
  for (const c of CAMPOS_GESTAO) {
    const r = preservarAusentes({[c]: null}, {[c]: 'gravado'}, {podeLimpar: true});
    assert.equal(r[c] === null, limpavel.includes(c), c);
  }
});

/* ════════════════════ A FICHA COM O COMPONENTE DE EQUIPE (remover pessoa) ════════════════════ */
const HOJE = '2026-10-05';
const DataFixa = class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } };
const ELENCO = {pessoas: [
  {chave: 'adriano-f', id: '100001', nome: 'Adriano Fictício Souza', apelido: 'adriano', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
], antigos: [], ferias: [], ausencias: [], fichaRH: true};
const EQUIPES = [{id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001'}, {chave: '100002'}], ativo: true}];
const osFicha = (extra = {}) => ({id: 'f1', numero: '8001', tipo: 'externo', cliente: 'Cliente Fictício', liberadoPCP: true, equipe: [],
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, veiculo: '', valorTotal: 5000, rev: 1, itens: [], ...extra});
function telaFicha({papel = 'pcp', lista = []} = {}) {
  let html = '', blocos = [], els = new Map();
  const classes = () => { const s = new Set(); return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, contains: c => s.has(c)}; };
  const el = id => {
    if (!els.has(id)) els.set(id, {id, innerHTML: '', textContent: '', hidden: false, disabled: false, classList: classes(), querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, focus() {}});
    return els.get(id);
  };
  const modal = {get innerHTML() { return html; },
    set innerHTML(v) { html = v; els = new Map(); blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false})); },
    classList: classes(), querySelector: () => null, querySelectorAll: () => []};
  const overlay = {classList: classes()};
  const doc = {querySelector: s => (s === '#modal-os' ? modal : s === '#modal-overlay' ? overlay : null), querySelectorAll: s => (s === '#modal-os .card-fs' ? blocos : []),
    getElementById: id => (html.includes(`id="${id}"`) ? el(id) : null), addEventListener() {}, activeElement: null,
    body: {contains: () => false, classList: classes(), appendChild() {}}, visibilityState: 'visible'};
  const salvos = [], toasts = [], desfazer = [];
  const cfg = {instaladores: ['Adriano'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const STORE = {getAllOS: () => lista, getCFG: () => cfg, getOS: id => lista.find(o => o.id === id) || null, elenco: () => ELENCO,
    saveOS(o) { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, uuid: () => 'u1', valores: () => ({}), regrasLocais: () => null, carimbarMomento() {}};
  const ctx = vm.createContext({console, Date: DataFixa, document: doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, STORE, setTimeout() {}, clearTimeout() {}, setInterval() {}, __toasts: toasts, __desfazer: desfazer});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user={nome:'Gestor Teste',papel:'${papel}'}; bindModalEvents=()=>{}; ligarHistoricoAlteracoes=()=>{}; renderActiveTab=()=>{};
    toast=(m,t)=>__toasts.push([m,t||'']); toastDesfazer=(m,fn)=>{__toasts.push([m,'desfazer']); __desfazer.push(fn);};`, ctx);
  const run = code => vm.runInContext(code, ctx);
  const clicar = (hostId, dataset) => doc.getElementById(hostId).onclick({target: {closest: () => ({dataset, disabled: false})}});
  return {run, clicar, salvos, toasts, desfazer, lista, html: () => html};
}

test('F24: tirar alguém da equipe na ficha se desfaz num toque: a equipe da O.S. volta como estava (a mesma ordem) e o componente também', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100002', '100001']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'});
  assert.deepEqual(t.salvos.at(-1).equipe, ['100001'], 'tirar grava na hora, como sempre');
  assert.ok(t.toasts.some(([m, tp]) => m === 'Bia saiu da equipe.' && tp === 'desfazer'), JSON.stringify(t.toasts));
  t.desfazer.at(-1)();
  assert.deepEqual(t.salvos.at(-1).equipe, ['100002', '100001'], 'a equipe de antes, na ordem de antes (não a ordem do componente)');
  assert.deepEqual(js(t.run(`ALOCUI.paraEquipe('ficha-eq:f1').equipe`)).sort(), ['100001', '100002']);
  assert.ok(t.toasts.some(([m, tp]) => m === 'Desfeito' && tp === 'success'));
});

test('F24: o Desfazer da tirada não mexe se a equipe mudou depois; o da última tirada vale', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001', '100002']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'});
  const primeiro = t.desfazer.at(-1);
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100001'});
  assert.deepEqual(t.salvos.at(-1).equipe, []);
  const n = t.salvos.length;
  primeiro();
  assert.equal(t.salvos.length, n, 'nada gravado');
  assert.ok(t.toasts.some(([m, tp]) => /Não deu para desfazer: a O\.S\. mudou depois/.test(m) && tp === 'error'));
  t.desfazer.at(-1)();
  assert.deepEqual(t.salvos.at(-1).equipe, ['100001']);
});

test('F24: no componente, voltar a tirada depois de outra mudança é recusado com o motivo (ALOCUI)', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001', '100002']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  t.run(`__voltas = []; ALOCUI.montar(document.getElementById('ficha-equipe'), 'ficha-eq:f1', {aoTirar: (m, v) => __voltas.push([m, v])});`);
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'});
  assert.equal(t.run('__voltas.length'), 1);
  assert.equal(t.run(`ALOCUI.executar('ficha-eq:f1', {alocAcao: 'remover', g: '0', p: '100001'})`), '');
  assert.match(t.run('__voltas[0][1]()'), /A equipe mudou depois de tirar: não deu para desfazer/);
});

/* ───────────── 5. As fotos de antes e de depois: câmera e galeria; o Layout sem câmera ───────────── */

test('F24: capture="environment" só nas fotos de antes e de depois, com a galeria ao lado; o Layout segue com a galeria', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  const h = t.html();
  const inputs = attr => [...h.matchAll(new RegExp(`<input[^>]*\\s${attr}[^>]*>`, 'g'))].map(m => m[0]);
  for (const attr of ['data-foto-checkin-input', 'data-foto-retorno-input']) {
    const xs = inputs(attr);
    assert.equal(xs.length, 2, attr);
    assert.equal(xs.filter(x => /capture="environment"/.test(x)).length, 1, `${attr}: uma câmera`);
    assert.equal(xs.filter(x => !/capture=/.test(x) && /\smultiple/.test(x)).length, 1, `${attr}: uma galeria`);
  }
  const layout = inputs('data-foto-input="layoutFotoId"');
  assert.equal(layout.length, 1);
  assert.doesNotMatch(layout[0], /capture=/, 'o Layout costuma vir do WhatsApp: galeria');
  assert.match(h, /Fotos de antes \(check-in;/);
  assert.match(h, /Fotos de depois \(serviço pronto;/);
  // A foto da ficha nasce com o id da O.S. (as três chamadas da ficha passam o id).
  const app = ler('app.js');
  assert.equal((app.match(/STORE\.pushPhoto\((?:f|file), draft\.id\)/g) || []).length, 3);
});

/* ════════════════════ A TELA SÓ COM O APP (atalhos, máscara, cliente, rascunho) ════════════════════ */
function telaApp({papel = 'pcp', lista = [], cliente = null} = {}) {
  const ouvintes = {}, timers = [];
  const overlay = {classList: {hidden: false, contains(c) { return c === 'hidden' && this.hidden; }, add() {}, remove() {}, toggle() {}}};
  const estado = {sobreposto: null, etapas: true};
  const doc = {addEventListener: (tp, fn) => (ouvintes[tp] = ouvintes[tp] || []).push(fn), activeElement: null, visibilityState: 'visible',
    getElementById: id => id === 'modal-overlay' ? overlay : id === 'ficha-etapas' && estado.etapas ? {} : null,
    querySelector: s => /wpp-picker-overlay/.test(s) && /conflict-dialog:not\(\.hidden\)/.test(s) ? estado.sobreposto : null, querySelectorAll: () => [],
    createElement: tag => ({tagName: tag.toUpperCase(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }}),
    body: {contains: () => false, classList: {add() {}, remove() {}, contains: () => false}, appendChild() {}}};
  const salvos = [];
  const STORE = {getAllOS: () => lista, getCFG: () => ({instaladores: [], performancePCP: {equipes: []}}), getOS: id => lista.find(o => o.id === id) || null,
    saveOS(o) { salvos.push(js(o)); }, getQueue: () => [], on() {}, elenco: () => ({pessoas: [], antigos: []}), valores: () => ({}), carimbarMomento() {}};
  const ctx = vm.createContext({console, document: doc, window: {addEventListener() {}}, navigator: {onLine: true}, STORE,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; }, setInterval() {}, __feito: [], __toasts: []});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user = {nome: 'Gestor Teste', login: 'gestor', papel: '${papel}'};
    irParaEtapaFicha = (k, o) => { __feito.push(['etapa', k]); return true; }; closeModal = () => __feito.push(['fechar']);
    toast = (m, t) => __toasts.push([m, t || '']);`, ctx);
  const run = c => vm.runInContext(c, ctx);
  const teclar = (ev) => { const e = {preventDefault() { this.parado = true; }, ...ev}; (ouvintes.keydown || []).forEach(fn => fn(e)); return e; };
  const correrTimers = () => { const xs = timers.splice(0); xs.forEach(fn => fn && fn()); };
  return {ctx, run, teclar, overlay, estado, salvos, correrTimers, feito: () => js(ctx.__feito), toasts: ctx.__toasts};
}
const alvo = (tagName, extra = {}) => ({tagName, type: tagName === 'INPUT' ? 'text' : undefined, closest: () => null, ...extra});

/* ───────────── 6. Atalhos da ficha ───────────── */

test('F24: atalho não dispara digitando num campo (texto, número, área, lista, editável); fora do campo troca de etapa, avança e fecha', () => {
  const t = telaApp();
  t.run(`_modalDraft = ${JSON.stringify(osFicha({equipe: ['100001']}))}; STATE.modalOSId = 'f1'; _etapaFicha.set('f1', 'dados');`);
  const teclas = [{key: '2', code: 'Digit2', altKey: true}, {key: '™', code: 'Digit2', altKey: true}, {key: 'Enter', ctrlKey: true}, {key: 'Enter', metaKey: true}, {key: 'Escape'}];
  // Caso ruim: o Esc de quem digita fechava a ficha; o Alt+2 do Mac (que escreve ™) trocava de etapa no meio do texto.
  const campos = [alvo('INPUT'), alvo('INPUT', {type: 'number'}), alvo('INPUT', {type: 'search'}), alvo('INPUT', {type: 'time'}), alvo('TEXTAREA'), alvo('SELECT'), alvo('DIV', {isContentEditable: true})];
  for (const target of campos) for (const k of teclas) {
    const e = t.teclar({...k, target});
    assert.ok(!e.parado, `${target.tagName}/${target.type || ''} ${k.key}: a tecla é do campo`);
  }
  assert.deepEqual(t.feito(), [], 'nada aconteceu na ficha');
  // Fora do campo (um botão, a caixa de seleção): Alt+2 vai à etapa 2; Ctrl+Enter avança; Esc fecha.
  assert.ok(t.teclar({key: '™', code: 'Digit2', altKey: true, target: alvo('BUTTON')}).parado);
  assert.ok(t.teclar({key: 'Enter', ctrlKey: true, target: alvo('INPUT', {type: 'checkbox'})}).parado);
  assert.ok(t.teclar({key: 'Escape', target: alvo('BODY')}).parado);
  assert.deepEqual(t.feito(), [['etapa', 'equipe'], ['etapa', 'equipe'], ['fechar']]);
  // Alt+5 é a quinta etapa da O.S. externa (Fechamento); a interna só tem duas: Alt+3 não faz nada.
  assert.deepEqual(js(t.run(`acaoDoAtalhoFicha({key: '5', code: 'Digit5', altKey: true, target: null}, _modalDraft)`)), {tipo: 'etapa', k: 'fechamento'});
  assert.deepEqual(js(t.run(`acaoDoAtalhoFicha({key: '3', code: 'Digit3', altKey: true}, {...${JSON.stringify(osFicha())}, tipo: 'interno'})`)), {tipo: 'nada'});
  // No Fechamento, Ctrl+Enter não tem para onde ir.
  t.run(`_etapaFicha.set('f1', 'fechamento')`);
  assert.deepEqual(js(t.run(`acaoDoAtalhoFicha({key: 'Enter', ctrlKey: true}, _modalDraft)`)), {tipo: 'nada'});
});

test('F24: atalho não dispara com outra janela por cima da ficha, com a ficha fechada ou com outro modal no lugar dela', () => {
  const t = telaApp();
  t.run(`_modalDraft = ${JSON.stringify(osFicha())}; STATE.modalOSId = 'f1';`);
  t.estado.sobreposto = {};   // a pergunta do retrabalho, o diálogo de entrega, o conflito de edição
  assert.ok(!t.teclar({key: 'Escape', target: alvo('BODY')}).parado);
  t.estado.sobreposto = null;
  t.overlay.classList.hidden = true;   // ficha fechada
  assert.ok(!t.teclar({key: 'Escape', target: alvo('BODY')}).parado);
  t.overlay.classList.hidden = false; t.estado.etapas = false;   // Espelhos e Instruções usam o mesmo #modal-overlay
  assert.ok(!t.teclar({key: 'Escape', target: alvo('BODY')}).parado);
  t.estado.etapas = true;
  // A lista do cliente: o Esc dela fecha a lista, não a ficha.
  assert.ok(!t.teclar({key: 'Escape', target: alvo('BUTTON', {closest: s => s === '.cli-sug' ? {} : null})}).parado);
  assert.deepEqual(t.feito(), []);
  // E a ficha em etapas usa a API da F23 sem mudá-la.
  const app = ler('app.js');
  assert.match(app, /else if \(a\.tipo === 'etapa'\) irParaEtapaFicha\(a\.k, \{ foco: 'titulo' \}\);/);
});

/* ───────────── 7. Máscara R$ ───────────── */

test('F24: a máscara converte vírgula e ponto (milhar e centavos dos dois jeitos) e recusa o que não é número', () => {
  const t = telaApp();
  const v = s => t.run(`valorBR(${JSON.stringify(s)})`);
  const casos = [['1.234,56', 1234.56], ['1234,56', 1234.56], ['1234.56', 1234.56], ['1,234.56', 1234.56], ['R$ 1.234,56', 1234.56],
    ['12,5', 12.5], ['12.5', 12.5], ['12,50', 12.5], ['1.234', 1234], ['1.234.567,8', 1234567.8], ['0,99', 0.99], ['50', 50], [',5', 0.5], ['12,', 12]];
  for (const [s, n] of casos) assert.equal(v(s), n, s);
  for (const s of ['', 'abc', '12a', '1.2.3', '-5', '1,2,3', '1.234,5,6']) assert.ok(Number.isNaN(v(s)), `${s} não é valor`);
  assert.equal(t.run(`fmtValorBR(1234567.8)`), '1.234.567,80');
  assert.equal(t.run(`fmtValorBR(0.5)`), '0,50');
  // Caso ruim: o valor unitário do PDF ('1234.56') lido pelo parseBRNumber dava 123456 ao mudar a quantidade.
  assert.equal(t.run(`parseBRNumber('1234.56')`), 123456);
  assert.equal(t.run(`subtotalDoItem({qtde: '2', valorUnit: '1234.56'})`), 2469.12);
});

test('F24: o campo R$ do item grava o valor unitário com ponto decimal, recalcula o subtotal e mostra 1.234,56 ao sair', () => {
  const t = telaApp();
  t.run(`_modalDraft = {id: 'm1', numero: '', tipo: 'externo', itens: [{uid: 'm-1', item: '1', descricao: 'Placa', qtde: '3', valorUnit: '0', subtotal: 0, manual: true}]};`);
  const attrs = {};
  t.ctx.__inp = {dataset: {valorItem: '0', iuid: 'm-1'}, value: '', setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, getAttribute: k => attrs[k] ?? null};
  t.ctx.__sub = {dataset: {valorSub: '0'}, textContent: ''};
  t.run(`ligarValoresDaFicha({querySelectorAll: s => s === '[data-valor-item]' ? [__inp] : s === '[data-valor-sub]' ? [__sub] : []}, false)`);
  const digitar = s => { t.ctx.__inp.value = s; t.run('__inp.oninput()'); };
  digitar('1.234,56');
  assert.equal(t.run('_modalDraft.itens[0].valorUnit'), '1234.56');
  assert.equal(t.run('_modalDraft.itens[0].subtotal'), 3703.68);
  assert.equal(t.ctx.__sub.textContent, 'R$ 3.703,68');
  digitar('12.5');
  assert.equal(t.run('_modalDraft.itens[0].valorUnit'), '12.5');
  assert.equal(t.run('_modalDraft.itens[0].subtotal'), 37.5);
  // Caso ruim: letra no meio não vira zero calado.
  digitar('12x');
  assert.equal(attrs['aria-invalid'], 'true');
  assert.equal(t.run('_modalDraft.itens[0].valorUnit'), '12.5', 'o valor de antes fica');
  t.run('__inp.onblur()');
  assert.equal(t.ctx.__inp.value, '12,50');
  assert.ok(t.toasts.some(([m, tp]) => /Valor inválido/.test(m) && tp === 'error'));
  // Só admin e pcp veem R$, só na O.S. manual, e só o item manual tem campo.
  const it = JSON.stringify({uid: 'm-1', item: '1', qtde: '3', valorUnit: '12.5', subtotal: 37.5, manual: true});
  assert.match(t.run(`valorItemHTML(${it}, 0, {tipo: 'externo'}, false, '', 6)`), /data-valor-item="0"[^>]*value="12,50"/);
  assert.match(t.run(`valorItemHTML(${it}, 0, {tipo: 'externo'}, false, '', 6)`), /Subtotal <strong[^>]*>R\$ 37,50</);
  assert.equal(t.run(`valorItemHTML(${it}, 0, {tipo: 'externo', origemMubisys: true}, false, '', 6)`), '', 'O.S. do ERP: o valor é do ERP');
  assert.doesNotMatch(t.run(`valorItemHTML(${it}, 0, {tipo: 'externo'}, true, '', 6)`), /<input/, 'somente leitura: sem campo');
  t.run(`STATE.user.papel = 'operacao'`);
  assert.equal(t.run(`valorItemHTML(${it}, 0, {tipo: 'externo'}, false, '', 6)`), '', 'a operação não vê R$');
});

/* ───────────── 8. Cliente tolerante ───────────── */

test('F24: o cliente é achado com erro de digitação, a partir dos clientes das O.S. do aparelho', () => {
  const lista = [
    {id: 'a1', cliente: 'Padaria São José'}, {id: 'a2', cliente: 'Padaria São José'}, {id: 'a3', cliente: 'PADARIA SAO JOSE'},
    {id: 'a4', cliente: 'Mercado Bom Preço'}, {id: 'a5', cliente: 'Loja 2 Centro'}, {id: 'a6', cliente: ''}, {id: 'f1', cliente: 'Cliente Da Ficha Aberta'}];
  const t = telaApp({lista});
  const clientes = js(t.run(`clientesDoAparelho('f1')`));
  assert.deepEqual(clientes.map(c => [c.nome, c.n]).sort(), [['Loja 2 Centro', 1], ['Mercado Bom Preço', 1], ['Padaria São José', 3]], 'a grafia mais usada, uma vez cada; sem a própria O.S.');
  const busca = q => js(t.run(`buscarClientes(${JSON.stringify(q)}, clientesDoAparelho('f1'))`)).map(c => [c.nome, c.tipo]);
  // Caso ruim: "padaira" (letras trocadas) e "jsoe" não achavam nada no texto exato.
  assert.deepEqual(busca('padaira sao jose'), [['Padaria São José', 'sugestao']]);
  assert.deepEqual(busca('Padaria Sao Jsoe'), [['Padaria São José', 'sugestao']]);
  assert.deepEqual(busca('merc'), [['Mercado Bom Preço', 'achado']]);
  assert.deepEqual(busca('loja 2'), [['Loja 2 Centro', 'achado']], 'com número, pelo pedaço');
  assert.deepEqual(busca('Mercado Bom Preço'), [], 'o que já está digitado não vira sugestão');
  assert.deepEqual(busca('x'), [], 'uma letra só não busca');
  assert.deepEqual(busca('ferragens'), []);
  // Na ficha: a lista aparece com "Você quis dizer" para a sugestão.
  const ouv = {}, caixa = {hidden: true, innerHTML: '', querySelectorAll: () => [], contains: () => false};
  t.ctx.__inp = {readOnly: false, value: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener: (tp, fn) => { ouv[tp] = fn; }};
  t.ctx.__caixa = caixa;
  t.run(`_modalDraft = {id: 'f1'}; ligarClienteTolerante({querySelector: s => s === 'input[data-f="cliente"]' ? __inp : s === '#cli-sug' ? __caixa : null})`);
  assert.equal(t.ctx.__inp.attrs['aria-controls'], 'cli-sug');
  t.ctx.__inp.value = 'padaira sao jose'; ouv.input();
  assert.equal(caixa.hidden, false);
  assert.match(caixa.innerHTML, /Você quis dizer<\/p><button type="button" role="option" class="cli-sug-op" data-cli-nome="Padaria São José">/);
  // A O.S. do ERP (cliente travado) não liga a lista.
  const ouv2 = {};
  t.ctx.__inp2 = {readOnly: true, setAttribute() {}, addEventListener: (tp, fn) => { ouv2[tp] = fn; }};
  t.run(`ligarClienteTolerante({querySelector: s => s === 'input[data-f="cliente"]' ? __inp2 : s === '#cli-sug' ? __caixa : null})`);
  assert.deepEqual(Object.keys(ouv2), []);
});

/* ───────────── 9. Movimento reduzido ───────────── */

// As regras do styles.css com o media query em que moram (o mesmo leitor do estilo.test.cjs).
function regras(fonte) {
  const s = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0, media = '', prof = 0;
  while (i < s.length) {
    const ab = s.indexOf('{', i);
    if (ab < 0) break;
    const fecha = s.indexOf('}', i);
    if (fecha >= 0 && fecha < ab) { prof--; if (prof === 0) media = ''; i = fecha + 1; continue; }
    const cab = s.slice(i, ab).trim();
    if (cab.startsWith('@')) { media = cab; prof++; i = ab + 1; continue; }
    const fim = s.indexOf('}', ab);
    const decl = {};
    for (const d of s.slice(ab + 1, fim).split(';')) { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
    for (const sel of cab.split(',')) out.push({sel: sel.trim().replace(/\s+/g, ' '), decl, media});
    i = fim + 1;
  }
  return out;
}

test('F24: prefers-reduced-motion desliga as transições e as animações do app inteiro; as da F24 só existem com o movimento liberado', () => {
  const R = regras(ler('styles.css'));
  const reduz = R.filter(r => /prefers-reduced-motion\s*:\s*reduce/.test(r.media));
  const todos = sel => reduz.find(r => r.sel === sel);
  for (const sel of ['*', '*::before', '*::after']) {
    const r = todos(sel);
    assert.ok(r, `${sel} dentro do movimento reduzido`);
    assert.equal(r.decl['transition-duration'], '.01ms !important');
    assert.equal(r.decl['transition-delay'], '0s !important');
    assert.equal(r.decl['animation-duration'], '.01ms !important');
    assert.equal(r.decl['animation-iteration-count'], '1 !important');
  }
  // Caso ruim: uma regra com !important de duração de transição ou animação fora do bloco venceria o desligar.
  const fura = R.filter(r => !/reduce/.test(r.media) && Object.entries(r.decl).some(([k, v]) => /^(transition|animation)/.test(k) && /!important/.test(v)));
  assert.deepEqual(fura.map(r => r.sel), []);
  // As animações novas (a etapa que chega, a lista do cliente, o passo do stepper) só com movimento liberado.
  for (const sel of ['.ficha-etapa.fe-entrou', '.cli-sug:not([hidden])', '.fe-passo']) {
    const xs = R.filter(r => r.sel === sel && Object.keys(r.decl).some(k => /^(transition|animation)/.test(k)));
    assert.ok(xs.length, sel);
    for (const r of xs) assert.match(r.media, /prefers-reduced-motion\s*:\s*no-preference/, sel);
  }
  // E curtas: nenhuma passa de 200 ms.
  for (const r of R.filter(r => /no-preference/.test(r.media) && /fe-entrou|cli-sug|fe-passo/.test(r.sel))) {
    for (const v of Object.values(r.decl)) for (const m of String(v).matchAll(/(\d*\.?\d+)s\b/g)) assert.ok(Number(m[1]) <= 0.2, `${r.sel}: ${v}`);
  }
});

/* ───────────── 10. A foto ligada à O.S. passa nos dois validadores ───────────── */

test('F24: o fileId novo (foto_<osId>_<hora>_<sorteio>) passa no putPhoto do pcp-sync e no idFoto do _shared, com UUID e com mub-número', async () => {
  const b = await bancada({registros: [row('1', agendada())]});
  const UUID = '3f2b8c9e-1d4a-4b6f-9a7e-0c5d2e8f1a3b';
  const doUUID = b.run(`STORE.novoIdFoto(${JSON.stringify(UUID)})`), doERP = b.run(`STORE.novoIdFoto('mub-23364')`);
  assert.match(doUUID, new RegExp(`^foto_${UUID}_\\d{13}_[a-z0-9]{1,6}$`));
  assert.match(doERP, /^foto_mub-23364_\d{13}_[a-z0-9]{1,6}$/);
  assert.ok(doUUID.length <= 62 && doUUID.length > 55, `UUID: ${doUUID.length} caracteres`);
  assert.ok(doERP.length <= 36, `mub-número: ${doERP.length} caracteres`);
  // Sem O.S. (o celular) ou com id que não cabe: o formato antigo.
  assert.match(b.run(`STORE.novoIdFoto()`), /^foto_\d{13}_[a-z0-9]{1,6}$/);
  assert.match(b.run(`STORE.novoIdFoto('../x')`), /^foto_\d{13}_[a-z0-9]{1,6}$/);
  assert.match(b.run(`STORE.novoIdFoto('${'a'.repeat(61)}')`), /^foto_\d{13}_/);
  // Régua 1: o putPhoto do pcp-sync (crachá de toque e gestão).
  const subidas = [];
  b.e.cliente.storage = {from: () => ({upload: async id => { subidas.push(id); return {error: null}; }})};
  const jpg = 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64');
  const toque = {nome: 'Ana', sub: 'Ana', id: '100001', papel: 'montagem', montagemIndividual: true};
  for (const id of [doUUID, doERP, 'foto_1758300000000_abc123']) {
    for (const quem of [GESTOR, toque]) {
      const r = await b.e.call({action: 'putPhoto', base64: jpg, mime: 'image/jpeg', fileId: id}, quem);
      assert.equal(r.status, 200, `${id}: ${JSON.stringify(r)}`);
      assert.equal(r.fileId, id);
    }
  }
  // Caso ruim: id com caminho, com a O.S. de outro formato ou comprido demais.
  for (const id of ['foto_../rh_1758300000000_abc123', 'foto_a/b_1758300000000_abc123', `foto_${'a'.repeat(61)}_1758300000000_abc123`, 'foto_x_y_1758300000000_abc123', `foto_${'a'.repeat(60)}_17583000000000000000000000000000_abc123`])
    assert.equal((await b.e.call({action: 'putPhoto', base64: jpg, fileId: id}, toque)).status, 422, id);
  // Régua 2: o idFoto do _shared ([\w.-]{1,100}), na mescla do celular e na volta da equipe.
  const {mesclarToqueNoNome, sanearVoltaEquipe} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const m = mesclarToqueNoNome({id: '1', rev: 1, fotosCheckinIds: [], fotosRetornoIds: []}, {id: '1', rev: 1, fotosCheckinIds: [doUUID, doERP, 'foto/../x'], fotosRetornoIds: ['x'.repeat(101)]}, 'Ana', agora());
  assert.deepEqual(m.os.fotosCheckinIds, [doUUID, doERP]);
  assert.deepEqual(m.os.fotosRetornoIds, []);
  const v = sanearVoltaEquipe({carroLimpo: 'sim', fotos: [doUUID, doERP]}, null, {nome: 'Ana', sub: '100001'}, agora());
  assert.deepEqual(v.fotos, [doUUID, doERP]);
});

/* ───────────── 11. O celular só mudou os rótulos ───────────── */

test('F24: o celular do instalador (equipe.js) só mudou os rótulos de antes e de depois, iguais aos da gestão', () => {
  const atual = ler('equipe.js');
  // A troca que a F24 fez, ao contrário: desfeita, o arquivo é byte a byte o da v143 (5fbf568).
  const TROCAS = [
    ['Fotos de check-in, ao chegar (pelo menos 1 para finalizar)', 'Fotos de antes (check-in, ao chegar; pelo menos 1 para finalizar)'],
    ['📷 Foto de check-in', '📷 Tirar foto de antes'],
    ['Fotos do serviço pronto (pelo menos 1 para finalizar)', 'Fotos de depois (serviço pronto; pelo menos 1 para finalizar)'],
    ['<span class="foto-hint">📷 Tirar foto</span><input type="file" accept="image/*" capture="environment" data-retorno>', '<span class="foto-hint">📷 Tirar foto de depois</span><input type="file" accept="image/*" capture="environment" data-retorno>'],
  ];
  let velho = atual;
  for (const [antes, depois] of TROCAS) {
    assert.equal(velho.split(depois).length, 2, depois);
    velho = velho.replace(depois, antes);
  }
  /* Se uma fatia nova mudar o equipe.js de propósito, este número muda junto
     (o hash do equipe.js de antes da F24, com os rótulos desfeitos). */
  const BASE_V143 = '325745ac619485b37c3bc1b786488362c1760aebba1cbd86a9e1c2437b948c76';
  assert.equal(crypto.createHash('sha256').update(velho).digest('hex'), BASE_V143, 'fora os rótulos, nada mudou no celular');
  // A gestão usa os mesmos rótulos.
  const app = ler('app.js');
  assert.match(atual, /Fotos de antes \(check-in/); assert.match(app, /Fotos de antes \(check-in/);
  assert.match(atual, /Fotos de depois \(serviço pronto/); assert.match(app, /Fotos de depois \(serviço pronto/);
  assert.match(atual, /📷 Tirar foto de antes/); assert.match(app, /📷 Tirar foto de \$\{quando\}/);
  // O celular não chama nada da F24.
  assert.doesNotMatch(atual, /novoIdFoto|oferecerDesfazer|acaoDoAtalhoFicha|valorBR|ligarRascunhoForm/);
});

/* ───────────── 12. Rascunho dos diálogos ───────────── */

function formFalso(campos) {
  const ouv = {};
  const els = Object.entries(campos).map(([name, value]) => ({name, value, type: 'textarea', tagName: 'TEXTAREA'}));
  return {els, firstChild: null, aviso: null, addEventListener: (tp, fn) => (ouv[tp] = ouv[tp] || []).push(fn), querySelectorAll: () => els,
    insertBefore(n) { this.aviso = n; }, digitar(name, v) { const el = els.find(x => x.name === name); el.value = v; (ouv.input || []).forEach(fn => fn({target: el})); }};
}
test('F24: o rascunho do diálogo guarda o que foi digitado por tela e O.S., volta ao reabrir e some quando dá certo', async () => {
  const t = telaApp();
  const ligar = (f, tela, os) => { t.ctx.__f = f; return t.run(`ligarRascunhoForm(__f, ${JSON.stringify(tela)}, ${JSON.stringify(os)})`); };
  const f1 = formFalso({motivo: ''});
  ligar(f1, 'cancelar', 'os1');
  await tique();
  f1.digitar('motivo', 'O cliente desistiu da instalação fictícia');
  t.correrTimers(); await tique();
  // Caso ruim: a tela fechou (o WhatsApp descartou a aba) e o motivo sumia.
  const f2 = formFalso({motivo: ''});
  const r2 = ligar(f2, 'cancelar', 'os1');
  await tique();
  assert.equal(f2.els[0].value, 'O cliente desistiu da instalação fictícia');
  assert.match(f2.aviso.textContent, /não chegou a gravar/);
  // Outra O.S. e outra tela não recebem o rascunho.
  const f3 = formFalso({motivo: ''}); ligar(f3, 'cancelar', 'os2');
  const f4 = formFalso({motivo: ''}); ligar(f4, 'abonar', 'os1');
  await tique();
  assert.equal(f3.els[0].value, ''); assert.equal(f4.els[0].value, '');
  // O que a pessoa digitou nesta abertura, antes de o rascunho chegar, não é trocado.
  const f5 = formFalso({motivo: ''});
  ligar(f5, 'cancelar', 'os1');
  f5.digitar('motivo', 'Texto novo digitado agora');
  await tique();
  assert.equal(f5.els[0].value, 'Texto novo digitado agora');
  // Deu certo: apaga.
  r2.limpar(); await tique();
  const f6 = formFalso({motivo: ''}); ligar(f6, 'cancelar', 'os1'); await tique();
  assert.equal(f6.els[0].value, '');
  // Rascunho com mais de 7 dias não volta.
  t.run(`_rascMem.set(chaveRascunhoF24('abonar', 'os9'), {em: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), valores: {motivo: 'velho'}})`);
  const f7 = formFalso({motivo: ''}); ligar(f7, 'abonar', 'os9'); await tique();
  assert.equal(f7.els[0].value, '');
  // As três telas ligam o rascunho; sair do app apaga a base.
  const app = ler('app.js');
  assert.match(app, /rascunho: \{ tela: 'abonar', osId: os\.id \}/);
  assert.match(app, /rascunho: \{ tela: 'cancelar', osId: id \}/);
  assert.match(app, /ligarRascunhoForm\(form, 'retrabalho', os\.id/);
  assert.match(ler('store.js'), /indexedDB\.deleteDatabase\('impresilk_rascunhos'\)/);
});

/* ───────────── 13. Seletores nativos de data e hora ───────────── */

test('F24: data e hora da gestão são seletores nativos (nenhum campo de data ou hora em texto livre)', () => {
  const livres = [];
  for (const f of ['app.js', 'casa.js', 'lote.js', 'entregas-os.js', 'performance.js', 'alocacao-ui.js']) {
    for (const m of ler(f).matchAll(/<input\b[^>]*>/g)) {
      const tag = m[0];
      const nome = (/\sdata-f="([^"]*)"/.exec(tag) || /\sname="([^"]*)"/.exec(tag) || /\sid="([^"]*)"/.exec(tag) || [])[1] || '';
      // instalacao.data, dataEntrada, confHora, horaSaida, prazo-corr-data, rp-hora-<dia>, inicio, fim, ...Em (a duração em dias não é data).
      if (!/(^|[.-])(data|hora|dia|inicio|fim)($|[.-]|[A-Z])|(Data|Hora)([A-Z]|$)|Em$/.test(nome)) continue;
      if (/\stype="(date|time|month|datetime-local|hidden)"/.test(tag)) continue;
      livres.push(`${f}: ${tag.slice(0, 120)}`);
    }
  }
  assert.deepEqual(livres, []);
});
