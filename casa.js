// casa.js — Entregas, Performance e Agenda da Produção.
// Performance aponta pelo ID da ficha do RH. Calendário não conversa com o RH.
'use strict';

function mesCasa() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloMesCasa(mes) {
  const [y, m] = (mes || '').split('-').map(Number);
  if (!y || !m) return mes || '';
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/* Valor curto para gráfico: "R$ 12 mil" cabe onde "R$ 12.345,67" não cabe.
   Estava copiado dentro de TRÊS funções — e a quarta cópia, a minha, ia faltar,
   porque `const` dentro de função não é global. Uma definição só. */
const dinheiroCurto = v => v >= 1000 ? 'R$ ' + (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' mil' : dinheiroCasa(v);
function dinheiroCasa(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function osFinalizadasMes(mes) {
  return STORE.getAllOS().filter(o => OPERACAO.concluida(o) && OPERACAO.dia(o.finalizadaEm).slice(0, 7) === mes);
}

function erpMesCasa(mes) {
  return STORE.getAllOS().filter(o => OPERACAO.encerradaERP(o) && OPERACAO.dia(o.finalizadaEm).slice(0, 7) === mes);
}

// Data que a produção já tem na O.S.: agenda completa, senão o dia marcado (inclusive retirada).
function diasCasa(os) {
  const ag = OPERACAO.diasAgenda(os);
  if (ag.length) return ag;
  const d = OPERACAO.prazo(os) || OPERACAO.dia(os && os.instalacao && os.instalacao.data) || OPERACAO.dia(os && os.previsaoEntrega);
  return d ? [d] : [];
}

/* A cancelada (Cancelar O.S., v141) sai do calendário como já sai da
   programação do dia: ela não ocupa mais o dia. A agenda do Painel segue a
   mesma régua (agenda-pcp.ts, canceladaPCP). Guarda de cache misto: sem o
   operacao.js novo, ninguém sai. */
function osNoMesCasa(mes) {
  const canc = typeof OPERACAO.cancelada === 'function' ? OPERACAO.cancelada : () => false;
  return STORE.getAllOS().filter(o => !OPERACAO.encerradaERP(o) && !canc(o) && diasCasa(o).some(d => d.startsWith(mes)));
}

function lerBonusCasa() {
  const cfg = STORE.getCFG();
  const b = cfg.bonusPCP || {};
  return {
    mes: b.mes || mesCasa(),
    orcamento: Number(b.orcamento) || 0,
    teto: Number(b.teto) || 0,
    pontos: b.pontos && typeof b.pontos === 'object' ? b.pontos : {},
    itens: Array.isArray(b.itens) ? b.itens : [],
  };
}

/* CADA MÊS COM SEUS PAGAMENTOS. Os itens do bônus eram uma lista só: ao trocar
   a apuração de setembro para outubro, quem recebeu em setembro aparecia "Pago"
   em outubro, o disponível descontava setembro e, para aprovar outubro, era
   preciso Reabrir, o que apagava o registro de setembro. Agora o item grava o
   mês; item antigo sem mês é do mês que estava aberto quando foi gravado, e a
   troca de mês carimba esse mês nele antes de mudar. */
function itensBonusDoMes(b, mes) {
  const m = mes || b.mes;
  return (b.itens || []).filter(x => (x.mes || b.mes) === m);
}
function trocarMesBonus(b, novo) {
  return { ...b, mes: novo, itens: (b.itens || []).map(x => (x.mes ? x : { ...x, mes: b.mes })) };
}

function gravarBonusCasa(b) {
  const cfg = STORE.getCFG();
  cfg.bonusPCP = b;
  STORE.saveCFG(cfg);
}

function idPessoaCasa(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (d.length === 6) return d;
  if (d.length === 11) return d.slice(0, 6);
  return '';
}

/* UMA PESSOA TEM VÁRIOS APELIDOS NA O.S — E CADA UM PRECISA DO SEU VÍNCULO.
   Esta leitura deduplicava por `id` (os 6 dígitos do CPF) e jogava fora o
   `chave` (o id do RH). Resultado: ligar o SEGUNDO apelido da mesma pessoa
   ("Osmane" e "Osmane V.") gravava, dizia "Foto e cargo já aparecem" num toast
   verde, e o vínculo era descartado na releitura seguinte — a linha continuava
   pendente na tela. E ficha do RH sem CPF de 11 dígitos (`id` vazio) sumia
   inteira. A chave certa é o APELIDO: é ele que a O.S guarda e é dele que a
   tela precisa partir para achar a pessoa. Ver [[vinculo_invisivel]]. */
/* MEMÓRIA DE UMA VOLTA SÓ.
   `STORE.getCFG()` reparseia o CFG inteiro do localStorage a cada chamada, e
   esta função é chamada de dentro de laços sobre ~800 O.S. O cache vale até o
   fim do render (é síncrono) e some no microtask seguinte, então gravação e
   pull nunca leem valor velho. `gravarVinculosCasa` derruba na hora. */
let _vincCache = null;
function esquecerVinculosCasa() { _vincCache = null; }
function lerVinculosCasa() {
  if (_vincCache) return _vincCache;
  const raw = STORE.getCFG().vinculosRH;
  const lista = Array.isArray(raw) ? raw : [];
  const saida = [];
  const vistos = new Set();
  for (const v of lista) {
    if (!v || typeof v !== 'object') continue;
    const apelido = String(v.apelido || v.nomePCP || '').trim();
    const chave = String(v.chave || '').trim();
    const id = idPessoaCasa(v.id || v.idPessoa);
    // `semFicha`: a decisão de que o nome é de um terceiro, não de alguém do
    // RH -- ele nunca casa sozinho com um xará (29/09/2026).
    const semFicha = v.semFicha === true;
    // Sem apelido não há o que ligar; sem NENHUM identificador da pessoa
    // (nem chave do RH, nem id de 6 dígitos) o vínculo não aponta para lugar
    // nenhum. Qualquer um dos dois basta.
    if (!apelido || (!semFicha && !chave && !id)) continue;
    const k = normCasa(apelido);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(semFicha ? { id: '', chave: '', nome: '', apelido, semFicha: true } : { id, chave, nome: String(v.nome || '').trim(), apelido });
  }
  _vincCache = saida;
  Promise.resolve().then(esquecerVinculosCasa);
  return saida;
}

function gravarVinculosCasa(lista) {
  const cfg = STORE.getCFG();
  cfg.vinculosRH = lista;
  STORE.saveCFG(cfg);
  esquecerVinculosCasa();   // quem grava e relê na mesma volta vê o novo
  OPERACAO.esquecerPessoas();
}

function fichaPorId(id) {
  const chave = idPessoaCasa(id);
  if (!chave) return null;
  return lerVinculosCasa().find(v => v.id === chave) || null;
}

/* O BÔNUS SÓ ENXERGAVA O VÍNCULO FEITO À MÃO. O apelido que bate sozinho com a
   ficha do RH (o caminho 2 de "UMA BASE SÓ", o mais comum) saía "sem ficha" no
   bônus, sem chip para marcar, enquanto o quadro de ligação dizia que todo
   apelido já tinha ficha: beco sem saída. A régua agora é a mesma de
   fichaDoApelido: vínculo salvo manda, senão o casamento automático, desde que
   a ficha tenha o id de 6 dígitos (é ele que o ponto grava). */
function fichaPorApelido(apelido) {
  const a = String(apelido || '').trim();
  if (!a) return null;
  const hits = lerVinculosCasa().filter(v => normCasa(v.apelido) === normCasa(a));
  if (hits.length) return hits.length === 1 && !hits[0].semFicha ? hits[0] : null;
  const p = typeof pessoaDoElenco === 'function' ? pessoaDoElenco(a) : null;
  const id = p ? idPessoaCasa(p.id) : '';
  return id ? { id, chave: p.chave || '', nome: p.nome || a, apelido: a } : null;
}

function rotuloPessoaCasa(id) {
  const f = fichaPorId(id);
  if (f) return `${f.nome || f.apelido || 'Sem nome'} · ID ${f.id}`;
  const chave = idPessoaCasa(id);
  // Quem casou sozinho com o RH não tem vínculo salvo: o nome vem da ficha.
  const p = chave ? pessoaRHPorId6(chave) : null;
  if (p) return `${p.nome || p.apelido || 'Sem nome'} · ID ${chave}`;
  return chave ? `ID ${chave}` : '';
}

function chavePessoaCasa(valor) {
  const id = idPessoaCasa(valor);
  if (id) return id;
  const f = fichaPorApelido(valor);
  return f ? f.id : '';
}

function idsDoPonto(valor) {
  const arr = Array.isArray(valor) ? valor : (typeof valor === 'string' && valor.trim() ? [valor] : []);
  return [...new Set(arr.map(chavePessoaCasa).filter(Boolean))];
}

function instaladoresDaOs(os, pontos) {
  if (Object.prototype.hasOwnProperty.call(pontos, os.id)) return idsDoPonto(pontos[os.id]);
  const eq = OPERACAO.equipe(os);
  if (eq.length !== 1) return [];
  const f = fichaPorApelido(eq[0]);
  // Vínculo salvo só pela chave do RH (ficha sem CPF) tem id vazio: sem id não
  // há ponto, senão várias pessoas caem juntas numa linha sem nome no ranking.
  return f && f.id ? [f.id] : [];
}

function rankingFinalizadas(mes, pontos) {
  const map = new Map();
  for (const os of osFinalizadasMes(mes)) {
    const ids = instaladoresDaOs(os, pontos);
    for (const id of ids) {
      if (!id) continue;
      const d = map.get(id) || { id, nome: rotuloPessoaCasa(id), osCount: 0, retrab: 0, itens: [] };
      d.osCount += 1;
      if (os.retrabalho) d.retrab += 1;
      d.itens.push(os);
      map.set(id, d);
    }
  }
  return [...map.values()].sort((a, b) => b.osCount - a.osCount || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function itemDaPessoa(itens, id) {
  return itens.find(x => x.id === id || (!x.id && chavePessoaCasa(x.nome) === id));
}

function propostaCasa(osCount, total, orcamento, teto) {
  if (orcamento <= 0 || total <= 0 || osCount <= 0) return 0;
  const bruto = orcamento * (osCount / total);
  const capped = teto > 0 ? Math.min(bruto, teto) : bruto;
  return Math.round(capped * 100) / 100;
}

// ── Valor da O.S (uma base só) ───────────────────────────────────────────────
// Ordem: painel_ordens (STORE.valores, verdade do Painel com rateio conferido)
// > valorTotal que a importação gravou. Subtotais não comprovam descontos. null = sem valor,
// que a tela mostra em laranja em vez de fingir zero.
function numBR(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const t = String(v).trim();
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}
function valorDaOS(os) {
  const num = String(os && os.numero || '').trim();
  const origemAtualizada = os?.erpAlteracoes?.some(h => h.campos?.some(c => c.campo === 'valorTotal'));
  if (origemAtualizada && Number.isFinite(numBR(os.valorTotal)) && numBR(os.valorTotal)>=0) return numBR(os.valorTotal);
  const doPainel = num && STORE.valores ? STORE.valores()[num] : undefined;
  if (Number.isFinite(doPainel) && doPainel>=0) return doPainel;
  const vt = numBR(os && os.valorTotal);
  if (Number.isFinite(vt) && vt >= 0) return vt;
  return null;
}
function somaValores(lista) {
  let total = 0, semValor = 0;
  for (const os of lista) { const v = valorDaOS(os); if (v == null) semValor++; else total += Math.round(v*100); }
  return { total:total/100, semValor };
}
function iniciaisCasa(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
// Semana corrente: segunda a domingo, no calendário local.
function semanaAtualCasa() {
  const hoje = OPERACAO.dia(new Date());
  const d = new Date(hoje + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return { de: OPERACAO.somarDias(hoje, -dow), ate: OPERACAO.somarDias(hoje, 6 - dow) };
}
function periodoOuMes(chave) {
  if (!STATE[chave]) {
    const hoje = OPERACAO.dia(new Date());
    STATE[chave] = { de: hoje.slice(0, 7) + '-01', ate: hoje };
  }
  return STATE[chave];
}
// ── REGRAS DE REGISTRO DE ENTREGAS (dono, 14/09/2026) ────────────────────────
//  • Cliente retira → o VALOR entra no mês; a retirada NÃO conta como entrega
//    realizada (não é instalação).
//  • Baixada normalmente no sistema (finalizada no PCP) → valor + entrega.
//  • Baixada fora do sistema, pelo ERP → NÃO entra sozinha: vai para a lista
//    de LANÇAMENTO MANUAL, e só conta depois que alguém registra (entregaLancada).
//    Retirada baixada pelo ERP segue a regra da retirada (valor entra).
// CORTE (decisão do dono, 14/09/2026): "as entregas antigas pode jogar todas
// como entregues para somar nos valores; vai ser de amanhã para frente". Baixa
// do ERP anterior a esta data conta como entregue sem lançamento; a partir
// dela, lançamento manual. Regra explícita aqui, não 147 carimbos no banco.
// CONSTANTE ÚNICA do aparelho (F16): o servidor tem a dele no pcp-sync
// (perfFonte), e tests/cancelamento-f16.test.cjs confere que as duas dizem o
// mesmo dia (e a reserva do store.js, para quando este arquivo não carrega).
const CORTE_LANCAMENTO_MANUAL = '2026-09-15';
function erpAntesDoCorte(o) {
  return OPERACAO.encerradaERP(o) && !OPERACAO.entregaLancadaValida(o) && OPERACAO.dia(o.finalizadaEm) < CORTE_LANCAMENTO_MANUAL;
}
/* A O.S. CANCELADA (F16), no ERP ou à mão pela gestão, não é entrega nem
   retirada: não conta valor, sai da fila "a lançar" e da base da apuração (o
   servidor faz o mesmo no perfFonte). Fica em `canceladas`, para quem quiser
   contar. A aberta cancelada também entra: ela não vai mais ser entregue. */
function classificarEntregas(lista) {
  const r = { retiradas: [], instalacoes: [], aLancar: [], canceladas: [] };
  for (const o of lista || STORE.getAllOS()) {
    // Cache misto (operacao.js de antes da F16 com este casa.js): sem a função, ninguém é cancelada.
    if (typeof OPERACAO.cancelada === 'function' && OPERACAO.cancelada(o)) { r.canceladas.push(o); continue; }
    if (!OPERACAO.dia(o.finalizadaEm)) continue;
    if (OPERACAO.interno(o)) { r.retiradas.push(o); continue; }
    // O pedido de Desfazer do lote ainda na fila ({desfazer:true}) não é lançamento (OPERACAO.entregaLancadaValida).
    if (OPERACAO.encerradaERP(o) && !OPERACAO.entregaLancadaValida(o) && !erpAntesDoCorte(o)) { r.aLancar.push(o); continue; }
    r.instalacoes.push(o);
  }
  return r;
}
/* O APARELHO SÓ GUARDA OS ÚLTIMOS N DIAS de finalizadas (store.js). Antes
   disso, "não achei o card" quer dizer "não tenho cópia", e não "nunca passou
   pelo PCP". Quem lê do aparelho usa este limite para não afirmar ausência. */
function janelaLocalCasa() { return (typeof STORE.JANELA_LOCAL_DIAS === 'number') ? STORE.JANELA_LOCAL_DIAS : 60; }
function limiteJanelaCasa() { return OPERACAO.somarDias(OPERACAO.dia(new Date()), -janelaLocalCasa()); }
// Período que começa antes da janela (ou "Todos"): o quadro que lê o aparelho
// conta menos do que a legenda promete. Diz isso em vez de afirmar "nenhum".
function foraDaJanelaCasa(f) { return !f || !f.de || f.de < limiteJanelaCasa(); }
function avisoJanelaCasa(f) {
  return foraDaJanelaCasa(f) ? `<p class="metricas-nota">Este quadro lê só as O.S guardadas neste aparelho, dos últimos ${janelaLocalCasa()} dias. O período escolhido começa antes disso; o histórico completo está em Entregas.</p>` : '';
}

// Data que vale para o mês: a do lançamento manual, se houver; senão a
// finalização (na O.S. que o ERP baixou, o dia da entrega: diaDaBaixaERP).
function diaEntrega(o) {
  // O pedido de Desfazer do lote ainda na fila ({desfazer:true}) não é lançamento (OPERACAO.entregaLancadaValida).
  const l = OPERACAO.entregaLancadaValida(o);
  return (l && OPERACAO.dia(l.data))
    || (OPERACAO.encerradaERP(o) ? diaDaBaixaERP(o) : OPERACAO.dia(o.finalizadaEm));
}
/* O DIA DA ENTREGA NA O.S. QUE O ERP BAIXOU (revisão da E7). A baixa finaliza
   no dia em que roda, e a entrega pode ter sido antes: o "Entregar o saldo em
   29/09" decidido em 02/10 marca os itens em 29/09, a baixa da hora seguinte
   finaliza em 02/10, e a O.S. passava a contar em outubro (e o Lançar
   propunha 02/10). A ordem:
     1. a data de entrega que o ERP informou (erpComSaldo.dataEntregue);
     2. com todo item marcado (entregue, retirado ou cancelado, por marca), o
        último dia de marca;
     3. só então o dia da finalização.
   MANTIDA ABERTA (decisão do dono, revisão da E7): com o "Manter aberta"
   da gestão para este aviso do ERP (erpSaldoDecisao manter, o mesmo selo), a
   gestão disse que NÃO foi entregue naquela data, e a data do ERP não vence:
   vale o último dia de marca (todo item marcado) ou o dia da finalização.
   Cancelada no ERP segue o dia da baixa, como antes. Vale só para a O.S.
   encerrada pelo ERP: a finalizada no PCP conta no dia em que alguém a
   finalizou, como sempre. */
function diaDaBaixaERP(o) {
  return diaRealDaBaixaERP(o) || OPERACAO.dia(o && o.finalizadaEm);
}
/* O DIA REAL DA ENTREGA NA BAIXA DO ERP (junção da v142): os passos 1 e 2
   acima, ou '' quando só se sabe o dia em que a baixa rodou. É a baixa
   NEUTRA da F16: o dia da baixa é o da sincronização, não o da entrega, e o
   status não julga o prazo por ele. */
function diaRealDaBaixaERP(o) {
  return fonteRealDaBaixaERP(o).dia;
}
// O mesmo dia, com a origem: 'erp' (a data que o ERP informou) ou 'marca' (a última marca, com todo item marcado).
function fonteRealDaBaixaERP(o) {
  const nada = { dia: '', origem: '' };
  if (!o || typeof o !== 'object' || typeof ENTREGA_ITEM === 'undefined' || !ENTREGA_ITEM || typeof ENTREGA_ITEM.resumoOS !== 'function') return nada;
  try { if (ENTREGA_ITEM.canceladaNoERP(o)) return nada; } catch { return nada; }
  const m = o.erpComSaldo && typeof o.erpComSaldo === 'object' && !Array.isArray(o.erpComSaldo) ? o.erpComSaldo : null;
  const dec = o.erpSaldoDecisao;
  const mantida = !!(m && dec && typeof dec === 'object' && dec.tipo === 'manter' && String(dec.selo || '') === String(m.selo || ''));
  const doERP = m && !mantida && /^\d{4}-\d{2}-\d{2}$/.test(String(m.dataEntregue || '')) ? String(m.dataEntregue) : '';
  if (doERP) return { dia: doERP, origem: 'erp' };
  const marca = ultimoDiaDeMarcaCasa(o);
  return marca ? { dia: marca, origem: 'marca' } : nada;
}
/* A DATA QUE SE PROPÕE PARA LANÇAR A BAIXA DO ERP (junção da v142): uma
   régua só, no Lançar entrega e no Fechar o dia (lote.js), para a mesma O.S.
   não ter uma data em cada tela. A ordem:
     1. o dia real da E7 (diaRealDaBaixaERP: a data do ERP, ou a última marca
        com todo item marcado);
     2. na baixa neutra (F16: o dia da baixa é o da sincronização), o retorno
        registrado, ou o último dia da agenda, SÓ quando cai numa janela curta
        antes da baixa: até 7 dias antes dela (o ERP costuma baixar 2 a 4 dias
        depois da entrega real) e fora de período já fechado na Performance;
     3. senão, o dia da baixa (como na v141).
   A JANELA CURTA (revisão da junção da v142): o importador grava em
   instalacao.data a PREVISÃO de entrega do ERP, e na O.S. que o PCP nunca
   agendou a "agenda" é essa previsão. A O.S. atrasada (previsão em 12/06,
   baixa em 25/09) recebia 12/06: um dia num período fechado, o status virava
   "No prazo" e o lote a punha nas Pendências de junho.
   Devolve {dia, origem, ref}: origem 'erp', 'marca', 'retorno', 'agenda' ou
   'baixa'; ref é o dia de onde a sugestão saiu. Sem finalização, dia ''. */
const JANELA_SUGESTAO_BAIXA_DIAS = 7;
function sugestaoDaBaixaERP(o) {
  const fim = OPERACAO.dia(o && o.finalizadaEm);
  if (!fim) return { dia: '', origem: '', ref: '' };
  const real = fonteRealDaBaixaERP(o);
  if (real.dia) return { dia: real.dia, origem: real.origem, ref: real.dia };
  const desde = OPERACAO.somarDias(fim, -JANELA_SUGESTAO_BAIXA_DIAS);
  const fechados = periodosFechadosConhecidosCasa();
  const vale = d => !!d && d <= fim && d >= desde && !fechados.some(f => d >= f.de && d <= f.ate);
  const ret = OPERACAO.dia(o.retornoEm);
  if (vale(ret)) return { dia: ret, origem: 'retorno', ref: ret };
  const ag = OPERACAO.diasAgenda(o).filter(vale).pop();
  if (ag) return { dia: ag, origem: 'agenda', ref: ag };
  return { dia: fim, origem: 'baixa', ref: fim };
}
function diaSugeridoDaBaixaERP(o) {
  return sugestaoDaBaixaERP(o).dia;
}
/* De onde a data veio, ao lado do campo (no Lançar e na linha do lote): a
   pessoa vê se é a agenda, o retorno ou o dia da baixa antes de aceitar. */
function textoOrigemSugestaoCasa(s) {
  const br = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
  if (!s || !s.dia) return '';
  if (s.origem === 'agenda') return `sugerida pela agenda de ${br(s.ref)}`;
  if (s.origem === 'retorno') return `sugerida pelo retorno de ${br(s.ref)}`;
  if (s.origem === 'erp') return 'sugerida pela data de entrega do ERP';
  if (s.origem === 'marca') return 'sugerida pela última entrega marcada';
  if (s.origem === 'baixa') return 'sugerida pelo dia da baixa do ERP';
  return '';
}
/* OS PERÍODOS FECHADOS QUE ESTE APARELHO CONHECE, sem ir ao servidor: o
   "fechado até" das regras (STORE.regrasLocais, o maior fim de fechamento
   gravado) e as revisões que a Performance consultou (perfRemoto). Sem
   nenhum dos dois, a lista vem vazia e vale só a janela curta. */
function periodosFechadosConhecidosCasa() {
  const out = [];
  let loc = null;
  try { loc = typeof STORE !== 'undefined' && STORE && typeof STORE.regrasLocais === 'function' ? STORE.regrasLocais() : null; } catch { loc = null; }
  const ate = OPERACAO.dia(loc && loc.fechadoAte);
  if (ate) out.push({ de: '', ate });
  const revisoes = typeof perfRemoto !== 'undefined' && perfRemoto && Array.isArray(perfRemoto.fechamentos) ? perfRemoto.fechamentos : [];
  for (const f of revisoes) {
    const de = OPERACAO.dia(f && f.de), fim = OPERACAO.dia(f && f.ate);
    if (de && fim) out.push({ de, ate: fim });
  }
  return out;
}
// O último dia de marca, só quando TODO item físico está entregue, retirado ou cancelado por marca.
function ultimoDiaDeMarcaCasa(o) {
  // Filtro barato primeiro: quase toda baixa do ERP chega sem marca nenhuma.
  if (!(Array.isArray(o.itens) && o.itens.some(it => it && Array.isArray(it.entregas) && it.entregas.length))) return '';
  const semFim = {...o, finalizadaEm: ''};   // sem a finalização o motor não põe entrega implícita
  let r;
  try { r = ENTREGA_ITEM.resumoOS(semFim); } catch { return ''; }
  if (!r || r.situacao !== 'completa') return '';
  let maior = '';
  for (const it of Array.isArray(o.itens) ? o.itens : []) {
    if (!it || typeof it !== 'object' || ENTREGA_ITEM.ehServico(it)) continue;
    let st;
    try { st = ENTREGA_ITEM.situacaoItem(it, semFim); } catch { return ''; }
    const d = st && st.entregue > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(st.dia || '')) ? String(st.dia) : '';
    if (d > maior) maior = d;
  }
  return maior;
}
// Como a pessoa aparece nas telas da casa. Desde 14/09/2026 vem com a FICHA do
// RH junto (foto, cargo, área) -- quando o apelido acha dona. A chave de
// agrupamento é a ficha, então a mesma pessoa escrita de dois jeitos vira uma.
function nomeExibicaoCasa(apelido) {
  const p = fichaDoApelido(apelido);
  if (p) return { chave: p.chave || p.id || apelido, nome: p.nome || apelido, id: p.id || '', pessoa: p, apelido };
  return { chave: apelido, nome: apelido, id: '', pessoa: null, apelido };
}

/* ══════════════════════════════════════════════════════════════════════════
   UMA BASE SÓ: AS PESSOAS VÊM DO RH
   ─────────────────────────────────────────────────────────────────────────
   O PCP escreve apelidos na O.S ("Osmane", "Adriano Pinheiro"). A ficha mora
   no RH. Ligar os dois tem três caminhos, nesta ordem:
     1. vínculo salvo à mão (humano manda — a tela de Performance tem o botão);
     2. o apelido/nome bate sozinho com a ficha (pessoaDoElenco, em app.js);
     3. ninguém: fica "sem ficha do RH" e aparece na lista de pendentes.
   Quem foi DESLIGADO já não vem no elenco. Quem está inativo/abandono vem
   marcado `ativo:false` — some das listas de escolha, continua no histórico.
   ══════════════════════════════════════════════════════════════════════════ */
function elencoRH() { return (typeof STORE !== 'undefined' && STORE.elenco) ? STORE.elenco() : { pessoas: [], veiculos: [], ferias: [], ausencias: [] }; }
function pessoasRH() { return elencoRH().pessoas || []; }
function veiculosRH() { return elencoRH().veiculos || []; }
function pessoaRHPorChave(chave) { const c = String(chave || ''); return c ? pessoasRH().find(p => p.chave === c) || null : null; }
function pessoaRHPorId6(id) { const i = idPessoaCasa(id); return i ? pessoasRH().find(p => p.id === i) || null : null; }
function pessoasRHAtivas() { return pessoasRH().filter(p => p.ativo !== false); }
function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
function rotuloCurtoRH(p) { return p ? (p.apelido ? p.apelido[0].toUpperCase() + p.apelido.slice(1) : primeiroNome(p.nome)) : ''; }

// Por que a pessoa não está na fábrica hoje. Férias e ausência vêm do RH; o
// status (atestado, afastado, aviso) vem da própria ficha. Sem motivo = presente.
const STATUS_AUSENTE = { 'atestado-medico': 'Atestado médico', afastado: 'Afastado', aviso: 'Aviso prévio', abandono: 'Abandono', inativo: 'Inativo', externo: 'Externo' };
function ausenciaRH(p, dia) {
  if (!p) return null;
  const hoje = dia || OPERACAO.dia(new Date());
  const fer = (elencoRH().ferias || []).find(f => f.chave === p.chave && f.de && f.de <= hoje && (!f.ate || f.ate >= hoje) && String(f.status || '').toLowerCase() !== 'cancelada');
  if (fer) return { motivo: 'Férias', ate: fer.ate, tipo: 'ferias' };
  const falta = (elencoRH().ausencias || []).find(a => a.chave === p.chave && a.data === hoje);
  if (falta) return { motivo: falta.tipo || 'Ausência', ate: hoje, tipo: 'ausencia' };
  if (STATUS_AUSENTE[p.statusId]) return { motivo: STATUS_AUSENTE[p.statusId], ate: '', tipo: p.statusId };
  return null;
}
// A situação da pessoa (férias, atestado, aviso prévio) é ficha do RH e só
// desce para admin/pcp. Quem entrou pelo nome, sem senha, recebe as listas
// VAZIAS — e vazio aqui não quer dizer "ninguém está fora". Ver [[zero não é
// resultado]]: a tela tem de dizer que não sabe, em vez de afirmar zero.
function temFichaRH() { return elencoRH().fichaRH !== false; }

// Quem está na empresa hoje, agrupado. Inativo e desligado NÃO entram em nenhuma
// das duas listas — saem da empresa, saem da tela (ordem do dono, 14/09/2026).
function presencaRH(dia) {
  const presentes = [], ausentes = [], fora = [];
  const sabeSituacao = temFichaRH();
  for (const p of pessoasRH()) {
    // Freelancer é contrato, não quadro (F07): não entra na presença da fábrica.
    if (p.freelancer) continue;
    if (p.ativo === false) { fora.push(p); continue; }
    const a = sabeSituacao ? ausenciaRH(p, dia) : null;
    if (a) ausentes.push({ p, ...a }); else presentes.push(p);
  }
  const porNome = (a, b) => String(a.nome || a.p.nome).localeCompare(String(b.nome || b.p.nome));
  return { presentes: presentes.sort(porNome), ausentes: ausentes.sort(porNome), fora, sabeSituacao };
}

// Apelido escrito na O.S → ficha do RH (vínculo salvo, senão casamento automático).
/* A ENTRADA DA EQUIPE É O ID (29/09/2026) OU O NOME ANTIGO: a mesma régua de
   OPERACAO.pessoaDe -- vínculo salvo, depois casamento único com o RH -- que
   o servidor também usa. Um lugar só decide quem é quem. */
function fichaDoApelido(apelido) {
  const a = String(apelido || '').trim();
  if (!a) return null;
  const salvo = lerVinculosCasa().find(v => normCasa(v.apelido) === normCasa(a));
  if (salvo) {
    if (salvo.semFicha) return null;   // decidido: terceiro, não é ninguém do RH
    // Vínculo salvo manda (inclusive para ficha sem CPF, que não tem ID).
    const p = pessoaRHPorChave(salvo.chave) || pessoaRHPorId6(salvo.id);
    if (p) return p;
    return { chave: salvo.chave || '', id: salvo.id, nome: salvo.nome || a, apelido: a, foto: '', cargo: '', area: '', ativo: true, manual: true };
  }
  const p = OPERACAO.pessoaDe(a);
  if (!p) return null;
  if (!p.semFicha) return p;
  // ID que não está no elenco (quem saiu antes da lista dos antigos, ou elenco
  // ainda não baixado): o vínculo salvo sabe o nome; senão, o próprio ID.
  const v = lerVinculosCasa().find(x => x.id === p.id);
  return { chave: (v && v.chave) || '', id: p.id, nome: (v && v.nome) || 'ID ' + p.id, apelido: OPERACAO.ehIdPessoa(a) ? '' : a, foto: '', cargo: '', area: '', ativo: false, manual: true, semFicha: true };
}
function normCasa(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

// Apelidos usados nas O.S que ainda não acharam ficha — o que a tela oferece
// para ligar. Vínculo invisível manda dinheiro errado: aqui ele fica à vista.
// Conta primeiro, resolve depois: `fichaDoApelido` relê e reparseia o CFG
// inteiro do localStorage a cada chamada, e chamá-la por equipe de CADA O.S
// dava da ordem de 7 mil JSON.parse por pintura (~1 s no tablet, crescendo com
// o histórico). Os apelidos distintos são algumas dezenas.
function apelidosSemFicha() {
  const conta = new Map();
  for (const os of STORE.getAllOS()) for (const ap of OPERACAO.equipe(os)) {
    conta.set(ap, (conta.get(ap) || 0) + 1);
  }
  return [...conta.entries()]
    .filter(([apelido]) => !fichaDoApelido(apelido))
    .map(([apelido, n]) => ({ apelido, n }))
    .sort((a, b) => b.n - a.n || a.apelido.localeCompare(b.apelido));
}
/* CONFERÊNCIA PCP × RH (pedido do Léo, 29/09/2026: "conferir pra puxar o
   funcionário do RH tem que bater com o PCP, conferir se está linkado, tem
   alguns funcionários juntos"). O quadro mostrava só quem estava SEM ficha: a
   ligação automática, a mais comum, ficava invisível, e uma ligação errada
   não tinha como ser vista nem trocada. Agora cada nome usado no PCP (lista
   de instaladores + equipes das O.S.) aparece com a ficha a que chega, como
   chegou, e os alertas:
   - sem ficha: nenhuma pessoa do RH;
   - ambíguo: o nome serve para mais de uma pessoa (os dois Adrianos) e por
     isso não liga sozinho;
   - juntos: dois nomes do PCP chegam à mesma ficha. Pode ser a mesma pessoa
     escrita de dois jeitos (certo) ou duas pessoas grudadas (errado); quem
     sabe é o PCP, então a tela mostra lado a lado;
   - fora da ativa: a ficha está inativa no RH. */
// Uma entrada por PESSOA: o nome antigo e o ID da mesma pessoa em O.S.
// diferentes contam uma vez ("pessoas escaladas", aviso de ausência).
function umaPorPessoa(entradas) {
  const vistos = new Set();
  return (entradas || []).filter(x => { const k = OPERACAO.chavePessoa(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
}
/* CHIPS DE PESSOA: a lista de instaladores e quem mais está na O.S., como
   PESSOAS -- valor = ID do RH quando há ficha, rótulo = nome de exibição.
   Marcar o chip grava o ID (ordem do dono, 29/09/2026). */
function pessoasDosChips(os) {
  const vistos = new Set(), out = [];
  const add = (n, fora) => {
    const k = OPERACAO.chavePessoa(n);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    const p = OPERACAO.pessoaDe(n);
    // A dica diz A QUEM o chip leva (nome completo e ID): marcar grava o ID.
    // Freelancer (contrato do RH, F07) leva a tag no chip e na dica.
    const freelancer = !!(p && p.freelancer);
    const repetido = !!(p && p.id && OPERACAO.idRepetido && OPERACAO.idRepetido(p.id));
    out.push({ valor: OPERACAO.idPessoa(n) || String(n).trim(), rotulo: OPERACAO.nomePessoa(n), chave: k, fora, freelancer,
      dica: p && p.nome ? `${p.nome} · ID ${p.id}${freelancer ? ' · Freelancer' : ''}${repetido ? ' · ID repetido no RH: confira o CPF' : ''}` : 'Sem ficha no RH: grava o nome' });
  };
  (STORE.getCFG().instaladores || []).map(String).filter(Boolean).forEach(n => add(n, false));
  OPERACAO.equipe(os || {}).forEach(n => add(n, true));
  return out;
}
function candidatosRH(apelido) {
  const toks = normCasa(apelido).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  return pessoasRH().filter(p => {
    const n = normCasa(p.nome).split(/\s+/);
    return normCasa(p.apelido) === toks.join(' ') || toks.every((t, i) => n[i] === t);
  });
}
/* AS O.S. DA CONFERÊNCIA (F12): as do aparelho (abertas e finalizadas da
   janela local) e as antigas que a tela trouxe do servidor para converter
   (STORE.historico, só na memória desta aba). A do aparelho vence. */
function osDaConferencia() {
  const local = STORE.getAllOS();
  const vistos = new Set(local.map(o => o && o.id));
  const hist = typeof STORE.historico === 'function' ? (STORE.historico() || []).filter(o => o && o.id && !vistos.has(o.id)) : [];
  return hist.length ? local.concat(hist) : local;
}
function conferenciaRH() {
  const conta = new Map();
  const soma = (nome, n) => {
    const ap = String(nome || '').trim();
    if (!ap) return null;
    const k = normCasa(ap);
    const x = conta.get(k) || { apelido: ap, n: 0, naLista: false };
    x.n += n;
    conta.set(k, x);
    return x;
  };
  // Cada NOME escrito conta (dois nomes da mesma pessoa na mesma O.S. são o
  // "juntos" que a tela mostra). O ID já é a pessoa: não entra na conferência.
  // As O.S. antigas que a tela buscou no servidor (F12) contam junto.
  for (const os of osDaConferencia()) {
    const vistos = new Set();
    for (const x of Array.isArray(os.equipe) ? os.equipe : []) {
      const ap = String(x ?? '').trim();
      if (!ap || OPERACAO.ehIdPessoa(ap) || vistos.has(normCasa(ap))) continue;
      vistos.add(normCasa(ap));
      soma(ap, 1);
    }
  }
  for (const nome of (STORE.getCFG().instaladores || [])) { const x = soma(nome, 0); if (x) x.naLista = true; }
  const salvos = lerVinculosCasa();
  const linhas = [...conta.values()].map(x => {
    const pessoa = fichaDoApelido(x.apelido);
    const decisao = salvos.find(v => normCasa(v.apelido) === normCasa(x.apelido));
    const salvo = !!decisao && !decisao.semFicha;
    const candidatos = pessoa ? [] : candidatosRH(x.apelido);
    const como = pessoa ? (salvo ? 'salvo' : 'auto') : decisao ? 'terceiro' : candidatos.length > 1 ? 'ambiguo' : 'sem-ficha';
    return { ...x, pessoa, como, candidatos, inativa: !!(pessoa && pessoa.ativo === false), juntos: [] };
  });
  const chaveFicha = p => p ? String(p.chave || p.id || normCasa(p.nome)) : '';
  const porFicha = new Map();
  for (const l of linhas) if (l.pessoa) {
    const k = chaveFicha(l.pessoa);
    if (!porFicha.has(k)) porFicha.set(k, []);
    porFicha.get(k).push(l.apelido);
  }
  for (const l of linhas) if (l.pessoa) l.juntos = porFicha.get(chaveFicha(l.pessoa)).filter(a => a !== l.apelido);
  // O que falta resolver primeiro; depois o que pede um olhar; o resto, pelo uso.
  const peso = l => (l.como === 'sem-ficha' || l.como === 'ambiguo') ? 0 : (l.juntos.length || l.inativa) ? 1 : 2;
  return linhas.sort((a, b) => peso(a) - peso(b) || b.n - a.n || a.apelido.localeCompare(b.apelido));
}
const pendentesConferenciaRH = () => conferenciaRH().filter(l => l.como === 'sem-ficha' || l.como === 'ambiguo').length;

// Substitui o vínculo DESTE apelido. Outros apelidos da mesma pessoa ficam:
// o ERP escreve o nome de jeitos diferentes e todos têm de achar a ficha.
// Só devolve true depois de conferir que o vínculo sobreviveu à releitura —
// antes a função respondia true sempre e o toast verde mentia.
function ligarApelidoRH(apelido, chave) {
  const p = pessoaRHPorChave(chave);
  const ap = String(apelido || '').trim();
  if (!p || !ap) return false;
  // ID que ficha e contrato de freelancer dividem não vira vínculo (F07).
  if (p.idRepetido || (p.id && OPERACAO.idRepetido && OPERACAO.idRepetido(p.id))) return false;
  const lista = lerVinculosCasa().filter(v => normCasa(v.apelido) !== normCasa(ap));
  lista.push({ id: p.id, chave: p.chave, nome: p.nome, apelido: ap });
  gravarVinculosCasa(lista);
  return !!fichaDoApelido(ap);
}

// Avatar: foto da ficha quando existe, iniciais quando não.
function avatarRH(p, classe) {
  const nome = (p && p.nome) || '';
  if (p && p.foto) return `<img class="casa-avatar ${classe || ''}" src="${esc(p.foto)}" alt="" loading="lazy">`;
  return `<span class="casa-avatar ${classe || ''}" aria-hidden="true">${esc(iniciaisCasa(nome || '?'))}</span>`;
}

/* ── Quadros de análise recolhíveis, com a escolha guardada ────────────────
   Pedido do dono: em tela de análise, todo quadro abre e fecha e lembra. */
function lerQuadrosCasa() {
  try { return JSON.parse(localStorage.getItem('impresilk_inst_quadros') || '{}') || {}; } catch { return {}; }
}
function quadroAberto(id, padrao) {
  const q = lerQuadrosCasa();
  return Object.prototype.hasOwnProperty.call(q, id) ? !!q[id] : !!padrao;
}
/* `forcar` atropela a escolha guardada. Sem isso, quem tinha fechado o
   formulário de plantão clicava em "Editar", a tela rolava, e nada abria — nem
   nada explicava. A preferência continua valendo no uso normal; só a ação
   explícita a vence. */
function quadroCasa(id, titulo, corpo, padrao, forcar) {
  return `<details class="casa-quadro" data-quadro="${esc(id)}" ${(forcar || quadroAberto(id, padrao)) ? 'open' : ''}>
    <summary>${titulo}</summary>
    <div class="casa-quadro-corpo">${corpo}</div>
  </details>`;
}
function wireQuadrosCasa(el) {
  el.querySelectorAll('[data-quadro]').forEach(d => {
    d.ontoggle = () => {
      const q = lerQuadrosCasa();
      q[d.dataset.quadro] = d.open;
      try { localStorage.setItem('impresilk_inst_quadros', JSON.stringify(q)); } catch {}
    };
  });
}

/* ── Barras horizontais simples (sem biblioteca) ───────────────────────────
   itens: [{rotulo, valor, extra}]. Mostra o maior em cima, com a barra
   proporcional. Zero itens devolve string vazia — quem chama decide o vazio. */
function barrasCasa(itens, fmt) {
  const lista = (itens || []).filter(i => Number(i.valor) > 0);
  if (!lista.length) return '';
  const max = Math.max(...lista.map(i => Number(i.valor)));
  const f = fmt || (v => String(v));
  return `<div class="casa-barras">${lista.map(i => `<div class="casa-barra-linha">
      <span class="casa-barra-rot" title="${esc(i.rotulo)}">${esc(i.rotulo)}</span>
      <span class="casa-barra-trilho"><span class="casa-barra-preenche" style="width:${Math.max(2, Math.round(Number(i.valor) / max * 100))}%"></span></span>
      <span class="casa-barra-val">${f(i.valor)}${i.extra ? ` <small>${esc(i.extra)}</small>` : ''}</span>
    </div>`).join('')}</div>`;
}

function initCasa() {
  const btn = document.getElementById('btn-menu');
  const fundo = document.getElementById('nav-fundo');
  const abrir = () => {
    document.body.classList.add('nav-aberta');
    if (fundo) fundo.hidden = false;
  };
  const fechar = () => {
    document.body.classList.remove('nav-aberta');
    if (fundo) fundo.hidden = true;
  };
  if (btn) btn.onclick = () => (document.body.classList.contains('nav-aberta') ? fechar() : abrir());
  if (fundo) fundo.onclick = fechar;
  document.querySelectorAll('#tabs .tab').forEach(t => {
    t.addEventListener('click', fechar);
  });
}

/* O LANÇAMENTO NA O.S., SEM TELA (F13).
   A parte que grava do "Lançar entrega", separada do formulário para o lote
   do Fechar o dia (F14) usar a mesma regra. Recebe a O.S. e o que a pessoa
   decidiu e DEVOLVE A O.S. NOVA: não mexe na que recebeu, não lê o DOM, não
   pergunta nada e não grava (quem chama grava, uma vez). Tudo o que a O.S.
   trouxe fica, inclusive o campo que chegou por fora (outro aparelho, o
   servidor): só os campos do lançamento são escritos. Com o mesmo `em`, a
   mesma entrada dá o mesmo resultado, e aplicada de novo sobre o próprio
   resultado não muda nada (o lote pode repetir uma linha).
   Entrada:
   - data: o dia da entrega. Sem dia válido, erro (a tela avisa antes).
   - alocacao: a divisão de admin e pcp, pronta e conferida pelo componente
     (ALOCUI, com a trava contra outro aparelho). A equipe sai dela.
   - pessoas: a equipe, quando não vai divisão. Lista vazia também grava
     (quem tirou todo mundo confirmou). Ausente, a equipe fica como está.
   - respostasVolta: as perguntas da volta (OPERACAO.PERGUNTAS_VOLTA), só de
     quem confere (quem chama decide). O.S. interna não tem volta. Iguais às
     gravadas, não recarimbam.
   - retrabalho: a resposta da pergunta obrigatória, {resposta: 'nao'} ou
     {resposta: 'sim', problema, etapaOrigem, causaRaiz, responsavelEtapa,
     dataRetrabalho}, com `em` e `por` do carimbo quando vierem. A regra é a
     do perguntarRetrabalho (app.js), com teste de paridade: 'nao' numa O.S.
     marcada desmarca, e quem chama confirma antes, como ele.
   - por, em: quem lança e quando. Padrão: o usuário e agora. */
const CAMPOS_RETRABALHO = ['problema', 'etapaOrigem', 'causaRaiz', 'responsavelEtapa', 'dataRetrabalho'];
function aplicarLancamento(os, e = {}) {
  if (!os || typeof os !== 'object') throw new Error('Esta O.S. não está mais neste aparelho.');
  const data = OPERACAO.dia(e.data);
  if (!data) throw new Error('Informe a data da entrega.');
  const r = e.retrabalho || null;
  const resposta = r && (r.resposta === 'sim' || r.resposta === 'nao') ? r.resposta : '';
  if (r && !resposta) throw new Error('A resposta do retrabalho é Sim ou Não.');
  const texto = k => String((r && r[k]) ?? '').trim();
  if (resposta === 'sim' && CAMPOS_RETRABALHO.some(k => !texto(k))) throw new Error('Preencha os cinco campos do retrabalho.');
  const por = e.por != null ? String(e.por) : ((STATE.user && STATE.user.nome) || '');
  const em = e.em || nowISO();
  const nova = {...os};
  // A equipe: a da divisão quando vai divisão (os.equipe é derivada dela); senão a lista que veio.
  if (e.alocacao && typeof e.alocacao === 'object') {
    nova.alocacao = JSON.parse(JSON.stringify(e.alocacao));
    nova.equipe = typeof DIVISAO !== 'undefined' ? DIVISAO.derivarEquipe(nova.alocacao) : Array.isArray(e.pessoas) ? e.pessoas.slice() : nova.equipe;
  } else if (Array.isArray(e.pessoas)) nova.equipe = e.pessoas.slice();
  // A conferência da volta: só o que mudou recarimba (quem e quando).
  const resp = v => (v === 'sim' || v === 'nao') ? v : '';
  if (e.respostasVolta && typeof e.respostasVolta === 'object' && !OPERACAO.interno(nova)) {
    const respostas = Object.fromEntries(OPERACAO.PERGUNTAS_VOLTA.map(k => [k, resp(e.respostasVolta[k])]));
    const antes = nova.retornoConf || {};
    if (OPERACAO.PERGUNTAS_VOLTA.some(k => respostas[k] !== resp(antes[k]))) {
      const respondeu = OPERACAO.voltaRespondida(respostas);
      nova.retornoConf = {...antes, ...respostas, por: respondeu ? por : '', em: respondeu ? em : ''};
    }
  }
  // O retrabalho, como o perguntarRetrabalho grava.
  if (resposta) {
    if (resposta === 'sim') {
      nova.retrabalho = true;
      for (const k of CAMPOS_RETRABALHO) nova[k] = texto(k);
    } else if (nova.retrabalho || (nova.checkout && nova.checkout.situacao === 'Retrabalho')) {
      nova.retrabalho = false;
      if (nova.checkout && nova.checkout.situacao === 'Retrabalho') nova.checkout = {...nova.checkout, situacao: ''};
      nova.problema = ''; nova.etapaOrigem = ''; nova.causaRaiz = ''; nova.responsavelEtapa = '';
    }
    nova.retrabalhoPerguntado = {em: r.em || em, por: r.por != null ? String(r.por) : por, resposta};
  }
  nova.entregaLancada = {em, por, data};
  nova.atualizadoEm = em;
  nova.atualizadoPor = por;
  return nova;
}
/* A resposta que o perguntarRetrabalho deu, tirada da cópia em que ele
   respondeu. Carimbo novo é resposta de agora; o mesmo carimbo de antes quer
   dizer que ninguém respondeu, e não há o que aplicar. */
function respostaRetrabalhoDe(antes, depois) {
  const p = depois && depois.retrabalhoPerguntado;
  if (!p || typeof p !== 'object' || p === (antes && antes.retrabalhoPerguntado)) return null;
  if (p.resposta !== 'sim' && p.resposta !== 'nao') return null;
  const r = {resposta: p.resposta, em: p.em, por: p.por};
  if (p.resposta === 'sim') for (const k of CAMPOS_RETRABALHO) r[k] = depois[k];
  return r;
}

// Baixa do ERP vira entrega só aqui: alguém confirma data e equipe e responde
// a pergunta obrigatória do retrabalho. Fica carimbado quem lançou.
function lancarEntregaManual(osId) {
  const os = STORE.getOS(osId);
  if (!os) return;
  const cfg = STORE.getCFG();
  const old = document.getElementById('lancar-box'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'lancar-box';
  box.className = 'wpp-picker-overlay';
  /* OS CHIPS SÃO A UNIÃO da lista de instaladores com a equipe gravada na O.S.
     Só a lista de Configurações virava chip: nome da O.S fora dela (variante
     como "Osmane V.", ou quem saiu da lista) não aparecia e, no Continuar, a
     equipe era regravada sem ele. A pessoa perdia a entrega sem aviso. Quem
     está só na O.S entra marcado, com "fora da lista". */
  // Pela pessoa (ID): o chip grava o ID do RH e mostra o nome.
  const eq = new Set(OPERACAO.equipe(os).map(OPERACAO.chavePessoa));
  const chipEquipe = p => { const on = eq.has(p.chave); return `<label class="casa-chip ${on ? 'on' : ''}" title="${esc(p.dica)}"><input type="checkbox" name="equipe" value="${esc(p.valor)}" ${on ? 'checked' : ''}><span>${esc(p.rotulo)}</span>${p.freelancer ? '<small class="tag-freelancer">Freelancer</small>' : ''}${p.fora ? '<small>fora da lista</small>' : ''}</label>`; };
  const chipsEquipe = pessoasDosChips(os).map(chipEquipe).join('')
    || '<p class="text-muted" style="font-size:.8rem">Cadastre instaladores em Configurações.</p>';
  /* O COMPONENTE ÚNICO (F10) no lugar dos chips: parte de quem já está na
     O.S. (nome sem ficha incluído, marcado), com busca tolerante e equipe
     num toque. Admin e pcp gravam a divisão; operação e montagem, só as
     pessoas. Sem o componente (cache velho), os chips de antes. */
  const componente = typeof ALOCUI !== 'undefined';
  const chaveAloc = 'lancar:' + os.id;
  /* A CONFERÊNCIA DA VOLTA também mora aqui: a maioria das O.S. chega
     finalizada pela baixa do ERP, e este é o momento em que a gestão pega
     nelas. Sem isto, carro e equipamentos quase nunca teriam resposta e o
     critério nunca entraria na nota (revisão de 23/09/2026). */
  const gestao = ['admin', 'pcp'].includes(STATE.user && STATE.user.papel);
  const rc = os.retornoConf || {};
  const sel = (nome, valor) => `<select name="${nome}"><option value="" ${!valor ? 'selected' : ''}>Não conferido</option><option value="sim" ${valor === 'sim' ? 'selected' : ''}>Sim</option><option value="nao" ${valor === 'nao' ? 'selected' : ''}>Não</option></select>`;
  // As mesmas perguntas da fila Volta do carro e da ficha (OPERACAO.PERGUNTAS_VOLTA).
  const conferencia = gestao && !OPERACAO.interno(os) ? `<div class="conf-volta-grade">
            ${OPERACAO.PERGUNTAS_VOLTA.map(k => `<div class="field"><label>${esc(VOLTA_ROTULO[k])}</label>${sel(k, OPERACAO.respostaVolta(rc[k]))}</div>`).join('')}
          </div>` : '';
  /* O QUE A EQUIPE REGISTROU no espelho (voltaEquipe): aparece ao lado, para
     o PCP comparar. Os selects acima continuam saindo de retornoConf, nunca
     daqui: a declaração da equipe não responde pela conferência nem conta na nota. */
  const equipeRegistrou = OPERACAO.interno(os) ? ''
    : OPERACAO.voltaRespondida(os.voltaEquipe) ? voltaEquipeHTML(os.voltaEquipe, { fotos: true })
    : '<p class="text-muted" style="font-size:.8rem">A equipe não registrou a limpeza desta volta.</p>';
  /* O dia que o Lançar cita é o da entrega que o ERP baixou (diaDaBaixaERP,
     revisão da E7), e não o dia em que a baixa rodou. O que ele PROPÕE é o
     do Fechar o dia (sugestaoDaBaixaERP, junção da v142): a data da E7; na
     baixa neutra (F16), o retorno ou a agenda só até 7 dias antes da baixa e
     fora de período fechado; senão, o dia da baixa. Ao lado do campo, de
     onde a data veio. */
  const diaBaixa = diaDaBaixaERP(os);
  const sugestao = sugestaoDaBaixaERP(os);
  const diaProposto = sugestao.dia || diaBaixa;
  const origemTxt = sugestao.dia ? textoOrigemSugestaoCasa(sugestao) : '';
  box.innerHTML = `
    <div class="wpp-picker retrab-box" role="dialog" aria-modal="true">
      <div class="wpp-picker-head"><strong>📦 Lançar entrega · O.S ${esc(os.numero || '—')}</strong><button class="modal-close" id="lancar-x">×</button></div>
      <div class="wpp-picker-body">
        <p class="text-muted" style="font-size:.8rem;margin-bottom:8px">${esc(os.cliente || '')} · ${esc(os.servico || '')}. O ERP baixou em ${esc(diaBaixa ? diaBaixa.slice(8, 10) + '/' + diaBaixa.slice(5, 7) : '—')}.</p>
        <form id="lancar-form" class="retrab-form">
          <div class="field"><label>Data da entrega <span class="req">*</span></label><input name="data" type="date" required value="${esc(diaProposto || hojeISO())}">${origemTxt ? `<small class="text-muted lancar-data-origem" id="lancar-data-origem">${esc(origemTxt[0].toUpperCase() + origemTxt.slice(1))}.</small>` : ''}</div>
          <div class="field"><label>Equipe que instalou</label>${componente ? '<div class="aloc-host" id="lancar-aloc"></div>' : `<div class="casa-chips">${chipsEquipe}</div>`}</div>
          ${equipeRegistrou}
          ${conferencia}
          <button class="btn-primary w-100" type="submit">Continuar → pergunta do retrabalho</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(box);
  const campoData = typeof box.querySelector === 'function' ? box.querySelector('#lancar-form input[name="data"]') : null;
  const origemData = origemTxt && typeof box.querySelector === 'function' ? box.querySelector('#lancar-data-origem') : null;
  if (componente) {
    const papel = STATE.user && STATE.user.papel;
    /* A prévia (regra do dia e "não pontua") segue a DATA DIGITADA, não a da
       baixa do ERP, que é a da sincronização (revisão da F16). Ao abrir, o
       campo traz a data SUGERIDA (sugestaoDaBaixaERP: a da E7, o retorno ou
       a agenda na janela curta, ou o dia da baixa), que ninguém digitou: a
       prévia fica sem julgar o prazo (o status da baixa a lançar) até a data
       mudar. */
    ALOCUI.iniciar(chaveAloc, { os, equipes: equipesCadastradasCasa(), papel, modo: ALOCUI.modoPara(papel, os), dica: ALOCUI.dicaModo(papel, os), semAntigo: true, reiniciar: true,
      dia: diaProposto || hojeISO(), valor: typeof valorDaOS === 'function' ? valorDaOS(os) : os.valorTotal, versoes: versoesRegrasCasa() });
    ALOCUI.montar(document.getElementById('lancar-aloc'), chaveAloc);
  }
  if (campoData) campoData.onchange = () => {
    // A origem fala da data sugerida: com outra data no campo, ela some.
    if (origemData) origemData.hidden = campoData.value !== diaProposto;
    if (componente && typeof ALOCUI.definirDataEntrega === 'function') ALOCUI.definirDataEntrega(chaveAloc, campoData.value);
  };
  // Miniaturas da foto do carro que a equipe registrou.
  box.querySelectorAll('[data-foto-img]').forEach(async img => { const b64 = await STORE.pullPhoto(img.dataset.fotoImg); if (b64) img.src = b64; });
  const fechar = () => box.remove();
  document.getElementById('lancar-x').onclick = () => { if (componente) ALOCUI.esquecer(chaveAloc); fechar(); };
  box.querySelectorAll('.casa-chip input').forEach(cb => { cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked); });
  document.getElementById('lancar-form').onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = String(fd.get('data') || '');
    if (!OPERACAO.dia(data)) { toast('Informe a data da entrega.', 'error'); return; }
    const st = componente ? ALOCUI.estado(chaveAloc) : null;
    // Com o componente, a equipe é a que ele mostra (parte de quem já estava na O.S.).
    const equipe = st ? ALOCUI.paraEquipe(chaveAloc).equipe : fd.getAll('equipe').map(String).filter(Boolean);
    const resp = v => (v === 'sim' || v === 'nao') ? v : '';
    const respostas = Object.fromEntries(OPERACAO.PERGUNTAS_VOLTA.map(k => [k, resp(fd.get(k))]));
    // Sem equipe a entrega não conta para ninguém e a conferência da volta
    // fica numa O.S que a nota descarta. E ela sai da fila "a lançar": o erro
    // não volta a aparecer. Pergunta antes. Com o componente, tirar todo mundo
    // também pergunta (senão a equipe antiga ficava, calada).
    if (!equipe.length && (st || !OPERACAO.equipe(os).length) && !OPERACAO.interno(os)
      && !confirm('Lançar sem equipe? A entrega não conta para ninguém e a conferência da volta não entra na nota.')) return;
    // Esconde (não apaga) o formulário: "Voltar" na pergunta do retrabalho
    // devolve a data, a equipe e a conferência como estavam.
    box.style.display = 'none';
    /* A pergunta do retrabalho responde numa CÓPIA, e a resposta vai para o
       aplicarLancamento com o resto (F13): a O.S. só muda na gravação. */
    const rascunho = {...os, checkout: os.checkout && typeof os.checkout === 'object' ? {...os.checkout} : os.checkout};
    perguntarRetrabalho(rascunho, () => {
      fechar();
      /* A EQUIPE NO MESMO ENVIO (F10): a divisão de admin e pcp quando
         mexeram nela; só as pessoas para operação e montagem (a divisão fica
         para a gestão). O que não entra vai no aviso, nunca calado. O
         componente decide sobre uma cópia da O.S., com a trava dele contra a
         mudança feita em outro aparelho; quem escreve é o aplicarLancamento. */
      const avisos = [];
      let alocacao = null, pessoas = null;
      if (st) {
        const alvo = {...os};
        if (st.tocado && st.modo === 'divisao' && equipe.length) {
          const r = ALOCUI.aplicarNaOS(chaveAloc, alvo, { soSeTocou: true });
          if (r.ok && r.estado === 'aplicada') { alocacao = alvo.alocacao; pessoas = alvo.equipe; }
          else if (!r.ok && r.estado === 'conflito') avisos.push(r.mensagem);
          else if (!r.ok) { pessoas = r.equipe || equipe; avisos.push('A equipe foi gravada, mas a divisão não: ' + r.mensagem + ' Complete no Conferir da Performance.'); }
        } else if (st.tocado) {
          const r = ALOCUI.aplicarEquipeNaOS(chaveAloc, alvo);
          if (!r.ok) avisos.push(r.mensagem);
          else {
            pessoas = alvo.equipe;
            if (r.divisaoFica) avisos.push('A equipe mudou: a divisão desta O.S. (líder e percentuais) fica para a gestão refazer.');
          }
        }
        ALOCUI.esquecer(chaveAloc);
      } else if (equipe.length) pessoas = equipe;
      let nova;
      try {
        nova = aplicarLancamento(os, { data, alocacao, pessoas, respostasVolta: conferencia ? respostas : null, retrabalho: respostaRetrabalhoDe(os, rascunho) });
      } catch (err) {
        toast('A entrega não foi lançada: ' + String((err && err.message) || err), 'error');
        return;
      }
      STORE.saveOS(nova);
      toast(`Entrega da O.S ${os.numero || ''} lançada.`, 'success');
      if (avisos.length) toast(avisos.join(' '), 'error');
      renderEntregas();
    }, { rotulo: 'Voltar ao lançamento', aoVoltar: () => { box.style.display = ''; } });
  };
}

// ── Meses do ERP para um intervalo, e o que ainda falta carregar ─────────────
/* O teto era 36 meses e o intervalo hoje pode passar de 80 (um chip por ano
   desde 2020). Teto que corta calado vira número errado com cara de certo: o
   total do período sairia menor e ninguém saberia. Agora o teto cobre o que os
   chips oferecem, e quando ele morde a tela AVISA. */
const TETO_MESES = 12 * 25;
function mesesEntre(de, ate) {
  const out = [];
  let [y, m] = de.slice(0, 7).split('-').map(Number);
  const fim = ate.slice(0, 7);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return out;
  let truncou = true;
  for (let i = 0; i < TETO_MESES; i++) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    out.push(k);
    if (k >= fim) { truncou = false; break; }
    m++; if (m > 12) { m = 1; y++; }
  }
  out.truncou = truncou;
  return out;
}
// O VALOR ENTREGUE vem do ERP (status ENTREGUE, pela data de entrega), todas
// as O.S -- não só as que o PCP conhece, e não pela data da baixa. Pede ao
// servidor os meses que faltam; a tela repinta quando chegam.
//
// TRÊS POR VEZ: cada mês é uma varredura de 25–40 s no Mubisys. Um chip de ano
// pede 12 meses de uma vez; disparar os 12 juntos derruba o ERP e volta tudo
// com erro. A fila anda sozinha — cada pacote que chega repinta a tela e a
// próxima leva sai. Os meses mais RECENTES primeiro: é o que o dono olha.
const ERP_EM_VOO = 3;
/* Qual conjunto de meses já foi pedido em lote nesta sessão. Sem isto, cada
   repintura repetiria o mesmo pedido enquanto a fila lenta ainda não tivesse
   trazido o que falta. */
let _loteEntreguesPedido = '';
function entreguesERP(de, ate) {
  const meses = mesesEntre(de, ate);
  const os = [], faltando = [], comErro = [];
  const vistos = new Set();   // o mesmo número nunca soma duas vezes (pacote de borda de mês)
  for (const m of meses) {
    const pac = STORE.entreguesMes(m);
    if (!pac) {
      // Falhou é diferente de ainda não chegou: um fica em "sem resposta do
      // ERP", o outro em "carregando". Antes os dois viravam "carregando" e o
      // mês recusado ficava girando para sempre sem nada girar.
      if (STORE.entreguesFalhou && STORE.entreguesFalhou(m)) comErro.push(m);
      else faltando.push(m);
      continue;
    }
    for (const o of pac.os || []) {
      if (o.data && (o.data < de || o.data > ate)) continue;
      const k = String(o.numero || '');
      if (vistos.has(k)) continue;
      vistos.add(k); os.push(o);
    }
  }
  /* PRIMEIRO O QUE JÁ ESTÁ GUARDADO NO SERVIDOR, num pedido só.
     O que falta pode estar no cache do servidor mesmo sem estar neste aparelho
     — é o caso de todo aparelho novo, e de toda vez que alguém sai e entra (a
     saída apaga o disco local). Esta porta não vai ao ERP: traz o que existe e
     diz o que não existe, então pode levar o ano inteiro de uma vez. Uma vez
     por combinação de meses, senão o render repetiria o pedido. */
  const aPedir = faltando.concat(comErro);
  if (aPedir.length && STORE.pullEntreguesLote) {
    const chave = aPedir.slice().sort().join('|');
    if (_loteEntreguesPedido !== chave) {
      _loteEntreguesPedido = chave;
      STORE.pullEntreguesLote(aPedir).then(r => {
        // O que o servidor também não tem só pode vir do ERP, pela fila lenta.
        if (r && r.faltando && r.faltando.length && STORE.garantirEntregues) STORE.garantirEntregues(r.faltando);
      }).catch(() => {});
    }
  }
  /* A FILA MORA NO STORE. O teto de 3 era por CHAMADA e renderEntregas chama
     esta função três vezes (hoje, mês, ano): um chip de ano passado disparava
     seis varreduras de uma vez sobre um ERP que já anda no limite, e mês que
     volta com timeout é justamente o que trava o carregamento. Agora a tela só
     diz do que precisa; quem dosa é quem sabe quantas estão em voo. */
  if (STORE.garantirEntregues) STORE.garantirEntregues(aPedir.slice().sort().reverse());
  else for (const m of aPedir.slice(0, ERP_EM_VOO)) STORE.pullEntreguesMes(m);
  // Mês corrente: renova em silêncio quando envelhece (o store decide).
  const hojeMes = OPERACAO.dia(new Date()).slice(0, 7);
  if (meses.includes(hojeMes) && STORE.entreguesMes(hojeMes)) STORE.pullEntreguesMes(hojeMes);
  return { os, faltando, comErro, meses, truncou: !!meses.truncou };
}

// Ao abrir Entregas, usar o mês vigente, do dia 1 até hoje (19/09/2026).
// A navegação limpa o período; repinturas preservam a escolha feita na tela.
function periodoEntregas() {
  if (!STATE._fEnt) {
    const hoje = OPERACAO.dia(new Date());
    STATE._fEnt = { de: hoje.slice(0, 7) + '-01', ate: hoje };
  }
  return STATE._fEnt;
}
/* UM CHIP PARA CADA ANO QUE EXISTE (pedido do dono, 14/09/2026).
   A lista vem do BANCO — a ação `valores` traz os anos de `painel_ordens`
   junto — e não de uma constante aqui. A versão anterior chutava três anos
   enquanto o cache guardava dois, e o chip do ano mais antigo pedia ao ERP
   em laço infinito. Agora o cache guarda todos (IndexedDB) e a régua é uma só.
   Enquanto o servidor não responde, só o ano corrente: melhor faltar chip do
   que oferecer um ano que talvez não exista. */
function anosEntregas() {
  const atual = Number(OPERACAO.dia(new Date()).slice(0, 4));
  const doStore = (STORE.anosEntregues ? STORE.anosEntregues() : []) || [];
  return doStore.length ? doStore : [atual];
}
function chipsPeriodoEntregas(f) {
  const hoje = OPERACAO.dia(new Date());
  const ano = (f.de || hoje).slice(0, 4);
  const mesmoMes = f.de && f.ate && f.de.slice(0, 7) === f.ate.slice(0, 7);
  const mes = mesmoMes ? f.de.slice(5, 7) : '';
  return `<div class="ent-periodo">
    <label>Ano<select id="ent-ano">${anosEntregas().map(a => `<option value="${a}" ${String(a) === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    <label>Mês<select id="ent-mes"><option value="">Ano inteiro</option>${MES_CURTO.map((m, i) => { const n = String(i + 1).padStart(2, '0'); return `<option value="${n}" ${n === mes ? 'selected' : ''} ${ano + '-' + n > hoje.slice(0, 7) ? 'disabled' : ''}>${m}</option>`; }).join('')}</select></label>
    <button type="button" class="btn-ghost btn-sm" data-per-de="${hoje.slice(0, 7)}-01" data-per-ate="${hoje}">Este mês</button>
    <details class="ent-personalizar" ${STATE._entPersAberto ? 'open' : ''}><summary>Outras datas</summary><div class="periodo-filtro" data-pf="_fEnt"><label>De<input type="date" class="pf-de" value="${esc(f.de || '')}"></label><label>Até<input type="date" class="pf-ate" value="${esc(f.ate || '')}"></label></div></details>
    <span class="ent-intervalo">${f.de ? 'De ' + esc(f.de.split('-').reverse().join('/')) : 'Do início'} a ${esc(f.ate ? f.ate.split('-').reverse().join('/') : 'hoje')}</span>
  </div>`;
}

/* TODOS OS MESES QUE EXISTEM, do primeiro ano que o banco conhece até hoje. */
function mesesTodosEntregas() {
  const hoje = OPERACAO.dia(new Date()).slice(0, 7);
  const meses = [];
  for (const ano of (STORE.anosEntregues ? STORE.anosEntregues() : [])) {
    for (let m = 1; m <= 12; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`;
      if (k <= hoje) meses.push(k);
    }
  }
  return meses;
}

/* A BARRA DE CARGA: quanto já está gravado no aparelho, e o botão de completar.
   Fica logo abaixo dos chips porque é ali que a pergunta nasce — "troquei o mês
   e não mudou" quase sempre é "este mês nunca foi baixado". O preço vai dito na
   frente: varrer o ERP custa 25-40 s por mês, e ninguém deve disparar meia hora
   de ERP sem saber. */
function barraCargaEntregas() {
  const meses = mesesTodosEntregas();
  if (!meses.length) return '';
  const guardados = meses.filter(m => STORE.entreguesMes && STORE.entreguesMes(m)).length;
  const faltam = meses.length - guardados;
  const p = STORE.progressoEntregues ? STORE.progressoEntregues() : null;
  const rodando = !!(p && !p.fim);
  if (rodando) {
    const etapa = p.etapa === 'servidor' ? 'buscando o que o servidor já tem…' : 'varrendo o ERP, três meses por vez';
    return `<p class="metricas-nota casa-carga">⏳ <strong>${p.prontos}</strong> de ${p.total} meses guardados · ${esc(etapa)}${p.parar ? ' · parando…' : ''}${p.erros.length ? ` · <span class="badge sem-valor">${p.erros.length} sem resposta</span>` : ''}
      <button class="btn-ghost btn-xs" data-carga-parar="1">Parar</button>
      <small>Pode sair da tela: o carregamento continua sozinho.</small></p>`;
  }
  if (!faltam) {
    return `<p class="metricas-nota casa-carga"><strong>${meses.length}</strong> meses disponíveis neste aparelho. Armazenamento não comprova a integridade dos valores históricos${p && p.erros.length ? ` · <span class="badge sem-valor">${p.erros.length} mês(es) não responderam</span>` : ''}.
      <button class="btn-ghost btn-xs edit-only" data-carga-tudo="1">Atualizar cópia local</button></p>`;
  }
  return `<p class="metricas-nota casa-carga"><strong>${guardados}</strong> de ${meses.length} meses gravados neste aparelho · faltam <strong>${faltam}</strong>.
    Mês que não está aqui não muda a tela quando você toca no chip: ele precisa ser baixado primeiro.
    <button class="btn-primary btn-xs edit-only" data-carga-tudo="1">Baixar tudo e guardar</button>
    <small>O que o servidor já tem vem num pedido só; o resto custa 25-40 s por mês no ERP.</small></p>`;
}

/* ── Relatórios de entrega ────────────────────────────────────────────────
   Tudo aqui lê o mesmo pacote do ERP que os KPIs — nenhum número novo nasce
   de outra conta. Quadros recolhíveis, escolha guardada no aparelho. */
/* O PRAZO DE ENTREGA (SLA): quanto do que saiu, saiu no dia combinado.
 *
 * A régua é a PREVISÃO do ERP (`data_entrega`, o prazo combinado com o cliente)
 * contra a ENTREGA REAL (`data_entregue`, quando a O.S de fato saiu). São dois
 * campos diferentes do mesmo registro, e confundir os dois já derrubou janeiro
 * de 165 para 135 entregas — por isso a conta nunca deduz um do outro.
 *
 * DUAS FONTES PARA A PREVISÃO, nesta ordem:
 *   1. `previsao` no pacote mensal do ERP (v3) — vale para qualquer mês;
 *   2. `previsaoEntrega` do card do PCP — só para as O.S que o aparelho ainda
 *      guarda (abertas + finalizadas de 60 dias).
 * Sem as duas, a O.S entra como SEM RÉGUA e é CONTADA à parte. Medir
 * pontualidade só no pedaço que tem prazo, e anunciar o número como se fosse do
 * período inteiro, seria inventar um resultado: em junho a segunda fonte cobria
 * 20% das entregas, e antes de maio, nenhuma.
 *
 * DIAS CORRIDOS, não úteis: o prazo do ERP é somado em dias corridos, então
 * medir em dias úteis compararia duas réguas diferentes e daria atraso menor do
 * que o cliente esperou de verdade.
 *
 * ATRASO É SÓ O QUE PASSOU DO PRAZO. Entregar adiantado não compensa entrega
 * atrasada na média — a média dos atrasados responde "quando atrasa, atrasa
 * quanto?", que é a pergunta que muda a promessa do vendedor.
 */
const SLA_FAIXAS = [
  { de: 1, ate: 1, rotulo: '1 dia' },
  { de: 2, ate: 2, rotulo: '2 dias' },
  { de: 3, ate: 3, rotulo: '3 dias' },
  { de: 4, ate: 4, rotulo: '4 dias' },
  { de: 5, ate: 5, rotulo: '5 dias' },
  { de: 6, ate: 10, rotulo: '6 a 10 dias' },
  { de: 11, ate: 20, rotulo: '11 a 20 dias' },
  { de: 21, ate: Infinity, rotulo: '21 dias ou mais' },
];

/* DATA DE VERDADE, não só no formato. "2026-13-45" passa em qualquer regex de
   4-2-2 e, comparado como texto, é maior que qualquer prazo — viraria o pior
   atraso do quadro. Só vale o que o calendário aceita de volta igual. */
function diaSlaValido(v) {
  const d = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const dt = new Date(d + 'T12:00:00Z');
  return (Number.isFinite(+dt) && dt.toISOString().slice(0, 10) === d) ? d : '';
}

/* Dias corridos entre duas datas, em UTC. Meio-dia e UTC de propósito: com hora
   zero e fuso local, o horário de verão faz uma das pontas cair no dia anterior
   e o atraso sai com um dia a mais ou a menos. */
function diasEntreSla(de, ate) {
  return Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);
}

function slaEntregas(lista, porNumero) {
  const atrasos = [];
  let comRegua = 0, semRegua = 0, emDia = 0, adiantadas = 0;
  for (const o of lista || []) {
    const entregue = diaSlaValido(o && o.data);
    const card = porNumero ? porNumero.get(String((o && o.numero) || '').trim()) : null;
    const previsto = diaSlaValido((o && o.previsao) || (card && card.previsaoEntrega));
    if (!entregue || !previsto) { semRegua++; continue; }
    comRegua++;
    const d = diasEntreSla(previsto, entregue);
    if (d <= 0) { emDia++; if (d < 0) adiantadas++; continue; }
    atrasos.push(d);
  }
  atrasos.sort((a, b) => a - b);
  const soma = atrasos.reduce((s, d) => s + d, 0);
  const faixas = SLA_FAIXAS.map(f => ({
    rotulo: f.rotulo,
    n: atrasos.filter(d => d >= f.de && d <= f.ate).length,
  }));
  return {
    total: (lista || []).length,
    comRegua, semRegua, emDia, adiantadas,
    atrasadas: atrasos.length,
    // Sem régua nenhuma não há percentual: null é "não dá para medir", e 0%
    // seria a afirmação oposta — a de que nada saiu no prazo.
    pctEmDia: comRegua ? Math.round(emDia / comRegua * 1000) / 10 : null,
    mediaAtraso: atrasos.length ? Math.round(soma / atrasos.length * 10) / 10 : null,
    // A média do período INTEIRO conta quem saiu no prazo como zero: é o número
    // que responde "quanto a casa atrasa, em geral" sem o viés de olhar só os
    // atrasados. Os dois juntos porque cada um responde uma pergunta diferente.
    mediaGeral: comRegua ? Math.round(soma / comRegua * 10) / 10 : null,
    // A MEDIANA porque a média mente quando há cauda: uma O.S de 50 dias puxa
    // a média de 300 entregas e some na mediana, que é onde a maioria está.
    medianaAtraso: atrasos.length ? atrasos[Math.floor((atrasos.length - 1) / 2)] : null,
    pior: atrasos.length ? atrasos[atrasos.length - 1] : null,
    faixas,
  };
}

/* ---------------------------------------------------------------- TENDÊNCIA
 * Pedido do dono (15/09/2026): "aqui em baixo ter todos os meses e ao final uma
 * aba de relatório que posso puxar de todos os anos, ver as tendências etc".
 *
 * A conta é pura e trabalha sobre o RESUMO (uma linha por mês, agregada no
 * servidor a partir dos mesmos pacotes que a tela já soma). Nada aqui inventa
 * número: mês sem pacote guardado não vira zero, vira buraco declarado — um
 * zero calado num gráfico de tendência desenha uma queda que nunca houve.
 */
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function tendenciaEntregas(resumo, mesHoje) {
  const linhas = (resumo && resumo.meses) || [];
  const faltando = new Set((resumo && resumo.faltando) || []);
  const porMes = new Map(linhas.map(l => [l.mes, l]));
  const anos = [...new Set(linhas.map(l => String(l.mes).slice(0, 4)))].sort();
  const hoje = String(mesHoje || '').slice(0, 7);
  const mesDoAno = hoje ? Number(hoje.slice(5, 7)) : 12;

  const porAno = anos.map(ano => {
    const doAno = linhas.filter(l => l.mes.startsWith(ano));
    const valor = doAno.reduce((t, l) => t + (l.valor || 0), 0);
    const os = doAno.reduce((t, l) => t + (l.os || 0), 0);
    const semDado = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`;
      if (hoje && k > hoje) continue;              // futuro não é buraco
      if (!porMes.has(k)) semDado.push(k);
    }
    /* MESMO PERÍODO: comparar um ano de nove meses com um de doze é a
       comparação errada, e é a que aparece sozinha se ninguém cuidar. O
       acumulado até o mesmo mês responde "estamos melhores que no ano passado
       a esta altura?", que é a pergunta de quem olha.
       SÓ MESES FECHADOS: o mês corrente está pela metade, e no dia 2 de janeiro
       eram dois dias contra janeiro inteiro do ano anterior (uns -95%). */
    const ate = doAno.filter(l => !hoje || Number(l.mes.slice(5, 7)) < mesDoAno);
    return {
      ano,
      valor: Math.round(valor * 100) / 100,
      os,
      meses: doAno.length,
      semDado,
      mesmoPeriodo: Math.round(ate.reduce((t, l) => t + (l.valor || 0), 0) * 100) / 100,
      mesesMesmoPeriodo: ate.length,
      // Prazo do ano, quando há régua.
      comPrazo: doAno.reduce((t, l) => t + (l.comPrazo || 0), 0),
      noPrazo: doAno.reduce((t, l) => t + (l.noPrazo || 0), 0),
    };
  });

  /* Variação contra o ano anterior, sempre no MESMO período — e, quando não dá
     para comparar, dizendo por quê. "—" sozinho faz o leitor supor queda; um
     ano cujo período nem foi carregado não é um ano ruim, é um ano ausente. */
  for (let i = 1; i < porAno.length; i++) {
    const a = porAno[i], b = porAno[i - 1];
    if (String(Number(b.ano) + 1) !== a.ano) { a.porQueNaoCompara = `não há ${Number(a.ano) - 1} carregado`; continue; }
    if (!a.mesesMesmoPeriodo) { a.porQueNaoCompara = hoje && mesDoAno === 1 ? 'ainda não há mês fechado neste ano' : 'este ano não tem mês carregado no período'; continue; }
    if (!b.mesesMesmoPeriodo || b.mesmoPeriodo <= 0) {
      a.porQueNaoCompara = `${b.ano} não tem nenhum mês carregado até o mesmo mês`;
      continue;
    }
    a.variacao = Math.round((a.mesmoPeriodo / b.mesmoPeriodo - 1) * 1000) / 10;
    a.compara = b.ano;
    // Comparar 9 meses com 3 seria o mesmo erro de outra forma.
    if (a.mesesMesmoPeriodo !== b.mesesMesmoPeriodo) {
      a.avisoCobertura = `${a.mesesMesmoPeriodo} mês(es) contra ${b.mesesMesmoPeriodo}`;
    }
  }

  /* SAZONALIDADE: quanto cada mês do calendário costuma render, em média dos
     anos que têm aquele mês. O mês corrente fica de fora: está pela metade e
     puxaria a própria média para baixo. */
  const sazonal = MES_CURTO.map((rotulo, i) => {
    const n = i + 1;
    const doMes = linhas.filter(l => Number(l.mes.slice(5, 7)) === n && l.mes !== hoje);
    const media = doMes.length ? doMes.reduce((t, l) => t + (l.valor || 0), 0) / doMes.length : null;
    return { n, rotulo, media: media === null ? null : Math.round(media * 100) / 100, anos: doMes.length };
  });

  /* PARA ONDE ESTÁ INDO: reta de mínimos quadrados sobre os 12 meses fechados
     mais recentes (o mês corrente está incompleto e viraria uma queda falsa).
     Só afirma direção com pelo menos 6 meses — abaixo disso a reta é ruído. */
  const fechados = linhas.filter(l => !hoje || l.mes < hoje).slice(-12);
  let tendencia = null;
  if (fechados.length >= 6) {
    const n = fechados.length;
    const mx = (n - 1) / 2;
    const my = fechados.reduce((t, l) => t + (l.valor || 0), 0) / n;
    let num = 0, den = 0;
    fechados.forEach((l, i) => { num += (i - mx) * ((l.valor || 0) - my); den += (i - mx) * (i - mx); });
    const inclinacao = den ? num / den : 0;           // R$ por mês
    const pct = my ? Math.round(inclinacao / my * 1000) / 10 : 0;
    tendencia = {
      meses: n,
      porMes: Math.round(inclinacao * 100) / 100,
      pct,
      // Abaixo de 1% ao mês, dizer "subindo" seria ler ruído como notícia.
      direcao: Math.abs(pct) < 1 ? 'estável' : (pct > 0 ? 'subindo' : 'caindo'),
      media: Math.round(my * 100) / 100,
    };
  }

  const comValor = linhas.filter(l => (l.valor || 0) > 0);
  const melhor = comValor.slice().sort((a, b) => b.valor - a.valor)[0] || null;
  const pior = comValor.slice().sort((a, b) => a.valor - b.valor)[0] || null;

  return {
    anos, porAno, sazonal, tendencia, melhor, pior,
    totalMeses: linhas.length,
    semDado: [...faltando],
    porMes,
  };
}

function rotuloMesTend(mes) {
  const m = Number(String(mes).slice(5, 7));
  return (MES_CURTO[m - 1] || '?') + '/' + String(mes).slice(2, 4);
}

/* QUANTA GENTE A CASA TINHA — do RH, só contagem.
 * Pedido do dono: "adicionar a qntd de funcionarios ativos na epoca ate pra
 * gente entender". O uso é ler faturamento junto com tamanho: R$ 400 mil com 30
 * pessoas não é R$ 400 mil com 45.
 *
 * O RH da casa só passou a registrar DESLIGAMENTO em 2025. Para meses
 * anteriores, quem saiu antes nunca foi cadastrado — a contagem é um PISO, e a
 * tela marca isso com "+". Número sem essa marca faria a empresa parecer menor
 * do que era, e a leitura de produtividade sairia invertida. */
function equipeDoMes(mes) {
  const h = STORE.equipeHistorico ? STORE.equipeHistorico() : null;
  if (!h || !Array.isArray(h.meses)) return null;
  return h.meses.find(l => l.mes === mes) || null;
}
function equipeDoAno(ano) {
  const h = STORE.equipeHistorico ? STORE.equipeHistorico() : null;
  if (!h || !Array.isArray(h.meses)) return null;
  const doAno = h.meses.filter(l => String(l.mes).startsWith(ano));
  if (!doAno.length) return null;
  const media = doAno.reduce((t, l) => t + (l.total || 0), 0) / doAno.length;
  return {
    media: Math.round(media * 10) / 10,
    piso: doAno.some(l => l.piso),
    meses: doAno.length,
  };
}
function equipeDoAnoHTML(ano) {
  const e = equipeDoAno(ano);
  if (!e) return '<span class="text-muted">—</span>';
  const n = String(e.media).replace('.', ',');
  return e.piso
    ? `<span title="o RH só registra saídas a partir de ${(STORE.equipeHistorico() || {}).desdeQuando || '2025'}; quem saiu antes não está cadastrado, então isto é um mínimo">${n}+</span>`
    : n;
}

/* O QUADRO DA EQUIPE: quanta gente, por área, e quanto cada um entregou. */
function equipeHistoricoHTML(t) {
  const h = STORE.equipeHistorico ? STORE.equipeHistorico() : null;
  if (!h) return '<p class="text-muted">Carregando o tamanho da equipe…</p>';
  if (h.erro) return '<p class="text-muted">O tamanho da equipe não veio do RH nesta sessão.</p>';
  if (!h.meses.length) return '<p class="text-muted">O RH não tem ficha com data de admissão.</p>';
  const areas = h.areas || [];
  const anos = t.anos.slice().reverse();
  const linhas = anos.map(ano => {
    const e = equipeDoAno(ano);
    const fat = (t.porAno.find(a => a.ano === ano) || {});
    const doAno = h.meses.filter(l => String(l.mes).startsWith(ano));
    const porArea = {};
    for (const a of areas) {
      const soma = doAno.reduce((tot, l) => tot + ((l.porArea || {})[a] || 0), 0);
      porArea[a] = doAno.length ? Math.round(soma / doAno.length * 10) / 10 : 0;
    }
    /* POR PESSOA só quando os dois lados cobrem o mesmo período. Dividir o
       faturamento de 3 meses pela equipe média de 12 daria um número que não
       significa nada — e number que não significa nada é o que mais engana. */
    const podeDividir = e && fat.meses && fat.meses === e.meses && e.media > 0;
    return { ano, e, fat, porArea, porPessoa: podeDividir ? fat.valor / e.media : null };
  });
  return `<div class="casa-tabela-wrap"><table class="casa-tabela">
    <thead><tr><th>Ano</th><th class="num">Equipe média</th>${areas.map(a => `<th class="num">${esc(a)}</th>`).join('')}<th class="num">Faturado por pessoa</th></tr></thead>
    <tbody>${linhas.map(l => `<tr>
      <td><strong>${esc(l.ano)}</strong></td>
      <td class="num">${l.e ? `${String(l.e.media).replace('.', ',')}${l.e.piso ? '+' : ''}` : '—'}</td>
      ${areas.map(a => `<td class="num">${l.porArea[a] ? String(l.porArea[a]).replace('.', ',') : '<span class="text-muted">—</span>'}</td>`).join('')}
      <td class="num">${l.porPessoa === null ? '<span class="text-muted" title="faturamento e equipe cobrem períodos diferentes neste ano">—</span>' : dinheiroCurto(l.porPessoa)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:.8rem">Gente ativa pela ficha do RH (admissão e desligamento), média dos meses do ano, por área. <strong>+</strong> quer dizer mínimo: o RH só registra saída a partir de ${esc(h.desdeQuando || '2025')}, então quem saiu antes disso não está na conta. "Faturado por pessoa" só aparece quando o ano tem faturamento e equipe no mesmo período.</p>`;
}

/* A SEÇÃO DO FINAL DA TELA: todos os meses, e o que eles dizem juntos. */
function relatorioAnosHTML() {
  const resumo = STORE.resumoEntregues ? STORE.resumoEntregues() : null;
  const aba = STATE._entRel === 'anos' ? 'anos' : 'meses';
  const botoes = `<span class="casa-vista">
      <button class="btn-ghost btn-sm ${aba === 'meses' ? 'active' : ''}" data-ent-rel="meses">Mês a mês</button>
      <button class="btn-ghost btn-sm ${aba === 'anos' ? 'active' : ''}" data-ent-rel="anos">Anos e tendência</button>
    </span>`;
  if (!resumo) {
    return `<section class="casa-relatorios">
      <h3>📈 Histórico completo</h3>
      <p class="text-muted" style="font-size:.8rem">Carregando o mês a mês de todos os anos…</p>
    </section>`;
  }
  const t = tendenciaEntregas(resumo, OPERACAO.dia(new Date()).slice(0, 7));
  const hoje = OPERACAO.dia(new Date()).slice(0, 7);

  /* A GRADE ANO × MÊS: 12 colunas, uma linha por ano. Célula vazia é "—" com
     dica, nunca R$ 0 — é a diferença entre "não vendemos" e "não perguntamos".

     MOSTRA TODOS OS ANOS QUE O BANCO DIZ EXISTIR, não só os que já foram
     carregados. Esconder 2020-2024 porque o servidor ainda não tem o pacote
     deles faria a tela afirmar que a empresa começou em 2025. O ano vazio
     aparece com o botão de carregar e o preço declarado (25-40 s por mês). */
  const anosChips = (STORE.anosEntregues ? STORE.anosEntregues() : []).map(String);
  const anosDesc = [...new Set(anosChips.concat(t.anos))].sort().reverse();
  const grade = `<div class="casa-tabela-wrap"><table class="casa-tabela casa-grade-meses">
    <thead><tr><th>Ano</th>${MES_CURTO.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th><th class="num" title="média de gente ativa no ano, pela ficha do RH">Equipe</th></tr></thead>
    <tbody>${anosDesc.map(ano => {
      const linha = t.porAno.find(a => a.ano === ano) || null;
      if (!linha) {
        // Ano inteiro sem nada guardado: uma linha só, com o preço na frente.
        return `<tr><td><strong>${esc(ano)}</strong></td>
          <td colspan="14" class="text-muted">nenhum mês carregado
            <button class="btn-ghost btn-xs edit-only" data-carregar-ano="${esc(ano)}">carregar ${esc(ano)} do ERP</button>
            <small>leva 25-40 s por mês</small></td></tr>`;
      }
      return `<tr>
        <td><strong>${esc(ano)}</strong></td>
        ${MES_CURTO.map((_, i) => {
          const k = `${ano}-${String(i + 1).padStart(2, '0')}`;
          const l = t.porMes.get(k);
          if (k > hoje) return '<td class="num text-muted"></td>';
          if (!l) return '<td class="num text-muted" title="sem dado guardado para este mês">—</td>';
          const parcial = k === hoje ? ' title="mês em andamento"' : '';
          return `<td class="num"${parcial}><button class="btn-link btn-mes-ent" data-mes-ent="${k}">${dinheiroCurto(l.valor)}${k === hoje ? '*' : ''}</button></td>`;
        }).join('')}
        <td class="num"><strong>${dinheiroCurto(linha.valor)}</strong>${linha.semDado.length ? ` <span class="badge sem-valor" title="${linha.semDado.join(', ')}">${linha.semDado.length} sem dado</span> <button class="btn-ghost btn-xs edit-only" data-carregar-ano="${esc(ano)}">completar</button>` : ''}</td>
        <td class="num">${equipeDoAnoHTML(ano)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:.8rem">Toque num mês para abrir o período dele acima. <strong>*</strong> mês em andamento. Traço é mês sem pacote guardado, e não é venda zero.${t.semDado.length ? ` Faltam <strong>${t.semDado.length}</strong> mês${t.semDado.length === 1 ? '' : 'es'} no servidor; cada um leva 25-40 s para o ERP montar.` : ''}</p>`;

  const barrasAno = barrasCasa(
    t.porAno.slice().reverse().map(a => ({
      rotulo: a.ano, valor: a.valor,
      extra: `${a.os} O.S · ${a.meses} mês${a.meses === 1 ? '' : 'es'}${a.semDado.length ? ` · ${a.semDado.length} sem dado` : ''}`,
    })), dinheiroCurto) || '<p class="text-muted">Sem dado de ano nenhum.</p>';

  const comparativo = `<div class="casa-tabela-wrap"><table class="casa-tabela">
    <thead><tr><th>Ano</th><th class="num">Total do ano</th><th class="num">${Number(hoje.slice(5, 7)) > 1 ? 'Até ' + MES_CURTO[Number(hoje.slice(5, 7)) - 2] : 'Meses fechados'}</th><th class="num">vs. ano anterior</th><th class="num">No prazo</th></tr></thead>
    <tbody>${t.porAno.slice().reverse().map(a => {
      const v = a.variacao;
      const cor = v === undefined ? '' : (v >= 0 ? 'st-confirmada' : 'sem-valor');
      return `<tr>
        <td><strong>${esc(a.ano)}</strong>${a.semDado.length ? ` <span class="badge sem-valor" title="${a.semDado.join(', ')}">parcial</span>` : ''}</td>
        <td class="num">${dinheiroCasa(a.valor)}</td>
        <td class="num">${a.mesesMesmoPeriodo
          ? `${dinheiroCasa(a.mesmoPeriodo)} <small class="text-muted">${a.mesesMesmoPeriodo} m</small>`
          : '<span class="text-muted" title="nenhum mês deste período está carregado; não é venda zero">—</span>'}</td>
        <td class="num">${v === undefined
          ? `<span class="text-muted" title="${esc(a.porQueNaoCompara || 'sem ano anterior carregado para comparar')}">sem base</span>`
          : `<span class="badge ${cor}">${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%</span> <small class="text-muted">vs ${esc(a.compara)}</small>`}</td>
        <td class="num">${a.comPrazo ? Math.round(a.noPrazo / a.comPrazo * 100) + '%' : '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:.8rem">A comparação é sempre do <strong>mesmo período</strong>, só com meses fechados: ${Number(hoje.slice(5, 7)) > 1 ? `o acumulado até ${MES_CURTO[Number(hoje.slice(5, 7)) - 2]} de cada ano` : 'em janeiro ainda não há mês fechado para comparar'}. O mês corrente fica de fora porque está pela metade.</p>`;

  const kpiLinha = (rotulo, valor, nota) => `<div class="casa-kpi"><b>${valor}</b><small>${esc(rotulo)}${nota ? ` · ${esc(nota)}` : ''}</small></div>`;
  const tend = t.tendencia;
  const kpis = `<div class="casa-kpi-cards">
      ${kpiLinha('para onde vai', tend ? tend.direcao : '—', tend ? `${tend.pct > 0 ? '+' : ''}${String(tend.pct).replace('.', ',')}% ao mês nos últimos ${tend.meses}` : 'menos de 6 meses fechados')}
      ${kpiLinha('média mensal', tend ? dinheiroCurto(tend.media) : '—', tend ? `últimos ${tend.meses} meses fechados` : '')}
      ${kpiLinha('melhor mês', t.melhor ? dinheiroCurto(t.melhor.valor) : '—', t.melhor ? rotuloMesTend(t.melhor.mes) : '')}
      ${kpiLinha('meses guardados', String(t.totalMeses), t.semDado.length ? `${t.semDado.length} sem dado` : 'sem buraco')}
    </div>`;

  const sazonalHTML = barrasCasa(
    t.sazonal.filter(m => m.media !== null).map(m => ({
      rotulo: m.rotulo, valor: m.media, extra: `média de ${m.anos} ano${m.anos === 1 ? '' : 's'}`,
    })), dinheiroCurto) || '<p class="text-muted">Ainda não há anos suficientes para uma média por mês.</p>';

  const corpo = aba === 'meses' ? grade : `${kpis}
    ${quadroCasa('ent-anos-comp', '📊 Ano a ano, no mesmo período', comparativo, true)}
    ${quadroCasa('ent-anos-barras', '📈 Total por ano', barrasAno, false)}
    ${quadroCasa('ent-anos-sazonal', '🗓️ Como costuma ser cada mês <small>média dos anos</small>', sazonalHTML, false)}
    ${quadroCasa('ent-anos-equipe', '👥 Quanta gente a casa tinha <small>do RH, por área</small>', equipeHistoricoHTML(t), true)}`;

  return `<section class="casa-relatorios">
    <div class="casa-pagina-head" style="align-items:center">
      <h3 style="margin:0">📈 Histórico completo</h3>
      ${botoes}
    </div>
    <p class="text-muted" style="font-size:.8rem">Todos os meses que o servidor tem guardados, somados do mesmo pacote do ERP que alimenta os números acima. Não vai ao ERP: é leitura do que já foi carregado.${resumo.erro ? ` <span class="badge sem-valor">a última atualização falhou</span>` : ''}</p>
    ${corpo}
  </section>`;
}

function prazoEntregasHTML(lista, porNumero) {
  const s = slaEntregas(lista, porNumero);
  const kpiLinha = (rotulo, valor, nota) => `<div class="casa-kpi"><b>${valor}</b><small>${rotulo}${nota ? ` · ${nota}` : ''}</small></div>`;
  if (!s.comRegua) {
    return `<section class="casa-relatorios">
      <h3>⏱️ Prazo de entrega</h3>
      <p class="text-muted" style="font-size:.8rem">Nenhuma das ${s.total} O.S do período tem prazo combinado gravado, então não dá para medir pontualidade aqui. O prazo entra no pacote do ERP quando o mês é remontado (mês fechado vale 24 h).</p>
    </section>`;
  }
  const cobertura = Math.round(s.comRegua / (s.total || 1) * 100);
  const barras = barrasCasa(
    [{ rotulo: 'no prazo', valor: s.emDia, extra: s.adiantadas ? `${s.adiantadas} adiantada${s.adiantadas === 1 ? '' : 's'}` : '' }]
      .concat(s.faixas.map(f => ({ rotulo: f.rotulo, valor: f.n, extra: `${Math.round(f.n / s.comRegua * 100)}%` }))),
    v => `${v} O.S`
  );
  return `<section class="casa-relatorios">
    <h3>⏱️ Prazo de entrega</h3>
    <p class="text-muted" style="font-size:.8rem">Prazo combinado no ERP contra a data em que a O.S saiu, em dias corridos. ${s.comRegua} de ${s.total} O.S do período têm prazo gravado (${cobertura}%)${s.semRegua ? ` · <strong>${s.semRegua}</strong> ficaram de fora da conta por não ter prazo` : ''}. Inclui retiradas no balcão.</p>
    <div class="casa-kpi-cards">
      ${kpiLinha('entregues no prazo', `${String(s.pctEmDia).replace('.', ',')}%`, `${s.emDia} de ${s.comRegua} O.S`)}
      ${kpiLinha('média de atraso', s.mediaAtraso === null ? '—' : `${String(s.mediaAtraso).replace('.', ',')} d`, s.atrasadas ? `nas ${s.atrasadas} que atrasaram` : 'nenhuma atrasou')}
      ${kpiLinha('atraso típico', s.medianaAtraso === null ? '—' : `${s.medianaAtraso} d`, 'mediana das atrasadas')}
      ${kpiLinha('média geral', s.mediaGeral === null ? '—' : `${String(s.mediaGeral).replace('.', ',')} d`, 'contando as do prazo como zero')}
    </div>
    ${quadroCasa('ent-sla-faixas', '📉 Quantos dias de atraso', `${barras || '<p class="text-muted">Sem atraso no período.</p>'}
      <p class="text-muted" style="font-size:.8rem">${s.pior !== null ? `Pior caso do período: <strong>${s.pior} dia${s.pior === 1 ? '' : 's'}</strong> de atraso. ` : ''}O prazo lido é o que está no ERP HOJE: prazo renegociado com o cliente e regravado lá aparece como entrega no prazo.</p>`, true)}
  </section>`;
}

function relatoriosEntregasHTML(lista, porNumero, estadoPCP) {
  if (!lista.length) return '';
  const val = o => (o.valor !== null && Number.isFinite(Number(o.valor))) ? Number(o.valor) : 0;
  const temValor = o => o.valor !== null && Number.isFinite(Number(o.valor));
  const total = lista.reduce((s, o) => s + val(o), 0);
  const comValor = lista.filter(temValor).length;
  const agrupar = (chaveDe, limite) => {
    const m = new Map();
    for (const o of lista) {
      const k = (chaveDe(o) || '—').trim() || '—';
      const d = m.get(k) || { rotulo: k, valor: 0, n: 0 };
      d.valor += val(o); d.n++; m.set(k, d);
    }
    const arr = [...m.values()].sort((a, b) => b.valor - a.valor || b.n - a.n);
    return limite ? arr.slice(0, limite) : arr;
  };

  // 1. Mês a mês
  const porMes = new Map();
  for (const o of lista) {
    const k = String(o.data || '').slice(0, 7) || '—';
    const d = porMes.get(k) || { rotulo: k, valor: 0, n: 0 };
    d.valor += val(o); d.n++; porMes.set(k, d);
  }
  const meses = [...porMes.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  const mesesHTML = barrasCasa(
    meses.map(m => ({ rotulo: rotuloMesCasa(m.rotulo), valor: m.valor, extra: `${m.n} O.S` })),
    dinheiroCurto
  ) || '<p class="text-muted">Sem valor no período.</p>';
  const melhor = meses.slice().sort((a, b) => b.valor - a.valor)[0];
  const mediaMes = meses.length ? total / meses.length : 0;

  // 2. Tipo de serviço
  const tiposR = agrupar(o => o.servico, 12);
  const tiposHTML = barrasCasa(
    tiposR.map(t => ({ rotulo: t.rotulo, valor: t.valor, extra: `${t.n} O.S · ${dinheiroCurto(t.valor / t.n)}/O.S` })),
    dinheiroCurto
  ) || '<p class="text-muted">O ERP não mandou o serviço nestas O.S.</p>';

  // 3. Clientes
  const clientesR = agrupar(o => o.cliente, 12);
  const todosClientes = agrupar(o => o.cliente).length;
  const top10 = agrupar(o => o.cliente).slice(0, 10).reduce((s, c) => s + c.valor, 0);
  const clientesHTML = barrasCasa(
    clientesR.map(c => ({ rotulo: c.rotulo, valor: c.valor, extra: `${c.n} O.S` })),
    dinheiroCurto
  ) || '<p class="text-muted">Sem cliente no pacote do ERP.</p>';

  // 4. Dia da semana
  const dows = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const porDow = dows.map(d => ({ rotulo: d, valor: 0, n: 0 }));
  for (const o of lista) {
    const d = parseLocalDate(o.data);
    if (!d) continue;
    porDow[d.getDay()].n++; porDow[d.getDay()].valor += val(o);
  }
  const dowHTML = barrasCasa(porDow.map(d => ({ rotulo: d.rotulo, valor: d.n, extra: dinheiroCurto(d.valor) })), v => `${v} O.S`)
    || '<p class="text-muted">Sem data de entrega no período.</p>';

  // 5. Instalação × retirada
  const retiradas = lista.filter(o => o.tipo === 'interno');
  const instal = lista.filter(o => o.tipo !== 'interno');
  const somaR = retiradas.reduce((s, o) => s + val(o), 0);
  const somaI = total - somaR;

  // 6. Como o PCP registrou
  const estados = new Map();
  for (const o of lista) {
    const st = estadoPCP(o).rotulo;
    const d = estados.get(st) || { rotulo: st, valor: 0, n: 0 };
    d.n++; d.valor += val(o); estados.set(st, d);
  }
  const estadosHTML = barrasCasa([...estados.values()].sort((a, b) => b.n - a.n)
    .map(e => ({ rotulo: e.rotulo, valor: e.n, extra: dinheiroCurto(e.valor) })), v => `${v} O.S`);
  const foraDoPCP = (estados.get('fora do PCP') || { n: 0 }).n;
  const aLancarN = (estados.get('a lançar') || { n: 0 }).n;

  const kpiLinha = (rotulo, valor, nota) => `<div class="casa-kpi"><b>${valor}</b><small>${rotulo}${nota ? ` · ${nota}` : ''}</small></div>`;

  return `<section class="casa-relatorios">
    <h3>📊 Relatórios do período</h3>
    <p class="text-muted" style="font-size:.8rem">${lista.length} O.S entregues · ${dinheiroCasa(total)}${comValor < lista.length ? ` · ${lista.length - comValor} sem valor no ERP` : ''}. Todos os quadros leem o mesmo pacote do ERP dos KPIs acima.</p>
    <div class="casa-kpi-cards">
      ${kpiLinha('ticket médio', dinheiroCasa(comValor ? total / comValor : 0), `${comValor} O.S com valor`)}
      ${kpiLinha('média por mês', dinheiroCurto(mediaMes), `${meses.length} mês${meses.length === 1 ? '' : 'es'}`)}
      ${kpiLinha('melhor mês', melhor ? dinheiroCurto(melhor.valor) : '—', melhor ? rotuloMesCasa(melhor.rotulo) : '')}
      ${kpiLinha('clientes atendidos', String(todosClientes), `top 10 = ${total ? Math.round(top10 / total * 100) : 0}% do valor`)}
    </div>
    ${quadroCasa('ent-meses', '📅 Mês a mês', mesesHTML, true)}
    ${quadroCasa('ent-tipos', '🛠️ Por tipo de serviço <small>onde o dinheiro entra</small>', tiposHTML, true)}
    ${quadroCasa('ent-clientes', '🏢 Maiores clientes do período', clientesHTML, false)}
    ${quadroCasa('ent-dow', '📆 Dia da semana <small>onde o volume cai</small>', dowHTML, false)}
    ${quadroCasa('ent-tipo-entrega', '📦 Instalação × retirada',
      `<div class="casa-kpi-cards">
        ${kpiLinha('instalações', String(instal.length), dinheiroCurto(somaI))}
        ${kpiLinha('retiradas no balcão', String(retiradas.length), dinheiroCurto(somaR))}
        ${kpiLinha('participação da retirada', (lista.length ? Math.round(retiradas.length / lista.length * 100) : 0) + '%', total ? Math.round(somaR / total * 100) + '% do valor' : '')}
      </div>
      <p class="text-muted" style="font-size:.8rem">Retirada soma valor, mas não conta como entrega realizada, porque não é instalação.</p>`, false)}
    ${quadroCasa('ent-registro', '✅ Como o PCP registrou',
      `${estadosHTML}
      <p class="text-muted" style="font-size:.8rem">${foraDoPCP ? `<strong>${foraDoPCP}</strong> O.S o ERP entregou sem nunca passar pelo PCP. ` : ''}${aLancarN ? `<strong>${aLancarN}</strong> esperam lançamento manual. ` : ''}Quanto mais "registrada", melhor está o registro da equipe.</p>`, false)}
  </section>`;
}

/* R$ 0,00 AO LADO DE "SEM RESPOSTA DO ERP" É UMA AFIRMAÇÃO QUE A TELA NÃO PODE
   FAZER. Enquanto faltar mês — porque ainda não chegou OU porque falhou — e não
   houver nenhuma O.S na mão, o valor é desconhecido, não zero. Só vira número
   quando alguma coisa de fato veio. Ver [[feedback_zero_nao_e_resultado]]. */
function valorKpiCasa(k) {
  if ((k.faltando || k.comErro) && !k.n) return '…';
  /* NÚMERO INCOMPLETO TEM DE DIZER QUE É INCOMPLETO. Enquanto falta mês, o
     valor do ano é uma fração dele — e um número grande sem etiqueta é o tipo
     de coisa que alguém repete numa reunião. O total continua aparecendo
     (esconder seria pior), com a palavra na frente. */
  if (k.faltando || k.comErro) return 'parcial ' + dinheiroCasa(k.total);
  return dinheiroCasa(k.total);
}

/* "O ERP NÃO TEM NADA NESTE PERÍODO" É UMA AFIRMAÇÃO, e só cabe quando ele
   respondeu. Se algum mês ainda está vindo, a lista está incompleta; se algum
   falhou, ela pode estar errada — e nos dois casos a tela dizia que não havia
   entrega nenhuma. Ver [[feedback_zero_nao_e_resultado]]. */
function vazioEntregas(per) {
  if (per.faltando.length) {
    return { titulo: 'Carregando o ERP…',
             dica: `Pedindo ${per.faltando.length} mês${per.faltando.length === 1 ? '' : 'es'} ao Mubisys, três por vez (25–40 s cada, depois fica em cache).` };
  }
  if (per.comErro.length) {
    return { titulo: 'O ERP não respondeu neste período',
             dica: `${per.comErro.length} mês${per.comErro.length === 1 ? ' não veio' : 'es não vieram'} do Mubisys. Não quer dizer que não houve entrega; quer dizer que não deu para perguntar. Tente de novo em alguns minutos.` };
  }
  return { titulo: 'Nenhuma entrega no período segundo o ERP',
           dica: 'O ERP não tem O.S com status ENTREGUE e data de entrega neste intervalo.' };
}

/* ── A FILA DE LANÇAMENTO VIRA UMA FAIXA (revisão de experiência, 29/09/2026)
   No print do dono eram 57 linhas, cada uma com um botão azul "Lançar
   entrega" e "sem equipe" repetido, e a fila empurrava para longe a lista do
   período, que é o que a tela promete ("Acompanhe as O.S. entregues"). Agora
   ela é uma faixa de duas linhas logo abaixo dos cartões: quantas esperam, o
   valor parado, a mais antiga, e um botão que abre a lista sob demanda.
   A REGRA NÃO MUDOU: são todas as pendentes de classificarEntregas, de
   qualquer período, e nenhuma conta como entrega antes de lançada. O que
   mudou é só onde e como aparece. */
const FILA_LANCAR_PRIMEIRAS = 10;
// Dias corridos entre a baixa e hoje, pelo calendário (sem fuso no meio).
function idadeBaixaCasa(dia, hoje) {
  if (!dia || !hoje) return null;
  const utc = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const n = Math.round((utc(hoje) - utc(dia)) / 864e5);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}
function idadeTxtCasa(n) {
  if (n === null || n === undefined) return '';
  return n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;
}
/* A partir de uma semana parada a idade ganha cor: é o ponto em que a baixa
   deixa de ser "de ontem" e passa a ser esquecida. Só a cor muda; a ordem e a
   contagem são as mesmas. */
const FILA_LANCAR_VELHA = 7;
function filaLancarHTML(aLancar, f, hoje) {
  if (!aLancar.length) return '<p class="ent-fila-vazia"><span aria-hidden="true">✓</span> Nada pendente de lançamento.</p>';
  const dataBR = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : '—';
  const baixa = os => OPERACAO.dia(os.finalizadaEm) || '';
  const valorOk = v => v !== null && v !== undefined && Number.isFinite(Number(v));
  let total = 0, semValor = 0;
  for (const os of aLancar) { const v = valorDaOS(os); if (valorOk(v)) total += Number(v); else semValor++; }
  const antiga = aLancar.map(baixa).filter(Boolean).sort()[0] || '';
  const idadeAntiga = idadeBaixaCasa(antiga, hoje);
  const aberta = !!STATE._entFilaAberta;
  const n = aLancar.length;
  const corte = CORTE_LANCAMENTO_MANUAL.split('-').reverse().join('/');

  /* O RESUMO: três fatos e o botão. É o que fica na tela o tempo todo; a
     lista é para quem vai lançar. */
  const resumo = `<p class="ent-fila-resumo">
      <span class="ent-fila-fato"><strong>${n} ${n === 1 ? 'baixa do ERP espera' : 'baixas do ERP esperam'}</strong> lançamento</span>
      <span class="ent-fila-fato"><strong>${dinheiroCasa(total)}</strong> ${n === 1 ? 'parado' : 'parados'}${semValor ? ` <span class="badge sem-valor">${semValor} sem valor</span>` : ''}</span>
      ${antiga ? `<span class="ent-fila-fato">a mais antiga é ${idadeAntiga ? `de <strong>${dataBR(antiga)}</strong>, ${idadeTxtCasa(idadeAntiga)}` : 'de hoje'}</span>` : ''}
    </p>`;
  /* A EXPLICAÇÃO LONGA FOI PARA "COMO FUNCIONA". Nenhuma informação saiu:
     a frase de cima diz o essencial, e o resto (qualquer período, o que se
     confirma ao lançar, o retrabalho e o corte da direção) mora no quadro. */
  const como = `<details class="ent-fila-como" ${STATE._entFilaComoAberto ? 'open' : ''}><summary>Como funciona</summary>
      <ul>
        <li>Aparecem todas as baixas pendentes, de qualquer período, e não só as do período escolhido nos filtros. As de fora dele vêm marcadas "fora do período".</li>
        <li>Ao lançar, confirme a data da entrega e a equipe que instalou e responda se gerou retrabalho.</li>
        <li>Baixas anteriores a ${corte} já contam como entregues (decisão da direção) e não entram nesta fila.</li>
        <li>A O.S. cancelada (no ERP ou pelo botão Cancelar O.S. da ficha) sai da fila e não conta como entrega.</li>
      </ul>
    </details>`;

  let lista = '';
  if (aberta) {
    /* ORDEM: a mais antiga primeiro (é a que está esquecida há mais tempo) ou
       a de maior valor (é a que mais pesa no mês). A escolha fica no STATE,
       porque a tela repinta sozinha a cada mês que chega do ERP. */
    const ordem = STATE._entFilaOrdem === 'valor' ? 'valor' : 'antigas';
    const porAntiga = (a, b) => baixa(a).localeCompare(baixa(b)) || String(a.numero || '').localeCompare(String(b.numero || ''));
    const ordenada = aLancar.slice().sort(ordem === 'valor'
      ? (a, b) => { const va = valorDaOS(a), vb = valorDaOS(b); return (valorOk(vb) ? Number(vb) : -Infinity) - (valorOk(va) ? Number(va) : -Infinity) || porAntiga(a, b); }
      : porAntiga);
    const todas = !!STATE._entFilaTodas || n <= FILA_LANCAR_PRIMEIRAS;
    const visiveis = todas ? ordenada : ordenada.slice(0, FILA_LANCAR_PRIMEIRAS);
    /* A COLUNA TÉCNICOS SÓ EXISTE SE ALGUMA TIVER EQUIPE. Baixa do ERP quase
       nunca traz equipe, e "sem equipe" repetido em 50 linhas é ruído que
       esconde a exceção. Quem não tem equipe ganha um traço apagado. */
    const comEquipe = aLancar.some(os => OPERACAO.equipe(os).length);
    const linha = os => {
      const d = baixa(os), idade = idadeBaixaCasa(d, hoje);
      const eq = OPERACAO.equipeTexto(os, ', ');
      const v = valorDaOS(os);
      const fora = !OPERACAO.emIntervalo(diaEntrega(os), f.de, f.ate);
      return `<tr>
          <td class="ent-fila-os"><span class="ent-fila-id"><strong>${esc(os.numero || '—')}</strong> ${esc(os.cliente || '')}</span>${os.servico ? `<small>${esc(os.servico)}</small>` : ''}</td>
          ${comEquipe ? `<td class="ent-fila-tec${eq ? '' : ' vazio'}">${eq ? esc(eq) : '<span class="ent-fila-traco" title="Sem equipe na O.S.">—</span>'}</td>` : ''}
          <td class="ent-fila-baixa">${dataBR(d)} <small class="ent-fila-idade${idade !== null && idade >= FILA_LANCAR_VELHA ? ' velha' : ''}">${idadeTxtCasa(idade)}</small>${fora ? ' <small class="text-muted ent-fila-fora">fora do período</small>' : ''}</td>
          <td class="num ent-fila-valor">${valorOk(v) ? dinheiroCasa(Number(v)) : '<span class="badge sem-valor">sem valor</span>'}</td>
          <td class="ent-fila-acao"><button type="button" class="btn-ghost btn-sm edit-only ent-fila-lancar" data-lancar-os="${esc(os.id)}" aria-label="Lançar a entrega da O.S ${esc(os.numero || '')}">Lançar</button></td>
        </tr>`;
    };
    const botaoOrdem = (v, rot) => `<button type="button" class="btn-ghost btn-sm ${ordem === v ? 'active' : ''}" data-ent-fila-ordem="${v}" aria-pressed="${ordem === v}">${rot}</button>`;
    lista = `<div class="ent-fila-corpo" id="ent-fila-lista">
        <div class="ent-fila-ferramentas">
          <span class="ent-fila-ordem-rot" id="ent-fila-ordem-rot">Ordenar</span>
          <span class="casa-vista" role="group" aria-labelledby="ent-fila-ordem-rot">${botaoOrdem('antigas', 'Mais antigas')}${botaoOrdem('valor', 'Maior valor')}</span>
          <span class="ent-fila-contagem">${todas ? `${n} ${n === 1 ? 'baixa' : 'baixas'}` : `${FILA_LANCAR_PRIMEIRAS} de ${n}`}</span>
        </div>
        <div class="casa-tabela-wrap"><table class="casa-tabela ent-fila-tabela">
          <thead><tr><th>O.S e cliente</th>${comEquipe ? '<th>Técnicos</th>' : ''}<th>Baixa ERP</th><th class="num">Valor</th><th><span class="sr-only">Ação</span></th></tr></thead>
          <tbody>${visiveis.map(linha).join('')}</tbody>
        </table></div>
        ${n > FILA_LANCAR_PRIMEIRAS ? `<button type="button" class="btn-ghost ent-fila-mais" data-ent-fila-todas>${STATE._entFilaTodas ? `Mostrar só as ${FILA_LANCAR_PRIMEIRAS} primeiras` : `Mostrar todas (${n})`}</button>` : ''}
      </div>`;
  }
  // A classe casa-lancar fica: é por ela que "Abrir o lançamento", na Performance, desce até aqui.
  return `<section class="ent-fila casa-lancar${aberta ? ' aberta' : ''}" aria-label="Baixas do ERP a lançar">
      <div class="ent-fila-faixa">
        <span class="ent-fila-icone" aria-hidden="true">!</span>
        <div class="ent-fila-texto">
          ${resumo}
          <div class="ent-fila-linha2">
            <p class="ent-fila-frase">O ERP deu baixa, mas ninguém finalizou no PCP. Só conta como entrega depois de lançada.</p>
            ${como}
          </div>
        </div>
        <button type="button" class="btn-ghost ent-fila-botao" data-ent-fila aria-expanded="${aberta}"${aberta ? ' aria-controls="ent-fila-lista"' : ''}>${aberta ? 'Esconder a fila' : 'Ver a fila'}</button>
      </div>
      ${lista}
    </section>`;
}

/* ── ERP DIZ ENTREGUE, PCP TEM SALDO (E7, 30/09/2026) ──────────────────────
   Decisão do dono: quando o ERP dá a O.S. como entregue e o PCP tem entrega
   parcial marcada (a declarada pelo celular também conta), o PCP segura a
   O.S. e a gestão decide aqui, num toque:
     "Entregar o saldo em DD/MM": marca o saldo de cada item a entregar com a
       data do ERP, via 'lote', pelo motor (ENTREGA_ITEM, o mesmo validador da
       porta), sobre a O.S. RELIDA do STORE na hora do toque;
     "Manter aberta": grava a decisão (erpSaldoDecisao, carimbada pelo
       servidor), e a O.S. sai da lista até o ERP dizer outra coisa (o selo).
   Só admin e pcp veem e decidem. O ERP disse entregue de dois jeitos:
     a baixa automática poupou a O.S. e gravou erpComSaldo (situação e data);
     a conciliação horária da carteira marcou erpSaiuDaCarteiraEm e o pacote
       de entregues do ERP (a mesma fonte dos cartões desta tela) traz a O.S.
       como ENTREGUE, com a data.
   Item com problema aberto fica fora do "Entregar o saldo" (o saldo dele está
   segurado; resolve-se no item), como no Finalizar da ficha (E4). */
const PAPEIS_SALDO_ERP = ['admin', 'pcp'];
const podeDecidirSaldoERP = () => PAPEIS_SALDO_ERP.includes(String((STATE.user || {}).papel || ''));
const temMotorSaldoERP = () => typeof ENTREGA_ITEM !== 'undefined' && !!ENTREGA_ITEM && typeof ENTREGA_ITEM.resumoOS === 'function';
const diaISOCasa = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
// A O.S. no pacote de entregues do ERP (status ENTREGUE, data de entrega), só nos meses já carregados.
function entregueNoPacoteERP(numero, desde) {
  const n = String(numero || '').trim();
  if (!n || !STORE.entreguesMes) return null;
  const hoje = OPERACAO.dia(new Date());
  const ini = diaISOCasa(OPERACAO.dia(desde)) || hoje;
  const d = new Date(Date.UTC(Number(ini.slice(0, 4)), Number(ini.slice(5, 7)) - 1 - 3, 1));
  for (const m of mesesEntre(d.toISOString().slice(0, 10), hoje)) {
    const pac = STORE.entreguesMes(m);
    const o = pac && Array.isArray(pac.os) ? pac.os.find(x => String(x && x.numero || '').trim() === n) : null;
    if (o && diaISOCasa(o.data)) return o;
  }
  return null;
}
/* O QUE O ERP DISSE DESTA O.S. ABERTA: {status, data, selo, fonte} ou null.
   `data` é o dia do saldo: a data de entrega do ERP; sem ela, o dia em que a
   baixa viu o ENTREGUE (a mesma regra da entrega implícita do motor); sem as
   duas, vazio (a tela manda marcar na ficha). O selo é o do servidor
   (seloSaldoERP): SITUAÇÃO|data. */
function avisoERPSaldo(os) {
  if (!os || typeof os !== 'object' || os.finalizadaEm) return null;
  const m = os.erpComSaldo;
  if (m && typeof m === 'object' && !Array.isArray(m) && String(m.status || '')) {
    const status = String(m.status);
    const data = diaISOCasa(m.dataEntregue) || (status === 'ENTREGUE' ? diaISOCasa(temMotorSaldoERP() ? ENTREGA_ITEM.diaSP(m.desde) : OPERACAO.dia(m.desde)) : '');
    return {status, data, selo: String(m.selo || `${status}|${diaISOCasa(m.dataEntregue)}`), fonte: 'baixa', desde: m.desde || ''};
  }
  if (os.erpSaiuDaCarteiraEm) {
    const o = entregueNoPacoteERP(os.numero, os.erpSaiuDaCarteiraEm);
    if (o) return {status: 'ENTREGUE', data: o.data, selo: `ENTREGUE|${o.data}`, fonte: 'carteira', desde: os.erpSaiuDaCarteiraEm};
  }
  return null;
}
// O saldo que o "Entregar o saldo" marca, e os itens com problema, que ficam.
function saldoERPDaOS(os) {
  const pendentes = [], comProblema = [];
  for (const it of Array.isArray(os && os.itens) ? os.itens : []) {
    if (!it || typeof it !== 'object' || ENTREGA_ITEM.ehServico(it)) continue;
    const s = ENTREGA_ITEM.situacaoItem(it, os);
    if (s.saldo <= 0) continue;
    if (s.situacao === 'problema') comProblema.push({it, s});
    else if (s.situacao === 'a entregar' || s.situacao === 'parcial') pendentes.push({it, s});
  }
  return {pendentes, comProblema, unidades: pendentes.reduce((t, p) => t + p.s.saldo, 0)};
}
/* A LISTA: O.S. aberta, com o ERP dizendo entregue, com entrega parcial
   marcada, e sem "Manter aberta" para o mesmo aviso do ERP. A decisão que
   ainda está na fila deste aparelho já conta. Vazia para quem não é gestão. */
function listaErpComSaldo(todas) {
  if (!podeDecidirSaldoERP() || !temMotorSaldoERP()) return [];
  const out = [];
  for (const os of Array.isArray(todas) ? todas : []) {
    // Filtro barato primeiro: aberta, com aviso do ERP gravado e com alguma marca de item.
    if (!os || typeof os !== 'object' || os.finalizadaEm || !(os.erpComSaldo || os.erpSaiuDaCarteiraEm)) continue;
    if (!(Array.isArray(os.itens) && os.itens.some(it => it && Array.isArray(it.entregas) && it.entregas.length))) continue;
    let resumo;
    try { resumo = ENTREGA_ITEM.resumoOS(os); } catch { continue; }
    if (!resumo || resumo.situacao !== 'parcial') continue;
    const aviso = avisoERPSaldo(os);
    if (!aviso) continue;
    const dec = os.erpSaldoDecisao;
    if (dec && typeof dec === 'object' && dec.tipo === 'manter' && dec.selo === aviso.selo) continue;
    out.push({os, aviso, resumo, saldo: saldoERPDaOS(os)});
  }
  return out.sort((a, b) => String(a.aviso.data || a.aviso.desde).localeCompare(String(b.aviso.data || b.aviso.desde)) || String(a.os.numero || '').localeCompare(String(b.os.numero || '')));
}
const idMarcaSaldoERP = () => typeof novoIdMarca === 'function' ? novoIdMarca()
  : 'e-' + Array.from({length: 12}, () => Math.floor(Math.random() * 36).toString(36)).join('');
const ddmmCasa = d => diaISOCasa(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
// "item 3 (Placa ACM)": só o produto, sem o texto livre depois de ' - '.
function rotuloItemSaldoERP(it) {
  const d = String((it && it.descricao) || '').split(' - ')[0].trim().slice(0, 40);
  const n = String((it && it.item) || '').trim().slice(0, 10);
  return (n ? 'item ' + n : 'item') + (d ? ` (${d})` : '');
}
/* A O.S. CANCELADA NÃO SE DECIDE PELA LISTA (revisão da junção F16+E7). A
   lista aberta antes do cancelamento dizia "Não há saldo a entregar" (o saldo
   está cancelado, não entregue), e o "Manter aberta" gravava a decisão numa
   O.S. cancelada. Vem antes de tudo e nada é gravado: vale o cancelamento
   gravado e o pedido ainda na fila deste aparelho (ENTREGA_ITEM.canceladaOS). */
const ERRO_SALDO_ERP_CANCELADA = 'O.S. cancelada: desfaça o cancelamento para decidir.';
const canceladaSaldoERP = os => temMotorSaldoERP() && typeof ENTREGA_ITEM.canceladaOS === 'function' && ENTREGA_ITEM.canceladaOS(os);
/* ENTREGAR O SALDO NA DATA DO ERP. Relê a O.S. do STORE (a marca que chegou
   de outro aparelho entra na conta do saldo), confere que o ERP ainda diz o
   mesmo (o selo que a tela mostrou) e marca cada item a entregar com a data
   do ERP, via 'lote'. Tudo ou nada: se um item não passa no motor, nenhum é
   marcado. Devolve {erro, marcadas, unidades, dia, ficaramComProblema}. */
function entregarSaldoERP(osId, selo) {
  if (!podeDecidirSaldoERP()) return {erro: 'Só admin e PCP decidem o saldo que o ERP deu como entregue.'};
  if (!temMotorSaldoERP()) return {erro: 'Atualize a página: falta o motor da entrega por item.'};
  const fonte = STORE.getOS(osId);
  if (!fonte) return {erro: 'Esta O.S. não está mais neste aparelho.'};
  if (canceladaSaldoERP(fonte)) return {erro: ERRO_SALDO_ERP_CANCELADA};
  if (fonte.finalizadaEm) return {erro: `A O.S ${fonte.numero || ''} já foi finalizada: nada foi marcado.`};
  const os = JSON.parse(JSON.stringify(fonte));
  const aviso = avisoERPSaldo(os);
  if (!aviso) return {erro: `O ERP não diz mais que a O.S ${os.numero || ''} foi entregue: nada foi marcado.`};
  if (selo && aviso.selo !== selo) return {erro: `O aviso do ERP para a O.S ${os.numero || ''} mudou enquanto a lista estava aberta. Confira de novo.`};
  if (!aviso.data) return {erro: `O ERP não informou a data da entrega da O.S ${os.numero || ''}: marque o saldo na ficha.`};
  const hoje = ENTREGA_ITEM.diaSP(Date.now());
  const papel = String(STATE.user.papel || ''), por = String(STATE.user.nome || '');
  const tipo = os.tipo === 'interno' ? 'retirado' : 'entregue';
  const saldo = saldoERPDaOS(os), novas = [];
  if (!saldo.pendentes.length) return {erro: saldo.comProblema.length ? 'O saldo desta O.S. está nos itens com problema: resolva na ficha.' : 'Não há saldo a entregar nesta O.S.'};
  for (const {it, s} of saldo.pendentes) {
    const ev = {id: idMarcaSaldoERP(), tipo, qtde: s.saldo, dia: aviso.data, via: 'lote', por, em: nowISO()};
    const v = ENTREGA_ITEM.validarEvento(ev, it, {papel, os, hoje});
    if (!v.ok) return {erro: `A marca do ${rotuloItemSaldoERP(it)} não passou: ${v.erro} Nada foi marcado.`};
    novas.push([it, v.evento]);
  }
  for (const [it, ev] of novas) it.entregas = (Array.isArray(it.entregas) ? it.entregas : []).concat(ev);
  os.atualizadoEm = nowISO();
  os.atualizadoPor = por;
  STORE.saveOS(os);
  return {erro: '', marcadas: novas.length, unidades: saldo.unidades, dia: aviso.data, ficaramComProblema: saldo.comProblema.length};
}
/* MANTER ABERTA: a decisão vai na O.S. relida, e o servidor carimba quem e
   quando (erpSaldoDecisao). A O.S. sai da lista até o ERP mudar o aviso. */
function manterAbertaSaldoERP(osId, selo) {
  if (!podeDecidirSaldoERP()) return {erro: 'Só admin e PCP decidem o saldo que o ERP deu como entregue.'};
  const fonte = STORE.getOS(osId);
  if (!fonte) return {erro: 'Esta O.S. não está mais neste aparelho.'};
  if (canceladaSaldoERP(fonte)) return {erro: ERRO_SALDO_ERP_CANCELADA};
  if (fonte.finalizadaEm) return {erro: `A O.S ${fonte.numero || ''} já foi finalizada.`};
  const aviso = avisoERPSaldo(fonte);
  if (!aviso) return {erro: `O ERP não diz mais que a O.S ${fonte.numero || ''} foi entregue.`};
  if (selo && aviso.selo !== selo) return {erro: `O aviso do ERP para a O.S ${fonte.numero || ''} mudou enquanto a lista estava aberta. Confira de novo.`};
  const os = JSON.parse(JSON.stringify(fonte));
  os.erpSaldoDecisao = {tipo: 'manter', selo: aviso.selo};
  os.atualizadoEm = nowISO();
  os.atualizadoPor = String(STATE.user.nome || '');
  STORE.saveOS(os);
  return {erro: ''};
}
const NOME_SITUACAO_ERP = {ENTREGUE: 'entregue', FINALIZADO: 'finalizada'};
/* O QUE O CARD, A FICHA E O FINALIZAR DIZEM DO ERP (revisão da E7). Os dois
   caminhos do ERP (a marca da baixa, erpComSaldo, e a saída da carteira com
   o pacote de entregues) viram o mesmo aviso, com as mesmas palavras. Só
   vale com entrega parcial marcada: sem ela, o card segue como antes (a
   carteira oferece "Confirmar baixa"). Devolve {aviso, resumo, mantida}, ou
   null; `mantida` = a gestão já decidiu "Manter aberta" para este aviso. */
function erpSaldoNaOS(os) {
  if (!os || typeof os !== 'object' || os.finalizadaEm || !temMotorSaldoERP()) return null;
  if (!(os.erpComSaldo || os.erpSaiuDaCarteiraEm)) return null;
  /* O cancelamento da gestão fica fora da conta, como na baixa do servidor
     (entregaParcialMarcada, revisão da junção F16+E7): cancelada, a O.S. dava
     "completa", este aviso sumia e o card voltava a oferecer "Confirmar
     baixa". Quem mostra o aviso esconde a cancelada (erpFechouHTML). */
  let resumo;
  try { resumo = ENTREGA_ITEM.resumoOS({...os, cancelamento: undefined}); } catch { return null; }
  if (!resumo || resumo.situacao !== 'parcial') return null;
  const aviso = avisoERPSaldo(os);
  if (!aviso) return null;
  const dec = os.erpSaldoDecisao;
  return {aviso, resumo, mantida: !!(dec && typeof dec === 'object' && dec.tipo === 'manter' && dec.selo === aviso.selo)};
}
// "O ERP diz entregue em 29/09": a mesma frase no card, na ficha e no Finalizar.
const textoERPDiz = aviso => `O ERP diz ${NOME_SITUACAO_ERP[aviso && aviso.status] || String((aviso && aviso.status) || 'encerrada').toLowerCase()}${aviso && aviso.data ? ` em ${ddmmCasa(aviso.data)}` : ' (sem data de entrega)'}`;
function erpSaldoAvisoHTML(s) {
  if (!s || !s.aviso) return '';
  const gestao = podeDecidirSaldoERP();
  const frase = s.mantida ? '; a gestão manteve a O.S. aberta: entrega parcial.'
    : ` e o PCP tem saldo: ${gestao ? 'decida' : 'a gestão decide'} em Entregas.`;
  const link = !s.mantida && gestao ? '<button type="button" class="btn-ghost card-erp-ok" data-erp-saldo-lista>Abrir a lista</button>' : '';
  return `<div class="card-erp-conferir card-erp-saldo"><div><b>${esc(textoERPDiz(s.aviso))}</b>${esc(frase)}</div>${link}</div>`;
}
/* O LINK DO CARD E DA FICHA: abre Entregas (a lista, não os relatórios) e
   desce até "ERP diz entregue, PCP tem saldo". */
function abrirListaErpSaldo() {
  STATE._entAba = '';
  const rolar = () => { const alvo = document.querySelector('#panel-entregas .erp-saldo'); if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({behavior: 'smooth', block: 'start'}); };
  const aba = document.querySelector('.tab[data-tab="entregas"]:not([data-vista])');
  if (aba) { aba.click(); setTimeout(rolar, 80); } else rolar();
}
function erpComSaldoHTML(linhas) {
  if (!podeDecidirSaldoERP() || !Array.isArray(linhas) || !linhas.length) return '';
  const n = linhas.length;
  const linha = ({os, aviso, resumo, saldo}) => {
    const erp = `${NOME_SITUACAO_ERP[aviso.status] || String(aviso.status).toLowerCase()}${aviso.data ? ` em ${ddmmCasa(aviso.data)}` : ', sem data de entrega'}`;
    const com = resumo.entregues + resumo.parciais;
    const pcp = `${com} de ${resumo.itensTotal} ite${resumo.itensTotal === 1 ? 'm' : 'ns'} com entrega; faltam ${resumo.saldoItens} unidade${resumo.saldoItens === 1 ? '' : 's'}`;
    const decl = resumo.unidadesDeclaradas > 0 ? `<span class="tag-entrega tag-entrega-decl">${resumo.unidadesDeclaradas} declarada${resumo.unidadesDeclaradas === 1 ? '' : 's'} pelo celular</span>` : '';
    const prob = saldo.comProblema.length ? `<span class="tag-entrega tag-entrega-prob">${saldo.comProblema.length} ite${saldo.comProblema.length === 1 ? 'm' : 'ns'} com problema fica${saldo.comProblema.length === 1 ? '' : 'm'}</span>` : '';
    const entregar = aviso.data && saldo.pendentes.length
      ? `<button type="button" class="btn-primary btn-sm edit-only" data-erp-entregar="${esc(os.id)}" data-erp-selo="${esc(aviso.selo)}">Entregar o saldo em ${esc(ddmmCasa(aviso.data))}</button>`
      : `<button type="button" class="btn-ghost btn-sm" data-os-id="${esc(os.id)}">${aviso.data ? 'Resolver na ficha' : 'Marcar na ficha'}</button>`;
    return `<li class="erp-saldo-item">
        <div class="erp-saldo-os"><strong>${esc(os.numero || '—')}</strong> ${esc(os.cliente || '')}${os.servico ? `<small>${esc(os.servico)}</small>` : ''}</div>
        <p class="erp-saldo-fatos"><span><b>ERP:</b> ${esc(erp)}</span><span><b>PCP:</b> ${esc(pcp)}</span>${decl}${prob}</p>
        <div class="erp-saldo-acoes">${entregar}<button type="button" class="btn-ghost btn-sm edit-only" data-erp-manter="${esc(os.id)}" data-erp-selo="${esc(aviso.selo)}">Manter aberta</button></div>
      </li>`;
  };
  return `<section class="erp-saldo" aria-labelledby="erp-saldo-tit">
      <div class="erp-saldo-cab">
        <span class="ent-fila-icone" aria-hidden="true">!</span>
        <div><h3 id="erp-saldo-tit">ERP diz entregue, PCP tem saldo <span class="erp-saldo-n">${n}</span></h3>
        <p class="ent-fila-frase">O ERP deu ${n === 1 ? 'esta O.S.' : 'estas O.S.'} como entregue${n === 1 ? '' : 's'}, mas o PCP tem entrega parcial marcada. ${n === 1 ? 'Ela continua aberta' : 'Elas continuam abertas'} até a gestão decidir.</p></div>
      </div>
      <ul class="erp-saldo-lista">${linhas.map(linha).join('')}</ul>
    </section>`;
}
function wireErpComSaldo(el) {
  el.querySelectorAll('[data-erp-entregar]').forEach(b => b.onclick = () => {
    const r = entregarSaldoERP(b.dataset.erpEntregar, b.dataset.erpSelo);
    if (r.erro) { toast(r.erro, 'error'); return; }
    const os = STORE.getOS(b.dataset.erpEntregar) || {};
    toast(`O.S ${os.numero || ''}: saldo de ${r.marcadas} ite${r.marcadas === 1 ? 'm' : 'ns'} entregue em ${ddmmCasa(r.dia)}, a data do ERP.${r.ficaramComProblema ? ` ${r.ficaramComProblema} com problema fica${r.ficaramComProblema === 1 ? '' : 'm'} para resolver na ficha.` : ''} Para desfazer, use o item na ficha.`, 'success');
    renderEntregas();
  });
  el.querySelectorAll('[data-erp-manter]').forEach(b => b.onclick = () => {
    const r = manterAbertaSaldoERP(b.dataset.erpManter, b.dataset.erpSelo);
    if (r.erro) { toast(r.erro, 'error'); return; }
    const os = STORE.getOS(b.dataset.erpManter) || {};
    toast(`A O.S ${os.numero || ''} continua aberta: entrega parcial. Ela volta a esta lista se o ERP mudar o aviso.`, 'success');
    renderEntregas();
  });
}

function renderEntregas() {
  const el = document.getElementById('panel-entregas');
  if (!el) return;
  if(STATE._entAba==='relatorios')return renderRelatoriosEntregas();
  // Fechar o dia (F14): o lote da gestão, em lote.js. Sem ele (cache misto), a lista de sempre.
  if (STATE._entAba === 'lote' && typeof renderLoteEntregas === 'function') return renderLoteEntregas();
  /* O SELECT ABERTO NA VISTA POR O.S. (revisão da F18): a repintura completa
     (a cada mês que chega do ERP) trocava o select e fechava a lista na mão de
     quem escolhia a equipe. Com o foco num select da vista, a repintura espera
     o foco sair (entregas-os.js, porOSAdiarRepintura). */
  if (STATE._entVista === 'poros' && typeof porOSAdiarRepintura === 'function' && porOSAdiarRepintura()) return;
  const todas = STORE.getAllOS();
  const porNumero = new Map(todas.map(o => [String(o.numero || '').trim(), o]));
  const cls = classificarEntregas(todas);
  const registradas = new Set(cls.instalacoes.map(o => String(o.numero || '').trim()));
  const aLancarSet = new Set(cls.aLancar.map(o => String(o.numero || '').trim()));
  const hoje = OPERACAO.dia(new Date());
  const f = periodoEntregas();
  if (!STATE._entVista) STATE._entVista = 'tabela';
  /* A VISTA POR O.S. (F18, entregas-os.js) tem os filtros dela (status,
     equipe e busca), que não mexem nos cartões de cima. Técnico e Tipo ficam
     com a Tabela e os Cards. Sem o arquivo (cache misto), volta a Tabela. */
  const porOS = STATE._entVista === 'poros' && typeof porOSMontar === 'function';
  const tecnico = porOS ? '' : (STATE._entTecnico || '');
  const tipo = porOS ? '' : (STATE._entTipo || '');

  /* TRÊS FIXOS PELO ERP — hoje, mês corrente, ano corrente — e UM QUE SEGUE O
     PERÍODO ESCOLHIDO. Os três primeiros são o pulso da casa e nunca se mexem;
     o quarto existe porque tocar num chip de mês e ver os números de cima
     parados parece tela travada. Eram honestos ("entregue no mês") e mesmo
     assim enganavam: o chip fica ABAIXO deles, o olho volta para cima e não
     acha o número que acabou de pedir. */
  const kpiDe = r => {
    const inst = r.os.filter(o => o.tipo !== 'interno');
    let total = 0, semValor = 0;
    for (const o of r.os) { if (Number.isFinite(Number(o.valor)) && o.valor !== null) total += Number(o.valor); else semValor++; }
    return { total, n: r.os.length, inst: inst.length, retiradas: r.os.length - inst.length, semValor, faltando: r.faltando.length, comErro: r.comErro.length, meses: r.meses.length };
  };
  const kpi = (de, ate) => kpiDe(entreguesERP(de, ate));
  const kHoje = kpi(hoje, hoje), kMes = kpi(hoje.slice(0, 7) + '-01', hoje), kAno = kpi(hoje.slice(0, 4) + '-01-01', hoje);
  const registradasMes = cls.instalacoes.filter(o => OPERACAO.emIntervalo(diaEntrega(o), hoje.slice(0, 7) + '-01', hoje)).length;

  // Lista do período: o que o ERP diz que foi entregue, com o estado no PCP.
  const per = entreguesERP(f.de || hoje.slice(0, 7) + '-01', f.ate || hoje);
  const kPer = kpiDe(per);
  const limiteEntregas = limiteJanelaCasa();
  const estadoPCP = o => {
    const n = String(o.numero || '').trim();
    if (o.tipo === 'interno') return { rotulo: 'Retirada', classe: 'st-finalizada', dica: 'Só o valor conta; retirada não é entrega realizada' };
    const card = porNumero.get(n);
    // Entrega mais velha que a janela do aparelho: o card pode existir no
    // servidor. Dizer "fora do PCP" aqui culpava a equipe por um mês inteiro.
    if (!card && o.data && o.data < limiteEntregas) return { rotulo: 'sem cópia no aparelho', classe: 'st-aguardando_producao', dica: `Entregue há mais de ${janelaLocalCasa()} dias; o aparelho guarda só os últimos ${janelaLocalCasa()}` };
    if (!card) return { rotulo: 'fora do PCP', classe: 'st-aguardando_producao', dica: 'O ERP entregou, mas esta O.S nunca passou pelo PCP' };
    if (typeof OPERACAO.cancelada === 'function' && OPERACAO.cancelada(card)) return { rotulo: 'cancelada', classe: 'st-aguardando_producao', dica: 'Cancelada no PCP: ' + (((typeof OPERACAO.cancelamentoDe === 'function' && OPERACAO.cancelamentoDe(card)) || {}).motivo || '') };
    if (OPERACAO.entregaLancadaValida(card)) return { rotulo: 'lançada', classe: 'st-confirmada', dica: 'Baixa do ERP lançada à mão por ' + (card.entregaLancada.por || '') };
    if (registradas.has(n)) return { rotulo: 'registrada', classe: 'st-confirmada', dica: 'Entrega registrada no PCP' };
    if (aLancarSet.has(n)) return { rotulo: 'a lançar', classe: 'st-retrabalho', dica: 'Baixada pelo ERP; falta lançar no PCP' };
    if (card.finalizadaEm) return { rotulo: 'baixada', classe: 'st-aguardando_producao', dica: 'Finalizada no PCP' };
    return { rotulo: 'aberta no PCP', classe: 'st-agendada', dica: 'O ERP marcou entregue, mas o card segue aberto' };
  };
  const lista = per.os
    .map(o => ({ erp: o, card: porNumero.get(String(o.numero || '').trim()) || null }))
    // Técnico é a FICHA, não a grafia: "Osmane" e "Osmane V." são a mesma pessoa.
    .filter(x => !tecnico || (x.card && OPERACAO.equipe(x.card).some(a => nomeExibicaoCasa(a).chave === tecnico)))
    .filter(x => !tipo || String((x.card && x.card.servico) || x.erp.servico || '').trim() === tipo)
    .sort((a, b) => String(b.erp.data).localeCompare(String(a.erp.data)) || String(b.erp.numero).localeCompare(String(a.erp.numero)));
  let totLista = 0, semValorLista = 0;
  for (const x of lista) { if (x.erp.valor !== null && Number.isFinite(Number(x.erp.valor))) totLista += Number(x.erp.valor); else semValorLista++; }
  // A tabela mostra no máximo 300 linhas; o resto está nos relatórios.
  const TETO_LINHAS = 300;
  const visiveis = lista.slice(0, TETO_LINHAS);
  /* A FILA NÃO SEGUE O PERÍODO. Filtrada pelo período, no dia 1º toda baixa do
     mês anterior ainda não lançada sumia ("Nada pendente") e a instalação ficava
     fora da contagem sem ninguém perceber. Pendência é pendência em qualquer mês.
     A ordem (mais antigas ou maior valor) é escolha da tela: filaLancarHTML. */
  const aLancar = cls.aLancar.slice();

  const tecMapa = new Map();
  for (const ap of new Set(todas.filter(o => o.finalizadaEm).flatMap(o => OPERACAO.equipe(o)))) {
    const n = nomeExibicaoCasa(ap);
    if (!tecMapa.has(n.chave)) tecMapa.set(n.chave, n.nome);
  }
  const tecnicos = [...tecMapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const tipos = typeof tiposServicoHist === 'function' ? tiposServicoHist() : [];
  const opt = (v, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`;
  const dataBR = iso => { const d = OPERACAO.dia(iso); return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(2, 4) : '—'; };
  const valorTxt = v => (v !== null && Number.isFinite(Number(v))) ? dinheiroCasa(Number(v)) : '<span class="badge sem-valor">sem valor</span>';
  const kpiHTML = (k, rotulo, extra) => `<div class="casa-kpi ${extra || ''} ${k.semValor || k.faltando || k.comErro ? 'alerta' : ''}">
      <b>${valorKpiCasa(k)}</b>
      <small>${esc(rotulo)} · ${k.n} O.S${k.inst ? ` · ${k.inst} instalaç${k.inst === 1 ? 'ão' : 'ões'}` : ''}${k.retiradas ? ` · ${k.retiradas} retirada${k.retiradas === 1 ? '' : 's'}` : ''}${k.semValor ? ` · <span class="badge sem-valor">${k.semValor} sem valor</span>` : ''}${k.faltando ? ` · <span class="badge st-agendada">carregando ${k.faltando} de ${k.meses} mês${k.meses === 1 ? '' : 'es'}…</span>` : ''}${k.comErro ? ` · <span class="badge sem-valor">${k.comErro} mês${k.comErro === 1 ? '' : 'es'} sem resposta do ERP</span>` : ''}</small>
    </div>`;
  /* O nome do período no cartão: "em mai/2026" quando é um mês inteiro, "em
     2026" quando é o ano, e as duas datas quando é qualquer outro recorte. */
  const rotuloPeriodo = (de, ate) => {
    if (!de || !ate) return 'no período escolhido';
    const ultimoDia = m => String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
    const mes = de.slice(0, 7);
    if (de === mes + '-01' && mes === ate.slice(0, 7) && (ate === hoje || ate === mes + '-' + ultimoDia(mes))) {
      return `entregue em ${MES_CURTO[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
    }
    const ano = de.slice(0, 4);
    if (de === ano + '-01-01' && ano === ate.slice(0, 4) && (ate === hoje || ate === ano + '-12-31')) {
      return `entregue em ${ano}`;
    }
    return `entregue de ${dataBR(de)} a ${dataBR(ate)}`;
  };
  // Só aparece quando diz algo novo: repetir o cartão do mês ao lado dele seria
  // ruído, e dois números iguais lado a lado fazem duvidar dos dois.
  const periodoRepetido = (f.de === hoje.slice(0, 7) + '-01' && f.ate === hoje)
    || (f.de === hoje.slice(0, 4) + '-01-01' && f.ate === hoje);
  /* Com Técnico ou Tipo ativos, o cartão do período segue a lista filtrada.
     Antes mostrava a empresa inteira ao lado da lista de uma pessoa. */
  const filtrado = !!(tecnico || tipo);
  const kpiPeriodo = filtrado
    ? kpiHTML(kpiDe({ os: lista.map(x => x.erp), faltando: per.faltando, comErro: per.comErro, meses: per.meses }), rotuloPeriodo(f.de, f.ate) + ' · com o filtro', 'escolhido ent-kpi-principal')
    : (periodoRepetido ? '' : kpiHTML(kPer, rotuloPeriodo(f.de, f.ate), 'escolhido ent-kpi-principal'));
  /* A HIERARQUIA DOS CARTÕES (revisão de experiência, 29/09/2026). Eram
     quatro números do mesmo tamanho, e "R$ 0,00 entregue hoje" pesava o mesmo
     que o ano. Agora o período escolhido é o cartão grande; quando o período
     é o mês corrente (ou o ano), o cartão grande é o do mês (ou do ano), que
     é o mesmo número, e ele não se repete ao lado. Hoje, mês e ano ficam
     compactos ao lado. Os avisos (sem valor, carregando, sem resposta do ERP)
     continuam em todos, grandes ou pequenos. */
  const principalMes = !kpiPeriodo && f.de === hoje.slice(0, 7) + '-01';
  const principalAno = !kpiPeriodo && !principalMes;
  const kpiPrincipal = kpiPeriodo
    || (principalMes ? kpiHTML(kMes, rotuloPeriodo(f.de, f.ate), 'ent-kpi-principal') : kpiHTML(kAno, rotuloPeriodo(f.de, f.ate), 'ent-kpi-principal'));
  /* Hoje sem entrega (e sem mês faltando ou falhando) é uma linha leve: um
     "R$ 0,00" grande não diz nada, e de manhã ele é a regra, não a notícia. */
  const hojeNada = !kHoje.n && !kHoje.faltando && !kHoje.comErro;
  const kpiHoje = hojeNada
    ? '<div class="casa-kpi ent-kpi-sec ent-kpi-nada"><span>Nada entregue hoje</span></div>'
    : kpiHTML(kHoje, 'entregue hoje', 'ent-kpi-sec');
  const kpiSecundarios = kpiHoje
    + (principalMes ? '' : kpiHTML(kMes, 'entregue no mês', 'ent-kpi-sec'))
    + (principalAno ? '' : kpiHTML(kAno, 'entregue no ano', 'ent-kpi-sec'));

  /* Tabela e Cards só são montados na vista escolhida (F18): os Cards
     calculam o status de até 300 O.S., e a vista Por O.S. não usa nenhum dos dois. */
  const tabela = () => `<div class="casa-tabela-wrap"><table class="casa-tabela ent-lista-tabela">
    <thead><tr><th>O.S</th><th>Cliente</th><th>Serviço</th><th>Técnicos</th><th>Entrega (ERP)</th><th class="num">Valor</th></tr></thead>
    <tbody>${visiveis.map(({ erp, card }) => { const st = estadoPCP(erp); const eqTxt = card ? OPERACAO.equipeTexto(card, ', ') : ''; return `<tr ${card ? `data-os-id="${esc(card.id)}"` : ''}>
        <td class="ent-l-os"><strong>${esc(erp.numero || '—')}</strong> <span class="badge ${st.classe}" title="${esc(st.dica)}">${esc(st.rotulo)}</span>${card && card.retrabalho ? ' <span class="badge st-retrabalho">Retrabalho</span>' : ''}</td>
        <td class="ent-l-cli">${esc(erp.cliente || (card && card.cliente) || '')}</td>
        <td class="ent-l-serv">${esc((card && card.servico) || erp.servico || '—')}</td>
        <td class="ent-l-tec">${card ? (eqTxt ? esc(eqTxt) : `<span class="ent-sem-equipe">${erp.tipo === 'interno' ? 'balcão' : 'sem equipe'}</span>`) : '—'}</td>
        <td class="ent-l-data">${dataBR(erp.data)}</td>
        <td class="num">${valorTxt(erp.valor)}${card && card.tipo!=='interno' && ['admin','pcp'].includes(STATE.user?.papel)?`<br><button type="button" class="btn-ghost btn-sm" data-ent-itens="${esc(card.id)}">Itens da entrega</button>`:""}</td>
      </tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="5">${lista.length} O.S entregues no período${lista.length > TETO_LINHAS ? ` · mostrando as ${TETO_LINHAS} mais recentes` : ''}${semValorLista ? ` · ${semValorLista} sem valor` : ''}${per.faltando.length ? ` · carregando ${per.faltando.length} mês${per.faltando.length === 1 ? '' : 'es'}…` : ''}${per.comErro.length ? ` · <span class="badge sem-valor">${per.comErro.length} mês${per.comErro.length === 1 ? '' : 'es'} sem resposta do ERP</span>` : ''}${per.truncou ? ` · <span class="badge sem-valor">intervalo longo demais: entraram só os primeiros ${TETO_MESES} meses</span>` : ''}</td><td class="num">${dinheiroCasa(totLista)}</td></tr></tfoot>
  </table></div>`;
  const cardFn = typeof osCardHTML === 'function' ? osCardHTML : null;
  /* Cards só existem para O.S com card no aparelho. As só do ERP, ou que já
     saíram da janela, sumiam da visão sem contagem: num mês antigo a tela
     ficava em branco. O rodapé diz quantas ficaram só na Tabela. */
  const semCard = visiveis.filter(x => !x.card).length;
  const cards = () => cardFn ? `<div class="cards-grid">${visiveis.filter(x => x.card).map(x => cardFn(x.card)).join('')}</div>
    <p class="metricas-nota">${lista.length} O.S entregues no período · ${dinheiroCasa(totLista)}${semCard ? ` · ${semCard} sem card neste aparelho aparece${semCard === 1 ? '' : 'm'} só na Tabela` : ''}.</p>` : tabela();
  /* A fila de lançamento é a única lista de tarefas desta tela. Ficava no
     fim da rolagem e ninguém a via; depois subiu inteira para cima da lista e
     passou a esconder a lista. Agora é uma faixa compacta logo abaixo dos
     cartões, que abre a lista sob demanda (filaLancarHTML). */

  /* A tela repinta a cada mês que chega do ERP. Sem guardar o estado, o quadro
     com o progresso e o Parar fechava a cada ~10 s, "Outras datas" fechava entre
     o De e o Até, e a grade ano × mês voltava para janeiro. */
  const grade0 = el.querySelector('.casa-grade-meses');
  const rolGrade = grade0 && grade0.parentElement ? grade0.parentElement.scrollLeft : 0;
  if (porOS) porOSMontar(lista.map(x => x.erp), todas, hoje);
  const voltarFocoPorOS = porOS ? porOSGuardarFoco() : null;
  el.innerHTML = `
    <div class="casa-pagina">
      ${abasEntregasHTML('lista')}
      <div class="casa-pagina-head">
        <div><h2>Entregas</h2><p>Acompanhe as O.S. entregues, os valores e a equipe responsável.</p></div>
      </div>
      <div class="ent-kpis">${kpiPrincipal}<div class="ent-kpi-secs">${kpiSecundarios}</div></div>${porOS && lista.length ? porOSAvisoKpiHTML() : ''}
      <details class="ent-dados" ${STATE._entDadosAberto ? 'open' : ''}><summary>Origem dos valores e sincronização</summary>
      <p>Valores líquidos de desconto das O.S. marcadas como entregues no ERP, pela data de entrega. Não representam recebimentos ou lucro. Instalações realizadas dependem do registro no PCP; retiradas pelo cliente entram apenas nos valores.</p>
      <p class="metricas-nota">Registradas no PCP neste mês: <strong>${registradasMes}</strong> instalaç${registradasMes === 1 ? 'ão' : 'ões'}${cls.aLancar.length ? ` · a lançar: <strong>${cls.aLancar.length}</strong>` : ''}. Fonte do valor: ERP${STORE.entreguesMes(hoje.slice(0, 7)) ? `, atualizado ${new Date(STORE.entreguesMes(hoje.slice(0, 7)).em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' (carregando…)'}.</p>
      ${barraCargaEntregas()}
      </details>
      ${filaLancarHTML(aLancar, f, hoje)}
      ${erpComSaldoHTML(listaErpComSaldo(todas))}
      <section class="ent-controles" aria-label="Filtros de entregas">
      ${chipsPeriodoEntregas(f)}
      <div class="casa-filtros">
        ${porOS ? '' : `<label>Técnico <select id="ent-tecnico"><option value="">Todos</option>${tecnicos.map(([chave, nome]) => `<option value="${esc(chave)}" ${chave === tecnico ? 'selected' : ''}>${esc(nome)}</option>`).join('')}</select></label>
        <label>Tipo de serviço <select id="ent-tipo"><option value="">Todos</option>${tipos.map(t => opt(t, tipo)).join('')}</select></label>`}
        <span class="casa-vista"><button class="btn-ghost btn-sm ${STATE._entVista === 'tabela' ? 'active' : ''}" data-ent-vista="tabela">Tabela</button><button class="btn-ghost btn-sm ${STATE._entVista === 'cards' ? 'active' : ''}" data-ent-vista="cards">Cards</button>${typeof porOSMontar === 'function' ? `<button class="btn-ghost btn-sm ${porOS ? 'active' : ''}" data-ent-vista="poros">Por O.S.</button>` : ''}</span>
      </div>
      </section>
      ${lista.length ? (porOS ? porOSSecaoHTML() : STATE._entVista === 'cards' ? cards() : tabela()) : emptyState('', vazioEntregas(per).titulo, vazioEntregas(per).dica) + (porOS && typeof porOSVazioPeriodoHTML === 'function' ? porOSVazioPeriodoHTML() : '')}
      ${lista.length ? prazoEntregasHTML(lista.map(x => x.erp), porNumero) : ''}
      ${relatoriosEntregasHTML(lista.map(x => x.erp), porNumero, estadoPCP)}
      ${relatorioAnosHTML()}
    </div>`;
  wireAbasEntregas(el);
  if(typeof wirePDFsEntregaPerformance==='function')wirePDFsEntregaPerformance(el);
  el.querySelectorAll('[data-ent-itens]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();void conferirItensEntrega(b.dataset.entItens).catch(e=>toast(perfErroTxt(e),'error'));});
  const dDados = el.querySelector('details.ent-dados');
  if (dDados) dDados.ontoggle = () => { STATE._entDadosAberto = dDados.open; };
  /* A FILA ABERTA, A ORDEM E O "MOSTRAR TODAS" moram no STATE pelo mesmo
     motivo do quadro acima: a tela repinta sozinha a cada mês que chega do
     ERP, e a fila fecharia no meio do lançamento. Depois de um toque, o foco
     volta ao mesmo botão (a repintura troca o elemento, e o teclado perdia o
     lugar). */
  const repintarFila = foco => { STATE._entFoco = foco; renderEntregas(); };
  el.querySelectorAll('[data-ent-fila]').forEach(b => b.onclick = () => { STATE._entFilaAberta = !STATE._entFilaAberta; repintarFila('[data-ent-fila]'); });
  el.querySelectorAll('[data-ent-fila-ordem]').forEach(b => b.onclick = () => { STATE._entFilaOrdem = b.dataset.entFilaOrdem; repintarFila(`[data-ent-fila-ordem="${b.dataset.entFilaOrdem}"]`); });
  el.querySelectorAll('[data-ent-fila-todas]').forEach(b => b.onclick = () => { STATE._entFilaTodas = !STATE._entFilaTodas; repintarFila('[data-ent-fila-todas]'); });
  const dComo = el.querySelector('details.ent-fila-como');
  if (dComo) dComo.ontoggle = () => { STATE._entFilaComoAberto = dComo.open; };
  if (STATE._entFoco) {
    const alvo = el.querySelector(STATE._entFoco);
    STATE._entFoco = '';
    if (alvo && typeof alvo.focus === 'function') alvo.focus();
  }
  const dPers = el.querySelector('details.ent-personalizar');
  if (dPers) dPers.ontoggle = () => { STATE._entPersAberto = dPers.open; };
  const grade1 = el.querySelector('.casa-grade-meses');
  if (rolGrade && grade1 && grade1.parentElement) grade1.parentElement.scrollLeft = rolGrade;
  wireFiltroPeriodo(el, '_fEnt', renderEntregas);
  const mudarMes = () => {
    const ano = el.querySelector('#ent-ano').value;
    let mes = el.querySelector('#ent-mes').value;
    if (mes && ano + '-' + mes > hoje.slice(0, 7)) mes = hoje.slice(5, 7);
    const de = mes ? `${ano}-${mes}-01` : `${ano}-01-01`;
    const fim = mes ? `${ano}-${mes}-${String(new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate()).padStart(2, '0')}` : `${ano}-12-31`;
    STATE._fEnt = { de, ate: fim > hoje ? hoje : fim };
    renderEntregas();
  };
  el.querySelector('#ent-ano').onchange = mudarMes;
  el.querySelector('#ent-mes').onchange = mudarMes;

  wireQuadrosCasa(el);
  el.querySelectorAll('[data-per-de]').forEach(b => b.onclick = () => {
    STATE._fEnt = { de: b.dataset.perDe, ate: b.dataset.perAte };
    renderEntregas();
  });
  const selT = document.getElementById('ent-tecnico'); if (selT) selT.onchange = () => { STATE._entTecnico = selT.value; renderEntregas(); };
  const selS = document.getElementById('ent-tipo'); if (selS) selS.onchange = () => { STATE._entTipo = selS.value; renderEntregas(); };
  el.querySelectorAll('[data-ent-vista]').forEach(b => b.onclick = () => { STATE._entVista = b.dataset.entVista; renderEntregas(); });
  el.querySelectorAll('[data-ent-rel]').forEach(b => b.onclick = () => { STATE._entRel = b.dataset.entRel; renderEntregas(); });
  /* Tocar num mês da grade abre o período dele lá em cima — é o caminho natural
     de "esse mês foi fraco, o que houve nele?". */
  el.querySelectorAll('[data-mes-ent]').forEach(b => b.onclick = () => {
    const mes = b.dataset.mesEnt;
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    STATE._fEnt = { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
    renderEntregas();
    const topo = document.getElementById('panel-entregas');
    if (topo && topo.scrollIntoView) topo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  /* CARREGAR UM ANO INTEIRO do ERP, sob pedido e com o preço dito. Não é
     automático de propósito: são 12 varreduras de 25-40 s, e ninguém deve
     disparar meia hora de ERP por engano ao abrir uma tela. */
  /* BAIXAR TUDO: a fila anda no store, sem depender deste render. Antes, sair
     da tela congelava o carregamento no meio. */
  /* O resumo (grade ano × mês) fica 10 min em cache no store. Quando uma carga
     termina, relê forçado: sem isto a grade ignorava o fim do "Baixar tudo" e
     do "carregar ano" e seguia dizendo "nenhum mês carregado". */
  const mesesDoResumo = () => {
    const anos = STORE.anosEntregues ? STORE.anosEntregues() : [];
    const mesHoje = OPERACAO.dia(new Date()).slice(0, 7);
    const todos = [];
    for (const ano of anos) for (let m = 1; m <= 12; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`;
      if (k <= mesHoje) todos.push(k);
    }
    return todos;
  };
  const releResumo = () => { if (STORE.pullEntreguesResumo) STORE.pullEntreguesResumo(mesesDoResumo(), true); };
  el.querySelectorAll('[data-carga-tudo]').forEach(b => b.onclick = () => {
    const meses = mesesTodosEntregas();
    if (!meses.length || !STORE.carregarTudoEntregues) return;
    const faltam = meses.filter(m => !(STORE.entreguesMes && STORE.entreguesMes(m))).length;
    if (typeof toast === 'function') {
      toast(faltam
        ? `Baixando ${faltam} mês(es). O que o servidor já tem vem agora; o resto leva 25-40 s cada, três por vez. Pode sair da tela.`
        : 'Conferindo os meses guardados.');
    }
    STORE.carregarTudoEntregues(meses).then(releResumo).catch(() => {});
    STATE._entDadosAberto = true;   // o progresso e o Parar moram neste quadro
    renderEntregas();
  });
  el.querySelectorAll('[data-carga-parar]').forEach(b => b.onclick = () => {
    if (STORE.pararEntregues) STORE.pararEntregues();
    renderEntregas();
  });
  el.querySelectorAll('[data-carregar-ano]').forEach(b => b.onclick = () => {
    const ano = b.dataset.carregarAno;
    const hoje = OPERACAO.dia(new Date()).slice(0, 7);
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${ano}-${String(m).padStart(2, '0')}`;
      if (k <= hoje) meses.push(k);
    }
    /* A FILA QUE ANDA SOZINHA. Lote + garantirEntregues pedia no máximo três
       meses e parava: a fila só anda quando a tela pede aqueles meses, e a
       grade nunca pede o ano clicado. O aviso prometia doze e vinham três. */
    if (STORE.carregarTudoEntregues) {
      const emCurso = STORE.progressoEntregues && STORE.progressoEntregues();
      if (emCurso && !emCurso.fim) { if (typeof toast === 'function') toast('Já há uma carga em andamento. Espere terminar e toque de novo.'); return; }
      if (typeof toast === 'function') toast(`Pedindo ${meses.length} meses de ${ano} ao ERP, de 25 a 40 s cada, três por vez. Pode sair da tela.`);
      STORE.carregarTudoEntregues(meses).then(releResumo).catch(() => {});
      STATE._entDadosAberto = true;
      renderEntregas();
      return;
    }
    if (typeof toast === 'function') toast(`Pedindo ${meses.length} meses de ${ano} ao ERP, de 25 a 40 s cada, três por vez.`);
    if (STORE.pullEntreguesLote) {
      STORE.pullEntreguesLote(meses).then(r => {
        if (r && r.faltando && r.faltando.length && STORE.garantirEntregues) STORE.garantirEntregues(r.faltando);
      }).catch(() => {});
    } else if (STORE.garantirEntregues) STORE.garantirEntregues(meses);
  });
  /* O resumo de todos os meses: uma vez por sessão (o store segura por 10 min).
     Não vai ao ERP — é leitura do que o servidor já guardou. */
  if (STORE.pullEntreguesResumo) {
    const anos = STORE.anosEntregues ? STORE.anosEntregues() : [];
    const hoje = OPERACAO.dia(new Date()).slice(0, 7);
    const todos = [];
    for (const ano of anos) {
      for (let m = 1; m <= 12; m++) {
        const k = `${ano}-${String(m).padStart(2, '0')}`;
        if (k <= hoje) todos.push(k);
      }
    }
    if (todos.length) {
      STORE.pullEntreguesResumo(todos);
      // Tamanho da equipe no mesmo intervalo (só contagem; o RH corta na porta).
      if (STORE.pullEquipeHistorico) STORE.pullEquipeHistorico(todos);
    }
  }
  el.querySelectorAll('[data-lancar-os]').forEach(b => b.onclick = () => lancarEntregaManual(b.dataset.lancarOs));
  wireErpComSaldo(el);
  bindCardClicks(el);
  if (porOS) { ligarPorOS(el); if (voltarFocoPorOS) voltarFocoPorOS(); }
}

function chipFichaHTML(osId, f, on) {
  const nome = (f.nome || f.apelido || rotuloPessoaCasa(f.id) || 'ID').split(' ')[0];
  return `<label class="casa-chip${on ? ' on' : ''}">
    <input type="checkbox" data-ponto="${esc(osId)}" value="${esc(f.id)}" ${on ? 'checked' : ''}>
    <span>${esc(nome)}</span>
    <small>ID ${esc(f.id)}</small>
  </label>`;
}

/* ── Quem entregou, no período ─────────────────────────────────────────────
   Base de tudo em Performance: instalação registrada (finalizada no PCP ou
   baixa do ERP lançada à mão), agrupada pela FICHA DO RH quando o apelido
   acha dona, senão pelo próprio apelido — marcado "sem ficha". */
function pessoasDoPeriodo(f) {
  const concl = classificarEntregas(STORE.getAllOS()).instalacoes;
  const noPeriodo = concl.filter(o => OPERACAO.emIntervalo(diaEntrega(o), f.de, f.ate));
  return { concl, noPeriodo, pessoas: agruparPorPessoaCasa(noPeriodo) };
}
function agruparPorPessoaCasa(lista) {
  const m = new Map();
  for (const os of lista) {
    const v = valorDaOS(os), h = OPERACAO.horas(os);
    const vistos = new Set();
    for (const ap of OPERACAO.equipe(os)) {
      const p = nomeExibicaoCasa(ap);
      if (vistos.has(p.chave)) continue; vistos.add(p.chave);
      const d = m.get(p.chave) || { ...p, os: 0, valor: 0, semValor: 0, horas: [], retrab: 0, erp: 0, apelidos: new Set() };
      d.os++; if (!OPERACAO.ehIdPessoa(ap)) d.apelidos.add(ap);
      if (v == null) d.semValor++; else d.valor += v;
      if (h != null) d.horas.push(h);
      if (os.retrabalho) d.retrab++;
      if (OPERACAO.entregaLancadaValida(os)) d.erp++;
      m.set(p.chave, d);
    }
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || b.os - a.os || a.nome.localeCompare(b.nome));
}
const mediaCasa = hs => hs.length ? (hs.reduce((a, b) => a + b, 0) / hs.length) : null;
const fmtHorasCasa = h => h == null ? '—' : (h < 1 ? Math.round(h * 60) + ' min' : (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h');

// Produtividade por pessoa: O.S concluídas, valor entregue (participação: quem
// estava na equipe leva o valor inteiro — não é rateio nem bônus), tempo médio
// saída→retorno e o destaque da semana. Desde 14/09/2026 o card traz a FOTO e
// o cargo da ficha do RH (uma base só).
/* R$ 0,00 E "—" NÃO PODEM SIGNIFICAR DUAS COISAS.
 *
 * No card da pessoa, R$ 0,00 aparecia tanto para quem entregou O.S sem valor no
 * Painel quanto para quem entregou de graça — e um traço no tempo médio tanto
 * para "ninguém anotou saída e retorno" quanto para "não deu tempo nenhum".
 * Isso é o nome de alguém na parede da fábrica: o número tem de dizer se é
 * ausência de fato ou ausência de medição. Mesma régua que Entregas já usa no
 * `valorKpiCasa`. */
function valorPessoaHTML(p) {
  if (p.semValor && p.semValor === p.os) {
    return '<span class="text-muted">—</span> <small>o Painel ainda não trouxe o valor destas O.S</small>';
  }
  const txt = dinheiroCasa(p.valor);
  return p.semValor
    ? `parcial ${txt} <span class="badge sem-valor" title="${p.semValor} de ${p.os} O.S sem valor no Painel">${p.semValor} s/ valor</span>`
    : txt;
}
function tempoPessoaHTML(p) {
  if (!p.horas.length) return '<span class="text-muted">—</span> <small>sem saída e retorno anotados</small>';
  const txt = fmtHorasCasa(mediaCasa(p.horas));
  return p.horas.length < p.os
    ? `${txt} <small>média de ${p.horas.length} de ${p.os} O.S</small>`
    : txt;
}

function produtividadeHTML() {
  const f = periodoOuMes('_fPerf');
  const { noPeriodo, pessoas } = pessoasDoPeriodo(f);
  const semEquipe = noPeriodo.filter(o => !OPERACAO.equipe(o).length).length;
  const cards = pessoas.map(p => `<div class="casa-prod" ${p.pessoa && p.pessoa.chave ? `data-pessoa="${esc(p.pessoa.chave)}"` : ''}>
      ${avatarRH(p.pessoa || { nome: p.nome })}
      <div>
        <div class="casa-prod-nome">${esc(p.nome)}<small>${p.pessoa ? esc([p.pessoa.cargo, p.pessoa.area].filter(Boolean).join(' · ') || ('ID ' + (p.id || '—'))) : 'sem ficha do RH'}</small></div>
        <dl>
          <dt>Entregas realizadas</dt><dd>${p.os}${p.erp ? ` <small>(${p.erp} lançada${p.erp === 1 ? '' : 's'})</small>` : ''}${p.retrab ? ` <small>(${p.retrab} retrab.)</small>` : ''}</dd>
          <dt>Valor das O.S. (integral)</dt><dd>${valorPessoaHTML(p)}</dd>
          <dt>Tempo médio</dt><dd>${tempoPessoaHTML(p)}</dd>
        </dl>
      </div>
    </div>`).join('');
  return `<section class="casa-prod-box">
      <h3>Produtividade</h3>
      <p>Visão operacional da equipe registrada na O.S.; pode diferir das participações conferidas acima. O valor é integral por pessoa e não deve ser somado entre colaboradores. Para apuração, use o relatório de participações. Tempo = saída → retorno registrados na O.S.</p>
      ${avisoJanelaCasa(f)}
      ${semEquipe ? `<p class="metricas-nota">${semEquipe} O.S no período sem equipe registrada — não contam para ninguém.</p>` : ''}
      ${pessoas.length ? `<div class="casa-prod-grid">${cards}</div>` : foraDaJanelaCasa(f)
        ? emptyState('', 'Nenhuma entrega com equipe nas O.S deste aparelho', `O aparelho guarda só os últimos ${janelaLocalCasa()} dias. O histórico está em Entregas.`)
        : emptyState('', 'Nenhuma entrega com equipe no período', 'A O.S precisa ter equipe e ser finalizada no PCP.')}
    </section>`;
}

/* ── Retrabalho cruzado com a gente ────────────────────────────────────────
   A O.S filha (RETRABALHO) carrega etapa de origem, causa raiz e responsável
   desde 14/09/2026. Aqui isso vira: quem teve mais, de onde veio e por quê.
   Taxa = retrabalhos ÷ entregas da pessoa — sem entregas não há taxa. */
/* ── Serviços entregues: ano a ano e mês a mês ─────────────────────────────
   NÃO obedece ao filtro de período de propósito. A pergunta aqui é de
   HISTÓRICO — "como foi 2024 contra 2025" — e um recorte de 15 dias em cima
   disso responderia sempre "um mês". O filtro continua mandando nos quadros de
   retrabalho e de gente, que são do período. */
function servicosEntreguesHTML() {
  const entregues = classificarEntregas(STORE.getAllOS()).instalacoes
    .map(o => ({ dia: diaEntrega(o), valor: valorDaOS(o), servico: String(o.servico || '').trim() }))
    .filter(x => x.dia);
  /* O ESTADO VAZIO É JUSTO ONDE A RESSALVA MAIS IMPORTA: "nenhuma entrega
     registrada" lido sem ela vira "a casa não entregou nada", quando pode ser
     só "o aparelho ainda não baixou". Zero não é resultado. */
  if (!entregues.length) return '<p class="text-muted">Nenhuma instalação entregue entre as O.S guardadas neste aparelho. O histórico completo está na aba 📦 Entregas.</p>';

  const junta = (chave) => {
    const m = new Map();
    for (const x of entregues) {
      const k = chave(x); if (!k) continue;
      const d = m.get(k) || { k, n: 0, valor: 0, semValor: 0 };
      d.n++; if (x.valor == null) d.semValor++; else d.valor += x.valor;
      m.set(k, d);
    }
    return [...m.values()];
  };
  const anos = junta(x => x.dia.slice(0, 4)).sort((a, b) => a.k.localeCompare(b.k));
  const meses = junta(x => x.dia.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)).slice(-24);

  /* O ANO CORRENTE ESTÁ PELA METADE e não pode ser comparado de igual para
     igual com um ano fechado: a queda apareceria como desempenho, quando é só
     o calendário. Marca-se em vez de esconder. */
  const anoAtual = String(new Date().getFullYear());
  const anosHTML = barrasCasa(anos.map(a => ({
    rotulo: a.k + (a.k === anoAtual ? ' (em curso)' : ''),
    valor: a.n,
    extra: `${dinheiroCurto(a.valor)}${a.semValor ? ` · ${a.semValor} sem valor` : ''}`
  })), v => `${v} O.S`) || '<p class="text-muted">Sem ano apurado.</p>';

  const mesesHTML = barrasCasa(meses.map(m => ({
    rotulo: rotuloMesCasa(m.k), valor: m.n, extra: dinheiroCurto(m.valor)
  })), v => `${v} O.S`) || '<p class="text-muted">Sem mês apurado.</p>';

  /* NÃO EXISTE "MÉDIA POR ANO FECHADO" AQUI, e havia um cartão afirmando uma.
     `anos` sai do que está no aparelho, que é a janela de poucas semanas. Um
     ano que não seja o corrente só aparece nessa lista entre 1º de janeiro e
     o fim da janela -- e aparece pela PONTA, com as últimas semanas de
     dezembro. O cartão então dividia, por exemplo, 200 entregas de meio mês
     e anunciava "média por ano fechado". Nos outros dez meses do ano ele
     simplesmente não aparecia, o que escondia o defeito. Acrescentar "· só o
     que está no aparelho" não resolvia: a ressalva fazia o número parecer
     conferido. Média anual é pergunta para o servidor, que tem 2020 em
     diante; enquanto este quadro ler o aparelho, ele não responde isso. */
  const esteAno = anos.find(a => a.k === anoAtual);

  /* ESTE QUADRO NÃO ALCANÇA O HISTÓRICO INTEIRO, e até 21/09/2026 dizia que
     alcançava. Ele conta `STORE.getAllOS()`, e o aparelho guarda finalizadas
     só da janela de STORE.JANELA_LOCAL_DIAS dias (store.js) -- o resto vem por
     busca. Na base de produção, naquele dia, eram 743 entregas no total e 464
     dentro da janela: junho inteiro (30) e 249 das 303 de julho ficavam de
     fora, e mesmo assim o texto prometia "histórico inteiro" e "desde o
     começo". Número menor com legenda de número maior é pior que número
     ausente: ninguém desconfia. Quem tem o histórico completo é o servidor
     (`entreguesResumo`), que a aba Entregas › Relatórios já usa -- enquanto
     este quadro não for ligado nele, o texto diz o que o número é de verdade
     e manda o dono para onde a resposta inteira está. */
  const janela = (typeof STORE.JANELA_LOCAL_DIAS === 'number') ? STORE.JANELA_LOCAL_DIAS : 60;

  return `<p class="text-muted" style="font-size:.8rem">${entregues.length} instalações entregues entre as O.S guardadas neste aparelho — as dos últimos ${janela} dias. Não entram as retiradas internas nem as que o ERP encerrou e ainda esperam lançamento. Este quadro ignora o filtro de período acima, de propósito; para o histórico de todos os anos, a aba 📦 Entregas.</p>
    <div class="casa-kpi-cards">
      <div class="casa-kpi"><b>${entregues.length}</b><small>instalações entregues, no aparelho</small></div>
      <div class="casa-kpi"><b>${esteAno ? esteAno.n : 0}</b><small>dessas, em ${anoAtual}</small></div>
    </div>
    <div class="casa-duas">
      <div><h4>Por ano</h4>${anosHTML}</div>
      <div><h4>Mês a mês <small>— últimos ${meses.length}</small></h4>${mesesHTML}</div>
    </div>`;
}

function retrabalhoHTML(f) {
  const todas = STORE.getAllOS();
  const doPeriodo = todas.filter(o => o.retrabalho && OPERACAO.emIntervalo(diaEntrega(o) || o.dataRetrabalho || o.criadoEm, f.de, f.ate));
  const { pessoas } = pessoasDoPeriodo(f);
  /* A O.S FILHA É QUEM REFAZ. A marcada com `retrabalho` é a que VOLTOU; o ERP
     emite uma O.S NOVA para a correção, ligada pelo campo `osOriginal`. Quem
     foi corrigir, quantas horas gastou e quantos km rodou está na FILHA — a
     mãe guarda a viagem da entrega original. Somar a mãe cobrava a viagem
     errada (R$ 1.040 onde a aba Retrabalho, que já pareia certo, dizia R$ 120)
     e nomeava quem ENTREGOU como quem refez, na parede da fábrica. */
  const filhaDe = new Map();
  for (const x of todas) {
    const orig = String(x.osOriginal || '').trim();
    if (orig) filhaDe.set(orig, x);
  }
  const filha = o => filhaDe.get(String(o.numero || '').trim()) || null;
  const refizeram = new Map();
  for (const o of doPeriodo) {
    const c = filha(o);
    for (const ap of OPERACAO.equipe(c || {})) {
      const p = nomeExibicaoCasa(ap);
      refizeram.set(p.chave, { rotulo: p.nome, valor: (refizeram.get(p.chave)?.valor || 0) + 1 });
    }
  }
  const porPessoa = [...refizeram.values()].sort((a, b) => b.valor - a.valor);
  // "De quem voltou serviço" é outra pergunta, e continua valendo — só não pode
  // usar o mesmo título de "quem refez".
  const porQuemEntregou = pessoas.filter(p => p.retrab > 0)
    .map(p => ({ rotulo: `${p.nome}`, valor: p.retrab, extra: `${p.os} entregas · ${Math.round(p.retrab / p.os * 100)}%` }))
    .sort((a, b) => b.valor - a.valor);
  /* Antes isto empilhava "não informado" como se fosse uma categoria, e a tela
     desenhava uma barra cheia dizendo 3 — parecia resposta e era ausência de
     resposta. Agora o preenchido vai para o gráfico e o resto é contado à
     parte, para a frase dizer quantas faltam preencher. */
  /* `campo` pode ser o NOME de um campo ou uma REGRA. Existe pergunta que
     mora em dois campos -- a causa do retrabalho e uma delas -- e ler so um
     deles faz a tela afirmar ausencia onde ha resposta. */
  const contar = (campo, lista) => {
    const base = lista || doPeriodo;
    const ler = typeof campo === 'function' ? campo : (o) => o[campo];
    const m = new Map(); let vazios = 0;
    for (const o of base) {
      const k = String(ler(o) || '').trim();
      if (!k) { vazios++; continue; }
      m.set(k, (m.get(k) || 0) + 1);
    }
    const itens = [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);
    return { itens, vazios, total: base.length };
  };
  /* A CAUSA MORA EM DOIS CAMPOS, e esta tela lia so o novo.
     `causaRaiz` vem do formulario do PCP (lista fixa CAUSAS_RAIZ: Erro
     humano, Material, Comunicacao...). `causa` vem da ficha e do app do
     instalador (lista de Configuracoes: Erro de medida, Falha de fixacao...).
     Em 21/09/2026, das 7 O.S de retrabalho da base, ZERO tinham `causaRaiz` e
     5 tinham `causa` -- e esta tela escrevia "Nenhuma das 3 O.S tem isto
     preenchido" sobre O.S que TINHAM o motivo anotado, enquanto a aba
     Retrabalho, que ja le os dois (app.js, coluna Motivo), mostrava
     "Falha de fixacao" e "Erro de medida". Duas telas da mesma casa, a mesma
     pergunta, respostas opostas -- e a errada e a que vai para a Gestao e
     para o Modo TV. Aqui passa a valer a MESMA regra da outra tela. */
  const etapas = contar('etapaOrigem'), causas = contar(o => o.causaRaiz || o.causa), responsaveis = contar('responsavelEtapa');
  const tipos = contar('servico'), clientes = contar('cliente');
  /* Uma dimensão 100% vazia não vira gráfico: vira uma frase que diz o que
     preencher e onde. Gráfico de um item só chamado "não informado" ocupa o
     lugar da informação sem ser informação. */
  const dimensao = (d, ondePreencher) => {
    if (!d.itens.length) return `<p class="text-muted">Nenhuma das ${d.total} O.S tem isto preenchido${ondePreencher ? ` — ${ondePreencher}` : ''}.</p>`;
    const barras = barrasCasa(d.itens, v => `${v}`);
    return barras + (d.vazios ? `<p class="text-muted" style="font-size:.78rem">${d.vazios} de ${d.total} sem preencher.</p>` : '');
  };
  const cfgCusto = (STORE.getCFG().custoRetrabalho) || {};
  const horaR = Number(cfgCusto.hora) || 0, kmR = Number(cfgCusto.km) || 0;
  // Horas e km da CORREÇÃO (a filha), nunca da entrega original.
  let horas = 0, km = 0, semFilha = 0;
  for (const o of doPeriodo) {
    const c = filha(o);
    if (!c) { semFilha++; continue; }
    const h = OPERACAO.horas(c); if (h != null) horas += h;
    const a = Number(c.kmSaida), b = Number(c.kmRetorno);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) km += b - a;
  }
  const custo = horas * horaR + km * kmR;
  /* A LEITURA QUE FALTAVA: numa linha só, quem entregou, quanto voltou e
     quantas vezes a pessoa foi refazer. Nos três gráficos separados dava para
     ver cada número e não dava para ver a PESSOA. Taxa alta com uma entrega só
     não é sinal de nada — por isso a contagem vai junto do percentual. */
  const porNome = new Map();
  for (const p of pessoas) porNome.set(p.chave, { nome: p.nome, entregas: p.os, voltou: p.retrab, refez: 0 });
  for (const [chave, v] of refizeram) {
    const d = porNome.get(chave) || { nome: v.rotulo, entregas: 0, voltou: 0, refez: 0 };
    d.refez = v.valor; porNome.set(chave, d);
  }
  const linhasPessoa = [...porNome.values()]
    .filter(d => d.voltou > 0 || d.refez > 0)
    .sort((a, b) => (b.voltou + b.refez) - (a.voltou + a.refez) || b.entregas - a.entregas);
  const tabelaPessoas = linhasPessoa.length ? `<div class="casa-tabela-rol"><table class="casa-tabela">
      <thead><tr><th>Pessoa</th><th class="num">Entregas</th><th class="num">Voltaram</th><th class="num">Taxa</th><th class="num">Foi refazer</th></tr></thead>
      <tbody>${linhasPessoa.map(d => `<tr>
        <td>${esc(d.nome)}</td>
        <td class="num">${d.entregas || '—'}</td>
        <td class="num">${d.voltou || '—'}</td>
        <td class="num">${d.entregas ? (d.voltou / d.entregas * 100).toFixed(0) + '%' : '—'}</td>
        <td class="num">${d.refez || '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-muted" style="font-size:.78rem">Taxa é sobre as entregas da própria pessoa no período — com poucas entregas ela sobe fácil e não quer dizer muito.</p>`
    : '<p class="text-muted">Ninguém com retrabalho no período.</p>';

  /* A TAXA É A MESMA DA ABA RETRABALHO (OPERACAO.taxaRetrabalho): O.S afetadas
     sobre O.S entregues. Dividir pela soma das participações baixava o número
     para a metade ou um terço com equipes de duas ou três pessoas, e a Gestão e
     a TV mostravam uma resposta diferente da aba Retrabalho. */
  const ind = OPERACAO.taxaRetrabalho(todas, f.de, f.ate);
  if (!doPeriodo.length) return foraDaJanelaCasa(f)
    ? `<p class="text-muted">Nenhum retrabalho nas O.S guardadas neste aparelho. Ele guarda só os últimos ${janelaLocalCasa()} dias; o histórico está em Entregas.</p>`
    : '<p class="text-muted">Nenhum retrabalho registrado no período. 🎉</p>';
  return `${avisoJanelaCasa(f)}<div class="casa-kpi-cards">
      <div class="casa-kpi alerta"><b>${doPeriodo.length}</b><small>O.S de retrabalho no período</small></div>
      <div class="casa-kpi"><b>${ind.taxa == null ? 'sem entregas' : String(ind.taxa).replace('.', ',') + '%'}</b><small>${ind.afetadas} de ${ind.entregues} entregas finalizadas voltaram (a taxa não conta O.S. aberta nem baixa do ERP)</small></div>
      <div class="casa-kpi"><b>${fmtHorasCasa(horas || null)}</b><small>horas na rua refazendo${km ? ` · ${Math.round(km)} km` : ''}${semFilha ? ` · <span class="badge sem-valor">${semFilha} sem O.S de correção ligada</span>` : ''}</small></div>
      ${custo > 0 ? `<div class="casa-kpi alerta"><b>${dinheiroCasa(custo)}</b><small>custo estimado (hora + km de Configurações)</small></div>` : ''}
    </div>
    <div class="casa-duas">
      <div><h4>Por tipo de serviço</h4>${dimensao(tipos, 'o serviço vem do ERP')}</div>
      <div><h4>Por cliente</h4>${dimensao(clientes, 'o cliente vem do ERP')}</div>
    </div>
    <h4>Gente</h4>
    ${tabelaPessoas}
    <div class="casa-duas">
      <div><h4>De quem voltou serviço</h4>${barrasCasa(porQuemEntregou, v => `${v}`) || '<p class="text-muted">Nenhuma equipe registrada nas entregas que voltaram.</p>'}</div>
      <div><h4>Quem foi refazer</h4>${barrasCasa(porPessoa, v => `${v}`) || '<p class="text-muted">Nenhuma O.S de correção com equipe registrada. Ligue a correção à original pelo campo “retrabalho da O.S nº”.</p>'}</div>
    </div>
    <div class="casa-duas">
      <div><h4>Por etapa de origem</h4>${dimensao(etapas, 'preenche-se na O.S que voltou')}</div>
      <div><h4>Por causa</h4>${dimensao(causas, 'preenche-se na O.S que voltou, no formulário de retrabalho ou no campo Causa da ficha')}</div>
    </div>
    <div class="casa-duas">
      <div><h4>Responsável da etapa de origem</h4>${dimensao(responsaveis, 'preenche-se na O.S que voltou')}</div>
      <div></div>
    </div>
    <p class="text-muted" style="font-size:.8rem"><strong>Quem foi refazer</strong> é a equipe da O.S de correção. <strong>De quem voltou serviço</strong> é a equipe da entrega original — e não quer dizer culpa: quem causou está na etapa de origem e no responsável acima. Valor por hora e por km ficam em ⚙️ Configurações.</p>`;
}

/* ── Carros mais usados ────────────────────────────────────────────────────
   Conta a O.S onde o carro foi programado no período (saiu da garagem), não só
   a finalizada. Lotação, grade e motorista vêm do Ativos do Painel. */
function carrosHTML(f) {
  const m = new Map();
  for (const os of STORE.getAllOS()) {
    const nome = String(os.veiculo || '').trim();
    if (!nome || OPERACAO.semCarro(os)) continue; // instalação interna não é carro
    const dia = OPERACAO.dia(os.instalacao && os.instalacao.data) || diaEntrega(os);
    if (!OPERACAO.emIntervalo(dia, f.de, f.ate)) continue;
    const d = m.get(nome) || { nome, os: 0, km: 0, pessoas: new Set() };
    d.os++;
    const a = Number(os.kmSaida), b = Number(os.kmRetorno);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) d.km += b - a;
    for (const p of OPERACAO.equipe(os)) d.pessoas.add(OPERACAO.nomePessoa(p));
    m.set(nome, d);
  }
  const lista = [...m.values()].sort((a, b) => b.os - a.os);
  if (!lista.length) {
    const foraDoPeriodo = STORE.getAllOS().filter(o => String(o.veiculo || '').trim()).length;
    if (foraDaJanelaCasa(f)) return `<p class="text-muted">Nenhuma O.S com veículo entre as guardadas neste aparelho. Ele guarda só os últimos ${janelaLocalCasa()} dias.</p>`;
    return `<p class="text-muted">Nenhuma O.S com veículo neste período.${foraDoPeriodo ? ` Há ${foraDoPeriodo} O.S com veículo em outras datas — amplie o período acima para vê-las.` : ' O campo Veículo da O.S está em branco em todas — sem ele não dá para saber que carro rodou.'}</p>`;
  }
  const semUso = veiculosRH().filter(v => !lista.some(x => normCasa(x.nome) === normCasa(v.nome)));
  return `${avisoJanelaCasa(f)}${barrasCasa(lista.map(c => ({ rotulo: c.nome, valor: c.os, extra: c.km ? `${Math.round(c.km)} km` : '' })), v => `${v} O.S`)}
    <div class="casa-tabela-wrap"><table class="casa-tabela">
      <thead><tr><th>Veículo</th><th>Ficha (Ativos)</th><th class="num">O.S</th><th class="num">Km</th><th>Quem levou</th></tr></thead>
      <tbody>${lista.map(c => {
        const v = veiculosRH().find(x => normCasa(x.nome) === normCasa(c.nome));
        const ficha = v ? [v.modelo, v.placa, v.lugares ? `${v.lugares} lugares` : '', v.grade ? 'com grade' : '', v.motorista ? `motorista: ${v.motorista}` : ''].filter(Boolean).join(' · ') : '<span class="badge sem-valor">sem cadastro no Ativos</span>';
        return `<tr><td><strong>${esc(c.nome)}</strong></td><td>${v ? esc(ficha) : ficha}</td><td class="num">${c.os}</td><td class="num">${c.km ? Math.round(c.km) : '—'}</td><td>${esc([...c.pessoas].slice(0, 4).join(', ') || '—')}${c.pessoas.size > 4 ? ` +${c.pessoas.size - 4}` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    ${semUso.length ? `<p class="text-muted" style="font-size:.8rem">Cadastrados no Ativos e sem nenhuma O.S no período: ${esc(semUso.map(v => v.nome).join(', '))}.</p>` : ''}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   NOMES ANTIGOS VIRAM ID PELA TELA (F12, 30/09/2026)
   As O.S. antigas guardam o nome que o PCP digitava ("Lucas", "Adlando"); a
   régua de pessoas acha o dono na leitura, mas o primeiro fechamento sela a
   chave, e um xará novo no RH muda a resolução. Aqui a gestão (admin e pcp)
   troca o nome pelo ID em os.equipe, com o vínculo confirmado
   (OPERACAO.converterEquipe), UMA O.S. POR VEZ, pelo upsert normal: cada O.S.
   é relida do STORE antes de gravar, vai sozinha ao servidor e entra no
   diário da F03 com o autor do crachá. O.S. com divisão (os.alocacao) é
   pulada: a equipe dela sai da divisão. O relatório diz O.S. por O.S. o que
   houve, e "Desfazer" devolve exatamente a lista anterior.
   As O.S. fora da janela do aparelho (finalizadas há mais de 60 dias) vêm
   do servidor pelo mesmo caminho da F09 (STORE.buscarHistorico), sob
   demanda; até lá, a tela diz que ficaram de fora. Nada calado.
   ══════════════════════════════════════════════════════════════════════════ */
const CHAVE_REL_CONV_NOMES = 'impresilk_inst_conv_nomes';
let _convNomesLote = null;    // {tipo, feitas, total}: o lote em curso
let _convNomesHist = null;    // a busca das antigas: {estado, novas, de, ate, truncados, erro}
let _convNomesRelMem = null;  // o relatório, quando o localStorage recusa
let _convNomesDifere = null;  // a última conferência no servidor: {em, itens:[{nome, local, servidor}]}
/* Sem a lista de pessoas do RH neste aparelho (elenco vazio ou só nomes),
   o ID repetido entre ficha e contrato não pode ser conferido: não converte.
   E sem as funções novas do operacao.js (aba com versões misturadas no meio
   de uma atualização), a tela mostra o quadro antigo em vez de quebrar. */
const f12Carregada = () => typeof OPERACAO !== 'undefined' && ['converterEquipe', 'confirmarNome', 'dadosPessoas'].every(k => typeof OPERACAO[k] === 'function');
const rhProntoParaConverter = () => f12Carregada() && temFichaRH() && pessoasRH().some(p => OPERACAO.ehIdPessoa(p.id));
const SEM_RH_CONV = 'A lista de pessoas do RH ainda não carregou neste aparelho: sem ela não dá para conferir ID repetido. Atualize a página e tente de novo.';
const podeConverterNomes = () => ['admin', 'pcp'].includes(String((typeof STATE !== 'undefined' && STATE.user && STATE.user.papel) || ''));
const SO_GESTAO_CONV = 'Só a gestão (admin e pcp) troca o nome pelo ID: nada foi gravado.';
const temDivisaoCasa = o => !!(o && o.alocacao && typeof o.alocacao === 'object' && !Array.isArray(o.alocacao));
const listaCruaCasa = v => (Array.isArray(v) ? v : []).slice();
const mesmaListaCasa = (a, b) => JSON.stringify(listaCruaCasa(a)) === JSON.stringify(listaCruaCasa(b));
const dataBRConv = d => /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
// O nome completo da ficha (o relatório e a confirmação são conferência de gente).
const nomeCompletoIdCasa = id => { const p = pessoaRHPorId6(id); return (p && p.nome) || OPERACAO.nomePessoa(id); };
const rotuloGravarId = n => n === 1 ? 'Gravar o ID em 1 O.S.' : `Gravar o ID nas ${n} O.S.`;
const MOTIVO_NOME = {
  terceiro: 'marcador de terceiro, não é pessoa',
  'sem-ficha': 'decidido: terceiro, sem ficha no RH',
  'vinculo-invalido': 'o vínculo salvo não leva a uma pessoa só (duplicado ou ID repetido)',
  'id-repetido': 'ID repetido no RH entre ficha e contrato: confira o CPF',
  'sem-cpf': 'a ficha ou o contrato não tem CPF, então não tem ID',
  'vinculo-sem-id': 'ligado à mão a uma ficha sem CPF, então sem ID',
  ambiguo: 'serve para mais de uma pessoa',
  desligado: 'só casa com quem já saiu da empresa',
  comeco: 'ligado só pelo começo do nome: falta confirmar',
  nenhuma: 'nenhuma ficha no RH',
  'servidor-difere': 'o servidor resolve diferente; atualize e confira',
};

/* Uso de cada nome nas O.S. da conferência: quantas O.S. o nome converteria
   (sem divisão) e quantas ficam de fora por já terem divisão. */
function usoDosNomesCasa(lista) {
  const uso = new Map();
  for (const o of lista || osDaConferencia()) {
    const vistos = new Set();
    for (const x of Array.isArray(o && o.equipe) ? o.equipe : []) {
      const s = String(x ?? '').trim();
      const k = normCasa(s);
      if (!s || OPERACAO.ehIdPessoa(s) || vistos.has(k)) continue;
      vistos.add(k);
      const u = uso.get(k) || { semDivisao: 0, comDivisao: 0 };
      if (temDivisaoCasa(o)) u.comDivisao++; else u.semDivisao++;
      uso.set(k, u);
    }
  }
  return uso;
}

/* O PLANO: as O.S. em que algum nome confirmado vira ID. `nomes` limita a
   alguns nomes (o botão de uma linha); sem ele, todos os confirmados.
   Devolve {tarefas:[{id, numero, trocas, divisao}], aprovado: Map(nome -> id),
   converte, comDivisao}. As com divisão entram nas tarefas para o relatório
   dizer que foram puladas. */
function planoConversaoNomes(nomes, lista, dados) {
  const d = dados || OPERACAO.dadosPessoas();
  const so = Array.isArray(nomes) && nomes.length ? { nomes } : {};
  const tarefas = [], aprovado = new Map(), rotulos = new Map(), comos = new Map();
  let converte = 0, comDivisao = 0;
  for (const o of lista || osDaConferencia()) {
    const eq = Array.isArray(o && o.equipe) ? o.equipe : [];
    if (!eq.some(x => { const s = String(x ?? '').trim(); return s && !OPERACAO.ehIdPessoa(s); })) continue;
    const c = OPERACAO.converterEquipe(eq, d, so);
    if (!c.mudou) continue;
    const divisao = temDivisaoCasa(o);
    if (divisao) comDivisao++; else converte++;
    for (const t of c.trocas) {
      const k = normCasa(t.de);
      aprovado.set(k, t.para); comos.set(k, t.como);
      if (!rotulos.has(k)) rotulos.set(k, t.de);
    }
    tarefas.push({ id: o.id, numero: String(o.numero || ''), trocas: c.trocas, divisao });
  }
  // As com divisão por último: primeiro o que grava.
  tarefas.sort((a, b) => a.divisao - b.divisao);
  return { tarefas, aprovado, rotulos, comos, converte, comDivisao };
}

/* A RÉGUA DO SERVIDOR (revisão da F12, 30/09/2026). O aparelho decidia com o
   retrato que tinha: a configuração de até 5 min, o elenco de até 30 min,
   dias sem rede, e o contrato encerrado sem CPF que não desce. O lote grava
   em O.S. de produção e decide quem pontua e quem recebe comissão: antes de
   gravar, a ação conferirNomes do pcp-sync (só leitura, só admin e pcp)
   devolve a resolução DO SERVIDOR (o vinculosRH gravado e o RH de agora,
   pela régua de _shared/pcp-integridade.mjs), o estado de cada O.S. pedida
   ('viva', 'excluida', 'ausente') e os períodos fechados da Performance.
   Sem resposta, nada é gravado. */
async function conferirNoServidorCasa(S, nomes, ids) {
  if (!S || typeof S.conferirNomes !== 'function') return { ok: false, motivo: 'esta tela está desatualizada e não confere os nomes no servidor. Recarregue a página' };
  const porChave = new Map();
  for (const n of nomes || []) { const s = String(n ?? '').trim(); if (s && !porChave.has(normCasa(s))) porChave.set(normCasa(s), s); }
  const ns = [...porChave.values()], is = [...new Set((ids || []).map(x => String(x ?? '')).filter(Boolean))];
  const porNome = new Map(), os = new Map();
  let fechados = [];
  const LOTE = 300, voltas = Math.max(1, Math.ceil(ns.length / LOTE), Math.ceil(is.length / LOTE));
  try {
    for (let v = 0; v < voltas; v++) {
      const r = await S.conferirNomes(ns.slice(v * LOTE, (v + 1) * LOTE), is.slice(v * LOTE, (v + 1) * LOTE));
      if (!r || r.offline) return { ok: false, motivo: 'sem internet para conferir no servidor' };
      for (const x of Array.isArray(r.nomes) ? r.nomes : []) {
        if (x && x.nome) porNome.set(normCasa(x.nome), { id: OPERACAO.ehIdPessoa(x.id) ? String(x.id).trim() : '', fixado: x.fixado === true });
      }
      for (const [id, e] of Object.entries(r.os || {})) os.set(id, String(e));
      if (v === 0) fechados = (Array.isArray(r.fechados) ? r.fechados : []).filter(f => f && /^\d{4}-\d{2}-\d{2}$/.test(f.de) && /^\d{4}-\d{2}-\d{2}$/.test(f.ate));
    }
  } catch (e) {
    return { ok: false, motivo: 'o servidor não respondeu à conferência: ' + String((e && e.message) || e).replace(/[.\s]*$/, '') };
  }
  return { ok: true, porNome, os, fechados, em: new Date().toISOString() };
}
/* O servidor lê o nome como o aparelho? O mesmo ID e, quando o aparelho
   converte por um vínculo salvo, o vínculo aceito lá também. Nome sem
   resposta do servidor não converte. */
const servidorConcordaCasa = (srv, nome, id, como) => {
  const s = srv && srv.porNome ? srv.porNome.get(normCasa(nome)) : null;
  return !!s && !!id && s.id === id && (como !== 'vinculo' || s.fixado);
};
function acordoServidorCasa(plano, srv) {
  const acordo = new Map(), difere = [];
  for (const [k, id] of plano.aprovado) {
    const nome = (plano.rotulos && plano.rotulos.get(k)) || k;
    if (servidorConcordaCasa(srv, nome, id, plano.comos ? plano.comos.get(k) : '')) acordo.set(k, id);
    else { const s = srv && srv.porNome ? srv.porNome.get(normCasa(nome)) : null; difere.push({ nome, local: id, servidor: s ? s.id : '' }); }
  }
  return { acordo, difere };
}
const PULA_SERVIDOR = nomes => `${nomes.map(n => `"${n}"`).join(', ')}: o servidor resolve diferente; atualize e confira. Nada mudou nesta O.S.`;
/* O PERÍODO FECHADO NÃO MUDA (revisão da F12). O dia da O.S. na Performance
   é o do lançamento da entrega, senão o da finalização (o mesmo do servidor,
   perfFonte). Dentro de um período fechado, a O.S. fica como está. */
function periodoFechadoCasa(o, fechados) {
  const d = OPERACAO.dia((OPERACAO.entregaLancadaValida(o) || {}).data || (o && o.finalizadaEm) || '');
  return d ? (fechados || []).find(f => d >= f.de && d <= f.ate) || null : null;
}

/* O CELULAR DO INSTALADOR NÃO PODE PERDER A O.S. (crítica da F12). Depois da
   troca, o crachá só enxerga a O.S. se o nome dele na lista de instaladores
   levar ao mesmo ID no servidor. O casamento exato de hoje pode mudar com um
   xará novo no RH: o nome da lista que chega a um ID convertido vira vínculo
   salvo ANTES das O.S. (a configuração vai primeiro na fila). Nome da lista
   que só chega pelo começo do nome não é fixado sozinho: a tela avisa. */
function listaParaFixarCasa(aprovado, dados) {
  const alvos = new Set(aprovado.values());
  const fixar = [], avisar = [];
  for (const n of (STORE.getCFG().instaladores || []).map(String).filter(Boolean)) {
    if (OPERACAO.pessoaFixada(n)) continue;
    const c = OPERACAO.confirmarNome(n, dados);
    if (c.id && alvos.has(c.id) && c.como !== 'id') fixar.push({ nome: n, id: c.id });
    else if (!c.id && c.motivo === 'comeco' && alvos.has(c.sugerido)) avisar.push(n);
  }
  return { fixar, avisar };
}

/* O RESULTADO DE CADA GRAVAÇÃO vem pelos eventos do store (o mesmo caminho
   do Conferir da F09): 'os-gravada' com a lista que foi, o conflito (409), a
   recusa definitiva e a recusa que fica na fila. Um ouvinte por loja. */
const _convEsperas = new Map();
const _convLojas = typeof WeakSet === 'function' ? new WeakSet() : new Set();
function ouvirConversaoCasa(S) {
  if (!S || _convLojas.has(S)) return;
  _convLojas.add(S);
  const fim = (id, r) => { const w = _convEsperas.get(id); if (w) w.fim(r); };
  if (typeof S.on === 'function') {
    S.on('os-gravada', d => {
      const w = d && _convEsperas.get(d.id);
      if (!w || !d.enviado || !mesmaListaCasa(d.enviado.equipe, w.equipe)) return;
      w.fim({ estado: 'gravada', os: d.os });
    });
    const recusa = (d, naFila) => {
      const id = d && d.item && d.item.os && d.item.os.id;
      // A recusa de um envio anterior da mesma O.S. (outra lista) não é a desta troca.
      if (!id || !_convEsperas.has(id) || !mesmaListaCasa(d.item.os.equipe, _convEsperas.get(id).equipe)) return;
      const motivo = String((d && d.motivo) || 'sem motivo informado').replace(/[.\s]*$/, '.');
      fim(id, { estado: 'recusada', motivo: naFila ? `O servidor não aceitou: ${motivo} A troca ficou na fila deste aparelho.` : `O servidor recusou: ${motivo}` });
    };
    S.on('item-recusado', d => recusa(d, false));
    S.on('item-pendente', d => recusa(d, true));
  }
  if (typeof S.onConflict === 'function') S.onConflict((local, remoto) => {
    const id = (remoto && remoto.id) || (local && local.id);
    const quem = remoto && remoto.atualizadoPor ? ` (${remoto.atualizadoPor})` : '';
    /* Mesmo que o 409 seja de um envio anterior da mesma O.S., a troca fica
       presa atrás dele (a fila marca a O.S.): o resultado é o mesmo. */
    fim(id, { estado: 'recusada', motivo: `Outra gravação desta O.S. chegou antes ao servidor${quem}. A troca não foi aceita: ficou só neste aparelho, na fila, até alguém resolver o aviso de conflito ("Recarregar" descarta a troca; "Sobrescrever" envia).` });
  });
}
const dormirCasa = ms => new Promise(r => setTimeout(r, ms));
const itemNaFilaCasa = (S, id) => (typeof S.getQueue === 'function' ? (S.getQueue() || []) : []).find(it => it && it.action === 'upsert' && it.os && it.os.id === id) || null;
/* Grava UMA O.S. e espera o servidor dizer o que houve com ela. Sem rede, ou
   sem resposta no prazo, a troca fica na fila (o normal do aparelho) e o
   relatório diz isso. O conflito (409) de uma O.S. não segura as outras: o
   store marca só aquela e segue. */
async function gravarUmaEsperandoCasa(S, os, o = {}) {
  const prazo = Number.isFinite(o.prazoMs) ? o.prazoMs : 20000;
  const passo = Number.isFinite(o.passoMs) ? o.passoMs : 500;
  let fim;
  const resultado = new Promise(r => { fim = r; });
  const w = { equipe: listaCruaCasa(os.equipe), feito: false, fim: r => { if (w.feito) return; w.feito = true; if (_convEsperas.get(os.id) === w) _convEsperas.delete(os.id); fim(r); } };
  _convEsperas.set(os.id, w);
  try { S.saveOS(os); }
  catch (e) { w.fim({ estado: 'recusada', motivo: 'Não deu para guardar neste aparelho: ' + String((e && e.message) || e) }); return resultado; }
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    w.fim({ estado: 'na-fila', semResposta: true, motivo: 'Sem internet: a troca ficou na fila deste aparelho e vai na próxima sincronização.' });
    return resultado;
  }
  const t0 = Date.now();
  while (!w.feito) {
    try { if (typeof S.trySync === 'function') await S.trySync(); } catch (e) { /* a fila guarda; o resultado vem pelos eventos ou pelo prazo */ }
    if (w.feito) break;
    const it = itemNaFilaCasa(S, os.id);
    // Loja sem eventos (a prévia local) e fila sem a O.S.: foi.
    if (!it && typeof S.on !== 'function') { w.fim({ estado: 'gravada' }); break; }
    if (it && it.recusa && it.recusa.motivo && mesmaListaCasa(it.os.equipe, w.equipe)) {
      w.fim({ estado: 'recusada', motivo: `O servidor não aceitou: ${String(it.recusa.motivo).replace(/[.\s]*$/, '.')} A troca ficou na fila deste aparelho.` });
      break;
    }
    /* Saiu da fila sem o aviso desta lista (o conflito resolvido com
       "Recarregar", ou outra gravação da O.S. no meio): vale o que o aparelho
       tem agora, nunca um "gravada" por ausência. */
    if (!it && Date.now() - t0 >= passo) {
      const agora = typeof S.getOS === 'function' ? S.getOS(os.id) : null;
      w.fim(agora && mesmaListaCasa(agora.equipe, w.equipe) ? { estado: 'gravada' }
        : { estado: 'recusada', motivo: 'A O.S. voltou a outra versão durante a troca (o aviso de conflito foi resolvido com "Recarregar", ou outra gravação chegou antes): a troca não valeu nela.' });
      break;
    }
    if (Date.now() - t0 >= prazo) { w.fim({ estado: 'na-fila', semResposta: true, motivo: 'O servidor ainda não confirmou esta O.S.: a troca ficou na fila deste aparelho e vai na próxima sincronização. Se houver um aviso de conflito desta O.S. aberto, resolva-o primeiro.' }); break; }
    await dormirCasa(passo);
  }
  return resultado;
}

/* O LOTE: uma O.S. por vez, relida do STORE antes de gravar. `decidir(atual)`
   devolve {equipe, trocas, nota} ou {pular: motivo}. Devolve um item por
   tarefa: {id, numero, estado ('convertida' | 'na-fila' | 'pulada' |
   'recusada'), motivo, nota, antes, depois, trocas}.
   A PORTA CONFERE (revisão da F12): o papel (quem chama pelo console não
   passa pelo botão), a O.S. excluída no servidor (o upsert a ressuscitaria)
   e o período fechado da Performance, com a régua do servidor
   (`o.servidor`, de conferirNoServidorCasa; sem ela, pergunta aqui).
   O ITEM VAI AO RELATÓRIO COMO 'enviando', com a lista de antes e a de
   depois, ANTES do saveOS: a aba que fecha no meio deixa o Desfazer
   alcançar a O.S. que a fila ainda vai mandar. */
async function gravarEquipesUmaAUmaCasa(tarefas, decidir, o = {}) {
  const S = o.store || STORE;
  const numeroDe = t => String((t && t.numero) || '');
  if (!podeConverterNomes()) return tarefas.map(t => ({ id: t.id, numero: numeroDe(t), estado: 'recusada', motivo: SO_GESTAO_CONV }));
  let srv = o.servidor && o.servidor.ok ? o.servidor : null;
  if (!srv) {
    srv = await conferirNoServidorCasa(S, [], tarefas.map(t => t.id));
    if (!srv.ok) return tarefas.map(t => ({ id: t.id, numero: numeroDe(t), estado: 'pulada', motivo: `Nada foi enviado: ${srv.motivo}.` }));
  }
  ouvirConversaoCasa(S);
  const itens = [];
  const avisarItem = () => { if (typeof o.aoItem === 'function') { try { o.aoItem(itens); } catch (e) { /* o relatório parcial é conveniência */ } } };
  /* SERVIDOR MUDO NÃO VIRA FILA DE CENTO E TANTAS: duas O.S. seguidas sem
     resposta (ou sem internet) param o lote; as outras ficam como estão, e
     o relatório diz. Gravar de novo continua de onde parou (a troca é
     idempotente). */
  let mudas = 0;
  for (let i = 0; i < tarefas.length; i++) {
    const t = tarefas[i];
    if (mudas >= 2) {
      itens.push({ id: t.id, numero: numeroDe(t), estado: 'pulada', motivo: 'Não enviada: o servidor parou de responder no meio. Nada mudou nesta O.S.; grave de novo quando a conexão voltar.' });
      avisarItem();
      continue;
    }
    if (typeof o.aoProgresso === 'function') { try { o.aoProgresso(i, tarefas.length); } catch (e) { /* a tela pode ter saído */ } }
    const pos = itens.length;
    try {
      // RELÊ do STORE agora, não a cópia de quando a tela pintou.
      const atual = typeof S.getOS === 'function' ? S.getOS(t.id) : null;
      const numero = String((atual && atual.numero) || t.numero || '');
      if (!atual) { itens.push({ id: t.id, numero, estado: 'recusada', motivo: 'A O.S. não está neste aparelho agora (é antiga, ou saiu da lista). Busque as antigas no servidor e tente de novo.' }); continue; }
      /* EXCLUÍDA NO SERVIDOR: o upsert da gestão ressuscita a O.S. (por
         desenho), e a antiga que a tela buscou fica só na memória desta aba,
         sem lápide. A que não está na lista do aparelho é conferida agora,
         uma a uma; a da lista, pela conferência do começo do lote. */
      const naLista = (typeof S.getAllOS === 'function' ? S.getAllOS() || [] : []).some(x => x && x.id === t.id);
      let noServidor = srv.os.get(t.id) || '';
      if (!naLista) {
        const agora = await conferirNoServidorCasa(S, [], [t.id]);
        if (!agora.ok) { itens.push({ id: t.id, numero, estado: 'pulada', motivo: `Não deu para conferir no servidor se esta O.S. ainda existe (${agora.motivo}). Nada mudou nela.` }); continue; }
        noServidor = agora.os.get(t.id) || 'ausente';
      }
      if (noServidor === 'excluida') { itens.push({ id: t.id, numero, estado: 'pulada', motivo: 'Excluída no servidor: nada foi gravado, para a troca não trazê-la de volta.' }); continue; }
      if (!naLista && noServidor !== 'viva') { itens.push({ id: t.id, numero, estado: 'pulada', motivo: 'A O.S. não está no servidor: nada foi gravado.' }); continue; }
      const fech = periodoFechadoCasa(atual, srv.fechados);
      if (fech) { itens.push({ id: t.id, numero, estado: 'pulada', motivo: `Período já fechado na Performance (${dataBRConv(fech.de)} a ${dataBRConv(fech.ate)}): o fechamento selado não muda, e a O.S. fica como está.` }); continue; }
      const d = decidir(atual, t) || {};
      if (d.pular) { itens.push({ id: t.id, numero, estado: 'pulada', motivo: d.pular }); continue; }
      const antes = listaCruaCasa(atual.equipe), depois = listaCruaCasa(d.equipe);
      const extra = { ...(d.nota ? { nota: d.nota } : {}), antes, depois, ...(d.trocas ? { trocas: d.trocas } : {}) };
      const novo = JSON.parse(JSON.stringify(atual));
      novo.equipe = depois;
      novo.atualizadoEm = new Date().toISOString();
      novo.atualizadoPor = String(o.usuario || '');
      itens.push({ id: t.id, numero, estado: 'enviando', ...extra });
      avisarItem();
      const r = await gravarUmaEsperandoCasa(S, novo, o);
      mudas = r.semResposta ? mudas + 1 : 0;
      const estado = r.estado === 'gravada' ? 'convertida' : r.estado;
      itens[pos] = { id: t.id, numero, estado, ...(r.motivo ? { motivo: r.motivo } : {}), ...extra };
    } catch (e) {
      itens[pos] = { id: t.id, numero: numeroDe(t), estado: 'recusada', motivo: 'Erro neste aparelho: ' + String((e && e.message) || e) };
      itens.length = pos + 1;
    } finally {
      avisarItem();
    }
  }
  if (typeof o.aoProgresso === 'function') { try { o.aoProgresso(tarefas.length, tarefas.length); } catch (e) { /* idem */ } }
  return itens;
}

/* A MESMA CONFERÊNCIA DE DATAS DO SERVIDOR (validarMomentos em
   _shared/pcp-integridade.mjs, que confere a O.S. inteira a cada gravação da
   gestão e responde 400). A O.S. antiga com saída ou retorno inválido
   recusaria a troca e o Desfazer, e o item ficaria preso na fila da gestão:
   ela é pulada antes, com o motivo. tests/converter-equipe.test.cjs compara
   as duas. */
function momentosInvalidosCasa(os) {
  for (const k of ['saidaEm', 'retornoEm']) if (os[k] && (!/^\d{4}-\d{2}-\d{2}T/.test(os[k]) || !Number.isFinite(Date.parse(os[k])))) return 'Data de saída ou retorno inválida.';
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) return 'O retorno não pode ser anterior à saída.';
  return '';
}
const PULA_MOMENTO = m => `O servidor recusaria esta O.S. (${m.replace(/[.\s]*$/, '')}) e a troca ficaria presa na fila. Corrija a saída ou o retorno na ficha e grave de novo.`;

/* CONVERTER: a decisão é refeita em cada O.S. relida (outro aparelho pode ter
   mudado a equipe ou gravado a divisão), e só vale a troca que a pessoa
   aprovou: se o vínculo de um nome mudou no meio, a O.S. é pulada. E só o
   nome que o SERVIDOR lê como o aparelho vira ID (revisão da F12): o outro
   fica como nome, com o motivo. `o.servidor` é a conferência feita antes do
   confirm; sem ela (chamada direta), a conferência é feita aqui. */
async function converterNomesNasOSCasa(plano, o = {}) {
  const S = o.store || STORE;
  const tarefas = plano && Array.isArray(plano.tarefas) ? plano.tarefas : [];
  if (!podeConverterNomes()) return tarefas.map(t => ({ id: t.id, numero: String(t.numero || ''), estado: 'recusada', motivo: SO_GESTAO_CONV }));
  let srv = o.servidor && o.servidor.ok ? o.servidor : null;
  if (!srv) {
    srv = await conferirNoServidorCasa(S, [...plano.aprovado.keys()].map(k => (plano.rotulos && plano.rotulos.get(k)) || k), tarefas.map(t => t.id));
    if (!srv.ok) return tarefas.map(t => ({ id: t.id, numero: String(t.numero || ''), estado: 'pulada', motivo: `Nada foi enviado: ${srv.motivo}.` }));
  }
  const { acordo, difere } = acordoServidorCasa(plano, srv);
  const todos = [...plano.aprovado.keys()], nomes = [...acordo.keys()];
  /* O nome que o servidor lê diferente fica como nome e o relatório diz, na
     O.S.: os que esta conferência achou e os que o preparo da tela já tirou
     do plano (`o.difere`). */
  const difereSet = new Set([...difere, ...(Array.isArray(o.difere) ? o.difere : [])].map(d => normCasa(d.nome)));
  const notaDe = equipe => {
    const ficam = [...new Set(listaCruaCasa(equipe).map(x => String(x ?? '').trim()).filter(x => x && !OPERACAO.ehIdPessoa(x) && difereSet.has(normCasa(x))))];
    return ficam.length ? `Ficou como nome: ${ficam.map(n => `"${n}"`).join(', ')} (o servidor resolve diferente; atualize e confira).` : '';
  };
  const decidir = atual => {
    if (temDivisaoCasa(atual)) return { pular: 'Tem divisão gravada (alocação): a equipe dela sai da divisão. Confira no Conferir da Performance.' };
    const m = momentosInvalidosCasa(atual);
    if (m) return { pular: PULA_MOMENTO(m) };
    const c = OPERACAO.converterEquipe(atual.equipe, o.dados, { nomes: todos });
    if (!c.mudou) return { pular: 'Nada a trocar: a O.S. já não tem nome confirmado (convertida antes ou mudada em outro aparelho).' };
    const mudou = c.trocas.find(t => plano.aprovado.get(normCasa(t.de)) !== t.para);
    if (mudou) return { pular: `O vínculo de "${mudou.de}" mudou desde a conferência. Confira o nome de novo.` };
    const fora = [...new Set(c.trocas.filter(t => !acordo.has(normCasa(t.de))).map(t => t.de))];
    if (!fora.length) return { equipe: c.equipe, trocas: c.trocas, nota: notaDe(c.equipe) };
    const s = OPERACAO.converterEquipe(atual.equipe, o.dados, { nomes });
    if (!s.mudou) return { pular: PULA_SERVIDOR(fora) };
    return { equipe: s.equipe, trocas: s.trocas, nota: notaDe(s.equipe) };
  };
  return gravarEquipesUmaAUmaCasa(tarefas, decidir, { ...o, store: S, servidor: srv });
}

/* DESFAZER: devolve EXATAMENTE a lista anterior de cada O.S. convertida,
   pelo mesmo caminho. Só onde a equipe ainda é a que a conversão gravou:
   se outra gravação mexeu depois, ou a O.S. ganhou divisão, não desfaz
   calado por cima e diz por quê. A 'enviando' (a aba fechou no meio do
   envio) também é desfeita, se a troca chegou a valer. */
const desfazivelConv = it => !!(it && Array.isArray(it.depois) && ['convertida', 'na-fila', 'recusada', 'enviando'].includes(it.estado)
  && !(it.desfazer && ['convertida', 'na-fila'].includes(it.desfazer.estado)));
/* A MESMA O.S. PODE TER SIDO CONVERTIDA EM DOIS LOTES (um nome, depois
   outro): desfaz do mais novo para o mais velho, e cada passo confere a lista
   que o passo anterior devolveu. O relatório guarda só os itens tocados,
   mesclados com o que outra aba gravou. */
async function desfazerConversaoNomesCasa(rel, o = {}) {
  if (!podeConverterNomes()) return rel;
  const alvo = (rel && Array.isArray(rel.itens) ? rel.itens : []).filter(desfazivelConv).reverse();
  if (!alvo.length) return rel;
  const decidir = (atual, t) => {
    const it = t.it;
    if (!mesmaListaCasa(atual.equipe, it.depois)) return { pular: 'A equipe desta O.S. mudou depois da conversão (ou a troca não chegou a valer): nada foi desfeito nela.' };
    if (temDivisaoCasa(atual)) return { pular: 'A O.S. ganhou divisão depois da conversão: desfazer mexeria na equipe da divisão.' };
    const m = momentosInvalidosCasa(atual);
    if (m) return { pular: PULA_MOMENTO(m) };
    return { equipe: it.antes };
  };
  const cab = { tipo: rel.tipo || 'conversao', ...(rel.em ? { em: rel.em } : {}), ...(rel.por ? { por: rel.por } : {}) };
  const marcar = res => {
    const em = new Date().toISOString();
    res.forEach((r, i) => { if (alvo[i]) alvo[i].desfazer = { estado: r.estado, ...(r.motivo ? { motivo: r.motivo } : {}), em }; });
  };
  const res = await gravarEquipesUmaAUmaCasa(alvo.map(it => ({ id: it.id, numero: it.numero, it })), decidir, { ...o,
    aoItem: parcial => {
      marcar(parcial);
      gravarRelConvNomes({ ...cab, atualizadoEm: new Date().toISOString(), itens: alvo.slice(0, parcial.length) });
      if (typeof o.aoItem === 'function') o.aoItem(parcial);
    } });
  marcar(res);
  return gravarRelConvNomes({ ...cab, atualizadoEm: new Date().toISOString(), itens: alvo }) || rel;
}

/* O RELATÓRIO É DIVIDIDO PELAS ABAS DO NAVEGADOR (revisão da F12). Duas abas
   do mesmo navegador dividem o localStorage: cada uma gravava a sua cópia
   inteira, e a última apagava o lote da outra (com o Desfazer junto). Agora
   cada gravação relê o que está guardado e mescla por lote e por O.S.; a
   aba manda só os itens que tocou. Com o localStorage cheio (os sistemas da
   casa dividem 5 MB), o relatório fica só na memória desta aba, e a tela
   avisa que o Desfazer some ao fechar a aba. */
let _convNomesRelFalhou = false;
const chaveItemConv = it => String((it && it.lote) || '') + '|' + String((it && it.id) || '');
function lerRelConvNomesGuardado() {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_REL_CONV_NOMES) || 'null'); return v && Array.isArray(v.itens) ? v : null; }
  catch (e) { return undefined; }
}
function juntarRelConv(a, b) {
  if (!a || !Array.isArray(a.itens)) return b || null;
  if (!b || !Array.isArray(b.itens)) return a;
  const novos = new Map(b.itens.map(it => [chaveItemConv(it), it]));
  const itens = a.itens.map(it => { const k = chaveItemConv(it); if (!novos.has(k)) return it; const n = novos.get(k); novos.delete(k); return n; });
  for (const it of novos.values()) itens.push(it);
  const out = { ...a, ...b, em: [a.em, b.em].filter(Boolean).sort()[0] || '', itens };
  delete out.emCurso;
  return out;
}
function lerRelConvNomes() {
  if (_convNomesRelFalhou) return _convNomesRelMem;
  const v = lerRelConvNomesGuardado();
  return v === undefined ? _convNomesRelMem : v;
}
function gravarRelConvNomes(rel) {
  if (!rel) {
    _convNomesRelMem = null; _convNomesRelFalhou = false;
    try { localStorage.removeItem(CHAVE_REL_CONV_NOMES); } catch (e) { /* nada guardado */ }
    return null;
  }
  const guardado = lerRelConvNomesGuardado();
  const base = juntarRelConv(guardado || null, _convNomesRelFalhou || guardado === undefined ? _convNomesRelMem : null);
  const junto = juntarRelConv(base, rel);
  _convNomesRelMem = junto;
  try { localStorage.setItem(CHAVE_REL_CONV_NOMES, JSON.stringify(junto)); _convNomesRelFalhou = false; }
  catch (e) {
    _convNomesRelFalhou = true;
    // Não coube: tira o velho, para ele não voltar no lugar deste ao recarregar.
    try { localStorage.removeItem(CHAVE_REL_CONV_NOMES); } catch (e2) { /* só a memória */ }
  }
  return junto;
}
const AVISO_REL_SO_NA_ABA = 'O relatório não coube no armazenamento deste navegador: ele fica só nesta aba, e o Desfazer some ao fechar esta aba.';

/* AS ANTIGAS DO SERVIDOR: o mesmo caminho da F09 (STORE.buscarHistorico,
   finalizadas, direto para a memória desta aba, nunca para o disco). A busca
   devolve até 750 O.S. por vez; o trecho que estoura é partido ao meio até
   caber, e o que ainda assim cortar é dito na tela. */
const diasEntreCasa = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
async function buscarTrechoCasa(de, ate, achadas, truncados, nivel) {
  const r = await STORE.buscarHistorico({ de, ate });
  if (r && r.offline) return 'offline';
  for (const o of (r && r.itens) || []) if (o && o.id) achadas.add(o.id);
  if (!(r && r.truncou)) return '';
  const span = diasEntreCasa(de, ate);
  if (span < 1 || nivel >= 12) { truncados.push({ de, ate }); return ''; }
  const meio = OPERACAO.somarDias(de, Math.floor(span / 2));
  const a = await buscarTrechoCasa(de, meio, achadas, truncados, nivel + 1);
  if (a) return a;
  return buscarTrechoCasa(OPERACAO.somarDias(meio, 1), ate, achadas, truncados, nivel + 1);
}
async function buscarAntigasConferenciaCasa() {
  if ((_convNomesHist && _convNomesHist.estado === 'buscando') || !podeConverterNomes()) return;
  const repintar = () => { if (typeof renderPerformanceCasa === 'function' && STATE.activeTab === 'performance') renderPerformanceCasa(); };
  if (typeof STORE.buscarHistorico !== 'function') { _convNomesHist = { estado: 'erro', erro: 'Esta tela está desatualizada e não busca O.S. antigas. Recarregue a página.' }; repintar(); return; }
  const ate = limiteJanelaCasa();
  _convNomesHist = { estado: 'buscando' };
  repintar();
  try {
    let faixa = null;
    try { faixa = typeof STORE.faixaHistorico === 'function' ? await STORE.faixaHistorico() : null; } catch (e) { faixa = null; }
    const de = faixa && /^\d{4}-\d{2}-\d{2}$/.test(faixa.de || '') && faixa.de <= ate ? faixa.de : '2020-01-01';
    const achadas = new Set(), truncados = [];
    const r = await buscarTrechoCasa(de, ate, achadas, truncados, 0);
    if (r === 'offline') _convNomesHist = { estado: 'erro', erro: 'Sem internet agora: conecte-se e busque de novo.' };
    else {
      const locais = new Set(STORE.getAllOS().map(o => o && o.id));
      _convNomesHist = { estado: 'pronto', novas: [...achadas].filter(id => !locais.has(id)).length, de, ate, truncados, em: new Date().toISOString() };
    }
  } catch (e) {
    _convNomesHist = { estado: 'erro', erro: 'O servidor não respondeu à busca: ' + String((e && e.message) || e) };
  }
  repintar();
}

// O status do lote em curso (a tela pode repintar no meio: ele se refaz daqui).
function statusLoteConvTexto() {
  const l = _convNomesLote;
  if (!l) return '';
  if (l.tipo === 'conferindo') return 'Conferindo os nomes com o servidor (configuração, RH e O.S.)…';
  const n = Math.min(l.feitas + 1, l.total);
  return l.tipo === 'desfazer' ? `Desfazendo: O.S. ${n} de ${l.total}. Não feche esta aba.` : `Gravando o ID: O.S. ${n} de ${l.total}. Não feche esta aba.`;
}
function pintarStatusLoteConv() {
  const el = typeof document !== 'undefined' && document.getElementById ? document.getElementById('lig-conv-status') : null;
  if (el) el.textContent = statusLoteConvTexto();
}

/* A TELA: antes da gravação, o que vai ser trocado (e a lista que fica como
   nome); depois, o relatório por O.S. com o Desfazer. */
function conversaoNomesHTML(linhas, uso, plano) {
  const pode = podeConverterNomes();
  const limite = limiteJanelaCasa();
  const h = _convNomesHist;
  const antigas = osDaConferencia().slice(STORE.getAllOS().length);
  const antigasComNome = antigas.filter(o => (Array.isArray(o.equipe) ? o.equipe : []).some(x => { const t = String(x ?? '').trim(); return t && !OPERACAO.ehIdPessoa(t); })).length;
  const janela = !h || h.estado === 'erro'
    ? `<p class="metricas-nota">Esta conta lê as O.S. deste aparelho: as abertas e as finalizadas desde ${esc(dataBRConv(limite))} (últimos ${janelaLocalCasa()} dias)${antigas.length ? `, mais ${antigas.length} O.S. antiga${antigas.length === 1 ? '' : 's'} que outra tela trouxe do servidor` : ''}. <strong>As ${antigas.length ? 'outras ' : ''}finalizadas antes disso ficam no servidor e não entram na conta nem na troca</strong> até ${pode ? 'você buscá-las' : 'a gestão buscá-las'}.${h && h.erro ? ` ${esc(h.erro)}` : ''} ${pode && typeof STORE.buscarHistorico === 'function' ? '<button class="btn-ghost btn-xs" data-lig-antigas type="button">Buscar as antigas no servidor</button>' : ''}</p>`
    : h.estado === 'buscando'
    ? '<p class="metricas-nota" role="status">Buscando no servidor as O.S. finalizadas antes da janela deste aparelho…</p>'
    : `<p class="metricas-nota">Vieram do servidor ${h.novas} O.S. finalizadas até ${esc(dataBRConv(h.ate))} que não estavam neste aparelho${antigasComNome ? `, ${antigasComNome} com nome na equipe` : ''}: elas entram na conta e na troca abaixo. Ao recarregar a página, as que não foram trocadas saem da conta: busque de novo.${h.truncados.length ? ` <strong>Ficaram de fora O.S. de ${esc(h.truncados.map(t => dataBRConv(t.de) + ' a ' + dataBRConv(t.ate)).join(', '))}</strong>: o servidor manda até 750 por busca. Busque de novo.` : ''} ${pode ? '<button class="btn-ghost btn-xs" data-lig-antigas type="button">Buscar de novo</button>' : ''}</p>`;
  /* Pendências: o que fica como nome, com o motivo. Entra também o nome que
     o aparelho confirma e o SERVIDOR lê diferente (a última conferência desta
     aba), enquanto o aparelho continuar lendo igual ao que conferiu. */
  const difere = new Map(((_convNomesDifere && _convNomesDifere.itens) || []).map(d => [normCasa(d.nome), d]));
  const naoConfere = (l, c) => { const d = difere.get(normCasa(l.apelido)); return !!(d && c.id && c.id === d.local); };
  const pend = linhas.map(l => ({ l, c: l.conf, u: uso.get(normCasa(l.apelido)) || { semDivisao: 0, comDivisao: 0 } }))
    .map(x => (naoConfere(x.l, x.c) ? { ...x, c: { id: '', motivo: 'servidor-difere' } } : x))
    .filter(x => !x.c.id && x.c.motivo !== 'comeco' && (x.u.semDivisao + x.u.comDivisao) > 0);
  const pendHTML = pend.length ? `<div class="lig-pend"><h4>Pendências: ficam como nome</h4><ul>${pend.map(x => `<li><strong>${esc(x.l.apelido)}</strong> · ${x.u.semDivisao + x.u.comDivisao} O.S. · ${esc(MOTIVO_NOME[x.c.motivo] || x.c.motivo || 'sem vínculo')}</li>`).join('')}</ul><p class="text-muted" style="font-size:.78rem">Nome que é pessoa do RH vira ID depois de ligado na tabela. "Terceiro" e nome decidido sem ficha não viram pessoa.</p></div>` : '';
  let acao = '';
  if (_convNomesLote) acao = `<p class="lig-conv-status" id="lig-conv-status" role="status" aria-live="polite">${esc(statusLoteConvTexto())}</p>`;
  else if (pode && plano.converte && !rhProntoParaConverter()) acao = `<p class="metricas-nota">⚠️ ${esc(SEM_RH_CONV)}</p>`;
  else if (pode && plano.converte) {
    const fix = listaParaFixarCasa(plano.aprovado, OPERACAO.dadosPessoas());
    acao = `<p class="lig-conv-resumo"><strong>${plano.aprovado.size} ${plano.aprovado.size === 1 ? 'nome confirmado vira' : 'nomes confirmados viram'} ID em ${plano.converte} O.S.</strong>${plano.comDivisao ? ` ${plano.comDivisao} O.S. com divisão ${plano.comDivisao === 1 ? 'fica como está' : 'ficam como estão'} (a divisão já grava o ID).` : ''} Cada O.S. vai sozinha ao servidor, com o seu nome no histórico de alterações, e dá para desfazer.</p>
      ${fix.avisar.length ? `<p class="metricas-nota">⚠️ ${esc(fix.avisar.join(', '))} ${fix.avisar.length === 1 ? 'está' : 'estão'} na lista de instaladores ligado${fix.avisar.length === 1 ? '' : 's'} só pelo começo do nome. Confirme na tabela antes: senão o celular pode deixar de ver as O.S. convertidas se entrar um xará no RH.</p>` : ''}
      <button class="btn-primary btn-sm" data-lig-converter type="button">${rotuloGravarId(plano.converte)}</button>`;
  } else if (plano.converte === 0 && linhas.some(l => l.n > 0)) acao = `<p class="metricas-nota">Nenhuma O.S. com nome confirmado para trocar${plano.comDivisao ? ` (${plano.comDivisao} com divisão ${plano.comDivisao === 1 ? 'fica como está' : 'ficam como estão'})` : ''}. Ligue ou confirme os nomes na tabela.</p>`;
  const rel = lerRelConvNomes();
  return `<div class="lig-conv">${janela}${acao}${relConvNomesHTML(rel, pode)}${pendHTML}</div>`;
}

function relConvNomesHTML(rel, pode) {
  if (!rel || !Array.isArray(rel.itens) || !rel.itens.length) return '';
  const conta = e => rel.itens.filter(it => it.estado === e).length;
  const desf = rel.itens.filter(it => it.desfazer);
  const desfOk = desf.filter(it => ['convertida', 'na-fila'].includes(it.desfazer.estado)).length;
  const aDesfazer = rel.itens.filter(desfazivelConv).length;
  // 'enviando' fora do lote desta aba: a aba fechou no meio do envio (ou outra aba está gravando agora).
  const interrompidas = conta('enviando');
  const rotulo = { convertida: 'Convertida', 'na-fila': 'Na fila', pulada: 'Pulada', recusada: 'Recusada', enviando: _convNomesLote ? 'Enviando' : 'Interrompida' };
  const troca = it => (it.trocas || []).map(t => `${esc(t.de)} → ${esc(nomeCompletoIdCasa(t.para))} <small>ID ${esc(t.para)}</small>`).join('<br>');
  const desfTxt = it => !it.desfazer ? '' : ['convertida', 'na-fila'].includes(it.desfazer.estado)
    ? `<small class="bloco">Desfeita${it.desfazer.estado === 'na-fila' ? ' (na fila)' : ''}: voltou a ${esc(listaCruaCasa(it.antes).join(', ') || 'lista vazia')}.</small>`
    : it.desfazer.estado === 'enviando'
    ? '<small class="bloco">O desfazer foi interrompido no envio desta O.S.: ele pode ter chegado ao servidor pela fila. Desfazer de novo confere a lista antes de devolver.</small>'
    : `<small class="bloco">Não desfeita: ${esc(it.desfazer.motivo || '')}</small>`;
  const interrompidaTxt = it => it.estado === 'enviando' && !_convNomesLote ? '<small class="bloco">A aba fechou durante o envio: a troca pode ter chegado ao servidor pela fila deste aparelho. O Desfazer confere a lista antes de devolver.</small>' : '';
  const quando = rel.atualizadoEm || rel.em ? new Date(rel.atualizadoEm || rel.em).toLocaleString('pt-BR') : '';
  return `<div class="lig-rel" role="region" aria-label="Relatório da troca do nome pelo ID">
    <h4>Troca do nome pelo ID${quando ? ' · última em ' + esc(quando) : ''}${rel.por ? ' · ' + esc(rel.por) : ''}</h4>${_convNomesRelFalhou ? `<p class="metricas-nota" role="alert">⚠️ ${esc(AVISO_REL_SO_NA_ABA)}</p>` : ''}${interrompidas && !_convNomesLote ? '<p class="metricas-nota">Uma troca foi interrompida no meio (a aba fechou, ou outra aba está gravando agora): o relatório vai até onde ela chegou.</p>' : ''}
    <p class="lig-rel-conta">${conta('convertida')} convertida${conta('convertida') === 1 ? '' : 's'} · ${conta('na-fila')} na fila · ${conta('pulada')} pulada${conta('pulada') === 1 ? '' : 's'} · ${conta('recusada')} recusada${conta('recusada') === 1 ? '' : 's'}${interrompidas ? ` · ${interrompidas} ${_convNomesLote ? 'enviando' : `interrompida${interrompidas === 1 ? '' : 's'}`}` : ''}${desf.length ? ` · ${desfOk} desfeita${desfOk === 1 ? '' : 's'}` : ''}</p>
    <details class="lig-rel-os" ${rel.itens.length <= 12 ? 'open' : ''}><summary>O.S. por O.S. (${rel.itens.length})</summary>
      <div class="casa-tabela-wrap"><table class="casa-tabela lig-rel-tabela"><thead><tr><th>O.S.</th><th>Resultado</th><th>Troca</th></tr></thead><tbody>
      ${rel.itens.map(it => `<tr class="lig-rel-${esc(it.estado)}"><td class="num">${esc(it.numero || it.id)}</td><td><span class="badge ${it.estado === 'convertida' ? '' : 'sem-valor'}">${esc(rotulo[it.estado] || it.estado)}</span>${it.motivo ? `<small class="bloco">${esc(it.motivo)}</small>` : ''}${it.nota ? `<small class="bloco">${esc(it.nota)}</small>` : ''}${interrompidaTxt(it)}${desfTxt(it)}</td><td>${troca(it) || '<span class="text-muted">—</span>'}</td></tr>`).join('')}
      </tbody></table></div></details>
    <div class="lig-rel-acoes">${pode && aDesfazer && !_convNomesLote ? `<button class="btn-ghost btn-sm" data-lig-desfazer type="button">Desfazer: devolver a lista anterior de ${aDesfazer} O.S.</button>` : ''}${!_convNomesLote ? '<button class="btn-ghost btn-sm" data-lig-rel-fechar type="button">Dispensar relatório</button>' : ''}</div>
  </div>`;
}

/* A CONFIGURAÇÃO (os vínculos fixados da lista) tem de chegar ao servidor
   antes das O.S.: sem isso o celular pode perder a O.S. convertida. */
/* A recusa (403, 400, 422) também tira a configuração da fila: sair da fila
   não quer dizer aceita. O aviso 'item-recusado' do setCfg é que diz. */
let _cfgRecusaCasa = null;
const _cfgLojasCasa = typeof WeakSet === 'function' ? new WeakSet() : new Set();
function ouvirCfgCasa(S) {
  if (!S || _cfgLojasCasa.has(S) || typeof S.on !== 'function') return;
  _cfgLojasCasa.add(S);
  S.on('item-recusado', d => { if (d && d.item && d.item.action === 'setCfg') _cfgRecusaCasa = { em: Date.now(), motivo: String((d && d.motivo) || '') }; });
}
async function esperarCfgNoServidorCasa(desde, prazoMs = 12000) {
  const t0 = Number.isFinite(desde) ? desde : Date.now();
  const naFila = () => (typeof STORE.getQueue === 'function' ? (STORE.getQueue() || []) : []).some(x => x && x.action === 'setCfg');
  const recusada = () => _cfgRecusaCasa && _cfgRecusaCasa.em >= t0;
  // O conflito de configuração não se resolve sozinho: esperar o prazo só atrasava o aviso.
  const conflito = () => typeof STORE.conflitoCFG === 'function' && !!STORE.conflitoCFG();
  while (naFila() && !recusada()) {
    try { if (typeof STORE.trySync === 'function') await STORE.trySync(); } catch (e) { /* a fila guarda */ }
    if (!naFila() || recusada()) break;
    if (conflito()) return { ok: false, motivo: 'em conflito de configuração com outro aparelho: resolva o aviso de conflito' };
    if (Date.now() - t0 >= prazoMs) return { ok: false, motivo: 'sem resposta do servidor, ou em conflito de configuração' };
    await dormirCasa(500);
  }
  if (recusada()) return { ok: false, motivo: 'o servidor recusou' + (_cfgRecusaCasa.motivo ? ': ' + _cfgRecusaCasa.motivo : '') };
  return { ok: true };
}
const resumoRelConv = itens => {
  const n = e => itens.filter(it => it.estado === e).length;
  const partes = [[n('convertida'), 'convertida', 'convertidas'], [n('na-fila'), 'na fila', 'na fila'], [n('pulada'), 'pulada', 'puladas'], [n('recusada'), 'recusada', 'recusadas']]
    .filter(([k]) => k > 0).map(([k, um, varios]) => `${k} ${k === 1 ? um : varios}`);
  return (partes.join(', ') || 'nada a fazer') + '.';
};
const e2Casa = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1] : xs.join('');
/* ANTES DO PLANO E DO CONFIRM (revisão da F12): a régua é a do servidor.
   1. Configuração deste aparelho que o servidor ainda não aceitou (setCfg na
      fila, pendente ou em conflito): não converte. O vínculo "salvo" aqui
      pode não existir lá, e o nome viraria o ID que o servidor não lê.
   2. Puxa a configuração e o elenco do RH (sem a cópia de 60 s do
      servidor). Falhou um dos dois: não converte, e diz qual.
   3. O plano sai do retrato novo; a conferência no servidor (conferirNomes)
      tira do lote o nome que o servidor lê diferente, e ele vai para as
      pendências com o motivo. */
async function prepararConversaoCasa(nomes) {
  const fila = typeof STORE.getQueue === 'function' ? (STORE.getQueue() || []) : [];
  if (fila.some(x => x && x.action === 'setCfg') || (typeof STORE.conflitoCFG === 'function' && STORE.conflitoCFG()))
    return { ok: false, motivo: 'Nenhuma O.S. foi trocada: a ligação ainda não foi aceita pelo servidor (há uma configuração deste aparelho na fila ou em conflito). Espere sincronizar, ou resolva o aviso de conflito, e tente de novo.' };
  const rc = await STORE.pullCFG();
  if (rc !== true && rc !== false) return { ok: false, motivo: 'Nenhuma O.S. foi trocada: a configuração do servidor não chegou a este aparelho (sem rede, ou sessão recusada). Tente de novo.' };
  const re = typeof STORE.pullElenco === 'function' ? await STORE.pullElenco(true, { semCache: true }) : false;
  if (re !== true) return { ok: false, motivo: 'Nenhuma O.S. foi trocada: a lista de pessoas do RH não chegou a este aparelho (sem rede, ou sessão recusada). Tente de novo.' };
  esquecerVinculosCasa(); OPERACAO.esquecerPessoas();
  if (!rhProntoParaConverter()) return { ok: false, motivo: SEM_RH_CONV };
  const dados = OPERACAO.dadosPessoas();
  const plano0 = planoConversaoNomes(nomes, null, dados);
  if (!plano0.converte) return { ok: false, motivo: 'Nenhuma O.S. com nome confirmado para trocar.' };
  const lista = (STORE.getCFG().instaladores || []).map(String).filter(Boolean);
  const srv = await conferirNoServidorCasa(STORE, [...[...plano0.aprovado.keys()].map(k => plano0.rotulos.get(k) || k), ...lista], plano0.tarefas.map(t => t.id));
  if (!srv.ok) return { ok: false, motivo: `Nenhuma O.S. foi trocada: ${srv.motivo}.` };
  const { acordo, difere } = acordoServidorCasa(plano0, srv);
  _convNomesDifere = difere.length ? { em: srv.em, itens: difere } : null;
  const plano = acordo.size ? planoConversaoNomes([...acordo.keys()], null, dados) : null;
  if (!plano || !plano.converte) return { ok: false, difere, motivo: `Nenhuma O.S. foi trocada: ${e2Casa(difere.map(d => `"${d.nome}"`))}: o servidor resolve diferente; atualize e confira.` };
  /* O nome da lista de instaladores que já é vínculo salvo e chega a um ID
     convertido: o servidor tem de ter a mesma ligação, senão o celular dele
     perde as O.S. convertidas. */
  const alvos = new Set(plano.aprovado.values());
  const listaFalta = lista.filter(n => { const id = OPERACAO.idPessoa(n); return OPERACAO.pessoaFixada(n) && id && alvos.has(id) && !servidorConcordaCasa(srv, n, id, 'vinculo'); });
  if (listaFalta.length) return { ok: false, motivo: `Nenhuma O.S. foi trocada: a ligação de ${e2Casa(listaFalta)} ainda não foi aceita pelo servidor. Atualize a página e confira.` };
  return { ok: true, plano, srv, difere, dados, fix: listaParaFixarCasa(plano.aprovado, dados) };
}
async function iniciarConversaoNomesCasa(nomes) {
  if (_convNomesLote) return;
  if (!podeConverterNomes()) { toast('Só a gestão (admin e pcp) troca o nome pelo ID.', 'error'); return; }
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) { toast('Sem internet: a troca precisa do servidor para dizer, O.S. por O.S., o que foi gravado. Conecte-se e tente de novo.', 'error'); return; }
  if (!rhProntoParaConverter()) { toast(SEM_RH_CONV, 'error'); return; }
  const repintar = () => { if (STATE.activeTab === 'performance' && typeof renderPerformanceCasa === 'function') renderPerformanceCasa(); };
  _convNomesLote = { tipo: 'conferindo', feitas: 0, total: 0 };
  repintar();
  try {
    let prep;
    try { prep = await prepararConversaoCasa(nomes); }
    catch (e) { prep = { ok: false, motivo: 'Nenhuma O.S. foi trocada: ' + String((e && e.message) || e) }; }
    if (!prep.ok) { toast(prep.motivo, 'error'); return; }
    const { plano, srv, difere, fix } = prep;
    const linhas = [...plano.aprovado.entries()].map(([k, id]) => `${plano.rotulos.get(k) || k} → ${nomeCompletoIdCasa(id)} (ID ${id})`);
    const texto = [`Gravar o ID em ${plano.converte} O.S.?`, '',
      ...linhas.slice(0, 15), ...(linhas.length > 15 ? [`e mais ${linhas.length - 15} nomes`] : []), '',
      ...(difere.length ? [`${e2Casa(difere.map(d => d.nome))} ${difere.length === 1 ? 'fica' : 'ficam'} como nome: o servidor resolve diferente; atualize e confira.`] : []),
      ...(plano.comDivisao ? [`${plano.comDivisao} O.S. com divisão ficam como estão e aparecem no relatório.`] : []),
      ...(fix.fixar.length ? [`Antes, ${fix.fixar.map(f => f.nome).join(', ')} da lista de instaladores ${fix.fixar.length === 1 ? 'vira vínculo salvo' : 'viram vínculos salvos'}, para o celular continuar vendo as O.S.`] : []),
      ...(fix.avisar.length ? [`Atenção: ${fix.avisar.join(', ')} ${fix.avisar.length === 1 ? 'está' : 'estão'} na lista de instaladores ligado só pelo começo do nome.`] : []),
      'Cada O.S. vai sozinha ao servidor, com o seu nome no histórico de alterações. Dá para desfazer depois.'].join('\n');
    if (!confirm(texto)) return;
    const usuario = (STATE.user && STATE.user.nome) || '';
    /* O RELATÓRIO ACUMULA os lotes (nome por nome, ou todos, desta aba e das
       outras): cada gravação manda só os itens deste lote, e gravarRelConvNomes
       mescla com o que já está guardado. O Desfazer alcança todos até alguém
       dispensar. */
    const agora = new Date().toISOString();
    // O lote é a chave da mescla (com a O.S.): dois lotes no mesmo milissegundo não podem se apagar.
    const lote = agora + '~' + Math.random().toString(36).slice(2, 8);
    const base = { tipo: 'conversao', em: agora, atualizadoEm: agora, por: usuario };
    const doLote = xs => xs.map(it => ({ ...it, lote, por: usuario }));
    _convNomesLote = { tipo: 'conversao', feitas: 0, total: plano.tarefas.length };
    repintar();
    if (fix.fixar.length) {
      ouvirCfgCasa(STORE);
      const desde = Date.now();
      const lista = lerVinculosCasa().filter(v => !fix.fixar.some(f => normCasa(f.nome) === normCasa(v.apelido)));
      for (const f of fix.fixar) { const p = pessoaRHPorId6(f.id); lista.push({ id: f.id, chave: (p && p.chave) || '', nome: (p && p.nome) || '', apelido: f.nome }); }
      gravarVinculosCasa(lista);
      const cfgOk = await esperarCfgNoServidorCasa(desde);
      if (!cfgOk || !cfgOk.ok) {
        toast(`Os vínculos da lista de instaladores não chegaram ao servidor (${(cfgOk && cfgOk.motivo) || 'sem resposta'}). Nenhuma O.S. foi trocada.`, 'error');
        return;
      }
      // Saiu da fila não quer dizer que a ligação vale lá: confere pela régua do servidor.
      const conf = await conferirNoServidorCasa(STORE, fix.fixar.map(f => f.nome), []);
      const falta = conf.ok ? fix.fixar.filter(f => !servidorConcordaCasa(conf, f.nome, f.id, 'vinculo')).map(f => f.nome) : fix.fixar.map(f => f.nome);
      if (falta.length) {
        toast(`Nenhuma O.S. foi trocada: a ligação de ${e2Casa(falta)} ainda não foi aceita pelo servidor${conf.ok ? '' : ` (${conf.motivo})`}. Atualize a página e confira.`, 'error');
        return;
      }
    }
    const itens = await converterNomesNasOSCasa(plano, { usuario, servidor: srv, difere,
      aoProgresso: i => { if (_convNomesLote) { _convNomesLote.feitas = i; pintarStatusLoteConv(); } },
      aoItem: parcial => gravarRelConvNomes({ ...base, atualizadoEm: new Date().toISOString(), itens: doLote(parcial) }) });
    gravarRelConvNomes({ ...base, atualizadoEm: new Date().toISOString(), itens: doLote(itens) });
    toast('Troca do nome pelo ID: ' + resumoRelConv(itens) + (_convNomesRelFalhou ? ' ' + AVISO_REL_SO_NA_ABA : ''), itens.some(it => it.estado === 'recusada') || _convNomesRelFalhou ? 'error' : 'success');
  } catch (e) {
    toast('A troca parou: ' + String((e && e.message) || e) + ' O relatório mostra até onde foi.', 'error');
  } finally {
    _convNomesLote = null;
    repintar();
  }
}
async function iniciarDesfazerConversaoCasa() {
  if (_convNomesLote) return;
  if (!podeConverterNomes()) { toast('Só a gestão (admin e pcp) desfaz a troca.', 'error'); return; }
  const rel = lerRelConvNomes();
  const alvo = rel ? rel.itens.filter(desfazivelConv) : [];
  const n = alvo.length;
  if (!n) return;
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) { toast('Sem internet: conecte-se para desfazer.', 'error'); return; }
  if (!confirm(`Desfazer a troca em ${n} O.S.? Cada uma volta exatamente à lista de antes, se a equipe não mudou depois. Cada O.S. vai sozinha ao servidor e entra no histórico de alterações.`)) return;
  _convNomesLote = { tipo: 'desfazer', feitas: 0, total: n };
  const repintar = () => { if (STATE.activeTab === 'performance' && typeof renderPerformanceCasa === 'function') renderPerformanceCasa(); };
  repintar();
  const chaves = new Set(alvo.map(chaveItemConv));
  try {
    const fim = await desfazerConversaoNomesCasa(rel, { usuario: (STATE.user && STATE.user.nome) || '',
      aoProgresso: i => { if (_convNomesLote) { _convNomesLote.feitas = i; pintarStatusLoteConv(); } } });
    const d = ((fim && fim.itens) || []).filter(it => chaves.has(chaveItemConv(it)) && it.desfazer);
    const ok = d.filter(it => ['convertida', 'na-fila'].includes(it.desfazer.estado)).length;
    toast(`Desfazer: ${ok} de ${n} O.S. voltaram à lista de antes.` + (_convNomesRelFalhou ? ' ' + AVISO_REL_SO_NA_ABA : ''), ok === n && !_convNomesRelFalhou ? 'success' : 'error');
  } catch (e) {
    toast('O desfazer parou: ' + String((e && e.message) || e), 'error');
  } finally {
    _convNomesLote = null;
    repintar();
  }
}

/* GRAFIAS PARECIDAS, LADO A LADO (Adlando, Adilsom e Jose Adilando; Adriano,
   Adriano Pinheiro e Adriano Nunes): juntam-se os nomes que chegam à mesma
   ficha (ou à mesma sugestão), os que dividem os candidatos, e os que têm a
   primeira palavra igual ou parecida com uma palavra do outro. É só para a
   pessoa olhar junto e decidir: agrupar não liga ninguém. */
function sugestaoParecidaCasa(apelido, ativos) {
  let melhor = null, empate = false;
  for (const p of ativos) {
    if (!OPERACAO.ehIdPessoa(p.id)) continue;
    const r = OPERACAO.buscaTolerante(apelido, { textos: [p.nome, p.apelido] });
    if (!r.tipo) continue;
    if (!melhor || r.dist < melhor.dist) { melhor = { p, dist: r.dist }; empate = false; }
    else if (r.dist === melhor.dist) empate = true;
  }
  return melhor && !empate ? melhor.p : null;
}
function palavrasParecidasCasa(a, b) {
  const pa = normCasa(a).split(/\s+/).filter(t => t.length >= 3), pb = normCasa(b).split(/\s+/).filter(t => t.length >= 3);
  const perto = (x, y) => {
    if (x === y) return true;
    if (x[0] !== y[0]) return false;
    const n = Math.min(x.length, y.length), lim = n <= 3 ? 0 : n <= 5 ? 1 : 2;
    return lim > 0 && OPERACAO.distanciaEdicao(x, y) <= lim;
  };
  return (pa.length && pb.some(t => perto(pa[0], t))) || (pb.length && pa.some(t => perto(pb[0], t)));
}
function gruposDeGrafiasCasa(linhas) {
  const pai = linhas.map((_, i) => i);
  const raiz = i => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const unir = (a, b) => { const x = raiz(a), y = raiz(b); if (x !== y) pai[Math.max(x, y)] = Math.min(x, y); };
  const alvos = linhas.map(l => new Set([l.pessoa && l.pessoa.id, l.conf && (l.conf.id || l.conf.sugerido), l.sugestao && l.sugestao.id, ...(l.candidatos || []).map(p => p.id)].filter(x => OPERACAO.ehIdPessoa(x))));
  for (let i = 0; i < linhas.length; i++) for (let j = i + 1; j < linhas.length; j++) {
    if ([...alvos[i]].some(x => alvos[j].has(x)) || palavrasParecidasCasa(linhas[i].apelido, linhas[j].apelido)) unir(i, j);
  }
  const grupos = new Map();
  linhas.forEach((l, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(l); });
  return [...grupos.values()];
}

/* ── Conferir e ligar o nome do PCP à ficha do RH, pela tela ─────────────
   Todos os nomes que o PCP usa, cada um com a ficha a que chega. O que falta
   resolver vem primeiro; qualquer ligação (automática ou salva) pode ser
   trocada ali mesmo. Ver conferenciaRH(). */
function ligacaoRHHTML() {
  const linhas = conferenciaRH();
  const ativos = pessoasRHAtivas();
  const pend = linhas.filter(l => l.como === 'sem-ficha' || l.como === 'ambiguo').length;
  const juntos = linhas.filter(l => l.juntos.length).length;
  const soAuto = linhas.filter(l => l.naLista && l.como === 'auto' && l.pessoa && l.pessoa.id).length;
  /* NOME ANTIGO VIRA ID (F12): cada linha sabe se o nome está confirmado
     (OPERACAO.confirmarNome), em quantas O.S. ele viraria ID e, sem ficha,
     qual ficha tem a grafia parecida. */
  const f12 = f12Carregada();
  const dados = f12 ? OPERACAO.dadosPessoas() : {};
  const uso = usoDosNomesCasa();
  const plano = f12 ? planoConversaoNomes(null, null, dados) : { tarefas: [], aprovado: new Map(), rotulos: new Map(), converte: 0, comDivisao: 0 };
  const pode = f12 && podeConverterNomes() && !_convNomesLote && rhProntoParaConverter();
  for (const l of linhas) {
    l.conf = f12 ? OPERACAO.confirmarNome(l.apelido, dados) : { id: '', motivo: '' };
    l.sugestao = !l.pessoa && l.como !== 'ambiguo' && l.como !== 'terceiro' && l.conf.motivo !== 'terceiro' ? sugestaoParecidaCasa(l.apelido, ativos) : null;
  }
  /* Cadastro que não separa a pessoa não vira vínculo (F07): ID que ficha e
     contrato de freelancer dividem, ou contrato ainda sem ID. Aparece
     desabilitado, com o motivo, como no seletor da equipe. */
  const travaLig = p => p.idRepetido || (p.id && OPERACAO.idRepetido && OPERACAO.idRepetido(p.id)) ? 'ID repetido no RH: confira o CPF'
    : p.freelancer && !/^\d{6}$/.test(String(p.id || '')) ? (p.cpfInvalido ? 'CPF do contrato não confere' : 'contrato sem CPF') : '';
  const optPessoas = atual => ativos.map(p => { const trava = travaLig(p); return `<option value="${esc(p.chave)}" ${!trava && atual && atual.chave === p.chave ? 'selected' : ''} ${trava ? 'disabled' : ''}>${esc(p.nome)}${p.cargo ? ' · ' + esc(p.cargo) : ''}${p.freelancer ? ' · Freelancer' : ''}${trava ? ' · ' + esc(trava) : ''}</option>`; }).join('');
  // ID repetido entre ficha e contrato de freelancer (F07): o servidor avisa.
  const avisosRH = (elencoRH().avisos || []).map(a => `<p class="metricas-nota">⚠️ ${esc(a)}</p>`).join('');
  const situacao = l => {
    if (l.conf.motivo === 'terceiro' && l.pessoa) return `<span class="badge sem-valor">Marcador ligado a ${esc(l.pessoa.nome)}</span><small class="bloco">"Terceiro" é marcador: a troca por ID nunca grava pessoa nele, mas a leitura de hoje conta para ${esc(l.pessoa.nome)}. Se foi engano, desligue.</small>`;
    if (l.conf.motivo === 'terceiro' && l.como !== 'terceiro') return '<span class="badge">Terceiro</span><small class="bloco">Marcador de terceiro: nunca vira pessoa.</small>';
    if (l.como === 'sem-ficha') return '<span class="badge sem-valor">Sem ficha no RH</span>';
    if (l.como === 'ambiguo') return `<span class="badge sem-valor">Ambíguo</span><small class="bloco">Serve para ${esc(l.candidatos.map(p => p.nome).join(' e '))}. Escolha quem é.</small>`;
    if (l.como === 'terceiro') return '<span class="badge">Terceiro, sem ficha</span><small class="bloco">Decidido: não casa com ninguém do RH.</small>';
    if (l.conf.motivo === 'comeco') return `<span class="badge sem-valor">Só pelo começo do nome</span><small class="bloco">Confirme se é ${esc((l.pessoa && l.pessoa.nome) || 'essa pessoa')}: sem isso o nome não vira ID.</small>${l.juntos.length ? `<small class="bloco">Mesma pessoa que: ${esc(l.juntos.join(', '))}.</small>` : ''}`;
    const como = l.como === 'salvo' ? 'Ligado à mão' : 'Ligado pelo nome';
    return `<span class="badge">${como}</span>${l.inativa ? ' <span class="badge sem-valor">Fora da ativa no RH</span>' : ''}${l.conf.id ? '' : `<small class="bloco">Não vira ID: ${esc(MOTIVO_NOME[l.conf.motivo] || 'sem vínculo')}.</small>`}${l.juntos.length ? `<small class="bloco">Mesma pessoa que: ${esc(l.juntos.join(', '))}. Se forem pessoas diferentes, troque.</small>` : ''}`;
  };
  const ficha = l => l.pessoa ? `<strong>${esc(l.pessoa.nome)}</strong>${l.pessoa.cargo || l.pessoa.area ? `<small class="bloco">${esc([l.pessoa.cargo, l.pessoa.area].filter(Boolean).join(' · '))}</small>` : ''}`
    : l.sugestao ? `<span class="text-muted">Nenhuma</span><small class="bloco">Sugestão, grafia parecida: <strong>${esc(l.sugestao.nome)}</strong>. Confira e ligue.</small>` : '<span class="text-muted">Nenhuma</span>';
  // Em quantas O.S. o nome vira ID (as com divisão ficam como estão).
  const viraId = l => {
    const u = uso.get(normCasa(l.apelido)) || { semDivisao: 0, comDivisao: 0 };
    const div = u.comDivisao ? `<small class="bloco">${u.comDivisao} com divisão ${u.comDivisao === 1 ? 'fica' : 'ficam'}</small>` : '';
    if (!u.semDivisao) return '<span class="text-muted">—</span>' + div;
    if (l.conf.id) return `<strong>${u.semDivisao} O.S.</strong>${div}${pode ? `<button class="btn-ghost btn-xs" data-lig-converter-nome="${esc(l.apelido)}" type="button">${rotuloGravarId(u.semDivisao)}</button>` : ''}`;
    if (l.conf.motivo === 'comeco') return `${u.semDivisao} O.S.<small class="bloco">depois de confirmar</small>${div}`;
    return `<span class="text-muted">fica nome</span><small class="bloco">${u.semDivisao} O.S.</small>${div}`;
  };
  const linhaHTML = l => `<tr>
        <td data-rot="Nome no PCP"><strong>${esc(l.apelido)}</strong>${l.naLista ? '<small class="bloco">na lista de instaladores</small>' : ''}</td>
        <td data-rot="O.S." class="num">${l.n}</td>
        <td data-rot="Vira ID em" class="lig-vira">${viraId(l)}</td>
        <td data-rot="Ficha do RH">${ficha(l)}</td>
        <td data-rot="Situação">${situacao(l)}</td>
        <td data-rot="Ligar a" class="lig-acoes">${l.conf.motivo === 'terceiro' ? '' : `<select data-lig-sel="${esc(l.apelido)}" aria-label="Pessoa do RH para ${esc(l.apelido)}"><option value="">Escolher</option>${optPessoas(l.pessoa)}</select>
          <button class="btn-primary btn-xs edit-only" data-lig-ok="${esc(l.apelido)}">${l.pessoa ? 'Trocar' : 'Ligar'}</button>`}
          ${l.conf.motivo === 'comeco' && l.pessoa && l.pessoa.chave ? `<button class="btn-primary btn-xs edit-only" data-lig-confirmar="${esc(l.apelido)}" data-lig-chave="${esc(l.pessoa.chave)}" type="button" title="Confirma que ${esc(l.apelido)} é ${esc(l.pessoa.nome)}: vira vínculo salvo">Confirmar</button>` : ''}
          ${l.como === 'salvo' || l.como === 'terceiro' ? `<button class="btn-ghost btn-xs edit-only" data-del-ficha="${esc(l.apelido)}" type="button" title="Tira a decisão salva; o nome volta a casar sozinho, se casar">Desligar</button>` : ''}
          ${l.como === 'sem-ficha' || l.como === 'ambiguo' ? `<button class="btn-ghost btn-xs edit-only" data-lig-terceiro="${esc(l.apelido)}" type="button" title="Marca que este nome é de um terceiro, sem ficha no RH">É terceiro</button>` : ''}</td>
      </tr>`;
  const e = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1] : xs.join('');
  const grupos = gruposDeGrafiasCasa(linhas);
  const corpo = grupos.map(g => `<tbody class="${g.length > 1 ? 'lig-grupo' : ''}">${g.length > 1 ? `<tr class="lig-grupo-cab"><td colspan="6">Grafias parecidas: <strong>${esc(e(g.map(l => l.apelido)))}</strong>. Confira se são a mesma pessoa antes de ligar.</td></tr>` : ''}${g.map(linhaHTML).join('')}</tbody>`).join('');
  return `<p>Cada nome que o PCP usa (lista de instaladores e equipes das O.S.) e a ficha do RH a que ele chega. O que falta resolver vem primeiro. Qualquer ligação pode ser trocada aqui: a partir dela, a foto, o cargo e o nome completo aparecem sozinhos, aqui e na mensagem do dia. Com o nome confirmado, a O.S. antiga pode trocar o nome pelo ID da pessoa.</p>
    ${avisosRH}
    <p class="text-muted" style="font-size:.8rem">${linhas.length} nomes · ${pend ? `<strong>${pend} sem ficha ou ambíguo${pend === 1 ? '' : 's'}</strong>` : 'todos com ficha'}${juntos ? ` · ${juntos} nomes dividem a ficha com outro` : ''}.</p>
    ${soAuto ? `<p class="metricas-nota">📌 ${soAuto} ${soAuto === 1 ? 'nome da lista de instaladores está ligado' : 'nomes da lista de instaladores estão ligados'} só pelo nome. Se entrar no RH alguém com o mesmo começo de nome, a ligação some e o celular dessa pessoa deixa de ver as O.S. gravadas pelo ID. <button class="btn-primary btn-xs edit-only" data-lig-fixar type="button">Fixar ${soAuto === 1 ? 'a ligação' : `as ${soAuto} ligações`}</button></p>` : ''}
    ${f12 ? conversaoNomesHTML(linhas, uso, plano) : '<p class="metricas-nota">Esta tela está com uma parte desatualizada: recarregue a página para trocar os nomes antigos pelo ID.</p>'}
    ${linhas.length ? `<div class="casa-tabela-wrap"><table class="casa-tabela lig-tabela">
      <thead><tr><th>Nome no PCP</th><th class="num">O.S</th><th>Vira ID em</th><th>Ficha do RH</th><th>Situação</th><th>Ligar a</th></tr></thead>
      ${corpo}</table></div>` : '<p class="text-muted">Nenhum nome no PCP ainda.</p>'}
    <p class="text-muted" style="font-size:.8rem">${ativos.length} pessoas ativas no RH${ativos.some(p => p.freelancer) ? ` (${ativos.filter(p => p.freelancer).length} por contrato de freelancer)` : ''}${pessoasRH().length > ativos.length ? ` · ${pessoasRH().length - ativos.length} inativa(s) fora da lista de escolha` : ''}. Quem sai da empresa sai daqui sozinho.</p>`;
}

/* ── Modo TV: ranking na tela da fábrica ───────────────────────────────────
   Tela cheia, letra grande, troca de painel sozinha. Esc ou o × sai. */
function painelTVCasa(i, f) {
  const c = typeof perfConfig === 'function' ? perfConfig() : {equipes:[],participacoes:[]};
  /* A TV MOSTRA O MESMO RANKING DA TELA. Ela lia só o aparelho e não passava
     pelas duas regras da tela (perfUnirPessoas e PERF.comEquipes): a equipe
     "Horizonte" saía em duas linhas (com nome nas confirmadas, "Adriano +
     Douglas" nas sugeridas), sem logo, e quem foi ligado ao RH depois aparecia
     duas vezes. Agora a base é perfLista (a do servidor, quando carregada). */
  const temPerf = typeof PERF !== 'undefined';
  const base = typeof perfLista === 'function' ? perfLista() : classificarEntregas(STORE.getAllOS()).instalacoes;
  const entregas = base.filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate));
  const brutos = temPerf ? entregas.map(o=>perfRegistro(o,c)) : [];
  const regs = typeof perfUnirPessoas === 'function' ? perfUnirPessoas(brutos) : brutos;
  const opcoes = typeof perfOpcoesEquipe === 'function' ? perfOpcoesEquipe() : {};
  const resumo = temPerf
    ? { pessoas: PERF.resumir(regs).pessoas, equipes: PERF.resumir(PERF.comEquipes(regs, c.equipes || [], opcoes)).equipes }
    : {pessoas:[],equipes:[]};
  /* O ROSTO DE CADA LINHA: a logo da equipe (a enviada ou a do animal, pela
     mesma régua da tela) e a foto da ficha do RH para a pessoa. Antes a
     pessoa aparecia com o emblema 🤝 e a equipe fixa sem a logo do animal. */
  const temLogo = typeof perfLogoHTML === 'function';
  const rostoEquipe = (p, cls) => temLogo ? perfLogoHTML(p, cls) : `<span class="tv-pos">${esc(p.emblema||'🤝')}</span>`;
  const rostoPessoa = (p, cls) => `<span class="${cls} perf-foto">${avatarRH(pessoasRH().find(x => [x.chave, x.id].includes(p.chave)) || { nome: p.nome })}</span>`;
  const corDe = p => typeof perfCorClasse === 'function' ? perfCorClasse(p) : '';
  /* O PÓDIO DA TELA NA TV (revisão de experiência, 29/09/2026): as mesmas
     peças da Performance (perfPodioHTML e o corte de perfCortarPodio, com
     empate), sem botões, e do 4º em diante a lista de sempre. Sem o
     performance.js carregado, fica só a lista. */
  const temPodio = temPerf && typeof perfPodioHTML === 'function' && typeof perfCortarPodio === 'function';
  const linhaTV = (p, rosto, num) => `<li class="tv-linha${corDe(p)}">${p.posicao ? `<span class="tv-pos">${p.posicao}º</span>` : ''}${rosto(p, 'tv-foto')}<span class="tv-nome">${esc(p.nome)}</span><span class="tv-num">${esc(num(p))}</span></li>`;
  // Acima do que cabe a TV não mostra; diz quantas ficaram de fora em vez de cortar calada.
  const mais = n => n > 0 ? `<p class="metricas-nota">+${n} no ranking completo, na tela Performance.</p>` : '';
  const lista = (ps, rosto, num) => `<ol class="tv-lista">${ps.slice(0,8).map(p => linhaTV(p, rosto, num)).join('')}</ol>${mais(ps.length - 8)}`;
  const ranking = (ps, medida, rosto, clsPodio, num, unidade) => {
    if (!temPodio) return lista(ps, rosto, p => num(p) + ' ' + unidade);
    const { podio, resto } = perfCortarPodio(PERF.ranquear(ps, medida));
    const pod = perfPodioHTML(podio.map(p => ({ posicao: p.posicao, nome: p.nome, visual: rosto(p, clsPodio), classe: corDe(p), numero: num(p), unidade })), { animar: true, classe: clsPodio === 'perf-podio-logo' ? 'perf-podio-tv perf-podio-equipes' : 'perf-podio-tv', rotulo: 'Pódio' });
    const cabe = podio.length ? 3 : 8;
    return pod + (resto.length ? `<ol class="tv-lista tv-lista-resto">${resto.slice(0, cabe).map(p => linhaTV(p, rosto, x => num(x) + ' ' + unidade)).join('')}</ol>` : '') + mais(resto.length - cabe);
  };
  const fonteTV=typeof perfFonteAtual==='function'?perfFonteAtual():null;
  const previa = !fonteTV;
  const fechada=!!fonteTV?.fechadoEm;
  const equipesTV=fechada?resumo.equipes:temPerf?PERF.resumir(PERF.comEquipes(regs.filter(r=>r.confirmado),c.equipes||[],opcoes)).equipes.filter(e=>e.equivalentes>0):[];
  const medidaEquipe=p=>fechada?p.os:Math.round(p.equivalentes*1e8)/1e8;
  equipesTV.sort((a,b)=>medidaEquipe(b)-medidaEquipe(a)||a.nome.localeCompare(b.nome));
  const nota='<p class="metricas-nota">Participação operacional; não é nota de mérito ou bonificação. Divisão igual quando ainda não confirmada.</p>';
  const paineis = [
    {titulo:fechada?'🤝 Equipes em ação':'🤝 Produção confirmada das equipes',corpo:(equipesTV.length?ranking(equipesTV,medidaEquipe,rostoEquipe,'perf-podio-logo',p=>perfFormato(medidaEquipe(p)),fechada?'O.S.':'O.S. equivalentes'):'<p class="tv-vazio">Nenhuma produção confirmada neste período. Confira as entregas na Performance.</p>')+'<p class="metricas-nota">Classificação operacional do período. O resultado do programa depende da apuração das regras e ocorrências.</p>'},
    {titulo:'📦 Participação nas entregas',corpo:(resumo.pessoas.length?ranking(resumo.pessoas,p=>p.equivalentes,rostoPessoa,'perf-podio-foto',p=>perfFormato(p.equivalentes),'O.S. equivalentes'):'<p class="tv-vazio">Sem participação registrada.</p>')+nota},
    {titulo:'🚚 Carros mais usados',corpo:carrosHTML(f)},
    {titulo:'🔧 Retrabalho no período',corpo:retrabalhoHTML(f)},
  ];
  const n = ((i % paineis.length) + paineis.length) % paineis.length;
  const p = paineis[n];
  return { total: paineis.length, html: `<div class="tv-head">
      <h2>${p.titulo}</h2>
      <span class="tv-relogio">${new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="tv-corpo">${p.corpo}</div>
    <div class="tv-rodape"><span>Impresilk · Instalação</span><span class="tv-pontos">${paineis.map((_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</span><span>${esc(rotuloPeriodoCasa(f))}${previa ? ' · prévia do aparelho' : ''}</span></div>` };
}
function rotuloPeriodoCasa(f) {
  if (!f.de && !f.ate) return 'todos os períodos';
  const br = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '…';
  return f.de === f.ate ? br(f.de) : `${br(f.de)} a ${br(f.ate)}`;
}
function abrirTVCasa() {
  const old = document.getElementById('tv-casa'); if (old) old.remove();
  /* A TV FICA LIGADA DIAS. O período era lido uma vez só: ligada na segunda,
     na quarta ainda mostrava "01/09 a 22/09", e na virada do mês ficava presa
     no mês anterior. Se o período é o padrão (mês corrente até hoje), ele anda
     sozinho a cada pintura; período escolhido à mão fica como está. */
  const f0 = periodoOuMes('_fPerf');
  const hojeTV = OPERACAO.dia(new Date());
  const padrao = f0.de === hojeTV.slice(0, 7) + '-01' && f0.ate === hojeTV;
  const periodoTV = () => {
    if (!padrao) return f0;
    const h = OPERACAO.dia(new Date());
    // Grava no STATE também: a base do servidor (perfLista) é guardada pela
    // chave do período, e chave velha com período novo mostraria dias faltando.
    if (STATE._fPerf && STATE._fPerf.ate !== h) STATE._fPerf = { de: h.slice(0, 7) + '-01', ate: h };
    return { de: h.slice(0, 7) + '-01', ate: h };
  };
  let i = 0, timer = null;
  const box = document.createElement('div');
  box.id = 'tv-casa';
  box.className = 'tv-overlay';
  document.body.appendChild(box);
  document.body.classList.add('tv-ligada');
  const pintar = () => {
    const p = painelTVCasa(i, periodoTV());
    box.innerHTML = `<button class="tv-pdf btn-ghost btn-sm" data-pdf-excluir>📄 PDF deste painel</button><button class="tv-x" title="Sair (Esc)">×</button>
      <button class="tv-seta tv-esq" title="Anterior">‹</button>
      <button class="tv-seta tv-dir" title="Próximo">›</button>
      <div class="tv-painel">${p.html}</div>`;
    box.querySelector('.tv-pdf').onclick=async()=>{if(timer)clearInterval(timer);const copia=box.querySelector('.tv-painel').cloneNode(true);if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen().catch(()=>{});imprimirAnalisePCP('Performance · '+(copia.querySelector('h2')?.textContent||'Modo TV'),copia,periodoTV(),typeof perfFonteTexto==='function'?perfFonteTexto():'PCP');};
    box.querySelector('.tv-x').onclick = fechar;
    box.querySelector('.tv-esq').onclick = () => { i--; pintar(); rearmar(); };
    box.querySelector('.tv-dir').onclick = () => { i++; pintar(); rearmar(); };
  };
  const rearmar = () => { if (timer) clearInterval(timer); timer = setInterval(() => { i++; pintar(); }, 15000); };
  const onTecla = ev => {
    if (ev.key === 'Escape') fechar();
    else if (ev.key === 'ArrowRight') { i++; pintar(); rearmar(); }
    else if (ev.key === 'ArrowLeft') { i--; pintar(); rearmar(); }
  };
  function fechar() {
    if (timer) clearInterval(timer);
    document.removeEventListener('keydown', onTecla);
    document.body.classList.remove('tv-ligada');
    box.remove();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener('keydown', onTecla);
  pintar(); rearmar();
  if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
}

function renderPerformanceCasa() {
  const el = document.getElementById('panel-performance');
  if (!el) return;
  const b = lerBonusCasa();
  const mes = b.mes || mesCasa();
  const f = periodoOuMes('_fPerf');
  const fins = osFinalizadasMes(mes);
  const rank = rankingFinalizadas(mes, b.pontos);
  const totalOs = rank.reduce((s, x) => s + x.osCount, 0);
  /* Chips do bônus: quem tem id de 6 dígitos, pelo vínculo salvo OU pela ficha
     ativa do RH. Só o vínculo salvo deixava de fora quem casou sozinho com o RH.
     Um chip por id: dois apelidos da mesma pessoa não viram dois chips, e ficha
     sem id não vira chip que acende no toque e apaga na repintura. */
  const fichas = [];
  const idsFicha = new Set();
  for (const x of [...lerVinculosCasa(), ...pessoasRHAtivas().map(p => ({ id: idPessoaCasa(p.id), chave: p.chave, nome: p.nome, apelido: p.apelido || '' }))]) {
    if (!x.id || idsFicha.has(x.id)) continue;
    idsFicha.add(x.id); fichas.push(x);
  }
  const pendentes = apelidosSemFicha();
  const itensMes = itensBonusDoMes(b, mes);
  const aprovados = itensMes.filter(i => i.status === 'aprovado' || i.status === 'pago');
  const pago = itensMes.filter(i => i.status === 'pago').reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aprovado = aprovados.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const filtroId = STATE._perfFiltro || '';
  const rankRows = rank.map((p, i) => {
    const item = itemDaPessoa(itensMes, p.id);
    const valor = item && item.status !== 'aberto' ? item.valor : propostaCasa(p.osCount, totalOs, b.orcamento, b.teto);
    const st = item ? item.status : 'aberto';
    const rotulo = st === 'pago' ? `Pago ${dinheiroCasa(valor)}` : st === 'aprovado' ? `Aprovado ${dinheiroCasa(valor)}` : (b.orcamento > 0 && valor > 0 ? dinheiroCasa(valor) : '—');
    const acao = st === 'aberto'
      ? `<button class="btn-primary btn-sm" data-aprovar="${esc(p.id)}" ${valor <= 0 ? 'disabled' : ''}>Aprovar</button>`
      : st === 'aprovado'
        ? `<button class="btn-primary btn-sm" data-pagar="${esc(p.id)}">Pagar</button><button class="btn-ghost btn-sm" data-reabrir="${esc(p.id)}">Reabrir</button>`
        : `<button class="btn-ghost btn-sm" data-reabrir="${esc(p.id)}">Reabrir</button>`;
    return `<tr class="casa-rank-row${filtroId === p.id ? ' on' : ''}" data-filtro-id="${esc(p.id)}">
      <td class="casa-pos">${i + 1}</td>
      <td><strong>${esc(p.nome)}</strong></td>
      <td class="num">${p.osCount}${p.retrab ? ` <small>${p.retrab} retrab</small>` : ''}</td>
      <td class="num">${esc(rotulo)}</td>
      <td class="casa-rank-acao">${acao}</td>
    </tr>`;
  }).join('');
  const semPonto = fins.filter(os => !instaladoresDaOs(os, b.pontos).length);
  const finsFiltro = filtroId ? fins.filter(os => instaladoresDaOs(os, b.pontos).includes(filtroId)) : fins;
  const apontar = finsFiltro.map(os => {
    const marcados = instaladoresDaOs(os, b.pontos);
    const eqIds = OPERACAO.equipe(os).map(n => fichaPorApelido(n)).filter(f2 => f2 && f2.id).map(f2 => f2.id);
    const primarios = new Set([...marcados, ...eqIds]);
    const principais = [];
    for (const id of primarios) {
      const ficha = fichas.find(x => x.id === id) || { id, nome: (pessoaRHPorId6(id) || {}).nome || '', apelido: '' };
      principais.push(ficha);
    }
    const outras = fichas.filter(x => !primarios.has(x.id));
    const mostrarOutras = fichas.length > 8;
    const chipsMain = (mostrarOutras ? principais : fichas.slice()).map(x =>
      chipFichaHTML(os.id, x, marcados.includes(x.id))
    ).join('');
    const chipsMais = mostrarOutras ? outras.map(x => chipFichaHTML(os.id, x, marcados.includes(x.id))).join('') : '';
    const semFicha = OPERACAO.equipe(os).filter(n => { const f2 = fichaPorApelido(n); return !(f2 && f2.id); });
    const d = OPERACAO.dia(os.finalizadaEm);
    const data = d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
    return `<li class="casa-apontar-os">
      <div class="casa-apontar-meta">
        <strong>O.S ${esc(os.numero || '—')}</strong>
        <span>${esc(os.cliente || '')}</span>
        <span>${esc(data)}</span>
        ${os.retrabalho ? '<span class="badge st-retrabalho">Retrabalho</span>' : ''}
      </div>
      <div class="casa-pontos">${chipsMain}${semFicha.map(n =>
        `<span class="sem-ficha">${esc(n)} · ${fichaPorApelido(n) ? 'sem ID no RH' : 'sem ficha'}</span>`
      ).join('')}${chipsMais ? `<details class="casa-mais-fichas"><summary>+ outra ficha</summary>${chipsMais}</details>` : ''}</div>
    </li>`;
  }).join('');
  const bonusHTML = `<div class="casa-perf-bar">
        <label>Orçamento <input type="number" min="0" step="0.01" id="perf-orc" value="${b.orcamento || ''}" placeholder="0"></label>
        <label>Teto por pessoa <input type="number" min="0" step="0.01" id="perf-teto" value="${b.teto || ''}" placeholder="Sem teto"></label>
        <label class="casa-mes">Mês da apuração <input type="month" id="perf-mes" value="${esc(mes)}"></label>
        <span class="casa-kpis">
          <span><b>${rank.length}</b> pessoas</span>
          <span><b>${fins.length}</b> O.S.</span>
          <span><b>${totalOs}</b> pontos</span>
          <span><b>${dinheiroCasa(Math.max(0, b.orcamento - aprovado))}</b> disponível</span>
        </span>
      </div>
      ${pago ? `<p class="metricas-nota">Já marcado como pago nesta apuração: ${dinheiroCasa(pago)}. Não lança na folha.</p>` : ''}
      ${semPonto.length ? `<p class="metricas-nota">${semPonto.length} O.S. sem ficha apontada — não entram no ranking até você apontar.</p>` : ''}
      ${filtroId ? `<p class="metricas-nota">Filtrando ${esc(rotuloPessoaCasa(filtroId))}. <button type="button" class="pcp-ver-carteira" data-limpar-filtro>Ver todas</button></p>` : ''}
      <div class="casa-perf-grid">
        <section class="casa-apontar">
          <h3>Apontar quem leva o ponto</h3>
          <p>Marque uma ou mais fichas. O ponto grava o ID. Não divide sozinho.</p>
          <ul class="casa-apontar-lista">${apontar || `<li class="text-muted">${fins.length ? 'Nenhuma O.S. neste filtro.' : 'Nenhuma O.S. finalizada no PCP neste mês. A baixa do ERP não entra.'}</li>`}</ul>
        </section>
        <aside class="casa-rank-box">
          <h3>Apuração para revisão</h3><p class="metricas-nota">Pontos e valores são sugestões manuais. Não lançam pagamento nem horas extras na folha. Compare tipo de serviço, retrabalho e evidências antes de aprovar.</p>
          ${rank.length ? `<table class="casa-rank-tabela"><thead><tr><th>#</th><th>Pessoa</th><th>Pts</th><th>Valor</th><th></th></tr></thead><tbody>${rankRows}</tbody></table>` : emptyState('', 'Nenhum ponto apontado neste mês', 'A apuração lê O.S. finalizada no PCP. Pessoa sem ficha do RH não entra.')}
        </aside>
      </div>`;

  /* DUAS ABAS (pedido do dono, 15/09/2026: "ter a aba relatório pra transferir
     o que for relatório pra essa parte"). A tela misturava o que se olha todo
     dia — quem entregou, o bônus do mês, as fichas a ligar — com a análise do
     período, e tudo isso numa rolagem só. Agora: EQUIPE é a operação, RELATÓRIO
     é o que se lê de vez em quando. O filtro de período serve as duas, porque
     as duas leem o mesmo recorte. Nada foi escondido: o que era quadro
     recolhível continua recolhível, só mudou de aba. */
  /* A BASE E O FECHAMENTO VÃO PARA O FIM (revisão de experiência,
     29/09/2026): a página abria pelo encanamento (versão, Atualizar, Fechar
     período) e o ranking vinha depois. Agora vem o que se lê (faixa de
     cobertura, pódio, conferência) e a base fica num quadro recolhível logo
     depois da apuração, antes dos outros quadros. O Modo TV deixou de ser o
     botão azul: é de vez em quando, não a ação da página. */
  /* REGRAS (F05, 29/09/2026): a regra do programa (divisão, comissão, bônus
     e redutor da volta) é da gestão. A aba só existe para admin e pcp, os
     mesmos que o servidor atende; outro papel que chegue com 'regras'
     guardado cai na Equipe. Sem o regras.js carregado (cache quebrado), a
     aba some em vez de derrubar a tela. */
  const podeRegras = ['admin', 'pcp'].includes(String(STATE.user?.papel || '')) && typeof perfRegrasHTML === 'function' && typeof REGRAS !== 'undefined';
  const abaPerf = STATE._perfAba === 'relatorio' ? 'relatorio' : STATE._perfAba === 'regras' && podeRegras ? 'regras' : 'equipe';
  const pendRH = pendentesConferenciaRH();
  /* Os <details> soltos da apuração ("Como interpretar os indicadores", "Ver
     O.S., percentuais...") fechavam a cada repintura: a apuração chega do
     servidor, uma confirmação muda a nota, e o que a pessoa lia sumia. Guarda
     quais estavam abertos (pelo texto do summary e a ordem) e reabre. */
  const chaveDet = lista => { const n = new Map(); return lista.map(d => { const t = ((d.querySelector(':scope > summary') || {}).textContent || '').trim(); const i = n.get(t) || 0; n.set(t, i + 1); return t + '#' + i; }); };
  const detAntes = [...el.querySelectorAll('details')];
  const detAbertos = new Set(chaveDet(detAntes).filter((k, i) => detAntes[i].open));
  el.innerHTML = `
    <div class="casa-pagina casa-perf">
      <div class="casa-pagina-head">
        <div><h2>Performance</h2><p>${abaPerf === 'equipe'
          ? 'Entregas, equipes e participação de cada pessoa. Uma apuração que você pode conferir.'
          : abaPerf === 'regras'
          ? 'Regras do programa das equipes: divisão, comissão e volta do carro, com o exemplo de cada versão.'
          : 'Compare participações confirmadas, identifique pendências e consulte os detalhes da operação.'}</p></div>
        <span class="casa-vista">
          <button class="btn-ghost btn-sm ${abaPerf === 'equipe' ? 'active' : ''}" data-perf-aba="equipe">Rankings</button>
          <button class="btn-ghost btn-sm ${abaPerf === 'relatorio' ? 'active' : ''}" data-perf-aba="relatorio">Relatório</button>
          ${podeRegras ? `<button class="btn-ghost btn-sm ${abaPerf === 'regras' ? 'active' : ''}" data-perf-aba="regras">Regras</button>` : ''}
          <button class="btn-ghost btn-sm" id="perf-tv" title="Ranking em tela cheia para a TV da fábrica">📺 Modo TV</button>
        </span>
      </div>
      ${abaPerf === 'regras' ? perfRegrasHTML() : `
      ${abaPerf === 'equipe' ? `
        ${typeof performanceEquipesHTML === 'function' ? performanceEquipesHTML() : produtividadeHTML()}
        ${typeof perfFonteHTML === 'function' ? perfFonteHTML() : ''}
        ${quadroCasa('perf-rh', `🔗 Conferir nomes do PCP × fichas do RH${pendRH ? ` <span class="badge sem-valor">${pendRH} pendente${pendRH === 1 ? '' : 's'}</span>` : ''}`, ligacaoRHHTML(), false)}
        ${quadroCasa('perf-plantoes', '🗓 Plantões vinculados às O.S.', plantaoPerformanceHTML(), false)}

      ` : `
        <div class="filter-bar">${filtroPeriodoHTML('_fPerf')}<button class="btn-ghost" id="perf-rel-pdf">📄 PDF resumido</button><button class="btn-ghost" id="perf-rel-detalhado">PDF com O.S.</button></div>
        ${typeof performanceRelatorioHTML === 'function' ? performanceRelatorioHTML() : ''}
        ${typeof perfFonteHTML === 'function' ? perfFonteHTML() : ''}
        ${quadroCasa('perf-entregues', '📦 Serviços entregues <small>ano a ano e mês a mês</small>', servicosEntreguesHTML(), false)}
        ${quadroCasa('perf-gente', '👷 Indicadores operacionais <small>horas e registros do período</small>', produtividadeHTML(), false)}
        ${quadroCasa('perf-retrab', '🔧 Retrabalho <small>de onde veio, de quem e de que tipo</small>', retrabalhoHTML(f), false)}
        ${quadroCasa('perf-carros', '🚚 Carros mais usados', carrosHTML(f), false)}
        ${quadroCasa('perf-bonus', 'Histórico de bônus manual <small>separado do programa de comissão de 1%</small>', bonusHTML, false)}
      `}`}
    </div>`;
  if (detAbertos.size) { const detDepois = [...el.querySelectorAll('details')]; chaveDet(detDepois).forEach((k, i) => { if (detAbertos.has(k)) detDepois[i].open = true; }); }
  wireFiltroPeriodo(el, '_fPerf', renderPerformanceCasa);
  wireQuadrosCasa(el);
  if(typeof wirePDFsEntregaPerformance==='function')wirePDFsEntregaPerformance(el);
  el.querySelectorAll('[data-perf-aba]').forEach(b => b.onclick = () => {
    STATE._perfAba = b.dataset.perfAba;
    // Entrar na aba Regras consulta o servidor de novo (outra versão pode ter sido criada).
    if (b.dataset.perfAba === 'regras' && typeof perfRegrasEstado === 'object') perfRegrasEstado.tentado = false;
    renderPerformanceCasa();
  });
  if (abaPerf === 'regras') { if (typeof wirePerfRegras === 'function') wirePerfRegras(el); }
  else if (typeof wirePerformanceEquipes === 'function') wirePerformanceEquipes(el);
  const tv = document.getElementById('perf-tv'); if (tv) tv.onclick = abrirTVCasa;
  const mesEl = document.getElementById('perf-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { gravarBonusCasa(trocarMesBonus(lerBonusCasa(), mesEl.value)); renderPerformanceCasa(); } };
  /* O change do Orçamento dispara no toque do Teto: redesenhar na hora
     destruía o campo recém-tocado e era preciso tocar de novo. Grava já e
     redesenha quando ninguém está com um campo da aba na mão. O do app.js
     tenta de novo até o campo ficar livre; o daqui desistia e a tela ficava
     com o orçamento velho. */
  const repintarBonus = () => setTimeout(() => {
    if (typeof repintarSeLivre === 'function') { repintarSeLivre(); return; }
    const a = document.activeElement;
    if (a && el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    renderPerformanceCasa();
  }, 0);
  const orcEl = document.getElementById('perf-orc');
  if (orcEl) orcEl.onchange = () => { gravarBonusCasa({ ...lerBonusCasa(), orcamento: Math.max(0, Number(orcEl.value) || 0) }); repintarBonus(); };
  const tetoEl = document.getElementById('perf-teto');
  if (tetoEl) tetoEl.onchange = () => { gravarBonusCasa({ ...lerBonusCasa(), teto: Math.max(0, Number(tetoEl.value) || 0) }); repintarBonus(); };
  el.querySelectorAll('[data-lig-ok]').forEach(btn => {
    btn.onclick = () => {
      const ap = btn.dataset.ligOk;
      const sel = el.querySelector(`[data-lig-sel="${CSS.escape(ap)}"]`);
      if (!sel || !sel.value) { toast('Escolha a pessoa do RH.', 'error'); return; }
      const p = pessoaRHPorChave(sel.value);
      if (!ligarApelidoRH(ap, sel.value)) { toast('Não consegui ligar este apelido. Confira se a ficha do RH tem CPF e se o ID não está repetido entre ficha e contrato de freelancer.', 'error'); return; }
      renderPerformanceCasa();
      toast(`${ap} → ${p.nome}. Foto e cargo já aparecem.`, 'success');
    };
  });
  const fixar = el.querySelector('[data-lig-fixar]');
  if (fixar) fixar.onclick = () => {
    // Congela o casamento de HOJE (já conferido na tabela) como vínculo salvo.
    const novos = conferenciaRH().filter(l => l.naLista && l.como === 'auto' && l.pessoa && l.pessoa.id);
    const lista = lerVinculosCasa().filter(v => !novos.some(l => normCasa(l.apelido) === normCasa(v.apelido)));
    for (const l of novos) lista.push({ id: l.pessoa.id, chave: l.pessoa.chave || '', nome: l.pessoa.nome || '', apelido: l.apelido });
    gravarVinculosCasa(lista);
    renderPerformanceCasa();
    toast(`${novos.length} ${novos.length === 1 ? 'ligação fixada' : 'ligações fixadas'}.`, 'success');
  };
  el.querySelectorAll('[data-lig-terceiro]').forEach(btn => {
    btn.onclick = () => {
      const ap = btn.dataset.ligTerceiro;
      if (!confirm(`"${ap}" é um terceiro, sem ficha no RH? O nome fica gravado como nome e não casa com ninguém do RH.`)) return;
      gravarVinculosCasa([...lerVinculosCasa().filter(v => normCasa(v.apelido) !== normCasa(ap)), { id: '', chave: '', nome: '', apelido: ap, semFicha: true }]);
      renderPerformanceCasa();
    };
  });
  el.querySelectorAll('[data-del-ficha]').forEach(btn => {
    btn.onclick = () => {
      // Apaga só ESTE apelido. Outro apelido da mesma pessoa continua ligado —
      // eles dividem o id do RH, e filtrar por id desligava os dois de uma vez.
      gravarVinculosCasa(lerVinculosCasa().filter(v => normCasa(v.apelido) !== normCasa(btn.dataset.delFicha)));
      renderPerformanceCasa();
    };
  });
  // Nome antigo vira ID (F12): confirmar a ligação pelo começo do nome, buscar
  // as O.S. antigas, gravar o ID, desfazer e dispensar o relatório.
  el.querySelectorAll('[data-lig-confirmar]').forEach(btn => {
    btn.onclick = () => {
      const ap = btn.dataset.ligConfirmar, p = pessoaRHPorChave(btn.dataset.ligChave);
      if (!p || !ligarApelidoRH(ap, btn.dataset.ligChave)) { toast('Não consegui confirmar este nome. Confira se a ficha do RH tem CPF e se o ID não está repetido.', 'error'); return; }
      renderPerformanceCasa();
      toast(`${ap} → ${p.nome}: confirmado.`, 'success');
    };
  });
  el.querySelectorAll('[data-lig-antigas]').forEach(b => { b.onclick = () => { void buscarAntigasConferenciaCasa(); }; });
  el.querySelectorAll('[data-lig-converter]').forEach(b => { b.onclick = () => { void iniciarConversaoNomesCasa(null); }; });
  el.querySelectorAll('[data-lig-converter-nome]').forEach(b => { b.onclick = () => { void iniciarConversaoNomesCasa([b.dataset.ligConverterNome]); }; });
  el.querySelectorAll('[data-lig-desfazer]').forEach(b => { b.onclick = () => { void iniciarDesfazerConversaoCasa(); }; });
  el.querySelectorAll('[data-lig-rel-fechar]').forEach(b => {
    b.onclick = () => {
      const rel = lerRelConvNomes();
      if (rel && rel.itens.some(desfazivelConv) && !confirm('Dispensar o relatório? O botão Desfazer some junto; o histórico de alterações de cada O.S. continua.')) return;
      gravarRelConvNomes(null);
      renderPerformanceCasa();
    };
  });
  const gravarPontosDaOs = osId => {
    const ids = [...el.querySelectorAll(`[data-ponto="${osId}"]`)].filter(cb => cb.checked).map(cb => cb.value);
    const bA = lerBonusCasa();
    const pontos = { ...bA.pontos, [osId]: ids };
    gravarBonusCasa({ ...bA, pontos });
    renderPerformanceCasa();
  };
  el.querySelectorAll('[data-ponto]').forEach(cb => {
    cb.onchange = () => gravarPontosDaOs(cb.dataset.ponto);
  });
  // Aprovar, pagar e reabrir mexem só nos itens DESTE mês: os de outro mês ficam.
  /* E leem o bônus NA HORA DO TOQUE (lerBonusCasa), não o `b` da pintura: o
     orçamento trocado com o foco ainda no Teto não repinta a tela, e gravar
     {...b} devolvia ao cfg o orçamento e o teto antigos, calado, e aprovava o
     valor calculado com eles. */
  const mesmaPessoa = (x, id) => (x.mes || b.mes) === mes && (x.id === id || (!x.id && chavePessoaCasa(x.nome) === id));
  el.querySelectorAll('[data-aprovar]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.aprovar;
      const p = rank.find(x => x.id === id);
      const bA = lerBonusCasa();
      const valor = propostaCasa(p ? p.osCount : 0, totalOs, bA.orcamento, bA.teto);
      if (valor <= 0) return;
      const itens = bA.itens.filter(x => !mesmaPessoa(x, id)).concat([{ id, nome: rotuloPessoaCasa(id), valor, status: 'aprovado', mes }]);
      gravarBonusCasa({ ...bA, itens });
      renderPerformanceCasa();
      toast('Proposta aprovada. Ainda não é pagamento na folha.', 'success');
    };
  });
  el.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.pagar;
      const bA = lerBonusCasa();
      const itens = bA.itens.map(x => mesmaPessoa(x, id) && x.status === 'aprovado' ? { ...x, id, status: 'pago' } : x);
      gravarBonusCasa({ ...bA, itens });
      renderPerformanceCasa();
      toast('Bônus marcado como pago nesta apuração.', 'success');
    };
  });
  el.querySelectorAll('[data-reabrir]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.reabrir;
      // Reabrir apaga o registro. Num bônus já pago, um toque torto abria espaço
      // para pagar duas vezes: pergunta antes.
      const it = itemDaPessoa(itensMes, id);
      if (it && it.status === 'pago' && !confirm(`${rotuloPessoaCasa(id)} está marcado como pago (${dinheiroCasa(it.valor)}). Reabrir apaga esse registro. Continuar?`)) return;
      const bA = lerBonusCasa();
      gravarBonusCasa({ ...bA, itens: bA.itens.filter(x => !mesmaPessoa(x, id)) });
      renderPerformanceCasa();
    };
  });
  el.querySelectorAll('[data-filtro-id]').forEach(row => {
    row.onclick = ev => {
      if (ev.target.closest('button')) return;
      const id = row.dataset.filtroId;
      STATE._perfFiltro = STATE._perfFiltro === id ? '' : id;
      renderPerformanceCasa();
    };
  });
  const limpar = el.querySelector('[data-limpar-filtro]');
  if (limpar) limpar.onclick = () => { STATE._perfFiltro = ''; renderPerformanceCasa(); };
}

function lerAgendaCasa() {
  const cfg = STORE.getCFG();
  const a = cfg.agendaPCP || {};
  return {
    eventos: Array.isArray(a.eventos) ? a.eventos : [],
    plantoes: Array.isArray(a.plantoes) ? a.plantoes : [],
  };
}

function gravarAgendaCasa(a) {
  const cfg = STORE.getCFG();
  cfg.agendaPCP = a;
  STORE.saveCFG(cfg);
}

/* ── Quem pode ser escalado ────────────────────────────────────────────────
   Uma base só: a lista de instaladores do PCP continua valendo (é o apelido
   que a O.S guarda), mas quem tem ficha INATIVA no RH sai — "quem é inativado
   da empresa sai da lista" (ordem do dono, 14/09/2026). Para plantão entra a
   empresa toda, que é o que o dono pediu: o plantão não é só de instalação. */
function equipeEscalavel() {
  const doPCP = (STORE.getCFG().instaladores || []).filter(n => {
    const p = fichaDoApelido(n);
    return !p || p.ativo !== false;
  });
  const jaTem = new Set(doPCP.map(normCasa));
  /* A MESMA PESSOA NÃO ENTRA DUAS VEZES. Comparar só o texto deixava
     "Charles" (PCP) e "Charles Alves Dias" (RH) como duas pessoas, e o mesmo
     com todo nome do PCP ligado à ficha por vínculo ou pelo começo do nome
     (conferência de 29/09/2026). Agora conta a FICHA a que o nome do PCP chega. */
  const fichasDoPCP = new Set(doPCP.map(n => fichaDoApelido(n)).filter(Boolean).map(p => p.chave || p.id).filter(Boolean));
  const doRH = pessoasRHAtivas().filter(p => !fichasDoPCP.has(p.chave) && !(p.id && fichasDoPCP.has(p.id))
    && !jaTem.has(normCasa(p.nome)) && (!p.apelido || !jaTem.has(normCasa(p.apelido))));
  return { doPCP, doRH };
}
function optionsEquipeCasa(selecionado) {
  const { doPCP, doRH } = equipeEscalavel();
  /* O PLANTÃO GRAVA O ID DO RH (ordem do dono, 29/09/2026); o nome só aparece.
     Plantão antigo guarda o nome: ele cai na opção da mesma pessoa.
     QUEM JÁ ESTÁ GRAVADO TEM DE CABER NA LISTA. O campo "Quem" era texto
     livre e virou select fechado com `required`. Quem foi desligado,
     inativado, ou teve o nome corrigido no RH deixou de ter opção: ao reabrir
     um plantão antigo o navegador selecionava a vazia e o Salvar só devolvia
     "Selecione um item da lista". As saídas eram falsear quem fez o
     sobreaviso ou apagar o plantão. */
  const alvo = String(selecionado || '').trim();
  const kAlvo = alvo ? OPERACAO.chavePessoa(alvo) : '';
  let achou = false;
  const op = (valor, rotulo) => {
    const on = !achou && !!kAlvo && OPERACAO.chavePessoa(valor) === kAlvo;
    if (on) achou = true;
    return `<option value="${esc(valor)}" ${on ? 'selected' : ''}>${esc(rotulo)}</option>`;
  };
  const pcp = doPCP.map(n => op(OPERACAO.idPessoa(n) || n, OPERACAO.nomePessoa(n))).join('');
  const porArea = new Map();
  for (const p of doRH) {
    const k = p.area || p.setor || 'Sem área';
    if (!porArea.has(k)) porArea.set(k, []);
    porArea.get(k).push(p);
  }
  const rh = [...porArea.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([area, ps]) =>
    `<optgroup label="${esc(area)}">${ps.map(p => op(OPERACAO.ehIdPessoa(p.id) ? p.id : p.nome, p.nome)).join('')}</optgroup>`).join('');
  const gravado = alvo && !achou
    ? `<optgroup label="Registrado neste plantão"><option value="${esc(alvo)}" selected>${esc(OPERACAO.nomePessoa(alvo))} · fora da lista atual do RH</option></optgroup>`
    : '';
  return `${gravado}${pcp ? `<optgroup label="Instalação (PCP)">${pcp}</optgroup>` : ''}
    ${rh}`;
}
function optionsVeiculoCasa(selecionado) {
  const doAtivos = veiculosRH();
  /* SEM CARRO (pedido do Léo, 29/09/2026): "tem vezes que não precisa de
     carro". Primeira opção da lista; ver OPERACAO.SEM_CARRO. */
  const semCarro = `<optgroup label="Sem carro"><option value="${esc(OPERACAO.SEM_CARRO)}" ${OPERACAO.semCarro({ veiculo: selecionado }) ? 'selected' : ''}>🏠 ${esc(OPERACAO.SEM_CARRO)} (sem carro)</option></optgroup>`;
  const doCfg = (STORE.getCFG().veiculos || []).filter(v => !doAtivos.some(x => normCasa(x.nome) === normCasa(v)));
  return `${semCarro}${doAtivos.map(v => `<option value="${esc(v.nome)}" ${v.nome === selecionado ? 'selected' : ''}>${esc(v.nome)}${v.lugares ? ` · ${v.lugares} lugares` : ''}${v.placa ? ` · ${v.placa}` : ''}</option>`).join('')}
    ${doCfg.length ? `<optgroup label="Só no PCP (cadastrar no Ativos)">${doCfg.map(v => `<option value="${esc(v)}" ${v === selecionado ? 'selected' : ''}>${esc(v)}</option>`).join('')}</optgroup>` : ''}`;
}
// Aviso quando a pessoa escalada está de férias/atestado no dia. Sem acesso à
// ficha do RH, o silêncio seria lido como "está todo mundo disponível" — então
// a tela diz que não conferiu, em vez de não dizer nada.
function avisoAusenciaCasa(nomes, dia) {
  if (!temFichaRH()) {
    return '<p class="metricas-nota">Férias e atestados não foram conferidos: a situação da equipe só aparece com crachá da gestão.</p>';
  }
  const fora = (nomes || []).map(n => {
    const p = fichaDoApelido(n);
    const a = p ? ausenciaRH(p, dia) : null;
    return a ? `${p.nome} (${a.motivo}${a.ate ? ' até ' + a.ate.slice(8, 10) + '/' + a.ate.slice(5, 7) : ''})` : '';
  }).filter(Boolean);
  return fora.length ? `<p class="metricas-nota alerta-ausencia">⚠️ Fora da empresa neste dia: ${esc(fora.join(' · '))}.</p>` : '';
}

const TIPOS_PLANTAO = { diarista: 'Diarista', sobreaviso: 'Sobreaviso', folga: 'Folga' };
function pillPlantao(p) {
  const t = TIPOS_PLANTAO[p.tipo] ? p.tipo : '';
  return `<span class="casa-pill ${t || 'navy'}" title="${esc(OPERACAO.nomePessoa(p.quem || ''))}${p.obs ? ' — ' + esc(p.obs) : ''}">${t ? esc(TIPOS_PLANTAO[t]) : 'plantão'}</span>`;
}

/* OS CHIPS DO CALENDÁRIO — o mesmo controle que Entregas já usa.
 *
 * Pedido do dono (15/09/2026): "colocar chips nessa parte". O calendário tinha
 * só `‹ [input month] ›`: para chegar em março do ano passado eram dezoito
 * toques numa seta, e o <input type="month"> abre um seletor nativo diferente
 * em cada aparelho (no tablet ele é pequeno e some atrás do teclado). Chips
 * mostram o ano inteiro de uma vez, com alvo grande para o dedo.
 *
 * Dois níveis: os anos (só os que a casa tem O.S) e os doze meses do ano
 * escolhido. O mês com O.S programada leva um ponto — assim dá para ver onde há
 * trabalho sem abrir mês por mês.
 */
/* A MESMA RÉGUA DA GRADE. Os chips liam `instalacao.data` enquanto a grade
   desenha por `diasCasa()` — que cai no prazo e na previsão quando não há
   agendamento. Duas réguas no mesmo lugar fazem o chip dizer que o mês está
   vazio e a grade mostrar O.S nele. */
function anosAgendaCasa() {
  const anos = new Set();
  for (const o of STORE.getAllOS() || []) {
    if (OPERACAO.encerradaERP(o)) continue;
    for (const d of diasCasa(o)) if (/^\d{4}/.test(d)) anos.add(Number(d.slice(0, 4)));
  }
  anos.add(new Date().getFullYear());
  return [...anos].filter(a => Number.isFinite(a)).sort((a, b) => b - a);
}

/* MÊS VAZIO NO PASSADO NÃO É MÊS SEM TRABALHO.
   O aparelho guarda as O.S abertas e as finalizadas de 60 dias; o que saiu
   dessa janela, e o que o ERP já encerrou, não está aqui. Sem dizer isso, um
   março limpo parece um março parado — e é só o aparelho não ter mais os
   dados. Ver a lição: zero não é resultado. */
function notaMesAgendaCasa(mes, osMes) {
  const hojeMes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  if (mes >= hojeMes) return '';
  const quantas = (osMes || []).length;
  return `<p class="metricas-nota">${quantas
    ? `Mês passado: aparecem só as <strong>${quantas}</strong> O.S que este aparelho ainda guarda.`
    : 'Nenhuma O.S deste mês está guardada no aparelho.'} O que o ERP encerrou, e o que saiu da janela de ${STORE.JANELA_LOCAL_DIAS || 60} dias, não entra nesta grade — procure em Entregas ou em Arquivados.</p>`;
}

function chipsAgendaCasa(mes) {
  const ano = Number(mes.slice(0, 4));
  const hojeMes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const anos = anosAgendaCasa();
  const comOS = new Set();
  for (const o of STORE.getAllOS() || []) {
    if (OPERACAO.encerradaERP(o)) continue;
    for (const d of diasCasa(o)) if (d.slice(0, 4) === String(ano)) comOS.add(d.slice(0, 7));
  }
  const chipAno = anos.map(a =>
    `<button type="button" class="casa-chip-per ${a === ano ? 'on' : ''}" data-ag-ano="${a}">${a}</button>`
  ).join('');
  const chipMes = MES_CURTO.map((rot, i) => {
    const k = `${ano}-${String(i + 1).padStart(2, '0')}`;
    return `<button type="button" class="casa-chip-per ${k === mes ? 'on' : ''}${k === hojeMes ? ' hoje' : ''}" data-ag-mes="${k}" title="${k === hojeMes ? 'mês corrente' : ''}">${rot}${comOS.has(k) ? '<i class="casa-chip-ponto" title="tem O.S programada"></i>' : ''}</button>`;
  }).join('');
  return `<div class="casa-chips-periodo casa-chips-ano">${chipAno}</div>
    <div class="casa-chips-periodo">${chipMes}</div>`;
}

function renderAgendaCasa() {
  const el = document.getElementById('panel-agenda');
  if (!el) return;
  if (!STATE._agMes) {
    const d = new Date();
    STATE._agMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const mes = STATE._agMes;
  const [y, m] = mes.split('-').map(Number);
  const agenda = lerAgendaCasa();
  const todas = STORE.getAllOS();
  const osMes = osNoMesCasa(mes).filter(o => STATE._agendaConcluidas || !o.finalizadaEm);
  if (!STATE._agDia || !String(STATE._agDia).startsWith(mes)) {
    STATE._agDia = OPERACAO.dia(new Date());
    if (!String(STATE._agDia).startsWith(mes)) STATE._agDia = mes + '-01';
  }
  const sel = STATE._agDia;
  const offset = new Date(y, m - 1, 1).getDay();
  const celulas = Array.from({ length: 42 }, (_, i) => new Date(y, m - 1, 1 - offset + i));
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hoje = OPERACAO.dia(new Date());
  // A última linha só aparece se tiver dia do mês (fevereiro cabe em 5 linhas).
  const linhas = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7);
  const grade = celulas.slice(0, linhas * 7).map(dt => {
    const iso = OPERACAO.dia(dt);
    const noMes = dt.getMonth() === m - 1;
    const doDia = osMes.filter(o => diasCasa(o).includes(iso)).sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
    const pls = agenda.plantoes.filter(p => p.data === iso && !p.cancelado);
    const nEv = agenda.eventos.filter(e => e.data === iso).length;
    // A CÉLULA NÃO CRESCE COM O CONTEÚDO: números demais viravam uma pílula
    // larga que empurrava a coluna e encavalava a grade inteira. Agora é
    // contagem + as duas primeiras O.S, e o resto no painel do dia.
    const pills = [
      doDia.length && `<span class="casa-pill os" title="${esc(doDia.map(o => o.numero).join(', '))}">${doDia.length}<span class="so-largo"> O.S</span></span>`,
      ...pls.slice(0, 2).map(pillPlantao),
      pls.length > 2 && `<span class="casa-pill navy">+${pls.length - 2}</span>`,
      nEv && `<span class="casa-pill mute">${nEv} ev.</span>`,
    ].filter(Boolean).join('');
    const nums = doDia.slice(0, 3).map(o => esc(o.numero || '—')).join(' · ');
    return `<button type="button" class="casa-dia ${noMes ? '' : 'fora'} ${iso === sel ? 'sel' : ''} ${iso === hoje ? 'hoje' : ''}" data-dia="${iso}" aria-pressed="${iso===sel}" aria-label="${esc(dt.toLocaleDateString('pt-BR'))}: ${doDia.length} ordens, ${pls.length} plantões, ${nEv} eventos" title="${doDia.length} O.S${doDia.length ? ': ' + esc(doDia.map(o => o.numero).join(', ')) : ''}">
      <span class="casa-dia-num">${dt.getDate()}</span>
      <span class="casa-dia-pills">${pills}</span>
      ${nums ? `<span class="casa-dia-os">${nums}${doDia.length > 3 ? ` +${doDia.length - 3}` : ''}</span>` : ''}
    </button>`;
  }).join('');

  const osDia = osMes.filter(o => diasCasa(o).includes(sel)).sort((a, b) => (typeof ordemHora === 'function' ? ordemHora(a).localeCompare(ordemHora(b)) : 0));
  const plDia = agenda.plantoes.filter(p => p.data === sel && !p.cancelado);
  const evDia = agenda.eventos.filter(e => e.data === sel);
  const dSel = new Date(sel + 'T12:00:00');
  const dataBR = `${(typeof DIAS_SEMANA !== 'undefined' ? DIAS_SEMANA[dSel.getDay()] : '')} ${sel.slice(8, 10)}/${sel.slice(5, 7)}`;
  // O.S que dá para colocar neste dia: aberta, não interna, ainda não neste dia.
  const candidatas = todas.filter(o => !o.finalizadaEm && !OPERACAO.interno(o) && !diasCasa(o).includes(sel))
    .sort((a, b) => (OPERACAO.prazo(a) || '9999').localeCompare(OPERACAO.prazo(b) || '9999') || String(b.numero).localeCompare(String(a.numero)));
  const conflitosDia = OPERACAO.conflitos(todas, sel);
  const statusHTML = os => { const st = OPERACAO.status(os); return `<span class="badge st-${st}">${esc(typeof statusLabelDe === 'function' ? statusLabelDe(os, st) : st)}</span>`; };
  const escalados = umaPorPessoa(osDia.flatMap(o => OPERACAO.equipe(o)));

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Calendário da produção</h2><p>Cada dia mostra quantas O.S estão programadas e os plantões. Clique no dia para ver a lista, programar e mandar a mensagem.</p></div>
        <span class="casa-mes-nav">
          <button class="btn-ghost btn-sm" id="ag-ant" title="Mês anterior">‹</button>
          <label class="casa-mes">Mês <input type="month" id="ag-mes" value="${esc(mes)}"></label>
          <button class="btn-ghost btn-sm" id="ag-prox" title="Próximo mês">›</button><button class="btn-ghost btn-sm" id="ag-hoje">Mês atual</button>
        </span>
      </div>
      <label class="agenda-recorte"><input type="checkbox" id="ag-concluidas" ${STATE._agendaConcluidas ? 'checked' : ''}> Incluir concluídas pela equipe</label>
      <p class="metricas-nota">${STATE._agendaConcluidas ? 'A lista inclui histórico concluído. WhatsApp e PDF da saída usam somente as O.S. abertas.' : 'O.S. abertas. O calendário também identifica retiradas na loja; o PDF de saída reúne instalações externas.'}</p>
      ${chipsAgendaCasa(mes)}
      <div class="casa-agenda">
        <div class="casa-cal-box">
          <div class="casa-cal-dow">${dow.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="casa-cal">${grade}</div>
          <p class="metricas-nota"><span class="casa-pill diarista">Diarista</span> <span class="casa-pill sobreaviso">Sobreaviso</span> <span class="casa-pill folga">Folga</span> — plantões vêm da aba Plantões.</p>
          ${notaMesAgendaCasa(mes, osMes)}
        </div>
        <aside class="casa-dia-painel">
          <h3>${esc(dataBR)}${sel === hoje ? ' · hoje' : ''}</h3>
          <p>${osDia.length} O.S · ${plDia.length} plantão · ${evDia.length} evento${conflitosDia.length ? ` · <strong>${conflitosDia.length} possível conflito</strong>` : ''}</p>
          ${avisoAusenciaCasa(escalados, sel)}
          <div>${osDia.map(os => `<div class="casa-dia-item" data-os-id="${esc(os.id)}">
              <div class="l1"><span>⏰ ${esc(typeof rotuloHora === 'function' ? rotuloHora(os) : '')}</span><span>O.S ${esc(os.numero || '—')}</span><span>${esc(os.cliente || '')}</span>${statusHTML(os)}</div>
              <div class="l2"><span>👥 ${esc(OPERACAO.equipeTexto(os, ', ') || 'sem equipe')}</span><span>🚗 ${esc(os.veiculo || 'sem veículo')}</span>${os.servico ? `<span>${esc(os.servico)}</span>` : ''}</div>
            </div>`).join('') || '<p class="text-muted">Nenhuma O.S neste dia.</p>'}</div>
          ${plDia.length ? `<ul class="casa-os">${plDia.map(p => `<li>${pillPlantao(p)} ${esc(OPERACAO.nomePessoa(p.quem))} · ${esc(p.inicio)}–${esc(p.fim)}${p.titulo ? ' · ' + esc(p.titulo) : ''}</li>`).join('')}</ul>` : ''}
          ${evDia.length ? `<ul class="casa-os">${evDia.map(e => `<li>${esc(e.titulo)} <button class="btn-ghost btn-xs edit-only" data-del-ev="${esc(e.id)}">Apagar</button></li>`).join('')}</ul>` : ''}
          <div class="casa-dia-acoes">
            <button class="btn-ghost btn-sm" id="ag-wpp" ${osDia.length ? '' : 'disabled'} title="Mensagem da programação do dia">💬 Mensagem do dia</button>
            <button class="btn-ghost btn-sm" id="ag-pdf" ${osDia.length ? '' : 'disabled'} title="Relatório do dia em PDF">🖨 PDF do dia</button>
          </div>
          <details class="casa-add-os edit-only" ${STATE._agAddAberto ? 'open' : ''}>
            <summary>+ Adicionar O.S ao dia</summary>
            ${formAddOSHTML('ag-add', sel, candidatas)}
          </details>
          <form id="ag-form" class="casa-criterios edit-only">
            <label>Evento neste dia <input name="titulo" required placeholder="Título"></label>
            <input type="hidden" name="data" value="${esc(sel)}">
            <button class="btn-ghost btn-sm" type="submit">Registrar evento</button>
          </form>
        </aside>
      </div>
    </div>`;
  const concluidas = document.getElementById('ag-concluidas'); if (concluidas) concluidas.onchange = () => { STATE._agendaConcluidas = concluidas.checked; renderAgendaCasa(); };
  const hojeBtn=el.querySelector('#ag-hoje');if(hojeBtn)hojeBtn.onclick=()=>{STATE._agMes=hoje.slice(0,7);STATE._agDia=hoje;renderAgendaCasa();};
  const mesEl = document.getElementById('ag-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { STATE._agMes = mesEl.value; STATE._agDia = ''; renderAgendaCasa(); } };
  const andar = n => {
    const d = new Date(y, m - 1 + n, 1);
    STATE._agMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    STATE._agDia = ''; renderAgendaCasa();
  };
  /* NO TABLET O PAINEL DO DIA FICA ABAIXO DA GRADE (uma coluna a partir de
     1100 px), então tocar num dia não mudava nada no campo de visão: a pessoa
     tocava de novo, achando que não pegou. Em tela larga o painel já está ao
     lado e rolar seria atrapalhar. */
  el.querySelectorAll('[data-ag-mes]').forEach(b => b.onclick = () => {
    STATE._agMes = b.dataset.agMes; STATE._agDia = ''; renderAgendaCasa();
  });
  el.querySelectorAll('[data-ag-ano]').forEach(b => b.onclick = () => {
    // Troca de ano mantém o MÊS escolhido: quem está olhando agosto quer agosto
    // do outro ano, não janeiro. Se o mês não existir mais (futuro), cai no mês
    // corrente daquele ano.
    const ano = b.dataset.agAno;
    const mesAtual = String(STATE._agMes || '').slice(5, 7) || '01';
    STATE._agMes = `${ano}-${mesAtual}`; STATE._agDia = ''; renderAgendaCasa();
  });
  const ant = document.getElementById('ag-ant'); if (ant) ant.onclick = () => andar(-1);
  const prox = document.getElementById('ag-prox'); if (prox) prox.onclick = () => andar(1);
  el.querySelectorAll('[data-dia]').forEach(btn => {
    btn.onclick = () => {
      STATE._agDia = btn.dataset.dia;
      renderAgendaCasa();
      // Tela estreita: o painel do dia fica ABAIXO da grade, fora do campo de
      // visão. Sem levar o dedo até lá, o toque parecia não ter pego.
      const painel = document.getElementById('panel-agenda');
      const alvo = painel && painel.querySelector('.casa-dia-painel');
      if (alvo && window.matchMedia('(max-width: 1100px)').matches) {
        alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  });
  const wpp = document.getElementById('ag-wpp'); if (wpp) wpp.onclick = () => { if (typeof whatsappServicosDia === 'function') whatsappServicosDia(sel); };
  const pdf = document.getElementById('ag-pdf'); if (pdf) pdf.onclick = () => { if (typeof relatorioServicosDia === 'function') relatorioServicosDia(sel); };
  const add = el.querySelector('.casa-add-os'); if (add) add.ontoggle = () => { STATE._agAddAberto = add.open; };
  wireAddOSCasa(el, 'ag-add', sel, () => { STATE._agAddAberto = false; renderAgendaCasa(); });
  const form = document.getElementById('ag-form');
  if (form) form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const titulo = String(fd.get('titulo') || '').trim();
    const data = String(fd.get('data') || '');
    if (!titulo || !data) return;
    const a = lerAgendaCasa();
    a.eventos = [{ id: STORE.uuid(), titulo, data }, ...a.eventos];
    gravarAgendaCasa(a);
    renderAgendaCasa();
  };
  el.querySelectorAll('[data-del-ev]').forEach(btn => {
    btn.onclick = () => {
      // Botão pequeno, sem desfazer: um toque torto apagava o evento.
      if (!confirm('Apagar este evento do calendário?')) return;
      const a = lerAgendaCasa();
      a.eventos = a.eventos.filter(e => e.id !== btn.dataset.delEv);
      gravarAgendaCasa(a);
      renderAgendaCasa();
    };
  });
  bindCardClicks(el);
}

/* ── Programar uma O.S num dia (usado no Calendário e na Programação) ──────
   Escreve na própria O.S (data, período, hora, duração, equipe, veículo) —
   a programação mora na O.S, não numa agenda paralela. */
// A lista precisa dizer que a O.S já tem dia: sem isso o gestor tirava de
// 30/09 uma O.S confirmada com o cliente achando que programava uma livre.
function rotuloJaProgramadaCasa(o) {
  const d = OPERACAO.diasAgenda(o)[0];
  return (d ? ` · programada ${d.slice(8, 10)}/${d.slice(5, 7)}` : '') + (o.confirmacao === 'Confirmado' ? ' · confirmada' : '');
}
/* OCUPADOS NO DIA (F10, 30/09/2026): quem já está em outra O.S. no mesmo
   horário (OPERACAO.ocupados, pelo dia e pelo período que a tela mostra) e
   quem o RH diz que está fora (férias, atestado). O chip do componente de
   equipe aparece marcado ANTES de gravar; é aviso, não trava. */
function ocupadosNoDiaCasa(dia, periodo, osId, extra = {}) {
  const r = OPERACAO.ocupados(STORE.getAllOS(), dia, periodo, osId, extra);
  const pessoas = new Map(r.pessoas);
  if (typeof temFichaRH === 'function' && temFichaRH()) for (const p of pessoasRH()) {
    if (!p || p.ativo === false || !OPERACAO.ehIdPessoa(p.id)) continue;
    const a = ausenciaRH(p, dia);
    if (a) pessoas.set(p.id, [...(pessoas.get(p.id) || []), { texto: a.motivo === 'Férias' ? 'De férias' : 'Fora pelo RH: ' + a.motivo }]);
  }
  return { pessoas, veiculos: r.veiculos };
}
const equipesCadastradasCasa = () => ((STORE.getCFG() || {}).performancePCP || {}).equipes || [];
const versoesRegrasCasa = () => (typeof perfRegrasFonte === 'function' ? perfRegrasFonte().versoes : []);
function formAddOSHTML(id, dia, candidatas) {
  /* A EQUIPE É O COMPONENTE ÚNICO (F10): no lugar de "Equipe salva" e dos
     chips. Admin e pcp montam a divisão (líder, percentual, equipe); operação
     e montagem montam só as pessoas. Sem o componente (cache velho), os
     chips de antes. */
  const componente = typeof ALOCUI !== 'undefined';
  return `<form id="${esc(id)}">
      <label>Buscar O.S. ou cliente <input type="search" data-ag-busca placeholder="Número ou nome do cliente"></label><label>O.S <select name="osId" required><option value="">Escolher a O.S</option>${candidatas.map(o => `<option value="${esc(o.id)}">${esc(o.numero || '—')} · ${esc((o.cliente || '').slice(0, 34))}${OPERACAO.prazo(o) ? ' · prazo ' + OPERACAO.prazo(o).slice(8, 10) + '/' + OPERACAO.prazo(o).slice(5, 7) : ''}${esc(rotuloJaProgramadaCasa(o))}</option>`).join('')}</select></label>
      <div class="linha2">
        <label>Período <select name="periodo">${(typeof PERIODO_OPTS !== 'undefined' ? PERIODO_OPTS : ['Manhã', 'Tarde', 'Dia inteiro', 'Horário']).map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
        <label>Hora de saída <input name="hora" type="time"></label>
      </div>
      <div class="linha2">
        <label>Duração (dias) <input name="dias" type="number" min="1" value="1"></label>
        <label>Veículo <select name="veiculo"><option value="">— sem veículo —</option>${optionsVeiculoCasa('')}</select></label>
      </div>
      ${componente ? `<div class="campo-grupo aloc-campo"><span>Equipe</span><div class="aloc-host" data-aloc-host="${esc(id)}"><p class="aloc-dica">Escolha a O.S. para montar a equipe.</p></div></div>` : `${typeof perfModeloEquipeHTML === 'function' ? perfModeloEquipeHTML() : ''}
      <div class="campo-grupo"><span>Equipe</span><div class="casa-chips">${equipeEscalavel().doPCP.map(n => {
        const p = fichaDoApelido(n);
        const a = p ? ausenciaRH(p, dia) : null;
        // O chip grava o ID do RH (quando há ficha) e mostra o nome.
        const quem = p && p.nome && p.id ? `${p.nome} · ID ${p.id}` : 'Sem ficha no RH: grava o nome';
        return `<label class="casa-chip ${a ? 'fora' : ''}" title="${esc(a ? a.motivo + ' · ' + quem : quem)}"><input type="checkbox" name="equipe" value="${esc(OPERACAO.idPessoa(n) || n)}"><span>${esc(OPERACAO.nomePessoa(n))}</span>${a ? `<small>${esc(a.motivo)}</small>` : ''}</label>`;
      }).join('') || '<span class="text-muted">Cadastre instaladores em Configurações.</span>'}</div></div>`}
      <button class="btn-primary btn-sm" type="submit">Programar em ${esc(dia.slice(8, 10) + '/' + dia.slice(5, 7))}</button>
    </form>`;
}
function wireAddOSCasa(el, id, dia, aoGravar) {
  el.querySelectorAll(`#${id} .casa-chip input[name="equipe"]`).forEach(cb => {
    cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked);
  });
  const f = document.getElementById(id);
  if (!f) return;
  const host = f.querySelector('[data-aloc-host]');
  const componente = !!host && typeof ALOCUI !== 'undefined';
  const chave = 'agenda:' + id;
  if (!componente && typeof perfWireModelo === 'function') perfWireModelo(f);
  const selOS = f.querySelector('[name="osId"]');
  /* O COMPONENTE PARTE DA O.S. ESCOLHIDA (a equipe e a divisão que ela já
     tem) e marca quem está ocupado no dia e no período do formulário. A
     escolha sobrevive à repintura da Agenda (a montagem mora no componente). */
  let osDoComp = null;
  const campo = n => f.querySelector(`[name="${n}"]`);
  const periodoDoForm = () => ({ periodo: String((campo('periodo') || {}).value || ''), hora: String((campo('hora') || {}).value || ''), duracaoDias: Math.max(1, Number((campo('dias') || {}).value) || 1) });
  const ocupadosAgora = () => (osDoComp ? ocupadosNoDiaCasa(dia, periodoDoForm(), osDoComp.id, { os: osDoComp }) : { pessoas: new Map(), veiculos: new Map() });
  // O veículo que já saiu em outra O.S. no mesmo horário aparece marcado na lista.
  const pintarVeiculos = vs => {
    const sel = campo('veiculo');
    if (!sel || !sel.options) return;
    [...sel.options].forEach(op => {
      if (op.dataset && op.dataset.rotulo === undefined) op.dataset.rotulo = op.textContent;
      const xs = op.value ? vs.get(op.value) : null;
      op.textContent = (op.dataset ? op.dataset.rotulo : op.textContent) + (xs && xs.length ? ' · ocupado na O.S. ' + xs.map(x => x.numero || 'sem número').join(', ') : '');
    });
  };
  /* A ESCOLHA SOBREVIVE À REPINTURA DA AGENDA (o pull que traz mudança
     repinta a aba) com o formulário INTEIRO: a O.S., o período, a hora, a
     duração e o veículo voltam juntos, e os ocupados são contados pelo que
     voltou. Só a O.S. voltando, o formulário vinha em Manhã, 1 dia e sem
     veículo, com a equipe montada, e o Programar gravava errado sem aviso
     (revisão F10). Fechar o formulário ou programar desiste da escolha. */
  const escolhas = STATE._agAddEscolha || (STATE._agAddEscolha = {});
  const CAMPOS_FORM = ['periodo', 'hora', 'dias', 'veiculo'];
  const lerForm = () => Object.fromEntries(CAMPOS_FORM.map(n => [n, String((campo(n) || {}).value ?? '')]));
  const guardarForm = () => { const e = escolhas[id]; if (e && typeof e === 'object' && e.os) escolhas[id] = { ...e, ...lerForm() }; };
  const montarComp = (o, manter) => {
    osDoComp = o || null;
    if (!componente) return;
    escolhas[id] = o ? { os: o.id, ...lerForm() } : '';
    if (!o) { ALOCUI.esquecer(chave); host.innerHTML = '<p class="aloc-dica">Escolha a O.S. para montar a equipe.</p>'; pintarVeiculos(new Map()); return; }
    const papel = STATE.user && STATE.user.papel, oc = ocupadosAgora();
    ALOCUI.iniciar(chave, { os: o, equipes: equipesCadastradasCasa(), papel, modo: ALOCUI.modoPara(papel, o), dica: ALOCUI.dicaModo(papel, o), semAntigo: true, reiniciar: !manter,
      ocupados: oc.pessoas, dia, valor: typeof valorDaOS === 'function' ? valorDaOS(o) : o.valorTotal, versoes: versoesRegrasCasa() });
    ALOCUI.montar(host, chave);
    pintarVeiculos(oc.veiculos);
  };
  const repintarOcupados = () => {
    if (!osDoComp) return;
    const oc = ocupadosAgora();
    if (componente && ALOCUI.definirOcupados(chave, oc.pessoas)) ALOCUI.repintar(chave);
    pintarVeiculos(oc.veiculos);
  };
  // O dia é o do formulário; o período, a hora e a duração repintam os ocupados.
  ['periodo', 'hora', 'dias'].forEach(n => { const x = campo(n); if (x && x.addEventListener) { x.addEventListener('change', repintarOcupados); if (n === 'dias') x.addEventListener('input', repintarOcupados); } });
  // Cada campo mexido fica guardado com a escolha (a repintura repõe).
  if (componente) CAMPOS_FORM.forEach(n => { const x = campo(n); if (x && x.addEventListener) { x.addEventListener('change', guardarForm); x.addEventListener('input', guardarForm); } });
  /* Ao escolher a O.S, os chips mostram a equipe que ela JÁ tem. Vinham sempre
     desmarcados: marcar um ajudante "somando" trocava a equipe inteira por ele. */
  if (selOS) selOS.addEventListener('change', () => {
    const o = STORE.getOS(selOS.value);
    if (componente) { montarComp(o); return; }
    const eq = new Set((o ? OPERACAO.equipe(o) : []).map(OPERACAO.chavePessoa));
    f.querySelectorAll('.casa-chip input[name="equipe"]').forEach(cb => {
      cb.checked = eq.has(OPERACAO.chavePessoa(cb.value));
      cb.closest('.casa-chip').classList.toggle('on', cb.checked);
    });
  });
  /* A escolha feita antes da repintura volta, com a montagem que estava: os
     campos primeiro, para os ocupados (pessoas e carro) serem os do período
     que voltou. */
  const esc0 = escolhas[id] && typeof escolhas[id] === 'object' ? escolhas[id] : null;
  if (componente && selOS && esc0 && esc0.os && [...(selOS.options || [])].some(op => op.value === esc0.os)) {
    CAMPOS_FORM.forEach(n => { const x = campo(n); if (x && typeof esc0[n] === 'string') x.value = esc0[n]; });
    selOS.value = esc0.os;
    montarComp(STORE.getOS(esc0.os), true);
  }
  // Fechar o formulário sem programar desiste: a escolha, a equipe montada e os campos voltam ao começo.
  const caixa = componente && typeof f.closest === 'function' ? f.closest('details') : null;
  if (caixa && typeof caixa.addEventListener === 'function') caixa.addEventListener('toggle', () => {
    if (caixa.open) return;
    if (typeof f.reset === 'function') f.reset();
    f.querySelectorAll('[name="osId"] option').forEach(op => { op.hidden = false; });
    montarComp(null);
  });
  const buscaOS=f.querySelector('[data-ag-busca]');
  if(buscaOS) buscaOS.oninput=()=>f.querySelectorAll('[name="osId"] option').forEach(o=>{o.hidden=!!o.value && !o.selected && !normCasa(o.textContent).includes(normCasa(buscaOS.value));});
  f.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(f);
    const os = STORE.getOS(String(fd.get('osId') || ''));
    if (!os) { toast('Escolha a O.S.', 'error'); return; }
    const periodo = String(fd.get('periodo') || 'Manhã');
    const hora = String(fd.get('hora') || '');
    if (periodo === 'Horário' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { toast('Período "Horário" pede a hora.', 'error'); return; }
    const equipe = componente ? [] : fd.getAll('equipe').map(String).filter(Boolean);
    // Mover O.S que já tinha dia desfaz a confirmação do cliente e a liberação
    // do carro. Isso acontecia calado; agora pergunta.
    const diaAntes = OPERACAO.diasAgenda(os)[0];
    if (diaAntes && diaAntes !== dia && !confirm(`A O.S ${os.numero || ''} está programada para ${diaAntes.slice(8, 10)}/${diaAntes.slice(5, 7)}${os.confirmacao === 'Confirmado' ? ' e confirmada com o cliente' : ''}. Mover para ${dia.slice(8, 10)}/${dia.slice(5, 7)}? A confirmação será desfeita.`)) return;
    // Nome da O.S que não tem chip aqui (fora da lista de escala) não pode ser
    // apagado por um formulário que nem o mostra.
    const comChip = new Set([...f.querySelectorAll('.casa-chip input[name="equipe"]')].map(cb => OPERACAO.chavePessoa(cb.value)));
    const semChip = OPERACAO.equipe(os).filter(n => !comChip.has(OPERACAO.chavePessoa(n)));
    const agendaAntes = OPERACAO.agendaCompleta(os);
    os.confirmacao = ''; os.confEm = ''; os.confPor = ''; os.confHora = ''; os.carroLiberado = false;
    // A remarcação pela Agenda entra no agendaLog como a da ficha: sem ela a
    // Linha do Tempo reescrevia o passado (o dia de antes aparecia vazio).
    if (typeof registrarRemarcacao === 'function') registrarRemarcacao(os, dia);
    os.instalacao = Object.assign({}, os.instalacao || {}, { data: dia, periodo, hora, duracaoDias: Math.max(1, Number(fd.get('dias')) || 1) });
    /* A EQUIPE PELO COMPONENTE (F10), no mesmo envio da O.S.: admin e pcp
       gravam a divisão (equipe escolhida, líder e papéis) quando mexeram nela;
       operação e montagem gravam só as pessoas, e a divisão fica para a
       gestão. O que não entra diz o motivo; nada sai calado. */
    const avisos = [];
    const st = componente && osDoComp && osDoComp.id === os.id ? ALOCUI.estado(chave) : null;
    if (st && st.tocado) {
      if (st.modo === 'divisao') {
        const r = ALOCUI.aplicarNaOS(chave, os, { soSeTocou: true });
        if (!r.ok && r.estado === 'conflito') avisos.push(r.mensagem);
        else if (!r.ok) { os.equipe = r.equipe || []; avisos.push('A equipe foi gravada, mas a divisão não: ' + r.mensagem + ' Complete na ficha da O.S., bloco Divisão da equipe.'); }
      } else {
        const r = ALOCUI.aplicarEquipeNaOS(chave, os);
        if (!r.ok) avisos.push(r.mensagem);
        else if (r.divisaoFica) avisos.push('A equipe mudou: a divisão desta O.S. (líder e percentuais) fica para a gestão refazer.');
      }
    } else if (!componente && equipe.length) os.equipe = [...equipe, ...semChip];
    const veiculo = String(fd.get('veiculo') || ''); if (veiculo) os.veiculo = veiculo;
    // Programou a data: o período "parado no cliente" termina aqui, guardado no log.
    if (os.paradoClienteEm) OPERACAO.fecharParadoPorAgenda(os, agendaAntes, new Date().toISOString(), (STATE.user && STATE.user.nome) || '');
    os.atualizadoEm = new Date().toISOString();
    os.atualizadoPor = (STATE.user && STATE.user.nome) || '';
    STORE.saveOS(os);
    const conf = OPERACAO.conflitos(STORE.getAllOS(), dia).filter(c => c.a.id === os.id || c.b.id === os.id);
    if (conf.length) toast(`Programada, mas com possível conflito: ${conf.map(c => [...c.equipe, c.veiculo].filter(Boolean).join(', ')).join(' · ')} já está em outra O.S neste turno.`, 'error');
    else toast(`O.S ${os.numero || ''} programada para ${dia.slice(8, 10)}/${dia.slice(5, 7)}.`, 'success');
    if (avisos.length) toast(avisos.join(' '), 'error');
    if (componente) { ALOCUI.esquecer(chave); escolhas[id] = ''; }
    if (aoGravar) aoGravar();
  };
}

/* ── Plantões ──────────────────────────────────────────────────────────────
   Escala de fim de semana e sobreaviso. Entra a EMPRESA TODA (não só a
   instalação), lida do RH — ordem do dono em 14/09/2026. O plantão pode
   carregar as O.S que serão atendidas naquele turno. */
function plantaoPerformanceHTML() {
  const mes = (lerBonusCasa().mes || OPERACAO.dia(new Date()).slice(0,7));
  const pl = lerAgendaCasa().plantoes.filter(p => !p.cancelado && p.data.startsWith(mes));
  const vinculados = pl.filter(p => plantaoComOS(p).length);
  return `<p>${pl.length} plantões registrados em ${esc(rotuloMesCasa(mes))}; ${vinculados.length} com vínculo a O.S. A participação no plantão não atribui pontos automaticamente.</p>
    ${vinculados.map(p => `<p><strong>${esc(OPERACAO.nomePessoa(p.quem))}</strong> · ${esc(p.data)} · ${esc(p.inicio)}–${esc(p.fim)}<br>${plantaoComOS(p).map(id => { const o = STORE.getAllOS().find(x => x.id === id); return o ? `O.S. ${esc(o.numero)}` : 'O.S. fora do recorte'; }).join(' · ')}</p>`).join('')}
    <p class="metricas-nota">Cadastre ou altere vínculos na aba Plantões. Hora extra, remuneração e registros do RH continuam separados desta apuração.</p>`;
}

function plantaoComOS(p) { return Array.isArray(p.osIds) ? p.osIds : []; }

/* O QUE NÃO VIRA <option> SOME NO SALVAR — E AQUI ISSO APAGAVA HISTÓRICO.
   O select só listava O.S abertas (e só as 300 primeiras), mas o submit
   regrava `osIds` inteiro com o que estiver marcado. Como a baixa automática
   do ERP fecha O.S sozinha de hora em hora, bastava reabrir o plantão na
   segunda para acertar o horário: a O.S que o plantão atendeu no sábado já
   estava finalizada, não aparecia na lista, e o vínculo era apagado calado —
   sem como refazer pela tela, já que finalizada nunca mais volta ao select.
   Arquivado é guardado: as já vinculadas entram SEMPRE, mesmo fechadas. */
/* AS O.S QUE ESTE PLANTÃO ATENDE.
 *
 * Era um <select multiple> com 300 linhas e a instrução "Segure Ctrl (ou ⌘)
 * para marcar mais de uma" — num tablet, onde não existe Ctrl e o gesto de
 * seleção múltipla nativa é quase impossível com o dedo. Marcar a segunda O.S
 * desmarcava a primeira, e ninguém entendia por quê.
 *
 * Agora é uma lista de toque, com busca. Cada linha é um checkbox de verdade
 * com `name="osIds"`, então o envio não mudou nada: `fd.getAll('osIds')`
 * continua recebendo a mesma coisa. A busca filtra escondendo linhas, sem
 * redesenhar nada — redesenhar apagaria o que já estava marcado e o que estava
 * sendo digitado.
 *
 * As JÁ LIGADAS vêm primeiro e não somem na busca: elas são o que a pessoa já
 * decidiu, e uma escolha que some do campo de visão vira escolha desfeita por
 * engano. Inclui as que o aparelho não conhece mais — o vínculo é preservado,
 * nunca descartado em silêncio. */
function buscaOSPlantao(o) { return `${o.numero || ''} ${o.cliente || ''}`.toLowerCase(); }
function itemOSPlantaoHTML(o, marcada, fechada) {
  const prazo = OPERACAO.prazo(o);
  const detalhe = fechada ? 'já finalizada' : (prazo ? 'prazo ' + prazo.slice(8, 10) + '/' + prazo.slice(5, 7) : 'sem prazo');
  return `<label class="os-pick-item${marcada ? ' on' : ''}" data-busca="${esc(buscaOSPlantao(o))}">
      <input type="checkbox" name="osIds" value="${esc(o.id)}" ${marcada ? 'checked' : ''}>
      <span class="os-pick-num">${esc(o.numero || '—')}</span>
      <span class="os-pick-cli">${esc((o.cliente || '').slice(0, 44))}</span>
      <span class="os-pick-det">${esc(detalhe)}</span>
    </label>`;
}
function opcoesOSPlantao(plantao, candidatas, porId) {
  const jaLigadas = plantaoComOS(plantao);
  const vistos = new Set();
  const TETO = 300;
  const item = (o, marcada, fechada) => { vistos.add(o.id); return itemOSPlantaoHTML(o, marcada, fechada); };
  const fixas = jaLigadas.map(id => porId.get(id)).filter(Boolean)
    .map(o => item(o, true, !!o.finalizadaEm)).join('');
  const orfas = jaLigadas.filter(id => !porId.has(id)).map(id =>
    `<label class="os-pick-item on" data-busca="${esc(String(id).toLowerCase())}">
      <input type="checkbox" name="osIds" value="${esc(id)}" checked>
      <span class="os-pick-num">—</span>
      <span class="os-pick-cli">O.S fora deste aparelho</span>
      <span class="os-pick-det">vínculo preservado</span>
    </label>`).join('');
  const restantes = candidatas.filter(o => !vistos.has(o.id));
  const resto = restantes.slice(0, TETO).map(o => item(o, false, false)).join('');
  const cortadas = Math.max(0, restantes.length - TETO);
  return `<div class="casa-os-pick">
    <input type="search" class="os-pick-busca" placeholder="Buscar por número ou cliente" aria-label="Buscar O.S">
    <div class="os-pick-lista">${fixas}${orfas}${resto}</div>
    <p class="text-muted os-pick-nota"><span class="os-pick-conta">${jaLigadas.length}</span> marcada${jaLigadas.length === 1 ? '' : 's'}${cortadas ? `<span class="os-pick-corte"> · as ${TETO} mais próximas do prazo (${cortadas} fora da lista; use a busca)</span>` : ''}</p>
    <p class="os-pick-vazio" hidden>Nenhuma O.S com esse número ou cliente nesta lista.</p>
  </div>`;
}
function renderPlantoesCasa() {
  const el = document.getElementById('panel-plantoes');
  if (!el) return;
  const a = lerAgendaCasa();
  const hoje = OPERACAO.dia(new Date());
  const todas = STORE.getAllOS();
  const porId = new Map(todas.map(o => [o.id, o]));
  if (!STATE._plVista) STATE._plVista = 'mes';
  if (!STATE._plMes) STATE._plMes = hoje.slice(0,7);
  const editando = STATE._plEdit ? a.plantoes.find(p => p.id === STATE._plEdit && !p.cancelado) : null;
  const vivos = a.plantoes.filter(p => !p.cancelado);
  const lista = vivos
    .filter(p => STATE._plVista === 'todos' || (STATE._plVista === 'mes' ? String(p.data).startsWith(STATE._plMes) : String(p.data) >= hoje))
    .sort((x, y) => String(x.data).localeCompare(String(y.data)) || String(x.inicio).localeCompare(String(y.inicio)));
  // Agrupado por mês: a escala se lê por bloco, não por linha solta.
  const porMes = new Map();
  for (const p of lista) {
    const k = String(p.data).slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(p);
  }
  const contagem = { diarista: 0, sobreaviso: 0, folga: 0 };
  for (const p of vivos.filter(p => String(p.data).slice(0, 7) === STATE._plMes)) if (contagem[p.tipo] != null) contagem[p.tipo]++;
  const doDia = vivos.filter(p => p.data === hoje);
  const candidatas = todas.filter(o => !o.finalizadaEm)
    .sort((x, y) => (OPERACAO.prazo(x) || '9999').localeCompare(OPERACAO.prazo(y) || '9999'));
  const f = editando || { tipo: 'diarista', inicio: '08:00', fim: '12:00', data: '', quem: '', titulo: '', obs: '', osIds: [] };

  const sabeSituacao = temFichaRH();
  const linhaPlantao = p => {
    const pes = fichaDoApelido(p.quem);
    // Sem a ficha do RH (crachá sem senha) a situação não foi conferida — a
    // linha não pode sair limpa como se a pessoa estivesse disponível.
    const aus = (pes && sabeSituacao) ? ausenciaRH(pes, p.data) : null;
    const oss = plantaoComOS(p).map(id => porId.get(id)).filter(Boolean);
    return `<tr class="${p.data < hoje ? 'passado' : ''}">
      <td><strong>${esc(p.data.slice(8, 10) + '/' + p.data.slice(5, 7))}</strong><small class="bloco">${esc(DIAS_SEMANA ? DIAS_SEMANA[new Date(p.data + 'T12:00:00').getDay()] : '')}</small></td>
      <td>${pillPlantao(p)}</td>
      <td><span class="casa-quem">${avatarRH(pes || { nome: p.quem }, 'mini')}<span>${esc(pes ? pes.nome : p.quem)}${aus ? `<small class="alerta-txt">${esc(aus.motivo)}</small>` : (pes && pes.cargo ? `<small>${esc(pes.cargo)}</small>` : '')}</span></span></td>
      <td class="num">${esc(p.inicio)}–${esc(p.fim)}</td>
      <td>${esc(p.titulo)}${p.obs ? ` <small class="text-muted">— ${esc(p.obs)}</small>` : ''}
        ${oss.length ? `<div class="casa-chips" style="margin-top:4px">${oss.map(o => `<span class="casa-pill os" data-abrir-os="${esc(o.id)}" title="${esc(o.cliente || '')}">O.S ${esc(o.numero || '—')}</span>`).join('')}</div>` : ''}</td>
      <td class="casa-rank-acao"><button class="btn-ghost btn-xs edit-only" data-edit-pl="${esc(p.id)}">Editar</button><button class="btn-ghost btn-xs edit-only" data-del-pl="${esc(p.id)}">Apagar</button></td>
    </tr>`;
  };

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Plantões</h2><p>Escala da casa: diarista, sobreaviso e folga. Entra a empresa toda — a lista de gente vem do RH. Vínculos com O.S. aparecem na Performance; horas extras e pagamento são conferidos separadamente.</p></div>
        <span class="casa-vista">
          <button class="btn-ghost btn-sm ${STATE._plVista === 'mes' ? 'active' : ''}" data-pl-vista="mes">Mês escolhido</button>
          <button class="btn-ghost btn-sm ${STATE._plVista === 'proximos' ? 'active' : ''}" data-pl-vista="proximos">De hoje em diante</button>
          <button class="btn-ghost btn-sm ${STATE._plVista === 'todos' ? 'active' : ''}" data-pl-vista="todos">Tudo</button>
        </span>
      </div>
      <div class="casa-kpi-cards">
        <div class="casa-kpi"><b>${doDia.length}</b><small>plantão hoje${doDia.length ? ' · ' + esc(doDia.map(p => OPERACAO.nomePessoa(p.quem)).join(', ') ) : ''}</small></div>
        <div class="casa-kpi"><b>${contagem.diarista}</b><small>diaristas no mês</small></div>
        <div class="casa-kpi"><b>${contagem.sobreaviso}</b><small>sobreavisos no mês</small></div>
        <div class="casa-kpi"><b>${contagem.folga}</b><small>folgas no mês</small></div>
      </div>
      <div class="perf-toolbar"><label>Mês da escala <input id="pl-mes" type="month" value="${esc(STATE._plMes)}"></label><span>Indicadores mensais: ${esc(rotuloMesCasa(STATE._plMes))}</span><button class="btn-ghost" id="pl-pdf">📄 PDF da escala exibida</button></div>
      ${quadroCasa('pl-form', editando ? '✏️ Editando plantão' : '➕ Registrar plantão', `
        <form id="pl-form" class="casa-form-grade">
          <input type="hidden" name="id" value="${esc(editando ? editando.id : '')}">
          <label>Data <input name="data" type="date" required value="${esc(f.data)}"></label>
          <div class="larga campo-grupo"><span>Tipo</span>
            <span class="casa-radio-chips">${Object.entries(TIPOS_PLANTAO).map(([k, v]) =>
              `<label class="casa-radio-chip ${f.tipo === k ? 'on' : ''}"><input type="radio" name="tipo" value="${k}" ${f.tipo === k ? 'checked' : ''}><span class="casa-pill ${k}">${esc(v)}</span></label>`
            ).join('')}</span></div>
          <label>Quem <select name="quem" required><option value="">Escolher</option>${optionsEquipeCasa(f.quem)}</select></label>
          <label>Início <input name="inicio" type="time" value="${esc(f.inicio)}" required></label>
          <label>Fim <input name="fim" type="time" value="${esc(f.fim)}" required></label>
          <label class="larga">Título <input name="titulo" required placeholder="Plantão de sábado" value="${esc(f.titulo)}"></label>
          <label class="larga">Observação <input name="obs" placeholder="opcional" value="${esc(f.obs)}"></label>
          <div class="larga campo-grupo"><span>O.S deste plantão</span>
            ${opcoesOSPlantao(f, candidatas, porId)}
            <small class="text-muted">Toque para marcar. Vincular aqui não programa a O.S. Só anota o que este plantão atende.</small></div>
          <div class="larga casa-dia-acoes">
            <button class="btn-primary btn-sm" type="submit">${editando ? 'Salvar alterações' : 'Registrar plantão'}</button>
            ${editando ? '<button class="btn-ghost btn-sm" type="button" id="pl-cancelar">Cancelar</button>' : ''}
          </div>
        </form>`, false, !!editando)}
      ${lista.length ? [...porMes.entries()].map(([k, ps]) => `
        <h3 class="casa-mes-titulo">${esc(rotuloMesCasa(k))} <small>${ps.length} plantão${ps.length === 1 ? '' : 'es'}</small></h3>
        <div class="casa-tabela-wrap"><table class="casa-tabela">
          <thead><tr><th>Dia</th><th>Tipo</th><th>Quem</th><th>Horário</th><th>Título / O.S</th><th></th></tr></thead>
          <tbody>${ps.map(linhaPlantao).join('')}</tbody>
        </table></div>`).join('')
        : emptyState('⏰',
            STATE._plVista === 'proximos' ? 'Nenhum plantão daqui para a frente' : STATE._plVista === 'mes' ? 'Nenhum plantão no mês escolhido' : 'Nenhum plantão registrado',
            /* O VAZIO CONTA O QUE EXISTE FORA DO FILTRO. "Nada aqui" quando há
               40 plantões no passado é a tela escondendo o próprio recorte. */
            (STATE._plVista === 'proximos' && vivos.length)
              ? `Há ${vivos.length} plantã${vivos.length === 1 ? 'o registrado' : 'os registrados'} antes de hoje. <button class="btn-ghost btn-sm" data-pl-vista="todos">Ver todos</button>`
              : 'A escala é registrada aqui mesmo, no formulário acima — o RH não manda plantão para o PCP.')}
    </div>`;
  wireQuadrosCasa(el);
  el.querySelectorAll('[data-pl-vista]').forEach(b => b.onclick = () => { STATE._plVista = b.dataset.plVista; renderPlantoesCasa(); });
  const mesFiltro=el.querySelector('#pl-mes');
  if(mesFiltro)mesFiltro.onchange=()=>{if(mesFiltro.value){STATE._plMes=mesFiltro.value;STATE._plVista='mes';renderPlantoesCasa();}};
  const plPdf=el.querySelector('#pl-pdf');
  if(plPdf)plPdf.onclick=()=>{const copy=document.createElement('section');copy.innerHTML='<p>Escala exibida: '+esc(STATE._plVista === 'mes' ? rotuloMesCasa(STATE._plMes) : STATE._plVista === 'todos' ? 'Todos os registros disponíveis' : 'De hoje em diante')+'</p>'+([...porMes.entries()].map(([k,ps])=>'<h3>'+esc(rotuloMesCasa(k))+'</h3><table class="casa-tabela"><thead><tr><th>Dia</th><th>Tipo</th><th>Pessoa</th><th>Horário</th><th>Título / O.S.</th><th></th></tr></thead><tbody>'+ps.map(linhaPlantao).join('')+'</tbody></table>').join('') || '<p>Nenhum plantão no filtro.</p>');imprimirAnalisePCP('Escala de plantões',copy,{de:lista[0]?.data,ate:lista.at(-1)?.data});};
  const form = document.getElementById('pl-form');
  if (form) form.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const id = String(fd.get('id') || '');
    const p = {
      id: id || STORE.uuid(),
      titulo: String(fd.get('titulo') || '').trim(),
      data: String(fd.get('data') || ''),
      quem: String(fd.get('quem') || '').trim(),
      inicio: String(fd.get('inicio') || ''),
      fim: String(fd.get('fim') || ''),
      tipo: TIPOS_PLANTAO[String(fd.get('tipo') || '')] ? String(fd.get('tipo')) : 'diarista',
      obs: String(fd.get('obs') || '').trim(),
      osIds: fd.getAll('osIds').map(String).filter(Boolean),
      cancelado: false,
    };
    if (!p.titulo || !p.data || !p.quem) { toast('Data, quem e título são obrigatórios.', 'error'); return; }
    if(p.fim<=p.inicio){toast('O fim precisa ser depois do início. Para virar o dia, registre uma escala em cada data.','error');return;}
    const pes = fichaDoApelido(p.quem);
    const aus = (pes && temFichaRH()) ? ausenciaRH(pes, p.data) : null;
    if (aus && !confirm(`${pes.nome} está marcado como "${aus.motivo}" neste dia no RH.\n\nRegistrar o plantão mesmo assim?`)) return;
    const ag = lerAgendaCasa();
    ag.plantoes = id ? ag.plantoes.map(x => x.id === id ? p : x) : [p, ...ag.plantoes];
    gravarAgendaCasa(ag);
    STATE._plEdit = '';
    renderPlantoesCasa();
    toast(id ? 'Plantão atualizado.' : 'Plantão registrado na produção.', 'success');
  };
  const cancelar = document.getElementById('pl-cancelar');
  if (cancelar) cancelar.onclick = () => { STATE._plEdit = ''; renderPlantoesCasa(); };
  /* A BUSCA DO SELETOR DE O.S FILTRA, NÃO REDESENHA.
     Redesenhar apagaria o que já estava marcado e o que estava sendo digitado
     nos outros campos do formulário — o defeito clássico deste app. Aqui só
     escondemos linhas. As já marcadas NUNCA são escondidas: uma escolha que
     some do campo de visão vira escolha desfeita por engano. */
  el.querySelectorAll('.casa-os-pick').forEach(box => {
    const busca = box.querySelector('.os-pick-busca');
    const itens = [...box.querySelectorAll('.os-pick-item')];
    const conta = box.querySelector('.os-pick-conta');
    const atualizarConta = () => {
      if (!conta) return;
      const n = itens.filter(i => i.querySelector('input').checked).length;
      conta.textContent = String(n);
      const nota = conta.parentElement;
      if (nota) nota.firstChild.nextSibling.textContent = n === 1 ? ' marcada' : ' marcadas';
    };
    const ligarItem = i => {
      i.querySelector('input').onchange = e => {
        i.classList.toggle('on', e.target.checked);
        atualizarConta();
      };
    };
    if (busca) {
      const vazio = box.querySelector('.os-pick-vazio');
      const listaEl = box.querySelector('.os-pick-lista');
      const noDom = new Set(itens.map(i => i.querySelector('input').value));
      busca.oninput = () => {
        const q = busca.value.trim().toLowerCase();
        /* ACIMA DO TETO a O.S não estava no DOM, e a busca só procurava entre as
           desenhadas: o aviso mandava buscar e a busca dizia "nenhuma". Agora a
           busca percorre todas as candidatas e desenha as que casam. */
        if (q && listaEl) {
          for (const o of candidatas) {
            if (noDom.has(o.id) || !buscaOSPlantao(o).includes(q)) continue;
            listaEl.insertAdjacentHTML('beforeend', itemOSPlantaoHTML(o, false, false));
            const novo = listaEl.lastElementChild;
            noDom.add(o.id); itens.push(novo); ligarItem(novo);
          }
        }
        let visiveis = 0;
        for (const i of itens) {
          const marcada = i.querySelector('input').checked;
          i.hidden = !!q && !marcada && !(i.dataset.busca || '').includes(q);
          if (!i.hidden) visiveis++;
        }
        /* Busca que não acha nada precisa DIZER isso: lista vazia sem recado
           parece tela quebrada, e a pessoa fica digitando achando que travou. */
        if (vazio) vazio.hidden = visiveis > 0;
      };
    }
    for (const i of itens) ligarItem(i);
  });
  /* Os chips de tipo são radios de verdade: o FormData não mudou. */
  el.querySelectorAll('.casa-radio-chip input').forEach(r => {
    r.onchange = () => {
      el.querySelectorAll('.casa-radio-chip').forEach(c => c.classList.toggle('on', c.contains(r) && r.checked));
    };
  });
  el.querySelectorAll('[data-edit-pl]').forEach(btn => {
    btn.onclick = () => {
      STATE._plEdit = btn.dataset.editPl;
      renderPlantoesCasa();
      // Parar NO formulário, não no topo da página: rolar para o cabeçalho
      // deixava a pessoa procurando onde foi parar o que ela mandou editar.
      const alvo = document.querySelector('#panel-plantoes [data-quadro="pl-form"]');
      if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });
  el.querySelectorAll('[data-del-pl]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Apagar este plantão da escala?')) return;
      const ag = lerAgendaCasa();
      ag.plantoes = ag.plantoes.map(p => p.id === btn.dataset.delPl ? { ...p, cancelado: true } : p);
      gravarAgendaCasa(ag);
      if (STATE._plEdit === btn.dataset.delPl) STATE._plEdit = '';
      renderPlantoesCasa();
    };
  });
  el.querySelectorAll('[data-abrir-os]').forEach(b => b.onclick = () => {
    const os = STORE.getOS(b.dataset.abrirOs);
    if (os && typeof openModal === 'function') openModal(os);
  });
}

/* ── Programação do dia ────────────────────────────────────────────────────
   Um dia por vez (é assim que a produção trabalha), com o mês inteiro a um
   clique. Daqui saem a mensagem do WhatsApp e o PDF — o que o dono chamou de
   "o mais importante". */
function renderGradeCasa() {
  const el = document.getElementById('panel-grade');
  if (!el) return;
  const hoje = OPERACAO.dia(new Date());
  if (!STATE._grDia) STATE._grDia = hoje;
  if (!STATE._grVista) STATE._grVista = 'dia';
  const dia = STATE._grDia;
  const todas = STORE.getAllOS();
  const doDia = d => todas.filter(o => !OPERACAO.encerradaERP(o) && (STATE._agendaConcluidas || !o.finalizadaEm) && diasCasa(o).includes(d))
    .sort((a, b) => (typeof ordemHora === 'function' ? ordemHora(a).localeCompare(ordemHora(b)) : 0) || String(a.numero).localeCompare(String(b.numero)));
  const lista = doDia(dia);
  const d = new Date(dia + 'T12:00:00');
  const dataBR = `${(typeof DIAS_SEMANA !== 'undefined' ? DIAS_SEMANA[d.getDay()] : '')} ${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
  const agenda = lerAgendaCasa();
  const plDia = agenda.plantoes.filter(p => p.data === dia && !p.cancelado);
  const conflitos = OPERACAO.conflitos(todas, dia);
  const candidatas = todas.filter(o => !o.finalizadaEm && !OPERACAO.interno(o) && !diasCasa(o).includes(dia))
    .sort((a, b) => (OPERACAO.prazo(a) || '9999').localeCompare(OPERACAO.prazo(b) || '9999') || String(b.numero).localeCompare(String(a.numero)));
  const escalados = umaPorPessoa(lista.flatMap(o => OPERACAO.equipe(o)));
  const valorDia = somaValores(lista);

  const linha = os => {
    const st = OPERACAO.status(os);
    const veic = typeof rotuloVeiculoMsg === 'function' ? rotuloVeiculoMsg(os.veiculo) : { emoji: '🚗', texto: os.veiculo || '' };
    return `<tr data-os-id="${esc(os.id)}" class="${os.retrabalho ? 'st-retrabalho' : ''}">
      <td class="num"><strong>${esc(typeof rotuloHora === 'function' ? rotuloHora(os) : '')}</strong></td>
      <td><strong>${esc(os.numero || '—')}</strong><small class="bloco">${esc(os.servico || '')}</small></td>
      <td>${esc(os.cliente || '')}<small class="bloco">${esc(os.endereco || '')}</small></td>
      <td>${esc(OPERACAO.equipeTexto(os, ', ') || '—')}</td>
      <td>${os.veiculo ? `${veic.emoji} ${esc(os.veiculo)}` : '<span class="badge sem-valor">sem veículo</span>'}</td>
      <td><span class="badge st-${st}">${esc(typeof statusLabelDe === 'function' ? statusLabelDe(os, st) : st)}</span></td>
    </tr>`;
  };

  // Vista do mês: cada dia do mês com as suas O.S, um bloco por dia.
  const mes = dia.slice(0, 7);
  const [my, mm] = mes.split('-').map(Number);
  const diasDoMes = Array.from({ length: new Date(my, mm, 0).getDate() }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
  const mesHTML = diasDoMes.map(k => {
    const l = doDia(k);
    if (!l.length) return '';
    const dd = new Date(k + 'T12:00:00');
    return `<div class="casa-dia-bloco">
      <h4><button type="button" class="inline-link" data-ir-dia="${k}">${esc((typeof DIAS_SEMANA !== 'undefined' ? DIAS_SEMANA[dd.getDay()] : '') + ' ' + k.slice(8, 10) + '/' + k.slice(5, 7))}</button> <small>${l.length} O.S · ${dinheiroCasa(somaValores(l).total)}</small></h4>
      <div class="casa-tabela-wrap"><table class="casa-tabela"><tbody>${l.map(linha).join('')}</tbody></table></div>
    </div>`;
  }).filter(Boolean).join('');

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Programação de serviços</h2><p>O que sai para a rua. A programação mora na O.S — mudou aqui, mudou em todo lugar.</p></div>
        <span class="casa-vista">
          <button class="btn-ghost btn-sm ${STATE._grVista === 'dia' ? 'active' : ''}" data-gr-vista="dia">Um dia</button>
          <button class="btn-ghost btn-sm ${STATE._grVista === 'mes' ? 'active' : ''}" data-gr-vista="mes">Mês inteiro</button>
        </span>
      </div>
      <label class="agenda-recorte"><input type="checkbox" id="gr-concluidas" ${STATE._agendaConcluidas ? 'checked' : ''}> Incluir concluídas pela equipe</label>
      <p class="metricas-nota">${STATE._agendaConcluidas ? 'Histórico incluído na tela. WhatsApp e PDF de saída: somente abertas.' : 'O.S. abertas programadas. Retiradas na loja ficam identificadas; o PDF de saída reúne instalações externas.'}</p>
      <div class="casa-dia-nav">
        <button class="btn-ghost btn-sm" id="gr-ant" title="Dia anterior">‹</button>
        <input type="date" aria-label="Data da programação" id="gr-data" value="${esc(dia)}">
        <button class="btn-ghost btn-sm" id="gr-prox" title="Próximo dia">›</button>
        <button class="btn-ghost btn-sm ${dia === hoje ? 'active' : ''}" id="gr-hoje">Hoje</button>
        <strong class="casa-dia-rot">${esc(dataBR)}${dia === hoje ? ' · hoje' : ''}</strong>
        <span class="casa-dia-acoes">
          <button class="btn-success btn-sm" id="gr-wpp" ${lista.length ? '' : 'disabled'} title="Mensagem da programação no formato da casa">💬 WhatsApp${STATE._grVista === 'mes' ? ' de ' + esc(dia.slice(8, 10) + '/' + dia.slice(5, 7)) : ''}</button>
          <button class="btn-ghost btn-sm" id="gr-pdf" ${lista.length ? '' : 'disabled'} title="Salvar ou imprimir o PDF do dia escolhido">🖨 PDF${STATE._grVista === 'mes' ? ' de ' + esc(dia.slice(8, 10) + '/' + dia.slice(5, 7)) : ''}</button>
        </span>
      </div>
      ${STATE._grVista === 'mes' ? '<p class="metricas-nota">A tela mostra o mês; o WhatsApp e o PDF saem sempre do <strong>dia escolhido acima</strong> — a programação é mandada dia a dia. Clique num dia da lista para trocá-lo.</p>' : ''}
      ${STATE._grVista === 'dia' ? `
        <div class="casa-kpi-cards">
          <div class="casa-kpi"><b>${lista.length}</b><small>O.S neste dia</small></div>
          <div class="casa-kpi"><b>${escalados.length}</b><small>pessoas escaladas</small></div>
          <div class="casa-kpi"><b>${new Set(lista.filter(o => !OPERACAO.semCarro(o)).map(o => o.veiculo).filter(Boolean)).size}</b><small>veículos programados</small></div>
          <div class="casa-kpi ${valorDia.semValor ? 'alerta' : ''}"><b>${dinheiroCasa(valorDia.total)}</b><small>valor programado${valorDia.semValor ? ` · ${valorDia.semValor} sem valor` : ''}</small></div>
        </div>
        ${conflitos.length ? `<p class="metricas-nota alerta-ausencia">⚠️ ${conflitos.length} possível conflito: ${esc(conflitos.map(c => [...c.equipe, c.veiculo].filter(Boolean).join(', ')).join(' · '))} em mais de uma O.S no mesmo turno.</p>` : ''}
        ${avisoAusenciaCasa(escalados, dia)}
        ${plDia.length ? `<p class="metricas-nota">Plantão hoje: ${plDia.map(p => `${pillPlantao(p)} ${esc(OPERACAO.nomePessoa(p.quem))} (${esc(p.inicio)}–${esc(p.fim)})`).join(' · ')}</p>` : ''}
        ${lista.length
          ? `<div class="casa-tabela-wrap"><table class="casa-tabela">
              <thead><tr><th>Hora</th><th>O.S</th><th>Cliente</th><th>Equipe</th><th>Veículo</th><th>Status</th></tr></thead>
              <tbody>${lista.map(linha).join('')}</tbody></table></div>`
          : emptyState('', 'Nada programado neste dia', 'Use "+ Programar O.S neste dia" abaixo, ou o Calendário.')}
        <details class="casa-add-os edit-only" ${STATE._grAddAberto ? 'open' : ''}>
          <summary>+ Programar O.S neste dia</summary>
          ${formAddOSHTML('gr-add', dia, candidatas)}
        </details>`
      : (mesHTML ? `<p class="metricas-nota">${esc(rotuloMesCasa(mes))} — clique no dia para abrir a programação dele.</p>${mesHTML}`
                 : emptyState('', 'Nada programado neste mês', 'Programe pelo Calendário ou pela vista de um dia.'))}
    </div>`;
  const concluidas = document.getElementById('gr-concluidas'); if (concluidas) concluidas.onchange = () => { STATE._agendaConcluidas = concluidas.checked; renderGradeCasa(); };
  const mover = n => { STATE._grDia = OPERACAO.somarDias(dia, n); renderGradeCasa(); };
  const bAnt = document.getElementById('gr-ant'); if (bAnt) bAnt.onclick = () => mover(-1);
  const bProx = document.getElementById('gr-prox'); if (bProx) bProx.onclick = () => mover(1);
  const bHoje = document.getElementById('gr-hoje'); if (bHoje) bHoje.onclick = () => { STATE._grDia = hoje; renderGradeCasa(); };
  const dData = document.getElementById('gr-data'); if (dData) dData.onchange = () => { if (dData.value) { STATE._grDia = dData.value; renderGradeCasa(); } };
  el.querySelectorAll('[data-gr-vista]').forEach(b => b.onclick = () => { STATE._grVista = b.dataset.grVista; renderGradeCasa(); });
  el.querySelectorAll('[data-ir-dia]').forEach(b => b.onclick = () => { STATE._grDia = b.dataset.irDia; STATE._grVista = 'dia'; renderGradeCasa(); });
  const wpp = document.getElementById('gr-wpp'); if (wpp) wpp.onclick = () => { if (typeof whatsappServicosDia === 'function') whatsappServicosDia(dia); };
  const pdf = document.getElementById('gr-pdf'); if (pdf) pdf.onclick = () => { if (typeof relatorioServicosDia === 'function') relatorioServicosDia(dia); };
  const add = el.querySelector('.casa-add-os'); if (add) add.ontoggle = () => { STATE._grAddAberto = add.open; };
  wireAddOSCasa(el, 'gr-add', dia, () => { STATE._grAddAberto = false; renderGradeCasa(); });
  bindCardClicks(el);
}

/* ── Botão Equipe: quem está na empresa hoje ───────────────────────────────
   Pedido do dono (14/09/2026): "botão equipe em cima que clica e sabe quem
   está presente e quem é inativado da empresa sai da lista". Presença vem do
   RH: férias, ausência do dia e situação da ficha. Quem foi desligado já não
   chega aqui; quem está inativo aparece só no rodapé, fora da conta. */
function abrirEquipeCasa() {
  const hoje = OPERACAO.dia(new Date());
  const { presentes, ausentes, fora, sabeSituacao } = presencaRH(hoje);
  const escalados = new Map();
  for (const os of STORE.getAllOS()) {
    // Quem já finalizou a O.S voltou; retirada é no balcão. Os dois apareciam
    // "na rua" justo quando o gestor procurava quem pode atender uma urgência.
    if (!diasCasa(os).includes(hoje) || OPERACAO.encerradaERP(os) || os.finalizadaEm || OPERACAO.interno(os)) continue;
    for (const ap of OPERACAO.equipe(os)) {
      const p = fichaDoApelido(ap);
      const k = (p && p.chave) || ap;
      if (!escalados.has(k)) escalados.set(k, []);
      escalados.get(k).push(os);
    }
  }
  const cartao = (p, extra, classe) => {
    const oss = escalados.get(p.chave) || [];
    return `<li class="eq-item ${classe || ''}">
      ${avatarRH(p, 'mini')}
      <span class="eq-txt">
        <strong>${esc(p.nome)}</strong>
        <small>${esc([p.cargo, p.area].filter(Boolean).join(' · ') || p.setor || '—')}</small>
        ${extra ? `<small class="alerta-txt">${esc(extra)}</small>` : ''}
        ${oss.length ? `<small class="eq-os">${oss.some(o => OPERACAO.naRua(o, hoje)) ? '🚚 na rua' : '📋 escalado hoje'}: ${oss.map(o => 'O.S ' + esc(o.numero || '—')).join(', ')}</small>` : ''}
      </span>
    </li>`;
  };
  const porArea = lista => {
    const m = new Map();
    for (const p of lista) {
      const k = p.area || p.setor || 'Sem área';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  // Na rua é saída registrada sem retorno (OPERACAO.naRua), não só estar escalado.
  const naRua = presentes.filter(p => (escalados.get(p.chave) || []).some(o => OPERACAO.naRua(o, hoje))).length;
  const old = document.getElementById('eq-box'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'eq-box';
  box.className = 'wpp-picker-overlay';
  box.innerHTML = `
    <div class="wpp-picker wpp-picker-larga" role="dialog" aria-modal="true">
      <div class="wpp-picker-head"><strong>👥 Equipe hoje · ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}</strong><button class="modal-close" id="eq-x">×</button></div>
      <div class="wpp-picker-body">
        <div class="casa-kpi-cards">
          <div class="casa-kpi"><b>${presentes.length}</b><small>${sabeSituacao ? 'na empresa' : 'na lista do RH'}</small></div>
          <div class="casa-kpi"><b>${naRua}</b><small>na rua agora</small></div>
          <div class="casa-kpi ${sabeSituacao && ausentes.length ? 'alerta' : ''}"><b>${sabeSituacao ? ausentes.length : '—'}</b><small>${sabeSituacao ? 'fora hoje' : 'não conferido'}</small></div>
        </div>
        ${sabeSituacao
          ? (ausentes.length ? `<h4 class="eq-titulo">Fora hoje</h4><ul class="eq-lista">${ausentes.map(a => cartao(a.p, `${a.motivo}${a.ate && a.tipo === 'ferias' ? ' até ' + a.ate.slice(8, 10) + '/' + a.ate.slice(5, 7) : ''}`, 'fora')).join('')}</ul>` : '')
          : '<p class="metricas-nota">Quem está de férias, de atestado ou em aviso prévio <strong>não foi conferido</strong>: essa parte é ficha do RH e só abre com crachá da gestão. A lista abaixo é quem está na empresa, não quem está na fábrica hoje.</p>'}
        ${porArea(presentes).map(([area, ps]) => `<h4 class="eq-titulo">${esc(area)} <small>${ps.length}</small></h4><ul class="eq-lista">${ps.map(p => cartao(p)).join('')}</ul>`).join('')}
        ${presentes.length || ausentes.length ? '' : '<p class="text-muted">O elenco do RH ainda não chegou neste aparelho. Entre com um crachá da gestão e recarregue.</p>'}
        <p class="text-muted" style="font-size:.75rem;margin-top:10px">Fonte: fichas do RH${fora.length ? ` · ${fora.length} pessoa(s) inativa(s) fora desta lista` : ''}${elencoRH().em ? ` · atualizado ${new Date(elencoRH().em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}. Desligados não aparecem.</p>
      </div>
    </div>`;
  document.body.appendChild(box);
  const fechar = () => box.remove();
  document.getElementById('eq-x').onclick = fechar;
  box.onclick = e => { if (e.target === box) fechar(); };
  if (typeof STORE.pullElenco === 'function') STORE.pullElenco();
}
