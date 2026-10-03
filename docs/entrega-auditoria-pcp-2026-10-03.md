# Entrega local da auditoria PCP — 03/10/2026

**Candidata v148, somente local.** As melhorias foram implementadas no clone isolado. Não houve publicação, push, merge, pagamento, classificação de O.S. real, alteração de ERP ou reparo de cadastro real nesta rodada. Outubro permanece teste. Operação efetiva a partir de novembro exige decisão documentada da gestão.

A base existente foi preservada: versões fechadas continuam históricas; ocorrências não se tornam culpa por ausência de evidência; baixa ERP não comprova entrega física; conferência pode ocorrer por item, equipe e data, inclusive com duas equipes na mesma O.S. `MESCLA_ITENS_ERP=false` permanece desligado.

## Cobertura A01–A23

| Item | Função implementada na candidata local | Dados e decisões ainda pendentes |
|---|---|---|
| A01 · Entrega parcial | Estado comum entre ficha, Finalizados, Entregas e Performance; separa marcas físicas, conferências e baixa ERP. Conferências independentes por item, data e equipe. | Revisar finalizações legadas com saldo sem reabrir ou corrigir automaticamente. |
| A02 · Comissão | 1% do líquido elegível; 20% interna quando elegível e explicitamente rateada; externa recebe a parcela interna quando não aplicável/impedida com decisão. Dupla externa 60% montador / 40% auxiliar. Prévia, revisão, aprovação e conciliação assinadas no servidor. | Configurar rateios internos, solo/trios+, evidências e início efetivo. Outubro não exporta pagamento. |
| A03 · Responsabilidade | Ocorrência, evidência e decisão humana separadas. Falha comprovada zera somente pontos/comissão da O.S. afetada. Abono permanece documentado. | Gestão analisa os casos reais; não inferir responsabilidade por foto ausente, atraso ou retrabalho de origem desconhecida. |
| A04 · Baixas ERP | Fila e classificação total/parcial/retirada/administrativa/divergência, com responsável confirmado, prazo e motivo. Administrativa/retirada exigem revisão explícita para permitir conferência de instalação. | As 68 pendências citadas na auditoria não foram saneadas; quantidade é linha de base declarada, não consulta atual. |
| A05 · Fotos | Horário do fato separado de anexado/recebido; correção explícita com motivo e autor. Upload não fabrica saída ou retorno. | Conferir horários reais onde não exista evidência confiável. |
| A06 · Exclusão | Exclusão lógica e recuperação restritas à gestão, com motivo e revisão. Fila/importação não ressuscitam registro excluído. Fotos referenciadas permanecem protegidas. | Julgar solicitações reais de exclusão/recuperação. |
| A07 · Totais | Fonte, período, natureza do fato e cobertura; atalhos abrem o conjunto correspondente. Não soma ERP e PCP como duas receitas. | Interpretar cobertura e pendências das fontes, sem considerar cópia local uma base integral. |
| A08 · Saídas antigas | Regularização assistida mantém saída original, motivo, prazo, responsável e última informação. Nova saída volta ao acompanhamento. | Confirmar situação de cada saída real; não inventar retorno. |
| A09 · Veículos | Aliases confirmados por ID e placa, incluindo contagem e conflitos pela identidade confirmada. | Frota deve validar cada equivalência. Uno/UNO e Iveco/caminhão são candidatos, não duplicidades já provadas. |
| A10 · Capacidade | Agenda cruza equipe, veículo, ausências permitidas e duração conhecida. Explica alerta e distingue janela desconhecida de sobreposição. | Completar duração/disponibilidade quando desconhecidas; revisão humana da escala. |
| A11 · Retrabalho | Correção ligada à original por ID; material, horas, km, causa e prevenção. Custo zero medido, desconhecido e parcial distintos; sem duplicar correção em relatórios. | Medir materiais/tempo/deslocamento e configurar R$/h e R$/km. Não foi inventado custo para registros antigos. |
| A12 · Celular | Cabeçalhos e filtros compactados, agenda do dia e primeiros resultados mais próximos do topo, tabelas contidas. | QA visual por dispositivo segue sendo necessário; evidências abaixo são da prévia fictícia. |
| A13 · Carregamento | Base oficial em consulta ou falha de rede não produz acusação transitória de cadastro incompleto. Gestão de equipes mantém cadastro visível. | Indisponibilidade real da fonte não é corrigida por uma estimativa local. |
| A14 · Categoria | Categoria controlada confirmada com preservação da descrição original. | Revisar descrições/aliases reais; não agrupar por palpite. |
| A15 · Pessoas | IDs/equivalências confirmadas, freelancer ativo no planejamento, marcador sem ficha distinguido. Dados RH conforme perfil. | Resolver ambiguidades de pessoas e vínculos na interface; não inferir parentesco ou duplicidade pelo nome. |
| A16 · Itens | Painel → Identidade dos itens: diagnóstico da cópia carregada, sem UID, ambiguidades, alternativas válidas, UID/posição repetidos, referências órfãs e candidatos ERP. Somente leitura. | Medir identificadores reais do ERP em rodada autorizada; nenhuma chamada `formatoItens` real foi feita. Não habilitar mescla até comprovar mapeamento seguro. |
| A17 · Qualidade | Rótulos distinguem participação confirmada, saldo por item, período/cobertura e custo desconhecido. | Completar evidência ausente; zero não significa “não medido”. |
| A18 · PDF e valores | Contrato comum de metadados, estilos de página e tabelas; recorte PCP/Parado/Volta; seleção resumo/completo; dia/mês coerentes na agenda. Servidor remove monetários de perfis restritos; upsert preserva os valores remotos por identidade. Cache de leitura também é projetado. | Homologação visual PDF feita separadamente pelo controlador; navegador pode exigir cabeçalhos/rodapés habilitados. Arquivos exportados anteriormente não podem ser revogados. |
| A19 · Recuperação/sync | Ensaio isolado com manifesto/hash/fotos/regras/fechamentos/auditoria; corrupção/interrupção/idempotência. Fila ganha data persistida, distingue offline/sessão/recusa/idade; estado de incidente compartilhado entre abas. | Não comprova restauração da nuvem. Backup v4 continua OS/CFG locais. Definir operação periódica de recuperação em ambiente autorizado; nenhum scheduler externo foi criado. |
| A20 · Reconhecimento | Reconhecimento separado de ranking operacional, elegibilidade e decisões explícitas, substituições e empate identificados. | Desempate, prêmios, campeões e critérios finais exigem gestão; não premiar automaticamente. |
| A21 · Textos/acessibilidade | Checklist explica fotos; controles identificam item; diálogos nomeados, foco inicial/retorno e teclado preservados. | Verificação contínua com os aparelhos usados pela equipe. |
| A22 · Prioridades | Até cinco sugestões determinísticas com O.S., motivo, origem/data, dono e atalho; busca e histórico contextual. | Sugestões não alteram dados, enviam mensagens ou penalizam pessoas. Nenhuma IA externa foi adicionada. |
| A23 · Gestão de equipes | Vista específica com cadastro, busca, ativas/inativas, nome/logo/animal/cor/líder/integrantes. Associação histórica explícita por entrega/grupo, antes/depois, assinatura e controle transacional de concorrência. | Gestão deve confirmar vínculos reais. Criar Águia não reaplica a composição atual ao histórico. Revisões fechadas permanecem preservadas. |

## Decisões e custos assumidos

- Rateio interno, solo, trios e critérios não definidos ficam configuráveis e pendentes. **Custo:** etapa explícita de configuração e revisão antes da aprovação; evita criar política remuneratória sem autorização.
- Baixas ERP, pessoas, veículos e categorias recebem ferramentas de conferência, não saneamento automático. **Custo:** revisão humana dos casos com documentos e IDs/placas reais.
- Cadastro atual de equipe é separado de associação histórica. **Custo:** conferência por entrega/grupo e preservação de versões, em vez de reescrever todo o passado.
- Associação de equipe usa uma operação transacional estreita no banco. **Custo de publicação:** migration antes da função e da interface; somente `service_role` executa a operação.
- Valores financeiros são removidos na fronteira do servidor, incluindo catálogos e históricos conhecidos, e recuperados do registro remoto ao gravar payload restrito. **Custo:** item legado ambíguo ou com identidade alterada é recusado para revisão da gestão; nenhuma correspondência financeira por posição.
- Cópia local e restauração integral de nuvem são tratadas separadamente. **Custo:** pacote integral fictício e adaptador isolado não substituem snapshot, política de retenção, ensaio de storage e recuperação real autorizada.
- Sem publicação nesta rodada. **Custo:** o benefício operacional permanece indisponível em produção até autorização e verificação pós-publicação.

## PDF: inventário das 14 vistas e relatórios adicionais

| Vista | Exportação e escopo |
|---|---|
| PCP | PDF do recorte de cards exibidos; ficha independente com fotos e indicação de fotos não carregadas. |
| Parado · Cliente | PDF do recorte da vista e seus filtros; não inclui carteira oculta. |
| Volta do carro | PDF dedicado do recorte exibido com declarações/conferências/pendências e autoria/datas disponíveis. |
| Instalação | Serviços abertos de instalação externa do dia selecionado, identificado no documento. |
| Execução | Lista selecionada do dia e espelho operacional. |
| Retrabalho | Análise do período e intervenções carregadas, custo medido/desconhecido. |
| Finalizados | Relatório do recorte filtrado, com situação física/ERP/conferência distinguida. |
| Entregas | Tela/quadro, lote e relatório anual com fonte/cobertura próprias. Rascunho do lote explicitamente identificado; somente seus controles operacionais marcados entram como texto. |
| Performance | Ranking, resumo, detalhado, quadros e TV; fonte/revisão operacional indicada pelo fluxo. Resumo não promete detalhes removidos. Comissão tem demonstrativo/revisão próprios. |
| Calendário | PDF do dia selecionado, incluindo o histórico se habilitado; só O.S. desse recorte. Plantões/eventos não são confundidos com serviços. |
| Plantões | Relatório do intervalo selecionado, independente da agenda de serviços. |
| Programação | Dia ou mês inteiro conforme a vista; inclui histórico quando escolhido. Uma O.S. pode aparecer em mais de um dia agendado. |
| Painel | Intervalo e blocos do painel, com escolha de resumo/completo. |
| Configurações | Sem PDF operacional; não clonar usuários, senhas, contatos ou controles secretos. Diagnóstico de itens tem relatório próprio e autorizado. |

Os documentos informam período, filtros, fonte, consulta, revisão e cobertura. Seções autorizadas recolhidas entram na modalidade completa; nós ocultos de outras telas não são revelados. Campos genéricos de formulário não são exportados. Os estilos solicitam repetição do cabeçalho e permitem quebra de nomes longos, preservando códigos, datas e valores. No Safari testado, o cabeçalho apareceu somente na primeira página e uma linha pôde continuar na página seguinte; o conteúdo permaneceu completo. Essa limitação de impressão está aberta. Há numeração via CSS de página e orientação para cabeçalhos/rodapés do navegador quando necessário.

## Validação e recuperação reproduzíveis

Runtime utilizado: `/Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

- `node --test tests/relatorios-integracao.test.cjs tests/telas.test.cjs tests/ficha-etapas.test.cjs`: 55 testes aprovados na rodada focal de auto-revisão; inclui 11 cenários novos de integração.
- `node scripts/verificar.cjs`: **1.447 testes aprovados, zero falhas, cancelamentos ou testes ignorados**, na árvore final `d74a2aa`. Sintaxe também conferida. Log completo: `evidencias/pcp-verificacao-final-20261003.log`.
- `node scripts/ensaio-recuperacao.cjs`: cria diretório temporário próprio e gera `pacote.json`, `manifesto.json`, `resultado.json`. Dez verificações: contagens/hash, relações OS→entrega→item→foto, regra→fechamento, auditoria, parcelas 5100+12900=18000, reload, idempotência, interrupção, corrupção recusada e funções reais de exportação/importação v4 em sandbox. Nenhuma rede ou credencial.
- `node scripts/preview-relatorios.cjs`: inicia somente `127.0.0.1:4240`; fixture de 180 linhas com nomes extensos e valores completos, navegação por 14 vistas e cinco perfis. É ensaio do contrato de página, não prova sozinho o funcionamento de todas as abas. QA real de fluxos ocorre na prévia isolada `4239`.
- Migration `0004` executada pelo controlador em PostgreSQL 18.3 via PGlite 0.5.8 isolado: oito verificações (service_role, versões antigas de OS/config, equipe inativa, registro excluído, anon/authenticated recusados, parâmetros inválidos e rollback). Evidências temporárias `/private/tmp/pcp-sql-validation/validate.mjs` e `result.json`. **Limite:** conexão única; não é ensaio de duas sessões concorrentes. Nenhum SQL de produção.

O backup v4 do aplicativo contém somente O.S./configuração locais. Não contém objetos do bucket, coleção versionada de regras, fechamentos nem auditoria integral. Seu fluxo de importação/reenvio não é transação de recuperação da nuvem. O ensaio integral entregue usa um adaptador em memória e dados fictícios; não há alegação de restauração real.

## Publicação futura — dependências obrigatórias

1. Obter autorização explícita para publicação e garantir backup adequado do ambiente autorizado.
2. Aplicar `supabase/migrations/0004_vinculo_equipe_cas.sql` antes do backend que chama `pcp_vincular_equipe_cas`.
3. Publicar funções do servidor e dependências `_shared`, incluindo a proteção monetária e a operação transacional; verificar autorização e casos de conflito.
4. Publicar a interface candidata v148 com todos os novos módulos e os arquivos `config.js`, `index.html`, `equipe.html` e `sw.js` coerentes. A atualização da casca não é autorização para publicar.
5. Verificar versão pública, funções servidas, cache/service worker e fluxos por perfil com dados autorizados. Só então declarar implantação concluída.
6. Resolver dados e decisões de gestão em rodada própria. Nenhuma versão fechada ou dado real deve ser reescrito por uma atualização de interface.

## Correção da revisão final integrada

A projeção restrita também remove o identificador pessoal `porId` das novas autorias de vínculos e cadastros, no servidor e no cache, preservando autoria armazenada e respostas da gestão. Comissão pagina integralmente versões e revisões por chave estável, sem limite global de mil linhas, lendo versões antes do histórico e mantendo a disputa atômica de aprovação. Falha de página/cursor ou prazo de 25 segundos bloqueia cálculo/gravação incompleta.

O contrato PDF reserva espaço para O.S., datas e valores sem fragmentá-los, mantendo quebra de nomes longos e conteúdo íntegro; repetição de cabeçalhos depende do motor do navegador (Safari observado não repetiu thead). Finalizados mobile quebra status longos e preserva ações. Nesta onda, 182 testes focados passaram; o controlador confirmou depois os 1.447 testes da suíte integral e a revisão visual indicada abaixo. Nenhuma publicação, alteração de registros reais ou nova migration foi executada.


## Conferência final pelo controlador

- **14 abas no computador (1366 × 900):** abriram sem erros de console observados e sem transbordamento horizontal da página.
- **14 abas no celular (390 × 844):** 13 passaram inicialmente; Finalizados excedia a largura com o texto da entrega parcial. Após a correção, o caso TESTE-PARCIAL voltou a 390/390 px e manteve situação, valor conferido, saldo e botões. Ranking e calendário foram examinados visualmente; primeiro título de equipe aproximadamente a 562 px, dentro da primeira tela.
- **Gestão de equipes:** pesquisa, edição de cadastro e conferência do vínculo da equipe fictícia criada depois das entregas. Associação de somente uma parcial, preservando a outra composição, quantidade e valor. Reabertura verificada. Nenhum registro real foi associado à Águia.
- **Conferência operacional:** associação de veículo fictício por ID/placa, categoria exata ADESIVO e medição da correção (R$ 120 de material, 2 horas e 0 km). Salvamento e reabertura preservaram os campos; nenhum custo ou identidade real foi inferido.
- **PDF extenso no Safari:** arquivo horizontal de 18 páginas, 180 identificadores presentes e 180 valores monetários íntegros; primeira e última páginas examinadas. Nomes completos preservados. Cabeçalho repetido e quebra de linha entre páginas continuam como limitações do Safari observado. A prova usa dados fictícios e o contrato comum; não é exportação de todas as abas reais.
- **Recuperação:** dez verificações passaram no ensaio isolado, incluindo interrupção, corrupção recusada e backup v4 real no sandbox. Sem restauração do banco ou das fotos de produção.
- **Revisão final independente:** os dois achados importantes (autoria pessoal em respostas restritas e limite global de mil versões financeiras) foram corrigidos e reavaliados. Nenhuma nova regressão importante/crítica identificada na onda de correção.

## Como usar a nova gestão de equipes

1. Abra **Performance → Gestão de equipes**.
2. Pesquise **Águia**. Em **Editar cadastro**, ajuste nome, identidade visual, líder, integrantes e situação.
3. Em **Conferir vínculos**, revise as entregas e as composições indicadas. A lista mostra a equipe anterior, os integrantes e a parcial.
4. Use **Comparar e confirmar**, confira os dados e confirme somente o vínculo correspondente. O ranking da base aberta passa a identificar a equipe; revisões fechadas permanecem históricas.

O aviso “sem entregas vinculadas” significa ausência de associação no período, não prova que a equipe deixou de trabalhar. O novo cadastro não pode adivinhar quais entregas antigas pertencem à equipe.

## Decisões de execução registradas

Estas decisões correspondem ao registro da implementação, em ordem; não são novos lançamentos ou política de pagamento:

1. Rateio interno e critérios ainda não definidos ficaram configuráveis e pendentes, por falta de autorização para presumir beneficiários. Custo: uma etapa de configuração antes de pagar.
2. As baixas ERP e aliases receberam ferramentas de conferência, sem saneamento automático por falta de evidência física/placas. Custo: revisão humana dos casos reais.
3. Esta rodada ficou local, sem publicação. Custo: benefícios ainda indisponíveis na versão pública até a implantação autorizada.
4. O pedido da Águia entrou na auditoria como A23, com gestão de equipes e associação explícita. Custo: confirmar as entregas históricas, preservando a composição original.
5. A proteção geral de valores detectada durante a segunda etapa foi concentrada na integração final e concluída ali. Custo assumido: cobertura adicional no servidor e nos testes antes de concluir.
6. O vínculo de equipe passou a exigir operação transacional no banco para evitar disputa entre alteração de cadastro e da O.S. Custo: aplicar a migração antes das funções/interface em futura publicação; o teste isolado não substitui duas sessões reais concorrentes.

Código preservado na branch `codex/auditoria-performance-experiencia`, clone isolado `/private/tmp/impresilk-entregas-parciais-20261002`. **Implementado e validado localmente; ainda não publicado.**
