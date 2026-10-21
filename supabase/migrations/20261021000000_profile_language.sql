-- App-Sprache pro Konto, damit Push-Mitteilungen in der Sprache der Empfänger kommen.
--
-- NICHT automatisch anwenden: Der Nutzer spielt die Migration selbst ein. Die App
-- erkennt die Spalte am geladenen Profil (`'language' in profile`) und schreibt die
-- Sprache erst dann; ohne Spalte schickt notify-set wie bisher Deutsch.
--
-- Werte: Sprachcode wie in www/i18n.js ('de', 'en'). null = noch nicht gemeldet
-- (ältere App-Version) → Deutsch.

begin;

alter table public.profiles
  add column if not exists language text;

alter table public.profiles
  drop constraint if exists profiles_language_code;
alter table public.profiles
  add constraint profiles_language_code
  check (language is null or language ~ '^[a-z]{2}$');

-- Spaltenrecht wie in Migration A2: die App ändert nur freigegebene Spalten.
grant update (language) on public.profiles to authenticated;

commit;
