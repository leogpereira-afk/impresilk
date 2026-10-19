'use strict';
/* O ENSAIO DE RECUPERAÇÃO DO BACKUP (scripts/ensaio-backup-pcp.cjs) roda na
   suíte: exportar pela porta nova, copiar as fotos por sha256 e voltar num
   PCP vazio, provando lápide, selo, comissão e fotos (A2, M20, M21, M29).
   Sem a porta exportarBackup o ensaio para logo na ida. Dados fictícios. */
const {test} = require('node:test'), assert = require('node:assert/strict');
const E = require('../scripts/ensaio-backup-pcp.cjs');

test('ensaio do backup: ida pela porta nova e volta num PCP vazio, com as doze provas', async () => {
  const r = await E.executar({gravar: false});
  assert.deepEqual(r.checks, [
    'exportação pela porta nova: todas as linhas, sem repetir, com a contagem conferida',
    'pcp_meta vai na cópia (a cópia de desfazer do robô e o cache do ERP), e a credencial do ERP não',
    'volta: as mesmas linhas, com o apagado e o atualizado_em de cada uma',
    'lápide continua lápide: fora da lista, na lista de excluídas, e o celular recebe "excluída"',
    'selo e comissão voltam: o servidor recalcula, o hash do selo confere e o CSV é idêntico',
    'a pendência paga por compensação volta: continua paga, não se paga de novo, e o CSV dela é idêntico',
    'mês fechado continua fechado: regra nova com data dentro dele é recusada (409)',
    'fotos voltam pelo sha256 e o getPhoto devolve os mesmos bytes',
    'arquivo corrompido no destino: a volta recusa antes de gravar qualquer coisa',
    'pacote sem a lápide: a contagem recusa',
    'volta por cima de um PCP com dados: recusada',
    'a volta do jeito antigo (só o list do Hub) perdia a lápide e reabria o mês',
  ]);
  assert.equal(r.lapides, 1);
  assert.equal(r.meta, 2, 'o pcp_meta voltou, sem a credencial do ERP');
  assert.ok(r.paginas > 1, 'a exportação passou por mais de uma página');
  for (const c of ['os', 'auditoria', 'foto_evento', 'performance_fechamentos', 'performance_regras', 'performance_comissao', 'performance_comissao_os_versoes', 'performance_comissao_pendencias'])
    assert.ok(r.contagem[c] >= 1, c);
  // As três da onda comissão entram na lista das que a contagem tem de trazer, mesmo vazias (hoje 0 linhas).
  for (const c of ['performance_comissao_exportacoes', 'performance_documentos', 'performance_retrato_logos'])
    assert.ok(E.OBRIGATORIAS.includes(c), c);
});

test('pacote pcp-backup-5: as mesmas chaves que o painel-backup grava em pcp/AAAA-MM-DD.json', () => {
  // A lista é a de montarArquivoPCP (painel-impresilk, supabase/functions/_shared/backup-pcp.mjs).
  const p = E.montarPacote({pcp_registros: [], pcp_demandas: [], cfg: {}, cfgVersao: '', contagemInicio: {}, contagemFim: {}, formato: 'pcp-exportacao-1', paginas: 1}, {});
  assert.deepEqual(Object.keys(p).sort(), ['arquivos', 'arquivosCompletos', 'arquivosPendentes', 'cfg', 'cfgVersao', 'contagem', 'destinoArquivos', 'divergencias',
    'exportadoEm', 'formato', 'nome', 'origem', 'pcp_demandas', 'pcp_meta', 'pcp_registros', 'sistema', 'versao']);
  assert.equal(p.formato, 'pcp-backup-5');
});
