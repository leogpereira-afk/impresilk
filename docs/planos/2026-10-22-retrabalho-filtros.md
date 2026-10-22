# Filtros de pessoas no Retrabalho

Pedido do dono em 22/10/2026: filtro por responsável e por técnico da correção para acompanhar pendências. Implementação local sobre v185, sem autorização de publicação desta mudança.

- Dois seletores combináveis, com Todos e Não informado; limpar pessoas preserva o período.
- Responsável continua sendo o nome/setor gravado na original. Técnico usa identidade existente do RH na equipe da filha ou em quem resolveu; não infere responsabilidade.
- Lista, pendências, custos e gráficos seguem o recorte. Taxa de retrabalho permanece a geral do período, explicitamente identificada quando há filtro de pessoas.
- Resumo dos filtros e contagem acompanham a prévia PDF.
- Nenhuma escrita de dados, backend ou regra financeira alterada.

## Conferência

- Testes com dados fictícios para combinação, equipe de várias pessoas, quem resolveu, ausência de informação, recorte de datas, limpeza, opção indisponível e IDs diferentes com nome igual.
- Prévia no navegador: responsável isolado, filtros combinados sem resultado, técnico isolado, limpeza e prévia PDF com a seleção identificada.
- A simulação antiga de DOM da ficha devolvia null para qualquer querySelector de painel; corrigida para buscar nos elementos do HTML já simulado, como querySelectorAll fazia.
- Prévia local: http://127.0.0.1:5427/#aba=retrabalho. Evidência fora do repositório público: /tmp/retrabalho-filtros-previa.png.
- Verificação final com Node 24, scripts/verificar.cjs: 2148 testes passaram, zero falhas, cancelados ou pulados. git diff --check passou.
