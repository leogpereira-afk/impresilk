'use strict';
/* AS DUAS ABAS QUE O DONO PEDIU NA PERFORMANCE (onda w3, 11/10/2026).
   Pedido literal: "a parte de conferência de notas, ela tem que ser bem
   destacada, e a que perdeu por retrabalho, essa parte precisa de uma aba e
   um ponto de atenção importante". Fila do PCP: "Já combinado 4", itens 14 e
   26. Auditoria da v164: M10, M1 e A3.
   Cada teste começa pelo caso ruim: a conferência escondida no fim dos
   Rankings, a perda sem lugar nem aviso, a decisão da comissão sem a
   ocorrência à vista, e R$ para quem não pode ver. Dados fictícios. */
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
const PERDAS = existe('perdas.js') ? require('../perdas.js') : null;
const perdas = () => { assert.ok(PERDAS, 'perdas.js existe e exporta o núcleo PERDAS'); return PERDAS; };
const texto = html => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const pessoa = (chave, nome, percentual) => ({chave, nome, percentual});
// A ficha da O.S. (o card do aparelho): retrabalho marcado com origem, causa e o carimbo de quem marcou.
const card = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, tipo:'externo', instalacao:{data:'2026-11-05'},
  prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, finalizadaEm:'2026-11-05T15:00:00-03:00', equipe:['900001', '900002'], valorTotal:1200,
  retrabalho:true, problema:'Adesivo descolou na borda', etapaOrigem:'Produção', causaRaiz:'Material', responsavelEtapa:'Setor fictício',
  dataRetrabalho:'2026-11-06', retrabalhoPerguntado:{resposta:'sim', por:'Gestora fictícia', em:'2026-11-06T10:15:00-03:00'}, ...extra});
const semRetrabalho = {retrabalho:false, problema:'', etapaOrigem:'', causaRaiz:'', retrabalhoPerguntado:{resposta:'nao', por:'Gestora fictícia', em:'2026-11-08T10:00:00-03:00'}};
// O registro da apuração do servidor (perfFonte), como a tela recebe.
const registro = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, dia:'2026-11-05', valor:1200, origemValor:'O.S. do PCP',
  membros:[pessoa('900001', 'Pessoa Um', 60), pessoa('900002', 'Pessoa Dois', 40)], confirmado:true, fonte:'participacao', retrabalho:false, ...extra});
const entregasDoc = regs => Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:r.membros[0].chave}], interna:{...doc, situacao:'nao_aplicavel'}}]));
const fechamento = regs => ({id:'fechamento-ficticio-1', revisao:1, fechadoEm:'2026-12-01T10:00:00Z', fechadoPor:'Gestora fictícia', periodo:{...NOV}, ...NOV, registros:regs});
function revisaoDe(fonte, decisoes, n = 1) {
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes, entregas:entregasDoc(fonte.registros)};
  return {id:'2026-11-01:2026-11-30:00000' + n, revisao:n, tipo:'previa', em:'2026-12-01T11:00:00Z', fechamentoId:fonte.id, entrada, apuracao:COMISSAO.apurar(fonte, entrada, {aprovacoes:[]})};
}
// A régua da apuração (o dia da entrega do ranking e da comissão): o mesmo jeito da célula de comissão do Por O.S.
const noDia = c => dia => OPERACAO.statusEntrega({...c, finalizadaEm:dia + 'T12:00:00-03:00', entregaLancada:{data:dia}});

/* ---------------------------------------------------------------- o núcleo */

test('ocorrência: o retrabalho traz origem, causa, quem marcou e quando, lidos da ficha', () => {
  const P = perdas(), c = card('R1');
  const oc = P.ocorrenciasDaOS({card:c, st:OPERACAO.statusEntrega(c), registros:[{dia:'2026-11-05', retrabalho:true}], noDia:noDia(c)});
  assert.deepEqual(oc.tipos, ['retrabalho']);
  assert.equal(oc.retrabalho.etapa, 'Produção');
  assert.equal(oc.retrabalho.causa, 'Material');
  assert.equal(oc.retrabalho.problema, 'Adesivo descolou na borda');
  assert.equal(oc.retrabalho.marcadoPor, 'Gestora fictícia');
  assert.match(oc.retrabalho.marcadoEm, /^2026-11-06T10:15/);
  assert.equal(oc.retrabalho.foraDaInstalacao, true, 'origem na Produção não é a instalação (M2): a tela diz');
  // A ficha fora do aparelho: a marca do registro da apuração ainda aparece, dita como incompleta.
  const so = P.ocorrenciasDaOS({card:null, st:null, registros:[{dia:'2026-11-05', retrabalho:true}]});
  assert.equal(so.semFicha, true);
  assert.ok(so.retrabalho, 'sem a ficha, a marca de retrabalho da apuração não some');
});

test('ocorrência: o atraso mostra as duas réguas (ficha e apuração) quando divergem', () => {
  const P = perdas();
  // Prazo 05/11, conferência (dia da apuração) 05/11, finalização no PCP em 08/11: a ficha diz 3 dias, a apuração diz no prazo (o caso da M3).
  const c = card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'});
  const oc = P.ocorrenciasDaOS({card:c, st:OPERACAO.statusEntrega(c), registros:[{dia:'2026-11-05'}], noDia:noDia(c)});
  assert.deepEqual(oc.tipos, ['atraso']);
  assert.equal(oc.atraso.ficha.dias, 3);
  assert.equal(oc.atraso.ficha.entrega, '2026-11-08');
  assert.equal(oc.atraso.apuracao.dias, 0);
  assert.equal(oc.atraso.apuracao.entrega, '2026-11-05');
  assert.equal(oc.atraso.divergem, true);
  // As duas concordam: uma régua só.
  const igual = P.ocorrenciasDaOS({card:c, st:OPERACAO.statusEntrega(c), registros:[{dia:'2026-11-08'}], noDia:noDia(c)});
  assert.equal(igual.atraso.divergem, false);
  // No prazo nas duas: não é ocorrência.
  const ok = card('A2', {...semRetrabalho});
  assert.deepEqual(P.ocorrenciasDaOS({card:ok, st:OPERACAO.statusEntrega(ok), registros:[{dia:'2026-11-05'}], noDia:noDia(ok)}).tipos, []);
});

test('ocorrência: retorno antecipado e o abono do atraso, com quem abonou', () => {
  const P = perdas();
  const c = card('B1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00',
    retornoPrevisto:[{dia:'2026-11-08', hora:'16:30'}], retornoConferido:{dia:'2026-11-08', hora:'15:40', por:'Gestora fictícia', em:'2026-11-08T18:41:00Z'},
    abonos:[{id:'ab-ficticio-1', ocorrenciaId:'B1:atraso', motivo:'Cliente pediu para remarcar a instalação', por:'Gestora fictícia', em:'2026-11-08T19:00:00Z', medida:{prazo:'2026-11-05', entrega:'2026-11-08'}}]});
  const oc = P.ocorrenciasDaOS({card:c, st:OPERACAO.statusEntrega(c), registros:[{dia:'2026-11-08'}], noDia:noDia(c)});
  assert.deepEqual(oc.tipos, ['atraso', 'retorno_antecipado']);
  assert.equal(oc.retorno[0].minutos, 50);
  assert.equal(oc.atraso.abonado, true);
  assert.equal(oc.abonos[0].tipo, 'atraso');
  assert.equal(oc.abonos[0].motivo, 'Cliente pediu para remarcar a instalação');
  assert.equal(oc.abonos[0].por, 'Gestora fictícia');
});

test('decisão: lida do motor da comissão; sem documento, ou falha da produção, fica "a decidir pela gestão"', () => {
  const P = perdas();
  const fonte = fechamento([registro('R1', {retrabalho:true}), registro('R2', {retrabalho:true}), registro('R3', {retrabalho:true}), registro('R4', {retrabalho:true})]);
  const rev = revisaoDe(fonte, {
    R1:{...doc, decisao:'falha_comprovada', tipo:'incompleto'},
    R2:{decisao:'falha_comprovada', tipo:'incompleto'},
    R3:{...doc, decisao:'falha_comprovada', tipo:'producao'},
    R4:{...doc, decisao:'sem_falha', tipo:'nenhuma'}});
  assert.equal(P.decisaoDaOS('R1', rev).codigo, 'falha_comprovada');
  assert.equal(P.decisaoDaOS('R2', rev).codigo, 'pendente', 'decisão sem documento é pendência do motor');
  const r3 = P.decisaoDaOS('R3', rev);
  assert.equal(r3.codigo, 'pendente', 'falha da produção não comprova falha da instalação');
  assert.equal(r3.recusada, true);
  assert.equal(P.decisaoDaOS('R4', rev).codigo, 'sem_falha');
  assert.equal(P.decisaoDaOS('R1', null).codigo, 'pendente', 'sem revisão da comissão, a decidir');
  // TROCADO DE PROPÓSITO (onda a3, D-011): a ocorrência sem julgamento fica registrada, sem efeito sozinha.
  assert.equal(P.EFEITO.pendente, 'Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada');
  // A perda só existe com falha comprovada, e os números saem do motor.
  assert.equal(rev.apuracao.linhas.find(l => l.osId === 'R1').comissaoCentavos, 0, 'o motor zera a O.S. com falha comprovada');
  const cf = P.semFalhas(COMISSAO, fonte, rev);
  const perda = P.perdaDaOS(P.decisaoDaOS('R1', rev), cf);
  assert.equal(perda.valorCentavos, rev.apuracao.linhas.find(l => l.osId === 'R1').baseLiquidaCentavos);
  assert.equal(perda.valorCentavos, 120000);
  assert.equal(perda.comissaoCentavos, 1200);
  assert.equal(P.perdaDaOS(P.decisaoDaOS('R4', rev), cf), null);
  assert.equal(P.perdaDaOS(P.decisaoDaOS('R2', rev), cf), null);
});

/* ------------------------------------------- contagens contra o servidor real */

const gestor = {papel:'pcp', nome:'Gestor fictício', sub:'gestor', exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const osDoBanco = (id, equipe, extra = {}) => ({colecao:'os', id, apagado:false, atualizado_em:'2020-01-01', registro:{id, numero:'T-' + id, tipo:'externo', cliente:'Cliente fictício ' + id,
  finalizadaEm:'2026-11-10T15:00:00Z', equipe, valorTotal:1200, ...extra}});

/* TROCADO DE PROPÓSITO (onda a3, D-010 de 11/10/2026): o retrabalho de
   instalação é PERDA AUTOMÁTICA na apuração do servidor (o motor zera a linha
   sem pedir decisão e grava a comissão que ela teria); o sem origem fica a
   definir (pendente no motor, e no ponto de atenção). Antes a A só perdia com
   a falha comprovada registrada. */
test('contagens batem com a apuração do servidor: a base e a comissão perdida do retrabalho de instalação saem do mesmo motor', async () => {
  const P = perdas();
  const ids = ['100001', '100002', '100003', '100004'];
  const e = await edge('pcp-sync', {
    pcp_registros:[osDoBanco('osA', ids.slice(0, 2), {retrabalho:true, etapaOrigem:'Instalação', causaRaiz:'Erro humano'}), osDoBanco('osB', ids.slice(2), {retrabalho:true})],
    registros:ids.map((id, i) => ({colecao:'colaboradores', id:'p' + i, apagado:false, registro:{id:'p' + i, nome:'Pessoa ' + (i + 1), cpf:id + '12345'}})),
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[
      {id:'osA', membros:[pessoa('100001', 'Pessoa 1', 60), pessoa('100002', 'Pessoa 2', 40)], por:'Gestor', em:'2026-11-10'},
      {id:'osB', membros:[pessoa('100003', 'Pessoa 3', 60), pessoa('100004', 'Pessoa 4', 40)], por:'Gestor', em:'2026-11-10'}]}}}],
    painel_ordens:[]});
  relogio(e, '2026-12-02T12:00:00Z');
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.equal(fonte.status, 200, JSON.stringify(fonte));
  assert.equal(fonte.regraPerdas, 'perdas-1', 'a apuração diz com qual régua julgou');
  const fech = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:'fechar-perdas-0001', motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
  assert.equal(fech.ok, true, JSON.stringify(fech));
  const f = fech.fechamento;
  assert.deepEqual(f.registros.map(r => [r.id, r.etapaOrigem, r.perda || '']), [['osA', 'Instalação', 'retrabalho_instalacao'], ['osB', '', '']]);
  const entrada = decisoes => ({config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes, entregas:entregasDoc(f.registros)});
  // A gestão registra "sem falha" na A: não muda nada, porque a perda é automática.
  const p1 = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.id, anterior:'', entrada:entrada({osA:{...doc, decisao:'sem_falha', tipo:'nenhuma'}, osB:{...doc, decisao:'sem_falha', tipo:'nenhuma'}}), motivo:'Prévia fictícia 1', requestId:'previa-perdas-0001'}, gestor);
  assert.equal(p1.ok, true, JSON.stringify(p1));
  const linhaA = p1.revisao.apuracao.linhas.find(l => l.osId === 'osA'), linhaB = p1.revisao.apuracao.linhas.find(l => l.osId === 'osB');
  assert.deepEqual([linhaA.comissaoCentavos, linhaA.pontos, linhaA.decisao, linhaA.comissaoPerdidaCentavos], [0, 0, 'retrabalho_instalacao', 1200]);
  // TROCADO DE PROPÓSITO (revisão da onda a3): a origem a definir fica pendente na linha (R$ 0,00 pago, nada perdido) e não trava o mês.
  assert.deepEqual([linhaB.comissaoCentavos, linhaB.pontos, linhaB.decisao], [0, null, 'origem_a_definir'], 'origem a definir: pendente');
  assert.ok(linhaB.pendencias.some(t => /origem a definir/.test(t)), JSON.stringify(linhaB.pendencias));
  assert.equal(p1.revisao.apuracao.aprovavel, true, 'a origem a definir não trava o demonstrativo');
  const cards = new Map(e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => [r.id, r.registro]));
  const m = P.montar({registros:f.registros, card:id => cards.get(id) || null, status:c => OPERACAO.statusEntrega(c), noDia:(c, dia) => noDia(c)(dia),
    revisao:p1.revisao, contrafactual:P.semFalhas(COMISSAO, f, p1.revisao)});
  const a = m.linhas.find(l => l.osId === 'osA'), b = m.linhas.find(l => l.osId === 'osB');
  assert.equal(m.linhas.length, 2);
  assert.equal(a.grupo, 'perda');assert.equal(a.decisao.automatica, true);
  assert.equal(a.perda.valorCentavos, linhaA.baseLiquidaCentavos);
  assert.equal(a.perda.comissaoCentavos, linhaA.comissaoPerdidaCentavos, 'a comissão perdida é a que o motor gravou na linha');
  assert.equal(a.perda.doDemonstrativo, true);
  assert.equal(a.efeito, 'Retrabalho de instalação: tira os pontos e a comissão desta O.S.');
  assert.equal(b.grupo, 'definir');
  assert.equal(b.efeito, 'Retrabalho com origem a definir: defina a origem; até lá não tira nada e a comissão desta O.S. fica pendente');
  assert.equal(b.perda, null);
  assert.equal(m.resumo.os, 2);
  assert.equal(m.resumo.origemADefinir, 1);
  assert.equal(m.resumo.pessoasPendentes, 2, 'as pessoas da B, cuja comissão fica pendente');
  assert.equal(m.resumo.perdaInstalacao, 1);
  assert.equal(m.resumo.valorCentavos, 120000);
  assert.equal(m.resumo.comissaoCentavos, 1200);
});

/* ------------------------------------------------------------- a tela */

function tela({papel = 'pcp', aba = 'equipe', lista = [], registros = [], revisoes = [], fechamentos = [], toque = false} = {}) {
  const el = {innerHTML:'', querySelectorAll:() => [], querySelector:() => null};
  const ctx = vm.createContext({console,
    STORE:{getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[], performancePCP:{equipes:[], participacoes:[]}}), saveCFG() {}, uuid:() => 'id-1',
      elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), entreguesMes:() => null, pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), getQueue:() => []},
    STATE:{user:{papel}, _perfAba:aba, _fPerf:{...NOV}},
    document:{getElementById:() => el, querySelectorAll:() => [], querySelector:() => null, body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState:() => '', bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', wireFiltroPeriodo() {}, abrirTVCasa() {}, perfCompartilharRanking() {},
    CSS:{escape:x => x}, parseLocalDate:() => null, pessoaDoElenco:() => null, crachaEhToque:() => toque});
  // A régua das perdas (divisao.js e regras.js) entra como no index.html (onda a3, D-010 e D-011).
  for (const f of ['operacao-revisao.js', 'operacao.js', 'divisao.js', 'regras.js', 'casa.js', 'relatorios-entregas.js', 'comissao.js', 'comissao-ui.js', 'performance.js', 'perdas.js']) if (existe(f)) vm.runInContext(ler(f), ctx);
  ctx.__regs = registros; ctx.__rev = revisoes; ctx.__fech = fechamentos;
  // A apuração do servidor só chega para admin e pcp (perfConsultaServidor); os outros veem a prévia do aparelho.
  if (['admin', 'pcp'].includes(papel)) vm.runInContext(`perfRemoto.chave=perfChave();perfRemoto.tentado=true;perfRemoto.dados={consultadoEm:'2026-11-30T10:00:00',fonte:'teste',periodo:STATE._fPerf,registros:__regs,hash:'h'};perfRemoto.fechamentos=__fech;`, ctx);
  if (existe('perdas.js')) vm.runInContext(`perdasRemoto={chave:perfChave(),revisoes:__rev,carregando:false,erro:'',tentado:true};`, ctx);
  return {ctx, run:c => vm.runInContext(c, ctx), render() { vm.runInContext('renderPerformanceCasa()', ctx); return el.innerHTML; }};
}
const abasDe = html => [...html.matchAll(/data-perf-aba="(\w+)"/g)].map(m => m[1]);
const botaoAba = (html, aba) => (html.match(new RegExp(`<button[^>]*data-perf-aba="${aba}"[^>]*>[^]*?</button>`)) || [''])[0];

test('abas: Conferência logo depois de Rankings; Perdas por retrabalho só para admin e pcp', () => {
  for (const papel of ['admin', 'pcp']) {
    const abas = abasDe(tela({papel, registros:[registro('X1')]}).render());
    assert.deepEqual(abas.slice(0, 2), ['equipe', 'conferencia'], papel);
    assert.ok(abas.includes('perdas'), papel + ' vê a aba de Perdas');
  }
  for (const papel of ['montagem', 'operacao']) {
    const html = tela({papel, aba:'perdas', lista:[card('R1')]}).render();
    const abas = abasDe(html);
    assert.deepEqual(abas.slice(0, 2), ['equipe', 'conferencia'], papel + ' também confere (sem R$)');
    assert.ok(!abas.includes('perdas'), papel + ' não vê a aba de Perdas');
    assert.doesNotMatch(html, /Perdas por retrabalho|Ponto de atenção/, papel);
    assert.match(botaoAba(html, 'equipe'), /aria-pressed="true"/, papel + ' com a aba guardada cai nos Rankings');
  }
  // O crachá sem senha não vê a aba nem o ponto, mesmo com o papel de gestão.
  const toque = tela({papel:'pcp', toque:true, aba:'perdas', lista:[card('R1')], registros:[registro('R1', {retrabalho:true})]}).render();
  assert.doesNotMatch(toque, /data-perf-aba="perdas"|Ponto de atenção|Perdas por retrabalho/);
});

test('Conferência: lançamentos, conferência por entrega e nomes do RH saem dos Rankings e vão para a aba nova', () => {
  const regs = [registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})];
  const ranking = tela({registros:regs, aba:'equipe'}).render();
  assert.doesNotMatch(ranking, /Conferência por entrega|Conferência dos lançamentos|Conferir nomes do PCP/);
  const conf = tela({registros:regs, aba:'conferencia'}).render();
  // TROCADO DE PROPÓSITO (revisão da onda a3, B5): o quadro virou "Apontamentos dos lançamentos", fechado e depois da lista.
  assert.match(conf, /Apontamentos dos lançamentos/);
  assert.ok(conf.indexOf('Apontamentos dos lançamentos') > conf.indexOf('Conferência por entrega'), 'depois da lista: o primeiro Conferir fica no alto');
  assert.doesNotMatch(conf, /<details class="perf-auditoria" open/, 'fechado');
  assert.match(conf, /Conferência por entrega/);
  assert.match(conf, /Conferir nomes do PCP/);
  assert.match(conf, /data-perf-part="C2"/, 'o Conferir continua');
  assert.match(conf, /id="perf-situacao"/, 'os filtros continuam');
  assert.match(conf, /id="perf-busca-os"/);
  assert.match(conf, /id="perf-pdf"/, 'o PDF da conferência continua');
  assert.match(botaoAba(conf, 'conferencia'), /aria-pressed="true"/);
});

test('Conferência: o selo da aba conta as entregas a conferir, o mesmo número que trava o fechamento', () => {
  const t = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'}), registro('C3', {confirmado:false, fonte:'sugestao'})]});
  const botao = botaoAba(t.render(), 'conferencia');
  assert.match(botao, /class="badge perf-aba-selo[^"]*"[^>]*>2</);
  // O período de teste é novembro; a trava de data do Fechar vem antes, então a conta vai num período já terminado.
  assert.match(t.run("perfFechamentoBloqueio({...perfFonteAtual(),periodo:{de:'2026-09-01',ate:'2026-09-30'}},0)"), /2 entregas sem participação confirmada/);
  assert.doesNotMatch(botaoAba(tela({registros:[registro('C1')]}).render(), 'conferencia'), /badge/, 'sem pendência, sem selo');
});

test('Rankings: faixa de atenção no topo quando há entrega a conferir, com o botão que leva à aba', () => {
  const html = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'}), registro('C3', {confirmado:false, fonte:'sugestao'})]}).render();
  assert.match(texto(html), /2 entregas a conferir: as notas só valem depois da conferência/);
  assert.match(html, /class="perf-faixa-conferir"[^]*?data-perf-filtrar="pendente"/);
  assert.ok(html.indexOf('perf-faixa-conferir') < html.indexOf('perf-workspace'), 'a faixa vem antes do ranking');
  assert.match(texto(tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})]}).render()), /1 entrega a conferir: as notas só valem depois da conferência/);
  assert.doesNotMatch(tela({registros:[registro('C1')]}).render(), /perf-faixa-conferir/);
});

test('atalhos dos Rankings ("Conferir as N", "Ver entregas") abrem a aba Conferência já filtrada', () => {
  const t = tela({registros:[registro('C1'), registro('C2', {confirmado:false, fonte:'sugestao'})]});
  let pinturas = 0;
  t.ctx.renderPerformanceCasa = () => { pinturas++; };
  const filtrar = {dataset:{perfFiltrar:'pendente'}}, ver = {dataset:{perfPessoa:'900001', perfFonteMedida:'producao'}};
  const el = {querySelectorAll:sel => sel.includes('data-perf-filtrar') ? [filtrar] : sel.includes('data-perf-pessoa') ? [ver] : [], querySelector:() => null};
  t.ctx.__el = el;
  t.run('wirePerformanceEquipes(__el)');
  filtrar.onclick();
  assert.equal(t.run('STATE._perfAba'), 'conferencia');
  assert.equal(t.run('STATE._perfSituacao'), 'pendente');
  assert.equal(pinturas, 1);
  ver.onclick();
  assert.equal(t.run('STATE._perfAba'), 'conferencia');
  assert.equal(t.run('STATE._perfPessoa'), '900001');
  assert.equal(t.run('STATE._perfSituacao'), 'confirmada');
  assert.equal(pinturas, 2);
});

/* As O.S. do período (fictícias): R1 com retrabalho de Produção, R2 de
   Instalação, R3 sem a origem e S1 sem retrabalho. */
const retrabalhos = () => ({
  lista:[card('R1'), card('R2', {etapaOrigem:'Instalação', causaRaiz:'Erro humano'}), card('R3', {etapaOrigem:'', causaRaiz:''}), card('S1', {...semRetrabalho})],
  registros:[registro('R1', {retrabalho:true}), registro('R2', {retrabalho:true, membros:[pessoa('900001', 'Pessoa Um', 50), pessoa('900003', 'Pessoa Três', 50)]}),
    registro('R3', {retrabalho:true}), registro('S1')]});

/* TROCADO DE PROPÓSITO (onda a3, D-010 e D-011): o ponto de atenção mostra o
   que pede ação: o retrabalho de origem a definir (a gestão define); o de
   produção e o atraso não. E de novo na revisão da onda a3 (M3, pedido do
   dono: "a que perdeu por retrabalho precisa de uma aba e um ponto de atenção
   importante"): ele mostra SEMPRE a perda por retrabalho de instalação, com a
   comissão perdida; a origem a definir diz que o mês não trava, e o botão abre
   a escolha da origem (M2). */
test('ponto de atenção: em todas as abas para admin e pcp, com a perda por retrabalho de instalação e a origem a definir', () => {
  const {lista, registros} = retrabalhos();
  for (const aba of ['equipe', 'conferencia', 'gestao', 'relatorio', 'perdas']) {
    const html = tela({lista, registros, aba}).render();
    assert.match(texto(html), /1 O\.S\. perdeu pontos e comissão por retrabalho de instalação \(R\$\s?12,00 de comissão\)\./, aba);
    assert.match(texto(html), /1 O\.S\. com retrabalho de origem a definir: defina a origem no Status da entrega, no Fechamento da ficha\. Até lá ela não tira nada e a comissão de 2 pessoas fica pendente \(não paga e não perde\); o demonstrativo do mês pode ser aprovado sem ela/, aba);
    assert.doesNotMatch(texto(html), /sem decisão|podem tirar a comissão|pode tirar a comissão/, aba + ': atraso e retrabalho de outra origem não ameaçam a comissão');
    assert.match(html, /class="perf-atencao" role="status"/, aba + ': papel de status, não só cor');
    assert.match(html, /data-perf-ir="perdas"/, aba + ': o botão leva à aba de Perdas');
    assert.match(html, /data-perdas-origem="R3" data-numero="T-R3">Definir a origem da O\.S\. T-R3</, aba + ': e o botão abre a escolha da origem');
  }
  // Com a origem definida (qualquer etapa), sai a parte da origem; a perda continua no ponto.
  const definida = lista.map(c => c.id === 'R3' ? {...c, etapaOrigem:'Arte'} : c);
  const d = texto(tela({lista:definida, registros}).render());
  assert.doesNotMatch(d, /origem a definir: defina/);
  assert.match(d, /1 O\.S\. perdeu pontos e comissão por retrabalho de instalação/);
  // Sem a perda nem a origem a definir, o ponto some.
  const nada = definida.map(c => c.id === 'R2' ? {...c, etapaOrigem:'Medição'} : c);
  assert.doesNotMatch(tela({lista:nada, registros}).render(), /perf-atencao/);
  // Sem retrabalho no período, não há ponto.
  assert.doesNotMatch(tela({lista, registros:registros.filter(r => r.id === 'S1')}).render(), /perf-atencao/);
  // Montagem e operação nunca veem.
  for (const papel of ['montagem', 'operacao']) assert.doesNotMatch(tela({papel, lista, registros}).render(), /perf-atencao/, papel);
});

/* TROCADO DE PROPÓSITO (onda a3): a aba separa as O.S. pela régua: origem a
   definir (em destaque), retrabalho de instalação (perda, com a base e a
   comissão perdida), retrabalho de outra origem (só acompanhamento) e outras
   ocorrências (atraso e retorno antecipado, registrados). A régua fica no topo
   no lugar da "regra pendente". */
test('Perdas: grupos pela régua, a régua no topo, e cada O.S. com a ocorrência e o efeito', () => {
  const {lista, registros} = retrabalhos();
  lista.push(card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'}));
  registros.push(registro('A1'));
  const html = tela({lista, registros, aba:'perdas'}).render(), t = texto(html);
  assert.doesNotMatch(t, /Regra pendente|a decidir pela gestão: ainda não tira/);
  assert.match(t, /A régua das perdas \(decisão do dono, 11\/10\/2026\)/);
  assert.match(t, /Retrabalho de instalação: tira os pontos e a comissão desta O\.S\., de todas as pessoas e equipes dela, inclusive a parcela da montagem interna\./);
  assert.match(t, /Atraso e retorno antecipado: ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  // A ordem dos grupos: o que pede ação primeiro.
  const ordem = ['perf-perdas-g-definir', 'perf-perdas-g-perda', 'perf-perdas-g-outra', 'perf-perdas-g-ocorrencia'].map(id => html.indexOf(`id="${id}"`));
  assert.ok(ordem.every(i => i > 0) && ordem.every((x, i) => !i || x > ordem[i - 1]), JSON.stringify(ordem));
  const grupo = id => texto(html.slice(html.indexOf(`id="perf-perdas-g-${id}"`), html.indexOf('</section>', html.indexOf(`id="perf-perdas-g-${id}"`))));
  assert.match(grupo('definir'), /T-R3[\s\S]*Origem a definir[\s\S]*Pendente: a origem do retrabalho/);
  // TROCADO DE PROPÓSITO (revisão da onda a3, B6): sem o termo interno "pelo motor da comissão".
  assert.match(grupo('perda'), /T-R2[\s\S]*Perda: retrabalho de instalação[\s\S]*Perda automática[\s\S]*Base que deixa de pontuar: R\$\s?1\.200,00[\s\S]*Comissão perdida: R\$\s?12,00 \(1% da base, como o demonstrativo calcularia\)/);
  assert.match(grupo('outra'), /T-R1[\s\S]*origem: Produção[\s\S]*Retrabalho de produção: não tira nada da instalação\./);
  assert.match(grupo('ocorrencia'), /T-A1[\s\S]*Ficha: prazo 05\/11, entrega 08\/11: 3 dias de atraso/);
  // Rótulo trocado na revisão da onda w3 (U9): o ranking não desconta atraso.
  assert.match(grupo('ocorrencia'), /Dia da entrega usado no ranking \(não desconta atraso\): prazo 05\/11, entrega 05\/11: no prazo/);
  assert.match(grupo('ocorrencia'), /Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada\./);
  assert.match(t, /causa: Material/);
  assert.match(t, /marcado por Gestora fictícia em 06\/11\/2026/);
  assert.match(html, /data-os-id="R1"/, 'o número da O.S. abre a ficha');
  assert.equal((html.match(/<article class="perf-perda /g) || []).length, 4, 'R1, R2, R3 e A1; a S1 não tem ocorrência');
  assert.match(botaoAba(html, 'perdas'), /class="badge perf-aba-selo perf-selo-perda"[^>]*>2</, 'o selo vermelho conta a perda e a origem a definir');
});

/* Revisão da onda a3 (o mês fechado manda): o fechamento é o do servidor, com a
   régua das perdas e a marca de cada entrega (perdaNaApuracao); sem ela, o
   selo diria que nenhum retrabalho foi julgado pela régua. */
test('Perdas: com falha comprovada, o valor que deixa de pontuar e a comissão perdida vêm da apuração da comissão', () => {
  const {lista, registros:crus} = retrabalhos();
  const R = require('../regras.js');
  const registros = crus.map(r => r.retrabalho ? {...r, ...R.perdaNaApuracao({retrabalho:true, etapaOrigem:(lista.find(c => c.id === r.id) || {}).etapaOrigem}, r.dia)} : r);
  const fonte = {...fechamento(registros), regraPerdas:'perdas-1'};
  const rev = revisaoDe(fonte, {R1:{...doc, decisao:'falha_comprovada', tipo:'incompleto'}});
  const html = tela({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'perdas'}).render(), t = texto(html);
  // Texto trocado na revisão da onda w3 (R2 e U2) e de novo na revisão da onda a3 (D-004 nos pontos): a falha comprovada tira os pontos também no ranking.
  assert.match(t, /Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\./);
  assert.match(t, /Base que deixa de gerar comissão: R\$\s?1\.200,00/);
  assert.match(t, /Comissão perdida: R\$\s?12,00/);
  assert.match(t, /revisão 1/);
  // TROCADO DE PROPÓSITO (onda a3 e revisão da onda a3, M3): o ponto conta a origem a definir (R3) e a perda por retrabalho de instalação (R2), não a falha comprovada.
  assert.match(t, /1 O\.S\. com retrabalho de origem a definir/);
  assert.match(t, /1 O\.S\. perdeu pontos e comissão por retrabalho de instalação/);
});

test('ninguém sem papel vê R$: montagem e operação na Conferência, sem aba de Perdas e sem ponto', () => {
  const lista = [card('L1', {valorTotal:4321})];
  for (const papel of ['montagem', 'operacao']) {
    const t = tela({papel, lista, aba:'conferencia'});
    const html = t.render();
    // Desde a U2 da auditoria de 12/10/2026, a aba diz que a conferência é da gestão (sem a lista com percentuais).
    assert.match(html, /A conferência de quem fez cada entrega, e com qual parte, é da gestão do PCP/, papel);
    assert.doesNotMatch(texto(html), /R\$|4\.321/, papel + ' não vê valor');
    assert.equal(t.run('perdasDados()'), null, papel);
    assert.equal(t.run('perdasPontoHTML(perdasDados())'), '', papel);
  }
});

test('decisão da comissão: o diálogo mostra a ocorrência julgada (retrabalho, réguas do atraso, retorno e abono)', () => {
  const c = card('R1', {finalizadaEm:'2026-11-08T15:00:00-03:00',
    retornoPrevisto:[{dia:'2026-11-08', hora:'16:30'}], retornoConferido:{dia:'2026-11-08', hora:'15:40', por:'Gestora fictícia', em:'2026-11-08T18:41:00Z'},
    abonos:[{id:'ab-ficticio-2', ocorrenciaId:'R1:retorno_antecipado:2026-11-08', motivo:'Cliente liberou a equipe mais cedo', por:'Gestora fictícia', em:'2026-11-08T19:00:00Z',
      medida:{dia:'2026-11-08', chegada:'2026-11-08T15:40', previsto:'2026-11-08T16:30'}}]});
  const regs = [registro('R1', {retrabalho:true})];
  const t = tela({lista:[c], registros:regs});
  let corpo = '';
  const campo = () => ({value:'', textContent:'', disabled:false});
  t.ctx.perfDialog = (titulo, html) => { corpo = html; return {classList:{add() {}}, querySelectorAll:() => [], querySelector:campo}; };
  t.ctx.__fonte = fechamento(regs);
  t.run('comissaoEditar(__fonte, null, __fonte.periodo, null, [])');
  const tx = texto(corpo);
  assert.match(tx, /Responsabilidade · O\.S\. T-R1 · Retrabalho, atraso e retorno antecipado/);
  assert.match(tx, /Ocorrência em julgamento/);
  // TROCADO DE PROPÓSITO (onda a3, D-010): a origem vem com o efeito da régua.
  assert.match(tx, /origem: Produção · causa: Material/);
  assert.match(tx, /Retrabalho de produção: não tira nada da instalação\./);
  assert.match(tx, /marcado por Gestora fictícia em 06\/11\/2026/);
  assert.match(tx, /Ficha: prazo 05\/11, entrega 08\/11: 3 dias de atraso/);
  assert.match(tx, /Dia da entrega usado no ranking \(não desconta atraso\): prazo 05\/11, entrega 05\/11: no prazo/);
  assert.match(tx, /Retorno antecipado em 08\/11: 50 minutos antes do retorno previsto/);
  assert.match(tx, /Abono do retorno antecipado: Cliente liberou a equipe mais cedo/);
  // Sem a ficha no aparelho, o diálogo diz o que sabe.
  const sem = tela({registros:regs});
  sem.ctx.perfDialog = t.ctx.perfDialog; sem.ctx.__fonte = fechamento(regs);
  sem.run('comissaoEditar(__fonte, null, __fonte.periodo, null, [])');
  assert.match(texto(corpo), /A ficha desta O\.S\. não está neste aparelho/);
});

test('perdas.js entra no index.html depois da performance e no SHELL do sw.js com a versão atual; o celular não muda', () => {
  const idx = ler('index.html'), v = (idx.match(/performance\.js\?v=(v\d+)/) || [])[1];
  assert.ok(v, 'versão do index.html');
  assert.match(idx, new RegExp(`<script src="perdas\\.js\\?v=${v}"></script>`));
  assert.ok(idx.indexOf('perdas.js') > idx.indexOf('performance.js'), 'depois da performance.js');
  assert.ok(/const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1].includes(`'perdas.js?v=${v}'`), 'no SHELL do sw.js');
  assert.doesNotMatch(ler('equipe.html'), /perdas\.js/, 'o celular do instalador não carrega');
});

/* A 375 px a barra de abas rola de lado. O texto do leitor de tela do selo
   (perf-sr, position:absolute) escapava da barra e alargava a página para 442
   px (achado na prévia). Preso no botão (position:relative), não escapa. */
test('375 px: o texto do leitor de tela do selo fica preso no botão da aba e não alarga a página', () => {
  const css = ler('performance-layout.css');
  assert.match(css, /#panel-performance \.perf-page-tabs button\{position:relative\}/);
  assert.match(ler('styles.css'), /\.perf-sr\{position:absolute!important/, 'o perf-sr é absoluto: sem o botão posicionado, ele foge da barra');
});

/* TROCADO DE PROPÓSITO (onda a3): a origem a definir vem da ficha e da
   apuração, não das decisões da comissão: o ponto aparece sem esperar a
   leitura das decisões, e reler não o faz piscar. A decisão gravada sem
   documento completo (U4), que depende das decisões, espera a leitura. */
test('ponto de atenção: a origem a definir não espera as decisões da comissão e não pisca ao reler', () => {
  const {lista, registros} = retrabalhos();
  const t = tela({lista, registros});
  t.run(`perdasRemoto={chave:'',revisoes:null,carregando:false,erro:'',tentado:false};`);
  assert.match(t.render(), /perf-atencao/, 'a origem a definir não depende das decisões');
  t.run(`perdasRemoto={chave:perfChave(),revisoes:[],carregando:false,erro:'',tentado:true};`);
  assert.match(t.render(), /perf-atencao/);
  t.run('perdasInvalidar()');
  assert.match(t.render(), /perf-atencao/, 'reler não esconde o que já foi lido');
  t.run(`perdasRemoto={chave:perfChave(),revisoes:[],carregando:true,erro:'',tentado:true};`);
  assert.match(t.render(), /perf-atencao/, 'durante a consulta nova, o ponto fica');
  // Sem a origem a definir e sem a perda, e sem decisões lidas: nada a acusar.
  // (Revisão da onda a3, M3: a perda por retrabalho de instalação sempre aparece; aqui a R2 é de medição.)
  const definida = tela({lista:lista.map(c => c.id === 'R3' ? {...c, etapaOrigem:'Arte'} : c.id === 'R2' ? {...c, etapaOrigem:'Medição'} : c), registros});
  definida.run(`perdasRemoto={chave:'',revisoes:null,carregando:false,erro:'',tentado:false};`);
  assert.doesNotMatch(definida.render(), /perf-atencao/);
});

/* O "conferir no RH" do Conferir abria o quadro PCP × RH procurando-o na
   página; o quadro mudou para a aba Conferência, e do Relatório (painéis) o
   clique não fazia nada. Agora a aba troca antes de abrir o quadro. */
test('o atalho para o quadro PCP × RH abre a aba Conferência quando o quadro não está na tela', () => {
  const t = tela({registros:[registro('C1')]});
  const quadro = {open:false, rolou:false, scrollIntoView() { this.rolou = true; }};
  let pintou = false;
  t.ctx.renderPerformanceCasa = () => { pintou = true; };
  t.ctx.document.querySelector = sel => sel === '[data-quadro="perf-rh"]' && pintou ? quadro : null;
  t.run('STATE._perfAba="relatorio"; perfIrParaQuadroRH()');
  assert.equal(t.run('STATE._perfAba'), 'conferencia');
  assert.equal(quadro.open, true);
  assert.equal(quadro.rolou, true);
});
