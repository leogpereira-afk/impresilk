'use strict';
/* U2 DA AUDITORIA DE 12/10/2026: para quem não é da gestão (montagem, operação,
   comercial) a Performance, o Modo TV, Entregas, a Programação e a ficha não
   afirmam coisa falsa. Com as O.S. podadas (U1: sem divisão, conferências e
   valores), a tela montada no aparelho mostrava R$ 0,00, "N sem valor",
   ranking vazio, "0% conferidas" e "No prazo" onde a gestão via "Conferência
   parcial". Agora: o ranking é o do servidor (o do link dos funcionários), na
   medida Produção e sem R$; as colunas e os totais de R$ não aparecem; e a
   conferência podada diz "Conferência só para a gestão". Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const texto = html => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NOV = {de:'2026-10-01', ate:'2026-10-10'};
const RANKING = {periodo:NOV, fechado:false, resumo:{equipes:2, entregasConfirmadas:5, equivalentes:3.5, aConferir:7, semBase:0},
  equipes:[{posicao:1, nome:'Águia fictícia', tipo:'equipe', logo:'', animal:'aguia', emblema:'', cor:'', entregas:3, equivalentes:2.5, faltaLideranca:0},
    {posicao:2, nome:'Leão fictício', tipo:'equipe', logo:'', animal:'leao', emblema:'', cor:'', entregas:2, equivalentes:1, faltaLideranca:1.5}]};
const card = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, tipo:'externo', instalacao:{data:'2026-11-05'},
  finalizadaEm:'2026-11-05T15:00:00-03:00', equipe:['900001', '900002'], ...extra});
function tela({papel = 'montagem', aba = 'equipe', lista = []} = {}) {
  const el = {innerHTML:'', querySelectorAll:() => [], querySelector:() => null};
  const pedidos = [];
  const ctx = vm.createContext({console, setTimeout:f => { ctx.__pend.push(f); return 0; }, __pend:[],
    STORE:{getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[], performancePCP:{equipes:[{id:'eq-a', nome:'Águia fictícia', cor:'marinho', animal:'aguia'}]}}), saveCFG() {}, uuid:() => 'id-1',
      elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), entreguesMes:() => null, pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), getQueue:() => [],
      api:async b => { if (b.action === 'performanceFechados') return {fechados:[]}; pedidos.push(b); if (b.action === 'performanceRankingEquipe') return structuredClone(RANKING); throw new Error('ação inesperada ' + b.action); }},
    STATE:{user:{papel}, _perfAba:aba, _fPerf:{...NOV}},
    document:{getElementById:() => el, querySelectorAll:() => [], querySelector:() => null, body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState:() => '', bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', wireFiltroPeriodo() {}, perfCompartilharRanking() {},
    CSS:{escape:x => x}, parseLocalDate:() => null, pessoaDoElenco:() => null, crachaEhToque:() => false,
    podeVerValores:() => ['admin', 'pcp'].includes(papel)});
  for (const f of ['operacao-revisao.js', 'operacao.js', 'divisao.js', 'regras.js', 'casa.js', 'relatorios-entregas.js', 'comissao.js', 'comissao-ui.js', 'performance.js', 'perdas.js']) vm.runInContext(ler(f), ctx);
  const carregar = async () => { while (ctx.__pend.length) { const f = ctx.__pend.shift(); await f(); } };
  return {ctx, pedidos, run:c => vm.runInContext(c, ctx), carregar, async render() { vm.runInContext('renderPerformanceCasa()', ctx); await carregar(); vm.runInContext('renderPerformanceCasa()', ctx); return el.innerHTML; }};
}

for (const papel of ['montagem', 'operacao', 'comercial']) test(`U2 (${papel}): o ranking é o do servidor, na medida Produção, sem R$ e não vazio`, async () => {
  // As O.S. chegam podadas (U1): sem divisão, conferência nem valor. No fbc56b9, o ranking do aparelho ficava vazio.
  const t = tela({papel, lista:[card('A1'), card('A2', {conferenciaSoGestao:true})]});
  const html = await t.render();
  assert.deepEqual(t.pedidos.map(p => [p.action, p.de, p.ate]), [['performanceRankingEquipe', '2026-10-01', '2026-10-10']]);
  assert.match(html, /Produção confirmada/);
  assert.match(texto(html), /Águia fictícia .*2,5 O\.S\. equivalentes confirmadas/);
  assert.match(texto(html), /5 de 12 entregas conferidas pela gestão · 7 a conferir/);
  assert.doesNotMatch(texto(html), /R\$ ?\d|Valor confirmado|sem valor/);assert.doesNotMatch(html, /data-perf-rank-medida="valor"/);
  // Uma contagem só de "a conferir" (U3): o selo da aba é o do servidor.
  assert.equal(t.run('perfConferenciaPendentes()'), 7);
  // A Conferência e o Relatório não mostram percentuais nem "0% conferidas".
  t.ctx.STATE._perfAba = 'conferencia';
  const conf = await t.render();
  assert.match(conf, /é da gestão do PCP/);assert.doesNotMatch(texto(conf), /Divisão sugerida|%/);
  t.ctx.STATE._perfAba = 'relatorio';
  const rel = texto(await t.render());
  assert.match(rel, /são da gestão do PCP/);assert.doesNotMatch(rel, /0% |0 O\.S\. eq|R\$ ?\d|Histórico de bônus manual|PDF com O\.S\./);
});

test('U2: o Modo TV de quem não é da gestão mostra o ranking do servidor, sem o painel das pessoas', async () => {
  const t = tela({papel:'operacao'});
  await t.render();
  t.run(`carrosHTML=()=>'';retrabalhoHTML=()=>'';`);
  const p = t.run(`painelTVCasa(0, {de:'2026-10-01', ate:'2026-10-10'})`);
  assert.equal(p.total, 3);
  assert.match(texto(p.html), /Produção confirmada das equipes Período aberto, resultado provisório .*Águia fictícia .*2,5/);
  assert.doesNotMatch(texto(p.html), /Nenhuma produção confirmada|Participação nas entregas/);
});

test('U2: a gestão continua com a apuração do aparelho e o R$ (nada muda para admin e pcp)', async () => {
  const t = tela({papel:'pcp'});
  t.run(`perfRemoto.chave=perfChave();perfRemoto.tentado=true;perfRemoto.dados={consultadoEm:'2026-11-30T10:00:00',fonte:'teste',periodo:STATE._fPerf,registros:[],hash:'h'};`);
  const html = await t.render();
  assert.ok(!t.pedidos.some(p => p.action === 'performanceRankingEquipe'), 'a gestão não usa o ranking dos funcionários: '+JSON.stringify(t.pedidos.map(p=>p.action)));
  assert.match(html, /data-perf-rank-medida="valor"/);
});

test('U2: a fila de lançamento de Entregas não mostra R$, coluna Valor nem "sem valor" para quem não é da gestão', () => {
  const os = [card('L1', {finalizadaEm:'2026-11-03T12:00:00-03:00'}), card('L2', {finalizadaEm:'2026-11-04T12:00:00-03:00'})];
  for (const [papel, ve] of [['operacao', false], ['montagem', false], ['admin', true]]) {
    const t = tela({papel});
    t.ctx.STATE._entFilaAberta = true;
    const html = t.ctx.filaLancarHTML(os, NOV, '2026-11-10');
    assert.equal(/R\$|sem valor|>Valor<|Maior valor/.test(html), ve, papel);
  }
});

test('U2: a ficha diz "Conferência só para a gestão" quando a conferência foi podada, não "No prazo"', () => {
  const src = ler('app.js');
  const i = src.indexOf('function statusEntregaDe(os)'), j = src.indexOf('const podeCancelarOS');
  const ctx = vm.createContext({esc:s => String(s ?? ''), temStatusEntrega:() => true, contextoStatusDe:() => ({}), CONFERENCIA_ENTREGA:{estado:() => ({situacao:'parcial', resumo:'parcial'})},
    OPERACAO:{statusEntrega:() => ({estado:'no_prazo', rotulo:'No prazo', motivo:'entregue em 05/11, dentro do prazo', aplicaveis:[]})}});
  vm.runInContext(src.slice(i, j), ctx);
  const podada = ctx.statusEntregaDe({conferenciaSoGestao:true});
  assert.equal(podada.conferenciaSoGestao, true);
  assert.match(ctx.seloStatusEntregaHTML(podada), />Conferência só para a gestão</);
  assert.doesNotMatch(ctx.seloStatusEntregaHTML(podada), /No prazo/);
  assert.match(ctx.seloStatusEntregaHTML(ctx.statusEntregaDe({})), /No prazo/, 'sem a marca, o selo de sempre');
});

test('U2: o servidor marca a O.S. com conferência podada (conferenciaSoGestao) para quem não é da gestão', async () => {
  const os = {id:'1', rev:1, numero:'T1', equipe:['900001'], finalizadaEm:'2026-10-05T12:00:00Z',
    conferenciasEntrega:[{id:'e1', dia:'2026-10-05', itens:[], alocacao:{grupos:[]}, por:'Gestor', porId:'900009', em:'2026-10-05T12:00:00Z'}]};
  const e = await edge('pcp-sync', {pcp_registros:[{colecao:'os', id:'1', registro:os, apagado:false, atualizado_em:'2026-10-05T12:00:00Z'}, {colecao:'os', id:'2', registro:{...os, id:'2', numero:'T2', conferenciasEntrega:undefined}, apagado:false, atualizado_em:'2026-10-05T12:00:00Z'}]});
  const l = await e.call({action:'list', since:'2000-01-01'}, {papel:'operacao', nome:'Operação Teste', sub:'op1'});
  assert.equal(l.os.find(o => o.id === '1').conferenciaSoGestao, true);
  assert.ok(!('conferenciaSoGestao' in l.os.find(o => o.id === '2')));
  const g = await e.call({action:'list', since:'2000-01-01'}, {papel:'pcp', nome:'Gestor Teste', sub:'g1'});
  assert.ok(!('conferenciaSoGestao' in g.os.find(o => o.id === '1')), 'a gestão recebe a conferência inteira');
});
