-- Multi-User Challenges — Migration A2 (Härtung, direkt nach A einspielen)
--
-- 1. Die Legacy-Zuordnung (profiles.legacy_athlete, competitions.legacy_key) darf
--    nur die Migration setzen. Ohne diese Einschränkung kann jeder registrierte
--    Account sie zwischen Migration A und B an sich ziehen: Sätze der alten App
--    landen dann bei ihm, und Migration B verschiebt alle Altdaten in seine
--    Challenge. Deshalb Spaltenrechte statt Tabellenrecht; die App ändert nur die
--    hier freigegebenen Spalten, alles andere läuft über die RPCs.
-- 2. week_closures und push_log haben seit Migration A keinen Primärschlüssel
--    mehr. Sind sie in der Realtime-Publication, scheitern UPDATE/DELETE (und
--    damit Migration B) ohne Replica Identity.

begin;

revoke update on public.profiles from anon, authenticated;
grant  update (display_name, avatar_url, color, main_competition_id)
  on public.profiles to authenticated;

revoke update on public.competitions from anon, authenticated;
grant  update (name, emoji, rotation_enabled, penalties_enabled, work_enabled,
               start_date, end_date, archived_at)
  on public.competitions to authenticated;

alter table public.week_closures replica identity full;
alter table public.push_log      replica identity full;

commit;
