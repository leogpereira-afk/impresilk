# Kaizen PCP: confiabilidade, carga e manutenção

Data: 22/10/2026. Base: v191. Situação: implementação verificada; publicação da v192 autorizada pelo dono em 22/10/2026 ("Subir"). Conferência da publicação será registrada na passagem da vez.

## Resultado para quem usa

Duas falhas de sincronização foram reproduzidas e corrigidas. A lista de Retrabalho passou a buscar seus vínculos com menos trabalho. Regras de pagamento, permissões e fechamento permanecem as existentes.

| Prioridade | Problema reproduzido | Impacto | Correção local e evidência |
| --- | --- | --- | --- |
| Alta | Duas gravações no mesmo milissegundo, resposta da primeira chega depois da segunda edição | O texto mais novo voltava ao antigo na tela; editar outro campo podia reenviar o texto antigo | A resposta só substitui a cópia local se não houver nova gravação pendente. Revisão do servidor continua sendo adotada. Cenário falhou antes e passou depois |
| Alta | Uma ação aguarda a requisição anterior e é alterada ou removida nesse intervalo | Envio de informação desatualizada ou de ação que já foi retirada da fila | Cada envio consulta a ação atual da fila; ações removidas são ignoradas. Cenário de substituição falhou antes e passou depois; retirada também tem regressão |
| Média | Montagem dos vínculos de Retrabalho procurava a carteira inteira para cada correção | Carteira maior exigia trabalho desproporcional para exibir a aba | Índices por número e ID; configuração lida uma vez. Números duplicados continuam exigindo vínculo inequívoco |

Medição determinística da busca: com 300 registros havia 45.600 leituras de número, e com 1.200 havia 722.400. Após a correção: 600 e 2.400, respectivamente. É uma redução do trabalho desta busca, **não** uma promessa de que a tela inteira abrirá 301 vezes mais rápido. Ordenação, HTML e navegador continuam tendo custos próprios. O teste monitora crescimento para impedir a volta do problema.

## Simulações e cobertura

Todos os dados novos são fictícios. Rede, armazenamento e servidor dos testes são simulados. Nenhuma carga foi disparada contra o banco, ERP ou site de produção.

| Frente | Cenário executado | Resultado observado |
| --- | --- | --- |
| Offline | 250 salvamentos da mesma O.S. antes da reconexão | Uma ação com a última versão; sincronização esvazia a fila |
| Concorrência | Resposta lenta com edição no mesmo milissegundo | A edição nova permanece na lista e na gravação seguinte |
| Fila | Atualizar ou retirar a próxima ação enquanto outra aguarda resposta | Não envia a cópia antiga nem a ação retirada |
| Limitação de requisições | 100 O.S.; servidor responde 429 após 37 aceites | 63 permanecem pendentes; retomada chega a 100 aceites distintos |
| Sessão | 401 depois do primeiro aceite | O restante permanece para a sessão seguinte |
| Atualização paginada | Falha 503 na página 10 de uma base de 1.500 registros | Base anterior inteira preservada, sem mistura parcial |
| Entregas | 240 combinações de quantidade e centavos, até 100 entregas por O.S. | Soma dos centavos e saldo corretos; excesso recusado |
| Limite de entregas | 101 e 250 entregas na mesma O.S. | Bloqueio explícito pelo limite já existente de 100; não foi elevado |
| Agenda | Duração infinita, negativa, inválida ou extremamente alta | Limite defensivo de até 366 dias; sem datas repetidas |
| Cancelamento | 64 combinações de progresso operacional | Cancelamento prevalece; não reaparece como concluída ou programada |
| Retrabalho | Carteiras de 300 e 1.200 registros | Contagens corretas e crescimento proporcional da busca no cenário |
| Vínculos | Número de O.S. repetido, vínculo explícito e original ausente | Sem atribuir a correção à original errada |
| Regras existentes | Acesso por perfil, integridade, mês fechado, dois meses, paridade entre tela e servidor, rotas e conferência de entregas | Suítes direcionadas passaram |
| Tela e relatório | Filtros de situação/pessoas/período, contagens e conteúdo enviado à impressão | Testes da tela passaram; filtro por responsável e limpar todos também conferidos no navegador da prévia |

A primeira execução completa no ambiente restrito encontrou `listen EPERM` em testes que abrem servidor local. A repetição com permissão para os servidores locais concluiu normalmente. Não era defeito do PCP.

A expectativa inicial de permitir 101/250 entregas no teste estava incorreta: o produto já tem limite de 100. O teste foi ajustado à regra existente, e o bloqueio ganhou verificação explícita.

## Evidências reproduzíveis

- Base antes das alterações: 2.157 testes passaram.
- Rodada direcionada: 324 testes passaram, zero falhas ou pulados.
- Verificação completa final: 2.170 testes passaram, zero falhas ou pulados; inclui sintaxe dos arquivos JavaScript da raiz.
- `git diff --check`: sem erros.
- Prévia isolada: seleção de Produção fictícia reduziu a lista de seis para um retrabalho. Limpar todos restaurou Pendentes, todas as pessoas e os seis registros.
- Testes novos em `tests/kaizen-concorrencia.test.cjs`, `tests/kaizen-operacoes.test.cjs` e `tests/telas.test.cjs`. Bancada isolada em `tests/helpers/store-kaizen.cjs`.

## Rotina para quem programa

Com Node 22.13 ou superior, na raiz:

```sh
npm run test:kaizen
npm run test:kaizen -- --listar
npm run test:kaizen -- sincronizacao operacao
npm run test:kaizen -- integridade acesso telas
npm run verificar
```

O comando reúne testes existentes e os novos por frente; argumento desconhecido falha com orientação. Não depende da velocidade do computador para julgar a busca de vínculos e não acessa produção. A rodada direcionada ajuda a investigar; a suíte completa continua obrigatória antes de publicar.

A montagem de pares foi extraída de `renderRetrabalho` para `retrabalhoPares`, separando vínculo de apresentação e permitindo verificar casos ambíguos diretamente. A bancada permite controlar a ordem das respostas sem esperas arbitrárias.

Ciclo sugerido para cada mudança:

1. Registrar problema observável, usuário afetado e cenário de reprodução.
2. Criar a regressão e confirmar a falha na base anterior.
3. Aplicar a menor correção que resolve a causa.
4. Executar grupo direcionado, suíte completa e conferência da interação afetada.
5. Publicar somente após autorização; conferir a versão servida e o comportamento.
6. Registrar resultado e atualizar a fila abaixo. Não adicionar um indicador sem definir como será medido.

## Próximas rodadas propostas

| Ordem | Melhoria | Benefício | Esforço relativo / dependência | Como comprovar |
| --- | --- | --- | --- | --- |
| 1 | Ensaio em dois aparelhos e duas abas, com perda real de conexão e reabertura | Confiança no trabalho de campo | Médio; ambiente de homologação e aparelhos | Nenhuma edição perdida, conflitos identificados e retomada após reinício |
| 2 | Medir renderização e filtros com carteiras maiores, depois adotar paginação onde houver gargalo comprovado | Menor espera em aparelhos modestos | Médio; repetir cenários em navegador real | Tempo de interação e contagens corretas antes/depois, por tela |
| 3 | Separar progressivamente regras puras de apresentação em app.js, casa.js e performance.js | Correções menores e menos efeitos laterais | Médio por módulo; evitar reescrita geral | Mesmas entradas/saídas, dependências explícitas e suíte completa |
| 4 | Revisar avisos de sincronização com quem usa campo e escritório | Saber o que foi salvo, está pendente ou exige ação | Pequeno a médio; validar entendimento | Usuário identifica corretamente estado e próximo passo em cada falha |
| 5 | Contratar/configurar o provedor de rotas antes de prometer distância e tempo reais | Planejamento de entregas verificável | Dependência externa e decisão do dono | Percurso conferido com provedor e estimativas identificadas |

Não são defeitos confirmados: arquivos grandes, ausência de paginação em uma tela específica e necessidade de novos indicadores exigem medição antes de mudar. O tamanho atual dos principais módulos (mais de 11 mil linhas em app.js, 5 mil em casa.js e 3 mil em performance.js) motiva extração gradual, não uma reescrita nesta rodada.

## Limites e entrega

A suíte completa percorre várias frentes do PCP; isso não equivale a auditoria exaustiva de todos os estados, segurança externa ou certificação da operação. Sem teste de volume no ERP, sem medição de latência de produção e sem ensaio físico offline nesta rodada. O PDF foi coberto pelo conteúdo preparado para impressão nos testes; não foi feita nova auditoria visual de todas as páginas impressas.

Código pronto em ramo local `codex/kaizen-pcp-extremos-20261022`. Publicação da v192 autorizada pelo dono em 22/10/2026. Sem mudanças no banco, dados operacionais reais, regras financeiras ou servidor. Nenhum agendamento recorrente foi criado.
