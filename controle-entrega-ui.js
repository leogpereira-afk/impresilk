/* Gestão da evidência: ações assinadas pelo servidor, sem edição otimista. */
const CONTROLE_CLASSIFICACOES = {total:'Entrega total',parcial:'Entrega parcial',retirada:'Retirada',baixa_administrativa:'Baixa administrativa',divergencia:'Divergência a resolver'};
const controleGestao = () => ['admin','pcp'].includes(STATE.user?.papel);
const controlePendente = id => STORE.getQueue().some(x=>x.os?.id===id || x.id===id);
/* O ITEM SEM VALOR NUMA O.S. COM ENTREGA CONFERIDA (baixa da verificação da
   v172): quem não é gestão pode pôr item novo, mas não o valor dele (M19), e
   um item sem valor deixa o rateio sem base: o valor de TODAS as entregas
   conferidas da O.S. fica "a conferir" e a comissão delas espera. A gravação
   vale (nunca 422); a gestão vê a pendência na ficha (Conferência e
   acompanhamento) e na Fila diária, e põe o valor do item. Com um item só, o
   rateio não precisa do valor dele (CONFERENCIA_ENTREGA.apurar). */
/* A posição de cada item sem valor em os.itens (a ficha abre no campo dele). */
function indicesSemValorConferida(os) {
  if (!os || !Array.isArray(os.conferenciasEntrega) || !os.conferenciasEntrega.length) return [];
  const itens = Array.isArray(os.itens) ? os.itens : [];
  if (itens.filter(it => it && typeof it === 'object').length < 2) return [];
  const numero = v => v == null || v === '' ? NaN : Number(typeof v === 'string' && v.includes(',') ? v.replace(/\./g,'').replace(',','.') : v);
  const out = [];
  itens.forEach((it, i) => { if (it && typeof it === 'object') { const v = numero(it.subtotal); if (!(Number.isFinite(v) && v >= 0)) out.push(i); } });
  return out;
}
function itensSemValorConferida(os) {
  return indicesSemValorConferida(os).map(i => String(os.itens[i].descricao || os.itens[i].item || 'item sem descrição'));
}
function pendenciaValorItemHTML(os) {
  const xs = itensSemValorConferida(os);
  if (!xs.length) return '';
  return `<p class="aloc-aviso conf-item-sem-valor" role="note"><strong>Pendência de valor:</strong> ${xs.length === 1 ? 'o item' : 'os itens'} ${esc(xs.join(', '))} ${xs.length === 1 ? 'está' : 'estão'} sem valor, e o valor das entregas conferidas desta O.S. ficou a conferir (a comissão delas espera). Ponha o valor ${xs.length === 1 ? 'do item' : 'dos itens'} na ficha.</p>`;
}
/* A PENDÊNCIA À VISTA (revisão da onda acabamento B, 12/10/2026): ela morava
   dentro do grupo "Conferência e acompanhamento", fechado, no fim da ficha e
   em cada O.S. da Fila diária, e ninguém a via sem abrir. Agora o topo da
   ficha a anuncia com o botão que leva ao campo do valor, o grupo abre
   sozinho e diz no título que há pendência, e a Fila diária tem o botão para
   abrir a ficha nesse ponto. Só para a gestão, que é quem põe o valor. */
function pendenciaValorItemTopoHTML(os) {
  if (!controleGestao()) return '';
  const n = itensSemValorConferida(os).length;
  if (!n) return '';
  const fin = os.finalizadaEm ? ' A O.S. está finalizada: reabra para pôr o valor.' : '';
  return `<div class="aloc-aviso conf-item-sem-valor conf-item-sem-valor-topo lock-allow" role="note"><strong>Pendência de valor:</strong> ${n === 1 ? '1 item está' : n + ' itens estão'} sem valor, e as entregas conferidas desta O.S. ficaram com o valor a conferir (a comissão delas espera).${fin} <button type="button" class="btn-ghost btn-sm" data-controle="valorItem" data-controle-os="${esc(os.id)}">Pôr o valor ${n === 1 ? 'do item' : 'dos itens'}</button></div>`;
}
/* Abre a ficha (ou usa a que já está aberta nesta O.S., sem perder o que foi
   digitado) na etapa dos itens, com o campo do valor do primeiro item sem
   valor à vista. */
function abrirFichaNoValorItem(osId) {
  const aberta = typeof _modalDraft !== 'undefined' && _modalDraft && STATE.modalOSId === osId;
  const os = aberta ? _modalDraft : (STORE.getOS(osId) || (STORE.historico?.() || []).find(o => o.id === osId));
  if (!os) { toast('O.S não encontrada.', 'error'); return false; }
  if (aberta) { if (typeof irParaEtapaFicha === 'function') irParaEtapaFicha((typeof ETAPA_DO_BLOCO !== 'undefined' && ETAPA_DO_BLOCO.itens) || 'dados', {bloco: 'itens'}); }
  else if (typeof openModal === 'function') openModal(os, 'itens');
  else return false;
  const i = indicesSemValorConferida(os)[0];
  setTimeout(() => {
    const m = document.getElementById('modal-os');
    const alvo = m && (m.querySelector(`[data-valor-item="${i}"]`) || m.querySelector(`[data-item-row="${i}"]`) || m.querySelector('[data-bloco="itens"]'));
    if (!alvo) return;
    try { alvo.scrollIntoView({block: 'center'}); } catch {}
    if (typeof alvo.focus === 'function') try { alvo.focus({preventScroll: true}); } catch {}
  }, 60);
  return true;
}
function controleEntregaHTML(os) {
  const botao=(tipo,texto)=>`<button type="button" class="btn-ghost btn-sm" data-controle="${tipo}" data-controle-os="${esc(os.id)}">${texto}</button>`;
  const gestao=controleGestao(), erp=os.conferenciaERP, saida=os.regularizacaoSaida;
  const pendValor=gestao?pendenciaValorItemHTML(os):'';
  return `<details class="cfg-grupo lock-allow"${pendValor?' open data-pendencia-valor':''}><summary>Conferência e acompanhamento${pendValor?' · <strong class="conf-pend-titulo">pendência de valor</strong>':''}</summary><p>${esc(resumoEntregaFichaTexto(os) || 'Sem conferência de itens registrada. A ausência de conferência não prova falta de entrega física.')}</p>
    ${erp?`<p>${esc(CONTROLE_CLASSIFICACOES[erp.classificacao] || erp.classificacao)} · ${esc(erp.responsavelNome)} · revisar até ${esc(erp.prazo)}<br>${esc(erp.evidencia)}<br>Motivo: ${esc(erp.motivo)} · ${esc(erp.por)} · ${esc(erp.em)}</p>`:''}
    ${saida?`<p>Saída ${saida.situacao==='regularizada'?'regularizada':'em conferência'} · ${esc(saida.responsavelNome)} · prazo ${esc(saida.prazo)}<br>${esc(saida.evidencia)}<br>Motivo: ${esc(saida.motivo)} · ${esc(saida.por)} · ${esc(saida.em)}</p>`:''}
    ${(os.revisaoSolicitada || []).map(r=>`<p>Revisão solicitada: ${esc(r.motivo)} · ${esc(r.por)} · ${esc(r.em)}</p>`).join('')}
    ${pendValor}
    ${gestao&&typeof confRevisoesHTML==='function'?confRevisoesHTML(os):''}
    ${gestao?`<button type="button" class="btn-ghost btn-sm" data-controle="itens" data-controle-secao="acompanhamento" data-controle-os="${esc(os.id)}">Conferir itens e equipe</button>${os.baixaAutoERP || os.erpComSaldo || os.erpSaiuDaCarteiraEm || os.conferenciaERP?botao('erp','Classificar baixa ERP'):''}${os.saidaEm || os.horaSaida?botao('saida','Regularizar saída antiga'):''}`:botao('solicitarRevisao','Solicitar revisão à gestão')}
    ${botao('fotos','Horários das fotos')}
    <p>Hora da foto, anexo e recebimento são registros separados. Nenhum deles preenche automaticamente saída ou retorno.</p></details>`;
}
function controleConferidasHTML(todas,f) {
  const base=todas.filter(o=>o.conferenciasEntrega?.some(e=>OPERACAO.emIntervalo(e.dia,f.de,f.ate)));
  if(!base.length)return '';
  const grupos={todas:base,parcial:[],saldo_concluido:[],inconsistente:[]};
  for(const o of base){const estado=CONFERENCIA_ENTREGA.estado(o);if(grupos[estado.situacao])grupos[estado.situacao].push(o);}
  const foco=Object.hasOwn(grupos,STATE._entConferencia || '')?STATE._entConferencia:'todas';
  const nomes={todas:'📋 Todas',parcial:'🟠 Parciais',saldo_concluido:'✅ Saldo conferido',inconsistente:'🔎 Revisar itens'};
  return `<section class="ent-conferidas" aria-label="Conferência por itens"><h3>Entregas conferidas por item</h3><p>O.S. com conferência no período · saldo atual de cada ficha. Saldo a conferir não prova falta de entrega física. As baixas financeiras do ERP têm sua própria data.</p>
    <nav class="ent-chips" aria-label="Situação da conferência">${Object.entries(nomes).map(([k,n])=>`<button type="button" class="ent-chip" data-ent-conferencia="${k}" aria-pressed="${foco===k}">${n}<b>${grupos[k].length}</b></button>`).join('')}</nav>
    <div class="ent-conferidas-grid">${grupos[foco].map(o=>`<article><strong>O.S. ${esc(o.numero)} · ${esc(o.cliente)}</strong><p>${esc(resumoEntregaFichaTexto(o))}</p><button type="button" class="btn-ghost btn-sm" data-controle="itens" data-controle-os="${esc(o.id)}">Itens, equipes e saldo →</button></article>`).join('') || '<p>Nenhuma conferência nesta situação e período.</p>'}</div></section>`;
}
async function controleSalvar(body,d) {
  const status=d.querySelector('[role="status"]'),botao=d.querySelector('[type="submit"]');
  if(controlePendente(body.osId || body.id)){status.textContent='Sincronize as alterações da O.S. antes desta conferência.';return;}
  botao.disabled=true;
  try {
    const r=await STORE.api(body);if(!r?.ok)throw new Error(r?.error || 'A operação não foi confirmada.');
    await STORE.pull();
    if(typeof _modalDraft!=='undefined' && _modalDraft?.id===(body.osId || body.id)) {
      if(body.action==='delete') { _modalDirty=false; closeModal(); }
      else if(!_modalDirty) {_modalDraft=JSON.parse(JSON.stringify(r.os || STORE.getOS(_modalDraft.id)));reRenderModalKeepOpen();}
    }
    d.close();renderActiveTab();if(typeof perfDepoisDeGravar==='function')perfDepoisDeGravar({estado:'gravada'});toast('Registro confirmado pelo servidor.','success');return r;
  } catch(e) {status.textContent=perfErroTxt(e);throw e;}
  finally {botao.disabled=false;}
}
async function controleEditar(osId,tipo) {
  if(tipo==='itens')return conferirItensEntrega(osId);
  if(tipo==='fotos')return controleFotos(osId);
  const os=STORE.getOS(osId) || (STORE.historico?.() || []).find(o=>o.id===osId);if(!os)throw new Error('Atualize a O.S. antes de conferir.');
  const simples=tipo==='solicitarRevisao',campo=tipo==='erp'?'conferenciaERP':'regularizacaoSaida',ant=os[campo] || {};
  const pessoas=(OPERACAO.dadosPessoas().pessoas || []).filter(p=>p.id && !p.idRepetido && !p.desligado && p.ativo!==false && !OPERACAO.idRepetido(p.id));
  const d=perfDialog(simples?'Solicitar revisão à gestão':tipo==='erp'?'Classificar baixa do ERP':'Regularizar saída antiga',`<p>O.S. ${esc(os.numero)} · ${esc(os.cliente)}</p><p>${tipo==='erp'?'Classificar não altera itens, data física ou comissão. Entrega total e parcial exigem conferência dos itens.':tipo==='saida'?'A última saída registrada será preservada. Regularizar retira a pendência de equipe na rua sem inventar um retorno ou duração.':'O pedido mantém o registro e será visível para a gestão na ficha.'}</p><form>
    ${simples?'':`<label>Responsável <select name="responsavelId" required><option value="">Selecione cadastro confirmado</option>${pessoas.map(p=>`<option value="${esc(p.id)}" ${ant.responsavelId===p.id?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></label>
    <label>Prazo de revisão <input name="prazo" type="date" required value="${esc(ant.prazo || '')}"></label>
    ${tipo==='erp'?`<label>Classificação <select name="classificacao" required><option value="">Selecione</option>${Object.entries(CONTROLE_CLASSIFICACOES).map(([v,t])=>`<option value="${v}" ${ant.classificacao===v?'selected':''}>${t}</option>`).join('')}</select></label>`:`<label>Situação <select name="situacao"><option value="em_conferencia">Em conferência</option><option value="regularizada">Regularizada com base na última informação</option></select></label>`}
    <label>${tipo==='erp'?'Evidência (referência, documento ou confirmação)':'Última informação confirmada'} <textarea name="evidencia" minlength="5" maxlength="1000" required>${esc(ant.evidencia || '')}</textarea></label>`}
    <label>Motivo <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p role="status" aria-live="polite"></p><button type="submit" class="btn-primary">${simples?'Registrar solicitação':'Salvar conferência'}</button></form>`);
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();await controleSalvar({action:'controleEntrega',osId,rev:os.rev,tipo,pedido:Object.fromEntries(new FormData(e.target))},d).catch(()=>{});};
}
async function controleExcluirOS(os) {
  const d=perfDialog('Excluir O.S. '+(os.numero || ''),'<p>A exclusão é lógica. O registro e suas fotos serão preservados para recuperação pela gestão.</p><form><label>Motivo da exclusão <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p role="status"></p><button class="btn-danger" type="submit">Confirmar exclusão</button></form>');
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();await controleSalvar({action:'delete',id:os.id,rev:os.rev,motivo:new FormData(e.target).get('motivo')},d).catch(()=>{});};
}
async function controleRecuperar() {
  const lista=[];let after='';
  do {const r=await STORE.api({action:'excluidasOS',after});lista.push(...(r.os || []));after=r.after;}while(after);
  const d=perfDialog('Recuperar registros excluídos',`<p>Os arquivos e referências originais são preservados. Recuperação exige motivo.</p><form><label>O.S. <select name="id" required><option value="">Selecione</option>${lista.map(o=>`<option value="${esc(o.id)}">${esc(o.numero)} · ${esc(o.cliente)} · ${esc(o.cicloRegistro?.at(-1)?.motivo || 'Exclusão anterior')}</option>`).join('')}</select></label><label>Motivo da recuperação <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p role="status">${lista.length?'':'Nenhum registro excluído encontrado.'}</p><button type="submit" class="btn-primary" ${lista.length?'':'disabled'}>Recuperar registro</button></form>`);
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),os=lista.find(o=>o.id===f.get('id'));await controleSalvar({action:'restaurarOS',id:os.id,rev:os.rev,motivo:f.get('motivo')},d).catch(()=>{});};
}
async function controleFotos(osId) {
  const r=await STORE.api({action:'fotosEvento',osId}), fotos=r.fotos || [];
  const fmt=v=>v?new Date(v).toLocaleString('pt-BR'):'Não informado';
  const d=perfDialog('Horários das fotos',`<p>Em envio posterior, confirme a hora real da captura. Esse registro não altera saída, retorno nem cria punição.</p>${fotos.map((f,i)=>`<article><h3>Foto ${i+1}</h3><p>Anexada no aparelho: ${esc(fmt(f.anexadoEm))}<br>Recebida no servidor: ${esc(fmt(f.recebidoEm))}<br>Capturada / fato declarado: ${esc(fmt(f.ocorridoEm))}${f.confirmacao?`<br>Confirmado por ${esc(f.confirmacao.por)} · ${esc(fmt(f.confirmacao.em))}`:''}</p><form data-foto-evento="${i}"><label>Data e hora real da captura <input type="datetime-local" name="ocorridoEm" required></label><label>Motivo da confirmação ou correção <input name="motivo" minlength="5" maxlength="500" required></label><p role="status"></p><button type="submit" class="btn-primary">Confirmar horário desta foto</button></form></article>`).join('') || '<p>Nenhuma foto vinculada nesta ficha. Sincronize os anexos pendentes.</p>'}`);
  d.querySelectorAll('form').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const f=fotos[+form.dataset.fotoEvento],v=new FormData(form),b=form.querySelector('button');b.disabled=true;try{await STORE.api({action:'fotosEvento',osId,fileId:f.id,rev:f.rev || 0,ocorridoEm:new Date(v.get('ocorridoEm')).toISOString(),motivo:v.get('motivo')});form.querySelector('[role="status"]').textContent='Horário confirmado. Feche e abra novamente para ver a revisão.';b.disabled=true;}catch(err){form.querySelector('[role="status"]').textContent=perfErroTxt(err);b.disabled=false;}});
}
/* A FILA DIÁRIA (M15 da auditoria de 11/10/2026, onda operação). Antes ela
   pegava toda baixa automática (as de antes do corte de 15/09, que já contam
   como entregues, as retiradas e as já classificadas: 453 cartões para cerca
   de 85 pendências), sem sair da fila nem ordenar. Agora ela é montada pela
   MESMA régua de Entregas ("a lançar", classificarEntregas), mais: o ERP que
   fechou a O.S. aberta e ainda espera a decisão da gestão, o saldo a
   conferir da O.S. encerrada com conferência parcial (M14, D-016), as saídas
   sem retorno e os pedidos de revisão ainda sem resposta. Sem as internas,
   as canceladas e as já classificadas (a "Divergência a resolver" continua),
   ordenada por DIAS PARADOS (o mais antigo primeiro). Função pura sobre a
   cópia do aparelho; nada é gravado. A baixa de antes do corte não entra (a
   pergunta 18 da fila, se ela pode ser reclassificada, continua aberta: o
   botão de classificar na ficha não mudou). */
const FILA_MOTIVOS = {aLancar:'Baixa do ERP a lançar', erpFechou:'O ERP fechou a O.S.: a gestão decide', saldoConferir:'Saldo a conferir', semRetorno:'Saída sem retorno', revisao:'Revisão pedida à gestão', valorItem:'Item sem valor: entrega conferida a conferir'};
function filaDiaria(todas, hoje = OPERACAO.dia(new Date())) {
  const lista = (todas || []).filter(o => o && typeof o === 'object');
  const parados = d => d ? Math.max(0, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 864e5)) : 0;
  const fora = o => OPERACAO.interno(o) || (typeof OPERACAO.cancelada === 'function' && OPERACAO.cancelada(o));
  const classificada = o => !!(o.conferenciaERP && o.conferenciaERP.classificacao && o.conferenciaERP.classificacao !== 'divergencia');
  const out = new Map();
  const poe = (o, tipo, desde) => {
    if (fora(o)) return;
    const d = OPERACAO.dia(desde) || '';
    const x = out.get(o.id) || {os:o, motivos:[], desde:''};
    if (!x.motivos.some(m => m.tipo === tipo)) x.motivos.push({tipo, rotulo:FILA_MOTIVOS[tipo], desde:d});
    if (d && (!x.desde || d < x.desde)) x.desde = d;
    out.set(o.id, x);
  };
  const cls = typeof classificarEntregas === 'function' ? classificarEntregas(lista) : {aLancar:[]};
  for (const o of cls.aLancar) if (!classificada(o)) poe(o, 'aLancar', o.finalizadaEm);
  for (const o of lista) {
    if (!o.finalizadaEm && (o.erpSaiuDaCarteiraEm || o.erpComSaldo) && !classificada(o)) {
      const s = typeof erpSaldoNaOS === 'function' ? erpSaldoNaOS(o) : null;
      if (!(s && s.mantida)) poe(o, 'erpFechou', (s && s.aviso && s.aviso.desde) || o.erpSaiuDaCarteiraEm || (o.erpComSaldo && o.erpComSaldo.desde));
    }
    if (o.finalizadaEm && Array.isArray(o.conferenciasEntrega) && o.conferenciasEntrega.length && typeof CONFERENCIA_ENTREGA !== 'undefined') {
      const st = CONFERENCIA_ENTREGA.estado(o).situacao;
      if (st === 'parcial' || st === 'inconsistente') poe(o, 'saldoConferir', o.finalizadaEm);
    }
    if (['sem-retorno', 'conferir'].includes(OPERACAO.situacaoSaida(o, hoje))) poe(o, 'semRetorno', o.saidaEm || (o.instalacao && o.instalacao.data));
    // O item sem valor que deixou a entrega conferida sem valor (baixa da verificação da v172).
    if (itensSemValorConferida(o).length) poe(o, 'valorItem', o.atualizadoEm || o.finalizadaEm);
    const rv = (Array.isArray(o.revisaoSolicitada) ? o.revisaoSolicitada : []).filter(r => r && r.em);
    const ult = rv[rv.length - 1];
    const respondida = !!ult && [o.conferenciaERP && o.conferenciaERP.em, o.regularizacaoSaida && o.regularizacaoSaida.em].some(e => e && String(e) >= String(ult.em));
    if (ult && !respondida) poe(o, 'revisao', ult.em);
  }
  return [...out.values()].map(x => ({...x, diasParados:parados(x.desde)}))
    .sort((a, b) => b.diasParados - a.diasParados || String(a.os.numero || '').localeCompare(String(b.os.numero || ''), 'pt-BR', {numeric:true}));
}
function filaDiariaHTML(fila) {
  const conta = {};
  for (const x of fila) for (const m of x.motivos) conta[m.tipo] = (conta[m.tipo] || 0) + 1;
  const resumo = Object.keys(FILA_MOTIVOS).filter(k => conta[k]).map(k => `${FILA_MOTIVOS[k]}: ${conta[k]}`).join(' · ');
  const dias = n => n === 1 ? '1 dia parada' : `${n} dias parada`;
  return `<p>A mesma régua da faixa "a lançar" de Entregas, mais o ERP que fechou a O.S. aberta, o saldo a conferir, as saídas sem retorno e os pedidos de revisão. Sem internas, canceladas e já classificadas; a mais antiga primeiro. Cada O.S. exige conferência individual. Ausência de evidência não prova ausência de entrega.</p>
    ${fila.length ? `<p class="metricas-nota" data-fila-resumo>${fila.length} O.S. · ${esc(resumo)}</p>` : ''}
    ${fila.map(x => `<article data-fila-os="${esc(x.os.id)}"><h3>O.S. ${esc(x.os.numero)} · ${esc(x.os.cliente)} <small>${esc(dias(x.diasParados))}</small></h3><p>${x.motivos.map(m => esc(m.rotulo)).join(' · ')}</p>${x.motivos.some(m => m.tipo === 'aLancar') ? `<button type="button" class="btn-primary btn-sm" data-controle="lancar" data-controle-os="${esc(x.os.id)}">Lançar entrega</button>` : ''}${x.motivos.some(m => m.tipo === 'valorItem') ? `<button type="button" class="btn-primary btn-sm" data-controle="valorItem" data-controle-os="${esc(x.os.id)}">Abrir a ficha no item sem valor</button>` : ''}${controleEntregaHTML(x.os)}</article>`).join('') || '<p>Nenhuma pendência nesta cópia do aparelho.</p>'}
    <p>Fonte: cópia local e histórico carregado. Consulte o período completo em Entregas para conferir a cobertura.</p>`;
}
function controleFila() {
  const todas=typeof osDaConferencia==='function'?osDaConferencia():STORE.getAllOS();
  return perfDialog('Fila diária de conferência',filaDiariaHTML(filaDiaria(todas)));
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-controle]');if(!b)return;
  e.preventDefault(); const tipo=b.dataset.controle;
  // Lançar a partir da Fila diária (M15): fecha a fila e abre o Lançar de Entregas (a mesma porta, com a régua da conferência, M14).
  // O item sem valor (revisão da onda acabamento B): fecha a fila, se veio dela, e abre a ficha no campo do valor.
  if(tipo==='valorItem'){b.closest?.('dialog')?.close?.();abrirFichaNoValorItem(b.dataset.controleOs);return;}
  if(tipo==='lancar'){b.closest?.('dialog')?.close?.();if(typeof lancarEntregaManual==='function')lancarEntregaManual(b.dataset.controleOs);return;}
  Promise.resolve().then(()=>tipo==='recuperar'?controleRecuperar():tipo==='fila'?controleFila():controleEditar(b.dataset.controleOs,tipo)).catch(err=>toast(perfErroTxt(err),'error'));
});
