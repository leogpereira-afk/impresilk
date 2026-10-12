/* ONDA ACABAMENTO, ITEM 6 (item 24 da fila de 11/10/2026; FP-48, B3 da
   revisão da v145): UM NOME SÓ PARA AS FOTOS. A mesma foto tinha três nomes
   ("check-in", "saída" e "antes"; "serviço pronto", "serviço concluído",
   "retorno" e "depois"), e o instalador não sabia o que faltava para
   finalizar. Agora é "foto de antes" (ao chegar, antes de começar) e "foto de
   depois" (serviço pronto) no celular, nas Instruções, no Histórico (diário),
   no PDF da ficha e nos avisos do servidor. As chaves internas da lista de
   faltas (validarFinalizacao) continuam as mesmas: a tela as traduz.
   Cada teste começa pelo caso ruim. Tudo fictício. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
// Os nomes velhos de foto, em texto que a pessoa lê.
const NOME_VELHO = /fotos? (?:de |do )?check[-‑ ]?in|fotos? (?:do servi[çc]o (?:pronto|conclu[íi]do)|de retorno|de sa[íi]da|da sa[íi]da)|Sa[íi]da \(check|Retorno \(servi[çc]o pronto\)/i;
// As duas chaves internas de validarFinalizacao (app.js), que a tela traduz por ROTULO_FALTA_TELA.
const CHAVES = ["'≥1 foto de saída'", "'foto de retorno (serviço pronto)'"];
const trecho = (src, de, ate) => { const i = src.indexOf(de), j = src.indexOf(ate, i + de.length); assert.ok(i >= 0 && j > i, de); return src.slice(i, j); };
// O código sem os comentários (de bloco e de linha), sem as chaves internas.
const codigo = src => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).map(l => CHAVES.reduce((x, c) => x.split(c).join("''"), l.replace(/\s\/\/.*$/, ''))).join('\n');

test('item 24: o celular diz "foto de antes" e "foto de depois" no que falta para finalizar', () => {
  const ctx = vm.createContext({console, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null, setItem() {}},
    STORE: {getCFG: () => ({}), getAllOS: () => [], getOS: () => null, getQueue: () => []}, setTimeout() {}});
  vm.runInContext(ler('operacao.js'), ctx);
  vm.runInContext(ler('equipe.js'), ctx);
  const f = vm.runInContext(`faltasParaFinalizar({id:'1', tipo:'externo', liberadoPCP:true, confirmacao:'Confirmado', itens:[]}).map(x => x.txt)`, ctx);
  // Caso ruim (v171): "foto de check-in" e "foto do serviço pronto", e o bloco da ficha dizia "Fotos de antes" e "Fotos de depois".
  assert.ok(f.includes('foto de antes'), JSON.stringify(f));
  assert.ok(f.includes('foto de depois'), JSON.stringify(f));
});

test('item 24: o Histórico (diário), o PDF da ficha e as Instruções usam os mesmos nomes', () => {
  const app = ler('app.js');
  const rot = trecho(app, 'const AUD_ROTULOS = {', '\n};');
  assert.match(rot, /fotosCheckinIds: 'Fotos de antes'/);
  assert.match(rot, /fotosRetornoIds: 'Fotos de depois'/);
  const pdf = trecho(app, 'async function exportarFichaPDF(os) {', '\n}\n');
  assert.doesNotMatch(codigo(pdf), NOME_VELHO, 'PDF');
  assert.match(pdf, /Fotos de antes/);
  assert.match(pdf, /Fotos de depois/);
  const inst = trecho(app, 'function abrirInstrucoes() {', '\n}\n');
  assert.doesNotMatch(codigo(inst), NOME_VELHO, 'Instruções');
  assert.match(inst, /foto de antes/);
  assert.match(inst, /foto de depois/);
});

test('item 24: o servidor fala do mesmo jeito (a finalização sem foto e o teto de fotos)', async () => {
  const {validarConclusao} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const msg = validarConclusao({finalizadaEm: '2026-10-01T18:00:00Z', tipo: 'externo'}, null, 'montagem');
  assert.match(msg, /foto de depois/);
  assert.doesNotMatch(msg, NOME_VELHO);
  assert.doesNotMatch(codigo(ler('supabase/functions/_shared/pcp-integridade.mjs')), NOME_VELHO);
});

test('item 24 (guarda): nenhum texto do celular, da ficha ou do servidor volta aos nomes velhos', () => {
  for (const f of ['equipe.js', 'equipe.html', 'app.js', 'index.html', 'supabase/functions/pcp-sync/index.ts', 'supabase/functions/_shared/pcp-integridade.mjs', 'supabase/functions/_shared/pcp-status.mjs']) {
    const linhas = codigo(ler(f)).split('\n').filter(l => NOME_VELHO.test(l));
    assert.deepEqual(linhas, [], f);
  }
});
