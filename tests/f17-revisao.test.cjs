/* F17 (RETORNO ANTECIPADO, OCORRÊNCIAS E ABONOS): AS CORREÇÕES DAS DUAS
   REVISÕES ADVERSARIAIS (30/09/2026). Cada teste parte do caso ruim que a
   revisão provou e usa o store de verdade (store.js, a fila, os eventos)
   falando com o pcp-sync de verdade (tests/helpers/lote-bancada.cjs e
   tests/helpers/edge.cjs). Servidor: a chegada depois da meia-noite medida
   como 22 h de antecipação; o abono que voltava a valer noutra medida; a
   chegada do segundo dia que apagava a perda do primeiro (chegadasConferidas,
   com a aba v142 que só manda o retornoConferido); a cópia velha do celular
   que remarcava o retrabalho; a operação que apagava ou forjava a resposta da
   gestão; o motivo de caracteres que não aparecem. Corretude e uso: a prévia
   da divisão sem a volta; o selo "perda" que contradizia o status; a O.S.
   cancelada que levava a perda da volta; o Abonar em 35% dos cards; o Abonar
   durante o Salvar; a anulação da ocorrência da volta numa O.S. só; a data
   nova da aberta abonada; o custo O(N²) do status dos cards; o toque e os
   textos. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('./helpers/lote-bancada.cjs');
const {assert, O, edge, noServidor, montar, salvar, osRow, FICHAS, GESTOR, OPERA, TOQUE, js, esperar} = B;
const R = require('../regras.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const integridade = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const plano = v => JSON.parse(JSON.stringify(v));
const REGRA = {...R.REGRA_EMBUTIDA};   // tolerância 15; perdas: atraso, retrabalho, retorno antecipado
const DIA = '2026-10-05';
const MOTIVO = 'Cliente pediu para remarcar a instalação';
const banco = regs => ({pcp_registros:regs.map(osRow), registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
  pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
let _n = 0;
const pedidoAbono = (ocorrenciaId, extra = {}) => ({id:'ab-rev' + String(++_n).padStart(5, '0') + 'x', ocorrenciaId, motivo:MOTIVO, pedido:true, ...extra});
// Uma O.S. da volta do Carro 1 com a dupla Ana e Bia, entregue no dia, com o retorno previsto do dia.
const daVolta = (id, previsto, extra = {}) => ({id, numero:'9' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'],
  instalacao:{data:DIA, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:DIA, fonte:'agenda'}, finalizadaEm:DIA + 'T20:00:00.000Z', finalizadoPor:'Gestor Teste',
  retornoPrevisto:[{dia:DIA, hora:previsto, por:'Gestor Teste', em:'2026-10-04T12:00:00.000Z'}], ...extra});
const chegou = (hora, dia = DIA, extra = {}) => ({retornoConferido:{dia, hora, fonte:'lote', por:'Gestor Teste', em:dia + 'T21:00:00.000Z', recebidoEm:dia + 'T21:00:05.000Z', ...extra}});
const statusNoServidor = (b, id, hoje = '2026-09-30', regra = REGRA) => {
  const lista = b.e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => js(r.registro));
  const o = lista.find(x => x.id === id);
  return O.statusEntrega(o, hoje, regra, O.voltaDoRetorno(o, lista));
};

/* A TELA DA GESTÃO (app.js) num contexto próprio, com o store real e o
   pcp-sync real: a ficha, o card e os diálogos (abrirDialogoF17 fica com o
   que a tela pediria). A mesma bancada de tests/abonos-f17.test.cjs. */
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
async function tela(registros, quem = GESTOR, hoje = '2026-10-06') {
  const e = await edge('pcp-sync', banco(registros));
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:m => { ctx.__confirms.push(String(m)); return true; }});
  ctx.__confirms = [];
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'divisao.js', 'regras.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = [];
  run(`STATE.user = {nome:${JSON.stringify(quem.nome)}, papel:${JSON.stringify(quem.papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; reRenderModalKeepOpen = () => {}; toast = (m, t) => __toasts.push([m, t]);
    abrirDialogoF17 = (cfg, cb) => { __dialogo = cfg; __confirmar = cb; };
    var versoesRegrasCasa = () => [];
    hojeISO = () => ${JSON.stringify(hoje)};`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, ctx, esvaziar, json:c => js(run(c)),
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}

/* ═══════════════ servidor 1 (ALTA) e corretude 1: depois da meia-noite ═══════════════ */
test('revisão: a chegada depois da meia-noite é medida como DEPOIS do previsto, nunca 22 h antes; o lote pergunta "chegou no dia seguinte?" e grava o dia certo', async () => {
  // Serviço noturno de 28/09: saída 19:00, retorno previsto 23:30; o carro chegou 00:40 de 29/09.
  const noite = B.aberta('n2', {veiculo:'Carro 1', instalacao:{data:'2026-09-28', periodo:'Noite', duracaoDias:1}, prazoCombinado:{data:'2026-09-28', fonte:'agenda'},
    retornoPrevisto:[{dia:'2026-09-28', hora:'23:30', saida:'19:00'}]});
  const b = await montar({os:[noite]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-28'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    assert.equal(await b.acao({acao:'equipe-ok', grupo:g}), '');
    // Caso ruim: o lote gravava {dia:28, hora:'00:40'} e a porta media 22 h 50 de antecipação (zera a O.S.).
    assert.equal(await b.acao({acao:'chegada', grupo:g, valor:'00:40'}), '');
    assert.ok(b.confirms.some(m => /A chegada às 00:40 é antes da saída prevista \(19:00\) da volta de 28\/09\. O carro chegou no dia seguinte \(29\/09\)\?/.test(m)), JSON.stringify(b.confirms));
    assert.equal(b.run(`LOTE.grupo(${JSON.stringify(g)}).chegadaDia`), '2026-09-29');
    for (const a of [{acao:'entrega-todos', os:'n2'}, {acao:'retrabalho-nao', os:'n2'}, {acao:'confirmar', os:'n2'}]) assert.equal(await b.acao(a), '');
    const rel = await salvar(b);
    assert.deepEqual(rel.itens.map(i => i.estado), ['gravada'], JSON.stringify(rel.itens));
    await b.sincronizar();
    const s = noServidor(b.e, 'n2');
    assert.deepEqual(s.chegadasConferidas.map(c => [c.dia, c.hora, c.diaChegada]), [['2026-09-28', '00:40', '2026-09-29']]);
    assert.deepEqual([s.retornoConferido.dia, s.retornoConferido.hora, s.retornoConferido.diaChegada], ['2026-09-28', '00:40', '2026-09-29'], 'a v142 lê a última chegada');
    const st = statusNoServidor(b, 'n2');
    assert.equal(st.retornoAntecipado.situacao, 'no horário');
    assert.match(st.retornoAntecipado.motivo, /chegou às 00:40 de 29\/09, 1 h 10 min depois do retorno previsto \(23:30\)/);
    assert.deepEqual(st.perdas, []);
    // A porta mede igual: o abono do "retorno antecipado" não acha ocorrência.
    const r = await b.e.call({action:'upsert', os:{...noServidor(b.e, 'n2'), abonos:[pedidoAbono('n2:retorno_antecipado:2026-09-28')]}}, GESTOR);
    assert.match(String(r.avisos), /a ocorrência que ele aponta não existe nesta O\.S\./);
    // Quem responde "não" grava o que digitou: 00:40 do próprio dia (a gestão decide).
    const so = await montar({os:[noite], confirmar:() => false});
    try {
      await so.run(`LOTE.abrir({modo:'dia', dia:'2026-09-28'})`);
      const g2 = so.run('LOTE.gruposDaTela()[0].chave');
      assert.equal(await so.acao({acao:'chegada', grupo:g2, valor:'00:40'}), '');
      assert.equal(so.run(`LOTE.grupo(${JSON.stringify(g2)}).chegadaDia`), '');
    } finally { so.fechar(); }
  } finally { b.fechar(); }
  // A O.S. entregue que aparece no dia em que o carro chegou (29/09): o previsto é achado pelo dia da VOLTA (28/09).
  const fim = B.pcpFim('n1', {equipe:['100001', '100002'], veiculo:'Carro 1', instalacao:{data:'2026-09-28', periodo:'Noite', duracaoDias:1}, prazoCombinado:{data:'2026-09-28', fonte:'agenda'},
    saidaEm:'2026-09-28T22:00:00.000Z', retornoEm:'2026-09-29T03:40:00.000Z', finalizadaEm:'2026-09-29T03:50:00.000Z', retornoPrevisto:[{dia:'2026-09-28', hora:'23:30', saida:'19:00'}]});
  const c = await montar({os:[fim]});
  try {
    await c.run(`LOTE.abrir({modo:'dia', dia:'2026-09-29'})`);
    const g = c.run('LOTE.gruposDaTela()[0].chave');
    // Caso ruim: "sem retorno previsto" (o previsto era procurado no dia da chegada).
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada', grupo:g, valor:'00:40'}, {acao:'retrabalho-nao', os:'n1'}, {acao:'confirmar', os:'n1'}]) assert.equal(await c.acao(a), '');
    await salvar(c); await c.sincronizar();
    const s = noServidor(c.e, 'n1');
    assert.deepEqual(s.chegadasConferidas.map(x => [x.dia, x.hora, x.diaChegada]), [['2026-09-28', '00:40', '2026-09-29']]);
    const st = statusNoServidor(c, 'n1');
    assert.equal(st.retornoAntecipado.situacao, 'no horário');assert.match(st.retornoAntecipado.motivo, /1 h 10 min depois do retorno previsto \(23:30\)/);
  } finally { c.fechar(); }
  // A régua pura, nas duas cópias: o mesmo dia e hora digitados sem o dia seguinte é 22 h 50 antes; com ele, 70 min depois.
  const S = await servidor();
  const semDia = daVolta('x', '23:30', chegou('00:40')), comDia = daVolta('x', '23:30', chegou('00:40', DIA, {diaChegada:'2026-10-06'}));
  for (const M of [O, S]) {
    assert.equal(M.retornoAntecipado(semDia, REGRA).minutos, 22 * 60 + 50);
    assert.equal(M.retornoAntecipado(comDia, REGRA).situacao, 'no horário');
    assert.equal(M.pareceDiaSeguinte('00:40', '23:30', '19:00'), true);assert.equal(M.pareceDiaSeguinte('22:10', '23:30', '19:00'), false);
    assert.equal(M.pareceDiaSeguinte('09:00', '23:30', ''), true, 'mais de 12 h antes do previsto');
  }
});

/* ═══════════════ servidor 2 e corretude 3: o abono preso à medida ═══════════════ */
test('revisão: o abono fica preso à medida que abonou; a chegada corrigida deixa o abono "de outra medida", sem valer e sem revogar, e um abono novo é aceito', async () => {
  const o = daVolta('r1', '17:00', {finalizadaEm:DIA + 'T20:00:00.000Z'});
  const e = await edge('pcp-sync', banco([o]));
  const g = () => noServidor(e, 'r1');
  const conferir = hora => e.call({action:'upsert', os:{...g(), chegadasConferidas:[{dia:DIA, hora, fonte:'ficha'}]}}, GESTOR);
  await conferir('14:00');
  const id = 'r1:retorno_antecipado:' + DIA;
  let r = await e.call({action:'upsert', os:{...g(), abonos:[pedidoAbono(id, {motivo:'Cliente liberou o local às 13h30'})]}}, GESTOR);
  assert.equal(g().abonos.length, 1);
  assert.deepEqual(g().abonos[0].medida, {dia:DIA, chegada:DIA + 'T14:00', previsto:DIA + 'T17:00'}, 'o servidor grava a medida que abonou');
  await conferir('16:50');
  assert.equal(O.retornoAntecipado(g(), REGRA).situacao, 'no horário');
  // Caso ruim: meses depois a chegada vira 10:00 (7 h antes) e o abono antigo, de outra medida, cobria a perda nova.
  await conferir('10:00');
  const ret = O.retornoAntecipado(g(), REGRA);
  assert.equal(ret.situacao, 'antecipado');assert.equal(ret.conta, true);
  assert.match(ret.motivo, /o abono de outra medida \(05\/10 14:00\) não vale para esta/);
  assert.deepEqual(O.statusEntrega(g(), '2026-10-06', REGRA).perdas, ['retornoAntecipado']);
  assert.equal(g().abonos[0].revogadoEm, undefined, 'nada é revogado sozinho');
  // E um abono novo é aceito (antes: "a ocorrência já está abonada").
  r = await e.call({action:'upsert', os:{...g(), abonos:[...g().abonos, pedidoAbono(id, {motivo:'Abono novo para a medida nova das 10h'})]}}, GESTOR);
  assert.ok(!/já está abonada/.test(String(r.avisos)), String(r.avisos));
  assert.equal(g().abonos.length, 2);assert.equal(O.retornoAntecipado(g(), REGRA).situacao, 'abonado');
  // O atraso: o abono depois da entrega guarda o prazo e a data; a entrega que muda de dia o deixa de outra medida.
  const atr = daVolta('a1', '17:00', {prazoCombinado:{data:'2026-10-03', fonte:'agenda'}, retornoPrevisto:undefined});
  const e2 = await edge('pcp-sync', banco([atr]));
  await e2.call({action:'upsert', os:{...noServidor(e2, 'a1'), abonos:[pedidoAbono('a1:atraso')]}}, GESTOR);
  assert.deepEqual(noServidor(e2, 'a1').abonos[0].medida, {prazo:'2026-10-03', entrega:DIA});
  const outraEntrega = {...noServidor(e2, 'a1'), entregaLancada:{data:'2026-10-09', por:'Gestor Teste', em:'2026-10-09T12:00:00Z'}};
  const st = O.statusEntrega(outraEntrega, '2026-10-10', REGRA);
  assert.equal(st.rotulo, 'Com atraso');assert.deepEqual(st.perdas, ['atraso']);
  assert.match(st.motivo, /o abono de outra medida \(prazo 03\/10, entrega 05\/10\) não vale para esta/);
  // O abono dado antes da entrega (a remarcação pedida pelo cliente) vale para a entrega que vier, com o mesmo prazo.
  // (A porta julga a aberta pelo dia de hoje: o prazo dela fica no passado.)
  const aberta = {...atr, finalizadaEm:'', finalizadoPor:'', prazoCombinado:{data:'2026-09-20', fonte:'agenda'}};
  const e3 = await edge('pcp-sync', banco([aberta]));
  await e3.call({action:'upsert', os:{...noServidor(e3, 'a1'), abonos:[pedidoAbono('a1:atraso')]}}, GESTOR);
  assert.deepEqual(noServidor(e3, 'a1').abonos[0].medida, {prazo:'2026-09-20', entrega:''});
  assert.equal(O.statusEntrega({...noServidor(e3, 'a1'), finalizadaEm:'2026-10-09T20:00:00.000Z'}, '2026-10-10', REGRA).rotulo, 'Com atraso (abonado)');
  // O servidor nunca grava a medida que o aparelho mandou.
  const e4 = await edge('pcp-sync', banco([atr]));
  await e4.call({action:'upsert', os:{...noServidor(e4, 'a1'), abonos:[pedidoAbono('a1:atraso', {medida:{prazo:'2020-01-01', entrega:''}})]}}, GESTOR);
  assert.deepEqual(noServidor(e4, 'a1').abonos[0].medida, {prazo:'2026-10-03', entrega:DIA});
});

test('revisão: o Desfazer do lote que tira a chegada avisa que o abono ficou sem ocorrência (e não o revoga)', async () => {
  const D = '2026-09-29', MOT = 'Cliente liberou a equipe mais cedo, combinado por telefone';
  const mk = (id, prev) => B.pcpFim(id, {equipe:['100001', '100002'], veiculo:'Carro 1', prazoCombinado:{data:D, fonte:'agenda'}, retornoPrevisto:[{dia:D, hora:prev}]});
  const b = await montar({os:[mk('A', '15:00'), mk('B', '17:00')]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'${D}'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada', grupo:g, valor:'14:00'}]) assert.equal(await b.acao(a), '');
    for (const id of ['A', 'B']) { assert.equal(await b.acao({acao:'retrabalho-nao', os:id}), ''); assert.equal(await b.acao({acao:'confirmar', os:id}), ''); }
    const rel = await salvar(b);
    await b.sincronizar();
    assert.equal(statusNoServidor(b, 'B').retornoAntecipado.situacao, 'antecipado');
    assert.equal(await b.acao({acao:'abonar', os:'B', oc:'B:retorno_antecipado:' + D, motivo:MOT}), '');
    await b.sincronizar();
    assert.equal(noServidor(b.e, 'B').abonos.length, 1);
    // Caso ruim: o Desfazer tirava a chegada, a ocorrência abonada sumia e o relatório não dizia nada.
    const des = js(await b.run(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`));
    const b2 = des.itens.find(i => i.id === 'B');
    assert.ok(['gravada', 'gravada-aviso'].includes(b2.desfazer.estado), JSON.stringify(b2.desfazer));
    assert.ok(b2.desfazer.notas.some(n => /o abono de retorno antecipado de 29\/09 ficou sem ocorrência \(não foi revogado; revogue na ficha, se for o caso\)/.test(n)), JSON.stringify(b2.desfazer));
    assert.ok(!(des.itens.find(i => i.id === 'A').desfazer.notas || []).some(n => /abono/.test(n)), 'a O.S. sem abono não ouve nada');
    await b.sincronizar();
    const s = noServidor(b.e, 'B');
    assert.ok(!s.chegadasConferidas, 'a chegada do dia saiu');assert.equal(s.retornoConferido, null);
    assert.equal(s.abonos.length, 1);assert.ok(!s.abonos[0].revogadoEm, 'o abono não é revogado sozinho');
    // Outra chegada, outro fato (12:30): o abono antigo não cobre (é de outra medida).
    await b.run(`LOTE.abrir({modo:'dia', dia:'${D}'})`);
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada', grupo:g, valor:'12:30'}]) assert.equal(await b.acao(a), '');
    for (const id of ['A', 'B']) { await b.acao({acao:'retrabalho-nao', os:id}); await b.acao({acao:'confirmar', os:id}); }
    await salvar(b); await b.sincronizar();
    const st = statusNoServidor(b, 'B');
    assert.equal(st.rotulo, 'Retorno antecipado');assert.deepEqual(st.perdas, ['retornoAntecipado']);
    assert.match(st.motivo, /o abono de outra medida \(29\/09 14:00\) não vale para esta/);
  } finally { b.fechar(); }
});

/* ═══════════════ servidor 3 e corretude 4: uma chegada por dia da jornada ═══════════════ */
test('revisão: na O.S. de dois dias, a chegada do segundo dia não apaga a perda do primeiro (chegadasConferidas, o id leva o dia)', async () => {
  const dois = B.aberta('m1', {instalacao:{data:'2026-09-29', periodo:'Manhã', duracaoDias:2}, veiculo:'Carro 3', prazoCombinado:{data:'2026-09-29', fonte:'agenda'},
    retornoPrevisto:[{dia:'2026-09-29', hora:'18:00'}, {dia:'2026-09-30', hora:'18:00'}], saidaEm:'2026-09-29T11:00:00.000Z', horaSaida:'08:00'});
  const b = await montar({os:[dois]});
  const fechar = async (dia, hora, entregar) => {
    await b.run(`LOTE.abrir({modo:'dia', dia:'${dia}'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada', grupo:g, valor:hora}]) assert.equal(await b.acao(a), '');
    if (entregar) assert.equal(await b.acao({acao:'entrega-todos', os:'m1'}), '');
    else assert.equal(await b.acao({acao:'parte', os:'m1', uid:'m1:2:1', valor:1}), '');
    for (const a of [{acao:'retrabalho-nao', os:'m1'}, {acao:'confirmar', os:'m1'}]) assert.equal(await b.acao(a), '');
    const rel = await salvar(b);
    assert.ok(['gravada', 'gravada-aviso'].includes(rel.itens[0].estado), JSON.stringify(rel.itens));
    await b.sincronizar();
  };
  try {
    await fechar('2026-09-29', '14:00', false);
    assert.equal(statusNoServidor(b, 'm1', '2026-09-29').retornoAntecipado.situacao, 'antecipado');
    // Caso ruim: o dia 30 gravava a chegada por cima da do dia 29, e a perda do dia 29 sumia.
    await fechar('2026-09-30', '18:05', true);
    const s = noServidor(b.e, 'm1');
    assert.deepEqual(s.chegadasConferidas.map(c => [c.dia, c.hora]), [['2026-09-29', '14:00'], ['2026-09-30', '18:05']]);
    assert.deepEqual([s.retornoConferido.dia, s.retornoConferido.hora], ['2026-09-30', '18:05'], 'o retornoConferido é a última chegada (a v142 lê só ele)');
    const st = statusNoServidor(b, 'm1');
    assert.deepEqual(st.retornoAntecipado.dias.map(d => [d.dia, d.situacao]), [['2026-09-29', 'antecipado'], ['2026-09-30', 'no horário']]);
    assert.equal(st.retornoAntecipado.situacao, 'antecipado');assert.deepEqual(st.perdas, ['retornoAntecipado']);
    assert.deepEqual(st.ocorrencias.filter(o => o.tipo === 'retorno_antecipado').map(o => o.id), ['m1:retorno_antecipado:2026-09-29']);
    assert.match(st.motivo, /^29\/09: chegou às 14:00, 4 h antes do retorno previsto \(18:00\)/);
    // A porta acha a ocorrência do dia 29 (lê a volta daquele dia) e grava o abono com a medida dele.
    const r = await b.e.call({action:'upsert', os:{...noServidor(b.e, 'm1'), abonos:[pedidoAbono('m1:retorno_antecipado:2026-09-29')]}}, GESTOR);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(noServidor(b.e, 'm1').abonos[0].medida, {dia:'2026-09-29', chegada:'2026-09-29T14:00', previsto:'2026-09-29T18:00'});
    assert.deepEqual(statusNoServidor(b, 'm1').perdas, []);
  } finally { b.fechar(); }
});

test('revisão: a aba v142, que só manda o retornoConferido, alimenta a lista no dia dele e não apaga os outros dias; o vazio dela tira só o dia dela', async () => {
  const D1 = '2026-09-29', D2 = '2026-09-30';
  const lista = [{dia:D1, hora:'14:00', fonte:'lote', por:'Gestor Teste', em:D1 + 'T21:00:00.000Z', recebidoEm:D1 + 'T21:00:05.000Z'},
    {dia:D2, hora:'18:05', fonte:'lote', por:'Gestor Teste', em:D2 + 'T21:00:00.000Z', recebidoEm:D2 + 'T21:00:05.000Z'}];
  const o = daVolta('v1', '18:00', {instalacao:{data:D1, periodo:'Manhã', duracaoDias:2}, chegadasConferidas:lista, retornoConferido:lista[1]});
  const e = await edge('pcp-sync', banco([o]));
  const g = () => noServidor(e, 'v1');
  const comoV142 = mudar => { const x = g(); delete x.chegadasConferidas; return {...x, ...mudar(x)}; };
  // Caso ruim: a aba v142 confere de novo o dia 29 (16:30). Ela não conhece a lista e manda só o retornoConferido.
  let r = await e.call({action:'upsert', os:comoV142(() => ({retornoConferido:{dia:D1, hora:'16:30', fonte:'lote', em:D2 + 'T22:00:00.000Z'}}))}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(g().chegadasConferidas.map(c => [c.dia, c.hora, c.por]), [[D1, '16:30', 'Gestor Teste'], [D2, '18:05', 'Gestor Teste']], 'entrou no dia dela, o outro dia ficou');
  assert.equal(g().chegadasConferidas[0].porId, '111222', 'com o carimbo do servidor');
  assert.deepEqual([g().retornoConferido.dia, g().retornoConferido.hora], [D2, '18:05'], 'o retornoConferido segue a última chegada');
  // A aba v142 que reenvia o que recebeu (o retornoConferido do dia 30, igual) não mexe em nada.
  const antes = g().chegadasConferidas;
  r = await e.call({action:'upsert', os:comoV142(x => ({retornoConferido:x.retornoConferido, obsPCP:'nota'}))}, GESTOR);
  assert.deepEqual(g().chegadasConferidas, antes);
  // O Desfazer da v142 (null, da gestão) tira só o dia que ela via (o 30); o dia 29 fica.
  r = await e.call({action:'upsert', os:comoV142(() => ({retornoConferido:null}))}, GESTOR);
  assert.deepEqual(g().chegadasConferidas.map(c => [c.dia, c.hora]), [[D1, '16:30']]);
  assert.deepEqual([g().retornoConferido.dia, g().retornoConferido.hora], [D1, '16:30']);
  // A operação não troca a chegada (nem pela lista, nem pelo retornoConferido) e ouve o porquê.
  r = await e.call({action:'upsert', os:{...g(), chegadasConferidas:[{dia:D1, hora:'09:00', fonte:'lote'}]}}, OPERA);
  assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) confere a chegada/);
  assert.deepEqual(g().chegadasConferidas.map(c => [c.dia, c.hora]), [[D1, '16:30']]);
  // A lista vazia ou sem um dia não apaga nada; o pedido {dia, limpar:true} da gestão tira só aquele dia.
  r = await e.call({action:'upsert', os:{...g(), chegadasConferidas:[]}}, GESTOR);
  assert.deepEqual(g().chegadasConferidas.map(c => c.dia), [D1]);
  r = await e.call({action:'upsert', os:{...g(), chegadasConferidas:[{dia:D2, hora:'17:00', fonte:'lote'}]}}, GESTOR);
  assert.deepEqual(g().chegadasConferidas.map(c => [c.dia, c.hora]), [[D1, '16:30'], [D2, '17:00']]);
  r = await e.call({action:'upsert', os:{...g(), chegadasConferidas:[{dia:D1, limpar:true}]}}, GESTOR);
  assert.deepEqual(g().chegadasConferidas.map(c => c.dia), [D2]);
  // A cópia de outra versão (recebidoEm diferente do gravado no dia) não troca o dia.
  r = await e.call({action:'upsert', os:{...g(), chegadasConferidas:[{...g().chegadasConferidas[0], hora:'08:00', recebidoEm:'2026-01-01T00:00:00.000Z'}]}}, GESTOR);
  assert.equal(g().chegadasConferidas[0].hora, '17:00');assert.match(String(r.avisos), /versão anterior/);
  // A O.S. conferida só pela v142 (sem lista) ganha o dia novo sem perder o de antes.
  const velha = daVolta('v2', '18:00', {instalacao:{data:D1, periodo:'Manhã', duracaoDias:2}, ...chegou('14:00', D1)});
  const e2 = await edge('pcp-sync', banco([velha]));
  r = await e2.call({action:'upsert', os:{...noServidor(e2, 'v2'), chegadasConferidas:[{dia:D2, hora:'18:10', fonte:'lote'}]}}, GESTOR);
  assert.deepEqual(noServidor(e2, 'v2').chegadasConferidas.map(c => [c.dia, c.hora]), [[D1, '14:00'], [D2, '18:10']]);
  // Quem não é da gestão recebe o nome de quem conferiu, sem o ID e sem o login.
  r = await e2.call({action:'upsert', os:{...noServidor(e2, 'v2'), obsPCP:'x'}}, OPERA);
  assert.ok(r.os.chegadasConferidas.every(c => !('porId' in c) && !('porConta' in c)));
});

/* ═══════════════ servidor 4: a cópia velha do celular ═══════════════ */
test('revisão: a cópia velha do celular não remarca o retrabalho que a gestão desmarcou; o item que passou a retrabalho neste envio marca', async () => {
  const base = daVolta('t1', '17:00', {liberadoPCP:true, confirmacao:'Confirmado', finalizadaEm:'', retrabalho:true, problema:'Item 1: Erro de medida', causa:'Erro de medida',
    itens:[{uid:'t1:1:1', item:'1', descricao:'Adesivo', qtde:'1', statusInst:'retrab', motivo:'Erro de medida'}, {uid:'t1:2:1', item:'2', descricao:'Placa', qtde:'1', statusInst:'ok'}]});
  const e = await edge('pcp-sync', banco([base]));
  const g = () => noServidor(e, 't1');
  const revCelular = g().rev;
  // A gestão confere e desmarca (não era retrabalho).
  await e.call({action:'upsert', os:{...g(), retrabalho:false, problema:'', causa:'', retrabalhoPerguntado:{em:'2026-10-05T21:00:00.000Z', por:'Gestor Teste', resposta:'nao'}}}, GESTOR);
  assert.equal(g().retrabalho, false);
  // Caso ruim: o celular, com a cópia aberta antes (rev velho), grava a saída; o espelho manda retrabalho:true pelos itens.
  const itensVelhos = plano(base.itens);
  let r = await e.call({action:'upsert', os:{id:'t1', rev:revCelular, retrabalho:true, problema:'Item 1: Erro de medida', causa:'Erro de medida', horaSaida:'08:00', itens:itensVelhos}}, TOQUE);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(g().retrabalho, false, 'a cópia velha não remarca');assert.equal(g().problema, '');
  assert.equal(g().horaSaida, '08:00', 'o resto do toque grava');
  assert.match(String(r.avisos), /O retrabalho não foi marcado: a gestão do PCP conferiu a O\.S\. depois que este aparelho a leu/);
  // O item 2 passou a retrabalho NESTE envio (mesmo numa cópia velha): marca, porque é fato novo.
  r = await e.call({action:'upsert', os:{id:'t1', rev:revCelular, retrabalho:true, problema:'Item 2: Quebrou', causa:'Quebra',
    itens:[itensVelhos[0], {...itensVelhos[1], statusInst:'retrab', motivo:'Quebrou'}]}}, TOQUE);
  assert.equal(g().retrabalho, true);assert.equal(g().problema, 'Item 2: Quebrou');
  // A cópia em dia marca na hora, como sempre.
  const e2 = await edge('pcp-sync', banco([{...base, retrabalho:false, problema:'', itens:[{...base.itens[0], statusInst:'ok'}, base.itens[1]]}]));
  r = await e2.call({action:'upsert', os:{id:'t1', rev:noServidor(e2, 't1').rev, retrabalho:true, problema:'Item 1: Erro de medida'}}, TOQUE);
  assert.equal(noServidor(e2, 't1').retrabalho, true);
});

/* ═══════════════ servidor 5 e corretude 7: a resposta da gestão ═══════════════ */
test('revisão: a operação não apaga nem forja a resposta do retrabalho; os cinco campos, a causa e a situação ficam; o "Não" da tela diz que só o PCP desmarca', async () => {
  const marcada = B.pcpFim('r1', {finalizadaEm:'', finalizadoPor:'', retrabalho:true, problema:'Adesivo descolou na borda', etapaOrigem:'Instalação', causaRaiz:'Material',
    responsavelEtapa:'Setor fictício', dataRetrabalho:'2026-09-29', causa:'Falha de fixação', checkout:{situacao:'Retrabalho'},
    retrabalhoPerguntado:{em:'2026-09-29T20:00:00.000Z', por:'Gestor Teste', resposta:'sim'}});
  const e = await edge('pcp-sync', {pcp_registros:[osRow(marcada)], registros:plano(FICHAS), pcp_config_global:[{id:true, config:plano(B.CFG), atualizado_em:'2026-09-19T10:00:00Z'}], painel_registros:[], equipe_contas:[]});
  const g = () => noServidor(e, 'r1');
  const pergunta = plano(g().retrabalhoPerguntado);
  // Caso ruim: o "Não" da operação apagava o responsável e a situação e gravava a resposta "não" com o nome que quis.
  const veio = {...g(), retrabalho:false, problema:'', etapaOrigem:'', causaRaiz:'', responsavelEtapa:'', dataRetrabalho:'', causa:'', checkout:{situacao:''},
    retrabalhoPerguntado:{em:'2026-09-30T12:00:00.000Z', por:'Gestor Teste', resposta:'nao'}, finalizadaEm:'2026-09-30T12:00:00.000Z', finalizadoPor:'Operação Teste',
    fotosRetornoIds:['foto-ficticia-1'], retornoEm:'2026-09-30T11:30:00.000Z'};
  let r = await e.call({action:'upsert', os:veio}, OPERA);
  assert.equal(r.status, 200, JSON.stringify(r));
  const d = g();
  assert.equal(d.retrabalho, true);
  assert.deepEqual([d.problema, d.etapaOrigem, d.causaRaiz, d.responsavelEtapa, d.dataRetrabalho, d.causa],
    ['Adesivo descolou na borda', 'Instalação', 'Material', 'Setor fictício', '2026-09-29', 'Falha de fixação']);
  assert.equal(d.checkout.situacao, 'Retrabalho');
  assert.deepEqual(d.retrabalhoPerguntado, pergunta, 'a resposta da gestão fica');
  assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) desmarca o retrabalho/);
  assert.match(String(r.avisos), /A resposta da pergunta do retrabalho não foi gravada: só a gestão do PCP \(admin ou pcp\) responde por ela/);
  assert.equal(d.finalizadaEm, '2026-09-30T12:00:00.000Z', 'o resto da finalização grava');
  // A operação também não forja a resposta numa O.S. sem retrabalho.
  const limpa = B.pcpFim('r2', {finalizadaEm:'', finalizadoPor:''});
  const e2 = await edge('pcp-sync', {pcp_registros:[osRow(limpa)], registros:plano(FICHAS), pcp_config_global:[{id:true, config:plano(B.CFG), atualizado_em:'2026-09-19T10:00:00Z'}], painel_registros:[], equipe_contas:[]});
  await e2.call({action:'upsert', os:{...noServidor(e2, 'r2'), retrabalhoPerguntado:{em:'2026-09-30T12:00:00.000Z', por:'Gestor Teste', resposta:'nao'}}}, OPERA);
  assert.ok(!('retrabalhoPerguntado' in noServidor(e2, 'r2')));
  // A gestão responde: quem é do crachá (com o ID do RH), a hora do aparelho que não vem do futuro e o recebidoEm daqui.
  r = await e.call({action:'upsert', os:{...g(), retrabalho:false, problema:'', retrabalhoPerguntado:{em:'2026-09-30T13:00:00.000Z', por:'Forjado', resposta:'nao'}}}, GESTOR);
  const p = g().retrabalhoPerguntado;
  assert.deepEqual([p.resposta, p.por, p.porConta, p.porId, p.em], ['nao', 'Gestor Teste', 'gestor', '111222', '2026-09-30T13:00:00.000Z']);assert.ok(p.recebidoEm);
  assert.equal(g().retrabalho, false, 'a gestão desmarca');
  r = await e.call({action:'upsert', os:{...g(), retrabalhoPerguntado:{em:'2099-01-01T00:00:00.000Z', por:'X', resposta:'sim'}}}, GESTOR);
  assert.notEqual(g().retrabalhoPerguntado.em, '2099-01-01T00:00:00.000Z', 'a hora do futuro vira a do servidor');
  // A tela: o "Não" de quem não é admin nem pcp não desmarca e diz por quê.
  const t = await B.montar({os:[marcada], quem:OPERA});
  try {
    t.run(`__os = JSON.parse(JSON.stringify(STORE.getOS('r1'))); __resp = 0; perguntarRetrabalho(__os, () => { __resp++; });`);
    const box = t.criados[t.criados.length - 1];
    box.querySelector('#retrab-nao').onclick();
    assert.ok(t.confirms.some(m => /O retrabalho fica marcado; só o PCP desmarca/.test(m)), JSON.stringify(t.confirms));
    const os = t.run('__os');
    assert.equal(os.retrabalho, true);assert.equal(os.responsavelEtapa, 'Setor fictício');assert.equal(os.checkout.situacao, 'Retrabalho');
    assert.equal(os.retrabalhoPerguntado.resposta, 'sim', 'a resposta da gestão não muda');assert.equal(t.run('__resp'), 1, 'a finalização segue');
  } finally { t.fechar(); }
});

/* ═══════════════ servidor 6: o motivo que não aparece ═══════════════ */
test('revisão: o motivo feito de caracteres que não aparecem não passa, na tela e na porta (abono e cancelamento): só contam as letras e os números', async () => {
  const S = await servidor();
  const atrasada = id => ({id, numero:'8' + id, tipo:'externo', cliente:'Cliente Fictício', veiculo:'Carro 1', equipe:['100001'],
    instalacao:{data:DIA, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-10-03', fonte:'agenda'}, finalizadaEm:DIA + 'T20:00:00.000Z', finalizadoPor:'Gestor Teste'});
  const casos = {hangul:'\u3164'.repeat(15), braille:'\u2800'.repeat(15), seletor:'a' + '\ufe0f'.repeat(14), combinante:'a' + '\u0301'.repeat(14), cgj:'\u034f'.repeat(15),
    pontuacao:'..............., ,', hangulMeia:'\uffa0'.repeat(15)};
  const e = await edge('pcp-sync', banco(Object.keys(casos).map(atrasada)));
  for (const [id, motivo] of Object.entries(casos)) {
    // Caso ruim: estes passavam como 15 letras, e o atraso saía "abonado" sem motivo nenhum.
    assert.equal(O.motivoAbonoInvalido(motivo), 'Escreva o motivo do abono com 15 letras ou mais.', 'tela: ' + id);
    assert.equal(S.motivoAbonoInvalido(motivo), 'Escreva o motivo do abono com 15 letras ou mais.', 'porta: ' + id);
    assert.equal(O.motivoCancelamentoInvalido(motivo), 'Escreva o motivo do cancelamento com 15 letras ou mais.', 'cancelamento: ' + id);
    const r = await e.call({action:'upsert', os:{...noServidor(e, id), abonos:[pedidoAbono(id + ':atraso', {motivo})]}}, GESTOR);
    assert.equal(r.status, 200);assert.ok(!('abonos' in noServidor(e, id)), id);
    assert.match(String(r.avisos), /escreva o motivo do abono com 15 letras ou mais/, id);
  }
  // Acento (composto ou não) e número contam; o espaço e a pontuação não.
  for (const bom of ['Cliente pediu remarcação', 'Cliente pediu remarcac\u0327a\u0303o', 'Remarcado 2x pelo cliente']) {
    assert.equal(O.motivoAbonoInvalido(bom), '', bom);assert.equal(S.motivoAbonoInvalido(bom), '', bom);
  }
  assert.equal(O.letrasMotivoSt('ab c, d.1'), 5);
});

/* ═══════════════ corretude 2: a prévia da divisão ═══════════════ */
test('revisão: a prévia da divisão mede o retorno pela volta: a O.S. que não é a última pontua, igual à ficha', async () => {
  const D = '2026-10-05';
  const mk = (id, prev) => ({id, numero:'9' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'], valorTotal:4000, liberadoPCP:true,
    instalacao:{data:D, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:D, fonte:'agenda'}, finalizadaEm:D + 'T20:00:00.000Z', finalizadoPor:'Gestor Teste',
    retornoPrevisto:[{dia:D, hora:prev}], retornoConferido:{dia:D, hora:'14:00', fonte:'lote', por:'Gestor Teste', em:D + 'T21:00:00Z'}});
  const b = await montar({os:[mk('A', '15:00'), mk('B', '17:00')]});
  try {
    const prev = id => b.json(`(() => { const regra = REGRAS.regraVigente([], '${D}'); return ALOCUI.iniciar('ficha:${id}', {os:STORE.getOS('${id}'), equipes:[], papel:'pcp', valor:4000, dia:'${D}', versoes:[]}).naoPontua; })()`);
    // Caso ruim: a prévia dizia "não pontua" para a A (sozinha, 1 h antes), e a ficha "no prazo" (a perda é da B, a última da volta).
    assert.equal(await prev('A'), '');
    assert.match(await prev('B'), /O\.S\. com retorno antecipado: pela regra do programa, não pontua nem paga comissão\./);
    const ficha = id => b.json(`(() => { const o = STORE.getOS('${id}'); return OPERACAO.statusEntrega(o, '2026-10-06', REGRAS.regraVigente([], '${D}'), OPERACAO.voltaNaLista(o, STORE.getAllOS())).perdas; })()`);
    assert.deepEqual(await ficha('A'), []);assert.deepEqual(await ficha('B'), ['retornoAntecipado']);
  } finally { b.fechar(); }
});

/* ═══════════════ corretude 5: o selo "perda" ═══════════════ */
test('revisão: o selo "perda" sai das perdas do status: a aberta atrasada e a de antes do programa não têm, e a ficha não diz "conta como perda" sem regra', async () => {
  // A aberta com o prazo vencido (05/10) e a entregue com retorno antecipado em 30/09 (antes do programa: sem regra).
  // (O status da tela julga a aberta pelo dia de hoje: o prazo dela fica no passado.)
  const aberta = {...daVolta('ab', '17:00', {finalizadaEm:'', finalizadoPor:'', retornoPrevisto:undefined}), instalacao:{data:'2026-09-20', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-20', fonte:'agenda'}};
  const antes = daVolta('ra', '17:00', {instalacao:{data:'2026-09-29', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-29', fonte:'agenda'}, finalizadaEm:'2026-09-29T20:00:00.000Z',
    retornoPrevisto:[{dia:'2026-09-29', hora:'17:00'}], ...chegou('14:00', '2026-09-29')});
  const entregue = daVolta('en', '17:00', {...chegou('14:00')});
  const t = await tela([aberta, antes, entregue], GESTOR, '2026-10-06');
  // Caso ruim: o atraso da aberta (que ainda não é perda) e o retorno de setembro mostravam "perda".
  t.abrir('ab');
  let ficha = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.deepEqual(t.json('statusEntregaDe(_modalDraft).perdas'), []);
  assert.doesNotMatch(ficha, /oc-selo perda/);assert.match(ficha, /0 perdas valendo · 1 sem perda agora/);
  t.abrir('ra');
  ficha = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.deepEqual(t.json('statusEntregaDe(_modalDraft).perdas'), [], 'antes de 01/10 não há regra do programa');
  assert.doesNotMatch(ficha, /oc-selo perda/);assert.doesNotMatch(ficha, /conta como perda/);
  assert.match(ficha, /Retorno antecipado:<\/strong> antes do previsto, sem perda pela regra do dia\./);
  t.abrir('en');
  ficha = t.run('statusEntregaFichaHTML(_modalDraft)');
  assert.deepEqual(t.json('statusEntregaDe(_modalDraft).perdas'), ['retornoAntecipado']);
  assert.match(ficha, /oc-selo perda/);assert.match(ficha, /1 perda valendo/);
  // Toda ocorrência que conta tem a perda no status, e vice-versa (a mesma conta).
  for (const id of ['ab', 'ra', 'en']) {
    const st = t.json(`statusEntregaDe(STORE.getOS('${id}'))`);
    assert.deepEqual([...new Set(st.ocorrencias.filter(o => o.conta).map(o => o.perda))].sort(), [...st.perdas].sort(), id);
  }
  // No lote, a linha também: a classe "perda" só na que conta.
  const b = await montar({os:[B.aberta('la', {prazoCombinado:{data:'2026-09-26', fonte:'agenda'}})]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-30'})`);
    const html = b.run(`(() => { const d = {innerHTML:'', querySelector:() => null, querySelectorAll:() => []}; document.getElementById = () => d; LOTE.render(); return d.innerHTML; })()`);
    assert.match(html, /lote-oc-item"><span><strong>Entrega com atraso/);assert.doesNotMatch(html, /lote-oc-item perda/);
  } finally { b.fechar(); }
});

/* ═══════════════ corretude 6: a cancelada sai da volta ═══════════════ */
test('revisão: a O.S. cancelada (e a retirada) sai da volta antes de escolher a última: a perda fica na última que vale', async () => {
  const c = chegou('13:00');
  const a = daVolta('a', '16:00', c);
  const bc = daVolta('b', '18:00', {...c, finalizadaEm:'', cancelamento:{ativo:true, motivo:'Cliente desistiu da segunda placa', por:'Gestor Teste', em:DIA + 'T15:00:00Z'}});
  const ret = daVolta('c', '19:00', {...c, tipo:'interno'});
  const lista = [a, bc, ret];
  const S = await servidor();
  for (const M of [O, S]) {
    // Caso ruim: a B (cancelada, previsto 18:00) era a "última" e levava a perda embora; ninguém perdia.
    const st = M.statusEntrega(a, '2026-10-06', REGRA, M.voltaDoRetorno(a, lista));
    assert.equal(st.retornoAntecipado.situacao, 'antecipado');assert.deepEqual(st.perdas, ['retornoAntecipado']);
    assert.match(st.retornoAntecipado.motivo, /chegou às 13:00, 3 h antes do retorno previsto \(16:00\)/);
    // Mesmo com a cancelada passada à mão na volta.
    assert.equal(M.retornoAntecipado(a, REGRA, lista).situacao, 'antecipado');
    assert.deepEqual(M.voltaDoRetorno(a, lista).map(x => x.id), ['a']);
  }
  // A porta aceita o abono da A (a ocorrência existe).
  const e = await edge('pcp-sync', banco(lista));
  const r = await e.call({action:'upsert', os:{...noServidor(e, 'a'), abonos:[pedidoAbono('a:retorno_antecipado:' + DIA)]}}, GESTOR);
  assert.equal(r.status, 200);assert.equal(noServidor(e, 'a').abonos.length, 1, String(r.avisos));
});

/* ═══════════════ corretude 8: o Abonar do card ═══════════════ */
test('revisão: no card, Abonar só com perda que conta ou na aberta atrasada que o cliente remarcou', async () => {
  // (O status da tela julga a aberta pelo dia de hoje: o prazo dela fica no passado.)
  const semRemarcar = {...daVolta('s1', '17:00', {finalizadaEm:'', finalizadoPor:'', retornoPrevisto:undefined}), instalacao:{data:'2026-09-20', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-20', fonte:'agenda'}};
  const remarcada = {...semRemarcar, id:'s2', numero:'9s2', instalacao:{data:'2026-12-09', periodo:'Manhã', duracaoDias:1},
    agendaLog:[{de:'2026-09-20', data:'2026-12-09', motivo:'cliente pediu', em:'2026-09-19T12:00:00Z'}]};
  const entregueAtrasada = daVolta('s3', '17:00', {prazoCombinado:{data:'2026-10-03', fonte:'agenda'}, retornoPrevisto:undefined});
  const setembro = daVolta('s4', '17:00', {instalacao:{data:'2026-09-25', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-20', fonte:'agenda'}, finalizadaEm:'2026-09-25T20:00:00.000Z', retornoPrevisto:undefined});
  const t = await tela([semRemarcar, remarcada, entregueAtrasada, setembro], GESTOR, '2026-10-06');
  const card = id => t.run(`osCardHTML(STORE.getOS('${id}'))`);
  // Caso ruim: toda aberta atrasada (35% dos cards abertos) mostrava Abonar, sem perda nenhuma.
  assert.doesNotMatch(card('s1'), /data-abonar-os/);
  assert.match(card('s2'), /data-abonar-os="s2"/, 'a aberta remarcada pelo cliente');
  assert.match(card('s3'), /data-abonar-os="s3"/, 'a entregue com perda que conta');
  assert.doesNotMatch(card('s4'), /data-abonar-os/, 'a entregue antes do programa (setembro) não tem perda, mesmo vista em outubro');
  // Na ficha, o Abonar continua para a aberta sem remarcação.
  t.abrir('s1');
  assert.match(t.run('statusEntregaFichaHTML(_modalDraft)'), /data-f17-acao="abonar" data-oc="s1:atraso"/);
});

/* ═══════════════ corretude 9: o Abonar durante o Salvar ═══════════════ */
test('revisão: as ações da F17 esperam o Salvar do lote terminar (o abono no meio virava um falso "Recusada")', async () => {
  const b = await montar({os:[B.pcpFim('p1', {prazoCombinado:{data:'2026-09-26', fonte:'agenda'}})]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-29'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada', grupo:g, valor:'18:00'}, {acao:'retrabalho-nao', os:'p1'}, {acao:'confirmar', os:'p1'}]) assert.equal(await b.acao(a), '');
    b.rede.on = false;
    const salvando = b.run(`LOTE.salvar({prazoMs:2000, passoMs:5})`);
    await esperar(30);
    assert.equal(b.run('LOTE.estado().salvando'), true);
    // Caso ruim: o abono gravava no meio do Salvar e o lote voltava "Recusada".
    assert.equal(b.run(`LOTE.executar({acao:'abonar', os:'p1', oc:'p1:atraso', motivo:${JSON.stringify(MOTIVO)}})`), 'Espere o Salvar do lote terminar: ele está gravando estas O.S.');
    for (const acao of ['revogar-abono', 'anular-ocorrencia', 'ocorrencia-volta']) assert.match(b.run(`LOTE.executar({acao:'${acao}', os:'p1', grupo:${JSON.stringify(g)}, oc:'x', ab:'x', tipo:'outra', item:'Escada'})`), /Espere o Salvar/);
    b.rede.on = true;
    const rel = js(await salvando);
    assert.deepEqual(rel.itens.map(i => i.estado), ['gravada'], JSON.stringify(rel.itens));
    await b.sincronizar();
    assert.ok(!noServidor(b.e, 'p1').abonos);
    // Terminado o Salvar, abona.
    assert.equal(await b.acao({acao:'abonar', os:'p1', oc:'p1:atraso', motivo:MOTIVO}), '');
    await b.sincronizar();
    assert.equal(noServidor(b.e, 'p1').abonos.length, 1);
  } finally { b.fechar(); }
});

/* ═══════════════ corretude 10: anular na volta inteira ═══════════════ */
test('revisão: a ocorrência registrada na volta se anula nas N O.S. da volta num toque (lote e ficha)', async () => {
  const D = '2026-09-29';
  const mk = id => B.pcpFim(id, {equipe:['100001', '100002'], veiculo:'Carro 1', prazoCombinado:{data:D, fonte:'agenda'}});
  const b = await montar({os:[mk('A'), mk('B'), mk('C')]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'${D}'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    assert.equal(await b.acao({acao:'ocorrencia-volta', grupo:g, tipo:'equipamento_faltante', item:'Escada de 6 m', obs:'não voltou'}), '');
    await b.sincronizar();
    const ocA = noServidor(b.e, 'A').ocorrencias[0].id;
    // Caso ruim: anular desfazia uma O.S. só; o engano numa volta de 3 pedia 3 anulações.
    assert.equal(await b.acao({acao:'anular-ocorrencia', os:'A', oc:ocA, motivo:'registrada por engano', todas:true}), '');
    await b.sincronizar();
    for (const id of ['A', 'B', 'C']) { const o = noServidor(b.e, id).ocorrencias[0]; assert.ok(o.anulada && o.anulada.em, id);assert.equal(o.anulada.motivo, 'registrada por engano', id); }
  } finally { b.fechar(); }
  // A ficha oferece "Anular nas 3 O.S. da volta".
  const grupo = 'vl-grupoficticio01';
  const oc = id => ({id:'oc-' + id.toLowerCase() + 'abcdefg', tipo:'equipamento_faltante', item:'Escada de 6 m', obs:'', fonte:'lote', dia:D, grupo, por:'Gestor Teste', em:D + 'T21:00:00.000Z'});
  const t = await tela(['A', 'B', 'C'].map(id => ({...mk(id), ocorrencias:[oc(id)]})), GESTOR, '2026-09-30');
  t.abrir('A');
  t.run(`(() => { const b = {dataset:{f17Acao:'anular', oc:'oc-aabcdefg'}}; document.querySelector = s => s === '#modal-os .st-ocorrencias' ? {querySelectorAll:() => [b]} : null; ligarOcorrenciasDaFicha(); b.onclick(); })()`);
  assert.equal(t.run('__dialogo.botaoTodas'), 'Anular nas 3 O.S. da volta');assert.equal(t.run('__dialogo.botao'), 'Anular só nesta O.S.');
  assert.equal(t.run(`__confirmar({motivo:'engano', todas:true})`), '');
  t.run(`STORE.saveOS(_modalDraft)`);   // o autosave da ficha
  await t.esvaziar();
  for (const id of ['A', 'B', 'C']) assert.ok(noServidor(t.e, id).ocorrencias[0].anulada, id);
});

/* ═══════════════ corretude 11: a aberta abonada diz a data nova ═══════════════ */
test('revisão: a O.S. aberta com o atraso abonado mostra também a data nova (agendada para DD/MM)', async () => {
  const o = {id:'X1', numero:'777', tipo:'externo', cliente:'Cliente Fictício', veiculo:'Carro 1', equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado',
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-26', fonte:'agenda'},
    agendaLog:[{de:'2026-09-26', data:'2026-10-05', motivo:'cliente pediu', em:'2026-09-25T12:00:00Z'}]};
  const e = await edge('pcp-sync', banco([o]));
  await e.call({action:'upsert', os:{...noServidor(e, 'X1'), abonos:[pedidoAbono('X1:atraso', {motivo:'Cliente pediu para remarcar para 05/10'})]}}, GESTOR);
  const S = await servidor();
  for (const M of [O, S]) {
    const st = M.statusEntrega(noServidor(e, 'X1'), '2026-09-30', REGRA);
    // Caso ruim: "Com atraso (abonado)" sumia com a data nova (o "Agendado" saía porque o atraso abonado conta dias).
    assert.equal(st.rotulo, 'Com atraso (abonado)');
    assert.match(st.motivo, /abonado por Gestor Teste: Cliente pediu para remarcar para 05\/10; agendada para 05\/10 \(prazo combinado 26\/09\)$/);
  }
});

/* ═══════════════ corretude 12: o custo do status dos cards ═══════════════ */
test('revisão: o status dos cards usa o índice das voltas, feito uma vez por repintura: o custo é linear e a volta é a mesma da busca na lista', async () => {
  const hoje = '2026-10-20';
  const desl = k => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const eqs = [['900001', '900002'], ['900004', '900007'], ['900005', '900008'], ['900009']];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let leituras = 0;
  const todas = [];
  for (let i = 0; i < 1500; i++) {
    const k = Math.floor(rnd() * 61) - 45, d = desl(k);
    const o = {id:'S' + i, numero:'S-' + i, tipo:'externo', instalacao:{data:d, periodo:'Manhã', duracaoDias:1}, equipe:[...eqs[i % 4]], veiculo:'Carro ' + (1 + (i % 4)), valorTotal:1000, prazoCombinado:{data:d, fonte:'agenda'}, itens:[]};
    let rc;
    if (k < 0 && rnd() < 0.8) { const f = desl(k + (rnd() < 0.3 ? 1 : 0)); rc = {dia:f, hora:rnd() < 0.3 ? '15:30' : '16:55', fonte:'lote', em:f + 'T21:00:00Z'}; Object.assign(o, {finalizadaEm:f + 'T20:00:00Z', retornoPrevisto:[{dia:f, hora:'17:00'}]}); }
    // Conta quantas vezes a chegada de cada O.S. é lida: a busca na lista lia a de todas para cada card.
    Object.defineProperty(o, 'retornoConferido', {get:() => { leituras++; return rc; }, enumerable:true});
    todas.push(o);
  }
  const fin = todas.filter(o => o.finalizadaEm);
  await new Promise(r => setTimeout(r, 0));
  leituras = 0;
  // Uma repintura: a volta de cada card entregue, pelo OPERACAO.voltaNaLista da tela.
  const t0 = performance.now();
  const voltas = fin.map(o => O.voltaNaLista(o, todas));
  const sts = fin.map((o, i) => O.statusEntrega(o, hoje, REGRA, voltas[i]));
  const ms = performance.now() - t0;
  // Caso ruim: ~1,3 milhão de leituras (859 cards × 1.500 O.S.); agora a lista é lida uma vez (o índice) e cada card lê a própria volta.
  assert.ok(leituras < 20 * todas.length, `leituras da chegada: ${leituras}`);
  assert.ok(ms < 1000, `${ms.toFixed(1)} ms`);
  // A volta do índice é a mesma da busca na lista, e o índice cai quando a lista muda (outra repintura).
  for (const [i, o] of fin.entries()) if (i % 15 === 0) assert.deepEqual(voltas[i].map(x => x.id).sort(), O.voltaDoRetorno(o, todas, O.chavePessoa).map(x => x.id).sort(), o.id);
  assert.ok(sts.every(s => s && s.estado));
  const nova = {...plano(fin[0]), id:'novo'};
  const lista2 = [...todas, nova];
  assert.ok(O.voltaNaLista(fin[0], lista2).some(x => x.id === 'novo'), 'outra lista, outro índice');
  // Na tela: o STORE conta as gravações (versaoOS), e a O.S. salva no mesmo clique entra na volta certa.
  const b = await montar({os:[daVolta('a', '15:00', chegou('14:00')), daVolta('b', '17:00')]});
  try {
    assert.deepEqual(await b.json(`OPERACAO.voltaNaLista(STORE.getOS('a'), STORE.getAllOS()).map(x => x.id)`), ['a']);
    const v = await b.json(`(() => { const ant = OPERACAO.voltaNaLista(STORE.getOS('a'), STORE.getAllOS()).length; const o = JSON.parse(JSON.stringify(STORE.getOS('b')));
      o.retornoConferido = {dia:'${DIA}', hora:'14:00', fonte:'lote'}; STORE.saveOS(o); return [ant, OPERACAO.voltaNaLista(STORE.getOS('a'), STORE.getAllOS()).map(x => x.id)]; })()`);
    assert.deepEqual(v, [1, ['a', 'b']]);
  } finally { b.fechar(); }
});

/* ═══════════════ corretude 13: toque e textos ═══════════════ */
test('revisão: toque e textos: botões de 40 px nos diálogos, sem a frase repetida, a chegada na linha da instalação sem carro, e "N valendo" só com as perdas', async () => {
  // Os diálogos de abono e de cancelamento (F16) usam o mesmo molde (.ent-form): 40 px.
  const css = ler('styles.css');
  assert.match(css, /\.ent-form \.wpp-acoes button \{ min-height:40px;/);
  // A frase repetida "sem retorno previsto. Sem retorno previsto digitado".
  const t = await tela([daVolta('f1', '17:00', {retornoPrevisto:undefined}), daVolta('f2', '17:00', {...chegou('14:00'), retornoConf:{carroLimpo:'nao', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', por:'Gestor Teste'},
    ocorrencias:[{id:'oc-fichaficticia1', tipo:'equipamento_faltante', item:'Escada', obs:'', fonte:'ficha', dia:DIA, por:'Gestor Teste', em:DIA + 'T21:00:00.000Z'}],
    abonos:[]}), daVolta('f3', '17:00', {...chegou('14:00'), veiculo:'Carro 2', abonos:[{id:'ab-fichaficticia1', ocorrenciaId:'f3:retorno_antecipado:' + DIA, motivo:MOTIVO, por:'Gestor Teste', em:DIA + 'T22:00:00.000Z',
      medida:{dia:DIA, chegada:DIA + 'T14:00', previsto:DIA + 'T17:00'}}]})], GESTOR, '2026-10-06');
  t.abrir('f1');
  const f1 = t.run('statusEntregaFichaHTML(_modalDraft)');
  // Caso ruim: "Retorno antecipado: sem retorno previsto. Sem retorno previsto digitado: não há perda".
  assert.doesNotMatch(f1, /sem retorno previsto\. Sem retorno previsto/i);
  assert.match(f1, /<strong>Retorno antecipado:<\/strong> Sem retorno previsto digitado: não há perda por retorno antecipado\./);
  // "N valendo": antes contava a da volta do carro e a registrada como se valessem.
  t.abrir('f2');
  assert.match(t.run('statusEntregaFichaHTML(_modalDraft)'), /1 perda valendo · 1 da volta do carro · 1 registrada/);
  t.abrir('f3');
  assert.match(t.run('statusEntregaFichaHTML(_modalDraft)'), /0 perdas valendo · 1 abonada/);
  // A instalação sem carro com retorno previsto: o lote pede a chegada NA LINHA, grava e mede.
  const semCarro = B.aberta('sc', {veiculo:'Instalação interna', retornoPrevisto:[{dia:'2026-09-30', hora:'17:00'}]});
  const b = await montar({os:[semCarro]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-30'})`);
    const g = b.run('LOTE.gruposDaTela()[0].chave');
    const faltas = () => b.json(`(() => { const g = LOTE.gruposDaTela()[0]; return LOTE.faltasDaLinha(g.os[0], LOTE.linha('sc'), g, LOTE.grupo(g.chave)); })()`);
    // Caso ruim: a O.S. ficava "não conferida" para sempre (a chegada nem era pedida).
    assert.ok((await faltas()).nota.includes('chegada da equipe'), JSON.stringify(await faltas()));
    const html = b.run(`(() => { const d = {innerHTML:'', querySelector:() => null, querySelectorAll:() => []}; document.getElementById = () => d; LOTE.render(); return d.innerHTML; })()`);
    assert.match(html, /Chegada da equipe \(conferida\) <input type="time" value="" data-lote-campo="chegada-os" data-os="sc"/);
    assert.doesNotMatch(html, /data-lote-campo="chegada" data-grupo/, 'sem carro, a chegada do carro não é pedida');
    for (const a of [{acao:'equipe-ok', grupo:g}, {acao:'chegada-os', os:'sc', valor:'15:00'}, {acao:'entrega-todos', os:'sc'}, {acao:'retrabalho-nao', os:'sc'}, {acao:'confirmar', os:'sc'}]) assert.equal(await b.acao(a), '', JSON.stringify(a));
    assert.ok(!(await faltas()).nota.includes('chegada da equipe'));
    await salvar(b); await b.sincronizar();
    assert.deepEqual(noServidor(b.e, 'sc').chegadasConferidas.map(c => [c.dia, c.hora]), [['2026-09-30', '15:00']]);
    assert.equal(statusNoServidor(b, 'sc').retornoAntecipado.situacao, 'antecipado');
  } finally { b.fechar(); }
});
