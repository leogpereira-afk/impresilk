const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../performance-dashboards.js');
const P=require('../performance.js');
const opts={perf:P,periodo:{de:'2026-10-01',ate:'2026-10-07'},verValores:true};
const membro=(chave='100001',nome='Ana',percentual=100)=>({chave,nome,percentual});
const r=(id,extra={})=>({id,dia:'2026-10-01',valor:100,confirmado:true,membros:[membro()],equipeId:'a',equipeNome:'Águia',numero:id,...extra});
const montar=(rs,extra={})=>D.montar(rs,{...opts,...extra});
test('painéis usam a régua atual de produção parcial, sem contar duas entregas como duas O.S.',()=>{
 const m=montar([r('p1',{osId:'os1',entregaId:'p1',fracaoOS:.25,valor:25}),r('p2',{osId:'os1',entregaId:'p2',fracaoOS:.75,valor:75,dia:'2026-10-02'})]);
 assert.equal(m.total.entregas,2);assert.equal(m.total.os,1);assert.equal(m.total.equivalentes,1);assert.equal(m.total.valor,100);assert.equal(m.equipes[0].equivalentes,1);
 assert.equal(m.dias[0].equivalentes,.25);assert.equal(m.dias[1].equivalentes,.75);
});
test('rateio entre grupos conserva o total financeiro e proporcional',()=>{
 const m=montar([r('p1',{entregaId:'p1',fracaoOS:.5,valor:100.01,membros:[membro('100001','Ana',60),membro('100002','Bruno',40)],grupos:[{equipeId:'a',equipeNome:'Águia',cota:6000,membros:['100001']},{equipeId:'b',equipeNome:'Leão',cota:4000,membros:['100002']}]})]);
 assert.equal(m.equipes.reduce((n,e)=>n+Math.round(e.valor*100),0),10001);
 assert.equal(m.equipes.reduce((n,e)=>n+e.equivalentes,0),.5);assert.equal(m.total.valor,100.01);
 assert.equal(m.total.equivalentes,.5);
});
test('sugestão fica a conferir e não entra na produção ou valor confirmado',()=>{
 const m=montar([r('a'),r('b',{confirmado:false,valor:9900,equipeId:'b',equipeNome:'Leão'})]);
 assert.equal(m.total.cobertura,50);assert.equal(m.total.aConferir,1);assert.equal(m.total.equivalentes,1);assert.equal(m.total.valor,100);
 assert.equal(m.equipes.find(e=>e.chave==='b').posicao,null);assert.equal(m.equipes.find(e=>e.chave==='b').valor,null);
});
test('confirmação inconsistente não entra como confirmada e mantém denominador total',()=>{
 const m=montar([r('a'),r('b',{membros:[]}),r('c',{membros:[membro('100002','Bruno',50)]})]);
 assert.equal(m.total.confirmadas,1);assert.equal(m.total.aConferir,2);assert.equal(m.total.semEquipe,1);assert.equal(m.total.inconsistentes,1);assert.equal(m.total.cobertura,33);
 assert.equal(m.total.valor,100);
});
test('ausência, vazio, infinito e valor negativo não se transformam em zero confirmado',()=>{
 for(const valor of [null,undefined,'',Infinity,NaN,-1]){
  const m=montar([r('a',{valor})]);assert.equal(m.total.valor,null);assert.equal(m.total.semValor,1);assert.equal(m.equipes[0].valor,null);assert.equal(m.dias[0].valor,null);
 }
 const z=montar([r('a',{valor:0})]);assert.equal(z.total.valor,0);assert.equal(z.total.comValor,1);assert.equal(z.total.semValor,0);
});
test('valor parcial identificado mantém cobertura e soma de centavos',()=>{
 const m=montar([r('a',{valor:.1}),r('b',{valor:.2}),r('c',{valor:null})]);
 assert.equal(m.total.valor,.3);assert.equal(m.total.comValor,2);assert.equal(m.total.semValor,1);assert.equal(m.equipes[0].valor,.3);assert.equal(m.equipes[0].semValor,1);
 assert.match(D.html(m),/1 sem valor/);
});
test('parcial sem base não recebe uma O.S. inteira',()=>{
 for(const fracaoOS of [undefined,NaN,0]){
  const m=montar([r('p',{entregaId:'p',fracaoOS,valor:null})]);assert.equal(m.total.equivalentes,0);assert.equal(m.total.semBase,1);assert.equal(m.equipes[0].posicao,null);
  assert.ok(m.proximas.some(p=>p.tipo==='parcial'));
 }
});
test('empates recebem mesma posição e a seguinte respeita classificação de competição',()=>{
 const m=montar([r('a'),r('b',{equipeId:'b',equipeNome:'Leão'}),r('c',{equipeId:'c',equipeNome:'Tigre',entregaId:'c',fracaoOS:.5})]);
 assert.deepEqual(m.equipes.map(e=>e.posicao),[1,1,3]);
});
test('evolução inclui dias sem registro e mantém valor indisponível como null',()=>{
 const m=montar([r('a')]);assert.equal(m.dias.length,7);assert.equal(m.dias[1].semRegistro,true);assert.equal(m.dias[1].valor,null);assert.equal(m.dias[1].entregas,0);
 assert.match(D.html(m,{vista:'evolucao'}),/Sem registro/);assert.match(D.html(m,{vista:'evolucao'}),/não prova ausência de trabalho/);
});
test('agregação semanal cruza domingo e segunda sem deslocamento local',()=>{
 const m=montar([r('a',{dia:'2026-10-04'}),r('b',{dia:'2026-10-05'})]);
 assert.equal(m.semanas.length,2);assert.equal(m.semanas[0].de,'2026-10-01');assert.equal(m.semanas[0].ate,'2026-10-04');assert.equal(m.semanas[0].confirmadas,1);
 assert.equal(m.semanas[1].de,'2026-10-05');assert.equal(m.semanas[1].confirmadas,1);
});
test('data inválida não entra no gráfico e aparece como alerta sem sumir do resumo',()=>{
 const m=montar([r('a',{dia:'2026-02-30'})]);assert.equal(m.total.entregas,1);assert.equal(m.total.semData,1);assert.equal(m.dias.reduce((s,d)=>s+d.entregas,0),0);assert.ok(m.alertas.some(a=>/sem data/.test(a)));
 assert.equal(D.diaValido('2026-02-30'),'');assert.equal(D.diaValido('2026-10-01T10:10:10Z'),'2026-10-01');
});
test('filtro de período exclui registros externos e aceita callback da data da entrega',()=>{
 const m=montar([r('a',{dia:'2026-09-30'}),r('b',{dia:'2026-10-08'}),r('c',{dia:'2026-10-03'})]);
 assert.equal(m.total.entregas,1);assert.equal(m.foraPeriodo,2);
 const c=montar([r('d',{dia:'',os:{finalizadaEm:'2026-10-02'}})],{diaDe:r=>r.os.finalizadaEm});assert.equal(c.dias[1].entregas,1);
});
test('registro duplicado não infla valor, O.S. equivalente ou confirmadas',()=>{
 const item=r('a');const m=montar([item,item]);assert.equal(m.repetidos,1);assert.equal(m.total.entregas,1);assert.equal(m.total.equivalentes,1);assert.equal(m.total.valor,100);assert.match(m.alertas[0],/uma única vez/);
});
test('retrabalho conta O.S. distintas e qualidade usa apenas voltas conferidas no denominador',()=>{
 const conf={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'};
 const m=montar([r('p1',{osId:'os1',retrabalho:true,entregaId:'p1',fracaoOS:.5,voltou:true,volta:'v1',retornoConf:conf}),r('p2',{osId:'os1',retrabalho:true,entregaId:'p2',fracaoOS:.5,voltou:true,volta:'v1',retornoConf:conf}),r('b',{voltou:true,volta:'v2',retornoConf:null})]);
 assert.equal(m.qualidade.retrabalho,1);assert.equal(m.qualidade.voltas,2);assert.equal(m.qualidade.voltasConferidas,1);assert.equal(m.qualidade.voltasSemOcorrencia,1);assert.equal(m.qualidade.voltasPendentes,1);
 const html=D.html(m,{vista:'qualidade'});assert.match(html,/1 \/ 1 · 100%/);assert.match(html,/1 \/ 2 · 50%/);
});
test('checklist negativo é ocorrência e ausência não é ocorrência nem sucesso',()=>{
 const m=montar([r('a',{voltou:true,volta:'v',retornoConf:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim'}})]);
 assert.equal(m.qualidade.voltasComOcorrencia,1);assert.equal(m.qualidade.voltasSemOcorrencia,0);
 const vazio=montar([]);assert.equal(vazio.total.cobertura,null);assert.equal(vazio.total.valor,null);assert.match(D.html(vazio,{vista:'qualidade'}),/não se aplica/);
});
test('modelo sem permissão financeira não contém valores nem detalhes de origem de valor',()=>{
 const m=montar([r('a',{valor:123456.78,avisoValor:'R$ 123456.78 conflito'})],{verValores:false});
 assert.equal('valor' in m.total,false);assert.equal('valor' in m.equipes[0],false);assert.equal('valor' in m.dias[0],false);
 for(const v of D.VISTAS)assert.doesNotMatch(D.html(m,{vista:v.id}),/123456|R\$/);
 assert.equal(m.pendencias.some(p=>p.tipo==='valor-erp'),false);
});
test('HTML escapa texto, ids e fonte e usa ações existentes apenas quando permitido',()=>{
 const m=montar([r('x" onclick="alert(1)',{confirmado:false,equipeNome:'<img src=x onerror=alert(1)>',numero:'<script>'})]);
 const h=D.html(m,{vista:'qualidade',podeConferir:true,fonte:'<script>alert(2)</script>'});
 assert.doesNotMatch(h,/<script>|onclick="alert|<img/);assert.match(h,/&lt;script&gt;/);assert.match(h,/data-perf-audit-id/);
 assert.doesNotMatch(D.html(m,{vista:'qualidade',podeConferir:false}),/data-perf-audit-id/);
});
test('todos os painéis têm tabelas ou valores textuais e navegação acessível',()=>{
 const m=montar([r('a')]);for(const v of D.VISTAS){const h=D.html(m,{vista:v.id});assert.match(h,/aria-label="Visões do relatório"/);assert.equal((h.match(/aria-pressed="true"/g)||[]).length,v.id==='evolucao'?2:1);assert.match(h,/O.S./);}
 assert.match(D.html(m,{vista:'equipes'}),/<caption>Equipes/);assert.match(D.html(m,{vista:'evolucao'}),/Dados da evolução/);
});
test('modelo não altera registros, percentuais, nomes ou valores da fonte',()=>{
 const rs=[r('a',{membros:[membro()]})];const antes=JSON.stringify(rs);montar(rs);assert.equal(JSON.stringify(rs),antes);
});

test('integridade e conflito de origem viram próxima ação, sem mensagem falsa de ausência de pendências',()=>{
 const item=r('a',{erroConferencia:'Itens divergentes',avisoValor:'Duplicidade no ERP'});const m=montar([item,item]);
 assert.ok(m.proximas.some(p=>p.tipo==='integridade'));assert.ok(m.proximas.some(p=>p.tipo==='origem'));
 assert.doesNotMatch(D.html(m),/Nenhuma pendência nos critérios/);
});
