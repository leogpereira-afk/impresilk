# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T20:28:52.586Z
ramo: codex/entregas-mapa-20261022
tarefa: Publicar e conferir mapas e roteiro de entregas
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T20:56:07.352Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: 9ad40e6 v195; pcp-sync v164 e pcp-mubisys v142. Actions 39852316789 e 39849835579 verdes; tela autenticada no Chrome conferida.
ramos: codex/entregas-mapa-20261022 igual a main; codex/entregas-mapa-v193 preservado como referencia do deploy do servidor, superado na interface pela v195.
feito: v193 mapas Geoapify, equipe e roteiro; v194 salvamento sem PNG quando excede cota; v195 veiculo por ID. Registro em docs/planos/2026-10-22-roteiro-entregas-mapa.md.
pela_metade: Nenhuma alteracao de codigo pendente. Rota operacional em rascunho aguarda equipe, veiculo, perfil viario e motorista; otimizacao automatica e sincronizacao entre aparelhos nao implementadas.
decisoes: D-019: somente veiculos do cadastro por ID, sem vinculo por nome.
perguntas_ao_dono: Definir equipe, veiculo e motorista da saida; conferir perfil viario pois elenco nao fornece peso e altura.
nao_fazer: Nao inferir identidade por nome, nem confirmar ou iniciar a rota de teste. Mapa pesado usa fallback sem imagem no armazenamento; recalcular recupera imagem.
testes: node scripts/verificar.cjs: 2190 passaram, zero falhas. Chrome producao: geocodificacao, percurso com retorno, persistencia apos reload, veiculos por ID, equipe, preview PDF nativo de 3 paginas e viewport 375 sem overflow.
dados: Sem migrations ou escrita em O.S./fichas. Rascunho local com origem e pontos conferidos; selecoes temporarias de equipe e veiculo removidas. Nenhum dado real no repositorio.