/* ONDA ACABAMENTO, ITEM 1 (M13 da auditoria de 11/10/2026, pela D-016:
   "vale a conferencia"). As marcas antigas por item (E2 a E7: Entregar tudo,
   parte, Retirado, Problema, Cancelar item, Desfazer, o "Entregar o saldo" da
   lista do ERP, o lote e o Instalado do celular) ficam SÓ LEITURA:
   - nenhuma tela oferece marcar (a ficha, o celular, o Fechar o dia, a lista
     "ERP diz entregue, PCP tem saldo");
   - a porta do servidor descarta a marca nova de qualquer papel com UM aviso,
     resposta 200 e `descartado`, nunca 422 (o celular da v171 sem sinal que
     marcou adota o gravado e a fila esvazia);
   - a marca já gravada continua lida (saldo, situação, item que não sai);
   - o celular continua com o Instalado, o Verificado, as fotos e a
     finalização.
   Cada teste começa pelo caso ruim (a v171, tirada do git, oferecia e
   gravava). Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {webcrypto} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const B = require('./helpers/lote-bancada.cjs');
const D = require('../entrega-item.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const V171 = '3affd9a';
const doGit = f => execFileSync('git', ['show', `${V171}:${f}`], {cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now());
const ficha = (id, nome, apelido, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido, cpf}});
const FICHAS = [ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'), ficha('bruno-f', 'Bruno Fictício', 'bruno', '10000222222'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'), ficha('adm-f', 'Admin Teste', 'admin1', '22233344455'), ficha('oper-f', 'Operador Teste', 'oper', '12312312312')];
const ITENS = () => [
  {uid: '8101:1:1', item: '1', descricao: 'Placa ACM fictícia', qtde: '10', valorUnit: '100', subtotal: '1000'},
  {uid: '8101:2:1', item: '2', descricao: 'Adesivo fictício', qtde: '1', valorUnit: '500', subtotal: '500'},
];
const PROVA = {fotosCheckinIds: ['c1'], fotosRetornoIds: ['r1'], horaSaida: '08:00', horaRetorno: '15:00', retornoEm: HOJE + 'T15:00:00'};
const row = (id, registro) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id, rev: 1, ...registro}});
const base = (extra = {}) => row('1', {numero: '8101', tipo: 'externo', origemMubisys: true, cliente: 'Cliente Fictício', equipe: ['100001', '100002'],
  liberadoPCP: true, confirmacao: 'Confirmado', valorTotal: '1500', instalacao: {data: HOJE, periodo: 'Manhã'}, itens: ITENS(), ...extra});
const banco = (regs = [base()]) => ({pcp_registros: regs, registros: structuredClone(FICHAS), equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}],
  pcp_config_global: [{id: true, config: {instaladores: ['Ana', 'Bruno']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const ADMIN = {papel: 'admin', nome: 'Admin Teste', sub: 'admin1'};
const OPER = {papel: 'operacao', nome: 'Operador Teste', sub: 'oper'};
const MONTAGEM = {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'};
const ANA = {nome: 'Ana', sub: 'Ana', id: '100001', papel: 'montagem', montagemIndividual: true};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const marcasGravadas = e => (gravada(e).itens || []).flatMap(it => (it && it.entregas) || []);
const ev = (id, tipo, extra = {}) => ({id, tipo, dia: HOJE, ...extra});
const LEGADA = {id: 'e-leg6', tipo: 'entregue', qtde: 6, dia: '2026-10-01', via: 'gestao', por: 'Gestor Teste', porId: '111222', em: '2026-10-01T15:00:00.000Z'};

test('M13: a porta descarta a marca nova por item de todo papel, com um aviso, 200 e `descartado`; o resto da gravação passa', async () => {
  const {AVISO_MARCA_SO_LEITURA} = await regras();
  // Caso ruim (v171): a gestão marcava "Entregar tudo" e a marca gravava, um modelo de entrega ao lado da conferência.
  assert.ok(AVISO_MARCA_SO_LEITURA, 'a porta tem o aviso das marcas só leitura');
  const casos = [
    [GESTOR, [ev('m-g1', 'entregue', {qtde: 10}), ev('m-g2', 'problema', {motivo: 'Peça fictícia quebrada'})]],
    [ADMIN, [ev('m-a1', 'cancelado', {motivo: 'Cancelamento fictício do saldo'})]],
    [OPER, [ev('m-o1', 'entregue', {qtde: 4})]],
    [MONTAGEM, [ev('m-m1', 'entregue', {qtde: 3})]],
  ];
  for (const [quem, marcas] of casos) {
    const e = await edge('pcp-sync', banco());
    const os = structuredClone(gravada(e));
    os.itens[0].entregas = marcas;
    os.obsTecnicas = 'gravação fictícia de ' + quem.sub;
    const r = await e.call({action: 'upsert', os}, quem);
    assert.equal(r.status, 200, quem.sub + ': nunca 422');
    assert.deepEqual(r.descartado, ['entregas'], quem.sub);
    assert.deepEqual(r.entregasRecusadas.map(x => x.id), marcas.map(m => m.id), quem.sub);
    assert.ok(r.entregasRecusadas.every(x => /só leitura/.test(x.motivo)), quem.sub);
    assert.equal(r.avisos.filter(a => a === AVISO_MARCA_SO_LEITURA).length, 1, quem.sub + ': um aviso por gravação');
    assert.deepEqual(marcasGravadas(e), [], quem.sub + ': nenhuma marca gravada');
    assert.equal(gravada(e).obsTecnicas, 'gravação fictícia de ' + quem.sub, quem.sub + ': o resto da gravação passou');
  }
  // O celular (crachá sem senha): o Instalado declarava o saldo. Agora fica o Instalado, o Verificado, as fotos e a finalização.
  const e = await edge('pcp-sync', banco());
  const cel = structuredClone((await e.call({action: 'list', escopo: 'abertas'}, ANA)).os.find(o => o.id === '1'));
  Object.assign(cel, PROVA, {instalacaoOK: true, finalizadaEm: new Date().toISOString(), finalizadoPor: 'Ana'});
  cel.itens[0].statusInst = 'ok'; cel.itens[0].pronto = true; cel.itens[0].entregas = [ev('m-t1', 'entregue', {qtde: 10})];
  cel.itens[1].statusInst = 'ok'; cel.itens[1].entregas = [ev('m-t2', 'entregue', {qtde: 1})];
  const r = await e.call({action: 'upsert', os: cel}, ANA);
  assert.equal(r.status, 200);
  assert.deepEqual(r.entregasRecusadas.map(x => x.id).sort(), ['m-t1', 'm-t2']);
  assert.equal(r.avisos.filter(a => a === AVISO_MARCA_SO_LEITURA).length, 1);
  const g = gravada(e);
  assert.deepEqual(marcasGravadas(e), []);
  assert.deepEqual(g.itens.map(i => i.statusInst), ['ok', 'ok'], 'o Instalado gravou');
  assert.equal(g.itens[0].pronto, true, 'o Verificado gravou');
  assert.ok(g.finalizadaEm, 'a finalização gravou');
  assert.deepEqual(g.fotosRetornoIds, ['r1'], 'as fotos gravaram');
});

test('M13: a marca já gravada continua lida: saldo, situação, o item com marca não sai da lista, e ninguém a desfaz pela porta', async () => {
  const comLegada = base(); comLegada.registro.itens[0].entregas = [structuredClone(LEGADA)];
  const e = await edge('pcp-sync', banco([comLegada]));
  // Caso ruim (v171): a gestão desfazia a marca antiga pela porta. Agora o Desfazer é descartado com aviso.
  const d = structuredClone(gravada(e));
  d.itens[0].entregas = [...d.itens[0].entregas, ev('m-d1', 'desfeito', {alvo: 'e-leg6', motivo: 'Desfazer fictício da marca antiga'})];
  const rd = await e.call({action: 'upsert', os: d}, GESTOR);
  assert.equal(rd.status, 200);
  assert.deepEqual(rd.entregasRecusadas.map(x => x.id), ['m-d1']);
  // A gestão grava a O.S. sem o item marcado: o item volta, a marca fica.
  const os = structuredClone(gravada(e));
  os.itens = [os.itens[1]];
  const r = await e.call({action: 'upsert', os}, GESTOR);
  assert.equal(r.status, 200);
  const g = gravada(e);
  assert.deepEqual(g.itens.map(i => i.uid), ['8101:1:1', '8101:2:1'], 'o item com marca volta ao lugar dele');
  assert.deepEqual(marcasGravadas(e).map(m => m.id), ['e-leg6'], 'a marca antiga fica; o desfazer novo não entra');
  assert.ok(r.avisos.some(a => /já tem marca de entrega/.test(a)));
  const s = D.situacaoItem(g.itens[0], g);
  assert.deepEqual([s.situacao, s.entregue, s.saldo], ['parcial', 6, 4], 'o motor lê a marca antiga');
  // O celular também recebe a marca antiga para ler (sem o ID de quem marcou).
  const cel = (await e.call({action: 'list', escopo: 'abertas'}, ANA)).os.find(o => o.id === '1');
  assert.deepEqual(cel.itens[0].entregas.map(m => [m.id, m.qtde, m.porId]), [['e-leg6', 6, undefined]]);
});

/* O celular da v171 sem sinal: o Instalado declarou a entrega e a gravação ficou na fila. Com sinal, o
   servidor desta onda responde 200 com o aviso; o store da v171 tira a marca da cópia e da fila. */
function celular(arquivos, os) {
  const nodes = new Map(), toasts = [], salvas = [];
  const node = sel => { if (!nodes.has(sel)) nodes.set(sel, {innerHTML: '', textContent: '', value: '', querySelector: node, querySelectorAll: () => [], setAttribute() {}, classList: {toggle() {}, add() {}, remove() {}}, focus() {}}); return nodes.get(sel); };
  const ctx = vm.createContext({console, Date, crypto: webcrypto, document: {querySelector: node, querySelectorAll: () => [], addEventListener() {}}, window: {},
    localStorage: {getItem: () => null, setItem() {}},
    STORE: {getCFG: () => ({}), getAllOS: () => [], getOS: () => null, getQueue: () => [], pullPhoto: async () => null, saveOS: o => salvas.push(JSON.parse(JSON.stringify(o))), carimbarMomento() {}},
    setTimeout() {}, mostrarCelebracao() {}, confirm: () => true});
  for (const [nome, texto] of arquivos) vm.runInContext(texto, ctx, {filename: nome});
  vm.runInContext('toast=(m,t)=>__toasts.push([t,m]); fraseAleatoria=()=>""; EQ.instalador="Ana";', Object.assign(ctx, {__toasts: toasts}));
  ctx.__os = os;
  vm.runInContext('_draft=__os; EQ.modalId=__os.id; renderModal()', ctx);
  return {html: () => node('#modal-os').innerHTML, toasts, salvas, run: c => vm.runInContext(c, ctx), draft: () => JSON.parse(vm.runInContext('JSON.stringify(_draft)', ctx))};
}
function loja(textoStore, lista, responder) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const db = {transaction() { const tx = {objectStore: () => ({get() { const req = {}; queueMicrotask(() => req.onsuccess?.({target: {result: null}})); return req; }, put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.get(k) || null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const req = {}; queueMicrotask(() => req.onsuccess({target: {result: db}})); return req; }},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; }});
  vm.runInContext(textoStore, ctx);
  vm.runInContext(ler('operacao.js'), ctx);
  return vm.runInContext('STORE', ctx);
}

test('M13: o celular da v171 que marcou sem sinal recebe 200 com aviso, a marca sai da cópia e da fila, e o Instalado grava', async () => {
  const e = await edge('pcp-sync', banco());
  const lida = structuredClone((await e.call({action: 'list', escopo: 'abertas'}, ANA)).os.find(o => o.id === '1'));
  // O celular da v171 (equipe.js e motor dela): o Instalado declara o saldo do item (o caso ruim).
  const velho = celular([['operacao.js', doGit('operacao.js')], ['entrega-item.js', doGit('entrega-item.js')], ['equipe.js', doGit('equipe.js')]], structuredClone(lida));
  velho.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const salva = velho.salvas.at(-1);
  assert.equal(salva.itens[0].entregas.length, 1, 'a v171 declarava a entrega no Instalado');
  const idMarca = salva.itens[0].entregas[0].id;
  // O store da v171 manda a fila para o servidor desta onda.
  const s = loja(doGit('store.js'), [lida], q => e.call(q, ANA));
  let avisou = null;
  s.on('entregas-descartadas', d => { avisou = d; });
  await s.pronto();
  salva.atualizadoEm = new Date().toISOString();
  s.saveOS(salva);
  for (let i = 0; i < 100 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); }
  assert.equal(s.getQueue().length, 0, 'a fila esvaziou: nada preso');
  assert.deepEqual(avisou && avisou.recusadas.map(x => x.id), [idMarca]);
  assert.ok(!(s.getOS('1').itens[0].entregas || []).some(m => m.id === idMarca), 'a cópia do celular ficou com o gravado');
  assert.match(s.avisosEntregas()[0].marcas[0].motivo, /só leitura/);
  assert.deepEqual(marcasGravadas(e), []);
  assert.equal(gravada(e).itens[0].statusInst, 'ok', 'o Instalado gravou');
});

test('M13: o celular desta onda não declara: o Instalado marca o item sem marca de entrega, sem "Entregar parte", e o Finalizar não declara o saldo', async () => {
  const os = {id: '1', numero: '8101', tipo: 'externo', equipe: ['100001'], liberadoPCP: true, confirmacao: 'Confirmado', rev: 3,
    instalacao: {data: HOJE, periodo: 'Manhã'}, ...PROVA, instalacaoOK: true,
    itens: [{uid: '8101:1:1', item: '1', descricao: 'Placa ACM fictícia', qtde: '10'}, {uid: '8101:2:1', item: '2', descricao: 'Adesivo fictício', qtde: '1', entregas: [{...LEGADA, id: 'e-leg1', qtde: 1, porId: undefined}]}]};
  // Caso ruim (v171): o cartão oferecia "Entregar parte" e o texto dizia que o Instalado declara a entrega.
  const velho = celular([['operacao.js', doGit('operacao.js')], ['entrega-item.js', doGit('entrega-item.js')], ['equipe.js', doGit('equipe.js')]], structuredClone(os));
  assert.match(velho.html(), /Entregar parte/);
  assert.match(velho.html(), /declara a entrega do item/);
  const c = celular([['operacao.js', ler('operacao.js')], ['entrega-item.js', ler('entrega-item.js')], ['equipe.js', ler('equipe.js')]], structuredClone(os));
  assert.doesNotMatch(c.html(), /Entregar parte|declara a entrega do item/);
  assert.match(c.html(), /Entregue \(declarado pela equipe\)|Entregue \(marcado pelo PCP\)/, 'a marca antiga continua lida no cartão');
  c.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const d = c.draft();
  assert.equal(d.itens[0].statusInst, 'ok');
  assert.equal(d.itens[0].pronto, true);
  assert.equal(d.itens[0].entregas, undefined, 'nenhuma marca de entrega');
  assert.ok(!c.toasts.some(([t]) => t === 'error'), JSON.stringify(c.toasts));
  assert.equal(c.run('saldoAoFinalizar(_draft)'), null, 'o Finalizar não declara o saldo');
  assert.match(c.run(`declararEntrega(_draft.itens[0], 2).erro`), /conferida pelo PCP/);
});

/* A ficha da gestão (app.js) sem store: as ações do item. */
function fichaGestao(arquivos, papel) {
  const ctx = vm.createContext({console, Date, document: {querySelector: () => ({innerHTML: '', classList: {toggle() {}, add() {}, remove() {}}, setAttribute() {}}), querySelectorAll: () => [], addEventListener() {}},
    window: {}, localStorage: {getItem: () => null}, STORE: {getAllOS: () => [], getCFG: () => ({}), getOS: () => null}, setTimeout() {}});
  for (const [nome, texto] of arquivos) vm.runInContext(texto, ctx, {filename: nome});
  vm.runInContext(`STATE.user = {nome:'Fulano Teste', papel:${JSON.stringify(papel)}};`, ctx);
  return c => vm.runInContext(c, ctx);
}

test('M13: a ficha não oferece Entregar tudo, parte, Problema, Cancelar item nem Desfazer, e a marca antiga continua no selo', () => {
  const os = {id: '1', numero: '8101', tipo: 'externo', itens: [{uid: '8101:1:1', item: '1', descricao: 'Placa ACM fictícia', qtde: '10', entregas: [LEGADA]}]};
  const conta = (arquivos, papel) => { const run = fichaGestao(arquivos, papel); run(`__os = ${JSON.stringify(os)}`); return run; };
  for (const papel of ['pcp', 'admin', 'operacao']) {
    // Caso ruim (v171): a gestão tinha Entregar tudo, parte, Problema, Cancelar item e Desfazer.
    const v171 = conta([['operacao.js', doGit('operacao.js')], ['entrega-item.js', doGit('entrega-item.js')], ['app.js', doGit('app.js')]], papel);
    assert.ok(v171('acoesEntregaDoItem(__os.itens[0], __os)').includes('tudo'), papel + ': a v171 oferecia');
    const run = conta([['operacao.js', ler('operacao.js')], ['entrega-item.js', ler('entrega-item.js')], ['app.js', ler('app.js')]], papel);
    assert.deepEqual(Array.from(run('acoesEntregaDoItem(__os.itens[0], __os)')), [], papel);
    const html = run('linhaEntregaHTML(__os.itens[0], 0, __os, false, "", 6)');
    assert.doesNotMatch(html, /data-ent-acao/, papel);
    assert.match(html, /parcial 6 de 10/, papel + ': o selo lê a marca antiga');
    assert.equal(run('podeMarcarEntrega("entregue")'), false, papel);
  }
  const run = conta([['operacao.js', ler('operacao.js')], ['entrega-item.js', ler('entrega-item.js')], ['app.js', ler('app.js')]], 'pcp');
  assert.match(run(`_modalDraft = __os; executarEntregaItem('tudo', '8101:1:1', 0)`), /Conferir itens e equipe/);
});

test('M13: o Fechar o dia não marca a aberta (sem Todos os itens entregues, parte nem Conferir o declarado) e manda à conferência', async () => {
  const b = await B.montar({os: [B.aberta('o1')]});
  const abertas = [];
  b.ctx.conferirItensEntrega = id => { abertas.push(id); return Promise.resolve(); };
  const telas = [];
  b.ctx.document.getElementById = id => id === 'panel-entregas' ? {set innerHTML(v) { telas.push(String(v)); }, get innerHTML() { return telas.at(-1) || ''; },
    querySelector: () => ({classList: {add() {}, remove() {}}, focus() {}}), querySelectorAll: () => [], contains: () => false} : null;
  await b.run(`LOTE.abrir({modo:'dia', dia:'${B.HOJE}'})`);
  b.run('LOTE.render()');
  const html = telas.at(-1);
  // Caso ruim (v171): a aberta oferecia "✓ Todos os itens entregues" e "Marcar a parte".
  assert.doesNotMatch(html, /Todos os itens entregues|Marcar a parte|Conferir o declarado/);
  assert.match(html, /data-lote-acao="conferencia" data-os="o1"[^>]*>Conferir itens e equipe</);
  assert.match(await b.acao({acao: 'entrega-todos', os: 'o1'}), /Conferir itens e equipe/);
  assert.match(await b.acao({acao: 'parte', os: 'o1', uid: 'o1:1:1', valor: '2'}), /Conferir itens e equipe/);
  // A linha não trava pela entrega dos itens: grava o resto (equipe, volta, retrabalho) e não marca nada.
  assert.equal(await b.acao({acao: 'retrabalho-nao', os: 'o1'}), '');
  assert.equal(await b.acao({acao: 'confirmar', os: 'o1'}), '');
  const rel = await B.salvar(b);
  assert.equal(B.estadoDe(rel, 'o1'), 'gravada', JSON.stringify(B.itemDe(rel, 'o1')));
  const o1 = B.noServidor(b.e, 'o1');
  assert.deepEqual(o1.itens.flatMap(i => i.entregas || []), []);
  assert.equal(o1.finalizadaEm, undefined);
});

test('M13: a lista "ERP diz entregue, PCP tem saldo" não oferece "Entregar o saldo", e a função recusa sem gravar', () => {
  const casa = ler('casa.js');
  assert.match(casa, /resumo\.conferencia \|\| !marcasNovasCasa\(\) \? `<button[^`]*data-conferir-saldo/);
  const ctx = vm.createContext({console, Date, STATE: {user: {papel: 'pcp', nome: 'Gestor Teste'}}, STORE: {getOS: () => ({id: '1', itens: []})}, document: {}, window: {}});
  for (const f of ['operacao.js', 'entrega-item.js', 'casa.js']) vm.runInContext(ler(f), ctx, {filename: f});
  assert.match(vm.runInContext(`entregarSaldoERP('1', 'x').erro`, ctx), /Conferir itens e equipe/);
});
