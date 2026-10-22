# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T11:51:33.329Z
ramo: codex/retrabalho-filtros-20261022
tarefa: Filtro pendentes e resolvidos em Retrabalho e PDF, publicar e conferir
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T11:58:29.849Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v187, codigo 0be8648, Deploy 39774107383 verde; oito arquivos publicos identicos ao clone. Site autenticado e previa PDF conferidos. Servidores nao alterados.
ramos: codex/retrabalho-situacao-20261022 integrado a main, zero commits de codigo pendentes. Demais ramos conforme docs/RAMOS.md.
feito: Filtro Todos/Pendentes/Resolvidos combinado com pessoas e periodo; situacao no resumo do PDF. Plano docs/planos/2026-10-22-retrabalho-situacao.md.
pela_metade: Nenhuma implementacao pendente. No site, recorte carregado sem resolvidos; caso resolvido positivo coberto por testes ficticios. Previa PDF conferida, sem salvar arquivo.
decisoes: Nenhuma nova regra de negocio; usa criterio existente de resolucao e publicacao expressamente autorizada nesta conversa.
perguntas_ao_dono: Nenhuma para esta entrega; demais perguntas preservadas em docs/DECISOES.md.
nao_fazer: Nao marcar dados produtivos como resolvidos para testar; nao confundir baixa ERP com finalizacao da correcao. Taxa geral permanece geral.
testes: Node 24 scripts/verificar.cjs: 2151 passaram, zero falhas ou pulados. diff --check e vez conferir aprovados. Site: pendentes, resolvidos vazio, tres filtros combinados, limpar preservando situacao e previa PDF com mesma linha.
dados: Nenhum dado real alterado; nenhuma migration ou publicacao de servidor.