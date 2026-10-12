'use strict';
/* AS DUAS REVISÕES DA ONDA FECHAMENTO (12/10/2026): a lente dinheiro e
   servidor (D1 a D5) e a lente uso e tela (U1 a U11). Cada teste começa pelo
   caso ruim, o que o 168cd47 deixava passar. Servidor real com banco em memória
   (helpers/edge.cjs) e a tela em vm. Dados fictícios: nenhuma pessoa, O.S. ou
   valor real. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor fictício', sub:'gestor', exp:EXP};
const montagem = {papel:'montagem', nome:'Montador fictício', sub:'montador', exp:EXP};
// O relógio anda 1 ms a cada leitura: a gravação fica antes da consulta seguinte.
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV = {de:'2026-11-01', ate:'2026-11-30'}, DEZ = {de:'2026-12-01', ate:'2026-12-31'};
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};

function banco(oss, extra = {}) {
  const participacoes = oss.filter(o => o.participa !== false).map(o => ({id:o.id, membros:[{chave:'100001', nome:'Pessoa fictícia', percentual:100}], por:'Gestor', em:'2026-09-01'}));
  return {
    pcp_registros:oss.map(o => ({colecao:'os', id:o.id, apagado:false, atualizado_em:'2020-01-01', registro:(({participa, ...r}) => r)(o)})),
    registros:[{id:'p1', colecao:'colaboradores', apagado:false, registro:{nome:'Pessoa fictícia', cpf:'10000111111'}}],
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes}}}],
    painel_ordens:[], ...extra};
}
const osItens = (id = 'c1', extra = {}) => ({id, numero:'90201', rev:1, tipo:'externo', cliente:'Cliente fictício', valorTotal:8500, equipe:['100001'],
  itens:[{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'4', subtotal:'5000'}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'1', subtotal:'5000'}], ...extra});
const sel = (o, n, qtde) => { const i = C.catalogo(o)[n]; return {chave:i.chave, identidade:i.identidade, qtde}; };
const conf = (o, id, dia, itens, pessoa = '100001') => ({id, dia, itens, alocacao:D.montar([{equipeId:null, liderId:pessoa, membros:[pessoa]}])});
const linha = (e, id) => e.db.pcp_registros.find(x => x.colecao === 'os' && x.id === id);
async function fechar(e, periodo, corpo = {}) {
  const fonte = await e.call({action:'performancePeriodo', ...periodo, notaPorValor:true}, gestor);
  const hist = await e.call({action:'performanceFechamentos', ...periodo}, gestor);
  return e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, anterior:hist.fechamentos?.[0]?.id || '', requestId:'fechar-' + periodo.de + '-' + Math.random().toString(36).slice(2, 10),
    motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true, ...corpo}, gestor);
}
// A comissão efetiva de novembro (D-001), com as decisões e as evidências fictícias de cada entrega.
const entradaComissao = regs => ({config:{modo:'efetivo', inicioEfetivo:'2026-11-01', decisaoGestao:'Autorização fictícia para teste', criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r => [r.osId || r.id, {...doc, decisao:'sem_falha', tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:'100001', partes:[{pessoaId:'100001', cota:10000}], justificativa:'Equipe solo fictícia'}], interna:{...doc, situacao:'nao_aplicavel'}}]))});
async function previaComissao(e, periodo, f, n = 1) {
  return e.call({action:'performanceComissaoNova', ...periodo, fechamentoId:f.id, anterior:'', entrada:entradaComissao(f.registros), motivo:'Prévia fictícia', requestId:'previa-revisao-' + n + '-' + periodo.de}, gestor);
}
const aprovarComissao = (e, periodo, r, n = 1) => e.call({action:'performanceComissaoAprovar', ...periodo, anterior:r.id, hash:r.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:'aprovar-revisao-' + n + '-' + periodo.de}, gestor);

/* ===================================================================== D1 */
test('revisão fechamento: D1, a O.S. que entrou inteira num mês fechado não recebe a primeira conferência por item com dia em outro mês', async () => {
  const o = osItens('w1', {finalizadaEm:'2026-11-10T15:00:00Z', entregaLancada:{data:'2026-11-10'}});
  const e = await edge('pcp-sync', banco([o], {painel_ordens:[{numero:o.numero, valor:8500}]}));
  relogio(e, '2026-12-02T12:00:00Z');
  const f = await fechar(e, NOV);
  assert.equal(f.status, 200, JSON.stringify(f));
  assert.equal(f.fechamento.registros.find(r => r.id === 'w1').valor, 8500, 'a O.S. entrou inteira no selo de novembro');
  // O diálogo já diz antes de salvar: a O.S. entrou inteira num período fechado.
  relogio(e, '2026-12-15T12:00:00Z');
  const abrir = await e.call({action:'conferenciaEntrega', osId:'w1'}, gestor);
  assert.deepEqual(plano(abrir.inteira), {dia:'2026-11-10', de:'2026-11-01', ate:'2026-11-30', ultimaRevisao:1});
  // Caso ruim: a porta aceitava a conferência de 05/12 e a mesma unidade contava em novembro (selo) e em dezembro.
  const r = await e.call({action:'conferenciaEntrega', osId:'w1', rev:1, entrega:conf(o, 'e1', '2026-12-05', [sel(o, 0, 2)])}, gestor);
  assert.equal(r.status, 409, JSON.stringify(r));
  assert.equal(r.inteiraNoFechamento, true);
  assert.match(r.error, /Esta O\.S\. já entrou inteira no fechamento de 01\/11\/2026 a 30\/11\/2026 \(revisão 1\), com a entrega de 10\/11\/2026/);
  assert.match(r.error, /o ajuste de mês fechado ainda não existe; fale com a gestão\. Nada foi gravado\./);
  assert.equal(linha(e, 'w1').registro.conferenciasEntrega, undefined, 'nada foi gravado');
  const dez = await e.call({action:'performancePeriodo', ...DEZ, de:'2026-12-01', ate:'2026-12-15', notaPorValor:true}, gestor);
  assert.equal(dez.registros.length, 0, 'dezembro não conta de novo a O.S. de novembro');
  // Ação fora da fila: a recusa não prende nada, e o ranking de dezembro continua vazio.
  const rk = await e.call({action:'performanceRankingEquipe', de:'2026-12-01', ate:'2026-12-15'}, montagem);
  assert.equal(rk.resumo.entregasConfirmadas, 0);
});
test('revisão fechamento: D1, a baixa do ERP a lançar (fora do selo) e a O.S. de mês aberto continuam aceitando a primeira conferência', async () => {
  const baixa = osItens('b1', {numero:'90202', finalizadaEm:'2026-11-12T15:00:00Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-11-12T15:00:00Z', status:'ENTREGUE'}, participa:false});
  const aberta = osItens('d1', {numero:'90203', finalizadaEm:'2026-12-03T15:00:00Z', entregaLancada:{data:'2026-12-03'}});
  const quieta = osItens('q1', {numero:'90204', finalizadaEm:'2026-11-05T15:00:00Z', entregaLancada:{data:'2026-11-05'}});
  const e = await edge('pcp-sync', banco([baixa, aberta, quieta], {painel_ordens:[{numero:'90202', valor:8500}, {numero:'90203', valor:8500}, {numero:'90204', valor:8500}]}));
  relogio(e, '2026-12-02T12:00:00Z');
  const f = await fechar(e, NOV, {confirmaCobertura:'fechar com cobertura baixa'});
  assert.equal(f.status, 200, JSON.stringify(f));
  assert.ok(!f.fechamento.registros.some(r => r.id === 'b1'), 'a baixa a lançar ficou fora do selo');
  relogio(e, '2026-12-10T12:00:00Z');
  const abrir = await e.call({action:'conferenciaEntrega', osId:'b1'}, gestor);
  assert.equal(abrir.inteira, null);
  const r1 = await e.call({action:'conferenciaEntrega', osId:'b1', rev:1, entrega:conf(baixa, 'e1', '2026-12-05', [sel(baixa, 0, 2)])}, gestor);
  assert.equal(r1.status ?? 200, 200, JSON.stringify(r1));
  const r2 = await e.call({action:'conferenciaEntrega', osId:'d1', rev:1, entrega:conf(aberta, 'e1', '2026-12-03', [sel(aberta, 0, 2)])}, gestor);
  assert.equal(r2.status ?? 200, 200, JSON.stringify(r2));
  // A O.S. finalizada com data de novembro DEPOIS do fechamento não entrou no selo: a primeira conferência não a conta duas vezes.
  const tarde = osItens('t1', {numero:'90205', finalizadaEm:'2026-11-20T15:00:00Z', entregaLancada:{data:'2026-11-20'}});
  e.db.pcp_registros.push({colecao:'os', id:'t1', apagado:false, atualizado_em:'2026-12-09T12:00:00Z', registro:tarde});
  e.db.painel_ordens.push({numero:'90205', valor:8500});
  assert.ok(!f.fechamento.registros.some(r => r.id === 't1'));
  assert.equal((await e.call({action:'conferenciaEntrega', osId:'t1'}, gestor)).inteira, null);
  const r3 = await e.call({action:'conferenciaEntrega', osId:'t1', rev:1, entrega:conf(tarde, 'e1', '2026-12-05', [sel(tarde, 0, 2)])}, gestor);
  assert.equal(r3.status ?? 200, 200, JSON.stringify(r3));
  // A O.S. que está no selo (q1) continua recusada.
  const r4 = await e.call({action:'conferenciaEntrega', osId:'q1', rev:1, entrega:conf(quieta, 'e1', '2026-12-05', [sel(quieta, 0, 2)])}, gestor);
  assert.equal(r4.status, 409);assert.equal(r4.inteiraNoFechamento, true);
});

/* ===================================================================== D2 */
test('revisão fechamento: D2, a parcial de novembro (mês fechado) com o resto em dezembro: Aprovar e Exportar novembro passam e a tela diz que nada mudou', async () => {
  const o = osItens('c1');
  const e = await edge('pcp-sync', banco([{...o, participa:false}], {painel_ordens:[{numero:o.numero, valor:8500}]}));
  relogio(e, '2026-11-20T12:00:00Z');
  assert.equal((await e.call({action:'conferenciaEntrega', osId:'c1', rev:1, entrega:conf(o, 'e1', '2026-11-05', [sel(o, 0, 2)])}, gestor)).status ?? 200, 200);
  relogio(e, '2026-12-02T12:00:00Z');
  const f = await fechar(e, NOV);
  assert.equal(f.status, 200, JSON.stringify(f));
  assert.equal(f.fechamento.registros[0].estadoEntrega.situacao, 'parcial');
  // Dezembro: a equipe entrega o resto, a gestão confere e a O.S. é finalizada (o fluxo de verdade).
  relogio(e, '2026-12-10T12:00:00Z');
  const r2 = await e.call({action:'conferenciaEntrega', osId:'c1', rev:linha(e, 'c1').registro.rev, entrega:conf(o, 'e2', '2026-12-08', [sel(o, 0, 2), sel(o, 1, 1)])}, gestor);
  assert.equal(r2.status ?? 200, 200, JSON.stringify(r2));
  const row = linha(e, 'c1');
  row.registro = {...row.registro, finalizadaEm:'2026-12-09T15:00:00Z', finalizadoPor:'Gestor fictício'};
  row.atualizado_em = '2026-12-10T13:00:00Z';
  relogio(e, '2026-12-11T12:00:00Z');
  // Caso ruim: o estado da entrega de novembro virava "saldo concluído" e o hash do recálculo deixava de bater.
  const nov = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.equal(nov.registros[0].estadoEntrega.situacao, 'parcial', 'como estava no fim de novembro');
  assert.equal(nov.hash, f.fechamento.hash, 'o recálculo do mês fechado confere com o selo');
  const p = await previaComissao(e, NOV, f.fechamento);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.revisao.apuracao.aprovavel, true, JSON.stringify(p.revisao.apuracao.pendencias));
  const ap = await aprovarComissao(e, NOV, p.revisao);
  assert.equal(ap.ok, true, 'Aprovar novembro passa: ' + JSON.stringify(ap));
  const ex = await e.call({action:'performanceComissaoExportar', ...NOV, id:ap.revisao.id}, gestor);
  assert.equal(ex.ok, true, 'Exportar novembro passa: ' + JSON.stringify(ex));
  // Dezembro vê a segunda entrega, com o estado do fim de dezembro.
  const dez = await e.call({action:'performancePeriodo', de:'2026-12-01', ate:'2026-12-11', notaPorValor:true}, gestor);
  assert.deepEqual(dez.registros.map(r => [r.entregaId, r.estadoEntrega.situacao]), [['e2', 'saldo_concluido']]);
  // A tela (M8) usa a mesma régua do servidor e diz o mesmo: nada mudou.
  const t = telaComBase(plano(f.fechamento), plano(nov));
  assert.deepEqual(plano(t.run('perfMudancasDoSelo(__selo,__atual)')), {entraram:0, sairam:0, mudaram:0, total:0, pesos:false});
  assert.match(t.run('perfAvisoFechadoHTML(perfFonteAtual(),true)'), /Nada mudou nas entregas depois do fechamento/);
});
test('revisão fechamento: D2, a mudança de verdade em novembro continua dando 409 e a tela diz que mudou (a mesma régua)', async () => {
  const o = osItens('c1');
  const e = await edge('pcp-sync', banco([{...o, participa:false}], {painel_ordens:[{numero:o.numero, valor:8500}]}));
  relogio(e, '2026-11-20T12:00:00Z');
  await e.call({action:'conferenciaEntrega', osId:'c1', rev:1, entrega:conf(o, 'e1', '2026-11-05', [sel(o, 0, 2)])}, gestor);
  relogio(e, '2026-12-02T12:00:00Z');
  const f = await fechar(e, NOV);
  assert.equal(f.status, 200, JSON.stringify(f));
  const p = await previaComissao(e, NOV, f.fechamento);
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.revisao.apuracao.aprovavel, true, JSON.stringify(p.revisao.apuracao.pendencias));
  /* ONDA COMISSÃO (12/10/2026, item 1): a porta passou a conferir só o
     dinheiro. Antes, o cliente renomeado no ERP dava 409; agora a mudança de
     dinheiro (o valor do ERP) continua 409 e a de fora do dinheiro aprova. A
     tela diz que as duas mudaram (a mesma régua do hash) e qual trava a
     comissão (tests/onda-comissao-tela.test.cjs). */
  e.db.painel_ordens[0].valor = 9000;
  relogio(e, '2026-12-07T12:00:00Z');
  const ap2 = await aprovarComissao(e, NOV, p.revisao, 2);
  assert.equal(ap2.status, 409);assert.match(ap2.error, /A fonte mudou depois do fechamento no que decide a comissão/);
  const nov2 = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.equal(telaComBase(plano(f.fechamento), plano(nov2)).run('perfMudancasDoSelo(__selo,__atual)').mudaram, 1);
  e.db.painel_ordens[0].valor = 8500;
  // Uma mudança que a comparação antiga da tela não via (o cliente da O.S. mudou no ERP): a tela diz que mudou; a comissão aprova.
  const row = linha(e, 'c1');
  row.registro = {...row.registro, cliente:'Cliente fictício renomeado'};
  row.atualizado_em = '2026-12-05T13:00:00Z';
  relogio(e, '2026-12-08T12:00:00Z');
  const nov = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, gestor);
  assert.notEqual(nov.hash, f.fechamento.hash);
  const t = telaComBase(plano(f.fechamento), plano(nov));
  assert.equal(t.run('perfMudancasDoSelo(__selo,__atual)').mudaram, 1);
  assert.match(t.run('perfAvisoFechadoHTML(perfFonteAtual(),true)'), /Há 1 mudança nas entregas depois do fechamento \(1 entrega mudou\)/);
  const ap = await aprovarComissao(e, NOV, p.revisao);
  assert.equal(ap.status, 200, JSON.stringify(ap));
});
test('revisão fechamento: D2, a régua "como estava no fim do dia" é a mesma nas duas cópias do motor', async () => {
  const {CONFERENCIA_ENTREGA:S} = await import('../supabase/functions/_shared/pcp-conferencia-entrega.mjs');
  for (const M of [C, S]) {
    assert.equal(typeof M.noFimDoDia, 'function');
    const o = osItens('c1');
    o.conferenciasEntrega = [conf(o, 'e1', '2026-11-05', [sel(o, 0, 2)]), conf(o, 'e2', '2026-12-08', [sel(o, 0, 2), sel(o, 1, 1)])];
    o.itens[1].entregas = [{id:'m1', tipo:'cancelado', qtde:1, dia:'2026-12-09', motivo:'Item cancelado fictício', via:'gestao', por:'Gestor', porId:'111222', em:'2026-12-09T12:00:00Z'}];
    o.finalizadaEm = '2026-12-09T15:00:00Z';o.finalizadoPor = 'Gestor fictício';
    o.cancelamento = {ativo:true, motivo:'Cliente desistiu do serviço fictício', em:'2026-12-10T12:00:00Z'};
    const nov = M.noFimDoDia(o, '2026-11-30');
    assert.deepEqual(nov.conferenciasEntrega.map(x => x.id), ['e1']);
    assert.deepEqual(nov.itens[1].entregas, []);
    assert.equal(nov.finalizadaEm, undefined);assert.equal(nov.cancelamento, undefined);
    assert.equal(M.estado(nov, 8500).situacao, 'parcial');
    // O dia de hoje (ou depois de tudo) devolve a O.S. como está.
    const tudo = M.noFimDoDia(o, '2026-12-31');
    assert.equal(tudo.conferenciasEntrega.length, 2);assert.equal(tudo.finalizadaEm, o.finalizadaEm);assert.equal(tudo.cancelamento, o.cancelamento);
    // A O.S. original não muda.
    assert.equal(o.conferenciasEntrega.length, 2);assert.equal(o.itens[1].entregas.length, 1);
    assert.equal(M.noFimDoDia(o, ''), o, 'sem dia válido, a O.S. como está');
  }
  assert.equal(ler('supabase/functions/_shared/pcp-conferencia-entrega.mjs').includes('function noFimDoDia(os, dia, {gravadoAte'), true);
});

/* A tela do mês fechado (performance.js em vm), com o selo e os dados atuais do servidor. */
function tela({papel = 'pcp', periodo = NOV, hoje = '2026-12-11', api = null, os = []} = {}) {
  const chamadas = [], esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
  const c = {console, setTimeout, clearTimeout, chamadas,
    STORE:{getCFG:() => ({performancePCP:{equipes:[], participacoes:[]}}), getAllOS:() => os, getQueue:() => [], getOS:id => os.find(o => o.id === id) || null, uuid:() => 'req-ficticio-0001',
      api:async corpo => { chamadas.push(corpo); return api ? api(corpo) : {}; }},
    STATE:{user:{papel}, _fPerf:{...periodo}}, periodoOuMes:() => ({...c.STATE._fPerf}), classificarEntregas:xs => ({instalacoes:xs, aLancar:[]}),
    diaEntrega:() => '2026-11-05', nomeExibicaoCasa:n => ({chave:n, nome:'Pessoa ' + n}), pessoasRH:() => [], avatarRH:() => '', esc,
    dinheiroCasa:n => 'R$ ' + Number(n).toFixed(2), filtroPeriodoHTML:() => '', normCasa:s => String(s || '').toLowerCase(),
    renderPerformanceCasa:() => {}, toast:() => {}, perfCasaTemAbaConferencia:() => true};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'performance.js']) vm.runInContext(ler(f), c);
  c.perfHojeISO = () => hoje;
  c.run = code => vm.runInContext(code, c);
  return c;
}
function telaComBase(selo, atual, opcoes = {}) {
  const c = tela(opcoes);
  c.__selo = selo; c.__atual = atual;
  c.run('perfRemoto.chave=perfChave();perfRemoto.dados=__atual;perfRemoto.fechamentos=[__selo];perfRemoto.selecionado=__selo.id;perfRemoto.tentado=true;');
  return c;
}

/* ===================================================================== D4 */
test('revisão fechamento: D4, Entregas conta a parte conferida da O.S. cancelada, como o ranking e a comissão', () => {
  const c = {console};vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js']) vm.runInContext(ler(f).replace(/^const (OPERACAO|ENTREGA_ITEM|CONFERENCIA_ENTREGA) =/m, 'var $1 ='), c);
  const casa = ler('casa.js'), ini = casa.indexOf('function erpAntesDoCorte'), fim = casa.indexOf('\n}\n', casa.indexOf('function classificarEntregas')) + 3;
  vm.runInContext("var CORTE_LANCAMENTO_MANUAL='2026-09-15';var STORE={getAllOS:()=>[]};" + casa.slice(ini, fim), c);
  const o = osItens('c1');
  o.conferenciasEntrega = [{id:'e1', dia:'2026-09-25', itens:[sel(o, 0, 2)]}];
  const manual = {...o, cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço fictício'}};
  const erp = {...o, id:'c2', finalizadaEm:'2026-09-28T12:00:00Z', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:'2026-09-28T12:00:00Z', status:'CANCELADO'}};
  const semNada = {...osItens('c3'), cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço fictício'}};
  c.__xs = [manual, erp, semNada];
  const r = plano(vm.runInContext('classificarEntregas(__xs)', c));
  // Caso ruim: as três iam inteiras para "canceladas" e Entregas não contava a parte conferida.
  assert.deepEqual(r.instalacoes.map(x => x.id), ['c1', 'c2'], 'a parte conferida conta como entrega');
  assert.deepEqual(r.aLancar.map(x => x.id), [], 'a cancelada nunca vai para "a lançar"');
  assert.deepEqual(r.canceladas.map(x => x.id), ['c1', 'c2', 'c3'], 'o saldo foi cancelado: continuam em canceladas');
  // A parcela que Entregas soma é a da conferência, pelo motor: 2 de 4 unidades do item A.
  c.__o = manual;
  assert.deepEqual(plano(vm.runInContext('CONFERENCIA_ENTREGA.apurar(__o, 8500).entregas.map(e => [e.id, e.valor])', c)), [['e1', 212500]]);
  assert.match(casa, /A CANCELADA COM PARTE CONFERIDA \(revisão da onda fechamento, D4/);
});

/* ===================================================================== U1 */
test('revisão fechamento: U1, a porta dos períodos fechados responde a quem vê o ranking, só com períodos e revisões', async () => {
  const e = await edge('pcp-sync', banco([{...osItens('a1', {finalizadaEm:'2026-11-10T15:00:00Z', entregaLancada:{data:'2026-11-10'}})}], {painel_ordens:[{numero:'90201', valor:8500}]}));
  relogio(e, '2026-12-02T12:00:00Z');
  assert.equal((await fechar(e, NOV)).status, 200);
  const gestao = await e.call({action:'performanceFechados'}, gestor);
  assert.deepEqual(Object.keys(gestao.fechados[0]).sort(), ['ate', 'de', 'revisoes', 'ultimaRevisao', 'ultimoEm']);
  // Caso ruim: montagem, operação e comercial levavam 403, e a tela deles afirmava "Mês aberto" num mês fechado.
  const toque = {papel:'montagem', nome:'Instalador fictício', sub:'Instalador fictício', id:'100001', montagemIndividual:true, exp:EXP};
  for (const who of [montagem, {...montagem, papel:'operacao'}, {...montagem, papel:'comercial'}, toque]) {
    const r = await e.call({action:'performanceFechados'}, who);
    assert.equal(r.status ?? 200, 200, who.papel);
    assert.deepEqual(plano(r.fechados), [{de:'2026-11-01', ate:'2026-11-30', revisoes:1, ultimaRevisao:1}], 'nada de R$, de quem fechou nem de quando');
    assert.doesNotMatch(JSON.stringify(r), /fechadoPor|Gestor|8500|valor/);
  }
  // Sem crachá do PCP, nada; outro sistema, nada.
  assert.ok([401, 403].includes((await e.call({action:'performanceFechados'}, {papel:'montagem', nome:'X', sub:'x', sis:'rh', exp:EXP})).status));
  assert.ok([401, 403].includes((await e.call({action:'performanceFechados'}, {papel:'visitante', nome:'X', sub:'x', exp:EXP})).status));
  assert.match(ler('supabase/functions/pcp-sync/index.ts'), /if\(!gestaoFech && !podeVerRankingEquipe\(cracha\)\)return resp\(\{error:"Entre com seu acesso de funcionário do PCP\.",semSessao:!cracha\},cracha\?403:401\);/);
});
test('revisão fechamento: U1, a tela de quem não lê a apuração diz o mês fechado pela base; sem base, não afirma "Mês aberto"', async () => {
  const lista = [{de:'2026-11-01', ate:'2026-11-30', revisoes:2, ultimaRevisao:2}];
  for (const papel of ['montagem', 'operacao', 'comercial']) {
    const t = tela({papel, api:corpo => corpo.action === 'performanceFechados' ? {fechados:lista, hoje:'2026-12-11'} : {}});
    // Sem a base (ainda não veio, sem rede ou servidor antigo): nada de "Mês aberto".
    assert.match(t.run('perfSituacaoHTML(null)'), /<span class="perf-situacao provisorio">Prévia do aparelho<\/span>/);
    // A tela pede a base a todos os papéis (antes, só admin e pcp).
    t.run('perfWireFonte({querySelector:()=>null,querySelectorAll:()=>[]})');
    await new Promise(r => setTimeout(r, 0));
    assert.ok(t.chamadas.some(x => x.action === 'performanceFechados'), papel + ' pede os períodos fechados');
    // Caso ruim: novembro fechado aparecia como "Mês aberto, resultado provisório".
    // Os números são os do aparelho, não os do fechamento: o selo diz as duas coisas (verificação da correção).
    assert.match(t.run('perfSituacaoHTML(null)'), /<span class="perf-situacao provisorio">Mês fechado · revisão 2 · prévia do aparelho<\/span>/);
    assert.doesNotMatch(t.run('perfSituacaoHTML(null)'), /Mês aberto/);
    // Dezembro, com a base, é o mês aberto.
    t.STATE._fPerf = {de:'2026-12-01', ate:'2026-12-11'};
    assert.match(t.run('perfSituacaoHTML(null)'), /Mês aberto, resultado provisório/);
    // Um recorte dentro do mês fechado.
    t.STATE._fPerf = {de:'2026-11-01', ate:'2026-11-15'};
    assert.match(t.run('perfSituacaoHTML(null)'), /Período fechado · revisão 2 · prévia do aparelho/);
  }
  // A gestão sem base nenhuma (a apuração e as revisões não vieram) também não afirma.
  const g = tela();
  assert.equal(g.run('perfSeloAberto()'), null);
  g.run("perfRemoto.chave=perfChave();perfRemoto.tentado=true;perfRemoto.erroRevisoes='Sem conexão com o servidor. Tente de novo.';");
  assert.equal(g.run('perfSeloAberto()'), null);
  // A Jornada e o Relatório, sem selo, voltam ao texto neutro (não ao "Mês aberto").
  assert.match(ler('performance.js'), /esc\(\(perfSeloAberto\(\)\|\|\{texto:'Apuração em andamento'\}\)\.texto\)/);
  assert.doesNotMatch(ler('performance.js'), /perfSeloAberto\(\)\|\|\{texto:PERF_TXT_ABERTO\}/);
  // No Modo TV de quem não lê a apuração, a mesma régua.
  const s = ler('casa.js'), P = require('../performance.js');
  const tv = selo => { const ctx = {PERF:P, STATE:{}, perfConfig:() => ({equipes:[]}), perfLista:() => [], perfRegistro:r => r, perfUnirPessoas:r => r, diaEntrega:() => '', OPERACAO:{emIntervalo:() => true},
    esc:x => String(x), avatarRH:() => '', pessoasRH:() => [], perfFormato:String, carrosHTML:() => '', retrabalhoHTML:() => '', rotuloPeriodoCasa:() => '', perfFonteAtual:() => null, perfSeloAberto:() => selo};
    vm.createContext(ctx); vm.runInContext(s.slice(s.indexOf('function painelTVCasa('), s.indexOf('function rotuloPeriodoCasa(')), ctx); return ctx.painelTVCasa(0, {}).html; };
  assert.match(tv({tipo:'ok', texto:'Mês fechado · revisão 2'}), /<span class="tv-selo ok">Mês fechado · revisão 2<\/span>/);
});

/* ===================================================================== U2 */
async function dialogoConferir({fechados, inteira = null, conferencias = [], entregaId = ''}) {
  const o = osItens('c1', {conferenciasEntrega:conferencias});
  let html = '';
  const elemento = () => ({textContent:'', hidden:false, disabled:false, value:'', classList:{toggle() {}, add() {}}, querySelector:() => null, focus() {}, scrollIntoView() {}});
  const els = {};
  const c = {console, crypto:{randomUUID:() => 'nova-0001'}, STATE:{user:{papel:'pcp'}}, esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    perfPodeEditar:() => true, toast:() => {}, perfConfig:() => ({equipes:[]}), perfRegrasFonte:() => ({versoes:[]}), diaEntrega:() => '2026-11-10', dinheiroCasa:n => 'R$ ' + n,
    STORE:{getQueue:() => [], api:async () => ({os:o, valor:8500, fechados, inteira})},
    ALOCUI:{iniciar() {}, montar() {}, repintar() {}, estado:() => ({}), bloqueio:() => '', esquecer() {}, definirDataEntrega() {}},
    DIVISAO:D, perfDialog:(t, h) => { html = h; return {open:true, querySelector:sel => els[sel] || (els[sel] = elemento()), querySelectorAll:() => [], addEventListener() {}, close() {}}; }};
  vm.createContext(c);
  for (const f of ['entrega-item.js', 'conferencia-entrega.js']) vm.runInContext(ler(f).replace(/^const (ENTREGA_ITEM|CONFERENCIA_ENTREGA) =/m, 'var $1 ='), c);
  vm.runInContext(ler('conferencia-entrega-ui.js'), c);
  await c.conferirItensEntrega('c1', entregaId);
  return {html, salvar:els['#conf-salvar'], status:els['#conf-status']};
}
test('revisão fechamento: U2, conferir em mês fechado não empurra a trocar a data; a entrega já conferida no mês fechado fica só leitura', async () => {
  const fechados = [{de:'2026-09-01', ate:'2026-09-30', revisoes:1, ultimaRevisao:1}];
  const c = {console};vm.createContext(c);vm.runInContext(ler('conferencia-entrega-ui.js'), c);
  // Caso ruim: "escolha o dia certo, num mês aberto" fazia trocar 30/09 por 01/10, e a entrega de setembro contava em outubro.
  const novo = c.confTravaMesFechado(fechados, '', '2026-09-30');
  assert.equal(novo, 'O dia 30/09/2026 está num mês já fechado (01/09/2026 a 30/09/2026, revisão 1). Se a data está errada, corrija. Se a entrega foi mesmo em setembro de 2026, ela não pode ser conferida agora: o ajuste de mês fechado ainda não existe; fale com a gestão.');
  assert.doesNotMatch(novo, /mês aberto/);
  // A conferência nova: a data continua editável (para corrigir a data errada), e o Salvar fica travado com o motivo.
  const d1 = await dialogoConferir({fechados});
  assert.match(d1.html, /<fieldset class="conf-campos" >/);assert.doesNotMatch(d1.html, /<fieldset[^>]*disabled/);
  // A entrega já conferida dentro do mês fechado: os campos (data, itens, quantidades e a equipe) ficam só leitura, não só o botão.
  const o = osItens('c1');
  const d2 = await dialogoConferir({fechados, conferencias:[conf(o, 'e1', '2026-09-25', [sel(o, 0, 2)])], entregaId:'e1'});
  assert.match(d2.html, /<fieldset class="conf-campos so-leitura" disabled aria-describedby="conf-mes-fechado"><legend class="perf-sr">Entrega em mês fechado: só leitura<\/legend>\s*<label class="conf-data">Data desta entrega <input id="conf-data"/);
  assert.match(d2.html, /<div id="conf-aloc"><\/div><\/fieldset>/, 'a divisão da equipe também fica dentro do fieldset desligado');
  assert.match(d2.html, /Esta entrega foi conferida em 25\/09\/2026, num mês já fechado/);
  assert.equal(d2.salvar.disabled, true);
  // A entrega de mês aberto continua editável.
  const d3 = await dialogoConferir({fechados, conferencias:[conf(o, 'e1', '2026-10-05', [sel(o, 0, 2)])], entregaId:'e1'});
  assert.doesNotMatch(d3.html, /<fieldset[^>]*disabled/);
  // A O.S. que já entrou inteira num mês fechado (D1): só leitura, com a causa.
  const d4 = await dialogoConferir({fechados, inteira:{dia:'2026-09-10', de:'2026-09-01', ate:'2026-09-30', ultimaRevisao:1}});
  assert.match(d4.html, /<fieldset class="conf-campos so-leitura" disabled/);
  assert.match(d4.html, /Esta O\.S\. já entrou inteira no fechamento de 01\/09\/2026 a 30\/09\/2026 \(revisão 1\), com a entrega de 10\/09\/2026\. Conferir os itens agora contaria a mesma entrega de novo em outro mês: o ajuste de mês fechado ainda não existe; fale com a gestão\./);
  assert.equal(d4.salvar.disabled, true);
  // A porta diz o mesmo, sem sugerir mês aberto.
  const srv = ler('supabase/functions/pcp-sync/index.ts');
  assert.doesNotMatch(srv, /escolha o dia certo, num mês aberto/);
  assert.match(srv, /Se a data está errada, corrija\. Se a entrega foi mesmo em \$\{perfMesTxt\(String\(entrega\.dia\)\.slice\(0,7\)\)\}, ela não pode ser conferida agora: \$\{PERF_AJUSTE_FECHADO\}/);
});

/* ============================================================ U3, U4, U5 */
const pessoaT = (id, pct = 100) => ({chave:id, nome:'Pessoa ' + id, percentual:pct});
const regT = (id, valor, membros = [pessoaT('900001')], extra = {}) => ({id, numero:'9' + id.replace(/\D/g, '').padStart(4, '0'), cliente:'Cliente fictício', dia:'2026-11-10', valor, membros, confirmado:true, fonte:'alocacao', equipeId:'', retornoConf:null, voltou:false, ...extra});
const fonteT = (registros, extra = {}) => ({periodo:{...NOV}, regra:'performance-3', regraNota:'nota-valor-1', registros, hash:'hash-ficticio', consultadoEm:'2026-12-02T10:00:00Z', completo:true, fonte:'teste', ...extra});
function telaRanking(registros, cobertura, {aLancar = 2, fechamentos = []} = {}) {
  const t = tela();
  t.classificarEntregas = xs => ({instalacoes:xs || [], aLancar:Array.from({length:aLancar}, (_, i) => ({id:'b' + i, numero:'9100' + i}))});
  t.__f = fonteT(registros, {cobertura}); t.__h = fechamentos;
  t.run('perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado="";perfRemoto.tentado=true;perfFechados.tentado=true;perfFechados.lista=[];');
  t.STATE._perfModo = 'pessoas';
  return t;
}
test('revisão fechamento: U3, U4 e U5, só a cobertura do mês sobe; as baixas do ERP aparecem uma vez; o aviso forte só com pódio', () => {
  const regs = [regT('a1', 300, [pessoaT('900001')]), regT('a2', 200, [pessoaT('900002')]), regT('a3', 100, [pessoaT('900003')], {confirmado:false, fonte:'sugestao'})];
  const cob = {entregas:3, entregasCentavos:60000, entregasSemValor:0, aLancar:2, aLancarCentavos:90000, aLancarSemValor:0, aLancarNumeros:['91000', '91001'], pctValor:40, baixa:true};
  const html = telaRanking(regs, cob).run('performanceEquipesHTML()');
  // U3. Caso ruim: o quadro inteiro "Participantes nas entregas" subiu para cima do pódio e o empurrou para baixo da dobra.
  // U3 da auditoria de 12/10/2026: os avisos do topo numa caixa só (perf-avisos-topo), com a cobertura em uma linha.
  const iTopo = html.indexOf('class="perf-avisos-topo"'), iRank = html.indexOf('class="perf-ranking'), iPodio = html.indexOf('class="perf-podio'), iComo = html.indexOf('Como interpretar os indicadores'), iQuadro = html.indexOf('class="perf-cobertura');
  assert.ok(iTopo > 0 && iTopo < iRank && iRank < iPodio, 'a linha da cobertura do mês vem antes do ranking e do pódio');
  assert.ok(iQuadro > iComo && iComo > iPodio, 'o quadro "Participantes nas entregas" voltou para depois de "Como interpretar", como na v166');
  // U4. Caso ruim: "N baixas do ERP" aparecia três vezes (linha do mês, aviso do pódio e linha do lançamento).
  assert.equal((html.match(/baixas? do ERP/g) || []).length, 1, 'uma menção só às baixas do ERP');
  // U4. Os rótulos dizem a diferença: o mês inteiro (com as baixas a lançar) lá em cima, só as lançadas no PCP no quadro.
  assert.match(html, /Cobertura do mês: <strong>2 de 3 entregas conferidas<\/strong>, <strong>33% do valor<\/strong> · <strong>1 a conferir<\/strong> \(as notas só valem depois da conferência\) · 2 baixas do ERP a lançar \(R\$ 900\.00\), fora da conta<\/span>/);
  assert.match(html, /<button type="button" class="btn-ghost btn-sm" data-perf-lancar>Abrir o lançamento<\/button><\/p>/);
  assert.match(html, /title="Conferidas: as entregas com a participação confirmada\. O valor conta as confirmadas e com valor contra o do mês inteiro, com as baixas a lançar\."/);
  assert.match(html, /das lançadas no PCP neste período|Todas as 3 entregas do período têm participantes/);
  assert.match(html, /<strong>3 de 3<\/strong> entregas com participantes|Todas as 3 entregas do período têm participantes/);
  // U5. Com pódio, o aviso forte vem antes dele.
  assert.ok(html.indexOf('perf-aviso-forte') > 0 && html.indexOf('perf-aviso-forte') < iPodio);
  // U5. Caso ruim: sem pódio na tela (nenhuma entrega confirmada), o aviso "Este pódio não representa o mês" aparecia mesmo assim.
  const semPodio = telaRanking([regT('a1', 300, [pessoaT('900001')], {confirmado:false, fonte:'sugestao'})], cob).run('performanceEquipesHTML()');
  assert.doesNotMatch(semPodio, /class="perf-podio/);
  assert.doesNotMatch(semPodio, /Este pódio não representa o mês/);
  const eq = telaRanking([regT('a1', 300, [pessoaT('900001')], {confirmado:false, fonte:'sugestao'})], cob);eq.STATE._perfModo = 'equipes';
  assert.doesNotMatch(eq.run('performanceEquipesHTML()'), /Este pódio não representa o mês/);
  // O mês fechado (M8) diz que é a revisão no topo, em uma linha, e não repete o aviso no quadro de baixo.
  const s1 = {...fonteT(regs), id:'2026-11-01:2026-11-30:000001', de:NOV.de, ate:NOV.ate, revisao:1, fechadoEm:'2026-12-02T12:00:00Z', fechadoPor:'Gestor fictício'};
  const f = telaRanking(regs, cob, {fechamentos:[s1]});
  f.run('perfRemoto.selecionado=perfRemoto.fechamentos[0].id');
  const hf = f.run('performanceEquipesHTML()');
  assert.equal((hf.match(/Mês fechado: você está vendo a revisão 1/g) || []).length, 1);
  assert.ok(hf.indexOf('Mês fechado: você está vendo a revisão 1') < hf.indexOf('class="perf-ranking'));
});

/* ============================================ U6, U7, U8, U9, U10, U11 */
test('revisão fechamento: U6, a palavra "selo" sai dos textos ao usuário: "não entram no fechamento"', () => {
  const p = ler('performance.js');
  // Caso ruim: "Elas não entram no selo", "Nada muda no selo" e "não entra no selo".
  assert.doesNotMatch(p, /não entram? no selo|Nada muda no selo/);
  assert.match(p, /Elas não entram no fechamento: para valer, crie uma nova revisão em Base e fechamento\./);
  assert.match(p, /Nada muda no fechamento até a nova revisão\./);
  assert.match(p, /O que você gravar aqui não entra no fechamento: para valer, crie uma nova revisão desse mês em Base e fechamento\./);
});
test('revisão fechamento: U7, o "O que muda por pessoa" volta a ter a seta, como o "Como interpretar"', () => {
  const css = ler('performance-layout.css');
  assert.match(css, /\.perf-mudancas summary\{[^}]*display:flex/, 'premissa: o display:flex tira a seta nativa');
  assert.match(css, /\.perf-mudancas summary:before\{content:'▸'/);
  assert.match(css, /\.perf-mudancas\[open\] summary:before\{content:'▾'\}/);
  assert.match(css, /#panel-performance \.perf-method>summary:before\{content:'▸'\}/, 'a mesma seta do .perf-method');
});
test('revisão fechamento: U8, o selo do mês é legível de longe na TV e destacado no ranking.html', () => {
  const css = ler('performance-layout.css'), m = /\.tv-selo\{[^}]*font-size:clamp\(([\d.]+)rem,([\d.]+)vw,([\d.]+)rem\)/.exec(css);
  assert.ok(m, 'o selo da TV escala com a tela');
  const px = largura => Math.min(Math.max(Number(m[1]) * 16, Number(m[2]) * largura / 100), Number(m[3]) * 16);
  // Caso ruim: 16 px a 1920 (o título tinha 41,6 px).
  assert.ok(px(1920) >= 28, 'a 1920 px o selo tem ' + px(1920) + ' px');
  assert.ok(px(375) >= 15 && px(375) <= 17, 'e não estoura no celular: ' + px(375) + ' px');
  assert.match(css, /\.tv-head>\.tv-relogio\{grid-column:2;grid-row:1\}\.tv-head>\.tv-selo\{grid-column:1\/-1;grid-row:2;justify-self:start\}/, 'o relógio fica na linha do título e o selo vai para a linha de baixo');
  assert.match(css, /\.tv-selo\.ok\{/);
  // ranking.html: antes, o fim da legenda cinza de 12 px; agora um selo próprio, acima dos números.
  const html = ler('ranking.html'), rcss = ler('ranking.css');
  assert.ok(html.indexOf('id="ranking-selo"') > 0 && html.indexOf('id="ranking-selo"') < html.indexOf('id="ranking-resumo"'));
  assert.match(rcss, /\.ranking-selo-mes\{[^}]*font-size:15px;font-weight:750/);
  assert.match(rcss, /\.ranking-selo-mes\.fechado\{/);
  assert.match(rcss, /@media\(max-width:650px\)\{\.ranking-selo-mes\{[^}]*font-size:14px/);
});
test('revisão fechamento: U9, o aviso dos meses sem fechamento nomeia os mesmos meses dos botões', () => {
  const t = tela({hoje:'2027-03-10'});
  t.run('perfFechados.lista=[]');
  const html = t.run('perfAvisoMesSemFechamentoHTML()');
  // Caso ruim: o texto listava quatro meses e havia três botões.
  assert.equal((html.match(/data-perf-abrir-mes=/g) || []).length, 3);
  assert.match(html, /<strong>4 meses terminaram e ainda não foram fechados: novembro de 2026, dezembro de 2026 e janeiro de 2027 e mais 1 mês depois deles\.<\/strong> Confira as entregas e feche um mês de cada vez, do mais antigo, em Base e fechamento\./);
  for (const m of ['2026-11', '2026-12', '2027-01']) assert.match(html, new RegExp('data-perf-abrir-mes="' + m + '"'));
  assert.doesNotMatch(html, /fevereiro/);
  const dois = tela({hoje:'2027-01-05'});dois.run('perfFechados.lista=[]');
  const h2 = dois.run('perfAvisoMesSemFechamentoHTML()');
  assert.match(h2, /<strong>Novembro de 2026 e dezembro de 2026 terminaram e ainda não foram fechados\.<\/strong>/);
  assert.equal((h2.match(/data-perf-abrir-mes=/g) || []).length, 2);
});
test('revisão fechamento: U10, o seletor de versão cabe a 375 px e o texto da revisão substituída não se repete', () => {
  const t = tela();
  const s1 = {...fonteT([regT('a1', 300)]), id:'2026-11-01:2026-11-30:000001', de:NOV.de, ate:NOV.ate, revisao:1, fechadoEm:'2026-12-01T12:00:00Z', fechadoPor:'Gestor fictício'};
  const s2 = {...s1, id:'2026-11-01:2026-11-30:000002', revisao:2, fechadoEm:'2026-12-02T12:00:00Z'};
  t.__h = [s2, s1];
  t.run("perfRemoto.chave=perfChave();perfRemoto.dados=null;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__h[1].id;perfRemoto.tentado=true;");
  // Caso ruim: "Fechamento preservado · revisão 1 (Revisão 1, substituída pela 2)".
  assert.match(t.run('perfFonteTexto()'), /^Fechamento preservado · revisão 1, substituída pela 2 · Gestor fictício · /);
  assert.doesNotMatch(t.run('perfFonteTexto()'), /\(Revisão 1/);
  // O "substituída" logo depois do número: a 375 px o select corta o fim, e o nome de quem fechou é o que pode sumir.
  assert.match(t.run('perfFonteHTML()'), /<option value="2026-11-01:2026-11-30:000001" selected>Revisão 1, substituída pela 2 · 01\/12\/2026 · Gestor fictício<\/option>/);
  assert.match(ler('styles.css'), /\.perf-base-acoes select\{max-width:100%;min-width:0/);
  assert.match(ler('styles.css'), /\.perf-base-acoes label\{display:grid;gap:6px;font-size:\.8rem;color:#3d5566;min-width:0;max-width:100%\}/);
});
test('revisão fechamento: U11, outubro de 2026 é mês de teste: o Fechar não marca data para fechá-lo', async () => {
  const t = tela({periodo:{de:'2026-10-01', ate:'2026-10-31'}, hoje:'2026-10-12'});
  // Caso ruim: "outubro de 2026 pode ser fechado a partir de 01/11/2026".
  const trava = t.run("perfTravaMes({de:'2026-10-01',ate:'2026-10-31'},'2026-10-12')");
  assert.equal(trava, 'Outubro de 2026 é mês de teste e não tem data para ser fechado: a gestão ainda decide se ele será fechado.');
  assert.doesNotMatch(trava, /a partir de/);
  // O período padrão (outubro até hoje) também.
  assert.equal(t.run("perfTravaMes({de:'2026-10-01',ate:'2026-10-12'},'2026-10-12')"), trava);
  // Novembro continua com a data.
  assert.match(t.run("perfTravaMes({de:'2026-11-01',ate:'2026-11-30'},'2026-11-20')"), /novembro de 2026 pode ser fechado a partir de 01\/12\/2026/);
  // A porta diz o mesmo.
  const e = await edge('pcp-sync', banco([]));
  relogio(e, '2026-10-12T12:00:00Z');
  const r = await e.call({action:'performanceFechar', de:'2026-10-01', ate:'2026-10-31', hash:'x', anterior:'', requestId:'fechar-outubro-0001', motivo:'Fechamento fictício'}, gestor);
  assert.equal(r.status, 422);assert.equal(r.error, trava);
});

/* ========================================================== D3 e D5 */
test('revisão fechamento: D3, o DECISOES.md avisa que o selo de antes da v167 com cancelada conferida não recalcula igual', () => {
  const d = ler('docs/DECISOES.md');
  const nota = d.slice(d.indexOf('  - Nota de 12/10/2026 (revisão da onda fechamento'));
  assert.ok(d.indexOf('- D-012 ·') < d.indexOf('  - Nota de 12/10/2026 (revisão da onda fechamento') && d.indexOf('  - Nota de 12/10/2026 (revisão da onda fechamento') < d.indexOf('## Pendentes'), 'a nota fica na D-012');
  assert.match(nota, /O\.S\. cancelada com conferência .* item cancelado e conferência .* não recalcula igual ao selo gravado antes da v167/);
  assert.match(nota, /Em 12\/10\/2026 a produção tinha 0 fechamentos/);
  assert.doesNotMatch(nota.split('\n')[0], /—/);
});
test('revisão fechamento: D5, os testes de tempo medem a melhor de várias, com o motivo', () => {
  const t = ler('tests/entregas-por-os.test.cjs');
  // Caso ruim: o pior de cinco toques e uma medida só da troca de período (110,8 ms com a suíte inteira, 17 ms sozinha).
  assert.match(t, /MELHOR DE 5, NÃO O PIOR \(revisão da onda fechamento, D5/);
  assert.match(t, /melhor = Math\.min\(melhor, Number\(process\.hrtime\.bigint\(\) - ini\) \/ 1e6\);/);
  assert.match(t, /periodo = Math\.min\(periodo, Number\(process\.hrtime\.bigint\(\) - ini\) \/ 1e6\);/);
  assert.doesNotMatch(t, /pior = Math\.max\(pior/);
  assert.match(ler('tests/entregas-por-os-revisao.test.cjs'), /melhor = Math\.min\(melhor/);
});
