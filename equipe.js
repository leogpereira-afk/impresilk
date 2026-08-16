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
  const inst = os.instalacao || {};
  const agendada   = !!(inst.data && inst.periodo && (os.equipe || []).length);
  const confirmada = os.confirmacao === 'Confirmado';
  // Funil coerente (igual ao app de gestão): confirmar/sair exige agenda.
  if (os.horaSaida && confirmada && agendada) return 'em_andamento';
  if (confirmada && agendada)                 return 'confirmada';
  if (agendada)                               return 'agendada';
  if (os.liberadoPCP)                         return 'apto';
  return 'aguardando_producao';
}
// Os rótulos são os MESMOS do app.js (linhas 229 e 254). Duas telas com réguas
// de texto diferentes para o mesmo estado é bug de leitura: aqui dizia
// "Aguardando" e na gestão "Aguardando produção".
const STATUS_LABEL = {
  aguardando_producao:'Aguardando produção', apto:'Apto', agendada:'Agendada',
  confirmada:'Confirmada', em_andamento:'Em andamento', finalizada:'Finalizada'
};
// Cliente retira fala outra língua (espelha o app.js): "Apto" = pronto p/
// retirada e "Finalizada" = retirado. Só exibição — o status é o mesmo.
const STATUS_LABEL_INT = { aguardando_producao:'Aguardando produção', apto:'🛍 Pronto p/ retirada', finalizada:'Retirado' };
function isInterno(os) { return !!(os && os.tipo === 'interno'); }
function statusLabelDe(os, st) {
  if (isInterno(os) && STATUS_LABEL_INT[st]) return STATUS_LABEL_INT[st];
  return STATUS_LABEL[st] || st;
}

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
  //
  // EXIGE CRACHÁ. Isto aqui não é visão de execução: mostra TODAS as O.S
  // liberadas, com cliente, endereço e telefone, lendo direto do cache local.
  // Como o dado já está no aparelho, no tablet compartilhado da fábrica bastava
  // digitar "#comercial" depois que o gestor saía para ler a carteira inteira
  // sem senha nenhuma. O logout da gestão agora também limpa esse cache, mas a
  // porta se fecha aqui — não só pela ausência do dado.
  if (location.hash === '#comercial') {
    if (typeof AUTH === 'undefined' || !AUTH.temCracha()) {
      $('#select-screen').innerHTML =
        '<div class="card" style="max-width:420px;margin:40px auto;text-align:center">' +
        '<h2>🔒 Visão comercial</h2>' +
        '<p class="text-muted">Esta tela mostra a carteira de clientes. Entre pela gestão neste aparelho antes de abri-la.</p>' +
        '<p><a class="btn-primary" href="index.html">Ir para a gestão</a></p></div>';
      return;
    }
    EQ.comercial = true;
    EQ.instalador = 'Comercial';
    enter();
    return;
  }
  // Deep link do admin: equipe.html#i=NOME abre direto a visão daquele instalador.
  //
  // Antes ele aceitava QUALQUER texto — nem precisava ser alguém da equipe —, o
  // que dava para qualquer pessoa da internet entrar como quem quisesse só
  // montando a URL. Agora o nome precisa estar na lista de instaladores; quem
  // não estiver cai na tela normal de escolher o nome.
  if (location.hash.startsWith('#i=')) {
    const nome = decodeURIComponent(location.hash.slice(3)).trim();
    const naEquipe = n => (STORE.getCFG().instaladores || [])
      .some(x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
              === String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim());
    if (nome && naEquipe(nome)) {
      EQ.instalador = nome;
      STORE.setInstalador(nome);
      enter();
      return;
    }
    // lista ainda não baixada neste aparelho: tenta uma vez antes de desistir
    if (nome) {
      STORE.pullCFG().then(() => {
        if (naEquipe(nome)) { EQ.instalador = nome; STORE.setInstalador(nome); enter(); }
      }).catch(() => {});
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
  // Garante o crachá de montagem: o instalador tocou no nome mas não tem
  // credencial (a reforma de 05/08 fechou a porta sem senha). Pega um crachá
  // papel 'montagem' e dispara o sync — sem isso todo request leva 401.
  // Comercial usa o crachá que já estiver no aparelho (aberto pela gestão).
  if (!EQ.comercial && EQ.instalador && typeof AUTH !== 'undefined' && !AUTH.temCracha()) {
    AUTH.entrarMontagem(EQ.instalador)
      .then(() => { STORE.pull(() => renderList()); STORE.trySync(); })
      .catch(e => { toast('⚠️ ' + (e.message || 'Não foi possível entrar na nuvem.'), 'error'); });
  }
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
    // 'sem-sessao' não é falta de sinal: dizer "Sem conexão" com Wi-Fi cheio
    // manda o instalador caçar roteador enquanto o problema é o crachá.
    const semSessao = status === 'sem-sessao';
    el.textContent = status === 'ok' ? '✅'
      : status === 'pending' ? `⏳ ${pending}`
      : semSessao ? '🔒' : '⚠️';
    el.title = status === 'ok' ? 'Tudo salvo na nuvem.'
      : status === 'pending' ? `${pending} alteração(ões) aguardando envio. Some sozinho ao reconectar.`
      : semSessao ? 'A nuvem recusou este aparelho (sessão/acesso). Seu trabalho está guardado aqui — avise a gestão.'
      : 'Sem conexão — pode continuar; envia ao reconectar.';
    el.style.cursor = 'pointer';
    el.onclick = () => { if (el.title) toast(el.title); };
  });
  // Perda de dado nunca é silenciosa (o espelho é onde o trabalho nasce).
  STORE.on('item-descartado', ({ item, motivo }) => {
    const ref = (item && item.os && item.os.numero) ? 'O.S ' + item.os.numero : 'alteração';
    toast(`⚠️ ${ref} NÃO foi salva na nuvem (${motivo || 'erro'}). Refaça e avise a gestão.`, 'error');
  });
  STORE.on('pull-truncado', () => toast('A lista pode estar incompleta — recarregue a página.', 'error'));
  STORE.on('sem-sessao', () => {
    if (window._avisouSessao) return; window._avisouSessao = true;
    toast('🔒 A nuvem recusou este aparelho. O trabalho fica guardado aqui; avise a gestão.', 'error');
  });
  STORE.on('quota', () => toast('Memória do aparelho cheia — avise a gestão.', 'error'));
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
    const n = Number.isFinite(res.total) ? res.total : (Array.isArray(res.os) ? res.os.length : 0);
    const fila = STORE.getQueue().length;
    if (fila) toast(`☁️ ${n} na nuvem · ⏳ ${fila} ainda neste aparelho`, 'error');
    else      toast(`✅ Tudo salvo na nuvem (${n} O.S)`, 'success');
  } catch (e) {
    if (e && (e.semSessao || e.status === 401 || e.status === 403))
      toast('🔒 A nuvem recusou este aparelho — a sessão pode ter expirado. Avise a gestão.', 'error');
    else toast('❌ Sem resposta da nuvem — você está offline?', 'error');
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
    // O.S interna = CLIENTE RETIRA: não há deslocamento. Chamar isso de "sua
    // próxima instalação" com botão de Rota mandava o instalador carregar o
    // carro e dirigir até o endereço do cliente para descobrir na porta que era
    // o cliente quem vinha buscar.
    const interno = isInterno(proxima);
    const naRua = !interno && (proxima.carroLiberado || proxima.horaSaida) && !proxima.horaRetorno;
    const maps = (!interno && proxima.endereco) ? `https://maps.google.com/?q=${encodeURIComponent(proxima.endereco)}` : '';
    const tag = interno ? '🛍 Pronto p/ retirada — o cliente vem buscar'
      : naRua ? '🚗 Em rota' : '📍 Sua próxima instalação';
    heroHtml = `
      <div class="proxima-card${interno ? ' is-interno' : ''}" data-hero-id="${esc(proxima.id)}">
        <div class="proxima-tag">${tag}</div>
        <div class="proxima-os">O.S ${esc(proxima.numero || '—')}</div>
        <div class="proxima-cliente">${esc(proxima.cliente || 'Sem cliente')}</div>
        <div class="proxima-end">${interno ? 'Retirada na fábrica' : esc(proxima.endereco || 'Endereço não informado')}</div>
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
          <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
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
      <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
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
  const ro = !!os.finalizadaEm; // O.S finalizada = somente leitura no espelho

  // Informações de preparação (PCP/agenda) que o instalador só VÊ, não edita.
  const infoRows = [
    ['Serviço',      os.servico],
    ['Acesso',       os.acesso],
    ['Fixação',      os.fixacao],
    ['Ferramentas',  (os.ferramentas || []).join(', ')],
    ['Suprimentos',  (os.suprimentos || []).join(', ')],
    ['Contato',      os.contato],
    ['Obs PCP',      os.obsPCP],
    ['Obs agenda',   os.obsAgenda]
  ].filter(([, v]) => v && String(v).trim());
  const infoEstatica = (infoRows.length || os.layoutFotoId) ? `
    <details class="card-fs" data-bloco="info" open>
      <summary>📋 Informações da O.S <span class="item-progress" style="margin-left:auto;font-weight:600">somente leitura</span></summary>
      <div class="fs-body eq-info">
        ${infoRows.map(([k, v]) => `<div class="eq-info-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
        ${os.layoutFotoId ? `<div class="eq-info-foto"><span>Layout</span><img data-img="${esc(os.layoutFotoId)}" alt="layout"></div>` : ''}
      </div>
    </details>` : '';

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
          ${it.fotoProbId ? `<div class="foto-thumb-wrap"><img class="foto-thumb" data-img="${esc(it.fotoProbId)}">${ro?'':`<button class="foto-rm" data-irm="${i}">×</button>`}</div>` : ''}
          ${ro ? '' : `<label class="foto-box">
            <span class="foto-hint">📷 Foto do problema</span>
            <input type="file" accept="image/*" capture="environment" data-ifoto="${i}">
          </label>`}
        </div>
      </div>` : '';
    return `
      <div class="item-card ${cls}">
        <div class="item-card-head">
          <div class="item-card-title">${esc(it.item || 'Item')} <span class="item-card-qt">x${esc(it.qtde||1)}</span></div>
          <div class="item-card-sub">${esc(it.descricao||'')}${it.medidas?` · ${esc(it.medidas)}`:''}</div>
        </div>
        <div class="seg">
          <button data-iset="${i}|"       ${ro?'disabled':''} class="${st===''?'active':''}">Pendente</button>
          <button data-iset="${i}|ok"     ${ro?'disabled':''} class="seg-ok ${st==='ok'?'active':''}">✅ Instalado</button>
          <button data-iset="${i}|retrab" ${ro?'disabled':''} class="seg-retrab ${st==='retrab'?'active':''}">🔴 Retrabalho</button>
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
      <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
      <button class="modal-close" id="m-close">×</button>
    </div>

    ${ro ? `<div class="finalizada-lock lock-allow">
      <span>🔒 O.S finalizada${os.finalizadoPor ? ' por <strong>' + esc(os.finalizadoPor) + '</strong>' : ''}${os.finalizadaEm ? ' · ' + new Date(os.finalizadaEm).toLocaleString('pt-BR') : ''} — somente leitura.</span>
    </div>` : ''}

    <div style="padding:12px 16px;background:#eff6ff;border-bottom:1px solid var(--border)">
      <div class="list-date" style="font-size:.95rem">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      <div class="text-sm" style="margin-top:4px">📍 ${esc(os.endereco||'')}</div>
      <div class="text-sm">👷 ${esc((os.equipe||[]).join(', '))} ${os.veiculo?'· 🚗 '+esc(os.veiculo):''}</div>
      ${os.whatsapp ? `<a class="inline-link" target="_blank" href="https://wa.me/55${esc(String(os.whatsapp).replace(/\D/g,''))}">💬 WhatsApp cliente</a>` : ''}
      ${os.endereco ? ` · <a class="inline-link" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco)}">🗺 Mapa</a>` : ''}
    </div>

    ${infoEstatica}

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
          : `<button class="btn-primary btn-sm" id="m-carro" ${(!confirmado||ro)?'disabled style="opacity:.5"':''}>🚗 Liberar carro / Saída</button>`}

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
      <button class="btn-ghost btn-sm w-100 mt-8" id="m-save">${ro ? 'Fechar' : 'Salvar e fechar'}</button>
    </div>
  `;
  // Trava visual de edição quando finalizada (mesma classe do app de gestão).
  $('#modal-os').classList.toggle('os-locked', ro);
  bindModal(os, ro);
}

function bindModal(os, ro) {
  const root = $('#modal-os');
  $('#m-close').onclick = closeModal;
  $('#m-save').onclick = closeModal;

  // Carrega imagens (layout/check‑in/problema) — vale também em somente‑leitura.
  $$('[data-img]', root).forEach(async img => {
    const b64 = await STORE.pullPhoto(img.dataset.img);
    if (b64) img.src = b64;
  });

  // O.S finalizada: somente leitura. Não liga nenhum handler de edição.
  if (ro) return;

  $$('[data-f]', root).forEach(el => el.oninput = el.onchange = () => {
    setF(el.dataset.f, el.value);
    // A hora sozinha ('HH:MM') não diz em que DIA a equipe saiu/voltou, e a
    // Linha do Tempo da gestão precisa disso para reconstruir o passado sem
    // depender do agendamento de hoje. Mesmo carimbo do app.js.
    if (el.dataset.f === 'horaSaida')   STORE.carimbarMomento(_draft, 'horaSaida', 'saidaEm');
    if (el.dataset.f === 'horaRetorno') STORE.carimbarMomento(_draft, 'horaRetorno', 'retornoEm');
  });
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
}

document.addEventListener('DOMContentLoaded', initSelect);
