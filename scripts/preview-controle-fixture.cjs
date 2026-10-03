// Integridade Task2 com o handler real e banco fictício, apenas em memória.
const {edge}=require('../tests/helpers/edge.cjs');
let banco;
module.exports=async body=>{
 if(!banco)banco=await edge('pcp-sync',{
  pcp_registros:(body.seed || []).map(o=>({colecao:'os',id:o.id,registro:{rev:1,...o},apagado:false,atualizado_em:'2020-01-01T12:00:00Z'})),
  registros:(body.pessoas || []).map(p=>({colecao:'colaboradores',id:p.id,apagado:false,registro:{nome:p.nome,cpf:p.id+'12345'}})),
  pcp_config_global:[{id:true,config:body.cfg || {},atualizado_em:'2020-01-01T12:00:00Z'}],
  painel_registros:[{id:'ativo-uno',colecao:'ativo',registro:{tipo:'veiculo',nome:'Uno fictício',especificacao:{placa:'TST1A23',lugares:2}}}],
  painel_ordens:(body.seed || []).filter(o=>o.valorTotal!=null).map(o=>({numero:o.numero,valor:o.valorTotal}))
 });
 if(!banco.db.pcp_registros.some(r=>r.colecao==='foto_evento')) {
  const agora=new Date().toISOString();
  for(const o of body.seed || [])for(const id of o.fotosCheckinIds || [])if(id.startsWith('foto_FOTO-ONTEM_'))banco.db.pcp_registros.push({colecao:'foto_evento',id,registro:{id,rev:0,anexadoEm:agora,recebidoEm:agora,capturadoEm:null,ocorridoEm:null},apagado:false,atualizado_em:agora});
 }
 if(body.action==='previewEstado')return {ok:true,cfg:banco.db.pcp_config_global[0].config,lista:banco.db.pcp_registros.filter(r=>r.colecao==='os'&&!r.apagado).map(r=>r.registro)};
 const resposta=await banco.call(body,{papel:'pcp',nome:'Gestor fictício da prévia',sub:'gestor-preview'});
 return {...resposta,cfg:banco.db.pcp_config_global[0].config,lista:banco.db.pcp_registros.filter(r=>r.colecao==='os'&&!r.apagado).map(r=>r.registro)};
};
