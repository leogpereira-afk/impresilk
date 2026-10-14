-- Função de referência, sem dados. Painel 76540c2, migration 20260824g_analise_vendas.sql.
-- Cópia para comparar a extensão local com a classificação oficial.
create or replace function public.painel_clientes_abc(p_ano text default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id,
           coalesce(g.registro->>'nome', 'grupo') as grupo_nome
      from public.painel_registros g,
           lateral jsonb_array_elements_text(g.registro->'membros') m(membro)
     where g.colecao = 'grupos_clientes'
       and jsonb_typeof(g.registro->'membros') = 'array'
     order by m.membro, g.id
  ),
  base as (
    select o.*, coalesce(gr.grupo_id, o.cliente_chave) as chave_efetiva, gr.grupo_nome
      from public.painel_ordens o
      left join grupos gr on gr.membro = o.cliente_chave
     where o.data is not null and o.data <= current_date
       and (p_ano is null or to_char(o.data, 'YYYY') = p_ano)
  ),
  cli as (
    select chave_efetiva as chave,
           coalesce(max(grupo_nome), (array_agg(cliente order by data desc))[1]) as rotulo,
           bool_or(grupo_nome is not null) as eh_grupo,
           round(sum(valor), 2) as valor, count(*) as os,
           min(data) as primeira, max(data) as ultima
      from base group by 1
  ),
  classada as (
    select *,
           case when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.30 then 'A+'
                when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.80 then 'A'
                when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.90 then 'B+'
                when (sum(valor) over (order by valor desc, chave) - valor) / nullif(sum(valor) over (), 0) < 0.95 then 'B'
                else 'C' end as classe,
           valor / nullif(sum(valor) over (), 0) as share,
           row_number() over (order by valor desc, chave) as rn
      from cli
  )
  select jsonb_build_object(
    'ano', p_ano,
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'classe', classe, 'clientes', n, 'valor', v, 'corte', corte, 'shareClasse', sh)
        order by ordem), '[]'::jsonb)
      from (select classe, count(*) n, round(sum(valor),2) v,
                   round(min(valor),2) as corte,
                   round(sum(valor) / nullif((select sum(valor) from cli),0) * 1000) / 1000 as sh,
                   case classe when 'A+' then 0 when 'A' then 1 when 'B+' then 2 when 'B' then 3 else 4 end as ordem
              from classada group by classe) c),
    'total', (select round(coalesce(sum(valor),0),2) from cli),
    'clientesQtd', (select count(*) from cli),
    'lista', (select coalesce(jsonb_agg(jsonb_build_object(
        'chave', chave, 'rotulo', rotulo, 'ehGrupo', eh_grupo, 'classe', classe,
        'valor', valor, 'os', os, 'share', round(share * 1000) / 1000,
        'primeira', primeira, 'ultima', ultima) order by rn), '[]'::jsonb)
      from classada where rn <= 200),
    'fora', (select coalesce(jsonb_agg(jsonb_build_object(
        'classe', classe, 'clientes', n, 'valor', v) order by ordem), '[]'::jsonb)
      from (select classe, count(*) n, round(sum(valor),2) v,
                   case classe when 'A+' then 0 when 'A' then 1 when 'B+' then 2 when 'B' then 3 else 4 end as ordem
              from classada where rn > 200 group by classe) f)
  );
$$;
