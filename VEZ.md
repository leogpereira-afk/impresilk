# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-22T19:53:20.259Z
ramo: codex/entregas-mapa-20261022
tarefa: Completar mapa e roteiro impresso das entregas com nome e equipe
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-22T20:00:26.573Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v192, ultima publicacao funcional f50eda0. Esta tarefa nao publica codigo nem servidor.
ramos: codex/entregas-mapa-20261022, commit c842ea4 local; aguarda revisao e autorizacao de publicacao.
feito: Roteiro imprimivel independente de calculo, equipe e integrantes, nome, persistencia local e links de percurso Google por partes. Plano em docs/planos/2026-10-22-roteiro-entregas-mapa.md.
pela_metade: Mapa incorporado e instrucoes viarias internas dependem de provedor; dono confirmou que nao tem API. Persistencia entre aparelhos nao implementada.
decisoes: Nenhuma regra financeira ou operacional alterada.
perguntas_ao_dono: Aprovar previa e publicacao; para mapa interno, definir provedor e configuracao segura.
nao_fazer: Nao tratar links externos como mapa incorporado nem publicar dados reais. Nao usar servidor demonstrativo de mapas como producao.
testes: Verificador completo: 2177 passam; rotas: 39 passam. Previa mobile, nome no PDF, equipe e recarga conferidos. Sem impressao fisica.
dados: Nenhum registro real ou banco alterado; testes apenas ficticios.