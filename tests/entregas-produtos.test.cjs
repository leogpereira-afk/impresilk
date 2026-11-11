// Todos os nomes, ordens e valores deste arquivo são fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs');
const itens=()=>[
 {categoria:'Grupo fictício',produto:'Produto Alfa fictício',modelo:'Modelo fino',valorTotal:60,quantidade:2},
 {categoria:'Grupo fictício',produto:'Produto Beta fictício',modelo:'Modelo fino',valorTotal:40,quantidade:1}
];
function fonte(produtos=itens(),valor=90){return {painel_ordens:[{id:'ficticia-a',numero:'EXEMPLO-A',data:'2024-05-01',itens:produtos,valor:90}],pcp_meta:[{chave:'entregues:2025-02',valor:{v:3,os:[{numero:'EXEMPLO-A',data:'2025-02-10',valor}]}}]};}
async function rel(f){const e=await edge('pcp-sync',f),antes=JSON.stringify(e.db),r=await e.call({action:'relatorioEntregas',ano:2025},{papel:'pcp'});assert.equal(r.status,200);assert.equal(JSON.stringify(e.db),antes,'consulta não grava dados');return r.meses[1];}
test('produtos usam itens da ordem anterior ao ano e rateiam o líquido sem contar quantidade duas vezes',async()=>{
 const f=fonte();f.pcp_meta[0].valor.os.push({...f.pcp_meta[0].valor.os[0]});
 const m=await rel(f);assert.equal(m.entregue,90);assert.equal(m.entregas.length,1);assert.equal(m.produtosDisponiveis,true);
 assert.deepEqual(m.entregas[0].produtos,[{produto:'Produto Alfa fictício',valor:54},{produto:'Produto Beta fictício',valor:36}]);
});
test('rateio conserva cada centavo e o zero conhecido mesmo quando o valor dos itens difere da O.S.',async()=>{
 const base=Array.from({length:3},(_,i)=>({produto:'Produto fictício '+i,modelo:'Único',valorTotal:1}));
 assert.deepEqual((await rel(fonte(base,1))).entregas[0].produtos.map(p=>p.valor),[.34,.33,.33]);
 assert.deepEqual((await rel(fonte(base,0))).entregas[0].produtos.map(p=>p.valor),[0,0,0]);
 assert.equal((await rel(fonte(base,null))).entregas[0].produtos,null);
});
test('item inválido ou ordem ambígua fica sem classificação, preservando o total entregue',async()=>{
 for(const v of [null,'',true,-1,'inválido']){const xs=itens();xs[1].valorTotal=v;const m=await rel(fonte(xs));assert.equal(m.entregue,90);assert.equal(m.entregas[0].produtos,null);}
 const f=fonte();f.painel_ordens.push({...f.painel_ordens[0],id:'ficticia-b'});assert.equal((await rel(f)).entregas[0].produtos,null);
 assert.equal((await rel(fonte([]))).entregas[0].produtos,null);
});
test('falha na consulta de tipos não derruba o relatório nem seus valores',async()=>{
 const e=await edge('pcp-sync',fonte()),from=e.cliente.from;
 e.cliente.from=function(t){const q=from.call(this,t),select=q.select;q.select=function(c){select(c);if(t==='painel_ordens'&&c==='id,numero,itens')q.then=resolve=>resolve({data:null,error:{message:'Fonte fictícia indisponível'}});return q;};return q;};
 const r=await e.call({action:'relatorioEntregas',ano:2025},{papel:'admin'});assert.equal(r.status,200);assert.equal(r.meses[1].entregue,90);assert.equal(r.meses[1].produtosDisponiveis,false);assert.equal(r.meses[1].entregas[0].produtos,null);
});
test('leitura por número percorre lotes de produtos e não mistura cadastros fora das entregas',async()=>{
 const f=fonte();f.painel_ordens=Array.from({length:105},(_,i)=>({id:'ficticio-'+i,numero:'EXEMPLO-'+i,data:'2024-01-01',itens:itens()}));
 f.pcp_meta[0].valor.os=f.painel_ordens.map(o=>({numero:o.numero,data:'2025-02-10',valor:90}));
 const m=await rel(f);assert.equal(m.entregas.length,105);assert.ok(m.entregas.every(o=>o.produtos?.length===2));assert.equal(m.entregue,9450);
});
test('tipos de produtos continuam restritos à gestão',async()=>{
 const e=await edge('pcp-sync',fonte());for(const papel of ['montagem','operacao','comercial'])assert.equal((await e.call({action:'relatorioEntregas',ano:2025},{papel})).status,403);
});
function tela(meses){const ctx=vm.createContext({console,Date,Set,Map,Number,Object,Intl,STATE:{user:{papel:'pcp'}},MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fixture:meses});vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),ctx);vm.runInContext("REL_ENT.ano=2025;REL_ENT.foco='';REL_ENT.dados={de:'2025-01-01',ate:'2025-12-31',meses:fixture}",ctx);return s=>vm.runInContext(s,ctx);}
const mes=(m='2025-02',valor=90,produtos=[{produto:'Produto Alfa fictício',modelo:'Modelo fino',valor:54},{produto:'Produto Beta fictício',modelo:'Modelo fino',valor:36}])=>({mes:m,entregue:valor,produtosDisponiveis:true,entregas:[{numero:'EXEMPLO-'+m,valor,produtos}]});
test('painel separa produtos diferentes, soma o período e acompanha os atalhos',()=>{
 const run=tela([mes('2024-12'),mes(),mes('2025-03'),{mes:'2025-04',entregue:null},mes('2025-05')]);
 run("REL_ENT.intervalo={inicio:'2024-12',fim:'2025-04'}");
 let p=run('relEntProdutosPeriodo()');assert.equal(p.total,27000);assert.equal(p.tipos.length,2);assert.equal(p.tipos[0].valor,16200);assert.equal(p.tipos[0].os,3);assert.equal(p.mesesComValor,3);
 assert.match(run('relEntProdutosHTML()'),/período com dados parciais/);
 run("relEntSelecionarMes('02')");p=run('relEntProdutosPeriodo()');assert.equal(p.total,9000);assert.equal(p.tipos[0].valor,5400);
 run("relEntSelecionarMes('')");assert.equal(run('relEntProdutosPeriodo().total'),27000);
});
test('painel junta os modelos do mesmo produto numa linha e conta a O.S. uma vez',()=>{
 const xs=mes();xs.entregas[0].produtos=[{produto:'Produto fictício',modelo:'Fino',valor:54},{produto:'Produto fictício',modelo:'Grosso',valor:36}];
 const run=tela([xs]),p=run('relEntProdutosPeriodo()');assert.equal(p.tipos.length,1);assert.equal(p.tipos[0].valor,9000);assert.equal(p.tipos[0].os,1);assert.equal(p.tipos[0].rotulo,'Produto fictício');assert.doesNotMatch(run('relEntProdutosHTML()'),/Fino|Grosso/);
});
test('classificação faltante ou rateio divergente aparece à parte e reconcilia com o total',()=>{
 const xs=mes();xs.entregas[0].produtos[1].produto='';const sem=mes('2025-03');delete sem.entregas[0].produtos;
 const run=tela([xs,sem]);const p=run('relEntProdutosPeriodo()');assert.equal(p.total,18000);assert.equal(p.semClassificacao,12600);assert.equal(p.tipos[0].valor,5400);assert.equal(p.osSemClassificacao,2);assert.match(run('relEntProdutosHTML()'),/Sem classificação/);
 const divergente=mes();divergente.entregas[0].produtos[0].valor=999;assert.equal(tela([divergente])('relEntProdutosPeriodo().semClassificacao'),9000);
});
test('lacuna não vira zero, dados futuros ficam fora e o quadro respeita a seleção e o papel',()=>{
 const run=tela([{mes:'2025-01',entregue:null},{...mes(),futuro:true}]);assert.match(run('relEntProdutosHTML()'),/Sem informação de entregas/);assert.equal(run('relEntProdutosPeriodo().total'),null);
 run("REL_ENT.selecionados.delete('entregue')");assert.equal(run('relEntProdutosHTML()'),'');
 run("REL_ENT.selecionados.add('entregue');STATE.user.papel='montagem'");assert.equal(run('relEntProdutosHTML()'),'');
 assert.equal(tela([mes('2025-01',0,[{produto:'Produto fictício',modelo:'Modelo A',valor:0}])])('relEntProdutosPeriodo().total'),0);
});
test('tipos finais são escapados e todos continuam disponíveis além das dez barras',()=>{
 const produtos=Array.from({length:12},(_,i)=>({produto:i?'Produto fictício '+i:'<img src=x>',modelo:'Modelo fictício',valor:10}));
 const run=tela([mes('2025-02',120,produtos)]),h=run('relEntProdutosHTML()');assert.equal((h.match(/rel-ent-produto-linha/g)||[]).length,10);assert.match(h,/Conferir os 12 tipos/);assert.match(h,/&lt;img src=x&gt;/);assert.doesNotMatch(h,/<img src=x>/);
});
