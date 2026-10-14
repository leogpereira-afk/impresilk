# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-14T17:27:04.589Z
ramo: codex/pontualidade-abc-20261014
tarefa: Publicar pontualidade ABC aprovada pelo dono
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-14T17:39:18.630Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: main 9361038, tela v176, Deploy 38607521709 verde; sete arquivos públicos com HTTP 200 e idênticos aos locais. pcp-sync v157 e pcp-mubisys v135 ACTIVE, conferidos no Supabase. Os 11 arquivos de pcp-sync conferem com o ramo validado.
ramos: codex/publicar-pontualidade-abc-20261014 está 0 à frente e 0 atrás da main antes desta devolução, já publicado (ficará 1 atrás). codex/pontualidade-abc-20261014 está 1 à frente e 5 atrás; seu único patch foi incorporado como 42229b4, não juntar novamente. Ramos antigos de docs/RAMOS.md continuam fora do escopo.
feito: Publicação autorizada pelo dono com "subir" em 14/10; recurso ABC publicado, servidor antes da tela. Registro em docs/entrega-pontualidade-abc-2026-10-14.md. Tela oficial autenticada conferida: todas as classes filtram ambas as réguas, seleção individual somente em A+, cliente altera gráfico e quantidade de O.S., retorno a Todos restaura a base, resumo financeiro preservado e nenhum erro JS.
pela_metade: Nenhum item deste recurso pendente. Responsividade de 390 px, troca de ano, mês clicável, teclado e prévia de PDF conferidos localmente; em produção foram conferidos os filtros e o gráfico com sessão real, sem gravar registros de teste.
decisoes: D-018 publicada: classes A+, A, B+, B e C, clientes individuais somente em A+; anotada a autorização específica de publicação.
perguntas_ao_dono: Nenhuma para esta entrega. Perguntas anteriores de docs/DECISOES.md permanecem sem mudança.
nao_fazer: Não alterar o Painel, reservado a outro trabalho. Não atribuir C à falta de vínculo nem recalcular classificação por nomes. A migração foi aplicada pelo conector com carimbo remoto diferente: não reaplicar por causa disso. Não juntar ramos antigos proibidos; mês fechado e comissão não mudaram.
testes: npm run verificar com Node 24: 2080 passam, zero falhas e pulados. SQL local: 8 verificações. UI desktop/mobile e prévia de PDF: 6 fluxos. Guardas de dados: 6 testes. CI build/deploy verdes. Consulta protegida sem sessão retorna 401; RPC nova restrita a service_role. git diff --check e conferência da vez aprovados.
dados: Migração pcp_pontualidade_abc aplicada como 20261014173042, equivalente ao arquivo local 20261014170059_pcp_pontualidade_abc.sql. Criou somente função de leitura SECURITY INVOKER. Nenhum dado real alterado; validação por SELECT. Servidor publicado pelo conector somente para pcp-sync, evitando republicar functions do Painel.