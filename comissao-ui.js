'use strict';
/* Demonstrativo financeiro da gestão. Não persiste valores na fila offline. */
function perfComissaoBotaoHTML() {
  return '<p><button type="button" class="btn-ghost" id="perf-comissao">Comissão · demonstrativo e aprovação</button></p><p class="metricas-nota">Produção e ranking são operacionais. Comissão exige entrega comprovada e decisão documentada; prêmio exige revisão própria.</p>';
}
function perfComissaoWire(el) {
  const b=el.querySelector('#perf-comissao');if(b)b.onclick=()=>perfComissaoAbrir().catch(e=>toast(e.message,'error'));
}
const comissaoRotulo=s=>({sem_falha:'Sem falha comprovada',falha_comprovada:'Falha comprovada',abono:'Abono justificado',pendente:'Pendente',retrabalho_instalacao:'Perda automática: retrabalho de instalação',origem_a_definir:'Pendente: origem do retrabalho a definir',previa:'Prévia',aprovacao:'Aprovação',criterios_documentados:'Critérios revisados',elegivel:'Elegível',inelegivel:'Não elegível',interna:'Montagem interna',externa:'Equipe externa',elegibilidade:'Elegibilidade',identidade:'Identidade da equipe',substituicoes:'Substituições',empates:'Empates',premios:'Prêmios',decisao:'Decisão da gestão'})[s]||s;
const comissaoData=s=>s?new Date(s.length===10?s+'T12:00:00':s).toLocaleString('pt-BR',s.length===10?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'}):'';
const comissaoDinheiro=c=>c==null?'Pendente':dinheiroCasa(c/100);
// Quem fez a prévia, a aprovação ou a compensação, pelo ID de 6 dígitos (item 7 da fila de 11/10/2026); o registro antigo sem o ID mostra só o nome.
/* O TRECHO CURTO DA IMPRESSÃO DIGITAL (revisão da onda comissão, 12/10/2026):
   os PDFs pediam para conferir a impressão digital com o PCP, mas nenhuma tela
   a mostrava, e o PDF trazia o hash de 64 caracteres. Agora a tela do
   fechamento e a da comissão mostram os 8 primeiros caracteres, e o PDF usa o
   mesmo trecho (o completo fica em letra pequena no rodapé). */
function comissaoDigitalCurta(h){const t=String(h||'').trim();return t?t.slice(0,8):'';}
const comissaoDigitalHTML=h=>comissaoDigitalCurta(h)?'<code class="perf-digital">'+esc(comissaoDigitalCurta(h))+'</code>':'';
const comissaoIdTxt=id=>/^\d{6}$/.test(String(id||''))?' (cadastro '+esc(id)+')':'';
/* COMO A APROVAÇÃO FOI FEITA (D-014): titular, substituto (de quem), admin ou pcp (sem configuração, D-013). A aprovação antiga não tem a marca. */
const comissaoComoTxt=r=>{const c=r&&r.tipo==='aprovacao'&&r.autor?r.autor.como:'';return c==='titular'?', titular da aprovação':c==='substituto'?', substituto do titular'+comissaoIdTxt(r.autor.titularId):c==='admin'?', como admin':'';};
/* A REVISÃO SUBSTITUÍDA (item 12 da fila de 11/10/2026): o seletor e o
   demonstrativo mostravam a revisão antiga sem dizer que foi trocada. */
function comissaoSubstituta(r, revisoes) {
  return (Array.isArray(revisoes) ? revisoes : []).filter(x => x && Number(x.revisao) > Number(r && r.revisao)).sort((a, b) => a.revisao - b.revisao)[0] || null;
}
/* O RASTRO DA EXPORTAÇÃO (M6 da auditoria de 11/10/2026): quem exportou,
   quando e a impressão digital do CSV, e a diferença contra a última
   exportada. A coluna "Diferença a conciliar" do CSV é contra a última
   aprovação; o que se paga é a diferença contra a última exportada. */
const comissaoQuem=a=>a?esc(a.nome||a.login||'')+comissaoIdTxt(a.porId):'';
// opcoes.noBloco: o evento que acabou de sair, cuja impressão digital já está no bloco logo abaixo dos botões (uma vez só).
function comissaoExportacoesHTML(r, exportacoes, opcoes={}) {
  const xs=(Array.isArray(exportacoes)?exportacoes:[]).filter(x=>x&&x.revisaoId===r.id);
  const nunca=r.tipo==='aprovacao'&&r.apuracao?.anteriorAprovacao&&!(Array.isArray(exportacoes)?exportacoes:[]).some(x=>x&&x.revisaoId===r.apuracao.anteriorAprovacao);
  const aviso=nunca?`<p class="perf-aviso" role="note">A aprovação anterior deste período nunca foi exportada. A coluna "Diferença a conciliar" do CSV é contra ela: confira o pagamento pela diferença contra a última exportada, abaixo, e não por essa coluna.</p>`:'';
  if(!xs.length)return aviso+(r.tipo==='aprovacao'&&r.apuracao?.config?.modo==='efetivo'?'<p>Esta aprovação ainda não foi exportada.</p>':'');
  return aviso+`<p><strong>Já exportada ${xs.length===1?'1 vez':xs.length+' vezes'}:</strong></p><ul>${xs.map(x=>`<li>${esc(comissaoData(x.em))} · ${comissaoQuem(x.autor)} · ${x.id&&x.id===opcoes.noBloco?'esta, no quadro abaixo dos botões':'impressão digital do CSV '+comissaoDigitalHTML(x.csvSha256)}</li>`).join('')}</ul>`;
}
/* A NOVA TENTATIVA DE EXPORTAR (revisão da onda comissão, 12/10/2026): a
   resposta da exportação se perdeu e a gestão exportou de novo a mesma
   aprovação. O evento novo tem diferença zero (contra a última exportada, que
   é ela mesma), e a tela dizia "pague pela diferença acima" sobre zeros. Agora
   diz que a aprovação já foi exportada, quando e por quem, e que esta não tem
   diferença a pagar. */
function comissaoDiferencasHTML(ev, exportacoes) {
  if(!ev)return '';
  const cab=`<p><strong>Exportação registrada</strong> em ${esc(comissaoData(ev.em))} por ${comissaoQuem(ev.autor)}. Impressão digital do CSV: ${comissaoDigitalHTML(ev.csvSha256)}.</p>`;
  if(ev.anterior&&ev.anterior.revisaoId&&ev.anterior.revisaoId===ev.revisaoId){
    const antes=(Array.isArray(exportacoes)?exportacoes:[]).find(x=>x&&x.id===ev.anterior.id)||ev.anterior;
    return `<div class="comissao-exportacao" role="status">${cab}<p class="perf-aviso" role="note">Esta aprovação já foi exportada em ${esc(comissaoData(antes.em))}${antes.autor?' por '+comissaoQuem(antes.autor):''}: confira se aquele CSV foi recebido; esta nova exportação não tem diferença a pagar.</p></div>`;
  }
  const ds=(ev.diferencas||[]).filter(d=>d.diferencaCentavos);
  const base=ev.anterior?`contra a última exportada (revisão ${esc(ev.anterior.revisao)}, ${esc(comissaoData(ev.anterior.em))})`:'contra zero: é a primeira exportação deste período';
  return `<div class="comissao-exportacao" role="status">${cab}<p>Diferença por pessoa ${base}:</p>${ds.length?`<ul>${ds.map(d=>`<li>${esc(d.nome||d.pessoaId)}${comissaoIdTxt(d.pessoaId)} · ${esc(comissaoRotulo(d.tipo))} · ${comissaoDinheiro(d.anteriorCentavos)} → ${comissaoDinheiro(d.centavos)} · diferença ${comissaoDinheiro(d.diferencaCentavos)}</li>`).join('')}</ul>`:'<p>Nenhuma diferença: o que esta exportação traz já foi exportado.</p>'}${ev.anteriorNaoExportada&&ds.length?'<p class="perf-aviso">A aprovação anterior deste período nunca foi exportada: pague pela diferença acima, e não pela coluna "Diferença a conciliar" do CSV.</p>':''}</div>`;
}
/* RATEIOS, TOTAL POR PESSOA E DIFERENÇAS (revisão da onda comissão,
   12/10/2026): é o papel que se lê para pagar. Cada pessoa com o ID de 6
   dígitos ao lado do nome, o total de cada uma e as diferenças em tabela, com
   os valores inteiros (sem quebrar "R$ 120.000,00" no meio) também no PDF. */
const comissaoPessoaTxt=(nome,id)=>`${esc(nome||'')}${nome?'':esc(id||'')}${comissaoIdTxt(id)}`;
function comissaoPessoasHTML(a, revisoes) {
  const nomes=new Map();
  for(const l of a.linhas||[])for(const p of l.pagamentos||[])if(p&&p.pessoaId&&p.nome&&!nomes.has(p.pessoaId))nomes.set(p.pessoaId,p.nome);
  for(const p of [...(a.pessoas||[]),...(a.ajustes||[])])if(p&&p.pessoaId&&p.nome&&!nomes.has(p.pessoaId))nomes.set(p.pessoaId,p.nome);
  const nomeDe=p=>p.nome||nomes.get(p.pessoaId)||'';
  const num=v=>`<td class="comissao-num">${v}</td>`;
  const tabela=(cab,linhas,rodape='')=>`<div class="casa-tabela-wrap"><table class="casa-tabela comissao-tabela"><thead><tr>${cab.map(([t,n])=>`<th${n?' class="comissao-num"':''}>${t}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody>${rodape}</table></div>`;
  const rateios=(a.linhas||[]).flatMap(l=>(l.pagamentos||[]).map(p=>`<tr><td>${esc(l.numero)}<small class="bloco">${esc(l.entregaId||'Integral')}</small></td><td>${comissaoPessoaTxt(nomeDe(p),p.pessoaId)}</td><td>${esc(comissaoRotulo(p.tipo))}</td>${num(esc((Number(p.cota)/100).toLocaleString('pt-BR'))+'%')}${num(comissaoDinheiro(p.centavos))}</tr>`));
  const porPessoa=new Map();
  for(const p of a.pessoas||[]){const x=porPessoa.get(p.pessoaId)||{pessoaId:p.pessoaId,nome:nomeDe(p),tipos:[],centavos:0};x.tipos.push(comissaoRotulo(p.tipo));x.centavos+=Number(p.centavos)||0;porPessoa.set(p.pessoaId,x);}
  const totais=[...porPessoa.values()].sort((x,y)=>String(x.nome||x.pessoaId).localeCompare(String(y.nome||y.pessoaId),'pt-BR'));
  const somaTotal=totais.reduce((t,x)=>t+x.centavos,0);
  const ajustes=(a.ajustes||[]).slice().sort((x,y)=>String(nomeDe(x)||x.pessoaId).localeCompare(String(nomeDe(y)||y.pessoaId),'pt-BR'));
  return `<h4>Rateios por pessoa e entrega</h4>${rateios.length?tabela([['O.S. / entrega'],['Pessoa'],['Parte'],['Cota da parcela',1],['Valor',1]],rateios):'<p>Nenhum rateio nesta revisão.</p>'}
  <h4>Total por pessoa</h4>${totais.length?tabela([['Pessoa'],['Parte'],['Total',1]],totais.map(x=>`<tr><td>${comissaoPessoaTxt(x.nome,x.pessoaId)}</td><td>${esc([...new Set(x.tipos)].join(' e '))}</td>${num('<strong>'+comissaoDinheiro(x.centavos)+'</strong>')}</tr>`),`<tfoot><tr><th colspan="2">Total da revisão</th><th class="comissao-num">${comissaoDinheiro(somaTotal)}</th></tr></tfoot>`):'<p>Ninguém a receber nesta revisão.</p>'}
  <h4>Diferenças para conciliação</h4><p>${a.anteriorAprovacao?'Comparação com a aprovação anterior'+(()=>{const ant=(Array.isArray(revisoes)?revisoes:[]).find(x=>x&&x.id===a.anteriorAprovacao);return ant?' (revisão '+esc(ant.revisao)+')':'';})()+'.':'Primeira aprovação: valor integral a conferir.'} Exportar não efetua pagamento.</p>${ajustes.length?tabela([['Pessoa'],['Parte'],['Antes',1],['Agora',1],['Diferença',1]],ajustes.map(p=>`<tr><td>${comissaoPessoaTxt(nomeDe(p),p.pessoaId)}</td><td>${esc(comissaoRotulo(p.tipo))}</td>${num(comissaoDinheiro(p.anteriorCentavos||0))}${num(comissaoDinheiro(p.centavos||0))}${num('<strong>'+comissaoDinheiro(p.diferencaCentavos)+'</strong>')}</tr>`)):''}`;
}
// Logo abaixo dos botões, depois de exportar: o arquivo, o aviso e o bloco da exportação, com o trecho curto da impressão digital uma vez só.
function comissaoExportadoHTML(out, antes) {
  const conf=comissaoConferenciaTxt(out&&out.conferencia);
  return `<p>CSV baixado: <b>${esc(out&&out.arquivo||'')}</b>. Exportação para conferência: não realiza pagamento. Não importe de novo sem conciliação.${esc(conf)}</p>${out&&out.exportacao?comissaoDiferencasHTML(out.exportacao,antes):`<p>Impressão digital do CSV: ${comissaoDigitalHTML(out&&out.csvSha256)}.</p>`}`;
}
function comissaoResumoHTML(r, revisoes, exportacoes, opcoes={}) {
  if(!r)return '<p>Ainda não há revisão financeira neste período.</p>';
  const a=r.apuracao, subst=comissaoSubstituta(r,revisoes);
  return `${subst?`<p class="perf-aviso comissao-substituida" role="note"><strong>Revisão ${esc(r.revisao)}, substituída pela ${esc(subst.revisao)}</strong> (${esc(comissaoRotulo(subst.tipo))} de ${esc(comissaoData(subst.em))}). Este demonstrativo é histórico; o que vale é a última revisão.</p>`:''}<h4>Revisão ${esc(r.revisao)}${subst?`, substituída pela ${esc(subst.revisao)}`:''} · ${r.tipo==='aprovacao'?'Aprovada pela gestão':'Prévia para revisão'} · ${a.config.modo==='efetivo'?'Programa efetivo':'Teste, sem exportação para pagamento'}</h4><p>${r.tipo==='aprovacao'?'Aprovada por ':a.compensacaoDe?'Compensação preparada por ':'Prévia de '}${esc(r.autor?.nome)}${comissaoIdTxt(r.autor?.porId)}${comissaoComoTxt(r)} · ${esc(comissaoData(r.em))} · ${esc(r.motivo)}</p>${comissaoDigitalCurta(r.hash)?`<p>Impressão digital desta revisão: ${comissaoDigitalHTML(r.hash)}. É a mesma do PDF do demonstrativo.</p>`:''}${a.compensacaoDe?'<p><strong>Compensação integral da aprovação anterior.</strong> O demonstrativo zera o saldo aprovado deste período e mostra diferenças negativas. Não executa devolução de dinheiro; exige conciliação no financeiro.</p>':''}<p>Comissão apurada: <strong>${comissaoDinheiro(a.totalCentavos)}</strong>${a.pendencias.length?' · total parcial, existem pendências':''}.</p>${a.pendencias.length?`<ul>${a.pendencias.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}${Array.isArray(a.avisos)&&a.avisos.length?`<div class="perf-aviso comissao-avisos" role="note"><p><strong>Pendências de ajuste (não travam a aprovação):</strong></p><ul>${a.avisos.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`:''}
  <div class="casa-tabela-wrap"><table class="casa-tabela comissao-tabela"><thead><tr><th>O.S. / entrega</th><th class="comissao-num">Base líquida</th><th class="comissao-num">Descontos</th><th>Decisão / pontos do programa</th><th class="comissao-num">Comissão</th><th class="comissao-num">Interna</th><th class="comissao-num">Externa</th></tr></thead><tbody>${a.linhas.map(l=>`<tr><td>${esc(l.numero)} · ${esc(comissaoData(l.dia))}<small class="bloco">${esc(l.entregaId||'Integral')} · ${esc(l.origemValor||'')}</small></td><td class="comissao-num">${comissaoDinheiro(l.baseLiquidaCentavos)}</td><td class="comissao-num">${l.descontoCentavos==null?'':comissaoDinheiro(l.descontoCentavos)}<small class="bloco">${esc(l.desconto)}</small></td><td>${esc(comissaoRotulo(l.decisao))} · ${l.pontos==null?'pendente':esc(Number(l.pontos.toFixed(4)).toLocaleString('pt-BR'))}<small class="bloco">${l.pendencias.map(esc).join('; ')}</small></td>${l.decisao==='origem_a_definir'?'<td colspan="3">Pendente: não paga e não perde até a origem ser definida</td>':`<td class="comissao-num">${comissaoDinheiro(l.comissaoCentavos)}</td><td class="comissao-num">${comissaoDinheiro(l.internaCentavos)}</td><td class="comissao-num">${comissaoDinheiro(l.externaCentavos)}</td>`}</tr>`).join('')}</tbody></table></div>
  ${comissaoPessoasHTML(a,revisoes)}${comissaoExportacoesHTML(r,exportacoes,opcoes)}<h4>Reconhecimento: ${esc(comissaoRotulo(a.reconhecimento.situacao))}</h4><p>${esc(a.reconhecimento.aviso)}</p><dl>${Object.entries(a.reconhecimento.criterios).filter(([k])=>k!=='avaliacoes').map(([k,v])=>`<dt>${esc(comissaoRotulo(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl><ul>${(a.reconhecimento.equipes||[]).map(e=>`<li>${esc(e.nome)} · ${e.pendente?'pontos pendentes':esc(Number(e.pontos.toFixed(4)).toLocaleString('pt-BR'))+' O.S. equivalentes elegíveis'} · ${esc(comissaoRotulo(e.situacao))}${e.substituicao?' · houve substituição':''}${e.solo?' · composição solo':''}${e.empate?' · empate':''}<small class="bloco">${esc(e.justificativa)}</small></li>`).join('')}</ul>`;
}
/* O PDF DO DEMONSTRATIVO DA COMISSÃO (item 8 da fila de 11/10/2026): não
   existia. Sai com o documento registrado no servidor, com o número, a
   revisão financeira e a impressão digital dela, e o fechamento com a dele. A
   prévia diz que é prévia; o teste diz que não exporta pagamento. */
function comissaoDocHTML(doc, r) {
  const quando=x=>x?new Date(x).toLocaleString('pt-BR'):'';
  const revHash=doc.revisaoHash||r.hash;
  return `<section class="perf-doc-oficial"><h2>Documento oficial nº ${esc(doc.id)}</h2><dl>
  <dt>Demonstrativo da comissão</dt><dd>Revisão ${esc(r.revisao)} · ${r.tipo==='aprovacao'?'aprovação':'prévia, não aprovada'} · ${r.apuracao?.config?.modo==='efetivo'?'programa efetivo':'teste, sem exportação para pagamento'}</dd>
  <dt>Impressão digital da revisão</dt><dd>${comissaoDigitalHTML(revHash)}</dd>
  <dt>Fechamento</dt><dd>revisão ${esc(doc.fechamentoRevisao)} · impressão digital ${comissaoDigitalHTML(doc.fechamentoHash)}</dd>
  <dt>Emitido por</dt><dd>${comissaoQuem(doc.emitidoPor)} em ${esc(quando(doc.emitidoEm))}</dd></dl>
  ${doc.emitidosAntes?`<p>Esta revisão já teve ${esc(doc.emitidosAntes)} ${doc.emitidosAntes===1?'documento emitido':'documentos emitidos'} antes deste.</p>`:''}
  <p>Para conferir: a impressão digital da revisão tem de ser a mesma que o PCP mostra no diálogo da comissão, e a do fechamento a mesma de Base e fechamento. Este documento não efetua pagamento.</p></section>`;
}
// O rodapé técnico, em letra pequena: os ids internos e as impressões digitais completas, para quem precisar conferir no banco.
function comissaoDocRodapeHTML(doc, r) {
  return `<p class="perf-doc-rodape">Conferência técnica do documento ${esc(doc.id)}: revisão ${esc(r.id)}, impressão digital ${esc(doc.revisaoHash||r.hash||'')}; fechamento ${esc(doc.fechamentoId||r.fechamentoId||'')}, impressão digital ${esc(doc.fechamentoHash||'')}.</p>`;
}
/* O erro do PDF do demonstrativo (revisão da onda comissão, 12/10/2026): toda
   recusa virava "precisa de conexão". Agora, como no PDF oficial do
   fechamento, a mensagem do servidor aparece; "sem conexão" só quando não
   houve resposta. */
function comissaoErroPdf(e) {
  const t=typeof perfErroTxt==='function'?perfErroTxt(e):String(e&&e.message||'Sem conexão com o servidor.');
  return /^Sem conexão/.test(t)?'O PDF do demonstrativo precisa de conexão: o documento é registrado no servidor. '+t:t;
}
async function comissaoPdf(r, revisoes, exportacoes, periodo) {
  if(!r)throw new Error('Selecione uma revisão financeira.');
  let out=null;
  try{out=await STORE.api({action:'performanceDocumento',tipo:'comissao',...periodo,fechamentoId:r.fechamentoId,revisaoId:r.id,requestId:crypto.randomUUID()});}
  catch(e){throw new Error(comissaoErroPdf(e));}
  if(!out||!out.ok||!out.documento)throw new Error((out&&out.error)||'Não foi possível registrar o documento.');
  const copia=document.createElement('section');
  copia.innerHTML=comissaoDocHTML(out.documento,r)+comissaoResumoHTML(r,revisoes,exportacoes)+comissaoDocRodapeHTML(out.documento,r);
  imprimirAnalisePCP('Demonstrativo da comissão · revisão '+r.revisao+' · documento '+out.documento.id,copia,periodo,'Demonstrativo da comissão, revisão '+r.revisao+(r.tipo==='aprovacao'?' (aprovação)':' (prévia)')+'. Documento '+out.documento.id);
  return out.documento;
}
/* O que a porta achou ao conferir o mês fechado (itens 1 e 2 da onda): mudança fora do dinheiro e a O.S. com a origem definida depois. */
function comissaoConferenciaTxt(c) {
  if(!c||c.hashIgual)return '';
  const pend=(c.pendentes||[]).map(x=>x.numero||x.osId);
  return (c.foraDoDinheiro?` ${c.foraDoDinheiro} ${c.foraDoDinheiro===1?'entrega mudou':'entregas mudaram'} depois do fechamento fora do dinheiro: não muda a comissão.`:'')+(pend.length?` Pendente para a próxima revisão ou compensação: O.S. ${pend.join(', ')} (a origem do retrabalho mudou depois do fechamento).`:'');
}
/* QUEM APROVA A COMISSÃO HOJE (D-013 e D-014): a linha no diálogo da
   comissão e a seção em Configurações. A configuração é gravada só pelo admin
   (ação comissaoAprovadorGravar, na hora, fora da fila), sempre com motivo;
   o servidor carimba quem e quando e guarda o diário. */
function comissaoAprovadorQuemTxt(a){
  if(!a||a.modo==='d013'||!a.modo)return 'Quem aprova: a gestão do PCP (pcp ou admin), sem titular designado.';
  const pessoa=(nome,id)=>(nome||'cadastro '+id)+(/^\d{6}$/.test(String(id||''))&&nome?' (cadastro '+id+')':'');
  if(a.modo==='substituto')return `Quem aprova hoje: ${pessoa(a.nome,a.id)}, substituto${a.titularNome||a.titularId?' de '+pessoa(a.titularNome,a.titularId):''}${a.ate?', até '+comissaoDiaBR(a.ate):''}. O admin também aprova.`;
  return `Quem aprova: ${pessoa(a.nome,a.id)}, titular. O admin também aprova.`;
}
const comissaoDiaBR=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
function comissaoAprovadorLinhaHTML(a){
  if(!a)return '';
  return `<p class="comissao-aprovador">${esc(comissaoAprovadorQuemTxt(a))}${a.podeAprovar===false?` <strong>${esc(a.motivo||'Você não aprova a comissão hoje.')}</strong>`:''}</p>`;
}
let comissaoAprovadorDados={carregando:false,dados:null,erro:''};
function comissaoAprovadorSecaoHTML(){
  const papel=String((typeof STATE!=='undefined'&&STATE.user&&STATE.user.papel)||'');
  if(!['admin','pcp'].includes(papel))return '';
  const x=comissaoAprovadorDados,d=x.dados,admin=papel==='admin';
  if(x.erro&&!d)return `<div class="cfg-section" id="cfg-aprovador"><h3>✅ Quem aprova a comissão</h3><p class="text-muted">${esc(x.erro)}</p><button class="btn-ghost btn-sm" type="button" data-aprov-ler>Tentar de novo</button></div>`;
  if(!d)return '<div class="cfg-section" id="cfg-aprovador"><h3>✅ Quem aprova a comissão</h3><p class="text-muted">Consultando…</p></div>';
  const c=d.config,s=c&&c.substituto,v=d.vigente||{};
  const quem=comissaoAprovadorQuemTxt({...v,titularNome:c&&c.titularNome});
  /* QUEM APROVA PELA TELA (P2 da revisão da onda pessoas): o servidor diz
     quais IDs têm acesso pcp com senha ligado à ficha; a lista marca, para o
     admin não escolher em silêncio quem não consegue aprovar. */
  const sabe=Array.isArray(d.aprovamPelaTela),aprovam=new Set(sabe?d.aprovamPelaTela:[]);
  const opcoes=(sel)=>{const ps=(typeof pessoasRH==='function'?pessoasRH():[]).filter(p=>p&&p.ativo!==false&&/^\d{6}$/.test(String(p.id||''))&&!p.idRepetido);return '<option value="">Escolha a pessoa</option>'+ps.map(p=>`<option value="${esc(p.id)}"${p.id===sel?' selected':''}>${esc(p.nome)} · ${esc(p.id)}${sabe?(aprovam.has(p.id)?' · aprova pela tela':' · sem acesso pcp ligado'):''}</option>`).join('');};
  const subTxt=s?`Substituto: ${esc(s.nome||'cadastro '+s.id)} (cadastro ${esc(s.id)}), de ${esc(comissaoDiaBR(s.de))}${s.ate?' até '+esc(comissaoDiaBR(s.ate)):', sem data de fim'}${s.vigente?'':' (fora do prazo agora)'}. Motivo: ${esc(s.motivo||'')}`:'Sem substituto.';
  const diario=(d.diario||[]).slice(0,10).map(e=>`<li>${esc(comissaoData(e.em))} · ${esc(e.por)}${e.porId?' ('+esc(e.porId)+')':''} · ${esc({titular:'titular designado',substituto:'substituto designado',encerrar:'substituto encerrado'}[e.operacao]||e.operacao)}: ${esc(e.operacao==='titular'?(e.titularNome||e.titularId):e.operacao==='substituto'?(e.substitutoNome||e.substitutoId)+' de '+comissaoDiaBR(e.de)+(e.ate?' até '+comissaoDiaBR(e.ate):''):'')} · ${esc(e.motivo)}</li>`).join('');
  /* O RETORNO DA GRAVAÇÃO FICA NO BLOCO QUE FOI GRAVADO (U1 da revisão da
     onda pessoas): o aviso do servidor ("não consegue aprovar pela tela")
     aparece ali, à vista, e não só no toast. */
  const g=d.gravado&&typeof d.gravado==='object'?d.gravado:null,avisos=(d.avisos||[]).map(a=>`<p class="perf-aviso">${esc(a)}</p>`).join('');
  const feito={titular:'Titular designado',substituto:'Substituto designado',encerrar:'Substituto encerrado'};
  const retorno=op=>g&&g.operacao===op?`<div class="aprov-retorno" role="status" data-aprov-retorno><p class="aprov-ok">${esc(feito[op]||'Gravado')}${g.nome||g.id?': '+esc(g.nome||'cadastro '+g.id)+(g.id?' (cadastro '+esc(g.id)+')':''):''}.</p>${avisos}</div>`:'';
  const motivo=`<label class="aprov-campo"><span>Motivo da mudança</span><input name="motivo" minlength="15" maxlength="500" required placeholder="15 letras ou mais"></label>`;
  const rodape=(op,rotulo)=>`<div class="aprov-acoes"><button class="btn-primary btn-sm" type="submit">${rotulo}</button></div><p role="alert" class="aprov-erro"></p>${retorno(op)}`;
  const blocos=admin?`<div class="aprov-blocos">
    <form class="aprov-form" data-aprov-op="titular"><h4>Titular</h4><p class="aprov-desc">Quem aprova a comissão todo mês. Troque só quando a função passar para outra pessoa.</p>
      <label class="aprov-campo"><span>Pessoa</span><select name="pessoa">${opcoes(c&&c.titularId)}</select></label>${motivo}${rodape('titular','Designar titular')}</form>
    <form class="aprov-form" data-aprov-op="substituto"><h4>Substituto</h4><p class="aprov-desc">Aprova no lugar do titular entre o início e o fim (férias, afastamento). Enquanto vale, o titular não aprova; sem fim, vale até ser encerrado.</p>
      <label class="aprov-campo"><span>Pessoa</span><select name="pessoa">${opcoes('')}</select></label>
      <div class="aprov-datas"><label class="aprov-campo"><span>Início</span><input type="date" name="de" value="${esc(d.hoje||'')}"></label><label class="aprov-campo"><span>Fim (opcional)</span><input type="date" name="ate"></label></div>${motivo}${rodape('substituto','Designar substituto')}</form>
    ${s?`<form class="aprov-form" data-aprov-op="encerrar"><h4>Encerrar o substituto</h4><p class="aprov-desc">Devolve a aprovação ao titular a partir de agora. O substituto continua no diário.</p>${motivo}${rodape('encerrar','Encerrar o substituto')}</form>`:''}
  </div>`:'<p class="text-muted">Só o admin designa o titular e o substituto.</p>';
  return `<div class="cfg-section" id="cfg-aprovador"><h3>✅ Quem aprova a comissão</h3>
    <p class="aprov-quem"><strong>${esc(quem)}</strong></p>
    <p class="text-muted">Titular: ${c?esc((c.titularNome||'cadastro '+c.titularId)+' (cadastro '+c.titularId+')'):'nenhum (vale a regra de sempre: pcp e admin aprovam)'}. ${subTxt}</p>
    ${g&&admin?'':avisos}
    ${blocos}
    ${diario?`<details><summary>Diário das mudanças</summary><ul>${diario}</ul></details>`:''}
  </div>`;
}
async function comissaoAprovadorCarregar(repintar){
  if(comissaoAprovadorDados.carregando)return;
  comissaoAprovadorDados={...comissaoAprovadorDados,carregando:true};
  try{const r=await STORE.api({action:'comissaoAprovadorLer'});if(!r||!('vigente' in r))throw new Error((r&&r.error)||'Resposta incompleta.');comissaoAprovadorDados={carregando:false,dados:r,erro:''};}
  catch(e){comissaoAprovadorDados={carregando:false,dados:comissaoAprovadorDados.dados,erro:(e&&e.message)||'Sem conexão com o servidor.'};}
  if(typeof repintar==='function')repintar();
}
function comissaoAprovadorWire(el,repintar){
  const sec=el&&el.querySelector?el.querySelector('#cfg-aprovador'):null;
  if(!sec)return;
  if(!comissaoAprovadorDados.dados&&!comissaoAprovadorDados.carregando&&!comissaoAprovadorDados.erro)comissaoAprovadorCarregar(repintar);
  const ler=sec.querySelector('[data-aprov-ler]');if(ler)ler.onclick=()=>{comissaoAprovadorDados={...comissaoAprovadorDados,erro:''};comissaoAprovadorCarregar(repintar);};
  // Depois de gravar, o retorno (com o aviso do servidor) vem para a vista uma vez.
  if(comissaoAprovadorDados.mostrar){comissaoAprovadorDados={...comissaoAprovadorDados,mostrar:false};const r=sec.querySelector('[data-aprov-retorno]');if(r&&r.scrollIntoView)r.scrollIntoView({block:'center'});}
  sec.querySelectorAll('form[data-aprov-op]').forEach(form=>{form.onsubmit=async ev=>{
    if(ev&&ev.preventDefault)ev.preventDefault();
    const op=form.dataset.aprovOp,campo=n=>form.querySelector(`[name="${n}"]`),val=n=>String((campo(n)&&campo(n).value)||'').trim(),alerta=form.querySelector('.aprov-erro');
    if(alerta)alerta.textContent='';
    const corpo={action:'comissaoAprovadorGravar',operacao:op,motivo:val('motivo'),requestId:crypto.randomUUID()};
    if(op==='titular')corpo.titularId=val('pessoa');
    if(op==='substituto'){corpo.substitutoId=val('pessoa');corpo.de=val('de');if(val('ate'))corpo.ate=val('ate');}
    const botao=form.querySelector('button');if(botao)botao.disabled=true;
    try{const r=await STORE.api(corpo);if(!r||!('vigente' in r))throw new Error((r&&r.error)||'Não foi possível gravar.');comissaoAprovadorDados={carregando:false,dados:{...r,gravado:r.gravado||{operacao:op}},erro:'',mostrar:true};if(typeof toast==='function')toast((r.avisos||[]).length?'Quem aprova a comissão: gravado, com aviso (veja ao lado do bloco).':'Quem aprova a comissão: gravado.',(r.avisos||[]).length?'warn':'success');if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();if(typeof repintar==='function')repintar();}
    catch(e){if(alerta)alerta.textContent=(e&&e.message)||'Não foi possível gravar.';}
    finally{if(botao)botao.disabled=false;}
  };});
}
async function perfComissaoAbrir() {
  const fonte=perfFonteAtual();
  if(!fonte?.fechadoEm)return toast('Selecione uma revisão fechada em Base e fechamento para apurar a comissão.','error');
  const periodo=fonte.periodo||{de:fonte.de,ate:fonte.ate};
  const d=perfDialog('Comissão do período', '<p>Consultando revisões financeiras…</p>');
  d.classList.add('comissao-dialog');
  try {
    const resposta=await STORE.api({action:'performanceComissaoListar',...periodo});
    if(!Array.isArray(resposta.revisoes))throw new Error(resposta.error||'Não foi possível consultar as revisões.');
    const revisoes=resposta.revisoes, ultima=revisoes[0], exportacoes=Array.isArray(resposta.exportacoes)?resposta.exportacoes:[];
    d.querySelector('p')?.remove();
    const corpo=d.querySelector('.perf-dialog-corpo')||d.querySelector('section')||d;
    // O diálogo mantém o botão nativo de fechar; conteúdo criado em um filho próprio.
    const conteudo=document.createElement('div');conteudo.innerHTML=`<p>Fechamento operacional · revisão ${esc(fonte.revisao)}${comissaoDigitalCurta(fonte.hash)?` · impressão digital ${comissaoDigitalHTML(fonte.hash)}`:""}. Cada revisão financeira preserva sua configuração, evidências e decisões. Uma aprovação não efetua pagamento.</p>${comissaoAprovadorLinhaHTML(resposta.aprovador)}<label>Revisão financeira <select id="comissao-versao">${revisoes.map(r=>`<option value="${esc(r.id)}">${r.revisao} · ${esc(comissaoRotulo(r.tipo))} · ${esc(comissaoData(r.em))}${comissaoSubstituta(r,revisoes)?` · substituída pela ${comissaoSubstituta(r,revisoes).revisao}`:''}</option>`).join('')}</select></label><div id="comissao-resumo">${comissaoResumoHTML(ultima,revisoes,exportacoes)}</div><p><button type="button" class="btn-primary" id="comissao-nova">Configurar e criar nova prévia</button> <button type="button" class="btn-ghost" id="comissao-aprovar">Revisar e aprovar</button> <button type="button" class="btn-ghost" id="comissao-compensar">Preparar compensação integral</button> <button type="button" class="btn-ghost" id="comissao-exportar">Exportar para conferência de pagamento</button> <button type="button" class="btn-ghost" id="comissao-pdf">PDF do demonstrativo</button></p><div id="comissao-exportado" class="comissao-exportado" aria-live="polite" hidden></div><p role="alert" id="comissao-erro"></p>`;
    corpo.appendChild(conteudo);
    const sel=conteudo.querySelector('#comissao-versao'),erro=conteudo.querySelector('#comissao-erro');
    const escolhida=()=>revisoes.find(r=>r.id===sel.value)||ultima;
    sel.onchange=()=>{conteudo.querySelector('#comissao-resumo').innerHTML=comissaoResumoHTML(escolhida(),revisoes,exportacoes);};
    conteudo.querySelector('#comissao-nova').onclick=()=>comissaoEditar(fonte,ultima,periodo,d,resposta.pessoas||[],revisoes);
    conteudo.querySelector('#comissao-aprovar').onclick=()=>{
      const r=escolhida(),e=COMISSAO.erroAprovacao(r,r?.hash,true);
      // Quem não é a vez de aprovar (D-014) sabe na hora; a porta confere de novo.
      if(resposta.aprovador&&resposta.aprovador.podeAprovar===false){erro.textContent=resposta.aprovador.motivo||'Você não aprova a comissão hoje.';return;}
      if(e||r!==ultima){erro.textContent=e||'Apenas a última prévia pode ser aprovada.';return;}
      const confirmar=perfDialog('Aprovar demonstrativo',`<form><p>Revisão ${r.revisao}: ${comissaoDinheiro(r.apuracao.totalCentavos)}. ${r.apuracao.config.modo==='teste'?'Teste, sem exportação para pagamento.':'Programa efetivo.'} ${r.apuracao.compensacaoDe?'Esta compensação zera o saldo anterior e gera diferenças negativas para conciliação.':'Confira os rateios e as evidências antes de aprovar.'}</p><label>Justificativa da aprovação <textarea name="motivo" required minlength="5" maxlength="500"></textarea></label><label><input name="confirmacao" type="checkbox" required> Revisei a entrega física, a responsabilidade, os cadastros e os centavos do demonstrativo.</label><button class="btn-primary" type="submit">Confirmar aprovação</button><p role="alert"></p></form>`);
      confirmar.classList.add('comissao-dialog');
      confirmar.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,btn=form.querySelector('button');btn.disabled=true;try{const out=await STORE.api({action:'performanceComissaoAprovar',...periodo,anterior:r.id,hash:r.hash,motivo:form.elements.motivo.value,confirmacao:form.elements.confirmacao.checked,requestId:crypto.randomUUID()});if(!out.ok)throw new Error(out.error);if(typeof perdasInvalidar==='function')perdasInvalidar();if(typeof perfMesesInvalidar==='function')perfMesesInvalidar();confirmar.close();await perfComissaoAbrir();}catch(e){form.querySelector('[role="alert"]').textContent=e.message;}finally{btn.disabled=false;}};
    };
    conteudo.querySelector('#comissao-compensar').onclick=()=>{
      const r=escolhida();if(r?.tipo!=='aprovacao'||r.apuracao.compensacaoDe){erro.textContent='Selecione a aprovação ativa que precisa ser compensada.';return;}
      const dialogo=perfDialog('Preparar compensação integral',`<form><p>A prévia compensará toda a aprovação selecionada de ${comissaoDinheiro(r.apuracao.totalCentavos)} neste período. Os registros antigos continuam preservados. Depois da aprovação humana, as diferenças negativas deverão ser conciliadas no financeiro; nenhuma devolução será executada automaticamente.</p><label>Motivo da compensação<textarea name="motivo" required minlength="5" maxlength="500"></textarea></label><button type="submit" class="btn-primary">Criar prévia de compensação</button><p role="alert"></p></form>`);dialogo.classList.add('comissao-dialog');
      dialogo.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,btn=form.querySelector('button');btn.disabled=true;try{const out=await STORE.api({action:'performanceComissaoNova',...periodo,anterior:ultima.id,compensarId:r.id,motivo:form.elements.motivo.value,requestId:crypto.randomUUID()});if(!out.ok)throw new Error(out.error);if(typeof perdasInvalidar==='function')perdasInvalidar();if(typeof perfMesesInvalidar==='function')perfMesesInvalidar();dialogo.close();await perfComissaoAbrir();}catch(e){form.querySelector('[role="alert"]').textContent=e.message;}finally{btn.disabled=false;}};
    };
    conteudo.querySelector('#comissao-pdf').onclick=async()=>{try{erro.textContent='';await comissaoPdf(escolhida(),revisoes,exportacoes,periodo);}catch(e){erro.textContent=e.message;}};
    conteudo.querySelector('#comissao-exportar').onclick=async()=>{try{const r=escolhida();const out=await STORE.api({action:'performanceComissaoExportar',...periodo,id:r?.id});if(!out.ok)throw new Error(out.error);const url=URL.createObjectURL(new Blob([out.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=out.arquivo;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);erro.textContent='';const antes=exportacoes.slice();if(out.exportacao){if(typeof perfMesesInvalidar==='function')perfMesesInvalidar();exportacoes.push(out.exportacao);conteudo.querySelector('#comissao-resumo').innerHTML=comissaoResumoHTML(escolhida(),revisoes,exportacoes,{noBloco:out.exportacao.id});}const caixa=conteudo.querySelector('#comissao-exportado');caixa.innerHTML=comissaoExportadoHTML(out,antes);caixa.hidden=false;if(typeof caixa.scrollIntoView==='function')caixa.scrollIntoView({block:'nearest'});}catch(e){erro.textContent=e.message;}};
  }catch(e){d.appendChild(Object.assign(document.createElement('p'),{textContent:e.message}));}
}
/* O RASCUNHO AUTOMÁTICO DA APURAÇÃO DA COMISSÃO (item 9 da fila de
   11/10/2026; entrou nesta onda com a resposta "THIAGO APROVA", D-013). É o
   formulário mais longo do PCP (cerca de 14 campos por entrega), e salvar a
   prévia cria revisão que não se apaga: não serve de rascunho. O que se digita
   fica guardado neste aparelho, na mesma base dos rascunhos dos diálogos
   (IndexedDB, pela conta, apagada ao sair, 7 dias), com a chave do período e
   do fechamento: outro fechamento não recebe o rascunho. Guarda os campos com
   o nome, as caixas marcadas e quantas pessoas há em cada rateio; nada de
   R$ (a prévia não tem campo de valor). Volta ao reabrir, com o aviso e o
   Descartar; some quando a prévia é salva. */
function comissaoRascunhoLigar(form, chaveId, opt = {}) {
  const nada = { limpar() {}, sujo: () => false, mudou() {}, descartar() {} };
  if (!form || !chaveId || typeof form.querySelectorAll !== 'function' || typeof lerRascunhoF24 !== 'function' || typeof gravarRascunhoF24 !== 'function' || typeof chaveRascunhoF24 !== 'function') return nada;
  const chave = chaveRascunhoF24('comissao-previa', chaveId);
  const campos = () => Array.from(form.querySelectorAll('input[name], textarea[name], select[name]')).filter(el => !['hidden', 'file', 'password', 'submit', 'button'].includes(String(el.type || '').toLowerCase()));
  const ler = () => {
    const valores = {}, linhas = {};
    for (const el of campos()) (valores[el.name] = valores[el.name] || []).push(String(el.type || '').toLowerCase() === 'checkbox' ? (el.checked ? '1' : '') : String(el.value ?? ''));
    for (const fs of Array.from(form.querySelectorAll('[data-rateio]'))) linhas[fs.dataset.rateio] = fs.querySelectorAll('[data-rateio-linha]').length;
    return { valores, linhas };
  };
  const aplicar = r => {
    for (const fs of Array.from(form.querySelectorAll('[data-rateio]'))) {
      const n = Number(r.linhas && r.linhas[fs.dataset.rateio]);
      if (!Number.isInteger(n) || n < 0 || n > 50) continue;
      let atuais = Array.from(fs.querySelectorAll('[data-rateio-linha]'));
      while (atuais.length < n && typeof opt.adicionarLinha === 'function') { opt.adicionarLinha(fs.dataset.rateio); const depois = Array.from(fs.querySelectorAll('[data-rateio-linha]')); if (depois.length === atuais.length) break; atuais = depois; }
      for (const l of atuais.slice(n)) if (typeof l.remove === 'function') l.remove();
    }
    const vistos = {};
    for (const el of campos()) {
      const xs = r.valores && r.valores[el.name];
      const i = vistos[el.name] = (vistos[el.name] ?? -1) + 1;
      if (!Array.isArray(xs) || i >= xs.length) continue;
      const v = String(xs[i] ?? '');
      if (String(el.type || '').toLowerCase() === 'checkbox') { el.checked = v === '1'; continue; }
      if (String(el.tagName).toUpperCase() === 'SELECT' && !Array.from(el.options || []).some(o => o.value === v)) continue;
      el.value = v;
    }
  };
  const inicial = ler(), txtInicial = JSON.stringify(inicial);
  let timer = null, vivo = true, aviso = null, tocou = false;
  const guardar = () => {
    timer = null; if (!vivo) return;
    const atual = ler();
    gravarRascunhoF24(chave, JSON.stringify(atual) === txtInicial ? null : { em: new Date().toISOString(), ...atual });
  };
  const mudou = () => { tocou = true; if (timer) clearTimeout(timer); timer = setTimeout(guardar, 400); };
  const descartar = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    aplicar(inicial); gravarRascunhoF24(chave, null);
    if (aviso && typeof aviso.remove === 'function') aviso.remove();
    aviso = null;
  };
  if (typeof form.addEventListener === 'function') { form.addEventListener('input', mudou); form.addEventListener('change', mudou); }
  lerRascunhoF24(chave).then(r => {
    if (!vivo || tocou || !r || typeof r !== 'object' || !r.valores || typeof r.valores !== 'object') return;
    const t = Date.parse(String(r.em || '')), validade = typeof RASC_VALIDADE_MS === 'number' ? RASC_VALIDADE_MS : 7 * 24 * 3600 * 1000;
    if (!Number.isFinite(t) || Date.now() - t > validade) { gravarRascunhoF24(chave, null); return; }
    if (JSON.stringify({ valores: r.valores, linhas: r.linhas || {} }) === txtInicial) return;
    aplicar(r);
    if (typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof form.insertBefore === 'function') {
      aviso = document.createElement('p');
      aviso.className = 'rasc-aviso'; aviso.setAttribute('role', 'status');
      const txt = document.createElement('span');
      txt.textContent = 'Voltou o que você tinha digitado nesta apuração (de ' + new Date(t).toLocaleString('pt-BR') + ') e não chegou a salvar como prévia.';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-ghost btn-sm rasc-descartar'; b.textContent = 'Descartar';
      b.onclick = descartar;
      if (typeof aviso.append === 'function') aviso.append(txt, ' ', b); else aviso.textContent = txt.textContent;
      form.insertBefore(aviso, form.firstChild);
    }
    if (typeof opt.aoRecuperar === 'function') opt.aoRecuperar();
  });
  return { limpar() { vivo = false; if (timer) { clearTimeout(timer); timer = null; } gravarRascunhoF24(chave, null); }, sujo: () => JSON.stringify(ler()) !== txtInicial, mudou, descartar };
}
/* A PRÉVIA DEPOIS DE UMA COMPENSAÇÃO ABRE PREENCHIDA (linha Baixa da
   auditoria de 11/10/2026): a última revisão era a compensação, cuja entrada
   é só {compensarId}, e a prévia nova abria em branco e em Teste (o servidor
   recusa aprovar em branco). Agora vale a entrada da revisão mais nova que
   tem configuração; a compensação não muda as decisões nem as evidências. */
function comissaoEntradaBase(revisoes, ultima) {
  const tem=r=>!!(r&&r.entrada&&typeof r.entrada==='object'&&r.entrada.config&&typeof r.entrada.config==='object');
  if(tem(ultima))return {revisao:ultima,entrada:ultima.entrada};
  const r=(Array.isArray(revisoes)?revisoes:[]).filter(tem).sort((a,b)=>(Number(b.revisao)||0)-(Number(a.revisao)||0))[0]||null;
  return {revisao:r,entrada:r?r.entrada:{}};
}
function comissaoEditar(fonte,ultima,periodo,pai,pessoas=[],revisoes=[]) {
  const base=comissaoEntradaBase(revisoes,ultima), anterior=base.entrada||{},config=anterior.config||{},rs=fonte.registros;
  const preenchida=base.revisao&&base.revisao!==ultima?`<p class="perf-aviso neutro" role="note">Preenchida com a revisão ${esc(base.revisao.revisao)} (a última com configuração): a compensação não muda as decisões nem as evidências. Confira antes de salvar.</p>`:'';
  const campo=(nome,rotulo,valor='',tipo='text')=>`<label>${rotulo}<input name="${nome}" type="${tipo}" ${tipo==='number'?'step="0.01" min="0" max="100"':''} value="${esc(valor??'')}"></label>`;
  const area=(nome,rotulo,valor='')=>`<label>${rotulo}<textarea name="${nome}" maxlength="2000">${esc(valor||'')}</textarea></label>`;
  const selecao=(nome,rotulo,valor,opcoes)=>`<label>${rotulo}<select name="${nome}">${opcoes.map(([v,t])=>`<option value="${v}" ${v===valor?'selected':''}>${t}</option>`).join('')}</select></label>`;
  const doc=(prefixo,d={})=>campo(prefixo+'origem','Origem (documento, foto, vistoria)',d.origem)+area(prefixo+'evidencia','Evidência (referência verificável)',d.evidencia)+area(prefixo+'justificativa','Decisão / justificativa',d.justificativa);
  const pessoa=(nome,rotulo,id='')=>`<label>${rotulo}<select name="${nome}"><option value="">Selecione a pessoa</option>${pessoas.map(p=>`<option value="${esc(p.id)}" ${p.id===id?'selected':''}>${esc(p.nome)} · cadastro ${esc(p.id)}</option>`).join('')}</select></label>`;
  const linhaRateio=(prefixo,p={})=>`<div data-rateio-linha>${pessoa(prefixo+'pessoa','Pessoa',p.pessoaId)}${campo(prefixo+'percentual','Participação (%)',p.cota==null?'':p.cota/100,'number')}<button type="button" class="btn-ghost" data-rateio-remover>Remover pessoa</button></div>`;
  const rateio=(prefixo,rotulo,ps=[])=>`<fieldset data-rateio="${prefixo}"><legend>${rotulo}</legend><div data-rateio-linhas>${ps.map(p=>linhaRateio(prefixo,p)).join('')}</div><button type="button" class="btn-ghost" data-rateio-adicionar="${prefixo}">Adicionar pessoa</button><p>As participações precisam somar 100%. A gestão confirma esta regra na aprovação.</p></fieldset>`;
  const gruposReconhecimento=COMISSAO.apurar(fonte,anterior).reconhecimento.equipes;
  /* As O.S. com retrabalho, atraso ou retorno antecipado vêm primeiro, e a
     busca acha pelo tipo (revisão da onda w3, U3): com 79 conferências em 8
     páginas, a O.S. a julgar ficava fora da primeira. A ordem vale para o
     desenho e para a gravação (o índice de cada campo é o da lista mostrada). */
  const os=[...new Map(rs.map(r=>[r.osId||r.id,r])).values()];
  const ocDe=new Map(os.map(r=>[r.osId||r.id,typeof perdasOcorrenciaDaOS==='function'?perdasOcorrenciaDaOS(r.osId||r.id,rs):null]));
  const temOc=r=>{const oc=ocDe.get(r.osId||r.id);return oc&&oc.tipos.length?1:0;};
  os.sort((a,b)=>temOc(b)-temOc(a));
  /* A RÉGUA DAS PERDAS NO SELO (D-010): a O.S. com retrabalho de instalação é
     perda automática (o motor zera, sem pedir decisão, conferência da entrega,
     rateio nem montagem interna); a de origem a definir fica pendente até a
     gestão definir a origem na ficha e fechar o período de novo. Selo de antes
     da régua não traz a marca. */
  const comRegua=!!fonte.regraPerdas, mesmaOS=(r,id)=>(r.osId||r.id)===id;
  const perdeOS=id=>comRegua&&rs.some(r=>mesmaOS(r,id)&&r.perda==='retrabalho_instalacao');
  const aDefinirOS=id=>comRegua&&rs.some(r=>mesmaOS(r,id)&&r.retrabalho===true&&!r.perda&&Object.prototype.hasOwnProperty.call(r,'etapaOrigem')&&!r.etapaOrigem);
  const textos=typeof REGRAS!=='undefined'&&REGRAS&&REGRAS.TEXTOS_PERDA?REGRAS.TEXTOS_PERDA:{};
  const txtPerda=(textos.retrabalhoInstalacao||'Retrabalho de instalação: tira os pontos e a comissão desta O.S.')+' Perda automática: não pede decisão aqui. '+(textos.naoSeAbona||'Retrabalho de instalação não se abona: quem discorda da origem troca a origem, com motivo')+'; depois, feche o período de novo.';
  // A origem a definir não trava o demonstrativo (revisão da onda a3): só esta O.S. fica pendente. A frase é a do motor.
  const txtDefinir=COMISSAO.TEXTO_ORIGEM_A_DEFINIR||'Retrabalho com origem a definir: esta O.S. fica pendente (não paga e não perde) e não trava o demonstrativo. Defina a origem na ficha: ela entra numa revisão seguinte (feche o período de novo e gere nova prévia).';
  const d=perfDialog('Configurar apuração da comissão',`<form>${preenchida}<p>Regra desta revisão: 1% do líquido entregue elegível; 20% internos quando elegíveis; restante da dupla 60% montador e 40% auxiliar. Retrabalho de instalação é perda automática da O.S.; atraso e retorno antecipado ficam registrados e só cortam se a gestão julgar falha comprovada aqui. Valores da entrega já incluem descontos; não digite valores monetários aqui. Campos vazios geram pendência, sem aprovação automática.</p>
  ${selecao('modo','Situação do programa',config.modo||'teste',[['teste','Teste: sem pagamento'],['efetivo','Efetivo: exige decisão da gestão']])}${campo('inicio','Início efetivo autorizado',config.inicioEfetivo,'date')}${area('gestao','Decisão da gestão sobre início',config.decisaoGestao)}<label><input type="checkbox" name="extras" ${config.criteriosExtras==='somente_falha_comprovada'?'checked':''}> Confirmo a régua: atraso e retorno antecipado são ocorrências registradas e só zeram pontos e comissão da O.S. com falha comprovada da instalação, decidida aqui; o retrabalho de instalação zera sozinho.</label>
  <details><summary>Configuração do reconhecimento (não escolhe campeão)</summary>${['elegibilidade','identidade','substituicoes','empates','premios','decisao'].map(k=>area('rec_'+k,{elegibilidade:'Equipes elegíveis, solo e composições avulsas',identidade:'Identidade da equipe durante o período',substituicoes:'Tratamento de substituições',empates:'Tratamento de empates',premios:'Prêmios autorizados e período aplicável',decisao:'Validação humana dos critérios'}[k],config.reconhecimento?.[k])).join('')}${gruposReconhecimento.map((g,i)=>`<fieldset><legend>${esc(g.nome)}${g.substituicao?' · substituição no período':''}${g.solo?' · solo':''}</legend><p>Composições preservadas: ${g.composicoes.map(ids=>ids.map(id=>esc(pessoas.find(p=>p.id===id)?.nome||id)).join(' + ')).join('; ')}</p>${selecao('req'+i,'Elegibilidade para reconhecimento',config.reconhecimento?.avaliacoes?.[g.chave]?.situacao,[['pendente','Pendente de decisão'],['elegivel','Elegível após revisão'],['inelegivel','Não elegível após revisão']])}${area('reqj'+i,'Justificativa',config.reconhecimento?.avaliacoes?.[g.chave]?.justificativa)}</fieldset>`).join('')}<p>Campeão e prêmio permanecem sujeitos a revisão específica. Nenhum vencedor anual é inferido deste período.</p></details>
  <label>Buscar O.S., cliente, pessoa ou ocorrência <input type="search" data-comissao-busca></label>${os.some(temOc)?'<p>As O.S. com retrabalho, atraso ou retorno antecipado vêm primeiro. Para ver só essas, busque por "ocorrência".</p>':''}<p data-comissao-contagem></p><button type="button" class="btn-ghost" data-comissao-anterior>Anterior</button> <button type="button" class="btn-ghost" data-comissao-proxima>Próximas 10 conferências</button>
  ${os.map((r,i)=>{const id=r.osId||r.id,x=anterior.decisoes?.[id]||{},oc=ocDe.get(id),busca=esc(r.numero+' '+(r.cliente||'')+(oc&&oc.tipos.length?' ocorrência ocorrencia '+perdasTiposTxt(oc):''));
    if(perdeOS(id))return `<details data-comissao-item data-busca="${busca} perda retrabalho de instalação"><summary>Responsabilidade · O.S. ${esc(r.numero)} · ${esc(comissaoRotulo('retrabalho_instalacao'))}</summary><fieldset><legend>Perda automática</legend><p class="comissao-perda-auto">${esc(txtPerda)}</p>${oc?perdasJulgadaHTML(oc):''}</fieldset></details>`;
    return `<details data-comissao-item data-busca="${busca}${aDefinirOS(id)?' origem a definir':''}"><summary>Responsabilidade · O.S. ${esc(r.numero)}${oc&&oc.tipos.length?' · '+esc(perdasTiposTxt(oc)):''}${aDefinirOS(id)?' · origem a definir':''} · ${esc(comissaoRotulo(x.decisao||'pendente'))}</summary><fieldset><legend>Decisão sobre responsabilidade</legend>${aDefinirOS(id)?`<p class="comissao-origem-definir" role="note">${esc(txtDefinir)}</p>`:''}${oc?perdasJulgadaHTML(oc):''}${selecao('os'+i+'decisao','Decisão',x.decisao,[['pendente','Pendente'],['sem_falha','Sem falha comprovada após análise'],['falha_comprovada','Falha comprovada da instalação'],['abono','Abono justificado']])}${selecao('os'+i+'tipo','Tipo / origem da ocorrência',x.tipo,[['nenhuma','Nenhuma ocorrência após conferência'],['producao','Falha da produção'],['cliente','Mudança do cliente'],['incompleto','Serviço incompleto'],['ma_conducao','Má condução'],['atraso','Atraso'],['retorno_antecipado','Retorno antecipado'],['outra','Outra']])}${doc('os'+i,x)}</fieldset></details>`;}).join('')}
  ${rs.map((r,i)=>{const e=anterior.entregas?.[r.id]||{},interna=e.interna||{},gs=r.grupos?.length?r.grupos:[{membros:r.membros.map(m=>m.chave),cota:10000}];
    if(comRegua&&r.perda==='retrabalho_instalacao')return `<details data-comissao-item data-busca="${esc(r.numero+' '+(r.cliente||'')+' perda retrabalho de instalação')}"><summary>Entrega · O.S. ${esc(r.numero)} · ${esc(comissaoData(r.dia))} · perda automática</summary><fieldset><legend>Entrega e participantes</legend><p>Retrabalho de instalação: esta entrega não paga comissão a ninguém, nem a parcela da montagem interna. Não é preciso conferir a entrega, o rateio nem a montagem interna.</p></fieldset></details>`;
    return `<details data-comissao-item data-busca="${esc(r.numero+' '+(r.cliente||'')+' '+r.membros.map(m=>m.nome).join(' '))}"><summary>Entrega · O.S. ${esc(r.numero)} · ${esc(comissaoData(r.dia))} · ${e.entregue?'conferência registrada':'pendente'}</summary><fieldset><legend>Entrega e participantes</legend><p>Base líquida preservada: ${comissaoDinheiro(Math.round(r.valor*100))}</p><label><input type="checkbox" name="e${i}entregue" ${e.entregue?'checked':''}> Entrega física comprovada</label>${doc('e'+i,e)}${r.membros.filter(m=>!/^\d{6}$/.test(m.chave)).map((m,j)=>pessoa('e'+i+'id'+j,`Resolver cadastro “${esc(m.nome)}”`,e.identidades?.[m.chave])).join('')}
  ${gs.map((g,j)=>{const x=e.grupos?.[j]||{};return `<h4>Equipe ${j+1} · ${g.cota/100}% da entrega</h4><p>${g.membros.map(ch=>{const p=r.membros.find(m=>String(m.chave)===String(ch));return esc(p?.nome||ch)+' · '+esc(ch);}).join(' / ')}</p>${g.membros.length===2?pessoa('e'+i+'g'+j+'montador','Montador (60%; auxiliar recebe 40%)',x.montadorId):rateio('e'+i+'g'+j+'partes','Participação de cada pessoa',x.partes)+area('e'+i+'g'+j+'justificativa','Justificativa do rateio solo, trio ou maior',x.justificativa)}`;}).join('')}
  ${selecao('e'+i+'interna','Montagem interna',interna.situacao,[['pendente','Pendente de análise'],['elegivel','Elegível: reservar 20%'],['impeditivo','Retrabalho impeditivo: a parcela fica com a externa'],['nao_aplicavel','Não aplicável: a parcela fica com a externa']])}${doc('e'+i+'int',interna)}${rateio('e'+i+'internas','Participação da montagem interna',interna.partes)}</fieldset></details>`;}).join('')}
  ${area('motivo','Motivo desta revisão')}<button class="btn-primary" type="submit">Salvar prévia calculada no servidor</button><p role="alert"></p></form>`);
  d.classList.add('comissao-dialog');
  const adicionarLinha=prefixo=>{const fs=d.querySelector(`[data-rateio="${prefixo}"]`),linhas=fs&&fs.querySelector('[data-rateio-linhas]');if(linhas)linhas.insertAdjacentHTML('beforeend',linhaRateio(prefixo));};
  // O rascunho desta apuração: período e fechamento (item 9 da fila de 11/10/2026).
  const rasc=comissaoRascunhoLigar(d.querySelector('form'),periodo.de+':'+periodo.ate+':'+fonte.id,{adicionarLinha});
  d.querySelectorAll('[data-rateio-adicionar]').forEach(b=>b.onclick=()=>{adicionarLinha(b.dataset.rateioAdicionar);rasc.mudou();});
  d.onclick=ev=>{if(ev.target.matches('[data-rateio-remover]')){ev.target.closest('[data-rateio-linha]')?.remove();rasc.mudou();}};
  let pagina=0;
  const filtrar=()=>{const busca=d.querySelector('[data-comissao-busca]').value.toLocaleLowerCase('pt-BR'),itens=[...d.querySelectorAll('[data-comissao-item]')],visiveis=itens.filter(e=>e.dataset.busca.toLocaleLowerCase('pt-BR').includes(busca));pagina=Math.min(pagina,Math.max(0,Math.ceil(visiveis.length/10)-1));itens.forEach(e=>e.hidden=true);visiveis.slice(pagina*10,pagina*10+10).forEach(e=>e.hidden=false);d.querySelector('[data-comissao-contagem]').textContent=`${visiveis.length} conferências · página ${pagina+1} de ${Math.max(1,Math.ceil(visiveis.length/10))}`;d.querySelector('[data-comissao-anterior]').disabled=pagina===0;d.querySelector('[data-comissao-proxima]').disabled=(pagina+1)*10>=visiveis.length;};
  d.querySelector('[data-comissao-busca]').oninput=()=>{pagina=0;filtrar();};d.querySelector('[data-comissao-anterior]').onclick=()=>{pagina--;filtrar();};d.querySelector('[data-comissao-proxima]').onclick=()=>{pagina++;filtrar();};filtrar();
  d.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();const form=ev.currentTarget,btn=form.querySelector('button[type="submit"]');btn.disabled=true;
    const v=n=>form.elements[n]?.value?.trim()||'',ck=n=>form.elements[n]?.checked===true;
    const documento=p=>({origem:v(p+'origem'),evidencia:v(p+'evidencia'),justificativa:v(p+'justificativa')});
    const partes=n=>[...form.querySelectorAll(`[data-rateio="${n}"] [data-rateio-linha]`)].map(l=>({pessoaId:l.querySelector('select').value,cota:Math.round(Number(l.querySelector('input').value)*100)}));
    const entrada={config:{modo:v('modo'),inicioEfetivo:v('inicio'),decisaoGestao:v('gestao'),criteriosExtras:ck('extras')?'somente_falha_comprovada':'pendente',reconhecimento:Object.fromEntries(['elegibilidade','identidade','substituicoes','empates','premios','decisao'].map(k=>[k,v('rec_'+k)]))},decisoes:{},entregas:{}};
    entrada.config.reconhecimento.avaliacoes=Object.fromEntries(gruposReconhecimento.map((g,i)=>[g.chave,{situacao:v('req'+i),justificativa:v('reqj'+i)}]));
    // A perda automática (D-010) não leva decisão nem conferência da entrega: o motor não as pede.
    os.forEach((r,i)=>{if(!perdeOS(r.osId||r.id))entrada.decisoes[r.osId||r.id]={...documento('os'+i),decisao:v('os'+i+'decisao'),tipo:v('os'+i+'tipo')};});
    rs.forEach((r,i)=>{if(comRegua&&r.perda==='retrabalho_instalacao')return;const gs=r.grupos?.length?r.grupos:[{membros:r.membros.map(m=>m.chave)}];entrada.entregas[r.id]={...documento('e'+i),entregue:ck('e'+i+'entregue'),identidades:Object.fromEntries(r.membros.filter(m=>!/^\d{6}$/.test(m.chave)).map((m,j)=>[m.chave,v('e'+i+'id'+j)])),grupos:gs.map((g,j)=>({montadorId:v('e'+i+'g'+j+'montador'),partes:partes('e'+i+'g'+j+'partes'),justificativa:v('e'+i+'g'+j+'justificativa')})),interna:{...documento('e'+i+'int'),situacao:v('e'+i+'interna'),partes:partes('e'+i+'internas')}};});
    try{const out=await STORE.api({action:'performanceComissaoNova',...periodo,fechamentoId:fonte.id,anterior:ultima?.id||'',entrada,motivo:v('motivo'),requestId:crypto.randomUUID()});if(!out.ok)throw new Error(out.error);rasc.limpar();if(typeof perdasInvalidar==='function')perdasInvalidar();if(typeof perfMesesInvalidar==='function')perfMesesInvalidar();d.close();await perfComissaoAbrir();}catch(e){form.querySelector('[role="alert"]').textContent=e.message;}finally{btn.disabled=false;}
  };
}
