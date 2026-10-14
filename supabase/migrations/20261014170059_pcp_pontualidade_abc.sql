-- Leitura completa para o PCP. A classe continua sendo decidida pela curva
-- oficial de Campanhas; aqui só ampliamos sua lista (limitada a 200).
-- Não modifica a função original, grupos, O.S., classificações ou valores.
-- Retorna classes das entregas e os clientes A+, sem valores financeiros.
create or replace function public.pcp_pontualidade_abc(p_ano text, p_numeros text[] default '{}')
returns jsonb language plpgsql stable security invoker set search_path = public
as $$
declare resultado jsonb;
begin
  if p_ano !~ '^20[0-9]{2}$' or p_ano is null or cardinality(p_numeros) > 50000 then
    raise exception 'Consulta ABC inválida';
  end if;
  with oficial as materialized (
    select public.painel_clientes_abc(p_ano) as d
  ), grupos as (
    select distinct on (m.membro) m.membro, g.id as grupo_id, coalesce(g.registro->>'nome','grupo') as grupo_nome
    from public.painel_registros g,
      lateral jsonb_array_elements_text(case when jsonb_typeof(g.registro->'membros')='array' then g.registro->'membros' else '[]'::jsonb end) m(membro)
    where g.colecao='grupos_clientes' order by m.membro, g.id
  ), base as (
    select o.*, coalesce(g.grupo_id,o.cliente_chave) as chave_efetiva, g.grupo_nome
    from public.painel_ordens o left join grupos g on g.membro=o.cliente_chave
    where o.data is not null and o.data<=current_date and to_char(o.data,'YYYY')=p_ano
  ), clientes as (
    select chave_efetiva as chave, round(sum(valor),2) as valor,
      coalesce(max(grupo_nome),(array_agg(cliente order by data desc))[1]) as nome,
      bool_or(grupo_nome is not null) as grupo
    from base group by chave_efetiva
  ), ordenados as (
    select *, row_number() over(order by valor desc,chave) as posicao from clientes
  ), limites as (
    -- Limites VINDOS da função oficial, sem reproduzir percentuais ou cortes.
    select c->>'classe' as classe, (c->>'clientes')::bigint as quantidade,
      sum((c->>'clientes')::bigint) over(order by n) as fim
    from oficial, jsonb_array_elements(d->'classes') with ordinality as cs(c,n)
  ), lista as (
    select o.*, l.classe
    from ordenados o join limites l on o.posicao>l.fim-l.quantidade and o.posicao<=l.fim
  ), vinculos as (
    -- O número da O.S. liga à chave já gravada pelo ERP. Nunca casar por nome.
    select o.numero::text as numero, min(o.cliente_chave) as membro
    from public.painel_ordens o where o.numero::text=any(p_numeros)
    group by o.numero::text having count(distinct o.cliente_chave)=1
      and bool_and(nullif(o.cliente_chave,'') is not null)
  ), conferido as (
    select (select count(*) from lista)=(d->>'clientesQtd')::bigint
      and (select count(*) from ordenados)=(d->>'clientesQtd')::bigint
      and (select coalesce(sum(valor),0) from ordenados)=(d->>'total')::numeric
      and not exists(select 1 from limites where classe not in ('A+','A','B+','B','C') or quantidade<0)
      and not exists(
        select 1 from jsonb_array_elements(d->'lista') c left join lista l on l.chave=c->>'chave'
        where l.chave is null or l.classe is distinct from c->>'classe' or l.valor is distinct from (c->>'valor')::numeric
      ) as ok from oficial
  )
  select jsonb_build_object('ano',p_ano,'disponivel',true,'fonte','Campanhas · Curva ABC',
    'consultadoEm',now(),'clientesAmais',coalesce((select jsonb_agg(jsonb_build_object(
      'chave',chave,'nome',nome,'grupo',grupo) order by posicao) from lista where classe='A+'),'[]'::jsonb),
    'ordens',coalesce((select jsonb_agg(jsonb_build_object('numero',v.numero,
      'classe',l.classe,'chave',case when l.classe='A+' then l.chave else null end))
      from vinculos v left join grupos g on g.membro=v.membro
      left join lista l on l.chave=coalesce(g.grupo_id,v.membro)),'[]'::jsonb))
    into resultado from conferido where ok;
  if resultado is null then raise exception 'A leitura completa não conferiu com a curva ABC de Campanhas'; end if;
  return resultado;
end;
$$;
revoke all on function public.pcp_pontualidade_abc(text,text[]) from public, anon, authenticated;
grant execute on function public.pcp_pontualidade_abc(text,text[]) to service_role;
