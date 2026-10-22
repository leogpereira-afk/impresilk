# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T14:35:05.225Z
ramo: codex/kaizen-pcp-extremos-20261022
tarefa: Publicar rodada Kaizen autorizada e conferir producao
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T14:42:20.444Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v192, main f50eda0; Deploy 39797381197 verde; sete arquivos servidos identicos aos locais. Servidor pcp-sync e pcp-mubisys nao alterado nem revalidado nesta publicacao.
ramos: codex/kaizen-pcp-extremos-20261022 publicado, 0 a frente e 0 atras da main antes desta passagem.
feito: Publicada v192: corridas da fila corrigidas, busca de retrabalho otimizada, testes Kaizen e relatorio docs/kaizen-pcp-2026-10-22.md. Autorizacao do dono: Subir.
pela_metade: Conferencia interna autenticada indisponivel: aba oficial abriu no login; ensaio fisico multiaparelho permanece na fila do relatorio.
decisoes: Nenhuma regra financeira ou de permissao alterada; limite de entregas preservado.
perguntas_ao_dono: Nenhuma para esta publicacao; revisao autenticada depende de sessao aberta.
nao_fazer: Nao tratar os testes simulados como prova de rede fisica nem alterar registros reais para conferir a publicacao.
testes: 2170 testes passaram novamente na v192; CI verde; config.js app.js store.js sw.js index.html equipe.html ranking.html conferidos por igualdade de bytes. Site abre no login.
dados: Nenhum banco ou registro operacional alterado; sem migrations ou mudanca de servidor.