# De quem é a vez neste repositório

Só o agente desta linha, na sessão desta linha, faz commit ou push aqui, em
qualquer ramo. Vale o que está na origin/main (`git show origin/main:VEZ.md`),
não a cópia do disco. Este arquivo só muda pelo `node scripts/vez.cjs` (pegar,
passar, liberar, aceitar), que monta o commit em cima da origin/main; nunca à
mão num ramo de trabalho. Regra completa no AGENTS.md (igual ao CLAUDE.md),
seções 0, 5 e 6.

agente: ninguem
desde: 2026-10-12T21:20:39.447Z
ramo: onda-auditoria
tarefa: correções da auditoria de 12/10 (Dre/auditoria-pcp-v174-2026-10-12.md)
sessao: -
versao_reservada: -
arquivos_em_uso: -
passou_por: claude
passou_em: 2026-10-13T00:15:38.615Z

## Passagem (o que o último agente deixou para o próximo)

Preencha TODOS os campos (no VEZ.md do disco) antes de
`node scripts/vez.cjs passar`. Uma linha cada; detalhe vai em docs/ e o campo
aponta para lá. "nenhum" é resposta válida; vazio ou "-" não é. Com a vez de
alguém, os campos podem estar em "-" enquanto ele trabalha; com a vez livre
(ninguem), têm de estar todos cheios. "sessao: -" quer dizer que nenhuma
sessão se registrou ainda: o primeiro `pegar` do mesmo agente a adota.

no_ar: v175 (main af912bb, Deploy verde); pcp-sync v153 e pcp-mubisys v132 publicados do ramo onda-auditoria em 12/10/2026
ramos: onda-auditoria já junto na main; nenhum ramo aberto
feito: correções da auditoria v174 (Dre/auditoria-pcp-v174-2026-10-12.md): U1 a U5, S1, S2, D1, D3, C1 a C3, P1 (idPessoaAnteriores e idPessoaBloqueado do RH), D-017 titular e substituto aprovam, leitura do RH paginada; notas em docs/DECISOES.md
pela_metade: D2 da auditoria (pagar só a O.S. a definir por compensação) não começou; PDF da vista Cards de Entregas recusado no Chrome sem janela (já falhava antes)
decisoes: D-017 (titular e substituto aprovam enquanto o substituto vale); conferenciaSoGestao é só de saída; testes de tempo viraram contagem de operações
perguntas_ao_dono: as abertas da fila de 11/10 (prêmio de outubro antes de 31/10, perguntas 3, 4, 5, 15 e 18)
nao_fazer: não juntar f19, f20, f20t, f21, f22s, f22t nem poda-valores-operacao; não gravar IDs por script em produção
testes: verificar.cjs 2068 de 2068 duas vezes; duas revisões e uma verificação; às vezes um arquivo inteiro cai sem afirmação falhar com a máquina carregada (rodar de novo)
dados: nenhuma escrita em produção pelo PCP nesta onda; o ID anterior da ficha da Direção foi registrado pela tela do RH