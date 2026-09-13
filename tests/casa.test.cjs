const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('path');
const root = path.join(__dirname, '..');

function casa(lista, cfg = {}) {
  const ctx = vm.createContext({
    console,
    Date,
    STORE: {
      getAllOS: () => lista,
      getCFG: () => ({ instaladores: ['Natan', 'Paulo', 'Lucas', 'Rafael'], ...cfg }),
      saveCFG(c) { Object.assign(cfg, c); },
      uuid: () => 'id-1',
    },
    STATE: {},
    document: { getElementById: () => null, querySelectorAll: () => [], body: { classList: { add() {}, remove() {}, contains: () => false } } },
    esc: s => String(s ?? ''),
    emptyState: () => '',
    bindCardClicks() {},
    toast() {},
    fmtInstalacao: () => '',
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  return { run: code => vm.runInContext(code, ctx) };
}

const mes = '2026-09';
const fin = (id, patch) => ({
  id, numero: id, tipo: 'externo', finalizadaEm: '2026-09-10T12:00:00', equipe: ['Natan'], ...patch,
});

test('entrega da casa é O.S. finalizada no PCP, não baixa Mubisys', () => {
  const t = casa([
    fin('1'),
    fin('2', { finalizadaEm: '2026-09-10T12:00:00', finalizadoPor: 'Mubisys · baixa' }),
    fin('3', { tipo: 'interno' }),
    fin('4', { finalizadaEm: '2026-08-30T12:00:00' }),
  ]);
  assert.deepEqual(t.run(`osFinalizadasMes('${mes}').map(o=>o.id)`), ['1']);
});

test('ponto vai para quem foi apontado; várias pessoas na mesma O.S. levam ponto', () => {
  const t = casa([
    fin('a', { equipe: ['Natan'] }),
    fin('b', { equipe: ['Paulo', 'Lucas'] }),
    fin('c', { equipe: [] }),
  ]);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank.length, 1);
  assert.equal(rank[0].nome, 'Natan');
  assert.equal(rank[0].osCount, 1);
  const um = t.run(`rankingFinalizadas('${mes}', {b:['Lucas']})`);
  assert.equal(um.length, 2);
  assert.equal(um.find(p => p.nome === 'Lucas').osCount, 1);
  const legado = t.run(`rankingFinalizadas('${mes}', {b:'Lucas'})`);
  assert.equal(legado.find(p => p.nome === 'Lucas').osCount, 1);
  const dois = t.run(`rankingFinalizadas('${mes}', {b:['Paulo','Lucas']})`);
  assert.equal(dois.length, 3);
  assert.equal(dois.find(p => p.nome === 'Paulo').osCount, 1);
  assert.equal(dois.find(p => p.nome === 'Lucas').osCount, 1);
  assert.equal(dois.reduce((s, p) => s + p.osCount, 0), 3);
  const vazio = t.run(`rankingFinalizadas('${mes}', {a:[], b:['Paulo']})`);
  assert.equal(vazio.length, 1);
  assert.equal(vazio[0].nome, 'Paulo');
});

test('retrabalho marca a pessoa e não inventa valor; extra não entra', () => {
  const t = casa([
    fin('1', { equipe: ['Natan'], retrabalho: true }),
    fin('2', { equipe: ['Natan'] }),
  ]);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank[0].osCount, 2);
  assert.equal(rank[0].retrab, 1);
  assert.equal(t.run('propostaCasa(2, 2, 0, 0)'), 0);
  assert.equal(t.run('propostaCasa(1, 2, 1000, 0)'), 500);
  assert.equal(t.run('propostaCasa(1, 2, 1000, 200)'), 200);
});

test('menu e permissões conhecem Entregas, Performance, Agenda, Plantões e Programação', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const aba of ['entregas', 'performance', 'agenda', 'plantoes', 'grade']) {
    assert.match(html, new RegExp(`data-tab="${aba}"`));
    assert.match(html, new RegExp(`data-panel="${aba}"`));
    assert.match(js, new RegExp(`'${aba}'`));
  }
  assert.match(html, /data-tab="programacao"/);
  assert.match(js, /ABAS_DISPONIVEIS = \[[^\]]*'entregas'[^\]]*'grade'/);
  assert.doesNotMatch(html, /RH \+ PCP/);
});
