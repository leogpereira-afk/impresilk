# Produtos entregues no período

Prévia local na v199, junto do cartão de total entregue preparado nesta frente. Publicação ainda não autorizada.

- Pedido confirmado na D-022: uma linha por produto, reunindo os modelos.
- Fonte: itens de painel_ordens vinculados pelo número exato das O.S. presentes no pacote de entregues do período. A data de cadastro não limita essa busca. Somente leitura, sem migração.
- Valor por produto é o líquido da entrega distribuído proporcionalmente aos valores dos itens. Quantidade não é multiplicada novamente. Ajuste de centavos preserva o total; cadastro ambíguo ou valores de itens inválidos ficam sem classificação.
- Quadro recolhível depois do total do período, barras dos dez maiores produtos, percentual sobre o total conhecido e tabela completa. A mesma seleção de período e de Entregue controla ambos os quadros. Lacunas continuam explícitas.
- Classificação atual do cadastro, não fotografia histórica da entrega. Nota sobre rateio descritivo na tela e na explicação das fontes.
- Acesso permanece restrito à gestão. Falha ao ler os produtos preserva os demais indicadores.

Verificação final: node scripts/verificar.cjs, 2220 testes passaram, zero falhas ou pulados. Interface conferida no computador e a 390 px, sem rolagem horizontal no celular. Prévia com dados fictícios, incluindo modelos diferentes do mesmo produto e itens sem classificação.

Publicação pendente: o último Deploy da main está vermelho pelo teste de acumulado de outubro em tests/casa.test.cjs, cuja data fixa já está corrigida na candidata local. Restaurar primeiro esse teste na main, após autorização. Com Deploy verde e ramo atualizado, publicar pcp-sync da candidata e depois a tela. pcp-mubisys e módulos compartilhados não mudaram; não há migração. Repetir a verificação e a conferência da vez sobre a base então vigente.
