/* ONDA ACABAMENTO, ITEM 3 (M19 da auditoria de 11/10/2026): a troca de itens
   por quem não é gestão nunca responde 422.
   A montagem com senha e a operação que usavam "Importar itens do PDF >
   Substituir" numa O.S. com itens valorados, ou tiravam um item manual da
   gestão, recebiam 422 ("Item com valor sem identidade correspondente") sem
   `definitivo`: o envio e as edições seguintes da O.S. ficavam presos na fila.
   E o valor de item novo vindo delas sumia calado. Agora o item gravado com
   valor volta ao lugar dele, o valor de item novo não entra, as duas coisas
   com aviso e linha no diário, e a tela não oferece o que o servidor
   devolveria. Os testes do ramo poda-valores-operacao inspiraram os casos (o
   ramo não foi juntado). Cada teste começa pelo caso ruim. Tudo fictício. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const doGit = f => execFileSync('git', ['show', `3affd9a:${f}`], {cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

const FICHAS = [{colecao: 'colaboradores', id: 'olga-f', apagado: false, registro: {id: 'olga-f', nome: 'Olga Balcão', apelido: 'operacao1', cpf: '12312312312'}}];
const ITENS = () => [
  {uid: '8101:1:1', item: '1', descricao: 'Placa ACM fictícia', qtde: '10', valorUnit: '100', subtotal: '1000'},
  {uid: '8101:2:1', item: '2', descricao: 'Adesivo fictício', qtde: '1', valorUnit: '500', subtotal: '500'},
  {uid: 'm-gestao000001', item: '3', descricao: 'Recorte manual fictício', qtde: '2', valorUnit: '50', subtotal: 100, manual: true},
];
const row = (id, registro) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', registro: {id, rev: 1, ...registro}});
const base = (itens = ITENS()) => row('1', {numero: '8101', tipo: 'externo', origemMubisys: true, cliente: 'Cliente Fictício', equipe: ['100001'], valorTotal: 1600, itens});
const banco = (regs = [base()]) => ({pcp_registros: regs, registros: structuredClone(FICHAS), equipe_contas: [{sistema: 'pcp', usuario: 'montagem1'}],
  pcp_config_global: [{id: true, config: {instaladores: ['Ana']}, atualizado_em: '2026-09-19T10:00:00Z'}]});
const OPER = {papel: 'operacao', nome: 'Olga Balcão', sub: 'operacao1'};
const MONTAGEM = {papel: 'montagem', nome: 'Conta Montagem', sub: 'montagem1'};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const daConta = async (e, quem) => structuredClone((await e.call({action: 'list'}, quem)).os.find(o => o.id === '1'));
const PDF = () => [{uid: 'm-pdf000000001', item: '1', descricao: 'Lona do PDF fictícia', qtde: '3', valorUnit: '10', subtotal: 30, manual: true}];

test('M19: o "Substituir" do PDF por quem não é gestão grava 200: os itens com valor voltam, o valor do item novo não entra, com aviso e diário', async () => {
  for (const quem of [OPER, MONTAGEM]) {
    const e = await edge('pcp-sync', banco());
    const minha = await daConta(e, quem);
    minha.itens = PDF();
    const r = await e.call({action: 'upsert', os: minha}, quem);
    // Caso ruim (v171): 422 "Item com valor sem identidade correspondente", sem `definitivo`: preso na fila.
    assert.equal(r.status, 200, quem.sub + ': ' + JSON.stringify(r).slice(0, 200));
    const g = gravada(e);
    assert.deepEqual(g.itens.filter(i => i.subtotal != null).map(i => [i.uid, i.subtotal]), [['8101:1:1', '1000'], ['8101:2:1', '500'], ['m-gestao000001', 100]], quem.sub + ': os itens com valor voltaram, com o valor');
    const novo = g.itens.find(i => i.descricao === 'Lona do PDF fictícia');
    assert.ok(novo && novo.valorUnit === undefined && novo.subtotal === undefined, quem.sub + ': o valor do item novo não entra');
    assert.equal(g.valorTotal, 1600);
    assert.ok(r.avisos.some(a => /têm valor gravado e continuam na O\.S\.: só a gestão do PCP tira ou troca item com valor/.test(a)), JSON.stringify(r.avisos));
    assert.ok(r.avisos.some(a => /O valor do item novo item 1 \(Lona do PDF fictícia\) não foi gravado/.test(a)), JSON.stringify(r.avisos));
    assert.doesNotMatch(JSON.stringify(r.avisos), /R\$|1000|500/, 'aviso sem R$');
    const d = diario(e).find(x => x.acao === 'repor-valores');
    assert.ok(d, quem.sub + ': linha no diário');
    assert.equal(d.depois.repostos.length, 3);
    assert.deepEqual(d.depois.semValor, ['item 1 (Lona do PDF fictícia)']);
    // A edição seguinte da mesma O.S. passa (nada preso).
    const depois = await daConta(e, quem);
    depois.obsTecnicas = 'seguinte';
    assert.equal((await e.call({action: 'upsert', os: depois}, quem)).status, 200);
  }
});

test('M19: tirar o item manual da gestão (com valor) devolve o item com o valor e avisa; dois itens antigos iguais, sem código, não dão 422', async () => {
  const e = await edge('pcp-sync', banco());
  const minha = await daConta(e, OPER);
  minha.itens = minha.itens.filter(i => i.uid !== 'm-gestao000001');
  const r = await e.call({action: 'upsert', os: minha}, OPER);
  assert.equal(r.status, 200);
  assert.deepEqual(gravada(e).itens.map(i => i.uid), ['8101:1:1', '8101:2:1', 'm-gestao000001']);
  assert.equal(gravada(e).itens[2].subtotal, 100);
  assert.ok(r.avisos.some(a => /O item item 3 \(Recorte manual fictício\) tem valor gravado e continua/.test(a)));
  // Dois itens iguais de antes do código (E1): o primeiro casa com o primeiro (antes: "Identidade de item ambígua", 422).
  const iguais = [{item: '1', descricao: 'Placa fictícia', qtde: '1', valorUnit: '10', subtotal: '10'}, {item: '1', descricao: 'Placa fictícia', qtde: '1', valorUnit: '20', subtotal: '20'}];
  const {preservarValoresPCP} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const semValor = iguais.map(({valorUnit, subtotal, ...x}) => x);
  const p = preservarValoresPCP({itens: semValor}, {itens: iguais});
  assert.deepEqual(p.itens.map(i => i.subtotal), ['10', '20']);
});

test('M19: a fila do aparelho (store da v171 e desta onda) esvazia: o Substituir e a edição seguinte da mesma O.S. sobem', async () => {
  for (const texto of [doGit('store.js'), ler('store.js')]) {
    const e = await edge('pcp-sync', banco());
    const minha = await daConta(e, OPER);
    const ls = new Map([['impresilk_inst_os', JSON.stringify([minha])], ['impresilk_inst_fila', '[]']]);
    const db = {transaction() { const tx = {objectStore: () => ({get() { const req = {}; queueMicrotask(() => req.onsuccess?.({target: {result: null}})); return req; }, put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
    const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
      localStorage: {getItem: k => ls.get(k) || null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
      indexedDB: {open() { const req = {}; queueMicrotask(() => req.onsuccess({target: {result: db}})); return req; }},
      setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
      fetch: async (_u, req) => { const r = await e.call(JSON.parse(req.body), OPER); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; }});
    vm.runInContext(texto, ctx);
    vm.runInContext(ler('operacao.js'), ctx);
    const s = vm.runInContext('STORE', ctx);
    await s.pronto();
    const o = s.getOS('1');
    o.itens = PDF(); o.atualizadoEm = new Date().toISOString();
    s.saveOS(o);
    for (let i = 0; i < 40 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); }
    assert.equal(s.getQueue().length, 0, 'nada preso');
    const o2 = s.getOS('1'); o2.obsTecnicas = 'depois do PDF'; o2.atualizadoEm = new Date(Date.now() + 1000).toISOString();
    s.saveOS(o2);
    for (let i = 0; i < 40 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); }
    assert.equal(s.getQueue().length, 0);
    assert.equal(gravada(e).obsTecnicas, 'depois do PDF');
    assert.equal(gravada(e).itens.find(i => i.uid === '8101:1:1').subtotal, '1000');
  }
});

/* A ficha (app.js) num DOM de mentira: o "× remover" e o "Importar itens do PDF". */
function ficha(papel, guardada) {
  const confirmas = [], toasts = [];
  const input = {click() {}};
  const ctx = vm.createContext({console, Date, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => input},
    window: {}, localStorage: {getItem: () => null}, STORE: {getAllOS: () => [guardada], getCFG: () => ({}), getOS: id => (id === guardada.id ? guardada : null)}, setTimeout() {},
    confirm: m => { confirmas.push(m); return true; }});
  for (const f of ['operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(`STATE.user = {nome:'Fulano Teste', papel:${JSON.stringify(papel)}}; toast = (m, t) => __t.push([t, m]); saveDraft = () => {}; reRenderModalKeepOpen = () => {};`, Object.assign(ctx, {__t: toasts}));
  return {run: c => vm.runInContext(c, ctx), input, confirmas, toasts, ctx};
}

test('M19: quem não vê valores não tem "× remover" em item já gravado, e o PDF só adiciona, sem o valor; a gestão continua com tudo', async () => {
  const guardada = {id: '1', numero: '8101', tipo: 'externo', itens: ITENS().map(({valorUnit, subtotal, ...x}) => x)};
  const op = ficha('operacao', guardada);
  op.ctx.__os = {...structuredClone(guardada), itens: [...structuredClone(guardada.itens), {uid: 'm-novo00000001', item: '4', descricao: 'Novo', qtde: '1', manual: true}]};
  const html = op.run('blocoItens(__os, false, 0)');
  // Caso ruim (v171): o item manual da gestão tinha "× remover" para a operação.
  assert.doesNotMatch(html, /data-item-del="2"/, 'o manual já gravado fica');
  assert.match(html, /data-item-del="3"/, 'o que esta ficha criou ainda sai');
  const g = ficha('pcp', {...guardada, itens: ITENS()});
  g.ctx.__os = {...guardada, itens: ITENS()};
  assert.match(g.run('blocoItens(__os, false, 0)'), /data-item-del="2"/, 'a gestão tira');
  // O PDF da operação: só adicionar, sem valor.
  op.run(`lerPDF = async () => ({texto: ''}); parseItensPDF = () => ${JSON.stringify(PDF().map(({uid, ...x}) => x))}; __d = JSON.parse(JSON.stringify(__os)); _modalDraft = __d; importarItensPDF(__d);`);
  op.input.files = [{}];
  await op.input.onchange();
  assert.equal(op.confirmas.length, 1);
  assert.match(op.confirmas[0], /Adicionar os 1 item\(ns\) do PDF no fim da lista\? Os itens que já estão ficam/);
  const d = JSON.parse(op.run('JSON.stringify(__d)'));
  assert.equal(d.itens.length, 5, 'adicionou no fim, sem tirar nenhum');
  assert.equal(d.itens[4].valorUnit, undefined);
  assert.equal(d.itens[4].subtotal, undefined);
});
