# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T17:17:02.632Z
ramo: HEAD
tarefa: Modernizar Rotas e facilitar selecao de O.S.; corrigir referencia documental na guarda M27
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T17:39:56.126Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: tela v179 na main 8d311f1; Deploy documental verde https://github.com/leogpereira-afk/impresilk/actions/runs/39642815854; pcp-sync e pcp-mubisys nao alterados nem revalidados nesta tarefa.
ramos: codex/rotas-usabilidade-20261021 local em /tmp/pcp-rotas-usabilidade-20261021, um commit a frente e nenhum atras da main antes da devolucao; interface aguarda revisao e autorizacao de publicar. Preservar os demais ramos.
feito: corrigida referencia documental que gerava falso positivo M27; nova selecao de O.S. e cards compactos no ramo local, commit 54d3289; detalhes em docs/planos/2026-10-21-rotas-usabilidade.md nesse ramo.
pela_metade: interface pronta na previa local da porta 5383, ainda nao publicada; sem provedor real de mapas e sem persistencia de rotas, limites anteriores preservados.
decisoes: nenhuma regra de negocio alterada; pedido restrito a usabilidade, modernizacao e testes de Rotas.
perguntas_ao_dono: revisar a previa e autorizar publicacao desta interface; provedor de mapas continua pendente, sem contratacao nesta tarefa.
nao_fazer: nao publicar codigo deste ramo sem autorizacao; nao apresentar dados demonstrativos como trajetos reais; nao incluir dados reais em testes ou documentos; evitar hashes abreviados com sequencia numerica confundida pela guarda M27.
testes: node scripts/verificar.cjs: todos os 2139 testes passaram, zero falhas ou pulados; navegador desktop e largura mobile, busca, filtros, lote, remocao, ordem, edicao e invalidacao conferidos com dados ficticios; M27 passou apos registro final.
dados: nenhum dado real consultado ou alterado; nenhuma migration ou servidor publicado; interface nova somente local.