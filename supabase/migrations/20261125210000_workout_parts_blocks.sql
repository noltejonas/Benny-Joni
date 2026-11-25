-- 20-Min-AMRAP: Rundensätze je Übung als Block, damit der Feed sie bündelt
--
-- 20261125200000_workout_parts_rounds.sql legt pro Runde und Teilübung einen
-- Satz an, Runde für Runde abwechselnd (Klimmzüge, Liegestütze, Kniebeugen,
-- Klimmzüge, …). Der Feed fasst aber nur direkt aufeinanderfolgende Sätze
-- derselben Übung zu einer Serie zusammen; abwechselnd würden aus 20 Runden
-- 60 Einzeleinträge, auch in den App-Versionen, die schon in den Stores sind.
--
-- Jetzt liegen die Sätze einer Teilübung zeitlich hintereinander: erst alle
-- Klimmzüge, dann alle Liegestütze, dann alle Kniebeugen (Reihenfolge nach
-- Wiederholungen pro Runde), gleichmäßig in den 20 Minuten vor dem Eintrag,
-- letzter Satz = Zeit des Eintrags, nie vor Mitternacht (Berlin) desselben
-- Tages. Der Feed zeigt dann pro Übung eine Serie („20 Sätze, +100“).
-- Zahl der Sätze, log_ids und alles andere bleiben wie in
-- 20261125200000_workout_parts_rounds.sql. Bestehende Teilsätze werden neu
-- angelegt, ohne Pushes.

begin;

create or replace function public.apply_workout_parts(p_set public.sets) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ch weekly_challenges;
  v_part record;
  v_rounds int;
  v_parts int;
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
  select count(*) into v_parts from workout_parts wp where wp.workout_id = v_ch.category_id;
  if v_parts = 0 then return 0; end if;
  v_rounds := least(p_set.reps, 100);
  v_step := interval '20 minutes' / (v_rounds * v_parts);
  v_day := date_trunc('day', p_set.created_at at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';

  for v_part in
    select wp.part_id, wp.reps_per_round,
      (row_number() over (order by wp.reps_per_round, wp.part_id) - 1)::int as block
    from workout_parts wp where wp.workout_id = v_ch.category_id
  loop
    insert into sets (challenge_id, competition_id, user_id, reps, note, created_at, log_id, source_log_id)
    select wc.id, wc.competition_id, p_set.user_id, v_part.reps_per_round, null,
      greatest(v_day, p_set.created_at - (v_rounds * v_parts - (v_part.block * v_rounds + r.i)) * v_step),
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

-- Bestehende Teilsätze mit den neuen Zeiten neu anlegen
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
  raise notice 'workout_parts_blocks: % Rundensätze neu angelegt (vorher %)', n, n_old;
end $$;
alter table public.sets enable trigger notify_set_after_insert;

commit;
