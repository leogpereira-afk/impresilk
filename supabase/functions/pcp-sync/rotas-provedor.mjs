// Somente geometria e endereços. Nunca encaminha clientes, O.S. ou pessoas.
const ponto = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=85 && Math.abs(p.lng)<=180;
const falha = (mensagem,status=400) => Object.assign(new Error(mensagem),{status});
export async function executarMapa(body, {papel,key,fetcher=fetch}) {
  if(!['admin','pcp'].includes(papel))throw falha('Mapas disponíveis somente para a gestão do PCP.',403);
  if(body.action==='rotasStatus')return {configurado:!!key,provedor:'Geoapify'};
  if(!key)throw falha('O serviço de mapas ainda não está configurado. Ative a chave Geoapify no servidor.',503);
  let url;
  if(body.action==='rotasLocalizar'){
    if(typeof body.endereco!=='string'||body.endereco.trim().length<8||body.endereco.length>500)throw falha('Informe rua, número e cidade (até 500 caracteres).');
    url=new URL('https://api.geoapify.com/v1/geocode/search');
    url.search=new URLSearchParams({text:body.endereco.trim(),filter:'countrycode:br',lang:'pt',limit:'5',format:'json'}).toString();
  }else if(body.action==='rotasCalcular'){
    if(!Array.isArray(body.pontos)||body.pontos.length<2||body.pontos.length>22||!body.pontos.every(ponto))throw falha('Use de 2 a 22 pontos conferidos.');
    if(!['drive','light_truck','medium_truck','truck'].includes(body.modo))throw falha('Escolha o perfil do veículo.');
    url=new URL('https://api.geoapify.com/v1/routing');
    url.search=new URLSearchParams({waypoints:body.pontos.map(p=>`${p.lat},${p.lng}`).join('|'),mode:body.modo,lang:'pt-BR',units:'metric',format:'geojson',details:'instruction_details',traffic:'free_flow'}).toString();
  }else throw falha('Ação de mapas inválida.');
  url.searchParams.set('apiKey',key);
  let data;
  try {const res=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!res.ok)throw falha(res.status===429?'Limite do serviço de mapas atingido. Aguarde e tente novamente.':'Serviço de mapas indisponível. Confira a configuração e tente novamente.',res.status===429?429:502);data=await res.json();}
  catch(e){if(e.status)throw e;throw falha('Não foi possível consultar os mapas agora. Tente novamente.',502);}
  if(body.action==='rotasLocalizar')return {candidatos:(data.results||[]).filter(p=>ponto({lat:p.lat,lng:p.lon})).slice(0,5).map(p=>({endereco:String(p.formatted||'').slice(0,500),lat:p.lat,lng:p.lon,tipo:String(p.result_type||''),confianca:typeof p.rank?.confidence==='number'?p.rank.confidence:null})),fonte:'Geoapify'};
  const f=data.features?.[0],ls=f?.properties?.legs,g=f?.geometry;
  const geometry=g?.type==='MultiLineString'?g.coordinates.flat():g?.type==='LineString'?g.coordinates:null;
  if(!Array.isArray(ls)||ls.length!==body.pontos.length-1||ls.some(l=>!Number.isFinite(l.distance)||l.distance<0||!Number.isFinite(l.time)||l.time<0)||!Array.isArray(geometry)||geometry.length<2||geometry.length>100000||geometry.some(p=>!Array.isArray(p)||!ponto({lng:p[0],lat:p[1]})))throw falha('O provedor não devolveu todos os trechos. Confira os pontos e recalcule.',502);
  let mapa=null,avisoMapa='';
  try {
    const u=new URL('https://maps.geoapify.com/v1/staticmap');u.searchParams.set('apiKey',key);
    const ps=body.pontos.filter((p,i,arr)=>i===0||i!==arr.length-1||p.lat!==arr[0].lat||p.lng!==arr[0].lng);
    const res=await fetcher(u,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error',body:JSON.stringify({style:'osm-bright',width:760,height:440,format:'png',markers:ps.map((p,i)=>({lat:p.lat,lon:p.lng,color:i?'#1761cf':'#173d60',text:String(i||'S'),size:'small'})),geometries:[{type:'polyline',linecolor:'#1761cf',linewidth:5,value:geometry.map(p=>({lon:p[0],lat:p[1]}))}]})});
    if(!res.ok||!res.headers.get('content-type')?.startsWith('image/png'))throw Error('mapa');
    const bytes=new Uint8Array(await res.arrayBuffer());if(bytes.length>2000000||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('imagem');
    let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,i+8192));mapa='data:image/png;base64,'+btoa(bin);
  } catch { avisoMapa='Imagem das ruas indisponível. O esquema não substitui o mapa. Tente calcular novamente.'; }
  return {mapa,avisoMapa,legs:ls.map(l=>({distance:l.distance,duration:l.time})),geometry,instrucoes:ls.map(l=>(l.steps||[]).filter(s=>s.instruction?.text).map(s=>({texto:String(s.instruction.text).slice(0,1000),metros:Number.isFinite(s.distance)?s.distance:0}))),fonte:'Geoapify · OpenStreetMap',modo:body.modo};
}
