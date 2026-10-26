-- Nur auf einer lokalen/Test-Datenbank als postgres ausführen, nach Migration
-- 20261026120000. Benötigt einen vorhandenen echten ranking_admin.
-- Keine Berichte, Personenkennungen oder Namen werden ausgegeben. Synthetische
-- Fixtures und Session-Claims bleiben in dieser Transaktion und werden verworfen.

begin;

do $$
declare
  v_admin uuid;
  v_nonadmin uuid := gen_random_uuid();
begin
  select a.user_id into v_admin
  from public.ranking_admins a
  join public.profiles p on p.id = a.user_id
  join auth.users u on u.id = a.user_id
  order by a.user_id limit 1;
  if v_admin is null then
    raise exception 'Test precondition: an existing ranking admin is required';
  end if;
  if has_function_privilege('anon', 'public.adoption_report()', 'execute') then
    raise exception 'Anonymous role must not have report execution permission';
  end if;
  if not has_function_privilege('authenticated', 'public.adoption_report()', 'execute') then
    raise exception 'Authenticated role is missing report execution permission';
  end if;

  -- Der Auth-Trigger legt das synthetische Profil an; keine echten Nutzer ändern.
  insert into auth.users (id, raw_user_meta_data)
  values (v_nonadmin, jsonb_build_object('display_name', 'Adoption test nonadmin'));
  perform set_config('adoption_test.admin_id', v_admin::text, true);
  perform set_config('adoption_test.nonadmin_id', v_nonadmin::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;

set local role anon;
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.adoption_report();
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Anonymous report access was allowed'; end if;
end $$;
reset role;

set local role authenticated;
do $$
declare v_denied boolean := false;
begin
  -- Auch mit EXECUTE-Recht darf eine fehlende Nutzeridentität nicht durchkommen.
  begin
    perform public.adoption_report();
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Missing subject was allowed'; end if;
end $$;

do $$
declare
  v_uid text := current_setting('adoption_test.nonadmin_id');
  v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub', v_uid, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  begin
    perform public.adoption_report();
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Nonadmin report access was allowed'; end if;
end $$;

do $$
declare
  v_uid text := current_setting('adoption_test.admin_id');
  v_report jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_uid, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  if public.is_ranking_admin() is not true then raise exception 'Admin fixture is not authorized'; end if;
  v_report := public.adoption_report()::jsonb;
  if jsonb_typeof(v_report->'totals') is distinct from 'object'
     or jsonb_typeof(v_report->'users') is distinct from 'array'
     or jsonb_typeof(v_report->'challenges') is distinct from 'array'
     or jsonb_typeof(v_report->'weeks') is distinct from 'array'
     or v_report->>'generated_at' is null then
    raise exception 'Report JSON contract is incomplete';
  end if;
  if (v_report#>>'{totals,users}')::bigint <> jsonb_array_length(v_report->'users')
     or not exists (select 1 from jsonb_array_elements(v_report->'users') u
                    where u->>'key' = left(current_setting('adoption_test.nonadmin_id'), 8)) then
    raise exception 'Admin report does not contain the complete user list';
  end if;
  if exists (select 1 from jsonb_array_elements(v_report->'users') u
             where jsonb_typeof(u->'platforms') is distinct from 'array'
                or jsonb_typeof(u->'challenges') is distinct from 'array')
     or exists (select 1 from jsonb_array_elements(v_report->'challenges') c
                where jsonb_typeof(c->'people') is distinct from 'array') then
    raise exception 'Report contains nullable list fields';
  end if;
  perform set_config('adoption_test.users_before', v_report#>>'{totals,users}', true);
  perform set_config('adoption_test.challenges_before', jsonb_array_length(v_report->'challenges')::text, true);
end $$;
reset role;

-- Neue synthetische Anmeldung und Challenge NACH dem ersten Bericht:
-- Der nächste Aufruf muss die Änderung ohne Cache-/Artifact-Aktualisierung sehen.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_user_name text := 'Adoption test ' || left(v_user::text, 8);
  v_challenge_name text := 'Adoption test ' || left(v_challenge::text, 8);
begin
  insert into auth.users (id, raw_user_meta_data)
  values (v_user, jsonb_build_object('display_name', v_user_name));
  insert into public.competitions (id, name, mode, invite_code, created_by)
  values (v_challenge, v_challenge_name, 'ffa', v_challenge::text, v_user);
  perform set_config('adoption_test.new_user_name', v_user_name, true);
  perform set_config('adoption_test.new_challenge_name', v_challenge_name, true);
end $$;

set local role authenticated;
do $$
declare v_report jsonb;
begin
  -- Admin-Claims aus dem vorherigen Aufruf gelten weiterhin transaktionslokal.
  if public.is_ranking_admin() is not true then raise exception 'Admin subject was lost'; end if;
  v_report := public.adoption_report()::jsonb;
  if (v_report#>>'{totals,users}')::bigint <> current_setting('adoption_test.users_before')::bigint + 1
     or jsonb_array_length(v_report->'challenges') <> current_setting('adoption_test.challenges_before')::int + 1 then
    raise exception 'Report totals did not refresh after new records';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_report->'users') u
                  where u->>'name' = current_setting('adoption_test.new_user_name')
                    and u->'platforms' = '[]'::jsonb and u->'challenges' = '[]'::jsonb)
     or not exists (select 1 from jsonb_array_elements(v_report->'challenges') c
                     where c->>'name' = current_setting('adoption_test.new_challenge_name')
                       and c->'people' = '[]'::jsonb) then
    raise exception 'Report rows did not refresh or empty arrays are missing';
  end if;
end $$;
reset role;

rollback;
