-- Tageserinnerung: Edge Function daily-nudge stündlich per pg_cron aufrufen
--
-- NICHT automatisch anwenden. Die Gründer spielen das selbst ein, frühestens
-- nach dem Launch (Erinnerungen ab 22.10. scharf). Reihenfolge, Details in
-- docs/PUSH_SETUP_MORNING.md, Teil B:
--
--   1. Extension aktivieren: Dashboard → Integrations → Cron → pg_cron
--      einschalten (pg_net ist für den Rivalen-Push schon an). Die Zeilen
--      unten machen dasselbe, falls das Dashboard es nicht schon getan hat.
--   2. Vault-Secret anlegen (SQL-Editor, Wert z. B. aus `openssl rand -hex 32`):
--        select vault.create_secret('<SECRET>', 'daily_nudge_secret');
--   3. Function deployen, derselbe Wert als NUDGE_SECRET, DRY_RUN bleibt an:
--        supabase secrets set NUDGE_SECRET=<SECRET> DRY_RUN=true --project-ref jczyyupxxqrdgbeifcwe
--        supabase functions deploy daily-nudge --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
--   4. Diese Datei im SQL-Editor ausführen.
--   5. DRY_RUN-Log prüfen: nach 19 Uhr (sonntags 18 Uhr) Edge Functions →
--      daily-nudge → Logs („daily-nudge DRY_RUN …“) und
--        select status_code, content from net._http_response order by created desc limit 5;
--   6. Scharf schalten: supabase secrets set DRY_RUN=false --project-ref jczyyupxxqrdgbeifcwe
--
-- Zurück: select cron.unschedule('daily-nudge');
--
-- Idempotent: mehrfach ausführbar. cron.schedule ersetzt einen Job gleichen
-- Namens. pg_cron läuft in UTC; die Function prüft selbst die Berliner Stunde,
-- deshalb stündlich (Zeitumstellung am 25.10.).

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- Wie in der Supabase-Anleitung; hat das Dashboard das schon erledigt, reicht ein Hinweis.
do $$ begin
  grant usage on schema cron to postgres;
  grant all privileges on all tables in schema cron to postgres;
exception when others then
  raise notice 'cron-Rechte nicht gesetzt (%), vermutlich schon vorhanden', sqlerrm;
end $$;

-- Die Obergrenze (eine Erinnerung pro Nutzer, Challenge und Tag) sichert
-- push_log_scope_ref_idx aus 20261024150000_push_events.sql.

select cron.schedule(
  'daily-nudge',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/daily-nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'daily_nudge_secret' limit 1),
        ''
      )
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  );
  $job$
);

commit;
