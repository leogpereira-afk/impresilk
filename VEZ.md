# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T19:12:49.969Z
ramo: codex/pcp-atalho-retrabalho-20261021
tarefa: Atalho para apontar retrabalho em Itens e equipe, previa local
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T19:22:52.875Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: main c10ba0f, tela v181, Deploy 39659696239 verde conferido pelo GitHub; interface produtiva e versoes pcp-sync/pcp-mubisys nao revalidadas nesta tarefa, servidores nao alterados.
ramos: codex/pcp-atalho-retrabalho-20261021 local em /tmp/pcp-retrabalho-20261021, commit d7a9ccc, 1 a frente e 0 atras da main antes desta devolucao; aguarda aprovacao para publicar. Demais ramos preservados.
feito: Atalho Apontar retrabalho no topo de Itens e equipe, formulario existente em dialog nativo, preservacao da entrega e rascunho. Plano local docs/planos/2026-10-21-atalho-retrabalho-conferencia.md no commit d7a9ccc.
pela_metade: Codigo concluido e verificado somente no clone local; falta aprovacao de publicacao, reserva de versao, rebase, subir-versao e conferencias de producao.
decisoes: nenhuma nova regra; preservadas permissoes, origens, fila e fechamento existentes.
perguntas_ao_dono: Aprovar previa e autorizar publicar este atalho; o sim recebido autorizou assumir a vez e implementar, nao a publicacao do codigo.
nao_fazer: Nao confundir esta devolucao de VEZ com publicacao do atalho. Nao testar gravacao em O.S. real. Reusar o clone local para recuperar o commit; sem push de codigo nesta tarefa.
testes: node scripts/verificar.cjs com Node 24: 2143 passaram, zero falhas/pulados; testar-atalho-retrabalho-ui.cjs passou no Chrome local com handler e dados ficticios; git diff --check e conferir origin/main..HEAD passaram.
dados: nenhum dado real tocado; nenhuma migration; somente gravacoes no fixture local de testes.