-- Hardening follow-up to 20260512100000_rival_push.sql:
--   - pin search_path on the SECURITY DEFINER trigger function (C1)
--   - raise warning when the webhook secret is unconfigured (C2)
--   - swallow pg_net failures so a set INSERT never aborts (I1)
--   - restrict push_log writes to service_role only (I3)

create or replace function public.notify_set_inserted() returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $$
declare
  fn_url constant text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
  secret text := current_setting('app.webhook_secret', true);
  payload jsonb;
begin
  if secret is null or secret = '' then
    raise warning 'notify_set_inserted: app.webhook_secret not configured, sending empty x-webhook-secret header';
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
        'x-webhook-secret', coalesce(secret, '')
      ),
      timeout_milliseconds := 3000
    );
  exception when others then
    raise warning 'notify_set_inserted: pg_net call failed (%): %', SQLSTATE, SQLERRM;
  end;

  return NEW;
end;
$$;

-- Lock down push_log writes: only service_role can mutate.
-- Reads remain public so the app can inspect today's push state.
drop policy if exists "public write push_log" on push_log;
create policy "service write push_log" on push_log
  for all to service_role using (true) with check (true);

-- Revoke direct execute on the trigger function from anon/authenticated;
-- it should only ever be invoked as a trigger.
-- PUBLIC must also be revoked because anon/authenticated inherit from PUBLIC by default.
revoke execute on function public.notify_set_inserted() from public, anon, authenticated;
