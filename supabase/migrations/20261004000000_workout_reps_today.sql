-- Pflicht-Workouts (Bring Sally Up, Tom Holland) speichern Sekunden bzw. Runden
-- in sets.reps. Die Push-Nachricht „Schon X Reps heute“ soll nur echte
-- Wiederholungen zählen. Sätze ohne zuordenbare Kategorie zählen wie bisher.
-- create or replace behält Owner und Grants (nur service_role darf ausführen).
create or replace function public.user_reps_today(p_user uuid, p_competition uuid) returns int
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(coalesce(s.reps, 0)), 0)::int
  from sets s
  left join weekly_challenges wc on wc.id = s.challenge_id
  left join categories c on c.id = wc.category_id
  where s.user_id = p_user and s.competition_id = p_competition
    and coalesce(c.challenge_type, 'standard') not in ('bring_sally_up', 'tom_holland')
    and (s.created_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date
$$;
