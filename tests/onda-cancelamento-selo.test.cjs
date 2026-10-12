'use strict';
/* O CANCELAMENTO DE ITEM GRAVADO DEPOIS DO FECHAMENTO, COM O DIA DENTRO DO
   MÊS FECHADO (baixa da verificação da onda operação, já na v170). O
   recálculo do mês fechado olhava só o dia declarado da marca: o
   cancelamento gravado em dezembro com o dia 20/11 mudava o recálculo de
   novembro, o hash do selo deixava de bater e o mês fechado se recalculava.
   Agora o recálculo de um selo olha também QUANDO a marca foi gravada (o
   carimbo `em` do servidor): o que foi gravado depois do fechamento não entra
   nele; entra numa revisão nova, se a gestão quiser.
   A porta descarta a marca nova por item desde a v172 (D-016): em produção o
   caso só volta se a marca for religada. A bancada a religa
   (ligarMarcasAntigas), como a v171 gravava, para provar o caso.
   O selo é feito pelo código da v173 tirado do git (mês fechado não se
   recalcula: o selo de antes do conserto recalcula igual). Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {edge,ligarMarcasAntigas}=require('./helpers/edge.cjs');
ligarMarcasAntigas();
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const RAIZ=path.join(__dirname,'..');
const V173='b7da13d';
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
const FICHAS=[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},
  {id:'g',colecao:'colaboradores',apagado:false,registro:{nome:'Gestor fictício',apelido:'gestor',cpf:'44455566677'}}];
const itens=()=>[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}];
const aloc=p=>D.montar([{equipeId:null,liderId:p,membros:[p]}]);
const cancelado=(id,dia,em)=>({id,tipo:'cancelado',dia,motivo:'Cliente desistiu do resto fictício',por:'Gestor fictício',porId:'444555',via:'pcp',em});
function osFixas(){
  const base=(id,numero,extra)=>({id,numero,rev:3,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],veiculo:'Carro fictício',itens:itens(),
    instalacao:{data:'2026-11-05',periodo:'Manhã',duracaoDias:1},prazoCombinado:{data:'2026-11-05',fonte:'agenda',dias:1,em:'2026-11-01T10:00:00.000Z'},...extra});
  const conf=(o,id,dia,q)=>{const cat=C.catalogo(o);return {id,dia,itens:cat.map((i,n)=>({chave:i.chave,identidade:i.identidade,qtde:q[n]||0})).filter(p=>p.qtde>0),alocacao:aloc('100001'),por:'Gestor fictício',porId:'444555',em:dia+'T20:00:00.000Z'};};
  // A: inteira, finalizada e lançada.
  const A=base('A','90901',{finalizadaEm:'2026-11-08T21:00:00.000Z',finalizadoPor:'Gestor fictício',entregaLancada:{data:'2026-11-08',em:'2026-11-08T21:00:00.000Z',por:'Gestor fictício'}});
  // Q: conferida em parte em novembro e aberta; o resto do item A dela vai ser cancelado em dezembro, com o dia em novembro.
  const Q=base('Q','90902',{});Q.conferenciasEntrega=[conf(Q,'e1','2026-11-06',[1,1])];
  // P: o resto do item A cancelado em 01/12 com o dia 28/11, ANTES do fechamento: entra no selo, como sempre.
  const P=base('P','90903',{});P.conferenciasEntrega=[conf(P,'e1','2026-11-06',[1,1])];
  P.itens[0]={...P.itens[0],entregas:[cancelado('mc-p','2026-11-28','2026-12-01T10:00:00.000Z')]};
  return [A,Q,P];
}
function banco(oss){
  return {pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-12-01T10:00:00.000Z',registro:o})),registros:FICHAS,
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:'A',membros:[{chave:'100001',nome:'Pessoa fictícia',percentual:100}],por:'Gestor fictício',em:'2026-11-06T00:00:00Z'}]}}}],
    painel_ordens:oss.map(o=>({numero:o.numero,valor:8500}))};
}
const entrada=regs=>({config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:r.membros[0].chave,partes:r.membros.map(m=>({pessoaId:m.chave,cota:Math.round(m.percentual*100)})),justificativa:'Equipe fictícia'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
const reg=(e,id)=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id===id).registro;
// O recálculo de um selo como a porta faz (Aprovar e Exportar): os parâmetros e as opções saem do PRÓPRIO selo.
const recalculo=(e,selo)=>{const s=JSON.stringify(selo);return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`);};
const situacao=(fonte,osId)=>fonte.registros.find(r=>r.osId===osId)?.estadoEntrega?.situacao;
function codigoV173(){
  const show=f=>execFileSync('git',['-C',RAIZ,'show',`${V173}:${f}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const lista=execFileSync('git',['-C',RAIZ,'ls-tree','--name-only',`${V173}`,'supabase/functions/_shared/'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').filter(Boolean);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-v173-'));
  fs.mkdirSync(path.join(dir,'fn'));fs.mkdirSync(path.join(dir,'shared'));
  fs.writeFileSync(path.join(dir,'fn','index.ts'),show('supabase/functions/pcp-sync/index.ts'));
  for(const f of lista)fs.writeFileSync(path.join(dir,'shared',path.basename(f)),show(f));
  return dir;
}

test('o cancelamento de item gravado depois do fechamento, com o dia no mês fechado, não muda o recálculo do selo da v173; entra só numa revisão nova', async t=>{
  let dir='';
  try{dir=codigoV173();}catch{dir='';}
  if(!dir){t.skip('sem o histórico do git (clone raso ou cópia por git archive)');return;}
  try{
    const tipo=path.relative(path.join(RAIZ,'supabase/functions'),path.join(dir,'fn'));
    const v173=await edge(tipo,banco(osFixas()),{shared:path.join(dir,'shared')});
    relogio(v173,'2026-12-02T12:00:00Z');
    const fonte=await v173.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.equal(fonte.registros.length,3,JSON.stringify(fonte).slice(0,300));
    assert.equal(situacao(fonte,'Q'),'parcial');
    assert.equal(situacao(fonte,'P'),'saldo_concluido','o cancelamento gravado antes do fechamento entra no selo');
    const f=await v173.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-v173-nov',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
    assert.equal(f.status,200,JSON.stringify(f));
    const selo=f.fechamento;
    const p=await v173.call({action:'performanceComissaoNova',...NOV,fechamentoId:selo.id,anterior:'',entrada:entrada(selo.registros),motivo:'Prévia fictícia',requestId:'previa-v173-nov'},gestor);
    assert.equal(p.ok,true,JSON.stringify(p));

    // O banco passa ao servidor do conserto (o que a publicação faz).
    const novo=await edge('pcp-sync',structuredClone(v173.db));
    relogio(novo,'2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'logo depois da publicação');

    // Em 08/12 a gestão cancela o resto do item A de Q com o dia 20/11 (dentro de novembro fechado).
    relogio(novo,'2026-12-08T12:00:00Z');
    const q0=structuredClone(reg(novo,'Q'));
    const r=await novo.call({action:'upsert',os:{...q0,itens:[{...q0.itens[0],entregas:[{id:'mc-q',tipo:'cancelado',dia:'2026-11-20',motivo:'Cliente desistiu do resto fictício'}]},q0.itens[1]]}},gestor);
    assert.equal(r.status,200,'nunca 422 na fila: '+JSON.stringify(r));
    const marca=reg(novo,'Q').itens[0].entregas?.[0];
    assert.equal(marca?.tipo,'cancelado','a bancada grava a marca como a v171 gravava');
    assert.equal(marca.dia,'2026-11-20');
    assert.ok(marca.em>'2026-12-08','o carimbo é o relógio do servidor');

    // Mês fechado não se recalcula: o recálculo do selo da v173 continua igual.
    const rc=await recalculo(novo,selo);
    assert.equal(situacao(rc,'Q'),'parcial','no recálculo de novembro, Q fica como estava no fechamento');
    assert.equal(rc.hash,selo.hash,'o cancelamento gravado depois do fechamento mudava o hash do selo');

    // A apuração atual (os dados de agora) já vê o cancelamento e diz que ele veio depois do fechamento.
    const atual=await novo.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.equal(situacao(atual,'Q'),'saldo_concluido','o item cancelado sai do saldo');
    assert.equal(situacao(atual,'P'),'saldo_concluido');
    const dep=atual.depoisDoFechamento;
    assert.ok(dep,'a apuração atual diz o que mudou depois do fechamento');
    assert.equal(dep.fechamentoId,selo.id);
    assert.deepEqual(dep.entregas.map(x=>[x.osId,x.numero,x.marcas.map(m=>[m.tipo,m.dia])]),[['Q','90902',[['cancelado','2026-11-20']]]]);
    assert.equal(dep.registros.length,1,'a entrega como no fechamento, para a tela comparar como a porta');
    assert.equal(dep.registros[0].estadoEntrega.situacao,'parcial');
    assert.equal(dep.hashIgual,true);

    // Aprovar e Exportar a prévia do selo da v173 continuam valendo.
    const ap=await novo.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,confirmacao:true,motivo:'Aprovação fictícia',requestId:'aprovar-v173-nov'},gestor);
    assert.equal(ap.ok,true,'Aprovar: '+JSON.stringify(ap));
    assert.equal(ap.revisao.fonteConferida?.foraDoDinheiro||0,0,'nada mudou no recálculo, nem fora do dinheiro');
    const ex=await novo.call({action:'performanceComissaoExportar',...NOV,id:ap.revisao.id},gestor);
    assert.equal(ex.ok,true,'Exportar: '+JSON.stringify(ex).slice(0,300));

    // A revisão nova, se a gestão quiser, leva o cancelamento; e o recálculo dela também confere.
    relogio(novo,'2026-12-10T12:00:00Z');
    const f2fonte=await novo.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    const f2=await novo.call({action:'performanceFechar',...NOV,hash:f2fonte.hash,anterior:selo.id,requestId:'fechar-nov-rev2',motivo:'Revisão fictícia com o cancelamento',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
    assert.equal(f2.status,200,JSON.stringify(f2).slice(0,300));
    assert.equal(situacao(f2.fechamento,'Q'),'saldo_concluido');
    relogio(novo,'2026-12-11T12:00:00Z');
    assert.equal((await recalculo(novo,f2.fechamento)).hash,f2.fechamento.hash,'o recálculo da revisão 2');
    const depois2=await novo.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.equal(depois2.depoisDoFechamento,undefined,'nada foi gravado depois da revisão 2');
    // O selo antigo (revisão 1) continua recalculando igual.
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'a revisão 1');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('a régua "como estava" nas duas cópias: a marca gravada depois do corte sai; sem carimbo ou sem corte, fica como antes', ()=>{
  const S=require('../conferencia-entrega.js');
  const o={id:'X',itens:[{uid:'a',qtde:'4',entregas:[cancelado('m1','2026-11-20','2026-12-08T12:00:00.000Z'),cancelado('m2','2026-11-21','2026-12-01T12:00:00.000Z'),{id:'m3',tipo:'cancelado',dia:'2026-11-22',motivo:'Marca antiga fictícia sem carimbo'}]}]};
  const ids=x=>x.itens[0].entregas.map(m=>m.id);
  assert.deepEqual(ids(S.noFimDoDia(o,'2026-11-30')),['m1','m2','m3'],'sem corte: só o dia, como antes');
  assert.deepEqual(ids(S.noFimDoDia(o,'2026-11-30',{gravadoAte:'2026-12-02T12:00:00.000Z'})),['m2','m3'],'gravada depois do corte sai; sem carimbo fica');
  assert.deepEqual(ids(S.noFimDoDia(o,'2026-11-30',{gravadoAte:'corte inválido'})),['m1','m2','m3'],'corte inválido: como antes');
  assert.deepEqual(S.gravadasDepois(o,'2026-11-30','2026-12-02T12:00:00.000Z').map(m=>[m.id,m.uid,m.tipo,m.dia]),[['m1','a','cancelado','2026-11-20']]);
  assert.deepEqual(S.gravadasDepois(o,'2026-11-19','2026-12-02T12:00:00.000Z'),[],'o dia fora do período não é do mês fechado');
});

/* ------------------------------------------------------------------ a tela (M8) */
const vm=require('node:vm');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
function tela(){
  const c={console,setTimeout,clearTimeout,
    STORE:{getCFG:()=>({performancePCP:{equipes:[],participacoes:[]}}),getAllOS:()=>[],getQueue:()=>[],getOS:()=>null,uuid:()=>'req-ficticio-0001',api:async()=>({})},
    STATE:{user:{papel:'pcp'},_fPerf:{...NOV}},periodoOuMes:()=>({...c.STATE._fPerf}),classificarEntregas:xs=>({instalacoes:xs,aLancar:[]}),
    diaEntrega:()=>'2026-11-06',nomeExibicaoCasa:n=>({chave:n,nome:'Pessoa '+n}),pessoasRH:()=>[],avatarRH:()=>'',esc,
    dinheiroCasa:n=>'R$ '+Number(n).toFixed(2),filtroPeriodoHTML:()=>'',normCasa:s=>String(s||'').toLowerCase(),
    renderPerformanceCasa:()=>{},toast:()=>{},perfCasaTemAbaConferencia:()=>true};
  vm.createContext(c);
  for(const f of ['operacao.js','divisao.js','comissao.js','performance.js','comissao-ui.js'])vm.runInContext(ler(f),c,{filename:f});
  c.perfHojeISO=()=>'2026-12-11';
  c.run=code=>vm.runInContext(code,c);
  return c;
}
const pessoaT=id=>({chave:id,nome:'Pessoa '+id,percentual:100});
const regT=(id,osId,valor,extra={})=>({id,osId,entregaId:'e1',fracaoOS:0.5,numero:'9'+osId.padStart(4,'0'),cliente:'Cliente fictício',dia:'2026-11-06',valor,membros:[pessoaT('100001')],confirmado:true,fonte:'alocacao',equipeId:'',retornoConf:null,voltou:false,estadoEntrega:{situacao:'parcial'},...extra});
const fonteT=(registros,extra={})=>({periodo:{...NOV},regra:'performance-3',regraNota:'nota-valor-1',registros,hash:'hash-ficticio',consultadoEm:'2026-12-02T10:00:00Z',completo:true,fonte:'teste',...extra});
const seloT=(revisao,registros)=>({...fonteT(registros),id:'2026-11-01:2026-11-30:'+String(revisao).padStart(6,'0'),de:NOV.de,ate:NOV.ate,revisao,fechadoEm:'2026-12-0'+(revisao+1)+'T12:00:00Z',fechadoPor:'Gestor fictício',motivo:'Fechamento fictício',hash:'selo-'+revisao});
const depois=(selo,registros)=>({fechamentoId:selo.id,revisao:selo.revisao,fechadoEm:selo.fechadoEm,corte:selo.consultadoEm,hashIgual:true,registros,
  entregas:registros.map(r=>({id:r.id,osId:r.osId,numero:r.numero,dia:r.dia,marcas:[{tipo:'cancelado',item:'1',dia:'2026-11-20',em:'2026-12-08T12:00:00.000Z'}]}))});
function aviso(dados,fechamentos){
  const c=tela();c.__f=dados;c.__h=fechamentos;c.__s=fechamentos[0].id;
  c.run('perfRemoto.chave=perfChave();perfRemoto.dados=__f;perfRemoto.fechamentos=__h;perfRemoto.selecionado=__s;perfRemoto.tentado=true;perfFechados.tentado=true;');
  return c.run('perfAvisoFechadoHTML(perfFonteAtual(),true)');
}

test('M8 na tela: o cancelamento gravado depois do fechamento aparece como "mudou depois do fechamento" e "não entra no fechamento", sem dizer que trava a comissão', ()=>{
  const q=regT('Q::entrega:e1','2',100), a=regT('A','1',300,{entregaId:null,fracaoOS:undefined});
  const s=seloT(1,[a,q]);
  // O cancelamento mudou o estado da entrega (fora do dinheiro) e, no pior caso, o dinheiro dela.
  const qDepois=regT('Q::entrega:e1','2',150,{estadoEntrega:{situacao:'saldo_concluido'}});
  let html=aviso(fonteT([a,qDepois],{depoisDoFechamento:depois(s,[q])}),[s]);
  assert.doesNotMatch(html,/Há 1 mudança/,'a v173 contava o cancelamento gravado depois como mudança do selo');
  assert.doesNotMatch(html,/ficam travados/,'a v173 dizia que Aprovar e Exportar travavam');
  assert.match(html,/Mês fechado: você está vendo a revisão 1, de .*\. 1 entrega mudou depois do fechamento por marca de item gravada depois dele \(O\.S\. 90002: cancelamento de item com o dia 20\/11\/2026, gravado em 08\/12\/2026\): ela não entra no fechamento e não trava Aprovar e Exportar a comissão\. Para que entre, crie uma nova revisão em Base e fechamento\./);
  assert.match(html,/data-perf-ver-atuais/);
  assert.doesNotMatch(html,/—/);
  // Junto de outra mudança (o cliente renomeado): as duas, cada uma com o seu texto.
  html=aviso(fonteT([{...a,cliente:'Outro cliente fictício'},qDepois],{depoisDoFechamento:depois(s,[q])}),[s]);
  assert.match(html,/Há 1 mudança nas entregas depois do fechamento \(1 entrega mudou\)\. Elas não entram no fechamento.*Nenhuma delas muda a comissão: Aprovar e Exportar continuam valendo\. 1 entrega mudou depois do fechamento por marca de item gravada depois dele/);
  // A marca que veio depois de uma revisão antiga não vale para a revisão nova (o recálculo dela a inclui).
  const s2=seloT(2,[a,qDepois]);
  html=aviso(fonteT([a,qDepois],{depoisDoFechamento:depois(s,[q])}),[s2,s]);
  assert.match(html,/Nada mudou nas entregas depois do fechamento/);
  // A leitura que falhou diz a causa, e os dados atuais continuam.
  html=aviso(fonteT([a,q],{depoisDoFechamentoErro:'Não foi possível ler o último fechamento deste período (falha fictícia).'}),[s]);
  assert.match(html,/Não foi possível ler o último fechamento deste período \(falha fictícia\)\. Toque em Atualizar apuração\./);
});
