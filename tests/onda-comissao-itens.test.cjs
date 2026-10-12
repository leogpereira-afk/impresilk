'use strict';
/* ONDA COMISSÃO (fila única de 11/10/2026), itens 3 em diante: o CSV, quem
   fechou e quem aprovou pelo ID, o registro da exportação, os documentos, a
   fita dos meses, o retrato no fechamento, o líquido mudado depois da
   aprovação e a prévia depois da compensação. Cada teste começa pelo caso
   ruim. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../comissao.js');

/* ------------------------------------------------------------------ item 3 */
const aprovacao=(pessoas,extra={})=>({id:'2026-11-01:2026-11-30:000002',de:'2026-11-01',ate:'2026-11-30',tipo:'aprovacao',...extra,
  apuracao:{aprovavel:true,config:{modo:'efetivo'},fechamentoId:'2026-11-01:2026-11-30:000001',anteriorAprovacao:null,
    ajustes:pessoas.map(([pessoaId,nome,centavos])=>({pessoaId,nome,tipo:'externa',centavos,diferencaCentavos:centavos}))}});
test('item 3: o CSV leva o ID de 6 dígitos e o mês como texto para o Excel (="012345"), e o resto continua protegido',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const r=aprovacao([['012345','Pessoa fictícia',57600],['100002','=HYPERLINK("x")',38400]]);
  for(const M of [C,S]){
    const csv=M.csv(r),linhas=csv.replace(/^﻿/,'').split('\r\n');
    assert.equal(linhas[0],'"Revisão";"Mês";"Fechamento";"Aprovação anterior";"Pessoa ID";"Nome";"Tipo";"Total atual (R$)";"Diferença a conciliar (R$)"');
    assert.equal(linhas[1],'"2026-11-01:2026-11-30:000002";"=""2026-11""";"2026-11-01:2026-11-30:000001";"";"=""012345""";"Pessoa fictícia";"externa";"576,00";"576,00"');
    // O nome que parece fórmula continua com a proteção (o apóstrofo na frente).
    assert.match(linhas[2],/;"'=HYPERLINK\(""x""\)";/);
  }
  assert.equal(C.csv(r),S.csv(r));
  // ID que não é de 6 dígitos não vira fórmula (nunca deveria chegar aqui: o motor só paga ID).
  assert.match(C.csv(aprovacao([['12345','Pessoa fictícia',100]])),/;"12345";/);
});

/* ------------------------------------------------- o servidor real, fictício */
const {edge}=require('./helpers/edge.cjs');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
// O Thiago fictício (pcp) tem o ID no crachá; o dono fictício (admin) é achado pelo apelido da ficha.
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',id:'044455',exp:EXP};
const dono={papel:'admin',nome:'Dono fictício',sub:'dono',exp:EXP};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
const osF=(id,extra={})=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal:120000,...extra}});
async function servidor(oss=[osF('os1')],{hoje='2026-12-02T12:00:00Z',periodoOS}={}){
  const e=await edge('pcp-sync',{
    pcp_registros:oss,
    registros:[...[1,2,3].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
      {colecao:'colaboradores',id:'pd',apagado:false,registro:{id:'pd',nome:'Dono fictício',apelido:'dono',cpf:'05566677788'}}],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor',em:'2026-11-10'}))}}}],
    painel_ordens:[]});
  relogio(e,hoje);
  return e;
}
const reg=(e,id)=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
async function fechar(e,per=NOV,quem=gestor,n=1){
  const fonte=await e.call({action:'performancePeriodo',...per,notaPorValor:true},quem);
  assert.equal(fonte.status,200,JSON.stringify(fonte));
  const hist=await e.call({action:'performanceFechamentos',...per},quem);
  const r=await e.call({action:'performanceFechar',...per,hash:fonte.hash,anterior:hist.fechamentos[0]?.id||'',requestId:'fechar-itens-'+per.de+'-'+n,motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},quem);
  assert.equal(r.ok,true,JSON.stringify(r));
  return r.fechamento;
}
const entrada=(f,modo='efetivo')=>({config:modo==='efetivo'?{modo,inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'}:{modo,criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
async function previa(e,f,{per=NOV,quem=gestor,n=1,modo='efetivo'}={}){
  const lista=await e.call({action:'performanceComissaoListar',...per},quem);
  const p=await e.call({action:'performanceComissaoNova',...per,fechamentoId:f.id,anterior:lista.revisoes[0]?.id||'',entrada:entrada(f,modo),motivo:'Prévia fictícia',requestId:'previa-itens-'+per.de+'-'+n},quem);
  assert.equal(p.ok,true,JSON.stringify(p));
  return p.revisao;
}
const aprovar=(e,p,{per=NOV,quem=gestor,n=1}={})=>e.call({action:'performanceComissaoAprovar',...per,anterior:p.id,hash:p.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-itens-'+per.de+'-'+n},quem);
const exportar=(e,r,{per=NOV,quem=gestor}={})=>e.call({action:'performanceComissaoExportar',...per,id:r.id},quem);

/* ------------------------------------------------------ item 4 (item 7 da fila) */
test('item 4: quem fechou, quem fez a prévia, quem aprovou e quem preparou a compensação ficam gravados pelo ID de 6 dígitos, além do nome',async()=>{
  const e=await servidor();
  const f=await fechar(e);
  assert.equal(f.fechadoPor,'Gestor fictício');
  assert.equal(f.fechadoPorId,'044455','o selo do mês guarda o ID de quem fechou');
  const p=await previa(e,f);
  assert.deepEqual(p.autor,{login:'gestor',nome:'Gestor fictício',porId:'044455'});
  // O dono fictício (admin) não tem o ID no crachá: sai da ficha pelo apelido, a régua do diário.
  const a=await aprovar(e,p,{quem:dono});
  assert.equal(a.status,200,JSON.stringify(a));
  assert.deepEqual(a.revisao.autor,{login:'dono',nome:'Dono fictício',porId:'055666'});
  const lista=await e.call({action:'performanceComissaoListar',...NOV},gestor);
  const c=await e.call({action:'performanceComissaoNova',...NOV,anterior:lista.revisoes[0].id,compensarId:a.revisao.id,motivo:'Compensação fictícia',requestId:'compensar-itens-1'},gestor);
  assert.equal(c.ok,true,JSON.stringify(c));
  assert.equal(c.revisao.autor.porId,'044455');
  // O hash do selo e o da revisão não mudam por isso (fora do conteúdo).
  assert.equal(e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.hash,f.hash);
});

/* ---------------------------------------------- M5 e D-013 ("THIAGO APROVA") */
test('M5 (D-013): só pcp e admin aprovam; os outros papéis e a máquina são recusados na porta; o pcp aprova a própria prévia',async()=>{
  const e=await servidor();
  const f=await fechar(e);
  const p=await previa(e,f);
  for(const quem of [{papel:'montagem',nome:'Montagem fictícia',sub:'montagem',exp:EXP},{papel:'operacao',nome:'Operação fictícia',sub:'operacao',exp:EXP},{papel:'comercial',nome:'Comercial fictício',sub:'comercial',exp:EXP},'machine']){
    const r=await aprovar(e,p,{quem,n:2});
    assert.equal(r.status,403,'papel '+(quem.papel||quem)+': '+JSON.stringify(r));
  }
  assert.equal(e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao').length,1,'nada foi gravado');
  // O Thiago fictício (pcp) aprova a prévia que ele mesmo montou.
  const a=await aprovar(e,p,{n:3});
  assert.equal(a.status,200,JSON.stringify(a));
  assert.equal(a.revisao.autor.porId,p.autor.porId);
});

/* ------------------------------------------------- item 5 (M6, item 25 da fila) */
test('item 5 (M6): exportar grava o evento (quem, quando, impressão digital do CSV) e a diferença contra a última exportada',async()=>{
  const e=await servidor();
  const f=await fechar(e);
  const p1=await previa(e,f);
  const a1=await aprovar(e,p1);
  assert.equal(a1.status,200,JSON.stringify(a1));
  // A aprovação 1 nunca é exportada; uma prévia nova é aprovada por cima dela.
  const p2=await previa(e,f,{n:2});
  const a2=await aprovar(e,p2,{n:2,quem:dono});
  assert.equal(a2.status,200,JSON.stringify(a2));
  const eventos=()=>e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_exportacoes').map(r=>r.registro);
  assert.equal(eventos().length,0);
  const x1=await exportar(e,a2.revisao);
  assert.equal(x1.status,200,JSON.stringify(x1));
  assert.equal(eventos().length,1,'o caso ruim: exportar não deixava rastro');
  const ev1=eventos()[0];
  assert.equal(ev1.revisaoId,a2.revisao.id);assert.equal(ev1.csvSha256,x1.csvSha256);
  assert.deepEqual(ev1.autor,{login:'gestor',nome:'Gestor fictício',porId:'044455'});
  assert.equal(ev1.anterior,null);
  assert.equal(ev1.anteriorNaoExportada,true,'a aprovação 1 nunca foi exportada: a coluna do CSV engana');
  assert.deepEqual(ev1.diferencas.map(d=>[d.pessoaId,d.tipo,d.anteriorCentavos,d.centavos,d.diferencaCentavos]),[['100001','externa',0,72000,72000],['100002','externa',0,48000,48000]]);
  // A mesma aprovação exportada de novo: outro evento, contra a primeira exportação, diferença zero.
  const x2=await exportar(e,a2.revisao);
  assert.equal(x2.status,200);assert.equal(x2.csv,x1.csv);
  const ev2=eventos()[1];
  assert.equal(ev2.anterior.id,ev1.id);
  assert.ok(ev2.diferencas.every(d=>d.diferencaCentavos===0));
  // Compensação aprovada e exportada: a diferença é contra a última exportada (negativa).
  const lista=await e.call({action:'performanceComissaoListar',...NOV},gestor);
  assert.deepEqual(lista.exportacoes.map(x=>x.id),[ev1.id,ev2.id],'a lista do período traz os eventos');
  const c=await e.call({action:'performanceComissaoNova',...NOV,anterior:lista.revisoes[0].id,compensarId:a2.revisao.id,motivo:'Compensação fictícia',requestId:'compensar-itens-5'},gestor);
  const ac=await aprovar(e,c.revisao,{n:5});
  assert.equal(ac.status,200,JSON.stringify(ac));
  const x3=await exportar(e,ac.revisao);
  assert.equal(x3.status,200,JSON.stringify(x3));
  assert.deepEqual(x3.exportacao.diferencas.map(d=>d.diferencaCentavos),[-72000,-48000]);
  assert.equal(x3.exportacao.anteriorNaoExportada,false);
  // Só a gestão lê: a lista é da comissão (admin e pcp).
  assert.equal((await e.call({action:'performanceComissaoListar',...NOV},{papel:'montagem',nome:'Montagem fictícia',sub:'montagem',exp:EXP})).status,403);
});
test('item 5: as duas cópias calculam a mesma diferença contra a última exportada',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const t=[{pessoaId:'100001',nome:'A',tipo:'externa',centavos:500},{pessoaId:'100003',nome:'C',tipo:'interna',centavos:100}];
  const ant=[{pessoaId:'100001',nome:'A',tipo:'externa',centavos:300},{pessoaId:'100002',nome:'B',tipo:'externa',centavos:200}];
  const d=C.diferencaContraExportada(t,ant);
  assert.deepEqual(d.map(x=>[x.pessoaId,x.diferencaCentavos]),[['100001',200],['100002',-200],['100003',100]]);
  assert.deepEqual(d,S.diferencaContraExportada(t,ant));
  assert.deepEqual(C.diferencaContraExportada(t,null).map(x=>x.diferencaCentavos),[500,100]);
});
