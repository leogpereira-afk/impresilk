# Revisão de leitura do PCP no celular

Pedido de 21/10/2026: conferir todas as abas no celular, mantendo os cards compactos e todas as informações.

Base inicial: v183 publicada; atualizada ao final com a v184 e as novas colunas de Retrabalho, preservadas integralmente. Revisão da tela oficial em modo responsivo, com leitura apenas; ajustes em prévia local isolada com dados fictícios. Nenhuma publicação de produto autorizada neste pedido.

## Escopo e reprodução

- Conferir as 15 entradas de navegação e as subabas de Entregas e Performance em 390 e 360 px, incluindo conteúdos abaixo da primeira tela.
- Verificar contraste, texto truncado, transbordamento, navegação e abertura de detalhes sem gravar dados operacionais.
- Execução: a linha flexível mantém ações sem encolher, deixando o conteúdo da O.S. com cerca de 65 px em um celular de 390 px.
- Retrabalho: o nome no gráfico usa largura fixa proporcional e reticências, ocultando nomes compridos.
- Calendário: o indicador de demanda usa linha única e reticências em células estreitas.
- Reproduzir em dados fictícios, corrigir os componentes responsáveis e conferir novamente os tamanhos mobile e desktop. Preservar textos, ações, regras e dados.

## Ajustes locais

- Execução: ações em uma segunda linha no celular, liberando a largura dos dados. No cenário fictício de 390 px, a área dos dados passou de 62 para 311 px e o card caiu de 263 para 137 px de altura.
- Retrabalho: nomes completos e barra abaixo do nome, preservando contagem e percentual.
- Finalizados: colaborador acima das quatro métricas no celular, com os mesmos títulos, valores e gráficos. Os 16 nomes do cenário ficaram com área visível, sem largura zero.
- Calendário: indicadores de prazo quebram linha; títulos longos de demandas não alargam a grade. Reproduzido com demanda fictícia criada somente no servidor de prévia.
- Performance / Regras: grade sem largura mínima implícita e aviso de regra provisória com quebra de linha.
- Instalação / Lista: avisos de entrega parcial e do prazo anterior quebram linha dentro do card.
- Ficha: o nome da etapa Fechamento aparece inteiro. Fontes, dados e regras operacionais preservados; nenhum backend alterado.

## Verificação visual e funcional

- Tela oficial v183 consultada apenas para leitura em navegador autenticado. As correções foram reproduzidas e verificadas na prévia isolada `http://127.0.0.1:5398/`, com dados fictícios e bloqueio de conexão externa.
- Conferidas as 15 entradas em 360 e 390 px: PCP, Instalação, Execução, Parado Cliente, Retrabalho, Finalizados, Volta do carro, Entregas, Performance, Calendário, Demandas, Plantões, Programação, Painel e Configurações.
- Conferidas nas duas larguras as seis subabas de Performance, os modos Tabela, Cards e Por O.S. de Entregas, Relatórios, Fechar o dia, Rotas, Lista da Instalação e Painel de Finalizados.
- Os problemas encontrados foram reproduzidos antes da correção e reavaliados depois. As vistas finais examinadas não apresentaram transbordamento da página, nomes com largura zero ou cortes nos componentes corrigidos. Rolagem interna dos menus e tabelas continua disponível para preservar as opções e colunas.
- Ficha da O.S. aberta e fechada pelo botão de Execução em 360 e 390 px, sem gravar dados. Etapas legíveis e ações preservadas. Criada somente uma demanda fictícia na prévia para testar prazo e título longo no calendário.
- Regressão desktop em 1280 px: Execução, Retrabalho, Calendário, Painel de Finalizados, Regras e Lista da Instalação, sem transbordamento.
- Inspeção visual complementada por cores e dimensões calculadas no DOM. Texto exclusivo para leitores de tela foi desconsiderado pelo medidor; gradientes foram avaliados visualmente.
- Evidências fora do repositório público: `/tmp/pcp-mobile-revisao-final.json`, `/tmp/pcp-mobile-execucao-360.png` e `/tmp/pcp-mobile-finalizados-360.png`.

Limite: emulação de largura de celular no navegador, sem teste em aparelho físico. Os resultados cobrem os cenários examinados, não todas as combinações possíveis de dados. Resumos recolhíveis e descrições resumidas dos cards continuam com acesso ao conteúdo completo na ficha.

## Testes e entrega

`node scripts/verificar.cjs`: 2.143 testes passaram, zero falhas, cancelados ou pulados; `git diff --check` passou. A primeira tentativa sob restrição de portas locais falhou no ambiente; a execução com os servidores de teste permitidos e a repetição após o último ajuste passaram integralmente. Alterações limitadas a CSS e a este registro; a v184 continua sendo a versão publicada. Publicação destes novos ajustes depende da aprovação do dono.

Compatibilidade final: ramo atualizado com a main da v184; as oito colunas de Retrabalho continuam acessíveis por rolagem interna em 360 e 390 px, sem alargar a página. Suíte completa repetida nessa base: 2.143 testes passaram.
