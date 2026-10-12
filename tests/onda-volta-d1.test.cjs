'use strict';
/* ONDA VOLTA, D1 (furo da revisão da onda fechamento, prova do verificador).
   A O.S. que entrou INTEIRA no fechamento de novembro (sem conferência por
   item, pelo dia da finalização) é reaberta pela gestão em dezembro: o
   Reabrir apaga o finalizadaEm. A trava da v167 olhava o estado de hoje da
   O.S. (perfDiaInteira exige finalizadaEm), não achava o dia e deixava a
   primeira conferência por item com dia de dezembro passar: o mesmo valor
   contava em novembro (no selo) e em dezembro. A trava agora procura o id da
   O.S. nos fechamentos que valem (a última revisão de cada período), sem
   depender do estado de hoje. Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const NOV={de:'2026-11-01',ate:'2026-11-30'};
function banco(oss,extra={}){
  const participacoes=oss.map(o=>({id:o.id,membros:[{chave:'100001',nome:'Pessoa fictícia',percentual:100}],por:'Gestor',em:'2026-09-01'}));
  return {pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2020-01-01',registro:o})),
    registros:[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}}],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes}}}],painel_ordens:[],...extra};
}
const osItens=(id='w1',numero='90201',extra={})=>({id,numero,rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],
  itens:[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}],...extra});
const sel=(o,n,qtde)=>{const i=C.catalogo(o)[n];return {chave:i.chave,identidade:i.identidade,qtde};};
const conf=(id,dia,itens,pessoa='100001')=>({id,dia,itens,alocacao:D.montar([{equipeId:null,liderId:pessoa,membros:[pessoa]}])});
const linha=(e,id)=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id===id);
async function fecharNovembro(e){
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const f=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-d1-novembro',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(f.status,200,JSON.stringify(f));
  return f.fechamento;
}

test('D1: a O.S. que entrou inteira em novembro fechado, reaberta em dezembro, NÃO recebe a primeira conferência por item', async()=>{
  const o=osItens('w1','90201',{finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',entregaLancada:{data:'2026-11-10'}});
  const e=await edge('pcp-sync',banco([o],{painel_ordens:[{numero:o.numero,valor:8500}]}));
  relogio(e,'2026-12-02T12:00:00Z');
  const selo=await fecharNovembro(e);
  assert.deepEqual(selo.registros.map(r=>r.id),['w1']);
  // Sem reabrir: a recusa da v167 continua.
  relogio(e,'2026-12-05T12:00:00Z');
  const r0=await e.call({action:'conferenciaEntrega',osId:'w1',rev:1,entrega:conf('e1','2026-12-05',[sel(o,0,4),sel(o,1,1)])},gestor);
  assert.equal(r0.status,409);assert.equal(r0.inteiraNoFechamento,true);
  // A gestão reabre pela ficha (o botão Reabrir grava finalizadaEm '').
  const up=await e.call({action:'upsert',os:{...linha(e,'w1').registro,finalizadaEm:'',finalizadoPor:''}},gestor);
  assert.equal(up.status,200,JSON.stringify(up));
  assert.equal(linha(e,'w1').registro.finalizadaEm,'');
  const rev=linha(e,'w1').registro.rev;
  relogio(e,'2026-12-06T12:00:00Z');
  // O diálogo já diz antes de salvar (a leitura do Conferir).
  const ler=await e.call({action:'conferenciaEntrega',osId:'w1'},gestor);
  assert.equal(ler.inteira?.de,'2026-11-01');assert.equal(ler.inteira?.dia,'2026-11-10');
  const r1=await e.call({action:'conferenciaEntrega',osId:'w1',rev,entrega:conf('e1','2026-12-05',[sel(o,0,4),sel(o,1,1)])},gestor);
  assert.equal(r1.status,409,'a mesma entrega de novembro (selada inteira) entraria de novo em dezembro');
  assert.equal(r1.inteiraNoFechamento,true);
  assert.match(r1.error,/já entrou inteira no fechamento de 01\/11\/2026 a 30\/11\/2026/);
  assert.equal(linha(e,'w1').registro.conferenciasEntrega,undefined,'nada foi gravado');
  const dez=await e.call({action:'performancePeriodo',de:'2026-12-01',ate:'2026-12-06',notaPorValor:true},gestor);
  assert.deepEqual(dez.registros,[],'dezembro não conta de novo a O.S. de novembro');
});

test('D1: sem falso positivo: a O.S. reaberta que não está em selo nenhum, e a que entrou no selo só por parcial, continuam conferíveis', async()=>{
  const fora=osItens('w2','90202',{finalizadaEm:'2026-12-01T15:00:00Z',finalizadoPor:'Gestor fictício'});
  const parcial=osItens('w3','90203');
  const fechada=osItens('w4','90204',{finalizadaEm:'2026-11-12T15:00:00Z',finalizadoPor:'Gestor fictício'});
  const e=await edge('pcp-sync',banco([fora,parcial,fechada],{painel_ordens:[fora,parcial,fechada].map(o=>({numero:o.numero,valor:8500}))}));
  // A parcial de novembro (por item) entra no selo pela entrega, não inteira.
  relogio(e,'2026-11-20T12:00:00Z');
  assert.equal((await e.call({action:'conferenciaEntrega',osId:'w3',rev:1,entrega:conf('p1','2026-11-20',[sel(parcial,0,2)])},gestor)).ok,true);
  relogio(e,'2026-12-02T12:00:00Z');
  const selo=await fecharNovembro(e);
  assert.deepEqual(selo.registros.map(r=>r.id).sort(),['w3::entrega:p1','w4']);
  relogio(e,'2026-12-03T12:00:00Z');
  const a=await e.call({action:'conferenciaEntrega',osId:'w2',rev:1,entrega:conf('e1','2026-12-02',[sel(fora,0,4),sel(fora,1,1)])},gestor);
  assert.equal(a.ok,true,JSON.stringify(a));
  const b=await e.call({action:'conferenciaEntrega',osId:'w3',rev:linha(e,'w3').registro.rev,entrega:conf('p2','2026-12-03',[sel(parcial,0,2),sel(parcial,1,1)])},gestor);
  assert.equal(b.ok,true,JSON.stringify(b));
  // A que entrou inteira continua presa, reaberta ou não.
  const c=await e.call({action:'conferenciaEntrega',osId:'w4',rev:1,entrega:conf('e1','2026-12-03',[sel(fechada,0,4)])},gestor);
  assert.equal(c.status,409);assert.equal(c.inteiraNoFechamento,true);
});

test('D1: vale a última revisão do período: a O.S. que saiu do selo na revisão nova não fica presa', async()=>{
  const o=osItens('w5','90205',{finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício'});
  const e=await edge('pcp-sync',banco([o],{painel_ordens:[{numero:o.numero,valor:8500}]}));
  relogio(e,'2026-12-02T12:00:00Z');
  await fecharNovembro(e);
  // Reaberta, a O.S. sai da apuração de novembro; a revisão 2 não a tem.
  await e.call({action:'upsert',os:{...linha(e,'w5').registro,finalizadaEm:'',finalizadoPor:''}},gestor);
  relogio(e,'2026-12-03T12:00:00Z');
  // A revisão 2 de novembro, sem a O.S. (a cobertura vazia pede a frase).
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.deepEqual(fonte.registros,[]);
  const f1=(await e.call({action:'performanceFechamentos',...NOV},gestor)).fechamentos[0];
  e.db.pcp_registros.push({colecao:'performance_fechamentos',id:'2026-11-01:2026-11-30:000002',apagado:false,atualizado_em:'2026-12-03T12:00:00Z',
    // Revisão da onda volta (D4): o fechamento guarda a lista das O.S. inteiras (inteiras); a revisão fabricada aqui leva a dela, vazia.
    registro:{...f1,id:'2026-11-01:2026-11-30:000002',revisao:2,anterior:f1.id,registros:[],inteiras:[],hash:fonte.hash,fechadoEm:'2026-12-03T12:00:00Z'}});
  const r=await e.call({action:'conferenciaEntrega',osId:'w5',rev:linha(e,'w5').registro.rev,entrega:conf('e1','2026-12-03',[sel(o,0,4)])},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
});
