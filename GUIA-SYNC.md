# Guia de Sincronização Offline-First — Prompt Mestre

> Prompt completo e autossuficiente para replicar a infraestrutura de
> sincronização (offline + online) em projetos futuros. Cole numa sessão nova
> e preencha a seção "Contexto do projeto".

---

```
Você vai construir, do zero, a infraestrutura completa de uma aplicação web PWA
"offline-first": funciona 100% sem internet e reconcilia com a nuvem ao reconectar.
Implemente tanto a camada do cliente quanto a serverless, com comentários explicando
cada decisão. Siga RIGOROSAMENTE a arquitetura abaixo — ela é testada em produção.

═══════════════════════════════════════════════════════════════════════
CONTEXTO DO PROJETO  (preencha antes de começar)
═══════════════════════════════════════════════════════════════════════
- Nome do app / domínio do negócio: [ex.: controle de ordens de serviço]
- Entidade principal e seus campos: [ex.: "os" com cliente, status, itens…]
- Stack do front-end: [HTML/JS puro | React | etc. — se puro, sem build]
- Provedor serverless: [Netlify (padrão deste guia) | Vercel | Cloudflare]
- Precisa de importação automática externa (cron)? [sim/não — qual fonte]
- Perfil de usuários: [equipe interna conhecida | público amplo]  ← afeta a auth

═══════════════════════════════════════════════════════════════════════
ARQUITETURA EM 3 CAMADAS
═══════════════════════════════════════════════════════════════════════
CLIENTE (navegador):
  • localStorage → dados estruturados (registros + config + identidade)
  • IndexedDB    → arquivos binários/imagens (base64)
  • FILA         → lista persistente de ações pendentes (no localStorage)
NUVEM (serverless):
  • 1 função HTTP roteadora que recebe POST { action, ...payload }
  • key-value store por trás (1 registro = 1 blob; chave = id)
  • autenticação por token (header x-token == env TOKEN)
PONTE OFFLINE:
  • Service Worker network-first + cache versionado da "casca" (shell)

═══════════════════════════════════════════════════════════════════════
REGRAS DO MODELO DE DADOS  (obrigatórias para a sync funcionar)
═══════════════════════════════════════════════════════════════════════
- Todo registro tem `id` estável → UUID v4 com fallback cripto-seguro
  (crypto.randomUUID → crypto.getRandomValues → Math.random).
- Todo registro tem `atualizadoEm` (ISO string), atualizado a CADA escrita.
  Esse campo é o árbitro de conflitos (last-write-wins por timestamp).

═══════════════════════════════════════════════════════════════════════
ARQUIVO 1 — store.js  (camada única de persistência e sync no cliente)
═══════════════════════════════════════════════════════════════════════
Exponha um objeto STORE (IIFE) com TODAS estas capacidades:

[A] Chaves e helpers de localStorage
  - Prefixo único por app (ex.: "app_os", "app_cfg", "app_user", "app_fila",
    "app_lastsync").
  - lsGet/lsSet com try/catch; em QuotaExceededError, emitir evento 'quota'.

[B] IndexedDB para fotos
  - openDB (1 objectStore "fotos", keyPath "id"); putFoto/getFoto/delFoto.

[C] CRUD offline-first
  - getAllOS/getOS; saveOS(os): grava local NA HORA → enfileira {action:'upsert'}
    → dispara trySync(). deleteOS(id): idem com {action:'delete'}.
  - getCFG/saveCFG: config global com defaults mesclados; saveCFG enfileira
    {action:'setCfg'}.

[D] FILA inteligente com deduplicação
  - _enqueue: upsert do mesmo id SUBSTITUI o anterior na fila (só a versão mais
    nova importa); delete DESCARTA upserts pendentes do mesmo id e evita deletes
    duplicados.
  - Assinatura estável por item (_sigFila) para poder remover por valor, não por
    referência (getQueue re-parseia o localStorage e cria objetos novos).

[E] trySync() — envia a fila pendente
  - flag _syncing impede execução concorrente.
  - se fila vazia → emite status 'ok'; se navigator.onLine false → 'offline'.
  - percorre item a item:
      · putPhoto: pega base64 do IndexedDB se não vier no item; envia; remove da fila.
      · upsert/delete/setCfg: chama a API.
  - CONFLITO: se a resposta tiver {conflito:true}, marcar o item em _flagged,
    PULAR (continue) para não travar a fila inteira, e disparar onConflict.
  - distinguir FALHA DE REDE (parar o ciclo e retentar no próximo gatilho) de
    ERRO PERMANENTE do item (contador _failCount por assinatura; ao atingir
    MAX_FAILS=25, descartar o item e emitir 'item-descartado' para não inchar o
    localStorage para sempre).  Regra prática: erro é de rede se a mensagem não
    começa com "HTTP " OU casa /HTTP 5\d\d/.
  - ao final, reemitir status (ok/pending/offline) com a contagem restante.

[F] pull(onRefresh) — baixa do servidor e mescla
  - se offline, retorna. Percorre o endpoint 'list' PAGINADO via offset/nextOffset
    (trava de segurança de guard para evitar loop infinito; avisar 'pull-truncado').
  - merge por timestamp: registro novo no remoto → adiciona; existente → só
    sobrescreve local se tsRemote > tsLocal.
  - após varrer TODAS as páginas: remover do local os registros que sumiram do
    servidor (apagados em outro aparelho), MAS preservar os que ainda estão na
    fila aguardando envio (criados offline).
  - se mudou algo, gravar e atualizar lastSync; chamar onRefresh().

[G] pullCFG() — baixa config
  - se houver setCfg pendente na fila, NÃO sobrescrever (local é mais novo);
    senão mesclar a cfg remota sobre a local.

[H] Fotos
  - compressImage(file): canvas, max 1280px, JPEG 0.75, retorna dataURL.
  - pushPhoto(file): comprime → salva no IndexedDB → tenta enviar; se offline,
    enfileira só o fileId (base64 já está local). Retorna o fileId.
  - pullPhoto(fileId): cache local primeiro; senão busca na nuvem e cacheia.

[I] Identidade local: getUser/setUser, getInstalador/setInstalador, getLastSync.

[J] Resolução manual de conflito
  - aceitarServidor(remoteOS): grava o remoto local, remove o item da fila, limpa _flagged.
  - sobrescreverServidor(localOS): atualiza atualizadoEm, limpa _flagged, re-salva (re-enfileira).

[K] Camada de API
  - api(body) = apiFn('os', body).
  - apiFn(fn, body, timeoutMs=15000): fetch POST /.netlify/functions/<fn> com header
    x-token=TOKEN e AbortController de 15s (em sinal fraco, onLine pode ser true mas o
    fetch trava). Aceitar 409 sem lançar (é o código de conflito).

[L] Reconexão automática
  - window 'online' → trySync(); window 'offline' → emitir status 'offline'.

[M] Eventos: onSync(status,pending), onConflict(local,remote), on(event,fn) genérico.

[N] Backup: exportarBackup() {versao, exportadoEm, os, cfg}; importarBackup(data)
    grava os/cfg, LIMPA a fila (ids que sumiram virariam erro eterno) e limpa _flagged/_failCount.

═══════════════════════════════════════════════════════════════════════
ARQUIVO 2 — netlify/functions/os.js  (backend roteador sobre key-value store)
═══════════════════════════════════════════════════════════════════════
- Helper blobStore(name): tenta o contexto automático do provedor; fallback com
  env BLOBS_SITE_ID/BLOBS_TOKEN.
- handler: só aceita POST (senão 405); parseia JSON (senão 400); valida token
  (header x-token OU body.token == process.env.TOKEN, senão 401).
- Ações:
  • ping        → {ok:true}
  • list        → PAGINADO: PAGE=150; lista só as chaves (leve), ordena, fatia por
                  offset, baixa só a fatia; responde {os, total, nextOffset|null}.
  • upsert      → detecção de conflito: se o registro no servidor for MAIS NOVO que
                  o enviado (compara atualizadoEm), responder {conflito:true, servidor}
                  SEM gravar; senão gravar com atualizadoEm carimbado no servidor e
                  responder {ok:true, os}.
  • delete      → apagar o registro E os arquivos/fotos ligados a ele (ids de fotos
                  embutidos no registro).
  • getCfg/setCfg → config global num store separado ("cfg", chave fixa "cfg").
  • putPhoto/getPhoto → store "fotos"; grava/recupera {base64, mime}.
- allKeys(store): percorre o cursor de paginação do store coletando só as chaves,
  com guard de segurança.
- helper resp(data, status=200) → JSON com Content-Type.

═══════════════════════════════════════════════════════════════════════
ARQUIVO 3 — sw.js  (Service Worker, abrir offline)
═══════════════════════════════════════════════════════════════════════
- const CACHE = 'app-shell-v1' (VERSIONADO).
- SHELL: lista dos estáticos a pré-cachear (html, css, js, manifest, ícones, libs CDN).
- install: caches.open + Promise.allSettled(SHELL) (se um CDN falhar, não quebra a
  instalação) + skipWaiting.
- activate: apagar todos os caches com nome != CACHE + clients.claim
  (força os aparelhos a baixarem a versão nova).
- fetch: só GET. NUNCA cachear /.netlify/functions/ (dados são da fila do cliente).
  Estratégia network-first: online busca fresco e atualiza o cache (só mesma origem
  e res.ok); offline cai no cache; navegação cai no index.html.

═══════════════════════════════════════════════════════════════════════
ARQUIVO 4 — config.js  (token do cliente)
═══════════════════════════════════════════════════════════════════════
- const TOKEN = '<senha-secreta>';
- Comentário avisando que o MESMO valor tem de estar como env var TOKEN no provedor.
- AVISO de segurança honesto: como config.js vai ao navegador, o token é VISÍVEL no
  DevTools. Protege contra acesso casual/bots, mas NÃO é segurança forte. Para dados
  sensíveis/público amplo, usar login real (sessão/JWT) com segredo só no servidor.

═══════════════════════════════════════════════════════════════════════
ARQUIVO 5 — netlify.toml
═══════════════════════════════════════════════════════════════════════
[build] publish = "."   (sem build command; app estático)
[functions] directory = "netlify/functions"
(opcional) [functions."<nome-sync>"] schedule = "@hourly"   ← cron na nuvem
[[headers]] for="/*" → X-Frame-Options="DENY", X-Content-Type-Options="nosniff"

═══════════════════════════════════════════════════════════════════════
ARQUIVO 6 (opcional) — função agendada (cron)
═══════════════════════════════════════════════════════════════════════
Se o projeto precisar importar dados de uma fonte externa de tempos em tempos:
- exports.handler sem args; roda no schedule do netlify.toml.
- reaproveita a função principal via fetch interno (base = env URL/DEPLOY_URL).
- desduplica pelo identificador de negócio (não pelo id interno) antes de gravar
  os registros NOVOS no store.

═══════════════════════════════════════════════════════════════════════
PASSO A PASSO DE DEPLOY  (documente como instruções para mim)
═══════════════════════════════════════════════════════════════════════
1. Subir o código no GitHub (branch main).
2. Netlify → Add new site → Import from GitHub → escolher o repo.
   Branch=main; Base directory=<vazio ou subpasta se o netlify.toml estiver nela>;
   Build command=vazio; Publish directory=".".
3. Site configuration → Environment variables → criar TOKEN (mesmo valor do config.js)
   → REDEPLOYAR (env var só vale após novo deploy).
4. Confirmar/ativar Netlify Blobs.
5. Cada push na main redeploya sozinho. A cada mudança, SUBIR o número do CACHE no sw.js.

═══════════════════════════════════════════════════════════════════════
VERIFICAÇÃO PÓS-DEPLOY  (forneça os comandos)
═══════════════════════════════════════════════════════════════════════
curl -s -o /dev/null -w "%{http_code}\n" https://SEUSITE.netlify.app/            # espera 200
curl -s https://SEUSITE.netlify.app/sw.js | grep "CACHE ="                       # versão certa
curl -s -X POST https://SEUSITE.netlify.app/.netlify/functions/os \
  -H "Content-Type: application/json" -H "x-token: SUA-SENHA" \
  -d '{"action":"ping"}'                                                          # espera {"ok":true}

═══════════════════════════════════════════════════════════════════════
ARMADILHAS A DESTACAR NO FINAL  (custaram tempo na prática)
═══════════════════════════════════════════════════════════════════════
1. URL/base directory errados → 404 no site inteiro. Confirme o subdomínio
   .netlify.app REAL (pode diferir do nome do repo).
2. TOKEN diferente entre config.js e a env var do provedor → 401 em todas as chamadas.
3. Esquecer de subir o número do CACHE → usuários presos numa versão antiga em cache.
4. Limite de ~6 MB por resposta da função → por isso 'list' é paginado; nunca devolva
   tudo de uma vez.

═══════════════════════════════════════════════════════════════════════
ENTREGA
═══════════════════════════════════════════════════════════════════════
Implemente os 6 arquivos com comentários explicando o PORQUÊ de cada decisão.
Ao final, liste (a) o passo a passo do painel e (b) os comandos de verificação.
Mantenha o contrato de ações estável para o backend poder ser trocado depois
(Netlify Blobs → Firebase/Supabase/KV) sem mexer no cliente.
```
