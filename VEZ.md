# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T11:38:18.054Z
ramo: codex/retrabalho-filtros-20261022
tarefa: Publicar filtros de retrabalho por responsavel e tecnico e conferir site e PDF
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T11:45:02.713Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v186, codigo 9297435. Deploy 39772238570 verde; oito arquivos servidos identicos ao clone. Site autenticado e previa de impressao conferidos. Servidores nao alterados nesta tarefa.
ramos: codex/retrabalho-filtros-20261022: codigo integrado a main, zero commits de codigo pendentes. Demais ramos conforme docs/RAMOS.md.
feito: Publicados filtros separados e combinados por responsavel e tecnico, resumo do recorte no PDF e limpeza preservando datas. Plano docs/planos/2026-10-22-retrabalho-filtros.md.
pela_metade: Nenhuma implementacao pendente. PDF conferido na previa nativa de impressao, com somente a linha filtrada e identificacao dos filtros; arquivo nao salvo em disco.
decisoes: Nenhuma nova regra de negocio; publicacao expressamente autorizada pelo dono nesta conversa.
perguntas_ao_dono: Nenhuma para esta entrega; demais perguntas anteriores preservadas em docs/DECISOES.md.
nao_fazer: Nao confundir responsavel da etapa com equipe da correcao. Taxa geral do periodo permanece explicitamente geral. Nao commitar evidencia com dados reais.
testes: Node 24 scripts/verificar.cjs: 2148 passaram, zero falhas ou pulados; diff --check e vez conferir aprovados. Producao: responsavel, tecnico, combinacao com e sem resultado, limpar e previa PDF aprovados.
dados: Nenhum dado real alterado. Nenhuma migration ou publicacao de servidor. Filtros somente na visualizacao.