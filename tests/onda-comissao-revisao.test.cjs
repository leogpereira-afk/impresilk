'use strict';
/* REVISÃO DA ONDA COMISSÃO (12/10/2026): as ressalvas das duas revisões
   ("com dinheiro" e "com uso"), uma por teste, cada uma começando pelo caso
   ruim. O servidor real (pcp-sync) com banco falso e a tela (performance.js,
   comissao.js e comissao-ui.js) em vm. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const C=require('../comissao.js');
const {edge}=require('./helpers/edge.cjs');

/* ------------------------------------------------- o servidor real, fictício */
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',id:'044455',exp:EXP};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
const osF=id=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal:120000}});
async function servidor(){
  const oss=[osF('os1')];
  const e=await edge('pcp-sync',{pcp_registros:oss,
    registros:[1,2].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor',em:'2026-11-10'}))}}}],painel_ordens:[]});
  relogio(e,'2026-12-02T12:00:00Z');return e;
}
async function fechar(e){
  const f=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const r=await e.call({action:'performanceFechar',...NOV,hash:f.hash,anterior:'',requestId:'fechar-revisao-0001',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));return r.fechamento;
}
const entrada=(f,modo)=>({config:modo==='efetivo'?{modo,inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia',criteriosExtras:'somente_falha_comprovada'}:{modo,criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
async function aprovada(e,f,modo='efetivo'){
  const p=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f.id,anterior:'',entrada:entrada(f,modo),motivo:'Prévia fictícia',requestId:'previa-revisao-0001'},gestor);assert.equal(p.ok,true,JSON.stringify(p));
  const a=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-revisao-0001'},gestor);assert.equal(a.status,200,JSON.stringify(a));
  return a.revisao;
}
const docsDe=e=>e.db.pcp_registros.filter(r=>r.colecao==='performance_documentos');

/* ------------------------------------------------------------------ achado 1 */
test('revisão comissão: do documento 1001 em diante o PDF oficial continua numerando (o último id do ano + 1) e o pedido repetido é achado no banco',async()=>{
  const e=await servidor();const f=await fechar(e);
  // O caso ruim: 1001 documentos de 2026 já emitidos (a leitura antiga parava em 1000 e repetia o número).
  for(let i=1;i<=1001;i++){const id='DOC-2026-'+String(i).padStart(6,'0');
    e.db.pcp_registros.push({colecao:'performance_documentos',id,apagado:false,atualizado_em:'2026-12-01',registro:{id,tipo:'fechamento',...NOV,fechamentoId:f.id,requestId:'antigo-documento-'+String(i).padStart(4,'0')}});}
  // E um de outro ano, com número maior, que não conta para 2026.
  e.db.pcp_registros.push({colecao:'performance_documentos',id:'DOC-2025-999990',apagado:false,atualizado_em:'2025-12-01',registro:{id:'DOC-2025-999990',tipo:'fechamento',requestId:'outro-ano-000001'}});
  const r1=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-novo-01'},gestor);
  assert.equal(r1.status,200,JSON.stringify(r1));assert.equal(r1.documento.id,'DOC-2026-001002');
  const r2=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-novo-02'},gestor);
  assert.equal(r2.status,200,JSON.stringify(r2));assert.equal(r2.documento.id,'DOC-2026-001003');
  assert.ok(r2.documento.emitidosAntes>=1000,'conta os documentos do mesmo fechamento pela contagem do banco');
  // O pedido repetido de um documento além da milésima linha devolve o mesmo, sem gravar outro.
  const antes=docsDe(e).length;
  const rep=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'antigo-documento-1001'},gestor);
  assert.equal(rep.status,200,JSON.stringify(rep));assert.equal(rep.repetido,true);assert.equal(rep.documento.id,'DOC-2026-001001');
  assert.equal(docsDe(e).length,antes);
  // O primeiro do ano sai como 000001.
  const e2=await servidor();const f2=await fechar(e2);
  const p=await e2.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f2.id,requestId:'doc-revisao-prim-01'},gestor);
  assert.equal(p.documento.id,'DOC-2026-000001');assert.equal(p.documento.emitidosAntes,0);
  // O código não lê mais a coleção inteira com .limit(1000).
  assert.doesNotMatch(ler('supabase/functions/pcp-sync/index.ts'),/eq\("colecao","performance_documentos"\)\.order\("id"\)\.limit\(1000\)/);
});

/* ------------------------------------------------------------------ achado 2 */
test('revisão comissão: o mesmo requestId com outro pedido é 409, e não o documento antigo calado',async()=>{
  const e=await servidor();const f=await fechar(e);const a=await aprovada(e,f);
  const d1=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d1.status,200);
  // O caso ruim: outro tipo de documento com o mesmo requestId.
  const d2=await e.call({action:'performanceDocumento',...NOV,tipo:'comissao',fechamentoId:f.id,revisaoId:a.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d2.status,409,JSON.stringify(d2));assert.equal(d2.documento,undefined);
  assert.match(d2.error,/Este pedido já emitiu o documento DOC-2026-000001 de outro conteúdo/);
  // O mesmo pedido de novo (a resposta se perdeu): o mesmo documento, sem gravar outro.
  const d3=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d3.status,200);assert.equal(d3.repetido,true);assert.equal(d3.documento.id,d1.documento.id);
  assert.equal(docsDe(e).length,1);
  // O da comissão também: mesmo requestId, outra revisão ou outro tipo, 409.
  const c1=await e.call({action:'performanceDocumento',...NOV,tipo:'comissao',fechamentoId:f.id,revisaoId:a.id,requestId:'doc-revisao-comis-1'},gestor);
  assert.equal(c1.status,200);
  const c2=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-comis-1'},gestor);
  assert.equal(c2.status,409);
});

/* ----------------------------------------------------------------- achado 10 */
test('revisão comissão: o ensaio do backup exige as 3 coleções novas na contagem, mesmo com zero linhas',()=>{
  const E=require('../scripts/ensaio-backup-pcp.cjs');
  const novas=['performance_comissao_exportacoes','performance_documentos','performance_retrato_logos'];
  for(const c of novas)assert.ok(E.OBRIGATORIAS.includes(c),c);
  const zero=Object.fromEntries(E.OBRIGATORIAS.map(c=>[c,{total:0,apagados:0}]));
  const pacote=fim=>E.montarPacote({pcp_registros:[],pcp_demandas:[],pcp_meta:[],cfg:{},cfgVersao:'',formato:'pcp-exportacao-1',paginas:1,
    contagemInicio:{pcp_registros:{...zero},pcp_demandas:0,pcp_meta:0},contagemFim:{pcp_registros:fim,pcp_demandas:0,pcp_meta:0}},{});
  // O caso ruim: a contagem sem a coleção dos documentos oficiais passava.
  const sem={...zero};delete sem.performance_documentos;
  assert.throws(()=>E.validarPacote(pacote(sem)),/A contagem do PCP não traz a coleção performance_documentos\./);
  // Com as três em zero (como hoje), passa.
  assert.doesNotThrow(()=>E.validarPacote(pacote({...zero})));
});
