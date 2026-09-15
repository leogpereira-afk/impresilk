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
    LASTSYNC:   'impresilk_inst_lastsync',
    VALORES:    'impresilk_inst_valores',
    ELENCO:     'impresilk_inst_elenco',
    ENTREGUES:  'impresilk_inst_entregues',
    CURSOR:     'impresilk_inst_cursor',   // carimbo do servidor do ultimo pull
    CFGVER:     'impresilk_inst_cfgver'    // versao da config que o aparelho tem
  };
  // O que o aparelho GUARDA: abertas + finalizadas nos ultimos N dias (ordem do
  // dono, 14/09/2026). O resto so vem por busca. E a unica regua: o servidor
  // recebe este numero, nao tem o dele.
  const JANELA_LOCAL_DIAS = 60;

  // ── IndexedDB (fotos) ──────────────────────────────────────────────────────
  let _db = null;

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      // Versão 2: entrou o armazém 'os'. Ver "O CACHE DAS O.S MORA AQUI".
      const req = indexedDB.open('impresilk_inst', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('os'))    db.createObjectStore('os');
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

  // ── O CACHE DAS O.S MORA AQUI (memória + IndexedDB) ───────────────────────
  //
  // POR QUE SAIU DO localStorage (07/09/2026): o localStorage é de ~5 MB POR
  // ORIGEM -- e todos os sistemas da casa moram na MESMA origem
  // (leogpereira-afk.github.io/painel, /impresilk, /rh, ...), então dividem o
  // mesmo cofre. Só as O.S do PCP já ocupavam 1,5 MB. Quando o cofre enchia,
  // `lsSet` levava QuotaExceededError, o cache NÃO era gravado, e o app abria
  // vazio a cada recarga: era o "entra e não puxa os dados". O IndexedDB do
  // mesmo aparelho oferece ~2,7 GB.
  //
  // getAllOS() continua SÍNCRONO (27 chamadas espalhadas pelo app contam com
  // isso): a lista vive em memória e o IndexedDB é só a cópia em disco,
  // gravada logo depois. Quem precisa da lista já carregada no boot chama
  // STORE.pronto().
  let _osMem   = null;   // null = ainda não carregado do disco
  let _osTimer = null;
  let _semIDB  = false;  // navegador sem IndexedDB (aba privada): usa localStorage

  function getAllOS() {
    if (_osMem) return _osMem;
    return lsGet(K.OS, []);   // antes do pronto(), ou sem IndexedDB
  }

  // Grava a lista no IndexedDB. Agrupa rajadas (o pull chama _setAllOS várias
  // vezes seguidas) para não escrever a lista inteira a cada mexida.
  function _persistirOS() {
    if (_osTimer) clearTimeout(_osTimer);
    _osTimer = setTimeout(async () => {
      _osTimer = null;
      if (_semIDB) { lsSet(K.OS, _osMem || []); return; }
      try {
        const db = await _openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('os', 'readwrite');
          tx.objectStore('os').put(_osMem || [], 'lista');
          tx.oncomplete = resolve;
          tx.onerror    = e => reject(e.target.error);
        });
      } catch (e) {
        // Disco cheio de verdade (ou IndexedDB indisponível): avisa a tela em
        // vez de perder a gravação em silêncio, como acontecia antes.
        console.error('[store] falha ao gravar as O.S no IndexedDB', e);
        _notifyListeners('quota', null);
      }
    }, 250);
  }

  // Carrega o cache do disco. Roda uma vez, no boot. Se ainda houver lista no
  // localStorage (aparelho vindo da versão antiga), ela é a fonte desta vez:
  // migra para o IndexedDB e LIBERA o espaço no localStorage.
  let _prontoP = null;
  function pronto() {
    if (_prontoP) return _prontoP;
    _prontoP = (async () => {
      let doLS = null;
      try { doLS = JSON.parse(localStorage.getItem(K.OS) || 'null'); } catch { doLS = null; }
      try {
        const db = await _openDB();
        const daBase = await new Promise((resolve, reject) => {
          const tx  = db.transaction('os', 'readonly');
          const req = tx.objectStore('os').get('lista');
          req.onsuccess = e => resolve(e.target.result || null);
          req.onerror   = e => reject(e.target.error);
        });
        if (Array.isArray(doLS) && doLS.length) {
          // Migração: o que está no localStorage é o mais recente do aparelho.
          _osMem = doLS;
          await new Promise((resolve, reject) => {
            const tx = db.transaction('os', 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = e => reject(e.target.error);
            tx.onabort = () => reject(tx.error || new Error('Migração interrompida'));
            tx.objectStore('os').put(doLS, 'lista');
          });
          try { localStorage.removeItem(K.OS); } catch {}
          console.log('[store] cache das O.S migrado para o IndexedDB (' + doLS.length + ') e liberado do localStorage');
        } else {
          _osMem = Array.isArray(daBase) ? daBase : [];
        }
      } catch (e) {
        // Sem IndexedDB: segue no localStorage, como antes.
        _semIDB = true;
        _osMem = Array.isArray(doLS) ? doLS : [];
        console.warn('[store] IndexedDB indisponível; cache das O.S segue no localStorage', e);
      }
      // Elenco (com as fotos do RH) também vem do disco no boot: `elenco()` é
      // síncrono e a mensagem do dia depende dele já preenchido.
      // PODADO PELO PAPEL DE AGORA, não pelo de quem gravou — ver _podarElenco.
      const doDisco = await _lerElencoDisco();
      if (doDisco && Array.isArray(doDisco.pessoas)) _elenco = _podarElenco(doDisco);
      else {
        // Aparelho vindo da versão que guardava o elenco no localStorage.
        const velho = lsGet(K.ELENCO, null);
        if (velho && Array.isArray(velho.pessoas)) { _elenco = _podarElenco(velho); _gravarElencoDisco(_elenco); }
      }
      try { localStorage.removeItem(K.ELENCO); } catch {}
      // Entregues do ERP: também do disco. `entreguesMes()` é síncrono e a tela
      // de Entregas conta com o que já foi baixado antes de pedir mais ao ERP.
      const entrDisco = await _lerEntreguesDisco();
      if (entrDisco && typeof entrDisco === 'object') _entregues = entrDisco;
      const entrVelho = lsGet(K.ENTREGUES, null);   // aparelho vindo do localStorage
      if (entrVelho && typeof entrVelho === 'object') {
        for (const [k, v] of Object.entries(entrVelho)) if (!_entregues[k]) _entregues[k] = v;
        _persistirEntregues();
      }
      try { localStorage.removeItem(K.ENTREGUES); } catch {}
      return _osMem;
    })();
    return _prontoP;
  }

  // Historico buscado sob demanda (Finalizados/Arquivados fora da janela local).
  // Nao vai para o disco: some ao recarregar, volta na proxima busca.
  const _osHistorico = new Map();
  function historico() { return [..._osHistorico.values()]; }
  function getOS(id) {
    return getAllOS().find(o => o.id === id) || _osHistorico.get(id) || null;
  }

  function _setAllOS(arr) {
    _osMem = Array.isArray(arr) ? arr : [];
    _persistirOS();
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
        // A mensagem do servidor vai junto: "HTTP 403" não diz a quem clicou o
        // que houve, e é justamente ela que o aviso de recusa precisa mostrar.
        throw Object.assign(new Error((corpo && corpo.error) ? String(corpo.error) : 'HTTP ' + res.status), {
          status: res.status,
          semSessao: !!(corpo && corpo.semSessao),
          servidor: (corpo && corpo.error) ? String(corpo.error) : ''
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
  // Contagem de falhas por item (chave = _sigFila). Ao atingir N falhas,
  // avisa a tela; o trabalho permanece na fila para recuperação.
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
          if (!base64) {
            if (!_failCount.has(sig)) _notifyListeners('item-pendente', {item,motivo:'Foto não encontrada no aparelho; confira o anexo.'});
            _failCount.set(sig,1); continue;
          }
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
        if (e && (e.semSessao || e.status === 401)) {
          _syncing = false;
          _notifySync('sem-sessao', getQueue().length);
          _notifyListeners('sem-sessao', {});
          return;
        }
        /* 403 NÃO É 401. O crachá está bom; o SERVIDOR recusou ESTA ação para
           ESTE papel — e vai recusar de novo, para sempre. Tratar os dois
           juntos punha a fila inteira em "sem sessão" e parava o laço com o
           item preso na frente: bastava o gestor do PCP clicar em "Ligar" (que
           enfileira um setCfg, exclusivo de admin) para que a O.S finalizada às
           14h, as fotos do check-in e os lançamentos do dia nunca mais saíssem
           do aparelho. E não havia saída: `pullCFG` para com setCfg na fila e
           `limparCache` desiste com fila pendente, então nem sair e entrar
           resolvia — enquanto o indicador mandava fazer login de novo.
           Recusa definitiva sai da fila e é DITA; o resto do dia segue. */
        if (e && e.status === 403) {
          _removeFromQueue(item);
          _failCount.delete(sig);
          // Recusado não pode continuar valendo NESTE aparelho como se tivesse
          // salvo: `saveCFG` grava no localStorage antes de enfileirar, e o
          // `pullCFG` só sobrepõe chave que o servidor TAMBÉM tem — uma chave
          // que nunca chegou lá (uma escala, por exemplo) ficava para sempre na
          // tela de quem tentou, e só na dele. A cópia local volta à do banco.
          if (item.action === 'setCfg') reverterCFG();
          _notifyListeners('item-recusado', { item, motivo: e.servidor || msg || 'sem permissão para esta ação' });
          continue;
        }
        // Distingue falha de rede (parar o ciclo) de erro permanente do item
        // (incrementa contador e avisa sem descartar o trabalho).
        const isNetwork = !msg.startsWith('HTTP ') || /HTTP 5\d\d/.test(msg);
        if (isNetwork) {
          consecutiveNetFails++;
          if (consecutiveNetFails >= 1) break; // sai do loop, tenta no próximo trySync
        } else {
          // Delete/deletePhoto NUNCA são descartados: são leves (~50 bytes) e
          // descartar ressuscitaria a O.S excluída no pull seguinte.
          if (item.action === 'delete' || item.action === 'deletePhoto') {
            if (!_failCount.has(sig)) _notifyListeners('item-pendente', { item, motivo: 'exclusão pendente: ' + msg });
            _failCount.set(sig,1);
            continue;
          }
          const n = (_failCount.get(sig) || 0) + 1;
          _failCount.set(sig, n);
          if (n === MAX_FAILS) {
            console.warn('[store] item preservado na fila após', n, 'falhas:', sig, msg);
            _notifyListeners('item-pendente', { item, motivo: msg });
          }
        }
      }
    }

    _syncing = false;
    const remaining = getQueue();
    _notifySync(remaining.length ? (navigator.onLine ? 'pending' : 'offline') : 'ok', remaining.length);
  }

  // ── pull: busca lista do servidor e mescla ────────────────────────────────
  /* PULL INCREMENTAL (14/09/2026). Antes: a lista inteira, 6 paginas, a cada
     30 s, em todo aparelho -- 5 MB por minuto e meio para receber 2 O.S por
     hora. Agora: "o que mudou desde o carimbo", que quase sempre e nada.
     Completo so no primeiro uso, quando o cursor envelhece (6 h) ou quando o
     incremental vem cheio. O completo tambem PODA: o aparelho guarda abertas
     + finalizadas de JANELA_LOCAL_DIAS; o resto sai (o historico vem por
     busca). Edicao pendente na fila nunca sai nem e sobrescrita. */
  let _pulling = false;
  async function pull(onRefresh, opts = {}) {
    if (!navigator.onLine) return { updated: false, offline: true };
    if (_pulling) return { updated: false, ocupado: true };   // rede lenta nao empilha pulls
    _pulling = true;
    try {
      const cursor = lsGet(K.CURSOR, null);
      const idade = cursor && cursor.em ? Date.now() - new Date(cursor.em).getTime() : Infinity;
      const completo = !!opts.completo || !cursor || !cursor.em || idade > 6 * 3600000;
      if (!completo) {
        const r = await _pullIncremental(cursor.em, onRefresh);
        if (!r.cheio) return r;
        // 500 mudancas desde o cursor: refaz completo em vez de fingir.
      }
      return await _pullCompleto(onRefresh);
    } catch (e) {
      if (e && (e.semSessao || e.status === 401 || e.status === 403)) {
        _notifySync('sem-sessao', getQueue().length);
        _notifyListeners('sem-sessao', {});
      } else _notifySync('offline', getQueue().length);
      return { updated: false, erro: true };
    } finally { _pulling = false; }
  }

  const _revMaisNova = (remote, atual) => {
    const revR = typeof remote.rev === 'number' ? remote.rev : null;
    const revL = typeof atual?.rev === 'number' ? atual.rev : null;
    return !atual || ((revR !== null && revL !== null)
      ? revR > revL
      : new Date(remote.atualizadoEm || 0) > new Date(atual.atualizadoEm || 0));
  };

  async function _pullIncremental(since, onRefresh) {
    const res = await api({ action: 'list', since });
    if (!res || !Array.isArray(res.os)) { _notifyListeners('pull-truncado', { paginas: 1 }); return { updated: false, incompleta: true }; }
    if (res.cheio) return { updated: false, cheio: true };
    const fila = getQueue();
    const pendentes = new Set(fila.filter(q => q.action === 'upsert' && q.os?.id).map(q => q.os.id));
    const excluidas = new Set(fila.filter(q => q.action === 'delete').map(q => q.id));
    const local = getAllOS();
    const porId = new Map(local.map(o => [o.id, o]));
    let changed = false;
    for (const r of res.os) {
      if (!r || !r.id) continue;
      if (r.apagado) {
        // Lapide de outro aparelho: sai daqui -- a menos que ESTE aparelho tenha
        // edicao pendente dela (o upsert ressuscita no servidor, por desenho).
        if (porId.has(r.id) && !pendentes.has(r.id)) { porId.delete(r.id); changed = true; }
        continue;
      }
      if (excluidas.has(r.id) || pendentes.has(r.id)) continue;
      const atual = porId.get(r.id);
      if (_revMaisNova(r, atual)) { porId.set(r.id, r); changed = true; }
    }
    if (changed) { _setAllOS([...porId.values()]); if (typeof onRefresh === 'function') onRefresh(); }
    lsSet(K.CURSOR, { em: res.agora || new Date().toISOString(), modo: 'incremental' });
    lsSet(K.LASTSYNC, new Date().toISOString());
    const q = getQueue();
    _notifySync(q.length ? 'pending' : 'ok', q.length);
    return { updated: changed, incremental: true, mudancas: res.os.length };
  }

  async function _pullCompleto(onRefresh) {
    // So uma lista completa autoriza remover registros do cache. A coleta
    // nao altera a memoria; edicao feita durante a rede sera lida no merge.
    const remotas = new Map();
    const cursores = new Set();
    let consulta = { action: 'list', escopo: 'recentes', dias: JANELA_LOCAL_DIAS };
    let agora = '';
    for (let pagina = 0; ; pagina++) {
      const chave = JSON.stringify(consulta);
      if (pagina >= 1000 || cursores.has(chave)) {
        _notifyListeners('pull-truncado', { paginas: pagina });
        return { updated: false, incompleta: true };
      }
      cursores.add(chave);
      const res = await api(consulta);
      if (!res || !Array.isArray(res.os) || res.os.some(o => !o || !o.id)) {
        _notifyListeners('pull-truncado', { paginas: pagina + 1 });
        return { updated: false, incompleta: true };
      }
      // O carimbo e o da PRIMEIRA pagina: o que mudar durante a paginacao tem
      // atualizado_em maior que ele e chega no proximo incremental.
      if (!agora) agora = res.agora || new Date().toISOString();
      for (const o of res.os) remotas.set(o.id, o);
      if (res.nextAfter != null) consulta = { ...consulta, after: res.nextAfter };
      else if (res.nextOffset != null) consulta = { ...consulta, offset: res.nextOffset };
      else break;
    }

    const fila = getQueue();
    const pendentes = new Set(fila.filter(q => q.action === 'upsert' && q.os?.id).map(q => q.os.id));
    const excluidas = new Set(fila.filter(q => q.action === 'delete').map(q => q.id));
    const local = getAllOS();
    const porId = new Map(local.map(o => [o.id, o]));
    const resultado = [];
    let changed = false;
    for (const [id, remote] of remotas) {
      if (excluidas.has(id)) continue;
      const atual = porId.get(id);
      if (!pendentes.has(id) && _revMaisNova(remote, atual)) { resultado.push(remote); changed = true; }
      else resultado.push(atual || remote);
    }
    // O que o servidor nao mandou sai daqui (poda por janela, lapide, ou
    // exclusao) -- menos o que este aparelho ainda nao conseguiu enviar.
    for (const o of local) if (pendentes.has(o.id) && !remotas.has(o.id) && !excluidas.has(o.id)) resultado.push(o);
    if (resultado.length !== local.length) changed = true;
    if (changed) {
      _setAllOS(resultado);
      if (typeof onRefresh === 'function') onRefresh();
    }
    lsSet(K.CURSOR, { em: agora, modo: 'completo' });
    lsSet(K.LASTSYNC, new Date().toISOString());
    const q = getQueue();
    _notifySync(q.length ? 'pending' : 'ok', q.length);
    return { updated: changed, completo: true, total: remotas.size };
  }

  /* HISTORICO SOB DEMANDA: Finalizados/Arquivados fora da janela local, ou uma
     busca por numero/cliente. Vai para _osHistorico (memoria), nunca para o
     cache do aparelho. Ate 5 paginas; se cortar, avisa em `truncou`. */
  // Primeira e última finalização que o servidor tem: os chips de ano da vista
  // Arquivados vêm daqui. Uma chamada por sessão.
  let _faixaHist = null;
  async function faixaHistorico() {
    if (_faixaHist) return _faixaHist;
    if (!navigator.onLine) return null;
    try {
      const res = await api({ action: 'list', escopo: 'finalizadas', faixa: true, ate: '1900-01-01' });
      if (res && res.faixa && res.faixa.de) _faixaHist = res.faixa;
    } catch { /* sem rede: os chips usam o que está no aparelho */ }
    return _faixaHist;
  }
  async function buscarHistorico({ de = '', ate = '', q = '' } = {}) {
    if (!navigator.onLine) return { itens: [], offline: true };
    const itens = [];
    let consulta = { action: 'list', escopo: 'finalizadas', de, ate, q };
    let truncou = false;
    for (let pagina = 0; pagina < 5; pagina++) {
      const res = await api(consulta);
      if (!res || !Array.isArray(res.os)) break;
      for (const o of res.os) { if (o && o.id) { itens.push(o); if (!getAllOS().some(x => x.id === o.id)) _osHistorico.set(o.id, o); } }
      if (res.nextAfter == null) { truncou = false; break; }
      consulta = { ...consulta, after: res.nextAfter };
      truncou = true;
    }
    _notifyListeners('historico', { n: itens.length, truncou });
    return { itens, truncou };
  }

  /* ── MAESTRO: um relogio so para toda a sincronizacao ──────────────────────
     Antes eram tres timers e uma rajada no boot; agora um ciclo, que nunca roda
     por cima de si mesmo e sabe tres coisas que os timers nao sabiam:
       - aba ESCONDIDA nao precisa de dado a cada 30 s (3 min basta);
       - erro seguido merece esperar mais (30 s -> 1 -> 2 -> 5 min), nao martelar;
       - voltar a aba, ou voltar a rede, e hora de sincronizar AGORA.
     Config a cada 5 min (com versao, 40 bytes se nada mudou), valores a cada
     5 min, elenco a cada 30 min -- e o pull incremental a cada volta. */
  const MAESTRO = { visivelMs: 30000, ocultoMs: 180000, tetoMs: 300000, cfgMs: 5 * 60000, valoresMs: 5 * 60000, elencoMs: 30 * 60000 };
  let _mOpts = null, _mTimer = null, _mFalhas = 0, _mCiclando = false;
  const _mUltimo = { cfg: 0, valores: 0, elenco: 0 };
  const _visivel = () => (typeof document === 'undefined') || document.visibilityState !== 'hidden';
  function _agendar() {
    if (_mTimer) clearTimeout(_mTimer);
    const base = _visivel() ? MAESTRO.visivelMs : MAESTRO.ocultoMs;
    const ms = Math.min(MAESTRO.tetoMs, base * Math.pow(2, Math.min(_mFalhas, 4)));
    _mTimer = setTimeout(() => _ciclo('agenda'), ms);
  }
  async function _ciclo(motivo) {
    if (_mCiclando || !_mOpts) return;
    _mCiclando = true;
    let ok = true;
    try {
      await trySync();
      const r = await pull(_mOpts.aoAtualizar);
      if (r && (r.erro || r.offline)) ok = false;
      const t = Date.now();
      if (t - _mUltimo.cfg > MAESTRO.cfgMs) { _mUltimo.cfg = t; const mudou = await pullCFG(); if (mudou && _mOpts.aoCfg) _mOpts.aoCfg(); }
      if (_mOpts.podeVerValores && _mOpts.podeVerValores() && t - _mUltimo.valores > MAESTRO.valoresMs) { _mUltimo.valores = t; await pullValores(true); }
      if (t - _mUltimo.elenco > MAESTRO.elencoMs) { _mUltimo.elenco = t; await pullElenco(); }
    } catch { ok = false; }
    finally {
      _mFalhas = ok ? 0 : _mFalhas + 1;
      _mCiclando = false;
      _agendar();
    }
  }
  function iniciarMaestro(opts) {
    _mOpts = opts || {};
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (_visivel()) _ciclo('visivel'); });
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => _ciclo('online'));
    return _ciclo('inicio');
  }
  function sincronizarAgora() { return _ciclo('pedido'); }

  async function pullCFG() {
    if (!navigator.onLine) return;
    // Se há um setCfg pendente na fila, a config local é mais nova que a do
    // servidor — não sobrescrever (evita perder níveis/usuários/funcionários
    // editados offline). O trySync envia a versão local em seguida.
    if (getQueue().some(x => x.action === 'setCfg')) return false;
    try {
      // Manda a versao que ja tem: se nada mudou, volta {semMudanca} e nada e gravado.
      const res = await api({ action: 'getCfg', seVersao: lsGet(K.CFGVER, '') || '' });
      if (res && res.semMudanca) return false;
      if (res.cfg && Object.keys(res.cfg).length) {
        const merged = Object.assign(getCFG(), res.cfg);
        lsSet(K.CFG, merged);
        if (res.versao) lsSet(K.CFGVER, res.versao);
        return true;
      }
      return false;
    } catch (e) {
      if (e && (e.semSessao || e.status === 401 || e.status === 403)) {
        _notifySync('sem-sessao', getQueue().length);
        _notifyListeners('sem-sessao', {});
      }
    }
  }

  // Devolve a configuração deste aparelho ao que o SERVIDOR tem. Substitui em
  // vez de mesclar: o problema é justamente a chave a mais, que a mescla
  // preserva. `usuarios`/`funcionarios` ficam de fora porque o getCfg não os
  // manda para quem não é admin — apagá-los aqui seria perder cache à toa.
  async function reverterCFG() {
    try {
      const res = await api({ action: 'getCfg' });
      if (!res || !res.cfg) return;
      const local = lsGet(K.CFG, {}) || {};
      const novo = Object.assign({}, res.cfg);
      for (const campo of ['usuarios', 'funcionarios']) {
        if (!(campo in novo) && campo in local) novo[campo] = local[campo];
      }
      lsSet(K.CFG, novo);
      _notifyListeners('cfg', novo);
    } catch { /* sem rede: o próximo pull resolve */ }
  }

  // ── Valor de cada O.S (uma base só) ───────────────────────────────────────
  // O PCP nunca soube quanto vale o serviço. A verdade mora no cache do
  // Painel (painel_ordens, mesmo banco), e o pcp-sync entrega {numero: valor}
  // pela ação 'valores' — só para admin/pcp. Fica em memória (e uma cópia
  // pequena no localStorage, ~12 KB, para a tela não abrir zerada offline).
  // Papel sem acesso recebe 403 e a tela mostra "sem valor", não erro.
  let _valores = lsGet(K.VALORES, { em: '', mapa: {} });
  function valores() { return (_valores && _valores.mapa) || {}; }
  function valoresEm() { return (_valores && _valores.em) || ''; }
  async function pullValores(forcar) {
    if (!navigator.onLine) return;
    const idade = _valores.em ? Date.now() - new Date(_valores.em).getTime() : Infinity;
    if (!forcar && idade < 5 * 60000) return;
    try {
      const res = await api({ action: 'valores' });
      if (res && res.valores && typeof res.valores === 'object') {
        // `anos` vem junto: são os anos que o ERP tem no banco, e é deles que
        // a tela de Entregas tira os chips. Ver `anosEntregues()`.
        _valores = { em: res.em || new Date().toISOString(), mapa: res.valores,
                     anos: Array.isArray(res.anos) ? res.anos : (_valores.anos || []) };
        lsSet(K.VALORES, _valores);
        _notifyListeners('valores', _valores);
      }
    } catch (e) {
      // 403 = papel sem acesso a dinheiro; 401 = sessão — o pull normal já avisa.
      // Marca a tentativa para não bater a cada 30 s numa porta que recusou.
      _valores = Object.assign({}, _valores, { em: new Date().toISOString() });
    }
  }

  // ── Entregues por mês, segundo o ERP (data de entrega) ───────────────────
  // O valor entregue vem daqui, não da soma das O.S que o PCP conhece. Um
  // pacote por mês {em, mes, total, os[]}; o servidor guarda em cache e a
  // tela pede o mês corrente e os meses do ano conforme abre.
  /* SAIU DO localStorage (14/09/2026). Cada mês pesa ~33 KB e o dono pediu um
     chip para CADA ano que existe — 2020 a hoje são 84 meses, ~2,7 MB. Os sete
     sistemas dividem 5 MB de localStorage na mesma origem, então isso estourava
     a cota de todo mundo (e o `lsSet` engole o erro: o app abriria vazio, como
     já aconteceu). No IndexedDB do mesmo aparelho cabem ~2,7 GB.
     Ver [[feedback_localstorage_origem_compartilhada]]. */
  let _entregues = {};
  let _entreguesPedindo = {};
  let _entreguesTimer = null;
  async function _lerEntreguesDisco() {
    try {
      const db = await _openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('os', 'readonly');
        const req = tx.objectStore('os').get('entregues');
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror = e => reject(e.target.error);
      });
    } catch { return null; }
  }
  function _persistirEntregues() {
    if (_semIDB) { lsSet(K.ENTREGUES, _entregues); return; }
    if (_entreguesTimer) clearTimeout(_entreguesTimer);
    _entreguesTimer = setTimeout(async () => {
      _entreguesTimer = null;
      try {
        const db = await _openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('os', 'readwrite');
          tx.objectStore('os').put(_entregues, 'entregues');
          tx.oncomplete = resolve;
          tx.onerror = e => reject(e.target.error);
        });
      } catch (e) { console.warn('[store] entregues não gravou no IndexedDB', e); }
    }, 300);
  }

  /* OS ANOS QUE EXISTEM vêm do BANCO (a ação `valores` os traz junto, de
     `painel_ordens`), nunca de uma constante aqui. Uma lista copiada falha
     calada: a versão anterior chutava três anos enquanto o cache guardava dois,
     e o chip do ano mais antigo pedia ao ERP em laço infinito. Sem resposta do
     servidor ainda, vale só o ano corrente — nunca um ano que não sabemos se
     existe. Ver [[feedback_lista_copiada_falha_calada]]. */
  function anosEntregues() {
    const doServidor = (_valores && Array.isArray(_valores.anos)) ? _valores.anos : [];
    const atual = new Date().getFullYear();
    if (!doServidor.length) return [atual];
    return doServidor.filter(a => Number.isFinite(a) && a <= atual).sort((x, y) => y - x);
  }

  /* v2 E v3 SERVEM. A v3 acrescentou `previsao` em cada O.S (o prazo combinado,
     que alimenta o SLA da tela de Entregas); o resto do pacote é idêntico.
     Testar `=== 2` fazia o app DESCARTAR o pacote novo e a tela de Entregas
     ficava em "carregando…" para sempre — a versão do pacote tem de ser um
     piso, nunca uma igualdade, senão todo campo novo derruba quem não
     recarregou a aba ainda. */
  function entreguesMes(mes) { const p = _entregues[mes]; return p && Number(p.v) >= 2 ? p : null; }
  /* "NÃO VEIO" E "FALHOU" SÃO COISAS DIFERENTES na tela. `entreguesMes` devolve
     null nos dois casos, e a tela contava os dois como "carregando N meses" —
     mês que o ERP recusou (403) ou que voltou com erro ficava eternamente em
     "carregando", sem nada carregando. Aqui ela pergunta qual dos dois é. */
  function entreguesFalhou(mes) { const p = _entregues[mes]; return !!(p && p.erro && !(p.os || []).length); }
  async function pullEntreguesMes(mes, forcar) {
    if (!navigator.onLine || !mes || _entreguesPedindo[mes]) return null;
    const atual = _entregues[mes];
    const hojeMes = new Date().toISOString().slice(0, 7);
    /* MÊS FECHADO NÃO MUDA — não vale revarrer o ERP por ele.
       A validade de 6 h servia quando o cache ia até o ano anterior. Com um chip
       por ano desde 2020, ela mandaria o app revarrer 84 meses a cada 6 h, a
       25–40 s por mês. O passado distante é história: só o mês corrente e o
       anterior ainda recebem lançamento. */
    const anterior = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
    // Pacote que FALHOU não herda a validade longa: uma queda do ERP tem de se
    // curar sozinha em minutos, senão um tropeço de rede congelaria o mês por
    // 30 dias. (Recusa por papel também repete, mas 403 volta na hora.)
    const validade = (atual && atual.erro) ? 10 * 60000
      : (mes === hojeMes ? 15 * 60000 : (mes === anterior ? 6 * 3600000 : 30 * 864e5));
    if (atual && !forcar && Date.now() - new Date(atual.em).getTime() < validade) return atual;
    _entreguesPedindo[mes] = true;
    try {
      const res = await apiFn('mubisys', { action: 'entreguesMes', mes }, 120000);
      if (res && Array.isArray(res.os)) {
        _entregues = Object.assign({}, _entregues, { [mes]: { v: res.v || 0, em: res.em, mes, total: res.total, os: res.os } });
        /* A PODA SEGUE OS CHIPS, e os chips seguem o banco. Guardar o que a
           tela oferece é a regra; o que ficou ANTES do primeiro ano do ERP é
           que sai (mês de pacote antigo, ano corrompido). Antes a poda cortava
           por uma constante própria e apagava o pacote no mesmo pull que o
           gravava — laço infinito preso em "carregando 12 de 12 meses". */
        const anos = anosEntregues();
        const corte = String(Math.min(...anos));
        for (const k of Object.keys(_entregues)) if (k.slice(0, 4) < corte) delete _entregues[k];
        _persistirEntregues();
        _notifyListeners('entregues', { mes });
        return _entregues[mes];
      }
    } catch (e) {
      // 403 = papel sem acesso; 502 = ERP fora do ar. A tela mostra "sem dado do ERP".
      _entregues = Object.assign({}, _entregues, { [mes]: Object.assign({ em: new Date().toISOString(), mes, total: 0, os: [], erro: true }, atual || {}, { em: new Date().toISOString(), erro: true }) });
      _persistirEntregues();
    } finally { delete _entreguesPedindo[mes]; }
    return _entregues[mes] || null;
  }

  // ── Elenco: pessoas do RH e veículos do Ativos (uma base só) ─────────────
  // MORA NO INDEXEDDB, não no localStorage: desde 14/09/2026 o pacote traz a
  // FOTO da ficha (30 fotos ≈ 400 KB) e os 7 sistemas dividem 5 MB de
  // localStorage por origem — jogar isso lá estourava a cota de todo mundo.
  const ELENCO_VAZIO = { em: '', pessoas: [], veiculos: [], ferias: [], ausencias: [], fichaRH: false, papel: '' };
  let _elenco = ELENCO_VAZIO;
  function elenco() { return _elenco || ELENCO_VAZIO; }

  /* O GATE DO SERVIDOR NÃO ALCANÇA O QUE JÁ ESTÁ NO APARELHO.
     O tablet da fábrica é compartilhado. A gestão entra, o elenco COMPLETO
     (com férias, atestados e aviso prévio) fica gravado no IndexedDB, e a
     montagem entra em seguida. O boot lê o pacote do disco sem olhar quem está
     logado agora, e o `pullElenco` ainda espera 30 min antes de renovar — nessa
     janela quem entrou SEM SENHA lia a ficha de RH de 35 pessoas, com o gate do
     servidor intacto e sem nada acusando.
     (E a saída não salvava: `limparCache` desiste quando há fila pendente.)

     Então o pacote passa a andar carimbado com o papel que o baixou, e a
     leitura poda o que o papel de agora não pode ver. Podar é o que vale —
     apenas apagar deixaria a tela dizendo "ninguém está fora". */
  const _vePapelFicha = p => ['admin', 'pcp'].includes(String(p || ''));
  function _papelAtual() { const u = getUser(); return String((u && u.papel) || ''); }
  function _podarElenco(pac) {
    const base = Object.assign({}, ELENCO_VAZIO, pac || {});
    if (_vePapelFicha(_papelAtual())) return base;
    return Object.assign(base, {
      fichaRH: false,
      ferias: [],
      ausencias: [],
      pessoas: (base.pessoas || []).map(p => Object.assign({}, p, { statusId: '', status: '' })),
    });
  }
  async function _lerElencoDisco() {
    try {
      const db = await _openDB();
      return await new Promise((resolve, reject) => {
        const tx  = db.transaction('os', 'readonly');
        const req = tx.objectStore('os').get('elenco');
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = e => reject(e.target.error);
      });
    } catch { return null; }
  }
  async function _gravarElencoDisco(pac) {
    if (_semIDB) return;                      // aba privada: elenco só em memória
    try {
      const db = await _openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('os', 'readwrite');
        tx.objectStore('os').put(pac, 'elenco');
        tx.oncomplete = resolve;
        tx.onerror    = e => reject(e.target.error);
      });
    } catch (e) { console.warn('[store] elenco não gravou no IndexedDB', e); }
  }
  async function _apagarElencoDisco() {
    if (_semIDB) return;
    try {
      const db = await _openDB();
      await new Promise((resolve) => {
        const tx = db.transaction('os', 'readwrite');
        tx.objectStore('os').delete('elenco');
        tx.oncomplete = resolve;
        tx.onerror = resolve;   // sair do sistema nunca trava por causa do cache
      });
    } catch { /* base já fechada/apagada: nada a apagar */ }
  }
  async function pullElenco(forcar) {
    if (!navigator.onLine) return;
    const idade = _elenco.em ? Date.now() - new Date(_elenco.em).getTime() : Infinity;
    // Papel diferente do que baixou o pacote = pacote velho, por mais novo que
    // seja o relógio: a gestão enxerga o que a montagem não pode, e vice-versa.
    // Sem isto, o crachá novo passaria até 30 min servindo a régua do anterior.
    const trocouPapel = String(_elenco.papel || '') !== _papelAtual();
    if (!forcar && !trocouPapel && idade < 30 * 60000) return;
    try {
      const res = await api({ action: 'elenco' });
      if (res && Array.isArray(res.pessoas)) {
        _elenco = {
          em: res.em || new Date().toISOString(),
          pessoas: res.pessoas,
          veiculos: res.veiculos || [],
          ferias: res.ferias || [],
          ausencias: res.ausencias || [],
          // O servidor só manda férias/ausências para admin/pcp. `fichaRH:false`
          // quer dizer "veio vazio porque você não pode ver", e não "não há
          // ninguém fora" — a tela precisa saber a diferença. Pacote antigo (sem
          // o campo) trazia a ficha, então ausente vale como true.
          fichaRH: res.fichaRH !== false,
          papel: _papelAtual(),   // carimbo de quem baixou — ver _podarElenco
        };
        await _gravarElencoDisco(_elenco);
        _notifyListeners('elenco', _elenco);
      }
    } catch (e) { /* sem sessão: o pull normal avisa */ }
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
    /* O ELENCO SAI SEMPRE, ANTES DE QUALQUER DESISTÊNCIA.
       Abaixo, `limparCache` devolve false quando há fila pendente — e com
       razão: as O.S da fila só existem neste aparelho e apagá-las perderia o
       trabalho do dia. Mas o elenco não é trabalho de ninguém, é cache do RH.
       Deixá-lo para trás fazia a saída "com fila" entregar a ficha de 35
       pessoas ao próximo crachá — inclusive o da montagem, que entra sem senha. */
    try {
      _elenco = ELENCO_VAZIO;
      localStorage.removeItem(K.ELENCO);
      _apagarElencoDisco();
    } catch {}
    if (getQueue().length) return false;
    try {
      localStorage.removeItem(K.OS);
      localStorage.removeItem(K.FILA);
      localStorage.removeItem(K.LASTSYNC);
      localStorage.removeItem(K.VALORES);
      localStorage.removeItem(K.ELENCO);
      localStorage.removeItem(K.ENTREGUES);
      localStorage.removeItem(K.CURSOR);
      localStorage.removeItem(K.CFGVER);
      _osHistorico.clear();
      _entregues = {};
      _valores = { em: '', mapa: {} };
      _elenco = ELENCO_VAZIO;
      const cfg = lsGet(K.CFG, null);
      if (cfg && typeof cfg === 'object') {
        const { usuarios: _u, funcionarios: _f, ...resto } = cfg;
        lsSet(K.CFG, resto);
      }
    } catch {}
    try {
      // Cancela gravação agendada e zera a memória ANTES de derrubar a base:
      // sem isto o _persistirOS pendente recriava a lista logo depois do
      // delete, e getAllOS() seguia servindo as O.S da sessão que saiu.
      if (_osTimer) { clearTimeout(_osTimer); _osTimer = null; }
      _osMem = null; _prontoP = null;
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
    getAllOS, getOS, saveOS, deleteOS, pronto,
    // CFG
    getCFG, saveCFG,
    // Identidade
    getUser, setUser, getInstalador, setInstalador, getLastSync, limparCache,
    // Sync
    trySync, pull, pullCFG, pullValores, valores, valoresEm, pullElenco, elenco, pullEntreguesMes, entreguesMes, entreguesFalhou, anosEntregues,
    iniciarMaestro, sincronizarAgora, buscarHistorico, historico, faixaHistorico, JANELA_LOCAL_DIAS,
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
