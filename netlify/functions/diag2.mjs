// diag2 — sonda temporária: em Functions 2.0 (ESM) o runtime injeta o
// contexto do Netlify Blobs automaticamente? Se sim, dá para aposentar o
// BLOBS_TOKEN manual (que expira) nas funções principais.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const token = req.headers.get('x-token');
  if (!process.env.TOKEN || token !== process.env.TOKEN) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const out = {};
  try {
    const s = getStore('os');
    const r = await s.list();
    out.auto_v2 = 'ok (' + ((r && r.blobs) ? r.blobs.length : '?') + ' chaves)';
  } catch (e) {
    out.auto_v2 = 'ERR: ' + ((e && (e.message || e.name)) || e);
  }
  return Response.json(out);
};
