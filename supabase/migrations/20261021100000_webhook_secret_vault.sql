-- Webhook-Secret für notify-set und ranking-push aus Supabase Vault.
--
-- Bisher las der Trigger notify_set_inserted current_setting('app.webhook_secret').
-- Eine Datenbank-Einstellung gilt aber erst für neue Verbindungen, die
-- Verbindungen der API hätten also noch eine Weile ohne Secret gesendet. Der
-- Vault-Eintrag gilt sofort und steht in keiner Migration.
--
-- Einrichten (Wert gleich WEBHOOK_SECRET der Edge Functions):
--   select vault.create_secret('<secret>', 'webhook_secret');
-- Ohne Vault-Eintrag gilt weiter app.webhook_secret, sonst ein leerer Header.

begin;

create or replace function public.webhook_secret() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'webhook_secret' limit 1),
    nullif(current_setting('app.webhook_secret', true), ''),
    ''
  )
$$;
-- Nur Trigger und Cron (laufen als Eigentümer) dürfen das Secret lesen.
revoke execute on function public.webhook_secret() from public, anon, authenticated;

create or replace function public.notify_set_inserted() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  fn_url constant text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
  secret text := public.webhook_secret();
  payload jsonb;
begin
  if secret = '' then
    raise warning 'notify_set_inserted: webhook secret not configured, sending empty x-webhook-secret header';
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'sets',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', null
  );

  begin
    perform net.http_post(
      url := fn_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', secret
      ),
      timeout_milliseconds := 3000
    );
  exception when others then
    raise warning 'notify_set_inserted: pg_net call failed (%): %', SQLSTATE, SQLERRM;
  end;

  return NEW;
end;
$$;

commit;

-- Cron-Job ranking-push (Migration ranking_push_cron) mit demselben Secret.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('ranking-push', '15 * * * *', $cmd$
      select net.http_post(
        url := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/ranking-push',
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', public.webhook_secret()
        ),
        -- Kaltstart plus Monatsabschluss dauert länger als die 5 s Standard
        timeout_milliseconds := 30000
      )
    $cmd$);
  end if;
end $$;
