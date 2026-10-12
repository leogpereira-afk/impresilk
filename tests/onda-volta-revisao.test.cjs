'use strict';
/* REVISÃO DA ONDA VOLTA (12/10/2026): as duas revisões (dinheiro e uso)
   disseram "pode publicar: não". Um teste por conserto, cada um começando
   pelo caso ruim (falha no c2a34e6, o fim da onda volta). Dados fictícios
   (repositório público): nomes de pessoa, de carro, de cliente, números de
   O.S. e valores inventados.
   D1: o mesmo carro com e sem o id do Ativos virava duas voltas.
   D2: "como estava no fim do dia" dividia a viagem quando a gestão corrigia
       no dia seguinte.
   D3: a O.S. inteira lia a viagem de hoje (a segunda viagem mudava o mês
       fechado).
   D4: a O.S. selada inteira, reaberta e finalizada de novo, contava outra vez.
   U1: a limpeza da equipe na segunda viagem ficava em laço no celular.
   U2: o Lançar (e a correção do dia do retorno) apagava a observação e as
       fotos da conferência e criava uma viagem que não existiu.
   U3: a ficha, o Lançar, a fila e o lote não mostravam todas as viagens.
   U4: o dia proposto na conferência por item era o da volta (o serviço do dia
       31 ia para o mês seguinte).
   U5: o carro com nome repetido no Ativos trocava a placa escolhida. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {edge}=require('./helpers/edge.cjs');
const O=require('../operacao.js');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const toque={papel:'montagem',nome:'Pessoa fictícia',sub:'Pessoa fictícia',id:'100001',montagemIndividual:true,exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'}, DEZ={de:'2026-12-01',ate:'2026-12-31'};
const SIM={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'};
const FICHAS=[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},
  {id:'p2',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia dois',cpf:'20000222222'}},
  {id:'g',colecao:'colaboradores',apagado:false,registro:{nome:'Gestor fictício',apelido:'gestor',cpf:'44455566677'}}];
// O Ativos do Painel (fictício): um carro com nome único e dois carros com o mesmo nome.
const ativo=(id,nome)=>({colecao:'ativo',id,apagado:false,registro:{tipo:'veiculo',nome,especificacao:{placa:'TST'+id.slice(-4)}}});
const ATIVOS=[ativo('ativo-7','Carro fictício'),ativo('ativo-8','Furgão repetido fictício'),ativo('ativo-9','Furgão repetido fictício')];
function banco(oss,extra={}){
  return {pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2020-01-01',registro:o})),registros:FICHAS,
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros:[{chave:'100001',nome:'Pessoa fictícia',percentual:100}],por:'Gestor fictício',em:'2026-11-01T00:00:00Z'}))}}}],
    painel_ordens:oss.map(o=>({numero:o.numero,valor:1000})),painel_registros:structuredClone(ATIVOS),...extra};
}
const osBase=(id,numero,extra={})=>({id,numero,rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:1000,equipe:['100001'],veiculo:'Carro fictício',
  itens:[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'500'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'500'}],...extra});
const reg=(e,id)=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id===id).registro;
async function gravar(e,id,campos,who=gestor){
  const r=await e.call({action:'upsert',os:{...structuredClone(reg(e,id)),...campos}},who);
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true,JSON.stringify(r));
  return r;
}
async function fechar(e,periodo,rotulo){
  const fonte=await e.call({action:'performancePeriodo',...periodo,notaPorValor:true},gestor);
  const f=await e.call({action:'performanceFechar',...periodo,hash:fonte.hash,anterior:'',requestId:'fechar-revisao-'+rotulo,motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true,confirmaCobertura:'fechar com cobertura baixa'},gestor);
  assert.equal(f.status,200,JSON.stringify(f));
  return f.fechamento;
}
const recalculo=(e,selo,periodo)=>{const s=JSON.stringify({regraNota:selo.regraNota,regraPerdas:selo.regraPerdas,regraVolta:selo.regraVolta});return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(periodo)}),perfOpcoesDoSelo(${s}))`);};
const voltasNaNota=f=>new Set(f.registros.filter(r=>r.voltou!==false).map(r=>r.volta)).size;
const fim=dia=>({finalizadaEm:dia+'T21:00:00.000Z',finalizadoPor:'Gestor fictício',justificativaConclusao:'Conclusão fictícia sem foto'});

/* ─────────────────────────────── D1 ─────────────────────────────── */
test('revisão volta: D1, o mesmo carro com e sem o id do Ativos é UMA volta (servidor, fila, lote e status); nome repetido no Ativos continua pelo nome', async()=>{
  const oss=[osBase('v1','90701'),osBase('v2','90702',{veiculoId:'ativo-7'})];
  const e=await edge('pcp-sync',banco(oss));
  for(const o of oss){relogio(e,'2026-11-05T21:00:00Z');await gravar(e,o.id,{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',...fim('2026-11-05')});}
  relogio(e,'2026-12-02T12:00:00Z');
  const nov=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(voltasNaNota(nov),1,'caso ruim: a régua nova contava duas voltas para a mesma viagem ('+nov.registros.map(r=>r.volta).join(' , ')+')');
  assert.equal(nov.registros[0].volta,'2026-11-05|id:ativo-7|100001');
  // A viagem guardada leva o id que o nome deu na hora em que foi guardada.
  assert.equal(reg(e,'v1').voltas[0].veiculoId,'ativo-7');
  // A fila e o lote do aparelho: a mesma régua, com a lista do elenco.
  O.usarAtivos(ATIVOS.map(a=>({id:a.id,nome:a.registro.nome})));
  try{
    assert.equal(O.voltasDoCarro([reg(e,'v1'),reg(e,'v2')],'2026-11-01','2026-11-30').length,1);
    assert.equal(O.agruparPorVolta([reg(e,'v1'),reg(e,'v2')]).length,1);
    // O status (retorno antecipado), nas duas cópias.
    const S=await import('../supabase/functions/_shared/pcp-status.mjs');
    const lista=[reg(e,'v1'),reg(e,'v2')].map(o=>({...o,retornoConferido:{dia:'2026-11-05',hora:'18:00',em:'x'}}));
    const at=ATIVOS.map(a=>({id:a.id,nome:a.registro.nome}));
    assert.deepEqual(S.voltaDoRetorno(lista[0],[lista[1]],undefined,at).map(x=>x.id),['v1','v2']);
    assert.deepEqual(O.voltaDoRetorno(lista[0],[lista[1]],undefined,at).map(x=>x.id),['v1','v2']);
    // Nome repetido no Ativos: sem id resolvido, cada um pelo que tem.
    const r1={...osBase('r1','90703',{veiculo:'Furgão repetido fictício'}),retornoEm:'2026-11-05T18:00:00',horaRetorno:'18:00'}, r2={...r1,id:'r2',veiculoId:'ativo-8'};
    assert.equal(O.voltasDoCarro([r1,r2],'2026-11-01','2026-11-30').length,2,'nome repetido no Ativos não vira id');
    assert.equal(O.chaveVeiculoVolta(r1),'furgao repetido ficticio');
    // Sem id e fora do Ativos: o nome; nada de semelhança.
    assert.equal(O.chaveVeiculoVolta({veiculo:'carro ficticio '}),'carro ficticio');
  } finally { O.usarAtivos(null); }
  // Renomear o carro no Ativos depois do fechamento não muda o recálculo do mês fechado (o id ficou guardado na viagem).
  const selo=await fechar(e,NOV,'d1');
  assert.equal(selo.regraVolta,'volta-1');
  e.db.painel_registros.find(r=>r.id==='ativo-7').registro.nome='Carro fictício renomeado';
  assert.equal((await recalculo(e,selo,NOV)).hash,selo.hash);
});

/* ─────────────────────────────── D2 ─────────────────────────────── */
test('revisão volta: D2, a gestão corrige a equipe da viagem no dia seguinte (mês aberto): continua UMA volta no servidor e na fila', async()=>{
  const oss=[osBase('x1','90601'),osBase('x2','90602')];
  const e=await edge('pcp-sync',banco(oss));
  relogio(e,'2026-11-05T21:00:00Z');
  await gravar(e,'x1',{horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',...fim('2026-11-05')});
  relogio(e,'2026-11-06T12:00:00Z');
  await gravar(e,'x1',{equipe:['100001','200002']});
  await gravar(e,'x2',{equipe:['100001','200002'],horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',...fim('2026-11-05')});
  assert.deepEqual(reg(e,'x1').voltas.map(v=>[v.dia,v.equipe]),[['2026-11-05',['100001','200002']]],'caso ruim: a viagem guardada ficava com a equipe do fim do dia');
  relogio(e,'2026-12-02T12:00:00Z');
  const f=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(voltasNaNota(f),1,'servidor: '+f.registros.map(r=>r.volta).join(' , '));
  assert.equal(O.voltasDoCarro([reg(e,'x1'),reg(e,'x2')],'2026-11-01','2026-11-30').length,1,'a fila diz o mesmo');
  // A viagem de um dia num período FECHADO fica como estava: a troca da equipe e do carro em dezembro não muda novembro fechado.
  await gravar(e,'x1',{retornoConf:{...SIM}});
  const selo=await fechar(e,NOV,'d2');
  relogio(e,'2026-12-10T12:00:00Z');
  await gravar(e,'x1',{equipe:['200002'],veiculo:'Outro carro fictício'});
  assert.deepEqual(reg(e,'x1').voltas.find(v=>v.dia==='2026-11-05').equipe,['100001','200002']);
  assert.equal((await recalculo(e,selo,NOV)).hash,selo.hash);
});

/* ─────────────────────────────── D3 ─────────────────────────────── */
test('revisão volta: D3, a O.S. inteira lê a viagem do dia da entrega: a segunda viagem de dezembro não muda novembro fechado (selo com a marca)', async()=>{
  const itens=()=>[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'500'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'500'}];
  // M: parcial por item com um ajudante a mais (a régua nova muda: o selo leva a marca).
  const M=osBase('M','90503',{itens:itens()});
  const A=osBase('A','90501');
  const e=await edge('pcp-sync',banco([A,M]));
  relogio(e,'2026-11-05T21:00:00Z');
  await gravar(e,'A',{horaSaida:'08:00',saidaEm:'2026-11-05T08:00:00',horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00',...fim('2026-11-05')});
  relogio(e,'2026-11-06T12:00:00Z');
  await gravar(e,'A',{retornoConf:{...SIM}});
  relogio(e,'2026-11-07T21:00:00Z');
  await gravar(e,'M',{horaRetorno:'18:00',retornoEm:'2026-11-07T18:00:00'});
  const i=C.catalogo(reg(e,'M'))[0];
  const r=await e.call({action:'conferenciaEntrega',osId:'M',rev:reg(e,'M').rev,entrega:{id:'e1',dia:'2026-11-07',itens:[{chave:i.chave,identidade:i.identidade,qtde:2}],alocacao:D.montar([{equipeId:null,liderId:'100001',membros:['100001','200002']}])}},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
  relogio(e,'2026-12-02T12:00:00Z');
  const selo=await fechar(e,NOV,'d3');
  assert.equal(selo.regraVolta,'volta-1');
  // Dezembro: a mesma O.S. A (entregue em novembro) tem outra viagem.
  relogio(e,'2026-12-08T21:00:00Z');
  await gravar(e,'A',{horaSaida:'08:00',saidaEm:'2026-12-08T08:00:00',horaRetorno:'18:00',retornoEm:'2026-12-08T18:00:00'});
  assert.deepEqual(reg(e,'A').voltas.map(v=>v.dia),['2026-11-05','2026-12-08']);
  relogio(e,'2026-12-09T12:00:00Z');
  const depois=await recalculo(e,selo,NOV);
  assert.equal(depois.registros.find(x=>x.id==='A').volta,'2026-11-05|id:ativo-7|100001','caso ruim: lia a viagem de 08/12');
  assert.equal(depois.hash,selo.hash);
});

test('revisão volta: D3 e U4, a viagem da entrega: o mesmo dia; sem ela, a do dia seguinte (serviço noturno); sem ela, a última antes no mesmo mês; nunca uma de depois', ()=>{
  const v=(dia,equipe=['100001'])=>({dia,equipe,veiculo:'Carro fictício',retornoConf:null});
  const o={tipo:'externo',voltas:[v('2026-10-28'),v('2026-11-01'),v('2026-11-05'),v('2026-11-06'),v('2026-12-08')]};
  assert.equal(C.voltaDaOS(o,'2026-11-05').dia,'2026-11-05');
  assert.equal(C.voltaDaOS(o,'2026-10-31').dia,'2026-11-01','o carro voltou depois da meia-noite');
  assert.equal(C.voltaDaOS(o,'2026-11-09').dia,'2026-11-06','a gestão finalizou dias depois do retorno');
  assert.equal(C.voltaDaOS(o,'2026-11-30').dia,'2026-11-06','nunca a viagem de dezembro');
  assert.equal(C.voltaDaOS({tipo:'externo',voltas:[v('2026-10-28'),v('2026-12-08')]},'2026-11-03'),null,'nem a de outro mês antes');
  assert.equal(C.voltaDaEntrega(o,'2026-11-05',['100001','200002']).dia,'2026-11-05');
  assert.equal(C.voltaDaEntrega({tipo:'externo',voltas:[v('2026-11-05',['300003'])]},'2026-11-05',['100001']),null,'equipes que não se contêm');
});

/* ─────────────────────────────── U2 no servidor ─────────────────────────────── */
async function conferidaComObs(){
  const os=osBase('x1','90901',{instalacao:{data:'2026-10-09'},finalizadaEm:'2026-10-11T18:00:00.000Z',finalizadoPor:'Mubisys (auto)',baixaAutoERP:{em:'2026-10-11T18:00:00.000Z',status:'ENTREGUE'}});
  const e=await edge('pcp-sync',banco([os]));
  relogio(e,'2026-10-11T21:00:00.000Z');
  await gravar(e,'x1',{retornoConf:{...SIM,equipamentosOk:'nao',obs:'faltou a escada fictícia',fotos:['foto_x1_1'],por:'Gestor fictício',em:'2026-10-11T21:00:00.000Z'}});
  return e;
}
test('revisão volta: U2, o Lançar com a data do serviço não apaga a observação nem as fotos e não cria viagem (mesmo com o envio da v168, sem obs e fotos)', async()=>{
  const e=await conferidaComObs();
  const antes=structuredClone(reg(e,'x1').retornoConf);
  assert.equal(antes.dia,'2026-10-11');
  relogio(e,'2026-10-12T12:00:00.000Z');
  // O que a tela da onda volta mandava: a conferência "desta viagem" só com as respostas e o dia novo.
  await gravar(e,'x1',{entregaLancada:{data:'2026-10-09',em:'2026-10-12T12:00:00.000Z',por:'Gestor fictício'},retornoConf:{...SIM,equipamentosOk:'nao',por:'Gestor fictício',em:'2026-10-12T12:00:00.000Z',dia:'2026-10-09'}});
  const g=reg(e,'x1');
  assert.equal(g.retornoConf.obs,'faltou a escada fictícia','caso ruim: a observação sumia');
  assert.deepEqual(g.retornoConf.fotos,['foto_x1_1']);
  assert.equal(g.retornoConf.dia,'2026-10-09','a conferência acompanha o dia corrigido');
  assert.equal(g.retornoConf.em,antes.em,'mesmas respostas: não recarimba');
  assert.deepEqual(g.voltas.map(v=>v.dia),['2026-10-09'],'caso ruim: nascia uma viagem que não existiu');
  assert.deepEqual(g.voltas[0].retornoConf.fotos,['foto_x1_1'],'a viagem guarda as fotos');
  assert.equal(g.voltas[0].retornoConf.obs,'faltou a escada fictícia');
  // A correção fica no diário.
  const diario=e.db.pcp_registros.filter(x=>x.colecao==='auditoria'&&JSON.stringify(x.registro).includes('"x1"'));
  assert.ok(diario.some(x=>JSON.stringify(x.registro).includes('2026-10-09')&&JSON.stringify(x.registro).includes('retornoConf')),'diário');
});

test('revisão volta: U2, a cópia velha com o dia antigo e o celular que corrige o dia não apagam nada; a viagem nova de fato (saída depois do retorno) nasce sem a conferência da outra', async()=>{
  const e=await conferidaComObs();
  relogio(e,'2026-10-12T12:00:00.000Z');
  const velha=structuredClone(reg(e,'x1'));
  await gravar(e,'x1',{entregaLancada:{data:'2026-10-09',em:'2026-10-12T12:00:00.000Z',por:'Gestor fictício'}});
  assert.equal(reg(e,'x1').retornoConf.dia,'2026-10-09','a gestão sem mandar a conferência: ela acompanha');
  // Uma aba com a cópia de antes (dia 11/10) salva outra coisa.
  const r=await e.call({action:'upsert',os:{...velha,obsTecnicas:'Observação fictícia',entregaLancada:reg(e,'x1').entregaLancada,rev:reg(e,'x1').rev}},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
  let g=reg(e,'x1');
  assert.equal(g.retornoConf.obs,'faltou a escada fictícia');assert.deepEqual(g.retornoConf.fotos,['foto_x1_1']);assert.equal(g.retornoConf.dia,'2026-10-09');
  // O celular registra a saída e o retorno de uma viagem nova, depois do retorno da anterior: viagem nova.
  relogio(e,'2026-10-20T21:00:00.000Z');
  await gravar(e,'x1',{horaSaida:'08:00',saidaEm:'2026-10-20T08:00:00',horaRetorno:'18:00',retornoEm:'2026-10-20T18:00:00'},toque);
  g=reg(e,'x1');
  assert.deepEqual(g.voltas.map(v=>[v.dia,!!v.retornoConf]),[['2026-10-09',true],['2026-10-20',false]]);
  assert.equal(g.retornoConf.dia,'2026-10-09','a conferência é da viagem de 09/10');
  // A gestão corrige o retorno da viagem nova para o dia seguinte, com a mesma saída: a mesma viagem.
  relogio(e,'2026-10-22T12:00:00.000Z');
  await gravar(e,'x1',{retornoEm:'2026-10-21T00:30:00',horaRetorno:'00:30'});
  assert.deepEqual(reg(e,'x1').voltas.map(v=>v.dia),['2026-10-09','2026-10-21']);
  // As fotos da primeira viagem continuam citadas pela O.S. (a prova não some).
  assert.ok(JSON.stringify(reg(e,'x1').voltas).includes('foto_x1_1'));
});

/* ─────────────────────────────── U1 no servidor ─────────────────────────────── */
test('revisão volta: U1, na segunda viagem a limpeza da equipe é aceita pelo servidor; a da viagem que o PCP já conferiu não muda', async()=>{
  const e=await edge('pcp-sync',banco([osBase('w1','90801')]));
  relogio(e,'2026-11-05T21:00:00Z');
  await gravar(e,'w1',{horaSaida:'08:00',saidaEm:'2026-11-05T08:00:00',horaRetorno:'18:00',retornoEm:'2026-11-05T18:00:00'});
  relogio(e,'2026-11-06T12:00:00Z');
  await gravar(e,'w1',{retornoConf:{...SIM}});
  relogio(e,'2026-11-10T21:00:00Z');
  await gravar(e,'w1',{horaSaida:'08:00',saidaEm:'2026-11-10T08:00:00',horaRetorno:'18:00',retornoEm:'2026-11-10T18:00:00'});
  const decl=dia=>({...SIM,obs:'',fotos:['foto_w1_9'],dia,veiculo:'Carro fictício',em:'2026-11-10T21:30:00.000Z'});
  await gravar(e,'w1',{voltaEquipe:decl('2026-11-10')},toque);
  assert.equal(reg(e,'w1').voltaEquipe?.dia,'2026-11-10','caso ruim: o servidor recusava calado (o PCP tinha conferido a primeira viagem)');
  assert.equal(reg(e,'w1').voltas.find(v=>v.dia==='2026-11-10').voltaEquipe.fotos[0],'foto_w1_9','a viagem guarda a limpeza dela');
  // A gestão confere a segunda viagem; depois disso a limpeza dela não muda.
  relogio(e,'2026-11-11T12:00:00Z');
  await gravar(e,'w1',{retornoConf:{...SIM,dia:'2026-11-10'}});
  await gravar(e,'w1',{voltaEquipe:{...decl('2026-11-10'),carroLimpo:'nao',em:'2026-11-11T13:00:00.000Z'}},toque);
  assert.equal(reg(e,'w1').voltaEquipe.carroLimpo,'sim');
});

/* ─────────────────────────────── as cópias, por sorteio ─────────────────────────────── */
function gerador(semente){
  let s=semente>>>0;
  const r=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const int=(a,b)=>a+Math.floor(r()*(b-a+1));
  return {r,int,um:xs=>xs[int(0,xs.length-1)]};
}
const DIAS=['2026-10-31','2026-11-01','2026-11-05','2026-11-06','2026-12-08','',undefined];
const HORAS=['2026-11-05T18:00:00','2026-11-05T08:00:00','2026-11-06T01:10:00','2026-12-08T18:00:00Z','2026-12-08T08:00:00','2026-10-31T20:00:00',''];
function osSorteada(g,i){
  const o={id:'s'+i,tipo:g.um(['externo','externo','interno']),equipe:g.um([['100001'],['100001','200002'],[]]),veiculo:g.um(['Carro fictício','Furgão repetido fictício','',undefined]),veiculoId:g.um(['','ativo-7',undefined])};
  if(g.r()<.6)o.retornoEm=g.um(HORAS);
  if(g.r()<.4)o.horaRetorno=g.um(['18:00','']);
  if(g.r()<.5)o.saidaEm=g.um(HORAS);
  if(g.r()<.3)o.instalacao={data:g.um(DIAS)};
  if(g.r()<.4)o.entregaLancada=g.um([{data:g.um(DIAS)},{data:g.um(DIAS),desfazer:true},null]);
  if(g.r()<.5)o.finalizadaEm=g.um(HORAS);
  const conf=()=>({...SIM,carroLimpo:g.um(['sim','nao','']),obs:g.um(['','obs fictícia']),fotos:g.um([[],['f1']]),por:'Gestor fictício',em:'2026-11-06T12:00:00Z',...(g.r()<.6?{dia:g.um(DIAS)}:{})});
  if(g.r()<.6)o.retornoConf=conf();
  if(g.r()<.4)o.voltaEquipe={...conf(),porId:'100001'};
  if(g.r()<.5)o.voltas=[{dia:g.um(DIAS),equipe:['100001'],veiculo:'Carro fictício',retornoEm:g.um(HORAS),retornoConf:g.r()<.5?conf():null,...(g.r()<.4?{voltaEquipe:conf()}:{})},{dia:g.um(DIAS),equipe:['100001','200002'],veiculo:'Outro',retornoEm:g.um(HORAS),retornoConf:null}];
  return o;
}
test('revisão volta: as cópias da viagem do dia (aparelho, servidor e OPERACAO, que o celular usa) dizem o mesmo em 3000 O.S. sorteadas', async()=>{
  const {CONFERENCIA_ENTREGA:S}=await import('../supabase/functions/_shared/pcp-conferencia-entrega.mjs');
  const g=gerador(20261013);
  const at=ATIVOS.map(a=>({id:a.id,nome:a.registro.nome}));
  for(let i=0;i<3000;i++){
    const a=osSorteada(g,i), b=osSorteada(g,i+5000), dia=g.um(DIAS)||'';
    const saida=X=>JSON.stringify([X.confDaViagemDoDia(a,dia),X.declaracaoDaViagemDoDia(a,dia),X.voltaDaOS(a,dia),X.voltaDaEntrega(a,dia,['100001'],x=>x),X.movimentoDaViagem(a,b),X.idDoAtivo(a.veiculo,at),X.chaveVeiculo(a,at)]);
    assert.equal(saida(C),saida(S),'O.S. sorteada '+i);
    assert.deepEqual(O.confDaViagemDoDia(a,dia),C.confDaViagemDoDia(a,dia),'conferência '+i);
    assert.deepEqual(O.declaracaoDaViagem(a,dia),C.declaracaoDaViagemDoDia(a,dia),'limpeza '+i);
    assert.equal(O.idDoAtivo(a.veiculo,at),C.idDoAtivo(a.veiculo,at),'Ativos '+i);
    assert.equal(O.chaveVeiculoVolta(a,at),C.chaveVeiculo(a,at),'carro '+i);
  }
});
