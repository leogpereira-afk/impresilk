# Rotas sincronizadas e leitura pela equipe

Pedido do dono: salvar as rotas no sistema, sincronizar aparelhos, permitir à equipe abrir mapa e roteiro no celular, testar e publicar.

- Reaproveitar rotas existentes, IDs de equipe/RH/veículo, crachá PCP e provedor Geoapify.
- Tabela privada pcp_rotas, RLS e sem acesso anon/authenticated. Edge Function autentica, confere revogação e restringe acesso por equipe atual e ID do RH.
- Gestão salva explicitamente no sistema. Revisão otimista impede sobrescrita silenciosa por outro aparelho; rascunhos locais não são apagados e não são enviados automaticamente sem ação.
- Lista atualizada ao abrir e periodicamente enquanto visível. Edição local pendente não é substituída por atualização remota.
- Equipe lê somente rotas confirmadas, em andamento ou concluídas atribuídas à sua equipe atual. Sem custos, preços ou parâmetros financeiros. Sem gravação de O.S. ou confirmação de entrega.
- Mapa calculado e instruções persistidos junto à rota; visualização móvel e impressão sem recalcular nem compartilhar chave.
- Testar isolamento entre equipes, ID direto, conta revogada, custos ausentes, conflito, repetição idempotente, dois clientes, falha de rede, recarga e leitura da equipe.
- Publicar migração, servidor e tela nesta ordem; conferir produção sem atribuir rota real a equipe presumida.

## Verificação antes da publicação

- 2.204 testes aprovados, incluindo dois clientes, falha de conexão após gravação, repetição idempotente, conflito e troca de conta durante consulta.
- Corrigida assinatura de alteração para ser independente da ordem das propriedades retornadas pelo banco.
- Guards do celular atualizados para a inclusão intencional da leitura de rotas; execução de O.S. preservada.
- Prévia móvel a 375 px com dados fictícios: lista, abertura do roteiro, mapa, links e instruções legíveis.
- Migração aplicada em 22/10; RLS habilitada, sem grants para anon/authenticated. Nenhuma rota existente migrada automaticamente.
- Publicação e conferência real registradas após os deploys.
