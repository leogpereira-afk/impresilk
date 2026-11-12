# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-11-11T23:29:21.850Z
ramo: codex/total-entregue-periodo
tarefa: Publicar total do periodo e painel por produto autorizados pelo dono
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-11-12T00:01:57.486Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: main 3f7775f (codigo e5b7e5e), tela v199; pcp-sync v172 e pcp-mubisys v150 ACTIVE pelo workflow 43122210094. Arquivos do servidor e do site conferidos, total e produtos validados na tela de producao.
ramos: codex/total-entregue-periodo integrado na main, 0 a frente e 0 atras antes desta devolucao; preservar ate decisao do dono sobre exclusao. Ramos antigos continuam conforme docs/RAMOS.md.
feito: Publicados total entregue do periodo e painel por produto com modelos reunidos; corrigida a latencia da consulta anual. Registro em docs/entrega-produtos-periodo-2026-11-11.md.
pela_metade: nenhum trabalho desta frente; publicacao autorizada e comportamento conferido em producao.
decisoes: D-022 aplicada e publicada: agrupar so pelo produto, juntando os modelos. Autorizacao de publicar registrada no documento da entrega.
perguntas_ao_dono: nenhuma nova nesta frente; perguntas anteriores permanecem em docs/DECISOES.md.
nao_fazer: Nao agrupar por modelo ou categoria, nem multiplicar quantidade de novo. Nao tratar itens ausentes ou lacunas como zero. Preservar limite de concorrencia e aguardar todas as leituras antes de descartar fonte parcial.
testes: node scripts/verificar.cjs: 2222 passaram, 0 falhas e 0 pulados. Conferencia da vez passou; soma em centavos da tabela de produtos igual ao total na tela de producao. Previa desktop e celular 390 px conferida.
dados: Nenhuma migration nem gravacao de dados reais; consultas somente leitura. Captura de producao guardada fora do repositorio publico.