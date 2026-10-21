-- Monatsrangliste: Edge Function ranking-push stündlich aufrufen
-- (Monatsabschluss, Erinnerung am letzten Tag, Monatsergebnisse).
--
-- Wie der Trigger notify_set_inserted (Migration rival_push) über pg_net mit
-- dem Secret aus app.webhook_secret; ranking-push ist mit --no-verify-jwt
-- deployed und prüft den Header x-webhook-secret selbst.
-- Voraussetzung: pg_cron und pg_net sind aktiv (Dashboard → Database → Extensions).

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron fehlt: im Dashboard unter Database → Extensions aktivieren und diese Migration erneut ausführen.';
  elsif not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net fehlt: im Dashboard unter Database → Extensions aktivieren und diese Migration erneut ausführen.';
  else
    perform cron.schedule('ranking-push', '15 * * * *', $cmd$
      select net.http_post(
        url := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/ranking-push',
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', coalesce(current_setting('app.webhook_secret', true), '')
        )
      )
    $cmd$);
  end if;
end $$;
