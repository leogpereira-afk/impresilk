/* A conferência por item é on-line: data, equipe e saldo são verificados
   juntos no servidor. A fila antiga de O.S. não sobrescreve esse registro. */
async function conferirItensEntrega(osId, entregaId = '') {
  if (!perfPodeEditar()) return;
  const pendente = () => STORE.getQueue().some(x => x.action === 'setCfg' || x.os?.id === osId || x.id === osId);
  if (pendente()) { toast('Sincronize as alterações pendentes antes de conferir os itens.', 'error'); return; }
  const resposta = await STORE.api({action:'conferenciaEntrega', osId});
  if (!resposta?.os) throw new Error(resposta?.error || 'Não foi possível carregar os itens desta O.S.');
  const os = resposta.os, registros = os.conferenciasEntrega || [], anterior = registros.find(e => e.id === entregaId);
  if (entregaId && !anterior) throw new Error('Esta entrega mudou. Atualize a apuração.');
  const outros = registros.filter(e => e.id !== entregaId), catalogo = CONFERENCIA_ENTREGA.catalogo(os);
  const id = anterior?.id || 'ent-' + crypto.randomUUID(), chave = 'itens:' + id;
  let dia = anterior?.dia || diaEntrega(os) || ENTREGA_ITEM.diaSP(new Date().toISOString()), enviando = false;
  const escolhidos = new Map((anterior?.itens || []).map(i => [i.chave,i.qtde]));
  const usados = new Map(); outros.forEach(e => e.itens.forEach(i => usados.set(i.chave,(usados.get(i.chave)||0)+i.qtde)));
  // Na primeira conferência, conservar quem já estava indicado na O.S.,
  // mas exigir a escolha dos itens. Uma nova entrega não herda a equipe.
  const primeira = !anterior && !registros.length;
  const virtual = {...os, alocacao:anterior?.alocacao || (primeira ? os.alocacao : null), equipe:anterior ? DIVISAO.derivarEquipe(anterior.alocacao) : primeira ? os.equipe || [] : []};
  ALOCUI.iniciar(chave, {os:virtual,equipes:perfConfig().equipes,papel:STATE.user.papel,valor:null,rotuloValor:'Valor dos itens desta entrega',dataEntrega:dia,versoes:perfRegrasFonte().versoes,semAntigo:true,reiniciar:true});
  const d = perfDialog('Itens e equipe · O.S. ' + (os.numero || ''), `<p class="aloc-os">${esc(os.cliente || '')}</p>
    <p class="metricas-nota">Selecione somente o que esta equipe entregou nesta data. Os itens restantes poderão ser conferidos em outra entrega, com outra equipe.</p>
    ${registros.length?`<nav class="conf-entregas" aria-label="Entregas desta O.S.">${registros.map((e,n)=>`<button type="button" class="btn-ghost btn-sm" data-conf-abrir="${esc(e.id)}" ${e.id===entregaId?'disabled':''}>Entrega ${n+1} · ${esc(e.dia.split('-').reverse().join('/'))}</button>`).join('')}<button type="button" class="btn-ghost btn-sm" data-conf-abrir="" ${!entregaId?'disabled':''}>+ Nova entrega</button></nav>`:''}
    ${!registros.length && os.alocacao?'<p class="aloc-aviso">Esta primeira conferência por item substituirá a divisão da O.S. inteira na apuração aberta. Confira depois os itens restantes. Os fechamentos já salvos permanecem preservados.</p>':''}
    <label class="conf-data">Data desta entrega <input id="conf-data" type="date" value="${esc(dia)}" max="${ENTREGA_ITEM.diaSP(new Date().toISOString())}"></label>
    <section class="conf-itens" aria-label="Itens desta entrega"><div class="conf-itens-topo"><h4>O que foi entregue?</h4><button type="button" class="btn-ghost btn-sm" id="conf-todos">Selecionar saldo disponível</button></div>
      ${catalogo.map((it,n)=>{const saldo=it.qtde-(usados.get(it.chave)||0), trava=saldo<=0||it.ambiguo||it.cancelado;return `<div class="conf-item"><label><input type="checkbox" data-conf-item="${n}" ${escolhidos.has(it.chave)?'checked':''} ${trava?'disabled':''}><span><strong>${esc(it.descricao)}</strong><small>${it.ambiguo?'Itens iguais sem identificação: confira a ficha.':it.cancelado?'Item cancelado':`${saldo} de ${it.qtde} disponível(is) · ${it.qtde>1?'unidades':'item completo'}`}</small></span></label><label class="conf-qtde">Quantidade <input type="number" inputmode="numeric" min="1" max="${saldo}" step="1" data-conf-qtde="${n}" value="${escolhidos.get(it.chave)||saldo||1}" ${trava||!escolhidos.has(it.chave)?'disabled':''}></label></div>`;}).join('') || '<p>Nenhum item cadastrado. Complete a ficha da O.S. para conferir a entrega.</p>'}
      <p id="conf-resumo" class="conf-resumo" aria-live="polite"></p></section>
    <h4>Quem entregou estes itens?</h4>
    <section class="conf-parte" aria-label="Parte entregue por esta equipe"><div class="conf-parte-topo"><strong id="conf-parte-titulo">Selecione os itens entregues</strong><button type="button" class="btn-ghost btn-sm" id="conf-editar-itens">Editar itens e quantidades</button></div><p id="conf-parte-itens"></p><p id="conf-parte-valor" aria-live="polite"></p><small>100% aqui significa a participação nos itens selecionados, não na O.S. inteira.</small></section>
    <div id="conf-aloc"></div>
    <p class="aloc-status" id="conf-status" role="status" aria-live="polite"></p><div class="aloc-acoes"><button type="button" class="btn-primary" id="conf-salvar">${anterior?'Salvar alterações da entrega':'Confirmar esta entrega'}</button><button type="button" class="btn-ghost" id="conf-cancelar">Cancelar</button></div>`);
  const box=d.querySelector('#conf-aloc'), status=d.querySelector('#conf-status'), salvar=d.querySelector('#conf-salvar');
  const minhaTela=()=>d.open && d.querySelector('#conf-aloc')===box;
  const selecao=()=>catalogo.filter(i=>escolhidos.has(i.chave)).map(i=>({chave:i.chave,identidade:i.identidade,qtde:escolhidos.get(i.chave)}));
  const conferir=()=>{
    if(enviando) return;
    const entrega={id,dia,itens:selecao()}, erro=CONFERENCIA_ENTREGA.validar(os,[...outros,entrega],ENTREGA_ITEM.diaSP(new Date().toISOString()));
    const ap=erro?null:CONFERENCIA_ENTREGA.apurar(os,resposta.valor,[...outros,entrega]), valor=ap?.entregas.find(e=>e.id===id)?.valor;
    const st=ALOCUI.estado(chave); st.valor=valor==null?null:valor;
    const motivo=erro || ALOCUI.bloqueio(chave);
    salvar.disabled=!!motivo; status.textContent=motivo || ''; status.classList.toggle('erro',!!motivo);
    d.querySelector('#conf-resumo').textContent=erro || `${entrega.itens.length} item(ns) selecionado(s) · ${valor==null?'Valor a conferir: faltam valores dos itens.':dinheiroCasa(valor/100)} · ${ap.saldoItens.length} item(ns) com saldo para outra entrega.`;
    d.querySelector('#conf-parte-titulo').textContent=erro?'Confira os itens entregues':ap.saldoItens.length?'Entrega parcial':'Saldo de itens concluído';
    d.querySelector('#conf-parte-itens').textContent=catalogo.filter(it=>escolhidos.has(it.chave)).map(it=>`${it.descricao} · ${escolhidos.get(it.chave)} de ${it.qtde}`).join(' · ') || 'Nenhum item selecionado.';
    d.querySelector('#conf-parte-valor').textContent=erro || `Esta entrega: ${valor==null?'valor a conferir':dinheiroCasa(valor/100)} · Saldo a conferir: ${ap.saldo==null?'valor a conferir':dinheiroCasa(ap.saldo/100)}`;
  };
  const atualizar=()=>{conferir();ALOCUI.repintar(chave);};
  ALOCUI.montar(box,chave,{aoMudar:conferir});
  d.querySelector('#conf-editar-itens').onclick=()=>{
    const primeiro=d.querySelector('[data-conf-item]:checked:not(:disabled)') || d.querySelector('[data-conf-item]:not(:disabled)');
    d.querySelector('.conf-itens').scrollIntoView({behavior:'smooth',block:'start'});
    primeiro?.focus({preventScroll:true});
  };
  d.querySelector('#conf-data').onchange=e=>{dia=e.target.value;ALOCUI.definirDataEntrega(chave,dia);atualizar();};
  d.querySelectorAll('[data-conf-item]').forEach(el=>el.onchange=()=>{const n=+el.dataset.confItem,it=catalogo[n],q=d.querySelector(`[data-conf-qtde="${n}"]`);q.disabled=!el.checked;if(el.checked)escolhidos.set(it.chave,Number(q.value));else escolhidos.delete(it.chave);atualizar();});
  d.querySelectorAll('[data-conf-qtde]').forEach(el=>el.oninput=()=>{escolhidos.set(catalogo[+el.dataset.confQtde].chave,Number(el.value));atualizar();});
  d.querySelector('#conf-todos').onclick=()=>{d.querySelectorAll('[data-conf-item]').forEach(el=>{if(el.disabled)return;const n=+el.dataset.confItem,it=catalogo[n],q=d.querySelector(`[data-conf-qtde="${n}"]`);el.checked=true;q.disabled=false;q.value=it.qtde-(usados.get(it.chave)||0);escolhidos.set(it.chave,Number(q.value));});atualizar();};
  d.querySelectorAll('[data-conf-abrir]').forEach(el=>el.onclick=()=>{d.close();void conferirItensEntrega(osId,el.dataset.confAbrir).catch(e=>toast(perfErroTxt(e),'error'));});
  d.querySelector('#conf-cancelar').onclick=()=>d.close();
  // O dialog é reutilizado. Um close enfileirado da tela anterior não pode
  // apagar a divisão da tela que acabou de abrir no mesmo elemento.
  const aoFechar=()=>{if(minhaTela())return;ALOCUI.esquecer(chave);d.removeEventListener('close',aoFechar);};
  d.addEventListener('close',aoFechar);
  salvar.onclick=async()=>{
    if(enviando || salvar.disabled)return;
    if(pendente()){status.textContent='Sincronize as alterações pendentes antes de conferir.';return;}
    const r=ALOCUI.paraGravar(chave);if(r.erro){status.textContent=r.erro;return;}
    enviando=true;salvar.disabled=true;status.textContent='Conferindo e salvando a entrega…';
    try {
      const resposta=await STORE.api({action:'conferenciaEntrega',osId,rev:os.rev,entrega:{id,dia,itens:selecao(),alocacao:{...r.alocacao,...(anterior?.alocacao?.em?{em:anterior.alocacao.em}:{})}}});
      if(!resposta?.ok) throw new Error(resposta?.error || 'Não foi possível confirmar a entrega.');
      if(minhaTela())d.close();
      // Pull respeita a fila local; não substitui uma edição feita durante a requisição.
      if(typeof STORE.pull==='function') await STORE.pull().catch(()=>{});
      conferenciaRefletirNaFicha(resposta.os);
      toast(anterior?'Entrega atualizada com os itens e a equipe selecionados.':'Entrega confirmada com os itens e a equipe selecionados.','success');
      perfDepoisDeGravar({estado:'gravada'});
    } catch(e) {if(minhaTela()){status.textContent=perfErroTxt(e);status.classList.add('erro');salvar.disabled=false;}else toast(perfErroTxt(e),'error');}
    finally {enviando=false;}
  };
  atualizar();
}

// A ficha pode continuar aberta por baixo do diálogo. Pull atualiza o store,
// mas o rascunho da ficha é uma cópia: só repintar a aba deixava o saldo antigo.
function conferenciaRefletirNaFicha(confirmada) {
  if(!confirmada || typeof _modalDraft==='undefined' || _modalDraft?.id!==confirmada.id)return;
  const atual=STORE.getOS(confirmada.id),base=atual && Number(atual.rev)>=Number(confirmada.rev)?atual:confirmada;
  if(Number(_modalDraft.rev)>Number(base.rev))return;
  const modal=typeof document!=='undefined'?document.querySelector('#modal-os'):null;
  const anterior=modal?.querySelector('[data-controle="itens"]'),aberto=anterior?.closest('details')?.open;
  _modalDraft.conferenciasEntrega=JSON.parse(JSON.stringify(base.conferenciasEntrega || []));
  const pendente=STORE.getQueue().some(x=>x.os?.id===base.id || x.id===base.id);
  if(!pendente && !_modalDirty) _modalDraft=JSON.parse(JSON.stringify(base));
  // Com edição local em andamento, não rebasa silenciosamente a revisão nem
  // substitui campos operacionais: o controle de concorrência continua valendo.
  reRenderModalKeepOpen();
  const novo=modal?.querySelector('[data-controle="itens"]');
  if(aberto && novo?.closest('details'))novo.closest('details').open=true;
  novo?.focus();
}
