# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T20:43:48.391Z
ramo: codex/pcp-mobile-20261021
tarefa: Concluir revisao mobile e compatibilizar com a v184 publicada
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T20:45:52.320Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v184 da main, codigo 8d29ed7 e protocolo 9a69b07; versao confirmada na origem e publicacao registrada pela passagem anterior. Nenhum produto publicado nesta revisao mobile. pcp-sync e pcp-mubisys nao alterados nem revalidados.
ramos: codex/pcp-mobile-20261021 local, commit 6ce33ee, 1 a frente e 0 atras da origin/main antes desta devolucao; incorporar apenas apos aprovacao do dono. Clone /tmp/pcp-rotas-usabilidade-20261021. Demais ramos preservados.
feito: Revisadas 15 abas em 360 e 390 px e subabas; corrigidos cards de Execucao e Instalacao, nomes e metricas de Retrabalho e Finalizados, calendario com demanda longa, aviso de Regras e etapa Fechamento. Registro docs/planos/2026-10-21-revisao-mobile-pcp.md no ramo local; previa isolada em localhost:5398.
pela_metade: Implementacao e verificacao concluidas localmente; publicacao do commit 6ce33ee depende de aprovacao. Atualizar main e subir a proxima versao pelo script ao publicar.
decisoes: Nenhuma regra operacional alterada; somente CSS. Alteracao publicada na v184 com responsavel da etapa e tecnico da correcao preservada apos rebase.
perguntas_ao_dono: Aprovacao para publicar os novos ajustes mobile; o pedido desta vez foi conferir no celular.
nao_fazer: Nao publicar sem aprovacao nem substituir as colunas novas de Retrabalho; nao remover rolagem interna de tabelas, pois preserva todas as colunas. Nao reduzir fontes para resolver cortes.
testes: Node 24 scripts/verificar.cjs na base v184: 2143 passaram, zero falhas ou pulados. diff check e conferir da vez passaram. Navegacao, cores e dimensoes em 360 e 390 px; subabas de Performance e Entregas; listas e fichas; regressao 1280 px. Emulacao de navegador, sem aparelho fisico.
dados: Nenhum dado real alterado. Apenas uma demanda ficticia na previa isolada, sem acesso externo. Nenhuma migracao ou alteracao de backend. Evidencias fora do repositorio publico.