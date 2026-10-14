// Dados exclusivamente fictícios. A classificação vem da fonte, nunca do nome.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs');
const classes=['A+','A','B+','B','C'];
const ordem=(n,classe,dia='10',prev='10')=>({numero:'ABC-TESTE-'+n,cliente:'Cliente fictício',data:'2025-02-'+dia,previsao:prev?'2025-02-'+prev:'',valor:10,abc:classe?{classe,...(classe==='A+'?{chave:'grupo-ficticio'}:{})}:null,pcp:{situacao:dia>prev?'atraso':'no_prazo',dias:2}});
const mes=entregas=>({mes:'2025-02',entregasCarregadas:true,entregas,entregue:70,vendido:90,recebido:80});
const fonte={ano:'2025',disponivel:true,clientesAmais:[{chave:'grupo-ficticio',nome:'Grupo fictício',grupo:true},{chave:'cliente-sem-entrega',nome:'Cliente fictício sem entregas',grupo:false}]};
const rows=[ordem(1,'A+','10'),ordem(2,'A+','12'),ordem(3,'A','11'),ordem(4,'B+','10'),ordem(5,'B','13'),ordem(6,'C','10'),ordem(7,null,'10')];
const fixture=()=>({pcp_meta:[{chave:'entregues:2025-02',valor:{v:3,os:structuredClone(rows)}}]});
function tela(meses=[mes(rows)]){
 const ctx=vm.createContext({console,Date,Set,Map,Number,Object,Intl,MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),fixture:structuredClone(meses),fonte:structuredClone(fonte)});
 vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),ctx);
 const run=c=>vm.runInContext(c,ctx);run("REL_ENT.ano=2025;REL_ENT.foco='02';REL_ENT.dados={ate:'2025-12-31',meses:fixture,abcPorAno:{2025:fonte}};");return run;
}
test('ABC: cada classe filtra as duas réguas e Todos preserva os totais',()=>{
 const run=tela(),antes=run('JSON.stringify(REL_ENT.dados)');
 const todos=run('relEntPontualidade(fixture)');assert.equal(todos.total,7);assert.equal(todos.noPrazo,4);
 for(const classe of classes){run('REL_ENT.classeABC='+JSON.stringify(classe));const p=run('relEntPontualidade(fixture)');assert.equal(p.total,classe==='A+'?2:1);assert.ok(p.linhas.every(o=>o.abc.classe===classe));assert.equal(p.pcp.medidas,p.total);}
 run("REL_ENT.classeABC='A+';");assert.equal(run('relEntPontualidade(fixture).percentualNoPrazo'),50);
 run("REL_ENT.classeABC='';");assert.equal(run('relEntPontualidade(fixture).total'),7);assert.equal(run('JSON.stringify(REL_ENT.dados)'),antes);
});
test('ABC: cliente individual só filtra A+, por chave exata e com grupo preservado',()=>{
 const run=tela();run("REL_ENT.classeABC='A+';REL_ENT.clienteABC='grupo-ficticio'");assert.equal(run('relEntPontualidade(fixture).total'),2);
 run("REL_ENT.clienteABC='cliente-sem-entrega'");assert.equal(run('relEntPontualidade(fixture).total'),0);assert.equal(run('relEntPontualidade(fixture).percentualNoPrazo'),null);
 run("REL_ENT.classeABC='C'");assert.equal(run('relEntPontualidade(fixture).total'),1);
});
test('ABC: cliente homônimo com outra chave não entra e falta de classe não vira C',()=>{
 const r=structuredClone(rows);r.push({...ordem(8,'A+'),abc:{classe:'A+',chave:'outra-chave'}});const run=tela([mes(r)]);
 run("REL_ENT.classeABC='A+';REL_ENT.clienteABC='grupo-ficticio'");assert.equal(run('relEntPontualidade(fixture).total'),2);
 run("REL_ENT.classeABC='C';REL_ENT.clienteABC=''");assert.equal(run('relEntPontualidade(fixture).total'),1);
 assert.match(run('relEntABCHTML()'),/1 entrega\(s\) sem classe/);
});
test('ABC: datas ausentes ficam fora do denominador e meses são ponderados por O.S.',()=>{
 const r=[ordem(1,'A+','10'),ordem(2,'A+','12',''),ordem(3,'B','12')];const run=tela([mes(r),{mes:'2025-03',entregasCarregadas:true,entregas:[1,2,3].map(n=>({...ordem(n,'A+'),data:'2025-03-12',previsao:'2025-03-10'}))}]);
 run("REL_ENT.classeABC='A+';");const p=run('relEntPontualidade(fixture)');assert.equal(p.total,5);assert.equal(p.comparaveis,4);assert.equal(p.percentualNoPrazo,25);assert.equal(p.semComparacao,1);
});
test('ABC: UI compacta, seis chips, seletor apenas A+ e sem lista de clientes',()=>{
 const run=tela();let h=run('relEntABCHTML()');assert.equal((h.match(/data-rel-abc-classe=/g)||[]).length,6);assert.doesNotMatch(h,/<select|Buscar cliente|<table/);
 for(const classe of classes){run('REL_ENT.classeABC='+JSON.stringify(classe));h=run('relEntABCHTML()');assert.equal(h.includes('id="rel-ent-abc-cliente"'),classe==='A+');}
 run("REL_ENT.classeABC='A+';");h=run('relEntABCHTML()');assert.match(h,/Todos os clientes A\+/);assert.match(h,/Grupo fictício \(grupo\)/);assert.match(h,/Cliente fictício sem entregas/);
});
test('ABC: seleção não modifica indicadores financeiros, série ou objeto de dados',()=>{
 const run=tela();const html=run("relEntGrafico(['entregue','vendido','recebido'],'Financeiro')");
 run("REL_ENT.classeABC='B';");assert.equal(run("relEntGrafico(['entregue','vendido','recebido'],'Financeiro')"),html);assert.match(run('relEntGraficoPontualidade()'),/Classe B/);
});
test('ABC: ano sem fonte não herda classificação de outro ano e avisa sem apagar entregas',()=>{
 const run=tela();run("REL_ENT.dados.abc={...fonte,ano:'2024'};delete REL_ENT.dados.abcPorAno;REL_ENT.dados.meses[0].entregas=REL_ENT.dados.meses[0].entregas.map(o=>({...o,abc:null}));");
 const h=run('relEntABCHTML()');assert.match(h,/indisponível em 2025/);assert.equal((h.match(/disabled/g)||[]).length,5);assert.equal(run('relEntPontualidade(REL_ENT.dados.meses).total'),7);
});
test('ABC: intervalo entre anos mantém a classe de cada ano e protege rótulos HTML',()=>{
 const run=tela([{...mes([ordem(1,'A+')]),mes:'2024-02'},mes([ordem(2,'B')])]);
 run("REL_ENT.intervalo={inicio:'2024-01',fim:'2025-12'};REL_ENT.foco='';REL_ENT.dados.abcPorAno[2024]={...fonte,ano:'2024',clientesAmais:[{chave:'<key>',nome:'<script>fictício</script>'}]};REL_ENT.classeABC='A+';");
 const h=run('relEntABCHTML()');assert.match(h,/2024, 2025/);assert.match(h,/&lt;script&gt;/);assert.doesNotMatch(h,/<script>/);assert.equal(run('relEntPontualidade(fixture).total'),1);
});
test('ABC servidor: vincula por número, entrega somente dados necessários e não grava',async()=>{
 const e=await edge('pcp-sync',fixture()),calls=[],antes=JSON.stringify(e.db);
 const rpc=e.cliente.rpc;e.cliente.rpc=async(n,p)=>{if(n!=='pcp_pontualidade_abc')return rpc(n,p);calls.push([n,p]);return {data:{...fonte,ordens:rows.map(o=>({numero:o.numero,classe:o.abc?.classe||null,chave:o.abc?.chave}))},error:null};};
 const r=await e.call({action:'relatorioEntregas',ano:2025},{papel:'pcp'});
 assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'pcp_pontualidade_abc');assert.equal(calls[0][1].p_ano,'2025');assert.equal(calls[0][1].p_numeros.length,7);
 assert.deepEqual(r.abc.clientesAmais,fonte.clientesAmais);assert.ok(!('ordens' in r.abc));assert.ok(!('clientes' in r.abc));
 assert.equal(r.meses[1].entregas[0].abc.classe,'A+');assert.equal(r.meses[1].entregas[0].abc.chave,'grupo-ficticio');assert.ok(!('chave' in r.meses[1].entregas[2].abc));assert.equal(r.meses[1].entregue,70);assert.equal(JSON.stringify(e.db),antes);
});
test('ABC servidor: falha, migração ausente e fonte de outro ano preservam relatório',async()=>{
 const e=await edge('pcp-sync',fixture());
 for(const answer of [{data:null,error:{message:'function missing'}},{data:{...fonte,ano:'2024',ordens:[]},error:null},{data:{...fonte,ordens:null},error:null},null]){
  e.cliente.rpc=async(n)=>{if(n!=='pcp_pontualidade_abc')return {data:false,error:null};if(answer===null)throw new Error('indisponível');return answer;};const r=await e.call({action:'relatorioEntregas',ano:2025},{papel:'admin'});
  assert.equal(r.status,200);assert.equal(r.abc.disponivel,false);assert.equal(r.meses[1].entregas.length,7);assert.equal(r.meses[1].entregue,70);assert.ok(r.meses[1].entregas.every(o=>o.abc===null));
 }
});
test('ABC servidor: acesso continua restrito à gestão do PCP',async()=>{
 const e=await edge('pcp-sync',fixture());let count=0;e.cliente.rpc=async(n)=>{if(n==='pcp_pontualidade_abc')count++;return {data:null,error:null};};
 for(const papel of ['montagem','operacao','comercial'])assert.equal((await e.call({action:'relatorioEntregas',ano:2025},{papel})).status,403);
 assert.equal(count,0);
});

test('ABC: cliente que saiu de A+ após atualização não deixa um filtro oculto',()=>{
 const run=tela();run("REL_ENT.classeABC='A+';REL_ENT.clienteABC='grupo-ficticio';relEntValidarClienteABC();");assert.equal(run('REL_ENT.clienteABC'),'grupo-ficticio');
 run("REL_ENT.dados.abcPorAno[2025].clientesAmais=[];relEntValidarClienteABC();");assert.equal(run('REL_ENT.clienteABC'),'');assert.equal(run('relEntPontualidade(fixture).total'),2);
});
