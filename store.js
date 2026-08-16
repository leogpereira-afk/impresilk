// store.js — Camada única de persistência e sincronização
// Todo acesso a dado passa por aqui. Depende de config.js (TOKEN).

const STORE = (() => {
  // ── Chaves localStorage ────────────────────────────────────────────────────
  const K = {
    OS:         'impresilk_inst_os',
    CFG:        'impresilk_inst_cfg',
    USER:       'impresilk_inst_user',
    INSTALADOR: 'impresilk_inst_instalador',
    FILA:       'impresilk_inst_fila',
    LASTSYNC:   'impresilk_inst_lastsync'
  };

  // ── IndexedDB (fotos) ──────────────────────────────────────────────────────
  let _db = null;

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('impresilk_inst', 1);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore('fotos', { keyPath: 'id' });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function putFoto(id, base64, mime) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').put({ id, base64, mime: mime || 'image/jpeg' });
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }

  async function getFoto(id) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('fotos', 'readonly');
      const req = tx.objectStore('fotos').get(id);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function delFoto(id) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fotos', 'readwrite');
      tx.objectStore('fotos').delete(id);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }

  // ── localStorage helpers ───────────────────────────────────────────────────
  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        console.error('[store] QuotaExceededError em', key);
        _notifyListeners('quota', null);
      }
    }
  }

  // ── CRUD de O.S (cache local) ─────────────────────────────────────────────
  function getAllOS() {
    return lsGet(K.OS, []);
  }

  function getOS(id) {
    return getAllOS().find(o => o.id === id) || null;
  }

  function _setAllOS(arr) {
    lsSet(K.OS, arr);
  }

  // Salva (cria ou atualiza) uma O.S offline-first
  function saveOS(os) {
    const all = getAllOS();
    const idx = all.findIndex(o => o.id === os.id);
    if (idx >= 0) all[idx] = os;
    else all.push(os);
    _setAllOS(all);
    _enqueue({ action: 'upsert', os });
    trySync();
  }

  function deleteOS(id) {
    _setAllOS(getAllOS().filter(o => o.id !== id));
    _enqueue({ action: 'delete', id });
    trySync();
  }

  // ── CFG ───────────────────────────────────────────────────────────────────
  const CFG_DEFAULT = {
    instaladores: [],
    veiculos: [],
    responsaveis: [],
    gerentes_montagem: [],
    ferramentas: [],
    suprimentos: ['Álcool', 'Flanela', 'Estopa', 'Fita crepe', 'Silicone', 'Luvas', 'Sacos de lixo'],
    causas_retrabalho: ['Erro de medida', 'Erro de produção', 'Falha de fixação', 'Material danificado', 'Mudança do cliente', 'Local inadequado'],
    usuarios: [
      { nome: 'Leonardo',  papel: 'admin',     senha: 'admin'      },
      { nome: 'Admin',     papel: 'admin',     senha: 'admin'      },
      { nome: 'Comercial', papel: 'comercial',  senha: 'comercial'  }
    ],
    // Agenda de contatos/funcionários para envio rápido via WhatsApp
    funcionarios: [],   // { nome, departamento, numero }
    // Níveis de acesso configuráveis pelo admin (sobrepõem o padrão do app)
    niveis: null        // { papel: { abas:[...]|'*', editar:bool, cadastrar:bool } }
  };

  function getCFG() {
    return Object.assign({}, CFG_DEFAULT, lsGet(K.CFG, {}));
  }

  function saveCFG(cfg) {
    lsSet(K.CFG, cfg);
    _enqueue({ action: 'setCfg', cfg });
    trySync();
  }

  // ── Fila offline ──────────────────────────────────────────────────────────
  function getQueue() { return lsGet(K.FILA, []); }

  function _enqueue(item) {
    let q = getQueue();
    // Deduplica upserts da mesma O.S
    if (item.action === 'upsert') {
      const i = q.findIndex(x => x.action === 'upsert' && x.os.id === item.os.id);
      if (i >= 0) { q[i] = item; lsSet(K.FILA, q); return; }
    }
    // Quando deleta uma O.S, descarta upserts pendentes dela (não faz sentido
    // mandar uma versão "atualizada" de algo que vai ser apagado em seguida).
    if (item.action === 'delete') {
      q = q.filter(x => !(x.action === 'upsert' && x.os && x.os.id === item.id));
      // Se já existe um delete pra mesma id na fila, evita duplicar.
      if (q.some(x => x.action === 'delete' && x.id === item.id)) {
        lsSet(K.FILA, q);
        return;
      }
    }
    // Deletar uma foto descarta o upload pendente dela (senão o servidor
    // recebe o put depois do delete e a foto "excluída" ressuscita lá).
    if (item.action === 'deletePhoto') {
      q = q.filter(x => !(x.action === 'putPhoto' && x.fileId === item.fileId));
      if (q.some(x => x.action === 'deletePhoto' && x.fileId === item.fileId)) {
        lsSet(K.FILA, q);
        return;
      }
    }
    q.push(item);
    lsSet(K.FILA, q);
  }

  // Assinatura estável de um item da fila (independe da referência do objeto).
  // Necessária porque getQueue() re-parseia o localStorage e cria objetos novos,
  // então comparar por referência (x !== item) nunca removeria nada.
  function _sigFila(item) {
    if (!item) return '';
    if (item.action === 'upsert')      return 'upsert:'  + (item.os && item.os.id);
    if (item.action === 'delete')      return 'delete:'  + item.id;
    if (item.action === 'putPhoto')    return 'putPhoto:' + item.fileId;
    if (item.action === 'deletePhoto') return 'deletePhoto:' + item.fileId;
    if (item.action === 'setCfg')      return 'setCfg';
    return JSON.stringify(item);
  }

  function _removeFromQueue(item) {
    const sig = _sigFila(item);
    let removido = false;
    const q = getQueue().filter(x => {
      if (!removido && _sigFila(x) === sig) {
        // Upsert: só remove se for a MESMA versão que foi enviada. Se o
        // usuário salvou de novo durante o envio, a fila contém uma versão
        // mais nova — mantê-la para o próximo ciclo (senão a edição feita
        // durante o sync em voo se perderia sem aviso).
        if (item.action === 'upsert' && x.os && item.os && x.os.atualizadoEm !== item.os.atualizadoEm) {
          return true;
        }
        removido = true;
        return false;
      }
      return true;
    });
    lsSet(K.FILA, q);
  }

  // ── Chamada à API ─────────────────────────────────────────────────────────
  async function api(body) {
    return apiFn('os', body);
  }

  // Chama uma função do backend (os, mubisys, …) com timeout.
  //
  // O endereço vem do config.js: hoje são Edge Functions do Supabase, antes eram
  // Netlify Functions. O resto do app não sabe da diferença — continua pedindo
  // 'os' e 'mubisys', e a tradução para o nome real acontece aqui.
  async function apiFn(fn, body, timeoutMs = 15000) {
    // Timeout: em sinal fraco, navigator.onLine pode ser true mas o fetch trava.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const alvo = (typeof API_FN === 'object' && API_FN[fn]) || fn;
      const url = (typeof API_BASE === 'string' && API_BASE)
        ? API_BASE + '/' + alvo
        : '/.netlify/functions/' + fn; // volta ao Netlify se o config for antigo
      const res = await fetch(url, {
        method:  'POST',
        // Crachá lido na hora da chamada (muda quando a pessoa entra ou sai).
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          (typeof AUTH !== 'undefined' && AUTH.cracha && AUTH.cracha())
            ? { authorization: 'Bearer ' + AUTH.cracha() } : {}
        ),
        body:    JSON.stringify(body),
        signal:  ctrl.signal
      });
      if (!res.ok && res.status !== 409) {
        // Anexa o status (e o semSessao do corpo) para o sync distinguir
        // "sem internet" de "crachá recusado" — 401/403 é sessão, não item.
        let corpo = {};
        try { corpo = await res.json(); } catch { /* sem corpo */ }
        throw Object.assign(new Error('HTTP ' + res.status), {
          status: res.status,
          semSessao: !!(corpo && corpo.semSessao)
        });
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Sync state ────────────────────────────────────────────────────────────
  let _syncing = false;
  let _syncListeners      = [];
  let _conflictListeners  = [];
  let _genericListeners   = {};

  function onSync(fn)     { _syncListeners.push(fn); }
  function onConflict(fn) { _conflictListeners.push(fn); }

  function _notifySync(status, pending) {
    _syncListeners.forEach(fn => { try { fn(status, pending); } catch {} });
  }

  // Versão do servidor mostrada no último conflito de cada O.S. Guardada para o
  // "Sobrescrever" poder reenviar com o rev que o servidor exibiu — reenviar com
  // o rev velho bateria no mesmo conflito para sempre.
  const _conflitoRemoto = new Map();

  function _notifyConflict(local, remote) {
    if (remote && remote.id) _conflitoRemoto.set(remote.id, remote);
    _conflictListeners.forEach(fn => { try { fn(local, remote); } catch {} });
  }

  // O servidor devolve o registro com o `rev` novo (ver pcp-sync: o conflito
  // deixou de ser comparação de relógios). Adotar esse número é o que mantém a
  // próxima gravação fora de conflito, e ele precisa alcançar DOIS lugares: o
  // registro local e o item que ficou na fila. O _removeFromQueue preserva de
  // propósito a versão editada durante o envio; se ela ficasse com o rev velho,
  // o envio seguinte levaria "conflito" contra uma escrita que foi a nossa.
  function _revNaFila(osServidor) {
    if (!osServidor || !osServidor.id || typeof osServidor.rev !== 'number') return;
    const q = getQueue();
    let mudou = false;
    for (const it of q) {
      if (it.action === 'upsert' && it.os && it.os.id === osServidor.id && it.os.rev !== osServidor.rev) {
        it.os.rev = osServidor.rev;
        mudou = true;
      }
    }
    if (mudou) lsSet(K.FILA, q);
  }

  function _notifyListeners(event, data) {
    (_genericListeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
  }

  function on(event, fn) {
    if (!_genericListeners[event]) _genericListeners[event] = [];
    _genericListeners[event].push(fn);
  }

  // ── trySync: envia fila pendente ──────────────────────────────────────────
  // _flagged: chaves de itens com conflito não-resolvido (pulamos no próximo
  // ciclo pra não travar a fila inteira atrás de um item esperando o usuário).
  const _flagged = new Set();
  // Contagem de falhas por item (chave = _sigFila). Item que falha N vezes
  // sai da fila pra não inchar o localStorage indefinidamente.
  const _failCount = new Map();
  const MAX_FAILS = 25;

  async function trySync() {
    if (_syncing) return;
    const q = getQueue();
    if (!q.length) { _flagged.clear(); _notifySync('ok', 0); return; }
    if (!navigator.onLine) { _notifySync('offline', q.length); return; }

    _syncing = true;
    _notifySync('pending', q.length);

    let consecutiveNetFails = 0;
    for (const item of [...q]) {
      const sig = _sigFila(item);
      // Pula itens em conflito até o usuário resolver.
      if (_flagged.has(sig)) continue;
      try {
        if (item.action === 'putPhoto') {
          let base64 = item.base64;
          if (!base64) { const f = await getFoto(item.fileId); base64 = f && f.base64; }
          if (!base64) { _removeFromQueue(item); _failCount.delete(sig); continue; }
          const res = await api({ action: 'putPhoto', base64, mime: item.mime, fileId: item.fileId });
          if (res && res.fileId) { _removeFromQueue(item); _failCount.delete(sig); }
        } else {
          const res = await api(item);
          if (res && res.conflito) {
            _flagged.add(sig);                 // não retentar até resolução
            _notifyConflict(item.os, res.servidor);
            continue;                          // segue para o próximo item
          }
          _removeFromQueue(item);
          _failCount.delete(sig);
          if (item.action === 'upsert' && res && res.os) {
            const all = getAllOS();
            const idx = all.findIndex(o => o.id === res.os.id);
            if (idx >= 0) {
              let mudou = false;
              // O rev é adotado SEMPRE, inclusive se editaram durante o envio:
              // aquela edição nasceu por cima da versão que o servidor acabou
              // de aceitar, então herda a linhagem dela.
              if (typeof res.os.rev === 'number' && all[idx].rev !== res.os.rev) {
                all[idx].rev = res.os.rev;
                mudou = true;
              }
              // Já o timestamp só é sincronizado se NÃO houve edição local
              // durante o envio — senão o pull deixaria de enxergar a
              // divergência e a edição nova ficaria só neste aparelho.
              if (all[idx].atualizadoEm === item.os.atualizadoEm &&
                  all[idx].atualizadoEm !== res.os.atualizadoEm) {
                all[idx].atualizadoEm = res.os.atualizadoEm;
                mudou = true;
              }
              if (mudou) _setAllOS(all);
            }
            _revNaFila(res.os);
          }
        }
        consecutiveNetFails = 0;
      } catch (e) {
        const msg = (e && e.message) || '';
        // 401/403 = SESSÃO recusada (crachá expirado/ausente), NÃO erro do item.
        // Preserva a fila INTEIRA, para o ciclo e avisa a UI para reautenticar.
        // (Antes 401 caía no ramo de erro permanente e descartava o trabalho do
        // dia em ~25 ciclos com um "✅ Sincronizado" falso.)
        if (e && (e.semSessao || e.status === 401 || e.status === 403)) {
          _syncing = false;
          _notifySync('sem-sessao', getQueue().length);
          _notifyListeners('sem-sessao', {});
          return;
        }
        // Distingue falha de rede (parar o ciclo) de erro permanente do item
        // (incrementa contador; quando estourar, descarta o item pra não travar).
        const isNetwork = !msg.startsWith('HTTP ') || /HTTP 5\d\d/.test(msg);
        if (isNetwork) {
          consecutiveNetFails++;
          if (consecutiveNetFails >= 1) break; // sai do loop, tenta no próximo trySync
        } else {
          // Delete/deletePhoto NUNCA são descartados: são leves (~50 bytes) e
          // descartar ressuscitaria a O.S excluída no pull seguinte.
          if (item.action === 'delete' || item.action === 'deletePhoto') {
            _notifyListeners('item-descartado', { item, motivo: 'exclusão pendente: ' + msg });
            continue;
          }
          const n = (_failCount.get(sig) || 0) + 1;
          _failCount.set(sig, n);
          if (n >= MAX_FAILS) {
            console.warn('[store] descartando item após', n, 'falhas:', sig, msg);
            _removeFromQueue(item);
            _failCount.delete(sig);
            _notifyListeners('item-descartado', { item, motivo: msg });
          }
        }
      }
    }

    _syncing = false;
    const remaining = getQueue();
    _notifySync(remaining.length ? (navigator.onLine ? 'pending' : 'offline') : 'ok', remaining.length);
  }

  // ── pull: busca lista do servidor e mescla ────────────────────────────────
  async function pull(onRefresh) {
    if (!navigator.onLine) return;
    try {
      const local = getAllOS();
      const byId = new Map(local.map(o => [o.id, o]));
      let changed = false;

      // Deletes pendentes na fila: a O.S ainda existe no servidor, mas foi
      // excluída aqui — sem este filtro o pull a "ressuscitava" na lista.
      const pendingDeletes = new Set(
        getQueue().filter(x => x.action === 'delete').map(x => x.id)
      );
      // Edição deste aparelho que ainda não subiu: o pull NÃO passa a versão do
      // servidor por cima dela. Antes, o trabalho sumia da tela no ciclo de 30s
      // e só reaparecia quando o conflito fosse resolvido — assustador e
      // desnecessário, já que a fila guarda a versão local intacta e a
      // divergência aparece no envio, com as duas lado a lado.
      const pendingUpserts = new Set(
        getQueue().filter(x => x.action === 'upsert' && x.os && x.os.id).map(x => x.os.id)
      );

      // O endpoint "list" é paginado (resposta limitada para não estourar o
      // teto de ~6 MB das Netlify Functions). Preferimos paginação por CHAVE
      // ("after"/"nextAfter"), estável quando O.S são criadas/apagadas entre
      // páginas; "nextOffset" fica como fallback para função antiga no ar.
      const remoteIds = new Set();
      let offset = 0;
      let after = null;
      let guard = 0; // trava de segurança contra loop infinito
      while (true) {
        const res = await api(after != null ? { action: 'list', after } : { action: 'list', offset });
        if (!Array.isArray(res.os)) return;

        for (const remote of res.os) {
          if (!remote || !remote.id) continue;
          if (pendingDeletes.has(remote.id)) continue;
          remoteIds.add(remote.id);
          const localOS = byId.get(remote.id);
          if (!localOS) {
            local.push(remote);
            byId.set(remote.id, remote);
            changed = true;
          } else if (!pendingUpserts.has(remote.id)) {
            // `rev` é do SERVIDOR e só cresce — comparar rev compara escritas,
            // não relógios de aparelhos diferentes. Quando um dos lados ainda
            // não tem rev (O.S recém-importada, nunca gravada pelo app, ou
            // cache anterior a este campo), cai no timestamp, como antes.
            const revR = typeof remote.rev  === 'number' ? remote.rev  : null;
            const revL = typeof localOS.rev === 'number' ? localOS.rev : null;
            const maisNovo = (revR !== null && revL !== null)
              ? revR > revL
              : (new Date(remote.atualizadoEm || 0).getTime() > new Date(localOS.atualizadoEm || 0).getTime());
            if (maisNovo) {
              Object.assign(localOS, remote);
              changed = true;
            }
          }
        }

        if (res.nextAfter != null) after = res.nextAfter;
        else if (res.nextOffset != null) offset = res.nextOffset;
        else break;
        if (++guard > 1000) {
          // Atingiu o teto de segurança (>150k O.S). Avisa em vez de truncar silenciosamente.
          console.warn('[store] pull abortado: mais de 1000 páginas. Lista pode estar truncada.');
          _notifyListeners('pull-truncado', { paginas: guard });
          break;
        }
      }

      // Após varrer TODAS as páginas: remove do local as O.S que sumiram do
      // servidor (foram apagadas em outro aparelho ou via limpeza administrativa),
      // mas preserva as que ainda estão na fila aguardando envio (criadas offline).
      const queue = getQueue();
      const pendingIds = new Set(
        queue.filter(q => q.action === 'upsert' && q.os && q.os.id).map(q => q.os.id)
      );
      const sobreviventes = local.filter(o => remoteIds.has(o.id) || pendingIds.has(o.id));
      if (sobreviventes.length !== local.length) {
        changed = true;
        local.length = 0;
        for (const o of sobreviventes) local.push(o);
      }

      if (changed) {
        _setAllOS(local);
        lsSet(K.LASTSYNC, new Date().toISOString());
        if (typeof onRefresh === 'function') onRefresh();
      }

      const q = getQueue();
      _notifySync(q.length ? 'pending' : 'ok', q.length);
      return { updated: changed };
    } catch (e) {
      // 401/403 = crachá recusado, NÃO falta de internet. Avisa 'sem-sessao'
      // (senão o banner diz "Sem conexão" com sinal cheio e não reautentica).
      if (e && (e.semSessao || e.status === 401 || e.status === 403)) {
        _notifySync('sem-sessao', getQueue().length);
        _notifyListeners('sem-sessao', {});
      } else {
        _notifySync('offline', getQueue().length);
      }
    }
  }

  // ── pullCFG ───────────────────────────────────────────────────────────────
  async function pullCFG() {
    if (!navigator.onLine) return;
    // Se há um setCfg pendente na fila, a config local é mais nova que a do
    // servidor — não sobrescrever (evita perder níveis/usuários/funcionários
    // editados offline). O trySync envia a versão local em seguida.
    if (getQueue().some(x => x.action === 'setCfg')) return;
    try {
      const res = await api({ action: 'getCfg' });
      if (res.cfg && Object.keys(res.cfg).length) {
        const merged = Object.assign(getCFG(), res.cfg);
        lsSet(K.CFG, merged);
      }
    } catch (e) {
      if (e && (e.semSessao || e.status === 401 || e.status === 403)) {
        _notifySync('sem-sessao', getQueue().length);
        _notifyListeners('sem-sessao', {});
      }
    }
  }

  // ── Fotos ─────────────────────────────────────────────────────────────────
  // Comprime imagem antes de gravar (max 1280px, JPEG 0.75)
  async function compressImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function pushPhoto(file) {
    const base64 = await compressImage(file);
    if (!base64) return null;
    const mime   = 'image/jpeg';
    const fileId = 'foto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    // Salva local (IndexedDB)
    await putFoto(fileId, base64, mime);

    // Tenta enviar ao servidor
    if (navigator.onLine) {
      try {
        const res = await api({ action: 'putPhoto', base64, mime, fileId });
        return res.fileId || fileId;
      } catch {}
    }

    // Falhou → enfileira só o fileId (o base64 já está no IndexedDB)
    _enqueue({ action: 'putPhoto', mime, fileId });
    return fileId;
  }

  // Remove a foto local E do servidor (enfileira deletePhoto na fila de sync).
  // delFoto sozinho só apagava do IndexedDB — o blob ficava para sempre no
  // servidor e nos outros aparelhos.
  function delFotoSync(fileId) {
    if (!fileId) return;
    delFoto(fileId);
    _enqueue({ action: 'deletePhoto', fileId });
    trySync();
  }

  async function pullPhoto(fileId) {
    // Cache local primeiro
    const local = await getFoto(fileId);
    if (local) return local.base64;

    if (!navigator.onLine) return null;
    try {
      const res = await api({ action: 'getPhoto', fileId });
      if (res.base64) {
        await putFoto(fileId, res.base64, res.mime || 'image/jpeg');
        return res.base64;
      }
    } catch {}
    return null;
  }

  // ── Identidade local ──────────────────────────────────────────────────────
  function getUser()         { return lsGet(K.USER,       null); }
  function setUser(u)        { lsSet(K.USER, u); }
  function getInstalador()   { return lsGet(K.INSTALADOR, null); }
  function setInstalador(n)  { lsSet(K.INSTALADOR, n); }
  function getLastSync()     { return lsGet(K.LASTSYNC,   null); }

  // ── Limpar o dado local (sair no aparelho compartilhado) ──────────────────
  // O logout apagava só o crachá. As O.S ficavam no localStorage (cliente,
  // endereço, telefone) e as fotos no IndexedDB — e equipe.html#comercial lê
  // tudo isso direto do cache. No tablet da produção, quem pegasse o aparelho
  // depois do gestor lia a carteira inteira sem senha.
  //
  // NUNCA limpa com fila pendente: o trabalho ainda não enviado só existe aqui.
  // Devolve false nesse caso para o chamador poder avisar.
  //
  // O pacote de configuração FICA (o espelho precisa da lista de instaladores
  // para a pessoa tocar no próprio nome, e sem crachá não há como rebaixá-lo do
  // servidor), mas os dois campos sensíveis dele saem: `usuarios` e a agenda de
  // `funcionarios` com os telefones — que só o crachá de admin recebe.
  function limparCache() {
    if (getQueue().length) return false;
    try {
      localStorage.removeItem(K.OS);
      localStorage.removeItem(K.FILA);
      localStorage.removeItem(K.LASTSYNC);
      const cfg = lsGet(K.CFG, null);
      if (cfg && typeof cfg === 'object') {
        const { usuarios: _u, funcionarios: _f, ...resto } = cfg;
        lsSet(K.CFG, resto);
      }
    } catch {}
    try {
      if (_db) { _db.close(); _db = null; }
      indexedDB.deleteDatabase('impresilk_inst');
    } catch {}
    return true;
  }

  // ── Resolver conflito manualmente ─────────────────────────────────────────
  // Sobrescreve O.S local com versão do servidor
  function aceitarServidor(remoteOS) {
    const all = getAllOS();
    const idx = all.findIndex(o => o.id === remoteOS.id);
    if (idx >= 0) all[idx] = remoteOS; else all.push(remoteOS);
    _setAllOS(all);
    // Remove item da fila para esta O.S e libera a flag de conflito.
    const q = getQueue().filter(x => !(x.action === 'upsert' && x.os.id === remoteOS.id));
    lsSet(K.FILA, q);
    _flagged.delete('upsert:' + remoteOS.id);
    _conflitoRemoto.delete(remoteOS.id);
  }

  // Força sobrescrita: grava o local e re-enfileira
  function sobrescreverServidor(localOS) {
    // Atualiza timestamp para ser mais novo
    localOS.atualizadoEm = new Date().toISOString();
    // ...e adota o rev que o servidor mostrou no banner. Forçar é dizer "minha
    // versão vence a de vocês", não "reenviar a mesma base": sem isto o reenvio
    // bateria exatamente no mesmo conflito, para sempre, e o botão não faria
    // nada além de girar a fila.
    const remoto = _conflitoRemoto.get(localOS.id);
    if (remoto && typeof remoto.rev === 'number') localOS.rev = remoto.rev;
    _conflitoRemoto.delete(localOS.id);
    _flagged.delete('upsert:' + localOS.id);
    saveOS(localOS);
  }

  // ── Reconexão automática ───────────────────────────────────────────────────
  window.addEventListener('online',  () => { trySync(); });
  window.addEventListener('offline', () => { _notifySync('offline', getQueue().length); });

  // ── Backup ────────────────────────────────────────────────────────────────
  function exportarBackup() {
    return {
      versao:      4,
      exportadoEm: new Date().toISOString(),
      os:  getAllOS(),
      cfg: getCFG()
    };
  }

  function importarBackup(data) {
    if (!data || !Array.isArray(data.os)) throw new Error('Arquivo inválido');
    _setAllOS(data.os);
    if (data.cfg) lsSet(K.CFG, data.cfg);
    // Limpa a fila pendente — referências a IDs que sumiram no backup virariam
    // erros eternos no servidor; o pull seguinte re-sincroniza o que faltar.
    lsSet(K.FILA, []);
    _flagged.clear();
    _failCount.clear();
  }

  // ── Carimbo de DIA para as horas de saída/retorno ─────────────────────────
  // horaSaida/horaRetorno são 'HH:MM' sem data — campos vitalícios da O.S. A
  // Linha do Tempo então respondia "quem rodou na rua no dia X?" filtrando pelo
  // agendamento ATUAL: bastava reagendar para a saída mudar de dia e a história
  // ser reescrita (a equipe saiu dia 05, choveu, remarcou p/ 12 → o dia 05
  // aparecia vazio e o dia 12 com uma saída que nunca houve).
  //
  // Aqui a hora ganha o dia em que foi carimbada. O dia vem do agendamento
  // vigente no momento do carimbo (é o dia em que a equipe está trabalhando),
  // com hoje como último recurso. Corrigir a hora depois NÃO muda o dia já
  // carimbado — só o próprio campo de hora ficar vazio apaga o carimbo.
  //
  // Grava ISO LOCAL (sem Z) de propósito: quem lê usa diaLocalISO, que parseia
  // como hora local — assim o dia volta igual ao que foi gravado.
  function carimbarMomento(os, campoHora, campoStamp) {
    if (!os) return;
    const m = String(os[campoHora] || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) { delete os[campoStamp]; return; }
    const jaTem = /^\d{4}-\d{2}-\d{2}/.test(String(os[campoStamp] || ''))
      ? String(os[campoStamp]).slice(0, 10) : '';
    const agendado = String((os.instalacao && os.instalacao.data) || '');
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dia = jaTem || (/^\d{4}-\d{2}-\d{2}$/.test(agendado) ? agendado : hoje);
    os[campoStamp] = `${dia}T${m[1].padStart(2, '0')}:${m[2]}:00`;
  }

  // ── UUID v4 cripto-seguro (fallback p/ Math.random em ambientes antigos) ──
  function uuid() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; // version 4
        b[8] = (b[8] & 0x3f) | 0x80; // variant 10
        const h = [...b].map(x => x.toString(16).padStart(2, '0'));
        return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
      }
    } catch {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── API pública ───────────────────────────────────────────────────────────
  return {
    // CRUD O.S
    getAllOS, getOS, saveOS, deleteOS,
    // CFG
    getCFG, saveCFG,
    // Identidade
    getUser, setUser, getInstalador, setInstalador, getLastSync, limparCache,
    // Sync
    trySync, pull, pullCFG,
    // Fotos
    pushPhoto, pullPhoto, putFoto, getFoto, delFoto, delFotoSync,
    // Eventos
    onSync, onConflict, on,
    // Conflito manual
    aceitarServidor, sobrescreverServidor,
    // Fila
    getQueue,
    // Backup
    exportarBackup, importarBackup,
    // Utilitários
    uuid, api, apiFn, carimbarMomento
  };
})();
