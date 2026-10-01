/* AUDITORIA DA GESTÃO (25/09/2026): consertos do app.js que mudam o que a
   gestão grava. Cada teste começa pelo caso que dava errado. Mesmo harness do
   telas.test.cjs: o app.js roda num contexto com DOM mínimo e STORE falso. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const hoje = '2026-09-09';
function tela(lista) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  }
  const doc = {querySelector:node, querySelectorAll:()=>[], addEventListener(){}};
  const salvos = [];
  const ctx = vm.createContext({console, Date:class extends Date { constructor(...a){ super(...(a.length ? a : [hoje + 'T12:00:00'])); } }, document:doc, window:{}, localStorage:{getItem:()=>null},
    STORE:{getAllOS:()=>lista, getCFG:()=>({}), getOS:id=>lista.find(o=>o.id===id), uuid:()=>'novo-' + (salvos.length + 1),
      saveOS(os){ const i = lista.findIndex(o => o.id === os.id); if (i >= 0) lista[i] = os; else lista.push(os); salvos.push(JSON.parse(JSON.stringify(os))); }},
    setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'pcp'}; renderModal=()=>{}; renderActiveTab=()=>{};`, ctx);
  return {run:code=>vm.runInContext(code, ctx), salvos};
}

test('PDF importado e "Salvar O.S." sem mexer em nada: a O.S. é gravada; a Nova O.S. em branco não', () => {
  const t = tela([]);
  t.run(`openModal({id:'pdf1', numero:'5501', cliente:'Padaria Sol', tipo:'externo', itens:[]}); closeModal();`);
  assert.equal(t.salvos.length, 1, 'a importada precisa ir para o store e para a fila');
  assert.equal(t.salvos[0].numero, '5501');
  t.run(`openModal(novaOS()); closeModal();`);
  assert.equal(t.salvos.length, 1, 'a Nova O.S. em branco continua sem gravar ao fechar');
});

test('parado no cliente: a 2ª gravação da ficha fecha o período com data, não como "legado" sem data', () => {
  const os = {id:'p1', numero:'77', tipo:'externo', liberadoPCP:true, paradoClienteEm:'2026-09-01T10:00:00', instalacao:{}, equipe:[]};
  const t = tela([os]);
  t.run(`openModal(STORE.getOS('p1'));
    setField('instalacao.data','2026-09-12'); saveDraft();
    setField('instalacao.periodo','Manhã'); _modalDraft.equipe=['Ana']; saveDraft();`);
  const gravada = t.salvos[t.salvos.length - 1];
  assert.equal(gravada.paradoClienteEm || '', '', 'o período parado fecha');
  const ultimo = (gravada.paradoClienteLog || []).slice(-1)[0];
  assert.ok(ultimo, 'o período vai para o log');
  assert.notEqual(ultimo.ate, '', 'fechar com "até" em branco apaga o tempo que o cliente segurou');
  assert.equal(ultimo.motivo, 'programada');
});

test('equipe na rua: estender a duração não zera a confirmação nem o carro; antes de sair, zera', () => {
  const t = tela([]);
  t.run(`_modalDraft={id:'r1', confirmacao:'Confirmado', confEm:'2026-09-09T07:00:00', carroLiberado:true, horaSaida:'08:00', instalacao:{data:'${hoje}', duracaoDias:1}};
    setField('instalacao.duracaoDias', 2);`);
  assert.equal(t.run('_modalDraft.confirmacao'), 'Confirmado');
  assert.equal(t.run('_modalDraft.carroLiberado'), true);
  t.run(`_modalDraft={id:'r2', confirmacao:'Confirmado', carroLiberado:true, instalacao:{data:'${hoje}', hora:'08:00'}};
    setField('instalacao.hora', '09:00');`);
  assert.equal(t.run('_modalDraft.confirmacao'), '', 'remarcar antes da saída continua pedindo nova confirmação');
  assert.equal(t.run('_modalDraft.carroLiberado'), false);
});

test('"Sobrescrever (meu)" mantém as fotos, a saída e a foto do problema que a equipe mandou da rua', () => {
  const t = tela([]);
  const r = JSON.parse(t.run(`JSON.stringify((() => {
    const local = {id:'c1', obsPCP:'minha edição', fotosCheckinIds:['a'], itens:[{item:'1', descricao:'Lona'}]};
    const remote = {id:'c1', obsPCP:'velha', fotosCheckinIds:['a','b'], fotosRetornoIds:['z'], saidaEm:'2026-09-09T08:00:00', horaSaida:'08:00',
      itens:[{item:'1', descricao:'Lona', statusInst:'retrab', motivo:'Medida errada', fotoProbId:'fp'}]};
    const m = manterExecucaoDoServidor(local, remote);
    return {local, m};
  })())`));
  assert.equal(r.local.obsPCP, 'minha edição', 'a edição do PCP vence no que ele mexeu');
  assert.deepEqual(r.local.fotosCheckinIds, ['a', 'b']);
  assert.deepEqual(r.local.fotosRetornoIds, ['z']);
  assert.equal(r.local.saidaEm, '2026-09-09T08:00:00');
  assert.equal(r.local.itens[0].fotoProbId, 'fp');
  assert.equal(r.local.itens[0].statusInst, 'retrab');
  assert.equal(r.m.fotos, 3);
});

test('coordenada do GPS que não é número não entra no HTML da ficha', () => {
  const t = tela([]);
  const html = t.run(`blocoExec({id:'g1', tipo:'externo', liberadoPCP:true, confirmacao:'Confirmado', instalacao:{data:'${hoje}', periodo:'Manhã'}, equipe:['Ana'],
    checkinGPS:{lat:'"><img src=x onerror=alert(1)>', lng:1, precisao:'<b>'}}, false, false)`);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /onerror/);
  const ok = t.run(`blocoExec({id:'g2', tipo:'externo', instalacao:{}, equipe:[], checkinGPS:{lat:-19.9, lng:-43.9, precisao:12.4}}, false, false)`);
  assert.match(ok, /maps\.google\.com\/\?q=-19\.9,-43\.9/);
  assert.match(ok, /±12m/);
});

test('foto do problema que o instalador tirou aparece no item da ficha da gestão', () => {
  const t = tela([]);
  const html = t.run(`blocoItens({id:'i1', itens:[{item:'1', descricao:'Fachada', statusInst:'retrab', motivo:'Peça quebrada', obsProb:'canto', fotoProbId:'fp9'}]}, false, false)`);
  assert.match(html, /Retrabalho na instalação: Peça quebrada \(canto\)/);
  assert.match(html, /data-foto-img="fp9"/);
});

test('"Mais um dia de trabalho" segura a finalização; a lista de faltas usa o nome do campo', () => {
  const t = tela([]);
  const base = {tipo:'externo', liberadoPCP:true, confirmacao:'Confirmado', embarqueConferidoPor:'A', produtosConferidosPor:'A', ferramentasConferidas:true, carroLiberado:true,
    instalacaoOK:true, conferidoPor:'A', fotosCheckinIds:['f'], fotosRetornoIds:['r'], retornoEm:hoje + 'T17:00:00'};
  assert.equal(t.run(`validarFinalizacao(${JSON.stringify(base)}).length`), 0);
  assert.match(t.run(`validarFinalizacao(${JSON.stringify({...base, checkout:{situacao:'Mais um dia de trabalho'}})}).join(',')`), /mais um dia de trabalho/);
  const faltas = t.run(`validarFinalizacao(${JSON.stringify({...base, instalacaoOK:false, conferidoPor:'', fotosRetornoIds:[]})})`);
  assert.equal(faltas.filter(f => /Instalação OK/.test(f)).length, 1, '"Instalação OK" e "conferido por" são o mesmo checkbox');
  assert.ok(faltas.includes('foto de retorno (serviço pronto)'));
});

test('filtro "Próximos 7 dias" acompanha o dia: a aba aberta ontem não fica presa na véspera', () => {
  const t = tela([]);
  // Escolhido ontem (08/09): datas gravadas de 08 a 14. Hoje (09) o 15 entra.
  t.run(`STATE._fProg = {de:'2026-09-08', ate:'2026-09-14', rapido:'7'}`);
  assert.equal(t.run(`dentroPeriodo('2026-09-15', '_fProg')`), true);
  assert.equal(t.run(`dentroPeriodo('2026-09-08', '_fProg')`), false);
  // Data digitada à mão é fixa.
  t.run(`STATE._fProg = {de:'2026-09-01', ate:'2026-09-03', rapido:''}`);
  assert.equal(t.run(`dentroPeriodo('2026-09-09', '_fProg')`), false);
});

/* ═════════════ F10 (30/09/2026): equipe e divisão na ficha da O.S. ═════════════
   A ficha ganha o bloco "Divisão da equipe" (só admin e pcp, só em O.S.
   externa) e o campo Equipe vira o componente único. renderModal roda de
   verdade: o DOM falso transforma o HTML em blocos (data-bloco) a cada
   pintura, como o navegador. Dados fictícios. */
function fichaReal(papel, lista = []) {
  let html = '', blocos = [];
  const modal = {
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false})); },
    classList: {toggle() {}, add() {}, remove() {}}, querySelector: () => null, querySelectorAll: () => []};
  const doc = {querySelector: sel => (sel === '#modal-os' ? modal : null), querySelectorAll: sel => (sel === '#modal-os .card-fs' ? blocos : []),
    getElementById: () => null, addEventListener() {}, activeElement: null};
  const ctx = vm.createContext({console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [hoje + 'T12:00:00'])); } },
    document: doc, window: {}, localStorage: {getItem: () => null},
    STORE: {getAllOS: () => lista, getCFG: () => ({instaladores: ['Ana'], performancePCP: {equipes: [], participacoes: []}}), getOS: id => lista.find(o => o.id === id), elenco: () => ({pessoas: [], antigos: []})},
    setTimeout() {}, clearTimeout() {}});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, {filename: f});
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'${papel}'}; bindModalEvents=()=>{}; ligarHistoricoAlteracoes=()=>{};`, ctx);
  return {run: code => vm.runInContext(code, ctx), blocos: () => blocos, html: () => html};
}
const osFicha = (extra = {}) => ({id: 'f1', numero: '7001', tipo: 'externo', cliente: 'Cliente Fictício', liberadoPCP: true,
  instalacao: {data: hoje, periodo: 'Manhã', duracaoDias: 1}, equipe: ['100001'], veiculo: 'Carro 1', itens: [], ...extra});

test('F10 ficha: os blocos abertos sobrevivem à repintura com o bloco novo "divisao"', () => {
  const t = fichaReal('pcp', [osFicha()]);
  t.run(`_modalDraft = ${JSON.stringify(osFicha())}; renderModal();`);
  const chaves = t.blocos().map(b => b.dataset.bloco);
  /* F23: a ficha em etapas segue a ordem Dados > Equipe > Divisão > Jornada >
     Fechamento, e a divisão (etapa 3) vem antes da execução (etapa 4). As
     chaves continuam as mesmas. */
  assert.deepEqual(chaves, ['pcp', 'itens', 'agenda', 'divisao', 'exec'], 'cada bloco na sua etapa, na ordem do stepper');
  // O usuário abre a divisão e a execução e fecha a agenda (que o render abriu).
  const porChave = k => t.blocos().find(b => b.dataset.bloco === k);
  porChave('divisao').open = true; porChave('exec').open = true; porChave('agenda').open = false;
  // Caso ruim: a repintura (cada campo gravado repinta) fechava o bloco novo.
  t.run('reRenderModalKeepOpen()');
  const abertos = Object.fromEntries(t.blocos().map(b => [b.dataset.bloco, b.open]));
  assert.deepEqual(abertos, {pcp: false, itens: false, agenda: false, exec: true, divisao: true});
  // A O.S. que vira "Cliente retira" perde o bloco sem trocar o que fica aberto.
  t.run(`_modalDraft.tipo = 'interno'; reRenderModalKeepOpen();`);
  assert.deepEqual(t.blocos().map(b => b.dataset.bloco), ['pcp', 'itens']);
});

test('F10 ficha: blocoExec(os, ro, done) continua com a mesma assinatura e o mesmo bloco', () => {
  const t = fichaReal('pcp');
  const html = t.run(`blocoExec(${JSON.stringify(osFicha())}, false, true)`);
  assert.match(html, /<details class="card-fs done" data-bloco="exec">/);
  assert.match(html, /4 · Embarque &amp; Execução/);
  assert.equal(t.run('blocoExec.length'), 3);
});

test('F10 ficha: o bloco divisao só aparece para admin e pcp, e só em O.S. externa', () => {
  for (const papel of ['admin', 'pcp']) {
    const t = fichaReal(papel);
    t.run(`_modalDraft = ${JSON.stringify(osFicha())}; renderModal();`);
    assert.match(t.html(), /data-bloco="divisao"/, papel + ' vê a divisão');
    assert.match(t.html(), /id="ficha-div-ok"/);
    assert.match(t.html(), /id="ficha-equipe"/, 'o campo Equipe é o componente');
    t.run(`_modalDraft = ${JSON.stringify(osFicha({tipo: 'interno'}))}; renderModal();`);
    assert.doesNotMatch(t.html(), /data-bloco="divisao"/, papel + ': cliente retira não tem divisão');
  }
  for (const papel of ['operacao', 'montagem', 'comercial']) {
    const t = fichaReal(papel);
    t.run(`_modalDraft = ${JSON.stringify(osFicha())}; renderModal();`);
    assert.doesNotMatch(t.html(), /data-bloco="divisao"/, papel + ' não vê a divisão');
    assert.doesNotMatch(t.html(), /ficha-div-ok/);
  }
  // Operação edita a equipe pelo componente (só pessoas); o comercial só lê.
  const op = fichaReal('operacao');
  op.run(`_modalDraft = ${JSON.stringify(osFicha())}; renderModal();`);
  assert.match(op.html(), /id="ficha-equipe"/);
  const com = fichaReal('comercial');
  com.run(`_modalDraft = ${JSON.stringify(osFicha())}; renderModal();`);
  assert.doesNotMatch(com.html(), /id="ficha-equipe"/, 'quem só lê vê os chips de sempre');
  assert.match(com.html(), /data-chips="equipe"/);
});
