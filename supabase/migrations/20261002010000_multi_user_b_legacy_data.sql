-- Multi-User Challenges — Migration B (Daten Benny vs Jonas)
--
-- VORAUSSETZUNG: Migration A ist eingespielt und Benny + Jonas haben sich in
-- der neuen App-Version registriert.
--
-- Die E-Mail-Adressen unten müssen zu den registrierten Accounts passen.
-- Das Skript ist idempotent: ein zweiter Lauf ändert nichts mehr.

begin;

do $$
declare
  c_benny_email constant text := 'frey.benjamin2000@gmail.com';
  c_jonas_email constant text := 'benny.frey22@gmail.com';
  v_benny uuid;
  v_jonas uuid;
  v_comp  uuid;
  v_start date;
begin
  select id into v_benny from auth.users where lower(email) = lower(c_benny_email);
  select id into v_jonas from auth.users where lower(email) = lower(c_jonas_email);
  if v_benny is null then raise exception 'Kein Account für %', c_benny_email; end if;
  if v_jonas is null then raise exception 'Kein Account für %', c_jonas_email; end if;

  update profiles set legacy_athlete = 'Benny', display_name = 'Benny',
                      avatar_url = coalesce(avatar_url, 'uploads/benny.jpg'),
                      color = '#32d74b'
    where id = v_benny;
  update profiles set legacy_athlete = 'Jonas', display_name = 'Jonas',
                      avatar_url = coalesce(avatar_url, 'uploads/jonas.jpg'),
                      color = '#0a84ff'
    where id = v_jonas;

  select id into v_comp from competitions where legacy_key = 'benny-jonas';
  if v_comp is null then
    select coalesce(min(week_start), current_date) into v_start from weekly_challenges where competition_id is null;
    insert into competitions (name, emoji, mode, invite_code, rotation_enabled, penalties_enabled, work_enabled,
                              start_date, created_by, legacy_key)
    values ('Benny vs Jonas', '⚔️', '1v1', gen_invite_code(),
            coalesce((select enabled from rotation_config where id = 1), true),
            coalesce((select enabled from penalty_config where id = 1), false),
            exists (select 1 from categories where kind = 'work'),
            v_start, v_benny, 'benny-jonas')
    returning id into v_comp;
  end if;

  insert into competition_members (competition_id, user_id, role, joined_at)
  values (v_comp, v_benny, 'owner', (select start_date from competitions where id = v_comp)),
         (v_comp, v_jonas, 'member', (select start_date from competitions where id = v_comp))
  on conflict (competition_id, user_id) do nothing;

  update weekly_challenges set competition_id = v_comp where competition_id is null;
  update weekly_challenges set chosen_by_user = legacy_user_of(chosen_by)
    where competition_id = v_comp and chosen_by_user is null and chosen_by is not null;

  -- sets: Trigger bridge_sets füllt user_id aus athlete
  update sets set competition_id = v_comp where competition_id is null;
  update sets set user_id = legacy_user_of(athlete) where user_id is null and athlete is not null;

  update reactions set user_id = legacy_user_of(athlete) where user_id is null and athlete is not null;

  update plan_slots      set competition_id = v_comp where competition_id is null;
  update rotation_config set competition_id = v_comp where id = 1 and competition_id is null;
  update penalty_config  set competition_id = v_comp where id = 1 and competition_id is null;
  update penalties       set competition_id = v_comp where competition_id is null;
  update penalties       set user_id = legacy_user_of(athlete) where user_id is null and athlete is not null;
  update penalties       set paid_by_user = legacy_user_of(paid_by) where paid_by_user is null and paid_by is not null;
  update week_closures   set competition_id = v_comp where competition_id is null;
  update week_closures   set closed_by_user = legacy_user_of(closed_by) where closed_by_user is null and closed_by is not null;
  update payouts         set competition_id = v_comp where competition_id is null;
  update payouts         set user_id = legacy_user_of(athlete) where user_id is null and athlete is not null;
  update project_tags    set competition_id = v_comp where competition_id is null;
  update tool_tags       set competition_id = v_comp where competition_id is null;
  update device_tokens   set user_id = legacy_user_of(athlete) where user_id is null and athlete is not null;

  -- Falls die Challenge noch keine Config-Zeilen hat (z.B. id=1 fehlte)
  insert into rotation_config (competition_id, start_date, enabled)
  select v_comp, date_trunc('week', current_date)::date, true
  where not exists (select 1 from rotation_config where competition_id = v_comp);
  insert into penalty_config (competition_id, enabled)
  select v_comp, false
  where not exists (select 1 from penalty_config where competition_id = v_comp);

  update profiles set main_competition_id = v_comp where id in (v_benny, v_jonas);

  raise notice 'Benny vs Jonas: competition %', v_comp;
end $$;

-- Kontrolle: alles zugeordnet? Alle Werte sollten 0 sein.
select 'weekly_challenges ohne competition' as check, count(*) from weekly_challenges where competition_id is null
union all select 'sets ohne competition', count(*) from sets where competition_id is null
union all select 'sets ohne user', count(*) from sets where user_id is null
union all select 'reactions ohne user', count(*) from reactions where user_id is null
union all select 'penalties ohne user', count(*) from penalties where user_id is null
union all select 'plan_slots ohne competition', count(*) from plan_slots where competition_id is null;

commit;
