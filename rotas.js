/* Planejamento de viagens. Não grava nem conclui O.S. Distâncias vêm do provedor. */
const ROTAS = (() => {
  const numero = v => v === '' || v == null ? null : Number(String(v).replace(',', '.'));
  const positivo = v => Number.isFinite(numero(v)) && numero(v) > 0;
  const ponto = p => !!p && p.lat !== '' && p.lng !== '' && p.lat != null && p.lng != null && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lng) <= 180;
  const minutos = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '') ? +s.slice(0,2)*60 + +s.slice(3) : null;
  const hora = m => { const n=Math.round(m),dias=Math.floor(n/1440); return `${String(Math.floor(n%1440/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${dias ? ' (+'+dias+' dia)' : ''}`; };
  function validar(plano) {
    const erros=[];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(plano.data||''))erros.push('Escolha o dia da rota.');
    if(minutos(plano.saida)==null)erros.push('Informe a hora de saída.');
    if(!ponto(plano.origem)||!plano.origem.confirmado)erros.push('Confirme o local de saída.');
    if(!plano.paradas?.length)erros.push('Selecione pelo menos um serviço.');
    if(plano.paradas?.length>20)erros.push('Use até 20 paradas por rota.');
    const ids=new Set();
    for(const [i,p] of (plano.paradas||[]).entries()){
      if(!p.id||ids.has(p.id))erros.push('Há serviço repetido na rota.');ids.add(p.id);
      if(!p.endereco?.trim()||!ponto(p)||!p.confirmado)erros.push(`Parada ${i+1}: confira endereço e localização.`);
      if(!Number.isFinite(numero(p.servicoMin))||numero(p.servicoMin)<0||numero(p.servicoMin)>1440)erros.push(`Parada ${i+1}: informe a duração entre 0 e 1440 minutos.`);
      if(p.inicio&&minutos(p.inicio)==null||p.fim&&minutos(p.fim)==null||p.inicio&&p.fim&&minutos(p.inicio)>minutos(p.fim))erros.push(`Parada ${i+1}: confira a janela de atendimento.`);
    }
    return [...new Set(erros)];
  }
  function calcular(plano, resposta) {
    const erros=validar(plano);if(erros.length)throw new Error(erros.join(' '));
    const pernas=resposta?.legs;
    if(!Array.isArray(pernas)||pernas.length!==plano.paradas.length+(plano.voltar?1:0)||pernas.some(x=>!Number.isFinite(x.distance)||x.distance<0||!Number.isFinite(x.duration)||x.duration<0))throw new Error('O serviço de mapas devolveu trechos incompletos. Recalcule.');
    if(!Array.isArray(resposta.geometry)||resposta.geometry.length<2||resposta.geometry.some(p=>!Array.isArray(p)||!ponto({lng:p[0],lat:p[1]})))throw new Error('O serviço de mapas não devolveu o desenho do trajeto.');
    let t=minutos(plano.saida),km=0,viagem=0,visitas=0,espera=0;
    const paradas=plano.paradas.map((p,i)=>{const leg=pernas[i],trecho=leg.distance/1000,tempo=leg.duration/60;km+=trecho;viagem+=tempo;t+=tempo;
      const chegada=t,ini=minutos(p.inicio),fim=minutos(p.fim),aguardar=ini==null?0:Math.max(0,ini-t);t+=aguardar;espera+=aguardar;
      const atraso=fim!=null&&t>fim,duracao=numero(p.servicoMin);visitas+=duracao;t+=duracao;
      return {...p,trechoKm:trecho,trechoMin:tempo,chegada,atendimento:chegada+aguardar,partida:t,espera:aguardar,atraso};});
    if(plano.voltar){const l=pernas.at(-1);km+=l.distance/1000;viagem+=l.duration/60;t+=l.duration/60;}
    const litros=positivo(plano.consumo)?km/numero(plano.consumo):null;
    const custo=litros!=null&&positivo(plano.preco)?litros*numero(plano.preco):null;
    const pedagio=numero(plano.pedagio);
    return {paradas,km,viagem,visitas,espera,fim:t,total:t-minutos(plano.saida),litros,custo,pedagio:Number.isFinite(pedagio)&&pedagio>=0?pedagio:null,geometry:resposta.geometry,mapa:resposta.mapa||null,avisoMapa:resposta.avisoMapa||'',instrucoes:resposta.instrucoes||[],fonte:resposta.fonte||'Serviço de mapas',em:new Date().toISOString(),demonstracao:!!resposta.demonstracao};
  }
  function ordenar(paradas, matriz, voltar=false){
    const n=paradas.length;if(!Array.isArray(matriz)||matriz.length!==n+1||matriz.some(r=>r.length!==n+1||r.some(x=>!Number.isFinite(x)||x<0)))throw new Error('Não foi possível comparar todos os trechos.');
    // Preserva compromissos e prioridades: não move nenhuma parada com restrição.
    if(paradas.some(p=>p.inicio||p.fim||p.prioridade))return {ordem:paradas.map((_,i)=>i),motivo:'Há horário ou prioridade fixada. Ajuste a ordem manualmente.'};
    const custo=ordem=>{let a=0,s=0;for(const i of ordem){s+=matriz[a][i+1];a=i+1;}return s+(voltar?matriz[a][0]:0);};
    let ordem=paradas.map((_,i)=>i),melhor=custo(ordem),mudou=true,rodadas=0;
    while(mudou&&rodadas++<30){mudou=false;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const alt=[...ordem];[alt[i],alt[j]]=[alt[j],alt[i]];const c=custo(alt);if(c<melhor-1){ordem=alt;melhor=c;mudou=true;}}}
    return {ordem,economiaMin:(custo(paradas.map((_,i)=>i))-melhor)/60,motivo:'Sugestão por tempo de deslocamento, sem garantia de mínimo absoluto.'};
  }
  function elegivel(os){return !!os&&!os.finalizadaEm&&!os.arquivadaEm&&!os.canceladaEm&&os.tipo!=='interno'&&!os.baixaAutoERP&&os.statusERP!=='CANCELADO';}
  const local = p => p && p.confirmado && ponto(p) ? `${p.lat},${p.lng}` : String(p?.endereco||'').trim();
  function google(plano, parada){
    const alvo=parada||plano.paradas[0];if(!alvo||!local(alvo))return '';
    const i=plano.paradas.indexOf(alvo),origem=i>0?plano.paradas[i-1]:plano.origem;
    return 'https://www.google.com/maps/dir/?api=1'+(local(origem)?'&origin='+encodeURIComponent(local(origem)):'')+'&destination='+encodeURIComponent(local(alvo))+'&travelmode=driving';
  }
  // Três pontos intermediários no máximo para compatibilidade com navegador móvel.
  // As partes compartilham o último ponto, sem omitir nenhuma parada ou retorno.
  function mapas(plano){
    if(!local(plano.origem)||!plano.paradas?.length||plano.paradas.some(p=>!local(p)))return [];
    const pontos=[plano.origem,...plano.paradas,...(plano.voltar?[plano.origem]:[])],partes=[];
    let inicio=0;
    while(inicio<pontos.length-1){
      let fim=Math.min(inicio+4,pontos.length-1),url='';
      do {const trecho=pontos.slice(inicio,fim+1);url='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(local(trecho[0]))+'&destination='+encodeURIComponent(local(trecho.at(-1)))+(trecho.length>2?'&waypoints='+encodeURIComponent(trecho.slice(1,-1).map(local).join('|')):'');if(url.length<=2048)break;fim--;}while(fim>inicio);
      if(fim<=inicio)return [];
      partes.push({url,inicio,fim,retorno:fim===pontos.length-1&&!!plano.voltar});inicio=fim;
    }
    return partes;
  }
  return {numero,ponto,minutos,hora,validar,calcular,ordenar,elegivel,google,mapas};
})();
if(typeof module!=='undefined')module.exports=ROTAS;
