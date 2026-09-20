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
  const incluiPessoa = (membros,chave) => !chave || membros.some(p=>String(p.chave)===String(chave));
  const manterPesos = (anteriores,selecionados) => selecionados.map(p=>({...p,percentual:anteriores.find(a=>a.chave===p.chave)?.percentual || 0}));
  const dossie = registros => {
    const grupos=new Map();
    for(const r of registros){
      if(validar(r.membros))continue;
      const chave=r.equipeId || 'avulsa:'+composicao(r.membros);
      const g=grupos.get(chave)||{chave,nome:r.equipeNome || 'Composição avulsa',emblema:r.emblema||'🤝',registros:[],membros:new Map(),confirmadas:0,valor:0,semValor:0,retrabalhos:0};
      g.registros.push(r);if(r.os?.retrabalho || r.retrabalho)g.retrabalhos++;
      if(r.confirmado){g.confirmadas++;if(r.valor==null)g.semValor++;else g.valor+=r.valor;}
      for(const m of r.membros){const pessoa=g.membros.get(m.chave)||{chave:m.chave,nome:m.nome,entregas:0,confirmadas:0,equivalentes:0};pessoa.entregas++;if(r.confirmado){pessoa.confirmadas++;pessoa.equivalentes+=m.percentual/100;}g.membros.set(m.chave,pessoa);}
      grupos.set(chave,g);
    }
    return [...grupos.values()].map(g=>({...g,membros:[...g.membros.values()]})).sort((a,b)=>b.registros.length-a.registros.length || a.nome.localeCompare(b.nome));
  };
  return {unicos,iguais,validar,composicao,resumir,incluiPessoa,manterPesos,dossie};
})();
if (typeof module !== 'undefined') module.exports = PERF;

// Fonte de apuração isolada do cache operacional e dos lançamentos offline.
let perfRemoto = {chave:'',dados:null,fechamentos:[],carregando:false,erro:'',selecionado:'',tentado:false};
function perfChave(){const f=periodoOuMes('_fPerf');return f.de+'|'+f.ate;}
function perfFonteAtual(){
  if(perfRemoto.chave!==perfChave())return null;
  return perfRemoto.selecionado?perfRemoto.fechamentos.find(x=>x.id===perfRemoto.selecionado):perfRemoto.dados;
}
function perfLista(){
  const fonte=perfFonteAtual();
  if(!fonte)return classificarEntregas(STORE.getAllOS()).instalacoes;
  return fonte.registros.map(r=>({id:r.id,numero:r.numero,cliente:r.cliente,finalizadaEm:r.dia,equipe:r.membros.map(p=>p.nome),retrabalho:r.retrabalho,_perf:r}));
}
function perfOS(id){return perfLista().find(o=>o.id===id) || STORE.getOS(id);}
function perfFonteTexto(){const f=perfFonteAtual();return f?(f.fechadoEm?'Fechamento preservado · revisão '+f.revisao+' · '+f.fechadoPor+' · '+new Date(f.fechadoEm).toLocaleString('pt-BR'):'Base compartilhada do PCP · consultada em '+new Date(f.consultadoEm).toLocaleString('pt-BR'))+'. '+f.fonte:'Prévia local incompleta. Aguarde a consulta ao servidor antes de apurar.';}
function perfFonteHTML(){
 const f=perfFonteAtual(),pendentes=STORE.getQueue?.().length || 0;
 return `<section class="perf-fonte"><h3>Base da apuração e fechamentos</h3><p>${esc(perfFonteTexto())}</p>${pendentes?`<p class="perf-coverage">${pendentes} alterações locais aguardam sincronização. O servidor ainda pode não conter essas alterações.</p>`:''}${perfRemoto.erro?`<p role="alert">${esc(perfRemoto.erro)}</p>`:''}<div class="perf-filtros"><button class="btn-ghost" id="perf-atualizar-fonte" ${perfRemoto.carregando?'disabled':''}>${perfRemoto.carregando?'Consultando servidor…':'Atualizar apuração'}</button><label>Versão da apuração <select id="perf-versao"><option value="">Dados atuais</option>${perfRemoto.fechamentos.map(r=>`<option value="${esc(r.id)}" ${r.id===perfRemoto.selecionado?'selected':''}>Revisão ${r.revisao} · ${esc(r.fechadoEm.slice(0,10))} · ${esc(r.fechadoPor)}</option>`).join('')}</select></label>${perfPodeEditar()?`<button class="btn-primary" id="perf-fechar" ${!f||f.fechadoEm||pendentes||perfRemoto.carregando?'disabled':''}>${perfRemoto.fechamentos.length?'Criar nova revisão':'Fechar período'}</button>`:''}</div>${f?.motivo?`<p>Motivo: ${esc(f.motivo)}</p>`:''}<p class="metricas-nota">Cada revisão preserva datas, participantes, percentuais e valores. Uma nova revisão não apaga a anterior. Fechar não calcula nem paga bonificação.</p></section>`;
}
async function perfCarregarFonte(){
 const chave=perfChave(),f=periodoOuMes('_fPerf');
 if(perfRemoto.chave===chave && perfRemoto.carregando)return;
 const pedido={chave,dados:null,fechamentos:[],carregando:true,erro:'',selecionado:'',tentado:true};perfRemoto=pedido;
 renderPerformanceCasa();
 try{
   if(!f.de||!f.ate)throw new Error('Selecione as datas inicial e final para consultar a base completa.');
   const [dados,historico]=await Promise.all([STORE.api({action:'performancePeriodo',...f}),STORE.api({action:'performanceFechamentos',...f})]);
   if(!dados?.completo || !Array.isArray(dados.registros) || !Array.isArray(historico?.fechamentos))throw new Error(dados?.error||historico?.error||'Consulta incompleta. O fechamento permanece indisponível.');
   pedido.dados=dados;pedido.fechamentos=historico.fechamentos;
 }catch(e){pedido.erro=e.message || 'Não foi possível consultar o servidor.';}
 finally{pedido.carregando=false;if(perfRemoto===pedido && perfChave()===chave)renderPerformanceCasa();}
}
function perfWireFonte(el){
 const atualizar=el.querySelector('#perf-atualizar-fonte');if(atualizar)atualizar.onclick=perfCarregarFonte;
 const versao=el.querySelector('#perf-versao');if(versao)versao.onchange=()=>{perfRemoto.selecionado=versao.value;renderPerformanceCasa();};
 const fechar=el.querySelector('#perf-fechar');if(fechar)fechar.onclick=()=>{
   const fonte=perfFonteAtual();if(!fonte || fonte.fechadoEm || STORE.getQueue().length)return;
   if(!fonte.registros.length || fonte.registros.some(r=>!r.confirmado||r.valor==null))return toast('Confirme as participações e os valores de todas as entregas antes de fechar.','error');
   const d=perfDialog('Conferir fechamento',`<p>${esc(fonte.periodo.de)} a ${esc(fonte.periodo.ate)} · ${fonte.registros.length} entregas. A cópia será preservada no servidor.</p><form><label>Motivo do fechamento ou revisão <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p>As revisões anteriores continuarão disponíveis. Não há lançamento de pagamento.</p><button class="btn-primary" type="submit">Confirmar fechamento</button><p role="alert" id="perf-fechar-erro"></p></form>`);
   const requestId=STORE.uuid(),anterior=perfRemoto.fechamentos[0]?.id || '';
   d.querySelector('form').onsubmit=async ev=>{
     ev.preventDefault();const btn=d.querySelector('[type="submit"]');btn.disabled=true;
     try{if(STORE.getQueue().length)throw new Error('Há alterações aguardando envio. Sincronize e atualize a apuração.');
       const r=await STORE.api({action:'performanceFechar',...fonte.periodo,hash:fonte.hash,anterior,requestId,motivo:new FormData(ev.target).get('motivo')});
       if(!r?.ok||!r.fechamento)throw new Error(r?.error || 'Não foi possível confirmar o fechamento.');
       d.close();await perfCarregarFonte();if(perfRemoto.chave===fonte.periodo.de+'|'+fonte.periodo.ate){perfRemoto.selecionado=r.fechamento.id;renderPerformanceCasa();}toast('Fechamento preservado no servidor.','success');
     }catch(e){d.querySelector('#perf-fechar-erro').textContent=e.message;}finally{btn.disabled=false;}
   };
 };
 if(typeof STORE.api==='function' && (perfRemoto.chave!==perfChave() || !perfRemoto.tentado))void perfCarregarFonte();
}

const PERF_EMBLEMAS = ['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'];
function perfConfig() {
  const c = STORE.getCFG().performancePCP || {};
  return {equipes:Array.isArray(c.equipes)?c.equipes:[],participacoes:Array.isArray(c.participacoes)?c.participacoes:[]};
}
function perfPessoa(n) { const p = nomeExibicaoCasa(n); return {chave:String(p.chave),nome:p.nome,apelido:n}; }
function perfEquipeOS(os) { return PERF.unicos(OPERACAO.equipe(os).map(perfPessoa)); }
function perfRegistro(os,c) {
  if(os._perf)return {...os._perf,os,membros:os._perf.confirmado?os._perf.membros:os._perf.membros.map(p=>({...perfPessoa(p.nome),percentual:p.percentual}))};
  const salvo = c.participacoes.find(p=>p.id===os.id);
  // Um registro confirmado mantém a composição e o nome da época.
  const membros = salvo ? salvo.membros : PERF.iguais(perfEquipeOS(os));
  return {...(salvo || {}),id:os.id,os,membros,valor:valorDaOS(os),confirmado:!!salvo && !PERF.validar(membros)};
}
async function perfSalvar(c) {
  const cfg = STORE.getCFG(); cfg.performancePCP = c; STORE.saveCFG(cfg);
  perfRemoto.dados=null;perfRemoto.erro='Alteração local: aguardando sincronização e nova consulta.';
  toast('Alteração salva no aparelho; sincronizando com o servidor.','success');
  try{await STORE.trySync();if(!STORE.getQueue().length)await perfCarregarFonte();}catch(e){perfRemoto.erro='Alteração guardada no aparelho. Sincronize e atualize a apuração.';}

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
  const os=perfOS(id); if(!os || perfFonteAtual()?.fechadoEm) return;
  const c=perfConfig(), r=perfRegistro(os,c);
  let membros=r.membros.map(p=>({...p}));
  const d=perfDialog('Participação · O.S. '+(os.numero||''),`<p>${esc(os.cliente||'')} · ${esc(os.servico||'')}</p><form id="perf-part-form"><label>Usar uma equipe <select name="equipe"><option value="">Participação individual / avulsa</option>${c.equipes.filter(e=>e.ativo!==false || e.id===r.equipeId).map(e=>`<option value="${esc(e.id)}" ${e.id===r.equipeId?'selected':''}>${esc(e.emblema)} ${esc(e.nome)}</option>`).join('')}</select></label><p class="metricas-nota">Confirme quem trabalhou nesta entrega. A escolha não altera a programação da O.S.</p><div id="perf-part-members">${perfEscolherMembrosHTML(membros)}</div><div id="perf-pesos"></div><button type="button" class="btn-ghost" id="perf-igual">Dividir igualmente</button><p id="perf-soma" aria-live="polite"></p><label>Observação da apuração <input name="obs" maxlength="300" value="${esc(r.obs||'')}" placeholder="Motivo de um ajuste, participação extra…"></label><button class="btn-primary" type="submit">Confirmar participação</button></form>`);
  const desenharPesos=()=>{
    d.querySelector('#perf-pesos').innerHTML=membros.map(p=>`<label class="perf-peso"><span>${esc(p.nome)}</span><input aria-label="Percentual de ${esc(p.nome)}" type="number" min="0.01" max="100" step="0.01" required data-chave="${esc(p.chave)}" value="${p.percentual}"><span>%</span></label>`).join('');
    const total=()=>{d.querySelector('#perf-soma').textContent='Total: '+perfFormato(membros.reduce((s,p)=>s+Number(p.percentual||0),0))+'% · precisa somar 100%';};
    d.querySelectorAll('[data-chave]').forEach(i=>i.oninput=()=>{membros.find(p=>p.chave===i.dataset.chave).percentual=Number(i.value);total();});total();
  };
  const ligarMembros=()=>{perfWireBusca(d);d.querySelectorAll('[name="membro"]').forEach(cb=>cb.onchange=()=>{membros=PERF.manterPesos(membros,perfMarcados(d));desenharPesos();});};
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
  const lista=perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate));
  const regs=lista.map(o=>perfRegistro(o,c)), resumo=PERF.resumir(regs), apurado=PERF.resumir(regs.filter(r=>r.confirmado));
  const confirmado=regs.filter(r=>r.confirmado).length, semEquipe=regs.filter(r=>!r.membros.length).length;
  const modo=STATE._perfModo || 'pessoas', pesquisa=STATE._perfBusca || '';
  const linhas=regs;
  const cards=(modo==='equipes'?resumo.equipes:resumo.pessoas).map(p=>{
    const cf=(modo==='equipes'?apurado.equipes:apurado.pessoas).find(x=>x.chave===p.chave);
    const valor=!cf?'Aguardando conferência':cf.semValor===cf.os?'Valor não disponível':dinheiroCasa(cf.valor)+(cf.semValor?' · parcial':'');
    return `<article class="perf-score"><div class="perf-score-head">${modo==='equipes'?`<span class="perf-emblema">${esc(p.emblema)}</span>`:avatarRH(pessoasRH().find(x=>[x.chave,x.id].includes(p.chave))||{nome:p.nome})}<h3>${esc(p.nome)}</h3><div class="perf-count"><strong>${p.os}</strong><span>entregas</span></div></div><p class="perf-status">${p.confirmadas} confirmadas · ${p.os-p.confirmadas} a conferir</p><p><strong>${valor}</strong><br>Valor confirmado${modo==='pessoas'?' · rateado':''}</p><details><summary>Entender a participação</summary><p>${modo==='equipes'?'Cada O.S. é contada uma vez na equipe.':perfFormato(cf?.equivalentes || 0)+' O.S. equivalentes confirmadas após rateio.'} Entregas inclui sugestões; valores incluem apenas confirmações. Não representa bônus.</p></details><button class="inline-link" ${modo==='pessoas'?`data-perf-pessoa="${esc(p.chave)}"`:`data-perf-grupo="${esc(p.chave)}"`}>Ver entregas →</button></article>`;
  }).join('');
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
    <details class="perf-method"><summary>Como interpretar os indicadores</summary><p>Entregas conta as O.S. em que a pessoa participou; não some essa coluna entre pessoas. O.S. equivalentes divide cada entrega pelos percentuais, sem duplicação. Divisões sugeridas ainda não foram confirmadas. Valores rateados não são faturamento pessoal nem bônus. Qualidade, complexidade e retrabalho precisam de revisão. ${esc(perfFonteTexto())}</p></details>
    <div class="perf-score-grid">${cards || '<p>Nenhuma instalação com equipe neste período.</p>'}</div>
    <details class="perf-config"><summary>Equipes salvas <span>${c.equipes.length}</span></summary><p>Escolha uma equipe na Agenda ou na apuração e ajuste os participantes daquela entrega.</p><div class="perf-team-grid">${c.equipes.map(e=>`<article><span class="perf-emblema">${esc(e.emblema)}</span><h3>${esc(e.nome)}</h3><p>${e.membros.map(p=>esc(p.nome)).join(' · ')}</p>${perfPodeEditar()?`<button class="btn-ghost" data-perf-equipe="${esc(e.id)}">Editar equipe</button>`:''}</article>`).join('')}</div>${perfPodeEditar()?`<button class="btn-primary" id="perf-nova-equipe">+ Criar equipe</button>${sugeridas.length?'<h4>Composições já usadas nas O.S.</h4>':''}${sugeridas.map((s,i)=>`<button class="btn-ghost perf-sugestao" data-perf-sugestao="${i}">${s.membros.map(p=>esc(p.nome)).join(' + ')} <small>· ${s.n} O.S. · salvar como equipe</small></button>`).join('')}`:''}</details>
    <section class="perf-entregas"><h3>Conferência por entrega</h3><div class="perf-filtros"><label>Situação <select id="perf-situacao"><option value="">Todas</option><option value="pendente">A conferir</option><option value="confirmada">Confirmadas</option><option value="sem-equipe">Sem equipe</option><option value="invalida">Participação inconsistente</option></select></label><button class="btn-ghost" id="perf-limpar">Limpar filtros da lista</button><span id="perf-recorte" role="status"></span></div><label>Buscar O.S., cliente ou pessoa · filtra a lista abaixo <input id="perf-busca-os" type="search" value="${esc(pesquisa)}" placeholder="Digite para localizar"></label><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / Cliente</th><th>Data</th><th>Equipe e participação</th><th>Conferência</th><th></th></tr></thead><tbody>${linhas.map(r=>`<tr data-perf-id="${esc(r.id)}"><td><button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button><small class="bloco">${esc(r.os.cliente)}</small></td><td>${esc(diaEntrega(r.os).split('-').reverse().join('/'))}</td><td>${r.equipeNome?`<strong>${esc(r.emblema)} ${esc(r.equipeNome)}</strong><br>`:''}${r.membros.map(p=>`${esc(p.nome)} · ${perfFormato(p.percentual)}%`).join('<br>') || 'Sem equipe'}</td><td><span class="badge">${r.confirmado?'Confirmada':!r.membros.length?'Sem equipe':PERF.validar(r.membros)?'Participação inconsistente':'Divisão sugerida'}</span>${r.os.retrabalho?'<small class="bloco">Serviço de retrabalho</small>':''}</td><td>${perfPodeEditar()&&!perfFonteAtual()?.fechadoEm?`<button class="btn-ghost" data-perf-part="${esc(r.id)}">Conferir</button>`:''}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div></section></section>`;
}
function wirePerformanceEquipes(el) {
  perfWireFonte(el);
  el.querySelectorAll('[data-perf-modo]').forEach(b=>b.onclick=()=>{STATE._perfModo=b.dataset.perfModo;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-equipe]').forEach(b=>b.onclick=()=>perfEditarEquipe(b.dataset.perfEquipe));
  el.querySelectorAll('[data-perf-part]').forEach(b=>b.onclick=()=>perfEditarParticipacao(b.dataset.perfPart));
  const nova=el.querySelector('#perf-nova-equipe');if(nova)nova.onclick=()=>perfEditarEquipe('');
  const c=perfConfig(), grupos=new Map();
  for(const os of STORE.getAllOS()){const membros=perfEquipeOS(os),k=PERF.composicao(membros);if(membros.length<2 || c.equipes.some(e=>PERF.composicao(e.membros)===k))continue;const g=grupos.get(k)||{membros,n:0};g.n++;grupos.set(k,g);}
  const sugeridas=[...grupos.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  el.querySelectorAll('[data-perf-sugestao]').forEach(b=>b.onclick=()=>perfEditarEquipe('',sugeridas[Number(b.dataset.perfSugestao)].membros));
  const busca=el.querySelector('#perf-busca-os'), situacao=el.querySelector('#perf-situacao');
  const filtrar=()=>{
    if(!busca)return;
    STATE._perfBusca=busca.value;STATE._perfSituacao=situacao.value;
    let n=0;
    el.querySelectorAll('.perf-entregas tr[data-perf-id]').forEach(tr=>{
      const os=perfOS(tr.dataset.perfId),r=perfRegistro(os,perfConfig());
      const grupo=r.equipeId || 'avulsa:'+PERF.composicao(r.membros);
      const status=!r.membros.length?'sem-equipe':PERF.validar(r.membros)?'invalida':r.confirmado?'confirmada':'pendente';
      const ok=(!situacao.value || (situacao.value==='pendente'?!r.confirmado:status===situacao.value)) && PERF.incluiPessoa(r.membros,STATE._perfPessoa) && (!STATE._perfGrupo || grupo===STATE._perfGrupo) && normCasa(tr.textContent).includes(normCasa(busca.value));
      tr.hidden=!ok;if(ok)n++;
    });
    el.querySelector('#perf-recorte').textContent=n+(n===1?' entrega na lista':' entregas na lista')+(STATE._perfPessoa || STATE._perfGrupo?' · participante/equipe selecionado':'')+'. Totais dos cards: período completo.';
  };
  el.querySelectorAll('[data-perf-pessoa],[data-perf-grupo]').forEach(b=>b.onclick=()=>{STATE._perfPessoa=b.dataset.perfPessoa||'';STATE._perfGrupo=b.dataset.perfGrupo||'';busca.value='';situacao.value='';filtrar();el.querySelector('.perf-entregas').scrollIntoView({behavior:'smooth',block:'start'});});
  if(busca){situacao.value=STATE._perfSituacao||'';busca.oninput=filtrar;situacao.onchange=filtrar;el.querySelector('#perf-limpar').onclick=()=>{STATE._perfPessoa='';STATE._perfGrupo='';busca.value='';situacao.value='';filtrar();};filtrar();}
  const relPdf=el.querySelector('#perf-rel-pdf');if(relPdf)relPdf.onclick=()=>{const copy=el.querySelector('.perf-report').cloneNode(true);copy.querySelectorAll('.perf-team-report details,.perf-report-pendencias').forEach(n=>n.remove());imprimirAnalisePCP('Performance · resumo de pessoas e equipes',copy,periodoOuMes('_fPerf'),perfFonteTexto());};
  const detalhado=el.querySelector('#perf-rel-detalhado');if(detalhado)detalhado.onclick=()=>{
    const copy=el.querySelector('.perf-report').cloneNode(true);
    imprimirAnalisePCP('Performance · resumo e O.S.',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  const pdf=el.querySelector('#perf-pdf');if(pdf)pdf.onclick=()=>{
    const copy=el.querySelector('.perf-workspace').cloneNode(true);copy.querySelector('.perf-config')?.remove();copy.querySelectorAll('[hidden]').forEach(x=>x.remove());
    const note=document.createElement('p');note.textContent='Detalhamento filtrado por: '+(el.querySelector('#perf-recorte')?.textContent || 'todas as entregas')+' Busca: '+(STATE._perfBusca||'sem busca')+'. Os totais acima abrangem o período completo.';copy.prepend(note);
    imprimirAnalisePCP('Performance e participação',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  el.querySelectorAll('[data-perf-os]').forEach(b=>b.onclick=()=>{
    const r=perfRegistro(perfOS(b.dataset.perfOs),perfConfig());
    perfDialog('O.S. '+(r.os.numero||''),`<p>${esc(r.os.cliente||'')}</p><p>Entrega: ${esc(diaEntrega(r.os))}</p><p>Valor: ${r.valor==null?'Não disponível':dinheiroCasa(r.valor)} · ${esc(r.origemValor||'Base local')}</p><p>${r.confirmado?'Participação confirmada':'Aguardando conferência'}</p><ul>${r.membros.map(p=>`<li>${esc(p.nome)} · ${perfFormato(p.percentual)}%</li>`).join('')}</ul>${r.por?`<p>Conferido por ${esc(r.por)} · ${esc(r.em||'')}</p>`:''}${r.obs?`<p>${esc(r.obs)}</p>`:''}<p>${esc(perfFonteTexto())}</p>`);
  });
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
  const regs=perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate)).map(o=>perfRegistro(o,c));
  const validos=regs.filter(r=>!PERF.validar(r.membros)), confirmados=validos.filter(r=>r.confirmado);
  const resumo=PERF.resumir(validos), confirmado=PERF.resumir(confirmados), grupos=PERF.dossie(regs);
  const semEquipe=regs.filter(r=>!r.membros.length).length, inconsistentes=regs.length-validos.length-semEquipe;
  const cobertura=regs.length?Math.round(confirmados.length/regs.length*100):0;
  const semValor=confirmados.filter(r=>r.valor==null).length,valor=confirmados.reduce((n,r)=>n+(r.valor??0),0);
  const fmtDia=v=>String(v||'').slice(0,10).split('-').reverse().join('/');
  const valorTexto=(n,conhecidas,total)=>!total?'A conferir':!conhecidas?'Sem valor':dinheiroCasa(n)+(conhecidas<total?' · parcial':'');
  const tabela=(titulo,linhas,equipe=false)=>`<section class="perf-report-section"><h3>${titulo}</h3><p class="metricas-nota">${equipe?'Cada entrega conta uma vez na equipe.':'O.S. equivalentes somam os percentuais confirmados: duas participações de 50% equivalem a uma O.S.'}</p><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>${equipe?'Equipe':'Pessoa'}</th><th>Entregas</th><th>Confirmadas</th><th>A conferir</th>${equipe?'':'<th>O.S. equivalentes confirmadas</th>'}<th>Valor confirmado${equipe?'':' rateado'}</th></tr></thead><tbody>${linhas.map(p=>{const cf=(equipe?confirmado.equipes:confirmado.pessoas).find(x=>x.chave===p.chave);return `<tr><td><strong>${esc(p.nome)}</strong></td><td>${p.os}</td><td>${p.confirmadas}</td><td>${p.os-p.confirmadas}</td>${equipe?'':`<td>${perfFormato(cf?.equivalentes || 0)}</td>`}<td>${!cf?'—':cf.semValor===cf.os?'Sem valor':dinheiroCasa(cf.valor)+(cf.semValor?' (parcial)':'')}</td></tr>`;}).join('') || `<tr><td colspan="${equipe?5:6}">Sem participantes registrados neste período.</td></tr>`}</tbody></table></div></section>`;
  const equipes=grupos.map(g=>`<article class="perf-team-report"><header><span class="perf-emblema">${esc(g.emblema)}</span><div><h4>${esc(g.nome)}</h4><p>${g.membros.length} participantes no período · ${g.registros.length} entrega${g.registros.length===1?'':'s'}</p></div><strong>${valorTexto(g.valor,g.confirmadas-g.semValor,g.confirmadas)}<small>valor confirmado da equipe</small></strong></header><div class="perf-team-numbers"><span><b>${g.confirmadas}</b> ${g.confirmadas===1?'confirmada':'confirmadas'}</span><span><b>${g.registros.length-g.confirmadas}</b> a conferir</span><span><b>${g.retrabalhos}</b> com marca de retrabalho</span></div><div class="perf-member-list">${g.membros.map(m=>`<span><strong>${esc(m.nome)}</strong><small>${m.entregas} entrega${m.entregas===1?'':'s'} · ${m.confirmadas} ${m.confirmadas===1?'confirmada':'confirmadas'} · ${perfFormato(m.equivalentes)} O.S. equivalentes</small></span>`).join('')}</div><details><summary>Ver O.S., percentuais e dados de conferência</summary><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / cliente</th><th>Entrega</th><th>Participação nesta O.S.</th><th>Valor da O.S.</th><th>Conferência</th></tr></thead><tbody>${g.registros.map(r=>`<tr><td><button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os?.numero || r.id)}</button><small class="bloco">${esc(r.os?.cliente || '')}</small>${r.os?.retrabalho?'<small class="bloco">Retrabalho marcado</small>':''}</td><td>${fmtDia(diaEntrega(r.os))}</td><td>${r.membros.map(m=>`${esc(m.nome)} · <strong>${perfFormato(m.percentual)}%</strong>`).join('<br>')}</td><td>${r.valor==null?'Sem valor':dinheiroCasa(r.valor)}<small class="bloco">${esc(r.origemValor || 'Base da apuração')}</small></td><td>${r.confirmado?'Confirmada':'Divisão sugerida'}${r.por?`<small class="bloco">${esc(r.por)} · ${fmtDia(r.em)}</small>`:''}${r.obs?`<small class="bloco">${esc(r.obs)}</small>`:''}</td></tr>`).join('')}</tbody></table></div></details></article>`).join('');
  return `<section class="perf-report"><header class="perf-report-heading"><div><span class="perf-report-eyebrow">PRODUÇÃO · PESSOAS · EQUIPES</span><h3>Relatório de performance</h3><p>${fmtDia(f.de)} a ${fmtDia(f.ate)} · ${resumo.pessoas.length} participantes · ${grupos.length} ${grupos.length===1?'equipe / composição utilizada':'equipes / composições utilizadas'}</p></div><span class="perf-report-state">${perfFonteAtual()?.fechadoEm?'Fechamento preservado':'Apuração em acompanhamento'}</span></header><div class="perf-summary"><div><b>${regs.length}</b><span>entregas no período</span></div><div><b>${cobertura}%</b><span>com participação confirmada (${confirmados.length})</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div><div class="perf-report-value"><span>Valor das entregas com participação confirmada</span><strong>${valorTexto(valor,confirmados.length-semValor,confirmados.length)}</strong><small>${semValor} entrega(s) confirmada(s) sem valor. Valores por pessoa são rateados; não representam pagamento ou bônus.</small></div><p class="perf-coverage">${!regs.length?'Nenhuma instalação registrada neste período.':confirmados.length<regs.length?`Apuração parcial: ${regs.length-confirmados.length} ${regs.length-confirmados.length===1?'participação':'participações'} a conferir, incluindo ${semEquipe} sem equipe e ${inconsistentes} inconsistentes.`:'Participações conferidas. Quantidade de entregas não mede sozinha qualidade, esforço ou complexidade.'}</p><section class="perf-report-section"><h3>Equipes e composição real do período</h3><p class="metricas-nota">Participantes das entregas, incluindo avulsos. Os percentuais variam por O.S.; o cadastro atual da equipe não reescreve o histórico.</p>${equipes || '<p>Nenhuma equipe com participação válida registrada no período.</p>'}</section>${tabela('Participação por pessoa',resumo.pessoas)}${tabela('Resumo das equipes',resumo.equipes,true)}<details class="perf-report-section perf-report-pendencias"><summary>Entregas que ainda não permitem apuração por pessoa</summary><p>${semEquipe} sem equipe · ${inconsistentes} com percentuais inconsistentes.</p><ul>${regs.filter(r=>PERF.validar(r.membros)).map(r=>`<li>O.S. <button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button> · ${esc(r.os.cliente)} · ${r.membros.length?'rever percentuais':'informar participantes'}</li>`).join('') || '<li>Nenhuma pendência de composição.</li>'}</ul></details><p class="metricas-nota">Entregas inclui participações sugeridas e confirmadas. A mesma O.S. pode aparecer para mais de uma pessoa; não some a coluna entre colaboradores. Valores incluem somente participações confirmadas, sem duplicar o valor entre pessoas. Não representam lucro, recebimento ou bônus. Retrabalho indica a marca registrada, não uma avaliação automática do colaborador. ${esc(perfFonteTexto())}</p></section>`;
}
