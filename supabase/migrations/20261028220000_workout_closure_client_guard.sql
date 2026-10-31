-- Kompatibilität mit App-Versionen vor konfigurierbaren Workout-Durchgängen.
-- Diese alten Clients berechnen Strafen lokal und kennen target_runs nicht.
-- Sie dürfen Wochen mit mehreren Pflicht-Durchgängen deshalb nicht abschließen.
-- Neue Clients kennzeichnen beide Abschluss-Einfügepfade mit Version 2.
begin;

alter table public.week_closures
  add column if not exists workout_targets_version integer not null default 1
  check (workout_targets_version >= 1);

create or replace function public.guard_workout_closure_client()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.workout_targets_version < 2 and exists (
    select 1 from public.weekly_challenges g
    where g.competition_id = new.competition_id
      and g.week_start = new.week_start
      and g.target_runs > 1
  ) then
    raise exception using errcode = 'P0001', message = 'workout_update_required';
  end if;
  return new;
end;
$$;

-- Die Triggerfunktion wird ausschließlich durch den Datenbank-Trigger benutzt.
revoke execute on function public.guard_workout_closure_client() from public, anon, authenticated;

drop trigger if exists guard_workout_closure_client on public.week_closures;
create trigger guard_workout_closure_client
  before insert on public.week_closures
  for each row execute function public.guard_workout_closure_client();

comment on column public.week_closures.workout_targets_version is
  'Client calculation version: 2 supports per-person target_runs; older clients default to 1.';

commit;
