const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const hoje='2026-09-09';
function tela(lista) {
  const nodes=new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel,{innerHTML:'',textContent:'',value:sel==='#prod-mes'?'2026-09':'',querySelector:node,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){},add(){},remove(){}},focus(){},scrollIntoView(){},insertAdjacentHTML(_,v){this.innerHTML+=v;}});
    return nodes.get(sel);
  }
  const doc={querySelector:node,querySelectorAll:()=>[],addEventListener(){}};
  const ctx=vm.createContext({console,Date:class extends Date {constructor(...a){super(...(a.length?a:[hoje+'T12:00:00']));}},document:doc,window:{},localStorage:{getItem:()=>null},STORE:{getAllOS:()=>lista,getCFG:()=>({}),getOS:id=>lista.find(o=>o.id===id)},setTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root,'app.js'),'utf8'),ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'admin'}; STATE._painelDia='${hoje}'; wireLinhaTempo=()=>{};`,ctx);
  return {run:code=>vm.runInContext(code,ctx),node};
}
const final={id:'a',numero:'100',tipo:'externo',instalacao:{data:'2026-08-01'},finalizadaEm:hoje+'T12:00:00',equipe:['Ana','Bia']};
test('painel conta conclusão real mesmo com agenda em outro mês e detalhe usa a mesma base',()=>{
  const t=tela([final]); t.run('renderPainelKPIs()');
  assert.match(t.node('#painel-content').innerHTML,/data-detail="finalizadas"><div class="kpi-val">1</);
  t.run(`STATE._painelDetail='finalizadas'; renderPainelKPIs()`);
  assert.match(t.node('#painel-detail').innerHTML,/O.S 100/);
});
test('painel e linha do tempo não contam carro apenas liberado nem saída antiga como na rua',()=>{
  const t=tela([{id:'a',carroLiberado:true,liberadoPCP:true},{id:'b',liberadoPCP:true,horaSaida:'08:00',instalacao:{data:'2026-08-01'}}]);
  t.run('renderPainelKPIs()');
  assert.match(t.node('#painel-content').innerHTML,/data-detail="emrua"><div class="kpi-val">0</);
  assert.match(t.run('fotografiaLT(0)'),/Na rua agora[^]*?pcp-chip-n">0/);
});
test('tempo sem dados não é mostrado como execução de zero horas',()=>{
  const t=tela([final]);t.run('renderPainelKPIs()');
  assert.doesNotMatch(t.node('#painel-content').innerHTML,/>0\.0h</);
});
test('relatório mensal mostra duas participações mas só uma O.S única',()=>{
  const t=tela([final]);
  assert.match(t.run(`tabelaProdutividadeMes('2026-09')`),/1 O.S únicas · 2 participações/);
});
test('lista, kanban e relatório do dia usam instalações abertas, inclusive continuação',()=>{
  const longa={id:'longa',numero:'101',instalacao:{data:'2026-09-08',duracaoDias:3},equipe:[]};
  const t=tela([longa,{...final,instalacao:{data:hoje}},{id:'retira',tipo:'interno',instalacao:{data:hoje}}]);
  t.run(`STATE._fProg={de:'${hoje}',ate:'${hoje}'};renderProgLista()`);
  assert.match(t.node('#prog-content').innerHTML,/data-os-id="longa"/);
  assert.doesNotMatch(t.node('#prog-content').innerHTML,/data-os-id="(a|retira)"/);
  assert.equal(t.run(`servicosDoDia('${hoje}').length`),1);
  t.run('renderKanban()'); assert.match(t.node('#prog-content').innerHTML,/data-kan-os="longa"/);
});
test('histórico identifica baixa ERP e remove atalhos POPs',()=>{
  const t=tela([{...final,baixaAutoERP:{em:final.finalizadaEm,status:'CANCELADO'}}]);
  t.run('finRenderCards()');
  assert.match(t.node('#fin-content .os-list').innerHTML,/Encerrada no ERP/);
  assert.doesNotMatch(t.node('#fin-content .os-list').innerHTML,/data-pop-os/);
});
test('espelho e gestão usam a mesma regra para pedidos internos',()=>{
  const ctx=vm.createContext({document:{addEventListener(){}},window:{},console});
  vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root,'equipe.js'),'utf8'),ctx);
  assert.equal(vm.runInContext(`calcStatus({tipo:'interno',liberadoPCP:true,instalacao:{data:'${hoje}',periodo:'Manhã'},equipe:['Ana'],confirmacao:'Confirmado',horaSaida:'08:00'})`,ctx),'apto');
});
test('pendência de retrabalho finalizada continua na vista de retrabalho do PCP',()=>{
  const t=tela([{...final,retrabalho:true},{...final,id:'b',retrabalho:true,dataResolvido:hoje}]);
  t.run("STATE.pcpVista='retrabalho'");
  assert.equal(t.run('pcpBaseList().length'),1);
  assert.equal(t.run('pcpBaseList()[0].id'),'a');
});
test('conflito aparece na programação da própria ficha e some em turnos distintos',()=>{
  const a={id:'a',numero:'100',equipe:['Ana'],veiculo:'Carro',instalacao:{data:hoje,periodo:'Manhã'}};
  const b={...a,id:'b',numero:'101'};
  const t=tela([a,b]);
  assert.match(t.run("alertasAgendaHTML(STORE.getOS('a'))"),/O.S 101/);
  b.instalacao={data:hoje,periodo:'Tarde'};
  assert.equal(t.run("alertasAgendaHTML(STORE.getOS('a'))"),'');
});
test('painel de finalizados explica retrabalho sem equipe e em retirada sem fingir ausência',()=>{
  const t=tela([{...final,equipe:[],retrabalho:true},{...final,id:'retirada',tipo:'interno',retrabalho:true}]);
  t.run('finRenderDash()');
  const html=t.node('#fin-content').innerHTML;
  assert.match(html,/1 em instalações sem equipe identificada · 1 em pedidos de retirada/);
  assert.doesNotMatch(html,/Nenhum retrabalho no período/);
  assert.match(html,/>2<\/span><span class="fin-kpi-lbl">O.S com retrabalho/);
});
test('retrabalho pendente fica em atenção mesmo após conclusão da O.S original',()=>{
  const t=tela([{...final,retrabalho:true},{...final,id:'resolvida',retrabalho:true,dataResolvido:hoje}]);
  t.run('renderRetrabalho()');
  const html=t.node('#panel-retrabalho').innerHTML;
  assert.match(html,/class="os-list-item st-retrabalho" data-os-id="a"/);
  assert.match(html,/class="os-list-item st-finalizada" data-os-id="resolvida"/);
});
test('busca atualiza total e limpar filtros preserva a vista e a ordenação escolhidas',()=>{
  const t=tela([{...final,cliente:'Loja',retrabalho:true},{...final,id:'b',cliente:'Clínica',tipo:'interno',retrabalho:true}]);
  t.run("STATE.pcpVista='retrabalho'; STATE.pcpTipo='externo'; STATE.filtroBusca='Loja'; STATE.pcpSort='pedido'; renderPCP()");
  assert.equal(t.node('#pcp-resultado').textContent,'1 O.S exibida');
  assert.equal(t.node('#pcp-limpar-filtros').hidden,false);
  t.node('#busca-pcp').value='não existe';
  t.node('#busca-pcp').oninput();
  assert.equal(t.node('#pcp-resultado').textContent,'0 O.S exibidas');
  t.node('#pcp-limpar-filtros').onclick();
  assert.equal(t.node('#pcp-resultado').textContent,'2 O.S exibidas');
  assert.equal(t.run('STATE.pcpVista'),'retrabalho');
  assert.equal(t.run('STATE.pcpSort'),'pedido');
  assert.equal(t.run('STATE.filtroBusca'),'');
  assert.equal(t.node('#pcp-limpar-filtros').hidden,true);
});
test('prioridade do dia abre as O.S contadas sem herdar nem alterar filtros da carteira',()=>{
  const t=tela([
    {id:'hoje',numero:'101',instalacao:{data:hoje},cliente:'Cliente de hoje'},
    {id:'longa',numero:'102',instalacao:{data:'2026-09-08',duracaoDias:3}},
    {...final,id:'encerrada',instalacao:{data:hoje}},
    {id:'futura',numero:'103',instalacao:{data:'2026-09-15'}}
  ]);
  t.run("STATE.pcpVista='arquivados'; STATE.pcpTipo='interno'; STATE.filtroBusca='outro cliente'; STATE._prioridade='hoje'; renderPrioridades()");
  const html=t.node('#pcp-prioridades').innerHTML;
  assert.match(html,/Para hoje: 2/);
  assert.match(html,/A carteira abaixo mostra só estas O.S/);
  t.run('pcpRenderCards()');
  const grade=t.node('#panel-pcp .cards-grid').innerHTML;
  assert.match(grade,/data-os-id="hoje"/);
  assert.match(grade,/data-os-id="longa"/);
  assert.doesNotMatch(grade,/data-os-id="(encerrada|futura)"/);
  assert.equal(t.run('STATE.pcpVista'),'arquivados');
  assert.equal(t.run('STATE.pcpTipo'),'interno');
  assert.equal(t.run('STATE.filtroBusca'),'outro cliente');
});

/* ══ VISTA ARQUIVADOS LEVE (pedido do dono, 14/09/2026) ══
   "Pesquisa por cliente e número, chips de ano e mês; o card não precisa
   abrir aqui, até para deixar o sistema mais leve." Linhas de tabela no lugar
   de 563 cards, recorte por ano/mês, e a prioridade continua mandando. */
test('Arquivados pinta linhas leves no recorte do mês, não cards', () => {
  const t = tela([
    { ...final, id: 'arq1', numero: '201', cliente: 'CLIENTE ANTIGO', finalizadaEm: '2026-09-01T12:00:00' },
    { ...final, id: 'arq2', numero: '202', cliente: 'OUTRO', finalizadaEm: '2026-08-02T12:00:00' },
    { id: 'aberta', numero: '203', instalacao: { data: hoje } },
  ]);
  t.run("STATE.pcpVista='arquivados'; STATE._prioridade=''; STATE._arq={ano:'2026',mes:'09'}; renderPCP()");
  const grade = t.node('#panel-pcp .cards-grid').innerHTML;
  assert.match(grade, /pcp-arq-tabela/, 'é tabela, não cards');
  assert.doesNotMatch(grade, /class="os-card/, 'nenhum card pesado');
  assert.match(grade, /data-os-id="arq1"/, 'a de setembro entra');
  assert.doesNotMatch(grade, /data-os-id="arq2"/, 'a de agosto fica fora do recorte de setembro');
  assert.doesNotMatch(grade, /data-os-id="aberta"/, 'aberta nunca é arquivada');
  // chips de ano e mês existem e o mês corrente vem marcado
  const chips = t.node('#arq-chips').innerHTML;
  assert.match(chips, /data-arq-ano="2026"[^>]*>2026/);
  assert.match(chips, /class="pcp-chip active" data-arq-mes="09"/);
  // trocar para o ano inteiro traz agosto também
  t.run("STATE._arq.mes=''; pcpRenderCards()");
  assert.match(t.node('#panel-pcp .cards-grid').innerHTML, /data-os-id="arq2"/);
  // BUSCA IGNORA O RECORTE: com setembro escolhido, "OUTRO" (agosto) tem de aparecer.
  t.run("STATE._arq.mes='09'; STATE.filtroBusca='OUTRO'; pcpRenderCards()");
  const busca = t.node('#panel-pcp .cards-grid').innerHTML;
  assert.match(busca, /data-os-id="arq2"/, 'quem digita o cliente acha a O.S em qualquer mês');
  assert.doesNotMatch(busca, /data-os-id="arq1"/, 'e só o que casa com a busca');
  assert.match(t.node('#pcp-resultado').textContent, /todo o histórico/);
});

/* A VISTA "Parado Cliente" e o ATALHO da lateral.
 *
 * O atalho e `data-tab="pcp" data-vista="parado"` de proposito: leva ao MESMO
 * painel do PCP. Se alguem o transformar numa aba de verdade (data-tab="parado"),
 * o initTabs vai ativar um `#panel-parado` que nao existe e o PCP sera pintado
 * num painel escondido -- TELA BRANCA, sem erro nenhum. Este teste e o alarme.
 */
test('a vista Parado Cliente esta cabeada nos quatro lugares', () => {
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(app, /pcpVista === 'parado'\) return all\.filter\(o => OPERACAO\.paradoNoCliente\(o\)\)/,
    'a lista da vista tem de usar o MESMO predicado do card, senao acumula fantasma');
  assert.match(app, /\['parado',\s*'⏸',\s*'Parado Cliente'\]/, 'falta o botao da vista');
  assert.match(app, /data-pcp-vista="parado"/, 'falta o contador do botao');
  assert.match(html, /data-tab="pcp" data-vista="parado"/,
    'o atalho da lateral tem de apontar para o painel do PCP, nao para um painel proprio');
  assert.doesNotMatch(html, /data-tab="parado"/,
    'aba propria pintaria o PCP num painel escondido: tela branca sem erro');
});

test('entrar pelo PCP limpa a vista do atalho', () => {
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(app, /if \(tab === 'pcp'\) STATE\.pcpVista = t\.dataset\.vista \?\? '';/,
    'sem o ?? "" a vista fica grudada e o PCP abre so com os parados');
});

/* O MANUAL DENTRO DO APP ENVELHECE CALADO.
 *
 * Em 15/09/2026 o `abrirInstrucoes()` ainda ensinava um app de cinco abas
 * (Painel, PCP, Instalacao, "Execucao / Retrabalho / Finalizados",
 * Configuracoes) quando a lateral ja tinha TREZE, e afirmava que "a nuvem
 * (Netlify Blobs) e a fonte da verdade" -- o Netlify foi desligado em agosto de
 * 2026. Manual errado e pior que manual ausente: ele e lido como verdade e
 * ninguem abre chamado contra um texto.
 *
 * Este teste nao julga a redacao. Ele so cobra que TODA aba da lateral apareca
 * pelo nome no manual, e que a frase sobre a fonte da verdade nao volte a
 * nomear o Netlify.
 */
test('o manual do app conhece todas as abas da lateral', () => {
  const app  = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');

  const ini = app.indexOf('function abrirInstrucoes()');
  assert.ok(ini > 0, 'o manual sumiu do app.js');
  const manual = app.slice(ini, app.indexOf('\n}', ini));

  // O rotulo visivel de cada botao da lateral: o texto depois do </span>.
  const nav = html.slice(html.indexOf('<p class="nav-grupo">'), html.indexOf('</nav>'));
  const rotulos = [...nav.matchAll(/<button class="tab[^"]*"[^>]*>.*?<\/span>\s*([^<]+?)\s*<\/button>/g)]
    .map(m => m[1]);
  assert.ok(rotulos.length >= 10, `esperava a lateral inteira, achei ${rotulos.length}`);

  const faltando = rotulos.filter(r => !manual.includes(r));
  assert.deepEqual(faltando, [],
    `o manual nao cita estas abas da lateral: ${faltando.join(', ')}`);

  assert.doesNotMatch(manual, /Netlify Blobs\)? é a fonte da verdade/,
    'o Netlify foi desligado em 08/2026; a fonte da verdade e o Supabase');
});

/* O filtro de período serve quatro abas. Ele passou a mostrar qual recorte está
   aceso — antes eram botões de 22 px e a única pista vinha depois do clique. */
test('filtro de período: o recorte escolhido vem aceso, e "Todos" só sem limites', () => {
  const t = tela([]);
  const hoje = t.run(`OPERACAO.dia(new Date())`);
  // Nada escolhido: só "Todos" aceso.
  let html = t.run(`STATE._fFin = { de: '', ate: '' }; filtroPeriodoHTML('_fFin')`);
  let acesos = [...html.matchAll(/data-pq="([^"]+)"/g)].map(m => m[1])
    .filter((_, i) => true);
  assert.match(html, /class="casa-chip-per on" data-pq="todos"/, '"Todos" acende quando não há recorte');
  assert.equal((html.match(/casa-chip-per on/g) || []).length, 1, 'só um chip aceso por vez');

  // "Hoje" escolhido: o chip de hoje acende, "Todos" apaga.
  html = t.run(`STATE._fFin = { de: '${hoje}', ate: '${hoje}' }; filtroPeriodoHTML('_fFin')`);
  assert.match(html, /class="casa-chip-per on" data-pq="hoje"/);
  assert.equal((html.match(/casa-chip-per on/g) || []).length, 1);

  // Programação olha para a FRENTE: os mesmos ids valem outro intervalo.
  const prog = t.run(`
    const p = OPERACAO.periodoRapido('7', '${hoje}', true);
    STATE._fProg = { de: p.de, ate: p.ate };
    filtroPeriodoHTML('_fProg')`);
  assert.match(prog, /class="casa-chip-per on" data-pq="7"/, 'a régua de futuro não pode desacender o chip');
  assert.match(prog, /Próximos 7 dias/);
});
