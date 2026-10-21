-- Monatsrangliste
-- Spec: docs/superpowers/specs/2026-10-20-monatsrangliste-design.md
--
-- Globale Rangliste pro Grundübung (Katalog), Monatsabschluss mit F1-Punkten,
-- Saison- und ewige Tabelle. Dazu:
--   * Ein Satz zählt in allen Challenges mit derselben Übung (gemeinsame log_id),
--     Bearbeiten/Löschen wirkt auf alle Zeilen der log_id.
--   * Freies Training: versteckte Solo-Challenge pro User für Grundübungen ohne
--     passendes Wochenziel.
--   * Zustimmung (profiles.ranking_opt_in), Melden, Blockieren, Konto löschen.
--
-- Erster gewerteter Monat: ranking_settings.start_month (Standard 1. November
-- 2026). Wer später live geht, setzt den Wert auf den ersten vollen Monat.

begin;

-- ─── Katalog: gewertete Grundübungen ────────────────────────────────────────
alter table categories add column if not exists ranked      boolean not null default false;
alter table categories add column if not exists metric      text;
alter table categories add column if not exists rule        text;
alter table categories add column if not exists max_per_day int;
do $$ begin
  alter table categories add constraint categories_metric_check check (metric in ('volume','best'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table categories add constraint categories_ranked_only_catalog check (not ranked or competition_id is null);
exception when duplicate_object then null; end $$;

-- volume: Summe pro Monat, pro Tag höchstens max_per_day.
-- best:   bester Durchgang im Monat, ein Durchgang höchstens max_per_day.
update categories c
set ranked = true, metric = v.metric, max_per_day = v.max_per_day, rule = v.rule
from (values
  ('liegestütze',    'volume', 1000, 'Brust fast am Boden, oben Arme ganz gestreckt.'),
  ('klimmzüge',      'volume',  400, 'Aus dem toten Hang, Kinn über die Stange.'),
  ('dips',           'volume',  600, 'Oberarme mindestens parallel zum Boden, oben ganz gestreckt.'),
  ('leg raises',     'volume',  600, 'Gestreckte Beine bis mindestens 90 Grad anheben.'),
  ('hspu',           'volume',  300, 'Kopf berührt Boden oder Matte, oben ganz gestreckt.'),
  ('sit-ups',        'volume', 1000, 'Schultern ganz ab, Brust bis zu den Knien.'),
  ('kniebeugen',     'volume', 1000, 'Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.'),
  ('burpees',        'volume',  500, 'Brust am Boden, oben Sprung mit den Händen über dem Kopf.'),
  ('bring sally up', 'best',    204, 'Zeit bis zum ersten Absetzen, 3:24 ist das Maximum.'),
  ('tom holland',    'best',     40, 'Volle Runden in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen.')
) as v(lname, metric, max_per_day, rule)
where c.competition_id is null and lower(c.name) = v.lname;

-- Eigene Übungen dürfen nicht wie eine Katalog-Übung heißen, sonst wundert sich
-- jemand, warum seine „Liegestütze“ nicht zählen.
create or replace function public.guard_catalog_names() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.competition_id is not null and exists (
    select 1 from categories c
    where c.competition_id is null and lower(c.name) = lower(trim(new.name))
  ) then
    raise exception 'catalog_name';
  end if;
  return new;
end $$;
drop trigger if exists guard_catalog_names on categories;
create trigger guard_catalog_names before insert or update of name on categories
  for each row execute function public.guard_catalog_names();

-- Bestehende Dubletten nur melden; sie werden von Hand umbenannt.
do $$
declare r record;
begin
  for r in
    select c.id, c.name, c.competition_id from categories c
    where c.competition_id is not null and exists (
      select 1 from categories k where k.competition_id is null and lower(k.name) = lower(trim(c.name)))
  loop
    raise notice 'Eigene Übung mit Katalognamen: % (%) in Challenge %', r.name, r.id, r.competition_id;
  end loop;
end $$;

-- ─── Sätze: gemeinsame log_id ───────────────────────────────────────────────
-- Jede bestehende Zeile bekommt eine eigene log_id (volatile Default = pro Zeile).
alter table sets add column if not exists log_id uuid not null default gen_random_uuid();
create index if not exists sets_log_id_idx on sets(log_id);

-- Bearbeiten und Löschen wirken auf alle Zeilen derselben log_id. Nur direkte
-- Änderungen werden weitergereicht: nicht die eigenen Folge-Updates und keine
-- Löschungen per Cascade. Bei einer Cascade ist die Challenge, das Wochenziel
-- oder das Profil schon weg; dann bleiben die Zeilen in anderen Challenges.
create or replace function public.sync_log_siblings() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    if not exists (select 1 from weekly_challenges wc where wc.id = old.challenge_id)
       or not exists (select 1 from competitions c where c.id = old.competition_id)
       or not exists (select 1 from profiles p where p.id = old.user_id) then
      return null;
    end if;
    delete from sets where log_id = old.log_id and user_id = old.user_id and id <> old.id;
  elsif (new.reps, new.created_at, new.note) is distinct from (old.reps, old.created_at, old.note) then
    update sets set reps = new.reps, created_at = new.created_at, note = new.note
    where log_id = new.log_id and user_id = new.user_id and id <> new.id;
  end if;
  return null;
end $$;
drop trigger if exists sync_log_siblings on sets;
create trigger sync_log_siblings after update or delete on sets
  for each row execute function public.sync_log_siblings();

-- ─── Freies Training: Solo-Challenge ────────────────────────────────────────
alter table competitions drop constraint if exists competitions_mode_check;
alter table competitions add constraint competitions_mode_check check (mode in ('1v1','2v2','ffa','solo'));
create unique index if not exists competitions_one_solo_idx on competitions(created_by) where mode = 'solo';

-- Konto löschen: Ersteller darf wegfallen (Challenge bleibt für die anderen).
alter table competitions alter column created_by drop not null;
alter table competitions drop constraint if exists competitions_created_by_fkey;
alter table competitions add constraint competitions_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- Der Code ist lang und zufällig, damit niemand der Solo-Challenge beitreten kann.
create or replace function public.ensure_solo_competition() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select c.id into v_id from competitions c where c.mode = 'solo' and c.created_by = v_uid;
  if v_id is not null then return v_id; end if;
  insert into competitions (name, emoji, mode, invite_code, created_by)
  values ('Freies Training', '🏋️', 'solo', 'SOLO-' || upper(replace(gen_random_uuid()::text, '-', '')), v_uid)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from competitions c where c.mode = 'solo' and c.created_by = v_uid;
    return v_id;
  end if;
  insert into competition_members (competition_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;

-- ─── Loggen ─────────────────────────────────────────────────────────────────
-- Ein Satz auf ein Wochenziel. Bei gewerteten Übungen zusätzlich in jeder
-- anderen aktiven Challenge, die die Übung in derselben Woche hat (außer p_skip).
create or replace function public.log_set(
  p_challenge uuid, p_reps int, p_note text default null,
  p_created_at timestamptz default null, p_skip uuid[] default '{}'
) returns sets
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_ch weekly_challenges;
  v_ranked boolean;
  v_log uuid := gen_random_uuid();
  v_at timestamptz := coalesce(p_created_at, now());
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_row sets;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_reps is null or p_reps <= 0 then raise exception 'invalid_value'; end if;
  select * into v_ch from weekly_challenges where id = p_challenge;
  if not found or not is_member(v_ch.competition_id) then raise exception 'forbidden'; end if;

  insert into sets (challenge_id, competition_id, user_id, reps, note, created_at, log_id)
  values (v_ch.id, v_ch.competition_id, v_uid, p_reps, v_note, v_at, v_log)
  returning * into v_row;

  select coalesce(c.ranked, false) into v_ranked from categories c where c.id = v_ch.category_id;
  if v_ranked then
    insert into sets (challenge_id, competition_id, user_id, reps, note, created_at, log_id)
    select wc.id, wc.competition_id, v_uid, p_reps, v_note, v_at, v_log
    from weekly_challenges wc
    join competitions c on c.id = wc.competition_id and c.mode <> 'solo' and c.archived_at is null
    join competition_members m on m.competition_id = wc.competition_id and m.user_id = v_uid and m.left_at is null
    where wc.category_id = v_ch.category_id
      and wc.week_start = v_ch.week_start
      and wc.competition_id <> v_ch.competition_id
      and not (wc.competition_id = any(coalesce(p_skip, '{}'::uuid[])));
  end if;
  return v_row;
end $$;

-- Aus der Rangliste: erste passende Challenge der Woche, sonst Freies Training.
create or replace function public.log_free_set(
  p_category text, p_reps int, p_note text default null, p_created_at timestamptz default null
) returns sets
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz := coalesce(p_created_at, now());
  v_week date := date_trunc('week', v_at at time zone 'Europe/Berlin')::date;
  v_cat categories;
  v_ch uuid;
  v_solo uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_cat from categories where id::text = p_category;
  if not found or not v_cat.ranked then raise exception 'not_ranked'; end if;

  select wc.id into v_ch
  from weekly_challenges wc
  join competitions c on c.id = wc.competition_id and c.mode <> 'solo' and c.archived_at is null
  join competition_members m on m.competition_id = c.id and m.user_id = v_uid and m.left_at is null
  where wc.category_id = v_cat.id and wc.week_start = v_week
  order by c.created_at, c.id
  limit 1;

  if v_ch is null then
    v_solo := ensure_solo_competition();
    insert into weekly_challenges (competition_id, week_start, category_id, target_reps, chosen_by_user)
    values (v_solo, v_week, v_cat.id, 1, v_uid)
    on conflict do nothing;
    select wc.id into v_ch from weekly_challenges wc
    where wc.competition_id = v_solo and wc.week_start = v_week and wc.category_id = v_cat.id;
  end if;
  return log_set(v_ch, p_reps, p_note, v_at, '{}'::uuid[]);
end $$;

-- Wohin ein Satz dieser Übung in dieser Woche geht (für „Zählt für: …“).
create or replace function public.log_targets(p_category text, p_week date)
returns table (competition_id uuid, name text, emoji text, challenge_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.name, c.emoji, wc.id
  from weekly_challenges wc
  join competitions c on c.id = wc.competition_id and c.mode <> 'solo' and c.archived_at is null
  join competition_members m on m.competition_id = c.id and m.user_id = auth.uid() and m.left_at is null
  where wc.category_id::text = p_category and wc.week_start = p_week
  order by c.created_at, c.id
$$;

-- ─── Rangliste: Tabellen ────────────────────────────────────────────────────
create table if not exists ranking_settings (
  id          int primary key default 1 check (id = 1),
  start_month date not null
);
insert into ranking_settings (id, start_month) values (1, date '2026-11-01') on conflict (id) do nothing;
alter table ranking_settings enable row level security;
drop policy if exists ranking_settings_select on ranking_settings;
create policy ranking_settings_select on ranking_settings for select to authenticated using (true);

-- null = noch nicht gefragt
alter table profiles add column if not exists ranking_opt_in boolean;

-- Admins prüfen Meldungen. Eigene Tabelle, weil profiles vom User selbst
-- beschreibbar ist. Keine Policies: Zugriff nur über die Funktionen unten.
create table if not exists ranking_admins (
  user_id uuid primary key references profiles(id) on delete cascade
);
alter table ranking_admins enable row level security;
insert into ranking_admins (user_id)
select id from profiles where legacy_athlete in ('Benny', 'Jonas')
on conflict do nothing;

create table if not exists monthly_results (
  month       date not null,                 -- 1. des Monats
  category_id text not null,                 -- categories.id als Text
  user_id     uuid not null references profiles(id) on delete cascade,
  value       int  not null,
  rank        int  not null,
  points      int  not null default 0,
  medal       text check (medal in ('gold','silver','bronze')),
  primary key (month, category_id, user_id)
);
create index if not exists monthly_results_user_idx on monthly_results(user_id);
alter table monthly_results enable row level security;

create table if not exists month_closures (
  month     date primary key,
  closed_at timestamptz not null default now()
);
alter table month_closures enable row level security;

create table if not exists ranking_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references profiles(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  category_id text,
  month       date,
  reason      text not null check (reason in ('values','profile')),
  resolution  text check (resolution in ('ok','removed')),
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists ranking_reports_once_idx on ranking_reports (
  reporter, user_id, reason, coalesce(category_id, ''), coalesce(month, date '1900-01-01')
) where resolved_at is null;
create index if not exists ranking_reports_user_idx on ranking_reports(user_id);
alter table ranking_reports enable row level security;

create table if not exists user_blocks (
  blocker    uuid not null references profiles(id) on delete cascade,
  blocked    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table user_blocks enable row level security;
drop policy if exists mu_own on user_blocks;
create policy mu_own on user_blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

-- ─── Rangliste: Rechnung ────────────────────────────────────────────────────
create or replace function public.ranking_points(p_rank int) returns int
language sql immutable as $$
  select coalesce((array[25, 18, 15, 12, 10, 8, 6, 4, 2, 1])[p_rank], 0)
$$;

-- Ausgeblendet: Profil oder Eintrag vom Admin entfernt, oder 3 offene
-- Meldungen von verschiedenen Leuten zu diesem Eintrag.
create or replace function public.ranking_hidden(p_user uuid, p_category text, p_month date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from ranking_reports r
    where r.user_id = p_user and r.resolution = 'removed'
      and (r.reason = 'profile' or (r.category_id = p_category and r.month = p_month))
  ) or (
    select count(distinct r.reporter) from ranking_reports r
    where r.user_id = p_user and r.reason = 'values' and r.resolved_at is null
      and r.category_id = p_category and r.month = p_month
  ) >= 3
$$;

-- Rohwerte aller User für einen Monat (Berlin), jede log_id einmal.
create or replace function public.ranking_values(p_month date, p_exclude_log uuid default null)
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
      and s.created_at >= (p_month::timestamp at time zone 'Europe/Berlin')
      and s.created_at <  ((p_month + interval '1 month')::timestamp at time zone 'Europe/Berlin')
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

-- Gewertete Liste: nur mit Zustimmung, ohne ausgeblendete Einträge.
create or replace function public.ranking_live(p_month date, p_exclude_log uuid default null)
returns table (category_id text, user_id uuid, value int, rank int, points int)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.category_id, v.user_id, v.value,
    (rank() over w)::int,
    ranking_points((rank() over w)::int)
  from ranking_values(p_month, p_exclude_log) v
  join profiles p on p.id = v.user_id and p.ranking_opt_in
  where v.value > 0 and not ranking_hidden(v.user_id, v.category_id, p_month)
  window w as (partition by v.category_id order by v.value desc)
$$;

-- Monatsliste für die App. Abgeschlossene Monate kommen aus monthly_results.
-- Werde ich selbst nicht gewertet, kommt meine Zeile mit counted = false und
-- dem Platz, auf dem ich stünde.
create or replace function public.ranking_month(p_month date)
returns table (category_id text, user_id uuid, display_name text, avatar_url text, color text,
               value int, rank int, points int, counted boolean, is_me boolean, is_mine boolean, blocked boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_closed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_closed := exists (select 1 from month_closures mc where mc.month = p_month);
  return query
  with board as (
    select r.category_id, r.user_id, r.value, r.rank, r.points
    from monthly_results r
    join profiles p on p.id = r.user_id and p.ranking_opt_in
    where v_closed and r.month = p_month and not ranking_hidden(r.user_id, r.category_id, p_month)
    union all
    select l.category_id, l.user_id, l.value, l.rank, l.points
    from ranking_live(p_month, null) l
    where not v_closed
  ),
  mine as (
    select v.category_id, v.user_id, v.value
    from ranking_values(p_month, null) v
    where not v_closed and v.user_id = v_uid and v.value > 0
      and not exists (select 1 from board b where b.user_id = v_uid and b.category_id = v.category_id)
  )
  select b.category_id, b.user_id, p.display_name, p.avatar_url, p.color,
    b.value, b.rank, b.points, true, b.user_id = v_uid, shares_competition(b.user_id),
    exists (select 1 from user_blocks x where x.blocker = v_uid and x.blocked = b.user_id)
  from board b join profiles p on p.id = b.user_id
  union all
  select m.category_id, m.user_id, p.display_name, p.avatar_url, p.color,
    m.value, (1 + (select count(*) from board b where b.category_id = m.category_id and b.value > m.value))::int,
    0, false, true, true, false
  from mine m join profiles p on p.id = m.user_id;
end $$;

-- Saison/Ewig: Summen pro User und Übung aus den abgeschlossenen Monaten.
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
    r.user_id = auth.uid(), shares_competition(r.user_id),
    exists (select 1 from user_blocks x where x.blocker = auth.uid() and x.blocked = r.user_id)
  from monthly_results r
  join profiles p on p.id = r.user_id
  where auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and not ranking_hidden(r.user_id, r.category_id, r.month)
    and (p_from is null or r.month >= p_from)
    and (p_to is null or r.month <= p_to)
  group by r.category_id, r.user_id, p.display_name, p.avatar_url, p.color
$$;

-- Medaillen und Punkte einer Person (Profilkarte, Trophäenschrank).
create or replace function public.ranking_profile(p_user uuid)
returns table (month date, category_id text, value int, rank int, points int, medal text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.month, r.category_id, r.value, r.rank, r.points, r.medal
  from monthly_results r
  join profiles p on p.id = r.user_id
  where r.user_id = p_user and auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and r.points > 0
    and not ranking_hidden(r.user_id, r.category_id, r.month)
  order by r.month desc, r.rank
$$;

-- Saisonsieger (Punkte im Kalenderjahr) pro Übung und gesamt (category_id null),
-- sobald der Dezember abgeschlossen ist.
create or replace function public.season_champions()
returns table (year int, category_id text, user_id uuid, points int)
language sql stable security definer set search_path = public, pg_temp as $$
  with yearly as (
    select extract(year from r.month)::int as year, r.category_id, r.user_id, sum(r.points)::int as pts
    from monthly_results r group by 1, 2, 3
    union all
    select extract(year from r.month)::int, null, r.user_id, sum(r.points)::int
    from monthly_results r group by 1, 3
  ),
  ranked as (
    select y.*, rank() over (partition by y.year, y.category_id order by y.pts desc) as rk
    from yearly y where y.pts > 0
  )
  select k.year, k.category_id, k.user_id, k.pts
  from ranked k
  join profiles p on p.id = k.user_id and (p.ranking_opt_in or p.id = auth.uid())
  where k.rk = 1 and auth.uid() is not null
    and exists (select 1 from month_closures mc where mc.month = make_date(k.year, 12, 1))
$$;

-- ─── Monatsabschluss ────────────────────────────────────────────────────────
create or replace function public.close_month(p_month date) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if p_month <> date_trunc('month', p_month)::date then raise exception 'invalid_month'; end if;
  insert into month_closures (month) values (p_month) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return 0; end if;
  insert into monthly_results (month, category_id, user_id, value, rank, points, medal)
  select p_month, l.category_id, l.user_id, l.value, l.rank, l.points,
    case l.rank when 1 then 'gold' when 2 then 'silver' when 3 then 'bronze' end
  from ranking_live(p_month, null) l;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Schließt alle fälligen Monate ab start_month: fällig ab dem 2. des
-- Folgemonats, 12:00 Berlin. Idempotent; darf auch die App aufrufen.
create or replace function public.close_due_months() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start date;
  v_m date;
  v_now timestamp := now() at time zone 'Europe/Berlin';
  v_total int := 0;
begin
  select s.start_month into v_start from ranking_settings s where s.id = 1;
  if v_start is null then return 0; end if;
  v_m := date_trunc('month', v_start)::date;
  while v_m + interval '1 month' + interval '1 day 12 hours' <= v_now loop
    v_total := v_total + close_month(v_m);
    v_m := (v_m + interval '1 month')::date;
  end loop;
  return v_total;
end $$;

-- ─── Melden, Blockieren, Admin ──────────────────────────────────────────────
create or replace function public.is_ranking_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from ranking_admins a where a.user_id = auth.uid())
$$;

create or replace function public.report_ranking_entry(
  p_user uuid, p_reason text, p_category text default null, p_month date default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user = auth.uid() then raise exception 'forbidden'; end if;
  if p_reason not in ('values', 'profile') then raise exception 'invalid_reason'; end if;
  insert into ranking_reports (reporter, user_id, reason, category_id, month)
  values (auth.uid(), p_user, p_reason,
          case when p_reason = 'values' then p_category end,
          case when p_reason = 'values' then p_month end)
  on conflict do nothing;
end $$;

create or replace function public.set_block(p_user uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user = auth.uid() then raise exception 'forbidden'; end if;
  if p_blocked then
    insert into user_blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  else
    delete from user_blocks where blocker = auth.uid() and blocked = p_user;
  end if;
end $$;

-- Blockierte mit Namen (profiles ist für Fremde sonst nicht lesbar).
create or replace function public.my_blocks()
returns table (user_id uuid, display_name text, avatar_url text, color text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.avatar_url, p.color
  from user_blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc
$$;

create or replace function public.ranking_reports_open()
returns table (user_id uuid, display_name text, avatar_url text, color text,
               reason text, category_id text, month date, reporters int, first_at timestamptz, hidden boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not is_ranking_admin() then raise exception 'forbidden'; end if;
  return query
  select r.user_id, p.display_name, p.avatar_url, p.color, r.reason, r.category_id, r.month,
    count(distinct r.reporter)::int, min(r.created_at),
    ranking_hidden(r.user_id, coalesce(r.category_id, ''), coalesce(r.month, date '1900-01-01'))
  from ranking_reports r join profiles p on p.id = r.user_id
  where r.resolved_at is null
  group by r.user_id, p.display_name, p.avatar_url, p.color, r.reason, r.category_id, r.month
  order by min(r.created_at);
end $$;

-- ok: Meldungen erledigt, Eintrag bleibt. removed: Eintrag (bzw. bei
-- Profil-Meldungen der User) verschwindet aus allen Listen.
create or replace function public.resolve_ranking_reports(
  p_user uuid, p_reason text, p_category text, p_month date, p_resolution text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_ranking_admin() then raise exception 'forbidden'; end if;
  if p_resolution not in ('ok', 'removed') then raise exception 'invalid_resolution'; end if;
  update ranking_reports r
  set resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now()
  where r.user_id = p_user and r.reason = p_reason and r.resolved_at is null
    and r.category_id is not distinct from p_category and r.month is not distinct from p_month;
  if p_resolution = 'removed' and p_reason = 'profile' then
    update profiles set avatar_url = null where id = p_user;
  end if;
end $$;

-- ─── Konto löschen ──────────────────────────────────────────────────────────
-- Austritt aus allen Challenges (Owner-Rolle geht an das älteste Mitglied),
-- leere Challenges inkl. Freiem Training verschwinden, dann der Auth-User.
-- profiles und alle eigenen Daten folgen per Cascade.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  for r in select m.competition_id from competition_members m where m.user_id = v_uid and m.left_at is null loop
    perform remove_member(r.competition_id, v_uid);
  end loop;
  delete from competitions c
  where c.created_by = v_uid
    and not exists (select 1 from competition_members m where m.competition_id = c.id and m.left_at is null);
  update competitions c
  set created_by = (select m.user_id from competition_members m
                    where m.competition_id = c.id and m.role = 'owner' and m.left_at is null limit 1)
  where c.created_by = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- ─── Push-Hilfe (notify-set): wen hat dieser Satz überholt? ─────────────────
-- Ausgewertet wird nur die erste Zeile einer log_id. Geliefert werden alle,
-- die vorher gleichauf oder vor mir lagen und jetzt hinter mir sind, solange
-- sie in den Top 10 waren und mich nicht blockiert haben.
create or replace function public.ranking_overtaken(p_set uuid)
returns table (user_id uuid, category_id text, category_name text, sender_name text, new_rank int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_s sets;
  v_cat categories;
  v_month date;
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
  v_month := date_trunc('month', v_s.created_at at time zone 'Europe/Berlin')::date;
  if exists (select 1 from month_closures mc where mc.month = v_month) then return; end if;

  select l.value into v_new from ranking_live(v_month, null) l
  where l.user_id = v_s.user_id and l.category_id = v_cat.id::text;
  select v.value into v_old from ranking_values(v_month, v_s.log_id) v
  where v.user_id = v_s.user_id and v.category_id = v_cat.id::text;
  v_old := coalesce(v_old, 0);
  if v_new is null or v_new <= v_old then return; end if;

  return query
  select l.user_id, v_cat.id::text, v_cat.name,
    (select p.display_name from profiles p where p.id = v_s.user_id), l.rank
  from ranking_live(v_month, null) l
  where l.category_id = v_cat.id::text and l.user_id <> v_s.user_id
    and l.value >= v_old and l.value < v_new and l.rank <= 11
    and not exists (select 1 from user_blocks b where b.blocker = l.user_id and b.blocked = v_s.user_id);
end $$;

-- ─── Rechte ─────────────────────────────────────────────────────────────────
revoke execute on function public.ensure_solo_competition() from public, anon, authenticated;
revoke execute on function public.ranking_hidden(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.ranking_values(date, uuid) from public, anon, authenticated;
revoke execute on function public.ranking_live(date, uuid) from public, anon, authenticated;
revoke execute on function public.close_month(date) from public, anon, authenticated;
revoke execute on function public.ranking_overtaken(uuid) from public, anon, authenticated;
grant execute on function public.ranking_values(date, uuid) to service_role;
grant execute on function public.ranking_live(date, uuid) to service_role;
grant execute on function public.close_month(date) to service_role;
grant execute on function public.ranking_overtaken(uuid) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.log_set(uuid, int, text, timestamptz, uuid[])',
    'public.log_free_set(text, int, text, timestamptz)',
    'public.log_targets(text, date)',
    'public.ranking_month(date)',
    'public.ranking_totals(date, date)',
    'public.ranking_profile(uuid)',
    'public.season_champions()',
    'public.close_due_months()',
    'public.is_ranking_admin()',
    'public.report_ranking_entry(uuid, text, text, date)',
    'public.set_block(uuid, boolean)',
    'public.my_blocks()',
    'public.ranking_reports_open()',
    'public.resolve_ranking_reports(uuid, text, text, date, text)',
    'public.delete_my_account()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.close_due_months() to service_role;

commit;

-- ─── Monatsabschluss per pg_cron (stündlich, idempotent) ────────────────────
-- Außerhalb der Transaktion: Ist pg_cron nicht verfügbar, bleibt der Rest
-- trotzdem eingespielt. Die App ruft close_due_months() zusätzlich beim Öffnen
-- der Rangliste auf.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron nicht verfügbar (%). Monatsabschluss läuft dann über die App.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ranking-close-months', '5 * * * *', 'select public.close_due_months()');
  end if;
exception when others then
  raise notice 'Cron-Job nicht angelegt: %', sqlerrm;
end $$;
