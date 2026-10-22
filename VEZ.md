# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T12:01:52.902Z
ramo: codex/retrabalho-situacao-20261022
tarefa: Pendentes por padrao e contagens por situacao no retrabalho, publicar e conferir
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T12:11:08.979Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v188, main cbfcde3, Deploy 39775808289 verde; arquivos publicos conferidos.
ramos: codex/retrabalho-contagens-20261022 publicado na main.
feito: Pendentes por padrao, contagens pendentes/resolvidos por periodo e pessoas, mantidas na previa PDF.
pela_metade: nenhum.
decisoes: Escolha explicita de Todos ou Resolvidos permanece ao repintar; contagens anteriores ao filtro de situacao.
perguntas_ao_dono: nenhuma.
nao_fazer: Nao alterar dados produtivos em testes; manter responsavel e tecnico separados.
testes: 2153 testes passaram; oito arquivos publicos iguais; interface autenticada e previa PDF v188 conferidas.
dados: Nenhum registro produtivo alterado; fixtures ficticias.