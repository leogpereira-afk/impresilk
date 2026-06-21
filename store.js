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
      { nome: 'Admin',     papel: 'admin',     senha: 'admin'      },
      { nome: 'Comercial', papel: 'comercial',  senha: 'comercial'  }
    ]
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
    const q = getQueue();
    // Deduplica upserts da mesma O.S
    if (item.action === 'upsert') {
      const i = q.findIndex(x => x.action === 'upsert' && x.os.id === item.os.id);
      if (i >= 0) { q[i] = item; lsSet(K.FILA, q); return; }
    }
    q.push(item);
    lsSet(K.FILA, q);
  }

  function _removeFromQueue(item) {
    const q = getQueue().filter(x => x !== item);
    lsSet(K.FILA, q);
  }

  // ── Chamada à API ─────────────────────────────────────────────────────────
  async function api(body) {
    const res = await fetch('/.netlify/functions/os', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': TOKEN },
      body:    JSON.stringify(body)
    });
    if (!res.ok && res.status !== 409) {
      throw new Error('HTTP ' + res.status);
    }
    return res.json();
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

  function _notifyConflict(local, remote) {
    _conflictListeners.forEach(fn => { try { fn(local, remote); } catch {} });
  }

  function _notifyListeners(event, data) {
    (_genericListeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
  }

  function on(event, fn) {
    if (!_genericListeners[event]) _genericListeners[event] = [];
    _genericListeners[event].push(fn);
  }

  // ── trySync: envia fila pendente ──────────────────────────────────────────
  let _backoffMs = 5000;

  async function trySync() {
    if (_syncing) return;
    const q = getQueue();
    if (!q.length) { _notifySync('ok', 0); return; }
    if (!navigator.onLine) { _notifySync('offline', q.length); return; }

    _syncing = true;
    _notifySync('pending', q.length);

    for (const item of [...q]) {
      try {
        if (item.action === 'putPhoto') {
          const res = await api({ action: 'putPhoto', base64: item.base64, mime: item.mime, fileId: item.fileId });
          if (res.fileId) _removeFromQueue(item);
        } else {
          const res = await api(item);
          if (res.conflito) {
            _notifyConflict(item.os, res.servidor);
            // Não remove da fila — usuário decide
          } else {
            _removeFromQueue(item);
            // Atualiza cache com atualizadoEm do servidor
            if (item.action === 'upsert' && res.os) {
              const all = getAllOS();
              const idx = all.findIndex(o => o.id === res.os.id);
              if (idx >= 0) { all[idx].atualizadoEm = res.os.atualizadoEm; _setAllOS(all); }
            }
          }
        }
        _backoffMs = 5000;
      } catch {
        break; // Para na primeira falha, tenta depois
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
      const res = await api({ action: 'list' });
      if (!Array.isArray(res.os)) return;

      const local = getAllOS();
      let changed = false;

      for (const remote of res.os) {
        if (!remote || !remote.id) continue;
        const localOS = local.find(o => o.id === remote.id);
        if (!localOS) {
          local.push(remote);
          changed = true;
        } else {
          const tsRemote = remote.atualizadoEm ? new Date(remote.atualizadoEm).getTime() : 0;
          const tsLocal  = localOS.atualizadoEm ? new Date(localOS.atualizadoEm).getTime() : 0;
          if (tsRemote > tsLocal) {
            Object.assign(localOS, remote);
            changed = true;
          }
        }
      }

      if (changed) {
        _setAllOS(local);
        lsSet(K.LASTSYNC, new Date().toISOString());
        if (typeof onRefresh === 'function') onRefresh();
      }

      const q = getQueue();
      _notifySync(q.length ? 'pending' : 'ok', q.length);
      return { updated: changed };
    } catch {
      _notifySync('offline', getQueue().length);
    }
  }

  // ── pullCFG ───────────────────────────────────────────────────────────────
  async function pullCFG() {
    if (!navigator.onLine) return;
    try {
      const res = await api({ action: 'getCfg' });
      if (res.cfg && Object.keys(res.cfg).length) {
        const merged = Object.assign(getCFG(), res.cfg);
        lsSet(K.CFG, merged);
      }
    } catch {}
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

    // Falhou → enfileira
    _enqueue({ action: 'putPhoto', base64, mime, fileId });
    return fileId;
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

  // ── Resolver conflito manualmente ─────────────────────────────────────────
  // Sobrescreve O.S local com versão do servidor
  function aceitarServidor(remoteOS) {
    const all = getAllOS();
    const idx = all.findIndex(o => o.id === remoteOS.id);
    if (idx >= 0) all[idx] = remoteOS; else all.push(remoteOS);
    _setAllOS(all);
    // Remove item da fila para esta O.S
    const q = getQueue().filter(x => !(x.action === 'upsert' && x.os.id === remoteOS.id));
    lsSet(K.FILA, q);
  }

  // Força sobrescrita: grava o local e re-enfileira
  function sobrescreverServidor(localOS) {
    // Atualiza timestamp para ser mais novo
    localOS.atualizadoEm = new Date().toISOString();
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
  }

  // ── UUID simples ──────────────────────────────────────────────────────────
  function uuid() {
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
    getUser, setUser, getInstalador, setInstalador, getLastSync,
    // Sync
    trySync, pull, pullCFG,
    // Fotos
    pushPhoto, pullPhoto, putFoto, getFoto, delFoto,
    // Eventos
    onSync, onConflict, on,
    // Conflito manual
    aceitarServidor, sobrescreverServidor,
    // Fila
    getQueue,
    // Backup
    exportarBackup, importarBackup,
    // Utilitários
    uuid, api
  };
})();
