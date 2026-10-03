const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../comissao.js');
const {edge}=require('./helpers/edge.cjs');
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const config={modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'};
const registro=(id='os1',valor=120000)=>({id,numero:id,dia:'2026-11-02',valor,confirmado:true,equipeId:'eq1',membros:[{chave:'100001',nome:'Pessoa A',percentual:60},{chave:'100002',nome:'Pessoa B',percentual:40}]});
const fonte=(rs=[registro()])=>({id:'fechamento-1',fechadoEm:'2026-12-01',periodo:{de:'2026-11-01',ate:'2026-11-30'},registros:rs});
function entrada(rs=[registro()],interna='elegivel') {return {config:{...config},decisoes:Object.fromEntries(rs.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),entregas:Object.fromEntries(rs.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:interna,partes:[{pessoaId:'100003',cota:10000}]}}]))};}
test('motor compartilhado: paridade exata e R$120 mil com e sem interna',async()=>{
 const server=(await import('../supabase/functions/_shared/pcp-comissao.mjs')).COMISSAO;
 assert.equal(fs.readFileSync('comissao.js','utf8').split("'use strict';\n")[1].split('\nif (typeof module')[0],fs.readFileSync('supabase/functions/_shared/pcp-comissao.mjs','utf8').split('\nexport {')[0]);
 const f=fonte(),e=entrada(),a=C.apurar(f,e);assert.deepEqual(a,server.apurar(f,e));assert.equal(a.aprovavel,true,JSON.stringify(a.pendencias));assert.equal(a.totalCentavos,120000);
 assert.deepEqual(a.linhas[0].pagamentos.map(p=>p.centavos),[57600,38400,24000]);
 e.entregas.os1.interna.situacao='impeditivo';assert.deepEqual(C.apurar(f,e).linhas[0].pagamentos.map(p=>p.centavos),[72000,48000]);
 e.entregas.os1.interna.situacao='pendente';assert.equal(C.apurar(f,e).aprovavel,false);assert.equal(C.apurar(f,e).linhas[0].comissaoCentavos,null);
});
test('descontos e parciais em dias/equipes diferentes fecham a base e os centavos',()=>{
 const rs=[{...registro('parte1',5100),osId:'os1',entregaId:'p1',baseAnteriorCentavos:0,fracaoOS:5100/18000,valorBrutoCentavos:566667,descontoCentavos:56667},{...registro('parte2',12900),osId:'os1',entregaId:'p2',baseAnteriorCentavos:510000,dia:'2026-11-03',fracaoOS:12900/18000,equipeId:'eq2',membros:[{chave:'100004',nome:'C',percentual:60},{chave:'100005',nome:'D',percentual:40}]}];
 const e=entrada(rs);e.entregas.parte2.grupos=[{montadorId:'100004'}];const a=C.apurar(fonte(rs),e);
 assert.equal(a.aprovavel,true);assert.equal(a.totalCentavos,18000);assert.equal(a.linhas.reduce((s,l)=>s+l.baseLiquidaCentavos,0),1800000);assert.equal(a.linhas[0].descontoCentavos,56667);
 assert.equal(a.pessoas.reduce((s,p)=>s+p.centavos,0),18000);assert.ok(a.pessoas.some(p=>p.pessoaId==='100005'));
 for(let v=1;v<500;v++){const rr=[registro('os1',v/100)];const out=C.apurar(fonte(rr),entrada(rr));assert.equal(out.pessoas.reduce((s,p)=>s+p.centavos,0),out.totalCentavos);}
 const dup=C.apurar(fonte([...rs,rs[0]]),e);assert.equal(dup.aprovavel,false);assert.ok(dup.pendencias.some(p=>p.includes('repetida')));
});
test('falha comprovada zera somente a O.S.; desconhecido não pune; cliente/produção não cortam',()=>{
 const rs=[registro(),registro('os2'),registro('os3')],e=entrada(rs);
 e.decisoes.os1={...doc,decisao:'falha_comprovada',tipo:'incompleto'};
 let a=C.apurar(fonte(rs),e);assert.equal(a.totalCentavos,240000);assert.equal(a.linhas[0].pontos,0);assert.equal(a.linhas[1].pontos,1);
 e.decisoes.os1.decisao='pendente';a=C.apurar(fonte(rs),e);assert.equal(a.linhas[0].pontos,null);assert.equal(a.aprovavel,false);
 e.decisoes.os1={...doc,decisao:'sem_falha',tipo:'cliente'};assert.equal(C.apurar(fonte(rs),e).totalCentavos,360000);
 e.decisoes.os1={...doc,decisao:'falha_comprovada',tipo:'producao'};assert.equal(C.apurar(fonte(rs),e).aprovavel,false);
 e.decisoes.os1={...doc,decisao:'abono',tipo:'atraso'};assert.equal(C.apurar(fonte(rs),e).totalCentavos,360000);
 delete e.decisoes.os1.evidencia;assert.equal(C.apurar(fonte(rs),e).aprovavel,false);
});
test('não herda padrões remuneratórios de solo/trio e não decide campeão',()=>{
 const r=registro();r.membros.push({chave:'100004',nome:'D',percentual:10});const e=entrada([r]);let a=C.apurar(fonte([r]),e);assert.equal(a.aprovavel,false);
 e.entregas.os1.grupos=[{partes:[{pessoaId:'100001',cota:5000},{pessoaId:'100002',cota:3000},{pessoaId:'100004',cota:2000}],justificativa:'Rateio fictício explicitamente autorizado'}];a=C.apurar(fonte([r]),e);assert.equal(a.aprovavel,true);assert.equal(a.reconhecimento.campeao,null);assert.equal(a.reconhecimento.situacao,'pendente');
 delete e.entregas.os1.interna.partes;assert.equal(C.apurar(fonte([r]),e).aprovavel,false);
});
test('cadastro ambíguo exige vínculo explícito; dupla não aceita mesma pessoa duas vezes',()=>{
 const r=registro();r.membros[0].chave='Ana ambígua';const e=entrada([r]);assert.equal(C.apurar(fonte([r]),e).aprovavel,false);
 e.entregas.os1.identidades={'Ana ambígua':'100001'};assert.equal(C.apurar(fonte([r]),e).aprovavel,true);
 e.entregas.os1.identidades={'Ana ambígua':'100002'};e.entregas.os1.grupos[0].montadorId='100002';assert.equal(C.apurar(fonte([r]),e).aprovavel,false);
});
const who={papel:'pcp',nome:'Gestor fictício',sub:'gestor'};
async function ambiente() {
 const r=registro();const e=await edge('pcp-sync',{pcp_registros:[{colecao:'os',id:r.id,apagado:false,atualizado_em:'2020-01-01',registro:{id:r.id,numero:r.numero,tipo:'externo',cliente:'Teste',finalizadaEm:'2026-11-02T15:00:00Z',equipe:['100001','100002'],valorTotal:r.valor}}],registros:[1,2,3].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:r.id,membros:r.membros,por:'Gestor',em:'2026-11-03'}]}}}],painel_ordens:[]});
 const periodo=fonte().periodo,live=await e.call({action:'performancePeriodo',...periodo},who);assert.equal(live.status,200);
 const f={...live,...periodo,id:'fechamento-1',revisao:1,fechadoEm:'2026-12-01',fechadoPor:'Gestor'};e.db.pcp_registros.push({colecao:'performance_fechamentos',id:f.id,registro:f,apagado:false});
 return {e,periodo,f};
}
async function previa(ctx,extra={}){return ctx.e.call({action:'performanceComissaoNova',...ctx.periodo,fechamentoId:ctx.f.id,anterior:'',entrada:entrada(ctx.f.registros),motivo:'Conferência fictícia inicial',requestId:'previa-test-12345',...extra},who);}
async function aprovar(ctx,r,extra={}) {return ctx.e.call({action:'performanceComissaoAprovar',...ctx.periodo,anterior:r.id,hash:r.hash,confirmacao:true,motivo:'Revisão humana fictícia',requestId:'aprovar-test-12345',...extra},who);}
test('API recalcula no servidor, recusa fraude, aprova append-only e exporta só última efetiva',async()=>{
 const ctx=await ambiente(),p=await previa(ctx,{apuracao:{totalCentavos:1},tipo:'aprovacao'});assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.revisao.apuracao.totalCentavos,120000);assert.equal(p.revisao.tipo,'previa');
 assert.equal((await ctx.e.call({action:'performanceComissaoExportar',...ctx.periodo,id:p.revisao.id},who)).status,422);
 assert.equal((await aprovar(ctx,p.revisao,{hash:'forjado'})).status,422);
 assert.equal((await aprovar(ctx,p.revisao,{confirmacao:false})).status,422);
 const a=await aprovar(ctx,p.revisao);assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.revisao.tipo,'aprovacao');
 assert.equal((await aprovar(ctx,p.revisao)).repetida,true);
 const csv=await ctx.e.call({action:'performanceComissaoExportar',...ctx.periodo,id:a.revisao.id},who);assert.equal(csv.ok,true);assert.match(csv.csv,/576,00/);
 const nova=await previa(ctx,{anterior:a.revisao.id,requestId:'nova-test-12345'});assert.equal(nova.ok,true);assert.equal((await ctx.e.call({action:'performanceComissaoExportar',...ctx.periodo,id:a.revisao.id},who)).status,409);
 assert.equal(ctx.e.db.pcp_registros.filter(x=>x.colecao==='performance_comissao').length,3);
});
test('API bloqueia restritos, pendências, teste, fonte alterada e períodos sobrepostos',async()=>{
 const ctx=await ambiente();for(const papel of ['montagem','operacao','comercial'])for(const action of ['performanceComissaoListar','performanceComissaoNova','performanceComissaoAprovar','performanceComissaoExportar'])assert.equal((await ctx.e.call({action,...ctx.periodo},{papel})).status,403);
 assert.equal((await ctx.e.call({action:'performanceComissaoListar',...ctx.periodo})).status,403);
 const p=await previa(ctx);ctx.e.db.pcp_registros.find(r=>r.colecao==='os').registro.valorTotal=200000;assert.equal((await aprovar(ctx,p.revisao)).status,409);
 ctx.e.db.pcp_registros.find(r=>r.colecao==='os').registro.valorTotal=120000;
 ctx.e.db.pcp_registros.push({colecao:'performance_comissao_entregas',id:'os1',registro:{periodo:'outro-periodo'},apagado:false});assert.equal((await aprovar(ctx,p.revisao)).status,409);
 const testCtx=await ambiente(),en=entrada(testCtx.f.registros);en.config.modo='teste';const t=await previa(testCtx,{entrada:en});const at=await aprovar(testCtx,t.revisao);assert.equal(at.ok,true);assert.equal((await testCtx.e.call({action:'performanceComissaoExportar',...testCtx.periodo,id:at.revisao.id},who)).status,422);
 const pend=await ambiente(),ep=entrada(pend.f.registros);ep.entregas.os1.interna.situacao='pendente';const pp=await previa(pend,{entrada:ep});assert.equal((await aprovar(pend,pp.revisao)).status,422);
});
test('API idempotência não aceita reusar pedido com regra diferente e conflito não substitui revisão',async()=>{
 const ctx=await ambiente(),p=await previa(ctx);assert.equal((await previa(ctx)).repetida,true);
 const en=entrada(ctx.f.registros);en.config.modo='teste';assert.equal((await previa(ctx,{entrada:en})).status,409);
 assert.equal((await previa(ctx,{requestId:'outro-pedido-12345'})).status,409);assert.equal(ctx.e.db.pcp_registros.filter(x=>x.colecao==='performance_comissao').length,1);
});

test('arredondamento de parciais conserva comissão e revisão exporta diferenças',()=>{
 const rs=[{...registro('a',0.5),osId:'os1',entregaId:'a',fracaoOS:0.5,baseAnteriorCentavos:0},{...registro('b',0.5),osId:'os1',entregaId:'b',fracaoOS:0.5,baseAnteriorCentavos:50}];
 const a=C.apurar(fonte(rs),entrada(rs));assert.equal(a.totalCentavos,1);assert.equal(a.pessoas.reduce((s,p)=>s+p.centavos,0),1);
 const primeiro=C.conciliar(a,null),rev=C.conciliar(a,{id:'aprovacao-1',apuracao:primeiro});assert.equal(rev.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),0);assert.equal(rev.anteriorAprovacao,'aprovacao-1');
 const removida=C.conciliar({...a,pessoas:[]},{id:'aprovacao-1',apuracao:primeiro});assert.equal(removida.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),-1);
 assert.match(C.csv({id:'r2',tipo:'aprovacao',apuracao:removida}),/"-0,01"/);
});
test('conflito concorrente reverte também reserva de entregas no INSERT atômico',async()=>{
 const ctx=await ambiente(),p=await previa(ctx),id=ctx.periodo.de+':'+ctx.periodo.ate+':000002';
 ctx.e.cliente.beforeWrite=(db)=>db.pcp_registros.push({colecao:'performance_comissao',id,registro:{id,revisao:2},apagado:false});
 assert.equal((await aprovar(ctx,p.revisao)).status,409);assert.equal(ctx.e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_entregas').length,0);
});

test('reconhecimento preserva composição, identifica substituição e empate, exige revisão específica',()=>{
 const rs=[registro('a'),{...registro('b'),membros:[{chave:'100001',nome:'A',percentual:60},{chave:'100004',nome:'D',percentual:40}]},{...registro('c'),equipeId:'eq2',fracaoOS:1}];
 const e=entrada(rs),a=C.apurar(fonte(rs),e);assert.equal(a.reconhecimento.equipes.find(g=>g.chave==='eq1').substituicao,true);assert.equal(a.reconhecimento.campeao,null);
 const empate=C.apurar(fonte([rs[0],rs[2]]),entrada([rs[0],rs[2]]));assert.ok(empate.reconhecimento.equipes.every(g=>g.empate));assert.ok(empate.reconhecimento.equipes.every(g=>g.situacao==='pendente'));
});
