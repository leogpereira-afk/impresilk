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
