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
