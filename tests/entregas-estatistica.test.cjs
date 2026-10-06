const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function tela(extra={}){const c=vm.createContext({console,Date,Set,Map,Number,Object,Intl,MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s),...extra});vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),c);return {run:s=>vm.runInContext(s,c),set:v=>c.fixture=v};}
const ponto=(mes,valor,extra={})=>({mes,valor,...extra});

test('previsão usa os três últimos meses fechados, não o mês parcial ou futuro',()=>{
 const t=tela();t.set([ponto('2025-01',10),ponto('2025-02',20),ponto('2025-03',30),ponto('2025-04',999,{parcial:true}),ponto('2025-05',888,{futuro:true})]);
 const a=t.run('relEntAnaliseSerie(fixture)');assert.equal(a.estatistica.media,20);assert.equal(a.estatistica.mediana,20);assert.equal(a.estatistica.min,10);assert.equal(a.estatistica.max,30);
 assert.deepEqual(Array.from(a.previsoes,p=>[p.mes,p.valor]),[['2025-04',20],['2025-05',20],['2025-06',20]]);
 assert.equal(a.tendencia.inclinacao,10);assert.equal(a.tendencia.r2,1);
});
test('lacuna ou cobertura incompleta no fim da base impede previsão sem fabricar zero',()=>{
 const t=tela();for(const extra of [{valor:null},{elegivel:false}]){t.set([ponto('2025-01',10),ponto('2025-02',20),ponto('2025-03',30,extra)]);assert.equal(t.run('relEntAnaliseSerie(fixture).previsoes.length'),0);}
 t.set([ponto('2025-01',10),ponto('2025-03',30),ponto('2025-04',40)]);assert.equal(t.run('relEntAnaliseSerie(fixture).previsoes.length'),0);
});
test('previsão de pontualidade pondera o volume de O.S., sem média simples das taxas',()=>{
 const t=tela();t.set([ponto('2025-01',100,{peso:1}),ponto('2025-02',0,{peso:3}),ponto('2025-03',0,{peso:6})]);
 const a=t.run('relEntAnaliseSerie(fixture,{ponderada:true,percentual:true})');assert.equal(a.estatistica.media,10);assert.equal(a.estatistica.mediana,0);assert.equal(a.previsoes[0].valor,10);assert.equal(a.estatistica.peso,10);
});
test('tendência respeita a distância entre meses, inclusive quando falta um mês',()=>{
 const t=tela();t.set([ponto('2025-01',10),ponto('2025-03',30),ponto('2025-04',40)]);const a=t.run('relEntAnaliseSerie(fixture)');assert.equal(a.tendencia.inclinacao,10);assert.equal(a.tendencia.r2,1);
});
test('valores constantes, nulos e base curta não geram NaN ou falsa previsão',()=>{
 const t=tela();t.set([ponto('2025-01',0),ponto('2025-02',0),ponto('2025-03',0)]);const a=t.run('relEntAnaliseSerie(fixture)');assert.equal(a.previsoes[0].valor,0);assert.equal(a.tendencia.r2,1);
 t.set([ponto('2025-01',null),ponto('2025-02',20)]);assert.equal(t.run('relEntAnaliseSerie(fixture).tendencia'),null);assert.equal(t.run('relEntAnaliseSerie(fixture).previsoes.length'),0);
});
test('período atravessa dezembro sem repetir meses e recorta também o gráfico financeiro',()=>{
 const t=tela();t.run("REL_ENT.intervalo={inicio:'2024-12',fim:'2025-02'};REL_ENT.dados={meses:[{mes:'2024-11',entregue:9999},{mes:'2024-12',entregue:10},{mes:'2025-01',entregue:20},{mes:'2025-02',entregue:30},{mes:'2025-03',entregue:8888}]}");
 assert.deepEqual(Array.from(t.run('relEntMesesGrafico()'),m=>m.mes),['2024-12','2025-01','2025-02']);const h=t.run("relEntGrafico(['entregue'],'Teste')");assert.doesNotMatch(h,/9999|8888/);assert.match(h,/dez\/24/);assert.match(h,/jan\/25/);
});
test('projeção e tendência podem ser exibidas separadamente sem virar entregas reais',()=>{
 const t=tela();t.run("REL_ENT.dados={ate:'2025-12-31',meses:[{mes:'2025-01',entregue:10},{mes:'2025-02',entregue:20},{mes:'2025-03',entregue:30}]}");
 const render=()=>t.run("relEntGrafico(['entregue'],'Teste')");assert.doesNotMatch(render(),/data-rel-estimativa|data-rel-tendencia/);
 t.run('REL_ENT.mostrarPrevisao=true');let h=render();assert.match(h,/data-rel-estimativa/);assert.doesNotMatch(h,/data-rel-tendencia/);assert.equal((h.match(/data-rel-ponto=/g)||[]).length,3);
 t.run('REL_ENT.mostrarPrevisao=false;REL_ENT.mostrarTendencia=true');h=render();assert.doesNotMatch(h,/data-rel-estimativa/);assert.match(h,/data-rel-tendencia/);
});
test('gráfico de pontualidade deixa lacunas sem datas e não trata falta de comparação como 0%',()=>{
 const t=tela();t.set([{mes:'2025-01',entregasCarregadas:true,entregas:[{data:'2025-01-10',previsao:'2025-01-10'}]},{mes:'2025-02',entregasCarregadas:true,entregas:[{data:'2025-02-10',previsao:''}]},{mes:'2025-03',entregasCarregadas:true,entregas:[{data:'2025-03-11',previsao:'2025-03-10'}]}]);
 t.run("REL_ENT.dados={ate:'2025-12-31',meses:fixture}");const h=t.run('relEntGraficoPontualidade()');assert.equal((h.match(/data-rel-prazo-ponto=/g)||[]).length,4);assert.doesNotMatch(h,/data-rel-prazo-ponto="2025-02"/);
});
test('intervalos inválidos não disparam consulta e são rejeitados explicitamente',()=>{
 const t=tela();assert.equal(t.run("relEntValidarIntervalo('2025-12','2025-01')").ok,false);assert.equal(t.run("relEntValidarIntervalo('2025-13','2025-14')").ok,false);assert.equal(t.run("relEntValidarIntervalo('2019-01','2025-01')").ok,false);assert.equal(t.run("relEntValidarIntervalo('2024-12','2025-02')").ok,true);
});
test('consulta entre anos reúne as fontes e o RH sem perder o ano das datas',async()=>{
 const t=tela({STATE:{_entAba:'relatorios'},OPERACAO:{dia:()=> '2026-10-06'},STORE:{api:async req=>req.action==='equipeHistorico'?{meses:req.meses.map(mes=>({mes,total:2})),areas:[]}:{meses:Array.from({length:12},(_,i)=>({mes:req.ano+'-'+String(i+1).padStart(2,'0'),entregue:req.ano})),ano:req.ano,de:req.ano+'-01-01',ate:req.ano+'-12-31',notas:{entregue:'ERP'}}}});
 t.run("renderRelatoriosEntregas=()=>{};REL_ENT.ano=2024;REL_ENT.intervalo={inicio:'2024-12',fim:'2025-02'};REL_ENT.foco=''");await t.run('relEntCarregar()');const ms=t.run('relEntMesesVisiveis()');assert.deepEqual(Array.from(ms,m=>m.mes),['2024-12','2025-01','2025-02']);assert.equal(ms[0].funcionarios,2);assert.equal(ms[2].entregue,2025);assert.equal(t.run('REL_ENT.dados.de'),'2024-12-01');assert.equal(t.run('REL_ENT.dados.ate'),'2025-02-28');
});

test('início no futuro é rejeitado, mas o eixo anual pode terminar em dezembro',()=>{
 const D=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T12:00:00Z']));}};
 const t=tela({Date:D});assert.equal(t.run("relEntValidarIntervalo('2026-11','2026-12')").ok,false);assert.equal(t.run("relEntValidarIntervalo('2026-01','2026-12')").ok,true);
});
test('atalhos indicam o período real sem chamar um intervalo entre anos de ano completo',()=>{
 const t=tela({OPERACAO:{dia:()=> '2026-10-06'}});t.run("REL_ENT.ano=2025;REL_ENT.foco='';REL_ENT.intervalo={inicio:'2025-10',fim:'2026-03'}");assert.doesNotMatch(t.run('relEntChipsHTML()'),/aria-pressed="true"/);
 t.run("REL_ENT.intervalo={inicio:'2025-09',fim:'2025-09'}");assert.match(t.run('relEntChipsHTML()'),/aria-label="set de 2025" aria-pressed="true"/);assert.equal(t.run('relEntPeriodoTxt()'),'set/25');
});
test('sem base suficiente, o título não promete estimativas e os meses entre anos ficam identificados',()=>{
 const t=tela();t.run("REL_ENT.mostrarPrevisao=true;REL_ENT.intervalo={inicio:'2024-12',fim:'2025-01'};REL_ENT.dados={ate:'2025-01-31',meses:[{mes:'2024-12',entregue:10},{mes:'2025-01',entregue:20}]}");
 const h=t.run("relEntGrafico(['entregue'],'Teste')");assert.doesNotMatch(h,/com estimativas para/);assert.match(h,/previsão indisponível neste recorte/);assert.equal(t.run("relEntMesTxt({mes:'2024-12'})"),'dez/24');
});

test('mês atual continua parcial ao ampliar um período passado pelos atalhos',()=>{
 const t=tela();t.run("REL_ENT.dados={de:'2026-07-01',ate:'2026-09-30',corteFonte:'2026-10-06'};REL_ENT.intervalo={inicio:'2026-01',fim:'2026-12'}");
 assert.equal(t.run("relEntParcial({mes:'2026-10'})"),true);
 t.run('relEntAtualizarCorte()');assert.equal(t.run('REL_ENT.dados.de'),'2026-01-01');assert.equal(t.run('REL_ENT.dados.ate'),'2026-10-06');
});
