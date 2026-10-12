/* ONDA OPERAÇÃO, ITEM 4: M14 da auditoria de 11/10/2026. Um caminho só
   entre Lançar e Conferir na mesma baixa do ERP, pela D-016 (o caminho é a
   conferência). A O.S. com conferência por entrega: não vai para "a lançar"
   (antes ia para as duas listas), o Lançar leva à conferência, o Fechar o
   dia grava o resto da linha sem o lançamento, e o servidor não aceita
   lançamento novo nela (fica o gravado, com aviso, nunca 422). Cada caso
   começa pelo caso ruim da v170. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('./helpers/lote-bancada.cjs');
const C = require('../conferencia-entrega.js');
const {edge, erp, osRow, FICHAS, GESTOR, montar, abrirPendencias, G_ERP} = B;

const RAIZ = path.join(__dirname, '..');
const js = x => JSON.parse(JSON.stringify(x));
const longe = q => ({...q, exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)});
function conferida(o, qtdes, dia = '2026-09-28') {
  const cat = C.catalogo(o);
  return {...o, conferenciasEntrega:[{id:'c1', dia, itens:cat.map((it, i) => ({chave:it.chave, identidade:it.identidade, qtde:qtdes[i] || 0})).filter(p => p.qtde > 0),
    por:'Gestor Teste', porId:'111222', em:dia + 'T20:00:00.000Z'}]};
}
function tela(lista, papel = 'pcp') {
  const toasts = [];
  const STORE = {getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[]}), saveOS() {},
    entreguesMes:() => null, elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), valores:() => ({})};
  const c = {STORE, STATE:{user:{papel, nome:'Gestor Teste'}}, console, esc:s => String(s ?? ''), toast:(m, t) => toasts.push([m, t]), nowISO:() => '2026-10-12T15:00:00.000Z',
    emptyState:() => '', bindCardClicks() {}, localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    document:{getElementById:() => null, querySelectorAll:() => [], createElement:() => { throw new Error('não devia abrir o diálogo do Lançar'); }, body:{classList:{add() {}, remove() {}, contains:() => false}}}};
  vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'casa.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), c, {filename:f});
  return {toasts, run:code => vm.runInContext(code, c), c};
}

test('M14: a baixa do ERP com parte conferida é instalação e não vai para "a lançar" (antes: as duas listas)', () => {
  const parcial = conferida(erp('a1'), [4, 0, 0]);
  const semConf = erp('a2');
  const t = tela([js(parcial), js(semConf)]);
  const cls = js(t.run('classificarEntregas(STORE.getAllOS())'));
  assert.deepEqual(cls.aLancar.map(o => o.id), ['a2']);
  assert.deepEqual(cls.instalacoes.map(o => o.id), ['a1']);
});

test('M14: o Lançar numa O.S. com conferência não abre o lançamento e diz para conferir o saldo', () => {
  const t = tela([js(conferida(erp('a1'), [4, 0, 0]))]);
  t.run(`lancarEntregaManual('a1')`);
  assert.equal(t.toasts.length, 1);
  // U3 da revisão da onda operação: o nome do botão que existe, e tom de informação (a conferência abre em seguida).
  assert.match(t.toasts[0][0], /já tem conferência por entrega: o saldo se confere em "Conferir itens e equipe"/);
  assert.equal(t.toasts[0][1], '');
});

test('M14: o servidor não aceita lançamento novo em O.S. com conferência (fica o gravado, com aviso, nunca 422); sem conferência, lança', async () => {
  const comConf = conferida(erp('a1'), [4, 0, 0]);
  const e = await edge('pcp-sync', {pcp_registros:[osRow(comConf), osRow(erp('a2'))], registros:js(FICHAS)});
  const gestor = longe(GESTOR);
  const g = id => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
  let r = await e.call({action:'upsert', os:{...js(g('a1')), entregaLancada:{data:'2026-09-28'}}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(g('a1').entregaLancada, undefined, 'caso ruim: a v170 gravava o lançamento, que a apuração ignorava');
  assert.match(String(r.avisos), /A entrega não foi lançada: esta O\.S\. já tem conferência por entrega/);
  r = await e.call({action:'upsert', os:{...js(g('a2')), entregaLancada:{data:'2026-09-28'}}}, gestor);
  assert.equal(g('a2').entregaLancada.data, '2026-09-28');
});

test('M14: as pendências do Fechar o dia não trazem a baixa com conferência para lançar', async () => {
  const b = await montar({os:[erp('a1'), erp('a2'), conferida(erp('a3'), [4, 0, 0])]});
  await abrirPendencias(b);
  const gs = await b.json('LOTE.gruposDaTela().map(g => [g.chave, g.os.map(o => o.id)])');
  assert.deepEqual(gs, [[G_ERP, ['a1', 'a2']]], JSON.stringify(gs));
  b.fechar();
});
