-- Work mode is unavailable in the public release, including for older clients.
-- Keep all existing categories, challenges and logged history intact.
begin;

create or replace function public.disable_competition_work_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.work_enabled := false;
  return new;
end;
$$;

revoke all on function public.disable_competition_work_mode() from public, anon, authenticated;

drop trigger if exists competitions_disable_work_mode on public.competitions;
create trigger competitions_disable_work_mode
before insert or update of work_enabled on public.competitions
for each row execute function public.disable_competition_work_mode();

update public.competitions set work_enabled = false where work_enabled;

commit;
