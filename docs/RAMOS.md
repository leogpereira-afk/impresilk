# Ramos: o que juntar e o que NÃO juntar (só se acrescenta)

Quem pega a vez lê isto antes de juntar qualquer ramo. Se a memória de um
agente disser "retomar a junção F19 a F22" (ou outra coisa), vale o que está
aqui. Apagar ramo, tag ou worktree só com o aval do dono (P-022 em
docs/DECISOES.md). Contagens contra a main 8aecc12 (v164; em 11/10 a main passou a 8e959a0, um commit a mais, o A1), medidas em
11/10/2026 com `git rev-list --left-right --count 8aecc12...<ramo>`.

## Superados: NÃO JUNTAR

Achado da auditoria de 11/10/2026 (docs/planos/2026-10-11-auditoria-v164.md):
foram feitos sobre a v145 com a regra antiga de comissão e de perdas; juntar
custa dezenas de trechos de conflito, quebra as Demandas (M31) e traz de volta
regra superada pela D-001 e pela D-004.

| ramo | commit | à frente / atrás | destino |
|---|---|---|---|
| f19 | 5bc6f51 | 6 / 50 | superado pela v164 (contido no f21); tag local arquivo/f19-2026-10-01 |
| f20 | d7bf94f | 9 / 50 | superado pela v164; tag local arquivo/f20-2026-10-01 |
| f20t | 1238225 | 7 / 50 | superado pela v164; tag local arquivo/f20t-2026-10-01 |
| f21, f22s, f22t | f8c8b9e | 17 / 39 | superados pela v164; tags locais arquivo/f21-, f22s- e f22t-2026-10-01 |
| poda-valores-operacao | 3e10bff | 2 / 89 | superado pela v164 (o corte de R$ já está na main); arquivar com tag do mesmo jeito |

As tags arquivo/* existem só no Mac do dono (sem push). Os worktrees
impresilk-f22s (4 arquivos) e impresilk-f22t (1 arquivo) têm trabalho sem
commit que a tag não guarda.

Do que está neles, aproveitar SÓ refazendo à mão sobre a main, com teste:
- a correção do histórico da divisão (anulaUltimaDoLog, só no worktree
  impresilk-f22s, sem commit): ver "Pequenos" no plano da auditoria;
- a ideia do "ajuste contra o selo" (f20), adaptada à comissão nova, para M4 e M7;
- os testes do poda-valores-operacao para os dois casos da M19 (repor o item
  com valor em vez de 422; não descartar calado o valor de item novo);
- depois das decisões do dono: o registro simples de prêmio e o PDF do
  fechamento com id e impressão digital.

Descartar: o motor de pontuação v2 (regra antiga), o segundo CSV de comissão,
os prêmios automáticos e os "premiados" no selo, a aba Prêmios, o perfRepintar
do f22t, o semEquipe.valorBruto e o range() do f22s.

## Sem nada próprio (0 à frente): apagar com o aval do dono

| ramo | commit | atrás | observação |
|---|---|---|---|
| origin/codex/entregas-parciais-equipes | 6e9570f | 36 | na origem; perigoso em pcp_ref (M23) |
| origin/claude/admiring-noether-ly12p1 | 62d996c | 100 | na origem; perigoso em pcp_ref (M23) |
| origin/producao-lateral | 0bdbb5d | 188 | na origem; perigoso em pcp_ref (M23) |
| corte-da-chave-perdeu-o-endereco | 088a478 | 153 | só local |
| erro-sem-a-chave | 68169e1 | 154 | só local |

## Para juntar (com o "pode publicar" do dono)

| ramo | commit | à frente / atrás | o que é |
|---|---|---|---|
| a1-comissao | 8e959a0 | 1 / 0 | A1: aprovar e exportar a comissão com a régua do selo (só servidor). JÁ NA MAIN desde 11/10/2026 (pcp-sync v131) |
| protocolo | sobre a1-comissao | à frente da main 8e959a0, 0 atrás | AGENTS.md, VEZ.md, DECISOES.md, RAMOS.md, vez.cjs, subir-versao.cjs, testes e passos de CI |

## Aproveitado à mão (só se acrescenta)

- 12/10/2026, onda acabamento (claude): a correção do histórico da divisão
  (anulaUltimaDoLog), que só existia sem commit no worktree impresilk-f22s,
  foi refeita à mão sobre a main, com teste, no commit 87dfedf
  (tests/onda-acabamento-item33.test.cjs). O worktree e o ramo f22s não foram
  mexidos nem juntados.
- 12/10/2026, onda acabamento (claude): os casos da M19 dos testes do
  poda-valores-operacao (repor o item com valor em vez de 422; não descartar
  calado o valor de item novo) foram refeitos em
  tests/onda-acabamento-m19.test.cjs, commit f7d43ba. O ramo não foi juntado.
