/* PARIDADE DO MOTOR DA ENTREGA POR ITEM. O aparelho (entrega-item.js) valida a
   marca e mostra a situação; o servidor (_shared/pcp-entrega-item.mjs) confere
   a mesma marca na porta e soma o R$ entregue por item. Se as duas cópias
   divergirem, a tela aceita uma parte que o servidor recusa, ou mostra um
   valor e o banco soma outro, sem erro nenhum. Duas travas: o texto do motor
   é o mesmo byte a byte, e 500 O.S. geradas (sempre as mesmas, gerador com
   semente fixa) dão o mesmo resultado nas duas, com a conta de cada O.S.
   fechando no centavo. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../entrega-item.js');

const RAIZ = path.join(__dirname, '..');
const motor = arquivo => {
  const s = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const ini = s.indexOf('/* ==== MOTOR DA ENTREGA POR ITEM'), fim = s.indexOf('/* ==== FIM DO MOTOR ==== */');
  assert.ok(ini >= 0 && fim > ini, `${arquivo}: marcas do motor não encontradas`);
  return s.slice(ini, fim);
};

test('o texto do motor é o mesmo nas duas cópias', () => {
  assert.equal(motor('supabase/functions/_shared/pcp-entrega-item.mjs'), motor('entrega-item.js'), 'mudou uma cópia e não a outra');
});

test('as duas cópias exportam as mesmas funções', async () => {
  const M = await import('../supabase/functions/_shared/pcp-entrega-item.mjs');
  assert.deepEqual(Object.keys(M.ENTREGA_ITEM).sort(), Object.keys(D).sort());
});

// Gerador determinístico (mulberry32): a mesma semente dá sempre os mesmos casos.
function gerador(semente) {
  let a = semente >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min, max) => min + Math.floor(r() * (max - min + 1));
  return {r, int, um: xs => xs[int(0, xs.length - 1)]};
}

const HOJE = '2026-09-29';
const QTDES = ['1', '2', '3', '10', '10,5', '1 un', '', '2,5 m²', '10 m²', '6 un', '4 peças', '10.00', '0', 'abc', 7, 12, 100];
const DESCRICOES = ['Placa ACM', 'Adesivo vinil', 'Item', 'Letra caixa', 'Servicos', 'Instalação', 'Instalações fora do horário comercial', 'Totem'];
const SUBTOTAIS = ['1000.00', '500', '300,00', '1.234,56', '0', '', 'abc', '-50', '0.01', '99999.99', 17, 3333.33];
const DIAS = ['2026-08-28', '2026-09-01', '2026-09-15', '2026-09-29', '2026-09-30', '2026-02-30', '2019-12-31', '29/09/2026', ''];
const PAPEIS = [undefined, 'admin', 'pcp', 'operacao', 'toque', 'montagem', 'maquina', 'constructor'];
const FIM = ['finalizadaEm', 'finalizadoPor', 'baixaAutoERP', 'entregaLancada'];
const VIAS = [undefined, 'gestao', 'balcao', 'toque', 'lote', 'whatsapp'];

function osGerada(g, i) {
  const itens = Array.from({length:g.int(0, 6)}, (_, k) => ({item:String(k + 1), descricao:g.um(DESCRICOES), qtde:g.um(QTDES), subtotal:g.um(SUBTOTAIS), pronto:false}));
  const os = {id:'teste-' + i, numero:String(90000 + i), tipo:g.r() < 0.2 ? 'interno' : 'externo', itens};
  const v = g.r();
  if (v < 0.6) os.valorTotal = g.um(['1620', '0', '1500.50', '98765.43', '0.03', 'abc', '']);
  const fim = g.r();
  const em = g.um(['2026-09-22T14:00:00.000Z', '2026-09-30T02:30:00.000Z', '2026-09-29T23:30:00', '2026-09-20T12:00:00-03:00']);
  if (fim < 0.25) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Ana'});
  else if (fim < 0.4) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}});
  else if (fim < 0.5) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em, status:'CANCELADO'}});
  else if (fim < 0.55) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Ana', baixaAutoERP:{em:'2026-09-01T10:00:00.000Z', status:'CANCELADO'}});
  // Conciliação da carteira e baixa por CONCLUIDO: o ERP não disse ENTREGUE.
  else if (fim < 0.6) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Mubisys · saiu da carteira aberta', baixaAutoERP:{em, status:'FORA DA CARTEIRA ABERTA', carteira:true}});
  else if (fim < 0.65) Object.assign(os, {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · CONCLUIDO)', baixaAutoERP:{em, status:'CONCLUIDO'}});
  if (os.finalizadaEm && g.r() < 0.2) os.entregaLancada = g.r() < 0.5 ? {em, por:'Ana', data:g.um(DIAS)} : g.um(DIAS);
  return os;
}

function evento(g, M, it, n) {
  const tipo = g.r() < 0.05 ? 'entregou' : g.um(['entregue', 'entregue', 'entregue', 'retirado', 'problema', 'cancelado', 'desfeito']);
  const ativos = M.eventosAtivos(it);
  const e = {id:g.r() < 0.05 && ativos.length ? ativos[0].id : 'ev-' + n, tipo, dia:g.r() < 0.8 ? g.um(DIAS.slice(0, 4)) : g.um(DIAS), via:g.um(VIAS)};
  if (tipo === 'entregue' || tipo === 'retirado') {
    const q = g.r();
    if (q < 0.3) e.qtde = undefined;
    else if (q < 0.9) e.qtde = g.int(1, 6);
    else e.qtde = g.um([0, -1, 2.5, '3', '6,0', 1000]);
  }
  if (tipo === 'desfeito') e.alvo = ativos.length && g.r() < 0.85 ? g.um(ativos).id : 'nao-existe';
  if (g.r() < 0.8) e.motivo = g.um(['cliente pediu', 'x'.repeat(230), '  ', 'placa riscada']);
  if (g.r() < 0.1) e.retirou = 'Cliente da loja';
  if (g.r() < 0.1) e.fotoId = g.um(['foto-1', 'foto com espaço']);
  return e;
}

function rodar(M, g, i) {
  const os = osGerada(g, i);
  const saida = {validacoes:[]};
  /* Quase sempre marca com a O.S. aberta e finaliza depois (o caminho de
     verdade); às vezes tenta marcar já finalizada, e tem de ser recusado. */
  const guardado = {}, depois = g.r() < 0.8;
  if (depois) for (const k of FIM) if (k in os) { guardado[k] = os[k]; delete os[k]; }
  let n = 0;
  for (const it of os.itens) {
    // Às vezes o banco já traz lixo gravado: a leitura tem de tolerar igual nas duas.
    if (g.r() < 0.1) it.entregas = g.um([[null, {id:'lixo', tipo:'entregue', qtde:'3', dia:'2026-09-01'}], 'nada', [{id:'z', tipo:'entregue', qtde:99, dia:'2026-09-02'}]]);
    for (let k = 0, marcas = g.int(0, 7); k < marcas; k++) {
      const r = M.validarEvento(evento(g, M, it, ++n), it, {hoje:HOJE, papel:g.r() < 0.7 ? 'admin' : g.um(PAPEIS), os:g.r() < 0.97 ? os : undefined});
      saida.validacoes.push(r);
      if (r.ok) it.entregas = [...(Array.isArray(it.entregas) ? it.entregas : []), r.evento];
    }
  }
  Object.assign(os, guardado);
  const ctx = {liquido:g.r() < 0.4 ? g.um([1500, '1.620,00', 0, 'abc', null, 0.07]) : undefined, dataEntregueERP:g.r() < 0.5 ? g.um(DIAS) : undefined};
  saida.qtdes = os.itens.map(it => [M.qtdeNum(it), M.aceitaParte(it), M.ehServico(it)]);
  saida.situacoes = os.itens.map(it => M.situacaoItem(it, os, ctx));
  saida.resumo = M.resumoOS(os, ctx);
  saida.implicita = M.entregaImplicita(os, ctx);
  saida.rateio = M.valorItemRateado(os, ctx);
  saida.eventos = os.itens.map((it, k) => M.eventosAtivos(it).map(e => M.valorDoEvento(it, e, saida.rateio.itens[k])));
  saida.lancamentos = M.lancamentosDaOS(os, ctx);
  return saida;
}

test('500 O.S. geradas dão o mesmo resultado no aparelho e no servidor, e cada conta fecha no centavo', async () => {
  const M = await import('../supabase/functions/_shared/pcp-entrega-item.mjs');
  let aceitas = 0, recusadas = 0, parciais = 0, implicitas = 0, retidas = 0, canceladas = 0, declaradas = 0;
  for (let i = 0; i < 500; i++) {
    const aparelho = rodar(D, gerador(2000 + i), i);
    const servidor = rodar(M, gerador(2000 + i), i);
    assert.deepEqual(servidor, aparelho, `caso ${i} (semente ${2000 + i})`);
    const L = aparelho.lancamentos;
    assert.equal(L.entregue + L.declarado + L.saldo + L.cancelado + L.retido + L.semItem, L.total, `caso ${i}: a conta fecha`);
    assert.equal(L.lancamentos.reduce((s, l) => s + l.valor, 0), L.entregue, `caso ${i}: as linhas somam o entregue`);
    // E5: a declaração do celular fica à parte, nunca no entregue conferido.
    assert.equal(L.declaracoes.reduce((s, l) => s + l.valor, 0), L.declarado, `caso ${i}: as declarações somam o declarado`);
    assert.ok(L.lancamentos.every(l => !l.declarado && l.via !== 'toque'), `caso ${i}: declaração no entregue conferido`);
    assert.ok(L.declaracoes.every(l => l.declarado), `caso ${i}`);
    if (L.declaracoes.some(l => l.tipo !== 'servico')) declaradas++;
    assert.ok(L.lancamentos.every(l => Number.isInteger(l.valor) && l.valor >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.dia)), `caso ${i}: linha em centavos e com dia`);
    assert.equal(aparelho.rateio.itens.reduce((s, v) => s + v, 0), aparelho.rateio.itens.length ? aparelho.rateio.total : 0, `caso ${i}: o rateio fecha no líquido`);
    // Nenhum item entrega mais do que tem.
    for (const s of aparelho.situacoes) assert.ok(s.entregue + s.implicito + s.saldo <= s.qtde, `caso ${i}: unidade contada duas vezes`);
    aceitas += aparelho.validacoes.filter(v => v.ok).length;
    recusadas += aparelho.validacoes.filter(v => !v.ok).length;
    if (aparelho.resumo.situacao === 'parcial') parciais++;
    if (L.lancamentos.some(l => l.tipo === 'implicito')) implicitas++;
    if (L.retido) retidas++;
    if (L.cancelado) canceladas++;
  }
  // Os casos exercitam todos os caminhos: marca aceita e recusada, parcial, implícita, problema e cancelamento.
  assert.ok(aceitas > 500, `marcas aceitas: ${aceitas}`);
  assert.ok(recusadas > 300, `marcas recusadas: ${recusadas}`);
  assert.ok(parciais > 30, `O.S. parciais: ${parciais}`);
  assert.ok(implicitas > 50, `O.S. com entrega implícita: ${implicitas}`);
  assert.ok(retidas > 20, `O.S. com item retido: ${retidas}`);
  assert.ok(canceladas > 20, `O.S. com cancelado: ${canceladas}`);
  assert.ok(declaradas > 20, `O.S. com entrega declarada pelo celular: ${declaradas}`);
});
