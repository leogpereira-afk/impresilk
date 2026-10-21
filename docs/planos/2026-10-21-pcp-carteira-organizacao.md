# Carteira PCP: organização e legibilidade

## Pedido e escopo

Em 21/10/2026, o dono pediu para organizar melhor o topo da carteira e informou que vários controles perderam a leitura. A prévia foi aprovada e a publicação autorizada na mesma data: "aprovado, pode subir essa organização e a correção da leitura dos cards". Preparação da versão v181, limitada às mudanças de interface verificadas.

- Separar as vistas da carteira, a busca e os grupos Tipo e Etapa.
- Ações de inclusão junto ao título; preservar todos os filtros, números, ordenação, PDF e legenda.
- Compactar a faixa Silk e os seis indicadores, mantendo ícones e textos.
- Corrigir o contraste dos controles nos cabeçalhos compartilhados.
- Permitir quebra dos avisos longos nos cards, sem cortar o conteúdo.
- Manter foco e visibilidade do filtro escolhido nas faixas roláveis do celular.
- Preservar regras, permissões, dados e fluxo das O.S.

## Diagnóstico do contraste

Reproduzido em Plantões com dados fictícios. O seletor compartilhado em silk-design.css aplicava texto branco e fundo branco com transparência a todos os botões do cabeçalho, inclusive dentro do alternador claro .casa-vista. A especificidade também substituía o fundo do estado ativo. Solução: pares opacos de texto e fundo, com seleção escura explícita; conferir as demais áreas que reutilizam o cabeçalho.

## Verificação

- `node scripts/verificar.cjs`: verificação final da suíte completa do projeto, com 2.139 testes passando, sem falhas, cancelados ou pulados.
- Navegador com dados fictícios: busca por cliente, tipo Cliente retira, etapa Aguardando produção, limpeza dos filtros e preservação da ordenação.
- Larguras de 390, 1024 e 1440 px sem transbordamento horizontal da página. Em 390 px, filtros de 44 px, opção ao final da faixa visível após a seleção e foco preservado; Tab segue para o PDF.
- Contraste medido antes da correção em Plantões: texto branco sobre fundo claro. Depois: pares opacos com razão acima de 9:1 nos controles dos cabeçalhos de Plantões, Performance, Calendário, Programação e Entregas. Estados ativos e inativos conferidos, inclusive após trocar os filtros de Plantões e Programação.
- Rótulo do mês no cabeçalho do Calendário corrigido para texto claro; botão do cabeçalho simples do Painel com texto escuro mais legível.
- Verificações de interação realizadas na prévia com dados fictícios. Nenhum dado de produção consultado ou alterado, nenhuma regra ou servidor modificado. A publicação da v181 terá conferência do Deploy e dos arquivos servidos antes de ser declarada concluída.
