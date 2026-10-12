/* ONDA ACABAMENTO, ITEM 7 (M17 da auditoria de 11/10/2026): "Por tipo de
   serviço" e o filtro de tipo viraram 100% "Sem categoria" na v164 (0
   categorias para centenas de descrições do ERP), e escolher uma categoria no
   filtro dizia "Nenhuma entrega no período segundo o ERP".
   - sem categoria confirmada, o tipo é a descrição do ERP (como na v145);
   - o filtro oferece as categorias e as descrições sem categoria do período,
     e o filtro vazio diz que é o filtro;
   - a gestão classifica em lote pela busca, pela tela, conferindo a lista e
     com motivo; a configuração guarda o motivo e a assinatura do servidor, e
     nenhuma O.S. é regravada (nada de UPDATE automático).
   Cada teste começa pelo caso ruim. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const R = require('../operacao-revisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CFG = {categoriasServico: [{descricao: 'Fachada ACM fictícia', categoria: 'Fachadas'}]};

test('M17: sem categoria, o tipo é a descrição do ERP; com categoria, a categoria; sem descrição, diz que falta', () => {
  // Caso ruim (v171): só existia R.categoria, e tudo sem categoria virava "Sem categoria".
  assert.equal(typeof R.tipo, 'function');
  assert.equal(R.tipo({servico: ' Adesivo vitrine fictício '}, CFG), 'Adesivo vitrine fictício');
  assert.equal(R.tipo({servico: 'Fachada ACM fictícia'}, CFG), 'Fachadas');
  assert.equal(R.tipo({servico: ''}, CFG), 'Sem descrição no ERP');
  assert.equal(R.categoria({servico: 'Adesivo vitrine fictício'}, CFG), 'Sem categoria', 'a categoria continua a mesma regra');
  assert.deepEqual(R.tiposDoFiltro([{servico: 'Placa fictícia'}, {servico: 'Fachada ACM fictícia'}, {servico: 'Adesivo fictício'}, null], CFG),
    [...R.CATEGORIAS, 'Adesivo fictício', 'Placa fictícia']);
});

test('M17: "Por tipo de serviço" de Entregas mostra a descrição do ERP quando não há categoria (o do Retrabalho: tests/casa.test.cjs)', () => {
  const ctx = vm.createContext({console, Date, STATE: {user: {papel: 'pcp'}}, STORE: {getCFG: () => CFG, getAllOS: () => [], elenco: () => ({pessoas: []}), valores: () => ({})},
    document: {getElementById: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}, contains: () => false}}},
    localStorage: {getItem: () => null, setItem() {}}, esc: s => String(s ?? ''), emptyState: () => '', bindCardClicks() {}, toast() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    parseLocalDate: str => { const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }});
  for (const f of ['operacao.js', 'operacao-revisao.js', 'casa.js']) vm.runInContext(ler(f), ctx, {filename: f});
  ctx.__lista = [{numero: '1', servico: 'Adesivo vitrine fictício', valor: 100, data: '2026-10-02'}, {numero: '2', servico: 'Fachada ACM fictícia', valor: 300, data: '2026-10-03'}];
  const html = vm.runInContext('relatoriosEntregasHTML(__lista, new Map(), () => ({rotulo: "sem card no PCP"}))', ctx);
  assert.match(html, /Por tipo de serviço/);
  assert.match(html, /Adesivo vitrine fictício/, 'a descrição do ERP aparece');
  assert.match(html, /Fachadas/, 'a categoria confirmada aparece');
  assert.doesNotMatch(html, /Sem categoria/);
  // O filtro vazio por tipo ou técnico diz que é o filtro, não que o ERP não entregou nada.
  assert.match(ler('casa.js'), /focoEntregas !== 'todas' \|\| \(\(tipo \|\| tecnico\) && per\.os\.length\) \? 'Nenhuma O\.S\. neste filtro'/);
});

test('M17: a classificação em lote pega só as descrições sem categoria que contêm a busca (sem acento e sem caixa)', () => {
  const ds = ['ADESIVO vitrine A', 'Adesivo jateado B', 'Fachada ACM fictícia', 'Placa fictícia', 'adesivo vitrine A'];
  const cfg = {categoriasServico: [{descricao: 'Adesivo jateado B', categoria: 'Adesivos'}]};
  assert.deepEqual(R.paraLote(ds, 'adésivo', cfg), ['adesivo vitrine A', 'ADESIVO vitrine A']);
  assert.deepEqual(R.paraLote(ds, 'a', cfg), [], 'busca curta não pega tudo');
});

/* O diálogo da Conferência operacional (operacao-revisao.js) num DOM de mentira: a busca, a prévia e o Confirmar. */
function dialogo(lista, cfg) {
  const els = new Map(), salvas = [];
  const el = sel => { if (!els.has(sel)) els.set(sel, {sel, value: '', innerHTML: '', textContent: ''}); return els.get(sel); };
  const ctx = vm.createContext({console, Date, structuredClone, STATE: {user: {nome: 'Gestor Teste', papel: 'pcp'}},
    STORE: {getCFG: () => cfg, getAllOS: () => lista, getOS: () => null, saveCFG: c => salvas.push(c), trySync: async () => {}, getQueue: () => []},
    perfPodeEditar: () => true, veiculosRH: () => [], esc: s => String(s ?? ''), perfErroTxt: e => String(e),
    perfDialog: () => ({querySelector: el}), FormData: class { constructor(f) { this.v = f.valores; } get(k) { return k in this.v ? this.v[k] : null; } }});
  for (const f of ['operacao.js', 'operacao-revisao.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext('abrirRevisaoOperacional()', ctx);
  const enviar = async valores => { const form = el('form'); form.valores = valores; await form.onsubmit({preventDefault() {}, target: form}); return el('#op-revisao-status').textContent; };
  return {el, salvas, enviar};
}

test('M17: a tela classifica em lote só com a lista conferida e o motivo; sem isso não salva nada', async () => {
  const lista = [{id: 'a', servico: 'Adesivo vitrine A'}, {id: 'b', servico: 'adesivo jateado B'}, {id: 'c', servico: 'Placa fictícia'}];
  const d = dialogo(lista, {categoriasServico: []});
  // A prévia mostra o que vai entrar, antes de confirmar.
  d.el('[name=loteBusca]').value = 'adesivo';
  d.el('[name=loteBusca]').oninput();
  assert.match(d.el('#op-lote-previa').innerHTML, /2 descrições sem categoria:[\s\S]*adesivo jateado B[\s\S]*Adesivo vitrine A/);
  const base = {loteBusca: 'adesivo', loteCategoria: 'Adesivos', loteMotivo: 'Revisão fictícia dos adesivos de outubro', loteConfirma: 'on'};
  assert.match(await d.enviar({...base, loteMotivo: 'curto'}), /motivo da classificação em lote, com 15 letras/);
  assert.match(await d.enviar({...base, loteConfirma: null}), /Confira a lista \(2 descrições\)/);
  assert.match(await d.enviar({...base, loteBusca: 'lona'}), /Nenhuma descrição sem categoria contém esta busca/);
  assert.equal(d.salvas.length, 0, 'nada salvo sem conferir e sem motivo');
  await d.enviar(base);
  assert.equal(d.salvas.length, 1);
  assert.deepEqual(d.salvas[0].categoriasServico.map(x => [x.descricao, x.categoria, x.motivo]),
    [['adesivo jateado B', 'Adesivos', base.loteMotivo], ['Adesivo vitrine A', 'Adesivos', base.loteMotivo]]);
  assert.deepEqual(lista.map(o => o.servico), ['Adesivo vitrine A', 'adesivo jateado B', 'Placa fictícia'], 'a descrição das O.S. não muda');
});

test('M17: o servidor guarda o motivo do lote com a assinatura dele, e não regrava nenhuma O.S.', async () => {
  const ficha = {colecao: 'colaboradores', id: 'gestor-f', apagado: false, registro: {id: 'gestor-f', nome: 'Gestor Teste', apelido: 'gestor', cpf: '11122233344'}};
  const os = {id: 'o1', colecao: 'os', apagado: false, atualizado_em: '2026-10-01T10:00:00Z', registro: {id: 'o1', rev: 1, numero: '7001', servico: 'Adesivo vitrine A'}};
  const e = await edge('pcp-sync', {pcp_registros: [os], registros: [ficha], pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T10:00:00Z'}]});
  const antesOS = JSON.stringify(e.db.pcp_registros.filter(r => r.colecao === 'os'));
  const base = structuredClone(e.db.pcp_config_global[0].config);
  const cfg = {...base, categoriasServico: [{descricao: 'Adesivo vitrine A', categoria: 'Adesivos', motivo: 'Revisão fictícia dos adesivos de outubro', por: 'forjado', em: '2020-01-01'}]};
  const r = await e.call({action: 'setCfg', baseCfg: base, cfg}, {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'});
  assert.equal(r.status, 200, JSON.stringify(r));
  const c = r.cfg.categoriasServico[0];
  // Caso ruim (v171): o motivo não ficava (só descrição, categoria e assinatura).
  assert.equal(c.motivo, 'Revisão fictícia dos adesivos de outubro');
  assert.equal(c.por, 'Gestor Teste');
  assert.notEqual(c.em, '2020-01-01');
  assert.equal(JSON.stringify(e.db.pcp_registros.filter(r => r.colecao === 'os')), antesOS, 'nenhuma O.S. foi regravada');
});
