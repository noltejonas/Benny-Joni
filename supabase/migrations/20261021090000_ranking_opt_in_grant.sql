-- Monatsrangliste: Die App setzt die Zustimmung (profiles.ranking_opt_in) selbst,
-- im Rangliste-Tab und in den Einstellungen. Seit Migration A2 darf die App nur
-- freigegebene Spalten von profiles ändern; ranking_opt_in fehlte dort.
grant update (ranking_opt_in) on public.profiles to authenticated;
