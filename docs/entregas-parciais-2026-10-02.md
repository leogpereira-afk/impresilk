# Entregas parciais por itens e equipes

Implementação de 02/10/2026, sobre `f1641109e16606f66885aa0c9cd791a14a9cc080` (PCP v145), conciliada com `78da5e9` (foto de freelancer do RH). Publicação da **v146** autorizada pelo usuário. Nenhuma entrega real foi cadastrada ou alterada durante a implementação.

## Comportamento

- Em **Entregas → Tabela**, usar **Itens da entrega**. Em **Por O.S.**, usar **Itens e equipe da entrega**.
- Em **Performance → Conferir**, usar **Selecionar itens · entrega parcial ou outra equipe**.
- Cada entrega guarda os itens, quantidades, data e divisão entre equipes/pessoas. **Nova entrega** permite atribuir o saldo a outra equipe e outro dia.
- A prévia financeira usa apenas os itens selecionados, com o desconto da O.S. distribuído proporcionalmente. Quantidades já conferidas não podem ser repetidas.
- Exemplo fictício verificado: O.S. líquida de R$ 8.500,00 com dois itens de igual subtotal bruto. A equipe Águia recebe 2 das 4 unidades do primeiro item, base de R$ 2.125,00. A equipe Leão recebe as outras 2 unidades e o segundo item, base de R$ 6.375,00. A soma permanece R$ 8.500,00.
- A pontuação equivalente considera a fração entregue da O.S.; dividir a entrega em vários registros não multiplica uma O.S. inteira. A comissão exibida continua sendo uma prévia sujeita às regras e à apuração do programa, sem executar pagamentos.

## Integridade e limites

- `conferenciasEntrega` é um campo da própria O.S.; cada entrada tem identificador, data, referências estáveis dos itens, quantidades, alocação validada e autoria do servidor.
- O endpoint `conferenciaEntrega` exige Gestão/PCP, a revisão atual da O.S. e comparação da versão gravada. Duas gravações concorrentes não sobrescrevem uma à outra.
- A gravação comum da O.S. preserva as conferências, inclusive quando vem de uma tela antiga. Montagem/toque não recebem os percentuais; os identificadores internos de autoria são filtrados conforme o perfil.
- A conferência não finaliza a O.S. inteira nem troca sua equipe operacional. As marcações físicas já existentes continuam no fluxo atual.
- Revisões de Performance já fechadas permanecem como foram. O período aberto passa a considerar as conferências por itens, substituindo a participação anterior da O.S. inteira. A tela avisa sobre essa transição.
- Itens cancelados, referências ambíguas ou conteúdo alterado são bloqueados para revisão, sem reassociação por posição. `MESCLA_ITENS_ERP` permanece desativada.
- Unidades inteiras permitem quantidade parcial. Itens medidos por área ou quantidade fracionária usam o lote inteiro, conforme a regra existente do PCP.
- Sem valor líquido confiável ou sem subtotais válidos, o valor fica a conferir; não se inventa uma base pelo total bruto.
- A conferência da volta do carro só acompanha a entrega quando equipe e data coincidem. Não se copia a avaliação de outra equipe.
- Este recurso não corrige automaticamente a entrega real de Osmane: a gestão precisa selecionar quais itens ele entregou.

## Verificação executada

1. `node scripts/verificar.cjs`: **1.354 testes aprovados, zero falhas, zero ignorados**, após conciliar a correção de fotos, com o histórico Git completo. Inclui 19 testes novos sobre cálculo, descontos, centavos, quantidade, equipes, meses, permissões, concorrência, preservação e revisões fechadas.
2. `node scripts/testar-conferencia-entrega-ui.cjs` com a prévia fictícia: seleção de 2/4 itens, duas equipes, salvar e reabrir, saldo R$ 6.375,00, bloqueio da terceira entrega, atalhos Tabela e Por O.S., desktop 1366 × 900 e celular 390 × 844 sem transbordamento horizontal no diálogo. Nenhum erro JavaScript capturado.
3. `git diff --check`: sem erros de espaço em branco.

Os dados da prévia são fictícios; não há acesso ao banco de produção. Os testes de API usam armazenamento controlado para reproduzir conflitos e perfis, não uma implantação real do Supabase.

## Publicação

Esta mudança foi preparada em checkout isolado. A correção publicada de fotos (`78da5e9`) foi preservada; as frentes F19–F22 ainda não publicadas permanecem em suas branches, sem inclusão neste pacote. Sequência de publicação:

1. Reconciliar com a `main` atual, sem substituir trabalho alheio. Feito com `78da5e9`.
2. Atualizar conjuntamente versão dos arquivos e cache. Feito: `config.js`, `index.html`, `equipe.html` e `sw.js` usam v146.
3. Executar novamente as verificações sobre a revisão conciliada. Feito: 1.354 testes aprovados.
4. Com autorização para publicação, implantar primeiro `pcp-sync` com os módulos compartilhados; depois publicar a interface.
5. Confirmar a versão servida e testar a leitura autenticada e os atalhos publicados. Não registrar uma entrega real de teste nem alterar a O.S. de Osmane sem identificar os itens corretos.

Não há migração de tabela nesta mudança; os registros utilizam o campo JSON existente.

Uma futura publicação das frentes F19–F22 deve reconciliar sua apuração com `conferenciasEntrega`, em vez de substituir esta implementação. A v146 agora pertence a este pacote.
