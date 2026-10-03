-- Apply before publishing the handler that calls this RPC. No client execution.
-- Configuration writers UPDATE this same row: its lock serializes team edits
-- with historical association. A failed CAS leaves both records untouched.
create or replace function public.pcp_vincular_equipe_cas(
  p_os_id text, p_os_versao timestamptz, p_cfg_versao timestamptz,
  p_equipe_id text, p_registro jsonb, p_atualizado_em timestamptz
) returns boolean
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_cfg jsonb;
  v_versao timestamptz;
  v_count integer;
begin
  if p_os_id is null or length(p_os_id) = 0 or p_equipe_id is null
     or p_os_versao is null or p_cfg_versao is null
     or p_atualizado_em is null or p_atualizado_em <= p_os_versao
     or jsonb_typeof(p_registro) is distinct from 'object'
     or p_registro->>'id' is distinct from p_os_id then
    raise exception 'Invalid association parameters';
  end if;
  select config, atualizado_em into v_cfg, v_versao
    from public.pcp_config_global where id = true for update;
  if not found or v_versao is distinct from p_cfg_versao then return false; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_cfg->'performancePCP'->'equipes') as e
    where e->>'id' = p_equipe_id and e->>'ativo' is distinct from 'false'
  ) then return false; end if;
  update public.pcp_registros set registro = p_registro, atualizado_em = p_atualizado_em
    where colecao = 'os' and id = p_os_id and not apagado
      and atualizado_em = p_os_versao;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.pcp_vincular_equipe_cas(text,timestamptz,timestamptz,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.pcp_vincular_equipe_cas(text,timestamptz,timestamptz,text,jsonb,timestamptz) to service_role;
