// Persistência privada de roteiros. Nunca escreve em O.S.
const falha=(msg,status=400)=>{throw Object.assign(new Error(msg),{status});};
const texto=(v,n=300)=>typeof v==='string'?v.slice(0,n):'';
const id=v=>typeof v==='string'&&/^[\w:.-]{1,100}$/.test(v);
const selecionar=(o,campos)=>Object.fromEntries(campos.split(' ').filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const numero=v=>{if(v===''||v==null)return '';const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:'';};
function ponto(p={}){return {endereco:texto(p.endereco,800),lat:numero(p.lat),lng:numero(p.lng),confirmado:p.confirmado===true};}
function parada(p={}){return {...ponto(p),id:texto(p.id,100),numero:texto(p.numero,80),cliente:texto(p.cliente),servico:texto(p.servico,2000),servicoMin:numero(p.servicoMin),inicio:texto(p.inicio,5),fim:texto(p.fim,5),execucao:texto(p.execucao,30),motivo:texto(p.motivo,800)};}
const metricas='km viagem visitas espera fim total litros custo pedagio';
export function limparRota(p){
 if(!p||!id(p.id)||!texto(p.nome).trim()||!/^\d{4}-\d{2}-\d{2}$/.test(p.data||'')||!Array.isArray(p.paradas)||p.paradas.length>20)falha('Confira nome, data e paradas da rota.');
 if(new Set(p.paradas.map(a=>a.id)).size!==p.paradas.length||p.paradas.some(a=>!id(a.id)))falha('Paradas inválidas ou repetidas.');
 const r={...selecionar(p,'id nome data saida equipe motorista veiculoId modo estado combustivel'),veiculo:texto(p.veiculo),origem:ponto(p.origem),voltar:p.voltar===true,paradas:p.paradas.map(parada),consumo:numero(p.consumo),preco:numero(p.preco),pedagio:numero(p.pedagio),resultado:null};
 for(const k of 'id nome data saida equipe motorista veiculoId modo estado combustivel'.split(' '))r[k]=texto(r[k]);
 if(!['Rascunho','Confirmada','Em andamento','Concluída'].includes(r.estado))falha('Situação inválida.');
 if(p.resultado){const q=p.resultado;if(q.demonstracao)falha('Resultados de demonstração não podem ser salvos no sistema.');
 const geometry=q.geometry;if(!Array.isArray(geometry)||geometry.length>50000||geometry.some(c=>!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90))falha('Trajeto inválido.');
 const mapa=q.mapa||null;if(mapa&&(typeof mapa!=='string'||mapa.length>3000000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(mapa)))falha('Imagem do mapa inválida.');
 if(!Array.isArray(q.instrucoes)||q.instrucoes.length>21||q.instrucoes.some(a=>!Array.isArray(a)||a.length>1000))falha('Instruções inválidas.');
 r.resultado={...Object.fromEntries(metricas.split(' ').map(k=>[k,Number.isFinite(q[k])?q[k]:null])),geometry,mapa,avisoMapa:texto(q.avisoMapa),fonte:texto(q.fonte),em:texto(q.em,50),instrucoes:q.instrucoes.map(a=>a.map(s=>({texto:texto(s.texto,1000),metros:numero(s.metros)}))),paradas:r.paradas.map((a,i)=>({...a,...Object.fromEntries('trechoKm trechoMin chegada atendimento partida espera'.split(' ').map(k=>[k,Number.isFinite(q.paradas?.[i]?.[k])?q.paradas[i][k]:null])),atraso:q.paradas?.[i]?.atraso===true}))};
 }
 if(r.estado!=='Rascunho'&&(!r.equipe||!r.veiculoId||!r.motorista.trim()||!r.resultado||!r.paradas.length))falha('Confirme equipe, veículo, motorista e cálculo antes de liberar a rota.');
 return r;
}
export function podeLerRota(p,c,cfg){if(['admin','pcp'].includes(c?.papel))return true;
 if(!['montagem','operacao','instalador'].includes(c?.papel)||!/^\d{6}$/.test(String(c.id||''))||!['Confirmada','Em andamento','Concluída'].includes(p.estado))return false;
 return (cfg.performancePCP?.equipes||[]).some(e=>e.ativo!==false&&e.id===p.equipe&&(e.membros||[]).some(m=>String(m.pessoaId||m.chave)===String(c.id)));
}
export function rotaParaEquipe(p){const r=selecionar(p,'id nome data saida equipe equipeNome motorista veiculo veiculoId origem voltar paradas estado');if(p.resultado){r.resultado=selecionar(p.resultado,'km viagem visitas espera fim total geometry mapa avisoMapa fonte em instrucoes paradas');}return r;}
export async function executarRotas(body,{sb,cracha,cfg,agora=()=>new Date().toISOString()}){
 if(!cracha)falha('Entre no PCP.',403);const gestao=['admin','pcp'].includes(cracha.papel);
 if(!gestao&&!['montagem','operacao','instalador'].includes(cracha.papel))falha('Acesso às rotas não autorizado.',403);
 const ler=async key=>{const r=await sb.from('pcp_rotas').select('*').eq('id',key).maybeSingle();if(r.error)falha('Não foi possível consultar as rotas.',503);return r.data;};
 const entregar=row=>({registro:gestao?row.registro:rotaParaEquipe(row.registro),revision:row.revision,atualizado_em:row.atualizado_em});
 if(body.action==='rotasListar'){
 let q=sb.from('pcp_rotas').select('*').order('id').limit(50);if(!gestao){const equipes=(cfg.performancePCP?.equipes||[]).filter(e=>e.ativo!==false&&/^\d{6}$/.test(String(cracha.id||''))&&(e.membros||[]).some(m=>String(m.pessoaId||m.chave)===String(cracha.id))).map(e=>e.id);if(!equipes.length)return {rotas:[],cursor:null};q=q.in('registro->>equipe',equipes);}if(body.cursor){if(!id(body.cursor))falha('Cursor inválido.');q=q.gt('id',body.cursor);}const {data,error}=await q;if(error)falha('Não foi possível carregar as rotas.',503);
 return {rotas:(data||[]).filter(r=>podeLerRota(r.registro,cracha,cfg)).map(r=>{const v=entregar(r);if(v.registro.resultado){v.registro={...v.registro,resultado:{...v.registro.resultado,mapa:null,mapaNoServidor:!!v.registro.resultado.mapa}};}return v;}),cursor:data?.length===50?data.at(-1).id:null};
 }
 if(!id(body.id||body.rota?.id))falha('Identificador inválido.');const key=body.id||body.rota.id;
 const atual=await ler(key);
 if(body.action==='rotasObter'){if(!atual||!podeLerRota(atual.registro,cracha,cfg))falha('Rota indisponível para este acesso.',404);return entregar(atual);}
 if(body.action!=='rotasSalvar'||!gestao)falha('Somente a gestão pode salvar rotas.',403);
 if(!id(body.mutationId)||!Number.isSafeInteger(body.revision)||body.revision<0)falha('Revisão inválida.');
 if(atual?.mutation_id===body.mutationId)return entregar(atual);
 if((atual?.revision||0)!==body.revision)falha('Outra pessoa atualizou esta rota. Recarregue a versão do sistema antes de salvar.',409);
 const registro=limparRota(body.rota);if(key!==registro.id)falha('Identificador divergente.');
 const equipe=(cfg.performancePCP?.equipes||[]).find(e=>e.id===registro.equipe&&e.ativo!==false);
 if(registro.equipe&&!equipe)falha('Equipe não está ativa.');registro.equipeNome=texto(equipe?.nome);
 if(registro.veiculoId){const {data:v,error}=await sb.from('painel_registros').select('id,registro').eq('colecao','ativo').eq('id',registro.veiculoId).maybeSingle();if(error)falha('Não foi possível conferir o veículo.',503);if(!v||v.registro?.tipo!=='veiculo')falha('Selecione um veículo cadastrado.');registro.veiculo=[v.registro.nome,v.registro.especificacao?.placa||v.registro.identificacao].filter(Boolean).join(' · ');}
 if(registro.resultado&&!registro.resultado.mapa&&atual?.registro.resultado?.em===registro.resultado.em&&JSON.stringify(atual.registro.resultado.geometry)===JSON.stringify(registro.resultado.geometry)){registro.resultado.mapa=atual.registro.resultado.mapa;}
 registro.atualizadoPor=texto(cracha.id||cracha.sub,100);
 const row={id:key,registro,revision:body.revision+1,mutation_id:body.mutationId,atualizado_em:agora()};
 const res=atual?await sb.from('pcp_rotas').update(row).eq('id',key).eq('revision',body.revision).select('*').maybeSingle():await sb.from('pcp_rotas').insert(row).select('*').maybeSingle();
 if(res.error?.code==='23505'||!res.error&&!res.data)falha('Outra pessoa atualizou esta rota. Recarregue antes de salvar.',409);
 if(res.error)falha('Não foi possível salvar a rota. Seu rascunho foi preservado.',503);
 return entregar(res.data);
}
