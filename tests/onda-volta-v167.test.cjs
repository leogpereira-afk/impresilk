'use strict';
/* ONDA VOLTA: O FECHAMENTO FEITO PELA v167 RECALCULA IGUAL (mês fechado não se
   recalcula). A v167 lia a volta dos campos da O.S. de hoje e casava a volta
   da entrega por item só com a equipe exatamente igual; a régua nova lê a
   viagem de cada entrega e casa por inclusão (M11). O selo da v167 não tem a
   marca regraVolta: o recálculo dele (Aprovar e Exportar) usa a régua de
   antes, pela fotografia que o servidor novo guarda na primeira mudança da
   viagem (voltaLegado). O teste fecha novembro com o código da v167 (do
   histórico do git), passa o banco ao servidor novo e confere o recálculo
   logo depois e depois de mudanças pelo servidor novo (a segunda viagem, a
   troca da equipe e a conferência tardia da volta). Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {edge}=require('./helpers/edge.cjs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const RAIZ=path.join(__dirname,'..');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
const FICHAS=[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},
  {id:'p2',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia dois',cpf:'20000222222'}},
  {id:'g',colecao:'colaboradores',apagado:false,registro:{nome:'Gestor fictício',apelido:'gestor',cpf:'44455566677'}}];
const SIM={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'};
// A conferência da volta como a v167 gravava: porId com o login.
const confV167=em=>({...SIM,obs:'',fotos:[],por:'Gestor fictício',porId:'gestor',em});
const itens=()=>[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}];
const aloc=pessoas=>D.montar([{equipeId:null,liderId:pessoas[0],membros:pessoas}]);
function osFixas(){
  const base=(id,numero,extra)=>({id,numero,rev:3,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],veiculo:'Carro fictício',itens:itens(),...extra});
  const conf=(o,dia,pessoas,qtde=2)=>{const i=C.catalogo(o)[0];return [{id:'e1',dia,itens:[{chave:i.chave,identidade:i.identidade,qtde}],alocacao:aloc(pessoas),por:'Gestor fictício',porId:'444555',em:dia+'T20:00:00.000Z'}];};
  // A: O.S. inteira, finalizada e lançada, com a volta conferida.
  const A=base('A','90501',{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',finalizadaEm:'2026-11-05T21:00:00.000Z',finalizadoPor:'Gestor fictício',entregaLancada:{data:'2026-11-05',em:'2026-11-05T21:00:00.000Z',por:'Gestor fictício'},retornoConf:confV167('2026-11-06T12:00:00.000Z')});
  // B: parcial por item com a equipe igual à da O.S. (a v167 aproveita a volta).
  const B=base('B','90502',{horaRetorno:'18:00',retornoEm:'2026-11-06T18:00:00',retornoConf:confV167('2026-11-07T12:00:00.000Z')});B.conferenciasEntrega=conf(B,'2026-11-06',['100001']);
  // M: parcial por item com um ajudante a mais (a v167 descarta a volta; a régua nova não).
  const M=base('M','90503',{horaRetorno:'18:00',retornoEm:'2026-11-07T18:00:00',retornoConf:confV167('2026-11-08T12:00:00.000Z')});M.conferenciasEntrega=conf(M,'2026-11-07',['100001','200002']);
  // X: parcial conferida com o dia da finalização, e o retorno em outro dia (a v167 descarta).
  const X=base('X','90504',{horaRetorno:'18:00',retornoEm:'2026-11-09T18:00:00',retornoConf:confV167('2026-11-10T12:00:00.000Z')});X.conferenciasEntrega=conf(X,'2026-11-08',['100001']);
  return [A,B,M,X];
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
async function gravar(e,id,campos){
  const r=await e.call({action:'upsert',os:{...structuredClone(reg(e,id)),...campos}},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
}
// O recálculo que Aprovar e Exportar fazem (o selo diz a régua), para comparar o hash.
const recalculo=(e,selo)=>e.run(`perfFonte(perfParametrosDoSelo(${JSON.stringify({regraNota:selo.regraNota,regraPerdas:selo.regraPerdas,regraVolta:selo.regraVolta})},${JSON.stringify(NOV)}),{reguaPerdas:perfReguaDoSelo(${JSON.stringify({regraPerdas:selo.regraPerdas})}),regraVolta:perfRegraVoltaDoSelo(${JSON.stringify({regraVolta:selo.regraVolta})})})`);

test('o fechamento feito pela v167 recalcula igual no servidor novo: logo depois e depois da segunda viagem, da troca da equipe e da conferência tardia', async t=>{
  let antigo='';
  try{antigo=execFileSync('git',['-C',RAIZ,'show','76d0ffa:supabase/functions/pcp-sync/index.ts'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{antigo='';}
  if(!antigo){t.skip('sem o histórico do git (clone raso ou cópia por git archive)');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-v167-'));
  try{
    fs.mkdirSync(path.join(dir,'fn'));fs.writeFileSync(path.join(dir,'fn','index.ts'),antigo);
    const tipo=path.relative(path.join(RAIZ,'supabase/functions'),path.join(dir,'fn'));
    // Novembro fechado pela v167.
    const v167=await edge(tipo,banco(osFixas()));
    relogio(v167,'2026-12-02T12:00:00Z');
    const fonte=await v167.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.equal(fonte.regraVolta,undefined);
    const fv=(id)=>fonte.registros.find(r=>(r.osId||r.id)===id);
    assert.equal(fv('B').voltou,true);assert.equal(fv('M').voltou,false,'a v167 descarta a volta da equipe maior');assert.equal(fv('X').voltou,false);
    const f=await v167.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-v167-nov',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
    assert.equal(f.status,200,JSON.stringify(f));
    const selo=f.fechamento;
    const p=await v167.call({action:'performanceComissaoNova',...NOV,fechamentoId:selo.id,anterior:'',entrada:entrada(selo.registros),motivo:'Prévia fictícia',requestId:'previa-v167-nov'},gestor);
    assert.equal(p.ok,true,JSON.stringify(p));
    // O banco passa ao servidor novo (o que a publicação faz).
    const novo=await edge('pcp-sync',structuredClone(v167.db));
    relogio(novo,'2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'logo depois da publicação');
    // A régua nova, numa apuração nova, aproveita as voltas que a v167 descartava (M11).
    const agora=await novo.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
    assert.equal(agora.regraVolta,'volta-1');assert.equal(agora.registros.find(r=>r.osId==='M').voltou,true);
    // Mudanças pelo servidor novo em dezembro.
    relogio(novo,'2026-12-08T21:00:00Z');
    await gravar(novo,'B',{horaSaida:'08:00',saidaEm:'2026-12-08T08:00:00',horaRetorno:'18:00',retornoEm:'2026-12-08T18:00:00'});
    relogio(novo,'2026-12-09T12:00:00Z');
    await gravar(novo,'B',{retornoConf:{...reg(novo,'B').retornoConf,carroLimpo:'nao',dia:'2026-12-08'}});
    await gravar(novo,'M',{equipe:['200002']});
    await gravar(novo,'A',{retornoConf:{...reg(novo,'A').retornoConf,equipamentosOk:'nao'}});
    await gravar(novo,'X',{veiculo:'Outro carro fictício'});
    assert.ok(reg(novo,'B').voltaLegado&&reg(novo,'A').voltaLegado,'a fotografia de antes da primeira mudança');
    relogio(novo,'2026-12-11T12:00:00Z');
    assert.equal((await recalculo(novo,selo)).hash,selo.hash,'depois das mudanças de dezembro');
    const ap=await novo.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,confirmacao:true,motivo:'Aprovação fictícia',requestId:'aprovar-v167-nov'},gestor);
    assert.equal(ap.ok,true,'Aprovar novembro (selo da v167) no servidor novo: '+JSON.stringify(ap));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('o selo novo, feito sem mudança de régua (as duas dizem o mesmo), não leva a marca e recalcula igual depois das mudanças', async()=>{
  const [A,B]=osFixas();
  const e=await edge('pcp-sync',banco([A,B]));
  relogio(e,'2026-12-02T12:00:00Z');
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(fonte.regraVolta,undefined,'o hash fica o de antes da régua nova');
  const f=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-sem-marca',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(f.status,200,JSON.stringify(f));
  relogio(e,'2026-12-08T21:00:00Z');
  await gravar(e,'B',{horaRetorno:'18:00',retornoEm:'2026-12-08T18:00:00'});
  await gravar(e,'A',{equipe:['200002'],retornoConf:{...reg(e,'A').retornoConf,carroLimpo:'nao'}});
  assert.equal((await recalculo(e,f.fechamento)).hash,f.fechamento.hash);
});
