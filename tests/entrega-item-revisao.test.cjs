/* REVISÃO DA E2 (29/09/2026): os 10 defeitos que a revisão achou no motor da
   entrega por item, cada um pelo caso ruim que o provou. Cada teste roda nas
   DUAS cópias (aparelho e servidor), porque o conserto tem de valer nas duas.
     1  O.S. finalizada (no PCP ou pelo ERP) aceitava marca e tirava o valor
        do mês da entrega implícita
     2  problema em item todo entregue ficava preso e zerava o mês que passou
     3  entrega atrasada (tablet offline) fechava problema de dia posterior
     4  resumo 'parcial' sem nada entregue
     5  teto contava os desfeitos: a marca certa não entrava depois do desfazer
     6  saída da carteira contava como entregue 'sem prova'
     7  o via vinha do aparelho e decidia se a entrega era declarada
     8  sem papel, a trava ficava aberta; 'toque' marcava antes da E5 (na E5
        o celular declara entrega e retirada, e só isso)
     9  (o mesmo do 2, pelo lado da reentrega)
     10 20 problemas e 20 desfeitos travavam o item
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../entrega-item.js');

const HOJE = '2026-09-29';
const copias = async () => [['aparelho', D], ['servidor', (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM]];
const item = (extra = {}) => ({item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000', ...extra});
let seq = 0;
const ev = (tipo, extra = {}) => ({id:'rv-' + (++seq), tipo, dia:HOJE, ...extra});
function marcar(E, it, evento, ctx) {
  const r = E.validarEvento(evento, it, ctx);
  assert.ok(r.ok, `recusou ${evento.tipo}: ${r.erro}`);
  it.entregas = [...(it.entregas || []), r.evento];
  return r.evento;
}
const porDia = r => r.lancamentos.map(l => [l.dia, l.valor]);

test('1: O.S. finalizada no PCP ou baixada pelo ERP não aceita marca nenhuma, e julho fica em julho', async () => {
  for (const [nome, E] of await copias()) {
    const finalizada = {numero:'1', valorTotal:'1000', finalizadaEm:'2026-07-10T15:00:00Z', finalizadoPor:'Ana', itens:[item()]};
    const em = '2026-07-10T15:00:00.000Z';
    const baixada = {numero:'2', valorTotal:'1000', finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}, itens:[item()]};
    for (const os of [finalizada, baixada]) {
      const it = os.itens[0];
      assert.deepEqual(porDia(E.lancamentosDaOS(os)), [['2026-07-10', 100000]], nome);
      for (const e of [ev('entregue', {qtde:10}), ev('cancelado', {motivo:'x'}), ev('problema', {motivo:'x'}), ev('retirado', {qtde:1})]) {
        const r = E.validarEvento(e, it, {hoje:HOJE, papel:'admin', os});
        assert.equal(r.ok, false, `${nome}: ${e.tipo} passou em O.S. ${os.numero}`);
        assert.match(r.erro, /O\.S\. finalizada: reabra para marcar/);
      }
      assert.equal(E.situacaoItem(it, os).situacao, 'entregue');
    }
    // Sem a O.S. no ctx, o validador não adivinha: recusa.
    assert.match(E.validarEvento(ev('entregue', {qtde:1}), item(), {hoje:HOJE, papel:'admin'}).erro, /O\.S\. não informada/, nome);
    // Reaberta (finalizadaEm vazio), volta a aceitar.
    assert.equal(E.validarEvento(ev('entregue', {qtde:1}), item(), {hoje:HOJE, papel:'admin', os:{finalizadaEm:''}}).ok, true, nome);
  }
});

test('2 e 9: problema em item todo entregue é recusado (é retrabalho); problema no parcial segura só o saldo e agosto fica em agosto', async () => {
  for (const [nome, E] of await copias()) {
    const aberta = {};
    const todo = item();
    marcar(E, todo, ev('entregue', {qtde:10, dia:'2026-08-20'}), {hoje:HOJE, papel:'admin', os:aberta});
    for (const papel of ['admin', 'operacao']) {
      const r = E.validarEvento(ev('problema', {motivo:'placa caiu', dia:'2026-09-10'}), todo, {hoje:HOJE, papel, os:aberta});
      assert.equal(r.ok, false, `${nome} ${papel}`); assert.match(r.erro, /retrabalho/);
    }
    const os = {valorTotal:'1000', itens:[todo], finalizadaEm:'2026-09-15T12:00:00Z', finalizadoPor:'Ana'};
    assert.deepEqual(porDia(E.lancamentosDaOS(os)), [['2026-08-20', 100000]], `${nome}: agosto intacto`);
    // Parcial: 6 em agosto, problema em setembro, reentrega do saldo fecha e soma uma vez só.
    const par = item();
    const osp = {valorTotal:'1000', itens:[par]};
    marcar(E, par, ev('entregue', {qtde:6, dia:'2026-08-20'}), {hoje:HOJE, papel:'admin', os:osp});
    marcar(E, par, ev('problema', {motivo:'4 placas riscadas', dia:'2026-09-05'}), {hoje:HOJE, papel:'operacao', os:osp});
    let r = E.lancamentosDaOS(osp);
    assert.deepEqual(porDia(r), [['2026-08-20', 60000]], `${nome}: o problema não tira agosto`);
    assert.equal(r.retido, 40000); assert.equal(r.saldo, 0);
    marcar(E, par, ev('entregue', {qtde:4, dia:'2026-09-10'}), {hoje:HOJE, papel:'operacao', os:osp});
    r = E.lancamentosDaOS(osp);
    assert.deepEqual(porDia(r), [['2026-08-20', 60000], ['2026-09-10', 40000]], nome);
    assert.equal(r.retido, 0); assert.equal(r.entregue, 100000, 'sem duplicar o valor');
    assert.equal(E.situacaoItem(par, osp).situacao, 'entregue');
  }
});

test('3: entrega de dia ANTERIOR que chega depois (tablet offline) não fecha o problema; a de dia igual ou posterior fecha', async () => {
  for (const [nome, E] of await copias()) {
    const it = item();
    const os = {valorTotal:'1000', itens:[it]};
    marcar(E, it, ev('problema', {dia:'2026-09-12', motivo:'cor errada'}), {hoje:'2026-09-12', papel:'admin', os});
    marcar(E, it, ev('entregue', {qtde:4, dia:'2026-09-10'}), {hoje:'2026-09-13', papel:'admin', os});
    let s = E.situacaoItem(it, os);
    assert.equal(s.situacao, 'problema', `${nome}: a entrega de 10/09 não resolve o problema de 12/09`);
    assert.equal(s.problema.dia, '2026-09-12');
    let r = E.lancamentosDaOS(os);
    assert.deepEqual(porDia(r), [['2026-09-10', 40000]]); assert.equal(r.retido, 60000);
    // A mesma entrega atrasada com a O.S. finalizada depois: o saldo continua retido.
    const fin = {...os, finalizadaEm:'2026-09-20T12:00:00Z', finalizadoPor:'Ana'};
    assert.equal(E.lancamentosDaOS(fin).retido, 60000, nome);
    // Problema que chega depois, com dia anterior a uma entrega já gravada: a entrega fechou.
    const b = item();
    const osb = {itens:[b]};
    marcar(E, b, ev('entregue', {qtde:4, dia:'2026-09-14'}), {hoje:HOJE, papel:'admin', os:osb});
    marcar(E, b, ev('problema', {dia:'2026-09-12', motivo:'faltou peça'}), {hoje:HOJE, papel:'admin', os:osb});
    assert.equal(E.situacaoItem(b, osb).situacao, 'parcial', `${nome}: a entrega de 14/09 veio depois do problema de 12/09`);
    // No mesmo dia, desempata a ordem de chegada.
    const c = item();
    const osc = {itens:[c]};
    marcar(E, c, ev('problema', {motivo:'x'}), {hoje:HOJE, papel:'admin', os:osc});
    marcar(E, c, ev('entregue', {qtde:2}), {hoje:HOJE, papel:'admin', os:osc});
    assert.equal(E.situacaoItem(c, osc).situacao, 'parcial', nome);
  }
});

test('4: resumo "parcial" só quando alguma unidade foi por marca; cancelado ou problema sozinhos dão "com marca"', async () => {
  for (const [nome, E] of await copias()) {
    const os = {itens:[item({item:'1'}), item({item:'2'})]};
    const ctx = {hoje:HOJE, papel:'admin', os};
    marcar(E, os.itens[0], ev('cancelado', {motivo:'cliente desistiu'}), ctx);
    let r = E.resumoOS(os);
    assert.equal(r.situacao, 'com marca', nome); assert.equal(r.unidadesEntregues, 0);
    const p = {itens:[item()]};
    marcar(E, p.itens[0], ev('problema', {motivo:'faltou chapa'}), {hoje:HOJE, papel:'admin', os:p});
    assert.equal(E.resumoOS(p).situacao, 'com marca', nome);
    marcar(E, os.itens[1], ev('entregue', {qtde:3}), ctx);
    r = E.resumoOS(os);
    assert.equal(r.situacao, 'parcial', nome); assert.equal(r.unidadesEntregues, 3);
    marcar(E, os.itens[1], ev('entregue'), ctx);
    assert.equal(E.resumoOS(os).situacao, 'completa', nome);
  }
});

test('5: no teto de 20 marcas valendo, desfazer a errada e marcar a certa passa', async () => {
  for (const [nome, E] of await copias()) {
    const it = item({qtde:'100'});
    const ctx = {hoje:HOJE, papel:'pcp', os:{}};
    for (let i = 0; i < 19; i++) marcar(E, it, ev('entregue', {qtde:5}), ctx);
    const errada = marcar(E, it, ev('entregue', {qtde:5}), ctx);
    marcar(E, it, ev('desfeito', {alvo:errada.id, motivo:'eram 3'}), ctx);
    marcar(E, it, ev('entregue', {qtde:3}), ctx);
    const s = E.situacaoItem(it, {});
    assert.equal(s.entregue, 98, nome); assert.equal(s.rotulo, 'parcial 98 de 100');
  }
});

test('6: O.S. que só saiu da carteira (ou baixou por CONCLUIDO) não conta entregue sem a data do ERP', async () => {
  for (const [nome, E] of await copias()) {
    const em = '2026-09-29T10:00:00.000Z';
    // O objeto exato que a conciliação da carteira grava (pcp-mubisys).
    const carteira = {numero:'3', valorTotal:'5000', finalizadaEm:em, finalizadoPor:'Mubisys · saiu da carteira aberta', finalizadoPorId:'', arquivadaEm:em,
      baixaAutoERP:{em, status:'FORA DA CARTEIRA ABERTA', carteira:true}, erpCarteira:{aberta:false, em}, itens:[item({subtotal:'5000'})]};
    assert.equal(E.entregaImplicita(carteira), null, nome);
    assert.equal(E.canceladaNoERP(carteira), false);
    let r = E.lancamentosDaOS(carteira);
    assert.equal(r.entregue, 0, `${nome}: nada entregue sem o ERP dizer`); assert.equal(r.saldo, 500000);
    assert.equal(r.semConfirmacaoERP, true);
    assert.equal(E.situacaoItem(carteira.itens[0], carteira).situacao, 'a entregar');
    // Veio a data de entrega do ERP: aí conta, sem prova, nesse dia.
    r = E.lancamentosDaOS(carteira, {dataEntregueERP:'2026-09-26'});
    assert.deepEqual(r.lancamentos.map(l => [l.dia, l.valor, l.marca]), [['2026-09-26', 500000, 'sem prova']], nome);
    assert.equal(r.semConfirmacaoERP, false);
    // CONCLUIDO e FINALIZADO também esperam a data; ENTREGUE (novo ou antigo, só no texto) vale no dia da baixa.
    for (const st of ['CONCLUIDO', 'CONCLUÍDO', 'FINALIZADO']) {
      const os = {finalizadaEm:em, finalizadoPor:`Mubisys (baixa automática · ${st})`, baixaAutoERP:{em, status:st}};
      assert.equal(E.entregaImplicita(os), null, `${nome} ${st}`);
    }
    assert.equal(E.entregaImplicita({finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}}).dia, '2026-09-29');
    assert.equal(E.entregaImplicita({finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)'}).dia, '2026-09-29', 'baixa antiga sem baixaAutoERP');
    assert.equal(E.entregaImplicita({finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · CONCLUIDO)'}), null);
    // Finalização humana depois de uma baixa antiga: continua valendo no dia da finalização.
    assert.equal(E.entregaImplicita({finalizadaEm:em, finalizadoPor:'Ana', baixaAutoERP:{em:'2026-09-01T10:00:00Z', status:'FORA DA CARTEIRA ABERTA', carteira:true}}).fonte, 'finalizada');
  }
});

test('7: o via sai do papel, não do aparelho', async () => {
  for (const [nome, E] of await copias()) {
    const via = (papel, v) => E.validarEvento(ev('entregue', {qtde:1, via:v}), item(), {hoje:HOJE, papel, os:{}});
    assert.equal(via('operacao', 'gestao').evento.via, 'balcao', nome);
    assert.equal(via('operacao', 'lote').evento.via, 'balcao', `${nome}: operação não vira lote`);
    assert.equal(via('operacao', 'toque').evento.via, 'balcao');
    assert.equal(via('admin', 'toque').evento.via, 'gestao', `${nome}: admin não vira entrega declarada`);
    assert.equal(via('pcp', 'balcao').evento.via, 'gestao');
    assert.equal(via('pcp', 'lote').evento.via, 'lote', 'a gestão marcando pelo lote');
    assert.equal(via('admin', undefined).evento.via, 'gestao');
    assert.equal(via('admin', 'whatsapp').ok, false, 'origem que não existe continua recusada');
  }
});

test('8: sem papel ou com papel de máquina nada passa; o celular (montagem e toque, E5) só entrega e retira', async () => {
  for (const [nome, E] of await copias()) {
    for (const papel of [undefined, null, '', 'maquina', 'constructor', {}]) {
      for (const tipo of ['entregue', 'retirado', 'problema', 'cancelado']) {
        const r = E.validarEvento(ev(tipo, {qtde:1, motivo:'x'}), item(), {hoje:HOJE, papel, os:{}});
        assert.equal(r.ok, false, `${nome}: papel ${JSON.stringify(papel)} marcou ${tipo}`);
        assert.match(r.erro, /não pode marcar/);
      }
    }
    for (const papel of ['montagem', 'toque']) {
      for (const tipo of ['problema', 'cancelado']) {
        const r = E.validarEvento(ev(tipo, {qtde:1, motivo:'x'}), item(), {hoje:HOJE, papel, os:{}});
        assert.equal(r.ok, false, `${nome}: ${papel} marcou ${tipo}`);
        assert.match(r.erro, /não pode marcar/);
      }
      const r = E.validarEvento(ev('entregue', {qtde:1}), item(), {hoje:HOJE, papel, os:{}});
      assert.equal(r.ok, true, `${nome}: ${papel} declara a entrega`);
      assert.equal(r.evento.via, 'toque');
      assert.equal(r.evento.declarado, true);
    }
    // ctx vazio ou ausente: fecha.
    assert.equal(E.validarEvento(ev('cancelado', {motivo:'x'}), item(), {}).ok, false, nome);
    assert.equal(E.validarEvento(ev('cancelado', {motivo:'x'}), item()).ok, false, nome);
    const it = item();
    const a = marcar(E, it, ev('entregue', {qtde:2}), {hoje:HOJE, papel:'admin', os:{}});
    assert.equal(E.validarEvento(ev('desfeito', {alvo:a.id, motivo:'x'}), it, {hoje:HOJE, os:{}}).ok, false, `${nome}: desfazer sem papel`);
    assert.equal(E.validarEvento(ev('desfeito', {alvo:a.id, motivo:'x'}), it, {hoje:HOJE, papel:'operacao', os:{}}).ok, false, 'operação não desfaz');
    assert.deepEqual([...E.PERMISSOES.toque], ['entregue', 'retirado'], 'E5: o toque só entrega e retira');
  }
});

test('10: um problema aberto por vez; 20 problemas seguidos não travam o item', async () => {
  for (const [nome, E] of await copias()) {
    const it = item({qtde:'100'});
    const os = {};
    marcar(E, it, ev('problema', {motivo:'chuva'}), {hoje:HOJE, papel:'operacao', os});
    const r = E.validarEvento(ev('problema', {motivo:'chuva de novo'}), it, {hoje:HOJE, papel:'operacao', os});
    assert.equal(r.ok, false, nome); assert.match(r.erro, /problema aberto/);
    // A entrega fecha o problema, e a admin entrega normalmente.
    marcar(E, it, ev('entregue', {qtde:1}), {hoje:HOJE, papel:'admin', os});
    // Mesmo o pior caso gravado (20 problemas desfeitos: 40 na lista) deixa a gestão ver o motivo.
    const cheio = item({qtde:'100', entregas:[
      ...Array.from({length:20}, (_, i) => ({id:'p' + i, tipo:'problema', dia:HOJE, motivo:'x'})),
      ...Array.from({length:19}, (_, i) => ({id:'d' + i, tipo:'desfeito', alvo:'p' + i, dia:HOJE, motivo:'x'})),
    ]});
    // 39 gravadas, 1 valendo: ainda cabe a entrega.
    assert.equal(E.validarEvento(ev('entregue', {qtde:1}), cheio, {hoje:HOJE, papel:'admin', os}).ok, true, nome);
  }
});
