-- Pushes bei Beitritt und Reaktion
--
-- NICHT automatisch anwenden. Optional nach dem Launch (P2). Reihenfolge:
--   1. notify-set mit den Zweigen für competition_members und reactions
--      deployen (gleiche Function wie der Rivalen-Push):
--        supabase functions deploy notify-set --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
--   2. Diese Datei im SQL-Editor ausführen.
--   3. Test mit zwei Geräten (außerhalb 22–7 Uhr): B tritt per Code der
--      Challenge von A bei → A bekommt „🎉 B ist dabei“. A reagiert auf einen
--      Satz von B → B bekommt die Reaktion, falls B heute in dieser Challenge
--      noch keine Mitteilung hatte.
--   4. Prüfen: select kind, count(*) from push_log where day = current_date group by 1;
--      und select status_code, count(*) from net._http_response group by 1;
--
-- Zurück:
--   drop trigger if exists notify_member_joined   on public.competition_members;
--   drop trigger if exists notify_member_rejoined on public.competition_members;
--   drop trigger if exists notify_reaction_added  on public.reactions;
--
-- Regeln (in notify-set): Beitritt → alle anderen aktiven Mitglieder,
-- Reaktion → Besitzer des Satzes (nicht bei eigener Reaktion). Beides fällt
-- unter dieselbe Obergrenze wie der Rivalen-Push: höchstens eine Mitteilung pro
-- Nutzer, Challenge und Tag, keine zwischen 22 und 7 Uhr.
--
-- Das Secret kommt wie beim Rivalen-Trigger (20260512110000_rival_push_harden.sql)
-- aus app.webhook_secret, damit beide Auslöser gleich funktionieren.
-- Idempotent: mehrfach ausführbar.

begin;

create extension if not exists pg_net with schema extensions;

-- Höchstens eine Mitteilung pro Nutzer, Challenge und Tag, egal welcher Art.
-- Steht identisch auch in 20261021001000_daily_nudge_cron.sql.
create unique index if not exists push_log_one_per_day_idx
  on public.push_log (user_id, competition_id, day)
  where user_id is not null and competition_id is not null and athlete is null;

create or replace function public.notify_social_event() returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $$
declare
  fn_url constant text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
  secret text := current_setting('app.webhook_secret', true);
begin
  -- Ein Fehler beim Aufruf darf den Beitritt bzw. die Reaktion nie abbrechen.
  begin
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', to_jsonb(NEW),
        'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) end
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(secret, '')
      ),
      timeout_milliseconds := 3000
    );
  exception when others then
    raise warning 'notify_social_event: pg_net call failed (%): %', SQLSTATE, SQLERRM;
  end;
  return NEW;
end;
$$;

-- Nur als Trigger gedacht, nicht per RPC aufrufbar.
revoke execute on function public.notify_social_event() from public, anon, authenticated;

-- Beitritt per Code (join_competition). Der Ersteller (role owner) wird beim
-- Anlegen eingetragen und löst nichts aus.
drop trigger if exists notify_member_joined on public.competition_members;
create trigger notify_member_joined
  after insert on public.competition_members
  for each row
  when (NEW.left_at is null and NEW.role <> 'owner')
  execute function public.notify_social_event();

-- Wiedereintritt: join_competition setzt left_at per ON CONFLICT wieder auf null.
drop trigger if exists notify_member_rejoined on public.competition_members;
create trigger notify_member_rejoined
  after update of left_at on public.competition_members
  for each row
  when (OLD.left_at is not null and NEW.left_at is null)
  execute function public.notify_social_event();

drop trigger if exists notify_reaction_added on public.reactions;
create trigger notify_reaction_added
  after insert on public.reactions
  for each row
  when (NEW.user_id is not null)
  execute function public.notify_social_event();

commit;
