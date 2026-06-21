// app.js — Página de gestão (PCP, Montagem, Operação, Comercial)
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSÕES POR PAPEL (identificação, não segurança)
   ══════════════════════════════════════════════════════════════════════════ */
const PERMISSOES_PADRAO = {
  admin:     { abas: '*', editar: true,  cadastrar: true  },
  pcp:       { abas: ['painel','pcp','programacao','execucao','retrabalho','finalizados','controle'], editar: true, cadastrar: false },
  montagem:  { abas: ['painel','pcp','programacao','execucao','retrabalho','finalizados'], editar: true, cadastrar: false },
  operacao:  { abas: ['painel','pcp','programacao','execucao','retrabalho','finalizados'], editar: true, cadastrar: false },
  comercial: { abas: ['painel','pcp','programacao','finalizados'], editar: false, cadastrar: false }
};

// Permissões efetivas = padrão sobrescrito pelos níveis configurados pelo admin (CFG.niveis)
function getPermissoes() {
  const niveis = (STORE.getCFG().niveis) || {};
  const out = {};
  Object.keys(PERMISSOES_PADRAO).forEach(papel => {
    out[papel] = Object.assign({}, PERMISSOES_PADRAO[papel], niveis[papel] || {});
  });
  return out;
}

const SENHAS = { admin: 'admin', comercial: 'comercial', pcp: '', montagem: '', operacao: '' };
const ABAS_DISPONIVEIS = ['painel','pcp','programacao','execucao','retrabalho','finalizados','controle'];

/* ══════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS
   ══════════════════════════════════════════════════════════════════════════ */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function nowISO() { return new Date().toISOString(); }

// Parse local de YYYY-MM-DD (evita o bug de fuso "volta 1 dia")
function parseLocalDate(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
}

function ymdLocal(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// "Seg 29/06 · Tarde (14:00)"
function fmtInstalacao(inst) {
  if (!inst || !inst.data) return 'Sem data';
  const d = parseLocalDate(inst.data);
  if (!d) return 'Sem data';
  const diaSem = DIAS_SEMANA[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  let txt = `${diaSem} ${dd}/${mm}`;
  if (inst.periodo) {
    txt += ` · ${inst.periodo}`;
    if (inst.periodo === 'Horário' && inst.hora) txt += ` (${inst.hora})`;
  }
  if (inst.duracaoDias && inst.duracaoDias > 1) txt += ` · ${inst.duracaoDias} dias`;
  return txt;
}

function brMoney(n) {
  const v = Number(n) || 0;
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte número BR "1.234,56" → 1234.56
function parseBRNumber(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  let s = String(str).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toast(msg, type = '') {
  const c = $('#toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ══════════════════════════════════════════════════════════════════════════
   STATUS DERIVADO
   ══════════════════════════════════════════════════════════════════════════ */
function calcStatus(os) {
  if (!os) return 'aguardando_producao';
  if (os.finalizadaEm) return 'finalizada';
  if (os.horaSaida) return 'em_andamento';
  if (os.confirmacao === 'Confirmado') return 'confirmada';
  if (os.instalacao && os.instalacao.data && os.instalacao.periodo && (os.equipe || []).length) return 'agendada';
  if (os.liberadoPCP) return 'apto';
  return 'aguardando_producao';
}

const STATUS_LABEL = {
  aguardando_producao: 'Aguardando produção',
  apto:                'Apto',
  agendada:            'Agendada',
  confirmada:          'Confirmada',
  em_andamento:        'Em andamento',
  finalizada:          'Finalizada'
};

// Atrasada: agendada para data passada e ainda não finalizada.
function estaAtrasada(os) {
  if (!os || os.finalizadaEm) return false;
  const d = os.instalacao && os.instalacao.data;
  if (!d) return false;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return new Date(d + 'T00:00:00') < hoje;
}

// Camada de cor semântica vermelha (alerta) sobre o status normal:
// vermelho = retrabalho ou atrasada. Devolve classe extra (ou vazio).
function alertaOS(os) {
  if (!os || os.finalizadaEm) return '';
  if (os.retrabalho) return 'alerta-retrab';
  if (estaAtrasada(os)) return 'alerta-atraso';
  return '';
}

/* ══════════════════════════════════════════════════════════════════════════
   CHECKLIST DE PRONTIDÃO
   ══════════════════════════════════════════════════════════════════════════ */
function checklist(os) {
  const inst = os.instalacao || {};
  return [
    { k: 'pcp',     label: 'PCP liberou',        ok: !!os.liberadoPCP },
    { k: 'itens',   label: 'Itens definidos',    ok: (os.itens || []).length >= 1 },
    { k: 'agenda',  label: 'Agendada',           ok: !!(inst.data && inst.periodo && (os.equipe || []).length) },
    { k: 'conf',    label: 'Cliente confirmado', ok: os.confirmacao === 'Confirmado', warn: os.confirmacao !== 'Confirmado' },
    { k: 'carro',   label: 'Carro liberado',     ok: !!os.carroLiberado },
    { k: 'exec',    label: 'Execução + fotos',   ok: !!(os.instalacaoOK && os.conferidoPor && (os.fotosCheckinIds || []).length) }
  ];
}

// Conclusão de cada bloco do modal (para colorir de verde quando completo)
function blocosCompletos(os) {
  const inst = os.instalacao || {};
  const itens = os.itens || [];
  return {
    pcp:    !!(os.numero && os.cliente && os.responsavelPCP && os.liberadoPCP),
    itens:  itens.length >= 1 && itens.every(i => i.pronto),
    agenda: !!(inst.data && inst.periodo && (os.equipe || []).length && os.confirmacao === 'Confirmado'),
    exec:   !!(os.finalizadaEm || (os.instalacaoOK && os.conferidoPor && (os.fotosCheckinIds || []).length))
  };
}

// % de preenchimento da ficha da O.S
function fichaPercent(os) {
  const inst = os.instalacao || {};
  const checks = [
    os.numero, os.cliente, os.contato, os.whatsapp, os.cnpjCpf, os.endereco,
    os.servico, os.responsavelPCP, os.dataEntrada, os.liberadoPCP,
    (os.itens || []).length, os.acesso, os.fixacao, (os.ferramentas || []).length,
    inst.data, inst.periodo, (os.equipe || []).length, os.veiculo,
    os.confirmacao === 'Confirmado', (os.embarqueConferidoPor || os.produtosConferidosPor),
    os.kmSaida, os.kmRetorno,
    os.instalacaoOK, os.conferidoPor, (os.fotosCheckinIds || []).length
  ];
  const done = checks.filter(Boolean).length;
  return Math.round(done / checks.length * 100);
}

// Lista combinada de pessoas (instaladores + responsáveis + gerentes) para <select>
function peopleList(cfg) {
  const c = cfg || STORE.getCFG();
  const set = [];
  [].concat(c.gerentes_montagem || [], c.responsaveis || [], c.instaladores || [])
    .forEach(p => { if (p && !set.includes(p)) set.push(p); });
  return set;
}
function peopleOptions(cfg, selected) {
  const list = peopleList(cfg);
  let html = list.map(p => `<option ${selected === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
  if (selected && !list.includes(selected)) html += `<option selected>${esc(selected)}</option>`;
  return html;
}

/* ══════════════════════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════════════════════════════ */
const STATE = {
  user: null,           // {nome, papel}
  activeTab: 'painel',
  calRef: new Date(),   // mês de referência do calendário
  calView: 'cal',       // 'cal' | 'lista'
  selectedDay: null,    // YYYY-MM-DD
  modalOSId: null,
  painelModo: 'dia',
  filtroBusca: ''
};

/* ══════════════════════════════════════════════════════════════════════════
   LOGIN
   ══════════════════════════════════════════════════════════════════════════ */
function initLogin() {
  const sel = $('#login-user');
  const cfg = STORE.getCFG();
  const opts = [
    { nome: 'Admin',     papel: 'admin'    },
    { nome: 'PCP',       papel: 'pcp'      },
    { nome: 'Montagem',  papel: 'montagem' },
    { nome: 'Operação',  papel: 'operacao' },
    { nome: 'Comercial', papel: 'comercial'}
  ];
  // Acrescenta usuários cadastrados
  (cfg.usuarios || []).forEach(u => {
    if (!opts.find(o => o.papel === u.papel && o.nome === u.nome)) opts.push(u);
  });
  sel.innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.nome)} (${esc(o.papel)})</option>`).join('');
  sel._opts = opts;

  $('#login-btn').onclick = doLogin;
  $('#login-pass').onkeydown = e => { if (e.key === 'Enter') doLogin(); };

  // Auto-login se já tinha sessão
  const saved = STORE.getUser();
  if (saved) { STATE.user = saved; enterApp(); }
}

function doLogin() {
  const sel = $('#login-user');
  const opt = sel._opts[+sel.value];
  const pass = $('#login-pass').value;
  const err = $('#login-error');

  // Senha do papel (admin/comercial exigem; demais livres)
  const cfgUser = (STORE.getCFG().usuarios || []).find(u => u.nome === opt.nome && u.papel === opt.papel);
  const expected = cfgUser && cfgUser.senha != null ? cfgUser.senha : (SENHAS[opt.papel] || '');

  if (expected && pass !== expected) {
    err.textContent = 'Senha incorreta.';
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  STATE.user = { nome: opt.nome, papel: opt.papel };
  STORE.setUser(STATE.user);
  enterApp();
}

function enterApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-badge').textContent = STATE.user.nome;
  const logo = $('#topbar-logo');
  if (logo && typeof LOGO_IMPRESILK !== 'undefined') logo.src = LOGO_IMPRESILK;
  const dataEl = $('#topbar-date');
  if (dataEl) {
    const d = new Date();
    dataEl.textContent = `${DIAS_SEMANA[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  aplicarPermissoes();
  initTabs();
  initTopbar();
  initSyncIndicator();
  initConflictDialog();
  initPicker();
  if (typeof iniciarFraseBar === 'function') iniciarFraseBar();

  // Pull inicial + CFG, depois render
  STORE.pullCFG();
  STORE.pull(() => renderActiveTab());
  STORE.trySync();
  renderActiveTab();

  // Pull periódico a cada 30s
  setInterval(() => { STORE.pull(() => renderActiveTab()); STORE.trySync(); }, 30000);
}

function aplicarPermissoes() {
  const PERM = getPermissoes();
  const perm = PERM[STATE.user.papel] || PERM.comercial;
  document.body.classList.toggle('somente-leitura', !perm.editar);
  document.body.classList.toggle('nao-admin', STATE.user.papel !== 'admin');

  $$('.tab').forEach(t => {
    const tab = t.dataset.tab;
    const allowed = perm.abas === '*' || perm.abas.includes(tab);
    t.classList.toggle('hidden', !allowed);
  });
}

function podeEditar() {
  const PERM = getPermissoes();
  const perm = PERM[STATE.user.papel] || PERM.comercial;
  return !!perm.editar;
}
function podeCadastrar() {
  const PERM = getPermissoes();
  const perm = PERM[STATE.user.papel] || PERM.comercial;
  return !!perm.cadastrar;
}

/* ══════════════════════════════════════════════════════════════════════════
   TABS / TOPBAR / SYNC / CONFLITO
   ══════════════════════════════════════════════════════════════════════════ */
function initTabs() {
  $$('.tab').forEach(t => {
    t.onclick = () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      $$('.tab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $(`#panel-${tab}`).classList.add('active');
      STATE.activeTab = tab;
      STORE.pull(() => renderActiveTab());
      renderActiveTab();
    };
  });
}

function initTopbar() {
  const novaBtn = $('#btn-nova-os');
  const pdfBtn  = $('#btn-import-pdf');
  if (novaBtn) novaBtn.onclick = () => openModal(novaOS());
  if (pdfBtn)  pdfBtn.onclick  = importarPDF;
  const espBtn = $('#btn-espelhos');
  if (espBtn) espBtn.onclick = abrirEspelhos;
  const instrBtn = $('#btn-instrucoes');
  if (instrBtn) instrBtn.onclick = abrirInstrucoes;
  $('#btn-logout').onclick = () => {
    STORE.setUser(null);
    location.reload();
  };
}

function initSyncIndicator() {
  const el = $('#sync-indicator');
  // Tocar mostra a legenda (no celular o "title" não aparece).
  el.style.cursor = 'pointer';
  el.onclick = () => { if (el.title) toast(el.title); };
  STORE.onSync((status, pending) => {
    el.className = 'sync-indicator ' + status;
    if (status === 'ok') {
      el.textContent = '✅ Sincronizado';
      el.title = 'Tudo salvo na nuvem.';
    } else if (status === 'pending') {
      el.textContent = `⏳ ${pending} pendente${pending === 1 ? '' : 's'}`;
      el.title = `${pending} alteração(ões) aguardando envio. Some sozinho quando reconectar.`;
    } else {
      el.textContent = '⚠️ Offline';
      el.title = 'Sem conexão — você pode continuar trabalhando; o envio acontece ao reconectar.';
    }
  });
  STORE.on('quota', () => toast('Armazenamento local cheio — limpe fotos antigas', 'error'));
}

function initConflictDialog() {
  STORE.onConflict((local, remote) => {
    const dlg = $('#conflict-dialog');
    $('#conflict-msg').textContent = `Esta O.S (${remote.numero || remote.id}) foi alterada em outro aparelho.`;
    dlg.classList.remove('hidden');
    $('#conflict-reload').onclick = () => {
      STORE.aceitarServidor(remote);
      dlg.classList.add('hidden');
      if (STATE.modalOSId === remote.id) openModal(STORE.getOS(remote.id));
      renderActiveTab();
      toast('O.S recarregada do servidor', 'success');
    };
    $('#conflict-overwrite').onclick = () => {
      STORE.sobrescreverServidor(local);
      dlg.classList.add('hidden');
      toast('Sua versão foi enviada', 'success');
    };
  });
}

function renderActiveTab() {
  switch (STATE.activeTab) {
    case 'painel':      renderPainel(); break;
    case 'pcp':         renderPCP(); break;
    case 'programacao': renderProgramacao(); break;
    case 'execucao':    renderExecucao(); break;
    case 'retrabalho':  renderRetrabalho(); break;
    case 'finalizados': renderFinalizados(); break;
    case 'controle':    renderControle(); break;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   NOVA O.S
   ══════════════════════════════════════════════════════════════════════════ */
function novaOS() {
  return {
    id: STORE.uuid(),
    numero: '',
    criadoEm: nowISO(),
    criadoPor: STATE.user.nome,
    atualizadoEm: nowISO(),
    atualizadoPor: STATE.user.nome,
    cliente: '', contato: '', whatsapp: '', cnpjCpf: '', endereco: '',
    servico: '', vendedor: '', dataEntrada: '',
    responsavelPCP: '', obsPCP: '', layoutFotoId: '', liberadoPCP: false, aptoPor: '', aptoEm: '',
    acesso: '', fixacao: '', ferramentas: [], suprimentos: [], itens: [],
    instalacao: { data: '', periodo: '', hora: '', duracaoDias: 1 },
    equipe: [], veiculo: '', responsavelAgenda: [], obsAgenda: '',
    confirmacao: '', confCanal: '', confHora: '', confPor: '', confObs: '',
    confAcompanha: '', confAcompanhaContato: '',
    embarqueConferidoPor: '', produtosConferidosPor: '',
    ferramentasConferidas: false, ferramentasConferidasPor: '', fotoEmbarqueId: '',
    carroLiberado: false, carroLiberadoPor: '', carroLiberadoEm: '',
    horaSaida: '', horaRetorno: '', kmSaida: '', kmRetorno: '', instalacaoOK: false, conferidoPor: '',
    retrabalho: false, problema: '', causa: '', resolvidoPor: '', dataResolvido: '',
    obsTecnicas: '', fotosCheckinIds: [], checkinGPS: null,
    checkout: { situacao: '', hora: '', por: '', obs: '', confirmado: false },
    finalizadaEm: '', finalizadoPor: ''
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   MODAL DA O.S — 4 BLOCOS
   ══════════════════════════════════════════════════════════════════════════ */
const ACESSO_OPTS  = ['No baixo', 'Escada', 'Andaime', 'Plataforma elevatória', 'Outro'];
const FIXACAO_OPTS = ['Parafuso', 'Fita Hellerman', 'Fita dupla face', 'Cola', 'Rebite', 'Outro'];
const PERIODO_OPTS = ['Manhã', 'Tarde', 'Dia inteiro', 'Horário'];
const CONF_OPTS    = ['', 'Confirmado', 'Pendente', 'Recusado'];

let _modalDraft = null;   // cópia de trabalho da O.S
let _modalDirty = false;
let _modalPrevPct = 0;    // % de preenchimento ao abrir (para celebrar ao chegar a 100%)

function openModal(os) {
  _modalDraft = JSON.parse(JSON.stringify(os));
  _modalDirty = false;
  _modalPrevPct = fichaPercent(_modalDraft);
  STATE.modalOSId = os.id;
  renderModal();
  $('#modal-overlay').classList.remove('hidden');
}

function closeModal() {
  if (_modalDirty) saveDraft();
  $('#modal-overlay').classList.add('hidden');
  STATE.modalOSId = null;
  _modalDraft = null;
  renderActiveTab();
}

function markDirty() { _modalDirty = true; }

// Autosave: grava draft no store
function saveDraft() {
  if (!_modalDraft) return;
  _modalDraft.atualizadoEm = nowISO();
  _modalDraft.atualizadoPor = STATE.user.nome;
  STORE.saveOS(_modalDraft);
  _modalDirty = false;

  // Motivação ao PCP: parabeniza quando o preenchimento chega a 100%.
  const pct = fichaPercent(_modalDraft);
  if (pct >= 100 && _modalPrevPct < 100 && typeof mostrarCelebracao === 'function') {
    mostrarCelebracao({
      emoji: '🏆',
      titulo: 'Ficha 100% preenchida!',
      frase: fraseAleatoria(),
    });
  }
  _modalPrevPct = pct;
}

// Atualiza um campo do draft (caminho com pontos)
function setField(path, value) {
  const parts = path.split('.');
  let obj = _modalDraft;
  for (let i = 0; i < parts.length - 1; i++) {
    if (obj[parts[i]] == null) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  markDirty();
}

function renderModal() {
  const os = _modalDraft;
  const st = calcStatus(os);
  const ro = !podeEditar();
  const chk = checklist(os);

  const checklistBar = chk.map(c => {
    const cls = c.ok ? 'ok' : (c.warn ? 'warn' : 'nok');
    const icon = c.ok ? '✓' : (c.warn ? '⚠' : '⬜');
    return `<span class="check-item ${cls}">${icon} ${esc(c.label)}</span>`;
  }).join('');

  const done = blocosCompletos(os);
  const pct = fichaPercent(os);

  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">O.S ${esc(os.numero || '(nova)')}</div>
        <div class="modal-meta">Atualizado por ${esc(os.atualizadoPor || '—')}${os.atualizadoEm ? ' · ' + new Date(os.atualizadoEm).toLocaleString('pt-BR') : ''}</div>
      </div>
      <span class="modal-status badge st-${st}">${STATUS_LABEL[st]}</span>
      <button class="modal-close" id="modal-close-btn">×</button>
    </div>

    <div class="ficha-pct">
      <div class="ficha-pct-bar"><div class="ficha-pct-fill" style="width:${pct}%"></div></div>
      <span class="ficha-pct-num">${pct}% preenchida</span>
    </div>

    <div class="checklist-bar">${checklistBar}</div>

    ${blocoPCP(os, ro, done.pcp)}
    ${blocoItens(os, ro, done.itens)}
    ${blocoAgenda(os, ro, done.agenda)}
    ${blocoExec(os, ro, done.exec)}

    <div class="fs-body" style="padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-ghost btn-sm" id="modal-pdf">🖨 PDF da ficha</button>
      <button class="btn-ghost btn-sm" id="modal-wpp">💬 WhatsApp</button>
      <button class="btn-danger btn-sm edit-only" id="modal-delete">🗑 Excluir O.S</button>
      <button class="btn-primary btn-sm" id="modal-save" style="margin-left:auto">Salvar e fechar</button>
    </div>
  `;

  bindModalEvents(os, ro);
}

/* ── Bloco 1: PCP & Cliente ──────────────────────────────────────────────── */
function blocoPCP(os, ro, done) {
  const lib = os.liberadoPCP;
  const cfg = STORE.getCFG();
  const respOpts = (cfg.responsaveis || []).map(r => `<option ${os.responsavelPCP === r ? 'selected' : ''}>${esc(r)}</option>`).join('');
  // se o valor atual não está na lista (ex.: importado), mantém como opção
  const respExtra = os.responsavelPCP && !(cfg.responsaveis || []).includes(os.responsavelPCP)
    ? `<option selected>${esc(os.responsavelPCP)}</option>` : '';
  return `
  <details class="card-fs ${done ? 'done' : ''}" open data-bloco="pcp">
    <summary>1 · PCP &amp; Cliente ${done ? '<span class="sum-check">✓ completo</span>' : ''}</summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Nº O.S</label><input data-f="numero" value="${esc(os.numero)}"></div>
        <div class="field"><label>Serviço (Ref.)</label><input data-f="servico" list="dl-servicos" value="${esc(os.servico)}" placeholder="tipo de instalação">
          <datalist id="dl-servicos">${tiposServicoHist().map(s=>`<option value="${esc(s)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field"><label>Cliente</label><input data-f="cliente" value="${esc(os.cliente)}"></div>
      <div class="field-row">
        <div class="field"><label>Contato</label><input data-f="contato" value="${esc(os.contato)}"></div>
        <div class="field"><label>WhatsApp</label><input data-f="whatsapp" value="${esc(os.whatsapp)}">
          ${os.whatsapp ? `<a class="inline-link" target="_blank" href="https://wa.me/55${esc(String(os.whatsapp).replace(/\D/g,''))}">Abrir Zap ↗</a>` : ''}
        </div>
      </div>
      <div class="field"><label>CNPJ/CPF</label><input data-f="cnpjCpf" value="${esc(os.cnpjCpf)}"></div>
      <div class="field"><label>Endereço</label><input data-f="endereco" value="${esc(os.endereco)}">
        ${os.endereco ? `<a class="inline-link" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco)}">Ver no Mapa ↗</a>` : ''}
      </div>
      <div class="field-row3">
        <div class="field"><label>Data entrada</label><input type="date" data-f="dataEntrada" value="${esc(os.dataEntrada)}"></div>
        <div class="field"><label>Responsável PCP *</label>
          <select data-f="responsavelPCP"><option value="">— selecionar —</option>${respOpts}${respExtra}</select>
        </div>
        <div class="field"><label>Vendedor</label><input data-f="vendedor" value="${esc(os.vendedor)}"></div>
      </div>
      <div class="field"><label>Observação (PCP)</label><textarea data-f="obsPCP">${esc(os.obsPCP)}</textarea></div>
      <div class="field">
        <label>Layout (JPG)</label>
        <div class="foto-box" data-foto-single="layoutFotoId">
          ${os.layoutFotoId ? `<img data-foto-img="${esc(os.layoutFotoId)}" alt="layout">` : '<span class="foto-hint">📎 Toque para anexar layout</span>'}
          <input type="file" accept="image/*" data-foto-input="layoutFotoId" ${ro ? 'disabled' : ''}>
        </div>
      </div>
      <div class="edit-only">
        ${lib
          ? `<div class="liberar-status">✓ Liberado para instalação por ${esc(os.aptoPor || '—')}${os.aptoEm ? ' · ' + new Date(os.aptoEm).toLocaleDateString('pt-BR') : ''}
               <button class="btn-xs btn-ghost" id="btn-cancelar-liberar" style="margin-left:auto">Cancelar</button></div>`
          : `<button class="btn-liberar" id="btn-liberar">✓ Liberar para instalação</button>`}
      </div>
    </div>
  </details>`;
}

/* ── Bloco 2: Serviço & Itens ────────────────────────────────────────────── */
function blocoItens(os, ro, done) {
  const cfg = STORE.getCFG();
  const itens = os.itens || [];
  const prontos = itens.filter(i => i.pronto).length;

  const acessoOpts = ACESSO_OPTS.map(o => `<option ${os.acesso === o ? 'selected' : ''}>${o}</option>`).join('');
  const fixOpts    = FIXACAO_OPTS.map(o => `<option ${os.fixacao === o ? 'selected' : ''}>${o}</option>`).join('');

  const rows = itens.map((it, i) => `
    <tr data-item-row="${i}">
      <td><input data-item="${i}.item" value="${esc(it.item)}" style="width:48px"></td>
      <td><input data-item="${i}.descricao" value="${esc(it.descricao)}"></td>
      <td><input data-item="${i}.medidas" value="${esc(it.medidas)}" style="width:80px"></td>
      <td><input data-item="${i}.qtde" value="${esc(it.qtde)}" style="width:48px"></td>
      <td><input data-item="${i}.valorUnit" value="${esc(it.valorUnit)}" style="width:80px"></td>
      <td class="pronto-check"><input type="checkbox" data-item-pronto="${i}" ${it.pronto ? 'checked' : ''}></td>
      <td><button class="btn-xs btn-danger edit-only" data-item-del="${i}">×</button></td>
    </tr>`).join('');

  return `
  <details class="card-fs ${done ? 'done' : ''}" data-bloco="itens">
    <summary>2 · Serviço &amp; Itens ${done ? '<span class="sum-check">✓</span>' : ''}<span class="item-progress" style="margin-left:auto">${prontos}/${itens.length} prontos</span></summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Acesso</label><select data-f="acesso"><option value=""></option>${acessoOpts}</select></div>
        <div class="field"><label>Fixação</label><select data-f="fixacao"><option value=""></option>${fixOpts}</select></div>
      </div>
      <div class="field">
        <label>Ferramentas</label>
        ${chipsField('ferramentas', os.ferramentas || [], cfg.ferramentas, ro)}
      </div>
      <div class="field">
        <label>Suprimentos (ex.: álcool, flanela)</label>
        ${chipsField('suprimentos', os.suprimentos || [], cfg.suprimentos, ro)}
      </div>
      <table class="items-table">
        <thead><tr><th>Item</th><th>Descrição</th><th>Medidas</th><th>Qtde</th><th>V.Unit</th><th>OK</th><th></th></tr></thead>
        <tbody id="itens-tbody">${rows || '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:12px">Nenhum item</td></tr>'}</tbody>
      </table>
      <div class="flex gap-8 edit-only">
        <button class="btn-ghost btn-sm" id="btn-add-item">+ Item manual</button>
        <button class="btn-ghost btn-sm" id="btn-import-itens">📄 Importar itens do PDF</button>
      </div>
    </div>
  </details>`;
}

/* ── Bloco 3: Agendamento & Confirmação ──────────────────────────────────── */
function blocoAgenda(os, ro, done) {
  const cfg = STORE.getCFG();
  const inst = os.instalacao || {};
  const periodoOpts = PERIODO_OPTS.map(o => `<option ${inst.periodo === o ? 'selected' : ''}>${o}</option>`).join('');
  const confClass = os.confirmacao === 'Confirmado' ? 'confirmado'
    : os.confirmacao === 'Pendente' ? 'pendente'
    : os.confirmacao === 'Recusado' ? 'recusado' : 'nenhum';
  const confOpts = CONF_OPTS.map(o => `<option value="${o}" ${os.confirmacao === o ? 'selected' : ''}>${o || '— selecionar —'}</option>`).join('');

  return `
  <details class="card-fs ${done ? 'done' : ''}" data-bloco="agenda">
    <summary>3 · Agendamento &amp; Confirmação ${done ? '<span class="sum-check">✓ completo</span>' : ''}</summary>
    <div class="fs-body">
      <div class="field-row3">
        <div class="field"><label>Data instalação</label><input type="date" data-f="instalacao.data" value="${esc(inst.data)}"></div>
        <div class="field"><label>Período *</label><select data-f="instalacao.periodo"><option value=""></option>${periodoOpts}</select></div>
        <div class="field"><label>Hora (se "Horário")</label><input type="time" data-f="instalacao.hora" value="${esc(inst.hora)}"></div>
      </div>
      <div class="field-row3">
        <div class="field"><label>Duração (dias)</label><input type="number" min="1" data-f="instalacao.duracaoDias" value="${esc(inst.duracaoDias || 1)}"></div>
        <div class="field"><label>Responsável pelo agendamento</label>${chipsField('responsavelAgenda', os.responsavelAgenda || [], cfg.responsaveis, ro)}</div>
        <div class="field"><label>Veículo</label>
          <select data-f="veiculo"><option value=""></option>${(cfg.veiculos||[]).map(v=>`<option ${os.veiculo===v?'selected':''}>${esc(v)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field">
        <label>Equipe</label>
        ${chipsField('equipe', os.equipe || [], cfg.instaladores, ro)}
      </div>
      <div class="field"><label>Obs agenda</label><textarea data-f="obsAgenda">${esc(os.obsAgenda)}</textarea></div>

      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <div class="flex gap-8" style="align-items:center;margin-bottom:8px">
          <strong style="font-size:.85rem">Confirmação com o cliente</strong>
          <span class="conf-badge ${confClass}">${os.confirmacao || 'Não confirmado'}</span>
        </div>
        <div class="field-row3">
          <div class="field"><label>Situação</label><select data-f="confirmacao">${confOpts}</select></div>
          <div class="field"><label>Canal</label><input data-f="confCanal" value="${esc(os.confCanal)}" placeholder="WhatsApp/Telefone"></div>
          <div class="field"><label>Hora</label><input type="time" data-f="confHora" value="${esc(os.confHora)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Confirmado por</label><input data-f="confPor" value="${esc(os.confPor)}"></div>
          <div class="field"><label>Obs</label><input data-f="confObs" value="${esc(os.confObs)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Quem do cliente acompanha</label><input data-f="confAcompanha" value="${esc(os.confAcompanha)}"></div>
          <div class="field"><label>Contato do acompanhante</label><input data-f="confAcompanhaContato" value="${esc(os.confAcompanhaContato)}"></div>
        </div>
        <button class="btn-success btn-sm edit-only mt-8" id="btn-confirmei">✓ Confirmei agora</button>
      </div>
    </div>
  </details>`;
}

/* ── Bloco 4: Embarque & Execução ────────────────────────────────────────── */
function blocoExec(os, ro, done) {
  const cfg = STORE.getCFG();
  const confirmado = os.confirmacao === 'Confirmado';
  const fotos = (os.fotosCheckinIds || []);
  const causaOpts = (cfg.causas_retrabalho || []).map(c => `<option ${os.causa === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const co = os.checkout || {};
  const SIT_OPTS = ['Finalizado', 'Retrabalho', 'Mais um dia de trabalho'];
  const sitOpts = SIT_OPTS.map(s => `<option ${co.situacao === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const sitExtra = co.situacao && !SIT_OPTS.includes(co.situacao) ? `<option selected>${esc(co.situacao)}</option>` : '';

  return `
  <details class="card-fs ${done ? 'done' : ''}" data-bloco="exec">
    <summary>4 · Embarque &amp; Execução ${done ? '<span class="sum-check">✓ completo</span>' : ''}</summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Embarque conferido por</label>
          <select data-f="embarqueConferidoPor"><option value="">— selecionar —</option>${peopleOptions(cfg, os.embarqueConferidoPor)}</select>
        </div>
        <div class="field"><label>Produtos conferidos por</label>
          <select data-f="produtosConferidosPor"><option value="">— selecionar —</option>${peopleOptions(cfg, os.produtosConferidosPor)}</select>
        </div>
      </div>
      <label class="check-toggle"><input type="checkbox" data-f-check="ferramentasConferidas" ${os.ferramentasConferidas?'checked':''}> 🧰 Ferramentas conferidas</label>
      <div class="field"><label>Ferramentas conferidas por</label>
        <input data-f="ferramentasConferidasPor" list="dl-conferentes" value="${esc(os.ferramentasConferidasPor)}" placeholder="Nome de quem conferiu">
        <datalist id="dl-conferentes">${peopleList(cfg).map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label>Foto de embarque</label>
        <div class="foto-box" data-foto-single="fotoEmbarqueId">
          ${os.fotoEmbarqueId ? `<img data-foto-img="${esc(os.fotoEmbarqueId)}" alt="embarque">` : '<span class="foto-hint">📎 Anexar foto de embarque</span>'}
          <input type="file" accept="image/*" capture="environment" data-foto-input="fotoEmbarqueId" ${ro?'disabled':''}>
        </div>
      </div>

      ${!confirmado ? `<div class="trava-msg">🔒 Confirme o horário com o cliente (POP EXI‑002) antes de liberar o carro / sair.</div>` : ''}
      <div class="edit-only">
        ${os.carroLiberado
          ? `<div class="liberar-status">🚗 Carro liberado por ${esc(os.carroLiberadoPor||'—')}${os.carroLiberadoEm?' · '+new Date(os.carroLiberadoEm).toLocaleString('pt-BR'):''}
               <button class="btn-xs btn-ghost" id="btn-cancelar-carro" style="margin-left:auto">Cancelar</button></div>`
          : `<button class="btn-primary btn-sm" id="btn-liberar-carro" ${!confirmado?'disabled style="opacity:.5"':''}>🚗 Liberar carro / Saída</button>`}
      </div>

      <div class="field-row">
        <div class="field"><label>Hora saída</label><input type="time" data-f="horaSaida" value="${esc(os.horaSaida)}"></div>
        <div class="field"><label>KM saída (embarque)</label><input type="number" inputmode="numeric" data-f="kmSaida" value="${esc(os.kmSaida)}" placeholder="km do veículo"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Hora retorno</label><input type="time" data-f="horaRetorno" value="${esc(os.horaRetorno)}"></div>
        <div class="field"><label>KM retorno (check‑out)</label><input type="number" inputmode="numeric" data-f="kmRetorno" value="${esc(os.kmRetorno)}" placeholder="km do veículo"></div>
      </div>
      <label class="check-toggle ok"><input type="checkbox" data-f-check="instalacaoOK" ${os.instalacaoOK?'checked':''}> ✅ Instalação OK</label>
      <div class="field"><label>Conferido por</label><input data-f="conferidoPor" value="${esc(os.conferidoPor)}"></div>

      <label class="check-toggle retrab"><input type="checkbox" data-f-check="retrabalho" ${os.retrabalho?'checked':''}> 🔴 Retrabalho?</label>
      <div data-retrabalho-fields style="${os.retrabalho?'':'display:none'}">
        <div class="field"><label>Problema</label><input data-f="problema" value="${esc(os.problema)}"></div>
        <div class="field-row">
          <div class="field"><label>Causa</label><select data-f="causa"><option value=""></option>${causaOpts}</select></div>
          <div class="field"><label>Quem resolveu</label><input data-f="resolvidoPor" value="${esc(os.resolvidoPor)}"></div>
        </div>
        <div class="field"><label>Data resolvido</label><input type="date" data-f="dataResolvido" value="${esc(os.dataResolvido)}"></div>
      </div>

      <div class="field"><label>Obs técnicas</label><textarea data-f="obsTecnicas">${esc(os.obsTecnicas)}</textarea></div>

      <div class="field">
        <label>Fotos de check‑in (≥1 p/ finalizar)</label>
        <div class="fotos-grid" id="fotos-checkin">
          ${fotos.map(fid => `<div class="foto-thumb-wrap"><img class="foto-thumb" data-foto-img="${esc(fid)}" data-foto-checkin="${esc(fid)}"><button class="foto-rm edit-only" data-foto-rm="${esc(fid)}">×</button></div>`).join('')}
        </div>
        <div class="foto-box edit-only" style="margin-top:6px">
          <span class="foto-hint">📷 Adicionar foto de check‑in</span>
          <input type="file" accept="image/*" capture="environment" multiple data-foto-checkin-input ${ro?'disabled':''}>
        </div>
        ${os.checkinGPS ? `<div class="gps-tag">📍 Local confirmado no check‑in · <a href="https://maps.google.com/?q=${os.checkinGPS.lat},${os.checkinGPS.lng}" target="_blank">ver no mapa</a> (±${os.checkinGPS.precisao||'?'}m)</div>` : ''}
      </div>

      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <strong style="font-size:.85rem">Check‑out</strong>
        <div class="field-row3 mt-8">
          <div class="field"><label>Situação</label><select data-f="checkout.situacao"><option value="">— selecionar —</option>${sitOpts}${sitExtra}</select></div>
          <div class="field"><label>Hora</label><input type="time" data-f="checkout.hora" value="${esc(co.hora)}"></div>
          <div class="field"><label>Conferido por</label><input data-f="checkout.por" value="${esc(co.por)}"></div>
        </div>
        <div class="field"><label>Obs</label><input data-f="checkout.obs" value="${esc(co.obs)}"></div>
        <div class="field"><label><input type="checkbox" data-f-check="checkout.confirmado" ${co.confirmado?'checked':''}> Check‑out confirmado</label></div>
      </div>

      <div class="edit-only mt-12">
        ${os.finalizadaEm
          ? `<div class="liberar-status" style="background:#dcfce7;color:var(--green)">✓ Finalizada por ${esc(os.finalizadoPor||'—')} · ${new Date(os.finalizadaEm).toLocaleString('pt-BR')}</div>`
          : `<button class="btn-primary w-100" id="btn-finalizar">🏁 Finalizar instalação</button>`}
      </div>
    </div>
  </details>`;
}

/* ── Campo de chips (autocomplete simples) ───────────────────────────────── */
// Campo de múltipla escolha via pop-up (ferramentas, suprimentos, equipe, etc.)
function chipsField(field, values, options, ro) {
  const arr = Array.isArray(values) ? values : (values ? [values] : []);
  const chips = arr.length
    ? arr.map(v => `<span class="chip">${esc(v)}<button class="chip-rm edit-only" data-chip-rm="${field}|${esc(v)}">×</button></span>`).join('')
    : '<span class="foto-hint">Nenhum selecionado</span>';
  return `
    <div class="chips-wrap" data-chips="${field}">
      ${chips}
      ${ro ? '' : `<button type="button" class="chip-add edit-only" data-picker-open="${field}">＋ Selecionar</button>`}
    </div>`;
}

// Configuração de cada pop-up: rótulo + opções vindas do CFG.
function pickerConfig(field) {
  const cfg = STORE.getCFG();
  switch (field) {
    case 'ferramentas':       return { label: 'Ferramentas',                opcoes: cfg.ferramentas || [] };
    case 'suprimentos':       return { label: 'Suprimentos',                opcoes: cfg.suprimentos || [] };
    case 'equipe':            return { label: 'Equipe',                     opcoes: cfg.instaladores || [] };
    case 'responsavelAgenda': return { label: 'Responsável pelo agendamento', opcoes: cfg.responsaveis || [] };
    default:                  return { label: field, opcoes: [] };
  }
}

// Ordena as opções do pop-up com os mais usados da empresa no topo (histórico).
function ordenarMaisUsados(field, opcoes) {
  const freq = {};
  STORE.getAllOS().forEach(o => {
    const v = o[field];
    (Array.isArray(v) ? v : (v ? [v] : [])).forEach(x => { freq[x] = (freq[x] || 0) + 1; });
  });
  return (opcoes || []).slice().sort((a, b) => (freq[b] || 0) - (freq[a] || 0) || a.localeCompare(b))
    .map(o => ({ nome: o, n: freq[o] || 0 }));
}

// Tipos de instalação (serviço) que já apareceram nas O.S, mais usados primeiro,
// para seleção rápida via datalist — "pré-cadastrados" a partir do histórico.
function tiposServicoHist() {
  const freq = {};
  STORE.getAllOS().forEach(o => {
    const s = (o.servico || '').trim();
    if (s) freq[s] = (freq[s] || 0) + 1;
  });
  return Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b));
}

let _pickerField = null;
function abrirPicker(field) {
  _pickerField = field;
  const { label, opcoes } = pickerConfig(field);
  const atuais = (() => { const v = _modalDraft[field]; return Array.isArray(v) ? v.slice() : (v ? [v] : []); })();
  const ranked = ordenarMaisUsados(field, opcoes);
  // Inclui valores já marcados que não estão na lista do CFG.
  atuais.forEach(v => { if (!ranked.some(r => r.nome === v)) ranked.push({ nome: v, n: 0 }); });

  $('#picker-title').textContent = label;
  $('#picker-list').innerHTML = ranked.map((r, i) => `
    <label class="picker-opt${i < 5 && r.n > 0 ? ' top' : ''}">
      <input type="checkbox" value="${esc(r.nome)}" ${atuais.includes(r.nome) ? 'checked' : ''}>
      <span>${esc(r.nome)}</span>
      ${r.n > 0 ? `<span class="picker-n">${r.n}×</span>` : ''}
    </label>`).join('') || '<p class="text-muted">Cadastre opções no Painel de Controle.</p>';
  $('#picker-novo').value = '';
  $('#picker-overlay').classList.remove('hidden');
}

// Em qual chave do CFG persistir uma nova opção criada no pop-up.
function pickerCfgKey(field) {
  return { ferramentas: 'ferramentas', suprimentos: 'suprimentos', equipe: 'instaladores', responsavelAgenda: 'responsaveis' }[field];
}

function fecharPicker() { $('#picker-overlay').classList.add('hidden'); _pickerField = null; }

function initPicker() {
  $('#picker-close').onclick = fecharPicker;
  $('#picker-overlay').onclick = e => { if (e.target.id === 'picker-overlay') fecharPicker(); };

  $('#picker-add-btn').onclick = () => {
    const inp = $('#picker-novo');
    const val = inp.value.trim();
    if (!val) return;
    // Já existe na lista? apenas marca.
    const existente = $$('#picker-list input[type=checkbox]').find(c => c.value === val);
    if (existente) { existente.checked = true; inp.value = ''; return; }
    const label = document.createElement('label');
    label.className = 'picker-opt';
    label.innerHTML = `<input type="checkbox" value="${esc(val)}" checked><span>${esc(val)}</span>`;
    $('#picker-list').appendChild(label);
    // Persiste no CFG para reaproveitar depois.
    const key = pickerCfgKey(_pickerField);
    if (key) {
      const cfg = STORE.getCFG();
      if (!Array.isArray(cfg[key])) cfg[key] = [];
      if (!cfg[key].includes(val)) { cfg[key].push(val); STORE.saveCFG(cfg); }
    }
    inp.value = '';
  };

  $('#picker-ok').onclick = () => {
    if (!_pickerField || !_modalDraft) { fecharPicker(); return; }
    const vals = $$('#picker-list input[type=checkbox]').filter(c => c.checked).map(c => c.value);
    _modalDraft[_pickerField] = vals;
    saveDraft();
    fecharPicker();
    reRenderModalKeepOpen();
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   EVENTOS DO MODAL
   ══════════════════════════════════════════════════════════════════════════ */
function bindModalEvents(os, ro) {
  const root = $('#modal-os');

  $('#modal-close-btn').onclick = closeModal;
  $('#modal-save').onclick = closeModal;
  $('#modal-pdf').onclick = () => exportarFichaPDF(_modalDraft);
  $('#modal-wpp').onclick = () => abrirWhatsApp(_modalDraft);

  const delBtn = $('#modal-delete');
  if (delBtn) delBtn.onclick = () => {
    if (confirm('Excluir esta O.S e suas fotos? Não há como desfazer.')) {
      (os.fotosCheckinIds || []).forEach(f => STORE.delFoto(f));
      if (os.layoutFotoId) STORE.delFoto(os.layoutFotoId);
      if (os.fotoEmbarqueId) STORE.delFoto(os.fotoEmbarqueId);
      STORE.deleteOS(os.id);
      $('#modal-overlay').classList.add('hidden');
      STATE.modalOSId = null; _modalDraft = null;
      renderActiveTab();
      toast('O.S excluída', 'success');
    }
  };

  // Campos de texto/select genéricos
  $$('[data-f]', root).forEach(el => {
    el.oninput = el.onchange = () => {
      let v = el.value;
      if (el.dataset.f === 'instalacao.duracaoDias') v = Math.max(1, +v || 1);
      setField(el.dataset.f, v);
      // Re-render leve em campos que afetam status/checklist/travas
      if (['confirmacao','instalacao.periodo','instalacao.data','liberadoPCP'].includes(el.dataset.f)) {
        saveDraft(); reRenderModalKeepOpen();
      }
    };
  });

  // Checkboxes
  $$('[data-f-check]', root).forEach(el => {
    el.onchange = () => {
      setField(el.dataset.fCheck, el.checked);
      if (el.dataset.fCheck === 'retrabalho') {
        const box = $('[data-retrabalho-fields]', root);
        if (box) box.style.display = el.checked ? '' : 'none';
      }
    };
  });

  // Itens — edição inline
  $$('[data-item]', root).forEach(el => {
    el.oninput = () => {
      const [idx, key] = el.dataset.item.split('.');
      const it = _modalDraft.itens[+idx];
      it[key] = el.value;
      if (key === 'qtde' || key === 'valorUnit') {
        it.subtotal = (parseBRNumber(it.qtde) * parseBRNumber(it.valorUnit));
      }
      markDirty();
    };
  });
  $$('[data-item-pronto]', root).forEach(el => {
    el.onchange = () => {
      _modalDraft.itens[+el.dataset.itemPronto].pronto = el.checked;
      saveDraft(); reRenderModalKeepOpen();
    };
  });
  $$('[data-item-del]', root).forEach(el => {
    el.onclick = () => {
      _modalDraft.itens.splice(+el.dataset.itemDel, 1);
      saveDraft(); reRenderModalKeepOpen();
    };
  });
  const addItem = $('#btn-add-item');
  if (addItem) addItem.onclick = () => {
    _modalDraft.itens.push({ item: String(_modalDraft.itens.length + 1), descricao: '', medidas: '', qtde: '1', valorUnit: '0', subtotal: 0, pronto: false });
    saveDraft(); reRenderModalKeepOpen();
  };
  const impItens = $('#btn-import-itens');
  if (impItens) impItens.onclick = () => importarItensPDF(_modalDraft);

  // Pop-up de múltipla escolha
  $$('[data-picker-open]', root).forEach(btn => {
    btn.onclick = () => abrirPicker(btn.dataset.pickerOpen);
  });
  $$('[data-chip-rm]', root).forEach(btn => {
    btn.onclick = () => {
      const [f, val] = btn.dataset.chipRm.split('|');
      _modalDraft[f] = (_modalDraft[f] || []).filter(x => x !== val);
      saveDraft(); reRenderModalKeepOpen();
    };
  });

  // Liberar para instalação (FLAG)
  const libBtn = $('#btn-liberar');
  if (libBtn) libBtn.onclick = () => {
    _modalDraft.liberadoPCP = true;
    _modalDraft.aptoPor = STATE.user.nome;
    _modalDraft.aptoEm = nowISO();
    saveDraft(); reRenderModalKeepOpen();
    toast('Liberado para instalação', 'success');
  };
  const cancelLib = $('#btn-cancelar-liberar');
  if (cancelLib) cancelLib.onclick = () => {
    _modalDraft.liberadoPCP = false; _modalDraft.aptoPor = ''; _modalDraft.aptoEm = '';
    saveDraft(); reRenderModalKeepOpen();
  };

  // Confirmei agora
  const confBtn = $('#btn-confirmei');
  if (confBtn) confBtn.onclick = () => {
    _modalDraft.confirmacao = 'Confirmado';
    _modalDraft.confPor = _modalDraft.confPor || STATE.user.nome;
    const d = new Date();
    _modalDraft.confHora = _modalDraft.confHora || `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    saveDraft(); reRenderModalKeepOpen();
    toast('Cliente confirmado', 'success');
  };

  // TRAVA 1 — Liberar carro / saída
  const carroBtn = $('#btn-liberar-carro');
  if (carroBtn) carroBtn.onclick = () => {
    if (_modalDraft.confirmacao !== 'Confirmado') {
      toast('Confirme o horário com o cliente (POP EXI‑002) antes de liberar o carro / sair.', 'error');
      return;
    }
    _modalDraft.carroLiberado = true;
    _modalDraft.carroLiberadoPor = STATE.user.nome;
    _modalDraft.carroLiberadoEm = nowISO();
    saveDraft(); reRenderModalKeepOpen();
    toast('Carro liberado', 'success');
  };
  const cancelCarro = $('#btn-cancelar-carro');
  if (cancelCarro) cancelCarro.onclick = () => {
    _modalDraft.carroLiberado = false; _modalDraft.carroLiberadoPor = ''; _modalDraft.carroLiberadoEm = '';
    saveDraft(); reRenderModalKeepOpen();
  };

  // TRAVA 2 — Finalizar
  const finBtn = $('#btn-finalizar');
  if (finBtn) finBtn.onclick = () => {
    const faltas = validarFinalizacao(_modalDraft);
    if (faltas.length) {
      toast('Falta: ' + faltas.join(', '), 'error');
      return;
    }
    _modalDraft.finalizadaEm = nowISO();
    _modalDraft.finalizadoPor = STATE.user.nome;
    saveDraft(); reRenderModalKeepOpen();
    toast('Instalação finalizada 🏁', 'success');
  };

  // Fotos single (layout, embarque)
  $$('[data-foto-input]', root).forEach(inp => {
    inp.onchange = async () => {
      const field = inp.dataset.fotoInput;
      const file = inp.files[0];
      if (!file) return;
      toast('Enviando foto…');
      const fileId = await STORE.pushPhoto(file);
      if (fileId) {
        if (_modalDraft[field]) STORE.delFoto(_modalDraft[field]);
        _modalDraft[field] = fileId;
        saveDraft(); reRenderModalKeepOpen();
      }
    };
  });

  // Fotos check-in (múltiplas)
  const ckInput = $('[data-foto-checkin-input]', root);
  if (ckInput) ckInput.onchange = async () => {
    const files = Array.from(ckInput.files || []);
    if (!files.length) return;
    if (!_modalDraft.fotosCheckinIds) _modalDraft.fotosCheckinIds = [];
    toast(`Enviando ${files.length} foto(s)…`);
    for (const f of files) {
      const fileId = await STORE.pushPhoto(f);
      if (fileId) _modalDraft.fotosCheckinIds.push(fileId);
    }
    capturarLocalCheckin();
    saveDraft(); reRenderModalKeepOpen();
  };
  $$('[data-foto-rm]', root).forEach(btn => {
    btn.onclick = () => {
      const fid = btn.dataset.fotoRm;
      STORE.delFoto(fid);
      _modalDraft.fotosCheckinIds = (_modalDraft.fotosCheckinIds || []).filter(x => x !== fid);
      saveDraft(); reRenderModalKeepOpen();
    };
  });

  // Carrega imagens (lazy do IndexedDB/servidor)
  $$('[data-foto-img]', root).forEach(async img => {
    const b64 = await STORE.pullPhoto(img.dataset.fotoImg);
    if (b64) img.src = b64;
  });
}

// Geolocalização automática no check‑in (espelho de gestão). Registra só uma vez.
function capturarLocalCheckin() {
  if (!_modalDraft || _modalDraft.checkinGPS || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      _modalDraft.checkinGPS = {
        lat: +pos.coords.latitude.toFixed(6),
        lng: +pos.coords.longitude.toFixed(6),
        precisao: Math.round(pos.coords.accuracy || 0),
        ts: nowISO()
      };
      saveDraft();
      toast('📍 Localização do check‑in registrada', 'success');
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

function reRenderModalKeepOpen() {
  // preserva o estado dos <details> abertos
  const opens = $$('#modal-os .card-fs').map(d => d.open);
  renderModal();
  $$('#modal-os .card-fs').forEach((d, i) => { if (opens[i] != null) d.open = opens[i]; });
}

function validarFinalizacao(os) {
  const f = [];
  if (!os.liberadoPCP) f.push('PCP liberar');
  if (os.confirmacao !== 'Confirmado') f.push('confirmação do cliente');
  if (!os.instalacaoOK) f.push('Instalação OK');
  if (!os.conferidoPor) f.push('conferido por');
  if (!(os.fotosCheckinIds || []).length) f.push('≥1 foto de check‑in');
  if (os.retrabalho && !os.problema) f.push('descrição do problema (retrabalho)');
  return f;
}


/* ══════════════════════════════════════════════════════════════════════════
   CARD DE O.S (reutilizável)
   ══════════════════════════════════════════════════════════════════════════ */
function osCardHTML(os) {
  const st = calcStatus(os);
  const chk = checklist(os);
  const chkStr = chk.map(c => (c.ok ? '✓' : '⬜')).join(' ');
  const itens = os.itens || [];
  const prontos = itens.filter(i => i.pronto).length;
  const pct = fichaPercent(os);
  const resp = os.atualizadoPor || os.responsavelPCP || os.criadoPor || '—';
  return `
    <div class="os-card st-${st} ${alertaOS(os)}" data-os-id="${esc(os.id)}">
      <div class="card-header">
        <div>
          <div class="card-numero">O.S ${esc(os.numero || '—')}${estaAtrasada(os) ? ' <span class="tag-atraso">⏰ atrasada</span>' : ''}${os.retrabalho && !os.finalizadaEm ? ' <span class="tag-retrab">🔴 retrabalho</span>' : ''}</div>
          <div class="card-cliente">${esc(os.cliente || 'Sem cliente')}</div>
        </div>
        <span class="badge st-${st}" style="margin-left:auto">${STATUS_LABEL[st]}</span>
      </div>
      <div class="card-date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      ${(os.equipe||[]).length ? `<div class="card-equipe">👷 ${esc(os.equipe.join(', '))}</div>` : ''}
      <div class="card-pct" title="${pct}% da ficha preenchida">
        <div class="card-pct-bar"><div class="card-pct-fill" style="width:${pct}%"></div></div>
        <span class="card-pct-num">${pct}%</span>
      </div>
      <div class="card-resp">✍ ${esc(resp)}</div>
      <div class="card-checklist">${chkStr}${itens.length?` · ${prontos}/${itens.length} itens`:''}</div>
    </div>`;
}

function bindCardClicks(container) {
  $$('[data-os-id]', container).forEach(c => {
    c.onclick = () => {
      const os = STORE.getOS(c.dataset.osId);
      if (os) openModal(os);
    };
  });
}

function applyFilter(list, busca) {
  if (!busca) return list;
  const b = busca.toLowerCase();
  return list.filter(os =>
    String(os.numero).toLowerCase().includes(b) ||
    String(os.cliente).toLowerCase().includes(b) ||
    String(os.endereco).toLowerCase().includes(b) ||
    String(os.servico).toLowerCase().includes(b)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: PCP
   ══════════════════════════════════════════════════════════════════════════ */
function renderPCP() {
  const el = $('#panel-pcp');
  // Ordena por data de entrega (instalação); sem data vai para o fim
  const all = STORE.getAllOS().slice().sort((a, b) => {
    const da = (a.instalacao && a.instalacao.data) || '9999-12-31';
    const db = (b.instalacao && b.instalacao.data) || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return (b.criadoEm || '').localeCompare(a.criadoEm || '');
  });
  const list = applyFilter(all, STATE.filtroBusca);
  el.innerHTML = `
    <div class="filter-bar">
      <input type="search" id="busca-pcp" placeholder="Buscar O.S, cliente, endereço…" value="${esc(STATE.filtroBusca)}">
      ${podeEditar() ? '<button class="btn-primary btn-sm" id="pcp-nova">+ Nova O.S</button>' : ''}
    </div>
    <div class="cards-grid">
      ${list.map(osCardHTML).join('') || '<p class="text-muted">Nenhuma O.S. Crie uma nova ou importe um PDF.</p>'}
    </div>`;
  bindCardClicks(el);
  const busca = $('#busca-pcp');
  busca.oninput = () => { STATE.filtroBusca = busca.value; renderPCP(); busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); };
  const nova = $('#pcp-nova');
  if (nova) nova.onclick = () => openModal(novaOS());
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: PAINEL (KPIs)
   ══════════════════════════════════════════════════════════════════════════ */
function renderPainel() {
  const el = $('#panel-painel');
  el.innerHTML = `
    <div class="filter-bar">
      <div class="view-toggle">
        <button id="modo-dia" class="${STATE.painelModo==='dia'?'active':''}">Dia</button>
        <button id="modo-periodo" class="${STATE.painelModo==='periodo'?'active':''}">Período</button>
      </div>
      <div id="painel-range" class="flex gap-8"></div>
      <button class="btn-ghost btn-sm" id="btn-export-backup" style="margin-left:auto">⬇ Backup</button>
      <button class="btn-ghost btn-sm" id="btn-import-backup">⬆ Restaurar</button>
    </div>
    <div id="painel-content"></div>`;

  $('#modo-dia').onclick = () => { STATE.painelModo = 'dia'; renderPainel(); };
  $('#modo-periodo').onclick = () => { STATE.painelModo = 'periodo'; renderPainel(); };
  $('#btn-export-backup').onclick = exportarBackup;
  $('#btn-import-backup').onclick = importarBackup;

  renderPainelRange();
  renderPainelKPIs();
}

function renderPainelRange() {
  const el = $('#painel-range');
  const hoje = ymdLocal(new Date());
  if (STATE.painelModo === 'dia') {
    if (!STATE._painelDia) STATE._painelDia = hoje;
    el.innerHTML = `<input type="date" id="painel-data" value="${STATE._painelDia}">`;
    $('#painel-data').onchange = e => { STATE._painelDia = e.target.value; renderPainelKPIs(); };
  } else {
    if (!STATE._painelDe) { const d = new Date(); d.setDate(d.getDate() - 30); STATE._painelDe = ymdLocal(d); }
    if (!STATE._painelAte) STATE._painelAte = hoje;
    el.innerHTML = `
      <input type="date" id="painel-de" value="${STATE._painelDe}">
      <span class="text-muted">até</span>
      <input type="date" id="painel-ate" value="${STATE._painelAte}">
      <button class="btn-ghost btn-xs" data-quick="7">7d</button>
      <button class="btn-ghost btn-xs" data-quick="30">30d</button>
      <button class="btn-ghost btn-xs" data-quick="mes">Mês</button>
      <button class="btn-ghost btn-xs" data-quick="ano">Ano</button>`;
    $('#painel-de').onchange = e => { STATE._painelDe = e.target.value; renderPainelKPIs(); };
    $('#painel-ate').onchange = e => { STATE._painelAte = e.target.value; renderPainelKPIs(); };
    $$('[data-quick]', el).forEach(b => b.onclick = () => {
      const now = new Date();
      let de = new Date();
      if (b.dataset.quick === '7') de.setDate(now.getDate() - 7);
      else if (b.dataset.quick === '30') de.setDate(now.getDate() - 30);
      else if (b.dataset.quick === 'mes') de = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (b.dataset.quick === 'ano') de = new Date(now.getFullYear(), 0, 1);
      STATE._painelDe = ymdLocal(de); STATE._painelAte = ymdLocal(now);
      renderPainel();
    });
  }
}

function osNoRange(os) {
  const d = os.instalacao && os.instalacao.data ? os.instalacao.data : null;
  if (!d) return false;
  if (STATE.painelModo === 'dia') return d === STATE._painelDia;
  return d >= STATE._painelDe && d <= STATE._painelAte;
}

function horasExec(os) {
  if (!os.horaSaida || !os.horaRetorno) return null;
  const [hs, ms] = os.horaSaida.split(':').map(Number);
  const [hr, mr] = os.horaRetorno.split(':').map(Number);
  let diff = (hr * 60 + mr) - (hs * 60 + ms);
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

// Estatísticas de um conjunto de O.S finalizadas, por pessoa da equipe
function statsPorInstalador(finalizadas) {
  const porInst = {};
  finalizadas.forEach(os => {
    (os.equipe || []).forEach(nome => {
      if (!porInst[nome]) porInst[nome] = { entregas: 0, retrab: 0, checkin: 0, horas: [] };
      porInst[nome].entregas++;
      if (os.retrabalho) porInst[nome].retrab++;
      if ((os.fotosCheckinIds || []).length) porInst[nome].checkin++;
      const h = horasExec(os);
      if (h != null) porInst[nome].horas.push(h);
    });
  });
  return porInst;
}

// Nota 0–10 do instalador: prioriza menos retrabalho, com bônus de check‑in.
// Sem entregas → nota neutra 0. %retrab pesa 70%, check‑in 30%.
function notaInstalador(d) {
  if (!d || !d.entregas) return 0;
  const semRetrab = 1 - (d.retrab / d.entregas);   // 0..1 (quanto menos retrab, maior)
  const comCheckin = d.checkin / d.entregas;         // 0..1
  return Math.max(0, Math.min(10, (semRetrab * 0.7 + comCheckin * 0.3) * 10));
}

// Contagem de ocorrências para tendências (campo simples ou array)
function contar(list, getter) {
  const m = {};
  list.forEach(os => {
    const v = getter(os);
    (Array.isArray(v) ? v : [v]).forEach(x => { if (x) m[x] = (m[x] || 0) + 1; });
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function trendBlock(titulo, tipo, pares) {
  const top = pares.slice(0, 6);
  const max = top.length ? top[0][1] : 1;
  return `<div class="trend-card">
    <div class="trend-titulo">${titulo}</div>
    ${top.length ? top.map(([nome, n]) => `
      <div class="trend-row" data-detail="trend:${esc(tipo)}:${esc(nome)}">
        <span class="trend-nome">${esc(nome)}</span>
        <span class="trend-bar"><span style="width:${Math.round(n/max*100)}%"></span></span>
        <span class="trend-n">${n}</span>
      </div>`).join('') : '<p class="text-muted" style="font-size:.78rem">Sem dados</p>'}
  </div>`;
}

function renderPainelKPIs() {
  const el = $('#painel-content');
  const todas = STORE.getAllOS().filter(osNoRange);
  const finalizadas = todas.filter(o => o.finalizadaEm);
  const comRetrab = finalizadas.filter(o => o.retrabalho).length;
  const horas = finalizadas.map(horasExec).filter(h => h != null);
  const mediaH = horas.length ? (horas.reduce((a, b) => a + b, 0) / horas.length) : 0;

  const porInst = statsPorInstalador(finalizadas);
  const linhas = Object.entries(porInst).sort((a, b) => b[1].entregas - a[1].entregas).map(([nome, d]) => {
    const mh = d.horas.length ? (d.horas.reduce((a, b) => a + b, 0) / d.horas.length).toFixed(1) : '—';
    return `<tr class="row-click" data-detail="inst:${esc(nome)}"><td>${esc(nome)}</td><td>${d.entregas}</td><td>${d.entregas?Math.round(d.retrab/d.entregas*100):0}%</td><td>${d.entregas?Math.round(d.checkin/d.entregas*100):0}%</td><td>${mh}h</td></tr>`;
  }).join('');

  // ── Ranking de notas (favorece menos retrabalho) ─────────────────────────
  const rankNota = Object.entries(porInst)
    .map(([nome, d]) => [nome, notaInstalador(d), d])
    .sort((a, b) => b[1] - a[1] || b[2].entregas - a[2].entregas)
    .map(([nome, nota, d], i) => {
      const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
      const pctR = d.entregas ? Math.round(d.retrab / d.entregas * 100) : 0;
      const cor = nota >= 9 ? 'var(--green)' : (nota >= 7 ? 'var(--amber)' : 'var(--red)');
      return `<tr class="row-click" data-detail="inst:${esc(nome)}"><td>${medalha} ${esc(nome)}</td><td><strong style="color:${cor}">${nota.toFixed(1)}</strong></td><td>${d.entregas}</td><td>${d.retrab} (${pctR}%)</td></tr>`;
    }).join('');

  // ── Em execução AGORA + indicadores ao vivo (independe do período) ───────
  const todasOS = STORE.getAllOS();
  const emRua = todasOS.filter(o => !o.finalizadaEm && o.liberadoPCP && (o.carroLiberado || o.horaSaida) && !o.horaRetorno)
    .sort((a, b) => (a.horaSaida || '').localeCompare(b.horaSaida || ''));
  const agendadasHoje = todasOS.filter(o => o.instalacao && o.instalacao.data === ymdLocal(new Date()) && !o.finalizadaEm).length;
  const aptas = todasOS.filter(o => calcStatus(o) === 'apto').length;

  const execCards = emRua.map(os => `
    <div class="exec-now-card st-em_andamento" data-os-id="${esc(os.id)}">
      <div class="enc-top"><strong>O.S ${esc(os.numero||'—')}</strong> · ${esc(os.cliente||'')}</div>
      <div class="enc-sub">👷 ${esc((os.equipe||[]).join(', ')||'—')}${os.horaSaida?` · 🚗 saída ${esc(os.horaSaida)}`:''}</div>
    </div>`).join('');

  // ── Ranking de operadores (preenchimento do sistema) ─────────────────────
  const porOper = {};
  todasOS.forEach(os => {
    const nome = os.atualizadoPor || os.aptoPor || os.criadoPor;
    if (!nome) return;
    if (!porOper[nome]) porOper[nome] = { os: 0, soma: 0 };
    porOper[nome].os++;
    porOper[nome].soma += fichaPercent(os);
  });
  const rankOper = Object.entries(porOper).sort((a, b) => b[1].soma - a[1].soma).map(([nome, d], i) => {
    const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
    const media = d.os ? Math.round(d.soma / d.os) : 0;
    return `<tr class="row-click" data-detail="oper:${esc(nome)}"><td>${medalha} ${esc(nome)}</td><td>${d.os}</td><td>${media}%</td></tr>`;
  }).join('');

  // ── Comparativo com período anterior (mesmo tamanho) ─────────────────────
  let prevTxt = '';
  if (STATE.painelModo === 'periodo' && STATE._painelDe && STATE._painelAte) {
    const de = parseLocalDate(STATE._painelDe), ate = parseLocalDate(STATE._painelAte);
    const dias = Math.round((ate - de) / 86400000) + 1;
    const pAte = new Date(de); pAte.setDate(de.getDate() - 1);
    const pDe = new Date(pAte); pDe.setDate(pAte.getDate() - (dias - 1));
    const pDeS = ymdLocal(pDe), pAteS = ymdLocal(pAte);
    const prev = todasOS.filter(o => o.instalacao && o.instalacao.data >= pDeS && o.instalacao.data <= pAteS);
    const delta = todas.length - prev.length;
    const seta = delta > 0 ? '▲' : (delta < 0 ? '▼' : '▬');
    const cor = delta > 0 ? 'var(--green)' : (delta < 0 ? 'var(--red)' : 'var(--muted)');
    prevTxt = `<span class="prev-cmp" style="color:${cor}">${seta} ${Math.abs(delta)} vs período anterior (${prev.length})</span>`;
  }

  // ── Tendências ────────────────────────────────────────────────────────────
  const trendHTML = `
    ${trendBlock('🚚 Carro mais utilizado', 'veiculo', contar(todas, o => o.veiculo))}
    ${trendBlock('🛠 Ferramentas mais usadas', 'ferramenta', contar(todas, o => o.ferramentas))}
    ${trendBlock('📐 Tipo de instalação mais frequente', 'periodo', contar(todas, o => (o.instalacao && o.instalacao.periodo)))}
    ${trendBlock('📦 Insumos mais utilizados', 'suprimento', contar(todas, o => o.suprimentos))}`;

  // ── Serviços por funcionário ─────────────────────────────────────────────
  const pessoas = peopleList();
  const selFunc = STATE._painelFunc || '';
  const funcOpts = pessoas.map(p => `<option ${selFunc===p?'selected':''}>${esc(p)}</option>`).join('');

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card clickable" data-detail="todas"><div class="kpi-val">${todas.length}</div><div class="kpi-lbl">O.S no período</div></div>
      <div class="kpi-card clickable" data-detail="finalizadas"><div class="kpi-val">${finalizadas.length}</div><div class="kpi-lbl">Finalizadas</div></div>
      <div class="kpi-card clickable" data-detail="retrab"><div class="kpi-val">${comRetrab}</div><div class="kpi-lbl">Com retrabalho</div></div>
      <div class="kpi-card"><div class="kpi-val">${mediaH.toFixed(1)}h</div><div class="kpi-lbl">Média execução</div></div>
      <div class="kpi-card clickable live" data-detail="emrua"><div class="kpi-val">${emRua.length}</div><div class="kpi-lbl">Em execução agora</div></div>
      <div class="kpi-card clickable" data-detail="hoje"><div class="kpi-val">${agendadasHoje}</div><div class="kpi-lbl">Agendadas hoje</div></div>
      <div class="kpi-card clickable" data-detail="aptas"><div class="kpi-val">${aptas}</div><div class="kpi-lbl">Aptas (aguardando)</div></div>
    </div>
    ${prevTxt ? `<div style="margin:-6px 0 10px">${prevTxt}</div>` : ''}

    <h3 class="painel-h">🚗 Trabalhos em execução agora</h3>
    <div class="exec-now-grid">${execCards || '<p class="text-muted">Nenhum trabalho na rua no momento.</p>'}</div>

    <h3 class="painel-h">📈 Tendências</h3>
    <div class="trend-grid">${trendHTML}</div>

    <h3 class="painel-h">🔎 Serviços por funcionário</h3>
    <div class="filter-bar">
      <select id="painel-func"><option value="">— selecionar funcionário —</option>${funcOpts}</select>
    </div>

    <h3 class="painel-h">🏆 Ranking de preenchimento (operadores)</h3>
    <table class="control-table">
      <thead><tr><th>Operador</th><th>O.S preenchidas</th><th>Média preenchimento</th></tr></thead>
      <tbody>${rankOper || '<tr><td colspan="3" class="text-muted" style="text-align:center;padding:12px">Sem dados</td></tr>'}</tbody>
    </table>

    <h3 class="painel-h">🌟 Ranking de notas <span class="text-muted" style="font-weight:400;font-size:.75rem">(quem tem menos retrabalho pontua mais — clique para ver os serviços)</span></h3>
    <table class="control-table">
      <thead><tr><th>Instalador</th><th>Nota</th><th>Entregas</th><th>Retrabalhos</th></tr></thead>
      <tbody>${rankNota || '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:12px">Sem dados no período</td></tr>'}</tbody>
    </table>

    <h3 class="painel-h">👷 Desempenho por instalador <span class="text-muted" style="font-weight:400;font-size:.75rem">(clique para ver os serviços)</span></h3>
    <table class="control-table">
      <thead><tr><th>Instalador</th><th>Entregas</th><th>%Retrab</th><th>%Check‑in</th><th>Média h</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:12px">Sem dados no período</td></tr>'}</tbody>
    </table>

    <h3 class="painel-h">⚖️ Comparar colaboradores</h3>
    <div class="filter-bar">
      <select id="cmp-a"><option value="">Colaborador A</option>${pessoas.map(p=>`<option ${STATE._cmpA===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
      <select id="cmp-b"><option value="">Colaborador B</option>${pessoas.map(p=>`<option ${STATE._cmpB===p?'selected':''}>${esc(p)}</option>`).join('')}</select>
    </div>
    <div id="cmp-out"></div>

    <div id="painel-detail"></div>`;

  bindCardClicks(el);

  // Cliques em itens (cards KPI, linhas, tendências)
  $$('[data-detail]', el).forEach(node => node.onclick = () => {
    STATE._painelDetail = node.dataset.detail;
    renderPainelDetalhe(todas, todasOS, finalizadas, porInst);
  });

  // Serviços por funcionário
  $('#painel-func').onchange = e => {
    STATE._painelFunc = e.target.value;
    STATE._painelDetail = e.target.value ? ('func:' + e.target.value) : null;
    renderPainelDetalhe(todas, todasOS, finalizadas, porInst);
  };

  // Comparativo de colaboradores
  const cmpA = $('#cmp-a'), cmpB = $('#cmp-b');
  const doCmp = () => {
    STATE._cmpA = cmpA.value; STATE._cmpB = cmpB.value;
    renderComparativo(finalizadas);
  };
  cmpA.onchange = doCmp; cmpB.onchange = doCmp;

  if (STATE._cmpA || STATE._cmpB) renderComparativo(finalizadas);
  if (STATE._painelDetail) renderPainelDetalhe(todas, todasOS, finalizadas, porInst);
}

// Lista compacta clicável de O.S
function osMiniList(list) {
  if (!list.length) return '<p class="text-muted">Nenhuma O.S.</p>';
  return `<div class="os-list">${list.map(os => `
    <div class="os-list-item st-${calcStatus(os)} ${alertaOS(os)}" data-os-id="${esc(os.id)}">
      <div class="list-info">
        <div class="list-numero">O.S ${esc(os.numero||'—')} <span class="badge st-${calcStatus(os)}">${STATUS_LABEL[calcStatus(os)]}</span></div>
        <div class="list-cliente">${esc(os.cliente||'Sem cliente')}${os.servico?' — '+esc(os.servico):''}</div>
        <div class="list-date">📅 ${esc(fmtInstalacao(os.instalacao))}${(os.equipe||[]).length?' · 👷 '+esc(os.equipe.join(', ')):''}</div>
      </div>
    </div>`).join('')}</div>`;
}

function renderPainelDetalhe(todas, todasOS, finalizadas, porInst) {
  const box = $('#painel-detail');
  if (!box) return;
  const d = STATE._painelDetail;
  if (!d) { box.innerHTML = ''; return; }

  let titulo = '', list = [];
  if (d === 'todas')            { titulo = 'O.S no período'; list = todas; }
  else if (d === 'finalizadas') { titulo = 'Finalizadas no período'; list = finalizadas; }
  else if (d === 'retrab')      { titulo = 'Com retrabalho'; list = finalizadas.filter(o => o.retrabalho); }
  else if (d === 'emrua')       { titulo = 'Em execução agora'; list = todasOS.filter(o => !o.finalizadaEm && o.liberadoPCP && (o.carroLiberado || o.horaSaida) && !o.horaRetorno); }
  else if (d === 'hoje')        { titulo = 'Agendadas hoje'; list = todasOS.filter(o => o.instalacao && o.instalacao.data === ymdLocal(new Date()) && !o.finalizadaEm); }
  else if (d === 'aptas')       { titulo = 'Aptas (aguardando)'; list = todasOS.filter(o => calcStatus(o) === 'apto'); }
  else if (d.startsWith('inst:')) { const n = d.slice(5); titulo = 'Serviços de ' + n; list = finalizadas.filter(o => (o.equipe||[]).includes(n)); }
  else if (d.startsWith('oper:')) { const n = d.slice(5); titulo = 'O.S preenchidas por ' + n; list = todasOS.filter(o => (o.atualizadoPor||o.aptoPor||o.criadoPor) === n); }
  else if (d.startsWith('func:')) { const n = d.slice(5); titulo = 'Todos os serviços de ' + n; list = todasOS.filter(o => (o.equipe||[]).includes(n) || (o.atualizadoPor||o.criadoPor) === n); }
  else if (d.startsWith('trend:')) {
    const [, tipo, ...rest] = d.split(':'); const val = rest.join(':');
    titulo = `${val}`;
    const has = { veiculo: o => o.veiculo === val, ferramenta: o => (o.ferramentas||[]).includes(val), periodo: o => (o.instalacao&&o.instalacao.periodo) === val, suprimento: o => (o.suprimentos||[]).includes(val) }[tipo];
    list = has ? todas.filter(has) : [];
  }

  box.innerHTML = `
    <div class="painel-detail-head">
      <h3 class="painel-h" style="margin:0">📋 ${esc(titulo)} <span class="text-muted" style="font-weight:400">(${list.length})</span></h3>
      <button class="btn-ghost btn-xs" id="detail-close">✕ fechar</button>
    </div>
    ${osMiniList(list)}`;
  bindCardClicks(box);
  $('#detail-close').onclick = () => { STATE._painelDetail = null; STATE._painelFunc = ''; box.innerHTML = ''; const sf = $('#painel-func'); if (sf) sf.value = ''; };
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderComparativo(finalizadas) {
  const out = $('#cmp-out');
  if (!out) return;
  const a = STATE._cmpA, b = STATE._cmpB;
  if (!a && !b) { out.innerHTML = ''; return; }
  const stats = statsPorInstalador(finalizadas);
  const col = nome => {
    const d = stats[nome] || { entregas: 0, retrab: 0, checkin: 0, horas: [] };
    const mh = d.horas.length ? (d.horas.reduce((x, y) => x + y, 0) / d.horas.length).toFixed(1) + 'h' : '—';
    return { entregas: d.entregas, retrab: d.entregas ? Math.round(d.retrab / d.entregas * 100) + '%' : '0%', checkin: d.entregas ? Math.round(d.checkin / d.entregas * 100) + '%' : '0%', mh };
  };
  const ca = col(a), cb = col(b);
  const linha = (lbl, va, vb) => `<tr><td>${lbl}</td><td>${va}</td><td>${vb}</td></tr>`;
  out.innerHTML = `
    <table class="control-table" style="margin-top:8px">
      <thead><tr><th>Métrica</th><th>${esc(a||'A')}</th><th>${esc(b||'B')}</th></tr></thead>
      <tbody>
        ${linha('Entregas', ca.entregas, cb.entregas)}
        ${linha('% Retrabalho', ca.retrab, cb.retrab)}
        ${linha('% Check‑in', ca.checkin, cb.checkin)}
        ${linha('Média execução', ca.mh, cb.mh)}
      </tbody>
    </table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: PROGRAMAÇÃO (Instalação) — Calendário / Lista
   ══════════════════════════════════════════════════════════════════════════ */
function renderProgramacao() {
  const el = $('#panel-programacao');
  el.innerHTML = `
    <div class="filter-bar">
      <div class="view-toggle">
        <button id="vt-cal" class="${STATE.calView==='cal'?'active':''}">📋 Kanban</button>
        <button id="vt-lista" class="${STATE.calView==='lista'?'active':''}">☰ Lista</button>
      </div>
      <div class="rel-dia">
        <input type="date" id="rel-data" value="${hojeISO()}">
        <button class="btn-ghost btn-sm" id="rel-pdf" title="Lista de serviços do dia em PDF">📄 Serviços do dia</button>
        <button class="btn-ghost btn-sm" id="rel-wpp" title="Enviar a lista do dia por WhatsApp">💬 Enviar dia</button>
      </div>
    </div>
    <div id="prog-content"></div>`;
  $('#vt-cal').onclick = () => { STATE.calView = 'cal'; renderProgramacao(); };
  $('#vt-lista').onclick = () => { STATE.calView = 'lista'; renderProgramacao(); };
  $('#rel-pdf').onclick = () => relatorioServicosDia($('#rel-data').value);
  $('#rel-wpp').onclick = () => whatsappServicosDia($('#rel-data').value);
  if (STATE.calView === 'cal') renderKanban();
  else renderProgLista();
}

// Ordena por horário dentro do dia: Manhã < Tarde < Dia inteiro; "Horário" usa a hora.
function ordemHora(os) {
  const inst = os.instalacao || {};
  if (inst.periodo === 'Horário' && inst.hora) return inst.hora;
  if (inst.periodo === 'Manhã') return '08:00';
  if (inst.periodo === 'Tarde') return '13:00';
  if (inst.periodo === 'Dia inteiro') return '00:00';
  return '23:59';
}
function rotuloHora(os) {
  const inst = os.instalacao || {};
  if (inst.periodo === 'Horário' && inst.hora) return inst.hora;
  return inst.periodo || '—';
}

function renderProgLista() {
  const el = $('#prog-content');
  const list = STORE.getAllOS()
    .filter(o => o.instalacao && o.instalacao.data)
    .sort((a, b) => a.instalacao.data.localeCompare(b.instalacao.data));
  el.innerHTML = `<div class="cards-grid">${list.map(osCardHTML).join('') || '<p class="text-muted">Nenhuma O.S agendada.</p>'}</div>`;
  bindCardClicks(el);
}

function renderKanban() {
  const el = $('#prog-content');
  const hojeStr = ymdLocal(new Date());
  const all = STORE.getAllOS().filter(o => o.instalacao && o.instalacao.data && !o.finalizadaEm);

  // indexa O.S por dia (considerando duracaoDias)
  const porDia = {};
  all.forEach(os => {
    const d0 = parseLocalDate(os.instalacao.data);
    if (!d0) return;
    const dur = Math.max(1, os.instalacao.duracaoDias || 1);
    for (let i = 0; i < dur; i++) {
      const d = new Date(d0); d.setDate(d0.getDate() + i);
      (porDia[ymdLocal(d)] = porDia[ymdLocal(d)] || []).push(os);
    }
  });

  // só dias de hoje em diante (board de programação)
  const dias = Object.keys(porDia).filter(k => k >= hojeStr).sort();

  if (!dias.length) {
    el.innerHTML = '<p class="text-muted">Nenhuma instalação agendada de hoje em diante.</p>';
    return;
  }

  const colunas = dias.map(key => {
    const d = parseLocalDate(key);
    const titulo = `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const lista = porDia[key].slice().sort((a, b) => ordemHora(a).localeCompare(ordemHora(b)));
    const cards = lista.map(os => {
      const st = calcStatus(os);
      return `<div class="kanban-card st-${st} ${alertaOS(os)}" data-kan-os="${esc(os.id)}">
        <div class="kanban-hora">⏰ ${esc(rotuloHora(os))}</div>
        <div class="kanban-os">O.S ${esc(os.numero || '—')}</div>
        <div class="kanban-cliente">${esc(os.cliente || 'Sem cliente')}</div>
        ${(os.equipe||[]).length ? `<div class="kanban-equipe">👷 ${esc(os.equipe.join(', '))}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="kanban-col ${key===hojeStr?'today':''}">
      <div class="kanban-col-head">
        ${esc(titulo)}${key===hojeStr?' · Hoje':''}
        <span class="kanban-count">${lista.length}</span>
        <button class="btn-xs btn-ghost" data-kan-pdf="${key}" title="Espelho do dia">🖨</button>
      </div>
      <div class="kanban-col-body">${cards}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="kanban">${colunas}</div>`;

  $$('[data-kan-os]', el).forEach(c => c.onclick = () => {
    const os = STORE.getOS(c.dataset.kanOs);
    if (os) openModal(os);
  });
  $$('[data-kan-pdf]', el).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const key = b.dataset.kanPdf;
    exportarDiaPDF(key, (porDia[key] || []));
  });
}

function renderDiaDetalhe(items) {
  const el = $('#cal-day-detail');
  const d = parseLocalDate(STATE.selectedDay);
  const titulo = d ? `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
  const cards = items.map(({ os }) => osCardHTML(os)).join('');
  el.innerHTML = `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <div class="flex gap-8" style="align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <strong>${titulo}</strong>
        ${podeEditar() ? '<button class="btn-primary btn-sm" id="btn-agendar-data">+ Agendar nesta data</button>' : ''}
        <button class="btn-ghost btn-sm" id="btn-pdf-dia">🖨 PDF do dia</button>
        <button class="btn-ghost btn-sm" id="btn-wpp-dia">💬 WhatsApp do dia</button>
      </div>
      <div class="cards-grid">${cards || '<p class="text-muted">Nenhuma O.S neste dia.</p>'}</div>
    </div>`;
  bindCardClicks(el);
  const ag = $('#btn-agendar-data');
  if (ag) ag.onclick = () => {
    const os = novaOS();
    os.instalacao.data = STATE.selectedDay;
    os.instalacao.periodo = 'Manhã';
    os.liberadoPCP = true; os.aptoPor = STATE.user.nome; os.aptoEm = nowISO();
    openModal(os);
  };
  $('#btn-pdf-dia').onclick = () => exportarDiaPDF(STATE.selectedDay, items.map(i => i.os));
  $('#btn-wpp-dia').onclick = () => abrirWhatsAppDia(STATE.selectedDay, items.map(i => i.os));
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: EXECUÇÃO ("na rua")
   ══════════════════════════════════════════════════════════════════════════ */
function renderExecucao() {
  const el = $('#panel-execucao');
  const list = STORE.getAllOS().filter(o => o.liberadoPCP && !o.finalizadaEm);
  // na-rua primeiro
  list.sort((a, b) => {
    const ra = (!a.finalizadaEm && (a.carroLiberado || a.horaSaida) && !a.horaRetorno) ? 0 : 1;
    const rb = (!b.finalizadaEm && (b.carroLiberado || b.horaSaida) && !b.horaRetorno) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (a.instalacao?.data || '').localeCompare(b.instalacao?.data || '');
  });

  el.innerHTML = `<div class="os-list">${list.map(execItemHTML).join('') || '<p class="text-muted">Nenhuma O.S apta em execução.</p>'}</div>`;

  $$('[data-os-id]', el).forEach(item => {
    item.onclick = e => {
      if (e.target.closest('[data-inline]')) return;
      const os = STORE.getOS(item.dataset.osId);
      if (os) openModal(os);
    };
  });
  // botões inline
  $$('[data-inline="carro"]', el).forEach(b => b.onclick = () => {
    const os = STORE.getOS(b.dataset.id);
    if (os.confirmacao !== 'Confirmado') { toast('Confirme o cliente (POP EXI‑002) antes de liberar o carro / sair.', 'error'); return; }
    os.carroLiberado = true; os.carroLiberadoPor = STATE.user.nome; os.carroLiberadoEm = nowISO();
    os.atualizadoEm = nowISO(); os.atualizadoPor = STATE.user.nome;
    STORE.saveOS(os); renderExecucao(); toast('Carro liberado', 'success');
  });
  $$('[data-inline="checkout"]', el).forEach(b => b.onclick = () => {
    const os = STORE.getOS(b.dataset.id);
    if (os) openModal(os);
  });
}

function execItemHTML(os) {
  const st = calcStatus(os);
  const naRua = !os.finalizadaEm && (os.carroLiberado || os.horaSaida) && !os.horaRetorno;
  return `
    <div class="os-list-item st-${st} ${alertaOS(os)}" data-os-id="${esc(os.id)}">
      <div class="list-info">
        <div class="list-numero">O.S ${esc(os.numero || '—')} ${naRua ? '🚗 na rua' : ''}</div>
        <div class="list-cliente">${esc(os.cliente)} · ${esc(os.endereco || '')}</div>
        <div class="list-date">📅 ${esc(fmtInstalacao(os.instalacao))} · 👷 ${esc((os.equipe||[]).join(', ') || '—')}</div>
      </div>
      <div class="list-actions edit-only">
        ${!os.carroLiberado ? `<button class="btn-primary btn-xs" data-inline="carro" data-id="${esc(os.id)}">🚗 Liberar</button>` : ''}
        <button class="btn-ghost btn-xs" data-inline="checkout" data-id="${esc(os.id)}">Check‑out</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: RETRABALHO
   ══════════════════════════════════════════════════════════════════════════ */
function renderRetrabalho() {
  const el = $('#panel-retrabalho');
  const list = STORE.getAllOS().filter(o => o.retrabalho)
    .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
  el.innerHTML = `
    <div class="os-list">
      ${list.map(os => {
        const resolvido = !!os.dataResolvido;
        return `<div class="os-list-item st-${calcStatus(os)} ${alertaOS(os)}" data-os-id="${esc(os.id)}">
          <div class="list-info">
            <div class="list-numero">O.S ${esc(os.numero||'—')} ${resolvido?'✓ resolvido':'⚠ pendente'}</div>
            <div class="list-cliente">${esc(os.cliente)} — ${esc(os.problema || 'sem descrição')}</div>
            <div class="list-date">Causa: ${esc(os.causa || '—')}${os.resolvidoPor?` · por ${esc(os.resolvidoPor)}`:''}</div>
          </div>
        </div>`;
      }).join('') || '<p class="text-muted">Nenhum retrabalho registrado.</p>'}
    </div>`;
  bindCardClicks(el);
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: FINALIZADOS (arquivo das O.S concluídas)
   ══════════════════════════════════════════════════════════════════════════ */
function renderFinalizados() {
  const el = $('#panel-finalizados');
  const all = STORE.getAllOS()
    .filter(o => o.finalizadaEm)
    .sort((a, b) => (b.finalizadaEm || '').localeCompare(a.finalizadaEm || ''));
  const list = applyFilter(all, STATE.filtroFinalizados || '');

  const cards = list.map(os => {
    const sit = (os.checkout && os.checkout.situacao) || (os.retrabalho ? 'Retrabalho' : 'Finalizado');
    const dF = parseLocalDate((os.finalizadaEm || '').slice(0, 10));
    const dataF = dF ? `${String(dF.getDate()).padStart(2,'0')}/${String(dF.getMonth()+1).padStart(2,'0')}/${dF.getFullYear()}` : '—';
    const sitCls = sit === 'Retrabalho' ? 'st-retrabalho' : 'st-finalizada';
    return `<div class="os-list-item ${sitCls}" data-os-id="${esc(os.id)}">
      <div class="list-info">
        <div class="list-numero">O.S ${esc(os.numero || '—')} <span class="badge ${sitCls}">${esc(sit)}</span></div>
        <div class="list-cliente">${esc(os.cliente || 'Sem cliente')}${os.servico ? ' — ' + esc(os.servico) : ''}</div>
        <div class="list-date">🏁 Finalizada em ${esc(dataF)}${(os.equipe||[]).length ? ' · 👷 ' + esc(os.equipe.join(', ')) : ''}</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="filter-bar">
      <input type="search" id="busca-fin" placeholder="Buscar O.S, cliente, serviço…" value="${esc(STATE.filtroFinalizados || '')}">
      <span class="text-muted" style="margin-left:auto">${all.length} arquivada(s)</span>
    </div>
    <div class="os-list">${cards || '<p class="text-muted">Nenhuma O.S finalizada ainda.</p>'}</div>`;

  bindCardClicks(el);
  const busca = $('#busca-fin');
  busca.oninput = () => {
    STATE.filtroFinalizados = busca.value;
    renderFinalizados();
    busca.focus();
    busca.setSelectionRange(busca.value.length, busca.value.length);
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ESPELHOS (admin) — gera espelhos para instaladores e comercial
   ══════════════════════════════════════════════════════════════════════════ */
function abrirEspelhos() {
  const overlay = $('#modal-overlay');
  const modal = $('#modal-os');
  modal.innerHTML = `
    <div class="modal-header">
      <div style="flex:1"><div class="modal-title">🪞 Espelhos</div></div>
      <button class="modal-close" id="esp-fechar">×</button>
    </div>
    <div class="espelhos-box">
      <p class="text-muted">Abra um espelho somente‑leitura para compartilhar com a equipe.</p>
      <div class="espelhos-opts">
        <a class="btn-primary w-100" href="equipe.html" target="_blank" rel="noopener">👷 Espelho dos Instaladores</a>
        <a class="btn-ghost w-100 mt-8" href="equipe.html#comercial" target="_blank" rel="noopener">💼 Espelho Comercial</a>
      </div>
    </div>`;
  overlay.classList.remove('hidden');
  $('#esp-fechar').onclick = () => overlay.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════
   ABA: PAINEL DE CONTROLE (gerencia o CFG)
   ══════════════════════════════════════════════════════════════════════════ */
const CFG_LISTAS = [
  { key: 'instaladores',      label: 'Instaladores' },
  { key: 'veiculos',          label: 'Veículos' },
  { key: 'responsaveis',      label: 'Responsáveis (PCP)' },
  { key: 'gerentes_montagem', label: 'Gerentes de Montagem' },
  { key: 'ferramentas',       label: 'Ferramentas' },
  { key: 'suprimentos',       label: 'Suprimentos' },
  { key: 'causas_retrabalho', label: 'Causas de Retrabalho' }
];

function renderControle() {
  const el = $('#panel-controle');
  const cfg = STORE.getCFG();
  const ro = !podeCadastrar();

  const listasHTML = CFG_LISTAS.map(({ key, label }) => `
    <div class="cfg-section">
      <h3>${label}</h3>
      <div class="cfg-list">
        ${(cfg[key] || []).map(v => `
          <div class="cfg-item">
            <span>${esc(v)}</span>
            ${ro ? '' : `<button class="btn-xs btn-danger" data-cfg-del="${key}|${esc(v)}">🗑</button>`}
          </div>`).join('') || '<p class="text-muted">Vazio</p>'}
        ${ro ? '' : `<div class="flex gap-6 mt-8">
          <input class="w-100" data-cfg-input="${key}" placeholder="Adicionar ${esc(label.toLowerCase())}…">
          <button class="btn-primary btn-sm" data-cfg-add="${key}">+</button>
        </div>`}
      </div>
    </div>`).join('');

  const usuariosHTML = `
    <div class="cfg-section">
      <h3>Usuários</h3>
      <div class="cfg-list">
        ${(cfg.usuarios || []).map((u, i) => `
          <div class="cfg-item">
            <span>${esc(u.nome)} <span class="text-muted">(${esc(u.papel)})</span></span>
            ${ro ? '' : `<button class="btn-xs btn-danger" data-user-del="${i}">🗑</button>`}
          </div>`).join('')}
        ${ro ? '' : `<div class="field-row3 mt-8">
          <input data-user-nome placeholder="Nome">
          <select data-user-papel>
            <option value="pcp">PCP</option><option value="montagem">Montagem</option>
            <option value="operacao">Operação</option><option value="comercial">Comercial</option>
            <option value="admin">Admin</option>
          </select>
          <input data-user-senha placeholder="Senha (opcional)">
        </div>
        <button class="btn-primary btn-sm mt-8" data-user-add>+ Adicionar usuário</button>`}
      </div>
    </div>`;

  // ── Contatos / Funcionários (envio rápido via WhatsApp) ──────────────────
  const contatos = cfg.funcionarios || [];
  const contatosHTML = `
    <div class="cfg-section">
      <h3>📇 Contatos / Funcionários (WhatsApp)</h3>
      <p class="text-muted" style="font-size:.75rem;margin-bottom:8px">Cadastre nome, departamento e número para enviar O.S e programações rapidamente.</p>
      <div class="cfg-list">
        ${contatos.map((c, i) => `
          <div class="cfg-item">
            <span>${esc(c.nome)} <span class="text-muted">(${esc(c.departamento||'—')})</span> · ${esc(c.numero||'')}</span>
            <span class="flex gap-6">
              <a class="btn-xs btn-success" href="https://wa.me/55${String(c.numero||'').replace(/\D/g,'')}" target="_blank" rel="noopener" title="Abrir conversa">💬</a>
              ${ro ? '' : `<button class="btn-xs btn-danger" data-cont-del="${i}">🗑</button>`}
            </span>
          </div>`).join('') || '<p class="text-muted">Nenhum contato cadastrado</p>'}
        ${ro ? '' : `<div class="field-row3 mt-8">
          <input data-cont-nome placeholder="Nome">
          <input data-cont-dep placeholder="Departamento">
          <input data-cont-num placeholder="Número (DDD+nº)" inputmode="tel">
        </div>
        <button class="btn-primary btn-sm mt-8" data-cont-add>+ Adicionar contato</button>`}
      </div>
    </div>`;

  // ── Níveis de acesso configuráveis (somente admin) ───────────────────────
  const isAdmin = STATE.user.papel === 'admin';
  const PERM = getPermissoes();
  const PAPEIS = ['pcp', 'montagem', 'operacao', 'comercial'];
  const niveisHTML = isAdmin ? `
    <div class="cfg-section">
      <h3>🔐 Níveis de acesso</h3>
      <p class="text-muted" style="font-size:.75rem;margin-bottom:8px">Defina o que cada nível pode ver/editar. Admin tem acesso total (não editável).</p>
      <table class="control-table niveis-table">
        <thead><tr><th>Nível</th>${ABAS_DISPONIVEIS.map(a=>`<th>${esc(a)}</th>`).join('')}<th>Editar</th><th>Cadastrar</th></tr></thead>
        <tbody>
          ${PAPEIS.map(papel => {
            const p = PERM[papel];
            const abas = p.abas === '*' ? ABAS_DISPONIVEIS : p.abas;
            return `<tr><td><strong>${esc(papel)}</strong></td>
              ${ABAS_DISPONIVEIS.map(a => `<td><input type="checkbox" data-nivel-aba="${papel}|${a}" ${abas.includes(a)?'checked':''}></td>`).join('')}
              <td><input type="checkbox" data-nivel-flag="${papel}|editar" ${p.editar?'checked':''}></td>
              <td><input type="checkbox" data-nivel-flag="${papel}|cadastrar" ${p.cadastrar?'checked':''}></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <button class="btn-ghost btn-sm mt-8" data-nivel-reset>↺ Restaurar padrão</button>
    </div>` : '';

  el.innerHTML = (ro ? '<p class="text-muted" style="margin-bottom:12px">Somente leitura — apenas Admin pode editar listas.</p>' : '') + listasHTML + contatosHTML + usuariosHTML + niveisHTML;

  // Handlers de níveis (admin) — funcionam mesmo quando ro é false
  if (isAdmin) {
    function salvarNivel(mutator) {
      const c = STORE.getCFG();
      const base = getPermissoes();
      c.niveis = c.niveis || {};
      PAPEIS.forEach(papel => {
        const p = base[papel];
        c.niveis[papel] = c.niveis[papel] || { abas: p.abas === '*' ? ABAS_DISPONIVEIS.slice() : p.abas.slice(), editar: p.editar, cadastrar: p.cadastrar };
        if (Array.isArray(c.niveis[papel].abas) === false) c.niveis[papel].abas = ABAS_DISPONIVEIS.slice();
      });
      mutator(c.niveis);
      STORE.saveCFG(c);
    }
    $$('[data-nivel-aba]', el).forEach(cb => cb.onchange = () => {
      const [papel, aba] = cb.dataset.nivelAba.split('|');
      salvarNivel(niveis => {
        const set = new Set(niveis[papel].abas);
        if (cb.checked) set.add(aba); else set.delete(aba);
        set.add('painel'); // painel sempre disponível
        niveis[papel].abas = ABAS_DISPONIVEIS.filter(a => set.has(a));
      });
      aplicarPermissoes(); // reflete a visibilidade das abas na hora
      toast('Nível atualizado', 'success');
    });
    $$('[data-nivel-flag]', el).forEach(cb => cb.onchange = () => {
      const [papel, flag] = cb.dataset.nivelFlag.split('|');
      salvarNivel(niveis => { niveis[papel][flag] = cb.checked; });
      aplicarPermissoes();
      toast('Nível atualizado', 'success');
    });
    const resetBtn = $('[data-nivel-reset]', el);
    if (resetBtn) resetBtn.onclick = () => {
      const c = STORE.getCFG(); c.niveis = null; STORE.saveCFG(c);
      renderControle(); toast('Níveis restaurados ao padrão', 'success');
    };
  }

  if (ro) return;

  // Handlers de contatos
  $$('[data-cont-del]', el).forEach(b => b.onclick = () => {
    const c = STORE.getCFG();
    (c.funcionarios || []).splice(+b.dataset.contDel, 1);
    STORE.saveCFG(c); renderControle();
  });
  const addCont = $('[data-cont-add]', el);
  if (addCont) addCont.onclick = () => {
    const nome = $('[data-cont-nome]', el).value.trim();
    const numero = $('[data-cont-num]', el).value.trim();
    if (!nome || !numero) { toast('Informe nome e número', 'error'); return; }
    const c = STORE.getCFG();
    c.funcionarios = c.funcionarios || [];
    c.funcionarios.push({ nome, departamento: $('[data-cont-dep]', el).value.trim(), numero });
    STORE.saveCFG(c); renderControle(); toast('Contato adicionado', 'success');
  };

  function addToList(key, val) {
    if (!val.trim()) return;
    const c = STORE.getCFG();
    if (!c[key]) c[key] = [];
    if (!c[key].includes(val.trim())) c[key].push(val.trim());
    STORE.saveCFG(c); renderControle(); toast('Adicionado', 'success');
  }
  $$('[data-cfg-add]', el).forEach(b => b.onclick = () => {
    const key = b.dataset.cfgAdd;
    addToList(key, $(`[data-cfg-input="${key}"]`, el).value);
  });
  $$('[data-cfg-input]', el).forEach(inp => inp.onkeydown = e => {
    if (e.key === 'Enter') addToList(inp.dataset.cfgInput, inp.value);
  });
  $$('[data-cfg-del]', el).forEach(b => b.onclick = () => {
    const [key, val] = b.dataset.cfgDel.split('|');
    const c = STORE.getCFG();
    c[key] = (c[key] || []).filter(x => x !== val);
    STORE.saveCFG(c); renderControle();
  });
  $$('[data-user-del]', el).forEach(b => b.onclick = () => {
    const c = STORE.getCFG();
    c.usuarios.splice(+b.dataset.userDel, 1);
    STORE.saveCFG(c); renderControle();
  });
  const addUser = $('[data-user-add]', el);
  if (addUser) addUser.onclick = () => {
    const nome = $('[data-user-nome]', el).value.trim();
    if (!nome) { toast('Informe o nome', 'error'); return; }
    const c = STORE.getCFG();
    c.usuarios = c.usuarios || [];
    c.usuarios.push({ nome, papel: $('[data-user-papel]', el).value, senha: $('[data-user-senha]', el).value });
    STORE.saveCFG(c); renderControle(); toast('Usuário adicionado', 'success');
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   INSTRUÇÕES (modal acessível pelo topo)
   ══════════════════════════════════════════════════════════════════════════ */
function abrirInstrucoes() {
  const overlay = $('#modal-overlay');
  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1"><div class="modal-title">❔ Como usar o sistema</div></div>
      <button class="modal-close" id="instr-fechar">×</button>
    </div>
    <div class="instrucoes fs-body" style="max-height:70vh;overflow:auto">
      <h2>Visão geral</h2>
      <p>App <strong>offline‑first</strong>: funciona sem internet e sincroniza sozinho ao reconectar. O indicador no topo mostra o estado da sincronização:</p>
      <ul>
        <li><strong>✅ Sincronizado</strong> — tudo salvo na nuvem.</li>
        <li><strong>⏳ N pendente(s)</strong> — N alterações suas aguardando envio (passe o mouse para ver o detalhe). Some sozinho quando reconecta.</li>
        <li><strong>⚠️ Offline</strong> — sem conexão; pode trabalhar normalmente que envia depois.</li>
      </ul>

      <h2>As 2 únicas travas</h2>
      <ul>
        <li><strong>🔒 Saída / liberar carro:</strong> só após <em>Confirmação = Confirmado</em> (POP EXI‑002).</li>
        <li><strong>🔒 Finalizar:</strong> exige PCP liberado + cliente confirmado + Instalação OK + conferido por + ≥1 foto de check‑in (+ problema, se retrabalho).</li>
      </ul>
      <p>Todo o resto é guia — nenhum campo trava por ordem. Preencha na ordem que quiser; a barra de <strong>% preenchida</strong> no topo da ficha mostra o quanto falta.</p>

      <h2>Fluxo típico</h2>
      <ol>
        <li><strong>PCP:</strong> cria/importa a O.S, define itens, clica <em>"✓ Liberar para instalação"</em>.</li>
        <li><strong>Agendamento:</strong> data + período (obrigatório) + equipe → confirma com o cliente.</li>
        <li><strong>Embarque:</strong> confere embarque/produtos/ferramentas e registra o <strong>KM de saída</strong>.</li>
        <li><strong>Execução:</strong> libera o carro (após confirmar), tira fotos de check‑in.</li>
        <li><strong>Check‑out:</strong> registra situação, <strong>KM de retorno</strong> e finaliza. A O.S vai para <em>Finalizados</em>.</li>
      </ol>

      <h2>Abas</h2>
      <ul>
        <li><strong>Painel:</strong> indicadores, trabalhos em execução agora, ranking e tendências. Clique nos números para ver os detalhes.</li>
        <li><strong>PCP:</strong> todas as O.S ordenadas por data de entrega, com % preenchido e responsável.</li>
        <li><strong>Instalação:</strong> quadro <em>Kanban</em> por dia (horário, cliente, O.S). Botão 🖨 gera o espelho do dia.</li>
        <li><strong>Execução / Retrabalho / Finalizados:</strong> acompanhamento na rua, pendências e arquivo.</li>
        <li><strong>Painel de Controle</strong> (admin): listas, usuários, contatos e níveis de acesso.</li>
      </ul>

      <h2>Importar do PDF do ERP</h2>
      <p>Botão <code>📄 Importar PDF</code> no topo cria uma O.S já preenchida (puxa a data de "Entrega"). Dentro de uma O.S aberta dá para importar <em>só os itens</em>.</p>

      <h2>Espelhos &amp; WhatsApp</h2>
      <p>O botão <strong>🪞 Espelhos</strong> (admin) abre as visões somente‑leitura para instaladores e comercial. Na ficha e no PDF do dia há envio rápido via WhatsApp para contatos cadastrados (nome · departamento · número) no Painel de Controle.</p>

      <h2>Backup</h2>
      <p>No <em>Painel</em> há <code>⬇ Backup</code> (baixa um .json) e <code>⬆ Restaurar</code>. A nuvem (Netlify Blobs) é a fonte da verdade; o backup é rede de segurança extra.</p>
    </div>`;
  overlay.classList.remove('hidden');
  $('#instr-fechar').onclick = () => overlay.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════
   BACKUP
   ══════════════════════════════════════════════════════════════════════════ */
function exportarBackup() {
  const data = STORE.exportarBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `impresilk_backup_${ymdLocal(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado', 'success');
}

function importarBackup() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json';
  inp.onchange = () => {
    const file = inp.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm(`Restaurar ${(data.os||[]).length} O.S? Isto substitui o cache local.`)) return;
        STORE.importarBackup(data);
        // re-envia tudo pro servidor
        (data.os || []).forEach(os => STORE.saveOS(os));
        if (data.cfg) STORE.saveCFG(data.cfg);
        renderActiveTab();
        toast('Backup restaurado', 'success');
      } catch (e) { toast('Arquivo inválido', 'error'); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

/* ══════════════════════════════════════════════════════════════════════════
   EXPORTAÇÕES — PDF (window.print) + WhatsApp
   ══════════════════════════════════════════════════════════════════════════ */
function kv(label, val) {
  if (val == null || val === '' || val === false) return '';
  return `<tr><td style="padding:3px 8px;color:#666;font-weight:600;width:38%">${esc(label)}</td><td style="padding:3px 8px">${esc(val)}</td></tr>`;
}

async function exportarFichaPDF(os) {
  const itens = (os.itens || []).map(i =>
    `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.item)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.descricao)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.medidas)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.qtde)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${i.pronto?'✓':''}</td></tr>`
  ).join('');

  // Carrega as imagens anexadas (layout, embarque e check‑in) como base64
  async function imgTag(id, legenda) {
    if (!id) return '';
    try {
      const b64 = await STORE.pullPhoto(id);
      if (!b64) return '';
      const src = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      return `<figure style="margin:0 8px 12px 0;display:inline-block;vertical-align:top">
        <img src="${src}" style="max-width:240px;max-height:240px;border:1px solid #ddd;border-radius:6px">
        ${legenda ? `<figcaption style="font-size:11px;color:#666;text-align:center;margin-top:2px">${esc(legenda)}</figcaption>` : ''}
      </figure>`;
    } catch { return ''; }
  }

  const layoutImg = await imgTag(os.layoutFotoId, 'Layout');
  const embarqueImg = await imgTag(os.fotoEmbarqueId, 'Embarque');
  const checkinImgs = (await Promise.all(
    (os.fotosCheckinIds || []).map((id, i) => imgTag(id, `Check‑in ${i + 1}`))
  )).join('');

  const galeria = (layoutImg || embarqueImg || checkinImgs)
    ? `<h2>5 · Anexos &amp; Fotos</h2><div style="margin-top:6px">${layoutImg}${embarqueImg}${checkinImgs}</div>`
    : '';

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>O.S ${esc(os.numero)}</title>
    <style>body{font-family:-apple-system,Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;background:#f0f4fa;padding:6px 8px;margin:16px 0 4px;border-radius:6px}table{width:100%;border-collapse:collapse;font-size:13px}.date{font-size:15px;color:#0d9488;font-weight:700;margin-bottom:12px}</style>
    </head><body>
    <h1>Impresilk — O.S ${esc(os.numero || '—')}</h1>
    <div class="date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>

    <h2>1 · PCP &amp; Cliente</h2><table>
      ${kv('Cliente', os.cliente)}${kv('Contato', os.contato)}${kv('WhatsApp', os.whatsapp)}
      ${kv('CNPJ/CPF', os.cnpjCpf)}${kv('Endereço', os.endereco)}${kv('Serviço', os.servico)}
      ${kv('Data entrada', os.dataEntrada)}${kv('Responsável PCP', os.responsavelPCP)}${kv('Obs PCP', os.obsPCP)}${kv('Vendedor', os.vendedor)}
      ${kv('Liberado p/ instalação', os.liberadoPCP ? `Sim — ${os.aptoPor||''}` : 'Não')}
    </table>

    <h2>2 · Serviço &amp; Itens</h2><table>${kv('Acesso', os.acesso)}${kv('Fixação', os.fixacao)}${kv('Ferramentas', (os.ferramentas||[]).join(', '))}${kv('Suprimentos', (os.suprimentos||[]).join(', '))}</table>
    <table style="margin-top:6px"><thead><tr><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Item</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Descrição</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Medidas</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Qtde</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">OK</th></tr></thead><tbody>${itens}</tbody></table>

    <h2>3 · Agendamento &amp; Confirmação</h2><table>
      ${kv('Data', fmtInstalacao(os.instalacao))}${kv('Equipe', (os.equipe||[]).join(', '))}
      ${kv('Veículo', os.veiculo)}${kv('Responsável pelo agendamento', Array.isArray(os.responsavelAgenda) ? os.responsavelAgenda.join(', ') : os.responsavelAgenda)}${kv('Obs', os.obsAgenda)}
      ${kv('Confirmação', os.confirmacao)}${kv('Canal', os.confCanal)}${kv('Confirmado por', os.confPor)}
      ${kv('Acompanha (cliente)', os.confAcompanha)}${kv('Contato acompanhante', os.confAcompanhaContato)}
    </table>

    <h2>4 · Embarque &amp; Execução</h2><table>
      ${kv('Embarque conferido por', os.embarqueConferidoPor)}${kv('Produtos conferidos por', os.produtosConferidosPor)}
      ${kv('Ferramentas conferidas', os.ferramentasConferidas ? `Sim — ${os.ferramentasConferidasPor||''}` : '')}
      ${kv('Carro liberado', os.carroLiberado?`Sim — ${os.carroLiberadoPor||''}`:'Não')}
      ${kv('Hora saída', os.horaSaida)}${kv('KM saída', os.kmSaida)}${kv('Hora retorno', os.horaRetorno)}${kv('KM retorno', os.kmRetorno)}
      ${kv('KM rodado', (os.kmSaida && os.kmRetorno && (+os.kmRetorno - +os.kmSaida) >= 0) ? (+os.kmRetorno - +os.kmSaida) + ' km' : '')}
      ${kv('Instalação OK', os.instalacaoOK?'Sim':'Não')}
      ${kv('Conferido por', os.conferidoPor)}${kv('Situação', os.checkout && os.checkout.situacao)}${kv('Retrabalho', os.retrabalho?'Sim':'')}${kv('Problema', os.problema)}${kv('Causa', os.causa)}
      ${kv('Obs técnicas', os.obsTecnicas)}${kv('Fotos check‑in', (os.fotosCheckinIds||[]).length+' foto(s)')}
      ${os.checkinGPS ? kv('Local do check‑in', `${os.checkinGPS.lat}, ${os.checkinGPS.lng} (±${os.checkinGPS.precisao||'?'}m) — maps.google.com/?q=${os.checkinGPS.lat},${os.checkinGPS.lng}`) : ''}
      ${kv('Finalizada', os.finalizadaEm?`${new Date(os.finalizadaEm).toLocaleString('pt-BR')} — ${os.finalizadoPor||''}`:'')}
    </table>

    ${galeria}

    <script>
    // Só imprime depois que TODAS as imagens (base64) terminarem de carregar,
    // senão o PDF sai com a foto em branco (bug do JPG que não aparecia).
    (function(){
      function imprimir(){ setTimeout(function(){ window.print(); }, 250); }
      function aguardar(){
        var imgs = [].slice.call(document.images);
        var faltam = imgs.filter(function(i){ return !i.complete || i.naturalWidth === 0; });
        if (!faltam.length) { imprimir(); return; }
        var resta = faltam.length;
        function ok(){ if (--resta <= 0) imprimir(); }
        faltam.forEach(function(i){ i.addEventListener('load', ok); i.addEventListener('error', ok); });
        setTimeout(imprimir, 4000); // rede de segurança
      }
      window.onload = aguardar;
    })();
    <\/script>
    </body></html>`);
  w.document.close();
}

function montarTextoWhatsApp(os) {
  const co = os.checkout || {};
  return `*O.S ${os.numero || '—'}* — ${os.cliente || ''}\n` +
    `📅 ${fmtInstalacao(os.instalacao)}\n` +
    `📍 ${os.endereco || ''}\n` +
    `👷 ${(os.equipe || []).join(', ') || '—'}\n` +
    (os.confirmacao ? `✅ ${os.confirmacao}\n` : '') +
    (os.finalizadaEm ? `🏁 Finalizada${co.situacao ? ' — ' + co.situacao : ''}\n` : '') +
    `\n_Obs: gere o PDF (🖨) e anexe na conversa, se precisar do documento completo._`;
}

function abrirWhatsApp(os) {
  const txt = montarTextoWhatsApp(os);
  const contatos = (STORE.getCFG().funcionarios || []);
  const numCliente = String(os.whatsapp || '').replace(/\D/g, '');

  // Sem contatos cadastrados e sem número do cliente → compartilhamento genérico
  if (!contatos.length && !numCliente) {
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
    return;
  }

  // Picker de destino
  const old = $('#wpp-picker'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'wpp-picker';
  box.className = 'wpp-picker-overlay';
  const abrir = num => window.open(num ? `https://wa.me/55${num}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  box.innerHTML = `
    <div class="wpp-picker">
      <div class="wpp-picker-head"><strong>💬 Enviar O.S por WhatsApp</strong><button class="modal-close" id="wpp-x">×</button></div>
      <div class="wpp-picker-body">
        <button class="btn-ghost w-100" id="wpp-pdf">🖨 Gerar PDF para anexar</button>
        <p class="text-muted" style="font-size:.78rem;margin:6px 0 8px">Gere o PDF, salve, e anexe na conversa após escolher o contato.</p>
        ${numCliente ? `<button class="btn-success w-100" data-wpp-num="${esc(numCliente)}">📱 Cliente — ${esc(os.cliente||'')}</button>` : ''}
        ${contatos.map((c, i) => `<button class="btn-ghost w-100 mt-6" data-wpp-num="${esc(String(c.numero||'').replace(/\D/g,''))}">👤 ${esc(c.nome)} <span class="text-muted">(${esc(c.departamento||'—')})</span></button>`).join('')}
        <button class="btn-ghost w-100 mt-6" data-wpp-num="">🔗 Escolher na hora (sem número)</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const fechar = () => box.remove();
  $('#wpp-x', box).onclick = fechar;
  box.onclick = e => { if (e.target === box) fechar(); };
  $('#wpp-pdf', box).onclick = () => exportarFichaPDF(os);
  $$('[data-wpp-num]', box).forEach(b => b.onclick = () => { abrir(b.dataset.wppNum); fechar(); });
}

function exportarDiaPDF(dia, lista) {
  const d = parseLocalDate(dia);
  const titulo = d ? `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : dia;
  const ordenada = lista.slice().sort((a, b) => ordemHora(a).localeCompare(ordemHora(b)));
  const logo = (typeof LOGO_IMPRESILK !== 'undefined') ? `<img src="${LOGO_IMPRESILK}" style="height:34px">` : '';

  // Tabela-resumo com Horário
  const linhas = ordenada.map(os => `<tr>
    <td style="padding:5px 8px;border-bottom:1px solid #eee;white-space:nowrap"><strong>${esc(rotuloHora(os))}</strong></td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee"><strong>${esc(os.numero||'—')}</strong></td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(os.cliente)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(os.endereco||'')}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc((os.equipe||[]).join(', '))}</td>
  </tr>`).join('');

  // Espelho do instalador: equipamentos (ferramentas) + suprimentos por O.S
  const espelho = ordenada.map(os => {
    const ferr = (os.ferramentas || []);
    const sup  = (os.suprimentos || []);
    return `<div class="esp-os">
      <div class="esp-head"><strong>⏰ ${esc(rotuloHora(os))}</strong> · O.S ${esc(os.numero||'—')} — ${esc(os.cliente||'')}</div>
      <div class="esp-end">📍 ${esc(os.endereco||'—')}</div>
      <div class="esp-eq">👷 ${esc((os.equipe||[]).join(', ')||'—')}${os.veiculo?` · 🚚 ${esc(os.veiculo)}`:''}</div>
      <div class="esp-cols">
        <div><span class="esp-lbl">🛠 Equipamentos</span>${ferr.length?`<ul>${ferr.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:'<p class="esp-vazio">—</p>'}</div>
        <div><span class="esp-lbl">📦 Suprimentos</span>${sup.length?`<ul>${sup.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'<p class="esp-vazio">—</p>'}</div>
      </div>
    </div>`;
  }).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Programação ${esc(titulo)}</title>
    <style>
      body{font-family:-apple-system,Arial,sans-serif;padding:24px;color:#111}
      .top{display:flex;align-items:center;gap:12px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
      h1{font-size:18px;margin:0}
      th{text-align:left;padding:5px 8px;border-bottom:2px solid #ccc;font-size:12px;color:#666}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
      h2{font-size:14px;margin:18px 0 8px}
      .esp-os{border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
      .esp-head{font-size:14px;margin-bottom:2px}
      .esp-end,.esp-eq{font-size:12px;color:#444;margin-bottom:2px}
      .esp-cols{display:flex;gap:24px;margin-top:8px}
      .esp-cols>div{flex:1}
      .esp-lbl{display:block;font-size:11px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:2px}
      .esp-cols ul{margin:0;padding-left:18px;font-size:13px}
      .esp-vazio{margin:0;color:#999;font-size:13px}
      @media print{.esp-os{border-color:#bbb}}
    </style></head><body>
    <div class="top">${logo}<h1>Programação — ${esc(titulo)}</h1></div>
    <table><thead><tr><th>Horário</th><th>O.S</th><th>Cliente</th><th>Endereço</th><th>Equipe</th></tr></thead><tbody>${linhas}</tbody></table>
    <h2>Espelho do instalador — equipamentos &amp; suprimentos</h2>
    ${espelho || '<p style="color:#999">Sem O.S neste dia.</p>'}
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

// Data de hoje em formato YYYY-MM-DD (local).
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// O.S agendadas para um dia, ordenadas por horário.
function servicosDoDia(dataISO) {
  return STORE.getAllOS()
    .filter(o => (o.instalacao && o.instalacao.data) === dataISO)
    .sort((a, b) => ordemHora(a).localeCompare(ordemHora(b)));
}

// Lista de serviços do dia via WhatsApp (link de compartilhamento).
function whatsappServicosDia(dataISO) {
  const lista = servicosDoDia(dataISO);
  if (!lista.length) { toast('Nenhum serviço agendado nesse dia', 'error'); return; }
  abrirWhatsAppDia(dataISO, lista);
}

// Relatório dos serviços do dia em PDF (impressão).
function relatorioServicosDia(dataISO) {
  const lista = servicosDoDia(dataISO);
  if (!lista.length) { toast('Nenhum serviço agendado nesse dia', 'error'); return; }
  const d = parseLocalDate(dataISO);
  const titulo = d
    ? `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    : dataISO;
  const linhas = lista.map(os => {
    const st = calcStatus(os);
    const alerta = estaAtrasada(os) ? ' style="background:#fff5f5"' : (os.retrabalho ? ' style="background:#fff5f5"' : '');
    return `<tr${alerta}>
      <td>${esc(rotuloHora(os))}</td>
      <td>${esc(os.numero || '—')}</td>
      <td>${esc(os.cliente || '')}</td>
      <td>${esc(os.endereco || '')}</td>
      <td>${esc((os.equipe || []).join(', '))}</td>
      <td>${esc(os.veiculo || '')}</td>
      <td>${esc(STATUS_LABEL[st])}</td>
    </tr>`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Serviços ${esc(titulo)}</title>
    <style>body{font-family:-apple-system,Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}.date{font-size:15px;color:#0d9488;font-weight:700;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;background:#f0f4fa;padding:6px;border-bottom:2px solid #ccc}td{padding:5px 6px;border-bottom:1px solid #eee}</style>
    </head><body>
    <h1>Impresilk — Serviços do dia</h1>
    <div class="date">📅 ${esc(titulo)} · ${lista.length} serviço(s)</div>
    <table><thead><tr><th>Hora</th><th>O.S</th><th>Cliente</th><th>Endereço</th><th>Equipe</th><th>Veículo</th><th>Status</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
    </body></html>`);
  w.document.close();
}

function abrirWhatsAppDia(dia, lista) {
  const d = parseLocalDate(dia);
  const titulo = d ? `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` : dia;
  let txt = `*Programação ${titulo}*\n\n`;
  lista.forEach(os => {
    txt += `*O.S ${os.numero||'—'}* — ${os.cliente||''}\n📍 ${os.endereco||''}\n⏰ ${os.instalacao?.periodo||''} · 👷 ${(os.equipe||[]).join(', ')||'—'}\n\n`;
  });
  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
}

// __EXPORTS__

/* ══════════════════════════════════════════════════════════════════════════
   IMPORTAR O.S DO PDF DO ERP (pdf.js)
   ══════════════════════════════════════════════════════════════════════════ */
// Lê o PDF retornando texto por linhas E itens com posição (x,y,página)
async function lerPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js indisponível (sem internet) — use o cadastro manual.');
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let texto = '';
  const itensPos = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    content.items.forEach(it => {
      if (!it.str.trim()) return;
      itensPos.push({ str: it.str, x: it.transform[4], y: Math.round(it.transform[5]), page: p });
    });
    // texto reconstruído por linha (posição Y)
    const linhas = {};
    content.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      (linhas[y] = linhas[y] || []).push(it.str);
    });
    Object.keys(linhas).sort((a, b) => b - a).forEach(y => { texto += linhas[y].join(' ') + '\n'; });
  }
  return { texto, itensPos };
}

function nearestCol(x, cols) {
  let best = cols[0], bd = Infinity;
  for (const c of cols) { const d = Math.abs(x - c.x); if (d < bd) { bd = d; best = c; } }
  return best.k;
}

// Cabeçalho em 3 colunas (Cliente | Contato | Telefone) e 2 colunas (CNPJ | Endereço)
// usando a posição X de cada rótulo. Mais robusto que regex por linha.
function parseCabecalho(itensPos, os) {
  if (!itensPos || !itensPos.length) return false;
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const lbl = re => itensPos.find(i => re.test(norm(i.str)));

  const Lcli  = lbl(/^Cliente$/i);
  const Lcon  = lbl(/^Contato$/i);
  const Ltel  = lbl(/^Telefone$|^Fone$|^WhatsApp$|^Celular$/i);
  const Lcnpj = lbl(/^CNPJ\/CPF$/i) || lbl(/^CNPJ/i);
  const Lend  = lbl(/^Endere[çc]o$/i);
  const Lentr = lbl(/^Entrega/i);
  if (!Lcli) return false;

  const pg = Lcli.page;
  const join = arr => arr.sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  const within = (i, yTop, yBot) => i.page === pg && i.y < yTop - 3 && i.y > yBot + 3;

  // Bloco 1: Cliente / Contato / Telefone
  const cols1 = [{ k: 'cliente', x: Lcli.x }];
  if (Lcon) cols1.push({ k: 'contato', x: Lcon.x });
  if (Ltel) cols1.push({ k: 'telefone', x: Ltel.x });
  const yBot1 = Lcnpj ? Lcnpj.y : (Lentr ? Lentr.y : -Infinity);
  const b1 = { cliente: [], contato: [], telefone: [] };
  itensPos.filter(i => within(i, Lcli.y, yBot1)).forEach(i => b1[nearestCol(i.x, cols1)].push(i));

  // Contato: somente o nome (primeira linha = maior Y), sem cargo/e-mail/etc.
  const primeiraLinha = arr => {
    if (!arr.length) return '';
    const yTop = Math.max(...arr.map(i => i.y));
    return arr.filter(i => Math.abs(i.y - yTop) <= 3)
      .sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  };

  os.cliente  = join(b1.cliente);
  os.contato  = primeiraLinha(b1.contato);   // apenas o nome
  os.whatsapp = join(b1.telefone);   // Telefone → WhatsApp

  // Bloco 2: CNPJ / Endereço
  if (Lcnpj) {
    const cols2 = [{ k: 'cnpj', x: Lcnpj.x }];
    if (Lend) cols2.push({ k: 'endereco', x: Lend.x });
    const yBot2 = Lentr ? Lentr.y : -Infinity;
    const b2 = { cnpj: [], endereco: [] };
    itensPos.filter(i => within(i, Lcnpj.y, yBot2)).forEach(i => b2[nearestCol(i.x, cols2)].push(i));
    const cnpjTxt = join(b2.cnpj);
    const m = cnpjTxt.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
    os.cnpjCpf = m ? m[0] : cnpjTxt;
    os.endereco = join(b2.endereco);
  }
  return true;
}

function parsePDF(texto, itensPos) {
  const os = novaOS();
  const find = (re) => { const m = texto.match(re); return m ? m[1].trim() : ''; };

  os.numero  = find(/Ordem de servi[çc]o[:\s]*([0-9]+)/i) || find(/O\.?S[:\s]*([0-9]+)/i);
  os.servico = find(/Ref\.?[:\s]*(.+)/i);
  os.vendedor = find(/Vendedor[:\s]*(.+?)(?:\s{2,}|$)/i);
  os.dataEntrada = converterDataBR(find(/Aprova[çc][ãa]o[:\s]*([\d/]+)/i));

  // Cabeçalho por colunas (cliente/contato/telefone/cnpj/endereço)
  const ok = parseCabecalho(itensPos, os);
  if (!ok) {
    // fallback por regex de linha
    os.cliente  = find(/Cliente[:\s]*(.+)/i);
    os.contato  = find(/Contato[:\s]*(.+)/i);
    os.whatsapp = find(/(?:WhatsApp|Telefone|Fone|Celular)[:\s]*([\d()+\-\s]+)/i);
    os.cnpjCpf  = find(/(?:CNPJ|CPF)[:\s]*([\d./\-]+)/i);
    os.endereco = find(/Endere[çc]o[:\s]*(.+)/i);
  }

  // Entrega: "29/06/2026 às 14:00" → data + hora de instalação
  const entrega = texto.match(/Entrega[:\s]*([\d]{2}\/[\d]{2}\/[\d]{4})(?:\s*(?:às|as)?\s*([\d]{2}:[\d]{2}))?/i);
  if (entrega) {
    os.instalacao.data = converterDataBR(entrega[1]);
    if (entrega[2]) {
      os.instalacao.hora = entrega[2];
      const h = parseInt(entrega[2].split(':')[0], 10);
      os.instalacao.periodo = h >= 12 ? 'Tarde' : 'Manhã';
    } else {
      os.instalacao.periodo = 'Manhã';
    }
  }

  os.itens = parseItensPDF(texto);
  return os;
}

// dd/mm/yyyy → yyyy-mm-dd (local, sem fuso)
function converterDataBR(str) {
  if (!str) return '';
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function parseItensPDF(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const itens = [];
  let n = 1, started = false, descBuf = [];
  const VAL = /R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;

  for (const linha of linhas) {
    if (/^Item\b.*Descri/i.test(linha)) { started = true; descBuf = []; continue; }
    if (!started) continue;
    if (/^(Descontos?|Total|Sinal|Saldo|Subtotal|Faturamento|Log[íi]stica|Parcela|Vencimento)/i.test(linha)) { started = false; continue; }

    const medida = linha.match(/(\d+[.,]\d+)\s*[xX]\s*(\d+[.,]\d+)/);
    const valores = linha.match(VAL);
    if (medida && valores && valores.length) {
      const aposMedida = linha.slice(medida.index + medida[0].length);
      const qm = aposMedida.match(/\b(\d{1,4})\b/);
      const valorUnit = parseBRNumber(valores.length >= 2 ? valores[valores.length - 2] : valores[0]);
      const subtotal  = parseBRNumber(valores[valores.length - 1]);
      let desc = descBuf.join(' ').replace(/^\d+\s*/, '').replace(/\.\.\./g, '').replace(/\s+/g, ' ').trim();
      const pre = linha.slice(0, medida.index).replace(/^\d+\s*/, '').replace(/\.\.\./g, '').trim();
      if (pre) desc = (desc + ' ' + pre).trim();
      itens.push({
        item: String(n++),
        descricao: desc || 'Item',
        medidas: `${medida[1]}x${medida[2]}`,
        qtde: qm ? qm[1] : '1',
        valorUnit: String(valorUnit),
        subtotal, pronto: false
      });
      descBuf = [];
    } else {
      descBuf.push(linha);
    }
  }
  return itens;
}

function importarPDF() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/pdf';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      toast('Lendo PDF…');
      const { texto, itensPos } = await lerPDF(file);
      const os = parsePDF(texto, itensPos);
      if (!os.instalacao.periodo) os.instalacao.periodo = 'Manhã';
      openModal(os);
      toast('O.S importada — confira os campos', 'success');
    } catch (e) {
      toast(e.message || 'Falha ao ler PDF — use cadastro manual', 'error');
      openModal(novaOS());
    }
  };
  inp.click();
}

function importarItensPDF(draft) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/pdf';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      toast('Lendo itens…');
      const { texto } = await lerPDF(file);
      const itens = parseItensPDF(texto);
      if (!itens.length) { toast('Nenhum item reconhecido', 'warn'); return; }
      draft.itens = (draft.itens || []).concat(itens);
      saveDraft(); reRenderModalKeepOpen();
      toast(`${itens.length} item(ns) importado(s)`, 'success');
    } catch (e) {
      toast(e.message || 'Falha ao ler PDF', 'error');
    }
  };
  inp.click();
}

// __PDF_IMPORT__

/* ══════════════════════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', initLogin);
