# Legibilidade dos cards nas demais abas do PCP

Pedido de 21/10/2026: conferir as outras abas e corrigir os cards com leitura ruim, mantendo tudo compacto e sem retirar informações.

Base: v182, preservando a organização da carteira e o atalho de retrabalho já publicados. Correções inicialmente preparadas para prévia local e aprovadas pelo dono em 21/10/2026 para publicação.

## Revisão

- Conferir telas operacionais, entregas, Performance, agenda, Demandas, Plantões, Programação, Painel e Configurações usando somente dados fictícios.
- Reproduzir problemas de contraste, herança de cores, texto cortado e transbordamento antes de alterar CSS.
- Corrigir o componente responsável, mantendo campos, ações, contagens, estados e permissões.
- Conferir celular e computador, foco por teclado e estados selecionados.
- Executar a suíte completa e registrar os resultados e limites reais da revisão.

Nenhuma alteração de backend, dados reais ou regras financeiras faz parte deste trabalho.

## Correção concluída na prévia local

- Cores compartilhadas de texto secundário, azul, verde e vermelho ajustadas para manter leitura em fundos claros. Contagens selecionadas usam fundo mais escuro, sem apagar os números.
- Removida a transparência que apagava datas de outros meses, linhas passadas, equipes desativadas e etapas pendentes. Fundo, borda e rótulos continuam distinguindo os estados.
- Nomes nas barras de análise, códigos mostrados no calendário e título da etapa do card passam a quebrar linha quando necessário. Nenhum texto, campo ou ação foi removido.
- Mantidos tamanhos de fonte, grades compactas e alvos de toque existentes. No modo TV, as legendas das barras e tabelas continuam claras sobre fundo escuro.
- Mudanças de produto limitadas a `styles.css` e `performance-dashboards.css`; o atalho de retrabalho da v182 foi preservado.

## Verificação

Prévia isolada em `http://127.0.0.1:5398/`, com dados fictícios e sem acesso ao banco de produção.

- Revisadas as 15 entradas: PCP, Instalação, Execução, Parado Cliente, Retrabalho, Finalizados, Volta do carro, Entregas, Performance, Calendário, Demandas, Plantões, Programação, Painel e Configurações, em 1280 x 900 e 390 x 844.
- Conferidas também as cinco subabas adicionais de Performance nas duas larguras, Entregas em cards e por O.S., Relatórios, Fechar o dia, Rotas, painel de Finalizados e lista de Instalação.
- Conferência de cores calculadas no DOM e cortes horizontais, complementada por inspeção visual dos cards, calendário e fundos escuros. Ao final, nenhum contraste insuficiente ou corte de texto foi encontrado pelo verificador nas vistas examinadas, desconsiderando texto intencionalmente exclusivo para leitor de tela. Sem transbordamento horizontal da página.
- Título longo de demanda fictícia permaneceu legível no celular; descrição completa acessível na ficha. Abertura dos detalhes da etapa preservou as ações. Foco de teclado do calendário confirmado visível, com contorno de 3 px.
- Verificação visual do modo TV, incluindo legendas das barras de retrabalho em fundo escuro.
- Suíte completa: `node scripts/verificar.cjs`, 2.143 testes aprovados, zero falhas. `git diff --check` sem erros.
- Evidências locais: `/tmp/pcp-legibilidade-auditoria.json`, `/tmp/pcp-legibilidade-calendario-desktop.png` e `/tmp/pcp-legibilidade-card-mobile.png`. Não incluir prints ou dados operacionais no repositório público.

Limite: a revisão usa os cenários fictícios disponíveis; não é uma certificação de todas as combinações de dados nem substitui uma auditoria integral de acessibilidade. O medidor de contraste não avalia gradientes, que foram inspecionados visualmente.

## Publicação aprovada

Em 21/10/2026, o dono autorizou: "aprovado, pode subir essas correções dos cards do PCP". Ramo atualizado com a main e versão v183 preparada pelo script oficial. A aprovação abrange as correções de legibilidade revisadas acima. Verificação do deploy e dos arquivos servidos será registrada na Passagem do VEZ.md ao encerrar.
