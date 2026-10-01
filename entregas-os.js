'use strict';

/* ENTREGAS: A VISTA "POR O.S." (F18, 30/09/2026).
   Uma terceira vista dentro de Entregas, ao lado de Tabela e Cards: um cartão
   por O.S. entregue no período, com o que a gestão precisa para entender a
   entrega sem abrir a ficha (status, prazo × entrega, retorno previsto ×
   conferido, equipe com cor e logo, valor e comissão prevista para admin e
   pcp) e uma LINHA DO TEMPO ÚNICA da O.S.
   O QUE NÃO MUDA: a lista é a MESMA da Tabela (a do ERP no período), e os
   cartões de cima continuam sendo o total do ERP. Os filtros desta vista
   (status, equipe e busca) não mexem neles; a vista diz isso quando há filtro
   ligado e mostra o número dela, que acompanha o filtro. Técnico e Tipo
   ficam com a Tabela e os Cards.
   DESEMPENHO: o status de cada O.S. é calculado uma vez por pintura completa
   (e guardado enquanto nenhuma O.S. mudar); tocar num filtro, buscar, abrir a
   linha do tempo ou "Mostrar mais" repinta só os chips e a lista desta vista,
   no máximo 24 cartões por vez. A linha do tempo só é montada quando abre.
   A parte de cima deste arquivo (POR_OS) é pura: não lê tela nem grava nada,
   e os testes a usam direto (tests/entregas-por-os.test.cjs). */
const POR_OS = ((O) => {
  const FUSO = 'America/Sao_Paulo';
  const HORA_MS = 3600000;
  const txt = v => v == null ? '' : String(v).trim();
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const lista = v => Array.isArray(v) ? v : [];
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cortar = (v, n) => { const a = Array.from(txt(v)); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
  const fn = nome => O && typeof O[nome] === 'function' ? O[nome] : null;

  /* O INSTANTE DE UM CARIMBO, NO FUSO FIXO DA FÁBRICA. Carimbo com fuso (Z ou
     ±hh:mm) é o instante exato. Data e hora SEM fuso ('2026-09-29T23:30') já é
     a hora da fábrica (a mesma régua do diaSt do status): vira o instante de
     São Paulo, UTC-3, sem horário de verão desde 2019, e nunca depende do
     fuso do aparelho. Dia puro ('2026-09-29') é o começo do dia em São Paulo,
     marcado `soDia` (a linha mostra só a data). */
  function diaExiste(a, m, d) {
    const x = new Date(Date.UTC(a, m - 1, d));
    return a >= 2000 && a <= 2100 && x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
  }
  function instante(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? {t: v, soDia: false} : null;
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return diaExiste(+m[1], +m[2], +m[3]) ? {t: Date.UTC(+m[1], +m[2] - 1, +m[3]) + 3 * HORA_MS, soDia: true} : null;
    m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s);
    if (m) {
      if (!diaExiste(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59) return null;
      return {t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) + 3 * HORA_MS, soDia: false};
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      const t = Date.parse(s);
      return Number.isFinite(t) ? {t, soDia: false} : null;
    }
    return null;
  }
  let _fmt = null;
  function partes(t) {
    try {
      if (!_fmt) _fmt = new Intl.DateTimeFormat('en-US', {timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
      const p = {};
      for (const x of _fmt.formatToParts(new Date(t))) p[x.type] = x.value;
      return {a: p.year, m: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, mi: p.minute};
    } catch (e) {
      // Sem a tabela de fusos: São Paulo é UTC-3 o ano inteiro desde 2019.
      const s = new Date(t - 3 * HORA_MS).toISOString();
      return {a: s.slice(0, 4), m: s.slice(5, 7), d: s.slice(8, 10), h: s.slice(11, 13), mi: s.slice(14, 16)};
    }
  }
  // {dia: 'AAAA-MM-DD', hora: 'HH:MM' (vazia no dia puro), data: 'dd/mm/aa'}, sempre em São Paulo.
  function quando(t, soDia) {
    const p = partes(t);
    return {dia: `${p.a}-${p.m}-${p.d}`, hora: soDia ? '' : `${p.h}:${p.mi}`, data: `${p.d}/${p.m}/${p.a.slice(2)}`};
  }
  const diaDe = v => { const q = instante(v); return q ? quando(q.t, q.soDia).dia : ''; };
  const ddmm = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
  const ddmmaa = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '';
  const diaSeguinte = d => { const q = instante(d); return q && q.soDia ? quando(q.t + 24 * HORA_MS, true).dia : ''; };

  /* A LINHA DO TEMPO ÚNICA DA O.S. Junta, numa lista só, em ordem e sem
     repetir: o pedido e a criação, o histórico das etapas, as remarcações
     (agendaLog), o prazo combinado e o retorno previsto digitados, a saída e
     a volta anotadas pela equipe, a chegada conferida pela gestão, as marcas
     de entrega por item, a finalização (ou a baixa do ERP), o lançamento, a
     conferência da volta, as ocorrências (registradas, anuladas e as que o
     status deriva), os abonos e as revogações, o cancelamento e o desfazer,
     a reabertura e, quando a gestão pede, o diário de alterações do servidor.
     SEM DUPLICATA: cada fato tem uma chave (a marca de item pelo id, a
     remarcação pelo de/para/quando, a finalização uma vez só); o "finalizada"
     do histórico na hora da finalização é a própria finalização; e a linha do
     diário que só repete um fato que já está na lista (o mesmo tipo de campo,
     até 15 minutos de diferença) vira a marca "no diário" desse fato.
     `opc.st` é o status da entrega (OPERACAO.statusEntrega), para as
     ocorrências derivadas e o retorno antecipado; `opc.diario` as entradas
     do diário (STORE.auditoriaOS); `opc.descreverCampo(campo, entrada)` o
     texto de cada campo do diário (a tela usa o da ficha). */
  const ETAPAS = {aguardando_producao: 'Aguardando produção', apto: 'Apto', agendada: 'Agendada', confirmada: 'Confirmada', em_andamento: 'Em andamento', finalizada: 'Finalizada'};
  const ETAPAS_INT = {apto: 'Pronta para retirada', finalizada: 'Retirada'};
  const ORDEM = ['pedido', 'criada', 'etapa', 'remarcacao', 'prazo', 'retorno_previsto', 'saida', 'chegada', 'retorno', 'item', 'finalizacao', 'lancamento', 'conferencia', 'ocorrencia', 'abono', 'cancelamento', 'reabertura', 'diario'];
  const MARCA_TXT = {entregue: 'entregue', retirado: 'retirado pelo cliente', problema: 'problema na entrega', cancelado: 'saldo cancelado', desfeito: 'marca desfeita', conferido: 'declaração conferida'};
  // O campo do diário e o fato da linha que ele registra (para não contar duas vezes).
  const CAMPO_TIPO = {
    cancelamento: 'cancelamento', entregaLancada: 'lancamento', finalizadaEm: 'finalizacao', finalizadoPor: 'finalizacao', finalizadaPorCampo: 'finalizacao',
    baixaAutoERP: 'finalizacao', justificativaConclusao: 'finalizacao', reabertaEm: 'reabertura', reabertaPor: 'reabertura', retornoConf: 'conferencia',
    voltaEquipe: 'conferencia', retornoConferido: 'chegada', abonos: 'abono', ocorrencias: 'ocorrencia', agendaLog: 'remarcacao', 'instalacao.data': 'remarcacao',
    'itens.entregas': 'item', saidaEm: 'saida', horaSaida: 'saida', retornoEm: 'retorno', horaRetorno: 'retorno', prazoCombinado: 'prazo', retornoPrevisto: 'retorno_previsto',
  };
  const JANELA_DIARIO = 15 * 60000;
  const DIARIO_ACOES = {criar: 'criou a O.S.', alterar: 'alterou', excluir: 'excluiu a O.S.', restaurar: 'restaurou a O.S.', descartar: 'tentou alterar a divisão (recusado)'};
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const minTxt = n => n === 1 ? '1 minuto' : n < 60 ? `${n} minutos` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
  function rotuloOcorrencia(id, ocs) {
    const achada = lista(ocs).find(o => o && o.id === id);
    if (achada && achada.rotulo) return achada.rotulo;
    const tipo = String(id || '').split(':').pop();
    return (O && O.ROTULOS_OCORRENCIA && O.ROTULOS_OCORRENCIA[tipo]) || 'ocorrência';
  }

  function linhaDoTempo(os, opc = {}) {
    if (!obj(os)) return [];
    const ev = [], vistas = new Set();
    const poe = (tipo, valor, titulo, detalhe = '', extra = {}) => {
      const q = instante(valor);
      if (!q) return null;
      const k = extra.k || [tipo, q.t, titulo, txt(detalhe)].join('|');
      if (vistas.has(k)) return null;
      vistas.add(k);
      const ato = extra.ato != null && extra.ato !== '' ? instante(extra.ato) : null;
      const e = {k, tipo, t: q.t, soDia: q.soDia, titulo, detalhe: txt(detalhe), por: txt(extra.por), ato: ato ? ato.t : q.t, noDiario: ''};
      ev.push(e);
      return e;
    };
    const interno = os.tipo === 'interno';
    const st = obj(opc.st) ? opc.st : null;

    poe('pedido', os.dataEntrada, 'Pedido entrou', '', {k: 'pedido'});
    poe('criada', os.criadoEm, 'O.S. criada no PCP', '', {k: 'criada', por: os.criadoPor});

    // A finalização vem antes do histórico: o "finalizada" dele, na mesma hora, é ela.
    const fim = instante(os.finalizadaEm);
    if (fim) {
      const erp = fn('encerradaERP') ? O.encerradaERP(os) : /^Mubisys\b/i.test(txt(os.finalizadoPor));
      if (erp) {
        const status = txt(obj(os.baixaAutoERP) ? os.baixaAutoERP.status : '');
        const cancelada = /cancel/i.test(status + ' ' + txt(os.finalizadoPor));
        poe('finalizacao', os.finalizadaEm, cancelada ? 'Cancelada no ERP' : 'Baixa do ERP',
          `${status && !cancelada ? 'situação ' + status.toLowerCase() + '; ' : ''}a data é a da sincronização, não a da entrega`, {k: 'fim'});
      } else {
        const fc = obj(os.finalizadaPorCampo) && txt(os.finalizadaPorCampo.finalizadaEm) === txt(os.finalizadaEm) ? os.finalizadaPorCampo : null;
        poe('finalizacao', os.finalizadaEm, interno ? 'Retirada pelo cliente' : 'Finalizada no PCP',
          fc ? 'pelo celular da equipe (entrega declarada)' : txt(os.justificativaConclusao) ? 'com justificativa: ' + cortar(os.justificativaConclusao, 140) : '',
          {k: 'fim', por: fc ? fc.por : os.finalizadoPor});
      }
    }
    for (const h of lista(os.historico)) {
      if (!obj(h) || !txt(h.etapa)) continue;
      const q = instante(h.em);
      if (!q || (h.etapa === 'finalizada' && fim && Math.abs(q.t - fim.t) <= 120000)) continue;
      poe('etapa', h.em, 'Etapa: ' + ((interno && ETAPAS_INT[h.etapa]) || ETAPAS[h.etapa] || h.etapa), '', {k: `etapa|${h.etapa}|${q.t}`, por: h.por});
    }
    for (const a of lista(os.agendaLog)) {
      if (!obj(a)) continue;
      const de = ddmm(diaDe(a.de)), para = ddmm(diaDe(a.data));
      const det = de && para ? `de ${de} para ${para}` : para ? `para ${para}` : de ? `de ${de}, sem data nova` : '';
      poe('remarcacao', a.em, de ? 'Agenda remarcada' : 'Agenda marcada', det + (txt(a.motivo) ? '; ' + cortar(a.motivo, 120) : ''),
        {k: `ag|${txt(a.de)}|${txt(a.data)}|${txt(a.em)}`, por: a.por});
    }
    const pc = os.prazoCombinado;
    if (obj(pc) && txt(pc.em)) {
      const semPrazo = O && pc.fonte === O.PRAZO_SEM_AGENDA;
      poe('prazo', pc.em, semPrazo ? 'Marcada sem prazo combinado' : pc.fonte === 'correcao' ? 'Prazo corrigido' : 'Prazo combinado',
        [semPrazo ? '' : ddmmaa(diaDe(pc.data)), txt(pc.motivo) ? cortar(pc.motivo, 140) : ''].filter(Boolean).join(': '), {k: 'prazo|' + txt(pc.em), por: pc.por});
    }
    for (const r of fn('retornosPrevistos') ? O.retornosPrevistos(os) : []) {
      if (txt(r.em)) poe('retorno_previsto', r.em, 'Retorno previsto digitado', `${ddmm(r.dia)}: ${r.saida ? 'saída ' + r.saida + ', ' : ''}retorno ${r.hora}`, {k: `rp|${r.dia}|${r.hora}|${txt(r.em)}`, por: r.por});
    }
    poe('saida', os.saidaEm, 'Saída da equipe', txt(os.horaSaida) ? 'hora anotada ' + txt(os.horaSaida) : '', {k: 'saida'});
    poe('retorno', os.retornoEm, 'Volta anotada pela equipe', 'só declaração: a chegada que vale é a conferida pela gestão', {k: 'retorno'});
    const ch = fn('chegadaConferida') ? O.chegadaConferida(os) : null;
    if (ch) {
      const rc = obj(os.retornoConferido) ? os.retornoConferido : {};
      const ra = st && obj(st.retornoAntecipado) ? st.retornoAntecipado : null;
      const det = ra && ['antecipado', 'abonado', 'no horário', 'na volta'].includes(ra.situacao) ? cap(ra.motivo) : '';
      poe('chegada', `${ch.dia}T${ch.hora}`, 'Chegada do carro conferida', det, {k: 'chegada', por: ch.por, ato: rc.em || rc.recebidoEm});
    }
    for (const it of lista(os.itens)) {
      if (!obj(it)) continue;
      const nomeItem = cortar(it.descricao || (it.item ? 'item ' + it.item : 'item'), 60);
      for (const m of lista(it.entregas)) {
        if (!obj(m) || !txt(m.id) || !MARCA_TXT[m.tipo]) continue;
        const comQtde = m.tipo === 'entregue' || m.tipo === 'retirado';
        const qt = comQtde && Number.isInteger(m.qtde) && m.qtde > 0 ? ` ${m.qtde} ${m.qtde === 1 ? 'unidade' : 'unidades'}` : '';
        const d = ddmm(diaDe(m.dia));
        const decl = m.declarado === true || m.via === 'toque' ? ' (declarado pela equipe)' : '';
        const det = [d ? (comQtde ? 'em ' : 'dia ') + d : '', txt(m.motivo) ? cortar(m.motivo, 120) : ''].filter(Boolean).join('; ') + decl;
        poe('item', txt(m.em) || m.dia, `${nomeItem}: ${MARCA_TXT[m.tipo]}${qt}`, det, {k: 'item|' + txt(m.id), por: m.por, ato: m.em});
      }
    }
    const l = fn('entregaLancadaValida') ? O.entregaLancadaValida(os) : (obj(os.entregaLancada) ? os.entregaLancada : null);
    if (obj(l)) poe('lancamento', txt(l.em) || l.data, 'Entrega lançada', diaDe(l.data) ? 'entregue em ' + ddmmaa(diaDe(l.data)) : '', {k: 'lanc', por: l.por, ato: l.em});
    const rc = !interno && obj(os.retornoConf) ? os.retornoConf : null;
    if (rc && txt(rc.em)) {
      const nao = k => rc[k] === 'nao' || rc[k] === false, sim = k => rc[k] === 'sim' || rc[k] === true;
      const partes = [
        nao('carroLimpo') || nao('carroArrumado') ? 'carro ' + [nao('carroLimpo') ? 'sujo' : '', nao('carroArrumado') ? 'desarrumado' : ''].filter(Boolean).join(' e ')
          : sim('carroLimpo') && sim('carroArrumado') ? 'carro limpo e arrumado' : '',
        nao('equipamentosOk') ? 'equipamentos com falta' : sim('equipamentosOk') ? 'equipamentos completos' : '',
        nao('semAvaria') ? 'avaria nova no carro' : sim('semAvaria') ? 'sem avaria' : '',
        txt(rc.obs) ? cortar(rc.obs, 120) : '',
      ];
      poe('conferencia', rc.em, 'Volta do carro conferida', partes.filter(Boolean).join(', '), {k: 'conf', por: rc.por});
    }
    const ve = !interno && obj(os.voltaEquipe) ? os.voltaEquipe : null;
    if (ve && txt(ve.em)) poe('conferencia', ve.em, 'Limpeza do carro anotada pela equipe', '', {k: 'volta-equipe', por: ve.por});
    // As ocorrências: as do status (derivadas e registradas); sem o status, só as registradas.
    const ocs = st && Array.isArray(st.ocorrencias) ? st.ocorrencias : (fn('ocorrenciasManuais') ? O.ocorrenciasManuais(os) : []);
    for (const oc of ocs) {
      if (!obj(oc)) continue;
      if (oc.origem === 'manual') {
        if (txt(oc.em)) poe('ocorrencia', oc.em, 'Ocorrência registrada: ' + oc.rotulo, oc.motivo, {k: 'oc|' + oc.id, por: oc.por});
        if (txt(oc.anuladaEm)) poe('ocorrencia', oc.anuladaEm, 'Ocorrência anulada: ' + oc.rotulo, '', {k: 'ocan|' + oc.id, por: oc.anuladaPor});
        continue;
      }
      if (oc.tipo === 'atraso' && st && st.prazo) poe('ocorrencia', diaSeguinte(st.prazo), 'Prazo combinado venceu', oc.motivo, {k: 'oc|' + oc.id});
      else if (oc.tipo === 'retrabalho') {
        const rp = obj(os.retrabalhoPerguntado) && os.retrabalhoPerguntado.resposta === 'sim' ? os.retrabalhoPerguntado : null;
        poe('ocorrencia', (rp && rp.em) || os.dataRetrabalho || os.finalizadaEm || os.atualizadoEm, 'Retrabalho marcado', oc.motivo, {k: 'oc|' + oc.id, por: rp ? rp.por : ''});
      }
      // O retorno antecipado está na chegada; carro, avaria e equipamentos, na conferência da volta.
    }
    const rpn = obj(os.retrabalhoPerguntado) && os.retrabalhoPerguntado.resposta === 'nao' ? os.retrabalhoPerguntado : null;
    if (rpn) poe('ocorrencia', rpn.em, 'Retrabalho: respondido que não houve', '', {k: 'retrab-nao', por: rpn.por});
    for (const a of fn('abonosDe') ? O.abonosDe(os) : []) {
      const rot = rotuloOcorrencia(a.ocorrenciaId, ocs);
      if (txt(a.em)) poe('abono', a.em, 'Abono: ' + rot, a.motivo, {k: 'ab|' + a.id, por: a.por});
      if (txt(a.revogadoEm)) poe('abono', a.revogadoEm, 'Abono revogado: ' + rot, '', {k: 'abr|' + a.id, por: a.revogadoPor});
    }
    const c = obj(os.cancelamento) ? os.cancelamento : null;
    if (c && txt(c.motivo) && txt(c.em) && (c.ativo === true || c.ativo === false || c.cancelar === true))
      poe('cancelamento', c.em, 'O.S. cancelada', cortar(c.motivo, 200), {k: 'canc|' + txt(c.em), por: c.por});
    if (c && c.ativo === false && txt(c.desfeitoEm)) poe('cancelamento', c.desfeitoEm, 'Cancelamento desfeito', '', {k: 'canc-desfeito|' + txt(c.desfeitoEm), por: c.desfeitoPor});
    poe('reabertura', os.reabertaEm, 'O.S. reaberta', '', {k: 'reab', por: os.reabertaPor});

    if (Array.isArray(opc.diario)) juntarDiario(ev, opc.diario, poe, opc);

    ev.sort((a, b) => a.t - b.t || ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    return ev.map(e => ({...e, ...quando(e.t, e.soDia)}));
  }
  function juntarDiario(ev, entradas, poe, opc) {
    const vistas = new Set();
    const descrever = typeof opc.descreverCampo === 'function' ? opc.descreverCampo : c => c;
    for (const a of entradas) {
      if (!obj(a)) continue;
      const q = instante(a.em);
      if (!q) continue;
      const campos = lista(a.campos).map(txt).filter(Boolean);
      const chave = txt(a.id) || [txt(a.em), txt(a.acao), campos.join(',')].join('|');
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const autor = obj(a.autor) ? (txt(a.autor.nome) || txt(a.autor.login)) : '';
      const perto = tipo => ev.find(e => e.tipo === tipo && Math.abs(e.ato - q.t) <= JANELA_DIARIO);
      if (a.acao === 'criar') {
        const criada = perto('criada');
        if (criada) { criada.noDiario = autor || 'registrado'; continue; }
        poe('diario', a.em, `${autor || 'Sem autor'} criou a O.S.`, '', {k: 'diario|' + chave});
        continue;
      }
      const resto = campos.filter(cp => {
        const alvo = CAMPO_TIPO[cp] ? perto(CAMPO_TIPO[cp]) : null;
        if (alvo) { alvo.noDiario = alvo.noDiario || autor || 'registrado'; return false; }
        return true;
      });
      if (campos.length && !resto.length) continue;
      poe('diario', a.em, `${autor || 'Sem autor'} ${DIARIO_ACOES[a.acao] || 'alterou'}`, resto.map(cp => descrever(cp, a)).join('; '), {k: 'diario|' + chave});
    }
  }

  /* O STATUS NO FILTRO: a chave é o estado da statusEntrega (a mesma régua do
     selo e do servidor), com o abonado separado (atraso e retorno antecipado
     abonados não são perda). A O.S. só do ERP, sem ficha neste aparelho, tem
     a chave dela. */
  const ORDEM_STATUS = ['cancelado', 'retrabalho', 'retorno_antecipado', 'retorno_antecipado_abonado', 'atraso', 'atraso_abonado', 'no_prazo', 'entregue', 'execucao', 'agendado', 'sem_status', 'sem_ficha'];
  const ROTULO_STATUS = {cancelado: 'Cancelado', retrabalho: 'Retrabalho', retorno_antecipado: 'Retorno antecipado', retorno_antecipado_abonado: 'Retorno antecipado (abonado)',
    atraso: 'Com atraso', atraso_abonado: 'Com atraso (abonado)', no_prazo: 'No prazo', entregue: 'Entregue sem medida de prazo', execucao: 'Em execução',
    agendado: 'Agendado ou a agendar', sem_status: 'Sem status', sem_ficha: 'Sem ficha no aparelho'};
  function chaveStatus(st) {
    if (!obj(st) || !st.estado) return 'sem_status';
    const a = lista(st.aplicaveis)[0];
    const k = st.estado + (a && a.abonado ? '_abonado' : '');
    return ROTULO_STATUS[k] ? k : 'sem_status';
  }
  /* OS FILTROS DA VISTA. `f` = {status, equipe, busca}. `sem` deixa um deles
     de fora: é a contagem de cada chip de status, que segue a equipe e a
     busca. A busca casa cada palavra (sem acento, sem caixa) com o texto da
     linha: número, cliente, nome e ID de cada pessoa e o nome da equipe. A
     equipe casa pelo ID (o equipeId da divisão, ou as pessoas da O.S. pelo
     ID, nunca pelo nome); '_sem' é a O.S. sem ninguém na equipe. */
  const termosDe = b => norm(b).split(' ').filter(Boolean);
  function passa(l, f, sem, termos) {
    if (sem !== 'status' && f.status && l.chave !== f.status) return false;
    if (sem !== 'equipe' && f.equipe) {
      if (f.equipe === '_sem') { if (!l.card || lista(l.pessoas).length) return false; }
      else if (!lista(l.equipes).some(e => e.id === f.equipe)) return false;
    }
    if (sem !== 'busca' && termos.length && !termos.every(t => String(l.busca || '').includes(t))) return false;
    return true;
  }
  function filtrar(linhas, f = {}) { const termos = termosDe(f.busca); return lista(linhas).filter(l => passa(l, f, '', termos)); }
  function contarStatus(linhas, f = {}) {
    const termos = termosDe(f.busca), m = new Map();
    for (const l of lista(linhas)) if (passa(l, f, 'status', termos)) m.set(l.chave, (m.get(l.chave) || 0) + 1);
    return m;
  }
  // O texto em que a busca procura, pronto (sem acento, sem caixa).
  function textoBusca(partesTexto) { return norm(lista(partesTexto).filter(x => x != null && x !== '').join(' ')); }
  /* A EQUIPE DA O.S. PELO ID. A divisão (os.alocacao, F08) diz a equipe pelo
     equipeId, e vale mesmo para a equipe desativada depois (é história). Sem
     equipe na divisão (ou com a divisão desatualizada), a equipe ativa que tem
     alguém da O.S. entre os integrantes, pelo ID da pessoa. `equipes` são
     {id, nome, ativo, ids: Set de IDs dos integrantes}. */
  function equipesDaOS(os, idsDaOS, equipes) {
    const out = [];
    const aloc = obj(os && os.alocacao) && !os.alocacao.desatualizada ? os.alocacao : null;
    const ditas = aloc ? [...new Set(lista(aloc.grupos).map(g => obj(g) ? txt(g.equipeId) : '').filter(Boolean))] : [];
    for (const id of ditas) {
      const e = lista(equipes).find(x => x.id === id);
      out.push(e ? {...e, como: 'divisao'} : {id, nome: 'Equipe que não existe mais', ativo: false, ids: new Set(), cor: '', como: 'divisao'});
    }
    if (!ditas.length) {
      const ids = idsDaOS instanceof Set ? idsDaOS : new Set(lista(idsDaOS));
      for (const e of lista(equipes)) if (e.ativo !== false && [...(e.ids || [])].some(i => ids.has(i))) out.push({...e, como: 'pessoas'});
    }
    return out;
  }
  /* A PERDA PELA REGRA DO DIA DA ENTREGA, para a comissão prevista: a mesma
     conta do statusEntrega (o abonado nunca é perda; o atraso só é perda da
     O.S. entregue), lida dos estados que a O.S. já tem. */
  const PERDA_DO_ESTADO = {atraso: 'atraso', retrabalho: 'retrabalho', retorno_antecipado: 'retornoAntecipado'};
  function perdasPelaRegra(st, regra) {
    const perdas = obj(regra) && Array.isArray(regra.perdas) ? regra.perdas : [];
    return lista(st && st.aplicaveis).filter(a => obj(a) && !a.abonado && PERDA_DO_ESTADO[a.estado] && perdas.includes(PERDA_DO_ESTADO[a.estado]) && (a.estado !== 'atraso' || !!st.entregue))
      .map(a => PERDA_DO_ESTADO[a.estado]);
  }

  return {FUSO, instante, quando, diaDe, ddmm, ddmmaa, cortar, cap, minTxt, norm, linhaDoTempo, ORDEM_STATUS, ROTULO_STATUS, chaveStatus,
    filtrar, contarStatus, textoBusca, equipesDaOS, perdasPelaRegra, CAMPO_TIPO};
})(typeof OPERACAO !== 'undefined' ? OPERACAO : (typeof require === 'function' ? require('./operacao.js') : null));
if (typeof module !== 'undefined' && module.exports) module.exports = POR_OS;

/* ══════════════════════════════════════════════════════════════════════════
   A TELA (lê STATE, STORE e as funções da casa.js e da app.js na hora)
   ══════════════════════════════════════════════════════════════════════════ */
const POR_OS_LOTE = 24;
// O status de cada O.S., guardado enquanto nenhuma O.S. do aparelho mudar (ver porOSMontar).
let _porOSMemo = {fp: '', st: new Map()};
let _porOSDados = null;
// O.S. antiga pedida ao servidor (por número): 'carregando' | 'achou' | 'nao' | 'nao-periodo' | 'offline' | 'erro'.
const _porOSCarga = new Map();
// O diário de alterações de cada O.S. (por id), só em memória: o store nunca o guarda no aparelho.
const _porOSDiario = new Map();

function porOSFiltro() {
  if (!STATE._porOS || typeof STATE._porOS !== 'object') STATE._porOS = {};
  const f = STATE._porOS;
  for (const k of ['status', 'equipe', 'busca']) if (typeof f[k] !== 'string') f[k] = '';
  if (!Number.isInteger(f.limite) || f.limite < POR_OS_LOTE) f.limite = POR_OS_LOTE;
  if (!Array.isArray(f.abertas)) f.abertas = [];
  return f;
}
const porOSTemFiltro = f => !!(f && (f.status || f.equipe || String(f.busca || '').trim()));
// R$ e comissão só para admin e pcp (a operação, a montagem e o comercial não veem dinheiro aqui).
const porOSVerValor = () => ['admin', 'pcp'].includes(String((STATE.user || {}).papel || '')) && !(typeof crachaEhToque === 'function' && crachaEhToque());
const porOSDia = v => (typeof OPERACAO !== 'undefined' && OPERACAO.dia ? OPERACAO.dia(v) : POR_OS.diaDe(v)) || '';

/* O STATUS DA O.S.: o mesmo da ficha e do card (statusEntregaDe, app.js),
   com a regra do dia e a volta; sem a app.js (teste), a mesma conta aqui. */
function porOSStatusDe(os, todas, hoje) {
  if (typeof statusEntregaDe === 'function') return statusEntregaDe(os);
  if (typeof OPERACAO === 'undefined' || typeof OPERACAO.statusEntrega !== 'function') return null;
  let regra = null, volta = null;
  const ch = typeof OPERACAO.chegadaConferida === 'function' ? OPERACAO.chegadaConferida(os) : null;
  try { if (typeof REGRAS !== 'undefined' && typeof versoesRegrasCasa === 'function') regra = REGRAS.regraVigente(versoesRegrasCasa(), ch ? ch.dia : hoje); } catch (e) { regra = null; }
  if (ch && typeof OPERACAO.voltaNaLista === 'function') try { volta = OPERACAO.voltaNaLista(os, todas); } catch (e) { volta = null; }
  try { return OPERACAO.statusEntrega(os, undefined, regra, volta); } catch (e) { return null; }
}
function porOSCorDe(e) {
  const P = typeof PERF !== 'undefined' ? PERF : null;
  if (P && typeof P.corValida === 'function') {
    if (P.corValida(e.cor)) return e.cor;
    const k = P.COR_ANIMAL && Object.prototype.hasOwnProperty.call(P.COR_ANIMAL, e.animal) ? P.COR_ANIMAL[e.animal] : '';
    return k && P.corValida(k) ? k : '';
  }
  // Sem a paleta carregada: a chave como veio, só se for só letras (vira nome de classe).
  return /^[a-z]{3,12}$/.test(String(e.cor || '')) ? e.cor : '';
}
// As equipes cadastradas (F06), com os integrantes pelo ID de hoje.
function porOSEquipesCfg() {
  const cfg = STORE.getCFG ? (STORE.getCFG() || {}) : {};
  const eqs = ((cfg.performancePCP || {}).equipes || []).filter(e => e && e.id);
  return eqs.map(e => {
    const ids = new Set();
    for (const m of Array.isArray(e.membros) ? e.membros : []) {
      const bruto = typeof perfIdMembro === 'function' ? perfIdMembro(m) : String(m && (m.pessoaId || m.chave) || '').trim();
      const id = /^\d{6}$/.test(bruto) ? bruto : OPERACAO.idPessoa(bruto);
      if (id) ids.add(id);
    }
    if (/^\d{6}$/.test(String(e.liderPadraoId || ''))) ids.add(String(e.liderPadraoId));
    return {id: String(e.id), nome: String(e.nome || e.id), ativo: e.ativo !== false, cor: porOSCorDe(e), e, ids};
  });
}

/* AS LINHAS DA VISTA, uma por O.S. da lista do ERP no período (a mesma lista
   da Tabela). Monta na pintura completa; os toques só filtram estas linhas.
   O status é guardado por O.S. enquanto a "impressão digital" das O.S. do
   aparelho (id, atualizadoEm, rev, finalizadaEm), o dia e as regras não
   mudam: trocar o período não recalcula o que já foi calculado. */
function porOSMontar(erpLista, todas, hoje) {
  const hist = typeof STORE.historico === 'function' ? (STORE.historico() || []) : [];
  const porNumero = new Map(), doServidor = new Set();
  for (const o of todas) porNumero.set(String(o.numero || '').trim(), o);
  for (const o of hist) {
    const n = String(o && o.numero || '').trim();
    if (n && !porNumero.has(n)) { porNumero.set(n, o); doServidor.add(o.id); }
  }
  const versoes = typeof versoesRegrasCasa === 'function' ? (versoesRegrasCasa() || []) : [];
  const fp = [hoje, todas.length, hist.length, JSON.stringify(versoes.map(v => v && [v.id, v.versao, v.validaDesde]))].join('|') + '#'
    + todas.concat(hist).map(o => o ? `${o.id}:${o.atualizadoEm || ''}:${o.rev || ''}:${o.finalizadaEm || ''}` : '').join(',');
  if (fp !== _porOSMemo.fp) _porOSMemo = {fp, st: new Map()};
  const equipes = porOSEquipesCfg();
  const limite = typeof limiteJanelaCasa === 'function' ? limiteJanelaCasa() : '';
  const linhas = [];
  for (const erp of erpLista) {
    const numero = String(erp.numero || '').trim();
    const card = porNumero.get(numero) || null;
    let st = null;
    if (card) {
      if (_porOSMemo.st.has(card.id)) st = _porOSMemo.st.get(card.id);
      else { st = porOSStatusDe(card, todas, hoje); _porOSMemo.st.set(card.id, st); }
    }
    const pessoas = card ? OPERACAO.equipe(card).map(x => {
      const id = OPERACAO.idPessoa(x), p = id && typeof OPERACAO.pessoaDe === 'function' ? OPERACAO.pessoaDe(x) : null;
      return {entrada: String(x), id, nome: OPERACAO.nomePessoa(x), nomeRH: (p && p.nome) || '', apelido: (p && p.apelido) || '', freelancer: !!(p && p.freelancer === true)};
    }) : [];
    const eqs = card ? POR_OS.equipesDaOS(card, new Set(pessoas.map(p => p.id).filter(Boolean)), equipes) : [];
    const cliente = String(erp.cliente || (card && card.cliente) || '').trim();
    const valor = erp.valor !== null && erp.valor !== undefined && erp.valor !== '' && Number.isFinite(Number(erp.valor)) ? Number(erp.valor) : null;
    linhas.push({
      numero, erp, card, st, valor, cliente, doServidor: !!(card && doServidor.has(card.id)),
      fora: !card && !!porOSDia(erp.data) && !!limite && porOSDia(erp.data) < limite,
      chave: card ? POR_OS.chaveStatus(st) : 'sem_ficha',
      pessoas, equipes: eqs,
      busca: POR_OS.textoBusca([numero, cliente, card && card.cliente, ...pessoas.flatMap(p => [p.nome, p.nomeRH, p.apelido, p.id, p.entrada]), ...eqs.map(e => e.nome)]),
    });
  }
  _porOSDados = {linhas, equipes, versoes, hoje, total: linhas.length, verValor: porOSVerValor()};
  return _porOSDados;
}

/* ── O que a vista pinta ─────────────────────────────────────────────────── */
function porOSSeloHTML(st) {
  if (typeof seloStatusEntregaHTML === 'function') return seloStatusEntregaHTML(st);
  const a = st && Array.isArray(st.aplicaveis) ? st.aplicaveis[0] : null;
  return st && st.estado ? `<span class="selo-entrega se-${esc(st.estado)}${a && a.abonado ? ' se-abonado' : ''}">${esc(st.rotulo)}</span>` : '';
}
function porOSLogoHTML(eq) {
  const e = eq.e || {id: eq.id, nome: eq.nome};
  if (typeof perfLogoHTML === 'function' && typeof PERF !== 'undefined') return perfLogoHTML(e, 'poros-eq-logo');
  return `<span class="poros-eq-logo" aria-hidden="true">${esc(String(eq.nome || '?').slice(0, 1).toUpperCase())}</span>`;
}
// Os chips de status, com quantas O.S. de cada (seguindo a equipe e a busca).
function porOSChipsHTML() {
  const d = _porOSDados, f = porOSFiltro();
  const cont = POR_OS.contarStatus(d.linhas, f);
  let total = 0;
  for (const n of cont.values()) total += n;
  const chip = (k, rotulo, n) => `<button type="button" class="poros-chip${f.status === k ? ' ativo' : ''}" data-poros-status="${esc(k)}" aria-pressed="${f.status === k}">${esc(rotulo)} <b>${n}</b></button>`;
  const out = [chip('', 'Todas', total)];
  for (const k of POR_OS.ORDEM_STATUS) {
    const n = cont.get(k) || 0;
    if (n || f.status === k) out.push(chip(k, POR_OS.ROTULO_STATUS[k], n));
  }
  return out.join('');
}
// O aviso logo abaixo dos cartões do topo: eles não seguem os filtros desta vista.
function porOSAvisoKpiHTML() {
  const on = porOSTemFiltro(porOSFiltro());
  return `<p class="ent-kpi-aviso" id="ent-kpi-poros" role="status"${on ? '' : ' hidden'}>${on ? porOSAvisoKpiTexto() : ''}</p>`;
}
function porOSAvisoKpiTexto() {
  return 'Estes cartões são o total do ERP no período e não seguem os filtros da vista Por O.S. O número com os filtros está na própria vista, mais abaixo.';
}
// A seção inteira: os filtros e o corpo. Os filtros de equipe e busca não se repintam no toque (o foco fica no campo).
function porOSSecaoHTML() {
  const d = _porOSDados, f = porOSFiltro();
  if (!d) return '';
  const usadas = new Set(d.linhas.flatMap(l => l.equipes.map(e => e.id)));
  const opcoes = d.equipes.filter(e => e.ativo || usadas.has(e.id));
  for (const id of usadas) if (!opcoes.some(e => e.id === id)) opcoes.push(d.linhas.flatMap(l => l.equipes).find(e => e.id === id));
  if (f.equipe && f.equipe !== '_sem' && !opcoes.some(e => e.id === f.equipe)) opcoes.push({id: f.equipe, nome: 'Equipe que não existe mais'});
  const opt = (v, rotulo) => `<option value="${esc(v)}"${f.equipe === v ? ' selected' : ''}>${esc(rotulo)}</option>`;
  return `<section class="poros" id="ent-poros" aria-label="Entregas por O.S.">
      <div class="poros-filtros">
        <div class="poros-chips" id="poros-chips" role="group" aria-label="Status da entrega">${porOSChipsHTML()}</div>
        <div class="poros-campos">
          <label class="poros-campo">Equipe<select id="poros-equipe">${opt('', 'Todas as equipes')}${opcoes.map(e => opt(e.id, e.nome + (e.ativo === false ? ' (desativada)' : ''))).join('')}${opt('_sem', 'Sem ninguém na equipe')}</select></label>
          <label class="poros-campo poros-busca">Buscar<input type="search" id="poros-busca" value="${esc(f.busca)}" placeholder="Nº da O.S., cliente, pessoa ou ID" autocomplete="off" enterkeyhint="search"></label>
          <button type="button" class="btn-ghost poros-limpar" data-poros-limpar${porOSTemFiltro(f) ? '' : ' hidden'}>Limpar filtros</button>
        </div>
      </div>
      <div id="poros-corpo">${porOSCorpoHTML()}</div>
    </section>`;
}
// O número da vista: acompanha o filtro e, com filtro, diz que os cartões do topo não acompanham.
function porOSResumoHTML(vis, f) {
  const d = _porOSDados, filtro = porOSTemFiltro(f);
  let soma = 0, semValor = 0;
  for (const l of vis) { if (l.valor == null) semValor++; else soma += l.valor; }
  const dinheiro = d.verValor ? ` · <strong>${esc(dinheiroCasa(soma))}</strong>${semValor ? ` <span class="badge sem-valor">${semValor} sem valor</span>` : ''}` : '';
  const qual = filtro ? `de ${d.total} O.S. do período, com os filtros desta vista${dinheiro}. Os cartões do topo não mudam com estes filtros.`
    : `${vis.length === 1 ? 'O.S. entregue' : 'O.S. entregues'} no período, a mesma lista da Tabela${dinheiro}.`;
  const mostra = vis.length > f.limite ? ` Mostrando ${f.limite}.` : '';
  return `<p class="poros-resumo" aria-live="polite"><strong>${vis.length}</strong> ${qual}${mostra}</p>`;
}
function porOSMaisHTML(vis, f) {
  const resto = vis.length - f.limite;
  return resto > 0 ? `<button type="button" class="btn-ghost poros-mais" data-poros-mais>Mostrar mais ${Math.min(POR_OS_LOTE, resto)} (faltam ${resto})</button>` : '';
}
// O corpo: o número da vista (que acompanha o filtro), o aviso das antigas, os cartões e o "Mostrar mais".
function porOSCorpoHTML() {
  const d = _porOSDados, f = porOSFiltro();
  const vis = POR_OS.filtrar(d.linhas, f);
  const filtro = porOSTemFiltro(f);
  const resumo = porOSResumoHTML(vis, f);
  const janela = typeof janelaLocalCasa === 'function' ? janelaLocalCasa() : 60;
  const antigas = vis.filter(l => l.fora && !['carregando', 'achou', 'nao'].includes(_porOSCarga.get(l.numero))).length;
  const avisoAntigas = antigas && typeof STORE.buscarHistorico === 'function'
    ? `<div class="poros-aviso poros-antigas"><span>${antigas} ${antigas === 1 ? 'O.S. foi entregue' : 'O.S. foram entregues'} há mais de ${janela} dias e não ${antigas === 1 ? 'tem' : 'têm'} cópia neste aparelho.</span><button type="button" class="btn-ghost btn-sm" data-poros-antigas>Carregar do servidor</button></div>` : '';
  if (!vis.length) return resumo + `<p class="poros-vazio">Nenhuma O.S. com estes filtros.${filtro ? ' <button type="button" class="btn-ghost btn-sm" data-poros-limpar>Limpar filtros</button>' : ''}</p>`;
  return resumo + avisoAntigas + `<div class="poros-grade">${vis.slice(0, f.limite).map(porOSCardHTML).join('')}</div>` + porOSMaisHTML(vis, f);
}

const porOSDiasTxt = n => n === 1 ? '1 dia' : `${n} dias`;
// "Prazo 20/09 · entregue 22/09, 2 dias depois · ERP 22/09"
function porOSPrazoTxt(l) {
  const st = l.st, erpDia = porOSDia(l.erp.data), interno = (l.card || l.erp).tipo === 'interno';
  if (!st) return `ERP: ${interno ? 'retirada' : 'entregue'} em ${POR_OS.ddmmaa(erpDia) || 'data não informada'}`;
  const prazo = st.prazo ? 'Prazo ' + (st.prazoInicio && st.prazoInicio !== st.prazo ? `${POR_OS.ddmm(st.prazoInicio)} a ${POR_OS.ddmm(st.prazo)}` : POR_OS.ddmm(st.prazo)) : 'Sem prazo combinado';
  let entrega;
  if (st.estado === 'cancelado') entrega = 'cancelada';
  else if (st.dataEntrega) entrega = `${interno ? 'retirada' : 'entregue'} ${POR_OS.ddmm(st.dataEntrega)}${st.diasAtraso ? `, ${porOSDiasTxt(st.diasAtraso)} depois` : st.prazo ? ', no prazo' : ''}`;
  else if (st.entregue) entrega = st.fonteEntrega === 'aLancar' ? 'entrega a lançar (a data vem no lançamento)' : 'baixa do ERP sem o dia da entrega';
  else entrega = `ainda não entregue no PCP${st.diasAtraso ? `, prazo vencido há ${porOSDiasTxt(st.diasAtraso)}` : ''}`;
  const erp = erpDia && erpDia !== st.dataEntrega ? ` · ERP ${POR_OS.ddmm(erpDia)}` : '';
  return `${prazo} · ${entrega}${erp}`;
}
// "Previsto 16:30 · conferido 15:40 (50 minutos antes: perda)"
function porOSRetornoTxt(l) {
  const c = l.card, st = l.st;
  const ch = typeof OPERACAO.chegadaConferida === 'function' ? OPERACAO.chegadaConferida(c) : null;
  const prevs = typeof OPERACAO.retornosPrevistos === 'function' ? OPERACAO.retornosPrevistos(c) : [];
  const ra = st && st.retornoAntecipado && typeof st.retornoAntecipado === 'object' ? st.retornoAntecipado : null;
  const diaRef = ch ? ch.dia : (st && st.dataEntrega) || '';
  const prev = prevs.find(p => p.dia === diaRef) || prevs[prevs.length - 1] || null;
  let prevTxt = prev ? `Previsto ${prev.hora}${prevs.length > 1 || (ch && prev.dia !== ch.dia) ? ' de ' + POR_OS.ddmm(prev.dia) : ''}` : 'Sem retorno previsto';
  if (ra && ra.previsto && ch && ra.dia === ch.dia) prevTxt = `Previsto ${ra.previsto}${ra.osDaVolta > 1 ? ` (volta de ${ra.osDaVolta} O.S.)` : ''}`;
  const chTxt = ch ? `conferido ${ch.hora}${prev && prev.dia !== ch.dia ? ' de ' + POR_OS.ddmm(ch.dia) : ''}` : 'chegada não conferida';
  let como = '';
  if (ra && ch) {
    if (ra.situacao === 'antecipado') como = `${POR_OS.minTxt(ra.minutos)} antes: perda`;
    else if (ra.situacao === 'abonado') como = `${POR_OS.minTxt(ra.minutos)} antes, abonado`;
    else if (ra.situacao === 'no horário') como = 'no horário';
    else if (ra.situacao === 'na volta') como = 'a volta chegou antes; a perda fica na O.S. do último retorno previsto';
  }
  const decl = String(c.horaRetorno || '').trim() ? `; a equipe anotou ${String(c.horaRetorno).trim()}` : '';
  return `${prevTxt} · ${chTxt}${como ? ` (${como})` : ''}${decl}`;
}
// A comissão prevista pela regra vigente no dia da entrega (só admin e pcp veem).
function porOSComissaoHTML(l) {
  const {card, st} = l;
  const nota = t => `<small>${esc(t)}</small>`;
  if (!card || !st) return nota('sem ficha neste aparelho');
  if (typeof REGRAS === 'undefined' || !REGRAS || typeof REGRAS.regraVigente !== 'function') return nota('a regra do programa não carregou nesta aba');
  const dia = st.dataEntrega || porOSDia(l.erp.data);
  const regra = REGRAS.regraVigente(_porOSDados.versoes, dia);
  if (!regra) return nota(`não se aplica: entregue em ${POR_OS.ddmmaa(dia) || 'data sem registro'}, antes de 01/10/2026 (fica na regra atual)`);
  const pct = String(regra.comissaoBp / 100).replace('.', ',') + '%';
  const provisoria = regra.provisoria ? ', regra provisória' : '';
  if (st.estado === 'cancelado') return `<b>${esc(dinheiroCasa(0))}</b> ${nota('prevista: cancelada, não pontua')}`;
  const perdas = POR_OS.perdasPelaRegra(st, regra);
  const rot = {atraso: 'atraso', retrabalho: 'retrabalho', retornoAntecipado: 'retorno antecipado'};
  if (perdas.length) return `<b>${esc(dinheiroCasa(0))}</b> ${nota(`prevista: não pontua (${perdas.map(p => rot[p] || p).join(' e ')})`)}`;
  if (!st.entregue) return nota('a entrega ainda não foi registrada no PCP');
  // Baixa do ERP a lançar (ou sem o dia): o prazo só é julgado com a data do lançamento.
  if (!st.dataEntrega) return nota('sai depois do lançamento: sem a data da entrega, o prazo ainda não foi julgado');
  if (l.valor == null) return nota('sem valor no ERP');
  const centavos = REGRAS.comissaoCentavos(Math.round(l.valor * 100), regra);
  return `<b>${esc(dinheiroCasa(centavos / 100))}</b> ${nota(`prevista, ${pct} da O.S. que pontua${provisoria}`)}`;
}
function porOSCargaTxt(numero) {
  return {carregando: 'Procurando no servidor…', offline: 'Sem rede: tente de novo quando houver sinal.', erro: 'O servidor não respondeu: tente de novo.',
    nao: 'O servidor também não tem esta O.S. no PCP: ela saiu pelo ERP sem passar pelo PCP.',
    'nao-periodo': 'Não veio na busca do período: procure só esta.'}[_porOSCarga.get(numero)] || '';
}
function porOSCardHTML(l) {
  const d = _porOSDados, f = porOSFiltro(), c = l.card, st = l.st;
  const interno = (c || l.erp).tipo === 'interno';
  const janela = typeof janelaLocalCasa === 'function' ? janelaLocalCasa() : 60;
  const selo = st ? porOSSeloHTML(st) : `<span class="selo-entrega se-agendado">${l.fora ? 'sem cópia no aparelho' : interno ? 'retirada sem ficha' : 'fora do PCP'}</span>`;
  const endereco = c && String(c.endereco || '').trim() ? `<p class="poros-end"><span aria-hidden="true">📍</span> ${esc(String(c.endereco).trim())}</p>` : '';
  const motivo = st && st.motivo ? `<p class="poros-motivo">${esc(POR_OS.cap(st.motivo))}.</p>` : '';
  const fatos = [['Prazo × entrega', esc(porOSPrazoTxt(l))]];
  if (c && !interno) fatos.push(['Retorno previsto × conferido', esc(porOSRetornoTxt(l))]);
  if (d.verValor) {
    fatos.push(['Valor (ERP)', l.valor == null ? '<span class="badge sem-valor">sem valor</span>' : `<b>${esc(dinheiroCasa(l.valor))}</b>`]);
    fatos.push(['Comissão prevista', porOSComissaoHTML(l)]);
  }
  const fatosHTML = `<dl class="poros-fatos">${fatos.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  let corpo = '';
  if (c) {
    const eqs = l.equipes.map(e => `<span class="poros-eq${e.cor ? ` perf-cor-${esc(e.cor)} perf-com-cor` : ''}${e.como === 'pessoas' ? ' pelas-pessoas' : ''}" title="${e.como === 'divisao' ? 'Equipe da divisão da O.S.' : 'Equipe de quem está na O.S. (sem divisão gravada)'}">${porOSLogoHTML(e)}<span>${esc(e.nome)}</span></span>`).join('');
    const gente = l.pessoas.map(p => `<span class="poros-pessoa">${esc(p.nome)}${p.freelancer ? ' <small class="tag-freelancer">Freelancer</small>' : ''}</span>`).join('');
    const equipe = eqs || gente ? eqs + gente : `<span class="poros-sem-equipe">${interno ? 'retirada no balcão' : 'sem equipe na O.S.'}</span>`;
    const abonar = typeof abonarCardHTML === 'function' ? abonarCardHTML(c, st) : '';
    const aberta = f.abertas.includes(c.id);
    corpo = `<div class="poros-equipe" aria-label="Equipe">${equipe}</div>
        ${l.doServidor ? '<p class="poros-nota">Carregada do servidor: some deste aparelho ao recarregar a página.</p>' : ''}
        <div class="poros-acoes"><button type="button" class="btn-ghost btn-sm poros-abrir" data-os-id="${esc(c.id)}" aria-label="Abrir a ficha da O.S ${esc(l.numero)}">Abrir a ficha</button>${abonar}</div>
        <details class="poros-tl" data-poros-tl="${esc(c.id)}"${aberta ? ' open' : ''}><summary>Linha do tempo</summary><div class="poros-tl-corpo">${aberta ? porOSLinhaHTML(l) : ''}</div></details>`;
  } else {
    const carga = porOSCargaTxt(l.numero), estado = _porOSCarga.get(l.numero);
    const botao = l.fora && typeof STORE.buscarHistorico === 'function' && estado !== 'carregando' && estado !== 'nao'
      ? `<button type="button" class="btn-ghost btn-sm" data-poros-carregar="${esc(l.numero)}">Carregar do servidor</button>` : '';
    const texto = l.fora ? `Entregue há mais de ${janela} dias: o aparelho guarda só os últimos ${janela}.`
      : interno ? 'Retirada no balcão que não passou pelo PCP.' : 'O ERP entregou, mas esta O.S. nunca passou pelo PCP.';
    corpo = `<div class="poros-aviso"><span>${esc(texto)}${carga ? ' ' + esc(carga) : ''}</span>${botao}</div>`;
  }
  return `<article class="poros-card pc-${esc(l.chave)}" aria-label="O.S ${esc(l.numero)}">
      <header class="poros-cab">
        <div class="poros-id"><strong>O.S ${esc(l.numero || '?')}</strong>${selo}</div>
        <div class="poros-cliente">${esc(l.cliente || 'Sem cliente')}</div>
        ${endereco}
      </header>
      ${motivo}${fatosHTML}${corpo}
    </article>`;
}
// O texto de um campo do diário: o rótulo e o antes e depois da ficha (app.js), quando carregou.
function porOSDescreverCampo(campo, a) {
  const rot = typeof AUD_ROTULOS !== 'undefined' && AUD_ROTULOS[campo] ? AUD_ROTULOS[campo] : campo;
  if (typeof audValor !== 'function') return rot;
  return `${rot}: ${audValor(campo, a.antes && a.antes[campo])} → ${audValor(campo, a.depois && a.depois[campo])}`;
}
function porOSLinhaHTML(l) {
  const c = l.card;
  if (!c) return '';
  const di = _porOSDiario.get(c.id);
  const ev = POR_OS.linhaDoTempo(c, {st: l.st, diario: di && di.estado === 'ok' ? di.entradas : null, descreverCampo: porOSDescreverCampo});
  const itens = ev.map(e => `<li class="tl-${esc(e.tipo)}"><time datetime="${esc(new Date(e.t).toISOString())}">${esc(e.data)}${e.hora ? ' ' + esc(e.hora) : ''}</time><div><strong>${esc(e.titulo)}</strong>${e.por ? ` <small>por ${esc(e.por)}</small>` : ''}${e.noDiario ? ` <small class="poros-tl-diario" title="O diário do servidor registrou: ${esc(e.noDiario)}">no diário</small>` : ''}${e.detalhe ? `<br><span>${esc(e.detalhe)}</span>` : ''}</div></li>`).join('');
  let diario = '';
  if (_porOSDados && _porOSDados.verValor && typeof STORE.auditoriaOS === 'function') {
    const botao = rotulo => `<button type="button" class="btn-ghost btn-sm" data-poros-diario="${esc(c.id)}">${rotulo}</button>`;
    if (!di) diario = botao('Juntar o diário de alterações');
    else if (di.estado === 'carregando') diario = '<span>Carregando o diário de alterações…</span>';
    else if (di.estado === 'offline') diario = `<span>Sem conexão: o diário fica no servidor.</span>${botao('Tentar de novo')}`;
    else if (di.estado === 'erro') diario = `<span>Não foi possível carregar o diário: ${esc(di.erro)}</span>${botao('Tentar de novo')}`;
    else diario = `<span>Diário de alterações junto (${di.entradas.length} ${di.entradas.length === 1 ? 'registro' : 'registros'}${di.cortado ? ', só os 500 mais recentes' : ''}).</span>${botao('Atualizar')}`;
  }
  return `${itens ? `<ol class="poros-tl-lista">${itens}</ol>` : '<p class="text-muted">Nada registrado nesta O.S. ainda.</p>'}
      <p class="poros-tl-nota"><span>Horários de Brasília.</span>${diario}</p>`;
}

/* ── Os toques: repintam só os chips, o corpo e o aviso do topo ──────────── */
function pintarPorOS(foco) {
  const sec = document.getElementById('ent-poros');
  if (!sec || !_porOSDados) return;
  const f = porOSFiltro();
  const chips = sec.querySelector('#poros-chips');
  if (chips) chips.innerHTML = porOSChipsHTML();
  const corpo = sec.querySelector('#poros-corpo');
  if (corpo) { corpo.innerHTML = porOSCorpoHTML(); if (typeof bindCardClicks === 'function') bindCardClicks(corpo); }
  const limpar = sec.querySelector('.poros-filtros [data-poros-limpar]');
  if (limpar) limpar.hidden = !porOSTemFiltro(f);
  const aviso = document.getElementById('ent-kpi-poros');
  if (aviso) { const on = porOSTemFiltro(f); aviso.hidden = !on; aviso.textContent = on ? porOSAvisoKpiTexto() : ''; }
  if (foco) { const alvo = sec.querySelector(foco); if (alvo && typeof alvo.focus === 'function') try { alvo.focus(); } catch (e) { /* sem foco, segue */ } }
}
/* "MOSTRAR MAIS" ACRESCENTA, NÃO REPINTA: só os 24 cartões novos entram (com
   144 na tela, repintar todos a cada toque passava da meta de 100 ms). O
   número e o botão são trocados; o foco vai para o primeiro cartão novo. */
function porOSMais() {
  const sec = document.getElementById('ent-poros'), f = porOSFiltro();
  const grade = sec && sec.querySelector('.poros-grade');
  if (!_porOSDados || !grade || typeof grade.insertAdjacentHTML !== 'function') { f.limite += POR_OS_LOTE; pintarPorOS('[data-poros-mais]'); return; }
  const vis = POR_OS.filtrar(_porOSDados.linhas, f), de = f.limite;
  f.limite += POR_OS_LOTE;
  grade.insertAdjacentHTML('beforeend', vis.slice(de, f.limite).map(porOSCardHTML).join(''));
  const resumo = sec.querySelector('.poros-resumo');
  if (resumo) resumo.outerHTML = porOSResumoHTML(vis, f);
  const botao = sec.querySelector('[data-poros-mais]');
  if (botao) { const novo = porOSMaisHTML(vis, f); if (novo) botao.outerHTML = novo; else botao.remove(); }
  if (typeof bindCardClicks === 'function') bindCardClicks(grade);
  const primeiro = grade.querySelectorAll('.poros-card')[de];
  const alvo = primeiro && primeiro.querySelector('button');
  if (alvo) try { alvo.focus(); } catch (e) { /* sem foco, segue */ }
}
// A busca com o cursor dentro sobrevive à repintura completa (a tela repinta a cada mês que chega do ERP).
function porOSGuardarFoco() {
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  if (!a || a.id !== 'poros-busca') return null;
  const ini = a.selectionStart, fim = a.selectionEnd;
  return () => {
    const i = document.getElementById('poros-busca');
    if (!i) return;
    try { i.focus(); if (ini != null) i.setSelectionRange(ini, fim); } catch (e) { /* campo sem seleção */ }
  };
}
function porOSRepintarLinha(id) {
  const sec = document.getElementById('ent-poros');
  const l = _porOSDados && _porOSDados.linhas.find(x => x.card && x.card.id === id);
  if (!sec || !l) return;
  const det = [...sec.querySelectorAll('details[data-poros-tl]')].find(x => x.dataset.porosTl === id);
  const corpo = det && det.querySelector('.poros-tl-corpo');
  if (corpo) corpo.innerHTML = porOSLinhaHTML(l);
}
async function porOSCarregarDiario(id) {
  const atual = _porOSDiario.get(id);
  if ((atual && atual.estado === 'carregando') || typeof STORE.auditoriaOS !== 'function') return;
  _porOSDiario.set(id, {estado: 'carregando'});
  porOSRepintarLinha(id);
  try {
    const r = await STORE.auditoriaOS(id);
    _porOSDiario.set(id, r.offline ? {estado: 'offline'} : {estado: 'ok', entradas: Array.isArray(r.entradas) ? r.entradas : [], cortado: !!r.cortado});
  } catch (e) {
    _porOSDiario.set(id, {estado: 'erro', erro: (e && e.message) || 'erro desconhecido'});
  }
  porOSRepintarLinha(id);
}
/* A O.S. MAIS VELHA QUE A JANELA DO APARELHO vem do servidor sob demanda,
   pelo caminho do histórico (STORE.buscarHistorico, escopo finalizadas): fica
   em memória, nunca no disco, e some ao recarregar. Uma por número, ou todas
   as antigas do recorte de uma vez (pelas datas, com folga, porque o servidor
   procura pela finalização no PCP e o ERP diz a data da entrega). */
async function porOSCarregar(numero) {
  if (typeof STORE.buscarHistorico !== 'function' || _porOSCarga.get(numero) === 'carregando') return;
  _porOSCarga.set(numero, 'carregando');
  pintarPorOS();
  try {
    const r = await STORE.buscarHistorico({q: numero});
    if (r && r.offline) _porOSCarga.set(numero, 'offline');
    else _porOSCarga.set(numero, (r && Array.isArray(r.itens) ? r.itens : []).some(o => String(o && o.numero || '').trim() === numero) ? 'achou' : 'nao');
  } catch (e) {
    _porOSCarga.set(numero, 'erro');
  }
  renderEntregas();
}
async function porOSCarregarAntigas() {
  if (!_porOSDados || typeof STORE.buscarHistorico !== 'function') return;
  const fora = POR_OS.filtrar(_porOSDados.linhas, porOSFiltro()).filter(l => l.fora && !['carregando', 'achou', 'nao'].includes(_porOSCarga.get(l.numero)));
  const dias = fora.map(l => porOSDia(l.erp.data)).filter(Boolean).sort();
  if (!fora.length || !dias.length) return;
  const hoje = _porOSDados.hoje;
  const de = OPERACAO.somarDias(dias[0], -45), ate0 = OPERACAO.somarDias(dias[dias.length - 1], 45);
  for (const l of fora) _porOSCarga.set(l.numero, 'carregando');
  pintarPorOS();
  let r;
  try { r = await STORE.buscarHistorico({de, ate: ate0 > hoje ? hoje : ate0}); } catch (e) { r = {erro: true}; }
  const achadas = new Set((r && Array.isArray(r.itens) ? r.itens : []).map(o => String(o && o.numero || '').trim()));
  for (const l of fora) _porOSCarga.set(l.numero, r.erro ? 'erro' : r.offline ? 'offline' : achadas.has(l.numero) ? 'achou' : 'nao-periodo');
  renderEntregas();
}
// Liga a seção (uma vez por pintura completa): um ouvinte para os botões, a busca, a equipe e a linha do tempo.
function ligarPorOS(el) {
  const sec = el && el.querySelector ? el.querySelector('#ent-poros') : null;
  if (!sec || typeof sec.addEventListener !== 'function') return;
  sec.addEventListener('click', ev => {
    const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!b || !sec.contains(b)) return;
    const f = porOSFiltro();
    if (b.hasAttribute('data-poros-status')) {
      const k = b.dataset.porosStatus || '';
      f.status = f.status === k ? '' : k; f.limite = POR_OS_LOTE;
      pintarPorOS(`[data-poros-status="${f.status}"]`);
    } else if (b.hasAttribute('data-poros-limpar')) {
      f.status = ''; f.equipe = ''; f.busca = ''; f.limite = POR_OS_LOTE;
      const i = sec.querySelector('#poros-busca'); if (i) i.value = '';
      const s = sec.querySelector('#poros-equipe'); if (s) s.value = '';
      pintarPorOS('#poros-busca');
    } else if (b.hasAttribute('data-poros-mais')) porOSMais();
    else if (b.dataset.porosCarregar) porOSCarregar(b.dataset.porosCarregar);
    else if (b.hasAttribute('data-poros-antigas')) porOSCarregarAntigas();
    else if (b.dataset.porosDiario) porOSCarregarDiario(b.dataset.porosDiario);
  });
  // A linha do tempo só é montada quando abre; a aberta fica aberta nas repinturas.
  sec.addEventListener('toggle', ev => {
    const det = ev.target;
    if (!det || !det.matches || !det.matches('details[data-poros-tl]')) return;
    const f = porOSFiltro(), id = det.dataset.porosTl;
    if (det.open) {
      if (!f.abertas.includes(id)) f.abertas = f.abertas.concat(id).slice(-50);
      const corpo = det.querySelector('.poros-tl-corpo');
      const l = _porOSDados && _porOSDados.linhas.find(x => x.card && x.card.id === id);
      if (corpo && !corpo.childElementCount && l) corpo.innerHTML = porOSLinhaHTML(l);
    } else f.abertas = f.abertas.filter(x => x !== id);
  }, true);
  const busca = sec.querySelector('#poros-busca');
  if (busca) busca.addEventListener('input', () => { const f = porOSFiltro(); f.busca = busca.value; f.limite = POR_OS_LOTE; pintarPorOS(); });
  const eq = sec.querySelector('#poros-equipe');
  if (eq) eq.addEventListener('change', () => { const f = porOSFiltro(); f.equipe = eq.value; f.limite = POR_OS_LOTE; pintarPorOS(); });
}
