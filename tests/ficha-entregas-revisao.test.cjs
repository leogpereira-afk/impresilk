/* Revisão da E4 (30/09/2026): os defeitos que as duas revisões adversariais
   acharam nos botões de entrega por item, cada um com o caso ruim primeiro.
   - o Desfazer desfazia a marca que outro tablet gravou com o diálogo aberto;
   - o "Substituir" do PDF repetia o item já entregue;
   - o Finalizar marcava entregue o item com problema aberto (e liberava o
     valor retido);
   - o Desfazer do card voltava a finalização e deixava as marcas do saldo;
   - a resposta do retrabalho apagava a obs de fechamento que chegou depois;
   - o selo do card dizia "Itens entregues" com tudo cancelado.
   Bancada: a tela (app.js) com o store de verdade (store.js), falando com o
   pcp-sync de verdade (helpers/edge.cjs), num DOM de mentira. Para rodar
   contra outra cópia da tela: PCP_BASELINE=<pasta>. Tudo fictício: o
   repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = process.env.PCP_BASELINE || path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const motorServidor = () => import('../supabase/functions/_shared/pcp-entrega-item.mjs');

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
// O mesmo pedido, como o parseItensPDF devolveria (código próprio 'm-', item manual).
const PDF = () => [
  {uid:'m-pdf1', item:'1', descricao:'Placa ACM', medidas:'2,00x1,00', qtde:'10', valorUnit:'1234.56', subtotal:12345.6, manual:true},
  {uid:'m-pdf2', item:'2', descricao:'Adesivo vitrine', medidas:'1,00x1,00', qtde:'1', valorUnit:'500', subtotal:500, manual:true},
  {uid:'m-pdf3', item:'3', descricao:'Totem - evento de sábado na praça', medidas:'1,00x1,00', qtde:'2', valorUnit:'300', subtotal:600, manual:true},
  {uid:'m-pdf4', item:'4', descricao:'Servicos de instalação', medidas:'1,00x1,00', qtde:'1', valorUnit:'200', subtotal:200, manual:true},
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
   o que recebe; os diálogos são observáveis pelo id. */
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add(){}, remove(){}, toggle(){}, contains:() => false},
    setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute(k) { return this['attr:' + k]; }, focus() {}, addEventListener() {},
    remove() { if (this.id && porId.get(this.id) === this) porId.delete(this.id); this.removido = true; },
    querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  const body = el('body');
  const doc = {activeElement:null, body, addEventListener() {},
    querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)};
  return {doc, no, porId};
}

async function bancada({registros = [], papel = 'pcp', cracha = GESTOR, e = null} = {}) {
  e = e || await edge('pcp-sync', {pcp_registros:registros, registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}], equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os' && !r.apagado).map(r => js(r.registro));
  const d = domFalso();
  const ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [], respostas = [], perguntas = [];
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), cracha); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:msg => { perguntas.push(String(msg)); return respostas.length ? respostas.shift() : true; }});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:${JSON.stringify(cracha.nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {};
    toast = (m, t) => __toasts.push([m, t]); toastDesfazer = (m, fn) => { __toasts.push([m, 'desfazer']); __desfazer = fn; };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, ctx, run, d, toasts, respostas, perguntas, esvaziar, json:c => JSON.parse(run(`JSON.stringify(${c})`)),
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}
// Um botão da coluna Entrega como a tela desenha (o handler lê o dataset).
const botao = (acao, uid, ient) => ({dataset:{entAcao:acao, iuid:uid, ient:String(ient)}});
// O PDF "lido": o seletor de arquivo é criado solto, pega pelo createElement.
async function importarPDF(b, itensPDF, respostas) {
  b.ctx.__pdf = itensPDF;
  b.run(`lerPDF = async () => ({texto:''}); parseItensPDF = () => JSON.parse(JSON.stringify(__pdf));`);
  const criados = [];
  const antes = b.d.doc.createElement;
  b.d.doc.createElement = tag => { const x = {tag, click() {}, files:[{}]}; criados.push(x); return x; };
  b.run(`importarItensPDF(_modalDraft)`);
  b.d.doc.createElement = antes;
  b.respostas.push(...respostas);
  await criados.find(x => x.tag === 'input').onchange();
}

/* ───────────── Desfazer: a marca que o diálogo mostrou ───────────── */

test('revisão: o Desfazer desfaz a marca que o diálogo mostrou, não a que outro tablet gravou com ele aberto', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-x', 'entregue', 6)]);
  const A = await bancada({registros:[row('1', pronta({itens}))]});
  const B = await bancada({e:A.e});
  A.abrir('1');
  // A abre o Desfazer do item 1: o diálogo diz "entregue em 20/09" (a marca X).
  A.ctx.__b = botao('desfazer', '8101:1:1', 0);
  A.run(`abrirDialogoEntrega = (cfg, cb) => { __cfg = cfg; __cb = cb; }; ligarEntregasDaFicha({querySelectorAll: () => [__b]}, false); __b.onclick();`);
  assert.match(A.json('__cfg.texto'), /Desfaz entregue em 20\/09/);
  // Caso ruim: com o diálogo aberto, outro tablet entrega o saldo do mesmo item (Y),
  // e o pull de A troca a ficha (o foco está no diálogo, fora de #modal-os).
  B.abrir('1');
  assert.equal(B.run(`executarEntregaItem('tudo', '8101:1:1', '0')`), '');
  await B.esvaziar();
  const idY = marcasDe(gravada(A.e), '8101:1:1').find(m => m.id !== 'e-x').id;
  await A.S.pull(() => {});
  A.run('atualizarFichaAberta()');
  assert.equal(marcasDe(A.json('_modalDraft'), '8101:1:1').length, 2, 'a ficha de A já tem X e Y');
  // A confirma o diálogo que dizia X.
  assert.equal(A.run(`__cb({motivo:'Marquei errado'})`), '');
  await A.esvaziar();
  const marcas = marcasDe(gravada(A.e), '8101:1:1');
  const desfeitos = marcas.filter(m => m.tipo === 'desfeito');
  assert.equal(desfeitos.length, 1);
  assert.equal(desfeitos[0].alvo, 'e-x', 'desfez a marca que o diálogo mostrou');
  const M = await motorServidor();
  assert.deepEqual(M.eventosAtivos(gravada(A.e).itens[0]).map(m => m.id), [idY], 'a entrega do outro tablet continua valendo');
  assert.ok(A.toasts.some(([m]) => /item 1 \(Placa ACM\): marca desfeita \(entregue em 20\/09\)/.test(m)));
});

test('revisão: o Desfazer de uma marca que outro tablet já desfez é recusado com a frase do validador, e não cai na marca de antes', async () => {
  // Duas entregas no item: W (antiga) e X (a última, que o diálogo mostra).
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-w', 'entregue', 2, {dia:'2026-09-18'}), marca('e-x', 'entregue', 4)]);
  const A = await bancada({registros:[row('1', pronta({itens}))]});
  const B = await bancada({e:A.e});
  A.abrir('1');
  A.ctx.__b = botao('desfazer', '8101:1:1', 0);
  A.run(`abrirDialogoEntrega = (cfg, cb) => { __cfg = cfg; __cb = cb; }; ligarEntregasDaFicha({querySelectorAll: () => [__b]}, false); __b.onclick();`);
  assert.match(A.json('__cfg.texto'), /Desfaz entregue em 20\/09/);
  // Caso ruim: B desfaz X enquanto o diálogo de A está aberto; a última marca passa a ser W.
  B.abrir('1');
  assert.equal(B.run(`executarEntregaItem('desfazer', '8101:1:1', '0', {motivo:'Entrega lançada em dobro'})`), '');
  await B.esvaziar();
  await A.S.pull(() => {});
  A.run('atualizarFichaAberta()');
  const erro = A.run(`__cb({motivo:'Marquei errado'})`);
  assert.equal(erro, 'A marca a desfazer não existe ou já foi desfeita.', 'o diálogo fica aberto com a frase do validador');
  await A.esvaziar();
  const marcas = marcasDe(gravada(A.e), '8101:1:1');
  assert.deepEqual(marcas.filter(m => m.tipo === 'desfeito').map(m => m.alvo), ['e-x'], 'W não foi desfeita por engano');
});

/* ───────────── "Substituir" do PDF com item já entregue ───────────── */

test('revisão: "Substituir" do mesmo PDF não repete o item já entregue: atualiza o item, o saldo e o valor ficam como estavam', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const b = await bancada({registros:[row('1', pronta({itens, valorTotal:undefined}))]});
  const M = await motorServidor();
  const totalAntes = M.valorItemRateado(gravada(b.e)).total;
  b.abrir('1');
  // Caso ruim: o PDF da mesma O.S. de novo, e "Substituir".
  await importarPDF(b, PDF(), [true]);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.equal(g.itens.filter(i => i.descricao === 'Placa ACM').length, 1, 'a placa entregue não ficou repetida');
  assert.equal(g.itens.length, 4);
  assert.match(b.perguntas[0], /Substituir os 3 sem marca pelos 3 do PDF\? Os itens com entrega ficam na lista, e o que é o mesmo produto do PDF é atualizado \(medida, valor e quantidade\), sem repetir\./);
  const placa = g.itens.find(i => i.descricao === 'Placa ACM');
  assert.equal(placa.uid, '8101:1:1', 'é o mesmo item, com o código dele');
  assert.deepEqual(resumo(placa.entregas), [['entregue', 6]]);
  assert.equal(placa.medidas, '2,00x1,00', 'a medida veio do PDF');
  assert.equal(placa.qtde, '10');
  // O saldo pede só o que falta, e a soma dos itens não dobra.
  b.abrir('1');
  const saldo = b.json(`saldoAFinalizar(_modalDraft).pendentes.map(p => p.it.descricao + '=' + p.s.saldo)`);
  assert.deepEqual(saldo, ['Placa ACM=4', 'Adesivo vitrine=1', 'Totem - evento de sábado na praça=2']);
  assert.equal(M.valorItemRateado(g).total, totalAntes, 'o valor da O.S. pelos itens é o mesmo');
  assert.equal(M.lancamentosDaOS(g).entregue, M.lancamentosDaOS({...g, itens:comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)])}).entregue);
  assert.ok(b.toasts.some(([m]) => /3 item\(ns\) importado\(s\), 1 item com entrega atualizado/.test(m)));
});

test('revisão: o PDF que baixa a quantidade abaixo do entregue deixa o item com a do entregue e avisa; o item novo do PDF entra', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const b = await bancada({registros:[row('1', pronta({itens}))]});
  b.abrir('1');
  // Caso ruim: a revisão do PDF diz 4 placas, e 6 já foram.
  const pdf = PDF();
  pdf[0].qtde = '4'; pdf[0].subtotal = 4938.24;
  pdf.push({uid:'m-pdf5', item:'5', descricao:'Faixa de obra', medidas:'5,00x0,90', qtde:'2', valorUnit:'80', subtotal:160, manual:true});
  await importarPDF(b, pdf, [true]);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.equal(g.itens.filter(i => i.descricao === 'Placa ACM').length, 1, 'a placa do PDF não entra de novo');
  const placa = g.itens.find(i => i.uid === '8101:1:1');
  assert.equal(placa.qtde, '6', 'não desce abaixo do entregue');
  assert.equal(Number(placa.subtotal), 6 * 1234.56);
  assert.ok(b.toasts.some(([m, t]) => t === 'error' && /item 1 \(Placa ACM\): o PDF traz quantidade 4, abaixo do que já foi entregue \(6\); o item ficou com 6\./.test(m)));
  assert.deepEqual(g.itens.map(i => i.descricao), ['Placa ACM', 'Adesivo vitrine', 'Totem - evento de sábado na praça', 'Servicos de instalação', 'Faixa de obra']);
  assert.deepEqual(g.itens.map(i => i.item), ['1', '2', '3', '4', '5'], 'o item marcado fica com o número; os novos seguem depois dele');
  assert.equal(g.itens.filter(i => (i.entregas || []).length).length, 1);
});

test('revisão: dois iguais sem medida que separe bloqueiam o "Substituir" e só o "Adicionar" é oferecido', async () => {
  const itens = [
    {uid:'8110:1:1', item:'1', descricao:'Placa ACM', qtde:'2', entregas:[marca('e-a', 'entregue', 1)]},
    {uid:'8110:1:2', item:'1', descricao:'Placa ACM', qtde:'2', entregas:[marca('e-b', 'entregue', 2)]},
    {uid:'8110:2:1', item:'2', descricao:'Adesivo', qtde:'1'},
  ];
  const b = await bancada({registros:[row('1', {numero:'8110', tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens})]});
  b.abrir('1');
  const pdf = [
    {uid:'m-q1', item:'1', descricao:'Placa ACM', medidas:'2,00x1,00', qtde:'2', valorUnit:'100', subtotal:200, manual:true},
    {uid:'m-q2', item:'2', descricao:'Placa ACM', medidas:'3,00x1,00', qtde:'2', valorUnit:'150', subtotal:300, manual:true},
  ];
  // Caso ruim: não dá para saber qual placa do PDF é qual placa entregue. "Não" desiste.
  await importarPDF(b, pdf, [false]);
  assert.equal(b.perguntas.length, 1, 'uma pergunta só: o Substituir nem é oferecido');
  assert.match(b.perguntas[0], /^Substituir está bloqueado: o PDF tem mais de um item igual a item com marca de entrega \(item 1 \(Placa ACM\)\), e não dá para saber qual é qual\. Adicionar os 2 item\(ns\) do PDF no fim da lista\?$/);
  assert.deepEqual(b.json('_modalDraft.itens.map(i => i.uid)'), ['8110:1:1', '8110:1:2', '8110:2:1'], 'nada mudou');
  assert.equal(b.S.getQueue().length, 0);
  // "Sim" adiciona no fim, sem mexer em nenhum item.
  await importarPDF(b, pdf, [true]);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.deepEqual(g.itens.map(i => i.uid).slice(0, 3), ['8110:1:1', '8110:1:2', '8110:2:1']);
  assert.equal(g.itens.length, 5);
  assert.deepEqual(g.itens.map(i => i.qtde), ['2', '2', '1', '2', '2']);
});

/* ───────────── Finalizar: o item com problema fica de fora ───────────── */

test('revisão: o Finalizar deixa o item com problema aberto fora da marcação, e o valor dele continua retido', async () => {
  const M = await motorServidor();
  const itens = comMarcas(comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6), marca('e-prob', 'problema', 0, {motivo:'Estrutura amassada', dia:'2026-09-21'})]),
    '8101:2:1', [marca('e-ad', 'entregue', 1)]);
  const b = await bancada({registros:[row('1', pronta({itens}))]});
  const retidoSemMarcar = M.lancamentosDaOS({...gravada(b.e), finalizadaEm:'2026-09-30T15:00:00.000Z'}).retido;
  assert.ok(retidoSemMarcar > 0);
  // A pergunta de verdade: o item com problema vem à parte.
  const html = (b.run(`perguntarSaldoEntrega(STORE.getOS('1'), saldoAFinalizar(STORE.getOS('1')), () => {})`), b.d.porId.get('saldo-entrega-box').innerHTML);
  const [lista, prob] = html.split('Fora da marcação, com problema aberto:');
  assert.ok(prob, 'a lista do item com problema existe');
  assert.match(prob, /item 1 \(Placa ACM\) \(Estrutura amassada\): fica com problema; resolva no item/);
  assert.doesNotMatch(lista, /Placa ACM/, 'o item com problema não está na lista do que vai ser marcado');
  assert.match(html, /Marcar o item restante como entregue hoje/);
  b.abrir('1');
  b.ctx.__vistos = [];
  b.run(`perguntarSaldoEntrega = (os, p, cb) => { __vistos.push([p.pendentes.map(x => x.it.uid), (p.comProblema || []).map(x => x.it.uid)]); cb('marcar'); };
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); };`);
  // Caso ruim: o botão padrão ("Marcar os restantes").
  b.run('finalizarDaFicha(false)');
  assert.deepEqual(js(b.ctx.__vistos), [[['8101:3:1'], ['8101:1:1']]]);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  assert.deepEqual(resumo(marcasDe(g, '8101:1:1')), [['entregue', 6], ['problema', null]], 'o item com problema não foi marcado');
  assert.deepEqual(resumo(marcasDe(g, '8101:3:1')), [['entregue', 2]]);
  assert.equal(M.lancamentosDaOS(g).retido, retidoSemMarcar, 'o saldo do item com problema continua retido');
  assert.ok(b.toasts.some(([m]) => /Instalação da O\.S\. \S+ finalizada 🏁 · 1 item marcado entregue hoje/.test(m)));
});

test('revisão: só o item com problema pendente: a pergunta diz que ele fica com problema, e finalizar não cria marca', async () => {
  const itens = comMarcas(comMarcas(comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6), marca('e-prob', 'problema', 0, {motivo:'Estrutura amassada', dia:'2026-09-21'})]),
    '8101:2:1', [marca('e-ad', 'entregue', 1)]), '8101:3:1', [marca('e-to', 'entregue', 2)]);
  const b = await bancada({registros:[row('1', pronta({itens}))]});
  const html = (b.run(`perguntarSaldoEntrega(STORE.getOS('1'), saldoAFinalizar(STORE.getOS('1')), () => {})`), b.d.porId.get('saldo-entrega-box').innerHTML);
  assert.match(html, /Item com problema de entrega/);
  assert.match(html, /Finalizar: o item fica com problema/);
  assert.match(html, /fica com problema; resolva no item/);
  assert.doesNotMatch(html, /Marcar/);
  b.abrir('1');
  b.run(`perguntarSaldoEntrega = (os, p, cb) => cb('marcar');
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); };`);
  b.run('finalizarDaFicha(false)');
  await b.esvaziar();
  const g = gravada(b.e);
  assert.ok(g.finalizadaEm);
  assert.deepEqual(resumo(marcasDe(g, '8101:1:1')), [['entregue', 6], ['problema', null]]);
});

/* ───────────── Desfazer do card: a finalização e as marcas dela ───────────── */

test('revisão: o Desfazer do card volta a finalização E as marcas que ela criou', async () => {
  const interna = {numero:'8302', tipo:'interno', cliente:'Cliente Fictício', liberadoPCP:true, itens:[
    {uid:'8302:1:1', item:'1', descricao:'Banner', qtde:'3', entregas:[marca('e-r1', 'retirado', 1, {via:'balcao'})]},
    {uid:'8302:2:1', item:'2', descricao:'Placa', qtde:'1'}]};
  const b = await bancada({registros:[row('2', interna)]});
  const M = await motorServidor();
  const antes = M.resumoOS(gravada(b.e, '2'));
  b.run(`perguntarSaldoEntrega = (os, p, cb) => cb('marcar');`);
  b.run(`finalizarServicoDoCard('2')`);
  await b.esvaziar();
  assert.ok(gravada(b.e, '2').finalizadaEm);
  assert.ok(b.toasts.some(([m, t]) => t === 'desfazer' && /Retirada registrada 📦 · 2 itens marcados hoje/.test(m)));
  // Caso ruim: o dono toca em "Desfazer".
  b.run('__desfazer()');
  await b.esvaziar();
  const g = gravada(b.e, '2');
  assert.equal(g.finalizadaEm || '', '', 'a finalização voltou');
  assert.deepEqual(M.eventosAtivos(g.itens[0]).map(m => m.id), ['e-r1'], 'a retirada do saldo foi desfeita; a de antes fica');
  assert.deepEqual(M.eventosAtivos(g.itens[1]), [], 'a marca criada pelo Finalizar foi desfeita');
  assert.deepEqual(marcasDe(g, '8302:2:1').map(m => m.tipo), ['retirado', 'desfeito'], 'fica no histórico como desfeita');
  assert.deepEqual(M.resumoOS(g), antes, 'a O.S. volta a ser o que era');
  assert.doesNotMatch(b.run(`seloEntregaCardHTML(STORE.getOS('2'))`), /Itens entregues/);
  assert.ok(b.toasts.some(([m]) => /Desfeito: a finalização e 2 marcas de entrega/.test(m)));
});

test('revisão: a operação não recebe o Desfazer de um toque quando a finalização marcou saldo, e recebe quando não marcou', async () => {
  const itens = comMarcas(ITENS(), '8101:1:1', [marca('e-seis', 'entregue', 6)]);
  const semMarca = {numero:'8103', tipo:'interno', cliente:'Cliente Fictício', liberadoPCP:true, itens:[{uid:'8103:1:1', item:'1', descricao:'Placa', qtde:'2'}]};
  const b = await bancada({registros:[row('1', pronta({itens})), row('3', semMarca)], papel:'operacao', cracha:OPERACAO_C});
  b.run(`perguntarSaldoEntrega = (os, p, cb) => cb('marcar');
    perguntarRetrabalho = (os, cb) => { os.retrabalhoPerguntado = {em: nowISO(), por: 'Olga Balcão', resposta: 'nao'}; cb(); };`);
  // Caso ruim: a operação finaliza marcando 3 itens; o Desfazer deixaria as 3 marcas valendo R$.
  b.run(`finalizarServicoDoCard('1')`);
  await b.esvaziar();
  assert.ok(gravada(b.e).finalizadaEm);
  assert.ok(!b.toasts.some(([, t]) => t === 'desfazer'), 'sem o Desfazer de um toque');
  assert.ok(b.toasts.some(([m]) => /Serviço finalizado 🏁 · 3 itens marcados hoje\. Para desfazer, fale com o PCP\./.test(m)));
  // Sem marca criada, o Desfazer continua como antes.
  b.run(`finalizarServicoDoCard('3')`);
  await b.esvaziar();
  assert.ok(b.toasts.some(([m, t]) => t === 'desfazer' && /^Retirada registrada 📦$/.test(m)));
  b.run('__desfazer()');
  await b.esvaziar();
  assert.equal(gravada(b.e, '3').finalizadaEm || '', '');
});

/* ───────────── Retrabalho: só o que a resposta mudou ───────────── */

test('revisão: a resposta do retrabalho não apaga a obs de fechamento que outro tablet escreveu com a pergunta aberta', async () => {
  const A = await bancada({registros:[row('1', pronta({checkout:{situacao:'', obs:'obs antiga'}}))]});
  const B = await bancada({e:A.e});
  A.abrir('1');
  A.run(`perguntarRetrabalho = (os, cb) => { __retrab = [os, cb]; };`);
  A.run('finalizarDaFicha(false)');
  // Caso ruim: B escreve a obs de fechamento; o pull troca a ficha de A.
  B.abrir('1');
  B.run(`_modalDraft.checkout.obs = 'obs nova do PCP'; saveDraft();`);
  await B.esvaziar();
  await A.S.pull(() => {});
  A.run('atualizarFichaAberta()');
  assert.equal(A.run('_modalDraft.checkout.obs'), 'obs nova do PCP');
  // A responde "Não" (o que o perguntarRetrabalho de verdade grava) e conclui.
  A.run(`(() => { const [os, cb] = __retrab; os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); })()`);
  await A.esvaziar();
  const g = gravada(A.e);
  assert.ok(g.finalizadaEm);
  assert.equal(g.checkout.obs, 'obs nova do PCP', 'a obs nova ficou');
  assert.equal(g.checkout.situacao, 'Finalizado');
  assert.equal(g.retrabalhoPerguntado.resposta, 'nao', 'a resposta foi junto');
});

test('revisão: o "Não" na O.S. marcada como retrabalho leva a situação e o desmarque, e a obs nova fica', async () => {
  const A = await bancada({registros:[row('1', pronta({retrabalho:true, problema:'Letra torta', checkout:{situacao:'Retrabalho', obs:'obs antiga'}}))]});
  const B = await bancada({e:A.e});
  A.abrir('1');
  A.run(`perguntarRetrabalho = (os, cb) => { __retrab = [os, cb]; };`);
  A.run('finalizarDaFicha(false)');
  B.abrir('1');
  B.run(`_modalDraft.checkout.obs = 'obs nova do PCP'; saveDraft();`);
  await B.esvaziar();
  await A.S.pull(() => {});
  A.run('atualizarFichaAberta()');
  // O "Não" de verdade numa O.S. marcada: desmarca o retrabalho e a situação.
  A.run(`(() => { const [os, cb] = __retrab; os.retrabalho = false; os.checkout.situacao = ''; os.problema = ''; os.etapaOrigem = ''; os.causaRaiz = ''; os.responsavelEtapa = '';
    os.retrabalhoPerguntado = {em: nowISO(), por: 'Gestor Teste', resposta: 'nao'}; cb(); })()`);
  await A.esvaziar();
  const g = gravada(A.e);
  assert.ok(g.finalizadaEm);
  assert.equal(g.retrabalho, false);
  assert.equal(g.problema, '');
  assert.equal(g.checkout.situacao, 'Finalizado', 'a situação Retrabalho saiu');
  assert.equal(g.checkout.obs, 'obs nova do PCP');
});

/* ───────────── selo do card com item cancelado ───────────── */

test('revisão: o selo do card não diz "Itens entregues" com tudo cancelado, nem "parcial 0 de 1" com a parte num item cancelado', async () => {
  const it = (k, desc, qtde, entregas) => ({uid:`83:${k}:1`, item:String(k), descricao:desc, qtde, ...(entregas ? {entregas} : {})});
  const os = (numero, itens, extra = {}) => ({numero, tipo:'externo', cliente:'Cliente Fictício', liberadoPCP:true, itens, ...extra});
  const casos = [
    // Caso ruim 1: todos os itens cancelados, nada entregue.
    os('9002', [it(1, 'Placa', '1', [marca('b1', 'cancelado', 0, {motivo:'Cliente desistiu'})]), it(2, 'Lona', '1', [marca('b2', 'cancelado', 0, {motivo:'Cliente desistiu'})])]),
    // Caso ruim 2: a parte entregue foi de um item cancelado depois; o outro está a entregar.
    os('9003', [it(1, 'Placa', '4', [marca('c1', 'entregue', 2), marca('c2', 'cancelado', 0, {motivo:'Sobrou'})]), it(2, 'Lona', '1')]),
    // Os que continuam: parcial de verdade, e tudo entregue com um cancelado.
    os('9001', [it(1, 'Placa', '1', [marca('a1', 'entregue', 1)]), it(2, 'Lona', '1', [marca('a2', 'entregue', 1)]),
      it(3, 'Totem', '1', [marca('a3', 'cancelado', 0, {motivo:'Cliente desistiu'})]), it(4, 'Letreiro', '2', [marca('a4', 'problema', 0, {motivo:'Quebrou'})]), it(5, 'Adesivo', '1')]),
    os('9005', [it(1, 'Placa', '1', [marca('d1', 'entregue', 1)]), it(2, 'Lona', '1', [marca('d2', 'cancelado', 0, {motivo:'Cliente desistiu'})])]),
  ];
  const b = await bancada({registros:casos.map((o, i) => row(String(i + 1), o))});
  const selo = id => b.run(`seloEntregaCardHTML(STORE.getOS('${id}'))`).replace(/<[^>]+>/g, '').trim();
  assert.doesNotMatch(selo('1'), /Itens entregues/, 'nada foi entregue');
  assert.doesNotMatch(selo('2'), /Entrega parcial/, 'a parte entregue foi de item cancelado');
  assert.equal(selo('3'), '📦 Entrega parcial 2 de 4 ⚠ 1 item com problema');
  assert.equal(selo('4'), '📦 Itens entregues: falta finalizar');
});
