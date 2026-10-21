/* A conferência por item é on-line: data, equipe e saldo são verificados
   juntos no servidor. A fila antiga de O.S. não sobrescreve esse registro. */
/* O DIÁRIO DAS REVISÕES (U6 da revisão da onda operação): quem revisou ou
   anulou uma entrega conferida, quando e o motivo (conferenciasRevisoes, que
   o servidor carimba e só desce para a gestão). O mais novo primeiro. */
function confRevisoesHTML(os) {
  const regs = Array.isArray(os && os.conferenciasRevisoes) ? os.conferenciasRevisoes.filter(r => r && typeof r === 'object') : [];
  if (!regs.length) return '';
  const dia = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
  const quando = em => { const t = Date.parse(em || ''); return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo'}) : ''; };
  const linha = r => `<li><strong>${r.acao === 'anular' ? 'Anulou' : 'Revisou'}</strong> a entrega de ${esc(dia(r.antes && r.antes.dia) || '?')}${r.acao !== 'anular' && r.depois && r.depois.dia && r.antes && r.depois.dia !== r.antes.dia ? ` (agora em ${esc(dia(r.depois.dia))})` : ''} · ${esc(r.por || 'sem nome')}${quando(r.em) ? ' · ' + esc(quando(r.em)) : ''}<br><span class="text-muted">Motivo: ${esc(r.motivo || '')}</span></li>`;
  return `<details class="conf-revisoes"><summary>Revisões e anulações desta O.S. (${regs.length})</summary><ul>${regs.slice(-20).reverse().map(linha).join('')}</ul></details>`;
}
async function conferirItensEntrega(osId, entregaId = '') {
  if (!perfPodeEditar()) return;
  const pendente = () => STORE.getQueue().some(x => x.action === 'setCfg' || x.os?.id === osId || x.id === osId);
  if (pendente()) { toast('Sincronize as alterações pendentes antes de conferir os itens.', 'error'); return; }
  const resposta = await STORE.api({action:'conferenciaEntrega', osId});
  if (!resposta?.os) throw new Error(resposta?.error || 'Não foi possível carregar os itens desta O.S.');
  const os = resposta.os, registros = os.conferenciasEntrega || [], anterior = registros.find(e => e.id === entregaId);
  if (entregaId && !anterior) throw new Error('Esta entrega mudou. Atualize a apuração.');
  const outros = registros.filter(e => e.id !== entregaId), catalogo = CONFERENCIA_ENTREGA.catalogo(os);
  // Na primeira conferência, conservar quem já estava indicado na O.S.,
  // mas exigir a escolha dos itens. Uma nova entrega não herda a equipe.
  const primeira = !anterior && !registros.length;
  /* O dia (novo ou antigo) em mês fechado, e a O.S. que já entrou inteira num
     período fechado (D1 da revisão da onda fechamento): o diálogo diz antes de
     salvar (M7 e M8). A entrega já conferida num mês fechado, e a O.S. que já
     entrou inteira, ficam só leitura: os campos, não só o botão (U2). */
  const inteira = primeira && resposta.inteira && resposta.inteira.de ? resposta.inteira : null;
  const travaMes = d => confTravaMesFechado(resposta.fechados, anterior && anterior.dia, d, inteira);
  const soLeitura = !!inteira || !!(anterior && confTravaMesFechado(resposta.fechados, anterior.dia, anterior.dia));
  const id = anterior?.id || 'ent-' + crypto.randomUUID(), chave = 'itens:' + id;
  /* O DIA PROPOSTO É O DO SERVIÇO (revisão da onda volta, U4): a onda volta
     propunha o dia da volta (M11 da auditoria de 11/10/2026), e o serviço
     feito no dia 31 com o carro de volta no dia 1 ia para o mês seguinte. A
     entrega volta a propor o dia do serviço (a finalização na obra, como na
     v167); o dia da volta aparece ao lado, como informação, e o casamento da
     volta usa o dia da volta (CONFERENCIA_ENTREGA.voltaDaEntrega: o mesmo dia,
     o seguinte, ou a última antes no mesmo mês), que é o que a M11 queria. */
  const hojeConf = ENTREGA_ITEM.diaSP(new Date().toISOString());
  let dia = anterior?.dia || diaEntrega(os) || hojeConf, enviando = false;
  const voltaDoDiaTxt = d => {
    if (typeof CONFERENCIA_ENTREGA.viagemDoDia !== 'function' || os.tipo === 'interno') return '';
    const v = CONFERENCIA_ENTREGA.viagemDoDia(CONFERENCIA_ENTREGA.voltasDaOS(os), d);
    if (!v) return 'Volta do carro: nenhuma registrada neste dia, no seguinte ou antes neste mês. A nota não conta a volta nesta entrega.';
    const c = CONFERENCIA_ENTREGA.confDaVolta(v.retornoConf), nomes = (v.equipe || []).map(p => typeof OPERACAO !== 'undefined' && OPERACAO.nomePessoa ? OPERACAO.nomePessoa(p) : p).join(', ');
    return `Volta do carro desta entrega: ${v.dia.split('-').reverse().join('/')}${v.veiculo ? ' · ' + v.veiculo : ''}${nomes ? ' · ' + nomes : ''} · ${c ? 'conferida pela gestão' : 'ainda não conferida'}. Conta na nota quando a equipe desta entrega é a da viagem (ou está contida nela).`;
  };
  /* REVISAR OU ANULAR A PARCIAL (M12, onda operação): a conferência que não
     se lê mais (um item mudou) se revisa entrega por entrega, validando só a
     editada, com motivo; qualquer entrega conferida se anula com motivo. Só
     a gestão abre este diálogo; o servidor confere de novo. */
  const inconsistente = !!anterior && !!CONFERENCIA_ENTREGA.validar(os, registros);
  const letrasMotivo = t => (String(t || '').normalize('NFC').match(/[\p{L}\p{N}]/gu) || []).length;
  const MOTIVO_REV_MIN = 15;
  const escolhidos = new Map((anterior?.itens || []).map(i => [i.chave,i.qtde]));
  // O item cancelado depois de conferido (D1 da revisão da onda operação): esta entrega mantém dele no máximo o que já tinha.
  const daAnterior = new Map(escolhidos);
  const usados = new Map(); outros.forEach(e => e.itens.forEach(i => usados.set(i.chave,(usados.get(i.chave)||0)+i.qtde)));
  const virtual = {...os, alocacao:anterior?.alocacao || (primeira ? os.alocacao : null), equipe:anterior ? DIVISAO.derivarEquipe(anterior.alocacao) : primeira ? os.equipe || [] : []};
  ALOCUI.iniciar(chave, {os:virtual,equipes:perfConfig().equipes,papel:STATE.user.papel,valor:null,rotuloValor:'Valor dos itens desta entrega',dataEntrega:dia,versoes:perfRegrasFonte().versoes,semAntigo:true,reiniciar:true});
  const d = perfDialog('Itens e equipe · O.S. ' + (os.numero || ''), `<p class="aloc-os">${esc(os.cliente || '')}</p>
    ${!soLeitura && typeof podeOrigemRetrabalho === 'function' && podeOrigemRetrabalho() ? `<div class="conf-retrabalho-atalho"><button type="button" class="btn-ghost" id="conf-retrabalho"><span aria-hidden="true">↻</span> ${os.retrabalho ? 'Editar retrabalho' : 'Apontar retrabalho'}</button><small>Registre um problema desta O.S.</small></div>` : ''}
    ${inconsistente&&!soLeitura?'<p class="aloc-aviso conf-inconsistente" role="note">Esta entrega conferida não se lê mais: um item mudou depois de conferido. Marque abaixo os itens e as quantidades de hoje e escreva o motivo (no fim, em "Revisar ou anular esta entrega") para salvar a revisão, ou anule a entrega. As outras entregas ficam como estão até a revisão delas.</p>':''}
    <p class="metricas-nota">Selecione somente o que esta equipe entregou nesta data. Os itens restantes poderão ser conferidos em outra entrega, com outra equipe.</p>
    ${registros.length?`<nav class="conf-entregas" aria-label="Entregas desta O.S.">${registros.map((e,n)=>`<button type="button" class="btn-ghost btn-sm" data-conf-abrir="${esc(e.id)}" ${e.id===entregaId?'disabled':''}>Entrega ${n+1} · ${esc(e.dia.split('-').reverse().join('/'))}</button>`).join('')}<button type="button" class="btn-ghost btn-sm" data-conf-abrir="" ${!entregaId?'disabled':''}>+ Nova entrega</button></nav>`:''}
    ${!registros.length && os.alocacao?'<p class="aloc-aviso">Esta primeira conferência por item substituirá a divisão da O.S. inteira na apuração aberta. Confira depois os itens restantes. Os fechamentos já salvos permanecem preservados.</p>':''}
    ${typeof OPERACAO!=='undefined'&&OPERACAO.entregaLancadaValida&&OPERACAO.entregaLancadaValida(os)?`<p class="aloc-aviso conf-lancada" role="note">Esta O.S. tem entrega lançada em ${esc(String(OPERACAO.entregaLancadaValida(os).data||'').split('-').reverse().join('/'))}. Com a conferência por entrega, a apuração conta só o que for conferido aqui, e o lançamento deixa de contar.</p>`:''}
    <p class="aloc-aviso conf-mes-fechado" id="conf-mes-fechado" role="note" ${travaMes(dia)?'':'hidden'}>${esc(travaMes(dia))}</p>
    <fieldset class="conf-campos${soLeitura?' so-leitura':''}" ${soLeitura?'disabled aria-describedby="conf-mes-fechado"':''}><legend class="perf-sr">${soLeitura?'Entrega em mês fechado: só leitura':'Dados desta entrega'}</legend>
    <label class="conf-data">Data desta entrega <input id="conf-data" type="date" value="${esc(dia)}" max="${ENTREGA_ITEM.diaSP(new Date().toISOString())}"></label>
    <p class="conf-volta-do-dia metricas-nota" id="conf-volta-dia" ${voltaDoDiaTxt(dia)?'':'hidden'}>${esc(voltaDoDiaTxt(dia))}</p>
    <section class="conf-itens" aria-label="Itens desta entrega"><div class="conf-itens-topo"><h4>O que foi entregue?</h4><button type="button" class="btn-ghost btn-sm" id="conf-todos">Selecionar saldo disponível</button></div>
      ${catalogo.map((it,n)=>{const tinhaC=it.cancelado?(daAnterior.get(it.chave)||0):0, saldo=it.cancelado?tinhaC:it.qtde-(usados.get(it.chave)||0), trava=saldo<=0||it.ambiguo;return `<div class="conf-item"><label><input type="checkbox" data-conf-item="${n}" ${escolhidos.has(it.chave)?'checked':''} ${trava?'disabled':''}><span><strong>${esc(it.descricao)}</strong><small>${it.ambiguo?'Itens iguais sem identificação: confira a ficha.':it.cancelado?(tinhaC?`Item cancelado: esta entrega mantém até ${tinhaC} já conferida(s); o saldo foi cancelado`:'Item cancelado'):`${saldo} de ${it.qtde} disponível(is) · ${it.qtde>1?'unidades':'item completo'}`}</small></span></label><label class="conf-qtde">Quantidade <input type="number" inputmode="numeric" min="1" max="${saldo}" step="1" data-conf-qtde="${n}" value="${escolhidos.get(it.chave)||saldo||1}" ${trava||!escolhidos.has(it.chave)?'disabled':''}></label></div>`;}).join('') || '<p>Nenhum item cadastrado. Complete a ficha da O.S. para conferir a entrega.</p>'}
      <p id="conf-resumo" class="conf-resumo" aria-live="polite"></p></section>
    <h4>Quem entregou estes itens?</h4>
    <section class="conf-parte" aria-label="Parte entregue por esta equipe"><div class="conf-parte-topo"><strong id="conf-parte-titulo">Selecione os itens entregues</strong><button type="button" class="btn-ghost btn-sm" id="conf-editar-itens">Editar itens e quantidades</button></div><p id="conf-parte-itens"></p><p id="conf-parte-valor" aria-live="polite"></p><small>100% aqui significa a participação nos itens selecionados, não na O.S. inteira.</small></section>
    <div id="conf-aloc"></div></fieldset>
    ${anterior&&!soLeitura?`<details class="conf-revisar" ${inconsistente?'open':''}><summary>Revisar ou anular esta entrega</summary>
      <p class="metricas-nota">${inconsistente?'O motivo vale para salvar a revisão ou para anular. ':''}Anular tira esta entrega da conferência e da apuração do mês aberto. Fica registrado quem ${inconsistente?'revisou ou ':''}anulou, quando e o motivo.</p>
      <label class="conf-rev-motivo">Motivo (${MOTIVO_REV_MIN} letras ou mais) <input id="conf-rev-motivo" maxlength="300" autocomplete="off"></label>
      <button type="button" class="btn-ghost btn-sm" id="conf-anular">Anular esta entrega</button></details>`:''}
    ${confRevisoesHTML(os)}
    <p class="aloc-status" id="conf-status" role="status" aria-live="polite"></p><div class="aloc-acoes"><button type="button" class="btn-primary" id="conf-salvar">${inconsistente?'Salvar a revisão desta entrega':anterior?'Salvar alterações da entrega':'Confirmar esta entrega'}</button><button type="button" class="btn-ghost" id="conf-cancelar">Cancelar</button></div>`);
  const box=d.querySelector('#conf-aloc'), status=d.querySelector('#conf-status'), salvar=d.querySelector('#conf-salvar');
  const minhaTela=()=>d.open && d.querySelector('#conf-aloc')===box;
  const selecao=()=>catalogo.filter(i=>escolhidos.has(i.chave)).map(i=>({chave:i.chave,identidade:i.identidade,qtde:escolhidos.get(i.chave)}));
  const conferir=()=>{
    if(enviando) return;
    const hojeV=ENTREGA_ITEM.diaSP(new Date().toISOString()), entrega={id,dia,itens:selecao()};
    // Na revisão da parcial (M12), só a editada é validada; as outras entram no saldo pelo que ainda se lê.
    const erro=inconsistente?CONFERENCIA_ENTREGA.validarRevisao(os,outros,entrega,hojeV,anterior||null):CONFERENCIA_ENTREGA.validar(os,[...outros,entrega],hojeV,{novas:new Map([[id,anterior||null]])});
    const doSaldo=inconsistente?CONFERENCIA_ENTREGA.lidasParaSaldo(os,outros):outros;
    const ap=erro?null:CONFERENCIA_ENTREGA.apurar(os,resposta.valor,[...doSaldo,entrega]), valor=ap?.entregas.find(e=>e.id===id)?.valor;
    const st=ALOCUI.estado(chave); st.valor=valor==null?null:valor;
    const mesFechado=travaMes(dia), aviso=d.querySelector('#conf-mes-fechado');
    if(aviso){aviso.textContent=mesFechado;aviso.hidden=!mesFechado;}
    const campoRev=d.querySelector('#conf-rev-motivo');
    const faltaMotivo=inconsistente && letrasMotivo(campoRev && campoRev.value)<MOTIVO_REV_MIN ? `Escreva o motivo da revisão com ${MOTIVO_REV_MIN} letras ou mais.` : '';
    const motivo=mesFechado || erro || faltaMotivo || ALOCUI.bloqueio(chave);
    salvar.disabled=!!motivo; status.textContent=motivo || ''; status.classList.toggle('erro',!!motivo);
    d.querySelector('#conf-resumo').textContent=erro || `${entrega.itens.length} item(ns) selecionado(s) · ${valor==null?'Valor a conferir: faltam valores dos itens.':dinheiroCasa(valor/100)} · ${ap.saldoItens.length} item(ns) com saldo para outra entrega.`;
    d.querySelector('#conf-parte-titulo').textContent=erro?'Confira os itens entregues':ap.saldoItens.length?'Entrega parcial':'Saldo de itens concluído';
    d.querySelector('#conf-parte-itens').textContent=catalogo.filter(it=>escolhidos.has(it.chave)).map(it=>`${it.descricao} · ${escolhidos.get(it.chave)} de ${it.qtde}`).join(' · ') || 'Nenhum item selecionado.';
    d.querySelector('#conf-parte-valor').textContent=erro || `Esta entrega: ${valor==null?'valor a conferir':dinheiroCasa(valor/100)} · Saldo a conferir: ${ap.saldo==null?'valor a conferir':dinheiroCasa(ap.saldo/100)}`;
  };
  const atualizar=()=>{conferir();ALOCUI.repintar(chave);};
  let rasc=null;
  ALOCUI.montar(box,chave,{aoMudar:conferir,aoAlterar:()=>rasc&&rasc.mudou()});
  d.querySelector('#conf-editar-itens').onclick=()=>{
    const primeiro=d.querySelector('[data-conf-item]:checked:not(:disabled)') || d.querySelector('[data-conf-item]:not(:disabled)');
    d.querySelector('.conf-itens').scrollIntoView({behavior:'smooth',block:'start'});
    primeiro?.focus({preventScroll:true});
  };
  const mexeu=()=>{if(rasc)rasc.mudou();};
  const trocarDia=v=>{dia=v;ALOCUI.definirDataEntrega(chave,dia);const vd=d.querySelector('#conf-volta-dia');if(vd){const t=voltaDoDiaTxt(dia);vd.textContent=t;vd.hidden=!t;}};
  d.querySelector('#conf-data').onchange=e=>{trocarDia(e.target.value);atualizar();mexeu();};
  d.querySelectorAll('[data-conf-item]').forEach(el=>el.onchange=()=>{const n=+el.dataset.confItem,it=catalogo[n],q=d.querySelector(`[data-conf-qtde="${n}"]`);q.disabled=!el.checked;if(el.checked)escolhidos.set(it.chave,Number(q.value));else escolhidos.delete(it.chave);atualizar();mexeu();});
  d.querySelectorAll('[data-conf-qtde]').forEach(el=>el.oninput=()=>{escolhidos.set(catalogo[+el.dataset.confQtde].chave,Number(el.value));atualizar();mexeu();});
  d.querySelector('#conf-todos').onclick=()=>{d.querySelectorAll('[data-conf-item]').forEach(el=>{if(el.disabled||catalogo[+el.dataset.confItem].cancelado)return;const n=+el.dataset.confItem,it=catalogo[n],q=d.querySelector(`[data-conf-qtde="${n}"]`);el.checked=true;q.disabled=false;q.value=it.qtde-(usados.get(it.chave)||0);escolhidos.set(it.chave,Number(q.value));});atualizar();mexeu();};
  d.querySelectorAll('[data-conf-abrir]').forEach(el=>el.onclick=()=>{d.close();void conferirItensEntrega(osId,el.dataset.confAbrir).catch(e=>toast(perfErroTxt(e),'error'));});
  const apontar = d.querySelector('#conf-retrabalho');
  if (apontar) apontar.onclick = () => {
    if (enviando || !perfPodeEditar() || !podeOrigemRetrabalho()) return;
    if (pendente()) { toast('Sincronize as alterações pendentes antes de apontar o retrabalho.', 'error'); return; }
    // Outro dialog nativo mantém a conferência intacta e atrás do formulário.
    const local = STORE.getOS(osId);
    const base = JSON.parse(JSON.stringify(local && Number(local.rev) >= Number(os.rev) ? local : os));
    const editor = document.createElement('dialog');
    editor.className = 'conf-retrabalho-dialog';
    editor.setAttribute('aria-label', 'Apontar retrabalho');
    document.body.appendChild(editor);
    const voltar = () => { editor.close(); editor.remove(); if (minhaTela()) apontar.focus(); };
    editor.addEventListener('cancel', e => { e.preventDefault(); editor.querySelector('#retrab-voltar')?.click(); });
    editor.showModal();
    perguntarRetrabalho(JSON.parse(JSON.stringify(base)), () => {
      voltar();
      // O registro usa a fila normal da O.S.; uma próxima conferência carregará
      // a revisão do servidor após sincronizar. O rascunho da entrega continua salvo.
      if (minhaTela()) d.close();
      toast('Retrabalho registrado. Acompanhe a sincronização no painel.', 'success');
      renderActiveTab();
    }, {apontar:true, container:editor, rotulo:'Voltar aos itens e equipe', aoVoltar:voltar,
      antesDeRegistrar: alterada => confGravarRetrabalho(base, alterada)});
  };
  d.querySelector('#conf-cancelar').onclick=()=>d.close();
  const campoRevMotivo=d.querySelector('#conf-rev-motivo');
  if(campoRevMotivo)campoRevMotivo.oninput=()=>{conferir();mexeu();};
  /* O RASCUNHO DESTA CONFERÊNCIA (itens 22 e 34 da fila de 11/10/2026): o
     dia, os itens e as quantidades marcados, o motivo da revisão e a equipe
     montada ficam neste aparelho (pela conta, pela O.S. e pela entrega: a
     nova tem a dela) até salvar ou anular; fechar a tela, a aba ou o
     aparelho não perde o que foi marcado. Nunca R$: o valor da entrega é
     recalculado na volta. A entrega que mudou no servidor (outro dia, outros
     itens) ou a O.S. com outros itens não recebe o rascunho. Só leitura (mês
     fechado) não guarda nada. */
  if(!soLeitura && typeof ligarRascunhoEstado==='function'){
    const catalogoAss=catalogo.map(i=>i.chave+'#'+i.qtde+(i.cancelado?'c':'')).join('|');
    rasc=ligarRascunhoEstado('conferencia-entrega',osId+':'+(anterior?anterior.id:'nova'),{
      assinatura:()=>JSON.stringify([anterior?[anterior.id,anterior.dia,(anterior.itens||[]).map(i=>i.chave+'#'+i.qtde)]:'nova',catalogoAss,registros.map(e=>e.id)]),
      ler:()=>({dia,itens:[...escolhidos.entries()].map(([ch,q])=>[ch,Number(q)||0]),motivo:String(campoRevMotivo&&campoRevMotivo.value||''),aloc:ALOCUI.retrato(chave)}),
      aplicar:(e,como)=>{
        if(!e||typeof e!=='object'||!minhaTela())return false;
        const hojeR=ENTREGA_ITEM.diaSP(new Date().toISOString());
        if(/^\d{4}-\d{2}-\d{2}$/.test(String(e.dia||''))&&e.dia<=hojeR){const campo=d.querySelector('#conf-data');if(campo)campo.value=e.dia;trocarDia(e.dia);}
        const marcados=new Map((Array.isArray(e.itens)?e.itens:[]).filter(x=>Array.isArray(x)&&x.length===2).map(([ch,q])=>[String(ch),Math.floor(Number(q))]));
        escolhidos.clear();
        d.querySelectorAll('[data-conf-item]').forEach(el=>{const n=+el.dataset.confItem,it=catalogo[n],q=d.querySelector(`[data-conf-qtde="${n}"]`),max=Number(q&&q.max)||0,v=marcados.get(it.chave);
          const vale=!el.disabled&&Number.isInteger(v)&&v>=1&&(!max||v<=max);el.checked=vale;if(q){q.disabled=!vale;if(vale)q.value=String(v);}if(vale)escolhidos.set(it.chave,v);});
        if(campoRevMotivo)campoRevMotivo.value=String(e.motivo||'').slice(0,300);
        if(e.aloc)ALOCUI.aplicarRetrato(chave,e.aloc,como&&como.descartar?{tocado:e.aloc.tocado===true}:{});
        atualizar();
        return true;
      },
      aoRecuperar:({em,descartar})=>{const alvo=d.querySelector('.conf-campos');avisoRascunhoEl(alvo,'Voltou o que você tinha marcado nesta conferência ('+new Date(em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})+') e não chegou a salvar.',descartar);},
    });
  }
  const anular=d.querySelector('#conf-anular');
  if(anular)anular.onclick=async()=>{
    if(enviando)return;
    const motivoAn=String(campoRevMotivo&&campoRevMotivo.value||'').trim();
    if(letrasMotivo(motivoAn)<MOTIVO_REV_MIN){status.textContent=`Escreva o motivo da anulação com ${MOTIVO_REV_MIN} letras ou mais.`;status.classList.add('erro');campoRevMotivo?.focus();return;}
    if(pendente()){status.textContent='Sincronize as alterações pendentes antes de anular.';return;}
    if(!confirm(`Anular a entrega conferida em ${anterior.dia.split('-').reverse().join('/')}? Ela sai da conferência e da apuração do mês aberto.`))return;
    enviando=true;anular.disabled=true;salvar.disabled=true;status.textContent='Anulando a entrega…';
    try {
      const resp=await STORE.api({action:'conferenciaEntrega',osId,rev:os.rev,entrega:{id:anterior.id},revisao:{acao:'anular',motivo:motivoAn}});
      if(!resp?.ok) throw new Error(resp?.error || 'Não foi possível anular a entrega.');
      if(rasc)rasc.limpar();
      if(minhaTela())d.close();
      if(typeof STORE.pull==='function') await STORE.pull().catch(()=>{});
      conferenciaRefletirNaFicha(resp.os);
      toast('Entrega conferida anulada, com o motivo registrado.','success');
      perfDepoisDeGravar({estado:'gravada'});
    } catch(e) {if(minhaTela()){status.textContent=perfErroTxt(e);status.classList.add('erro');anular.disabled=false;salvar.disabled=false;}else toast(perfErroTxt(e),'error');}
    finally {enviando=false;}
  };
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
      const campoRev=d.querySelector('#conf-rev-motivo');
      const resposta=await STORE.api({action:'conferenciaEntrega',osId,rev:os.rev,entrega:{id,dia,itens:selecao(),alocacao:{...r.alocacao,...(anterior?.alocacao?.em?{em:anterior.alocacao.em}:{})}},
        ...(inconsistente?{revisao:{acao:'revisar',motivo:String(campoRev&&campoRev.value||'').trim()}}:{})});
      if(!resposta?.ok) throw new Error(resposta?.error || 'Não foi possível confirmar a entrega.');
      if(rasc)rasc.limpar();
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

/* MÊS FECHADO (M7 e M8 da auditoria de 11/10/2026): o servidor recusa
   conferir com o dia, novo ou antigo, num período já fechado (o selo já
   contou; mover a parcial dele contaria a mesma unidade duas vezes). O diálogo
   diz antes de salvar, com os períodos que vieram na abertura (conferenciaEntrega
   sem entrega). Sem eles (servidor antigo), nada é afirmado: a porta confere. */
/* U2 da revisão da onda fechamento (12/10/2026): a frase dizia "escolha o dia
   certo, num mês aberto", e a pessoa trocava 30/09 por 01/10: a entrega de
   setembro contava em outubro. Agora diz para corrigir só a data errada, e
   que a entrega de mês fechado não se confere agora. O ajuste de mês fechado
   depende da pergunta 3 da fila do dono (P-006 a P-010). `inteira`: o período
   fechado em que a O.S. já entrou inteira (D1), que o servidor manda ao abrir. */
const CONF_MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const CONF_AJUSTE_FECHADO = 'o ajuste de mês fechado ainda não existe; fale com a gestão.';
function confTravaMesFechado(fechados, diaAnterior, dia, inteira) {
  const lista = Array.isArray(fechados) ? fechados : [];
  const de = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? lista.find(x => x && d >= x.de && d <= x.ate) || null : null;
  const br = d => String(d || '').split('-').reverse().join('/');
  const mes = d => CONF_MESES[Number(String(d).slice(5, 7)) - 1] + ' de ' + String(d).slice(0, 4);
  const v = de(diaAnterior), n = de(dia);
  if (v) return `Esta entrega foi conferida em ${br(diaAnterior)}, num mês já fechado (${br(v.de)} a ${br(v.ate)}, revisão ${v.ultimaRevisao}). Mês fechado não se recalcula: ela não pode mudar nem ir para outro mês. Se algo está errado nela, ${CONF_AJUSTE_FECHADO}`;
  if (inteira && inteira.de) return `Esta O.S. já entrou inteira no fechamento de ${br(inteira.de)} a ${br(inteira.ate)} (revisão ${inteira.ultimaRevisao}), com a entrega de ${br(inteira.dia)}. Conferir os itens agora contaria a mesma entrega de novo em outro mês: ${CONF_AJUSTE_FECHADO}`;
  if (n) return `O dia ${br(dia)} está num mês já fechado (${br(n.de)} a ${br(n.ate)}, revisão ${n.ultimaRevisao}). Se a data está errada, corrija. Se a entrega foi mesmo em ${mes(dia)}, ela não pode ser conferida agora: ${CONF_AJUSTE_FECHADO}`;
  return '';
}

// A ficha pode continuar aberta por baixo do diálogo. Pull atualiza o store,
// mas o rascunho da ficha é uma cópia: só repintar a aba deixava o saldo antigo.
function conferenciaRefletirNaFicha(confirmada) {
  if(!confirmada || typeof _modalDraft==='undefined' || _modalDraft?.id!==confirmada.id)return;
  const atual=STORE.getOS(confirmada.id),base=atual && Number(atual.rev)>=Number(confirmada.rev)?atual:confirmada;
  if(Number(_modalDraft.rev)>Number(base.rev))return;
  const modal=typeof document!=='undefined'?document.querySelector('#modal-os'):null;
  /* O BOTÃO DA SEÇÃO CERTA (baixa da verificação da v172): a ficha tem mais
     de um "Conferir itens e equipe" (acima da lista de itens, no item
     conferido e em Conferência e acompanhamento), e o primeiro da ficha não
     era o da seção recolhível: o "aberto" e o foco iam para o lugar errado. */
  const doAcompanhamento=()=>modal?.querySelector('[data-controle="itens"][data-controle-secao="acompanhamento"]')||modal?.querySelector('[data-controle="itens"]');
  const anterior=doAcompanhamento(),aberto=anterior?.closest('details')?.open;
  _modalDraft.conferenciasEntrega=JSON.parse(JSON.stringify(base.conferenciasEntrega || []));
  // O diário das revisões (U6) também, para a ficha dizer quem revisou ou anulou.
  if(Array.isArray(base.conferenciasRevisoes))_modalDraft.conferenciasRevisoes=JSON.parse(JSON.stringify(base.conferenciasRevisoes));
  const pendente=STORE.getQueue().some(x=>x.os?.id===base.id || x.id===base.id);
  if(!pendente && !_modalDirty) _modalDraft=JSON.parse(JSON.stringify(base));
  // Com edição local em andamento, não rebasa silenciosamente a revisão nem
  // substitui campos operacionais: o controle de concorrência continua valendo.
  reRenderModalKeepOpen();
  const novo=doAcompanhamento();
  if(aberto && novo?.closest('details'))novo.closest('details').open=true;
  novo?.focus();
}

// O atalho altera apenas o retrabalho, nunca os itens/equipe da conferência.
function confGravarRetrabalho(base, alterada) {
  if (!perfPodeEditar() || !podeOrigemRetrabalho()) return 'Só a gestão do PCP pode registrar o retrabalho.';
  if (STORE.getQueue().some(x => x.action === 'setCfg' || x.os?.id === base.id || x.id === base.id)) return 'Sincronize as alterações pendentes antes de confirmar o retrabalho.';
  const local = STORE.getOS(base.id);
  if (!local) return 'Esta O.S. não está mais disponível. Atualize o painel.';
  const atual = Number(local.rev) >= Number(base.rev) ? local : base;
  const campos = ['retrabalho','problema','etapaOrigem','causaRaiz','responsavelEtapa','dataRetrabalho','retrabalhoPerguntado','etapaOrigemMotivo'];
  if (campos.some(k => JSON.stringify(atual[k]) !== JSON.stringify(base[k]))) return 'O retrabalho mudou enquanto você preenchia. Volte e abra novamente para conferir.';
  const copia = JSON.parse(JSON.stringify(atual));
  for (const k of campos) { if (alterada[k] === undefined) delete copia[k]; else copia[k] = alterada[k]; }
  copia.atualizadoEm = nowISO(); copia.atualizadoPor = STATE.user.nome;
  STORE.saveOS(copia);
  // A ficha pode estar aberta por trás: preservar suas outras edições sem
  // deixar um salvamento posterior apagar o retrabalho recém-apontado.
  if (typeof _modalDraft !== 'undefined' && _modalDraft?.id === copia.id) {
    for (const k of campos) { if (copia[k] === undefined) delete _modalDraft[k]; else _modalDraft[k] = copia[k]; }
    reRenderModalKeepOpen();
  }
  return '';
}
