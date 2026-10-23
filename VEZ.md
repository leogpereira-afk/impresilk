# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-23T12:53:36.704Z
ramo: codex/rota-campos-mobile
tarefa: Motorista vinculado ao RH nas rotas
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-23T13:03:57.872Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: e5f9013 PCP v198. Deploy 39957627569 e servidor 39957268548 verdes. pcp-sync v166, modulo rotas-dados igual ao testado.
ramos: codex/rota-motorista-rh incorporado na main; demais preservados.
feito: Seletor RH por motoristaId, equipe primeiro, nome canonico validado no servidor. docs/planos/2026-10-23-motorista-rh.md.
pela_metade: Nenhum codigo pendente. Rota real sem atribuicao presumida.
decisoes: D-021: motorista pelo cadastro do RH e membros da equipe primeiro.
perguntas_ao_dono: Nenhuma desta entrega.
nao_fazer: Nao criar vinculo por nome legado. Rascunho antigo exige selecao por ID antes de confirmar.
testes: 2208 aprovados; zero falhas/pulados. Mobile 375px, grupos, selecao por ID e ausencia de overflow. Servidor valida inexistente/inativo/desligado/bloqueado e nome canonico.
dados: Nenhum dado real alterado; nenhuma migration.