/* CÓDIGO FIXO POR ITEM (E1 do plano de entrega por item, 29/09/2026). O item da
   O.S. não tinha id: a marca do instalador casava pelo número e pela
   descrição, e 10 O.S. reais têm o par repetido. Cada teste começa pelo caso
   ruim: marca que cai no item vizinho, aba antiga que apaga o código, item
   removido que desloca a marca dos outros, PDF substituído que herda marca,
   dois aparelhos sem rede que criam o mesmo código, importação do ERP que
   troca o código na segunda vez, toque que cria item. Dados fictícios: o
   repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const O = require('../operacao.js');
const {edge} = require('./helpers/edge.cjs');
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
const toque = {nome:'Ana', papel:'montagem', montagemIndividual:true};
const gestao = {nome:'Gestor', papel:'pcp'};
const pronta = (extra = {}) => row('1', {numero:'7001', tipo:'externo', cliente:'Cliente Teste', equipe:['Ana'], liberadoPCP:true, confirmacao:'Confirmado', ...extra});
const semUid = itens => itens.map(({uid: _u, ...x}) => x);
const reg = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);

/* ── O casamento (servidor e aparelho) ─────────────────────────────────── */

test('casamento: com o par número+descrição repetido, o código decide, em qualquer ordem', async () => {
  const R = await regras();
  const antes = [{uid:'7001:1:1', item:'1', descricao:'Placa'}, {uid:'7001:1:2', item:'1', descricao:'Placa'}];
  const novos = [{uid:'7001:1:2', item:'1', descricao:'Placa'}, {uid:'7001:1:1', item:'1', descricao:'Placa'}];
  assert.deepEqual(R.casarItens(antes, novos), [1, 0]);
  assert.deepEqual([...O.casarItens(antes, novos)], [1, 0], 'a cópia do aparelho casa igual');
});

test('casamento: item com código que o outro lado não tem não cai para o número nem para a descrição', async () => {
  const R = await regras();
  const antes = [{uid:'m-velho', item:'1', descricao:'Lona'}];
  // "Substituir" do PDF: mesmo número, mesma descrição, código novo. Não é o mesmo item.
  assert.deepEqual(R.casarItens(antes, [{uid:'m-novo', item:'1', descricao:'Lona'}]), [-1]);
  // Aba antiga (sem código) casa pelo casamento de hoje.
  assert.deepEqual(R.casarItens(antes, [{item:'1', descricao:'Lona'}]), [0]);
});

test('casamento: sem código, o par repetido casa na ordem', async () => {
  const R = await regras();
  const antes = [{uid:'a', item:'1', descricao:'Placa'}, {uid:'b', item:'2', descricao:'Totem'}, {uid:'c', item:'1', descricao:'Placa'}];
  assert.deepEqual(R.casarItens(antes, semUid(antes)), [0, 1, 2]);
  // O item do meio saiu: os outros dois continuam com o próprio código.
  assert.deepEqual(R.casarItens(antes, semUid([antes[0], antes[2]])), [0, 2]);
});

test('paridade: o casamento do aparelho (operacao.js) é o mesmo do servidor em 400 casos gerados', async () => {
  const R = await regras();
  let semente = 7;
  const sorte = n => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente % n; };
  for (let caso = 0; caso < 400; caso++) {
    const antes = Array.from({length: sorte(6)}, (_, i) => ({
      ...(sorte(3) ? {uid: 'u' + sorte(5)} : {}), item: String(1 + sorte(3)), descricao: ['Placa', 'Lona', 'Totem'][sorte(3)], k: i}));
    const novos = Array.from({length: sorte(6)}, () => {
      const base = antes.length && sorte(4) ? {...antes[sorte(antes.length)]} : {item: String(1 + sorte(4)), descricao: ['Placa', 'Adesivo'][sorte(2)]};
      if (sorte(3) === 0) delete base.uid; else if (sorte(5) === 0) base.uid = 'u' + sorte(7);
      if (sorte(6) === 0) base.descricao = 'Mudou';
      return base;
    });
    if (sorte(8) === 0) novos.push(null);
    assert.deepEqual([...O.casarItens(antes, novos)], R.casarItens(antes, novos), 'caso ' + caso);
  }
  assert.equal(O.uidItemValido('7001:1:1'), R.uidItemValido('7001:1:1'));
  assert.equal(O.uidItemValido('<img>'), R.uidItemValido('<img>'));
});

/* ── Servidor: o toque ─────────────────────────────────────────────────── */

test('toque: com número e descrição repetidos, a marca vai para o item certo pelo código', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[
    {uid:'7001:1:1', item:'1', descricao:'Placa', statusInst:''}, {uid:'7001:1:2', item:'1', descricao:'Placa', statusInst:''}]})]});
  // O celular manda só o segundo (a lista dele foi podada, ou a ordem mudou).
  const r = await e.call({action:'upsert', os:{id:'1', rev:1, itens:[{uid:'7001:1:2', item:'1', descricao:'Placa', statusInst:'retrab', motivo:'Medida errada'}]}}, toque);
  assert.equal(r.status, 200);
  const g = reg(e);
  assert.equal(g.itens[0].statusInst, '', 'o vizinho com o mesmo par não recebe a marca');
  assert.equal(g.itens[1].statusInst, 'retrab');
  assert.equal(g.itens[1].motivo, 'Medida errada');
  assert.deepEqual(g.itens.map(i => i.uid), ['7001:1:1', '7001:1:2']);
});

test('toque nunca cria item, nem com código que o PCP não tem; a marca perdida vira aviso', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{uid:'m-a1', item:'1', descricao:'Fachada', statusInst:''}]})]});
  const r = await e.call({action:'upsert', os:{id:'1', rev:1, itens:[
    {uid:'m-a1', item:'1', descricao:'Fachada', statusInst:'ok'},
    {uid:'m-inventado', item:'2', descricao:'Item que o aparelho inventou', statusInst:'ok'},
    {item:'3', descricao:'Outro sem código', statusInst:'ok'}]}}, toque);
  assert.equal(r.status, 200);
  const g = reg(e);
  assert.equal(g.itens.length, 1);
  assert.equal(g.itens[0].statusInst, 'ok');
  assert.match(r.avisos.join(' '), /2 marcas de item não foram gravadas/);
});

test('toque: o PCP removeu um item manual com a equipe na rua; a marca do removido não pula para o vizinho', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[
    {uid:'m-a', item:'1', descricao:'Placa', manual:true, statusInst:''},
    {uid:'m-c', item:'3', descricao:'Placa', manual:true, statusInst:''}]})]});
  // O celular ainda tem a lista velha, com o item 2 (m-b) no meio.
  const r = await e.call({action:'upsert', os:{id:'1', rev:1, itens:[
    {uid:'m-a', item:'1', descricao:'Placa', statusInst:''},
    {uid:'m-b', item:'2', descricao:'Placa', statusInst:'retrab', motivo:'Quebrou'},
    {uid:'m-c', item:'3', descricao:'Placa', statusInst:'ok'}]}}, toque);
  assert.equal(r.status, 200);
  const g = reg(e);
  assert.equal(g.itens[1].uid, 'm-c');
  assert.equal(g.itens[1].statusInst, 'ok', 'a marca do item 3 fica no item 3');
  assert.equal(g.itens[0].statusInst, '', 'a marca do removido não cai no primeiro');
  assert.match(r.avisos.join(' '), /A marca do item 2 não foi gravada/);
});

/* ── Servidor: gravação da gestão ──────────────────────────────────────── */

test('aba antiga (v133) manda a lista sem código: o código volta, item a item, e a marca nova grava', async () => {
  const itens = [{uid:'7001:1:1', item:'1', descricao:'Placa', pronto:false}, {uid:'m-x9', item:'2', descricao:'Lona', manual:true, pronto:false},
    {uid:'7001:1:2', item:'1', descricao:'Placa', pronto:false}];
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens})]});
  const velha = semUid(itens).map((it, i) => i === 2 ? {...it, pronto:true} : it);
  const r = await e.call({action:'upsert', os:{...reg(e), itens:velha}}, gestao);
  assert.equal(r.ok, true);
  const g = reg(e);
  assert.deepEqual(g.itens.map(i => i.uid), ['7001:1:1', 'm-x9', '7001:1:2']);
  assert.deepEqual(g.itens.map(i => !!i.pronto), [false, false, true], 'o Verificado ficou no terceiro, não no primeiro do mesmo par');
  assert.deepEqual(r.os.itens.map(i => i.uid), ['7001:1:1', 'm-x9', '7001:1:2'], 'a resposta leva o código de volta ao aparelho');
});

test('aba antiga remove um item manual: os outros ficam com o próprio código', async () => {
  const itens = [{uid:'m-a', item:'1', descricao:'Placa', manual:true}, {uid:'m-b', item:'2', descricao:'Placa', manual:true}, {uid:'m-c', item:'3', descricao:'Placa', manual:true}];
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens})]});
  await e.call({action:'upsert', os:{...reg(e), itens:semUid([itens[0], itens[2]])}}, gestao);
  assert.deepEqual(reg(e).itens.map(i => i.uid), ['m-a', 'm-c']);
});

test('item antigo sem código ganha o código na próxima gravação normal, e ele não muda depois', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({origemMubisys:true, itens:[
    {item:'1', descricao:'Fachada'}, {item:'1', descricao:'Fachada'}, {item:'2', descricao:'Placa'}, {item:'3', descricao:'Ajuste', manual:true}]})]});
  assert.equal(reg(e).itens[0].uid, undefined, 'nada é gravado em lote: só na gravação da O.S.');
  await e.call({action:'upsert', os:{...reg(e), obsPCP:'primeira gravação'}}, gestao);
  const uids = reg(e).itens.map(i => i.uid);
  assert.deepEqual(uids.slice(0, 3), ['7001:1:1', '7001:1:2', '7001:2:1'], 'item do ERP: o mesmo código que a importação daria');
  assert.match(uids[3], /^s-[0-9a-z]{10,}$/, 'item manual antigo: código do servidor');
  // Aba antiga, a lista em outra ordem e sem código: o código segue o item.
  // Os dois "1 Fachada" são iguais em tudo: sem código, casam na ordem em que aparecem.
  const volta = semUid(reg(e).itens).reverse();
  await e.call({action:'upsert', os:{...reg(e), itens:volta}}, gestao);
  const esperado = [uids[3], uids[2], uids[0], uids[1]];
  assert.deepEqual(reg(e).itens.map(i => i.uid), esperado);
  await e.call({action:'upsert', os:{...reg(e), obsPCP:'terceira'}}, gestao);
  assert.deepEqual(reg(e).itens.map(i => i.uid), esperado, 'estável entre gravações');
});

test('o código carimbado não vira alteração de itens no diário', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{item:'1', descricao:'Fachada'}]})]});
  await e.call({action:'upsert', os:{...reg(e), obsPCP:'só isto'}}, gestao);
  assert.ok(reg(e).itens[0].uid, 'carimbou');
  assert.ok(!diario(e).some(d => d.campos.includes('itens')), 'carimbo do servidor não é mudança de ninguém');
  await e.call({action:'upsert', os:{...reg(e), itens:[{...reg(e).itens[0], pronto:true}]}}, gestao);
  assert.ok(diario(e).some(d => d.campos.includes('itens')), 'a marca de verdade continua no diário');
});

test('"Substituir" do PDF: o item novo tem código novo e não herda a marca do velho de mesmo número', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{uid:'m-velho', item:'1', descricao:'Lona', manual:true, statusInst:'ok', pronto:true}]})]});
  await e.call({action:'upsert', os:{...reg(e), itens:[{uid:'m-novo1', item:'1', descricao:'Lona', manual:true, pronto:false}]}}, gestao);
  const g = reg(e);
  assert.equal(g.itens.length, 1);
  assert.equal(g.itens[0].uid, 'm-novo1');
  assert.equal(g.itens[0].statusInst, undefined);
});

test('dois aparelhos sem rede criando item manual na mesma O.S. não colidem', async () => {
  const vistos = new Set();
  for (let i = 0; i < 3000; i++) {
    const u = O.novoUidItem();
    assert.match(u, /^m-[0-9a-z]{10,}$/);
    assert.ok(!vistos.has(u), 'código repetido: ' + u);
    vistos.add(u);
  }
  // E se chegar repetido (item copiado), o servidor dá código novo ao segundo e mantém o primeiro.
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{uid:'m-dup', item:'1', descricao:'Placa', manual:true}]})]});
  await e.call({action:'upsert', os:{...reg(e), itens:[{uid:'m-dup', item:'1', descricao:'Placa', manual:true}, {uid:'m-dup', item:'2', descricao:'Placa', manual:true}]}}, gestao);
  const uids = reg(e).itens.map(i => i.uid);
  assert.equal(uids[0], 'm-dup');
  assert.notEqual(uids[1], 'm-dup');
  assert.ok(O.uidItemValido(uids[1]));
});

test('código fora do formato vindo do aparelho não entra: vale o gravado ou um novo', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{uid:'m-bom', item:'1', descricao:'Placa'}]})]});
  await e.call({action:'upsert', os:{...reg(e), itens:[{uid:'<img src=x>', item:'1', descricao:'Placa'}, {uid:'x'.repeat(200), item:'2', descricao:'Novo'}]}}, gestao);
  const uids = reg(e).itens.map(i => i.uid);
  assert.equal(uids[0], 'm-bom');
  assert.ok(O.uidItemValido(uids[1]) && uids[1].length < 100);
});

/* ── Importação do ERP ─────────────────────────────────────────────────── */

test('importação do ERP: código <numero>:<posicao>:<k>, o mesmo na segunda vez', async () => {
  const e = await edge('pcp-mubisys');
  const remoto = {sequencial_ordem:'7001', itens:[{posicao:'1', descricao:'Fachada'}, {posicao:'1', descricao:'Fachada'}, {posicao:'2', descricao:'Placa'}, {descricao:'Sem posição'}]};
  const a = JSON.parse(e.run(`JSON.stringify(mapearOS(${JSON.stringify(remoto)}))`));
  const b = JSON.parse(e.run(`JSON.stringify(mapearOS(${JSON.stringify(remoto)}))`));
  assert.deepEqual(a.itens.map(i => i.uid), ['7001:1:1', '7001:1:2', '7001:2:1', '7001:4:1']);
  assert.deepEqual(b.itens.map(i => i.uid), a.itens.map(i => i.uid), 'idempotente');
  const os = JSON.parse(e.run(`JSON.stringify(montarOSImportada(mapearOS(${JSON.stringify(remoto)})))`));
  assert.deepEqual(os.itens.map(i => i.uid), a.itens.map(i => i.uid), 'a O.S. importada guarda o código');
});

/* ── Aparelho da gestão (app.js) ───────────────────────────────────────── */

function tela() {
  const nodes = new Map(), criados = [], respostas = [];
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  }
  const doc = {querySelector:node, querySelectorAll:()=>[], addEventListener(){}, createElement: tag => { const el = {tag, click(){}}; criados.push(el); return el; }};
  const ctx = vm.createContext({console, document:doc, window:{}, localStorage:{getItem:()=>null},
    STORE:{getAllOS:()=>[], getCFG:()=>({}), getOS:()=>null, uuid:()=>'id-novo', saveOS(){}},
    confirm: () => respostas.length ? respostas.shift() : true, setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'pcp'}; renderModal=()=>{}; renderActiveTab=()=>{}; toast=()=>{}; saveDraft=()=>{}; reRenderModalKeepOpen=()=>{};`, ctx);
  return {run: c => vm.runInContext(c, ctx), json: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)), criados, respostas};
}

test('app: item do PDF nasce com código próprio; "Substituir" dá códigos novos', async () => {
  const t = tela();
  const texto = ['Item Descrição Medidas Qtde Valor', '1 Lona impressa', '1,00 x 2,00 3 R$ 10,00 R$ 30,00', 'Total'].join('\n');
  const itens = t.json(`parseItensPDF(${JSON.stringify(texto)})`);
  assert.equal(itens.length, 1);
  assert.match(itens[0].uid, /^m-/);
  t.run(`lerPDF = async () => ({texto:${JSON.stringify(texto)}}); __draft = {itens:[{uid:'m-velho', item:'1', descricao:'Lona impressa', statusInst:'ok'}]}; importarItensPDF(__draft)`);
  const inp = t.criados.find(el => el.tag === 'input');
  inp.files = [{}];
  await inp.onchange();
  const depois = t.json('__draft.itens');
  assert.equal(depois.length, 1);
  assert.notEqual(depois[0].uid, 'm-velho');
  assert.match(depois[0].uid, /^m-/);
  assert.equal(depois[0].statusInst, undefined);
});

test('app: "+ Item manual" nasce com código; a linha da ficha leva o código e o handler acha o item por ele', () => {
  const t = tela();
  t.run(`_modalDraft = {id:'1', itens:[{uid:'7001:1:1', item:'1', descricao:'Fachada'}]};`);
  // O handler do botão só existe com DOM de verdade; a regra do item novo é esta:
  const novo = t.json(`novoItemManual(_modalDraft.itens)`);
  assert.equal(novo.item, '2');
  assert.match(novo.uid, /^m-/);
  assert.equal(novo.manual, true);
  const html = t.run(`blocoItens({id:'1', itens:[{uid:'7001:1:1', item:'1', descricao:'Fachada'}, {item:'2', descricao:'Antigo sem código'}]}, false, false)`);
  assert.match(html, /data-iuid="7001:1:1"/);
  // Pelo código, mesmo que a lista tenha mudado de ordem depois de desenhar.
  t.run(`_modalDraft.itens = [{uid:'m-z', item:'9', descricao:'Outro'}, {uid:'7001:1:1', item:'1', descricao:'Fachada'}]`);
  assert.equal(t.json(`itemDoDraft(_modalDraft.itens, '0', '7001:1:1')`).descricao, 'Fachada');
  assert.equal(t.run(`itemDoDraft(_modalDraft.itens, '0', 'm-sumiu')`), null, 'código que saiu da lista não cai no item da posição');
  assert.equal(t.json(`itemDoDraft(_modalDraft.itens, '0', '')`).descricao, 'Outro', 'item antigo sem código: pela posição, como antes');
});

test('app: "Sobrescrever" traz a marca da rua para o item certo pelo código, mesmo com item removido no meio', () => {
  const t = tela();
  const r = t.json(`(() => {
    const local = {id:'c1', itens:[{uid:'m-a', item:'1', descricao:'Placa'}, {uid:'m-c', item:'3', descricao:'Placa'}]};
    const remote = {id:'c1', itens:[{uid:'m-a', item:'1', descricao:'Placa'}, {uid:'m-b', item:'2', descricao:'Placa', statusInst:'retrab', motivo:'Quebrou'},
      {uid:'m-c', item:'3', descricao:'Placa', statusInst:'ok'}]};
    manterExecucaoDoServidor(local, remote);
    return local.itens;
  })()`);
  assert.equal(r[0].statusInst, undefined, 'o primeiro não recebe a marca do removido');
  assert.equal(r[1].statusInst, 'ok');
});

/* ── Celular do instalador (equipe.js) ─────────────────────────────────── */

function espelho() {
  const ctx = vm.createContext({console, Date, document:{querySelector:() => ({classList:{add(){}, remove(){}}}), querySelectorAll:()=>[], addEventListener(){}},
    window:{}, localStorage:{getItem:()=>null, setItem(){}}, STORE:{getQueue:()=>[], getCFG:()=>({}), getAllOS:()=>[]}, setTimeout(){}, navigator:{onLine:true}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8'), ctx);
  return {json: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx))};
}

test('celular: a foto do problema volta para o item certo pelo código, não pela posição', () => {
  const t = espelho();
  const r = t.json(`juntarFotos(
    {itens:[{uid:'u2', item:'1', descricao:'Placa'}, {uid:'u1', item:'1', descricao:'Placa'}]},
    {itens:[{uid:'u1', item:'1', descricao:'Placa', fotoProbId:'foto_u1'}, {uid:'u2', item:'1', descricao:'Placa'}]}).itens`);
  assert.equal(r[0].fotoProbId, undefined, 'u2 não tinha foto');
  assert.equal(r[1].fotoProbId, 'foto_u1');
});

test('celular: "o que se perde" compara a marca do mesmo item, não a da mesma posição', () => {
  const t = espelho();
  const txt = t.json(`oQueSePerde(
    {itens:[{uid:'u2', statusInst:'ok'}, {uid:'u1', statusInst:'retrab'}]},
    {itens:[{uid:'u1', statusInst:'retrab'}, {uid:'u2', statusInst:'ok'}]})`);
  assert.equal(txt, '', 'as duas marcas já estão no servidor');
});

/* ── Revisão da E1 (29/09/2026) ────────────────────────────────────────── */

/* O desempate "a mesma posição" comparava índices de duas listas diferentes:
   quando um item ANTES do par repetido saía, os códigos do par trocavam de
   item, calados (o diário não registra o código). */
test('casamento: item removido antes do par repetido não troca os códigos do par', async () => {
  const R = await regras();
  const antes = [{uid:'s-x', item:'1', descricao:'Adesivo', medidas:'0,5x0,5', manual:true},
    {uid:'s-p', item:'2', descricao:'Placa', medidas:'1x1', manual:true}, {uid:'s-q', item:'2', descricao:'Placa', medidas:'3x3', manual:true}];
  const novos = semUid([antes[1], antes[2]]);
  assert.deepEqual(R.casarItens(antes, novos), [1, 2]);
  assert.deepEqual([...O.casarItens(antes, novos)], [1, 2], 'a cópia do aparelho casa igual');
  // Saiu o PRIMEIRO do par: a 3x3 fica com o código dela, não com o da 1x1.
  assert.deepEqual(R.casarItens(antes, semUid([antes[0], antes[2]])), [0, 2]);
  assert.deepEqual([...O.casarItens(antes, semUid([antes[0], antes[2]]))], [0, 2]);
  // A gestão mudou a medida da 1x1 para 3x3: na ordem, cada um fica com o seu.
  const editado = semUid([antes[1], antes[2]]).map((it, k) => k === 0 ? {...it, medidas:'3x3'} : it);
  assert.deepEqual(R.casarItens(antes, editado), [1, 2]);
  assert.deepEqual([...O.casarItens(antes, editado)], [1, 2]);
});

test('ponta a ponta: rascunho sem código remove o item antes do par; a marca do celular fica na placa certa', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[
    {item:'1', descricao:'Adesivo', medidas:'0,5x0,5', manual:true},
    {item:'2', descricao:'Placa', medidas:'1x1', manual:true},
    {item:'2', descricao:'Placa', medidas:'3x3', manual:true}]})]});
  const rascunho = JSON.parse(JSON.stringify(reg(e)));        // ficha aberta antes do carimbo
  let r = await e.call({action:'upsert', os:{...rascunho, obsPCP:'1a gravação'}}, gestao);
  assert.equal(r.ok, true);
  const celular = JSON.parse(JSON.stringify(reg(e)));          // o celular puxa a lista carimbada
  const uid1x1 = celular.itens.find(i => i.medidas === '1x1').uid, uid3x3 = celular.itens.find(i => i.medidas === '3x3').uid;
  rascunho.rev = r.os.rev;
  rascunho.itens.splice(0, 1);                                 // × remover o Adesivo
  r = await e.call({action:'upsert', os:{...rascunho, obsPCP:'removi o adesivo'}}, gestao);
  assert.equal(r.ok, true);
  assert.equal(reg(e).itens.find(i => i.medidas === '1x1').uid, uid1x1, 'a 1x1 manteve o próprio código');
  assert.equal(reg(e).itens.find(i => i.medidas === '3x3').uid, uid3x3, 'a 3x3 manteve o próprio código');
  const itensCel = celular.itens.map(i => i.uid === uid1x1 ? {...i, statusInst:'retrab', motivo:'Medida errada'} : i);
  r = await e.call({action:'upsert', os:{id:'1', rev:reg(e).rev, itens:itensCel}}, toque);
  assert.equal(r.status, 200);
  assert.equal(reg(e).itens.find(i => i.medidas === '1x1').statusInst, 'retrab');
  assert.equal(reg(e).itens.find(i => i.medidas === '3x3').statusInst || '', '', 'a marca não foi para a 3x3');
});

/* Item novo vindo de aba antiga não pode herdar o código de quem saiu: o
   código é dado uma vez e nunca reaproveitado. */
test('"Substituir" do PDF numa aba antiga: o item do PDF não herda o código do item do ERP que saiu', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({origemMubisys:true, itens:[
    {uid:'7001:1:1', item:'1', descricao:'Fachada ACM'}, {uid:'7001:2:1', item:'2', descricao:'Letra caixa'}]})]});
  const aba = JSON.parse(JSON.stringify(reg(e)));
  aba.itens = [{item:'1', descricao:'Adesivo vitrine', manual:true}, {item:'2', descricao:'Banner', manual:true}]; // PDF da v134, sem código
  const r = await e.call({action:'upsert', os:aba}, gestao);
  assert.equal(r.ok, true);
  const g = reg(e).itens;
  assert.equal(g.length, 2);
  for (const it of g) {
    assert.match(it.uid, /^s-/, 'código novo');
    assert.ok(!['7001:1:1', '7001:2:1'].includes(it.uid));
  }
  const R = await regras();
  assert.deepEqual(R.casarItens([{uid:'7001:1:1', item:'1', descricao:'Placa'}], [{item:'1', descricao:'Placa', manual:true}]), [-1]);
  assert.deepEqual([...O.casarItens([{uid:'7001:1:1', item:'1', descricao:'Placa'}], [{item:'1', descricao:'Placa', manual:true}])], [-1]);
});

/* PRÉ-REQUISITO DA E3 (era limite conhecido da E1): a aba antiga remove um
   item manual e cria outro manual com o mesmo número (ou a mesma descrição)
   na mesma gravação. A lista que chega já conhece os códigos (o rascunho
   aberto adota o código da resposta do servidor), então o item SEM código
   é item novo: só fica com o código de um gravado se for o mesmo item, sem
   mudança nenhuma. Com a entrega por item presa ao código, herdar o código
   do removido seria herdar as entregas dele. */
test('aba antiga: item manual novo com o número do removido não herda o código dele', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[
    {uid:'s-lona0000001', item:'1', descricao:'Lona', manual:true},
    {uid:'s-placa000002', item:'2', descricao:'Placa', manual:true, pronto:true}]})]});
  const aba = JSON.parse(JSON.stringify(reg(e)));
  aba.itens.splice(1, 1);
  aba.itens.push({item:'2', descricao:'Totem', medidas:'', qtde:'1', manual:true});
  await e.call({action:'upsert', os:aba}, gestao);
  assert.notEqual(reg(e).itens[1].uid, 's-placa000002');
  assert.equal(reg(e).itens[0].uid, 's-lona0000001', 'o item que ficou segue com o próprio código');
  assert.equal(reg(e).itens[1].pronto, undefined, 'e o Verificado da placa não passa para o totem');
});
test('aba antiga: item manual novo com a descrição do removido não herda o código dele', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[
    {uid:'s-lona0000001', item:'1', descricao:'Lona', manual:true},
    {uid:'s-placa000002', item:'2', descricao:'Placa', manual:true}]})]});
  const aba = JSON.parse(JSON.stringify(reg(e)));
  aba.itens.splice(1, 1);
  aba.itens.push({item:'3', descricao:'Placa', qtde:'4', manual:true});
  await e.call({action:'upsert', os:aba}, gestao);
  assert.notEqual(reg(e).itens[1].uid, 's-placa000002');
});
test('aba antiga regrava, sem mudança, o item que ela criou sem código: ele fica com o código que o servidor deu', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{uid:'s-lona0000001', item:'1', descricao:'Lona', manual:true}]})]});
  const aba = JSON.parse(JSON.stringify(reg(e)));
  aba.itens.push({item:'2', descricao:'Totem', qtde:'1', manual:true});   // v134: item manual sem código
  let r = await e.call({action:'upsert', os:aba}, gestao);
  const dado = reg(e).itens[1].uid;
  assert.ok(O.uidItemValido(dado));
  aba.rev = r.os.rev; aba.obsPCP = 'de novo';                        // a aba v134 não adota o código
  r = await e.call({action:'upsert', os:aba}, gestao);
  assert.equal(r.ok, true);
  assert.deepEqual(reg(e).itens.map(i => i.uid), ['s-lona0000001', dado]);
});

/* ── O rascunho aberto adota o código da resposta (store, gestão, celular) ── */

// O store.js de verdade, com o operacao.js e o servidor de teste por trás do fetch.
function loja({lista = [], fila = [], responder}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', JSON.stringify(fila)]]);
  const db = {transaction(){ const tx = {objectStore:() => ({
    get(){ const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:null}})); return req; },
    put(){ queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log(){}, warn(){}, error(){}}, navigator:{onLine:true}, window:{addEventListener(){}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open(){ const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout:() => 1, clearTimeout(){}, AbortController, API_BASE:'http://teste',
    fetch:async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; }});
  vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  return vm.runInContext('STORE', ctx);
}
const esvaziar = async s => { for (let i = 0; i < 100 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); } };

test('store: a resposta do servidor dá o código ao rascunho aberto (o próprio objeto da lista)', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{item:'1', descricao:'Lona', manual:true}, {item:'2', descricao:'Placa', manual:true}]})]});
  const s = loja({lista:[reg(e)], responder:q => e.call(q, gestao)});
  await s.pronto();
  const rascunho = JSON.parse(JSON.stringify(s.getOS('1')));    // openModal: a cópia de trabalho
  rascunho.obsPCP = 'primeira gravação'; rascunho.atualizadoEm = new Date().toISOString();
  s.saveOS(rascunho);                                           // saveDraft: o rascunho vai para a lista
  await esvaziar(s);
  assert.deepEqual(rascunho.itens.map(i => i.uid), reg(e).itens.map(i => i.uid), 'o rascunho aberto ficou com os códigos do servidor');
  assert.ok(rascunho.itens.every(i => O.uidItemValido(i.uid)));
});

test('store: o envio que ficou na fila (editado durante o envio) adota o código; o item novo sem código não herda o do removido', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:[{item:'1', descricao:'Lona', manual:true}, {item:'2', descricao:'Placa', manual:true, pronto:true}]})]});
  let s = null, rascunho = null, primeiro = true, uidPlaca = '';
  s = loja({lista:[reg(e)], responder:async q => {
    if (q.action === 'upsert' && primeiro) {
      primeiro = false;
      // Enquanto a primeira gravação vai, a pessoa tira a placa e cria o totem 2 (sem código: caminho antigo).
      rascunho.itens.splice(1, 1);
      rascunho.itens.push({item:'2', descricao:'Totem', qtde:'1', manual:true});
      rascunho.atualizadoEm = new Date(Date.now() + 1000).toISOString();
      s.saveOS(rascunho);
      const r = await e.call(q, gestao);
      uidPlaca = r.os.itens.find(i => i.descricao === 'Placa').uid;   // o código que o servidor deu à placa
      return r;
    }
    return e.call(q, gestao);
  }});
  await s.pronto();
  rascunho = JSON.parse(JSON.stringify(s.getOS('1')));
  rascunho.obsPCP = 'primeira'; rascunho.atualizadoEm = new Date().toISOString();
  s.saveOS(rascunho);
  await esvaziar(s);
  assert.ok(O.uidItemValido(uidPlaca));
  const g = reg(e).itens;
  assert.deepEqual(g.map(i => i.descricao), ['Lona', 'Totem']);
  assert.notEqual(g[1].uid, uidPlaca, 'o totem não herdou o código da placa removida');
  assert.equal(g[1].pronto, undefined);
  assert.equal(rascunho.itens[0].uid, g[0].uid, 'o rascunho segue com o código da lona');
});

test('gestão: a ficha aberta com edição pendente adota o código que chegou, sem perder a edição', () => {
  const t = tela();
  t.run(`_modalDraft = {id:'1', rev:1, obsPCP:'digitando', itens:[{item:'1', descricao:'Lona'}, {item:'2', descricao:'Placa'}, {uid:'m-novo', item:'3', descricao:'Totem'}]};
    _modalDirty = true; STATE.modalOSId = '1';
    STORE.getOS = () => ({id:'1', rev:2, obsPCP:'antigo', itens:[{uid:'s-lona', item:'1', descricao:'Lona'}, {uid:'s-placa', item:'2', descricao:'Placa'}]});
    atualizarFichaAberta();`);
  const d = t.json('_modalDraft');
  assert.deepEqual(d.itens.map(i => i.uid), ['s-lona', 's-placa', 'm-novo']);
  assert.equal(d.obsPCP, 'digitando', 'a edição pendente fica');
});

test('celular: o rascunho com marca pendente adota o código que chegou', () => {
  const ctx = vm.createContext({console, Date, document:{querySelector:() => ({classList:{add(){}, remove(){}}}), querySelectorAll:()=>[], addEventListener(){}},
    window:{}, localStorage:{getItem:()=>null, setItem(){}}, STORE:{getQueue:()=>[], getCFG:()=>({}), getAllOS:()=>[]}, setTimeout(){}, navigator:{onLine:true}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8'), ctx);
  vm.runInContext(`EQ.modalId = '1'; _dirty = true; _draft = {id:'1', rev:1, itens:[{item:'1', descricao:'Placa', statusInst:'ok'}]};
    STORE.getOS = () => ({id:'1', rev:2, itens:[{uid:'7001:1:1', item:'1', descricao:'Placa'}]}); atualizarModalAberto();`, ctx);
  const d = JSON.parse(vm.runInContext('JSON.stringify(_draft)', ctx));
  assert.equal(d.itens[0].uid, '7001:1:1');
  assert.equal(d.itens[0].statusInst, 'ok', 'a marca pendente fica');
});

test('adotar o código: nunca troca código que o item já tem, nem repete código de outro item', () => {
  const alvo = {itens:[{uid:'m-a', item:'1', descricao:'Placa'}, {item:'1', descricao:'Placa'}]};
  const n = O.adotarUidsItens(alvo, {itens:[{uid:'m-a', item:'1', descricao:'Placa'}, {uid:'s-b', item:'1', descricao:'Placa'}]});
  assert.equal(n, 1);
  assert.deepEqual(alvo.itens.map(i => i.uid), ['m-a', 's-b']);
  const outro = {itens:[{uid:'m-x', item:'1', descricao:'Placa'}]};
  assert.equal(O.adotarUidsItens(outro, {itens:[{uid:'s-y', item:'1', descricao:'Placa'}]}), 0);
  assert.equal(outro.itens[0].uid, 'm-x');
  assert.equal(O.adotarUidsItens({itens:[{item:'9', descricao:'Sumiu'}]}, {itens:[{uid:'s-z', item:'1', descricao:'Outro'}]}), 0);
  // Mesmo número, outro item (a placa 2 saiu e o totem 2 entrou): não adota.
  const troca = {itens:[{item:'2', descricao:'Totem', manual:true}]};
  assert.equal(O.adotarUidsItens(troca, {itens:[{uid:'s-placa', item:'2', descricao:'Placa', manual:true}]}), 0);
  assert.equal(troca.itens[0].uid, undefined);
});

/* REVISÃO DA E3: a aba v135, a que está no ar, NÃO adota o código da
   resposta (só o rev). Ela dá 'm-' ao item que cria. O 'm-' não prova que a
   lista leu os códigos do servidor: contar com ele trocava o código do item
   antigo a cada gravação da ficha aberta. Dados fictícios. */
const abaV135 = async itensGravados => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({itens:itensGravados})]});
  const draft = JSON.parse(JSON.stringify(reg(e)));        // ficha aberta antes do primeiro carimbo
  draft.itens.push({uid:'m-novo00000001', item:'3', descricao:'Totem', qtde:'1', manual:true});
  const r = await e.call({action:'upsert', os:JSON.parse(JSON.stringify(draft))}, gestao);
  assert.equal(r.ok, true);
  draft.rev = r.os.rev;                                     // v135: o rev entra no rascunho, o código não
  return {e, draft};
};
test('aba v135: corrigir o item antigo depois de a lista ganhar um item "m-" não troca o código dele', async () => {
  const {e, draft} = await abaV135([{item:'1', descricao:'Lona', qtde:'1', manual:true}, {item:'2', descricao:'Placa', qtde:'5', manual:true}]);
  const uidPlaca = reg(e).itens[1].uid;
  assert.ok(O.uidItemValido(uidPlaca));
  for (const [campo, v] of [['qtde', '6'], ['descricao', 'Placa A'], ['descricao', 'Placa AC'], ['descricao', 'Placa ACM']]) {
    draft.itens[1][campo] = v;                              // o autosave grava a cada tecla
    const r = await e.call({action:'upsert', os:JSON.parse(JSON.stringify(draft))}, gestao);
    assert.equal(r.ok, true);
    draft.rev = r.os.rev;
    assert.equal(reg(e).itens[1].uid, uidPlaca, `a placa trocou de código com ${campo}=${v}`);
  }
  assert.equal(reg(e).itens.length, 3);
  // O celular que baixou a O.S. carimbada marca Instalado na placa: grava.
  const cel = JSON.parse(JSON.stringify(reg(e)));
  cel.itens[1].statusInst = 'ok';
  const r = await e.call({action:'upsert', os:cel}, toque);
  assert.equal(r.ok, true);
  assert.equal(reg(e).itens[1].statusInst, 'ok');
  assert.equal((r.avisos || []).filter(a => /não foi gravada/.test(a)).length, 0);
});
test('aba v135 e item com entrega: corrigir a quantidade fica no mesmo item; trocar o produto não leva a entrega', async () => {
  const {e, draft} = await abaV135([{item:'1', descricao:'Lona', qtde:'1', manual:true}, {item:'2', descricao:'Placa', qtde:'4', manual:true}]);
  // Outra aba (a tela da E4) marca 2 placas entregues.
  const nova = JSON.parse(JSON.stringify(reg(e)));
  nova.itens[1].entregas = [{id:'e-1', tipo:'entregue', qtde:2, dia:'2026-09-28'}];
  let r = await e.call({action:'upsert', os:nova}, gestao);
  const uidPlaca = reg(e).itens[1].uid;
  assert.equal(reg(e).itens[1].entregas.length, 1);
  // A aba v135 corrige a quantidade (Sobrescrever manda com o rev do servidor): o mesmo produto, o mesmo item.
  draft.rev = r.os.rev; draft.itens[1].qtde = '5';
  r = await e.call({action:'upsert', os:JSON.parse(JSON.stringify(draft))}, gestao);
  assert.deepEqual(reg(e).itens.map(i => [i.uid === uidPlaca, i.descricao, i.qtde, (i.entregas || []).length]),
    [[false, 'Lona', '1', 0], [true, 'Placa', '5', 1], [false, 'Totem', '1', 0]]);
  // Agora troca o produto: a entrega fica com a placa (que volta, com aviso) e o item novo nasce sem marca.
  draft.rev = r.os.rev; draft.itens[1].descricao = 'Placa ACM';
  r = await e.call({action:'upsert', os:JSON.parse(JSON.stringify(draft))}, gestao);
  const g = reg(e).itens;
  const placa = g.find(i => i.uid === uidPlaca), acm = g.find(i => i.descricao === 'Placa ACM');
  assert.equal(placa.descricao, 'Placa');
  assert.equal(placa.entregas.length, 1, 'a entrega ficou com a placa');
  assert.ok(acm && acm.uid !== uidPlaca && !acm.entregas, 'o item novo não herdou código nem entrega');
  assert.ok((r.avisos || []).some(a => /item com entrega não sai da lista/.test(a)), 'e a gestão foi avisada');
  // Seguir digitando não troca o código do item novo a cada gravação.
  const uidAcm = acm.uid;
  draft.rev = r.os.rev; draft.itens[1].descricao = 'Placa ACM 3mm';
  r = await e.call({action:'upsert', os:JSON.parse(JSON.stringify(draft))}, gestao);
  assert.equal(reg(e).itens.find(i => i.descricao === 'Placa ACM 3mm').uid, uidAcm);
  assert.equal(reg(e).itens.find(i => i.uid === uidPlaca).entregas.length, 1);
});
test('aba sem código nenhum tira a placa com entrega e cria o totem com o mesmo número: o totem não herda código nem entrega', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({rev:3, itens:[
    {uid:'s-lona0000001', item:'1', descricao:'Lona', qtde:'1', manual:true},
    {uid:'s-placa000002', item:'2', descricao:'Placa', qtde:'4', manual:true,
     entregas:[{id:'e-1', tipo:'entregue', qtde:2, dia:'2026-09-28', via:'gestao', por:'Gestor', porId:'', em:'2026-09-28T12:00:00Z'}]}]})]});
  // A cópia da aba antiga, de antes do primeiro carimbo: sem código e sem entrega.
  const aba = {id:'1', rev:3, numero:'7001', tipo:'externo', cliente:'Cliente Teste', equipe:['Ana'], liberadoPCP:true, confirmacao:'Confirmado',
    itens:[{item:'1', descricao:'Lona', qtde:'1', manual:true}, {item:'2', descricao:'Totem', qtde:'1', manual:true}]};
  const r = await e.call({action:'upsert', os:aba}, gestao);
  assert.equal(r.ok, true);
  const g = reg(e).itens;
  const totem = g.find(i => i.descricao === 'Totem'), placa = g.find(i => i.uid === 's-placa000002');
  assert.notEqual(totem.uid, 's-placa000002', 'o totem herdou o código da placa');
  assert.equal(totem.entregas, undefined, 'o totem herdou a entrega da placa');
  assert.equal(placa.descricao, 'Placa');
  assert.equal(placa.entregas.length, 1);
  assert.equal(g.find(i => i.descricao === 'Lona').uid, 's-lona0000001', 'a lona segue com o código dela');
  assert.ok((r.avisos || []).some(a => /item com entrega não sai da lista/.test(a)));
});
test('aba sem código nenhum que só corrige a quantidade do item com entrega: a entrega fica no item', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[pronta({rev:3, itens:[
    {uid:'s-placa000002', item:'1', descricao:'Placa', qtde:'4', manual:true,
     entregas:[{id:'e-1', tipo:'entregue', qtde:2, dia:'2026-09-28', via:'gestao', por:'Gestor', porId:'', em:'2026-09-28T12:00:00Z'}]}]})]});
  const aba = {id:'1', rev:3, numero:'7001', tipo:'externo', cliente:'Cliente Teste', equipe:['Ana'], liberadoPCP:true, confirmacao:'Confirmado',
    itens:[{item:'1', descricao:'Placa', qtde:'5', manual:true}]};
  const r = await e.call({action:'upsert', os:aba}, gestao);
  assert.equal(r.ok, true);
  assert.deepEqual(reg(e).itens.map(i => [i.uid, i.qtde, (i.entregas || []).length]), [['s-placa000002', '5', 1]]);
});

/* CACHE MISTO. O último recurso do sw.js serve o arquivo de outra versão
   quando o da versão nova não chega: equipe.js e app.js novos com o
   operacao.js da v134, que não tem casarItens, uidItemValido nem
   novoUidItem. A ficha tem de abrir e o diálogo de conflito tem de
   funcionar, com o casamento de antes. */
function semFuncoesE1(ctx) {
  vm.runInContext('delete OPERACAO.casarItens; delete OPERACAO.uidItemValido; delete OPERACAO.novoUidItem;', ctx);
}
test('cache misto no celular: operacao.js antigo com equipe.js novo abre a ficha e o conflito', () => {
  const nodes = new Map();
  const node = sel => {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){}, add(){}, remove(){}}});
    return nodes.get(sel);
  };
  const ctx = vm.createContext({console, Date, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}}, window:{},
    localStorage:{getItem:()=>null, setItem(){}}, STORE:{getQueue:()=>[], getCFG:()=>({}), getAllOS:()=>[], getOS:()=>null},
    setTimeout(){}, navigator:{onLine:true}, confirm:()=>true});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  semFuncoesE1(ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8'), ctx);
  const run = c => vm.runInContext(c, ctx);
  const junto = JSON.parse(run(`JSON.stringify(juntarFotos({itens:[{uid:'u1', item:'1', descricao:'Placa'}]}, {itens:[{uid:'u1', item:'1', descricao:'Placa', fotoProbId:'f1'}]}).itens)`));
  assert.equal(junto[0].fotoProbId, 'f1', 'sem o casamento novo, vale o de antes (posição e número)');
  assert.equal(run(`oQueSePerde({itens:[{item:'1', statusInst:'ok'}]}, {itens:[{item:'1'}]})`), '1 item marcado');
  run(`toast=()=>{}; fraseAleatoria=()=>""; EQ.instalador="Ana"; _draft = ${JSON.stringify({id:'1', numero:'300', tipo:'externo', equipe:['Ana'], liberadoPCP:true, confirmacao:'Confirmado',
    instalacao:{data:'2026-09-23', periodo:'Manhã'}, itens:[{uid:'7001:1:1', item:'1', descricao:'Fachada'}, {item:'2', descricao:'Sem código'}]})}; renderModal()`);
  assert.match(node('#modal-os').innerHTML, /data-iuid="7001:1:1"/, 'a ficha abre com os cartões dos itens');
});
test('cache misto na gestão: operacao.js antigo com app.js novo abre a ficha, cria item e mantém a marca da rua', () => {
  const nodes = new Map();
  const node = sel => {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){}, add(){}, remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  };
  const ctx = vm.createContext({console, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}, createElement:tag => ({tag, click(){}})}, window:{},
    localStorage:{getItem:()=>null}, STORE:{getAllOS:()=>[], getCFG:()=>({}), getOS:()=>null, uuid:()=>'id-novo', saveOS(){}},
    confirm:()=>true, setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  semFuncoesE1(ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  const run = c => vm.runInContext(c, ctx);
  run(`STATE.user={nome:'Revisão',papel:'pcp'}; toast=()=>{};`);
  const html = run(`blocoItens({id:'1', itens:[{uid:'7001:1:1', item:'1', descricao:'Fachada'}, {item:'2', descricao:'Sem código'}]}, false, false)`);
  assert.match(html, /data-iuid="7001:1:1"/);
  const novo = JSON.parse(run(`JSON.stringify(novoItemManual([{item:'1'}]))`));
  assert.match(novo.uid, /^m-[a-z0-9]{12}$/, 'o item novo ganha código mesmo sem o operacao.js novo');
  const itens = JSON.parse(run(`(() => { const local = {id:'c1', itens:[{item:'1', descricao:'Placa'}]};
    manterExecucaoDoServidor(local, {id:'c1', itens:[{item:'1', descricao:'Placa', statusInst:'ok'}]}); return JSON.stringify(local.itens); })()`));
  assert.equal(itens[0].statusInst, 'ok');
});
