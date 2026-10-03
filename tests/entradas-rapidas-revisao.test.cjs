/* ENTRADAS RÁPIDAS (F24): as correções das duas revisões (corretude e uso).
 *
 * Um teste "revisão: ..." por defeito, começando pelo caso ruim: cada um
 * falha no 914e0e7 (a F24 antes da revisão) ou na junção com a F23 corrigida
 * (0216c57), e passa depois da correção. As bancadas são as da F24: a tela
 * (app.js) com o store de verdade (store.js), falando com o pcp-sync de
 * verdade (helpers/edge.cjs), num DOM de mentira; e, para a foto, o pcp-sync
 * da v143 tirado do git (fc0df82), o que está no ar antes da F24.
 * Tudo fictício: o repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const tique = () => new Promise(r => setTimeout(r, 2));

/* ════════════════════ BANCADA 1: tela + store + servidor de verdade ════════════════════ */
const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'), ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('gestora2-f', 'Gestora Dois', 'gestora2', '22233344455'), ficha('olga-f', 'Olga Balcão', 'operacao1', '12312312312')];
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const GESTORA2 = {papel: 'admin', nome: 'Gestora Dois', sub: 'gestora2'};
const OPERACAO_C = {papel: 'operacao', nome: 'Olga Balcão', sub: 'operacao1'};
const agora = () => new Date().toISOString();
const hojeSP = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
// Ontem às `h`:`m` no horário de São Paulo (a suíte roda com TZ=America/Sao_Paulo).
const ontemAs = (h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(h, m, 0, 0); return d.toISOString(); };
const row = (id, registro, rev = 1) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id, rev, atualizadoEm: '2026-09-19T10:00:00.000Z', ...registro}});
const agendada = (extra = {}) => ({numero: '9101', tipo: 'externo', cliente: 'Cliente Fictício', equipe: ['100001'], responsavelPCP: 'Gestor Teste',
  liberadoPCP: true, aptoPor: 'Gestor Teste', aptoEm: '2026-09-28T12:00:00.000Z', instalacao: {data: hojeSP(), periodo: 'Manhã', hora: '', duracaoDias: 1},
  confirmacao: '', confPor: '', confEm: '', confHora: '', carroLiberado: false, carroLiberadoPor: '', carroLiberadoEm: '', ...extra});
const pronta = (extra = {}) => agendada({numero: '9105', confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00',
  embarqueConferidoPor: 'Gestor Teste', produtosConferidosPor: 'Gestor Teste', ferramentasConferidas: true, carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: agora(),
  horaSaida: '08:00', saidaEm: agora(), instalacaoOK: true, conferidoPor: 'Gestor Teste', fotosCheckinIds: ['foto_1758300000000_abc123'], fotosRetornoIds: ['foto_1758300000001_def456'],
  horaRetorno: '15:00', retornoEm: agora(), checkout: {situacao: '', hora: '', por: '', obs: 'obs fictícia', confirmado: false},
  itens: [{uid: '9105:1:1', item: '1', descricao: 'Placa fictícia', qtde: '1', pronto: true}], ...extra});
// A O.S. que o instalador marcou como retrabalho no espelho, com a descrição.
const marcadaRetrabalho = (extra = {}) => pronta({retrabalho: true, problema: 'Placa torta fictícia', etapaOrigem: 'Produção', causaRaiz: 'Material',
  responsavelEtapa: 'Produção', dataRetrabalho: '2026-09-30', checkout: {situacao: 'Retrabalho', hora: '', por: '', obs: 'obs fictícia', confirmado: false}, ...extra});
const gravada = (e, id = '1') => js(e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro);

// IndexedDB de mentira com armazéns de verdade (get/put/delete por chave), criados quando pedidos.
function fakeIDB() {
  const stores = new Map();
  const loja = n => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
  const apagadas = [];
  const db = {objectStoreNames: {contains: () => true}, close() {}, transaction() {
    const tx = {objectStore: n => ({
      get(k) { const req = {}; queueMicrotask(() => req.onsuccess?.({target: {result: loja(n).has(k) ? js(loja(n).get(k)) : null}})); queueMicrotask(() => { req.result = loja(n).has(k) ? js(loja(n).get(k)) : null; }); return req; },
      put(v, k) { queueMicrotask(() => { loja(n).set(k !== undefined ? k : v.id, js(v)); tx.oncomplete?.(); }); },
      delete(k) { queueMicrotask(() => { loja(n).delete(k); tx.oncomplete?.(); }); },
    })};
    return tx;
  }};
  return {db, stores, loja, apagadas,
    api: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: db}})); return q; }, deleteDatabase: nome => { apagadas.push(nome); }}};
}

// O DOM de mentira: um elemento por seletor; o elemento acha os de dentro pelo mesmo seletor (o diálogo do retrabalho).
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => {
    const ouv = {};
    const e = {tag, tagName: String(tag).toUpperCase(), id: '', className: '', innerHTML: '', textContent: '', value: '', dataset: {}, hidden: false, style: {}, attributes: [],
      classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
      setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, removeAttribute(k) { delete this['attr:' + k]; }, focus() {},
      addEventListener(tp, fn) { (ouv[tp] = ouv[tp] || []).push(fn); }, ouv,
      remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
      querySelector: sel => no(sel), querySelectorAll: () => [], closest: () => null, append() {}, contains: () => false,
      insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }};
    if (tag === 'canvas') Object.assign(e, {getContext: () => ({drawImage() {}}), toDataURL: () => 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64')});
    return e;
  };
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const body = el('body');
  const ouvDoc = {};
  const doc = {activeElement: null, body, addEventListener: (tp, fn) => (ouvDoc[tp] = ouvDoc[tp] || []).push(fn), querySelector: sel => no(sel), querySelectorAll: () => [],
    getElementById: id => porId.get(id) || null, createElement: tag => el(tag)};
  return {doc, no, ouvDoc};
}

/* O pcp-sync da v143 (fc0df82), o que está no ar antes da F24, tirado do git.
   Sem o histórico (a CI do Pages), o teste que precisa dele é pulado. */
function pcpSyncV143() {
  let src;
  // PCP_REPO: rodar este teste numa cópia sem .git (a prova do caso ruim nos commits de antes) lendo o histórico do repositório.
  try { src = execFileSync('git', ['show', 'fc0df82:supabase/functions/pcp-sync/index.ts'], {cwd: process.env.PCP_REPO || RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; }
  if (!/Identificação da foto inválida/.test(src)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-sync-v143-'));
  fs.writeFileSync(path.join(dir, 'index.ts'), src);
  return path.relative(path.join(RAIZ, 'supabase/functions'), dir);
}

async function bancada({registros = [], papel = 'pcp', cracha = GESTOR, servidor = 'pcp-sync', confirmar = () => true} = {}) {
  const e = await edge(servidor, {pcp_registros: registros, registros: structuredClone(FICHAS),
    pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}], equipe_contas: [{sistema: 'pcp', usuario: 'operacao1'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const idb = fakeIDB();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const perguntas = [];
  let quem = cracha;
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}}, location: {reload() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k)},
    indexedDB: idb.api, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, AbortController, API_BASE: 'http://teste',
    URL: {createObjectURL: () => 'blob:x', revokeObjectURL() {}},
    Image: class { set src(_v) { this.width = 10; this.height = 10; queueMicrotask(() => this.onload()); } },
    FormData: class { constructor(f) { this.f = f; } get(k) { return (this.f.__valores || {})[k]; } },
    fetch: async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; },
    document: d.doc, confirm: msg => { perguntas.push(String(msg)); return confirmar(String(msg)); }, __toasts: [], __desfazer: []});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  const run = c => vm.runInContext(c, ctx);
  run(`STATE.user = {nome: ${JSON.stringify(cracha.nome)}, papel: ${JSON.stringify(papel)}, usuario: ${JSON.stringify(cracha.sub)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t || '']); toastDesfazer = (m, fn, o) => { __toasts.push([m, 'desfazer', (o && o.chave) || '']); __desfazer.push(fn); };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await tique(); } };
  return {e, S, run, d, idb, perguntas, esvaziar, toasts: ctx.__toasts, desfazer: ctx.__desfazer, ctx,
    trocarCracha: c => { quem = c; },
    abrir: id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false; bindModalEvents(_modalDraft, false);`),
    tocar: sel => d.no(sel).onclick(),
    draft: () => js(run('_modalDraft'))};
}

/* ─────────── Corretude M1: o Desfazer do Finalizar volta a resposta do retrabalho ─────────── */

test('revisão: M1, o "Não" que desmarca o retrabalho no Finalizar da ficha volta com o Desfazer, no servidor (retrabalho, descrição e situação)', async () => {
  const b = await bancada({registros: [row('1', marcadaRetrabalho())]});
  assert.equal(gravada(b.e).retrabalho, true);
  b.abrir('1');
  b.run(`finalizarComSaldo = (os, seguir) => seguir('sem-saldo');`);
  b.run('finalizarDaFicha(false)');
  // A pergunta do retrabalho de verdade (perguntarRetrabalho): "Não" de quem é do PCP, numa O.S. marcada, confirmado.
  b.tocar('#retrab-nao');
  assert.ok(b.perguntas.some(p => /Responder Não desmarca o retrabalho/.test(p)));
  await b.esvaziar();
  let g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  assert.equal(g.retrabalho, false, 'o "Não" desmarcou');
  // Caso ruim: o Desfazer dizia "Desfeito" e deixava o retrabalho desmarcado (a O.S. passava a pontuar).
  b.desfazer.at(-1)();
  await b.esvaziar();
  g = gravada(b.e);
  assert.ok(!g.finalizadaEm, 'a finalização voltou');
  assert.equal(g.retrabalho, true, 'o retrabalho voltou marcado');
  assert.equal(g.problema, 'Placa torta fictícia');
  assert.equal(g.etapaOrigem, 'Produção');
  assert.equal(g.causaRaiz, 'Material');
  assert.equal(g.responsavelEtapa, 'Produção');
  assert.equal(g.checkout.situacao, 'Retrabalho', 'a situação de antes da pergunta');
  assert.equal(g.checkout.obs, 'obs fictícia');
  assert.equal(g.retrabalhoPerguntado ?? null, null, 'a resposta dada no gesto saiu (não havia antes)');
  assert.equal(b.S.getQueue().length, 0, 'nada preso na fila');
  assert.ok(b.toasts.some(([m]) => m === 'Desfeito: a O.S. 9105 voltou a ficar aberta e a resposta do retrabalho voltou a ser a de antes.'), JSON.stringify(b.toasts));
});

test('revisão: M1, o "Sim" do retrabalho dado no Finalizar também volta com o Desfazer (a gestão)', async () => {
  const b = await bancada({registros: [row('1', pronta())]});
  b.abrir('1');
  b.run(`finalizarComSaldo = (os, seguir) => seguir('sem-saldo');`);
  b.run('finalizarDaFicha(false)');
  b.tocar('#retrab-sim');
  const form = b.d.no('#retrab-form');
  form.__valores = {problema: 'Adesivo descolou (fictício)', etapaOrigem: 'Instalação', causaRaiz: 'Erro humano', responsavelEtapa: 'Instalação', dataRetrabalho: hojeSP()};
  form.onsubmit({preventDefault() {}});
  await b.esvaziar();
  assert.equal(gravada(b.e).retrabalho, true, 'o "Sim" marcou');
  // Caso ruim: o retrabalho marcado pela pergunta continuava marcado depois do "Desfeito".
  b.desfazer.at(-1)();
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(!g.finalizadaEm);
  assert.ok(!g.retrabalho, 'o retrabalho marcado no gesto saiu');
  assert.equal(g.problema ?? '', '');
  assert.equal(g.retrabalhoPerguntado ?? null, null);
});

test('revisão: M1, no card (E4) o retrato do retrabalho também é de antes da pergunta', async () => {
  const b = await bancada({registros: [row('1', marcadaRetrabalho())]});
  b.run(`finalizarComSaldo = (os, seguir) => seguir('sem-saldo');`);
  b.run(`finalizarServicoDoCard('1')`);
  b.tocar('#retrab-nao');
  await b.esvaziar();
  assert.equal(gravada(b.e).retrabalho, false);
  // Caso ruim: a lista de campos do card tinha a resposta, mas o retrato era de depois dela.
  b.desfazer.at(-1)();
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(!g.finalizadaEm);
  assert.equal(g.retrabalho, true);
  assert.equal(g.problema, 'Placa torta fictícia');
  assert.equal(g.checkout.situacao, 'Retrabalho');
  assert.ok(b.toasts.some(([m]) => m === 'Desfeito: a finalização da O.S 9105'), JSON.stringify(b.toasts));
});

test('revisão: M1, quem não é da gestão e marcou retrabalho no Finalizar não recebe o Desfazer de um toque (o servidor não desmarcaria)', async () => {
  const b = await bancada({registros: [row('1', pronta())], papel: 'operacao', cracha: OPERACAO_C});
  b.abrir('1');
  b.run(`finalizarComSaldo = (os, seguir) => seguir('sem-saldo');`);
  b.run('finalizarDaFicha(false)');
  b.tocar('#retrab-sim');
  const form = b.d.no('#retrab-form');
  form.__valores = {problema: 'Adesivo descolou (fictício)', etapaOrigem: 'Instalação', causaRaiz: 'Erro humano', responsavelEtapa: 'Instalação', dataRetrabalho: hojeSP()};
  form.onsubmit({preventDefault() {}});
  // Caso ruim: o Desfazer era oferecido e a volta do retrabalho seria recusada calada pelo servidor (guardarRetrabalho).
  assert.equal(b.desfazer.length, 0, 'sem o Desfazer de um toque');
  assert.ok(b.toasts.some(([m]) => /^Instalação da O\.S\. 9105 finalizada 🏁\. Para desfazer, fale com o PCP\.$/.test(m)), JSON.stringify(b.toasts));
  // E no card, o mesmo.
  const c = await bancada({registros: [row('1', pronta())], papel: 'operacao', cracha: OPERACAO_C});
  c.run(`finalizarComSaldo = (os, seguir) => seguir('sem-saldo');`);
  c.run(`finalizarServicoDoCard('1')`);
  c.tocar('#retrab-sim');
  const f2 = c.d.no('#retrab-form');
  f2.__valores = form.__valores;
  f2.onsubmit({preventDefault() {}});
  assert.equal(c.desfazer.length, 0);
  assert.ok(c.toasts.some(([m]) => /Para desfazer, fale com o PCP\.$/.test(m)));
});

/* ─────────── Corretude B1: o rascunho é da conta e sai com a sessão ─────────── */

test('revisão: B1, o rascunho é por conta (usuario), não pelo nome; a sessão que expira e o crachá de outra pessoa apagam a base', async () => {
  const b = await bancada();
  // Caso ruim: duas contas com o mesmo nome no mesmo aparelho viam o rascunho uma da outra.
  b.run(`STATE.user = {nome: 'Thiago', papel: 'pcp', usuario: 'thiago'}`);
  const a = b.run(`chaveRascunhoF24('cancelar', 'os-1')`);
  b.run(`STATE.user = {nome: 'Thiago', papel: 'montagem', usuario: 'montagem-thiago'}`);
  const c = b.run(`chaveRascunhoF24('cancelar', 'os-1')`);
  assert.notEqual(a, c);
  assert.equal(a, 'thiago|cancelar|os-1');
  // A sessão que expira (AUTH.eu() === false): a base dos rascunhos sai, não só no Sair.
  const boot = async (saved, dono) => {
    b.idb.apagadas.length = 0;
    b.ctx.AUTH = {temCracha: () => true, dono: () => dono, eu: async () => false, esquecer() {}};
    b.run(`STORE.getUser = () => (${JSON.stringify(saved)}); STORE.setUser = () => {}; enterApp = () => {}; wireLoginChooser = () => {}; crachaEhToque = () => false;
      _rascMem.set('x|cancelar|os-1', {em: nowISO(), valores: {motivo: 'motivo fictício'}});`);
    b.run('initLogin()');
    await tique(); await tique();
    return {apagadas: [...b.idb.apagadas], mem: b.run('_rascMem.size')};
  };
  const exp = await boot({nome: 'Thiago', papel: 'pcp', usuario: 'thiago'}, {nome: 'Thiago', papel: 'pcp', usuario: 'thiago'});
  assert.deepEqual(exp.apagadas, ['impresilk_rascunhos'], 'sessão expirada');
  assert.equal(exp.mem, 0);
  const sem = await boot(null, {nome: 'Thiago', papel: 'pcp', usuario: 'thiago'});
  assert.deepEqual(sem.apagadas, ['impresilk_rascunhos'], 'entrada única com crachá vencido');
  // O crachá passou a ser de outra pessoa (tablet dividido): a base sai antes de abrir com o dono do crachá.
  b.ctx.AUTH = {temCracha: () => true, dono: () => ({nome: 'Outra', papel: 'pcp', usuario: 'outra'}), eu: async () => true, esquecer() {}};
  b.idb.apagadas.length = 0;
  b.run(`STORE.getUser = () => ({nome: 'Thiago', papel: 'pcp', usuario: 'thiago'}); initLogin();`);
  await tique();
  assert.deepEqual([...b.idb.apagadas], ['impresilk_rascunhos'], 'crachá de outra pessoa');
});

/* ─────────── Corretude B2 e uso M4: a foto de id novo num pcp-sync velho ─────────── */

test('revisão: B2 e M4, a foto de id novo recusada pelo pcp-sync da v143 vai com o id antigo, sem prender a fila e sem perder a foto', async (t) => {
  const v143 = pcpSyncV143();
  if (!v143) { t.skip('sem o histórico do git (fc0df82): a CI do Pages não tem'); return; }
  const b = await bancada({registros: [row('1', agendada())], servidor: v143});
  const subidas = [];
  b.e.cliente.storage = {from: () => ({upload: async id => { subidas.push(id); return {error: null}; }})};
  b.run('initSyncIndicator()');   // os avisos do store que a tela escuta, como no app
  b.abrir('1');
  const id = await b.run(`STORE.pushPhoto({}, '1')`);
  assert.match(id, /^foto_1_\d{13}_[a-z0-9]{1,6}$/, 'a ficha manda o id com a O.S.');
  b.run(`_modalDraft.fotosCheckinIds = [${JSON.stringify(id)}]; markDirty(); saveDraft();`);
  await b.esvaziar();
  // Caso ruim: o pcp-sync velho respondia 422 a cada volta e a foto ficava na fila para sempre (o Sair preso).
  assert.equal(b.S.getQueue().length, 0, 'nada preso na fila: ' + JSON.stringify(b.S.getQueue().map(x => [x.action, x.fileId || (x.os && x.os.fotosCheckinIds)])) + ' ' + JSON.stringify(subidas));
  const antigo = id.replace(/^foto_1_/, 'foto_');
  assert.deepEqual(subidas, [antigo], 'a foto subiu com o id antigo (a mesma hora e o mesmo sorteio)');
  assert.deepEqual(gravada(b.e).fotosCheckinIds, [antigo], 'a O.S. no servidor cita o id que existe');
  assert.deepEqual(b.draft().fotosCheckinIds, [antigo], 'a ficha aberta trocou no rascunho');
  assert.deepEqual(js(b.S.getOS('1').fotosCheckinIds), [antigo]);
  assert.ok(await b.run(`STORE.getFoto(${JSON.stringify(antigo)})`), 'a foto continua no aparelho');
  assert.equal(await b.run(`STORE.getFoto(${JSON.stringify(id)})`), null, 'o arquivo de id novo saiu');
  // A próxima gravação da ficha não manda o id recusado de novo.
  b.run(`_modalDraft.obsPCP = 'anotação fictícia'; markDirty(); saveDraft();`);
  await b.esvaziar();
  assert.deepEqual(gravada(b.e).fotosCheckinIds, [antigo]);
  assert.equal(b.S.getQueue().length, 0);
  // Outro 422 (foto grande, tipo errado) não vira troca de id: segue como antes.
  assert.equal(b.run(`STORE.idFotoAntigo('foto_1758300000000_abc123')`), '', 'o id antigo não tem o que trocar');
});

// O controle do teste de cima: com o pcp-sync da F24, nada é trocado.
test('B2 e M4 (controle): com o pcp-sync novo o id com a O.S. sobe como está', async () => {
  const b = await bancada({registros: [row('1', agendada())]});
  const subidas = [];
  b.e.cliente.storage = {from: () => ({upload: async id => { subidas.push(id); return {error: null}; }})};
  b.abrir('1');
  const id = await b.run(`STORE.pushPhoto({}, '1')`);
  b.run(`_modalDraft.fotosCheckinIds = [${JSON.stringify(id)}]; markDirty(); saveDraft();`);
  await b.esvaziar();
  assert.deepEqual(subidas, [id]);
  assert.deepEqual(gravada(b.e).fotosCheckinIds, [id]);
});

/* ─────────── Corretude B3: a quantidade com ponto no subtotal ─────────── */

test('revisão: B3, a quantidade com ponto ("1.5") e com vírgula ("1,5") é lida certo no subtotal', async () => {
  const b = await bancada();
  const sub = (q, v) => b.run(`subtotalDoItem({qtde: ${JSON.stringify(q)}, valorUnit: ${JSON.stringify(v)}})`);
  // Caso ruim: o parseBRNumber apagava o ponto e 1.5 x 100 dava 1500 (no valor da O.S. manual, no ranking e na comissão).
  assert.equal(sub('1.5', '100'), 150);
  assert.equal(sub('2.5', '10'), 25);
  assert.equal(sub('1,5', '100'), 150);
  assert.equal(sub('2', '1234.56'), 2469.12);
  assert.equal(sub('1.500', '2'), 3000, 'o milhar à brasileira');
  assert.equal(sub('2 un', '10'), 20, 'a unidade depois do número não conta');
  assert.equal(sub('1,5 m²', '100'), 150);
  assert.equal(sub('', '100'), 0);
  assert.equal(sub('abc', '100'), 0);
  assert.equal(sub(3, '10'), 30);
});

/* ─────────── Corretude B4: o histórico da divisão agrupa por autor e sessão ─────────── */

async function comDivisao(extra = {}) {
  const {DIVISAO} = await import('../supabase/functions/_shared/pcp-divisao.mjs');
  const base = DIVISAO.montar([{equipeId: null, liderId: '100001', membros: [{pessoaId: '100001'}, {pessoaId: '111222'}]}], DIVISAO.REGRA_PADRAO);
  assert.equal(DIVISAO.validar(base), '', 'divisão de teste válida');
  const aloc = {...base, por: 'Quem Criou', porId: '111222', em: '2026-09-29T12:00:00.000Z'};
  return bancada({registros: [row('1', agendada({equipe: ['100001', '111222'], alocacao: aloc,
    alocacaoLog: [{acao: 'criar', antes: null, depois: {grupos: []}, por: 'Quem Criou', porId: '111222', em: '2026-09-29T12:00:00.000Z'}]}))], ...extra});
}
// O corpo de tirouDaEquipeDaFicha + equipeDaFichaMudou (app.js), sem o DOM do componente: tira o 111222 e oferece o Desfazer.
const tirarComDesfazer = `(() => { const d = _modalDraft; const nova = JSON.stringify(['100001']);
  oferecerDesfazer('Gestor saiu da equipe da O.S. 9101.', d, fotoCampos(d, CAMPOS_DESFAZER.equipe), {grupo: 'equipe',
    marca: o => JSON.stringify(Array.isArray(o.equipe) ? o.equipe : []) === nova, guarda: ['finalizadaEm', 'carroLiberado']});
  _modalDraft.equipe = ['100001']; markDirty(); saveDraft(); })()`;

test('revisão: B4, tirar e desfazer na mesma janela não gasta linhas do histórico da divisão; 30 ajustes seguidos não consomem o teto', async () => {
  const b = await comDivisao();
  b.abrir('1');
  let recusas = 0;
  // Caso ruim: cada volta gravava 'desatualizar' e 'reatualizar'; 20 voltas enchiam o teto de 40 e expulsavam o 'criar'.
  for (let i = 0; i < 30; i++) {
    b.run(tirarComDesfazer);
    await b.esvaziar();
    if (i === 0) assert.equal(gravada(b.e).alocacaoLog.at(-1).acao, 'desatualizar', 'tirar marca a divisão desatualizada');
    b.desfazer.at(-1)();
    await b.esvaziar();
    if (b.toasts.at(-1)[1] === 'error') recusas++;
  }
  const g = gravada(b.e);
  assert.equal(recusas, 0);
  assert.deepEqual(g.alocacaoLog.map(x => x.acao), ['criar'], 'o histórico ficou como era: a volta não gasta linha');
  assert.equal(g.alocacaoLog[0].por, 'Quem Criou', 'a linha de quem fez a divisão continua');
  assert.ok(!g.alocacao.desatualizada, 'a divisão voltou a valer');
  assert.deepEqual(g.equipe, ['100001', '111222']);
});

// O controle do teste de cima: o agrupamento não engole a volta de outra sessão nem a de outra pessoa.
test('B4 (controle): fora da janela de 10 minutos ou com outro autor, a volta entra no histórico', async () => {
  const b = await comDivisao();
  b.abrir('1');
  b.run(tirarComDesfazer);
  await b.esvaziar();
  // A linha 'desatualizar' de 11 minutos atrás: a volta agora é outra sessão.
  const reg = b.e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
  reg.alocacaoLog.at(-1).em = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  b.desfazer.at(-1)();
  await b.esvaziar();
  assert.deepEqual(gravada(b.e).alocacaoLog.map(x => x.acao), ['criar', 'desatualizar', 'reatualizar']);
  // Outro autor: a Gestora Dois volta o que o Gestor tirou: as duas linhas ficam.
  const c = await comDivisao();
  c.abrir('1');
  c.run(tirarComDesfazer);
  await c.esvaziar();
  c.trocarCracha(GESTORA2);
  c.run(`STATE.user = {nome: 'Gestora Dois', papel: 'admin', usuario: 'gestora2'}`);
  c.desfazer.at(-1)();
  await c.esvaziar();
  const log = gravada(c.e).alocacaoLog;
  assert.deepEqual(log.map(x => x.acao), ['criar', 'desatualizar', 'reatualizar']);
  assert.deepEqual(log.slice(1).map(x => x.porId), ['111222', '222333']);
});

/* ─────────── Uso A2 e B5: os Cancelar voltam a perguntar ─────────── */

test('revisão: A2, Cancelar o carro de um serviço de vários dias pergunta com a consequência, sem Desfazer (a confirmação é de ontem)', async () => {
  const b = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: ontemAs(8), confHora: '08:00',
    carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: ontemAs(8, 10)}))]});
  b.abrir('1');
  // Caso ruim: a régua do servidor (mesmo dia) deixava o Desfazer, e o botão Liberar (confirmação de HOJE) recusava depois.
  assert.equal(b.run('podeVoltarCarro(_modalDraft)'), false, 'a régua da tela também vale');
  b.tocar('#btn-cancelar-carro');
  assert.equal(b.perguntas.length, 1, 'pergunta antes');
  const dia = new Date(ontemAs(8)).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: '2-digit'});
  assert.equal(b.perguntas[0], `Cancelar o carro liberado da O.S. 9101?\n\nPara liberar de novo será preciso confirmar o cliente hoje (a confirmação é de ${dia}).`);
  assert.equal(b.desfazer.length, 0);
  assert.ok(b.toasts.some(([m]) => m === `Liberação do carro da O.S. 9101 cancelada. Para liberar de novo será preciso confirmar o cliente hoje (a confirmação é de ${dia}).`), JSON.stringify(b.toasts));
  // Respondeu "Cancelar" na pergunta: nada muda.
  const c = await bancada({registros: [row('1', agendada({confirmacao: 'Confirmado', confPor: 'Gestor Teste', confEm: agora(), confHora: '08:00',
    carroLiberado: true, carroLiberadoPor: 'Gestor Teste', carroLiberadoEm: agora()}))], confirmar: () => false});
  c.abrir('1');
  c.tocar('#btn-cancelar-carro');
  assert.equal(c.draft().carroLiberado, true);
  assert.equal(c.toasts.length, 0);
});

test('revisão: B5, Cancelar a liberação do PCP pergunta antes; "Cancelar" na pergunta não mexe; o aviso com Desfazer fica como segunda proteção', async () => {
  const b = await bancada({registros: [row('1', agendada())], confirmar: () => false});
  b.abrir('1');
  // Caso ruim: um toque cancelava, e liberar de novo zerava o "aguardando há Xd".
  b.tocar('#btn-cancelar-liberar');
  assert.equal(b.perguntas.length, 1);
  assert.equal(b.draft().liberadoPCP, true, 'não mexeu');
  assert.equal(b.draft().aptoEm, '2026-09-28T12:00:00.000Z');
  const c = await bancada({registros: [row('1', agendada())]});
  c.abrir('1');
  c.tocar('#btn-cancelar-liberar');
  assert.equal(c.draft().liberadoPCP, false);
  assert.ok(c.toasts.some(([m, t, k]) => m === 'Liberação do PCP da O.S. 9101 cancelada' && t === 'desfazer' && k === '1|liberacao'), JSON.stringify(c.toasts));
  c.desfazer.at(-1)();
  assert.equal(c.draft().aptoEm, '2026-09-28T12:00:00.000Z', 'a espera conta desde a liberação de antes');
  assert.ok(c.toasts.some(([m]) => m === 'Desfeito: a O.S. 9101 está liberada para instalação de novo, como antes.'));
});

/* ─────────── Uso M1: o aviso diz a ação e a O.S.; o Desfazer só age nela ─────────── */

test('revisão: M1, três O.S. liberadas em seguida: cada aviso diz a O.S.; o Desfazer do meio desfaz só a dele e diz qual', async () => {
  const regs = ['101', '106', '111'].map(n => row(n, agendada({numero: 'T-' + n, liberadoPCP: false, aptoPor: '', aptoEm: ''})));
  const b = await bancada({registros: regs});
  for (const id of ['101', '106', '111']) { b.abrir(id); b.tocar('#btn-liberar'); b.run('saveDraft()'); }
  // Caso ruim: três avisos iguais, "Liberado para instalação", e o do meio desfazia outra O.S. sem dizer qual.
  assert.deepEqual(b.toasts.map(([m, t, k]) => [m, t, k]), [
    ['O.S. T-101 liberada para instalação', 'desfazer', '101|liberacao'],
    ['O.S. T-106 liberada para instalação', 'desfazer', '106|liberacao'],
    ['O.S. T-111 liberada para instalação', 'desfazer', '111|liberacao']]);
  b.desfazer[1]();
  assert.equal(b.S.getOS('106').liberadoPCP, false, 'a T-106 voltou');
  assert.equal(b.S.getOS('101').liberadoPCP, true, 'a T-101 ficou');
  assert.equal(b.draft().liberadoPCP, true, 'a T-111, aberta, ficou');
  assert.equal(b.toasts.at(-1)[0], 'Desfeito: a O.S. T-106 voltou a aguardar a liberação do PCP.');
});

/* ════════════════════ BANCADA 2: o aviso de verdade (toast e toastDesfazer) ════════════════════ */
function telaAvisos() {
  const relogio = {t: 0, timers: []};
  const BASE = Date.parse('2026-10-05T12:00:00Z');
  const DataFalsa = class extends Date { constructor(...a) { super(...(a.length ? a : [BASE + relogio.t])); } static now() { return BASE + relogio.t; } };
  let seq = 0;
  const setT = (fn, ms) => { const id = ++seq; relogio.timers.push({id, fn, em: relogio.t + (ms || 0)}); return id; };
  const clearT = id => { relogio.timers = relogio.timers.filter(x => x.id !== id); };
  const avancar = ms => {
    const fim = relogio.t + ms;
    for (;;) {
      const prox = relogio.timers.filter(x => x.em <= fim).sort((a, b) => a.em - b.em)[0];
      if (!prox) break;
      relogio.t = prox.em; relogio.timers = relogio.timers.filter(x => x !== prox); prox.fn();
    }
    relogio.t = fim;
  };
  const porId = new Map(), ouvDoc = {};
  const el = tag => {
    const ouv = {};
    const e = {tagName: String(tag).toUpperCase(), id: '', className: '', textContent: '', children: [], parentNode: null, attrs: {}, ouv, style: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(tp, fn) { (ouv[tp] = ouv[tp] || []).push(fn); },
      append(...ns) { for (const n of ns) if (n && typeof n === 'object') { n.parentNode = this; this.children.push(n); } },
      appendChild(n) { n.parentNode = this; this.children.push(n); if (n.id) porId.set(n.id, n); return n; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; },
      contains(x) { for (let p = x; p; p = p.parentNode) if (p === this) return true; return false; },
      disparar(tp, ev = {}) { for (const fn of ouv[tp] || []) fn(ev); }};
    return e;
  };
  const body = el('body');
  const doc = {body, createElement: el, getElementById: id => porId.get(id) || null, querySelectorAll: () => [], querySelector: () => null,
    addEventListener: (tp, fn) => (ouvDoc[tp] = ouvDoc[tp] || []).push(fn)};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, Date: DataFalsa, document: doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, setTimeout: setT, clearTimeout: clearT, setInterval: () => 1, clearInterval() {},
    STORE: {getCFG: () => ({}), getAllOS: () => [], on() {}, onConflict() {}}});
  for (const f of ['operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  const run = c => vm.runInContext(c, ctx);
  const caixa = () => porId.get('toast-container');
  const avisos = () => (caixa() ? caixa().children : []);
  const teclar = ev => { const e = {preventDefault() { this.parado = true; }, ...ev}; for (const fn of ouvDoc.keydown || []) fn(e); return e; };
  return {ctx, run, avancar, avisos, teclar, texto: a => a.children.map(x => x.textContent).join(' | ')};
}

test('revisão: M2, o aviso com Desfazer fica 10 s, espera com o mouse em cima ou com o foco dentro, e o texto longo fica mais', () => {
  const t = telaAvisos();
  t.ctx.__feitos = [];
  t.run(`toastDesfazer('Carro da O.S. 9101 liberado', () => __feitos.push('carro'))`);
  // Caso ruim: sumia aos 6 s, com o mouse parado em cima do Desfazer.
  t.avancar(9900);
  assert.equal(t.avisos().length, 1, 'aos 9,9 s ainda está');
  t.avancar(200);
  assert.equal(t.avisos().length, 0, 'aos 10,1 s saiu');
  t.run(`toastDesfazer('Carro da O.S. 9101 liberado', () => __feitos.push('carro'))`);
  const a = t.avisos()[0];
  t.avancar(5000);
  a.disparar('mouseenter');
  t.avancar(60000);
  assert.equal(t.avisos().length, 1, 'com o mouse em cima, espera');
  a.disparar('mouseleave');
  t.avancar(4900);
  assert.equal(t.avisos().length, 1, 'volta a contar do que faltava');
  t.avancar(200);
  assert.equal(t.avisos().length, 0);
  // O foco dentro (o Tab chegou no Desfazer) também segura.
  t.run(`toastDesfazer('Cliente da O.S. 9101 confirmado', () => __feitos.push('conf'))`);
  const f = t.avisos()[0];
  f.disparar('focusin');
  t.avancar(30000);
  assert.equal(t.avisos().length, 1);
  f.disparar('focusout', {relatedTarget: null});
  t.avancar(10100);
  assert.equal(t.avisos().length, 0);
  // Texto longo: o tempo cresce com o texto (70 ms por letra).
  const longa = 'Instalação da O.S. 9105 finalizada 🏁 · 3 itens declarados pela equipe hoje; a gestão confere no Fechar o dia, em Entregas, e o retrabalho fica para o PCP conferir depois';
  assert.ok(longa.length * 70 > 11000);
  t.run(`toastDesfazer(${JSON.stringify(longa)}, () => {})`);
  t.avancar(10500);
  assert.equal(t.avisos().length, 1, 'mensagem longa fica mais que 10 s');
  t.avancar(longa.length * 70);
  assert.equal(t.avisos().length, 0);
  t.run(`toastDesfazer('Curto', () => {})`);
  // O botão diz o atalho.
  assert.equal(t.avisos()[0].children[1].attrs['aria-keyshortcuts'], 'Control+Z Meta+Z');
  /* E o CSS não some com ele antes da hora: o .toast-acao esmaecia aos 5,7 s
     (toastOut), e o aviso ficava invisível com o tempo e o Desfazer ainda
     valendo. Quem tira é o JS. */
  const css = ler('styles.css').replace(/\s+/g, ' ');
  const regra = /\.toast\.toast-acao\{[^}]*\}/.exec(css);
  assert.ok(regra, 'a regra do aviso com Desfazer');
  assert.match(regra[0], /animation:toastIn \.2s ease\}/);
  assert.doesNotMatch(regra[0], /toastOut/);
});

test('revisão: M1, o aviso novo da mesma O.S. e ação tira o anterior; o de outra O.S. fica', () => {
  const t = telaAvisos();
  t.ctx.__feitos = [];
  // Caso ruim: os avisos empilhavam iguais, cobrindo os campos da ficha.
  t.run(`toastDesfazer('Carro da O.S. 9101 liberado', () => __feitos.push(1), {chave: '1|carro'})`);
  t.run(`toastDesfazer('Liberação do carro da O.S. 9101 cancelada', () => __feitos.push(2), {chave: '1|carro'})`);
  assert.deepEqual(t.avisos().map(t.texto), ['Liberação do carro da O.S. 9101 cancelada | Desfazer']);
  t.run(`toastDesfazer('Carro da O.S. 9102 liberado', () => __feitos.push(3), {chave: '2|carro'})`);
  assert.equal(t.avisos().length, 2);
  // O handle diz se o aviso ainda vale (as tiradas seguidas da equipe se juntam por ele).
  const vivo = t.run(`(() => { const h = toastDesfazer('x', () => {}, {chave: '3|equipe'}); const a = h.vivo(); toastDesfazer('y', () => {}, {chave: '3|equipe'}); return [a, h.vivo()]; })()`);
  assert.deepEqual([...vivo], [true, false]);
});

test('revisão: M2, Ctrl+Z (Cmd+Z) fora de campo de texto aciona o último Desfazer que está na tela; dentro do campo, não', () => {
  const t = telaAvisos();
  t.ctx.__feitos = [];
  t.run(`toastDesfazer('Carro da O.S. 9101 liberado', () => __feitos.push('a'), {chave: '1|carro'})`);
  t.run(`toastDesfazer('Cliente da O.S. 9102 confirmado', () => __feitos.push('b'), {chave: '2|confirmacao'})`);
  // Caso ruim: não havia tecla; eram 34 Tabs até o botão, com o aviso sumindo em 6 s.
  const campo = t.teclar({key: 'z', code: 'KeyZ', ctrlKey: true, target: {tagName: 'INPUT', type: 'text'}});
  assert.ok(!campo.parado, 'no campo, o Ctrl+Z é do campo');
  assert.deepEqual([...t.ctx.__feitos], []);
  const e1 = t.teclar({key: 'z', code: 'KeyZ', ctrlKey: true, target: {tagName: 'BODY'}});
  assert.ok(e1.parado);
  assert.deepEqual([...t.ctx.__feitos], ['b'], 'o mais recente');
  assert.equal(t.avisos().length, 1);
  t.teclar({key: 'z', code: 'KeyZ', metaKey: true, target: {tagName: 'BUTTON'}});
  assert.deepEqual([...t.ctx.__feitos], ['b', 'a'], 'Cmd+Z no Mac, o seguinte');
  const vazio = t.teclar({key: 'z', code: 'KeyZ', ctrlKey: true, target: {tagName: 'BODY'}});
  assert.ok(!vazio.parado, 'sem aviso na tela, a tecla segue livre');
  // Ctrl+Shift+Z (refazer) não é desfazer.
  t.run(`toastDesfazer('Carro da O.S. 9101 liberado', () => __feitos.push('c'))`);
  t.teclar({key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true, target: {tagName: 'BODY'}});
  assert.deepEqual([...t.ctx.__feitos], ['b', 'a']);
});

test('revisão: B3, o aviso comum fica o tempo proporcional ao texto', () => {
  const t = telaAvisos();
  const longa = 'Instalação da O.S. 9105 finalizada 🏁 · 2 itens declarados pela equipe hoje; a gestão confere no Fechar o dia. Para desfazer, fale com o PCP.';
  t.run(`toast(${JSON.stringify(longa)}, 'success')`);
  // O esmaecer do CSS (toastOut, 2,7 s) acompanha o tempo do texto.
  assert.equal(t.avisos()[0].style.animationDelay, '0s, ' + (longa.length * 60 - 300) / 1000 + 's');
  // Caso ruim: 125 letras em 3 s.
  t.avancar(3100);
  assert.equal(t.avisos().length, 1, 'aos 3,1 s ainda está');
  t.avancar(longa.length * 60);
  assert.equal(t.avisos().length, 0);
  t.run(`toast('Curto', 'success')`);
  t.avancar(3100);
  assert.equal(t.avisos().length, 0, 'o curto continua com 3 s');
});

/* ════════════════════ BANCADA 3: a ficha com o componente de equipe (ALOCUI) ════════════════════ */
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
  let html = '', blocos = [], els = new Map(), secoes = [];
  const classes = () => { const s = new Set(); return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }, contains: c => s.has(c), lista: () => [...s]}; };
  const el = id => {
    if (!els.has(id)) els.set(id, {id, innerHTML: '', textContent: '', hidden: false, disabled: false, classList: classes(), querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, removeAttribute() {}, focus() {}});
    return els.get(id);
  };
  const modal = {get innerHTML() { return html; },
    set innerHTML(v) { html = v; els = new Map();
      blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false}));
      secoes = [...v.matchAll(/<section class="ficha-etapa" data-etapa-sec="([^"]+)"[^>]*?( hidden)?>/g)].map(m => ({dataset: {etapaSec: m[1]}, hidden: !!m[2], classList: classes(), offsetWidth: 1})); },
    classList: classes(), querySelector: () => null, querySelectorAll: () => []};
  const overlay = {classList: classes()};
  const doc = {querySelector: s => (s === '#modal-os' ? modal : s === '#modal-overlay' ? overlay : (/data-etapa-sec="([^"]+)"/.exec(s) ? secoes.find(x => x.dataset.etapaSec === /data-etapa-sec="([^"]+)"/.exec(s)[1]) || null : null)),
    querySelectorAll: s => (s === '#modal-os .card-fs' ? blocos : s === '#modal-os .ficha-etapa' ? secoes : s === '#modal-os .ficha-etapa.fe-entrou' ? secoes.filter(x => x.classList.contains('fe-entrou')) : []),
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
  vm.runInContext(`STATE.user={nome:'Gestor Teste',papel:'${papel}',usuario:'gestor'}; bindModalEvents=()=>{}; ligarHistoricoAlteracoes=()=>{}; renderActiveTab=()=>{};
    toast=(m,t)=>__toasts.push([m,t||'']); toastDesfazer=(m,fn,o)=>{__toasts.push([m,'desfazer',(o&&o.chave)||'']); __desfazer.push(fn);};`, ctx);
  const run = code => vm.runInContext(code, ctx);
  // Um clique de verdade: `detail` (1 no clique, 2 no segundo clique do duplo) e `timeStamp` (ms).
  const clicar = (hostId, dataset, ev = {}) => doc.getElementById(hostId).onclick({target: {closest: () => ({dataset, disabled: false})}, ...ev});
  return {run, clicar, salvos, toasts, desfazer, lista, html: () => html, secoes: () => secoes};
}

test('revisão: M1, tiradas seguidas da equipe viram um aviso só, que devolve todas; o aviso diz quem e a O.S.', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100002', '100001', '100003']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'});
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100003'});
  assert.deepEqual(t.salvos.at(-1).equipe, ['100001']);
  // Caso ruim: dois avisos; o da Bia respondia "a O.S. mudou depois" e só o Caio voltava.
  const ult = t.toasts.filter(([, tp]) => tp === 'desfazer').at(-1);
  assert.match(ult[0], /^Bia \S+ e Caio \S+ saíram da equipe da O\.S\. 8001\.$|^Bia e Caio saíram da equipe da O\.S\. 8001\.$/, JSON.stringify(t.toasts));
  assert.equal(ult[2], 'f1|equipe', 'um aviso por O.S. e ação: o novo tira o anterior da tela');
  t.desfazer.at(-1)();
  assert.deepEqual(t.salvos.at(-1).equipe, ['100002', '100001', '100003'], 'as duas voltam, na ordem de antes');
  assert.deepEqual(js(t.run(`ALOCUI.paraEquipe('ficha-eq:f1').equipe`)).sort(), ['100001', '100002', '100003'], 'e o componente também');
  assert.match(t.toasts.at(-1)[0], /^Desfeito: Bia.* e Caio.* voltaram para a equipe da O\.S\. 8001\.$/);
});

test('revisão: M1, o duplo clique no × tira uma pessoa só (a linha de baixo sobe para o lugar do botão)', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001', '100002', '100003']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  // O duplo clique: o primeiro clique (detail 1) tira a Bia; o segundo (detail 2) cairia no × do Caio, que subiu.
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100002'}, {detail: 1, timeStamp: 1000});
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100003'}, {detail: 2, timeStamp: 1180});
  // Caso ruim: saíam as duas.
  assert.deepEqual(t.salvos.at(-1).equipe, ['100001', '100003'], 'só a Bia saiu');
  // Toque duplo no tablet (dois cliques com detail 1, a 200 ms): também tira um só.
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100003'}, {detail: 1, timeStamp: 5000});
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100001'}, {detail: 1, timeStamp: 5200});
  assert.deepEqual(t.salvos.at(-1).equipe, ['100001']);
  // Dois toques com calma (mais de meio segundo) tiram dois.
  t.clicar('ficha-equipe', {alocAcao: 'remover', g: '0', p: '100001'}, {detail: 1, timeStamp: 9000});
  assert.deepEqual(t.salvos.at(-1).equipe, []);
});

test('revisão: B1, os atalhos aparecem: uma linha discreta na ficha (some no toque), aria-keyshortcuts nos passos e o manual', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  const h = t.html();
  // Caso ruim: nenhum texto, title ou aria-keyshortcuts falava de Alt+1 a 5, Ctrl+Enter ou Esc.
  assert.match(h, /<p class="fe-atalhos"[^>]*>Atalhos: Alt\+1 a Alt\+5, Ctrl\+Enter, Esc<\/p>/);
  assert.match(h, /data-ir-etapa="dados"[^>]*aria-keyshortcuts="Alt\+1"/);
  assert.match(h, /data-ir-etapa="fechamento"[^>]*aria-keyshortcuts="Alt\+5"/);
  const css = ler('styles.css').replace(/\s+/g, ' ');
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\) \{ \.fe-atalhos \{ display: none; \} \}/, 'no toque a linha some');
  const manual = t.run(`(() => { let h = ''; const d = document; return typeof abrirInstrucoes; })()`);
  assert.equal(manual, 'function');
  const app = ler('app.js');
  const instr = app.slice(app.indexOf('function abrirInstrucoes'), app.indexOf('function abrirInstrucoes') + 40000);
  assert.match(instr, /Atalhos no computador/);
  assert.match(instr, /<em>Alt\+1<\/em> a <em>Alt\+5<\/em>/);
  assert.match(instr, /<em>Ctrl\+Z<\/em> \(<em>Cmd\+Z<\/em>\) usa o <em>Desfazer<\/em> do último aviso/);
});

test('revisão: B2, os rótulos das fotos são os mesmos nos dois lados, e a dica diz o que a foto faz com a hora', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001']})]});
  t.run(`openModal(STORE.getOS('f1'))`);
  const h = t.html();
  // Caso ruim: "Fotos de antes (check-in; ...; carimba a hora de saída)": check-in é a chegada, e o campo fala da saída.
  assert.match(h, /<label>Fotos de antes \(ao chegar, antes de começar\)<\/label>/);
  assert.match(h, /<label>Fotos de depois \(serviço pronto\)<\/label>/);
  assert.match(h, /Anexar foto não informa a hora real da saída/);
  assert.match(h, /Anexar foto não informa a hora real do retorno/);
  assert.doesNotMatch(h, /check-in;|carimba a hora/);
  const eq = ler('equipe.js');
  assert.match(eq, /<label>Fotos de antes \(ao chegar, antes de começar; pelo menos 1 para finalizar\)<\/label>/);
  assert.match(eq, /<label>Fotos de depois \(serviço pronto; pelo menos 1 para finalizar\)<\/label>/);
  // O que falta para finalizar usa os mesmos nomes (a chave interna continua a mesma).
  assert.equal(t.run(`faltaNaTela('≥1 foto de saída')`), 'foto de antes');
  assert.equal(t.run(`faltaNaTela('foto de retorno (serviço pronto)')`), 'foto de depois (serviço pronto)');
  assert.match(t.run(`FALTA_FINALIZAR_CAMPO['≥1 foto de saída'][2]`), /foto de antes \(ao chegar, antes de começar\)/);
});

test('junção F23+F24: trocar de etapa (sem repintar, D3 da F23) anima uma vez a etapa que chega', () => {
  const t = telaFicha({lista: [osFicha({equipe: ['100001']})]});
  t.run(`openModal(STORE.getOS('f1'), 'pcp')`);
  const n = t.salvos.length;
  t.run(`irParaEtapaFicha('equipe', {foco: 'titulo'})`);
  const sec = k => t.secoes().find(s => s.dataset.etapaSec === k);
  assert.equal(sec('equipe').hidden, false);
  assert.ok(sec('equipe').classList.contains('fe-entrou'), 'a etapa que chega anima (a F24 só animava na repintura)');
  t.run(`irParaEtapaFicha('jornada', {foco: 'titulo'})`);
  assert.ok(sec('jornada').classList.contains('fe-entrou'));
  assert.ok(!sec('equipe').classList.contains('fe-entrou'), 'a classe sai da etapa de antes: voltar a ela anima de novo');
  assert.equal(t.salvos.length, n, 'nada gravado');
});

/* ════════════════════ BANCADA 4: a tela só com o app (valor, cliente, rascunho) ════════════════════ */
function telaApp({papel = 'pcp', lista = [], confirmar = () => true} = {}) {
  const timers = [], perguntas = [];
  const doc = {addEventListener() {}, activeElement: null, visibilityState: 'visible',
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: tag => ({tagName: tag.toUpperCase(), attrs: {}, filhos: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...ns) { this.filhos.push(...ns); }, remove() { this.removido = true; }}),
    body: {contains: () => false, classList: {add() {}, remove() {}, contains: () => false}, appendChild() {}}};
  const STORE = {getAllOS: () => lista, getCFG: () => ({instaladores: [], performancePCP: {equipes: []}}), getOS: id => lista.find(o => o.id === id) || null,
    saveOS() {}, getQueue: () => [], on() {}, elenco: () => ({pessoas: [], antigos: []}), valores: () => ({}), carimbarMomento() {}};
  const ctx = vm.createContext({console, document: doc, window: {addEventListener() {}}, navigator: {onLine: true}, STORE,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, confirm: m => { perguntas.push(String(m)); return confirmar(String(m)); },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => { if (id) timers[id - 1] = null; }, setInterval() {}, __toasts: []});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user = {nome: 'Gestor Teste', usuario: 'gestor', papel: '${papel}'};
    toast = (m, t) => __toasts.push([m, t || '']); saveDraft = () => {}; reRenderModalKeepOpen = () => {}; markDirty = () => {}; _debouncedSaveDraft = () => {};`, ctx);
  const run = c => vm.runInContext(c, ctx);
  const correrTimers = () => { const xs = timers.splice(0); xs.forEach(fn => fn && fn()); };
  return {ctx, run, correrTimers, perguntas, toasts: ctx.__toasts};
}
// Um campo de mentira que guarda os ouvintes, a seleção e os atributos.
function campoFalso(extra = {}) {
  const ouv = {}, attrs = {};
  return {value: '', dataset: {}, selecionado: 0, addEventListener: (tp, fn) => (ouv[tp] = ouv[tp] || []).push(fn), ouv,
    disparar(tp, ev = {}) { for (const fn of ouv[tp] || []) fn(ev); }, select() { this.selecionado++; },
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: k => attrs[k] ?? null, removeAttribute: k => { delete attrs[k]; }, attrs, ...extra};
}

test('revisão: A1, o valor do item manual nasce vazio, seleciona tudo no foco (clique e toque) e avisa preso ao campo quando falta', () => {
  const t = telaApp();
  // Caso ruim: nascia "0,00"; o clique no meio com 150 virava 1500,00, e no fim virava 0,00150 (lido como 0, calado).
  const novo = js(t.run(`novoItemManual([{item: '1'}])`));
  assert.equal(novo.valorUnit, '', 'nasce vazio');
  const item = {uid: 'm-1', item: '1', descricao: 'Placa fictícia', qtde: '3', valorUnit: '', subtotal: 0, manual: true};
  const h = t.run(`valorItemHTML(${JSON.stringify(item)}, 0, {tipo: 'externo'}, false, '', 6)`);
  assert.match(h, /<input [^>]*data-valor-item="0"[^>]*value="" placeholder="0,00"[^>]*aria-describedby="valor-aviso-0" aria-invalid="true">/);
  assert.match(h, /<p class="fe-msg valor-item-aviso" id="valor-aviso-0" data-valor-aviso="0" aria-live="polite">Falta o valor unitário deste item: sem ele, o item entra com R\$ 0,00 no valor da O\.S\.<\/p>/);
  // Zero gravado aparece vazio também (o "0,00" só de dica); o item sem descrição não avisa.
  assert.match(t.run(`valorItemHTML(${JSON.stringify({...item, valorUnit: '0'})}, 0, {tipo: 'externo'}, false, '', 6)`), /value="" placeholder="0,00"/);
  assert.match(t.run(`valorItemHTML(${JSON.stringify({...item, descricao: ''})}, 0, {tipo: 'externo'}, false, '', 6)`), /data-valor-aviso="0" aria-live="polite"><\/p>/);
  // O campo de verdade: o foco seleciona tudo; o soltar do mouse logo depois não desfaz a seleção; o toque também.
  t.run(`_modalDraft = {id: 'm1', tipo: 'externo', itens: [${JSON.stringify(item)}]}`);
  const inp = campoFalso({dataset: {valorItem: '0', iuid: 'm-1'}});
  const aviso = {dataset: {valorAviso: '0'}, textContent: 'Falta o valor unitário deste item: sem ele, o item entra com R$ 0,00 no valor da O.S.', classList: {s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }}};
  t.ctx.__inp = inp; t.ctx.__aviso = aviso; t.ctx.__sub = {dataset: {valorSub: '0'}, textContent: ''};
  t.run(`ligarValoresDaFicha({querySelectorAll: s => s === '[data-valor-item]' ? [__inp] : s === '[data-valor-sub]' ? [__sub] : s === '[data-valor-aviso]' ? [__aviso] : []}, false)`);
  inp.disparar('focus');
  assert.ok(inp.selecionado >= 1, 'o foco seleciona tudo');
  let parado = false;
  inp.disparar('mouseup', {preventDefault() { parado = true; }});
  assert.ok(parado, 'o soltar do clique (no meio ou no fim) não põe o cursor no lugar da seleção');
  const antes = inp.selecionado;
  inp.disparar('focus'); inp.disparar('touchend'); t.correrTimers();
  assert.ok(inp.selecionado > antes, 'no toque também');
  // Digitar 150 com tudo selecionado troca o valor inteiro: 150,00, e o aviso sai (guardando o lugar).
  inp.value = '150'; inp.oninput();
  assert.equal(t.run('_modalDraft.itens[0].valorUnit'), '150');
  assert.equal(t.run('_modalDraft.itens[0].subtotal'), 450);
  assert.ok(aviso.classList.s.has('fe-msg-feita'), 'o aviso resolvido fica invisível, sem mexer no que está embaixo');
  inp.onblur();
  assert.equal(inp.value, '150,00');
  // Apagar volta ao vazio (não a 0,00), e o aviso volta.
  inp.value = ''; inp.oninput(); inp.onblur();
  assert.equal(t.run('_modalDraft.itens[0].valorUnit'), '');
  assert.equal(inp.value, '');
  assert.ok(!aviso.classList.s.has('fe-msg-feita'));
  assert.equal(inp.attrs['aria-invalid'], 'true');
  // Zero digitado também avisa.
  inp.value = '0'; inp.oninput();
  assert.ok(!aviso.classList.s.has('fe-msg-feita'));
});

test('revisão: B6, a 375 px o valor do item cola no cartão e diz de qual item é', () => {
  const t = telaApp();
  const item = {uid: 'm-1', item: '2', descricao: 'Adesivo fictício', qtde: '1', valorUnit: '50', subtotal: 50, manual: true};
  // Caso ruim: a linha "Valor" virava um cartão solto, sem dizer de qual item.
  assert.match(t.run(`valorItemHTML(${JSON.stringify(item)}, 1, {tipo: 'externo'}, false, '', 6)`), /<span class="valor-item-de">Item 2: Adesivo fictício<\/span>/);
  const css = ler('styles.css').replace(/\s+/g, ' ');
  assert.match(css, /\.valor-item-de \{ display: none;/);
  assert.match(css, /@media \(max-width: 600px\) \{ \.valor-item-de \{ display: block; \}/);
  assert.match(css, /\.items-cards tr\[data-item-row\]:has\(\+ tr\.valor-row\)/, 'a linha do valor cola no cartão do item');
  assert.match(css, /\.items-cards tr\.valor-row \{ border-top: 0; border-radius: 0 0 10px 10px;/);
});

// A caixa da lista do cliente: as opções saem do HTML pintado (os mesmos objetos até a próxima pintura).
function caixaFalsa() {
  let html = '', ops = [];
  return {hidden: true, contains: () => false,
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; ops = [...v.matchAll(/<button [^>]*id="([^"]+)"[^>]*data-cli-nome="([^"]+)"/g)].map(m => ({id: m[1], dataset: {cliNome: m[2]}, attrs: {},
      setAttribute(k, x) { this.attrs[k] = x; }, classList: {toggle() {}}, scrollIntoView() {}})); },
    querySelectorAll: () => ops};
}
test('revisão: M3, cliente: Tab sai do campo sem escolher; Enter só escolhe a sugestão destacada pelas setas; as opções não entram no Tab', () => {
  const lista = [{id: 'a1', cliente: 'Loja Central · teste'}, {id: 'a2', cliente: 'Loja Central · teste'}, {id: 'a3', cliente: 'Casa pelo Lago'}];
  const t = telaApp({lista});
  t.run(`_modalDraft = {id: 'f1', cliente: ''}; setField = (k, v) => { _modalDraft[k] = v; };`);
  const inp = campoFalso({readOnly: false});
  const caixa = caixaFalsa();
  t.ctx.__inp = inp; t.ctx.__caixa = caixa;
  t.run(`ligarClienteTolerante({querySelector: s => s === 'input[data-f="cliente"]' ? __inp : s === '#cli-sug' ? __caixa : null})`);
  const digitar = v => { inp.value = v; inp.disparar('input'); };
  const tecla = key => { const ev = {key, parado: false, preventDefault() { this.parado = true; }, stopPropagation() {}}; inp.disparar('keydown', ev); return ev; };
  digitar('Lojas Centrais');
  assert.equal(caixa.hidden, false);
  assert.match(caixa.innerHTML, /Você quis dizer/);
  // Caso ruim: Tab ia para a sugestão (botão no Tab) e Enter trocava o cliente novo pelo antigo.
  assert.match(caixa.innerHTML, /<button type="button" role="option" tabindex="-1"/, 'as opções não entram no Tab');
  const tab = tecla('Tab');
  assert.ok(!tab.parado, 'o Tab segue para o próximo campo');
  assert.equal(caixa.hidden, true, 'e fecha a lista');
  assert.equal(t.run('_modalDraft.cliente'), '', 'sem escolher nada');
  digitar('Lojas Centrais');
  const enter = tecla('Enter');
  assert.ok(!enter.parado);
  assert.equal(t.run('_modalDraft.cliente'), '', 'Enter sem destaque não troca o que foi digitado');
  assert.equal(caixa.hidden, true);
  digitar('Lojas Centrais');
  tecla('ArrowDown');
  assert.equal(inp.attrs['aria-activedescendant'], 'cli-sug-op-0', 'a seta destaca, o foco fica no campo');
  const e2 = tecla('Enter');
  assert.ok(e2.parado);
  assert.equal(t.run('_modalDraft.cliente'), 'Loja Central · teste', 'Enter escolhe a destacada');
  // Com 2 letras, só o nome (ou a palavra) que começa por elas: "Lo" não acha "pelo".
  assert.deepEqual(js(t.run(`buscarClientes('Lo', clientesDoAparelho('f1'))`)).map(c => c.nome), ['Loja Central · teste']);
  assert.equal(inp.attrs.role, 'combobox');
});

test('revisão: M3, a lista do cliente fica por cima dos campos (não empurra Contato e WhatsApp) e quebra o nome em vez de alargar a ficha a 375 px', () => {
  const css = ler('styles.css').replace(/\s+/g, ' ');
  // Caso ruim: a lista empurrava Contato e WhatsApp até 186 px e, a 375 px, o nowrap dos botões alargava o bloco.
  assert.match(css, /\.cli-campo \{ position: relative; \}/);
  assert.match(css, /\.cli-sug \{ position: absolute; left: 0; right: 0; top: calc\(100% \+ 4px\); z-index: 40;/);
  assert.match(css, /\.cli-sug-op \{[^}]*white-space: normal;/);
  assert.match(css, /\.cli-sug-op\.ativa, \.cli-sug-op\[aria-selected="true"\] \{/, 'a destacada tem contraste');
  assert.match(ler('app.js'), /<div class="cli-campo"><input data-f="cliente"/);
});

function formFalso(campos) {
  const ouv = {};
  const els = Object.entries(campos).map(([name, value]) => ({name, value, type: 'textarea', tagName: 'TEXTAREA', focus() {}}));
  return {els, firstChild: null, aviso: null, addEventListener: (tp, fn) => (ouv[tp] = ouv[tp] || []).push(fn), querySelectorAll: () => els,
    insertBefore(n) { this.aviso = n; }, digitar(name, v) { const el = els.find(x => x.name === name); el.value = v; (ouv.input || []).forEach(fn => fn({target: el})); }};
}
test('revisão: B4, fechar o diálogo com algo digitado pergunta "Descartar o rascunho?"; o aviso do rascunho que voltou tem "Descartar"', async () => {
  const t = telaApp({confirmar: () => true});
  const ligar = (f, tela, osId) => { t.ctx.__f = f; return t.run(`ligarRascunhoForm(__f, ${JSON.stringify(tela)}, ${JSON.stringify(osId)})`); };
  const f1 = formFalso({motivo: ''});
  const r1 = ligar(f1, 'cancelar', 'os1');
  await tique();
  f1.digitar('motivo', 'O cliente desistiu da instalação fictícia');
  t.correrTimers(); await tique();
  // Caso ruim: "Voltar" e "×" fechavam calados, e o motivo desistido voltava por 7 dias com "Cancelar a O.S." ao lado.
  assert.equal(typeof r1.sujo, 'function');
  assert.equal(r1.sujo(), true);
  let fechou = 0;
  t.ctx.__r = r1; t.ctx.__fechar = () => { fechou++; };
  t.run('fecharDialogoComRascunho(__r, __fechar)');
  assert.deepEqual(t.perguntas, ['Descartar o rascunho?\n\nOK apaga o que você digitou aqui. Cancelar fecha e guarda o texto para quando abrir de novo.']);
  assert.equal(fechou, 1);
  await tique();
  const f2 = formFalso({motivo: ''});
  ligar(f2, 'cancelar', 'os1'); await tique();
  assert.equal(f2.els[0].value, '', 'OK descartou');
  // "Cancelar" na pergunta: fecha e guarda; ao abrir de novo, o aviso traz "Descartar".
  const t2 = telaApp({confirmar: () => false});
  const ligar2 = (f, tela, osId) => { t2.ctx.__f = f; return t2.run(`ligarRascunhoForm(__f, ${JSON.stringify(tela)}, ${JSON.stringify(osId)})`); };
  const g1 = formFalso({motivo: ''});
  const s1 = ligar2(g1, 'abonar', 'os2'); await tique();
  g1.digitar('motivo', 'Cliente pediu para remarcar (fictício)'); t2.correrTimers(); await tique();
  t2.ctx.__r = s1; t2.ctx.__fechar = () => {};
  t2.run('fecharDialogoComRascunho(__r, __fechar)');
  const g2 = formFalso({motivo: ''});
  ligar2(g2, 'abonar', 'os2'); await tique();
  assert.equal(g2.els[0].value, 'Cliente pediu para remarcar (fictício)', 'guardou');
  const botao = g2.aviso.filhos.find(x => x && x.tagName === 'BUTTON');
  assert.ok(botao, 'o aviso azul tem o botão');
  assert.equal(botao.textContent, 'Descartar');
  botao.onclick();
  assert.equal(g2.els[0].value, '', 'o formulário volta ao que abriu');
  await tique();
  const g3 = formFalso({motivo: ''});
  ligar2(g3, 'abonar', 'os2'); await tique();
  assert.equal(g3.els[0].value, '', 'e o rascunho saiu');
  // Sem nada digitado, fechar não pergunta.
  const t3 = telaApp();
  t3.ctx.__r = {sujo: () => false, limpar() {}}; t3.ctx.__fechar = () => {};
  t3.run('fecharDialogoComRascunho(__r, __fechar)');
  assert.deepEqual(t3.perguntas, []);
  // Os três diálogos usam a pergunta: Cancelar a O.S. e Lançar (abrirDialogoEntrega), Abonar (abrirDialogoF17) e o "Voltar sem finalizar" do retrabalho.
  const app = ler('app.js');
  assert.match(app, /\[data-ent-fechar\]'\)\.forEach\(b => \{ b\.onclick = \(\) => fecharDialogoComRascunho\(rasc, fechar\); \}\);/);
  assert.match(app, /\[data-f17-fechar\]'\)\.forEach\(b => \{ b\.onclick = \(\) => fecharDialogoComRascunho\(rasc, fechar\); \}\);/);
  assert.match(app, /\$\('#retrab-voltar', box\)\.onclick = \(\) => \{\n\s+const sair = [^\n]+\n\s+if \(typeof fecharDialogoComRascunho === 'function'\) fecharDialogoComRascunho\(rasc, sair\); else sair\(\);/);
});
