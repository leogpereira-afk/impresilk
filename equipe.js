// equipe.js — Espelho do instalador (só execução)
'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nowISO() { return new Date().toISOString(); }

function parseLocalDate(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
function fmtInstalacao(inst) {
  if (!inst || !inst.data) return 'Sem data';
  const d = parseLocalDate(inst.data); if (!d) return 'Sem data';
  let t = `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  if (inst.periodo) { t += ` · ${inst.periodo}`; if (inst.periodo === 'Horário' && inst.hora) t += ` (${inst.hora})`; }
  return t;
}

function calcStatus(os) {
  if (os.finalizadaEm) return 'finalizada';
  if (os.horaSaida) return 'em_andamento';
  if (os.confirmacao === 'Confirmado') return 'confirmada';
  if (os.instalacao && os.instalacao.data && os.instalacao.periodo && (os.equipe||[]).length) return 'agendada';
  if (os.liberadoPCP) return 'apto';
  return 'aguardando_producao';
}
const STATUS_LABEL = {
  aguardando_producao:'Aguardando', apto:'Apto', agendada:'Agendada',
  confirmada:'Confirmada', em_andamento:'Em andamento', finalizada:'Finalizada'
};

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const EQ = { instalador: null, modalId: null };
let _draft = null, _dirty = false;

/* ── Seleção do instalador ───────────────────────────────────────────────── */
function initSelect() {
  const sel = $('#sel-instalador');
  const cfg = STORE.getCFG();
  const lista = cfg.instaladores || [];
  if (!lista.length) {
    sel.innerHTML = '<option value="">(cadastre instaladores na gestão)</option>';
  } else {
    sel.innerHTML = lista.map(n => `<option>${esc(n)}</option>`).join('');
  }
  $('#sel-btn').onclick = () => {
    if (!sel.value) { toast('Nenhum instalador cadastrado', 'error'); return; }
    EQ.instalador = sel.value;
    STORE.setInstalador(EQ.instalador);
    enter();
  };
  // pull cfg p/ atualizar lista
  STORE.pullCFG().then(() => {
    const c = STORE.getCFG();
    if ((c.instaladores || []).length) sel.innerHTML = c.instaladores.map(n => `<option>${esc(n)}</option>`).join('');
  });

  const saved = STORE.getInstalador();
  if (saved) { EQ.instalador = saved; enter(); }
}

function enter() {
  $('#select-screen').classList.add('hidden');
  $('#eq-app').classList.remove('hidden');
  $('#user-badge').textContent = EQ.instalador;
  $('#eq-trocar').onclick = () => { STORE.setInstalador(null); location.reload(); };

  STORE.onSync((status, pending) => {
    const el = $('#sync-indicator');
    el.className = 'sync-indicator ' + status;
    el.textContent = status === 'ok' ? '✅' : (status === 'pending' ? `⏳ ${pending}` : '⚠️');
  });
  initConflict();

  STORE.pull(() => renderList());
  STORE.trySync();
  renderList();
  setInterval(() => { STORE.pull(() => renderList()); STORE.trySync(); }, 30000);
}

function initConflict() {
  STORE.onConflict((local, remote) => {
    const dlg = $('#conflict-dialog');
    $('#conflict-msg').textContent = `Esta O.S (${remote.numero||remote.id}) foi alterada em outro aparelho.`;
    dlg.classList.remove('hidden');
    $('#conflict-reload').onclick = () => {
      STORE.aceitarServidor(remote); dlg.classList.add('hidden');
      if (EQ.modalId === remote.id) openModal(STORE.getOS(remote.id));
      renderList(); toast('Recarregado do servidor', 'success');
    };
    $('#conflict-overwrite').onclick = () => {
      STORE.sobrescreverServidor(local); dlg.classList.add('hidden'); toast('Sua versão enviada', 'success');
    };
  });
}

/* ── Lista de O.S do instalador ──────────────────────────────────────────── */
function minhasOS() {
  return STORE.getAllOS()
    .filter(o => o.liberadoPCP && (o.equipe || []).includes(EQ.instalador))
    .sort((a, b) => (a.instalacao?.data || '').localeCompare(b.instalacao?.data || ''));
}

function renderList() {
  const el = $('#eq-list');
  const list = minhasOS();
  el.innerHTML = `
    <h2 style="margin-bottom:12px;font-size:1.1rem">Minhas instalações</h2>
    <div class="os-list">
      ${list.map(os => {
        const st = calcStatus(os);
        const naRua = !os.finalizadaEm && (os.carroLiberado || os.horaSaida) && !os.horaRetorno;
        return `<div class="os-list-item st-${st}" data-os-id="${esc(os.id)}">
          <div class="list-info">
            <div class="list-numero">O.S ${esc(os.numero||'—')} ${naRua?'🚗':''} ${os.finalizadaEm?'✓':''}</div>
            <div class="list-cliente">${esc(os.cliente)} · ${esc(os.endereco||'')}</div>
            <div class="list-date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
          </div>
          <span class="badge st-${st}">${STATUS_LABEL[st]}</span>
        </div>`;
      }).join('') || '<p class="text-muted">Nenhuma O.S atribuída a você ainda.</p>'}
    </div>`;
  $$('[data-os-id]', el).forEach(c => c.onclick = () => {
    const os = STORE.getOS(c.dataset.osId);
    if (os) openModal(os);
  });
}

/* ── Modal (só execução) ─────────────────────────────────────────────────── */
function openModal(os) {
  _draft = JSON.parse(JSON.stringify(os));
  _dirty = false; EQ.modalId = os.id;
  renderModal();
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() {
  if (_dirty) save();
  $('#modal-overlay').classList.add('hidden');
  EQ.modalId = null; _draft = null;
  renderList();
}
function save() {
  if (!_draft) return;
  _draft.atualizadoEm = nowISO();
  _draft.atualizadoPor = EQ.instalador;
  STORE.saveOS(_draft);
  _dirty = false;
}
function setF(path, v) {
  const p = path.split('.'); let o = _draft;
  for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
  o[p[p.length-1]] = v; _dirty = true;
}
function reRender() {
  const opens = $$('#modal-os .card-fs').map(d => d.open);
  renderModal();
  $$('#modal-os .card-fs').forEach((d, i) => { if (opens[i] != null) d.open = opens[i]; });
}

function renderModal() {
  const os = _draft;
  const st = calcStatus(os);
  const confirmado = os.confirmacao === 'Confirmado';
  const itens = os.itens || [];
  const prontos = itens.filter(i => i.pronto).length;
  const fotos = os.fotosCheckinIds || [];
  const co = os.checkout || {};

  const itensRows = itens.map((it, i) => `
    <tr>
      <td>${esc(it.item)}</td><td>${esc(it.descricao)}</td><td>${esc(it.medidas)}</td><td>${esc(it.qtde)}</td>
      <td class="pronto-check"><input type="checkbox" data-pronto="${i}" ${it.pronto?'checked':''}></td>
    </tr>`).join('');

  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">O.S ${esc(os.numero||'—')}</div>
        <div class="modal-meta">${esc(os.cliente||'')}</div>
      </div>
      <span class="badge st-${st}">${STATUS_LABEL[st]}</span>
      <button class="modal-close" id="m-close">×</button>
    </div>

    <div style="padding:12px 16px;background:#eff6ff;border-bottom:1px solid var(--border)">
      <div class="list-date" style="font-size:.95rem">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      <div class="text-sm" style="margin-top:4px">📍 ${esc(os.endereco||'')}</div>
      <div class="text-sm">👷 ${esc((os.equipe||[]).join(', '))} ${os.veiculo?'· 🚗 '+esc(os.veiculo):''}</div>
      ${os.whatsapp ? `<a class="inline-link" target="_blank" href="https://wa.me/55${esc(String(os.whatsapp).replace(/\D/g,''))}">💬 WhatsApp cliente</a>` : ''}
      ${os.endereco ? ` · <a class="inline-link" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco)}">🗺 Mapa</a>` : ''}
    </div>

    <details class="card-fs" open>
      <summary>Itens <span class="item-progress" style="margin-left:auto">${prontos}/${itens.length}</span></summary>
      <div class="fs-body">
        <table class="items-table">
          <thead><tr><th>Item</th><th>Descrição</th><th>Medidas</th><th>Qtde</th><th>OK</th></tr></thead>
          <tbody>${itensRows || '<tr><td colspan="5" class="text-muted" style="text-align:center">Sem itens</td></tr>'}</tbody>
        </table>
      </div>
    </details>

    <details class="card-fs" open>
      <summary>Execução</summary>
      <div class="fs-body">
        ${!confirmado ? `<div class="trava-msg">🔒 Aguarde a confirmação do cliente (POP EXI‑002) antes de sair.</div>` : ''}
        ${os.carroLiberado
          ? `<div class="liberar-status">🚗 Carro liberado · ${esc(os.carroLiberadoPor||'')}</div>`
          : `<button class="btn-primary btn-sm" id="m-carro" ${!confirmado?'disabled style="opacity:.5"':''}>🚗 Liberar carro / Saída</button>`}

        <div class="field-row">
          <div class="field"><label>Hora saída</label><input type="time" data-f="horaSaida" value="${esc(os.horaSaida)}"></div>
          <div class="field"><label>Hora retorno</label><input type="time" data-f="horaRetorno" value="${esc(os.horaRetorno)}"></div>
        </div>
        <div class="field-row">
          <div class="field" style="justify-content:flex-end"><label><input type="checkbox" data-c="instalacaoOK" ${os.instalacaoOK?'checked':''}> Instalação OK</label></div>
          <div class="field"><label>Conferido por</label><input data-f="conferidoPor" value="${esc(os.conferidoPor)}"></div>
        </div>
        <div class="field"><label><input type="checkbox" data-c="retrabalho" ${os.retrabalho?'checked':''}> Retrabalho?</label></div>
        <div data-retrab style="${os.retrabalho?'':'display:none'}">
          <div class="field"><label>Problema</label><input data-f="problema" value="${esc(os.problema)}"></div>
          <div class="field"><label>Causa</label>
            <select data-f="causa"><option value=""></option>${(STORE.getCFG().causas_retrabalho||[]).map(c=>`<option ${os.causa===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>Obs técnicas</label><textarea data-f="obsTecnicas">${esc(os.obsTecnicas)}</textarea></div>

        <div class="field">
          <label>Fotos de check‑in (≥1 p/ finalizar)</label>
          <div class="fotos-grid">
            ${fotos.map(fid => `<div class="foto-thumb-wrap"><img class="foto-thumb" data-img="${esc(fid)}"><button class="foto-rm" data-rm="${esc(fid)}">×</button></div>`).join('')}
          </div>
          <div class="foto-box" style="margin-top:6px">
            <span class="foto-hint">📷 Adicionar foto de check‑in</span>
            <input type="file" accept="image/*" capture="environment" multiple data-checkin>
          </div>
        </div>
      </div>
    </details>

    <details class="card-fs">
      <summary>Check‑out</summary>
      <div class="fs-body">
        <div class="field-row3">
          <div class="field"><label>Situação</label><input data-f="checkout.situacao" value="${esc(co.situacao)}"></div>
          <div class="field"><label>Hora</label><input type="time" data-f="checkout.hora" value="${esc(co.hora)}"></div>
          <div class="field"><label>Por</label><input data-f="checkout.por" value="${esc(co.por)}"></div>
        </div>
        <div class="field"><label>Obs</label><input data-f="checkout.obs" value="${esc(co.obs)}"></div>
        <div class="field"><label><input type="checkbox" data-c="checkout.confirmado" ${co.confirmado?'checked':''}> Check‑out confirmado</label></div>
      </div>
    </details>

    <div class="fs-body" style="padding:14px 16px">
      ${os.finalizadaEm
        ? `<div class="liberar-status" style="background:#dcfce7;color:var(--green)">✓ Finalizada · ${new Date(os.finalizadaEm).toLocaleString('pt-BR')}</div>`
        : `<button class="btn-primary w-100" id="m-finalizar">🏁 Finalizar instalação</button>`}
      <button class="btn-ghost btn-sm w-100 mt-8" id="m-save">Salvar e fechar</button>
    </div>
  `;
  bindModal(os);
}

function bindModal(os) {
  const root = $('#modal-os');
  $('#m-close').onclick = closeModal;
  $('#m-save').onclick = closeModal;

  $$('[data-f]', root).forEach(el => el.oninput = () => setF(el.dataset.f, el.value));
  $$('[data-c]', root).forEach(el => el.onchange = () => {
    setF(el.dataset.c, el.checked);
    if (el.dataset.c === 'retrabalho') { const b = $('[data-retrab]', root); if (b) b.style.display = el.checked ? '' : 'none'; }
  });
  $$('[data-pronto]', root).forEach(el => el.onchange = () => {
    _draft.itens[+el.dataset.pronto].pronto = el.checked;
    save(); reRender();
  });

  // TRAVA 1
  const carro = $('#m-carro');
  if (carro) carro.onclick = () => {
    if (_draft.confirmacao !== 'Confirmado') { toast('Aguarde a confirmação do cliente (POP EXI‑002) antes de sair.', 'error'); return; }
    _draft.carroLiberado = true; _draft.carroLiberadoPor = EQ.instalador; _draft.carroLiberadoEm = nowISO();
    save(); reRender(); toast('Carro liberado', 'success');
  };

  // TRAVA 2
  const fin = $('#m-finalizar');
  if (fin) fin.onclick = () => {
    const f = [];
    if (!_draft.liberadoPCP) f.push('PCP liberar');
    if (_draft.confirmacao !== 'Confirmado') f.push('confirmação do cliente');
    if (!_draft.instalacaoOK) f.push('Instalação OK');
    if (!_draft.conferidoPor) f.push('conferido por');
    if (!(_draft.fotosCheckinIds||[]).length) f.push('≥1 foto de check‑in');
    if (_draft.retrabalho && !_draft.problema) f.push('descrição do problema');
    if (f.length) { toast('Falta: ' + f.join(', '), 'error'); return; }
    _draft.finalizadaEm = nowISO(); _draft.finalizadoPor = EQ.instalador;
    save(); reRender(); toast('Instalação finalizada 🏁', 'success');
  };

  // Fotos check-in
  const ck = $('[data-checkin]', root);
  if (ck) ck.onchange = async () => {
    const files = Array.from(ck.files || []);
    if (!files.length) return;
    if (!_draft.fotosCheckinIds) _draft.fotosCheckinIds = [];
    toast(`Enviando ${files.length} foto(s)…`);
    for (const file of files) {
      const id = await STORE.pushPhoto(file);
      if (id) _draft.fotosCheckinIds.push(id);
    }
    save(); reRender();
  };
  $$('[data-rm]', root).forEach(b => b.onclick = () => {
    STORE.delFoto(b.dataset.rm);
    _draft.fotosCheckinIds = (_draft.fotosCheckinIds||[]).filter(x => x !== b.dataset.rm);
    save(); reRender();
  });
  $$('[data-img]', root).forEach(async img => {
    const b64 = await STORE.pullPhoto(img.dataset.img);
    if (b64) img.src = b64;
  });
}

document.addEventListener('DOMContentLoaded', initSelect);
