/* NÚCLEO: fila de envio, fotos, conflito e service worker.
   Cada teste abaixo começou pelo caso ruim que a auditoria de 25/09/2026
   achou; sem o conserto correspondente em store.js/sw.js ele falha. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = process.env.PCP_BASELINE || path.join(__dirname, '..');
const OS = 'impresilk_inst_os', FILA = 'impresilk_inst_fila', CFG = 'impresilk_inst_cfg';

// IndexedDB de mentira com armazéns de verdade (get/put/delete por chave).
function fakeIDB(osInicial = {}) {
  const stores = { fotos: new Map(), os: new Map(Object.entries(osInicial)) };
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

function store({ lista = [], fila = [], responder = () => ({ os: [] }), cheio = () => false, idb = fakeIDB(), extra = {} } = {}) {
  const ls = new Map([[OS, JSON.stringify(lista)], [FILA, JSON.stringify(fila)]]);
  const eventos = [];
  const ctx = vm.createContext(Object.assign({
    console: { log() {}, warn() {}, error() {} }, navigator: { onLine: true }, window: { addEventListener() {} },
    localStorage: {
      getItem: k => ls.has(k) ? ls.get(k) : null,
      setItem: (k, v) => { if (cheio(k)) { const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e; } ls.set(k, v); },
      removeItem: k => ls.delete(k)
    },
    indexedDB: { open() { const req = {}; queueMicrotask(() => req.onsuccess({ target: { result: idb.db } })); return req; }, deleteDatabase() {} },
    setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: async (_url, req) => { const r = await responder(JSON.parse(req.body)); return { ok: !(r.http >= 400), status: r.http || 200, json: async () => r }; }
  }, extra));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'store.js'), 'utf8'), ctx);
  const s = vm.runInContext('STORE', ctx);
  for (const ev of ['quota', 'item-pendente', 'item-recusado', 'foto-falhou']) s.on(ev, d => eventos.push([ev, d]));
  return { s, ls, ctx, eventos, idb };
}
const espera = () => new Promise(r => setTimeout(r, 5));

/* Cofre cheio: os sistemas da casa dividem o localStorage da origem. A ação
   não entrava na fila, o indicador dizia ✅ e "Sair" apagava o trabalho. */
test('fila que não cabe no localStorage continua valendo: envia, segura o Sair e volta do disco no boot', async () => {
  const idb = fakeIDB();
  const o = store({ cheio: k => k === FILA, idb, responder: () => new Promise(() => {}) });
  await o.s.pronto();
  o.ctx.navigator.onLine = false;
  o.s.saveOS({ id: 'a', numero: '100', atualizadoEm: '2026-09-25T09:00:00' });
  assert.equal(o.s.getQueue().length, 1, 'a finalização não pode sumir da fila');
  assert.equal(o.s.limparCache(), false, 'Sair não pode apagar o trabalho que não subiu');
  assert.ok(o.eventos.some(([ev]) => ev === 'quota'), 'o aperto é avisado');
  await espera();
  assert.equal(idb.stores.os.get('fila').length, 1, 'cópia no IndexedDB para o app fechado');
  // App reaberto com o cofre já livre: a fila volta do disco e a cópia sai.
  const re = store({ idb });
  await re.s.pronto();
  assert.equal(re.s.getQueue().length, 1);
  assert.equal(re.s.getQueue()[0].os.numero, '100');
  await espera();
  assert.equal(idb.stores.os.has('fila'), false);
});

test('no boot a cópia do disco é a fila: o que já foi aceito não volta do localStorage velho', async () => {
  // Cofre apertado: o localStorage ficou com a última fila que coube ([A]);
  // A foi aceito e a fila restante [B, C] só coube no IndexedDB.
  const idb = fakeIDB({ fila: [
    { action: 'upsert', os: { id: 'B', rev: 1, atualizadoEm: '2026-09-25T09:01:00' } },
    { action: 'upsert', os: { id: 'C', rev: 1, atualizadoEm: '2026-09-25T09:02:00' } }] });
  const o = store({ idb, fila: [{ action: 'upsert', os: { id: 'A', rev: 1, atualizadoEm: '2026-09-25T09:00:00' } }] });
  await o.s.pronto();
  assert.deepEqual([...o.s.getQueue().map(x => x.os.id)], ['B', 'C'], 'A já tinha sido aceito e não é reenviado');
});

test('foto apagada antes de subir não deixa envio eterno na fila', async () => {
  const o = store({ fila: [{ action: 'putPhoto', mime: 'image/jpeg', fileId: 'f1' }, { action: 'putPhoto', mime: 'image/jpeg', fileId: 'f2' }] });
  await o.s.pronto();
  await o.s.delFoto('f1');
  assert.deepEqual([...o.s.getQueue().map(x => x.fileId)], ['f2']);
});

test('foto que sumiu do aparelho sai da fila e é dita, em vez de prender o Sair', async () => {
  const o = store({ fila: [{ action: 'putPhoto', mime: 'image/jpeg', fileId: 'sumiu' }] });
  await o.s.pronto(); await o.s.trySync();
  assert.equal(o.s.getQueue().length, 0);
  assert.ok(o.eventos.some(([ev]) => ev === 'foto-falhou'));
});

test('salvar configuração não apaga a agenda de contatos deste aparelho', async () => {
  const o = store({ responder: q => q.action === 'setCfg' ? { ok: true, cfg: { tema: 'verde' }, versao: '2' } : { os: [] } });
  await o.s.pronto();
  o.ls.set(CFG, JSON.stringify({ tema: 'azul', funcionarios: [{ nome: 'Ana', numero: '1' }] }));
  const cfg = o.s.getCFG(); cfg.tema = 'verde'; cfg.funcionarios = [...cfg.funcionarios, { nome: 'Beto', numero: '2' }];
  o.s.saveCFG(cfg); await espera();
  assert.equal(o.s.getCFG().tema, 'verde');
  assert.deepEqual([...o.s.getCFG().funcionarios.map(f => f.nome)], ['Ana', 'Beto']);
});

/* O rascunho da ficha aberta é o objeto que o saveOS guarda na lista. */
test('rascunho salvo duas vezes com envio no meio não vira conflito contra a própria gravação', async () => {
  let rev = 5;
  const o = store({ responder: q => {
    if (q.action !== 'upsert') return { os: [] };
    if (q.os.rev !== rev) return { conflito: true, servidor: { ...q.os, rev } };
    rev++; return { ok: true, os: { ...q.os, rev } };
  } });
  const conflitos = []; o.s.onConflict((l, r) => conflitos.push([l.rev, r.rev]));
  await o.s.pronto();
  o.ctx.navigator.onLine = false;
  o.s.saveOS({ id: 'a', rev: 5, atualizadoEm: '2026-09-25T09:00:00' });
  const draft = o.s.getOS('a');   // a ficha abre e segue com este objeto
  o.ctx.navigator.onLine = true; await o.s.trySync();
  draft.item1 = 'Instalado'; draft.atualizadoEm = '2026-09-25T09:00:20';
  o.s.saveOS(draft); await espera();
  assert.deepEqual(conflitos, []);
  assert.equal(o.s.getQueue().length, 0);
  assert.equal(rev, 7);
});

test('Sobrescrever leva a versão mais nova do aparelho, não a da hora do conflito', async () => {
  const enviados = [];
  const o = store({ responder: q => { if (q.action === 'upsert') { enviados.push(q.os); return q.os.rev === 9 ? { ok: true, os: { ...q.os, rev: 10 } } : { conflito: true, servidor: { id: 'a', rev: 9 } }; } return { os: [] }; } });
  let local = null; o.s.onConflict(l => { local = l; });
  await o.s.pronto();
  o.s.saveOS({ id: 'a', rev: 5, atualizadoEm: '2026-09-25T09:00:00' });
  await espera();
  assert.ok(local, 'conflito apareceu');
  // Seguiu trabalhando na ficha antes de tocar no botão.
  o.s.saveOS({ id: 'a', rev: 5, atualizadoEm: '2026-09-25T09:10:00', finalizadaEm: '2026-09-25T09:10:00' });
  await espera();
  o.s.sobrescreverServidor(local);
  await espera();
  assert.ok(enviados.at(-1).finalizadaEm, 'a finalização feita depois do conflito vai junto');
  assert.equal(enviados.at(-1).rev, 9);
});

/* 422 de O.S. excluída ou fora da equipe ficava na fila para sempre e travava
   o Sair, a troca de instalador e a entrada da gestão no celular. */
test('recusa definitiva (O.S. excluída ou fora da equipe) sai da fila e é dita; 422 comum fica', async () => {
  const o = store({ responder: q => q.action !== 'upsert' ? { os: [] }
    : q.os.id === 'x' ? { http: 422, error: 'Esta O.S. foi excluída pelo PCP.', definitivo: true }
    : { http: 422, error: 'O retorno não pode ser anterior à saída.' } });
  await o.s.pronto();
  o.ctx.navigator.onLine = false;
  o.s.saveOS({ id: 'x', numero: '555', atualizadoEm: '2026-09-25T09:00:00' });
  o.s.saveOS({ id: 'y', numero: '556', atualizadoEm: '2026-09-25T09:00:00' });
  o.ctx.navigator.onLine = true;
  await o.s.trySync();
  assert.deepEqual([...o.s.getQueue().map(x => x.os.id)], ['y'], 'só a recusa de validação continua esperando');
  const rec = o.eventos.find(([ev]) => ev === 'item-recusado');
  assert.ok(rec, 'a recusa é avisada (o espelho guarda a cópia)');
  assert.equal(rec[1].item.os.numero, '555');
  assert.match(rec[1].motivo, /excluída/);
});

/* A tela mesclava as fotos e a saída da rua na cópia da fila; o store trocava
   essa cópia pelo objeto da lista (empate no atualizadoEm) e enviava sem elas. */
test('Sobrescrever da gestão: as fotos e a saída da rua chegam ao servidor', async () => {
  const app = fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname, '..'), 'app.js'), 'utf8');
  const manter = new Function(app.slice(app.indexOf('const CAMPOS_EXECUCAO_RUA'), app.indexOf('function initConflictDialog')) + '; return manterExecucaoDoServidor;')();
  const enviados = [];
  const servidor = { id: 'a', rev: 9, fotosCheckinIds: ['f-rua'], saidaEm: '2026-09-25T08:00:00', horaSaida: '08:00' };
  const o = store({ responder: q => { if (q.action === 'upsert') { enviados.push(JSON.parse(JSON.stringify(q.os))); return q.os.rev === 9 ? { ok: true, os: { ...q.os, rev: 10 } } : { conflito: true, servidor }; } return { os: [] }; } });
  let local = null, remote = null; o.s.onConflict((l, r) => { local = l; remote = r; });
  await o.s.pronto();
  o.s.saveOS({ id: 'a', rev: 5, atualizadoEm: '2026-09-25T09:00:00', obsPCP: 'minha' });
  await espera();
  assert.ok(local, 'conflito apareceu');
  // Exatamente o que o botão "Sobrescrever" da gestão faz.
  o.s.sobrescreverServidor(local, alvo => manter(alvo, remote));
  await espera();
  const ult = enviados.at(-1);
  assert.equal(ult.rev, 9);
  assert.equal(ult.obsPCP, 'minha');
  assert.deepEqual([...ult.fotosCheckinIds], ['f-rua'], 'a foto da rua que o diálogo prometeu manter');
  assert.equal(ult.saidaEm, '2026-09-25T08:00:00');
  assert.equal(ult.horaSaida, '08:00');
});

test('Sobrescrever da gestão não remarca a Instalação OK que o PCP desmarcou', () => {
  const app = fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname, '..'), 'app.js'), 'utf8');
  const manter = new Function(app.slice(app.indexOf('const CAMPOS_EXECUCAO_RUA'), app.indexOf('function initConflictDialog')) + '; return manterExecucaoDoServidor;')();
  const local = { id: 'a', instalacaoOK: false, conferidoPor: '', ferramentasConferidas: false };
  manter(local, { id: 'a', instalacaoOK: true, conferidoPor: 'Fulano', ferramentasConferidas: true, horaSaida: '08:00' });
  assert.equal(local.instalacaoOK, false);
  assert.equal(local.conferidoPor, '');
  assert.equal(local.ferramentasConferidas, false);
  assert.equal(local.horaSaida, '08:00', 'a saída da rua continua vindo');
});

test('com sinal fraco a foto não segura a O.S: o leve vai primeiro', async () => {
  const enviados = [];
  const o = store({
    fila: [{ action: 'putPhoto', mime: 'image/jpeg', fileId: 'f1' }, { action: 'upsert', os: { id: 'a', numero: '100', atualizadoEm: '2026-09-25' } }],
    responder: q => { enviados.push(q.action); return q.action === 'putPhoto' ? { http: 503 } : { ok: true, os: { ...q.os, rev: 1 } }; }
  });
  await o.s.pronto();
  await o.s.putFoto('f1', 'data:image/jpeg;base64,AAA', 'image/jpeg');
  await o.s.trySync();
  assert.equal(enviados[0], 'upsert', 'a saída e a finalização não esperam a foto');
  assert.deepEqual([...o.s.getQueue().map(x => x.action)], ['putPhoto'], 'a foto fica para o próximo ciclo');
});

test('recusa 422 de O.S é dita na primeira vez, fica anotada na fila e não repete o aviso', async () => {
  const o = store({ fila: [{ action: 'upsert', os: { id: 'a', numero: '100', atualizadoEm: '2026-09-25' } }],
    responder: () => ({ http: 422, error: 'O cliente ainda não confirmou esta instalação.' }) });
  await o.s.pronto();
  await o.s.trySync();
  const avisos = () => o.eventos.filter(([ev]) => ev === 'item-pendente');
  assert.equal(avisos().length, 1, 'o instalador sabe na hora, não 12 minutos depois');
  assert.match(avisos()[0][1].motivo, /não confirmou/);
  assert.match(o.s.getQueue()[0].recusa.motivo, /não confirmou/, 'o motivo sobrevive a reabrir o app');
  await o.s.trySync();
  assert.equal(avisos().length, 1, 'o mesmo motivo não vira um aviso a cada 30 s');
  assert.equal(o.s.getQueue().length, 1, 'o trabalho fica guardado');
});

test('pushPhoto devolve o id sem esperar o upload, e a foto está na fila', async () => {
  const extra = {
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Image: class { set src(_v) { this.width = 10; this.height = 10; queueMicrotask(() => this.onload()); } },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AAA' }) }
  };
  const o = store({ extra, responder: () => new Promise(() => {}) });   // rede pendurada
  await o.s.pronto();
  const id = await Promise.race([o.s.pushPhoto({}), new Promise(r => setTimeout(() => r('ESPERANDO'), 50))]);
  assert.match(id, /^foto_/, 'a ficha recebe a foto na hora, antes de o instalador fechar ou trocar de O.S');
  assert.deepEqual([...o.s.getQueue().map(x => x.fileId)], [id]);
  assert.ok(await o.s.getFoto(id), 'guardada no aparelho');
});

test('foto que o aparelho não consegue ler é dita, não some calada', async () => {
  const extra = {
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Image: class { set src(_v) { queueMicrotask(() => this.onerror()); } },
    document: {}
  };
  const o = store({ extra });
  await o.s.pronto();
  assert.equal(await o.s.pushPhoto({}), null);
  assert.ok(o.eventos.some(([ev, d]) => ev === 'foto-falhou' && /ler esta foto/.test(d.motivo)));
});

test('restaurar backup não perde a foto que ainda não subiu', async () => {
  const o = store({ fila: [{ action: 'putPhoto', mime: 'image/jpeg', fileId: 'f1' }, { action: 'upsert', os: { id: 'a' } }] });
  await o.s.pronto();
  o.s.importarBackup({ os: [] });
  assert.deepEqual([...o.s.getQueue().map(x => x.action)], ['putPhoto']);
});

test('retorno depois da meia-noite vai para o dia seguinte, não para antes da saída', () => {
  const o = store();
  const os = { instalacao: { data: '2026-09-25' }, horaSaida: '22:00', horaRetorno: '01:30' };
  o.s.carimbarMomento(os, 'horaSaida', 'saidaEm');
  o.s.carimbarMomento(os, 'horaRetorno', 'retornoEm');
  assert.equal(os.saidaEm, '2026-09-25T22:00:00');
  assert.equal(os.retornoEm, '2026-09-26T01:30:00', 'o servidor recusa retorno anterior à saída');
  // Virada de mês também.
  const fim = { instalacao: { data: '2026-09-30' }, horaSaida: '21:00', horaRetorno: '00:15' };
  o.s.carimbarMomento(fim, 'horaSaida', 'saidaEm'); o.s.carimbarMomento(fim, 'horaRetorno', 'retornoEm');
  assert.equal(fim.retornoEm, '2026-10-01T00:15:00');
  // Mesmo dia continua no mesmo dia.
  const dia = { instalacao: { data: '2026-09-25' }, horaSaida: '08:00', horaRetorno: '12:00' };
  o.s.carimbarMomento(dia, 'horaSaida', 'saidaEm'); o.s.carimbarMomento(dia, 'horaRetorno', 'retornoEm');
  assert.equal(dia.retornoEm, '2026-09-25T12:00:00');
});

test('carimbo no ato usa hoje, não o dia da agenda da O.S vencida', () => {
  const o = store();
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const os = { instalacao: { data: '2020-01-10' }, horaSaida: '08:00' };
  o.s.carimbarMomento(os, 'horaSaida', 'saidaEm', true);
  assert.equal(os.saidaEm, hoje + 'T08:00:00');
  const digitada = { instalacao: { data: '2020-01-10' }, horaSaida: '08:00' };
  o.s.carimbarMomento(digitada, 'horaSaida', 'saidaEm');
  assert.equal(digitada.saidaEm, '2020-01-10T08:00:00', 'hora digitada depois segue a agenda');
});

test('outra aba apagou a base: esta solta a conexão e não regrava a sessão que saiu', async () => {
  const idb = fakeIDB();
  const o = store({ idb });
  const trocas = []; o.s.on('base-trocada', () => trocas.push(1));
  await o.s.pronto();
  assert.equal(typeof idb.db.onversionchange, 'function', 'sem isto o delete da outra aba fica bloqueado');
  idb.db.close = () => {};
  idb.db.onversionchange();
  assert.equal(trocas.length, 1);
  await assert.rejects(o.s.putFoto('x', 'data:,', 'image/jpeg'));
});

/* ── Service worker ── */
function sw({ guardados = {}, rede }) {
  const handlers = {}, abertos = [], adicionados = [];
  const cacheObj = { addAll: async reqs => { adicionados.push(...reqs.map(r => r.url || r)); }, add: async () => {}, put: async () => {} };
  const ctx = vm.createContext({
    self: { addEventListener: (e, fn) => handlers[e] = fn, clients: { claim: async () => {} }, skipWaiting() {} },
    location: { origin: 'https://x.test' },
    URL, Request: class { constructor(u) { this.url = u; } }, Response: { error: () => 'ERRO' },
    // Relógio acelerado: os 3 s da corrida viram 20 ms no teste.
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)), fetch: rede,
    caches: { open: async n => { abertos.push(n); return cacheObj; }, match: async (req, opts) => guardados[typeof req === 'string' ? req : req.url] || (opts && opts.ignoreSearch ? null : null), keys: async () => [], delete: async () => {} }
  });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), ctx);
  const buscar = async (url, mode = 'no-cors') => {
    let resp, extra = [];
    handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: p => { resp = p; }, waitUntil: p => extra.push(p) });
    const r = await resp; await Promise.all(extra); return r;
  };
  return { buscar, abertos, adicionados };
}

test('service worker: arquivo com versão no endereço vem do cache sem esperar a rede', async () => {
  let pediu = 0;
  const t = sw({ guardados: { 'https://x.test/impresilk/store.js?v=vX': 'GUARDADO' }, rede: () => { pediu++; return new Promise(() => {}); } });
  assert.equal(await t.buscar('https://x.test/impresilk/store.js?v=vX'), 'GUARDADO');
  assert.equal(pediu, 0);
});

test('service worker: página com sinal fraco abre a guardada em 3 s', async () => {
  const t = sw({ guardados: { 'https://x.test/impresilk/equipe.html': 'PAGINA' }, rede: () => new Promise(() => {}) });
  assert.equal(await t.buscar('https://x.test/impresilk/equipe.html', 'navigate'), 'PAGINA');
});

test('service worker: casca apagada por outro sistema da origem é gravada de novo na navegação', async () => {
  const t = sw({ guardados: {}, rede: async () => ({ ok: true, clone() { return this; } }) });
  const r = await t.buscar('https://x.test/impresilk/equipe.html', 'navigate');
  assert.equal(r.ok, true);
  assert.ok(t.adicionados.includes('equipe.html'), 'a casca volta ao cache sem esperar a próxima versão');
});
