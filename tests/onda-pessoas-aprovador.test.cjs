'use strict';
/* ONDA PESSOAS, ITEM 5 DA SESSÃO PRINCIPAL (D-014, 12/10/2026): O APROVADOR DA
   COMISSÃO É SUBSTITUÍVEL. "pode fazer e tem que criar um esquema para colocar
   outra pessoa no lugar [do titular] se houver necessidade" (o dono, com o nome trocado). Titular e
   substituto pelo ID de 6 dígitos, gravados só pelo admin, com motivo e
   diário. Os casos ruins: qualquer pcp aprovando com titular designado; o
   titular aprovando enquanto o substituto vale; o substituto aprovando antes
   do início ou depois do fim; a montagem ou outro papel aprovando por ter o
   papel certo e não o ID certo. Pessoas, CPFs e valores fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const C = require('../comissao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* ------------------------------------------------------------ a régua */
test('régua: sem configuração vale a D-013; com titular, só ele (e o admin); com substituto vigente, só o substituto (e o admin)', async () => {
  const {COMISSAO:S} = await import('../supabase/functions/_shared/pcp-comissao.mjs');
  for (const X of [C, S]) {
    const hoje = '2026-12-05';
    assert.equal(X.quemAprova({papel:'pcp', porId:''}, null, hoje).ok, true, 'D-013: pcp sem ID aprova');
    assert.equal(X.quemAprova({papel:'operacao', porId:'700002'}, null, hoje).ok, false);
    const cfg = {titularId:'700001'};
    assert.deepEqual(X.quemAprova({papel:'pcp', porId:'700001'}, cfg, hoje).como, 'titular');
    assert.equal(X.quemAprova({papel:'pcp', porId:'700003'}, cfg, hoje).ok, false, 'outro pcp não aprova com titular designado');
    assert.equal(X.quemAprova({papel:'admin', porId:''}, cfg, hoje).como, 'admin');
    const sub = {titularId:'700001', substituto:{id:'700002', de:'2026-12-04', ate:'2026-12-06'}};
    assert.equal(X.quemAprova({papel:'operacao', porId:'700002'}, sub, hoje).como, 'substituto', 'o substituto aprova mesmo sem o papel pcp');
    const t = X.quemAprova({papel:'pcp', porId:'700001'}, sub, hoje);
    assert.equal(t.ok, false); assert.match(t.erro, /quem aprova a comissão é ele, não o titular/); assert.match(t.erro, /até 06\/12\/2026/);
    assert.equal(X.quemAprova({papel:'admin', porId:''}, sub, hoje).ok, true);
    // Fora do prazo (antes do início ou depois do fim): volta ao titular.
    for (const dia of ['2026-12-03', '2026-12-07']) {
      assert.equal(X.quemAprova({papel:'operacao', porId:'700002'}, sub, dia).ok, false, dia);
      assert.equal(X.quemAprova({papel:'pcp', porId:'700001'}, sub, dia).como, 'titular', dia);
    }
    // Sem fim: vale desde o início.
    assert.equal(X.quemAprova({papel:'pcp', porId:'700002'}, {titularId:'700001', substituto:{id:'700002', de:'2026-12-04'}}, '2027-06-01').como, 'substituto');
  }
});

/* ------------------------------------------------------------ o servidor */
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const conta = (papel, sub, nome) => ({papel, sub, nome, exp:EXP});
const TITULAR = conta('pcp', 'titular-ficticio', 'Titular Fictício');
const OUTRO_PCP = conta('pcp', 'outro-pcp', 'Outro Gestor Fictício');
const SUBST = conta('operacao', 'subst-ficticio', 'Substituta Fictícia');
const ADMIN = conta('admin', 'admin-ficticio', 'Admin Fictício');
const MONTAGEM = conta('montagem', 'montagem-ficticia', 'Montagem Fictícia');
const ficha = (id, nome, apelido, cpf, extra = {}) => ({id, colecao:'colaboradores', apagado:false, registro:{id, nome, apelido, cpf, statusId:'ativo', ...extra}});
const FICHAS = [ficha('t', 'Titular Fictício', 'titular-ficticio', '70000111111'), ficha('s', 'Substituta Fictícia', 'subst-ficticio', '70000222222'),
  ficha('o', 'Outro Gestor Fictício', 'outro-pcp', '70000333333'), ficha('m', 'Montagem Fictícia', 'montagem-ficticia', '70000444444'),
  ficha('i', 'Instalador Fictício', 'instalador', '10000111111'), ficha('x', 'Pessoa Que Saiu', 'saiu', '70000555555', {dataDesligamento:'2026-01-10'})];
const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
function banco() {
  const o = {id:'A', numero:'90901', rev:3, tipo:'externo', cliente:'Cliente fictício', valorTotal:8500, equipe:['100001'], veiculo:'Carro fictício',
    horaRetorno:'18:00', retornoEm:'2026-11-05T18:00:00', finalizadaEm:'2026-11-05T21:00:00.000Z', finalizadoPor:'Gestor fictício', entregaLancada:{data:'2026-11-05', em:'2026-11-05T21:00:00.000Z', por:'Gestor fictício'}};
  return {pcp_registros:[{colecao:'os', id:'A', apagado:false, atualizado_em:'2026-11-20T00:00:00Z', registro:o}], registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[{id:'A', membros:[{chave:'100001', nome:'Instalador Fictício', percentual:100}], por:'Gestor fictício', em:'2026-11-06T00:00:00Z'}]}}}],
    painel_ordens:[{numero:'90901', valor:8500}], equipe_contas:[{sistema:'pcp', usuario:'titular-ficticio', papel:'pcp', ativo:true}, {sistema:'pcp', usuario:'subst-ficticio', papel:'operacao', ativo:true}]};
}
const entrada = regs => ({config:{modo:'efetivo', inicioEfetivo:'2026-11-01', decisaoGestao:'Autorização fictícia para teste', criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r => [r.osId || r.id, {...doc, decisao:'sem_falha', tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:r.membros[0].chave, partes:r.membros.map(m => ({pessoaId:m.chave, cota:Math.round(m.percentual * 100)})), justificativa:'Equipe fictícia'}], interna:{...doc, situacao:'nao_aplicavel'}}]))});
// Novembro fechado e a prévia pronta para aprovar.
async function comPrevia() {
  const e = await edge('pcp-sync', banco());
  relogio(e, '2026-12-02T12:00:00Z');
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, TITULAR);
  const f = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:'fechar-aprovador-nov', motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true}, TITULAR);
  assert.equal(f.status, 200, JSON.stringify(f));
  const p = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.fechamento.id, anterior:'', entrada:entrada(f.fechamento.registros), motivo:'Prévia fictícia', requestId:'previa-aprovador-nov'}, TITULAR);
  assert.equal(p.ok, true, JSON.stringify(p));
  return {e, previa:p.revisao};
}
let n = 0;
const aprovar = (x, quem) => x.e.call({action:'performanceComissaoAprovar', ...NOV, anterior:x.previa.id, hash:x.previa.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:'aprovar-ficticio-' + (++n)}, quem);
const gravar = (e, corpo, quem = ADMIN) => e.call({action:'comissaoAprovadorGravar', motivo:'Motivo fictício com mais de quinze letras', requestId:'aprovador-ficticio-' + (++n), ...corpo}, quem);

test('sem configuração (D-013): o pcp aprova, como antes', async () => {
  const x = await comPrevia();
  const r = await aprovar(x, OUTRO_PCP);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.revisao.autor.como, 'pcp');
});

test('só o admin designa; o pcp lê; motivo, ID e pessoa são conferidos (400), e cada mudança fica no diário', async () => {
  const {e} = await comPrevia();
  assert.equal((await gravar(e, {operacao:'titular', titularId:'700001'}, TITULAR)).status, 403, 'o pcp não designa');
  assert.equal((await gravar(e, {operacao:'titular', titularId:'700001'}, MONTAGEM)).status, 403);
  assert.equal((await e.call({action:'comissaoAprovadorLer'}, MONTAGEM)).status, 403);
  assert.equal((await gravar(e, {operacao:'substituto', substitutoId:'700002'})).status, 400, 'substituto antes do titular');
  assert.equal((await gravar(e, {operacao:'titular', titularId:'700001', motivo:'curto'})).status, 400);
  assert.equal((await gravar(e, {operacao:'titular', titularId:'799999'})).status, 400, 'ID fora do RH');
  assert.equal((await gravar(e, {operacao:'titular', titularId:'700005'})).status, 400, 'quem saiu');
  const t = await gravar(e, {operacao:'titular', titularId:'700001'});
  assert.equal(t.status, 200, JSON.stringify(t));
  assert.equal(t.vigente.modo, 'titular'); assert.equal(t.vigente.id, '700001'); assert.equal(t.vigente.nome, 'Titular Fictício');
  assert.equal((await gravar(e, {operacao:'substituto', substitutoId:'700001'})).status, 400, 'o substituto não é o titular');
  assert.equal((await gravar(e, {operacao:'substituto', substitutoId:'700002', de:'2026-12-05', ate:'2026-12-04'})).status, 400, 'fim antes do início');
  const s = await gravar(e, {operacao:'substituto', substitutoId:'700003', de:'2026-12-02'});
  assert.equal(s.status, 200);
  assert.match(s.avisos.join(' '), /Outro Gestor Fictício não consegue aprovar pela tela: precisa de acesso pcp com senha ligado à ficha/, 'quem não tem conta ligada à ficha é avisado (texto da revisão da onda pessoas, P2)');
  const l = await e.call({action:'comissaoAprovadorLer'}, TITULAR);
  assert.equal(l.status, 200);
  assert.equal(l.vigente.modo, 'substituto'); assert.equal(l.config.substituto.id, '700003');
  assert.deepEqual(l.diario.map(d => d.operacao), ['substituto', 'titular']);
  assert.equal(l.diario[1].por, 'Admin Fictício'); assert.match(l.diario[0].motivo, /quinze letras/);
  // Encerrar: o evento novo, nada se apaga.
  const enc = await gravar(e, {operacao:'encerrar'});
  assert.equal(enc.vigente.modo, 'titular'); assert.equal(enc.diario.length, 3);
  assert.equal(e.db.pcp_registros.filter(r => r.colecao === 'comissao_aprovador').length, 3);
});

test('com titular designado: outro pcp é recusado; o titular aprova e o demonstrativo diz "titular"', async () => {
  const x = await comPrevia();
  await gravar(x.e, {operacao:'titular', titularId:'700001'});
  const nao = await aprovar(x, OUTRO_PCP);
  assert.equal(nao.status, 403); assert.match(nao.error, /titular designado/);
  const lista = await x.e.call({action:'performanceComissaoListar', ...NOV}, OUTRO_PCP);
  assert.equal(lista.aprovador.podeAprovar, false); assert.equal(lista.aprovador.nome, 'Titular Fictício');
  const ok = await aprovar(x, TITULAR);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.revisao.autor.como, 'titular'); assert.equal(ok.revisao.autor.porId, '700001');
});

test('substituto vigente: o titular é recusado; o substituto (papel operação) lê e aprova; a montagem não', async () => {
  const x = await comPrevia();
  await gravar(x.e, {operacao:'titular', titularId:'700001'});
  await gravar(x.e, {operacao:'substituto', substitutoId:'700002', de:'2026-12-01', ate:'2026-12-10'});
  const t = await aprovar(x, TITULAR);
  assert.equal(t.status, 403); assert.match(t.error, /quem aprova a comissão é ele, não o titular/);
  assert.equal((await aprovar(x, MONTAGEM)).status, 403);
  assert.equal((await x.e.call({action:'performanceComissaoListar', ...NOV}, MONTAGEM)).status, 403);
  assert.equal((await x.e.call({action:'performanceComissaoNova', ...NOV, compensarId:'x', anterior:x.previa.id, motivo:'Fictício', requestId:'nova-subst-0001'}, SUBST)).status, 403, 'o substituto só lê e aprova');
  const lista = await x.e.call({action:'performanceComissaoListar', ...NOV}, SUBST);
  assert.equal(lista.status, 200); assert.equal(lista.aprovador.podeAprovar, true); assert.equal(lista.aprovador.como, 'substituto');
  const ok = await aprovar(x, SUBST);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.revisao.autor.como, 'substituto'); assert.equal(ok.revisao.autor.porId, '700002'); assert.equal(ok.revisao.autor.titularId, '700001');
});

test('substituto sem a vez: antes do início ele é recusado e o titular aprova; o fim do prazo devolve ao titular; o admin aprova sempre', async () => {
  const antes = await comPrevia();
  await gravar(antes.e, {operacao:'titular', titularId:'700001'});
  await gravar(antes.e, {operacao:'substituto', substitutoId:'700002', de:'2026-12-20', ate:'2026-12-30'});
  const cedo = await aprovar(antes, SUBST);
  assert.equal(cedo.status, 403, 'antes do início, o substituto não aprova');
  assert.equal((await aprovar(antes, TITULAR)).ok, true, 'antes do início, o titular aprova');
  const depois = await comPrevia();
  await gravar(depois.e, {operacao:'titular', titularId:'700001'});
  await gravar(depois.e, {operacao:'substituto', substitutoId:'700002', de:'2026-12-02', ate:'2026-12-03'});
  relogio(depois.e, '2026-12-04T15:00:00Z');
  assert.equal((await aprovar(depois, SUBST)).status, 403, 'depois do fim, o substituto não aprova');
  const volta = await aprovar(depois, TITULAR);
  assert.equal(volta.ok, true, JSON.stringify(volta)); assert.equal(volta.revisao.autor.como, 'titular');
  const adm = await comPrevia();
  await gravar(adm.e, {operacao:'titular', titularId:'700001'});
  await gravar(adm.e, {operacao:'substituto', substitutoId:'700002', de:'2026-12-01'});
  const a = await aprovar(adm, ADMIN);
  assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.revisao.autor.como, 'admin');
});

/* ------------------------------------------------------------ a tela */
test('tela: a seção de Configurações diz quem aprova hoje; só o admin tem os formulários; o diálogo da comissão diz e trava o Aprovar', () => {
  const src = ler('comissao-ui.js');
  const ctx = {STATE:{user:{papel:'pcp'}}, esc:s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c])),
    pessoasRH:() => [{id:'700001', nome:'Titular Fictício'}, {id:'700002', nome:'Substituta Fictícia'}], STORE:{api:async () => ({})}, toast() {}};
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const dados = {hoje:'2026-12-05', avisos:[], config:{titularId:'700001', titularNome:'Titular Fictício', substituto:{id:'700002', nome:'Substituta Fictícia', de:'2026-12-01', ate:'2026-12-10', motivo:'Férias fictícias do titular', vigente:true}},
    vigente:{modo:'substituto', id:'700002', nome:'Substituta Fictícia', titularId:'700001', ate:'2026-12-10'}, diario:[{em:'2026-12-01T10:00:00Z', operacao:'substituto', motivo:'Férias fictícias do titular', por:'Admin Fictício', substitutoId:'700002', substitutoNome:'Substituta Fictícia', de:'2026-12-01', ate:'2026-12-10'}]};
  ctx.__d = dados; vm.runInContext('comissaoAprovadorDados={carregando:false,dados:__d,erro:""}', ctx);
  const pcp = ctx.comissaoAprovadorSecaoHTML();
  assert.match(pcp, /Quem aprova hoje: Substituta Fictícia \(cadastro 700002\), substituto de Titular Fictício \(cadastro 700001\), até 10\/12\/2026\. O admin também aprova\./);
  assert.doesNotMatch(pcp, /data-aprov-op/, 'o pcp não designa');
  ctx.STATE.user.papel = 'admin';
  const adm = ctx.comissaoAprovadorSecaoHTML();
  for (const op of ['titular', 'substituto', 'encerrar']) assert.match(adm, new RegExp(`data-aprov-op="${op}"`));
  ctx.STATE.user.papel = 'operacao';
  assert.equal(ctx.comissaoAprovadorSecaoHTML(), '');
  // O diálogo da comissão.
  assert.match(ctx.comissaoAprovadorLinhaHTML({modo:'titular', id:'700001', nome:'Titular Fictício', podeAprovar:false, motivo:'Quem aprova a comissão é o titular designado pela gestão (ou o admin).'}),
    /Quem aprova: Titular Fictício \(cadastro 700001\), titular\. O admin também aprova\. <strong>Quem aprova a comissão é o titular/);
  assert.match(src, /if\(resposta\.aprovador&&resposta\.aprovador\.podeAprovar===false\)\{erro\.textContent=/);
  assert.equal(vm.runInContext(`comissaoComoTxt({tipo:'aprovacao', autor:{como:'substituto', titularId:'700001'}})`, ctx), ', substituto do titular (cadastro 700001)');
  assert.equal(vm.runInContext(`comissaoComoTxt({tipo:'aprovacao', autor:{}})`, ctx), '', 'a aprovação antiga não tem a marca');
  // A seção está em Configurações (admin e pcp).
  assert.match(ler('app.js'), /<summary>✅ Aprovação da comissão<\/summary>\$\{comissaoAprovadorSecaoHTML\(\)\}/);
});
