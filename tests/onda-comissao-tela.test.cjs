'use strict';
/* ONDA COMISSÃO (fila única de 11/10/2026), na TELA: performance.js,
   comissao.js e comissao-ui.js em vm, com o selo e os dados atuais do
   servidor. Cada teste começa pelo caso ruim. Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const plano=v=>JSON.parse(JSON.stringify(v));

function tela({papel='pcp',periodo=NOV,hoje='2026-12-11',api=null,os=[],equipes=[]}={}){
  const chamadas=[],toasts=[];
  const c={console,setTimeout,clearTimeout,chamadas,toasts,
    STORE:{getCFG:()=>({performancePCP:{equipes,participacoes:[]}}),getAllOS:()=>os,getQueue:()=>[],getOS:id=>os.find(o=>o.id===id)||null,uuid:()=>'req-ficticio-0001',
      api:async corpo=>{chamadas.push(corpo);return api?api(corpo):{};}},
    STATE:{user:{papel},_fPerf:{...periodo}},periodoOuMes:()=>({...c.STATE._fPerf}),classificarEntregas:xs=>({instalacoes:xs,aLancar:[]}),
    diaEntrega:()=>'2026-11-05',nomeExibicaoCasa:n=>({chave:n,nome:'Pessoa '+n}),pessoasRH:()=>[],avatarRH:()=>'',esc,
    dinheiroCasa:n=>'R$ '+Number(n).toFixed(2),filtroPeriodoHTML:()=>'',normCasa:s=>String(s||'').toLowerCase(),
    renderPerformanceCasa:()=>{},toast:(m,t)=>toasts.push([m,t||'']),perfCasaTemAbaConferencia:()=>true};
  vm.createContext(c);
  for(const f of ['operacao.js','divisao.js','comissao.js','performance.js','comissao-ui.js'])vm.runInContext(ler(f),c,{filename:f});
  c.perfHojeISO=()=>hoje;
  c.run=code=>vm.runInContext(code,c);
  return c;
}
const pessoa=(id,pct=100)=>({chave:id,nome:'Pessoa '+id,percentual:pct});
const reg=(id,valor,extra={})=>({id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),cliente:'Cliente fictício',dia:'2026-11-10',valor,membros:[pessoa('900001')],confirmado:true,fonte:'alocacao',equipeId:'',retornoConf:null,voltou:false,...extra});
const fonte=(registros,extra={})=>({periodo:{...NOV},regra:'performance-3',regraNota:'nota-valor-1',registros,hash:'hash-ficticio',consultadoEm:'2026-12-02T10:00:00Z',completo:true,fonte:'teste',...extra});
const selo=(revisao,registros,extra={})=>({...fonte(registros),id:'2026-11-01:2026-11-30:'+String(revisao).padStart(6,'0'),de:NOV.de,ate:NOV.ate,revisao,fechadoEm:'2026-12-0'+revisao+'T12:00:00Z',fechadoPor:'Gestor fictício',motivo:'Fechamento fictício',hash:'selo-'+revisao,...extra});
function comBase(c,dados,fechamentos,selecionado){
  c.__f=dados;c.__h=fechamentos;c.__s=selecionado;
  c.run('perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__s;perfRemoto.tentado=true;perfFechados.tentado=true;');
  return c;
}

/* ------------------------------------------------------------------ item 1 */
test('item 1 na tela: o aviso do mês fechado diz se a mudança trava a comissão ou não, pela régua da porta',()=>{
  const s=selo(1,[reg('a1',100),reg('a2',200,{retrabalho:true,etapaOrigem:''})],{regraPerdas:'perdas-1'});
  // Fora do dinheiro: o cliente renomeado e a volta conferida.
  let c=comBase(tela(),fonte([reg('a1',100,{cliente:'Outro cliente fictício',retornoConf:{carroLimpo:'sim'}}),reg('a2',200,{retrabalho:true,etapaOrigem:''})],{regraPerdas:'perdas-1'}),[s],s.id);
  let html=c.run('perfAvisoFechadoHTML(perfFonteAtual(),true)');
  assert.match(html,/Há 1 mudança nas entregas depois do fechamento/);
  assert.match(html,/Nenhuma delas muda a comissão: Aprovar e Exportar continuam valendo\./);
  // Dinheiro: o líquido mudou; e a origem a definir foi definida depois (pendência).
  c=comBase(tela(),fonte([reg('a1',150),reg('a2',200,{retrabalho:true,etapaOrigem:'Produção'})],{regraPerdas:'perdas-1'}),[s],s.id);
  html=c.run('perfAvisoFechadoHTML(perfFonteAtual(),true)');
  assert.match(html,/Na comissão: 1 mudança muda o dinheiro \(O\.S\. 90001: valor líquido\)\. Aprovar e Exportar a comissão deste mês ficam travados/);
  assert.match(html,/A O\.S\. 90002 tinha a origem do retrabalho a definir no fechamento e mudou depois: no demonstrativo ela fica pendente \(não paga e não perde\)/);
});

/* ------------------------------------------------------------------ item 4 */
const revisaoTela=(extra={})=>({id:'2026-11-01:2026-11-30:000001',revisao:1,tipo:'previa',em:'2026-12-03T12:00:00Z',motivo:'Prévia fictícia',autor:{login:'gestor',nome:'Gestor fictício'},
  apuracao:{config:{modo:'efetivo'},totalCentavos:1000,pendencias:[],linhas:[],ajustes:[],reconhecimento:{situacao:'pendente',aviso:'Aviso fictício',criterios:{},equipes:[]}},...extra});
test('item 4 na tela: o demonstrativo diz quem fez a prévia e quem aprovou pelo ID; o registro antigo sem o ID mostra só o nome',()=>{
  const c=tela();
  c.__r=revisaoTela();
  assert.match(c.run('comissaoResumoHTML(__r,[__r])'),/<p>Prévia de Gestor fictício · /);
  c.__r=revisaoTela({tipo:'aprovacao',autor:{login:'gestor',nome:'Gestor fictício',porId:'044455'}});
  assert.match(c.run('comissaoResumoHTML(__r,[__r])'),/<p>Aprovada por Gestor fictício \(cadastro 044455\) · /);
  // O selo do mês com o ID de quem fechou.
  const s=selo(1,[reg('a1',100)],{fechadoPorId:'044455'});
  comBase(c,fonte([reg('a1',100)]),[s],s.id);
  assert.match(c.run('perfFonteTexto()'),/Fechamento preservado · revisão 1 · Gestor fictício \(cadastro 044455\) · /);
});

/* ------------------------------------------------------------------ item 5 */
test('item 5 na tela: o demonstrativo diz quando e por quem foi exportado, e a diferença contra a última exportada',()=>{
  const c=tela();
  const ap=revisaoTela({id:'r3',revisao:3,tipo:'aprovacao',apuracao:{...revisaoTela().apuracao,anteriorAprovacao:'r1'}});
  c.__r=ap;c.__x=[];
  let html=c.run('comissaoResumoHTML(__r,[__r],__x)');
  assert.match(html,/A aprovação anterior deste período nunca foi exportada/);
  assert.match(html,/Esta aprovação ainda não foi exportada\./);
  c.__x=[{id:'e1',revisaoId:'r3',em:'2026-12-04T12:00:00Z',csvSha256:'a'.repeat(64),autor:{nome:'Gestor fictício',porId:'044455'}}];
  html=c.run('comissaoResumoHTML(__r,[__r],__x)');
  assert.match(html,/Já exportada 1 vez:.*Gestor fictício \(cadastro 044455\) · impressão digital do CSV aaaaaaaaaaaa…/s);
  c.__ev={em:'2026-12-04T12:00:00Z',csvSha256:'b'.repeat(64),autor:{nome:'Gestor fictício',porId:'044455'},anterior:{revisao:2,em:'2026-12-03T12:00:00Z'},anteriorNaoExportada:false,
    diferencas:[{pessoaId:'012345',nome:'Pessoa fictícia',tipo:'externa',anteriorCentavos:100,centavos:150,diferencaCentavos:50},{pessoaId:'100002',nome:'Outra',tipo:'externa',anteriorCentavos:10,centavos:10,diferencaCentavos:0}]};
  html=c.run('comissaoDiferencasHTML(__ev)');
  assert.match(html,/Diferença por pessoa contra a última exportada \(revisão 2,/);
  assert.match(html,/Pessoa fictícia \(cadastro 012345\) · Equipe externa · R\$ 1\.00 → R\$ 1\.50 · diferença R\$ 0\.50/);
  assert.doesNotMatch(html,/Outra/,'sem diferença, a pessoa não aparece');
  // Outubro em teste: nada convida a exportar.
  c.__r=revisaoTela({tipo:'aprovacao',apuracao:{...revisaoTela().apuracao,config:{modo:'teste'}}});c.__x=[];
  assert.doesNotMatch(c.run('comissaoResumoHTML(__r,[__r],__x)'),/ainda não foi exportada/);
});

/* ------------------------------------------------------------------ item 6 */
test('item 6 na tela: o PDF oficial do mês fechado só sai com o documento registrado, com o número e a impressão digital',async()=>{
  const impressos=[];
  const s=selo(1,[reg('a1',100)],{fechadoPorId:'044455',hash:'f'.repeat(64)});
  let resposta={ok:true,documento:{id:'DOC-2026-000007',fechamentoId:s.id,fechamentoHash:'f'.repeat(64),emitidoEm:'2026-12-05T12:00:00Z',emitidoPor:{nome:'Gestor fictício',porId:'044455'},emitidosAntes:1}};
  const c=comBase(tela({api:()=>{if(resposta instanceof Error)throw resposta;return resposta;}}),fonte([reg('a1',100)]),[s],s.id);
  c.document={createElement:()=>({innerHTML:'',append(){},insertAdjacentHTML(_,h){this.innerHTML+=h;}})};
  c.imprimirAnalisePCP=(titulo,el,periodo,fonte)=>impressos.push({titulo,html:el.innerHTML,periodo,fonte});
  c.performanceConferenciaHTML=()=>'<p>Conferência fictícia</p>';
  await c.run('perfPdfOficial({querySelector:()=>null})');
  assert.equal(c.chamadas.at(-1).action,'performanceDocumento');assert.equal(c.chamadas.at(-1).fechamentoId,s.id);
  assert.equal(impressos.length,1);
  assert.match(impressos[0].titulo,/^Fechamento oficial · novembro de 2026 · documento DOC-2026-000007$/);
  assert.match(impressos[0].html,/Documento oficial nº DOC-2026-000007/);
  assert.match(impressos[0].html,new RegExp('f'.repeat(64)));
  assert.match(impressos[0].html,/Fechado por<\/dt><dd>Gestor fictício \(cadastro 044455\)/);
  assert.match(impressos[0].html,/já teve 1 documento emitido antes deste/);
  // Sem conexão: não há PDF oficial, e a tela diz por quê.
  resposta=new TypeError('Failed to fetch');
  await c.run('perfPdfOficial({querySelector:()=>null})');
  assert.equal(impressos.length,1);
  assert.match(c.toasts.at(-1)[0],/O PDF oficial precisa de conexão/);
  // O botão só aparece na revisão fechada.
  assert.match(c.run('perfFonteHTML()'),/id="perf-pdf-oficial"/);
  c.run("perfRemoto.selecionado=''");
  assert.doesNotMatch(c.run('perfFonteHTML()'),/id="perf-pdf-oficial"/);
});
test('item 6 na tela: o PDF do demonstrativo da comissão diz a revisão, a impressão digital e se é prévia ou teste',async()=>{
  const impressos=[];
  const c=tela({api:()=>({ok:true,documento:{id:'DOC-2026-000008',fechamentoId:'f1',fechamentoRevisao:1,fechamentoHash:'f'.repeat(64),revisaoHash:'r'.repeat(64),emitidoEm:'2026-12-05T12:00:00Z',emitidoPor:{nome:'Gestor fictício',porId:'044455'},emitidosAntes:0}})});
  c.document={createElement:()=>({innerHTML:''})};c.crypto={randomUUID:()=>'req-ficticio-0002'};
  c.imprimirAnalisePCP=(titulo,el)=>impressos.push({titulo,html:el.innerHTML});
  c.__r=revisaoTela({fechamentoId:'f1',hash:'r'.repeat(64),apuracao:{...revisaoTela().apuracao,config:{modo:'teste'}}});
  await c.run('comissaoPdf(__r,[__r],[],{de:"2026-11-01",ate:"2026-11-30"})');
  assert.equal(c.chamadas.at(-1).tipo,'comissao');assert.equal(c.chamadas.at(-1).revisaoId,c.__r.id);
  assert.match(impressos[0].html,/Revisão 1 · prévia, não aprovada · teste, sem exportação para pagamento/);
  assert.match(impressos[0].html,new RegExp('r'.repeat(64)));
  assert.match(impressos[0].html,/Comissão apurada/,'o demonstrativo vem junto');
});

/* ------------------------------------------------------------------ item 7 */
test('item 7 na tela: a fita diz o que falta em cada mês e nunca empurra outubro, que é teste',()=>{
  const c=tela({papel:'pcp'});
  c.podeEditar=()=>true;
  const mes=(m,estado,extra={})=>({mes:m,de:m+'-01',ate:m+'-28',estado,teste:m==='2026-10',fechamento:{revisao:1},comissao:{modo:'efetivo'},enviado:{vezes:1},...extra});
  c.__l=[mes('2026-10','aberto'),mes('2026-11','fechado'),mes('2026-12','aprovado'),mes('2027-01','enviado'),mes('2027-02','em_andamento')];
  c.run('perfMeses={tentado:true,carregando:false,lista:__l,erro:""}');
  const html=c.run('perfFitaMesesHTML()');
  assert.match(html,/<b>out\/26<\/b> <span>Mês de teste, sem fechamento<\/span>/);
  assert.match(html,/<b>nov\/26<\/b> <span>Fechado \(revisão 1\): falta aprovar a comissão<\/span>/);
  assert.match(html,/<b>dez\/26<\/b> <span>Aprovado: falta exportar<\/span>/);
  assert.match(html,/<b>jan\/27<\/b> <span>Enviado: exportado 1 vez<\/span>/);
  assert.match(html,/data-perf-abrir-mes="2026-11"/);
  for(const estado of ['aberto','fechado','aprovado','enviado','em_andamento'])
    assert.doesNotMatch(c.run(`perfFitaEstadoTxt(${JSON.stringify(mes('2026-10',estado,{comissao:{modo:'teste'}}))})`),/falta/,'outubro: '+estado);
  // Quem não é gestão não vê a fita.
  const m=tela({papel:'montagem'});m.run('perfMeses={tentado:true,carregando:false,lista:[],erro:""}');
  assert.equal(m.run('perfFitaMesesHTML()'),'');
});

/* ------------------------------------------------------------------ item 8 */
test('item 8 na tela: o mês fechado com retrato mostra a logo, a cor e o animal da época; o selo antigo segue como era',()=>{
  const LOGO='data:image/png;base64,QUJDRA==', LOGO_NOVA='data:image/png;base64,WFlaVw==';
  const hoje=[{id:'q1',nome:'Nome de hoje',emblema:'🦁',animal:'leao',cor:'verde',logo:LOGO_NOVA,membros:[]}];
  const r=reg('a1',100,{equipeId:'q1',equipeNome:'Nome da época',emblema:'🦅'});
  const comRetrato=selo(1,[r],{retrato:{equipes:[{id:'q1',nome:'Nome da época',emblema:'🦅',animal:'aguia',cor:'azul',logoSha:'sha-ficticio'}],pessoas:[{id:'900001',nome:'Pessoa 900001',apelido:'Apelido fictício',freelancer:true}]}});
  const c=comBase(tela({equipes:hoje}),fonte([r]),[comRetrato],comRetrato.id);
  c.run("perfRemoto.logos={'sha-ficticio':"+JSON.stringify(LOGO)+"}");
  const [x]=c.run('PERF.comEquipes(perfFonteAtual().registros,'+JSON.stringify(hoje)+',perfOpcoesEquipe())');
  assert.deepEqual([x.equipeNome,x.logo,x.cor,x.animal],['Nome da época',LOGO,'azul','aguia']);
  const html=c.run('perfRetratoHTML(perfFonteAtual())');
  assert.match(html,/Nome da época · Águia · cor azul/);assert.match(html,/Pessoa 900001 \(Apelido fictício\) · cadastro 900001 · Freelancer/);
  // O selo de antes do retrato: só a logo de hoje, sem cor nem animal (como era).
  const antigo=selo(1,[r]);
  const d=comBase(tela({equipes:hoje}),fonte([r]),[antigo],antigo.id);
  const [y]=d.run('PERF.comEquipes(perfFonteAtual().registros,'+JSON.stringify(hoje)+',perfOpcoesEquipe())');
  assert.deepEqual([y.logo,y.cor||'',y.animal||''],[LOGO_NOVA,'','']);
});

/* ------------------------------------------------------------------ item 9 */
test('item 9 na tela: a pendência do líquido mudado aparece no demonstrativo, separada das que travam',()=>{
  const c=tela();
  c.__r=revisaoTela({apuracao:{...revisaoTela().apuracao,avisos:['O.S. 90001 · O líquido mudou desde a aprovação de 01/11/2026 a 30/11/2026 (R$ 1000,00 na aprovação, R$ 1200,00 agora).']}});
  const html=c.run('comissaoResumoHTML(__r,[__r],[])');
  assert.match(html,/Pendências de ajuste \(não travam a aprovação\):.*O líquido mudou desde a aprovação de 01\/11\/2026/s);
  c.__r=revisaoTela();
  assert.doesNotMatch(c.run('comissaoResumoHTML(__r,[__r],[])'),/Pendências de ajuste/);
});
