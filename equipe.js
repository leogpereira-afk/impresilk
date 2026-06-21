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

const EQ = { instalador: null, modalId: null, comercial: false };
let _draft = null, _dirty = false;

/* ── Seleção do instalador ───────────────────────────────────────────────── */
function initSelect() {
  // Espelho comercial: somente‑leitura, sem execução, sem escolher instalador.
  if (location.hash === '#comercial') {
    EQ.comercial = true;
    EQ.instalador = 'Comercial';
    enter();
    return;
  }
  // Deep link do admin: equipe.html#i=NOME abre direto a visão daquele instalador.
  if (location.hash.startsWith('#i=')) {
    const nome = decodeURIComponent(location.hash.slice(3));
    if (nome) {
      EQ.instalador = nome;
      STORE.setInstalador(nome);
      enter();
      return;
    }
  }
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
  const logo = $('#topbar-logo');
  if (logo && typeof LOGO_IMPRESILK !== 'undefined') logo.src = LOGO_IMPRESILK;
  $('#user-badge').textContent = EQ.comercial ? '💼 Comercial · somente leitura' : EQ.instalador;
  if (EQ.comercial) {
    const t = $('#eq-trocar'); if (t) t.style.display = 'none';
  } else {
    $('#eq-trocar').onclick = () => { STORE.setInstalador(null); location.reload(); };
  }

  STORE.onSync((status, pending) => {
    const el = $('#sync-indicator');
    el.className = 'sync-indicator ' + status;
    el.textContent = status === 'ok' ? '✅' : (status === 'pending' ? `⏳ ${pending}` : '⚠️');
    el.title = status === 'ok' ? 'Tudo salvo na nuvem.'
      : status === 'pending' ? `${pending} alteração(ões) aguardando envio. Some sozinho ao reconectar.`
      : 'Sem conexão — pode continuar; envia ao reconectar.';
    el.style.cursor = 'pointer';
    el.onclick = () => { if (el.title) toast(el.title); };
  });
  initConflict();
  const vBtn = $('#btn-verificar');
  if (vBtn) vBtn.onclick = verificarNuvem;
  if (typeof iniciarFraseBar === 'function') iniciarFraseBar();

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

/* ── Nota por instalador (mesma fórmula do Painel) ───────────────────────── */
// Premia menos retrabalho (peso .7) e presença de check-in (peso .3). 0–10.
function notasDaEquipe(equipe) {
  const fins = STORE.getAllOS().filter(o => o.finalizadaEm);
  return (equipe || []).map(nome => {
    let entregas = 0, retrab = 0, checkin = 0;
    fins.forEach(o => {
      if (!(o.equipe || []).includes(nome)) return;
      entregas++;
      if (o.retrabalho) retrab++;
      if ((o.fotosCheckinIds || []).length) checkin++;
    });
    if (!entregas) return { nome, nota: 0 };
    const semRetrab = 1 - (retrab / entregas);
    const comCheckin = checkin / entregas;
    const nota = Math.max(0, Math.min(10, (semRetrab * 0.7 + comCheckin * 0.3) * 10));
    return { nome, nota };
  });
}

// Geolocalização automática no check‑in: comprova que a equipe esteve no
// endereço, sem o instalador precisar informar nada. Registra só uma vez.
function capturarLocalCheckin() {
  if (!_draft || _draft.checkinGPS || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      _draft.checkinGPS = {
        lat: +pos.coords.latitude.toFixed(6),
        lng: +pos.coords.longitude.toFixed(6),
        precisao: Math.round(pos.coords.accuracy || 0),
        ts: nowISO()
      };
      save();
      toast('📍 Localização do check‑in registrada', 'success');
    },
    () => {}, // sem permissão/sinal: segue o fluxo sem travar
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

// Confirma com o servidor se as O.S foram realmente salvas na nuvem.
async function verificarNuvem() {
  const vBtn = $('#btn-verificar');
  if (vBtn) vBtn.disabled = true;
  toast('Verificando a nuvem…');
  try {
    await STORE.trySync();
    const res = await STORE.api({ action: 'list' });
    const n = Array.isArray(res.os) ? res.os.length : 0;
    const fila = STORE.getQueue().length;
    if (fila) toast(`☁️ ${n} na nuvem · ⏳ ${fila} ainda neste aparelho`, 'error');
    else      toast(`✅ Tudo salvo na nuvem (${n} O.S)`, 'success');
  } catch {
    toast('❌ Sem resposta da nuvem — você está offline?', 'error');
  } finally {
    if (vBtn) vBtn.disabled = false;
  }
}

/* ── Lista de O.S do instalador ──────────────────────────────────────────── */
function minhasOS() {
  // Comercial vê todas as O.S liberadas; instalador vê só as suas.
  return STORE.getAllOS()
    .filter(o => o.liberadoPCP && (EQ.comercial || (o.equipe || []).includes(EQ.instalador)))
    .sort((a, b) => (a.instalacao?.data || '').localeCompare(b.instalacao?.data || ''));
}

function renderList() {
  const el = $('#eq-list');
  const list = minhasOS();
  // Próxima instalação = primeira ainda não finalizada (lista já ordenada por data).
  const proxima = EQ.comercial ? null : list.find(o => !o.finalizadaEm);
  const heroId = proxima ? proxima.id : null;

  let heroHtml = '';
  if (proxima) {
    const naRua = (proxima.carroLiberado || proxima.horaSaida) && !proxima.horaRetorno;
    const maps = proxima.endereco ? `https://maps.google.com/?q=${encodeURIComponent(proxima.endereco)}` : '';
    heroHtml = `
      <div class="proxima-card" data-hero-id="${esc(proxima.id)}">
        <div class="proxima-tag">${naRua ? '🚗 Em rota' : '📍 Sua próxima instalação'}</div>
        <div class="proxima-os">O.S ${esc(proxima.numero || '—')}</div>
        <div class="proxima-cliente">${esc(proxima.cliente || 'Sem cliente')}</div>
        <div class="proxima-end">${esc(proxima.endereco || 'Endereço não informado')}</div>
        <div class="proxima-data">📅 ${esc(fmtInstalacao(proxima.instalacao))}</div>
        <div class="proxima-acoes">
          <button class="btn-primary" data-hero-abrir="${esc(proxima.id)}">Abrir O.S ▶</button>
          ${maps ? `<a class="btn-ghost" href="${maps}" target="_blank">🗺️ Rota</a>` : ''}
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${heroHtml}
    <h2 style="margin:14px 0 12px;font-size:1.1rem">${EQ.comercial ? 'Instalações (visão comercial)' : 'Todas as minhas O.S'}</h2>
    <div class="os-list">
      ${list.map(os => {
        const st = calcStatus(os);
        const naRua = !os.finalizadaEm && (os.carroLiberado || os.horaSaida) && !os.horaRetorno;
        return `<div class="os-list-item st-${st}${os.id===heroId?' is-hero':''}" data-os-id="${esc(os.id)}">
          <div class="list-info">
            <div class="list-numero">O.S ${esc(os.numero||'—')} ${naRua?'🚗':''} ${os.finalizadaEm?'✓':''}</div>
            <div class="list-cliente">${esc(os.cliente)} · ${esc(os.endereco||'')}</div>
            <div class="list-date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
          </div>
          <span class="badge st-${st}">${STATUS_LABEL[st]}</span>
        </div>`;
      }).join('') || '<p class="text-muted">Nenhuma O.S atribuída a você ainda.</p>'}
    </div>`;
  const abrir = id => { const os = STORE.getOS(id); if (os) openModal(os); };
  $$('[data-hero-abrir]', el).forEach(b => b.onclick = e => { e.stopPropagation(); abrir(b.dataset.heroAbrir); });
  const heroCard = $('[data-hero-id]', el);
  if (heroCard) heroCard.onclick = () => abrir(heroCard.dataset.heroId);
  $$('[data-os-id]', el).forEach(c => c.onclick = () => abrir(c.dataset.osId));
}

/* ── Modal (só execução) ─────────────────────────────────────────────────── */
function openModal(os) {
  if (!os) { toast('O.S não encontrada.', 'error'); return; }
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

// Consolida o retrabalho a partir dos itens, para a gestão/Painel enxergarem.
function rollupRetrab() {
  const itens = _draft.itens || [];
  const retrab = itens.filter(i => i.statusInst === 'retrab');
  _draft.retrabalho = retrab.length > 0;
  if (retrab.length) {
    _draft.problema = retrab.map(i => `${i.item||'Item'}: ${i.motivo||'sem motivo'}${i.obsProb?` (${i.obsProb})`:''}`).join(' | ');
    _draft.causa = retrab[0].motivo || _draft.causa || '';
  }
}
function reRender() {
  const opens = $$('#modal-os .card-fs').map(d => d.open);
  renderModal();
  $$('#modal-os .card-fs').forEach((d, i) => { if (opens[i] != null) d.open = opens[i]; });
}

/* ── Modal comercial (somente‑leitura, sem execução) ─────────────────────── */
function renderModalComercial() {
  const os = _draft;
  const st = calcStatus(os);
  const itens = os.itens || [];
  const prontos = itens.filter(i => i.statusInst === 'ok' || i.pronto).length;
  const co = os.checkout || {};

  const itensRows = itens.map(it => {
    const retrab = it.statusInst === 'retrab';
    const okMark = retrab ? '🔴' : ((it.statusInst === 'ok' || it.pronto) ? '✓' : '—');
    const motivo = retrab ? `<div class="text-sm" style="color:var(--red)">↳ ${esc(it.motivo||'sem motivo')}${it.obsProb?` — ${esc(it.obsProb)}`:''}</div>` : '';
    return `
    <tr${retrab?' style="background:#fef2f2"':''}>
      <td>${esc(it.item)}${motivo}</td><td>${esc(it.descricao)}</td><td>${esc(it.medidas)}</td><td>${esc(it.qtde)}</td>
      <td style="text-align:center">${okMark}</td>
    </tr>`;
  }).join('');

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
      <summary>Situação</summary>
      <div class="fs-body">
        <div class="text-sm">Confirmação cliente: <strong>${esc(os.confirmacao || '—')}</strong></div>
        <div class="text-sm">Instalação OK: <strong>${os.instalacaoOK ? 'Sim' : 'Não'}</strong>${os.conferidoPor ? ' · por '+esc(os.conferidoPor) : ''}</div>
        ${os.retrabalho ? `<div class="text-sm" style="color:var(--red)">⚠ Retrabalho${os.problema ? ': '+esc(os.problema) : ''}</div>` : ''}
        ${co.situacao ? `<div class="text-sm">Check‑out: <strong>${esc(co.situacao)}</strong>${co.hora ? ' · '+esc(co.hora) : ''}${co.por ? ' · '+esc(co.por) : ''}</div>` : ''}
        ${co.obs ? `<div class="text-sm">Obs: ${esc(co.obs)}</div>` : ''}
        <div class="text-sm" style="margin-top:6px">${os.finalizadaEm
          ? `✓ Finalizada · ${new Date(os.finalizadaEm).toLocaleString('pt-BR')}`
          : '⏳ Em aberto'}</div>
      </div>
    </details>

    <div class="fs-body" style="padding:14px 16px">
      <button class="btn-ghost btn-sm w-100" id="m-save">Fechar</button>
    </div>
  `;
  $('#m-close').onclick = closeModal;
  $('#m-save').onclick = closeModal;
}

function renderModal() {
  if (EQ.comercial) return renderModalComercial();
  const os = _draft;
  const st = calcStatus(os);
  const confirmado = os.confirmacao === 'Confirmado';
  const itens = os.itens || [];
  const instalados = itens.filter(i => i.statusInst === 'ok').length;
  const retrabN = itens.filter(i => i.statusInst === 'retrab').length;
  const fotos = os.fotosCheckinIds || [];
  const co = os.checkout || {};
  const causas = STORE.getCFG().causas_retrabalho || [];

  const itensCards = itens.map((it, i) => {
    const st = it.statusInst || '';
    const cls = st === 'retrab' ? 'st-retrab' : (st === 'ok' ? 'st-ok' : '');
    const retrabBox = st === 'retrab' ? `
      <div class="item-retrab">
        <label>Motivo do problema</label>
        <select data-imotivo="${i}"><option value="">— escolher —</option>${causas.map(c=>`<option ${it.motivo===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <label>O que faltou / detalhe</label>
        <input data-iobs="${i}" value="${esc(it.obsProb)}" placeholder="ex.: medida errada, faltou peça…">
        <div class="item-foto">
          ${it.fotoProbId ? `<div class="foto-thumb-wrap"><img class="foto-thumb" data-img="${esc(it.fotoProbId)}"><button class="foto-rm" data-irm="${i}">×</button></div>` : ''}
          <label class="foto-box">
            <span class="foto-hint">📷 Foto do problema</span>
            <input type="file" accept="image/*" capture="environment" data-ifoto="${i}">
          </label>
        </div>
      </div>` : '';
    return `
      <div class="item-card ${cls}">
        <div class="item-card-head">
          <div class="item-card-title">${esc(it.item || 'Item')} <span class="item-card-qt">x${esc(it.qtde||1)}</span></div>
          <div class="item-card-sub">${esc(it.descricao||'')}${it.medidas?` · ${esc(it.medidas)}`:''}</div>
        </div>
        <div class="seg">
          <button data-iset="${i}|"       class="${st===''?'active':''}">Pendente</button>
          <button data-iset="${i}|ok"     class="seg-ok ${st==='ok'?'active':''}">✅ Instalado</button>
          <button data-iset="${i}|retrab" class="seg-retrab ${st==='retrab'?'active':''}">🔴 Retrabalho</button>
        </div>
        ${retrabBox}
      </div>`;
  }).join('');

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
      <summary>Itens <span class="item-progress" style="margin-left:auto">✅ ${instalados}/${itens.length}${retrabN?` · 🔴 ${retrabN}`:''}</span></summary>
      <div class="fs-body">
        <p class="text-muted" style="font-size:.8rem;margin-bottom:8px">Marque cada item: <strong>Instalado</strong> ou <strong>Retrabalho</strong>. No retrabalho, escolha o motivo e tire uma foto do problema.</p>
        <div class="item-cards">${itensCards || '<p class="text-muted" style="text-align:center">Sem itens</p>'}</div>
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
          <div class="field"><label>KM saída</label><input type="number" inputmode="numeric" data-f="kmSaida" value="${esc(os.kmSaida)}" placeholder="km do veículo"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Hora retorno</label><input type="time" data-f="horaRetorno" value="${esc(os.horaRetorno)}"></div>
          <div class="field"><label>KM retorno</label><input type="number" inputmode="numeric" data-f="kmRetorno" value="${esc(os.kmRetorno)}" placeholder="km do veículo"></div>
        </div>
        <div class="field-row">
          <div class="field" style="justify-content:flex-end"><label><input type="checkbox" data-c="instalacaoOK" ${os.instalacaoOK?'checked':''}> Instalação OK</label></div>
          <div class="field"><label>Conferido por</label><input data-f="conferidoPor" value="${esc(os.conferidoPor)}"></div>
        </div>
        ${retrabN ? `<div class="trava-msg" style="background:#fef2f2;color:var(--red)">🔴 ${retrabN} item(ns) marcado(s) como retrabalho — confira os motivos na lista de itens acima.</div>` : ''}
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
          <div class="field"><label>Situação</label>
            <select data-f="checkout.situacao"><option value="">— selecionar —</option>
              ${['Finalizado','Retrabalho','Mais um dia de trabalho'].map(s=>`<option ${co.situacao===s?'selected':''}>${esc(s)}</option>`).join('')}
              ${co.situacao && !['Finalizado','Retrabalho','Mais um dia de trabalho'].includes(co.situacao)?`<option selected>${esc(co.situacao)}</option>`:''}
            </select>
          </div>
          <div class="field"><label>Hora</label><input type="time" data-f="checkout.hora" value="${esc(co.hora)}"></div>
          <div class="field"><label>Conferido por</label><input data-f="checkout.por" value="${esc(co.por)}"></div>
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
  $$('[data-c]', root).forEach(el => el.onchange = () => setF(el.dataset.c, el.checked));
  // Status por item (Pendente / Instalado / Retrabalho)
  $$('[data-iset]', root).forEach(btn => btn.onclick = () => {
    const [i, val] = btn.dataset.iset.split('|');
    const it = _draft.itens[+i]; if (!it) return;
    it.statusInst = val;
    it.pronto = (val === 'ok');           // compatibilidade com a gestão
    rollupRetrab();
    save(); reRender();
  });
  $$('[data-imotivo]', root).forEach(sel => sel.onchange = () => {
    const it = _draft.itens[+sel.dataset.imotivo]; if (!it) return;
    it.motivo = sel.value; rollupRetrab(); save();
  });
  $$('[data-iobs]', root).forEach(inp => inp.onchange = () => {
    const it = _draft.itens[+inp.dataset.iobs]; if (!it) return;
    it.obsProb = inp.value; rollupRetrab(); save();
  });
  $$('[data-ifoto]', root).forEach(inp => inp.onchange = async () => {
    const it = _draft.itens[+inp.dataset.ifoto]; if (!it) return;
    const file = (inp.files || [])[0]; if (!file) return;
    toast('Enviando foto…');
    const id = await STORE.pushPhoto(file);
    if (id) { it.fotoProbId = id; rollupRetrab(); save(); reRender(); }
  });
  $$('[data-irm]', root).forEach(b => b.onclick = () => {
    const it = _draft.itens[+b.dataset.irm]; if (!it) return;
    if (it.fotoProbId) STORE.delFoto(it.fotoProbId);
    it.fotoProbId = ''; save(); reRender();
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
    const semMotivo = (_draft.itens||[]).filter(i => i.statusInst === 'retrab' && !i.motivo);
    if (semMotivo.length) f.push('motivo do retrabalho em: ' + semMotivo.map(i => i.item || 'item').join(', '));
    if (f.length) { toast('Falta: ' + f.join(', '), 'error'); return; }
    _draft.finalizadaEm = nowISO(); _draft.finalizadoPor = EQ.instalador;
    save(); reRender(); toast('Instalação finalizada 🏁', 'success');
    if (typeof mostrarCelebracao === 'function') {
      mostrarCelebracao({
        emoji: '🎉',
        titulo: 'Instalação 100% concluída!',
        frase: fraseAleatoria(),
        notas: notasDaEquipe(_draft.equipe),
      });
    }
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
    capturarLocalCheckin();
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
