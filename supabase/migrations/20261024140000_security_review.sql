-- Sicherheits-Prüfung 1.5.0
--
-- 1. ranking_week / ranking_month nehmen nur noch einen Montag bzw. Monatsersten
--    zwischen Wertungsstart und heute. Vorher ließ sich mit täglich verschobenen
--    Fenstern der Tagesverlauf jeder gewerteten Person zurückrechnen. Die Apps
--    (1.4.1 und 1.5.0) schicken ohnehin nur solche Daten.
-- 2. profiles.color nur als #RRGGBB, avatar_url nur aus dem eigenen Storage
--    (oder den mitgelieferten uploads/-Bildern). Sonst könnte ein Profil über
--    eine fremde URL in der Rangliste die IP aller Betrachter abgreifen.

begin;

CREATE OR REPLACE FUNCTION public.ranking_week(p_week date)
 RETURNS TABLE(category_id text, user_id uuid, display_name text, avatar_url text, color text, value integer, rank integer, points integer, medal text, counted boolean, is_me boolean, is_mine boolean, blocked boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_closed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Nur ganze Wochen ab Wertungsstart bis heute: beliebige Daten würden über
  -- überlappende Fenster Tageswerte einzelner Personen verraten.
  if p_week is null or p_week <> date_trunc('week', p_week)::date then raise exception 'invalid_week'; end if;
  if p_week < ranking_start_week() or p_week > date_trunc('week', now() at time zone 'Europe/Berlin')::date then return; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.ranking_month(p_month date)
 RETURNS TABLE(category_id text, user_id uuid, display_name text, avatar_url text, color text, value integer, rank integer, points integer, counted boolean, is_me boolean, is_mine boolean, blocked boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_closed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Nur ganze Monate ab Wertungsstart bis heute (wie ranking_week).
  if p_month is null or p_month <> date_trunc('month', p_month)::date then raise exception 'invalid_month'; end if;
  if p_month > date_trunc('month', now() at time zone 'Europe/Berlin')::date
     or p_month < (select date_trunc('month', s.start_month)::date from ranking_settings s where s.id = 1) then return; end if;
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
    b.value, b.rank, b.points, true, b.user_id = v_uid, shares_active_competition(b.user_id),
    exists (select 1 from user_blocks x where x.blocker = v_uid and x.blocked = b.user_id)
  from board b join profiles p on p.id = b.user_id
  union all
  select m.category_id, m.user_id, p.display_name, p.avatar_url, p.color,
    m.value, (1 + (select count(*) from board b where b.category_id = m.category_id and b.value > m.value))::int,
    0, false, true, true, false
  from mine m join profiles p on p.id = m.user_id;
end $function$;

alter table public.profiles
  add constraint profiles_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.profiles
  add constraint profiles_avatar_url_own_storage check (
    avatar_url is null
    or avatar_url like 'https://jczyyupxxqrdgbeifcwe.supabase.co/storage/v1/object/public/avatars/%'
    or avatar_url ~ '^uploads/[A-Za-z0-9._-]+$'
  );

commit;
