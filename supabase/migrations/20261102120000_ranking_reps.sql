-- Rangliste: Reps statt Punkte
--
-- Die App ordnet Monat, Saison und Ewig nicht mehr nach F1-Punkten, sondern
-- nach Wiederholungen: pro Übung die Summe der Wochenwerte, gesamt die Summe
-- über alle Übungen mit metric 'volume'. Bei metric 'best' (Bring Sally Up,
-- 20-Min-AMRAP) zählt der beste Wochenwert; diese Übungen bleiben aus der
-- Gesamtsumme, weil Sekunden und Runden keine Wiederholungen sind.
--
-- weekly_results speichert value schon. Hier kommt nur die Spalte value in
-- ranking_totals dazu (am Ende, alte App-Versionen lesen weiter points) und
-- season_champions_reps neben season_champions. Punkte, Medaillen und
-- close_week bleiben unverändert: Medaillen gibt es weiter für die Plätze 1–3
-- pro Übung und Woche, und alte App-Versionen zeigen weiter Punkte.
-- Voraussetzung: 20261024130000_weekly_ranking.sql.

begin;

-- Neue Rückgabespalte: create or replace reicht dafür nicht.
drop function if exists public.ranking_totals(date, date);

create function public.ranking_totals(p_from date default null, p_to date default null)
returns table (category_id text, user_id uuid, display_name text, avatar_url text, color text,
               points int, gold int, silver int, bronze int, months int,
               is_me boolean, is_mine boolean, blocked boolean, value int)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.category_id, r.user_id, p.display_name, p.avatar_url, p.color,
    sum(r.points)::int,
    (count(*) filter (where r.medal = 'gold'))::int,
    (count(*) filter (where r.medal = 'silver'))::int,
    (count(*) filter (where r.medal = 'bronze'))::int,
    count(*)::int,
    r.user_id = auth.uid(), shares_active_competition(r.user_id),
    exists (select 1 from user_blocks x where x.blocker = auth.uid() and x.blocked = r.user_id),
    (case when max(c.metric) = 'best' then max(r.value) else sum(r.value) end)::int
  from weekly_results r
  join profiles p on p.id = r.user_id
  left join categories c on c.id::text = r.category_id
  where auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and not ranking_hidden(r.user_id, r.category_id, week_month(r.week))
    and (p_from is null or week_month(r.week) >= p_from)
    and (p_to is null or week_month(r.week) <= p_to)
  group by r.category_id, r.user_id, p.display_name, p.avatar_url, p.color
$$;

-- Saisonsieger nach Reps: pro Übung die meisten Wiederholungen (bei 'best'
-- der beste Wochenwert) im Kalenderjahr, gesamt (category_id null) die meisten
-- Wiederholungen über alle volume-Übungen. Erst wenn die letzte Woche des
-- Dezembers abgeschlossen ist, wie season_champions.
create or replace function public.season_champions_reps()
returns table (year int, category_id text, user_id uuid, value int)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select extract(year from week_month(r.week))::int as year, r.category_id, r.user_id, r.value,
      coalesce(c.metric, 'volume') as metric
    from weekly_results r
    left join categories c on c.id::text = r.category_id
    where not ranking_hidden(r.user_id, r.category_id, week_month(r.week))
  ),
  yearly as (
    select b.year, b.category_id, b.user_id,
      (case when max(b.metric) = 'best' then max(b.value) else sum(b.value) end)::int as v
    from base b group by 1, 2, 3
    union all
    select b.year, null, b.user_id, sum(b.value)::int
    from base b where b.metric <> 'best' group by 1, 3
  ),
  ranked as (
    select y.*, rank() over (partition by y.year, y.category_id order by y.v desc) as rk
    from yearly y where y.v > 0
  )
  select k.year, k.category_id, k.user_id, k.v
  from ranked k
  join profiles p on p.id = k.user_id and (p.ranking_opt_in or p.id = auth.uid())
  where k.rk = 1 and auth.uid() is not null
    and exists (
      select 1 from ranking_week_closures c
      where week_month(c.week) = make_date(k.year, 12, 1) and week_month(c.week + 7) > make_date(k.year, 12, 1)
    )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.ranking_totals(date, date)',
    'public.season_champions_reps()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
