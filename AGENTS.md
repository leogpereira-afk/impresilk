# PCP Impresilk: regras para qualquer agente (Claude, Codex ou outro)

Este arquivo e o CLAUDE.md têm o MESMO texto: o Codex lê o AGENTS.md, o Claude
lê o CLAUDE.md. Mudou um, copie no outro; `tests/agentes.test.cjs` falha se
divergirem. A sua memória (~/.claude/... ou ~/.codex/memories) é só sua: o
outro agente não a vê. Tudo o que o outro precisa saber mora neste repositório.
Se a sua memória, ou um plano fora daqui, disser outra coisa, vale o que está
aqui.

## 0. Antes de mexer em qualquer coisa, nesta ordem

1. Trabalhe num clone ou worktree FORA do iCloud (ex.: ~/Projetos ou /tmp). A
   pasta Dre fica no iCloud, que devolve leitura atrasada e despeja arquivos:
   nada de commit nem push de um clone dentro da Dre.
2. `git fetch origin` e `node scripts/vez.cjs` (mostra a vez lida da
   origin/main). Se a vez for de outro agente, ou de outra sessão sua, PARE e
   pergunte ao dono. Não existe "só um ajuste rápido" em paralelo.
   Se o dono disser no chat que libera: `node scripts/vez.cjs liberar "<frase
   dele>"` e o push que o comando imprimir. A Passagem de quem parou fica.
3. Leia a Passagem (`git show origin/main:VEZ.md`; as anteriores ficam em
   docs/passagens/), o `docs/DECISOES.md` (confirmadas e pendentes), o
   `docs/RAMOS.md` (o que NÃO juntar) e o plano da frente em `docs/planos/`
   que não esteja marcado SUPERADO. Os planos de antes de 11/10/2026 estão na
   raiz de docs/ (ex.: plano-auditoria-pcp-2026-10-03.md, DEMANDAS-2026-10-08.md).
4. Olhe o último Deploy deste repositório e o último functions.yml do painel:
   `gh run list -R leogpereira-afk/impresilk -w deploy.yml -L 3` e
   `gh run list -R leogpereira-afk/painel-impresilk -w functions.yml -L 3`
   (neste Mac o gh fica em ~/apps/bin/gh). Vermelho é a primeira coisa a
   resolver: token de publicar já venceu calado.
5. Pegue a vez: `node scripts/vez.cjs pegar <claude|codex> "tarefa"
   [--versao vNNN] [--arquivos "app.js performance.js"]`. Ele monta o commit
   do VEZ.md (e da Passagem anterior em docs/passagens/) em cima da
   origin/main, sem mexer no seu ramo nem no disco, e imprime
   `git push origin <sha>:main`. Faça esse push ANTES de tocar em código: a vez
   só é sua depois dele. Push recusado = alguém mexeu na vez antes: rode
   `node scripts/vez.cjs` de novo; nunca junte o VEZ.md à mão. A sessão fica
   guardada no git-dir da pasta onde você rodou o pegar: rode o passar na
   mesma pasta (ou com `VEZ_SESSAO=<id>`, o id do campo sessao do VEZ.md).
   Esse push (só VEZ.md e docs/passagens/) roda o Deploy, que republica o
   mesmo site e confere a vez: espere ele ficar verde antes de disparar o
   functions.yml do painel (o painel só publica o servidor da main que é o
   último Deploy verde). É a única exceção ao "publicar só com o pode
   publicar do dono". O Claude pede no chat o OK para ele: o modo automático
   do Claude barra push na main sem o OK.
6. Trabalhe num ramo a partir da origin/main (`git fetch origin && git
   switch -c <ramo> origin/main`). No ramo de trabalho o VEZ.md não muda: ele
   só muda pelo vez.cjs, sempre em cima da origin/main.

## 1. Regras da casa (garantias do sistema)

- O repositório é PÚBLICO. Nenhum dado real nem segredo em teste, doc, commit
  ou print: nada de nome de pessoa, CPF, ID do RH, número de O.S. real, valor em
  R$ de O.S. ou de cliente, token. Use dados fictícios e diga que são.
  (Há dado real antigo em docs/ e tests/: M27 da auditoria de 11/10, em
  docs/planos/2026-10-11-auditoria-v164.md.)
- A pessoa é o ID de 6 dígitos do RH. O nome só aparece na tela.
- Campo que decide dinheiro: só admin e pcp gravam; autor e hora são carimbados
  pelo servidor; campo ausente no envio nunca apaga; valor inválido é descartado
  com aviso e registrado no diário. NUNCA responder 422 em gravação que passa
  pela fila do aparelho: 422 prende a fila.
- O crachá sem senha (toque, instalador) só grava execução e recebe O.S.
  podadas. R$ e percentuais de colegas não descem para crachá sem senha nem
  para montagem/operação.
- Offline no celular e no tablet: todo .js ou .css novo da raiz entra no
  index.html, equipe.html ou ranking.html que o usa E no SHELL do sw.js.
- Mês fechado não se recalcula. Legado se lê, não se reescreve às escondidas.
  Nada de UPDATE/DELETE automático em dado real. No banco de produção o agente
  só faz SELECT; escrita em produção é pela tela, pelo dono.
- Textos ao usuário em português do Brasil, sem travessão (—) em frase.
- Baixa do ERP não prova entrega física.
- As regras de comissão, ranking e falha que valem estão em `docs/DECISOES.md`.
  Se um plano disser outra coisa, vale a DECISÃO mais nova. Pergunta pendente
  (P-NNN) não é regra: enquanto ela estiver aberta, não mude o comportamento
  que ela decide.

## 2. Versão, verificação e publicação

- Versão: `node scripts/subir-versao.cjs --proxima`. Troca os 83 lugares
  (APP_VERSAO, CACHE e todo `?v=` da raiz) e falha sem gravar se algum
  divergir, se o número já existe na origin/main ou se o ramo não contém a
  main. Nunca suba versão à mão. Reserve o número ao pegar a vez (`--versao`).
- Antes do push: `npm run verificar` com Node 22.13 ou mais novo (neste Mac:
  ~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node, v24;
  o ~/apps/node20 não serve para a suíte, e o verificar.cjs avisa). Vermelho
  não sobe.
- Antes do push na main, também `node scripts/vez.cjs conferir
  origin/main..HEAD` (o mesmo passo da CI). Vermelho não sobe: um commit fora
  da vez que chega na main trava o site até o dono aceitar. Ramo atrás da main
  (ou nascido antes do protocolo): `git rebase origin/main` e depois
  `subir-versao --proxima`; nunca `git merge` com a mensagem padrão do git,
  que sai sem a linha `Agente:` (o mesmo vale para revert e cherry-pick).
- Push na main É publicação: o Pages publica a tela na hora. Ordem: migration,
  depois o servidor, por último a tela.
- O servidor do PCP sobe pelo repositório painel-impresilk: disparo manual do
  `functions.yml` com `pcp_ref`, de carona em push de lá que mexe em
  supabase/functions, e o `functions-sistemas.yml` de hora em hora (que
  compara a DATA do commit com a da versão no ar, não o código). A trava
  desses workflows (patch em docs/patches/painel-trava-pcp-ref.patch) ainda
  NÃO está na origem do painel; até estar, confira à mão antes de disparar:
  `git merge-base --is-ancestor origin/main <ramo>`, o último Deploy daqui
  verde, e `npm run verificar` no ramo.
- Depois de publicar o servidor, confira a versão no ar (list_edge_functions)
  e que ela é a do commit publicado: o cron e a carona podem republicar.
- Publicar só depois do "pode publicar" do dono, dito para esta tarefa.
- Mudou `supabase/functions/_shared`? Publique pcp-sync e pcp-mubisys juntos.
- Nunca `[skip ci]` em commit que muda código. Nunca push --force na main.

## 3. Onde ficam planos, decisões e registros

- Plano: `docs/planos/AAAA-MM-DD-assunto.md`. Plano que mora fora daqui (pasta
  Dre, memória de agente, conversa) não vale: copie para cá antes de seguir.
  O da auditoria de 11/10/2026 é docs/planos/2026-10-11-auditoria-v164.md.
- Decisão do dono: `docs/DECISOES.md`. Uma entrada por decisão: número D-NNN,
  data, a regra (com a frase do dono entre aspas quando houver), a fonte, quem
  registrou, onde foi aplicada. Só se acrescenta. Decisão que muda outra diz
  qual substitui. Pergunta ainda sem resposta entra como P-NNN em "Pendentes"
  e NÃO vale como regra até virar D-NNN.
- Ramos: `docs/RAMOS.md` diz o que juntar e o que não juntar.
- Registro de entrega (o que foi feito, como foi verificado): `docs/` com data
  no nome, como os de 02 a 08/10/2026.
- O estado de quem está trabalhando: `VEZ.md`. Patch de outro repositório que
  ainda não foi publicado: `docs/patches/`.

## 4. Como marcar "superado"

- Nunca apague plano, decisão, registro ou ramo de outro agente.
- Documento superado: a PRIMEIRA linha passa a ser
  `> SUPERADO em AAAA-MM-DD por <arquivo ou commit>: <motivo em uma frase>.`
  O resto fica como estava, para a história.
- Decisão superada: na entrada antiga de `docs/DECISOES.md`, acrescente
  `SUPERADA por D-NNN em AAAA-MM-DD`.
- Ramo que não vai entrar: acrescente em `docs/RAMOS.md`
  `ramo X: superado por <commit ou doc>` e pergunte ao dono antes de apagar.
- Plano fora do repositório que ficou velho (ex.: um plano na pasta Dre): ponha
  a mesma linha SUPERADO no topo dele, apontando para o arquivo daqui.

## 5. Um agente, numa sessão, por repositório de cada vez

- `VEZ.md` (na origin/main) diz de quem é a vez e de qual sessão. Só esse
  agente, nessa sessão, faz commit ou push neste repositório, em qualquer
  ramo. Duas sessões do mesmo agente também não trabalham em paralelo.
- Todo commit leva, no fim da mensagem, a linha `Agente: claude`,
  `Agente: codex` ou `Agente: leo`.
- A CI (passo "Commits dentro da vez?") confere TODOS os commits desde o
  último Deploy verde, com o `scripts/vez.cjs` daquele Deploy (mudar o
  conferidor no próprio push não o desliga). Recusa commit sem a linha, de
  quem não tem a vez, que apaga o VEZ.md, ou que troca a vez de um agente para
  outro sem a devolução (`agente: ninguem`), inclusive num merge que resolve o
  conflito do VEZ.md ficando com a própria versão. Todo push na main roda o
  Deploy, inclusive o só de VEZ.md e docs/passagens/.
- Um commit recusado que já está na main continua vermelho em todo Deploy
  seguinte, e o site fica parado no último verde, até ser tratado. Sem push
  --force: o dono aceita (`node scripts/vez.cjs aceitar <sha> "<frase dele>"`
  e o push impresso, ou um commit dele no site do GitHub com a linha
  `Aceito: <sha>`). O Deploy desse push já passa.
- O dono: commit feito por ele no site do GitHub (editor ou botão de merge)
  vem assinado pelo GitHub e vale como `Agente: leo` sem a linha. Se ele
  passar a vez pelo editor do site trocando a linha `agente:`, a sessão do
  agente anterior deixa de valer e o novo pega normalmente. Um agente só
  escreve `Agente: leo` nos commits de vez (liberar, aceitar, pegar pelo dono),
  quando o dono pediu no chat, com a frase dele no commit (o vez.cjs põe). Código
  com `Agente: leo` fora do site do GitHub é recusado.
- As regras da vez (scripts/vez.cjs, .github/workflows/, AGENTS.md e
  CLAUDE.md), depois de publicadas, só mudam com o dono: merge dele no site do
  GitHub, ou aceitas por ele.
- Commit feito antes de o VEZ.md existir (sem VEZ.md nele nem no pai) passa
  só com a linha `Agente:`.
- Limite: a CI roda o deploy.yml do próprio push; tirar o passo dali desliga a
  conferência. Uma regra na main do GitHub exigindo o check Deploy NÃO resolve
  do jeito que está: o Deploy só roda com o commit já na main, e a regra
  recusaria todo push, até o da vez (P-021 em docs/DECISOES.md).
- Quem tem a vez no painel-impresilk não mexe no PCP: o painel publica as
  functions do PCP de carona.
- Ao terminar, ou ao parar no meio (cota acabou, sessão caiu): preencha a
  Passagem no VEZ.md do disco e rode `node scripts/vez.cjs passar`. Ele monta a
  devolução em cima da origin/main (o ramo de trabalho NÃO vai junto) e imprime
  o push. Depois, `git checkout -- VEZ.md`.

## 6. O que deixar ao passar a vez (Passagem do VEZ.md)

Todos os campos, uma linha cada (detalhe em docs/, o campo aponta para lá).
`vez.cjs passar` recusa se faltar algum, e com a vez livre (`agente: ninguem`)
o `tests/agentes.test.cjs` também. Enquanto a vez é sua, os campos podem
ficar em "-"; preencha-os ao parar, mesmo no meio. O passar também recusa a
Passagem que ninguém escreveu nesta vez (igual à da origin/main ou à do
último commit da pasta).

- `no_ar`: sha da main, versão (APP_VERSAO) e versões de pcp-sync e
  pcp-mubisys, e como conferiu.
- `ramos`: cada ramo aberto, quantos à frente e atrás da main, e o destino:
  juntar, superado por X (e em docs/RAMOS.md), ou o dono decide.
- `feito`: o que entrou nesta vez (commits ou versões) e onde está o registro.
- `pela_metade`: o que ficou incompleto, com arquivo e função.
- `decisoes`: as D-NNN registradas nesta vez.
- `perguntas_ao_dono`: o que depende dele (e o P-NNN).
- `nao_fazer`: armadilhas descobertas (o que quebra e por quê).
- `testes`: comando e resultado (passam, falham, pulados).
- `dados`: migrations aplicadas e qualquer dado real tocado, ou "nenhum".
