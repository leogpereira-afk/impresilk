'use strict';
/* REVISÃO DA ONDA A3 (a régua das perdas, D-010 e D-011; 11/10/2026).
   Duas revisões leram a onda a3: a de dinheiro e servidor (achados 1 a 8) e a
   de uso e tela (M1 a M4 e B1 a B6). As decisões que vieram com elas (do dono
   ou da sessão principal, já avisadas a ele) estão em docs/DECISOES.md, nas
   notas da D-004, da D-010 e da D-011:
   - a falha comprovada julgada no demonstrativo zera os PONTOS e a comissão da
     O.S. (o texto da D-004): ranking, Nota, Conferência, Por O.S., ranking dos
     funcionários e Relatório leem a decisão, no aparelho e no servidor;
   - a origem a definir não trava o mês; toda troca de origem pede motivo; a
     régua de cada dia; o mês fechado manda na aba Perdas; os centavos da
     comissão perdida pela conta acumulada; o histórico da origem sem nome nem
     motivo para quem não é da gestão; o ponto de atenção mostra sempre a perda.
   Cada teste "revisão a3: ..." começa pelo caso ruim (o comportamento do
   02307fc) e falha nele. Os servidores são os de verdade (tests/helpers/
   edge.cjs) com banco falso; as telas rodam num vm. Dados fictícios: o
   repositório é público. */
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('./helpers/lote-bancada.cjs');
const {assert, O, edge, noServidor, osRow, FICHAS, GESTOR, OPERA, MONTAGEM, TOQUE, js} = B;
const R = require('../regras.js');
const P = require('../performance.js');
const PD = require('../performance-dashboards.js');
const C = require('../comissao.js');
const PERDAS = require('../perdas.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const texto = html => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const HOJE = '2026-12-02';
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const MOTIVO = 'Vistoria fictícia mostrou peça com defeito de fábrica';
const longe = q => ({...q, exp:Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000)});
const COMERCIAL = {papel:'comercial', nome:'Comercial Teste', sub:'comercial1'};
const [gestor, opera, montagem, toque, comercial] = [GESTOR, OPERA, MONTAGEM, TOQUE, COMERCIAL].map(longe);
// O relógio anda 1 ms a cada leitura (perfFonte confere "a base mudou durante a consulta").
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const pessoa = (chave, nome, percentual) => ({chave, nome, percentual});
const MEMBROS = [pessoa('100001', 'Ana Fictícia', 60), pessoa('100002', 'Bia Fictícia', 40)];

/* ═══════════════ o servidor de novembro (o mesmo arranjo de tests/retrabalho-instalacao.test.cjs) ═══════════════ */
const osDoBanco = (id, extra = {}) => ({colecao:'os', id, apagado:false, atualizado_em:'2020-01-01', registro:{id, numero:'T-' + id, tipo:'externo',
  cliente:'Cliente fictício ' + id, finalizadaEm:'2026-11-10T15:00:00Z', equipe:['100001', '100002'], valorTotal:1200, rev:1, ...extra}});
async function servidor(retrabalho, {extraOS = [], hoje = HOJE} = {}) {
  const os = [osDoBanco('osR', retrabalho), osDoBanco('osN', {valorTotal:800}), ...extraOS];
  const e = await edge('pcp-sync', {pcp_registros:os, registros:structuredClone(FICHAS),
    equipe_contas:[{sistema:'pcp', usuario:'montagem1'}, {sistema:'pcp', usuario:'operacao1'}, {sistema:'pcp', usuario:'comercial1'}],
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{instaladores:['Ana'],
      performancePCP:{equipes:[], participacoes:os.map(o => ({id:o.id, membros:MEMBROS, por:'Gestor', em:'2026-11-10'}))}}}],
    painel_ordens:[]});
  relogio(e, hoje + 'T12:00:00Z');
  return e;
}
let _pedido = 0;
const pedido = base => `${base}-${String(++_pedido).padStart(6, '0')}`;
async function fechar(e, anterior = '') {
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.equal(fonte.status, 200, JSON.stringify(fonte));
  const fech = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior, requestId:pedido('fechar-rv'), motivo:'Fechamento fictício',
    leGrupos:true, leEntregasItens:true, notaPorValor:true}, gestor);
  assert.equal(fech.ok, true, JSON.stringify(fech));
  return {fonte, f:fech.fechamento};
}
const entregasDoc = regs => Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:'100001'}], interna:{...doc, situacao:'nao_aplicavel'}}]));
async function previa(e, f, decisoes, extra = {}) {
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes, entregas:entregasDoc(f.registros)};
  const p = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.id, anterior:extra.anterior || '', entrada, motivo:'Prévia fictícia', requestId:pedido('previa-rv')}, gestor);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.revisao;
}
const aprovar = (e, p) => e.call({action:'performanceComissaoAprovar', ...NOV, anterior:p.id, hash:p.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:pedido('aprova-rv')}, gestor);
const semFalha = {...doc, decisao:'sem_falha', tipo:'nenhuma'};
const falha = {...doc, decisao:'falha_comprovada', tipo:'incompleto'};
const linhaDe = (rev, osId) => rev.apuracao.linhas.find(l => l.osId === osId);
const statusDe = c => O.statusEntrega(c, HOJE, R.REGRA_EMBUTIDA);

/* ═══════════════ a tela da Performance num vm (o mesmo arranjo de tests/perdas-abas.test.cjs) ═══════════════ */
const card = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, tipo:'externo', instalacao:{data:'2026-11-05'},
  prazoCombinado:{data:'2026-11-05', fonte:'agenda'}, finalizadaEm:'2026-11-05T15:00:00-03:00', equipe:['900001', '900002'], valorTotal:1200,
  retrabalho:true, problema:'Adesivo descolou na borda', etapaOrigem:'Produção', causaRaiz:'Material', responsavelEtapa:'Setor fictício',
  dataRetrabalho:'2026-11-06', retrabalhoPerguntado:{resposta:'sim', por:'Gestora fictícia', em:'2026-11-06T10:15:00-03:00'}, ...extra});
const semRetrabalho = {retrabalho:false, problema:'', etapaOrigem:'', causaRaiz:'', retrabalhoPerguntado:{resposta:'nao', por:'Gestora fictícia', em:'2026-11-08T10:00:00-03:00'}};
const registro = (id, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício ' + id, dia:'2026-11-05', valor:1200, origemValor:'O.S. do PCP',
  membros:[pessoa('900001', 'Pessoa Um', 60), pessoa('900002', 'Pessoa Dois', 40)], confirmado:true, fonte:'participacao', retrabalho:false, ...extra});
// O registro como a apuração do servidor manda: com a régua do dia (etapaOrigem e perda) quando há retrabalho.
const comRegua = (r, etapaOrigem) => r.retrabalho ? {...r, ...R.perdaNaApuracao({retrabalho:true, etapaOrigem}, r.dia)} : r;
const fechamentoDe = regs => ({id:'fechamento-ficticio-1', revisao:1, fechadoEm:'2026-12-01T10:00:00Z', fechadoPor:'Gestora fictícia', periodo:{...NOV}, ...NOV, regraPerdas:'perdas-1', registros:regs});
function revisaoDe(fonte, decisoes, n = 1) {
  const entrada = {config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes,
    entregas:Object.fromEntries(fonte.registros.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:r.membros[0].chave}], interna:{...doc, situacao:'nao_aplicavel'}}]))};
  return {...NOV, id:'2026-11-01:2026-11-30:00000' + n, revisao:n, tipo:'previa', em:'2026-12-01T11:00:00Z', fechamentoId:fonte.id, entrada, apuracao:C.apurar(fonte, entrada, {aprovacoes:[]})};
}
function telaPerf({papel = 'pcp', aba = 'equipe', modo = '', lista = [], registros = [], revisoes = [], fechamentos = []} = {}) {
  const el = {innerHTML:'', querySelectorAll:() => [], querySelector:() => null};
  const ctx = vm.createContext({console,
    STORE:{getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[], performancePCP:{equipes:[], participacoes:[]}}), saveCFG() {}, uuid:() => 'id-1',
      elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), entreguesMes:() => null, pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), getQueue:() => []},
    STATE:{user:{papel}, _perfAba:aba, _fPerf:{...NOV}, ...(modo ? {_perfModo:modo} : {})},
    document:{getElementById:() => el, querySelectorAll:() => [], querySelector:() => null, body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState:() => '', bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', wireFiltroPeriodo() {}, abrirTVCasa() {}, perfCompartilharRanking() {},
    CSS:{escape:x => x}, parseLocalDate:() => null, pessoaDoElenco:() => null, crachaEhToque:() => false,
    // O R$ só para admin e pcp (app.js, podeVerValores).
    podeVerValores:() => ['admin', 'pcp'].includes(papel)});
  for (const f of ['operacao-revisao.js', 'operacao.js', 'divisao.js', 'regras.js', 'privacidade-valores.js', 'casa.js', 'relatorios-entregas.js', 'comissao.js', 'comissao-ui.js', 'performance.js', 'performance-dashboards.js', 'perdas.js']) vm.runInContext(ler(f), ctx, {filename:f});
  ctx.__regs = registros; ctx.__rev = revisoes; ctx.__fech = fechamentos;
  if (['admin', 'pcp'].includes(papel)) vm.runInContext(`perfRemoto.chave=perfChave();perfRemoto.tentado=true;perfRemoto.dados={consultadoEm:'2026-11-30T10:00:00',fonte:'teste',periodo:STATE._fPerf,registros:__regs,hash:'h'};perfRemoto.fechamentos=__fech;`, ctx);
  vm.runInContext(`perdasRemoto={chave:perfChave(),revisoes:__rev,cobrem:[],carregando:false,erro:'',tentado:true};`, ctx);
  return {ctx, run:c => vm.runInContext(c, ctx), render() { vm.runInContext('renderPerformanceCasa()', ctx); return el.innerHTML; }};
}
// Um "el" falso para os wires: guarda os botões achados pelo seletor, para o teste clicar.
const elFalso = botoes => ({querySelectorAll:sel => Object.entries(botoes).filter(([k]) => sel.includes(k)).flatMap(([, v]) => v), querySelector:() => null});
// O registro dos painéis (PERF_DASH): a mesma dupla, a mesma equipe.
const reg = (id, valor, extra = {}) => ({id, numero:'T-' + id, cliente:'Cliente fictício', dia:'2026-11-10', valor, confirmado:true,
  membros:[pessoa('900001', 'Pessoa Um', 60), pessoa('900002', 'Pessoa Dois', 40)], equipeId:'eq-1', equipeNome:'Equipe Fictícia', retrabalho:false, ...extra});

/* ═══════════════ (1) e M1: os painéis e o cabeçalho do Relatório somam como as equipes ═══════════════ */
test('revisão a3: os painéis do Relatório somam a produção, o valor e a evolução como as equipes (a entrega sem pontos conta zero)', () => {
  const regs = [reg('osR', 1200, {retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}), reg('osF', 500, {perda:'falha_comprovada'}), reg('osN', 800)];
  const m = PD.montar(regs, {perf:P, periodo:NOV, verValores:true});
  const soma = k => m.equipes.reduce((s, e) => s + (e[k] || 0), 0);
  // Caso ruim: a "Produção confirmada" dizia 3 O.S. eq. e o "Valor confirmado" R$ 2.500,00, com as equipes em 1 e R$ 800,00.
  assert.deepEqual([soma('equivalentes'), soma('valor')], [1, 800], 'premissa: as equipes (PERF.resumir) zeram a entrega sem pontos');
  assert.equal(m.total.equivalentes, soma('equivalentes'), 'Produção confirmada = soma das equipes');
  assert.equal(m.total.valor, soma('valor'), 'Valor confirmado = soma das equipes');
  const dia = m.dias.find(d => d.dia === '2026-11-10');
  assert.deepEqual([dia.equivalentes, dia.valor], [1, 800], 'a evolução por dia também');
  assert.deepEqual([m.semanas.reduce((s, x) => s + x.equivalentes, 0)], [1]);
  // O cabeçalho do Relatório ("Valor das entregas com participação confirmada"): a mesma conta das equipes do dossiê.
  assert.equal(P.valorDasConfirmadas(regs).valor, P.dossie(regs).reduce((s, g) => s + g.valor, 0));
  assert.equal(P.valorDasConfirmadas(regs).valor, 800);
  // E na tela: o cabeçalho e o painel dizem R$ 800,00.
  const t = telaPerf({aba:'relatorio', lista:[card('osR', {etapaOrigem:'Instalação'}), card('osN', {...semRetrabalho})],
    registros:[registro('osR', {retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}), registro('osN', {valor:800})]});
  const tx = texto(t.render());
  assert.match(tx, /Valor das entregas com participação confirmada R\$\s?800,00/);
  assert.doesNotMatch(tx, /Valor das entregas com participação confirmada R\$\s?2\.000,00/);
});

test('revisão a3: "Onde agir agora" e a Qualidade dizem o retrabalho por origem, com o botão para a aba Perdas (só para quem a vê)', () => {
  const regs = [reg('osI', 1200, {retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}), reg('osP', 500, {retrabalho:true, etapaOrigem:'Produção'}),
    reg('osD', 300, {retrabalho:true, etapaOrigem:''}), reg('osN', 800)];
  const m = PD.montar(regs, {perf:P, periodo:NOV, verValores:true, podePerdas:true});
  const html = PD.html(m, {vista:'geral'}) + PD.html(m, {vista:'qualidade'}), tx = texto(html);
  // Caso ruim: "A marca precisa de análise e responsabilidade; este painel não aplica punição nem calcula comissão" e "responsabilidade a conferir".
  assert.doesNotMatch(tx, /precisa de análise e responsabilidade|não aplica punição|responsabilidade a conferir/);
  assert.match(tx, /3 O\.S\. com retrabalho: 1 de instalação \(sem pontos e sem comissão\); 1 de medição, arte ou produção \(não tira nada da instalação\); 1 com a origem a definir \(pendente até a gestão definir\)\. O detalhe de cada uma está na aba Perdas por retrabalho\./);
  assert.match(tx, /1 de instalação \(sem pontos e sem comissão\) · 1 de medição, arte ou produção/, 'o cartão da Qualidade');
  assert.match(html, /data-perf-ir="perdas"[^>]*>Ver a aba Perdas por retrabalho</);
  // Montagem e operação não têm a aba Perdas: nem o botão nem a frase.
  const semAba = PD.montar(regs, {perf:P, periodo:NOV, verValores:false});
  const h2 = PD.html(semAba, {vista:'geral'}) + PD.html(semAba, {vista:'qualidade'});
  assert.doesNotMatch(h2, /data-perf-ir="perdas"|aba Perdas por retrabalho/);
});

/* ═══════════════ D-004 nos pontos: a falha comprovada sai do ranking, da Nota, da Conferência e do Relatório ═══════════════ */
test('revisão a3: a falha comprovada julgada no demonstrativo tira os pontos da O.S. no ranking, na Nota, na Conferência e no Relatório (aparelho)', () => {
  const lista = [card('R1'), card('S1', {...semRetrabalho})];
  const registros = [comRegua(registro('R1', {retrabalho:true}), 'Produção'), registro('S1')];
  const fonte = fechamentoDe(registros);
  const rev = revisaoDe(fonte, {R1:falha, S1:semFalha});
  assert.equal(linhaDe(rev, 'R1').decisao, 'falha_comprovada', 'premissa: o motor aceitou a falha comprovada');
  // Caso ruim: os Rankings contavam a O.S. julgada (60% de R$ 2.400 = R$ 1.440,00), e a aba Perdas dizia que o ranking "ainda conta esta O.S.".
  const ranking = texto(telaPerf({lista, registros, revisoes:[rev], fechamentos:[fonte], modo:'pessoas'}).render());
  assert.match(ranking, /R\$\s?720,00/, 'só a S1 conta para a Pessoa Um (60% de R$ 1.200)');
  assert.doesNotMatch(ranking, /R\$\s?1\.440,00/);
  const composicoes = telaPerf({lista, registros, revisoes:[rev], fechamentos:[fonte], modo:'composicoes'}).render();
  assert.match(composicoes, /1 sem pontos: falha comprovada/);
  // A Nota (o valor confirmado de cada pessoa) e o ranking pela mesma régua do motor.
  const regs = C.comFalhasComprovadas(registros, C.demonstrativosVigentes([rev], NOV));
  assert.deepEqual(regs.map(r => [r.id, r.perda || '']), [['R1', 'falha_comprovada'], ['S1', '']]);
  assert.equal(P.avaliar(regs, {producao:60, limpeza:20, equipamentos:20}, {porValor:true}).pessoas.find(p => p.chave === '900001').valorConfirmado, 720);
  assert.deepEqual(P.resumir(regs).equipes.map(e => [e.equivalentes, e.valor, e.falhaComprovada]), [[1, 1200, 1]]);
  // A Conferência diz por que a entrega não pontua, e de qual demonstrativo.
  const conf = texto(telaPerf({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'conferencia'}).render());
  assert.match(conf, /Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\. \(demonstrativo de 01\/11\/2026 a 30\/11\/2026, revisão 1, prévia\)\./);
  // O Relatório: o cabeçalho e o painel sem a O.S. julgada.
  const rel = texto(telaPerf({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'relatorio'}).render());
  assert.match(rel, /Valor das entregas com participação confirmada R\$\s?1\.200,00/);
  assert.match(rel, /1 sem pontos \(falha comprovada\)/);
  // A aba Perdas diz a mesma coisa (sem o aviso antigo).
  const perdas = texto(telaPerf({lista, registros, revisoes:[rev], fechamentos:[fonte], aba:'perdas'}).render());
  assert.match(perdas, /Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\./);
  assert.doesNotMatch(perdas, /ainda conta esta O\.S\.|não lê a decisão da comissão/);
  // Sem revisão da comissão, nada muda.
  assert.match(texto(telaPerf({lista, registros, revisoes:[], fechamentos:[fonte], modo:'pessoas'}).render()), /R\$\s?1\.440,00/);
});

test('revisão a3: sem as decisões da comissão (consulta que falhou), os Rankings e o Relatório dizem que a falha comprovada pode não aparecer', () => {
  const t = telaPerf({lista:[card('R1')], registros:[registro('R1', {retrabalho:true})]});
  t.run(`perdasRemoto={chave:perfChave(),revisoes:null,cobrem:null,carregando:false,erro:'Sem conexão com o servidor. Tente de novo.',tentado:true};`);
  // Caso ruim: o ranking contava a O.S. calado, como se nenhuma falha tivesse sido julgada.
  const rank = t.render();
  assert.match(texto(rank), /Não foi possível ler as decisões da comissão \(Sem conexão com o servidor\. Tente de novo\.\)\. Até ler, a falha comprovada julgada no demonstrativo pode não aparecer nestes números\./);
  assert.match(rank, /data-perdas-atualizar>Tentar de novo</);
  t.run(`STATE._perfAba='relatorio'`);
  assert.match(texto(t.render()), /Não foi possível ler as decisões da comissão/);
  // Lidas (mesmo sem nenhuma revisão), nada a avisar.
  t.run(`STATE._perfAba='equipe'; perdasRemoto={chave:perfChave(),revisoes:[],cobrem:[],carregando:false,erro:'',tentado:true};`);
  assert.doesNotMatch(t.render(), /Não foi possível ler as decisões/);
});

test('revisão a3: a decisão vale no período do demonstrativo que a julgou; compensação no topo vale a anterior; a recusada não tira nada', () => {
  // Outubro julgou a O.S. como falha; novembro (outra entrega da mesma O.S.) julgou sem falha (P-010 aberta: outro mês segue o demonstrativo dele).
  const out = {de:'2026-10-01', ate:'2026-10-31', id:'out:1', revisao:1, tipo:'aprovacao', em:'2026-11-02T10:00:00Z', entrada:{decisoes:{X:falha}},
    apuracao:{linhas:[{osId:'X', decisao:'falha_comprovada', pendencias:[]}]}};
  const nov = {...NOV, id:'nov:1', revisao:1, tipo:'previa', em:'2026-12-02T10:00:00Z', entrada:{decisoes:{X:semFalha}}, apuracao:{linhas:[{osId:'X', decisao:'sem_falha', pendencias:[]}]}};
  const demos = C.demonstrativosVigentes([out, nov], NOV);
  assert.equal(C.falhaComprovadaNoDia(demos, 'X', '2026-10-20').revisao, 1);
  assert.equal(C.falhaComprovadaNoDia(demos, 'X', '2026-11-05'), null, 'novembro segue o demonstrativo dele');
  // A compensação no topo do período: vale a última que não é compensação (a mesma escolha da aba Perdas).
  const comp = {...out, id:'out:2', revisao:2, apuracao:{compensacaoDe:'out:1', linhas:[]}};
  assert.ok(C.falhaComprovadaNoDia(C.demonstrativosVigentes([out, comp], NOV), 'X', '2026-10-20'));
  // A falha "de produção" o motor recusa: não tira nada.
  const recusada = {...out, id:'out:3', revisao:3, apuracao:{linhas:[{osId:'X', decisao:'falha_comprovada', pendencias:['Produção, cliente ou ausência de ocorrência não comprovam falha da instalação.']}]}};
  assert.equal(C.falhaComprovadaNoDia(C.demonstrativosVigentes([recusada], NOV), 'X', '2026-10-20'), null);
  // A mesma escolha da aba Perdas (decisaoDaOS) nos casos de cada lado.
  for (const r of [out, nov, recusada]) assert.equal(PERDAS.decisaoDaOS('X', r).codigo === 'falha_comprovada', !!C.falhaComprovadaNoDia(C.demonstrativosVigentes([r], NOV), 'X', r.de === '2026-10-01' ? '2026-10-20' : '2026-11-05'), r.id);
});

test('revisão a3: o ranking dos funcionários (servidor) lê a falha comprovada do demonstrativo, sem mexer no fechamento', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Produção', problema:'Lona manchada'});
  const {f} = await fechar(e);
  const antes = await e.call({action:'performanceRankingEquipe', ...NOV}, toque);
  assert.equal(antes.status, 200, JSON.stringify(antes));
  assert.deepEqual([antes.equipes[0].equivalentes, antes.equipes[0].falhaComprovada], [2, undefined], 'sem revisão, nada muda');
  const p = await previa(e, f, {osR:falha, osN:semFalha});
  assert.equal(linhaDe(p, 'osR').comissaoCentavos, 0, 'premissa: o motor zera a comissão da O.S. julgada');
  relogio(e, '2026-12-02T12:05:00Z'); // passa o minuto do cache do ranking
  // Caso ruim: o ranking dos funcionários contava a O.S. julgada falha comprovada (2 O.S. equivalentes).
  const depois = await e.call({action:'performanceRankingEquipe', ...NOV}, toque);
  assert.deepEqual([depois.equipes[0].equivalentes, depois.equipes[0].entregas, depois.equipes[0].falhaComprovada, depois.resumo.falhaComprovada], [1, 2, 1, 1]);
  assert.ok(!JSON.stringify(depois).includes('osR') && !JSON.stringify(depois).includes('falha_comprovada'), 'nenhuma O.S. nem decisão desce ao crachá');
  // O fechamento e o hash dele não mudam: aprovar (que recalcula o selo) continua passando.
  const ap = await aprovar(e, p);
  assert.equal(ap.ok, true, JSON.stringify(ap));
});

/* ═══════════════ (2): o mês fechado manda na aba Perdas ═══════════════ */
test('revisão a3: no mês fechado, a aba Perdas diz o que o demonstrativo aplicou, e a ficha diferente vira aviso', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  const {f} = await fechar(e);
  const p = await previa(e, f, {osN:semFalha});
  const ap = await aprovar(e, p);
  assert.equal(ap.ok, true, JSON.stringify(ap));
  // Quem discorda troca a origem, com motivo, depois do fechamento e da aprovação.
  await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Produção', etapaOrigemMotivo:MOTIVO}}, gestor);
  const atual = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  const m = PERDAS.montar({registros:atual.registros, card:id => noServidor(e, id), status:statusDe, revisao:ap.revisao});
  const l = m.linhas.find(x => x.osId === 'osR'), lR = linhaDe(ap.revisao, 'osR');
  // Caso ruim: a aba dizia "Retrabalho de produção: não tira nada", "a decidir pela gestão" e não contava a perda que o demonstrativo aprovado aplicou.
  assert.equal(l.grupo, 'perda');
  assert.equal(l.decisao.codigo, 'retrabalho_instalacao', 'a perda automática conta como decidida');
  assert.equal(l.efeito, 'Retrabalho de instalação: tira os pontos e a comissão desta O.S.');
  assert.equal(l.avisoFicha, 'Na ficha, a origem do retrabalho hoje é Produção (não tira nada da instalação). A troca só vale com nova revisão e compensação.');
  assert.deepEqual([l.perda.valorCentavos, l.perda.comissaoCentavos, l.perda.doDemonstrativo], [lR.baseLiquidaCentavos, lR.comissaoPerdidaCentavos, true]);
  assert.equal(m.resumo.comissaoCentavos, lR.comissaoPerdidaCentavos);
  // Na tela: o cartão diz o que o demonstrativo aplicou, com o aviso; a lista da ocorrência não repete o efeito da ficha de hoje.
  const t = telaPerf({lista:[noServidor(e, 'osR'), noServidor(e, 'osN')], registros:atual.registros, revisoes:[ap.revisao], fechamentos:[f], aba:'perdas'});
  const html = t.render(), cartao = html.slice(html.indexOf('<article class="perf-perda perf-perda-falha"'), html.indexOf('</article>', html.indexOf('<article class="perf-perda perf-perda-falha"')));
  assert.match(cartao, /Perda: retrabalho de instalação/);
  assert.match(texto(cartao), /Lida da revisão 2 da comissão, aprovada/);
  assert.match(texto(cartao), /Na ficha, a origem do retrabalho hoje é Produção \(não tira nada da instalação\)\. A troca só vale com nova revisão e compensação\./);
  assert.doesNotMatch(texto(cartao), /Retrabalho de produção: não tira nada da instalação|toque em Atualizar|data-perf-atualizar/);
  assert.match(texto(html), /R\$\s?12,00 de comissão perdida/, 'o total soma a perda aplicada');
  // O inverso: o demonstrativo aprovado PAGOU (origem Produção) e a ficha passou a Instalação: nada de "comissão perdida".
  const e2 = await servidor({retrabalho:true, etapaOrigem:'Produção', problema:'Lona manchada'});
  const {f: f2} = await fechar(e2);
  const p2 = await previa(e2, f2, {osR:semFalha, osN:semFalha});
  const ap2 = await aprovar(e2, p2);
  assert.equal(linhaDe(ap2.revisao, 'osR').comissaoCentavos, 1200);
  await e2.call({action:'upsert', os:{...noServidor(e2, 'osR'), etapaOrigem:'Instalação', etapaOrigemMotivo:MOTIVO}}, gestor);
  const atual2 = await e2.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  const m2 = PERDAS.montar({registros:atual2.registros, card:id => noServidor(e2, id), status:statusDe, revisao:ap2.revisao});
  const l2 = m2.linhas.find(x => x.osId === 'osR');
  assert.equal(l2.grupo, 'outra', 'não soma uma perda que não foi aplicada');
  assert.equal(l2.perda, null);
  assert.equal(m2.resumo.comissaoCentavos, null);
  assert.match(l2.avisoFicha, /^Na ficha, a origem do retrabalho hoje é Instalação \(tira os pontos e a comissão desta O\.S\.\)\. A troca só vale com nova revisão e compensação\.$/);
  // O resumo do demonstrativo que cobre outro recorte leva a perda da linha (a aba lê o grupo dela).
  const q = await e.call({action:'performanceComissaoListar', de:'2026-11-01', ate:'2026-11-15'}, gestor);
  const lc = q.cobrem[0].apuracao.linhas.find(x => x.osId === 'osR');
  assert.deepEqual([lc.perda, lc.comissaoPerdidaCentavos], ['retrabalho_instalacao', 1200]);
});

/* ═══════════════ (3): centavos ═══════════════ */
test('revisão a3: a comissão perdida é a que seria paga, ao centavo, pela conta acumulada da O.S.; a aba usa a mesma conta', async () => {
  const M = [pessoa('100001', 'Ana Fictícia', 60), pessoa('100002', 'Bia Fictícia', 40)];
  const parte = (id, entregaId, dia, valor, fracaoOS, extra = {}) => ({id, osId:'osX', entregaId, numero:'T-1', dia, valor, fracaoOS, confirmado:true, membros:M, retrabalho:false, ...extra});
  const entrada = regs => ({config:{modo:'teste', criteriosExtras:'somente_falha_comprovada'}, decisoes:{osX:semFalha},
    entregas:Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:'100001'}], interna:{...doc, situacao:'nao_aplicavel'}}]))});
  const semPerda = [parte('osX::entrega:e1', 'e1', '2026-11-05', 1234.50, 0.617), parte('osX::entrega:e2', 'e2', '2026-11-20', 765.50, 0.383)];
  const pago = C.apurar({id:'f1', fechadoEm:'2026-12-01', periodo:NOV, registros:semPerda}, entrada(semPerda));
  const seriaPago = pago.linhas.reduce((s, l) => s + l.comissaoCentavos, 0);
  const comPerda = semPerda.map(r => ({...r, retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}));
  const perdeu = C.apurar({id:'f2', fechadoEm:'2026-12-01', periodo:NOV, regraPerdas:'perdas-1', registros:comPerda}, entrada(comPerda));
  // Caso ruim: 1% de cada parte, arredondado sozinho: [1235, 766] = 2.001 centavos, com 2.000 pagos.
  assert.deepEqual(perdeu.linhas.map(l => l.comissaoPerdidaCentavos), pago.linhas.map(l => l.comissaoCentavos));
  assert.equal(perdeu.linhas.reduce((s, l) => s + l.comissaoPerdidaCentavos, 0), seriaPago);
  // A aba Perdas: com e sem o demonstrativo, o mesmo número (a mesma conta, comissoesAcumuladas).
  const comDemo = PERDAS.perdaAutomatica(comPerda, PERDAS.decisaoDaOS('osX', {apuracao:perdeu, entrada:entrada(comPerda), revisao:1, tipo:'previa'}), C);
  const semDemo = PERDAS.perdaAutomatica(comPerda, null, C);
  assert.deepEqual([comDemo.comissaoCentavos, semDemo.comissaoCentavos], [seriaPago, seriaPago]);
  assert.match(ler('perdas.js'), /motor\.comissoesAcumuladas\(cents\)/, 'a aba chama a função do motor');
  // A parcial em dois meses: a de novembro perde o que novembro pagaria (com o saldo de outubro).
  const outR = [parte('osX::entrega:e1', 'e1', '2026-10-20', 1000.50, 0.5)];
  const apOut = C.apurar({id:'fo', fechadoEm:'2026-11-01', periodo:{de:'2026-10-01', ate:'2026-10-31'}, registros:outR}, entrada(outR));
  const aprovacoes = [{id:'a-out', tipo:'aprovacao', de:'2026-10-01', ate:'2026-10-31', revisao:1, apuracao:apOut}];
  const novR = [parte('osX::entrega:e2', 'e2', '2026-11-05', 999.50, 0.5)];
  const pagaria = C.apurar({id:'fn1', fechadoEm:'2026-12-01', periodo:NOV, registros:novR}, entrada(novR), {aprovacoes});
  const perdeNov = C.apurar({id:'fn2', fechadoEm:'2026-12-01', periodo:NOV, regraPerdas:'perdas-1', registros:novR.map(r => ({...r, retrabalho:true, etapaOrigem:'Instalação', perda:'retrabalho_instalacao'}))}, entrada(novR), {aprovacoes});
  assert.equal(perdeNov.linhas[0].comissaoPerdidaCentavos, pagaria.linhas[0].comissaoCentavos, 'R$ 9,99, não R$ 10,00');
  // As duas cópias do motor dizem o mesmo.
  const {COMISSAO:S} = await import('../supabase/functions/_shared/pcp-comissao.mjs');
  assert.deepEqual(S.apurar({id:'f2', fechadoEm:'2026-12-01', periodo:NOV, regraPerdas:'perdas-1', registros:comPerda}, entrada(comPerda)), perdeu);
  assert.deepEqual(S.comissoesAcumuladas([123450, 76550]), C.comissoesAcumuladas([123450, 76550]));
});

/* ═══════════════ (4): toda troca de origem pede motivo ═══════════════ */
test('revisão a3: desmarcar e marcar de novo com outra origem pede motivo (porta); o mesmo ao definir a que ficou a definir', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu', causaRaiz:'Erro humano'});
  let r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:false}}, gestor);
  assert.equal(r.status, 200);
  // Caso ruim: marcar de novo com Produção, sem motivo, trocava a origem (e a perda) sem rastro de motivo.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:true, etapaOrigem:'Produção', problema:'Placa caiu'}}, gestor);
  assert.equal(r.status, 200, 'nunca 422: a gravação passa pela fila');
  assert.equal(noServidor(e, 'osR').retrabalho, false, 'a marca com outra origem, sem motivo, não entra');
  assert.match(String(r.avisos), /a última origem desta O\.S\. foi Instalação, e trocar pede o motivo, com 15 letras ou mais/);
  // A mesma origem de antes: entra sem motivo.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'}}, gestor);
  assert.deepEqual([noServidor(e, 'osR').retrabalho, noServidor(e, 'osR').etapaOrigem], [true, 'Instalação']);
  // Desmarca de novo; o celular marca (origem a definir); a gestão define OUTRA sem motivo: fica a definir.
  await e.call({action:'upsert', os:{...noServidor(e, 'osR'), retrabalho:false}}, gestor);
  r = await e.call({action:'upsert', os:{id:'osR', rev:noServidor(e, 'osR').rev, retrabalho:true}}, toque);
  assert.deepEqual([noServidor(e, 'osR').retrabalho, noServidor(e, 'osR').etapaOrigem], [true, '']);
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Produção'}}, gestor);
  assert.equal(noServidor(e, 'osR').etapaOrigem, '', 'definir outra origem que não a última pede motivo');
  assert.match(String(r.avisos), /A etapa de origem Produção não foi gravada: a última origem desta O\.S\. foi Instalação/);
  // Com o motivo: entra, e o motivo fica no histórico.
  r = await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Produção', etapaOrigemMotivo:MOTIVO}}, gestor);
  const g = noServidor(e, 'osR');
  assert.equal(g.etapaOrigem, 'Produção');
  assert.deepEqual(plano(g.etapaOrigemLog[g.etapaOrigemLog.length - 1]).motivo, MOTIVO);
  assert.equal(R.ultimaOrigemDoLog(g.etapaOrigemLog), 'Produção');
  assert.equal(R.ultimaOrigemDoLog([{de:'Instalação', para:'', desmarcou:true}]), 'Instalação');
  assert.equal(R.ultimaOrigemDoLog([]), '');
});

/* A FICHA, com o store e o servidor de verdade (o mesmo arranjo de tests/retrabalho-instalacao.test.cjs). */
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add() {}, remove() {}, toggle() {}, contains:() => false},
    setAttribute() {}, getAttribute() {}, focus() {}, addEventListener() {}, remove() {}, querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  return {doc:{activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)}, porId};
}
async function telaFicha(lista, quem = GESTOR, hoje = '2026-11-12') {
  const e = await edge('pcp-sync', {pcp_registros:lista.map(osRow), registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), longe(quem)); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'divisao.js', 'regras.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = []; ctx.__repintou = 0;
  run(`STATE.user = {nome:${JSON.stringify(quem.nome)}, papel:${JSON.stringify(quem.papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; reRenderModalKeepOpen = () => { __repintou++; }; toast = (m, t) => __toasts.push([m, t]);
    var versoesRegrasCasa = () => [];
    hojeISO = () => ${JSON.stringify(hoje)};`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, ctx, esvaziar, json:c => js(run(c)),
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
const fichaOS = (id, extra = {}) => ({id, numero:'9' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'],
  liberadoPCP:true, instalacao:{data:'2026-11-05', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-11-05', fonte:'agenda'},
  finalizadaEm:'2026-11-05T20:00:00.000Z', finalizadoPor:'Gestor Teste', retornoConf:{carroLimpo:'sim', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', por:'Gestor Teste', em:'2026-11-05T21:00:00Z'},
  retrabalhoPerguntado:{resposta:'sim', por:'Gestor Teste', em:'2026-11-06T10:00:00Z'}, ...extra});

test('revisão a3: o diálogo da origem pede o motivo quando a origem escolhida não é a última do histórico (marcar de novo)', async () => {
  const log = [{de:'', para:'Instalação', marcou:true, por:'Gestor Teste', em:'2026-11-06T10:00:00Z'}, {de:'Instalação', para:'', desmarcou:true, por:'Gestor Teste', em:'2026-11-07T10:00:00Z'}];
  const t = await telaFicha([fichaOS('m', {retrabalho:false, etapaOrigem:'', etapaOrigemLog:log, retrabalhoPerguntado:{resposta:'nao', por:'Gestor Teste', em:'2026-11-07T10:00:00Z'}})]);
  const dialogo = (escolha, motivo) => {
    const campos = {etapa:{value:escolha}, motivo:{value:motivo || ''}}, erro = {textContent:'', hidden:true};
    const box = {id:'', innerHTML:'', remove() {}, querySelectorAll:() => []};
    const form = {querySelector:sel => sel.startsWith('input[name="etapa"]') ? campos.etapa : sel === '[name="motivo"]' ? (/name="motivo"/.test(box.innerHTML) ? campos.motivo : null) : null};
    box.querySelector = sel => sel === 'form' ? form : sel === '.ent-erro' ? erro : null;
    t.ctx.__box = box;
    t.run(`document.createElement = () => __box; abrirOrigemRetrabalho(_modalDraft, gravarNaFichaF17, {marcar:true})`);
    form.onsubmit({preventDefault() {}});
    return {erro:erro.textContent, html:box.innerHTML};
  };
  t.abrir('m');
  // Caso ruim: o diálogo de marcar não tinha o campo do motivo e mandava a troca sem ele (o servidor a recusava calado para quem marcava).
  let r = dialogo('Produção');
  assert.match(r.html, /A última origem desta O\.S\. foi Instalação\. Escolher outra é uma troca: pede o motivo/);
  assert.match(r.html, /name="motivo"/);
  assert.equal(r.erro, 'Escreva o motivo da troca, com 15 letras ou mais.');
  assert.equal(t.run('_modalDraft.retrabalho'), false, 'nada foi marcado');
  r = dialogo('Produção', MOTIVO);
  assert.equal(r.erro, '');
  await t.esvaziar();
  const g = noServidor(t.e, 'm');
  assert.deepEqual([g.retrabalho, g.etapaOrigem, g.etapaOrigemLog[g.etapaOrigemLog.length - 1].motivo], [true, 'Produção', MOTIVO]);
  // A mesma origem da última: sem motivo.
  const t2 = await telaFicha([fichaOS('n', {retrabalho:false, etapaOrigem:'', etapaOrigemLog:log, retrabalhoPerguntado:{resposta:'nao', por:'Gestor Teste', em:'2026-11-07T10:00:00Z'}})]);
  t2.abrir('n');
  const campos2 = {etapa:{value:'Instalação'}}, erro2 = {textContent:''}, box2 = {id:'', innerHTML:'', remove() {}, querySelectorAll:() => []};
  const form2 = {querySelector:sel => sel.startsWith('input[name="etapa"]') ? campos2.etapa : sel === '[name="motivo"]' ? {value:''} : null};
  box2.querySelector = sel => sel === 'form' ? form2 : sel === '.ent-erro' ? erro2 : null;
  t2.ctx.__box = box2;
  t2.run(`document.createElement = () => __box; abrirOrigemRetrabalho(_modalDraft, gravarNaFichaF17, {marcar:true})`);
  form2.onsubmit({preventDefault() {}});
  assert.equal(erro2.textContent, '');
  await t2.esvaziar();
  assert.deepEqual([noServidor(t2.e, 'n').retrabalho, noServidor(t2.e, 'n').etapaOrigem], [true, 'Instalação']);
});

/* ═══════════════ (5): a origem a definir não trava o mês ═══════════════ */
test('revisão a3: a origem a definir não trava o mês: o demonstrativo aprova, a O.S. fica pendente e entra numa revisão seguinte', async () => {
  const e = await servidor({retrabalho:true, problema:'Letra solta'});
  const {f} = await fechar(e);
  assert.equal(f.registros.find(r => r.id === 'osR').etapaOrigem, '', 'premissa: a definir no selo');
  const p = await previa(e, f, {osR:semFalha, osN:semFalha});
  const lR = linhaDe(p, 'osR');
  // Caso ruim: a apuração inteira ficava não aprovável até a origem ser definida.
  assert.equal(p.apuracao.aprovavel, true, JSON.stringify(p.apuracao.pendencias));
  assert.deepEqual([lR.decisao, lR.comissaoCentavos, lR.baseElegivelCentavos, lR.pagamentos.length], ['origem_a_definir', 0, 0, 0], 'não paga');
  assert.ok(!('comissaoPerdidaCentavos' in lR), 'e não perde');
  assert.equal(p.apuracao.totalCentavos, 800);
  const ap = await aprovar(e, p);
  assert.equal(ap.ok, true, JSON.stringify(ap));
  assert.deepEqual(C.divergencias([ap.revisao], 'teste'), [], 'a linha pendente não desconcilia o acumulado');
  // Definida a origem (Produção), a gestão fecha de novo e gera a prévia: a O.S. entra, e a diferença aparece para conciliar.
  await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Produção'}}, gestor);
  const {f:f2} = await fechar(e, f.id);
  const p2 = await previa(e, f2, {osR:semFalha, osN:semFalha}, {anterior:ap.revisao.id});
  assert.equal(linhaDe(p2, 'osR').comissaoCentavos, 1200);
  assert.equal(p2.apuracao.totalCentavos, 2000);
  assert.ok(p2.apuracao.ajustes.some(a => a.diferencaCentavos > 0), JSON.stringify(p2.apuracao.ajustes));
  // O diálogo da comissão diz isso (a frase do motor).
  // TROCADO DE PROPÓSITO (D2, 19/10/2026): a frase aponta a compensação da pendência.
  assert.equal(C.TEXTO_ORIGEM_A_DEFINIR, 'Retrabalho com origem a definir: esta O.S. fica pendente (não paga e não perde) e não trava o demonstrativo. Defina a origem na ficha: com o mês aprovado e exportado, pague só ela por compensação da pendência (no diálogo da comissão), ou ela entra numa revisão seguinte do mês.');
});

/* ═══════════════ (6): a régua de cada dia ═══════════════ */
test('revisão a3: a régua de cada dia: versão da regra antes de 01/10 é recusada; a ficha e a apuração dizem o mesmo; régua nova não apaga os dias antes dela', async () => {
  // A porta: chamada na hora (fora da fila), recusa com a frase.
  const e = await edge('pcp-sync');
  const regra = {...plano(R.REGRA_EMBUTIDA), validaDesde:'2026-09-15'};
  delete regra.id; delete regra.versao; delete regra.provisoria;
  const r = await e.call({action:'performanceRegraNova', regra, motivo:'Versão fictícia', anterior:'', requestId:'regra-antes-0001'}, gestor);
  // Caso ruim: a porta aceitava a versão de 15/09 e a ficha passava a tirar os pontos de setembro, que a apuração conta inteira.
  assert.equal(r.status, 409, JSON.stringify(r));
  assert.equal(r.error, 'O programa começa em 01/10/2026: a versão da regra não pode começar antes. Escolha uma data a partir de 01/10/2026.');
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_regras').length, 0, 'nada foi gravado');
  const ok = await e.call({action:'performanceRegraNova', regra:{...regra, validaDesde:'2026-10-20'}, motivo:'Versão fictícia', anterior:'', requestId:'regra-depois-0001'}, gestor);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  // O formulário diz o mesmo antes de mandar.
  const ctx = vm.createContext({console});
  for (const f of ['divisao.js', 'regras.js', 'performance.js']) vm.runInContext(ler(f), ctx, {filename:f});
  ctx.__r = regra;
  assert.equal(vm.runInContext('perfRegraErroForm(REGRAS.completarRegra(__r, REGRAS.REGRA_EMBUTIDA), "")', ctx), R.TEXTO_ANTES_DO_PROGRAMA);
  // A ficha e a apuração: entrega de setembro com uma regra que diz "no programa" (a versão antiga): nenhuma das duas tira.
  const os = {id:'s1', numero:'9101', tipo:'externo', equipe:['Ana'], instalacao:{data:'2026-09-20'}, prazoCombinado:{data:'2026-09-20', fonte:'agenda'},
    finalizadaEm:'2026-09-20T15:00:00.000Z', finalizadoPor:'Gestor Teste', retrabalho:true, etapaOrigem:'Instalação'};
  const st = O.statusEntrega(os, '2026-10-11', {...R.REGRA_EMBUTIDA, validaDesde:'2026-09-15'});
  assert.deepEqual([st.perdas, R.perdaNaApuracao(os, '2026-09-20')], [[], {}]);
  assert.equal(st.ocorrencias.find(o => o.tipo === 'retrabalho').efeito, '');
  // A régua nova (perdas-2, de 01/12): os dias antes dela ficam com a perdas-1; os dias dela, com ela.
  const perdas2 = {id:'perdas-2', validaDesde:'2026-12-01', retrabalhoInstalacao:true, atraso:true, retornoAntecipado:false};
  const os2 = {retrabalho:true, etapaOrigem:'Instalação'};
  assert.deepEqual(R.perdaNaApuracao(os2, '2026-11-10', perdas2), R.perdaNaApuracao(os2, '2026-11-10', R.REGUAS_PERDAS['perdas-1']));
  assert.deepEqual(R.perdaNaApuracao(os2, '2026-11-10', perdas2), {etapaOrigem:'Instalação', perda:'retrabalho_instalacao'});
  assert.equal(R.reguaNoDia('2026-12-05', perdas2), perdas2);
  assert.equal(R.reguaNoDia('2026-11-10', perdas2), R.REGUAS_PERDAS['perdas-1']);
  assert.equal(R.reguaNoDia('2026-09-30', perdas2), null);
  // O selo da perdas-1 confere com ela mesmo depois de uma régua nova: a mais nova que ele usa é a dele.
  assert.equal(R.reguaNoDia('2026-12-05', R.REGUAS_PERDAS['perdas-1']), R.REGUAS_PERDAS['perdas-1']);
  const {REGRAS:S} = await import('../supabase/functions/_shared/pcp-regras.mjs');
  for (const dia of ['2026-09-30', '2026-10-01', '2026-11-10', '2026-12-05']) assert.deepEqual(S.reguaNoDia(dia, perdas2), R.reguaNoDia(dia, perdas2), dia);
});

/* ═══════════════ (7): o histórico da origem para quem não é da gestão ═══════════════ */
test('revisão a3: o etapaOrigemLog desce para quem não é da gestão só com a origem atual e a data', async () => {
  const e = await servidor({retrabalho:true, etapaOrigem:'Instalação', problema:'Placa caiu'});
  await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Produção', etapaOrigemMotivo:MOTIVO}}, gestor);
  await e.call({action:'upsert', os:{...noServidor(e, 'osR'), etapaOrigem:'Medição', etapaOrigemMotivo:MOTIVO + ' de novo'}}, gestor);
  const ultimo = noServidor(e, 'osR').etapaOrigemLog[1];
  for (const quem of [toque, montagem, opera, comercial]) {
    const lista = await e.call({action:'list'}, quem);
    const os = (lista.os || []).find(o => o.id === 'osR');
    assert.ok(os, quem.papel + ': a O.S. desce');
    // Caso ruim: o histórico descia com o nome de quem trocou e o motivo (e o caminho das trocas).
    assert.deepEqual(os.etapaOrigemLog, [{para:'Medição', em:ultimo.em}], quem.sub);
    assert.doesNotMatch(JSON.stringify(os), new RegExp(MOTIVO), quem.sub + ': o motivo não desce');
  }
  // A gestão vê o histórico inteiro.
  const g = (await e.call({action:'list'}, gestor)).os.find(o => o.id === 'osR');
  assert.deepEqual(g.etapaOrigemLog.map(x => [x.de, x.para, x.motivo]), [['Instalação', 'Produção', MOTIVO], ['Produção', 'Medição', MOTIVO + ' de novo']]);
  // A volta sem o histórico (a cópia podada) não apaga nada.
  await e.call({action:'upsert', os:{id:'osR', rev:noServidor(e, 'osR').rev, etapaOrigemLog:[{para:'Medição', em:ultimo.em}], horaRetorno:'17:00'}}, toque);
  assert.equal(noServidor(e, 'osR').etapaOrigemLog.length, 2);
});

/* ═══════════════ (8): o texto do retorno previsto ═══════════════ */
test('revisão a3: o retorno previsto não diz mais que sem hora não há perda (com a D-011 não há perda com ou sem hora)', async () => {
  const t = await telaFicha([fichaOS('rp', {retornoPrevisto:[{dia:'2026-11-05', hora:'18:00'}]})]);
  t.abrir('rp');
  const html = texto(t.run('prazoRetornoHTML(_modalDraft, false)'));
  // Caso ruim: "sem hora digitada, não há perda por retorno antecipado".
  assert.doesNotMatch(html, /não há perda/);
  assert.match(html, /sem hora digitada, o retorno antecipado não é medido \(com ou sem hora, ele fica só registrado, sem tirar nada sozinho\)/);
});

/* ═══════════════ M3: o ponto de atenção mostra a perda ═══════════════ */
test('revisão a3: o ponto de atenção mostra sempre a perda por retrabalho de instalação, com a comissão, e a origem a definir sem travar o mês', () => {
  const lista = [card('R2', {etapaOrigem:'Instalação'}), card('R3', {etapaOrigem:''}), card('S1', {...semRetrabalho})];
  const registros = [registro('R2', {retrabalho:true}), registro('R3', {retrabalho:true}), registro('S1')];
  const tx = texto(telaPerf({lista, registros}).render());
  // Caso ruim: o ponto falava só da origem a definir; a O.S. que perdeu não aparecia.
  assert.match(tx, /Ponto de atenção: 1 O\.S\. perdeu pontos e comissão por retrabalho de instalação \(R\$\s?12,00 de comissão\)\./);
  assert.match(tx, /o demonstrativo do mês pode ser aprovado sem ela, e ela entra numa revisão seguinte quando a origem for definida\./);
  // Só a perda (sem nada a definir): o ponto aparece do mesmo jeito.
  const so = texto(telaPerf({lista:[card('R2', {etapaOrigem:'Instalação'})], registros:[registro('R2', {retrabalho:true})]}).render());
  assert.match(so, /Ponto de atenção: 1 O\.S\. perdeu pontos e comissão por retrabalho de instalação/);
  // Duas: no plural.
  const duas = texto(telaPerf({lista:[card('R2', {etapaOrigem:'Instalação'}), card('R4', {etapaOrigem:'Instalação'})], registros:[registro('R2', {retrabalho:true}), registro('R4', {retrabalho:true})]}).render());
  assert.match(duas, /2 O\.S\. perderam pontos e comissão por retrabalho de instalação \(R\$\s?24,00 de comissão\)\./);
});

/* ═══════════════ M2: "Definir a origem" abre a escolha da origem ═══════════════ */
test('revisão a3: "Definir a origem" abre direto a escolha da origem, e a instrução é uma só (Status da entrega, no Fechamento)', () => {
  const lista = [card('R3', {etapaOrigem:''})];
  const t = telaPerf({lista, registros:[registro('R3', {retrabalho:true})], aba:'perdas'});
  const html = t.render();
  // Caso ruim: o botão abria a ficha no topo da Jornada (data-ficha-etapa="jornada"), com o controle 1.230 px abaixo.
  assert.doesNotMatch(html, /data-ficha-etapa="jornada"/);
  assert.match(html, /data-perdas-origem="R3" data-numero="T-R3">Definir a origem da O\.S\. T-R3</);
  assert.doesNotMatch(texto(html), /Jornada, Embarque e Execução/);
  assert.match(texto(html), /Defina a origem no Status da entrega, no Fechamento da ficha de cada O\.S\./);
  const chamadas = [];
  t.ctx.abrirOrigemRetrabalho = (os, gravar, opt) => chamadas.push({os, gravar, opt});
  t.ctx.gravarNaOSF17 = (...a) => { chamadas.push({gravou:a}); return ''; };
  const botao = {dataset:{perdasOrigem:'R3', numero:'T-R3'}};
  t.ctx.__el = elFalso({'data-perdas-origem':[botao]});
  t.run('wirePerdas(__el)');
  return botao.onclick().then(() => {
    assert.equal(chamadas.length, 1, 'abriu a escolha da origem');
    assert.equal(chamadas[0].os.id, 'R3');
    chamadas[0].gravar(alvo => '', 'ok');
    assert.equal(chamadas[1].gravou[0], 'R3', 'grava direto na O.S. do aparelho');
    assert.equal(chamadas[1].gravou[3], t.run('perdasDepoisDaOrigem'), 'e, gravada, atualiza a apuração');
  });
});

/* ═══════════════ M4: os selos dos Rankings em linha própria ═══════════════ */
test('revisão a3: os selos dos Rankings ficam numa linha própria e não quebram palavra no meio (768 e 1024 px)', () => {
  const ctx = vm.createContext({console});
  for (const f of ['divisao.js', 'regras.js', 'performance.js']) vm.runInContext(ler(f), ctx, {filename:f});
  ctx.__x = {semPontos:1, falhaComprovada:1, origemADefinir:1};
  const html = vm.runInContext('perfMarcasReguaHTML(__x)', ctx);
  // Caso ruim: os selos soltos dividiam a linha com a distância até a liderança, que herdava o overflow-wrap:anywhere do pódio ("Lider ança").
  assert.match(html, /^<span class="perf-marcas-regua"><span class="perf-sem-pontos">1 sem pontos: retrabalho de instalação<\/span><span class="perf-sem-pontos">1 sem pontos: falha comprovada<\/span><span class="perf-origem-definir">1 com retrabalho de origem a definir<\/span><\/span>$/);
  const css = ler('performance-layout.css');
  assert.match(css, /#panel-performance \.perf-marcas-regua\{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 100%;min-width:0\}/);
  assert.match(css, /#panel-performance \.perf-podio-aviso>\.perf-conquistas\{flex:1 1 100%;min-width:0\}/);
  assert.match(css, /#panel-performance :is\(\.perf-podio-aviso,\.perf-cartao-linha,\.perf-conquistas,\.perf-marcas-regua\) \*\{overflow-wrap:normal;word-break:normal\}/);
  assert.match(ler('styles.css'), /\.perf-podio-topo\{[^}]*overflow-wrap:anywhere/, 'premissa: o pódio quebra em qualquer lugar');
});

/* ═══════════════ B1: o aviso da apuração com o botão; atualizar sozinho ═══════════════ */
test('revisão a3: depois de definir a origem, o aviso tem o botão de atualizar e a apuração se atualiza sozinha', async () => {
  // A ficha diz Instalação; a apuração em vista ainda tem Produção.
  const lista = [card('R1', {etapaOrigem:'Instalação'})];
  const t = telaPerf({lista, registros:[comRegua(registro('R1', {retrabalho:true}), 'Produção')], aba:'perdas'});
  const html = t.render();
  // Caso ruim: "toque em Atualizar apuração", e o botão só existia no quadro Base e fechamento, em outra aba.
  assert.doesNotMatch(texto(html), /toque em Atualizar apuração/);
  assert.match(html, /A apuração do ranking ainda tem a origem de antes\. <button type="button" class="btn-ghost btn-sm" data-perf-atualizar>Atualizar apuração<\/button>/);
  let sincronizou = 0, carregou = 0;
  t.ctx.STORE.trySync = async () => { sincronizou++; };
  t.ctx.perfCarregarFonte = async () => { carregou++; };
  t.ctx.renderPerformanceCasa = () => {};
  t.run('perdasDepoisDaOrigem()');
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual([sincronizou, carregou], [1, 1]);
  // Com a fila cheia, ela espera (a apuração do servidor ainda não tem a origem nova).
  t.ctx.STORE.getQueue = () => [{id:'x'}];
  t.run('perdasDepoisDaOrigem()');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(carregou, 1);
  // No diálogo da comissão (que lê o fechamento), o aviso diz a revisão, sem botão.
  const oc = PERDAS.ocorrenciasDaOS({card:lista[0], st:null, registros:[{dia:'2026-11-05', retrabalho:true, etapaOrigem:'Produção'}]});
  assert.equal(oc.retrabalho.apuracaoDiverge, true);
  const dialogo = t.run(`perdasJulgadaHTML(${JSON.stringify(oc)})`);
  assert.match(dialogo, /O fechamento tem a origem de antes: a troca só vale com nova revisão do fechamento\./);
  assert.doesNotMatch(dialogo, /data-perf-atualizar/);
});

/* ═══════════════ B2: o texto do diálogo da comissão ═══════════════ */
test('revisão a3: no diálogo da comissão, cada frase da ocorrência fica na sua linha', () => {
  // Caso ruim: ".bloco" sem display:block dentro de .comissao-ocorrencia: "...O.S.Ocorrência registrada" grudava.
  assert.match(ler('performance-layout.css'), /#perf-dialog \.comissao-ocorrencia \.bloco\{display:block;margin-top:2px\}/);
  assert.match(ler('perdas.js'), /<span class="bloco perf-perda-efeito">/, 'premissa: o efeito vem num .bloco');
});

/* ═══════════════ B3: a montagem marca e a ficha mostra na hora, sem mandar definir ═══════════════ */
test('revisão a3: quem não é da gestão vê "a gestão do PCP define a origem", nunca "defina", e a marca repinta a ficha', async () => {
  const t = await telaFicha([fichaOS('mt', {retrabalho:true, etapaOrigem:'', problema:'Letra solta'})], MONTAGEM);
  t.abrir('mt');
  // Caso ruim: a montagem lia "Retrabalho com origem a definir: defina a origem; ..." (ela não define).
  assert.equal(t.run('efeitoRetrabalhoFicha(_modalDraft)'), 'Retrabalho com origem a definir: a gestão do PCP define a origem; até lá não tira nada e a comissão desta O.S. fica pendente');
  const jornada = texto(t.run('origemNaJornadaHTML(_modalDraft)'));
  assert.match(jornada, /a definir A gestão do PCP define a origem\./);
  assert.doesNotMatch(jornada, /defina a origem/);
  // A gestão continua com a frase da régua (ela define).
  const g = await telaFicha([fichaOS('gt', {retrabalho:true, etapaOrigem:'', problema:'Letra solta'})], GESTOR);
  g.abrir('gt');
  assert.equal(g.run('efeitoRetrabalhoFicha(_modalDraft)'), R.TEXTOS_PERDA.retrabalhoDefinir);
  // Marcar pela caixa repinta a ficha (a origem "a definir" aparece na hora).
  assert.match(ler('app.js'), /if \(el\.checked\) reRenderModalKeepOpen\(\); else pintarPendenciasFicha\(\);/);
});

/* ═══════════════ B4, B5 e B6 ═══════════════ */
test('revisão a3: o caminho para julgar no demonstrativo fica só nas outras ocorrências', () => {
  const lista = [card('R1'), card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'})];
  const registros = [registro('R1', {retrabalho:true}), registro('A1', {dia:'2026-11-08', confirmado:false, fonte:'sugestao'})];
  const html = telaPerf({lista, registros, aba:'perdas'}).render();
  const outra = html.slice(html.indexOf('id="perf-perdas-g-outra"'), html.indexOf('</section>', html.indexOf('id="perf-perdas-g-outra"')));
  // Caso ruim: "Para julgar no demonstrativo..." aparecia dentro de "Retrabalho de outra origem (só acompanhamento)".
  assert.doesNotMatch(outra, /Para julgar/);
  assert.match(html.slice(html.indexOf('id="perf-perdas-g-ocorrencia"')), /Para julgar no demonstrativo/);
  // Só retrabalho de outra origem no período: nenhum caminho de julgamento.
  assert.doesNotMatch(telaPerf({lista:[card('R1')], registros:[registro('R1', {retrabalho:true})], aba:'perdas'}).render(), /Para julgar/);
});

test('revisão a3: a aba Conferência abre na lista: os apontamentos vêm fechados, depois dela, e se chamam apontamentos', () => {
  const regs = [registro('C1', {valor:null}), registro('C2', {confirmado:false, fonte:'sugestao'})];
  const html = telaPerf({registros:regs, aba:'conferencia'}).render();
  // Caso ruim: "Conferência dos lançamentos · 46 pontos de atenção", aberto, antes da lista: o primeiro Conferir ficava a 1.028 px.
  assert.doesNotMatch(html, /pontos de atenção/);
  assert.doesNotMatch(html, /<details class="perf-auditoria" open/);
  assert.match(html, /<details class="perf-auditoria"><summary>Apontamentos dos lançamentos · \d+ apontamentos a revisar<\/summary>/);
  assert.ok(html.indexOf('class="perf-auditoria"') > html.indexOf('data-perf-part="C2"'), 'depois do primeiro Conferir');
});

test('revisão a3: sem termos internos, sem a frase das duas datas iguais em todo cartão, e o exemplo da aba Regras sem "no prazo"', () => {
  const lista = [card('R2', {etapaOrigem:'Instalação'}), card('A1', {...semRetrabalho, finalizadaEm:'2026-11-08T15:00:00-03:00'})];
  const registros = [registro('R2', {retrabalho:true}), registro('A1', {dia:'2026-11-08'})];
  const tx = texto(telaPerf({lista, registros, aba:'perdas'}).render());
  // Caso ruim: "(1% da base, pelo motor da comissão)", "pela mesma conta do motor" e "As duas datas dão o mesmo atraso." em todo atraso.
  assert.doesNotMatch(tx, /pelo motor|conta do motor|As duas datas dão o mesmo atraso/);
  assert.match(tx, /Comissão perdida: R\$\s?12,00 \(1% da base, como o demonstrativo calcularia\)/);
  assert.match(tx, /Atraso de 3 dias: prazo 05\/11, entrega 08\/11\./);
  const ctx = vm.createContext({console});
  for (const f of ['divisao.js', 'regras.js', 'performance.js']) vm.runInContext(ler(f), ctx, {filename:f});
  ctx.dinheiroCasa = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  ctx.esc = s => String(s ?? '');
  const ex = texto(vm.runInContext('perfRegraExemploHTML(REGRAS.REGRA_EMBUTIDA)', ctx));
  assert.doesNotMatch(ex, /no prazo/);
  assert.match(ex, /Dupla\s*, O\.S\. de R\$ 10000,00 sem retrabalho de instalação: comissão total R\$ 100,00/);
});

/* ═══════════════ o Por O.S. lê a falha comprovada (D-004 nos pontos) ═══════════════ */
test('revisão a3: o Por O.S. zera a prevista da O.S. julgada falha comprovada no demonstrativo do período', async () => {
  const PESSOAS = [{id:'900001', nome:'Ana Paula Fictícia', apelido:'Ana'}];
  const os = {id:'rt', numero:'5004', tipo:'externo', cliente:'Cliente fictício 5004', servico:'Fachada fictícia', equipe:['Ana'], instalacao:{data:'2026-10-10'},
    prazoCombinado:{data:'2026-10-10', fonte:'agenda'}, finalizadaEm:'2026-10-10T18:00:00Z', finalizadoPor:'Gestão de teste', retrabalho:true, etapaOrigem:'Produção', problema:'Lona manchada'};
  const erp = [{numero:'5004', cliente:'Cliente fictício 5004', data:'2026-10-10', valor:800, tipo:'externo'}];
  const revisao = {de:'2026-10-01', ate:'2026-10-31', id:'out:1', revisao:1, tipo:'previa', em:'2026-11-01T10:00:00Z', entrada:{decisoes:{rt:falha}},
    apuracao:{linhas:[{osId:'rt', decisao:'falha_comprovada', pendencias:[]}]}};
  let pedidos = 0;
  const agora = '2026-10-20T12:00:00-03:00';
  const ctx = vm.createContext({console,
    Date:class extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return +new Date(agora); } },
    STORE:{JANELA_LOCAL_DIAS:60, getAllOS:() => [os], getOS:id => id === 'rt' ? os : null, getCFG:() => ({instaladores:[], performancePCP:{equipes:[]}}),
      elenco:() => ({pessoas:PESSOAS, veiculos:[], ferias:[], ausencias:[]}),
      entreguesMes:m => ({v:3, os:erp.filter(o => String(o.data).slice(0, 7) === m), em:'2026-10-20T10:00:00'}),
      pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({}), historico:() => [], buscarHistorico:async () => ({itens:[]}),
      api:async b => { pedidos++; assert.equal(b.action, 'performanceComissaoListar'); return {revisoes:[revisao], cobrem:[]}; }},
    STATE:{user:{papel:'pcp', nome:'Gestão de teste'}, _fEnt:{de:'2026-10-01', ate:'2026-10-20'}, _entVista:'poros'},
    document:{getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    emptyState:(i, t) => `<div class="vazio">${t}</div>`, bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '',
    parseLocalDate:() => null, pessoaDoElenco:() => null});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'casa.js', 'relatorios-entregas.js', 'comissao.js', 'performance.js', 'entregas-os.js', 'perdas.js']) vm.runInContext(ler(f), ctx, {filename:f});
  vm.runInContext(`OPERACAO.usarPessoas(() => ({pessoas: STORE.elenco().pessoas, vinculos: [], lista: []}));
    var wireFiltroPeriodo = () => {}; var wireQuadrosCasa = () => {};
    var __el = {innerHTML: '', querySelectorAll: () => [], querySelector: () => ({value: ''})};
    document.getElementById = id => id === 'panel-entregas' ? __el : null;`, ctx);
  const tela = () => vm.runInContext('renderEntregas(); __el.innerHTML', ctx);
  const prevista = html => texto((html.match(/<dt>Comissão prevista<\/dt><dd>([\s\S]*?)<\/dd>/) || ['', ''])[1]);
  // Caso ruim: "R$ 8,00 prevista, 1% da O.S. que pontua" para a O.S. que o demonstrativo julgou falha comprovada.
  const antes = prevista(tela());
  assert.match(antes, /R\$\s?8,00/, 'enquanto as decisões não chegam, a prevista fica como está');
  await new Promise(r => setTimeout(r, 5));
  const depois = prevista(tela());
  assert.equal(pedidos, 1, 'uma consulta por período');
  assert.match(depois, /^\s?R\$\s?0,00 prevista: Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O\.S\. \(demonstrativo de 01\/10\/26 a 31\/10\/26, revisão 1\)/);
});

/* ═══════════════ as decisões no repositório ═══════════════ */
test('revisão a3: docs/DECISOES.md registra as correções (D-004 nos pontos, D-010 e a correção da D-011) sem apagar nada', () => {
  const d = ler('docs/DECISOES.md');
  // Caso ruim: a D-011 dizia que o ponto de atenção mostrava só o que pede ação, e nada dizia que a falha comprovada zera os pontos no ranking.
  assert.match(d, /- D-004 [^\n]*\n(?: {2}- [^\n]*\n)* {2}- Nota de 11\/10\/2026 \(revisão da onda a3, correção[^\n]*a D-004 vale também para os PONTOS/);
  assert.match(d, /- D-010 [^\n]*\n {2}- Nota de 11\/10\/2026 \(revisão da onda a3[^\n]*NÃO TRAVA O MÊS[^\n]*TODA TROCA DE ORIGEM PEDE MOTIVO[^\n]*A RÉGUA DE CADA DIA[^\n]*MÊS FECHADO NA ABA PERDAS[^\n]*CENTAVOS[^\n]*PRIVACIDADE/);
  assert.match(d, /- D-011 [^\n]*o ponto de atenção mostra só o que pede ação[^\n]*\n {2}- Nota de 11\/10\/2026 \(revisão da onda a3, correção do texto acima[^\n]*"a que perdeu por retrabalho precisa de uma aba e um ponto de atenção importante"/, 'o texto antigo fica, com a nota');
});
