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
