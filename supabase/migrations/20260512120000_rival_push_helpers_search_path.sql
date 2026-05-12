-- Pin search_path on the SQL helper functions so the Supabase advisor
-- stops flagging function_search_path_mutable. Same body as the original
-- migration, just with the set search_path clause added.

create or replace function public.athlete_reps_today(p_athlete text)
  returns int
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select coalesce(sum(reps), 0)::int
  from sets
  where athlete = p_athlete
    and (created_at at time zone 'Europe/Berlin')::date
        = (now() at time zone 'Europe/Berlin')::date
$$;

create or replace function public.berlin_today()
  returns date
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;
