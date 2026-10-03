'use strict';
// Revisões humanas de cadastro e prioridades determinísticas. Não interpreta nomes como identidade.
const OPREV=(()=>{
 const CATEGORIAS=['Adesivos','Fachadas','Letreiros','Sinalização','Estruturas','Impressos','Outros'];
 const categoria=(o,cfg={})=>{const s=String(o?.servico||'').trim(),m=(cfg.categoriasServico||[]).find(x=>x.descricao===s);return m&&CATEGORIAS.includes(m.categoria)?m.categoria:'Sem categoria';};
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
 return {CATEGORIAS,categoria,custo,custoCorrecao,prioridades};
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
function abrirRevisaoOperacional(){
 if(!perfPodeEditar())return;
 const cfg=STORE.getCFG(),veiculos=veiculosRH(),lista=STORE.getAllOS(),descricoes=[...new Set(lista.map(o=>String(o.servico||'').trim()).filter(Boolean))].sort(),aliases=[...new Set(lista.map(o=>o.veiculo).filter(v=>v&&!OPERACAO.semCarro({veiculo:v})))];
 const d=perfDialog('Conferência operacional',`<p>Alterações de análise e cadastro exigem confirmação. Descrições e registros originais são preservados.</p><form id="op-revisao-form"><fieldset><legend>Veículo · confirmar identidade</legend><label>Nome histórico <select name="alias"><option value="">Não alterar</option>${aliases.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label><label>Ficha por ID e placa <select name="veiculo"><option value="">Selecione</option>${veiculos.filter(v=>v.id&&v.placa).map(v=>`<option value="${esc(v.id)}">${esc(v.nome)} · ${esc(v.placa)} · ID ${esc(v.id)}</option>`).join('')}</select></label><p>Fiat Uno / UNO - 10 e Iveco 40 / caminhão 40 são apenas candidatos. Confirme a placa antes de associar.</p><label><input type="checkbox" name="confirmaVeiculo"> Conferi a placa e reconheço o mesmo veículo.</label></fieldset><fieldset><legend>Categoria controlada · descrição preservada</legend><label>Descrição original <input name="descricao" list="op-descricoes"><datalist id="op-descricoes">${descricoes.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label><label>Categoria <select name="categoria">${OPREV.CATEGORIAS.map(c=>`<option>${c}</option>`).join('')}</select></label><small>Escolha explícita agrupa esta descrição exata; variações permanecem pendentes até confirmação.</small></fieldset><fieldset><legend>Correção ligada à O.S. original</legend><label>ID da O.S. de correção <select name="correcao"><option value="">Não alterar</option>${lista.filter(o=>o.osOriginal).map(o=>`<option value="${esc(o.id)}">O.S. ${esc(o.numero)} → original ${esc(o.osOriginal)} · ID ${esc(o.id)}</option>`).join('')}</select></label><label>Original confirmada por ID <select name="originalId"><option value="">Selecione a O.S. original</option>${lista.filter(o=>!o.osOriginal).map(o=>`<option value="${esc(o.id)}">O.S. ${esc(o.numero)} · ${esc(o.cliente)} · ID ${esc(o.id)}</option>`).join('')}</select></label><p>Abra a ficha para criar/indicar a O.S. de correção pelo campo retrabalho da O.S. Abaixo, registre medições da correção existente, uma vez por ID.</p><label>Material (R$) <input name="material" type="number" min="0" step=".01"></label><label>Tempo (horas) <input name="horas" type="number" min="0" step=".01"></label><label>Deslocamento (km) <input name="km" type="number" min="0" step=".01"></label><label>Causa raiz <input name="causa" maxlength="500"></label><label>Plano de prevenção <textarea name="prevencao" maxlength="1000"></textarea></label><p>Vazio significa não medido. Zero só quando medido como zero. Tarifas de hora e km ficam em Configurações.</p></fieldset><label>Responsável por revisar prioridades <input name="dono" value="${esc(cfg.prioridadesPCP?.dono||'')}"></label><button class="btn-primary" type="submit">Confirmar alterações selecionadas</button><p role="status" id="op-revisao-status"></p></form>`);
 d.querySelector('[name=correcao]').onchange=ev=>{const m=cfg.medicoesRetrabalho?.[ev.target.value]||{};for(const k of ['material','horas','km','causa','prevencao','originalId'])d.querySelector('[name='+k+']').value=m[k]??'';};
 d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(ev.target),novo=structuredClone(STORE.getCFG()),alias=String(fd.get('alias')||''),descricao=String(fd.get('descricao')||'').trim(),id=String(fd.get('correcao')||'');const st=d.querySelector('#op-revisao-status');
  if(alias){const v=veiculos.find(v=>String(v.id)===fd.get('veiculo'));if(!v||!fd.get('confirmaVeiculo')){st.textContent='Confirme a ficha por ID e placa.';return;}novo.veiculosAliases=(novo.veiculosAliases||[]).filter(a=>a.alias!==alias).concat({alias,id:String(v.id),nome:v.nome,placa:v.placa,por:STATE.user.nome,em:new Date().toISOString()});}
  if(descricao){if(!descricoes.includes(descricao)){st.textContent='Escolha uma descrição original existente.';return;}novo.categoriasServico=(novo.categoriasServico||[]).filter(x=>x.descricao!==descricao).concat({descricao,categoria:String(fd.get('categoria')),por:STATE.user.nome,em:new Date().toISOString()});}
  if(id){const originalId=String(fd.get('originalId')||'');if(!originalId){st.textContent='Selecione a O.S. original por ID para confirmar a correção.';return;}const med={originalId};for(const k of ['material','horas','km'])med[k]=fd.get(k)===''?null:Number(fd.get(k));novo.medicoesRetrabalho={...(novo.medicoesRetrabalho||{}),[id]:{...med,causa:String(fd.get('causa')||''),prevencao:String(fd.get('prevencao')||''),por:STATE.user.nome,em:new Date().toISOString()}};}
  novo.prioridadesPCP={dono:String(fd.get('dono')||'').trim()};STORE.saveCFG(novo);st.textContent='Salvo no aparelho. Sincronizando…';try{await STORE.trySync();if(STORE.getQueue().length)throw new Error('Alteração pendente de sincronização.');st.textContent='Configuração sincronizada. Atualize a vista para consultar.';}catch(e){st.textContent=perfErroTxt(e);}
 };
}
