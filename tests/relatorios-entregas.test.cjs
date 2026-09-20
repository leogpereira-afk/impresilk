const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const fixture=()=>({painel_ordens:[{id:'a',numero:'10',cliente:'Teste',data:'2025-01-04',valor:100}],painel_cache:[{chave:'fluxo_mensal',valor:{anos:{2025:{entradas:{'2025-02':80,'2025-03':0}}}},atualizado_em:'2025-03-31'}],pcp_meta:[{chave:'entregues:2025-02',valor:{v:3,os:[{numero:'10',cliente:'Teste',data:'2025-02-01',valor:100},{numero:'10',data:'2025-02-01',valor:100},{numero:'11',data:'2025-03-01',valor:20}]}}],pcp_registros:[{colecao:'os',id:'a',apagado:false,atualizado_em:'2025-02-01',retrabalho:'true',registro:{id:'a',numero:'10',tipo:'externo',finalizadaEm:'2025-02-01',finalizadoPor:'Ana',retrabalho:true,equipe:['Ana']}}]});
test('relatório separa cadastro, entrega e dinheiro por mês; lacunas não viram zero',async()=>{
 const e=await edge('pcp-sync',fixture()),r=await e.call({action:'relatorioEntregas',ano:2025});assert.equal(r.status,200);
 assert.equal(r.meses[0].vendido,100);assert.equal(r.meses[0].entregue,null);assert.equal(r.meses[0].recebido,null);
 assert.equal(r.meses[1].entregue,100);assert.equal(r.meses[1].entregas.length,1);assert.equal(r.meses[1].recebido,80);assert.equal(r.meses[2].recebido,0);
 assert.equal(r.meses[1].retrabalho,100);assert.equal(r.meses[1].baseRetrabalho,1);assert.equal(r.meses[0].retrabalho,null);
});
test('relatório recusa papel de montagem e anos inválidos',async()=>{
 const e=await edge('pcp-sync',fixture());assert.equal((await e.call({action:'relatorioEntregas',ano:2025},{papel:'montagem'})).status,403);
 assert.equal((await e.call({action:'relatorioEntregas',ano:9999})).status,422);
});
test('valor desconhecido na entrega não é somado como zero',async()=>{
 const f=fixture();f.pcp_meta[0].valor.os[0].valor=null;const e=await edge('pcp-sync',f);const r=await e.call({action:'relatorioEntregas',ano:2025});assert.equal(r.meses[1].entregue,null);
});
test('vendas percorrem mais de uma página sem truncar em 500 registros',async()=>{
 const f=fixture();f.painel_ordens=Array.from({length:501},(_,i)=>({id:String(i).padStart(4,'0'),numero:String(i),data:'2025-01-01',valor:1}));
 const e=await edge('pcp-sync',f);const r=await e.call({action:'relatorioEntregas',ano:2025});assert.equal(r.meses[0].vendido,501);
});
const fs=require('node:fs'),vm=require('node:vm');
function tela(){const ctx=vm.createContext({console,Date,Set,Number,Object,Map,Intl,MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s)});vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),ctx);return c=>vm.runInContext(c,ctx);}
test('média usa somente áreas da produção e instalação, com proteção para histórico incompleto',()=>{
 const run=tela();assert.equal(run("relEntMedia({entregue:120000,rh:{porArea:{Acabamento:4,'Instalação Externa':2,'Comercial e Atendimento':10}}}).valor"),20000);
 assert.equal(run("relEntMedia({entregue:120000,rh:{porArea:{Acabamento:4},piso:true}}).valor"),null);
 assert.equal(run("relEntMedia({entregue:120000,rh:{porArea:{}}}).valor"),null);
 assert.equal(run("relEntMedia({entregue:null,rh:{porArea:{Acabamento:4}}}).valor"),null);
});
test('gráfico não desenha futuro nem liga uma lacuna como se fosse medição',()=>{
 const run=tela();run("REL_ENT.dados={meses:[{mes:'2025-01',entregue:10},{mes:'2025-02',entregue:null},{mes:'2025-03',entregue:20},{mes:'2025-04',entregue:999,futuro:true}]}");const html=run("relEntGrafico(['entregue'],'Teste')");assert.equal((html.match(/<polyline/g)||[]).length,2);assert.equal((html.match(/<circle/g)||[]).length,2);assert.ok(!html.includes('999'));
});
test('RH conta quem esteve ativo no mês, preserva desligados e não inclui admissão futura',async()=>{
 const hoje=new Date().toISOString().slice(0,10),mes=hoje.slice(0,7);
 const registros=[['a','2025-01-01','2025-01-15'],['b','2025-02-01',''],['c','2099-01-01','']].map(([id,dataAdmissao,dataDesligamento])=>({id,colecao:'colaboradores',apagado:false,registro:{dataAdmissao,dataDesligamento,areaId:'p'}}));
 const e=await edge('pcp-sync',{registros});const r=await e.call({action:'equipeHistorico',meses:['2025-01','2025-02',mes]});assert.equal(r.status,200);assert.equal(r.meses.find(m=>m.mes==='2025-01').total,1);assert.equal(r.meses.find(m=>m.mes==='2025-02').total,1);assert.equal(r.meses.find(m=>m.mes===mes).total,1);
});
test('chips recortam resumo e tabelas por mês, com opção de ano completo',()=>{
 const run=tela();run("REL_ENT.dados={meses:[{mes:'2026-01'},{mes:'2026-02'},{mes:'2026-12',futuro:true}]};REL_ENT.foco='02'");
 assert.equal(run('relEntMesesVisiveis().length'),1);assert.equal(run('relEntMesesVisiveis()[0].mes'),'2026-02');run("REL_ENT.foco=''");assert.equal(run('relEntMesesVisiveis().length'),2);
});
