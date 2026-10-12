'use strict';
/* ONDA ACABAMENTO B, ITEM 5: as baixas que ficaram das verificações da v171 e
   da v172. Cada teste começa pelo caso ruim (a v172 falha nele). Dados
   fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');
const O = require('../operacao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel: 'pcp', nome: 'Gestor Fictício', sub: 'gestor', exp: EXP};
const operacao = {papel: 'operacao', nome: 'Operação Fictícia', sub: 'operacao1', exp: EXP};
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const reg = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const aloc = id => D.montar([{equipeId: null, liderId: id, membros: [id]}]);
function osConferida(id = 'v1') {
  const o = {id, numero: '90701', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'],
    itens: [{uid: 'a', item: '1', descricao: 'Painel fictício A', qtde: '2', subtotal: '600'}, {uid: 'b', item: '2', descricao: 'Placa fictícia B', qtde: '1', subtotal: '400'}]};
  const i = C.catalogo(o)[0];
  o.conferenciasEntrega = [{id: 'e1', dia: '2026-10-05', itens: [{chave: i.chave, identidade: i.identidade, qtde: 1}], alocacao: aloc('100001'), por: 'Gestor Fictício', porId: '444555', em: '2026-10-05T20:00:00.000Z'}];
  return o;
}
const banco = (o, erp) => ({pcp_registros: [{id: o.id, colecao: 'os', registro: o, apagado: false, atualizado_em: '2026-10-06T21:00:00Z'}],
  painel_ordens: erp, registros: [{id: '100001', colecao: 'colaboradores', apagado: false, registro: {nome: 'Ana', cpf: '10000111111'}}],
  pcp_config_global: [{id: true, atualizado_em: '2020-01-01', config: {performancePCP: {equipes: [], participacoes: []}}}]});

/* ═══════════ a. O aviso do valor conferido usa a régua da comissão ═══════════ */

test('5a: com o valor do ERP valendo, mudar o valor total da ficha não dá aviso falso; mudar o valor de um item avisa pela base do ERP', async () => {
  const e = await edge('pcp-sync', banco(osConferida(), [{numero: '90701', valor: 2000}]));
  let r = await e.call({action: 'upsert', os: {...structuredClone(reg(e, 'v1')), valorTotal: 1500}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  // Caso ruim (v172): "O valor da entrega conferida desta O.S. mudou de R$ 300,00 para R$ 450,00", e a comissão (pelo ERP) não mudava nada.
  assert.doesNotMatch(String(r.avisos || ''), /valor da entrega conferida/);
  assert.equal(diario(e).filter(x => x.acao === 'valor-conferido').length, 0);
  // O valor do outro item muda o rateio: o aviso vem, na base do ERP (R$ 2.000,00 × 600/1000 × 1/2 = R$ 600,00).
  const g = structuredClone(reg(e, 'v1'));
  r = await e.call({action: 'upsert', os: {...g, itens: [g.itens[0], {...g.itens[1], subtotal: '1400'}]}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.match(String(r.avisos), /mudou de R\$ 600,00 para R\$ 300,00/);
  // Sem o valor do ERP, a base é o valor total, como antes.
  const e2 = await edge('pcp-sync', banco(osConferida(), []));
  r = await e2.call({action: 'upsert', os: {...structuredClone(reg(e2, 'v1')), valorTotal: 1500}}, gestor);
  assert.match(String(r.avisos), /mudou de R\$ 300,00 para R\$ 450,00/);
  // A régua é uma só: o pcp-sync lê a base pelo _shared.
  assert.match(ler('supabase/functions/pcp-sync/index.ts'), /function valorConferencia\(os:any, erp:any\[\]\) \{\n\s+return valorDaComissao\(os, erp \|\| \[\]\);/);
});

/* ═══════════ b. Rótulos de gente no Histórico ═══════════ */

test('5b: o Histórico dá nome de gente a aptoEm, aptoPor, arquivadaEm, carroLiberadoEm, carroLiberadoPor, checkinGPS, confEm e fotosTiradas', () => {
  const app = ler('app.js');
  const ctx = vm.createContext({});
  vm.runInContext(app.slice(app.indexOf('const AUD_ROTULOS = {'), app.indexOf('// Por dentro dos campos que são objeto')).replace('const AUD_ROTULOS', 'var AUD_ROTULOS'), ctx);
  // Caso ruim (v172): saíam com o nome interno ("aptoEm → ...").
  for (const k of ['aptoEm', 'aptoPor', 'arquivadaEm', 'carroLiberadoEm', 'carroLiberadoPor', 'checkinGPS', 'confEm', 'fotosTiradas'])
    assert.ok(typeof ctx.AUD_ROTULOS[k] === 'string' && ctx.AUD_ROTULOS[k] !== k && /^[A-ZÁÉÍÓÚ][a-záéíóúãõçê]/.test(ctx.AUD_ROTULOS[k]), k + ': ' + ctx.AUD_ROTULOS[k]);
  assert.match(app, /lat: 'Latitude', lng: 'Longitude', precisao: 'Precisão \(m\)'/);
});

/* ═══════════ c. O botão "Conferir itens e equipe" da seção certa ═══════════ */

test('5c: depois de conferir, a ficha reabre e foca o botão de Conferência e acompanhamento, não o primeiro da ficha', () => {
  const det = nome => ({nome, open: true});
  const btnItens = {nome: 'itens', det: det('itens'), focado: 0, closest() { return this.det; }, focus() { this.focado++; }};
  const btnAcomp = {nome: 'acompanhamento', det: det('acompanhamento'), focado: 0, closest() { return this.det; }, focus() { this.focado++; }};
  const modal = {querySelector: sel => /data-controle-secao="acompanhamento"/.test(sel) ? btnAcomp : /data-controle="itens"/.test(sel) ? btnItens : null};
  let repinta = 0;
  const c = vm.createContext({console, _modalDraft: {id: 'os1', rev: 1, conferenciasEntrega: []}, _modalDirty: false, STORE: {getOS: () => null, getQueue: () => []},
    document: {querySelector: () => modal}, reRenderModalKeepOpen: () => { repinta++; btnAcomp.det.open = false; btnItens.det.open = false; }});
  vm.runInContext(ler('conferencia-entrega-ui.js'), c);
  btnItens.det.open = false; // o bloco de itens fechado, Conferência e acompanhamento aberta
  c.conferenciaRefletirNaFicha({id: 'os1', rev: 2, conferenciasEntrega: [{id: 'e1'}]});
  // Caso ruim (v172): pegava o primeiro botão da ficha (o do bloco de itens), lia "fechado" e focava o botão errado.
  assert.equal(btnAcomp.focado, 1);
  assert.equal(btnItens.focado, 0);
  assert.equal(btnAcomp.det.open, true, 'a seção que estava aberta continua aberta');
  assert.match(ler('controle-entrega-ui.js'), /data-controle="itens" data-controle-secao="acompanhamento"/);
});

/* ═══════════ d. Item novo sem valor de quem não é gestão ═══════════ */

test('5d: quem não é gestão põe item novo sem valor: grava (sem 422), avisa sem R$, e a gestão vê a pendência na ficha e na Fila diária', async () => {
  const e = await edge('pcp-sync', banco(osConferida(), [{numero: '90701', valor: 1000}]));
  const podada = require('../privacidade-valores.js').podar(structuredClone(reg(e, 'v1')));
  const r = await e.call({action: 'upsert', os: {...podada, itens: [...podada.itens, {uid: 'm-v100000003', item: '3', descricao: 'Item fictício novo', qtde: '1', manual: true}]}}, operacao);
  assert.equal(r.status, 200, JSON.stringify(r));
  // Caso ruim (v172): grava calado; o valor das entregas conferidas fica a conferir e ninguém da gestão sabe.
  assert.match(String(r.avisos), /Item sem valor: o valor das entregas conferidas desta O\.S\. ficou a conferir até a gestão do PCP pôr o valor do item/);
  assert.doesNotMatch(String(r.avisos), /R\$/);
  const linha = diario(e).find(x => x.acao === 'valor-conferido');
  assert.ok(linha, 'o diário registra a mudança');
  assert.equal(linha.depois.valorConferido, null);
  // A tela da gestão: a pendência na ficha e na Fila diária.
  const gravada = reg(e, 'v1');
  const ctx = vm.createContext({console, OPERACAO: O, CONFERENCIA_ENTREGA: C, STATE: {user: {papel: 'pcp'}}, STORE: {getQueue: () => [], getAllOS: () => [gravada]},
    esc: s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch])), resumoEntregaFichaTexto: () => '', document: undefined});
  vm.runInContext(ler('controle-entrega-ui.js'), ctx);
  ctx.__os = gravada;
  assert.match(vm.runInContext('controleEntregaHTML(__os)', ctx), /Pendência de valor:<\/strong> o item Item fictício novo está sem valor/);
  const fila = vm.runInContext('filaDiaria([__os], "2026-10-12")', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(fila.map(x => x.motivos.map(m => m.tipo)))), [['valorItem']]);
  // Quem não é gestão não vê a pendência com o caminho da gestão.
  ctx.STATE.user.papel = 'operacao';
  assert.doesNotMatch(vm.runInContext('controleEntregaHTML(__os)', ctx), /Pendência de valor/);
  // Com o valor posto pela gestão, a pendência some.
  ctx.STATE.user.papel = 'pcp';
  ctx.__os = {...gravada, itens: gravada.itens.map(it => it.subtotal == null ? {...it, subtotal: '100'} : it)};
  assert.doesNotMatch(vm.runInContext('controleEntregaHTML(__os)', ctx), /Pendência de valor/);
});
