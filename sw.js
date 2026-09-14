// sw.js — Service worker: deixa o app abrir offline (casca/shell em cache).
// Os DADOS continuam sincronizando pela fila do store.js; aqui só cuidamos
// dos arquivos estáticos para o app carregar sem internet.
const CACHE = 'impresilk-shell-v81';
// ?v= nos arquivos do shell: a CDN do GitHub Pages (Fastly) segurou um casa.js
// velho por mais de uma hora depois do deploy (14/09/2026) enquanto servia os
// outros novos. Com a versão na URL, cada publicação é um endereço novo para a
// CDN. Regra de deploy: CACHE aqui, APP_VERSAO no config.js e o ?v= no
// index.html/equipe.html sobem JUNTOS.
const SHELL = [
  './', 'index.html', 'equipe.html', 'styles.css?v=v81',
  'config.js?v=v81', 'logo.js?v=v81', 'frases.js?v=v81', 'store.js?v=v81', 'auth.js?v=v81', 'operacao.js?v=v81', 'app.js?v=v81', 'casa.js?v=v81', 'equipe.js?v=v81',
  'manifest.json', 'icon.svg', 'favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Assets locais (core): addAll — se algum falhar, o install aborta e o
    // cache da versão anterior (íntegro) continua valendo. Antes, o allSettled
    // aceitava um shell incompleto e o activate apagava o cache bom.
    // CDN: allSettled — falha de rede externa não bloqueia a instalação.
    const core = SHELL.filter(u => !u.startsWith('http'));
    const cdn  = SHELL.filter(u => u.startsWith('http'));
    // cache:'reload' por arquivo: sem isto o SW guarda o que estava no cache
    // HTTP do navegador (o Pages manda max-age=600) e passa a SERVIR a versão
    // velha até o próximo bump — a equipe não recebe a correção recém-publicada.
    await c.addAll(core.map(u => new Request(u, { cache: 'reload' })));
    await Promise.allSettled(cdn.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('impresilk-shell-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear a API: o dado tem que ser o do momento (offline é a fila do
  // store.js que resolve). O backend é o Supabase.
  //
  // A regra do Netlify saiu em 04/08/2026: os sites do Netlify foram apagados
  // e este app passou a morar no GitHub Pages, então o caminho
  // /.netlify/functions/ não existe mais em lugar nenhum. Linha morta em
  // arquivo de cache confunde: dá a impressão de que ainda há um backend lá.
  if (url.hostname.endsWith('supabase.co')) return;

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
