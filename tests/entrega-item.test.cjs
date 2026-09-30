/* MOTOR DA ENTREGA POR ITEM (E2). Cada item da O.S. tem uma lista só de
   acréscimo de marcas (entregue, retirado, problema, cancelado, desfeito); a
   situação do item, o resumo da O.S. e o R$ de cada entrega saem daqui, na
   leitura, e nunca são gravados. Regras do plano (29/09/2026): o valor do item
   é o LÍQUIDO da O.S. repartido pelo subtotal com maior resto, cancelado entra
   no rateio para o valor dos outros não subir, a parte leva a fração da
   quantidade e a última parte leva o resto em centavos, O.S. antiga sem marca
   vale inteira no dia da finalização, e a baixa do ERP só leva o SALDO.
   Os testes partem dos casos ruins: quantidade que não é número, parte maior
   que o saldo, centavo que some, desconto que infla, cancelado que sobe o
   valor dos outros, fuso que muda o dia. Dados fictícios: o repositório é
   público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../entrega-item.js');

const HOJE = '2026-09-29';
// A gestão marcando numa O.S. aberta: o validador fecha por omissão sem papel e sem O.S.
const ctx = (extra = {}) => ({hoje:HOJE, papel:'admin', os:{}, ...extra});
const item = (extra = {}) => ({item:'1', descricao:'Placa ACM', medidas:'', qtde:'10', valorUnit:'100', subtotal:'1000.00', pronto:false, ...extra});
let seq = 0;
const ev = (tipo, extra = {}) => ({id:'ev-' + (++seq), tipo, dia:HOJE, via:'gestao', ...extra});
// Aplica pela validação, como a porta vai fazer: evento recusado nunca entra.
function marcar(it, evento, c = ctx()) {
  const r = E.validarEvento(evento, it, c);
  assert.ok(r.ok, `recusou ${evento.tipo}: ${r.erro}`);
  it.entregas = [...(it.entregas || []), r.evento];
  return r.evento;
}
const soma = xs => xs.reduce((s, x) => s + x, 0);

/* ── quantidade ─────────────────────────────────────────────────────────── */

test('qtdeNum: só inteiro contável maior que 1 aceita parte; o resto vale 1 lote', () => {
  assert.equal(E.qtdeNum(item({qtde:'10'})), 10);
  assert.equal(E.qtdeNum(item({qtde:'10,5'})), 1, 'quebrada: só o todo');
  assert.equal(E.qtdeNum(item({qtde:'1 un'})), 1);
  assert.equal(E.qtdeNum(item({qtde:''})), 1, 'vazia: só o todo');
  assert.equal(E.qtdeNum(item({qtde:'2,5 m²'})), 1, 'metro quadrado: só o todo');
  assert.equal(E.qtdeNum(item({qtde:'10 m²'})), 1, 'm² inteiro também é área, não peça');
  assert.equal(E.qtdeNum(item({qtde:'12 m'})), 1, 'metro linear: só o todo');
  assert.equal(E.qtdeNum(item({qtde:'6 un'})), 6);
  assert.equal(E.qtdeNum(item({qtde:'4 peças'})), 4);
  assert.equal(E.qtdeNum(item({qtde:'10.00'})), 10, 'a API manda com ponto decimal');
  assert.equal(E.qtdeNum(item({qtde:'10,00'})), 10);
  assert.equal(E.qtdeNum(item({qtde:'0'})), 1);
  assert.equal(E.qtdeNum(item({qtde:'-3'})), 1);
  assert.equal(E.qtdeNum(item({qtde:'abc'})), 1);
  assert.equal(E.qtdeNum(item({qtde:undefined, qtd:3})), 3, 'item antigo com qtd');
  assert.equal(E.qtdeNum(item({qtde:7})), 7);
  assert.equal(E.qtdeNum(item({qtde:7.5})), 1);
  assert.equal(E.qtdeNum(null), 1);
  assert.equal(E.aceitaParte(item({qtde:'10'})), true);
  assert.equal(E.aceitaParte(item({qtde:'1'})), false);
  assert.equal(E.aceitaParte(item({qtde:'2,5 m²'})), false);
  assert.equal(E.aceitaParte(item({qtde:'10', descricao:'Servicos'})), false, 'serviço não recebe marca');
});

test('ehServico: serviço e instalação não são coisa a entregar; produto parecido é', () => {
  for (const d of ['Servicos', 'Serviços', 'SERVIÇO DE PINTURA', 'Instalação', 'Instalações fora do horário comercial', 'Instalação de placas de terceiros', '  instalacao  '])
    assert.equal(E.ehServico({descricao:d}), true, d);
  for (const d of ['Placa ACM', 'Item', '', 'Letra caixa instalada', 'Instalador de adesivo', 'Kit instalação?'])
    assert.equal(E.ehServico({descricao:d}), false, d);
  assert.equal(E.ehServico(null), false);
});

/* ── validação do evento ────────────────────────────────────────────────── */

test('validarEvento recusa parte maior que o saldo, quantidade quebrada e o que vier depois do todo', () => {
  const it = item();
  let r = E.validarEvento(ev('entregue', {qtde:11}), it, ctx());
  assert.equal(r.ok, false); assert.match(r.erro, /saldo/);
  r = E.validarEvento(ev('entregue', {qtde:2.5}), it, ctx());
  assert.equal(r.ok, false); assert.match(r.erro, /inteiro/);
  r = E.validarEvento(ev('entregue', {qtde:0}), it, ctx());
  assert.equal(r.ok, false);
  r = E.validarEvento(ev('entregue', {qtde:'6,0'}), it, ctx());
  assert.equal(r.ok, false, 'texto que não é inteiro não vira número por acaso');
  marcar(it, ev('entregue', {qtde:'6'}));
  assert.equal(it.entregas[0].qtde, 6, 'texto de dígitos vira inteiro');
  r = E.validarEvento(ev('entregue', {qtde:5}), it, ctx());
  assert.equal(r.ok, false); assert.match(r.erro, /faltam 4 de 10/);
  marcar(it, ev('entregue'));
  assert.equal(it.entregas[1].qtde, 4, 'sem quantidade = o saldo todo');
  r = E.validarEvento(ev('entregue'), it, ctx());
  assert.equal(r.ok, false); assert.match(r.erro, /todo entregue/);
  // Lote (m²): só o todo, que é 1.
  const m2 = item({qtde:'2,5 m²'});
  assert.equal(E.validarEvento(ev('entregue', {qtde:2}), m2, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {qtde:1}), m2, ctx()).ok, true);
});

test('validarEvento: dia no futuro, dia torto, id repetido, tipo e origem desconhecidos, teto de 20', () => {
  const it = item();
  assert.match(E.validarEvento(ev('entregue', {dia:'2026-09-30'}), it, ctx()).erro, /depois de hoje/);
  assert.equal(E.validarEvento(ev('entregue', {dia:'2026-02-30'}), it, ctx()).ok, false, 'dia que não existe');
  assert.equal(E.validarEvento(ev('entregue', {dia:'29/09/2026'}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {dia:'2019-12-31'}), it, ctx()).ok, false, 'antigo demais');
  assert.equal(E.validarEvento(ev('entregue', {dia:''}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregou'), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {via:'whatsapp'}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {id:''}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {id:'a b'}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(null, it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue'), null, ctx()).ok, false);
  const e = marcar(it, ev('entregue', {qtde:1}));
  // Fila offline mandando de novo: repetido, não erro de verdade.
  const rep = E.validarEvento({...e}, it, ctx());
  assert.equal(rep.ok, false); assert.equal(rep.repetido, true);
  // Teto: 20 marcas VALENDO por item.
  const cheio = item({qtde:'100'});
  for (let i = 0; i < 20; i++) marcar(cheio, ev('entregue', {qtde:1}));
  const r = E.validarEvento(ev('entregue', {qtde:1}), cheio, ctx());
  assert.equal(r.ok, false); assert.match(r.erro, /20 marcas valendo/);
  assert.match(r.erro, /Desfaça/, 'para a gestão a frase diz o que fazer, não "fale com o PCP"');
  assert.match(E.validarEvento(ev('entregue', {qtde:1}), cheio, ctx({papel:'operacao'})).erro, /Fale com o PCP/);
  // No teto, desfazer ainda passa: senão a marca errada ficava sem conserto.
  const d = E.validarEvento(ev('desfeito', {alvo:cheio.entregas[19].id, motivo:'marca errada'}), cheio, ctx());
  assert.equal(d.ok, true, d.erro);
  // A lista inteira (desfeitos e anulados incluídos) tem teto de 40.
  const muitos = item({entregas:Array.from({length:40}, (_, i) => ({id:'p' + i, tipo:'problema', dia:HOJE, motivo:'x'}))});
  assert.match(E.validarEvento(ev('desfeito', {alvo:'p39', motivo:'x'}), muitos, ctx()).erro, /40 marcas gravadas/, 'e a folga também tem fim');
});

test('validarEvento: motivo obrigatório onde o plano pede, cortado em 200, e campos estranhos saem', () => {
  const it = item();
  for (const tipo of ['problema', 'cancelado']) {
    assert.match(E.validarEvento(ev(tipo), it, ctx()).erro, /motivo/i, tipo);
    assert.match(E.validarEvento(ev(tipo, {motivo:'   '}), it, ctx()).erro, /motivo/i, tipo + ' em branco');
  }
  const r = E.validarEvento(ev('problema', {motivo:'x'.repeat(250), valor:999, pessoaId:'123456', qtde:3, fotoId:'foto-1'}), it, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.evento.motivo.length, 200);
  assert.equal('valor' in r.evento, false);
  assert.equal('pessoaId' in r.evento, false);
  assert.equal('qtde' in r.evento, false, 'problema não tem quantidade');
  assert.equal(r.evento.fotoId, 'foto-1');
  const s = E.validarEvento(ev('entregue', {qtde:2, motivo:'sobrou texto'}), it, ctx());
  assert.equal('motivo' in s.evento, false);
  const t = E.validarEvento(ev('retirado', {qtde:1, retirou:'Cliente da loja'}), it, ctx());
  assert.equal(t.evento.retirou, 'Cliente da loja');
  const u = E.validarEvento(ev('entregue', {qtde:1, retirou:'não é retirada'}), it, ctx());
  assert.equal('retirou' in u.evento, false);
  // via vazia vira a do papel: gestão para admin e pcp.
  assert.equal(E.validarEvento(ev('entregue', {via:undefined, qtde:1}), it, ctx()).evento.via, 'gestao');
});

test('validarEvento: item de serviço não recebe marca; item cancelado só aceita desfazer', () => {
  assert.match(E.validarEvento(ev('entregue'), item({descricao:'Servicos'}), ctx()).erro, /serviço/);
  const it = item();
  const c = marcar(it, ev('cancelado', {motivo:'cliente desistiu'}));
  assert.match(E.validarEvento(ev('entregue'), it, ctx()).erro, /cancelado/);
  assert.match(E.validarEvento(ev('cancelado', {motivo:'de novo'}), it, ctx()).erro, /cancelado/);
  assert.equal(E.validarEvento(ev('desfeito', {alvo:c.id, motivo:'engano'}), it, ctx()).ok, true);
  // Item todo entregue não tem saldo para cancelar.
  const todo = item();
  marcar(todo, ev('entregue'));
  assert.match(E.validarEvento(ev('cancelado', {motivo:'x'}), todo, ctx()).erro, /saldo/);
});

test('validarEvento: desfazer só marca que existe e está valendo; desfeito não se desfaz', () => {
  const it = item();
  const a = marcar(it, ev('entregue', {qtde:6}));
  assert.match(E.validarEvento(ev('desfeito', {alvo:'nao-existe', motivo:'x'}), it, ctx()).erro, /não existe/);
  assert.match(E.validarEvento(ev('desfeito', {alvo:a.id}), it, ctx()).erro, /motivo/i);
  const d = marcar(it, ev('desfeito', {alvo:a.id, motivo:'marquei a O.S. errada'}));
  assert.equal(E.validarEvento(ev('desfeito', {alvo:a.id, motivo:'de novo'}), it, ctx()).ok, false, 'já desfeita');
  assert.equal(E.validarEvento(ev('desfeito', {alvo:d.id, motivo:'desfazer o desfazer'}), it, ctx()).ok, false);
});

test('podeMarcar: admin e pcp tudo; operação entrega, retira e aponta problema; o celular (toque e montagem) só entrega e retira; máquina nada', () => {
  for (const t of E.TIPOS) { assert.equal(E.podeMarcar('admin', t), true); assert.equal(E.podeMarcar('pcp', t), true); }
  assert.deepEqual(E.TIPOS.filter(t => E.podeMarcar('operacao', t)), ['entregue', 'retirado', 'problema']);
  assert.deepEqual(E.TIPOS.filter(t => E.podeMarcar('toque', t)), ['entregue', 'retirado'], 'E5: o crachá sem senha declara a entrega, nunca desfaz nem cancela');
  assert.deepEqual(E.TIPOS.filter(t => E.podeMarcar('maquina', t)), []);
  assert.deepEqual(E.TIPOS.filter(t => E.podeMarcar('montagem', t)), ['entregue', 'retirado'], 'E5: a montagem com senha também declara');
  assert.equal(E.podeMarcar('constructor', 'entregue'), false, 'nome de propriedade do objeto não vira papel');
  assert.equal(E.podeMarcar(undefined, 'entregue'), false);
  const r = E.validarEvento(ev('cancelado', {motivo:'x'}), item(), ctx({papel:'operacao'}));
  assert.equal(r.ok, false); assert.match(r.erro, /não pode/);
  assert.equal(E.validarEvento(ev('entregue'), item(), ctx({papel:'operacao'})).ok, true);
});

/* ── situação do item e da O.S. ─────────────────────────────────────────── */

test('situacaoItem: a entregar, parcial "6 de 10", entregue, e desfeito devolve o saldo', () => {
  const it = item();
  let s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'a entregar'); assert.equal(s.saldo, 10); assert.equal(s.parte, true);
  const a = marcar(it, ev('entregue', {qtde:6, dia:'2026-09-20'}));
  s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'parcial'); assert.equal(s.rotulo, 'parcial 6 de 10'); assert.equal(s.saldo, 4); assert.equal(s.entregue, 6);
  assert.equal(s.ultimaMarca, a.id, 'o Desfazer mira a última marca valendo');
  marcar(it, ev('entregue', {qtde:4, dia:'2026-09-25'}));
  s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'entregue'); assert.equal(s.saldo, 0); assert.equal(s.dia, '2026-09-25');
  marcar(it, ev('desfeito', {alvo:a.id, motivo:'contei errado'}));
  s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'parcial'); assert.equal(s.entregue, 4); assert.equal(s.saldo, 6);
  // Agora dá para entregar os 6 de novo, e não 7.
  assert.equal(E.validarEvento(ev('entregue', {qtde:7}), it, ctx()).ok, false);
  assert.equal(E.validarEvento(ev('entregue', {qtde:6}), it, ctx()).ok, true);
});

test('situacaoItem: problema segura o item, e a entrega depois do problema volta a contar', () => {
  const it = item();
  marcar(it, ev('entregue', {qtde:6}));
  const p = marcar(it, ev('problema', {motivo:'2 placas riscadas'}));
  let s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'problema'); assert.equal(s.rotulo, 'com problema'); assert.equal(s.saldo, 4);
  assert.equal(s.problema.motivo, '2 placas riscadas');
  marcar(it, ev('entregue', {qtde:4}));
  s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'entregue'); assert.equal(s.problema, null);
  // Problema desfeito também solta.
  const b = item();
  marcar(b, ev('entregue', {qtde:6}));
  const q = marcar(b, ev('problema', {motivo:'reclamação'}));
  assert.equal(E.situacaoItem(b, {}).situacao, 'problema');
  marcar(b, ev('desfeito', {alvo:q.id, motivo:'resolvido no local'}));
  assert.equal(E.situacaoItem(b, {}).situacao, 'parcial');
  assert.ok(p.id);
});

test('situacaoItem: retirado quando tudo veio por retirada; mistura vira entregue', () => {
  const it = item({qtde:'3'});
  marcar(it, ev('retirado', {qtde:1})); marcar(it, ev('retirado', {qtde:2}));
  assert.equal(E.situacaoItem(it, {}).situacao, 'retirado');
  const m = item({qtde:'3'});
  marcar(m, ev('retirado', {qtde:1})); marcar(m, ev('entregue', {qtde:2}));
  assert.equal(E.situacaoItem(m, {}).situacao, 'entregue');
});

test('situacaoItem: cancelado vence tudo, mas o que já foi entregue continua entregue', () => {
  const it = item();
  marcar(it, ev('entregue', {qtde:6}));
  marcar(it, ev('cancelado', {motivo:'cliente não quis o resto'}));
  const s = E.situacaoItem(it, {});
  assert.equal(s.situacao, 'cancelado'); assert.equal(s.entregue, 6); assert.equal(s.saldo, 0);
});

test('situacaoItem lê com tolerância o que já está gravado: lixo, id repetido e soma acima da quantidade', () => {
  const it = item({qtde:'10', entregas:[
    null, 'x', {id:'a', tipo:'entregue', qtde:6, dia:'2026-09-01'},
    {id:'a', tipo:'entregue', qtde:6, dia:'2026-09-01'}, // id repetido: vale a primeira
    {id:'b', tipo:'entregou', qtde:1, dia:'2026-09-01'},
    {id:'c', tipo:'entregue', qtde:-2, dia:'2026-09-01'},
    {id:'d', tipo:'entregue', qtde:3, dia:'dia torto'},
    // A quantidade do item caiu depois (ERP): o excedente não conta.
    {id:'e', tipo:'entregue', qtde:9, dia:'2026-09-02'},
  ]});
  const s = E.situacaoItem(it, {});
  assert.equal(s.entregue, 10); assert.equal(s.situacao, 'entregue');
  assert.deepEqual(E.eventosAtivos(it).map(e => e.id), ['a', 'e']);
  assert.equal(E.situacaoItem({qtde:'5', entregas:'nada'}, null).situacao, 'a entregar');
});

test('entregaImplicita: O.S. antiga sem marca vale no dia da finalização, no fuso de São Paulo', () => {
  // 02h30 em UTC do dia 30 ainda é 29/09 em São Paulo.
  assert.deepEqual(E.entregaImplicita({finalizadaEm:'2026-09-30T02:30:00.000Z', finalizadoPor:'Ana'}),
    {dia:'2026-09-29', fonte:'finalizada', marca:'implicito'});
  assert.equal(E.entregaImplicita({finalizadaEm:'2026-09-29T23:30:00'}).dia, '2026-09-29', 'sem fuso: já é o relógio da fábrica');
  assert.equal(E.entregaImplicita({finalizadaEm:'2026-09-29T23:30:00-03:00'}).dia, '2026-09-29');
  assert.equal(E.entregaImplicita({}), null, 'aberta: nada implícito');
  assert.equal(E.entregaImplicita(null), null);
  assert.equal(E.entregaImplicita({finalizadaEm:'lixo'}), null);
  // Lançada à mão: vale a data do lançamento.
  assert.deepEqual(E.entregaImplicita({finalizadaEm:'2026-09-20T12:00:00Z', entregaLancada:{em:'x', por:'Ana', data:'2026-09-18'}}),
    {dia:'2026-09-18', fonte:'lancada', marca:'implicito'});
  assert.equal(E.entregaImplicita({finalizadaEm:'2026-09-20T12:00:00Z', entregaLancada:'2026-09-17'}).dia, '2026-09-17');
});

test('entregaImplicita: baixa do ERP vale na data do ERP, sem prova; cancelada no ERP não entrega nada', () => {
  const em = '2026-09-22T14:00:00.000Z';
  const baixada = {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}};
  assert.deepEqual(E.entregaImplicita(baixada, {dataEntregueERP:'2026-09-19'}), {dia:'2026-09-19', fonte:'erp', marca:'sem prova'});
  assert.deepEqual(E.entregaImplicita(baixada), {dia:'2026-09-22', fonte:'erp', marca:'sem prova'}, 'sem a data do ERP: o dia da baixa');
  assert.equal(E.entregaImplicita(baixada, {dataEntregueERP:'19/09/2026'}).dia, '2026-09-22', 'data torta do ERP não vale');
  const cancelada = {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em, status:'CANCELADO'}};
  assert.equal(E.entregaImplicita(cancelada, {dataEntregueERP:'2026-09-19'}), null);
  assert.equal(E.canceladaNoERP(cancelada), true);
  // Baixa antiga e finalização humana depois (reaberta): a marca do ERP é história.
  const humana = {finalizadaEm:'2026-09-25T12:00:00Z', finalizadoPor:'Ana', baixaAutoERP:{em, status:'CANCELADO'}};
  assert.equal(E.canceladaNoERP(humana), false);
  assert.equal(E.entregaImplicita(humana).fonte, 'finalizada');
});

test('situacaoItem com a O.S.: finalizada leva o saldo implícito; problema aberto não; interna vira retirado', () => {
  const os = {finalizadaEm:'2026-09-26T15:00:00Z', itens:[]};
  const it = item();
  marcar(it, ev('entregue', {qtde:6, dia:'2026-09-20'}));
  let s = E.situacaoItem(it, os);
  assert.equal(s.situacao, 'entregue'); assert.equal(s.entregue, 6); assert.equal(s.implicito, 4); assert.equal(s.saldo, 0);
  assert.equal(s.marca, 'implicito'); assert.equal(s.dia, '2026-09-26');
  const p = item();
  marcar(p, ev('problema', {motivo:'faltou peça'}));
  s = E.situacaoItem(p, os);
  assert.equal(s.situacao, 'problema'); assert.equal(s.implicito, 0);
  const interna = {...os, tipo:'interno'};
  assert.equal(E.situacaoItem(item(), interna).situacao, 'retirado');
  const cancelada = {finalizadaEm:'2026-09-26T15:00:00Z', baixaAutoERP:{em:'2026-09-26T15:00:00Z', status:'CANCELADO'}};
  const c = item(); marcar(c, ev('entregue', {qtde:2}));
  s = E.situacaoItem(c, cancelada);
  assert.equal(s.situacao, 'cancelado'); assert.equal(s.entregue, 2, 'o entregue fica'); assert.equal(s.saldo, 0);
});

test('resumoOS: sem marca, parcial e completa; serviço fica de fora da conta de itens', () => {
  const os = {itens:[item({item:'1'}), item({item:'2', qtde:'1'}), item({item:'3', descricao:'Servicos', qtde:'1'})]};
  let r = E.resumoOS(os);
  assert.equal(r.situacao, 'sem marca'); assert.equal(r.itensTotal, 2); assert.equal(r.servicos, 1);
  assert.equal(r.aEntregar, 2); assert.equal(r.saldoItens, 11);
  marcar(os.itens[0], ev('entregue', {qtde:6}));
  r = E.resumoOS(os);
  assert.equal(r.situacao, 'parcial'); assert.equal(r.parciais, 1); assert.equal(r.aEntregar, 1); assert.equal(r.saldoItens, 5);
  marcar(os.itens[1], ev('cancelado', {motivo:'fora do pedido'}));
  marcar(os.itens[0], ev('entregue'));
  r = E.resumoOS(os);
  assert.equal(r.situacao, 'completa'); assert.equal(r.entregues, 1); assert.equal(r.cancelados, 1); assert.equal(r.saldoItens, 0);
  assert.equal(E.resumoOS(null).situacao, 'sem marca');
  // Tudo desfeito: volta a não ter marca.
  const b = {itens:[item()]};
  const e1 = marcar(b.itens[0], ev('entregue', {qtde:2}));
  marcar(b.itens[0], ev('desfeito', {alvo:e1.id, motivo:'engano'}));
  assert.equal(E.resumoOS(b).situacao, 'sem marca');
});

/* ── valor ──────────────────────────────────────────────────────────────── */

test('valorItemRateado: desconto repartido pelo subtotal, soma igual ao líquido no centavo', () => {
  // Bruto 1.000 + 500 + 300 = 1.800; líquido 1.620 (10% de desconto).
  const os = {valorTotal:'1620', itens:[item({subtotal:'1000'}), item({subtotal:'500.00'}), item({subtotal:'300,00'})]};
  const r = E.valorItemRateado(os);
  assert.deepEqual(r.itens, [90000, 45000, 27000]);
  assert.equal(r.total, 162000); assert.equal(r.fonte, 'valorTotal');
  // O líquido informado (painel_ordens) vence o valorTotal.
  assert.equal(E.valorItemRateado(os, {liquido:1500}).total, 150000);
  assert.equal(E.valorItemRateado(os, {liquido:1500}).fonte, 'informado');
  // Sem líquido nenhum: a soma dos subtotais.
  const s = E.valorItemRateado({itens:os.itens});
  assert.equal(s.total, 180000); assert.equal(s.fonte, 'itens');
});

test('valorItemRateado: maior resto, sobra no item de maior subtotal, e nada some', () => {
  // R$ 100,00 em 3 itens iguais: 33,34 + 33,33 + 33,33, e a sobra vai no primeiro em empate.
  const tres = {valorTotal:'100', itens:[item({subtotal:'10'}), item({subtotal:'10'}), item({subtotal:'10'})]};
  assert.deepEqual(E.valorItemRateado(tres).itens, [3334, 3333, 3333]);
  // Empate de resto (0,5 e 0,5 centavo): vai para o de maior subtotal, não para o primeiro da lista.
  const pesos = {valorTotal:'0.02', itens:[item({subtotal:'1'}), item({subtotal:'3'})]};
  const r = E.valorItemRateado(pesos);
  assert.deepEqual(r.itens, [0, 2]);
  // Resto maior vence subtotal maior.
  assert.deepEqual(E.valorItemRateado({valorTotal:'0.01', itens:[item({subtotal:'3'}), item({subtotal:'1'})]}).itens, [1, 0]);
  // Subtotal zero em todos: divide igual.
  const zeros = {valorTotal:'10', itens:[item({subtotal:'0'}), item({subtotal:''}), item({subtotal:'abc'})]};
  assert.deepEqual(E.valorItemRateado(zeros).itens, [334, 333, 333]);
  // Subtotal negativo não tira valor dos outros.
  const neg = {valorTotal:'100', itens:[item({subtotal:'-50'}), item({subtotal:'100'})]};
  assert.deepEqual(E.valorItemRateado(neg).itens, [0, 10000]);
  // Número grande não perde centavo no ponto flutuante.
  const grande = {valorTotal:'98765432.10', itens:[item({subtotal:'33333333.33'}), item({subtotal:'77777777.77'}), item({subtotal:'1.01'})]};
  assert.equal(soma(E.valorItemRateado(grande).itens), 9876543210);
  // Sem itens e sem valor.
  assert.deepEqual(E.valorItemRateado({valorTotal:'50', itens:[]}).itens, []);
  assert.equal(E.valorItemRateado({}).total, 0);
});

test('valorDoEvento: 6 e depois 4 de 10 fecha no centavo; a última parte leva o resto', () => {
  const it = item({qtde:'3'});
  const a = marcar(it, ev('entregue', {qtde:1}));
  const b = marcar(it, ev('entregue', {qtde:1}));
  const c = marcar(it, ev('entregue', {qtde:1}));
  const V = 10000; // R$ 100,00 em 3 partes
  const partes = [a, b, c].map(e => E.valorDoEvento(it, e, V));
  assert.deepEqual(partes, [3333, 3333, 3334]);
  const dez = item();
  const x = marcar(dez, ev('entregue', {qtde:6}));
  const y = marcar(dez, ev('entregue', {qtde:4}));
  assert.equal(E.valorDoEvento(dez, x, 99999) + E.valorDoEvento(dez, y, 99999), 99999);
  // Evento desfeito, problema e evento de outro item valem zero.
  const d = marcar(dez, ev('desfeito', {alvo:x.id, motivo:'engano'}));
  assert.equal(E.valorDoEvento(dez, x, 99999), 0);
  assert.equal(E.valorDoEvento(dez, d, 99999), 0);
  assert.equal(E.valorDoEvento(dez, {id:'outro'}, 99999), 0);
  assert.equal(E.valorDoEvento(dez, y, 99999), 39999, 'sozinha, a parte de 4 vale 4/10 arredondado para baixo');
});

test('lancamentosDaOS: cancelado vale zero e não sobe o valor dos outros', () => {
  const os = {valorTotal:'300', finalizadaEm:'2026-09-26T15:00:00Z', itens:[item({qtde:'1', subtotal:'100'}), item({qtde:'1', subtotal:'100'}), item({qtde:'1', subtotal:'100'})]};
  marcar(os.itens[1], ev('cancelado', {motivo:'não produzido'}));
  const r = E.lancamentosDaOS(os);
  assert.deepEqual(r.itens.map(i => i.valor), [10000, 10000, 10000]);
  assert.equal(r.entregue, 20000); assert.equal(r.cancelado, 10000); assert.equal(r.saldo, 0);
  assert.equal(r.entregue + r.saldo + r.cancelado + r.retido + r.semItem, r.total);
});

test('lancamentosDaOS: O.S. antiga sem evento, finalizada, entra toda implícita no dia da finalização e fecha com o líquido', () => {
  const os = {valorTotal:'1620', finalizadaEm:'2026-09-30T01:00:00Z', itens:[item({subtotal:'1000'}), item({subtotal:'500'}), item({subtotal:'300', descricao:'Instalação'})]};
  const r = E.lancamentosDaOS(os);
  assert.equal(r.entregue, 162000, 'entregue inteira fecha no centavo com o número de hoje');
  assert.ok(r.lancamentos.every(l => l.dia === '2026-09-29'), 'fuso de São Paulo');
  assert.deepEqual(r.lancamentos.map(l => l.tipo), ['implicito', 'implicito', 'servico']);
  assert.ok(r.lancamentos.filter(l => l.tipo === 'implicito').every(l => l.marca === 'implicito'));
});

test('lancamentosDaOS: parcial em agosto e baixa do ERP em setembro: só o saldo conta na data do ERP', () => {
  const em = '2026-09-22T14:00:00.000Z';
  const os = {valorTotal:'1000', itens:[item({qtde:'10', subtotal:'1000'})]};
  marcar(os.itens[0], ev('entregue', {qtde:6, dia:'2026-08-28'}));
  const aberta = E.lancamentosDaOS(os);
  assert.deepEqual(aberta.lancamentos.map(l => [l.dia, l.valor]), [['2026-08-28', 60000]]);
  assert.equal(aberta.saldo, 40000);
  Object.assign(os, {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}});
  const r = E.lancamentosDaOS(os, {dataEntregueERP:'2026-09-21'});
  assert.deepEqual(r.lancamentos.map(l => [l.dia, l.valor, l.marca]), [['2026-08-28', 60000, 'marcado'], ['2026-09-21', 40000, 'sem prova']]);
  assert.equal(r.entregue, 100000);
  const porMes = {};
  for (const l of r.lancamentos) porMes[l.dia.slice(0, 7)] = (porMes[l.dia.slice(0, 7)] || 0) + l.valor;
  assert.deepEqual(porMes, {'2026-08':60000, '2026-09':40000}, 'agosto não volta em setembro');
  // Cancelada no ERP: o entregue fica, o saldo vira cancelado.
  const c = {...os, finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em, status:'CANCELADO'}};
  const rc = E.lancamentosDaOS(c, {dataEntregueERP:'2026-09-21'});
  assert.equal(rc.entregue, 60000); assert.equal(rc.cancelado, 40000);
});

test('lancamentosDaOS: problema aberto segura o SALDO até a entrega depois dele; o que já foi fica no seu dia', () => {
  const os = {valorTotal:'1000', finalizadaEm:'2026-09-26T15:00:00Z', itens:[item({qtde:'10', subtotal:'1000'})]};
  marcar(os.itens[0], ev('entregue', {qtde:6, dia:'2026-09-10'}));
  marcar(os.itens[0], ev('problema', {motivo:'placa quebrou'}));
  let r = E.lancamentosDaOS(os);
  assert.deepEqual(r.lancamentos.map(l => [l.dia, l.valor]), [['2026-09-10', 60000]], 'as 6 de 10/09 não saem do dia delas');
  assert.equal(r.retido, 40000, 'a finalização não leva o saldo com problema aberto');
  assert.equal(r.entregue + r.retido, 100000);
  marcar(os.itens[0], ev('entregue', {qtde:4, dia:'2026-09-28'}));
  r = E.lancamentosDaOS(os);
  assert.equal(r.entregue, 100000); assert.equal(r.retido, 0);
  assert.deepEqual(r.lancamentos.map(l => l.dia), ['2026-09-10', '2026-09-28']);
});

test('lancamentosDaOS: serviço acompanha a última entrega física, e só quando não resta saldo', () => {
  const os = {valorTotal:'1200', itens:[item({qtde:'2', subtotal:'1000'}), item({descricao:'Instalações fora do horário comercial', qtde:'1', subtotal:'200'})]};
  marcar(os.itens[0], ev('entregue', {qtde:1, dia:'2026-09-10'}));
  let r = E.lancamentosDaOS(os);
  assert.equal(r.lancamentos.some(l => l.tipo === 'servico'), false, 'com saldo, o serviço espera');
  assert.equal(E.situacaoItem(os.itens[1], os).situacao, 'a entregar');
  marcar(os.itens[0], ev('entregue', {qtde:1, dia:'2026-09-15'}));
  r = E.lancamentosDaOS(os);
  const s = r.lancamentos.find(l => l.tipo === 'servico');
  assert.equal(s.dia, '2026-09-15'); assert.equal(s.valor, 20000);
  assert.equal(E.situacaoItem(os.itens[1], os).situacao, 'entregue');
  assert.equal(r.entregue, 120000);
  // Finalizada depois: o serviço continua no dia da última entrega física, não na finalização.
  os.finalizadaEm = '2026-09-20T15:00:00Z';
  assert.equal(E.lancamentosDaOS(os).lancamentos.find(l => l.tipo === 'servico').dia, '2026-09-15');
  // Só serviço na O.S.: acompanha a finalização.
  const so = {valorTotal:'50', finalizadaEm:'2026-09-20T15:00:00Z', itens:[item({descricao:'Servicos', subtotal:'50'})]};
  assert.deepEqual(E.lancamentosDaOS(so).lancamentos.map(l => [l.tipo, l.dia, l.valor]), [['servico', '2026-09-20', 5000]]);
  // Cancelada no ERP: serviço cancelado junto.
  const em = '2026-09-20T15:00:00Z';
  const canc = {...so, finalizadaEm:em, baixaAutoERP:{em, status:'CANCELADO'}};
  const rc = E.lancamentosDaOS(canc);
  assert.equal(rc.entregue, 0); assert.equal(rc.cancelado, 5000);
});

test('lancamentosDaOS: toda conta fecha (entregue + saldo + cancelado + retido = líquido) e sem itens o valor fica à parte', () => {
  const r = E.lancamentosDaOS({valorTotal:'50', finalizadaEm:'2026-09-20T15:00:00Z', itens:[]});
  assert.equal(r.semItem, 5000); assert.equal(r.entregue, 0); assert.equal(r.total, 5000);
  assert.equal(E.lancamentosDaOS(null).total, 0);
});

test('diaSP: o dia sai no fuso de São Paulo em qualquer aparelho', () => {
  assert.equal(E.diaSP('2026-09-30T02:59:59Z'), '2026-09-29');
  assert.equal(E.diaSP('2026-09-30T03:00:00Z'), '2026-09-30');
  assert.equal(E.diaSP('2026-09-29'), '2026-09-29');
  assert.equal(E.diaSP('2026-02-30'), '');
  assert.equal(E.diaSP(''), '');
  assert.equal(E.diaSP(null), '');
  assert.equal(E.diaSP(Date.UTC(2026, 8, 30, 2, 0)), '2026-09-29');
});

test('entrega-item.js entra no index.html, no equipe.html (E5) e no SHELL do sw.js', () => {
  const fs = require('node:fs'), path = require('node:path');
  const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const index = ler('index.html');
  assert.match(index, /<script src="entrega-item\.js\?v=v\d+"><\/script>/);
  assert.ok(index.indexOf('entrega-item.js?v=') < index.indexOf('app.js?v='), 'carrega antes da tela que vai usar');
  assert.match(/const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1], /'entrega-item\.js\?v=v\d+'/);
  /* O celular carrega o motor desde a E5 (o Instalado declara a entrega),
     antes do equipe.js. O equipe.js só o usa atrás de temMotorEntrega (cache
     misto: sem o arquivo novo, o Instalado funciona como antes). O resto do
     que o celular roda não chama o motor. */
  const equipe = ler('equipe.html');
  assert.match(equipe, /<script src="entrega-item\.js\?v=v\d+"><\/script>/);
  assert.ok(equipe.indexOf('entrega-item.js?v=') < equipe.indexOf('equipe.js?v='), 'carrega antes do equipe.js');
  assert.match(ler('equipe.js'), /const temMotorEntrega = \(\) => typeof ENTREGA_ITEM !== 'undefined'/);
  for (const f of ['operacao.js', 'store.js', 'auth.js']) assert.doesNotMatch(ler(f), /ENTREGA_ITEM/, f);
});
