/* Gestão da evidência: ações assinadas pelo servidor, sem edição otimista. */
const CONTROLE_CLASSIFICACOES = {total:'Entrega total',parcial:'Entrega parcial',retirada:'Retirada',baixa_administrativa:'Baixa administrativa',divergencia:'Divergência a resolver'};
const controleGestao = () => ['admin','pcp'].includes(STATE.user?.papel);
const controlePendente = id => STORE.getQueue().some(x=>x.os?.id===id || x.id===id);
function controleEntregaHTML(os) {
  const botao=(tipo,texto)=>`<button type="button" class="btn-ghost btn-sm" data-controle="${tipo}" data-controle-os="${esc(os.id)}">${texto}</button>`;
  const gestao=controleGestao(), erp=os.conferenciaERP, saida=os.regularizacaoSaida;
  return `<details class="cfg-grupo lock-allow"><summary>Conferência e acompanhamento</summary><p>${esc(resumoEntregaFichaTexto(os) || 'Sem conferência de itens registrada. A ausência de conferência não prova falta de entrega física.')}</p>
    ${erp?`<p>${esc(CONTROLE_CLASSIFICACOES[erp.classificacao] || erp.classificacao)} · ${esc(erp.responsavelNome)} · revisar até ${esc(erp.prazo)}<br>${esc(erp.evidencia)}<br>Motivo: ${esc(erp.motivo)} · ${esc(erp.por)} · ${esc(erp.em)}</p>`:''}
    ${saida?`<p>Saída ${saida.situacao==='regularizada'?'regularizada':'em conferência'} · ${esc(saida.responsavelNome)} · prazo ${esc(saida.prazo)}<br>${esc(saida.evidencia)}<br>Motivo: ${esc(saida.motivo)} · ${esc(saida.por)} · ${esc(saida.em)}</p>`:''}
    ${(os.revisaoSolicitada || []).map(r=>`<p>Revisão solicitada: ${esc(r.motivo)} · ${esc(r.por)} · ${esc(r.em)}</p>`).join('')}
    ${gestao?`<button type="button" class="btn-ghost btn-sm" data-controle="itens" data-controle-os="${esc(os.id)}">Conferir itens e equipe</button>${os.baixaAutoERP || os.erpComSaldo || os.erpSaiuDaCarteiraEm || os.conferenciaERP?botao('erp','Classificar baixa ERP'):''}${os.saidaEm || os.horaSaida?botao('saida','Regularizar saída antiga'):''}`:botao('solicitarRevisao','Solicitar revisão à gestão')}
    ${botao('fotos','Horários das fotos')}
    <p>Hora da foto, anexo e recebimento são registros separados. Nenhum deles preenche automaticamente saída ou retorno.</p></details>`;
}
function controleConferidasHTML(todas,f) {
  const lista=todas.filter(o=>o.conferenciasEntrega?.some(e=>OPERACAO.emIntervalo(e.dia,f.de,f.ate)));
  if(!lista.length)return '';
  return `<section aria-label="Conferência por itens"><h3>Entregas conferidas por item</h3><p>Saldo a conferir não prova falta de entrega física. As baixas financeiras do ERP têm sua própria data.</p>${lista.map(o=>`<article><strong>O.S. ${esc(o.numero)} · ${esc(o.cliente)}</strong><p>${esc(resumoEntregaFichaTexto(o))}</p><button type="button" class="btn-ghost btn-sm" data-controle="itens" data-controle-os="${esc(o.id)}">Itens, equipes e saldo</button></article>`).join('')}</section>`;
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
function controleFila() {
  const todas=typeof osDaConferencia==='function'?osDaConferencia():STORE.getAllOS(), pend=todas.filter(o=>o.baixaAutoERP || o.erpComSaldo || o.erpSaiuDaCarteiraEm || o.conferenciaERP || ['sem-retorno','conferir'].includes(OPERACAO.situacaoSaida(o)) || o.revisaoSolicitada?.length);
  const d=perfDialog('Fila diária de conferência',`<p>Valores de baixas pendentes não representam receita perdida. Cada O.S. exige conferência individual. Ausência de evidência não prova ausência de entrega.</p>${pend.map(o=>`<article><h3>O.S. ${esc(o.numero)} · ${esc(o.cliente)}</h3>${controleEntregaHTML(o)}</article>`).join('') || '<p>Nenhuma pendência nesta cópia do aparelho.</p>'}<p>Fonte: cópia local e histórico carregado. Consulte o período completo em Entregas para conferir cobertura.</p>`);return d;
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-controle]');if(!b)return;
  e.preventDefault(); const tipo=b.dataset.controle;
  Promise.resolve().then(()=>tipo==='recuperar'?controleRecuperar():tipo==='fila'?controleFila():controleEditar(b.dataset.controleOs,tipo)).catch(err=>toast(perfErroTxt(err),'error'));
});
