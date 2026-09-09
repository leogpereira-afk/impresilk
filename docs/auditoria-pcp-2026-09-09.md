# Revisão operacional do PCP — 09/09/2026

## Parecer para a gestão

O sistema tem uma base útil: carteira de O.S, retirada pelo cliente, programação de equipes, conferência de embarque, fotos, retrabalho e histórico. O principal problema encontrado está na interpretação dos registros: preenchimento da ficha parecia avanço de produção, baixa do ERP parecia entrega física e liberação do carro parecia saída efetiva. Isso dificulta decidir o que produzir, quem mobilizar e quais entregas cobrar.

As alterações desta revisão tornam essas diferenças visíveis e acrescentam prioridades e conferência diária. Não constituem um planejamento de capacidade: ainda faltam horas previstas, deslocamento, disponibilidade e materiais por operação.

## Escopo e evidência

- Navegação no site publicado: PCP, Instalação, Execução, Retrabalho, Finalizados, Painel e Configurações. POPs foi retirado da navegação, das permissões disponíveis, dos atalhos e dos arquivos publicados. Após autorização expressa, o módulo pops.js e seus estilos também foram excluídos do código do PCP. O sistema independente de POPs permanece fora do escopo.
- Código de leitura/cálculo, filtros, relatórios, formulário, espelho do instalador, cache, fila de sincronização e caminhos principais das funções do servidor revisados.
- Implementação em cópia isolada baseada no commit `f2b620b`. Não houve alteração de O.S, credenciais, permissões ou banco de produção.
- Em consulta visual de 09/09, o diagnóstico publicado mostrava 754 O.S na nuvem, importação automática registrada às 19:21:22 e nenhum envio pendente naquele aparelho. A área de acessos informava sessão expirada. Isso comprova a resposta mostrada por essas telas, não uma certificação de disponibilidade permanente.
- A qualidade individual de cada cadastro, a veracidade das fotos e a entrega física ao cliente não foram certificadas. O levantamento de riscos do servidor abaixo é análise do código, sem provocar concorrência ou falha em produção.

## Entregue no código

| Frente | Problema encontrado | Comportamento novo |
|---|---|---|
| PCP | Carteira extensa sem uma síntese das decisões do dia | Indicadores de hoje, prazo vencido, falta de prazo, retirada, saída a conferir e retrabalho pendente; clique abre exatamente as O.S contadas |
| PCP | Percentual de ficha confundido com avanço da produção | Percentual identificado como “Ficha”; quantidade de itens prontos permanece separada |
| PCP | Previsão vencida sem agenda não recebia alerta de atraso | Regra única de prazo; programação tem prioridade, previsão do ERP é alternativa |
| PCP | Serviço de vários dias parecia vencido no segundo dia | Conclusão prevista usa o último dia da programação |
| Retrabalho | Pendência podia desaparecer do filtro do PCP após a finalização | Retrabalhos sem data de resolução permanecem no grupo de pendências |
| Instalação | Lista e quadro consideravam conjuntos diferentes | Mesma base de instalações externas em aberto, incluindo continuação de outros dias |
| Instalação | “7d” buscava passado e incluía oito datas | Programação inicia nos próximos sete dias; atalhos identificam passado/futuro e contam datas inclusivas corretamente |
| Instalação | Nenhuma conferência de recursos | Visão do dia com PCP, equipe, veículo e cliente pendentes; possíveis conflitos de equipe/veículo por turno, com acesso às fichas |
| Ficha | Conflito só seria percebido olhando a carteira | Aviso também na programação da O.S, atualizado ao mudar datas, período, duração ou veículo |
| Execução | Carro liberado contava como equipe na rua; retiradas apareciam para liberar carro | Somente instalações externas; saída registrada é distinta de autorização; registros antigos sem retorno vão para conferência |
| Espelho | Régua de status diferente para retirada | Gestão e espelho usam regras compartilhadas |
| Painel | Conclusão filtrada pela agenda, em vez da finalização | Conclusões selecionadas pela data de finalização; detalhe usa a mesma base do indicador |
| ERP | Encerramento automático, inclusive cancelamento, parecia entrega no dia | Identificação “Encerrada no ERP”; data de recebimento da baixa separada de conclusão registrada pela equipe |
| Mensal | O.S com duas pessoas virava duas entregas no total | O.S únicas, participações e registros sem equipe separados; retiradas e baixas ERP fora do indicador de instalações por pessoa |
| Tempo | Sem medição aparecia 0,0h; vários dias eram reduzidos a menos de 24h | Ausência aparece “—”; carimbos completos preservam vários dias; tempo identificado como saída até retorno, incluindo deslocamento |
| Indicadores | Turno chamado “tipo de instalação”; notas pareciam avaliação de produtividade | Rótulos corrigidos e critérios/amostra dos índices descritos; participação não atribui culpa pelo retrabalho |
| Comparativos | Mês parcial comparado com mês anterior inteiro; base zero virava +100% | Comparação dos mesmos dias; ausência de base percentual explícita |
| Relatórios | Total mensal duplicado e baixas ERP indistintas | Contagens e identificação de origem corrigidas nos relatórios mensais e de finalizados; programação diária segue a base da tela |
| Navegação | Cabeçalho transbordava no celular; tabela de permissões alargava a página | Cabeçalho em duas linhas, ações com rolagem própria e tabelas contidas; nomes de abas consistentes |
| Acessibilidade | Cartões/blocos dependiam só do mouse; datas sem nome | Foco e ativação por teclado nas listas principais, indicadores e blocos; identificação de datas e permissões |
| Sincronização | Edição podia ser descartada depois de 25 falhas | Edição permanece na fila, com aviso; falta de foto também não apaga silenciosamente o upload pendente |
| Cache | Migração removia origem antes da conclusão da gravação | Origem removida somente após confirmação da transação local |
| Consulta | Paginação interrompida podia modificar parcialmente ou remover cache | Coleta completa antes da mesclagem; cursor repetido/resposta inválida aborta sem truncar a memória |
| Atualização | Service worker apagava caches dos demais sistemas da mesma origem | Limpeza restrita ao cache do PCP; nova versão inclui a regra compartilhada |
| Publicação | Cópia ampla de arquivos e ausência de testes no fluxo | Lista explícita de arquivos do site e verificação automática antes de publicar; testes, guias e prévia ficam fora do site |

## Regras de interpretação

1. **Prioridades não somam a carteira.** Uma O.S pode estar atrasada e sem retorno. O clique mostra o conjunto correspondente, sem herdar os filtros da grade.
2. **Programada não significa pronta.** A conferência mostra os impedimentos; liberação do PCP, confirmação e saída continuam exigindo registro humano.
3. **Conflito é uma possibilidade.** Manhã e tarde distintas não colidem; dia inteiro e horários sem duração exigem conferência. Não há cálculo de capacidade em horas nem otimização de rota.
4. **Nome é o identificador de recurso disponível.** Nomes/apelidos diferentes não são fundidos automaticamente. Isso pode deixar de apontar conflitos de uma pessoa cadastrada de formas diferentes.
5. **Saída não é localização em tempo real.** O indicador usa registros de saída/retorno e o intervalo programado. Registro antigo, sem dia válido ou futuro não é tratado como prova de equipe na rua hoje.
6. **Conclusão registrada não é confirmação independente de entrega.** Baixas automáticas são separadas; o restante usa o registro feito no aplicativo. Datas antigas ainda dependem da qualidade do apontamento original.
7. **Filtros têm contexto explícito.** Painel usa agenda para instalações previstas e finalização para conclusões; quadro atual, histórico completo e mês do relatório estão identificados separadamente.

## Pontos do servidor que ainda precisam de correção

Estes pontos não foram implantados nesta revisão. Exigem alteração coordenada no servidor e testes em ambiente separado antes de produção.

| Prioridade | Evidência no código | Consequência | Próxima entrega recomendada |
|---|---|---|---|
| Alta | `pcp-sync`: leitura de `rev`, comparação e `setReg` por upsert são operações separadas | Duas edições simultâneas podem ler a mesma revisão e ambas serem aceitas | Gravação condicional/atômica pela revisão esperada, conflito explícito e teste com dois clientes concorrentes |
| Alta | `pcp-mubisys`: baixa automática copia o registro previamente lido e faz upsert sem incrementar `rev` | Pode sobrescrever edição feita durante a importação; cache que compara revisão pode não receber a mudança | Atualizar somente os campos de origem ERP, com revisão e precondição de que a O.S continua aberta |
| Alta | `pcp-mubisys`: consulta da carteira para baixa sem paginação explícita | Ao atingir o limite de resposta configurado no servidor, parte da carteira pode não ser conferida | Paginação por chave, contagem esperada e bloqueio de aplicação quando a leitura for incompleta |
| Média | `carimbarMomento`: horário manual sem carimbo herda a data programada | Reagendamento ou anotação tardia pode gerar um dia de saída/retorno incorreto | Campos explícitos de data e hora do evento, preservando agenda separadamente; revisão assistida dos registros antigos |
| Média | `retrabalho`, `causa`, `dataResolvido` na própria O.S, sem eventos independentes | Reincidência e idade real do retrabalho não podem ser medidas com segurança | Histórico de ocorrências com abertura, causa, responsável, prazo, custo e resolução |

## Evolução recomendada para o PCP

| Ordem | Informação a acrescentar | Decisão que passa a ser possível | Responsável sugerido |
|---|---|---|---|
| 1 | Motivo de bloqueio, responsável e previsão de liberação | Cobrar a pendência que impede a entrega | PCP e líder do setor |
| 2 | Disponibilidade de pessoas/veículos e vínculo por ID | Evitar escala de pessoa ausente e duplicidade por apelido | PCP, RH e frota |
| 3 | Operações produtivas por O.S, horas previstas, material e sequência | Medir carga por setor e identificar gargalo antes de prometer prazo | Gestão da produção |
| 4 | Prazo prometido original, revisões acordadas e data real de entrega | Medir atendimento do prazo sem a remarcação apagar o atraso histórico | Comercial e PCP |
| 5 | Início/fim, pausa e deslocamento registrados com data completa | Distinguir esforço produtivo de viagem e espera | Equipe de instalação |
| 6 | Materiais faltantes, quantidade e chegada prevista | Programar apenas serviços executáveis | Compras e produção |
| 7 | Ocorrências e custo de retrabalho, com vínculo à O.S original | Identificar causas recorrentes e o custo da não qualidade | Qualidade e financeiro |

Integrações com RH/Compras devem usar identificadores e decisões explícitas. Não inferir vínculo de colaborador, disponibilidade ou causa de retrabalho a partir de nomes, pagamentos ou presença na equipe da O.S.

## Validação e publicação

- Verificação local: sintaxe dos arquivos JavaScript e 32 testes de regras, telas e persistência, sem dependências de teste adicionais.
- Comparação com a base anterior: 13 testes de regressão falham na versão original e passam nas correções. Os três testes de comportamentos já corretos continuam passando.
- Prévia com dados fictícios e conexões externas bloqueadas. Navegação nas sete abas, lista/quadro, conferência diária, abertura da ficha por conflito e aviso dentro da ficha verificados no navegador.
- Layout conferido no tamanho padrão do navegador e com largura de 390 px; transbordamento do cabeçalho e de Configurações corrigido.
- Carteira reorganizada em situação, busca, atendimento e etapa. Controles maiores, total de O.S exibidas, seleção acessível e ação de limpar filtros preservando a vista e a ordenação. Busca combinada, lista vazia, finalizadas, retrabalho e legenda conferidos no navegador.
- Entrada do PCP orientada ao trabalho do dia: destaque para “Para hoje”, cores e emojis por prioridade, ações explícitas e abertura das fichas pela lista. A frase rotativa fica oculta nesta aba. Cards mostram cliente, serviço e próximo passo, com a ação principal maior; atraso continua indicado por faixa vermelha, fundo e aviso escrito. Prioridades mantêm os critérios anteriores e independem dos filtros da carteira.
- Revisão final do desktop: sete abas, cards completos, programação, histórico, tabelas e configurações. Os indicadores ocupam a largura disponível; ações dos cards ficam alinhadas; campos das configurações seguem o padrão da ficha; troca de aba retorna ao início. Retrabalho pendente mantém cor de atenção mesmo após conclusão da O.S original, e o histórico explicita os retrabalhos sem equipe ou em retiradas.
- Não foram executados upload real de fotos, envio de WhatsApp, restauração de backup, mudança de credenciais ou publicação do servidor. Não houve alteração de registros de produção.
- Comando de verificação: `npm run verificar`. Prévia isolada: `npm run preview:auditoria`.
- A publicação no endereço oficial e a validação posterior com dados reais complementam a validação local; o fluxo de publicação executa novamente as verificações antes de disponibilizar os arquivos.

## Roteiro de aceite para publicação

1. Abrir PCP e conferir ausência da aba/atalhos POPs e presença das prioridades.
2. Abrir o grupo de uma prioridade e confirmar que a quantidade coincide com as fichas exibidas.
3. Conferir um dia de instalação, alternar quadro/lista e abrir uma O.S pelos avisos de recurso.
4. Comparar “saídas sem retorno” na Execução com o indicador atual do Painel; conferir registros antigos na prioridade correspondente.
5. Conferir no histórico uma baixa automática e uma conclusão humana; a primeira não deve entrar na produtividade mensal.
6. Confirmar fila sem descarte, versão nova do aplicativo e diagnóstico da importação. Se uma edição tiver conflito, revisar as duas versões pelo fluxo existente.
