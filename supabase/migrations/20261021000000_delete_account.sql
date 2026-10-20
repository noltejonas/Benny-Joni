-- Konto löschen in der App (App Store 5.1.1(v), DSGVO Art. 17)
--
-- NICHT automatisch anwenden: Die Gründer spielen die Migration selbst ein.
--   1. Supabase-Dashboard → SQL Editor → diese Datei komplett einfügen → Run.
--      Mehrfaches Ausführen ist unschädlich (idempotent, alles in einer Transaktion).
--   2. Kontrolle:
--        select proname, prosecdef from pg_proc
--         where proname in ('delete_my_account', 'prepare_account_deletion');
--      → zwei Zeilen, prosecdef = true.
--   3. Mit einem Wegwerf-Konto testen (nicht mit euren echten Konten):
--      App → registrieren → Challenge anlegen → Profilbild setzen → einen Satz loggen →
--      Einstellungen → „Konto löschen“ → zweimal bestätigen → App zeigt „Willkommen“.
--      Danach im Dashboard: Authentication → Users: Konto weg; Storage → avatars:
--      kein Ordner <uid> mehr; select count(*) from profiles where id = '<uid>' → 0.
--   4. Meldet die App „Konto konnte nicht gelöscht werden“ und steht im Postgres-Log
--      „permission denied for table users“: Edge Function deployen
--        supabase functions deploy delete-account
--      Sie ruft prepare_account_deletion() mit dem Nutzer-Token auf und löscht das Konto
--      danach mit auth.admin.deleteUser. Die App weicht bei 42501 selbst darauf aus.
--      Nennt der Fehler „objects_owner_fkey“ (alter Storage-Fremdschlüssel): die Dateien
--      im Ordner avatars/<uid>/ löschen und erneut versuchen.
--
-- Was passiert:
--   * competitions.created_by darf null werden (on delete set null). Vorher scheiterte das
--     Löschen jedes Challenge-Erstellers am Fremdschlüssel, auch im Dashboard.
--   * prepare_account_deletion(): verlässt jede aktive Challenge über remove_member()
--     (Ersteller-Rolle geht an das älteste verbleibende Mitglied, Migration A), überträgt
--     created_by an diese Person und löscht Challenges ohne verbleibende Mitglieder samt
--     Daten. Die migrierte Alt-Challenge (legacy_key) bleibt stehen.
--   * delete_my_account(): dasselbe, danach delete from auth.users. Profil, Sätze,
--     Reaktionen, Strafen, Auszahlungen, Mitgliedschaften, Push-Tokens und Push-Log hängen
--     per on delete cascade am Profil; Verweise wie chosen_by_user werden null.
--   * Profilbilder (Bucket avatars, Ordner <uid>/) löscht die App vorher über die
--     Storage-API; per SQL lässt Supabase das nicht zu.
--
-- Die Spec der Monatsrangliste plant ebenfalls „Konto löschen“: maßgeblich ist diese
-- Funktion. Weitere Tabellen mit Nutzerdaten brauchen on delete cascade auf profiles(id).

begin;

-- ─── Ersteller darf gelöscht werden ─────────────────────────────────────────
alter table public.competitions alter column created_by drop not null;

-- Jeden Fremdschlüssel auf created_by entfernen (Name unabhängig davon, wie er angelegt
-- wurde) und mit on delete set null neu anlegen.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.competitions'::regclass and c.contype = 'f'
      and a.attname = 'created_by'
  loop
    execute format('alter table public.competitions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.competitions
  add constraint competitions_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- ─── Vorbereitung: alle Challenges verlassen ────────────────────────────────
create or replace function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  for r in
    select competition_id from competition_members
    where user_id = v_uid and left_at is null
  loop
    -- Wie „Challenge verlassen“: setzt left_at, gibt die Ersteller-Rolle weiter.
    perform remove_member(r.competition_id, v_uid);

    -- Ersteller-Spalte geht an die Person, die jetzt die Rolle owner hat.
    update competitions c set created_by = m.user_id
      from competition_members m
     where c.id = r.competition_id and c.created_by = v_uid
       and m.competition_id = c.id and m.role = 'owner' and m.left_at is null;

    -- Niemand mehr aktiv: Challenge mit allen Daten löschen (Kaskade über competition_id).
    if not exists (select 1 from competition_members
                   where competition_id = r.competition_id and left_at is null) then
      delete from competitions where id = r.competition_id and legacy_key is null;
    end if;
  end loop;
end $$;

-- ─── Konto löschen ──────────────────────────────────────────────────────────
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform prepare_account_deletion();
  -- Kaskade: auth.users → profiles → competition_members, sets, reactions, penalties,
  -- payouts, device_tokens, push_log.
  delete from auth.users where id = v_uid;
end $$;

-- ─── Rechte: nur angemeldete Nutzer, nur für sich selbst (auth.uid()) ──────
revoke execute on function public.prepare_account_deletion() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

commit;
