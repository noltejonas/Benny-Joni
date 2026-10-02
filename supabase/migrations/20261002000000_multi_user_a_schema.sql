-- Multi-User Challenges — Migration A (additiv)
-- Spec: docs/superpowers/specs/2026-10-02-multi-user-challenges-design.md
--
-- Legt Profile, Challenges (Tabelle `competitions`) und Mitgliedschaften an und
-- erweitert alle bestehenden Tabellen um competition_id / user_id.
--
-- Die installierte App (anon, ohne Login) läuft danach weiter:
--   * Rolle `anon` sieht nur noch Legacy-Daten (competition_id null bzw. die
--     Benny-vs-Jonas-Challenge nach Migration B).
--   * Bridge-Trigger übersetzen athlete-Namen <-> user_id, solange beide
--     App-Versionen parallel im Einsatz sind.
-- Die neue App (Rolle `authenticated`) sieht ausschließlich Challenges, in
-- denen der User Mitglied ist (Policies mit Präfix mu_).

begin;

-- ─── Hilfsfunktion: Unique-Constraint anhand der Spalten finden & droppen ──
create or replace function pg_temp.drop_unique(p_tbl regclass, p_cols text[]) returns void
language plpgsql as $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = p_tbl and c.contype in ('u','p')
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
          = (select array_agg(x order by x) from unnest(p_cols) x)
  loop
    execute format('alter table %s drop constraint %I', p_tbl, r.conname);
  end loop;
end $$;

-- ─── Profile ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 30),
  avatar_url          text,
  color               text not null default '#32d74b',
  main_competition_id uuid,
  legacy_athlete      text unique references athletes(name),
  created_at          timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Athlet'), 30)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Accounts, die schon vor dieser Migration existieren, bekommen nachträglich ein Profil.
insert into profiles (id, display_name)
select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1), 'Athlet'), 30)
from auth.users u
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Challenges ─────────────────────────────────────────────────────────────
create table if not exists competitions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 40),
  emoji             text not null default '💪',
  mode              text not null check (mode in ('1v1','2v2','ffa')),
  invite_code       text not null unique,
  rotation_enabled  boolean not null default false,
  penalties_enabled boolean not null default false,
  work_enabled      boolean not null default false,
  start_date        date not null default current_date,
  end_date          date,
  archived_at       timestamptz,
  legacy_key        text unique,          -- 'benny-jonas' für die migrierte Challenge
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);

create table if not exists competition_members (
  competition_id uuid not null references competitions(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  role           text not null default 'member' check (role in ('owner','member')),
  team           text check (team in ('A','B')),
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,
  primary key (competition_id, user_id)
);
create index if not exists competition_members_user_idx on competition_members(user_id);

do $$ begin
  alter table profiles add constraint profiles_main_competition_fk
    foreign key (main_competition_id) references competitions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ─── Bestehende Tabellen erweitern ──────────────────────────────────────────
-- categories: null = System-Katalog, sonst eigene Kategorie einer Challenge
alter table categories add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table categories add column if not exists created_by uuid references profiles(id) on delete set null;
select pg_temp.drop_unique('categories', array['name']);
create unique index if not exists categories_scope_name_idx
  on categories (coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- weekly_challenges (= Wochenziele)
alter table weekly_challenges add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table weekly_challenges add column if not exists chosen_by_user uuid references profiles(id) on delete set null;
alter table weekly_challenges alter column chosen_by drop not null;
select pg_temp.drop_unique('weekly_challenges', array['week_start','category_id']);
create unique index if not exists weekly_challenges_scope_idx
  on weekly_challenges (coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start, category_id);
create index if not exists weekly_challenges_competition_idx on weekly_challenges(competition_id, week_start);

-- sets
alter table sets add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table sets add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table sets alter column athlete drop not null;
create index if not exists sets_competition_idx on sets(competition_id, created_at desc);
create index if not exists sets_user_idx on sets(user_id, created_at desc);

-- reactions
alter table reactions add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table reactions alter column athlete drop not null;
create unique index if not exists reactions_user_unique_idx on reactions(set_id, user_id, emoji) where user_id is not null;

-- plan_slots / rotation_config
alter table plan_slots add column if not exists competition_id uuid references competitions(id) on delete cascade;
create index if not exists plan_slots_competition_idx on plan_slots(competition_id);

alter table rotation_config add column if not exists competition_id uuid unique references competitions(id) on delete cascade;
do $$ begin
  alter table rotation_config alter column first_picker drop not null;   -- Altlast, wird nicht mehr genutzt
exception when undefined_column then null; end $$;
alter table rotation_config drop constraint if exists rotation_config_id_check;
create sequence if not exists rotation_config_id_seq start 1000;
alter table rotation_config alter column id set default nextval('rotation_config_id_seq');

-- penalty_config / penalties / week_closures / payouts
alter table penalty_config add column if not exists competition_id uuid unique references competitions(id) on delete cascade;
alter table penalty_config drop constraint if exists penalty_config_id_check;
create sequence if not exists penalty_config_id_seq start 1000;
alter table penalty_config alter column id set default nextval('penalty_config_id_seq');

alter table penalties add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table penalties add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table penalties add column if not exists paid_by_user uuid references profiles(id) on delete set null;
alter table penalties alter column athlete drop not null;
create index if not exists penalties_competition_idx on penalties(competition_id, week_start);

alter table week_closures add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table week_closures add column if not exists closed_by_user uuid references profiles(id) on delete set null;
alter table week_closures alter column closed_by drop not null;
select pg_temp.drop_unique('week_closures', array['week_start']);
create unique index if not exists week_closures_scope_idx
  on week_closures (coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);

alter table payouts add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table payouts add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table payouts alter column athlete drop not null;

-- Work-Tags pro Challenge
alter table project_tags add column if not exists competition_id uuid references competitions(id) on delete cascade;
alter table tool_tags    add column if not exists competition_id uuid references competitions(id) on delete cascade;
drop index if exists project_tags_name_idx;
drop index if exists tool_tags_name_idx;
create unique index if not exists project_tags_scope_name_idx
  on project_tags (coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create unique index if not exists tool_tags_scope_name_idx
  on tool_tags (coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

-- Push
alter table device_tokens add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table device_tokens alter column athlete drop not null;
alter table device_tokens drop constraint if exists device_tokens_platform_check;
alter table device_tokens add constraint device_tokens_platform_check check (platform in ('ios','web'));

alter table push_log add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table push_log add column if not exists competition_id uuid references competitions(id) on delete cascade;
select pg_temp.drop_unique('push_log', array['athlete','kind','day']);
alter table push_log alter column athlete drop not null;
create unique index if not exists push_log_scope_idx on push_log (
  coalesce(athlete, ''),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(competition_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind, day
);

-- ─── Helper-Funktionen für RLS ──────────────────────────────────────────────
create or replace function public.is_member(p_competition uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from competition_members
    where competition_id = p_competition and user_id = auth.uid() and left_at is null
  )
$$;

create or replace function public.is_owner(p_competition uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from competition_members
    where competition_id = p_competition and user_id = auth.uid() and role = 'owner' and left_at is null
  )
$$;

create or replace function public.shares_competition(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user = auth.uid() or exists (
    select 1
    from competition_members a
    join competition_members b on b.competition_id = a.competition_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create or replace function public.legacy_competition_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from competitions where legacy_key = 'benny-jonas'
$$;

create or replace function public.legacy_ok(p_competition uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_competition is null or p_competition = legacy_competition_id()
$$;

-- ─── Bridge-Trigger: athlete-Name <-> user_id ───────────────────────────────
create or replace function public.legacy_user_of(p_athlete text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from profiles where legacy_athlete = p_athlete
$$;

create or replace function public.legacy_name_of(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select legacy_athlete from profiles where id = p_user
$$;

create or replace function public.bridge_sets() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_id is null and new.athlete is not null then new.user_id := legacy_user_of(new.athlete); end if;
  if new.athlete is null and new.user_id is not null then new.athlete := legacy_name_of(new.user_id); end if;
  if new.competition_id is null and new.challenge_id is not null then
    select competition_id into new.competition_id from weekly_challenges where id = new.challenge_id;
  end if;
  return new;
end $$;
drop trigger if exists bridge_sets on sets;
create trigger bridge_sets before insert or update on sets
  for each row execute function public.bridge_sets();

create or replace function public.bridge_athlete_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_id is null and new.athlete is not null then new.user_id := legacy_user_of(new.athlete); end if;
  if new.athlete is null and new.user_id is not null then new.athlete := legacy_name_of(new.user_id); end if;
  return new;
end $$;
drop trigger if exists bridge_reactions on reactions;
create trigger bridge_reactions before insert or update on reactions
  for each row execute function public.bridge_athlete_user();
drop trigger if exists bridge_payouts on payouts;
create trigger bridge_payouts before insert or update on payouts
  for each row execute function public.bridge_athlete_user();
drop trigger if exists bridge_device_tokens on device_tokens;
create trigger bridge_device_tokens before insert or update on device_tokens
  for each row execute function public.bridge_athlete_user();

create or replace function public.bridge_penalties() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_id is null and new.athlete is not null then new.user_id := legacy_user_of(new.athlete); end if;
  if new.athlete is null and new.user_id is not null then new.athlete := legacy_name_of(new.user_id); end if;
  if new.paid_by_user is null and new.paid_by is not null then new.paid_by_user := legacy_user_of(new.paid_by); end if;
  if new.paid_by is null and new.paid_by_user is not null then new.paid_by := legacy_name_of(new.paid_by_user); end if;
  if new.competition_id is null and new.athlete is not null then new.competition_id := legacy_competition_id(); end if;
  return new;
end $$;
drop trigger if exists bridge_penalties on penalties;
create trigger bridge_penalties before insert or update on penalties
  for each row execute function public.bridge_penalties();

create or replace function public.bridge_week_closures() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.closed_by_user is null and new.closed_by is not null then new.closed_by_user := legacy_user_of(new.closed_by); end if;
  if new.closed_by is null and new.closed_by_user is not null then new.closed_by := legacy_name_of(new.closed_by_user); end if;
  if new.competition_id is null and new.closed_by is not null then new.competition_id := legacy_competition_id(); end if;
  return new;
end $$;
drop trigger if exists bridge_week_closures on week_closures;
create trigger bridge_week_closures before insert or update on week_closures
  for each row execute function public.bridge_week_closures();

create or replace function public.bridge_weekly_challenges() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.chosen_by_user is null and new.chosen_by is not null then new.chosen_by_user := legacy_user_of(new.chosen_by); end if;
  if new.chosen_by is null and new.chosen_by_user is not null then new.chosen_by := legacy_name_of(new.chosen_by_user); end if;
  -- Von der alten App angelegte Ziele landen in der Legacy-Challenge.
  if new.competition_id is null and new.chosen_by is not null then new.competition_id := legacy_competition_id(); end if;
  return new;
end $$;
drop trigger if exists bridge_weekly_challenges on weekly_challenges;
create trigger bridge_weekly_challenges before insert or update on weekly_challenges
  for each row execute function public.bridge_weekly_challenges();

create or replace function public.bridge_competition_default() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Alte App schreibt plan_slots / Tags ohne competition_id.
  if new.competition_id is null and auth.uid() is null then new.competition_id := legacy_competition_id(); end if;
  return new;
end $$;
drop trigger if exists bridge_plan_slots on plan_slots;
create trigger bridge_plan_slots before insert on plan_slots
  for each row execute function public.bridge_competition_default();
drop trigger if exists bridge_project_tags on project_tags;
create trigger bridge_project_tags before insert on project_tags
  for each row execute function public.bridge_competition_default();
drop trigger if exists bridge_tool_tags on tool_tags;
create trigger bridge_tool_tags before insert on tool_tags
  for each row execute function public.bridge_competition_default();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table profiles            enable row level security;
alter table competitions        enable row level security;
alter table competition_members enable row level security;

-- Alte public-Policies durch anon-only Legacy-Policies ersetzen.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('categories','weekly_challenges','sets','reactions','plan_slots','rotation_config',
                        'penalty_config','penalties','week_closures','payouts','project_tags','tool_tags','device_tokens')
      and policyname not like 'mu\_%' and policyname not like 'legacy\_%'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','weekly_challenges','plan_slots','rotation_config','penalty_config',
                           'penalties','week_closures','payouts','project_tags','tool_tags']
  loop
    execute format('drop policy if exists legacy_all on %I', t);
    execute format('create policy legacy_all on %I for all to anon using (legacy_ok(competition_id)) with check (legacy_ok(competition_id))', t);
  end loop;
end $$;

drop policy if exists legacy_all on sets;
create policy legacy_all on sets for all to anon
  using (athlete is not null and legacy_ok(competition_id))
  with check (athlete is not null and legacy_ok(competition_id));

drop policy if exists legacy_all on reactions;
create policy legacy_all on reactions for all to anon
  using (athlete is not null) with check (athlete is not null);

drop policy if exists legacy_all on device_tokens;
create policy legacy_all on device_tokens for all to anon
  using (athlete is not null) with check (athlete is not null);

-- Neue App: Mitgliedschafts-Policies
drop policy if exists mu_select on profiles;
create policy mu_select on profiles for select to authenticated using (shares_competition(id));
drop policy if exists mu_update on profiles;
create policy mu_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists mu_select on competitions;
create policy mu_select on competitions for select to authenticated using (is_member(id));
drop policy if exists mu_update on competitions;
create policy mu_update on competitions for update to authenticated using (is_owner(id)) with check (is_owner(id));

drop policy if exists mu_select on competition_members;
create policy mu_select on competition_members for select to authenticated using (is_member(competition_id));

do $$
declare t text;
begin
  foreach t in array array['weekly_challenges','plan_slots','rotation_config','penalty_config',
                           'penalties','week_closures','payouts','project_tags','tool_tags']
  loop
    execute format('drop policy if exists mu_all on %I', t);
    execute format('create policy mu_all on %I for all to authenticated using (is_member(competition_id)) with check (is_member(competition_id))', t);
  end loop;
end $$;

drop policy if exists mu_select on categories;
create policy mu_select on categories for select to authenticated
  using (competition_id is null or is_member(competition_id));
drop policy if exists mu_write on categories;
create policy mu_write on categories for all to authenticated
  using (competition_id is not null and is_member(competition_id))
  with check (competition_id is not null and is_member(competition_id));

drop policy if exists mu_select on sets;
create policy mu_select on sets for select to authenticated
  using (user_id = auth.uid() or is_member(competition_id));
drop policy if exists mu_insert on sets;
create policy mu_insert on sets for insert to authenticated
  with check (user_id = auth.uid() and is_member(competition_id));
drop policy if exists mu_update on sets;
create policy mu_update on sets for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(competition_id));
drop policy if exists mu_delete on sets;
create policy mu_delete on sets for delete to authenticated using (user_id = auth.uid());

create or replace function public.can_see_set(p_set uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from sets s where s.id = p_set and (s.user_id = auth.uid() or is_member(s.competition_id)))
$$;

drop policy if exists mu_select on reactions;
create policy mu_select on reactions for select to authenticated using (can_see_set(set_id));
drop policy if exists mu_insert on reactions;
create policy mu_insert on reactions for insert to authenticated
  with check (user_id = auth.uid() and can_see_set(set_id));
drop policy if exists mu_delete on reactions;
create policy mu_delete on reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists mu_all on device_tokens;
create policy mu_all on device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── RPCs ───────────────────────────────────────────────────────────────────
create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from competitions where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.capacity_of(p_mode text) returns int
language sql immutable as $$
  select case p_mode when '1v1' then 2 when '2v2' then 4 else 12 end
$$;

create or replace function public.create_competition(
  p_name text, p_emoji text, p_mode text,
  p_rotation boolean default false, p_penalties boolean default false, p_work boolean default false,
  p_start_date date default current_date, p_end_date date default null
) returns competitions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_row competitions;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into competitions (name, emoji, mode, invite_code, rotation_enabled, penalties_enabled, work_enabled,
                            start_date, end_date, created_by)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '💪'), p_mode, gen_invite_code(), p_rotation, p_penalties, p_work,
          coalesce(p_start_date, current_date), p_end_date, v_uid)
  returning * into v_row;

  insert into competition_members (competition_id, user_id, role, team)
  values (v_row.id, v_uid, 'owner', case when p_mode = '2v2' then 'A' end);

  insert into rotation_config (competition_id, start_date, enabled)
  values (v_row.id, date_trunc('week', coalesce(p_start_date, current_date))::date, p_rotation);
  insert into penalty_config (competition_id, enabled) values (v_row.id, p_penalties);

  update profiles set main_competition_id = coalesce(main_competition_id, v_row.id) where id = v_uid;
  return v_row;
end $$;

create or replace function public.preview_competition(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_c competitions;
begin
  select * into v_c from competitions where invite_code = upper(trim(p_code)) and archived_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_c.id, 'name', v_c.name, 'emoji', v_c.emoji, 'mode', v_c.mode,
    'capacity', capacity_of(v_c.mode),
    'already_member', is_member(v_c.id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', p.display_name, 'team', m.team, 'avatar_url', p.avatar_url, 'color', p.color)
                       order by m.joined_at)
      from competition_members m join profiles p on p.id = m.user_id
      where m.competition_id = v_c.id and m.left_at is null
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.join_competition(p_code text, p_team text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_c competitions;
  v_count int;
  v_team_count int;
  v_team text := p_team;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from competitions where invite_code = upper(trim(p_code)) and archived_at is null for update;
  if not found then raise exception 'invalid_code'; end if;
  if is_member(v_c.id) then return v_c.id; end if;

  select count(*) into v_count from competition_members where competition_id = v_c.id and left_at is null;
  if v_count >= capacity_of(v_c.mode) then raise exception 'competition_full'; end if;

  if v_c.mode = '2v2' then
    if v_team is null then
      select case when count(*) filter (where team = 'A') <= count(*) filter (where team = 'B') then 'A' else 'B' end
        into v_team from competition_members where competition_id = v_c.id and left_at is null;
    end if;
    if v_team not in ('A','B') then raise exception 'invalid_team'; end if;
    select count(*) into v_team_count from competition_members
      where competition_id = v_c.id and left_at is null and team = v_team;
    if v_team_count >= 2 then raise exception 'team_full'; end if;
  else
    v_team := null;
  end if;

  insert into competition_members (competition_id, user_id, role, team)
  values (v_c.id, v_uid, 'member', v_team)
  on conflict (competition_id, user_id) do update set left_at = null, team = excluded.team, joined_at = now();

  update profiles set main_competition_id = coalesce(main_competition_id, v_c.id) where id = v_uid;
  return v_c.id;
end $$;

create or replace function public.set_member_team(p_competition uuid, p_user uuid, p_team text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mode text; v_team_count int;
begin
  if not (is_owner(p_competition) or p_user = auth.uid()) then raise exception 'forbidden'; end if;
  select mode into v_mode from competitions where id = p_competition;
  if v_mode <> '2v2' or p_team not in ('A','B') then raise exception 'invalid_team'; end if;
  select count(*) into v_team_count from competition_members
    where competition_id = p_competition and left_at is null and team = p_team and user_id <> p_user;
  if v_team_count >= 2 then raise exception 'team_full'; end if;
  update competition_members set team = p_team where competition_id = p_competition and user_id = p_user;
end $$;

create or replace function public.remove_member(p_competition uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (is_owner(p_competition) or p_user = auth.uid()) then raise exception 'forbidden'; end if;
  update competition_members set left_at = now(), role = 'member'
    where competition_id = p_competition and user_id = p_user and left_at is null;
  update profiles set main_competition_id = null where id = p_user and main_competition_id = p_competition;
  -- Owner geht: ältestes verbleibendes Mitglied übernimmt.
  if not exists (select 1 from competition_members where competition_id = p_competition and role = 'owner' and left_at is null) then
    update competition_members set role = 'owner'
      where (competition_id, user_id) = (
        select competition_id, user_id from competition_members
        where competition_id = p_competition and left_at is null order by joined_at limit 1);
  end if;
end $$;

create or replace function public.leave_competition(p_competition uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  select remove_member(p_competition, auth.uid())
$$;

create or replace function public.regenerate_invite_code(p_competition uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text;
begin
  if not is_owner(p_competition) then raise exception 'forbidden'; end if;
  v_code := gen_invite_code();
  update competitions set invite_code = v_code where id = p_competition;
  return v_code;
end $$;

-- Tagessumme pro User in einer Challenge (Push-Function)
create or replace function public.user_reps_today(p_user uuid, p_competition uuid) returns int
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(coalesce(reps, 0)), 0)::int
  from sets
  where user_id = p_user and competition_id = p_competition
    and (created_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date
$$;

revoke execute on function public.user_reps_today(uuid, uuid) from public, anon, authenticated;
grant execute on function public.user_reps_today(uuid, uuid) to service_role;
revoke execute on function public.create_competition(text, text, text, boolean, boolean, boolean, date, date) from public, anon;
revoke execute on function public.preview_competition(text) from public, anon;
revoke execute on function public.join_competition(text, text) from public, anon;
revoke execute on function public.set_member_team(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_competition(uuid) from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.create_competition(text, text, text, boolean, boolean, boolean, date, date) to authenticated;
grant execute on function public.preview_competition(text) to authenticated;
grant execute on function public.join_competition(text, text) to authenticated;
grant execute on function public.set_member_team(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.leave_competition(uuid) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

-- ─── Avatare ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists mu_avatars_read on storage.objects;
create policy mu_avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists mu_avatars_write on storage.objects;
create policy mu_avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists mu_avatars_update on storage.objects;
create policy mu_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists mu_avatars_delete on storage.objects;
create policy mu_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Realtime ───────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['competitions','competition_members','profiles']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

commit;
