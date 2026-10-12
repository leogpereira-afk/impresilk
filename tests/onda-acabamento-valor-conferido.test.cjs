/* ONDA ACABAMENTO, ITEM 8 (da verificação da v171, baixa): O VALOR DO ITEM
   CONFERIDO FICA PROTEGIDO. O item citado numa conferência por entrega já
   tinha a identidade protegida (M12: número, descrição, medida, quantidade,
   unidade), mas o "Valor unitário" continuava editável na ficha e mudava o
   subtotal, que é o peso do rateio da entrega conferida. Agora o valor
   unitário e o subtotal do item conferido também ficam os gravados, com
   aviso, nunca 422; a ficha os mostra só leitura. A importação do ERP pela
   máquina não passa por aqui (a M12 diz o mesmo). Tudo fictício. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const FICHAS = [{colecao: 'colaboradores', id: 'g', apagado: false, registro: {id: 'g', nome: 'Gestor Teste', apelido: 'gestor', cpf: '44455566677'}}];
const osBase = () => {
  const o = {id: 'v1', numero: '93201', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'], manual: true,
    itens: [{uid: 'm-a0000000001', item: '1', descricao: 'Painel fictício A', qtde: '2', valorUnit: '250', subtotal: 500, manual: true},
      {uid: 'm-b0000000001', item: '2', descricao: 'Painel fictício B', qtde: '1', valorUnit: '500', subtotal: 500, manual: true}],
    instalacao: {data: '2026-10-05', periodo: 'Manhã', duracaoDias: 1}};
  const i = C.catalogo(o)[0];
  o.conferenciasEntrega = [{id: 'e1', dia: '2026-10-05', itens: [{chave: i.chave, identidade: i.identidade, qtde: 1}], alocacao: D.montar([{equipeId: null, liderId: '100001', membros: ['100001']}]),
    por: 'Gestor Teste', porId: '444555', em: '2026-10-05T20:00:00.000Z'}];
  return o;
};
const banco = () => ({pcp_registros: [{id: 'v1', colecao: 'os', apagado: false, atualizado_em: '2026-10-05T20:00:00Z', registro: osBase()}], registros: structuredClone(FICHAS),
  pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T00:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === 'v1').registro;

test('valor do item conferido: a gestão muda o valor unitário (e o subtotal) do item conferido e fica o gravado, com aviso e 200', async () => {
  const e = await edge('pcp-sync', banco());
  const o = structuredClone(gravada(e));
  o.itens[0].valorUnit = '400'; o.itens[0].subtotal = 800;   // a ficha refaz o subtotal
  o.itens[1].valorUnit = '600'; o.itens[1].subtotal = 600;   // o item B não está na conferência: muda
  o.obsPCP = 'gravação fictícia';
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = gravada(e);
  // Caso ruim (v171): o valor unitário e o subtotal do item conferido mudavam, e com eles o peso do rateio.
  assert.deepEqual([g.itens[0].valorUnit, g.itens[0].subtotal], ['250', 500], 'o item conferido fica com o valor gravado');
  assert.deepEqual([g.itens[1].valorUnit, g.itens[1].subtotal], ['600', 600], 'o item fora da conferência muda');
  assert.equal(g.obsPCP, 'gravação fictícia');
  assert.ok(r.avisos.some(a => /item 1 \(Painel fictício A\) está numa entrega conferida e o valor não mudou/.test(a)), JSON.stringify(r.avisos));
  // O mesmo valor escrito de outro jeito ("250,00") não é mudança e não dá aviso.
  const o2 = structuredClone(gravada(e)); o2.itens[0].valorUnit = '250.00'; o2.obsPCP = 'outra';
  const r2 = await e.call({action: 'upsert', os: o2}, GESTOR);
  assert.ok(!(r2.avisos || []).some(a => /valor não mudou/.test(a)), JSON.stringify(r2.avisos));
});

test('valor do item conferido: a ficha mostra o valor unitário do item conferido só leitura', () => {
  const ctx = vm.createContext({console, Date, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null},
    STORE: {getAllOS: () => [], getCFG: () => ({}), getOS: () => null}, setTimeout() {}});
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(`STATE.user = {nome: 'Gestor Teste', papel: 'pcp'};`, ctx);
  ctx.__os = osBase();
  const html = vm.runInContext('blocoItens(__os, false, 0)', ctx);
  // Caso ruim (v171): o item conferido tinha o campo do valor unitário editável.
  assert.doesNotMatch(html, /data-valor-item="0"/, 'o item conferido não tem o campo');
  assert.match(html, /data-valor-item="1"/, 'o item fora da conferência continua editável');
  assert.match(html, /Valor unitário R\$ 250,00/);
});
