// Demandas possuem armazenamento próprio. Este módulo nunca escreve em O.S.
export const SITUACOES=['aberta','em_andamento','aguardando','concluida','cancelada'];
export const PRIORIDADES=['baixa','normal','alta','urgente'];
export function falha(msg,status=422){throw Object.assign(new Error(msg),{status});}
const texto=(v,max,obrigatorio=false)=>{if(typeof v!=='string'||v.length>max||(obrigatorio&&!v.trim()))falha('Preencha os campos obrigatórios e respeite o tamanho permitido.');return v.trim();};
const data=v=>{if(!v)return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)falha('Data inválida.');return v;};
export function validarDemanda(entrada,pessoas,ordens,anterior=null){
 const d=entrada||{}, ids=new Set(pessoas.map(p=>p.id)), os=new Set(ordens.map(o=>o.id));
 const pessoa=v=>{if(!ids.has(v))falha('Selecione uma pessoa cadastrada no RH.');return v;};
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(d.id||''))falha('Identificador inválido.');
 if(!SITUACOES.includes(d.situacao)||!PRIORIDADES.includes(d.prioridade))falha('Prioridade ou situação inválida.');
 if(!Array.isArray(d.envolvidos)||d.envolvidos.length>100||!Array.isArray(d.osIds)||d.osIds.length>50||!Array.isArray(d.acoes)||d.acoes.length>100)falha('Lista inválida.');
 const vistos=new Set(), acoes=d.acoes.map(a=>{if(!/^[a-zA-Z0-9_-]{1,100}$/.test(a.id||'')||vistos.has(a.id))falha('Ação inválida ou repetida.');vistos.add(a.id);if(!['pendente','em_andamento','aguardando','concluida','cancelada'].includes(a.situacao))falha('Situação da ação inválida.');return {id:a.id,titulo:texto(a.titulo,400,true),responsavelId:pessoa(a.responsavelId),prazo:data(a.prazo),situacao:a.situacao};});
 if(anterior?.acoes?.some(a=>!vistos.has(a.id)))falha('Preserve as ações existentes. Cancele uma ação que não seja mais necessária.');
 if(d.situacao==='concluida'&&acoes.some(a=>!['concluida','cancelada'].includes(a.situacao)))falha('Conclua ou cancele as ações pendentes antes de concluir a demanda.');
 return {id:d.id,titulo:texto(d.titulo,200,true),descricao:texto(d.descricao,12000,true),resultadoEsperado:texto(d.resultadoEsperado,4000,true),responsavelId:pessoa(d.responsavelId),envolvidos:[...new Set(d.envolvidos.map(pessoa))],osIds:[...new Set(d.osIds.map(v=>{if(!os.has(v)&&!anterior?.osIds?.includes(v))falha('A O.S. vinculada não foi localizada.');return v;}))],prioridade:d.prioridade,prazo:data(d.prazo),situacao:d.situacao,acoes};
}
export function prazosDemandas(demandas){return demandas.filter(d=>!['concluida','cancelada'].includes(d.situacao)).flatMap(d=>[...(d.prazo?[{demandaId:d.id,titulo:d.titulo,data:d.prazo,tipo:'demanda'}]:[]),...d.acoes.filter(a=>a.prazo&&!['concluida','cancelada'].includes(a.situacao)).map(a=>({demandaId:d.id,acaoId:a.id,titulo:a.titulo,demandaTitulo:d.titulo,data:a.prazo,tipo:'acao'}))]);}
async function paginas(q){const r=[];for(let i=0;i<10000;i+=500){const {data,error}=await q().range(i,i+499);if(error)falha('Não foi possível carregar os registros.',503);r.push(...data);if(data.length<500)return r;}falha('Volume de registros acima do limite. Refine o catálogo no servidor.',503);}
export async function demandasPCP(body,{sb,cracha,ehMaquina}){
 if(!ehMaquina&&!['admin','pcp'].includes(cracha?.papel))falha('Demandas são coordenadas pela gestão do PCP.',403);
 const op=body.operacao, autor=ehMaquina?'integracao-pcp':String(cracha.sub), agora=new Date().toISOString();
 async function catalogos(){
  const ps=await paginas(()=>sb.from('registros').select('id,registro->>nome,registro->>setor,registro->>cargoId,registro->>dataDesligamento').eq('colecao','colaboradores').eq('apagado',false).order('id'));
  const os=await paginas(()=>sb.from('pcp_registros').select('id,registro->>numero,registro->>cliente').eq('colecao','os').eq('apagado',false).order('id'));
  return {pessoas:ps.map(p=>({id:p.id,nome:p.nome,setor:p.setor||'',cargoId:p.cargoId||'',inativo:!!p.dataDesligamento})),ordens:os};
 }
 async function obter(){const {data,error}=await sb.from('pcp_demandas').select('*').eq('id',body.id||body.demanda?.id).maybeSingle();if(error)falha('Falha ao consultar demanda.',503);return data;}
 if(op==='listar'){const rows=await paginas(()=>sb.from('pcp_demandas').select('*').order('id'));return {ok:true,demandas:rows.map(r=>({...r.registro,revision:r.revision})),...await catalogos(),atualizadoEm:agora};}
 const ant=await obter();
 if(op==='arquivo'){const f=ant?.registro.anexos?.find(f=>f.id===body.arquivoId);if(!f?.path)falha('Arquivo não encontrado.',404);const {data,error}=await sb.storage.from('pcp-demandas').createSignedUrl(f.path,60);if(error)falha('Não foi possível abrir o arquivo.',503);return {ok:true,url:data.signedUrl};}
 if(!['salvar','anexar'].includes(op))falha('Operação inválida.');
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(body.mutationId||''))falha('Identificador do envio inválido.');
 if(ant?.mutation_id===body.mutationId)return {ok:true,demanda:{...ant.registro,revision:ant.revision}};
 if(body.expectedRevision!==(ant?.revision||0))falha('Esta demanda mudou em outro aparelho. Atualize antes de salvar; seu formulário continua aberto.',409);
 let d;
 if(op==='salvar'){
  const cat=await catalogos();d=validarDemanda(body.demanda,cat.pessoas,cat.ordens,ant?.registro);
  d.atualizacoes=[...(ant?.registro.atualizacoes||[])];const nota=texto(body.nota||'',8000);if(nota)d.atualizacoes.push({id:body.mutationId,texto:nota,por:autor,em:agora});
  d.anexos=[...(ant?.registro.anexos||[])];
  if(body.link){let u;try{u=new URL(body.link.url);}catch{falha('Informe um link HTTPS válido.');}if(u.protocol!=='https:'||u.username||u.password)falha('Use um link HTTPS sem credenciais.');d.anexos.push({id:body.mutationId,nome:texto(body.link.nome,200,true),url:u.href,por:autor,em:agora});}
 }else{
  if(!ant)falha('Salve a demanda antes do arquivo.');d=structuredClone(ant.registro);
  if(typeof body.base64!=='string'||body.base64.length>14000000)falha('Arquivo acima de 10 MB.');
  let bytes;try{bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));}catch{falha('Arquivo inválido.');}
  const pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-',png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!bytes.length||bytes.length>10000000||!(pdf||png||jpg))falha('Envie PDF, PNG ou JPEG de até 10 MB.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const path=d.id+'/'+hash, nome=texto(body.nome,200,true),mime=pdf?'application/pdf':png?'image/png':'image/jpeg';
  const {error}=await sb.storage.from('pcp-demandas').upload(path,bytes,{contentType:mime,upsert:false});if(error&&String(error.statusCode)!=='409')falha('Falha ao enviar arquivo. Tente novamente.',503);
  d.anexos=[...(d.anexos||[])];if(!d.anexos.some(f=>f.path===path))d.anexos.push({id:body.mutationId,path,nome,por:autor,em:agora});
 }
 d.criadoEm=ant?.registro.criadoEm||agora;d.criadoPor=ant?.registro.criadoPor||autor;d.atualizadoEm=agora;d.atualizadoPor=autor;
 d.historico=[...(ant?.registro.historico||[]),{id:body.mutationId,por:autor,em:agora,evento:op==='anexar'?'Arquivo anexado':ant?'Demanda atualizada':'Demanda criada',antes:ant?{titulo:ant.registro.titulo,descricao:ant.registro.descricao,resultadoEsperado:ant.registro.resultadoEsperado,prazo:ant.registro.prazo,situacao:ant.registro.situacao,prioridade:ant.registro.prioridade,responsavelId:ant.registro.responsavelId,envolvidos:ant.registro.envolvidos,osIds:ant.registro.osIds,acoes:ant.registro.acoes}:null}];
 if(JSON.stringify(d).length>1500000)falha('Histórico acima do limite. Solicite apoio à administração.');
 const {data,error}=await sb.rpc('pcp_demanda_gravar',{p_id:d.id,p_registro:d,p_revision:body.expectedRevision,p_mutation:body.mutationId});
 if(error)falha(error.code==='40001'?'Outra pessoa atualizou a demanda. Atualize antes de reenviar.':'Não foi possível confirmar a gravação.',error.code==='40001'?409:503);
 return {ok:true,demanda:{...data.registro,revision:data.revision}};
}
