// sw.js — Service worker: deixa o app abrir offline (casca/shell em cache).
// Os DADOS continuam sincronizando pela fila do store.js; aqui só cuidamos
// dos arquivos estáticos para o app carregar sem internet.
const CACHE = 'impresilk-shell-v30';
const SHELL = [
  './', 'index.html', 'equipe.html', 'styles.css',
  'config.js', 'logo.js', 'frases.js', 'store.js', 'pops.js', 'app.js', 'equipe.js',
  'manifest.json', 'icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // allSettled: se um recurso (ex.: CDN) falhar, não quebra a instalação.
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear a API — o store.js já trata offline pela fila.
  if (url.pathname.includes('/.netlify/functions/')) return;

  // Network-first: online pega a versão nova e atualiza o cache;
  // offline cai no cache (e a navegação volta para o index/equipe).
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && url.origin === location.origin) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return (await caches.match('index.html')) ||
               (await caches.match('equipe.html')) ||
               Response.error();
      }
      return Response.error();
    }
  })());
});
