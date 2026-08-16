-- ============================================================================
-- Garante a coluna `apagado` antes de o pcp-sync passar a depender dela.
--
-- POR QUE ESTE ARQUIVO EXISTE: a coluna já é declarada no 0001_init.sql, mas lá
-- dentro de um `create table if not exists`. Se a tabela tivesse sido criada
-- antes por qualquer outro caminho, o `if not exists` teria PULADO o comando
-- inteiro em silêncio — e a coluna não existiria, sem nada avisar. A partir de
-- agora TODA leitura de O.S filtra `apagado`; se a coluna faltar, o PCP inteiro
-- responde erro na primeira consulta. Uma linha idempotente é mais barata que
-- descobrir isso com a fábrica parada.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar as functions. Se a coluna
-- já existir (é o esperado), não faz nada.
--
-- O QUE A COLUNA SIGNIFICA: O.S excluída no app vira LÁPIDE (apagado=true) em
-- vez de sumir da tabela. A importação horária decide o que é novo perguntando
-- quais números já existem; com a linha removida, o pedido cancelado que segue
-- PRODUCAO no ERP voltava como esqueleto zerado toda hora, para sempre.
-- ============================================================================

alter table public.pcp_registros
  add column if not exists apagado boolean not null default false;

-- Conferência (deve devolver uma linha com data_type = boolean):
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'pcp_registros' and column_name = 'apagado';
