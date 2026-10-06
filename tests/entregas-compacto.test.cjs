const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function tela(dia='2026-10-06'){
 const D=class extends Date{constructor(...a){super(...(a.length?a:[dia+'T12:00:00Z']));}};
 const c=vm.createContext({console,Date:D,Set,Map,Number,Object,Intl,MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],esc:s=>String(s),OPERACAO:{dia:()=>dia}});
 vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),c);return s=>vm.runInContext(s,c);
}
test('abertura mostra o mês corrente e seus valores parciais, inclusive em janeiro',()=>{
 for(const [dia,mes] of [['2026-10-06','2026-10'],['2027-01-02','2027-01']]){
  const run=tela(dia);run(`REL_ENT.dados={ate:'${dia}',corteFonte:'${dia}',meses:[{mes:'2026-09',entregue:111},{mes:'${mes}',entregue:222}]}`);
  assert.equal(run('relEntMesesVisiveis().length'),1);assert.equal(run('relEntMesesVisiveis()[0].entregue'),222);assert.match(run('relEntResumoHTML()'),/MÊS EM ANDAMENTO/);
 }
});
test('previsão e tendência marcam novembro e dezembro sem usar outubro parcial na base',()=>{
 const run=tela();run("var pontos=[{mes:'2026-07',valor:10},{mes:'2026-08',valor:20},{mes:'2026-09',valor:30},{mes:'2026-10',valor:999,parcial:true}]");
 const a=run("relEntAnaliseSerie(pontos,{referencia:'2026-10'})");assert.equal(a.estatistica.media,20);assert.deepEqual(Array.from(a.previsoes,p=>p.mes),['2026-11','2026-12']);
 assert.deepEqual(Array.from(a.tendencia.projecoes,p=>[p.mes,p.valor]),[['2026-11',50],['2026-12',60]]);
});
test('horizonte de dois meses atravessa dezembro sem usar o ano corrente como limite',()=>{
 const run=tela('2026-12-15');const a=run("relEntAnaliseSerie([{mes:'2026-09',valor:10},{mes:'2026-10',valor:20},{mes:'2026-11',valor:30},{mes:'2026-12',valor:1,parcial:true}],{referencia:'2026-12'})");
 assert.deepEqual(Array.from(a.previsoes,p=>p.mes),['2027-01','2027-02']);assert.equal(a.tendencia.projecoes[1].mes,'2027-02');
});
test('seleção de outubro mantém histórico útil, destaca dados atuais e não desenha meses reais futuros',()=>{
 const run=tela();run("REL_ENT.dados={ate:'2026-10-06',corteFonte:'2026-10-06',meses:['07','08','09','10','11','12'].map((m,i)=>({mes:'2026-'+m,entregue:10+i,futuro:i>3}))};REL_ENT.foco='10'");
 const h=run("relEntGrafico(['entregue'],'Produção')");assert.match(h,/data-rel-destaque="2026-10"/);assert.match(h,/data-rel-rotulo-mes="2026-10"/);assert.match(h,/data-rel-ponto="2026-07"/);assert.doesNotMatch(h,/data-rel-ponto="2026-11"/);
});
test('opções de análise de um quadro não ligam a análise do outro',()=>{
 const run=tela();run("REL_ENT.foco='';REL_ENT.dados={ate:'2026-09-30',meses:['07','08','09'].map((m,i)=>({mes:'2026-'+m,entregue:10+i,entregasCarregadas:true,entregas:[{data:'2026-'+m+'-10',previsao:'2026-'+m+'-10'}]}))};REL_ENT.analises={pontualidade:{previsao:true,tendencia:false},financeiro:{previsao:false,tendencia:true}}");
 const p=run('relEntGraficoPontualidade()'),f=run("relEntGrafico(['entregue'],'Produção')");assert.match(p,/data-rel-estimativa=/);assert.doesNotMatch(p,/data-rel-tendencia=/);assert.doesNotMatch(f,/data-rel-estimativa=/);assert.match(f,/data-rel-tendencia=/);
 assert.match(p,/data-rel-analise-quadro="pontualidade"/);assert.match(f,/data-rel-analise-quadro="financeiro"/);
});
test('quadro fechado continua fechado quando o relatório é redesenhado',()=>{
 const run=tela();run("REL_ENT.abertos['quadro-pontualidade']=false");let h=run('relEntPontualidadeHTML()');assert.match(h,/<details[^>]+data-rel-quadro="quadro-pontualidade"[^>]*><summary/);assert.doesNotMatch(h,/<details[^>]+data-rel-quadro="quadro-pontualidade"[^>]*\sopen[\s>]/);
 run("REL_ENT.abertos['quadro-pontualidade']=true");h=run('relEntPontualidadeHTML()');assert.match(h,/<details[^>]+data-rel-quadro="quadro-pontualidade"[^>]*\sopen[\s>]/);
});

test('atalho de outubro depois de um recorte passado recupera o corte atual e as O.S. do mês',()=>{
 const run=tela();run("REL_ENT.ano=2026;REL_ENT.intervalo={inicio:'2026-01',fim:'2026-02'};REL_ENT.dados={de:'2026-01-01',ate:'2026-02-28',corteFonte:'2026-10-06',meses:[{mes:'2026-02',entregue:1},{mes:'2026-10',entregue:2}]}" );
 run("relEntSelecionarMes('10')");assert.equal(run('REL_ENT.intervalo'),null);assert.equal(run('REL_ENT.dados.ate'),'2026-10-06');assert.equal(run('relEntMesesVisiveis()[0].entregue'),2);
});
