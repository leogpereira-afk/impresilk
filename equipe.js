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
// 'AAAA-MM-DD' (ou ISO) → 'DD/MM'.
function diaCurto(v) { const d = OPERACAO.dia(v); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''; }

function calcStatus(os) {
  return OPERACAO.status(os);
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
  if (st === 'finalizada' && OPERACAO.encerradaERP(os)) return 'Encerrada no ERP';
  if (isInterno(os) && STATUS_LABEL_INT[st]) return STATUS_LABEL_INT[st];
  return STATUS_LABEL[st] || st;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  // Erro fica 7 s: na rua, com sol e luva, 3 s não dava para ler o motivo
  // (o CSS não apaga mais o toast de erro sozinho; o tempo é daqui).
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 3000);
}

const EQ = { instalador: null, modalId: null, comercial: false, limpeza: null,
  vencido: false, donoDaFila: null, pronto: false, tentouFinalizar: null, pedirAutorizacao: false, recusas: null };
let _draft = null, _dirty = false;

const normNome = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Hora local 'HH:MM'.
function horaAgora(d = new Date()) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
/* "Saí agora", "Agora" e a foto do serviço pronto registram o momento do
   toque. STORE.carimbarMomento, sem carimbo anterior, põe a hora no DIA
   AGENDADO: certo para quem digita a hora depois, errado para quem toca agora
   numa O.S. vencida ou de vários dias (o retorno caía no dia da agenda). Mesmo
   formato dele: ISO local, sem Z. */
function carimbarAgora(o, campoHora, campoStamp) {
  const d = new Date();
  o[campoHora] = horaAgora(d);
  o[campoStamp] = `${OPERACAO.dia(d)}T${o[campoHora]}:00`;
}

/* ── Crachá: validade ─────────────────────────────────────────────────────
   O crachá do instalador vale 30 dias e não se renova sozinho. Quando vencia,
   AUTH.dono() devolvia null e o espelho caía em "Autorizar este aparelho": na
   rua, o instalador perdia o endereço e os itens que estão no próprio celular.
   Aqui a validade é lida só para AVISAR antes e para seguir trabalhando com o
   que está no aparelho; quem aceita ou recusa cada envio é o servidor. */
function lerCracha() {
  // AUTH.dono lê o mesmo crachá; aceitarVencido devolve também o vencido.
  const d = typeof AUTH !== 'undefined' && AUTH.dono ? AUTH.dono({ aceitarVencido: true }) : null;
  return d && typeof d.venceEm === 'number' ? { papel: d.papel, exp: d.venceEm, nome: d.nome, sub: d.usuario } : null;
}
// Dias até o crachá de instalador vencer (null se não há crachá de instalador).
function diasDoCracha() {
  const p = lerCracha();
  return p && p.papel === 'montagem' ? (p.exp * 1000 - Date.now()) / 86400000 : null;
}
// Crachá de instalador VENCIDO: o nome vem do próprio crachá, nunca da lista.
function donoVencido() {
  const p = lerCracha();
  if (!p || p.papel !== 'montagem' || p.exp * 1000 > Date.now()) return null;
  const nome = String(p.nome || p.sub || '').trim();
  return nome ? { usuario: nome, nome, papel: 'montagem', vencido: true } : null;
}

/* ── Seleção do instalador ───────────────────────────────────────────────── */
function initSelect() {
  // Dono do trabalho que está na fila, lido ANTES de qualquer escolha nesta
  // tela: é ele que decide se a gestão pode autorizar o aparelho com fila.
  if (EQ.donoDaFila == null) EQ.donoDaFila = STORE.getInstalador() || '';
  if (typeof AUTH === 'undefined' || !AUTH.dono()) {
    // Crachá de instalador vencido: segue com o que está no aparelho, com aviso.
    const v = (!EQ.pedirAutorizacao && location.hash !== '#comercial') ? donoVencido() : null;
    if (v) { EQ.vencido = true; EQ.instalador = v.nome; enter(); return; }
    mostrarAutorizacao();
    return;
  }
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
  //
  // O nome escolhido NÃO é gravado aqui: enter() grava depois de autorizar.
  // Gravar antes trocava o dono da fila mesmo quando a autorização era
  // recusada, e na abertura seguinte o trabalho de um passava a ser do outro.
  if (location.hash.startsWith('#i=')) {
    const nome = decodeURIComponent(location.hash.slice(3)).trim();
    const naEquipe = n => (STORE.getCFG().instaladores || []).some(x => normNome(x) === normNome(n));
    if (nome && naEquipe(nome)) {
      EQ.instalador = nome;
      enter();
      return;
    }
    // lista ainda não baixada neste aparelho: tenta uma vez antes de desistir
    if (nome) {
      STORE.pullCFG().then(() => {
        if (naEquipe(nome)) { EQ.instalador = nome; enter(); }
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

// Formulário da gestão que autoriza o aparelho (primeira entrada ou crachá vencido).
function mostrarAutorizacao() {
  const v = donoVencido();
  /* Veio da tarja "Autorizar de novo" (crachá ainda valendo) ou do crachá
     vencido: tem lista para onde voltar. Sem o botão, quem tocou na tarja na
     obra ficava preso no formulário da gestão, sem voltar nem recarregar no
     app da tela inicial. */
  const temVolta = v || EQ.pedirAutorizacao;
  const app = $('#eq-app'); if (app) app.classList.add('hidden');
  const scr = $('#select-screen'); scr.classList.remove('hidden');
  scr.innerHTML = `<div class="login-card"><h2>Autorizar este aparelho</h2>
      ${v ? `<p><strong>O acesso de ${esc(v.nome)} neste celular venceu.</strong> O trabalho guardado aqui não se perde: depois de autorizar de novo, ele é enviado.</p>` : ''}
      <p>Na primeira entrada, a gestão entra com sua conta do PCP e escolhe o instalador. Depois, o aparelho trabalha offline com acesso às O.S. da equipe.</p>
      <form id="eq-autorizacao"><div class="field"><label for="eq-user">Usuário da gestão</label><input id="eq-user" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></div>
      <div class="field"><label for="eq-senha">Senha</label><input id="eq-senha" type="password" autocomplete="current-password" required></div>
      <button class="btn-primary" type="submit">Entrar para autorizar</button><p id="eq-auth-erro" role="alert"></p></form>
      ${temVolta ? '<p class="eq-links"><button type="button" class="btn-ghost" id="eq-voltar-lista">Voltar às minhas O.S</button></p>' : ''}
      <p><a href="index.html" class="inline-link">Entrar pela gestão</a></p></div>`;
  /* A fila pendente não barra mais o LOGIN aqui: quem decide é enter(), pelo
     nome escolhido. Reautorizar a MESMA pessoa com trabalho na fila é o
     conserto do crachá vencido (a fila e o crachá novo são dela); outra
     pessoa continua barrada. */
  $('#eq-autorizacao').onsubmit = async e => {
    e.preventDefault();
    const b = $('#eq-autorizacao button'); b.disabled = true;
    try {
      const r = await AUTH.login($('#eq-user').value.trim(),$('#eq-senha').value);
      $('#eq-senha').value = '';
      if (r.trocarSenha || !['admin','pcp'].includes(r.papel)) { location.href = 'index.html'; return; }
      await STORE.pullCFG(); location.reload();
    } catch (e) { $('#eq-auth-erro').textContent = e.message || 'Não foi possível entrar.'; b.disabled = false; }
  };
  const volta = $('#eq-voltar-lista');
  if (volta) volta.onclick = () => location.reload();
}

let _autorizandoEquipe = false;
async function enter() {
  if (_autorizandoEquipe) return;
  const dono = typeof AUTH !== 'undefined' ? (AUTH.dono() || (EQ.vencido ? donoVencido() : null)) : null;
  if (!dono) { EQ.vencido = false; initSelect(); return; }
  if (!EQ.comercial && ['admin','pcp'].includes(dono.papel)) {
    // Fila de OUTRA pessoa trava a troca; a da mesma pessoa, não (ver mostrarAutorizacao).
    if (STORE.getQueue().length && !(EQ.donoDaFila && normNome(EQ.donoDaFila) === normNome(EQ.instalador))) {
      toast(EQ.donoDaFila
        ? `Há trabalho de ${EQ.donoDaFila} ainda não enviado neste celular. Autorize de novo para ${EQ.donoDaFila} ou entre pela gestão para enviá-lo antes de trocar.`
        : 'Há trabalho ainda não enviado neste celular. Entre pela gestão para enviá-lo antes de autorizar outra pessoa.', 'error');
      return;
    }
    // O crachá deste aparelho passa a ser o do instalador: a gestão aberta em
    // outra aba sai e pede para entrar de novo. Dito antes, não descoberto depois.
    if (!confirm(`Autorizar este aparelho para ${EQ.instalador}? A gestão deste aparelho sai: para voltar a ela, entre de novo com usuário e senha.`)) return;
    _autorizandoEquipe = true;
    try {
      // Troca de identidade só após emitir o acesso restrito; nunca limpa fila pendente.
      await AUTH.entrarMontagem(EQ.instalador);
      STORE.limparCache(); STORE.setUser(null); STORE.setInstalador(EQ.instalador);
      EQ.vencido = false;
    } catch (e) { toast(e.message || 'Não foi possível autorizar.','error'); return; }
    finally { _autorizandoEquipe = false; }
  } else if (!EQ.comercial && dono.papel === 'montagem') {
    // O instalador não assume outro nome escolhendo uma opção no navegador.
    EQ.instalador = dono.nome; STORE.setInstalador(dono.nome);
  }
  $('#select-screen').classList.add('hidden');
  $('#eq-app').classList.remove('hidden');
  const logo = $('#topbar-logo');
  if (logo && typeof LOGO_IMPRESILK !== 'undefined') logo.src = LOGO_IMPRESILK;
  $('#user-badge').textContent = EQ.comercial ? '💼 Comercial · somente leitura' : EQ.instalador;
  const sair = $('#eq-trocar');
  if (sair) {
    if (EQ.comercial) sair.style.display = 'none';
    else sair.onclick = sairDoAparelho;
  }

  STORE.onSync((status, pending) => {
    pintarSync(status, pending);
    // A lista e as miniaturas dizem QUAL O.S. e QUAL foto ainda estão só aqui.
    renderList();
    marcarFotosNaFila();
  });
  // Perda de dado nunca é silenciosa (o espelho é onde o trabalho nasce).
  STORE.on('item-pendente', ({ item, motivo }) => {
    const ref = (item && item.os && item.os.numero) ? 'A O.S ' + item.os.numero : 'Uma alteração';
    toast(`⚠️ ${ref} continua neste celular sem ir para o escritório (${motivo || 'erro'}). Avise o PCP.`, 'error');
  });
  STORE.on('item-recusado', registrarRecusa);
  STORE.on('pull-truncado', () => toast('Pode faltar O.S na lista. Feche e abra o app de novo.', 'error'));
  STORE.on('sem-sessao', () => {
    // Crachá que venceu com o app aberto: vira o aviso fixo com o botão de autorizar.
    if (!EQ.vencido && donoVencido()) { EQ.vencido = true; renderAvisos(); }
    if (window._avisouSessao) return; window._avisouSessao = true;
    toast('🔒 O escritório não aceitou este celular. O trabalho fica guardado aqui; avise o PCP.', 'error');
  });
  /* "Nada foi perdido" não era verdade garantida: com o cofre cheio a fila
     fica na memória e numa cópia no disco, e limpar os dados do navegador
     leva as duas. O aviso diz o que fazer e o que NÃO fazer. */
  STORE.on('quota', () => toast('Pouco espaço no celular. O trabalho segue guardado para envio: não limpe os dados do navegador e avise o PCP.', 'error'));
  // Foto que não deu para ler ou guardar: o motivo vem do store (sem espaço,
  // arquivo ilegível, outra aba aberta), um aviso por foto.
  STORE.on('foto-falhou', ({ motivo } = {}) => toast('⚠️ ' + (motivo || 'Uma foto não foi guardada. Tire de novo.'), 'error'));
  // O servidor gravou a O.S. mas deixou algo de fora (carro não liberado,
  // finalização não aceita, marca de item sem item): sem isto a tela só via
  // a O.S. voltar ao estado do escritório, sem saber por quê.
  STORE.on('item-aviso', ({ item, avisos } = {}) => {
    const ref = item && item.os && item.os.numero ? 'O.S ' + item.os.numero + ': ' : '';
    toast('⚠️ ' + ref + (avisos || []).join(' '), 'error');
    renderList(); atualizarModalAberto(!!(item && item.os && item.os.id === EQ.modalId));
  });
  // Outra aba trocou a base (saiu ou autorizou outra pessoa): esta aba não
  // grava mais no disco. Recarregar é o único caminho seguro.
  STORE.on('base-trocada', () => {
    if (confirm('O app foi aberto de novo em outra aba. Recarregar agora? O que está na fila continua guardado.')) location.reload();
    else toast('Recarregue a página antes de tirar fotos.', 'error');
  });
  initConflict();
  // Tocar na miniatura (ou no layout) abre a foto inteira: 96 px cortados não
  // mostram se o adesivo ficou alinhado nem o que está escrito no layout.
  document.addEventListener('click', e => {
    const img = e.target.closest && e.target.closest('#modal-os img.foto-thumb, #modal-os .eq-info-foto img');
    if (img && img.getAttribute('src')) verFotoGrande(img.src);
  });
  const vBtn = $('#btn-verificar');
  if (vBtn) vBtn.onclick = verificarNuvem;
  if (typeof iniciarFraseBar === 'function') iniciarFraseBar();

  /* O QUE FOI DIGITADO NÃO MORRE COM A PÁGINA. Abrir a câmera num celular com
     pouca memória, atender uma ligação ou trocar de app pode matar a aba; o
     KM, a hora e as Obs técnicas viviam só na memória até fechar a ficha. */
  document.addEventListener('visibilitychange', () => { if (document.hidden && _dirty) save(); });
  window.addEventListener('pagehide', () => { if (_dirty) save(); });
  window.addEventListener('popstate', aoVoltar);

  // Espelho: mesma regra do app — o cache das O.S vem do IndexedDB, então
  // pinta agora e repinta quando o disco responder (senão o instalador abre
  // numa lista vazia e acha que perdeu o dia).
  renderAvisos();
  renderList();
  const pronto = () => { EQ.pronto = true; renderList(); puxar(); };
  STORE.pronto().then(pronto, pronto);
  setInterval(puxar, 30000);
}

/* FOTO GRANDE: um <dialog id="foto-ver"> só, criado no primeiro toque (o
   desenho está no styles.css). O × e o toque no fundo fecham. */
function verFotoGrande(src) {
  let dl = document.getElementById('foto-ver');
  if (!dl) {
    dl = document.createElement('dialog');
    dl.id = 'foto-ver';
    dl.innerHTML = '<img alt=""><button type="button" class="modal-close" aria-label="Fechar">×</button>';
    dl.querySelector('button').onclick = () => dl.close();
    dl.onclick = e => { if (e.target === dl) dl.close(); };
    document.body.appendChild(dl);
  }
  dl.querySelector('img').src = src;
  if (dl.showModal) { if (!dl.open) dl.showModal(); } else dl.setAttribute('open', '');
}

/* SAIR CUSTA CARO: apaga o crachá e as O.S. do celular, e só a gestão, com
   usuário e senha, devolve o acesso. Morava na barra, colado no nome, e saía
   num toque de luva. Agora fica no pé da lista e pergunta antes. */
function sairDoAparelho() {
  if (STORE.getQueue().length) { toast('Ainda há trabalho deste celular para enviar. Espere o sinal e confira no ☁️ antes de sair.', 'error'); return; }
  if (!confirm('Sair deste celular? As O.S. saem do aparelho e, para voltar, alguém da gestão precisa entrar com usuário e senha.')) return;
  AUTH.esquecer(); STORE.limparCache(); STORE.setUser(null); STORE.setInstalador(null); location.reload();
}

// Busca novidades do escritório e tenta enviar a fila.
function puxar() {
  Promise.resolve(STORE.pull(() => { renderList(); atualizarModalAberto(); }))
    .then(() => { renderList(); baixarLayouts(); }, () => renderList());
  STORE.trySync();
}

/* O LAYOUT VAI PARA O CELULAR ANTES DE FALTAR SINAL. A arte só era baixada ao
   abrir a ficha: na obra sem sinal, a O.S. nunca aberta com internet mostrava
   imagem quebrada no lugar do que instalar. pullPhoto guarda no aparelho e
   não baixa de novo o que já tem. */
function baixarLayouts() {
  if (EQ.comercial) return;
  minhasOS().filter(o => !o.finalizadaEm && o.layoutFotoId)
    .forEach(o => { Promise.resolve(STORE.pullPhoto(o.layoutFotoId)).catch(() => {}); });
}

/* PÍLULA DE ENVIO: o número de alterações presas aparece também sem sinal,
   que é quando mais importa, e o toque explica em palavras. */
function pintarSync(status, pending) {
  const el = $('#sync-indicator'); if (!el) return;
  const n = pending || 0;
  el.className = 'sync-indicator ' + status;
  el.textContent = status === 'ok' ? '✅'
    : status === 'pending' ? `⏳ ${n}`
    : status === 'sem-sessao' ? ('🔒 ' + (n || '')).trim()
    : ('📵 ' + (n || '')).trim();
  const guardadas = n ? `${n} alteração(ões) guardada(s) neste celular. ` : '';
  const paradas = recusasNaFila().size;
  el.title = status === 'ok' ? 'Tudo o que você fez neste celular já foi para o escritório.'
    : status === 'pending' && paradas ? `${n} alteração(ões) guardada(s) neste celular. O escritório não aceitou ${paradas === 1 ? '1 O.S.' : paradas + ' O.S.'}: veja o motivo na lista e fale com o PCP.`
    : status === 'pending' ? `${n} alteração(ões) indo para o escritório. Some sozinho quando terminar.`
    : status === 'sem-sessao' ? `O escritório não aceitou este celular. ${guardadas}Avise o PCP.`
    : `Sem sinal. ${guardadas}Pode continuar: envia sozinho quando a internet voltar.`;
  el.setAttribute('aria-label', el.title);
  el.onclick = () => toast(el.title);
}

/* ── Avisos fixos (topo da lista) ─────────────────────────────────────────
   O que não pode sumir em 3 s como um toast: acesso vencendo ou vencido e
   gravação que o escritório recusou. */
const K_RECUSADOS = 'impresilk_inst_recusados';
function lerRecusados() {
  try { const l = JSON.parse(localStorage.getItem(K_RECUSADOS) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
/* RECUSA DEFINITIVA NÃO É CALADA. No 403 (a O.S. saiu da equipe dele, por
   exemplo) o store tira o item da fila e só emite 'item-recusado'. O espelho
   não ouvia: a pílula ia para ✅ e o serviço feito nunca chegava ao
   escritório, sem ninguém saber. Guarda uma cópia (a fila leva só o id das
   fotos) e deixa o aviso até o instalador tocar em Entendi. Apagar foto
   recusado não perde trabalho (a foto só fica guardada lá): não alarma. */
function registrarRecusa(ev) {
  const { item, motivo } = ev || {};
  if (!item || item.action === 'deletePhoto') return;
  const copia = item.action === 'putPhoto' ? { action: item.action, fileId: item.fileId } : item;
  const l = lerRecusados();
  l.push({ em: nowISO(), motivo: String(motivo || 'sem motivo'), numero: item.os ? String(item.os.numero || item.os.id || '') : '', item: copia, visto: false });
  try { localStorage.setItem(K_RECUSADOS, JSON.stringify(l.slice(-5))); } catch {}
  renderAvisos();
}
function renderAvisos() {
  const el = $('#eq-avisos'); if (!el || EQ.comercial) return;
  const avisos = [];
  if (EQ.vencido) {
    avisos.push(`<div class="trava-msg eq-aviso" role="alert"><span>🔒 Seu acesso neste celular venceu. Pode continuar: o que você registrar fica guardado aqui. Peça ao PCP para autorizar de novo.</span><button type="button" class="btn-ghost" data-aviso="autorizar">Autorizar de novo</button></div>`);
  } else {
    const d = diasDoCracha();
    if (d != null && d <= 5) avisos.push(`<div class="trava-msg eq-aviso"><span>⏳ Seu acesso neste celular vence ${d < 1 ? 'hoje' : `em ${Math.ceil(d)} dia(s)`}. Peça ao PCP para autorizar de novo antes disso.</span><button type="button" class="btn-ghost" data-aviso="autorizar">Autorizar de novo</button></div>`);
  }
  const rec = lerRecusados().filter(r => !r.visto);
  if (rec.length) {
    const quais = rec.map(r => r.numero ? 'a O.S ' + r.numero : 'uma alteração').join(', ');
    avisos.push(`<div class="trava-msg eq-aviso" role="alert"><span>⛔ O escritório não aceitou ${esc(quais)}: ${esc(rec[rec.length - 1].motivo)} O registro ficou guardado neste celular. Ligue para o PCP antes de sair daqui.</span><button type="button" class="btn-ghost" data-aviso="recusa">Entendi</button></div>`);
  }
  el.innerHTML = avisos.join('');
  $$('[data-aviso="autorizar"]', el).forEach(b => b.onclick = () => { EQ.pedirAutorizacao = true; mostrarAutorizacao(); });
  $$('[data-aviso="recusa"]', el).forEach(b => b.onclick = () => {
    try { localStorage.setItem(K_RECUSADOS, JSON.stringify(lerRecusados().map(r => ({ ...r, visto: true })))); } catch {}
    renderAvisos();
  });
}

/* ── Conflito ─────────────────────────────────────────────────────────────
   UM DE CADA VEZ, NENHUM ESQUECIDO: cada conflito novo trocava os botões do
   anterior, que ficava preso na fila sem aviso. E o botão PRINCIPAL guarda o
   trabalho: o azul era "Recarregar (servidor)", que jogava fora fotos, itens
   e até a finalização de quem não sabe o que é servidor. Com o crachá de
   toque, o servidor já só aceita os campos da execução (mesclarToqueNoNome):
   manter o que foi feito aqui não apaga nada do escritório. */
const _conflitos = [];
function initConflict() {
  STORE.onConflict((local, remote) => {
    const i = _conflitos.findIndex(c => c.local.id === local.id);
    if (i >= 0) _conflitos[i] = { local, remote }; else _conflitos.push({ local, remote });
    // Sempre o primeiro da fila; redesenhar só atualiza o "1 de N".
    mostrarConflito();
  });
}
// Fotos são lista que só cresce: manter o meu não pode derrubar a do colega.
function juntarFotos(meu, remote) {
  // Nem a que já foi apagada aqui (o deletePhoto pode já ter saído da fila).
  const apagando = new Set([...STORE.getQueue().filter(x => x.action === 'deletePhoto').map(x => x.fileId), ...(meu.fotosTiradas || [])]);
  for (const k of ['fotosCheckinIds', 'fotosRetornoIds']) {
    const r = (remote[k] || []).filter(id => !apagando.has(id));
    meu[k] = [...new Set([...(meu[k] || []), ...r])];
  }
  (meu.itens || []).forEach((it, i) => {
    const r = (remote.itens || [])[i];
    if (it && r && !it.fotoProbId && r.fotoProbId && !apagando.has(r.fotoProbId) && String(r.item ?? '') === String(it.item ?? '')) it.fotoProbId = r.fotoProbId;
  });
  return meu;
}
// O que o "descartar" joga fora, dito em palavras antes de jogar.
function oQueSePerde(local, remote) {
  const tem = new Set([...(remote.fotosCheckinIds || []), ...(remote.fotosRetornoIds || []), ...(remote.itens || []).map(i => i && i.fotoProbId)]);
  const fotos = [...(local.fotosCheckinIds || []), ...(local.fotosRetornoIds || []), ...(local.itens || []).map(i => i && i.fotoProbId)]
    .filter(id => id && !tem.has(id)).length;
  const itens = (local.itens || []).filter((it, i) => it && (it.statusInst || '') !== ((remote.itens || [])[i] || {}).statusInst && it.statusInst).length;
  const p = [];
  if (fotos) p.push(fotos === 1 ? '1 foto' : fotos + ' fotos');
  if (itens) p.push(itens === 1 ? '1 item marcado' : itens + ' itens marcados');
  if (local.finalizadaEm && !remote.finalizadaEm) p.push('a finalização');
  if ((local.horaSaida && !remote.horaSaida) || (local.horaRetorno && !remote.horaRetorno)) p.push('os horários');
  return p.join(', ');
}
function proximoConflito() {
  _conflitos.shift();
  if (_conflitos.length) mostrarConflito(); else $('#conflict-dialog').classList.add('hidden');
}
function mostrarConflito() {
  const c = _conflitos[0];
  const dlg = $('#conflict-dialog');
  if (!c) { dlg.classList.add('hidden'); return; }
  const { local, remote } = c;
  const num = remote.numero || remote.id;
  const extra = _conflitos.length > 1 ? ` (1 de ${_conflitos.length})` : '';
  $('#conflict-msg').textContent = `O PCP alterou a O.S ${num} enquanto você trabalhava${extra}. O que você fez aqui (fotos, itens, horários) pode ser mantido.`;
  dlg.classList.remove('hidden');
  $('#conflict-overwrite').onclick = () => {
    // Ficha aberta nesta O.S.: o rascunho é a versão mais nova do que foi feito.
    const aberta = EQ.modalId === local.id && _draft;
    if (aberta) juntarFotos(_draft, remote);
    // A junção vai também no objeto que o store escolhe enviar: com a ficha
    // fechada ele troca `local` (cópia da fila) pelo da lista, e a foto do
    // colega saía da O.S.
    STORE.sobrescreverServidor(aberta ? _draft : local, alvo => juntarFotos(alvo, remote));
    // O store adota o rev do servidor no objeto que ficou na lista; se o
    // rascunho for outra cópia, ele precisa do mesmo rev, senão a próxima
    // gravação da ficha bate no mesmo conflito.
    if (aberta) { const salvo = STORE.getOS(local.id); if (salvo && typeof salvo.rev === 'number') _draft.rev = salvo.rev; }
    _dirty = false;
    if (aberta) reRender();
    proximoConflito(); renderList(); toast('O que você fez foi enviado ao escritório.', 'success');
  };
  $('#conflict-reload').onclick = () => {
    const perde = oQueSePerde(EQ.modalId === local.id && _draft ? _draft : local, remote);
    if (!confirm(`Descartar o que você fez na O.S ${num}?${perde ? ' Some: ' + perde + '.' : ''} Não dá para desfazer.`)) return;
    STORE.aceitarServidor(remote);
    if (EQ.modalId === remote.id) openModal(STORE.getOS(remote.id));
    proximoConflito(); renderList(); toast('Ficou a versão do escritório.', 'success');
  };
}

// Geolocalização automática no check‑in: comprova que a equipe esteve no
// endereço, sem o instalador precisar informar nada. Registra só uma vez.
// Grava na O.S. do check-in (d), mesmo que a ficha já tenha fechado ou trocado
// nos até 8 s que o GPS leva: a mesma regra das fotos (anexarFotos).
function capturarLocalCheckin(d) {
  if (!d || d.checkinGPS || typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      const alvo = (_draft && _draft.id === d.id) ? _draft : STORE.getOS(d.id);
      if (!alvo || alvo.checkinGPS) return;
      alvo.checkinGPS = {
        lat: +pos.coords.latitude.toFixed(6),
        lng: +pos.coords.longitude.toFixed(6),
        precisao: Math.round(pos.coords.accuracy || 0),
        ts: nowISO()
      };
      if (alvo === _draft) save();
      else { alvo.atualizadoEm = nowISO(); alvo.atualizadoPor = EQ.instalador; STORE.saveOS(alvo); }
      toast('📍 Localização do check-in registrada', 'success');
    },
    () => {}, // sem permissão/sinal: segue o fluxo sem travar
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

/* Confere com o escritório se o que foi feito AQUI chegou. Dizia "Tudo salvo
   na nuvem (1873 O.S)": o total era o da casa inteira, não o do instalador. */
async function verificarNuvem() {
  const vBtn = $('#btn-verificar');
  if (vBtn) vBtn.disabled = true;
  toast('Conferindo com o escritório…');
  try {
    await STORE.trySync();
    await STORE.api({ action: 'list' });
    const fila = STORE.getQueue().length;
    if (fila) toast(`⏳ ${fila} alteração(ões) ainda neste celular. Vão quando o sinal permitir.`, 'error');
    else      toast('✅ Tudo o que você fez neste celular chegou ao escritório.', 'success');
  } catch (e) {
    if (e && (e.semSessao || e.status === 401 || e.status === 403))
      toast('🔒 O escritório não aceitou este celular (acesso vencido?). Avise o PCP.', 'error');
    else toast('📵 Sem resposta do escritório. Você está sem sinal?', 'error');
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
// O.S. com gravação ainda só neste celular, e fotos que ainda não subiram.
function osNaFila() { return new Set(STORE.getQueue().filter(x => x.action === 'upsert' && x.os).map(x => x.os.id)); }
/* O.S. PARADA NA FILA TEM MOTIVO. Quando o escritório recusa a gravação
   (400/422: cliente não confirmado, retorno antes da saída), o item fica na
   fila com `recusa.motivo`. O toast aparece uma vez; depois disso a linha
   dizia só "ainda no celular" e a pílula prometia que "some sozinho". */
function recusasNaFila() {
  const m = new Map();
  STORE.getQueue().forEach(x => { if (x.action === 'upsert' && x.os && x.recusa && x.recusa.motivo) m.set(x.os.id, String(x.recusa.motivo)); });
  return m;
}
function fotosNaFila() { return new Set(STORE.getQueue().filter(x => x.action === 'putPhoto').map(x => x.fileId)); }

/* A LISTA COMEÇA POR HOJE. Ordenada só por data crescente, ela abria com a
   retirada sem data e a vencida, e a O.S. de hoje ficava abaixo delas e de
   semanas de finalizadas (o aparelho guarda 60 dias). Grupos na ordem do dia:
   Hoje (na rua ou na agenda de hoje), Data vencida, Próximas; as finalizadas
   num bloco fechado, as mais novas primeiro. */
function gruposDaLista(list, hoje = OPERACAO.dia(new Date())) {
  const g = { hoje: [], vencidas: [], proximas: [], finalizadas: [] };
  const dataDe = o => OPERACAO.dia(o.instalacao && o.instalacao.data);
  for (const o of list) {
    if (o.finalizadaEm) g.finalizadas.push(o);
    // Voltou e só falta finalizar: a ação é abrir e finalizar, não "confirmar
    // com o PCP" (título das vencidas).
    else if (OPERACAO.naRua(o, hoje) || OPERACAO.diasAgenda(o).includes(hoje) || (isInterno(o) && dataDe(o) === hoje) || o.horaRetorno || o.retornoEm) g.hoje.push(o);
    else if (OPERACAO.atrasada(o, hoje)) g.vencidas.push(o);
    else g.proximas.push(o);
  }
  // Sem data vai para o fim do grupo.
  const porData = (a, b) => (dataDe(a) || '9999').localeCompare(dataDe(b) || '9999');
  g.hoje.sort(porData); g.vencidas.sort(porData); g.proximas.sort(porData);
  g.finalizadas.sort((a, b) => String(b.finalizadaEm || '').localeCompare(String(a.finalizadaEm || '')));
  return g;
}
function itemListaHTML(os, heroId, naFila) {
  const st = calcStatus(os);
  const naRua = OPERACAO.naRua(os);
  return `<div class="os-list-item st-${st}${os.id===heroId?' is-hero':''}" data-os-id="${esc(os.id)}">
          <div class="list-info">
            <div class="list-numero">O.S ${esc(os.numero||'sem número')} ${naRua?'🚗':''} ${os.finalizadaEm?'✓':''}${OPERACAO.atrasada(os) && !(os.horaRetorno || os.retornoEm) ? ' <span class="tag-atraso">⏰ data vencida · confirme com o PCP</span>' : ''}${!os.finalizadaEm && (os.horaRetorno || os.retornoEm) ? ' <span class="badge">voltou · falta finalizar</span>' : ''}${naFila.has(os.id) ? (EQ.recusas && EQ.recusas.has(os.id) ? ' <span class="badge eq-na-fila">⛔ parada no celular</span>' : ' <span class="badge eq-na-fila">⏳ ainda no celular</span>') : ''}</div>
            ${EQ.recusas && EQ.recusas.has(os.id) ? `<div class="trava-msg" style="margin-top:4px">O escritório não aceitou: ${esc(EQ.recusas.get(os.id))} Fale com o PCP.</div>` : ''}
            <div class="list-cliente">${esc(os.cliente)} · ${esc(os.endereco||'')}</div>
            <div class="list-date">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
          </div>
          <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
        </div>`;
}
// Lista vazia tem três motivos diferentes, e "nada para você" só é um deles.
function textoListaVazia() {
  if (!EQ.pronto) return 'Carregando as O.S deste celular…';
  if (!STORE.getLastSync()) return 'Ainda não consegui baixar suas O.S. Procure um lugar com sinal: a lista aparece sozinha.';
  return EQ.comercial ? 'Nenhuma O.S liberada.' : 'Nenhuma O.S atribuída a você.';
}

function renderList() {
  const el = $('#eq-list');
  const list = minhasOS();
  // Cartão grande: na rua > hoje > próxima data. Vencida nunca (OPERACAO.destaqueDoDia).
  const proxima = EQ.comercial ? null : OPERACAO.destaqueDoDia(list);
  const heroId = proxima ? proxima.id : null;

  let heroHtml = '';
  if (proxima) {
    // O.S interna = CLIENTE RETIRA: não há deslocamento. Chamar isso de "sua
    // próxima instalação" com botão de Rota mandava o instalador carregar o
    // carro e dirigir até o endereço do cliente para descobrir na porta que era
    // o cliente quem vinha buscar.
    const interno = isInterno(proxima);
    const naRua = OPERACAO.naRua(proxima);
    const maps = (!interno && proxima.endereco) ? `https://maps.google.com/?q=${encodeURIComponent(proxima.endereco)}` : '';
    const tag = interno ? '🛍 Pronto p/ retirada: o cliente vem buscar'
      : naRua ? '🚗 Em rota' : '📍 Sua próxima instalação';
    heroHtml = `
      <div class="proxima-card${interno ? ' is-interno' : ''}" data-hero-id="${esc(proxima.id)}">
        <div class="proxima-tag">${tag}</div>
        <div class="proxima-os">O.S ${esc(proxima.numero || 'sem número')}</div>
        <div class="proxima-cliente">${esc(proxima.cliente || 'Sem cliente')}</div>
        <div class="proxima-end">${interno ? 'Retirada na fábrica' : esc(proxima.endereco || 'Endereço não informado')}</div>
        <div class="proxima-data">📅 ${esc(fmtInstalacao(proxima.instalacao))}</div>
        <div class="proxima-acoes">
          <button class="btn-primary" data-hero-abrir="${esc(proxima.id)}">Abrir O.S ▶</button>
          ${maps ? `<a class="btn-ghost" href="${maps}" target="_blank">🗺️ Rota</a>` : ''}
        </div>
      </div>`;
  }

  /* LIMPEZA DO CARRO: cartão próprio, porque a O.S. finalizada é somente
     leitura na ficha. Com alguém na rua ele fica abaixo do cartão grande; no
     fim do dia (ninguém na rua) é a ação que importa e vai para cima, já que
     o cartão grande pulou para amanhã. */
  const hoje = OPERACAO.dia(new Date());
  const limpezas = limpezasPendentes(list).filter(g => g.equipeDisse !== 'toda' || g.dia === hoje);
  const semRetornoHoje = list.some(o => !o.finalizadaEm && !isInterno(o) && OPERACAO.diasAgenda(o).includes(hoje) && !(o.horaRetorno || o.retornoEm));
  const limpezaHtml = limpezas.map(g => limpezaCardHTML(g, hoje, semRetornoHoje)).join('');
  const algumaNaRua = list.some(o => OPERACAO.naRua(o));

  const naFila = osNaFila();
  EQ.recusas = recusasNaFila();
  const g = gruposDaLista(list, hoje);
  const linhas = arr => `<div class="os-list">${arr.map(os => itemListaHTML(os, heroId, naFila)).join('')}</div>`;
  const titulo = (t, n) => `<h2 class="eq-grupo" style="margin:14px 0 8px;font-size:1.05rem">${t}${n != null ? ` <span class="text-muted">(${n})</span>` : ''}</h2>`;
  // O bloco das finalizadas fica como o instalador deixou entre uma repintura e outra.
  const finAntes = $('.eq-finalizadas', el);
  const finAberto = !!(finAntes && finAntes.open);
  const corpo = !list.length ? `<p class="text-muted">${textoListaVazia()}</p>` : [
    titulo('Hoje', g.hoje.length),
    g.hoje.length ? linhas(g.hoje) : '<p class="text-muted">Nenhuma O.S sua para hoje.</p>',
    g.vencidas.length ? titulo('Data vencida · confirme com o PCP', g.vencidas.length) + linhas(g.vencidas) : '',
    g.proximas.length ? titulo('Próximas', g.proximas.length) + linhas(g.proximas) : '',
    g.finalizadas.length ? `<details class="card-fs eq-finalizadas" style="margin-top:14px"${finAberto ? ' open' : ''}><summary>Finalizadas (${g.finalizadas.length})</summary><div class="fs-body">${linhas(g.finalizadas)}</div></details>` : '',
  ].join('');

  el.innerHTML = `
    ${algumaNaRua ? heroHtml + limpezaHtml : limpezaHtml + heroHtml}
    ${EQ.comercial ? '<h2 style="margin:14px 0 12px;font-size:1.1rem">Instalações (visão comercial)</h2>' : ''}
    ${corpo}`;
  const abrir = id => { const os = STORE.getOS(id); if (os) openModal(os); };
  $$('[data-hero-abrir]', el).forEach(b => b.onclick = e => { e.stopPropagation(); abrir(b.dataset.heroAbrir); });
  $$('[data-limpeza-abrir]', el).forEach(b => b.onclick = e => { e.stopPropagation(); abrirLimpezaCarro(b.dataset.limpezaAbrir); });
  const heroCard = $('[data-hero-id]', el);
  if (heroCard) heroCard.onclick = () => abrir(heroCard.dataset.heroId);
  $$('[data-os-id]', el).forEach(c => c.onclick = () => abrir(c.dataset.osId));
}

/* ── Voltar do Android fecha a ficha, não o app ───────────────────────────
   A ficha sobe de baixo como uma folha, e o gesto natural para fechá-la é o
   voltar. Sem uma entrada no histórico, o voltar saía da página (no app da
   tela inicial, fechava o app) e levava o que não tinha sido gravado. */
let _ignorarPop = false;
function empilharFicha() {
  try { if (!(history.state && history.state.eqFicha)) history.pushState({ eqFicha: 1 }, ''); } catch {}
}
function desempilharFicha() {
  try { if (history.state && history.state.eqFicha) { _ignorarPop = true; history.back(); } } catch {}
}
function aoVoltar() {
  if (_ignorarPop) { _ignorarPop = false; return; }
  if (EQ.limpeza) fecharLimpeza(true);
  else if (EQ.modalId) closeModal(true);
}

/* ── Modal (só execução) ─────────────────────────────────────────────────── */
function openModal(os) {
  if (!os) { toast('O.S não encontrada.', 'error'); return; }
  _draft = JSON.parse(JSON.stringify(os));
  _dirty = false; EQ.modalId = os.id; EQ.tentouFinalizar = null;
  renderModal();
  $('#modal-overlay').classList.remove('hidden');
  empilharFicha();
}
// veioDoVoltar === true: o voltar do navegador já tirou a entrada do histórico.
function closeModal(veioDoVoltar) {
  if (_dirty) save();
  $('#modal-overlay').classList.add('hidden');
  EQ.modalId = null; _draft = null; EQ.tentouFinalizar = null;
  if (veioDoVoltar !== true) desempilharFicha();
  renderList();
}
function save() {
  if (!_draft) return;
  /* A PRÓPRIA GRAVAÇÃO NÃO É CONFLITO. Quando o envio desta ficha é aceito, o
     store troca a cópia dele pela resposta do servidor (rev novo) e o
     rascunho aberto fica com o rev antigo: a segunda ação na mesma ficha batia
     em "conflito" contra ela mesma. Se a cópia do store é o eco da última
     gravação deste rascunho (mesmo atualizadoEm), o rev novo é nosso. Mudança
     de outra pessoa tem outro atualizadoEm e continua sendo conflito. */
  const atual = STORE.getOS(_draft.id);
  if (atual && atual !== _draft && typeof atual.rev === 'number' && atual.atualizadoEm === _draft.atualizadoEm &&
      !(typeof _draft.rev === 'number' && _draft.rev >= atual.rev)) _draft.rev = atual.rev;
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
function rollupRetrab(o = _draft) {
  const itens = o.itens || [];
  const retrab = itens.filter(i => i.statusInst === 'retrab');
  o.retrabalho = retrab.length > 0;
  if (retrab.length) {
    o.problema = retrab.map(i => `${i.item||'Item'}: ${i.motivo||'sem motivo'}${i.obsProb?` (${i.obsProb})`:''}`).join(' | ');
    o.causa = retrab[0].motivo || o.causa || '';
  }
}
/* REDESENHAR NÃO TIRA O DEDO DO CAMPO. A foto que termina de subir redesenha
   a ficha inteira: quem digitava o detalhe do retrabalho ou as Obs técnicas
   perdia o foco e o teclado fechava no meio da frase. Guarda qual campo tinha
   o foco (pelo data-atributo, que sobrevive ao redesenho) e o devolve. */
function reRender() {
  const root = $('#modal-os');
  const opens = $$('#modal-os .card-fs').map(d => d.open);
  const ae = document.activeElement;
  let foco = null, pos = null;
  if (ae && ae.closest && ae.closest('#modal-os')) {
    for (const a of ['data-f', 'data-iobs', 'data-c']) if (ae.hasAttribute(a)) { foco = `[${a}="${ae.getAttribute(a)}"]`; break; }
    try { if (typeof ae.selectionStart === 'number') pos = ae.selectionStart; } catch {}
  }
  renderModal();
  $$('#modal-os .card-fs').forEach((d, i) => { if (opens[i] != null) d.open = opens[i]; });
  if (foco) {
    const el = $(foco, root);
    if (el && el.focus) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch {} }
  }
}

/* A FICHA ABERTA ACOMPANHA O ESCRITÓRIO. A cópia de trabalho é tirada ao
   abrir; o PCP confirmava o cliente, a lista atrás mudava e a ficha seguia com
   "Aguarde a confirmação" e o Liberar carro apagado até fechar e abrir. Sem
   edição pendente e sem dedo num campo, troca pela versão nova. */
/* `doAviso`: o servidor gravou esta ficha deixando algo de fora (finalização,
   carro). O store já pôs o rev novo no próprio rascunho antes de trocar o
   objeto da lista, então comparar rev não via mudança e a ficha seguia
   "finalizada" ou com o carro liberado. Nesse caso vale a cópia do store. */
function atualizarModalAberto(doAviso) {
  if (EQ.comercial || !EQ.modalId || !_draft || _dirty) return;
  const novo = STORE.getOS(EQ.modalId);
  if (!novo || novo === _draft || typeof novo.rev !== 'number') return;
  if (!doAviso && novo.rev <= (Number(_draft.rev) || 0)) return;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('#modal-os') && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;
  _draft = JSON.parse(JSON.stringify(novo));
  reRender();
}

// Miniatura que ainda não subiu ganha a marca "no celular" (sem redesenhar a ficha).
function marcarFotosNaFila() {
  if (!EQ.modalId) return;
  const fila = fotosNaFila();
  $$('#modal-os [data-fid]').forEach(w => w.classList.toggle('na-fila', fila.has(w.dataset.fid)));
}

// WhatsApp, ligar e mapa. Mesma regra da gestão para o 55: número que já vem
// com o código do país não ganha outro (abria o WhatsApp para 5555…).
function contatoHTML(os, comMapa = true) {
  const dig = String(os.whatsapp || '').replace(/\D/g, '');
  const num = dig.length >= 10 ? ((dig.startsWith('55') && dig.length > 11) ? dig : '55' + dig) : '';
  const links = [];
  if (num) {
    links.push(`<a class="inline-link" target="_blank" rel="noopener" href="https://wa.me/${esc(num)}">💬 WhatsApp</a>`);
    links.push(`<a class="inline-link" href="tel:+${esc(num)}">📞 Ligar</a>`);
  }
  if (comMapa && os.endereco) links.push(`<a class="inline-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco)}">🗺 Mapa</a>`);
  return links.length ? `<div class="eq-links">${links.join('')}</div>` : '';
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
    const okMark = retrab ? '🔴' : ((it.statusInst === 'ok' || it.pronto) ? '✓' : '');
    const motivo = retrab ? `<div class="text-sm" style="color:var(--red)">↳ ${esc(it.motivo||'sem motivo')}${it.obsProb?`: ${esc(it.obsProb)}`:''}</div>` : '';
    return `
    <tr${retrab?' style="background:#fef2f2"':''}>
      <td>${esc(it.item)}${motivo}</td><td>${esc(it.descricao)}</td><td>${esc(it.medidas)}</td><td>${esc(it.qtde)}</td>
      <td style="text-align:center">${okMark}</td>
    </tr>`;
  }).join('');

  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">O.S ${esc(os.numero||'sem número')}</div>
        <div class="modal-meta">${esc(os.cliente||'')}</div>
      </div>
      <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
      <button type="button" class="modal-close" id="m-close" aria-label="Fechar">×</button>
    </div>

    <div style="padding:12px 16px;background:#eff6ff;border-bottom:1px solid var(--border)">
      <div class="list-date" style="font-size:.95rem">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      <div class="text-sm" style="margin-top:4px">📍 ${esc(os.endereco||'')}</div>
      <div class="text-sm">👷 ${esc((os.equipe||[]).join(', '))} ${os.veiculo?'· 🚗 '+esc(os.veiculo):''}</div>
      ${contatoHTML(os)}
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
        <div class="text-sm">Confirmação cliente: <strong>${esc(os.confirmacao || 'não informada')}</strong></div>
        <div class="text-sm">Instalação OK: <strong>${os.instalacaoOK ? 'Sim' : 'Não'}</strong>${os.conferidoPor ? ' · por '+esc(os.conferidoPor) : ''}</div>
        ${os.retrabalho ? `<div class="text-sm" style="color:var(--red)">⚠ Retrabalho${os.problema ? ': '+esc(os.problema) : ''}</div>` : ''}
        ${co.situacao ? `<div class="text-sm">Check-out: <strong>${esc(co.situacao)}</strong>${co.hora ? ' · '+esc(co.hora) : ''}${co.por ? ' · '+esc(co.por) : ''}</div>` : ''}
        ${co.obs ? `<div class="text-sm">Obs: ${esc(co.obs)}</div>` : ''}
        <div class="text-sm" style="margin-top:6px">${os.finalizadaEm
          ? `✓ Finalizada · ${new Date(os.finalizadaEm).toLocaleString('pt-BR')}`
          : '⏳ Em aberto'}</div>
      </div>
    </details>

    <div class="fs-body modal-acoes">
      <button type="button" class="btn-ghost" id="m-save">Fechar</button>
    </div>
  `;
  $('#m-close').onclick = closeModal;
  $('#m-save').onclick = closeModal;
}

// Mensagem da trava de saída: diz o dia da confirmação quando ela não é de hoje.
function msgConfirmacao(o) {
  const d = diaCurto(o.confEm);
  return o.confirmacao === 'Confirmado' && d
    ? `O cliente foi confirmado em ${d}, não hoje. Peça ao PCP para confirmar de novo antes de sair.`
    : 'O cliente ainda não foi confirmado hoje. Ligue para o PCP antes de sair.';
}

/* O QUE FALTA PARA FINALIZAR, com o bloco da ficha onde se resolve cada um.
   RETIRADA (o cliente vem buscar) não sai nem volta: a regra é a da gestão
   (validarFinalizacao), PCP liberado e pelo menos 1 item, e o servidor também
   dispensa a confirmação e as fotos dela. Pedir confirmação, fotos e hora de
   retorno travava a retirada para sempre no espelho. */
function faltasParaFinalizar(d) {
  const f = [];
  const add = (txt, bloco) => f.push({ txt, bloco });
  if (!d.liberadoPCP) add('PCP liberar', '');
  if (isInterno(d)) {
    if (!(d.itens || []).length) add('pelo menos 1 item', 'itens');
    return f;
  }
  if (d.confirmacao !== 'Confirmado') add('confirmação do cliente', 'saida');
  if (!(d.fotosCheckinIds||[]).length) add('foto de check-in', 'chegada');
  const semMotivo = (d.itens||[]).filter(i => i.statusInst === 'retrab' && !i.motivo);
  if (semMotivo.length) add('motivo do retrabalho em: ' + semMotivo.map(i => i.item || 'item').join(', '), 'itens');
  /* DECISÃO (B) DO LÉO, 23/09/2026: "O instalador finaliza, e o espelho passa
     a pedir a foto do serviço pronto." O servidor recusa a finalização sem a
     foto e sem a hora de retorno (validarConclusao); pedir aqui é o que evita
     o instalador ver "finalizada" e a O.S. ficar presa na fila. */
  if (!(d.fotosRetornoIds||[]).length) add('foto do serviço pronto', 'pronto');
  if (!d.instalacaoOK) add('Instalação OK', 'pronto');
  if (!d.retornoEm) add('hora de retorno', 'volta');
  return f;
}
// Abre e mostra o bloco da ficha onde está o que falta.
function irParaBloco(bloco) {
  if (!bloco) return;
  const el = $(`#modal-os [data-bloco="${bloco}"]`);
  if (!el) return;
  el.open = true;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* A FICHA NA ORDEM DO DIA: saída, chegada no cliente (check-in), itens,
   serviço pronto, retorno e, preso ao pé da tela, o Finalizar. Antes a foto
   de check-in, feita na chegada, vinha depois da hora e do KM de RETORNO, e o
   Finalizar só aparecia depois de três telas de rolagem. O bloco Check-out
   saiu: repetia "Conferido por" e a hora, e a situação "Retrabalho" escolhida
   ali contava retrabalho na gestão com todos os itens marcados como
   instalados. O fecho da finalização grava a situação e o confirmado, como a
   gestão faz. */
function renderModal() {
  if (EQ.comercial) return renderModalComercial();
  const os = _draft;
  const st = calcStatus(os);
  const interno = isInterno(os);
  const confirmadoHoje = OPERACAO.confirmadaHoje(os);
  const itens = os.itens || [];
  const instalados = itens.filter(i => i.statusInst === 'ok').length;
  const retrabN = itens.filter(i => i.statusInst === 'retrab').length;
  const fotos = os.fotosCheckinIds || [];
  const fotosRet = os.fotosRetornoIds || [];
  const causas = STORE.getCFG().causas_retrabalho || [];
  const ro = !!os.finalizadaEm; // O.S finalizada = somente leitura no espelho
  const naFila = fotosNaFila();
  // Miniatura; rm é o atributo do × (vazio na O.S. finalizada, que não apaga nada).
  const thumb = (fid, rm) => `<div class="foto-thumb-wrap${naFila.has(fid) ? ' na-fila' : ''}" data-fid="${esc(fid)}"><img class="foto-thumb" data-img="${esc(fid)}" alt="foto">${ro || !rm ? '' : `<button type="button" class="foto-rm" ${rm} aria-label="Apagar foto">×</button>`}</div>`;

  // Informações de preparação (PCP/agenda) que o instalador só VÊ, não edita.
  // Aberto até a saída (ferramentas e suprimentos se conferem antes de sair).
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
    <details class="card-fs" data-bloco="info"${(ro || os.horaSaida) ? '' : ' open'}>
      <summary>📋 Informações da O.S <span class="item-progress" style="margin-left:auto;font-weight:600">somente leitura</span></summary>
      <div class="fs-body eq-info">
        ${infoRows.map(([k, v]) => `<div class="eq-info-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
        ${os.layoutFotoId ? `<div class="eq-info-foto"><span>Layout</span><img data-img="${esc(os.layoutFotoId)}" data-layout="1" alt="layout"></div>` : ''}
      </div>
    </details>` : '';

  const itensCards = itens.map((it, i) => {
    const st = it.statusInst || '';
    const cls = st === 'retrab' ? 'st-retrab' : (st === 'ok' ? 'st-ok' : '');
    const retrabBox = st === 'retrab' ? `
      <div class="item-retrab">
        <label for="m-imotivo-${i}">Motivo do problema</label>
        <select id="m-imotivo-${i}" data-imotivo="${i}"><option value="">Escolher o motivo</option>${causas.map(c=>`<option ${it.motivo===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <label for="m-iobs-${i}">O que faltou / detalhe</label>
        <input id="m-iobs-${i}" type="text" data-iobs="${i}" value="${esc(it.obsProb)}" placeholder="ex.: medida errada, faltou peça…">
        <div class="item-foto">
          ${it.fotoProbId ? thumb(it.fotoProbId, `data-irm="${i}"`) : ''}
          ${ro ? '' : `<div class="eq-fotos-acoes">
            <label class="foto-box"><span class="foto-hint">📷 Foto do problema</span><input type="file" accept="image/*" capture="environment" data-ifoto="${i}"></label>
            <label class="foto-box"><span class="foto-hint">🖼 Da galeria</span><input type="file" accept="image/*" data-ifoto="${i}"></label>
          </div>`}
        </div>
      </div>` : '';
    return `
      <div class="item-card ${cls}">
        <div class="item-card-head">
          <div class="item-card-title">${esc(it.item || 'Item')} <span class="item-card-qt">x${esc(it.qtde||1)}</span></div>
          <div class="item-card-sub">${esc(it.descricao||'')}${it.medidas?` · ${esc(it.medidas)}`:''}</div>
        </div>
        <div class="seg">
          <button type="button" data-iset="${i}|"       ${ro?'disabled':''} class="${st===''?'active':''}">Pendente</button>
          <button type="button" data-iset="${i}|ok"     ${ro?'disabled':''} class="seg-ok ${st==='ok'?'active':''}">✅ Instalado</button>
          <button type="button" data-iset="${i}|retrab" ${ro?'disabled':''} class="seg-retrab ${st==='retrab'?'active':''}">🔴 Retrabalho</button>
        </div>
        ${retrabBox}
      </div>`;
  }).join('');

  const n = interno ? { itens: '1', pronto: '2' } : { saida: '1', chegada: '2', itens: '3', pronto: '4', volta: '5' };

  const blocoSaida = interno ? '' : `
    <details class="card-fs" data-bloco="saida"${ro ? '' : ' open'}>
      <summary>${n.saida}. Saída${os.horaSaida ? ` <span class="item-progress" style="margin-left:auto">✓ ${esc(os.horaSaida)}</span>` : ''}</summary>
      <div class="fs-body">
        ${(!ro && !os.carroLiberado && !confirmadoHoje) ? `<div class="trava-msg">🔒 ${esc(msgConfirmacao(os))}</div>` : ''}
        ${os.carroLiberado
          ? `<div class="liberar-status">🚗 Carro liberado · ${esc(os.carroLiberadoPor||'')}</div>`
          : `<button type="button" class="btn-primary" id="m-carro" ${(!confirmadoHoje||ro)?'disabled style="opacity:.5"':''}>🚗 Liberar carro</button>`}
        <div class="field-row">
          <div class="field"><label for="m-hora-saida">Hora saída</label>
            <div class="eq-hora"><input id="m-hora-saida" type="time" data-f="horaSaida" value="${esc(os.horaSaida)}">${(ro || os.horaSaida) ? '' : `<button type="button" class="btn-ghost" id="m-sai-agora" ${(os.carroLiberado || confirmadoHoje) ? '' : 'disabled style="opacity:.5"'}>Saí agora</button>`}</div></div>
          <div class="field"><label for="m-km-saida">KM saída</label><input id="m-km-saida" type="number" inputmode="numeric" data-f="kmSaida" value="${esc(os.kmSaida)}" placeholder="km do veículo"></div>
        </div>
      </div>
    </details>`;

  const blocoChegada = interno ? '' : `
    <details class="card-fs" data-bloco="chegada" open>
      <summary>${n.chegada}. Chegada no cliente <span class="item-progress" style="margin-left:auto">📷 ${fotos.length}</span></summary>
      <div class="fs-body">
        <div class="field">
          <label>Fotos de check-in, ao chegar (pelo menos 1 para finalizar)</label>
          <div class="fotos-grid">${fotos.map(fid => thumb(fid, `data-rm="${esc(fid)}"`)).join('')}</div>
          ${ro ? '' : `<label class="foto-box" style="margin-top:6px">
            <span class="foto-hint">📷 Foto de check-in</span>
            <input type="file" accept="image/*" capture="environment" data-checkin>
          </label>`}
        </div>
      </div>
    </details>`;

  const blocoItens = `
    <details class="card-fs" data-bloco="itens" open>
      <summary>${n.itens}. Itens <span class="item-progress" style="margin-left:auto">✅ ${instalados}/${itens.length}${retrabN?` · 🔴 ${retrabN}`:''}</span></summary>
      <div class="fs-body">
        <p class="text-muted" style="margin-bottom:8px">Marque cada item: <strong>Instalado</strong> ou <strong>Retrabalho</strong>. No retrabalho, escolha o motivo e tire uma foto do problema.</p>
        <div class="item-cards">${itensCards || '<p class="text-muted" style="text-align:center">Sem itens</p>'}</div>
      </div>
    </details>`;

  const conferencia = `
        <div class="field"><label for="m-conf-por">Conferido por</label><input id="m-conf-por" type="text" data-f="conferidoPor" value="${esc(os.conferidoPor)}"></div>
        ${retrabN ? `<div class="trava-msg">🔴 ${retrabN} item(ns) com retrabalho. Confira os motivos na lista de itens.</div>` : ''}
        <div class="field"><label for="m-obs">Obs técnicas</label><textarea id="m-obs" data-f="obsTecnicas">${esc(os.obsTecnicas)}</textarea></div>`;
  const blocoPronto = interno ? `
    <details class="card-fs" data-bloco="pronto" open>
      <summary>${n.pronto}. Entrega ao cliente</summary>
      <div class="fs-body">${conferencia}</div>
    </details>` : `
    <details class="card-fs" data-bloco="pronto" open>
      <summary>${n.pronto}. Serviço pronto <span class="item-progress" style="margin-left:auto">📷 ${fotosRet.length}</span></summary>
      <div class="fs-body">
        <div class="field">
          <label>Fotos do serviço pronto (pelo menos 1 para finalizar)</label>
          <div class="fotos-grid">${fotosRet.map(fid => thumb(fid, `data-rm-ret="${esc(fid)}"`)).join('')}</div>
          ${ro ? '' : `<div class="eq-fotos-acoes">
            <label class="foto-box"><span class="foto-hint">📷 Tirar foto</span><input type="file" accept="image/*" capture="environment" data-retorno></label>
            <label class="foto-box"><span class="foto-hint">🖼 Da galeria</span><input type="file" accept="image/*" multiple data-retorno></label>
          </div>`}
        </div>
        <div class="field"><label><input type="checkbox" data-c="instalacaoOK" ${os.instalacaoOK?'checked':''}> Instalação OK</label></div>
        ${conferencia}
      </div>
    </details>`;

  const blocoVolta = interno ? '' : `
    <details class="card-fs" data-bloco="volta" open>
      <summary>${n.volta}. Retorno${os.horaRetorno ? ` <span class="item-progress" style="margin-left:auto">✓ ${esc(os.horaRetorno)}</span>` : ''}</summary>
      <div class="fs-body">
        <div class="field-row">
          <div class="field"><label for="m-hora-ret">Hora retorno</label>
            <div class="eq-hora"><input id="m-hora-ret" type="time" data-f="horaRetorno" value="${esc(os.horaRetorno)}">${(ro || os.horaRetorno) ? '' : '<button type="button" class="btn-ghost" id="m-retorno-agora">Agora</button>'}</div></div>
          <div class="field"><label for="m-km-ret">KM retorno</label><input id="m-km-ret" type="number" inputmode="numeric" data-f="kmRetorno" value="${esc(os.kmRetorno)}" placeholder="km do veículo"></div>
        </div>
        ${limpezaLinhaHTML(os)}
      </div>
    </details>`;

  const faltas = (!ro && EQ.tentouFinalizar === os.id) ? faltasParaFinalizar(os) : [];
  // Texto corrido (a ficha já rolou até o primeiro bloco a resolver): botões
  // de 44 px aqui dobravam a altura da barra presa no pé.
  const faltaHtml = faltas.length ? `<div class="trava-msg eq-falta" role="alert"><span>Falta: ${esc(faltas.map(f => f.txt).join(', '))}</span></div>` : '';

  $('#modal-os').innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">O.S ${esc(os.numero||'sem número')}</div>
        <div class="modal-meta">${esc(os.cliente||'')}</div>
      </div>
      <span class="badge st-${st}">${statusLabelDe(os, st)}</span>
      <button type="button" class="modal-close" id="m-close" aria-label="Fechar">×</button>
    </div>

    ${ro ? `<div class="finalizada-lock lock-allow">
      <span>🔒 O.S finalizada${os.finalizadoPor ? ' por <strong>' + esc(os.finalizadoPor) + '</strong>' : ''}${os.finalizadaEm ? ' · ' + new Date(os.finalizadaEm).toLocaleString('pt-BR') : ''}. Somente leitura.</span>
    </div>` : ''}

    <div style="padding:12px 16px;background:#eff6ff;border-bottom:1px solid var(--border)">
      <div class="list-date" style="font-size:.95rem">📅 ${esc(fmtInstalacao(os.instalacao))}</div>
      <div class="text-sm" style="margin-top:4px">📍 ${interno ? 'Retirada na fábrica' : esc(os.endereco||'')}</div>
      <div class="text-sm">👷 ${esc((os.equipe||[]).join(', '))} ${os.veiculo?'· 🚗 '+esc(os.veiculo):''}</div>
      <div class="lock-allow">${contatoHTML(os, !interno)}</div>
    </div>

    ${infoEstatica}
    ${blocoSaida}
    ${blocoChegada}
    ${blocoItens}
    ${blocoPronto}
    ${blocoVolta}

    <div class="fs-body modal-acoes lock-allow">
      ${faltaHtml}
      ${ro
        ? `<div class="liberar-status" style="background:#dcfce7;color:var(--green)">✓ Finalizada · ${new Date(os.finalizadaEm).toLocaleString('pt-BR')}</div>`
        : `<button type="button" class="btn-primary" id="m-finalizar">${interno ? '🛍 Entregue ao cliente' : '🏁 Finalizar instalação'}</button>`}
      <button type="button" class="btn-ghost" id="m-save">${ro ? 'Fechar' : 'Salvar e fechar'}</button>
    </div>
  `;
  // Trava visual de edição quando finalizada (mesma classe do app de gestão).
  $('#modal-os').classList.toggle('os-locked', ro);
  bindModal(os, ro);
}

/* A FOTO VAI PARA A O.S. EM QUE FOI TIRADA. pushPhoto pode levar até 15 s por
   foto com sinal fraco, e o aviso "Enviando" some em 3 s: o instalador fecha a
   ficha ou abre a próxima, e o `_draft` global já é outro (ou null). A foto de
   check-in caía na O.S. seguinte, até numa finalizada, ou sumia num TypeError.
   Prende o rascunho antes do primeiro await; se a ficha mudou, grava só a foto
   na cópia atual desta O.S. (o mesmo padrão da gestão, persistirAposFoto).
   `aplicar(o, id)` põe a foto num objeto e não duplica; `depois(o)` roda uma
   vez no fim (carimbo, retrabalho). Devolve quantas fotos entraram. */
async function anexarFotos(files, aplicar, depois) {
  const d = _draft;
  if (!d || !files.length) return 0;
  toast(files.length > 1 ? `Enviando ${files.length} fotos…` : 'Enviando foto…');
  const ids = [];
  for (const f of files) {
    const id = await STORE.pushPhoto(f);
    if (id) { aplicar(d, id); ids.push(id); }
  }
  // Foto que falhou já foi dita pelo 'foto-falhou' do store, com o motivo
  // certo (sem espaço não é "não consegui ler").
  if (!ids.length) return 0;
  if (_draft && _draft.id === d.id) {
    // A mesma O.S. (ou reaberta): o rascunho aberto é a cópia de trabalho.
    ids.forEach(id => aplicar(_draft, id));
    if (depois) depois(_draft);
    save(); reRender();
  } else {
    const base = STORE.getOS(d.id);
    if (base) {
      ids.forEach(id => aplicar(base, id));
      if (depois) depois(base);
      base.atualizadoEm = nowISO(); base.atualizadoPor = EQ.instalador;
      STORE.saveOS(base);
    }
  }
  const fila = fotosNaFila();
  if (ids.some(id => fila.has(id))) toast('Foto guardada no celular. Sobe quando tiver sinal.');
  return ids.length;
}
const porNaLista = campo => (o, id) => { o[campo] = o[campo] || []; if (!o[campo].includes(id)) o[campo].push(id); };

function bindModal(os, ro) {
  const root = $('#modal-os');
  $('#m-close').onclick = closeModal;
  $('#m-save').onclick = closeModal;

  // Carrega imagens (layout/check‑in/problema) — vale também em somente‑leitura.
  $$('[data-img]', root).forEach(async img => {
    const b64 = await STORE.pullPhoto(img.dataset.img);
    if (b64) img.src = b64;
    else if (img.dataset.layout) {
      // Sem sinal e nunca baixado: dizer o motivo em vez da imagem quebrada.
      const aviso = document.createElement('span');
      aviso.className = 'text-muted';
      aviso.textContent = 'Layout não baixado (sem sinal). Abra de novo com internet.';
      img.replaceWith(aviso);
    }
  });

  /* Atalho para a limpeza do carro: ligado ANTES da saída de somente leitura,
     porque o caso comum é justamente a O.S. já finalizada (ela fecha na obra,
     antes de o carro voltar). A linha mora num .lock-allow pelo mesmo motivo. */
  $$('[data-limpeza-ficha]', root).forEach(b => b.onclick = () => abrirLimpezaCarro(b.dataset.limpezaFicha));

  // O.S finalizada: somente leitura. Não liga nenhum handler de edição.
  if (ro) return;

  /* GRAVA NO CHANGE (ao sair do campo), não só ao fechar a ficha: o que era
     digitado vivia só na memória, e a câmera, uma ligação ou o voltar do
     Android levavam tudo. O input só atualiza o rascunho. */
  $$('[data-f]', root).forEach(el => {
    const aplicar = () => {
      setF(el.dataset.f, el.value);
      // A hora sozinha ('HH:MM') não diz em que DIA a equipe saiu/voltou, e a
      // Linha do Tempo da gestão precisa disso para reconstruir o passado sem
      // depender do agendamento de hoje. Mesmo carimbo do app.js.
      if (el.dataset.f === 'horaSaida')   STORE.carimbarMomento(_draft, 'horaSaida', 'saidaEm');
      if (el.dataset.f === 'horaRetorno') STORE.carimbarMomento(_draft, 'horaRetorno', 'retornoEm');
    };
    el.oninput = aplicar;
    el.onchange = () => { aplicar(); save(); };
  });
  $$('[data-c]', root).forEach(el => el.onchange = () => { setF(el.dataset.c, el.checked); save(); });
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
  /* O detalhe do retrabalho vai para o rascunho a cada tecla: gravava só no
     change, e a foto do problema que terminava de subir redesenhava a ficha e
     apagava o que estava sendo digitado. */
  $$('[data-iobs]', root).forEach(inp => {
    inp.oninput = () => { const it = _draft.itens[+inp.dataset.iobs]; if (!it) return; it.obsProb = inp.value; _dirty = true; };
    inp.onchange = () => { const it = _draft.itens[+inp.dataset.iobs]; if (!it) return; it.obsProb = inp.value; rollupRetrab(); save(); };
  });
  $$('[data-ifoto]', root).forEach(inp => inp.onchange = async () => {
    const i = +inp.dataset.ifoto;
    const ref = _draft.itens[i]; if (!ref) return;
    const file = (inp.files || [])[0]; if (!file) return;
    // O item não tem id: casa pela posição e pelo número (a regra do servidor).
    const mesmo = it => it && String(it.item ?? '') === String(ref.item ?? '') && String(it.descricao ?? '') === String(ref.descricao ?? '');
    await anexarFotos([file], (o, id) => { const it = (o.itens || [])[i]; if (mesmo(it)) it.fotoProbId = id; }, o => rollupRetrab(o));
  });
  /* APAGAR FOTO TIRA TAMBÉM O ENVIO PENDENTE. delFoto só apagava do aparelho e
     deixava o putPhoto na fila apontando para uma foto que não existe mais: a
     pílula ficava em ⏳ para sempre e o Sair e a reautorização recusavam. */
  /* E fica anotada em fotosTiradas: com a O.S. mexida por outro antes, o
     servidor soma as listas e a foto apagada voltaria, com o arquivo já fora. */
  const apagarFoto = id => {
    if (!id || !confirm('Apagar esta foto?')) return false;
    STORE.delFotoSync(id);
    _draft.fotosTiradas = [...new Set([...(_draft.fotosTiradas || []), id])].slice(-100);
    return true;
  };
  $$('[data-irm]', root).forEach(b => b.onclick = () => {
    const it = _draft.itens[+b.dataset.irm]; if (!it) return;
    if (!apagarFoto(it.fotoProbId)) return;
    it.fotoProbId = ''; save(); reRender();
  });

  // TRAVA 1: a mesma régua da gestão e do servidor. O servidor recusa liberar
  // o carro com o cliente confirmado em outro dia (422), e o carroLiberado
  // gravado prendia todas as gravações seguintes da O.S. no celular.
  const carro = $('#m-carro');
  if (carro) carro.onclick = () => {
    if (!OPERACAO.confirmadaHoje(_draft)) { toast(msgConfirmacao(_draft), 'error'); return; }
    _draft.carroLiberado = true; _draft.carroLiberadoPor = EQ.instalador; _draft.carroLiberadoEm = nowISO();
    save(); reRender(); toast('Carro liberado. Na hora de sair, toque em Saí agora.', 'success');
  };
  /* "Saí agora" e "Agora": um toque em vez do seletor de hora. Liberar o carro
     é autorização; a saída é outro registro (operacao.js, situacaoSaida), e o
     botão "Liberar carro / Saída" fazia o instalador achar que já tinha
     registrado a saída. */
  const saiAgora = $('#m-sai-agora');
  if (saiAgora) saiAgora.onclick = () => {
    if (!_draft.carroLiberado && !OPERACAO.confirmadaHoje(_draft)) { toast(msgConfirmacao(_draft), 'error'); return; }
    carimbarAgora(_draft, 'horaSaida', 'saidaEm');
    save(); reRender(); toast('Saída registrada às ' + _draft.horaSaida, 'success');
  };
  const retAgora = $('#m-retorno-agora');
  if (retAgora) retAgora.onclick = () => {
    carimbarAgora(_draft, 'horaRetorno', 'retornoEm');
    save(); reRender(); toast('Retorno registrado às ' + _draft.horaRetorno, 'success');
  };

  // TRAVA 2
  const fin = $('#m-finalizar');
  if (fin) fin.onclick = () => {
    if (_draft.horaRetorno && !_draft.retornoEm) STORE.carimbarMomento(_draft, 'horaRetorno', 'retornoEm');
    const f = faltasParaFinalizar(_draft);
    if (f.length) {
      // O que falta fica escrito acima do botão (o toast some em 3 s) e a
      // ficha rola até o primeiro bloco a resolver.
      toast('Falta: ' + f.map(x => x.txt).join(', '), 'error');
      EQ.tentouFinalizar = _draft.id;
      reRender();
      const primeiro = f.find(x => x.bloco);
      if (primeiro) irParaBloco(primeiro.bloco);
      return;
    }
    // Finalizar não tem volta pelo espelho (só a gestão reabre): pergunta antes.
    const pend = (_draft.itens || []).filter(i => !i.statusInst).length;
    const avisoPend = pend ? ` ${pend === 1 ? '1 item ainda está' : pend + ' itens ainda estão'} como Pendente.` : '';
    if (!confirm(`Finalizar a O.S ${_draft.numero || ''}? Depois só a gestão reabre.${avisoPend}`)) return;
    // Quem finaliza responde pela conferência, se ninguém escreveu outro nome.
    if (!String(_draft.conferidoPor || '').trim()) _draft.conferidoPor = EQ.instalador;
    _draft.finalizadaEm = nowISO(); _draft.finalizadoPor = EQ.instalador;
    // Mesmo fecho do app de gestão (aplicarFinalizacao).
    _draft.checkout = _draft.checkout || {};
    if (!_draft.checkout.situacao) _draft.checkout.situacao = 'Finalizado';
    if (!_draft.checkout.confirmado) _draft.checkout.confirmado = true;
    EQ.tentouFinalizar = null;
    save(); reRender();
    // Sem sinal, a finalização ainda não chegou ao escritório: dizer isso.
    // (Com sinal ela está na fila só pelo segundo do envio; não assustar.)
    const semSinal = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (semSinal && osNaFila().has(_draft.id)) toast('Finalizada neste celular. Vai para o escritório quando tiver sinal: abra o app de novo num lugar com internet.');
    else toast('Instalação finalizada 🏁', 'success');
    /* A comemoração não mostra nota: a "nota" calculada aqui era uma fórmula
       antiga (retrabalho e check-in) sobre as poucas O.S. deste celular, sem
       relação com a nota da Performance, e punha 0% em vermelho em quem não
       tinha dado. Nota só a do servidor, nunca uma conta do aparelho. */
    if (typeof mostrarCelebracao === 'function') {
      mostrarCelebracao({ emoji: '🎉', titulo: 'Instalação 100% concluída!', frase: fraseAleatoria() });
    }
  };

  // Fotos de check-in: só pela câmera, porque provam a presença no cliente.
  const ck = $('[data-checkin]', root);
  if (ck) ck.onchange = async () => {
    const d = _draft;
    const n = await anexarFotos(Array.from(ck.files || []), porNaLista('fotosCheckinIds'));
    if (n) capturarLocalCheckin(d);
  };
  $$('[data-rm]', root).forEach(b => b.onclick = () => {
    if (!apagarFoto(b.dataset.rm)) return;
    _draft.fotosCheckinIds = (_draft.fotosCheckinIds||[]).filter(x => x !== b.dataset.rm);
    save(); reRender();
  });

  // Fotos do serviço pronto (câmera ou galeria): a primeira carimba a hora de
  // retorno, se faltar, com o dia de hoje (carimbarAgora).
  $$('[data-retorno]', root).forEach(inp => inp.onchange = async () => {
    await anexarFotos(Array.from(inp.files || []), porNaLista('fotosRetornoIds'), o => {
      if (!o.horaRetorno) carimbarAgora(o, 'horaRetorno', 'retornoEm');
      else STORE.carimbarMomento(o, 'horaRetorno', 'retornoEm');
    });
  });
  $$('[data-rm-ret]', root).forEach(b => b.onclick = () => {
    if (!apagarFoto(b.dataset.rmRet)) return;
    _draft.fotosRetornoIds = (_draft.fotosRetornoIds||[]).filter(x => x !== b.dataset.rmRet);
    save(); reRender();
  });
}

/* ── Limpeza do carro (voltaEquipe) ──────────────────────────────────────────
   Pedido do Léo (25/09/2026): a equipe registra no celular como o carro
   voltou, com foto. É uma DECLARAÇÃO, ao lado da conferência do PCP: não conta
   na nota e não responde por ele. As perguntas são as mesmas da gestão
   (OPERACAO.PERGUNTAS_VOLTA), com a mesma polaridade: Sim é sempre o certo.
   Uma volta é o dia + o carro + a equipe (OPERACAO.voltasDoCarro), então o
   registro é um só e vai para cada O.S. da volta. Não trava a finalização: a
   O.S. fecha na obra (a foto do serviço pronto carimba o retorno) e a limpeza
   só acontece na fábrica; fica como pendência visível aqui e na fila do PCP. */
const LIMPEZA_PERGUNTA = {
  carroLimpo: 'Carro limpo por dentro e por fora?',
  carroArrumado: 'Material e ferramentas no lugar, sem lixo?',
  equipamentosOk: 'Equipamentos devolvidos completos?',
  semAvaria: 'Carro sem batida ou dano novo?',
};
const LIMPEZA_MAX_FOTOS = 4;
function horaCurta(iso) {
  const d = new Date(iso || '');
  return Number.isFinite(+d) ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '';
}
const numerosDaVolta = g => g.os.map(o => o.numero || 's/n').join(', ');
// Só hoje e ontem (registrar o carro de três dias atrás seria prova falsa) e
// só volta que o PCP ainda não conferiu.
function limpezasPendentes(lista = minhasOS()) {
  if (EQ.comercial) return [];
  const hoje = OPERACAO.dia(new Date());
  return OPERACAO.voltasDoCarro(lista, OPERACAO.somarDias(hoje, -1), hoje).filter(g => g.situacao === 'conferir');
}
// O registro ainda está só no aparelho? Sem isto a tela diria "registrada"
// com o upsert (ou a foto) parado na fila, sem sinal.
function limpezaNaFila(g) {
  const ids = new Set(g.os.map(o => o.id));
  const fotos = new Set((g.declaracao && g.declaracao.fotos) || []);
  return STORE.getQueue().some(q => (q.action === 'upsert' && q.os && ids.has(q.os.id)) || (q.action === 'putPhoto' && fotos.has(q.fileId)));
}
function limpezaCardHTML(g, hoje, semRetornoHoje) {
  const d = g.declaracao;
  const chave = esc(g.chave);
  let estado, msg, botao;
  if (g.equipeDisse === 'toda') {
    estado = 'feita';
    msg = limpezaNaFila(g) ? '⏳ Guardada no aparelho, vai quando tiver sinal.'
      : `✓ Limpeza registrada${horaCurta(d.em) ? ' às ' + horaCurta(d.em) : ''}${d.por ? ` (${esc(d.por)})` : ''}`;
    // Toque errado tem conserto enquanto o PCP não confere.
    botao = `<button type="button" class="btn-ghost" data-limpeza-abrir="${chave}">Corrigir</button>`;
  } else if (g.equipeDisse === 'parte') {
    estado = 'parte';
    const n = g.semDeclaracao;
    msg = n.length === 1 ? `Falta na O.S ${esc(n[0])}, que voltou depois do registro.`
      : `Falta nas O.S ${esc(n.join(', '))}, que voltaram depois do registro.`;
    botao = `<button type="button" class="btn-primary" data-limpeza-abrir="${chave}">Registrar de novo ▶</button>`;
  } else {
    estado = 'falta';
    msg = 'Falta registrar como o carro voltou.' +
      (g.dia === hoje && semRetornoHoje ? '<br>Registre quando o carro chegar na fábrica, depois da última O.S.' : '');
    botao = `<button type="button" class="btn-primary" data-limpeza-abrir="${chave}">Registrar ▶</button>`;
  }
  return `<div class="limpeza-card st-${estado}" data-limpeza="${chave}">
      <div class="limpeza-titulo">🧽 Limpeza do carro</div>
      <div class="limpeza-sub">🚗 ${esc(g.veiculo || 'carro não informado')} · ${g.dia === hoje ? 'hoje' : 'ontem'} · O.S ${esc(numerosDaVolta(g))}</div>
      <div class="limpeza-msg">${msg}</div>
      ${botao}
    </div>`;
}
// Linha na ficha (Execução): avisa e leva ao registro. Não aparece enquanto a
// O.S. não voltou. `os` é o rascunho aberto, que pode ter o retorno ainda não salvo.
function limpezaLinhaHTML(os) {
  if (EQ.comercial || !os || isInterno(os)) return '';
  const lista = minhasOS().filter(o => o.id !== os.id).concat(os);
  const g = OPERACAO.voltasDoCarro(lista).find(x => x.os.some(o => o.id === os.id));
  if (!g) return '';
  const ontem = OPERACAO.somarDias(OPERACAO.dia(new Date()), -1);
  const ve = os.voltaEquipe;
  let txt, botao = '';
  if (g.situacao !== 'conferir') txt = '🧽 O PCP já conferiu esta volta.';
  else if (OPERACAO.voltaRespondida(ve)) txt = `🧽 Limpeza do carro registrada${horaCurta(ve.em) ? ' às ' + horaCurta(ve.em) : ''}${ve.por ? ' por ' + esc(ve.por) : ''}.`;
  else if (g.dia >= ontem) {
    txt = '🧽 Limpeza do carro: falta registrar.';
    botao = `<button type="button" class="btn-primary" data-limpeza-ficha="${esc(g.chave)}">Registrar agora</button>`;
  } else txt = '🧽 Limpeza do carro não foi registrada.';
  return `<div class="lock-allow limpeza-linha"><span>${txt}</span>${botao}</div>`;
}
function abrirLimpezaCarro(chave) {
  if (EQ.comercial) return;
  // Vindo da ficha: o que foi digitado lá é salvo antes (a gravação relê a O.S.).
  if (_draft && _dirty) save();
  const g = limpezasPendentes().find(x => x.chave === chave);
  if (!g) { toast('Esta volta não está mais aberta para registro.', 'error'); renderList(); return; }
  _draft = null; EQ.modalId = null;
  // "Registrar de novo" e "Corrigir" abrem com o que já foi registrado.
  const d = g.declaracao;
  const est = {
    resp: Object.fromEntries(OPERACAO.PERGUNTAS_VOLTA.map(k => [k, d ? OPERACAO.respostaVolta(d[k]) : ''])),
    obs: d ? String(d.obs || '') : '',
    fotos: d && Array.isArray(d.fotos) ? d.fotos.slice(0, LIMPEZA_MAX_FOTOS) : [],
  };
  EQ.limpeza = { g, est };
  /* ARMADILHA: a tela é desenhada no mesmo #modal-os, e a ficha de O.S.
     finalizada deixa os-locked ligado. Com a classe, a câmera e a observação
     ficam com pointer-events:none e a foto não sai. */
  $('#modal-os').classList.remove('os-locked');
  desenharLimpeza();
  $('#modal-overlay').classList.remove('hidden');
  empilharFicha();
}
// veioDoVoltar === true: o voltar do navegador já tirou a entrada do histórico.
function fecharLimpeza(veioDoVoltar) {
  EQ.limpeza = null;
  $('#modal-overlay').classList.add('hidden');
  if (veioDoVoltar !== true) desempilharFicha();
  renderList();
}
/* O estado mora em EQ.limpeza.est, fora do _draft e fora do DOM: a observação
   grava no oninput e tocar Sim ou Não só redesenha a partir dele. Assim o
   redesenho não apaga o que foi digitado. */
function desenharLimpeza() {
  const L = EQ.limpeza; if (!L) return;
  const { g, est } = L;
  const root = $('#modal-os');
  // A observação aparece com algum Não, ou se já tem texto (nada escondido é gravado).
  const mostraObs = OPERACAO.PERGUNTAS_VOLTA.some(k => est.resp[k] === 'nao') || !!est.obs;
  root.innerHTML = `
    <div class="modal-header">
      <div style="flex:1">
        <div class="modal-title">🧽 Limpeza do carro</div>
        <div class="modal-meta">🚗 ${esc(g.veiculo || 'carro não informado')} · ${esc(fmtInstalacao({ data: g.dia }))} · vale para O.S ${esc(numerosDaVolta(g))}</div>
      </div>
      <button type="button" class="modal-close limpeza-fechar" id="lz-fechar" aria-label="Fechar">×</button>
    </div>
    <div class="fs-body volta-eq">
      ${OPERACAO.PERGUNTAS_VOLTA.map(k => `<div class="volta-eq-pergunta">
        <span id="lz-p-${k}">${esc(LIMPEZA_PERGUNTA[k])}</span>
        <div class="seg" role="group" aria-labelledby="lz-p-${k}">
          <button type="button" data-lz-r="${k}|sim" aria-pressed="${est.resp[k] === 'sim'}" class="seg-ok ${est.resp[k] === 'sim' ? 'active' : ''}">✅ Sim</button>
          <button type="button" data-lz-r="${k}|nao" aria-pressed="${est.resp[k] === 'nao'}" class="seg-retrab ${est.resp[k] === 'nao' ? 'active' : ''}">🔴 Não</button>
        </div>
      </div>`).join('')}
      <div class="volta-eq-fotos">
        <span class="volta-eq-rotulo">Foto do carro (pelo menos 1, até ${LIMPEZA_MAX_FOTOS})</span>
        ${est.fotos.length ? `<div class="fotos-grid">${est.fotos.map(fid => `<div class="foto-thumb-wrap"><img class="foto-thumb" data-img="${esc(fid)}" alt="foto do carro"><button type="button" class="foto-rm" data-lz-foto-rm="${esc(fid)}" aria-label="Tirar a foto">×</button></div>`).join('')}</div>` : ''}
        ${est.fotos.length < LIMPEZA_MAX_FOTOS ? `<label class="foto-box">
          <span class="foto-hint">📷 Foto do carro limpo (caçamba e cabine)</span>
          <input type="file" accept="image/*" capture="environment" multiple data-lz-foto>
        </label>` : ''}
      </div>
      ${mostraObs ? `<div class="field"><label for="lz-obs">O que ficou faltando ou aconteceu? (opcional)</label>
        <input type="text" id="lz-obs" maxlength="300" value="${esc(est.obs)}"></div>` : ''}
      <p class="volta-eq-rodape">Quem confere e dá a nota é o PCP.</p>
      <button type="button" class="btn-primary w-100 volta-eq-enviar" id="lz-enviar">Enviar</button>
    </div>`;
  $('#lz-fechar', root).onclick = fecharLimpeza;
  $$('[data-lz-r]', root).forEach(b => b.onclick = () => { const [k, v] = b.dataset.lzR.split('|'); marcarLimpeza(k, v); });
  const obs = $('#lz-obs', root);
  if (obs) obs.oninput = () => { est.obs = String(obs.value || '').slice(0, 300); };
  /* O × só tira a foto da lista: nada de delFoto. O mesmo fileId vai para
     todas as O.S. da volta (a mesma regra da gestão no diálogo da volta). */
  $$('[data-lz-foto-rm]', root).forEach(b => b.onclick = () => {
    est.fotos = est.fotos.filter(x => x !== b.dataset.lzFotoRm); desenharLimpeza();
  });
  const inp = $('[data-lz-foto]', root);
  if (inp) inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    const vagas = LIMPEZA_MAX_FOTOS - est.fotos.length;
    if (files.length > vagas) toast(`Até ${LIMPEZA_MAX_FOTOS} fotos do carro.`, 'error');
    const lote = files.slice(0, Math.max(0, vagas));
    if (!lote.length) return;
    toast(`Enviando ${lote.length} foto(s)…`);
    // pushPhoto guarda no IndexedDB e a fila leva só o fileId: sem sinal, a foto fica no aparelho.
    for (const f of lote) { const id = await STORE.pushPhoto(f); if (id && est.fotos.length < LIMPEZA_MAX_FOTOS) est.fotos.push(id); }
    if (EQ.limpeza && EQ.limpeza.est === est) desenharLimpeza();
  };
  $$('[data-img]', root).forEach(async img => {
    const b64 = await STORE.pullPhoto(img.dataset.img);
    if (b64) img.src = b64;
  });
  $('#lz-enviar', root).onclick = enviarLimpeza;
}
function marcarLimpeza(k, v) {
  const L = EQ.limpeza;
  if (!L || !OPERACAO.PERGUNTAS_VOLTA.includes(k) || !['sim', 'nao'].includes(v)) return;
  L.est.resp[k] = v;
  desenharLimpeza();
}
// Validação no toque em Enviar, como o Finalizar: botão desabilitado no sol e
// de luva não explica nada; o toast diz o que falta.
function enviarLimpeza() {
  const L = EQ.limpeza; if (!L) return;
  const { g, est } = L;
  const f = [];
  const faltam = OPERACAO.PERGUNTAS_VOLTA.filter(k => !['sim', 'nao'].includes(est.resp[k])).length;
  if (faltam) f.push(faltam === 1 ? 'responder 1 pergunta' : `responder ${faltam} perguntas`);
  if (!est.fotos.length) f.push('foto do carro');
  if (f.length) { toast('Falta: ' + f.join(', '), 'error'); return; }
  const n = salvarLimpezaCarro(g, est);
  fecharLimpeza();
  if (n) toast(`Limpeza registrada · ${n} O.S`, 'success');
  else toast('O PCP já conferiu esta volta.', 'error');
}
/* Grava uma vez por O.S. da volta, sempre sobre a cópia fresca: o pull pode
   ter trazido um rev novo desde que a tela abriu. saveOS enfileira um upsert
   por O.S. (o pull não atropela O.S. com upsert pendente) e a foto vai só como
   fileId. Autor e hora de chegada são carimbados de novo no servidor. */
function salvarLimpezaCarro(g, est) {
  const agora = nowISO(); let n = 0;
  for (const o of g.os) {
    const os = STORE.getOS(o.id);
    if (!os || OPERACAO.voltaRespondida(os.retornoConf)) continue;   // PCP já conferiu: não mexe
    os.voltaEquipe = {
      ...Object.fromEntries(OPERACAO.PERGUNTAS_VOLTA.map(k => [k, est.resp[k]])),
      obs: String(est.obs || '').trim().slice(0, 300), fotos: est.fotos.slice(0, LIMPEZA_MAX_FOTOS),
      dia: g.dia, veiculo: g.veiculo, em: agora, por: EQ.instalador,
    };
    os.atualizadoEm = agora; os.atualizadoPor = EQ.instalador;
    STORE.saveOS(os); n++;
  }
  return n;
}

document.addEventListener('DOMContentLoaded', initSelect);
