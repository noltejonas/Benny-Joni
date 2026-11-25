-- 20-Min-AMRAP: ein Teilsatz pro Runde statt eines Sammelsatzes
--
-- 20261125120000_workout_parts.sql hat aus 20 Runden einen Satz mit 100
-- Klimmzügen gemacht. Gemacht wurden aber 20 Sätze à 5 Klimmzüge (10
-- Liegestütze, 15 Kniebeugen). Ein Sammelsatz verfälscht Satzanzahl, größten
-- Satz und Durchschnitt pro Satz. Jetzt:
--
-- 1. apply_workout_parts legt pro Runde und Teilübung einen Satz an
--    (reps = Wiederholungen pro Runde). Die Runden liegen gleichmäßig in den
--    20 Minuten vor dem AMRAP-Eintrag (letzte Runde = Zeit des Eintrags),
--    nie vor Mitternacht (Berlin) desselben Tages, damit Tages- und
--    Wochenwertung beim Tag des Workouts bleiben. Jede Runde hat eine eigene
--    log_id (aus Workout-log_id, Übung und Runde), die Kopien einer Runde in
--    mehreren Challenges teilen sie. Höchstens 100 Runden.
--    Keine Notiz mehr: Ohne Notiz fasst der Feed die Runden einer Übung zu
--    einer Serie zusammen (auch in alten App-Versionen), statt 20 Einträge
--    zu zeigen. Die Herkunft steht in sets.source_log_id.
-- 2. sync_workout_parts: Runden oder Datum geändert → Teilsätze dieses
--    Workouts löschen und neu anlegen (die Zahl der Sätze ändert sich mit).
-- 3. Bestehende Teilsätze (die Sammelsätze aus KW 48) neu anlegen, ohne Pushes.

begin;

-- ─── 1. Ein Satz pro Runde ──────────────────────────────────────────────────
create or replace function public.apply_workout_parts(p_set public.sets) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ch weekly_challenges;
  v_part record;
  v_rounds int;
  v_step interval;
  v_day timestamptz;
  v_rows int;
  v_total int := 0;
begin
  if p_set.reps is null or p_set.reps <= 0 or p_set.user_id is null or p_set.source_log_id is not null then
    return 0;
  end if;
  select * into v_ch from weekly_challenges where id = p_set.challenge_id;
  if not found then return 0; end if;
  v_rounds := least(p_set.reps, 100);
  v_step := interval '20 minutes' / v_rounds;
  v_day := date_trunc('day', p_set.created_at at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';

  for v_part in
    select wp.part_id, wp.reps_per_round from workout_parts wp where wp.workout_id = v_ch.category_id
  loop
    insert into sets (challenge_id, competition_id, user_id, reps, note, created_at, log_id, source_log_id)
    select wc.id, wc.competition_id, p_set.user_id, v_part.reps_per_round, null,
      greatest(v_day, p_set.created_at - (v_rounds - r.i) * v_step),
      md5(p_set.log_id::text || ':' || v_part.part_id::text || ':' || r.i)::uuid, p_set.log_id
    from weekly_challenges wc
    join competitions c on c.id = wc.competition_id and c.mode <> 'solo' and c.archived_at is null
    join competition_members m on m.competition_id = wc.competition_id
      and m.user_id = p_set.user_id and m.left_at is null
    cross join generate_series(1, v_rounds) as r(i)
    where wc.category_id = v_part.part_id
      and wc.week_start = v_ch.week_start
      and not exists (
        select 1 from sets x
        where x.log_id = md5(p_set.log_id::text || ':' || v_part.part_id::text || ':' || r.i)::uuid
          and x.challenge_id = wc.id);
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  return v_total;
end $$;
revoke execute on function public.apply_workout_parts(public.sets) from public, anon, authenticated;

-- ─── 2. Runden oder Datum geändert: neu anlegen ────────────────────────────
create or replace function public.sync_workout_parts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'INSERT' then
    perform apply_workout_parts(new);
  elsif tg_op = 'UPDATE' then
    if new.source_log_id is null
       and (new.reps, new.created_at) is distinct from (old.reps, old.created_at)
       and exists (select 1 from sets d where d.source_log_id = new.log_id and d.user_id = new.user_id) then
      delete from sets where source_log_id = new.log_id and user_id = new.user_id;
      perform apply_workout_parts(new);
    end if;
  else -- DELETE
    if old.source_log_id is not null
       or not exists (select 1 from weekly_challenges wc where wc.id = old.challenge_id)
       or not exists (select 1 from competitions c where c.id = old.competition_id)
       or not exists (select 1 from profiles p where p.id = old.user_id) then
      return null;
    end if;
    delete from sets where source_log_id = old.log_id and user_id = old.user_id;
  end if;
  return null;
end $$;
revoke execute on function public.sync_workout_parts() from public, anon, authenticated;

-- ─── 3. Bestehende Teilsätze neu anlegen ───────────────────────────────────
alter table public.sets disable trigger notify_set_after_insert;
do $$
declare
  r public.sets;
  n_old int;
  n int := 0;
begin
  create temp table workout_parts_src on commit drop as
    select distinct user_id, source_log_id from sets where source_log_id is not null;
  delete from sets where source_log_id is not null;
  get diagnostics n_old = row_count;
  for r in
    select distinct on (s.user_id, s.log_id) s.*
    from sets s
    join workout_parts_src src on src.user_id = s.user_id and src.source_log_id = s.log_id
    where s.source_log_id is null
    order by s.user_id, s.log_id, s.created_at, s.id
  loop
    n := n + apply_workout_parts(r);
  end loop;
  raise notice 'workout_parts_rounds: % Sammelsätze ersetzt durch % Rundensätze', n_old, n;
end $$;
alter table public.sets enable trigger notify_set_after_insert;

commit;
