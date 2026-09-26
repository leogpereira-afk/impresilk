/* COSTURA (25/09/2026): o que as frentes de correção não fecharam sozinhas
   porque dependia de arquivo de outra frente. Cada teste começa pelo caso
   ruim; sem o conserto correspondente ele falha. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const OS = 'impresilk_inst_os', FILA = 'impresilk_inst_fila', CFG = 'impresilk_inst_cfg';

const row = (id, registro) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id, rev: 1, ...registro}});

function fakeIDB() {
  const stores = { fotos: new Map(), os: new Map() };
  const db = { transaction() {
    const tx = { objectStore: n => ({
      get(k) { const req = {}; queueMicrotask(() => req.onsuccess?.({ target: { result: stores[n].has(k) ? JSON.parse(JSON.stringify(stores[n].get(k))) : null } })); return req; },
      put(v, k) { queueMicrotask(() => { stores[n].set(k !== undefined ? k : v.id, JSON.parse(JSON.stringify(v))); tx.oncomplete?.(); }); },
      delete(k) { queueMicrotask(() => { stores[n].delete(k); tx.oncomplete?.(); }); },
    }) };
    return tx;
  } };
  return { db, stores };
}
function store({ lista = [], fila = [], cfg = null, responder = () => ({ os: [] }) } = {}) {
  const ls = new Map([[OS, JSON.stringify(lista)], [FILA, JSON.stringify(fila)]]);
  if (cfg) ls.set(CFG, JSON.stringify(cfg));
  const eventos = [], enviados = [];
  const idb = fakeIDB();
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, navigator: { onLine: true }, window: { addEventListener() {} },
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k) },
    indexedDB: { open() { const req = {}; queueMicrotask(() => req.onsuccess({ target: { result: idb.db } })); return req; }, deleteDatabase() {} },
    setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: async (_url, req) => { const b = JSON.parse(req.body); enviados.push(b); const r = await responder(b); return { ok: !(r.http >= 400), status: r.http || 200, json: async () => r }; }
  });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'store.js'), 'utf8'), ctx);
  const s = vm.runInContext('STORE', ctx);
  for (const ev of ['item-aviso', 'item-pendente', 'item-recusado', 'foto-falhou', 'conflito-cfg']) s.on(ev, d => eventos.push([ev, d]));
  return { s, ls, ctx, eventos, enviados };
}
// Objetos do vm vêm de outro "realm": compara pelo conteúdo.
const js = x => JSON.parse(JSON.stringify(x));
const espera = (ms = 15) => new Promise(r => setTimeout(r, ms));

/* O servidor grava o resto e devolve em `avisos` o que deixou de fora; o
   aparelho não dizia nada e a O.S. só voltava ao estado do escritório. */
test('upsert aceito com avisos do servidor: o aparelho recebe item-aviso com o texto', async () => {
  const os = { id: 'a', numero: '77', rev: 1, atualizadoEm: '2026-09-25T09:00:00' };
  const o = store({ lista: [os], responder: b => b.action === 'upsert'
    ? { ok: true, os: { ...b.os, rev: 2 }, avisos: ['O carro não foi liberado: o cliente precisa ser confirmado no dia da saída. Fale com o PCP.'] }
    : { os: [] } });
  await o.s.pronto();
  o.s.saveOS({ ...os, carroLiberado: true, atualizadoEm: '2026-09-25T09:05:00' });
  await espera(); await o.s.trySync();
  const av = o.eventos.filter(([ev]) => ev === 'item-aviso');
  assert.equal(av.length, 1);
  assert.match(av[0][1].avisos.join(' '), /carro não foi liberado/);
  assert.equal(o.s.getQueue().length, 0, 'gravou: sai da fila');
});

/* Cada confirmação de participação empilhava uma cópia inteira da config
   (duas, com a base) no localStorage que os sistemas dividem. */
test('duas configurações salvas sem sinal viram UM envio, com a base da primeira e o valor da última', async () => {
  const o = store({ cfg: { instaladores: ['Ana'], agendaPCP: {} } });
  await o.s.pronto();
  o.ctx.navigator.onLine = false;
  const c0 = o.s.getCFG();
  o.s.saveCFG({ ...c0, instaladores: ['Ana', 'Bia'] });
  o.s.saveCFG({ ...o.s.getCFG(), agendaPCP: { plantoes: [{ id: 'p1' }] } });
  const q = o.s.getQueue().filter(x => x.action === 'setCfg');
  assert.equal(q.length, 1, 'uma cópia só na fila');
  assert.deepEqual(js(q[0].baseCfg.instaladores), ['Ana'], 'base da primeira: o servidor vê as duas mudanças');
  assert.deepEqual(js(q[0].cfg.instaladores), ['Ana', 'Bia']);
  assert.equal(q[0].cfg.agendaPCP.plantoes.length, 1);
});

test('configuração salva enquanto a anterior está em voo não se perde e é rebaseada', async () => {
  let soltar; const emVoo = new Promise(r => { soltar = r; });
  let chamadas = 0;
  const o = store({ cfg: { instaladores: ['Ana'], agendaPCP: {} }, responder: async b => {
    if (b.action !== 'setCfg') return { os: [] };
    chamadas++;
    if (chamadas === 1) { await emVoo; return { ok: true, cfg: b.cfg, versao: 'v1' }; }
    return { ok: true, cfg: b.cfg, versao: 'v2' };
  } });
  await o.s.pronto();
  const c0 = o.s.getCFG();
  o.s.saveCFG({ ...c0, instaladores: ['Ana', 'Bia'] });          // dispara o envio
  await new Promise(r => setImmediate(r));
  o.s.saveCFG({ ...o.s.getCFG(), instaladores: ['Ana', 'Bia', 'Caio'] });
  soltar(); await espera();
  const q = o.s.getQueue().filter(x => x.action === 'setCfg');
  assert.equal(q.length, 1, 'a gravação feita durante o envio fica na fila');
  assert.deepEqual(js(q[0].cfg.instaladores), ['Ana', 'Bia', 'Caio']);
  assert.deepEqual(js(q[0].baseCfg.instaladores), ['Ana', 'Bia'], 'a base passa a ser a que o servidor aceitou (sem conflito falso na mescla)');
  assert.deepEqual(js(o.s.getCFG().instaladores), ['Ana', 'Bia', 'Caio'], 'a tela não volta para a versão do servidor');
});

/* "Regravar a minha" mandava a config inteira deste aparelho e desfazia, calado,
   o que o outro aparelho mudou em campo sem conflito. */
test('Regravar a minha vence só no que este aparelho mudou; o resto fica como o outro deixou', async () => {
  const base = { instaladores: ['Ana'], mensagemDia: 'bom dia', agendaPCP: { plantoes: [] } };
  const o = store({ cfg: base, responder: b => b.action === 'setCfg'
    ? (b.cfg.mensagemDia === 'meu texto' && b.baseCfg.mensagemDia === 'bom dia'
      ? { http: 409, conflitoCfg: true, servidorCfg: { instaladores: ['Ana', 'Zé'], mensagemDia: 'texto do outro', agendaPCP: { plantoes: [] } }, campos: ['mensagemDia'] }
      : { ok: true, cfg: b.cfg, versao: 'v9' })
    : { os: [] } });
  await o.s.pronto();
  o.s.saveCFG({ ...o.s.getCFG(), mensagemDia: 'meu texto' });
  await espera(); await o.s.trySync();
  assert.ok(o.s.conflitoCFG(), 'o conflito ficou registrado');
  o.s.resolverCFG(true);
  await espera();
  const env = o.s.getQueue().find(x => x.action === 'setCfg') || o.enviados.filter(b => b.action === 'setCfg').pop();
  assert.equal(env.cfg.mensagemDia, 'meu texto', 'o que eu mudei vence');
  assert.deepEqual(js(env.cfg.instaladores), ['Ana', 'Zé'], 'o instalador que o outro cadastrou não some');
});

/* A fila "a lançar" (baixa do ERP sem finalização no PCP, depois do corte da
   direção) sumia do aparelho 60 dias depois da baixa. */
test('lista completa não poda do aparelho a O.S. que espera lançamento manual', async () => {
  const aLancar = { id: 'erp1', numero: '900', rev: 3, tipo: 'externo', finalizadaEm: '2026-09-16T12:00:00.000Z', finalizadoPor: 'Mubisys (baixa)', baixaAutoERP: { em: '2026-09-16T12:00:00.000Z' } };
  const lancada = { ...aLancar, id: 'erp2', numero: '901', entregaLancada: { data: '2026-09-17' } };
  const antiga = { ...aLancar, id: 'erp3', numero: '902', finalizadaEm: '2026-09-01T12:00:00.000Z', baixaAutoERP: { em: '2026-09-01T12:00:00.000Z' } };
  const o = store({ lista: [aLancar, lancada, antiga], responder: b => b.action === 'list' ? { os: [], agora: '2026-11-30T10:00:00Z' } : { os: [] } });
  await o.s.pronto();
  await o.s.pull(null, { completo: true });
  const ids = o.s.getAllOS().map(x => x.id);
  assert.ok(ids.includes('erp1'), 'a pendência de lançamento fica');
  assert.ok(!ids.includes('erp2'), 'a já lançada segue a janela');
  assert.ok(!ids.includes('erp3'), 'a de antes do corte já conta como entregue e segue a janela');
});

test('servidor: estender a duração com a equipe na rua não zera a confirmação nem o carro', async () => {
  const e = await edge('pcp-sync', {pcp_registros: [row('1', {tipo: 'externo', equipe: ['Ana'], instalacao: {data: '2026-09-19', periodo: 'Manhã', duracaoDias: 1},
    confirmacao: 'Confirmado', confEm: '2026-09-19T08:00:00-03:00', carroLiberado: true, horaSaida: '08:30', saidaEm: '2026-09-19T08:30:00'})]});
  const g0 = e.db.pcp_registros[0].registro;
  const r = await e.call({action: 'upsert', os: {...g0, instalacao: {...g0.instalacao, duracaoDias: 2}}}, {papel: 'pcp', nome: 'Gestor'});
  assert.equal(r.ok, true);
  assert.equal(r.os.confirmacao, 'Confirmado', 'a equipe está no cliente: o espelho ainda precisa finalizar');
  assert.equal(r.os.carroLiberado, true);
  // Sem ninguém na rua, mudar a agenda continua sendo remarcar.
  const e2 = await edge('pcp-sync', {pcp_registros: [row('2', {tipo: 'externo', instalacao: {data: '2026-09-19', duracaoDias: 1}, confirmacao: 'Confirmado', confEm: '2026-09-18T08:00:00-03:00', carroLiberado: true})]});
  const g2 = e2.db.pcp_registros[0].registro;
  const r2 = await e2.call({action: 'upsert', os: {...g2, instalacao: {data: '2026-09-22', duracaoDias: 1}}}, {papel: 'pcp', nome: 'Gestor'});
  assert.equal(r2.os.confirmacao, '');
  assert.equal(r2.os.carroLiberado, false);
});

test('servidor: o contato que o admin cadastra chega ao banco; o pcp segue sem mexer na agenda nem nas senhas', async () => {
  const cfg0 = {usuarios: ['segredo'], funcionarios: [{nome: 'Ana', numero: '1'}], agendaPCP: {}};
  const e = await edge('pcp-sync', {pcp_config_global: [{id: true, config: cfg0, atualizado_em: '2026-09-19T10:00:00Z'}]});
  const base = {funcionarios: [{nome: 'Ana', numero: '1'}], agendaPCP: {}};
  const r = await e.call({action: 'setCfg', baseCfg: base, cfg: {...base, funcionarios: [{nome: 'Ana', numero: '1'}, {nome: 'Bia', numero: '2'}], usuarios: ['invasor']}}, {papel: 'admin', nome: 'Léo'});
  assert.equal(r.ok, true);
  const g = e.db.pcp_config_global[0].config;
  assert.equal(g.funcionarios.length, 2, 'o contato novo foi gravado');
  assert.deepEqual(g.usuarios, ['segredo'], 'usuarios nunca entram pelo setCfg');
  const base2 = {funcionarios: g.funcionarios, agendaPCP: {}};
  await e.call({action: 'setCfg', baseCfg: base2, cfg: {...base2, funcionarios: []}}, {papel: 'pcp', nome: 'Gestor'});
  assert.equal(e.db.pcp_config_global[0].config.funcionarios.length, 2, 'o pcp não apaga a agenda');
});

test('servidor: local do check-in em formato estranho não entra pela gestão', async () => {
  const e = await edge('pcp-sync', {pcp_registros: [row('1', {tipo: 'externo', checkinGPS: {lat: -19.9, lng: -43.9, precisao: 10, ts: '2026-09-19T09:00:00Z'}})]});
  const g0 = e.db.pcp_registros[0].registro;
  const r = await e.call({action: 'upsert', os: {...g0, checkinGPS: {lat: '<b>x</b>', lng: 'y', extra: 'lixo'}}}, {papel: 'pcp', nome: 'Gestor'});
  assert.equal(r.ok, true);
  assert.deepEqual(e.db.pcp_registros[0].registro.checkinGPS, {lat: -19.9, lng: -43.9, precisao: 10, ts: '2026-09-19T09:00:00Z'});
  const r2 = await e.call({action: 'upsert', os: {...e.db.pcp_registros[0].registro, checkinGPS: {lat: '-19.8', lng: -43.8, precisao: 5, ts: 'x', extra: 1}}}, {papel: 'pcp', nome: 'Gestor'});
  assert.equal(r2.ok, true);
  assert.deepEqual(e.db.pcp_registros[0].registro.checkinGPS, {lat: -19.8, lng: -43.8, precisao: 5, ts: 'x'}, 'só os quatro campos, com número');
});

/* Espelho: a recusa de validação (400/422) fica na fila com o motivo, mas a
   linha da O.S. dizia só "ainda no celular" e a pílula prometia que "some
   sozinho". Harness mínimo do espelho (o mesmo desenho de espelho-rua). */
function espelho({ lista = [], fila = [] } = {}) {
  const nodes = new Map(), toasts = [];
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', title:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){},
      classList:{toggle(){}, add(){}, remove(){}}});
    return nodes.get(sel);
  }
  const STORE = { getCFG: () => ({}), getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null, getQueue: () => fila,
    pullPhoto: async () => null, getLastSync: () => '2026-09-25T10:00:00Z' };
  const ctx = vm.createContext({console, Date, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}},
    window:{}, localStorage:{getItem:() => null, setItem(){}}, STORE, setTimeout(){}, confirm: () => true, navigator:{onLine:true}});
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'equipe.js'), 'utf8'), ctx);
  vm.runInContext('toast=(m,t)=>__toasts.push(m); EQ.instalador="Ana"; EQ.pronto=true;', Object.assign(ctx, {__toasts: toasts}));
  return { node, toasts, run: c => vm.runInContext(c, ctx) };
}
test('espelho: O.S. parada por recusa do escritório mostra o motivo na lista e na pílula', () => {
  const hoje = require('../operacao.js').dia(new Date());
  const os = { id: 'r1', numero: '55', cliente: 'Loja', tipo: 'externo', equipe: ['Ana'], liberadoPCP: true, instalacao: { data: hoje, periodo: 'Manhã' } };
  const fila = [{ action: 'upsert', os: { id: 'r1', numero: '55' }, recusa: { status: 422, motivo: 'O cliente ainda não confirmou esta instalação.' } }];
  const t = espelho({ lista: [os], fila });
  t.run('renderList()');
  const html = t.node('#eq-list').innerHTML;
  assert.match(html, /parada no celular/);
  assert.match(html, /O cliente ainda não confirmou esta instalação\./);
  t.run("pintarSync('pending', 1)");
  assert.doesNotMatch(t.node('#sync-indicator').title, /Some sozinho/, 'não promete o que não vai acontecer');
  assert.match(t.node('#sync-indicator').title, /não aceitou/);
});
