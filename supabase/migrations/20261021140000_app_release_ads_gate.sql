-- A server-controlled release switch. The first release stays ad-free;
-- enable only after payment setup, consent QA and Google's approval.
begin;

create table if not exists public.app_release_settings (
  id smallint primary key default 1,
  ads_enabled boolean not null default false,
  constraint app_release_settings_singleton check (id = 1)
);

alter table public.app_release_settings enable row level security;

revoke all on table public.app_release_settings from public, anon, authenticated;
grant select on table public.app_release_settings to anon, authenticated;
grant all on table public.app_release_settings to service_role;

drop policy if exists app_release_settings_read on public.app_release_settings;
create policy app_release_settings_read on public.app_release_settings
  for select to anon, authenticated using (id = 1);

insert into public.app_release_settings (id, ads_enabled)
values (1, false)
on conflict (id) do nothing;

commit;
