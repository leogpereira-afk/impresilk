# De quem é a vez neste repositório

Só o agente desta linha faz commit ou push aqui, em qualquer ramo. Vale o que
está na origin/main (`git show origin/main:VEZ.md`), não a cópia do disco.
Regra completa no AGENTS.md (igual ao CLAUDE.md), seções 5 e 6.

agente: claude
desde: 2026-10-11T05:30:00-03:00
ramo: protocolo (sobre a1-comissao)
tarefa: fila de 11/10: A1 da comissão, protocolo, backup, abas Conferência e Perdas
passou_por: codex
passou_em: 2026-10-08T15:13:15-03:00

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos antes de `node scripts/vez.cjs passar`. Uma linha
cada; detalhe vai em docs/ e o campo aponta para lá. "nenhum" é resposta
válida; vazio ou "-" não é. Com a vez de alguém, os campos podem estar em "-"
enquanto ele trabalha; com a vez livre (ninguem), têm de estar todos cheios.

no_ar: main 8aecc12 = v164 no Pages (APP_VERSAO e CACHE v164); pcp-sync v128 e pcp-mubisys v109 conferidos em 10/10 pelo list_edge_functions; em 11/10 o list_edge_functions mostra pcp-sync v130 e pcp-mubisys v111, republicadas em 10/10 às 23:52 de carona por um push do painel-impresilk (a auditoria de 11/10 conferiu o pcp-sync no ar igual ao da v164)
ramos: a1-comissao (8e959a0, 1 à frente e 0 atrás da main) e protocolo (2 à frente: o A1 e este protocolo) são para publicar, com o "pode publicar" do dono, pcp-sync antes da tela; f19 (6 à frente, 50 atrás), f20 (9, 50), f20t (7, 50), f21, f22s e f22t (mesmo commit f8c8b9e, 17, 39) e poda-valores-operacao (2, 89) estão SUPERADOS pela v164, NÃO JUNTAR: os 6 do Claude arquivados com tag local arquivo/<ramo>-2026-10-01 (sem push) e poda-valores-operacao a arquivar do mesmo jeito; os worktrees f22s (4 arquivos) e f22t (1 arquivo) têm trabalho sem commit que a tag não guarda; origin/codex/entregas-parciais-equipes (36 atrás), origin/producao-lateral (188 atrás) e origin/claude/admiring-noether-ly12p1 (100 atrás) não têm nada próprio: apagar da origem com o aval do dono
feito: a1-comissao 8e959a0 (A1: aprovar e exportar a comissão recalculam com a régua do próprio selo; teste tests/comissao-fechamento-tela.test.cjs com dados fictícios); ramo protocolo, este commit: AGENTS.md igual ao CLAUDE.md, VEZ.md, docs/DECISOES.md, scripts/vez.cjs, scripts/subir-versao.cjs, tests/agentes.test.cjs, tests/versao.test.cjs e os passos "Commits dentro da vez?" e "Versão igual nos 83 lugares?" no deploy.yml; no painel-impresilk, ramo trava-pcp-ref (commit 719ec88 sobre a main 0ac3b46, num clone temporário desta sessão, fora da origem; o patch está no relatório da sessão): o functions.yml recusa pcp_ref ou rh_ref que não contém a main; nada publicado
pela_metade: da fila de 11/10 faltam: publicar a1-comissao e protocolo; backup (A2, M20, M21, M29: copiar os buckets pcp-arquivos e pcp-demandas por sha256, exportar todas as coleções e pcp_demandas, status por coleção); abas Conferência e Perdas (M10: a conferência sai do fim da aba Rankings e nasce a aba "Perdas e decisões", só admin e pcp, só leitura), não começadas; M24 (uma porta só para publicar as functions do PCP); o ponteiro AGENTS.md e CLAUDE.md na pasta Dre e a linha SUPERADO no plano de 29/09 de lá (fora deste repo); de f20 e f22s, refazer à mão só a ideia do ajuste contra o selo e a correção de 1 linha do histórico da divisão
decisoes: D-001 a D-007 (regras confirmadas pelo dono em 03/10/2026) copiadas para docs/DECISOES.md com a fonte; P-001 (A3, retrabalho e atraso) registrada como PENDENTE, não vale como regra
perguntas_ao_dono: A3: retrabalho marcado tira os pontos e a comissão da O.S. sozinho (29/09, "venha de onde vier") ou só com falha comprovada da instalação registrada pela gestão (03/10)? o atraso tira ponto sozinho e por qual prazo? o retorno antecipado continua? (texto inteiro em docs/DECISOES.md, P-001); prêmio de outubro, antes de 31/10: o que define a campeã (valor conferido ou pontos), qual o desempate, quem recebe a cesta e se outubro, que é teste, premia
nao_fazer: não juntar f21, f22s, f22t nem poda-valores-operacao na main; não disparar o functions.yml com pcp_ref de ramo antes da trava, não publicar à mão; não fechar outubro, não aprovar comissão nem divulgar o ranking de outubro como resultado do mês (cobre 12 das 25 entregas externas do ERP); não classificar baixas em lote nem por script, não mexer nas 280 de antes do corte; não usar a "Fila diária" como lista de trabalho até a correção; não restaurar o PCP só pelo arquivo do Hub (lápides somem, mês fechado reabre, excluídas voltam); nenhum UPDATE automático em dado real, tudo pela tela com motivo; não construir o motor v2, o ranking em R$ com prêmio automático nem o segundo CSV de comissão; não abrir duas frentes ao mesmo tempo nos arquivos quentes (app.js, performance.js, pcp-sync/index.ts, _shared/pcp-integridade.mjs, styles.css)
testes: node scripts/verificar.cjs (Node 24) no ramo protocolo em 11/10: 1579 testes, 1579 passam, 0 falham, 0 pulados (numa cópia sem o histórico do git, 5 deles são pulados); node scripts/vez.cjs conferir 8aecc12..HEAD: ok, 2 commits; node scripts/subir-versao.cjs: 83 lugares em v164
dados: nenhuma migration nova; nenhum dado real tocado (a auditoria só fez SELECT); já aplicadas em 08/10: 0004_vinculo_equipe_cas e 20261008_demandas
