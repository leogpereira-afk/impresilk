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
   fictício. Os nomes reais não entram aqui (a lista seria o próprio dado
   real): a guarda dos nomes, no fim do arquivo, usa só resumos das grafias
   que a primeira troca deixou (confira na revisão; use nomes inventados e
   confira cada um no RH com contagem 0). */
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

/* REVISÃO DA ONDA ACABAMENTO B (12/10/2026): a primeira troca mudou só uma
   letra do primeiro nome e manteve os sobrenomes reais (o par de sobrenomes
   sozinho ainda apontava a pessoa no RH). Agora as pessoas desses testes têm
   nome e sobrenomes inteiramente inventados, conferidos por contagem no RH
   (fichas e contratos) igual a zero, e o apelido de pessoa que era o mesmo de
   uma equipe passou a outro animal (a equipe fixa continua com o nome dela).
   A guarda abaixo não guarda nome nenhum: guarda o RESUMO (sha256 cortado)
   das grafias que a primeira troca deixou, e cai se qualquer uma voltar a
   aparecer em qualquer arquivo. A lista de nomes reais nunca entra aqui. */
const crypto = require('node:crypto');
const resumo = w => crypto.createHash('sha256').update('m27:' + w).digest('hex').slice(0, 16);
const RESUMOS_PROIBIDOS = new Set(['e5373e0cc9e3f351', '1b745353024772ea', '6689e1192e3f9787', 'cc26e933652fc6dc',
  '5d9c9526d71987f4', '6a7c8780ac5ece9e', '19ea0d471efb6d3c', 'e0fcfe6d9334901e', 'e0b5b623bc118a3b',
  '55e2763a6bb03fe1', '3b974dfcc96e375b', '6431f24407f1dba3']);
const palavras = texto => (texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/\p{L}+/gu) || []);

test('M27 (revisão): nenhuma das grafias da primeira troca volta a nenhum arquivo', () => {
  const achados = [];
  for (const f of arquivos()) {
    if (f === 'tests/onda-acabamento-b-m27.test.cjs' || !/\.(js|cjs|mjs|ts|md|html|sql|css|json|txt|yml|patch)$/.test(f)) continue;
    const vistas = new Set();
    ler(f).split('\n').forEach((linha, i) => {
      for (const w of palavras(linha)) if (RESUMOS_PROIBIDOS.has(resumo(w)) && !vistas.has(w)) { vistas.add(w); achados.push(`${f}:${i + 1}`); }
    });
  }
  // Caso ruim (5124974): as grafias de uma letra trocada em tests/casa.test.cjs,
  // casa.js, tests/converter-equipe.test.cjs, scripts/preview-auditoria.cjs,
  // pcp-sync e mais 20 arquivos de teste e comentários.
  assert.deepEqual(achados, [], 'troque por nome inteiramente inventado (confira no RH: contagem 0)');
});

test('M27 (revisão): os trechos apontados agora usam nomes inventados, com a mesma distância de grafia', () => {
  const casaT = ler('tests/casa.test.cjs'), casaJs = ler('casa.js'), conv = ler('tests/converter-equipe.test.cjs');
  const prev = ler('scripts/preview-auditoria.cjs'), sync = ler('supabase/functions/pcp-sync/index.ts');
  assert.match(casaT, /nome: 'Juviano Neiva Aragão'/);
  assert.match(casaT, /nome: 'Juviano Pacheco Leme'/);
  assert.match(casaT, /apelido: 'Cirilinho', chave: 'cirilo-dutra', id: '777777', nome: 'Cirilo Avelar Dutra'/);
  assert.match(casaJs, /"Cirilo" \(PCP\) e "Cirilo Avelar Dutra" \(RH\)/);
  assert.match(conv, /nome:'Juviano Neiva Aragao'/);
  assert.match(conv, /nome:'Lisandro Gaspar Seixas'/);
  assert.match(conv, /nome:'Lisandro Nazário Rangel'/);
  assert.match(prev, /nome:'Juviano Neiva Aragão'/);
  assert.match(sync, /nomes comuns \(Cirilo, Durval, Lisandro, Otavio\)/);
  // A busca tolerante continua provando o mesmo: "Juvinao" é Juviano com duas letras vizinhas trocadas,
  // "Ozlando" é Ozilando sem uma letra (como antes, com a mesma distância).
  const O = require('../operacao.js');
  assert.equal(O.distanciaEdicao('juvinao', 'juviano'), 1);
  assert.equal(O.distanciaEdicao('ozlando', 'ozilando'), 1);
});

test('M27 (revisão): o apelido de pessoa nos testes não é mais o de uma pessoa real; a equipe fixa fica', () => {
  // A equipe Pantera é uma das dez fixas (pública na tela) e continua; a PESSOA de mesmo apelido virou "Tigre" nos testes.
  const perf = ler('performance.js');
  assert.match(perf, /\{id:'pantera', rotulo:'Pantera'/);
  for (const f of ['tests/freelancer-f07.test.cjs', 'tests/divisao.test.cjs', 'tests/casa.test.cjs', 'tests/converter-equipe.test.cjs',
    'tests/pessoas-id.test.cjs', 'tests/divisao-paridade.test.cjs', 'tests/onda-pessoas-a-cadastrar.test.cjs', 'tests/ranking-equipes-valor.test.cjs'])
    assert.doesNotMatch(ler(f), /pantera/i, f);
  for (const f of ['divisao.js', 'supabase/functions/_shared/pcp-divisao.mjs', 'performance.js', 'supabase/functions/_shared/pcp-integridade.mjs'])
    assert.doesNotMatch(ler(f), /apelido Pantera|pessoa de apelido\s+Pantera/, f);
});
