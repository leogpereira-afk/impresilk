# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-11-11T22:25:46.160Z
ramo: HEAD
tarefa: Total entregue no periodo dos relatorios do PCP
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-11-11T22:53:18.563Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: e9eed48, v198 pelo ultimo Deploy verde 39958170960. pcp-sync v166 no registro anterior; pcp-mubisys nao conferido nesta frente de tela.
ramos: codex/total-entregue-periodo local (517166c), 1 a frente e 0 atras antes da devolucao; rebasear apos nova vez e aguardar o dono para publicar.
feito: Preparada v199 no commit local 517166c: total em Entregas abaixo dos filtros, soma em centavos, cobertura e recorte anual dos atalhos.
pela_metade: Publicacao da v199. Deploy 43111738074 do registro da vez falhou no teste antigo de acumulado; data do fixture corrigida na v199 local.
decisoes: Nenhuma nova decisao.
perguntas_ao_dono: Pode publicar a v199 apos conferir a previa?
nao_fazer: Nao contar lacunas como zero nem usar meses do grafico que ficam fora do recorte dos atalhos.
testes: node scripts/verificar.cjs: 2209 passaram, 0 falhas, 0 pulados. Conferencia do recorte jan-out em previa local com dados ficticios.
dados: Nenhuma gravacao de dados reais e nenhuma migration.