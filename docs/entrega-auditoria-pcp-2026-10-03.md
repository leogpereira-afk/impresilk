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

Os documentos informam período, filtros, fonte, consulta, revisão e cobertura. Seções autorizadas recolhidas entram na modalidade completa; nós ocultos de outras telas não são revelados. Campos genéricos de formulário não são exportados. As tabelas repetem cabeçalho e permitem quebra de nomes/valores longos. Há numeração via CSS de página e orientação para cabeçalhos/rodapés do navegador quando necessário.

## Validação e recuperação reproduzíveis

Runtime utilizado: `/Users/leonardopereira/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.

- `node --test tests/relatorios-integracao.test.cjs tests/telas.test.cjs tests/ficha-etapas.test.cjs`: 55 testes aprovados na rodada focal de auto-revisão; inclui 11 cenários novos de integração.
- `node scripts/verificar.cjs`: 1.436 testes aprovados, zero falhas na suíte completa. Log `/private/tmp/task4-final-suite.log`; primeira rodada 1.429/1.434, com três contratos/mocks ajustados e dois testes que precisavam de loopback local.
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
