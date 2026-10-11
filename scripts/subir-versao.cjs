#!/usr/bin/env node
/* Sobe a versão do PCP em TODOS os lugares de uma vez, ou só confere.

   Uso:
     node scripts/subir-versao.cjs              confere, não grava nada
     node scripts/subir-versao.cjs v165         confere, sobe para v165 e confere de novo
     node scripts/subir-versao.cjs --proxima    sobe para a atual + 1

   Os lugares: APP_VERSAO no config.js, CACHE no sw.js e todo `?v=vNNN` dos
   arquivos da RAIZ (.html, .js, .css, .json). Pela raiz inteira, não por lista:
   o guarda antigo (tests/casa.test.cjs) olhava só index.html, equipe.html e
   sw.js, e o ranking.html nasceu na v149 fora dele.

   Sai com erro e NÃO grava nada quando:
   - algum lugar diverge da versão atual (o arquivo e a linha saem na tela);
   - a nova versão não é maior que a atual;
   - a nova versão não é maior que a da origin/main (outro agente já usou o
     número: em 03/10/2026 houve duas v149 diferentes em ramos paralelos). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.resolve(process.env.PCP_RAIZ || path.join(__dirname, '..'));
const EXT = /\.(html|js|css|json)$/;
const RE_V = /\?v=(v\d+)\b/g;
const RE_APP = /const APP_VERSAO = '(v\d+)'/;
const RE_CACHE = /const CACHE = 'impresilk-shell-(v\d+)'/;

const num = v => Number(String(v).slice(1));
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

function arquivosDaRaiz() {
  return fs.readdirSync(RAIZ).filter(f => EXT.test(f) && fs.statSync(path.join(RAIZ, f)).isFile()).sort();
}

/* Devolve cada lugar onde a versão aparece: {arquivo, linha, valor, tipo}. */
function lugares() {
  const out = [];
  for (const arquivo of arquivosDaRaiz()) {
    const linhas = ler(arquivo).split('\n');
    linhas.forEach((txt, i) => {
      for (const m of txt.matchAll(RE_V)) out.push({ arquivo, linha: i + 1, valor: m[1], tipo: '?v=' });
      if (arquivo === 'config.js') { const m = RE_APP.exec(txt); if (m) out.push({ arquivo, linha: i + 1, valor: m[1], tipo: 'APP_VERSAO' }); }
      if (arquivo === 'sw.js') { const m = RE_CACHE.exec(txt); if (m) out.push({ arquivo, linha: i + 1, valor: m[1], tipo: 'CACHE' }); }
    });
  }
  return out;
}

function conferir() {
  const todos = lugares();
  const app = todos.find(l => l.tipo === 'APP_VERSAO');
  const cache = todos.find(l => l.tipo === 'CACHE');
  const erros = [];
  if (!app) erros.push('config.js sem APP_VERSAO');
  if (!cache) erros.push('sw.js sem CACHE = impresilk-shell-vNNN');
  const atual = app && app.valor;
  if (atual) for (const l of todos) if (l.valor !== atual) erros.push(`${l.arquivo}:${l.linha} ${l.tipo} ${l.valor} (a versão é ${atual})`);
  const porArquivo = {};
  for (const l of todos) porArquivo[l.arquivo] = (porArquivo[l.arquivo] || 0) + 1;
  return { atual, total: todos.length, porArquivo, erros };
}

/* A versão na origin/main, ou null quando não há git/origin (avisa, não trava). */
function versaoNaMain() {
  try {
    try { execFileSync('git', ['-C', RAIZ, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 20000 }); } catch {}
    const cfg = execFileSync('git', ['-C', RAIZ, 'show', 'origin/main:config.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = RE_APP.exec(cfg);
    return m ? m[1] : null;
  } catch { return null; }
}

function contemMain() {
  try { execFileSync('git', ['-C', RAIZ, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function subir(nova) {
  const antes = conferir();
  if (antes.erros.length) return { ok: false, motivo: 'divergente', ...antes };
  if (!/^v\d+$/.test(nova)) return { ok: false, motivo: `versão inválida: ${nova} (use vNNN)` };
  if (num(nova) <= num(antes.atual)) return { ok: false, motivo: `${nova} não é maior que a atual ${antes.atual}` };
  const naMain = process.env.PCP_SEM_MAIN ? null : versaoNaMain();
  if (naMain && num(nova) <= num(naMain)) return { ok: false, motivo: `a origin/main já está em ${naMain}: junte a main neste ramo e suba para v${num(naMain) + 1}` };
  if (naMain && !contemMain()) return { ok: false, motivo: 'este ramo não contém a origin/main: junte a main antes de subir a versão (publicar daqui apagaria o que o outro já pôs no ar)' };
  let trocas = 0;
  for (const arquivo of Object.keys(antes.porArquivo)) {
    let txt = ler(arquivo);
    const n0 = trocas;
    txt = txt.replace(RE_V, () => { trocas++; return `?v=${nova}`; });
    if (arquivo === 'config.js') txt = txt.replace(RE_APP, () => { trocas++; return `const APP_VERSAO = '${nova}'`; });
    if (arquivo === 'sw.js') txt = txt.replace(RE_CACHE, () => { trocas++; return `const CACHE = 'impresilk-shell-${nova}'`; });
    if (trocas > n0) fs.writeFileSync(path.join(RAIZ, arquivo), txt);
  }
  const depois = conferir();
  const ok = !depois.erros.length && depois.atual === nova && depois.total === antes.total && trocas === antes.total;
  return { ok, gravou: true, motivo: ok ? '' : 'GRAVOU, mas a conferência depois de gravar falhou; confira com git diff', de: antes.atual, para: nova, trocas, naMain, ...depois };
}

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    const r = conferir();
    if (r.erros.length) { console.error(`ERRO: ${r.erros.length} lugar(es) fora da versão ${r.atual}:\n  ` + r.erros.join('\n  ')); process.exit(1); }
    console.log(`ok: ${r.total} lugares em ${r.atual} (${Object.entries(r.porArquivo).map(([a, n]) => `${a} ${n}`).join(', ')})`);
    process.exit(0);
  }
  const nova = arg === '--proxima' ? `v${num(conferir().atual) + 1}` : arg;
  const r = subir(nova);
  if (!r.ok) {
    console.error(`ERRO: ${r.motivo}.` + (r.gravou ? '' : ' Nada foi gravado.') + (r.erros && r.erros.length ? '\n  ' + r.erros.join('\n  ') : ''));
    process.exit(1);
  }
  console.log(`ok: ${r.de} -> ${r.para}, ${r.trocas} trocas (${Object.entries(r.porArquivo).map(([a, n]) => `${a} ${n}`).join(', ')})` + (r.naMain ? `; origin/main em ${r.naMain}` : '; origin/main não conferida'));
}

module.exports = { conferir, subir, lugares };
