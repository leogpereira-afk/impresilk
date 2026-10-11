'use strict';
/* PERDAS POR RETRABALHO (pedido do dono, 11/10/2026: "a que perdeu por
   retrabalho, essa parte precisa de uma aba e um ponto de atenção
   importante"; fila do PCP, "Já combinado 4" e itens 14 e 26; auditoria da
   v164, M10, M1, M2 e A3).

   A RÉGUA (decisões do dono de 11/10/2026, D-010 e D-011 em
   docs/DECISOES.md; a régua das perdas de regras.js, a MESMA da ficha, do
   Por O.S., do ranking e da comissão). A aba separa as O.S. em grupos:
   - ORIGEM A DEFINIR, em destaque e no ponto de atenção: retrabalho sem a
     etapa de origem. Não tira nada até a gestão definir a origem na ficha, e
     a comissão da O.S. fica pendente;
   - RETRABALHO DE INSTALAÇÃO (PERDA): tira os pontos e a comissão da O.S.,
     sozinho. Mostra a base que deixa de pontuar (o valor da O.S. na
     apuração) e a comissão perdida, do motor da comissão (comissao.js): a da
     linha do demonstrativo, quando ele já tem a O.S., senão o 1% que o motor
     dá para a mesma base (comissaoDaBase);
   - RETRABALHO DE OUTRA ORIGEM (SÓ ACOMPANHAMENTO): medição, arte ou
     produção não tiram nada da instalação;
   - OUTRAS OCORRÊNCIAS: o atraso e o retorno antecipado ficam marcados na
     O.S. e não tiram nada sozinhos; a gestão pode julgá-los falha comprovada
     no demonstrativo da comissão (D-004), e aí a O.S. sai da comissão e dos
     pontos do demonstrativo (o ranking operacional não lê a decisão da
     comissão: ele ainda conta a O.S.);
   - ANTES DO PROGRAMA: só registro.

   SÓ LEITURA. A decisão de cada O.S. é a que o motor da comissão leu no
   demonstrativo: decisão sem documento é pendência dele, e aqui fica "a
   decidir pela gestão", com o que falta no documento. A comissão perdida por
   falha comprovada é o MESMO motor rodado sobre a MESMA revisão, trocando só a
   falha comprovada por "sem falha".

   QUAL DEMONSTRATIVO (revisão da onda w3, R1 e R3). O demonstrativo é de um
   período fechado (o mês, quase sempre); a aba pode estar em qualquer recorte.
   A decisão de cada O.S. vem do demonstrativo que tem a O.S., o do recorte
   exato ou o que cobre os dias dela (o servidor manda os dois). Em cada
   demonstrativo vale a última revisão; se ela for uma compensação, vale a
   última que não é, e a tela avisa da compensação.

   DUAS RÉGUAS DE ATRASO (M3 e M10). A ficha mede o prazo combinado contra a
   entrega da ficha (lançamento, senão finalização). O ranking conta a
   entrega no dia da apuração (a conferência, senão o lançamento, senão a
   finalização) e não desconta atraso. Quando as duas dão atrasos diferentes,
   a tela mostra as duas, sem escolher. Sem prazo combinado, ou sem retorno
   previsto, a medida diz "não medido", nunca zero.

   ANTES DO PROGRAMA (revisão da onda w3, U8). O programa começou em
   01/10/2026 (outubro é o teste da comissão; regras.js, REGRA_EMBUTIDA):
   a entrega de antes não tem comissão a perder, e a ocorrência fica só como
   registro.

   O núcleo (PERDAS) é puro e roda no node. A tela vem depois e só existe no
   index.html, para admin e pcp; o celular do instalador não carrega. */
const PERDAS = (() => {
  const lista = v => Array.isArray(v) ? v : [];
  const txt = v => typeof v === 'string' ? v.trim() : '';
  const DECIDIDAS = ['sem_falha', 'falha_comprovada', 'abono'];
  // Os tipos que o motor aceita (comissao.js, decisaoOk).
  const TIPOS = ['nenhuma', 'producao', 'cliente', 'incompleto', 'ma_conducao', 'atraso', 'retorno_antecipado', 'outra'];
  // As frases do motor (comissao.js), lidas da linha da apuração. Os testes
  // rodam o motor de verdade: se ele mudar a frase, eles acusam.
  const MOTOR_SEM_DECISAO = 'Ocorrência e responsabilidade aguardam decisão documentada.';
  const MOTOR_FALHA_FORA = 'Produção, cliente ou ausência de ocorrência não comprovam falha da instalação.';
  const INICIO_PROGRAMA = '2026-10-01';
  // A régua das perdas (regras.js) e o motor da comissão (comissao.js): no navegador, os do index.html; no node, o require.
  const regrasDe = () => (typeof REGRAS !== 'undefined' && REGRAS) || (typeof require === 'function' ? require('./regras.js') : null);
  const motorDe = () => (typeof COMISSAO !== 'undefined' && COMISSAO) || (typeof require === 'function' ? require('./comissao.js') : null);
  // As etapas do retrabalho que não são a instalação (regras.js, ETAPAS_ORIGEM).
  const ETAPAS_FORA = ['Medição', 'Arte', 'Produção'];
  // O ranking da aba Rankings não lê a decisão da comissão (comissao.js: "nunca altera ranking operacional"): a frase da falha diz isso (R2 e U2).
  const NOTA_RANKING = 'O ranking da aba Rankings não lê a decisão da comissão: ele ainda conta esta O.S.';
  // A frase da ocorrência sem efeito sozinha (D-011): a mesma da régua (regras.js, TEXTOS_PERDA.ocorrencia).
  const OCORRENCIA_REGISTRADA = 'Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada';
  const EFEITO = Object.freeze({
    pendente:OCORRENCIA_REGISTRADA,
    falha_comprovada:'Falha comprovada da instalação: fica fora da comissão e dos pontos do demonstrativo da comissão. ' + NOTA_RANKING,
    sem_falha:'Sem falha comprovada: a ocorrência não tira pontos nem comissão',
    abono:'Abono justificado: a ocorrência não tira pontos nem comissão',
  });
  const ROTULO_DECISAO = Object.freeze({pendente:'A decidir pela gestão', sem_falha:'Sem falha comprovada', falha_comprovada:'Falha comprovada', abono:'Abono justificado'});
  const ROTULO_TIPO = Object.freeze({nenhuma:'nenhuma ocorrência', producao:'falha da produção', cliente:'mudança do cliente', incompleto:'serviço incompleto',
    ma_conducao:'má condução', atraso:'atraso', retorno_antecipado:'retorno antecipado', outra:'outra'});
  const ROTULO_OCORRENCIA = Object.freeze({retrabalho:'Retrabalho', atraso:'Atraso', retorno_antecipado:'Retorno antecipado'});
  // Os grupos da aba, na ordem em que aparecem (o que pede ação primeiro).
  const GRUPOS = Object.freeze(['definir', 'perda', 'outra', 'ocorrencia', 'antes']);
  const ROTULO_GRUPO = Object.freeze({definir:'Origem a definir', perda:'Retrabalho de instalação (perda)', outra:'Retrabalho de outra origem (só acompanhamento)',
    ocorrencia:'Outras ocorrências (atraso e retorno antecipado)', antes:'Antes do programa'});
  const GRUPO_DO_EFEITO = Object.freeze({tira:'perda', definir:'definir', acompanha:'outra'});
  const dataBR = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d).split('-').reverse().join('/') : String(d || '');
  const efeitoAntes = inicio => `Antes do programa (começou em ${dataBR(inicio)}): sem comissão; a ocorrência fica só como registro`;
  const temCampo = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

  /* AS OCORRÊNCIAS DE UMA O.S.: card (a ficha do aparelho, ou null), st (o
     status da entrega da ficha, OPERACAO.statusEntrega), registros (as
     entregas da O.S. na apuração: {dia, retrabalho, etapaOrigem, perda}) e
     noDia (dia => o status da ficha com a entrega naquele dia, a régua do
     ranking). O retrabalho leva o efeito da régua (`regras`, regras.js): pela
     etapa de origem da ficha; sem a ficha, pela que a apuração gravou. */
  function ocorrenciasDaOS({card = null, st = null, registros = [], noDia = null, regras = null} = {}) {
    const RG = regras || regrasDe();
    const c = card && typeof card === 'object' ? card : null;
    const regs = lista(registros).filter(r => r && typeof r === 'object');
    const out = {retrabalho:null, atraso:null, retorno:[], abonos:[], tipos:[], semFicha:!c, naoMedido:{atraso:'', retorno:''}};
    // RETRABALHO: a ficha manda; sem ela, a marca que veio na apuração.
    if (c ? !!c.retrabalho : regs.some(r => r.retrabalho === true)) {
      const rp = c && c.retrabalhoPerguntado && typeof c.retrabalhoPerguntado === 'object' && c.retrabalhoPerguntado.resposta === 'sim' ? c.retrabalhoPerguntado : null;
      const daApuracao = regs.find(r => temCampo(r, 'etapaOrigem'));
      const bruta = c ? txt(c.etapaOrigem) : txt(daApuracao && daApuracao.etapaOrigem);
      const etapa = RG && typeof RG.origemRetrabalho === 'function' ? RG.origemRetrabalho(bruta) : bruta;
      const efeito = RG && typeof RG.efeitoDaOcorrencia === 'function' ? RG.efeitoDaOcorrencia('retrabalho', etapa) : '';
      // A apuração do servidor julgou com outra origem (a ficha mudou depois da consulta): a tela pede para atualizar.
      const efeitoApuracao = daApuracao ? (daApuracao.perda ? 'tira' : txt(daApuracao.etapaOrigem) ? 'acompanha' : 'definir') : '';
      out.retrabalho = {problema:txt(c && c.problema), etapa, causa:txt(c && c.causaRaiz) || txt(c && c.causa), responsavel:txt(c && c.responsavelEtapa),
        data:txt(c && c.dataRetrabalho), marcadoPor:rp ? txt(rp.por) : '', marcadoEm:rp ? txt(rp.em) : '', foraDaInstalacao:ETAPAS_FORA.includes(etapa),
        efeito, texto:RG && typeof RG.textoDoEfeito === 'function' ? RG.textoDoEfeito('retrabalho', etapa) : '',
        apuracaoDiverge:!!(efeito && efeitoApuracao && efeitoApuracao !== efeito)};
    }
    // ATRASO pelas duas réguas.
    const ocs = lista(st && st.ocorrencias).filter(o => o && typeof o === 'object');
    const oa = ocs.find(o => o.tipo === 'atraso');
    const ficha = st && txt(st.prazo) ? {prazo:txt(st.prazo), entrega:txt(st.dataEntrega), entregue:!oa || oa.entregue === true,
      dias:oa ? Number(oa.dias) || 0 : 0, abonado:!!(oa && oa.abonado), abono:oa && oa.abono || null} : null;
    // Sem prazo combinado, o atraso não é medido (nunca "zero dias").
    if (c && st && !txt(st.prazo)) out.naoMedido.atraso = 'sem prazo combinado';
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
    // Sem retorno previsto, ou sem a chegada conferida, o retorno antecipado não é medido.
    const ra = st && st.retornoAntecipado && typeof st.retornoAntecipado === 'object' ? st.retornoAntecipado : null;
    if (c && ra && !out.retorno.length && (ra.situacao === 'sem retorno previsto' || ra.situacao === 'sem dado')) out.naoMedido.retorno = ra.situacao === 'sem dado' ? 'chegada ainda não conferida' : 'sem retorno previsto';
    const abonoDe = (tipo, a, extra = {}) => ({tipo, motivo:txt(a.motivo), por:txt(a.por), em:txt(a.em), pendente:!!a.pendente, ...extra});
    if (out.atraso && out.atraso.abono) out.abonos.push(abonoDe('atraso', out.atraso.abono));
    for (const r of out.retorno) if (r.abono) out.abonos.push(abonoDe('retorno_antecipado', r.abono, {dia:r.dia}));
    out.tipos = [out.retrabalho && 'retrabalho', out.atraso && 'atraso', out.retorno.length && 'retorno_antecipado'].filter(Boolean);
    return out;
  }

  /* A DECISÃO DA COMISSÃO sobre a O.S., lida de uma revisão (prévia ou
     aprovada): só vale a que o motor aceitou. Sem revisão, sem linha, sem
     documento ou com decisões diferentes nas entregas da mesma O.S.: a decidir
     pela gestão. Falha comprovada de origem fora da instalação o motor recusa;
     fica a decidir, marcada como recusada. A decisão escolhida e gravada sem o
     documento completo fica a decidir, marcada como incompleta, com o que
     falta (U4). A linha da perda automática (retrabalho de instalação, D-010)
     não pede decisão: `automatica`. `internas`: as pessoas da montagem interna
     elegível, que também perdem a parcela delas (20%) com a falha comprovada
     (R4). */
  function decisaoDaOS(osId, revisao) {
    const id = String(osId ?? '');
    const ap = revisao && revisao.apuracao && typeof revisao.apuracao === 'object' ? revisao.apuracao : null;
    const linhas = ap ? lista(ap.linhas).filter(l => l && String(l.osId) === id) : [];
    const entrada = revisao && revisao.entrada && typeof revisao.entrada === 'object' ? revisao.entrada : {};
    const decisoes = entrada.decisoes && typeof entrada.decisoes === 'object' ? entrada.decisoes : {};
    const entregas = entrada.entregas && typeof entrada.entregas === 'object' ? entrada.entregas : {};
    const d = decisoes[id] && typeof decisoes[id] === 'object' ? decisoes[id] : {};
    const internas = [...new Set(linhas.flatMap(l => {
      const i = entregas[l.id] && typeof entregas[l.id] === 'object' ? entregas[l.id].interna : null;
      return i && typeof i === 'object' && i.situacao === 'elegivel' ? lista(i.partes).map(p => txt(p && p.pessoaId)).filter(Boolean) : [];
    }))];
    const base = {codigo:'pendente', rotulo:ROTULO_DECISAO.pendente, tipo:txt(d.tipo), tipoRotulo:ROTULO_TIPO[txt(d.tipo)] || '', recusada:false, justificativa:'', linhas, internas,
      incompleta:false, registrada:'', falta:[], automatica:!!linhas.length && linhas.every(l => l.perda === 'retrabalho_instalacao'),
      revisao:ap ? (revisao.revisao ?? null) : null, tipoRevisao:ap ? (revisao.tipo === 'aprovacao' ? 'aprovacao' : 'previa') : '', em:ap ? txt(revisao.em) : ''};
    if (!linhas.length || base.automatica) return base;
    const pend = linhas.flatMap(l => lista(l.pendencias));
    const codigo = String(linhas[0].decisao || '');
    if (pend.includes(MOTOR_SEM_DECISAO)) {
      const registrada = txt(d.decisao);
      if (!DECIDIDAS.includes(registrada)) return base;
      const falta = [txt(d.origem).length < 3 && 'a origem', txt(d.evidencia).length < 5 && 'a evidência', txt(d.justificativa).length < 5 && 'a justificativa',
        !TIPOS.includes(txt(d.tipo)) && 'o tipo da ocorrência'].filter(Boolean);
      return {...base, incompleta:true, registrada, falta};
    }
    if (!DECIDIDAS.includes(codigo) || linhas.some(l => l.decisao !== codigo)) return base;
    if (pend.includes(MOTOR_FALHA_FORA)) return {...base, recusada:true, justificativa:txt(d.justificativa)};
    return {...base, codigo, rotulo:ROTULO_DECISAO[codigo], justificativa:txt(d.justificativa)};
  }

  /* A REVISÃO QUE DECIDE num demonstrativo (R3): a última. Se a última é uma
     compensação (prévia ou aprovada, sem linhas), vale a última que não é, e
     a compensação vai junto para a tela avisar. */
  function escolherRevisao(revisoes) {
    const xs = lista(revisoes).filter(r => r && typeof r === 'object').slice().sort((a, b) => (Number(b.revisao) || 0) - (Number(a.revisao) || 0));
    const comp = r => !!(r.apuracao && typeof r.apuracao === 'object' && r.apuracao.compensacaoDe);
    const topo = xs[0] || null;
    if (!topo) return {revisao:null, compensacao:null};
    if (!comp(topo)) return {revisao:topo, compensacao:null};
    return {revisao:xs.find(r => !comp(r)) || null, compensacao:{tipo:topo.tipo === 'aprovacao' ? 'aprovacao' : 'previa', revisao:topo.revisao ?? null, em:txt(topo.em)}};
  }

  /* OS DEMONSTRATIVOS QUE A ABA LÊ (R1), da resposta do servidor: `revisoes`
     (o recorte exato, como o diálogo da comissão) e `cobrem` (os outros
     períodos que cobrem algum dia do recorte, resumidos). Um por período. */
  function demonstrativos(resposta, periodo = {}) {
    const p = periodo && typeof periodo === 'object' ? periodo : {};
    const grupos = new Map();
    const juntar = (r, exato) => {
      if (!r || typeof r !== 'object') return;
      const de = exato ? txt(p.de) || txt(r.de) : txt(r.de), ate = exato ? txt(p.ate) || txt(r.ate) : txt(r.ate);
      if (!de || !ate) return;
      const k = de + ':' + ate, g = grupos.get(k) || {de, ate, exato:!!exato || (de === txt(p.de) && ate === txt(p.ate)), revisoes:[]};
      g.revisoes.push(r);
      grupos.set(k, g);
    };
    for (const r of lista(resposta && resposta.revisoes)) juntar(r, true);
    for (const r of lista(resposta && resposta.cobrem)) juntar(r, false);
    return [...grupos.values()].map(g => ({de:g.de, ate:g.ate, exato:g.exato, ...escolherRevisao(g.revisoes)}))
      .filter(x => x.revisao || x.compensacao)
      .sort((a, b) => Number(b.exato) - Number(a.exato) || b.ate.localeCompare(a.ate) || b.de.localeCompare(a.de));
  }
  // O demonstrativo de uma O.S.: o que tem a O.S. (o do recorte exato primeiro, depois o de período mais recente); senão, o que cobre os dias dela (sem a linha dela).
  function demonstrativoDaOS(osId, dias, ds) {
    const id = String(osId ?? '');
    const tem = x => x.revisao && x.revisao.apuracao && lista(x.revisao.apuracao.linhas).some(l => l && String(l.osId) === id);
    const ordem = (a, b) => Number(!!b.exato) - Number(!!a.exato) || String(b.ate).localeCompare(String(a.ate))
      || String((b.revisao && b.revisao.em) || '').localeCompare(String((a.revisao && a.revisao.em) || ''));
    const comLinha = lista(ds).filter(tem).sort(ordem);
    if (comLinha.length) return {...comLinha[0], semLinha:false};
    const cobre = lista(ds).filter(x => lista(dias).some(dia => dia >= x.de && dia <= x.ate)).sort(ordem);
    return cobre.length ? {...cobre[0], semLinha:true} : null;
  }
  // Quantas O.S. a revisão decidiu (o motor aceitou, ou a perda automática): para a frase "que decidiu N O.S.".
  function decididas(revisao) {
    const ids = [...new Set(lista(revisao && revisao.apuracao && revisao.apuracao.linhas).map(l => String(l && l.osId || '')).filter(Boolean))];
    return ids.filter(id => { const d = decisaoDaOS(id, revisao); return d.codigo !== 'pendente' || d.automatica; }).length;
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

  /* A perda por FALHA COMPROVADA (D-004) só existe com a decisão aceita pelo
     motor. Centavos; null = não se sabe. `exato` falso: o demonstrativo é de
     outro período (o fechamento dele não está no aparelho), e a comissão
     perdida se calcula lá. */
  function perdaDaOS(decisao, contrafactual, exato = true) {
    if (!decisao || decisao.codigo !== 'falha_comprovada' || !decisao.linhas.length) return null;
    const soma = (xs, k) => xs.length && xs.every(l => Number.isSafeInteger(l[k])) ? xs.reduce((s, l) => s + l[k], 0) : null;
    const id = String(decisao.linhas[0].osId);
    const cf = exato && contrafactual ? lista(contrafactual.linhas).filter(l => l && String(l.osId) === id) : [];
    return {valorCentavos:soma(decisao.linhas, 'baseLiquidaCentavos'), comissaoCentavos:exato ? soma(cf, 'comissaoCentavos') : null, semMotor:exato && !contrafactual, outroPeriodo:!exato};
  }
  /* A perda AUTOMÁTICA do retrabalho de instalação (D-010): a base que deixa de
     pontuar é o valor da O.S. na apuração (as entregas dela no período); a
     comissão perdida é a da linha do demonstrativo (o motor gravou
     comissaoPerdidaCentavos) quando ele tem a O.S., senão o 1% que o motor dá
     para a mesma base (comissaoDaBase). */
  function perdaAutomatica(registros, decisao, motor) {
    const cents = lista(registros).map(r => r && Number.isFinite(r.valor) && r.valor >= 0 ? Math.round(r.valor * 100) : null);
    const valorCentavos = cents.length && cents.every(Number.isSafeInteger) ? cents.reduce((s, c) => s + c, 0) : null;
    const linhas = decisao && decisao.automatica ? decisao.linhas : [];
    if (linhas.length && linhas.every(l => Number.isSafeInteger(l.comissaoPerdidaCentavos)))
      return {valorCentavos, comissaoCentavos:linhas.reduce((s, l) => s + l.comissaoPerdidaCentavos, 0), automatica:true, doDemonstrativo:true};
    const comissaoCentavos = valorCentavos != null && motor && typeof motor.comissaoDaBase === 'function' ? motor.comissaoDaBase(valorCentavos) : null;
    return {valorCentavos, comissaoCentavos, automatica:true, doDemonstrativo:false};
  }

  /* A LISTA DO PERÍODO. registros: as entregas da apuração (a tela usa os
     mesmos do ranking); card(osId): a ficha; status(card): o status da
     entrega da ficha; noDia(card, dia): a régua do ranking. As decisões vêm
     de `demonstrativos` (ou de uma `revisao` só, a do recorte exato);
     `contrafactual` é o do demonstrativo do recorte exato. */
  function montar({registros = [], card = null, status = null, noDia = null, revisao = null, demonstrativos:demos = null, contrafactual = null,
    inicio = INICIO_PROGRAMA, periodo = null, regras = null, motor = null} = {}) {
    const RG = regras || regrasDe(), MT = motor || motorDe();
    const ds = Array.isArray(demos) ? demos.filter(x => x && typeof x === 'object')
      : revisao ? [{de:txt(revisao.de), ate:txt(revisao.ate), exato:true, revisao, compensacao:null}] : [];
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
    const linhas = [], naoMedido = {atraso:0, retorno:0};
    let semFicha = 0;
    for (const x of porOS.values()) {
      let c = null;
      try { c = typeof card === 'function' ? card(x.osId) : null; } catch { c = null; }
      if (!c) semFicha++;
      let st = null;
      try { st = c && typeof status === 'function' ? status(c) : null; } catch { st = null; }
      const regs = x.registros.map(r => ({dia:txt(r.dia) || String((r.os && r.os.finalizadaEm) || '').slice(0, 10), retrabalho:r.retrabalho === true || !!(r.os && r.os.retrabalho === true),
        ...(temCampo(r, 'etapaOrigem') ? {etapaOrigem:r.etapaOrigem} : {}), ...(r.perda ? {perda:r.perda} : {})}));
      const oc = ocorrenciasDaOS({card:c, st, registros:regs, noDia:c && typeof noDia === 'function' ? dia => noDia(c, dia) : null, regras:RG});
      const dias = [...new Set(regs.map(r => r.dia).filter(Boolean))].sort();
      const antes = !!dias.length && dias.every(dia => dia < inicio);
      if (!antes) { if (oc.naoMedido.atraso) naoMedido.atraso++; if (oc.naoMedido.retorno) naoMedido.retorno++; }
      if (!oc.tipos.length) continue;
      const dem = demonstrativoDaOS(x.osId, dias, ds);
      const decisao = {...decisaoDaOS(x.osId, dem && !dem.semLinha ? dem.revisao : null),
        demonstrativo:dem ? {de:dem.de, ate:dem.ate, exato:!!dem.exato, semLinha:!!dem.semLinha, compensacao:dem.compensacao || null} : null};
      const grupo = antes ? 'antes' : oc.retrabalho ? (GRUPO_DO_EFEITO[oc.retrabalho.efeito] || 'outra') : 'ocorrencia';
      const pessoas = new Map(), equipes = new Set();
      for (const r of x.registros) {
        for (const m of lista(r.membros)) { const k = String(m && m.chave || '').trim(); if (k && !pessoas.has(k)) pessoas.set(k, {chave:k, nome:String(m.nome || k)}); }
        for (const g of lista(r.grupos)) if (g && g.equipeNome) equipes.add(String(g.equipeNome));
        if (r.equipeNome) equipes.add(String(r.equipeNome));
      }
      const perda = antes ? null : grupo === 'perda' ? perdaAutomatica(x.registros, decisao, MT) : perdaDaOS(decisao, contrafactual, !dem || !!dem.exato);
      const efeito = antes ? efeitoAntes(inicio)
        : (grupo === 'perda' || grupo === 'definir') ? oc.retrabalho.texto
        : decisao.codigo === 'falha_comprovada' ? EFEITO.falha_comprovada
        : grupo === 'outra' ? oc.retrabalho.texto
        : EFEITO[decisao.codigo];
      linhas.push({osId:x.osId, numero:x.numero || txt(c && String(c.numero ?? '')), cliente:x.cliente || txt(c && c.cliente), dias, antes, grupo,
        pessoas:[...pessoas.values()], equipes:[...equipes], ocorrencias:oc, decisao, perda, efeito});
    }
    const ordemGrupo = g => GRUPOS.indexOf(g);
    linhas.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || String(b.dias[b.dias.length - 1] || '').localeCompare(String(a.dias[a.dias.length - 1] || ''))
      || String(a.numero).localeCompare(String(b.numero), 'pt-BR', {numeric:true}));
    const doGrupo = g => linhas.filter(l => l.grupo === g);
    // O QUE PEDE AÇÃO (o ponto de atenção): a origem a definir, e a decisão da comissão registrada sem documento completo (U4).
    const aDefinir = doGrupo('definir');
    const pendentes = new Set(aDefinir.flatMap(l => [...l.pessoas.map(p => p.chave), ...l.decisao.internas]));
    const incompletas = linhas.filter(l => !l.antes && l.decisao.incompleta);
    const comPerda = linhas.filter(l => l.perda);
    const total = k => comPerda.length && comPerda.every(l => Number.isSafeInteger(l.perda[k])) ? comPerda.reduce((s, l) => s + l.perda[k], 0) : null;
    return {linhas, resumo:{os:linhas.length, total:porOS.size, semFicha,
      grupos:Object.fromEntries(GRUPOS.map(g => [g, doGrupo(g).length])),
      origemADefinir:aDefinir.length, pessoasPendentes:pendentes.size, decisaoIncompleta:incompletas.length,
      perdaInstalacao:doGrupo('perda').length, comFalha:comPerda.filter(l => !l.perda.automatica).length, comPerda:comPerda.length,
      valorCentavos:total('valorCentavos'), comissaoCentavos:total('comissaoCentavos'), naoMedido,
      antes:doGrupo('antes').length, periodoAntes:!!(periodo && txt(periodo.ate) && txt(periodo.ate) < inicio)}};
  }

  return {EFEITO, NOTA_RANKING, OCORRENCIA_REGISTRADA, ROTULO_DECISAO, ROTULO_TIPO, ROTULO_OCORRENCIA, ETAPAS_FORA, GRUPOS, ROTULO_GRUPO, INICIO_PROGRAMA, dataBR,
    ocorrenciasDaOS, decisaoDaOS, escolherRevisao, demonstrativos, demonstrativoDaOS, decididas, semFalhas, perdaDaOS, perdaAutomatica, montar};
})();
if (typeof module !== 'undefined') module.exports = PERDAS;

/* ======================== A TELA (index.html; admin e pcp) ========================
   Daqui para baixo roda só no navegador, com casa.js, performance.js e
   comissao.js carregados. As decisões da comissão vêm do servidor
   (performanceComissaoListar, a mesma consulta do demonstrativo), uma vez por
   período: `revisoes` (o recorte exato) e `cobrem` (os demonstrativos de
   outros períodos que cobrem dias do recorte; servidor anterior não manda, e
   aí fica null). O servidor recusa quem não é admin nem pcp. */
let perdasRemoto = {chave:'', revisoes:null, cobrem:null, carregando:false, erro:'', tentado:false};
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
  const mesma = perdasRemoto.chave === chave;
  const pedido = {chave, revisoes:mesma ? perdasRemoto.revisoes : null, cobrem:mesma ? perdasRemoto.cobrem : null, carregando:true, erro:'', tentado:true};
  perdasRemoto = pedido;
  try {
    const r = await STORE.api({action:'performanceComissaoListar', de:f.de, ate:f.ate});
    if (!r || !Array.isArray(r.revisoes)) throw new Error((r && r.error) || 'Resposta inesperada do servidor.');
    pedido.revisoes = r.revisoes;
    pedido.cobrem = Array.isArray(r.cobrem) ? r.cobrem : null;
  } catch (e) { pedido.revisoes = null; pedido.cobrem = null; pedido.erro = typeof perfErroTxt === 'function' ? perfErroTxt(e) : String((e && e.message) || e); }
  finally {
    pedido.carregando = false;
    if (perdasRemoto === pedido && perfChave() === chave && typeof renderPerformanceCasa === 'function') renderPerformanceCasa();
  }
}
// O status da ficha (com a regra e a volta do dia, como a ficha mostra) e a régua do ranking.
function perdasStatus(c) {
  if (typeof statusEntregaDe === 'function') return statusEntregaDe(c);
  try { return OPERACAO.statusEntrega(c); } catch { return null; }
}
// O dia da entrega do ranking no lugar da entrega da ficha: o mesmo jeito da célula de comissão do Por O.S.
function perdasNoDia(c, dia) {
  try { return OPERACAO.statusEntrega({...c, finalizadaEm:dia + 'T12:00:00-03:00', entregaLancada:{data:dia}}); } catch { return null; }
}
function perdasDados() {
  if (!perdasPode()) return null;
  const chave = perfChave(), f = periodoOuMes('_fPerf');
  const minha = perdasRemoto.chave === chave;
  const consultada = minha && Array.isArray(perdasRemoto.revisoes);
  // "Consultando" só quando não há leitura nenhuma deste período; com uma, ela vale até a nova chegar.
  const decisoes = {consultada, consultando:!consultada && (!minha || !perdasRemoto.tentado || perdasRemoto.carregando), recarregando:minha && perdasRemoto.carregando,
    erro:minha ? perdasRemoto.erro : '', semCobertura:consultada && !Array.isArray(perdasRemoto.cobrem)};
  const fonte = typeof perfFonteAtual === 'function' ? perfFonteAtual() : null;
  if (!fonte) return {carregando:true, erro:(typeof perfRemoto === 'object' && perfRemoto && perfRemoto.erro) || '', decisoes};
  const demonstrativos = consultada ? PERDAS.demonstrativos({revisoes:perdasRemoto.revisoes, cobrem:perdasRemoto.cobrem || []}, f) : [];
  const exato = demonstrativos.find(x => x.exato && x.revisao) || null;
  const fechamento = exato && typeof perfRemoto === 'object' && perfRemoto && Array.isArray(perfRemoto.fechamentos) ? perfRemoto.fechamentos.find(x => x && x.id === exato.revisao.fechamentoId) || null : null;
  const contrafactual = exato && fechamento && typeof COMISSAO !== 'undefined' ? PERDAS.semFalhas(COMISSAO, fechamento, exato.revisao) : null;
  const inicio = (typeof REGRAS !== 'undefined' && REGRAS && REGRAS.REGRA_EMBUTIDA && REGRAS.REGRA_EMBUTIDA.validaDesde) || PERDAS.INICIO_PROGRAMA;
  const m = PERDAS.montar({registros:perfRegsDoPeriodo(), card:id => STORE.getOS(id), status:perdasStatus, noDia:perdasNoDia, demonstrativos, contrafactual, inicio, periodo:f});
  return {...m, carregando:false, decisoes, demonstrativos, revisao:exato ? exato.revisao : null, fechamento, inicio};
}
const perdasDDMM = dia => { const s = String(dia || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''; };
const perdasQuando = iso => { const t = Date.parse(String(iso || '')); return Number.isFinite(t) ? new Date(t).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : String(iso || ''); };
const perdasDinheiro = c => c == null ? 'a apurar' : dinheiroCasa(c / 100);
const perdasPeriodoTxt = x => `${PERDAS.dataBR(x.de)} a ${PERDAS.dataBR(x.ate)}`;
// "a origem e a evidência"
const perdasJuntar = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1] : xs.join('');
// "Retrabalho, atraso e retorno antecipado"
function perdasTiposTxt(oc) {
  const n = (oc && Array.isArray(oc.tipos) ? oc.tipos : []).map((t, i) => { const r = PERDAS.ROTULO_OCORRENCIA[t] || t; return i ? r.toLowerCase() : r; });
  return perdasJuntar(n);
}
// Uma régua do atraso, em uma linha.
function perdasReguaTxt(nome, r) {
  if (!r) return `${nome}: sem prazo combinado para medir`;
  if (r.entregue === false) return `${nome}: prazo ${perdasDDMM(r.prazo)}, sem entrega registrada`;
  if (!r.entrega) return `${nome}: prazo ${perdasDDMM(r.prazo)}, sem a data da entrega (o prazo ainda não foi julgado)`;
  return `${nome}: prazo ${perdasDDMM(r.prazo)}, entrega ${perdasDDMM(r.entrega)}: ${r.dias ? `${r.dias} ${r.dias === 1 ? 'dia' : 'dias'} de atraso` : 'no prazo'}${r.abonado ? ' (abonado)' : ''}`;
}
// O ponto final da frase da régua: "desta O.S." já termina em ponto.
const perdasPonto = t => !t ? '' : /[.!?]$/.test(t) ? t : t + '.';
// As frases da régua (regras.js, TEXTOS_PERDA), com a reserva para a aba presa com o regras.js antigo no cache.
function perdasTextos() {
  const t = typeof REGRAS !== 'undefined' && REGRAS && REGRAS.TEXTOS_PERDA ? REGRAS.TEXTOS_PERDA : {};
  return {ocorrencia:t.ocorrencia || PERDAS.OCORRENCIA_REGISTRADA,
    retrabalhoInstalacao:t.retrabalhoInstalacao || 'Retrabalho de instalação: tira os pontos e a comissão desta O.S.',
    retrabalhoDefinir:t.retrabalhoDefinir || 'Retrabalho com origem a definir: defina a origem; até lá não tira nada e a comissão desta O.S. fica pendente',
    naoSeAbona:t.naoSeAbona || 'Retrabalho de instalação não se abona: quem discorda da origem troca a origem, com motivo'};
}
// O que aconteceu na O.S.: na aba de Perdas e no diálogo de decisão da comissão.
function perdasOcorrenciaListaHTML(oc) {
  const itens = [], T = perdasTextos();
  if (oc.retrabalho) {
    const r = oc.retrabalho, partes = [r.etapa ? `origem: ${esc(r.etapa)}` : '<strong>origem a definir</strong>'];
    if (r.causa) partes.push(`causa: ${esc(r.causa)}`);
    if (r.problema) partes.push(`problema: ${esc(r.problema)}`);
    if (r.marcadoPor || r.marcadoEm) partes.push(`marcado${r.marcadoPor ? ' por ' + esc(r.marcadoPor) : ''}${r.marcadoEm ? ' em ' + esc(perdasQuando(r.marcadoEm)) : ''}`);
    else if (r.data) partes.push(`dia do retrabalho: ${esc(perdasDDMM(r.data))}`);
    if (oc.semFicha) partes.push('marcado na apuração');
    const efeito = r.texto ? `<span class="bloco perf-perda-efeito">${esc(perdasPonto(r.texto))}</span>` : '';
    // A ficha mudou a origem depois da consulta: o ranking e a comissão ainda têm a de antes.
    const diverge = r.apuracaoDiverge ? '<span class="bloco">A apuração do ranking ainda tem a origem de antes: toque em Atualizar apuração.</span>' : '';
    itens.push(`<li><strong>Retrabalho</strong> · ${partes.join(' · ')}${efeito}${diverge}</li>`);
  }
  if (oc.atraso) {
    const a = oc.atraso, f = a.ficha;
    // D-011: o atraso fica registrado, sem efeito sozinho; o abonado fica justificado.
    const efeito = `<span class="bloco perf-perda-efeito">${esc(a.abonado ? 'Atraso abonado: fica justificado' : T.ocorrencia)}.</span>`;
    // A segunda régua é o dia que o ranking usa; ele não desconta atraso (U9).
    itens.push(a.divergem
      ? `<li><strong>Atraso</strong>, as duas datas dão atrasos diferentes:<ul><li>${esc(perdasReguaTxt('Ficha', f))}</li><li>${esc(perdasReguaTxt('Dia da entrega usado no ranking (não desconta atraso)', a.apuracao))}</li></ul>${efeito}</li>`
      : `<li><strong>Atraso</strong> de ${f.dias} ${f.dias === 1 ? 'dia' : 'dias'}: prazo ${esc(perdasDDMM(f.prazo))}, entrega ${esc(perdasDDMM(f.entrega))}${a.abonado ? ' (abonado)' : ''}. As duas datas dão o mesmo atraso.${efeito}</li>`);
  } else if (oc.naoMedido && oc.naoMedido.atraso) itens.push(`<li class="perf-perda-naomedido"><strong>Atraso</strong>: não medido (${esc(oc.naoMedido.atraso)})</li>`);
  for (const r of oc.retorno) itens.push(`<li><strong>Retorno antecipado</strong> em ${esc(perdasDDMM(r.dia))}: ${r.minutos} minutos antes do retorno previsto${r.abonado ? ' (abonado)' : ''}<span class="bloco perf-perda-efeito">${esc(r.abonado ? 'Retorno antecipado abonado: fica justificado' : T.ocorrencia)}.</span></li>`);
  if (!oc.retorno.length && oc.naoMedido && oc.naoMedido.retorno) itens.push(`<li class="perf-perda-naomedido"><strong>Retorno antecipado</strong>: não medido (${esc(oc.naoMedido.retorno)})</li>`);
  for (const a of oc.abonos) itens.push(`<li><strong>Abono do ${a.tipo === 'atraso' ? 'atraso' : 'retorno antecipado'}</strong>: ${esc(a.motivo)}${a.por ? ' · por ' + esc(a.por) : ''}${a.em ? ' em ' + esc(perdasQuando(a.em)) : ''}${a.pendente ? ' (a enviar)' : ''}</li>`);
  if (oc.semFicha) itens.push('<li class="perf-perda-semficha">A ficha desta O.S. não está neste aparelho: o atraso e o retorno antecipado só aparecem com ela.</li>');
  return itens.length ? `<ul class="perf-perda-ocorrencias">${itens.join('')}</ul>` : '<p class="perf-perda-nenhuma">Nenhuma ocorrência de retrabalho, atraso ou retorno antecipado nesta O.S.</p>';
}
// O diálogo de decisão da comissão (comissao-ui.js) mostra o que está sendo julgado (itens 14 e 26 da fila).
function perdasOcorrenciaDaOS(osId, registros) {
  const id = String(osId ?? '');
  const c = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' ? STORE.getOS(id) : null;
  const tem = (r, k) => Object.prototype.hasOwnProperty.call(r, k);
  const regs = (Array.isArray(registros) ? registros : []).filter(r => r && String(r.osId || r.id) === id)
    .map(r => ({dia:String(r.dia || ''), retrabalho:r.retrabalho === true, ...(tem(r, 'etapaOrigem') ? {etapaOrigem:r.etapaOrigem} : {}), ...(r.perda ? {perda:r.perda} : {})}));
  return PERDAS.ocorrenciasDaOS({card:c, st:c ? perdasStatus(c) : null, registros:regs, noDia:c ? dia => perdasNoDia(c, dia) : null});
}
function perdasJulgadaHTML(oc) {
  return `<div class="comissao-ocorrencia" role="group" aria-label="Ocorrência em julgamento"><p><strong>Ocorrência em julgamento</strong></p>${perdasOcorrenciaListaHTML(oc)}</div>`;
}
// A compensação no topo do demonstrativo (R3): a decisão que vale é a da revisão anterior a ela.
function perdasCompensacaoTxt(c) {
  if (!c) return '';
  return c.tipo === 'aprovacao' ? `A aprovação deste demonstrativo foi compensada (revisão ${c.revisao}): ele está zerado até uma nova aprovação.`
    : `Há uma compensação em preparo (revisão ${c.revisao}, prévia): até ela ser aprovada, vale esta decisão.`;
}
function perdasDecisaoHTML(l) {
  const dec = l.decisao, dem = dec.demonstrativo;
  if (l.antes) return '<strong>Sem comissão</strong><small class="bloco">Entregue antes do programa.</small>';
  // D-010: o retrabalho de instalação é perda automática; a origem a definir deixa a comissão pendente.
  if (l.grupo === 'perda') return `<strong>Perda automática</strong><small class="bloco">Retrabalho de instalação: não pede decisão no demonstrativo da comissão. ${esc(perdasPonto(perdasTextos().naoSeAbona))}</small>`;
  if (l.grupo === 'definir') return '<strong>Pendente: a origem do retrabalho</strong><small class="bloco">Até a gestão definir a origem na ficha, a comissão desta O.S. fica pendente no demonstrativo (não paga e não perde).</small>';
  if (dem && dem.semLinha) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Esta O.S. não está no demonstrativo de ${esc(perdasPeriodoTxt(dem))}: entrou depois do fechamento.</small>`;
  const onde = dem && !dem.exato ? ` (demonstrativo de ${perdasPeriodoTxt(dem)})` : '';
  const rev = dec.revisao != null ? `<small class="bloco">Lida da revisão ${esc(String(dec.revisao))} da comissão, ${dec.tipoRevisao === 'aprovacao' ? 'aprovada' : 'prévia'}${dec.em ? ', de ' + esc(perdasQuando(dec.em)) : ''}${esc(onde)}.</small>` : '';
  const comp = dem && dem.compensacao ? `<small class="bloco">${esc(perdasCompensacaoTxt(dem.compensacao))}</small>` : '';
  if (dec.incompleta) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Decisão registrada (${esc(PERDAS.ROTULO_DECISAO[dec.registrada] || dec.registrada)}), sem documento completo: falta ${esc(perdasJuntar(dec.falta))}. O demonstrativo só aceita a decisão documentada.</small>${rev}${comp}`;
  if (dec.recusada) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Falha registrada como ${esc(dec.tipoRotulo || dec.tipo)}: o demonstrativo não aceita, porque não é falha da instalação.</small>${rev}${comp}`;
  if (dec.codigo === 'pendente') return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong>${rev || `<small class="bloco">${dem ? 'Sem decisão no demonstrativo da comissão.' : 'Nenhum demonstrativo da comissão cobre esta entrega.'}</small>`}${comp}`;
  return `<strong>${esc(dec.rotulo)}</strong>${dec.tipoRotulo ? ` (${esc(dec.tipoRotulo)})` : ''}${dec.justificativa ? `<small class="bloco">${esc(dec.justificativa)}</small>` : ''}${rev}${comp}`;
}
// "Definir a origem": a ficha abre na Jornada, onde fica o Retrabalho (Embarque e Execução).
function perdasDefinirOrigemHTML(l) {
  const temFicha = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' && !!STORE.getOS(l.osId);
  return temFicha ? `<button type="button" class="btn-primary btn-sm" data-os-id="${esc(l.osId)}" data-ficha-etapa="jornada">Definir a origem da O.S. ${esc(l.numero || l.osId)}</button>`
    : `<button type="button" class="btn-primary btn-sm" data-perdas-abrir="${esc(l.osId)}" data-numero="${esc(l.numero)}" data-etapa="jornada">Definir a origem da O.S. ${esc(l.numero || l.osId)}</button>`;
}
function perdasEfeitoHTML(l) {
  const p = l.perda, dem = l.decisao.demonstrativo;
  // A nota do ranking vai em linha própria, sem negrito: o efeito fica curto de ler.
  const nota = l.efeito.endsWith(PERDAS.NOTA_RANKING) ? l.efeito.length - PERDAS.NOTA_RANKING.length : -1;
  const efeito = nota > 0 ? `<strong>${esc(l.efeito.slice(0, nota).trim())}</strong><span class="bloco">${esc(PERDAS.NOTA_RANKING)}</span>` : `<strong>${esc(perdasPonto(l.efeito))}</strong>`;
  if (l.grupo === 'definir') return `${efeito}<span class="bloco perf-perdas-acao">${perdasDefinirOrigemHTML(l)}</span>`;
  if (!p) return efeito;
  if (p.automatica) return `${efeito}<span class="bloco">Base que deixa de pontuar: ${esc(perdasDinheiro(p.valorCentavos))}</span><span class="bloco">Comissão perdida: ${esc(perdasDinheiro(p.comissaoCentavos))}${p.comissaoCentavos == null ? '' : p.doDemonstrativo ? ' (do demonstrativo da comissão)' : ' (1% da base, pelo motor da comissão)'}</span>`;
  const comissao = p.comissaoCentavos != null ? esc(perdasDinheiro(p.comissaoCentavos))
    : p.outroPeriodo && dem ? `a calcular no período do demonstrativo (${esc(perdasPeriodoTxt(dem))}) <button type="button" class="btn-ghost btn-sm" data-perdas-periodo="${esc(dem.de + '|' + dem.ate)}">Ver o período do demonstrativo</button>`
    : p.semMotor ? 'a calcular: o fechamento desta revisão ainda não chegou a este aparelho'
    : 'a apurar: o demonstrativo tem pendências nesta O.S.';
  return `${efeito}<span class="bloco">Base que deixa de gerar comissão: ${esc(perdasDinheiro(p.valorCentavos))}</span><span class="bloco">Comissão perdida: ${comissao}</span>`;
}
// O selo e a cor do cartão, pelo grupo (e, nas outras ocorrências, pela decisão da comissão).
function perdasSeloDe(l) {
  if (l.grupo === 'antes') return {classe:'antes', texto:'Antes do programa'};
  if (l.grupo === 'definir') return {classe:'pendente', texto:'Origem a definir'};
  if (l.grupo === 'perda') return {classe:'falha', texto:'Perda: retrabalho de instalação'};
  if (l.decisao.codigo === 'falha_comprovada') return {classe:'falha', texto:'Falha comprovada'};
  if (l.grupo === 'outra') return {classe:'ok', texto:`Retrabalho de ${String(l.ocorrencias.retrabalho && l.ocorrencias.retrabalho.etapa || '').toLowerCase()}`};
  return {classe:'ok', texto:l.decisao.codigo === 'pendente' ? 'Ocorrência registrada' : l.decisao.rotulo};
}
function perdasCartaoHTML(l, i) {
  const id = 'perf-perda-' + i, selo = perdasSeloDe(l);
  const temFicha = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' && !!STORE.getOS(l.osId);
  const numero = esc(l.numero || l.osId), etapa = l.grupo === 'definir' ? 'jornada' : 'fechamento';
  const abrir = temFicha ? `<button type="button" class="inline-link" data-os-id="${esc(l.osId)}" data-ficha-etapa="${etapa}">O.S. ${numero}</button>`
    : `<button type="button" class="inline-link" data-perdas-abrir="${esc(l.osId)}" data-numero="${esc(l.numero)}" data-etapa="${etapa}">O.S. ${numero}</button>`;
  const dias = l.dias.map(perdasDDMM).filter(Boolean).join(', ');
  const gente = `${l.equipes.length ? `<span class="bloco">${esc(l.equipes.join(', '))}</span>` : ''}${l.pessoas.map(p => esc(p.nome)).join(', ') || 'Sem participantes na apuração'}`;
  return `<article class="perf-perda perf-perda-${selo.classe}" aria-labelledby="${id}"><header><h5 id="${id}">${abrir} <span class="perf-perda-cliente">${esc(l.cliente)}</span></h5>${dias ? `<span class="perf-perda-dia">Entrega ${esc(dias)}</span>` : ''}<span class="badge perf-perda-selo">${esc(selo.texto)}</span></header>
    <dl class="perf-perda-grade"><div><dt>Equipe e pessoas</dt><dd>${gente}</dd></div><div><dt>Ocorrência</dt><dd>${perdasOcorrenciaListaHTML(l.ocorrencias)}</dd></div><div><dt>Decisão da comissão</dt><dd>${perdasDecisaoHTML(l)}</dd></div><div><dt>Efeito atual</dt><dd>${perdasEfeitoHTML(l)}</dd></div></dl></article>`;
}
/* O CAMINHO PARA JULGAR UMA OCORRÊNCIA (revisão da onda w3, U3). A decisão só
   existe no demonstrativo da comissão, e ele só abre sobre um período
   fechado; o fechamento só sai com todas as entregas conferidas. A frase diz
   os três passos, e o botão leva ao próximo de verdade. */
function perdasPasso() {
  const n = typeof perfConferenciaPendentes === 'function' ? perfConferenciaPendentes() : 0;
  const fechado = typeof perfRemoto === 'object' && perfRemoto && perfRemoto.chave === perfChave() && Array.isArray(perfRemoto.fechamentos) && perfRemoto.fechamentos.length > 0;
  if (n) return {acao:'conferir', botao:n === 1 ? 'Conferir a entrega que falta' : `Conferir as ${n} entregas`,
    texto:`Para julgar no demonstrativo: ${n === 1 ? 'confira a entrega que falta' : `confira as ${n} entregas que faltam`} (aba Conferência), feche o período em Rankings › Base e fechamento e abra Comissão.`};
  if (!fechado) return {acao:'fechar', botao:'Ir para Base e fechamento', texto:'Para julgar no demonstrativo: feche o período em Rankings › Base e fechamento e abra Comissão.'};
  return {acao:'comissao', botao:'Abrir o demonstrativo da comissão', texto:'Para julgar: abra Comissão · demonstrativo e aprovação e registre a decisão de cada O.S.'};
}
const perdasPassoBotaoHTML = p => `<button type="button" class="btn-primary btn-sm" data-perdas-passo="${esc(p.acao)}">${esc(p.botao)}</button>`;
function perdasIrPasso(acao) {
  if (acao === 'conferir' && typeof perfIrParaConferencia === 'function') return perfIrParaConferencia({situacao:'pendente'});
  if (acao === 'comissao' && typeof perfComissaoAbrir === 'function' && typeof perfRemoto === 'object' && perfRemoto && Array.isArray(perfRemoto.fechamentos) && perfRemoto.fechamentos.length) {
    // O demonstrativo abre sobre a última revisão do fechamento (a que o servidor aceita para a prévia nova).
    perfRemoto.selecionado = perfRemoto.fechamentos[0].id;
    STATE._perfAba = 'equipe';
    renderPerformanceCasa();
    void perfComissaoAbrir().catch(e => { if (typeof toast === 'function') toast(String((e && e.message) || e), 'error'); });
    return;
  }
  // Fechar: o quadro Base e fechamento, aberto e à vista, nos Rankings.
  STATE._perfAba = 'equipe';
  try { const q = typeof lerQuadrosCasa === 'function' ? lerQuadrosCasa() : {}; q['perf-base'] = true; localStorage.setItem('impresilk_inst_quadros', JSON.stringify(q)); } catch { /* sem memória, o quadro abre só agora */ }
  renderPerformanceCasa();
  const q = typeof document !== 'undefined' && document.querySelector ? document.querySelector('[data-quadro="perf-base"]') : null;
  if (q) {
    q.open = true;
    if (typeof q.scrollIntoView === 'function') q.scrollIntoView({behavior:'smooth', block:'start'});
    const b = typeof q.querySelector === 'function' ? q.querySelector('#perf-fechar') : null;
    if (b && typeof b.focus === 'function') try { b.focus({preventScroll:true}); } catch { b.focus(); }
  }
}
/* O PONTO DE ATENÇÃO no alto da Performance, em todas as abas: SÓ o que pede
   ação (D-010 e D-011). O retrabalho com a origem a definir (a gestão define
   na ficha; até lá a comissão da O.S. fica pendente) aparece assim que a
   apuração chega; a decisão da comissão gravada sem documento completo (U4),
   só depois de as decisões chegarem. Atraso e retorno antecipado não entram:
   ficam registrados e não tiram nada sozinhos. */
function perdasPontoHTML(d) {
  if (!d || d.carregando || !d.resumo) return '';
  const x = d.resumo.origemADefinir || 0, y = d.resumo.pessoasPendentes || 0;
  const z = d.decisoes && !d.decisoes.consultando ? d.resumo.decisaoIncompleta || 0 : 0;
  if (!x && !z) return '';
  const partes = [];
  if (x) partes.push(`${x} O.S. com retrabalho de origem a definir: defina a origem na ficha. Até lá ${x === 1 ? 'ela não tira' : 'elas não tiram'} nada e a comissão ${y === 1 ? 'de 1 pessoa fica' : `de ${y} pessoas fica`} pendente.`);
  if (z) partes.push(`${z} ${z === 1 ? 'decisão da comissão registrada' : 'decisões da comissão registradas'} sem documento completo: o demonstrativo só aceita a decisão documentada.`);
  const primeira = x === 1 ? d.linhas.find(l => l.grupo === 'definir') : null;
  const passo = z && typeof perfChave === 'function' ? perdasPasso() : null;
  return `<section class="perf-atencao" role="status" aria-labelledby="perf-atencao-titulo"><p><strong id="perf-atencao-titulo"><span aria-hidden="true">⚠</span> Ponto de atenção:</strong> ${esc(partes.join(' '))}</p><div class="perf-atencao-acoes"><button type="button" class="btn-ghost btn-sm" data-perf-ir="perdas">Ver as perdas por retrabalho</button>${primeira ? perdasDefinirOrigemHTML(primeira) : ''}${passo ? perdasPassoBotaoHTML(passo) : ''}</div></section>`;
}
// O número do selo da aba: as O.S. com perda (retrabalho de instalação) ou com a origem a definir; 0 enquanto a apuração não chega.
const perdasContagem = d => d && !d.carregando && d.resumo ? (d.resumo.perdaInstalacao || 0) + (d.resumo.origemADefinir || 0) : 0;
// De onde vieram as decisões (R1 e R3): o demonstrativo do recorte, o que cobre os dias dele, ou nenhum.
function perdasFonteTxt(d) {
  const dec = d.decisoes, r = d.resumo, ds = Array.isArray(d.demonstrativos) ? d.demonstrativos : [];
  if (dec.consultando) return 'Consultando as decisões da comissão deste período…';
  if (dec.erro) return `Não foi possível consultar as decisões da comissão (${dec.erro}). Enquanto isso, as ocorrências aparecem sem julgamento da gestão.`;
  if (r.periodoAntes) return 'Período anterior ao programa: sem comissão; as ocorrências ficam só como registro.';
  if (!ds.length) return dec.semCobertura ? 'Nenhuma revisão da comissão neste período: nenhuma ocorrência foi julgada no demonstrativo.'
    : 'Nenhum demonstrativo da comissão cobre este recorte: nenhuma ocorrência foi julgada no demonstrativo.';
  const rev = x => x.revisao ? `revisão ${x.revisao.revisao}, ${x.revisao.tipo === 'aprovacao' ? 'aprovada' : 'prévia'}${x.revisao.em ? ', ' + perdasQuando(x.revisao.em) : ''}` : 'sem revisão com decisões';
  const comp = x => x.compensacao ? ' ' + perdasCompensacaoTxt(x.compensacao) : '';
  const exato = ds.find(x => x.exato), outros = ds.filter(x => !x.exato);
  const doExato = exato ? `Decisões lidas da comissão deste período (${rev(exato)}).${comp(exato)}` : 'Este recorte não é o período de um demonstrativo.';
  if (!outros.length) return doExato;
  const um = x => `de ${perdasPeriodoTxt(x)} (${rev(x)}), que decidiu ${PERDAS.decididas(x.revisao)} O.S.${comp(x)}`;
  return `${doExato} ${exato ? 'Para as entregas de fora dele, as decisões vêm' : 'As decisões vêm'} ${outros.length === 1 ? 'do demonstrativo' : 'dos demonstrativos'} ${outros.map(um).join('; ')}`;
}
// A RÉGUA À VISTA, no topo da aba: as frases de regras.js, as mesmas da ficha e da comissão.
function perdasReguaHTML() {
  const T = perdasTextos();
  return `<div class="perf-perdas-regra"><p><strong>A régua das perdas (decisão do dono, 11/10/2026)</strong></p><ul>
    <li>${esc(T.retrabalhoInstalacao)}, de todas as pessoas e equipes dela, inclusive a parcela da montagem interna.</li>
    <li>Retrabalho de medição, arte ou produção: não tira nada da instalação.</li>
    <li>${esc(perdasPonto(T.retrabalhoDefinir))}</li>
    <li>Atraso e retorno antecipado: ${esc(T.ocorrencia.charAt(0).toLowerCase() + T.ocorrencia.slice(1))}.</li>
    <li>${esc(perdasPonto(T.naoSeAbona))}</li></ul></div>`;
}
const PERDAS_GRUPO_TXT = Object.freeze({
  definir:'Defina a origem na ficha de cada O.S. (Jornada, Embarque e Execução, Retrabalho). Até lá não tira nada e a comissão da O.S. fica pendente.',
  perda:'Tiram os pontos e a comissão destas O.S., de todas as pessoas e equipes, inclusive a parcela da montagem interna. Quem discorda da origem troca a origem na ficha, com motivo.',
  outra:'Medição, arte ou produção: não tira nada da instalação. Fica para acompanhamento.',
  ocorrencia:'Atraso e retorno antecipado ficam registrados na O.S. e não tiram nada sozinhos. A gestão pode julgar cada um como falha comprovada no demonstrativo da comissão.',
  antes:'Entregues antes do programa: sem comissão; a ocorrência fica só como registro.',
});
function perdasAbaHTML(d) {
  const f = periodoOuMes('_fPerf');
  const cabeca = `<div class="perf-controls">${perfPeriodoCompactoHTML(f)}</div><div class="perf-perdas-cabeca"><h3 id="perf-perdas-titulo">Perdas por retrabalho</h3><p>O.S. do período com retrabalho, atraso ou retorno antecipado: o que tira os pontos e a comissão, o que fica pendente, o que só fica registrado e o que a comissão decidiu. Só leitura.</p></div>`;
  const regra = perdasReguaHTML();
  if (!d || d.carregando) return `<section class="perf-perdas" aria-labelledby="perf-perdas-titulo">${cabeca}${regra}<p role="status">${d && d.erro ? 'Não foi possível consultar a apuração. Nenhuma perda foi inferida.' : 'Consultando a apuração do período…'}</p>${typeof perfAvisosHTML === 'function' ? perfAvisosHTML(true) : ''}</section>`;
  const r = d.resumo, dec = d.decisoes, g = r.grupos || {};
  const semFicha = r.semFicha ? `<p class="perf-aviso">${r.semFicha === 1 ? '1 O.S. do período não está neste aparelho: o atraso e o retorno antecipado dela só aparecem' : `${r.semFicha} O.S. do período não estão neste aparelho: o atraso e o retorno antecipado delas só aparecem`} com a ficha. <button type="button" class="btn-ghost btn-sm" data-perdas-buscar>Buscar as fichas no servidor</button></p>` : '';
  const chip = (n, t) => `<span><b>${n}</b> ${t}</span>`;
  const dinheiro = (c, t, sem) => `<span><b>${c == null ? 'A apurar' : esc(perdasDinheiro(c))}</b> ${c == null ? sem : t}</span>`;
  const resumo = `<div class="perf-perdas-resumo" role="group" aria-label="Resumo do período">${chip(g.definir || 0, 'com origem a definir')}${chip(g.perda || 0, 'com retrabalho de instalação (perda)')}${chip(g.outra || 0, 'com retrabalho de outra origem')}${chip(g.ocorrencia || 0, 'com outras ocorrências')}${r.comPerda ? dinheiro(r.valorCentavos, 'de base não geram comissão', 'a base que não gera comissão') + dinheiro(r.comissaoCentavos, 'de comissão perdida', 'a comissão perdida') : ''}</div>`;
  const nota = r.comPerda ? `<p class="metricas-nota">A comissão perdida do retrabalho de instalação é a do demonstrativo da comissão, quando ele já tem a O.S., senão 1% da base, pela mesma conta do motor; a da falha comprovada é o quanto a O.S. renderia no demonstrativo se fosse julgada sem falha. Saldo de meses anteriores não entra.${r.comFalha ? ' ' + esc(PERDAS.NOTA_RANKING) : ''}</p>` : '';
  const naoMedido = r.naoMedido && (r.naoMedido.atraso || r.naoMedido.retorno) ? `<p class="metricas-nota">Não medido no período: ${[r.naoMedido.atraso ? `atraso em ${r.naoMedido.atraso} O.S. (sem prazo combinado)` : '', r.naoMedido.retorno ? `retorno antecipado em ${r.naoMedido.retorno} O.S. (sem retorno previsto ou sem a chegada conferida)` : ''].filter(Boolean).join('; ')}. Não medido não é zero: é falta de medida.</p>` : '';
  // O caminho para julgar no demonstrativo vai uma vez, na primeira seção que pode ser julgada (retrabalho de outra origem ou outras ocorrências).
  const julgavel = ['outra', 'ocorrencia'].find(g => d.linhas.some(l => l.grupo === g)) || '';
  const passo = julgavel && !dec.consultando ? perdasPasso() : null;
  const secao = grupo => {
    const ls = d.linhas.map((l, i) => [l, i]).filter(([l]) => l.grupo === grupo);
    if (!ls.length && grupo !== 'perda' && grupo !== 'definir') return '';
    const extra = (grupo === 'ocorrencia' ? naoMedido : '') + (grupo === julgavel && passo ? `<div class="perf-perdas-passo" role="note"><p>${esc(passo.texto)}</p>${perdasPassoBotaoHTML(passo)}</div>` : '');
    const vazio = !ls.length ? `<p class="perf-perdas-vazio">${grupo === 'definir' ? 'Nenhum retrabalho com a origem a definir neste período.' : 'Nenhum retrabalho de instalação neste período.'}</p>` : '';
    return `<section class="perf-perdas-grupo perf-perdas-grupo-${grupo}" aria-labelledby="perf-perdas-g-${grupo}"><h4 id="perf-perdas-g-${grupo}">${esc(PERDAS.ROTULO_GRUPO[grupo])}${ls.length ? ` <span class="badge">${ls.length}</span>` : ''}</h4><p>${esc(PERDAS_GRUPO_TXT[grupo])}</p>${extra}${vazio}<div class="perf-perdas-lista">${ls.map(([l, i]) => perdasCartaoHTML(l, i)).join('')}</div></section>`;
  };
  // O "não medido" mora nas outras ocorrências; sem elas no período, ele vem no fim.
  const semOcorrencias = !d.linhas.some(l => l.grupo === 'ocorrencia');
  const grupos = d.linhas.length ? PERDAS.GRUPOS.map(secao).join('') + (semOcorrencias ? naoMedido : '') : '<p class="perf-perdas-vazio">Nenhuma O.S. do período com retrabalho, atraso ou retorno antecipado.</p>' + naoMedido;
  return `<section class="perf-perdas" aria-labelledby="perf-perdas-titulo">${cabeca}${regra}<p class="perf-perdas-fonte" role="status">${esc(perdasFonteTxt(d))} <button type="button" class="btn-ghost btn-sm" data-perdas-atualizar ${dec.consultando || dec.recarregando ? 'disabled' : ''}>${dec.recarregando ? 'Consultando…' : 'Atualizar decisões'}</button></p>${semFicha}${resumo}${nota}${grupos}</section>`;
}
function wirePerdas(el) {
  if (!el || !perdasPode()) return;
  el.querySelectorAll('[data-perdas-atualizar]').forEach(b => b.onclick = () => { perdasRemoto.tentado = false; void perdasCarregar(); renderPerformanceCasa(); });
  // O próximo passo para decidir (U3): a Conferência filtrada, o Base e fechamento aberto, ou o demonstrativo da comissão.
  el.querySelectorAll('[data-perdas-passo]').forEach(b => b.onclick = () => perdasIrPasso(b.dataset.perdasPasso));
  // O período do demonstrativo que decidiu a O.S. (R1): a comissão perdida se calcula lá.
  el.querySelectorAll('[data-perdas-periodo]').forEach(b => b.onclick = () => {
    const [de, ate] = String(b.dataset.perdasPeriodo || '').split('|');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de || '') || !/^\d{4}-\d{2}-\d{2}$/.test(ate || '')) return;
    STATE._fPerf = {de, ate, rapido:''};
    renderPerformanceCasa();
  });
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
    if (os && typeof openModal === 'function') openModal(os, b.dataset.etapa || 'fechamento');
    else toast('Esta O.S. não está neste aparelho e a busca no servidor não a trouxe. Conecte-se e tente de novo.', 'error');
  });
  if (typeof STORE.api !== 'function') return;
  if (perdasRemoto.chave !== perfChave() || !perdasRemoto.tentado) void perdasCarregar();
  // A aba Regras não consulta a apuração (perfWireFonte); o ponto de atenção precisa dela em todas.
  if (typeof perfCarregarFonte === 'function' && typeof perfRemoto === 'object' && perfRemoto && (perfRemoto.chave !== perfChave() || !perfRemoto.tentado)) void perfCarregarFonte();
}
