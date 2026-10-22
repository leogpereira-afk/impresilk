# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T11:28:40.074Z
ramo: codex/retrabalho-colunas-20261021
tarefa: Filtros por responsavel da etapa e tecnico da correcao em Retrabalho, previa local
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T11:34:18.353Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v185, codigo 8eb3af7 conforme passagem anterior; sem nova publicacao de codigo nesta entrega. Ultimo Deploy consultado verde; servidor nao alterado.
ramos: codex/retrabalho-filtros-20261022 local, commit a67f2af, um commit a frente da base 438397d antes desta devolucao; juntar somente apos autorizacao de publicacao.
feito: Filtros combinaveis por responsavel da etapa e tecnico da correcao, limpar, ausencia de informacao e resumo na previa PDF. docs/planos/2026-10-22-retrabalho-filtros.md.
pela_metade: Implementacao local concluida; falta autorizacao para publicar, rebase na main, versao pelo script oficial e conferencia do site.
decisoes: Nenhuma regra financeira alterada; responsavel e tecnico permanecem independentes.
perguntas_ao_dono: Publicar os filtros desta entrega? Pendencias antigas em docs/DECISOES.md preservadas.
nao_fazer: Nao usar nome como chave do tecnico com ID; nao confundir a taxa geral do periodo com o recorte de pessoas.
testes: Node 24 scripts/verificar.cjs: 2148 passaram, zero falhas ou pulados; diff check e conferir da vez passaram; tela e previa PDF conferidas com dados ficticios.
dados: nenhum