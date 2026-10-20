-- Launch, optional: NACH dem Launch einspielen (für die Einreichung nicht nötig)
--
-- NICHT automatisch anwenden: Die Gründer spielen die Migration selbst ein, wenn
-- der Launch durch ist.
--   1. Supabase-Dashboard → SQL Editor → diese Datei komplett einfügen → Run.
--      Mehrfaches Ausführen ist unschädlich (idempotent, alles in einer Transaktion).
--   2. Test Avatar: In der App ein neues Profilbild hochladen → wird angezeigt.
--      Andere Mitglieder sehen es weiter (öffentliche URL, braucht keine SELECT-Policy).
--   3. Test Kategorie: select name from categories
--        where competition_id is null and challenge_type = 'tom_holland';
--      → '20-Min-AMRAP'.
--   4. Test Fehlerprotokoll: select count(*) from client_errors; → Zahl, kein Fehler.
--      Lesen nur im Dashboard (keine SELECT-Policy für die App).
-- Abschnitte 1–3 sind identisch mit 20261021000050_launch_vor_review.sql und laufen
-- schon vor dem Review; ein erneuter Lauf schadet nicht. Nach dem Launch zählt nur
-- Abschnitt 4.
--
-- Inhalt:
--   1. Avatar-Bucket: höchstens 2 MB, nur JPEG/PNG/WebP (die App lädt image/jpeg).
--   2. mu_avatars_read: nur angemeldet und nur der eigene Ordner. Vorher konnte jeder
--      (auch anon) per List-API alle Ordner und damit alle Nutzer-IDs abrufen. Upsert
--      und das Aufräumen bei „Konto löschen“ brauchen nur den eigenen Ordner.
--   3. Globale Kategorie „Tom Holland“ heißt „20-Min-AMRAP“ (nur competition_id is null,
--      challenge_type bleibt 'tom_holland').
--   4. Tabelle client_errors: Absturzmeldungen der App (window.PTReportError, höchstens
--      5 pro Sitzung). Nur Insert für authenticated, Längen begrenzt, user_id kommt aus
--      auth.uid() und verschwindet mit dem Konto (on delete cascade). In der
--      Datenschutzerklärung erwähnen, bevor die Tabelle eingespielt wird.

begin;

-- ─── 1. Avatar-Bucket begrenzen ─────────────────────────────────────────────
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';

-- ─── 2. Kein öffentliches Listing ───────────────────────────────────────────
drop policy if exists mu_avatars_read on storage.objects;
create policy mu_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 3. Neutraler Name für das Pflicht-Workout ──────────────────────────────
update public.categories
   set name = '20-Min-AMRAP'
 where competition_id is null
   and name = 'Tom Holland'
   and not exists (
     select 1 from public.categories c
      where c.competition_id is null and lower(c.name) = lower('20-Min-AMRAP')
   );

-- ─── 4. Fehlerprotokoll der App ─────────────────────────────────────────────
create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  message     text not null check (char_length(message) <= 500),
  stack       text check (char_length(stack) <= 4000),
  context     text check (char_length(context) <= 1000),
  url         text check (char_length(url) <= 300),
  user_agent  text check (char_length(user_agent) <= 300)
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Nur einfügen, nur für sich selbst; user_id setzt der Default.
revoke all on public.client_errors from anon, authenticated;
grant insert (message, stack, context, url, user_agent) on public.client_errors to authenticated;

drop policy if exists mu_insert on public.client_errors;
create policy mu_insert on public.client_errors for insert to authenticated
  with check (user_id = auth.uid());

commit;
