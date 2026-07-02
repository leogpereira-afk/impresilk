// Netlify Function — endpoint /.netlify/functions/os
// Backend: Netlify Blobs (stores: "os", "fotos", "cfg")
// Autenticação leve: header x-token ou corpo.token === process.env.TOKEN

const { getStore } = require('@netlify/blobs');

// Abre um store do Netlify Blobs. Em produção o Netlify normalmente injeta o
// contexto sozinho; se isso falhar, usamos a configuração manual com as
// variáveis de ambiente BLOBS_SITE_ID e BLOBS_TOKEN.
function blobStore(name) {
  const siteID = process.env.BLOBS_SITE_ID;
  const token  = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  return getStore(name);
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return resp({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return resp({ error: 'JSON inválido' }, 400);
  }

  const token = (event.headers && event.headers['x-token']) || body.token;
  if (!process.env.TOKEN || token !== process.env.TOKEN) {
    return resp({ error: 'Não autorizado' }, 401);
  }

  const { action } = body;

  try {
    switch (action) {

      // ── ping ────────────────────────────────────────────────────────────────
      case 'ping':
        return resp({ ok: true });

      // ── list: retorna as O.S em páginas ─────────────────────────────────────
      // Paginado para a resposta nunca passar do limite de ~6 MB das Netlify
      // Functions. O cliente percorre as páginas usando "offset"/"nextOffset".
      // A lista de chaves (só ids) é leve mesmo com milhares de O.S; o que pesa
      // é o conteúdo, então limitamos quantas O.S completas vão em cada resposta.
      case 'list': {
        const store = blobStore('os');
        const PAGE = 150; // O.S completas por resposta (margem folgada vs. 6 MB)

        const keys = (await allKeys(store)).sort();
        // Paginação por CHAVE ("after"): estável quando O.S são criadas ou
        // apagadas entre páginas (o offset numérico deslocava o corte e podia
        // pular uma O.S — que o cliente então apagava do cache local achando
        // que ela sumiu do servidor). "offset" segue aceito p/ clientes antigos.
        let inicio;
        if (body.after != null) {
          inicio = keys.findIndex(k => k > String(body.after));
          if (inicio < 0) inicio = keys.length;
        } else {
          inicio = Math.max(0, Number(body.offset) || 0);
        }
        const slice = keys.slice(inicio, inicio + PAGE);
        const items = await Promise.all(
          slice.map(k => store.get(k, { type: 'json' }).catch(() => null))
        );
        const fim = inicio + slice.length;
        return resp({
          os: items.filter(Boolean),
          total: keys.length,
          nextAfter: fim < keys.length && slice.length ? slice[slice.length - 1] : null,
          nextOffset: fim < keys.length ? fim : null
        });
      }

      // ── upsert: grava/atualiza uma O.S (com detecção de conflito) ───────────
      case 'upsert': {
        const store = blobStore('os');
        const { os } = body;
        if (!os || !os.id) return resp({ error: 'O.S sem id' }, 400);

        const existing = await store.get(os.id, { type: 'json' }).catch(() => null);
        if (existing && existing.atualizadoEm && os.atualizadoEm) {
          const tsServer = new Date(existing.atualizadoEm).getTime();
          const tsClient = new Date(os.atualizadoEm).getTime();
          if (tsServer > tsClient) {
            return resp({ conflito: true, servidor: existing });
          }
        }

        // Preserva o atualizadoEm do autor. Reescrever com o relógio do
        // servidor misturava duas fontes de tempo: bastava o relógio do
        // aparelho atrasar para o próprio autor receber "conflito" na
        // edição seguinte.
        const toSave = { ...os };
        await store.setJSON(os.id, toSave);
        return resp({ ok: true, os: toSave });
      }

      // ── delete: remove O.S e suas fotos ────────────────────────────────────
      case 'delete': {
        const store = blobStore('os');
        const fotosStore = blobStore('fotos');
        const { id } = body;
        if (!id) return resp({ error: 'id ausente' }, 400);

        // Apaga fotos da O.S
        const existing = await store.get(id, { type: 'json' }).catch(() => null);
        if (existing) {
          const fotoIds = [
            ...(existing.fotosCheckinIds || []),
            ...(existing.fotosRetornoIds || []),
            existing.layoutFotoId
          ].filter(Boolean);
          await Promise.all(fotoIds.map(fid => fotosStore.delete(fid).catch(() => {})));
        }

        await store.delete(id);
        return resp({ ok: true });
      }

      // ── getCfg / setCfg ─────────────────────────────────────────────────────
      case 'getCfg': {
        const store = blobStore('cfg');
        const cfg = await store.get('cfg', { type: 'json' }).catch(() => null);
        return resp({ cfg: cfg || {} });
      }

      case 'setCfg': {
        const store = blobStore('cfg');
        if (!body.cfg) return resp({ error: 'cfg ausente' }, 400);
        await store.setJSON('cfg', body.cfg);
        return resp({ ok: true });
      }

      // ── putPhoto: grava foto (base64) ───────────────────────────────────────
      case 'putPhoto': {
        const store = blobStore('fotos');
        const { base64, mime, fileId } = body;
        if (!base64) return resp({ error: 'base64 ausente' }, 400);
        const id = fileId || ('foto_' + Date.now() + '_' + Math.random().toString(36).slice(2));
        await store.setJSON(id, { base64, mime: mime || 'image/jpeg' });
        return resp({ fileId: id });
      }

      // ── deletePhoto: remove foto individual (excluída/substituída no app) ──
      case 'deletePhoto': {
        const store = blobStore('fotos');
        const { fileId } = body;
        if (!fileId) return resp({ error: 'fileId ausente' }, 400);
        await store.delete(fileId).catch(() => {});
        return resp({ ok: true });
      }

      // ── getPhoto: recupera foto ─────────────────────────────────────────────
      case 'getPhoto': {
        const store = blobStore('fotos');
        const { fileId } = body;
        if (!fileId) return resp({ error: 'fileId ausente' }, 400);
        const foto = await store.get(fileId, { type: 'json' }).catch(() => null);
        if (!foto) return resp({ error: 'Foto não encontrada' }, 404);
        return resp({ base64: foto.base64, mime: foto.mime });
      }

      default:
        return resp({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('[os.js] erro:', e);
    const msg = (e && (e.message || e.name)) || 'Erro interno';
    return resp({ error: msg, tipo: e && e.name }, 500);
  }
};

// Coleta TODAS as chaves do store percorrendo o cursor de paginação do Netlify
// Blobs. Retorna só os ids (leve), sem baixar o conteúdo de cada O.S.
async function allKeys(store) {
  const keys = [];
  let cursor;
  let guard = 0;
  do {
    const page = await store.list(cursor ? { cursor } : undefined);
    if (page && Array.isArray(page.blobs)) {
      for (const b of page.blobs) keys.push(b.key);
    }
    cursor = page && page.cursor;
    if (++guard > 5000) { console.warn('[os.js] allKeys: guard atingido'); break; }
  } while (cursor);
  return keys;
}

function resp(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}
