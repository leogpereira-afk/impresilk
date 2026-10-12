'use strict';
// Revisões humanas de cadastro e prioridades determinísticas. Não interpreta nomes como identidade.
const OPREV=(()=>{
 const CATEGORIAS=['Adesivos','Fachadas','Letreiros','Sinalização','Estruturas','Impressos','Outros'];
 const categoria=(o,cfg={})=>{const s=String(o?.servico||'').trim(),m=(cfg.categoriasServico||[]).find(x=>x.descricao===s);return m&&CATEGORIAS.includes(m.categoria)?m.categoria:'Sem categoria';};
 /* O TIPO DE SERVIÇO NOS GRÁFICOS E NO FILTRO (M17 da auditoria de 11/10/2026,
    onda acabamento): a categoria confirmada pela gestão; sem ela, a descrição
    do ERP, como era antes das categorias (na v164 tudo virou "Sem categoria",
    porque havia 0 categorias para centenas de descrições). Nada é gravado. */
 const tipo=(o,cfg={})=>{const c=categoria(o,cfg);if(c!=='Sem categoria')return c;return String(o?.servico||'').trim()||'Sem descrição no ERP';};
 const semAcento=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 /* A CLASSIFICAÇÃO EM LOTE (M17): as descrições ainda sem categoria em que a
    busca é uma palavra inteira ou o começo de uma palavra (sem acento, sem
    caixa, duas letras ou mais). No meio da palavra não vale (revisão da onda
    acabamento, U3): "ad" pegava "fachada". A gestão confere a lista (e tira
    uma por uma), escolhe a categoria e diz o motivo; só então a configuração
    muda (STORE.saveCFG, com a assinatura do servidor). A descrição da O.S.
    não muda. */
 const escRe=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const casaInicio=(d,b)=>new RegExp('(^|[^a-z0-9])'+escRe(b)).test(semAcento(d));
 const paraLote=(descricoes,busca,cfg={})=>{const b=semAcento(busca);if(b.length<2)return [];const feitas=new Set((cfg.categoriasServico||[]).map(x=>x&&x.descricao));return [...new Set((descricoes||[]).map(d=>String(d||'').trim()))].filter(d=>d&&!feitas.has(d)&&casaInicio(d,b)).sort((x,y)=>x.localeCompare(y,'pt-BR'));};
 /* DESFAZER UM LOTE (U3): pelo registro do lote (lotesCategoria), as
    descrições que ainda estão com a categoria daquele lote voltam a ficar sem
    categoria (a classificação de antes: o lote só pega descrição sem
    categoria); a que a gestão reclassificou depois, uma a uma, fica. O
    registro não se apaga: ganha `desfeito` com o motivo. Devolve a
    configuração nova, ou {erro}. */
 const letras=t=>(String(t||'').match(/\p{L}/gu)||[]).length;
 function desfazerLote(cfg,id,motivo,quem,agora){
  const lote=(cfg.lotesCategoria||[]).find(l=>l&&l.id===id);
  if(!lote)return {erro:'Este lote não está mais na configuração. Atualize a tela.'};
  if(lote.desfeito)return {erro:'Este lote já foi desfeito.'};
  if(letras(motivo)<15)return {erro:'Diga o motivo para desfazer o lote, com 15 letras ou mais.'};
  const novo=structuredClone(cfg),voltam=(novo.categoriasServico||[]).filter(x=>x&&x.lote===id).map(x=>x.descricao);
  novo.categoriasServico=(novo.categoriasServico||[]).filter(x=>!(x&&x.lote===id));
  novo.lotesCategoria=novo.lotesCategoria.map(l=>l&&l.id===id?{...l,desfeito:{motivo:String(motivo).trim(),por:quem,em:agora}}:l);
  return {cfg:novo,voltam,ficam:(lote.descricoes||[]).filter(d=>!voltam.includes(d))};
 }
 // As opções do filtro de tipo: as categorias e as descrições sem categoria que aparecem na lista.
 const tiposDoFiltro=(lista,cfg={})=>{const desc=[...new Set((lista||[]).filter(Boolean).map(o=>tipo(o,cfg)).filter(t=>!CATEGORIAS.includes(t)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));return [...CATEGORIAS,...desc];};
 const custo=(o,tarifas={},medicao={})=>{
  const numero=v=>v!==''&&v!=null&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
  const h=numero(medicao.horas),km=numero(medicao.km),material=numero(medicao.material),rh=numero(tarifas.hora),rk=numero(tarifas.km);
  const partes={material:material==null?null:Math.round(material*100),tempo:h==null||rh==null?null:Math.round(h*rh*100),deslocamento:km==null||rk==null?null:Math.round(km*rk*100)};
  const conhecidos=Object.values(partes).filter(x=>x!=null),completo=conhecidos.length===3;
  return {horas:h,km,material,partes,completo,centavos:conhecidos.length?conhecidos.reduce((s,n)=>s+n,0):null,rotulo:completo?'Custo medido':conhecidos.length?'Custo parcial · componentes não medidos':'Custo não medido'};
 };
 function custoCorrecao(o, cfg={}, op){
  const medicao = cfg.medicoesRetrabalho?.[o?.id] || {};
  const inicio = o?.kmSaida, fim = o?.kmRetorno;
  const km = inicio != null && inicio !== '' && fim != null && fim !== '' && Number(fim) >= Number(inicio)
   ? Number(fim) - Number(inicio) : null;
  return custo(o, cfg.custoRetrabalho || {}, {
   horas: o ? op.horas(o) : null, km, material: null, ...medicao
  });
 }
 function prioridades(lista,hoje,op,config={}){
  const out=[];
  for(const o of lista||[]){if(op.cancelada?.(o))continue;let motivo='',peso=9;
   if(op.retrabalhoPendente(o)){motivo='Revisar correção pendente e plano de prevenção';peso=0;}
   else if(op.atrasada(o,hoje)){motivo='Revisar prazo vencido e próxima etapa';peso=1;}
   else if(op.diasAgenda(o).includes(hoje)&&op.pendencias(o).length){motivo=op.pendencias(o).join(' · ');peso=2;}
   else if(o.conferenciasEntrega?.length&&typeof CONFERENCIA_ENTREGA!=='undefined'&&CONFERENCIA_ENTREGA.estado(o).saldoUnidades>0){motivo='Conferir saldo físico de itens';peso=3;}
   if(motivo)out.push({osId:o.id,numero:o.numero,motivo,peso,origem:'PCP · registros deste aparelho',data:o.atualizadoEm||o.criadoEm||'data não informada',dono:o.responsavelPCP||config.dono||'PCP · responsável a definir'});
  }
  return out.sort((a,b)=>a.peso-b.peso||String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true})).slice(0,5);
 }
 return {CATEGORIAS,categoria,tipo,paraLote,desfazerLote,letras,tiposDoFiltro,custo,custoCorrecao,prioridades};
})();
if(typeof module!=='undefined')module.exports=OPREV;
function operacaoPrioridadesHTML(){
 const xs=OPREV.prioridades(STORE.getAllOS(),OPERACAO.dia(new Date()),OPERACAO,STORE.getCFG().prioridadesPCP);
 return `<section class="op-prioridades"><h3>Prioridades do dia</h3><p>Até cinco ações sugeridas por regras: correções, prazo, programação e saldo. Cobertura: registros carregados neste aparelho. Não altera registros nem avalia pessoas.</p>${xs.map(x=>`<article><button class="inline-link" data-os-id="${esc(x.osId)}">O.S. ${esc(x.numero)}</button><strong> ${esc(x.motivo)}</strong><small class="bloco">${esc(x.dono)} · ${esc(x.origem)} · ${esc(x.data)}</small></article>`).join('')||'<p>Nenhuma ação encontrada na base carregada; isso não confirma ausência de pendências fora dela.</p>'}<label>Localizar O.S. <input type="search" id="op-prioridade-busca" placeholder="Número completo"></label><div id="op-prioridade-resultado"></div><details><summary>Pendências de configuração e histórico da melhoria</summary><p>Gestão: validar início efetivo em novembro, rateio interno, trios, desempate e prêmios em Performance → Regras. Campos sem evidência permanecem pendentes. Desenvolvimento: revisão de 03/10/2026, com fontes e decisões humanas preservadas.</p><button class="btn-ghost" id="op-cadastros">Conferir veículos, categorias e correções</button></details></section>`;
}
function wireOperacaoRevisao(el){
 const b=el.querySelector('#op-cadastros');if(b)b.onclick=abrirRevisaoOperacional;
 const q=el.querySelector('#op-prioridade-busca');if(q)q.oninput=()=>{const xs=STORE.getAllOS().filter(o=>String(o.numero)===q.value.trim());el.querySelector('#op-prioridade-resultado').innerHTML=xs.map(o=>`<button class="btn-ghost" data-os-id="${esc(o.id)}">${esc(o.numero)} · ${esc(o.cliente)}</button>`).join('')||(q.value?'Número não encontrado na base carregada.':'');bindCardClicks(el);};
}
/* Os lotes já feitos, do mais novo para o mais antigo, cada um com as
   descrições e o "Desfazer este lote" (com motivo). O desfeito fica, só
   leitura, com quem desfez e o motivo (U3). */
function lotesFeitosHTML(cfg){
 const xs=(cfg.lotesCategoria||[]).filter(l=>l&&l.id).slice().sort((a,b)=>String(b.em||'').localeCompare(String(a.em||'')));
 if(!xs.length)return '<div id="op-lotes"></div>';
 const dia=t=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(t||''));return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
 const um=l=>{const n=(l.descricoes||[]).length,quem=[l.por,dia(l.em)].filter(Boolean).join(' em ');
  return `<article class="op-lote-feito${l.desfeito?' desfeito':''}"><p><strong>${esc(l.categoria)}</strong> · ${n===1?'1 descrição':n+' descrições'}${l.busca?` · palavra "${esc(l.busca)}"`:''}${quem?` · ${esc(quem)}`:''}</p><p>Motivo: ${esc(l.motivo||'')}</p><details><summary>Ver as descrições</summary><ul>${(l.descricoes||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>${l.desfeito
   ?`<p class="op-lote-desfeito">Desfeito${l.desfeito.por?' por '+esc(l.desfeito.por):''}${dia(l.desfeito.em)?' em '+dia(l.desfeito.em):''}: ${esc(l.desfeito.motivo||'')}</p>`
   :`<label>Motivo para desfazer (15 letras ou mais) <input data-lote-motivo="${esc(l.id)}" maxlength="300"></label><button type="button" class="btn-ghost btn-sm" data-lote-desfazer="${esc(l.id)}">Desfazer este lote</button><p role="status" aria-live="polite" class="op-lote-status" data-lote-status="${esc(l.id)}"></p>`}</article>`;};
 return `<details id="op-lotes" class="op-lotes"><summary>Lotes já feitos (${xs.length})</summary><p><small>Desfazer devolve as descrições do lote à classificação de antes (sem categoria); a descrição reclassificada depois, uma a uma, fica.</small></p>${xs.map(um).join('')}</details>`;
}
function abrirRevisaoOperacional(){
 if(!perfPodeEditar())return;
 const cfg=STORE.getCFG(),veiculos=veiculosRH(),lista=STORE.getAllOS(),descricoes=[...new Set(lista.map(o=>String(o.servico||'').trim()).filter(Boolean))].sort(),aliases=[...new Set(lista.map(o=>o.veiculo).filter(v=>v&&!OPERACAO.semCarro({veiculo:v})))];
 const d=perfDialog('Conferência operacional',`<p>Alterações de análise e cadastro exigem confirmação. Descrições e registros originais são preservados.</p><form id="op-revisao-form"><fieldset><legend>Veículo · confirmar identidade</legend><label>Nome histórico <select name="alias"><option value="">Não alterar</option>${aliases.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>Ficha por ID e placa <select name="veiculo"><option value="">Selecione</option>${veiculos.filter(v=>v.id&&v.placa).map(v=>`<option value="${esc(v.id)}">${esc(v.nome)} · ${esc(v.placa)} · ID ${esc(v.id)}</option>`).join('')}</select></label><p>Fiat Uno / UNO - 10 e Iveco 40 / caminhão 40 são apenas candidatos. Confirme a placa antes de associar.</p><label><input type="checkbox" name="confirmaVeiculo"> Conferi a placa e reconheço o mesmo veículo.</label></fieldset><fieldset><legend>Categoria controlada · descrição preservada</legend><label>Descrição original <input name="descricao" list="op-descricoes"><datalist id="op-descricoes">${descricoes.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label><label>Categoria <select name="categoria"><option value="">Selecione</option>${OPREV.CATEGORIAS.map(c=>`<option>${c}</option>`).join('')}</select></label><small>Escolha explícita agrupa esta descrição exata; variações permanecem pendentes até confirmação.</small></fieldset><fieldset class="op-lote"><legend>Classificar em lote · pela busca</legend><label>Palavra ou começo de palavra <input name="loteBusca" autocomplete="off" placeholder="ex.: adesivo"></label><label>Categoria <select name="loteCategoria"><option value="">Selecione</option>${OPREV.CATEGORIAS.map(c=>`<option>${c}</option>`).join('')}</select></label><label>Motivo (15 letras ou mais) <input name="loteMotivo" maxlength="300"></label><div id="op-lote-previa" class="op-lote-previa" aria-live="polite"><small>Digite uma palavra (ou o começo dela) para ver as descrições sem categoria que vão ser classificadas.</small></div><label class="op-lote-confirma"><input type="checkbox" name="loteConfirma"> <span id="op-lote-conta">Conferi a lista: classificar as descrições marcadas nesta categoria.</span></label><small>Só as descrições sem categoria entram; a descrição de cada O.S. não muda. Tire da lista a que não é desta categoria. Para trocar uma já classificada, use a escolha de uma descrição acima.</small>${lotesFeitosHTML(cfg)}</fieldset><fieldset><legend>Correção ligada à O.S. original</legend><label>ID da O.S. de correção <select name="correcao"><option value="">Não alterar</option>${lista.filter(o=>o.osOriginal).map(o=>`<option value="${esc(o.id)}">O.S. ${esc(o.numero)} → original ${esc(o.osOriginal)} · ID ${esc(o.id)}</option>`).join('')}</select></label><label>Original confirmada por ID <select name="originalId"><option value="">Selecione a O.S. original</option>${lista.filter(o=>!o.osOriginal).map(o=>`<option value="${esc(o.id)}">O.S. ${esc(o.numero)} · ${esc(o.cliente)} · ID ${esc(o.id)}</option>`).join('')}</select></label><p>Abra a ficha para criar/indicar a O.S. de correção pelo campo retrabalho da O.S. Abaixo, registre medições da correção existente, uma vez por ID.</p><label>Material (R$) <input name="material" type="number" min="0" step=".01"></label><label>Tempo (horas) <input name="horas" type="number" min="0" step=".01"></label><label>Deslocamento (km) <input name="km" type="number" min="0" step=".01"></label><label>Causa raiz <input name="causa" maxlength="500"></label><label>Plano de prevenção <textarea name="prevencao" maxlength="1000"></textarea></label><p>Vazio significa não medido. Zero só quando medido como zero. Tarifas de hora e km ficam em Configurações.</p></fieldset><label>Responsável por revisar prioridades <input name="dono" value="${esc(cfg.prioridadesPCP?.dono||'')}"></label><button class="btn-primary" type="submit">Confirmar alterações selecionadas</button><p role="status" id="op-revisao-status"></p></form>`);
 /* A prévia do lote (U3): TODAS as descrições sem categoria que a busca pega,
    numa lista com rolagem, cada uma com a caixa marcada; quem confere tira a
    que não é desta categoria. O que fica marcado é o que entra. */
 const previa=d.querySelector('#op-lote-previa'),busca=d.querySelector('[name=loteBusca]'),conta=d.querySelector('#op-lote-conta'),fora=new Set();
 const doLote=()=>OPREV.paraLote(descricoes,busca?busca.value:'',cfg);
 const contar=()=>{const xs=doLote(),n=xs.filter(x=>!fora.has(x)).length;if(conta)conta.textContent=xs.length?`Conferi a lista: classificar ${n===1?'a descrição marcada':`as ${n} descrições marcadas`} nesta categoria.`:'Conferi a lista: classificar as descrições marcadas nesta categoria.';return n;};
 const pintar=()=>{if(!previa||!busca)return;const xs=doLote();
  previa.innerHTML=!busca.value.trim()?'<small>Digite uma palavra (ou o começo dela) para ver as descrições sem categoria que vão ser classificadas.</small>'
   :xs.length?`<p><strong>${xs.length} descriç${xs.length===1?'ão':'ões'} sem categoria:</strong> todas com esta palavra (ou começando por ela). Tire da lista a que não é desta categoria.</p><ul class="op-lote-lista">${xs.map(x=>`<li><label><input type="checkbox" data-lote-item value="${esc(x)}" ${fora.has(x)?'':'checked'}> ${esc(x)}</label></li>`).join('')}</ul>`
   :'<small>Nenhuma descrição sem categoria tem esta palavra (nem começa por ela).</small>';
  contar();};
 if(busca&&previa){busca.oninput=pintar;previa.onchange=ev=>{const t=ev&&ev.target;if(!t||!t.dataset||!('loteItem' in t.dataset))return;if(t.checked)fora.delete(t.value);else fora.add(t.value);contar();};}
 // O "Desfazer este lote": pelo registro do lote, com motivo (U3).
 const lotes=d.querySelector('#op-lotes');
 if(lotes)lotes.onclick=async ev=>{const b=ev&&ev.target&&ev.target.closest?ev.target.closest('[data-lote-desfazer]'):null;if(!b)return;const id=b.dataset.loteDesfazer,campo=d.querySelector(`[data-lote-motivo="${id}"]`);
  // A resposta aparece junto do botão (o status do formulário fica lá embaixo) e no status do formulário.
  const sts=[d.querySelector('#op-revisao-status'),d.querySelector(`[data-lote-status="${id}"]`)].filter(Boolean),dizer=t=>sts.forEach(x=>{x.textContent=t;});
  const r=OPREV.desfazerLote(STORE.getCFG(),id,campo?campo.value:'',STATE.user.nome,new Date().toISOString());
  if(r.erro){dizer(r.erro);return;}
  const v=r.voltam.length,f=r.ficam.length;
  const feito=`Lote desfeito: ${!v?'nenhuma descrição voltou':v===1?'1 descrição voltou':v+' descrições voltaram'} a ficar sem categoria${f?`; ${f===1?'1 descrição já tinha outra classificação, feita depois, e ficou como está':f+' descrições já tinham outra classificação, feita depois, e ficaram como estão'}`:''}.`;
  STORE.saveCFG(r.cfg);dizer(feito+' Sincronizando…');b.disabled=true;
  try{await STORE.trySync();if(STORE.getQueue().length)throw new Error('Alteração pendente de sincronização.');dizer(feito+' Configuração sincronizada.');}catch(e){dizer(perfErroTxt(e));}};
 d.querySelector('[name=correcao]').onchange=ev=>{const m=cfg.medicoesRetrabalho?.[ev.target.value]||{};
  // A original já ligada pelo ID na ficha (item 37, onda operação) vem preenchida.
  const ligada=(STORE.getOS(ev.target.value)||{}).osOriginalId||'';
  for(const k of ['material','horas','km','causa','prevencao','originalId'])d.querySelector('[name='+k+']').value=m[k]??(k==='originalId'?ligada:'');};
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target),novo=structuredClone(STORE.getCFG()),alias=String(fd.get('alias')||''),descricao=String(fd.get('descricao')||'').trim(),id=String(fd.get('correcao')||'');const st=d.querySelector('#op-revisao-status');
  if(alias){const v=veiculos.find(v=>String(v.id)===fd.get('veiculo'));if(!v||!fd.get('confirmaVeiculo')){st.textContent='Confirme a ficha por ID e placa.';return;}novo.veiculosAliases=(novo.veiculosAliases||[]).filter(a=>a.alias!==alias).concat({alias,id:String(v.id),nome:v.nome,placa:v.placa,por:STATE.user.nome,em:new Date().toISOString()});}
  const loteBusca=String(fd.get('loteBusca')||'').trim();
  if(loteBusca){const achadas=OPREV.paraLote(descricoes,loteBusca,cfg),xs=achadas.filter(x=>!fora.has(x)),motivo=String(fd.get('loteMotivo')||'').trim(),categoria=String(fd.get('loteCategoria')||'');
   if(!achadas.length){st.textContent='Nenhuma descrição sem categoria contém esta busca: nada foi classificado.';return;}
   if(!xs.length){st.textContent='Nenhuma descrição ficou marcada na lista: nada foi classificado.';return;}
   if(!OPREV.CATEGORIAS.includes(categoria)){st.textContent='Escolha a categoria do lote.';return;}
   if(OPREV.letras(motivo)<15){st.textContent='Diga o motivo da classificação em lote, com 15 letras ou mais.';return;}
   if(!fd.get('loteConfirma')){st.textContent=`Confira a lista (${xs.length} descriç${xs.length===1?'ão':'ões'}) e marque a confirmação.`;return;}
   /* O registro do lote (lotesCategoria) guarda a busca, a categoria, o
      motivo e as descrições; cada categoria leva o id do lote, para o
      "Desfazer este lote" (U3). O servidor assina autor e hora. */
   const agora=new Date().toISOString(),ja=new Set(xs),lote='lote-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
   novo.categoriasServico=(novo.categoriasServico||[]).filter(x=>!ja.has(x.descricao)).concat(xs.map(d=>({descricao:d,categoria,motivo,lote,por:STATE.user.nome,em:agora})));
   novo.lotesCategoria=(novo.lotesCategoria||[]).concat({id:lote,busca:loteBusca,categoria,motivo,descricoes:xs,por:STATE.user.nome,em:agora});}
  if(descricao){if(!descricoes.includes(descricao)){st.textContent='Escolha uma descrição original existente.';return;}if(!OPREV.CATEGORIAS.includes(String(fd.get('categoria')||''))){st.textContent='Escolha a categoria da descrição.';return;}novo.categoriasServico=(novo.categoriasServico||[]).filter(x=>x.descricao!==descricao).concat({descricao,categoria:String(fd.get('categoria')),por:STATE.user.nome,em:new Date().toISOString()});}
  if(id){const originalId=String(fd.get('originalId')||'');if(!originalId){st.textContent='Selecione a O.S. original por ID para confirmar a correção.';return;}const med={originalId};for(const k of ['material','horas','km'])med[k]=fd.get(k)===''?null:Number(fd.get(k));novo.medicoesRetrabalho={...(novo.medicoesRetrabalho||{}),[id]:{...med,causa:String(fd.get('causa')||''),prevencao:String(fd.get('prevencao')||''),por:STATE.user.nome,em:new Date().toISOString()}};}
  novo.prioridadesPCP={dono:String(fd.get('dono')||'').trim()};STORE.saveCFG(novo);st.textContent='Salvo no aparelho. Sincronizando…';try{await STORE.trySync();if(STORE.getQueue().length)throw new Error('Alteração pendente de sincronização.');st.textContent='Configuração sincronizada. Atualize a vista para consultar.';}catch(e){st.textContent=perfErroTxt(e);}
 };
}
