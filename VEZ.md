# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-19T09:52:35.045Z
ramo: d2-compensacao
tarefa: D2 da auditoria: pagar só a O.S. a definir por compensação; ensaio do backup
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: claude
passou_em: 2026-10-19T11:51:00.797Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v178 (main 0e0d498, Deploy verde); pcp-sync v161 e pcp-mubisys v139 publicados do ramo d2-compensacao em 19/10/2026
ramos: d2-compensacao já junto na main; nenhum ramo aberto
feito: D2 da auditoria de 12/10: pagar só a O.S. a definir por compensação da pendência (comissaoPendencia*, coleção performance_comissao_pendencias, CSV próprio, Perdas, ranking, ficha e PDF leem a compensação); backup antigo sem coleção nova conta como vazia; ensaio do backup feito com o arquivo real do Hub de 19/10 (contagens iguais à produção, 822 de 822 fotos)
pela_metade: nenhuma no D2; a compensação exige o mês exportado, então outubro (mês de teste) não compensa
decisoes: nota da D2 em docs/DECISOES.md (escolhas da sessão principal avisadas ao dono): compensação só sobre aprovação ativa já exportada; antes único pelas compensações exportadas sobre a aprovação comparada e as posteriores
perguntas_ao_dono: as abertas da fila de 11/10 (prêmio de outubro antes de 31/10, perguntas 3, 4, 5, 15, 18 e outras da seção 4)
nao_fazer: não juntar f19, f20, f20t, f21, f22s, f22t nem poda-valores-operacao; não gravar IDs por script em produção; não editar Educação sem combinar
testes: verificar.cjs 2107 de 2107 duas vezes; duas revisões e duas verificações; a soma do que sai em todos os CSV por O.S. bate com o devido em 4 combinações
dados: nenhuma escrita em produção; só SELECT de contagens