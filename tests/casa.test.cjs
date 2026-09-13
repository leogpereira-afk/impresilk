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
const NATAN = { id: '111111', nome: 'Natan da Silva', apelido: 'Natan' };
const PAULO = { id: '222222', nome: 'Paulo Souza', apelido: 'Paulo' };
const LUCAS = { id: '333333', nome: 'Lucas Lima', apelido: 'Lucas' };
const FICHAS = { vinculosRH: [NATAN, PAULO, LUCAS] };

test('entrega da casa é O.S. finalizada no PCP, não baixa Mubisys', () => {
  const t = casa([
    fin('1'),
    fin('2', { finalizadaEm: '2026-09-10T12:00:00', finalizadoPor: 'Mubisys · baixa' }),
    fin('3', { tipo: 'interno' }),
    fin('4', { finalizadaEm: '2026-08-30T12:00:00' }),
  ]);
  assert.deepEqual(t.run(`osFinalizadasMes('${mes}').map(o=>o.id)`), ['1', '3']);
});

test('id da ficha são 6 dígitos; nome não casa sozinho', () => {
  const t = casa([], FICHAS);
  assert.equal(t.run("idPessoaCasa('111111')"), '111111');
  assert.equal(t.run("idPessoaCasa('111.111.000-99')"), '111111');
  assert.equal(t.run("idPessoaCasa('1111')"), '');
  assert.equal(t.run("idPessoaCasa('Natan')"), '');
  assert.equal(t.run("chavePessoaCasa('111111')"), '111111');
  assert.equal(t.run("chavePessoaCasa('Natan')"), '111111');
  assert.equal(t.run("chavePessoaCasa('natan')"), '');
  assert.equal(t.run("chavePessoaCasa('Natan da Silva')"), '');
  assert.equal(t.run("rotuloPessoaCasa('111111')"), 'Natan da Silva · ID 111111');
});

test('ponto vai para o ID apontado; várias fichas na mesma O.S. levam ponto', () => {
  const t = casa([
    fin('a', { equipe: ['Natan'] }),
    fin('b', { equipe: ['Paulo', 'Lucas'] }),
    fin('c', { equipe: [] }),
  ], FICHAS);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank.length, 1);
  assert.equal(rank[0].id, '111111');
  assert.equal(rank[0].osCount, 1);
  const um = t.run(`rankingFinalizadas('${mes}', {b:['333333']})`);
  assert.equal(um.length, 2);
  assert.equal(um.find(p => p.id === '333333').osCount, 1);
  const legado = t.run(`rankingFinalizadas('${mes}', {b:'Lucas'})`);
  assert.equal(legado.find(p => p.id === '333333').osCount, 1);
  const dois = t.run(`rankingFinalizadas('${mes}', {b:['222222','333333']})`);
  assert.equal(dois.length, 3);
  assert.equal(dois.find(p => p.id === '222222').osCount, 1);
  assert.equal(dois.find(p => p.id === '333333').osCount, 1);
  assert.equal(dois.reduce((s, p) => s + p.osCount, 0), 3);
  const vazio = t.run(`rankingFinalizadas('${mes}', {a:[], b:['222222']})`);
  assert.equal(vazio.length, 1);
  assert.equal(vazio[0].id, '222222');
});

test('apelido sem ficha não entra; desmarcar todos tira a O.S. da apuração', () => {
  const t = casa([fin('a', { equipe: ['Natan'] })]);
  assert.equal(t.run(`rankingFinalizadas('${mes}', {})`).length, 0);
  const t2 = casa([fin('a', { equipe: ['Natan'] })], FICHAS);
  assert.equal(t2.run(`rankingFinalizadas('${mes}', {a:[]})`).length, 0);
});

test('participantes da O.S. não substituem a ficha; sem ID não há ponto', () => {
  const os = fin('a', {
    equipe: ['Natan'],
    programacaoRH: { participantes: [{ colaboradorId: 'natan-silva', nome: 'Natan da Silva', nomePCP: 'Natan' }] },
  });
  const t = casa([os]);
  assert.equal(t.run(`rankingFinalizadas('${mes}', {})`).length, 0);
  const t2 = casa([os], FICHAS);
  assert.equal(t2.run(`rankingFinalizadas('${mes}', {})`)[0].id, '111111');
});

test('retrabalho marca a pessoa e não inventa valor; extra não entra', () => {
  const t = casa([
    fin('1', { equipe: ['Natan'], retrabalho: true }),
    fin('2', { equipe: ['Natan'] }),
  ], FICHAS);
  const rank = t.run(`rankingFinalizadas('${mes}', {})`);
  assert.equal(rank[0].id, '111111');
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
  assert.match(html, /nav-marca/);
  assert.doesNotMatch(html, /data-tab="pcp"><span[^>]*>📋/);
  assert.doesNotMatch(html, /RH \+ PCP/);
});

test('calendário da casa lê o prazo da O.S., inclusive retirada', () => {
  const t = casa([
    { id: 'e', tipo: 'externo', previsaoEntrega: '2026-09-13', instalacao: {} },
    { id: 'i', tipo: 'interno', instalacao: { data: '2026-09-13' } },
    { id: 'a', tipo: 'externo', instalacao: { data: '2026-09-13', periodo: 'Manhã' }, equipe: ['Natan'] },
  ]);
  assert.equal(t.run('diasCasa(STORE.getAllOS()[0]).join(",")'), '2026-09-13');
  assert.equal(t.run('diasCasa(STORE.getAllOS()[1]).join(",")'), '2026-09-13');
  assert.equal(t.run("osNoMesCasa('2026-09').map(o=>o.id).sort().join(',')"), 'a,e,i');
});
