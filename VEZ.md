# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T18:52:54.752Z
ramo: codex/rotas-usabilidade-20261021
tarefa: Organizar topo e filtros da carteira PCP em previa local
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T19:04:39.684Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: tela v180, codigo oficial ecdaa82; ultimo Deploy documental verde https://github.com/leogpereira-afk/impresilk/actions/runs/39656785648. pcp-sync e pcp-mubisys nao alterados nem revalidados nesta tarefa.
ramos: codex/pcp-carteira-organizacao-20261021 local em /tmp/pcp-rotas-usabilidade-20261021, um commit a frente e nenhum atras da main antes desta devolucao. Interface somente local; preservar demais ramos.
feito: carteira com vistas, busca, tipo e etapa separados; indicadores compactos; texto longo quebra nos cards; contraste dos cabecalhos corrigido; foco dos filtros preservado. Registro em docs/planos/2026-10-21-pcp-carteira-organizacao.md no ramo local.
pela_metade: previa pronta na porta 5383, aba PCP; nova alteracao ainda nao publicada. Provedor real de mapas e persistencia de Rotas continuam fora deste escopo.
decisoes: nenhuma regra de negocio alterada. Dono pediu reorganizacao da carteira e correcao dos controles que perderam legibilidade.
perguntas_ao_dono: revisar a previa e autorizar a publicacao desta nova alteracao de interface.
nao_fazer: nao publicar este ramo sem autorizacao para esta tarefa; nao reduzir contraste do estado ativo nem apagar campos para compactar; nao incluir dados reais em testes ou documentos.
testes: node scripts/verificar.cjs: 2139 testes passaram, zero falhas, cancelados ou pulados. Navegador: busca, tipo, etapa, limpeza, ordenacao, foco e teclado; larguras 390, 1024 e 1440 px sem transbordamento. Contraste dos controles nos cabecalhos conferido, incluindo Plantões e Programacao.
dados: nenhum dado real consultado ou alterado; nenhuma migration ou servidor publicado. Previa e imagens apenas com dados ficticios.