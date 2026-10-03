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
 ctx.e.db.pcp_registros.push({colecao:'performance_comissao',id:'outra-aprovacao',registro:{...p.revisao,id:'outra-aprovacao',tipo:'aprovacao',de:'2026-11-02',ate:'2026-11-29'},apagado:false});assert.equal((await aprovar(ctx,p.revisao)).status,409);
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
 assert.equal((await aprovar(ctx,p.revisao)).status,409);assert.equal(ctx.e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_os_versoes').length,0);
});

test('reconhecimento preserva composição, identifica substituição e empate, exige revisão específica',()=>{
 const rs=[registro('a'),{...registro('b'),membros:[{chave:'100001',nome:'A',percentual:60},{chave:'100004',nome:'D',percentual:40}]},{...registro('c'),equipeId:'eq2',fracaoOS:1}];
 const e=entrada(rs),a=C.apurar(fonte(rs),e);assert.equal(a.reconhecimento.equipes.find(g=>g.chave==='eq1').substituicao,true);assert.equal(a.reconhecimento.campeao,null);
 const empate=C.apurar(fonte([rs[0],rs[2]]),entrada([rs[0],rs[2]]));assert.ok(empate.reconhecimento.equipes.every(g=>g.empate));assert.ok(empate.reconhecimento.equipes.every(g=>g.situacao==='pendente'));
});

test('fix: outubro teste e entrega inelegível não consomem centavo efetivo de novembro',()=>{
 const r={...registro('nov',.5),osId:'os1',entregaId:'nov',fracaoOS:.5,baseAnteriorCentavos:50};
 const passada={id:'out-aprovada',tipo:'aprovacao',revisao:1,de:'2026-10-01',ate:'2026-10-31',apuracao:{config:{modo:'teste'},linhas:[{osId:'os1',baseLiquidaCentavos:50,comissaoCentavos:1,decisao:'sem_falha'}]}};
 assert.equal(C.apurar(fonte([r]),entrada([r]),{aprovacoes:[passada]}).totalCentavos,1);
 passada.apuracao.config.modo='efetivo';passada.apuracao.linhas[0].decisao='falha_comprovada';passada.apuracao.linhas[0].comissaoCentavos=0;
 assert.equal(C.apurar(fonte([r]),entrada([r]),{aprovacoes:[passada]}).totalCentavos,1);
});

// Fixture de fonte selada estável: aqui isolamos a transação financeira.
// Os testes anteriores usam perfFonte real para alteração de valores e hash.
function fonteSelada(ctx,periodo,rs,revisao=1) {
 const f={...fonte(rs),...periodo,periodo,id:'fechado-'+periodo.de+'-'+revisao,revisao,hash:'hash-'+periodo.de+'-'+revisao};
 ctx.e.db.pcp_registros.push({colecao:'performance_fechamentos',id:f.id,registro:f,apagado:false});
 ctx.e.run('perfFonte=async body=>(await perfFechamentos(perfPeriodo(body)))[0]');
 return {e:ctx.e,periodo,f};
}
const parcial=(id,fracao,valor=100)=>({...registro(id,valor),osId:'os1',entregaId:id,fracaoOS:fracao});
test('fix: versões por O.S. serializam períodos e entregas distintos após âncora existente',async()=>{
 let ctx=await ambiente();ctx.e.db.pcp_registros=ctx.e.db.pcp_registros.filter(r=>r.colecao!=='performance_fechamentos');
 ctx=fonteSelada(ctx,ctx.periodo,[parcial('primeira',.2,20)]);
 const p0=await previa(ctx),a0=await aprovar(ctx,p0.revisao);assert.equal(a0.ok,true,JSON.stringify(a0));
 ctx.e.db.pcp_registros.push({colecao:'performance_comissao_os',id:'os1',registro:{id:'os1',tipo:'parcial'},apagado:false}); // âncora legada preservada
 const a=fonteSelada(ctx,{de:'2026-12-01',ate:'2026-12-31'},[parcial('entrega-A',.5,50)]);
 const b=fonteSelada(ctx,{de:'2027-01-01',ate:'2027-01-31'},[parcial('entrega-B',.5,50)]);
 const pa=await previa(a),pb=await previa(b);assert.equal(pa.revisao.versoesOS.os1,1);assert.equal(pb.revisao.versoesOS.os1,1);
 // Barreira: AMBAS leem o mesmo saldo/versão e chegam ao INSERT antes de
 // qualquer gravação. As chamadas percorrem o endpoint real e o lote atômico.
 const from=ctx.e.cliente.from.bind(ctx.e.cliente);let chegaram=0,liberar;const barreira=new Promise(r=>liberar=r);
 ctx.e.cliente.from=table=>{const q=from(table),insert=q.insert.bind(q),then=q.then.bind(q);let aprova=false;
   q.insert=v=>{aprova=Array.isArray(v)&&v.some(r=>r.colecao==='performance_comissao'&&r.registro.tipo==='aprovacao');return insert(v);};
   q.then=async(resolve,reject)=>{if(aprova){if(++chegaram===2)liberar();await barreira;}return then(resolve,reject);};return q;};
 const resultados=await Promise.all([aprovar(a,pa.revisao),aprovar(b,pb.revisao)]);
 assert.deepEqual(resultados.map(r=>r.status).sort(),[200,409]);assert.equal(chegaram,2);
 const ativas=C.ativas(ctx.e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao').map(r=>r.registro),'efetivo');
 assert.ok(ativas.flatMap(r=>r.apuracao.linhas).reduce((s,l)=>s+l.fracaoOS,0)<=1);
 assert.equal(ctx.e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_os_versoes').length,2);
 ctx.e.cliente.from=from;
 const perdeu=resultados[0].status===409?a:b,pperdeu=resultados[0].status===409?pa:pb;
 assert.equal((await aprovar(perdeu,pperdeu.revisao,{requestId:'tentar-obsoleta-12345'})).status,409);
 const nova=await previa(perdeu,{anterior:pperdeu.revisao.id,requestId:'reler-saldo-12345'});
 assert.equal((await aprovar(perdeu,nova.revisao,{requestId:'validar-quota-12345'})).status,409); // saldo agora 1,2
});
test('fix: integral e parcial substituem aprovação do mesmo período por diferenças, sem editar história',async()=>{
 const ctx=await ambiente(),p=await previa(ctx),a=await aprovar(ctx,p.revisao);assert.equal(a.ok,true);
 const antes=structuredClone(a.revisao);
 ctx.e.db.pcp_registros.push({colecao:'performance_comissao_os',id:'os1',registro:{id:'os1',tipo:'integral'},apagado:false});
 const pctx=fonteSelada(ctx,ctx.periodo,[parcial('parte-nova',.5,60000)],2);
 const pp=await previa(pctx,{anterior:a.revisao.id,requestId:'trocar-parcial-12345'}),ap=await aprovar(pctx,pp.revisao,{requestId:'aprovar-parcial-12345'});
 assert.equal(ap.ok,true,JSON.stringify(ap));assert.equal(ap.revisao.apuracao.totalCentavos,60000);assert.equal(ap.revisao.apuracao.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),-60000);
 const integral=fonteSelada(ctx,ctx.periodo,[registro()],3),pi=await previa(integral,{anterior:ap.revisao.id,requestId:'voltar-integral-12345'}),ai=await aprovar(integral,pi.revisao,{requestId:'aprovar-integral-12345'});
 assert.equal(ai.ok,true,JSON.stringify(ai));assert.equal(ai.revisao.apuracao.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),60000);
 assert.deepEqual(ctx.e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===antes.id).registro,antes);
 assert.equal(ctx.e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_os_versoes').length,3);
});
test('fix: compensação explícita após fonte mudar libera nova forma/período e exporta negativo',async()=>{
 const ctx=await ambiente(),p=await previa(ctx),a=await aprovar(ctx,p.revisao);assert.equal(a.ok,true);
 const novo=fonteSelada(ctx,{de:'2026-12-01',ate:'2026-12-31'},[parcial('outra-data',.5,60000)]),pn=await previa(novo);
 assert.equal((await aprovar(novo,pn.revisao)).status,409);
 // Fonte antiga agora diverge, mas a compensação se refere ao fato financeiro
 // imutável. Não pede que a O.S. volte aos valores/forma incorretos para estornar.
 ctx.e.run('perfFonte=async()=>{throw new Error("Fonte operacional corrigida e indisponível para este teste")}');
 const pc=await previa(ctx,{anterior:a.revisao.id,requestId:'compensar-previa-12345',compensarId:a.revisao.id});assert.equal(pc.ok,true,JSON.stringify(pc));assert.equal(pc.revisao.tipo,'previa');
 assert.equal((await aprovar(ctx,pc.revisao,{requestId:'compensar-sem-ok-12345',confirmacao:false})).status,422);
 const ac=await aprovar(ctx,pc.revisao,{requestId:'compensar-aprovar-12345'});assert.equal(ac.ok,true,JSON.stringify(ac));assert.equal(ac.revisao.apuracao.totalCentavos,0);assert.equal(ac.revisao.apuracao.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),-120000);
 const csv=await ctx.e.call({action:'performanceComissaoExportar',...ctx.periodo,id:ac.revisao.id},who);assert.equal(csv.ok,true,JSON.stringify(csv));assert.match(csv.csv,/"-576,00"/);
 ctx.e.run('perfFonte=async body=>(await perfFechamentos(perfPeriodo(body)))[0]');
 const pn2=await previa(novo,{anterior:pn.revisao.id,requestId:'nova-apos-compensar-12345'}),an2=await aprovar(novo,pn2.revisao,{requestId:'aprovar-apos-compensar-12345'});assert.equal(an2.ok,true,JSON.stringify(an2));
 assert.equal(ctx.e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===a.revisao.id).registro.apuracao.totalCentavos,120000);
});
test('fix: referências ativas do mesmo regime acumulam só base elegível e saldo real',()=>{
 const r=parcial('segunda',.5,.5),a={id:'primeira-aprovada',tipo:'aprovacao',revisao:1,de:'2026-11-01',ate:'2026-11-15',apuracao:{config:{modo:'efetivo'},linhas:[{osId:'os1',baseElegivelCentavos:50,comissaoCentavos:1}]}};
 assert.equal(C.apurar(fonte([r]),entrada([r]),{aprovacoes:[a]}).totalCentavos,0);
 const compensada={...a,id:'compensacao',revisao:2,apuracao:{...a.apuracao,linhas:[]}};
 assert.equal(C.apurar(fonte([r]),entrada([r]),{aprovacoes:[a,compensada]}).totalCentavos,1);
});

test('round2: compensação/redução anterior bloqueia CSV dependente até conciliação append-only',async()=>{
 for(const acao of ['compensar','reduzir']){
  let a=await ambiente();a.e.db.pcp_registros=a.e.db.pcp_registros.filter(r=>r.colecao!=='performance_fechamentos');
  a=fonteSelada(a,a.periodo,[parcial('A',.5,.5)]);
  const pa=await previa(a),aa=await aprovar(a,pa.revisao);assert.equal(aa.revisao.apuracao.totalCentavos,1);
  const b=fonteSelada(a,{de:'2026-12-01',ate:'2026-12-31'},[parcial('B',.5,.5)]);
  const pb=await previa(b),ab=await aprovar(b,pb.revisao);assert.equal(ab.revisao.apuracao.totalCentavos,0);
  const original=structuredClone(b.e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===ab.revisao.id).registro);
  const alterado=acao==='reduzir'?fonteSelada(a,a.periodo,[parcial('A',.5,.1)],2):a;
  const pc=await previa(alterado,{anterior:aa.revisao.id,requestId:'alterar-anterior-12345',...(acao==='compensar'?{compensarId:aa.revisao.id}:{})});
  const ac=await aprovar(alterado,pc.revisao,{requestId:'aprovar-alteracao-12345'});assert.equal(ac.ok,true,JSON.stringify(ac));
  const exp=()=>b.e.call({action:'performanceComissaoExportar',...b.periodo,id:ab.revisao.id},who);
  assert.equal((await exp()).status,409,'B com centavos desatualizados precisa conciliação');
  const pn=await previa(b,{anterior:ab.revisao.id,requestId:'conciliar-dependente-12345'});
  assert.equal(pn.revisao.apuracao.aprovavel,true,JSON.stringify(pn));assert.equal(pn.revisao.apuracao.totalCentavos,1);
  assert.equal(pn.revisao.apuracao.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),1);
  assert.equal((await exp()).status,409);
  const an=await aprovar(b,pn.revisao,{requestId:'aprovar-dependente-12345'});assert.equal(an.ok,true,JSON.stringify(an));
  assert.equal((await b.e.call({action:'performanceComissaoExportar',...b.periodo,id:an.revisao.id},who)).status,200);
  assert.equal((await a.e.call({action:'performanceComissaoExportar',...a.periodo,id:ac.revisao.id},who)).status,200,'conciliar B não invalida A');
  assert.deepEqual(b.e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===original.id).registro,original);
 }
});

test('round2: cadeia exige conciliar anteriores e usa ordem estável, não ordem de aprovação',async()=>{
 let a=await ambiente();a.e.db.pcp_registros=a.e.db.pcp_registros.filter(r=>r.colecao!=='performance_fechamentos');
 a=fonteSelada(a,a.periodo,[parcial('A',.3,.5)]);
 const b=fonteSelada(a,{de:'2026-12-01',ate:'2026-12-31'},[parcial('B',.3,.5)]);
 const c=fonteSelada(a,{de:'2027-01-01',ate:'2027-01-31'},[parcial('C',.3,.5)]);
 const pa=await previa(a),aa=await aprovar(a,pa.revisao),pb=await previa(b),ab=await aprovar(b,pb.revisao),pc=await previa(c),ac=await aprovar(c,pc.revisao);
 assert.deepEqual([aa,ab,ac].map(x=>x.revisao.apuracao.totalCentavos),[1,0,1]);
 const comp=await previa(a,{anterior:aa.revisao.id,compensarId:aa.revisao.id,requestId:'compensar-cadeia-12345'});
 assert.equal((await aprovar(a,comp.revisao,{requestId:'aprovar-cadeia-12345'})).ok,true);
 const cp=await previa(c,{anterior:ac.revisao.id,requestId:'revisar-terceiro-12345'});
 assert.equal(cp.revisao.apuracao.aprovavel,false);assert.match(cp.revisao.apuracao.pendencias.join(' '),/Concilie primeiro.*2026-12/);
 assert.equal((await aprovar(c,cp.revisao,{requestId:'nao-pular-cadeia-12345'})).status,422);
 assert.equal((await c.e.call({action:'performanceComissaoExportar',...c.periodo,id:ac.revisao.id},who)).status,409);
 const bp=await previa(b,{anterior:ab.revisao.id,requestId:'revisar-segundo-12345'}),ba=await aprovar(b,bp.revisao,{requestId:'aprovar-segundo-12345'});assert.equal(ba.ok,true);
 const cp2=await previa(c,{anterior:cp.revisao.id,requestId:'revisar-terceiro-novo-12345'}),ca=await aprovar(c,cp2.revisao,{requestId:'aprovar-terceiro-12345'});assert.equal(ca.ok,true);
 assert.equal(ca.revisao.apuracao.ajustes.reduce((s,p)=>s+p.diferencaCentavos,0),-1);
 assert.equal((await c.e.call({action:'performanceComissaoExportar',...c.periodo,id:ca.revisao.id},who)).status,200);
 // Mesmo dia: ID da entrega desempata; revisões/id da aprovação não mudam a ordem.
 const rs=[parcial('Z',.2,.5),parcial('Y',.2,.5)];
 const f=fonte(rs),en=entrada(rs);
 assert.deepEqual(C.apurar(f,en).linhas.map(l=>[l.id,l.comissaoCentavos]),[['Y',1],['Z',0]]);
 assert.deepEqual(C.apurar({...f,registros:rs.slice().reverse()},en).linhas.map(l=>[l.id,l.comissaoCentavos]),[['Y',1],['Z',0]]);
 const posterior={...ab.revisao,apuracao:{...ab.revisao.apuracao,linhas:[{osId:'os1',baseElegivelCentavos:50,comissaoCentavos:1}]}};
 assert.equal(C.apurar(a.f,entrada(a.f.registros),{aprovacoes:[posterior]}).totalCentavos,1,'aprovação posterior não consome centavo do período anterior');
});
