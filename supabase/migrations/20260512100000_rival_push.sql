-- 1. pg_net extension (async HTTP from Postgres)
create extension if not exists pg_net with schema extensions;

-- 2. push_log: dedup table. Composite PK garantiert max 1 Push pro
--    (athlete, kind, day) — Doppelsendung wird als unique_violation gefangen.
create table if not exists push_log (
  athlete text not null references athletes(name) on delete cascade,
  kind text not null,
  day date not null,
  created_at timestamptz default now(),
  primary key (athlete, kind, day)
);

create index if not exists push_log_day_idx on push_log(day);

alter table push_log enable row level security;
create policy "public read push_log" on push_log for select using (true);
create policy "public write push_log" on push_log for all using (true) with check (true);

-- 3. Helper: Tagessumme pro Athlet in Europe/Berlin-Zeitzone
create or replace function public.athlete_reps_today(p_athlete text)
  returns int
  language sql stable as $$
  select coalesce(sum(reps), 0)::int
  from sets
  where athlete = p_athlete
    and (created_at at time zone 'Europe/Berlin')::date
        = (now() at time zone 'Europe/Berlin')::date
$$;

-- 4. Helper: heutiges Datum in Berlin (für push_log.day)
create or replace function public.berlin_today() returns date
  language sql stable as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;

-- 5. Trigger-Funktion: ruft Edge-Function via pg_net
create or replace function public.notify_set_inserted() returns trigger
  language plpgsql security definer as $$
declare
  fn_url constant text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
  secret text := current_setting('app.webhook_secret', true);
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'sets',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', null
  );
  perform net.http_post(
    url := fn_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    )
  );
  return NEW;
end;
$$;

drop trigger if exists notify_set_after_insert on sets;
create trigger notify_set_after_insert
  after insert on sets
  for each row execute function public.notify_set_inserted();
