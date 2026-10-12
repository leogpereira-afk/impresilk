# O ID da pessoa gravado no RH (lado do RH, para o dono decidir)

Plano de 12/10/2026, onda pessoas do PCP, item 5 da fila de 11/10/2026.
Regra: D-015 em docs/DECISOES.md ("o ID da pessoa nasce com a ficha e não muda
quando o CPF é corrigido"). Este repositório (PCP) já lê o campo; o que está
aqui é o que falta no repositório do RH (impresilkrh), que tem outro dono de
vez. Nada aqui foi feito no RH.

## O campo

- Nome: `idPessoa`, texto com exatamente 6 dígitos (ex. fictício: "123456").
- Onde: no `registro` da ficha (coleção `colaboradores`) e do contrato de
  freelancer (coleção `freelancers`), na tabela `registros`.
- O PCP (pcp-sync, `idDoCadastroRH` em _shared/pcp-integridade.mjs) usa o
  campo quando ele tem 6 dígitos; sem ele, os 6 primeiros dígitos do CPF, como
  hoje. Gravado e CPF que discordam: vale o gravado, e a gestão do PCP vê o
  aviso. Campo fora do formato não vale (fica o do CPF, com aviso).

## Como está a base (SELECT de 12/10/2026, só contagens)

- 57 fichas vivas (41 apagadas) e 2 contratos de freelancer vivos.
- Nenhuma ficha e nenhum contrato tem `idPessoa` (0 de 57 e 0 de 2). Até o RH
  gravar, o PCP se comporta exatamente como na v169.
- Todas as 57 fichas e os 2 contratos têm CPF de 11 dígitos; nenhum grupo de
  6 primeiros dígitos é dividido por CPFs diferentes.
- Os 17 IDs de 6 dígitos gravados nas equipes das O.S. do PCP batem todos com
  o CPF de hoje de alguma ficha ou contrato (nenhum CPF que já mudou de
  começo depois de entrar numa O.S.).
- As 14 contas de `acesso_conta` com `id_pessoa` e ficha batem com o CPF de
  hoje (0 divergentes).
- O diário do RH (coleção `alteracoes`) tem 4 edições de CPF (2 em fichas, 2
  em contratos), mas guarda os valores mascarados: não dá para saber pelo
  diário se o começo do CPF mudou. A conferência acima (O.S. e contas) diz que
  hoje não há pessoa com ID trocado.

## O que o RH precisa fazer

1. Ao CRIAR a ficha e o contrato, o servidor do RH (sync, não só a tela)
   grava `idPessoa` = 6 primeiros dígitos do CPF. Se o CPF é o mesmo de outro
   cadastro (o ex-colaborador que volta como freelancer), herda o `idPessoa`
   desse cadastro, não recalcula. Se os 6 dígitos já são de OUTRA pessoa (CPF
   diferente), não grava o ID e avisa: o RH escolhe. O PCP confere do lado
   dele (revisão da onda pessoas, 12/10/2026): o ID que aparece em dois
   cadastros de pessoas diferentes (duas fichas, ficha e contrato, ou dois
   contratos, com CPFs diferentes ou sem CPF que prove ser a mesma pessoa,
   inclusive o contrato com ID gravado e CPF inválido) é REPETIDO: nenhum dos
   cadastros fica com ele. O nome, o crachá, a porta de aprovar a comissão e
   a designação de titular ou substituto não chegam a esse ID, a prévia da
   comissão não paga o ID (pendência), e a gestão vê o aviso "o ID está em
   duas fichas" (sem CPF). A pessoa fica sem ID no PCP até o RH corrigir. Até
   12/10/2026 a v169 só percebia o repetido entre ficha e contrato: a ficha B
   que gravasse o ID da A passava a receber as O.S., o crachá e a aprovação
   da A.
2. NUNCA mudar o `idPessoa` no conserto do CPF. A gravação que troca o CPF
   mantém o campo; o servidor do RH preserva o valor gravado quando o envio
   vem sem ele (campo ausente nunca apaga) e recusa, com aviso, a troca vinda
   de tela comum. Trocar o ID de verdade (erro de cadastro na criação) é só do
   admin do RH, com motivo e registro no diário, e o PCP mostra a divergência
   até lá. Lembrete: o ID trocado tira a pessoa das O.S., equipes e divisões
   gravadas com o ID antigo.
3. Preencher as fichas e contratos antigos PELA TELA (escrita em produção só
   pela tela, pelo dono): um botão de admin no RH, "Gravar o ID nas fichas
   antigas", que lista cada cadastro sem o campo com o ID que vai gravar (o do
   CPF de hoje), marca os casos que pedem decisão (ID já usado por outra
   pessoa, cadastro sem CPF) e grava só com a confirmação. Pela conferência
   acima, hoje são 57 fichas e 2 contratos, sem caso que peça decisão. Incluir
   as fichas desligadas: o ID delas dá nome ao histórico.
4. A conta de acesso (`acesso_conta.id_pessoa`) passa a copiar o
   `idPessoa` da ficha (ou do contrato), em vez de recalcular pelo CPF. O PCP
   já lê essa ligação primeiro para saber quem é a conta da gestão (antes do
   apelido igual ao login): conta de pessoa ativa com `id_pessoa` que não leva
   a uma ficha na ativa, só dela, fica sem ID.
5. A tela do RH mostra o ID gravado ao lado do nome (como já mostra o
   calculado) e, quando o CPF não começa por ele, a mesma marca do PCP.
6. Testes no RH pelo caso ruim: CPF corrigido não muda o `idPessoa`; envio
   sem o campo não o apaga; contrato novo do mesmo CPF herda o ID; ID de outra
   pessoa não é gravado.

## Ordem de publicar

1. PCP (pcp-sync e pcp-mubisys juntos, porque _shared mudou), depois a tela
   do PCP. Com 0 cadastros com o campo, nada muda no ar.
2. RH: servidor (sync) e tela, com os itens 1, 2, 4 e 5.
3. O dono preenche as fichas antigas pelo botão do item 3.

## Pergunta 12 da fila (freelancer novo)

Quem cadastra o contrato de freelancer (o Thiago, papel pcp, ou só o admin do
RH) continua aberto. Qualquer que seja a resposta, o `idPessoa` nasce no
servidor do RH ao criar o contrato (item 1), então não depende de quem clica.
