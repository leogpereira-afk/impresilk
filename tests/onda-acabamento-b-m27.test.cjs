'use strict';
/* ONDA ACABAMENTO B, ITEM 2 (M27 da auditoria de 11/10/2026): o repositório
   é PÚBLICO e os arquivos atuais traziam dado real (o número de O.S. reais
   com o valor e os centavos, o total em R$ de 68 O.S., nomes de
   instaladores e de um cliente) em docs/, nos testes e em comentários do
   código. Foram trocados por exemplo fictício, com o mesmo sentido. O
   histórico do git não foi reescrito (P-023, decisão do dono).
   As guardas abaixo começam pelo caso ruim (a v172 falha nelas) e impedem
   que volte: nenhum número na faixa das O.S. reais (20000 a 23999) nos
   arquivos, e nenhum valor em R$ com centavos em docs/ sem a marca de
   fictício. Os nomes não têm guarda automática: uma lista de nomes reais
   aqui seria o próprio dado real (confira na revisão; use nomes fictícios
   e diga que são). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const RAIZ = path.join(__dirname, '..');
const arquivos = () => execFileSync('git', ['ls-files'], {cwd: RAIZ, encoding: 'utf8'}).split('\n').filter(Boolean);
const ler = f => { try { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); } catch (e) { return ''; } };

// Números que não são O.S.: o código de erro do Postgres, os redondos e o fim de uma faixa gerada no teste, uma sequência de dígitos.
const NAO_SAO_OS = new Set(['23505', '20000', '21000', '22000', '23000', '21099', '23456']);
// docs/DECISOES.md só se acrescenta (os exemplos dele são fictícios e marcados); os patches são de outro repositório.
const fora = f => f === 'docs/DECISOES.md' || f.startsWith('docs/patches/') || f === 'tests/onda-acabamento-b-m27.test.cjs';

test('M27: nenhum número na faixa das O.S. reais nos arquivos atuais (docs, testes, scripts e código)', () => {
  const achados = [];
  for (const f of arquivos()) {
    if (fora(f) || !/\.(js|cjs|mjs|ts|md|html|sql)$/.test(f)) continue;
    ler(f).split('\n').forEach((linha, i) => {
      for (const m of linha.matchAll(/(?<![\d.\-\/:])(2[0-3]\d{3})(?![\d\-])/g)) if (!NAO_SAO_OS.has(m[1])) achados.push(`${f}:${i + 1}: ${m[1]}`);
    });
  }
  // Caso ruim (v172): uma O.S. real com o valor no plano de 03/10, outra com o nome do cliente num teste, e mais duas em testes e comentários.
  assert.deepEqual(achados, [], 'use números fictícios (ex.: 9xxxx) em vez de O.S. reais');
});

test('M27: nenhum valor em R$ com centavos em docs/ sem a marca de fictício', () => {
  const achados = [];
  for (const f of arquivos()) {
    if (fora(f) || !f.startsWith('docs/') || !f.endsWith('.md')) continue;
    ler(f).split('\n').forEach((linha, i) => {
      if (/R\$ ?\d[\d.]*,\d{2}/.test(linha) && !/fictíci|fictici|exemplo/i.test(linha)) achados.push(`${f}:${i + 1}`);
    });
  }
  // Caso ruim (v172): o valor de uma O.S. real e o total de 68 O.S. reais no plano de 03/10.
  assert.deepEqual(achados, []);
});

test('M27: os trechos citados pela auditoria foram reescritos sem perder o sentido', () => {
  const plano = ler('docs/plano-auditoria-pcp-2026-10-03.md'), parciais = ler('docs/entregas-parciais-2026-10-02.md');
  assert.match(plano, /uma O\.S\. real \(número e valor retirados deste documento público em 12\/10\/2026, M27 da auditoria de 11\/10\/2026\)/);
  assert.match(plano, /68 O\.S\. com valor conhecido \(o total em R\$ foi retirado deste documento público/);
  assert.match(plano, /não apresentou um dos instaladores \(nome retirado deste documento público/);
  assert.match(parciais, /a entrega real de um instalador \(nome retirado deste documento público/);
  assert.match(parciais, /nem alterar a O\.S\. desse instalador sem/);
});
