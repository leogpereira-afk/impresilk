'use strict';
/* ONDA PESSOAS, ITEM 21 (fila de 11/10/2026): BUSCA DE PESSOA POR CPF OU CNPJ,
   comparada no servidor, devolvendo só o ID e o nome; só a gestão (admin e
   pcp); com limite de tentativas. Os casos ruins: a montagem, a operação, o
   crachá sem senha e a máquina consultando documento; a resposta levando o
   CPF de volta ou a lista inteira; pedaço de documento achando gente; e a
   busca sem limite (dá para varrer CPFs). Dados fictícios: CPF e CNPJ
   inventados. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const CPF_ANA = '63000111111', CPF_ANA_FMT = '630.001.111-11', CPF_GIL = '63000522220', CNPJ_GIL = '12345678000190';
const RH = [
  {id:'ana', colecao:'colaboradores', apagado:false, registro:{id:'ana', nome:'Ana Fictícia', apelido:'ana', cpf:CPF_ANA_FMT, statusId:'ativo'}},
  {id:'ana2', colecao:'colaboradores', apagado:false, registro:{id:'ana2', nome:'Ana Fictícia Segunda', cpf:'64000111111', idPessoa:'640099', statusId:'ativo'}},
  {id:'apagada', colecao:'colaboradores', apagado:true, registro:{id:'apagada', nome:'Ficha Apagada', cpf:'65000111111'}},
  {id:'fl-gil', colecao:'freelancers', apagado:false, registro:{id:'fl-gil', nome:'Gil Freelancer', cpf:CPF_GIL, cnpj:'12.345.678/0001-90', funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31'}},
];
const cfg = [{id:true, config:{instaladores:[], vinculosRH:[]}, atualizado_em:'2026-09-19T10:00:00Z'}];
const PCP = {papel:'pcp', nome:'Gestor fictício', sub:'gestor'}, ADMIN = {papel:'admin', nome:'Admin fictício', sub:'admin1'};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const busca = (e, documento, quem = PCP) => e.call({action:'pessoaPorDocumento', documento}, quem);

test('só a gestão: montagem, operação, comercial, crachá sem senha, máquina e sem crachá recebem 403/401', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg});
  for (const quem of [{papel:'montagem', nome:'Montagem', sub:'montagem1'}, {papel:'operacao', nome:'Operação', sub:'op1'}, {papel:'comercial', nome:'Comercial', sub:'com1'},
    {nome:'Ana', sub:'Ana', papel:'montagem', montagemIndividual:true}, 'machine']) {
    const r = await busca(e, CPF_ANA, quem);
    assert.ok([401, 403].includes(r.status), JSON.stringify([quem, r.status]));
    assert.equal(r.pessoas, undefined);
  }
  const sem = await busca(e, CPF_ANA, null);
  assert.ok([401, 403].includes(sem.status));
});

test('gestão: o CPF inteiro (com ou sem pontuação) acha a pessoa; sai só o ID e o nome, nunca o documento', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg});
  const r = await busca(e, CPF_ANA);
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(r.pessoas, [{id:'630001', nome:'Ana Fictícia'}]);
  assert.deepEqual((await busca(e, CPF_ANA_FMT, ADMIN)).pessoas, [{id:'630001', nome:'Ana Fictícia'}]);
  // O ID gravado no RH manda (D-015).
  assert.deepEqual((await busca(e, '640.001.111-11')).pessoas, [{id:'640099', nome:'Ana Fictícia Segunda'}]);
  // CPF e CNPJ do contrato de freelancer: a mesma pessoa, uma vez.
  assert.deepEqual((await busca(e, CPF_GIL)).pessoas, [{id:'630005', nome:'Gil Freelancer'}]);
  const c = await busca(e, CNPJ_GIL);
  assert.deepEqual(c.pessoas, [{id:'630005', nome:'Gil Freelancer'}]);
  for (const x of [r, c]) {
    const tudo = JSON.stringify(x);
    for (const d of [CPF_ANA, CPF_GIL, CNPJ_GIL, '111-11', '0001-90']) assert.ok(!tudo.includes(d), 'documento na resposta: ' + d);
    assert.deepEqual(Object.keys(x.pessoas[0]).sort(), ['id', 'nome']);
  }
  // Ficha apagada não é achada; documento que ninguém tem: lista vazia.
  assert.deepEqual((await busca(e, '65000111111')).pessoas, []);
  assert.deepEqual((await busca(e, '99999999999')).pessoas, []);
});

test('pedaço de documento, vazio ou texto não acha ninguém nem devolve a lista (400)', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg});
  for (const d of ['', '630001', '6300011111', '630.001', 'ana', '   ', null, '630001111112']) {
    const r = await busca(e, d);
    assert.equal(r.status, 400, String(d));
    assert.equal(r.pessoas, undefined);
    assert.match(r.error, /CPF \(11 dígitos\) ou o CNPJ \(14 dígitos\) inteiro/);
  }
});

test('limite: a 11ª busca em 15 minutos é recusada (429) para aquele crachá; o colega e a janela seguinte passam', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg});
  relogio(e, '2026-10-12T12:00:00Z');
  for (let i = 0; i < 10; i++) assert.equal((await busca(e, '99999999' + String(100 + i))).status, 200, 'busca ' + (i + 1));
  const onze = await busca(e, CPF_ANA);
  assert.equal(onze.status, 429);
  assert.match(onze.error, /Muitas buscas por documento em pouco tempo \(o limite é 10 a cada 15 minutos\)\. Tente de novo em 15 minutos\./);
  assert.equal(onze.pessoas, undefined);
  // Pedido mal formado não conta, mas também não passa.
  assert.equal((await busca(e, '123')).status, 400);
  // A conta sobrevive à função reciclar (pcp_meta). (Antes do colega: o banco falso guarda uma linha só de pcp_meta sem id.)
  const reciclada = await edge('pcp-sync', structuredClone(e.db));
  relogio(reciclada, '2026-10-12T12:05:00Z');
  assert.equal((await busca(reciclada, CPF_ANA)).status, 429, 'a conta guardada no banco vale na instância nova');
  // O colega tem a conta dele.
  assert.equal((await busca(e, CPF_ANA, ADMIN)).status, 200);
  // Passada a janela, volta a buscar.
  relogio(e, '2026-10-12T12:15:01Z');
  const depois = await busca(e, CPF_ANA);
  assert.equal(depois.status, 200);
  assert.equal(depois.restantes, 9);
});

/* ------------------------------------------------------------ a tela */
function tela(papel, api) {
  const casa = ler('casa.js');
  const i = casa.indexOf('/* BUSCA DE PESSOA POR CPF OU CNPJ'), j = casa.indexOf('function ligacaoRHHTML(', i);
  assert.ok(i >= 0 && j > i);
  const chamadas = [];
  const campos = {input:{value:''}, saida:{textContent:''}, botao:{disabled:false}};
  const form = {onsubmit:null, querySelector:sel => sel.startsWith('input') ? campos.input : sel === '.busca-doc-res' ? campos.saida : campos.botao};
  const ctx = {STATE:{user:{papel}}, STORE:{api:async corpo => { chamadas.push(corpo); return api(corpo); }}};
  vm.createContext(ctx); vm.runInContext(casa.slice(i, j), ctx);
  ctx.wireBuscaDocumentoCasa({querySelector:() => form});
  return {ctx, form, campos, chamadas};
}
test('tela (Conferir nomes): só a gestão vê a busca; o campo é limpo na hora; o resultado diz o nome e o ID', async () => {
  for (const papel of ['montagem', 'operacao', 'comercial', '']) assert.equal(tela(papel, () => ({})).ctx.buscaDocumentoCasaHTML(), '', papel);
  const t = tela('pcp', () => ({pessoas:[{id:'630001', nome:'Ana Fictícia'}], restantes:9}));
  assert.match(t.ctx.buscaDocumentoCasaHTML(), /<form class="busca-doc" data-busca-doc/);
  t.campos.input.value = CPF_ANA_FMT;
  await t.form.onsubmit({preventDefault() {}});
  assert.equal(JSON.stringify(t.chamadas), JSON.stringify([{action:'pessoaPorDocumento', documento:CPF_ANA}]));
  assert.equal(t.campos.input.value, '', 'o documento não fica no campo');
  assert.equal(t.campos.saida.textContent, 'Ana Fictícia · ID 630001.');
  // Pedaço de documento nem vai ao servidor.
  t.campos.input.value = '630.001';
  await t.form.onsubmit({preventDefault() {}});
  assert.equal(t.chamadas.length, 1);
  assert.match(t.campos.saida.textContent, /inteiro/);
  // A recusa do servidor (o limite) aparece com a mensagem dele.
  const r = tela('admin', () => { throw Object.assign(new Error('Muitas buscas'), {status:429, servidor:'Muitas buscas por documento em pouco tempo.'}); });
  r.campos.input.value = CPF_ANA;
  await r.form.onsubmit({preventDefault() {}});
  assert.equal(r.campos.saida.textContent, 'Muitas buscas por documento em pouco tempo.');
  const n = tela('admin', () => ({pessoas:[]}));
  n.campos.input.value = CNPJ_GIL;
  await n.form.onsubmit({preventDefault() {}});
  assert.equal(n.campos.saida.textContent, 'Nenhum cadastro do RH com este documento.');
  // A tela de Conferir nomes chama a busca e o wire.
  const casa = ler('casa.js');
  assert.match(casa, /\$\{avisosRH\}\n\s*\$\{buscaDocumentoCasaHTML\(\)\}/);
  assert.match(casa, /wireBuscaDocumentoCasa\(el\);/);
});
