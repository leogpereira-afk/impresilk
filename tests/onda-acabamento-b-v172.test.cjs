'use strict';
/* ONDA ACABAMENTO B: O FECHAMENTO FEITO PELA v172 RECALCULA IGUAL (mês
   fechado não se recalcula). A onda mexeu na base da comissão só para ler a
   mesma régua no aviso do valor conferido (valorDaComissao, a mesma leitura
   do valorConferencia da v172), no % de retrabalho do relatório anual (por
   O.S.), no vínculo da equipe (agora no diário), na hora da foto do crachá
   sem senha, no bônus manual antigo (só leitura) e no aviso do item sem
   valor. Nada disso entra na apuração selada: o teste fecha novembro com o
   código da v172 (o pcp-sync e o _shared tirados do git), passa o banco ao
   servidor novo e confere o recálculo logo depois e depois de mudanças
   feitas pelo servidor novo; depois aprova a prévia. Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {edge}=require('./helpers/edge.cjs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const RAIZ=path.join(__dirname,'..');
const V172='c9ba8fa';
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
const FICHAS=[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},
  {id:'p2',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia dois',cpf:'20000222222'}},
  {id:'g',colecao:'colaboradores',apagado:false,registro:{nome:'Gestor fictício',apelido:'gestor',cpf:'44455566677'}}];
const itens=()=>[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}];
const aloc=p=>D.montar([{equipeId:null,liderId:p,membros:[p]}]);
function osFixas(){
  const base=(id,numero,extra)=>({id,numero,rev:3,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],veiculo:'Carro fictício',itens:itens(),
    instalacao:{data:'2026-11-05',periodo:'Manhã',duracaoDias:1},prazoCombinado:{data:'2026-11-05',fonte:'agenda',dias:1,em:'2026-11-01T10:00:00.000Z'},...extra});
  const conf=(o,id,dia,q)=>{const cat=C.catalogo(o);return {id,dia,itens:cat.map((i,n)=>({chave:i.chave,identidade:i.identidade,qtde:q[n]||0})).filter(p=>p.qtde>0),alocacao:aloc('100001'),por:'Gestor fictício',porId:'444555',em:dia+'T20:00:00.000Z'};};
  // A: inteira, finalizada e lançada.
  const A=base('A','90801',{finalizadaEm:'2026-11-08T21:00:00.000Z',finalizadoPor:'Gestor fictício',entregaLancada:{data:'2026-11-08',em:'2026-11-08T21:00:00.000Z',por:'Gestor fictício'}});
  // B: conferida em parte e finalizada no PCP depois (o status novo leva o dia ao encerramento).
  const B=base('B','90802',{finalizadaEm:'2026-11-12T21:00:00.000Z',finalizadoPor:'Gestor fictício'});B.conferenciasEntrega=[conf(B,'e1','2026-11-06',[2,0])];
  // M: conferida inteira e não finalizada (M16).
  const M=base('M','90803',{});M.conferenciasEntrega=[conf(M,'e1','2026-11-07',[4,1])];
  // X: baixa do ERP depois do corte, conferida em parte (antes ia também para "a lançar").
  const X=base('X','90804',{finalizadaEm:'2026-11-09T18:00:00',finalizadoPor:'Mubisys (baixa automática · ENTREGUE)',baixaAutoERP:{em:'2026-11-09T18:00:00',status:'ENTREGUE'}});X.conferenciasEntrega=[conf(X,'e1','2026-11-09',[1,0])];
  // K: cancelada pela gestão depois de uma parte conferida.
  const K=base('K','90805',{cancelamento:{ativo:true,motivo:'Cliente desistiu do serviço fictício',por:'Gestor fictício',porId:'444555',em:'2026-11-10T10:00:00.000Z'}});K.conferenciasEntrega=[conf(K,'e1','2026-11-06',[1,0])];
  return [A,B,M,X,K];
}
function banco(oss){
  return {pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-20T00:00:00Z',registro:o})),registros:FICHAS,
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:'A',membros:[{chave:'100001',nome:'Pessoa fictícia',percentual:100}],por:'Gestor fictício',em:'2026-11-06T00:00:00Z'}]}}}],
    painel_ordens:oss.map(o=>({numero:o.numero,valor:8500}))};
}
const entrada=regs=>({config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:r.membros[0].chave,partes:r.membros.map(m=>({pessoaId:m.chave,cota:Math.round(m.percentual*100)})),justificativa:'Equipe fictícia'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
const reg=(e,id)=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id===id).registro;
const recalculo=(e,selo)=>{const s=JSON.stringify({regraNota:selo.regraNota,regraPerdas:selo.regraPerdas,regraVolta:selo.regraVolta});return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`);};
function codigoV172(){
  const show=f=>execFileSync('git',['-C',RAIZ,'show',`${V172}:${f}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const lista=execFileSync('git',['-C',RAIZ,'ls-tree','--name-only',`${V172}`,'supabase/functions/_shared/'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').filter(Boolean);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-v172-'));
  fs.mkdirSync(path.join(dir,'fn'));fs.mkdirSync(path.join(dir,'shared'));
  fs.writeFileSync(path.join(dir,'fn','index.ts'),show('supabase/functions/pcp-sync/index.ts'));
  for(const f of lista)fs.writeFileSync(path.join(dir,'shared',path.basename(f)),show(f));
  return dir;
}

test('o fechamento feito pela v172 recalcula igual no servidor da onda acabamento B, logo depois e depois das mudanças da onda', async t=>{
  let dir='';
  try{dir=codigoV172();}catch{dir='';}
  if(!dir){t.skip('sem o histórico do git (clone raso ou cópia por git archive)');return;}
  try{
    const tipo=path.relative(path.join(RAIZ,'supabase/functions'),path.join(dir,'fn'));
    // Z: uma O.S. de dezembro (mês aberto), conferida em parte, para as mudanças da onda.
    const oss=osFixas();
    const Z={...structuredClone(oss[2]),id:'Z',numero:'90809',instalacao:{data:'2026-12-05',periodo:'Manhã',duracaoDias:1},prazoCombinado:{data:'2026-12-05',fonte:'agenda',dias:1,em:'2026-12-01T10:00:00.000Z'}};
    Z.conferenciasEntrega=[{...Z.conferenciasEntrega[0],dia:'2026-12-05',em:'2026-12-05T20:00:00.000Z'}];
    const v172=await edge(tipo,banco([...oss,Z]),{shared:path.join(dir,'shared')});
    relogio(v172,'2026-12-02T12:00:00Z');
    const fonte=await v172.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.ok(fonte.registros.length>=4,JSON.stringify(fonte).slice(0,300));
    const f=await v172.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-v172-nov',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
    assert.equal(f.status,200,JSON.stringify(f));
    const selo=f.fechamento;
    const p=await v172.call({action:'performanceComissaoNova',...NOV,fechamentoId:selo.id,anterior:'',entrada:entrada(selo.registros),motivo:'Prévia fictícia',requestId:'previa-v172-nov'},gestor);
    assert.equal(p.ok,true,JSON.stringify(p));
    const novo=await edge('pcp-sync',structuredClone(v172.db));
    relogio(novo,'2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'logo depois da publicação');
    relogio(novo,'2026-12-08T12:00:00Z');
    // Item 5a: a gestão muda o valor total de Z; o ERP tem um só valor e é a base: nada muda na comissão, e não há aviso.
    let r=await novo.call({action:'upsert',os:{...structuredClone(reg(novo,'Z')),valorTotal:9999}},gestor);
    assert.equal(r.status,200,JSON.stringify(r));
    assert.doesNotMatch(String(r.avisos||''),/valor da entrega conferida/);
    // Item 5d: a operação (quem não é gestão) põe um item novo sem valor em Z: grava, sem 422, com o aviso sem R$.
    const mont={papel:'operacao',nome:'Operação fictícia',sub:'operacao1',exp:EXP};
    // A cópia de quem não é gestão é a podada (sem R$), como o aparelho dela guarda.
    const z=require('../privacidade-valores.js').podar(structuredClone(reg(novo,'Z')));
    r=await novo.call({action:'upsert',os:{...z,itens:[...z.itens,{uid:'m-z000000001',item:'3',descricao:'Item fictício novo',qtde:'1',manual:true}]}},mont);
    assert.equal(r.status,200,JSON.stringify(r));
    assert.match(String(r.avisos),/Item sem valor: o valor das entregas conferidas desta O\.S\. ficou a conferir/);
    assert.doesNotMatch(String(r.avisos),/R\$/);
    // F25: o pcp tenta gravar o bônus manual antigo: fica o do servidor.
    const base=structuredClone(novo.db.pcp_config_global[0].config);
    r=await novo.call({action:'setCfg',baseCfg:base,cfg:{...base,bonusPCP:{mes:'2026-11',orcamento:500,itens:[]}}},gestor);
    assert.equal(r.status,200,JSON.stringify(r));
    relogio(novo,'2026-12-11T12:00:00Z');
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'depois das mudanças de dezembro');
    const ap=await novo.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,confirmacao:true,motivo:'Aprovação fictícia',requestId:'aprovar-v172-nov'},gestor);
    assert.equal(ap.ok,true,'Aprovar novembro (selo da v172) no servidor novo: '+JSON.stringify(ap));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
