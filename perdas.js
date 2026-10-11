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
     linha do demonstrativo, quando ele já tem a O.S., senão a mesma conta
     acumulada do motor para a mesma base (comissoesAcumuladas);
   - RETRABALHO DE OUTRA ORIGEM (SÓ ACOMPANHAMENTO): medição, arte ou
     produção não tiram nada da instalação;
   - OUTRAS OCORRÊNCIAS: o atraso e o retorno antecipado ficam marcados na
     O.S. e não tiram nada sozinhos; a gestão pode julgá-los falha comprovada
     no demonstrativo da comissão (D-004), e aí a O.S. perde os pontos e a
     comissão (o ranking, a Nota, a Conferência, o Relatório e o ranking dos
     funcionários leem a decisão: revisão da onda a3);
   - ANTES DO PROGRAMA: só registro.

   SÓ LEITURA. A decisão de cada O.S. é a que o motor da comissão leu no
   demonstrativo: decisão sem documento é pendência dele, e aqui fica "a
   decidir pela gestão", com o que falta no documento. A comissão perdida por
   falha comprovada é o MESMO motor rodado sobre a MESMA revisão, trocando só a
   falha comprovada por "sem falha".

   O MÊS FECHADO MANDA (revisão da onda a3). Quando o demonstrativo tem a
   linha da O.S., o grupo, o efeito e a comissão perdida saem da linha (a perda
   automática conta como decidida): a aba nunca soma uma perda que o
   demonstrativo não aplicou nem esconde uma que ele aplicou. A ficha que diz
   outra coisa vira aviso: a troca só vale com nova revisão e compensação.

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
  // A frase da ocorrência sem efeito sozinha (D-011): a mesma da régua (regras.js, TEXTOS_PERDA.ocorrencia).
  const OCORRENCIA_REGISTRADA = 'Ocorrência registrada: não tira pontos nem comissão sozinha; a gestão pode julgar como falha comprovada';
  /* A falha comprovada tira os pontos e a comissão da O.S. (D-004; revisão da
     onda a3): a mesma frase da régua (regras.js, TEXTOS_PERDA.falhaComprovada).
     Antes ela dizia que o ranking ainda contava a O.S. (a NOTA_RANKING, que saiu). */
  const FALHA_COMPROVADA = 'Falha comprovada da instalação, julgada no demonstrativo da comissão: tira os pontos e a comissão desta O.S.';
  const EFEITO = Object.freeze({
    pendente:OCORRENCIA_REGISTRADA,
    falha_comprovada:FALHA_COMPROVADA,
    sem_falha:'Sem falha comprovada: a ocorrência não tira pontos nem comissão',
    abono:'Abono justificado: a ocorrência não tira pontos nem comissão',
  });
  const ROTULO_DECISAO = Object.freeze({pendente:'A decidir pela gestão', sem_falha:'Sem falha comprovada', falha_comprovada:'Falha comprovada', abono:'Abono justificado',
    retrabalho_instalacao:'Perda automática (retrabalho de instalação)'});
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
     não pede decisão: `automatica`, e conta como DECIDIDA (codigo
     'retrabalho_instalacao'; revisão da onda a3: ficava "a decidir" no mês
     aprovado). `internas`: as pessoas da montagem interna elegível, que também
     perdem a parcela delas (20%) com a falha comprovada (R4). */
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
      incompleta:false, registrada:'', falta:[], automatica:!!linhas.length && linhas.every(l => l.perda === 'retrabalho_instalacao' || l.decisao === 'retrabalho_instalacao'),
      revisao:ap ? (revisao.revisao ?? null) : null, tipoRevisao:ap ? (revisao.tipo === 'aprovacao' ? 'aprovacao' : 'previa') : '', em:ap ? txt(revisao.em) : ''};
    if (!linhas.length) return base;
    if (base.automatica) return {...base, codigo:'retrabalho_instalacao', rotulo:ROTULO_DECISAO.retrabalho_instalacao, tipo:'', tipoRotulo:''};
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
     pontuar e a comissão perdida são as da linha do demonstrativo (o motor
     gravou comissaoPerdidaCentavos pela conta acumulada da O.S.) quando ele tem
     a O.S.; senão, o valor da O.S. na apuração e a MESMA conta acumulada do
     motor (comissoesAcumuladas, a partir do zero: o saldo de meses anteriores
     não está no aparelho). Revisão da onda a3: 1% de cada parte, arredondado
     sozinho, dava 1 centavo a mais do que seria pago. */
  function perdaAutomatica(registros, decisao, motor) {
    const cents = lista(registros).map(r => r && Number.isFinite(r.valor) && r.valor >= 0 ? Math.round(r.valor * 100) : null);
    const valorCentavos = cents.length && cents.every(Number.isSafeInteger) ? cents.reduce((s, c) => s + c, 0) : null;
    const linhas = decisao && decisao.automatica ? decisao.linhas : [];
    if (linhas.length && linhas.every(l => Number.isSafeInteger(l.comissaoPerdidaCentavos))) {
      const base = linhas.every(l => Number.isSafeInteger(l.baseLiquidaCentavos)) ? linhas.reduce((s, l) => s + l.baseLiquidaCentavos, 0) : valorCentavos;
      return {valorCentavos:base, comissaoCentavos:linhas.reduce((s, l) => s + l.comissaoPerdidaCentavos, 0), automatica:true, doDemonstrativo:true};
    }
    let comissaoCentavos = null;
    if (valorCentavos != null && motor && typeof motor.comissoesAcumuladas === 'function') {
      const xs = motor.comissoesAcumuladas(cents);
      comissaoCentavos = xs.every(Number.isSafeInteger) ? xs.reduce((s, c) => s + c, 0) : null;
    } else if (valorCentavos != null && motor && typeof motor.comissaoDaBase === 'function') comissaoCentavos = motor.comissaoDaBase(valorCentavos);
    return {valorCentavos, comissaoCentavos, automatica:true, doDemonstrativo:false};
  }
  /* O QUE O DEMONSTRATIVO APLICOU na O.S. (revisão da onda a3): 'perda' (a
     linha da perda automática), 'definir' (a linha pendente da origem a
     definir) ou '' (a linha comum, paga ou julgada pela gestão). */
  function grupoDaLinha(linhas) {
    const ls = lista(linhas).filter(l => l && typeof l === 'object');
    if (ls.some(l => l.perda === 'retrabalho_instalacao' || l.decisao === 'retrabalho_instalacao')) return 'perda';
    if (ls.some(l => l.origemADefinir === true || l.decisao === 'origem_a_definir' || lista(l.pendencias).some(t => /^Retrabalho com origem a definir/.test(String(t))))) return 'definir';
    return '';
  }
  // O aviso da ficha que diz outra coisa depois do fechamento: a troca só vale com nova revisão (e compensação, se o mês foi aprovado).
  function avisoDaFicha(aplicado, oc, RG) {
    const r = oc && oc.retrabalho, etapa = r ? r.etapa : '';
    const efeito = etapa && RG && typeof RG.efeitoDaOcorrencia === 'function' ? RG.efeitoDaOcorrencia('retrabalho', etapa) : '';
    const hoje = !r ? 'A ficha hoje não tem retrabalho marcado'
      : !etapa ? 'Na ficha, a origem do retrabalho hoje está a definir'
      : `Na ficha, a origem do retrabalho hoje é ${etapa}${efeito === 'tira' ? ' (tira os pontos e a comissão desta O.S.)' : efeito === 'acompanha' ? ' (não tira nada da instalação)' : ''}`;
    if (aplicado === 'definir') return `${hoje}. No demonstrativo esta O.S. ficou pendente: ela só entra com nova revisão (feche o período de novo e gere nova prévia).`;
    return `${hoje}. A troca só vale com nova revisão e compensação.`;
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
      // A perda do retrabalho da apuração; a falha comprovada (perda:'falha_comprovada', perfComFalhas) não é do retrabalho.
      const regs = x.registros.map(r => ({dia:txt(r.dia) || String((r.os && r.os.finalizadaEm) || '').slice(0, 10), retrabalho:r.retrabalho === true || !!(r.os && r.os.retrabalho === true),
        ...(temCampo(r, 'etapaOrigem') ? {etapaOrigem:r.etapaOrigem} : {}), ...(r.perda === 'retrabalho_instalacao' ? {perda:r.perda} : {})}));
      const oc = ocorrenciasDaOS({card:c, st, registros:regs, noDia:c && typeof noDia === 'function' ? dia => noDia(c, dia) : null, regras:RG});
      const dias = [...new Set(regs.map(r => r.dia).filter(Boolean))].sort();
      const antes = !!dias.length && dias.every(dia => dia < inicio);
      if (!antes) { if (oc.naoMedido.atraso) naoMedido.atraso++; if (oc.naoMedido.retorno) naoMedido.retorno++; }
      const dem = demonstrativoDaOS(x.osId, dias, ds);
      const decisao = {...decisaoDaOS(x.osId, dem && !dem.semLinha ? dem.revisao : null),
        demonstrativo:dem ? {de:dem.de, ate:dem.ate, exato:!!dem.exato, semLinha:!!dem.semLinha, compensacao:dem.compensacao || null} : null};
      /* O MÊS FECHADO MANDA (revisão da onda a3): com a linha da O.S. no
         demonstrativo, o grupo é o que ele aplicou; a ficha que diz outra coisa
         vira aviso. A perda aplicada aparece mesmo com a ficha desmarcada. */
      const daFicha = antes ? 'antes' : oc.retrabalho ? (GRUPO_DO_EFEITO[oc.retrabalho.efeito] || 'outra') : oc.tipos.length ? 'ocorrencia' : '';
      const daLinha = !antes && decisao.linhas.length ? grupoDaLinha(decisao.linhas) : '';
      const aplicado = antes || !decisao.linhas.length ? daFicha : daLinha || (daFicha === 'perda' || daFicha === 'definir' ? 'outra' : daFicha);
      if (!aplicado) continue;
      const grupo = aplicado, avisoFicha = aplicado !== daFicha && (oc.retrabalho || daLinha) ? avisoDaFicha(aplicado, oc, RG) : '';
      const pessoas = new Map(), equipes = new Set();
      for (const r of x.registros) {
        for (const m of lista(r.membros)) { const k = String(m && m.chave || '').trim(); if (k && !pessoas.has(k)) pessoas.set(k, {chave:k, nome:String(m.nome || k)}); }
        for (const g of lista(r.grupos)) if (g && g.equipeNome) equipes.add(String(g.equipeNome));
        if (r.equipeNome) equipes.add(String(r.equipeNome));
      }
      const perda = antes ? null : grupo === 'perda' ? perdaAutomatica(x.registros, decisao, MT) : perdaDaOS(decisao, contrafactual, !dem || !!dem.exato);
      const T = RG && RG.TEXTOS_PERDA ? RG.TEXTOS_PERDA : {};
      // O efeito é o do grupo que vale (o aplicado): a frase da régua, nunca a da ficha que mudou depois.
      const efeito = antes ? efeitoAntes(inicio)
        : grupo === 'perda' ? (daFicha === 'perda' ? oc.retrabalho.texto : T.retrabalhoInstalacao || 'Retrabalho de instalação: tira os pontos e a comissão desta O.S.')
        : grupo === 'definir' ? (daFicha === 'definir' ? oc.retrabalho.texto : T.retrabalhoDefinir || 'Retrabalho com origem a definir: defina a origem; até lá não tira nada e a comissão desta O.S. fica pendente')
        : decisao.codigo === 'falha_comprovada' ? EFEITO.falha_comprovada
        : grupo === 'outra' ? (daFicha === 'outra' ? oc.retrabalho.texto : 'No demonstrativo, o retrabalho desta O.S. não tirou os pontos nem a comissão')
        : EFEITO[decisao.codigo] || EFEITO.pendente;
      linhas.push({osId:x.osId, numero:x.numero || txt(c && String(c.numero ?? '')), cliente:x.cliente || txt(c && c.cliente), dias, antes, grupo, daFicha, avisoFicha,
        pessoas:[...pessoas.values()], equipes:[...equipes], ocorrencias:oc, decisao, perda, efeito});
    }
    const ordemGrupo = g => GRUPOS.indexOf(g);
    linhas.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || String(b.dias[b.dias.length - 1] || '').localeCompare(String(a.dias[a.dias.length - 1] || ''))
      || String(a.numero).localeCompare(String(b.numero), 'pt-BR', {numeric:true}));
    const doGrupo = g => linhas.filter(l => l.grupo === g);
    /* O QUE O PONTO DE ATENÇÃO MOSTRA: a origem a definir (a gestão define na
       ficha), a origem definida depois do fechamento (pede nova revisão), a
       decisão da comissão registrada sem documento completo (U4) e, SEMPRE que
       houver, as O.S. que perderam pontos e comissão por retrabalho de
       instalação, com a comissão perdida (revisão da onda a3, M3). */
    const aDefinir = doGrupo('definir').filter(l => !l.avisoFicha), definidaDepois = doGrupo('definir').filter(l => l.avisoFicha);
    const pendentes = new Set(aDefinir.flatMap(l => [...l.pessoas.map(p => p.chave), ...l.decisao.internas]));
    const incompletas = linhas.filter(l => !l.antes && l.decisao.incompleta);
    const comPerda = linhas.filter(l => l.perda);
    const total = (k, xs = comPerda) => xs.length && xs.every(l => Number.isSafeInteger(l.perda[k])) ? xs.reduce((s, l) => s + l.perda[k], 0) : null;
    const perdasInst = doGrupo('perda').filter(l => l.perda);
    return {linhas, resumo:{os:linhas.length, total:porOS.size, semFicha,
      grupos:Object.fromEntries(GRUPOS.map(g => [g, doGrupo(g).length])),
      origemADefinir:aDefinir.length, origemDefinidaDepois:definidaDepois.length, pessoasPendentes:pendentes.size, decisaoIncompleta:incompletas.length,
      perdaInstalacao:doGrupo('perda').length, perdaInstalacaoComissaoCentavos:total('comissaoCentavos', perdasInst),
      comFalha:comPerda.filter(l => !l.perda.automatica).length, comPerda:comPerda.length,
      valorCentavos:total('valorCentavos'), comissaoCentavos:total('comissaoCentavos'), naoMedido,
      antes:doGrupo('antes').length, periodoAntes:!!(periodo && txt(periodo.ate) && txt(periodo.ate) < inicio)}};
  }

  return {EFEITO, FALHA_COMPROVADA, OCORRENCIA_REGISTRADA, ROTULO_DECISAO, ROTULO_TIPO, ROTULO_OCORRENCIA, ETAPAS_FORA, GRUPOS, ROTULO_GRUPO, INICIO_PROGRAMA, dataBR,
    ocorrenciasDaOS, decisaoDaOS, escolherRevisao, demonstrativos, demonstrativoDaOS, decididas, semFalhas, perdaDaOS, perdaAutomatica, grupoDaLinha, avisoDaFicha, montar};
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
function perdasInvalidar() { perdasRemoto.tentado = false; perdasFalhasPorPeriodo.clear(); }
/* A FALHA COMPROVADA NOS PONTOS (D-004; revisão da onda a3). As decisões que
   a aba já lê (performanceComissaoListar: o recorte e os demonstrativos que o
   cobrem) viram a régua do ranking, da Nota, da Conferência, do Relatório e
   da TV (perfComFalhas, performance.js), pela escolha do motor
   (COMISSAO.demonstrativosVigentes, a mesma do ranking dos funcionários no
   servidor). Sem as decisões, null: nada muda. */
let perdasFalhasMemo = {remoto:null, revisoes:null, cobrem:null, chave:'', demos:null};
function perdasFalhasDemos() {
  if (!perdasPode() || typeof COMISSAO === 'undefined' || !COMISSAO || typeof COMISSAO.demonstrativosVigentes !== 'function') return null;
  const chave = perfChave();
  if (perdasRemoto.chave !== chave || !Array.isArray(perdasRemoto.revisoes)) return null;
  const m = perdasFalhasMemo;
  if (m.remoto === perdasRemoto && m.revisoes === perdasRemoto.revisoes && m.cobrem === perdasRemoto.cobrem && m.chave === chave) return m.demos;
  const f = periodoOuMes('_fPerf');
  const demos = COMISSAO.demonstrativosVigentes([...perdasRemoto.revisoes, ...(Array.isArray(perdasRemoto.cobrem) ? perdasRemoto.cobrem : [])], f);
  perdasFalhasMemo = {remoto:perdasRemoto, revisoes:perdasRemoto.revisoes, cobrem:perdasRemoto.cobrem, chave, demos};
  return demos;
}
/* As decisões de OUTRO recorte (o Por O.S., em Entregas, tem o período dele):
   uma consulta por período, guardada até outra revisão ser gravada. Enquanto
   não chega, null; quando chega, `aoChegar` repinta. */
const perdasFalhasPorPeriodo = new Map();
function perdasFalhasDoPeriodo(f, aoChegar) {
  if (!perdasPode() || typeof STORE === 'undefined' || typeof STORE.api !== 'function' || !f || !f.de || !f.ate) return null;
  if (typeof COMISSAO === 'undefined' || !COMISSAO || typeof COMISSAO.demonstrativosVigentes !== 'function') return null;
  const k = f.de + '|' + f.ate;
  if (typeof perfChave === 'function' && perfChave() === k) { const d = perdasFalhasDemos(); if (d) return d; }
  const x = perdasFalhasPorPeriodo.get(k);
  if (x && (x.carregando || x.demos)) return x.demos || null;
  if (x && x.erro && Date.now() - x.em < 60000) return null;
  if (perdasFalhasPorPeriodo.size > 12) perdasFalhasPorPeriodo.delete(perdasFalhasPorPeriodo.keys().next().value);
  const pedido = {carregando:true, demos:null, erro:'', em:Date.now()};
  perdasFalhasPorPeriodo.set(k, pedido);
  Promise.resolve().then(() => STORE.api({action:'performanceComissaoListar', de:f.de, ate:f.ate})).then(r => {
    if (!r || !Array.isArray(r.revisoes)) throw new Error((r && r.error) || 'Resposta inesperada do servidor.');
    pedido.demos = COMISSAO.demonstrativosVigentes([...r.revisoes, ...(Array.isArray(r.cobrem) ? r.cobrem : [])], {de:f.de, ate:f.ate});
  }).catch(e => { pedido.erro = String((e && e.message) || e); })
    .finally(() => { pedido.carregando = false; pedido.em = Date.now(); if (perdasFalhasPorPeriodo.get(k) === pedido && typeof aoChegar === 'function') aoChegar(); });
  return null;
}
// A falha comprovada que vale para a O.S. no dia (o Por O.S.): a decisão do demonstrativo que cobre o dia, ou null.
function perdasFalhaDaOS(osId, dia, f, aoChegar) {
  const demos = perdasFalhasDoPeriodo(f, aoChegar);
  return demos && demos.length && typeof COMISSAO.falhaComprovadaNoDia === 'function' ? COMISSAO.falhaComprovadaNoDia(demos, osId, dia) : null;
}
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
  // `selo`: a aba está numa revisão fechada (o aviso da apuração diz revisão nova, não "atualizar").
  return {...m, carregando:false, decisoes, demonstrativos, revisao:exato ? exato.revisao : null, fechamento, inicio, selo:!!fonte.fechadoEm};
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
/* O que aconteceu na O.S.: na aba de Perdas e no diálogo de decisão da
   comissão. `seloFechado`: a lista lê um fechamento (o diálogo, ou a aba numa
   revisão fechada), que não se atualiza. `fichaDiferente`: o demonstrativo
   aplicou outra coisa e o aviso da coluna do efeito já diz o que a ficha diz
   hoje (revisão da onda a3): a lista não repete o efeito da ficha. */
function perdasOcorrenciaListaHTML(oc, {seloFechado = false, fichaDiferente = false} = {}) {
  const itens = [], T = perdasTextos();
  if (oc.retrabalho) {
    const r = oc.retrabalho, partes = [r.etapa ? `origem: ${esc(r.etapa)}` : '<strong>origem a definir</strong>'];
    if (r.causa) partes.push(`causa: ${esc(r.causa)}`);
    if (r.problema) partes.push(`problema: ${esc(r.problema)}`);
    if (r.marcadoPor || r.marcadoEm) partes.push(`marcado${r.marcadoPor ? ' por ' + esc(r.marcadoPor) : ''}${r.marcadoEm ? ' em ' + esc(perdasQuando(r.marcadoEm)) : ''}`);
    else if (r.data) partes.push(`dia do retrabalho: ${esc(perdasDDMM(r.data))}`);
    if (oc.semFicha) partes.push('marcado na apuração');
    const efeito = r.texto && !fichaDiferente ? `<span class="bloco perf-perda-efeito">${esc(perdasPonto(r.texto))}</span>` : '';
    /* A ficha mudou a origem depois da consulta: o ranking e a comissão ainda
       têm a de antes. Na aba, o botão de atualizar fica junto do aviso
       (revisão da onda a3, B1: ele só existia no quadro Base e fechamento). */
    const diverge = !r.apuracaoDiverge || fichaDiferente ? '' : seloFechado ? '<span class="bloco">O fechamento tem a origem de antes: a troca só vale com nova revisão do fechamento.</span>'
      : '<span class="bloco perf-perda-diverge">A apuração do ranking ainda tem a origem de antes. <button type="button" class="btn-ghost btn-sm" data-perf-atualizar>Atualizar apuração</button></span>';
    itens.push(`<li><strong>Retrabalho</strong> · ${partes.join(' · ')}${efeito}${diverge}</li>`);
  }
  if (oc.atraso) {
    const a = oc.atraso, f = a.ficha;
    // D-011: o atraso fica registrado, sem efeito sozinho; o abonado fica justificado.
    const efeito = `<span class="bloco perf-perda-efeito">${esc(a.abonado ? 'Atraso abonado: fica justificado' : T.ocorrencia)}.</span>`;
    // A segunda régua é o dia que o ranking usa; ele não desconta atraso (U9).
    itens.push(a.divergem
      ? `<li><strong>Atraso</strong>, as duas datas dão atrasos diferentes:<ul><li>${esc(perdasReguaTxt('Ficha', f))}</li><li>${esc(perdasReguaTxt('Dia da entrega usado no ranking (não desconta atraso)', a.apuracao))}</li></ul>${efeito}</li>`
      : `<li><strong>Atraso</strong> de ${f.dias} ${f.dias === 1 ? 'dia' : 'dias'}: prazo ${esc(perdasDDMM(f.prazo))}, entrega ${esc(perdasDDMM(f.entrega))}${a.abonado ? ' (abonado)' : ''}.${efeito}</li>`);
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
  return `<div class="comissao-ocorrencia" role="group" aria-label="Ocorrência em julgamento"><p><strong>Ocorrência em julgamento</strong></p>${perdasOcorrenciaListaHTML(oc, {seloFechado:true})}</div>`;
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
  const onde = dem && !dem.exato ? ` (demonstrativo de ${perdasPeriodoTxt(dem)})` : '';
  const rev = dec.revisao != null && dec.linhas.length ? `<small class="bloco">Lida da revisão ${esc(String(dec.revisao))} da comissão, ${dec.tipoRevisao === 'aprovacao' ? 'aprovada' : 'prévia'}${dec.em ? ', de ' + esc(perdasQuando(dec.em)) : ''}${esc(onde)}.</small>` : '';
  const comp = dem && dem.compensacao ? `<small class="bloco">${esc(perdasCompensacaoTxt(dem.compensacao))}</small>` : '';
  // D-010: o retrabalho de instalação é perda automática (decidida); a origem a definir deixa só esta O.S. pendente.
  if (l.grupo === 'perda') return `<strong>Perda automática</strong><small class="bloco">Retrabalho de instalação: não pede decisão no demonstrativo da comissão. ${esc(perdasPonto(perdasTextos().naoSeAbona))}</small>${rev}${comp}`;
  if (l.grupo === 'definir') return `<strong>Pendente: a origem do retrabalho</strong><small class="bloco">Até a gestão definir a origem, a comissão desta O.S. fica pendente (não paga e não perde). O demonstrativo do mês pode ser aprovado sem ela; ela entra numa revisão seguinte quando a origem for definida.</small>${rev}${comp}`;
  if (dem && dem.semLinha) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Esta O.S. não está no demonstrativo de ${esc(perdasPeriodoTxt(dem))}: entrou depois do fechamento.</small>`;
  if (dec.incompleta) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Decisão registrada (${esc(PERDAS.ROTULO_DECISAO[dec.registrada] || dec.registrada)}), sem documento completo: falta ${esc(perdasJuntar(dec.falta))}. O demonstrativo só aceita a decisão documentada.</small>${rev}${comp}`;
  if (dec.recusada) return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong><small class="bloco">Falha registrada como ${esc(dec.tipoRotulo || dec.tipo)}: o demonstrativo não aceita, porque não é falha da instalação.</small>${rev}${comp}`;
  if (dec.codigo === 'pendente') return `<strong>${esc(PERDAS.ROTULO_DECISAO.pendente)}</strong>${rev || `<small class="bloco">${dem ? 'Sem decisão no demonstrativo da comissão.' : 'Nenhum demonstrativo da comissão cobre esta entrega.'}</small>`}${comp}`;
  return `<strong>${esc(dec.rotulo)}</strong>${dec.tipoRotulo ? ` (${esc(dec.tipoRotulo)})` : ''}${dec.justificativa ? `<small class="bloco">${esc(dec.justificativa)}</small>` : ''}${rev}${comp}`;
}
/* "Definir a origem" abre DIRETO a escolha da origem (revisão da onda a3, M2:
   abria a ficha no topo da Jornada, e o controle ficava 1.230 px abaixo). A
   ficha que não está no aparelho é buscada no servidor antes. A mesma
   instrução em todo lugar: o Status da entrega, no Fechamento. */
function perdasDefinirOrigemHTML(l) {
  return `<button type="button" class="btn-primary btn-sm" data-perdas-origem="${esc(l.osId)}" data-numero="${esc(l.numero)}">Definir a origem da O.S. ${esc(l.numero || l.osId)}</button>`;
}
function perdasEfeitoHTML(l) {
  const p = l.perda, dem = l.decisao.demonstrativo;
  // A ficha que diz outra coisa depois do fechamento: aviso, a troca só vale com nova revisão (revisão da onda a3).
  const efeito = `<strong>${esc(perdasPonto(l.efeito))}</strong>${l.avisoFicha ? `<span class="bloco perf-perda-aviso-ficha">${esc(l.avisoFicha)}</span>` : ''}`;
  // A origem definida depois do fechamento não pede outra definição: pede a revisão nova.
  if (l.grupo === 'definir') return l.avisoFicha ? efeito : `${efeito}<span class="bloco perf-perdas-acao">${perdasDefinirOrigemHTML(l)}</span>`;
  if (!p) return efeito;
  if (p.automatica) return `${efeito}<span class="bloco">Base que deixa de pontuar: ${esc(perdasDinheiro(p.valorCentavos))}</span><span class="bloco">Comissão perdida: ${esc(perdasDinheiro(p.comissaoCentavos))}${p.comissaoCentavos == null ? '' : p.doDemonstrativo ? ' (do demonstrativo da comissão)' : ' (1% da base, como o demonstrativo calcularia)'}</span>`;
  const comissao = p.comissaoCentavos != null ? esc(perdasDinheiro(p.comissaoCentavos))
    : p.outroPeriodo && dem ? `a calcular no período do demonstrativo (${esc(perdasPeriodoTxt(dem))}) <button type="button" class="btn-ghost btn-sm" data-perdas-periodo="${esc(dem.de + '|' + dem.ate)}">Ver o período do demonstrativo</button>`
    : p.semMotor ? 'a calcular: o fechamento desta revisão ainda não chegou a este aparelho'
    : 'a apurar: o demonstrativo tem pendências nesta O.S.';
  return `${efeito}<span class="bloco">Base que deixa de gerar comissão: ${esc(perdasDinheiro(p.valorCentavos))}</span><span class="bloco">Comissão perdida: ${comissao}</span>`;
}
// O selo e a cor do cartão, pelo grupo (e, nas outras ocorrências, pela decisão da comissão).
function perdasSeloDe(l) {
  if (l.grupo === 'antes') return {classe:'antes', texto:'Antes do programa'};
  // A ficha mudou depois do fechamento (revisão da onda a3): o selo diz o que o demonstrativo aplicou.
  if (l.grupo === 'definir' && l.avisoFicha) return {classe:'pendente', texto:'Pendente no demonstrativo: falta nova revisão'};
  if (l.grupo === 'outra' && l.avisoFicha) return {classe:'ok', texto:'Sem perda no demonstrativo'};
  if (l.grupo === 'definir') return {classe:'pendente', texto:'Origem a definir'};
  if (l.grupo === 'perda') return {classe:'falha', texto:'Perda: retrabalho de instalação'};
  if (l.decisao.codigo === 'falha_comprovada') return {classe:'falha', texto:'Falha comprovada'};
  if (l.grupo === 'outra') return {classe:'ok', texto:`Retrabalho de ${String(l.ocorrencias.retrabalho && l.ocorrencias.retrabalho.etapa || '').toLowerCase()}`};
  return {classe:'ok', texto:l.decisao.codigo === 'pendente' ? 'Ocorrência registrada' : l.decisao.rotulo};
}
function perdasCartaoHTML(l, i, {seloFechado = false} = {}) {
  const id = 'perf-perda-' + i, selo = perdasSeloDe(l);
  const temFicha = typeof STORE !== 'undefined' && typeof STORE.getOS === 'function' && !!STORE.getOS(l.osId);
  // A ficha abre no Fechamento, onde fica o Status da entrega com a origem (a mesma instrução do checklist).
  const numero = esc(l.numero || l.osId), etapa = 'fechamento';
  const abrir = temFicha ? `<button type="button" class="inline-link" data-os-id="${esc(l.osId)}" data-ficha-etapa="${etapa}">O.S. ${numero}</button>`
    : `<button type="button" class="inline-link" data-perdas-abrir="${esc(l.osId)}" data-numero="${esc(l.numero)}" data-etapa="${etapa}">O.S. ${numero}</button>`;
  const dias = l.dias.map(perdasDDMM).filter(Boolean).join(', ');
  const gente = `${l.equipes.length ? `<span class="bloco">${esc(l.equipes.join(', '))}</span>` : ''}${l.pessoas.map(p => esc(p.nome)).join(', ') || 'Sem participantes na apuração'}`;
  return `<article class="perf-perda perf-perda-${selo.classe}" aria-labelledby="${id}"><header><h5 id="${id}">${abrir} <span class="perf-perda-cliente">${esc(l.cliente)}</span></h5>${dias ? `<span class="perf-perda-dia">Entrega ${esc(dias)}</span>` : ''}<span class="badge perf-perda-selo">${esc(selo.texto)}</span></header>
    <dl class="perf-perda-grade"><div><dt>Equipe e pessoas</dt><dd>${gente}</dd></div><div><dt>Ocorrência</dt><dd>${perdasOcorrenciaListaHTML(l.ocorrencias, {seloFechado, fichaDiferente:!!l.avisoFicha})}</dd></div><div><dt>Decisão da comissão</dt><dd>${perdasDecisaoHTML(l)}</dd></div><div><dt>Efeito atual</dt><dd>${perdasEfeitoHTML(l)}</dd></div></dl></article>`;
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
/* O PONTO DE ATENÇÃO no alto da Performance, em todas as abas (pedido do
   dono, 11/10/2026: "a que perdeu por retrabalho precisa de uma aba e um ponto
   de atenção importante"). Revisão da onda a3 (M3): ele mostra SEMPRE que
   houver as O.S. que perderam pontos e comissão por retrabalho de instalação,
   com a comissão perdida, e o botão para a aba Perdas; e o que pede ação: a
   origem a definir (a gestão define no Status da entrega; até lá só aquela
   O.S. fica pendente, sem travar o mês), a origem definida depois do
   fechamento (pede nova revisão) e a decisão da comissão gravada sem documento
   completo (U4, só depois de as decisões chegarem). Atraso e retorno
   antecipado não entram: ficam registrados e não tiram nada sozinhos. */
function perdasPontoHTML(d) {
  if (!d || d.carregando || !d.resumo) return '';
  const r = d.resumo, p = r.perdaInstalacao || 0, x = r.origemADefinir || 0, xd = r.origemDefinidaDepois || 0, y = r.pessoasPendentes || 0;
  const z = d.decisoes && !d.decisoes.consultando ? r.decisaoIncompleta || 0 : 0;
  if (!p && !x && !xd && !z) return '';
  const partes = [];
  if (p) {
    const c = r.perdaInstalacaoComissaoCentavos;
    partes.push(`${p} O.S. ${p === 1 ? 'perdeu' : 'perderam'} pontos e comissão por retrabalho de instalação (${c == null ? 'comissão a apurar' : perdasDinheiro(c) + ' de comissão'}).`);
  }
  if (x) partes.push(`${x} O.S. com retrabalho de origem a definir: defina a origem no Status da entrega, no Fechamento da ficha. Até lá ${x === 1 ? 'ela não tira' : 'elas não tiram'} nada e a comissão ${y === 1 ? 'de 1 pessoa fica' : `de ${y} pessoas fica`} pendente (não paga e não perde); o demonstrativo do mês pode ser aprovado sem ${x === 1 ? 'ela' : 'elas'}, e ${x === 1 ? 'ela entra' : 'elas entram'} numa revisão seguinte quando a origem for definida.`);
  if (xd) partes.push(`${xd} O.S. com a origem definida depois do fechamento: ${xd === 1 ? 'ela só entra' : 'elas só entram'} no demonstrativo com nova revisão (feche o período de novo e gere nova prévia).`);
  if (z) partes.push(`${z} ${z === 1 ? 'decisão da comissão registrada' : 'decisões da comissão registradas'} sem documento completo: o demonstrativo só aceita a decisão documentada.`);
  const primeira = x === 1 ? d.linhas.find(l => l.grupo === 'definir' && !l.avisoFicha) : null;
  const passo = z && typeof perfChave === 'function' ? perdasPasso() : null;
  return `<section class="perf-atencao" role="status" aria-labelledby="perf-atencao-titulo"><p><strong id="perf-atencao-titulo"><span aria-hidden="true">⚠</span> Ponto de atenção:</strong> ${esc(partes.join(' '))}</p><div class="perf-atencao-acoes"><button type="button" class="btn-ghost btn-sm" data-perf-ir="perdas">Ver as perdas por retrabalho</button>${primeira ? perdasDefinirOrigemHTML(primeira) : ''}${passo ? perdasPassoBotaoHTML(passo) : ''}</div></section>`;
}
// O número do selo da aba: as O.S. com perda (retrabalho de instalação) ou com a origem a definir; 0 enquanto a apuração não chega.
const perdasContagem = d => d && !d.carregando && d.resumo ? (d.resumo.perdaInstalacao || 0) + (d.resumo.origemADefinir || 0) + (d.resumo.origemDefinidaDepois || 0) : 0;
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
  definir:'Defina a origem no Status da entrega, no Fechamento da ficha de cada O.S. (o botão abre a escolha). Até lá não tira nada e a comissão da O.S. fica pendente (não paga e não perde); o demonstrativo do mês pode ser aprovado sem ela.',
  perda:'Tiram os pontos e a comissão destas O.S., de todas as pessoas e equipes, inclusive a parcela da montagem interna. Quem discorda da origem troca a origem na ficha, com motivo.',
  outra:'Medição, arte ou produção: não tira nada da instalação. Fica para acompanhamento.',
  ocorrencia:'Atraso e retorno antecipado ficam registrados na O.S. e não tiram nada sozinhos. A gestão pode julgar cada um como falha comprovada no demonstrativo da comissão: aí a O.S. perde os pontos e a comissão.',
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
  const nota = r.comPerda ? '<p class="metricas-nota">A comissão perdida do retrabalho de instalação é a do demonstrativo da comissão quando ele já tem a O.S.; senão, 1% da base, como o demonstrativo calcularia. A da falha comprovada é o quanto a O.S. renderia no demonstrativo se fosse julgada sem falha. Saldo de meses anteriores não entra.</p>' : '';
  const naoMedido = r.naoMedido && (r.naoMedido.atraso || r.naoMedido.retorno) ? `<p class="metricas-nota">Não medido no período: ${[r.naoMedido.atraso ? `atraso em ${r.naoMedido.atraso} O.S. (sem prazo combinado)` : '', r.naoMedido.retorno ? `retorno antecipado em ${r.naoMedido.retorno} O.S. (sem retorno previsto ou sem a chegada conferida)` : ''].filter(Boolean).join('; ')}. Não medido não é zero: é falta de medida.</p>` : '';
  // O caminho para julgar no demonstrativo vai uma vez, só nas outras ocorrências (revisão da onda a3, B4: o retrabalho de outra origem só se acompanha).
  const julgavel = d.linhas.some(l => l.grupo === 'ocorrencia') ? 'ocorrencia' : '';
  const passo = julgavel && !dec.consultando ? perdasPasso() : null;
  const secao = grupo => {
    const ls = d.linhas.map((l, i) => [l, i]).filter(([l]) => l.grupo === grupo);
    if (!ls.length && grupo !== 'perda' && grupo !== 'definir') return '';
    const extra = (grupo === 'ocorrencia' ? naoMedido : '') + (grupo === julgavel && passo ? `<div class="perf-perdas-passo" role="note"><p>${esc(passo.texto)}</p>${perdasPassoBotaoHTML(passo)}</div>` : '');
    const vazio = !ls.length ? `<p class="perf-perdas-vazio">${grupo === 'definir' ? 'Nenhum retrabalho com a origem a definir neste período.' : 'Nenhum retrabalho de instalação neste período.'}</p>` : '';
    return `<section class="perf-perdas-grupo perf-perdas-grupo-${grupo}" aria-labelledby="perf-perdas-g-${grupo}"><h4 id="perf-perdas-g-${grupo}">${esc(PERDAS.ROTULO_GRUPO[grupo])}${ls.length ? ` <span class="badge">${ls.length}</span>` : ''}</h4><p>${esc(PERDAS_GRUPO_TXT[grupo])}</p>${extra}${vazio}<div class="perf-perdas-lista">${ls.map(([l, i]) => perdasCartaoHTML(l, i, {seloFechado:!!d.selo})).join('')}</div></section>`;
  };
  // O "não medido" mora nas outras ocorrências; sem elas no período, ele vem no fim.
  const semOcorrencias = !d.linhas.some(l => l.grupo === 'ocorrencia');
  const grupos = d.linhas.length ? PERDAS.GRUPOS.map(secao).join('') + (semOcorrencias ? naoMedido : '') : '<p class="perf-perdas-vazio">Nenhuma O.S. do período com retrabalho, atraso ou retorno antecipado.</p>' + naoMedido;
  return `<section class="perf-perdas" aria-labelledby="perf-perdas-titulo">${cabeca}${regra}<p class="perf-perdas-fonte" role="status">${esc(perdasFonteTxt(d))} <button type="button" class="btn-ghost btn-sm" data-perdas-atualizar ${dec.consultando || dec.recarregando ? 'disabled' : ''}>${dec.recarregando ? 'Consultando…' : 'Atualizar decisões'}</button></p>${semFicha}${resumo}${nota}${grupos}</section>`;
}
// A ficha da O.S.: a do aparelho, ou buscada no servidor pelo número.
async function perdasFichaDe(id, numero) {
  let os = STORE.getOS(id);
  if (!os && typeof STORE.buscarHistorico === 'function' && numero) { try { await STORE.buscarHistorico({de:'', ate:'', q:numero}); } catch (e) { /* quem chama avisa */ } os = STORE.getOS(id); }
  return os || null;
}
/* DEPOIS DE GRAVAR A ORIGEM pela aba (revisão da onda a3, B1): a aba repinta
   na hora (a ficha mudou), e a apuração do ranking e da Conferência se
   atualiza sozinha quando a fila esvaziar; antes, o aviso mandava tocar num
   "Atualizar apuração" que não existia nesta aba. */
function perdasDepoisDaOrigem() {
  if (typeof renderPerformanceCasa === 'function') renderPerformanceCasa();
  const atualizar = () => { if (typeof STORE.getQueue === 'function' && STORE.getQueue().length) return; if (typeof perfCarregarFonte === 'function') void perfCarregarFonte(); };
  if (typeof STORE.trySync === 'function') Promise.resolve().then(() => STORE.trySync()).then(atualizar, atualizar);
  else atualizar();
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
    const os = await perdasFichaDe(b.dataset.perdasAbrir, b.dataset.numero || '');
    if (os && typeof openModal === 'function') openModal(os, b.dataset.etapa || 'fechamento');
    else toast('Esta O.S. não está neste aparelho e a busca no servidor não a trouxe. Conecte-se e tente de novo.', 'error');
  });
  // "Definir a origem": a escolha da origem abre direto (M2); gravada, a apuração se atualiza sozinha (B1).
  el.querySelectorAll('[data-perdas-origem]').forEach(b => b.onclick = async () => {
    const os = await perdasFichaDe(b.dataset.perdasOrigem, b.dataset.numero || '');
    if (!os) return toast('Esta O.S. não está neste aparelho e a busca no servidor não a trouxe. Conecte-se e tente de novo.', 'error');
    if (typeof abrirOrigemRetrabalho !== 'function' || typeof gravarNaOSF17 !== 'function') {
      if (typeof openModal === 'function') openModal(os, 'fechamento');
      return;
    }
    abrirOrigemRetrabalho(os, (mudar, ok) => gravarNaOSF17(os.id, mudar, ok, perdasDepoisDaOrigem));
  });
  if (typeof STORE.api !== 'function') return;
  if (perdasRemoto.chave !== perfChave() || !perdasRemoto.tentado) void perdasCarregar();
  // A aba Regras não consulta a apuração (perfWireFonte); o ponto de atenção precisa dela em todas.
  if (typeof perfCarregarFonte === 'function' && typeof perfRemoto === 'object' && perfRemoto && (perfRemoto.chave !== perfChave() || !perfRemoto.tentado)) void perfCarregarFonte();
}
