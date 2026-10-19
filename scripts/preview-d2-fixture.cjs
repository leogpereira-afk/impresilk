// A compensação da pendência (D2) na prévia visual: o mês fechado, aprovado e exportado com O.S. "a definir", servidor real, tudo fictício. Use PV_D2=1.
const {edge}=require('../tests/helpers/edge.cjs');
const bancos=new Map();
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const quem=papel=>({papel:papel||'pcp',nome:'Gestor fictício da prévia',sub:'gestor-preview',exp:EXP});
const ficha=(id,nome,cpf)=>({id,colecao:'colaboradores',apagado:false,registro:{id,nome,apelido:id,cpf,statusId:'ativo'}});
const doc={origem:'Vistoria fictícia',evidencia:'Foto fictícia 001 do serviço',justificativa:'Conferido pela gestão fictícia'};
const membros=[{chave:'100001',nome:'Instalador Um Fictício',percentual:60},{chave:'100002',nome:'Instalador Dois Fictício',percentual:40}];
const proximoDia=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10);};
async function montar(de,ate){
  const dia=de.slice(0,8)+'10T15:00:00Z';
  const osF=(id,valorTotal,extra={})=>({colecao:'os',id,apagado:false,atualizado_em:de+'T00:00:00Z',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',
    cliente:'Cliente fictício '+id,finalizadaEm:dia,finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal,...extra}});
  const oss=[osF('os1',1000),osF('os2',3000,{retrabalho:true,etapaOrigem:'',problema:'Letra fictícia caiu'}),osF('os3',2000,{retrabalho:true,etapaOrigem:'',problema:'Placa fictícia torta'})];
  const e=await edge('pcp-sync',{pcp_registros:oss,registros:[ficha('i1','Instalador Um Fictício','10000111111'),ficha('i2','Instalador Dois Fictício','10000222222'),ficha('g','Gestor fictício da prévia','70000999999')],painel_ordens:[],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor fictício',em:de}))}}}],
    equipe_contas:[{sistema:'pcp',usuario:'gestor-preview',papel:'pcp',ativo:true}]});
  const iso=proximoDia(ate)+'T12:00:00Z';
  e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
    globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
  const P={de,ate},G=quem('pcp'),ok=(r,o)=>{if(r.status!==200)throw new Error(o+': '+JSON.stringify(r));return r;};
  const fonte=ok(await e.call({action:'performancePeriodo',...P,notaPorValor:true},G),'período');
  const f=ok(await e.call({action:'performanceFechar',...P,hash:fonte.hash,anterior:'',requestId:'pv-fechar-000001',motivo:'Fechamento fictício do mês',leGrupos:true,leEntregasItens:true,notaPorValor:true},G),'fechar').fechamento;
  const entrada={config:{modo:'efetivo',inicioEfetivo:de,decisaoGestao:'Autorização fictícia para teste',criteriosExtras:'somente_falha_comprovada'},
    decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
    entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))};
  const p=ok(await e.call({action:'performanceComissaoNova',...P,fechamentoId:f.id,anterior:'',entrada,motivo:'Prévia fictícia',requestId:'pv-previa-000001'},G),'prévia').revisao;
  if(!p.apuracao.aprovavel)throw new Error(JSON.stringify(p.apuracao.pendencias)+' '+f.regraPerdas);const a=ok(await e.call({action:'performanceComissaoAprovar',...P,anterior:p.id,hash:p.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'pv-aprovar-000001'},G),'aprovar').revisao;
  ok(await e.call({action:'performanceComissaoExportar',...P,id:a.id},G),'exportar');
  return e;
}
module.exports=async body=>{
  // Ajuda do revisor: define a origem na O.S. do banco fictício (o que a ficha faria).
  if(body.action==='pvDefinir'){const e=await bancos.get(body.chave||[...bancos.keys()].pop());const o=e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===body.osId).registro;
    o.etapaOrigem=body.origem;(o.etapaOrigemLog||=[]).push({de:'',para:body.origem,motivo:'Origem fictícia definida',por:'Gestor fictício',porId:'709999',em:new Date().toISOString()});return {ok:true};}
  if(body.action==='pvDb'){const e=await bancos.get([...bancos.keys()].pop());return {linhas:e.db.pcp_registros.filter(r=>r.colecao===body.colecao).map(r=>r.registro)};}
  const papel=body.__papel;delete body.__papel;
  if(!body.de&&!body.ate){const ultimo=[...bancos.keys()].pop();if(!ultimo)return {meses:[],hoje:''};const e=await bancos.get(ultimo);return e.call(body,quem(papel));}
  const chave=body.de+'|'+body.ate;
  if(!bancos.has(chave))bancos.set(chave,montar(body.de,body.ate));
  const e=await bancos.get(chave);
  return e.call(body,quem(papel));
};
