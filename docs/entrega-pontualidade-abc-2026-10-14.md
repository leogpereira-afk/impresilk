# Pontualidade com a curva ABC

Registro da revisão e da preparação da v176. Publicação autorizada pelo dono com "subir" em 14/10/2026. O resultado final da publicação e da conferência da tela fica na Passagem do VEZ.md (e em docs/passagens quando arquivada).

## Comportamento

- Chips compactos Todos, A+, A, B+, B e C no quadro Pontualidade das entregas.
- Somente A+ oferece seletor individual de cliente ou grupo, conforme a D-018.
- Filtro aplicado às réguas do ERP e do PCP, ao gráfico, à tabela mensal e à conferência por O.S.
- A prévia de PDF identifica classe e cliente selecionados.
- Classe da curva anual atual de Campanhas, preservando os grupos existentes. Não representa uma fotografia da classificação na data de entrega.
- Sem vínculo ou sem classificação permanece em Todos. Não é transformado em C. Indisponibilidade da fonte fica explícita.
- Sem alteração de valores, cálculos financeiros, regras de comissão, fechamentos ou registros.

## Fonte e segurança

A RPC original painel_clientes_abc tem lista limitada aos primeiros 200 clientes. A nova RPC pcp_pontualidade_abc amplia a classificação pelos limites de quantidade devolvidos pela fonte oficial e confere quantidade, total e lista original. Não modifica nenhuma função do Painel. Retorna só classes das O.S. e nomes/chaves necessários ao seletor A+, sem valores da curva comercial.

Vínculos usam número da O.S. e chave canônica importada do ERP. Número ambíguo não é vinculado pelo nome. A RPC nova só pode ser executada pelo servidor, e relatorioEntregas continua restrito à gestão do PCP.

Painel consultado em leitura com autorização expressa do dono. Nenhum arquivo ou registro desse sistema foi alterado.

## Verificação

- `npm run verificar` com Node 24: 2.080 testes passaram, sem falhas ou pulados, incluindo 12 novos cenários de ABC.
- `scripts/testar-pontualidade-abc-sql.cjs`: oito verificações em PostgreSQL local com PGlite e dados fictícios. Inclui 700 clientes, mais de 200 A+, todos os cortes, grupos, empate por chave, ano vazio, total zero, vínculo ambíguo, permissões e falha por divergência da fonte.
- `scripts/testar-pontualidade-abc-ui.cjs`: chips, filtro individual A+, gráfico, conferência por O.S., mês clicável, ano, teclado/foco, prévia de PDF, retorno a Todos e largura de 390 px. Sem erros de JavaScript.
- Revisão visual em computador e celular com dados fictícios.
- Produção: apenas SELECT de compatibilidade da consulta com a curva oficial. Compatibilidade confirmada, sem gravar dados. A nova RPC e o fluxo integrado ainda não estão instalados em produção.
- Execução inicial restrita da suíte bloqueou dois testes que abrem servidor local (EPERM). Nova execução com essa permissão passou integralmente. No teste novo, o mock de RPC foi ajustado para separar a verificação existente de revogação de acesso da consulta ABC.

## Reprodução local

Requer Node 22.13 ou superior. A suíte padrão não precisa de novas dependências.

Para SQL, disponibilizar `@electric-sql/pglite` fora do projeto e passar seu caminho em `PGLITE_MODULE`. A cópia da função oficial em tests/fixtures contém apenas código, sem dados.

Para interface, iniciar `PORT=49137 node scripts/preview-auditoria.cjs`, disponibilizar Playwright e passar `CHROME_BIN` se necessário. O script de UI só aceita URL de localhost e usa dados fictícios. As imagens ficam fora do repositório.

## Sequência de publicação autorizada

1. Autorização específica do dono recebida, conforme AGENTS.md.
2. Revalidar main/vez e versão disponível; usar subir-versao.cjs.
3. Aplicar a migração 20261014170059_pcp_pontualidade_abc.sql.
4. Publicar o pcp-sync do ramo aprovado antes da tela. Nenhuma alteração em _shared.
5. Publicar tela e verificar o fluxo autenticado em produção.

Não aplicar a migração nem publicar a tela isoladamente. O deploy da nova interface antes do servidor mostraria o aviso de ABC indisponível.

## Conferência anterior à liberação da tela

- Suíte repetida na v176: 2.080 testes aprovados, nenhum ignorado; oito verificações SQL e seis fluxos de interface aprovados.
- Migração aplicada via conector Supabase com versão remota `20261014173042`, nome `pcp_pontualidade_abc`; corresponde ao arquivo local `20261014170059_pcp_pontualidade_abc.sql`. Não reaplicar como uma migração diferente por causa do carimbo gerado pelo conector.
- Consulta oficial respondeu disponível; privilégios de anon/authenticated recusados, service_role permitido e SECURITY INVOKER confirmado. Nenhum registro alterado.
- Publicado somente pcp-sync v157 pelo conector Supabase, pois o workflow geral também republicaria o Painel, reservado a outro trabalho. Nenhuma mudança em _shared; os 11 arquivos publicados conferiram integralmente com o ramo aprovado. pcp-mubisys permaneceu v135.
- Consulta protegida sem sessão recusada com HTTP 401. A publicação da tela e sua conferência autenticada seguem após este registro.
