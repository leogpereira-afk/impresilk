# Rotas: seleção de O.S. e visual compacto

## Pedido e escopo

Pedido do dono em 21/10/2026: modernizar Rotas, testar e facilitar a inclusão de O.S. Implementação revisada na prévia local. Publicação autorizada pelo dono: "aprovado, pode subir essa melhoria das rotas". Ramo `codex/rotas-usabilidade-20261021` em clone fora do iCloud. A autorização cobre esta interface e seus testes; os limites de mapas e persistência abaixo permanecem.

## Organização implementada

- Faixa Silk menor e formulário inicial compacto com nome, dia, equipe e saída.
- Veículo, motorista, origem e custos em detalhes recolhíveis, preservando os campos.
- Seleção e roteiro lado a lado no desktop; blocos empilhados em telas estreitas.
- Busca por número, cliente, serviço e endereço, com combinação de termos e sem exigir acentos.
- Filtros Dia da rota / Todas as datas e situação (liberadas, aguardando PCP, na rota).
- Inclusão individual ou de todos os resultados liberados. Limite de vinte paradas, sem duplicatas nem inclusão parcial de lote inválido. Liberação reconferida no momento da inclusão.
- Remoção pela lista ou pela parada, reordenação por botões e detalhes de local/atendimento preservados ao filtrar.
- Indicadores de O.S. incluídas e locais pendentes. Mapa exibido após cálculo, sem ocupar um grande bloco vazio.
- Alterar a seleção invalida o cálculo e a confirmação. Não muda a agenda, a liberação nem a O.S. original.

## Limites preservados

Rascunhos permanecem apenas na sessão e se perdem ao sair. O provedor real de mapas e a persistência não foram implementados nem habilitados. A prévia usa dados fictícios e um adaptador demonstrativo separado do site. Acompanhamento local não comprova nem conclui entrega física. Não houve alteração de comissão, valor, servidor ou dados de produção.

## Verificação

- Testes novos de filtros, acentos, lote, duplicação, limite, liberação, troca de usuário, proteção durante execução e ausência de provedor.
- Navegador: busca por cliente sem acento; inclusão e remoção individual e em lote; reordenação; invalidação de cálculo após alterar rota confirmada; edição de duração por teclado mantendo detalhes abertos; O.S. pendente bloqueada; outra data e ausência de agenda; validação de local pendente.
- Prévia mobile em moldura de 390 px: busca por teclado, controles e leitura dos cards conferidos.
- `node scripts/verificar.cjs`: 2.139 testes passaram, zero falhas, cancelados ou pulados; sintaxe conferida. Inclui quinze testes novos da seleção de O.S. e os dezessete testes existentes do motor de rotas.
- Desktop a 1280 px: duas colunas e quatro campos iniciais, sem transbordamento horizontal. Mobile a 390 px: uma coluna, sem transbordamento e controles de inclusão/ordenação com altura de 44 px.
- Nova rota e troca entre rotas preservam roteiros separados e reiniciam os filtros. Busca vazia mostra orientação e permite ampliar as datas.
- `git diff --check` sem problemas. Prévia local em `http://127.0.0.1:5383/#aba=entregas&rotas=1`. Nenhum dado de produção consultado ou alterado. Celular físico e serviço real de mapas não foram testados.

## Correção documental anterior à interface

O Deploy anterior estava vermelho porque a guarda M27 confundiu dígitos de um hash abreviado com uma O.S. A referência foi substituída pelo link da execução no arquivo de passagem arquivado, sem mudar a guarda. A suíte base passou com todos os testes, e a publicação apenas documental ficou verde: https://github.com/leogpereira-afk/impresilk/actions/runs/39642815854 . Naquele momento, a interface oficial permanecia na v179.

## Publicação autorizada

Versão reservada: v180. Atualizar as referências pelo script oficial, repetir a verificação completa e conferir os arquivos servidos após o Deploy. O resultado final da publicação e da conferência fica na Passagem do VEZ.md.
