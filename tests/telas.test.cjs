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
