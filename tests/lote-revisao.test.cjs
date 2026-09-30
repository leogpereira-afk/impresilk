/* FECHAR O DIA (F14): AS CORREÇÕES DAS DUAS REVISÕES ADVERSARIAIS (30/09/2026).
   Cada teste parte do caso ruim que a revisão provou e usa o store de
   verdade (store.js, a fila, os eventos) falando com o pcp-sync de verdade
   (a bancada de tests/helpers/lote-bancada.cjs). Corretude: a participação
   antiga confirmada (70/30) trocada pela sugestão (60/40); a equipe que a
   linha confirmava por tabela; a baixa do ERP lançada no dia da baixa; a
   baixa de antes do corte mudando de mês; os atalhos com a ficha aberta; a
   volta falsa das baixas sem carro e sem equipe; o cabeçalho que contava a
   baixa já lançada como "a lançar"; a tela inteira repintada a cada toque;
   o travessão. Servidor: o Desfazer que apagava a foto e a observação de
   outra pessoa; o Desfazer depois da resposta perdida; a conferência que
   fechava o problema da gestão; o rascunho que ficava ao sair com fila; o
   pedido {desfazer:true} lido como lançamento na cópia local.
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const B = require('./helpers/lote-bancada.cjs');
const {assert, O, E, ler, js, esperar, HOJE, CFG, EQUIPES, OUTRA, erp, pcpFim, noServidor, montar, salvar, estadoDe, itemDe, declarada, celular,
  PEND, G_ERP, G_P1, abrirPendencias, naoEConfirma, equipeAguia, projecao, osRow, FICHAS, edge} = B;

// O que a Performance diz da O.S. (a mesma régua da apuração).
const perf = (b, id) => b.json(`(() => { const r = perfRegistro(STORE.getOS('${id}'), perfConfig()); return {confirmado:r.confirmado, fonte:r.fonte, membros:r.membros.map(m => [m.chave, m.percentual])}; })()`);
const idsDaTela = b => b.json('LOTE.gruposDaTela().flatMap(g => g.os.map(o => o.id))');
const cotas = (b, grupo) => b.json(`(() => { const st = ALOCUI.estado(LOTE.chaveAloc({chave:${JSON.stringify(grupo)}})); return st.aloc.grupos[0].membros.map(m => [m.pessoaId, m.cota]); })()`);
const faltas = (b, id) => b.json(`(() => { const g = LOTE.gruposDaTela().find(x => x.os.some(o => o.id === '${id}')); return LOTE.faltasDaLinha(g.os.find(o => o.id === '${id}'), LOTE.linha('${id}'), g, LOTE.grupo(g.chave)); })()`);

/* O PAINEL DE MENTIRA: guarda cada innerHTML da tela inteira e devolve, para
   qualquer seletor, um nó que anota o outerHTML e o innerHTML que recebeu
   (a repintura de um pedaço). */
function painelFalso(b) {
  const nos = new Map();
  const no = sel => ({sel, outer: [], inner: [], classList: {add() {}, remove() {}}, focus() {},
    set outerHTML(v) { this.outer.push(String(v)); }, get outerHTML() { return this.outer[this.outer.length - 1] || ''; },
    set innerHTML(v) { this.inner.push(String(v)); }, get innerHTML() { return this.inner[this.inner.length - 1] || ''; }});
  const p = {telas: [], onclick: null, onchange: null,
    set innerHTML(v) { this.telas.push(String(v)); nos.clear(); }, get innerHTML() { return this.telas[this.telas.length - 1] || ''; },
    querySelector(sel) { if (!nos.has(sel)) nos.set(sel, no(sel)); return nos.get(sel); }, querySelectorAll: () => [], contains: () => false, no: sel => nos.get(sel) || null};
  b.ctx.document.getElementById = id => id === 'panel-entregas' ? p : null;
  return p;
}
// O botão da tela que a pessoa toca (dentro da linha).
const botao = (dataset, linhaId) => {
  const linha = {getAttribute: k => k === 'data-lote-linha' ? linhaId : null};
  const el = {dataset, disabled: false, closest: sel => sel === '[data-lote-acao]' ? el : sel === '[data-lote-linha]' ? (linhaId ? linha : null) : null};
  return el;
};

/* ───────────────────────────── corretude ───────────────────────────── */

test('revisão: a O.S. com participação antiga confirmada (70/30) não é pendência, e no Dia confirmar a linha não a troca pela sugestão (60/40)', async () => {
  const part = {id:'p1', numero:'7p1', membros:[{chave:'100005', nome:'Eva', percentual:70}, {chave:'100003', nome:'Caio', percentual:30}], em:'2026-09-29T21:00:00.000Z', por:'Gestor Teste'};
  const cfg = {...js(CFG), performancePCP:{equipes:js(EQUIPES), participacoes:[part]}};
  const b = await montar({os:[pcpFim('p1'), erp('a1')], cfg});
  assert.deepEqual(await perf(b, 'p1'), {confirmado:true, fonte:'participacao', membros:[['100005', 70], ['100003', 30]]});
  // (a) Nas Pendências ela não aparece: já está confirmada (a mesma régua da Performance).
  await abrirPendencias(b);
  assert.deepEqual(await idsDaTela(b), ['a1'], 'a O.S. com participação que vale não é pendência');
  // (c) No Dia ela aparece, e o componente parte da participação, não da sugestão.
  await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-29'})`);
  assert.deepEqual(await idsDaTela(b), ['p1']);
  assert.deepEqual(await cotas(b, G_P1), [['100005', 7000], ['100003', 3000]], 'o 70/30 que já valia, não o 60/40 da sugestão');
  assert.ok(!(await faltas(b, 'p1')).nota.some(n => /equipe não conferida/.test(n)), 'a equipe já está confirmada pela participação');
  // (b) Confirmar a linha grava o resto e NÃO grava a equipe: a participação continua valendo.
  await naoEConfirma(b, 'p1');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'p1'), 'gravada', JSON.stringify(itemDe(rel, 'p1')));
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'p1').alocacao, undefined, 'nenhuma divisão foi gravada por tabela');
  assert.equal(noServidor(b.e, 'p1').retrabalhoPerguntado.resposta, 'nao');
  await b.run('STORE.pull()');
  assert.deepEqual(await perf(b, 'p1'), {confirmado:true, fonte:'participacao', membros:[['100005', 70], ['100003', 30]]});
  // "✓ Equipe certa" grava a divisão com a mesma conta que valia (70/30), agora dentro da O.S.
  assert.equal(await b.acao({acao:'equipe-ok', grupo:G_P1}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'p1'}), '');
  const rel2 = await salvar(b);
  assert.equal(estadoDe(rel2, 'p1'), 'gravada', JSON.stringify(itemDe(rel2, 'p1')));
  await b.sincronizar();
  const a = noServidor(b.e, 'p1').alocacao;
  assert.deepEqual(a.final.map(f => [f.pessoaId, f.cota]), [['100005', 7000], ['100003', 3000]]);
  assert.equal(a.grupos[0].equipeId, 'eq-leao');
  await b.run('STORE.pull()');
  assert.deepEqual(await perf(b, 'p1'), {confirmado:true, fonte:'alocacao', membros:[['100005', 70], ['100003', 30]]});
  b.fechar();
});

test('revisão: confirmar a linha não grava a equipe; só "✓ Equipe certa" grava, e até lá a linha diz "equipe não conferida"', async () => {
  const b = await montar({os:[pcpFim('p1')]});
  await abrirPendencias(b);
  await naoEConfirma(b, 'p1');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'p1'), 'gravada');
  await b.sincronizar();
  const s = noServidor(b.e, 'p1');
  assert.equal(s.alocacao, undefined, 'confirmar a linha não gravou a divisão sugerida');
  assert.deepEqual(s.equipe, ['100005', '100003'], 'a equipe da O.S. ficou como estava');
  assert.equal((await b.json(`LOTE.grupo(${JSON.stringify(G_P1)})`)).equipeConfirmada, false, 'a linha não confere a equipe por tabela');
  assert.ok(itemDe(rel, 'p1').avisos.some(a => /^Equipe não conferida/.test(a)), JSON.stringify(itemDe(rel, 'p1').avisos));
  assert.ok((await faltas(b, 'p1')).nota.some(n => /^equipe não conferida/.test(n)), 'depois de salvar, a linha diz que a equipe não foi conferida');
  // A equipe conferida vai no próximo Salvar.
  assert.equal(await b.acao({acao:'equipe-ok', grupo:G_P1}), '');
  assert.ok(!(await faltas(b, 'p1')).nota.some(n => /equipe não conferida/.test(n)));
  assert.equal(await b.acao({acao:'confirmar', os:'p1'}), '');
  assert.equal(estadoDe(await salvar(b), 'p1'), 'gravada');
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'p1').alocacao.grupos[0].equipeId, 'eq-leao');
  b.fechar();
});

test('revisão: no Dia, a baixa do ERP a lançar entra só no dia sugerido (o da agenda), com essa data, e não no dia da baixa', async () => {
  // Instalação em 27/09; o ERP baixou em 30/09 (hoje).
  const z1 = erp('z1', {instalacao:{data:'2026-09-27', periodo:'Manhã', duracaoDias:1}, equipe:['100001', '100002'], veiculo:'Carro 1',
    finalizadaEm:'2026-09-30T18:00:00', baixaAutoERP:{em:'2026-09-30T18:00:00', status:'ENTREGUE'}});
  const b = await montar({os:[z1]});
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  assert.deepEqual(await idsDaTela(b), [], 'no dia da baixa ela não aparece');
  assert.deepEqual(await b.json(`LOTE.osDoDia(STORE.getAllOS(), '${HOJE}').map(o => o.id)`), []);
  await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-27'})`);
  assert.deepEqual(await b.json('LOTE.gruposDaTela().map(g => [g.chave, g.os.map(o => o.id)])'), [['2026-09-27|carro 1|100001+100002', ['z1']]]);
  assert.equal((await b.json(`LOTE.linha('z1')`)).data, '2026-09-27');
  await naoEConfirma(b, 'z1');
  assert.equal(estadoDe(await salvar(b), 'z1'), 'gravada');
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'z1').entregaLancada.data, '2026-09-27', 'a entrega fica no dia da instalação');
  b.fechar();
});

test('revisão: a baixa do ERP de antes do corte fica no mês em que já conta e não ganha lançamento, a não ser que a data mude', async () => {
  // Instalação em 29/08, baixa do ERP em 02/09 (antes do corte de 15/09): já conta como entregue em setembro, sem lançamento.
  const b1 = erp('b1', {instalacao:{data:'2026-08-29', periodo:'Manhã', duracaoDias:1}, equipe:['100001', '100002'], veiculo:'Carro 1',
    finalizadaEm:'2026-09-02T18:00:00', baixaAutoERP:{em:'2026-09-02T18:00:00', status:'ENTREGUE'}});
  const b = await montar({os:[b1]});
  assert.equal(await b.json(`diaEntrega(STORE.getOS('b1'))`), '2026-09-02');
  assert.deepEqual(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-09').os.map(o => o.id)`), ['b1'], 'pendência do mês em que já conta');
  assert.deepEqual(await b.json(`LOTE.osPendentes(STORE.getAllOS(), '2026-08').os.map(o => o.id)`), [], 'não no mês da agenda');
  await abrirPendencias(b);
  assert.equal((await b.json(`LOTE.linha('b1')`)).data, '2026-09-02');
  await naoEConfirma(b, 'b1');
  assert.equal(estadoDe(await salvar(b), 'b1'), 'gravada');
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'b1').entregaLancada, undefined, 'sem lançamento: a entrega não muda de mês');
  assert.equal(await b.json(`diaEntrega(STORE.getOS('b1'))`), '2026-09-02');
  // A pessoa muda a data de propósito: aí sim, lança.
  assert.equal(await b.acao({acao:'data', os:'b1', valor:'2026-08-29'}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'b1'}), '');
  assert.equal(estadoDe(await salvar(b), 'b1'), 'gravada');
  await b.sincronizar();
  assert.equal(noServidor(b.e, 'b1').entregaLancada.data, '2026-08-29');
  b.fechar();
});

test('revisão: os atalhos não disparam com a ficha, a entrega por item ou outro diálogo por cima, nem com a tecla vinda de fora do lote', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  assert.equal(await b.acao({acao:'retrabalho-nao', os:'a1'}), '');
  b.run(`LOTE.estado().foco = 'a1'`);
  const raiz = {tagName:'DIV', getAttribute:() => null, closest:() => null};
  const linha = id => { const el = {tagName:'DIV', getAttribute:k => k === 'data-lote-linha' ? id : null, closest:sel => sel === '#lote-raiz' ? raiz : el}; return el; };
  const campoDoLote = {tagName:'INPUT', getAttribute:() => null, closest:sel => sel === '#lote-raiz' ? raiz : sel === '[data-lote-linha]' ? linha('a1') : null};
  const botaoDaFicha = {tagName:'BUTTON', getAttribute:() => null, closest:() => null};
  const tecla = (key, target, extra = {}) => { b.ctx.__ev = {key, target, preventDefault() {}, ...extra}; return b.run('LOTE.teclado(__ev)'); };
  const doc = b.ctx.document;
  const semDialogo = () => { doc.getElementById = () => null; doc.querySelector = () => null; doc.querySelectorAll = () => []; };
  const nada = async () => {
    assert.equal((await b.json(`LOTE.linha('a1')`)).confirmada, false, 'nada confirmado');
    assert.equal(await b.json('LOTE.estado().foco'), 'a1', 'o foco não andou');
    assert.equal(await b.json('LOTE.relatorios().length'), 0, 'nada salvo');
    assert.equal(await b.json('STORE.getQueue().length'), 0);
  };
  // A ficha aberta por cima do lote (#modal-overlay sem .hidden): Ctrl+Enter num campo dela, setas e Enter.
  doc.querySelector = s => s === '#modal-overlay:not(.hidden)' ? {} : null;
  assert.equal(tecla('Enter', campoDoLote, {ctrlKey:true}), '');
  assert.equal(tecla('ArrowDown', linha('a1')), '');
  assert.equal(tecla('Enter', linha('a1')), '');
  await nada();
  // A entrega por item (#entrega-item-box), um <dialog open> e um [aria-modal=true] visível.
  semDialogo(); doc.getElementById = id => id === 'entrega-item-box' ? {} : null;
  assert.equal(tecla('Enter', linha('a1')), '');
  semDialogo(); doc.querySelector = s => s === 'dialog[open]' ? {} : null;
  assert.equal(tecla('ArrowDown', linha('a1')), '');
  semDialogo(); doc.querySelectorAll = s => s === '[aria-modal="true"]' ? [{hidden:false, closest:() => null, getClientRects:() => [{}]}] : [];
  assert.equal(tecla('Enter', linha('a1')), '');
  await nada();
  // Sem diálogo, a tecla que nasce fora do lote (o botão de uma ficha que não se anunciou) não é do lote.
  semDialogo();
  assert.equal(tecla('ArrowDown', botaoDaFicha), '');
  assert.equal(tecla('Enter', botaoDaFicha, {ctrlKey:true}), '');
  await nada();
  // O [aria-modal] escondido não conta; no body (nada em foco) e dentro do lote, os atalhos valem.
  doc.querySelectorAll = s => s === '[aria-modal="true"]' ? [{hidden:false, closest:() => null, getClientRects:() => []}] : [];
  assert.equal(tecla('ArrowDown', doc.body), 'foco');
  assert.equal(await b.json('LOTE.estado().foco'), 'a2');
  assert.equal(tecla('ArrowUp', linha('a2')), 'foco');
  assert.equal(tecla('Enter', linha('a1')), 'confirmar');
  assert.equal((await b.json(`LOTE.linha('a1')`)).confirmada, true);
  b.fechar();
});

test('revisão: baixas do ERP sem carro e sem equipe não viram uma volta só; sem carro informado, a chegada e a conferência não são pedidas', async () => {
  const os = ['v1', 'v2', 'v3'].map(id => erp(id, {veiculo:''}));
  const b = await montar({os:[...os, erp('w1', {veiculo:'', equipe:['100001', '100002']}), erp('w2', {veiculo:'', equipe:['100002', '100001']})]});
  await abrirPendencias(b);
  const gs = await b.json('LOTE.gruposDaTela().map(g => [g.chave, g.os.map(o => o.id)])');
  assert.deepEqual(gs, [['2026-09-28||100001+100002', ['w1', 'w2']], ['2026-09-28||os:v1', ['v1']], ['2026-09-28||os:v2', ['v2']], ['2026-09-28||os:v3', ['v3']]],
    'cada baixa sem carro e sem equipe é a própria volta; com a mesma equipe, a volta continua uma');
  for (const id of ['v1', 'w1']) {
    const n = (await faltas(b, id)).nota;
    assert.ok(!n.includes('chegada do carro') && !n.includes('conferência da volta'), `${id}: ${JSON.stringify(n)}`);
  }
  // Na tela, a conferência dessas voltas fica fechada ("não é pedida"), e dá para abrir.
  const painel = painelFalso(b);
  b.run('LOTE.render()');
  assert.equal((painel.innerHTML.match(/Carro não informado: não é pedida\./g) || []).length, 4, 'as quatro voltas sem carro');
  // A equipe da v1 não vai para a v2.
  await equipeAguia(b, '2026-09-28||os:v1');
  await naoEConfirma(b, 'v1'); await naoEConfirma(b, 'v2');
  const rel = await salvar(b);
  assert.deepEqual(['v1', 'v2'].map(id => estadoDe(rel, id)), ['gravada', 'gravada']);
  await b.sincronizar();
  assert.deepEqual(noServidor(b.e, 'v1').equipe, ['100001', '100002']);
  assert.deepEqual(noServidor(b.e, 'v2').equipe, []);
  // A instalação interna (sem carro) sem equipe também não junta.
  const interna = id => erp(id, {veiculo:O.SEM_CARRO});
  assert.deepEqual(O.agruparPorVolta([interna('i1'), interna('i2')], o => O.dia(o.finalizadaEm)).map(g => g.os.map(o => o.id)), [['i1'], ['i2']]);
  b.fechar();
});

test('revisão: o cabeçalho das Pendências conta as baixas a lançar pela régua da fila (a baixa já lançada sem divisão é instalação sem divisão)', async () => {
  const b2 = erp('b2', {equipe:['100005', '100003'], veiculo:'Carro 2', instalacao:{data:'2026-09-20', periodo:'Manhã', duracaoDias:1},
    finalizadaEm:'2026-09-22T18:00:00', baixaAutoERP:{em:'2026-09-22T18:00:00', status:'ENTREGUE'}, entregaLancada:{data:'2026-09-20', por:'Gestor Teste', em:'2026-09-23T10:00:00.000Z'}});
  const b = await montar({os:[erp('a1'), b2]});
  await abrirPendencias(b);
  const painel = painelFalso(b);
  b.run('LOTE.render()');
  assert.match(painel.innerHTML, /1 instalação entregue sem divisão e 1 baixa do ERP a lançar em set\/2026/);
  const p = await b.json(`(() => { const r = LOTE.osPendentes(STORE.getAllOS(), '2026-09'); return {ids:r.os.map(o => o.id), aLancar:r.aLancar, semDivisao:r.semDivisao}; })()`);
  assert.deepEqual(p, {ids:['a1', 'b2'], aLancar:1, semDivisao:1});
  b.fechar();
});

test('revisão: um toque na linha repinta só a linha (e as contas); o toque na volta, só a volta; a tela inteira só ao abrir', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  const painel = painelFalso(b);
  b.run('LOTE.render()');
  assert.equal(painel.telas.length, 1);
  const tocar = (ds, linhaId) => { b.ctx.__t = botao(ds, linhaId); b.run('document.getElementById("panel-entregas").onclick({target:__t})'); };
  const linhaA1 = '[data-lote-linha="a1"]';
  tocar({loteAcao:'retrabalho-nao', os:'a1'}, 'a1');
  assert.equal(painel.telas.length, 1, 'o "Não" não repintou a tela inteira');
  assert.equal(painel.no(linhaA1).outer.length, 1);
  assert.match(painel.no(linhaA1).outerHTML, /data-lote-acao="retrabalho-nao"[^>]*>Não/);
  assert.match(painel.no(linhaA1).outerHTML, /aria-pressed="true" data-lote-acao="retrabalho-nao"/);
  tocar({loteAcao:'confirmar', os:'a1'}, 'a1');
  assert.equal(painel.telas.length, 1, 'confirmar não repintou a tela inteira');
  assert.match(painel.no(linhaA1).outerHTML, /class="lote-linha confirmada/);
  assert.match(painel.no('.lote-rodape').innerHTML, /1 linha confirmada para salvar/);
  assert.match(painel.no('.lote-resumo').innerHTML, /<strong>1<\/strong> confirmada/);
  // A data (campo) e a volta (grupo).
  b.ctx.__t = {value:'2026-09-27', dataset:{loteCampo:'data', os:'a2'}};
  b.run('document.getElementById("panel-entregas").onchange({target:__t})');
  assert.equal(painel.no('[data-lote-linha="a2"]').outer.length, 1);
  assert.equal((await b.json(`LOTE.linha('a2')`)).data, '2026-09-27');
  tocar({loteAcao:'volta', grupo:G_ERP, k:'carroLimpo', v:'sim'}, '');
  assert.equal(painel.no(`[data-lote-grupo="${G_ERP}"]`).outer.length, 1);
  assert.equal(painel.telas.length, 1, 'nenhum toque repintou a tela inteira');
  b.fechar();
});

test('revisão: o texto da ajuda que a F14 editou não tem travessão', () => {
  const linha = ler('app.js').split('\n').find(l => l.includes('Fechar o dia') && l.includes('<strong>Entrega</strong>'));
  assert.ok(linha, 'a linha da barra lateral que fala do Fechar o dia');
  assert.ok(!linha.includes('—'), linha);
});

/* ───────────────────────────── servidor, motor e dados ───────────── */

test('revisão: o Desfazer devolve as quatro respostas da volta e mantém a observação e as fotos que outra pessoa pôs depois', async () => {
  const b = await montar({os:[erp('a1')]});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const k of ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria']) assert.equal(await b.acao({acao:'volta', grupo:G_ERP, k, v:'sim'}), '');
  await naoEConfirma(b, 'a1');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'a1'), 'gravada');
  // Outro PC põe a foto da volta e uma observação, sem mexer nas respostas.
  const o = noServidor(b.e, 'a1');
  o.retornoConf = {...o.retornoConf, fotos:['foto-volta-1.jpg'], obs:'retrovisor riscado, ver foto'};
  assert.equal((await b.e.call({action:'upsert', os:o}, OUTRA)).status, 200);
  await b.run('STORE.pull()');
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.equal(itemDe(des, 'a1').desfazer.estado, 'gravada', JSON.stringify(itemDe(des, 'a1').desfazer));
  await b.sincronizar();
  const rc = noServidor(b.e, 'a1').retornoConf;
  assert.deepEqual(rc.fotos, ['foto-volta-1.jpg'], 'a foto de outra pessoa fica');
  assert.equal(rc.obs, 'retrovisor riscado, ver foto', 'a observação de outra pessoa fica');
  assert.deepEqual(O.PERGUNTAS_VOLTA.map(k => O.respostaVolta(rc[k])), ['', '', '', ''], 'as quatro respostas voltam ao antes');
  assert.equal(noServidor(b.e, 'a1').entregaLancada, null);
  b.fechar();
});

test('revisão: com a resposta perdida, o Desfazer espera a gravação do lote na fila, não a troca, e desfaz depois que ela sobe', async () => {
  const os = [erp('a1'), erp('a2')];
  const b = await montar({os});
  const antes = Object.fromEntries(os.map(o => [o.id, projecao(noServidor(b.e, o.id))]));
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const o of os) await naoEConfirma(b, o.id);
  // O servidor grava, mas a resposta se perde no caminho.
  const call = b.e.call.bind(b.e);
  let perder = true;
  b.e.call = async (body, quem) => { const r = await call(body, quem); if (perder && body.action === 'upsert') throw new TypeError('Failed to fetch'); return r; };
  const rel = await b.json('LOTE.salvar({prazoMs:300, passoMs:5})');
  assert.deepEqual(rel.itens.map(i => i.estado), ['na-fila', 'na-fila']);
  assert.equal(noServidor(b.e, 'a1').entregaLancada.data, '2026-09-28', 'o servidor gravou o lote na a1');
  const doLote = id => itemDe(rel, id).em;
  const naFila = async () => Object.fromEntries((await b.json('STORE.getQueue().filter(q => q.action === "upsert").map(q => [q.os.id, q.os.atualizadoEm])')));
  // Sem rede, o Thiago desfaz: nada é trocado na fila, e o lote diz por quê.
  b.nav.onLine = false;
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:300, passoMs:5})`);
  for (const id of ['a1', 'a2']) {
    assert.equal(itemDe(des, id).desfazer.estado, 'pulada', id);
    assert.match(itemDe(des, id).desfazer.motivo, /ainda não chegou ao servidor/);
  }
  assert.deepEqual(await naFila(), {a1:doLote('a1'), a2:doLote('a2')}, 'as gravações do lote continuam na fila, sem Desfazer por cima');
  // A rede volta: a gravação do lote sobe como estava (na a1 o servidor já a tinha e aceita o reenvio, sem conflito).
  perder = false; b.nav.onLine = true;
  await b.sincronizar();
  assert.deepEqual(await naFila(), {});
  for (const id of ['a1', 'a2']) assert.equal(noServidor(b.e, id).entregaLancada.data, '2026-09-28', id);
  // O relatório deixa desfazer de novo, e agora vale nas duas.
  assert.ok(await b.json(`LOTE.relatorios().find(r => r.id === ${JSON.stringify(rel.id)}).itens.every(i => i.desfazer.estado === 'pulada')`));
  const des2 = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.deepEqual(des2.itens.map(i => [i.id, i.desfazer && i.desfazer.estado]), [['a1', 'gravada'], ['a2', 'gravada']], JSON.stringify(des2.itens.map(i => i.desfazer)));
  await b.sincronizar();
  for (const o of os) assert.deepEqual(projecao(noServidor(b.e, o.id)), antes[o.id], o.id);
  b.fechar();
});

test('revisão: conferir a declaração do celular não fecha o problema que a gestão abriu (as duas cópias do motor e o servidor)', async () => {
  const M = (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
  const problema = {id:'p-1', tipo:'problema', motivo:'faltou o suporte das 4', dia:'2026-09-28', via:'pcp', por:'Gestor Teste', em:'2026-09-28T20:00:00Z'};
  // (1) O caso mínimo: o celular declara 6 de 10 no dia 29; a gestão abriu problema no dia 28; o lote confere a declaração.
  for (const X of [E, M]) {
    const os = {id:'x', tipo:'externo', valorTotal:1000, finalizadaEm:'', itens:[{uid:'u0', item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000', entregas:[declarada('d-1', 6), problema]}]};
    const it = os.itens[0];
    const antes = X.lancamentosDaOS(os);
    const v = X.validarEvento({id:'c-1', tipo:'conferido', alvo:'d-1', dia:HOJE, via:'lote'}, it, {papel:'pcp', os, hoje:HOJE});
    assert.equal(v.ok, true, v.erro);
    it.entregas.push(v.evento);
    const s = X.situacaoItem(it, os), depois = X.lancamentosDaOS(os);
    assert.equal(s.situacao, 'problema', 'o problema continua aberto');
    assert.ok(s.problema);
    assert.deepEqual({entregue:depois.entregue, declarado:depois.declarado, retido:depois.retido, saldo:depois.saldo},
      {entregue:antes.entregue + antes.declarado, declarado:0, retido:antes.retido, saldo:antes.saldo});
  }
  // (2) Em casos gerados (semente fixa), nas duas cópias: conferir tudo não mexe no saldo, no cancelado nem no retido.
  let semente = 20260930;
  const r = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const um = xs => xs[Math.floor(r() * xs.length)];
  let comProblema = 0;
  for (let n = 0; n < 1500; n++) {
    const tipo = r() < 0.2 ? 'interno' : 'externo';
    const itens = Array.from({length:1 + Math.floor(r() * 4)}, (_, i) => ({uid:'u' + i, item:String(i + 1), descricao:'Placa', qtde:String(um([1, 2, 3, 5, 10])), subtotal:String(Math.floor(r() * 90000) / 100), entregas:[]}));
    const os = {id:'x' + n, tipo, valorTotal:1000, itens, finalizadaEm:''};
    for (let t = 0; t < 8; t++) {
      const it = um(itens), papel = um(['pcp', 'operacao', 'montagem', 'montagem']);
      const tp = papel === 'montagem' ? (tipo === 'interno' ? 'retirado' : 'entregue') : um(['entregue', 'retirado', 'problema', 'cancelado', 'desfeito', 'entregue']);
      const ativos = E.eventosAtivos(it);
      const v = E.validarEvento({id:`e${n}-${t}`, tipo:tp, dia:um(['2026-09-27', '2026-09-28', '2026-09-29']), qtde:1 + Math.floor(r() * 4), motivo:'m', alvo:ativos.length ? um(ativos).id : ''}, it, {papel, os:{...os, finalizadaEm:''}, hoje:HOJE});
      if (v.ok) it.entregas.push(v.evento);
    }
    if (r() < 0.5) { os.finalizadaEm = '2026-09-29T19:10:00.000Z'; os.finalizadaPorCampo = {finalizadaEm:os.finalizadaEm, por:'Ana', porId:'100001', em:'2026-09-29T19:10:05.000Z'}; }
    const antes = E.lancamentosDaOS(os);
    if (antes.retido > 0 && antes.declarado > 0) comProblema++;
    for (const d of E.declaracoesAConferir(os)) {
      const i = d.indice >= 0 ? d.indice : 0;
      const v = E.validarEvento({id:`c${n}-${d.alvo}`, tipo:'conferido', alvo:d.alvo, dia:HOJE, via:'lote'}, os.itens[i], {papel:'pcp', os, hoje:HOJE});
      assert.equal(v.ok, true, v.erro);
      os.itens[i].entregas.push(v.evento);
    }
    const depois = E.lancamentosDaOS(os);
    assert.deepEqual(depois, M.lancamentosDaOS(os), `paridade, caso ${n}`);
    assert.deepEqual([depois.saldo, depois.cancelado, depois.retido, depois.declarado, depois.entregue], [antes.saldo, antes.cancelado, antes.retido, 0, antes.entregue + antes.declarado], `caso ${n}`);
  }
  assert.ok(comProblema > 0, 'os casos gerados passam por declaração com problema aberto');
  // (3) Pelo lote e pelo servidor: a O.S. finalizada pelo celular, com o problema aberto pela gestão.
  const c1 = celular({itens:[{uid:'c1:1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[declarada('d-1', 6), problema]},
    {uid:'c1:2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600'}, {uid:'c1:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}]});
  const b = await montar({os:[c1]});
  await abrirPendencias(b);
  assert.equal(await b.acao({acao:'conferir', os:'c1'}), '');
  await naoEConfirma(b, 'c1');
  assert.equal(estadoDe(await salvar(b), 'c1'), 'gravada');
  await b.sincronizar();
  const s = noServidor(b.e, 'c1');
  assert.ok(s.itens[0].entregas.some(m => m.tipo === 'conferido' && m.alvo === 'd-1'), 'a conferência foi gravada');
  for (const X of [E, M]) {
    assert.equal(X.situacaoItem(s.itens[0], s).situacao, 'problema', 'o problema só fecha por marca da gestão');
    assert.ok(X.lancamentosDaOS(s).retido > 0);
  }
  b.fechar();
});

test('revisão: sair com a fila pendente apaga o rascunho e o relatório do lote (a fila fica)', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  await naoEConfirma(b, 'a1');
  b.nav.onLine = false; b.rede.on = false;
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'a1'), 'na-fila');
  assert.ok(b.idb.has('impresilk_lote'), 'o rascunho e o relatório estão no IndexedDB');
  assert.equal(await b.json('STORE.limparCache()'), false, 'com fila, sair não apaga o trabalho');
  assert.equal(b.idb.has('impresilk_lote'), false, 'o rascunho e o relatório (o antes de cada O.S.) saem');
  assert.deepEqual(await b.json('STORE.getQueue().map(q => q.os && q.os.id)'), ['a1'], 'a gravação na fila continua');
  b.fechar();
});

test('revisão: o Desfazer sem internet deixa a O.S. "a lançar" na cópia local, com o pedido na fila, e só conta feito com a confirmação do servidor', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const id of ['a1', 'a2', 'a3']) await naoEConfirma(b, id);
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => i.estado), ['gravada', 'gravada', 'gravada']);
  b.nav.onLine = false; b.rede.on = false;
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.deepEqual(des.itens.map(i => i.desfazer.estado), ['na-fila', 'na-fila', 'na-fila']);
  // O pedido fica na cópia (a próxima gravação da O.S. o leva junto), mas não é lançamento.
  assert.deepEqual(await b.json(`STORE.getOS('a1').entregaLancada`), {desfazer:true});
  assert.deepEqual(await b.json('classificarEntregas(STORE.getAllOS()).aLancar.map(o => o.id)'), ['a1', 'a2', 'a3'], 'voltaram para "a lançar" na hora');
  assert.equal(await b.json(`OPERACAO.entregaLancadaValida(STORE.getOS('a1'))`), null);
  assert.equal(await b.json(`diaEntrega(STORE.getOS('a1'))`), '2026-09-28');
  assert.deepEqual(await b.json(`(() => { const r = LOTE.osPendentes(STORE.getAllOS(), '2026-09'); return [r.aLancar, r.semDivisao]; })()`), [3, 1]);
  assert.ok(await b.json(`STORE.getQueue().every(q => q.os.entregaLancada && q.os.entregaLancada.desfazer === true)`), 'o pedido vai na fila');
  // "Na fila" não é feito: o relatório ainda oferece o Desfazer, e desfazer de novo não manda outro por cima.
  const fila = await b.json('STORE.getQueue().map(q => q.os.atualizadoEm)');
  const des2 = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.ok(des2.itens.every(i => i.desfazer.estado === 'na-fila' && /servidor ainda não confirmou/.test(i.desfazer.motivo)), JSON.stringify(des2.itens.map(i => i.desfazer)));
  assert.deepEqual(await b.json('STORE.getQueue().map(q => q.os.atualizadoEm)'), fila);
  // A rede volta: a confirmação do servidor fecha o Desfazer no relatório.
  b.nav.onLine = true; b.rede.on = true;
  await b.sincronizar();
  await esperar(10);
  assert.equal(noServidor(b.e, 'a1').entregaLancada, null);
  assert.deepEqual(await b.json(`LOTE.relatorios()[0].itens.map(i => i.desfazer.estado)`), ['gravada', 'gravada', 'gravada']);
  assert.match((await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)})`)).erro, /Nada a desfazer/);
  b.fechar();
});
