-- Onboarding-Stand fürs Konto (Spec: docs/superpowers/specs/2026-10-20-onboarding-design.md)
--
-- NICHT automatisch anwenden: Der Nutzer spielt die Migration selbst ein. Die App
-- erkennt die Spalte am geladenen Profil (`'onboarding' in profile`) und schreibt
-- ohne sie nur in localStorage — vorher und nachher funktioniert alles.
--
-- Inhalt (alles optional, Zeitstempel als ISO-Text):
--   started      – neues Onboarding begonnen (Registrierung bzw. erster Start ohne Challenge)
--   profileDone  – Profilschritt erledigt
--   dismissed    – { <competition_id>: Zeitstempel } weggetippte Startkarten
--   weekOne      – { <competition_id>: <Montag der ersten Woche> } gesehene Wochenrückblicke
-- Bestehende Zeilen bekommen '{}' und damit kein neues Verhalten.

begin;

alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_onboarding_size;
alter table public.profiles
  add constraint profiles_onboarding_size
  check (jsonb_typeof(onboarding) = 'object' and pg_column_size(onboarding) <= 8192);

-- Spaltenrecht wie in Migration A2: die App ändert nur freigegebene Spalten.
grant update (onboarding) on public.profiles to authenticated;

commit;
