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
