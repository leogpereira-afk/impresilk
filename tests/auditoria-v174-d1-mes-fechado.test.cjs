'use strict';
/* D1 DA AUDITORIA DE 12/10/2026: mudar o valor de uma O.S. cuja entrega está
   num mês FECHADO (e já exportado) gravava calado, também na O.S. inteira (sem
   conferência por entrega); a fita dos meses continuava "enviado". Agora a
   gravação vale (nunca 422), a gestão recebe o aviso de que o mês fechado não
   se recalcula e a mudança só entra com uma nova revisão, e a fita marca "mudou
   depois do envio". Começa pelo caso ruim (no fbc56b9: nenhum aviso, fita
   "enviado"). Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',id:'044455',exp:EXP};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
const osF=(id,extra={})=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,rev:1,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal:120000,...extra}});
async function servidor(oss){
  const e=await edge('pcp-sync',{pcp_registros:oss,
    registros:[1,2].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor',em:'2026-11-10'}))}}}],
    painel_ordens:[]});
  relogio(e,'2026-12-02T12:00:00Z');
  return e;
}
async function fecharAprovarExportar(e,{exportar=true}={}){
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const f=(await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-d1-0001',motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor)).fechamento;
  assert.ok(f,'fechou');
  if(!exportar)return f;
  const entrada={config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
    decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
    entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))};
  const p=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f.id,anterior:'',entrada,motivo:'Prévia fictícia',requestId:'previa-d1-0001'},gestor);
  assert.equal(p.ok,true,JSON.stringify(p));
  const a=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-d1-0001'},gestor);
  assert.equal(a.ok,true,JSON.stringify(a));
  assert.equal((await e.call({action:'performanceComissaoExportar',...NOV,id:a.revisao.id},gestor)).status,200);
  return f;
}
const reg=(e,id)=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
const gravar=(e,id,mudanca)=>e.call({action:'upsert',os:{...structuredClone(reg(e,id)),...mudanca}},gestor);
const fita=async e=>Object.fromEntries((await e.call({action:'performanceMeses'},gestor)).meses.map(m=>[m.mes,m]));

test('D1: o valor da O.S. inteira de mês fechado e exportado muda com aviso à gestão, e a fita marca "mudou depois do envio"',async()=>{
  const e=await servidor([osF('os1')]);
  await fecharAprovarExportar(e);
  assert.equal((await fita(e))['2026-11'].estado,'enviado');
  relogio(e,'2026-12-05T12:00:00Z');
  const r=await gravar(e,'os1',{valorTotal:150000});
  assert.equal(r.status,200,JSON.stringify(r));
  assert.equal(reg(e,'os1').valorTotal,150000,'a gravação vale');
  assert.ok((r.avisos||[]).some(a=>/^Este mês já foi fechado e exportado \(01\/11\/2026 a 30\/11\/2026, revisão 1\): o valor desta O\.S\. mudou e a mudança foi gravada, mas o mês fechado não se recalcula\. Ela só entra no pagamento com uma nova revisão do fechamento e uma nova exportação\.$/.test(a)),JSON.stringify(r.avisos));
  const m=(await fita(e))['2026-11'];
  assert.equal(m.estado,'enviado');
  assert.deepEqual(m.mudouDepois,{os:1,ultimaEm:'2026-12-05T12:00:00.000Z',depoisDoEnvio:true});
  // Mudar outra coisa (fora do dinheiro) não avisa.
  const r2=await gravar(e,'os1',{obsPCP:'nota fictícia'});
  assert.ok(!(r2.avisos||[]).some(a=>/mês já foi fechado/.test(a)));
});

test('D1: mês só fechado (sem exportação) avisa sem falar em exportação; mês aberto não avisa',async()=>{
  const e=await servidor([osF('os1'),osF('os2',{finalizadaEm:'2026-12-01T15:00:00Z'})]);
  await fecharAprovarExportar(e,{exportar:false});
  relogio(e,'2026-12-03T12:00:00Z');
  const r=await gravar(e,'os1',{valorTotal:100});
  assert.ok((r.avisos||[]).some(a=>/^Este mês já foi fechado \(01\/11\/2026 a 30\/11\/2026, revisão 1\):.*nova revisão do fechamento\.$/.test(a)),JSON.stringify(r.avisos));
  assert.equal((await fita(e))['2026-11'].mudouDepois.depoisDoEnvio,false);
  const aberto=await gravar(e,'os2',{valorTotal:100});
  assert.ok(!(aberto.avisos||[]).some(a=>/mês já foi fechado/.test(a)),'dezembro está aberto');
});

test('D1: a fita do aparelho diz "mudou depois do envio" junto do estado',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const src=fs.readFileSync(path.join(__dirname,'..','performance.js'),'utf8');
  const i=src.indexOf('function perfFitaMudouTxt'),j=src.indexOf('/* Cada estado com a sua cor');
  const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(i,j),ctx);
  assert.equal(ctx.perfFitaEstadoTxt({estado:'enviado',enviado:{vezes:1},mudouDepois:{os:2,depoisDoEnvio:true}}),'Enviado: exportado 1 vez; mudou depois do envio (2 O.S.): falta uma nova revisão');
  assert.equal(ctx.perfFitaEstadoTxt({estado:'enviado',enviado:{vezes:1}}),'Enviado: exportado 1 vez');
});
