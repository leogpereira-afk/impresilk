/* Relatório de leitura: nenhuma seleção altera lançamentos ou apurações. */
/* As áreas da produção escolhidas ficam NESTE aparelho: voltar à lista do
   código a cada recarga mudava a média por pessoa sem aviso. */
const REL_ENT_AREAS_PADRAO=['Acabamento','Impressão digital','Montagem Interna','Operação de maquinas.','Serralheria','Instalação Externa'];
function relEntAreasSalvas(){try{const v=JSON.parse(localStorage.getItem('pcp_rel_areas_producao') || 'null');if(Array.isArray(v))return new Set(v.map(String));}catch(e){}return new Set(REL_ENT_AREAS_PADRAO);}
function relEntGuardarAreas(){try{localStorage.setItem('pcp_rel_areas_producao',JSON.stringify([...REL_ENT.areasProducao]));}catch(e){}}
/* Mês em andamento: a base vai até hoje e o mês ainda não fechou. */
function relEntParcial(m){const ate=String(REL_ENT.dados?.corteFonte || REL_ENT.dados?.ate || '');if(!m || !ate || ate.slice(0,7)!==m.mes)return false;const [a,mm]=m.mes.split('-').map(Number);return ate.slice(8,10)<String(new Date(a,mm,0).getDate()).padStart(2,'0');}
function relEntMesTxt(m){const entreAnos=REL_ENT.intervalo && REL_ENT.intervalo.inicio.slice(0,4)!==REL_ENT.intervalo.fim.slice(0,4);return (entreAnos?relEntRotuloMes(m.mes):MES_CURTO[Number(m.mes.slice(5))-1])+(relEntParcial(m)?` (até ${relEntData(REL_ENT.dados.ate).slice(0,5)})`:'');}
/* Erro de rede do navegador ("Failed to fetch", "Load failed") e tempo
   esgotado viram português; toda mensagem termina com ponto. */
function relEntErroTxt(e){const m=String(e && e.message || '');if(!m || e?.name==='TypeError' || e?.name==='AbortError' || /failed to fetch|load failed|networkerror|network request|abort|timeout|timed out/i.test(m))return 'Sem conexão com o servidor. Tente de novo.';return /[.!?]$/.test(m)?m:m+'.';}
const REL_ENT = {
 /* Abre no mês atual. Valores parciais ficam identificados e fora da base estatística. */
 ano:new Date().getFullYear(), foco:String(new Date().getMonth()+1).padStart(2,'0'), selecionados:new Set(['entregue','vendido','recebido','funcionarios','retrabalho']), areasProducao:relEntAreasSalvas(), dados:null,equipe:null,erro:'',carregando:false,mes:null,metrica:'entregue',pedido:0,
 // Quadros recolhíveis abertos: o render recria o HTML e fechava o quadro a cada marca.
 abertos:{}, filtroPontualidade:'todas', limitePontualidade:50, intervalo:null, analises:{pontualidade:{previsao:false,tendencia:false},financeiro:{previsao:false,tendencia:false}},
 indicadores:{entregue:{nome:'Entregue',cor:'#167a70',unidade:'R$'},vendido:{nome:'Vendido · O.S.',cor:'#3763cf',unidade:'R$'},recebido:{nome:'Dinheiro recebido',cor:'#9b51ba',unidade:'R$'},funcionarios:{nome:'Funcionários',cor:'#b47410',unidade:'pessoas'},retrabalho:{nome:'Índice de retrabalho',cor:'#cf493a',unidade:'%'}}
};
function relEntData(v){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));return m?`${m[3]}/${m[2]}/${m[1]}`:'—';}
// O servidor só entrega o relatório à gestão do PCP; para os outros papéis a aba era um erro garantido.
function relEntPodeVer(){return typeof STATE==='undefined' || ['admin','pcp'].includes(String(STATE.user?.papel || ''));}
/* A terceira aba, Fechar o dia (lote.js, F14), só aparece quando o lote.js carregou (cache misto não mostra aba que não abre). */
function abasEntregasHTML(ativa) {if(!relEntPodeVer())return '';const lote=typeof renderLoteEntregas==='function'?`<button class="btn-ghost ${ativa==='lote'?'active':''}" data-ent-aba="lote" aria-pressed="${ativa==='lote'}">✅ Fechar o dia</button>`:'';return `<nav class="rel-ent-abas" aria-label="Entregas e relatórios"><button class="btn-ghost ${ativa==='lista'?'active':''}" data-ent-aba="lista" aria-pressed="${ativa==='lista'}">📦 Entregas</button><button class="btn-ghost ${ativa==='relatorios'?'active':''}" data-ent-aba="relatorios" aria-pressed="${ativa==='relatorios'}">📈 Relatórios</button>${lote}</nav>`;}
function wireAbasEntregas(el) {el.querySelectorAll('[data-ent-aba]').forEach(b=>b.onclick=()=>{STATE._entAba=b.dataset.entAba;renderEntregas();});}
function relEntValor(v,k,curto=false) {
 if(v===null || v===undefined || !Number.isFinite(v))return 'Sem informação';
 if(k==='retrabalho')return v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 if(k==='funcionarios')return v.toLocaleString('pt-BR')+' pessoas';
 return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:curto?0:2,...(curto?{notation:'compact'}:{})});
}
async function relEntCarregar() {
 const r=REL_ENT,id=++r.pedido,ano=r.ano,intervalo=r.intervalo?{...r.intervalo}:null;r.carregando=true;r.erro='';r.dados=null;r.equipe=null;renderRelatoriosEntregas();
 try {
  const inicio=intervalo?.inicio || `${ano}-01`,fim=intervalo?.fim || `${ano}-12`,validacao=relEntValidarIntervalo(inicio,fim);
  if(!validacao.ok)throw new Error(validacao.erro);
  const anos=Array.from({length:Number(fim.slice(0,4))-Number(inicio.slice(0,4))+1},(_,i)=>Number(inicio.slice(0,4))+i),hoje=OPERACAO.dia(new Date());
  const meses=anos.flatMap(a=>Array.from({length:12},(_,i)=>`${a}-${String(i+1).padStart(2,'0')}`)).filter(m=>m<=hoje.slice(0,7));
  const [relatorios,h]=await Promise.all([Promise.all(anos.map(a=>STORE.api({action:'relatorioEntregas',ano:a}))),STORE.api({action:'equipeHistorico',meses})]);
  if(id!==r.pedido)return;
  const erro=relatorios.find(d=>d.error)?.error || h.error;if(erro)throw new Error(erro);
  if(relatorios.some(d=>!Array.isArray(d.meses)) || !Array.isArray(h.meses))throw new Error('Resposta incompleta das fontes.');
  const ultimoDia=new Date(Date.UTC(Number(fim.slice(0,4)),Number(fim.slice(5)),0)).toISOString().slice(0,10);
  r.dados={...relatorios[0],corteFonte:hoje,de:inicio+'-01',ate:[ultimoDia,hoje].sort()[0],meses:relatorios.flatMap(d=>d.meses).sort((a,b)=>a.mes.localeCompare(b.mes)),consultadoEm:new Date().toISOString(),recebimentosEm:relatorios.map(d=>d.recebimentosEm).filter(Boolean).sort().at(-1)||null};r.equipe=h;
  for(const m of r.dados.meses){const rh=h.meses.find(x=>x.mes===m.mes);m.funcionarios=m.futuro?null:rh?.total??null;m.rh=rh;}
 }catch(e){if(id===r.pedido)r.erro=relEntErroTxt(e);}
 finally{if(id===r.pedido){r.carregando=false;if(STATE._entAba==='relatorios')renderRelatoriosEntregas();}}
}
function relEntMesIndice(mes){const [a,m]=mes.split('-').map(Number);return a*12+m-1;}
function relEntMesDoIndice(i){return `${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;}
function relEntRotuloMes(mes){return MES_CURTO[Number(mes.slice(5))-1]+'/'+mes.slice(2,4);}
function relEntValidarIntervalo(inicio,fim){
 const valido=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
 if(!valido(inicio)||!valido(fim))return {ok:false,erro:'Informe mês e ano válidos.'};
 if(inicio>fim)return {ok:false,erro:'O início precisa ser anterior ou igual ao fim.'};
 if(inicio<'2020-01'||fim>`${new Date().getFullYear()}-12`)return {ok:false,erro:'Escolha um período entre 2020 e o ano atual.'};
 const agora=new Date(),mesAtual=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
 if(inicio>mesAtual)return {ok:false,erro:'O início precisa ser um mês já iniciado.'};
 return {ok:true,inicio,fim};
}
function relEntSelecionarMes(mes){
 const r=REL_ENT;r.foco=mes;r.intervalo=null;r.mes=null;r.limitePontualidade=50;
 if(r.dados){r.dados.de=r.ano+'-01-01';r.dados.ate=[r.ano+'-12-31',r.dados.corteFonte||r.dados.ate].sort()[0];}
}
function relEntAtualizarCorte(){
 const r=REL_ENT;if(!r.dados||!r.intervalo)return;
 const {inicio,fim}=r.intervalo,ultimo=new Date(Date.UTC(Number(fim.slice(0,4)),Number(fim.slice(5)),0)).toISOString().slice(0,10);
 r.dados.de=inicio+'-01';r.dados.ate=[ultimo,r.dados.corteFonte||r.dados.ate].sort()[0];
}
function relEntMesesBase(){const r=REL_ENT;return (r.dados?.meses || []).filter(m=>r.intervalo?(m.mes>=r.intervalo.inicio&&m.mes<=r.intervalo.fim):true);}
function relEntReferencia(){
 const r=REL_ENT,ms=relEntMesesBase(),foco=r.ano+'-'+r.foco;
 if(!r.intervalo&&r.foco&&ms.some(m=>m.mes===foco))return foco;
 return ms.filter(m=>!m.futuro).at(-1)?.mes || ms[0]?.mes || `${r.ano}-${r.foco || '01'}`;
}
function relEntMesesGrafico(){const ref=relEntReferencia();return relEntMesesBase().filter(m=>m.mes<=ref);}
function relEntQuadroHTML(chave,titulo,conteudo,aberto=true){return `<details class="rel-ent-quadro" data-rel-quadro="${chave}" ${(REL_ENT.abertos[chave]??aberto)?'open':''}><summary><h3>${titulo}</h3><span class="rel-ent-recolher">Recolher</span><span class="rel-ent-expandir">Expandir</span></summary><div class="rel-ent-quadro-corpo">${conteudo}</div></details>`;}
function relEntControlesAnalise(quadro){
 const a=REL_ENT.analises[quadro];return `<div class="rel-ent-analises" role="group" aria-label="Análises de ${quadro==='pontualidade'?'pontualidade':'produção e dinheiro'}">${[['previsao','Previsão descritiva'],['tendencia','Linha de tendência']].map(([tipo,nome])=>`<label><input type="checkbox" id="rel-ent-${quadro}-${tipo}" data-rel-analise-quadro="${quadro}" data-rel-analise-tipo="${tipo}" ${a[tipo]?'checked':''}>${nome}</label>`).join('')}<small>Dois meses à frente · somente neste quadro</small></div>`;
}
function relEntPeriodoTxt(){const r=REL_ENT;if(r.intervalo)return relEntRotuloMes(r.intervalo.inicio)+(r.intervalo.inicio===r.intervalo.fim?'':' a '+relEntRotuloMes(r.intervalo.fim));return r.foco?MES_CURTO[Number(r.foco)-1]+' / '+r.ano:'Ano '+r.ano;}
/* Referência descritiva: média dos últimos três meses completos e consecutivos.
   A faixa é o mínimo/máximo observado, nunca um intervalo de confiança.
   Pontualidade pondera a média pelo número de O.S.; regressão usa meses com
   mesmo peso e distância real no calendário. Nenhuma estimativa vira registro. */
function relEntAnaliseSerie(pontos,{ponderada=false,percentual=false,referencia=null}={}){
 referencia=referencia || pontos.filter(p=>!p.futuro).at(-1)?.mes;
 const projetados=referencia?[1,2].map(i=>relEntMesDoIndice(relEntMesIndice(referencia)+i)):[];
 const fechado=pontos.filter(p=>!p.futuro && !p.parcial && (!referencia||p.mes<=referencia)).sort((a,b)=>a.mes.localeCompare(b.mes));
 const valido=p=>Number.isFinite(p.valor)&&p.elegivel!==false&&(!ponderada || Number.isFinite(p.peso)&&p.peso>0);
 const base=fechado.filter(valido),ultimos=fechado.slice(-3),resultado={estatistica:null,previsoes:[],tendencia:null};
 if(ultimos.length===3 && ultimos.every(valido) && relEntMesIndice(ultimos[2].mes)-relEntMesIndice(ultimos[0].mes)===2){
  const valores=ultimos.map(p=>p.valor).sort((a,b)=>a-b),peso=ultimos.reduce((s,p)=>s+(ponderada?p.peso:1),0);
  const media=ultimos.reduce((s,p)=>s+p.valor*(ponderada?p.peso:1),0)/peso;
  resultado.estatistica={media,mediana:valores[1],min:valores[0],max:valores[2],n:3,peso,desde:ultimos[0].mes,ate:ultimos[2].mes};
  for(const mes of projetados)resultado.previsoes.push({mes,valor:media,min:valores[0],max:valores[2]});
 }
 if(base.length>=3){
  const origem=relEntMesIndice(base[0].mes),xs=base.map(p=>relEntMesIndice(p.mes)-origem),xm=xs.reduce((a,b)=>a+b,0)/base.length,ym=base.reduce((s,p)=>s+p.valor,0)/base.length;
  const sxx=xs.reduce((s,x)=>s+(x-xm)**2,0),sxy=xs.reduce((s,x,i)=>s+(x-xm)*(base[i].valor-ym),0);
  if(sxx>0){
   const inclinacao=sxy/sxx,intercepto=ym-inclinacao*xm,prever=x=>intercepto+inclinacao*x;
   const total=base.reduce((s,p)=>s+(p.valor-ym)**2,0),residuo=base.reduce((s,p,i)=>s+(p.valor-prever(xs[i]))**2,0);
   const limitar=v=>percentual?Math.min(100,Math.max(0,v)):v;
   resultado.tendencia={projecoes:projetados.map(mes=>({mes,valor:limitar(prever(relEntMesIndice(mes)-origem))})),inclinacao,r2:total===0?1:Math.max(0,1-residuo/total),n:base.length,pontos:base.map((p,i)=>({mes:p.mes,valor:percentual?Math.min(100,Math.max(0,prever(xs[i]))):prever(xs[i])}))};
  }
 }
 return resultado;
}
function relEntGrafico(chaves,titulo){
 const ms=relEntMesesGrafico(),analisar=chaves.every(k=>REL_ENT.indicadores[k].unidade==='R$');
 const series=chaves.map(k=>({...REL_ENT.indicadores[k],chave:k,pontos:ms.map(m=>({mes:m.mes,valor:m[k],futuro:m.futuro,parcial:relEntParcial(m)}))}));
 return relEntQuadroHTML('quadro-'+(analisar?'financeiro':chaves[0]),titulo,relEntDesenharGrafico(series,ms,titulo,{analisar}));
}
function relEntGraficoPontualidade(){
 const ms=relEntMesesGrafico(),medidas=ms.map(m=>({m,p:relEntPontualidade([m])}));
 const series=[{chave:'noPrazo',nome:'No prazo',cor:'#167a70'},{chave:'atraso',nome:'Com atraso',cor:'#c54738'}].map(s=>({...s,unidade:'%',pontos:medidas.map(({m,p})=>({mes:m.mes,valor:s.chave==='noPrazo'?p.percentualNoPrazo:p.percentualAtraso,peso:p.comparaveis,elegivel:!p.semComparacao&&!p.mesesSemFonte.length,parcial:relEntParcial(m),futuro:m.futuro}))}));
 return relEntDesenharGrafico(series,ms,'Evolução da pontualidade · %',{analisar:true,pontualidade:true});
}
function relEntDesenharGrafico(series,ms,titulo,{analisar=false,pontualidade=false}={}){
 const r=REL_ENT,W=1040,H=270,L=104,R=46,T=28,B=42,quadro=pontualidade?'pontualidade':'financeiro',opcoes=r.analises[quadro],previsao=analisar&&opcoes.previsao,tendencia=analisar&&opcoes.tendencia,referencia=relEntReferencia();
 const valor=(v,s,curto=false)=>s.unidade==='%'?relEntPercentual(v):relEntValor(v,s.chave,curto);
 const analises=series.map(s=>relEntAnaliseSerie(s.pontos,{ponderada:pontualidade,percentual:s.unidade==='%',referencia}));
 const reais=series.flatMap(s=>s.pontos.filter(p=>!p.futuro&&Number.isFinite(p.valor)).map(p=>p.valor));
 if(!reais.length)return `<section class="rel-ent-grafico"><h3>${titulo}</h3>${analisar?relEntControlesAnalise(quadro):''}<p class="text-muted">Sem dados comparáveis no período selecionado. Nenhuma previsão foi calculada.</p></section>`;
 const meses=[...new Set([...ms.map(m=>m.mes),...(previsao||tendencia?[1,2].map(i=>relEntMesDoIndice(relEntMesIndice(referencia)+i)):[])])].sort();
 const primeiro=relEntMesIndice(meses[0]),ultimo=relEntMesIndice(meses.at(-1));
 const extremos=[...reais,...(previsao?analises.flatMap(a=>a.previsoes.flatMap(p=>[p.min,p.max])):[]),...(tendencia?analises.flatMap(a=>a.tendencia?[...a.tendencia.pontos,...a.tendencia.projecoes].map(p=>p.valor):[]):[])];
 const percentual=pontualidade,min=percentual?0:Math.min(0,...extremos),max=percentual?100:Math.max(1,...extremos)*1.12;
 const x=mes=>L+(ultimo===primeiro?.5:(relEntMesIndice(mes)-primeiro)/(ultimo-primeiro))*(W-L-R),y=v=>T+(max-v)*(H-T-B)/(max-min);
 let svg=`<rect data-rel-destaque="${referencia}" x="${x(referencia)-17}" y="${T}" width="34" height="${H-T-B}" fill="#e8eff8"/><text x="${x(referencia)}" y="15" text-anchor="middle" class="rel-ent-mes-destaque">${relEntRotuloMes(referencia)}${ms.find(m=>m.mes===referencia)&&relEntParcial(ms.find(m=>m.mes===referencia))?' · parcial':''}</text>`;
 for(let i=0;i<5;i++){const v=min+(max-min)*i/4;svg+=`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" class="rel-grid"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${esc(valor(v,series[0],true))}</text>`;}
 const passo=Math.max(1,Math.ceil(meses.length/14));meses.forEach((m,i)=>{if(i%passo===0 || i===meses.length-1)svg+=`<text x="${x(m)}" y="${H-13}" text-anchor="middle">${esc(relEntRotuloMes(m))}</text>`;});
 const notas=[];
 series.forEach((s,si)=>{
  const a=analises[si];let trecho=[],anterior=null;
  const fechar=()=>{if(trecho.length)svg+=`<polyline points="${trecho.join(' ')}" fill="none" stroke="${s.cor}" stroke-width="3"/>`;trecho=[];};
  for(const p of s.pontos){
   if(p.futuro||!Number.isFinite(p.valor)){fechar();anterior=null;continue;}
   if(anterior&&relEntMesIndice(p.mes)-relEntMesIndice(anterior.mes)>1){fechar();anterior=null;}
   if(p.parcial){fechar();if(anterior)svg+=`<line x1="${x(anterior.mes)}" y1="${y(anterior.valor)}" x2="${x(p.mes)}" y2="${y(p.valor)}" stroke="${s.cor}" stroke-width="3" stroke-dasharray="8 6"/>`;anterior=null;}
   else{trecho.push(`${x(p.mes)},${y(p.valor)}`);anterior=p;}
  }fechar();
  if(tendencia){if(a.tendencia){const ps=[...a.tendencia.pontos,...a.tendencia.projecoes];svg+=`<polyline data-rel-tendencia="${s.chave}" points="${ps.map(p=>`${x(p.mes)},${y(p.valor)}`).join(' ')}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-dasharray="2 5"><title>${esc(s.nome)} · tendência linear de ${a.tendencia.n} meses completos; projeção de dois meses</title></polyline>`;for(const p of a.tendencia.projecoes)svg+=`<rect data-rel-tendencia-mes="${p.mes}" x="${x(p.mes)-4}" y="${y(p.valor)-4}" width="8" height="8" fill="white" stroke="${s.cor}"><title>${esc(s.nome)} · tendência projetada ${relEntRotuloMes(p.mes)}: ${valor(p.valor,s)}</title></rect>`;}else notas.push(s.nome+': tendência indisponível; são necessários três meses completos com dados.');}
  if(previsao){
   if(a.previsoes.length){
    const ps=a.previsoes,e=a.estatistica,linha=ps.map(p=>`${x(p.mes)},${y(p.valor)}`).join(' ');
    svg+=`<polygon points="${ps.map(p=>`${x(p.mes)},${y(p.max)}`).join(' ')} ${ps.slice().reverse().map(p=>`${x(p.mes)},${y(p.min)}`).join(' ')}" fill="${s.cor}" opacity=".08"/><polyline data-rel-estimativa="${s.chave}" points="${x(e.ate)},${y(s.pontos.find(p=>p.mes===e.ate).valor)} ${linha}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-dasharray="6 4"/>`;
    for(const p of ps)svg+=`<path data-rel-previsao-mes="${p.mes}" d="M ${x(p.mes)} ${y(p.valor)-5} l 5 5 l -5 5 l -5 -5 Z" fill="white" stroke="${s.cor}" stroke-width="2"><title>${esc(s.nome)} · estimativa ${relEntRotuloMes(p.mes)}: ${valor(p.valor,s)}. Faixa observada: ${valor(p.min,s)} a ${valor(p.max,s)}.</title></path>`;
   }else notas.push(s.nome+': previsão indisponível; faltam três meses completos, consecutivos e com base válida no final do recorte.');
  }
  for(const p of s.pontos){if(p.futuro||!Number.isFinite(p.valor))continue;const label=`${s.nome}, ${relEntRotuloMes(p.mes)}${p.parcial?' (até '+relEntData(r.dados.ate).slice(0,5)+')':''}: ${valor(p.valor,s)}${p.parcial?', mês em andamento':''}${p.elegivel===false?', base incompleta':''}. Abrir detalhes`;
   svg+=`<g tabindex="0" role="button" ${pontualidade?`data-rel-prazo-ponto="${p.mes}" data-rel-prazo-tipo="${s.chave}"`:`data-rel-ponto="${p.mes}" data-rel-metrica="${s.chave}"`} aria-label="${esc(label)}"><title>${esc(label)}</title><rect x="${x(p.mes)-30}" y="${y(p.valor)-30}" width="60" height="60" fill="transparent"/><circle cx="${x(p.mes)}" cy="${y(p.valor)}" r="${p.mes===referencia?8:6}" fill="${p.parcial||p.elegivel===false?'white':s.cor}" stroke="${p.parcial||p.elegivel===false?s.cor:'white'}" stroke-width="2"/></g>`;
   if(p.mes===referencia)svg+=`<text data-rel-rotulo-mes="${p.mes}" x="${x(p.mes)}" y="${y(p.valor)+(si%2?19:-14)}" text-anchor="middle" class="rel-ent-valor-destaque" fill="${s.cor}">${esc(valor(p.valor,s,true))}</text>`;
  }
 });
 const estatisticas=previsao?`<details class="rel-ent-estatistica" data-rel-quadro="estatistica-${pontualidade?'prazo':series[0].chave}" ${r.abertos['estatistica-'+(pontualidade?'prazo':series[0].chave)]?'open':''}><summary>Base da previsão: média, mediana e faixa observada</summary><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Indicador</th><th>Base completa</th><th>Média usada</th><th>Mediana mensal</th><th>Mínimo a máximo</th></tr></thead><tbody>${series.map((s,i)=>{const e=analises[i].estatistica;return `<tr><th>${s.nome}</th>${e?`<td>${relEntRotuloMes(e.desde)} a ${relEntRotuloMes(e.ate)}</td><td>${valor(e.media,s)}</td><td>${valor(e.mediana,s)}</td><td>${valor(e.min,s)} a ${valor(e.max,s)}</td>`:'<td colspan="4">Base insuficiente</td>'}</tr>`;}).join('')}</tbody></table></div></details>`:'';
 return `<section class="rel-ent-grafico ${pontualidade?'rel-ent-prazo-evolucao':''}"><h3>${titulo}</h3>${analisar?relEntControlesAnalise(quadro):''}<p class="rel-ent-grafico-periodo">${relEntRotuloMes(ms[0].mes)} a ${relEntRotuloMes(ms.at(-1).mes)} · ${previsao?(analises.some(a=>a.previsoes.length)?'previsão para os dois meses seguintes a '+relEntRotuloMes(referencia)+'':'previsão indisponível neste recorte'):(tendencia?'tendência projetada dois meses à frente':'valores realizados')}</p><div class="rel-ent-legenda">${series.map(s=>`<span><i style="background:${s.cor}"></i>${s.nome}</span>`).join('')}</div><div class="rel-ent-svg"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${titulo}. Valores mensais; estimativas são identificadas separadamente.">${svg}</svg></div>${previsao||tendencia?`<details class="rel-ent-metodo" data-rel-quadro="metodo-${quadro}" ${r.abertos['metodo-'+quadro]?'open':''}><summary>Como ler as projeções</summary><p class="metricas-nota">${previsao?'◇ Tracejado: previsão pela média dos três últimos meses completos e consecutivos. Faixa sombreada: mínimo/máximo desses meses, não intervalo de confiança. '+(pontualidade?'Média ponderada pela quantidade de O.S.; mediana das taxas mensais. ':''):''}${tendencia?'Pontilhado: tendência linear dos meses completos do recorte, com mesmo peso por mês. ':''}Meses em andamento e bases incompletas não entram nas estimativas. Referência exploratória, sem ajuste de sazonalidade e sem garantia de resultado.</p></details>`:''}${notas.length?`<p class="metricas-nota rel-ent-sem-base">${notas.map(esc).join(' ')}</p>`:''}${estatisticas}</section>`;
}
function relEntMedia(m) {
 const r=REL_ENT,n=Object.entries(m.rh?.porArea || {}).reduce((s,[area,q])=>s+(r.areasProducao.has(area)?q:0),0);
 return {pessoas:n,valor:typeof m.entregue==='number' && n>0 && !m.rh?.piso?m.entregue/n:null};
}
function relEntMediasHTML(){
 const r=REL_ENT,areas=r.equipe.areas || [...new Set(r.dados.meses.flatMap(m=>Object.keys(m.rh?.porArea || {})))];
 return `<section class="rel-ent-grafico"><h3>Entregue por pessoa da produção</h3><p>Valor entregue no mês ÷ pessoas da produção com vínculo ativo naquele mês. É uma média da operação, não uma avaliação individual.</p><details data-rel-quadro="areas" ${r.abertos.areas?'open':''}><summary>Áreas consideradas na produção</summary><div class="rel-ent-seletores">${areas.map(a=>`<label><input type="checkbox" data-rel-area="${esc(a)}" ${r.areasProducao.has(a)?'checked':''}>${esc(a)}</label>`).join('')}</div></details><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Mês</th><th>Entregue</th><th>Pessoas da produção</th><th>Média por pessoa</th></tr></thead><tbody>${relEntMesesVisiveis().map(m=>{const v=relEntMedia(m);return `<tr><th>${relEntMesTxt(m)}</th><td>${relEntValor(m.entregue,'entregue')}</td><td>${v.pessoas}${m.rh?.piso?' (mínimo)':''}</td><td><strong>${relEntValor(v.valor,'entregue')}</strong></td></tr>`;}).join('')}</tbody></table></div><p class="metricas-nota">${esc([...r.areasProducao].join(', ')) || 'Nenhuma área selecionada'}. Uma pessoa conta uma vez no mês, mesmo que tenha trabalhado parte dele. Áreas conforme o cadastro atual do RH; transferências antigas de setor não têm histórico nesta fonte. Média indisponível quando faltam valores, há zero pessoas ou o histórico de desligamentos é incompleto.</p></section>`;
}
function relEntDetalhe() {
 const r=REL_ENT,m=r.dados?.meses.find(x=>x.mes===r.mes),k=r.metrica;if(!m)return '';
 let conteudo='';
 if(k==='funcionarios')conteudo=`<p>Pessoas com vínculo em algum dia do mês, até a data de corte. Não é média de pessoas nem quadro no último dia.</p>${m.rh?.piso?'<p class="rel-ent-aviso">Histórico mínimo: há desligamentos anteriores que o RH não registrou.</p>':''}<ul>${Object.entries(m.rh?.porArea || {}).map(([a,n])=>`<li>${esc(a)}: <strong>${n}</strong></li>`).join('')}</ul>`;
 else if(k==='recebido')conteudo='<p>Este valor vem do fluxo mensal de pagamentos do Mubisys. A fonte atual entrega o total do mês, sem os títulos individuais; não é possível listar parcelas neste relatório.</p>';
 else {const rows=k==='entregue'?m.entregas:k==='vendido'?m.vendas:m.retrabalhos;conteudo=(k==='retrabalho'?`<p>${rows.length} instalação(ões) marcada(s) com retrabalho em ${m.baseRetrabalho} instalações registradas no mês. A taxa pode mudar se um retrabalho for registrado depois.</p>`:'')+`<div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S.</th><th>Cliente</th><th>Data</th>${k==='retrabalho'?'':'<th>Valor</th>'}</tr></thead><tbody>${(rows || []).map(o=>`<tr><td>${esc(o.numero)}</td><td>${esc(o.cliente || '—')}</td><td>${relEntData(o.data)}</td>${k==='retrabalho'?'':`<td>${relEntValor(o.valor,k)}</td>`}</tr>`).join('')}</tbody></table></div>`;}
 return `<section class="rel-ent-detalhe" id="rel-ent-detalhe" tabindex="-1"><h3>${r.indicadores[k].nome} · ${r.mes.slice(5)}/${r.mes.slice(0,4)}</h3><strong>${relEntValor(m[k],k)}</strong>${conteudo}<p class="text-muted">${esc(r.dados.notas[k] || '')}</p></section>`;
}
function relEntMesesVisiveis(){return relEntMesesGrafico().filter(m=>!m.futuro && (!REL_ENT.foco || m.mes.slice(5)===REL_ENT.foco));}
function relEntChipsHTML(){
 const r=REL_ENT,hoje=OPERACAO.dia(new Date()).slice(0,7),anoInteiro=r.intervalo?r.intervalo.inicio===`${r.ano}-01`&&r.intervalo.fim===`${r.ano}-12`:!r.foco,mesAtivo=r.intervalo?(r.intervalo.inicio===r.intervalo.fim?r.intervalo.inicio.slice(5):''):r.foco;
 return `<nav class="rel-ent-meses" aria-label="Mês do relatório"><button class="btn-ghost ${anoInteiro?'active':''}" data-rel-mes="" aria-pressed="${anoInteiro}">Ano completo</button>${MES_CURTO.map((nome,i)=>{const mm=String(i+1).padStart(2,'0'),futuro=`${r.ano}-${mm}`>hoje;return `<button class="btn-ghost ${mesAtivo===mm?'active':''}" data-rel-mes="${mm}" aria-label="${nome} de ${r.ano}" aria-pressed="${mesAtivo===mm}" ${futuro?'disabled':''}>${nome}</button>`;}).join('')}</nav>`;
}
function relEntResumoHTML(){
 const r=REL_ENT,m=relEntMesesVisiveis().at(-1);if(!m)return '';
 return `<details class="rel-ent-resumo rel-ent-quadro" data-rel-quadro="resumo" ${(r.abertos.resumo??true)?'open':''}><summary aria-label="Indicadores do mês"><header><div><span class="perf-report-eyebrow">${r.foco?'MÊS SELECIONADO':'ÚLTIMO MÊS DO INTERVALO'}${relEntParcial(m)?' · MÊS EM ANDAMENTO':''}</span><h3>${MES_CURTO[Number(m.mes.slice(5))-1]} / ${m.mes.slice(0,4)}</h3></div><span>Até ${relEntData([new Date(Number(m.mes.slice(0,4)),Number(m.mes.slice(5)),0,12).toISOString().slice(0,10),r.dados.ate].sort()[0])} · clique para conferir</span></header><span class="rel-ent-recolher">Recolher</span><span class="rel-ent-expandir">Expandir</span></summary><div class="rel-ent-resumo-grid">${[...r.selecionados].map(k=>`<button class="rel-ent-indicador" data-rel-ponto="${m.mes}" data-rel-metrica="${k}" style="--indicador-cor:${r.indicadores[k].cor}"><span>${r.indicadores[k].nome}</span><strong>${relEntValor(m[k],k)}</strong><small>${k==='entregue'?`${m.entregas?.length || 0} O.S. na fonte`:k==='vendido'?`${m.vendas?.length || 0} O.S. por cadastro`:k==='retrabalho'?`${m.baseRetrabalho || 0} instalações na base`:k==='funcionarios'?(m.rh?.piso?'Histórico mínimo':'Ativos em algum dia do mês'):'Pagamentos registrados no ERP'}</small></button>`).join('')}</div></details>`;
}
/* Régua documental do ERP, independente das ocorrências/abonos do PCP.
   O período é o da entrega efetiva. Dinheiro não pondera a pontualidade. */
function relEntDiaValido(v){
 const s=String(v || '').trim();if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(s))return '';
 const dia=s.slice(0,10),t=Date.parse(dia+'T12:00:00Z');
 return Number.isFinite(t) && new Date(t).toISOString().slice(0,10)===dia?dia:'';
}
function relEntPontualidade(meses){
 const p={total:0,comparaveis:0,noPrazo:0,antecipadas:0,atrasadas:0,semComparacao:0,somaAtraso:0,mediaAtraso:null,maiorAtraso:null,percentualNoPrazo:null,percentualAtraso:null,cobertura:null,mesesSemFonte:[],linhas:[]};
 for(const m of meses.filter(x=>!x.futuro)){
  if(m.entregasCarregadas!==true){p.mesesSemFonte.push(m.mes);continue;}
  for(const o of m.entregas || []){
   const prevista=relEntDiaValido(o.previsao),realizada=relEntDiaValido(o.data);
   const diferenca=prevista && realizada?Math.round((Date.parse(realizada+'T12:00:00Z')-Date.parse(prevista+'T12:00:00Z'))/86400000):null;
   const situacao=diferenca===null?'semDados':diferenca>0?'atraso':'noPrazo';
   p.total++;if(diferenca===null)p.semComparacao++;else{p.comparaveis++;if(diferenca<=0){p.noPrazo++;if(diferenca<0)p.antecipadas++;}else{p.atrasadas++;p.somaAtraso+=diferenca;p.maiorAtraso=Math.max(p.maiorAtraso || 0,diferenca);}}
   p.linhas.push({...o,prevista,realizada,diferenca,situacao});
  }
 }
 if(p.comparaveis){p.percentualNoPrazo=100*p.noPrazo/p.comparaveis;p.percentualAtraso=100*p.atrasadas/p.comparaveis;}
 if(p.total)p.cobertura=100*p.comparaveis/p.total;
 if(p.atrasadas)p.mediaAtraso=p.somaAtraso/p.atrasadas;
 return p;
}
const relEntPercentual=v=>v===null?'Sem base':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const relEntDias=v=>v===null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+(v===1?' dia':' dias');
function relEntPontualidadeHTML(){
 const r=REL_ENT,meses=relEntMesesVisiveis(),p=relEntPontualidade(meses),periodo=relEntPeriodoTxt();
 const filtro=r.filtroPontualidade || 'todas',linhas=p.linhas.filter(o=>filtro==='todas' || o.situacao===filtro).sort((a,b)=>(b.diferenca || 0)-(a.diferenca || 0) || String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true}));
 const limite=r.limitePontualidade || 50,exibidas=linhas.slice(0,limite);
 return `<details class="rel-ent-quadro rel-ent-pontualidade" data-rel-quadro="quadro-pontualidade" ${(r.abertos['quadro-pontualidade']??true)?'open':''}><summary aria-label="Pontualidade das entregas"><header><div><span class="perf-report-eyebrow">PRAZO PREVISTO × ENTREGA EFETIVA</span><h3 id="rel-ent-prazo-titulo">Pontualidade das entregas</h3><p>${esc(periodo)} · pela data em que a O.S. foi entregue.</p></div><span class="rel-ent-fonte">Mubisys</span></header><span class="rel-ent-recolher">Recolher</span><span class="rel-ent-expandir">Expandir</span></summary><div class="rel-ent-quadro-corpo">
 ${p.mesesSemFonte.length?`<p class="rel-ent-aviso">Comparativo incompleto: sem fonte de entregas em ${p.mesesSemFonte.map(m=>esc(m.slice(5)+'/'+m.slice(0,4))).join(', ')}. Esses meses não entram no cálculo.</p>`:''}
 <details class="rel-ent-cartoes" data-rel-quadro="cards-pontualidade" ${(r.abertos['cards-pontualidade']??true)?'open':''}><summary>Indicadores do período</summary><div class="rel-ent-prazo-cards"><article class="prazo-ok"><span>Entregues no prazo</span><strong>${relEntPercentual(p.percentualNoPrazo)}</strong><small>${p.noPrazo} de ${p.comparaveis} O.S. comparáveis · inclui ${p.antecipadas} antecipada(s)</small></article><article class="prazo-atraso"><span>Entregues com atraso</span><strong>${relEntPercentual(p.percentualAtraso)}</strong><small>${p.atrasadas} de ${p.comparaveis} O.S. comparáveis</small></article><article><span>Atraso médio</span><strong>${relEntDias(p.mediaAtraso)}</strong><small>${p.atrasadas?'Somente as atrasadas · maior: '+relEntDias(p.maiorAtraso):'Nenhuma entrega atrasada comparável'}</small></article><article><span>Sem comparação</span><strong>${p.semComparacao} O.S.</strong><small>Previsão ou entrega ausente/inválida · fora dos percentuais</small></article></div></details>
 ${p.comparaveis?`<div class="rel-ent-prazo-barra" role="img" aria-label="${relEntPercentual(p.percentualNoPrazo)} no prazo e ${relEntPercentual(p.percentualAtraso)} com atraso"><span style="width:${p.percentualNoPrazo}%"></span><span style="width:${p.percentualAtraso}%"></span></div>`:''}
 <p class="metricas-nota">Base: ${p.comparaveis} O.S. comparáveis de ${p.total} entregues nos meses carregados${p.cobertura===null?'':' · cobertura de '+relEntPercentual(p.cobertura)}. Antecipadas e entregues na data contam como no prazo. Atraso em dias corridos, sem descontar fins de semana. Pedidos em aberto não entram.</p>
 ${relEntGraficoPontualidade()}
 ${!r.foco?`<details data-rel-quadro="tabela-pontualidade" ${r.abertos['tabela-pontualidade']?'open':''}><summary>Pontualidade mês a mês</summary><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Mês</th><th>Comparáveis / entregues</th><th>No prazo</th><th>Com atraso</th><th>Atraso médio</th><th>Sem comparação</th></tr></thead><tbody>${meses.map(m=>{const v=relEntPontualidade([m]);return `<tr><th>${relEntMesTxt(m)}</th><td>${v.mesesSemFonte.length?'Sem fonte':v.comparaveis+' / '+v.total}</td><td>${relEntPercentual(v.percentualNoPrazo)}</td><td>${relEntPercentual(v.percentualAtraso)}</td><td>${relEntDias(v.mediaAtraso)}</td><td>${v.mesesSemFonte.length?'—':v.semComparacao}</td></tr>`;}).join('')}</tbody></table></div></details>`:''}
 <details class="rel-ent-prazo-detalhes" data-rel-quadro="pontualidade" ${r.abertos.pontualidade?'open':''}><summary>Conferir as datas por O.S. (${p.total})</summary><div class="rel-ent-prazo-filtro"><label for="rel-ent-prazo-filtro">Mostrar entregas</label><select id="rel-ent-prazo-filtro">${[['todas','Todas'],['atraso','Com atraso'],['noPrazo','No prazo'],['semDados','Sem comparação']].map(([v,n])=>`<option value="${v}" ${filtro===v?'selected':''}>${n}</option>`).join('')}</select><span>Exibindo ${exibidas.length} de ${linhas.length} O.S.${filtro==='todas'?'':' neste filtro'} · maiores atrasos primeiro.</span></div><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S.</th><th>Cliente</th><th>Prevista no Mubisys</th><th>Entrega efetiva</th><th>Resultado</th></tr></thead><tbody>${exibidas.map(o=>`<tr data-rel-prazo-linha><td>${esc(o.numero)}</td><td>${esc(o.cliente || '—')}</td><td>${relEntData(o.prevista)}</td><td>${relEntData(o.realizada)}</td><td><span class="rel-ent-prazo-status ${o.situacao==='atraso'?'prazo-atraso':o.situacao==='noPrazo'?'prazo-ok':''}">${o.situacao==='semDados'?'Sem comparação':o.diferenca>0?relEntDias(o.diferenca)+' de atraso':o.diferenca<0?'No prazo · '+relEntDias(-o.diferenca)+' antes':'No prazo · na data'}</span></td></tr>`).join('') || '<tr><td colspan="5">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div>${exibidas.length<linhas.length?'<button class="btn-ghost" id="rel-ent-prazo-mais">Mostrar mais 50</button>':''}</details>
 <p class="metricas-nota">Previsão conforme a última carga do Mubisys. Alterações posteriores no ERP podem mudar o comparativo; esta régua não é a primeira agenda do PCP e não altera abonos ou comissões.</p></div></details>`;
}
function renderRelatoriosEntregas() {
 const el=document.getElementById('panel-entregas'),r=REL_ENT;if(!el)return;
 const anoAtual=new Date().getFullYear(),anos=Array.from({length:anoAtual-2019},(_,i)=>anoAtual-i),ks=[...r.selecionados];
 el.innerHTML=`<div class="casa-pagina">${abasEntregasHTML('relatorios')}<div class="casa-pagina-head"><div><h2>Relatórios de entregas</h2><p>Compare produção, vendas, recebimentos, equipe e qualidade mês a mês.</p></div><button class="btn-ghost" id="rel-ent-pdf" ${!r.dados?'disabled':''}>📄 Salvar PDF</button></div>
 <details class="rel-ent-controles" data-rel-quadro="filtros" ${(r.abertos.filtros??true)?'open':''}><summary>Período e filtros <span>${esc(relEntPeriodoTxt())}</span></summary><div class="rel-ent-periodo"><div class="rel-ent-ano"><label for="rel-ent-ano">Ano (atalho)</label><select id="rel-ent-ano">${anos.map(a=>`<option ${a===r.ano?'selected':''}>${a}</option>`).join('')}</select></div><span class="rel-ent-atualizado">${r.dados?`Dados até ${relEntData(r.dados.ate)}`:'Selecione o período para comparar'}</span><button class="btn-ghost" id="rel-ent-refresh" ${r.carregando?'disabled':''}>${r.carregando?'Consultando…':'Atualizar fontes'}</button></div>${relEntChipsHTML()}<details class="rel-ent-filtros-avancados" data-rel-quadro="filtros-avancados" ${r.abertos['filtros-avancados']?'open':''}><summary>Personalizar período e indicadores</summary><fieldset class="rel-ent-series"><legend>Indicadores para comparar</legend><div class="rel-ent-series-opcoes">${Object.entries(r.indicadores).map(([k,i])=>`<label style="--serie-cor:${i.cor}"><input type="checkbox" data-rel-serie="${k}" ${r.selecionados.has(k)?'checked':''}><span>${i.nome}</span></label>`).join('')}</div><div class="rel-ent-series-acoes"><button class="btn-ghost btn-sm" id="rel-ent-todos">Ver todos</button><button class="btn-ghost btn-sm" id="rel-ent-limpar">Limpar seleção</button></div></fieldset>
 <form id="rel-ent-intervalo" class="rel-ent-intervalo-form"><label>Do mês<input type="month" id="rel-ent-inicio" min="2020-01" max="${anoAtual}-12" value="${r.intervalo?.inicio || r.ano+'-01'}" required></label><label>Até o mês<input type="month" id="rel-ent-fim" min="2020-01" max="${anoAtual}-12" value="${r.intervalo?.fim || r.ano+'-12'}" required></label><button class="btn-ghost" type="submit" ${r.carregando?'disabled':''}>Aplicar período</button><span>Selecione meses do mesmo ano ou entre anos.</span><p id="rel-ent-intervalo-erro" role="alert"></p></form>
 </details></details>
 <div id="rel-ent-imprimir">${r.erro?`<p role="alert" class="rel-ent-aviso">${esc(r.erro)} Use “Atualizar fontes” para tentar de novo.</p>`:''}${r.carregando?'<p role="status">Consultando histórico do servidor e do RH…</p>':''}${r.dados?`<p class="metricas-nota">${esc(relEntPeriodoTxt())} · dados até ${relEntData(r.dados.ate)}. ${r.foco?'Resumo e tabelas: '+MES_CURTO[Number(r.foco)-1]+'. ':''}Gráficos: período indicado em cada título. Clique nos pontos ou nos valores da tabela para conferir o mês. Lacunas significam informação indisponível, nunca zero.</p>
 ${relEntPontualidadeHTML()}
 ${ks.length?`${relEntResumoHTML()}${ks.some(k=>r.indicadores[k].unidade==='R$')?relEntGrafico(ks.filter(k=>r.indicadores[k].unidade==='R$'),'Produção e dinheiro · R$'):''}${ks.includes('entregue')?relEntQuadroHTML('quadro-media','Entregue por pessoa da produção',relEntMediasHTML(),false):''}${ks.includes('funcionarios')?relEntGrafico(['funcionarios'],'Tamanho da equipe · pessoas'):''}${ks.includes('retrabalho')?relEntGrafico(['retrabalho'],'Qualidade · índice de retrabalho'):''}
 <details class="rel-ent-quadro" data-rel-quadro="conferencia" ${r.abertos.conferencia?'open':''}><summary><h3>Conferência mês a mês</h3></summary><div class="rel-ent-quadro-corpo"><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Mês</th>${ks.map(k=>`<th>${r.indicadores[k].nome}</th>`).join('')}</tr></thead><tbody>${relEntMesesVisiveis().map(m=>`<tr><th>${relEntMesTxt(m)}</th>${ks.map(k=>`<td><button class="btn-ghost btn-sm" data-rel-ponto="${m.mes}" data-rel-metrica="${k}">${relEntValor(m[k],k)}${k==='funcionarios'&&m.rh?.piso?' (mínimo)':''}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details>`:'<p>Marque pelo menos um indicador para mostrar os gráficos.</p>'}
 ${relEntDetalhe()}<details class="rel-ent-fontes" data-rel-quadro="fontes" ${r.abertos.fontes?'open':''}><summary>Como os indicadores são calculados</summary>${Object.entries(r.dados.notas).map(([k,v])=>`<p><strong>${r.indicadores[k]?.nome || k}:</strong> ${esc(v)}</p>`).join('')}<p>Funcionários: vínculos ativos em algum dia do mês, pelas admissões e desligamentos do RH. Histórico anterior a ${esc(r.equipe.desdeQuando || 'data não conhecida')} pode estar incompleto. Não inclui fichas sem data de admissão válida.</p><p>Consulta: ${esc(new Date(r.dados.consultadoEm).toLocaleString('pt-BR'))}. Carga do fluxo financeiro: ${esc(r.dados.recebimentosEm?new Date(r.dados.recebimentosEm).toLocaleString('pt-BR'):'indisponível')}.</p><ul>${relEntMesesVisiveis().map(m=>`<li>${m.mes}: entregas atualizadas em ${esc(m.entregasEm?new Date(m.entregasEm).toLocaleString('pt-BR'):'sem carga')}</li>`).join('')}</ul></details>`:''}</div></div>`;
 wireAbasEntregas(el);
 el.querySelector('#rel-ent-ano').onchange=e=>{r.ano=Number(e.target.value);r.intervalo=null;if(r.foco && `${r.ano}-${r.foco}`>OPERACAO.dia(new Date()).slice(0,7))r.foco=OPERACAO.dia(new Date()).slice(5,7);r.mes=null;r.limitePontualidade=50;relEntCarregar();};
 el.querySelectorAll('[data-rel-mes]').forEach(b=>b.onclick=()=>{relEntSelecionarMes(b.dataset.relMes);renderRelatoriosEntregas();});
 el.querySelector('#rel-ent-refresh').onclick=relEntCarregar;
 el.querySelector('#rel-ent-intervalo').onsubmit=e=>{e.preventDefault();const v=relEntValidarIntervalo(el.querySelector('#rel-ent-inicio').value,el.querySelector('#rel-ent-fim').value);if(!v.ok){el.querySelector('#rel-ent-intervalo-erro').textContent=v.erro;return;}r.intervalo={inicio:v.inicio,fim:v.fim};r.ano=Number(v.inicio.slice(0,4));r.foco='';r.mes=null;r.limitePontualidade=50;relEntCarregar();};
 el.querySelectorAll('[data-rel-analise-quadro]').forEach(c=>c.onchange=()=>{r.analises[c.dataset.relAnaliseQuadro][c.dataset.relAnaliseTipo]=c.checked;const id=c.id;renderRelatoriosEntregas();el.querySelector('#'+id)?.focus();});
 el.querySelectorAll('[data-rel-prazo-ponto]').forEach(b=>{const abrir=()=>{r.ano=Number(b.dataset.relPrazoPonto.slice(0,4));relEntSelecionarMes(b.dataset.relPrazoPonto.slice(5));r.filtroPontualidade=b.dataset.relPrazoTipo;r.abertos.pontualidade=true;r.limitePontualidade=50;renderRelatoriosEntregas();el.querySelector('#rel-ent-prazo-filtro')?.focus();};b.onclick=abrir;b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();abrir();}};});
 const filtroPrazo=el.querySelector('#rel-ent-prazo-filtro');if(filtroPrazo)filtroPrazo.onchange=e=>{r.filtroPontualidade=e.target.value;r.limitePontualidade=50;r.abertos.pontualidade=true;renderRelatoriosEntregas();el.querySelector('#rel-ent-prazo-filtro')?.focus();};
 const maisPrazo=el.querySelector('#rel-ent-prazo-mais');if(maisPrazo)maisPrazo.onclick=()=>{r.limitePontualidade+=50;r.abertos.pontualidade=true;renderRelatoriosEntregas();el.querySelector('#rel-ent-prazo-mais')?.focus();};
 el.querySelectorAll('[data-rel-serie]').forEach(c=>c.onchange=()=>{c.checked?r.selecionados.add(c.dataset.relSerie):r.selecionados.delete(c.dataset.relSerie);if(!r.selecionados.has(r.metrica))r.mes=null;renderRelatoriosEntregas();});
 el.querySelectorAll('[data-rel-area]').forEach(c=>c.onchange=()=>{c.checked?r.areasProducao.add(c.dataset.relArea):r.areasProducao.delete(c.dataset.relArea);relEntGuardarAreas();renderRelatoriosEntregas();});
 el.querySelectorAll('[data-rel-quadro]').forEach(d=>d.ontoggle=()=>{r.abertos[d.dataset.relQuadro]=d.open;});
 el.querySelector('#rel-ent-todos').onclick=()=>{r.selecionados=new Set(Object.keys(r.indicadores));renderRelatoriosEntregas();};
 el.querySelector('#rel-ent-limpar').onclick=()=>{r.selecionados.clear();r.mes=null;renderRelatoriosEntregas();};
 el.querySelectorAll('[data-rel-ponto]').forEach(b=>{const abrir=()=>{r.mes=b.dataset.relPonto;r.metrica=b.dataset.relMetrica;renderRelatoriosEntregas();const d=el.querySelector('#rel-ent-detalhe');d?.focus();d?.scrollIntoView({behavior:'smooth',block:'center'});};b.onclick=abrir;if(['circle','g'].includes(b.tagName.toLowerCase()))b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();abrir();}};});
 el.querySelector('#rel-ent-pdf').onclick=()=>imprimirAnalisePCP('Relatórios de entregas',el.querySelector('#rel-ent-imprimir'),{de:r.dados.de,ate:r.dados.ate},'ERP, PCP e RH. Dados e limites por indicador nas notas do relatório.');
 if(!r.dados && !r.carregando && !r.erro)relEntCarregar();
}
