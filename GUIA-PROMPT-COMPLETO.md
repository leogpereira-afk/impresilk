# Prompt Mestre Genérico — App de Gestão de Ordens de Serviço (Offline-First PWA)

> Prompt completo e autossuficiente para construir, do zero, um sistema de gestão
> de O.S de campo: gestão + espelho do executor + visão comercial, com sincronização
> offline-first. Genérico e sem dados sensíveis — preencha a seção "Contexto".
> Cole numa sessão nova de um agente de código.

---

```
Você vai construir, do zero, um PWA "offline-first" de GESTÃO DE ORDENS DE SERVIÇO (O.S)
para uma equipe de campo. Funciona 100% sem internet e sincroniza com a nuvem ao
reconectar. São TRÊS visões do mesmo dado: gestão (escritório), espelho (executor de
campo) e comercial (somente leitura). Implemente tudo seguindo a arquitetura abaixo —
ela é testada em produção. Comente o PORQUÊ de cada decisão.

═══════════════════════════════════════════════════════════════════════
CONTEXTO DO PROJETO  (preencha antes de começar)
═══════════════════════════════════════════════════════════════════════
- Domínio do negócio: [ex.: instalação de letreiros / entregas / manutenção]
- Nome da entidade principal: [ex.: "O.S", "pedido", "chamado"]
- Etapas do fluxo (funil): [ex.: produção → liberado → agendado → confirmado → em rota → finalizado]
- Papéis de usuário: [ex.: admin, planejamento, execução, comercial]
- Quem executa em campo: [ex.: instaladores, técnicos, entregadores]
- Stack: HTML/CSS/JS puro, sem build (recomendado) ou framework de sua preferência
- Provedor serverless: [Netlify (padrão deste guia) | Vercel | Cloudflare]
- Idioma da interface: [ex.: pt-BR]

═══════════════════════════════════════════════════════════════════════
ARQUITETURA GERAL
═══════════════════════════════════════════════════════════════════════
TRÊS APPS sobre o MESMO modelo de dados e a MESMA camada de sync:
  1. GESTÃO (index.html + app.js)   → escritório: cria, planeja, controla, finaliza.
  2. ESPELHO (equipe.html + equipe.js) → campo: vê tudo estático, edita só a execução.
  3. COMERCIAL (mesma equipe.html via rota #comercial) → somente leitura.
  Deep link para abrir direto num executor: equipe.html#i=NOME.

CAMADAS:
  CLIENTE: localStorage (dados) + IndexedDB (fotos) + FILA (ações pendentes)
  NUVEM:   1 função serverless roteadora (POST {action,...}) sobre key-value store
  PONTE:   Service Worker network-first + cache versionado da casca

ARQUIVOS:
  index.html, app.js            → app de gestão
  equipe.html, equipe.js        → espelho + comercial
  styles.css                    → design system compartilhado pelos dois apps
  store.js                      → camada única de persistência e sync
  config.js                     → token do cliente (auth leve)
  sw.js                         → service worker (offline)
  manifest.json                 → PWA
  netlify/functions/os.js       → backend roteador
  netlify/functions/<import>.js → (opcional) importação agendada de ERP externo
  netlify.toml                  → deploy
  (opcional) frases.js, pops.js → conteúdo estático (frases motivacionais, procedimentos)

═══════════════════════════════════════════════════════════════════════
MODELO DE DADOS (entidade O.S)
═══════════════════════════════════════════════════════════════════════
REGRAS OBRIGATÓRIAS (a sync depende disso):
  - todo registro tem `id` estável (UUID v4 com fallback cripto-seguro);
  - todo registro tem `atualizadoEm` (ISO) atualizado a CADA escrita (árbitro de conflito);
  - `tipo`: 'externo' (fluxo completo) | 'interno' (fluxo curto, sem agenda/execução).

CAMPOS, agrupados por BLOCO (cada bloco vira um <details> recolhível no modal):
  IDENTIDADE: id, numero, criadoEm, criadoPor, atualizadoEm, atualizadoPor, tipo
  PCP/ABERTURA: cliente, contato, whatsapp (só dígitos), documento, endereco,
                servico, vendedor, dataEntrada, previsaoEntrega, responsavel,
                obs, layoutFotoId, liberado(bool), liberadoPor, liberadoEm
  ITENS: array de { item, descricao, medidas, qtde, pronto(bool),
                    statusInst:'ok'|'retrab'|'', motivo, obsProb, fotoProbId }
  AGENDA (externo): acesso(enum), fixacao(enum), ferramentas[], suprimentos[],
                    instalacao:{data,periodo(enum),hora,duracaoDias}, equipe[],
                    veiculo, responsavelAgenda[], obsAgenda
  CONFIRMAÇÃO: confirmacao:''|'Confirmado'|'Pendente'|'Recusado', canal(enum),
               hora, por, obs, acompanhante, acompanhanteContato
  EXECUÇÃO (externo): conferências (embarque/produtos/ferramentas + quemConferiu),
                      fotoEmbarqueId, carroLiberado(bool)+por+em, horaSaida,
                      horaRetorno, kmSaida, kmRetorno, instalacaoOK(bool),
                      conferidoPor, obsTecnicas, fotosCheckinIds[],
                      checkinGPS:{lat,lng,precisao,ts}, checkout:{...}
  RETRABALHO: retrabalho(bool), problema, causa(enum), resolvidoPor, dataResolvido
  FINAL: finalizadaEm, finalizadoPor
  HISTÓRICO: historico:[{etapa, em, por}]  ← log de transições p/ lead time

═══════════════════════════════════════════════════════════════════════
STATUS DERIVADO (nunca armazenado) — calcStatus(os)
═══════════════════════════════════════════════════════════════════════
Status é SEMPRE calculado a partir dos campos, nunca gravado. Cada etapa exige
a anterior completa (não pular etapa). Externo:
  finalizada      ← finalizadaEm preenchido
  em_andamento    ← confirmada E agenda completa E horaSaida
  confirmada      ← confirmacao=='Confirmado' E agenda completa
  agendada        ← data + periodo + equipe (agenda completa)
  apto            ← liberado (PCP)
  aguardando_producao ← caso base
Interno (fluxo curto): aguardando_producao → apto → finalizada.
Helpers: osTipo(os), isInterno(os), etapasDe(os) (retorna a lista de etapas do tipo).
registrarEtapa(os): quando calcStatus muda, anexa {etapa, em, por} ao historico.

═══════════════════════════════════════════════════════════════════════
ARQUIVO: store.js  (persistência + sync — o coração offline-first)
═══════════════════════════════════════════════════════════════════════
Objeto STORE (IIFE) com:
[A] localStorage com prefixo único (os, cfg, user, executor, fila, lastsync);
    lsGet/lsSet try/catch; em QuotaExceededError emitir evento 'quota'.
[B] IndexedDB para fotos: putFoto/getFoto/delFoto (objectStore keyPath 'id').
[C] CRUD offline-first: saveOS grava local NA HORA → enfileira upsert → trySync();
    deleteOS idem; getCFG/saveCFG (defaults mesclados) → enfileira setCfg.
[D] FILA com deduplicação: upsert do mesmo id substitui o anterior; delete descarta
    upserts pendentes do mesmo id e evita deletes duplicados; assinatura estável
    (_sigFila) p/ remover por valor, não por referência.
[E] trySync(): flag _syncing; pula itens em conflito (_flagged); distingue falha de
    REDE (para o ciclo, retenta depois) de erro PERMANENTE (contador _failCount,
    descarta após MAX_FAILS=25 e emite 'item-descartado'); reemite status ok/pending/offline.
[F] pull(onRefresh): 'list' PAGINADO (offset/nextOffset, guard anti-loop); merge por
    timestamp (só sobrescreve local se remoto mais novo); remove local o que sumiu do
    servidor MAS preserva o que está na fila; atualiza lastSync.
[G] pullCFG(): se há setCfg pendente, não sobrescreve (local é mais novo).
[H] Fotos: compressImage (canvas, max 1280px, JPEG 0.75); pushPhoto (comprime→IndexedDB→
    envia; offline enfileira só o fileId); pullPhoto (cache local→nuvem).
[I] Identidade: getUser/setUser, getExecutor/setExecutor, getLastSync.
[J] Conflito manual: aceitarServidor(remote), sobrescreverServidor(local).
[K] API: api(body)=apiFn('os',body); apiFn(fn,body,timeout=15000) com header x-token=TOKEN
    e AbortController de 15s; aceitar 409 sem lançar.
[L] Reconexão: window 'online'→trySync(); 'offline'→status offline.
[M] Eventos: onSync(status,pending), onConflict(local,remote), on(event,fn).
[N] Backup: exportarBackup()/importarBackup() (importar limpa a fila).
[O] uuid() v4 cripto-seguro com fallback.

═══════════════════════════════════════════════════════════════════════
ARQUIVO: netlify/functions/os.js  (backend roteador sobre key-value store)
═══════════════════════════════════════════════════════════════════════
- blobStore(name): usa env BLOBS_SITE_ID+BLOBS_TOKEN se existirem (modo MANUAL),
  senão getStore(name) (modo automático). Stores: "os", "fotos", "cfg".
- handler: só POST (senão 405); parseia JSON (senão 400); valida token
  (header x-token OU body.token == process.env.TOKEN, senão 401).
- ações: ping; list (PAGINADO, PAGE=150, lista só chaves→ordena→fatia→baixa fatia,
  responde {os,total,nextOffset|null}); upsert (conflito por timestamp: se servidor
  mais novo → {conflito:true,servidor} sem gravar, senão grava com atualizadoEm
  carimbado → {ok:true,os}); delete (apaga registro + fotos ligadas); getCfg/setCfg;
  putPhoto/getPhoto. resp(data,status) sempre JSON.

═══════════════════════════════════════════════════════════════════════
ARQUIVO: app.js  (app de GESTÃO)
═══════════════════════════════════════════════════════════════════════
NAVEGAÇÃO — abas no topo (mostrar/ocultar por papel):
  Painel (KPIs/produtividade), Cadastro/PCP (criar + liberar + itens),
  Programação (agenda: calendário ou kanban), Execução (em andamento),
  Retrabalho (defeitos por causa), Finalizados (concluídas + métricas),
  Controle (admin: usuários, executores, veículos, ferramentas, níveis),
  + (opcional) biblioteca de Procedimentos.

CARD DA O.S — osCardHTML(os):
  - cabeçalho: número + badges (atrasada ⏰, retrabalho 🔴) + badge de status;
  - linha de tipo + botão de alternar tipo (interno/externo);
  - STEPPER COMPACTO (régua de etapas, só ícones, done/cur/todo);
  - linha de tempos/datas (entrada, dias em produção, entrega, agenda);
  - equipe atribuída;
  - barra de progresso "X% preenchida" (blocosCompletos);
  - "PRÓXIMO PASSO" (proximoPasso(os) → {label, cta, acao});
  - BOTÃO CTA DINÂMICO: se ação=finalizar/exec → verde (finaliza); senão azul
    (abre o modal já no bloco relevante: pcp/agenda/confirmar/saida);
  - cor de borda por status; gradiente de fundo por urgência (urg-1..urg-6);
    classe de alerta (atraso/retrabalho).

MODAL DE DETALHE — renderModal(os):
  - header: número + badge tipo + badge status + fechar;
  - barra de trava se finalizada (.os-locked, edição bloqueada exceto .lock-allow);
  - seletor de tipo (externo/interno);
  - STEPPER COMPLETO (com rótulos e datas do histórico nos títulos);
  - tempos: "Xd desde o pedido · Yd nesta etapa";
  - PRÓXIMO PASSO em destaque; barra de progresso; legenda de blocos completos;
  - BLOCOS recolhíveis (.card-fs = <details>), cada um com classe .done quando completo:
    PCP, Itens, Agenda (externo), Execução (externo). Confirmação puxa cliente/WhatsApp
    do bloco PCP (link wa.me) — campos cliente e whatsapp marcados obrigatórios (.req).
  - AUTOSAVE: editar um campo → saveDraft() grava num rascunho de trabalho (_draft),
    registrarEtapa() se mudou de etapa, STORE.saveOS; reRender preservando blocos abertos.
  - Observação NUNCA é obrigatória para finalizar.

REGRAS DE FINALIZAÇÃO: exige blocos mínimos completos (ex.: instalacaoOK + conferidoPor
  + ≥1 foto de check-in). registrarEtapa antes de salvar.

═══════════════════════════════════════════════════════════════════════
ARQUIVO: equipe.js  (ESPELHO do executor + visão COMERCIAL)
═══════════════════════════════════════════════════════════════════════
- Tela inicial: seletor de executor (lista de CFG.executores) → "ver minhas O.S".
  Deep link #i=NOME abre direto; #comercial entra em modo somente leitura.
- Lista: CARD HERO no topo ("sua próxima O.S": primeira não finalizada por data,
  com botão Abrir + link 🗺️ Rota no mapa) + lista das O.S atribuídas/liberadas.
- Modal do executor:
  • BLOCO INFO (somente leitura, ABERTO por padrão): serviço, acesso, fixação,
    ferramentas, suprimentos, contato, obs; foto de layout; link wa.me + mapa.
  • BLOCO ITENS (editável): controle segmentado por item [Pendente][✅ Instalado]
    [🔴 Retrabalho]; se retrabalho → motivo + obs + foto.
  • BLOCO EXECUÇÃO (editável SE não finalizada): confirmação (travada até cliente
    confirmar), liberar carro/saída, horas e km, instalacaoOK + conferidoPor,
    obs técnicas, fotos de check-in (≥1), captura de GPS automática (uma vez).
- O executor NÃO finaliza nem reabre (privilégio da gestão). Quando finalizadaEm:
  ro=true → modal somente leitura (banner 🔒, inputs/botões desabilitados);
  bindModal(os, ro) aplica os-locked e, se ro, pula todos os handlers de edição.
- Comercial: vê tudo estático, sem campos de execução, badge "somente leitura".

═══════════════════════════════════════════════════════════════════════
ARQUIVO: styles.css  (DESIGN SYSTEM compartilhado)
═══════════════════════════════════════════════════════════════════════
VARIÁVEIS: paleta com primária (azul), secundária (roxo p/ interno), teal (agenda),
  âmbar (alerta), verde (sucesso/finalizada), vermelho (atraso); --bg, --surface,
  --border, --text, --muted; --radius (14px) e --radius-s (8px); --shadow/-m;
  alturas de topbar (56px) e tabs (48px). Respeitar safe-area-inset (notch).
LAYOUT: topbar sticky com blur; tabs sticky roláveis; grid de cards
  repeat(auto-fill, minmax(300px,1fr)); lista flat .os-list.
CARDS: borda-esquerda 4px por status; hover com sombra + translateY(-1px);
  badge de status canto inferior; gradiente de urgência no fundo.
MODAL: mobile = bottom-sheet (cantos arredondados só no topo); desktop ≥640px =
  centralizado, max-width ~760px; overlay escuro + blur; header sticky.
STEPPER: .stepper / .step (done|cur|todo) / .step-dot / .step-lbl / .step-sep;
  .stepper-compact (só pontos, p/ card).
PRÓXIMO PASSO: .prox-passo / .prox-passo-tag / .prox-passo-modal; .modal-tempos.
BLOCO: .card-fs (<details>) com summary + chevron animado; .done = fundo verde + ✓.
BOTÕES: .btn-primary (gradiente azul), .btn-ghost, .btn-danger, .btn-success,
  .btn-sm, .btn-xs.
SEGMENTADO/CHIPS: .seg (botões flex:1, .seg-ok.active verde, .seg-retrab.active vermelho);
  .chips-wrap/.chip (pílulas).
READ-ONLY: body.somente-leitura e #modal-os.os-locked desabilitam input/select/textarea
  (pointer-events:none + fundo apagado), escondem .edit-only, e .lock-allow escapa da trava.
BADGES de status (st-aguardando_producao..st-finalizada, st-retrabalho) com cor por etapa.
RESPONSIVO: campos colapsam p/ 1 coluna no mobile; tabela de itens vira cards (data-label);
  confirmar legibilidade no celular (uso em campo, sol, uma mão).
(opcional) Overlay de celebração ao atingir 100% da ficha (emoji + frase + confete).

═══════════════════════════════════════════════════════════════════════
ARQUIVO: sw.js  (Service Worker, offline)
═══════════════════════════════════════════════════════════════════════
- const CACHE = 'app-shell-v1' (VERSIONADO; subir o número a cada deploy de mudança).
- SHELL: todos os estáticos (html, css, js, manifest, ícone, libs CDN com allSettled).
- install: cachear shell + skipWaiting. activate: apagar caches != CACHE + clients.claim.
- fetch: só GET; NUNCA cachear /.netlify/functions/ (dados são da fila do cliente);
  network-first (online busca fresco e atualiza cache; offline serve cache; navegação
  cai no index.html / equipe.html).

═══════════════════════════════════════════════════════════════════════
ARQUIVO: config.js  +  netlify.toml  +  manifest.json
═══════════════════════════════════════════════════════════════════════
config.js: const TOKEN='<senha-secreta>'; comentário avisando que o MESMO valor tem de
  estar como env var TOKEN no provedor. AVISO honesto: o token vai ao navegador (visível
  no DevTools) — protege contra acesso casual/bots, NÃO é segurança forte; p/ dados
  sensíveis usar login real (sessão/JWT) com segredo só no servidor.
netlify.toml: [build] publish="."; [functions] directory="netlify/functions";
  (opcional) [functions."<import>"] schedule="@hourly"; headers X-Frame-Options=DENY +
  X-Content-Type-Options=nosniff.
manifest.json: name, short_name, start_url ".", scope "./", display "standalone",
  orientation "portrait", theme/background color, ícone (SVG maskable).

═══════════════════════════════════════════════════════════════════════
FEATURES EXTRAS (implementar conforme o contexto)
═══════════════════════════════════════════════════════════════════════
- Foto: compressão + IndexedDB + upload assíncrono via putPhoto; ids no registro.
- WhatsApp: links wa.me/55<dígitos> no contato do cliente e no card hero do executor.
- Geolocalização: check-in automático no campo (lat/lng/precisão/ts), captura única.
- Importação de ERP (opcional): função agendada @hourly que puxa de uma fonte externa
  e desduplica pelo identificador de NEGÓCIO (não pelo id interno) antes de gravar.
- Backup: exportar/importar JSON (admin).
- Conflito: ao receber {conflito:true}, oferecer [Recarregar servidor] ou [Manter o meu].
- Toasts de status; barra de status de sync (ok/pending/offline) visível.
- (opcional) Frases motivacionais e biblioteca de Procedimentos (POPs) estáticos.
- (opcional) Gamificação: barra de progresso da ficha + celebração ao completar.

═══════════════════════════════════════════════════════════════════════
CONFIGURAÇÃO DO BANCO (NETLIFY BLOBS) — isto QUEBRA na prática
═══════════════════════════════════════════════════════════════════════
- Modo MANUAL (env BLOBS_SITE_ID+BLOBS_TOKEN) ou AUTOMÁTICO (getStore sem args).
- O automático só funciona se o site tiver contexto de Blobs provisionado; senão dá
  "MissingBlobsEnvironmentError" → use o modo MANUAL.
- Configurar manual: gerar Personal Access Token (User settings → Applications), pegar
  o Site ID (Site details), criar env vars BLOBS_TOKEN e BLOBS_SITE_ID (scopes Functions
  + Runtime), NÃO apagar a env TOKEN, e REDEPLOYAR.
- Diagnóstico por erro no action:list:
  • "BlobsInternalError ...401"  → BLOBS_TOKEN vencido → gerar novo → redeploy.
  • "MissingBlobsEnvironmentError"→ faltam env vars → criar (modo manual) → redeploy.
  • "Não autorizado"             → TOKEN errado/ausente ou deploy em andamento.
  • ping ok mas list falha       → app/auth ok, problema é só no Blobs.
- LEMBRE: tokens manuais EXPIRAM; sync para "do nada" (aparelho novo vazio, aparelho
  antigo "ok" pelo cache local). Suspeite primeiro de BLOBS_TOKEN vencido.

═══════════════════════════════════════════════════════════════════════
DEPLOY  +  VERIFICAÇÃO
═══════════════════════════════════════════════════════════════════════
DEPLOY: GitHub (branch main) → Netlify (Import from GitHub; branch main; base directory
  vazio ou subpasta se o netlify.toml estiver nela; build vazio; publish "."); criar env
  var TOKEN (= config.js) → redeploy; ativar Blobs; cada push redeploya; a cada mudança,
  subir o número do CACHE no sw.js.
VERIFICAÇÃO (curl):
  curl -s -o /dev/null -w "%{http_code}\n" https://SEUSITE.netlify.app/            # 200
  curl -s https://SEUSITE.netlify.app/sw.js | grep "CACHE ="                       # versão
  curl -s -X POST https://SEUSITE.netlify.app/.netlify/functions/os \
    -H "Content-Type: application/json" -H "x-token: SUA-SENHA" \
    -d '{"action":"ping"}'                                                          # {"ok":true}
  curl ... -d '{"action":"list","offset":0}'                                        # {"os":[...]}

═══════════════════════════════════════════════════════════════════════
ARMADILHAS (custaram tempo na prática)
═══════════════════════════════════════════════════════════════════════
1. URL/base directory errados → 404 no site inteiro. Confirme o subdomínio REAL.
2. TOKEN diferente entre config.js e a env var → 401 em todas as chamadas.
3. Esquecer de subir o CACHE → usuários presos em versão antiga.
4. Resposta da função > ~6 MB → por isso 'list' é PAGINADO; nunca devolva tudo de uma vez.
5. BLOBS_TOKEN vencido → 401 do Blobs; sync para silenciosa (mascarada pelo cache local).
6. Apagar BLOBS_* achando que há contexto automático quando não há → MissingBlobs.
7. Mudar env var sem redeployar → não vale; sempre Trigger deploy depois.
8. Limpar cache de um aparelho antes dele sincronizar → perde a fila local (dados offline).
9. Status pulando etapa → calcStatus deve exigir a etapa anterior completa.
10. Edição de O.S finalizada → travar via .os-locked e ro no espelho.

═══════════════════════════════════════════════════════════════════════
ENTREGA
═══════════════════════════════════════════════════════════════════════
Implemente os arquivos com comentários explicando o PORQUÊ de cada decisão.
Comece por: modelo de dados + calcStatus → store.js → os.js → app.js (gestão) →
equipe.js (espelho) → styles.css → sw.js/manifest → deploy. Mantenha o contrato de
ações estável para trocar o backend depois (Blobs → Firebase/Supabase/KV) sem mexer
no cliente. Garanta uso confortável no CELULAR (campo, sol, uma mão).
```
