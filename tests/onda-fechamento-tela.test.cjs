'use strict';
/* A ONDA "FECHAMENTO" DO PCP (fila única de 11/10/2026), na TELA. Cada teste
   começa pelo caso ruim, o que a v166 mostrava ou deixava passar. Dados
   fictícios: nenhuma pessoa, O.S. ou valor real.
   - item 1: o selo "Mês aberto, resultado provisório" no ranking da gestão,
     no Modo TV e no ranking.html, e a palavra "Prévia" no PDF;
   - item 2: a cobertura dentro da confirmação do Fechar, com a frase abaixo
     de 50%;
   - item 3: o Fechar diz por que o período não fecha (mês inteiro, mês que não
     terminou, sobreposição);
   - item 29: a faixa de cobertura acima do pódio e o aviso forte abaixo de 50%;
   - M8: o mês fechado abre na última revisão, com o aviso do que mudou, o que
     muda por pessoa e o aviso no Conferir; as revisões lidas à parte;
   - M7: o diálogo da conferência por entrega diz o mês fechado antes de salvar;
   - item 11: o aviso do mês que terminou sem fechamento, só desde novembro;
   - item 12: "Revisão N, substituída pela N+1" na tela, no PDF e no
     demonstrativo;
   - item 14: o 409 "tente de novo" da apuração repete a consulta sozinho;
   - item 4: a comissão prevista da O.S. cancelada conta a parte conferida. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
const NOV = {de:'2026-11-01', ate:'2026-11-30'};

function tela({papel = 'pcp', periodo = NOV, hoje = '2026-12-02', api = null, fila = [], os = []} = {}) {
  const chamadas = [], toasts = [];
  const c = {console, setTimeout, clearTimeout, chamadas, toasts,
    STORE:{getCFG:() => ({performancePCP:{equipes:[], participacoes:[]}}), getAllOS:() => os, getQueue:() => fila, getOS:id => os.find(o => o.id === id) || null, uuid:() => 'req-ficticio-0001',
      api:async corpo => { chamadas.push(corpo); return api ? api(corpo) : {}; }},
    STATE:{user:{papel}, _perfPessoaMedida:'valor', _perfRankMedida:'valor', _fPerf:{...periodo}},
    periodoOuMes:() => ({...c.STATE._fPerf}), classificarEntregas:xs => ({instalacoes:xs, aLancar:[]}),
    diaEntrega:o => String((o && o._perf && o._perf.dia) || (o && o.entregaLancada && o.entregaLancada.data) || '2026-11-10').slice(0, 10),
    valorDaOS:o => o.valorTotal, nomeExibicaoCasa:n => ({chave:n, nome:'Pessoa ' + n}), pessoasRH:() => [], avatarRH:() => '', esc,
    dinheiroCasa:n => 'R$ ' + Number(n).toFixed(2), filtroPeriodoHTML:() => '', normCasa:s => String(s || '').toLowerCase(),
    renderPerformanceCasa:() => {}, toast:(m, t) => toasts.push([m, t || '']), perfCasaTemAbaConferencia:() => true,
    FormData:class { constructor(f) { this.f = f; } get(k) { return (this.f.valores || {})[k]; } }};
  vm.createContext(c);
  vm.runInContext(ler('operacao.js'), c);
  vm.runInContext(ler('divisao.js'), c);
  vm.runInContext(ler('performance.js'), c);
  c.perfHojeISO = () => hoje;
  return c;
}
const pessoa = (id, pct = 100) => ({chave:id, nome:'Pessoa ' + id, percentual:pct});
const reg = (id, valor, membros = [pessoa('900001')], extra = {}) => ({id, numero:'9' + id.replace(/\D/g, '').padStart(4, '0'), cliente:'Cliente fictício', dia:'2026-11-10', valor, membros, confirmado:true, fonte:'alocacao', equipeId:'', retornoConf:null, voltou:false, ...extra});
const fonte = (registros, extra = {}) => ({periodo:{...NOV}, regra:'performance-3', regraNota:'nota-valor-1', registros, hash:'hash-ficticio', consultadoEm:'2026-12-02T10:00:00Z', completo:true, fonte:'teste', ...extra});
const selo = (revisao, registros, extra = {}) => ({...fonte(registros), id:'2026-11-01:2026-11-30:' + String(revisao).padStart(6, '0'), de:NOV.de, ate:NOV.ate, revisao, fechadoEm:'2026-12-0' + revisao + 'T12:00:00Z', fechadoPor:'Gestor fictício', motivo:'Fechamento fictício', ...extra});
function base(c, dados, {fechamentos = [], selecionado = ''} = {}) {
  c.__f = dados; c.__h = fechamentos; c.__s = selecionado;
  vm.runInContext('perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__s;perfRemoto.tentado=true;perfFechados.tentado=true;', c);
  return c;
}
const regsTela = c => c.perfRegsDoPeriodo();

/* -------------------------------------------------------------- item 1 */
test('item 1: o mês sem fechamento leva o selo "Mês aberto, resultado provisório" e o PDF diz "Prévia"; a revisão fechada não', () => {
  const c = base(tela(), fonte([reg('a1', 300)]));
  const situacao = c.perfSituacaoHTML(c.perfSituacao(regsTela(c)));
  assert.match(situacao, /<span class="perf-situacao provisorio">Mês aberto, resultado provisório<\/span><span class="perf-situacao ok">Participações confirmadas<\/span>/);
  assert.match(c.perfRankingEquipesHTML(regsTela(c), c.perfConfig(), 'todas'), /Mês aberto, resultado provisório/);
  assert.match(c.perfFonteTexto(), /^Prévia: mês aberto, resultado provisório\. Base compartilhada do PCP/);
  // A Jornada e o Relatório também diziam só "Apuração em andamento".
  assert.match(c.perfJornadaHTML(regsTela(c), c.perfConfig()), /<span class="perf-jornada-selo">Mês aberto, resultado provisório<\/span>/);
  assert.match(c.performanceRelatorioHTML(), /<span class="perf-report-state">Mês aberto, resultado provisório<\/span>/);
  // O mês corrente até hoje (o período padrão) também é o mês aberto.
  const h = tela({hoje:'2026-11-19', periodo:{de:'2026-11-01', ate:'2026-11-19'}});
  assert.match(h.perfSituacaoHTML(null), /Mês aberto, resultado provisório/);
  // Recorte que não é o mês inteiro nem o mês até hoje: período aberto.
  c.STATE._fPerf = {de:'2026-11-01', ate:'2026-11-19'};
  base(c, {...fonte([reg('a1', 300)]), periodo:{de:'2026-11-01', ate:'2026-11-19'}});
  assert.match(c.perfSituacaoHTML(null), /Período aberto, resultado provisório/);
  // A revisão fechada é o resultado: sem o selo e sem a palavra Prévia.
  c.STATE._fPerf = {...NOV};
  const s1 = selo(1, [reg('a1', 300)]);
  base(c, fonte([reg('a1', 300)]), {fechamentos:[s1], selecionado:s1.id});
  assert.doesNotMatch(c.perfSituacaoHTML(c.perfSituacao(regsTela(c))), /provisório/);
  assert.doesNotMatch(c.perfFonteTexto(), /Prévia/);
  // Os dados atuais de um mês fechado também são provisórios.
  base(c, fonte([reg('a1', 300)]), {fechamentos:[s1], selecionado:''});
  assert.match(c.perfSituacaoHTML(null), /Dados atuais, fora do fechamento: resultado provisório/);
  // Montagem e operação veem a prévia do aparelho, com o selo também.
  const m = tela({papel:'montagem'});
  assert.match(m.perfSituacaoHTML(null), /Mês aberto, resultado provisório/);
});
test('item 1: o Modo TV mostra o selo do mês aberto no topo; a revisão fechada não', () => {
  const s = ler('casa.js'), P = require('../performance.js');
  const tv = extra => {
    const ctx = {PERF:P, STATE:{}, perfConfig:() => ({equipes:[]}), perfLista:() => [], perfRegistro:r => r, perfUnirPessoas:r => r, diaEntrega:() => '', OPERACAO:{emIntervalo:() => true}, esc, avatarRH:() => '', pessoasRH:() => [], perfFormato:String, carrosHTML:() => '', retrabalhoHTML:() => '', rotuloPeriodoCasa:() => '', ...extra};
    vm.createContext(ctx); vm.runInContext(s.slice(s.indexOf('function painelTVCasa('), s.indexOf('function rotuloPeriodoCasa(')), ctx);
    return ctx.painelTVCasa(0, {}).html;
  };
  assert.match(tv({perfFonteAtual:() => ({consultadoEm:'x'}), perfSeloAberto:() => ({tipo:'provisorio', texto:'Mês aberto, resultado provisório'})}), /<span class="tv-selo">Mês aberto, resultado provisório<\/span>/);
  assert.doesNotMatch(tv({perfFonteAtual:() => ({fechadoEm:'2026-12-02'}), perfSeloAberto:() => null}), /tv-selo/);
  // Sem o performance.js novo (cache misto), o mesmo texto, salvo na revisão fechada.
  assert.match(tv({perfFonteAtual:() => null}), /Mês aberto, resultado provisório/);
  assert.doesNotMatch(tv({perfFonteAtual:() => ({fechadoEm:'2026-12-02'})}), /tv-selo/);
});
test('item 1 e verificação da v166: o ranking.html diz "Prévia · Mês aberto" no mês sem fechamento e mostra o aviso sem as decisões', async () => {
  const els = new Map();let entrou = false;
  const elemento = () => ({hidden:false, value:'', textContent:'', disabled:false, children:[], replaceChildren(...xs) { this.children = xs; }, append(...xs) { this.children.push(...xs); }, setAttribute() {}, focus() {}});
  const el = id => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  let resposta = {periodo:NOV, atualizadoEm:'2026-12-02T13:00:00Z', fechado:false, resumo:{equipes:0, entregasConfirmadas:0, equivalentes:0, aConferir:0, semBase:0}, equipes:[], avisoDecisoes:'Não foi possível ler as decisões da comissão agora.'};
  const ctx = {Intl, Date, console, AbortController, setTimeout, clearTimeout, API_BASE:'', API_FN:{os:'ranking-api'}, document:{hidden:false, getElementById:el, createElement:elemento, addEventListener() {}}, window:{addEventListener() {}, print() {}}, setInterval() {},
    AUTH:{temCracha:() => entrou, dono:() => entrou ? {nome:'Ana', papel:'montagem'} : null, cracha:() => '', login:async () => { entrou = true; return {}; }}, fetch:async () => ({ok:true, status:200, json:async () => resposta})};
  vm.runInNewContext(ler('ranking.js'), ctx);
  await el('ranking-login-form').onsubmit({preventDefault() {}});
  assert.match(el('ranking-recorte').textContent, /01\/11\/2026 a 30\/11\/2026 · Prévia · Mês aberto, resultado provisório/);
  assert.equal(el('ranking-sem-base').hidden, false);assert.match(el('ranking-sem-base').textContent, /Não foi possível ler as decisões/);
  resposta = {...resposta, fechado:true, revisao:2, avisoDecisoes:undefined};
  el('ranking-periodo').onsubmit({preventDefault() {}});
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  assert.match(el('ranking-recorte').textContent, /Período fechado · revisão 2/);assert.doesNotMatch(el('ranking-recorte').textContent, /Prévia/);
});

/* -------------------------------------------------------------- item 3 */
test('item 3: o Fechar diz por que o período não fecha: mês que não terminou, recorte que não é o mês, sobreposição', () => {
  const c = tela();
  // O caso ruim: a v166 deixava fechar de 01 a 19/11 (só o "até hoje" valia).
  assert.equal(c.perfTravaMes({de:'2026-11-01', ate:'2026-11-19'}, '2026-12-02'), 'O fechamento é só de mês inteiro, do dia 01 ao último dia. Escolha o mês no período.');
  assert.equal(c.perfTravaMes({de:'2026-11-01', ate:'2026-11-30'}, '2026-11-30'), 'O mês ainda não terminou: novembro de 2026 pode ser fechado a partir de 01/12/2026.');
  assert.equal(c.perfTravaMes({de:'2026-12-01', ate:'2026-12-02'}, '2026-12-02'), 'O mês ainda não terminou: dezembro de 2026 pode ser fechado a partir de 01/01/2027.');
  assert.equal(c.perfTravaMes(NOV, '2026-12-01'), '');
  vm.runInContext("perfFechados.lista=[{de:'2026-10-20',ate:'2026-11-10',revisoes:1,ultimaRevisao:1}]", c);
  assert.match(c.perfTravaMes(NOV, '2026-12-02'), /se sobrepõe a um período já fechado \(20\/10\/2026 a 10\/11\/2026\)/);
  // Na tela: o botão desligado com o motivo e o atalho para o mês inteiro.
  const d = tela();d.STATE._fPerf = {de:'2026-11-01', ate:'2026-11-19'};
  base(d, {...fonte([reg('a1', 300)]), periodo:{de:'2026-11-01', ate:'2026-11-19'}});
  const html = d.perfFonteHTML();
  assert.match(html, /<button type="button" class="btn-ghost" id="perf-fechar" disabled/);
  assert.match(html, /data-perf-mes-inteiro="2026-11">Escolher novembro de 2026 inteiro/);
});

/* -------------------------------------------------------------- item 2 */
function botaoEDialogo(c) {
  const botao = {onclick:null}, el = {querySelector:sel => sel === '#perf-fechar' ? botao : null, querySelectorAll:() => []};
  const dlg = {html:'', titulo:'', open:true, els:{}, close() { this.open = false; }};
  dlg.querySelector = sel => dlg.els[sel] || (dlg.els[sel] = {textContent:'', value:'', disabled:false, valores:{motivo:'Fechamento fictício do mês'}});
  c.perfDialog = (t, h) => { dlg.titulo = t; dlg.html = h; return dlg; };
  c.perfWireFonte(el);
  return {botao, dlg};
}
test('item 2: a confirmação do Fechar mostra X de Y entregas, a %, o R$ que fica de fora e pede a frase abaixo de 50%', async () => {
  const cob = {entregas:1, entregasCentavos:30000, entregasSemValor:0, aLancar:2, aLancarCentavos:70000, aLancarSemValor:1, aLancarNumeros:['90001', '90002'], pctValor:30, baixa:true};
  const c = base(tela({api:corpo => corpo.action === 'performanceFechar' ? {ok:true, fechamento:{id:'x'}} : {}}), fonte([reg('a1', 300)], {cobertura:cob}));
  const {botao, dlg} = botaoEDialogo(c);
  botao.onclick();
  assert.equal(dlg.titulo, 'Fechar novembro de 2026');
  assert.match(dlg.html, /<strong>1 de 3 entregas<\/strong> do mês entram no fechamento \(33%\) · <strong>30% do valor<\/strong>\. Ficam de fora 2 baixas do ERP a lançar: R\$ 700\.00 e 1 sem valor \(O\.S\. 90001, 90002\)\./);
  assert.match(dlg.html, /Cobertura baixa: só 30% do valor do mês está na base/);
  assert.match(dlg.html, /<input type="text" name="cobertura"/);
  const form = dlg.querySelector('form');form.valores = {motivo:'Fechamento fictício do mês'};
  await form.onsubmit({preventDefault() {}, target:form});
  assert.match(dlg.querySelector('#perf-fechar-erro').textContent, /escreva: fechar com cobertura baixa/);
  assert.equal(c.chamadas.filter(x => x.action === 'performanceFechar').length, 0, 'sem a frase, nada vai ao servidor');
  dlg.querySelector('input[name="cobertura"]').value = 'Fechar com cobertura baixa';
  await form.onsubmit({preventDefault() {}, target:form});
  const pedido = c.chamadas.find(x => x.action === 'performanceFechar');
  assert.equal(pedido.confirmaCobertura, 'Fechar com cobertura baixa');
  // Com 50% ou mais, sem a frase.
  const ok = base(tela(), fonte([reg('a1', 300)], {cobertura:{...cob, aLancar:0, aLancarCentavos:0, aLancarSemValor:0, aLancarNumeros:[], pctValor:100, baixa:false}}));
  const t2 = botaoEDialogo(ok);t2.botao.onclick();
  assert.match(t2.dlg.html, /<strong>1 de 1 entregas<\/strong> do mês entram no fechamento \(100%\) · <strong>100% do valor<\/strong>\. Nenhuma baixa do ERP fica de fora\./);
  assert.doesNotMatch(t2.dlg.html, /name="cobertura"/);
});

/* ------------------------------------------------------------- item 29 */
test('item 29: a faixa de cobertura vem acima do pódio; abaixo de 50% do valor o pódio fica, com o aviso forte', () => {
  const regs = [reg('a1', 300, [pessoa('900001')]), reg('a2', 200, [pessoa('900002')]), reg('a3', 100, [pessoa('900003')])];
  const cob = {entregas:3, entregasCentavos:60000, entregasSemValor:0, aLancar:2, aLancarCentavos:90000, aLancarSemValor:0, aLancarNumeros:['90004', '90005'], pctValor:40, baixa:true};
  const c = base(tela(), fonte(regs, {cobertura:cob}));
  c.STATE._perfModo = 'pessoas';
  const html = c.performanceEquipesHTML();
  const iCob = html.indexOf('class="perf-cobertura'), iRank = html.indexOf('class="perf-ranking'), iPodio = html.indexOf('class="perf-podio');
  assert.ok(iCob > 0 && iRank > 0 && iCob < iRank, 'a faixa vem antes do ranking (a v166 a pôs embaixo)');
  assert.ok(iPodio > iRank, 'o pódio continua à vista');
  assert.match(html, /Cobertura do mês: <strong>3 de 5 entregas<\/strong> no ranking, <strong>40% do valor<\/strong> · 2 baixas do ERP a lançar ficam de fora \(R\$ 900\.00\)/);
  assert.match(html, /<p class="perf-aviso perf-aviso-forte" role="note"><strong>Este pódio não representa o mês:<\/strong> só 40% do valor/);
  assert.ok(html.indexOf('perf-aviso-forte') < iPodio, 'o aviso vem antes do pódio');
  // Com metade ou mais do valor, sem o aviso forte.
  const bom = base(tela(), fonte(regs, {cobertura:{...cob, aLancar:1, aLancarCentavos:20000}}));
  bom.STATE._perfModo = 'pessoas';
  assert.doesNotMatch(bom.performanceEquipesHTML(), /perf-aviso-forte/);
});

/* --------------------------------------------------------- M8 e item 14 */
test('M8: o mês fechado abre na última revisão; as revisões são lidas à parte da apuração; Atualizar mantém os dados atuais escolhidos', async () => {
  const s1 = selo(1, [reg('a1', 300)]), s2 = selo(2, [reg('a1', 300)]);
  let falhaApuracao = false, falhaRevisoes = false;
  const api = corpo => {
    if (corpo.action === 'performancePeriodo') { if (falhaApuracao) throw new Error('Sem conexão com o servidor'); return fonte([reg('a1', 350), reg('a2', 100)]); }
    if (corpo.action === 'performanceFechamentos') { if (falhaRevisoes) return {error:'Banco indisponível'}; return {fechamentos:[s2, s1]}; }
    if (corpo.action === 'performanceFechados') return {fechados:[{de:NOV.de, ate:NOV.ate, revisoes:2, ultimaRevisao:2}], hoje:'2026-12-02'};
    return {};
  };
  const c = tela({api});
  await c.perfCarregarFonte();
  assert.equal(vm.runInContext('perfRemoto.selecionado', c), s2.id, 'abre na revisão 2 (a v166 abria nos dados atuais)');
  assert.equal(c.perfFonteAtual().revisao, 2);
  const aviso = c.perfAvisosHTML(true);
  assert.match(aviso, /Mês fechado: você está vendo a revisão 2, de [^.]+\. Há 2 mudanças nas entregas depois do fechamento \(1 entrega nova, 1 entrega mudou\)\. Elas não entram no selo/);
  assert.match(aviso, /data-perf-ver-atuais>Ver os dados atuais</);
  // A pessoa escolhe os dados atuais; Atualizar não a devolve à revisão.
  vm.runInContext("perfRemoto.selecionado='';perfRemoto.escolhido=true;", c);
  await c.perfCarregarFonte();
  assert.equal(vm.runInContext('perfRemoto.selecionado', c), '');
  assert.match(c.perfAvisosHTML(true), /Dados atuais, fora do fechamento: o que vale para este mês é a revisão 2/);
  // O que muda por pessoa na revisão 3.
  const porPessoa = c.perfMudancasPorPessoaHTML();
  assert.match(porPessoa, /O que muda por pessoa se você criar a revisão 3/);
  assert.match(porPessoa, /<strong>Pessoa 900001<\/strong>: muda · O\.S\. equivalentes 1 → 2 · valor confirmado R\$ 300\.00 → R\$ 450\.00/);
  // A apuração falhou: o mês fechado continua à vista pela revisão.
  falhaApuracao = true;
  const d = tela({api});await d.perfCarregarFonte();
  assert.equal(d.perfFonteAtual().revisao, 2);assert.match(vm.runInContext('perfRemoto.erro', d), /Sem conexão/);
  // As revisões falharam: os dados atuais aparecem e o Fechar fica desligado.
  falhaApuracao = false;falhaRevisoes = true;
  const e = tela({api});await e.perfCarregarFonte();
  assert.equal(e.perfFonteAtual().fechadoEm, undefined);assert.equal(e.perfFonteAtual().registros.length, 2);
  assert.match(e.perfAvisosHTML(true), /Não foi possível ler as revisões fechadas deste período \(Banco indisponível\)/);
  assert.equal(e.perfFechamentoBloqueio(e.perfFonteAtual(), 0), 'Não foi possível ler as revisões fechadas deste período. Toque em Atualizar apuração.');
});
test('item 14: o 409 "tente de novo" da apuração repete a consulta uma vez, sozinho', async () => {
  let n = 0;
  const c = tela({api:corpo => corpo.action === 'performancePeriodo' ? (++n === 1 ? {error:'A base mudou durante a consulta. Atualize para conferir novamente.', tenteDeNovo:true} : fonte([reg('a1', 300)])) : corpo.action === 'performanceFechamentos' ? {fechamentos:[]} : {}});
  await c.perfCarregarFonte();
  assert.equal(n, 2);assert.equal(vm.runInContext('perfRemoto.erro', c), '');assert.equal(c.perfFonteAtual().registros.length, 1);
});
test('M8: o Conferir de uma entrega num mês fechado avisa que a mudança não entra no selo', async () => {
  const os = [{id:'os1', numero:'90001', cliente:'Cliente fictício', equipe:['900001'], entregaLancada:{data:'2026-11-10'}, finalizadaEm:'2026-11-10T15:00:00Z'}];
  const c = base(tela({os}), fonte([reg('a1', 300)]));
  vm.runInContext("perfFechados.lista=[{de:'2026-11-01',ate:'2026-11-30',revisoes:1,ultimaRevisao:1}]", c);
  let html = '';
  const elemento = () => ({textContent:'', disabled:false, hidden:false, classList:{toggle() {}, add() {}, remove() {}}, onclick:null});
  c.perfDialog = (t, h) => { html = h; const els = {}; return {open:true, querySelector:sel => els[sel] || (els[sel] = elemento()), addEventListener() {}, close() {}}; };
  c.ALOCUI = {iniciar:() => ({antigo:false}), montar() {}, bloqueio:() => '', estado:() => ({}), esquecer() {}, repintar() {}};
  await c.perfEditarParticipacao('os1');
  assert.match(html, /A entrega de 10\/11\/2026 está num mês já fechado \(01\/11\/2026 a 30\/11\/2026, revisão 1\)\. O que você gravar aqui não entra no selo/);
  // Fora do mês fechado, sem o aviso.
  os[0].entregaLancada = {data:'2026-12-01'};html = '';
  await c.perfEditarParticipacao('os1');
  assert.doesNotMatch(html, /não entra no selo/);
});

/* ------------------------------------------------------------------ M7 */
test('M7: o diálogo da conferência por entrega diz o mês fechado (dia novo ou antigo) antes de salvar', () => {
  const c = {console};vm.createContext(c);vm.runInContext(ler('conferencia-entrega-ui.js'), c);
  const fechados = [{de:'2026-11-01', ate:'2026-11-30', revisoes:1, ultimaRevisao:1}];
  assert.equal(c.confTravaMesFechado(fechados, '', '2026-11-20'), 'O dia 20/11/2026 está num mês já fechado (01/11/2026 a 30/11/2026, revisão 1). Mês fechado não se recalcula: escolha o dia certo, num mês aberto.');
  assert.match(c.confTravaMesFechado(fechados, '2026-11-20', '2026-12-01'), /^Esta entrega foi conferida em 20\/11\/2026, num mês já fechado .* ela não pode mudar nem ir para outro mês\.$/);
  assert.equal(c.confTravaMesFechado(fechados, '', '2026-12-01'), '');
  assert.equal(c.confTravaMesFechado(null, '', '2026-11-20'), '', 'sem a lista (servidor antigo), nada se afirma: a porta confere');
  // O motivo trava o Salvar, antes dos outros.
  assert.match(ler('conferencia-entrega-ui.js'), /const motivo=mesFechado \|\| erro \|\| ALOCUI\.bloqueio\(chave\);/);
});

/* ------------------------------------------------------------- item 11 */
test('item 11: o aviso do mês que terminou sem fechamento começa em novembro e nunca empurra outubro', () => {
  const c = tela();
  assert.deepEqual([...c.perfMesesSemFechamento('2026-11-05', [])], [], 'outubro terminou, mas é teste: nenhum aviso');
  assert.deepEqual([...c.perfMesesSemFechamento('2026-12-01', [])], ['2026-11']);
  assert.deepEqual([...c.perfMesesSemFechamento('2027-02-10', [{de:'2026-11-01', ate:'2026-11-30'}])], ['2026-12', '2027-01']);
  // Na tela, só com a lista do servidor e só para quem fecha.
  assert.equal(c.perfAvisoMesSemFechamentoHTML(), '', 'sem a lista, nada se afirma');
  vm.runInContext('perfFechados.lista=[]', c);
  assert.match(c.perfAvisoMesSemFechamentoHTML(), /<strong>Novembro de 2026 terminou e ainda não foi fechado\.<\/strong>/);
  assert.match(c.perfAvisoMesSemFechamentoHTML(), /data-perf-abrir-mes="2026-11">Abrir novembro de 2026</);
  c.perfHojeISO = () => '2026-11-03';
  assert.equal(c.perfAvisoMesSemFechamentoHTML(), '');
  const m = tela({papel:'montagem'});vm.runInContext('perfFechados.lista=[]', m);
  assert.equal(m.perfAvisoMesSemFechamentoHTML(), '');
});

/* ------------------------------------------------------------- item 12 */
test('item 12: a revisão antiga diz "Revisão N, substituída pela N+1" na tela, no PDF e no demonstrativo', () => {
  const s1 = selo(1, [reg('a1', 300)]), s2 = selo(2, [reg('a1', 350)]);
  const c = base(tela(), fonte([reg('a1', 350)]), {fechamentos:[s2, s1], selecionado:s1.id});
  assert.match(c.perfSituacaoHTML(c.perfSituacao(regsTela(c))), /Revisão 1, substituída pela 2/);
  assert.match(c.perfFonteTexto(), /^Fechamento preservado · revisão 1 \(Revisão 1, substituída pela 2\)/);
  assert.match(c.perfFonteHTML(), /Revisão 1 · 2026-12-01 · Gestor fictício · substituída pela 2<\/option>/);
  assert.match(c.perfAvisosHTML(true), /Você está vendo a revisão 1, substituída pela 2/);
  vm.runInContext('perfRemoto.selecionado=perfRemoto.fechamentos[0].id', c);
  assert.doesNotMatch(c.perfFonteTexto(), /substituída/);
  // O demonstrativo da comissão.
  const k = {console, esc, dinheiroCasa:n => 'R$ ' + n};vm.createContext(k);vm.runInContext(ler('comissao-ui.js'), k);
  const apuracao = {config:{modo:'teste'}, pendencias:[], linhas:[], totalCentavos:0, ajustes:[], reconhecimento:{situacao:'pendente', aviso:'', criterios:{}, equipes:[]}};
  const r1 = {revisao:1, tipo:'previa', em:'2026-12-03T10:00:00Z', autor:{nome:'Gestor fictício'}, motivo:'Prévia fictícia', apuracao};
  const r2 = {...r1, revisao:2, tipo:'aprovacao', em:'2026-12-04T10:00:00Z'};
  assert.match(k.comissaoResumoHTML(r1, [r2, r1]), /<strong>Revisão 1, substituída pela 2<\/strong>/);
  assert.match(k.comissaoResumoHTML(r1, [r2, r1]), /<h4>Revisão 1, substituída pela 2 · Prévia para revisão · Teste, sem exportação para pagamento<\/h4>/);
  assert.doesNotMatch(k.comissaoResumoHTML(r2, [r2, r1]), /substituída/);
});

/* -------------------------------------------------------------- item 4 */
test('item 4: a comissão prevista (Por O.S.) da O.S. cancelada conta a parte que a gestão conferiu', () => {
  const AGORA = '2026-10-20T12:00:00-03:00';
  const C = require('../conferencia-entrega.js'), D = require('../divisao.js');
  const os = {id:'c1', numero:'90101', tipo:'externo', cliente:'Cliente fictício', servico:'Fachada fictícia', valorTotal:8500, equipe:['900001'], prazoCombinado:{data:'2026-10-05', fonte:'agenda'},
    itens:[{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'4', subtotal:'5000'}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'1', subtotal:'5000'}],
    cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço fictício', por:'Gestor fictício', em:'2026-10-07T10:00:00Z'}};
  const i = C.catalogo(os)[0];
  os.conferenciasEntrega = [{id:'e1', dia:'2026-10-05', itens:[{chave:i.chave, identidade:i.identidade, qtde:2}], alocacao:D.montar([{equipeId:null, liderId:'900001', membros:['900001']}])}];
  const lista = [os], erp = [{numero:'90101', cliente:'Cliente fictício', data:'2026-10-05', valor:8500, tipo:'externo'}];
  const cfg = {instaladores:[], performancePCP:{equipes:[], participacoes:[]}};
  const ctx = vm.createContext({console, setTimeout, clearTimeout,
    Date:class extends Date { constructor(...a) { super(...(a.length ? a : [AGORA])); } static now() { return +new Date(AGORA); } },
    STORE:{JANELA_LOCAL_DIAS:60, getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => cfg, elenco:() => ({pessoas:[{id:'900001', nome:'Pessoa fictícia'}], veiculos:[], ferias:[], ausencias:[]}),
      entreguesMes:m => ({v:3, os:erp.filter(o => String(o.data).slice(0, 7) === m), em:'2026-10-20T10:00:00'}), pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), historico:() => [], buscarHistorico:async () => ({itens:[]})},
    STATE:{user:{papel:'pcp', nome:'Gestão de teste'}, _fEnt:{de:'2026-10-01', ate:'2026-10-20'}, _entVista:'poros', _porOS:{}},
    document:{getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}}, esc:s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch])),
    emptyState:(i, t) => `<div class="vazio">${t}</div>`, bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', parseLocalDate:() => null, pessoaDoElenco:() => null});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'conferencia-entrega.js', 'casa.js', 'relatorios-entregas.js', 'performance.js', 'entregas-os.js']) vm.runInContext(ler(f), ctx, {filename:f});
  vm.runInContext(`OPERACAO.usarPessoas(() => ({pessoas: STORE.elenco().pessoas, vinculos: [], lista: []}));
    var wireFiltroPeriodo = () => {}; var wireQuadrosCasa = () => {};
    var __el = {innerHTML: '', querySelectorAll: () => [], querySelector: () => ({value: ''})};
    document.getElementById = id => id === 'panel-entregas' ? __el : null;`, ctx);
  const html = vm.runInContext('renderEntregas(); __el.innerHTML', ctx);
  const cartao = (html.split('aria-label="O.S 90101"')[1] || '').split('</article>')[0];
  const comissao = (cartao.match(/<dt>Comissão prevista<\/dt><dd>([\s\S]*?)<\/dd>/) || ['', ''])[1];
  assert.match(comissao, /<b>R\$\s?21,25<\/b>/, 'a v166 dava R$ 0,00: pulava a parte entregue da O.S. cancelada');
  assert.match(comissao, /O\.S\. cancelada: o saldo foi cancelado e a parte conferida continua valendo/);
});
