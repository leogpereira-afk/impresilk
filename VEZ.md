# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T12:38:08.992Z
ramo: codex/retrabalho-todos-20261022
tarefa: Limpar todos os filtros do retrabalho e restaurar Pendentes, publicar e conferir
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T12:48:03.974Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v191, main edf3a87; Deploy 39780296301 verde; oito arquivos publicados identicos aos locais.
ramos: codex/retrabalho-limpar-filtros-20261022 concluido e publicado.
feito: Limpar todos os filtros restaura Pendentes, remove periodo, responsavel e tecnico; lista, contagens e relatorio acompanham.
pela_metade: nenhum.
decisoes: Preservado o botao que limpa somente pessoas; novo botao limpa todos e mantem foco.
perguntas_ao_dono: nenhuma.
nao_fazer: Nao gravar dados reais em arquivos publicos nem alterar registros produtivos na verificacao.
testes: 2157 testes passaram; site autenticado conferido com periodo, situacao e pessoas ativos; limpeza e previa do PDF v191 confirmadas.
dados: Nenhum registro produtivo alterado; testes com dados ficticios.