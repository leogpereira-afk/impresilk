-- Isolamento estrutural: nenhuma FK com cascata, trigger ou escrita em pcp_registros.
create table if not exists public.pcp_demandas (
 id text primary key, registro jsonb not null, revision bigint not null default 1,
 mutation_id text not null, atualizado_em timestamptz not null default now()
);
alter table public.pcp_demandas enable row level security;
revoke all on public.pcp_demandas from anon,authenticated;
grant all on public.pcp_demandas to service_role;
create or replace function public.pcp_demanda_gravar(p_id text,p_registro jsonb,p_revision bigint,p_mutation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare atual public.pcp_demandas%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('demanda:'||p_id,0));
 select * into atual from public.pcp_demandas where id=p_id for update;
 if atual.mutation_id=p_mutation then return to_jsonb(atual); end if;
 if coalesce(atual.revision,0) is distinct from p_revision then raise exception 'Conflito de revisão' using errcode='40001'; end if;
 if p_registro->>'id' is distinct from p_id then raise exception 'Identificador inválido'; end if;
 insert into public.pcp_demandas(id,registro,revision,mutation_id) values(p_id,p_registro,coalesce(atual.revision,0)+1,p_mutation)
 on conflict(id) do update set registro=excluded.registro,revision=excluded.revision,mutation_id=excluded.mutation_id,atualizado_em=now() returning * into atual;
 return to_jsonb(atual);
end $$;
revoke all on function public.pcp_demanda_gravar(text,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.pcp_demanda_gravar(text,jsonb,bigint,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pcp-demandas','pcp-demandas',false,10000000,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
