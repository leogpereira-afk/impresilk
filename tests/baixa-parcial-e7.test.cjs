/* E7 (30/09/2026): A BAIXA DO ERP RESPEITA A ENTREGA PARCIAL.
   Decisão do dono: quando o ERP diz entregue e o PCP tem entrega parcial
   marcada, o PCP segura a O.S. e a gestão decide. Sem marca parcial, a baixa
   segue exatamente como antes. A marca declarada pelo celular conta como
   marca. CANCELADO no ERP numa O.S. parcial: o saldo vira cancelado e o
   entregue fica. A lista "ERP diz entregue, PCP tem saldo" mora em Entregas
   (casa.js), só para admin e pcp, com "Entregar o saldo" (via 'lote', na
   data do ERP, pelo motor, sobre a O.S. relida) e "Manter aberta" (decisão
   carimbada pelo servidor).
   Bancadas: a de edge (tests/helpers/edge.cjs) para pcp-mubisys e pcp-sync,
   e a tela num contexto isolado (operacao, motor da entrega, casa.js).
   Cada teste começa pelo caso ruim. Dados fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const E = require('../entrega-item.js');

const RAIZ = path.join(__dirname, '..');
const js = x => JSON.parse(JSON.stringify(x));
const DIA_ERP = '2026-09-25';
const row = (id, registro, extra = {}) => ({id, colecao: 'os', apagado: false, atualizado_em: '2026-09-19T10:00:00Z', ...extra, registro: {id, rev: 1, ...registro}});
const marca = (id, qtde, dia = '2026-09-20', extra = {}) => ({id, tipo: 'entregue', qtde, dia, via: 'gestao', por: 'Gestor Teste', porId: '111222', em: dia + 'T12:00:00.000Z', ...extra});
const declarada = (id, qtde, dia = '2026-09-21') => ({id, tipo: 'entregue', qtde, dia, via: 'toque', declarado: true, por: 'Ana', porId: '100001', em: dia + 'T15:00:00.000Z'});
const item = (num, k, entregas, extra = {}) => ({uid: `${num}:${k}:1`, item: String(k), descricao: 'Placa fictícia ' + k, qtde: '1', subtotal: '100.00', ...extra, ...(entregas ? {entregas} : {})});
// Cinco itens de R$ 100; `marcas[k]` são as marcas do item k (1 a 5).
const itens = (num, marcas = {}) => [1, 2, 3, 4, 5].map(k => item(num, k, marcas[k]));
const doisDeCinco = num => itens(num, {1: [marca('m' + num + '-1', 1)], 2: [marca('m' + num + '-2', 1)]});
const aberta = (id, num, extra = {}) => row(id, {numero: num, origemMubisys: true, tipo: 'externo', cliente: 'Cliente Fictício ' + num, servico: 'Fachada fictícia', equipe: [],
  instalacao: {data: '2026-09-01'}, valorTotal: 500, itens: itens(num), ...extra});
const gravada = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const linhaDe = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id);

/* O ERP da bancada responde o que cada teste manda: [{numero, status, data}]. */
async function bancada(registros, erp) {
  const e = await edge('pcp-mubisys', {pcp_registros: registros});
  const lista = erp.map(x => ({sequencial_ordem: x.numero, status: x.status, data_entregue: x.data || ''}));
  e.run(`erpGet = async () => ({data:${JSON.stringify(lista)}})`);
  e.run('globalThis.__log=[]');
  e.run("console = {...console, warn:(...a)=>globalThis.__log.push('warn '+a.join(' ')), log:(...a)=>globalThis.__log.push('log '+a.join(' '))}");
  return {...e, erp: novo => e.run(`erpGet = async () => ({data:${JSON.stringify(novo.map(x => ({sequencial_ordem: x.numero, status: x.status, data_entregue: x.data || ''})))}})`),
    baixar: (opts = '{simular:false}') => e.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},${opts})`), log: () => e.run('globalThis.__log')};
}

/* A tela da gestão (Entregas) num contexto isolado. O STORE é de mentira e
   guarda uma cópia de cada gravação. */
function tela({lista = [], papel = 'pcp', pacotes = {}} = {}) {
  const salvos = [], toasts = [];
  const STORE = {getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null, getCFG: () => ({instaladores: []}),
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    entreguesMes: m => pacotes[m] || null, elenco: () => ({pessoas: [], veiculos: [], ferias: [], ausencias: []}), valores: () => ({})};
  const HOJE = '2026-10-05';
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste'}}, console,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc: s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch])),
    toast: (m, t) => toasts.push([m, t]), nowISO: () => HOJE + 'T15:00:00.000Z', emptyState: () => '', bindCardClicks() {},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    document: {getElementById: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}, contains: () => false}}}};
  vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'casa.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), c, {filename: f});
  return {c, salvos, toasts, lista, run: code => vm.runInContext(code, c)};
}

// A regra pura que a baixa usa, e o motor da tela, leem a MESMA coisa.
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

/* ───────────── 1. sem marca, a baixa é a de sempre ───────────── */

test('ERP ENTREGUE numa O.S. sem marca finaliza exatamente como hoje (e "só problema" ou tudo entregue também)', async () => {
  const semMarca = aberta('mub-1', '1');
  const soProblema = aberta('mub-2', '2', {itens: itens('2', {3: [{id: 'p2', tipo: 'problema', dia: '2026-09-20', motivo: 'Peça amassada', via: 'gestao'}]})});
  const tudoEntregue = aberta('mub-3', '3', {itens: itens('3', {1: [marca('t1', 1)], 2: [marca('t2', 1)], 3: [marca('t3', 1)], 4: [marca('t4', 1)], 5: [marca('t5', 1)]})});
  const antes = js(semMarca.registro);
  const e = await bancada([semMarca, soProblema, tudoEntregue], [{numero: '1', status: 'ENTREGUE', data: DIA_ERP}, {numero: '2', status: 'ENTREGUE', data: DIA_ERP}, {numero: '3', status: 'ENTREGUE', data: DIA_ERP}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 3, JSON.stringify(res));
  assert.equal(res.poupadasComSaldo, 0);assert.equal(res.marcadasComSaldo, 0);
  const g = gravada(e, 'mub-1');
  // O que muda é SÓ o que a baixa sempre mudou: nada a mais, nada a menos.
  const mudou = Object.keys({...antes, ...g}).filter(k => JSON.stringify(antes[k]) !== JSON.stringify(g[k])).sort();
  assert.deepEqual(mudou, ['atualizadoEm', 'atualizadoPor', 'baixaAutoERP', 'finalizadaEm', 'finalizadoPor', 'finalizadoPorId', 'rev']);
  assert.equal(g.finalizadoPor, 'Mubisys (baixa automática · ENTREGUE)');
  assert.deepEqual(g.baixaAutoERP, {em: g.finalizadaEm, status: 'ENTREGUE'});
  assert.equal(g.rev, 2);assert.ok(!('erpComSaldo' in g));
  for (const id of ['mub-2', 'mub-3']) { assert.ok(gravada(e, id).finalizadaEm, id + ' sem parcial: baixa como hoje'); assert.ok(!('erpComSaldo' in gravada(e, id))); }
  assert.deepEqual(gravada(e, 'mub-3').itens.map(i => i.entregas.length), [1, 1, 1, 1, 1], 'as marcas ficam');
});

/* ───────────── 2. parcial: poupada, marcada, listada ───────────── */

test('ERP ENTREGUE numa O.S. com 2 de 5 itens: poupada, listada, sem finalizadaEm, e o log diz a causa', async () => {
  const e = await bancada([aberta('mub-10', '10', {itens: doisDeCinco('10')})], [{numero: '10', status: 'ENTREGUE', data: DIA_ERP}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 0, JSON.stringify(res));
  assert.equal(res.poupadasComSaldo, 1);assert.equal(res.marcadasComSaldo, 1);
  assert.match(res.comSaldo[0].causa, /2 de 5 itens com entrega, 3 unidades de saldo/);
  const g = gravada(e, 'mub-10');
  assert.ok(!g.finalizadaEm, 'o PCP segura: nada de finalizadaEm');assert.ok(!g.baixaAutoERP);
  assert.deepEqual({...g.erpComSaldo, desde: 'x', em: 'x'}, {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|2026-09-25', desde: 'x', em: 'x'});
  assert.equal(g.rev, 1, 'a marca não sobe o rev: a ficha aberta da gestão não vira conflito');
  assert.notEqual(linhaDe(e, 'mub-10').atualizado_em, '2026-09-19T10:00:00Z', 'atualizado_em anda: os aparelhos puxam a marca');
  assert.equal(g.atualizadoPor, 'Mubisys (auto)');
  assert.deepEqual(g.itens.map(i => (i.entregas || []).length), [1, 1, 0, 0, 0], 'as marcas ficam como estavam');
  assert.ok(e.log().some(l => /^log .*poupou a O\.S\. 10 .*ENTREGUE.*entrega parcial marcada no PCP.*o PCP segura/.test(l)), JSON.stringify(e.log()));
  // A lista da tela (admin e pcp) mostra a O.S., com a data do ERP.
  const t = tela({lista: [js(g)]});
  const l = t.run('listaErpComSaldo(STORE.getAllOS())');
  assert.equal(l.length, 1);assert.equal(l[0].aviso.data, DIA_ERP);assert.equal(l[0].saldo.unidades, 3);
  const html = t.run('erpComSaldoHTML(listaErpComSaldo(STORE.getAllOS()))');
  assert.match(html, /ERP diz entregue, PCP tem saldo/);assert.match(html, /Entregar o saldo em 25\/09/);assert.match(html, /Manter aberta/);
  assert.match(html, /2 de 5 itens com entrega; faltam 3 unidades/);
  assert.ok(!html.includes('— ') && !/\s—\s/.test(html), 'sem travessão no texto');
});

test('FINALIZADO também põe na lista; CONCLUIDO (produção, não entrega) segura sem pôr na lista; simular não grava', async () => {
  const regs = [aberta('mub-11', '11', {itens: doisDeCinco('11')}), aberta('mub-12', '12', {itens: doisDeCinco('12')})];
  const e = await bancada(regs, [{numero: '11', status: 'FINALIZADO'}, {numero: '12', status: 'CONCLUIDO'}]);
  const sim = await e.baixar('{simular:true}');
  assert.equal(sim.simulado, true);assert.equal(sim.poupadasComSaldo, 2);
  assert.ok(!gravada(e, 'mub-11').erpComSaldo, 'simular só conta');
  const res = await e.baixar();
  assert.equal(res.baixadas, 0);assert.equal(res.marcadasComSaldo, 1);assert.equal(res.poupadasComSaldo, 2);
  assert.equal(gravada(e, 'mub-11').erpComSaldo.selo, 'FINALIZADO|');
  assert.ok(!gravada(e, 'mub-12').erpComSaldo && !gravada(e, 'mub-12').finalizadaEm, 'CONCLUIDO: segue aberta, sem a marca');
  assert.match(res.comSaldo.find(x => x.numero === '12').causa, /produção, não entrega/);
  // Sem data de entrega do ERP, a tela não chuta um dia: manda marcar na ficha.
  const t = tela({lista: [js(gravada(e, 'mub-11')), js(gravada(e, 'mub-12'))]});
  const l = t.run('listaErpComSaldo(STORE.getAllOS())');
  assert.deepEqual(js(l.map(x => x.os.id)), ['mub-11']);assert.equal(l[0].aviso.data, '');
  const html = t.run('erpComSaldoHTML(listaErpComSaldo(STORE.getAllOS()))');
  assert.match(html, /finalizada, sem data de entrega/);assert.match(html, /Marcar na ficha/);assert.doesNotMatch(html, /data-erp-entregar/);
  assert.match(t.run(`entregarSaldoERP('mub-11','FINALIZADO|').erro`), /não informou a data/);
});

/* ───────────── 3. "Entregar o saldo" ───────────── */

test('"Entregar o saldo" grava os eventos com via lote na data do ERP, sobre a O.S. relida, e o servidor aceita', async () => {
  const e = await bancada([aberta('mub-20', '20', {itens: doisDeCinco('20')})], [{numero: '20', status: 'ENTREGUE', data: DIA_ERP}]);
  await e.baixar();
  const doServidor = js(gravada(e, 'mub-20'));
  // Caso ruim: a lista foi desenhada com a cópia de antes, e outro tablet marcou o item 3 depois.
  const t = tela({lista: [js(doServidor)]});
  const selo = t.run('listaErpComSaldo(STORE.getAllOS())[0].aviso.selo');
  t.lista[0] = {...js(doServidor), itens: doServidor.itens.map(i => i.uid === '20:3:1' ? {...i, entregas: [marca('outro-tablet', 1, '2026-09-24')]} : i)};
  const r = t.run(`entregarSaldoERP('mub-20', ${JSON.stringify(selo)})`);
  assert.equal(r.erro, '', r.erro);assert.equal(r.marcadas, 2, 'só o que ainda faltava na O.S. relida');
  assert.equal(t.salvos.length, 1);
  const s = t.salvos[0];
  assert.deepEqual(s.itens[2].entregas.map(x => x.id), ['outro-tablet'], 'a marca do outro tablet fica e não é repetida');
  for (const k of [3, 4]) {
    assert.equal(s.itens[k].entregas.length, 1);
    const ev = s.itens[k].entregas[0];
    assert.equal(ev.tipo, 'entregue');assert.equal(ev.qtde, 1);assert.equal(ev.dia, DIA_ERP);assert.equal(ev.via, 'lote');
  }
  assert.ok(!s.finalizadaEm, 'entregar o saldo não finaliza: a finalização segue a baixa ou a ficha');
  assert.equal(E.resumoOS(s).situacao, 'completa');
  assert.equal(t.run('listaErpComSaldo(STORE.getAllOS()).length'), 0, 'sem saldo, sai da lista');
  // A porta do servidor (pcp-sync) confere pelo motor e carimba o autor pelo crachá.
  const fichas = [{colecao: 'colaboradores', id: 'gestor-teste', apagado: false, registro: {id: 'gestor-teste', nome: 'Gestor Teste', apelido: 'gestor', cpf: '111.222.333-44'}}];
  const noBanco = {...js(doServidor), itens: t.lista[0].itens.map((i, k) => k === 2 ? i : doServidor.itens[k])};
  const sync = await edge('pcp-sync', {pcp_registros: [row('mub-20', noBanco)], registros: fichas});
  const resp = await sync.call({action: 'upsert', os: {...s, rev: 1}}, {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'});
  assert.equal(resp.status, 200, JSON.stringify(resp));assert.ok(!resp.entregasRecusadas, JSON.stringify(resp.entregasRecusadas));
  const g = sync.db.pcp_registros.find(x => x.id === 'mub-20').registro;
  for (const k of [3, 4]) {
    const ev = g.itens[k].entregas[0];
    assert.equal(ev.via, 'lote');assert.equal(ev.dia, DIA_ERP);assert.equal(ev.porId, '111222');assert.equal(ev.por, 'Gestor Teste');
  }
  assert.deepEqual(g.erpComSaldo, doServidor.erpComSaldo, 'a marca da baixa segue a do servidor');
});

test('"Entregar o saldo": item com problema fica de fora; aviso do ERP que mudou não marca nada; tudo ou nada', () => {
  const problema = {id: 'p1', tipo: 'problema', dia: '2026-09-22', motivo: 'Estrutura amassada', via: 'gestao'};
  const os = {id: 'mub-21', numero: '21', tipo: 'externo', itens: itens('21', {1: [marca('a1', 1)], 2: [problema]}),
    erpComSaldo: {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|2026-09-25', desde: '2026-09-26T10:00:00.000Z', em: '2026-09-26T10:00:00.000Z'}};
  const t = tela({lista: [js(os)]});
  assert.match(t.run(`entregarSaldoERP('mub-21','ENTREGUE|2026-09-24').erro`), /mudou/);
  assert.equal(t.salvos.length, 0);
  const r = t.run(`entregarSaldoERP('mub-21','ENTREGUE|2026-09-25')`);
  assert.equal(r.erro, '');assert.equal(r.marcadas, 3);assert.equal(r.ficaramComProblema, 1);
  assert.deepEqual(t.salvos[0].itens[1].entregas.map(x => x.tipo), ['problema'], 'o saldo segurado não é liberado em lote');
  // Interna (cliente retira): a marca é "retirado".
  const t2 = tela({lista: [{...js(os), id: 'mub-22', tipo: 'interno', itens: itens('22', {1: [{...marca('b1', 1), tipo: 'retirado', via: 'balcao'}]})}]});
  assert.equal(t2.run(`entregarSaldoERP('mub-22','ENTREGUE|2026-09-25')`).erro, '');
  assert.deepEqual([...new Set(t2.salvos[0].itens.slice(1).map(i => i.entregas[0].tipo))], ['retirado']);
});

/* ───────────── 4. baixa concorrente ───────────── */

test('baixa concorrente com marca nova no aparelho: relê, não perde a marca e passa a poupar', async () => {
  // (a) Sem marca na leitura; no meio da baixa, a gestão marca 2 de 5.
  const e = await bancada([aberta('mub-30', '30')], [{numero: '30', status: 'ENTREGUE', data: DIA_ERP}]);
  e.cliente.beforeWrite = db => { const r = db.pcp_registros[0]; r.atualizado_em = '2026-09-29T15:00:00Z'; r.registro = {...r.registro, itens: doisDeCinco('30'), rev: 2}; };
  const res = await e.baixar();
  assert.equal(res.baixadas, 0, JSON.stringify(res));assert.equal(res.marcadasComSaldo, 1);assert.equal(res.desistencias.length, 0);
  const g = gravada(e, 'mub-30');
  assert.ok(!g.finalizadaEm, 'com a marca nova a O.S. é poupada');
  assert.deepEqual(g.itens.map(i => (i.entregas || []).map(x => x.id)), [['m30-1'], ['m30-2'], [], [], []], 'a marca que chegou no meio fica');
  assert.equal(g.erpComSaldo.selo, 'ENTREGUE|2026-09-25');assert.equal(g.rev, 2);
  // (b) Já parcial; no meio, chega mais uma marca (3 de 5): a marca da lista grava sobre o registro novo.
  const e2 = await bancada([aberta('mub-31', '31', {itens: doisDeCinco('31')})], [{numero: '31', status: 'ENTREGUE', data: DIA_ERP}]);
  e2.cliente.beforeWrite = db => { const r = db.pcp_registros[0]; r.atualizado_em = '2026-09-29T15:00:00Z'; r.registro = {...r.registro, itens: r.registro.itens.map((i, k) => k === 2 ? {...i, entregas: [declarada('d31', 1)]} : i), rev: 2}; };
  const res2 = await e2.baixar();
  assert.equal(res2.marcadasComSaldo, 1, JSON.stringify(res2));
  const g2 = gravada(e2, 'mub-31');
  assert.deepEqual(g2.itens.map(i => (i.entregas || []).length), [1, 1, 1, 0, 0]);assert.ok(g2.erpComSaldo);assert.ok(!g2.finalizadaEm);
  // (c) Parcial na leitura; no meio, a gestão entrega o resto: relida, vira a baixa de sempre, com as marcas.
  const e3 = await bancada([aberta('mub-32', '32', {itens: doisDeCinco('32')})], [{numero: '32', status: 'ENTREGUE', data: DIA_ERP}]);
  e3.cliente.beforeWrite = db => { const r = db.pcp_registros[0]; r.atualizado_em = '2026-09-29T15:00:00Z'; r.registro = {...r.registro, itens: r.registro.itens.map((i, k) => k > 1 ? {...i, entregas: [marca('r' + k, 1)]} : i), rev: 2}; };
  const res3 = await e3.baixar();
  assert.equal(res3.baixadas, 1, JSON.stringify(res3));
  const g3 = gravada(e3, 'mub-32');
  assert.ok(g3.finalizadaEm);assert.equal(g3.rev, 3);assert.deepEqual(g3.itens.map(i => i.entregas.length), [1, 1, 1, 1, 1]);
});

/* ───────────── 5. CANCELADO ───────────── */

test('CANCELADO no ERP numa O.S. parcial: baixa como sempre, o saldo vira cancelado e o entregue fica', async () => {
  const e = await bancada([aberta('mub-40', '40', {itens: doisDeCinco('40')})], [{numero: '40', status: 'CANCELADO'}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 1, JSON.stringify(res));assert.equal(res.poupadasComSaldo, 0);
  assert.equal(res.canceladasComEntrega.length, 1);assert.match(res.canceladasComEntrega[0].causa, /saldo vira cancelado e o entregue fica/);
  assert.ok(e.log().some(l => /O\.S\. 40 .*CANCELADO.*cancelou/.test(l)), JSON.stringify(e.log()));
  const g = gravada(e, 'mub-40');
  assert.equal(g.baixaAutoERP.status, 'CANCELADO');assert.ok(!g.erpComSaldo);
  assert.deepEqual(g.itens.map(i => (i.entregas || []).length), [1, 1, 0, 0, 0], 'o entregue fica gravado');
  // O motor: o que foi entregue fica no dia dele; o saldo é cancelado, nada em aberto.
  assert.deepEqual(g.itens.map(i => E.situacaoItem(i, g).situacao), ['cancelado', 'cancelado', 'cancelado', 'cancelado', 'cancelado']);
  const l = E.lancamentosDaOS(g, {liquido: '500.00'});
  assert.equal(l.entregue, 20000);assert.equal(l.cancelado, 30000);assert.equal(l.saldo, 0);
  assert.deepEqual(l.lancamentos.map(x => x.dia), ['2026-09-20', '2026-09-20']);
  // Finalizada: fora da lista da tela.
  assert.equal(tela({lista: [js(g)]}).run('listaErpComSaldo(STORE.getAllOS()).length'), 0);
});

/* ───────────── 6. declarada pelo celular ───────────── */

test('marca só declarada pelo celular também segura a O.S. e aparece na lista', async () => {
  const soDeclaradas = itens('50', {1: [declarada('d1', 1)], 2: [declarada('d2', 1)]});
  const e = await bancada([aberta('mub-50', '50', {itens: soDeclaradas})], [{numero: '50', status: 'ENTREGUE', data: DIA_ERP}]);
  const res = await e.baixar();
  assert.equal(res.baixadas, 0, JSON.stringify(res));assert.equal(res.marcadasComSaldo, 1);
  assert.match(res.comSaldo[0].causa, /2 unidades declaradas pelo celular/);
  const g = gravada(e, 'mub-50');
  assert.ok(!g.finalizadaEm);assert.ok(g.erpComSaldo);
  const t = tela({lista: [js(g)]});
  const html = t.run('erpComSaldoHTML(listaErpComSaldo(STORE.getAllOS()))');
  assert.match(html, /2 declaradas pelo celular/);
});

/* ───────────── 7. só admin e pcp ───────────── */

test('operação (e montagem, comercial) não vê a lista nem decide; o servidor recusa a decisão com aviso', async () => {
  const os = {id: 'mub-60', numero: '60', tipo: 'externo', itens: doisDeCinco('60'),
    erpComSaldo: {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|2026-09-25', desde: '2026-09-26T10:00:00.000Z', em: '2026-09-26T10:00:00.000Z'}};
  for (const papel of ['operacao', 'montagem', 'comercial', '']) {
    const t = tela({lista: [js(os)], papel});
    assert.equal(t.run('listaErpComSaldo(STORE.getAllOS()).length'), 0, papel);
    // Mesmo com as linhas prontas (de outra sessão), a seção não é desenhada.
    assert.equal(t.run(`erpComSaldoHTML([{os:STORE.getOS('mub-60'),aviso:{status:'ENTREGUE',data:'${DIA_ERP}',selo:'ENTREGUE|${DIA_ERP}'},resumo:ENTREGA_ITEM.resumoOS(STORE.getOS('mub-60')),saldo:{pendentes:[],comProblema:[],unidades:0}}])`), '', papel);
    assert.match(t.run(`entregarSaldoERP('mub-60','ENTREGUE|${DIA_ERP}').erro`), /Só admin e PCP/);
    assert.match(t.run(`manterAbertaSaldoERP('mub-60','ENTREGUE|${DIA_ERP}').erro`), /Só admin e PCP/);
    assert.equal(t.salvos.length, 0, papel + ' não grava');
  }
  for (const papel of ['admin', 'pcp']) assert.equal(tela({lista: [js(os)], papel}).run('listaErpComSaldo(STORE.getAllOS()).length'), 1, papel);
  // A porta: a decisão da operação não entra, e a marca da baixa não é forjada nem apagada.
  const sync = await edge('pcp-sync', {pcp_registros: [row('mub-60', {...js(os), origemMubisys: true})]});
  const r = await sync.call({action: 'upsert', os: {...js(os), rev: 1, erpSaldoDecisao: {tipo: 'manter', selo: 'ENTREGUE|2026-09-25'}, erpComSaldo: {status: 'ENTREGUE', selo: 'FORJADO|'}}},
    {papel: 'operacao', nome: 'Operação Teste', sub: 'operacao1'});
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.match((r.avisos || []).join(' '), /é da gestão \(admin e PCP\)/);
  const g = sync.db.pcp_registros[0].registro;
  assert.ok(!g.erpSaldoDecisao);assert.equal(g.erpComSaldo.selo, 'ENTREGUE|2026-09-25');
});

/* ───────────── 8. idempotente, "Manter aberta" e o selo ───────────── */

test('a baixa segue idempotente: a segunda rodada com a mesma resposta não grava nada', async () => {
  const e = await bancada([aberta('mub-70', '70', {itens: doisDeCinco('70')}), aberta('mub-71', '71')],
    [{numero: '70', status: 'ENTREGUE', data: DIA_ERP}, {numero: '71', status: 'ENTREGUE', data: DIA_ERP}]);
  const r1 = await e.baixar();
  assert.equal(r1.baixadas, 1);assert.equal(r1.marcadasComSaldo, 1);
  const foto = js(e.db.pcp_registros);
  let escritas = 0;
  e.cliente.beforeWrite = () => { escritas++; };
  const r2 = await e.baixar();
  assert.equal(r2.baixadas, 0, JSON.stringify(r2));assert.equal(r2.marcadasComSaldo, 0);assert.equal(r2.poupadasComSaldo, 1);
  assert.equal(escritas, 0, 'nenhuma escrita');
  assert.deepEqual(e.db.pcp_registros, foto, 'o banco ficou igual');
});

test('"Manter aberta": o servidor carimba a decisão; a O.S. sai da lista até o ERP mudar o aviso', async () => {
  const e = await bancada([aberta('mub-80', '80', {itens: doisDeCinco('80')})], [{numero: '80', status: 'ENTREGUE', data: DIA_ERP}]);
  await e.baixar();
  const desde = gravada(e, 'mub-80').erpComSaldo.desde;
  // A tela decide.
  const t = tela({lista: [js(gravada(e, 'mub-80'))]});
  assert.equal(t.run(`manterAbertaSaldoERP('mub-80','ENTREGUE|2026-09-25').erro`), '');
  assert.deepEqual(t.salvos[0].erpSaldoDecisao, {tipo: 'manter', selo: 'ENTREGUE|2026-09-25'});
  assert.equal(t.run('listaErpComSaldo(STORE.getAllOS()).length'), 0, 'a decisão na fila deste aparelho já tira da lista');
  // A porta carimba quem e quando (ID do RH pelo crachá), e registra no diário.
  const fichas = [{colecao: 'colaboradores', id: 'gestor-teste', apagado: false, registro: {id: 'gestor-teste', nome: 'Gestor Teste', apelido: 'gestor', cpf: '111.222.333-44'}}];
  const sync = await edge('pcp-sync', {pcp_registros: [row('mub-80', js(gravada(e, 'mub-80')))], registros: fichas});
  const r = await sync.call({action: 'upsert', os: {...t.salvos[0], erpSaldoDecisao: {tipo: 'manter', selo: 'ENTREGUE|2026-09-25', por: 'Forjado', porId: '999999'}}}, {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'});
  assert.equal(r.status, 200, JSON.stringify(r));
  const d = sync.db.pcp_registros.find(x => x.id === 'mub-80').registro.erpSaldoDecisao;
  assert.equal(d.tipo, 'manter');assert.equal(d.selo, 'ENTREGUE|2026-09-25');assert.equal(d.por, 'Gestor Teste');assert.equal(d.porId, '111222');assert.ok(d.em);
  const diario = sync.db.pcp_registros.filter(x => x.colecao === 'auditoria');
  assert.ok(diario.some(x => (x.registro.campos || []).includes('erpSaldoDecisao')), JSON.stringify(diario.map(x => x.registro.campos)));
  // Cópia velha da gestão, sem os dois campos: nada se apaga.
  const {erpComSaldo: _m, erpSaldoDecisao: _d, ...velha} = sync.db.pcp_registros.find(x => x.id === 'mub-80').registro;
  const r2 = await sync.call({action: 'upsert', os: {...velha, obsPCP: 'nota da gestão'}}, {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'});
  assert.equal(r2.status, 200, JSON.stringify(r2));
  const g2 = sync.db.pcp_registros.find(x => x.id === 'mub-80').registro;
  assert.equal(g2.erpSaldoDecisao.porId, '111222');assert.equal(g2.erpComSaldo.selo, 'ENTREGUE|2026-09-25');assert.equal(g2.obsPCP, 'nota da gestão');
  // A baixa seguinte, com o mesmo aviso, não mexe; o ERP muda a data: a marca anda (desde fica) e a O.S. volta à lista.
  e.db.pcp_registros = js(sync.db.pcp_registros.filter(x => x.colecao === 'os'));
  const r3 = await e.baixar();
  assert.equal(r3.marcadasComSaldo, 0);
  e.erp([{numero: '80', status: 'ENTREGUE', data: '2026-09-27'}]);
  const r4 = await e.baixar();
  assert.equal(r4.marcadasComSaldo, 1);
  const g4 = gravada(e, 'mub-80');
  assert.equal(g4.erpComSaldo.selo, 'ENTREGUE|2026-09-27');assert.equal(g4.erpComSaldo.desde, desde);assert.equal(g4.erpSaldoDecisao.selo, 'ENTREGUE|2026-09-25');
  const l = tela({lista: [js(g4)]}).run('listaErpComSaldo(STORE.getAllOS())');
  assert.equal(l.length, 1);assert.equal(l[0].aviso.data, '2026-09-27');
});

/* ───────────── 9. só daqui para frente ───────────── */

test('só daqui para frente: O.S. já baixada (mesmo com parcial) não é mexida nem listada', async () => {
  const em = '2026-09-20T18:00:00.000Z';
  const jaBaixada = row('mub-90', {numero: '90', origemMubisys: true, tipo: 'externo', cliente: 'Cliente Fictício', equipe: [], instalacao: {data: '2026-09-01'}, itens: doisDeCinco('90'),
    finalizadaEm: em, finalizadoPor: 'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP: {em, status: 'ENTREGUE'}});
  const e = await bancada([jaBaixada], [{numero: '90', status: 'ENTREGUE', data: DIA_ERP}]);
  const foto = js(e.db.pcp_registros);
  const res = await e.baixar();
  assert.equal(res.baixadas, 0);assert.equal(res.poupadasComSaldo, 0);
  assert.deepEqual(e.db.pcp_registros, foto);
  assert.equal(tela({lista: [js(gravada(e, 'mub-90'))]}).run('listaErpComSaldo(STORE.getAllOS()).length'), 0);
});

/* ───────────── 10. o caminho da conciliação horária ───────────── */

test('O.S. parcial que saiu da carteira aberta entra na lista quando o pacote de entregues do ERP a traz com a data', () => {
  const os = {id: 'mub-95', numero: '95', tipo: 'externo', itens: doisDeCinco('95'), erpSaiuDaCarteiraEm: '2026-09-26T13:20:00.000Z'};
  // Sem o pacote do ERP: não se sabe se foi entrega ou cancelamento. Fica fora.
  assert.equal(tela({lista: [js(os)]}).run('listaErpComSaldo(STORE.getAllOS()).length'), 0);
  const pacotes = {'2026-09': {v: 3, os: [{numero: '95', data: DIA_ERP, valor: 500}]}};
  const t = tela({lista: [js(os)], pacotes});
  const l = t.run('listaErpComSaldo(STORE.getAllOS())');
  assert.equal(l.length, 1);assert.equal(l[0].aviso.selo, 'ENTREGUE|2026-09-25');assert.equal(l[0].aviso.fonte, 'carteira');
  assert.equal(t.run(`entregarSaldoERP('mub-95','ENTREGUE|2026-09-25').erro`), '');
  assert.deepEqual([...new Set(t.salvos[0].itens.slice(2).map(i => i.entregas[0].dia + '|' + i.entregas[0].via))], ['2026-09-25|lote']);
  // Sem marca parcial não entra, mesmo com o ERP dizendo entregue.
  assert.equal(tela({lista: [{...js(os), itens: itens('95')}], pacotes}).run('listaErpComSaldo(STORE.getAllOS()).length'), 0);
});

test('O.S. marcada que volta à carteira aberta do ERP perde a marca (o ERP reabriu)', async () => {
  const marcada = row('mub-96', {numero: '96', origemMubisys: true, tipo: 'externo', cliente: 'Cliente Fictício', equipe: [], itens: doisDeCinco('96'),
    erpComSaldo: {status: 'ENTREGUE', dataEntregue: DIA_ERP, selo: 'ENTREGUE|2026-09-25', desde: '2026-09-26T10:00:00.000Z', em: '2026-09-26T10:00:00.000Z'}});
  const e = await edge('pcp-mubisys', {pcp_registros: [marcada]});
  const r = await e.run(`reconciliarCarteira(sb,[{numero:'96',cliente:'Cliente Fictício'}])`);
  assert.equal(r.restauradas, 1, JSON.stringify(r));
  const g = gravada(e, 'mub-96');
  assert.ok(!g.erpComSaldo);assert.ok(!g.finalizadaEm);assert.deepEqual(g.itens.map(i => (i.entregas || []).length), [1, 1, 0, 0, 0]);
});

/* ───────────── a regra pura ───────────── */

test('regra pura: decisaoBaixaERP só poupa com marca parcial; marcarErpComSaldo é idempotente; guardarSaldoERP fecha por omissão', async () => {
  const {decisaoBaixaERP, marcarErpComSaldo, guardarSaldoERP, CAMPOS_AUDITADOS} = await shared();
  const semMarca = {numero: '1', itens: itens('1')}, parcial = {numero: '2', itens: doisDeCinco('2')};
  for (const st of ['ENTREGUE', 'CONCLUIDO', 'CONCLUÍDO', 'FINALIZADO', 'CANCELADO']) assert.equal(decisaoBaixaERP(semMarca, st).acao, 'baixar', st);
  assert.deepEqual(['ENTREGUE', 'FINALIZADO', 'CONCLUÍDO', 'CANCELADO'].map(st => [decisaoBaixaERP(parcial, st).acao, decisaoBaixaERP(parcial, st).marcar]),
    [['poupar', true], ['poupar', true], ['poupar', false], ['baixar', false]]);
  assert.equal(decisaoBaixaERP({...parcial, finalizadaEm: '2026-09-20T10:00:00Z'}, 'ENTREGUE').acao, 'baixar', 'finalizada não é "aberta com saldo"');
  const m1 = marcarErpComSaldo(parcial, {status: 'ENTREGUE', dataEntregue: DIA_ERP, agora: 'T1'});
  assert.equal(marcarErpComSaldo(m1, {status: 'ENTREGUE', dataEntregue: DIA_ERP, agora: 'T2'}), null);
  const m2 = marcarErpComSaldo(m1, {status: 'ENTREGUE', dataEntregue: '2026-09-26', agora: 'T2'});
  assert.equal(m2.erpComSaldo.desde, 'T1');assert.equal(m2.erpComSaldo.em, 'T2');
  // Sem papel, nada entra; selo torto também não.
  const antes = {erpComSaldo: m1.erpComSaldo};
  assert.equal(guardarSaldoERP({erpSaldoDecisao: {tipo: 'manter', selo: 'ENTREGUE|2026-09-25'}}, antes, {}).os.erpSaldoDecisao, undefined);
  assert.equal(guardarSaldoERP({erpSaldoDecisao: {tipo: 'manter', selo: '<script>'}}, antes, {pode: true}).decidiu, false);
  assert.equal(guardarSaldoERP({erpSaldoDecisao: {tipo: 'apagar', selo: 'ENTREGUE|2026-09-25'}}, antes, {pode: true}).decidiu, false);
  // Caso ruim: a cópia velha de uma aba traz a decisão antiga já carimbada; ela não refaz a decisão nova de outra pessoa.
  const nova = {tipo: 'manter', selo: 'ENTREGUE|2026-09-27', por: 'Gestor Dois', porId: '555666', em: '2026-09-28T10:00:00.000Z'};
  const eco = guardarSaldoERP({erpSaldoDecisao: {tipo: 'manter', selo: 'ENTREGUE|2026-09-25', por: 'Gestor Teste', porId: '111222', em: '2026-09-26T10:00:00.000Z'}},
    {erpSaldoDecisao: nova}, {pode: true, autor: {nome: 'Gestor Teste', porId: '111222'}, agora: '2026-09-29T10:00:00.000Z'});
  assert.equal(eco.decidiu, false);assert.deepEqual(eco.os.erpSaldoDecisao, nova);
  assert.ok(CAMPOS_AUDITADOS.includes('erpSaldoDecisao'));
});
