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
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
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
  assert.deepEqual(pend(e).filter(x=>x.registro.evento==='trava').map(x=>x.id),[a.id+':os:os2',a.id+':os:os3'],'a trava é da O.S. na aprovação do mês');
  const meses=ok(await e.call({action:'performanceMeses'},TITULAR),'meses');
  assert.equal(meses.meses.find(m=>m.mes==='2026-11').pendenciaPaga.os,2);
});

test('D2: a mesma O.S. em duas compensações a aprovar: só a mais nova se aprova, e a segunda aprovação da O.S. é 409',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g1=ok(await gerar(e,a,['os3']),'gerar 1').compensacao, g2=ok(await gerar(e,a,['os3']),'gerar 2').compensacao;
  const r=await aprovarComp(e,g1);
  assert.equal(r.status,409);assert.match(r.error,/Há uma compensação mais nova da mesma O\.S\./);
  ok(await aprovarComp(e,g2),'aprova a mais nova');
  // A trava do banco: a segunda aprovação da O.S. no mesmo mês é recusada mesmo por baixo da porta (corrida).
  const trava=pend(e).find(x=>x.registro.evento==='trava');
  assert.equal(trava.id,a.id+':os:os3');assert.equal(trava.registro.compensacaoId,g2.id);assert.equal(trava.registro.etapaOrigem,'Produção');
  // A origem mudou entre a prévia e a aprovação: gere outra.
  const {e:e2,a:a2}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
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

test('D2: a compensação aprovada e não exportada trava a prévia nova do mês (exporte primeiro); a prévia sem ela no "antes" não se aprova (409)',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar compensação');
  const fech=e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro;
  // O caso ruim (REV2): a prévia nova com a compensação aprovada e não exportada punha no "antes" o que ainda não tinha saído por CSV.
  const bloqueada=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:fech.id,anterior:a.id,entrada:entrada(fech.registros),motivo:'Prévia fictícia',requestId:rq('previa')},TITULAR);
  assert.equal(bloqueada.status,409);assert.match(bloqueada.error,/Há compensação de pendência aprovada e ainda não exportada neste mês: exporte a compensação primeiro/);
  ok(await exportarComp(e,g),'exportar compensação');
  // A prévia nova sem a compensação no "antes" (gravada como uma prévia de antes desta mudança).
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
  assert.match(ui,/<div id="comissao-resumo">\$\{comissaoResumoHTML\(ultima,revisoes,exportacoes,\{compensacoes:comps\}\)\}<\/div><div id="comissao-pendencias"/);
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
  assert.match(perf,/pendência decidida por compensação \(\$\{pagas\}/);
});

test('D2: a coleção nova entra no backup (exportarBackup) e no ensaio fictício',()=>{
  assert.match(ler('supabase/functions/pcp-sync/index.ts'),/const COLECOES_EXPORTACAO = \[[^\]]*"performance_comissao_pendencias"\]/);
  const E=require('../scripts/ensaio-backup-pcp.cjs');
  assert.ok(E.OBRIGATORIAS.includes('performance_comissao_pendencias'));
});


/* ======================= REVISÃO DO D2 (duas revisões, 19/10/2026) =======================
   As provas dos revisores viraram testes. Cada um começa pelo caso ruim. */
const refazerMes=async(e,fAnt,aAnt,{exportar=false}={})=>{
  const fonte=ok(await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR),'período');
  const f2=ok(await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:fAnt.id,requestId:rq('fechar'),motivo:'Revisão fictícia do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR),'fechar de novo').fechamento;
  const p2=ok(await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f2.id,anterior:aAnt.id,entrada:entrada(f2.registros),motivo:'Prévia fictícia nova',requestId:rq('previa')},TITULAR),'prévia nova').revisao;
  const a2=ok(await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p2.id,hash:p2.hash,motivo:'Aprovação fictícia nova',confirmacao:true,requestId:rq('aprovar')},TITULAR),'aprovar nova').revisao;
  const x2=exportar?ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a2.id},TITULAR),'exportar nova'):null;
  return {f2,p2,a2,x2};
};
const somaDif=(ds,pessoa)=>(ds||[]).filter(d=>d.pessoaId===pessoa).reduce((t,d)=>t+d.diferencaCentavos,0);

test('REV1: a compensação sobre a aprovação NUNCA exportada é recusada (409, exporte o mês antes); com o mês exportado, a revisão nova não paga a os3 de novo',async()=>{
  const {e,f,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)],{exportar:false});
  definir(e,'os3','Produção');
  // O caso ruim: a compensação saía por CSV e a exportação da revisão nova (contra zero) mandava pagar a os3 de novo.
  for(const r of [await listar(e),await gerar(e,a,['os3'])]){
    const t=r.motivo||r.error;assert.match(t,/Exporte o mês antes de compensar/);
  }
  assert.equal((await gerar(e,a,['os3'])).status,409);
  ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},TITULAR),'exportar o mês');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');ok(await exportarComp(e,g),'exportar compensação');
  const {x2}=await refazerMes(e,f,a,{exportar:true});
  // A revisão nova paga os1 (já exportada) e os3 (já saiu pela compensação): nada a pagar.
  assert.deepEqual([somaDif(x2.exportacao.diferencas,'100001'),somaDif(x2.exportacao.diferencas,'100002')],[0,0]);
  assert.deepEqual(x2.exportacao.compensacoesNoAntes,[g.id]);
});

test('REV1b: aprovação A2 sem exportar por cima da A1 exportada: a compensação sobre A2 espera a exportação de A2; depois, A3 não paga a os3 de novo',async()=>{
  const {e,f,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  const {f2,a2}=await refazerMes(e,f,a);
  definir(e,'os3','Produção');
  const r=await gerar(e,a2,['os3']);
  assert.equal(r.status,409);assert.match(r.error,/Exporte o mês antes de compensar/);
  ok(await e.call({action:'performanceComissaoExportar',...NOV,id:a2.id},TITULAR),'exportar A2');
  const g=ok(await gerar(e,a2,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');ok(await exportarComp(e,g),'exportar compensação');
  const {x2:x3}=await refazerMes(e,f2,a2,{exportar:true});
  assert.deepEqual([somaDif(x3.exportacao.diferencas,'100001'),somaDif(x3.exportacao.diferencas,'100002')],[0,0]);
});

test('REV2: uma definição só do "antes": a coluna do CSV da prévia nova e a diferença da exportação dizem o mesmo sobre a os3',async()=>{
  const {e,f,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');
  // Aprovada e não exportada: a prévia nova espera (a frase); exportada, entra no "antes" dos dois.
  ok(await exportarComp(e,g),'exportar compensação');
  const {a2,x2}=await refazerMes(e,f,a,{exportar:true});
  for(const pessoa of ['100001','100002']){
    const coluna=a2.apuracao.ajustes.filter(p=>p.pessoaId===pessoa).reduce((t,p)=>t+p.diferencaCentavos,0);
    assert.equal(coluna,somaDif(x2.exportacao.diferencas,pessoa),pessoa);
    assert.equal(coluna,0);
  }
  assert.equal(x2.exportacao.anteriorNaoExportada,false);
});

test('REV3: exportar a mesma compensação de novo diz quantas vezes e quando, e a tela atualiza o contador sem reabrir',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');
  const x1=ok(await exportarComp(e,g),'1a');
  assert.equal(x1.jaExportada,false);assert.doesNotMatch(x1.aviso,/já foi exportada/);
  const x2=ok(await exportarComp(e,g),'2a');
  assert.equal(x2.jaExportada,true);assert.equal(x2.vezes,2);
  assert.match(x2.aviso,/^Esta compensação já foi exportada 1 vez, a última em \d{2}\/\d{2}\/\d{4} por Titular Fictício: confira se aquele CSV foi recebido; esta nova exportação não tem nada novo a pagar\./);
  const ui=ler('comissao-ui.js');
  assert.match(ui,/if\(c&&out\.exportacao\)c\.exportacoes=\[\.\.\.\(c\.exportacoes\|\|\[\]\),out\.exportacao\];\s*comissaoPendenciasPintar\(caixa,ctx,r,/);
});

test('REV4: a compensação entra na conta acumulada dos meses seguintes (motor e porta); o saldo mudado depois do Gerar é 409',async()=>{
  const reg=(id,dia,valor,extra={})=>({id,osId:'os9',entregaId:id,fracaoOS:0.5,numero:'90009',dia,valor,confirmado:true,membros:[{chave:'100001'},{chave:'100002'}],...extra});
  const DEZ={de:'2026-12-01',ate:'2026-12-31'};
  const seloN={id:'n1',fechadoEm:'2026-12-01T00:00:00Z',periodo:NOV,regra:'performance-3',regraPerdas:'perdas-1',registros:[reg('e1','2026-11-10',1.5,{retrabalho:true,etapaOrigem:''})]};
  const entN=entrada(seloN.registros);
  const aN={tipo:'aprovacao',id:'aN',revisao:2,de:NOV.de,ate:NOV.ate,fechamentoId:'n1',entrada:entN,apuracao:C.apurar(seloN,entN)};
  const p=C.pendenciasDaAprovacao(aN,{...seloN,registros:[reg('e1','2026-11-10',1.5,{retrabalho:true,etapaOrigem:'Produção'})]},[],seloN)[0];
  const comp=C.apurarPendencia(seloN,aN,{osIds:['os9'],origens:p.origens},{aprovacoes:[aN]}).apuracao;
  assert.equal(comp.totalCentavos,2);
  const reg9={evento:'compensacao',id:'2026-11-01:2026-11-30:c000001',de:NOV.de,ate:NOV.ate,aprovacaoId:'aN',apuracao:comp};
  const seloD={id:'d1',fechadoEm:'2027-01-01T00:00:00Z',periodo:DEZ,regra:'performance-3',regraPerdas:'perdas-1',registros:[reg('e2','2026-12-10',1.5,{retrabalho:true,etapaOrigem:'Produção'})]};
  const entD=entrada(seloD.registros);
  // O caso ruim: sem a compensação no saldo, dezembro pagava 2 (1% de 150) e a O.S. recebia 4 centavos por 300 de base.
  assert.equal(C.apurar(seloD,entD,{aprovacoes:[aN]}).totalCentavos,2);
  const dez=C.apurar(seloD,entD,{aprovacoes:[aN],compensacoes:[reg9],saldos:C.saldosDasCompensacoes([reg9],[aN],'efetivo',DEZ)});
  assert.equal(comp.totalCentavos+dez.totalCentavos,3,'1% de 300 = 3');
  // A conferência dos centavos (divergencias) sabe da compensação.
  const aD={tipo:'aprovacao',id:'aD',revisao:2,de:DEZ.de,ate:DEZ.ate,fechamentoId:'d1',entrada:entD,apuracao:dez};
  assert.deepEqual(C.divergencias([aN,aD],'efetivo',[reg9]),[]);
  assert.equal(C.divergencias([aN,aD],'efetivo',[]).length,1,'sem a compensação, dezembro parece errado');
  // A porta: outra aprovação mexeu na O.S. depois do Gerar.
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  assert.deepEqual(Object.keys(g.versoesOS),['os3']);
  e.db.pcp_registros.push({colecao:'performance_comissao_os_versoes',id:'os3:'+String(g.versoesOS.os3+1).padStart(8,'0'),apagado:false,atualizado_em:'2026-12-02T12:00:00Z',registro:{osId:'os3',versao:g.versoesOS.os3+1,aprovacaoId:'outra-ficticia',anterior:g.versoesOS.os3}});
  const r=await aprovarComp(e,g);
  assert.equal(r.status,409);assert.match(r.error,/O saldo da O\.S\. mudou desde a prévia desta compensação/);
  const g2=ok(await gerar(e,a,['os3']),'gerar de novo').compensacao;
  ok(await aprovarComp(e,g2),'aprovar a nova');
  assert.ok(e.db.pcp_registros.some(x=>x.colecao==='performance_comissao_os_versoes'&&x.registro.compensacaoPendencia===g2.id),'a aprovação dá versão nova à O.S.');
});

test('REV5: a revisão nova que absorveu a compensação e deixou a os3 pendente de novo: ela se compensa sobre a aprovação nova, com o saldo certo',async()=>{
  const {e,f,a}=await mesAprovado([osF('os1',1000),osF('os3',3000,aDefinir)]);
  definir(e,'os3','Produção');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;
  ok(await aprovarComp(e,g),'aprovar');ok(await exportarComp(e,g),'exportar');
  reg(e,'os3').etapaOrigem='';
  const {a2,x2}=await refazerMes(e,f,a,{exportar:true});
  assert.equal(a2.apuracao.linhas.find(l=>l.osId==='os3').decisao,'origem_a_definir');
  assert.deepEqual([somaDif(x2.exportacao.diferencas,'100001'),somaDif(x2.exportacao.diferencas,'100002')],[-1800,-1200],'a revisão nova tira o que a compensação pagou');
  definir(e,'os3','Produção');
  const l=ok(await listar(e),'listar');
  assert.deepEqual(l.pendencias.map(p=>[p.osId,p.estado]),[['os3','pronta']],'a compensação da aprovação substituída não marca a os3 como compensada');
  const g2=ok(await gerar(e,a2,['os3']),'gerar sobre a aprovação nova').compensacao;
  assert.equal(g2.apuracao.totalCentavos,3000,'a compensação absorvida não conta no saldo');
  ok(await aprovarComp(e,g2),'aprovar');
  assert.ok(pend(e).some(x=>x.id===a2.id+':os:os3'));
});

test('item 4: o arquivo do Hub feito pela v177 (sem a coleção nova na contagem) volta pelo ensaio; linhas sem a contagem continuam recusadas',async()=>{
  const E=require('../scripts/ensaio-backup-pcp.cjs');
  const arquivo=path.join(__dirname,'fixtures','pacote-v177-ficticio.json');
  const p=JSON.parse(fs.readFileSync(arquivo,'utf8'));
  assert.equal(p.contagem.fim.pcp_registros.performance_comissao_pendencias,undefined,'o pacote é da v177');
  assert.doesNotThrow(()=>E.validarPacote(p));
  const r=await E.conferirArquivoReal(arquivo);
  assert.equal(r.formato,'pcp-backup-5');assert.ok(r.comissoes>=1);
  // As três da onda comissão também: ausentes da contagem e sem linhas, vazias.
  const sem=structuredClone(p);
  for(const c of ['performance_documentos','performance_retrato_logos']){delete sem.contagem.inicio.pcp_registros[c];delete sem.contagem.fim.pcp_registros[c];}
  sem.pcp_registros=sem.pcp_registros.filter(l=>!['performance_documentos','performance_retrato_logos'].includes(l.colecao));
  sem.contagem.exportado.pcp_registros=Object.fromEntries(Object.entries(sem.contagem.exportado.pcp_registros).filter(([c])=>!['performance_documentos','performance_retrato_logos'].includes(c)));
  assert.doesNotThrow(()=>E.validarPacote(sem));
  // O caso que continua recusado: linhas da coleção sem a contagem dela.
  const ruim=structuredClone(p);
  ruim.pcp_registros.push({colecao:'performance_comissao_pendencias',id:'x',registro:{evento:'trava'},apagado:false,atualizado_em:'2026-12-02T12:00:00Z'});
  ruim.contagem.exportado.pcp_registros.performance_comissao_pendencias={total:1,apagados:0};
  assert.throws(()=>E.validarPacote(ruim),/A contagem do PCP não traz a coleção performance_comissao_pendencias, e o pacote tem 1 linha dela\./);
  // As de sempre continuam obrigatórias.
  const semOs=structuredClone(p);delete semOs.contagem.fim.pcp_registros.os;
  assert.throws(()=>E.validarPacote(semOs),/não traz a coleção os/);
});

test('item 6: o ranking dos funcionários tira os pontos da O.S. que a compensação deu como retrabalho de instalação (só leitura, o hash não muda)',async()=>{
  const eq={id:'eq-f',nome:'Equipe fictícia',ativo:true,membros:membros.map(m=>({chave:m.chave,nome:m.nome}))};
  const oss=[osF('os1',1000),osF('os3',2000,aDefinir)];
  const {e,f,a}=await (async()=>{const x=await mesAprovado(oss);return x;})();
  const cfg=e.db.pcp_config_global[0].config.performancePCP;cfg.equipes=[eq];
  const M=conta('montagem','montagem-ficticia','Montagem Fictícia');
  const rk=async()=>{const r=ok(await e.call({action:'performanceRankingEquipe',...NOV},M),'ranking');return r.equipes.reduce((t,x)=>t+(x.equivalentes||0),0);};
  const antes=await rk();
  definir(e,'os3','Instalação');
  const g=ok(await gerar(e,a,['os3']),'gerar').compensacao;ok(await aprovarComp(e,g),'aprovar');
  relogio(e,'2026-12-02T13:00:00Z');// o cache do ranking dura 60 s
  const depois=await rk();
  assert.ok(antes-depois>0.99,'a os3 deixou de pontuar: '+antes+' -> '+depois);
  assert.equal(e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.hash,f.hash);
  // O motor (as duas cópias): a mesma marca no aparelho.
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const resumo=C.resumoCompensacoes(pend(e).map(x=>x.registro));
  for(const X of [C,S]){
    const demos=X.demonstrativosVigentes([a],NOV,resumo);
    const rs=X.comFalhasComprovadas([{id:'os3',osId:'os3',dia:'2026-11-10',retrabalho:true,etapaOrigem:''},{id:'os1',osId:'os1',dia:'2026-11-10'}],demos);
    assert.equal(rs[0].perda,'retrabalho_instalacao');assert.equal(rs[0].compensacaoPendencia.id,g.id);assert.equal(rs[1].perda,undefined);
    assert.deepEqual(X.demonstrativosVigentes([a],NOV),X.demonstrativosVigentes([a],NOV,[]),'sem compensação, como sempre');
  }
});

test('item 5: Perdas, o ponto de atenção, o aviso e o demonstrativo dizem "paga/perdida por compensação" em vez de "feche o período de novo"',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os2',2000,aDefinir),osF('os3',3000,aDefinir)]);
  definir(e,'os2','Medição');definir(e,'os3','Instalação');
  for(const os of ['os2','os3']){const g=ok(await gerar(e,a,[os]),'gerar').compensacao;ok(await aprovarComp(e,g),'aprovar');}
  const l=ok(await e.call({action:'performanceComissaoListar',...NOV},TITULAR),'listar');
  assert.deepEqual(l.compensacoesPendencia.map(c=>c.osIds[0]),['os2','os3']);
  const P=require('../perdas.js');
  const fech=e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro;
  const ds=P.demonstrativos({revisoes:l.revisoes,cobrem:[],compensacoesPendencia:l.compensacoesPendencia},NOV);
  const m=P.montar({registros:fech.registros,demonstrativos:ds,periodo:NOV,regras:require('../regras.js'),motor:C});
  const linha=id=>m.linhas.find(x=>x.osId===id);
  assert.equal(linha('os2').grupo,'outra');assert.match(linha('os2').avisoFicha,/^Paga por compensação em \d{2}\/\d{2}\/\d{4} \(compensação 1\), com a origem Medição\./);
  assert.equal(linha('os3').grupo,'perda');assert.match(linha('os3').avisoFicha,/^Perdida por compensação em \d{2}\/\d{2}\/\d{4}: retrabalho de instalação \(compensação 2\)\./);
  assert.equal(linha('os3').perda.comissaoCentavos,3000);
  assert.equal(m.resumo.origemDefinidaDepois,0);assert.equal(m.resumo.decididasPorCompensacao,2);
  assert.ok(!JSON.stringify(m.linhas).includes('feche o período de novo'));
  const src=ler('perdas.js');
  assert.ok(!/feche o período de novo e gere nova prévia/.test(src));
  assert.match(src,/if \(l\.compensacao\) return l\.compensacao\.perda \? \{classe:'falha', texto:'Perdida por compensação: retrabalho de instalação'\} : \{classe:'ok', texto:'Paga por compensação'\};/);
  assert.match(C.TEXTO_ORIGEM_A_DEFINIR,/pague só ela por compensação da pendência/);
  // O demonstrativo e o PDF: a linha "a definir" diz como foi decidida, e as compensações do mês aparecem.
  const ctx=vm.createContext({esc:s=>String(s??''),dinheiroCasa:v=>'R$ '+v.toFixed(2).replace('.',','),console});
  vm.runInContext(ler('comissao-ui.js'),ctx);
  ctx.__a=a;ctx.__c=l.compensacoesPendencia;
  assert.match(vm.runInContext(`comissaoCompDaLinha(__a,{osId:'os3'},__c)`,ctx),/^Perdida por compensação em .+: retrabalho de instalação \(compensação 2\)$/);
  assert.match(vm.runInContext(`comissaoCompDaLinha(__a,{osId:'os2'},__c)`,ctx),/^Paga por compensação em .+ \(compensação 1, origem Medição\)$/);
  assert.match(vm.runInContext(`comissaoCompsDoMesHTML(__a,__c)`,ctx),/Compensações de pendência deste mês<\/h4><ul><li>Compensação 1 · O\.S\. 90002 · R\$ 20,00 · aprovada em/);
  assert.match(ler('comissao-ui.js'),/comissaoResumoHTML\(r,revisoes,exportacoes,\{compensacoes\}\)\+comissaoDocRodapeHTML/,'o PDF leva as compensações');
});

test('itens 9 e 10: a fita e a lista dizem "decidida (paga ou perdida)", a origem mudada aparece na fita, sem pendência diz que não há, e os alvos de toque têm 40 px',async()=>{
  const {e,a}=await mesAprovado([osF('os1',1000),osF('os2',2000,aDefinir),osF('os3',3000,aDefinir)]);
  definir(e,'os2','Medição');definir(e,'os3','Instalação');
  for(const os of ['os2','os3']){const g=ok(await gerar(e,a,[os]),'gerar').compensacao;ok(await aprovarComp(e,g),'aprovar');}
  let nov=ok(await e.call({action:'performanceMeses'},TITULAR),'meses').meses.find(m=>m.mes==='2026-11');
  assert.deepEqual([nov.pendenciaPaga.os,nov.pendenciaPaga.pagas,nov.pendenciaPaga.perdidas,nov.pendenciaPaga.mudou],[2,1,1,0]);
  definir(e,'os2','Instalação');
  nov=ok(await e.call({action:'performanceMeses'},TITULAR),'meses').meses.find(m=>m.mes==='2026-11');
  assert.equal(nov.pendenciaPaga.mudou,1);
  const perf=ler('performance.js');
  const fn=new Function(perf.match(/function perfFitaPendenciaTxt\(m\)\{[\s\S]*?\n\}/)[0]+';return perfFitaPendenciaTxt;')();
  assert.equal(fn(nov),'pendência decidida por compensação (1 paga, 1 perdida); a origem mudou depois da compensação (1 O.S.): falta uma nova revisão');
  // A lista do diálogo.
  const ctx=vm.createContext({esc:s=>String(s??''),dinheiroCasa:v=>'R$ '+v.toFixed(2).replace('.',','),console});
  vm.runInContext(ler('comissao-ui.js'),ctx);
  const l=ok(await listar(e),'listar');
  ctx.__l=l;
  const html=vm.runInContext('comissaoPendenciasHTML(__l)',ctx);
  assert.match(html,/O\.S\. 90003 · decidida por compensação: perdida \(retrabalho de instalação\)/);
  assert.match(html,/O\.S\. 90002 · decidida por compensação: paga; a origem mudou depois da compensação/);
  assert.match(html,/Não há pendência a pagar: as O\.S\. pendentes deste mês já foram decididas por compensação\./);
  assert.ok(!/· paga por compensação/.test(html));
  const css=ler('styles.css');
  assert.match(css,/#perf-dialog\.comissao-dialog label:has\(input\[type=checkbox\]\)\{min-height:40px;align-items:center\}/);
  assert.match(css,/#perf-dialog\.comissao-dialog summary,\.comissao-pendencias-bloco summary\{min-height:40px;box-sizing:border-box\}/);
  assert.match(css,/\.comissao-pendencias-bloco button:disabled,#perf-dialog\.comissao-dialog \[data-pend-gerar\]:disabled\{opacity:\.5;cursor:not-allowed;filter:grayscale\(1\)\}/);
});

test('item 11: a prévia visual (preview-auditoria) leva as ações comissaoPendencia* e comissaoAprovador* ao servidor fictício',()=>{
  const pv=ler('scripts/preview-auditoria.cjs');
  assert.match(pv,/performanceDocumento\|comissaoPendencia\|comissaoAprovador\)\/\.test\(body\.action\)/);
  assert.match(pv,/process\.env\.PV_D2\?require\('\.\/preview-d2-fixture\.cjs'\)/);
  assert.ok(fs.existsSync(path.join(RAIZ,'scripts/preview-d2-fixture.cjs')));
});
