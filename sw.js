// sw.js — Service worker: deixa o app abrir offline (casca/shell em cache).
// Os DADOS continuam sincronizando pela fila do store.js; aqui só cuidamos
// dos arquivos estáticos para o app carregar sem internet.
const CACHE = 'impresilk-shell-v163';
// ?v= nos arquivos do shell: a CDN do GitHub Pages (Fastly) segurou um casa.js
// velho por mais de uma hora depois do deploy (14/09/2026) enquanto servia os
// outros novos. Com a versão na URL, cada publicação é um endereço novo para a
// CDN. Regra de deploy: CACHE aqui, APP_VERSAO no config.js e o ?v= no
// index.html/equipe.html sobem JUNTOS.
const SHELL = [
  './', 'index.html', 'equipe.html', 'ranking.html', 'ranking.js?v=v163', 'ranking.css?v=v163', 'performance-dashboards.js?v=v163', 'performance-dashboards.css?v=v163', 'styles.css?v=v163', 'performance-layout.css?v=v163',
  'config.js?v=v163', 'logo.js?v=v163', 'frases.js?v=v163', 'privacidade-valores.js?v=v163', 'store.js?v=v163', 'auth.js?v=v163', 'operacao.js?v=v163', 'operacao-revisao.js?v=v163', 'divisao.js?v=v163', 'regras.js?v=v163', 'entrega-item.js?v=v163', 'conferencia-entrega.js?v=v163', 'conferencia-entrega-ui.js?v=v163', 'controle-entrega-ui.js?v=v163', 'diagnostico-itens.js?v=v163', 'alertas-sync.js?v=v163', 'relatorios-pcp.js?v=v163', 'app.js?v=v163', 'casa.js?v=v163', 'demandas.js', 'demandas.css', 'comissao.js?v=v163', 'comissao-ui.js?v=v163', 'performance.js?v=v163', 'alocacao-ui.js?v=v163', 'lote.js?v=v163', 'entregas-os.js?v=v163', 'relatorios-entregas.js?v=v163', 'equipe.js?v=v163',
  'manifest.json', 'icon.svg', 'favicon.svg',
  // Logos das 10 equipes (29/09/2026): arquivo do site, não da configuração.
  'equipe-aguia.webp', 'equipe-leao.webp', 'equipe-pantera.webp', 'equipe-lobo.webp', 'equipe-tigre.webp', 'equipe-falcao.webp', 'equipe-carcara.webp', 'equipe-onca.webp', 'equipe-lobo-guara.webp', 'equipe-touro.webp'
];

// Grava a casca da versão. Usado no install e para recompor o cache quando
// outro sistema da mesma origem o apagou (ver o fetch).
async function guardarCasca() {
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
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await guardarCasca();
    self.skipWaiting();
  })());
});

// Página guardada para a navegação: a própria, senão a casca da versão.
async function paginaGuardada(req) {
  return (await caches.match(req)) ||
         (await caches.match('index.html')) ||
         (await caches.match('equipe.html'));
}

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
  if (url.hostname.endsWith('supabase.co')) return;

  // Network-first: online pega a versão nova e atualiza o cache;
  // offline cai no cache (e a navegação volta para o index/equipe).
  e.respondWith((async () => {
    /* SINAL FRACO NÃO É SEM SINAL. O cache só entrava quando a rede FALHAVA;
       com uma barra ela não falha, fica pendurada, e o instalador via tela
       branca na frente do cliente com o app inteiro guardado no celular.
       Arquivo com versão no endereço não muda dentro da versão: vem do cache
       direto. A página corre contra 3 s e, se a rede demorar, abre com a
       guardada; a versão nova continua chegando pelo install do sw.js novo. */
    if (url.origin === location.origin && url.searchParams.has('v')) {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
    }
    const rede = fetch(req);
    if (req.mode === 'navigate') {
      const lenta = await Promise.race([
        rede.then(() => false, () => false),
        new Promise(r => setTimeout(() => r(true), 3000))
      ]);
      if (lenta) {
        const pagina = await paginaGuardada(req);
        // Sem nada guardado, esperar a rede ainda é melhor que a tela de erro.
        if (pagina) { rede.catch(() => {}); return pagina; }
      }
    }
    try {
      const fresh = await rede;
      /* O HTML NÃO ENTRA NO CACHE DE UMA VERSÃO ANTIGA.
         Os .js/.css entram no SHELL com `?v=vNN`, mas o index.html/equipe.html
         entram sem versão — e este `put` gravava QUALQUER resposta no cache da
         versão ATIVA. Bastava abrir o app depois de um deploy para o index novo
         (que pede os scripts da versão NOVA) ser gravado por cima do antigo
         dentro do cache VELHO, que só tem os scripts da anterior. Sem internet o
         app abria MORTO: HTML de uma versão, scripts de outra, sem CSS e sem
         aviso. Navegação agora só vem do SHELL da própria versão. */
      if (fresh && fresh.ok && url.origin === location.origin && req.mode !== 'navigate') {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
      }
      /* CACHE APAGADO POR OUTRO SISTEMA DA MESMA ORIGEM. RH, Brief, DRE e
         Compras moram em leogpereira-afk.github.io e, ao ativar, apagam todo
         cache que não é o deles, inclusive este. A navegação não volta ao
         cache (ver acima), então o PCP ficava só com internet até a próxima
         versão. Página que veio da rede e casca faltando: grava de novo. */
      if (req.mode === 'navigate' && fresh && fresh.ok) {
        const recompor = (async () => {
          try { if (!(await caches.match('equipe.html', { cacheName: CACHE }))) await guardarCasca(); } catch {}
        })();
        try { e.waitUntil(recompor); } catch { /* navegador que não estende: roda mesmo assim */ }
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') return (await paginaGuardada(req)) || Response.error();
      /* ÚLTIMO RECURSO: o mesmo arquivo de outra versão.
         Se o install da versão nova abortou (o addAll é tudo-ou-nada e uma
         queda de rede basta), o HTML pode pedir `casa.js?v=<versão nova>`
         enquanto o cache só tem `?v=<versão anterior>`. (Sem os colchetes
         aqui, a troca de versão do deploy reescreve este comentário junto e
         as duas pontas viram a MESMA versão -- foi o que aconteceu durante
         várias publicações, até setembro de 2026, e deixava a explicação sem
         sentido nenhum.) `caches.match` casa a URL inteira, então isso
         dava miss e `Response.error()` — tela branca, calada, na fábrica.
         Servir o arquivo da versão anterior deixa o app ABRIR; a tarja de
         versão nova avisa para recarregar assim que houver internet. */
      const deOutraVersao = await caches.match(req, { ignoreSearch: true });
      if (deOutraVersao) return deOutraVersao;
      return Response.error();
    }
  })());
});
