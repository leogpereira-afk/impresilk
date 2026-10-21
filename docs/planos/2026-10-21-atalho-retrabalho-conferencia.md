# Atalho de retrabalho na conferência

Escopo autorizado: botão visível no topo de Itens e equipe, abrindo diretamente o cadastro existente. Prévia local antes de publicar.

- Reusar problema, origem, causa, responsável, data e motivo de troca existentes.
- Confirmar no formulário; abrir e cancelar não grava nada.
- Manter a conferência intacta por trás, com foco de volta ao atalho ao cancelar.
- Preservar permissões, fila normal, controle de concorrência e mês fechado.
- Verificar cancelamento, registro, proteção das demais informações e layout em celular com dados fictícios.
- Nenhum backend ou regra financeira alterado. Publicação não autorizada nesta etapa.

## Entrega local

Implementado em `conferencia-entrega-ui.js`, com o modo direto do formulário existente em `app.js` e estilos em `styles.css`. O diálogo nativo do retrabalho abre sobre a conferência. Cancelar retorna ao mesmo ponto e ao mesmo preenchimento. Confirmar usa a fila normal de O.S., preserva as informações de entrega e deixa o rascunho disponível para reabrir depois da sincronização.

Validação em 21/10/2026:
- `node scripts/verificar.cjs`: 2143 testes passaram, nenhum falhou ou foi pulado, com Node 24.
- `scripts/testar-atalho-retrabalho-ui.cjs`: abertura direta, cancelamento, foco, confirmação pelo handler local fictício, preservação dos itens e do rascunho, bloqueio de permissão e layout a 390 px.
- `git diff --check`: sem erro.
- Prévia: http://127.0.0.1:5396/#aba=performance. Dados fictícios, sem acesso ao banco real.
- Produção não alterada por este ajuste. Falta aprovação específica para publicar, seguida de versão e verificação no site.

O ambiente restrito bloqueou dois testes com servidor HTTP local; a suíte completa passou ao permitir esses servidores. A prévia não sincroniza O.S. automaticamente: o teste enviou explicitamente ao handler fictício local para verificar a reabertura após o registro.
