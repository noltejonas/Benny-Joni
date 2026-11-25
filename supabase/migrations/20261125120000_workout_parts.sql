-- 20-Min-AMRAP zählt in seine Teilübungen
--
-- Eine AMRAP-Runde sind 5 Klimmzüge, 10 Liegestütze und 15 Kniebeugen. Bisher
-- zählte ein AMRAP-Eintrag nur als Durchgang im Pflicht-Workout. Jetzt bekommt
-- jede Teilübung einen eigenen Satz (Runden mal Wiederholungen pro Runde) in
-- jedem Wochenziel dieser Übung derselben Woche, in jeder laufenden Challenge,
-- in der die Person aktiv ist (wie log_set bei gewerteten Übungen). Damit
-- zählen die Wiederholungen überall gleich: Fortschritt, Duell, Strafkonto,
-- Rangliste, Stats. Alte App-Versionen brauchen dafür kein Update.
--
-- 1. workout_parts: welche Übungen in einem Pflicht-Workout stecken.
--    Die App kennt dieselbe Liste (www/exercises.js, `parts`); der Test
--    tests/exercises.test.cjs prüft, dass beide gleich sind.
-- 2. sets.source_log_id: log_id des Workouts, aus dem ein Teilsatz stammt.
--    Alle Kopien eines Teilsatzes (gleiche Übung, mehrere Challenges) teilen
--    sich eine eigene log_id (aus Workout-log_id und Übung abgeleitet), damit
--    Rangliste und Stats sie einmal zählen und sync_log_siblings sie nicht mit
--    den Runden des Workouts überschreibt.
-- 3. Trigger sync_workout_parts: Workout eingetragen → Teilsätze anlegen;
--    Runden oder Datum geändert → Teilsätze nachziehen; Workout gelöscht →
--    Teilsätze löschen. Wie sync_log_siblings nur bei direkten Änderungen,
--    nicht bei Folge-Updates und nicht bei Löschungen per Cascade.
-- 4. Rückwirkend für die laufende Woche (KW 48, ab 23.11.2026), ohne Pushes:
--    Der Push-Trigger ist für den Nachtrag kurz aus, sonst kämen jetzt
--    „überholt“-Mitteilungen für Montag.

begin;

-- ─── 1. Teilübungen ─────────────────────────────────────────────────────────
create table if not exists public.workout_parts (
  workout_id     uuid not null references public.categories(id) on delete cascade,
  part_id        uuid not null references public.categories(id) on delete cascade,
  reps_per_round int  not null check (reps_per_round > 0),
  primary key (workout_id, part_id)
);
alter table public.workout_parts enable row level security;
drop policy if exists workout_parts_select on public.workout_parts;
create policy workout_parts_select on public.workout_parts for select to authenticated using (true);
revoke insert, update, delete on public.workout_parts from anon, authenticated;

insert into public.workout_parts (workout_id, part_id, reps_per_round)
select w.id, p.id, x.per_round
from (values ('Klimmzüge', 5), ('Liegestütze', 10), ('Kniebeugen', 15)) as x(name, per_round)
join public.categories w on w.competition_id is null and w.name = '20-Min-AMRAP'
join public.categories p on p.competition_id is null and p.name = x.name
on conflict (workout_id, part_id) do update set reps_per_round = excluded.reps_per_round;

-- ─── 2. Herkunft eines Teilsatzes ───────────────────────────────────────────
alter table public.sets add column if not exists source_log_id uuid;
create index if not exists sets_source_log_idx on public.sets(source_log_id) where source_log_id is not null;

-- Teilsätze zu einem Workout-Satz anlegen, wo sie fehlen. Liefert die Zahl
-- der neuen Zeilen. Nur für Trigger und den Nachtrag, nicht für die App.
create or replace function public.apply_workout_parts(p_set public.sets) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ch weekly_challenges;
  v_part record;
  v_log uuid;
  v_rows int;
  v_total int := 0;
begin
  if p_set.reps is null or p_set.reps <= 0 or p_set.user_id is null or p_set.source_log_id is not null then
    return 0;
  end if;
  select * into v_ch from weekly_challenges where id = p_set.challenge_id;
  if not found then return 0; end if;

  for v_part in
    select wp.part_id, wp.reps_per_round, w.name as workout_name
    from workout_parts wp join categories w on w.id = wp.workout_id
    where wp.workout_id = v_ch.category_id
  loop
    v_log := md5(p_set.log_id::text || ':' || v_part.part_id::text)::uuid;
    insert into sets (challenge_id, competition_id, user_id, reps, note, created_at, log_id, source_log_id)
    select wc.id, wc.competition_id, p_set.user_id, p_set.reps * v_part.reps_per_round,
      'Teil von: ' || v_part.workout_name, p_set.created_at, v_log, p_set.log_id
    from weekly_challenges wc
    join competitions c on c.id = wc.competition_id and c.mode <> 'solo' and c.archived_at is null
    join competition_members m on m.competition_id = wc.competition_id
      and m.user_id = p_set.user_id and m.left_at is null
    where wc.category_id = v_part.part_id
      and wc.week_start = v_ch.week_start
      and not exists (select 1 from sets x where x.log_id = v_log and x.challenge_id = wc.id);
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  return v_total;
end $$;
revoke execute on function public.apply_workout_parts(public.sets) from public, anon, authenticated;

-- ─── 3. Trigger ─────────────────────────────────────────────────────────────
create or replace function public.sync_workout_parts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'INSERT' then
    perform apply_workout_parts(new);
  elsif tg_op = 'UPDATE' then
    if new.source_log_id is null and new.reps > 0
       and (new.reps, new.created_at) is distinct from (old.reps, old.created_at) then
      update sets d set reps = new.reps * wp.reps_per_round, created_at = new.created_at
      from weekly_challenges dwc, weekly_challenges swc, workout_parts wp
      where d.source_log_id = new.log_id and d.user_id = new.user_id
        and dwc.id = d.challenge_id and swc.id = new.challenge_id
        and wp.workout_id = swc.category_id and wp.part_id = dwc.category_id
        and (d.reps, d.created_at) is distinct from (new.reps * wp.reps_per_round, new.created_at);
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
drop trigger if exists sync_workout_parts on public.sets;
create trigger sync_workout_parts after insert or update or delete on public.sets
  for each row execute function public.sync_workout_parts();

-- ─── 4. Nachtrag für die laufende Woche ────────────────────────────────────
alter table public.sets disable trigger notify_set_after_insert;
do $$
declare
  r public.sets;
  n int := 0;
begin
  for r in
    select distinct on (s.user_id, s.log_id) s.*
    from sets s
    join weekly_challenges wc on wc.id = s.challenge_id
    join workout_parts wp on wp.workout_id = wc.category_id
    where wc.week_start = date '2026-11-23' and s.source_log_id is null
    order by s.user_id, s.log_id, s.created_at, s.id
  loop
    n := n + apply_workout_parts(r);
  end loop;
  raise notice 'workout_parts: % Teilsätze für KW 48 nachgetragen', n;
end $$;
alter table public.sets enable trigger notify_set_after_insert;

commit;
