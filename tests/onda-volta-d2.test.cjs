'use strict';
/* ONDA VOLTA, D2 (a volta do carro por viagem) e M11. Cada teste começa pelo
   caso ruim. Dados fictícios (repositório público).
   D2: a O.S. guardava UMA volta (retornoEm, retornoConf, equipe e veículo de
   hoje) e a apuração de novembro lia a volta de hoje. A segunda viagem em
   dezembro, ou só a troca da equipe da O.S., mudava o recálculo de novembro
   fechado: Aprovar e Exportar novembro davam 409 "A fonte mudou", e a
   revisão nova de novembro perdia a volta. Agora o servidor guarda cada
   viagem (voltas) e a entrega de cada período lê a viagem do dia dela.
   M11: o servidor só aproveitava a volta conferida com a equipe da entrega
   EXATAMENTE igual à da O.S.; agora casa por inclusão. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'}, DEZ={de:'2026-12-01',ate:'2026-12-31'};
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
// Fichas fictícias do RH: duas pessoas e o gestor (apelido = login, para o ID de quem confere).
const FICHAS=[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},
  {id:'p2',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia dois',cpf:'20000222222'}},
  {id:'p3',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia três',cpf:'30000333333'}},
  {id:'g',colecao:'colaboradores',apagado:false,registro:{nome:'Gestor fictício',apelido:'gestor',cpf:'44455566677'}}];
function banco(oss,extra={}){
  return {pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2020-01-01',registro:o})),registros:FICHAS,
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[]}}}],
    painel_ordens:oss.map(o=>({numero:o.numero,valor:8500})),...extra};
}
const osItens=(id='c1',numero='90201',extra={})=>({id,numero,rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],veiculo:'Carro fictício',
  itens:[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}],...extra});
const sel=(o,n,qtde)=>{const i=C.catalogo(o)[n];return {chave:i.chave,identidade:i.identidade,qtde};};
const aloc=pessoas=>D.montar([{equipeId:null,liderId:pessoas[0],membros:pessoas}]);
const conf=(id,dia,itens,pessoas=['100001'])=>({id,dia,itens,alocacao:aloc(pessoas)});
const linha=(e,id)=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id===id);
const reg=(e,id)=>linha(e,id).registro;
const SIM={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'};
async function gravar(e,id,campos,who=gestor){
  const r=await e.call({action:'upsert',os:{...structuredClone(reg(e,id)),...campos}},who);
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true,JSON.stringify(r));
  return r;
}
async function conferir(e,id,entrega){
  const r=await e.call({action:'conferenciaEntrega',osId:id,rev:reg(e,id).rev,entrega},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
}
async function fechar(e,periodo){
  const fonte=await e.call({action:'performancePeriodo',...periodo,notaPorValor:true},gestor);
  const f=await e.call({action:'performanceFechar',...periodo,hash:fonte.hash,anterior:'',requestId:'fechar-volta-'+periodo.de,motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true,confirmaCobertura:'fechar com cobertura baixa'},gestor);
  assert.equal(f.status,200,JSON.stringify(f));
  return f.fechamento;
}
const entrada=regs=>({config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:r.membros[0].chave,partes:r.membros.map(m=>({pessoaId:m.chave,cota:Math.round(m.percentual*100)})),justificativa:'Equipe fictícia'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
async function previa(e,periodo,selo){
  const p=await e.call({action:'performanceComissaoNova',...periodo,fechamentoId:selo.id,anterior:'',entrada:entrada(selo.registros),motivo:'Prévia fictícia',requestId:'previa-volta-'+periodo.de},gestor);
  assert.equal(p.ok,true,JSON.stringify(p));
  return p.revisao;
}
const aprovar=(e,periodo,rev)=>e.call({action:'performanceComissaoAprovar',...periodo,anterior:rev.id,hash:rev.hash,confirmacao:true,motivo:'Aprovação fictícia',requestId:'aprovar-volta-'+periodo.de},gestor);

/* A primeira viagem (05/11), a parcial dela e a conferência da volta pela gestão. */
async function novembro(e,id='c1'){
  const o=reg(e,id);
  relogio(e,'2026-11-05T21:00:00Z');
  await gravar(e,id,{horaSaida:'08:00',saidaEm:'2026-11-05T08:00:00',horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00'});
  await conferir(e,id,conf('e1','2026-11-05',[sel(o,0,2)]));
  relogio(e,'2026-11-06T12:00:00Z');
  await gravar(e,id,{retornoConf:{...SIM}});
}

test('D2: parcial de novembro com a volta conferida; a segunda viagem em dezembro não muda novembro fechado, e Aprovar novembro passa', async()=>{
  const e=await edge('pcp-sync',banco([osItens()]));
  await novembro(e);
  relogio(e,'2026-11-20T12:00:00Z');
  const antes=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const e1=antes.registros.find(r=>r.entregaId==='e1');
  assert.equal(e1.voltou,true);assert.equal(e1.retornoConf.carroLimpo,'sim');assert.equal(e1.volta,'2026-11-05|carro ficticio|100001');
  relogio(e,'2026-12-02T12:00:00Z');
  const selo=await fechar(e,NOV);
  const rev=await previa(e,NOV,selo);
  // Dezembro: a segunda viagem, a entrega do resto e a conferência da volta nova (as mesmas respostas, com o dia da viagem nova).
  relogio(e,'2026-12-08T21:00:00Z');
  await gravar(e,'c1',{horaSaida:'08:00',saidaEm:'2026-12-08T08:00:00',horaRetorno:'18:00',retornoEm:'2026-12-08T18:00:00'});
  const o=reg(e,'c1');
  await conferir(e,'c1',conf('e2','2026-12-08',[sel(o,0,2),sel(o,1,1)]));
  relogio(e,'2026-12-09T12:00:00Z');
  await gravar(e,'c1',{retornoConf:{...reg(e,'c1').retornoConf,...SIM,dia:'2026-12-08'}});
  relogio(e,'2026-12-11T12:00:00Z');
  const nov=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(nov.hash,selo.hash,'o recálculo de novembro fechado é o mesmo do selo');
  const n1=nov.registros.find(r=>r.entregaId==='e1');
  assert.equal(n1.voltou,true,'a revisão nova de novembro não perde a volta de novembro');
  assert.match(n1.retornoConf.em,/^2026-11-06T12:00/);
  const ap=await aprovar(e,NOV,rev);
  assert.equal(ap.ok,true,'Aprovar novembro: '+JSON.stringify(ap));
  // Dezembro lê a viagem de dezembro, com a conferência dela.
  const dez=await e.call({action:'performancePeriodo',...DEZ,notaPorValor:true},gestor);
  const d2=dez.registros.find(r=>r.entregaId==='e2');
  assert.equal(d2.voltou,true);assert.equal(d2.volta,'2026-12-08|carro ficticio|100001');assert.match(d2.retornoConf.em,/^2026-12-09T12:00/);
  // As duas viagens ficaram guardadas, cada uma com a sua conferência; a fotografia de antes da primeira mudança também.
  const g=reg(e,'c1');
  assert.deepEqual(g.voltas.map(v=>[v.dia,v.retornoConf&&v.retornoConf.em.slice(0,10)]),[['2026-11-05','2026-11-06'],['2026-12-08','2026-12-09']]);
  assert.ok(g.voltaLegado&&g.voltaLegado.campos,'fotografia da O.S. antes da primeira mudança da viagem');
});

test('D2: só a equipe da O.S. muda em dezembro (sem viagem nova): novembro fechado continua igual e Aprovar passa', async()=>{
  const e=await edge('pcp-sync',banco([osItens()]));
  await novembro(e);
  relogio(e,'2026-12-02T12:00:00Z');
  const selo=await fechar(e,NOV);
  const rev=await previa(e,NOV,selo);
  relogio(e,'2026-12-10T12:00:00Z');
  await gravar(e,'c1',{equipe:['200002']});
  relogio(e,'2026-12-11T12:00:00Z');
  const nov=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(nov.hash,selo.hash);
  assert.equal(nov.registros.find(r=>r.entregaId==='e1').voltou,true);
  const ap=await aprovar(e,NOV,rev);
  assert.equal(ap.ok,true,'Aprovar novembro: '+JSON.stringify(ap));
  // A viagem de 05/11 ficou com a equipe do fim daquele dia.
  assert.deepEqual(reg(e,'c1').voltas.find(v=>v.dia==='2026-11-05').equipe,['100001']);
});

test('D2: a segunda viagem começa sem conferência (a de novembro não passa para ela), e a cópia que só devolve o gravado não recarimba', async()=>{
  const e=await edge('pcp-sync',banco([osItens()]));
  await novembro(e);
  const confNov=structuredClone(reg(e,'c1').retornoConf);
  assert.equal(confNov.dia,'2026-11-05','a conferência leva o dia da viagem que ela confere');
  relogio(e,'2026-12-08T21:00:00Z');
  await gravar(e,'c1',{horaSaida:'08:00',saidaEm:'2026-12-08T08:00:00',horaRetorno:'18:00',retornoEm:'2026-12-08T18:00:00'});
  const o=reg(e,'c1');
  await conferir(e,'c1',conf('e2','2026-12-08',[sel(o,0,2)]));
  // O aparelho salva outra coisa com a cópia que tem a conferência de novembro: nada recarimba.
  relogio(e,'2026-12-09T09:00:00Z');
  await gravar(e,'c1',{obsTecnicas:'Observação fictícia'});
  assert.deepEqual(reg(e,'c1').retornoConf,confNov);
  relogio(e,'2026-12-09T12:00:00Z');
  const dez=await e.call({action:'performancePeriodo',...DEZ,notaPorValor:true},gestor);
  const d2=dez.registros.find(r=>r.entregaId==='e2');
  assert.equal(d2.voltou,true);assert.equal(d2.retornoConf,null,'a viagem de dezembro ainda não foi conferida');
  assert.equal(reg(e,'c1').voltas.find(v=>v.dia==='2026-12-08').retornoConf,null);
});

test('D2: a O.S. antiga, em que nada da viagem muda, continua sem voltas (legado se lê, não se reescreve)', async()=>{
  const e=await edge('pcp-sync',banco([osItens('c2','90202',{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',retornoConf:{...SIM,por:'Gestor fictício',porId:'gestor',em:'2026-11-06T12:00:00Z'}})]));
  relogio(e,'2026-11-07T12:00:00Z');
  await gravar(e,'c2',{obsTecnicas:'Observação fictícia'});
  const g=reg(e,'c2');
  assert.equal(g.voltas,undefined);assert.equal(g.voltaLegado,undefined);
  // E o aparelho não escreve as viagens.
  await gravar(e,'c2',{voltas:[{dia:'2026-11-05',equipe:['999999'],veiculo:'Forjado',retornoConf:{carroLimpo:'nao'}}],voltaLegado:{campos:{}}});
  assert.equal(reg(e,'c2').voltas,undefined);assert.equal(reg(e,'c2').voltaLegado,undefined);
});

test('M11: a conferência com alguém a mais (ou a menos) que a equipe da O.S. não descarta a volta; equipes que só se cruzam, sim', async()=>{
  const oss=[osItens('m1','90301'),osItens('m2','90302',{equipe:['100001','200002']}),osItens('m3','90303',{equipe:['100001','200002']})];
  const e=await edge('pcp-sync',banco(oss));
  for(const o of oss){
    relogio(e,'2026-11-05T21:00:00Z');
    await gravar(e,o.id,{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00'});
    relogio(e,'2026-11-06T12:00:00Z');
    await gravar(e,o.id,{retornoConf:{...SIM}});
  }
  relogio(e,'2026-11-07T12:00:00Z');
  // m1: a entrega pôs um ajudante a mais (equipe maior); m2: só uma das duas pessoas da O.S.; m3: outra gente.
  await conferir(e,'m1',conf('e1','2026-11-05',[sel(oss[0],0,4)],['100001','200002']));
  await conferir(e,'m2',conf('e1','2026-11-05',[sel(oss[1],0,4)],['200002']));
  await conferir(e,'m3',conf('e1','2026-11-05',[sel(oss[2],0,4)],['200002','300003']));
  const nov=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const de=id=>nov.registros.find(r=>r.osId===id);
  assert.equal(de('m1').voltou,true,'equipe maior');assert.equal(de('m1').retornoConf.carroLimpo,'sim');
  assert.equal(de('m2').voltou,true,'equipe menor');
  assert.equal(de('m3').voltou,false,'equipes que só se cruzam são outra viagem');assert.equal(de('m3').retornoConf,null);
  assert.equal(nov.regraVolta,'volta-1','a régua nova mudou entregas: a marca vai no conteúdo');
});

test('item 17: a conferência da volta grava o ID de 6 dígitos em porId (e o login em porConta); montagem e crachá de toque não recebem nenhum dos dois', async()=>{
  // A conta de grupo montagem (com senha) existe em equipe_contas; o crachá de toque é a pessoa da equipe.
  const e=await edge('pcp-sync',banco([osItens()],{equipe_contas:[{sistema:'pcp',usuario:'montagem',ativo:true}]}));
  await novembro(e);
  const rc=reg(e,'c1').retornoConf;
  assert.equal(rc.porId,'444555');assert.equal(rc.porConta,'gestor');assert.equal(rc.por,'Gestor fictício');
  assert.equal(reg(e,'c1').voltas[0].retornoConf.porId,'444555');
  const montagem={papel:'montagem',nome:'Montagem fictícia',sub:'montagem',exp:EXP};
  const toque={papel:'montagem',nome:'Pessoa fictícia',sub:'Pessoa fictícia',id:'100001',montagemIndividual:true,exp:EXP};
  for(const who of [montagem,{...montagem,papel:'operacao'},toque]){
    const r=await e.call({action:'list',escopo:'abertas'},who);
    const o=r.os.find(x=>x.id==='c1'), confs=[o.retornoConf,...(o.voltas||[]).map(v=>v.retornoConf),o.voltaLegado?.campos?.retornoConf].filter(Boolean);
    assert.ok(confs.length>=2,who.papel);
    for(const c of confs){assert.equal(c.porId,undefined,'o ID de quem conferiu não desce para '+who.papel+(who.id?' (toque)':''));assert.equal(c.porConta,undefined);assert.equal(c.por,'Gestor fictício');}
  }
  // A gestão vê o carimbo inteiro.
  const g=(await e.call({action:'list',escopo:'abertas'},gestor)).os.find(x=>x.id==='c1');
  assert.equal(g.retornoConf.porId,'444555');
});

/* TROCADO DE PROPÓSITO NA REVISÃO DA ONDA VOLTA (D1): este teste dizia "sem
   id, o nome" para qualquer O.S. sem veiculoId, e travava a divisão da mesma
   viagem em duas voltas quando uma O.S. tinha o id e a outra só o nome (29
   O.S. abertas têm o carro só pelo nome). Agora, sem o id na O.S., o nome
   EXATO e único no Ativos dá o id; o nome que não está no Ativos (v3, um
   apelido) continua pelo nome, e semelhança continua sem juntar nada. */
test('item 16: a chave da volta pelo id do carro no Ativos; o nome exato e único do Ativos dá o id; o resto é pelo nome; nomes parecidos não se juntam; o id do carro anterior não fica', async()=>{
  const oss=[osItens('v1','90401',{veiculo:'Carro fictício A',veiculoId:'ativo-7'}),osItens('v2','90402',{veiculo:'CARRO A - 1 fictício',veiculoId:'ativo-7'}),osItens('v3','90403',{veiculo:'CARRO A - 1 fictício'}),osItens('v4','90404',{veiculo:'Carro fictício A'})];
  const e=await edge('pcp-sync',banco(oss,{painel_registros:[{colecao:'ativo',id:'ativo-7',apagado:false,registro:{tipo:'veiculo',nome:'Carro fictício A'}}]}));
  for(const o of oss){
    relogio(e,'2026-11-05T21:00:00Z');
    await gravar(e,o.id,{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',finalizadaEm:'2026-11-05T21:00:00Z',finalizadoPor:'Gestor fictício',justificativaConclusao:'Conclusão fictícia sem foto'});
  }
  relogio(e,'2026-11-07T12:00:00Z');
  const nov=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const de=id=>nov.registros.find(r=>r.id===id);
  assert.equal(de('v1').volta,'2026-11-05|id:ativo-7|100001');
  assert.equal(de('v1').volta,de('v2').volta,'o mesmo carro pelo id: uma volta só');
  assert.equal(de('v3').volta,'2026-11-05|carro a - 1 ficticio|100001','sem id e fora do Ativos: o nome (e nada de juntar por semelhança)');
  assert.equal(de('v4').volta,'2026-11-05|id:ativo-7|100001','sem id na O.S., o nome exato e único do Ativos dá o id');
  // Uma aba que não conhece o id troca o carro: o id do carro anterior não fica.
  await gravar(e,'v1',{veiculo:'Carro fictício novo'});
  assert.equal(reg(e,'v1').veiculoId,undefined);
});
