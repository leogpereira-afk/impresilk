# Backup completo do PCP: registros, fotos e o ensaio da volta (11/10/2026)

Itens da auditoria do PCP v164: A2, M20, M21, M29 e a linha Baixa "O.S. excluída pode voltar numa restauração feita só pelo Hub". Fila: "Já combinado 3". Sem dado real neste documento: só contagens agregadas.

## O que estava errado

- O painel-backup lia o PCP pelo `list`, que entrega só O.S. vivas. Ficavam fora as lápides (O.S. excluídas), o diário de auditoria, os horários das fotos (`foto_evento`), a tabela `pcp_demandas` e, assim que existirem, o selo do mês, as regras e a comissão. A tela do Painel dizia "PCP ok".
- As fotos de evidência (bucket `pcp-arquivos`) e os anexos das Demandas (`pcp-demandas`) não tinham cópia nenhuma.
- Qualquer crachá com senha apagava do bucket a foto de uma O.S. já finalizada.

## O que mudou

### 1. Porta de exportação no pcp-sync (`exportarBackup`)

- Só de leitura e só da máquina: o `x-token` que o backup do Hub já usa (`PCP_TOKEN`). Crachá de pessoa (inclusive admin e pcp) e o crachá de toque recebem 403; sem credencial, 401.
- Entrega todas as linhas de `pcp_registros` (qualquer coleção, com `apagado` e `atualizado_em`), a tabela `pcp_demandas` (com `revision` e `mutation_id`), a tabela `pcp_meta` (menos a chave `mubisys`, ver a revisão abaixo) e a configuração inteira.
- As coleções saem do banco (varredura pelo índice), não de uma lista: coleção nova entra sozinha. As sete conhecidas aparecem na contagem mesmo vazias.
- Cursor estável `[fase, coleção, id]` da última linha entregue. Página de até 500 linhas e 4 MB. Cursor adulterado é 400.
- A primeira página traz `contagemInicio` (antes de ler) e a configuração; a última traz `contagemFim`. Como nada é apagado de `pcp_registros`, o exportado de cada coleção fica entre as duas.

### 2. Foto de O.S. finalizada só sai pela gestão, com motivo

- `deletePhoto` procura o id da foto em qualquer campo das O.S. finalizadas (check-in, retorno, item, volta do carro, conferência, layout e `fotosTiradas`).
- Citada por O.S. finalizada: só admin ou pcp apagam, com motivo de 5 a 500 caracteres. O pedido entra no diário da O.S. (`foto-apagada`, com o motivo) antes de o arquivo sair; sem diário, a foto fica (503 e a fila tenta de novo).
- Montagem, operação, máquina e crachá de toque recebem 403 com o motivo. A fila do aparelho tira o item e mostra a recusa (403 não prende a fila; 422 prenderia).
- Tela da gestão: o × pede o motivo para admin e pcp e recusa na hora os outros papéis, antes de tirar a foto da ficha. A troca do layout ou do embarque de O.S. finalizada não apaga mais o arquivo antigo.

### 3. Painel (repositório painel-impresilk, função painel-backup)

- O PCP passa a ser copiado pela porta nova. O arquivo do dia `pcp/AAAA-MM-DD.json` sai no formato `pcp-backup-5` (abaixo), com a contagem por coleção conferida.
- Contagem fora da faixa, coleção obrigatória faltando ou configuração ausente: `ok:false`, com a divergência escrita na tela de Backups.
- Os buckets `pcp-arquivos` e `pcp-demandas` vão para o mesmo destino do `painel-arquivos`: `arquivos/<bucket>/<sha256>` no repositório privado. Incremental: só o arquivo novo ou mudado (pela marca do Storage) é baixado. Teto de 25 arquivos, 8 MB e 90 s por rodada, porque o GitHub aceita 500 gravações por hora e o agendador roda a cada 5 minutos. O que sobra fica para a rodada seguinte; enquanto isso a tela mostra "copiando · X de Y arquivos", nunca "ok".

## Formato `pcp-backup-5`

| Chave | Conteúdo |
|---|---|
| `pcp_registros` | todas as linhas: `colecao`, `id`, `registro`, `apagado`, `atualizado_em` |
| `pcp_demandas` | `id`, `registro`, `revision`, `mutation_id`, `atualizado_em` |
| `pcp_meta` | `chave`, `valor`, `atualizado_em`; nunca a chave `mubisys` (credencial do ERP). Arquivo de antes da revisão não traz |
| `cfg`, `cfgVersao` | a configuração inteira e o carimbo dela |
| `contagem` | `inicio` e `fim` (o que o PCP contou) e `exportado` (o que está no arquivo) |
| `divergencias` | vazio quando a contagem confere |
| `arquivos` | por bucket: `caminho`, `tipo`, `bytes`, `sha256`; o arquivo mora em `arquivos/<bucket>/<sha256>` |
| `arquivosCompletos`, `arquivosPendentes` | se todos os arquivos já tinham cópia quando o arquivo do dia foi gravado |

## A volta (restauração num projeto novo)

`scripts/ensaio-backup-pcp.cjs` traz a função `restaurarPacote(pacote, alvo)`: confere o pacote (formato, linhas repetidas, contagem, caminhos), recusa alvo que não esteja vazio, confere o sha256 de TODOS os arquivos antes de gravar qualquer coisa, sobe os arquivos, grava as linhas como vieram (lápide volta lápide), as demandas com a revisão e a configuração. Nada é recalculado: o selo e a comissão voltam byte a byte, e é o servidor que confere o hash quando alguém exporta de novo.

- Ensaio fictício: `node scripts/ensaio-backup-pcp.cjs` (também roda na suíte, em `tests/ensaio-backup.test.cjs`).
- Arquivo real do Hub, depois de publicado: `node scripts/ensaio-backup-pcp.cjs --arquivo <pcp/AAAA-MM-DD.json> --copia <clone de backups-impresilk>`. Restaura numa caixa de areia em memória, confere o sha256 de cada foto no clone e imprime só contagens.

## Resultado do ensaio fictício (11/10/2026)

Servidor real (pcp-sync) com banco e Storage em memória, sem rede nem credencial. Exportado em 6 páginas de 3 linhas, para cruzar a fronteira das coleções: 3 O.S. (1 lápide), 2 do diário, 2 horários de foto, 1 fechamento, 1 regra, 2 revisões de comissão, 1 versão de O.S. da comissão, 1 demanda, 2 linhas do pcp_meta (a credencial fictícia do ERP ficou de fora) e 3 arquivos.

1. Exportação pela porta nova: todas as linhas, sem repetir, com a contagem conferida.
2. O pcp_meta vai na cópia (a cópia de desfazer do robô e o cache do ERP), e a credencial do ERP não.
3. Volta: as mesmas linhas, com o `apagado` e o `atualizado_em` de cada uma, as demandas e o pcp_meta.
4. Lápide continua lápide: fora da lista, na lista de excluídas, e o celular recebe "excluída" (422 definitivo).
5. Selo e comissão voltam: o servidor recalcula, o hash do selo confere e o CSV exportado é idêntico (mesmo sha256): o guardado na aprovação, com a impressão digital dele.
6. Mês fechado continua fechado: regra nova com data dentro dele é recusada (409).
7. Fotos voltam pelo sha256 e o `getPhoto` devolve os mesmos bytes.
8. Arquivo corrompido no destino: a volta recusa antes de gravar qualquer coisa.
9. Pacote sem a lápide: a contagem recusa.
10. Volta por cima de um PCP com dados: recusada.
11. A volta do jeito antigo (só o `list` do Hub) perdia a lápide e reabria o mês: confirmado, é o caso ruim que motivou a mudança.

## Publicação (nesta ordem)

1. **pcp-sync** (repositório do PCP). Sem migration e sem mudança em `_shared`, então o pcp-mubisys não precisa subir junto. A porta nova precisa estar no ar antes do Hub chamá-la.
2. **Tela do PCP** (`app.js`, `store.js` e `equipe.js`) com a subida de versão de sempre (os `?v=` de index.html, equipe.html e sw.js; a revisão não subiu). Pode ir junto com o pcp-sync; se a tela subir antes, o motivo segue no pedido e o servidor antigo só ignora. Sem a subida, o aparelho fica com o app.js antigo (o service worker é cache-first) e a gestão não acha o × da O.S. finalizada.
3. **painel-backup e a tela de Backups** (repositório painel-impresilk). Se subir antes do pcp-sync, a cópia do PCP falha com "Ação desconhecida" (ok:false), sem apagar nada.
4. Depois da primeira rodada completa: rodar o ensaio com o arquivo real (`--arquivo` e `--copia`).

## Revisão da onda (11/10/2026)

Duas revisões adversariais da onda acharam o que segue; cada item tem teste em `tests/revisao-onda-w1-backup.test.cjs` que começa pelo caso ruim (15 dos 16 falhavam antes; o que passa guarda a O.S. aberta, que não muda).

- **R1/S1, a trava da foto se contornava em dois pedidos.** A trava olhava só o estado atual da O.S.: operação ou montagem com senha regravava a O.S. finalizada com a lista de fotos vazia, ou tocava em "Reabrir" (o botão não confere papel), e depois o `deletePhoto` passava, sem motivo e sem diário. Agora:
  - o servidor carimba `fotosProva` (só acréscimo, só dele; o valor do aparelho é ignorado) com as fotos que a O.S. citava enquanto estava finalizada. A O.S. finalizada antes desta versão ganha o carimbo na primeira gravação, antes de qualquer mudança passar;
  - quem não é admin nem pcp não tira a foto carimbada da O.S.: ela volta para a lista (check-in, retorno, item, volta do carro, conferência), com aviso, e sai de `fotosTiradas`. Nada de 422;
  - `deletePhoto` protege a foto carimbada e a foto citada por O.S. finalizada ou já reaberta (`reabertaEm`, carimbado pelo servidor; cobre as reabertas antes do carimbo). Reabrir continua valendo para quem já podia;
  - tela da gestão: na O.S. finalizada o × é de admin e pcp e fica fora da trava da ficha (antes era `.edit-only`, escondido para todos), e pede o motivo; a O.S. reaberta e a foto carimbada também pedem. O espelho do celular não tira a foto da O.S. reaberta.
- **R3, o motivo se perdia na fila.** O pedido com motivo troca, no mesmo lugar, o pedido sem motivo da mesma foto; feito durante o envio do sem motivo, ele fica na fila e vai depois da recusa.
- **S2, o motivo não aparecia no histórico.** A entrada `foto-apagada` grava os campos `foto` e `motivo` (antes e depois), que a tela mostra mesmo na versão de antes; a tela nova diz "Apagou a foto (prova da entrega), com motivo".
- **R2/S5, M21: o CSV aprovado.** A aprovação de período efetivo guarda no próprio registro (`performance_comissao`, só inserção) o CSV e o `csvSha256` dele. A exportação devolve esse CSV, conferido pela impressão digital (que também vai no aviso), e recusa (409) o guardado que não confere. Aprovação de antes desta versão exporta como antes. O teste de outubro não exporta, então não guarda.
- **R4, `pcp_meta` na cópia.** A porta ganhou a fase `m` (depois das demandas, mesmo cursor e mesma contagem): a cópia de desfazer do robô do ERP (`carteira-auditoria:*`, 33 linhas hoje), o cache mensal (`entregues:*`, 82), o status da importação e a auditoria das entregas. A chave `mubisys`, onde o pcp-mubisys guarda a credencial do ERP, fica sempre de fora (hoje ela não existe; a credencial está no ambiente). O ensaio volta o `pcp_meta` e confere que a credencial não está no pacote.
- **S3 (Painel), divergência regravava o arquivo a cada 5 minutos.** Com a mesma divergência já gravada hoje, o painel-backup tenta de novo só depois de 1 hora (o `forcar` passa na hora). Ver o commit do painel-impresilk.
- **S4, a versão da tela.** Não subida de propósito: sobe na publicação (passo 2 acima).

## O que ficou de fora

- M22 (backup do Supabase, PITR e o ensaio de "Restore to a new project"): decisão do dono (fila, pergunta 13). Criar projeto novo no Supabase tem custo e não cabe a esta onda.
- O ensaio com o arquivo real do Hub (M20 e M21) depende da publicação: passo 4 acima.
- A primeira cópia das 780 fotos leva cerca de 32 rodadas do agendador (perto de 3 horas) por causa do limite do GitHub.
- A cópia por sha256 confia no estado guardado para pular arquivo sem mudança; não há conferência periódica de que o arquivo continua no repositório.
