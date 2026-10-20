-- Launch-Checks (NUR LESEND) – Supabase Dashboard → SQL Editor, Projekt jczyyupxxqrdgbeifcwe
--
-- Ändert nichts und liest keine personenbezogenen Inhalte (nur Katalog,
-- Metadaten und Zählungen). Der SQL-Editor zeigt nur das Ergebnis der letzten
-- Abfrage: jeden Abschnitt einzeln markieren und mit Cmd+Enter ausführen.
-- Ergebnisse gern an Claude geben. Push-spezifische Abschnitte: 7, 8, 10, 12, 15–19.

-- 1. Migrationshistorie (leer/unvollständig = per SQL-Editor eingespielt → NIE blind `supabase db push`)
select version, name from supabase_migrations.schema_migrations order by version;

-- 2. RLS an allen Tabellen im Schema public (relrowsecurity muss überall true sein)
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') order by 1;

-- 3. Alle Policies (public + storage)
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;

-- 4. Spaltenrechte profiles (erwartet: authenticated UPDATE auf display_name, avatar_url, color, main_competition_id, onboarding)
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated') and privilege_type = 'UPDATE'
order by 1,2;

-- 4b. Kurzfassung: Darf die App das Onboarding speichern? (Migration 20261020000000_profile_onboarding.sql)
--     Erwartet: spalte_da = true und update_recht = true. Fehlt die Spalte, ist die Migration noch nicht eingespielt.
select exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding') as spalte_da,
       exists (select 1 from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding'
                 and grantee = 'authenticated' and privilege_type = 'UPDATE') as update_recht;

-- 5. Fremdschlüssel + Löschregel (confdeltype: a=no action, r=restrict, c=cascade, n=set null)
--    Kritisch: sets.challenge_id (c = Ziel löschen löscht Sätze), competitions.created_by (a = blockiert Konto-Löschung)
select conrelid::regclass as tabelle, conname, confdeltype, pg_get_constraintdef(oid) as def
from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace order by 1,2;

-- 5b. Nur sets.challenge_id: Was passiert mit den Sätzen, wenn ein Wochenziel gelöscht wird?
--     c = Sätze werden mitgelöscht (Datenverlust), a/r = Löschen wird blockiert, n = Sätze bleiben ohne Ziel.
select conname, confdeltype as loeschregel, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f' and conrelid = 'public.sets'::regclass
  and conkey = array[(select attnum from pg_attribute where attrelid = 'public.sets'::regclass and attname = 'challenge_id')];

-- 6. Realtime-Publication (App hört auf sets, weekly_challenges, plan_slots, rotation_config, penalties, week_closures,
--    penalty_config, payouts, project_tags, tool_tags, competition_members, categories, reactions, competitions, profiles)
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;

-- 6b. Welche der erwarteten Tabellen fehlen in der Publication? (leer = alles da)
select t as fehlt_in_realtime
from unnest(array['sets','weekly_challenges','plan_slots','rotation_config','penalties','week_closures',
                  'penalty_config','payouts','project_tags','tool_tags','competition_members','categories',
                  'reactions','competitions','profiles']) as t
where not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t);

-- 7. Push-Auslöser auf sets: notify_set_after_insert (Trigger) UND/ODER ein Dashboard-Webhook
--    (erscheint als Trigger mit supabase_functions.http_request). Es darf nur EINER aktiv sein.
select tgname, tgenabled, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.sets'::regclass and not tgisinternal;

-- 8. Webhook-Secret als DB-Setting gesetzt? (zeigt nur true/false, nicht den Wert)
select coalesce(current_setting('app.webhook_secret', true), '') <> '' as webhook_secret_gesetzt;

-- 9. Storage-Buckets (avatars: public, Größen-/Typgrenze?)
select id, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 10. Extensions (pg_net für Push, pg_cron für die Tageserinnerung)
select extname, extversion from pg_extension order by 1;

-- 10b. Ist pg_cron aktiv? (false = Dashboard → Integrations → Cron einschalten, bevor
--      20261021001000_daily_nudge_cron.sql läuft)
select exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_aktiv,
       exists (select 1 from pg_extension where extname = 'pg_net')  as pg_net_aktiv;

-- 11. Größe & Zählungen (Free-Tier: 500 MB)
select pg_size_pretty(pg_database_size(current_database())) as db_groesse,
       (select count(*) from auth.users) as nutzer,
       (select count(*) from public.sets) as saetze,
       (select count(*) from public.competitions) as challenges;

-- 12. Push-Aufrufe (pg_net-Antworten nach Statuscode). pg_net hebt Antworten nur 6 Stunden auf.
--     200 = ok, 401 = Secret passt nicht, 503 = APNs-Secrets fehlen, 500 = Fehler in der Function.
select status_code, count(*), max(created) as zuletzt from net._http_response group by 1 order by 2 desc;

-- 13. SECURITY-DEFINER-Funktionen und wer sie ausführen darf
select p.proname, p.prosecdef, array_to_string(p.proacl, ', ') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;

-- 14. pg_cron-Jobs. Nur ausführen, wenn 10b pg_cron_aktiv = true zeigt (sonst gibt es cron.job nicht).
-- select jobname, schedule, active from cron.job order by 1;
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'daily-nudge') order by start_time desc limit 10;

-- 15. Mitteilungen pro Art und Tag (letzte 7 Tage)
select day, kind, count(*) from public.push_log where day > current_date - 7 group by 1, 2 order by 1 desc, 2;

-- 16. Geräte mit Push-Token: nur Zeilen mit user_id bekommen Pushes
select platform, count(*) as tokens, count(*) filter (where user_id is not null) as mit_user_id,
       count(distinct user_id) as nutzer, max(last_seen) as zuletzt_gesehen
from public.device_tokens group by 1;

-- 17. Obergrenze „1 pro Nutzer, Challenge und Tag“: gibt es Tage mit mehr als einer Mitteilung?
--     Muss leer sein, bevor push_log_one_per_day_idx angelegt werden kann.
select day, count(*) as faelle
from (select user_id, competition_id, day from public.push_log
      where user_id is not null and competition_id is not null and athlete is null
      group by 1, 2, 3 having count(*) > 1) d
group by 1 order by 1 desc;

-- 18. Indizes auf push_log (push_log_one_per_day_idx kommt mit den neuen Push-Migrationen)
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'push_log';

-- 19. Push-Trigger für Beitritt und Reaktion (kommen mit 20261021002000_social_push.sql)
select tgrelid::regclass as tabelle, tgname, tgenabled
from pg_trigger
where tgrelid in ('public.competition_members'::regclass, 'public.reactions'::regclass) and not tgisinternal
order by 1, 2;
