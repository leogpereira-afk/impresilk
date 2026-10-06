# Ranking individual — Geral — v159

## Pedido e composição

O usuário pediu para manter a Nota atual e acrescentar um resultado geral. As opções Nota, Produção e Valor foram preservadas; Geral é uma opção adicional, sem mudar a seleção padrão da Nota.

Fórmula: `Geral = (Nota + Produção normalizada + Valor normalizado) / 3`, arredondada a uma casa decimal. Cada componente representa um terço da média.

- Nota usa exatamente a apuração atual e os pesos configurados. Revisões fechadas conservam seus pesos e sua régua histórica.
- Produção usa O.S. equivalentes confirmadas, incluindo a fração entregue e o percentual individual; normaliza pelo maior resultado confirmado do período.
- Valor usa o líquido confirmado e rateado em centavos, normalizado pelo maior valor confirmado do período.
- Na escala normalizada, o líder de cada componente tem 100 e os demais são proporcionais. Um valor confirmado de zero continua zero; informação ausente não é convertida em zero.
- Ausência de um dos três componentes exclui a pessoa do Geral, sem redistribuir os pesos. Valores parcialmente conhecidos ficam sujeitos à conferência.

A Nota atual já inclui valor entregue. A explicação do Geral informa expressamente que valor participa dentro da Nota e como componente próprio. O Geral é um comparativo da tela; não modifica a Nota, os registros, os fechamentos, as comissões ou os prêmios.

## Interface

Geral aparece junto às três opções existentes, com composição por pessoa no pódio e na tabela. A explicação exibe a fórmula e um exemplo: 90, 60 e 75 resultam em 75. O PDF do ranking acompanha a opção selecionada, inclusive o título Geral e a composição.

## Verificação — 06/10/2026

- 1.544 testes aprovados, zero falhas e zero ignorados: `/tmp/pcp-v159-verificar.log`.
- Sete testes novos: normalização e conservação da Nota; pesos configurados; dados pendentes/inválidos; rateio e frações; zero e empates; interface; revisões fechadas.
- Prévia local com dados fictícios: cálculo, composição, alternância entre opções e PDF do Geral conferidos.
- Celular de 390 px: quatro opções disponíveis, sem transbordamento horizontal da página. Tamanho original do navegador restaurado após o teste.
- Nenhum erro de console observado.

## Publicação

Versão preparada localmente. Publicação depende da autorização específica do usuário para o PCP. Sem função de servidor ou migração nesta alteração.
