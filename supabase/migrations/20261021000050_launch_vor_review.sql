-- Launch, VOR dem Review: Avatar-Listing sperren und Kategorie „Tom Holland“ umbenennen
--
-- NICHT automatisch anwenden: Die Gründer spielen die Migration selbst ein, vor der
-- Einreichung (docs/launch/MORGEN.md, Schritt 8.2b).
--   1. Supabase-Dashboard → SQL Editor → diese Datei komplett einfügen → Run.
--      Mehrfaches Ausführen ist unschädlich (idempotent, alles in einer Transaktion).
--   2. Kontrolle Kategorie: select name from categories
--        where competition_id is null and challenge_type = 'tom_holland';
--      → '20-Min-AMRAP'.
--   3. Kontrolle Avatar-Policy: select roles from pg_policies
--        where schemaname = 'storage' and policyname = 'mu_avatars_read';
--      → {authenticated}.
--   4. Test Avatar: In der App ein neues Profilbild hochladen → wird angezeigt.
--      Andere Mitglieder sehen es weiter (öffentliche URL, braucht keine SELECT-Policy).
--
-- Inhalt: wörtlich die Abschnitte 1–3 aus 20261021000100_launch_optional.sql. Die
-- Fehlerprotokoll-Tabelle (dort Abschnitt 4) kommt erst nach dem Launch.
--   1. Avatar-Bucket: höchstens 2 MB, nur JPEG/PNG/WebP (die App lädt 256-px-JPEGs
--      als image/jpeg hoch).
--   2. mu_avatars_read: nur angemeldet und nur der eigene Ordner. Vorher konnte jeder
--      (auch anon) per List-API alle Ordner und damit alle Nutzer-IDs abrufen. Das
--      widerspricht der Datenschutzerklärung. Upsert und das Aufräumen bei „Konto
--      löschen“ brauchen nur den eigenen Ordner.
--   3. Globale Kategorie „Tom Holland“ heißt „20-Min-AMRAP“ (nur competition_id is null,
--      challenge_type bleibt 'tom_holland'). Kein App-Code hängt am Namen.

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

commit;
