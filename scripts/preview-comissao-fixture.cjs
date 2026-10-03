// Backend real de pcp-sync, executado pelo harness em banco fictício em memória.
// Nunca lê credenciais nem faz chamadas de rede. Recriar servidor limpa a simulação.
const {edge}=require('../tests/helpers/edge.cjs');
const bancos=new Map();
const who={papel:'pcp',nome:'Gestor fictício da prévia',sub:'gestor-preview'};
module.exports=async body=>{
 const chave=body.de+'|'+body.ate;
 if(!bancos.has(chave))bancos.set(chave,(async()=>{
  const nomes=['Ana Paula Souza','Beatriz Costa Lima','Fernanda Alves Rocha'],ids=['900001','900002','900009'];
  const membros=ids.slice(0,2).map((chave,i)=>({chave,nome:nomes[i],percentual:i?40:60}));
  const fixture={pcp_registros:[{colecao:'os',id:'COMISSAO-FICTICIA',apagado:false,atualizado_em:'2020-01-01',registro:{id:'COMISSAO-FICTICIA',numero:'TESTE-120MIL',cliente:'Cliente fictício · apuração financeira',tipo:'externo',finalizadaEm:body.de+'T15:00:00Z',equipe:ids.slice(0,2),valorTotal:120000,itens:[{uid:'fixture-comissao',descricao:'Fachada fictícia',qtde:'1',subtotal:'125000'}]}}],registros:ids.map((id,i)=>({colecao:'colaboradores',id:'fixture-'+id,apagado:false,registro:{id:'fixture-'+id,nome:nomes[i],cpf:id+'12345'}})),pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:'COMISSAO-FICTICIA',equipeId:'eq-aguia',equipeNome:'Águia fictícia',membros,por:'Gestor fictício',em:body.de}]}}}],painel_ordens:[]};
  const e=await edge('pcp-sync',fixture),periodo={de:body.de,ate:body.ate};
  const f=await e.call({action:'performancePeriodo',...periodo},who);
  const fechamento={...f,...periodo,id:'fechamento-ficticio-'+body.de,revisao:1,fechadoEm:new Date().toISOString(),fechadoPor:who.nome,motivo:'Cópia fictícia exclusivamente para QA visual'};
  e.db.pcp_registros.push({colecao:'performance_fechamentos',id:fechamento.id,registro:fechamento,apagado:false});
  const doc={origem:'Vistoria fictícia',evidencia:'Foto e aceite inventados para teste visual',justificativa:'Cenário fictício, sem dados reais'};
  await e.call({action:'performanceComissaoNova',...periodo,fechamentoId:fechamento.id,anterior:'',requestId:'previa-ficticia-12345',motivo:'Prévia fictícia de R$120 mil',entrada:{config:{modo:'teste',criteriosExtras:'somente_falha_comprovada'},decisoes:{'COMISSAO-FICTICIA':{...doc,decisao:'sem_falha',tipo:'nenhuma'}},entregas:{'COMISSAO-FICTICIA':{...doc,entregue:true,grupos:[{montadorId:ids[0]}],interna:{...doc,situacao:'elegivel',partes:[{pessoaId:ids[2],cota:10000}]}}}}},who);
  return e;
 })());
 const e=await bancos.get(chave);
 return e.call(body,who);
};
