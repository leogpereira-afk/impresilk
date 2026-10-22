# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T12:17:39.970Z
ramo: codex/retrabalho-contagens-20261022
tarefa: Contagens clicaveis de pendentes e resolvidos no retrabalho, publicar e conferir
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T12:24:27.633Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v189, main 9bf788e, Deploy 39777638813 verde; oito arquivos servidos iguais ao clone.
ramos: codex/retrabalho-contagens-clicaveis-20261022 publicado na main.
feito: Contagens de retrabalho clicaveis com destaque e foco; filtros sincronizados; quantidades preservadas como texto no PDF.
pela_metade: nenhum.
decisoes: Atalhos preservam periodo e pessoas; zero permanece selecionavel; nenhuma regra de resolucao mudou.
perguntas_ao_dono: nenhuma.
nao_fazer: Nao gravar registros reais durante conferencias; manter responsavel e tecnico separados.
testes: 2155 passaram em scripts/verificar.cjs; cliques dos dois atalhos e previa PDF v189 conferidos no site autenticado.
dados: Nenhum registro produtivo alterado; fixtures ficticias.