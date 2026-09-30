/* PARIDADE DO STATUS DA ENTREGA (F16). O aparelho mostra o selo com
   OPERACAO.statusEntrega (operacao.js); o servidor tira a O.S. cancelada da
   apuração com _shared/pcp-status.mjs. Se as duas cópias divergirem, a tela
   diz "Cancelado" e a apuração conta a O.S., ou o contrário, sem erro nenhum.
   Três travas: o texto do bloco é o mesmo byte a byte; 600 O.S. geradas
   (sempre as mesmas, semente fixa) dão o mesmo status nas duas; e a leitura
   do cancelamento é a mesma do motor da entrega por item (as duas cópias).
   Mais: o operacao.js sem o motor (o celular do instalador) lê o cancelamento
   igual e marca `semMotor` quando há marca por item. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const O = require('../operacao.js');
const E = require('../entrega-item.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const bloco = arquivo => {
  const s = ler(arquivo);
  const ini = s.indexOf('/* ==== STATUS DA ENTREGA'), fim = s.indexOf('/* ==== FIM DO STATUS ==== */');
  assert.ok(ini >= 0 && fim > ini, `${arquivo}: marcas do status não encontradas`);
  return s.slice(ini, fim);
};
const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const motorServidor = () => import('../supabase/functions/_shared/pcp-entrega-item.mjs');

test('o texto do status é o mesmo nas duas cópias', () => {
  assert.equal(bloco('supabase/functions/_shared/pcp-status.mjs'), bloco('operacao.js'), 'mudou uma cópia e não a outra');
});

test('as duas cópias exportam o mesmo status, e o operacao.js não chama o motor pelo nome', async () => {
  const S = await servidor();
  const nomes = Object.keys(S.STATUS_ENTREGA).sort();
  assert.deepEqual(nomes, ['ESTADOS_ENTREGA', 'MOTIVO_CANCELAMENTO_MAX', 'MOTIVO_CANCELAMENTO_MIN', 'ROTULOS_ENTREGA', 'cancelada', 'cancelamentoDe', 'motivoCancelamentoInvalido', 'prazoDaEntrega', 'statusEntrega']);
  for (const k of nomes) assert.equal(typeof O[k], typeof S.STATUS_ENTREGA[k], k);
  assert.deepEqual(O.ESTADOS_ENTREGA, S.ESTADOS_ENTREGA);assert.deepEqual(O.ROTULOS_ENTREGA, S.ROTULOS_ENTREGA);
  assert.equal(O.MOTIVO_CANCELAMENTO_MIN, 15);assert.equal(S.MOTIVO_CANCELAMENTO_MIN, 15);
  // O celular carrega o operacao.js sem o motor: nada ali pode depender dele pelo nome.
  assert.doesNotMatch(ler('operacao.js'), /ENTREGA_ITEM/);
});

// Gerador determinístico (mulberry32): a mesma semente dá sempre os mesmos casos.
function gerador(semente) {
  let a = semente >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min, max) => min + Math.floor(r() * (max - min + 1));
  return {r, int, um: xs => xs[int(0, xs.length - 1)]};
}
const DIAS = ['2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-20', '2026-09-29', '2026-09-30', '2026-02-30', '', 'lixo'];
const HORAS = ['2026-09-10T15:00:00.000Z', '2026-09-30T02:30:00.000Z', '2026-09-12T23:59:00', '2026-09-15T12:00:00-03:00', '2026-09-20T10:00:00.000Z'];
const CANCELAMENTOS = [undefined, undefined, undefined, null, '', 'cancelada',
  {ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', em:'2026-09-15T13:00:00.000Z'},
  {cancelar:true, motivo:'Cliente desistiu do serviço'},
  {ativo:false, motivo:'Cliente desistiu do serviço', desfeitoEm:'2026-09-16T10:00:00.000Z', desfeitoPor:'Admin Teste'},
  {desfazer:true}, {ativo:true, motivo:'   '}, {ativo:'sim', motivo:'x'}, [{ativo:true, motivo:'lista'}], {motivo:'só motivo'}];
const FINAIS = [
  () => ({}),
  g => ({finalizadaEm:g.um(HORAS), finalizadoPor:'Ana'}),
  g => { const em = g.um(HORAS); return {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em, status:'ENTREGUE'}}; },
  g => { const em = g.um(HORAS); return {finalizadaEm:em, finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em, status:'CANCELADO'}}; },
  g => { const em = g.um(HORAS); return {finalizadaEm:em, finalizadoPor:'Mubisys · saiu da carteira aberta', baixaAutoERP:{em, status:'FORA DA CARTEIRA ABERTA', carteira:true}}; },
  g => ({finalizadaEm:g.um(HORAS), finalizadoPor:'Ana', baixaAutoERP:{em:'2026-09-01T10:00:00.000Z', status:'CANCELADO'}}),
];
const TIPOS_MARCA = ['entregue', 'entregue', 'entregue', 'retirado', 'problema', 'cancelado', 'desfeito', 'entregou'];
function osGerada(g, i) {
  const o = {id:'p' + i, numero:String(80000 + i), tipo:g.r() < 0.15 ? 'interno' : 'externo', cliente:'Cliente Fictício'};
  if (g.r() < 0.7) o.equipe = g.r() < 0.8 ? ['Ana'] : [];
  if (g.r() < 0.85) o.instalacao = {data:g.um(DIAS), periodo:'Manhã', duracaoDias:g.um([1, 1, 2, 3, '4', 0, 'x'])};
  const pc = g.r();
  if (pc < 0.4) o.prazoCombinado = {data:g.um(DIAS), fonte:'agenda'};
  else if (pc < 0.5) o.prazoCombinado = {data:'', fonte:'semAgenda'};
  else if (pc < 0.6) { o.origemMubisys = true; o.previsaoEntrega = g.um(DIAS); }
  if (g.r() < 0.2) o.agendaLog = [{de:g.um(DIAS), data:g.um(DIAS)}];
  Object.assign(o, g.um(FINAIS)(g));
  if (o.finalizadaEm && g.r() < 0.25) o.entregaLancada = g.r() < 0.8 ? {data:g.um(DIAS), por:'Gestor Teste'} : g.um(DIAS);
  const c = g.um(CANCELAMENTOS); if (c !== undefined) o.cancelamento = c;
  if (g.r() < 0.2) { o.retrabalho = true; o.problema = g.um(['Adesivo descolou', '', 'x'.repeat(150)]); if (g.r() < 0.5) o.dataResolvido = g.um(DIAS); }
  const ex = g.r();
  if (ex < 0.15) { o.horaSaida = '08:00'; o.saidaEm = g.um(HORAS); }
  else if (ex < 0.25) { o.horaSaida = '08:00'; o.horaRetorno = '12:00'; o.retornoEm = g.um(HORAS); }
  if (g.r() < 0.55) {
    let n = 0;
    o.itens = Array.from({length:g.int(0, 4)}, (_, k) => {
      const it = {uid:`${o.numero}:${k + 1}:1`, item:String(k + 1), descricao:g.um(['Placa ACM', 'Totem', 'Adesivo', 'Servicos de instalação']), qtde:g.um(['1', '2', '10', '2,5 m²', 6]), subtotal:g.um(['100', '250.50', '', '0'])};
      if (g.r() < 0.6) it.entregas = Array.from({length:g.int(0, 4)}, () => {
        const tipo = g.um(TIPOS_MARCA), e = {id:'m' + (++n), tipo, dia:g.um(DIAS.slice(0, 7)), via:'gestao'};
        if (tipo === 'entregue' || tipo === 'retirado') e.qtde = g.um([1, 1, 2, 5, 0, '3']);
        if (tipo === 'problema' || tipo === 'cancelado' || tipo === 'desfeito') e.motivo = 'motivo';
        if (tipo === 'desfeito') e.alvo = 'm' + g.int(1, Math.max(1, n - 1));
        return e;
      });
      return it;
    });
  }
  return o;
}
const HOJES = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-20', '2026-09-30', undefined];

test('600 O.S. geradas dão o mesmo status no aparelho e no servidor; o cancelamento é o mesmo do motor', async () => {
  const S = await servidor(), MS = await motorServidor();
  const vistos = new Set();
  let canceladas = 0, comItens = 0;
  for (let i = 0; i < 600; i++) {
    const g = gerador(7000 + i);
    const o = osGerada(g, i), hoje = g.um(HOJES);
    // `hoje` ausente: o dia de hoje em São Paulo, igual nas duas (a mesma chamada, no mesmo segundo).
    const a = O.statusEntrega(o, hoje), s = S.statusEntrega(o, hoje);
    assert.deepEqual(s, a, `caso ${i} (semente ${7000 + i})`);
    assert.deepEqual(S.cancelamentoDe(o), O.cancelamentoDe(o), `caso ${i}: cancelamento`);
    assert.deepEqual(S.prazoDaEntrega(o), O.prazoDaEntrega(o), `caso ${i}: prazo`);
    // A leitura do cancelamento é a do motor da entrega por item (aparelho e servidor).
    assert.equal(O.cancelada(o), E.canceladaOS(o), `caso ${i}: motor do aparelho`);
    assert.equal(S.cancelada(o), MS.canceladaOS(o), `caso ${i}: motor do servidor`);
    assert.equal(!!(O.cancelamentoDe(o) && O.cancelamentoDe(o).origem === 'erp'), E.canceladaNoERP(o), `caso ${i}: cancelada no ERP`);
    assert.ok(a.motivo && a.aplicaveis.every(x => x.motivo), `caso ${i}: sempre com o motivo`);
    assert.equal(a.semMotor, false);
    vistos.add(a.estado);
    if (a.estado === 'cancelado') canceladas++;
    if (a.fonteEntrega === 'itens') comItens++;
  }
  // Os casos exercitam todos os estados (menos o retorno antecipado, que é "sem dado" até a F17).
  assert.deepEqual([...vistos].sort(), ['agendado', 'atraso', 'cancelado', 'execucao', 'no_prazo', 'retrabalho']);
  assert.ok(canceladas > 60, `canceladas: ${canceladas}`);
  assert.ok(comItens > 20, `entregas julgadas pelos itens: ${comItens}`);
});

test('sem o motor (o celular): o cancelamento é lido igual; com marca por item, o status avisa `semMotor`', async () => {
  const S = await servidor();
  // Caso ruim: o operacao.js no equipe.html, que não carrega o entrega-item.js.
  const ctx = vm.createContext({console});
  vm.runInContext(ler('operacao.js'), ctx);
  const C = vm.runInContext('OPERACAO', ctx);
  let comMarca = 0;
  for (let i = 0; i < 300; i++) {
    const o = osGerada(gerador(9000 + i), i);
    const temMarca = (o.itens || []).some(it => Array.isArray(it.entregas) && it.entregas.length);
    const a = C.statusEntrega(o, '2026-09-20');
    assert.equal(C.cancelada(o), S.cancelada(o), `caso ${i}`);
    assert.equal(a.semMotor, temMarca, `caso ${i}`);
    if (temMarca) comMarca++;
    else assert.deepEqual(JSON.parse(JSON.stringify(a)), S.statusEntrega(o, '2026-09-20'), `caso ${i}: sem marca, o mesmo status`);
  }
  assert.ok(comMarca > 20);
  // O motor se apresenta ao carregar depois (a ordem do index.html): o status passa a ler os itens.
  vm.runInContext(ler('entrega-item.js'), ctx);
  const um = {id:'m1', tipo:'externo', prazoCombinado:{data:'2026-09-10', fonte:'agenda'}, instalacao:{data:'2026-09-10'},
    itens:[{uid:'u1', item:'1', descricao:'Placa', qtde:'10', entregas:[{id:'e1', tipo:'entregue', qtde:6, dia:'2026-09-10', via:'gestao'}]}]};
  const depois = C.statusEntrega(um, '2026-09-10');
  assert.equal(depois.semMotor, false);assert.match(depois.motivo, /^entrega parcial 6 de 10/);
  assert.deepEqual(JSON.parse(JSON.stringify(depois)), S.statusEntrega(um, '2026-09-10'));
});
