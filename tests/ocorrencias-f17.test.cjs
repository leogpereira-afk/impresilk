/* OCORRÊNCIAS E RETORNO ANTECIPADO (F17, 30/09/2026). Toda perda aponta para
   uma ocorrência com id: as derivadas têm o id 'osId:tipo' (atraso,
   retrabalho, retorno_antecipado e as da conferência da volta: carro,
   avaria, equipamentos), o mesmo em toda apuração; as manuais (equipamento
   faltante ou danificado) moram em os.ocorrencias, só de acréscimo, anuladas
   por carimbo, com autor e hora do servidor, só de admin e pcp. O retorno
   antecipado é medido PELA VOLTA (recomendação do plano): a chegada conferida
   pela gestão (hora local, sem fuso) contra o retorno previsto da última O.S.
   da volta, com a tolerância da regra. A hora anotada pela equipe é só
   declaração. O crachá de toque (e a montagem com senha) não desmarca o
   retrabalho gravado; marcar vale na hora. Com o store real e o pcp-sync
   real. Cada teste começa pelo caso ruim. Dados fictícios: o repositório é
   público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const B = require('./helpers/lote-bancada.cjs');
const O = require('../operacao.js');
const R = require('../regras.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const plano = v => JSON.parse(JSON.stringify(v));

const DIA = '2026-10-05';
const REGRA = {...R.REGRA_EMBUTIDA};   // tolerância 15, perdas: atraso, retrabalho, retorno antecipado
// Uma O.S. da volta do Carro 1 com a dupla Ana e Bia, entregue no prazo, com o retorno previsto do dia.
const daVolta = (id, previsto, extra = {}) => ({id, numero:'9' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'],
  instalacao:{data:DIA, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:DIA, fonte:'agenda'}, finalizadaEm:DIA + 'T20:00:00.000Z', finalizadoPor:'Gestor Teste',
  retornoPrevisto:[{dia:DIA, hora:previsto, por:'Gestor Teste', em:'2026-10-04T12:00:00.000Z'}], ...extra});
const chegada = (hora, dia = DIA, extra = {}) => ({retornoConferido:{dia, hora, fonte:'lote', por:'Gestor Teste', em:dia + 'T21:00:00.000Z', recebidoEm:dia + 'T21:00:05.000Z', ...extra}});

/* ───────────── a tolerância ───────────── */
test('retorno 1 minuto antes, com tolerância de 15, não conta; 15 também não; 16 conta', () => {
  const caso = (h, regra = REGRA) => O.retornoAntecipado(daVolta('a', '17:00', chegada(h)), regra);
  // Caso ruim: um minuto antes virava perda (zera a O.S. e a comissão).
  const um = caso('16:59');
  assert.equal(um.situacao, 'no horário');assert.equal(um.conta, false);assert.equal(um.minutos, 1);
  assert.match(um.motivo, /1 minuto antes do retorno previsto \(17:00\), dentro da tolerância de 15 minutos/);
  assert.equal(caso('16:45').situacao, 'no horário', 'exatamente a tolerância não conta');
  const conta = caso('16:44');
  assert.equal(conta.situacao, 'antecipado');assert.equal(conta.conta, true);assert.equal(conta.minutos, 16);assert.equal(conta.ocorrenciaId, 'a:retorno_antecipado:' + DIA, 'um por dia da jornada (revisão da F17)');
  assert.equal(caso('17:10').situacao, 'no horário');assert.match(caso('17:10').motivo, /depois do retorno previsto/);
  // A tolerância é a da regra vigente: com 0, um minuto antes conta.
  assert.equal(caso('16:59', {...REGRA, toleranciaRetornoMin:0}).situacao, 'antecipado');
  // Sem regra (setembro, antes do programa), vale a da regra embutida.
  assert.equal(O.TOLERANCIA_RETORNO_PADRAO, R.REGRA_EMBUTIDA.toleranciaRetornoMin);
  assert.equal(caso('16:59', null).situacao, 'no horário');
  // O status: a perda só quando conta; o motivo sempre.
  const st = O.statusEntrega(daVolta('a', '17:00', chegada('16:00')), '2026-10-06', REGRA);
  assert.equal(st.estado, 'retorno_antecipado');assert.deepEqual(st.perdas, ['retornoAntecipado']);
  assert.deepEqual(O.statusEntrega(daVolta('a', '17:00', chegada('16:59')), '2026-10-06', REGRA).perdas, []);
});

test('sem retorno previsto digitado não há perda; sem chegada conferida é "sem dado"; a hora da equipe é só declaração', () => {
  // Caso ruim: a equipe anotou 10:00 (horaRetorno). Ela é avaliada: a hora dela não decide.
  const decl = O.retornoAntecipado(daVolta('a', '17:00', {horaRetorno:'10:00', retornoEm:DIA + 'T13:00:00.000Z'}), REGRA);
  assert.equal(decl.situacao, 'sem dado');assert.equal(decl.conta, false);assert.match(decl.motivo, /a equipe anotou 10:00, que é só declaração/);
  const semPrev = O.retornoAntecipado(daVolta('a', '17:00', {retornoPrevisto:undefined, ...chegada('09:00')}), REGRA);
  assert.equal(semPrev.situacao, 'sem retorno previsto');assert.equal(semPrev.conta, false);
  // A chegada de outro dia não mede pelo retorno previsto deste.
  assert.equal(O.retornoAntecipado(daVolta('a', '17:00', chegada('09:00', '2026-10-06')), REGRA).situacao, 'sem retorno previsto');
  assert.equal(O.retornoAntecipado({...daVolta('a', '17:00', chegada('09:00')), tipo:'interno'}, REGRA).situacao, 'não se aplica');
  // A O.S. cancelada não leva a ocorrência (sai da apuração).
  const canc = daVolta('a', '17:00', {...chegada('09:00'), cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', em:DIA + 'T10:00:00Z'}});
  assert.ok(!O.ocorrenciasDerivadas(canc, REGRA).some(o => o.tipo === 'retorno_antecipado'));
});

/* ───────────── a volta com 3 O.S. ───────────── */
test('volta com 3 O.S.: medida pelo retorno previsto da última O.S. da volta; a perda cai só nela (padrão) ou em todas (regra)', () => {
  const c = chegada('15:30');
  const a = daVolta('a', '10:00', c), b = daVolta('b', '13:00', c), d = daVolta('d', '16:00', c);
  const outra = daVolta('x', '18:00', {...c, veiculo:'Carro 2'});   // outro carro: outra volta
  const volta = O.voltaNaLista(a, [a, b, d, outra]);
  assert.deepEqual(volta.map(o => o.id).sort(), ['a', 'b', 'd'], 'o mesmo dia de chegada, o mesmo carro e a mesma equipe');
  // Caso ruim: medida por O.S. a O.S. "a" (previsto 10:00) nunca seria antecipada; pela volta, a volta chegou 30 minutos antes.
  const r = id => O.retornoAntecipado([a, b, d].find(o => o.id === id), REGRA, volta);
  assert.equal(r('d').situacao, 'antecipado');assert.equal(r('d').osDaVolta, 3);assert.equal(r('d').medida, 'volta');
  assert.match(r('d').motivo, /30 minutos antes do retorno previsto da volta \(16:00, 3 O\.S\.\)/);
  for (const id of ['a', 'b']) {
    assert.equal(r(id).situacao, 'na volta', id);assert.equal(r(id).conta, false, id);
    assert.match(r(id).motivo, /a perda fica na O\.S\. 9d, a do último retorno previsto/, id);
  }
  // A ocorrência existe só na última: uma perda para a volta, não três.
  const ocs = [a, b, d].map(o => O.ocorrenciasDerivadas(o, REGRA, volta).filter(x => x.tipo === 'retorno_antecipado').map(x => x.id));
  assert.deepEqual(ocs, [[], [], ['d:retorno_antecipado:' + DIA]]);
  // Regra que manda a perda para todas as O.S. da volta.
  const todas = {...REGRA, retornoNaVolta:'todas'};
  assert.deepEqual([a, b, d].map(o => O.retornoAntecipado(o, todas, volta).situacao), ['antecipado', 'antecipado', 'antecipado']);
  // A ordem da lista não muda nada, e o empate de previsto cai sempre na mesma O.S.
  assert.deepEqual(O.retornoAntecipado(d, REGRA, [d, b, a]), O.retornoAntecipado(d, REGRA, volta));
  const e1 = daVolta('e1', '16:00', c), e2 = daVolta('e2', '16:00', c);
  assert.equal(O.retornoAntecipado(e1, REGRA, [e1, e2]).situacao, 'na volta');assert.equal(O.retornoAntecipado(e2, REGRA, [e2, e1]).situacao, 'antecipado');
  // Dentro da tolerância na volta: ninguém perde.
  const cedo = chegada('15:50'), v2 = [daVolta('a', '10:00', cedo), daVolta('d', '16:00', cedo)];
  assert.deepEqual(v2.map(o => O.retornoAntecipado(o, REGRA, v2).situacao), ['no horário', 'no horário']);
});

/* ───────────── fuso fixo ───────────── */
test('hora local sem fuso contra recebidoEm em UTC: o mesmo resultado com o processo em qualquer fuso', () => {
  // Caso ruim: a gestão confere às 22:30 de 05/10 na fábrica, que é 01:30 de 06/10 em UTC (recebidoEm). O dia e a hora são os da fábrica.
  const prog = `const O = require(${JSON.stringify(path.join(RAIZ, 'operacao.js'))});
    const o = ${JSON.stringify(daVolta('a', '23:00', chegada('22:30', DIA, {em:'2026-10-06T01:30:00.000Z', recebidoEm:'2026-10-06T01:30:07.000Z'})))};
    const t = ${JSON.stringify(daVolta('t', '23:00', chegada('22:50', DIA, {em:'2026-10-06T01:50:00.000Z', recebidoEm:'2026-10-06T01:50:07.000Z'})))};
    const r = O.retornoAntecipado(o, {toleranciaRetornoMin:15});
    const s = O.statusEntrega(o, '2026-10-07', {toleranciaRetornoMin:15, perdas:['retornoAntecipado']});
    process.stdout.write(JSON.stringify([r.situacao, r.dia, r.chegada, r.minutos, s.estado, s.perdas, O.retornoAntecipado(t, {toleranciaRetornoMin:15}).situacao]));`;
  const saidas = ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'America/Los_Angeles'].map(TZ =>
    execFileSync(process.execPath, ['-e', prog], {env:{...process.env, TZ, NODE_OPTIONS:''}}).toString());
  for (const s of saidas) assert.equal(s, saidas[0]);
  assert.deepEqual(JSON.parse(saidas[0]), ['antecipado', DIA, '22:30', 30, 'retorno_antecipado', ['retornoAntecipado'], 'no horário']);
});

/* ───────────── o id da ocorrência derivada ───────────── */
test('a ocorrência derivada tem o mesmo id em duas apurações (e no servidor); toda perda aponta para uma ocorrência', async () => {
  const S = await servidor();
  const c = chegada('15:00');
  const o = daVolta('os-77', '17:00', {...c, finalizadaEm:'2026-10-07T20:00:00.000Z', retrabalho:true, problema:'Adesivo descolou',
    retornoConf:{carroLimpo:'nao', carroArrumado:'sim', equipamentosOk:'nao', semAvaria:'nao', obs:'faltou a escada', por:'Gestor Teste'}});
  const ids = x => x.map(y => y.id);
  const um = O.ocorrenciasDerivadas(o, REGRA, null, '2026-10-08');
  const dois = O.ocorrenciasDerivadas(plano(o), REGRA, null, '2026-10-20');
  assert.deepEqual(ids(um), ['os-77:atraso', 'os-77:retrabalho', 'os-77:retorno_antecipado:' + DIA, 'os-77:carro', 'os-77:equipamentos', 'os-77:avaria']);
  assert.deepEqual(ids(dois), ids(um), 'outra apuração, outro dia: os mesmos ids');
  assert.deepEqual(ids(S.ocorrenciasDerivadas(o, REGRA, null, '2026-10-08')), ids(um), 'o servidor dá os mesmos ids');
  // Toda perda do status aponta para uma ocorrência com a mesma perda.
  const st = O.statusEntrega(o, '2026-10-08', REGRA);
  assert.deepEqual(st.perdas, ['retrabalho', 'retornoAntecipado', 'atraso']);
  for (const p of st.perdas) assert.ok(st.ocorrencias.some(x => x.perda === p && x.id.startsWith('os-77:')), p);
  // As da volta são o bônus e o redutor da volta (F19), nunca perda da O.S.; avaria não entra na nota.
  for (const t of ['carro', 'equipamentos', 'avaria']) { const x = um.find(y => y.tipo === t); assert.equal(x.volta, true);assert.equal(x.perda, ''); }
  assert.match(um.find(y => y.tipo === 'carro').motivo, /carro sujo/);assert.doesNotMatch(um.find(y => y.tipo === 'carro').motivo, /desarrumado/);
  // A manual não desconta de novo: detalha o item, sem perda.
  const comManual = {...o, ocorrencias:[{id:'oc-abc123def', tipo:'equipamento_faltante', item:'Escada de 6 m', obs:'', por:'Gestor Teste', em:'2026-10-07T21:00:00Z'}]};
  const todas = O.ocorrenciasDaOS(comManual, REGRA, null, '2026-10-08');
  assert.equal(todas.length, 7);assert.equal(todas[6].perda, '');assert.equal(todas[6].origem, 'manual');assert.equal(todas[6].motivo, 'Escada de 6 m');
  // Sem texto que conte, nada de travessão.
  assert.doesNotMatch(JSON.stringify(st) + JSON.stringify(todas), /—/);
});

/* ───────────── paridade ───────────── */
function gerador(semente) {
  let a = semente >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (min, max) => min + Math.floor(r() * (max - min + 1));
  return {r, int, um: xs => xs[int(0, xs.length - 1)]};
}
const HORAS = ['08:00', '10:00', '12:00', '15:30', '16:44', '16:45', '16:59', '17:00', '18:00', '25:00', '', 'x'];
const DIAS = [DIA, DIA, DIA, '2026-10-06', '2026-02-30', ''];
const SN = ['sim', 'nao', '', undefined, true, false];
function osGerada(g, i) {
  const o = {id:'g' + i, numero:String(70000 + i), tipo:g.r() < 0.1 ? 'interno' : 'externo', cliente:'Cliente Fictício', veiculo:g.um(['Carro 1', 'Carro 2', '', 'Instalação interna']),
    equipe:g.um([['100001'], ['100001', '100002'], [], ['Ana']]), instalacao:{data:DIA, periodo:'Manhã', duracaoDias:g.um([1, 2])}, prazoCombinado:{data:g.um(['2026-10-04', DIA, '2026-10-06']), fonte:'agenda'}};
  if (g.r() < 0.7) o.finalizadaEm = g.um([DIA + 'T20:00:00.000Z', '2026-10-07T12:00:00.000Z']);
  if (g.r() < 0.8) o.retornoPrevisto = [{dia:g.um(DIAS), hora:g.um(HORAS)}];
  if (g.r() < 0.75) o.retornoConferido = {dia:g.um(DIAS), hora:g.um(HORAS), fonte:'lote', recebidoEm:'2026-10-05T21:00:00Z'};
  if (g.r() < 0.2) o.horaRetorno = g.um(HORAS);
  if (g.r() < 0.2) { o.retrabalho = true; o.problema = 'Adesivo descolou'; }
  if (g.r() < 0.3) o.retornoConf = {carroLimpo:g.um(SN), carroArrumado:g.um(SN), equipamentosOk:g.um(SN), semAvaria:g.um(SN), por:'Gestor Teste'};
  // O retorno antecipado é um por dia (revisão da F17), e o abono guarda a medida que abonou (às vezes a de agora, às vezes outra).
  const rc = o.retornoConferido || {}, rp = (o.retornoPrevisto || [])[0] || {};
  const medidaRet = {dia:rc.dia, chegada:rc.dia + 'T' + rc.hora, previsto:rp.dia + 'T' + rp.hora};
  const medidaDe = oc => oc.includes(':retorno_antecipado') ? g.um([medidaRet, medidaRet, medidaRet, undefined, {dia:DIA, chegada:DIA + 'T15:30', previsto:DIA + 'T16:00'}])
    : g.um([{prazo:o.prazoCombinado.data, entrega:''}, undefined, {prazo:'2026-10-01', entrega:''}]);
  if (g.r() < 0.5) o.abonos = Array.from({length:g.int(1, 3)}, (_, k) => {
    const ocorrenciaId = o.id + ':' + g.um(['atraso', 'retorno_antecipado:' + (rc.dia || DIA), 'retorno_antecipado:' + (rc.dia || DIA), 'retorno_antecipado', 'retrabalho', 'nada']);
    return {id:'ab-' + i + 'x' + k + 'abcdef', ocorrenciaId, medida:medidaDe(ocorrenciaId),
    motivo:g.um(['Cliente pediu para remarcar a instalação', 'curto', '\u200b'.repeat(20)]), por:'Gestor Teste', em:g.r() < 0.7 ? '2026-10-06T10:00:00Z' : '',
    pedido:g.r() < 0.4, revogar:g.r() < 0.15, revogadoEm:g.r() < 0.15 ? '2026-10-06T11:00:00Z' : undefined};
  });
  if (g.r() < 0.3) o.ocorrencias = [{id:'oc-' + i + 'abcdef', tipo:g.um(['equipamento_faltante', 'equipamento_danificado', 'outra', 'lixo']), item:'Escada', obs:g.um(['', 'quebrou']),
    em:g.r() < 0.7 ? '2026-10-06T10:00:00Z' : '', pedido:g.r() < 0.5, anular:g.r() < 0.2}];
  if (g.r() < 0.15) o.cancelamento = {ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', em:DIA + 'T10:00:00Z'};
  return o;
}
test('paridade: 500 O.S. em voltas geradas dão o mesmo retorno, as mesmas ocorrências e o mesmo status no aparelho e no servidor', async () => {
  const S = await servidor();
  // O texto do bloco copiado é o mesmo (a régua de tests/status-paridade.test.cjs, aqui também pelo F17).
  const bloco = s => s.slice(s.indexOf('/* ==== STATUS DA ENTREGA'), s.indexOf('/* ==== FIM DO STATUS ==== */'));
  assert.equal(bloco(ler('supabase/functions/_shared/pcp-status.mjs')), bloco(ler('operacao.js')));
  assert.match(bloco(ler('operacao.js')), /function ocorrenciasDerivadas\(o, regra, volta, hoje\)/);
  const vistos = new Set();
  for (let lote = 0; lote < 100; lote++) {
    const g = gerador(17000 + lote);
    const lista = Array.from({length:5}, (_, k) => osGerada(g, lote * 5 + k));
    // Quase sempre a mesma volta (o mesmo carro e a mesma dupla), para exercitar a medida pela volta.
    if (g.r() < 0.7) for (const o of lista.slice(1)) { o.veiculo = lista[0].veiculo; o.equipe = lista[0].equipe.slice(); }
    const regra = g.um([REGRA, {...REGRA, retornoNaVolta:'todas'}, {...REGRA, toleranciaRetornoMin:0}, null]);
    for (const o of lista) {
      const volta = S.voltaDoRetorno(o, lista);
      assert.deepEqual(O.voltaDoRetorno(o, lista).map(x => x.id), volta.map(x => x.id), o.id);
      assert.deepEqual(O.retornoAntecipado(o, regra, volta), S.retornoAntecipado(o, regra, volta), o.id);
      assert.deepEqual(O.ocorrenciasDaOS(o, regra, volta, '2026-10-08'), S.ocorrenciasDaOS(o, regra, volta, '2026-10-08'), o.id);
      assert.deepEqual(O.statusEntrega(o, '2026-10-08', regra, volta), S.statusEntrega(o, '2026-10-08', regra, volta), o.id);
      assert.deepEqual(O.abonosDe(o), S.abonosDe(o), o.id);
      vistos.add(O.retornoAntecipado(o, regra, volta).situacao);
      for (const a of O.statusEntrega(o, '2026-10-08', regra, volta).aplicaveis) if (a.abonado) vistos.add('estado abonado');
    }
  }
  for (const s of ['antecipado', 'abonado', 'no horário', 'na volta', 'sem retorno previsto', 'sem dado', 'não se aplica', 'estado abonado']) assert.ok(vistos.has(s), s);
});

/* ───────────── ocorrências manuais no servidor ───────────── */
const FICHAS = B.FICHAS;
const banco = regs => ({pcp_registros:regs.map(B.osRow), registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
  pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gravada = (e, id) => B.noServidor(e, id);
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const pedido = (extra = {}) => ({id:'oc-teste' + Math.random().toString(36).slice(2, 10), tipo:'equipamento_faltante', item:'Escada de 6 m', obs:'não voltou no carro', fonte:'ficha', pedido:true, ...extra});

test('ocorrência manual: só a gestão registra, com autor e hora do servidor; operação, montagem, toque e máquina não; forjada não entra', async () => {
  const e = await edge('pcp-sync', banco([daVolta('1', '17:00', {liberadoPCP:true, confirmacao:'Confirmado', finalizadaEm:''})]));
  const enviar = (os, quem) => e.call({action:'upsert', os}, quem);
  // Caso ruim: quem não é da gestão manda o pedido, com carimbo forjado junto.
  const forjado = pedido({por:'Forjado', porId:'999999', em:'2020-01-01T00:00:00Z'});
  for (const quem of [B.OPERA, B.MONTAGEM]) {
    const r = await enviar({...gravada(e, '1'), ocorrencias:[forjado]}, quem);
    assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('ocorrencias' in gravada(e, '1')), quem.papel);
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) registra ocorrência/, quem.papel + ' ouve o porquê');
  }
  let r = await enviar({id:'1', rev:gravada(e, '1').rev, ocorrencias:[forjado], obsTecnicas:'nota'}, B.TOQUE);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('ocorrencias' in gravada(e, '1')), 'toque não registra');
  r = await enviar({...gravada(e, '1'), ocorrencias:[forjado]}, 'machine');
  assert.equal(r.status, 200);assert.ok(!('ocorrencias' in gravada(e, '1')), 'máquina não registra');
  // A marca já "carimbada" pelo aparelho (sem pedido) não entra nem da gestão.
  const {pedido: _p, ...semPedido} = forjado;
  r = await enviar({...gravada(e, '1'), ocorrencias:[semPedido]}, B.GESTOR);
  assert.equal(r.status, 200);assert.ok(!('ocorrencias' in gravada(e, '1')), 'o aparelho não forja');
  // A gestão registra: autor do crachá (com o ID do RH), hora daqui; o pedido não fica gravado.
  r = await enviar({...gravada(e, '1'), ocorrencias:[forjado]}, B.GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = gravada(e, '1').ocorrencias;
  assert.equal(g.length, 1);
  assert.equal(g[0].por, 'Gestor Teste');assert.equal(g[0].porConta, 'gestor');assert.equal(g[0].porId, '111222');
  assert.notEqual(g[0].em, '2020-01-01T00:00:00Z');assert.ok(!('pedido' in g[0]));assert.equal(g[0].item, 'Escada de 6 m');
  assert.ok(diario(e).some(a => a.campos.includes('ocorrencias') && a.autor.login === 'gestor' && a.depois.ocorrencias.novos.length === 1), 'vai para o diário');
  // Pedido inválido (tipo fora da lista, sem item nem texto, código fora do formato): aviso, nunca 422.
  for (const ruim of [pedido({tipo:'avaria'}), pedido({item:'', obs:'  '}), pedido({id:'OC-MAIUSCULO'})]) {
    r = await enviar({...gravada(e, '1'), ocorrencias:[...gravada(e, '1').ocorrencias, ruim]}, B.GESTOR);
    assert.equal(r.status, 200);assert.ok(r.avisos && r.avisos.length, JSON.stringify(ruim));assert.equal(gravada(e, '1').ocorrencias.length, 1);
  }
  // A volta para quem não é gestão não leva o ID nem o login de quem registrou.
  r = await enviar({...gravada(e, '1'), obsPCP:'x'}, B.OPERA);
  assert.equal(r.os.ocorrencias[0].por, 'Gestor Teste');assert.ok(!('porId' in r.os.ocorrencias[0]) && !('porConta' in r.os.ocorrencias[0]));
});

test('aba antiga sem o campo (ou com a lista velha) não encolhe; anular é novo carimbo e o registro fica', async () => {
  const gravadas = [{id:'oc-aaaaaaaa', tipo:'equipamento_faltante', item:'Escada', obs:'', por:'Gestor Teste', em:'2026-10-05T21:00:00Z'},
    {id:'oc-bbbbbbbb', tipo:'equipamento_danificado', item:'Furadeira', obs:'cabo partido', por:'Gestor Teste', em:'2026-10-05T21:01:00Z'}];
  const e = await edge('pcp-sync', banco([daVolta('1', '17:00', {ocorrencias:gravadas})]));
  // Caso ruim: a v141 não conhece o campo; e o Sobrescrever de uma aba velha manda a lista pela metade, ou vazia, ou null.
  const semCampo = gravada(e, '1'); delete semCampo.ocorrencias;
  for (const v of [undefined, [gravadas[0]], [], null]) {
    const os = {...gravada(e, '1')};
    if (v === undefined) delete os.ocorrencias; else os.ocorrencias = v;
    const r = await e.call({action:'upsert', os}, B.GESTOR);
    assert.equal(r.status, 200);assert.deepEqual(gravada(e, '1').ocorrencias, gravadas, JSON.stringify(v));
  }
  // Anular: só a gestão; vira carimbo, e a ocorrência continua na lista.
  const pedirAnular = () => ({...gravada(e, '1'), ocorrencias:gravada(e, '1').ocorrencias.map(x => x.id === 'oc-bbbbbbbb' ? {...x, anular:true, motivoAnular:'Registrada na O.S. errada'} : x)});
  let r = await e.call({action:'upsert', os:pedirAnular()}, B.OPERA);
  assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) anula/);assert.ok(!gravada(e, '1').ocorrencias[1].anulada);
  r = await e.call({action:'upsert', os:pedirAnular()}, B.OUTRA);
  const g = gravada(e, '1').ocorrencias;
  assert.equal(g.length, 2, 'nunca apaga');assert.equal(g[1].item, 'Furadeira');
  assert.equal(g[1].anulada.por, 'Outra Gestora');assert.equal(g[1].anulada.porConta, 'outra');assert.equal(g[1].anulada.motivo, 'Registrada na O.S. errada');
  assert.ok(!('anular' in g[1]));
  const anuladaEm = g[1].anulada.em;
  r = await e.call({action:'upsert', os:pedirAnular()}, B.GESTOR);
  assert.equal(gravada(e, '1').ocorrencias[1].anulada.em, anuladaEm, 'anular de novo não troca o carimbo');
  // O status mostra a anulada marcada, sem contar.
  const st = O.statusEntrega(gravada(e, '1'), '2026-10-06', REGRA);
  assert.deepEqual(st.ocorrencias.filter(o => o.origem === 'manual').map(o => o.anulada), [false, true]);
  // O pedido registrado e anulado antes de ir (sem rede) não entra.
  const o = gravada(e, '1');
  assert.equal(O.pedirOcorrencia(o, {tipo:'outra', item:'', obs:'Lona rasgada na caçamba'}), '');
  const nova = o.ocorrencias[2].id;
  assert.equal(O.pedirAnularOcorrencia(o, nova, 'engano'), '');
  r = await e.call({action:'upsert', os:o}, B.GESTOR);
  assert.equal(r.status, 200);assert.equal(gravada(e, '1').ocorrencias.length, 2);
});

/* ───────────── o retrabalho que o toque não desmarca ───────────── */
test('o toque não desmarca o retrabalho da gestão (nem a montagem com senha); marcar vale na hora; a gestão desmarca', async () => {
  const base = daVolta('1', '17:00', {liberadoPCP:true, confirmacao:'Confirmado', finalizadaEm:'', retrabalho:true, problema:'Adesivo descolou', causa:'Falha de fixação',
    retrabalhoPerguntado:{em:'2026-10-05T21:00:00Z', por:'Gestor Teste', resposta:'sim'},
    itens:[{uid:'1:1:1', item:'1', descricao:'Adesivo', qtde:'1', statusInst:'ok'}]});
  const e = await edge('pcp-sync', banco([base]));
  // Caso ruim: o espelho recalcula o retrabalho pelos itens (rollupRetrab) e manda retrabalho:false numa cópia em dia.
  let r = await e.call({action:'upsert', os:{id:'1', rev:gravada(e, '1').rev, retrabalho:false, problema:'Adesivo descolou', horaSaida:'08:00', saidaEm:DIA + 'T11:00:00.000Z',
    itens:[{uid:'1:1:1', item:'1', descricao:'Adesivo', qtde:'1', statusInst:'ok'}]}}, B.TOQUE);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(gravada(e, '1').retrabalho, true, 'o toque não desmarca');
  assert.equal(gravada(e, '1').problema, 'Adesivo descolou');
  assert.equal(gravada(e, '1').horaSaida, '08:00', 'o resto da execução grava');
  assert.match(String(r.avisos), /O retrabalho continua marcado: só a gestão do PCP desmarca/);
  // A montagem com senha usa o mesmo espelho: também não desmarca. A operação e a máquina também não.
  for (const quem of [B.MONTAGEM, B.OPERA]) {
    r = await e.call({action:'upsert', os:{...gravada(e, '1'), retrabalho:false, problema:''}}, quem);
    assert.equal(r.status, 200);assert.equal(gravada(e, '1').retrabalho, true, quem.papel);assert.equal(gravada(e, '1').problema, 'Adesivo descolou', quem.papel);
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) desmarca o retrabalho/, quem.papel);
  }
  r = await e.call({action:'upsert', os:{...gravada(e, '1'), retrabalho:false}}, 'machine');
  assert.equal(gravada(e, '1').retrabalho, true, 'máquina');
  // E o status segue Retrabalho (zera na hora), com a ocorrência derivada.
  assert.equal(O.statusEntrega(gravada(e, '1'), '2026-10-06', REGRA).estado, 'retrabalho');
  assert.ok(O.ocorrenciasDerivadas(gravada(e, '1'), REGRA).some(x => x.id === '1:retrabalho'));
  // A gestão desmarca.
  r = await e.call({action:'upsert', os:{...gravada(e, '1'), retrabalho:false, problema:''}}, B.GESTOR);
  assert.equal(r.status, 200);assert.equal(gravada(e, '1').retrabalho, false);
  // O toque MARCA: vale na hora, venha de onde vier.
  r = await e.call({action:'upsert', os:{id:'1', rev:gravada(e, '1').rev, retrabalho:true, problema:'Item 1: Erro de medida', causa:'Erro de medida'}}, B.TOQUE);
  assert.equal(r.status, 200);assert.equal(gravada(e, '1').retrabalho, true);
  assert.equal(O.statusEntrega(gravada(e, '1'), '2026-10-06', REGRA).estado, 'retrabalho');
  assert.deepEqual(O.statusEntrega({...gravada(e, '1'), finalizadaEm:DIA + 'T20:00:00Z'}, '2026-10-06', REGRA).perdas, ['retrabalho']);
});

/* ───────────── a tela: o lote registra na volta, com o store real ───────────── */
test('Fechar o dia: a ocorrência de equipamento entra em cada O.S. da volta (mesmo grupo), com autor do servidor; o retorno aparece no grupo', async () => {
  const c = {retornoConferido:{dia:'2026-09-29', hora:'15:00', fonte:'lote', por:'Gestor Teste', em:'2026-09-29T21:00:00Z', recebidoEm:'2026-09-29T21:00:05Z'}};
  const p1 = B.pcpFim('p1', {retornoPrevisto:[{dia:'2026-09-29', hora:'17:00'}], ...c}), p2 = B.pcpFim('p2', {retornoPrevisto:[{dia:'2026-09-29', hora:'12:00'}], ...c});
  const b = await B.montar({os:[p1, p2]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-29'})`);
    const grupo = b.run('LOTE.gruposDaTela()[0].chave');
    assert.equal(b.run('LOTE.gruposDaTela()[0].os.length'), 2);
    // Caso ruim: sem item nem texto não registra (a mesma frase do servidor).
    assert.equal(await b.acao({acao:'ocorrencia-volta', grupo, tipo:'equipamento_faltante', item:'', obs:''}), 'Diga qual é o item ou o que aconteceu.');
    assert.equal(await b.acao({acao:'ocorrencia-volta', grupo, tipo:'equipamento_faltante', item:'Escada de 6 m', obs:''}), '');
    await b.sincronizar();
    const o1 = B.noServidor(b.e, 'p1').ocorrencias, o2 = B.noServidor(b.e, 'p2').ocorrencias;
    assert.equal(o1.length, 1);assert.equal(o2.length, 1);
    assert.equal(o1[0].grupo, o2[0].grupo, 'o mesmo grupo: conta uma vez só');assert.match(o1[0].grupo, /^vl-/);
    assert.equal(o1[0].fonte, 'lote');assert.equal(o1[0].dia, '2026-09-29');assert.equal(o1[0].por, 'Gestor Teste');assert.equal(o1[0].porId, '111222');
    // O grupo mostra o retorno pela volta (chegada 15:00, previsto da volta 17:00) e a linha da O.S. p1 a ocorrência.
    const html = b.run(`(() => { const d = {innerHTML:'', querySelector:() => null, querySelectorAll:() => []}; document.getElementById = () => d; LOTE.render(); return d.innerHTML; })()`);
    assert.match(html, /Retorno antecipado<\/strong> na O\.S 7p1: chegou às 15:00, 2 h antes do retorno previsto da volta \(17:00, 2 O\.S\.\)/);
    assert.match(html, /data-lote-acao="abonar" data-os="p1" data-oc="p1:retorno_antecipado:2026-09-29"/);
    assert.doesNotMatch(html, /data-oc="p2:retorno_antecipado"/, 'a perda cai só na O.S. do último retorno previsto');
    assert.match(html, /Equipamento faltante/);
  } finally { b.fechar(); }
});
