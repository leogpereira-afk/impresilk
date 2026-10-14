# Pontualidade por classe ABC

Implementação local autorizada em 14/10/2026. Publicação autorizada pelo dono com "subir", após a revisão local, na mesma data.

## Escopo confirmado

- Reutilizar a classificação anual de Campanhas do Painel no quadro de pontualidade do PCP.
- Chips Todos, A+, A, B+, B e C.
- Ajuste do dono: selecionar cliente individual somente na classe A+.
- Painel consultado somente em leitura, com autorização expressa do dono; sua vez continua com o outro agente.
- Classificação calculada sobre o ano consultado na fonte atual, não uma fotografia histórica da data da entrega.
- Grupos de clientes seguem a chave canônica do Painel. Nunca relacionar por semelhança de nome.

## Implementação

1. Nova RPC de leitura no PCP usa os limites por classe devolvidos pela RPC oficial. Amplia a classificação além dos primeiros 200, conferindo quantidade, total e a lista oficial.
2. O servidor só entrega classes, chaves e nomes necessários ao seletor A+. O catálogo não inclui valores de compra.
3. O filtro se aplica às duas réguas de pontualidade, ao gráfico e à conferência por O.S. Mantém entregas sem classe em Todos, sem atribuir classe C.
4. Demais indicadores, registros, comissão e fechamentos não mudam. Falha na ABC não bloqueia o relatório.
5. Verificar SQL local com dados fictícios, cálculos, acesso, falhas da fonte, interface desktop e celular e a suíte do projeto.

## Publicação

Autorização específica recebida. Ordem: migração, servidor, tela. Antes de publicar, atualizar main, reservar/subir a versão com os scripts oficiais e repetir as verificações pertinentes. Somente este recurso pertence à publicação.
