# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T13:53:26.672Z
ramo: codex/retrabalho-limpar-filtros-20261022
tarefa: Kaizen PCP: auditoria de extremos, conflitos e melhorias locais verificadas
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T14:10:20.272Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v191, main 8d7dd4c somente coordenacao sobre edf3a87; ultimo Deploy verde conferido por gh. pcp-sync e pcp-mubisys nao alterados nem revalidados nesta rodada.
ramos: codex/kaizen-pcp-extremos-20261022, commit local 9aab158, 1 a frente e 0 atras da main antes desta passagem; dono decide publicar. Clone /tmp/pcp-retrabalho-20261021.
feito: Duas corridas de sincronizacao corrigidas e busca de retrabalho otimizada; rotina test:kaizen e relatorio docs/kaizen-pcp-2026-10-22.md no ramo local.
pela_metade: Nenhuma correcao iniciada ficou incompleta. Publicacao e ensaio fisico multiaparelho pendentes; roteiro no relatorio local.
decisoes: Nenhuma regra de negocio alterada; limite de 100 entregas por O.S. preservado.
perguntas_ao_dono: Autorizar publicacao desta rodada local 9aab158; nao houve pedido para subir esta rodada.
nao_fazer: Nao publicar o ramo sem autorizacao; obter a vez, rebase na main e reservar/subir versao antes. Nao tratar simulacao como prova de rede real; nenhum dado real em arquivo publico.
testes: 2170 testes completos passaram; 324 na rodada direcionada; regressao antes/depois confirmada para fila e carga; filtro e limpar todos conferidos na previa ficticia.
dados: Nenhum banco, servidor ou registro operacional produtivo alterado. Somente dados ficticios em simulacoes.