# Roteiro, equipe e mapa das entregas

Pedido: mapa das entregas, roteiro impresso com caminho, nome e equipe. O dono confirmou que ainda não há API do Google Maps. Não há autorização de publicação nesta tarefa.

## Implementação

- Abrir percurso no Google Maps por URL oficial sem chave: origem, paradas ordenadas e retorno; partes contínuas com até três pontos intermediários para celular e limite de URL.
- Imprimir roteiro mesmo sem cálculo: identificação, equipe por ID e integrantes do cadastro, veículo, motorista, serviço, endereços, sequência, janelas e campos de conferência.
- Nome editável; troca de equipe preserva paradas; armazenamento local separado por usuário. Sem sincronização entre aparelhos. Falha de armazenamento é explicitada.
- Cálculo e otimização indisponíveis sem provedor; não inventar distância, conversões ou horário.

## Limites e próximo passo

O percurso pelas ruas e a impressão das conversões são abertos no Google Maps. O PDF local não contém ruas calculadas sem provedor. Mapa incorporado, instruções e otimização interna dependem de configurar um provedor autorizado; nenhum serviço demonstrativo público foi conectado como produção. Persistência local não substitui servidor nem backup.

Fonte técnica: https://developers.google.com/maps/documentation/urls/get-started (consulta em 22/10/2026). URLs não exigem chave, respeitam limite de caracteres e de intermediárias. Não há alteração de O.S., banco, comissão ou entrega física.

## Verificação local

Sete novos testes cobrem relatório sem cálculo, escape de conteúdo, persistência isolada, falha de armazenamento, sequência móvel de vinte paradas, retorno e coordenadas sem confirmação. Prévia conferida com dados fictícios: trocar equipe não apaga parada, PDF mostra integrantes e nome editado, recarga conserva nome e viewport móvel sem transbordamento da página. Impressão física e API real não verificadas. Ajustado diálogo de PDF para botões permanecerem visíveis em tela estreita.

## Continuação aprovada: mapa, equipe e roteiro (22/10)

O dono aprovou a proposta visual e preferiu provedor com plano gratuito.
Implementado localmente: painel compacto, equipe por ID com nomes da configuração,
paradas recolhíveis, mapa ao lado, perfil viário explícito, busca de endereços com
escolha e confirmação manual, instruções por trecho no relatório, impressão A4.
Nenhuma alteração de O.S.; rascunhos permanecem locais por usuário e navegador.

### Provedor escolhido e ativação pendente

Geoapify Free: a página oficial informa 3.000 créditos/dia, uso comercial permitido,
sem cartão. Crédito não é necessariamente uma rota. Consulta de endereço, trajeto
e imagem são chamadas distintas. Sem trânsito ao vivo; perfis não dispensam conferir
restrições reais. Fontes conferidas em 22/10/2026:
- https://www.geoapify.com/pricing/
- https://apidocs.geoapify.com/docs/routing/
- https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/
- https://apidocs.geoapify.com/docs/maps/static/

A chave deve ser configurada como segredo `PCP_GEOAPIFY_KEY` no servidor Supabase,
nunca em CFG, HTML, relatório ou repositório. Publicar pcp-sync antes da interface.
Actions rotasStatus/rotasLocalizar/rotasCalcular exigem crachá humano admin/pcp;
revogação é verificada antes. Só endereço ou coordenadas saem para Geoapify,
sem O.S., clientes ou equipe. Tratamento de falha, timeout e limite sem expor chave.
Mapa estático retorna PNG, com créditos Geoapify/OSM preservados na impressão.
Sem imagem, o esquema é identificado como sem ruas; não usar tiles públicos OSM
como dependência (bloqueados na conferência local). Matriz/ordenação automática
não habilitada no adaptador Geoapify; setas preservam reordenação manual.

Pendente: usuário abrir conta gratuita, configurar segredo, testar cálculo real,
confirmar consumo e atribuição na imagem real e publicar após autorização.
Testes simulados não são confirmação de serviço ativo. Nenhuma migração ou escrita
produtiva foi feita. A versão de demonstração não chama API de rotas pública.

### Verificação local desta continuação

2.186 testes passaram (48 de rotas/provedor), Node 24, `scripts/verificar.cjs`.
Prévia fictícia em localhost:5396: cálculo com fixture, equipe exibida, impressão
com sequência e mapa esquemático, recarga sem duplicar três paradas. No celular,
conteúdo e viewport medidos com 375 px; diálogo 370,5 px. Nenhuma impressão física
ou chamada autenticada Geoapify realizada. Conta gratuita será aberta pelo dono.

## Ativação e publicação autorizadas em 22/10

Projeto Geoapify criado no plano Free e segredo PCP_GEOAPIFY_KEY salvo no projeto
Supabase do PCP, por autorização explícita. Teste real de demonstração: uma perna,
21 pontos de geometria, sete instruções e PNG válido com ruas e atribuição.
Nenhum cliente ou O.S. enviado no teste. Segredo temporário removido após conferir.
Dono autorizou publicar integração e tela e conferir mapa/equipe/roteiro.
Versão preparada v193; 2.186 testes passaram novamente antes da publicação.

## Publicação e conferência em 22/10/2026

- v193 publicada no commit 35dd9e3; servidor pelo workflow 39849835579, Pages pelo 39850238441, ambos verdes.
- pcp-sync v164 e pcp-mubisys v142 ativos; código servido inclui as ações de mapas e o adaptador Geoapify.
- Chrome autenticado: conexão ativa, geocodificação de origem e três destinos, cálculo viário com retorno, imagem de ruas e instruções recebidas. Seleção de equipe exibe integrantes. Não houve gravação de O.S.
- Impressão abriu a prévia nativa do Chrome com as três paradas. Impressora física não testada.
- Identificada falha por limite do armazenamento ao incluir PNG do mapa. v194 acrescenta segunda tentativa de persistir somente os dados do roteiro, cálculo e instruções, mantendo o mapa em memória e indicando recálculo ao reabrir. Nenhum registro de O.S. é apagado. Regressão reproduzida antes da correção e aprovada depois.
- Mapa impresso passa a respeitar a largura disponível da página.
- Perfil e equipe usados na conferência são simulação; a definição operacional depende do responsável. Rotas continuam locais ao navegador/usuário; otimização automática de ordem ainda indisponível.
