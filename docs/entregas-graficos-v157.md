# Relatórios de entregas — v157

## Mudanças

- Gráfico mensal de pontualidade: percentuais de O.S. no prazo e com atraso. Mantém a régua do Mubisys: data prevista comparada à entrega efetiva, por dias corridos, considerando antecipações no prazo.
- Seleção do mês/ano inicial e final, inclusive entre anos. Atalhos de ano e mês. Datas futuras não são consideradas entregas.
- Previsão descritiva e tendência linear podem ser ativadas separadamente nos gráficos de pontualidade e de produção, vendas e recebimentos. Começam desligadas.
- Cartões de pontualidade e indicadores financeiros menores, com adaptação ao celular.
- Pontos reais continuam abrindo os detalhes. Estimativas não são registros de O.S.

## Regras estatísticas

A previsão é uma referência constante para os três meses posteriores à base: média dos três últimos meses completos e consecutivos do intervalo selecionado. Mostra também mediana e mínimo/máximo observados. Na pontualidade, a média é ponderada pela quantidade de O.S. comparáveis; a mediana e a faixa descrevem as taxas mensais. A faixa sombreada **não é intervalo de confiança**.

A tendência usa regressão linear dos meses completos disponíveis no recorte, com pelo menos três meses válidos, respeitando a distância real do calendário. Os meses têm o mesmo peso na regressão. A linha fica no intervalo observado, e percentuais são limitados a 0–100%.

Meses em andamento, números ausentes e bases incompletas de pontualidade não entram no modelo. A previsão exige os três meses válidos consecutivos ao final da base completa; uma lacuna impede sua apresentação. Ausência de dados não vira zero. Sem ajuste sazonal e sem promessa de resultado.

O gráfico financeiro preserva totais negativos existentes e o gráfico de retrabalho preserva sua escala própria. Nenhuma dessas análises altera pedidos, datas, pagamentos, abonos ou comissões.

## Verificação

Verificação completa em 06/10/2026: 1.530 testes aprovados, zero falhas e zero testes ignorados. Revisão de diferenças sem erros de whitespace.

Testes cobrem médias ponderadas, mediana, faixa, meses parciais, lacunas, regressão, valores constantes, período entre anos, filtros, atalhos e exclusão de estimativas dos registros reais.

Prévia local com dados fictícios conferida em navegador: desktop, celular de 390 px, controles independentes, intervalo entre anos, abertura das O.S. pelo gráfico e prévia de PDF contendo as análises habilitadas.

## Publicação

Esta mudança utiliza os relatórios existentes do servidor e não requer função ou migração nova. Os cinco arquivos de versão/cache estão preparados para v157. Publicação autorizada pelo usuário em 06/10/2026. A numeração passou de v156 para v157 para preservar a atualização de equipes que já havia ocupado a v156.
