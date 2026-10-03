/* Painéis de leitura da apuração já filtrada. Não calcula comissão nem grava dados. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PERF_DASH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VISTAS = Object.freeze([
    {id:'geral', nome:'Visão geral'}, {id:'evolucao', nome:'Evolução'},
    {id:'equipes', nome:'Comparar equipes'}, {id:'qualidade', nome:'Qualidade e conferência'}
  ]);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numero = n => new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2}).format(n);
  const moeda = n => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(n);
  const centavos = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  const percentual = (n,d) => d ? Math.round(n/d*100) : null;
  const formatarDia = value => value ? value.split('-').reverse().join('/') : 'Sem data';
  function diaValido(value) {
    const s = String(value || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const date = new Date(s + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === s ? s : '';
  }
  function proximoDia(dia, n = 1) {
    const date = new Date(dia + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+n);
    return date.toISOString().slice(0,10);
  }
  const celula = dia => ({dia,entregas:0,confirmadas:0,aConferir:0,equivalentes:0,semBase:0,valorCentavos:0,comValor:0,semValor:0});
  const fracaoConhecida = r => !r.entregaId || (Number.isFinite(r.fracaoOS) && r.fracaoOS > 0 && r.fracaoOS <= 1);
  function contabilizar(dia, r, perf, verValores) {
    dia.entregas++;
    if (!r.confirmado) {dia.aConferir++;return;}
    dia.confirmadas++;
    dia.equivalentes += perf.fracaoRegistro(r);
    if (!fracaoConhecida(r)) dia.semBase++;
    if (verValores) {
      const n = centavos(r.valor);
      if (n === null) dia.semValor++;
      else {dia.comValor++;dia.valorCentavos += n;}
    }
  }
  function seriePublica(dias, verValores) {
    return dias.map(d => {
      const {valorCentavos,comValor,semValor,...base} = d;
      return {...base,semRegistro:d.entregas===0,...(verValores ? {valor:comValor ? valorCentavos/100 : null,comValor,semValor} : {})};
    });
  }
  function porSemana(dias, verValores) {
    const mapa = new Map();
    for (const d of dias) {
      const semana = proximoDia(d.dia, -(new Date(d.dia+'T12:00:00Z').getUTCDay()+6)%7);
      const g = mapa.get(semana) || {...celula(semana),de:d.dia,ate:d.dia,diasSemRegistro:0};
      g.ate = d.dia;
      for (const k of ['entregas','confirmadas','aConferir','equivalentes','semBase','valorCentavos','comValor','semValor']) g[k] += d[k];
      if (!d.entregas) g.diasSemRegistro++;
      mapa.set(semana,g);
    }
    return seriePublica([...mapa.values()],verValores);
  }
  function montar(registros, options = {}) {
    const perf = options.perf;
    if (!perf || !['validar','resumir','fracaoRegistro','ranquear','auditar','gruposDoRegistro'].every(k=>typeof perf[k] === 'function')) throw new TypeError('Informe o motor PERF da apuração.');
    const verValores = options.verValores === true;
    const periodo = {de:diaValido(options.periodo?.de),ate:diaValido(options.periodo?.ate)};
    const fonte = Array.isArray(registros) ? registros.filter(r=>r && typeof r==='object') : [];
    const ids = new Set(), repetidos = [], rs = [];
    let foraPeriodo = 0;
    for (const original of fonte) {
      const dia = diaValido(options.diaDe ? options.diaDe(original) : original.dia);
      if (dia && ((periodo.de && dia<periodo.de) || (periodo.ate && dia>periodo.ate))) {foraPeriodo++;continue;}
      const id = String(original.id || '');
      if (id && ids.has(id)) {repetidos.push(id);continue;}
      if (id) ids.add(id);
      const membros = Array.isArray(original.membros) ? original.membros : [];
      const erro = perf.validar(membros);
      rs.push({...original,id,dia,membros,valor:centavos(original.valor)===null?null:Math.round(original.valor*100)/100,confirmado:original.confirmado===true&&!erro,_erro:erro});
    }
    const validos = rs.filter(r=>!r._erro), confirmados = validos.filter(r=>r.confirmado);
    const resumo = perf.resumir(validos), resumoConf = perf.resumir(confirmados);
    const auditoria = perf.auditar(rs), os = new Set(rs.map(r=>r.osId || r.id).filter(Boolean));
    const semEquipe = rs.filter(r=>!r.membros.length).length;
    const inconsistentes = rs.filter(r=>r.membros.length&&r._erro).length;
    const semBase = confirmados.filter(r=>!fracaoConhecida(r)).length;
    const semData = rs.filter(r=>!r.dia).length;
    const baseRetrabalho = new Set(rs.filter(r=>r.retrabalho || r.os?.retrabalho).map(r=>r.osId || r.id));
    const semVinculo = new Set();
    for (const r of confirmados) for (const g of perf.gruposDoRegistro(r)) if (!g.equipeId) semVinculo.add(g.chave);
    const total = {entregas:rs.length,os:os.size,confirmadas:confirmados.length,aConferir:rs.length-confirmados.length,
      cobertura:percentual(confirmados.length,rs.length),parciais:rs.filter(r=>r.entregaId).length,
      equivalentes:confirmados.reduce((n,r)=>n+perf.fracaoRegistro(r),0),semBase,semEquipe,inconsistentes,semData,
      participantes:resumo.pessoas.length,equipes:resumo.equipes.length,composicoesSemVinculo:semVinculo.size};
    if (verValores) {
      const conhecidos = confirmados.filter(r=>r.valor!==null);
      total.valor = conhecidos.length ? conhecidos.reduce((n,r)=>n+centavos(r.valor),0)/100 : null;
      total.comValor = conhecidos.length;
      total.semValor = confirmados.length-conhecidos.length;
    }
    const cf = new Map(resumoConf.equipes.map(e=>[e.chave,e]));
    let equipes = resumo.equipes.map(e=>{
      const c = cf.get(e.chave), eqRegs=validos.filter(r=>perf.gruposDoRegistro(r).some(g=>g.chave===e.chave));
      return {chave:e.chave,nome:e.nome,salva:e.salva,entregas:e.os,confirmadas:c?.os||0,aConferir:e.os-(c?.os||0),
        cobertura:percentual(c?.os||0,e.os),equivalentes:c?.equivalentes||0,
        semBase:eqRegs.filter(r=>r.confirmado&&!fracaoConhecida(r)).length,
        ...(verValores?{valor:c&&c.os>c.semValor?c.valor:null,semValor:c?.semValor||0,comValor:c?c.os-c.semValor:0}:{})};
    });
    const ranking = perf.ranquear(equipes.filter(e=>e.equivalentes>0), e=>Math.round(e.equivalentes*1e8)/1e8);
    const posicoes = new Map(ranking.map(e=>[e.chave,e.posicao]));
    equipes = equipes.map(e=>({...e,posicao:posicoes.get(e.chave)||null})).sort((a,b)=>b.equivalentes-a.equivalentes || a.nome.localeCompare(b.nome));
    const datas = rs.map(r=>r.dia).filter(Boolean).sort();
    const de = periodo.de || datas[0] || '', ate = periodo.ate || datas[datas.length-1] || '';
    const mapa = new Map();
    const numeroDias = de&&ate?Math.round((new Date(ate+'T12:00:00Z')-new Date(de+'T12:00:00Z'))/86400000)+1:0;
    const serieCompleta = numeroDias>0 && numeroDias<=3660;
    if (serieCompleta) for (let d=de;d<=ate;d=proximoDia(d)) mapa.set(d,celula(d));
    for (const r of rs) if (r.dia) {
      const d=mapa.get(r.dia)||celula(r.dia);contabilizar(d,r,perf,verValores);mapa.set(r.dia,d);
    }
    const dias=[...mapa.values()].sort((a,b)=>a.dia.localeCompare(b.dia));
    const pendencias = auditoria.pendencias.filter(p=>verValores || !['sem-valor','valor-erp'].includes(p.tipo)).map(p=>{
      const r=rs.find(x=>x.id===p.id);
      return {id:String(p.id||''),numero:String(p.numero||r?.os?.numero||r?.numero||''),tipo:p.tipo,motivo:p.motivo};
    });
    const proximas = [];
    const add = (tipo,n,titulo,texto) => {if(n)proximas.push({tipo,quantidade:n,titulo,texto});};
    const itensInconsistentes=pendencias.filter(p=>['itens','excesso'].includes(p.tipo)).length;
    add('integridade',repetidos.length+itensInconsistentes,'Revisar a integridade da apuração',`${repetidos.length} repetição(ões) e ${itensInconsistentes} apontamento(s) de itens ou excesso de parciais. Confira a origem antes de usar o total para fechar o período.`);
    if(verValores) add('origem',pendencias.filter(p=>p.tipo==='valor-erp').length,'Conferir conflitos de valor','Há alerta na origem do valor de uma ou mais entregas. Confira a O.S. e a informação recebida do ERP antes do fechamento.');
    add('composicao',semEquipe+inconsistentes,'Conferir quem entregou',`${semEquipe} sem equipe e ${inconsistentes} com percentuais inconsistentes. Essas entregas ainda não entram na produção confirmada.`);
    add('confirmacao',total.aConferir-semEquipe-inconsistentes,'Confirmar participações',`${total.aConferir-semEquipe-inconsistentes} entrega(s) aguardam conferência. Revise itens, pessoas e divisão antes de confirmar.`);
    if (verValores) add('valor',total.semValor,'Conferir a base das entregas',`${total.semValor} entrega(s) confirmada(s) estão sem valor líquido. O valor mostrado cobre apenas o que está identificado.`);
    add('parcial',semBase,'Revisar as parciais sem base',`${semBase} parcial(is) confirmada(s) ainda não têm uma fração calculável da O.S. Não foram consideradas como O.S. inteiras.`);
    add('volta',auditoria.voltas-auditoria.voltasConferidas,'Concluir a volta do carro',`${auditoria.voltas-auditoria.voltasConferidas} volta(s) sem checklist completo. Não é possível concluir qualidade apenas pela entrega.`);
    add('vinculo',semVinculo.size,'Dar identidade às composições',`${semVinculo.size} composição(ões) com entrega confirmada ainda sem vínculo com equipe cadastrada. Confira na Gestão de equipes, sem reatribuir o histórico automaticamente.`);
    add('retrabalho',baseRetrabalho.size,'Revisar as ocorrências',`${baseRetrabalho.size} O.S. com marca de retrabalho. A marca precisa de análise e responsabilidade; este painel não aplica punição nem calcula comissão.`);
    const alertas=[];
    if(repetidos.length)alertas.push(`${repetidos.length} registro(s) repetido(s) foram contados uma única vez. Atualize a apuração para conferir a origem.`);
    if(semData)alertas.push(`${semData} entrega(s) sem data válida ficam fora do gráfico de evolução e permanecem no resumo para conferência.`);
    if(numeroDias>3660)alertas.push('Período extenso: o gráfico mostra somente as datas com registros. Reduza o período para visualizar os dias sem registro.');
    if(periodo.de&&periodo.ate&&periodo.de>periodo.ate)alertas.push('Confira o período: a data inicial está depois da final.');
    return {periodo:{de,ate},verValores,total,equipes,dias:seriePublica(dias,verValores),semanas:porSemana(dias,verValores),serieCompleta,
      qualidade:{os:os.size,retrabalho:baseRetrabalho.size,voltas:auditoria.voltas,voltasConferidas:auditoria.voltasConferidas,
        voltasSemOcorrencia:auditoria.voltasSemOcorrencia,voltasComOcorrencia:auditoria.voltasConferidas-auditoria.voltasSemOcorrencia,
        voltasPendentes:auditoria.voltas-auditoria.voltasConferidas},pendencias,proximas,alertas,foraPeriodo,repetidos:repetidos.length};
  }
  const valorHTML = (r,verValores) => !verValores ? '' : r.valor===null ? '<span class="pd-muted">Sem valor confirmado</span>' : `${moeda(r.valor)}${r.semValor?'<small>Parcial · '+numero(r.semValor)+' sem valor</small>':''}`;
  const card=(titulo,valor,nota,tipo='')=>`<div class="pd-kpi ${tipo}"><span>${esc(titulo)}</span><strong>${esc(valor)}</strong><small>${esc(nota)}</small></div>`;
  const barra=(n,max,classe='')=>`<div class="pd-track" aria-hidden="true"><i class="${classe}" style="width:${Math.max(0,Math.min(100,max?n/max*100:0)).toFixed(2)}%"></i></div>`;
  function tabelaEquipes(m) {
    return `<div class="pd-table-wrap" tabindex="0" role="region" aria-label="Comparativo completo das equipes"><table class="pd-table"><caption>Equipes e composições do período</caption><thead><tr><th scope="col">Equipe / composição</th><th scope="col">O.S. equivalentes confirmadas</th><th scope="col">Confirmadas / entregas</th><th scope="col">A conferir</th>${m.verValores?'<th scope="col">Valor confirmado</th>':''}</tr></thead><tbody>${m.equipes.map(e=>`<tr><th scope="row">${esc(e.nome)}<small>${e.posicao?e.posicao+'º na produção confirmada':'Sem produção confirmada calculável'}${e.salva?'':' · composição avulsa'}</small></th><td>${numero(e.equivalentes)}${e.semBase?`<small>${e.semBase} parcial(is) sem base</small>`:''}</td><td>${e.confirmadas} / ${e.entregas}</td><td>${e.aConferir}</td>${m.verValores?`<td>${valorHTML(e,true)}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
  }
  function equipesHTML(m,limite=0) {
    if(!m.equipes.length)return '<p class="pd-empty">Nenhuma equipe com participantes válidos neste período. Confira as entregas para começar a comparação.</p>';
    const linhas=limite?m.equipes.slice(0,limite):m.equipes,max=Math.max(...m.equipes.map(e=>e.equivalentes),0);
    return `<div class="pd-comparativo">${linhas.map(e=>`<div class="pd-bar-row"><div><strong>${esc(e.nome)}</strong><small>${e.confirmadas} confirmada(s) · ${e.aConferir} a conferir</small></div><div>${barra(e.equivalentes,max)}<span>${numero(e.equivalentes)} O.S. eq.</span></div></div>`).join('')}</div>${limite&&m.equipes.length>limite?'<p class="pd-muted">Primeiras '+limite+' de '+m.equipes.length+' composições. Veja todas em Comparar equipes.</p>':''}`;
  }
  function acoesHTML(m) {
    const lista=itens=>`<ol class="pd-actions">${itens.map(p=>`<li><span class="pd-count">${p.quantidade}</span><div><strong>${esc(p.titulo)}</strong><p>${esc(p.texto)}</p></div></li>`).join('')}</ol>`;
    return `<section class="pd-panel"><header><h4>Onde agir agora</h4><span>Com base nesta apuração</span></header>${m.proximas.length?`${lista(m.proximas.slice(0,3))}${m.proximas.length>3?`<details class="pd-detail"><summary>Mais ${m.proximas.length-3} oportunidade(s) de melhoria</summary>${lista(m.proximas.slice(3))}</details>`:''}`:`<p class="pd-empty">${m.total.entregas?'Nenhuma pendência nos critérios automáticos disponíveis. Confira o serviço e as ocorrências antes do fechamento.':'A primeira entrega registrada inicia os indicadores. Escolha outro período para consultar o histórico.'}</p>`}</section>`;
  }
  function geralHTML(m) {
    const t=m.total;
    return `<div class="pd-kpis">${card('Produção confirmada',numero(t.equivalentes)+' O.S. eq.',t.semBase?t.semBase+' parcial(is) ainda sem base':'Proporcional às partes entregues')}${card('Participações conferidas',t.cobertura===null?'Sem registros':t.cobertura+'%',`${t.confirmadas} de ${t.entregas} entregas`)}${card('A conferir',numero(t.aConferir),`${t.semEquipe} sem equipe · ${t.inconsistentes} inconsistentes`,t.aConferir?'pd-attention':'')}${m.verValores?card('Valor confirmado',t.valor===null?'Não disponível':moeda(t.valor),`${t.comValor} entrega(s) com valor · ${t.semValor} sem valor`):card('O.S. no período',numero(t.os),`${t.parciais} registro(s) por seleção de itens`)}</div><div class="pd-two"><section class="pd-panel"><header><h4>Produção por equipe</h4><span>Confirmada e proporcional</span></header>${equipesHTML(m,5)}<p class="pd-note">O tamanho da barra compara somente este período. Quantidade não mede sozinha qualidade ou complexidade.</p></section>${acoesHTML(m)}</div>`;
  }
  function evolucaoHTML(m,granularidade) {
    const semana=granularidade==='semana',linhas=semana?m.semanas:m.dias;
    const label=d=>semana?`${formatarDia(d.de)} a ${formatarDia(d.ate)}`:formatarDia(d.dia);
    const max=Math.max(...linhas.map(d=>d.equivalentes),0);
    return `<section class="pd-panel"><header><div><h4>Evolução das entregas</h4><p>Parte confirmada de cada O.S., na data da entrega.</p></div><div class="pd-toggle" role="group" aria-label="Agrupar evolução"><button type="button" data-perf-dash-granularidade="dia" aria-pressed="${!semana}">Por dia</button><button type="button" data-perf-dash-granularidade="semana" aria-pressed="${semana}">Por semana</button></div></header>${linhas.length?`<div class="pd-timeline" tabindex="0" role="region" aria-label="Gráfico de produção confirmada por ${semana?'semana':'dia'}"><div class="pd-timeline-grid" style="--pd-cols:${linhas.length}">${linhas.map(d=>`<div class="pd-day ${d.semRegistro?'pd-no-record':''}"><strong>${d.semRegistro?'—':numero(d.equivalentes)}</strong><div class="pd-column" aria-hidden="true"><i style="height:${max?(d.equivalentes/max*100).toFixed(2):0}%"></i></div><span>${esc(semana?formatarDia(d.de).slice(0,5):formatarDia(d.dia).slice(0,5))}</span><small>${d.semRegistro?'Sem registro':`${d.confirmadas}/${d.entregas} conf.`}</small></div>`).join('')}</div></div><p class="pd-note">— = sem registro de entrega na fonte consultada; não prova ausência de trabalho. Confirmadas/total aparece em cada coluna. Sem base proporcional não vira uma O.S. inteira.</p><details class="pd-detail"><summary>Ver tabela da evolução · ${linhas.length} ${semana?(linhas.length===1?'semana':'semanas'):(linhas.length===1?'dia':'dias')}</summary><div class="pd-table-wrap" tabindex="0" role="region" aria-label="Dados da evolução"><table class="pd-table"><caption>Produção confirmada por ${semana?'semana':'dia'}</caption><thead><tr><th scope="col">Período</th><th scope="col">Produção confirmada</th><th scope="col">Confirmadas / entregas</th><th scope="col">A conferir</th>${m.verValores?'<th scope="col">Valor confirmado</th>':''}</tr></thead><tbody>${linhas.map(d=>`<tr><th scope="row">${esc(label(d))}</th><td>${d.semRegistro?'Sem registro':numero(d.equivalentes)+' O.S. eq.'}${d.semBase?`<small>${d.semBase} parcial(is) sem base</small>`:''}</td><td>${d.confirmadas} / ${d.entregas}</td><td>${d.aConferir}</td>${m.verValores?`<td>${d.semRegistro?'—':valorHTML(d,true)}</td>`:''}</tr>`).join('')}</tbody></table></div></details>`:'<p class="pd-empty">Não há datas válidas para montar a evolução neste período.</p>'}</section>`;
  }
  function qualidadeHTML(m,options) {
    const q=m.qualidade,t=m.total;
    const etapas=[['Participação confirmada',t.confirmadas,t.entregas],['Voltas conferidas',q.voltasConferidas,q.voltas],['Voltas conferidas sem ocorrência',q.voltasSemOcorrencia,q.voltasConferidas]];
    return `<div class="pd-kpis">${card('O.S. com retrabalho marcado',numero(q.retrabalho),`${q.os} O.S. na base · responsabilidade a conferir`,q.retrabalho?'pd-attention':'')}${card('Voltas sem conferência',numero(q.voltasPendentes),`${q.voltas} volta(s) identificada(s)`,q.voltasPendentes?'pd-attention':'')}${card('Voltas com ocorrência',numero(q.voltasComOcorrencia),`${q.voltasConferidas} volta(s) com checklist completo`)}${card('Composição a resolver',numero(t.semEquipe+t.inconsistentes),`${t.semEquipe} sem equipe · ${t.inconsistentes} inconsistentes`)}</div><div class="pd-two"><section class="pd-panel"><header><h4>Cobertura da conferência</h4><span>O denominador de cada indicador está visível</span></header>${etapas.map(([label,n,total])=>`<div class="pd-quality-row"><div><strong>${esc(label)}</strong><span>${n} / ${total}${total?' · '+percentual(n,total)+'%':' · não se aplica'}</span></div>${barra(n,total)}</div>`).join('')}<p class="pd-note">Voltas sem resposta não são classificadas como boas ou ruins. Retrabalho marcado não identifica automaticamente o responsável.</p></section>${acoesHTML(m)}</div><section class="pd-panel"><header><h4>O que precisa de conferência</h4><span>${m.pendencias.length} apontamento(s); uma entrega pode ter mais de um</span></header>${m.pendencias.length?`<ul class="pd-pendencias">${m.pendencias.map(p=>`<li><div><strong>O.S. ${esc(p.numero||'a identificar')}</strong><p>${esc(p.motivo)}</p></div>${options.podeConferir&&p.id?`<button type="button" class="btn-ghost btn-sm" ${p.tipo==='volta'?'data-perf-audit-volta':['sem-valor','valor-erp'].includes(p.tipo)?'data-perf-os':'data-perf-audit-id'}="${esc(p.id)}">${p.tipo==='volta'?'Conferir volta':['sem-valor','valor-erp'].includes(p.tipo)?'Ver origem':'Conferir entrega'}</button>`:''}</li>`).join('')}</ul>`:'<p class="pd-empty">Nenhum apontamento nos critérios automáticos disponíveis.</p>'}</section>`;
  }
  function html(m,options = {}) {
    const vista=VISTAS.some(v=>v.id===options.vista)?options.vista:'geral';
    const conteudo=vista==='evolucao'?evolucaoHTML(m,options.granularidade):vista==='equipes'?`<section class="pd-panel"><header><h4>Comparar equipes</h4><span>Mesmo período, mesma regra</span></header>${equipesHTML(m)}<p class="pd-note">Empates têm a mesma posição. Equipes com entregas ainda sem confirmação ficam sem posição. Uma entrega compartilhada aparece em mais de uma equipe; as O.S. equivalentes e os valores respeitam a divisão.</p>${m.equipes.length?tabelaEquipes(m):''}</section>`:vista==='qualidade'?qualidadeHTML(m,options):geralHTML(m);
    return `<section class="perf-dash" aria-label="Painéis de performance"><header class="pd-heading"><div><h3>Painéis de performance</h3><p>${esc(formatarDia(m.periodo.de))} a ${esc(formatarDia(m.periodo.ate))} · ${m.total.entregas} entregas · ${m.total.os} O.S.</p></div><span class="pd-source">${esc(options.fonte || 'Dados da apuração selecionada')}</span></header><nav class="pd-nav" aria-label="Visões do relatório">${VISTAS.map(v=>`<button type="button" data-perf-dash-vista="${v.id}" aria-pressed="${v.id===vista}">${v.nome}</button>`).join('')}</nav>${m.alertas.map(a=>`<p class="pd-warning" role="status">${esc(a)}</p>`).join('')}<div class="pd-content" data-perf-dash-conteudo="${vista}">${conteudo}</div><details class="pd-method"><summary>Como ler estes painéis</summary><p>A produção confirmada usa a mesma régua do ranking: parciais contam pela fração da O.S. e grupos pela parte de cada equipe. Participação confirmada não prova qualidade. Sem valor ou sem base não vira zero financeiro. Os valores, quando liberados, são valores líquidos dos serviços com divisão confirmada; não são comissão, recebimento ou prêmio. O cadastro atual das equipes não reescreve as entregas antigas.</p></details></section>`;
  }
  return {VISTAS,montar,html,diaValido};
});
