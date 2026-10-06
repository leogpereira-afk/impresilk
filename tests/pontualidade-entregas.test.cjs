const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs');
const mes=(nome,entregas)=>({mes:nome,entregasCarregadas:true,entregas});
const os=(numero,data,previsao)=>({numero,cliente:'Cliente fictício',data,previsao,valor:10});
function tela(){const ctx=vm.createContext({console,Date,Set,Number,Object,Map,Intl,MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')});vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),ctx);return {run:c=>vm.runInContext(c,ctx),dados:v=>{ctx.fixture=v;}};}
test('relatório preserva prazo e entrega distintos sem gravar ou duplicar O.S.',async()=>{
 const rows=[os('01','2025-02-12','2025-02-10'),os('01','2025-02-12','2025-02-10'),os('02','2025-03-01','2025-02-28')];
 const e=await edge('pcp-sync',{painel_ordens:[],painel_cache:[],registros:[],pcp_meta:[{chave:'entregues:2025-02',valor:{v:3,os:rows}}]});
 const antes=JSON.stringify(e.db);const r=await e.call({action:'relatorioEntregas',ano:2025},{papel:'pcp'});
 assert.equal(r.status,200);assert.equal(r.meses[1].entregas.length,1);
 assert.equal(r.meses[1].entregas[0].previsao,'2025-02-10');assert.equal(r.meses[1].entregas[0].data,'2025-02-12');
 assert.equal(r.meses[1].entregasCarregadas,true);assert.equal(r.meses[0].entregasCarregadas,false);
 assert.equal(JSON.stringify(e.db),antes);
});
test('mês vazio carregado é diferente de falta de fonte e pacote antigo não inventa prazo',async()=>{
 const e=await edge('pcp-sync',{pcp_meta:[{chave:'entregues:2025-01',valor:{v:3,os:[]}},{chave:'entregues:2025-02',valor:{v:2,os:[os('01','2025-02-12',undefined)]}}]});
 const r=await e.call({action:'relatorioEntregas',ano:2025});assert.equal(r.meses[0].entregasCarregadas,true);assert.equal(r.meses[2].entregasCarregadas,false);assert.equal(r.meses[1].entregas[0].previsao,'');
});
test('antecipada e mesmo dia são no prazo; atraso conta dias corridos e ignora dinheiro',()=>{
 const t=tela();t.dados([mes('2025-02',[os('1','2025-02-09','2025-02-10'),os('2','2025-02-10','2025-02-10'),os('3','2025-02-12','2025-02-10'),os('4','2025-02-16','2025-02-10')])]);
 const p=t.run('relEntPontualidade(fixture)');assert.equal(p.total,4);assert.equal(p.noPrazo,2);assert.equal(p.atrasadas,2);assert.equal(p.percentualNoPrazo,50);assert.equal(p.percentualAtraso,50);assert.equal(p.mediaAtraso,4);assert.equal(p.maiorAtraso,6);assert.equal(p.antecipadas,1);
});
test('datas ausentes ou impossíveis ficam fora dos percentuais',()=>{
 const t=tela();t.dados([mes('2025-02',[os('1','2025-02-10','2025-02-10'),os('2','2025-02-10',''),os('3','2025-02-10','2025-02-30'),os('4','invalida','2025-02-10')])]);
 const p=t.run('relEntPontualidade(fixture)');assert.equal(p.total,4);assert.equal(p.comparaveis,1);assert.equal(p.semComparacao,3);assert.equal(p.percentualNoPrazo,100);assert.equal(p.cobertura,25);assert.equal(p.mediaAtraso,null);
});
test('ano usa o total de O.S., não a média simples das taxas mensais',()=>{
 const t=tela();t.dados([mes('2025-01',[os('1','2025-01-10','2025-01-10')]),mes('2025-02',[os('2','2025-02-11','2025-02-10'),os('3','2025-02-12','2025-02-10'),os('4','2025-02-13','2025-02-10')])]);
 const p=t.run('relEntPontualidade(fixture)');assert.equal(p.percentualNoPrazo,25);assert.equal(p.percentualAtraso,75);assert.equal(p.mediaAtraso,2);
});
test('sem comparáveis nunca vira 0% ou 100%, nem inclui mês futuro ou fonte ausente',()=>{
 const t=tela();t.dados([mes('2025-01',[]),{mes:'2025-02'}, {...mes('2099-01',[os('1','2099-01-10','2099-01-10')]),futuro:true}]);
 const p=t.run('relEntPontualidade(fixture)');assert.equal(p.percentualNoPrazo,null);assert.equal(p.percentualAtraso,null);assert.equal(p.mediaAtraso,null);assert.equal(p.total,0);assert.equal(p.mesesSemFonte.length,1);
});
test('dias de atraso respeitam virada do ano e ano bissexto',()=>{
 const t=tela();t.dados([mes('2024-03',[os('1','2024-03-01','2024-02-28')]),mes('2025-01',[os('2','2025-01-02','2024-12-31')])]);
 assert.equal(t.run('relEntPontualidade(fixture).mediaAtraso'),2);
});
test('quadro segue mês escolhido, mostra base e permite conferir previsão versus realizado',()=>{
 const t=tela();t.dados([mes('2025-01',[os('1','2025-01-10','2025-01-10')]),mes('2025-02',[os('2','2025-02-12','2025-02-10')])]);
 t.run("REL_ENT.dados={ate:'2025-12-31',meses:fixture};REL_ENT.ano=2025;REL_ENT.foco='02';REL_ENT.abertos.pontualidade=true");
 const h=t.run('relEntPontualidadeHTML()');assert.match(h,/100%/);assert.match(h,/10\/02\/2025/);assert.match(h,/12\/02\/2025/);assert.doesNotMatch(h,/10\/01\/2025/);assert.match(h,/2 dias/);
});
test('filtro de atrasos não inclui entregas sem previsão; paginação limita a conferência',()=>{
 const t=tela();t.dados([mes('2025-02',[...Array.from({length:65},(_,i)=>os(String(i),'2025-02-12','2025-02-10')),os('sem','2025-02-10','')])]);
 t.run("REL_ENT.dados={ate:'2025-12-31',meses:fixture};REL_ENT.foco='02';REL_ENT.filtroPontualidade='atraso';REL_ENT.limitePontualidade=50");
 const h=t.run('relEntPontualidadeHTML()');assert.equal((h.match(/data-rel-prazo-linha/g)||[]).length,50);assert.match(h,/50 de 65/);assert.doesNotMatch(h,/<td>sem<\/td>/);
});
