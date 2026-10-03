# Implementação da auditoria PCP — 03/10/2026

## Global Constraints
Implementação autorizada pelo usuário em 03/10/2026 após auditoria. Não publicar, empurrar branches, fazer merge, alterar dados reais ou atribuir culpa a pessoas. Testar com dados fictícios. Preservar funções, registros, versões fechadas, autorização e redação de valores para perfis restritos. MESCLA_ITENS_ERP permanece false. Sem novo provedor de IA. Quantidades e centavos devem fechar e duas equipes podem conferir partes em dias diferentes. Regras confirmadas: 1% do valor líquido entregue elegível; 20% da comissão para montagem interna elegível, senão permanece externa; dupla externa 60% montador/40% auxiliar; falha comprovada zera apenas pontos e comissão da O.S. afetada. Outubro é teste; início efetivo em novembro requer decisão da gestão. Rateios internos, trios+, desempates e prêmios dependem de configuração explícita e validação humana. Não inventar padrão remuneratório nem aprovar automaticamente. A interface deve permitir resolver os cadastros ambíguos; não resolvê-los por nomes. Baixas ERP não provam entrega física, ausência de evidência não prova falta de entrega.

Repositório dedicado: /private/tmp/impresilk-entregas-parciais-20261002 (clone isolado, branch codex/auditoria-performance-experiencia, base 31ce5cf). Não reestruturar os monólitos fora do trecho necessário. Código modular novo é permitido para domínio coeso; atualizar scripts/index/sw quando adicionar runtime. Testes adequados aos riscos; sem testes meramente espelhando textos quando não forem contrato. Runtime Node: /Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Verificação completa: node scripts/verificar.cjs. Não criar subagentes. Não fazer commits de arquivos de outros agentes. Usar verificação antes de concluir e systematic-debugging em falhas.


## Task 1: Apuração de comissão e responsabilidade

### Global Constraints
Implementação autorizada pelo usuário em 03/10/2026 após auditoria. Não publicar, empurrar branches, fazer merge, alterar dados reais ou atribuir culpa a pessoas. Testar com dados fictícios. Preservar funções, registros, versões fechadas, autorização e redação de valores para perfis restritos. MESCLA_ITENS_ERP permanece false. Sem novo provedor de IA. Quantidades e centavos devem fechar e duas equipes podem conferir partes em dias diferentes. Regras confirmadas: 1% do valor líquido entregue elegível; 20% da comissão para montagem interna elegível, senão permanece externa; dupla externa 60% montador/40% auxiliar; falha comprovada zera apenas pontos e comissão da O.S. afetada. Outubro é teste; início efetivo em novembro requer decisão da gestão. Rateios internos, trios+, desempates e prêmios dependem de configuração explícita e validação humana. Não inventar padrão remuneratório nem aprovar automaticamente. A interface deve permitir resolver os cadastros ambíguos; não resolvê-los por nomes. Baixas ERP não provam entrega física, ausência de evidência não prova falta de entrega.

Repositório dedicado: /private/tmp/impresilk-entregas-parciais-20261002 (clone isolado, branch codex/auditoria-performance-experiencia, base 31ce5cf). Não reestruturar os monólitos fora do trecho necessário. Código modular novo é permitido para domínio coeso; atualizar scripts/index/sw quando adicionar runtime. Testes adequados aos riscos; sem testes meramente espelhando textos quando não forem contrato. Runtime Node: /Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Verificação completa: node scripts/verificar.cjs. Não criar subagentes. Não fazer commits de arquivos de outros agentes. Usar verificação antes de concluir e systematic-debugging em falhas.

### Execução e aceite adicional
Implementar motor compartilhado cliente/servidor e interface de demonstrativo/aprovação/configuração. Integrar ao período e exportação; dinheiro nunca depender só de cálculo no cliente. Ocorrências exigem origem, evidência e decisão confirmada; desconhecido fica pendente, não elegível automaticamente nem punido. Preservar regras antigas e fechamentos, novas versões append-only. Fatos do período fechado ficam imutáveis e diferenças na revisão apropriada existente. Não transformar ranking operacional em prêmio automático. Incluir teste 120 mil e parciais por equipes, centavos, fraude de aprovação e regressões de regras antigas. Pode tocar performance.js, regras.js, backend e store conforme necessário. Outros arquivos somente se integração exigir. Reportar pendências reais de configuração em vez de fingir apuração final aprovada.

### Itens aprovados da auditoria
### A02 P1 Concluir a regra da comissão e sua aprovação

**Evidência:** Regras mostra versão provisória; a Performance operacional não faz a apuração financeira completa. A reserva de 20% para montagem interna não está refletida nessa regra publicada.

**Ação:** implementar versão aprovada que aplique 1% somente à base efetivamente entregue elegível; destinar 20% da comissão à montagem interna elegível; distribuir o restante conforme 60% montador e 40% auxiliar, respeitando o rateio entre equipes. Se a montagem interna tiver retrabalho impeditivo, a parcela permanece com a equipe, conforme orientação do usuário. **Dono:** Direção, PCP e Financeiro. **Aceite:** demonstrativo por entrega com base, desconto, elegibilidade, rateios e centavos fechando; aprovação antes de exportar para pagamento.

Exemplo de entendimento, sem lançamento: R$ 120.000,00 de base elegível geram R$ 1.200,00 de comissão. Com montagem interna elegível: R$ 240,00 internos e R$ 960,00 externos, sendo R$ 576,00 ao montador e R$ 384,00 ao auxiliar de uma dupla. Sem essa destinação interna: R$ 720,00 e R$ 480,00. O rateio dos R$ 240,00 entre pessoas da montagem interna ainda precisa de regra explícita; não foi inventado nesta auditoria.

### A03 P1 Separar ocorrência de responsabilidade comprovada

**Evidência:** há retrabalhos sem causa raiz, e a regra provisória contém atraso, retrabalho e retorno antecipado. A orientação do usuário é zerar pontos e comissão da O.S. afetada por falha comprovada, incluindo retorno por serviço incompleto e má condução.

**Ação:** classificar ocorrência, evidência, origem e decisão, preservando abonos com justificativa. **Dono:** Gestão da operação. **Aceite:** falha de produção, mudança de cliente ou ocorrência sem apuração não corta automaticamente a comissão de quem instalou; uma O.S. afetada não zera todo o mês. Apresentar para validação os critérios adicionais de atraso e retorno antecipado já existentes.

### A20 P2 Tornar o ranking adequado ao reconhecimento

**Evidência:** equipes fixas, composições sem nome e pessoas sozinhas aparecem na mesma classificação; há quatro composições empatadas em segundo no recorte. **Ação:** definir elegibilidade, identidade da equipe ao longo do período, empate e tratamento de substituições. **Dono:** Direção e PCP. **Aceite:** ranking operacional continua consultável, mas campeão e prêmio dependem da regra aprovada e de revisão; não escolher vencedor anual usando apenas esse recorte.



## Task 2: Entrega coerente, filas de conferência e proteção de registros

### Global Constraints
Implementação autorizada pelo usuário em 03/10/2026 após auditoria. Não publicar, empurrar branches, fazer merge, alterar dados reais ou atribuir culpa a pessoas. Testar com dados fictícios. Preservar funções, registros, versões fechadas, autorização e redação de valores para perfis restritos. MESCLA_ITENS_ERP permanece false. Sem novo provedor de IA. Quantidades e centavos devem fechar e duas equipes podem conferir partes em dias diferentes. Regras confirmadas: 1% do valor líquido entregue elegível; 20% da comissão para montagem interna elegível, senão permanece externa; dupla externa 60% montador/40% auxiliar; falha comprovada zera apenas pontos e comissão da O.S. afetada. Outubro é teste; início efetivo em novembro requer decisão da gestão. Rateios internos, trios+, desempates e prêmios dependem de configuração explícita e validação humana. Não inventar padrão remuneratório nem aprovar automaticamente. A interface deve permitir resolver os cadastros ambíguos; não resolvê-los por nomes. Baixas ERP não provam entrega física, ausência de evidência não prova falta de entrega.

Repositório dedicado: /private/tmp/impresilk-entregas-parciais-20261002 (clone isolado, branch codex/auditoria-performance-experiencia, base 31ce5cf). Não reestruturar os monólitos fora do trecho necessário. Código modular novo é permitido para domínio coeso; atualizar scripts/index/sw quando adicionar runtime. Testes adequados aos riscos; sem testes meramente espelhando textos quando não forem contrato. Runtime Node: /Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Verificação completa: node scripts/verificar.cjs. Não criar subagentes. Não fazer commits de arquivos de outros agentes. Usar verificação antes de concluir e systematic-debugging em falhas.

### Execução e aceite adicional
Implementar estado derivado único de conferência de itens reutilizado nas telas indicadas e PDFs; preservar estados físicos legados. UI para classificar e acompanhar baixa ERP com responsável, motivo, revisão e evidência, sem aceitar automaticamente lote. Saídas antigas ganham regularização assistida com autoria e motivo. Fotos não preenchem hora do serviço implicitamente; anexado/recebido/evento separados, confirmar explicitamente. Exclusão apenas gestão admin/PCP com motivo; outros perfis mantêm edição operacional e fotos, com caminho de solicitar revisão. Recuperação visível para gestão se suportada, evitando excluir em teste real. Corrigir textos fotos e acessibilidade dos controles/dialog principal. Testar invariantes de quantidade e referências, ações no servidor, sessões restritas, uploads atrasados. Comissão da tarefa 1 deve consumir o estado coerente; alinhar integrações sem mudar decisões de negócio.

### Itens aprovados da auditoria
### A01 P1 Unificar os estados da entrega parcial

**Evidência:** 20980 tem finalizadaEm e checkout confirmado, mas a conferência por itens atribui só R$ 503,40 e informa saldo a conferir. O endpoint de conferência preserva os estados físicos existentes, conforme seu desenho atual.

**Ação:** criar visão única de declarado, conferido, entregue e pendente por item; sinalizar a divergência da finalização antiga. **Dono sugerido:** PCP e desenvolvimento. **Aceite:** a mesma O.S. mostra saldo coerente em ficha, Finalizados, Entregas, Performance e PDF; outras equipes podem entregar o restante sem duplicar quantidade ou valor. Nenhuma reabertura retroativa automática.

### A04 P1 Tratar as 68 baixas do ERP pendentes

**Evidência:** 68 O.S., R$ 290.652,02 conhecidos e três valores ausentes; a mais antiga, de 15/09, tinha 17 dias.

**Ação:** fila diária com responsável, classificação da diferença e evidência. **Dono:** PCP, com apoio comercial. **Aceite:** cada caso termina como entrega total, parcial, retirada, baixa administrativa ou divergência a resolver; nenhuma baixa é aceita em lote sem conferência. O valor conhecido não é “receita perdida”.

### A05 P1 Distinguir hora do fato da hora do anexo

**Evidência:** ficha informa que a primeira foto preenche saída ou retorno quando vazios; código confirma esse comportamento.

**Ação:** guardar “capturado/anexado em”, “ocorrido em” e “recebido em” separadamente; pedir confirmação de horário para foto enviada depois. **Dono:** Desenvolvimento e PCP. **Aceite:** enviar hoje uma foto de ontem não transforma hoje no horário real do serviço nem cria punição automática; manter trilha de correção.

### A06 P1 Revisar autorização de exclusão por perfil

**Evidência:** o servidor bloqueia exclusão para crachá individual sem senha, mas a lista geral de escrita inclui montagem e operação autenticadas; o caso delete não exige outro papel específico. Trata-se de exclusão lógica, com registro preservado.

**Ação:** decidir se esses perfis devem excluir O.S. ou apenas solicitar revisão. Recomenda-se reservar exclusão à gestão, com motivo e recuperação visível. **Dono:** Direção e desenvolvimento. **Aceite:** matriz de permissão validada também no servidor, com testes de leitura, escrita, exclusão e fotos; não depender apenas de esconder botões. Não foi executada tentativa de exclusão real.

### A08 P2 Criar rotina para saídas antigas

**Evidência:** 14 saídas antigas a conferir, separadas de uma saída atual sem retorno. **Ação:** dono, última informação, prazo de conferência e motivo da regularização. **Dono:** Expedição. **Aceite:** registros antigos deixam de contaminar leitura de equipes na rua e duração; alterações retrospectivas mantêm autoria.

### A21 P3 Corrigir textos e acessibilidade pontuais

**Evidência:** checklist mostrou “Falta 0 fotos de antes e 0 de depois” com zero anexos; a intenção era dizer que nenhuma foto havia sido registrada. Alguns controles de itens usam apenas ✓, ✗ ou ×; a ficha principal não apareceu como diálogo nomeado na árvore consultada.

**Ação:** texto direto sobre quantidade necessária, nomes acessíveis por item, diálogo com título e foco, e revisão dos estados recolhidos. **Dono:** Design e desenvolvimento. **Aceite:** navegação por teclado e leitor de tela identifica ação, item e resultado; manter atalhos já existentes.



## Task 3: Operação, experiência e inteligência de prioridades

### Global Constraints
Implementação autorizada pelo usuário em 03/10/2026 após auditoria. Não publicar, empurrar branches, fazer merge, alterar dados reais ou atribuir culpa a pessoas. Testar com dados fictícios. Preservar funções, registros, versões fechadas, autorização e redação de valores para perfis restritos. MESCLA_ITENS_ERP permanece false. Sem novo provedor de IA. Quantidades e centavos devem fechar e duas equipes podem conferir partes em dias diferentes. Regras confirmadas: 1% do valor líquido entregue elegível; 20% da comissão para montagem interna elegível, senão permanece externa; dupla externa 60% montador/40% auxiliar; falha comprovada zera apenas pontos e comissão da O.S. afetada. Outubro é teste; início efetivo em novembro requer decisão da gestão. Rateios internos, trios+, desempates e prêmios dependem de configuração explícita e validação humana. Não inventar padrão remuneratório nem aprovar automaticamente. A interface deve permitir resolver os cadastros ambíguos; não resolvê-los por nomes. Baixas ERP não provam entrega física, ausência de evidência não prova falta de entrega.

Repositório dedicado: /private/tmp/impresilk-entregas-parciais-20261002 (clone isolado, branch codex/auditoria-performance-experiencia, base 31ce5cf). Não reestruturar os monólitos fora do trecho necessário. Código modular novo é permitido para domínio coeso; atualizar scripts/index/sw quando adicionar runtime. Testes adequados aos riscos; sem testes meramente espelhando textos quando não forem contrato. Runtime Node: /Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Verificação completa: node scripts/verificar.cjs. Não criar subagentes. Não fazer commits de arquivos de outros agentes. Usar verificação antes de concluir e systematic-debugging em falhas.

### Execução e aceite adicional
Implementar melhorias concretas em todas as áreas: fonte/cobertura clicável dos totais; aliases de veículos confirmados por ID/placa (não auto-unir); agenda cruza disponibilidade e duração conhecida sem declarar sobreposição por manhã apenas; custo de retrabalho desconhecido distinto de zero e correção ligada à original; celular mostra primeiro resultado e mantém usabilidade; loading não gera falsos erros; normalização de categoria controlada que conserva descrição; freelancers ativos no quadro operacional com mesma identidade confirmada e privacidade RH; rótulos cobertura. Assistente determinístico com no máximo cinco ações, motivo, origem/data, O.S. e atalho; não chamar IA externa nem autoalterar registros. Pendências configuráveis aparecem no sistema com ação e dono, sem preencher sem evidência. Validar UI local desktop e mobile por CUA, fixture segura existente. Respeitar apuração e fluxos criados nas tarefas anteriores.

### Itens aprovados da auditoria
### A07 P2 Nomear corretamente os números de Entregas

**Evidência:** resumo ERP de outubro e ranking PCP possuem populações e critérios distintos. **Ação:** explicitar fonte, tipo de fato, período e cobertura junto a cada total. **Dono:** Produto e PCP. **Aceite:** clicar em qualquer total abre exatamente os registros que o compõem; nunca somar ERP e PCP como duas receitas.

### A09 P2 Consolidar veículos por cadastro estável

**Evidência:** aparecem Fiat Uno e UNO - 10; Iveco 40 e caminhão 40, além da união de listas antigas com os veículos atuais. **Ação:** conferir equivalência por placa e vincular aliases. **Dono:** Frota e PCP. **Aceite:** um mesmo veículo físico conta uma vez na agenda e nos conflitos. Os pares citados são candidatos a revisão, não duplicidades declaradas sem validação.

### A10 P2 Planejar por capacidade e disponibilidade

**Evidência:** conflitos possíveis e escalas sem equipe/veículo na aba Instalação; a fonte do RH já disponibiliza ausências. **Ação:** cruzar duração, agenda, indisponibilidade e veículo. **Dono:** PCP. **Aceite:** explicar o motivo de cada alerta e permitir revisão humana; não bloquear dois serviços apenas por ocorrerem na mesma manhã.

### A11 P2 Completar causa e custo dos retrabalhos

**Evidência:** quatro pendências sem causa raiz completa; custos/hora e km não configurados. **Ação:** abertura de correção ligada à original, material, tempo, deslocamento e plano de prevenção. **Dono:** Qualidade e PCP. **Aceite:** mostrar “custo não medido” em vez de sugerir custo zero; impedir dupla contagem entre original e correção.

### A12 P2 Compactar a experiência no celular

**Evidência:** em 390 × 844, o primeiro título de equipe ficou aproximadamente a 974 px do topo; o calendário começou perto do fim da primeira tela. **Ação:** título e período em uma linha, filtro avançado recolhido, uma ação principal, exportação em menu e agenda do dia. **Dono:** Design e desenvolvimento. **Aceite:** o primeiro resultado aparece na primeira tela; manter alvos confortáveis, textos legíveis, teclado e foco corretos.

### A13 P2 Não mostrar erro de cadastro enquanto carrega

**Evidência:** Performance mostrou 86% com equipe e pendência de valor/equipe antes de receber a apuração; depois passou a 100% confirmado. **Ação:** estado de carregamento ou dados anteriores identificados até concluir leitura. **Dono:** Desenvolvimento. **Aceite:** abrir ou trocar período não acusa falta de equipe transitória; falha de rede real aparece separadamente de cadastro incompleto.

### A14 P2 Unificar categoria de serviço e preservar descrição

**Evidência:** filtro contém ADESIVO, adesivo, ADESIVOS e muitas descrições específicas de pedidos. **Ação:** categoria controlada e pesquisável, mantendo a descrição original. **Dono:** Cadastro e PCP. **Aceite:** análises agrupam variações da mesma categoria sem alterar contratos, preços ou descrições históricas.

### A15 P2 Completar identidade de pessoas e equipes

**Evidência:** aliases de pessoas ainda convivem com IDs; quatro nomes compartilham ficha e existe um marcador Terceiro sem ficha. O quadro Equipe hoje não apresentou Osmane, enquanto a operação e a Performance o incluem como freelancer.

**Ação:** manter equivalências confirmadas; distinguir colaborador, freelancer e marcador sem pessoa. Explicar a cobertura de cada quadro e incluir os contratados ativos necessários ao planejamento. **Dono:** RH e PCP. **Aceite:** todos os envolvidos no dia aparecem com identidade correta, sem inferir parentesco, duplicidade ou vínculo apenas pelo nome. Férias e ausências devem ser exibidas somente ao perfil que precisa dessas informações.

### A17 P2 Evidenciar qualidade e completude do dado

**Evidência:** 0% de retrabalho pode coexistir com quatro correções abertas; Tudo conferido pode coexistir com saldo de itens a conferir. **Ação:** rótulos específicos de cobertura e período. **Dono:** Produto. **Aceite:** “Participações confirmadas” não significa “todas as entregas concluídas”; zero, desconhecido e não aplicável têm representações distintas.

### A22 P3 Implantar um assistente de prioridades com evidência

**Evidência:** o sistema já reúne agenda, pendências, equipe, saldo e ERP, mas as decisões ficam distribuídas em várias abas. **Ação:** resumo diário com cinco ações prioritárias e motivo; sugestão de próxima etapa; busca por O.S.; dicas contextuais e histórico da melhoria. **Dono:** PCP e produto. **Aceite:** toda sugestão aponta a O.S., origem e data; não altera registros, envia mensagens ou penaliza pessoas automaticamente. Qualquer uso futuro de IA deve seguir o provedor autorizado e o acesso de cada perfil.



### A23 P1 Gestão de equipes e vínculo correto no ranking (pedido adicional 03/10)

Usuário criou Águia, mas ela aparece como “Sem entrega no período” enquanto composições sem nome continuam no ranking. Implementar uma vista específica Gestão de equipes dentro de Performance (não confundir com cadastro de pessoas no botão Equipe do topo), com listagem/pesquisa/ativas/inativas e edição de nome/logo/animal/cor, líder, integrantes e alertas de identidade. Separar alteração do cadastro atual de atribuição histórica. Criar conferência que mostre composições/entregas candidatas e permita à gestão associar explicitamente entregas à equipe correta, mostrando antes/depois e impacto, com assinatura, controle de concorrência e preservação de revisão fechada. Não unir apenas pelo nome nem reaplicar composição atual a todo histórico. O cadastro sem entregas deve explicar o motivo e ter atalho Conferir vínculos. Garantir que equipe gravada aparece imediatamente na gestão e que vínculo confirmado reflita o ranking da base aberta, inclusive parciais e duas equipes. Testar Águia criada depois da entrega, composição coincidente/ambígua, substituição, equipe inativa e revisão fechada. Nenhuma associação em dados reais nesta rodada.

## Task 4: Relatórios, recuperação e integração final

### Global Constraints
Implementação autorizada pelo usuário em 03/10/2026 após auditoria. Não publicar, empurrar branches, fazer merge, alterar dados reais ou atribuir culpa a pessoas. Testar com dados fictícios. Preservar funções, registros, versões fechadas, autorização e redação de valores para perfis restritos. MESCLA_ITENS_ERP permanece false. Sem novo provedor de IA. Quantidades e centavos devem fechar e duas equipes podem conferir partes em dias diferentes. Regras confirmadas: 1% do valor líquido entregue elegível; 20% da comissão para montagem interna elegível, senão permanece externa; dupla externa 60% montador/40% auxiliar; falha comprovada zera apenas pontos e comissão da O.S. afetada. Outubro é teste; início efetivo em novembro requer decisão da gestão. Rateios internos, trios+, desempates e prêmios dependem de configuração explícita e validação humana. Não inventar padrão remuneratório nem aprovar automaticamente. A interface deve permitir resolver os cadastros ambíguos; não resolvê-los por nomes. Baixas ERP não provam entrega física, ausência de evidência não prova falta de entrega.

Repositório dedicado: /private/tmp/impresilk-entregas-parciais-20261002 (clone isolado, branch codex/auditoria-performance-experiencia, base 31ce5cf). Não reestruturar os monólitos fora do trecho necessário. Código modular novo é permitido para domínio coeso; atualizar scripts/index/sw quando adicionar runtime. Testes adequados aos riscos; sem testes meramente espelhando textos quando não forem contrato. Runtime Node: /Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node. Verificação completa: node scripts/verificar.cjs. Não criar subagentes. Não fazer commits de arquivos de outros agentes. Usar verificação antes de concluir e systematic-debugging em falhas.

### Execução e aceite adicional
Implementar relatório diagnóstico de identidade dos itens com ambiguidades sem habilitar merge automático. Todos os PDFs dos fluxos PCP: filtros, fonte, consulta, versão, paginação, nomes e valores sem corte, autorização de valores, conteúdo independente de accordion fechado; adicionar PDF de Volta do carro. Testar recuperação fora de produção com fixture completa incluindo OS/fotos/conferências/regras/auditoria, entregar script e relatório reproduzível; nunca afirmar restauração real da nuvem. Alertas deduplicados de fila/sincronização antiga, sem criar agendamento externo. Executar verificação completa e atualizar documentação com cobertura de A01–A22, separando função implementada de saneamento de dados e decisões de gestão pendentes. Versão candidata nova somente local, sem publicar. Revisão visual PDF em dados fictícios. Atualizar assets/serviceworker de maneira coerente para publicação futura.

### Itens aprovados da auditoria
### A16 P2 Medir a identidade dos itens antes de automatizar mescla

**Evidência:** 2.208 itens nos registros não excluídos; 1.808 sem uid persistido, dos quais 224 em registros classificados pela consulta como não finalizados e não arquivados. Nenhum uid preenchido repetido dentro da mesma O.S. foi encontrado. Existem referências alternativas e atribuição de identidade durante os fluxos; ausência de uid não significa entrega perdida.

**Ação:** medir os identificadores reais do ERP, revisar ambiguidades e planejar migração de referências sem trocar itens por posição. **Dono:** Integrações. **Aceite:** reordenar itens não move uma entrega para outro produto; manter MESCLA_ITENS_ERP desligada até comprovar o mapeamento seguro.

### A18 P2 Revisar PDF por aba e por tipo de usuário

**Evidência:** Entregas, Performance, ficha, Retrabalho, Plantões e Programação possuem caminhos de PDF; não foi localizado um PDF dedicado na fila Volta do carro. **Ação:** padrão único com filtros, fonte, data da consulta, identificação da revisão e paginação. **Dono:** Desenvolvimento. **Aceite:** tabelas extensas não cortam nomes/valores, cabeçalhos repetem, áreas recolhidas não somem indevidamente e perfis sem acesso a valores não recebem esses valores no PDF.

### A19 P2 Ensaiar recuperação e acompanhar sincronização

**Evidência:** sincronização atual bem-sucedida, fila local vazia e controle de concorrência presente. Isso não comprova uma restauração integral. **Ação:** teste periódico de recuperação fora da produção e alertas de atraso da carga/fila. **Dono:** Tecnologia. **Aceite:** comprovar recuperação de O.S., fotos, conferências, regras e auditoria; avisar sem duplicar notificações.

