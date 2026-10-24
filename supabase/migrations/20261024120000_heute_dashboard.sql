-- Heute über alle Challenges, Minuten-Übungen, „Meine Leute“
--
-- Die App läuft auch ohne diese Migration (sie trägt fehlende Kopien selbst
-- ein und rechnet „Meine Leute“ selbst aus). Mit ihr stimmt der Server überein:
--
-- 1. Bearbeiten wirkt auch bei Minuten (duration_minutes) auf alle Zeilen
--    derselben log_id. Die App schreibt einen Eintrag mit gemeinsamer log_id in
--    jede Challenge mit derselben Übung (Katalog-ID oder gleicher Name bei
--    eigenen Übungen, Zeit-Übungen mit kind = 'time').
-- 2. „Meine Leute“ in der Rangliste (is_mine): alle, mit denen ich gerade in
--    einer laufenden Challenge bin. Beide aktiv (left_at null), Challenge nicht
--    archiviert, ohne Freies Training. Vorher zählte jede Challenge, die man je
--    geteilt hat, auch nach dem Austritt. shares_competition() bleibt, wie es ist
--    (Profile früherer Mitspieler bleiben sichtbar, z. B. im Feed).

begin;

-- ─── 1. Kopien mitziehen, auch Minuten ──────────────────────────────────────
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
  elsif (new.reps, new.duration_minutes, new.created_at, new.note)
        is distinct from (old.reps, old.duration_minutes, old.created_at, old.note) then
    update sets set reps = new.reps, duration_minutes = new.duration_minutes,
      created_at = new.created_at, note = new.note
    where log_id = new.log_id and user_id = new.user_id and id <> new.id;
  end if;
  return null;
end $$;

-- ─── 2. Meine Leute ─────────────────────────────────────────────────────────
create or replace function public.shares_active_competition(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user = auth.uid() or exists (
    select 1
    from competition_members a
    join competition_members b on b.competition_id = a.competition_id
    join competitions c on c.id = a.competition_id
    where a.user_id = auth.uid() and b.user_id = p_user
      and a.left_at is null and b.left_at is null
      and c.archived_at is null and c.mode <> 'solo'
  )
$$;
revoke execute on function public.shares_active_competition(uuid) from public, anon;
grant execute on function public.shares_active_competition(uuid) to authenticated;

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
    b.value, b.rank, b.points, true, b.user_id = v_uid, shares_active_competition(b.user_id),
    exists (select 1 from user_blocks x where x.blocker = v_uid and x.blocked = b.user_id)
  from board b join profiles p on p.id = b.user_id
  union all
  select m.category_id, m.user_id, p.display_name, p.avatar_url, p.color,
    m.value, (1 + (select count(*) from board b where b.category_id = m.category_id and b.value > m.value))::int,
    0, false, true, true, false
  from mine m join profiles p on p.id = m.user_id;
end $$;

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
  from monthly_results r
  join profiles p on p.id = r.user_id
  where auth.uid() is not null
    and (p.ranking_opt_in or p.id = auth.uid())
    and not ranking_hidden(r.user_id, r.category_id, r.month)
    and (p_from is null or r.month >= p_from)
    and (p_to is null or r.month <= p_to)
  group by r.category_id, r.user_id, p.display_name, p.avatar_url, p.color
$$;

commit;
