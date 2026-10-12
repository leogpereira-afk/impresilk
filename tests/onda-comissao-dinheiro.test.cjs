'use strict';
/* ONDA COMISSÃO (fila única de 11/10/2026, passo 9), itens 1 e 2: A
   APROVAÇÃO E A EXPORTAÇÃO CONFEREM SÓ O DINHEIRO. Aprovar e Exportar
   recalculam a fonte do mês fechado e comparavam com o hash do fechamento
   inteiro: a conferência da volta mudada depois, o carro renomeado, o cliente
   renomeado ou os pesos da Nota davam 409 "A fonte mudou", sem nada mudar na
   comissão. Agora a porta compara só o que decide a comissão; mudança de
   dinheiro continua 409, com a lista do que mudou. A O.S. com a origem a
   definir no selo não trava a exportação quando a origem é definida depois:
   vira pendência para a próxima revisão ou compensação. O hash do fechamento
   não muda. Cada teste começa pelo caso ruim. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {edge}=require('./helpers/edge.cjs');
const C=require('../comissao.js');
const RAIZ=path.join(__dirname,'..');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
const osF=(id,extra={})=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal:120000,...extra}});
async function servidor(oss,{versao}={}){
  const e=await edge(versao||'pcp-sync',{
    pcp_registros:oss,
    registros:[1,2,3].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor',em:'2026-11-10'}))}}}],
    painel_ordens:[]});
  relogio(e,'2026-12-02T12:00:00Z');
  return e;
}
const reg=(e,id)=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
const cfg=e=>e.db.pcp_config_global[0];
async function fechar(e){
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(fonte.status,200,JSON.stringify(fonte));
  const r=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-dinheiro-nov',motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
  return r.fechamento;
}
const entrada=f=>({config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
async function previa(e,f,n=1,anterior=''){
  const p=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f.id,anterior,entrada:entrada(f),motivo:'Prévia fictícia',requestId:'previa-dinheiro-'+n},gestor);
  assert.equal(p.ok,true,JSON.stringify(p));
  return p.revisao;
}
const aprovar=(e,p,n=1)=>e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.id,hash:p.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-dinheiro-'+n},gestor);
const exportar=(e,r)=>e.call({action:'performanceComissaoExportar',...NOV,id:r.id},gestor);
const recalculo=(e,selo)=>{const s=JSON.stringify({regraNota:selo.regraNota,regraPerdas:selo.regraPerdas,regraVolta:selo.regraVolta});return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`);};

test('item 1: mudança fora do dinheiro depois do fechamento (volta conferida, carro e cliente renomeados, pesos da Nota) deixa aprovar e exportar',async()=>{
  const e=await servidor([osF('os1'),osF('os2')]);
  const f=await fechar(e);
  const p=await previa(e,f);
  reg(e,'os1').retornoConf={carroLimpo:'nao',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim',por:'Gestor fictício',porId:'444555',em:'2026-12-01T12:00:00Z'};
  reg(e,'os1').horaRetorno='18:00';reg(e,'os1').retornoEm='2026-11-10T18:00:00';
  reg(e,'os2').veiculo='Carro fictício renomeado';reg(e,'os2').cliente='Cliente fictício renomeado';
  cfg(e).config.performancePCP.criterios={producao:50,limpeza:25,equipamentos:25};cfg(e).atualizado_em='2026-12-01T00:00:00Z';
  // O caso ruim: o hash do fechamento inteiro já não bate (mês fechado não se recalcula).
  assert.notEqual((await recalculo(e,f)).hash,f.hash,'a mudança é real fora do dinheiro');
  const a=await aprovar(e,p);
  assert.equal(a.status,200,'aprovar com mudança fora do dinheiro: '+JSON.stringify(a));
  assert.equal(a.revisao.fonteConferida.hashIgual,false);
  assert.equal(a.revisao.fonteConferida.foraDoDinheiro,2,'as duas entregas mudaram fora do dinheiro');
  assert.equal(a.revisao.hash,(await e.run(`perfHash(${JSON.stringify({apuracao:a.revisao.apuracao,entrada:a.revisao.entrada,fechamentoId:a.revisao.fechamentoId})})`)),'o hash da aprovação é o de sempre');
  const x=await exportar(e,a.revisao);
  assert.equal(x.status,200,JSON.stringify(x));
  assert.equal(x.conferencia.foraDoDinheiro,2);
  // O selo não foi reescrito.
  assert.equal(e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.hash,f.hash);
});

test('item 1: mudança de dinheiro continua 409, com o que mudou (líquido, quem recebe, entrega nova) e o caminho de volta',async()=>{
  const e=await servidor([osF('os1'),osF('os2')]);
  const f=await fechar(e);
  const p=await previa(e,f);
  reg(e,'os1').valorTotal=130000;
  let r=await aprovar(e,p);
  assert.equal(r.status,409,JSON.stringify(r));
  assert.match(r.error,/A fonte mudou depois do fechamento no que decide a comissão \(O\.S\. 90001: valor líquido\)/);
  assert.deepEqual(r.mudancasDinheiro.map(m=>[m.numero,m.campos,m.antesCentavos,m.depoisCentavos]),[['90001',['liquidoCentavos'],12000000,13000000]]);
  reg(e,'os1').valorTotal=120000;
  // Quem recebe: a participação confirmada trocou uma pessoa.
  cfg(e).config.performancePCP.participacoes[1].membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100003',nome:'Pessoa 3',percentual:40}];cfg(e).atualizado_em='2026-12-01T00:00:00Z';
  r=await aprovar(e,p,2);
  assert.equal(r.status,409,JSON.stringify(r));
  assert.match(r.error,/O\.S\. 90002: quem recebe/);
  cfg(e).config.performancePCP.participacoes[1].membros=membros;
  const a=await aprovar(e,p,3);
  assert.equal(a.status,200,JSON.stringify(a));
  // Entrega nova no mês depois da aprovação: exportar recusa.
  e.db.pcp_registros.push(osF('os3',{valorTotal:5000}));cfg(e).config.performancePCP.participacoes.push({id:'os3',membros,por:'Gestor',em:'2026-11-10'});
  const x=await exportar(e,a.revisao);
  assert.equal(x.status,409,JSON.stringify(x));
  assert.match(x.error,/O\.S\. 90003: entrou na base do mês/);
});

test('item 2: aprovado com a O.S. de origem a definir, definir a origem depois não trava a exportação e vira pendência',async()=>{
  const e=await servidor([osF('os1'),osF('os2',{retrabalho:true,etapaOrigem:''})]);
  const f=await fechar(e);
  assert.equal(f.regraPerdas,'perdas-1');
  const p=await previa(e,f);
  assert.equal(p.apuracao.aprovavel,true,JSON.stringify(p.apuracao.pendencias));
  assert.equal(p.apuracao.linhas.find(l=>l.osId==='os2').decisao,'origem_a_definir');
  const a=await aprovar(e,p);
  assert.equal(a.status,200,JSON.stringify(a));
  // A gestão define a origem depois da aprovação (na ficha).
  for(const [origem,efeito] of [['Produção',''],['Instalação','retrabalho_instalacao']]){
    reg(e,'os2').etapaOrigem=origem;
    const x=await exportar(e,a.revisao);
    assert.equal(x.status,200,'origem '+origem+' definida depois: '+JSON.stringify(x));
    assert.deepEqual(x.conferencia.pendentes.map(m=>[m.osId,m.origemDefinida,m.efeitoAgora]),[['os2',true,efeito]]);
  }
  // A linha paga que vira retrabalho depois do fechamento continua sendo dinheiro: 409.
  reg(e,'os1').retrabalho=true;reg(e,'os1').etapaOrigem='';
  const y=await exportar(e,a.revisao);
  assert.equal(y.status,409,JSON.stringify(y));
  assert.match(y.error,/O\.S\. 90001: retrabalho de instalação ou a origem/);
});

test('item 1: régua que este servidor não conhece nunca vira aceite, mesmo sem mudança de dinheiro',async()=>{
  const e=await servidor([osF('os1')]);
  const f=await fechar(e);
  const p=await previa(e,f);
  e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.regraNota='nota-valor-9';
  const r=await aprovar(e,p);
  assert.equal(r.status,409,JSON.stringify(r));
  assert.match(r.error,/A régua deste fechamento não existe neste servidor/);
});

test('item 1: o fechamento feito pela v168 recalcula igual, aprova e exporta depois de mudança fora do dinheiro',async t=>{
  let antigo='';
  try{antigo=execFileSync('git',['-C',RAIZ,'show','c71d63b:supabase/functions/pcp-sync/index.ts'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{antigo='';}
  if(!antigo){t.skip('sem o histórico do git (clone raso ou cópia por git archive)');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-v168-'));
  try{
    fs.mkdirSync(path.join(dir,'fn'));fs.writeFileSync(path.join(dir,'fn','index.ts'),antigo);
    const tipo=path.relative(path.join(RAIZ,'supabase/functions'),path.join(dir,'fn'));
    const v168=await servidor([osF('os1'),osF('os2',{retrabalho:true,etapaOrigem:''})],{versao:tipo});
    const f=await fechar(v168);
    const p=await previa(v168,f);
    const novo=await edge('pcp-sync',structuredClone(v168.db));
    relogio(novo,'2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo,f)).hash,f.hash,'o selo da v168 recalcula igual no servidor novo');
    reg(novo,'os1').cliente='Cliente fictício renomeado';
    reg(novo,'os2').etapaOrigem='Produção';
    const a=await aprovar(novo,p);
    assert.equal(a.status,200,JSON.stringify(a));
    const x=await exportar(novo,a.revisao);
    assert.equal(x.status,200,JSON.stringify(x));
    assert.equal(x.conferencia.foraDoDinheiro,1);
    assert.deepEqual(x.conferencia.pendentes.map(m=>m.osId),['os2']);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('itens 1 e 2: o aparelho e o servidor dizem o mesmo (sorteio)',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  let semente=7;const rnd=()=>(semente=(semente*1103515245+12345)%2147483648)/2147483648;
  const pick=xs=>xs[Math.floor(rnd()*xs.length)];
  const registro=i=>{const r={id:'os'+i+(rnd()<0.3?'::entrega:e1':''),numero:String(90000+i),dia:'2026-11-'+String(1+Math.floor(rnd()*28)).padStart(2,'0'),valor:pick([null,10,12.34,1000]),
    membros:pick([[{chave:'100001'}],[{chave:'100001'},{chave:'100002'}]]),confirmado:rnd()<0.9,cliente:pick(['A','B']),volta:pick(['x','y']),retornoConf:pick([null,{carroLimpo:'sim'}])};
    if(r.id.includes('::'))Object.assign(r,{osId:'os'+i,entregaId:'e1',fracaoOS:pick([0.5,0.25])});
    if(rnd()<0.3)Object.assign(r,{retrabalho:true,etapaOrigem:pick(['','Produção','Instalação'])},rnd()<0.5?{perda:'retrabalho_instalacao'}:{});
    if(rnd()<0.2)r.grupos=[{equipeId:'q1',cota:5000,membros:['100001']},{equipeId:'q2',cota:5000,membros:['100002']}];
    return r;};
  const mexer=r=>{const x=structuredClone(r);const k=pick(['valor','cliente','volta','membros','etapaOrigem','retornoConf','nada']);
    if(k==='valor')x.valor=pick([null,11,1000]);else if(k==='membros')x.membros=[{chave:'100003'}];else if(k==='etapaOrigem')x.etapaOrigem=pick(['','Medição']);else if(k!=='nada')x[k]=pick(['z',null]);return x;};
  for(let i=0;i<400;i++){
    const regs=Array.from({length:1+Math.floor(rnd()*5)},(_,j)=>registro(j));
    const selo={periodo:NOV,regra:'performance-3',...(rnd()<0.6?{regraPerdas:'perdas-1'}:{}),registros:regs};
    const atual={...selo,registros:regs.map(r=>rnd()<0.5?mexer(r):r).filter(()=>rnd()<0.95)};
    assert.deepEqual(C.mudancasDeDinheiro(selo,atual),S.mudancasDeDinheiro(selo,atual));
    assert.deepEqual(C.dinheiroDaFonte(selo),S.dinheiroDaFonte(selo));
    assert.equal(C.mudancasDeDinheiro(selo,structuredClone(selo)).igual,true,'a mesma fonte não muda nada');
  }
});
