'use strict';
/* REVISÃO DA ONDA ACABAMENTO B (12/10/2026): os achados das duas revisões
   (dados e uso), menos o dos nomes, que tem a guarda dele em
   tests/onda-acabamento-b-m27.test.cjs. Cada teste começa pelo caso ruim (o
   5124974 falha nele). Dados fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const O = require('../operacao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* A casa num contexto isolado (o mesmo arranjo de tests/casa.test.cjs, reduzido). */
function casa(lista, cfg = {}) {
  const ctx = vm.createContext({
    console,
    STORE: {
      getAllOS: () => lista,
      getCFG: () => ({instaladores: ['Natan', 'Paulo'], ...cfg}),
      saveCFG() {}, uuid: () => 'id-1',
      elenco: () => ({pessoas: [], veiculos: [], ferias: [], ausencias: []}),
      entreguesMes: () => null, pullEntreguesMes() {}, anosEntregues: () => [2026, 2025], valores: () => ({}),
    },
    STATE: {},
    document: {getElementById: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}, contains: () => false}}},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    esc: s => String(s ?? ''), emptyState: () => '', bindCardClicks() {}, toast() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    parseLocalDate: str => { const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; },
    pessoaDoElenco: () => null,
  });
  for (const f of ['operacao-revisao.js', 'operacao.js', 'casa.js', 'relatorios-entregas.js']) vm.runInContext(ler(f), ctx);
  return {run: code => vm.runInContext(code, ctx)};
}
const fin = (id, patch) => ({id, numero: id, tipo: 'externo', finalizadaEm: '2026-09-10T12:00:00', equipe: ['Natan'], ...patch});

/* ═══════════ 2. O parêntese aberto do quadro "Serviços entregues" ═══════════ */

test('revisão acabamento B: a frase da janela do aparelho em "Serviços entregues" não deixa parêntese aberto', () => {
  const html = casa([fin('1')]).run('servicosEntreguesHTML()');
  const p = html.match(/<p class="text-muted"[^>]*>([^<]*)<\/p>/)[1];
  // Caso ruim (5124974): "neste aparelho (as dos últimos 60 dias. Não entram..." e o parêntese nunca fechava.
  assert.equal((p.match(/\(/g) || []).length, (p.match(/\)/g) || []).length, 'parênteses desequilibrados: ' + p);
  assert.match(p, /guardadas neste aparelho, que são as dos últimos \d+ dias\. Não entram as retiradas internas/);
});

/* ═══════════ 3. Histórico do bônus manual: só quem levou o ponto ═══════════ */

const VINC = ['111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999']
  .map((id, i) => ({id, nome: 'Pessoa Fictícia ' + (i + 1), apelido: i === 0 ? 'Natan' : i === 1 ? 'Paulo' : 'Apelido' + i}));
function bonus(pontos) {
  const t = casa([
    fin('1'),                                                  // Natan sozinho: o ponto é dele
    fin('2', {equipe: ['Natan', 'Paulo']}),                    // dois, sem apontar: ninguém levou
    fin('3', {equipe: ['Natan', 'Paulo', 'Sem Ficha Fictício']}), // apontado só para o Natan
  ], {vinculosRH: VINC, bonusPCP: {mes: '2026-09', orcamento: 500, teto: 0, pontos, itens: []}});
  const perf = ler('performance.js');
  t.run(perf.slice(perf.indexOf('function perfPeriodoCompactoHTML('), perf.indexOf('function perfCompartilharRanking(')));
  return t.run(`(() => {
    wireFiltroPeriodo = () => ''; globalThis.perfCompartilharRanking = () => {}; globalThis.abrirTVCasa = () => {};
    const el = {innerHTML: '', querySelectorAll: () => [], querySelector: () => ({value: ''}), contains: () => true};
    document.getElementById = id => (id === 'panel-performance' ? el : null);
    document.activeElement = null;
    STATE._perfAba = 'relatorio'; STATE._bonusMes = '2026-09';
    renderPerformanceCasa();
    return el.innerHTML;
  })()`);
}

test('revisão acabamento B: o histórico do bônus manual mostra só as fichas que levaram o ponto, sem "+ outra ficha" nem "disponível"', () => {
  const html = bonus({3: ['111111']});
  const lista = html.slice(html.indexOf('<ul class="casa-apontar-lista">'), html.indexOf('</ul>', html.indexOf('<ul class="casa-apontar-lista">')));
  // Caso ruim (5124974): as fichas de quem não levou (desmarcadas), a etiqueta "sem ficha" e o "+ outra ficha" do tempo do apontar.
  assert.doesNotMatch(lista, /outra ficha/);
  assert.doesNotMatch(lista, /class="sem-ficha"/);
  assert.doesNotMatch(lista, /data-ponto="[^"]*" value="[^"]*"\s+disabled/, 'nenhuma ficha desmarcada');
  assert.doesNotMatch(lista, /value="222222"/, 'quem não levou o ponto não aparece');
  // Só quem levou, marcado e só leitura: O.S. 1 (Natan sozinho) e O.S. 3 (apontada para o Natan).
  assert.equal((lista.match(/data-ponto="1" value="111111" checked disabled/g) || []).length, 1);
  assert.equal((lista.match(/data-ponto="3" value="111111" checked disabled/g) || []).length, 1);
  assert.equal((lista.match(/<li class="casa-apontar-os">/g) || []).length, 2, 'a O.S. em que ninguém levou o ponto fica só na contagem');
  assert.match(html, /1 O\.S\. sem ficha apontada neste histórico/);
  // A barra não fala mais em valor disponível; o título diz que é histórico.
  const quadro = html.slice(html.indexOf('data-quadro="perf-bonus"'));
  assert.doesNotMatch(quadro, /disponível/);
  assert.match(html, /<h3>Quem levou o ponto no histórico<\/h3>/);
  assert.match(html, /Histórico, só leitura/);
  assert.match(html, /Orçamento registrado: <b>/);
});

test('revisão acabamento B: no histórico sem nenhum ponto, a lista diz que não há O.S. com ponto (sem fichas para marcar)', () => {
  const html = bonus({1: [], 3: []});
  assert.doesNotMatch(html, /data-ponto=/);
  assert.match(html, /Nenhuma O\.S\. com ponto neste filtro\./);
});

/* ═══════════ 4. A pendência do item sem valor à vista ═══════════ */

const OS_PEND = () => ({id: 'v1', numero: '90801', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000,
  itens: [{uid: 'a', item: '1', descricao: 'Painel fictício A', qtde: '1', subtotal: '600'}, {uid: 'b', item: '2', descricao: 'Placa fictícia B', qtde: '1', subtotal: '400'},
    {uid: 'm-v100000003', item: '3', descricao: 'Item fictício novo', qtde: '1', manual: true}],
  conferenciasEntrega: [{id: 'e1', dia: '2026-10-05', itens: [], por: 'Gestor Fictício', em: '2026-10-05T20:00:00.000Z'}]});
function controle(papel = 'pcp', extra = {}) {
  const ouvintes = [];
  const chamadas = {openModal: [], ir: [], rolou: [], focou: [], fechou: 0};
  const campo = {scrollIntoView: o => chamadas.rolou.push(o), focus: o => chamadas.focou.push(o)};
  const modal = {querySelector: q => (q === '[data-valor-item="2"]' ? campo : null)};
  const ctx = vm.createContext({console, OPERACAO: O, STATE: {user: {papel}}, toast() {},
    STORE: {getQueue: () => [], getOS: id => (id === 'v1' ? OS_PEND() : null), getAllOS: () => [OS_PEND()]},
    esc: s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch])),
    resumoEntregaFichaTexto: () => '', setTimeout: fn => fn(),
    openModal: (os, bloco) => chamadas.openModal.push([os.id, bloco]),
    irParaEtapaFicha: (k, opt) => chamadas.ir.push([k, opt && opt.bloco]),
    document: {addEventListener: (tipo, fn) => ouvintes.push(fn), getElementById: id => (id === 'modal-os' ? modal : null)},
    ...extra});
  vm.runInContext(ler('controle-entrega-ui.js'), ctx);
  const clicar = (controleTipo, osId, naDialog = true) => {
    const dialog = {close: () => { chamadas.fechou++; }};
    const b = {dataset: {controle: controleTipo, controleOs: osId}, closest: q => (q === 'dialog' ? (naDialog ? dialog : null) : null)};
    for (const fn of ouvintes) fn({target: {closest: q => (q === '[data-controle]' ? b : null)}, preventDefault() {}});
  };
  return {ctx, chamadas, clicar, run: code => vm.runInContext(code, ctx)};
}

test('revisão acabamento B: o grupo "Conferência e acompanhamento" abre sozinho e diz no título que há pendência de valor', () => {
  const c = controle();
  c.ctx.__os = OS_PEND();
  const html = c.run('controleEntregaHTML(__os)');
  // Caso ruim (5124974): o grupo vinha fechado, com o título de sempre, e a pendência ficava escondida dentro dele.
  assert.match(html, /^<details class="cfg-grupo lock-allow" open data-pendencia-valor><summary>Conferência e acompanhamento · <strong class="conf-pend-titulo">pendência de valor<\/strong><\/summary>/);
  assert.match(html, /Pendência de valor:<\/strong> o item Item fictício novo está sem valor/);
  // Sem pendência: fechado, título de sempre.
  c.ctx.__os = {...OS_PEND(), itens: OS_PEND().itens.map(it => ({...it, subtotal: it.subtotal || '100'}))};
  assert.match(c.run('controleEntregaHTML(__os)'), /^<details class="cfg-grupo lock-allow"><summary>Conferência e acompanhamento<\/summary>/);
  // Quem não é gestão não vê a pendência nem o grupo aberto por ela.
  const op = controle('operacao');
  op.ctx.__os = OS_PEND();
  assert.match(op.run('controleEntregaHTML(__os)'), /^<details class="cfg-grupo lock-allow"><summary>Conferência e acompanhamento<\/summary>/);
});

test('revisão acabamento B: o topo da ficha anuncia a pendência de valor com o botão para o campo do item', () => {
  const c = controle();
  c.ctx.__os = OS_PEND();
  // Caso ruim (5124974): a ficha não tinha nada no topo; a função nem existia.
  assert.equal(c.run('typeof pendenciaValorItemTopoHTML'), 'function');
  const topo = c.run('pendenciaValorItemTopoHTML(__os)');
  assert.match(topo, /class="aloc-aviso conf-item-sem-valor conf-item-sem-valor-topo lock-allow"/);
  assert.match(topo, /Pendência de valor:<\/strong> 1 item está sem valor/);
  assert.match(topo, /<button type="button" class="btn-ghost btn-sm" data-controle="valorItem" data-controle-os="v1">Pôr o valor do item<\/button>/);
  assert.doesNotMatch(topo, /R\$/);
  c.ctx.__os = {...OS_PEND(), finalizadaEm: '2026-10-06T12:00:00'};
  assert.match(c.run('pendenciaValorItemTopoHTML(__os)'), /A O\.S\. está finalizada: reabra para pôr o valor\./);
  assert.equal(controle('operacao').run(`pendenciaValorItemTopoHTML(${JSON.stringify(OS_PEND())})`), '');
  // A ficha pinta o aviso logo no topo, junto do aviso da cancelada.
  assert.match(ler('app.js'), /\$\{canceladaAvisoFichaHTML\(os\)\}\n {4}\$\{typeof pendenciaValorItemTopoHTML === 'function' \? pendenciaValorItemTopoHTML\(os\) : ''\}/);
});

test('revisão acabamento B: a Fila diária tem o botão que abre a ficha no item sem valor, e o botão leva ao campo', () => {
  const c = controle();
  c.ctx.__os = OS_PEND();
  const html = c.run('filaDiariaHTML(filaDiaria([__os], "2026-10-12"))');
  // Caso ruim (5124974): a fila só dizia "Item sem valor" e escondia a pendência no grupo fechado; nenhum botão levava à ficha.
  assert.match(html, /<button type="button" class="btn-primary btn-sm" data-controle="valorItem" data-controle-os="v1">Abrir a ficha no item sem valor<\/button>/);
  assert.match(html, /<details class="cfg-grupo lock-allow" open data-pendencia-valor>/);
  // O toque fecha a fila e abre a ficha nos itens, com o campo do valor do item 3 (posição 2) à vista.
  c.clicar('valorItem', 'v1');
  assert.equal(c.chamadas.fechou, 1);
  assert.deepEqual(c.chamadas.openModal, [['v1', 'itens']]);
  assert.equal(c.chamadas.rolou.length, 1);
  assert.equal(c.chamadas.focou.length, 1);
  // Com a ficha dessa O.S. já aberta (o botão do topo), não reabre (o que foi digitado fica): vai à etapa dos itens.
  const d = controle('pcp');
  d.run('var _modalDraft = ' + JSON.stringify(OS_PEND()) + '; STATE.modalOSId = "v1";');
  d.clicar('valorItem', 'v1', false);
  assert.deepEqual(d.chamadas.openModal, []);
  assert.deepEqual(d.chamadas.ir, [['dados', 'itens']]);
  assert.equal(d.chamadas.rolou.length, 1);
});
