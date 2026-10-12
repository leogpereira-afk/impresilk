'use strict';
/* PONTA A PONTA DE DOIS MESES (D3 da auditoria de 12/10/2026; a prova da
   lente dinheiro e fechamento entra na suíte). Novembro de 2026 efetivo e
   dezembro, com o servidor real (pcp-sync) e o banco falso
   (tests/helpers/edge.cjs): conferir, cancelar e descancelar, fechar, montar a
   prévia, aprovar como titular e como substituto, exportar, emitir os
   documentos, mudar coisas no mês seguinte e fechar de novo. Os centavos (1%,
   20% da montagem interna, 60/40), as perdas e a falha comprovada, ninguém
   contado duas vezes, e o mês fechado se segura. Ajustado às regras desta
   onda: o substituto tem acesso pcp (S1), o titular continua aprovando
   enquanto o substituto vale (D-017) e o valor mudado em mês fechado e
   exportado avisa a gestão e marca a fita (D1). E o fechamento feito pela
   v174 (fbc56b9, tirado do git) recalcula igual no servidor de agora. Dados
   100% fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const RAIZ=path.join(__dirname,'..');
const {edge,ligarMarcasAntigas}=require('./helpers/edge.cjs');
ligarMarcasAntigas(); // só para o item cancelado do legado (C); a porta de hoje descarta marca nova por item (D-016)
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const CB=require('../comissao.js');

const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const conta=(papel,sub,nome)=>({papel,sub,nome,exp:EXP});
const TITULAR=conta('pcp','titular-ficticio','Titular Ficticio');
const OUTRO_PCP=conta('pcp','outro-pcp','Outro Gestor Ficticio');
const SUBST=conta('pcp','subst-ficticio','Substituta Ficticia');
const ADMIN=conta('admin','admin-ficticio','Admin Ficticio');
const NOV={de:'2026-11-01',ate:'2026-11-30'}, DEZ={de:'2026-12-01',ate:'2026-12-31'};
const doc={origem:'Vistoria ficticia',evidencia:'Foto ficticia 001 do servico',justificativa:'Conferido pela gestao ficticia'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
function cpf(base9){const d=base9.split('').map(Number);const dv=n=>{let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r;};d.push(dv(9));d.push(dv(10));return d.join('');}
const ficha=(id,nome,apelido,idPessoa,extra={})=>({id,colecao:'colaboradores',apagado:false,registro:{id,nome,apelido,cpf:cpf(idPessoa+'123'),idPessoa,statusId:'ativo',...extra}});
const FICHAS=[ficha('t','Titular Ficticio','titular-ficticio','700001'),ficha('s','Substituta Ficticia','subst-ficticio','700002'),
  ficha('o','Outro Gestor Ficticio','outro-pcp','700003'),ficha('ad','Admin Ficticio','admin-ficticio','700009'),
  ...[1,2,3,4,5,6].map(i=>ficha('p'+i,'Instalador '+i,'inst'+i,'10000'+i)),ficha('p9','Montador Interno','interno','100009')];
// Freelancer: contrato que VENCE em 20/11 (trabalhou em 18/11; a prévia é feita em dezembro).
const FREELA={id:'fl1',colecao:'freelancers',apagado:false,registro:{id:'fl1',nome:'Freelancer Ficticio',apelido:'freela',cpf:cpf('200001123'),idPessoa:'200001',funcao:'Instalador',situacao:'ativo',contratoFim:'2026-11-20'}};

const it=(uid,sub,q)=>({uid,item:uid,descricao:'Painel ficticio '+uid,qtde:String(q),subtotal:String(sub)});
const base=(id,numero,valor,equipe,itens,extra={})=>({id,numero,rev:1,tipo:'externo',cliente:'Cliente ficticio',valorTotal:valor,equipe,veiculo:'Carro ficticio',itens,...extra});
const lancada=dia=>({finalizadaEm:dia+'T21:00:00.000Z',finalizadoPor:'Gestor ficticio',entregaLancada:{data:dia,em:dia+'T21:00:00.000Z',por:'Gestor ficticio'},horaRetorno:'18:00',retornoEm:dia+'T18:00:00'});
const aloc=(lider,outro)=>D.montar([{equipeId:null,liderId:lider,membros:outro?[lider,outro]:[lider]}]);
const sel=(o,n,qtde)=>{const i=C.catalogo(o)[n];return {chave:i.chave,identidade:i.identidade,qtde};};
function oss(){
  return [
    base('A','91001',10000,['100001','100002'],[it('a',10000,1)],lancada('2026-11-05')),             // inteira, dupla 60/40 + montagem interna elegível
    base('B','91002',9000,['100003','100004'],[it('a',6000,2),it('b',4000,1)]),                       // parcial: nov e dez (desconto 10%)
    base('C','91003',10000,['100005'],[it('a',5000,1),it('b',5000,1)]),                              // item b cancelado (marca do legado)
    base('K','91004',4000,['100001','100002'],[it('a',4000,1)],lancada('2026-11-08')),               // cancelada e descancelada em novembro
    base('R1','91005',5000,['100003','100004'],[it('a',5000,1)],{...lancada('2026-11-10'),retrabalho:true,etapaOrigem:'Instalação'}),
    base('R2','91006',3000,['100001','100002'],[it('a',3000,1)],{...lancada('2026-11-11'),retrabalho:true,etapaOrigem:'Produção'}),
    base('R3','91007',2000,['100003','100004'],[it('a',2000,1)],{...lancada('2026-11-12'),retrabalho:true,etapaOrigem:''}),  // origem a definir
    base('F','91008',7000,['100005','100006'],[it('a',7000,1)],lancada('2026-11-15')),               // falha comprovada (decisão)
    base('FL','91009',6000,['100006','200001'],[it('a',6000,1)],lancada('2026-11-18')),              // dupla com freelancer
    base('V','91010',4000,['100001','100002'],[it('a',2000,2)],{veiculo:'Carro ficticio',saidaEm:'2026-11-20T08:00:00',retornoEm:'2026-11-20T18:00:00',horaRetorno:'18:00'}), // duas viagens
    base('X','91011',8000,['100005','100006'],[it('a',8000,1)],lancada('2026-11-22')),               // cancelada DEPOIS do fechamento
  ];
}
const PART=[['A',['100001','100002']],['K',['100001','100002']],['R1',['100003','100004']],['R2',['100001','100002']],['R3',['100003','100004']],['F',['100005','100006']],['FL',['100006','200001']],['X',['100005','100006']],['D1',['100003','100004']]]
  .map(([id,ms])=>({id,membros:ms.map(c=>({chave:c,nome:'P '+c,percentual:ms.length===2?(c===ms[0]?60:40):100})),por:'Gestor',em:'2026-11-25T10:00:00Z'}));
const reg=(e,id)=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id)?.registro;
const upsert=(e,os,quem=TITULAR)=>e.call({action:'upsert',os},quem);
async function conferir(e,id,entrega){const o=reg(e,id);const r=await e.call({action:'conferenciaEntrega',osId:id,rev:o.rev,entrega},TITULAR);assert.equal(r.status,200,id+' '+JSON.stringify(r).slice(0,300));return r;}
let nreq=0;const rq=p=>p+'-'+String(++nreq).padStart(4,'0')+'-ficticio';
async function fechar(e,per,corpo={}){
  const fonte=await e.call({action:'performancePeriodo',...per,notaPorValor:true},TITULAR);
  assert.equal(fonte.status,200,JSON.stringify(fonte).slice(0,400));
  const hist=await e.call({action:'performanceFechamentos',...per},TITULAR);
  const r=await e.call({action:'performanceFechar',...per,hash:fonte.hash,anterior:hist.fechamentos?.[0]?.id||'',requestId:rq('fechar'),motivo:'Fechamento ficticio do mes',leGrupos:true,leEntregasItens:true,notaPorValor:true,...corpo},TITULAR);
  return {fonte,r};
}
// A entrada da comissão como a gestão preencheria: decisão por O.S., entrega física, montador, montagem interna.
function entrada(selo,{falha=[],interna={}}={}){
  const regs=selo.registros;
  return {config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorizacao ficticia do inicio efetivo',criteriosExtras:'somente_falha_comprovada'},
    decisoes:Object.fromEntries(regs.map(r=>[r.osId||r.id,falha.includes(r.osId||r.id)?{...doc,decisao:'falha_comprovada',tipo:'ma_conducao'}:{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
    entregas:Object.fromEntries(regs.map(r=>{const ms=(r.membros||[]).map(m=>m.chave);const os=r.osId||r.id;
      const g=ms.length===2?{montadorId:ms.includes('200001')?'100006':ms[0]}:{partes:ms.map(c=>({pessoaId:c,cota:Math.floor(10000/ms.length)})),justificativa:'Equipe solo ficticia'};
      return [r.id,{...doc,entregue:true,grupos:[g],interna:interna[os]?{...doc,situacao:'elegivel',partes:interna[os]}:{...doc,situacao:'nao_aplicavel'}}];}))};
}
const recalculo=(e,selo,per)=>{const s=JSON.stringify(selo);return e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(per)}),perfOpcoesDoSelo(${s}))`);};
const linha=(ap,osId)=>ap.linhas.filter(l=>l.osId===osId);
const porPessoa=ap=>Object.fromEntries(ap.pessoas.map(p=>[p.tipo+':'+p.pessoaId,p.centavos]));

test('um mês inteiro: novembro efetivo fecha, aprova, exporta e emite; dezembro muda e conta certo', async()=>{
  const e=await edge('pcp-sync',{
    pcp_registros:oss().map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
    registros:[...FICHAS,FREELA],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:PART}}}],
    painel_ordens:[],
    equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'subst-ficticio',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'outro-pcp',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'admin-ficticio',papel:'admin',ativo:true}]});

  /* ---------------- novembro acontecendo ---------------- */
  relogio(e,'2026-11-12T20:00:00Z');
  let o=reg(e,'B');await conferir(e,'B',{id:'b-nov',dia:'2026-11-12',itens:[sel(o,0,1),sel(o,1,1)],alocacao:aloc('100003','100004')});
  relogio(e,'2026-11-14T20:00:00Z');
  o=reg(e,'C');await conferir(e,'C',{id:'c-nov',dia:'2026-11-14',itens:[sel(o,0,1)],alocacao:aloc('100005')});
  // o item b de C cancelado em novembro (marca do legado, antes do fechamento)
  { const c=structuredClone(reg(e,'C'));c.itens[1]={...c.itens[1],entregas:[{id:'mc-c',tipo:'cancelado',dia:'2026-11-14',motivo:'Cliente desistiu do item ficticio'}]};
    const r=await upsert(e,c);assert.equal(r.status,200,JSON.stringify(r)); }
  // K cancelada e descancelada em novembro
  relogio(e,'2026-11-09T10:00:00Z');
  for(const c of [{cancelar:true,motivo:'Cliente pediu para suspender ficticio'},{desfazer:true}]){const r=await upsert(e,{...structuredClone(reg(e,'K')),cancelamento:c});assert.equal(r.status,200,JSON.stringify(r));}
  assert.equal(reg(e,'K').cancelamento?.ativo,false,'K descancelada');
  // V: primeira viagem em 20/11, entrega parcial conferida
  relogio(e,'2026-11-20T21:00:00Z');
  o=reg(e,'V');await conferir(e,'V',{id:'v-nov',dia:'2026-11-20',itens:[sel(o,0,1)],alocacao:aloc('100001','100002')});

  /* ---------------- fechar novembro (02/12) ---------------- */
  relogio(e,'2026-12-02T12:00:00Z');
  const cedo=await e.call({action:'performanceFechar',...DEZ,hash:'x',anterior:'',requestId:rq('fechar'),motivo:'Fechamento ficticio do mes',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR);
  assert.equal(cedo.status,422,'dezembro não fecha antes de terminar');
  const {fonte:fNov,r:fr}=await fechar(e,NOV);
  assert.equal(fNov.cobertura.pctValor,100);
  assert.equal(fr.status,200,JSON.stringify(fr).slice(0,500));
  const seloNov=fr.fechamento;
  const idsNov=seloNov.registros.map(r=>r.osId||r.id).sort();
  assert.deepEqual(idsNov,['A','B','C','F','FL','K','R1','R2','R3','V','X'].sort());

  // O titular é designado (admin), o substituto com prazo só em 05 a 06/12
  for(const c of [{operacao:'titular',titularId:'700001'},{operacao:'substituto',substitutoId:'700002',de:'2026-12-05',ate:'2026-12-06'}]){
    const r=await e.call({action:'comissaoAprovadorGravar',motivo:'Designacao ficticia com mais de quinze letras',requestId:rq('aprov'),...c},ADMIN);
    assert.equal(r.status,200,JSON.stringify(r).slice(0,300));
  }
  // Prévia
  const ent=entrada(seloNov,{falha:['F'],interna:{A:[{pessoaId:'100009',cota:10000}]}});
  const p1=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:seloNov.id,anterior:'',entrada:ent,motivo:'Previa ficticia',requestId:rq('previa')},TITULAR);
  assert.equal(p1.status,200,JSON.stringify(p1).slice(0,500));
  const ap1=p1.revisao.apuracao;
  assert.equal(ap1.aprovavel,true);assert.deepEqual(ap1.pendencias,[]);
  // os centavos esperados
  const A=linha(ap1,'A')[0];assert.equal(A.comissaoCentavos,10000);assert.equal(A.internaCentavos,2000);assert.deepEqual(A.pagamentos.map(p=>[p.pessoaId,p.tipo,p.centavos]),[['100001','externa',4800],['100002','externa',3200],['100009','interna',2000]]);
  const B=linha(ap1,'B')[0];assert.equal(B.baseLiquidaCentavos,630000);assert.equal(B.comissaoCentavos,6300);
  const Cc=linha(ap1,'C')[0];assert.equal(Cc.baseLiquidaCentavos,500000,'C: o item a inteiro, o b cancelado');assert.equal(Cc.comissaoCentavos,5000);
  assert.equal(linha(ap1,'K')[0].comissaoCentavos,4000,'K descancelada conta');
  const R1=linha(ap1,'R1')[0];assert.equal(R1.perda,'retrabalho_instalacao');assert.equal(R1.comissaoCentavos,0);assert.equal(R1.comissaoPerdidaCentavos,5000);
  assert.equal(linha(ap1,'R2')[0].comissaoCentavos,3000,'retrabalho de produção paga');
  const R3=linha(ap1,'R3')[0];assert.equal(R3.decisao,'origem_a_definir');assert.equal(R3.comissaoCentavos,0);
  const F=linha(ap1,'F')[0];assert.equal(F.decisao,'falha_comprovada');assert.equal(F.comissaoCentavos,0);assert.equal(F.pontos,0);
  const V=linha(ap1,'V')[0];assert.equal(V.baseLiquidaCentavos,200000);assert.equal(V.comissaoCentavos,2000);
  const FL=linha(ap1,'FL')[0];
  assert.deepEqual(FL.pendencias,[]);
  const totalNov=10000+6300+5000+4000+3000+2000+6000+8000; // A B C K R2 V FL X
  assert.equal(ap1.totalCentavos,totalNov);
  assert.deepEqual(porPessoa(ap1),{'externa:100001':10200,'externa:100002':6800,'interna:100009':2000,'externa:100003':3780,'externa:100004':2520,'externa:100005':9800,'externa:100006':6800,'externa:200001':2400});
  assert.deepEqual(FL.pagamentos.map(x=>[x.pessoaId,x.centavos]),[['100006',3600],['200001',2400]],'o freelancer com contrato vencido depois do serviço recebe');

  // Aprovar: o outro pcp não; o substituto antes do prazo não; o titular sim
  const aprovar=(prev,quem,per=NOV)=>e.call({action:'performanceComissaoAprovar',...per,anterior:prev.id,hash:prev.hash,confirmacao:true,motivo:'Aprovacao ficticia',requestId:rq('aprovar')},quem);
  assert.equal((await aprovar(p1.revisao,OUTRO_PCP)).status,403,'outro pcp não aprova');
  assert.equal((await aprovar(p1.revisao,SUBST)).status,403,'substituto fora do prazo não aprova');
  const a1=await aprovar(p1.revisao,TITULAR);
  assert.equal(a1.status,200,JSON.stringify(a1).slice(0,300));assert.equal(a1.revisao.autor.como,'titular');
  const x1=await e.call({action:'performanceComissaoExportar',...NOV,id:a1.revisao.id},TITULAR);
  assert.equal(x1.status,200);
  assert.equal((x1.csv||'').replace(/^﻿/,'').split('\r\n').length-1,8,'uma linha por pessoa paga');
  const d1=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:seloNov.id,requestId:rq('doc')},TITULAR);
  const d2=await e.call({action:'performanceDocumento',...NOV,tipo:'comissao',fechamentoId:seloNov.id,revisaoId:a1.revisao.id,requestId:rq('doc')},TITULAR);
  assert.deepEqual([d1.status,d1.documento?.id,d2.status,d2.documento?.id],[200,'DOC-2026-000001',200,'DOC-2026-000002']);
  { const rk=await e.call({action:'performanceRankingEquipe',...NOV},{papel:'montagem',sub:'inst5',nome:'Instalador 5',exp:EXP});
    const fx=JSON.stringify(rk);assert.equal(rk.status,200);assert.ok(!/comissao|Centavos|valor"/.test(fx),'o ranking da montagem não leva R$');
    assert.deepEqual([rk.resumo.entregasConfirmadas,rk.resumo.semPontos,rk.resumo.falhaComprovada],[11,1,1]); }
  const m1=await e.call({action:'performanceMeses'},TITULAR);
  assert.deepEqual((m1.meses||[]).map(m=>[m.mes,m.estado]),[['2026-10','aberto'],['2026-11','enviado'],['2026-12','em_andamento']]);

  /* ---------------- dezembro muda ---------------- */
  relogio(e,'2026-12-03T20:00:00Z');
  o=reg(e,'B');await conferir(e,'B',{id:'b-dez',dia:'2026-12-03',itens:[sel(o,0,1)],alocacao:aloc('100003','100004')});
  // V: segunda viagem em 04/12
  relogio(e,'2026-12-04T19:00:00Z');
  { const v=structuredClone(reg(e,'V'));const r=await upsert(e,{...v,saidaEm:'2026-12-04T08:00:00',retornoEm:'2026-12-04T18:00:00',horaRetorno:'18:00'});assert.equal(r.status,200);assert.equal((reg(e,'V').voltas||[]).length,2); }
  relogio(e,'2026-12-04T21:00:00Z');
  o=reg(e,'V');await conferir(e,'V',{id:'v-dez',dia:'2026-12-04',itens:[sel(o,0,1)],alocacao:aloc('100001','100002')});
  // R3: a origem é definida depois do fechamento: Instalação
  relogio(e,'2026-12-05T10:00:00Z');
  { const r3=structuredClone(reg(e,'R3'));const r=await upsert(e,{...r3,etapaOrigem:'Instalação',etapaOrigemMotivo:'Vistoria ficticia confirmou falha na instalacao'});assert.equal(r.status,200);assert.equal(reg(e,'R3').etapaOrigem,'Instalação'); }
  // X: cancelada depois do fechamento
  { const r=await upsert(e,{...structuredClone(reg(e,'X')),cancelamento:{cancelar:true,motivo:'Cliente cancelou depois ficticio'}});assert.equal(r.status,200);assert.equal(reg(e,'X').cancelamento?.ativo,true); }
  // D1: O.S. nova de dezembro, inteira
  { const d=base('D1','91012',3000,['100003','100004'],[it('a',3000,1)],lancada('2026-12-10'));e.db.pcp_registros.push({colecao:'os',id:'D1',apagado:false,atualizado_em:'2026-12-05T10:00:00.000Z',registro:d}); }

  // novembro recalcula igual?
  relogio(e,'2026-12-06T12:00:00Z');
  const rc1=await recalculo(e,seloNov,NOV);
  const mud1=CB.mudancasDeDinheiro(seloNov,rc1);
  assert.deepEqual(mud1.dinheiro,[],'cancelar X e definir a origem de R3 depois do fechamento não mudam o dinheiro de novembro');
  assert.deepEqual(mud1.pendentes.map(m=>[m.osId,m.efeitoAgora]),[['R3','retrabalho_instalacao']]);
  const x2=await e.call({action:'performanceComissaoExportar',...NOV,id:a1.revisao.id},TITULAR);

  // Valor de item/O.S. mudado pela gestão em dezembro (A, inteira de novembro, já paga)
  { const a=structuredClone(reg(e,'A'));const r=await upsert(e,{...a,valorTotal:11000,itens:[{...a.itens[0],subtotal:'11000'}]});assert.equal(r.status,200);assert.equal(reg(e,'A').valorTotal,11000);
    // D1: a O.S. inteira de mês fechado e exportado avisa a gestão (antes, calada).
    assert.ok((r.avisos||[]).some(x=>/^Este mês já foi fechado e exportado \(01\/11\/2026 a 30\/11\/2026, revisão 1\)/.test(x)),JSON.stringify(r.avisos)); }
  const rc2=await recalculo(e,seloNov,NOV);
  const mud2=CB.mudancasDeDinheiro(seloNov,rc2);
  assert.deepEqual(mud2.dinheiro.map(m=>[m.osId,m.antesCentavos,m.depoisCentavos]),[['A',1000000,1100000]]);
  const x3=await e.call({action:'performanceComissaoExportar',...NOV,id:a1.revisao.id},TITULAR);
  // D1: a fita marca o mês com a mudança de dinheiro depois do envio.
  const mNov=((await e.call({action:'performanceMeses'},TITULAR)).meses||[]).find(m=>m.mes==='2026-11');
  assert.equal(mNov.estado,'enviado');assert.equal(mNov.mudouDepois?.depoisDoEnvio,true);assert.equal(mNov.mudouDepois?.os,1);
  // Valor de B (parcial com item conferido) mudado pela gestão
  { const b=structuredClone(reg(e,'B'));const r=await upsert(e,{...b,valorTotal:9900});assert.equal(r.status,200);
    assert.ok((r.avisos||[]).some(x=>/mês já foi fechado e exportado/.test(x)));assert.ok((r.avisos||[]).some(x=>/O valor das 2 entregas conferidas desta O\.S\. mudou de R\$ 9\.000,00 para R\$ 9\.900,00/.test(x))); }

  /* ---------------- fechar dezembro (02/01) ---------------- */
  relogio(e,'2027-01-02T12:00:00Z');
  const {fonte:fDez,r:frd}=await fechar(e,DEZ);
  assert.equal(frd.status,200,JSON.stringify(frd).slice(0,300));assert.deepEqual(fDez.jaFechadas,[]);
  const seloDez=frd.fechamento;
  assert.deepEqual(seloDez.registros.map(r=>(r.osId||r.id)+'='+r.valor).sort(),['B=2970','D1=3000','V=2000'],'X cancelada e A já fechada inteira não entram em dezembro');
  const pd=await e.call({action:'performanceComissaoNova',...DEZ,fechamentoId:seloDez.id,anterior:'',entrada:entrada(seloDez),motivo:'Previa ficticia',requestId:rq('previa')},TITULAR);
  assert.equal(pd.status,200);
  const apd=pd.revisao.apuracao;
  assert.equal(linha(apd,'B')[0].liquidoMudou.liquidoAtualCentavos,990000);assert.equal((apd.avisos||[]).length,1);
  assert.deepEqual(porPessoa(apd),{'externa:100003':3582,'externa:100004':2388,'externa:100001':1200,'externa:100002':800});
  // Substituto dentro do prazo? (hoje 02/01, o prazo era 05 a 06/12: volta ao titular)
  const ad=await aprovar(pd.revisao,TITULAR,DEZ);
  assert.equal(ad.status,200);
  const xd=await e.call({action:'performanceComissaoExportar',...DEZ,id:ad.revisao?.id},TITULAR);
  assert.equal(xd.status,200);
  const m2=await e.call({action:'performanceMeses'},TITULAR);
  assert.deepEqual((m2.meses||[]).map(m=>[m.mes,m.estado]),[['2026-10','aberto'],['2026-11','enviado'],['2026-12','enviado'],['2027-01','em_andamento']]);
  // Somas por O.S. entre os dois meses
  const somaOS=id=>[...linha(ap1,id),...linha(apd,id)].reduce((s,l)=>s+(l.comissaoCentavos||0),0);
  assert.equal(somaOS('B'),9270,'B: 6300 em novembro e 2970 em dezembro, ninguém contado duas vezes');
  assert.equal(a1.status,200);assert.equal(x1.status,200);assert.equal(x2.status,200,'cancelar X e definir a origem de R3 depois do fechamento não travam novembro');
  assert.equal(x3.status,409,'o valor de A mudado em dezembro trava a reexportação de novembro (limite documentado)');
  assert.deepEqual(apd.linhas.map(l=>[l.osId,l.comissaoCentavos]).sort(),[['B',2970],['D1',3000],['V',2000]]);
  assert.equal(apd.totalCentavos,7970);assert.equal(somaOS('V'),4000);
});

/* SEGUNDA PROVA: a O.S. com a origem a definir em novembro tem a origem
   definida em dezembro como PRODUÇÃO (não tira nada: ela deve ser paga). O
   caminho documentado é "fechar o período de novo e gerar nova prévia". O que
   mais entra junto nessa revisão de novembro? */
test('revisão de novembro para pagar a origem definida depois: o que vem junto', async()=>{
  const e=await edge('pcp-sync',{
    pcp_registros:oss().map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
    registros:[...FICHAS,FREELA],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:PART}}}],
    painel_ordens:[],equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'subst-ficticio',papel:'pcp',ativo:true}]});
  relogio(e,'2026-11-12T20:00:00Z');
  let o=reg(e,'B');await conferir(e,'B',{id:'b-nov',dia:'2026-11-12',itens:[sel(o,0,1),sel(o,1,1)],alocacao:aloc('100003','100004')});
  relogio(e,'2026-12-02T12:00:00Z');
  const {r:fr}=await fechar(e,NOV);assert.equal(fr.status,200);
  const seloNov=fr.fechamento;
  const p1=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:seloNov.id,anterior:'',entrada:entrada(seloNov,{falha:['F']}),motivo:'Previa ficticia',requestId:rq('previa')},TITULAR);
  const a1=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p1.revisao.id,hash:p1.revisao.hash,confirmacao:true,motivo:'Aprovacao ficticia',requestId:rq('aprovar')},TITULAR);
  assert.equal(a1.status,200,JSON.stringify(a1).slice(0,300));
  assert.equal((await e.call({action:'performanceComissaoExportar',...NOV,id:a1.revisao.id},TITULAR)).status,200);
  // Dezembro: X cancelada (o cliente desistiu depois; a instalação de novembro foi feita), e a origem de R3 definida como Produção.
  relogio(e,'2026-12-05T10:00:00Z');
  assert.equal((await upsert(e,{...structuredClone(reg(e,'X')),cancelamento:{cancelar:true,motivo:'Cliente cancelou depois ficticio'}})).status,200);
  const r3=await upsert(e,{...structuredClone(reg(e,'R3')),etapaOrigem:'Produção',etapaOrigemMotivo:'Vistoria ficticia mostrou defeito de producao'});
  assert.equal(r3.status,200);assert.equal(reg(e,'R3').etapaOrigem,'Produção');
  // Porta de exportar de novembro: passa (R3 vira pendência para a revisão).
  const xp=await e.call({action:'performanceComissaoExportar',...NOV,id:a1.revisao.id},TITULAR);
  assert.equal(xp.status,200);
  // A revisão 2 de novembro, o caminho documentado: X cancelada depois não sai de novembro? Sai (o cancelamento é o estado de hoje); R3 passa a pagar.
  relogio(e,'2026-12-06T10:00:00Z');
  const {fonte:f2,r:fr2}=await fechar(e,NOV);
  assert.equal(fr2.status,200,JSON.stringify(fr2).slice(0,300));
  assert.deepEqual(f2.registros.map(r=>r.osId||r.id).sort(),['A','B','F','FL','K','R1','R2','R3']);
  const p2=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:fr2.fechamento.id,anterior:a1.revisao.id,entrada:entrada(fr2.fechamento,{falha:['F']}),motivo:'Previa ficticia rev2',requestId:rq('previa')},TITULAR);
  assert.equal(p2.status,200);
  // O que vem junto (o limite que a D2 da auditoria descreve): X sai da revisão e tira o que já foi aprovado.
  assert.deepEqual(p2.revisao.apuracao.ajustes.filter(a=>a.diferencaCentavos).map(a=>a.pessoaId+':'+a.diferencaCentavos),['100003:1200','100004:800','100005:-4800','100006:-3200']);
  assert.deepEqual(p2.revisao.apuracao.linhas.filter(l=>['R3','X'].includes(l.osId)).map(l=>[l.osId,l.comissaoCentavos]),[['R3',2000]]);
  // D-017: com o substituto valendo, o titular e o substituto aprovam; o substituto tem acesso pcp (S1).
  relogio(e,'2026-12-06T12:00:00Z');
  for(const c of [{operacao:'titular',titularId:'700001'},{operacao:'substituto',substitutoId:'700002',de:'2026-12-06',ate:'2026-12-07'}]){
    const r=await e.call({action:'comissaoAprovadorGravar',motivo:'Designacao ficticia com mais de quinze letras',requestId:rq('aprov'),...c},ADMIN);assert.equal(r.status,200,JSON.stringify(r));}
  const lt=await e.call({action:'performanceComissaoListar',...NOV},TITULAR);
  assert.equal(lt.aprovador.podeAprovar,true);assert.equal(lt.aprovador.como,'titular');
  const as=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p2.revisao.id,hash:p2.revisao.hash,confirmacao:true,motivo:'Aprovacao ficticia',requestId:rq('aprovar')},SUBST);
  assert.equal(as.status,200,JSON.stringify(as).slice(0,300));assert.equal(as.revisao.autor.como,'substituto');assert.equal(as.revisao.autor.titularId,'700001');
  const xs=await e.call({action:'performanceComissaoExportar',...NOV,id:as.revisao.id},SUBST);
  assert.equal(xs.status,200,'o substituto é pcp: exporta como a gestão');
});

/* O FECHAMENTO DA v174 RECALCULA IGUAL: novembro fechado pelo servidor e pelo
   _shared da v174 (fbc56b9, tirados do git) dá o mesmo hash no servidor de
   agora, com as mudanças desta onda (U1, S1, S2, D1, C1, C3, P1). Sem o
   histórico do git (clone raso), o teste é pulado. */
function v174(t){
  const REF='fbc56b9';let src='';
  try{src=execFileSync('git',['-C',RAIZ,'show',REF+':supabase/functions/pcp-sync/index.ts'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{src='';}
  if(!src){t.skip('sem o histórico do git (clone raso ou cópia por git archive)');return null;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-v174-'));
  fs.mkdirSync(path.join(dir,'fn'));fs.mkdirSync(path.join(dir,'_shared'));
  fs.writeFileSync(path.join(dir,'fn','index.ts'),src);
  for(const f of execFileSync('git',['-C',RAIZ,'ls-tree','--name-only',REF,'supabase/functions/_shared/'],{encoding:'utf8'}).split('\n').filter(Boolean))
    fs.writeFileSync(path.join(dir,'_shared',path.basename(f)),execFileSync('git',['-C',RAIZ,'show',REF+':'+f],{encoding:'utf8'}));
  return {dir,tipo:path.relative(path.join(RAIZ,'supabase/functions'),path.join(dir,'fn')),shared:path.join(dir,'_shared')};
}
test('o fechamento de novembro feito pela v174 recalcula igual no servidor desta onda',async t=>{
  const velho=v174(t);if(!velho)return;
  try{
    const antigo=await edge(velho.tipo,{
      pcp_registros:oss().map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
      registros:[...FICHAS,FREELA],
      pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:PART}}}],
      painel_ordens:[],equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true}]},{shared:velho.shared});
    relogio(antigo,'2026-11-12T20:00:00Z');
    const o=reg(antigo,'B');
    assert.equal((await antigo.call({action:'conferenciaEntrega',osId:'B',rev:o.rev,entrega:{id:'b-nov',dia:'2026-11-12',itens:[sel(o,0,1),sel(o,1,1)],alocacao:aloc('100003','100004')}},TITULAR)).status,200);
    relogio(antigo,'2026-12-02T12:00:00Z');
    const {r:fr}=await fechar(antigo,NOV);
    assert.equal(fr.status,200,JSON.stringify(fr).slice(0,300));
    const selo=fr.fechamento;
    const novo=await edge('pcp-sync',structuredClone(antigo.db));
    relogio(novo,'2026-12-03T12:00:00Z');
    assert.equal((await recalculo(novo,selo,NOV)).hash,selo.hash);
  }finally{fs.rmSync(velho.dir,{recursive:true,force:true});}
});
