/* ONDA OPERAÇÃO, ITEM 3: item 30 da fila de 11/10/2026 (Baixa E7 da
   auditoria; D-016: a conferência é o modelo de entrega por item que vale).
   entregaParcialMarcada e temTrabalhoHumano leem a conferência parcial da
   gestão: o ERP "ENTREGUE" não finaliza mais sozinho a O.S. com parte
   conferida e saldo a conferir (a O.S. fica aberta, na lista "ERP diz
   entregue, PCP tem saldo", com "Conferir o saldo"), e a conciliação não
   arquiva O.S. com conferência. Cada caso começa pelo caso ruim da v170.
   Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');

const RAIZ = path.join(__dirname, '..');
const js = x => JSON.parse(JSON.stringify(x));
const DIA_ERP = '2026-10-08';
const ITENS = num => [1, 2, 3].map(k => ({uid:`${num}:${k}:1`, item:String(k), descricao:'Placa fictícia ' + k, qtde:'2', subtotal:'100.00'}));
function conferida(o, lista) {
  const cat = C.catalogo(o);
  return {...o, conferenciasEntrega:lista.map(([id, dia, q]) => ({id, dia, itens:cat.map((it, i) => ({chave:it.chave, identidade:it.identidade, qtde:q[i] || 0})).filter(p => p.qtde > 0),
    por:'Gestor Teste', porId:'111222', em:dia + 'T20:00:00.000Z'}))};
}
const aberta = (id, num, conf) => {
  const o = conferida({id, numero:num, rev:1, origemMubisys:true, tipo:'externo', cliente:'Cliente Fictício ' + num, servico:'Fachada fictícia', equipe:[],
    instalacao:{data:'2026-09-01'}, valorTotal:600, itens:ITENS(num)}, conf);
  return {id, colecao:'os', apagado:false, atualizado_em:'2026-10-01T10:00:00Z', registro:o};
};
const gravada = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
async function bancada(registros, erp) {
  const e = await edge('pcp-mubisys', {pcp_registros:registros});
  e.run(`erpGet = async () => ({data:${JSON.stringify(erp.map(x => ({sequencial_ordem:x.numero, status:x.status, data_entregue:x.data || ''})))}})`);
  e.run('globalThis.__log=[]');
  e.run("console = {...console, warn:(...a)=>globalThis.__log.push('warn '+a.join(' ')), log:(...a)=>globalThis.__log.push('log '+a.join(' '))}");
  return {...e, baixar:() => e.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`), log:() => e.run('globalThis.__log')};
}
function tela(lista, papel = 'pcp') {
  const STORE = {getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[]}), saveOS() {},
    entreguesMes:() => null, elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), valores:() => ({})};
  const HOJE = '2026-10-12';
  const c = {STORE, STATE:{user:{papel, nome:'Gestor Teste'}}, console,
    Date:class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    toast() {}, nowISO:() => HOJE + 'T15:00:00.000Z', emptyState:() => '', bindCardClicks() {},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}}};
  vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'casa.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), c, {filename:f});
  return {run:code => vm.runInContext(code, c)};
}
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

test('E7: o ERP ENTREGUE numa O.S. com parte conferida e saldo a conferir não a finaliza; ela vai para a lista com "Conferir o saldo"', async () => {
  // Caso ruim (v170): a baixa só via as marcas antigas e finalizava a O.S. com parcial conferida.
  const e = await bancada([aberta('mub-30', '30', [['c1', '2026-10-05', [2, 1, 0]]])], [{numero:'30', status:'ENTREGUE', data:DIA_ERP}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 0, JSON.stringify(res));
  assert.equal(res.marcadasComSaldo, 1);
  assert.match(res.comSaldo[0].causa, /entrega parcial conferida no PCP: 1 de 3 itens conferidos por inteiro, 1 com parte conferida, 3 unidades de saldo a conferir; o ERP diz ENTREGUE/);
  const g = gravada(e, 'mub-30');
  assert.ok(!g.finalizadaEm, 'o PCP segura: nada de finalizadaEm');
  assert.equal(g.erpComSaldo.status, 'ENTREGUE');
  assert.equal(g.conferenciasEntrega.length, 1, 'a conferência fica como estava');
  // A lista da gestão mostra a O.S. e manda para a conferência (não para as marcas antigas).
  const t = tela([js(g)]);
  const l = t.run('listaErpComSaldo(STORE.getAllOS())');
  assert.equal(l.length, 1);
  assert.equal(l[0].resumo.conferencia, true);
  const html = t.run('erpComSaldoHTML(listaErpComSaldo(STORE.getAllOS()))');
  assert.match(html, /data-conferir-saldo="mub-30"/);
  // U7 da revisão da onda operação: os inteiros e os com parte, sem contradição.
  assert.match(html, /1 de 3 itens conferidos por inteiro, 1 com parte conferida; faltam 3 unidades a conferir/);
  assert.doesNotMatch(html, /Entregar o saldo/);
  assert.match(html, /Manter aberta/);
  // O card e a ficha dizem o mesmo aviso do ERP (erpSaldoNaOS lê a conferência).
  assert.equal(t.run('erpSaldoNaOS(STORE.getAllOS()[0]).resumo.conferencia'), true);
});

test('E7: conferida inteira, a baixa segue como sempre; CANCELADO no ERP baixa e o conferido fica', async () => {
  const e = await bancada([aberta('mub-31', '31', [['c1', '2026-10-05', [2, 2, 2]]]), aberta('mub-32', '32', [['c1', '2026-10-05', [1, 0, 0]]])],
    [{numero:'31', status:'ENTREGUE', data:DIA_ERP}, {numero:'32', status:'CANCELADO'}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 2, JSON.stringify(res));
  assert.ok(gravada(e, 'mub-31').finalizadaEm);
  const c = gravada(e, 'mub-32');
  assert.ok(c.finalizadaEm);
  assert.equal(c.conferenciasEntrega.length, 1);
  assert.match(res.canceladasComEntrega[0].causa, /entrega parcial conferida no PCP.*o ERP cancelou/);
});

test('E7: temTrabalhoHumano conta a conferência (a conciliação não arquiva); a régua do servidor e a da tela dizem o mesmo', async () => {
  const S = await shared();
  const base = aberta('x', '33', []).registro;
  assert.equal(S.temTrabalhoHumano(base), false);
  const com = conferida(base, [['c1', '2026-10-05', [1, 0, 0]]]);
  assert.equal(S.temTrabalhoHumano(com), true, 'caso ruim: a O.S. só com conferência era arquivada pela conciliação');
  const t = tela([]);
  const casos = [base, com, conferida(base, [['c1', '2026-10-05', [2, 2, 2]]]),
    {...com, itens:com.itens.map((it, i) => i ? it : {...it, descricao:'Mudou'})}, // a conferência que não se lê mais também segura
    {...com, cancelamento:{ativo:true, motivo:'Cliente desistiu fictício', por:'Gestor', em:'2026-10-06T10:00:00Z'}}];
  for (const o of casos) {
    const s = S.parcialConferida({...o, cancelamento:undefined});
    const d = t.run(`parcialConferidaCasa(${JSON.stringify({...o, cancelamento:undefined})})`);
    assert.deepEqual(js(d), js(s));
  }
  assert.equal(S.entregaParcialMarcada(casos[3]).inconsistente, true);
  assert.equal(S.entregaParcialMarcada(casos[2]), null, 'conferida inteira: nada a segurar');
  assert.equal(S.decisaoBaixaERP(casos[4], 'ENTREGUE').acao, 'poupar', 'o cancelamento da gestão fica fora da conta, como nas marcas');
});
