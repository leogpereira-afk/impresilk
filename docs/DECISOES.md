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
- D-005 · 03/10/2026 · Outubro é teste; o início efetivo em novembro depende de decisão da gestão · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 3 · codex, copiado pelo claude · comissão (outubro não exporta pagamento)
- D-006 · 03/10/2026 · Rateio interno, equipe solo, trios ou mais, desempate e prêmios só com configuração explícita e validação humana; nada de aprovar nem premiar automaticamente · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linhas 12 e 30 (A02 e A20) · codex, copiado pelo claude · comissao.js, ranking
- D-007 · 03/10/2026 · Baixa do ERP não prova entrega física, e falta de evidência não prova falta de entrega · fonte: docs/plano-auditoria-pcp-2026-10-03.md, linha 4, e docs/entrega-auditoria-pcp-2026-10-03.md, linha 5 · codex, copiado pelo claude · entregas, conferência e comissão (cada entrega paga exige a marca de entrega física comprovada)

## Pendentes (NÃO valem como regra até o dono responder)

Quando o dono responder, a resposta vira uma D-NNN nova, com a frase dele, e a
pendente ganha `RESPONDIDA em AAAA-MM-DD por D-NNN`.

- P-001 (A3 da auditoria de 11/10/2026) · aberta em 11/10/2026 por claude · Retrabalho e atraso tiram ponto e comissão sozinhos ou só com falha comprovada? Hoje convivem duas regras: o plano de 29/09 diz "retrabalho, venha de onde vier, zera na hora" e conta o atraso pela primeira agenda congelada; a confirmação de 03/10 (D-004) diz que só a falha comprovada da instalação zera. A ficha e a vista Por O.S. (regras.js) seguem a de 29/09; a comissão segue a de 03/10; o ranking e a Nota não descontam nada. A pergunta ao dono: "Retrabalho marcado na O.S. tira os pontos e a comissão daquela O.S. sozinho, como foi decidido em 29/09 (venha de onde vier), ou só depois de a gestão registrar falha comprovada da instalação, como foi confirmado em 03/10? Se for só com falha comprovada, retrabalho com origem em Medição, Arte ou Produção pode virar falha da instalação? O atraso tira ponto sozinho? Se tira, por qual prazo: a primeira agenda congelada contra a finalização (ficha) ou a previsão do ERP contra a entrega do ERP (relatório)? O retorno antecipado continua no programa?" · Depois da resposta: uma régua só na ficha, no Por O.S., no ranking e na comissão, com a versão gravada em performance_regras.
