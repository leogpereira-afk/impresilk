'use strict';
/* PERDAS POR RETRABALHO (pedido do dono, 11/10/2026: "a que perdeu por
   retrabalho, essa parte precisa de uma aba e um ponto de atenção
   importante"; fila do PCP, "Já combinado 4" e itens 14 e 26; auditoria da
   v164, M10, M1 e A3).

   SÓ LEITURA. Uma linha por O.S. do período com retrabalho, atraso ou
   retorno antecipado: o que aconteceu (pela ficha), o que a comissão decidiu
   (pela última revisão do demonstrativo do período) e o efeito de hoje. Nada
   aqui inventa conta de ponto ou de comissão:
   - a decisão é a que o motor da comissão (comissao.js) leu. Decisão sem
     documento é pendência dele, e aqui fica "a decidir pela gestão";
   - o valor que deixa de pontuar é a base líquida da linha da apuração;
   - a comissão perdida é o MESMO motor rodado sobre a MESMA revisão, trocando
     só a falha comprovada por "sem falha".
   A REGRA ESTÁ EM ABERTO (A3): retrabalho e atraso tiram pontos e comissão
   sozinhos, ou só com falha comprovada? Até a resposta, a O.S. sem decisão
   diz "a decidir pela gestão" e não perde nada.

   DUAS RÉGUAS DE ATRASO (M3 e M10). A ficha mede o prazo combinado contra a
   entrega da ficha (lançamento, senão finalização). A apuração do ranking e
   da comissão conta a entrega no dia da apuração (a conferência, senão o
   lançamento, senão a finalização). Quando dizem coisas diferentes, a tela
   mostra as duas, sem escolher: a escolha é da gestão (A3).

   O núcleo (PERDAS) é puro e roda no node. A tela vem depois e só existe no
   index.html, para admin e pcp; o celular do instalador não carrega. */
const PERDAS = (() => {
  const lista = v => Array.isArray(v) ? v : [];
  const txt = v => typeof v === 'string' ? v.trim() : '';
  const DECIDIDAS = ['sem_falha', 'falha_comprovada', 'abono'];
  // As frases do motor (comissao.js), lidas da linha da apuração. Os testes
  // rodam o motor de verdade: se ele mudar a frase, eles acusam.
  const MOTOR_SEM_DECISAO = 'Ocorrência e responsabilidade aguardam decisão documentada.';
  const MOTOR_FALHA_FORA = 'Produção, cliente ou ausência de ocorrência não comprovam falha da instalação.';
  // As etapas do retrabalho que não são a instalação (app.js, ETAPAS_ORIGEM).
  const ETAPAS_FORA = ['Medição', 'Arte', 'Produção'];
  const EFEITO = Object.freeze({
    pendente:'Ocorrência a decidir pela gestão: ainda não tira pontos nem comissão',
    falha_comprovada:'Falha comprovada da instalação: a O.S. não pontua no programa e não gera comissão',
    sem_falha:'Sem falha comprovada: a ocorrência não tira pontos nem comissão',
    abono:'Abono justificado: a ocorrência não tira pontos nem comissão',
  });
  const ROTULO_DECISAO = Object.freeze({pendente:'A decidir pela gestão', sem_falha:'Sem falha comprovada', falha_comprovada:'Falha comprovada', abono:'Abono justificado'});
  const ROTULO_TIPO = Object.freeze({nenhuma:'nenhuma ocorrência', producao:'falha da produção', cliente:'mudança do cliente', incompleto:'serviço incompleto',
    ma_conducao:'má condução', atraso:'atraso', retorno_antecipado:'retorno antecipado', outra:'outra'});
  const ROTULO_OCORRENCIA = Object.freeze({retrabalho:'Retrabalho', atraso:'Atraso', retorno_antecipado:'Retorno antecipado'});

  /* AS OCORRÊNCIAS DE UMA O.S.: card (a ficha do aparelho, ou null), st (o
     status da entrega da ficha, OPERACAO.statusEntrega), registros (as
     entregas da O.S. na apuração: {dia, retrabalho}) e noDia (dia => o status
     da ficha com a entrega naquele dia, a régua da apuração). */
  function ocorrenciasDaOS({card = null, st = null, registros = [], noDia = null} = {}) {
    const c = card && typeof card === 'object' ? card : null;
    const regs = lista(registros).filter(r => r && typeof r === 'object');
    const out = {retrabalho:null, atraso:null, retorno:[], abonos:[], tipos:[], semFicha:!c};
    // RETRABALHO: a ficha manda; sem ela, a marca que veio na apuração.
    if (c ? !!c.retrabalho : regs.some(r => r.retrabalho === true)) {
      const rp = c && c.retrabalhoPerguntado && typeof c.retrabalhoPerguntado === 'object' && c.retrabalhoPerguntado.resposta === 'sim' ? c.retrabalhoPerguntado : null;
      const etapa = txt(c && c.etapaOrigem);
      out.retrabalho = {problema:txt(c && c.problema), etapa, causa:txt(c && c.causaRaiz) || txt(c && c.causa), responsavel:txt(c && c.responsavelEtapa),
        data:txt(c && c.dataRetrabalho), marcadoPor:rp ? txt(rp.por) : '', marcadoEm:rp ? txt(rp.em) : '', foraDaInstalacao:ETAPAS_FORA.includes(etapa)};
    }
    // ATRASO pelas duas réguas.
    const ocs = lista(st && st.ocorrencias).filter(o => o && typeof o === 'object');
    const oa = ocs.find(o => o.tipo === 'atraso');
    const ficha = st && txt(st.prazo) ? {prazo:txt(st.prazo), entrega:txt(st.dataEntrega), entregue:!oa || oa.entregue === true,
      dias:oa ? Number(oa.dias) || 0 : 0, abonado:!!(oa && oa.abonado), abono:oa && oa.abono || null} : null;
    const dias = [...new Set(regs.map(r => txt(r.dia)).filter(Boolean))].sort();
    let apuracao = null;
    for (const dia of dias) {
      let s = null;
      try { s = typeof noDia === 'function' ? noDia(dia) : null; } catch { s = null; }
      if (!s || !txt(s.prazo)) continue;
      const a = lista(s.ocorrencias).find(o => o && o.tipo === 'atraso');
      const x = {prazo:txt(s.prazo), entrega:dia, dias:a && a.entregue === true ? Number(a.dias) || 0 : 0, abonado:!!(a && a.abonado), abono:a && a.abono || null};
      if (!apuracao || x.dias > apuracao.dias) apuracao = x;
    }
    const atrasoFicha = !!ficha && ficha.entregue && ficha.dias > 0, atrasoApuracao = !!apuracao && apuracao.dias > 0;
    if (atrasoFicha || atrasoApuracao) {
      const abono = (ficha && ficha.abono) || (apuracao && apuracao.abono) || null;
      // Divergem quando uma régua não existe, a ficha nem tem entrega, ou os dias de atraso não batem.
      out.atraso = {ficha, apuracao, divergem:!ficha || !apuracao || !ficha.entregue || ficha.dias !== apuracao.dias,
        abonado:!!((ficha && ficha.abonado) || (apuracao && apuracao.abonado)), abono};
    }
    // RETORNO ANTECIPADO: um por dia da jornada (o que conta e o abonado).
    out.retorno = ocs.filter(o => o.tipo === 'retorno_antecipado').map(o => ({dia:txt(o.dia), minutos:Number(o.minutos) || 0, abonado:!!o.abonado, abono:o.abono || null}));
    const abonoDe = (tipo, a, extra = {}) => ({tipo, motivo:txt(a.motivo), por:txt(a.por), em:txt(a.em), pendente:!!a.pendente, ...extra});
    if (out.atraso && out.atraso.abono) out.abonos.push(abonoDe('atraso', out.atraso.abono));
    for (const r of out.retorno) if (r.abono) out.abonos.push(abonoDe('retorno_antecipado', r.abono, {dia:r.dia}));
    out.tipos = [out.retrabalho && 'retrabalho', out.atraso && 'atraso', out.retorno.length && 'retorno_antecipado'].filter(Boolean);
    return out;
  }

  /* A DECISÃO DA COMISSÃO sobre a O.S., lida da última revisão do período
     (prévia ou aprovada): só vale a que o motor aceitou. Sem revisão, sem
     linha, sem documento ou com decisões diferentes nas entregas da mesma
     O.S.: a decidir pela gestão. Falha comprovada de origem fora da
     instalação o motor recusa; fica a decidir, marcada como recusada. */
  function decisaoDaOS(osId, revisao) {
    const id = String(osId ?? '');
    const ap = revisao && revisao.apuracao && typeof revisao.apuracao === 'object' ? revisao.apuracao : null;
    const linhas = ap ? lista(ap.linhas).filter(l => l && String(l.osId) === id) : [];
    const decisoes = revisao && revisao.entrada && revisao.entrada.decisoes && typeof revisao.entrada.decisoes === 'object' ? revisao.entrada.decisoes : {};
    const d = decisoes[id] && typeof decisoes[id] === 'object' ? decisoes[id] : {};
    const base = {codigo:'pendente', rotulo:ROTULO_DECISAO.pendente, tipo:txt(d.tipo), tipoRotulo:ROTULO_TIPO[txt(d.tipo)] || '', recusada:false, justificativa:'', linhas,
      revisao:ap ? (revisao.revisao ?? null) : null, tipoRevisao:ap ? (revisao.tipo === 'aprovacao' ? 'aprovacao' : 'previa') : '', em:ap ? txt(revisao.em) : ''};
    if (!linhas.length) return base;
    const pend = linhas.flatMap(l => lista(l.pendencias));
    const codigo = String(linhas[0].decisao || '');
    if (pend.includes(MOTOR_SEM_DECISAO) || !DECIDIDAS.includes(codigo) || linhas.some(l => l.decisao !== codigo)) return base;
    if (pend.includes(MOTOR_FALHA_FORA)) return {...base, recusada:true, justificativa:txt(d.justificativa)};
    return {...base, codigo, rotulo:ROTULO_DECISAO[codigo], justificativa:txt(d.justificativa)};
  }

  /* O MESMO MOTOR SOBRE A MESMA REVISÃO, trocando só a falha comprovada por
     "sem falha": a comissão que a O.S. teria. Precisa do fechamento da
     revisão (fonte). Saldo de períodos anteriores da mesma O.S. não está no
     aparelho e não entra (o servidor só manda as revisões deste período). */
  function semFalhas(motor, fonte, revisao) {
    if (!motor || typeof motor.apurar !== 'function' || !fonte || typeof fonte !== 'object' || !revisao || !revisao.entrada || typeof revisao.entrada !== 'object') return null;
    if (revisao.apuracao && revisao.apuracao.compensacaoDe) return null;
    if (revisao.fechamentoId && fonte.id && revisao.fechamentoId !== fonte.id) return null;
    const decisoes = {};
    for (const [k, d] of Object.entries(revisao.entrada.decisoes || {})) decisoes[k] = d && d.decisao === 'falha_comprovada' ? {...d, decisao:'sem_falha'} : d;
    try { return motor.apurar(fonte, {...revisao.entrada, decisoes}, {aprovacoes:[]}); } catch { return null; }
  }

  // A perda só existe com falha comprovada aceita pelo motor. Centavos; null = não se sabe.
  function perdaDaOS(decisao, contrafactual) {
    if (!decisao || decisao.codigo !== 'falha_comprovada' || !decisao.linhas.length) return null;
    const soma = (xs, k) => xs.length && xs.every(l => Number.isSafeInteger(l[k])) ? xs.reduce((s, l) => s + l[k], 0) : null;
    const id = String(decisao.linhas[0].osId);
    const cf = contrafactual ? lista(contrafactual.linhas).filter(l => l && String(l.osId) === id) : [];
    return {valorCentavos:soma(decisao.linhas, 'baseLiquidaCentavos'), comissaoCentavos:soma(cf, 'comissaoCentavos'), semMotor:!contrafactual};
  }

  /* A LISTA DO PERÍODO. registros: as entregas da apuração (a tela usa os
     mesmos do ranking); card(osId): a ficha; status(card): o status da
     entrega da ficha; noDia(card, dia): a régua da apuração. */
  function montar({registros = [], card = null, status = null, noDia = null, revisao = null, contrafactual = null} = {}) {
    const porOS = new Map();
    for (const r of lista(registros)) {
      if (!r || typeof r !== 'object') continue;
      const id = String(r.osId || r.id || '');
      if (!id) continue;
      const x = porOS.get(id) || {osId:id, numero:'', cliente:'', registros:[]};
      x.numero = x.numero || String(r.numero ?? (r.os && r.os.numero) ?? '').trim();
      x.cliente = x.cliente || String(r.cliente ?? (r.os && r.os.cliente) ?? '').trim();
      x.registros.push(r);
      porOS.set(id, x);
    }
    const linhas = [];
    let semFicha = 0;
    for (const x of porOS.values()) {
      let c = null;
      try { c = typeof card === 'function' ? card(x.osId) : null; } catch { c = null; }
      if (!c) semFicha++;
      let st = null;
      try { st = c && typeof status === 'function' ? status(c) : null; } catch { st = null; }
      const regs = x.registros.map(r => ({dia:txt(r.dia) || String((r.os && r.os.finalizadaEm) || '').slice(0, 10), retrabalho:r.retrabalho === true || !!(r.os && r.os.retrabalho === true)}));
      const oc = ocorrenciasDaOS({card:c, st, registros:regs, noDia:c && typeof noDia === 'function' ? dia => noDia(c, dia) : null});
      if (!oc.tipos.length) continue;
      const decisao = decisaoDaOS(x.osId, revisao);
      const pessoas = new Map(), equipes = new Set();
      for (const r of x.registros) {
        for (const m of lista(r.membros)) { const k = String(m && m.chave || '').trim(); if (k && !pessoas.has(k)) pessoas.set(k, {chave:k, nome:String(m.nome || k)}); }
        for (const g of lista(r.grupos)) if (g && g.equipeNome) equipes.add(String(g.equipeNome));
        if (r.equipeNome) equipes.add(String(r.equipeNome));
      }
      linhas.push({osId:x.osId, numero:x.numero || txt(c && String(c.numero ?? '')), cliente:x.cliente || txt(c && c.cliente), dias:[...new Set(regs.map(r => r.dia).filter(Boolean))].sort(),
        pessoas:[...pessoas.values()], equipes:[...equipes], ocorrencias:oc, decisao, perda:perdaDaOS(decisao, contrafactual), efeito:EFEITO[decisao.codigo]});
    }
    linhas.sort((a, b) => String(b.dias[b.dias.length - 1] || '').localeCompare(String(a.dias[a.dias.length - 1] || '')) || String(a.numero).localeCompare(String(b.numero), 'pt-BR', {numeric:true}));
    const semDecisao = linhas.filter(l => l.ocorrencias.retrabalho && l.decisao.codigo === 'pendente');
    const emRisco = new Set(semDecisao.flatMap(l => l.pessoas.map(p => p.chave)));
    const comFalha = linhas.filter(l => l.perda);
    const total = k => comFalha.length && comFalha.every(l => Number.isSafeInteger(l.perda[k])) ? comFalha.reduce((s, l) => s + l.perda[k], 0) : null;
    return {linhas, resumo:{os:linhas.length, total:porOS.size, semFicha, retrabalhoSemDecisao:semDecisao.length, pessoasEmRisco:emRisco.size,
      comFalha:comFalha.length, valorCentavos:total('valorCentavos'), comissaoCentavos:total('comissaoCentavos')}};
  }

  return {EFEITO, ROTULO_DECISAO, ROTULO_TIPO, ROTULO_OCORRENCIA, ETAPAS_FORA, ocorrenciasDaOS, decisaoDaOS, semFalhas, perdaDaOS, montar};
})();
if (typeof module !== 'undefined') module.exports = PERDAS;

/* ======================== A TELA (index.html; admin e pcp) ========================
   Daqui para baixo roda só no navegador, com casa.js, performance.js e
   comissao.js carregados. As decisões da comissão vêm do servidor
   (performanceComissaoListar, a mesma consulta do demonstrativo), uma vez por
   período; o servidor recusa quem não é admin nem pcp. */
let perdasRemoto = {chave:'', revisoes:null, carregando:false, erro:'', tentado:false};
// Só admin e pcp, e nunca o crachá sem senha (toque), mesmo com papel de gestão.
function perdasPode() {
  if (typeof STATE === 'undefined' || !['admin', 'pcp'].includes(String((STATE.user && STATE.user.papel) || ''))) return false;
  return !(typeof crachaEhToque === 'function' && crachaEhToque());
}
// Outra revisão da comissão foi gravada, ou a Performance abriu de novo: consultar outra vez.
function perdasInvalidar() { perdasRemoto.tentado = false; }
async function perdasCarregar() {
  if (!perdasPode() || typeof STORE === 'undefined' || typeof STORE.api !== 'function') return;
  const chave = perfChave(), f = periodoOuMes('_fPerf');
  if (perdasRemoto.chave === chave && perdasRemoto.carregando) return;
  // A leitura anterior do mesmo período fica à vista enquanto a nova não chega: o ponto de atenção não pisca.
  const pedido = {chave, revisoes:perdasRemoto.chave === chave ? perdasRemoto.revisoes : null, carregando:true, erro:'', tentado:true};
  perdasRemoto = pedido;
  try {
    const r = await STORE.api({action:'performanceComissaoListar', de:f.de, ate:f.ate});
    if (!r || !Array.isArray(r.revisoes)) throw new Error((r && r.error) || 'Resposta inesperada do servidor.');
    pedido.revisoes = r.revisoes;
  } catch (e) { pedido.revisoes = null; pedido.erro = typeof perfErroTxt === 'function' ? perfErroTxt(e) : String((e && e.message) || e); }
  finally {
    pedido.carregando = false;
    if (perdasRemoto === pedido && perfChave() === chave && typeof renderPerformanceCasa === 'function') renderPerformanceCasa();
  }
}
// O status da ficha (com a regra e a volta do dia, como a ficha mostra) e a régua da apuração.
function perdasStatus(c) {
  if (typeof statusEntregaDe === 'function') return statusEntregaDe(c);
  try { return OPERACAO.statusEntrega(c); } catch { return null; }
}
// O dia da entrega da apuração no lugar da entrega da ficha: o mesmo jeito da célula de comissão do Por O.S.
function perdasNoDia(c, dia) {
  try { return OPERACAO.statusEntrega({...c, finalizadaEm:dia + 'T12:00:00-03:00', entregaLancada:{data:dia}}); } catch { return null; }
}
function perdasDados() {
  if (!perdasPode()) return null;
  const chave = perfChave();
  const minha = perdasRemoto.chave === chave;
  const consultada = minha && Array.isArray(perdasRemoto.revisoes);
  // "Consultando" só quando não há leitura nenhuma deste período; com uma, ela vale até a nova chegar.
  const decisoes = {consultada, consultando:!consultada && (!minha || !perdasRemoto.tentado || perdasRemoto.carregando), recarregando:minha && perdasRemoto.carregando, erro:minha ? perdasRemoto.erro : ''};
  const fonte = typeof perfFonteAtual === 'function' ? perfFonteAtual() : null;
  if (!fonte) return {carregando:true, erro:(typeof perfRemoto === 'object' && perfRemoto && perfRemoto.erro) || '', decisoes};
  const revisao = decisoes.consultada ? perdasRemoto.revisoes[0] || null : null;
  const fechamento = revisao && typeof perfRemoto === 'object' && perfRemoto && Array.isArray(perfRemoto.fechamentos) ? perfRemoto.fechamentos.find(x => x && x.id === revisao.fechamentoId) || null : null;
  const contrafactual = revisao && fechamento && typeof COMISSAO !== 'undefined' ? PERDAS.semFalhas(COMISSAO, fechamento, revisao) : null;
  const m = PERDAS.montar({registros:perfRegsDoPeriodo(), card:id => STORE.getOS(id), status:perdasStatus, noDia:perdasNoDia, revisao, contrafactual});
  return {...m, carregando:false, decisoes, revisao, fechamento};
}
const perdasDDMM = dia => { const s = String(dia || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''; };
const perdasQuando = iso => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : String(iso || ''); };
const perdasDinheiro = c => c == null ? 'a apurar' : dinheiroCasa(c / 100);
// "Retrabalho, atraso e retorno antecipado"
function perdasTiposTxt(oc) {
  const n = (oc && Array.isArray(oc.tipos) ? oc.tipos : []).map((t, i) => { const r = PERDAS.ROTULO_OCORRENCIA[t] || t; return i ? r.toLowerCase() : r; });
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : n.join('');
}
// Uma régua do atraso, em uma linha.
function perdasReguaTxt(nome, r) {
  if (!r) return `${nome}: sem prazo combinado para medir`;
  if (r.entregue === false) return `${nome}: prazo ${perdasDDMM(r.prazo)}, sem entrega registrada`;
  if (!r.entrega) return `${nome}: prazo ${perdasDDMM(r.prazo)}, sem a data da entrega (o prazo ainda não foi julgado)`;
  return `${nome}: prazo ${perdasDDMM(r.prazo)}, entrega ${perdasDDMM(r.entrega)}: ${r.dias ? `${r.dias} ${r.dias === 1 ? 'dia' : 'dias'} de atraso` : 'no prazo'}${r.abonado ? ' (abonado)' : ''}`;
}
// O que aconteceu na O.S.: na aba de Perdas e no diálogo de decisão da comissão.
function perdasOcorrenciaListaHTML(oc) {
  const itens = [];
  if (oc.retrabalho) {
    const r = oc.retrabalho, partes = [];
    if (r.etapa) partes.push(`origem: ${esc(r.etapa)}${r.foraDaInstalacao ? ' (fora da instalação)' : ''}`);
    if (r.causa) partes.push(`causa: ${esc(r.causa)}`);
    if (r.problema) partes.push(`problema: ${esc(r.problema)}`);
    if (r.marcadoPor || r.marcadoEm) partes.push(`marcado${r.marcadoPor ? ' por ' + esc(r.marcadoPor) : ''}${r.marcadoEm ? ' em ' + esc(perdasQuando(r.marcadoEm)) : ''}`);
    else if (r.data) partes.push(`dia do retrabalho: ${esc(perdasDDMM(r.data))}`);
    itens.push(`<li><strong>Retrabalho</strong>${partes.length ? ' · ' + partes.join(' · ') : oc.semFicha ? ' marcado na apuração' : ' marcado, sem origem nem causa preenchidas'}</li>`);
  }
  if (oc.atraso) {
    const a = oc.atraso, f = a.ficha;
    itens.push(a.divergem
      ? `<li><strong>Atraso</strong>, as réguas divergem:<ul><li>${esc(perdasReguaTxt('Ficha', f))}</li><li>${esc(perdasReguaTxt('Apuração (ranking e comissão)', a.apuracao))}</li></ul></li>`
      : `<li><strong>Atraso</strong> de ${f.dias} ${f.dias === 1 ? 'dia' : 'dias'}: prazo ${esc(perdasDDMM(f.prazo))}, entrega ${esc(perdasDDMM(f.entrega))}${a.abonado ? ' (abonado)' : ''}. A ficha e a apuração concordam.</li>`);
  }
  for (const r of oc.retorno) itens.push(`<li><strong>Retorno antecipado</strong> em ${esc(perdasDDMM(r.dia))}: ${r.minutos} minutos antes do retorno previsto${r.abonado ? ' (abonado)' : ''}</li>`);
  for (const a of oc.abonos) itens.push(`<li><strong>Abono do ${a.tipo === 'atraso' ? 'atraso' : 'retorno antecipado'}</strong>: ${esc(a.motivo)}${a.por ? ' · por ' + esc(a.por) : ''}${a.em ? ' em ' + esc(perdasQuando(a.em)) : ''}${a.pendente ? ' (a enviar)' : ''}</li>`);
  if (oc.semFicha) itens.push('<li class="perf-perda-semficha">A ficha desta O.S. não está neste aparelho: o atraso e o retorno antecipado só aparecem com ela.</li>');
  return itens.length ? `<ul class="perf-perda-ocorrencias">${itens.join('')}</ul>` : '<p class="perf-perda-nenhuma">Nenhuma ocorrência de retrabalho, atraso ou retorno antecipado nesta O.S.</p>';
}
// O diálogo de decisão da comissão (comissao-ui.js) mostra o que está sendo julgado (itens 14 e 26 da fila).
function perdasOcorrenciaDaOS(osId, registros) {
  const id = String(osId ?? '');
  const c = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' ? STORE.getOS(id) : null;
  const regs = (Array.isArray(registros) ? registros : []).filter(r => r && String(r.osId || r.id) === id).map(r => ({dia:String(r.dia || ''), retrabalho:r.retrabalho === true}));
  return PERDAS.ocorrenciasDaOS({card:c, st:c ? perdasStatus(c) : null, registros:regs, noDia:c ? dia => perdasNoDia(c, dia) : null});
}
function perdasJulgadaHTML(oc) {
  return `<div class="comissao-ocorrencia" role="group" aria-label="Ocorrência em julgamento"><p><strong>Ocorrência em julgamento</strong></p>${perdasOcorrenciaListaHTML(oc)}</div>`;
}
function perdasDecisaoHTML(l) {
  const dec = l.decisao;
  const rev = dec.revisao != null ? `<small class="bloco">Lida da revisão ${esc(String(dec.revisao))} da comissão, ${dec.tipoRevisao === 'aprovacao' ? 'aprovada' : 'prévia'}${dec.em ? ', de ' + esc(perdasQuando(dec.em)) : ''}.</small>` : '';
  if (dec.recusada) return `<strong>A decidir pela gestão</strong><small class="bloco">Falha registrada como ${esc(dec.tipoRotulo || dec.tipo)}: o demonstrativo não aceita, porque não é falha da instalação.</small>${rev}`;
  if (dec.codigo === 'pendente') return `<strong>A decidir pela gestão</strong>${rev || '<small class="bloco">Sem decisão no demonstrativo da comissão deste período.</small>'}`;
  return `<strong>${esc(dec.rotulo)}</strong>${dec.tipoRotulo ? ` (${esc(dec.tipoRotulo)})` : ''}${dec.justificativa ? `<small class="bloco">${esc(dec.justificativa)}</small>` : ''}${rev}`;
}
function perdasEfeitoHTML(l) {
  const p = l.perda;
  const comissao = !p ? '' : p.comissaoCentavos != null ? esc(perdasDinheiro(p.comissaoCentavos))
    : p.semMotor ? 'aparece com o fechamento desta revisão carregado (Base e fechamento, Versão da apuração)' : 'a apurar: o demonstrativo tem pendências nesta O.S.';
  return `<strong>${esc(l.efeito)}</strong>${p ? `<span class="bloco">Deixa de pontuar: ${esc(perdasDinheiro(p.valorCentavos))}</span><span class="bloco">Comissão perdida: ${comissao}</span>` : ''}`;
}
function perdasCartaoHTML(l, i) {
  const id = 'perf-perda-' + i, classe = l.decisao.codigo === 'falha_comprovada' ? 'falha' : l.decisao.codigo === 'pendente' ? 'pendente' : 'ok';
  const temFicha = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' && !!STORE.getOS(l.osId);
  const numero = esc(l.numero || l.osId);
  const abrir = temFicha ? `<button type="button" class="inline-link" data-os-id="${esc(l.osId)}" data-ficha-etapa="fechamento">O.S. ${numero}</button>`
    : `<button type="button" class="inline-link" data-perdas-abrir="${esc(l.osId)}" data-numero="${esc(l.numero)}">O.S. ${numero}</button>`;
  const dias = l.dias.map(perdasDDMM).filter(Boolean).join(', ');
  const gente = `${l.equipes.length ? `<span class="bloco">${esc(l.equipes.join(', '))}</span>` : ''}${l.pessoas.map(p => esc(p.nome)).join(', ') || 'Sem participantes na apuração'}`;
  return `<article class="perf-perda perf-perda-${classe}" aria-labelledby="${id}"><header><h4 id="${id}">${abrir} <span class="perf-perda-cliente">${esc(l.cliente)}</span></h4>${dias ? `<span class="perf-perda-dia">Entrega ${esc(dias)}</span>` : ''}<span class="badge perf-perda-selo">${esc(l.decisao.codigo === 'pendente' ? 'A decidir pela gestão' : l.decisao.rotulo)}</span></header>
    <dl class="perf-perda-grade"><div><dt>Equipe e pessoas</dt><dd>${gente}</dd></div><div><dt>Ocorrência</dt><dd>${perdasOcorrenciaListaHTML(l.ocorrencias)}</dd></div><div><dt>Decisão da comissão</dt><dd>${perdasDecisaoHTML(l)}</dd></div><div><dt>Efeito atual</dt><dd>${perdasEfeitoHTML(l)}</dd></div></dl></article>`;
}
/* O PONTO DE ATENÇÃO no alto da Performance, em todas as abas. Só depois de
   as decisões chegarem: acusar antes seria dizer "sem decisão" sem ter lido. */
function perdasPontoHTML(d) {
  if (!d || d.carregando || !d.resumo || !d.resumo.retrabalhoSemDecisao || d.decisoes.consultando) return '';
  const x = d.resumo.retrabalhoSemDecisao, y = d.resumo.pessoasEmRisco;
  const aviso = d.decisoes.consultada ? '' : ' As decisões da comissão não foram consultadas agora: confira na aba.';
  return `<section class="perf-atencao" role="status" aria-labelledby="perf-atencao-titulo"><p><strong id="perf-atencao-titulo"><span aria-hidden="true">⚠</span> Ponto de atenção:</strong> ${x} O.S. com retrabalho ainda sem decisão: ${x === 1 ? 'pode' : 'podem'} tirar a comissão de ${y} ${y === 1 ? 'pessoa' : 'pessoas'}.${aviso}</p><button type="button" class="btn-ghost btn-sm" data-perf-ir="perdas">Ver as perdas por retrabalho</button></section>`;
}
// O número do selo da aba (as O.S. com ocorrência); 0 enquanto a apuração não chega.
const perdasContagem = d => d && !d.carregando && d.resumo ? d.resumo.os : 0;
function perdasAbaHTML(d) {
  const f = periodoOuMes('_fPerf');
  const cabeca = `<div class="perf-controls">${perfPeriodoCompactoHTML(f)}</div><div class="perf-perdas-cabeca"><h3 id="perf-perdas-titulo">Perdas por retrabalho</h3><p>O.S. do período com retrabalho, atraso ou retorno antecipado, e o que a comissão decidiu sobre cada uma. Só leitura: a decisão é registrada no demonstrativo da comissão (Rankings, Base e fechamento).</p></div>`;
  const regra = '<p class="perf-perdas-regra"><strong>Regra pendente.</strong> A gestão ainda não decidiu se retrabalho e atraso tiram pontos e comissão sozinhos ou só com falha comprovada. Até a decisão, a ocorrência sem decisão aparece como "a decidir pela gestão" e ainda não tira pontos nem comissão. Só a falha comprovada aceita pelo demonstrativo da comissão zera a O.S.</p>';
  if (!d || d.carregando) return `<section class="perf-perdas" aria-labelledby="perf-perdas-titulo">${cabeca}${regra}<p role="status">${d && d.erro ? 'Não foi possível consultar a apuração. Nenhuma perda foi inferida.' : 'Consultando a apuração do período…'}</p>${typeof perfAvisosHTML === 'function' ? perfAvisosHTML(true) : ''}</section>`;
  const r = d.resumo, dec = d.decisoes;
  const fonte = dec.consultando ? 'Consultando as decisões da comissão deste período…'
    : dec.erro ? `Não foi possível consultar as decisões da comissão (${esc(dec.erro)}). Enquanto isso, todas aparecem como a decidir.`
    : !d.revisao ? 'Nenhuma revisão da comissão neste período: todas as ocorrências estão a decidir pela gestão.'
    : `Decisões lidas da revisão ${esc(String(d.revisao.revisao))} da comissão (${d.revisao.tipo === 'aprovacao' ? 'aprovada' : 'prévia'}${d.revisao.em ? ', ' + esc(perdasQuando(d.revisao.em)) : ''}).`;
  const semFicha = r.semFicha ? `<p class="perf-aviso">${r.semFicha === 1 ? '1 O.S. do período não está neste aparelho: o atraso e o retorno antecipado dela só aparecem' : `${r.semFicha} O.S. do período não estão neste aparelho: o atraso e o retorno antecipado delas só aparecem`} com a ficha. <button type="button" class="btn-ghost btn-sm" data-perdas-buscar>Buscar as fichas no servidor</button></p>` : '';
  const resumo = `<div class="perf-perdas-resumo" role="group" aria-label="Resumo do período"><span><b>${r.os}</b> O.S. com ocorrência</span><span><b>${r.retrabalhoSemDecisao}</b> com retrabalho sem decisão</span><span><b>${r.pessoasEmRisco}</b> ${r.pessoasEmRisco === 1 ? 'pessoa pode' : 'pessoas podem'} perder a comissão</span>${r.comFalha ? `<span><b>${r.valorCentavos == null ? 'A apurar' : esc(perdasDinheiro(r.valorCentavos))}</b> ${r.valorCentavos == null ? 'o valor que deixa de pontuar' : 'deixam de pontuar'}</span><span><b>${r.comissaoCentavos == null ? 'A apurar' : esc(perdasDinheiro(r.comissaoCentavos))}</b> ${r.comissaoCentavos == null ? 'a comissão perdida' : 'de comissão perdida'}</span>` : ''}</div>`;
  const nota = r.comFalha ? '<p class="metricas-nota">O valor que deixa de pontuar é a base líquida da linha da comissão. A comissão perdida usa o mesmo motor do demonstrativo, na mesma revisão, trocando só a falha comprovada por sem falha; saldo de períodos anteriores da mesma O.S. não entra.</p>' : '';
  const cartoes = d.linhas.map(perdasCartaoHTML).join('') || '<p class="perf-perdas-vazio">Nenhuma O.S. do período com retrabalho, atraso ou retorno antecipado.</p>';
  return `<section class="perf-perdas" aria-labelledby="perf-perdas-titulo">${cabeca}${regra}<p class="perf-perdas-fonte" role="status">${fonte} <button type="button" class="btn-ghost btn-sm" data-perdas-atualizar ${dec.consultando || dec.recarregando ? 'disabled' : ''}>${dec.recarregando ? 'Consultando…' : 'Atualizar decisões'}</button></p>${semFicha}${resumo}${nota}<div class="perf-perdas-lista">${cartoes}</div></section>`;
}
function wirePerdas(el) {
  if (!el || !perdasPode()) return;
  el.querySelectorAll('[data-perdas-atualizar]').forEach(b => b.onclick = () => { perdasRemoto.tentado = false; void perdasCarregar(); renderPerformanceCasa(); });
  el.querySelectorAll('[data-perdas-buscar]').forEach(b => b.onclick = async () => {
    if (typeof STORE.buscarHistorico !== 'function') return;
    const f = periodoOuMes('_fPerf');
    b.disabled = true; b.textContent = 'Buscando…';
    // A busca do servidor filtra a finalização em UTC: um dia a mais de cada lado não deixa de fora a O.S. da virada do dia.
    try {
      const r = await STORE.buscarHistorico({de:OPERACAO.somarDias(f.de, -1), ate:OPERACAO.somarDias(f.ate, 1)});
      if (r && r.offline) toast('Sem conexão: tente de novo quando houver sinal.', 'error');
      else if (r && r.truncou) toast('A busca trouxe só parte das fichas do período. Abra a ficha da O.S. que faltar.', 'error');
    } catch (e) { toast('Não deu para buscar as fichas: ' + (typeof perfErroTxt === 'function' ? perfErroTxt(e) : String(e && e.message || e)), 'error'); }
    renderPerformanceCasa();
  });
  el.querySelectorAll('[data-perdas-abrir]').forEach(b => b.onclick = async () => {
    const id = b.dataset.perdasAbrir, numero = b.dataset.numero || '';
    let os = STORE.getOS(id);
    if (!os && typeof STORE.buscarHistorico === 'function' && numero) { try { await STORE.buscarHistorico({de:'', ate:'', q:numero}); } catch (e) { /* o aviso abaixo diz */ } os = STORE.getOS(id); }
    if (os && typeof openModal === 'function') openModal(os, 'fechamento');
    else toast('Esta O.S. não está neste aparelho e a busca no servidor não a trouxe. Conecte-se e tente de novo.', 'error');
  });
  if (typeof STORE.api !== 'function') return;
  if (perdasRemoto.chave !== perfChave() || !perdasRemoto.tentado) void perdasCarregar();
  // A aba Regras não consulta a apuração (perfWireFonte); o ponto de atenção precisa dela em todas.
  if (typeof perfCarregarFonte === 'function' && typeof perfRemoto === 'object' && perfRemoto && (perfRemoto.chave !== perfChave() || !perfRemoto.tentado)) void perfCarregarFonte();
}
