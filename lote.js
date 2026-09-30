'use strict';

/* FECHAR O DIA: O LOTE DA GESTÃO (F14 do programa das equipes, 30/09/2026).
   Fato medido: nenhum instalador usa o celular, e toda execução é lançada
   pela gestão (a conta pcp, o Thiago) no PC da fábrica. Esta tela é o lote
   dele, dentro de Entregas, só para admin e pcp, com dois modos:
   - "Dia": as O.S. do dia agrupadas por volta (dia, carro e equipe);
   - "Pendências do mês": as instalações entregues sem divisão confirmada e
     as baixadas pelo ERP a lançar, já preenchidas pela sugestão da divisão
     (DIVISAO.alocacaoSugerida, pelo componente ALOCUI). A baixa do ERP fica
     marcada "sem prova" e mostra o saldo de cada item.

   EM CADA GRUPO (a volta): a divisão da equipe (o componente ALOCUI da F09,
   uma vez para as O.S. da volta), a chegada conferida do carro (grava
   retornoConferido em cada O.S.; o servidor só aceita de admin e pcp) e a
   conferência da volta, no molde do salvarConferenciaVolta.
   EM CADA LINHA (a O.S.): a data já preenchida, o retrabalho ("Não" num
   toque; "Sim" abre a pergunta de sempre, perguntarRetrabalho), a entrega
   dos itens ("Todos os itens entregues" num toque, ou a lista para marcar a
   parte, pelo motor ENTREGA_ITEM com via 'lote'), a conferência do que o
   celular declarou (E5) e as faltas da linha.

   SALVAR grava O.S. por O.S., relendo cada uma do STORE antes, pela mesma
   regra do Lançar entrega (aplicarLancamento, F13). O resultado de cada
   linha aparece nela (gravada, na fila, recusada, conflito), e uma recusa ou
   um conflito não seguram as outras. O lote inteiro tem Desfazer.
   O RASCUNHO mora no IndexedDB (base própria, 'impresilk_lote'), por modo e
   dia, e sobrevive a fechar a tela e recarregar. Sair do app o apaga
   (store.js, limparCache).
   ATALHOS no computador: setas entre as linhas, Enter confirma a linha em
   foco, Ctrl+Enter salva. Tecla simples nunca dispara dentro de campo.

   O QUE O LOTE NÃO FAZ (dito na tela, no quadro do primeiro uso):
   - não finaliza a O.S. aberta: marca a entrega dos itens; a finalização
     segue na ficha (fotos e retorno) ou na baixa do ERP;
   - não marca parte em O.S. já finalizada (o motor recusa marca em O.S.
     finalizada): para isso, reabrir pela ficha;
   - a baixa cancelada no ERP fica fora (a marca de cancelada é da F16).
   Textos para quem usa: português, sem travessão. */
const LOTE = (() => {
  const BASE = 'impresilk_lote', LOJA = 'rascunhos', VERSAO = 1;
  const RELATORIOS_GUARDADOS = 5;
  const lista = v => Array.isArray(v) ? v : [];
  const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const copia = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const texto = v => v == null ? '' : String(v).trim();
  const escL = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])));
  const diaOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(Date.parse(v + 'T12:00:00Z')).toISOString().slice(0, 10) === v;
  const horaOk = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
  const loja = o => (o && o.store) || (typeof STORE !== 'undefined' ? STORE : null);
  const hoje = () => (typeof hojeISO === 'function' ? hojeISO() : OPERACAO.dia(new Date()));
  const agoraISO = () => (typeof nowISO === 'function' ? nowISO() : new Date().toISOString());
  const papel = () => String((typeof STATE !== 'undefined' && STATE.user && STATE.user.papel) || '');
  const gestao = () => ['admin', 'pcp'].includes(papel());
  const usuario = () => { const u = (typeof STATE !== 'undefined' && STATE.user) || {}; return String(u.usuario || u.nome || ''); };
  const nomeUsuario = () => String((typeof STATE !== 'undefined' && STATE.user && STATE.user.nome) || '');
  const temMotor = () => typeof ENTREGA_ITEM !== 'undefined' && ENTREGA_ITEM && typeof ENTREGA_ITEM.validarEvento === 'function';
  const temALOCUI = () => typeof ALOCUI !== 'undefined' && ALOCUI && typeof ALOCUI.iniciar === 'function';
  const dataBR = d => diaOk(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
  const MES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rotuloMes = m => /^\d{4}-\d{2}$/.test(String(m || '')) ? `${MES_NOME[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '';
  const SO_GESTAO = 'O Fechar o dia é da gestão do PCP (admin e pcp): nada foi gravado.';
  const PERGUNTAS = () => OPERACAO.PERGUNTAS_VOLTA;
  const CURTO = {carroLimpo: 'Carro limpo', carroArrumado: 'Carro arrumado', equipamentosOk: 'Equipamentos ok', semAvaria: 'Sem avaria nova'};
  let _seq = 0;
  // Código de marca e de lote: o formato que o motor aceita (letra ou número, depois . _ : -).
  function novoId(prefixo) {
    const c = typeof crypto !== 'undefined' ? crypto : null, b = new Uint8Array(10);
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
    else for (let k = 0; k < b.length; k++) b[k] = Math.floor(Math.random() * 256);
    return prefixo + '-' + Array.from(b, x => (x % 36).toString(36)).join('');
  }
  /* O `atualizadoEm` de cada envio é único nesta aba: é por ele que a espera
     reconhece a resposta do servidor à SUA gravação (e não a de antes). */
  let _ultimoEm = 0;
  function emUnico() {
    const base = Date.parse(agoraISO());
    _ultimoEm = Math.max(Number.isFinite(base) ? base : Date.now(), _ultimoEm + 1);
    return new Date(_ultimoEm).toISOString();
  }

  /* ─────────────────────────────── O RASCUNHO NO INDEXEDDB ─────────────── */
  let _db = null, _semIDB = false, _idbDemorou = false, _abrindo = null, _cadeia = Promise.resolve();
  /* A BASE QUE NÃO ABRE A TEMPO (outra aba segurando uma versão, navegador
     travado): a tela não fica em "Abrindo o lote" para sempre. A sessão passa
     a guardar só na memória desta aba, e NUNCA grava por cima do rascunho que
     está na base (ele não foi lido). */
  const PRAZO_BASE_MS = 3000;
  const _mem = new Map();
  function abrirBase() {
    if (_db) return Promise.resolve(_db);
    if (_semIDB || typeof indexedDB === 'undefined' || !indexedDB) { _semIDB = true; return Promise.resolve(null); }
    if (_abrindo) return _abrindo;
    _abrindo = new Promise(resolve => {
      let req, feito = false;
      const fim = db => { if (feito) return; feito = true; resolve(db); };
      const prazo = setTimeout(() => { if (feito) return; _semIDB = true; _idbDemorou = true; fim(null); }, PRAZO_BASE_MS);
      try { req = indexedDB.open(BASE, VERSAO); } catch (e) { clearTimeout(prazo); _semIDB = true; fim(null); return; }
      req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames || !db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA); };
      req.onsuccess = e => {
        clearTimeout(prazo);
        const db = e.target.result;
        // Chegou depois do prazo: esta sessão já é só da memória; a base fica como estava.
        if (feito) { try { db.close(); } catch (x) { /* já fechada */ } return; }
        // Sair do app apaga esta base (limparCache): a conexão aberta não pode segurar o delete.
        db.onversionchange = () => { try { db.close(); } catch (x) { /* já fechada */ } if (_db === db) _db = null; };
        _db = db; fim(db);
      };
      req.onerror = () => { clearTimeout(prazo); _semIDB = true; fim(null); };
    }).finally(() => { _abrindo = null; });
    return _abrindo;
  }
  async function lerGuardado(chave) {
    const db = await abrirBase();
    if (!db) return _mem.has(chave) ? copia(_mem.get(chave)) : null;
    return new Promise(resolve => {
      try {
        const q = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave);
        q.onsuccess = () => resolve(q.result == null ? (_mem.has(chave) ? copia(_mem.get(chave)) : null) : copia(q.result));
        q.onerror = () => resolve(_mem.has(chave) ? copia(_mem.get(chave)) : null);
      } catch (e) { resolve(_mem.has(chave) ? copia(_mem.get(chave)) : null); }
    });
  }
  // As gravações vão em fila: a segunda nunca chega antes da primeira.
  function guardar(chave, valor) {
    _mem.set(chave, copia(valor));
    const passo = async () => {
      const db = await abrirBase();
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(LOJA, 'readwrite');
          if (valor == null) tx.objectStore(LOJA).delete(chave); else tx.objectStore(LOJA).put(copia(valor), chave);
          tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); tx.onabort = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    };
    _cadeia = _cadeia.then(passo, passo);
    return _cadeia;
  }
  const chaveRascunho = (modo, chave) => `rascunho|${usuario()}|${modo}|${chave}`;
  const chaveRelatorios = () => `relatorios|${usuario()}`;

  /* ─────────────────────────────── O ESTADO DA TELA ────────────────────── */
  const est = {
    modo: 'dia', dia: '', mes: '', rascunho: null, carregado: '', carregando: false,
    foco: '', itensAberto: '', alocAberto: '', salvando: false, progresso: '', relatorios: [], relCarregado: '',
    erroRascunho: '', voltaAbertas: new Set(),
  };
  const chaveAtual = () => est.modo === 'dia' ? est.dia : est.mes;
  function rascunhoVazio(modo, chave) { return {versao: VERSAO, modo, chave, usuario: usuario(), criadoEm: agoraISO(), atualizadoEm: '', linhas: {}, grupos: {}}; }
  function persistir() {
    const r = est.rascunho;
    if (!r) return _cadeia;
    r.atualizadoEm = agoraISO();
    return guardar(chaveRascunho(r.modo, r.chave), r).then(ok => { est.erroRascunho = avisoBase(ok); return ok; });
  }
  const avisoBase = ok => _idbDemorou ? 'O rascunho guardado neste navegador não abriu a tempo: o que fizer agora fica só nesta aba. Salve o lote antes de fechar.'
    : _semIDB ? 'Este navegador não guarda o rascunho (sem IndexedDB): ele fica só nesta aba e some ao recarregar.'
    : ok ? '' : 'O rascunho não foi guardado agora: ele continua nesta aba. Salve o lote antes de fechar.';
  async function carregarRelatorios() {
    const k = chaveRelatorios();
    if (est.relCarregado === k) return est.relatorios;
    const v = await lerGuardado(k);
    est.relatorios = lista(v).filter(objeto);
    est.relCarregado = k;
    return est.relatorios;
  }
  function gravarRelatorios() { return guardar(chaveRelatorios(), est.relatorios.slice(0, RELATORIOS_GUARDADOS)); }

  /* ─────────────────────────────── QUAIS O.S. ──────────────────────────── */
  const canceladaERP = o => temMotor() ? ENTREGA_ITEM.canceladaNoERP(o) : false;
  // O dia que vale para a linha e para a volta: o lançado, o da volta, o da finalização.
  const diaLinha = o => OPERACAO.dia(o && o.entregaLancada && o.entregaLancada.data) || OPERACAO.diaDaVolta(o) || OPERACAO.dia(o && o.finalizadaEm);
  const aberta = o => !OPERACAO.dia(o && o.finalizadaEm);
  const baixaERP = o => OPERACAO.encerradaERP(o);
  /* A DATA DA ENTREGA QUE A LINHA SUGERE. A lançada; a da finalização do PCP
     (a que já vale: sugerir outra mudaria o dia da entrega calado); e, na
     baixa do ERP ainda não lançada, o retorno registrado ou o último dia da
     agenda até a baixa: o ERP baixa 2 a 4 dias depois da entrega real. */
  function diaSugerido(o) {
    const lancado = OPERACAO.dia(o && o.entregaLancada && o.entregaLancada.data);
    if (lancado) return lancado;
    const fim = OPERACAO.dia(o && o.finalizadaEm);
    if (!fim) return '';
    if (!baixaERP(o)) return fim;
    const ret = OPERACAO.dia(o.retornoEm);
    if (ret && ret <= fim) return ret;
    return OPERACAO.diasAgenda(o).filter(d => d <= fim).pop() || fim;
  }
  // O dia da volta nas pendências: o do carro que voltou; na baixa do ERP, o dia sugerido da entrega.
  const diaVoltaPendencia = o => baixaERP(o) && !(o.entregaLancada && o.entregaLancada.data) ? diaSugerido(o) : diaLinha(o);
  /* DIA: as instalações que voltaram (ou foram entregues) no dia, a baixa do
     ERP ainda não lançada cuja agenda passou pelo dia (a baixa costuma chegar
     2 a 4 dias depois da entrega), e as O.S. abertas com agenda no dia e
     equipe, liberação ou saída. Retirada no balcão não tem volta. */
  function osDoDia(todas, dia) {
    const out = [];
    for (const o of todas || []) {
      if (!o || OPERACAO.interno(o) || canceladaERP(o)) continue;
      const agenda = OPERACAO.diasAgenda(o).includes(dia);
      if (!aberta(o)) {
        const erpSemLancar = baixaERP(o) && !o.entregaLancada && agenda && OPERACAO.dia(o.finalizadaEm) >= dia;
        if (diaLinha(o) === dia || erpSemLancar) out.push(o);
      } else if (agenda && (o.liberadoPCP || OPERACAO.equipe(o).length || o.horaSaida || o.saidaEm)) out.push(o);
    }
    return out;
  }
  /* PENDÊNCIAS DO MÊS: as instalações entregues no mês sem divisão
     confirmada e as baixas do ERP a lançar (a mesma regra da fila de
     Entregas, classificarEntregas). A cancelada no ERP fica fora e é
     contada no cabeçalho. */
  function osPendentes(todas, mes) {
    const cls = classificarEntregas(todas || []);
    const noMes = o => String(diaSugerido(o) || '').slice(0, 7) === mes;
    const out = [], vistas = new Set();
    let canceladas = 0;
    for (const o of cls.aLancar) {
      if (!noMes(o)) continue;
      if (canceladaERP(o)) { canceladas++; continue; }
      if (!vistas.has(o.id)) { vistas.add(o.id); out.push(o); }
    }
    for (const o of cls.instalacoes) {
      if (!noMes(o) || canceladaERP(o) || vistas.has(o.id)) continue;
      if (typeof DIVISAO !== 'undefined' && DIVISAO.alocacaoConfirmada(o)) continue;
      vistas.add(o.id); out.push(o);
    }
    return {os: out, canceladas};
  }
  function osDaTela(todas) {
    if (est.modo === 'dia') return {os: osDoDia(todas, est.dia), canceladas: 0};
    return osPendentes(todas, est.mes);
  }
  // Os grupos da tela: a volta (dia, carro, equipe), sem exigir equipe.
  function gruposDe(os) {
    const diaDe = est.modo === 'dia' ? () => est.dia : diaVoltaPendencia;
    return OPERACAO.agruparPorVolta(os, diaDe);
  }

  /* ─────────────────────────────── O QUE A O.S. JÁ TEM ─────────────────── */
  const marcasIds = o => lista(o && o.itens).flatMap(it => lista(it && it.entregas).map(e => texto(e && e.id))).filter(Boolean).sort();
  const nucleoAloc = a => (temALOCUI() ? ALOCUI.nucleo(a) : JSON.stringify(a || null));
  const genteDe = eq => (temALOCUI() ? ALOCUI.gente(eq) : lista(eq).map(String).sort().join('|'));
  /* A ASSINATURA do que o lote mexe: equipe e divisão, chegada, volta,
     retrabalho, finalização, lançamento e marcas dos itens. Guardada quando a
     linha aparece; se mudar até o Salvar (outro aparelho gravou e este puxou),
     a linha não vai por cima: o lote avisa e a próxima gravação já parte do
     que está na O.S. agora. */
  function assinatura(o) {
    const rc = objeto(o && o.retornoConf) ? o.retornoConf : {};
    const ch = objeto(o && o.retornoConferido) ? o.retornoConferido : {};
    const rp = objeto(o && o.retrabalhoPerguntado) ? o.retrabalhoPerguntado : {};
    return JSON.stringify([genteDe(o && o.equipe), nucleoAloc(o && o.alocacao), !!(o && o.alocacao && o.alocacao.desatualizada === true),
      PERGUNTAS().map(k => OPERACAO.respostaVolta(rc[k])), texto(rc.obs), texto(ch.dia), texto(ch.hora),
      !!(o && o.retrabalho), texto(rp.resposta), texto(rp.em), texto(o && o.finalizadaEm), texto(o && o.entregaLancada && o.entregaLancada.data), marcasIds(o)]);
  }
  // O que o motor diz de cada item (sem R$): a situação, o saldo e a origem.
  function itensDe(o) {
    if (!temMotor()) return [];
    return lista(o && o.itens).map((it, indice) => {
      if (!objeto(it)) return null;
      let s = null;
      try { s = ENTREGA_ITEM.situacaoItem(it, o); } catch (e) { s = null; }
      return s ? {indice, it, s, uid: texto(it.uid), servico: ENTREGA_ITEM.ehServico(it), parte: ENTREGA_ITEM.aceitaParte(it)} : null;
    }).filter(Boolean);
  }
  const declaracoesDe = o => { if (!temMotor()) return []; try { return ENTREGA_ITEM.declaracoesAConferir(o); } catch (e) { return []; } };
  const respostaFeita = o => { const p = objeto(o && o.retrabalhoPerguntado) ? o.retrabalhoPerguntado : null; return p && (p.resposta === 'sim' || p.resposta === 'nao') ? p.resposta : ''; };
  const marcadaRetrabalho = o => !!(o && (o.retrabalho || (o.checkout && o.checkout.situacao === 'Retrabalho')));
  const semProva = o => baixaERP(o) && !lista(o.fotosRetornoIds).length;

  /* ─────────────────────────────── A LINHA E O GRUPO NO RASCUNHO ───────── */
  function linhaDe(o, grupo) {
    const r = est.rascunho;
    let l = r.linhas[o.id];
    if (!l) {
      // No Dia, a aberta e a baixa do ERP levam o dia que se fecha; o resto, a data que já vale (diaSugerido).
      l = {data: est.modo === 'dia' && (aberta(o) || (baixaERP(o) && !o.entregaLancada)) ? est.dia : (diaSugerido(o) || (grupo && grupo.dia) || hoje()),
        retrabalho: null, entrega: aberta(o) ? '' : 'todos', parte: {}, conferir: false, confirmada: false, visto: assinatura(o)};
      r.linhas[o.id] = l;
    }
    return l;
  }
  // O ponto de partida da conferência: o que o PCP já respondeu na volta (nunca o que a equipe declarou).
  function voltaInicial(g) {
    const base = (g.os.find(o => OPERACAO.voltaRespondida(o.retornoConf)) || {}).retornoConf || {};
    const v = Object.fromEntries(PERGUNTAS().map(k => [k, OPERACAO.respostaVolta(base[k])]));
    v.obs = String(base.obs || '');
    return v;
  }
  function chegadaInicial(g) {
    const hs = [...new Set(g.os.map(o => objeto(o.retornoConferido) && o.retornoConferido.dia === g.dia ? texto(o.retornoConferido.hora) : ''))];
    return hs.length === 1 && horaOk(hs[0]) ? hs[0] : '';
  }
  function grupoDe(g) {
    const r = est.rascunho;
    let rg = r.grupos[g.chave];
    if (!rg) {
      const v = voltaInicial(g), h = chegadaInicial(g);
      rg = {equipeConfirmada: false, aloc: null, pessoas: null, chegada: h, chegadaVista: h, volta: {...v}, voltaVista: {...v}};
      r.grupos[g.chave] = rg;
    }
    return rg;
  }
  const voltaMexida = rg => PERGUNTAS().some(k => (rg.volta[k] || '') !== (rg.voltaVista[k] || '')) || texto(rg.volta.obs) !== texto(rg.voltaVista.obs);
  const chaveAloc = g => 'lote:' + g.chave;
  // A O.S. que representa a volta no componente: a que já tem divisão confirmada, senão a primeira.
  const representante = g => g.os.find(o => typeof DIVISAO !== 'undefined' && DIVISAO.alocacaoConfirmada(o)) || g.os[0];
  const valorGrupo = g => g.os.reduce((s, o) => { const v = typeof valorDaOS === 'function' ? valorDaOS(o) : o.valorTotal; return s + (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0); }, 0);
  /* O COMPONENTE DA DIVISÃO, um por volta. O rascunho guarda a divisão que a
     pessoa montou (ou só as pessoas, no modo só pessoas): reabrir a tela parte
     dela, não da sugestão. */
  function iniciarEquipe(g, rg, reiniciar) {
    if (!temALOCUI()) return null;
    const chave = chaveAloc(g);
    if (!reiniciar && ALOCUI.estado(chave)) return ALOCUI.estado(chave);
    const rep = representante(g);
    let os = rep;
    if (rg.aloc && objeto(rg.aloc) && typeof DIVISAO !== 'undefined' && !DIVISAO.validar(rg.aloc)) os = {...rep, alocacao: {...copia(rg.aloc), em: 'rascunho-do-lote'}, equipe: DIVISAO.derivarEquipe(rg.aloc)};
    // Divisão montada pela metade (sem líder): voltam ao menos as pessoas dela.
    else if (rg.aloc && objeto(rg.aloc) && typeof DIVISAO !== 'undefined') { const {alocacao: _a, ...semAloc} = rep; os = {...semAloc, equipe: DIVISAO.derivarEquipe(rg.aloc)}; }
    else if (Array.isArray(rg.pessoas)) {
      const {alocacao: _a, ...semAloc} = rep;
      os = {...semAloc, equipe: rg.pessoas.slice()};
    }
    const p = papel();
    ALOCUI.iniciar(chave, {os, equipes: typeof equipesCadastradasCasa === 'function' ? equipesCadastradasCasa() : [], papel: p,
      modo: ALOCUI.modoPara(p, os), dica: ALOCUI.dicaModo(p, os), semAntigo: true, reiniciar: true, dia: g.dia,
      valor: valorGrupo(g), versoes: typeof versoesRegrasCasa === 'function' ? versoesRegrasCasa() : []});
    return ALOCUI.estado(chave);
  }
  // A divisão (ou as pessoas) que a volta manda para cada O.S., quando a equipe foi conferida.
  function equipeDoGrupo(g, rg) {
    if (!rg.equipeConfirmada) return {confirmada: false};
    const st = iniciarEquipe(g, rg, false);
    if (!st) return {confirmada: true, modo: 'pessoas', equipe: Array.isArray(rg.pessoas) ? rg.pessoas.slice() : OPERACAO.equipe(g.os[0])};
    const chave = chaveAloc(g);
    if (st.modo === 'pessoas') return {confirmada: true, modo: 'pessoas', equipe: ALOCUI.paraEquipe(chave).equipe};
    const pronto = ALOCUI.paraGravar(chave);
    if (pronto.erro) return {confirmada: true, modo: 'pessoas', equipe: ALOCUI.paraEquipe(chave).equipe, erro: pronto.erro};
    return {confirmada: true, modo: 'divisao', alocacao: pronto.alocacao, equipe: pronto.equipe};
  }
  function guardarEquipeNoRascunho(g, rg) {
    const st = temALOCUI() ? ALOCUI.estado(chaveAloc(g)) : null;
    if (!st) return;
    rg.equipeConfirmada = true;
    if (st.modo === 'pessoas') { rg.pessoas = ALOCUI.paraEquipe(chaveAloc(g)).equipe; rg.aloc = null; }
    else { rg.aloc = copia(st.aloc); rg.pessoas = null; }
  }

  /* ─────────────────────────────── AS FALTAS ───────────────────────────── */
  const respostaDaLinha = (o, l) => (l.retrabalho && l.retrabalho.resposta) || respostaFeita(o);
  /* O que falta na linha. `trava` impede confirmar e salvar; `nota` é o que
     ainda não foi feito e o Salvar aceita (a equipe vazia é perguntada no
     Salvar; a conferência e a chegada ficam como estão). */
  function faltasDaLinha(o, l, g, rg) {
    const trava = [], nota = [];
    if (!diaOk(l.data)) trava.push('data da entrega');
    else if (l.data > hoje()) trava.push('data da entrega depois de hoje');
    if (!respostaDaLinha(o, l)) trava.push('resposta do retrabalho');
    if (aberta(o)) {
      if (!l.entrega) trava.push('entrega dos itens (todos ou a parte)');
      else if (l.entrega === 'parte' && !Object.values(l.parte || {}).some(q => Number(q) > 0)) trava.push('quantidade entregue da parte');
    }
    const conf = rg.equipeConfirmada ? equipeDoGrupo(g, rg) : null;
    const eq = conf ? conf.equipe : OPERACAO.equipe(o);
    if (!lista(eq).length) nota.push('equipe (o Salvar pergunta)');
    else if (conf && conf.erro) nota.push(`divisão da volta: ${conf.erro.replace(/[.\s]*$/, '').toLowerCase()} (sem isso vão só as pessoas)`);
    else if (!rg.equipeConfirmada && !(typeof DIVISAO !== 'undefined' && DIVISAO.alocacaoConfirmada(o))) nota.push('conferir a equipe');
    if (declaracoesDe(o).length && !l.conferir) nota.push('conferir o que a equipe declarou');
    if (!g.semCarro) {
      // A chegada e a conferência que VALEM nesta O.S.: as da volta, se a pessoa mexeu; senão, as gravadas nela.
      const chegou = horaOk(rg.chegada) || (objeto(o.retornoConferido) && o.retornoConferido.dia === g.dia && horaOk(o.retornoConferido.hora));
      if (!chegou) nota.push('chegada do carro');
      if (!OPERACAO.voltaConferidaParaNota(voltaMexida(rg) ? rg.volta : o.retornoConf)) nota.push('conferência da volta');
    }
    return {trava, nota};
  }

  /* ─────────────────────────────── MONTAR A GRAVAÇÃO DE UMA O.S. ───────── */
  const CAMPOS_RETRAB = ['retrabalho', 'problema', 'etapaOrigem', 'causaRaiz', 'responsavelEtapa', 'dataRetrabalho', 'retrabalhoPerguntado'];
  // O que o Desfazer devolve: o antes de cada campo que o lote pode mexer.
  function retrato(o) {
    const r = {equipe: copia(lista(o.equipe)), alocacao: objeto(o.alocacao) ? copia(o.alocacao) : null,
      retornoConferido: objeto(o.retornoConferido) ? copia(o.retornoConferido) : null, retornoConf: objeto(o.retornoConf) ? copia(o.retornoConf) : null,
      entregaLancada: objeto(o.entregaLancada) ? copia(o.entregaLancada) : null, checkoutSituacao: objeto(o.checkout) ? texto(o.checkout.situacao) : ''};
    for (const k of CAMPOS_RETRAB) r[k] = o[k] === undefined ? null : copia(o[k]);
    return r;
  }
  const mesmaDivisao = (o, a) => objeto(o.alocacao) && o.alocacao.desatualizada !== true && nucleoAloc(o.alocacao) === nucleoAloc(a) && genteDe(o.equipe) === genteDe(a && typeof DIVISAO !== 'undefined' ? DIVISAO.derivarEquipe(a) : []);
  /* A GRAVAÇÃO DE UMA LINHA, sobre a O.S. RELIDA agora. Devolve {nova,
     marcas, mexeu, avisos} ou {erro} (a linha não vai). Quem escreve o
     lançamento é o aplicarLancamento (F13), a mesma regra do Lançar entrega:
     data, equipe (divisão da gestão ou só pessoas), conferência da volta (só
     quando a pessoa mexeu no que viu) e resposta do retrabalho. Depois, o que
     é do lote: o lançamento só na O.S. encerrada; a chegada conferida; a
     entrega dos itens da O.S. aberta (via 'lote'); a conferência do que o
     celular declarou. */
  function montarGravacao(atual, l, g, rg) {
    if (!objeto(atual)) return {erro: 'Esta O.S. não está mais neste aparelho.'};
    const f = faltasDaLinha(atual, l, g, rg);
    if (f.trava.length) return {erro: 'Falta: ' + f.trava.join(', ') + '.'};
    const avisos = [], mexeu = {};
    let alocacao = null, pessoas = null;
    const eq = equipeDoGrupo(g, rg);
    if (eq.confirmada) {
      if (eq.modo === 'divisao' && eq.alocacao) {
        if (!mesmaDivisao(atual, eq.alocacao)) {
          alocacao = copia(eq.alocacao);
          // Editou a partir da divisão gravada: devolve o carimbo dela (o servidor recusa cópia velha).
          if (objeto(atual.alocacao) && typeof atual.alocacao.em === 'string' && atual.alocacao.em) alocacao.em = atual.alocacao.em;
          else delete alocacao.em;
          mexeu.alocacao = true;
        }
      } else if (Array.isArray(eq.equipe) && genteDe(eq.equipe) !== genteDe(atual.equipe)) { pessoas = eq.equipe.slice(); mexeu.pessoas = true; }
      if (eq.erro && lista(eq.equipe).length) avisos.push('A divisão da volta não foi gravada (' + eq.erro.replace(/[.\s]*$/, '') + '); só as pessoas foram.');
    }
    const semVolta = OPERACAO.interno(atual) || OPERACAO.semCarro(atual);
    const respostasVolta = voltaMexida(rg) && !semVolta ? Object.fromEntries(PERGUNTAS().map(k => [k, rg.volta[k] || ''])) : null;
    // A resposta desta tela; sem ela, a que a O.S. já tinha fica (não recarimba).
    const retrabalho = l.retrabalho && (l.retrabalho.resposta === 'sim' || l.retrabalho.resposta === 'nao') ? copia(l.retrabalho) : null;
    let nova;
    try { nova = aplicarLancamento(atual, {data: l.data, alocacao, pessoas, respostasVolta, retrabalho}); }
    catch (e) { return {erro: String((e && e.message) || e)}; }
    if (respostasVolta) {
      const obs = texto(rg.volta.obs).slice(0, 300);
      if (obs !== texto(objeto(nova.retornoConf) ? nova.retornoConf.obs : '')) nova.retornoConf = {...(objeto(nova.retornoConf) ? nova.retornoConf : {}), obs};
      if (JSON.stringify(nova.retornoConf || null) !== JSON.stringify(atual.retornoConf || null)) mexeu.volta = true;
    }
    if (retrabalho) mexeu.retrabalho = true;
    /* O LANÇAMENTO (entregaLancada) é da O.S. encerrada: a baixa do ERP (o que
       a fila "a lançar" espera) e a finalizada em outro dia do que a gestão
       conferiu. Na O.S. aberta a entrega fica pelos itens; na finalizada no
       dia certo, a finalização já diz o dia. */
    const lancar = !aberta(atual) && (baixaERP(atual) || l.data !== diaEntrega(atual));
    if (!lancar) { if ('entregaLancada' in atual) nova.entregaLancada = atual.entregaLancada; else delete nova.entregaLancada; }
    else if (!(objeto(atual.entregaLancada) && atual.entregaLancada.data === l.data)) mexeu.lancamento = true;
    // A CHEGADA CONFERIDA (retornoConferido): a mesma hora em toda O.S. da volta.
    if (!g.semCarro && horaOk(rg.chegada)) {
      const ch = objeto(atual.retornoConferido) ? atual.retornoConferido : null;
      if (!(ch && ch.dia === g.dia && ch.hora === rg.chegada)) { nova.retornoConferido = {dia: g.dia, hora: rg.chegada, fonte: 'lote', em: agoraISO()}; mexeu.chegada = true; }
    }
    // AS MARCAS DOS ITENS: a entrega (O.S. aberta) e a conferência do declarado.
    const marcas = [];
    if (temMotor()) {
      nova.itens = lista(atual.itens).map(it => objeto(it) ? {...it, ...(Array.isArray(it.entregas) ? {entregas: it.entregas.slice()} : {})} : it);
      const ctx = () => ({papel: papel(), os: nova, hoje: hoje()});
      const por = nomeUsuario(), em = agoraISO();
      const acrescentar = (indice, ev, rotulo) => {
        const it = nova.itens[indice];
        const v = ENTREGA_ITEM.validarEvento(ev, it, ctx());
        if (!v.ok) return `${rotulo}: ${v.erro}`;
        it.entregas = lista(it.entregas).concat(v.evento);
        marcas.push({id: v.evento.id, indice, uid: texto(it.uid), tipo: v.evento.tipo});
        return '';
      };
      const rotuloItem = it => texto(it && (it.descricao || it.item)) || 'item';
      if (aberta(atual) && (l.entrega === 'todos' || l.entrega === 'parte')) {
        const interna = OPERACAO.interno(atual);
        for (const x of itensDe(atual)) {
          if (x.servico) continue;
          const q = l.entrega === 'todos' ? x.s.saldo : Math.max(0, Math.floor(Number((l.parte || {})[x.uid || ('i' + x.indice)]) || 0));
          if (!q) continue;
          if (x.s.problema || x.s.situacao === 'cancelado') { if (l.entrega === 'todos') avisos.push(`${rotuloItem(x.it)}: ${x.s.problema ? 'com problema aberto, o saldo fica segurado' : 'cancelado'}.`); continue; }
          const erro = acrescentar(x.indice, {id: novoId('lt'), tipo: interna ? 'retirado' : 'entregue', qtde: q, dia: l.data, via: 'lote', por, em}, rotuloItem(x.it));
          if (erro) return {erro};
        }
      }
      if (l.conferir) {
        const primeiro = nova.itens.findIndex(objeto);
        for (const d of declaracoesDe(nova)) {
          const indice = d.indice >= 0 ? d.indice : primeiro;
          if (indice < 0) continue;
          const erro = acrescentar(indice, {id: novoId('lt'), tipo: 'conferido', alvo: d.alvo, dia: hoje(), via: 'lote', por, em}, d.indice >= 0 ? rotuloItem(nova.itens[indice]) : 'Finalização pelo celular');
          if (erro) return {erro};
        }
      }
      if (!marcas.length) nova.itens = atual.itens;
    }
    if (marcas.length) mexeu.marcas = true;
    return {nova, marcas, mexeu, avisos};
  }
  // Nada que o lote mexe mudou: não há o que gravar.
  const nadaMudou = (atual, g) => !Object.keys(g.mexeu).length && assinatura(g.nova) === assinatura(atual);

  /* ─────────────────────────────── A ESPERA DE CADA GRAVAÇÃO ───────────── */
  const _esperas = new Map();
  const _lojas = typeof WeakSet === 'function' ? new WeakSet() : new Set();
  function ouvir(S) {
    if (!S || _lojas.has(S)) return;
    _lojas.add(S);
    if (typeof S.on === 'function') {
      S.on('os-gravada', d => {
        const w = d && _esperas.get(d.id);
        if (!w || !d.enviado || d.enviado.atualizadoEm !== w.em) return;
        w.fim({estado: 'gravada', os: d.os, descartado: lista(d.descartado), motivo: d.motivo || null, avisos: lista(d.avisos).map(String)});
      });
      const recusa = (d, naFila) => {
        const os = d && d.item && d.item.os, w = os && _esperas.get(os.id);
        if (!w || os.atualizadoEm !== w.em) return;
        const motivo = String((d && d.motivo) || 'sem motivo informado').replace(/[.\s]*$/, '.');
        w.fim({estado: 'recusada', naFila, motivo: naFila ? `O servidor não aceitou: ${motivo} A gravação ficou na fila deste aparelho.` : `O servidor recusou: ${motivo}`});
      };
      S.on('item-recusado', d => recusa(d, false));
      S.on('item-pendente', d => recusa(d, true));
    }
    if (typeof S.onConflict === 'function') S.onConflict((local, remoto) => {
      const id = (remoto && remoto.id) || (local && local.id), w = id && _esperas.get(id);
      if (!w) return;
      const quem = remoto && remoto.atualizadoPor ? ` (${remoto.atualizadoPor})` : '';
      w.fim({estado: 'conflito', motivo: `Outra gravação desta O.S. chegou antes ao servidor${quem}. O lote não foi aceito nela: ficou só neste aparelho, na fila, até alguém resolver o aviso de conflito ("Recarregar" descarta o que o lote fez nela; "Sobrescrever" envia).`});
    });
  }
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const naFilaDe = (S, id) => (typeof S.getQueue === 'function' ? lista(S.getQueue()) : []).find(it => it && it.action === 'upsert' && it.os && it.os.id === id) || null;
  const offline = () => typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
  async function gravarEsperando(S, nova, o = {}) {
    const prazo = Number.isFinite(o.prazoMs) ? o.prazoMs : 20000, passo = Number.isFinite(o.passoMs) ? o.passoMs : 300;
    let fim;
    const resultado = new Promise(r => { fim = r; });
    const w = {em: nova.atualizadoEm, feito: false, fim: r => { if (w.feito) return; w.feito = true; if (_esperas.get(nova.id) === w) _esperas.delete(nova.id); fim(r); }};
    _esperas.set(nova.id, w);
    try { S.saveOS(nova); }
    catch (e) { w.fim({estado: 'recusada', motivo: 'Não deu para guardar neste aparelho: ' + String((e && e.message) || e)}); return resultado; }
    if (offline()) { w.fim({estado: 'na-fila', semResposta: true, motivo: 'Sem internet: ficou na fila deste aparelho e vai na próxima sincronização.'}); return resultado; }
    if (o.semEsperar) { w.fim({estado: 'na-fila', semResposta: true, motivo: 'O servidor não respondeu às anteriores: ficou na fila deste aparelho e vai quando ele voltar.'}); return resultado; }
    const t0 = Date.now();
    while (!w.feito) {
      try { if (typeof S.trySync === 'function') await S.trySync(); } catch (e) { /* a fila guarda; o resultado vem pelos eventos ou pelo prazo */ }
      if (w.feito) break;
      const it = naFilaDe(S, nova.id);
      if (it && it.recusa && it.recusa.motivo && it.os && it.os.atualizadoEm === w.em) {
        w.fim({estado: 'recusada', naFila: true, motivo: `O servidor não aceitou: ${String(it.recusa.motivo).replace(/[.\s]*$/, '.')} A gravação ficou na fila deste aparelho.`});
        break;
      }
      if (!it && Date.now() - t0 >= passo) {
        const agora = typeof S.getOS === 'function' ? S.getOS(nova.id) : null;
        w.fim(agora && agora.atualizadoEm === w.em ? {estado: 'gravada'} : {estado: 'recusada', motivo: 'A O.S. voltou a outra versão durante o envio (outra gravação chegou antes, ou o aviso de conflito foi resolvido com "Recarregar"): o lote não valeu nela.'});
        break;
      }
      if (Date.now() - t0 >= prazo) { w.fim({estado: 'na-fila', semResposta: true, motivo: 'O servidor ainda não confirmou: ficou na fila deste aparelho e vai na próxima sincronização.'}); break; }
      await dormir(passo);
    }
    return resultado;
  }
  // O que o servidor deixou de fora de uma gravação aceita: dito na linha.
  function avisosDaResposta(r) {
    const out = [];
    if (lista(r.descartado).includes('alocacao')) out.push('A divisão não foi gravada: ' + String((r.motivo && r.motivo.alocacao) || 'o servidor não aceitou').replace(/[.\s]*$/, '.'));
    if (lista(r.descartado).includes('entregas')) out.push('Alguma marca de item não foi gravada pelo servidor.');
    for (const a of lista(r.avisos)) if (a && !out.includes(a)) out.push(String(a));
    return out;
  }

  /* ─────────────────────────────── SALVAR ──────────────────────────────── */
  function confirmar(msg) { return typeof confirm === 'function' ? !!confirm(msg) : true; }
  // As linhas confirmadas da tela, na ordem dos grupos: {o, l, g, rg}.
  function linhasConfirmadas(todas) {
    const out = [];
    for (const g of gruposDe(osDaTela(todas).os)) {
      const rg = grupoDe(g);
      for (const o of g.os) { const l = linhaDe(o, g); if (l.confirmada) out.push({o, l, g, rg}); }
    }
    return out;
  }
  async function salvar(o = {}) {
    const S = loja(o);
    if (!gestao()) return {erro: SO_GESTAO};
    if (!S || !est.rascunho) return {erro: 'O lote não está aberto.'};
    if (est.salvando) return {erro: 'O lote já está sendo salvo.'};
    const alvo = linhasConfirmadas(typeof S.getAllOS === 'function' ? S.getAllOS() : []);
    if (!alvo.length) return {erro: 'Nenhuma linha confirmada: confirme as linhas (✓ ou Enter) e salve de novo.'};
    /* GRUPO SEM EQUIPE PERGUNTA ANTES (como o Lançar entrega): a entrega não
       conta para ninguém e a conferência da volta não entra na nota. */
    const semEquipe = [];
    for (const x of alvo) {
      const eq = equipeDoGrupo(x.g, x.rg);
      const equipe = eq.confirmada ? eq.equipe : OPERACAO.equipe(x.o);
      if (!lista(equipe).length && !semEquipe.includes(x.g)) semEquipe.push(x.g);
    }
    if (semEquipe.length && !confirmar(`${semEquipe.length === 1 ? 'Uma volta vai' : semEquipe.length + ' voltas vão'} sem equipe (${semEquipe.map(g => `${dataBR(g.dia)} ${g.veiculo || 'sem carro'}`).join('; ')}). A entrega não conta para ninguém e a conferência da volta não entra na nota. Salvar assim?`)) return {cancelado: true};
    ouvir(S);
    est.salvando = true;
    const rel = {id: novoId('lote'), em: agoraISO(), modo: est.modo, chave: chaveAtual(), usuario: usuario(), itens: []};
    est.relatorios = [rel, ...est.relatorios.filter(x => x && x.id !== rel.id)].slice(0, RELATORIOS_GUARDADOS);
    let mudas = 0;
    try {
      for (let i = 0; i < alvo.length; i++) {
        const {o: vista, l, g, rg} = alvo[i];
        est.progresso = `Salvando ${i + 1} de ${alvo.length}…`;
        if (typeof o.aoProgresso === 'function') { try { o.aoProgresso(i, alvo.length); } catch (e) { /* a tela pode ter saído */ } }
        const item = {id: vista.id, numero: String(vista.numero || ''), cliente: String(vista.cliente || ''), estado: 'enviando'};
        rel.itens.push(item);
        // RELÊ DO STORE agora, não a cópia de quando a tela pintou.
        const atual = typeof S.getOS === 'function' ? S.getOS(vista.id) : null;
        if (!atual) { Object.assign(item, {estado: 'recusada', motivo: 'Esta O.S. não está mais neste aparelho.'}); continue; }
        if (assinatura(atual) !== l.visto) {
          l.visto = assinatura(atual); l.confirmada = false;
          Object.assign(item, {estado: 'pulada', motivo: 'A O.S. mudou em outro aparelho desde que o lote a mostrou: nada foi gravado nela. Confira a linha (ela já mostra o que está gravado) e salve de novo.'});
          continue;
        }
        const grav = montarGravacao(atual, l, g, rg);
        if (grav.erro) { Object.assign(item, {estado: 'pulada', motivo: grav.erro}); continue; }
        if (nadaMudou(atual, grav)) { Object.assign(item, {estado: 'sem-mudanca', motivo: 'Nada mudou nesta O.S.'}); l.confirmada = false; continue; }
        const nova = grav.nova;
        nova.atualizadoEm = emUnico();
        nova.atualizadoPor = nomeUsuario();
        Object.assign(item, {antes: retrato(atual), depois: retrato(nova), mexeu: grav.mexeu, marcas: grav.marcas, avisos: grav.avisos.slice()});
        // Vai ao relatório ANTES de gravar: a aba que fecha no meio deixa o Desfazer alcançar esta O.S.
        await gravarRelatorios();
        const r = await gravarEsperando(S, nova, {...o, semEsperar: mudas >= 2});
        mudas = r.semResposta ? mudas + 1 : 0;
        const extra = r.estado === 'gravada' ? avisosDaResposta(r) : [];
        Object.assign(item, {estado: r.estado === 'gravada' && extra.length ? 'gravada-aviso' : r.estado, ...(r.motivo && r.estado !== 'gravada' ? {motivo: r.motivo} : {}), avisos: [...item.avisos, ...extra]});
        if (['gravada', 'na-fila'].includes(r.estado)) { l.confirmada = false; l.salvaEm = rel.em; l.visto = assinatura(S.getOS(vista.id) || nova); }
      }
    } finally {
      est.salvando = false; est.progresso = '';
      await gravarRelatorios();
      await persistir();
    }
    return rel;
  }
  const CONTA_TEXTO = {gravada: ['gravada', 'gravadas'], 'gravada-aviso': ['gravada com aviso', 'gravadas com aviso'], 'na-fila': ['na fila', 'na fila'], recusada: ['recusada', 'recusadas'],
    conflito: ['com conflito', 'com conflito'], pulada: ['não enviada', 'não enviadas'], 'sem-mudanca': ['sem mudança', 'sem mudança']};
  const ESTADO_TEXTO = {gravada: 'Gravada', 'gravada-aviso': 'Gravada, com aviso', 'na-fila': 'Na fila deste aparelho', recusada: 'Recusada', conflito: 'Conflito', pulada: 'Não enviada', 'sem-mudanca': 'Nada mudou', enviando: 'Enviando'};

  /* ─────────────────────────────── DESFAZER O LOTE ─────────────────────── */
  const desfazivel = it => !!(it && it.antes && ['gravada', 'gravada-aviso', 'na-fila', 'enviando', 'recusada'].includes(it.estado) && !(it.desfazer && ['gravada', 'gravada-aviso', 'na-fila'].includes(it.desfazer.estado)));
  /* A VOLTA DE UMA O.S.: cada campo que o lote mexeu volta ao de antes, só
     se ainda está como o lote deixou (o que outra pessoa mudou depois fica, e
     é dito). As marcas do lote são desfeitas por marca 'desfeito' (a lista é
     só de acréscimo); a divisão volta como divisão nova com o carimbo da
     gravada (ou sai, se não havia); o lançamento sai por pedido explícito. */
  function montarVolta(atual, it) {
    const a = it.antes, d = it.depois || {}, m = it.mexeu || {}, volta = copia(atual), notas = [];
    let algo = false;
    if (m.alocacao || m.pessoas) {
      const mesma = genteDe(atual.equipe) === genteDe(d.equipe) && (!m.alocacao || nucleoAloc(atual.alocacao) === nucleoAloc(d.alocacao));
      if (!mesma) notas.push('a equipe mudou depois do lote e ficou como está');
      else {
        volta.equipe = copia(a.equipe);
        if (m.alocacao) {
          if (objeto(a.alocacao)) {
            const {final: _f, por: _p, porId: _pi, porConta: _pc, em: _e, desatualizada: _d, conferirRH: _c, ...resto} = copia(a.alocacao);
            volta.alocacao = {...resto, ...(objeto(atual.alocacao) && atual.alocacao.em ? {em: atual.alocacao.em} : {})};
            if (typeof DIVISAO !== 'undefined' && !DIVISAO.validar(volta.alocacao)) volta.alocacao.final = DIVISAO.finais(volta.alocacao);
          } else volta.alocacao = null;
        }
        algo = true;
      }
    }
    if (m.chegada) {
      const ch = objeto(atual.retornoConferido) ? atual.retornoConferido : {}, dd = d.retornoConferido || {};
      if (ch.dia !== dd.dia || ch.hora !== dd.hora) notas.push('a chegada do carro mudou depois do lote e ficou como está');
      else { volta.retornoConferido = a.retornoConferido ? {dia: a.retornoConferido.dia, hora: a.retornoConferido.hora, fonte: a.retornoConferido.fonte || 'lote', em: a.retornoConferido.em || ''} : null; algo = true; }
    }
    if (m.volta) {
      const igual = PERGUNTAS().every(k => OPERACAO.respostaVolta((atual.retornoConf || {})[k]) === OPERACAO.respostaVolta((d.retornoConf || {})[k]));
      if (!igual) notas.push('a conferência da volta mudou depois do lote e ficou como está');
      else { volta.retornoConf = a.retornoConf ? copia(a.retornoConf) : {...Object.fromEntries(PERGUNTAS().map(k => [k, ''])), obs: '', fotos: []}; algo = true; }
    }
    if (m.retrabalho) {
      const igual = texto((atual.retrabalhoPerguntado || {}).em) === texto((d.retrabalhoPerguntado || {}).em) && !!atual.retrabalho === !!d.retrabalho;
      if (!igual) notas.push('o retrabalho mudou depois do lote e ficou como está');
      else {
        for (const k of CAMPOS_RETRAB) volta[k] = a[k] === undefined ? null : copia(a[k]);
        if (objeto(volta.checkout) && (volta.checkout.situacao === 'Retrabalho' || a.checkoutSituacao === 'Retrabalho')) volta.checkout = {...volta.checkout, situacao: a.checkoutSituacao};
        algo = true;
      }
    }
    if (m.lancamento) {
      const el = objeto(atual.entregaLancada) ? atual.entregaLancada : null;
      if (!el || el.data !== (d.entregaLancada || {}).data) notas.push('o lançamento mudou depois do lote e ficou como está');
      else { volta.entregaLancada = a.entregaLancada ? {data: a.entregaLancada.data} : {desfazer: true}; algo = true; }
    }
    if (lista(it.marcas).length && temMotor()) {
      volta.itens = lista(atual.itens).map(x => objeto(x) ? {...x, ...(Array.isArray(x.entregas) ? {entregas: x.entregas.slice()} : {})} : x);
      for (const mk of lista(it.marcas)) {
        const indice = volta.itens.findIndex(x => objeto(x) && lista(x.entregas).some(e => texto(e && e.id) === mk.id));
        if (indice < 0) { notas.push('uma marca do lote não está mais nesta O.S.'); continue; }
        const alvoItem = volta.itens[indice];
        if (!ENTREGA_ITEM.eventosAtivos(alvoItem).some(e => texto(e.id) === mk.id)) continue;
        const v = ENTREGA_ITEM.validarEvento({id: novoId('lt'), tipo: 'desfeito', alvo: mk.id, motivo: 'Desfeito pelo Desfazer do lote (Fechar o dia).', dia: hoje(), via: 'lote', por: nomeUsuario(), em: agoraISO()}, alvoItem, {papel: papel(), os: volta, hoje: hoje()});
        if (!v.ok) { notas.push(`uma marca do item ${texto(alvoItem.descricao || alvoItem.item) || ''} não foi desfeita: ${v.erro}`); continue; }
        alvoItem.entregas = lista(alvoItem.entregas).concat(v.evento);
        algo = true;
      }
    }
    return {volta, algo, notas};
  }
  async function desfazer(relId, o = {}) {
    const S = loja(o);
    if (!gestao()) return {erro: SO_GESTAO};
    await carregarRelatorios();
    const rel = est.relatorios.find(x => x && x.id === relId) || null;
    if (!rel) return {erro: 'Este lote não está mais guardado neste aparelho.'};
    const alvo = lista(rel.itens).filter(desfazivel).reverse();
    if (!alvo.length) return {erro: 'Nada a desfazer neste lote.'};
    ouvir(S);
    est.salvando = true;
    let mudas = 0;
    try {
      for (const it of alvo) {
        if (it.estado === 'conflito') continue;
        const atual = typeof S.getOS === 'function' ? S.getOS(it.id) : null;
        if (!atual) { it.desfazer = {estado: 'pulada', motivo: 'A O.S. não está mais neste aparelho.', em: agoraISO()}; continue; }
        const {volta, algo, notas} = montarVolta(atual, it);
        if (!algo) { it.desfazer = {estado: 'pulada', motivo: 'Nada a desfazer: ' + (notas.join('; ') || 'a O.S. já está como antes') + '.', em: agoraISO()}; continue; }
        volta.atualizadoEm = emUnico();
        volta.atualizadoPor = nomeUsuario();
        const r = await gravarEsperando(S, volta, {...o, semEsperar: mudas >= 2});
        mudas = r.semResposta ? mudas + 1 : 0;
        it.desfazer = {estado: r.estado, ...(r.motivo ? {motivo: r.motivo} : {}), ...(notas.length ? {notas} : {}), em: agoraISO()};
        const l = est.rascunho && est.rascunho.linhas[it.id];
        if (l) { l.visto = assinatura(S.getOS(it.id) || volta); delete l.salvaEm; }
        await gravarRelatorios();
      }
    } finally {
      est.salvando = false;
      await gravarRelatorios();
      await persistir();
    }
    return rel;
  }

  /* ─────────────────────────────── AÇÕES DA TELA ───────────────────────── */
  function achar(osId) {
    const S = loja();
    const todas = S && typeof S.getAllOS === 'function' ? S.getAllOS() : [];
    for (const g of gruposDe(osDaTela(todas).os)) {
      const o = g.os.find(x => x.id === osId);
      if (o) return {o, g, rg: grupoDe(g), l: linhaDe(o, g)};
    }
    return null;
  }
  function acharGrupo(chave) {
    const S = loja();
    const g = gruposDe(osDaTela(S && typeof S.getAllOS === 'function' ? S.getAllOS() : []).os).find(x => x.chave === chave);
    return g ? {g, rg: grupoDe(g)} : null;
  }
  // Uma linha só confirma sem falta que trave; confirmar confere também a equipe da volta.
  function confirmarLinha(x) {
    const f = faltasDaLinha(x.o, x.l, x.g, x.rg);
    if (f.trava.length) return 'Falta: ' + f.trava.join(', ') + '.';
    x.l.confirmada = true;
    if (!x.rg.equipeConfirmada) { iniciarEquipe(x.g, x.rg, false); guardarEquipeNoRascunho(x.g, x.rg); }
    return '';
  }
  /* UMA AÇÃO: o nome é o de data-lote-acao. Devolve '' ou o motivo (a tela
     mostra). Toda mudança vai para o rascunho no IndexedDB. */
  function executar(ds = {}) {
    if (!gestao()) return SO_GESTAO;
    if (!est.rascunho) return 'O lote não está aberto.';
    const acao = ds.acao;
    let erro = '';
    const x = ds.os ? achar(ds.os) : null;
    const gx = ds.grupo ? acharGrupo(ds.grupo) : null;
    const precisa = () => { if (!x) erro = 'Esta O.S. não está mais no lote.'; return !!x; };
    switch (acao) {
      case 'data': if (precisa()) { x.l.data = String(ds.valor || ''); if (!diaOk(x.l.data)) x.l.confirmada = false; } break;
      case 'retrabalho-nao':
        if (!precisa()) break;
        // Desmarcar o retrabalho gravado é decisão: pergunta, como o perguntarRetrabalho.
        if (marcadaRetrabalho(x.o) && !confirmar('Esta O.S. está marcada como retrabalho. Responder Não desmarca o retrabalho. Continuar?')) { erro = 'Nada mudou: a O.S. continua marcada como retrabalho.'; break; }
        x.l.retrabalho = {resposta: 'nao', em: agoraISO(), por: nomeUsuario()};
        break;
      case 'retrabalho-resposta': if (precisa()) { const r = ds.resposta; if (objeto(r) && (r.resposta === 'sim' || r.resposta === 'nao')) x.l.retrabalho = copia(r); else erro = 'Resposta do retrabalho inválida.'; } break;
      case 'entrega-todos': if (precisa()) { x.l.entrega = x.l.entrega === 'todos' && aberta(x.o) ? '' : 'todos'; if (!x.l.entrega) x.l.confirmada = false; } break;
      case 'itens': if (precisa()) est.itensAberto = est.itensAberto === x.o.id ? '' : x.o.id; break;
      case 'parte':
        if (!precisa()) break;
        if (!aberta(x.o)) { erro = 'O.S. finalizada: a entrega de cada item já conta pela finalização. Para marcar só uma parte, reabra a O.S. pela ficha.'; break; }
        x.l.parte = {...(x.l.parte || {}), [String(ds.uid)]: Math.max(0, Math.floor(Number(ds.valor) || 0))};
        x.l.entrega = 'parte';
        break;
      case 'conferir': if (precisa()) x.l.conferir = !x.l.conferir; break;
      case 'confirmar': if (precisa()) erro = confirmarLinha(x); break;
      case 'desconfirmar': if (precisa()) x.l.confirmada = false; break;
      case 'foco': if (precisa()) est.foco = x.o.id; break;
      case 'equipe-ok': if (!gx) erro = 'Esta volta não está mais no lote.'; else { iniciarEquipe(gx.g, gx.rg, false); guardarEquipeNoRascunho(gx.g, gx.rg); } break;
      case 'equipe-mudar': if (!gx) erro = 'Esta volta não está mais no lote.'; else est.alocAberto = est.alocAberto === gx.g.chave ? '' : gx.g.chave; break;
      case 'equipe-refazer': if (!gx) erro = 'Esta volta não está mais no lote.'; else { gx.rg.aloc = null; gx.rg.pessoas = null; gx.rg.equipeConfirmada = false; iniciarEquipe(gx.g, gx.rg, true); } break;
      case 'chegada':
        if (!gx) { erro = 'Esta volta não está mais no lote.'; break; }
        if (ds.valor && !horaOk(ds.valor)) { erro = 'Hora inválida: use HH:MM.'; break; }
        gx.rg.chegada = String(ds.valor || '');
        break;
      case 'volta':
        if (!gx) { erro = 'Esta volta não está mais no lote.'; break; }
        if (!PERGUNTAS().includes(ds.k)) { erro = 'Pergunta desconhecida.'; break; }
        gx.rg.volta[ds.k] = ds.v === 'sim' || ds.v === 'nao' ? ds.v : '';
        break;
      case 'volta-obs': if (!gx) erro = 'Esta volta não está mais no lote.'; else gx.rg.volta.obs = String(ds.valor || '').slice(0, 300); break;
      // Só a tela: a conferência já feita aparece resumida até alguém pedir para rever.
      case 'volta-rever': if (!gx) erro = 'Esta volta não está mais no lote.'; else if (est.voltaAbertas.has(gx.g.chave)) est.voltaAbertas.delete(gx.g.chave); else est.voltaAbertas.add(gx.g.chave); break;
      default: erro = 'Ação desconhecida.';
    }
    persistir();
    return erro;
  }

  /* ─────────────────────────────── ABRIR ───────────────────────────────── */
  async function abrir(o = {}) {
    if (o.modo === 'dia' || o.modo === 'pendencias') est.modo = o.modo;
    if (o.dia && diaOk(o.dia)) est.dia = o.dia;
    if (o.mes && /^\d{4}-\d{2}$/.test(o.mes)) est.mes = o.mes;
    if (!est.dia) est.dia = hoje();
    if (!est.mes) est.mes = hoje().slice(0, 7);
    const k = chaveRascunho(est.modo, chaveAtual());
    if (est.carregado !== k || o.recarregar) {
      est.carregando = true;
      const guardado = await lerGuardado(k);
      est.rascunho = objeto(guardado) && guardado.versao === VERSAO ? {...rascunhoVazio(est.modo, chaveAtual()), ...guardado, linhas: objeto(guardado.linhas) ? guardado.linhas : {}, grupos: objeto(guardado.grupos) ? guardado.grupos : {}} : rascunhoVazio(est.modo, chaveAtual());
      est.carregado = k; est.carregando = false;
      est.erroRascunho = avisoBase(true);
      est.itensAberto = ''; est.alocAberto = '';
      // A divisão de cada volta parte do rascunho (reabrir não volta à sugestão).
      const S = loja();
      for (const g of gruposDe(osDaTela(S && typeof S.getAllOS === 'function' ? S.getAllOS() : []).os)) iniciarEquipe(g, grupoDe(g), true);
    }
    await carregarRelatorios();
    return est.rascunho;
  }

  /* ─────────────────────────────── ATALHOS ─────────────────────────────── */
  const ehCampo = t => !!t && (['INPUT', 'SELECT', 'TEXTAREA'].includes(String(t.tagName || '').toUpperCase()) || t.isContentEditable === true || (typeof t.getAttribute === 'function' && t.getAttribute('role') === 'textbox'));
  const telaAtiva = () => typeof STATE !== 'undefined' && STATE._entAba === 'lote' && (!STATE.activeTab || STATE.activeTab === 'entregas');
  const temDialogo = () => typeof document !== 'undefined' && !!(document.getElementById && (document.getElementById('retrab-pergunta') || document.getElementById('lancar-box'))) ;
  /* SETAS ENTRE AS LINHAS, ENTER CONFIRMA A LINHA EM FOCO, CTRL+ENTER SALVA.
     Dentro de campo (data, hora, observação, busca do componente) nenhuma
     tecla simples dispara: a seta mexe no campo e o Enter é do campo. Só o
     Ctrl+Enter (ou Cmd+Enter) salva de qualquer lugar. Com a pergunta do
     retrabalho aberta, nada dispara. Devolve o que fez ('' = nada). */
  function teclado(ev) {
    if (!ev || !telaAtiva() || temDialogo() || !est.rascunho) return '';
    const t = ev.target;
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      void salvarPelaTela();
      return 'salvar';
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ehCampo(t)) return '';
    const ids = idsVisiveis();
    if (!ids.length) return '';
    const linhaEl = t && typeof t.closest === 'function' ? t.closest('[data-lote-linha]') : null;
    const atual = (linhaEl && linhaEl.getAttribute('data-lote-linha')) || est.foco || '';
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const i = ids.indexOf(atual);
      const j = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)));
      est.foco = ids[j];
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      focarLinha(est.foco);
      return 'foco';
    }
    // Enter só na própria linha: no botão, o Enter é do botão.
    if (ev.key === 'Enter' && linhaEl && linhaEl === t) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      const x = achar(atual);
      if (!x) return '';
      const erro = confirmarLinha(x);
      persistir();
      if (erro) { if (typeof toast === 'function') toast(erro, 'error'); return 'falta'; }
      const i = ids.indexOf(atual);
      est.foco = ids[Math.min(ids.length - 1, i + 1)] || atual;
      render();
      focarLinha(est.foco);
      return 'confirmar';
    }
    return '';
  }
  function idsVisiveis() {
    const S = loja();
    return gruposDe(osDaTela(S && typeof S.getAllOS === 'function' ? S.getAllOS() : []).os).flatMap(g => g.os.map(o => o.id));
  }
  function focarLinha(id) {
    if (typeof document === 'undefined' || !document.querySelector || !id) return;
    const el = document.querySelector(`[data-lote-linha="${String(id).replace(/"/g, '')}"]`);
    if (el && typeof el.focus === 'function') { try { el.focus({preventScroll: false}); } catch (e) { el.focus(); } if (typeof el.scrollIntoView === 'function') try { el.scrollIntoView({block: 'nearest'}); } catch (e) { /* sem rolagem */ } }
  }

  /* ─────────────────────────────── A TELA ──────────────────────────────── */
  const INTRO = 'impresilk_lote_intro_visto';
  const introVista = () => { try { return localStorage.getItem(INTRO + '|' + usuario()) === '1'; } catch (e) { return false; } };
  function introHTML() {
    const aberto = !introVista();
    return `<details class="lote-intro" ${aberto ? 'open' : ''}>
      <summary>${aberto ? 'Primeiro uso: leia antes de lançar' : 'Como funciona e o que o lote ainda não faz'}</summary>
      <div class="lote-intro-corpo">
        <p><strong>O primeiro uso é acompanhado.</strong> Feche primeiro UMA volta real, junto com quem lança (o Thiago), e confira no card de cada O.S. e no histórico da ficha o que ficou gravado. Só depois aplique às pendências do mês inteiro.</p>
        <ul>
          <li>Cada grupo é uma volta: dia, carro e equipe. Confirme a equipe (a divisão vale para todas as O.S. da volta), a hora em que o carro chegou e a conferência da volta.</li>
          <li>Cada linha é uma O.S.: a data vem preenchida; responda o retrabalho (Não num toque, Sim abre a pergunta completa); diga se todos os itens foram entregues ou marque a parte; confira o que a equipe declarou pelo celular; e confirme a linha (✓ ou Enter).</li>
          <li>Salvar grava só as linhas confirmadas, uma O.S. por vez, e mostra o resultado de cada uma. O lote inteiro tem Desfazer.</li>
          <li>No computador: setas entre as linhas, Enter confirma a linha em foco, Ctrl+Enter salva. Dentro de um campo, só o Ctrl+Enter vale.</li>
          <li>O rascunho fica guardado neste navegador (por modo e dia) e volta ao reabrir a tela. Sair do app apaga o rascunho.</li>
        </ul>
        <p><strong>O que o lote ainda não faz:</strong> não finaliza O.S. aberta (a finalização segue na ficha, com fotos e retorno, ou na baixa do ERP); não marca parte de O.S. já finalizada (reabra pela ficha); a baixa cancelada no ERP fica fora do lote; a baixa do ERP lançada aqui continua sem prova (sem foto nem retorno), e a tela diz isso.</p>
        ${aberto ? '<button type="button" class="btn-primary btn-sm" data-lote-acao="entendi">Entendi</button>' : ''}
      </div>
    </details>`;
  }
  const seloOrigem = o => {
    if (aberta(o)) return '<span class="lote-selo aberta">Aberta no PCP</span>';
    if (baixaERP(o)) return `<span class="lote-selo erp">Baixa do ERP${semProva(o) ? ' · sem prova' : ''}${o.entregaLancada ? ' · lançada' : ' · a lançar'}</span>`;
    if (temMotor()) { const imp = ENTREGA_ITEM.entregaImplicita(o); if (imp && imp.declarado) return '<span class="lote-selo decl">Finalizada pelo celular · declarada</span>'; if (imp && imp.conferido) return '<span class="lote-selo ok">Finalizada pelo celular · conferida</span>'; }
    return '<span class="lote-selo ok">Finalizada no PCP</span>';
  };
  function saldoItensHTML(o, resumido) {
    const xs = itensDe(o).filter(x => !x.servico);
    if (!xs.length) return resumido ? '' : '<p class="lote-itens-vazio">Esta O.S. não tem itens cadastrados.</p>';
    const linha = x => {
      const s = x.s, partes = [];
      if (s.entregue - s.declarado > 0) partes.push(`${s.entregue - s.declarado} marcad${s.entregue - s.declarado === 1 ? 'o' : 'os'}`);
      if (s.declarado > 0) partes.push(`${s.declarado} declarad${s.declarado === 1 ? 'o' : 'os'} pela equipe`);
      if (s.implicito > 0) partes.push(`${s.implicito} ${s.marca === 'sem prova' ? 'sem prova (baixa do ERP)' : 'pela finalização'}`);
      if (s.saldo > 0) partes.push(`saldo ${s.saldo}`);
      if (s.situacao === 'problema') partes.push('com problema');
      if (s.situacao === 'cancelado') partes.push('cancelado');
      return `<li><span class="lote-item-nome">${escL(texto(x.it.descricao || x.it.item) || 'Item')}</span> <small>${escL(String(s.qtde))}${s.qtde > 1 ? ' un.' : ''}: ${escL(partes.join(', ') || s.rotulo || s.situacao)}</small></li>`;
    };
    return `<ul class="lote-saldo${resumido ? ' resumido' : ''}">${xs.slice(0, resumido ? 4 : xs.length).map(linha).join('')}${resumido && xs.length > 4 ? `<li><small>e mais ${xs.length - 4}</small></li>` : ''}</ul>`;
  }
  function itensHTML(o, l) {
    const xs = itensDe(o);
    if (!aberta(o)) return `<div class="lote-itens"><p class="lote-itens-dica">O.S. finalizada: cada item já conta pela finalização${baixaERP(o) ? ' (baixa do ERP, sem prova)' : ''}. Para marcar só uma parte, reabra a O.S. pela ficha.</p>${saldoItensHTML(o, false)}</div>`;
    const fis = xs.filter(x => !x.servico);
    if (!fis.length) return '<div class="lote-itens"><p class="lote-itens-vazio">Esta O.S. não tem itens para marcar.</p></div>';
    const campo = x => {
      const k = x.uid || ('i' + x.indice), v = Number((l.parte || {})[k]) || 0;
      if (x.s.saldo <= 0 || x.s.situacao === 'cancelado') return `<span class="lote-item-feito">${escL(x.s.rotulo || x.s.situacao)}</span>`;
      if (x.s.problema) return '<span class="lote-item-feito">com problema: saldo segurado</span>';
      if (x.parte) return `<label class="lote-item-q">Entregue agora <input type="number" min="0" max="${x.s.saldo}" step="1" inputmode="numeric" value="${v || ''}" data-lote-campo="parte" data-os="${escL(o.id)}" data-uid="${escL(k)}" data-lote-k="parte:${escL(o.id)}:${escL(k)}"> de ${x.s.saldo}</label>`;
      return `<label class="lote-item-q"><input type="checkbox" ${v > 0 ? 'checked' : ''} data-lote-campo="parte-um" data-os="${escL(o.id)}" data-uid="${escL(k)}" data-saldo="${x.s.saldo}" data-lote-k="parte:${escL(o.id)}:${escL(k)}"> entregue</label>`;
    };
    return `<div class="lote-itens"><p class="lote-itens-dica">Marque o que foi entregue agora. O que ficar sem marca continua a entregar, e a O.S. segue aberta (entrega parcial). A marca vai pelo motor da entrega por item, como lote.</p>
      <ul class="lote-parte">${fis.map(x => `<li><span class="lote-item-nome">${escL(texto(x.it.descricao || x.it.item) || 'Item')}</span> <small>${escL(x.s.rotulo)}</small> ${campo(x)}</li>`).join('')}</ul></div>`;
  }
  function linhaHTML(o, g, rg, ultimo) {
    const l = linhaDe(o, g);
    const f = faltasDaLinha(o, l, g, rg);
    const resp = respostaDaLinha(o, l);
    const decl = declaracoesDe(o);
    const r = ultimo ? ultimo.itens.find(i => i.id === o.id) : null;
    const v = typeof valorDaOS === 'function' ? valorDaOS(o) : o.valorTotal;
    const valor = v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && typeof dinheiroCasa === 'function' ? dinheiroCasa(Number(v)) : '';
    const entregaBtn = aberta(o)
      ? `<button type="button" class="lote-b ${l.entrega === 'todos' ? 'on' : ''}" aria-pressed="${l.entrega === 'todos'}" data-lote-acao="entrega-todos" data-os="${escL(o.id)}" data-lote-k="todos:${escL(o.id)}">✓ Todos os itens entregues</button>`
      : `<span class="lote-b on estatico" title="A O.S. já está encerrada: cada item conta pela finalização">✓ Todos os itens entregues</span>`;
    const retrab = `<div class="lote-retrab" role="group" aria-label="Gerou retrabalho?"><span>Retrabalho?</span>
        <button type="button" class="lote-b ${resp === 'nao' ? 'on' : ''}" aria-pressed="${resp === 'nao'}" data-lote-acao="retrabalho-nao" data-os="${escL(o.id)}" data-lote-k="nao:${escL(o.id)}">Não</button>
        <button type="button" class="lote-b sim ${resp === 'sim' ? 'on' : ''}" aria-pressed="${resp === 'sim'}" data-lote-acao="retrabalho-sim" data-os="${escL(o.id)}" data-lote-k="sim:${escL(o.id)}">Sim…</button></div>`;
    const declHTML = decl.length ? `<div class="lote-decl"><span>📝 A equipe declarou pelo celular: ${escL(decl.map(d => d.tipo === 'finalizacao' ? 'a finalização' : `${d.qtde} ${d.tipo === 'retirado' ? 'retirado' : 'entregue'}${d.qtde === 1 ? '' : 's'}`).join(', '))}${decl[0].por ? ` (${escL(decl[0].por)})` : ''}.</span>
        <button type="button" class="lote-b ${l.conferir ? 'on' : ''}" aria-pressed="${l.conferir}" data-lote-acao="conferir" data-os="${escL(o.id)}" data-lote-k="conf:${escL(o.id)}">${l.conferir ? '✓ Conferido' : 'Conferir o declarado'}</button></div>` : '';
    const resultado = r ? `<p class="lote-res st-${escL(r.estado)}">${escL(ESTADO_TEXTO[r.estado] || r.estado)}${r.motivo ? ': ' + escL(r.motivo) : ''}${lista(r.avisos).length ? ' · ' + escL(r.avisos.join(' ')) : ''}${r.desfazer ? ` · Desfazer: ${escL(ESTADO_TEXTO[r.desfazer.estado] || r.desfazer.estado)}${r.desfazer.motivo ? ' (' + escL(r.desfazer.motivo) + ')' : ''}` : ''}</p>` : '';
    return `<div class="lote-linha${l.confirmada ? ' confirmada' : ''}${f.trava.length ? ' com-falta' : ''}${est.foco === o.id ? ' em-foco' : ''}" data-lote-linha="${escL(o.id)}" tabindex="0" aria-label="O.S. ${escL(o.numero || '')}, ${escL(o.cliente || '')}${l.confirmada ? ', confirmada' : ''}">
      <div class="lote-l-os"><button type="button" class="inline-link" data-lote-acao="ficha" data-os="${escL(o.id)}"><strong>O.S ${escL(o.numero || '—')}</strong></button> <span class="lote-l-cli">${escL(o.cliente || '')}</span>
        <small>${escL(o.servico || '')}${valor ? ' · ' + escL(valor) : ''}</small> ${seloOrigem(o)}</div>
      <label class="lote-l-data">Entrega <input type="date" value="${escL(l.data)}" max="${escL(hoje())}" data-lote-campo="data" data-os="${escL(o.id)}" data-lote-k="data:${escL(o.id)}"></label>
      ${retrab}
      <div class="lote-l-entrega">${entregaBtn}<button type="button" class="lote-b" aria-expanded="${est.itensAberto === o.id}" data-lote-acao="itens" data-os="${escL(o.id)}" data-lote-k="itens:${escL(o.id)}">${aberta(o) ? 'Marcar a parte' : 'Ver os itens'}</button></div>
      ${declHTML}
      ${baixaERP(o) ? saldoItensHTML(o, true) : ''}
      <p class="lote-faltas">${f.trava.length ? `<span class="trava">Falta: ${escL(f.trava.join(', '))}.</span> ` : ''}${f.nota.length ? `<span class="nota">Ainda: ${escL(f.nota.join(', '))}.</span>` : ''}${!f.trava.length && !f.nota.length ? '<span class="nota">Tudo preenchido.</span>' : ''}</p>
      <div class="lote-l-acoes">${l.confirmada
        ? `<span class="lote-ok">✓ Confirmada</span><button type="button" class="btn-ghost btn-sm" data-lote-acao="desconfirmar" data-os="${escL(o.id)}">Desfazer a confirmação</button>`
        : `<button type="button" class="btn-primary btn-sm lote-confirmar" data-lote-acao="confirmar" data-os="${escL(o.id)}" data-lote-k="ok:${escL(o.id)}" ${f.trava.length ? 'aria-disabled="true"' : ''}>✓ Confirmar a linha</button>`}${l.salvaEm && !l.confirmada ? `<small class="lote-salva">salva no lote de ${escL(new Date(l.salvaEm).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}))}</small>` : ''}</div>
      ${est.itensAberto === o.id ? itensHTML(o, l) : ''}
      ${resultado}
    </div>`;
  }
  function equipeResumoHTML(g, rg) {
    const st = iniciarEquipe(g, rg, false);
    if (!st) return `<span>${escL(g.equipe.join(', ') || 'sem equipe')}</span>`;
    const nome = id => OPERACAO.nomePessoa(id);
    const grupos = lista(st.aloc && st.aloc.grupos);
    const eqNome = gr => { const e = gr.equipeId != null ? (typeof equipesCadastradasCasa === 'function' ? equipesCadastradasCasa() : []).find(x => x && x.id === gr.equipeId) : null; return e ? String(e.nome || e.id) : ''; };
    const pct = c => String((Number(c) || 0) / 100).replace('.', ',') + '%';
    const partes = st.modo === 'pessoas'
      ? ALOCUI.paraEquipe(chaveAloc(g)).equipe.map(p => escL(OPERACAO.nomePessoa(p)))
      : grupos.map(gr => `${eqNome(gr) ? `<strong>${escL(eqNome(gr))}</strong>${grupos.length > 1 ? ' ' + pct(gr.cota) : ''}: ` : ''}${lista(gr.membros).map(m => `${escL(nome(m.pessoaId))}${m.pessoaId === gr.liderId ? ' (líder)' : ''} ${pct(m.cota)}`).join(', ')}`);
    const origem = rg.equipeConfirmada ? '<span class="lote-selo ok">conferida</span>' : st.origem === 'gravada' ? '<span class="lote-selo ok">divisão gravada</span>' : partes.length ? '<span class="lote-selo sug">sugerida</span>' : '';
    return `${partes.length ? partes.join(' · ') : '<span class="lote-sem-equipe">Sem equipe: traga a equipe em "Mudar a equipe".</span>'} ${origem}`;
  }
  function grupoHTML(g, rg, ultimo) {
    const conf = rg.volta;
    const seg = k => `<div class="lote-volta-q"><span>${escL(CURTO[k])}</span><span class="seg" role="group" aria-label="${escL(CURTO[k])}">${[['sim', 'Sim'], ['nao', 'Não'], ['', '—']].map(([v, r]) => `<button type="button" ${v ? '' : 'title="Não conferido" aria-label="Não conferido"'} class="${(conf[k] || '') === v ? 'active' : ''}" aria-pressed="${(conf[k] || '') === v}" data-lote-acao="volta" data-grupo="${escL(g.chave)}" data-k="${k}" data-v="${v}" data-lote-k="volta:${escL(g.chave)}:${k}:${v}">${r}</button>`).join('')}</span></div>`;
    const prev = g.os.map(o => OPERACAO.retornoPrevistoDoDia(o, g.dia)).filter(Boolean).map(e => e.hora).sort().pop() || '';
    const disse = g.os.map(o => texto(o.horaRetorno)).filter(Boolean).sort().pop() || '';
    const declVolta = g.os.map(o => o.voltaEquipe).find(v => OPERACAO.voltaRespondida(v));
    // As O.S. da volta com respostas diferentes: mexer na conferência põe a mesma em todas (como a fila da volta do carro).
    const assinaturaVolta = o => PERGUNTAS().map(k => OPERACAO.respostaVolta((o.retornoConf || {})[k])).join(',');
    const divergem = g.os.length > 1 && new Set(g.os.map(assinaturaVolta)).size > 1;
    /* A VOLTA JÁ CONFERIDA (todas as O.S. com a mesma resposta, e ninguém
       mexeu) aparece resumida numa linha: nas pendências do mês são dezenas
       de voltas, e as quatro perguntas abertas em cada uma escondiam as O.S. */
    const compacta = !divergem && OPERACAO.voltaConferidaParaNota(conf) && !voltaMexida(rg) && !est.voltaAbertas.has(g.chave);
    const quemConferiu = (g.os.find(o => OPERACAO.voltaRespondida(o.retornoConf)) || {}).retornoConf || {};
    const selo = k => { const r = OPERACAO.respostaVolta(conf[k]); return `<span class="volta-resp ${r === 'sim' ? 'ok' : r === 'nao' ? 'ruim' : ''}">${r === 'sim' ? '✓' : r === 'nao' ? '✗' : '·'} ${escL(CURTO[k].toLowerCase())}</span>`; };
    const alocAberto = est.alocAberto === g.chave;
    return `<section class="lote-grupo" data-lote-grupo="${escL(g.chave)}">
      <header class="lote-g-head"><strong>${escL(dataBR(g.dia))}</strong> <span>🚗 ${escL(g.semCarro ? 'sem carro (instalação interna)' : (g.veiculo || 'carro não informado'))}</span> <span>👷 ${escL(g.equipe.join(', ') || 'sem equipe na O.S.')}</span> <span class="lote-g-n">${g.os.length} O.S.</span></header>
      <div class="lote-g-equipe"><span class="lote-g-rot">Equipe</span><div class="lote-g-eq-txt">${equipeResumoHTML(g, rg)}</div>
        <div class="lote-g-eq-acoes"><button type="button" class="lote-b ${rg.equipeConfirmada ? 'on' : ''}" aria-pressed="${rg.equipeConfirmada}" data-lote-acao="equipe-ok" data-grupo="${escL(g.chave)}" data-lote-k="eqok:${escL(g.chave)}">✓ Equipe certa</button>
        <button type="button" class="lote-b" aria-expanded="${alocAberto}" data-lote-acao="equipe-mudar" data-grupo="${escL(g.chave)}" data-lote-k="eqmudar:${escL(g.chave)}">${alocAberto ? 'Fechar' : 'Mudar a equipe'}</button></div></div>
      ${alocAberto ? `<div class="lote-aloc aloc-host" data-lote-aloc="${escL(g.chave)}"></div>` : ''}
      ${g.semCarro ? '' : `<div class="lote-g-chegada"><label>Chegada do carro (conferida) <input type="time" value="${escL(rg.chegada || '')}" data-lote-campo="chegada" data-grupo="${escL(g.chave)}" data-lote-k="chegada:${escL(g.chave)}"></label>
        <small>${prev ? `retorno previsto ${escL(prev)}` : 'sem retorno previsto'}${disse ? ` · a equipe anotou ${escL(disse)}` : ''}</small></div>
      ${compacta ? `<div class="lote-g-volta compacta"><span class="lote-g-rot">Conferência da volta</span><span class="lote-volta-resumo">${PERGUNTAS().map(selo).join(' ')}${conf.obs ? ` <span class="volta-obs">“${escL(conf.obs)}”</span>` : ''}${quemConferiu.por ? ` <small>por ${escL(quemConferiu.por)}</small>` : ''}</span><button type="button" class="lote-b" data-lote-acao="volta-rever" data-grupo="${escL(g.chave)}" data-lote-k="rever:${escL(g.chave)}">Rever</button></div>` : `<div class="lote-g-volta"><span class="lote-g-rot">Conferência da volta</span>${PERGUNTAS().map(seg).join('')}
        <label class="lote-volta-obs">O que faltou ou precisa de atenção <input maxlength="300" value="${escL(conf.obs || '')}" data-lote-campo="volta-obs" data-grupo="${escL(g.chave)}" data-lote-k="obs:${escL(g.chave)}" placeholder="ex.: faltou a escada de 6 m"></label>
        ${declVolta && typeof voltaEquipeHTML === 'function' ? voltaEquipeHTML(declVolta, {fotos: false}) : ''}
        ${divergem ? '<p class="lote-aviso" role="note">As O.S. desta volta têm respostas diferentes (ou só parte foi conferida). Mexer na conferência põe a mesma resposta em todas.</p>' : ''}
        <p class="lote-dica">Vale para todas as O.S. da volta. Em branco não conta como OK. Avaria não entra na nota.</p></div>`}`}
      <div class="lote-linhas">${g.os.map(o => linhaHTML(o, g, rg, ultimo)).join('')}</div>
    </section>`;
  }
  function relatorioHTML() {
    const rel = est.relatorios[0];
    if (!rel) return '';
    const n = e => rel.itens.filter(i => i.estado === e).length;
    const conta = ['gravada', 'gravada-aviso', 'na-fila', 'recusada', 'conflito', 'pulada', 'sem-mudanca'].map(e => n(e) ? `${n(e)} ${CONTA_TEXTO[e][n(e) === 1 ? 0 : 1]}` : '').filter(Boolean).join(' · ');
    const pode = rel.itens.some(desfazivel);
    const quando = new Date(rel.em).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
    return `<section class="lote-rel" aria-label="Último lote salvo">
      <p><strong>Último lote (${escL(quando)}):</strong> ${escL(conta || 'nenhuma linha')}.</p>
      <ul>${rel.itens.map(i => `<li class="st-${escL(i.estado)}"><strong>O.S ${escL(i.numero || '')}</strong> ${escL(i.cliente || '')}: ${escL(ESTADO_TEXTO[i.estado] || i.estado)}${i.motivo ? '. ' + escL(i.motivo) : ''}${lista(i.avisos).length ? ' ' + escL(i.avisos.join(' ')) : ''}${i.desfazer ? ` · Desfazer: ${escL(ESTADO_TEXTO[i.desfazer.estado] || i.desfazer.estado)}${i.desfazer.motivo ? ' (' + escL(i.desfazer.motivo) + ')' : ''}` : ''}</li>`).join('')}</ul>
      ${pode ? `<button type="button" class="btn-ghost" data-lote-acao="desfazer-lote" data-rel="${escL(rel.id)}" ${est.salvando ? 'disabled' : ''}>↩ Desfazer este lote</button>` : ''}
    </section>`;
  }
  function render() {
    const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('panel-entregas') : null;
    if (!el) return;
    if (!gestao()) { el.innerHTML = `<div class="casa-pagina">${typeof abasEntregasHTML === 'function' ? abasEntregasHTML('lote') : ''}<p class="text-muted">${escL(SO_GESTAO)}</p></div>`; if (typeof wireAbasEntregas === 'function') wireAbasEntregas(el); return; }
    if (!est.rascunho || est.carregado !== chaveRascunho(est.modo, chaveAtual())) {
      el.innerHTML = `<div class="casa-pagina">${typeof abasEntregasHTML === 'function' ? abasEntregasHTML('lote') : ''}<p class="text-muted">Abrindo o lote…</p></div>`;
      if (typeof wireAbasEntregas === 'function') wireAbasEntregas(el);
      abrir({modo: STATE._loteModo || est.modo}).then(() => { if (telaAtiva()) render(); });
      return;
    }
    const S = loja();
    const todas = S && typeof S.getAllOS === 'function' ? S.getAllOS() : [];
    const {os, canceladas} = osDaTela(todas);
    const grupos = gruposDe(os);
    const ultimo = est.relatorios[0] && est.relatorios[0].modo === est.modo && est.relatorios[0].chave === chaveAtual() ? est.relatorios[0] : null;
    let nLinhas = 0, nConf = 0, nFalta = 0;
    for (const g of grupos) { const rg = grupoDe(g); for (const o of g.os) { nLinhas++; const l = linhaDe(o, g); if (l.confirmada) nConf++; else if (faltasDaLinha(o, l, g, rg).trava.length) nFalta++; } }
    const ativa = focoAtual();
    const mesAnterior = (() => { const [a, m] = est.mes.split('-').map(Number); const d = new Date(Date.UTC(a, m - 2, 1)); return d.toISOString().slice(0, 7); })();
    const nPend = est.modo === 'pendencias' ? {aLancar: os.filter(baixaERP).length, semDiv: os.filter(o => !baixaERP(o)).length} : null;
    const cabeca = est.modo === 'dia'
      ? `<label class="lote-quando">Dia <input type="date" value="${escL(est.dia)}" max="${escL(hoje())}" data-lote-campo="dia" data-lote-k="dia"></label>
         <button type="button" class="btn-ghost btn-sm" data-lote-acao="ir-dia" data-dia="${escL(hoje())}">Hoje</button>
         <button type="button" class="btn-ghost btn-sm" data-lote-acao="ir-dia" data-dia="${escL(OPERACAO.somarDias(hoje(), -1))}">Ontem</button>`
      : `<label class="lote-quando">Mês <input type="month" value="${escL(est.mes)}" max="${escL(hoje().slice(0, 7))}" data-lote-campo="mes" data-lote-k="mes"></label>
         <button type="button" class="btn-ghost btn-sm ${est.mes === hoje().slice(0, 7) ? 'active' : ''}" data-lote-acao="ir-mes" data-mes="${escL(hoje().slice(0, 7))}">${escL(rotuloMes(hoje().slice(0, 7)))}</button>
         <button type="button" class="btn-ghost btn-sm ${est.mes === mesAnterior && mesAnterior !== hoje().slice(0, 7) ? 'active' : ''}" data-lote-acao="ir-mes" data-mes="${escL(mesAnterior)}">${escL(rotuloMes(mesAnterior))}</button>`;
    el.innerHTML = `<div class="casa-pagina lote" id="lote-raiz">
      ${typeof abasEntregasHTML === 'function' ? abasEntregasHTML('lote') : ''}
      <div class="casa-pagina-head"><div><h2>Fechar o dia</h2><p>O lote da gestão: equipe, chegada do carro, conferência da volta, retrabalho e entrega de cada O.S., de uma vez.</p></div></div>
      ${introHTML()}
      <nav class="lote-modos" aria-label="Modo do lote"><button type="button" class="btn-ghost ${est.modo === 'dia' ? 'active' : ''}" aria-pressed="${est.modo === 'dia'}" data-lote-acao="modo" data-modo="dia">Dia</button><button type="button" class="btn-ghost ${est.modo === 'pendencias' ? 'active' : ''}" aria-pressed="${est.modo === 'pendencias'}" data-lote-acao="modo" data-modo="pendencias">Pendências do mês</button></nav>
      <div class="lote-filtro">${cabeca}</div>
      <p class="lote-resumo">${est.modo === 'dia' ? `${nLinhas} O.S. em ${grupos.length} ${grupos.length === 1 ? 'volta' : 'voltas'} no dia ${escL(dataBR(est.dia))}` : `${nPend.semDiv} ${nPend.semDiv === 1 ? 'instalação entregue sem divisão' : 'instalações entregues sem divisão'} e ${nPend.aLancar} ${nPend.aLancar === 1 ? 'baixa' : 'baixas'} do ERP a lançar em ${escL(rotuloMes(est.mes))}, em ${grupos.length} ${grupos.length === 1 ? 'volta' : 'voltas'}`} · <strong>${nConf}</strong> ${nConf === 1 ? 'confirmada' : 'confirmadas'}${nFalta ? ` · ${nFalta} com falta` : ''}${canceladas ? ` · ${canceladas} ${canceladas === 1 ? 'cancelada' : 'canceladas'} no ERP fora do lote` : ''}</p>
      ${est.modo === 'pendencias' && os.length ? '<p class="lote-dica">A equipe de cada volta vem sugerida pela composição da O.S. Confira antes de confirmar: confirmar a linha grava a equipe mostrada.</p>' : ''}
      ${est.erroRascunho ? `<p class="lote-aviso" role="note">${escL(est.erroRascunho)}</p>` : ''}
      ${relatorioHTML()}
      <div class="lote-grupos">${grupos.length ? grupos.map(g => grupoHTML(g, grupoDe(g), ultimo)).join('') : `<p class="ent-fila-vazia">${est.modo === 'dia' ? 'Nenhuma O.S. externa neste dia.' : 'Nenhuma pendência neste mês.'}</p>`}</div>
      <div class="lote-rodape"><span>${est.progresso ? escL(est.progresso) : `${nConf} ${nConf === 1 ? 'linha confirmada' : 'linhas confirmadas'} para salvar`}</span>
        <button type="button" class="btn-primary" data-lote-acao="salvar" ${est.salvando || !nConf ? 'disabled' : ''}>Salvar o lote <kbd>Ctrl+Enter</kbd></button></div>
    </div>`;
    if (typeof wireAbasEntregas === 'function') wireAbasEntregas(el);
    ligar(el);
    if (est.alocAberto) {
      const host = el.querySelector(`[data-lote-aloc="${est.alocAberto.replace(/"/g, '')}"]`);
      const gx = acharGrupo(est.alocAberto);
      if (host && gx && temALOCUI()) {
        iniciarEquipe(gx.g, gx.rg, false);
        ALOCUI.montar(host, chaveAloc(gx.g), {aoAlterar: () => { guardarEquipeNoRascunho(gx.g, gx.rg); persistir(); const txt = el.querySelector(`[data-lote-grupo="${gx.g.chave.replace(/"/g, '')}"] .lote-g-eq-txt`); if (txt) txt.innerHTML = equipeResumoHTML(gx.g, gx.rg); },
          // "Ir à ficha" abre a O.S. da volta; o nome sem ficha se liga em Performance, Conferir nomes.
          aoIr: destino => { const o = representante(gx.g); if (destino === 'ficha' && o && typeof openModal === 'function') openModal(o, 'exec'); else if (typeof toast === 'function') toast('Ligue o nome à ficha do RH em Performance, Conferir nomes, e volte ao lote.'); }});
      }
    }
    restaurarFoco(el, ativa);
  }
  // O foco sobrevive à repintura: o campo ou botão pelo data-lote-k, ou a linha.
  function focoAtual() {
    if (typeof document === 'undefined' || !document.activeElement) return null;
    const a = document.activeElement;
    return {k: typeof a.getAttribute === 'function' ? a.getAttribute('data-lote-k') : null, linha: typeof a.getAttribute === 'function' ? a.getAttribute('data-lote-linha') : null};
  }
  function restaurarFoco(el, ativa) {
    if (!ativa || !el.querySelectorAll) return;
    const alvo = ativa.k ? [...el.querySelectorAll('[data-lote-k]')].find(x => x.getAttribute('data-lote-k') === ativa.k) : ativa.linha ? el.querySelector(`[data-lote-linha="${String(ativa.linha).replace(/"/g, '')}"]`) : null;
    if (alvo && typeof alvo.focus === 'function') { try { alvo.focus({preventScroll: true}); } catch (e) { alvo.focus(); } }
  }
  function ligar(el) {
    el.onclick = ev => {
      const b = ev && ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('[data-lote-acao]') : null;
      const linha = ev && ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('[data-lote-linha]') : null;
      if (linha) est.foco = linha.getAttribute('data-lote-linha');
      if (!b || b.disabled) return;
      const ds = {...(b.dataset || {})};
      const acao = ds.loteAcao;
      if (acao === 'entendi') { try { localStorage.setItem(INTRO + '|' + usuario(), '1'); } catch (e) { /* conveniência */ } render(); return; }
      if (acao === 'modo') { est.modo = ds.modo === 'pendencias' ? 'pendencias' : 'dia'; STATE._loteModo = est.modo; abrir({}).then(render); return; }
      if (acao === 'ir-dia') { abrir({dia: ds.dia}).then(render); return; }
      if (acao === 'ir-mes') { abrir({mes: ds.mes}).then(render); return; }
      if (acao === 'ficha') { const o = loja() && loja().getOS(ds.os); if (o && typeof openModal === 'function') openModal(o, 'exec'); return; }
      if (acao === 'salvar') { void salvarPelaTela(); return; }
      if (acao === 'desfazer-lote') { void desfazerPelaTela(ds.rel); return; }
      if (acao === 'retrabalho-sim') { abrirRetrabalho(ds.os); return; }
      const erro = executar({acao, os: ds.os, grupo: ds.grupo, k: ds.k, v: ds.v});
      if (erro && typeof toast === 'function') toast(erro, 'error');
      render();
    };
    el.onchange = ev => {
      const t = ev && ev.target, ds = t && t.dataset;
      if (!ds || !ds.loteCampo) return;
      const c = ds.loteCampo;
      if (c === 'dia') { if (diaOk(t.value)) abrir({dia: t.value}).then(render); return; }
      if (c === 'mes') { if (/^\d{4}-\d{2}$/.test(t.value)) abrir({mes: t.value}).then(render); return; }
      let erro = '';
      if (c === 'data') erro = executar({acao: 'data', os: ds.os, valor: t.value});
      else if (c === 'chegada') erro = executar({acao: 'chegada', grupo: ds.grupo, valor: t.value});
      else if (c === 'volta-obs') erro = executar({acao: 'volta-obs', grupo: ds.grupo, valor: t.value});
      else if (c === 'parte') erro = executar({acao: 'parte', os: ds.os, uid: ds.uid, valor: t.value});
      else if (c === 'parte-um') erro = executar({acao: 'parte', os: ds.os, uid: ds.uid, valor: t.checked ? ds.saldo : 0});
      if (erro && typeof toast === 'function') toast(erro, 'error');
      render();
    };
  }
  /* "SIM" ABRE A PERGUNTA DE SEMPRE (perguntarRetrabalho, app.js) sobre uma
     CÓPIA: a resposta vai para o rascunho da linha e só entra na O.S. no
     Salvar, pelo aplicarLancamento. */
  function abrirRetrabalho(osId) {
    const x = achar(osId);
    if (!x) { if (typeof toast === 'function') toast('Esta O.S. não está mais no lote.', 'error'); return; }
    if (typeof perguntarRetrabalho !== 'function') { if (typeof toast === 'function') toast('A pergunta do retrabalho não carregou nesta aba. Atualize a página.', 'error'); return; }
    const r = x.l.retrabalho;
    const copiaOS = {...x.o, checkout: objeto(x.o.checkout) ? {...x.o.checkout} : x.o.checkout};
    if (r && r.resposta === 'sim') { copiaOS.retrabalho = true; for (const k of ['problema', 'etapaOrigem', 'causaRaiz', 'responsavelEtapa', 'dataRetrabalho']) copiaOS[k] = r[k] || ''; }
    perguntarRetrabalho(copiaOS, () => {
      const resp = respostaRetrabalhoDe(x.o, copiaOS);
      if (resp) { x.l.retrabalho = resp; persistir(); }
      render(); focarLinha(osId);
    }, {rotulo: 'Voltar ao lote', aoVoltar: () => focarLinha(osId)});
  }
  async function salvarPelaTela() {
    if (est.salvando) return;
    const pintar = () => { if (telaAtiva()) render(); };
    const r = await salvar({aoProgresso: pintar});
    if (r && r.erro) { if (typeof toast === 'function') toast(r.erro, 'error'); pintar(); return; }
    if (r && r.cancelado) { pintar(); return; }
    const ok = lista(r && r.itens).filter(i => ['gravada', 'gravada-aviso', 'na-fila'].includes(i.estado)).length;
    const ruins = lista(r && r.itens).filter(i => ['recusada', 'conflito', 'pulada'].includes(i.estado)).length;
    if (typeof toast === 'function') toast(`Lote salvo: ${ok} ${ok === 1 ? 'O.S. gravada' : 'O.S. gravadas'}${ruins ? `, ${ruins} com problema (veja em cada linha)` : ''}.`, ruins ? 'error' : 'success');
    pintar();
  }
  async function desfazerPelaTela(relId) {
    const rel = est.relatorios.find(x => x && x.id === relId);
    if (!rel) return;
    const n = rel.itens.filter(desfazivel).length;
    if (!confirmar(`Desfazer o lote: ${n} ${n === 1 ? 'O.S. volta' : 'O.S. voltam'} ao que ${n === 1 ? 'era' : 'eram'} antes (equipe, chegada, volta, retrabalho, lançamento e marcas dos itens). O que outra pessoa mudou depois fica como está. Continuar?`)) return;
    const r = await desfazer(relId);
    if (r && r.erro && typeof toast === 'function') toast(r.erro, 'error');
    else if (typeof toast === 'function') toast('Lote desfeito. Veja o resultado em cada O.S.', 'success');
    if (telaAtiva()) render();
  }
  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') document.addEventListener('keydown', ev => { teclado(ev); });

  return {abrir, render, executar, salvar, desfazer, teclado, estado: () => est, faltasDaLinha, montarGravacao, assinatura, osDoDia, osPendentes, gruposDe,
    linha: osId => { const x = achar(osId); return x ? x.l : null; }, grupo: chave => { const x = acharGrupo(chave); return x ? x.rg : null; },
    gruposDaTela: () => { const S = loja(); return gruposDe(osDaTela(S && typeof S.getAllOS === 'function' ? S.getAllOS() : []).os); },
    gravando: () => _cadeia, relatorios: () => est.relatorios, chaveAloc, abrirRetrabalho,
    // Fechar a tela: o rascunho sai da memória e volta do IndexedDB na próxima abertura.
    esquecer: () => { est.rascunho = null; est.carregado = ''; est.relCarregado = ''; est.relatorios = []; est.foco = ''; }};
})();
// A tela Fechar o dia (aba de Entregas); casa.js chama quando STATE._entAba === 'lote'.
function renderLoteEntregas() { LOTE.render(); }
if (typeof module !== 'undefined' && module.exports) module.exports = LOTE;
