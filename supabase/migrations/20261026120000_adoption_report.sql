-- Live-Bericht für die interne Nutzerübersicht. Derselbe JSON-Vertrag wie
-- tools/adoption/report.sql; Anzeigenamen, aber keine E-Mails oder Tokens.
-- Die bestehende Adminrolle wird nur geprüft, niemals verändert.

begin;

create or replace function public.adoption_report() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_report json;
begin
  if auth.uid() is null or not coalesce(public.is_ranking_admin(), false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  with logs as (
    -- Ein Eintrag zählt über mehrere Challenges nur einmal. Für alte Zeilen
    -- ohne log_id gilt wie bei /neues die Kombination user_id + created_at.
    select distinct on (coalesce('log:' || s.log_id::text, 'legacy:' || s.user_id::text || ':' || s.created_at::text))
      s.log_id, s.user_id, s.created_at
    from public.sets s where s.user_id is not null
    order by coalesce('log:' || s.log_id::text, 'legacy:' || s.user_id::text || ':' || s.created_at::text), s.created_at, s.id
  ),
  weeks as (
    select generate_series(date_trunc('week', least((select min(created_at) from public.profiles), (select min(created_at) from logs))),
                           date_trunc('week', now()), interval '1 week')::date as week
  ),
  member_counts as (
    select competition_id, count(*) filter (where left_at is null) as members
    from public.competition_members group by competition_id
  )
  select json_build_object(
    'generated_at', now(),
    'totals', json_build_object(
      'users', (select count(*) from public.profiles),
      'active_7d', (select count(distinct user_id) from logs where created_at > now() - interval '7 days'),
      'active_prev_7d', (select count(distinct user_id) from logs
                         where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
      'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'signups_prev_7d', (select count(*) from public.profiles
                          where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
      'active_30d', (select count(distinct user_id) from logs where created_at > now() - interval '30 days'),
      'with_challenge', (select count(distinct m.user_id) from public.competition_members m join public.competitions c on c.id = m.competition_id
                         where m.left_at is null and c.archived_at is null and c.mode <> 'solo'),
      'challenges_active', (select count(*) from public.competitions where archived_at is null and mode <> 'solo'),
      'logs', (select count(*) from logs),
      'logs_7d', (select count(*) from logs where created_at > now() - interval '7 days'),
      'logs_prev_7d', (select count(*) from logs
                       where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
      'ranking_opt_in', (select count(*) from public.profiles where ranking_opt_in)
    ),
    'weeks', coalesce((select json_agg(json_build_object(
        'week', w.week,
        'signups', (select count(*) from public.profiles p where date_trunc('week', p.created_at)::date = w.week),
        'users', (select count(*) from public.profiles p where p.created_at < w.week + 7),
        'active', (select count(distinct l.user_id) from logs l where date_trunc('week', l.created_at)::date = w.week),
        'logs', (select count(*) from logs l where date_trunc('week', l.created_at)::date = w.week),
        'challenges', (select count(*) from public.competitions c where c.mode <> 'solo' and date_trunc('week', c.created_at)::date = w.week)
      ) order by w.week) from weeks w), '[]'::json),
    'users', coalesce((select json_agg(u order by u.last_activity desc nulls last) from (
      select left(p.id::text, 8) as key, p.display_name as name, p.created_at::date as joined, p.language, p.ranking_opt_in,
        coalesce((select json_agg(distinct d.platform) from public.device_tokens d where d.user_id = p.id), '[]'::json) as platforms,
        (select max(l.created_at) from logs l where l.user_id = p.id) as last_activity,
        (select count(*) from logs l where l.user_id = p.id) as logs,
        (select count(*) from logs l where l.user_id = p.id and l.created_at > now() - interval '7 days') as logs_7d,
        coalesce((select json_agg(c.name order by c.created_at) from public.competition_members m join public.competitions c on c.id = m.competition_id
          where m.user_id = p.id and m.left_at is null and c.archived_at is null and c.mode <> 'solo'), '[]'::json) as challenges
      from public.profiles p) u), '[]'::json),
    'challenges', coalesce((select json_agg(c order by c.last_activity desc nulls last) from (
      select left(c.id::text, 8) as key, c.name, c.emoji, c.mode, c.created_at::date as created, c.archived_at is not null as archived,
        coalesce(mc.members, 0) as members,
        coalesce((select json_agg(p.display_name order by m.joined_at) from public.competition_members m join public.profiles p on p.id = m.user_id
          where m.competition_id = c.id and m.left_at is null), '[]'::json) as people,
        (select count(*) from public.sets s where s.competition_id = c.id) as sets,
        (select count(*) from public.sets s where s.competition_id = c.id and s.created_at > now() - interval '7 days') as sets_7d,
        (select max(s.created_at) from public.sets s where s.competition_id = c.id) as last_activity
      from public.competitions c left join member_counts mc on mc.competition_id = c.id
      where c.mode <> 'solo') c), '[]'::json)
  ) into v_report;

  return v_report;
end $$;

revoke all on function public.adoption_report() from public, anon;
grant execute on function public.adoption_report() to authenticated;

commit;
