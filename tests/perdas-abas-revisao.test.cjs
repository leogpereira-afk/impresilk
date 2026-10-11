'use strict';
/* REVISÃO DA ONDA W3 (abas Conferência e Perdas por retrabalho, 11/10/2026).
   As revisões de corretude (R1 a R7) e de uso (U1 a U9) acharam onde a aba
   nova dizia uma coisa e o resto do PCP outra. Cada teste "revisão
   onda-w3-abas: ..." começa pelo caso ruim e falha antes do conserto. O U1
   (a ficha e o Por O.S.) mora em tests/v144-revisao.test.cjs e em
   tests/entregas-por-os.test.cjs, com o harness de cada tela.
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const existe = f => fs.existsSync(path.join(root, f));
const COMISSAO = require('../comissao.js');
const OPERACAO = require('../operacao.js');
const PERDAS = require('../perdas.js');
const texto = html => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const QUINZENA = {de:'2026-11-01', ate:'2026-11-15'};
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const pessoa = (chave, nome, percentual) => ({chave, nome, percentual});
const card = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, tipo:'externo', instalacao:{data:'2026-11-05'},
  prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, finalizadaEm:'2026-11-05T15:00:00-03:00', equipe:['900001', '900002'], valorTotal:1200,
  // TROCADO DE PROPÓSITO (onda a3, D-010): a ficha padrão é de retrabalho de Produção. A de Instalação é perda automática; estes testes são da falha comprovada (D-004), que a gestão decide.
  retrabalho:true, problema:'Adesivo descolou na borda', etapaOrigem:'Produção', causaRaiz:'Erro humano', responsavelEtapa:'Setor fictício',
  dataRetrabalho:'2026-11-06', retrabalhoPerguntado:{resposta:'sim', por:'Gestora fictícia', em:'2026-11-06T10:15:00-03:00'}, ...extra});
const semRetrabalho = {retrabalho:false, problema:'', etapaOrigem:'', causaRaiz:'', retrabalhoPerguntado:{resposta:'nao', por:'Gestora fictícia', em:'2026-11-08T10:00:00-03:00'}};
const registro = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, dia:'2026-11-05', valor:1200, origemValor:'O.S. do PCP',
  membros:[pessoa('900001', 'Pessoa Um', 60), pessoa('900002', 'Pessoa Dois', 40)], confirmado:true, fonte:'participacao', retrabalho:false, ...extra});
const entregasDoc = (regs, interna = {...doc, situacao:'nao_aplicavel'}) => Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:r.membros[0].chave}], interna}]));
const fechamento = (regs, periodo = NOV) => ({id:'fechamento-ficticio-1', revisao:1, fechadoEm:'2026-12-01T10:00:00Z', fechadoPor:'Gestora fictícia', periodo:{...periodo}, ...periodo, registros:regs});
function revisaoDe(fonte, decisoes, n = 1, interna) {
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes, entregas:entregasDoc(fonte.registros, interna)};
  return {...fonte.periodo, id:fonte.periodo.de + ':' + fonte.periodo.ate + ':00000' + n, revisao:n, tipo:'previa', em:'2026-12-01T11:00:00Z', fechamentoId:fonte.id, entrada,
    apuracao:COMISSAO.apurar(fonte, entrada, {aprovacoes:[]})};
}

/* A tela inteira (casa.js, performance.js, comissao-ui.js e perdas.js) num vm, como em perdas-abas.test.cjs. */
function tela({papel = 'pcp', aba = 'equipe', lista = [], registros = [], revisoes = [], cobrem, fechamentos = [], periodo = NOV} = {}) {
  const el = {innerHTML:'', querySelectorAll:() => [], querySelector:() => null};
  const guardado = new Map();
  const ctx = vm.createContext({console,
    STORE:{getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[], performancePCP:{equipes:[], participacoes:[]}}), saveCFG() {}, uuid:() => 'id-1',
      elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), entreguesMes:() => null, pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), getQueue:() => []},
    STATE:{user:{papel}, _perfAba:aba, _fPerf:{...periodo}, _perfModo:'pessoas'},
    document:{getElementById:() => el, querySelectorAll:() => [], querySelector:() => null, body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:k => guardado.has(k) ? guardado.get(k) : null, setItem:(k, v) => guardado.set(k, String(v)), removeItem:k => guardado.delete(k)},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState:() => '', bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', wireFiltroPeriodo() {}, abrirTVCasa() {}, perfCompartilharRanking() {},
    CSS:{escape:x => x}, parseLocalDate:() => null, pessoaDoElenco:() => null, crachaEhToque:() => false});
  for (const f of ['operacao-revisao.js', 'operacao.js', 'divisao.js', 'regras.js', 'casa.js', 'relatorios-entregas.js', 'comissao.js', 'comissao-ui.js', 'performance.js', 'perdas.js']) if (existe(f)) vm.runInContext(ler(f), ctx);
  ctx.__regs = registros; ctx.__rev = revisoes; ctx.__cobrem = cobrem; ctx.__fech = fechamentos;
  vm.runInContext(`perfRemoto.chave=perfChave();perfRemoto.tentado=true;perfRemoto.dados={consultadoEm:'2026-11-30T10:00:00',fonte:'teste',periodo:STATE._fPerf,registros:__regs,hash:'h'};perfRemoto.fechamentos=__fech;`, ctx);
  vm.runInContext(`perdasRemoto={chave:perfChave(),revisoes:__rev,cobrem:__cobrem,carregando:false,erro:'',tentado:true};`, ctx);
  return {ctx, guardado, run:c => vm.runInContext(c, ctx), render() { vm.runInContext('renderPerformanceCasa()', ctx); return el.innerHTML; }};
}
// Um "el" falso para os wires: guarda os botões achados pelo seletor, para o teste clicar.
const elFalso = botoes => ({querySelectorAll:sel => Object.entries(botoes).filter(([k]) => sel.includes(k)).flatMap(([, v]) => v), querySelector:() => null});

/* ------------------------------------------------------------- servidor real */
const gestor = {papel:'pcp', nome:'Gestor fictício', sub:'gestor', exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const osDoBanco = (id, equipe, extra = {}) => ({colecao:'os', id, apagado:false, atualizado_em:'2020-01-01', registro:{id, numero:'T-' + id, tipo:'externo', cliente:'Cliente fictício ' + id,
  finalizadaEm:'2026-11-10T15:00:00Z', equipe, valorTotal:1200, ...extra}});
async function servidorComFalha(requestBase) {
  const ids = ['100001', '100002'];
  const e = await edge('pcp-sync', {
    // TROCADO DE PROPÓSITO (onda a3, D-010): origem Produção; a de Instalação seria perda automática, sem decisão.
    pcp_registros:[osDoBanco('osA', ids, {retrabalho:true, etapaOrigem:'Produção', causaRaiz:'Erro humano'})],
    registros:ids.map((id, i) => ({colecao:'colaboradores', id:'p' + i, apagado:false, registro:{id:'p' + i, nome:'Pessoa ' + (i + 1), cpf:id + '12345'}})),
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[
      {id:'osA', membros:[pessoa('100001', 'Pessoa 1', 60), pessoa('100002', 'Pessoa 2', 40)], por:'Gestor', em:'2026-11-10'}]}}}],
    painel_ordens:[]});
  relogio(e, '2026-12-02T12:00:00Z');
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  const fech = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:requestBase + '-fechar-01', motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
  assert.equal(fech.ok, true, JSON.stringify(fech));
  const f = fech.fechamento;
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes:{osA:{...doc, decisao:'falha_comprovada', tipo:'incompleto'}}, entregas:entregasDoc(f.registros)};
  const p1 = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.id, anterior:'', entrada, motivo:'Prévia fictícia 1', requestId:requestBase + '-previa-01'}, gestor);
  assert.equal(p1.ok, true, JSON.stringify(p1));
  const cards = new Map(e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => [r.id, r.registro]));
  return {e, f, p1, cards};
}

test('revisão onda-w3-abas: R1, a decisão do demonstrativo do mês vale num recorte do mesmo mês (servidor real)', async () => {
  const {e, cards} = await servidorComFalha('r1');
  // O mês inteiro: a decisão aparece, como antes.
  const mes = await e.call({action:'performanceComissaoListar', ...NOV}, gestor);
  assert.equal(PERDAS.decisaoDaOS('osA', mes.revisoes[0]).codigo, 'falha_comprovada');
  // Caso ruim: a quinzena do mesmo mês listava 0 revisões, e a O.S. julgada no mês aparecia "a decidir".
  const q = await e.call({action:'performanceComissaoListar', ...QUINZENA}, gestor);
  assert.equal(q.revisoes.length, 0, 'a lista do período exato continua a mesma');
  assert.ok(Array.isArray(q.cobrem), 'o servidor manda os demonstrativos que cobrem o recorte');
  assert.equal(q.cobrem.length, 1);
  assert.equal(q.cobrem[0].de, '2026-11-01');
  assert.equal(q.cobrem[0].ate, '2026-11-30');
  assert.ok(!('hash' in q.cobrem[0]) && !('assinatura' in q.cobrem[0]), 'o resumo leva só o que a aba lê');
  const ds = PERDAS.demonstrativos(q, QUINZENA);
  assert.equal(ds.length, 1);
  assert.equal(ds[0].exato, false);
  const base = await e.call({action:'performancePeriodo', ...QUINZENA, notaPorValor:true}, gestor);
  assert.ok(base.registros.some(r => r.id === 'osA'), 'premissa: a O.S. está no recorte');
  const m = PERDAS.montar({registros:base.registros, card:id => cards.get(id) || null, status:c => OPERACAO.statusEntrega(c), demonstrativos:ds, periodo:QUINZENA});
  const linha = m.linhas.find(l => l.osId === 'osA');
  assert.equal(linha.decisao.codigo, 'falha_comprovada');
  assert.doesNotMatch(linha.efeito, /a decidir/);
  assert.equal(m.resumo.origemADefinir + m.resumo.decisaoIncompleta, 0, 'o ponto de atenção não acusa o que o mês já decidiu');
  assert.equal(linha.decisao.demonstrativo.de, '2026-11-01');
  assert.equal(linha.perda.valorCentavos, 120000);
  assert.equal(linha.perda.comissaoCentavos, null, 'a comissão perdida se calcula no período do demonstrativo');
  assert.equal(linha.perda.outroPeriodo, true);
  // Um recorte que nenhum demonstrativo cobre: nada a mais.
  const dez = await e.call({action:'performanceComissaoListar', de:'2026-12-01', ate:'2026-12-02'}, gestor);
  assert.deepEqual(dez.cobrem, []);
});

test('revisão onda-w3-abas: R1, a aba diz de qual demonstrativo leu, e leva ao período dele', () => {
  const lista = [card('R1')], registros = [registro('R1', {retrabalho:true})];
  const fonte = fechamento(registros);
  const rev = revisaoDe(fonte, {R1:{...doc, decisao:'falha_comprovada', tipo:'incompleto'}});
  const t = tela({lista, registros, revisoes:[], cobrem:[rev], aba:'perdas', periodo:QUINZENA});
  const html = t.render(), tx = texto(html);
  // Caso ruim: "Nenhuma revisão da comissão neste período: todas as ocorrências estão a decidir" e o ponto aceso.
  assert.doesNotMatch(tx, /Nenhuma revisão da comissão neste período/);
  assert.doesNotMatch(html, /class="perf-atencao"/, 'o ponto não acusa o que o demonstrativo do mês decidiu');
  assert.match(tx, /Este recorte não é o período de um demonstrativo/);
  assert.match(tx, /de 01\/11\/2026 a 30\/11\/2026 \(revisão 1, prévia[^)]*\), que decidiu 1 O\.S\./);
  assert.match(tx, /Falha comprovada da instalação/);
  assert.match(tx, /Comissão perdida: a calcular no período do demonstrativo \(01\/11\/2026 a 30\/11\/2026\)/);
  assert.match(html, /data-perdas-periodo="2026-11-01\|2026-11-30"/);
  // O botão troca o período da Performance para o do demonstrativo.
  const botao = {dataset:{perdasPeriodo:'2026-11-01|2026-11-30'}};
  t.ctx.renderPerformanceCasa = () => {};
  t.ctx.__el = elFalso({'data-perdas-periodo':[botao]});
  t.run('wirePerdas(__el)');
  botao.onclick();
  assert.equal(t.run('STATE._fPerf.de + "|" + STATE._fPerf.ate'), '2026-11-01|2026-11-30');
  // Nenhum demonstrativo cobre o recorte: diz isso, sem dizer que a O.S. já foi julgada.
  const nada = texto(tela({lista, registros, revisoes:[], cobrem:[], aba:'perdas', periodo:QUINZENA}).render());
  assert.match(nada, /Nenhum demonstrativo da comissão cobre este recorte/);
});

test('revisão onda-w3-abas: R3, com a compensação em preparo no topo, vale a decisão da aprovação ativa (servidor real)', async () => {
  const {e, f, p1, cards} = await servidorComFalha('r3');
  assert.equal(p1.revisao.apuracao.aprovavel, true, JSON.stringify(p1.revisao.apuracao.pendencias));
  const ap = await e.call({action:'performanceComissaoAprovar', ...NOV, anterior:p1.revisao.id, hash:p1.revisao.hash, motivo:'Aprovação fictícia', confirmacao:true, requestId:'r3-aprova-01'}, gestor);
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const comp = await e.call({action:'performanceComissaoNova', ...NOV, anterior:ap.revisao.id, compensarId:ap.revisao.id, motivo:'Compensação fictícia', requestId:'r3-compensa-01'}, gestor);
  assert.equal(comp.ok, true, JSON.stringify(comp));
  const lista = await e.call({action:'performanceComissaoListar', ...NOV}, gestor);
  assert.ok(lista.revisoes[0].apuracao.compensacaoDe, 'premissa: a compensação (prévia) está no topo');
  assert.equal(COMISSAO.ativas(lista.revisoes, 'teste')[0].id, ap.revisao.id, 'premissa: a aprovação com a falha é a ativa');
  // Caso ruim: a aba lia revisoes[0] (a compensação, sem linhas) e dizia "a decidir".
  const escolha = PERDAS.escolherRevisao(lista.revisoes);
  assert.equal(escolha.revisao.id, ap.revisao.id);
  assert.equal(escolha.compensacao.tipo, 'previa');
  assert.equal(escolha.compensacao.revisao, comp.revisao.revisao);
  const ds = PERDAS.demonstrativos(lista, NOV);
  const m = PERDAS.montar({registros:f.registros, card:id => cards.get(id) || null, status:c => OPERACAO.statusEntrega(c), demonstrativos:ds, periodo:NOV});
  assert.equal(m.linhas.find(l => l.osId === 'osA').decisao.codigo, 'falha_comprovada');
  assert.equal(m.resumo.origemADefinir + m.resumo.decisaoIncompleta, 0);
  // A aba diz que há uma compensação em preparo.
  const regs = f.registros.map(r => ({...r}));
  const t = tela({lista:[...cards.values()], registros:regs, revisoes:lista.revisoes, cobrem:[], fechamentos:[f], aba:'perdas'});
  const tx = texto(t.render());
  assert.match(tx, /compensação em preparo \(revisão 3, prévia\)/);
  assert.match(tx, /Falha comprovada da instalação/);
  assert.doesNotMatch(tx, /Ponto de atenção/);
});

/* TROCADO DE PROPÓSITO (onda a3, D-010): o ponto de atenção conta a
   comissão PENDENTE da O.S. de origem a definir (não paga e não perde), e o Y
   continua contando a montagem interna elegível, que também fica pendente.
   E de novo na revisão da onda a3 (o mês fechado manda): o fechamento é o da
   régua, com a linha pendente da origem a definir; um selo sem a régua não
   tem essa linha, e a O.S. não fica "a definir" nele. */
test('revisão onda-w3-abas: R4, o Y do ponto de atenção conta a montagem interna elegível (comissão pendente da origem a definir)', () => {
  const registros = [registro('R1', {retrabalho:true, etapaOrigem:''})];
  const semOrigem = () => card('R1', {etapaOrigem:''});
  const fonte = {...fechamento(registros), regraPerdas:'perdas-1'};
  const interna = {...doc, situacao:'elegivel', partes:[{pessoaId:'900009', cota:10000}]};
  const rev = revisaoDe(fonte, {}, 1, interna);
  assert.equal(rev.apuracao.linhas[0].decisao, 'origem_a_definir', 'premissa: a linha pendente da origem a definir');
  // Quem receberia pelo motor com a origem definida: 900001, 900002 e 900009 (a montagem interna elegível).
  const definida = {...fechamento([registro('R1', {retrabalho:true, etapaOrigem:'Produção'})]), regraPerdas:'perdas-1'};
  const sem = COMISSAO.apurar(definida, {...rev.entrada, decisoes:{R1:{...doc, decisao:'sem_falha', tipo:'incompleto'}}}, {aprovacoes:[]});
  const recebem = new Set(sem.linhas[0].pagamentos.filter(p => p.centavos > 0).map(p => p.pessoaId));
  assert.deepEqual([...recebem].sort(), ['900001', '900002', '900009']);
  const m = PERDAS.montar({registros, card:semOrigem, status:c => OPERACAO.statusEntrega(c), revisao:rev});
  assert.equal(m.resumo.origemADefinir, 1);
  assert.equal(m.resumo.pessoasPendentes, recebem.size);
  // A interna que não é elegível não conta, e ninguém conta duas vezes.
  const naoAplica = PERDAS.montar({registros, card:semOrigem, status:c => OPERACAO.statusEntrega(c), revisao:revisaoDe(fonte, {})});
  assert.equal(naoAplica.resumo.pessoasPendentes, 2);
  const repetida = revisaoDe(fonte, {}, 1, {...interna, partes:[{pessoaId:'900001', cota:10000}]});
  assert.equal(PERDAS.montar({registros, card:semOrigem, status:c => OPERACAO.statusEntrega(c), revisao:repetida}).resumo.pessoasPendentes, 2);
  // Com a origem definida (depois do fechamento), nada fica pendente no ponto: a O.S. pede a revisão nova.
  const depois = PERDAS.montar({registros, card:() => card('R1'), status:c => OPERACAO.statusEntrega(c), revisao:rev});
  assert.deepEqual([depois.resumo.pessoasPendentes, depois.resumo.origemADefinir, depois.resumo.origemDefinidaDepois], [0, 0, 1]);
});

/* TROCADO DE PROPÓSITO (revisão da onda a3, D-004 nos pontos: "zera só os
   pontos e a comissão da O.S. afetada"): a falha comprovada julgada no
   demonstrativo também tira os pontos da O.S. nos Rankings. Antes a aba dizia
   que o ranking ainda contava a O.S., e contava. */
test('revisão onda-w3-abas: R2 e U2, a falha comprovada tira os pontos e a comissão da O.S.: na aba, no demonstrativo e nos Rankings', () => {
  const lista = [card('R1'), card('S1', {...semRetrabalho})];
  const registros = [registro('R1', {retrabalho:true}), registro('S1')];
  const fonte = fechamento(registros);
  const rev = revisaoDe(fonte, {R1:{...doc, decisao:'falha_comprovada', tipo:'incompleto'}, S1:{...doc, decisao:'sem_falha', tipo:'nenhuma'}});
  const perdas = texto(tela({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'perdas'}).render());
  assert.doesNotMatch(perdas, /não pontua no programa|Deixa de pontuar|deixam de pontuar|ainda conta esta O\.S\./);
  assert.match(perdas, /Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\./);
  assert.match(perdas, /Base que deixa de gerar comissão: R\$\s?1\.200,00/);
  assert.match(perdas, /R\$\s?1\.200,00 de base não geram comissão/, 'o resumo do topo diz o mesmo');
  // Os Rankings (Pessoas): 60% só da S1 (R$ 720,00); antes, 60% de R$ 2.400 (R$ 1.440,00), com a R1.
  const rank = texto(tela({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'equipe'}).render());
  assert.match(rank, /R\$\s?720,00/);
  assert.doesNotMatch(rank, /R\$\s?1\.440,00/);
  // Sem a revisão da comissão, nada muda: a R1 conta (60% de R$ 2.400).
  const semRev = texto(tela({lista, registros, revisoes:[], fechamentos:[fonte], aba:'equipe'}).render());
  assert.match(semRev, /R\$\s?1\.440,00/);
});

test('revisão onda-w3-abas: R5, casa.js antigo com performance.js novo: a conferência continua nos Rankings', () => {
  const t = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})]});
  // A casa nova tem a aba Conferência: os Rankings não repetem a lista.
  assert.equal(t.run('typeof perfCasaTemAbaConferencia'), 'function', 'a casa nova se anuncia');
  assert.doesNotMatch(t.run('performanceEquipesHTML()'), /Conferência por entrega/);
  // Caso ruim: com o casa.js antigo (sem a aba), a Conferência por entrega sumia de todas as abas.
  t.run('perfCasaTemAbaConferencia = undefined');
  const velha = t.run('performanceEquipesHTML()');
  assert.match(velha, /Conferência por entrega/);
  assert.match(velha, /data-perf-part="C2"/, 'o Conferir continua');
  assert.match(velha, /id="perf-situacao"/, 'os filtros continuam');
  assert.equal((velha.match(/id="perf-pdf"/g) || []).length, 1, 'um botão de PDF só');
});

test('revisão onda-w3-abas: R6 e U5, o PDF completo dos Rankings leva a conferência por entrega', () => {
  const t = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})]});
  let impresso = null;
  t.ctx.imprimirAnalisePCP = (titulo, copia) => { impresso = {titulo, html:copia.html}; };
  const copia = {html:'<section class="perf-workspace">ranking</section>', querySelector:() => null, querySelectorAll:() => [], prepend() {}, insertAdjacentHTML(pos, h) { this.html += h; }};
  const pdf = {};
  t.ctx.__el = {querySelectorAll:() => [], querySelector:sel => sel === '#perf-pdf' ? pdf : sel === '.perf-workspace' ? {cloneNode:() => copia} : null};
  t.run('wirePerformanceEquipes(__el)');
  pdf.onclick();
  // Caso ruim: o "PDF completo" saía só com o ranking.
  assert.ok(impresso, 'o PDF foi montado');
  assert.match(impresso.html, /Conferência por entrega/);
  // TROCADO DE PROPÓSITO (revisão da onda a3, B5): o quadro passou a se chamar Apontamentos dos lançamentos.
  assert.match(impresso.html, /Apontamentos dos lançamentos/);
  assert.match(impresso.html, /T-C2/);
  assert.doesNotMatch(impresso.html, /id="perf-pdf"/, 'sem botão repetido no PDF');
  assert.match(ler('scripts/testar-performance-experiencia-ui.cjs'), /'ranking-equipes',[^\n]*Conferência por entrega/, 'a prova no navegador confere o PDF completo');
});

test('revisão onda-w3-abas: R7 e U6, o motivo do Fechar e os avisos apontam para a aba Conferência', () => {
  const t = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})], periodo:{de:'2026-09-01', ate:'2026-09-30'}});
  const html = t.render();
  const motivo = (html.match(/id="perf-fechar-motivo">([^<]*)</) || [])[1] || '';
  // Caso ruim: "Use o filtro Situação da lista para achar cada uma", numa aba sem o filtro.
  assert.doesNotMatch(motivo, /filtro Situação da lista/);
  assert.match(motivo, /Veja na aba Conferência \(filtro A conferir\)/);
  assert.match(html, /class="perf-fechar-motivo"[^]*?data-perf-filtrar="pendente"/, 'o botão ao lado do motivo leva à aba filtrada');
  const perf = ler('performance.js');
  assert.doesNotMatch(perf, /Use o filtro Situação da lista/, 'nem o aviso do Fechar');
  assert.doesNotMatch(perf, /na lista abaixo/, 'o ranking vazio não manda para uma lista que não está ali');
  assert.match(ler('app.js'), /Performance › Conferência › Conferir nomes do PCP × fichas do RH/);
  assert.match(ler('lote.js'), /Performance › Conferência › Conferir nomes/);
  assert.match(ler('alocacao-ui.js'), /Performance › Conferência › Conferir nomes/);
  for (const f of ['app.js', 'lote.js', 'alocacao-ui.js']) assert.doesNotMatch(ler(f), /Performance, Conferir nomes|Performance › Conferir nomes/, f);
});

const retrabalhos = () => ({
  lista:[card('R1'), card('R2', {etapaOrigem:'Instalação', causaRaiz:'Erro humano'}), card('S1', {...semRetrabalho})],
  registros:[registro('R1', {retrabalho:true}), registro('R2', {retrabalho:true, membros:[pessoa('900001', 'Pessoa Um', 50), pessoa('900003', 'Pessoa Três', 50)]}), registro('S1', {confirmado:false, fonte:'sugestao'})]});

/* TROCADO DE PROPÓSITO (onda a3, D-011): o caminho (conferir, fechar, abrir
   a Comissão) é o de JULGAR uma ocorrência no demonstrativo, e mora na seção
   das outras ocorrências; o ponto de atenção não o pede (atraso e retrabalho
   de outra origem não ameaçam a comissão sozinhos). */
/* TROCADO DE PROPÓSITO (revisão da onda a3, B4): o caminho para julgar mora só
   nas "Outras ocorrências"; o retrabalho de outra origem só se acompanha. A
   O.S. com atraso (A1) entra no período para a seção existir. */
test('revisão onda-w3-abas: U3, a aba diz o caminho para julgar no demonstrativo, com o botão do próximo passo', () => {
  const {lista, registros} = retrabalhos();
  lista.push(card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'}));
  registros.push(registro('A1', {dia:'2026-11-08'}));
  // 1) Há entrega a conferir: o próximo passo é a Conferência filtrada.
  const t = tela({lista, registros, aba:'perdas'});
  const html = t.render(), tx = texto(html);
  // Caso ruim: a aba só dizia "(Rankings, Base e fechamento)", sem botão e sem dizer que é preciso conferir e fechar antes.
  assert.match(tx, /Para julgar no demonstrativo: confira a entrega que falta \(aba Conferência\), feche o período em Rankings › Base e fechamento e abra Comissão\./);
  const secaoOutra = html.slice(html.indexOf('perf-perdas-grupo-outra'), html.indexOf('perf-perdas-grupo-ocorrencia'));
  assert.ok(secaoOutra.length > 0 && !/Para julgar/.test(secaoOutra), 'B4: o caminho não aparece no retrabalho de outra origem');
  assert.match(html.slice(html.indexOf('perf-perdas-grupo-ocorrencia')), /Para julgar no demonstrativo/, 'ele mora nas outras ocorrências');
  // O ponto acende pela perda do retrabalho de instalação (R2), sem pedir o caminho do julgamento.
  assert.doesNotMatch(texto(html.slice(html.indexOf('class="perf-atencao"'), html.indexOf('</section>', html.indexOf('class="perf-atencao"')))), /Para julgar/);
  assert.match(html, /data-perdas-passo="conferir"[^>]*>Conferir a entrega que falta</);
  const conferir = {dataset:{perdasPasso:'conferir'}};
  t.ctx.renderPerformanceCasa = () => {};
  t.ctx.__el = elFalso({'data-perdas-passo':[conferir]});
  t.run('wirePerdas(__el)');
  conferir.onclick();
  assert.equal(t.run('STATE._perfAba'), 'conferencia');
  assert.equal(t.run('STATE._perfSituacao'), 'pendente');
  // 2) Tudo conferido e o período sem fechamento: o próximo passo é o Base e fechamento, aberto.
  const conferidos = registros.map(r => ({...r, confirmado:true, fonte:'participacao'}));
  const t2 = tela({lista, registros:conferidos, aba:'perdas', periodo:{de:'2026-11-01', ate:'2026-11-30'}});
  const h2 = t2.render();
  assert.match(texto(h2), /Para julgar no demonstrativo: feche o período em Rankings › Base e fechamento e abra Comissão\./);
  assert.match(h2, /data-perdas-passo="fechar"[^>]*>Ir para Base e fechamento</);
  const fechar = {dataset:{perdasPasso:'fechar'}};
  t2.ctx.renderPerformanceCasa = () => {};
  t2.ctx.__el = elFalso({'data-perdas-passo':[fechar]});
  t2.run('wirePerdas(__el)');
  fechar.onclick();
  assert.equal(t2.run('STATE._perfAba'), 'equipe');
  assert.equal(JSON.parse(t2.guardado.get('impresilk_inst_quadros'))['perf-base'], true, 'o quadro Base e fechamento abre');
  // 3) Período fechado: o próximo passo é abrir o demonstrativo da comissão nesse fechamento.
  const fonte = fechamento(conferidos);
  const t3 = tela({lista, registros:conferidos, fechamentos:[fonte], aba:'perdas'});
  const h3 = t3.render();
  assert.match(texto(h3), /Para julgar: abra Comissão · demonstrativo e aprovação e registre a decisão de cada O\.S\./);
  assert.match(h3, /data-perdas-passo="comissao"[^>]*>Abrir o demonstrativo da comissão</);
  const comissao = {dataset:{perdasPasso:'comissao'}};
  let abriu = 0;
  t3.ctx.renderPerformanceCasa = () => {};
  t3.ctx.perfComissaoAbrir = async () => { abriu++; };
  t3.ctx.__el = elFalso({'data-perdas-passo':[comissao]});
  t3.run('wirePerdas(__el)');
  comissao.onclick();
  assert.equal(abriu, 1);
  assert.equal(t3.run('perfRemoto.selecionado'), 'fechamento-ficticio-1', 'o demonstrativo abre sobre o fechamento do período');
});

test('revisão onda-w3-abas: U3, no diálogo da comissão as O.S. com ocorrência vêm primeiro e a busca acha pelo tipo', () => {
  // Doze O.S. sem ocorrência e, por último, a do retrabalho: ela ficava na página 2 do diálogo.
  const lista = [...Array.from({length:12}, (_, i) => card('S' + i, {...semRetrabalho})), card('R9')];
  const regs = [...Array.from({length:12}, (_, i) => registro('S' + i)), registro('R9', {retrabalho:true})];
  const t = tela({lista, registros:regs});
  let corpo = '';
  t.ctx.perfDialog = (titulo, html) => { corpo = html; return {classList:{add() {}}, querySelectorAll:() => [], querySelector:() => ({value:'', textContent:'', disabled:false})}; };
  t.ctx.__fonte = fechamento(regs);
  t.run('comissaoEditar(__fonte, null, __fonte.periodo, null, [])');
  const itens = [...corpo.matchAll(/<details data-comissao-item data-busca="([^"]*)"><summary>([^<]*)</g)].map(m => ({busca:m[1], resumo:m[2]}));
  const resp = itens.filter(i => /^Responsabilidade/.test(i.resumo));
  assert.equal(resp.length, 13);
  assert.match(resp[0].resumo, /O\.S\. T-R9 · Retrabalho/, 'a O.S. com ocorrência é a primeira');
  assert.match(resp[0].busca, /retrabalho/i, 'a busca acha pelo tipo da ocorrência');
  // A ordem nova não troca as decisões de O.S.: o campo de cada uma segue o índice dela na lista mostrada.
  assert.match(corpo, /name="os0decisao"[^]*?name="os1decisao"/);
});

test('revisão onda-w3-abas: U4, a decisão registrada sem documento diz o que falta, e o ponto separa', () => {
  const lista = [card('R1')], registros = [registro('R1', {retrabalho:true})];
  const fonte = fechamento(registros);
  // A gestão escolheu "Sem falha comprovada" e não preencheu a origem nem a evidência.
  const rev = revisaoDe(fonte, {R1:{decisao:'sem_falha', tipo:'nenhuma', origem:'', evidencia:'', justificativa:'Analisado, sem falha'}});
  const d = PERDAS.decisaoDaOS('R1', rev);
  assert.equal(d.codigo, 'pendente', 'o motor não aceita a decisão sem documento');
  assert.equal(d.incompleta, true);
  assert.equal(d.registrada, 'sem_falha');
  assert.deepEqual(d.falta, ['a origem', 'a evidência']);
  const html = tela({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'perdas'}).render(), tx = texto(html);
  // Caso ruim: "A decidir pela gestão / Lida da revisão 1", sem dizer por quê.
  assert.match(tx, /Decisão registrada \(Sem falha comprovada\), sem documento completo: falta a origem e a evidência/);
  // TROCADO DE PROPÓSITO (onda a3): o ponto acusa a decisão incompleta (ela trava o demonstrativo), não a falta de decisão.
  const ponto = texto((html.match(/<section class="perf-atencao"[^]*?<\/section>/) || [''])[0]);
  assert.match(ponto, /1 decisão da comissão registrada sem documento completo: o demonstrativo só aceita a decisão documentada\./);
  // Sem decisão nenhuma (retrabalho de produção, sem origem a definir): nada a acusar.
  const nada = tela({lista, registros, revisoes:[revisaoDe(fonte, {})], fechamentos:[fonte], aba:'perdas'}).render();
  assert.doesNotMatch(nada, /class="perf-atencao"/);
  assert.match(texto(nada), /Retrabalho de produção: não tira nada da instalação\./);
});

test('revisão onda-w3-abas: U7, abas, ponto de atenção e faixa têm 44 px fora de media query', () => {
  const css = ler('performance-layout.css');
  const regra = '#panel-performance .perf-page-tabs button,#panel-performance .perf-atencao button,#panel-performance .perf-faixa-conferir button{min-height:44px}';
  const i = css.indexOf(regra);
  // Caso ruim: 38 px nas abas e 40 px nos botões (a regra de 44 px morava num @media e perdia para #panel-performance button).
  assert.ok(i >= 0, 'a regra de 44 px existe');
  let nivel = 0;
  for (const ch of css.slice(0, i)) { if (ch === '{') nivel++; else if (ch === '}') nivel--; }
  assert.equal(nivel, 0, 'a regra não está dentro de @media');
  assert.match(ler('styles.css'), /#panel-performance button,[^{]*\{\s*min-height:\s*40px/, 'premissa: a regra geral do painel é de 40 px, e a nova vence pela especificidade');
});

test('revisão onda-w3-abas: U8, período antes do programa não acusa perda de comissão', () => {
  const SET = {de:'2026-09-01', ate:'2026-09-30'};
  const lista = [card('S1', {instalacao:{data:'2026-09-15'}, prazoCombinado:{data:'2026-09-15', fonte:'agenda'}, finalizadaEm:'2026-09-15T15:00:00-03:00'})];
  const registros = [registro('S1', {retrabalho:true, dia:'2026-09-15'})];
  const m = PERDAS.montar({registros, card:() => lista[0], status:c => OPERACAO.statusEntrega(c), revisao:null, periodo:SET});
  // TROCADO DE PROPÓSITO (onda a3): os nomes novos do resumo (origem a definir e comissão pendente).
  assert.equal(m.resumo.origemADefinir, 0);
  assert.equal(m.resumo.pessoasPendentes, 0);
  assert.equal(m.resumo.periodoAntes, true);
  const html = tela({lista, registros, revisoes:[], cobrem:[], aba:'perdas', periodo:SET}).render(), tx = texto(html);
  // Caso ruim: "Ponto de atenção: 1 O.S. com retrabalho ainda sem decisão: pode tirar a comissão de 2 pessoas", em setembro.
  assert.doesNotMatch(html, /class="perf-atencao"/);
  assert.match(tx, /Período anterior ao programa: sem comissão; as ocorrências ficam só como registro\./);
  assert.match(tx, /Antes do programa/);
  assert.doesNotMatch(tx, /A decidir pela gestão/);
  // Recorte que pega setembro e outubro: só a de outubro acusa.
  const mix = PERDAS.montar({registros:[...registros, registro('O1', {retrabalho:true, dia:'2026-10-05'})], card:() => null, revisao:null, periodo:{de:'2026-09-01', ate:'2026-10-31'}});
  assert.equal(mix.resumo.origemADefinir, 1, 'sem a ficha e sem a origem na apuração: a de outubro fica a definir');
  assert.equal(mix.resumo.periodoAntes, false);
});

test('revisão onda-w3-abas: U9, os textos da aba sem termos internos: comissão perdida, a régua do ranking e as duas datas', () => {
  const {lista, registros} = retrabalhos();
  lista.push(card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'}), card('A2', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'}));
  registros.push(registro('A1'), registro('A2', {dia:'2026-11-08'}));
  const fonte = fechamento(registros);
  const rev = revisaoDe(fonte, {R1:{...doc, decisao:'falha_comprovada', tipo:'incompleto'}});
  const tx = texto(tela({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'perdas'}).render());
  // Caso ruim: "base líquida da linha da comissão", "o mesmo motor do demonstrativo", "Apuração (ranking e comissão)", "A ficha e a apuração concordam".
  assert.doesNotMatch(tx, /base líquida da linha|mesmo motor|Versão da apuração|Apuração \(ranking e comissão\)|concordam/);
  // Nota trocada de propósito na onda a3: ela também explica a comissão perdida do retrabalho de instalação.
  // E de novo na revisão da onda a3 (B6): sem "pelo motor" nem "a mesma conta do motor".
  assert.match(tx, /A da falha comprovada é o quanto a O\.S\. renderia no demonstrativo se fosse julgada sem falha\. Saldo de meses anteriores não entra\./);
  assert.doesNotMatch(tx, /pelo motor|conta do motor/);
  assert.match(tx, /Dia da entrega usado no ranking \(não desconta atraso\): prazo 05\/11, entrega 05\/11: no prazo/);
  // TROCADO DE PROPÓSITO (revisão da onda a3, B6): a frase das duas datas iguais saía em todo cartão; só a divergência é dita.
  assert.match(tx, /Atraso de 3 dias: prazo 05\/11, entrega 08\/11\./);
  assert.doesNotMatch(tx, /As duas datas dão o mesmo atraso/);
});
