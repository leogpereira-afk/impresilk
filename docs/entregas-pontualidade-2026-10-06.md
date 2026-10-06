# Relatórios de entregas: pontualidade e organização da tela

## Resultado preparado

O relatório compara a previsão do Mubisys com a entrega efetiva da mesma O.S. Os filtros de ano, mês e indicadores ficam agrupados no topo, sem herdar a grade da lista principal de Entregas que deixava o painel desproporcional.

O quadro apresenta percentual no prazo, percentual com atraso, atraso médio e maior atraso entre as atrasadas, além das O.S. sem datas válidas. A conferência por O.S. mostra cliente, previsão, entrega e dias de diferença, com filtro por resultado. O total anual inclui uma tabela mensal.

## Regras de cálculo

- Período: mês da entrega efetiva, incluindo retiradas registradas como entregues no ERP.
- No prazo: entrega efetiva anterior ou igual à previsão.
- Atrasada: entrega efetiva posterior à previsão.
- Dias de atraso: diferença entre as datas, em dias corridos.
- Percentuais: quantidade da categoria dividida pelas O.S. com as duas datas válidas. O valor em dinheiro não pondera o índice.
- Atraso médio: soma dos dias de atraso dividida somente pela quantidade de atrasadas.
- Total anual: soma das quantidades, sem média simples de percentuais mensais.
- Sem datas válidas: excluída dos percentuais e exibida separadamente. Sem base comparável é mostrado “Sem base”.
- Meses sem fonte: explicitamente sinalizados como comparativo incompleto. Pedidos em aberto e meses futuros não entram.

## Origem e limites

O relatório utiliza os pacotes mensais de entregas já importados pelo PCP. `data` contém a entrega efetiva e `previsao` a previsão trazida do Mubisys. A fonte existente pode calcular uma previsão a partir do prazo cadastrado quando o ERP não fornece uma data explícita; esta alteração não cria outro cálculo de previsão.

A comparação reflete a última sincronização do ERP: não congela uma promessa original e não usa a primeira agenda do PCP. Alterações posteriores na previsão do Mubisys podem mudar o resultado após uma nova carga. Não modifica O.S., abonos, comissões, permissões ou o importador.

A conferência por O.S. carrega 50 linhas por vez. “Mostrar mais 50” amplia a lista. A prévia do PDF mantém o filtro e a quantidade de linhas mostradas, com a indicação “Exibindo … de …”.

## Verificação

- Verificação final de sintaxe e suíte completa: 1.510 testes aprovados, zero falhas, em 06/10/2026. Diferenças sem erros de espaços em branco.
- Testes de servidor: preservação das duas datas, distinção entre mês vazio e fonte ausente, deduplicação da mesma O.S. no mês e ausência de gravações.
- Testes de cálculo: antecipação, mesma data, atraso, datas inválidas, virada do ano, ano bissexto, totais anuais, falta de base, seleção de mês, filtro e paginação.
- Prévia local com dados fictícios: filtros reorganizados, comparação mensal e anual, conferência por O.S., filtro de atrasos, paginação, prévia de impressão e adaptação a celular de 390 px.
- A publicação exige primeiro a função `pcp-sync` e depois a tela v155, mantendo a compatibilidade dos arquivos de cache. A implantação não foi executada nesta etapa.

## Arquivos

`relatorios-entregas.js`, `styles.css`, `supabase/functions/pcp-sync/index.ts`, `tests/pontualidade-entregas.test.cjs` e `scripts/preview-auditoria.cjs`. Os arquivos `config.js`, `sw.js`, `index.html`, `equipe.html` e `ranking.html` recebem a versão v155 para a atualização coordenada do cache na publicação.
