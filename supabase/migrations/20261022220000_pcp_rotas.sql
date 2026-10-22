-- Roteiros isolados das O.S.; acesso exclusivo pela Edge Function autenticada.
create table if not exists public.pcp_rotas (
 id text primary key,
 registro jsonb not null,
 revision bigint not null default 1 check (revision > 0),
 mutation_id text not null,
 atualizado_em timestamptz not null default now()
);
alter table public.pcp_rotas enable row level security;
revoke all on public.pcp_rotas from public, anon, authenticated;
grant select, insert, update on public.pcp_rotas to service_role;
