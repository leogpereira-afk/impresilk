# PCP Impresilk: regras para qualquer agente (Claude, Codex ou outro)

Este arquivo e o CLAUDE.md têm o MESMO texto: o Codex lê o AGENTS.md, o Claude
lê o CLAUDE.md. Mudou um, copie no outro; `tests/agentes.test.cjs` falha se
divergirem. A sua memória (~/.claude/... ou ~/.codex/memories) é só sua: o
outro agente não a vê. Tudo o que o outro precisa saber mora neste repositório.

## 0. Antes de mexer em qualquer coisa

1. `git fetch origin` e `node scripts/vez.cjs`. Se a vez for de outro agente,
   PARE e pergunte ao dono. Não existe "só um ajuste rápido" em paralelo.
2. Pegue a vez: `node scripts/vez.cjs pegar <claude|codex> "tarefa"`, faça o
   commit só do VEZ.md e o push na main ANTES de tocar em código.
   Esse push (só VEZ.md e docs/passagens/) não republica o site e é a única
   exceção ao "publicar só com o pode publicar do dono".
3. Leia a Passagem do VEZ.md (a anterior fica em `docs/passagens/`), o
   `docs/DECISOES.md` (confirmadas e pendentes) e os planos em `docs/planos/`
   que não estão marcados SUPERADO.
4. Olhe o último resultado do Deploy deste repositório e do functions.yml do
   painel-impresilk (`gh run list -L 3` em cada um). Vermelho é a primeira
   coisa a resolver: token de publicar já venceu calado.
5. Trabalhe num clone ou worktree FORA do iCloud (ex.: ~/Projetos ou /tmp). A
   pasta Dre fica no iCloud, que devolve leitura atrasada e despeja arquivos.

## 1. Regras da casa (garantias do sistema)

- O repositório é PÚBLICO. Nenhum dado real nem segredo em teste, doc, commit
  ou print: nada de nome de pessoa, CPF, ID do RH, número de O.S. real, valor em
  R$ de O.S. ou de cliente, token. Use dados fictícios e diga que são.
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
  Se um plano disser outra coisa, vale a DECISÃO mais nova.

## 2. Versão, verificação e publicação

- Versão: `node scripts/subir-versao.cjs --proxima`. Troca os 83 lugares
  (APP_VERSAO, CACHE e todo `?v=` da raiz) e falha sem gravar se algum
  divergir, se o número já existe na origin/main ou se o ramo não contém a
  main. Nunca suba versão à mão.
- Antes do push: `npm run verificar` (Node 22 ou mais novo). Vermelho não sobe.
- Push na main É publicação: o Pages publica a tela na hora. As functions do
  PCP sobem pelo repositório painel-impresilk: `functions.yml` em todo push de
  lá que mexe em supabase/functions (de carona) e `functions-sistemas.yml` de
  hora em hora. Ordem: servidor antes da tela.
- Publicar só depois do "pode publicar" do dono, dito para esta tarefa.
- Disparo manual com `pcp_ref` (ou `rh_ref`): só ramo que CONTÉM a main. A
  trava do functions.yml do painel-impresilk barra o resto; enquanto ela não
  estiver no ar, confira antes: `git merge-base --is-ancestor origin/main <ramo>`.
- Mudou `supabase/functions/_shared`? Publique pcp-sync e pcp-mubisys juntos.
- Nunca `[skip ci]` em commit que muda código. Nunca push --force na main.

## 3. Onde ficam planos, decisões e registros

- Plano: `docs/planos/AAAA-MM-DD-assunto.md`. Plano que mora fora daqui (pasta
  Dre, memória de agente, conversa) não vale: copie para cá antes de seguir.
- Decisão do dono: `docs/DECISOES.md`. Uma entrada por decisão: número D-NNN,
  data, a regra (com a frase do dono entre aspas quando houver), a fonte, quem
  registrou, onde foi aplicada. Só se acrescenta. Decisão que muda outra diz
  qual substitui. Pergunta ainda sem resposta entra como P-NNN em "Pendentes"
  e NÃO vale como regra até virar D-NNN.
- Registro de entrega (o que foi feito, como foi verificado): `docs/` com data
  no nome, como os de 02 a 08/10/2026.
- O estado de quem está trabalhando: `VEZ.md`.

## 4. Como marcar "superado"

- Nunca apague plano, decisão, registro ou ramo de outro agente.
- Documento superado: a PRIMEIRA linha passa a ser
  `> SUPERADO em AAAA-MM-DD por <arquivo ou commit>: <motivo em uma frase>.`
  O resto fica como estava, para a história.
- Decisão superada: na entrada antiga de `docs/DECISOES.md`, acrescente
  `SUPERADA por D-NNN em AAAA-MM-DD`.
- Ramo que não vai entrar: escreva `ramo X: superado por <commit ou doc>` no
  campo `ramos` da Passagem e pergunte ao dono antes de apagar.
- Plano fora do repositório que ficou velho (ex.: um plano na pasta Dre): ponha
  a mesma linha SUPERADO no topo dele, apontando para o arquivo daqui.

## 5. Um agente por repositório de cada vez

- `VEZ.md` (na origin/main) diz de quem é a vez. Só esse agente faz commit ou
  push neste repositório, em qualquer ramo.
- Todo commit leva, no fim da mensagem, a linha `Agente: claude`,
  `Agente: codex` ou `Agente: leo`. A CI (`node scripts/vez.cjs conferir`)
  recusa publicar commit sem a linha, de quem não tem a vez, que apaga o
  VEZ.md, ou que troca a vez de um agente para outro sem a devolução
  (`agente: ninguem`), inclusive num merge que resolve o conflito do VEZ.md
  ficando com a própria versão. Só o dono (`Agente: leo`) toma a vez de outro
  agente.
- Commit feito antes de o VEZ.md existir (sem VEZ.md nele nem no pai) passa
  só com a linha `Agente:`.
- Push só de VEZ.md e docs/passagens/ não roda o Deploy; o Deploy seguinte
  confere esses commits também (a faixa recua sobre eles).
- Quem tem a vez no painel-impresilk não mexe no PCP: o painel publica as
  functions do PCP de carona.
- Ao terminar, ou ao parar no meio (cota acabou, sessão caiu): preencha a
  Passagem e rode `node scripts/vez.cjs passar`, commit e push.

## 6. O que deixar ao passar a vez (Passagem do VEZ.md)

Todos os campos, uma linha cada (detalhe em docs/, o campo aponta para lá).
`vez.cjs passar` recusa se faltar algum, e com a vez livre (`agente: ninguem`)
o `tests/agentes.test.cjs` também. Enquanto a vez é sua, os campos podem
ficar em "-"; preencha-os ao parar, mesmo no meio.

- `no_ar`: sha da main, versão (APP_VERSAO) e versões de pcp-sync e
  pcp-mubisys, e como conferiu.
- `ramos`: cada ramo aberto, quantos à frente e atrás da main, e o destino:
  juntar, superado por X, ou o dono decide.
- `feito`: o que entrou nesta vez (commits ou versões) e onde está o registro.
- `pela_metade`: o que ficou incompleto, com arquivo e função.
- `decisoes`: as D-NNN registradas nesta vez.
- `perguntas_ao_dono`: o que depende dele.
- `nao_fazer`: armadilhas descobertas (o que quebra e por quê).
- `testes`: comando e resultado (passam, falham, pulados).
- `dados`: migrations aplicadas e qualquer dado real tocado, ou "nenhum".
