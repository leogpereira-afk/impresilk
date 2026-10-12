'use strict';
/* C3 DA AUDITORIA DE 12/10/2026: três recusas da gravação da gestão e da
   montagem com conta (que também passa pela fila do aparelho) eram 400/422
   sem `definitivo` e seguravam a fila até a pessoa corrigir: o retorno antes
   da saída, a conclusão sem a prova e o carro liberado sem a confirmação do
   dia. Agora o campo recusado fica de fora, com aviso, e o resto da gravação
   grava (como já era para o crachá de toque). Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const diaSP=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE=diaSP(Date.now());
const ficha=(id,nome,apelido,cpf)=>({colecao:'colaboradores',id,apagado:false,registro:{id,nome,apelido,cpf}});
const agoraISO=()=>new Date().toISOString();
const base=()=>({id:'1',rev:1,numero:'8101',tipo:'externo',cliente:'Cliente Ficticio',equipe:['100001','100002'],liberadoPCP:true,
  confirmacao:'Confirmado',confEm:agoraISO(),instalacao:{data:HOJE,periodo:'Manhã'},itens:[{uid:'u1',item:'1',descricao:'Placa ficticia',qtde:'1'}]});
const banco=()=>({pcp_registros:[{id:'1',colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:base()}],
  registros:[ficha('a','Ana Ficticia','ana','10000111111'),ficha('b','Bruno Ficticio','bruno','10000222222'),ficha('g','Gestor Teste','gestor','11122233344')],
  equipe_contas:[{sistema:'pcp',usuario:'bruno'}],
  pcp_config_global:[{id:true,config:{instaladores:['Ana','Bruno'],performancePCP:{equipes:[],participacoes:[]}},atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const bruno={nome:'Bruno',sub:'bruno',id:'100002',papel:'montagem'};
const reg=e=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id==='1').registro;
const daFila=r=>r.status===200||r.definitivo===true;

for(const [rotulo,quem] of [['montagem com conta',bruno],['gestão',gestor]]){
  test(`C3 (${rotulo}): o retorno antes da saída fica de fora com aviso; o resto grava`,async()=>{
    const e=await edge('pcp-sync',banco());
    const c=structuredClone((await e.call({action:'list',escopo:'abertas'},quem)).os.find(o=>o.id==='1'));
    const r0=await e.call({action:'upsert',os:{...c,horaSaida:'08:00',saidaEm:HOJE+'T08:00:00',atualizadoEm:agoraISO()}},quem);
    assert.equal(r0.status,200,JSON.stringify(r0));
    const r=await e.call({action:'upsert',os:{...r0.os,horaRetorno:'07:30',retornoEm:HOJE+'T07:30:00',obs:'anotação do dia',atualizadoEm:agoraISO()}},quem);
    assert.ok(daFila(r),'nunca 4xx sem definitivo: '+JSON.stringify(r));
    assert.equal(r.status,200);
    assert.equal(reg(e).retornoEm||'','','o retorno recusado não grava');
    assert.ok(!reg(e).horaRetorno,'nem a hora digitada');
    assert.equal(reg(e).saidaEm,HOJE+'T08:00:00','a saída fica');
    assert.equal(reg(e).obs,'anotação do dia','o resto grava');
    assert.match(r.avisos.join(' '),/O retorno ficou antes da saída e não foi gravado\. Confira a hora da saída e a do retorno; o resto da O\.S\. foi gravado\./);
  });
}

test('C3 (montagem com conta): a conclusão sem a prova fica de fora com aviso; o resto grava',async()=>{
  const e=await edge('pcp-sync',banco());
  const c=structuredClone((await e.call({action:'list',escopo:'abertas'},bruno)).os.find(o=>o.id==='1'));
  const r=await e.call({action:'upsert',os:{...c,horaSaida:'08:00',saidaEm:HOJE+'T08:00:00',finalizadaEm:agoraISO(),finalizadoPor:'Bruno',atualizadoEm:agoraISO()}},bruno);
  assert.ok(daFila(r),JSON.stringify(r));assert.equal(r.status,200);
  assert.ok(!reg(e).finalizadaEm,'não finalizou');assert.equal(reg(e).saidaEm,HOJE+'T08:00:00','a saída gravou');
  assert.match(r.avisos.join(' '),/^A O\.S\. não foi finalizada\. Para concluir: foto de depois \(serviço pronto\), data e hora do retorno\./);
});

test('C3 (montagem com conta): o carro liberado sem a confirmação do dia fica de fora com aviso; o resto grava',async()=>{
  const b=banco();b.pcp_registros[0].registro.confEm='2026-01-05T09:00:00-03:00';
  const e=await edge('pcp-sync',b);
  const c=structuredClone((await e.call({action:'list',escopo:'abertas'},bruno)).os.find(o=>o.id==='1'));
  const r=await e.call({action:'upsert',os:{...c,carroLiberado:true,carroLiberadoEm:agoraISO(),carroLiberadoPor:'Bruno',horaSaida:'08:00',saidaEm:HOJE+'T08:00:00',atualizadoEm:agoraISO()}},bruno);
  assert.ok(daFila(r),JSON.stringify(r));assert.equal(r.status,200);
  assert.equal(reg(e).carroLiberado,false);assert.equal(reg(e).saidaEm,HOJE+'T08:00:00');
  assert.match(r.avisos.join(' '),/O carro não foi liberado: confirme o cliente no dia da saída antes de liberar o veículo\./);
});
