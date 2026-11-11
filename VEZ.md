# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-11-11T22:58:09.989Z
ramo: codex/total-entregue-periodo
tarefa: Painel de tipos finais dos produtos entregues no periodo
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-11-11T23:27:41.736Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: e9eed48, v198 pelo ultimo Deploy verde 39958170960. Servidor nao publicado nesta frente; pcp-sync v166 consta na passagem anterior.
ramos: codex/total-entregue-periodo local, 2 a frente e 0 atras antes desta devolucao, commits 6169047 e d9b40c4. Rebasear apos nova vez e aguardar autorizacao de publicar.
feito: Previa v199 com total entregue e painel por produto, modelos reunidos. Registro em docs/entrega-produtos-periodo-2026-11-11.md no ramo local.
pela_metade: Publicacao da v199 e de pcp-sync. Primeiro restaurar Deploy com a correcao isolada de data em tests/casa.test.cjs ja incluida na candidata; depois servidor e tela.
decisoes: D-022 no ramo local: agrupar so pelo produto, juntando os modelos.
perguntas_ao_dono: Pode publicar o total e o painel por produto apos a previa?
nao_fazer: Nao agrupar por modelo ou categoria. Nao multiplicar quantidade de novo. Nao tratar itens ausentes ou lacunas de meses como zero. Nao publicar servidor sem Deploy verde e ramo atualizado.
testes: node scripts/verificar.cjs: 2220 passaram, 0 falhas e 0 pulados. vez.cjs conferir origin/main..HEAD passou. Desktop e celular 390 px conferidos com dados ficticios.
dados: Somente SELECT para conferir estrutura e cobertura dos itens, nenhum dado real gravado, nenhuma migration.