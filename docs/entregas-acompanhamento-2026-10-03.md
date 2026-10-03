# Acompanhamento de entregas — prévia para revisão

Filtros de período, técnico e serviço no topo; chips por instalação, retirada, baixa a lançar no PCP, ficha sem equipe e valor desconhecido. Os chips usam a mesma lista ERP da tabela e alimentam o total principal e os dois gráficos. Os cartões auxiliares continuam identificados como mês/ano correntes. Os filtros próprios de Por O.S. continuam independentes e com aviso.

O gráfico de volume agrupa baixas por data (por mês para períodos acima de 45 dias), com posições proporcionais ao tempo e pontos identificados. Datas sem registros não recebem zeros inventados; falhas de carga aparecem como leitura parcial. O quadro de composição mostra instalações e retiradas com contagens, participação e cobertura do cadastro.

A fila geral continua abrangendo todos os períodos, técnicos e tipos, com esse escopo explícito. Conferências físicas são um bloco independente: O.S. com conferência no período, saldo atual e chips de parcial, concluído e inconsistente. Nenhum valor ERP é somado ao valor físico. As ações existentes de conferência, relatórios e fechamento do dia permanecem.

Prévia isolada: `PORT=4217 node scripts/preview-auditoria.cjs`, endereço `http://127.0.0.1:4217/#aba=entregas`. Somente dados fictícios, sem acesso a produção.

Validação visual: desktop e 390px, sem alargamento da página. Retiradas: total e tabela conferidos; conferência sem resultado: estado vazio e retorno a Todas conferidos. Testes cobrem filtros, valor desconhecido versus zero, ficha ausente versus equipe ausente, pendência anterior ao período, indicação de dados incompletos e saldo atual das conferências.

Publicação autorizada pelo usuário em 03/10/2026. Versão preparada: v149. Nenhuma gravação de dados ou alteração de servidor.

Resultado final: 1.451 testes passaram, zero falhas, com `TZ=America/Sao_Paulo node --test --test-concurrency=2 tests/*.test.cjs`. `npm run verificar` executou a checagem de sintaxe e a suíte; no paralelismo padrão, um benchmark de 100 ms variou para 156,9 ms. O arquivo passou isoladamente (15 testes) e a suíte completa passou com concorrência controlada, sem mudar o limite do benchmark. Outra execução paralela interrompeu um processo de testes; os 27 casos desse arquivo passaram isoladamente. Nenhuma regra foi relaxada.
