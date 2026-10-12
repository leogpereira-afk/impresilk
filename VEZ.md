# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-12T18:37:47.299Z
ramo: onda-cancelamento
tarefa: cancelamento gravado depois do fechamento com data no mês fechado (baixa da verificação da v170)
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: claude
passou_em: 2026-10-12T20:14:50.677Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: origin/main com o código 32ee282 = v174 (APP_VERSAO e CACHE v174, conferidos no site em 12/10/2026); pcp-sync v149 e pcp-mubisys v128, publicadas pelo functions.yml do painel com pcp_ref main (run 38302658326) depois de três tentativas recusadas pelo Supabase com "internal error" em vários envios (status do Supabase sem incidente; provável limite de envios do dia); Deploy verde
ramos: onda-fechamento, onda-volta, onda-comissao, onda-pessoas, onda-operacao, onda-acabamento e onda-acabamento-b e onda-cancelamento: todos já na main (na origem também; apagar com o aval do dono). SUPERADOS, NÃO JUNTAR: f19, f20, f20t, f21, f22s, f22t e poda-valores-operacao (docs/RAMOS.md). Apagar com o aval do dono (P-022): origin/codex/entregas-parciais-equipes, origin/producao-lateral, origin/claude/admiring-noether-ly12p1, onda-a3, onda-w1
feito: 12/10/2026: a fila única de 11/10 inteira no que não depende do dono (v167 a v173, ver a Passagem anterior em docs/passagens/) e a v174 (onda cancelamento, de68172 e 1c428ae): marcar item, cancelar, desfazer ou cancelar de novo a O.S. depois do fechamento não muda o recálculo do mês fechado (estado no instante do fechamento, pelos carimbos do servidor; cancelamento.anteriores guarda o histórico), com a tela M8 dizendo "não entra no fechamento"; verificação independente "pode publicar"
pela_metade: nada de código pela metade; ficam: rascunho e régua de pessoa das Demandas (pergunta 15), item 27 ajuste no mês fechado e "decisões diferentes na mesma O.S." (resto da pergunta 3), M9 (pergunta 5), item 36 variação contra o mês anterior (depois do 1o fechamento real), item 16 apelidos dos carros (Thiago), reclassificar baixa de antes do corte (pergunta 18), F25 no RH (o sync do RH recusar o ciclo do bônus), a 422 da regra de CPF do contrato de instalador no RH (F07), ensaio do backup com arquivo do Hub de depois da v169; baixas registradas: corrida de milissegundos entre um cancelamento e o fechamento, e o limite de 50 no histórico do cancelamento (os dois dão 409, não pagam errado), volta com só o retorno lida como correção, ID pelos 6 primeiros dígitos do CPF pode repetir o de quem saiu
decisoes: nesta vez: D-012 (fechamento, notas da volta), D-013 "THIAGO APROVA", D-014 aprovador substituível, D-015 o ID gravado no RH manda, D-016 "vale a conferencia"; notas das ondas comissão, pessoas, operação e acabamento
perguntas_ao_dono: em docs/DECISOES.md e na seção 4 de Dre/fila-pcp-2026-10-11.md: prêmio de outubro antes de 31/10 (P-002 a P-005); resto da pergunta 3 (outubro só teste? pagamento a partir de 01/11? O.S. afetada inclui outros meses?); pergunta 4 (O.S. pendente no fechamento); pergunta 5 (ranking); falha comprovada desde a prévia ou só aprovada; retrabalho pelo celular fica "a definir"; 6, 7, 8, 10 a 18; GitHub P-021 a P-026 (inclui reescrever o histórico com dado real, P-023). Ações do dono na tela: designar o titular da aprovação em Configurações, usar o botão do RH "Gravar o ID nas fichas antigas", Thiago não fechar outubro, Thiago conferir a data de conferência da O.S. que ele já conhece (07/08 ou 07/10) e os apelidos dos carros
nao_fazer: não juntar f19 a f22t nem poda-valores-operacao; servidor ANTES da tela (functions.yml do painel com pcp_ref do ramo que contém a main, depois push na main e Deploy verde); conferir a versão no ar; não fechar outubro, não aprovar nem divulgar outubro como resultado; não classificar baixas em lote por script nem mexer nas de antes do corte; não restaurar o PCP só pelo arquivo do Hub; nenhum UPDATE automático em dado real; uma frente por vez nos arquivos quentes (app.js, performance.js, pcp-sync/index.ts, _shared/pcp-integridade.mjs, styles.css); não mexer no VEZ.md no ramo de trabalho; juntar a main só com rebase e vez.cjs conferir antes do push; nunca subir versão à mão (subir-versao.cjs --proxima, 85 lugares); a marca antiga por item está desligada por ENTREGA_ITEM.MARCAS_NOVAS=false (D-016): não religar; o arquivo de saída de um agente pequeno não prova que ele morreu (olhar a pasta antes de relançar)
testes: node scripts/verificar.cjs (Node 24) na v174 em 12/10/2026: 1997 testes, 1997 passam, 0 falham, 0 pulados; Deploy verde
dados: nenhuma migration aplicada (os arquivos de migration foram renomeados para AAAAMMDDHHMMSS; as duas aplicadas batem com a versão registrada no banco); nenhum dado real tocado (só SELECT de contagem); em produção, em 12/10: 0 fechamentos, 0 revisões de comissão, 0 versões de regra