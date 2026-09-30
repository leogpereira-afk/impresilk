/* E4 (30/09/2026): botões de entrega por item na ficha e no card da gestão.
   Entregar tudo, Entregar parte, Retirado (O.S. interna), Problema, Cancelar
   item e Desfazer; o selo "Entrega parcial 3 de 5" no card; o Finalizar que
   pergunta sobre o saldo. A régua é o motor ENTREGA_ITEM, a mesma da porta do
   servidor (E3). Bancada: a tela (app.js) com o store de verdade (store.js),
   falando com o pcp-sync de verdade (helpers/edge.cjs), num DOM de mentira.
   Cada teste começa pelo caso ruim. Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const motorServidor = () => import('../supabase/functions/_shared/pcp-entrega-item.mjs');
const integridade = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('olga-f', 'Olga Balcão', 'operacao1', '12312312312'),
];
const GESTOR = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const OPERACAO_C = {papel:'operacao', nome:'Olga Balcão', sub:'operacao1'};
const ITENS = () => [
  {uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10', valorUnit:'1234.56', subtotal:'12345.6'},
  {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1', valorUnit:'500', subtotal:'500'},
  {uid:'8101:3:1', item:'3', descricao:'Totem - evento de sábado na praça', qtde:'2', valorUnit:'300', subtotal:'600'},
  {uid:'8101:4:1', item:'4', descricao:'Servicos de instalação', qtde:'1', valorUnit:'200', subtotal:'200'},
];
// A O.S. externa com o checklist completo: só falta finalizar.
const pronta = (extra = {}) => ({numero:'8101', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'],
  liberadoPCP:true, confirmacao:'Confirmado', embarqueConferidoPor:'Gestor Teste', produtosConferidosPor:'Gestor Teste',
  ferramentasConferidas:true, carroLiberado:true, horaSaida:'08:00', saidaEm:'2026-09-29T11:00:00.000Z',
  instalacaoOK:true, conferidoPor:'Gestor Teste', fotosCheckinIds:['foto-saida'], fotosRetornoIds:['foto-volta'],
  retornoEm:'2026-09-29T19:00:00.000Z', horaRetorno:'16:00', valorTotal:9999.99, itens:ITENS(), ...extra});
const row = (id, registro, rev = 1) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev, atualizadoEm:'2026-09-19T10:00:00.000Z', ...registro}});
const marca = (id, tipo, qtde, extra = {}) => ({id, tipo, ...(qtde ? {qtde} : {}), dia:'2026-09-20', via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-20T12:00:00Z', ...extra});
const comMarcas = (itens, uid, lista) => itens.map(it => it.uid === uid ? {...it, entregas:lista} : it);
const gravada = (e, id = '1') => js(e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro);
const marcasDe = (os, uid) => ((os.itens || []).find(i => i.uid === uid) || {}).entregas || [];
const resumo = lista => lista.map(m => [m.tipo, m.qtde ?? null]);

/* DOM de mentira: o que a tela procura pelo seletor devolve um nó que guarda
   o que recebe; os blocos da ficha e os diálogos são observáveis. */
function domFalso() {
  const porId = new Map(), nos = new Map();
  let blocos = [];
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add(){}, remove(){}, toggle(){}, contains:() => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
    querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const body = el('body');
  const doc = {activeElement:null, body, addEventListener() {},
    querySelector:sel => no(sel), querySelectorAll:sel => sel === '#modal-os .card-fs' ? blocos : [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)};
  return {doc, no, porId, blocos:() => blocos, setBlocos:b => { blocos = b; }};
}

async function bancada({registros = [], lista = null, papel = 'pcp', cracha = GESTOR, e = null} = {}) {
  e = e || await edge('pcp-sync', {pcp_registros:registros, registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}], equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
  const inicial = lista || e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [], respostas = [];
  let quem = cracha;
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => respostas.length ? respostas.shift() : true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  const nome = cracha && cracha.nome ? cracha.nome : 'Gestor Teste';
  run(`STATE.user = {nome:${JSON.stringify(nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = m => __toasts.push([m, 'desfazer']);`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, ctx, run, d, toasts, respostas, esvaziar, json:c => JSON.parse(run(`JSON.stringify(${c})`)), setCracha:c => { quem = c; },
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
// Um botão da coluna Entrega como a tela desenha (o handler lê o dataset).
const botao = (acao, uid, ient) => ({dataset:{entAcao:acao, iuid:uid, ient:String(ient)}});

/* ───────────── marcar: cliques rápidos e o validador do servidor ───────────── */

test('dois cliques rápidos em itens diferentes não se atropelam, nem com a ficha trocada com um diálogo aberto', async () => {
  const b = await bancada({registros:[row('1', pronta())]});
  b.abrir('1');
  // Os botões foram desenhados UMA vez: os cliques chegam antes da nova pintura.
  const A = botao('tudo', '8101:2:1', 1), B = botao('parte', '8101:1:1', 0), C = botao('tudo', '8101:3:1', 2), D = botao('problema', '8101:1:1', 0);
  b.ctx.__botoes = [A, B, C, D];
  b.run(`abrirDialogoEntrega = (cfg, cb) => { __dialogo = cfg; __confirmar = cb; };
    ligarEntregasDaFicha({querySelectorAll: () => __botoes}, false);`);
  A.onclick();                       // Entregar tudo no item 2: um toque
  B.onclick();                       // Entregar parte no item 1: abre o diálogo
  C.onclick();                       // Entregar tudo no item 3, logo em seguida, com o envio do primeiro no ar
  assert.equal(b.json('__dialogo.qtde.max'), 10);
  await b.esvaziar();
  // Caso ruim: com o diálogo aberto, a ficha é trocada pela versão do servidor
  // (Recarregar do conflito, a ficha aberta de novo). O "Marcar" do diálogo
  // não pode gravar no objeto que a tela capturou.
  b.run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS('1')));`);
  assert.equal(b.run(`__confirmar({qtde:'4'})`), '');
  await b.esvaziar();
  // E um botão desenhado lá no começo, clicado agora, também vale para a ficha de agora.
  D.onclick();
  assert.equal(b.run(`__confirmar({motivo:'Peça riscada no transporte'})`), '');
  await b.esvaziar();
  const g = gravada(b.e);
  assert.deepEqual(resumo(marcasDe(g, '8101:2:1')), [['entregue', 1]]);
  assert.deepEqual(resumo(marcasDe(g, '8101:3:1')), [['entregue', 2]]);
  assert.deepEqual(resumo(marcasDe(g, '8101:1:1')), [['entregue', 4], ['problema', null]], 'a parte do diálogo e o problema foram para o rascunho de agora');
  assert.ok(marcasDe(g, '8101:2:1').every(m => m.por === 'Gestor Teste' && m.via === 'gestao'), 'autor e via do crachá');
  // A ficha mostra as três, e nada ficou na fila.
  const draft = b.json('_modalDraft');
  assert.equal(b.S.getQueue().length, 0);
  assert.deepEqual(['8101:1:1', '8101:2:1', '8101:3:1'].map(u => marcasDe(draft, u).length), [2, 1, 1]);
  assert.ok(b.toasts.some(([m]) => /item 2 \(Adesivo vitrine\): 1 entregue hoje/.test(m)));
});

test('parte maior que o saldo é recusada na tela com a frase do validador do servidor, e nada vai para a fila', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const b = await bancada({registros:[row('1', pronta({itens}))]});
  b.abrir('1');
  const erroTela = b.run(`executarEntregaItem('parte', '8101:1:1', '0', {qtde:'5'})`);
  const M = await motorServidor();
  const os = gravada(b.e), hoje = M.diaSP(Date.now());
  const v = M.validarEvento({id:'e-teste', tipo:'entregue', qtde:5, dia:hoje}, os.itens[0], {papel:'pcp', os, hoje});
  assert.equal(v.ok, false);
  assert.equal(erroTela, v.erro, 'a mesma frase do servidor');
  assert.match(erroTela, /faltam 4 de 10/);
  assert.equal(b.S.getQueue().length, 0, 'a recusa não grava');
  assert.equal(b.json('_modalDraft.itens[0].entregas.length'), 1);
  // Pelo diálogo: a frase aparece nele (ele fica aberto) e o limite é o saldo.
  b.ctx.__botao = botao('parte', '8101:1:1', 0);
  b.run(`abrirDialogoEntrega = (cfg, cb) => { __cfg = cfg; __cb = cb; }; ligarEntregasDaFicha({querySelectorAll: () => [__botao]}, false); __botao.onclick();`);
  assert.equal(b.json('__cfg.qtde.max'), 4);
  assert.equal(b.run(`__cb({qtde:'5'})`), v.erro);
  assert.equal(b.run(`__cb({qtde:''})`), 'Diga a quantidade.');
  assert.match(b.run(`__cb({qtde:'2,5'})`), /número inteiro/);
  // A porta do servidor recusa a mesma marca com a mesma frase.
  const direto = gravada(b.e);
  direto.itens[0].entregas.push({id:'e-direto', tipo:'entregue', qtde:5, dia:hoje});
  const r = await b.e.call({action:'upsert', os:direto}, GESTOR);
  assert.deepEqual(r.descartado, ['entregas']);
  assert.equal(r.entregasRecusadas[0].motivo, v.erro);
  // O saldo certo passa: 6 + 4 fecha o item.
  b.run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS('1')));`);
  b.run(`_modalDraft.rev = ${gravada(b.e).rev}`);
  assert.equal(b.run(`__cb({qtde:'4'})`), '');
  await b.esvaziar();
  assert.deepEqual(resumo(marcasDe(gravada(b.e), '8101:1:1')), [['entregue', 6], ['entregue', 4]]);
});

/* ───────────── Finalizar com saldo ───────────── */

test('Finalizar com saldo pergunta; "Manter aberta" não grava finalizadaEm; "Marcar os restantes" marca e finaliza numa gravação', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const b = await bancada({registros:[row('1', pronta({itens}))]});
  b.abrir('1');
  b.ctx.__perguntas = [];
  b.run(`perguntarSaldoEntrega = (os, p, cb) => { __perguntas.push(p.pendentes.map(x => x.it.uid + '=' + x.s.saldo)); cb(__resposta); };
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); };`);
  b.ctx.__resposta = 'manter';
  b.run('finalizarDaFicha(false)');
  assert.deepEqual(b.ctx.__perguntas.map(js), [['8101:1:1=4', '8101:2:1=1', '8101:3:1=2']], 'pergunta, com o saldo de cada item (o serviço fica de fora)');
  assert.equal(b.run(`_modalDraft.finalizadaEm || ''`), '', 'Manter aberta não finaliza');
  assert.equal(b.S.getQueue().length, 0, 'nem grava');
  assert.ok(b.toasts.some(([m]) => /continua aberta: entrega parcial/.test(m)));
  // "Voltar" também não finaliza.
  b.ctx.__resposta = 'voltar';
  b.run('finalizarDaFicha(false)');
  assert.equal(b.run(`_modalDraft.finalizadaEm || ''`), '');
  // Marcar os restantes: as marcas do saldo e o finalizadaEm vão na MESMA gravação.
  b.ctx.__resposta = 'marcar';
  b.run('finalizarDaFicha(false)');
  assert.ok(b.run('_modalDraft.finalizadaEm'));
  const fila = b.S.getQueue();
  assert.equal(fila.length, 1);
  assert.ok(fila[0].os.finalizadaEm);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(g.finalizadaEm, 'o servidor aceita marca e finalização juntas');
  assert.deepEqual(resumo(marcasDe(g, '8101:1:1')), [['entregue', 6], ['entregue', 4]]);
  assert.deepEqual(resumo(marcasDe(g, '8101:2:1')), [['entregue', 1]]);
  assert.deepEqual(resumo(marcasDe(g, '8101:3:1')), [['entregue', 2]]);
  assert.deepEqual(marcasDe(g, '8101:4:1'), [], 'serviço não recebe marca');
  const M = await motorServidor();
  assert.equal(M.resumoOS({...g, finalizadaEm:''}).situacao, 'completa');
  assert.ok(b.toasts.some(([m]) => /Instalação finalizada 🏁 · 3 itens marcados entregues hoje/.test(m)));
});

test('Finalizar pelo card: pergunta o saldo, "Manter aberta" deixa aberta, e a O.S. sem marca finaliza como hoje, sem pergunta', async () => {
  const interna = {numero:'8102', tipo:'interno', cliente:'Cliente Fictício', liberadoPCP:true, itens:[
    {uid:'8102:1:1', item:'1', descricao:'Banner', qtde:'3', entregas:[marca('e-r1', 'retirado', 1, {via:'balcao', retirou:'Fulano de Tal'})]},
    {uid:'8102:2:1', item:'2', descricao:'Placa', qtde:'1'}]};
  const semMarca = {numero:'8103', tipo:'interno', cliente:'Cliente Fictício', liberadoPCP:true, itens:[{uid:'8103:1:1', item:'1', descricao:'Placa', qtde:'2'}]};
  const b = await bancada({registros:[row('2', interna), row('3', semMarca)]});
  b.ctx.__perguntas = [];
  b.run(`perguntarSaldoEntrega = (os, p, cb) => { __perguntas.push(os.id); cb(__resposta); };`);
  b.ctx.__resposta = 'manter';
  b.run(`finalizarServicoDoCard('2')`);
  assert.deepEqual(js(b.ctx.__perguntas), ['2']);
  assert.equal(b.run(`STORE.getOS('2').finalizadaEm || ''`), '');
  assert.equal(b.S.getQueue().length, 0);
  b.ctx.__resposta = 'marcar';
  b.run(`finalizarServicoDoCard('2')`);
  await b.esvaziar();
  const g = gravada(b.e, '2');
  assert.ok(g.finalizadaEm);
  assert.deepEqual(resumo(marcasDe(g, '8102:1:1')), [['retirado', 1], ['retirado', 2]], 'na O.S. interna o saldo vira retirado');
  assert.deepEqual(resumo(marcasDe(g, '8102:2:1')), [['retirado', 1]]);
  // Sem marca nenhuma: como hoje (a entrega implícita conta na finalização).
  b.run(`finalizarServicoDoCard('3')`);
  assert.deepEqual(js(b.ctx.__perguntas), ['2', '2'], 'a O.S. sem marca não pergunta');
  await b.esvaziar();
  const g3 = gravada(b.e, '3');
  assert.ok(g3.finalizadaEm);
  assert.deepEqual(marcasDe(g3, '8103:1:1'), [], 'e não cria marca');
});

/* ───────────── O.S. antiga, R$ e blocos abertos ───────────── */

test('O.S. antiga sem código de item abre sem erro, e a marca cai no item certo pela posição', async () => {
  const antiga = {numero:'7003', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', liberadoPCP:true, itens:[
    {item:'1', descricao:'Fachada', qtde:'2,5 m²'}, {item:'2', descricao:'', qtde:''}, {item:'3', descricao:'Placa', qtde:'4'}]};
  const b = await bancada({registros:[row('1', antiga)]});
  const html = b.run(`blocoItens(STORE.getOS('1'), false, false)`);
  assert.equal((html.match(/class="entrega-cell"/g) || []).length, 3);
  assert.equal((html.match(/data-iuid=""/g) || []).length > 0, true, 'sem código: o botão vai pela posição');
  assert.doesNotMatch(html, /undefined|NaN|\[object/);
  const linhas = html.split('<tr data-item-row=').slice(1);
  assert.doesNotMatch(linhas[0] + linhas[1], /Entregar parte/, 'm² e quantidade vazia não aceitam parte');
  assert.match(linhas[2], /Entregar parte/, 'quantidade inteira maior que 1 aceita');
  assert.doesNotThrow(() => b.run(`osCardHTML(STORE.getOS('1'))`));
  b.abrir('1');
  assert.equal(b.run(`executarEntregaItem('parte', '', '2', {qtde:'3'})`), '');
  await b.esvaziar();
  const g = gravada(b.e);
  assert.deepEqual(g.itens.map(i => (i.entregas || []).map(m => m.qtde)), [[], [], [3]], 'a marca foi para o item 3');
  assert.ok(g.itens.every(i => i.uid), 'o servidor carimbou o código');
  assert.equal(b.run(`_modalDraft.itens[2].uid`), g.itens[2].uid, 'e a ficha adotou o código');
});

test('operação não vê R$ e não tem Cancelar item nem Desfazer', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const b = await bancada({registros:[row('1', pronta({itens}))], papel:'operacao', cracha:OPERACAO_C});
  const os = b.run(`STORE.getOS('1')`);
  const html = b.run(`blocoItens(STORE.getOS('1'), false, false)`);
  assert.match(html, /Entregar tudo/);
  assert.match(html, /Entregar parte/);
  assert.match(html, /Problema/);
  assert.doesNotMatch(html, /data-ent-acao="cancelar"|data-ent-acao="desfazer"/);
  const card = b.run(`osCardHTML(STORE.getOS('1'))`);
  const saldo = (b.run(`perguntarSaldoEntrega(STORE.getOS('1'), saldoAFinalizar(STORE.getOS('1')), () => {})`), b.d.porId.get('saldo-entrega-box').innerHTML);
  const perguntas = b.json(`['parte','problema','tudo'].map(a => perguntaDaAcaoEntrega(a, STORE.getOS('1').itens[0], STORE.getOS('1')))`);
  for (const t of [html, card, saldo, JSON.stringify(perguntas)]) {
    assert.doesNotMatch(t, /R\$|1\.?234[,.]56|12\.?345|9\.?999/, 'nenhum valor em R$');
  }
  assert.ok(os.itens[0].valorUnit, 'o valor existe na O.S. (a tela é que não mostra)');
  b.abrir('1');
  assert.match(b.run(`executarEntregaItem('cancelar', '8101:1:1', '0', {motivo:'Cliente desistiu'})`), /Seu acesso \(operação\) não pode marcar "cancelar item"/);
  assert.equal(b.run(`executarEntregaItem('tudo', '8101:2:1', '1')`), '');
  assert.ok(b.toasts.some(([m]) => /Para desfazer, fale com o PCP/.test(m)));
  await b.esvaziar();
  const m = marcasDe(gravada(b.e), '8101:2:1');
  assert.equal(m.length, 1);
  assert.equal(m[0].via, 'balcao', 'operação marca pelo balcão');
});

test('os blocos abertos continuam abertos depois de gravar uma marca', async () => {
  const b = await bancada({registros:[row('1', pronta())]});
  const bloco = (k, open) => ({dataset:{bloco:k}, open});
  b.d.setBlocos([bloco('pcp', false), bloco('itens', true), bloco('agenda', false), bloco('exec', true)]);
  b.ctx.__novo = () => b.d.setBlocos([bloco('pcp', true), bloco('itens', false), bloco('agenda', false), bloco('exec', false)]);
  b.run(`renderModal = () => __novo();`);
  b.abrir('1');
  assert.equal(b.run(`executarEntregaItem('tudo', '8101:2:1', '1')`), '');
  assert.deepEqual(Object.fromEntries(b.d.blocos().map(x => [x.dataset.bloco, x.open])), {pcp:false, itens:true, agenda:false, exec:true});
  /* A primeira gravação vai antes da segunda: duas gravações da mesma O.S. no
     MESMO milissegundo têm o mesmo atualizadoEm, e a fila (store.js,
     _removeFromQueue) tira a segunda junto com a primeira. Sem esperar, o
     teste falhava em ~1 de 8 rodadas; a trava dos blocos não depende disso. */
  await b.esvaziar();
  // O Desfazer também.
  const u = b.run(`ENTREGA_ITEM.situacaoItem(_modalDraft.itens[1], _modalDraft).ultimaMarca`);
  assert.ok(u);
  b.run(`__novo()`);
  b.d.setBlocos([bloco('pcp', false), bloco('itens', true), bloco('agenda', false), bloco('exec', true)]);
  assert.equal(b.run(`executarEntregaItem('desfazer', '8101:2:1', '1', {motivo:'Marquei no item errado'})`), '');
  assert.deepEqual(Object.fromEntries(b.d.blocos().map(x => [x.dataset.bloco, x.open])), {pcp:false, itens:true, agenda:false, exec:true});
  await b.esvaziar();
  assert.deepEqual(resumo(marcasDe(gravada(b.e), '8101:2:1')), [['entregue', 1], ['desfeito', null]]);
});

/* ───────────── aba antiga e marca recusada ───────────── */

test('aba antiga aberta ao lado não apaga a marca: nem a da versão velha, nem a ficha com rascunho velho', async () => {
  const A = await bancada({registros:[row('1', pronta())]});
  // A aba B (versão nova) abriu a ficha ANTES da marca e ficou com edição pendente.
  const B = await bancada({e:A.e});
  B.abrir('1');
  B.run(`initConflictDialog(); _modalDraft.obsPCP = 'recado da aba B'; _modalDirty = true;`);
  // A aba A marca o item 2.
  A.abrir('1');
  assert.equal(A.run(`executarEntregaItem('tudo', '8101:2:1', '1')`), '');
  await A.esvaziar();
  assert.equal(marcasDe(gravada(A.e), '8101:2:1').length, 1);
  // Uma aba da versão antiga (sem código e sem o campo de entrega) grava outra coisa.
  const velha = gravada(A.e);
  for (const it of velha.itens) { delete it.uid; delete it.entregas; }
  velha.obsPCP = 'recado da aba antiga';
  const r = await A.e.call({action:'upsert', os:velha}, GESTOR);
  assert.equal(r.ok, true);
  assert.equal(gravada(A.e).obsPCP, 'recado da aba antiga');
  assert.equal(marcasDe(gravada(A.e), '8101:2:1').length, 1, 'a aba antiga não apaga a marca');
  // A aba B grava o rascunho velho: conflito (rev), e o "Sobrescrever" fica com a marca do servidor.
  B.run('saveDraft()');
  await B.esvaziar();
  B.d.no('#conflict-overwrite').onclick();
  await B.esvaziar();
  const g = gravada(A.e);
  assert.equal(g.obsPCP, 'recado da aba B');
  assert.deepEqual(resumo(marcasDe(g, '8101:2:1')), [['entregue', 1]], 'a marca fica, sem duplicar');
  assert.deepEqual(resumo(marcasDe(B.json('_modalDraft'), '8101:2:1')), [['entregue', 1]], 'e aparece na ficha da aba B');
  // A ficha com rascunho velho SEM conflito (mesmo rev) também não perde: a gravação relê o STORE.
  const C = await bancada({e:A.e});
  C.abrir('1');
  C.run(`_modalDraft.itens.forEach(i => { delete i.entregas; }); _modalDraft.obsPCP = 'recado da aba C'; saveDraft();`);
  assert.deepEqual(resumo(marcasDe(js(C.S.getQueue()[0].os), '8101:2:1')), [['entregue', 1]], 'o envio já leva a marca que o STORE conhece');
  await C.esvaziar();
  assert.deepEqual(resumo(marcasDe(gravada(A.e), '8101:2:1')), [['entregue', 1]]);
});

test('marca descartada pelo servidor sai do rascunho (que é outra cópia) e deixa o aviso fixo até "Entendi"', async () => {
  const oito = [marca('e-oito', 'entregue', 8)];
  const e = await edge('pcp-sync', {pcp_registros:[row('1', pronta({itens:comMarcas(ITENS(), '8101:1:1', oito)}), 2)], registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}], equipe_contas:[]});
  // Este tablet não viu as 8 unidades (rev 1): para ele o saldo é 10.
  const velha = {id:'1', rev:1, atualizadoEm:'2026-09-19T09:00:00.000Z', ...pronta()};
  const b = await bancada({e, lista:[velha]});
  b.run('initConflictDialog(); ligarEntregasDescartadas();');
  b.abrir('1');
  assert.equal(b.run(`executarEntregaItem('parte', '8101:1:1', '0', {qtde:'5'})`), '', 'na tela passa: o saldo daqui é 10');
  await b.esvaziar();
  // Conflito de edição; "Sobrescrever": a ficha vira uma CÓPIA do que foi enviado.
  b.d.no('#conflict-overwrite').onclick();
  assert.notEqual(b.run(`_modalDraft === STORE.getOS('1')`), true, 'a ficha é outra cópia');
  await b.esvaziar();
  const g = gravada(e);
  assert.deepEqual(resumo(marcasDe(g, '8101:1:1')), [['entregue', 8]], 'o servidor recusou a parte de 5 (saldo 2)');
  const draft = b.json('_modalDraft');
  assert.deepEqual(resumo(marcasDe(draft, '8101:1:1')), [['entregue', 8]], 'a recusada saiu da ficha; a do servidor ficou');
  const avisos = b.json('STORE.avisosEntregas()');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].numero, '8101');
  assert.equal(avisos[0].marcas[0].item, 'item 1 (Placa ACM)');
  assert.match(avisos[0].marcas[0].motivo, /faltam 2 de 10/);
  const box = b.d.porId.get('aviso-entregas');
  assert.ok(box, 'o aviso fixo aparece');
  assert.match(box.innerHTML, /A marca de entrega da O\.S\. 8101 não foi gravada\. item 1 \(Placa ACM\): Quantidade maior que o saldo: faltam 2 de 10\./);
  assert.match(box.innerHTML, /Entendi/);
  assert.doesNotMatch(box.innerHTML, /—/, 'sem travessão');
  // A gravação seguinte da mesma ficha (com o rev que o pull traria) não traz a marca de volta.
  b.run(`_modalDraft.rev = STORE.getOS('1').rev; _modalDraft.obsPCP = 'depois do aviso'; saveDraft();`);
  assert.ok(!js(b.S.getQueue()[0].os).itens[0].entregas.some(m => m.qtde === 5), 'o envio não leva a recusada');
  await b.esvaziar();
  assert.equal(gravada(e).obsPCP, 'depois do aviso');
  assert.deepEqual(resumo(marcasDe(gravada(e), '8101:1:1')), [['entregue', 8]]);
  assert.equal(b.json('STORE.avisosEntregas()')[0].marcas.length, 1, 'o aviso não duplica');
  // "Entendi" dispensa.
  b.run(`STORE.dispensarAvisoEntregas('1'); pintarAvisosEntregas();`);
  assert.equal(b.d.porId.get('aviso-entregas'), undefined);
});

/* ───────────── layout: 38 itens, sem descrição, interna ───────────── */

test('O.S. com 38 itens, item sem descrição e O.S. interna não quebram a tabela', async () => {
  const muitos = Array.from({length:38}, (_, k) => ({uid:`9038:${k + 1}:1`, item:String(k + 1), descricao:k === 6 ? '' : k === 7 ? 'Item' : `Peça ${k + 1}`, qtde:String(1 + (k % 4)),
    ...(k % 5 === 0 ? {entregas:[marca('e-' + k, 'entregue', 1)]} : {})}));
  muitos.push({uid:'9038:39:1', item:'39', descricao:'Servicos de instalação', qtde:'1'});
  const interna = {numero:'9040', tipo:'interno', cliente:'Cliente Fictício', liberadoPCP:true, itens:[{uid:'9040:1:1', item:'1', descricao:'Banner', qtde:'3'}, {uid:'9040:2:1', item:'2', descricao:'', qtde:'1'}]};
  const b = await bancada({registros:[row('1', {numero:'9038', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens:muitos}), row('2', interna)]});
  const html = b.run(`blocoItens(STORE.getOS('1'), false, false)`);
  assert.equal((html.match(/<tr data-item-row=/g) || []).length, 39);
  assert.equal((html.match(/<tr class="entrega-row"/g) || []).length, 39, 'uma linha Entrega embaixo de cada item');
  assert.equal((html.match(/<th>/g) || []).length, 6, 'as colunas de antes: a descrição não é espremida');
  const linhas = html.split('<tr data-item-row=').slice(1).map(l => l.slice(0, l.indexOf('</tr>')));
  assert.ok(linhas.every(l => (l.match(/<td/g) || []).length === 6), 'toda linha do item tem as 6 colunas');
  assert.ok((html.match(/<td class="entrega-cell" colspan="6"/g) || []).length === 39, 'e a linha Entrega ocupa a largura toda');
  assert.doesNotMatch(html, /undefined|NaN|null|\[object/);
  assert.match(html, /serviço: vai com a entrega/);
  assert.match(html, /Entrega por item: 2 de 38 entregues · 6 em parte · saldo 85</);
  // Item sem descrição: o rótulo é o número.
  assert.equal(b.run(`rotuloItemEntrega(STORE.getOS('1').itens[6])`), 'item 7');
  assert.equal(b.json(`perguntaDaAcaoEntrega('parte', STORE.getOS('1').itens[6], STORE.getOS('1'))`).titulo, 'Entregar parte: item 7');
  // O.S. interna: "Retirado" no lugar de "Entregar".
  const hi = b.run(`blocoItens(STORE.getOS('2'), false, false)`);
  assert.match(hi, /data-ent-acao="retirado"/);
  assert.match(hi, /data-ent-acao="retirar-parte"/);
  assert.doesNotMatch(hi, /data-ent-acao="tudo"|data-ent-acao="parte"/);
  assert.match(hi, /a retirar \(3\)/);
  // A régua de toque e a coluna no celular.
  const css = ler('styles.css');
  assert.match(css, /\.ent-btn \{[^}]*min-height: 40px/);
  assert.match(css, /\.ent-mais > summary \{[^}]*min-height: 40px/);
  assert.match(css, /\.ent-mais > summary::before \{ content: none; \}/, 'sem o ▸ dos blocos da ficha');
  const celular = css.slice(css.indexOf('@media (max-width: 600px) {\n  .items-cards thead'));
  assert.match(celular.slice(0, celular.indexOf('\n}\n')), /\.items-cards tr\.entrega-row \{/, 'no celular a linha Entrega cola no cartão do item');
});

/* ───────────── item com entrega: não sai, não troca, não esconde ───────────── */

test('item com entrega não sai da lista, não é trocado pelo "Substituir" do PDF, não desce abaixo do entregue e mostra o saldo negativo', async () => {
  const itens = [
    {uid:'m-marcado', item:'1', descricao:'Placa manual', qtde:'6', manual:true, entregas:[marca('e-m1', 'entregue', 6)]},
    {uid:'m-livre', item:'2', descricao:'Adesivo manual', qtde:'2', manual:true},
    // Uma aba antiga baixou a quantidade para 4 depois de 6 entregues.
    {uid:'8104:3:1', item:'3', descricao:'Lona', qtde:'4', entregas:[marca('e-l1', 'entregue', 6)]},
  ];
  const b = await bancada({registros:[row('1', {numero:'8104', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens})]});
  const html = b.run(`blocoItens(STORE.getOS('1'), false, false)`);
  // A linha do item e a linha Entrega logo embaixo.
  const linha = uid => { const i = html.indexOf(`data-iuid="${uid}" class=`); return html.slice(i, html.indexOf('</tr>', html.indexOf('</tr>', i) + 5)); };
  assert.doesNotMatch(linha('m-marcado'), /data-item="0\.qtde"[^>]*readonly/, 'a quantidade do item manual continua editável');
  assert.doesNotMatch(linha('m-marcado'), /data-item-del/);
  assert.match(linha('m-marcado'), /class="ent-fica" title="Item com marca de entrega não sai da lista\. Para tirar o saldo que falta, a gestão usa Cancelar item\.">🔒 fica/);
  assert.match(linha('m-livre'), /data-item-del="1"/);
  assert.doesNotMatch(linha('m-livre'), /data-item="1\.qtde"[^>]*readonly/);
  assert.match(linha('8104:3:1'), /⚠ Saldo -2: a quantidade \(4\) ficou abaixo do que já foi entregue \(6\)\. Corrija a quantidade ou desfaça a marca a mais\./);
  assert.match(b.run(`osCardHTML(STORE.getOS('1'))`), /quantidade abaixo do entregue/);
  // O botão de remover (tela velha na memória) é barrado pelo handler.
  b.abrir('1');
  const del = {dataset:{itemDel:'0', iuid:'m-marcado'}};
  const campo = {dataset:{item:'0.qtde', iuid:'m-marcado'}, value:'6', setAttribute(k, v) { this['a:' + k] = v; }, removeAttribute(k) { delete this['a:' + k]; }};
  const raiz = b.d.no('#modal-os');
  raiz.querySelectorAll = sel => sel === '[data-item-del]' ? [del] : sel === '[data-item]' ? [campo] : [];
  b.run(`bindModalEvents(_modalDraft, false)`);
  del.onclick();
  assert.equal(b.json('_modalDraft.itens.length'), 3);
  assert.ok(b.toasts.some(([m]) => /item 1 \(Placa manual\) tem marca de entrega e não sai da lista\. Para tirar o saldo que falta, a gestão usa Cancelar item\./.test(m)));
  // Caso ruim: apagar o "6" para digitar "12" passa por "1", abaixo das 6 entregues.
  campo.value = '1'; campo.oninput();
  assert.equal(b.run(`_modalDraft.itens[0].qtde`), '6', 'a O.S. fica com a quantidade de antes');
  assert.equal(campo['a:aria-invalid'], 'true');
  assert.equal(b.S.getQueue().length, 0, 'nada vai para o servidor pela metade');
  campo.value = '12'; campo.oninput();
  assert.equal(b.run(`_modalDraft.itens[0].qtde`), '12');
  assert.equal(campo['a:aria-invalid'], undefined);
  campo.value = '4'; campo.oninput(); campo.onblur();
  assert.equal(campo.value, '12', 'ao sair do campo, volta ao que vale');
  assert.ok(b.toasts.some(([m]) => /A quantidade não fica abaixo do que já foi entregue \(6\)\. Para baixar, desfaça antes a marca a mais\./.test(m)));
  await b.esvaziar();
  assert.equal(gravada(b.e).itens[0].qtde, '12');
  // "Substituir" do PDF troca só os itens sem marca.
  b.run(`lerPDF = async () => ({texto:''}); parseItensPDF = () => [{uid:'m-novo1', descricao:'Nova placa', qtde:'1'}, {uid:'m-novo2', descricao:'Novo adesivo', qtde:'1'}];`);
  // O seletor de arquivo é criado solto: pega pelo createElement.
  const criados = [];
  b.d.doc.createElement = tag => { const x = {tag, click() {}, files:[{}]}; criados.push(x); return x; };
  b.run(`importarItensPDF(_modalDraft)`);
  b.respostas.push(true);   // "Substituir os 1 sem marca pelos 2 do PDF?"
  await criados.find(x => x.tag === 'input').onchange();
  const depois = b.json('_modalDraft.itens');
  assert.deepEqual(depois.map(i => i.uid), ['m-marcado', '8104:3:1', 'm-novo1', 'm-novo2'], 'os com entrega ficam; o sem marca sai');
  assert.deepEqual(depois.map(i => i.item), ['1', '3', '4', '5'], 'a numeração segue depois dos que ficaram');
});

/* ───────────── card e textos ───────────── */

test('card: "Entrega parcial 3 de 5" só com marca, "6 de 10" com um item só, e nada na O.S. sem marca ou finalizada', async () => {
  const cinco = [1, 2, 3, 4, 5].map(k => ({uid:`8105:${k}:1`, item:String(k), descricao:`Peça ${k}`, qtde:k === 4 ? '10' : '1',
    ...(k <= 3 ? {entregas:[marca('e-c' + k, 'entregue', 1)]} : k === 4 ? {entregas:[marca('e-c4', 'entregue', 6)]} : {})}));
  const um = [{uid:'8106:1:1', item:'1', descricao:'Placa', qtde:'10', entregas:[marca('e-u1', 'entregue', 6)]}];
  const b = await bancada({registros:[
    row('1', {numero:'8105', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens:cinco}),
    row('2', {numero:'8106', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens:um}),
    row('3', {numero:'8107', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens:ITENS()}),
    row('4', {numero:'8108', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, finalizadaEm:'2026-09-25T15:00:00.000Z', itens:um})]});
  const card = id => b.run(`osCardHTML(STORE.getOS('${id}'))`);
  assert.match(card('1'), /📦 Entrega parcial 3 de 5/);
  assert.match(card('1'), /title="3 de 5 itens entregues, 1 em parte; saldo 5"/);
  assert.match(card('2'), /📦 Entrega parcial 6 de 10/);
  assert.doesNotMatch(card('3'), /tag-entrega/, 'sem marca, nada muda');
  assert.doesNotMatch(card('4'), /tag-entrega/, 'finalizada, nada');
  // A contagem de prontos continua.
  assert.match(card('1'), /0\/5 itens/);
});

test('o aviso do item com marca que a aba antiga tirou fala em "Cancelar item", e o botão existe com esse nome para a gestão', async () => {
  const {guardarEntregasItens} = await integridade();
  const antes = {itens:[{uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10', entregas:[marca('e-seis', 'entregue', 6)]}, {uid:'8101:2:1', item:'2', descricao:'Adesivo', qtde:'1'}]};
  const r = guardarEntregasItens({itens:[js(antes.itens[1])]}, antes, {papel:'pcp', avisar:true, agora:new Date().toISOString()});
  const aviso = r.avisos.join(' ');
  assert.match(aviso, /a gestão usa Cancelar item/);
  const b = await bancada({registros:[row('1', pronta({itens:antes.itens}))]});
  assert.equal(b.run(`ACOES_ENTREGA.cancelar.rotulo`), 'Cancelar item');
  assert.match(b.run(`blocoItens(STORE.getOS('1'), false, false)`), /data-ent-acao="cancelar"[^>]*>Cancelar item</);
  // Os textos novos da coluna não usam travessão.
  const app = ler('app.js');
  const trecho = app.slice(app.indexOf('/* ── ENTREGA POR ITEM NA FICHA E NO CARD (E4'), app.indexOf('function blocoItens('));
  assert.ok(trecho.length > 1000);
  assert.doesNotMatch(trecho, /—/, 'sem travessão nos textos da E4');
});
