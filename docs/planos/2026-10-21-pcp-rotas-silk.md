# PCP: cards, Silk e rotas de entregas

Pedido de 21/10/2026: executar o prompt aprovado de evolução dos cards e rotas e incluir Silk, inclusive a versão dirigindo disponível no Drive. Prévia antes de publicar código. O dono informou que ainda não há serviço de mapas contratado.

Implementar cards compactos com ícones volumétricos, hierarquia clara e sem mudar ações ou semântica das cores. Rotas em Entregas somente para a gestão: puxar serviços da equipe/dia, selecionar sem duplicar, conferir endereço e coordenadas, ordenar, calcular distâncias rodoviárias, chegadas com duração das visitas, combustível e retorno. Sugestão de ordem pede confirmação e respeita janelas; mudanças invalidam cálculo/confirmação. Rascunhos identificados como locais; nenhuma baixa automática de O.S. ou escrita produtiva. PDF pelo diálogo de impressão com mapa vetorial e lista.

Sem provedor contratado: adaptador de roteamento com contrato explícito; falha fechada fora da prévia. A prévia usa exemplos rodoviários públicos sem clientes reais. Nenhum tempo em linha reta é apresentado como trajeto. Trânsito ao vivo e sincronização de rotas entre aparelhos permanecem dependências para produção, claramente informadas.

Ativos oficiais: silk-compacto.webp existente; Drive Mascote, arquivo Gemini_Generated_Image_w7z5msw7z5msw7z5.jpeg (ID 1hIMdknPyQGB5oi_B9TJ45TcPLzQaGM81), folha de cenas, visualizada por recorte CSS sem recriar personagem.

Verificar: testes do motor (combustível, espera, virada de dia, dados ausentes, retorno, ordenação e respostas inválidas), regressão npm run verificar; interface desktop e celular com dados fictícios, exportação e funcionamento dos controles. Publicação de código não autorizada nesta etapa.

## Verificação da prévia em 21/10

- `node scripts/verificar.cjs`: 2.124 testes passaram, zero falhas ou pulados, mais conferência de sintaxe; execução com Node do runtime Codex.
- Navegador: cards e Silk oficial visíveis; atalho PCP abre Rotas; cálculo dos três serviços fictícios exibe trechos, chegada, retorno e combustível; sugestão mantém ordem até confirmação e recalcula depois; editar endereço remove resultado, confirmação e habilitação do PDF, exigindo nova conferência.
- Relatório exibido dentro de diálogo: origem, equipe, motorista, veículo, data, percurso, três paradas, trechos, horários e combustível conferidos. Impressão abre diálogo nativo não acessível pela automação do navegador integrado; arquivo PDF final ainda não validado. Celular físico ainda não validado.
- Prévia: `PORT=5381 PV_ROTAS=1 node scripts/preview-auditoria.cjs`, rota `/#aba=entregas&rotas=1`; nenhum cliente real, nenhuma escrita em produção.
- Pendências para produção: provedor de rotas/geocodificação e mapa-base, persistência compartilhada, testes com serviço configurado e conferência final da impressão. Nenhuma contratação ou publicação de código realizada.

## Publicação aprovada

Em 21/10/2026, após a prévia e a explicação das limitações, o dono respondeu “Aprovado”. Publicar os cards, o Silk e a interface de planejamento em teste. O adaptador demonstrativo continua exclusivo do servidor local; não habilitar roteamento real nem sincronização sem integração. Ativo do Silk convertido para WebP para entrar na publicação existente e no cache offline. A conferência do PDF final continua pendente do provedor e de impressão fora do navegador integrado.
