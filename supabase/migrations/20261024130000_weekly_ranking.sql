-- Rangliste: Medaillen pro Woche
--
-- Bisher gab es Punkte und Medaillen einmal im Monat. Jetzt wird jede Woche
-- (Montag bis Sonntag, Berlin) pro Grundübung gewertet: Platz, F1-Punkte und
-- für die Plätze 1–3 eine Medaille, sobald die Woche abgeschlossen ist
-- (Montag 12:00, bis dahin darf man nachtragen). Monat, Saison und Ewig
-- zählen die abgeschlossenen Wochen zusammen. Eine Woche gehört zu dem Monat,
-- in dem ihr Donnerstag liegt (wie die Kalenderwoche nach ISO 8601).
--
-- Gleiche Regeln wie im Monat: jede log_id einmal, volume = Summe mit
-- höchstens max_per_day pro Tag, best = bester Durchgang. Erste gewertete
-- Woche: die erste, deren Donnerstag ab ranking_settings.start_month liegt.
--
-- Die App erkennt die neuen Funktionen (ranking_week) und schaltet dann auf
-- die Wochenwertung; ohne diese Migration bleibt sie bei der Monatswertung.
-- monthly_results und close_due_months bleiben unangetastet (alte App-Versionen).
-- Voraussetzung: 20261024120000_heute_dashboard.sql (shares_active_competition).

begin;

-- ─── Tabellen ───────────────────────────────────────────────────────────────
create table if not exists weekly_results (
  week        date not null,                 -- Montag der Woche
  category_id text not null,                 -- categories.id als Text
  user_id     uuid not null references profiles(id) on delete cascade,
  value       int  not null,
  rank        int  not null,
  points      int  not null default 0,
  medal       text check (medal in ('gold','silver','bronze')),
  primary key (week, category_id, user_id)
);
create index if not exists weekly_results_user_idx on weekly_results(user_id);
alter table weekly_results enable row level security;

create table if not exists ranking_week_closures (
  week      date primary key,
  closed_at timestamptz not null default now()
);
alter table ranking_week_closures enable row level security;

-- Monat einer Woche: der Monat ihres Donnerstags
create or replace function public.week_month(p_week date) returns date
language sql immutable as $$ select date_trunc('month', p_week + 3)::date $$;

-- Erste gewertete Woche
create or replace function public.ranking_start_week() returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select case when week_month(w) < s.start_month then w + 7 else w end
  from ranking_settings s, lateral (select date_trunc('week', s.start_month)::date as w) x
  where s.id = 1
$$;

-- ─── Rechnung ───────────────────────────────────────────────────────────────
-- Rohwerte aller User für eine Woche (Berlin), jede log_id einmal.
create or replace function public.ranking_week_values(p_week date, p_exclude_log uuid default null)
returns table (category_id text, user_id uuid, value int)
language sql stable security definer set search_path = public, pg_temp as $$
  with logs as (
    select distinct on (s.user_id, s.log_id)
      s.user_id, s.reps, c.id::text as category_id, c.metric, c.max_per_day,
      (s.created_at at time zone 'Europe/Berlin')::date as day
    from sets s
    join weekly_challenges wc on wc.id = s.challenge_id
    join categories c on c.id = wc.category_id
    where c.ranked and c.competition_id is null
      and s.reps > 0
      and s.created_at >= (p_week::timestamp at time zone 'Europe/Berlin')
      and s.created_at <  ((p_week + 7)::timestamp at time zone 'Europe/Berlin')
      and (p_exclude_log is null or s.log_id <> p_exclude_log)
    order by s.user_id, s.log_id, s.created_at
  ),
  per_day as (
    select l.category_id, l.user_id, l.metric, l.day,
      case when l.metric = 'best'
        then max(least(l.reps, coalesce(l.max_per_day, l.reps)))
        else least(sum(l.reps), coalesce(l.max_per_day, sum(l.reps)))
      end as v
    from logs l
    group by l.category_id, l.user_id, l.metric, l.day, l.max_per_day
  )
  select d.category_id, d.user_id,
    (case when max(d.metric) = 'best' then max(d.v) else sum(d.v) end)::int
  from per_day d
  group by d.category_id, d.user_id
$$;

-- Gewertete Wochenliste: nur mit Zustimmung, ohne ausgeblendete Einträge
-- (Meldungen gelten für den Monat der Woche).
create or replace function public.ranking_week_live(p_week date, p_exclude_log uuid default null)
returns table (category_id text, user_id uuid, value int, rank int, points int)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.category_id, v.user_id, v.value,
    (rank() over w)::int,
    ranking_points((rank() over w)::int)
  from ranking_week_values(p_week, p_exclude_log) v
  join profiles p on p.id = v.user_id and p.ranking_opt_in
  where v.value > 0 and not ranking_hidden(v.user_id, v.category_id, week_month(p_week))
  window w as (partition by v.category_id order by v.value desc)
$$;

-- Wochenliste für die App. Abgeschlossene Wochen kommen aus weekly_results
-- (mit Medaille), die laufende live (vorläufig, ohne Medaille). Werde ich
-- selbst nicht gewertet, kommt meine Zeile mit counted = false und dem Platz,
-- auf dem ich stünde.
create or replace function public.ranking_week(p_week date)
returns table (category_id text, user_id uuid, display_name text, avatar_url text, color text,
               value int, rank int, points int, medal text, counted boolean,
               is_me boolean, is_mine boolean, blocked boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_closed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_closed := exists (select 1 from ranking_week_closures wc where wc.week = p_week);
  return query
  with board as (
    select r.category_id, r.user_id, r.value, r.rank, r.points, r.medal
    from weekly_results r
    join profiles p on p.id = r.user_id and p.ranking_opt_in
    where v_closed and r.week = p_week and not ranking_hidden(r.user_id, r.category_id, week_month(p_week))
    union all
    select l.category_id, l.user_id, l.value, l.rank, l.points, null::text
    from ranking_week_live(p_week, null) l
    where not v_closed
  ),
  mine as (
    select v.category_id, v.user_id, v.value
    from ranking_week_values(p_week, null) v
    where not v_closed and v.user_id = v_uid and v.value > 0
      and not exists (select 1 from board b where b.user_id = v_uid and b.category_id = v.category_id)
  )
  select b.category_id, b.user_id, p.display_name, p.avatar_url, p.color,
    b.value, b.rank, b.points, b.medal, true, b.user_id = v_uid, shares_active_competition(b.user_id),
    exists (select 1 from user_blocks x where x.blocker = v_uid and x.blocked = b.user_id)
  from board b join profiles p on p.id = b.user_id
  union all
  select m.category_id, m.user_id, p.display_name, p.avatar_url, p.color,
    m.value, (1 + (select count(*) from board b where b.category_id = m.category_id and b.value > m.value))::int,
    0, null::text, false, true, true, false
  from mine m join profiles p on p.id = m.user_id;
end $$;

-- Abgeschlossene Wochen der App (Feier, Feed-Karte)
create or replace function public.ranking_closed_weeks()
returns table (week date, closed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.week, c.closed_at from ranking_week_closures c where auth.uid() is not null order by c.week desc
$$;

-- Saison/Ewig/Monat: Summen pro User und Übung aus abgeschlossenen Wochen.
-- p_from/p_to sind Monate (1. des Monats); eine Woche zählt im Monat ihres
-- Donnerstags. Spalte months = Anzahl gewerteter Wochen (Name wie bisher).
create or replace function public.ranking_totals(p_from date default null, p_to date default null)
returns table (category_id text, user_id uuid, display_name text, avatar_url text, color text,
               points int, gold int, silver int, bronze int, months int,
               is_me boolean, is_mine boolean, blocked boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.category_id, r.user_id, p.display_name, p.avatar_url, p.color,
    sum(r.points)::int,
    (count(*) filter (where r.medal = 'gold'))::int,
    (count(*) filter (where r.medal = 'silver'))::int,
    (count(*) filter (where r.medal = 'bronze'))::int,
    count(*)::int,
    r.user_id = auth.uid(), shares_active_competition(r.user_id),
    exists (select 1 from user_blocks x where x.blocker = auth.uid() and x.blocked = r.user_id)
  from weekly_results r
  join profiles p on p.id = r.user_id
  where auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and not ranking_hidden(r.user_id, r.category_id, week_month(r.week))
    and (p_from is null or week_month(r.week) >= p_from)
    and (p_to is null or week_month(r.week) <= p_to)
  group by r.category_id, r.user_id, p.display_name, p.avatar_url, p.color
$$;

-- Medaillen und Punkte einer Person pro Woche (Profilkarte, Trophäenschrank)
create or replace function public.ranking_profile_weeks(p_user uuid)
returns table (week date, category_id text, value int, rank int, points int, medal text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.week, r.category_id, r.value, r.rank, r.points, r.medal
  from weekly_results r
  join profiles p on p.id = r.user_id
  where r.user_id = p_user and auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and r.points > 0
    and not ranking_hidden(r.user_id, r.category_id, week_month(r.week))
  order by r.week desc, r.rank
$$;

-- Saisonsieger (Punkte im Kalenderjahr) pro Übung und gesamt (category_id
-- null), sobald die letzte Woche des Dezembers abgeschlossen ist.
create or replace function public.season_champions()
returns table (year int, category_id text, user_id uuid, points int)
language sql stable security definer set search_path = public, pg_temp as $$
  with yearly as (
    select extract(year from week_month(r.week))::int as year, r.category_id, r.user_id, sum(r.points)::int as pts
    from weekly_results r group by 1, 2, 3
    union all
    select extract(year from week_month(r.week))::int, null, r.user_id, sum(r.points)::int
    from weekly_results r group by 1, 3
  ),
  ranked as (
    select y.*, rank() over (partition by y.year, y.category_id order by y.pts desc) as rk
    from yearly y where y.pts > 0
  )
  select k.year, k.category_id, k.user_id, k.pts
  from ranked k
  join profiles p on p.id = k.user_id and (p.ranking_opt_in or p.id = auth.uid())
  where k.rk = 1 and auth.uid() is not null
    and exists (
      select 1 from ranking_week_closures c
      where week_month(c.week) = make_date(k.year, 12, 1) and week_month(c.week + 7) > make_date(k.year, 12, 1)
    )
$$;

-- ─── Wochenabschluss ────────────────────────────────────────────────────────
create or replace function public.close_week(p_week date) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if p_week <> date_trunc('week', p_week)::date then raise exception 'invalid_week'; end if;
  insert into ranking_week_closures (week) values (p_week) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 0; end if;
  insert into weekly_results (week, category_id, user_id, value, rank, points, medal)
  select p_week, l.category_id, l.user_id, l.value, l.rank, l.points,
    case l.rank when 1 then 'gold' when 2 then 'silver' when 3 then 'bronze' end
  from ranking_week_live(p_week, null) l;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Schließt alle fälligen Wochen ab der ersten gewerteten: fällig am Montag
-- danach um 12:00 Berlin. Idempotent; darf auch die App aufrufen.
create or replace function public.close_due_weeks() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_w date := ranking_start_week();
  v_now timestamp := now() at time zone 'Europe/Berlin';
  v_total int := 0;
begin
  if v_w is null then return 0; end if;
  while v_w + interval '7 days 12 hours' <= v_now loop
    v_total := v_total + close_week(v_w);
    v_w := v_w + 7;
  end loop;
  return v_total;
end $$;

-- ─── Push-Hilfe (notify-set): überholt in der laufenden Woche ───────────────
create or replace function public.ranking_overtaken(p_set uuid)
returns table (user_id uuid, category_id text, category_name text, sender_name text, new_rank int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_s sets;
  v_cat categories;
  v_week date;
  v_old int;
  v_new int;
  v_first uuid;
begin
  select * into v_s from sets where id = p_set;
  if not found then return; end if;
  select s.id into v_first from sets s where s.log_id = v_s.log_id order by s.id limit 1;
  if v_first <> p_set then return; end if;
  select c.* into v_cat from weekly_challenges wc join categories c on c.id = wc.category_id where wc.id = v_s.challenge_id;
  if not found or not v_cat.ranked then return; end if;
  if not exists (select 1 from profiles p where p.id = v_s.user_id and p.ranking_opt_in) then return; end if;
  v_week := date_trunc('week', v_s.created_at at time zone 'Europe/Berlin')::date;
  if exists (select 1 from ranking_week_closures wc where wc.week = v_week) then return; end if;

  select l.value into v_new from ranking_week_live(v_week, null) l
  where l.user_id = v_s.user_id and l.category_id = v_cat.id::text;
  select v.value into v_old from ranking_week_values(v_week, v_s.log_id) v
  where v.user_id = v_s.user_id and v.category_id = v_cat.id::text;
  v_old := coalesce(v_old, 0);
  if v_new is null or v_new <= v_old then return; end if;

  return query
  select l.user_id, v_cat.id::text, v_cat.name,
    (select p.display_name from profiles p where p.id = v_s.user_id), l.rank
  from ranking_week_live(v_week, null) l
  where l.category_id = v_cat.id::text and l.user_id <> v_s.user_id
    and l.value >= v_old and l.value < v_new and l.rank <= 11
    and not exists (select 1 from user_blocks b where b.blocker = l.user_id and b.blocked = v_s.user_id);
end $$;

-- ─── Rechte ─────────────────────────────────────────────────────────────────
revoke execute on function public.ranking_week_values(date, uuid) from public, anon, authenticated;
revoke execute on function public.ranking_week_live(date, uuid) from public, anon, authenticated;
revoke execute on function public.close_week(date) from public, anon, authenticated;
revoke execute on function public.ranking_start_week() from public, anon, authenticated;
grant execute on function public.ranking_week_values(date, uuid) to service_role;
grant execute on function public.ranking_week_live(date, uuid) to service_role;
grant execute on function public.close_week(date) to service_role;
grant execute on function public.ranking_start_week() to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.ranking_week(date)',
    'public.ranking_closed_weeks()',
    'public.ranking_profile_weeks(uuid)',
    'public.close_due_weeks()',
    'public.week_month(date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.close_due_weeks() to service_role;

commit;

-- ─── Wochenabschluss per pg_cron (stündlich, idempotent) ────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ranking-close-weeks', '5 * * * *', 'select public.close_due_weeks()');
  end if;
exception when others then
  raise notice 'Cron-Job nicht angelegt: %', sqlerrm;
end $$;
