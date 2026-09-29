/* PARIDADE DO MOTOR DE DIVISÃO. O aparelho (divisao.js) mostra a divisão e o
   servidor (_shared/pcp-divisao.mjs) recalcula a parte final de cada pessoa e
   ignora a que veio do aparelho. Se as duas cópias divergirem, a tela mostra
   um número e o banco grava outro, sem erro nenhum. Duas travas: o texto do
   motor é o mesmo byte a byte, e 500 casos gerados (sempre os mesmos, gerador
   com semente fixa) dão o mesmo resultado nas duas. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../divisao.js');
const O = require('../operacao.js');

const RAIZ = path.join(__dirname, '..');
const motor = arquivo => {
  const s = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const ini = s.indexOf('/* ==== MOTOR DE DIVISÃO'), fim = s.indexOf('/* ==== FIM DO MOTOR ==== */');
  assert.ok(ini >= 0 && fim > ini, `${arquivo}: marcas do motor não encontradas`);
  return s.slice(ini, fim);
};

test('o texto do motor é o mesmo nas duas cópias', () => {
  assert.equal(motor('supabase/functions/_shared/pcp-divisao.mjs'), motor('divisao.js'), 'mudou uma cópia e não a outra');
});

// Gerador determinístico (mulberry32): a mesma semente dá sempre os mesmos casos.
function gerador(semente) {
  let a = semente >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min, max) => min + Math.floor(r() * (max - min + 1));
  return {r, int, um: xs => xs[int(0, xs.length - 1)]};
}

const REGRAS = [undefined, {tabela:{1:[10000], 2:[5500, 4500], 3:[3400, 3300, 3300]}, maisLider:3500}, {tabela:{1:[10000], 2:[7000, 3000], 3:[5000, 2500, 2500]}, maisLider:5000}, {tabela:{2:[7000, 3000]}, maisLider:5000}];
const FICHAS = [
  {chave:'ana-prado', id:'300001', nome:'Ana Prado', apelido:'ana', ativo:true},
  {chave:'caio-rosa', id:'300002', nome:'Caio Rosa', apelido:'', ativo:true},
  {chave:'caio-reis', id:'300003', nome:'Caio Reis', apelido:'', ativo:true},
  {chave:'davi-luz', id:'300004', nome:'Davi Luz', apelido:'davi', ativo:true, freelancer:true},
];
const NOMES = ['Ana', 'ana', 'Caio', 'Caio Rosa', 'Davi', 'Ninguém', '300002', '300004', '', 'Pantera'];

function caso(g) {
  const qtdGrupos = g.int(1, 3);
  const pool = Array.from({length:30}, (_, i) => String(400001 + i));
  const grupos = [];
  for (let k = 0; k < qtdGrupos; k++) {
    const n = g.int(1, 8), membros = [];
    for (let j = 0; j < n; j++) {
      // De vez em quando repete gente de outro grupo: o validar tem de recusar igual nas duas.
      const pessoaId = g.r() < 0.03 && grupos.length ? g.um(grupos[0].membros).pessoaId : pool.splice(g.int(0, pool.length - 1), 1)[0];
      membros.push({pessoaId, freelancer:g.r() < 0.2});
    }
    const liderId = g.r() < 0.15 && n > 1 ? null : g.um(membros).pessoaId;
    grupos.push({equipeId:g.r() < 0.5 ? 'eq-' + k : null, liderId, membros});
  }
  return grupos;
}

function rodar(M, S, g) {
  const regra = g.um(REGRAS);
  const saida = {regra:[M.padrao(g.int(0, 12), regra), M.entreEquipes([g.int(0, 6), g.int(1, 6), g.int(0, 3)])]};
  let a = M.montar(caso(g), regra);
  saida.montar = a;
  saida.passos = [];
  for (let passo = 0; passo < 6; passo++) {
    const gi = g.int(0, a.grupos.length - 1), grupo = a.grupos[gi];
    const pessoaId = g.um(grupo.membros).pessoaId;
    const acao = g.int(0, 4);
    let r;
    if (acao === 0) r = M.editar(a, {nivel:'equipes', grupo:gi}, g.r() < 0.1 ? g.um([0, 10000, -5, 3333.3]) : g.int(0, 10000), regra);
    else if (acao === 1) r = M.editar(a, {nivel:'membros', grupo:gi, pessoaId}, g.r() < 0.1 ? g.um([0, 10000]) : g.int(0, 10000), regra);
    else if (acao === 2) r = M.travar(a, g.r() < 0.5 ? {nivel:'equipes', grupo:gi} : {nivel:'membros', grupo:gi, pessoaId}, g.r() < 0.7);
    else if (acao === 3) r = M.trocarLider(a, gi, pessoaId, regra);
    else r = {alocacao:M.restaurarPadrao(a, regra), erro:''};
    saida.passos.push({erro:r.erro, validar:M.validar(r.alocacao), finais:M.finais(r.alocacao), manual:!!(r.alocacao && r.alocacao.manual)});
    a = r.alocacao;
  }
  const centavos = g.um([0, 1, 7, 99, 100001, 123456789, -2503, null]);
  saida.fim = {alocacao:a, validar:M.validar(a), equipe:M.derivarEquipe(a), centavos:M.ratearCentavosLider(centavos, a)};
  const entradas = Array.from({length:g.int(0, 4)}, () => g.um(NOMES));
  saida.sugerida = M.alocacaoSugerida({equipe:entradas}, {pessoas:S.resolverPessoas({pessoas:FICHAS, vinculos:[{apelido:'Pantera', id:'300004'}]}), equipes:[{id:'eq-x', ativo:true, liderPadraoId:'300004', membros:[{chave:'300001'}, {chave:'300004'}]}], regra});
  // Divisão gravada: com a mesma gente de os.equipe ou outra, marcada desatualizada ou não.
  const pessoas = S.resolverPessoas({pessoas:FICHAS, vinculos:[{apelido:'Pantera', id:'300004'}]});
  saida.gravada = M.alocacaoSugerida({equipe:g.r() < 0.5 ? M.derivarEquipe(a) : entradas, alocacao:{...a, desatualizada:g.r() < 0.3}}, {pessoas, regra});
  return saida;
}

test('500 casos gerados dão o mesmo resultado no aparelho e no servidor', async () => {
  const M = await import('../supabase/functions/_shared/pcp-divisao.mjs');
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  let validos = 0, recusas = 0;
  for (let i = 0; i < 500; i++) {
    const aparelho = rodar(D, O, gerador(1000 + i));
    const servidor = rodar(M, S, gerador(1000 + i));
    assert.deepEqual(servidor, aparelho, `caso ${i} (semente ${1000 + i})`);
    // O que o motor devolve sem erro fecha 10000 em cada nível e no final.
    for (const p of aparelho.passos) if (!p.validar) assert.equal(p.finais.reduce((s, f) => s + f.cota, 0), 10000, `caso ${i}: final soma 100%`);
    if (!aparelho.fim.validar) validos++;
    recusas += aparelho.passos.filter(p => p.erro).length;
  }
  // Os casos exercitam os dois caminhos: divisões válidas e edições recusadas.
  assert.ok(validos > 200, `divisões válidas: ${validos}`);
  assert.ok(recusas > 50, `edições recusadas: ${recusas}`);
});
