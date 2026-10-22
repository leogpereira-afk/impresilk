# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T20:58:45.887Z
ramo: codex/entregas-mapa-20261022
tarefa: Sincronizar rotas e acesso da equipe no celular
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T21:19:11.820Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: 8d8b8a6, PCP v196, pcp-sync v165 e pcp-mubisys v143. Deploy 39855602195 e functions 39855196057 verdes; modulo do servidor e dez arquivos publicos iguais ao clone.
ramos: codex/rotas-sincronizadas-20261022 incorporado na main (0 a frente, 0 atras antes desta passagem); anteriores preservados conforme docs/RAMOS.md.
feito: Persistencia privada de rotas, revisao concorrente, rascunho preservado e leitura de mapa/roteiro pela equipe por ID. Plano em docs/planos/2026-10-22-rotas-sincronizadas.md. Salvamento real, abertura do servidor em segunda aba e recarga conferidos.
pela_metade: Nenhum codigo pendente desta entrega. A rota operacional permanece Rascunho: precisa de equipe, veiculo, motorista e perfil conferidos antes de calcular e liberar. Mapa persistido, isolamento e concorrencia testados com dados ficticios; nao houve liberacao presumida para equipe real.
decisoes: D-020: rotas salvas no servidor e acesso da equipe atual pelo ID do RH, sem custos na resposta.
perguntas_ao_dono: Definir equipe, veiculo cadastrado, motorista e perfil viario da rota antes da confirmacao operacional; nenhuma atribuicao presumida.
nao_fazer: Nao reenviar edicao antiga sobre revisao nova. Abrir versao do sistema preserva rascunho pendente separado. Nao confundir acompanhamento de rota com entrega fisica ou fechamento de O.S. Nao publicar dados reais.
testes: node scripts/verificar.cjs: 2204/2204 aprovados. Dois clientes, retry apos falha, conflito, revogacao, custos ausentes e troca de conta. Previa da equipe a 375px e PDF carregado com mapa/instrucoes. Producao salva/reabre sem duplicar; dez arquivos conferidos por hash.
dados: Migration 20261022220000_pcp_rotas.sql aplicada: RLS ativa, sem grants anon/authenticated. Rascunho atual salvo pela interface autorizada; nenhuma O.S., equipe ou veiculo foi alterado. SELECT confirmou registro unico na revisao inicial.