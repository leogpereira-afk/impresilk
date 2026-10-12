'use strict';
/* C1 DA AUDITORIA DE 12/10/2026: a gestão cancela a O.S. enquanto o celular
   está sem sinal; o celular volta e manda a finalização e o carro liberado
   pela fila. O trabalho ficava gravado sem aviso a ninguém (no fbc56b9: 200,
   avisos vazios, nenhuma marca). Agora grava do mesmo jeito (nunca se perde,
   nunca 4xx), responde com o aviso ao celular, marca a O.S. para a gestão
   (trabalhoCancelada, só o servidor escreve) e a ficha da gestão mostra.
   Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {edge}=require('./helpers/edge.cjs');
const diaSP=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE=diaSP(Date.now());
const ficha=(id,nome,apelido,cpf)=>({colecao:'colaboradores',id,apagado:false,registro:{id,nome,apelido,cpf}});
const FICHAS=[ficha('a','Ana Ficticia','ana','10000111111'),ficha('b','Bruno Ficticio','bruno','10000222222'),ficha('g','Gestor Teste','gestor','11122233344')];
const agoraISO=()=>new Date().toISOString();
const base=()=>({id:'1',rev:1,numero:'8101',tipo:'externo',cliente:'Cliente Ficticio',equipe:['100001','100002'],liberadoPCP:true,
  confirmacao:'Confirmado',confEm:agoraISO(),instalacao:{data:HOJE,periodo:'Manhã'},valorTotal:'1500',itens:[{uid:'u1',item:'1',descricao:'Placa ficticia',qtde:'1',valorUnit:'1500',subtotal:'1500'}]});
const banco=()=>({pcp_registros:[{id:'1',colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:base()}],registros:structuredClone(FICHAS),
  pcp_config_global:[{id:true,config:{instaladores:['Ana','Bruno'],performancePCP:{equipes:[],participacoes:[]}},atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const ana={nome:'Ana',sub:'Ana',id:'100001',papel:'montagem',montagemIndividual:true};
const reg=e=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id==='1').registro;
const foto=n=>'foto_1_'+(1760000000000+n)+'_abc'+n;
const doDia=o=>({...o,checkin:'08:10',fotosCheckinIds:[foto(1)],carroLiberado:true,carroLiberadoEm:agoraISO(),carroLiberadoPor:'Ana',horaSaida:'08:00',saidaEm:HOJE+'T08:00:00',
  itens:o.itens.map(i=>({...i,statusInst:'ok',pronto:true})),horaRetorno:'17:00',retornoEm:HOJE+'T17:00:00',fotosRetornoIds:[foto(2)],instalacaoOK:true,
  finalizadaEm:agoraISO(),finalizadoPor:'Ana',atualizadoEm:agoraISO()});
async function cancelarComCelularSemSinal(){
  const e=await edge('pcp-sync',banco());
  const cel=structuredClone((await e.call({action:'list',escopo:'abertas'},ana)).os.find(o=>o.id==='1'));
  const g=structuredClone(reg(e));
  const rc=await e.call({action:'upsert',os:{...g,cancelamento:{cancelar:true,motivo:'Cliente desistiu do servico ficticio'},atualizadoEm:agoraISO()}},gestor);
  assert.equal(rc.status,200,JSON.stringify(rc));
  return {e,cel};
}

test('C1: a finalização e o carro liberado que chegam pela fila numa O.S. cancelada ficam gravados, com aviso ao celular e a marca para a gestão',async()=>{
  const {e,cel}=await cancelarComCelularSemSinal();
  const r=await e.call({action:'upsert',os:doDia(cel)},ana);
  assert.equal(r.status,200,'nunca 4xx na fila');
  const f=reg(e);
  assert.equal(f.cancelamento.ativo,true,'continua cancelada');
  assert.ok(f.finalizadaEm,'o trabalho ficou guardado');assert.equal(f.carroLiberado,true);
  assert.ok((r.avisos||[]).includes('Esta O.S. foi cancelada enquanto você estava sem sinal; o que você registrou ficou guardado (a finalização e o carro liberado). Fale com o PCP.'),JSON.stringify(r.avisos));
  assert.equal(f.trabalhoCancelada.length,1);
  assert.deepEqual(f.trabalhoCancelada[0].oque,['finalizacao','carro']);
  assert.equal(f.trabalhoCancelada[0].porId,'100001');
  assert.ok(!('porId' in r.os.trabalhoCancelada[0]),'o ID não desce para o celular');
  // A gestão vê a marca (com o ID) e o aviso próprio quando é ela quem grava trabalho numa cancelada.
  const g=(await e.call({action:'list',escopo:'tudo'},gestor)).os.find(o=>o.id==='1');
  assert.equal(g.trabalhoCancelada[0].porId,'100001');
});

test('C1: o aparelho não escreve nem apaga a marca; a gestão que grava trabalho numa cancelada recebe o aviso dela',async()=>{
  const {e,cel}=await cancelarComCelularSemSinal();
  await e.call({action:'upsert',os:{...doDia(cel)}},ana);
  // Uma cópia que manda a marca vazia ou forjada não muda nada.
  const atual=structuredClone(reg(e));
  await e.call({action:'upsert',os:{...atual,trabalhoCancelada:[],obsPCP:'nota'}},gestor);
  assert.equal(reg(e).trabalhoCancelada.length,1,'não apaga');
  const e2=await edge('pcp-sync',banco());
  await e2.call({action:'upsert',os:{...structuredClone(reg(e2)),trabalhoCancelada:[{oque:['carro'],por:'forjado'}]}},gestor);
  assert.ok(!('trabalhoCancelada' in reg(e2)),'não escreve');
  // A gestão libera o carro de uma cancelada: aviso para ela.
  const {e:e3}=await cancelarComCelularSemSinal();
  const r=await e3.call({action:'upsert',os:{...structuredClone(reg(e3)),carroLiberado:true,carroLiberadoEm:agoraISO(),carroLiberadoPor:'Gestor Teste'}},gestor);
  assert.ok((r.avisos||[]).some(a=>/^Trabalho registrado numa O\.S\. cancelada: o carro liberado ficou gravado\./.test(a)),JSON.stringify(r.avisos));
});

test('C1: a ficha da gestão mostra "Trabalho registrado numa O.S. cancelada"',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const i=src.indexOf('function statusEntregaFichaHTML'),j=src.indexOf('/* ── OCORRÊNCIAS, RETORNO ANTECIPADO');
  assert.ok(i>0&&j>i);
  const ctx={esc:s=>String(s??''),fmtDataBR:()=>'12/10/2026',statusEntregaDe:()=>({estado:'cancelado',rotulo:'Cancelada',motivo:'cancelada pela gestão',aplicaveis:[],cancelamento:{origem:'manual'}}),
    podeCancelarOS:()=>false,seloStatusEntregaHTML:()=>'',retornoFichaHTML:()=>'',foraDoProgramaFicha:()=>false,ocorrenciasFichaHTML:()=>''};
  vm.createContext(ctx);vm.runInContext(src.slice(i,j),ctx);
  const html=ctx.statusEntregaFichaHTML({cancelamento:{ativo:true},trabalhoCancelada:[{oque:['finalizacao','carro'],por:'Ana',em:'2026-10-12T20:00:00Z'}]});
  assert.match(html,/<strong>Trabalho registrado numa O\.S\. cancelada:<\/strong> finalização e carro liberado por Ana em 12\/10\/2026\. O que foi registrado ficou guardado; confira se a O\.S\. continua cancelada\./);
});
