# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T12:28:17.983Z
ramo: codex/retrabalho-contagens-clicaveis-20261022
tarefa: Atalho Todos com total no retrabalho, publicar e conferir
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T12:35:52.568Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v190, main e39effc, Deploy 39778906233 verde; oito arquivos publicos iguais.
ramos: codex/retrabalho-todos-20261022 publicado na main.
feito: Atalho Todos com quantidade total e destaque ao lado das situacoes; mantido no PDF.
pela_metade: nenhum.
decisoes: Todos limpa apenas situacao e preserva periodo e pessoas; Pendentes continua padrao inicial.
perguntas_ao_dono: nenhuma.
nao_fazer: Nao alterar registros reais durante testes.
testes: 2156 passaram em scripts/verificar.cjs; Resolvidos para Todos conferido no site; previa PDF v190 com total e recorte.
dados: Nenhum registro produtivo alterado; fixtures ficticias.