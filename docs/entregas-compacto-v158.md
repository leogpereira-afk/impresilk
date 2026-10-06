# Relatórios compactos e mês atual — v158

## Escopo

- Abertura no mês corrente, inclusive janeiro; em outubro, o atalho de outubro vem selecionado. Os gráficos mantêm o histórico até o mês escolhido e destacam seus pontos e valores. O mês incompleto continua identificado e fica fora da base estatística.
- Filtros principais compactos. Seleção de intervalo e indicadores ficam em “Personalizar período e indicadores”, inicialmente recolhido. O painel de filtros também pode ser recolhido.
- Quadros de pontualidade, indicadores do mês, produção/dinheiro, equipe, qualidade e tabelas recolhíveis. O grupo de cartões de pontualidade pode ser fechado sem esconder o gráfico. O estado aberto/fechado é preservado durante as interações da tela.
- Controles de previsão e tendência dentro de cada gráfico, independentes entre pontualidade e financeiro.
- Ambas as análises projetam exatamente dois meses após o mês selecionado, ou após o último mês iniciado do intervalo. Outubro projeta novembro e dezembro; dezembro projeta janeiro e fevereiro do ano seguinte.

## Estatística e limites

A previsão continua usando a média dos três últimos meses completos consecutivos da base selecionada, acompanhada de mediana e mínimo/máximo observados. Pontualidade pondera a média pelo número de O.S. comparáveis. A faixa não é um intervalo de confiança.

A tendência mantém regressão linear com distância real entre meses e agora estende a linha até os dois meses projetados. Projeções percentuais são limitadas a 0–100%. Não usa meses parciais ou dados incompletos. Quando faltam dados, o aviso permanece explícito: dois meses no eixo não significam que há uma previsão válida.

Nenhuma estimativa altera as O.S., datas, pagamentos, abonos ou comissões. Sem alteração de função do servidor ou migração.

## Verificação

- 1.537 testes aprovados, zero falhas e zero ignorados, em 06/10/2026.
- Casos de abertura em outubro e janeiro, exclusão do mês parcial da base, horizonte novembro/dezembro e janeiro/fevereiro, análise independente por quadro e retorno ao mês corrente após intervalo antigo.
- Prévia com dados fictícios: filtros com 174 px de altura em desktop; celular de 390 px sem overflow da página; gráficos com rolagem interna.
- Recolhimento dos quadros preservado ao alternar análises; atalhos, intervalos entre anos e retorno a outubro conferidos no navegador.
- PDF completo abre todos os quadros na cópia de impressão e inclui apenas as análises habilitadas. Sem erros de console observados na prévia.

## Estado

Implementação preparada e verificada localmente. A publicação exige aprovação específica do usuário, conforme preferência registrada para o PCP. A versão pública permanece v157 até essa aprovação.
