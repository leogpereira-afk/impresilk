// app.js — Página de gestão (PCP, Montagem, Operação, Comercial)
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   PERMISSÕES POR PAPEL (identificação, não segurança)
   ══════════════════════════════════════════════════════════════════════════ */
const PERMISSOES = {
  admin:     { abas: '*', editar: true,  cadastrar: true  },
  pcp:       { abas: ['painel','pcp','programacao','execucao','retrabalho','controle','instrucoes'], editar: true, cadastrar: false },
  montagem:  { abas: ['painel','pcp','programacao','execucao','retrabalho','instrucoes'], editar: true, cadastrar: false },
  operacao:  { abas: ['painel','pcp','programacao','execucao','retrabalho','instrucoes'], editar: true, cadastrar: false },
  comercial: { abas: ['painel','pcp','programacao','instrucoes'], editar: false, cadastrar: false }
};

const SENHAS = { admin: 'admin', comercial: 'comercial', pcp: '', montagem: '', operacao: '' };

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
  aplicarPermissoes();
  initTabs();
  initTopbar();
  initSyncIndicator();
  initConflictDialog();

  // Pull inicial + CFG, depois render
  STORE.pullCFG();
  STORE.pull(() => renderActiveTab());
  STORE.trySync();
  renderActiveTab();

  // Pull periódico a cada 30s
  setInterval(() => { STORE.pull(() => renderActiveTab()); STORE.trySync(); }, 30000);
}

function aplicarPermissoes() {
  const perm = PERMISSOES[STATE.user.papel] || PERMISSOES.comercial;
  document.body.classList.toggle('somente-leitura', !perm.editar);

  $$('.tab').forEach(t => {
    const tab = t.dataset.tab;
    const allowed = perm.abas === '*' || perm.abas.includes(tab);
    t.classList.toggle('hidden', !allowed);
  });
}

function podeEditar() {
  const perm = PERMISSOES[STATE.user.papel] || PERMISSOES.comercial;
  return !!perm.editar;
}
function podeCadastrar() {
  const perm = PERMISSOES[STATE.user.papel] || PERMISSOES.comercial;
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
  $('#btn-logout').onclick = () => {
    STORE.setUser(null);
    location.reload();
  };
}

function initSyncIndicator() {
  const el = $('#sync-indicator');
  STORE.onSync((status, pending) => {
    el.className = 'sync-indicator ' + status;
    if (status === 'ok')      el.textContent = '✅';
    else if (status === 'pending') el.textContent = `⏳ ${pending}`;
    else                      el.textContent = '⚠️';
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
    case 'controle':    renderControle(); break;
    case 'instrucoes':  renderInstrucoes(); break;
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
    responsavelPCP: '', layoutFotoId: '', liberadoPCP: false, aptoPor: '', aptoEm: '',
    acesso: '', fixacao: '', ferramentas: [], itens: [],
    instalacao: { data: '', periodo: '', hora: '', duracaoDias: 1 },
    equipe: [], veiculo: '', responsavelAgenda: '', obsAgenda: '',
    confirmacao: '', confCanal: '', confHora: '', confPor: '', confObs: '',
    gerenteMontagem: '', ferramentasConferidas: false, fotoEmbarqueId: '',
    carroLiberado: false, carroLiberadoPor: '', carroLiberadoEm: '',
    horaSaida: '', horaRetorno: '', instalacaoOK: false, conferidoPor: '',
    retrabalho: false, problema: '', causa: '', resolvidoPor: '', dataResolvido: '',
    obsTecnicas: '', fotosCheckinIds: [],
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

function openModal(os) {
  _modalDraft = JSON.parse(JSON.stringify(os));
  _modalDirty = false;
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

  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">O.S ${esc(os.numero || '(nova)')}</div>
        <div class="modal-meta">Atualizado por ${esc(os.atualizadoPor || '—')}${os.atualizadoEm ? ' · ' + new Date(os.atualizadoEm).toLocaleString('pt-BR') : ''}</div>
      </div>
      <span class="modal-status badge st-${st}">${STATUS_LABEL[st]}</span>
      <button class="modal-close" id="modal-close-btn">×</button>
    </div>

    <div class="checklist-bar">${checklistBar}</div>

    ${blocoPCP(os, ro)}
    ${blocoItens(os, ro)}
    ${blocoAgenda(os, ro)}
    ${blocoExec(os, ro)}

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
function blocoPCP(os, ro) {
  const lib = os.liberadoPCP;
  return `
  <details class="card-fs" open data-bloco="pcp">
    <summary>1 · PCP &amp; Cliente</summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Nº O.S</label><input data-f="numero" value="${esc(os.numero)}"></div>
        <div class="field"><label>Serviço (Ref.)</label><input data-f="servico" value="${esc(os.servico)}"></div>
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
        <div class="field"><label>Responsável PCP *</label><input data-f="responsavelPCP" value="${esc(os.responsavelPCP)}" placeholder="obrigatório"></div>
        <div class="field"><label>Vendedor</label><input data-f="vendedor" value="${esc(os.vendedor)}"></div>
      </div>
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
function blocoItens(os, ro) {
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
  <details class="card-fs" data-bloco="itens">
    <summary>2 · Serviço &amp; Itens <span class="item-progress" style="margin-left:auto">${prontos}/${itens.length} prontos</span></summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Acesso</label><select data-f="acesso"><option value=""></option>${acessoOpts}</select></div>
        <div class="field"><label>Fixação</label><select data-f="fixacao"><option value=""></option>${fixOpts}</select></div>
      </div>
      <div class="field">
        <label>Ferramentas</label>
        ${chipsField('ferramentas', os.ferramentas || [], cfg.ferramentas, ro)}
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
function blocoAgenda(os, ro) {
  const cfg = STORE.getCFG();
  const inst = os.instalacao || {};
  const periodoOpts = PERIODO_OPTS.map(o => `<option ${inst.periodo === o ? 'selected' : ''}>${o}</option>`).join('');
  const confClass = os.confirmacao === 'Confirmado' ? 'confirmado'
    : os.confirmacao === 'Pendente' ? 'pendente'
    : os.confirmacao === 'Recusado' ? 'recusado' : 'nenhum';
  const confOpts = CONF_OPTS.map(o => `<option value="${o}" ${os.confirmacao === o ? 'selected' : ''}>${o || '— selecionar —'}</option>`).join('');

  return `
  <details class="card-fs" data-bloco="agenda">
    <summary>3 · Agendamento &amp; Confirmação</summary>
    <div class="fs-body">
      <div class="field-row3">
        <div class="field"><label>Data instalação</label><input type="date" data-f="instalacao.data" value="${esc(inst.data)}"></div>
        <div class="field"><label>Período *</label><select data-f="instalacao.periodo"><option value=""></option>${periodoOpts}</select></div>
        <div class="field"><label>Hora (se "Horário")</label><input type="time" data-f="instalacao.hora" value="${esc(inst.hora)}"></div>
      </div>
      <div class="field-row3">
        <div class="field"><label>Duração (dias)</label><input type="number" min="1" data-f="instalacao.duracaoDias" value="${esc(inst.duracaoDias || 1)}"></div>
        <div class="field"><label>Responsável agenda</label><input data-f="responsavelAgenda" value="${esc(os.responsavelAgenda)}"></div>
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
        <button class="btn-success btn-sm edit-only mt-8" id="btn-confirmei">✓ Confirmei agora</button>
      </div>
    </div>
  </details>`;
}

/* ── Bloco 4: Embarque & Execução ────────────────────────────────────────── */
function blocoExec(os, ro) {
  const cfg = STORE.getCFG();
  const confirmado = os.confirmacao === 'Confirmado';
  const fotos = (os.fotosCheckinIds || []);
  const causaOpts = (cfg.causas_retrabalho || []).map(c => `<option ${os.causa === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const co = os.checkout || {};

  return `
  <details class="card-fs" data-bloco="exec">
    <summary>4 · Embarque &amp; Execução</summary>
    <div class="fs-body">
      <div class="field-row">
        <div class="field"><label>Gerente de montagem</label><input data-f="gerenteMontagem" value="${esc(os.gerenteMontagem)}"></div>
        <div class="field" style="justify-content:flex-end"><label><input type="checkbox" data-f-check="ferramentasConferidas" ${os.ferramentasConferidas?'checked':''}> Ferramentas conferidas</label></div>
      </div>
      <div class="field">
        <label>Foto de embarque</label>
        <div class="foto-box" data-foto-single="fotoEmbarqueId">
          ${os.fotoEmbarqueId ? `<img data-foto-img="${esc(os.fotoEmbarqueId)}" alt="embarque">` : '<span class="foto-hint">📎 Anexar foto de embarque</span>'}
          <input type="file" accept="image/*" data-foto-input="fotoEmbarqueId" ${ro?'disabled':''}>
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
        <div class="field"><label>Hora retorno</label><input type="time" data-f="horaRetorno" value="${esc(os.horaRetorno)}"></div>
      </div>
      <div class="field-row">
        <div class="field" style="justify-content:flex-end"><label><input type="checkbox" data-f-check="instalacaoOK" ${os.instalacaoOK?'checked':''}> Instalação OK</label></div>
        <div class="field"><label>Conferido por</label><input data-f="conferidoPor" value="${esc(os.conferidoPor)}"></div>
      </div>

      <div class="field"><label><input type="checkbox" data-f-check="retrabalho" ${os.retrabalho?'checked':''}> Retrabalho?</label></div>
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
          <input type="file" accept="image/*" multiple data-foto-checkin-input ${ro?'disabled':''}>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
        <strong style="font-size:.85rem">Check‑out</strong>
        <div class="field-row3 mt-8">
          <div class="field"><label>Situação</label><input data-f="checkout.situacao" value="${esc(co.situacao)}"></div>
          <div class="field"><label>Hora</label><input type="time" data-f="checkout.hora" value="${esc(co.hora)}"></div>
          <div class="field"><label>Por</label><input data-f="checkout.por" value="${esc(co.por)}"></div>
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
function chipsField(field, values, options, ro) {
  const chips = values.map(v => `<span class="chip">${esc(v)}<button class="chip-rm edit-only" data-chip-rm="${field}|${esc(v)}">×</button></span>`).join('');
  const datalistId = `dl-${field}`;
  return `
    <div class="chips-wrap" data-chips="${field}">
      ${chips}
      <input class="chips-input edit-only" data-chip-input="${field}" list="${datalistId}" placeholder="+ adicionar" ${ro?'disabled':''}>
      <datalist id="${datalistId}">${(options||[]).map(o=>`<option value="${esc(o)}">`).join('')}</datalist>
    </div>`;
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

  // Chips
  $$('[data-chip-input]', root).forEach(inp => {
    inp.onkeydown = e => {
      if (e.key === 'Enter' && inp.value.trim()) {
        e.preventDefault();
        const f = inp.dataset.chipInput;
        if (!_modalDraft[f]) _modalDraft[f] = [];
        if (!_modalDraft[f].includes(inp.value.trim())) _modalDraft[f].push(inp.value.trim());
        saveDraft(); reRenderModalKeepOpen();
      }
    };
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
  return `
    <div class="os-card st-${st}" data-os-id="${esc(os.id)}">
      <div class="card-header">
        <div>
          <div class="card-numero">O.S ${esc(os.numero || '—')}</div>
          <div class="card-cliente">${esc(os.cliente || 'Sem cliente')}</div>
        </div>
        <span class="badge st-${st}" style="margin-left:auto">${STATUS_LABEL[st]}</span>
      </div>
      <div class="card-date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      ${(os.equipe||[]).length ? `<div class="card-equipe">👷 ${esc(os.equipe.join(', '))}</div>` : ''}
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
  const all = STORE.getAllOS().slice().sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
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

function renderPainelKPIs() {
  const el = $('#painel-content');
  const todas = STORE.getAllOS().filter(osNoRange);
  const finalizadas = todas.filter(o => o.finalizadaEm);
  const comRetrab = finalizadas.filter(o => o.retrabalho).length;
  const horas = finalizadas.map(horasExec).filter(h => h != null);
  const mediaH = horas.length ? (horas.reduce((a, b) => a + b, 0) / horas.length) : 0;

  // Tabela por instalador
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
  const linhas = Object.entries(porInst).sort((a, b) => b[1].entregas - a[1].entregas).map(([nome, d]) => {
    const mh = d.horas.length ? (d.horas.reduce((a, b) => a + b, 0) / d.horas.length).toFixed(1) : '—';
    return `<tr><td>${esc(nome)}</td><td>${d.entregas}</td><td>${d.entregas?Math.round(d.retrab/d.entregas*100):0}%</td><td>${d.entregas?Math.round(d.checkin/d.entregas*100):0}%</td><td>${mh}h</td></tr>`;
  }).join('');

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-val">${todas.length}</div><div class="kpi-lbl">O.S no período</div></div>
      <div class="kpi-card"><div class="kpi-val">${finalizadas.length}</div><div class="kpi-lbl">Finalizadas</div></div>
      <div class="kpi-card"><div class="kpi-val">${comRetrab}</div><div class="kpi-lbl">Com retrabalho</div></div>
      <div class="kpi-card"><div class="kpi-val">${mediaH.toFixed(1)}h</div><div class="kpi-lbl">Média execução</div></div>
    </div>
    <h3 style="margin:8px 0;font-size:.9rem;color:var(--muted)">Desempenho por instalador</h3>
    <table class="control-table">
      <thead><tr><th>Instalador</th><th>Entregas</th><th>%Retrab</th><th>%Check‑in</th><th>Média h</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:12px">Sem dados no período</td></tr>'}</tbody>
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
        <button id="vt-cal" class="${STATE.calView==='cal'?'active':''}">📅 Calendário</button>
        <button id="vt-lista" class="${STATE.calView==='lista'?'active':''}">☰ Lista</button>
      </div>
    </div>
    <div id="prog-content"></div>`;
  $('#vt-cal').onclick = () => { STATE.calView = 'cal'; renderProgramacao(); };
  $('#vt-lista').onclick = () => { STATE.calView = 'lista'; renderProgramacao(); };
  if (STATE.calView === 'cal') renderCalendario();
  else renderProgLista();
}

function renderProgLista() {
  const el = $('#prog-content');
  const list = STORE.getAllOS()
    .filter(o => o.instalacao && o.instalacao.data)
    .sort((a, b) => a.instalacao.data.localeCompare(b.instalacao.data));
  el.innerHTML = `<div class="cards-grid">${list.map(osCardHTML).join('') || '<p class="text-muted">Nenhuma O.S agendada.</p>'}</div>`;
  bindCardClicks(el);
}

function renderCalendario() {
  const el = $('#prog-content');
  const ref = STATE.calRef;
  const ano = ref.getFullYear(), mes = ref.getMonth();

  // início no domingo da 1ª semana
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(primeiro);
  inicio.setDate(1 - primeiro.getDay());

  const hojeStr = ymdLocal(new Date());
  const all = STORE.getAllOS().filter(o => o.instalacao && o.instalacao.data);

  // indexa O.S por dia (considerando duracaoDias)
  const porDia = {};
  all.forEach(os => {
    const d0 = parseLocalDate(os.instalacao.data);
    if (!d0) return;
    const dur = Math.max(1, os.instalacao.duracaoDias || 1);
    for (let i = 0; i < dur; i++) {
      const d = new Date(d0); d.setDate(d0.getDate() + i);
      const key = ymdLocal(d);
      (porDia[key] = porDia[key] || []).push({ os, pos: dur === 1 ? 'single' : (i === 0 ? 'start' : (i === dur - 1 ? 'end' : 'mid')) });
    }
  });

  let html = `
    <div class="cal-toolbar">
      <button class="btn-ghost btn-sm" id="cal-prev">‹</button>
      <span class="cal-title">${MESES[mes]} ${ano}</span>
      <button class="btn-ghost btn-sm" id="cal-next">›</button>
      <button class="btn-ghost btn-sm" id="cal-hoje">Hoje</button>
    </div>
    <table class="cal-grid"><thead><tr>${DIAS_SEMANA.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`;

  const cur = new Date(inicio);
  for (let w = 0; w < 6; w++) {
    html += '<tr>';
    for (let d = 0; d < 7; d++) {
      const key = ymdLocal(cur);
      const isOther = cur.getMonth() !== mes;
      const isToday = key === hojeStr;
      const isSel = key === STATE.selectedDay;
      const chips = (porDia[key] || []).slice(0, 4).map(({ os, pos }) => {
        const st = calcStatus(os);
        const cls = pos === 'single' ? '' : `multi-${pos}`;
        return `<span class="cal-chip st-${st} ${cls}" data-cal-os="${esc(os.id)}">${esc(os.numero || os.cliente || 'O.S')}</span>`;
      }).join('');
      const extra = (porDia[key] || []).length > 4 ? `<span class="cal-chip" style="background:#eee">+${(porDia[key].length - 4)}</span>` : '';
      html += `<td class="${isOther?'other-month':''} ${isToday?'today':''} ${isSel?'selected':''}" data-cal-day="${key}">
        <div class="cal-day-num">${cur.getDate()}</div>${chips}${extra}</td>`;
      cur.setDate(cur.getDate() + 1);
    }
    html += '</tr>';
  }
  html += '</tbody></table><div id="cal-day-detail"></div>';
  el.innerHTML = html;

  $('#cal-prev').onclick = () => { STATE.calRef = new Date(ano, mes - 1, 1); renderCalendario(); };
  $('#cal-next').onclick = () => { STATE.calRef = new Date(ano, mes + 1, 1); renderCalendario(); };
  $('#cal-hoje').onclick = () => { STATE.calRef = new Date(); STATE.selectedDay = hojeStr; renderCalendario(); };

  $$('[data-cal-os]', el).forEach(c => c.onclick = e => {
    e.stopPropagation();
    const os = STORE.getOS(c.dataset.calOs);
    if (os) openModal(os);
  });
  $$('[data-cal-day]', el).forEach(td => td.onclick = () => {
    STATE.selectedDay = td.dataset.calDay;
    renderCalendario();
  });

  if (STATE.selectedDay) renderDiaDetalhe(porDia[STATE.selectedDay] || []);
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
    <div class="os-list-item st-${st}" data-os-id="${esc(os.id)}">
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
        return `<div class="os-list-item st-${calcStatus(os)}" data-os-id="${esc(os.id)}">
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
   ABA: PAINEL DE CONTROLE (gerencia o CFG)
   ══════════════════════════════════════════════════════════════════════════ */
const CFG_LISTAS = [
  { key: 'instaladores',      label: 'Instaladores' },
  { key: 'veiculos',          label: 'Veículos' },
  { key: 'responsaveis',      label: 'Responsáveis' },
  { key: 'ferramentas',       label: 'Ferramentas' },
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

  el.innerHTML = (ro ? '<p class="text-muted" style="margin-bottom:12px">Somente leitura — apenas Admin pode editar listas.</p>' : '') + listasHTML + usuariosHTML;

  if (ro) return;

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
   ABA: INSTRUÇÕES
   ══════════════════════════════════════════════════════════════════════════ */
function renderInstrucoes() {
  $('#panel-instrucoes').innerHTML = `
    <div class="instrucoes">
      <h2>Como usar</h2>
      <p>App offline‑first. Trabalha sem internet e sincroniza sozinho quando reconecta. O indicador no topo mostra: ✅ sincronizado · ⏳ pendente · ⚠️ offline.</p>

      <h3>As 2 únicas travas</h3>
      <ul>
        <li><strong>🔒 Saída / liberar carro:</strong> só após <em>Confirmação = Confirmado</em> (POP EXI‑002).</li>
        <li><strong>🔒 Finalizar:</strong> exige PCP liberado + cliente confirmado + Instalação OK + conferido por + ≥1 foto de check‑in (+ problema, se retrabalho).</li>
      </ul>
      <p>Todo o resto é guia — nenhum campo trava por ordem. Você preenche na ordem que quiser.</p>

      <h3>Fluxo típico</h3>
      <ul>
        <li><strong>PCP:</strong> cria/importa O.S, define itens, clica <em>"✓ Liberar para instalação"</em>.</li>
        <li><strong>Agendamento:</strong> data + período (obrigatório) + equipe → confirma com o cliente.</li>
        <li><strong>Execução:</strong> libera o carro (após confirmar), tira fotos de check‑in, finaliza.</li>
      </ul>

      <h3>Importar do PDF do ERP</h3>
      <p>Botão <code>📄 PDF</code> na barra de topo cria uma O.S já preenchida (puxa a data de "Entrega"). Dentro de uma O.S aberta dá para importar <em>só os itens</em>.</p>

      <h3>Espelho do instalador</h3>
      <p>Os instaladores usam <a href="equipe.html" class="inline-link">equipe.html</a> — veem só as O.S aptas atribuídas a eles e editam apenas a execução.</p>

      <h3>Backup</h3>
      <p>No <em>Painel</em> há <code>⬇ Backup</code> (baixa um .json) e <code>⬆ Restaurar</code>. A nuvem (Netlify Blobs) já é a fonte da verdade; o backup é rede de segurança extra.</p>
    </div>`;
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

function exportarFichaPDF(os) {
  const itens = (os.itens || []).map(i =>
    `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.item)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.descricao)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.medidas)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${esc(i.qtde)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${i.pronto?'✓':''}</td></tr>`
  ).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>O.S ${esc(os.numero)}</title>
    <style>body{font-family:-apple-system,Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;background:#f0f4fa;padding:6px 8px;margin:16px 0 4px;border-radius:6px}table{width:100%;border-collapse:collapse;font-size:13px}.date{font-size:15px;color:#0d9488;font-weight:700;margin-bottom:12px}</style>
    </head><body>
    <h1>Impresilk — O.S ${esc(os.numero || '—')}</h1>
    <div class="date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>

    <h2>1 · PCP &amp; Cliente</h2><table>
      ${kv('Cliente', os.cliente)}${kv('Contato', os.contato)}${kv('WhatsApp', os.whatsapp)}
      ${kv('CNPJ/CPF', os.cnpjCpf)}${kv('Endereço', os.endereco)}${kv('Serviço', os.servico)}
      ${kv('Data entrada', os.dataEntrada)}${kv('Responsável PCP', os.responsavelPCP)}${kv('Vendedor', os.vendedor)}
      ${kv('Liberado p/ instalação', os.liberadoPCP ? `Sim — ${os.aptoPor||''}` : 'Não')}
    </table>

    <h2>2 · Serviço &amp; Itens</h2><table>${kv('Acesso', os.acesso)}${kv('Fixação', os.fixacao)}${kv('Ferramentas', (os.ferramentas||[]).join(', '))}</table>
    <table style="margin-top:6px"><thead><tr><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Item</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Descrição</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Medidas</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">Qtde</th><th style="text-align:left;padding:3px 6px;border-bottom:2px solid #ccc">OK</th></tr></thead><tbody>${itens}</tbody></table>

    <h2>3 · Agendamento &amp; Confirmação</h2><table>
      ${kv('Data', fmtInstalacao(os.instalacao))}${kv('Equipe', (os.equipe||[]).join(', '))}
      ${kv('Veículo', os.veiculo)}${kv('Responsável agenda', os.responsavelAgenda)}${kv('Obs', os.obsAgenda)}
      ${kv('Confirmação', os.confirmacao)}${kv('Canal', os.confCanal)}${kv('Confirmado por', os.confPor)}
    </table>

    <h2>4 · Embarque &amp; Execução</h2><table>
      ${kv('Gerente montagem', os.gerenteMontagem)}${kv('Carro liberado', os.carroLiberado?`Sim — ${os.carroLiberadoPor||''}`:'Não')}
      ${kv('Hora saída', os.horaSaida)}${kv('Hora retorno', os.horaRetorno)}${kv('Instalação OK', os.instalacaoOK?'Sim':'Não')}
      ${kv('Conferido por', os.conferidoPor)}${kv('Retrabalho', os.retrabalho?'Sim':'')}${kv('Problema', os.problema)}${kv('Causa', os.causa)}
      ${kv('Obs técnicas', os.obsTecnicas)}${kv('Fotos check‑in', (os.fotosCheckinIds||[]).length+' foto(s)')}
      ${kv('Finalizada', os.finalizadaEm?`${new Date(os.finalizadaEm).toLocaleString('pt-BR')} — ${os.finalizadoPor||''}`:'')}
    </table>

    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
}

function abrirWhatsApp(os) {
  const txt = `*O.S ${os.numero || '—'}* — ${os.cliente || ''}\n` +
    `📅 ${fmtInstalacao(os.instalacao)}\n` +
    `📍 ${os.endereco || ''}\n` +
    `👷 ${(os.equipe || []).join(', ') || '—'}\n` +
    (os.confirmacao ? `✅ ${os.confirmacao}` : '');
  const num = String(os.whatsapp || '').replace(/\D/g, '');
  const url = num ? `https://wa.me/55${num}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`;
  window.open(url, '_blank');
}

function exportarDiaPDF(dia, lista) {
  const d = parseLocalDate(dia);
  const titulo = d ? `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : dia;
  const linhas = lista.map(os => `<tr>
    <td style="padding:5px 8px;border-bottom:1px solid #eee"><strong>${esc(os.numero||'—')}</strong></td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(os.cliente)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(os.endereco||'')}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(os.instalacao?.periodo||'')}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc((os.equipe||[]).join(', '))}</td>
  </tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Programação ${esc(titulo)}</title>
    <style>body{font-family:-apple-system,Arial,sans-serif;padding:24px}h1{font-size:18px}th{text-align:left;padding:5px 8px;border-bottom:2px solid #ccc;font-size:12px;color:#666}</style></head><body>
    <h1>Programação — ${esc(titulo)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>O.S</th><th>Cliente</th><th>Endereço</th><th>Período</th><th>Equipe</th></tr></thead><tbody>${linhas}</tbody></table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
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
async function lerTextoPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('pdf.js indisponível (sem internet) — use o cadastro manual.');
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let texto = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Reconstrói por linhas usando a posição Y
    const linhas = {};
    content.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      (linhas[y] = linhas[y] || []).push(it.str);
    });
    Object.keys(linhas).sort((a, b) => b - a).forEach(y => { texto += linhas[y].join(' ') + '\n'; });
  }
  return texto;
}

function parsePDF(texto) {
  const os = novaOS();
  const find = (re) => { const m = texto.match(re); return m ? m[1].trim() : ''; };

  os.numero  = find(/Ordem de servi[çc]o[:\s]*([0-9]+)/i) || find(/O\.?S[:\s]*([0-9]+)/i);
  os.servico = find(/Ref\.?[:\s]*(.+)/i);
  os.cliente = find(/Cliente[:\s]*(.+)/i);
  os.contato = find(/Contato[:\s]*(.+)/i);
  os.whatsapp= find(/(?:WhatsApp|Telefone|Fone|Celular)[:\s]*([\d()\-\s]+)/i);
  os.cnpjCpf = find(/(?:CNPJ|CPF)[:\s]*([\d./\-]+)/i);
  os.endereco= find(/Endere[çc]o[:\s]*(.+)/i);
  os.vendedor= find(/Vendedor[:\s]*(.+)/i);
  os.dataEntrada = converterDataBR(find(/Aprova[çc][ãa]o[:\s]*([\d/]+)/i));

  // Entrega: data + hora de instalação
  const entrega = texto.match(/Entrega[:\s]*([\d]{2}\/[\d]{2}\/[\d]{4})\s*([\d]{2}:[\d]{2})?/i);
  if (entrega) {
    os.instalacao.data = converterDataBR(entrega[1]);
    if (entrega[2]) {
      os.instalacao.hora = entrega[2];
      const h = parseInt(entrega[2].split(':')[0], 10);
      os.instalacao.periodo = h >= 12 ? 'Tarde' : 'Manhã';
      if (os.instalacao.periodo === 'Tarde' || h !== 0) os.instalacao.periodo = h >= 12 ? 'Tarde' : 'Manhã';
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
  const itens = [];
  const linhas = texto.split('\n');
  let n = 1;
  for (const linha of linhas) {
    // ignora linhas de totais
    if (/(Descontos?|Total|Sinal|Saldo|Subtotal)/i.test(linha)) continue;
    // procura: medida NxN ... qtde ... R$ valor ... R$ subtotal
    const medida = linha.match(/(\d+[.,]?\d*)\s*[xX]\s*(\d+[.,]?\d*)/);
    const valores = linha.match(/R\$\s*[\d.]+,\d{2}/g);
    const qtdeM = linha.match(/\b(\d{1,3})\s*(?:un|und|pç|pc|x)?\b/i);
    if (medida && valores && valores.length >= 1) {
      const valorUnit = parseBRNumber(valores[0]);
      const subtotal = valores.length >= 2 ? parseBRNumber(valores[1]) : valorUnit;
      const qtde = qtdeM ? qtdeM[1] : '1';
      // descrição = trecho antes da medida
      const desc = linha.slice(0, medida.index).replace(/^\s*\d+\s*/, '').trim();
      itens.push({
        item: String(n++),
        descricao: desc || 'Item',
        medidas: `${medida[1]}x${medida[2]}`,
        qtde, valorUnit: String(valorUnit),
        subtotal, pronto: false
      });
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
      const texto = await lerTextoPDF(file);
      const os = parsePDF(texto);
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
      const texto = await lerTextoPDF(file);
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
