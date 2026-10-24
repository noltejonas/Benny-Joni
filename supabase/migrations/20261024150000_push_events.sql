-- Ereignis-Pushes: Überholt, 100 %, Reaktion, Beitritt
--
-- Ersetzt 20261021002000_social_push.sql (nie eingespielt). Die Regeln stehen in
-- supabase/functions/notify-set (Deploy vor dieser Migration):
--   sets                → überholt (je Übung der laufenden Woche), 100 % einer
--                         Challenge, Rangliste (bestehender Trigger notify_set_after_insert)
--   reactions           → Reaktion an den Besitzer des Satzes
--   competition_members → „X ist dabei“ an die anderen Mitglieder
--
-- Obergrenze jetzt pro Art statt über alle Arten: höchstens eine Mitteilung pro
-- Empfänger, Challenge, Art, ref und Tag. ref grenzt ein (Überholen: Wochenziel,
-- Reaktion: reagierende Person, 100 %: wer fertig ist, Beitritt: wer beitritt).
-- Sonst würde z. B. eine Reaktion am Vormittag den Überholt-Push vom Abend sperren.
-- Ruhezeit 22–7 Uhr bleibt in der Function.
--
-- Das Secret kommt wie beim Satz-Trigger aus public.webhook_secret() (Vault,
-- 20261021100000_webhook_secret_vault.sql). Idempotent.
--
-- Zurück:
--   drop trigger if exists notify_member_joined   on public.competition_members;
--   drop trigger if exists notify_member_rejoined on public.competition_members;
--   drop trigger if exists notify_reaction_added  on public.reactions;

begin;

-- ─── Push-Log: Obergrenze pro Art und ref ───────────────────────────────────
alter table public.push_log add column if not exists ref text;

create unique index if not exists push_log_scope_ref_idx on public.push_log (
  coalesce(athlete, ''),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind, day, coalesce(ref, '')
);
drop index if exists public.push_log_scope_idx;
-- Die frühere Sperre über alle Arten (aus den nie eingespielten Entwürfen) nicht anlegen.
drop index if exists public.push_log_one_per_day_idx;

-- ─── Trigger für Reaktion und Beitritt ──────────────────────────────────────
create or replace function public.notify_social_event() returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions, pg_temp
as $$
begin
  -- Ein Fehler beim Aufruf darf den Beitritt bzw. die Reaktion nie abbrechen.
  begin
    perform net.http_post(
      url := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set',
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', to_jsonb(NEW),
        'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) end
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(public.webhook_secret(), '')
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

-- Beitritt per Code (join_competition). Der Ersteller (role owner) löst nichts aus.
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
