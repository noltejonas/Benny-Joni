-- Multi-User Challenges — Migration C (Cutover)
--
-- VORAUSSETZUNG: Migration B ist gelaufen, die Kontrollabfrage am Ende von B
-- zeigt überall 0, und alle Geräte nutzen die neue App-Version.
--
-- Danach funktioniert die alte App (ohne Login) nicht mehr.

begin;

-- Pflichtfelder
alter table weekly_challenges alter column competition_id set not null;
alter table sets              alter column competition_id set not null;
alter table sets              alter column user_id        set not null;
alter table plan_slots        alter column competition_id set not null;
alter table rotation_config   alter column competition_id set not null;
alter table penalty_config    alter column competition_id set not null;
alter table penalties         alter column competition_id set not null;
alter table penalties         alter column user_id        set not null;
alter table week_closures     alter column competition_id set not null;
alter table payouts           alter column competition_id set not null;
alter table payouts           alter column user_id        set not null;

-- Legacy-Zugriff für die alte App entfernen
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and policyname like 'legacy\_%'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- push_log: Lesezugriff nur noch für service_role
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'push_log' and policyname <> 'service write push_log'
  loop
    execute format('drop policy %I on public.push_log', r.policyname);
  end loop;
end $$;

-- Alte Rival-Push-Helfer auf Namensbasis werden nicht mehr gebraucht
drop function if exists public.athlete_reps_today(text);

commit;
