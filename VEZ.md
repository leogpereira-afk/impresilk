# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-23T12:41:38.214Z
ramo: codex/rotas-sincronizadas-20261022
tarefa: Campos visiveis da rota no celular
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-23T12:47:27.300Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: 52a9731, PCP v197. Deploy 39955654207 verde; rotas-ui.js, rotas.css e config.js publicos iguais ao clone. Servidor nao alterado.
ramos: codex/rota-campos-mobile incorporado na main; demais preservados.
feito: Equipe, veiculo e motorista visiveis em Dados da rota; layout compacto a 375px. docs/planos/2026-10-23-rota-campos-mobile.md.
pela_metade: Nenhum codigo pendente. Rota operacional continua rascunho sem atribuicoes presumidas.
decisoes: Nenhuma regra de negocio alterada; ajuste visual solicitado pelo dono.
perguntas_ao_dono: Nenhuma para esta alteracao.
nao_fazer: Nao confirmar rota nem atribuir equipe ou veiculo sem definicao operacional.
testes: node scripts/verificar.cjs: 2204 aprovados, zero falhas/pulados. Mobile 375px: campos editaveis fora de details, sem overflow, data e horario alinhados.
dados: Nenhum dado real alterado; sem migration.