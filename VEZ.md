# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-14T16:57:33.376Z
ramo: main
tarefa: Pontualidade por classe da curva ABC existente
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-14T17:21:14.643Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: main d56d6c7, tela v175; Deploy 38602592775 verde. Supabase list_edge_functions em 14/10: pcp-sync v156 e pcp-mubisys v135. Nenhum deploy de código nesta tarefa.
ramos: origin/codex/pontualidade-abc-20261014, commit c3a3c3c; 1 à frente e 0 atrás da main antes desta devolução (ficará 1 atrás dela). Preparado para revisão, juntar só com autorização do dono.
feito: ABC por classe na pontualidade e seletor individual só para A+; registro em docs/entrega-pontualidade-abc-2026-10-14.md no ramo de revisão; fonte do Painel apenas consultada.
pela_metade: Implementação concluída localmente. Publicação e validação autenticada em produção pendentes: migration 20261014170059_pcp_pontualidade_abc.sql, servidor, depois tela; usar subir-versao.cjs após atualizar a main.
decisoes: D-018 no ramo de revisão: classes A+, A, B+, B e C; seleção individual somente em A+. Não foi juntada à main.
perguntas_ao_dono: Autorizar publicação específica deste recurso, conforme AGENTS.md seção 2. Nenhuma publicação de código autorizada nesta tarefa até a devolução.
nao_fazer: Não alterar o Painel, que está com outro agente. Não inferir classe C por falta de vínculo. Não publicar a tela antes da migração e do servidor. Não juntar os ramos antigos proibidos em docs/RAMOS.md.
testes: npm run verificar com Node 24: 2080 passam, zero falhas e pulados. SQL local: 8 verificações com dados fictícios. UI desktop/mobile e prévia de PDF: 6 fluxos sem erro. git diff --check e conferir origin/main..HEAD passaram.
dados: Nenhum dado real alterado. Nova migração somente no ramo, não aplicada. Produção consultada apenas por SELECT de compatibilidade da fonte; nomes e valores reais não foram guardados em arquivos.