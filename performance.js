'use strict';

// Participação é uma medida operacional. Não calcula salário ou bônus.
const PERF = (() => {
  const unicos = membros => [...new Map((membros || []).filter(p => p && p.chave).map(p => [String(p.chave), {...p}])).values()];
  const iguais = membros => {
    const ps = unicos(membros), n = ps.length;
    return ps.map((p,i) => ({...p, percentual: (Math.floor(10000/n) + (i < 10000 % n ? 1 : 0))/100}));
  };
  const validar = membros => {
    if (!Array.isArray(membros) || !membros.length) return 'Escolha pelo menos uma pessoa.';
    if (unicos(membros).length !== membros.length) return 'A mesma pessoa está repetida.';
    if (membros.some(p => !p.nome || typeof p.percentual !== 'number' || !Number.isFinite(p.percentual) || p.percentual <= 0 || p.percentual > 100)) return 'Cada participação precisa ser maior que zero e até 100%.';
    if (Math.abs(membros.reduce((s,p) => s + p.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    return '';
  };
  const composicao = membros => unicos(membros).map(p => String(p.chave)).sort().join('|');
  const resumir = registros => {
    const pessoas = new Map(), equipes = new Map();
    for (const r of registros) {
      if (validar(r.membros)) continue;
      for (const p of r.membros) {
        const x = pessoas.get(p.chave) || {chave:p.chave,nome:p.nome,os:0,equivalentes:0,valor:0,semValor:0,confirmadas:0};
        x.os++; if(r.confirmado) x.confirmadas++; x.equivalentes += p.percentual/100;
        if (r.valor == null) x.semValor++; else x.valor += r.valor*p.percentual/100;
        pessoas.set(p.chave,x);
      }
      // A equipe leva cada O.S. uma vez, mesmo com participação individual.
      const k = r.equipeId || ('avulsa:'+composicao(r.membros));
      const x = equipes.get(k) || {chave:k,nome:r.equipeNome || r.membros.map(p=>p.nome).join(' + '),emblema:r.emblema || '🤝',os:0,valor:0,semValor:0,confirmadas:0};
      x.os++; if(r.confirmado) x.confirmadas++; if(r.valor == null) x.semValor++; else x.valor+=r.valor;
      equipes.set(k,x);
    }
    return {pessoas:[...pessoas.values()].sort((a,b)=>b.equivalentes-a.equivalentes || a.nome.localeCompare(b.nome)),equipes:[...equipes.values()].sort((a,b)=>b.os-a.os || a.nome.localeCompare(b.nome))};
  };
  return {unicos,iguais,validar,composicao,resumir};
})();
if (typeof module !== 'undefined') module.exports = PERF;

const PERF_EMBLEMAS = ['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'];
function perfConfig() {
  const c = STORE.getCFG().performancePCP || {};
  return {equipes:Array.isArray(c.equipes)?c.equipes:[],participacoes:Array.isArray(c.participacoes)?c.participacoes:[]};
}
function perfPessoa(n) { const p = nomeExibicaoCasa(n); return {chave:String(p.chave),nome:p.nome,apelido:n}; }
function perfEquipeOS(os) { return PERF.unicos(OPERACAO.equipe(os).map(perfPessoa)); }
function perfRegistro(os,c) {
  const salvo = c.participacoes.find(p=>p.id===os.id);
  // Um registro confirmado mantém a composição e o nome da época.
  const membros = salvo ? salvo.membros : PERF.iguais(perfEquipeOS(os));
  return {...(salvo || {}),id:os.id,os,membros,valor:valorDaOS(os),confirmado:!!salvo};
}
function perfSalvar(c) {
  const cfg = STORE.getCFG(); cfg.performancePCP = c; STORE.saveCFG(cfg);
  toast('Alteração salva no aparelho; sincronizando com o servidor.','success');
}
function perfPodeEditar() { return ['admin','pcp'].includes(STATE.user?.papel) && (typeof podeEditar !== 'function' || podeEditar()); }
function perfFormato(n) { return Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2}); }
function perfDialog(titulo,corpo) {
  let d = document.getElementById('perf-dialog');
  if (!d) {d=document.createElement('dialog');d.id='perf-dialog';document.body.appendChild(d);}
  d.innerHTML=`<div class="perf-dialog-head"><h2>${esc(titulo)}</h2><button type="button" class="btn-ghost" aria-label="Fechar edição">✕</button></div>${corpo}`;
  d.querySelector('[aria-label="Fechar edição"]').onclick=()=>d.close(); d.showModal(); return d;
}
function perfEscolherMembrosHTML(membros) {
  const conhecidos = PERF.unicos([...membros,...(equipeEscalavel().doPCP || []).map(perfPessoa)]);
  return `<label>Buscar pessoa <input type="search" data-perf-busca placeholder="Nome ou apelido"></label><div class="perf-members">${conhecidos.map(p=>`<label class="perf-member"><input type="checkbox" name="membro" value="${esc(p.chave)}" data-nome="${esc(p.nome)}" data-apelido="${esc(p.apelido || p.nome)}" ${membros.some(m=>m.chave===p.chave)?'checked':''}><span>${esc(p.nome)}</span></label>`).join('')}</div>`;
}
function perfWireBusca(box) {
  const busca=box.querySelector('[data-perf-busca]');
  if(busca) busca.oninput=()=>box.querySelectorAll('.perf-member').forEach(n=>{n.hidden=!n.querySelector('input').checked && !normCasa(n.textContent).includes(normCasa(busca.value));});
}
function perfMarcados(box) { return [...box.querySelectorAll('input[name="membro"]:checked')].map(e=>({chave:e.value,nome:e.dataset.nome,apelido:e.dataset.apelido})); }
function perfEditarEquipe(id,membrosIniciais=[]) {
  if(!perfPodeEditar()) return;
  const c=perfConfig(), e=c.equipes.find(e=>e.id===id) || {nome:'',emblema:'🦅',membros:membrosIniciais};
  const d=perfDialog(id?'Editar equipe':'Criar equipe',`<form id="perf-equipe-form"><label>Nome da equipe <input name="nome" maxlength="60" required value="${esc(e.nome)}" placeholder="Ex.: Horizonte, Impulso, Precisão"></label><fieldset class="perf-emblemas"><legend>Emblema da equipe</legend>${PERF_EMBLEMAS.map(x=>`<label><input type="radio" name="emblema" value="${x}" ${x===e.emblema?'checked':''}><span>${x}</span></label>`).join('')}</fieldset>${perfEscolherMembrosHTML(e.membros)}<p class="metricas-nota">A equipe é um modelo reutilizável. Alterar integrantes aqui não muda entregas já confirmadas.</p><button class="btn-primary" type="submit">Salvar equipe</button></form>`);
  perfWireBusca(d);
  d.querySelector('form').onsubmit=ev=>{
    ev.preventDefault();const fd=new FormData(ev.target), membros=perfMarcados(d);
    if(!membros.length) return toast('Escolha os integrantes.','error');
    const nome=String(fd.get('nome')||'').trim(); if(!nome) return;
    const atual=perfConfig();
    if(id && JSON.stringify(atual.equipes.find(x=>x.id===id))!==JSON.stringify(e)) return toast('Esta equipe mudou enquanto você editava. Reabra a edição para conferir.','error');
    const novo={...e,id:id || STORE.uuid(),nome,emblema:String(fd.get('emblema')||'🤝'),membros,ativo:true};
    atual.equipes=atual.equipes.filter(x=>x.id!==novo.id).concat(novo);perfSalvar(atual);d.close();renderPerformanceCasa();
  };
}
function perfEditarParticipacao(id) {
  if(!perfPodeEditar()) return;
  const os=STORE.getOS(id); if(!os) return;
  const c=perfConfig(), r=perfRegistro(os,c);
  let membros=r.membros.map(p=>({...p}));
  const d=perfDialog('Participação · O.S. '+(os.numero||''),`<p>${esc(os.cliente||'')} · ${esc(os.servico||'')}</p><form id="perf-part-form"><label>Usar uma equipe <select name="equipe"><option value="">Participação individual / avulsa</option>${c.equipes.filter(e=>e.ativo!==false || e.id===r.equipeId).map(e=>`<option value="${esc(e.id)}" ${e.id===r.equipeId?'selected':''}>${esc(e.emblema)} ${esc(e.nome)}</option>`).join('')}</select></label><p class="metricas-nota">Confirme quem trabalhou nesta entrega. A escolha não altera a programação da O.S.</p><div id="perf-part-members">${perfEscolherMembrosHTML(membros)}</div><div id="perf-pesos"></div><button type="button" class="btn-ghost" id="perf-igual">Dividir igualmente</button><p id="perf-soma" aria-live="polite"></p><label>Observação da apuração <input name="obs" maxlength="300" value="${esc(r.obs||'')}" placeholder="Motivo de um ajuste, participação extra…"></label><button class="btn-primary" type="submit">Confirmar participação</button></form>`);
  const desenharPesos=()=>{
    d.querySelector('#perf-pesos').innerHTML=membros.map(p=>`<label class="perf-peso"><span>${esc(p.nome)}</span><input aria-label="Percentual de ${esc(p.nome)}" type="number" min="0.01" max="100" step="0.01" required data-chave="${esc(p.chave)}" value="${p.percentual}"><span>%</span></label>`).join('');
    const total=()=>{d.querySelector('#perf-soma').textContent='Total: '+perfFormato(membros.reduce((s,p)=>s+Number(p.percentual||0),0))+'% · precisa somar 100%';};
    d.querySelectorAll('[data-chave]').forEach(i=>i.oninput=()=>{membros.find(p=>p.chave===i.dataset.chave).percentual=Number(i.value);total();});total();
  };
  const ligarMembros=()=>{perfWireBusca(d);d.querySelectorAll('[name="membro"]').forEach(cb=>cb.onchange=()=>{membros=PERF.iguais(perfMarcados(d));desenharPesos();});};
  d.querySelector('[name="equipe"]').onchange=ev=>{
    const equipe=c.equipes.find(e=>e.id===ev.target.value);if(!equipe) return;
    membros=PERF.iguais(equipe.membros);d.querySelector('#perf-part-members').innerHTML=perfEscolherMembrosHTML(membros);ligarMembros();desenharPesos();
  };
  d.querySelector('#perf-igual').onclick=()=>{membros=PERF.iguais(membros);desenharPesos();};ligarMembros();desenharPesos();
  d.querySelector('form').onsubmit=ev=>{
    ev.preventDefault();const erro=PERF.validar(membros);if(erro)return toast(erro,'error');
    const fd=new FormData(ev.target), equipe=c.equipes.find(e=>e.id===fd.get('equipe'));
    const novo={id,numero:String(os.numero||''),membros:membros.map(p=>({...p})),equipeId:equipe?.id||'',equipeNome:equipe?.nome||'',emblema:equipe?.emblema||'🤝',obs:String(fd.get('obs')||'').trim(),em:new Date().toISOString(),por:STATE.user?.nome||''};
    const atual=perfConfig();
    if(JSON.stringify(atual.participacoes.find(p=>p.id===id))!==JSON.stringify(c.participacoes.find(p=>p.id===id))) return toast('Esta participação mudou enquanto você editava. Reabra a conferência.','error');
    atual.participacoes=atual.participacoes.filter(p=>p.id!==id).concat(novo);perfSalvar(atual);d.close();renderPerformanceCasa();
  };
}
function performanceEquipesHTML() {
  const c=perfConfig(), f=periodoOuMes('_fPerf');
  const lista=classificarEntregas(STORE.getAllOS()).instalacoes.filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate));
  const regs=lista.map(o=>perfRegistro(o,c)), resumo=PERF.resumir(regs);
  const confirmado=regs.filter(r=>r.confirmado).length, semEquipe=regs.filter(r=>!r.membros.length).length;
  const modo=STATE._perfModo || 'pessoas', pesquisa=STATE._perfBusca || '';
  const linhas=regs;
  const cards=(modo==='equipes'?resumo.equipes:resumo.pessoas).map(p=>`<article class="perf-score"><div class="perf-score-head">${modo==='equipes'?`<span class="perf-emblema">${esc(p.emblema)}</span>`:avatarRH(pessoasRH().find(x=>[x.chave,x.id].includes(p.chave))||{nome:p.nome})}<h3>${esc(p.nome)}</h3><div class="perf-count"><strong>${p.os}</strong><span>entregas</span></div></div><p class="perf-status">${p.confirmadas} confirmadas · ${p.os-p.confirmadas} a conferir</p><details><summary>Participação e valor</summary><p>${modo==='equipes'?'Valor das O.S. da equipe':perfFormato(p.equivalentes)+' O.S. equivalentes após rateio'}<br>${p.semValor===p.os?'Valor não disponível':dinheiroCasa(p.valor)+(p.semValor?' · valor parcial':'')}${modo==='pessoas'?' · valor rateado':''}</p></details>${modo==='pessoas'?`<button class="inline-link" data-perf-pessoa="${esc(p.nome)}">Ver entregas →</button>`:''}</article>`).join('');
  const sugestoes=new Map();
  for(const os of STORE.getAllOS()) {
    const membros=perfEquipeOS(os);if(membros.length<2)continue;
    const k=PERF.composicao(membros);if(c.equipes.some(e=>PERF.composicao(e.membros)===k))continue;
    const x=sugestoes.get(k)||{membros,n:0};x.n++;sugestoes.set(k,x);
  }
  const sugeridas=[...sugestoes.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  return `<section class="perf-workspace"><div class="filter-bar">${filtroPeriodoHTML('_fPerf')}<button class="btn-ghost" id="perf-pdf">📄 Relatório PDF</button></div>
    <div class="perf-summary"><div><b>${lista.length}</b><span>instalações no período</span></div><div><b>${confirmado}/${lista.length}</b><span>entregas com participação confirmada</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div>
    <div class="perf-toolbar"><div class="casa-vista"><button class="btn-ghost ${modo==='pessoas'?'active':''}" data-perf-modo="pessoas">👤 Pessoas</button><button class="btn-ghost ${modo==='equipes'?'active':''}" data-perf-modo="equipes">🤝 Equipes</button></div><span>Entregas com participação registrada ou sugerida</span></div>
    <p class="perf-coverage">${semEquipe ? `${semEquipe} de ${lista.length} entregas sem equipe: a comparação por pessoa está incompleta.` : 'Todas as entregas do período têm participantes.'} ${lista.length-confirmado} apurações aguardam confirmação.</p>
    <details class="perf-method"><summary>Como interpretar os indicadores</summary><p>Entregas conta as O.S. em que a pessoa participou; não some essa coluna entre pessoas. O.S. equivalentes divide cada entrega pelos percentuais, sem duplicação. Divisões sugeridas ainda não foram confirmadas. Valores rateados não são faturamento pessoal nem bônus. Qualidade, complexidade e retrabalho precisam de revisão. O histórico inclui apenas O.S. carregadas neste aparelho.</p></details>
    <div class="perf-score-grid">${cards || '<p>Nenhuma instalação com equipe neste período.</p>'}</div>
    <details class="perf-config"><summary>Equipes salvas <span>${c.equipes.length}</span></summary><p>Escolha uma equipe na Agenda ou na apuração e ajuste os participantes daquela entrega.</p><div class="perf-team-grid">${c.equipes.map(e=>`<article><span class="perf-emblema">${esc(e.emblema)}</span><h3>${esc(e.nome)}</h3><p>${e.membros.map(p=>esc(p.nome)).join(' · ')}</p>${perfPodeEditar()?`<button class="btn-ghost" data-perf-equipe="${esc(e.id)}">Editar equipe</button>`:''}</article>`).join('')}</div>${perfPodeEditar()?`<button class="btn-primary" id="perf-nova-equipe">+ Criar equipe</button>${sugeridas.length?'<h4>Composições já usadas nas O.S.</h4>':''}${sugeridas.map((s,i)=>`<button class="btn-ghost perf-sugestao" data-perf-sugestao="${i}">${s.membros.map(p=>esc(p.nome)).join(' + ')} <small>· ${s.n} O.S. · salvar como equipe</small></button>`).join('')}`:''}</details>
    <section class="perf-entregas"><h3>Conferência por entrega</h3><label>Buscar O.S., cliente ou pessoa · filtra a lista abaixo <input id="perf-busca-os" type="search" value="${esc(pesquisa)}" placeholder="Digite para localizar"></label><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / Cliente</th><th>Data</th><th>Equipe e participação</th><th>Conferência</th><th></th></tr></thead><tbody>${linhas.map(r=>`<tr><td><button class="inline-link" data-os-id="${esc(r.id)}">${esc(r.os.numero)}</button><small class="bloco">${esc(r.os.cliente)}</small></td><td>${esc(diaEntrega(r.os).split('-').reverse().join('/'))}</td><td>${r.equipeNome?`<strong>${esc(r.emblema)} ${esc(r.equipeNome)}</strong><br>`:''}${r.membros.map(p=>`${esc(p.nome)} · ${perfFormato(p.percentual)}%`).join('<br>') || 'Sem equipe'}</td><td><span class="badge">${r.confirmado?'Confirmada':r.membros.length?'Divisão sugerida':'Sem equipe'}</span>${r.os.retrabalho?'<small class="bloco">Serviço de retrabalho</small>':''}</td><td>${perfPodeEditar()?`<button class="btn-ghost" data-perf-part="${esc(r.id)}">Conferir</button>`:''}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div></section></section>`;
}
function wirePerformanceEquipes(el) {
  el.querySelectorAll('[data-perf-modo]').forEach(b=>b.onclick=()=>{STATE._perfModo=b.dataset.perfModo;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-equipe]').forEach(b=>b.onclick=()=>perfEditarEquipe(b.dataset.perfEquipe));
  el.querySelectorAll('[data-perf-part]').forEach(b=>b.onclick=()=>perfEditarParticipacao(b.dataset.perfPart));
  const nova=el.querySelector('#perf-nova-equipe');if(nova)nova.onclick=()=>perfEditarEquipe('');
  const c=perfConfig(), grupos=new Map();
  for(const os of STORE.getAllOS()){const membros=perfEquipeOS(os),k=PERF.composicao(membros);if(membros.length<2 || c.equipes.some(e=>PERF.composicao(e.membros)===k))continue;const g=grupos.get(k)||{membros,n:0};g.n++;grupos.set(k,g);}
  const sugeridas=[...grupos.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  el.querySelectorAll('[data-perf-sugestao]').forEach(b=>b.onclick=()=>perfEditarEquipe('',sugeridas[Number(b.dataset.perfSugestao)].membros));
  el.querySelectorAll('[data-perf-pessoa]').forEach(b=>b.onclick=()=>{const input=el.querySelector('#perf-busca-os');input.value=b.dataset.perfPessoa;input.oninput();el.querySelector('.perf-entregas').scrollIntoView({behavior:'smooth',block:'start'});});
  const relPdf=el.querySelector('#perf-rel-pdf');if(relPdf)relPdf.onclick=()=>imprimirAnalisePCP('Relatório de performance',el.querySelector('.perf-report'),periodoOuMes('_fPerf'));
  const busca=el.querySelector('#perf-busca-os');if(busca)busca.oninput=()=>{
    const termo=normCasa(busca.value);STATE._perfBusca=busca.value;
    el.querySelectorAll('.perf-entregas tbody tr').forEach(tr=>{tr.hidden=!normCasa(tr.textContent).includes(termo);});
  };
  if(busca && busca.value) busca.oninput();
  const pdf=el.querySelector('#perf-pdf');if(pdf)pdf.onclick=()=>{
    const copy=el.querySelector('.perf-workspace').cloneNode(true);copy.querySelector('.perf-config')?.remove();copy.querySelectorAll('[hidden]').forEach(x=>x.remove());
    const note=document.createElement('p');note.textContent='Detalhamento filtrado por: '+(STATE._perfBusca||'todas as entregas')+'. Os totais acima abrangem o período completo.';copy.prepend(note);
    imprimirAnalisePCP('Performance e participação',copy,periodoOuMes('_fPerf'));
  };
  bindCardClicks(el);
}
function perfModeloEquipeHTML() {
  return `<label>Equipe salva <select data-perf-modelo><option value="">Escolher pessoas individualmente</option>${perfConfig().equipes.filter(e=>e.ativo!==false).map(e=>`<option value="${esc(e.id)}">${esc(e.emblema)} ${esc(e.nome)}</option>`).join('')}</select><small>Você pode acrescentar ou retirar pessoas abaixo.</small></label>`;
}
function perfWireModelo(form) {
  const sel=form.querySelector('[data-perf-modelo]');if(!sel)return;
  sel.onchange=()=>{
    const e=perfConfig().equipes.find(e=>e.id===sel.value);if(!e)return;
    const faltando=e.membros.filter(p=>![...form.querySelectorAll('[name="equipe"]')].some(cb=>perfPessoa(cb.value).chave===p.chave));
    if(faltando.length){toast('Equipe possui integrante indisponível no cadastro atual. Confira a seleção individual.','error');return;}
    form.querySelectorAll('[name="equipe"]').forEach(cb=>{cb.checked=e.membros.some(p=>p.chave===perfPessoa(cb.value).chave);cb.closest('.casa-chip').classList.toggle('on',cb.checked);});
  };
}

function performanceRelatorioHTML() {
  const f=periodoOuMes('_fPerf'),c=perfConfig();
  const regs=classificarEntregas(STORE.getAllOS()).instalacoes.filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate)).map(o=>perfRegistro(o,c));
  const validos=regs.filter(r=>!PERF.validar(r.membros)), confirmados=validos.filter(r=>r.confirmado);
  const resumo=PERF.resumir(validos), confirmado=PERF.resumir(confirmados);
  const semEquipe=regs.filter(r=>!r.membros.length).length;
  const cobertura=regs.length?Math.round(confirmados.length/regs.length*100):0;
  const tabela=(titulo,linhas,equipe=false)=>`<h3>${titulo}</h3><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>${equipe?'Equipe':'Pessoa'}</th><th>Entregas</th><th>Confirmadas</th><th>A conferir</th><th>Valor confirmado${equipe?'':' rateado'}</th></tr></thead><tbody>${linhas.map(p=>{const cf=(equipe?confirmado.equipes:confirmado.pessoas).find(x=>x.chave===p.chave);return `<tr><td>${esc(p.nome)}</td><td>${p.os}</td><td>${p.confirmadas}</td><td>${p.os-p.confirmadas}</td><td>${!cf?'—':cf.semValor===cf.os?'Sem valor':dinheiroCasa(cf.valor)+(cf.semValor?' (parcial)':'')}</td></tr>`;}).join('') || '<tr><td colspan="5">Sem participantes registrados neste período.</td></tr>'}</tbody></table></div>`;
  return `<section class="perf-report"><h3>Conferência do período</h3><div class="perf-summary"><div><b>${regs.length}</b><span>entregas no período</span></div><div><b>${cobertura}%</b><span>com participação confirmada (${confirmados.length})</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div><p class="perf-coverage">${confirmados.length<regs.length?'Apuração parcial: confirme as participações antes de comparar o desempenho ou decidir bonificações.':'Participações conferidas. Quantidade de entregas não mede sozinha qualidade, esforço ou complexidade.'}</p>${tabela('Participação por pessoa',resumo.pessoas)}${tabela('Participação por equipe',resumo.equipes,true)}<p class="metricas-nota">Entregas inclui participações sugeridas e confirmadas. A mesma O.S. pode aparecer para mais de uma pessoa; não some a coluna entre colaboradores. Valores incluem somente participações confirmadas, sem duplicar o valor entre pessoas. Não representam lucro, recebimento ou bônus. Fonte: instalações disponíveis neste aparelho; histórico antigo pode estar incompleto.</p></section>`;
}
