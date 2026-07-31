-- ============================================================================
-- Importacao horaria das O.S do Mubisys.
--
-- No Netlify era [functions."mubisys-sync"] schedule = "@hourly". Aqui e o
-- pg_cron chamando a acao "importar" do pcp-mubisys pelo pg_net.
--
-- Esta e a funcionalidade CENTRAL do PCP: sem ela, as O.S novas do ERP param de
-- chegar e o PCP vira uma lista congelada -- sem nada quebrar na tela. So o
-- painel de saude denunciaria, pela data do ultimo batimento envelhecendo.
--
-- Minuto 20 de proposito: o Brief roda as 07:00 e nao vale empilhar os dois no
-- mesmo instante disputando a mesma API lenta do Mubisys.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('pcp-importacao-horaria')
where exists (select 1 from cron.job where jobname = 'pcp-importacao-horaria');

select cron.schedule(
  'pcp-importacao-horaria',
  '20 * * * *',
  $job$
  select net.http_post(
    url     := 'https://heveemylixartyijxewh.supabase.co/functions/v1/pcp-mubisys',
    headers := '{"Content-Type":"application/json","x-token":"impresilk-bhinxmdp5b7dwgaxpv9u2xqh"}'::jsonb,
    body    := '{"action":"importar"}'::jsonb
  );
  $job$
);
