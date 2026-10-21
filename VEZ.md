# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T19:25:37.049Z
ramo: codex/pcp-atalho-retrabalho-20261021
tarefa: Publicar atalho de retrabalho aprovado
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T19:33:33.340Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: main 6fd4e0a, tela v182. Deploy 39661814061 verde; oito arquivos publicos identicos ao clone; botao e abertura/cancelamento conferidos na sessao autenticada. pcp-sync e pcp-mubisys nao alterados nem revalidados nesta tarefa.
ramos: codex/pcp-atalho-retrabalho-20261021 em /tmp/pcp-retrabalho-20261021 integrado na main, 0 a frente e 0 atras antes desta devolucao; demais ramos preservados.
feito: Publicado atalho de retrabalho aprovado, commits c62fea7 e 6fd4e0a, v182. Plano docs/planos/2026-10-21-atalho-retrabalho-conferencia.md. Conferencia autenticada sem gravar retrabalho real.
pela_metade: nenhum item pendente deste ajuste; gravacao funcional verificada apenas no handler ficticio local, como previsto.
decisoes: nenhuma nova regra; dono autorizou publicar com subir apos a previa.
perguntas_ao_dono: nenhuma para este ajuste.
nao_fazer: Nao registrar retrabalho ficticio em O.S. real. O formulario usa a fila normal da O.S.; aguardar sincronizacao para nova conferencia. Nenhuma regra financeira alterada.
testes: node scripts/verificar.cjs: 2143 passaram, zero falhas ou pulados; navegador local passou na previa; deploy verde; oito arquivos publicos iguais; abertura e retorno no site autenticado sem gravacao.
dados: nenhum dado real alterado; nenhuma migration; somente leitura e abertura/cancelamento no site.