/* REVISÃO DA F06 (29/09/2026): o que o servidor grava tem de ser o que o
 * aparelho mandou. Casos ruins primeiro. Dados fictícios: o repositório é
 * público (CPF inventado; o ID é o começo dele).
 *
 * 1. O setCfg reescrevia a chave do membro ('carla-lima' -> '100003') e a aba
 *    presa na v133, que compara pelo slug o que ela mesma gravou, perdia o
 *    modelo "Equipe salva" e o selo da pessoa. A chave fica como veio.
 * 2. O setCfg apagava o liderPadraoId '' que a tela nova sempre manda. A fila
 *    do aparelho rebaseia o setCfg seguinte sobre o que MANDOU (store.js), e a
 *    segunda edição da mesma equipe levava 409 sem ninguém mais ter mexido.
 * 3. A participação confirmada pelo slug abria com a mesma pessoa duas vezes.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');

const fichaRH = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const RH = [fichaRH('carla-lima', 'Carla Ficticia Lima', 'carla', '10000300000'), fichaRH('paulo-tx', 'Paulo Ficticio Teixeira', 'paulo', '20000900000')];
const cfgRow = cfg => [{id:true, config:cfg, atualizado_em:'2026-09-19T10:00:00Z'}];
const GESTOR = {papel:'pcp', nome:'Gestor'};
const gravado = e => e.db.pcp_config_global[0].config.performancePCP;

/* ------------------------------------------ 1. a chave fica como veio */

test('servidor: equipe gravada pela aba v133 (chave = slug) volta e fica EXATAMENTE como foi mandada', async () => {
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:{equipes:[], participacoes:[]}}), registros:RH});
  const equipeV133 = {id:'eq1', nome:'Horizonte', emblema:'🦅', ativo:true, membros:[
    {chave:'carla-lima', nome:'Carla Ficticia Lima', apelido:'carla'}, {chave:'paulo-tx', nome:'Paulo Ficticio Teixeira', apelido:'paulo'}]};
  const r = await e.call({action:'setCfg', baseCfg:{performancePCP:{equipes:[], participacoes:[]}}, cfg:{performancePCP:{equipes:[equipeV133], participacoes:[]}}}, {papel:'admin', nome:'Gestor'});
  assert.equal(r.ok, true, JSON.stringify(r));
  // A v133 compara perfPessoa(cb.value).chave (o slug) com m.chave: precisa voltar o slug.
  assert.deepEqual(r.cfg.performancePCP.equipes[0].membros, equipeV133.membros, 'desce como a v133 mandou');
  assert.deepEqual(gravado(e).equipes[0].membros, equipeV133.membros, 'e fica gravada assim');
});

test('servidor: pessoa em duas equipes pelo slug numa e pelo ID noutra é a mesma, e o aviso sai com o nome dela', async () => {
  const antes = {equipes:[{id:'a', nome:'Águia', emblema:'🦅', animal:'aguia', cor:'azul', liderPadraoId:'', ativo:true, membros:[{chave:'carla-lima', nome:'Carla Ficticia Lima'}]}], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:antes}), registros:RH});
  const nova = {id:'b', nome:'Leão', emblema:'🦁', animal:'leao', cor:'laranja', liderPadraoId:'100003', ativo:true, membros:[{chave:'100003', nome:'Carla'}]};
  const r = await e.call({action:'setCfg', baseCfg:{performancePCP:antes}, cfg:{performancePCP:{...antes, equipes:[...antes.equipes, nova]}}}, GESTOR);
  assert.equal(r.ok, true, JSON.stringify(r));
  // O nome vem do membro da 1a equipe (gravado pelo slug): sem converter a chave, sairia o da 2a.
  assert.deepEqual(r.avisos, ['Carla Ficticia Lima aparece em mais de uma equipe ativa (Águia e Leão). Confira o cadastro.']);
});

test('tela nova: equipe salva pelo slug funciona no modelo da O.S. e no selo da pessoa', () => {
  const rh = [{chave:'carla-lima', id:'100003', nome:'Carla Ficticia Lima', apelido:'carla'}, {chave:'paulo-tx', id:'200009', nome:'Paulo Ficticio Teixeira', apelido:'paulo'}];
  const equipe = {id:'eq1', nome:'Horizonte', emblema:'🦅', ativo:true, membros:[{chave:'carla-lima', nome:'Carla Ficticia Lima', apelido:'carla'}, {chave:'paulo-tx', nome:'Paulo Ficticio Teixeira', apelido:'paulo'}]};
  const {c, toasts} = tela(rh, {performancePCP:{equipes:[equipe], participacoes:[]}});
  const cbs = ['carla', 'paulo'].map(v => ({value:v, checked:false, closest:() => ({classList:{toggle(){}}})}));
  const sel = {value:'', onchange:null};
  const form = {querySelector:q => q === '[data-perf-modelo]' ? sel : null, querySelectorAll:q => q === '[name="equipe"]' ? cbs : []};
  c.perfWireModelo(form); sel.value = 'eq1'; sel.onchange();
  assert.deepEqual(toasts, []);
  assert.deepEqual(cbs.map(x => x.checked), [true, true]);
  assert.equal(c.perfEquipeDaPessoa('100003', [equipe]).length, 1);
  assert.equal(c.perfEquipeDaPessoa('carla-lima', [equipe]).length, 1);
});

/* --------------------- 2. duas gravações seguidas, base = o que foi mandado */

test('fila: 2a edição da mesma equipe feita com a 1a em voo (líder vazio -> líder) não vira 409', async () => {
  const S0 = {performancePCP:{equipes:[], participacoes:[]}};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow(S0), registros:RH});
  const TERCEIRO = {chave:'Terceiro Ficticio', nome:'Terceiro Ficticio', apelido:'Terceiro Ficticio'};
  const X1 = {id:'eq-onca', nome:'Onça', animal:'onca', cor:'verde', liderPadraoId:'', emblema:'🐆', membros:[TERCEIRO], ativo:true};
  const C1 = {performancePCP:{equipes:[X1], participacoes:[]}};
  const r1 = await e.call({action:'setCfg', baseCfg:S0, cfg:C1}, GESTOR);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(gravado(e).equipes[0], X1, 'o banco guarda o que o aparelho mandou, vazio incluído');
  // store.js: o setCfg que entrou na fila durante o envio passa a ter base = item.cfg (C1).
  const X2 = {...X1, liderPadraoId:'100003', membros:[TERCEIRO, {chave:'100003', nome:'Carla', apelido:'carla'}]};
  const r2 = await e.call({action:'setCfg', baseCfg:C1, cfg:{performancePCP:{equipes:[X2], participacoes:[]}}}, GESTOR);
  assert.equal(r2.status, 200, JSON.stringify(r2));
  assert.equal(r2.conflitoCfg, undefined);
  assert.equal(gravado(e).equipes[0].liderPadraoId, '100003');
});

test('fila: equipe gravada pelo apelido (tela sem elenco) e logo depois outro integrante não vira 409', async () => {
  const S0 = {performancePCP:{equipes:[], participacoes:[]}};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow(S0), registros:RH});
  const X1 = {id:'eq-leao', nome:'Leão', animal:'leao', cor:'azul', liderPadraoId:'', emblema:'🦁', membros:[{chave:'carla', nome:'carla', apelido:'carla'}], ativo:true};
  const C1 = {performancePCP:{equipes:[X1], participacoes:[]}};
  const r1 = await e.call({action:'setCfg', baseCfg:S0, cfg:C1}, GESTOR);
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(gravado(e).equipes[0].membros, X1.membros);
  const X2 = {...X1, membros:[...X1.membros, {chave:'paulo', nome:'paulo', apelido:'paulo'}]};
  const r2 = await e.call({action:'setCfg', baseCfg:C1, cfg:{performancePCP:{equipes:[X2], participacoes:[]}}}, GESTOR);
  assert.equal(r2.status, 200, JSON.stringify(r2));
  assert.deepEqual(gravado(e).equipes[0].membros.map(m => m.chave), ['carla', 'paulo']);
});

test('fila: cor recusada fica vazia e a próxima edição (base = o que foi mandado) passa', async () => {
  const S0 = {performancePCP:{equipes:[], participacoes:[]}};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow(S0), registros:RH});
  const X1 = {id:'eq-tigre', nome:'Tigre', animal:'tigre', cor:'#ff0000', liderPadraoId:'', emblema:'🐯', membros:[{chave:'100003', nome:'Carla'}], ativo:true};
  const C1 = {performancePCP:{equipes:[X1], participacoes:[]}};
  const r1 = await e.call({action:'setCfg', baseCfg:S0, cfg:C1}, GESTOR);
  assert.equal(r1.ok, true);
  assert.equal(gravado(e).equipes[0].cor, '');
  const r2 = await e.call({action:'setCfg', baseCfg:C1, cfg:{performancePCP:{equipes:[{...X1, nome:'Tigre Real'}], participacoes:[]}}}, GESTOR);
  assert.equal(r2.status, 200, JSON.stringify(r2));
  assert.equal(gravado(e).equipes[0].nome, 'Tigre Real');
  assert.equal(gravado(e).equipes[0].cor, '', 'a cor recusada não volta');
});

/* ------------------------ 3. participação confirmada pelo slug, uma caixa */

function tela(rh, cfg) {
  const toasts = [];
  const c = {STORE:{getCFG:() => cfg, getAllOS:() => [], getOS:() => null}, STATE:{user:{papel:'admin'}},
    OPERACAO:{ehIdPessoa:v => /^\d{6}$/.test(String(v || '')), equipe:() => []},
    nomeExibicaoCasa:n => { const p = rh.find(x => x.apelido === n || x.id === n || x.chave === n); return p ? {chave:p.chave, id:p.id, nome:p.nome} : {chave:n, id:'', nome:n}; },
    pessoasRH:() => rh, equipeEscalavel:() => ({doPCP:rh.map(p => p.apelido)}), toast:(m, t) => toasts.push([m, t]),
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]))};
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'performance.js'), 'utf8'), c);
  return {c, toasts};
}
const caixas = html => [...html.matchAll(/<input type="checkbox" name="membro" value="([^"]*)"[^>]*?(checked)?>/g)].map(m => m[1] + (m[2] ? ' (marcada)' : ''));
function abrirParticipacao(c, registro) {
  const els = {}, el = q => (els[q] = els[q] || {innerHTML:'', textContent:'', onchange:null, onclick:null, onsubmit:null, oninput:null});
  let corpo = '';
  c.perfOS = () => ({id:'os1', numero:'77', cliente:'Cliente Ficticio', servico:'Adesivo'});
  c.perfFonteAtual = () => null;
  c.perfRegistro = () => registro;
  c.perfDialog = (_t, html) => { corpo = html; return {querySelector:el, querySelectorAll:() => [], close(){}}; };
  c.perfEditarParticipacao('os1');
  return {corpo, els};
}

test('tela nova: participação confirmada pelo slug abre com uma caixa por pessoa, com o percentual gravado', () => {
  const rh = [{chave:'carla-lima', id:'100003', nome:'Carla Ficticia Lima', apelido:'carla'}, {chave:'paulo-tx', id:'200009', nome:'Paulo Ficticio Teixeira', apelido:'paulo'}];
  const equipeSlug = {id:'eq1', nome:'Horizonte', emblema:'🦅', ativo:true, membros:[{chave:'carla-lima', nome:'Carla Ficticia Lima'}, {chave:'paulo-tx', nome:'Paulo Ficticio Teixeira'}]};
  const {c} = tela(rh, {performancePCP:{equipes:[equipeSlug], participacoes:[]}});
  const {corpo, els} = abrirParticipacao(c, {id:'os1', confirmado:true, equipeId:'', membros:[
    {chave:'carla-lima', nome:'Carla da Época', apelido:'carla', percentual:60}, {chave:'200009', nome:'Paulo', percentual:40}]});
  assert.deepEqual(caixas(corpo), ['100003 (marcada)', '200009 (marcada)'], 'slug e ID da mesma pessoa não viram duas caixas');
  const pesos = els['#perf-pesos'].innerHTML;
  assert.match(pesos, /data-chave="100003" value="60"/, 'o percentual gravado fica');
  assert.match(pesos, /Carla da Época/, 'o nome da época fica');
  // Slug e ID da mesma pessoa na mesma entrega: uma caixa, percentuais somados.
  const dup = abrirParticipacao(c, {id:'os1', confirmado:true, equipeId:'', membros:[
    {chave:'carla-lima', nome:'Carla', percentual:30}, {chave:'100003', nome:'Carla', percentual:30}, {chave:'200009', nome:'Paulo', percentual:40}]});
  assert.deepEqual(caixas(dup.corpo), ['100003 (marcada)', '200009 (marcada)']);
  assert.match(dup.els['#perf-pesos'].innerHTML, /data-chave="100003" value="60"/);
  // "Usar uma equipe" com a equipe salva pelo slug: também uma caixa por pessoa.
  dup.els['[name="equipe"]'].onchange({target:{value:'eq1'}});
  assert.deepEqual(caixas(dup.els['#perf-part-members'].innerHTML), ['100003 (marcada)', '200009 (marcada)']);
});
