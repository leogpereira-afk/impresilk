'use strict';
/* A1 (auditoria do PCP v164, 11/10/2026): A COMISSÃO APROVA E EXPORTA O MÊS
   FECHADO PELA TELA. A tela fecha com a nota por valor (performance.js manda
   notaPorValor:true na apuração e no fechamento) e essa marca entra no hash do
   selo (regraNota 'nota-valor-1'). Aprovar e Exportar recalculavam a fonte com
   o corpo do pedido, que não traz a marca: o hash nunca batia e a resposta era
   sempre 409 "A fonte mudou depois do fechamento". Aqui o fluxo inteiro passa
   pelo servidor real (helpers/edge.cjs) com os MESMOS pedidos da tela
   (performance.js e comissao-ui.js), começando pelo caso ruim. A proteção
   continua: mudança real na fonte depois do fechamento ainda dá 409.
   Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const PERF=require('../performance.js');

// O crachá vale até depois do relógio do servidor (que corre no futuro, abaixo).
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000)};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
// O relógio do servidor: só se fecha período que já terminou.
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const NOVEMBRO={periodo:{de:'2026-11-01',ate:'2026-11-30'},hoje:'2026-12-02T12:00:00Z',finalizada:'2026-11-10T15:00:00Z'};
const OUTUBRO={periodo:{de:'2026-10-01',ate:'2026-10-31'},hoje:'2026-11-02T12:00:00Z',finalizada:'2026-10-20T15:00:00Z'};
const osFicticia=(id,finalizadaEm,valorTotal)=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,numero:id,tipo:'externo',cliente:'Cliente fictício',finalizadaEm,equipe:['100001','100002'],valorTotal}});

async function servidor(mes){
  const e=await edge('pcp-sync',{
    pcp_registros:[osFicticia('os1',mes.finalizada,120000)],
    registros:[1,2,3].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:'os1',membros,por:'Gestor',em:mes.finalizada.slice(0,10)}]}}}],
    painel_ordens:[]});
  relogio(e,mes.hoje);
  return e;
}
const os1=e=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id==='os1').registro;

// performance.js: perfCarregarFonte (a apuração) e o formulário "Confirmar fechamento".
async function fecharComoATela(e,periodo,{notaPorValor=true}={}){
  const marca=notaPorValor?{notaPorValor:true}:{};
  const fonte=await e.call({action:'performancePeriodo',...periodo,...marca},gestor);
  assert.equal(fonte.status,200,JSON.stringify(fonte));
  const hist=await e.call({action:'performanceFechamentos',...periodo},gestor);
  const r=await e.call({action:'performanceFechar',...fonte.periodo,hash:fonte.hash,anterior:hist.fechamentos[0]?.id||'',requestId:'fechar-tela-'+periodo.de,motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,...marca},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));
  return r.fechamento;
}
const entrada=(fechamento,modo)=>({
  config:modo==='efetivo'?{modo,inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'}:{modo,criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(fechamento.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(fechamento.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
// comissao-ui.js: "Salvar prévia calculada no servidor", "Confirmar aprovação" e "Exportar", com os pedidos da tela.
async function previaComoATela(e,periodo,fechamento,modo='efetivo'){
  const lista=await e.call({action:'performanceComissaoListar',...periodo},gestor);
  assert.equal(lista.status,200,JSON.stringify(lista));
  const p=await e.call({action:'performanceComissaoNova',...periodo,fechamentoId:fechamento.id,anterior:lista.revisoes[0]?.id||'',entrada:entrada(fechamento,modo),motivo:'Prévia fictícia',requestId:'previa-tela-'+periodo.de},gestor);
  assert.equal(p.ok,true,JSON.stringify(p));
  assert.equal(p.revisao.apuracao.aprovavel,true,JSON.stringify(p.revisao.apuracao.pendencias));
  return p.revisao;
}
const aprovarComoATela=(e,periodo,r,n=1,corpo={})=>e.call({action:'performanceComissaoAprovar',...periodo,anterior:r.id,hash:r.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-tela-'+n+'-'+periodo.de,...corpo},gestor);
const exportarComoATela=(e,periodo,r,corpo={})=>e.call({action:'performanceComissaoExportar',...periodo,id:r.id,...corpo},gestor);
// O CSV em centavos por pessoa e tipo (a coluna "Total atual (R$)").
// Pelas colunas do cabeçalho; o ID vai como texto para o Excel (="012345", item 6 da fila de 11/10/2026).
function csvCentavos(csv){
  const celula=c=>c.replace(/^"|"$/g,'').replace(/""/g,'"').replace(/^="(.*)"$/,'$1');
  const [cab,...linhas]=csv.replace(/^﻿/,'').split('\r\n').map(l=>l.split(';').map(celula));
  const i=k=>cab.indexOf(k);
  return Object.fromEntries(linhas.map(c=>[c[i('Pessoa ID')]+':'+c[i('Tipo')],Math.round(Number(c[i('Total atual (R$)')].replace(',','.'))*100)]));
}
const aprovadoPorPessoa=r=>Object.fromEntries(r.apuracao.pessoas.map(p=>[p.pessoaId+':'+p.tipo,p.centavos]));

test('A1: fechado pela tela com a nota por valor, a comissão aprova e exporta o mesmo valor aprovado',async()=>{
  const {periodo}=NOVEMBRO,e=await servidor(NOVEMBRO);
  const f=await fecharComoATela(e,periodo);
  // A mesma régua que a tela exige antes de fechar (performance.js) é a que o selo grava.
  assert.equal(f.regraNota,PERF.REGRA_NOTA_VALOR);assert.equal(f.regraNota,'nota-valor-1');
  const p=await previaComoATela(e,periodo,f);
  assert.equal(p.apuracao.totalCentavos,120000);
  const a=await aprovarComoATela(e,periodo,p);
  assert.equal(a.status,200,JSON.stringify(a));
  assert.equal(a.revisao.tipo,'aprovacao');assert.equal(a.revisao.fechamentoId,f.id);
  const x=await exportarComoATela(e,periodo,a.revisao);
  assert.equal(x.status,200,JSON.stringify(x));
  const csv=csvCentavos(x.csv);
  assert.deepEqual(csv,aprovadoPorPessoa(a.revisao));
  assert.deepEqual(csv,{'100001:externa':72000,'100002:externa':48000});
  assert.equal(Object.values(csv).reduce((s,v)=>s+v,0),a.revisao.apuracao.totalCentavos);
});

test('A1: outubro em teste, fechado pela tela, aprova; exportar recusa por ser teste, e não pela fonte',async()=>{
  const {periodo}=OUTUBRO,e=await servidor(OUTUBRO);
  const f=await fecharComoATela(e,periodo);
  const p=await previaComoATela(e,periodo,f,'teste');
  const a=await aprovarComoATela(e,periodo,p);
  assert.equal(a.status,200,JSON.stringify(a));
  const x=await exportarComoATela(e,periodo,a.revisao);
  assert.equal(x.status,422,JSON.stringify(x));
  assert.match(x.error,/Outubro é teste/);
});

test('A1: selo antigo (performance-3 sem a nota por valor) continua aprovando e exportando',async()=>{
  const {periodo}=NOVEMBRO,e=await servidor(NOVEMBRO);
  const f=await fecharComoATela(e,periodo,{notaPorValor:false});
  assert.equal(f.regra,'performance-3');assert.equal('regraNota' in f,false);
  const p=await previaComoATela(e,periodo,f);
  const a=await aprovarComoATela(e,periodo,p);
  assert.equal(a.status,200,JSON.stringify(a));
  const x=await exportarComoATela(e,periodo,a.revisao);
  assert.equal(x.status,200,JSON.stringify(x));
  assert.deepEqual(csvCentavos(x.csv),aprovadoPorPessoa(a.revisao));
});

test('A1: a régua do recálculo sai do selo, nunca do corpo do pedido',async()=>{
  for(const [comNota,corpo] of [[true,{notaPorValor:false}],[false,{notaPorValor:true}]]){
    const {periodo}=NOVEMBRO,e=await servidor(NOVEMBRO);
    const f=await fecharComoATela(e,periodo,{notaPorValor:comNota});
    const p=await previaComoATela(e,periodo,f);
    const a=await aprovarComoATela(e,periodo,p,1,corpo);
    assert.equal(a.status,200,'selo '+(comNota?'com':'sem')+' nota por valor: '+JSON.stringify(a));
    const x=await exportarComoATela(e,periodo,a.revisao,corpo);
    assert.equal(x.status,200,'selo '+(comNota?'com':'sem')+' nota por valor: '+JSON.stringify(x));
  }
});

test('A1: mudança real na fonte depois do fechamento continua dando 409 em aprovar e em exportar',async()=>{
  const {periodo}=NOVEMBRO,e=await servidor(NOVEMBRO);
  const f=await fecharComoATela(e,periodo);
  const p=await previaComoATela(e,periodo,f);
  // O líquido da O.S. mudou depois do fechamento: aprovar recusa.
  os1(e).valorTotal=200000;
  const mudou=await aprovarComoATela(e,periodo,p);
  assert.equal(mudou.status,409,JSON.stringify(mudou));assert.match(mudou.error,/A fonte mudou depois do fechamento/);
  // A recusa é da mudança: com o valor de volta, a mesma prévia aprova.
  os1(e).valorTotal=120000;
  const a=await aprovarComoATela(e,periodo,p,2);
  assert.equal(a.status,200,JSON.stringify(a));
  // Uma entrega nova no período, depois da aprovação: exportar recusa.
  e.db.pcp_registros.push(osFicticia('os2','2026-11-12T15:00:00Z',5000));
  const nova=await exportarComoATela(e,periodo,a.revisao);
  assert.equal(nova.status,409,JSON.stringify(nova));assert.match(nova.error,/A fonte mudou depois do fechamento/);
  e.db.pcp_registros=e.db.pcp_registros.filter(r=>r.id!=='os2');
  assert.equal((await exportarComoATela(e,periodo,a.revisao)).status,200);
  // Selo com uma régua de nota que este servidor não conhece não bate: 409, nunca aceite.
  e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos'&&r.id===f.id).registro.regraNota='nota-valor-9';
  const desconhecida=await exportarComoATela(e,periodo,a.revisao);
  assert.equal(desconhecida.status,409,JSON.stringify(desconhecida));
});
