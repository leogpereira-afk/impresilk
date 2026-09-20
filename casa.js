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

function osNoMesCasa(mes) {
  return STORE.getAllOS().filter(o => !OPERACAO.encerradaERP(o) && diasCasa(o).some(d => d.startsWith(mes)));
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
    // Sem apelido não há o que ligar; sem NENHUM identificador da pessoa
    // (nem chave do RH, nem id de 6 dígitos) o vínculo não aponta para lugar
    // nenhum. Qualquer um dos dois basta.
    if (!apelido || (!chave && !id)) continue;
    const k = normCasa(apelido);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ id, chave, nome: String(v.nome || '').trim(), apelido });
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
}

function fichaPorId(id) {
  const chave = idPessoaCasa(id);
  if (!chave) return null;
  return lerVinculosCasa().find(v => v.id === chave) || null;
}

function fichaPorApelido(apelido) {
  const a = String(apelido || '').trim();
  if (!a) return null;
  const hits = lerVinculosCasa().filter(v => normCasa(v.apelido) === normCasa(a));
  return hits.length === 1 ? hits[0] : null;
}

function rotuloPessoaCasa(id) {
  const f = fichaPorId(id);
  if (f) return `${f.nome || f.apelido || 'Sem nome'} · ID ${f.id}`;
  const chave = idPessoaCasa(id);
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
  return f ? [f.id] : [];
}

function rankingFinalizadas(mes, pontos) {
  const map = new Map();
  for (const os of osFinalizadasMes(mes)) {
    const ids = instaladoresDaOs(os, pontos);
    for (const id of ids) {
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
// > valorTotal que a importação gravou > soma dos itens. null = sem valor,
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
  if (origemAtualizada && Number.isFinite(numBR(os.valorTotal))) return numBR(os.valorTotal);
  const doPainel = num && STORE.valores ? STORE.valores()[num] : undefined;
  if (Number.isFinite(doPainel)) return doPainel;
  const vt = numBR(os && os.valorTotal);
  if (Number.isFinite(vt) && vt >= 0) return vt;
  let soma = 0, tem = false;
  for (const it of (Array.isArray(os && os.itens) ? os.itens : [])) {
    const n = numBR(it && it.subtotal);
    if (Number.isFinite(n) && n > 0) { soma += n; tem = true; }
  }
  return tem ? soma : null;
}
function somaValores(lista) {
  let total = 0, semValor = 0;
  for (const os of lista) { const v = valorDaOS(os); if (v == null) semValor++; else total += v; }
  return { total, semValor };
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
const CORTE_LANCAMENTO_MANUAL = '2026-09-15';
function erpAntesDoCorte(o) {
  return OPERACAO.encerradaERP(o) && !o.entregaLancada && OPERACAO.dia(o.finalizadaEm) < CORTE_LANCAMENTO_MANUAL;
}
function classificarEntregas(lista) {
  const r = { retiradas: [], instalacoes: [], aLancar: [] };
  for (const o of lista || STORE.getAllOS()) {
    if (!OPERACAO.dia(o.finalizadaEm)) continue;
    if (OPERACAO.interno(o)) { r.retiradas.push(o); continue; }
    if (OPERACAO.encerradaERP(o) && !o.entregaLancada && !erpAntesDoCorte(o)) { r.aLancar.push(o); continue; }
    r.instalacoes.push(o);
  }
  return r;
}
// Data que vale para o mês: a do lançamento manual, se houver; senão a finalização.
function diaEntrega(o) {
  return (o.entregaLancada && OPERACAO.dia(o.entregaLancada.data)) || OPERACAO.dia(o.finalizadaEm);
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
    if (p.ativo === false) { fora.push(p); continue; }
    const a = sabeSituacao ? ausenciaRH(p, dia) : null;
    if (a) ausentes.push({ p, ...a }); else presentes.push(p);
  }
  const porNome = (a, b) => String(a.nome || a.p.nome).localeCompare(String(b.nome || b.p.nome));
  return { presentes: presentes.sort(porNome), ausentes: ausentes.sort(porNome), fora, sabeSituacao };
}

// Apelido escrito na O.S → ficha do RH (vínculo salvo, senão casamento automático).
function fichaDoApelido(apelido) {
  const a = String(apelido || '').trim();
  if (!a) return null;
  const salvo = lerVinculosCasa().find(v => normCasa(v.apelido) === normCasa(a));
  if (salvo) {
    const p = pessoaRHPorChave(salvo.chave) || pessoaRHPorId6(salvo.id);
    if (p) return p;
    return { chave: salvo.chave || '', id: salvo.id, nome: salvo.nome || a, apelido: a, foto: '', cargo: '', area: '', ativo: true, manual: true };
  }
  return (typeof pessoaDoElenco === 'function' ? pessoaDoElenco(a) : null);
}
function normCasa(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

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
// Substitui o vínculo DESTE apelido. Outros apelidos da mesma pessoa ficam:
// o ERP escreve o nome de jeitos diferentes e todos têm de achar a ficha.
// Só devolve true depois de conferir que o vínculo sobreviveu à releitura —
// antes a função respondia true sempre e o toast verde mentia.
function ligarApelidoRH(apelido, chave) {
  const p = pessoaRHPorChave(chave);
  const ap = String(apelido || '').trim();
  if (!p || !ap) return false;
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
  const eq = new Set(OPERACAO.equipe(os));
  box.innerHTML = `
    <div class="wpp-picker retrab-box" role="dialog" aria-modal="true">
      <div class="wpp-picker-head"><strong>📦 Lançar entrega · O.S ${esc(os.numero || '—')}</strong><button class="modal-close" id="lancar-x">×</button></div>
      <div class="wpp-picker-body">
        <p class="text-muted" style="font-size:.8rem;margin-bottom:8px">${esc(os.cliente || '')} · ${esc(os.servico || '')}. O ERP baixou em ${esc(OPERACAO.dia(os.finalizadaEm) ? OPERACAO.dia(os.finalizadaEm).slice(8, 10) + '/' + OPERACAO.dia(os.finalizadaEm).slice(5, 7) : '—')}.</p>
        <form id="lancar-form" class="retrab-form">
          <div class="field"><label>Data da entrega <span class="req">*</span></label><input name="data" type="date" required value="${esc(OPERACAO.dia(os.finalizadaEm) || hojeISO())}"></div>
          <div class="field"><label>Equipe que instalou</label><div class="casa-chips">${(cfg.instaladores || []).map(n => `<label class="casa-chip ${eq.has(n) ? 'on' : ''}"><input type="checkbox" name="equipe" value="${esc(n)}" ${eq.has(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div></div>
          <button class="btn-primary w-100" type="submit">Continuar → pergunta do retrabalho</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(box);
  const fechar = () => box.remove();
  document.getElementById('lancar-x').onclick = fechar;
  box.querySelectorAll('.casa-chip input').forEach(cb => { cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked); });
  document.getElementById('lancar-form').onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const data = String(fd.get('data') || '');
    if (!OPERACAO.dia(data)) { toast('Informe a data da entrega.', 'error'); return; }
    const equipe = fd.getAll('equipe').map(String).filter(Boolean);
    fechar();
    perguntarRetrabalho(os, () => {
      if (equipe.length) os.equipe = equipe;
      os.entregaLancada = { em: nowISO(), por: (STATE.user && STATE.user.nome) || '', data };
      os.atualizadoEm = nowISO(); os.atualizadoPor = (STATE.user && STATE.user.nome) || '';
      STORE.saveOS(os);
      toast(`Entrega da O.S ${os.numero || ''} lançada.`, 'success');
      renderEntregas();
    });
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
  const anoHoje = Number(hoje.slice(0, 4));
  const alvos = [
    { id: '30d', rotulo: 'Últimos 30 dias', de: OPERACAO.somarDias(hoje, -29), ate: hoje },
    { id: 'mes', rotulo: 'Este mês', de: hoje.slice(0, 7) + '-01', ate: hoje },
    ...anosEntregas().map(a => ({ id: 'a' + a, rotulo: String(a), de: a + '-01-01', ate: a === anoHoje ? hoje : a + '-12-31' })),
  ];
  const linhaAnos = `<div class="casa-chips-periodo">${alvos.map(a =>
    `<button type="button" class="casa-chip-per ${f.de === a.de && f.ate === a.ate ? 'on' : ''}" data-per-de="${a.de}" data-per-ate="${a.ate}">${esc(a.rotulo)}</button>`
  ).join('')}</div>`;

  /* OS MESES DO ANO EM FOCO, na fileira de baixo (pedido do dono, 15/09/2026:
     "colocar o chip dos meses aqui embaixo").
     Chegar em março de 2025 exigia escolher o ano e depois digitar duas datas.
     Agora: toca no ano, toca no mês.

     O ANO EM FOCO SAI DO PERÍODO ESCOLHIDO, não de um estado próprio — assim a
     fileira de meses sempre concorda com o que está aceso em cima, inclusive
     quando o período veio das datas digitadas ou de um clique na grade do
     histórico. Sem ano legível (período atravessando dois anos), mostra o ano
     corrente, que é onde a pessoa está.

     O PONTO marca mês que tem pacote guardado no servidor. Sem ele, um mês
     nunca carregado e um mês sem venda pareceriam a mesma coisa — e o primeiro
     custa 25-40 s de ERP para descobrir. */
  const anoFoco = (String(f.de || '').slice(0, 4) === String(f.ate || '').slice(0, 4) && /^\d{4}$/.test(String(f.de || '').slice(0, 4)))
    ? Number(String(f.de).slice(0, 4))
    : anoHoje;
  const resumo = STORE.resumoEntregues ? STORE.resumoEntregues() : null;
  const comPacote = new Set(((resumo && resumo.meses) || []).map(l => l.mes));
  const linhaMeses = `<div class="casa-chips-periodo casa-chips-mes">${MES_CURTO.map((rot, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const k = `${anoFoco}-${mm}`;
    const ultimo = new Date(Date.UTC(anoFoco, i + 1, 0)).getUTCDate();
    const de = `${k}-01`;
    const ate = k === hoje.slice(0, 7) ? hoje : `${k}-${String(ultimo).padStart(2, '0')}`;
    // Mês que ainda não começou não é escolha: fica visível e desligado, para a
    // fileira não mudar de tamanho ao trocar de ano.
    const futuro = k > hoje.slice(0, 7);
    const aceso = f.de === de && f.ate === ate;
    return `<button type="button" class="casa-chip-per ${aceso ? 'on' : ''}${k === hoje.slice(0, 7) ? ' hoje' : ''}"
      ${futuro ? 'disabled title="ainda não aconteceu"' : `data-per-de="${de}" data-per-ate="${ate}"`}>${rot}${comPacote.has(k) ? '<i class="casa-chip-ponto" title="mês já carregado"></i>' : ''}</button>`;
  }).join('')}<span class="casa-chips-nota">${anoFoco}</span></div>`;

  return linhaAnos + linhaMeses;
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
    return `<p class="metricas-nota casa-carga">✅ Todos os <strong>${meses.length}</strong> meses estão gravados neste aparelho${p && p.erros.length ? ` · <span class="badge sem-valor">${p.erros.length} mês(es) não responderam</span>` : ''}.
      <button class="btn-ghost btn-xs edit-only" data-carga-tudo="1">Conferir de novo</button></p>`;
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
       a esta altura?", que é a pergunta de quem olha. */
    const ate = doAno.filter(l => Number(l.mes.slice(5, 7)) <= mesDoAno);
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
    if (!a.mesesMesmoPeriodo) { a.porQueNaoCompara = 'este ano não tem mês carregado no período'; continue; }
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
        <td class="num"><strong>${dinheiroCurto(linha.valor)}</strong>${linha.semDado.length ? ` <span class="badge sem-valor" title="${linha.semDado.join(', ')}">${linha.semDado.length} sem dado</span>` : ''}</td>
        <td class="num">${equipeDoAnoHTML(ano)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:.8rem">Toque num mês para abrir o período dele acima. <strong>*</strong> mês em andamento. Traço é mês sem pacote guardado — não é venda zero.${t.semDado.length ? ` Faltam <strong>${t.semDado.length}</strong> mês${t.semDado.length === 1 ? '' : 'es'} no servidor; cada um leva 25-40 s para o ERP montar.` : ''}</p>`;

  const barrasAno = barrasCasa(
    t.porAno.slice().reverse().map(a => ({
      rotulo: a.ano, valor: a.valor,
      extra: `${a.os} O.S · ${a.meses} mês${a.meses === 1 ? '' : 'es'}${a.semDado.length ? ` · ${a.semDado.length} sem dado` : ''}`,
    })), dinheiroCurto) || '<p class="text-muted">Sem dado de ano nenhum.</p>';

  const comparativo = `<div class="casa-tabela-wrap"><table class="casa-tabela">
    <thead><tr><th>Ano</th><th class="num">Total do ano</th><th class="num">Até ${MES_CURTO[Number(hoje.slice(5, 7)) - 1]}</th><th class="num">vs. ano anterior</th><th class="num">No prazo</th></tr></thead>
    <tbody>${t.porAno.slice().reverse().map(a => {
      const v = a.variacao;
      const cor = v === undefined ? '' : (v >= 0 ? 'st-confirmada' : 'sem-valor');
      return `<tr>
        <td><strong>${esc(a.ano)}</strong>${a.semDado.length ? ` <span class="badge sem-valor" title="${a.semDado.join(', ')}">parcial</span>` : ''}</td>
        <td class="num">${dinheiroCasa(a.valor)}</td>
        <td class="num">${a.mesesMesmoPeriodo
          ? `${dinheiroCasa(a.mesmoPeriodo)} <small class="text-muted">${a.mesesMesmoPeriodo} m</small>`
          : '<span class="text-muted" title="nenhum mês deste período está carregado — não é venda zero">—</span>'}</td>
        <td class="num">${v === undefined
          ? `<span class="text-muted" title="${esc(a.porQueNaoCompara || 'sem ano anterior carregado para comparar')}">sem base</span>`
          : `<span class="badge ${cor}">${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%</span> <small class="text-muted">vs ${esc(a.compara)}</small>`}</td>
        <td class="num">${a.comPrazo ? Math.round(a.noPrazo / a.comPrazo * 100) + '%' : '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="text-muted" style="font-size:.8rem">A comparação é sempre do <strong>mesmo período</strong>: o acumulado até ${MES_CURTO[Number(hoje.slice(5, 7)) - 1]} de cada ano. Comparar um ano de ${Number(hoje.slice(5, 7))} meses com um de 12 responderia a pergunta errada.</p>`;

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
    ${quadroCasa('ent-anos-sazonal', '🗓️ Como costuma ser cada mês <small>— média dos anos</small>', sazonalHTML, false)}
    ${quadroCasa('ent-anos-equipe', '👥 Quanta gente a casa tinha <small>— do RH, por área</small>', equipeHistoricoHTML(t), true)}`;

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
    ${quadroCasa('ent-tipos', '🛠️ Por tipo de serviço <small>— onde o dinheiro entra</small>', tiposHTML, true)}
    ${quadroCasa('ent-clientes', '🏢 Maiores clientes do período', clientesHTML, false)}
    ${quadroCasa('ent-dow', '📆 Dia da semana <small>— onde o volume cai</small>', dowHTML, false)}
    ${quadroCasa('ent-tipo-entrega', '📦 Instalação × retirada',
      `<div class="casa-kpi-cards">
        ${kpiLinha('instalações', String(instal.length), dinheiroCurto(somaI))}
        ${kpiLinha('retiradas no balcão', String(retiradas.length), dinheiroCurto(somaR))}
        ${kpiLinha('participação da retirada', (lista.length ? Math.round(retiradas.length / lista.length * 100) : 0) + '%', total ? Math.round(somaR / total * 100) + '% do valor' : '')}
      </div>
      <p class="text-muted" style="font-size:.8rem">Retirada soma valor, mas não conta como entrega realizada — não é instalação.</p>`, false)}
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
             dica: `${per.comErro.length} mês${per.comErro.length === 1 ? ' não veio' : 'es não vieram'} do Mubisys. Não quer dizer que não houve entrega — quer dizer que não deu para perguntar. Tente de novo em alguns minutos.` };
  }
  return { titulo: 'Nenhuma entrega no período segundo o ERP',
           dica: 'O ERP não tem O.S com status ENTREGUE e data de entrega neste intervalo.' };
}

function renderEntregas() {
  const el = document.getElementById('panel-entregas');
  if (!el) return;
  const todas = STORE.getAllOS();
  const porNumero = new Map(todas.map(o => [String(o.numero || '').trim(), o]));
  const cls = classificarEntregas(todas);
  const registradas = new Set(cls.instalacoes.map(o => String(o.numero || '').trim()));
  const aLancarSet = new Set(cls.aLancar.map(o => String(o.numero || '').trim()));
  const hoje = OPERACAO.dia(new Date());
  const f = periodoEntregas();
  const tecnico = STATE._entTecnico || '';
  const tipo = STATE._entTipo || '';
  if (!STATE._entVista) STATE._entVista = 'tabela';

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
  const estadoPCP = o => {
    const n = String(o.numero || '').trim();
    if (o.tipo === 'interno') return { rotulo: 'Retirada', classe: 'st-finalizada', dica: 'Só o valor conta; retirada não é entrega realizada' };
    const card = porNumero.get(n);
    if (!card) return { rotulo: 'fora do PCP', classe: 'st-aguardando_producao', dica: 'O ERP entregou, mas esta O.S nunca passou pelo PCP' };
    if (card.entregaLancada) return { rotulo: 'lançada', classe: 'st-confirmada', dica: 'Baixa do ERP lançada à mão por ' + (card.entregaLancada.por || '') };
    if (registradas.has(n)) return { rotulo: 'registrada', classe: 'st-confirmada', dica: 'Entrega registrada no PCP' };
    if (aLancarSet.has(n)) return { rotulo: 'a lançar', classe: 'st-retrabalho', dica: 'Baixada pelo ERP; falta lançar no PCP' };
    if (card.finalizadaEm) return { rotulo: 'baixada', classe: 'st-aguardando_producao', dica: 'Finalizada no PCP' };
    return { rotulo: 'aberta no PCP', classe: 'st-agendada', dica: 'O ERP marcou entregue, mas o card segue aberto' };
  };
  const lista = per.os
    .map(o => ({ erp: o, card: porNumero.get(String(o.numero || '').trim()) || null }))
    .filter(x => !tecnico || (x.card && OPERACAO.equipe(x.card).includes(tecnico)))
    .filter(x => !tipo || String((x.card && x.card.servico) || x.erp.servico || '').trim() === tipo)
    .sort((a, b) => String(b.erp.data).localeCompare(String(a.erp.data)) || String(b.erp.numero).localeCompare(String(a.erp.numero)));
  let totLista = 0, semValorLista = 0;
  for (const x of lista) { if (x.erp.valor !== null && Number.isFinite(Number(x.erp.valor))) totLista += Number(x.erp.valor); else semValorLista++; }
  // A tabela mostra no máximo 300 linhas; o resto está nos relatórios.
  const TETO_LINHAS = 300;
  const visiveis = lista.slice(0, TETO_LINHAS);
  const aLancar = cls.aLancar.filter(o => OPERACAO.emIntervalo(o.finalizadaEm, f.de, f.ate))
    .sort((a, b) => String(b.finalizadaEm).localeCompare(String(a.finalizadaEm)));

  const tecnicos = [...new Set(todas.filter(o => o.finalizadaEm).flatMap(o => OPERACAO.equipe(o)))].sort((a, b) => a.localeCompare(b));
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
  const kpiPeriodo = periodoRepetido ? '' : kpiHTML(kPer, rotuloPeriodo(f.de, f.ate), 'escolhido');

  const tabela = `<div class="casa-tabela-wrap"><table class="casa-tabela">
    <thead><tr><th>O.S</th><th>Cliente</th><th>Serviço</th><th>Técnicos</th><th>Entrega (ERP)</th><th class="num">Valor</th></tr></thead>
    <tbody>${visiveis.map(({ erp, card }) => { const st = estadoPCP(erp); return `<tr ${card ? `data-os-id="${esc(card.id)}"` : ''}>
        <td><strong>${esc(erp.numero || '—')}</strong> <span class="badge ${st.classe}" title="${esc(st.dica)}">${esc(st.rotulo)}</span>${card && card.retrabalho ? ' <span class="badge st-retrabalho">Retrabalho</span>' : ''}</td>
        <td>${esc(erp.cliente || (card && card.cliente) || '')}</td>
        <td>${esc((card && card.servico) || erp.servico || '—')}</td>
        <td>${esc(card ? (OPERACAO.equipe(card).join(', ') || (erp.tipo === 'interno' ? 'balcão' : 'sem equipe')) : '—')}</td>
        <td>${dataBR(erp.data)}</td>
        <td class="num">${valorTxt(erp.valor)}</td>
      </tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="5">${lista.length} O.S entregues no período${lista.length > TETO_LINHAS ? ` · mostrando as ${TETO_LINHAS} mais recentes` : ''}${semValorLista ? ` · ${semValorLista} sem valor` : ''}${per.faltando.length ? ` · carregando ${per.faltando.length} mês${per.faltando.length === 1 ? '' : 'es'}…` : ''}${per.comErro.length ? ` · <span class="badge sem-valor">${per.comErro.length} mês${per.comErro.length === 1 ? '' : 'es'} sem resposta do ERP</span>` : ''}${per.truncou ? ` · <span class="badge sem-valor">intervalo longo demais: entraram só os primeiros ${TETO_MESES} meses</span>` : ''}</td><td class="num">${dinheiroCasa(totLista)}</td></tr></tfoot>
  </table></div>`;
  const cardFn = typeof osCardHTML === 'function' ? osCardHTML : null;
  const cards = cardFn ? `<div class="cards-grid">${visiveis.filter(x => x.card).map(x => cardFn(x.card)).join('')}</div>` : tabela;

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Entregas</h2><p><strong>Valor</strong> = o que o ERP marcou ENTREGUE, pela data de entrega, todas as O.S (líquido de desconto). <strong>Entrega realizada</strong> = instalação registrada no PCP (finalizada, ou baixa do ERP lançada à mão). Cliente retira só soma valor.</p></div>
      </div>
      <div class="casa-kpi-cards">${kpiPeriodo}${kpiHTML(kHoje, 'entregue hoje')}${kpiHTML(kMes, 'entregue no mês')}${kpiHTML(kAno, 'entregue no ano')}</div>
      <p class="metricas-nota">Registradas no PCP neste mês: <strong>${registradasMes}</strong> instalaç${registradasMes === 1 ? 'ão' : 'ões'}${cls.aLancar.length ? ` · a lançar: <strong>${cls.aLancar.length}</strong>` : ''}. Fonte do valor: ERP${STORE.entreguesMes(hoje.slice(0, 7)) ? `, atualizado ${new Date(STORE.entreguesMes(hoje.slice(0, 7)).em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' (carregando…)'}.</p>
      ${chipsPeriodoEntregas(f)}
      ${barraCargaEntregas()}
      <div class="filter-bar">${filtroPeriodoHTML('_fEnt')}</div>
      <div class="casa-filtros">
        <label>Técnico <select id="ent-tecnico"><option value="">Todos</option>${tecnicos.map(t => opt(t, tecnico)).join('')}</select></label>
        <label>Tipo de serviço <select id="ent-tipo"><option value="">Todos</option>${tipos.map(t => opt(t, tipo)).join('')}</select></label>
        <span class="casa-vista"><button class="btn-ghost btn-sm ${STATE._entVista === 'tabela' ? 'active' : ''}" data-ent-vista="tabela">Tabela</button><button class="btn-ghost btn-sm ${STATE._entVista === 'cards' ? 'active' : ''}" data-ent-vista="cards">Cards</button></span>
      </div>
      ${lista.length ? (STATE._entVista === 'cards' ? cards : tabela) : emptyState('', vazioEntregas(per).titulo, vazioEntregas(per).dica)}
      ${lista.length ? prazoEntregasHTML(lista.map(x => x.erp), porNumero) : ''}
      ${relatoriosEntregasHTML(lista.map(x => x.erp), porNumero, estadoPCP)}
      ${relatorioAnosHTML()}
      <section class="casa-prod-box casa-lancar">
        <h3>Lançamento manual — baixadas pelo ERP fora do sistema · ${aLancar.length}</h3>
        <p>O ERP marcou entregue, mas ninguém finalizou no PCP. Não conta como entrega realizada até alguém lançar: confirme data e equipe e responda se gerou retrabalho. Baixas anteriores a ${CORTE_LANCAMENTO_MANUAL.slice(8, 10)}/${CORTE_LANCAMENTO_MANUAL.slice(5, 7)}/${CORTE_LANCAMENTO_MANUAL.slice(0, 4)} já contam como entregues (decisão da direção).</p>
        ${aLancar.length ? `<div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S</th><th>Cliente</th><th>Serviço</th><th>Técnicos</th><th>Baixa ERP</th><th class="num">Valor</th><th></th></tr></thead><tbody>${aLancar.map(os => `<tr>
            <td><strong>${esc(os.numero || '—')}</strong></td><td>${esc(os.cliente || '')}</td><td>${esc(os.servico || '—')}</td><td>${esc(OPERACAO.equipe(os).join(', ') || 'sem equipe')}</td><td>${dataBR(os.finalizadaEm)}</td><td class="num">${valorTxt(valorDaOS(os))}</td>
            <td><button class="btn-primary btn-xs edit-only" data-lancar-os="${esc(os.id)}">Lançar entrega</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="text-muted">Nada pendente de lançamento neste período.</p>'}
      </section>
    </div>`;
  wireFiltroPeriodo(el, '_fEnt', renderEntregas);
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
  el.querySelectorAll('[data-carga-tudo]').forEach(b => b.onclick = () => {
    const meses = mesesTodosEntregas();
    if (!meses.length || !STORE.carregarTudoEntregues) return;
    const faltam = meses.filter(m => !(STORE.entreguesMes && STORE.entreguesMes(m))).length;
    if (typeof toast === 'function') {
      toast(faltam
        ? `Baixando ${faltam} mês(es). O que o servidor já tem vem agora; o resto leva 25-40 s cada, três por vez. Pode sair da tela.`
        : 'Conferindo os meses guardados.');
    }
    STORE.carregarTudoEntregues(meses).catch(() => {});
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
    if (typeof toast === 'function') toast(`Pedindo ${meses.length} meses de ${ano} ao ERP — de 25 a 40 s cada, três por vez. Pode sair da tela.`);
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
  bindCardClicks(el);
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
    for (const ap of OPERACAO.equipe(os)) {
      const p = nomeExibicaoCasa(ap);
      const d = m.get(p.chave) || { ...p, os: 0, valor: 0, semValor: 0, horas: [], retrab: 0, erp: 0, apelidos: new Set() };
      d.os++; d.apelidos.add(ap);
      if (v == null) d.semValor++; else d.valor += v;
      if (h != null) d.horas.push(h);
      if (os.retrabalho) d.retrab++;
      if (os.entregaLancada) d.erp++;
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
  const { concl, noPeriodo, pessoas } = pessoasDoPeriodo(f);
  const sem = semanaAtualCasa();
  const daSemana = agruparPorPessoaCasa(concl.filter(o => OPERACAO.emIntervalo(diaEntrega(o), sem.de, sem.ate)));
  const destaque = daSemana.length && daSemana[0].valor > 0 ? daSemana[0] : null;
  const semEquipe = noPeriodo.filter(o => !OPERACAO.equipe(o).length).length;
  const cards = pessoas.map(p => `<div class="casa-prod ${destaque && destaque.chave === p.chave ? 'destaque' : ''}" ${p.pessoa && p.pessoa.chave ? `data-pessoa="${esc(p.pessoa.chave)}"` : ''}>
      ${destaque && destaque.chave === p.chave ? '<span class="casa-destaque">★ Destaque da semana</span>' : ''}
      ${avatarRH(p.pessoa || { nome: p.nome })}
      <div>
        <div class="casa-prod-nome">${esc(p.nome)}<small>${p.pessoa ? esc([p.pessoa.cargo, p.pessoa.area].filter(Boolean).join(' · ') || ('ID ' + (p.id || '—'))) : 'sem ficha do RH'}</small></div>
        <dl>
          <dt>Entregas realizadas</dt><dd>${p.os}${p.erp ? ` <small>(${p.erp} lançada${p.erp === 1 ? '' : 's'})</small>` : ''}${p.retrab ? ` <small>(${p.retrab} retrab.)</small>` : ''}</dd>
          <dt>Valor entregue</dt><dd>${valorPessoaHTML(p)}</dd>
          <dt>Tempo médio</dt><dd>${tempoPessoaHTML(p)}</dd>
        </dl>
      </div>
    </div>`).join('');
  return `<section class="casa-prod-box">
      <h3>Produtividade</h3>
      <p>Quem estava na equipe da instalação entregue (finalizada no PCP, ou baixa do ERP lançada à mão). Retirada não é entrega. Valor é participação (não divide, não é bônus). Tempo = saída → retorno registrados na O.S.</p>
      <div class="filter-bar">${filtroPeriodoHTML('_fPerf')}</div>
      ${destaque ? `<p class="metricas-nota">★ Destaque da semana (${sem.de.slice(8, 10)}/${sem.de.slice(5, 7)} a ${sem.ate.slice(8, 10)}/${sem.ate.slice(5, 7)}): <strong>${esc(destaque.nome)}</strong>, ${dinheiroCasa(destaque.valor)} em ${destaque.os} O.S.</p>` : ''}
      ${semEquipe ? `<p class="metricas-nota">${semEquipe} O.S no período sem equipe registrada — não contam para ninguém.</p>` : ''}
      ${pessoas.length ? `<div class="casa-prod-grid">${cards}</div>` : emptyState('', 'Nenhuma entrega com equipe no período', 'A O.S precisa ter equipe e ser finalizada no PCP.')}
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
  if (!entregues.length) return '<p class="text-muted">Nenhuma entrega registrada ainda.</p>';

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

  const fechados = anos.filter(a => a.k !== anoAtual);
  const media = fechados.length ? Math.round(fechados.reduce((t, a) => t + a.n, 0) / fechados.length) : null;
  const esteAno = anos.find(a => a.k === anoAtual);

  return `<p class="text-muted" style="font-size:.8rem">${entregues.length} entregas no histórico inteiro — este quadro ignora o filtro de período acima, de propósito.</p>
    <div class="casa-kpi-cards">
      <div class="casa-kpi"><b>${entregues.length}</b><small>entregas desde o começo</small></div>
      <div class="casa-kpi"><b>${esteAno ? esteAno.n : 0}</b><small>em ${anoAtual}, ano em curso</small></div>
      ${media != null ? `<div class="casa-kpi"><b>${media}</b><small>média por ano fechado · ${fechados.length} ano${fechados.length === 1 ? '' : 's'}</small></div>` : ''}
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
  const contar = (campo, lista) => {
    const base = lista || doPeriodo;
    const m = new Map(); let vazios = 0;
    for (const o of base) {
      const k = String(o[campo] || '').trim();
      if (!k) { vazios++; continue; }
      m.set(k, (m.get(k) || 0) + 1);
    }
    const itens = [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);
    return { itens, vazios, total: base.length };
  };
  const etapas = contar('etapaOrigem'), causas = contar('causaRaiz'), responsaveis = contar('responsavelEtapa');
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

  const totalEntregas = pessoas.reduce((s, p) => s + p.os, 0);
  const taxa = totalEntregas ? (doPeriodo.length / totalEntregas * 100) : 0;
  if (!doPeriodo.length) return '<p class="text-muted">Nenhum retrabalho registrado no período. 🎉</p>';
  return `<div class="casa-kpi-cards">
      <div class="casa-kpi alerta"><b>${doPeriodo.length}</b><small>O.S de retrabalho no período</small></div>
      <div class="casa-kpi"><b>${taxa.toFixed(1).replace('.', ',')}%</b><small>sobre ${totalEntregas} participações em entrega</small></div>
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
      <div><h4>Por causa raiz</h4>${dimensao(causas, 'preenche-se na O.S que voltou')}</div>
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
    if (!nome) continue;
    const dia = OPERACAO.dia(os.instalacao && os.instalacao.data) || diaEntrega(os);
    if (!OPERACAO.emIntervalo(dia, f.de, f.ate)) continue;
    const d = m.get(nome) || { nome, os: 0, km: 0, pessoas: new Set() };
    d.os++;
    const a = Number(os.kmSaida), b = Number(os.kmRetorno);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) d.km += b - a;
    for (const p of OPERACAO.equipe(os)) d.pessoas.add(p);
    m.set(nome, d);
  }
  const lista = [...m.values()].sort((a, b) => b.os - a.os);
  if (!lista.length) {
    const foraDoPeriodo = STORE.getAllOS().filter(o => String(o.veiculo || '').trim()).length;
    return `<p class="text-muted">Nenhuma O.S com veículo neste período.${foraDoPeriodo ? ` Há ${foraDoPeriodo} O.S com veículo em outras datas — amplie o período acima para vê-las.` : ' O campo Veículo da O.S está em branco em todas — sem ele não dá para saber que carro rodou.'}</p>`;
  }
  const semUso = veiculosRH().filter(v => !lista.some(x => normCasa(x.nome) === normCasa(v.nome)));
  return `${barrasCasa(lista.map(c => ({ rotulo: c.nome, valor: c.os, extra: c.km ? `${Math.round(c.km)} km` : '' })), v => `${v} O.S`)}
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

/* ── Ligar o apelido da O.S à ficha do RH, pela tela ───────────────────────
   O PCP escreve apelido; o RH tem a ficha. O que casa sozinho já casou — aqui
   ficam só os que não casaram, com a lista do RH ao lado. */
function ligacaoRHHTML() {
  const pendentes = apelidosSemFicha();
  const ativos = pessoasRHAtivas();
  const ligados = lerVinculosCasa();
  const optPessoas = ativos.map(p => `<option value="${esc(p.chave)}">${esc(p.nome)}${p.cargo ? ' — ' + esc(p.cargo) : ''}</option>`).join('');
  return `<p>Apelido escrito na O.S que ainda não achou ficha. Escolha a pessoa e ligue — a partir daí a foto, o cargo e o nome completo aparecem sozinhos, aqui e na mensagem do dia.</p>
    ${pendentes.length ? `<div class="casa-tabela-wrap"><table class="casa-tabela">
      <thead><tr><th>Apelido na O.S</th><th class="num">O.S</th><th>Pessoa do RH</th><th></th></tr></thead>
      <tbody>${pendentes.map(x => `<tr>
        <td><strong>${esc(x.apelido)}</strong></td>
        <td class="num">${x.n}</td>
        <td><select data-lig-sel="${esc(x.apelido)}"><option value="">— escolher —</option>${optPessoas}</select></td>
        <td><button class="btn-primary btn-xs edit-only" data-lig-ok="${esc(x.apelido)}">Ligar</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : '<p class="text-muted">Todo apelido usado nas O.S já tem ficha. 👍</p>'}
    ${ligados.length ? `<details class="casa-mais-fichas" style="margin-top:10px"><summary>Ligações salvas à mão · ${ligados.length}</summary>
      <ul class="casa-os">${ligados.map(v => `<li>${esc(v.apelido)} → ${esc(v.nome || v.chave || v.id)} <button class="btn-ghost btn-xs" data-del-ficha="${esc(v.apelido)}" type="button">Desligar</button></li>`).join('')}</ul>
    </details>` : ''}
    <p class="text-muted" style="font-size:.8rem">${ativos.length} pessoas ativas no RH${pessoasRH().length > ativos.length ? ` · ${pessoasRH().length - ativos.length} inativa(s) fora da lista` : ''}. Quem sai da empresa sai daqui sozinho.</p>`;
}

/* ── Modo TV: ranking na tela da fábrica ───────────────────────────────────
   Tela cheia, letra grande, troca de painel sozinha. Esc ou o × sai. */
function painelTVCasa(i, f) {
  const { pessoas } = pessoasDoPeriodo(f);
  const sem = semanaAtualCasa();
  const daSemana = agruparPorPessoaCasa(classificarEntregas(STORE.getAllOS()).instalacoes.filter(o => OPERACAO.emIntervalo(diaEntrega(o), sem.de, sem.ate)));
  const podio = (lista, medida, fmt) => lista.slice(0, 8).map((p, k) => `<li class="tv-linha ${k < 3 ? 'tv-podio' : ''}">
      <span class="tv-pos">${k + 1}</span>
      ${avatarRH(p.pessoa || { nome: p.nome }, 'tv-foto')}
      <span class="tv-nome">${esc(p.nome)}${p.pessoa && p.pessoa.cargo ? `<small>${esc(p.pessoa.cargo)}</small>` : ''}</span>
      <span class="tv-num">${fmt(medida(p))}</span>
    </li>`).join('');
  const paineis = [
    { titulo: '🏆 Valor entregue no período', corpo: pessoas.length ? `<ol class="tv-lista">${podio(pessoas, p => p.valor, dinheiroCasa)}</ol>` : '<p class="tv-vazio">Sem entregas registradas no período.</p>' },
    { titulo: '📦 Entregas realizadas no período', corpo: pessoas.length ? `<ol class="tv-lista">${podio(pessoas.slice().sort((a, b) => b.os - a.os), p => p.os, v => `${v} O.S`)}</ol>` : '<p class="tv-vazio">Sem entregas registradas no período.</p>' },
    { titulo: `★ Destaque da semana · ${sem.de.slice(8, 10)}/${sem.de.slice(5, 7)} a ${sem.ate.slice(8, 10)}/${sem.ate.slice(5, 7)}`, corpo: daSemana.length ? `<ol class="tv-lista">${podio(daSemana, p => p.valor, dinheiroCasa)}</ol>` : '<p class="tv-vazio">Semana ainda sem entrega registrada.</p>' },
    { titulo: '🚚 Carros mais usados', corpo: carrosHTML(f) },
    { titulo: '🔧 Retrabalho no período', corpo: retrabalhoHTML(f) },
  ];
  const n = ((i % paineis.length) + paineis.length) % paineis.length;
  const p = paineis[n];
  return { total: paineis.length, html: `<div class="tv-head">
      <h2>${p.titulo}</h2>
      <span class="tv-relogio">${new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="tv-corpo">${p.corpo}</div>
    <div class="tv-rodape"><span>Impresilk · Instalação</span><span class="tv-pontos">${paineis.map((_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</span><span>${esc(rotuloPeriodoCasa(f))}</span></div>` };
}
function rotuloPeriodoCasa(f) {
  if (!f.de && !f.ate) return 'todos os períodos';
  const br = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '…';
  return f.de === f.ate ? br(f.de) : `${br(f.de)} a ${br(f.ate)}`;
}
function abrirTVCasa() {
  const old = document.getElementById('tv-casa'); if (old) old.remove();
  const f = periodoOuMes('_fPerf');
  let i = 0, timer = null;
  const box = document.createElement('div');
  box.id = 'tv-casa';
  box.className = 'tv-overlay';
  document.body.appendChild(box);
  document.body.classList.add('tv-ligada');
  const pintar = () => {
    const p = painelTVCasa(i, f);
    box.innerHTML = `<button class="tv-x" title="Sair (Esc)">×</button>
      <button class="tv-seta tv-esq" title="Anterior">‹</button>
      <button class="tv-seta tv-dir" title="Próximo">›</button>
      <div class="tv-painel">${p.html}</div>`;
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
  const fichas = lerVinculosCasa();
  const pendentes = apelidosSemFicha();
  const aprovados = b.itens.filter(i => i.status === 'aprovado' || i.status === 'pago');
  const pago = b.itens.filter(i => i.status === 'pago').reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aprovado = aprovados.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const filtroId = STATE._perfFiltro || '';
  const rankRows = rank.map((p, i) => {
    const item = itemDaPessoa(b.itens, p.id);
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
    const eqIds = OPERACAO.equipe(os).map(n => fichaPorApelido(n)).filter(Boolean).map(f2 => f2.id);
    const primarios = new Set([...marcados, ...eqIds]);
    const principais = [];
    for (const id of primarios) {
      const ficha = fichas.find(x => x.id === id) || { id, nome: '', apelido: '' };
      principais.push(ficha);
    }
    const outras = fichas.filter(x => !primarios.has(x.id));
    const mostrarOutras = fichas.length > 8;
    const chipsMain = (mostrarOutras ? principais : fichas.slice()).map(x =>
      chipFichaHTML(os.id, x, marcados.includes(x.id))
    ).join('');
    const chipsMais = mostrarOutras ? outras.map(x => chipFichaHTML(os.id, x, marcados.includes(x.id))).join('') : '';
    const semFicha = OPERACAO.equipe(os).filter(n => !fichaPorApelido(n));
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
        `<span class="sem-ficha">${esc(n)} · sem ficha</span>`
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
  const abaPerf = STATE._perfAba === 'relatorio' ? 'relatorio' : 'equipe';
  const pendRH = pendentes.length;
  el.innerHTML = `
    <div class="casa-pagina casa-perf">
      <div class="casa-pagina-head">
        <div><h2>Performance</h2><p>${abaPerf === 'equipe'
          ? 'Quem entregou, com a ficha do RH (foto, cargo e situação), e o bônus do mês.'
          : 'Entregas ao longo dos anos, gente e retrabalho — o que a operação produziu, lido de longe.'}</p></div>
        <span class="casa-vista">
          <button class="btn-ghost btn-sm ${abaPerf === 'equipe' ? 'active' : ''}" data-perf-aba="equipe">Equipe</button>
          <button class="btn-ghost btn-sm ${abaPerf === 'relatorio' ? 'active' : ''}" data-perf-aba="relatorio">Relatório</button>
          <button class="btn-primary btn-sm" id="perf-tv" title="Ranking em tela cheia para a TV da fábrica">📺 Modo TV</button>
        </span>
      </div>
      ${abaPerf === 'equipe' ? `
        ${produtividadeHTML()}
        ${quadroCasa('perf-rh', `🔗 Ligar apelido do PCP à ficha do RH${pendRH ? ` <span class="badge sem-valor">${pendRH} pendente${pendRH === 1 ? '' : 's'}</span>` : ''}`, ligacaoRHHTML(), pendRH > 0)}
        ${quadroCasa('perf-plantoes', '🗓 Plantões vinculados às O.S.', plantaoPerformanceHTML(), false)}
        ${quadroCasa('perf-bonus', '💰 Bônus por ponto <small>— apuração manual do mês</small>', bonusHTML, false)}
      ` : `
        <div class="filter-bar">${filtroPeriodoHTML('_fPerf')}</div>
        ${quadroCasa('perf-entregues', '📦 Serviços entregues <small>— ano a ano e mês a mês</small>', servicosEntreguesHTML(), true)}
        ${quadroCasa('perf-gente', '👷 Performance dos funcionários <small>— no período escolhido</small>', produtividadeHTML(), true)}
        ${quadroCasa('perf-retrab', '🔧 Retrabalho <small>— de onde veio, de quem e de que tipo</small>', retrabalhoHTML(f), true)}
        ${quadroCasa('perf-carros', '🚚 Carros mais usados', carrosHTML(f), false)}
      `}
    </div>`;
  wireFiltroPeriodo(el, '_fPerf', renderPerformanceCasa);
  wireQuadrosCasa(el);
  el.querySelectorAll('[data-perf-aba]').forEach(b => b.onclick = () => {
    STATE._perfAba = b.dataset.perfAba; renderPerformanceCasa();
  });
  const tv = document.getElementById('perf-tv'); if (tv) tv.onclick = abrirTVCasa;
  const mesEl = document.getElementById('perf-mes');
  if (mesEl) mesEl.onchange = () => { if (mesEl.value) { gravarBonusCasa({ ...b, mes: mesEl.value }); renderPerformanceCasa(); } };
  const orcEl = document.getElementById('perf-orc');
  if (orcEl) orcEl.onchange = () => { gravarBonusCasa({ ...b, orcamento: Math.max(0, Number(orcEl.value) || 0) }); renderPerformanceCasa(); };
  const tetoEl = document.getElementById('perf-teto');
  if (tetoEl) tetoEl.onchange = () => { gravarBonusCasa({ ...b, teto: Math.max(0, Number(tetoEl.value) || 0) }); renderPerformanceCasa(); };
  el.querySelectorAll('[data-lig-ok]').forEach(btn => {
    btn.onclick = () => {
      const ap = btn.dataset.ligOk;
      const sel = el.querySelector(`[data-lig-sel="${CSS.escape(ap)}"]`);
      if (!sel || !sel.value) { toast('Escolha a pessoa do RH.', 'error'); return; }
      const p = pessoaRHPorChave(sel.value);
      if (!ligarApelidoRH(ap, sel.value)) { toast('Não consegui ligar este apelido — confira se a ficha do RH tem CPF cadastrado.', 'error'); return; }
      renderPerformanceCasa();
      toast(`${ap} → ${p.nome}. Foto e cargo já aparecem.`, 'success');
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
  const gravarPontosDaOs = osId => {
    const ids = [...el.querySelectorAll(`[data-ponto="${osId}"]`)].filter(cb => cb.checked).map(cb => cb.value);
    const pontos = { ...b.pontos, [osId]: ids };
    gravarBonusCasa({ ...b, pontos });
    renderPerformanceCasa();
  };
  el.querySelectorAll('[data-ponto]').forEach(cb => {
    cb.onchange = () => gravarPontosDaOs(cb.dataset.ponto);
  });
  const mesmaPessoa = (x, id) => x.id === id || (!x.id && chavePessoaCasa(x.nome) === id);
  el.querySelectorAll('[data-aprovar]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.aprovar;
      const p = rank.find(x => x.id === id);
      const valor = propostaCasa(p ? p.osCount : 0, totalOs, b.orcamento, b.teto);
      if (valor <= 0) return;
      const itens = b.itens.filter(x => !mesmaPessoa(x, id)).concat([{ id, nome: rotuloPessoaCasa(id), valor, status: 'aprovado' }]);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Proposta aprovada. Ainda não é pagamento na folha.', 'success');
    };
  });
  el.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.pagar;
      const itens = b.itens.map(x => mesmaPessoa(x, id) && x.status === 'aprovado' ? { ...x, id, status: 'pago' } : x);
      gravarBonusCasa({ ...b, itens });
      renderPerformanceCasa();
      toast('Bônus marcado como pago nesta apuração.', 'success');
    };
  });
  el.querySelectorAll('[data-reabrir]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.reabrir;
      gravarBonusCasa({ ...b, itens: b.itens.filter(x => !mesmaPessoa(x, id)) });
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
  const doRH = pessoasRHAtivas().filter(p => !jaTem.has(normCasa(p.nome)) && (!p.apelido || !jaTem.has(normCasa(p.apelido))));
  return { doPCP, doRH };
}
function optionsEquipeCasa(selecionado) {
  const { doPCP, doRH } = equipeEscalavel();
  const op = n => `<option value="${esc(n)}" ${n === selecionado ? 'selected' : ''}>${esc(n)}</option>`;
  /* QUEM JÁ ESTÁ GRAVADO TEM DE CABER NA LISTA.
     O campo "Quem" era texto livre e virou select fechado com `required`. Quem
     foi desligado, inativado, ou teve o nome corrigido no RH deixou de ter
     opção: ao reabrir um plantão antigo o navegador selecionava a vazia e o
     Salvar só devolvia "Selecione um item da lista" — sem dizer o motivo, com
     o nome certo visível na tabela logo abaixo. As saídas eram falsear quem
     fez o sobreaviso ou apagar o plantão. */
  const alvo = String(selecionado || '').trim();
  const naLista = alvo && (doPCP.some(n => normCasa(n) === normCasa(alvo))
    || doRH.some(p => normCasa(p.nome) === normCasa(alvo)));
  const gravado = alvo && !naLista
    ? `<optgroup label="Registrado neste plantão"><option value="${esc(alvo)}" selected>${esc(alvo)} · fora da lista atual do RH</option></optgroup>`
    : '';
  const porArea = new Map();
  for (const p of doRH) {
    const k = p.area || p.setor || 'Sem área';
    if (!porArea.has(k)) porArea.set(k, []);
    porArea.get(k).push(p);
  }
  return `${gravado}${doPCP.length ? `<optgroup label="Instalação (PCP)">${doPCP.map(op).join('')}</optgroup>` : ''}
    ${[...porArea.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([area, ps]) =>
      `<optgroup label="${esc(area)}">${ps.map(p => op(p.nome)).join('')}</optgroup>`).join('')}`;
}
function optionsVeiculoCasa(selecionado) {
  const doAtivos = veiculosRH();
  const doCfg = (STORE.getCFG().veiculos || []).filter(v => !doAtivos.some(x => normCasa(x.nome) === normCasa(v)));
  return `${doAtivos.map(v => `<option value="${esc(v.nome)}" ${v.nome === selecionado ? 'selected' : ''}>${esc(v.nome)}${v.lugares ? ` · ${v.lugares} lugares` : ''}${v.placa ? ` · ${v.placa}` : ''}</option>`).join('')}
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
  return `<span class="casa-pill ${t || 'navy'}" title="${esc(p.quem || '')}${p.obs ? ' — ' + esc(p.obs) : ''}">${t ? esc(TIPOS_PLANTAO[t]) : 'plantão'}</span>`;
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
    return `<button type="button" class="casa-dia ${noMes ? '' : 'fora'} ${iso === sel ? 'sel' : ''} ${iso === hoje ? 'hoje' : ''}" data-dia="${iso}" title="${doDia.length} O.S${doDia.length ? ': ' + esc(doDia.map(o => o.numero).join(', ')) : ''}">
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
  const escalados = [...new Set(osDia.flatMap(o => OPERACAO.equipe(o)))];

  el.innerHTML = `
    <div class="casa-pagina">
      <div class="casa-pagina-head">
        <div><h2>Calendário da produção</h2><p>Cada dia mostra quantas O.S estão programadas e os plantões. Clique no dia para ver a lista, programar e mandar a mensagem.</p></div>
        <span class="casa-mes-nav">
          <button class="btn-ghost btn-sm" id="ag-ant" title="Mês anterior">‹</button>
          <label class="casa-mes">Mês <input type="month" id="ag-mes" value="${esc(mes)}"></label>
          <button class="btn-ghost btn-sm" id="ag-prox" title="Próximo mês">›</button>
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
              <div class="l2"><span>👥 ${esc(OPERACAO.equipe(os).join(', ') || 'sem equipe')}</span><span>🚗 ${esc(os.veiculo || 'sem veículo')}</span>${os.servico ? `<span>${esc(os.servico)}</span>` : ''}</div>
            </div>`).join('') || '<p class="text-muted">Nenhuma O.S neste dia.</p>'}</div>
          ${plDia.length ? `<ul class="casa-os">${plDia.map(p => `<li>${pillPlantao(p)} ${esc(p.quem)} · ${esc(p.inicio)}–${esc(p.fim)}${p.titulo ? ' · ' + esc(p.titulo) : ''}</li>`).join('')}</ul>` : ''}
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
function formAddOSHTML(id, dia, candidatas) {
  return `<form id="${esc(id)}">
      <label>O.S <select name="osId" required><option value="">— escolher —</option>${candidatas.slice(0, 300).map(o => `<option value="${esc(o.id)}">${esc(o.numero || '—')} — ${esc((o.cliente || '').slice(0, 34))}${OPERACAO.prazo(o) ? ' · prazo ' + OPERACAO.prazo(o).slice(8, 10) + '/' + OPERACAO.prazo(o).slice(5, 7) : ''}</option>`).join('')}</select></label>
      <div class="linha2">
        <label>Período <select name="periodo">${(typeof PERIODO_OPTS !== 'undefined' ? PERIODO_OPTS : ['Manhã', 'Tarde', 'Dia inteiro', 'Horário']).map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
        <label>Hora de saída <input name="hora" type="time"></label>
      </div>
      <div class="linha2">
        <label>Duração (dias) <input name="dias" type="number" min="1" value="1"></label>
        <label>Veículo <select name="veiculo"><option value="">— sem veículo —</option>${optionsVeiculoCasa('')}</select></label>
      </div>
      <label>Equipe <div class="casa-chips">${equipeEscalavel().doPCP.map(n => {
        const p = fichaDoApelido(n);
        const a = p ? ausenciaRH(p, dia) : null;
        return `<label class="casa-chip ${a ? 'fora' : ''}" title="${a ? esc(a.motivo) : ''}"><input type="checkbox" name="equipe" value="${esc(n)}"><span>${esc(n)}</span>${a ? `<small>${esc(a.motivo)}</small>` : ''}</label>`;
      }).join('') || '<span class="text-muted">Cadastre instaladores em Configurações.</span>'}</div></label>
      <button class="btn-primary btn-sm" type="submit">Programar em ${esc(dia.slice(8, 10) + '/' + dia.slice(5, 7))}</button>
    </form>`;
}
function wireAddOSCasa(el, id, dia, aoGravar) {
  el.querySelectorAll(`#${id} .casa-chip input[name="equipe"]`).forEach(cb => {
    cb.onchange = () => cb.closest('.casa-chip').classList.toggle('on', cb.checked);
  });
  const f = document.getElementById(id);
  if (!f) return;
  f.onsubmit = ev => {
    ev.preventDefault();
    const fd = new FormData(f);
    const os = STORE.getOS(String(fd.get('osId') || ''));
    if (!os) { toast('Escolha a O.S.', 'error'); return; }
    const periodo = String(fd.get('periodo') || 'Manhã');
    const hora = String(fd.get('hora') || '');
    if (periodo === 'Horário' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { toast('Período "Horário" pede a hora.', 'error'); return; }
    const equipe = fd.getAll('equipe').map(String).filter(Boolean);
    os.confirmacao = ''; os.confEm = ''; os.confPor = ''; os.confHora = ''; os.carroLiberado = false;
    os.instalacao = Object.assign({}, os.instalacao || {}, { data: dia, periodo, hora, duracaoDias: Math.max(1, Number(fd.get('dias')) || 1) });
    if (equipe.length) os.equipe = equipe;
    const veiculo = String(fd.get('veiculo') || ''); if (veiculo) os.veiculo = veiculo;
    os.atualizadoEm = new Date().toISOString();
    os.atualizadoPor = (STATE.user && STATE.user.nome) || '';
    STORE.saveOS(os);
    const conf = OPERACAO.conflitos(STORE.getAllOS(), dia).filter(c => c.a.id === os.id || c.b.id === os.id);
    if (conf.length) toast(`Programada, mas com possível conflito: ${conf.map(c => [...c.equipe, c.veiculo].filter(Boolean).join(', ')).join(' · ')} já está em outra O.S neste turno.`, 'error');
    else toast(`O.S ${os.numero || ''} programada para ${dia.slice(8, 10)}/${dia.slice(5, 7)}.`, 'success');
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
    ${vinculados.map(p => `<p><strong>${esc(p.quem)}</strong> · ${esc(p.data)} · ${esc(p.inicio)}–${esc(p.fim)}<br>${plantaoComOS(p).map(id => { const o = STORE.getAllOS().find(x => x.id === id); return o ? `O.S. ${esc(o.numero)}` : 'O.S. fora do recorte'; }).join(' · ')}</p>`).join('')}
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
function opcoesOSPlantao(plantao, candidatas, porId) {
  const jaLigadas = plantaoComOS(plantao);
  const vistos = new Set();
  const TETO = 300;
  const item = (o, marcada, fechada) => {
    vistos.add(o.id);
    const prazo = OPERACAO.prazo(o);
    const detalhe = fechada ? 'já finalizada' : (prazo ? 'prazo ' + prazo.slice(8, 10) + '/' + prazo.slice(5, 7) : 'sem prazo');
    const busca = `${o.numero || ''} ${o.cliente || ''}`.toLowerCase();
    return `<label class="os-pick-item${marcada ? ' on' : ''}" data-busca="${esc(busca)}">
      <input type="checkbox" name="osIds" value="${esc(o.id)}" ${marcada ? 'checked' : ''}>
      <span class="os-pick-num">${esc(o.numero || '—')}</span>
      <span class="os-pick-cli">${esc((o.cliente || '').slice(0, 44))}</span>
      <span class="os-pick-det">${esc(detalhe)}</span>
    </label>`;
  };
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
    <p class="text-muted os-pick-nota"><span class="os-pick-conta">${jaLigadas.length}</span> marcada${jaLigadas.length === 1 ? '' : 's'}${cortadas ? ` · as ${TETO} mais próximas do prazo (${cortadas} fora da lista — use a busca)` : ''}</p>
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
  if (!STATE._plVista) STATE._plVista = 'proximos';
  const editando = STATE._plEdit ? a.plantoes.find(p => p.id === STATE._plEdit && !p.cancelado) : null;
  const vivos = a.plantoes.filter(p => !p.cancelado);
  const lista = vivos
    .filter(p => STATE._plVista === 'todos' || String(p.data) >= hoje)
    .sort((x, y) => String(x.data).localeCompare(String(y.data)) || String(x.inicio).localeCompare(String(y.inicio)));
  // Agrupado por mês: a escala se lê por bloco, não por linha solta.
  const porMes = new Map();
  for (const p of lista) {
    const k = String(p.data).slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(p);
  }
  const contagem = { diarista: 0, sobreaviso: 0, folga: 0 };
  for (const p of vivos.filter(p => String(p.data).slice(0, 7) === hoje.slice(0, 7))) if (contagem[p.tipo] != null) contagem[p.tipo]++;
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
        <div><h2>Plantões</h2><p>Escala da casa: diarista, sobreaviso e folga. Entra a empresa toda — a lista de gente vem do RH. Não entra na Performance e não aparece no RH.</p></div>
        <span class="casa-vista">
          <button class="btn-ghost btn-sm ${STATE._plVista === 'proximos' ? 'active' : ''}" data-pl-vista="proximos">De hoje em diante</button>
          <button class="btn-ghost btn-sm ${STATE._plVista === 'todos' ? 'active' : ''}" data-pl-vista="todos">Tudo</button>
        </span>
      </div>
      <div class="casa-kpi-cards">
        <div class="casa-kpi"><b>${doDia.length}</b><small>plantão hoje${doDia.length ? ' · ' + esc(doDia.map(p => (fichaDoApelido(p.quem) || { nome: p.quem }).nome.split(' ')[0]).join(', ') ) : ''}</small></div>
        <div class="casa-kpi"><b>${contagem.diarista}</b><small>diaristas no mês</small></div>
        <div class="casa-kpi"><b>${contagem.sobreaviso}</b><small>sobreavisos no mês</small></div>
        <div class="casa-kpi"><b>${contagem.folga}</b><small>folgas no mês</small></div>
      </div>
      ${quadroCasa('pl-form', editando ? '✏️ Editando plantão' : '➕ Registrar plantão', `
        <form id="pl-form" class="casa-form-grade">
          <input type="hidden" name="id" value="${esc(editando ? editando.id : '')}">
          <label>Data <input name="data" type="date" required value="${esc(f.data)}"></label>
          <label class="larga">Tipo
            <span class="casa-radio-chips">${Object.entries(TIPOS_PLANTAO).map(([k, v]) =>
              `<label class="casa-radio-chip ${f.tipo === k ? 'on' : ''}"><input type="radio" name="tipo" value="${k}" ${f.tipo === k ? 'checked' : ''}><span class="casa-pill ${k}">${esc(v)}</span></label>`
            ).join('')}</span></label>
          <label>Quem <select name="quem" required><option value="">— escolher —</option>${optionsEquipeCasa(f.quem)}</select></label>
          <label>Início <input name="inicio" type="time" value="${esc(f.inicio)}" required></label>
          <label>Fim <input name="fim" type="time" value="${esc(f.fim)}" required></label>
          <label class="larga">Título <input name="titulo" required placeholder="Plantão de sábado" value="${esc(f.titulo)}"></label>
          <label class="larga">Observação <input name="obs" placeholder="opcional" value="${esc(f.obs)}"></label>
          <label class="larga">O.S deste plantão
            ${opcoesOSPlantao(f, candidatas, porId)}
            <small class="text-muted">Toque para marcar. Vincular aqui não programa a O.S — só anota o que este plantão atende.</small></label>
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
            STATE._plVista === 'proximos' ? 'Nenhum plantão daqui para a frente' : 'Nenhum plantão registrado',
            /* O VAZIO CONTA O QUE EXISTE FORA DO FILTRO. "Nada aqui" quando há
               40 plantões no passado é a tela escondendo o próprio recorte. */
            (STATE._plVista === 'proximos' && vivos.length)
              ? `Há ${vivos.length} plantã${vivos.length === 1 ? 'o registrado' : 'os registrados'} antes de hoje. <button class="btn-ghost btn-sm" data-pl-vista="todos">Ver todos</button>`
              : 'A escala é registrada aqui mesmo, no formulário acima — o RH não manda plantão para o PCP.')}
    </div>`;
  wireQuadrosCasa(el);
  el.querySelectorAll('[data-pl-vista]').forEach(b => b.onclick = () => { STATE._plVista = b.dataset.plVista; renderPlantoesCasa(); });
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
    if (busca) {
      const vazio = box.querySelector('.os-pick-vazio');
      busca.oninput = () => {
        const q = busca.value.trim().toLowerCase();
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
    for (const i of itens) {
      i.querySelector('input').onchange = e => {
        i.classList.toggle('on', e.target.checked);
        atualizarConta();
      };
    }
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
  const escalados = [...new Set(lista.flatMap(o => OPERACAO.equipe(o)))];
  const valorDia = somaValores(lista);

  const linha = os => {
    const st = OPERACAO.status(os);
    const veic = typeof rotuloVeiculoMsg === 'function' ? rotuloVeiculoMsg(os.veiculo) : { emoji: '🚗', texto: os.veiculo || '' };
    return `<tr data-os-id="${esc(os.id)}" class="${os.retrabalho ? 'st-retrabalho' : ''}">
      <td class="num"><strong>${esc(typeof rotuloHora === 'function' ? rotuloHora(os) : '')}</strong></td>
      <td><strong>${esc(os.numero || '—')}</strong><small class="bloco">${esc(os.servico || '')}</small></td>
      <td>${esc(os.cliente || '')}<small class="bloco">${esc(os.endereco || '')}</small></td>
      <td>${esc(OPERACAO.equipe(os).map(n => { const p = fichaDoApelido(n); return p ? rotuloCurtoRH(p) : n; }).join(', ') || '—')}</td>
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
        <input type="date" id="gr-data" value="${esc(dia)}">
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
          <div class="casa-kpi"><b>${new Set(lista.map(o => o.veiculo).filter(Boolean)).size}</b><small>veículos programados</small></div>
          <div class="casa-kpi ${valorDia.semValor ? 'alerta' : ''}"><b>${dinheiroCasa(valorDia.total)}</b><small>valor programado${valorDia.semValor ? ` · ${valorDia.semValor} sem valor` : ''}</small></div>
        </div>
        ${conflitos.length ? `<p class="metricas-nota alerta-ausencia">⚠️ ${conflitos.length} possível conflito: ${esc(conflitos.map(c => [...c.equipe, c.veiculo].filter(Boolean).join(', ')).join(' · '))} em mais de uma O.S no mesmo turno.</p>` : ''}
        ${avisoAusenciaCasa(escalados, dia)}
        ${plDia.length ? `<p class="metricas-nota">Plantão hoje: ${plDia.map(p => `${pillPlantao(p)} ${esc(p.quem)} (${esc(p.inicio)}–${esc(p.fim)})`).join(' · ')}</p>` : ''}
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
    if (!diasCasa(os).includes(hoje) || OPERACAO.encerradaERP(os)) continue;
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
        ${oss.length ? `<small class="eq-os">🚚 na rua: ${oss.map(o => 'O.S ' + esc(o.numero || '—')).join(', ')}</small>` : ''}
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
  const naRua = presentes.filter(p => (escalados.get(p.chave) || []).length).length;
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
          <div class="casa-kpi"><b>${naRua}</b><small>escalados na rua hoje</small></div>
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
