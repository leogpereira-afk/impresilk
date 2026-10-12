'use strict';
/* ONDA ACABAMENTO B, ITEM 3 (M32 da auditoria de 11/10/2026): o tablet da
   montagem ficava lento porque, para quem não é gestão, cada getAllOS e cada
   getOS copiava e podava a lista inteira (cerca de 700 O.S.), e a tela chama
   isso dentro de laços. Agora a poda é feita uma vez por versão da lista e
   por papel. O teste de tempo é relativo (melhor de N, contra o tempo de UMA
   poda da mesma lista, com folga): não depende da máquina. Começa pelo caso
   ruim (a v172 faz uma poda por leitura). Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');

// Uma O.S. do tamanho das de verdade (itens, fotos, divisão, diários), toda fictícia.
function osFicticia(i) {
  const itens = Array.from({length: 6}, (_, k) => ({uid: `9${i}:${k}`, item: String(k + 1), descricao: 'Item fictício ' + k + ' com descrição longa de comunicação visual', medidas: '2,00x1,00', qtde: '3', valorUnit: '123.45', subtotal: '370.35', entregas: [{id: 'e' + k, qtde: 1, em: '2026-10-01T12:00:00Z', por: 'Pessoa Fictícia', porId: '900001'}]}));
  return {id: 'os' + i, numero: String(90000 + i), rev: 3, tipo: 'externo', cliente: 'Cliente Fictício ' + i, servico: 'Fachada fictícia', valorTotal: 2222.22, valorOS: 2222.22,
    equipe: ['900001', '900002'], itens, fotos: Array.from({length: 8}, (_, k) => 'foto_os' + i + '_' + k), instalacao: {data: '2026-10-05', periodo: 'Manhã', duracaoDias: 1},
    alocacao: {grupos: [{equipeId: 'eq-ficticia', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 6000}, {pessoaId: '900002', papel: 'ajudante', cota: 4000}]}], manual: false, em: '2026-10-01T10:00:00Z'},
    alocacaoLog: Array.from({length: 5}, (_, k) => ({em: '2026-10-0' + (k + 1) + 'T10:00:00Z', por: 'Gestor Fictício', porConta: 'gestor', acao: 'confirmou'})),
    agendaLog: Array.from({length: 4}, (_, k) => ({de: '2026-10-0' + (k + 1), para: '2026-10-0' + (k + 2), por: 'Gestor Fictício'})),
    obsTecnicas: 'Observação fictícia '.repeat(10), atualizadoEm: '2026-10-05T12:00:00Z', atualizadoPor: 'Gestor Fictício'};
}
function aparelho(lista, papel) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]'], ['impresilk_inst_user', JSON.stringify({nome: 'Pessoa Fictícia', papel})]]);
  const db = {transaction() { const tx = {objectStore: () => ({get() { const r = {}; queueMicrotask(() => r.onsuccess?.({target: {result: null}})); return r; }, put() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: false}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.get(k) || null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const r = {}; queueMicrotask(() => r.onsuccess({target: {result: db}})); return r; }},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste', fetch: async () => { throw new Error('sem rede'); }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'privacidade-valores.js'), 'utf8').replace(/^const PRIVACIDADE_VALORES\s*=/m, 'var PRIVACIDADE_VALORES ='), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8'), ctx);
  return {s: vm.runInContext('STORE', ctx), P: vm.runInContext('PRIVACIDADE_VALORES', ctx), ls, ctx};
}
const melhorDe = (n, fn) => { let m = Infinity; for (let k = 0; k < n; k++) { const t0 = performance.now(); fn(); m = Math.min(m, performance.now() - t0); } return m; };

test('M32: 30 leituras da lista e 30 de uma O.S. custam perto de UMA poda, não 60 (tablet da montagem, 700 O.S.)', async () => {
  const lista = Array.from({length: 700}, (_, i) => osFicticia(i));
  const {s, P} = aparelho(lista, 'montagem');
  await s.pronto();
  s.getAllOS();   // a primeira leitura da versão poda (aquecimento)
  const umaPoda = melhorDe(5, () => P.podar(lista));
  const leituras = melhorDe(5, () => { for (let k = 0; k < 30; k++) { s.getAllOS(); s.getOS('os' + (k * 20)); } });
  // Caso ruim (v172): cada leitura podava a lista inteira: 60 podas, dezenas de vezes uma poda.
  assert.ok(leituras < Math.max(3 * umaPoda, 15), `60 leituras levaram ${leituras.toFixed(1)} ms; uma poda leva ${umaPoda.toFixed(1)} ms`);
});

test('M32: a cópia é a mesma dentro da versão, e a poda continua valendo (sem R$ e sem login de quem gravou); gravar ou trocar o papel refaz', async () => {
  const lista = [osFicticia(1), osFicticia(2)];
  const {s, ls} = aparelho(lista, 'montagem');
  await s.pronto();
  const a = s.getAllOS();
  assert.equal(s.getAllOS(), a, 'a mesma cópia nas leituras da mesma versão');
  assert.equal(s.getOS('os1'), a[0]);
  assert.doesNotMatch(JSON.stringify(a), /valorTotal|valorUnit|subtotal|porConta|2222\.22/, 'a poda continua valendo');
  assert.equal(a[0].cliente, 'Cliente Fictício 1');
  // Gravou: versão nova, cópia nova, com a mudança.
  const o = s.getOS('os2');
  s.saveOS({...o, cliente: 'Cliente Fictício Mudado'});
  const b = s.getAllOS();
  assert.notEqual(b, a);
  assert.equal(s.getOS('os2').cliente, 'Cliente Fictício Mudado');
  assert.doesNotMatch(JSON.stringify(b), /valorTotal|porConta/);
  // A gestão (outro papel no mesmo aparelho) não recebe a cópia podada da montagem.
  ls.set('impresilk_inst_user', JSON.stringify({nome: 'Gestor Fictício', papel: 'pcp'}));
  assert.notEqual(s.getAllOS(), b);
  // E a montagem de volta: poda de novo, sem R$.
  ls.set('impresilk_inst_user', JSON.stringify({nome: 'Pessoa Fictícia', papel: 'montagem'}));
  assert.doesNotMatch(JSON.stringify(s.getAllOS()), /valorTotal|porConta/);
});
