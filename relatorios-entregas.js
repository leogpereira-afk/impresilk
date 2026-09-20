/* Relatório de leitura: nenhuma seleção altera lançamentos ou apurações. */
const REL_ENT = {
 ano:new Date().getFullYear(), selecionados:new Set(['entregue','vendido','recebido','funcionarios','retrabalho']), areasProducao:new Set(['Acabamento','Impressão digital','Montagem Interna','Operação de maquinas.','Serralheria','Instalação Externa']), dados:null,equipe:null,erro:'',carregando:false,mes:null,metrica:'entregue',pedido:0,
 indicadores:{entregue:{nome:'Entregue',cor:'#167a70',unidade:'R$'},vendido:{nome:'Vendido · O.S.',cor:'#3763cf',unidade:'R$'},recebido:{nome:'Dinheiro recebido',cor:'#9b51ba',unidade:'R$'},funcionarios:{nome:'Funcionários',cor:'#b47410',unidade:'pessoas'},retrabalho:{nome:'Índice de retrabalho',cor:'#cf493a',unidade:'%'}}
};
function relEntData(v){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));return m?`${m[3]}/${m[2]}/${m[1]}`:'—';}
function abasEntregasHTML(ativa) {return `<nav class="rel-ent-abas" aria-label="Entregas e relatórios"><button class="btn-ghost ${ativa==='lista'?'active':''}" data-ent-aba="lista" aria-pressed="${ativa==='lista'}">📦 Entregas</button><button class="btn-ghost ${ativa==='relatorios'?'active':''}" data-ent-aba="relatorios" aria-pressed="${ativa==='relatorios'}">📈 Relatórios</button></nav>`;}
function wireAbasEntregas(el) {el.querySelectorAll('[data-ent-aba]').forEach(b=>b.onclick=()=>{STATE._entAba=b.dataset.entAba;renderEntregas();});}
function relEntValor(v,k,curto=false) {
 if(v===null || v===undefined || !Number.isFinite(v))return 'Sem informação';
 if(k==='retrabalho')return v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 if(k==='funcionarios')return v.toLocaleString('pt-BR')+' pessoas';
 return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:curto?0:2,...(curto?{notation:'compact'}:{})});
}
async function relEntCarregar() {
 const r=REL_ENT,id=++r.pedido,ano=r.ano;r.carregando=true;r.erro='';r.dados=null;r.equipe=null;renderRelatoriosEntregas();
 try {
  const meses=Array.from({length:12},(_,i)=>`${ano}-${String(i+1).padStart(2,'0')}`).filter(m=>m<=OPERACAO.dia(new Date()).slice(0,7));
  const [d,h]=await Promise.all([STORE.api({action:'relatorioEntregas',ano}),STORE.api({action:'equipeHistorico',meses})]);
  if(id!==r.pedido)return;if(d.error || h.error)throw new Error(d.error || h.error);
  if(!Array.isArray(d.meses) || !Array.isArray(h.meses))throw new Error('Resposta incompleta das fontes.');
  r.dados=d;r.equipe=h;
  for(const m of d.meses){const rh=h.meses.find(x=>x.mes===m.mes);m.funcionarios=m.futuro?null:rh?.total??null;m.rh=rh;}
 }catch(e){if(id===r.pedido)r.erro=e.message || 'Não foi possível consultar as fontes.';}
 finally{if(id===r.pedido){r.carregando=false;if(STATE._entAba==='relatorios')renderRelatoriosEntregas();}}
}
function relEntGrafico(chaves,titulo) {
 const r=REL_ENT,ms=r.dados.meses,W=1040,H=280,L=78,R=30,T=24,B=45;
 const valores=ms.flatMap(m=>chaves.map(k=>m.futuro?null:m[k]).filter(v=>typeof v==='number' && Number.isFinite(v)));
 if(!valores.length)return `<section class="rel-ent-grafico"><h3>${titulo}</h3><p class="text-muted">Sem dados para estes indicadores no ano selecionado.</p></section>`;
 const min=Math.min(0,...valores),max=Math.max(1,...valores)*1.12,x=i=>L+i*(W-L-R)/11,y=v=>T+(max-v)*(H-T-B)/(max-min);
 let svg='';for(let i=0;i<5;i++){const v=min+(max-min)*i/4;svg+=`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" class="rel-grid"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${esc(relEntValor(v,chaves[0],true))}</text>`;}
 ms.forEach((m,i)=>svg+=`<text x="${x(i)}" y="${H-15}" text-anchor="middle">${MES_CURTO[i]}</text>`);
 for(const k of chaves){const info=r.indicadores[k];let segmentos=[],pontos=[];ms.forEach((m,i)=>{if(m.futuro || typeof m[k]!=='number'){if(pontos.length)segmentos.push(pontos);pontos=[];return;}pontos.push(`${x(i)},${y(m[k])}`);});if(pontos.length)segmentos.push(pontos);
 svg+=segmentos.map(p=>`<polyline points="${p.join(' ')}" fill="none" stroke="${info.cor}" stroke-width="3"/>`).join('');
 ms.forEach((m,i)=>{if(m.futuro || typeof m[k]!=='number')return;const label=`${info.nome}, ${MES_CURTO[i]}: ${relEntValor(m[k],k)}. Abrir detalhes`;
 svg+=`<circle cx="${x(i)}" cy="${y(m[k])}" r="7" fill="${info.cor}" stroke="white" stroke-width="2" tabindex="0" role="button" data-rel-ponto="${m.mes}" data-rel-metrica="${k}" aria-label="${esc(label)}"><title>${esc(label)}</title></circle>`;});}
 return `<section class="rel-ent-grafico"><h3>${titulo}</h3><div class="rel-ent-legenda">${chaves.map(k=>`<span><i style="background:${r.indicadores[k].cor}"></i>${r.indicadores[k].nome}</span>`).join('')}</div><div class="rel-ent-svg"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${titulo}. Pontos acessíveis pelo teclado; valores também na tabela abaixo.">${svg}</svg></div></section>`;
}
function relEntMedia(m) {
 const r=REL_ENT,n=Object.entries(m.rh?.porArea || {}).reduce((s,[area,q])=>s+(r.areasProducao.has(area)?q:0),0);
 return {pessoas:n,valor:typeof m.entregue==='number' && n>0 && !m.rh?.piso?m.entregue/n:null};
}
function relEntMediasHTML(){
 const r=REL_ENT,areas=r.equipe.areas || [...new Set(r.dados.meses.flatMap(m=>Object.keys(m.rh?.porArea || {})))];
 return `<section class="rel-ent-grafico"><h3>Entregue por pessoa da produção</h3><p>Valor entregue no mês ÷ pessoas da produção com vínculo ativo naquele mês. É uma média da operação, não uma avaliação individual.</p><details><summary>Áreas consideradas na produção</summary><div class="rel-ent-seletores">${areas.map(a=>`<label><input type="checkbox" data-rel-area="${esc(a)}" ${r.areasProducao.has(a)?'checked':''}>${esc(a)}</label>`).join('')}</div></details><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Mês</th><th>Entregue</th><th>Pessoas da produção</th><th>Média por pessoa</th></tr></thead><tbody>${r.dados.meses.filter(m=>!m.futuro).map(m=>{const v=relEntMedia(m);return `<tr><th>${MES_CURTO[Number(m.mes.slice(5))-1]}</th><td>${relEntValor(m.entregue,'entregue')}</td><td>${v.pessoas}${m.rh?.piso?' (mínimo)':''}</td><td><strong>${relEntValor(v.valor,'entregue')}</strong></td></tr>`;}).join('')}</tbody></table></div><p class="metricas-nota">${esc([...r.areasProducao].join(', ')) || 'Nenhuma área selecionada'}. Uma pessoa conta uma vez no mês, mesmo que tenha trabalhado parte dele. Áreas conforme o cadastro atual do RH; transferências antigas de setor não têm histórico nesta fonte. Média indisponível quando faltam valores, há zero pessoas ou o histórico de desligamentos é incompleto.</p></section>`;
}
function relEntDetalhe() {
 const r=REL_ENT,m=r.dados?.meses.find(x=>x.mes===r.mes),k=r.metrica;if(!m)return '';
 let conteudo='';
 if(k==='funcionarios')conteudo=`<p>Pessoas com vínculo em algum dia do mês, até a data de corte. Não é média de pessoas nem quadro no último dia.</p>${m.rh?.piso?'<p class="rel-ent-aviso">Histórico mínimo: há desligamentos anteriores que o RH não registrou.</p>':''}<ul>${Object.entries(m.rh?.porArea || {}).map(([a,n])=>`<li>${esc(a)}: <strong>${n}</strong></li>`).join('')}</ul>`;
 else if(k==='recebido')conteudo='<p>Este valor vem do fluxo mensal de pagamentos do Mubisys. A fonte atual entrega o total do mês, sem os títulos individuais; não é possível listar parcelas neste relatório.</p>';
 else {const rows=k==='entregue'?m.entregas:k==='vendido'?m.vendas:m.retrabalhos;conteudo=(k==='retrabalho'?`<p>${rows.length} instalação(ões) marcada(s) com retrabalho em ${m.baseRetrabalho} instalações registradas no mês. A taxa pode mudar se um retrabalho for registrado depois.</p>`:'')+`<div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S.</th><th>Cliente</th><th>Data</th>${k==='retrabalho'?'':'<th>Valor</th>'}</tr></thead><tbody>${(rows || []).map(o=>`<tr><td>${esc(o.numero)}</td><td>${esc(o.cliente || '—')}</td><td>${relEntData(o.data)}</td>${k==='retrabalho'?'':`<td>${relEntValor(o.valor,k)}</td>`}</tr>`).join('')}</tbody></table></div>`;}
 return `<section class="rel-ent-detalhe" id="rel-ent-detalhe" tabindex="-1"><h3>${r.indicadores[k].nome} · ${r.mes.slice(5)}/${r.ano}</h3><strong>${relEntValor(m[k],k)}</strong>${conteudo}<p class="text-muted">${esc(r.dados.notas[k] || '')}</p></section>`;
}
function relEntResumoHTML(){
 const r=REL_ENT,m=r.dados.meses.filter(x=>!x.futuro).at(-1);if(!m)return '';
 return `<section class="rel-ent-resumo"><header><div><span class="perf-report-eyebrow">LEITURA DO MÊS MAIS RECENTE</span><h3>${MES_CURTO[Number(m.mes.slice(5))-1]} / ${r.ano}</h3></div><span>Até ${relEntData(r.dados.ate)} · clique para conferir</span></header><div class="rel-ent-resumo-grid">${[...r.selecionados].map(k=>`<button class="rel-ent-indicador" data-rel-ponto="${m.mes}" data-rel-metrica="${k}" style="--indicador-cor:${r.indicadores[k].cor}"><span>${r.indicadores[k].nome}</span><strong>${relEntValor(m[k],k)}</strong><small>${k==='entregue'?`${m.entregas?.length || 0} O.S. na fonte`:k==='vendido'?`${m.vendas?.length || 0} O.S. por cadastro`:k==='retrabalho'?`${m.baseRetrabalho || 0} instalações na base`:k==='funcionarios'?(m.rh?.piso?'Histórico mínimo':'Ativos em algum dia do mês'):'Pagamentos registrados no ERP'}</small></button>`).join('')}</div></section>`;
}
function renderRelatoriosEntregas() {
 const el=document.getElementById('panel-entregas'),r=REL_ENT;if(!el)return;
 const anoAtual=new Date().getFullYear(),anos=Array.from({length:anoAtual-2019},(_,i)=>anoAtual-i),ks=[...r.selecionados];
 el.innerHTML=`<div class="casa-pagina">${abasEntregasHTML('relatorios')}<div class="casa-pagina-head"><div><h2>Relatórios de entregas</h2><p>Compare produção, vendas, recebimentos, equipe e qualidade mês a mês.</p></div><button class="btn-ghost" id="rel-ent-pdf" ${!r.dados?'disabled':''}>📄 Salvar PDF</button></div>
 <section class="ent-controles"><div class="casa-filtros"><label>Ano <select id="rel-ent-ano">${anos.map(a=>`<option ${a===r.ano?'selected':''}>${a}</option>`).join('')}</select></label><button class="btn-ghost" id="rel-ent-refresh" ${r.carregando?'disabled':''}>${r.carregando?'Consultando…':'Atualizar fontes'}</button><span>${r.dados?`Até ${relEntData(r.dados.ate)}`:''}</span></div><fieldset class="rel-ent-seletores"><legend>O que você quer comparar?</legend>${Object.entries(r.indicadores).map(([k,i])=>`<label><input type="checkbox" data-rel-serie="${k}" ${r.selecionados.has(k)?'checked':''}><span style="color:${i.cor}">●</span> ${i.nome}</label>`).join('')}<button class="btn-ghost btn-sm" id="rel-ent-todos">Ver todos</button><button class="btn-ghost btn-sm" id="rel-ent-limpar">Limpar seleção</button></fieldset></section>
 <div id="rel-ent-imprimir">${r.erro?`<p role="alert" class="rel-ent-aviso">${esc(r.erro)} Use “Atualizar fontes” para tentar novamente.</p>`:''}${r.carregando?'<p role="status">Consultando histórico do servidor e do RH…</p>':''}${r.dados?`<p class="metricas-nota">${r.ano} · até ${relEntData(r.dados.ate)}. Clique nos pontos ou nos valores da tabela para conferir o mês. Lacunas significam informação indisponível, nunca zero.</p>
 ${ks.length?`${relEntResumoHTML()}${ks.some(k=>r.indicadores[k].unidade==='R$')?relEntGrafico(ks.filter(k=>r.indicadores[k].unidade==='R$'),'Produção e dinheiro · R$'):''}${ks.includes('entregue')?relEntMediasHTML():''}${ks.includes('funcionarios')?relEntGrafico(['funcionarios'],'Tamanho da equipe · pessoas'):''}${ks.includes('retrabalho')?relEntGrafico(['retrabalho'],'Qualidade · índice de retrabalho'):''}
 <section class="rel-ent-grafico"><h3>Conferência mês a mês</h3><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>Mês</th>${ks.map(k=>`<th>${r.indicadores[k].nome}</th>`).join('')}</tr></thead><tbody>${r.dados.meses.filter(m=>!m.futuro).map(m=>`<tr><th>${MES_CURTO[Number(m.mes.slice(5))-1]}</th>${ks.map(k=>`<td><button class="btn-ghost btn-sm" data-rel-ponto="${m.mes}" data-rel-metrica="${k}">${relEntValor(m[k],k)}${k==='funcionarios'&&m.rh?.piso?' (mínimo)':''}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`:'<p>Marque pelo menos um indicador para mostrar os gráficos.</p>'}
 ${relEntDetalhe()}<details class="rel-ent-fontes"><summary>Como os indicadores são calculados</summary>${Object.entries(r.dados.notas).map(([k,v])=>`<p><strong>${r.indicadores[k]?.nome || k}:</strong> ${esc(v)}</p>`).join('')}<p>Funcionários: vínculos ativos em algum dia do mês, pelas admissões e desligamentos do RH. Histórico anterior a ${esc(r.equipe.desdeQuando || 'data não conhecida')} pode estar incompleto. Não inclui fichas sem data de admissão válida.</p><p>Consulta: ${esc(new Date(r.dados.consultadoEm).toLocaleString('pt-BR'))}. Carga do fluxo financeiro: ${esc(r.dados.recebimentosEm?new Date(r.dados.recebimentosEm).toLocaleString('pt-BR'):'indisponível')}.</p><ul>${r.dados.meses.filter(m=>!m.futuro).map(m=>`<li>${m.mes}: entregas atualizadas em ${esc(m.entregasEm?new Date(m.entregasEm).toLocaleString('pt-BR'):'sem carga')}</li>`).join('')}</ul></details>`:''}</div></div>`;
 wireAbasEntregas(el);
 el.querySelector('#rel-ent-ano').onchange=e=>{r.ano=Number(e.target.value);r.mes=null;relEntCarregar();};
 el.querySelector('#rel-ent-refresh').onclick=relEntCarregar;
 el.querySelectorAll('[data-rel-serie]').forEach(c=>c.onchange=()=>{c.checked?r.selecionados.add(c.dataset.relSerie):r.selecionados.delete(c.dataset.relSerie);if(!r.selecionados.has(r.metrica))r.mes=null;renderRelatoriosEntregas();});
 el.querySelectorAll('[data-rel-area]').forEach(c=>c.onchange=()=>{c.checked?r.areasProducao.add(c.dataset.relArea):r.areasProducao.delete(c.dataset.relArea);renderRelatoriosEntregas();});
 el.querySelector('#rel-ent-todos').onclick=()=>{r.selecionados=new Set(Object.keys(r.indicadores));renderRelatoriosEntregas();};
 el.querySelector('#rel-ent-limpar').onclick=()=>{r.selecionados.clear();r.mes=null;renderRelatoriosEntregas();};
 el.querySelectorAll('[data-rel-ponto]').forEach(b=>{const abrir=()=>{r.mes=b.dataset.relPonto;r.metrica=b.dataset.relMetrica;renderRelatoriosEntregas();const d=el.querySelector('#rel-ent-detalhe');d?.focus();d?.scrollIntoView({behavior:'smooth',block:'center'});};b.onclick=abrir;if(b.tagName.toLowerCase()==='circle')b.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();abrir();}};});
 el.querySelector('#rel-ent-pdf').onclick=()=>imprimirAnalisePCP('Relatórios de entregas',el.querySelector('#rel-ent-imprimir'),{de:r.dados.de,ate:r.dados.ate},'ERP, PCP e RH. Dados e limites por indicador nas notas do relatório.');
 if(!r.dados && !r.carregando && !r.erro)relEntCarregar();
}
