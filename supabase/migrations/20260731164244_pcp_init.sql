-- ============================================================================
-- Schema do PCP / Instalacao no Supabase (substitui o Netlify Blobs).
--
-- PROJETO COMPARTILHADO: aqui moram tambem o RH (nomes CRUS: registros,
-- config_global, meta, perfis, bucket "arquivos", function "sync") e o Brief
-- (brief_*). Tudo deste sistema leva o prefixo pcp_ / pcp-. Criar objeto sem
-- prefixo reutiliza a tabela do RH em silencio -- "create table if not exists"
-- NAO avisa.
--
-- De-para dos stores do Blobs:
--   os          -> pcp_registros (colecao='os')
--   cfg         -> pcp_config_global
--   integracoes -> pcp_meta (credenciais do Mubisys + status da importacao)
--   fotos       -> bucket pcp-arquivos
--
-- Nao ha numeracao propria a preservar: o numero da O.S vem do Mubisys e a
-- importacao deduplica por numero. Por isso existe o indice unico abaixo --
-- ele transforma essa regra em garantia do banco, e nao em disciplina do codigo.
-- ============================================================================

create table if not exists public.pcp_registros (
  colecao       text not null,
  id            text not null,
  registro      jsonb not null,
  atualizado_em timestamptz not null default now(),
  apagado       boolean not null default false,
  primary key (colecao, id)
);
create index if not exists pcp_registros_colecao_idx on public.pcp_registros (colecao);

-- Uma O.S por numero. A importacao horaria compara por numero antes de gravar;
-- se dois ciclos rodarem juntos, a checagem no codigo nao segura -- esta trava
-- segura. (A faxina de duplicatas existe hoje justamente porque isso escapava.)
create unique index if not exists pcp_os_numero_idx
  on public.pcp_registros ((registro->>'numero'))
  where colecao = 'os' and registro->>'numero' is not null and registro->>'numero' <> '';

alter table public.pcp_registros enable row level security;

create table if not exists public.pcp_config_global (
  id            boolean primary key default true check (id),
  config        jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.pcp_config_global enable row level security;

create table if not exists public.pcp_meta (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.pcp_meta enable row level security;

insert into storage.buckets (id, name, public)
values ('pcp-arquivos', 'pcp-arquivos', false)
on conflict (id) do nothing;
