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
- Provedor serverless: [Supabase (padrão deste guia) | Vercel | Cloudflare]
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
  NUVEM:   1 Edge Function do Supabase, roteadora (POST {action,...}), sobre o Postgres
  PONTE:   Service Worker network-first + cache versionado da casca

ARQUIVOS:
  index.html, app.js            → app de gestão
  equipe.html, equipe.js        → espelho + comercial
  styles.css                    → design system compartilhado pelos dois apps
  store.js                      → camada única de persistência e sync
  config.js                     → endereço do backend (API_BASE/API_FN; nada secreto)
  sw.js                         → service worker (offline)
  manifest.json                 → PWA
  supabase/functions/*-sync     → backend roteador (Edge Function)
  supabase/functions/*-<import> → (opcional) importação agendada de ERP externo
  supabase/migrations/*.sql     → tabelas, bucket e agendamento no banco
  .github/workflows/deploy.yml  → deploy do site (GitHub Pages)
  (opcional) frases.js          → conteúdo estático (frases motivacionais)

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
[F] pull(onRefresh): 'list' PAGINADO (after/nextAfter, guard anti-loop); merge por
    timestamp (só sobrescreve local se remoto mais novo); remove local o que sumiu do
    servidor MAS preserva o que está na fila; atualiza lastSync.
[G] pullCFG(): se há setCfg pendente, não sobrescreve (local é mais novo).
[H] Fotos: compressImage (canvas, max 1280px, JPEG 0.75); pushPhoto (comprime→IndexedDB→
    envia; offline enfileira só o fileId); pullPhoto (cache local→nuvem).
[I] Identidade: getUser/setUser, getExecutor/setExecutor, getLastSync.
[J] Conflito manual: aceitarServidor(remote), sobrescreverServidor(local).
[K] API: api(body)=apiFn('os',body); apiFn(fn,body,timeout=15000): POST em API_BASE + '/' +
    API_FN[fn] (config.js) com o crachá (Authorization: Bearer) e AbortController de 15s;
    aceitar 409 sem lançar.
[L] Reconexão: window 'online'→trySync(); 'offline'→status offline.
[M] Eventos: onSync(status,pending), onConflict(local,remote), on(event,fn).
[N] Backup: exportarBackup()/importarBackup() (importar limpa a fila).
[O] uuid() v4 cripto-seguro com fallback.

═══════════════════════════════════════════════════════════════════════
ARQUIVO: supabase/functions/<prefixo>-sync/index.ts  (backend roteador, Edge Function)
═══════════════════════════════════════════════════════════════════════
- banco: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), do ambiente da function.
  Tabelas (migrações): registros (colecao + id, registro jsonb), config global (uma
  linha só) e metadados; fotos num bucket privado do Storage.
- handler (Deno.serve): OPTIONS → preflight CORS; só POST (senão 405); parseia JSON
  (senão 400); autoriza pelo crachá (Authorization: Bearer, JWT conferido com o segredo
  do servidor) ou pelo x-token de máquina (header x-token OU body.token == secret),
  senão 401.
- ações: ping; list (PAGINADO NO BANCO, PAGE=150, ordenado por id, responde
  {os,total,nextAfter|null}; próxima página com after); upsert (conflito por timestamp:
  se servidor mais novo → {conflito:true,servidor} sem gravar, senão grava com
  atualizadoEm carimbado → {ok:true,os}); delete (apaga registro + fotos ligadas);
  getCfg/setCfg; putPhoto/getPhoto. resp(data,status) sempre JSON (com CORS).

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
- fetch: só GET; NUNCA cachear a API (host do Supabase; dados são da fila do cliente);
  network-first (online busca fresco e atualiza cache; offline serve cache; navegação
  cai no index.html / equipe.html).

═══════════════════════════════════════════════════════════════════════
ARQUIVO: config.js  +  deploy.yml  +  supabase/migrations  +  manifest.json
═══════════════════════════════════════════════════════════════════════
config.js: const API_BASE='https://<projeto>.supabase.co/functions/v1'; const API_FN=
  {os:'<prefixo>-sync'} (nome lógico → nome da function). NADA secreto: o arquivo vai ao
  navegador (visível no DevTools). Quem autoriza é o crachá da pessoa (login real, JWT
  assinado por segredo que só o servidor conhece).
.github/workflows/deploy.yml: a cada push na main roda os testes, copia POR GLOB só os
  arquivos do site (*.html *.css *.js manifest.json *.svg da raiz) para dist/ e publica
  no GitHub Pages. Sem build.
supabase/migrations/*.sql: tabelas com o prefixo do sistema (RLS ligada), bucket privado
  das fotos e (opcional) o job da importação (pg_cron + pg_net).
manifest.json: name, short_name, start_url ".", scope "./", display "standalone",
  orientation "portrait", theme/background color, ícone (SVG maskable).

═══════════════════════════════════════════════════════════════════════
FEATURES EXTRAS (implementar conforme o contexto)
═══════════════════════════════════════════════════════════════════════
- Foto: compressão + IndexedDB + upload assíncrono via putPhoto; ids no registro.
- WhatsApp: links wa.me/55<dígitos> no contato do cliente e no card hero do executor.
- Geolocalização: check-in automático no campo (lat/lng/precisão/ts), captura única.
- Importação de ERP (opcional): função agendada de hora em hora (pg_cron) que puxa de
  uma fonte externa e desduplica pelo identificador de NEGÓCIO (não pelo id interno)
  antes de gravar.
- Backup: exportar/importar JSON (admin).
- Conflito: ao receber {conflito:true}, oferecer [Recarregar servidor] ou [Manter o meu].
- Toasts de status; barra de status de sync (ok/pending/offline) visível.
- (opcional) Frases motivacionais.
- (opcional) Gamificação: barra de progresso da ficha + celebração ao completar.

═══════════════════════════════════════════════════════════════════════
CONFIGURAÇÃO DO BANCO (SUPABASE) — isto QUEBRA na prática
═══════════════════════════════════════════════════════════════════════
- PROJETO COMPARTILHADO: tudo deste sistema leva prefixo (tabelas, bucket, functions).
  "create table if not exists" NÃO avisa: sem prefixo, reutiliza a tabela de outro
  sistema calado; publicar uma function "sync" sobrescreve a do outro.
- RLS ligada nas tabelas e bucket privado; as functions usam a chave de serviço
  (SUPABASE_SERVICE_ROLE_KEY), que fica só no servidor.
- Publicar as functions com verify_jwt=false: o preflight CORS chega sem token e o
  gateway barraria antes; quem confere o crachá é a própria function.
- Diagnóstico por erro:
  • 401 "Entre no sistema."      → crachá ausente/vencido ou x-token errado.
  • action:"diag"                → diz se o banco e o bucket estão de pé.
  • ping ok mas list falha       → app/auth ok, problema é só no banco (tabela/migração).

═══════════════════════════════════════════════════════════════════════
DEPLOY  +  VERIFICAÇÃO
═══════════════════════════════════════════════════════════════════════
DEPLOY: GitHub (branch main) → o deploy.yml publica o site no GitHub Pages a cada push
  (o Pages é habilitado uma vez no repositório); Supabase: rodar as migrações em ordem,
  criar os secrets das functions (segredo do crachá, x-token de máquina) e publicar as
  functions com ./scripts/publicar-functions.sh (SUPABASE_ACCESS_TOKEN) — o push NÃO
  republica functions; a cada mudança, subir o número do CACHE no sw.js.
VERIFICAÇÃO (curl):
  curl -s -o /dev/null -w "%{http_code}\n" https://USUARIO.github.io/REPO/         # 200
  curl -s https://USUARIO.github.io/REPO/sw.js | grep "CACHE ="                    # versão
  curl -s -X POST https://PROJETO.supabase.co/functions/v1/PREFIXO-sync \
    -H "Content-Type: application/json" -H "x-token: TOKEN-DE-MAQUINA" \
    -d '{"action":"ping"}'                                                          # {"ok":true}
  curl ... -d '{"action":"list"}'                                                   # {"os":[...]}

═══════════════════════════════════════════════════════════════════════
ARMADILHAS (custaram tempo na prática)
═══════════════════════════════════════════════════════════════════════
1. Arquivo do site fora do pacote do Pages → 404 calado, tela vazia. Copie POR GLOB.
2. Segredo em arquivo do repositório (config.js, migração) → é público; precisa ser GIRADO.
3. Esquecer de subir o CACHE → usuários presos em versão antiga.
4. O banco corta CALADO em 1000 linhas por consulta → por isso 'list' é PAGINADO; nunca
   leia nem devolva tudo de uma vez.
5. Importação agendada parada → a lista congela sem erro na tela (mascarada pelo cache
   local); só o painel de saúde denuncia.
6. Tabela/function sem prefixo em projeto compartilhado → reutiliza/sobrescreve a de outro.
7. Function mudada no git sem publicar → o servidor segue na versão velha, calado.
8. Limpar cache de um aparelho antes dele sincronizar → perde a fila local (dados offline).
9. Status pulando etapa → calcStatus deve exigir a etapa anterior completa.
10. Edição de O.S finalizada → travar via .os-locked e ro no espelho.

═══════════════════════════════════════════════════════════════════════
ENTREGA
═══════════════════════════════════════════════════════════════════════
Implemente os arquivos com comentários explicando o PORQUÊ de cada decisão.
Comece por: modelo de dados + calcStatus → store.js → Edge Function (-sync) → app.js
(gestão) → equipe.js (espelho) → styles.css → sw.js/manifest → deploy. Mantenha o
contrato de ações estável para trocar o backend depois sem mexer no cliente (só o
endereço no config.js muda). Garanta uso confortável no CELULAR (campo, sol, uma mão).
```
