-- Leg Curls als Standard-Übung
--
-- Nachtrag zu 20261117120000_exercise_catalog.sql: Leg Curls (Beinbeuger,
-- an der Maschine oder mit Handtuch/Ball) als gewertete Standard-Übung, dazu
-- ihre Synonyme. Danach läuft dieselbe Vereinheitlichung wie dort: eigene
-- Wiederholungs-Übungen mit Synonym-Namen („Leg Curls“, „Beinbeuger“) werden
-- auf die Standard-Übung umgehängt. Erklärung und Figur: www/exercises.js.
-- Voraussetzung: 20261117120000_exercise_catalog.sql (exercise_aliases).

begin;

insert into categories (name, emoji, kind, challenge_type, ranked, metric, max_per_day, rule)
values
  ('Leg Curls', '🧦', 'sports', 'standard', true, 'volume', 600, 'Fersen bis nah an den Po ziehen, dann die Beine wieder ganz strecken.')
on conflict do nothing;

insert into exercise_aliases (alias, category_name)
values
  ('legcurls', 'Leg Curls'),
  ('legcurl', 'Leg Curls'),
  ('beinbeuger', 'Leg Curls'),
  ('beincurls', 'Leg Curls'),
  ('hamstringcurls', 'Leg Curls'),
  ('hamstringcurl', 'Leg Curls'),
  ('sliderlegcurls', 'Leg Curls'),
  ('slidercurls', 'Leg Curls')
on conflict (alias) do update set category_name = excluded.category_name;

-- ─── 3. Eigene Übungen auf die Standard-Übung umhängen ──────────────────────
create temp table exercise_merge on commit drop as
  select o.id as own_id, o.name as own_name, o.competition_id, k.id as catalog_id, k.name as catalog_name
  from categories o
  join exercise_aliases a on a.alias = exercise_alias_key(o.name)
  join categories k on k.competition_id is null and k.name = a.category_name
  where o.competition_id is not null
    and o.kind = 'sports'
    and coalesce(o.challenge_type, 'standard') = 'standard';

update weekly_challenges wc
set category_id = m.catalog_id
from exercise_merge m
where wc.category_id = m.own_id
  and not exists (
    select 1 from weekly_challenges x
    where x.category_id = m.catalog_id
      and coalesce(x.competition_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(wc.competition_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and x.week_start = wc.week_start
  );

update plan_slots p
set category_id = m.catalog_id
from exercise_merge m
where p.category_id = m.own_id;

delete from categories c
using exercise_merge m
where c.id = m.own_id
  and not exists (select 1 from weekly_challenges wc where wc.category_id = c.id)
  and not exists (select 1 from plan_slots p where p.category_id = c.id);

do $$
declare r record;
begin
  for r in
    select m.own_name, m.catalog_name, m.competition_id from exercise_merge m
    where exists (select 1 from categories c where c.id = m.own_id)
  loop
    raise notice 'Eigene Übung % in Challenge % bleibt (Woche mit % schon belegt)', r.own_name, r.competition_id, r.catalog_name;
  end loop;
end $$;

commit;
