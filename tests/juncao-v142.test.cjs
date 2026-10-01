/* JUNÇÃO DA v142: O FECHAR O DIA (F14) COM O STATUS E O CANCELAMENTO (F16) E
   A BAIXA DO ERP QUE RESPEITA A PARCIAL (E7). A F14 foi escrita sem conhecer
   as outras duas; cada teste parte do caso ruim da junção e usa o store de
   verdade (store.js, a fila, os eventos) falando com o pcp-sync de verdade
   (a bancada de tests/helpers/lote-bancada.cjs), e as duas cópias do motor.
   - o lote deixa de fora a O.S. cancelada pela gestão, além da do ERP;
   - o lote não entrega nem marca a O.S. da lista "ERP diz entregue, PCP tem
     saldo" (E7) sem a decisão da gestão;
   - a data sugerida é a mesma no lote e no Lançar entrega (a da E7 e a baixa
     neutra da F16), e a do dia em que a O.S. já conta;
   - o pedido {desfazer:true} numa O.S. cancelada não quebra;
   - o `fecha` do motor: declarada, conferida ou de lote não fecham problema;
     a conferência não entra em O.S. cancelada.
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const B = require('./helpers/lote-bancada.cjs');
const {assert, E, js, esperar, HOJE, GESTOR, OUTRA, erp, aberta, noServidor, montar, salvar, estadoDe, itemDe, declarada, celular,
  PEND, G_ERP, abrirPendencias, naoEConfirma, equipeAguia, elemento} = B;

const MOTIVO = 'Cliente desistiu da fachada fictícia';
const canceladaGravada = {ativo:true, motivo:MOTIVO, por:'Gestor Teste', em:'2026-09-29T10:00:00.000Z'};
const idsDaTela = b => b.json('LOTE.gruposDaTela().flatMap(g => g.os.map(o => o.id))');
const faltas = (b, id) => b.json(`(() => { const g = LOTE.gruposDaTela().find(x => x.os.some(o => o.id === '${id}')); return LOTE.faltasDaLinha(g.os.find(o => o.id === '${id}'), LOTE.linha('${id}'), g, LOTE.grupo(g.chave)); })()`);
// Uma marca da gestão já gravada (dado fictício).
const marca = (id, qtde, dia, extra = {}) => ({id, tipo:'entregue', qtde, dia, via:'gestao', por:'Gestor Teste', em:dia + 'T15:00:00Z', ...extra});
// O painel de mentira: guarda o innerHTML da tela inteira (a tela do lote).
function painel(b) {
  const p = {telas:[], set innerHTML(v) { this.telas.push(String(v)); }, get innerHTML() { return this.telas[this.telas.length - 1] || ''; },
    querySelector:() => null, querySelectorAll:() => [], contains:() => false};
  b.ctx.document.getElementById = id => id === 'panel-entregas' ? p : null;
  return p;
}
// A marca que o servidor grava sozinho (sem subir o rev), como a baixa do ERP da E7: aqui, no banco de mentira.
function gravarNoServidor(b, id, campos) {
  const row = b.e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id);
  Object.assign(row.registro, js(campos));
  row.atualizado_em = new Date().toISOString();
}

/* ─────────────── 1. a cancelada pela gestão fica fora do lote ─────────────── */

test('junção: o lote deixa de fora a O.S. cancelada pela gestão (e a do ERP), no Dia e nas Pendências, e o cabeçalho conta as duas', async () => {
  const os = [aberta('k1', {cancelamento:canceladaGravada}), aberta('k2'),
    erp('k3', {cancelamento:canceladaGravada}), erp('k4'), erp('k5', {baixaAutoERP:{em:'2026-09-28T18:00:00', status:'CANCELADO'}})];
  const b = await montar({os});
  // Caso ruim: antes da junção o Dia listava a k1 (cancelada à mão) e as Pendências, a k3.
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  assert.deepEqual(await idsDaTela(b), ['k2']);
  const p = painel(b);
  b.run('LOTE.render()');
  assert.match(p.innerHTML, /1 cancelada \(no ERP ou pela gestão\) fora do lote/);
  await abrirPendencias(b);
  assert.deepEqual(await idsDaTela(b), ['k4']);
  assert.equal(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').canceladas`), 2, 'a do ERP e a da gestão');
  b.run('LOTE.render()');
  assert.match(p.innerHTML, /2 canceladas \(no ERP ou pela gestão\) fora do lote/);
  assert.match(p.innerHTML, /cancelar é na ficha, com o motivo/, 'o quadro do primeiro uso diz que o lote não cancela');
  b.fechar();
});

test('junção: a linha confirmada no lote não é gravada se a O.S. for cancelada antes do Salvar (o pedido ainda na fila já vale)', async () => {
  const b = await montar({os:[aberta('k2')]});
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  assert.equal(await b.acao({acao:'entrega-todos', os:'k2'}), '');
  await naoEConfirma(b, 'k2');
  // A gestão cancela a O.S. na ficha, sem internet: o pedido fica na cópia e na fila.
  b.nav.onLine = false; b.rede.on = false;
  b.run(`STORE.saveOS({...STORE.getOS('k2'), cancelamento:{cancelar:true, motivo:${JSON.stringify(MOTIVO)}, por:'Gestor Teste', em:new Date().toISOString()}, atualizadoEm:new Date().toISOString()})`);
  assert.deepEqual(await b.json(`LOTE.osDoDia(STORE.getAllOS(), '${HOJE}').map(o => o.id)`), [], 'o pedido de cancelar na fila já tira a O.S. do lote');
  assert.match((await salvar(b)).erro, /Nenhuma linha confirmada/, 'a linha confirmada antes não vai');
  b.nav.onLine = true; b.rede.on = true;
  await b.sincronizar();
  const s = noServidor(b.e, 'k2');
  assert.equal(s.cancelamento.ativo, true);
  assert.ok(!(s.itens || []).some(it => (it.entregas || []).length), 'nenhuma marca de lote numa O.S. cancelada');
  b.fechar();
});

/* ─────────────── 2. a O.S. da lista da E7 se decide em Entregas ─────────────── */

// Aberta, agendada hoje, com 4 de 10 marcados e o ERP dizendo entregue em 29/09.
const E7 = {status:'ENTREGUE', dataEntregue:'2026-09-29', selo:'ENTREGUE|2026-09-29', desde:'2026-09-29T20:00:00.000Z'};
const parcial = id => aberta(id, {itens:[{uid:id + ':1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[marca('m-' + id, 4, '2026-09-29')]},
  {uid:id + ':2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600'}, {uid:id + ':3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}]});

test('junção: a O.S. da lista "ERP diz entregue, PCP tem saldo" não recebe "Todos os itens entregues" nem marca no lote; a linha manda decidir em Entregas', async () => {
  const b = await montar({os:[parcial('e1'), {...parcial('e2'), erpComSaldo:E7}]});
  assert.deepEqual(await b.json('listaErpComSaldo(STORE.getAllOS()).map(x => x.os.id)'), ['e2'], 'a e2 está na lista da E7');
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  assert.deepEqual(await idsDaTela(b), ['e1', 'e2'], 'a linha aparece (retrabalho, equipe e chegada à vista)');
  assert.deepEqual((await faltas(b, 'e2')).trava, ['resposta do retrabalho', 'decida em Entregas, ERP diz entregue']);
  // Caso ruim: antes da junção "Todos os itens entregues" marcava o saldo com o dia do lote, por cima da decisão da E7.
  assert.match(await b.acao({acao:'entrega-todos', os:'e2'}), /decida em Entregas/);
  assert.equal((await b.json(`LOTE.linha('e2')`)).entrega, '');
  assert.match(await b.acao({acao:'parte', os:'e2', uid:'e2:1:1', valor:6}), /decida em Entregas/);
  assert.equal(await b.acao({acao:'retrabalho-nao', os:'e2'}), '');
  assert.match(await b.acao({acao:'confirmar', os:'e2'}), /Falta: decida em Entregas, ERP diz entregue\./);
  // A tela: sem o botão da entrega, com a frase da E7 e o atalho para a lista.
  const p = painel(b);
  b.run('LOTE.render()');
  const linhaE2 = p.innerHTML.slice(p.innerHTML.indexOf('data-lote-linha="e2"'));
  assert.doesNotMatch(linhaE2.slice(0, linhaE2.indexOf('lote-faltas')), /data-lote-acao="entrega-todos"/);
  assert.match(linhaE2, /O ERP diz entregue em 29\/09: decida em Entregas/);
  assert.match(linhaE2, /data-lote-acao="erp-lista"/);
  assert.match(p.innerHTML, /data-lote-acao="entrega-todos" data-os="e1"/, 'a outra O.S. continua com o botão');
  // Depois do "Manter aberta" da gestão, o lote volta a oferecer a entrega (a data do ERP foi recusada).
  assert.equal(await b.json(`manterAbertaSaldoERP('e2', 'ENTREGUE|2026-09-29').erro`), '');
  await b.sincronizar();
  assert.equal(await b.json(`LOTE.erpPendente(STORE.getOS('e2'))`), null);
  assert.equal(await b.acao({acao:'entrega-todos', os:'e2'}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'e2'}), '');
  assert.equal(estadoDe(await salvar(b), 'e2'), 'gravada');
  await b.sincronizar();
  const s = noServidor(b.e, 'e2');
  assert.equal(E.resumoOS(s).situacao, 'completa');
  assert.ok(s.itens[0].entregas.some(m => m.via === 'lote' && m.dia === HOJE && m.qtde === 6), JSON.stringify(s.itens[0].entregas));
  b.fechar();
});

test('junção: a linha confirmada antes da marca do ERP chegar não é gravada no Salvar (o aviso chega pelo servidor, sem subir o rev)', async () => {
  const b = await montar({os:[parcial('e3')]});
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  assert.equal(await b.acao({acao:'entrega-todos', os:'e3'}), '');
  await naoEConfirma(b, 'e3');
  // A baixa do ERP poupa a O.S. (parcial) e grava erpComSaldo; o aparelho puxa.
  gravarNoServidor(b, 'e3', {erpComSaldo:E7});
  await b.run('STORE.pull()');
  assert.deepEqual(await b.json(`STORE.getOS('e3').erpComSaldo`), E7, 'o aparelho recebeu a marca do servidor');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'e3'), 'pulada');
  assert.match(itemDe(rel, 'e3').motivo, /Falta: decida em Entregas, ERP diz entregue\./);
  await b.sincronizar();
  assert.deepEqual(noServidor(b.e, 'e3').itens[0].entregas.map(m => m.id), ['m-e3'], 'nenhuma marca de lote');
  b.fechar();
});

/* ─────────────── 3. uma régua só para a data sugerida ─────────────── */

// O Lançar entrega de verdade (casa.js) nesta bancada: a data que ele propõe.
function lancarPropoe(b, id) {
  const ids = new Map(['lancar-x', 'lancar-form', 'lancar-aloc'].map(k => [k, elemento()]));
  const antes = b.ctx.document.getElementById;
  b.ctx.document.getElementById = k => ids.get(k) || null;
  const n = b.criados.length;
  b.run(`lancarEntregaManual('${id}')`);
  b.ctx.document.getElementById = antes;
  const box = b.criados.slice(n).find(x => /lancar-form/.test(x.innerHTML));
  assert.ok(box, 'o Lançar abriu');
  b.run(`ALOCUI.esquecer('lancar:${id}')`);
  return (/name="data" type="date" required value="([^"]*)"/.exec(box.innerHTML) || [])[1];
}

test('junção: a data sugerida no lote é a mesma do Lançar entrega: a da E7 (data do ERP, última marca) e, na baixa neutra da F16, a agenda', async () => {
  const todos = (id, dia) => [{uid:id + ':1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[marca('t1-' + id, 10, dia)]},
    {uid:id + ':2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600', entregas:[marca('t2-' + id, 1, dia)]},
    {uid:id + ':3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}];
  const baixa30 = {instalacao:{data:'2026-09-27', periodo:'Manhã', duracaoDias:1}, finalizadaEm:'2026-09-30T18:00:00', baixaAutoERP:{em:'2026-09-30T18:00:00', status:'ENTREGUE'}};
  const os = [
    erp('d1', {...baixa30, erpComSaldo:{...E7, dataEntregue:'2026-09-26', selo:'ENTREGUE|2026-09-26'}}),  // a data do ERP (E7)
    erp('d2', baixa30),                                                                                   // baixa neutra (F16): a agenda
    erp('d3', {...baixa30, itens:todos('d3', '2026-09-25')}),                                               // todo item marcado (E7)
  ];
  const b = await montar({os});
  await abrirPendencias(b);
  const esperado = {d1:'2026-09-26', d2:'2026-09-27', d3:'2026-09-25'};
  for (const [id, dia] of Object.entries(esperado)) {
    assert.equal((await b.json(`LOTE.linha('${id}')`)).data, dia, 'lote ' + id);
    assert.equal(await b.json(`LOTE.diaSugerido(STORE.getOS('${id}'))`), dia);
    // Caso ruim: o Lançar propunha o dia da baixa (30/09, a sincronização) para a d2, e o lote, a agenda para a d1.
    assert.equal(lancarPropoe(b, id), dia, 'Lançar ' + id);
    assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('${id}'))`), dia);
  }
  // O Lançar continua citando o dia da baixa pela régua da E7.
  assert.equal(await b.json(`diaDaBaixaERP(STORE.getOS('d2'))`), '2026-09-30');
  assert.equal(await b.json(`diaDaBaixaERP(STORE.getOS('d1'))`), '2026-09-26');
  b.fechar();
});

test('junção: a baixa do ERP de antes do corte sugere o dia em que já conta pela régua da E7 (diaEntrega), e não ganha lançamento calado', async () => {
  // Baixa em 02/09 (antes do corte), com todo item marcado em 29/08: pela E7 ela conta em 29/08 (agosto).
  const it = [{uid:'b2:1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[marca('t1-b2', 10, '2026-08-29')]},
    {uid:'b2:2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600', entregas:[marca('t2-b2', 1, '2026-08-29')]},
    {uid:'b2:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}];
  const b2 = erp('b2', {instalacao:{data:'2026-08-29', periodo:'Manhã', duracaoDias:1}, equipe:['100001', '100002'], itens:it,
    finalizadaEm:'2026-09-02T18:00:00', baixaAutoERP:{em:'2026-09-02T18:00:00', status:'ENTREGUE'}});
  const b = await montar({os:[b2]});
  assert.equal(await b.json(`diaEntrega(STORE.getOS('b2'))`), '2026-08-29');
  // Caso ruim: o lote sugeria 02/09 (o dia da baixa), diferente do dia em que conta, e lançava em setembro calado.
  assert.deepEqual(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-08').os.map(o => o.id)`), ['b2']);
  assert.deepEqual(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').os.map(o => o.id)`), []);
  await b.run(`LOTE.abrir({modo:'pendencias', mes:'2026-08'})`);
  assert.equal((await b.json(`LOTE.linha('b2')`)).data, '2026-08-29');
  await naoEConfirma(b, 'b2');
  assert.equal(estadoDe(await salvar(b), 'b2'), 'gravada');
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'b2').entregaLancada, undefined, 'sem lançamento: a entrega não muda de mês');
  assert.equal(await b.json(`diaEntrega(STORE.getOS('b2'))`), '2026-08-29');
  b.fechar();
});

/* ─────────────── 3b. revisão: a agenda só sugere perto da baixa ─────────────── */

/* O Lançar entrega de verdade, devolvendo a data proposta, a origem escrita ao
   lado do campo e se a origem some quando a data muda. */
function lancarAbre(b, id, outraData) {
  const ids = new Map(['lancar-x', 'lancar-form', 'lancar-aloc'].map(k => [k, elemento()]));
  const antes = b.ctx.document.getElementById;
  b.ctx.document.getElementById = k => ids.get(k) || null;
  const n = b.criados.length;
  b.run(`lancarEntregaManual('${id}')`);
  b.ctx.document.getElementById = antes;
  const box = b.criados.slice(n).find(x => /lancar-form/.test(x.innerHTML));
  assert.ok(box, 'o Lançar abriu');
  const data = (/name="data" type="date" required value="([^"]*)"/.exec(box.innerHTML) || [])[1];
  const origem = (/id="lancar-data-origem">([^<]*)</.exec(box.innerHTML) || [])[1] || '';
  let someAoMudar = null;
  if (outraData) {
    const campo = box.querySelector('#lancar-form input[name="data"]');
    campo.value = outraData;
    campo.onchange();
    someAoMudar = box.querySelector('#lancar-data-origem').hidden === true;
  }
  b.run(`ALOCUI.esquecer('lancar:${id}')`);
  return {data, origem, someAoMudar};
}

test('revisão: a previsão do ERP de meses antes não vira a data sugerida; a agenda só sugere até 7 dias antes da baixa e fora de período fechado, e a origem aparece ao lado do campo', async () => {
  // A O.S. que o importador criou: instalacao.data é a PREVISÃO do ERP, sem agenda do PCP.
  const importada = (id, previsao, baixa) => erp(id, {liberadoPCP:false, veiculo:'', previsaoEntrega:previsao, instalacao:{data:previsao, hora:'', periodo:''},
    finalizadaEm:baixa + 'T18:00:00', baixaAutoERP:{em:baixa + 'T18:00:00', status:'ENTREGUE'}});
  const os = [
    importada('r1', '2026-06-12', '2026-09-25'),   // previsão 3 meses antes da baixa
    importada('r2', '2026-09-26', '2026-09-28'),   // agenda 2 dias antes da baixa
    importada('r3', '2026-09-20', '2026-09-23'),   // agenda 3 dias antes, num período que vai estar fechado
  ];
  const b = await montar({os});
  // Caso ruim: a v142 propunha 12/06 (período fechado, status "No prazo") e o lote a punha nas Pendências de junho.
  assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('r1'))`), '2026-09-25');
  assert.deepEqual(lancarAbre(b, 'r1'), {data:'2026-09-25', origem:'Sugerida pelo dia da baixa do ERP.', someAoMudar:null});
  assert.equal(await b.json(`LOTE.diaSugerido(STORE.getOS('r1'))`), '2026-09-25');
  assert.deepEqual(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-06').os.map(o => o.id)`), []);
  assert.ok((await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').os.map(o => o.id)`)).includes('r1'), 'volta às Pendências de setembro');
  assert.equal(await b.json(`OPERACAO.statusEntrega({...STORE.getOS('r1'), entregaLancada:{data:'2026-09-25', por:'Gestor Teste', em:'2026-09-30T12:00:00Z'}}, '${HOJE}').estado`), 'atraso',
    'aceitar a data sugerida não põe no prazo a O.S. de previsão em junho');
  // A agenda 2 dias antes da baixa continua sugerida, e a origem some quando a pessoa digita outra data.
  assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('r2'))`), '2026-09-26');
  assert.deepEqual(lancarAbre(b, 'r2', '2026-09-27'), {data:'2026-09-26', origem:'Sugerida pela agenda de 26/09.', someAoMudar:true});
  assert.equal(await b.json(`LOTE.diaSugerido(STORE.getOS('r2'))`), '2026-09-26');
  // Sem período fechado conhecido, a r3 sugere a agenda (20/09).
  assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('r3'))`), '2026-09-20');
  // A Performance fecha de 15/09 a 21/09 e o aparelho lê as regras (o "fechado até"): a agenda dentro do fechado cede ao dia da baixa.
  b.e.db.pcp_registros.push({colecao:'performance_fechamentos', id:'2026-09-15:2026-09-21:000001', apagado:false, atualizado_em:'2026-09-22T10:00:00Z',
    registro:{id:'2026-09-15:2026-09-21:000001', de:'2026-09-15', ate:'2026-09-21', revisao:1}});
  await b.run('STORE.pullRegras()');
  assert.equal(await b.json('STORE.regrasLocais().fechadoAte'), '2026-09-21');
  assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('r3'))`), '2026-09-23');
  assert.deepEqual(lancarAbre(b, 'r3'), {data:'2026-09-23', origem:'Sugerida pelo dia da baixa do ERP.', someAoMudar:null});
  assert.equal(await b.json(`LOTE.diaSugerido(STORE.getOS('r3'))`), '2026-09-23');
  // A mesma régua com o período que a Performance consultou (perfRemoto), sem as regras.
  b.run(`perfRemoto.fechamentos = [{de:'2026-09-01', ate:'2026-09-26', revisao:1}]`);
  assert.equal(await b.json(`diaSugeridoDaBaixaERP(STORE.getOS('r2'))`), '2026-09-28', 'a agenda de 26/09 caiu no período consultado');
  b.run('perfRemoto.fechamentos = []');
  // A linha do lote diz de onde veio a data; com outra data no campo, não diz.
  await abrirPendencias(b);
  const p = painel(b);
  b.run('LOTE.render()');
  const linha = id => { const h = p.innerHTML, i = h.indexOf(`data-lote-linha="${id}"`); return h.slice(i, h.indexOf('lote-faltas', i)); };
  assert.match(linha('r1'), /value="2026-09-25"[^>]*><small class="lote-l-origem">sugerida pelo dia da baixa do ERP<\/small>/);
  assert.match(linha('r2'), /value="2026-09-26"[^>]*><small class="lote-l-origem">sugerida pela agenda de 26\/09<\/small>/);
  assert.match(linha('r3'), /<small class="lote-l-origem">sugerida pelo dia da baixa do ERP<\/small>/);
  assert.equal(await b.json(`LOTE.origemSugerida(STORE.getOS('r2'), '2026-09-27')`), '');
  // O retorno registrado segue a mesma janela.
  assert.equal(await b.json(`textoOrigemSugestaoCasa(sugestaoDaBaixaERP({...STORE.getOS('r2'), retornoEm:'2026-09-27T19:00:00.000Z'}))`), 'sugerida pelo retorno de 27/09');
  assert.equal(await b.json(`sugestaoDaBaixaERP({...STORE.getOS('r2'), retornoEm:'2026-09-10T19:00:00.000Z'}).dia`), '2026-09-26', 'retorno de 18 dias antes não vale; a agenda vale');
  b.fechar();
});

/* ─────────────── 4. o pedido {desfazer:true} numa cancelada ─────────────── */

test('junção: o Desfazer do lote na fila e a O.S. cancelada por outra pessoa: o "Sobrescrever" não quebra, o lançamento fica e o aviso diz por quê', async () => {
  const b = await montar({os:PEND()});
  const avisos = [];
  b.ctx.__avisos = avisos;
  b.run(`STORE.on('os-gravada', d => { for (const a of (d && d.avisos) || []) __avisos.push(String(a)); })`);
  await abrirPendencias(b);
  await equipeAguia(b);
  await naoEConfirma(b, 'a1');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'a1'), 'gravada');
  await b.sincronizar();
  const lancada = noServidor(b.e, 'a1').entregaLancada;
  assert.equal(lancada.data, '2026-09-28');
  // Sem internet, o Desfazer do lote fica na fila com o pedido {desfazer:true}.
  b.nav.onLine = false; b.rede.on = false;
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.equal(itemDe(des, 'a1').desfazer.estado, 'na-fila');
  assert.deepEqual(await b.json(`STORE.getOS('a1').entregaLancada`), {desfazer:true});
  // Outra gestora cancela a O.S. no servidor.
  const srv = noServidor(b.e, 'a1');
  // (O carimbo dela é outro: o mesmo milésimo do Desfazer passaria por reenvio da mesma gravação.)
  const c = await b.e.call({action:'upsert', os:{...srv, cancelamento:{cancelar:true, motivo:MOTIVO}, atualizadoEm:new Date(Date.now() + 1000).toISOString()}}, OUTRA);
  assert.equal(c.status || 200, 200, JSON.stringify(c));
  assert.equal(noServidor(b.e, 'a1').cancelamento.ativo, true);
  // A rede volta: o rev mudou, e o aparelho recebe o aviso de conflito.
  b.nav.onLine = true; b.rede.on = true;
  const conflitos = [];
  b.ctx.__conflitos = conflitos;
  b.run(`STORE.onConflict((l, r) => __conflitos.push(r && r.id))`);
  // A sincronização que o store já agendou pode estar no meio: espera a resposta do servidor.
  for (let i = 0; i < 40 && !conflitos.length; i++) { await b.run('STORE.trySync()'); await esperar(5); }
  assert.deepEqual(conflitos, ['a1']);
  // "Sobrescrever": vai o pedido {desfazer:true} com o rev do servidor, numa O.S. cancelada.
  b.run(`STORE.sobrescreverServidor(STORE.getOS('a1'))`);
  await b.sincronizar();
  assert.deepEqual(await b.json('STORE.getQueue()'), [], 'a fila esvaziou: nada de 422 preso');
  const s = noServidor(b.e, 'a1');
  assert.deepEqual(s.entregaLancada, lancada, 'numa cancelada o lançamento fica o gravado');
  assert.equal(s.cancelamento.ativo, true, 'a cópia sem o cancelamento não o desfaz');
  assert.ok(avisos.includes('O lançamento da entrega não foi desfeito: a O.S. está cancelada. Para desfazer, desfaça o cancelamento da O.S.'), JSON.stringify(avisos));
  assert.ok(!avisos.some(a => /A entrega não foi lançada/.test(a)), 'o aviso de desfazer não fala em lançar');
  // A cópia do aparelho adota o servidor: lançada e cancelada; fora da fila "a lançar" e fora do lote.
  const local = await b.json(`STORE.getOS('a1')`);
  assert.equal(local.entregaLancada.data, '2026-09-28');
  assert.equal(await b.json(`OPERACAO.cancelada(STORE.getOS('a1'))`), true);
  assert.deepEqual(await b.json(`classificarEntregas(STORE.getAllOS()).canceladas.map(o => o.id)`), ['a1']);
  assert.equal(await b.json(`OPERACAO.statusEntrega(STORE.getOS('a1'), '${HOJE}').estado`), 'cancelado');
  assert.ok(!(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').os.map(o => o.id)`)).includes('a1'));
  // O Desfazer de novo não pede para tirar o lançamento da cancelada, e diz por quê.
  const des2 = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.match(itemDe(des2, 'a1').desfazer.motivo, /a O\.S\. foi cancelada depois do lote e o lançamento fica/);
  assert.deepEqual(await b.json('STORE.getQueue()'), []);
  b.fechar();
});

test('junção: o Desfazer e o cancelamento no mesmo envio (sem internet): o lançamento sai, a O.S. fica cancelada, e a cópia local não quebra', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  await naoEConfirma(b, 'a2');
  const rel = await salvar(b);
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'a2').entregaLancada.data, '2026-09-28');
  b.nav.onLine = false; b.rede.on = false;
  await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  // Depois do Desfazer, a gestão cancela a O.S. na ficha, ainda sem internet: a fila junta os dois pedidos.
  b.run(`STORE.saveOS({...STORE.getOS('a2'), cancelamento:{cancelar:true, motivo:${JSON.stringify(MOTIVO)}, por:'Gestor Teste', em:new Date().toISOString()}, atualizadoEm:new Date().toISOString()})`);
  const q = await b.json('STORE.getQueue()');
  assert.equal(q.length, 1);
  assert.deepEqual([q[0].os.entregaLancada, q[0].os.cancelamento.cancelar], [{desfazer:true}, true]);
  // A cópia local com os dois pedidos: nada quebra, e ela sai da fila "a lançar" e do lote.
  assert.equal(await b.json(`OPERACAO.entregaLancadaValida(STORE.getOS('a2'))`), null);
  assert.equal(await b.json(`OPERACAO.statusEntrega(STORE.getOS('a2'), '${HOJE}').estado`), 'cancelado');
  assert.deepEqual(await b.json(`classificarEntregas(STORE.getAllOS()).canceladas.map(o => o.id)`), ['a2']);
  assert.equal(await b.json(`diaEntrega(STORE.getOS('a2'))`), '2026-09-28');
  assert.ok(!(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').os.map(o => o.id)`)).includes('a2'));
  // A rede volta: o cancelamento pedido no mesmo envio só vale depois da gravação (F16), e o Desfazer entra.
  b.nav.onLine = true; b.rede.on = true;
  await b.sincronizar();
  const s = noServidor(b.e, 'a2');
  assert.equal(s.entregaLancada, null, 'o Desfazer valeu');
  assert.equal(s.cancelamento.ativo, true, 'e a O.S. ficou cancelada');
  assert.deepEqual(await b.json('STORE.getQueue()'), []);
  b.fechar();
});

/* ─────────────── 5. o fecha do motor e a conferência em cancelada ─────────────── */

test('junção: o fecha do motor junta E5, E7 e F14 (declarada, conferida e de lote não fecham problema; a da gestão fecha), nas duas cópias', async () => {
  const M = (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
  const problema = {id:'p-1', tipo:'problema', motivo:'faltou o suporte das 4', dia:'2026-09-27', via:'gestao', por:'Gestor Teste', em:'2026-09-27T20:00:00Z'};
  const item = entregas => ({uid:'u0', item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000', entregas});
  // A marca de lote que entrou ANTES do problema, com dia depois dele (o tablet sem rede subiu o problema de ontem depois).
  const lote = {id:'l-1', tipo:'entregue', qtde:3, dia:'2026-09-28', via:'lote', por:'Gestor Teste', em:'2026-09-28T20:00:00Z'};
  const gestao = {...lote, id:'g-1', via:'gestao'};
  const conferido = {id:'c-1', tipo:'conferido', alvo:'d-1', dia:'2026-09-29', via:'lote', por:'Gestor Teste', em:'2026-09-29T20:00:00Z'};
  for (const X of [E, M]) {
    const os = it => ({id:'x', tipo:'externo', valorTotal:1000, finalizadaEm:'', itens:[it]});
    const sit = entregas => { const it = item(entregas); return X.situacaoItem(it, os(it)).situacao; };
    assert.equal(sit([lote, problema]), 'problema', 'a marca de lote não fecha o problema (E7)');
    assert.equal(sit([declarada('d-1', 3, '2026-09-28'), problema]), 'problema', 'a declarada não fecha (E5)');
    assert.equal(sit([declarada('d-1', 3, '2026-09-28'), problema, conferido]), 'problema', 'nem conferida (F14)');
    assert.equal(sit([gestao, problema]), 'parcial', 'a marca da gestão no item fecha, como antes');
    // A porta recusa a marca de lote com o problema aberto (revisão da E7), nas duas cópias.
    const it = item([problema]);
    assert.match(X.validarEvento({id:'l-2', tipo:'entregue', qtde:2, dia:'2026-09-29', via:'lote'}, it, {papel:'pcp', os:os(it), hoje:'2026-09-29'}).erro, /problema aberto/);
  }
});

test('junção: a conferência do Fechar o dia (e o desfazer dela) não entra em O.S. cancelada, à mão ou no ERP; na finalizada que vale, entra', async () => {
  const M = (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
  for (const X of [E, M]) {
    const base = js(celular());
    const conf = os => X.validarEvento({id:'c-9', tipo:'conferido', alvo:'d-1', dia:'2026-09-30', via:'lote'}, os.itens[0], {papel:'pcp', os, hoje:'2026-09-30'});
    assert.equal(conf(base).ok, true, 'a finalizada pelo celular recebe a conferência');
    assert.match(conf({...base, cancelamento:canceladaGravada}).erro, /O\.S\. cancelada: desfaça o cancelamento/);
    const erpCanc = {...base, finalizadoPor:'Mubisys (auto)', baixaAutoERP:{em:base.finalizadaEm, status:'CANCELADO'}};
    assert.match(conf(erpCanc).erro, /cancelada no ERP/);
    // O desfazer de uma conferência já gravada também não entra na cancelada.
    const conferida = js(base);
    conferida.itens[0].entregas.push({id:'c-1', tipo:'conferido', alvo:'d-1', dia:'2026-09-30', via:'lote'});
    const desf = os => X.validarEvento({id:'x-1', tipo:'desfeito', alvo:'c-1', motivo:'engano', dia:'2026-09-30', via:'lote'}, os.itens[0], {papel:'pcp', os, hoje:'2026-09-30'});
    assert.equal(desf(conferida).ok, true, desf(conferida).erro);
    assert.equal(desf({...conferida, cancelamento:canceladaGravada}).ok, false);
  }
  // E pelo lote e pelo servidor: a finalizada pelo celular e cancelada não aparece para conferir.
  const b = await montar({os:[celular({cancelamento:canceladaGravada})]});
  await abrirPendencias(b);
  assert.deepEqual(await idsDaTela(b), []);
  b.fechar();
});

test('junção: sem caractere combinante nem travessão nos arquivos da junção', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const f of ['lote.js', 'casa.js', 'entrega-item.js', 'supabase/functions/_shared/pcp-entrega-item.mjs', 'supabase/functions/_shared/pcp-integridade.mjs']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(s, /[\u0300-\u036f]/, f + ': caractere combinante literal');
  }
  const lote = fs.readFileSync(path.join(__dirname, '..', 'lote.js'), 'utf8');
  for (const trecho of [/decida em Entregas[^'`]*/g, /cancelada depois do lote[^'`]*/g, /cancelar é na ficha[^'`]*/g]) for (const m of lote.match(trecho) || []) assert.doesNotMatch(m, /—/, m);
});
