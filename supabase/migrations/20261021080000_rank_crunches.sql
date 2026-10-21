-- Monatsrangliste: Crunches stehen im Katalog der Live-Datenbank, waren aber
-- nicht in der Liste der Migration monthly_ranking. Gleiche Regeln wie Sit-ups.
update categories
set ranked = true, metric = 'volume', max_per_day = 1000,
    rule = 'Schulterblätter vom Boden, Hände nicht am Kopf ziehen.'
where competition_id is null and lower(name) = 'crunches';
