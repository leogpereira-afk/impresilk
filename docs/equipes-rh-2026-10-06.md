# Integrantes das equipes — RH completo

## Causa e conferência

A janela de cadastro/edição de equipes em Performance usava somente `equipeEscalavel().doPCP`, a lista antiga de instaladores. Funcionários ativos já presentes no RH e com vínculo existente podiam não aparecer. O catálogo da escala de O.S. já incluía esses cadastros.

Conferência de produção somente de leitura em 06/10/2026: 17 vínculos salvos, sendo 16 apontando para chave e ID correspondentes em cadastros não apagados do RH e um terceiro explicitamente sem ficha. Isso verifica a referência estrutural; não substitui a confirmação humana da pessoa em cada entrega. Nenhum vínculo, contrato ou equipe real foi alterado.

## Correção

- Reutiliza `opcoesEquipe` no editor de equipe fixa: funcionários ativos, novos cadastros e contratos ativos de freelancers.
- Busca por nome, apelido ou ID; nomes semelhantes continuam separados pela identidade.
- Identificação pendente de freelancer aparece com motivo e bloqueio, sem inventar vínculo.
- Mantém integrantes já selecionados, inclusive os antigos, sem oferecer inativos como novas escolhas.
- Botão Atualizar pessoas consulta o RH sem cache, preserva as escolhas feitas durante a consulta, o líder e os demais campos do formulário. Falha/offline não apaga a lista.
- Atualização não modifica entregas, percentuais, fechamentos ou vínculos de produção.

## Verificação

- Seis regressões novas: catálogo completo, freelancer pendente, preservação/deduplicação, busca, atualização concorrente com a edição e falha de consulta.
- Suíte completa: 1.516 aprovados, zero falhas, com concorrência de dois arquivos. Uma execução anterior simultânea a outra suíte excedeu o limite de um teste de tempo preexistente; a execução isolada passou sem alterar esse teste.
- Sintaxe de performance.js e diff conferidos.
- Prévia isolada: busca encontrou os dois nomes de Lucas fictícios; selecionados funcionário novo e freelancer, atualizado o catálogo mantendo escolhas, líder alterado e equipe salva/reaberta com os três integrantes preservados. Dados somente fictícios.

## Publicação

Publicação autorizada pelo usuário em 06/10/2026. Versão v156 preparada com cache e referências dos arquivos atualizados. Mudança apenas de interface; sem implantação de servidor ou alteração de dados. A conclusão da publicação depende do workflow e da conferência dos arquivos no site público.

Prévia: http://127.0.0.1:4241/#aba=performance
