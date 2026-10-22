# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T20:07:06.795Z
ramo: codex/entregas-mapa-20261022
tarefa: Implementar visual aprovado do roteiro e integracao real de mapas
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T20:19:29.392Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v192; nenhuma publicacao funcional nesta tarefa.
ramos: codex/entregas-mapa-20261022 em /tmp/pcp-entregas-mapa-20261022; commit local 0384f7a.
feito: Roteiro compacto, equipe, impressao e adaptador Geoapify; ver docs/planos/2026-10-22-roteiro-entregas-mapa.md.
pela_metade: Ativacao de conta Geoapify e segredo PCP_GEOAPIFY_KEY; consulta real e mapa estatico ainda nao validados.
decisoes: Dono aprovou visual e pediu alternativa com plano gratuito; Geoapify preparada.
perguntas_ao_dono: Dono informou que vai abrir conta gratuita; aguardar acesso sem pedir chave no chat.
nao_fazer: Nao publicar sem autorizacao; nao afirmar calculo real ativo; nao modificar O.S.; nao usar tile publico bloqueado.
testes: 2186 testes passaram; previa ficticia desktop e celular; impressao e recarga sem duplicar.
dados: Nenhum dado produtivo alterado; apenas fixtures ficticias; segredo nao configurado.