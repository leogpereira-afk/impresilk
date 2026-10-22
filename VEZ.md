# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T00:18:50.740Z
ramo: codex/pcp-mobile-20261021
tarefa: Publicar ajustes mobile aprovados e conferir no site oficial
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T00:24:34.826Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v185, main 8eb3af7; Deploy 39699098156 concluido com sucesso. Nove arquivos publicos iguais byte a byte aos testados e CSS v185 confirmado em navegador autenticado. pcp-sync e pcp-mubisys nao alterados nem revalidados.
ramos: codex/pcp-mobile-20261021 incorporado integralmente na main, 0 a frente e 0 atras antes desta devolucao. Clone /tmp/pcp-rotas-usabilidade-20261021. Outros ramos preservados.
feito: Publicados os ajustes mobile aprovados: Execucao, Instalacao, Retrabalho, Finalizados, Calendario, Regras e ficha. Cards compactos, textos completos e acoes preservadas. Registro docs/planos/2026-10-21-revisao-mobile-pcp.md.
pela_metade: Nenhum item desta publicacao. Teste em aparelho fisico nao realizado; validacao responsiva por navegador em 360 e 390 px.
decisoes: Nenhuma nova regra operacional. Dono autorizou a publicacao apos a previa com Su bir. Colunas da v184 preservadas.
perguntas_ao_dono: Nenhuma para esta entrega; pendencias antigas de docs/DECISOES.md continuam inalteradas.
nao_fazer: Nao reduzir fontes nem remover colunas para evitar cortes. Manter rolagem interna das tabelas e menus. Nao confundir emulacao de largura com teste em aparelho fisico.
testes: Node 24 scripts/verificar.cjs: 2143 passaram, zero falhas, cancelados ou pulados. diff check e conferir da vez passaram. CI verde. Conferencia oficial em 390 e 360 px de Execucao e Finalizados sem transbordamento; nomes visiveis e metricas preservadas. Revisao previa das 15 abas e subabas registrada no plano.
dados: Nenhum dado real alterado, nenhuma migracao e nenhuma escrita operacional. Conferencia autenticada somente leitura. Evidencias em /tmp, fora do repositorio publico.