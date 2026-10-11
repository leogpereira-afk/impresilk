# Decisões do dono (só se acrescenta)

Uma entrada por decisão: `D-NNN · data · a regra · fonte · registrado por · onde se aplica`.
Quando houver a frase do dono, ela vai entre aspas. Decisão que muda outra diz
`substitui D-NNN` (ou o plano que substitui); na antiga se acrescenta
`SUPERADA por D-NNN em AAAA-MM-DD`. Nada se apaga.

Sem dado real: nada de nome, ID do RH, número de O.S. ou valor de cliente. Os
exemplos em R$ são fictícios.

Se um plano (de qualquer agente, dentro ou fora do repositório) disser outra
coisa, vale a decisão daqui.

## Confirmadas

- D-001 · 03/10/2026 · Comissão = 1% do valor líquido entregue elegível · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4 ("Regras confirmadas"), e docs/entrega-auditoria-pcp-2026-10-03.md, linha 12 (A02) · registrado pelo codex em 03/10, copiado aqui pelo claude em 11/10 · comissao.js e _shared/pcp-comissao.mjs · Substitui a regra de comissão do plano de 29/09 (plano-programa-equipes-2026-09-29.md, na pasta Dre do dono: "1% só na O.S. que pontua"; o corpo do mesmo plano ainda fala em 0,5%). Exemplo fictício: R$ 120.000,00 de base elegível dão R$ 1.200,00 de comissão.
- D-002 · 03/10/2026 · 20% da comissão vão para a montagem interna elegível; sem ela (não aplicável ou impedida, com decisão registrada), essa parte fica com a equipe externa · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 12 · codex, copiado pelo claude · comissao.js e _shared/pcp-comissao.mjs
- D-003 · 03/10/2026 · Dupla externa: 60% para o montador e 40% para o auxiliar · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 12 · codex, copiado pelo claude · comissao.js e _shared/pcp-comissao.mjs
- D-004 · 03/10/2026 · Falha COMPROVADA zera só os pontos e a comissão da O.S. afetada; uma O.S. afetada não zera o mês, e ocorrência sem evidência ou de origem desconhecida não corta ninguém · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4 e A03, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 13 · codex, copiado pelo claude · comissao.js e performance.js · O que conta como falha para retrabalho e atraso ainda está aberto: ver P-001.
  - Nota de 11/10/2026 (claude): a D-004 NÃO decide retrabalho nem atraso. Os dois seguem pendentes na P-001, sem regra valendo: nem a de 29/09 ("venha de onde vier") nem uma leitura da D-004 que a estenda a eles.
- D-005 · 03/10/2026 · Outubro é teste; o início efetivo em novembro depende de decisão da gestão · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 3 · codex, copiado pelo claude · comissão (outubro não exporta pagamento)
- D-006 · 03/10/2026 · Rateio interno, equipe solo, trios ou mais, desempate e prêmios só com configuração explícita e validação humana; nada de aprovar nem premiar automaticamente · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linhas 12 e 30 (A02 e A20) · codex, copiado pelo claude · comissao.js, ranking
- D-007 · 03/10/2026 · Baixa do ERP não prova entrega física, e falta de evidência não prova falta de entrega · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 5 · codex, copiado pelo claude · entregas, conferência e comissão (cada entrega paga exige a marca de entrega física comprovada)
- D-008 · 30/09/2026 · A E6 (cartão "Entregue por item" e "Saldo a entregar" em Entregas) foi RETIRADA pelo dono: não fazer sem novo pedido · fonte: conversa do dono com o Claude em 30/09/2026, registrada na memória do Claude (project_pcp_avaliacao_individual.md); o plano de entrega por item de 29/09 (pasta Dre) ainda descreve a E6 · registrado pelo claude em 11/10 · Entregas
- D-009 · 30/09/2026 · Na O.S. cancelada no ERP, a declaração de entrega feita pelo celular fica sem conferência para sempre ("está sim", resposta do dono à pergunta se era isso) · fonte: conversa do dono com o Claude em 30/09/2026, registrada na memória do Claude (project_pcp_avaliacao_individual.md) · registrado pelo claude em 11/10 · conferência de entrega (E5) e O.S. cancelada

## Pendentes (NÃO valem como regra até o dono responder)

Quando o dono responder, a resposta vira uma D-NNN nova, com a frase dele, e a
pendente ganha `RESPONDIDA em AAAA-MM-DD por D-NNN`.

- P-001 (A3 da auditoria de 11/10/2026) · aberta em 11/10/2026 por claude · Retrabalho e atraso tiram ponto e comissão sozinhos ou só com falha comprovada? Hoje convivem duas regras: o plano de 29/09 diz "retrabalho, venha de onde vier, zera na hora" e conta o atraso pela primeira agenda congelada; a confirmação de 03/10 (D-004) diz que só a falha comprovada da instalação zera. A ficha e a vista Por O.S. (regras.js) seguem a de 29/09; a comissão segue a de 03/10; o ranking e a Nota não descontam nada. A pergunta ao dono: "Retrabalho marcado na O.S. tira os pontos e a comissão daquela O.S. sozinho, como foi decidido em 29/09 (venha de onde vier), ou só depois de a gestão registrar falha comprovada da instalação, como foi confirmado em 03/10? Se for só com falha comprovada, retrabalho com origem em Medição, Arte ou Produção pode virar falha da instalação? O atraso tira ponto sozinho? Se tira, por qual prazo: a primeira agenda congelada contra a finalização (ficha) ou a previsão do ERP contra a entrega do ERP (relatório)? O retorno antecipado continua no programa?" · Depois da resposta: uma régua só na ficha, no Por O.S., no ranking e na comissão, com a versão gravada em performance_regras.
  - Enquanto a P-001 estiver aberta: NÃO mudar a régua de perdas da ficha, do Por O.S., do ranking nem da comissão (M1, M2 e M3 esperam a resposta). Mostrar a ocorrência como "a decidir pela gestão" é permitido; zerar ou deixar de zerar por conta própria, não.

As perguntas abaixo são as da seção 6 da auditoria de 11/10/2026 (plano em
docs/planos/2026-10-11-auditoria-v164.md), uma por item, sem dado real. Todas
abertas em 11/10/2026 por claude.

- P-002 (prêmio, M35) · Que número define a campeã de outubro: o valor conferido ou os pontos da comissão? Responder antes de 31/10/2026.
- P-003 (prêmio, M35) · Qual é o desempate?
- P-004 (prêmio, M35) · Quem recebe a cesta: os integrantes com cota? O freelancer entra?
- P-005 (prêmio, M35) · Outubro, que é teste (D-005), premia mesmo?
- P-006 (comissão, M5) · A aprovação fica só com admin, ou com uma pessoa diferente do autor da prévia (o servidor recusaria com 403 se for a mesma)?
- P-007 (comissão) · A equipe solo leva 100% sem justificativa caso a caso?
- P-008 (comissão, M36) · Outubro roda como teste da comissão ou fica só no ranking?
- P-009 (comissão, M36) · Quem documenta as evidências de entrega e de falha?
- P-010 (comissão) · "O.S. afetada" (D-004) inclui outros meses e outras equipes da mesma O.S.?
- P-011 (ranking, M9) · Qual lista vale para reconhecimento: as equipes fixas ou todas (com composições e avulsos)?
- P-012 (ranking) · O crachá sem senha pode ver a cota de um colega avulso? Se não, agrupar os avulsos numa linha só.
- P-013 (ranking) · Setembro entra no ranking ou fica como histórico?
- P-014 (ranking) · Operação e comercial podem ver as cotas dos colegas? (decidir antes de criar a primeira conta desses papéis)
- P-015 (Demandas, M28) · Fronteira: produção e instalação no PCP, gestão e consultorias no Painel?
- P-016 (Demandas, M28) · Uma regra de acesso só: lê quem está na ficha, mais a gestão?
- P-017 (Demandas, M30) · A chave da pessoa nas Demandas: o ID de 6 dígitos ou a chave interna da ficha do RH?
- P-018 (entrega por item, M13) · Valem as marcas antigas por item (E3) ou a conferência nova?
- P-019 (backup, M22) · Pagar o computador Small mais o PITR (cerca de US$ 115 por mês a mais) ou ficar com a exportação própria (M20 e A2)?
- P-020 (backup, M22) · Autoriza um ensaio de "Restore to a new project" no Supabase?
- P-021 (GitHub) · Ligar no GitHub uma regra na main que exija o check Deploy? Sem ela, a conferência da vez barra a publicação mas não o push, e o deploy.yml do próprio push pode tirar o passo.
  - Nota de 11/10/2026 (claude, revisão final): NÃO ligar a regra como está escrita. O Deploy só roda no push da main (e no Run workflow), com o commit já na main; uma regra que exige o check Deploy pede o check ANTES de aceitar o push e recusaria todo push na main, inclusive os da vez. Se o dono quiser essa trava, antes é preciso desenhar o caminho: fluxo por PR (deploy.yml também em pull_request) ou um bypass para o dono.
- P-022 (GitHub e ramos) · Apagar da origem os 3 ramos velhos (docs/RAMOS.md), os 2 ramos locais sem nada próprio, e arquivar com tag o poda-valores-operacao? Remover os worktrees f19 a f22t depois de guardar o trabalho sem commit do f22s e do f22t?
- P-023 (GitHub, M27) · Reescrever o histórico do git para tirar o dado real dos documentos antigos, ou só corrigir daqui para frente?
- P-024 (pequena) · A baixa do ERP de antes do corte de 15/09 pode ser reclassificada?
- P-025 (pequena) · Ao tirar pessoa da divisão: confirm() (como voltou na v161) ou Desfazer (como a F24 fez)?
- P-026 (painel, revisão de 11/10) · Mover o segredo SUPABASE_ACCESS_TOKEN do painel-impresilk para o environment "publicar-functions", com a política "só a main"? Sem isso, um disparo a partir de um ramo velho do painel (há dois, codex/comercial-20261007 e codex/compromissos-20261008, sem a trava) recebe o token. E apagar ou juntar esses dois ramos?
  - Nota de 11/10/2026 (claude, revisão final): a ORDEM importa. (1) O patch da trava na main do painel, com um run verde do functions.yml; (2) criar o environment publicar-functions com a política "só a main" e pôr o segredo nele; (3) um run verde lendo o segredo do environment; (4) só então apagar o segredo do repositório. Apagar antes de (1) deixa sem token o functions.yml e o functions-sistemas.yml da main de hoje (não declaram environment): os pushes do Marketing que mexem em supabase/functions deixam de publicar e o cron fica vermelho de hora em hora.
