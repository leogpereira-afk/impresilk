# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: codex
desde: 2026-10-21T20:10:46.562Z
ramo: codex/pcp-legibilidade-abas-20261021
tarefa: Publicar correcoes aprovadas de legibilidade dos cards do PCP
sessao: codex:245fe2d5 (pcp-rotas-usabilidade-20261021)
versao_reservada: v183
arquivos_em_uso: styles.css performance-dashboards.css arquivos de versao docs/planos/2026-10-21-legibilidade-demais-abas.md
passou_por: codex
passou_em: 2026-10-21T20:07:08.136Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: -
ramos: -
feito: -
pela_metade: -
decisoes: -
perguntas_ao_dono: -
nao_fazer: -
testes: -
dados: -