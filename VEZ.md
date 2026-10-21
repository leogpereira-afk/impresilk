# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-21T18:16:34.790Z
ramo: codex/rotas-usabilidade-20261021
tarefa: Publicar melhoria de Rotas aprovada pelo dono e conferir producao
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: codex
passou_em: 2026-10-21T18:22:09.382Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: tela v180 na main ecdaa82; Deploy verde https://github.com/leogpereira-afk/impresilk/actions/runs/39651611188; dez arquivos servidos comparados byte a byte com o commit. pcp-sync e pcp-mubisys nao alterados nem revalidados nesta tarefa.
ramos: codex/rotas-usabilidade-20261021 local em /tmp/pcp-rotas-usabilidade-20261021 integrado na main, zero a frente e zero atras antes desta devolucao; manter o clone e preservar os demais ramos.
feito: publicada a melhoria de Rotas aprovada pelo dono: busca, filtros, inclusao em lote, remocao direta e layout compacto. Registro em docs/planos/2026-10-21-rotas-usabilidade.md.
pela_metade: nenhuma parte pendente desta publicacao. Limites anteriores: sem provedor real de mapas e sem persistencia de rotas; rascunhos apenas na sessao.
decisoes: dono autorizou no chat: aprovado, pode subir essa melhoria das rotas. Nenhuma regra de negocio alterada; sem nova D-NNN.
perguntas_ao_dono: nenhuma para esta entrega. Integracao de mapas permanece fora do escopo, sem contratacao nesta tarefa.
nao_fazer: nao apresentar a previa demonstrativa como calculo real; nao confundir acompanhamento local com entrega fisica; nao incluir dados reais em testes ou documentos; evitar hashes abreviados com sequencia numerica confundida pela guarda M27.
testes: node scripts/verificar.cjs: 2139 testes passaram, zero falhas, cancelados ou pulados; sintaxe, versoes e vez conferidas. Deploy verde e dez arquivos publicos identicos; fixture demonstrativa retorna 404. Navegador oficial abriu login; controles validados antes na previa ficticia desktop e mobile.
dados: nenhum dado real consultado ou alterado; nenhuma migration ou servidor publicado. Publicada somente a interface aprovada; fixture demonstrativa fora do site.