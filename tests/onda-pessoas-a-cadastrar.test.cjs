'use strict';
/* ONDA PESSOAS, ITEM 20 (fila de 11/10/2026): A MARCA "PESSOA A CADASTRAR" na
   O.S. (card e ficha) e na lista do fechamento, para a O.S. com alguém na
   equipe sem ficha nem contrato de freelancer no RH (o nome que não vira ID).
   O caso ruim: na v169 a O.S. com "Zé Novo" na equipe passava calada, e o
   a gestão do PCP só descobria no fechamento que a pessoa ficou fora do ranking e da
   comissão. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const O = require('../operacao.js');
const B = require('./helpers/lote-bancada.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const DADOS = {pessoas:[
  {chave:'ana', id:'620001', nome:'Ana Fictícia', apelido:'ana'},
  {chave:'juviano-a', id:'620002', nome:'Juviano Alves'}, {chave:'juviano-b', id:'620003', nome:'Juviano Borges'},
  {chave:'bruno', id:'620004', nome:'Bruno Martins Dorneles'},
  {chave:'osmar', id:'620009', nome:'Osmar Fictício', apelido:'osmar', desligado:true, ativo:false},
  {chave:'freelancer:fl-tiago', id:'', nome:'Tiago Sem Documento', freelancer:true, semCpf:true},
], vinculos:[{apelido:'Tigre', semFicha:true}], lista:[]};

test('régua: só o nome sem ficha nem contrato (ou com cadastro sem CPF) é "a cadastrar"', () => {
  const lista = ['620001', 'Ana', 'Zé Novo', 'zé  novo', 'Tiago Sem Documento', 'Juviano', 'Bruno Martins', 'Osmar', 'Tigre', 'Terceiro', ''];
  assert.deepEqual(O.pessoasACadastrar(lista, DADOS), ['Zé Novo', 'Tiago Sem Documento']);
  assert.deepEqual(O.aCadastrarDaOS({equipe:['620001', 'Zé Novo']}, DADOS), ['Zé Novo']);
  assert.deepEqual(O.aCadastrarDaOS({equipe:['620001', 'Ana']}, DADOS), [], 'quem tem ficha não é "a cadastrar" (só falta trocar pelo ID)');
  // Sem o elenco do RH no aparelho, não afirma nada (senão toda O.S. antiga seria "a cadastrar").
  assert.deepEqual(O.pessoasACadastrar(['Zé Novo'], {pessoas:[]}), []);
});

/* ------------------------- o aparelho da gestão, com o servidor de verdade */
const NOVO = (id, equipe) => B.pcpFim(id, {equipe});
async function aparelho(quem = B.GESTOR, os = [NOVO('z1', ['100005', 'Zé Novo']), NOVO('z2', ['100005', '100003'])]) {
  const b = await B.montar({os, quem});
  const app = ler('app.js');
  const i = app.indexOf('/* PESSOA A CADASTRAR (item 20'), j = app.indexOf('function osCardHTML(', i);
  assert.ok(i >= 0 && j > i, 'as funções da marca no app.js');
  vm.runInContext(app.slice(i, j), b.ctx, {filename:'app.js (a cadastrar)'});
  return b;
}

test('O.S.: o card e a ficha da O.S. com pessoa sem cadastro levam a marca; a O.S. com todo mundo no RH não', async () => {
  const b = await aparelho();
  try {
    assert.match(b.run(`seloACadastrarHTML(STORE.getOS('z1'))`), /<span class="tag-a-cadastrar" title="Sem cadastro no RH: Zé Novo\. [^"]*">👤 pessoa a cadastrar<\/span>/);
    assert.equal(b.run(`seloACadastrarHTML(STORE.getOS('z2'))`), '');
    assert.match(b.run(`notaACadastrarHTML(STORE.getOS('z1'))`), /Pessoa a cadastrar no RH:<\/strong> Zé Novo\. Sem ficha ou contrato de freelancer no RH, ela fica fora do ranking e da comissão\./);
    // O card e a ficha chamam a marca.
    const app = ler('app.js');
    assert.match(app, /<div class="card-numero">O\.S \$\{esc\(os\.numero \|\| '—'\)\}[^\n]*\$\{seloACadastrarHTML\(os\)\}/);
    assert.match(app, /\$\{fmsgHTML\(os, 'equipe'\)\}\n\s*\$\{notaACadastrarHTML\(os\)\}/);
    assert.match(ler('styles.css'), /\.tag-a-cadastrar \{/);
  } finally { b.fechar(); }
});

test('O.S.: a montagem e a operação (sem as fichas de quem saiu) não recebem a marca', async () => {
  for (const quem of [B.MONTAGEM, B.OPERA]) {
    const b = await aparelho(quem);
    try { assert.equal(b.run(`seloACadastrarHTML(STORE.getOS('z1'))`), '', quem.papel); }
    finally { b.fechar(); }
  }
});

test('fechamento: a lista mostra as O.S. com pessoa a cadastrar, na Base e fechamento e na confirmação do Fechar', async () => {
  const b = await aparelho();
  try {
    const f = {periodo:{de:'2026-09-01', ate:'2026-09-30'}, registros:[
      {id:'z1', osId:'z1', numero:'7z1', membros:[{chave:'100005', nome:'Eva', percentual:50}, {chave:'Zé Novo', nome:'Zé Novo', percentual:50}]},
      {id:'z1:e2', osId:'z1', numero:'7z1', membros:[{chave:'Zé Novo', nome:'Zé Novo', percentual:100}]},
      {id:'z2', osId:'z2', numero:'7z2', membros:[{chave:'100005', nome:'Eva', percentual:100}]}]};
    b.ctx.__f = f;
    assert.deepEqual(B.js(b.run('perfACadastrar(__f)')), [{numero:'7z1', nomes:['Zé Novo']}]);
    const html = b.run('perfACadastrarHTML(__f)');
    // Por pessoa, com as O.S. dela (U7 da revisão da onda pessoas, tests/onda-pessoas-revisao.test.cjs).
    assert.match(html, /<strong>👤 1 pessoa a cadastrar no RH, em 1 O\.S\.<\/strong> Sem ficha ou contrato de freelancer no RH, a pessoa fica fora do ranking e da comissão deste período\./);
    assert.match(html, /<li><strong>Zé Novo<\/strong>: O\.S\. 7z1<\/li>/);
    assert.equal(b.run(`perfACadastrarHTML({registros:[]})`), '');
    // A Base e fechamento e o diálogo do Fechar chamam a lista.
    const perf = ler('performance.js');
    assert.match(perf, /\$\{perfAvisosHTML\(false\)\}\$\{pode\?perfACadastrarHTML\(f\):''\}/);
    assert.match(perf, /<form>\$\{perfCoberturaFechamentoHTML\(fonte\)\}\$\{perfACadastrarHTML\(fonte\)\}/);
  } finally { b.fechar(); }
});
