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
test('retrabalho sem medição não se apresenta como zero; taxa tem coorte explícita',()=>{
 const t=tela([{...final,retrabalho:true}]); t.run('renderRetrabalho()');
 const html=t.node('#panel-retrabalho').innerHTML;
 assert.match(html,/Não apurado/);assert.match(html,/0 de 1 intervenções com medição/);assert.match(html,/Cancelamentos e O.S. filhas não entram/);
});
test('finalização externa exige evidência ou exceção escrita pela gestão',()=>{
 const t=tela([]);
 const base={tipo:'externo',liberadoPCP:true,confirmacao:'Confirmado',embarqueConferidoPor:'A',produtosConferidosPor:'A',ferramentasConferidas:true,carroLiberado:true,instalacaoOK:true,conferidoPor:'A',fotosCheckinIds:['f']};
 assert.match(t.run(`validarFinalizacao(${JSON.stringify(base)}).join(',')`),/foto de retorno \(serviço pronto\)/);
 assert.equal(t.run(`validarFinalizacao(${JSON.stringify({...base,justificativaConclusao:'Cliente não permitiu fotografar o ambiente.'})}).length`),0);
});

/* DECISÃO (B) DO LÉO, 23/09/2026: "O instalador finaliza, e o espelho passa a
   pedir a foto do serviço pronto." O botão do espelho tem de pedir o que o
   servidor exige (validarConclusao): sem isso o instalador via "finalizada" e
   a O.S. ficava presa na fila do aparelho com um 422. */
function espelho(os, lista=[]) {
  const nodes=new Map(), toasts=[], salvas=[], fila=[];
  function node(sel) {
    // classList registra as chamadas: a trava os-locked é a armadilha da limpeza do carro.
    if (!nodes.has(sel)) { const ops=[]; nodes.set(sel,{innerHTML:'',textContent:'',value:'',querySelector:node,querySelectorAll:()=>[],setAttribute(){},
      classList:{ops,toggle(c,v){ops.push(['toggle',c,v]);},add(c){ops.push(['add',c]);},remove(c){ops.push(['remove',c]);}}}); }
    return nodes.get(sel);
  }
  const ctx=vm.createContext({console,Date,document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{},
    localStorage:{getItem:()=>null,setItem(){}},
    STORE:{getCFG:()=>({}),getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id)||null,getQueue:()=>fila,pushPhoto:async()=>'fc',
      saveOS:o=>salvas.push(JSON.parse(JSON.stringify(o))),pullPhoto:async()=>null,
      carimbarMomento:(o,h,c)=>{const m=String(o[h]||'').match(/^(\d{1,2}):(\d{2})/);if(m)o[c]=`2026-09-23T${m[1].padStart(2,'0')}:${m[2]}:00`;}},
    // confirm: o Finalizar pergunta antes (só a gestão reabre); aqui a resposta é sim.
    setTimeout(){},mostrarCelebracao(){},confirm:()=>true});
  vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root,'equipe.js'),'utf8'),ctx);
  vm.runInContext('toast=(m,t)=>__toasts.push(m); fraseAleatoria=()=>""; EQ.instalador="Ana";',Object.assign(ctx,{__toasts:toasts}));
  if (os) { ctx.__os=os; vm.runInContext('_draft=__os; renderModal()',ctx); }
  return {node,toasts,salvas,fila,run:c=>vm.runInContext(c,ctx)};
}
const naRua={id:'1',numero:'300',tipo:'externo',equipe:['Ana'],liberadoPCP:true,confirmacao:'Confirmado',instalacao:{data:'2026-09-23',periodo:'Manhã'},
  horaSaida:'08:00',instalacaoOK:true,fotosCheckinIds:['c1'],itens:[{item:'1',descricao:'Fachada'}]};
test('espelho: finalizar sem a foto do serviço pronto e sem a hora de retorno é barrado na tela',()=>{
  const t=espelho({...naRua});
  assert.match(t.node('#modal-os').innerHTML,/data-retorno/,'o espelho oferece a foto do serviço pronto');
  t.node('#m-finalizar').onclick();
  assert.match(t.toasts.join(' '),/foto do serviço pronto/);
  assert.match(t.toasts.join(' '),/hora de retorno/);
  assert.equal(t.run('_draft.finalizadaEm'),undefined);
  assert.equal(t.salvas.length,0);
});
test('espelho: com a foto e a hora de retorno, o instalador finaliza e o fecho é o mesmo da gestão',()=>{
  const t=espelho({...naRua,fotosRetornoIds:['r1'],horaRetorno:'15:10'});
  t.node('#m-finalizar').onclick();
  const g=t.salvas.at(-1);
  assert.ok(g&&g.finalizadaEm,'gravou a finalização');
  assert.equal(g.finalizadoPor,'Ana');assert.equal(g.retornoEm,'2026-09-23T15:10:00');
  assert.equal(g.conferidoPor,'Ana');assert.equal(g.checkout.situacao,'Finalizado');assert.equal(g.checkout.confirmado,true);
});

/* FILA "VOLTA DO CARRO" (24/09/2026): "algo que avalie a volta do carro pelo
   PCP, se está arrumado etc". Uma conferência por volta, gravada em cada O.S. */
const voltaOS = (id, extra={}) => ({id, numero:'V'+id, cliente:'Cliente '+id, tipo:'externo', equipe:['Ana','Bia'], veiculo:'Strada',
  liberadoPCP:true, instalacao:{data:hoje}, retornoEm:hoje+'T17:00:00', ...extra});
test('volta do carro: quem não é gestão vê a fila mas não confere, nem pela função', () => {
  const t = tela([voltaOS('1'), voltaOS('2')]);
  t.run(`STATE.user={nome:'Montagem',papel:'montagem'}; globalThis.__salvas=[]; STORE.saveOS=o=>__salvas.push(o)`);
  const html = t.run('voltasHTML()');
  assert.match(html, /V1[^]*V2/, 'as duas O.S. aparecem na mesma volta');
  assert.doesNotMatch(html, /data-volta-conferir/);
  assert.equal(t.run(`salvarConferenciaVolta(voltasDoRecorte().todas[0], {carroLimpo:'sim'})`), 0);
  assert.equal(t.run('__salvas.length'), 0);
});
test('volta do carro: a gestão confere uma vez e a resposta vai para cada O.S. da volta, com autor', () => {
  const t = tela([voltaOS('1'), voltaOS('2'), voltaOS('3', {veiculo:'Saveiro'})]);
  t.run(`globalThis.__salvas=[]; STORE.saveOS=o=>__salvas.push(JSON.parse(JSON.stringify(o)))`);
  assert.equal(t.run('voltasDoRecorte().todas.length'), 2, 'outro carro é outra volta');
  const html = t.run('voltasHTML()');
  assert.match(html, /data-volta-conferir/);
  const n = t.run(`salvarConferenciaVolta(voltasDoRecorte().todas.find(g=>g.os.length===2), {carroLimpo:'sim',carroArrumado:'nao',equipamentosOk:'sim',semAvaria:'',obs:'sobra de lona',fotos:[]})`);
  assert.equal(n, 2);
  const salvas = t.run('__salvas');
  assert.equal(salvas.map(o => o.id).sort().join(), '1,2');
  for (const o of salvas) {
    assert.equal(o.retornoConf.carroArrumado, 'nao'); assert.equal(o.retornoConf.obs, 'sobra de lona');
    assert.equal(o.retornoConf.por, 'Revisão'); assert.ok(o.retornoConf.em);
  }
});
test('volta do carro: salvar a mesma resposta de novo não regrava nem troca o autor', () => {
  const rc = {carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'',fotos:[],por:'Gestor',em:'2026-09-09T18:00:00Z'};
  const t = tela([voltaOS('1', {retornoConf:rc})]);
  t.run(`globalThis.__salvas=[]; STORE.saveOS=o=>__salvas.push(o)`);
  const g = 'voltasDoRecorte().todas[0]';
  assert.equal(t.run(`${g}.situacao`), 'conferida');
  assert.equal(t.run(`salvarConferenciaVolta(${g}, {carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'',fotos:[]})`), 0);
  assert.equal(t.run(`salvarConferenciaVolta(${g}, {carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'anotei depois',fotos:[]})`), 1);
  assert.equal(t.run('__salvas[0].retornoConf.por'), 'Gestor', 'anotação não é conferência nova');
});
test('volta do carro: a vista do PCP conta as voltas a conferir e a ficha mostra as quatro perguntas', () => {
  // Conferida = carro e equipamentos respondidos (o que a nota conta); só o carro fica "em parte".
  const t = tela([voltaOS('1'), voltaOS('2', {veiculo:'Saveiro', retornoConf:{carroLimpo:'sim',equipamentosOk:'sim'}})]);
  t.run("STATE.pcpVista='voltas'; voltaEstado().filtro='conferir'");
  assert.equal(t.run('pcpBaseList().length'), 1);
  const ficha = t.run(`conferenciaVoltaHTML(STORE.getOS('1'), false)`);
  for (const k of ['carroLimpo','carroArrumado','equipamentosOk','semAvaria']) assert.match(ficha, new RegExp('retornoConf\\.' + k));
});

/* LIMPEZA DO CARRO NO ESPELHO (25/09/2026). A equipe registra como o carro
   voltou; o registro é um só por volta e vai para cada O.S. dela. A O.S.
   finalizada é somente leitura no espelho, e quase toda O.S. fecha antes de o
   carro voltar: por isso o registro mora num cartão da lista. */
const hojeReal = require('../operacao.js').dia(new Date());
const voltaEsp = (id, extra={}) => ({id, numero:'L'+id, cliente:'Cliente '+id, tipo:'externo', equipe:['Ana','Bia'], veiculo:'Strada',
  liberadoPCP:true, confirmacao:'Confirmado', instalacao:{data:hojeReal, periodo:'Manhã'}, horaSaida:'08:00',
  horaRetorno:'15:00', retornoEm:hojeReal+'T15:00:00', fotosRetornoIds:['r'+id], ...extra});
const tudoSim = "{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'}";
test('espelho: a limpeza aparece como cartão e grava em cada O.S. da volta, inclusive a finalizada', () => {
  const fin = voltaEsp('1', {finalizadaEm:hojeReal+'T15:05:00', finalizadoPor:'Ana'});
  const t = espelho(null, [fin, voltaEsp('2')]);
  t.run('renderList()');
  let html = t.node('#eq-list').innerHTML;
  assert.match(html, /data-limpeza="/);
  assert.match(html, /Falta registrar como o carro voltou/);
  assert.match(html, /Strada · hoje · O\.S L1, L2/);
  const n = t.run(`salvarLimpezaCarro(limpezasPendentes()[0], {resp:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim'}, obs:' faltou a escada ', fotos:['fc']})`);
  assert.equal(n, 2);
  assert.equal(t.salvas.map(o => o.id).sort().join(), '1,2');
  for (const o of t.salvas) {
    assert.equal(o.voltaEquipe.equipamentosOk, 'nao'); assert.equal(o.voltaEquipe.obs, 'faltou a escada');
    assert.equal(o.voltaEquipe.fotos.join(), 'fc'); assert.equal(o.voltaEquipe.veiculo, 'Strada'); assert.equal(o.voltaEquipe.dia, hojeReal);
    assert.equal(o.retornoConf, undefined, 'a declaração não vira conferência');
  }
  assert.equal(t.salvas.find(o => o.id === '1').finalizadaEm, hojeReal+'T15:05:00', 'continua finalizada');
  // Enquanto o upsert está na fila, a tela não diz "registrada".
  t.fila.push({action:'upsert', os:{id:'2'}});
  t.run('renderList()'); html = t.node('#eq-list').innerHTML;
  assert.match(html, /Guardada no aparelho, vai quando tiver sinal/); assert.doesNotMatch(html, /registrada às/);
  t.fila.length = 0;
  t.run('renderList()');
  assert.match(t.node('#eq-list').innerHTML, /✓ Limpeza registrada às \d\d:\d\d \(Ana\)/);
});
test('espelho: sem foto ou com pergunta em branco, a limpeza não é gravada', async () => {
  const t = espelho(null, [voltaEsp('1'), voltaEsp('2')]);
  t.run(`abrirLimpezaCarro(limpezasPendentes()[0].chave); marcarLimpeza('carroLimpo','sim'); marcarLimpeza('semAvaria','nao')`);
  t.node('#lz-enviar').onclick();
  assert.match(t.toasts.join(' '), /responder 2 perguntas/); assert.match(t.toasts.join(' '), /foto do carro/);
  assert.equal(t.salvas.length, 0);
  t.run(`marcarLimpeza('carroArrumado','sim'); marcarLimpeza('equipamentosOk','sim')`);
  t.toasts.length = 0; t.node('#lz-enviar').onclick();
  assert.match(t.toasts.join(' '), /foto do carro/); assert.doesNotMatch(t.toasts.join(' '), /pergunta/);
  assert.equal(t.salvas.length, 0);
  // A foto entra pela câmera da própria tela (pushPhoto devolve o fileId).
  const cam = t.node('[data-lz-foto]'); cam.files = [{}]; await cam.onchange();
  assert.equal(t.run('EQ.limpeza.est.fotos.join()'), 'fc');
  t.toasts.length = 0; t.node('#lz-enviar').onclick();
  assert.equal(t.salvas.length, 2); assert.match(t.toasts.join(' '), /Limpeza registrada · 2 O\.S/);
  assert.equal(t.run('EQ.limpeza'), null, 'a tela fecha');
});
test('espelho: o que a limpeza grava cabe no crachá de toque e passa pelo saneamento do servidor', async () => {
  const {CAMPOS_MONTAGEM, sanearVoltaEquipe} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const antes = voltaEsp('1', {finalizadaEm:hojeReal+'T15:05:00'});
  const t = espelho(null, [JSON.parse(JSON.stringify(antes))]);
  t.run(`salvarLimpezaCarro(limpezasPendentes()[0], {resp:${tudoSim}, obs:'', fotos:['foto_1727300000000_ab12cd']})`);
  const depois = t.salvas[0];
  const mudou = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(k => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
  assert.ok(mudou.includes('voltaEquipe'));
  assert.deepEqual(mudou.filter(k => !CAMPOS_MONTAGEM.has(k)), [], 'campo fora de CAMPOS_MONTAGEM é descartado calado pelo servidor');
  const s = sanearVoltaEquipe(depois.voltaEquipe, null, {nome:'Ana', sub:'Ana'}, new Date().toISOString());
  for (const k of ['carroLimpo','carroArrumado','equipamentosOk','semAvaria','obs','dia','veiculo']) assert.equal(s[k], depois.voltaEquipe[k], k);
  assert.equal(s.fotos.join(), depois.voltaEquipe.fotos.join(), 'o fileId do pushPhoto passa no filtro');
});
test('espelho: abrir a limpeza a partir da O.S. finalizada destrava a tela', () => {
  const fin = voltaEsp('1', {finalizadaEm:hojeReal+'T15:05:00', finalizadoPor:'Ana'});
  const t = espelho(JSON.parse(JSON.stringify(fin)), [fin]);
  const modal = t.node('#modal-os');
  assert.match(modal.innerHTML, /class="lock-allow limpeza-linha"><span>🧽 Limpeza do carro: falta registrar\.<\/span><button[^>]*data-limpeza-ficha=/,
    'o atalho mora num .lock-allow: a O.S. finalizada trava o resto');
  assert.deepEqual(modal.classList.ops.filter(o => o[1] === 'os-locked').at(-1), ['toggle','os-locked',true]);
  t.run('abrirLimpezaCarro(limpezasPendentes()[0].chave)');
  assert.deepEqual(modal.classList.ops.filter(o => o[1] === 'os-locked').at(-1), ['remove','os-locked'],
    'com os-locked a câmera fica com pointer-events:none e a foto não sai');
  assert.match(modal.innerHTML, /data-lz-foto/);
  assert.equal(t.run('_draft'), null);
});
test('espelho: tocar Sim depois de escrever a observação não apaga o texto', () => {
  const t = espelho(null, [voltaEsp('1')]);
  t.run(`abrirLimpezaCarro(limpezasPendentes()[0].chave); marcarLimpeza('equipamentosOk','nao')`);
  assert.match(t.node('#modal-os').innerHTML, /<input type="text" id="lz-obs"/);
  const obs = t.node('#lz-obs'); obs.value = 'faltou a escada de 6 m'; obs.oninput();
  t.run(`marcarLimpeza('carroLimpo','sim'); marcarLimpeza('equipamentosOk','sim')`);
  assert.equal(t.run('EQ.limpeza.est.obs'), 'faltou a escada de 6 m');
  assert.match(t.node('#modal-os').innerHTML, /value="faltou a escada de 6 m"/, 'continua visível: nada escondido é gravado');
});
test('volta do carro: a gestão vê o que a equipe registrou, sem miniatura na fila e sem pré-marcar a conferência', () => {
  const ve = {carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim',obs:'faltou a escada',fotos:['fc'],dia:hoje,veiculo:'Strada',por:'Ana',porId:'Ana',em:hoje+'T21:05:00.000Z'};
  const t = tela([voltaOS('1', {voltaEquipe:ve}), voltaOS('2', {voltaEquipe:{...ve}}), voltaOS('3', {veiculo:'Saveiro'})]);
  const html = t.run('voltasHTML()');
  assert.match(html, /Equipe registrou/); assert.match(html, /📷 1/); assert.match(html, /faltou a escada/);
  assert.match(html, /volta-resp eq ruim">✗ equipamentos/, 'selo de contorno, não o do PCP');
  assert.doesNotMatch(html, /data-foto-img/, 'a fila não baixa a JPEG de cada volta');
  assert.match(html, /Equipe não registrou a limpeza/, 'a volta do Saveiro');
  const g = 'voltasDoRecorte().todas.find(g=>g.os.length===2)';
  const ini = JSON.parse(t.run(`JSON.stringify(respostasIniciaisVolta(${g}))`));
  for (const k of ['carroLimpo','carroArrumado','equipamentosOk','semAvaria']) assert.equal(ini[k], '', k + ' não vem da equipe');
  // O diálogo mostra o bloco da equipe com a miniatura, e nenhuma resposta marcada.
  t.run(`globalThis.__dlg={innerHTML:'',open:true,querySelector:()=>({}),querySelectorAll:()=>[]}; document.getElementById=()=>__dlg; abrirConferenciaVolta(${g})`);
  const dlg = t.run('__dlg.innerHTML');
  assert.match(dlg, /O que a equipe registrou \(não conta na nota\)[^]*data-foto-img="fc"/);
  assert.doesNotMatch(dlg, /data-volta-r="\w+\|(sim|nao)" aria-pressed="true"/);
  // Salvar a conferência não mexe na declaração.
  t.run(`globalThis.__salvas=[]; STORE.saveOS=o=>__salvas.push(JSON.parse(JSON.stringify(o)))`);
  assert.equal(t.run(`salvarConferenciaVolta(${g}, {${tudoSim.slice(1,-1)},obs:'',fotos:[]})`), 2);
  for (const o of t.run('__salvas')) { assert.equal(o.voltaEquipe.equipamentosOk, 'nao'); assert.equal(o.retornoConf.equipamentosOk, 'sim'); }
  assert.match(t.run(`conferenciaVoltaHTML(STORE.getOS('1'), false)`), /Equipe registrou[^]*data-foto-img="fc"/, 'a ficha mostra com a foto');
});
test('espelho: O.S. que o PCP conferiu com a tela aberta não recebe a declaração (a gravação relê a O.S.)', () => {
  const lista = [voltaEsp('1'), voltaEsp('2')];
  const t = espelho(null, lista);
  t.run('globalThis.__g = limpezasPendentes()[0]');
  // O pull troca o objeto (não muda o antigo): quem grava pelo objeto velho da tela não vê a conferência.
  lista[1] = {...lista[1], rev:5, retornoConf:{carroLimpo:'sim', por:'Gestor'}};
  assert.equal(t.run(`salvarLimpezaCarro(__g, {resp:${tudoSim}, obs:'', fotos:['fc']})`), 1);
  assert.equal(t.salvas.map(o => o.id).join(), '1');
});
