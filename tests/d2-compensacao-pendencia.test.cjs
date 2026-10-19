'use strict';
/* D2 DA AUDITORIA DE 12/10/2026: PAGAR SÓ A O.S. "A DEFINIR" POR COMPENSAÇÃO.
   A O.S. com a origem do retrabalho a definir no selo de um mês fechado e
   aprovado não paga e não perde; vira pendência "para a próxima revisão ou
   compensação". Antes desta mudança, pagar essa O.S. depois de definida a
   origem exigia refazer o mês inteiro (fechar de novo e nova prévia), que
   arrastava todas as outras mudanças do mês. Agora a gestão gera uma
   compensação só com ela (comissaoPendencia*), com a régua e os valores do
   selo, a origem de hoje e a mesma conta de centavos do motor. Cada teste
   começa pelo caso ruim. Pessoas, CPFs, O.S. e valores fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {edge}=require('./helpers/edge.cjs');
const C=require('../comissao.js');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const sha256=t=>crypto.createHash('sha256').update(t).digest('hex');

const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const conta=(papel,sub,nome,extra={})=>({papel,sub,nome,exp:EXP,...extra});
const TITULAR=conta('pcp','titular-ficticio','Titular Fictício');
const SUBST=conta('pcp','subst-ficticio','Substituta Fictícia');
const OUTRO_PCP=conta('pcp','outro-pcp','Outro Gestor Fictício');
const ADMIN=conta('admin','admin-ficticio','Admin Fictício');
const NAO_GESTAO=[conta('montagem','montagem-ficticia','Montagem Fictícia'),conta('operacao','operacao-ficticia','Operação Fictícia'),
  conta('comercial','comercial-ficticio','Comercial Fictício'),conta('montagem','Ana','Ana',{montagemIndividual:true}),'machine'];
const ficha=(id,nome,apelido,cpf)=>({id,colecao:'colaboradores',apagado:false,registro:{id,nome,apelido,cpf,statusId:'ativo'}});
const FICHAS=[ficha('t','Titular Fictício','titular-ficticio','70000111111'),ficha('s','Substituta Fictícia','subst-ficticio','70000222222'),
  ficha('o','Outro Gestor Fictício','outro-pcp','70000333333'),ficha('m','Montagem Fictícia','montagem-ficticia','70000444444'),
  ficha('i1','Instalador Um Fictício','instalador-um','10000111111'),ficha('i2','Instalador Dois Fictício','instalador-dois','10000222222')];
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
const membros=[{chave:'100001',nome:'Instalador Um Fictício',percentual:60},{chave:'100002',nome:'Instalador Dois Fictício',percentual:40}];
// O relógio anda um milissegundo a cada leitura: cada evento tem a sua hora.
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const osF=(id,valorTotal,extra={})=>({colecao:'os',id,apagado:false,atualizado_em:'2026-11-20T00:00:00Z',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',
  cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal,...extra}});
const aDefinir={retrabalho:true,etapaOrigem:''};
async function servidor(oss){
  const e=await edge('pcp-sync',{pcp_registros:oss,registros:structuredClone(FICHAS),painel_ordens:[],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor fictício',em:'2026-11-10'}))}}}],
    equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'subst-ficticio',papel:'pcp',ativo:true},{sistema:'pcp',usuario:'outro-pcp',papel:'pcp',ativo:true}]});
  relogio(e,'2026-12-02T12:00:00Z');
  return e;
}
let n=0;const rq=p=>p+'-'+String(++n).padStart(6,'0');
const ok=(r,o)=>{assert.equal(r.status,200,o+': '+JSON.stringify(r));return r;};
const reg=(e,id)=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
const pend=e=>e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao_pendencias');
async function designar(e){
  ok(await e.call({action:'comissaoAprovadorGravar',operacao:'titular',titularId:'700001',motivo:'Designação fictícia com mais de quinze letras',requestId:rq('aprov')},ADMIN),'titular');
  ok(await e.call({action:'comissaoAprovadorGravar',operacao:'substituto',substitutoId:'700002',de:'2026-12-01',motivo:'Reserva fictícia com mais de quinze letras',requestId:rq('aprov')},ADMIN),'substituto');
}
const entrada=regs=>({config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
// Novembro fechado, a prévia, a aprovação (pelo titular) e a exportação do mês.
async function mesAprovado(oss,{exportar=true}={}){
  const e=await servidor(oss);
  await designar(e);
  const fonte=ok(await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR),'período');
  const f=ok(await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:rq('fechar'),motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR),'fechar').fechamento;
  const p=ok(await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f.id,anterior:'',entrada:entrada(f.registros),motivo:'Prévia fictícia',requestId:rq('previa')},TITULAR),'prévia').revisao;
  const a=ok(await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.id,hash:p.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:rq('aprovar')},TITULAR),'aprovar').revisao;
  const x=exportar?ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},TITULAR),'exportar'):null;
  return {e,f,p,a,x};
}
const listar=(e,quem=TITULAR)=>e.call({action:'comissaoPendenciaListar',...NOV},quem);
const calcular=(e,a,osIds,quem=TITULAR,extra={})=>e.call({action:'comissaoPendenciaCalcular',...NOV,aprovacaoId:a.id,osIds,...extra},quem);
const gerar=(e,a,osIds,quem=TITULAR,extra={})=>e.call({action:'comissaoPendenciaGerar',...NOV,aprovacaoId:a.id,osIds,motivo:'Origem definida na ficha: pagar a pendência',requestId:rq('gerar'),...extra},quem);
const aprovarComp=(e,c,quem=TITULAR)=>e.call({action:'comissaoPendenciaAprovar',...NOV,id:c.id,hash:c.hash,motivo:'Aprovação fictícia da compensação',confirmacao:true,requestId:rq('aprovcomp')},quem);
const exportarComp=(e,c,quem=TITULAR)=>e.call({action:'comissaoPendenciaExportar',...NOV,id:c.id},quem);
const definir=(e,id,origem)=>{const o=reg(e,id);o.etapaOrigem=origem;(o.etapaOrigemLog||=[]).push({de:'',para:origem,motivo:'Origem fictícia definida pela gestão',por:'Titular Fictício',porId:'700001',em:'2026-12-02T12:00:00Z'});};

test('D2: o mês com 3 O.S. (uma a definir), aprovado e exportado: paga SÓ a pendente por compensação; as outras duas, a aprovação e o hash do fechamento não mudam',async()=>{
  const {e,f,a,x}=await mesAprovado([osF('os1',1000),osF('os2',2000),osF('os3',3000,aDefinir)]);
  assert.equal(f.regraPerdas,'perdas-1');
  assert.equal(a.apuracao.linhas.find(l=>l.osId==='os3').decisao,'origem_a_definir');
  const comissaoAntes=structuredClone(e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao'));
  // O caso ruim: com a origem ainda a definir, não há o que pagar (e antes desta mudança não havia ação nenhuma).
  let l=ok(await listar(e),'listar');
  assert.equal(l.disponivel,true);
  assert.deepEqual(l.pendencias.map(p=>[p.osId,p.estado]),[['os3','a_definir']]);
  let r=await calcular(e,a,['os3']);
  assert.equal(r.status,409);assert.match(r.error,/A O\.S\. 90003 ainda está com a origem do retrabalho a definir: defina a origem na ficha/);
  r=await calcular(e,a,['os1']);
  assert.equal(r.status,409,'a O.S. paga no mês não se compensa');assert.match(r.error,/não está pendente/);
  // A gestão define a origem na ficha (Produção: a instalação não perde).
  definir(e,'os3','Produção');
  l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias.map(p=>[p.osId,p.estado,p.efeitoAgora,p.etapaOrigemAgora]),[['os3','pronta','','Produção']]);
  // A prévia do valor por pessoa, sem gravar: 1% de R$ 3.000,00 fictícios, 60% e 40% da dupla.
  const c=ok(await calcular(e,a,['os3']),'calcular');
  assert.equal(c.apuracao.aprovavel,true,JSON.stringify(c.apuracao.pendencias));
  assert.deepEqual(c.apuracao.linhas.map(x=>[x.osId,x.comissaoCentavos,x.baseLiquidaCentavos]),[['os3',3000,300000]]);
  assert.deepEqual(c.apuracao.pessoas.map(p=>[p.pessoaId,p.tipo,p.centavos,p.nome]),[['100001','externa',1800,'Instalador Um Fictício'],['100002','externa',1200,'Instalador Dois Fictício']]);
  assert.equal(pend(e).length,0,'calcular não grava');
  // Motivo obrigatório.
  assert.equal((await gerar(e,a,['os3'],TITULAR,{motivo:''})).status,422);
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  assert.equal(g.evento,'compensacao');assert.deepEqual(g.osIds,['os3']);assert.equal(g.aprovacaoId,a.id);assert.equal(g.fechamentoHash,f.hash);
  assert.equal(g.autor.porId,'700001','o autor é carimbado pelo servidor, pelo ID');
  assert.equal(g.apuracao.totalCentavos,3000);
  // Quem não é a vez não aprova (403): outro pcp com titular designado.
  assert.equal((await aprovarComp(e,g,OUTRO_PCP)).status,403);
  const ap=ok(await aprovarComp(e,g),'aprovar compensação');
  assert.equal(ap.aprovacao.autor.como,'titular');assert.equal(ap.aprovacao.autor.porId,'700001');
  assert.ok(/^[a-f0-9]{64}$/.test(ap.aprovacao.csvSha256));assert.equal(ap.aprovacao.csv,undefined,'o texto do CSV não desce na resposta');
  // O CSV próprio, com o ID como texto e o sha256 guardado.
  const ex=ok(await exportarComp(e,g),'exportar compensação');
  assert.equal(sha256(ex.csv),ex.csvSha256);assert.equal(ex.csvSha256,ap.aprovacao.csvSha256);
  assert.equal(ex.arquivo,'comissao-pendencia-2026-11-01-c1.csv');
  const linhas=ex.csv.replace(/^﻿/,'').split('\r\n');
  assert.equal(linhas[0],'"Compensação";"Mês";"Fechamento";"Aprovação do mês";"Pessoa ID";"Nome";"Tipo";"Valor a pagar (R$)";"O.S. compensadas"');
  assert.equal(linhas.length,3);
  assert.match(linhas[1],/^"2026-11-01:2026-11-30:c000001";"=""2026-11""";"[^"]+";"[^"]+";"=""100001""";"Instalador Um Fictício";"externa";"18,00";"90003"$/);
  assert.match(linhas[2],/"=""100002""";"Instalador Dois Fictício";"externa";"12,00";"90003"$/);
  assert.ok(!/Cliente fictício|3000,00/.test(ex.csv),'nem cliente nem valor da O.S. no CSV');
  const evento=pend(e).find(x=>x.registro.evento==='exportacao').registro;
  assert.equal(evento.csvSha256,ex.csvSha256);assert.equal(evento.autor.porId,'700001');
  // Nenhuma outra O.S. do mês mudou: a comissão do mês, o fechamento e o CSV dele são os mesmos.
  assert.deepEqual(e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao'),comissaoAntes);
  assert.equal(e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.hash,f.hash);
  const de_novo=ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},TITULAR),'exportar o mês de novo');
  assert.equal(sha256(de_novo.csv),sha256(x.csv));
  assert.deepEqual(de_novo.conferencia.pendentes.map(m=>m.osId),['os3'],'a pendência continua só como marca do mês fechado');
  // A segunda compensação da mesma O.S.: 409 com a frase.
  for(const acao of [calcular,gerar]){
    const s=await acao(e,a,['os3']);
    assert.equal(s.status,409);assert.match(s.error,/A O\.S\. 90003 já foi paga por compensação: a mesma O\.S\. não se compensa duas vezes/);
  }
  l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias.map(p=>[p.osId,p.estado]),[['os3','compensada']]);
  assert.equal(l.compensacoes.length,1);assert.equal(l.compensacoes[0].aprovacao.autor.como,'titular');assert.equal(l.compensacoes[0].exportacoes.length,1);
  assert.equal(l.compensacoes[0].aprovacao.csv,undefined);
  // A fita dos meses mostra a pendência paga por compensação.
  const meses=ok(await e.call({action:'performanceMeses'},TITULAR),'meses');
  const nov=meses.meses.find(m=>m.mes==='2026-11');
  assert.equal(nov.estado,'enviado');assert.equal(nov.pendenciaPaga.os,1);
  // A origem muda de novo depois da compensação: vira aviso, não paga em dobro e não some.
  definir(e,'os3','Instalação');
  l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias.map(p=>[p.osId,p.estado]),[['os3','mudou']]);
  assert.match(l.avisos[0],/O\.S\. 90003 · A origem do retrabalho mudou depois da compensação que a pagou: a compensação não muda e não paga de novo\. A gestão decide com uma nova revisão do mês/);
  assert.equal((await gerar(e,a,['os3'])).status,409);
  assert.equal(ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},TITULAR),'o mês continua exportando').csvSha256,x.csvSha256);
});

test('D2: montagem, operação, comercial, o crachá de toque e a máquina recebem 403 em todas as ações, e nenhum R$ desce',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)],{exportar:false});
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  for(const quem of NAO_GESTAO){
    for(const corpo of [{action:'comissaoPendenciaListar'},{action:'comissaoPendenciaCalcular',aprovacaoId:a.id,osIds:['os3']},{action:'comissaoPendenciaGerar',aprovacaoId:a.id,osIds:['os3'],motivo:'Tentativa fictícia',requestId:rq('x')},
      {action:'comissaoPendenciaAprovar',id:g.id,hash:g.hash,motivo:'Tentativa fictícia',confirmacao:true,requestId:rq('x')},{action:'comissaoPendenciaExportar',id:g.id}]){
      const r=await e.call({...corpo,...NOV},quem);
      assert.equal(r.status,403,(quem.papel||quem)+' '+corpo.action);
      assert.ok(!/centavos|3000|1800/.test(JSON.stringify(r)),'nenhum R$ desce');
    }
  }
  assert.equal(pend(e).length,1,'nada foi gravado pelas recusas');
});

test('D2: o substituto aprova (D-017) e o titular também; a mesma compensação não se aprova duas vezes',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os2',2000,aDefinir),osF('os3',3000,aDefinir)]);
  definir(e,'os2','Medição');definir(e,'os3','Arte');
  const g2=ok(await gerar(e,a,['os2']),'gerar os2').compensacao;
  const g3=ok(await gerar(e,a,['os3'],SUBST),'gerar os3').compensacao;
  assert.equal(g3.seq,2);assert.equal(g3.autor.porId,'700002');
  const s=ok(await aprovarComp(e,g2,SUBST),'substituto aprova');
  assert.equal(s.aprovacao.autor.como,'substituto');assert.equal(s.aprovacao.autor.titularId,'700001');
  const t=ok(await aprovarComp(e,g3,TITULAR),'titular aprova');
  assert.equal(t.aprovacao.autor.como,'titular');
  // A mesma compensação aprovada de novo (outro pedido): 409, nada gravado.
  const de_novo=await aprovarComp(e,g2,TITULAR);
  assert.equal(de_novo.status,409);assert.match(de_novo.error,/já foi aprovada/);
  assert.deepEqual(pend(e).filter(x=>x.registro.evento==='trava').map(x=>x.id),['2026-11-01:2026-11-30:os:os2','2026-11-01:2026-11-30:os:os3']);
  const meses=ok(await e.call({action:'performanceMeses'},TITULAR),'meses');
  assert.equal(meses.meses.find(m=>m.mes==='2026-11').pendenciaPaga.os,2);
});

test('D2: a mesma O.S. em duas compensações a aprovar: só a mais nova se aprova, e a segunda aprovação da O.S. é 409',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)],{exportar:false});
  definir(e,'os3','Produção');
  const g1=ok(await gerar(e,a,['os3']),'gerar 1').compensacao, g2=ok(await gerar(e,a,['os3']),'gerar 2').compensacao;
  const r=await aprovarComp(e,g1);
  assert.equal(r.status,409);assert.match(r.error,/Há uma compensação mais nova da mesma O\.S\./);
  ok(await aprovarComp(e,g2),'aprova a mais nova');
  // A trava do banco: a segunda aprovação da O.S. no mesmo mês é recusada mesmo por baixo da porta (corrida).
  const trava=pend(e).find(x=>x.registro.evento==='trava');
  assert.equal(trava.id,'2026-11-01:2026-11-30:os:os3');assert.equal(trava.registro.compensacaoId,g2.id);
  // A origem mudou entre a prévia e a aprovação: gere outra.
  const {e:e2,a:a2}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)],{exportar:false});
  definir(e2,'os3','Produção');
  const g=ok(await gerar(e2,a2,['os3']),'gerar').compensacao;
  definir(e2,'os3','Medição');
  const m=await aprovarComp(e2,g);
  assert.equal(m.status,409);assert.match(m.error,/mudou depois desta compensação: gere outra/);
});

test('D2: retrabalho de instalação definido: a O.S. perde (zero, com a comissão perdida registrada) e o CSV sai sem ninguém a receber',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Instalação');
  const l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias.map(p=>[p.estado,p.efeitoAgora]),[['pronta','retrabalho_instalacao']]);
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  const linha=g.apuracao.linhas[0];
  assert.equal(linha.perda,'retrabalho_instalacao');assert.equal(linha.comissaoCentavos,0);assert.equal(linha.comissaoPerdidaCentavos,3000);
  assert.equal(g.apuracao.totalCentavos,0);assert.deepEqual(g.apuracao.pessoas,[]);assert.equal(g.apuracao.aprovavel,true);
  ok(await aprovarComp(e,g),'aprovar');
  const ex=ok(await exportarComp(e,g),'exportar');
  assert.equal(ex.csv.replace(/^﻿/,'').split('\r\n').length,1,'só o cabeçalho');
});

test('D2: a revisão nova do mês depois da compensação não paga em dobro (a compensação entra no "antes")',async()=>{
  const {e,f,a}=await mesAprovado([osF('os1',1000),osF('os2',2000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');ok(await exportarComp(e,g),'exportar');
  // A gestão refaz o mês (outro motivo): fecha de novo e gera a prévia nova, que agora paga a os3.
  const fonte=ok(await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR),'período');
  const f2=ok(await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:f.id,requestId:rq('fechar'),motivo:'Revisão fictícia do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR),'fechar de novo').fechamento;
  const p2=ok(await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f2.id,anterior:a.id,entrada:entrada(f2.registros),motivo:'Prévia fictícia nova',requestId:rq('previa')},TITULAR),'prévia nova').revisao;
  assert.equal(p2.apuracao.linhas.find(l=>l.osId==='os3').comissaoCentavos,3000);
  assert.deepEqual(p2.apuracao.compensacoesPendencia,[g.id]);
  assert.deepEqual(p2.apuracao.ajustes.map(x=>[x.pessoaId,x.diferencaCentavos]),[['100001',0],['100002',0]],'o que a compensação pagou não se paga de novo');
  // Com a prévia nova por cima, a compensação não se gera nem se exporta (o mês está em revisão).
  assert.equal((await listar(e)).disponivel,false);
  assert.equal((await exportarComp(e,g)).status,409);
  const a2=ok(await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p2.id,hash:p2.hash,motivo:'Aprovação fictícia nova',confirmacao:true,requestId:rq('aprovar')},TITULAR),'aprovar nova').revisao;
  const x2=ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a2.id},TITULAR),'exportar nova');
  assert.deepEqual(x2.exportacao.compensacoesNoAntes,[g.id]);
  assert.deepEqual(x2.exportacao.diferencas.map(d=>[d.pessoaId,d.diferencaCentavos]),[['100001',0],['100002',0]],'a exportação nova não paga a os3 de novo');
  const l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias,[],'a aprovação nova não tem pendência');
  assert.equal(l.compensacoes.length,1,'a compensação antiga continua no registro');
});

test('D2: uma compensação aprovada depois da prévia do mês trava a aprovação daquela prévia (409), sem pagar em dobro',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)],{exportar:false});
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar compensação');
  // A prévia nova sem a compensação no "antes" (gravada como uma prévia de antes desta mudança).
  const fech=e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro;
  const p=ok(await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:fech.id,anterior:a.id,entrada:entrada(fech.registros),motivo:'Prévia fictícia',requestId:rq('previa')},TITULAR),'prévia').revisao;
  const linha=e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===p.id);delete linha.registro.apuracao.compensacoesPendencia;
  const r=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.id,hash:p.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:rq('aprovar')},TITULAR);
  assert.equal(r.status,409);assert.match(r.error,/Uma compensação de pendência foi aprovada depois desta prévia/);
});

test('D2: o motor das duas cópias diz o mesmo (comissao.js e _shared/pcp-comissao.mjs)',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const reg=(id,valor,extra={})=>({id,osId:id,numero:'9000'+id.slice(-1),dia:'2026-11-10',valor,confirmado:true,membros:[{chave:'100001'},{chave:'100002'}],...extra});
  const selo={id:'2026-11-01:2026-11-30:000001',fechadoEm:'2026-12-01T00:00:00Z',periodo:NOV,regra:'performance-3',regraPerdas:'perdas-1',registros:[reg('os1',10),reg('os3',30,{retrabalho:true,etapaOrigem:''})]};
  const ent=entrada(selo.registros);
  const ap={tipo:'aprovacao',id:'2026-11-01:2026-11-30:000002',revisao:2,de:NOV.de,ate:NOV.ate,fechamentoId:selo.id,entrada:ent,apuracao:C.apurar(selo,ent)};
  for(const atual of [selo,{...selo,registros:[reg('os1',10),reg('os3',30,{retrabalho:true,etapaOrigem:'Produção'})]},{...selo,registros:[reg('os1',10),reg('os3',30,{retrabalho:true,etapaOrigem:'Instalação',perda:'retrabalho_instalacao'})]},{...selo,registros:[reg('os1',10)]}]){
    const pc=C.pendenciasDaAprovacao(ap,atual,[],selo), ps=S.pendenciasDaAprovacao(ap,atual,[],selo);
    assert.deepEqual(pc,ps);
    const p=pc[0];
    if(p.estado!=='pronta')continue;
    const x=C.apurarPendencia(selo,ap,{osIds:['os3'],origens:p.origens},{aprovacoes:[ap]}), y=S.apurarPendencia(selo,ap,{osIds:['os3'],origens:p.origens},{aprovacoes:[ap]});
    assert.deepEqual(x,y);
    const comp={evento:'compensacao',id:'2026-11-01:2026-11-30:c000001',de:NOV.de,ate:NOV.ate,fechamentoId:selo.id,aprovacaoId:ap.id,apuracao:x.apuracao};
    assert.equal(C.csvPendencia(comp),S.csvPendencia(comp));
    // A compensação de teste não exporta para pagamento.
    assert.throws(()=>C.csvPendencia({...comp,apuracao:{...comp.apuracao,config:{modo:'teste'}}}),/é de teste e não exporta/);
  }
  // O mesmo resultado que o mês pagaria: a mesma conta de centavos do motor (a os3 na prévia do mês com a origem definida).
  const definido={...selo,registros:[reg('os1',10),reg('os3',30,{retrabalho:true,etapaOrigem:'Produção'})]};
  const mes=C.apurar(definido,ent);
  const p=C.pendenciasDaAprovacao(ap,definido,[],selo)[0];
  const comp=C.apurarPendencia(selo,ap,{osIds:['os3'],origens:p.origens},{aprovacoes:[ap]}).apuracao;
  assert.deepEqual(comp.linhas[0].pagamentos,mes.linhas.find(l=>l.osId==='os3').pagamentos);
  // O caso ruim: a O.S. paga no mês não entra numa compensação de pendência.
  assert.throws(()=>C.apurarPendencia(selo,ap,{osIds:['os1'],origens:{os1:{}}},{aprovacoes:[ap]}),/não está pendente/);
  // Sem o saldo de fora, a conta do mês é a de sempre.
  assert.deepEqual(C.apurar(selo,ent,{}),C.apurar(selo,ent,{saldos:{}}));
});

test('D2: a tela (Performance, comissão): o botão no lugar das pendências, a prévia por pessoa, o motivo, sem travessão e com alvos de 40 px',()=>{
  const ui=ler('comissao-ui.js');
  assert.match(ui,/<div id="comissao-resumo">\$\{comissaoResumoHTML\(ultima,revisoes,exportacoes\)\}<\/div><div id="comissao-pendencias"/);
  assert.match(ui,/data-pend-pagar\$\{prontas\.length\?'':' disabled'\}>Pagar a pendência por compensação<\/button>/);
  assert.match(ui,/action:'comissaoPendenciaCalcular'/);assert.match(ui,/action:'comissaoPendenciaGerar'/);
  assert.match(ui,/Motivo da compensação \(obrigatório\)/);assert.match(ui,/Ver a prévia do valor por pessoa/);
  const css=ler('styles.css');
  assert.match(css,/\.comissao-pendencias-bloco button,#perf-dialog\.comissao-dialog \[data-pend-gerar\]\{min-height:40px\}/);
  // Os textos novos, sem travessão.
  const bloco=ui.slice(ui.indexOf('/* A COMPENSAÇÃO DA PENDÊNCIA (D2'),ui.indexOf('/* QUEM APROVA A COMISSÃO HOJE'));
  assert.ok(bloco.length>1000);assert.ok(!bloco.includes('—'),'sem travessão');
  // O bloco desenhado: a lista, o aviso, a compensação e o botão de aprovar.
  const ctx=vm.createContext({esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),dinheiroCasa:v=>'R$ '+v.toFixed(2).replace('.',','),console});
  vm.runInContext(ui,ctx);
  const html=vm.runInContext(`comissaoPendenciasHTML(${JSON.stringify({ok:true,disponivel:true,pendencias:[{osId:'os3',numero:'90003',estado:'pronta',efeitoAgora:'',etapaOrigemAgora:'Produção'},{osId:'os4',numero:'90004',estado:'a_definir'}],
    compensacoes:[{id:'c1',seq:1,motivo:'Motivo fictício',autor:{nome:'Titular Fictício',porId:'700001'},em:'2026-12-02T12:00:00Z',apuracao:{totalCentavos:3000,config:{modo:'efetivo'},linhas:[{osId:'os3',numero:'90003',decisao:'sem_falha',comissaoCentavos:3000}],pessoas:[{pessoaId:'100001',nome:'Instalador Um Fictício',tipo:'externa',centavos:1800}],pendencias:[]},aprovacao:null,exportacoes:[]}],avisos:['Aviso fictício']})})`,ctx);
  assert.match(html,/O\.S\. 90003 · origem definida: pronta para pagar · origem Produção: paga o que pagaria/);
  assert.match(html,/O\.S\. 90004 · origem ainda a definir na ficha/);
  assert.match(html,/data-pend-aprovar="c1">Aprovar a compensação 1<\/button>/);
  assert.match(html,/Instalador Um Fictício \(cadastro 100001\) · Equipe externa · <strong>R\$ 18,00<\/strong>/);
  assert.ok(!html.includes('—'));
  // A fita.
  const perf=ler('performance.js');
  assert.match(perf,/pendência paga por compensação \(\$\{p\.os===1\?'1 O\.S\.'/);
});

test('D2: a coleção nova entra no backup (exportarBackup) e no ensaio fictício',()=>{
  assert.match(ler('supabase/functions/pcp-sync/index.ts'),/const COLECOES_EXPORTACAO = \[[^\]]*"performance_comissao_pendencias"\]/);
  const E=require('../scripts/ensaio-backup-pcp.cjs');
  assert.ok(E.OBRIGATORIAS.includes('performance_comissao_pendencias'));
});
