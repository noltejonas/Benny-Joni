-- Übungskatalog: alle gängigen Calisthenics-Übungen als Standard-Übungen
--
-- Bisher gab es elf Standard-Übungen; alles andere legten die Leute als eigene
-- Übung pro Challenge an („Squats“, „Pike Push-ups“, „Wadenheben“). Eigene
-- Übungen zählen nicht für die Rangliste und heißen in jeder Challenge anders.
--
-- 1. 25 neue Standard-Übungen (gewertet, metric 'volume', Wiederholungen).
--    Erklärung, Gruppe und Strichfigur liegen in der App (www/exercises.js);
--    Namen und Regeln hier müssen zu den Einträgen dort passen.
-- 2. exercise_aliases: Synonyme („squats“ → Kniebeugen). guard_catalog_names
--    lässt keine eigene Wiederholungs-Übung mit so einem Namen mehr zu, alte
--    App-Versionen bekommen die bekannte Meldung catalog_name.
-- 3. Vereinheitlichen: eigene Wiederholungs-Übungen mit Synonym-Namen werden
--    auf die Standard-Übung umgehängt (Wochenziele und Rotationsplan), die
--    leere eigene Kategorie fällt weg. Sätze hängen am Wochenziel und ziehen
--    mit. Abgeschlossene Ranglisten-Wochen (weekly_results) bleiben, wie sie
--    sind; die laufende Woche zählt die umgehängten Sätze mit.
--    Gibt es in derselben Woche schon ein Ziel mit der Standard-Übung, bleibt
--    die eigene Übung stehen (Hinweis per raise notice).
--
-- Pflicht-Workouts (Bring Sally Up, 20-Min-AMRAP) bekommen keine Synonyme.
-- Halte-Übungen (Plank, L-Sit, Handstand) fehlen bewusst: Die Rangliste zählt
-- Wiederholungen, Sekunden bräuchten eine eigene Einheit.
-- Voraussetzung: 20261020120000_monthly_ranking.sql (ranked, metric, rule).

begin;

-- ─── 1. Neue Standard-Übungen ───────────────────────────────────────────────
insert into categories (name, emoji, kind, challenge_type, ranked, metric, max_per_day, rule)
values
  ('Knie-Liegestütze', '🧎', 'sports', 'standard', true, 'volume', 1000, 'Knie am Boden, Brust fast am Boden, oben Arme ganz gestreckt.'),
  ('Diamond Push-ups', '💎', 'sports', 'standard', true, 'volume', 600, 'Hände bilden unter der Brust eine Raute, Brust fast an den Händen.'),
  ('Pike Push-ups', '🔺', 'sports', 'standard', true, 'volume', 500, 'Hüfte hoch wie ein umgedrehtes V, Kopf bis kurz vor den Boden.'),
  ('Decline Push-ups', '📐', 'sports', 'standard', true, 'volume', 600, 'Füße erhöht, Brust fast am Boden, oben Arme ganz gestreckt.'),
  ('Archer Push-ups', '🏹', 'sports', 'standard', true, 'volume', 400, 'Ein Arm beugt, der andere bleibt gestreckt. Jede Seite zählt einzeln.'),
  ('Bankdips', '🪑', 'sports', 'standard', true, 'volume', 800, 'Hände hinter dir auf der Bank, Oberarme bis parallel zum Boden.'),
  ('Chin-ups', '🙌', 'sports', 'standard', true, 'volume', 400, 'Untergriff, aus dem toten Hang, Kinn über die Stange.'),
  ('Australian Pull-ups', '🦘', 'sports', 'standard', true, 'volume', 600, 'Körper gerade unter der Stange, Brust bis an die Stange.'),
  ('Archer Pull-ups', '🎯', 'sports', 'standard', true, 'volume', 200, 'Zu einer Hand ziehen, der andere Arm bleibt gestreckt. Jede Seite zählt einzeln.'),
  ('Muscle-ups', '🚀', 'sports', 'standard', true, 'volume', 150, 'Aus dem Hang über die Stange bis in den Stütz, oben Arme gestreckt.'),
  ('Kniebeugen', '🦿', 'sports', 'standard', true, 'volume', 1000, 'Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.'),
  ('Ausfallschritte', '🚶', 'sports', 'standard', true, 'volume', 1000, 'Hinteres Knie fast am Boden, Oberkörper aufrecht. Jedes Bein zählt einzeln.'),
  ('Bulgarian Split Squats', '🪜', 'sports', 'standard', true, 'volume', 600, 'Hinterer Fuß erhöht, vorderer Oberschenkel bis parallel. Jedes Bein zählt einzeln.'),
  ('Pistol Squats', '🦩', 'sports', 'standard', true, 'volume', 300, 'Auf einem Bein ganz runter, das andere Bein bleibt in der Luft. Jedes Bein zählt einzeln.'),
  ('Sprungkniebeugen', '⏫', 'sports', 'standard', true, 'volume', 600, 'Hüfte bis Kniehöhe, dann mit beiden Füßen vom Boden abspringen.'),
  ('Wadenheben', '🦶', 'sports', 'standard', true, 'volume', 1500, 'Ganz hoch auf die Zehenspitzen, unten Fersen ganz ab.'),
  ('Glute Bridges', '🌉', 'sports', 'standard', true, 'volume', 1000, 'Schultern am Boden, Hüfte hoch, bis Knie, Hüfte und Schultern eine Linie bilden.'),
  ('Nordic Curls', '❄️', 'sports', 'standard', true, 'volume', 150, 'Körper bleibt von Knie bis Kopf gerade, langsam bis ganz nach unten.'),
  ('Knee Raises', '🪝', 'sports', 'standard', true, 'volume', 600, 'Im Hang die Knie mindestens auf Hüfthöhe ziehen, ohne Schwung.'),
  ('Toes-to-Bar', '👣', 'sports', 'standard', true, 'volume', 300, 'Im Hang berühren beide Fußspitzen die Stange.'),
  ('V-ups', '✌️', 'sports', 'standard', true, 'volume', 600, 'Arme und gestreckte Beine heben, bis sich Hände und Füße treffen.'),
  ('Russian Twists', '🌀', 'sports', 'standard', true, 'volume', 1000, 'Hände tippen neben der Hüfte auf. Jede Seite zählt einzeln.'),
  ('Dragon Flags', '🐉', 'sports', 'standard', true, 'volume', 150, 'Nur die Schultern liegen auf, der Körper bleibt von Schulter bis Fuß gerade.'),
  ('Mountain Climbers', '⛰️', 'sports', 'standard', true, 'volume', 2000, 'Liegestütz-Position, Knie bis unter die Brust. Jedes Bein zählt einzeln.'),
  ('Hampelmänner', '⭐', 'sports', 'standard', true, 'volume', 3000, 'Beine auseinander und Hände über dem Kopf, dann zurück in den Stand.')
on conflict do nothing;

-- ─── 2. Synonyme ────────────────────────────────────────────────────────────
-- Schlüssel wie PTExercises._loose in der App: klein, ohne Leerzeichen,
-- Bindestriche und Unterstriche.
create or replace function public.exercise_alias_key(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(lower(trim(coalesce(p, ''))), '[[:space:]_-]+', '', 'g')
$$;

create table if not exists exercise_aliases (
  alias         text primary key,
  category_name text not null
);
alter table exercise_aliases enable row level security;
-- Nur der Trigger (security definer) liest die Tabelle.
revoke all on exercise_aliases from anon, authenticated;

insert into exercise_aliases (alias, category_name)
values
  ('liegestütze', 'Liegestütze'),
  ('liegestütz', 'Liegestütze'),
  ('liegestuetze', 'Liegestütze'),
  ('pushups', 'Liegestütze'),
  ('pushup', 'Liegestütze'),
  ('knieliegestütze', 'Knie-Liegestütze'),
  ('kneepushups', 'Knie-Liegestütze'),
  ('diamondpushups', 'Diamond Push-ups'),
  ('diamantliegestütze', 'Diamond Push-ups'),
  ('pikepushups', 'Pike Push-ups'),
  ('pikepushup', 'Pike Push-ups'),
  ('declinepushups', 'Decline Push-ups'),
  ('declinepushup', 'Decline Push-ups'),
  ('archerpushups', 'Archer Push-ups'),
  ('archerpushup', 'Archer Push-ups'),
  ('dips', 'Dips'),
  ('dip', 'Dips'),
  ('barrendips', 'Dips'),
  ('parallelbardips', 'Dips'),
  ('bankdips', 'Bankdips'),
  ('benchdips', 'Bankdips'),
  ('bankdip', 'Bankdips'),
  ('trizepsdips', 'Bankdips'),
  ('stuhldips', 'Bankdips'),
  ('hspu', 'HSPU'),
  ('handstandpushups', 'HSPU'),
  ('handstandliegestütze', 'HSPU'),
  ('klimmzüge', 'Klimmzüge'),
  ('klimmzug', 'Klimmzüge'),
  ('pullups', 'Klimmzüge'),
  ('pullup', 'Klimmzüge'),
  ('chinups', 'Chin-ups'),
  ('chinup', 'Chin-ups'),
  ('untergriffklimmzüge', 'Chin-ups'),
  ('klimmzügeuntergriff', 'Chin-ups'),
  ('australianpullups', 'Australian Pull-ups'),
  ('invertedrows', 'Australian Pull-ups'),
  ('invertedrow', 'Australian Pull-ups'),
  ('rudernamkörper', 'Australian Pull-ups'),
  ('körperrudern', 'Australian Pull-ups'),
  ('archerpullups', 'Archer Pull-ups'),
  ('archerpullup', 'Archer Pull-ups'),
  ('muscleups', 'Muscle-ups'),
  ('muscleup', 'Muscle-ups'),
  ('kniebeugen', 'Kniebeugen'),
  ('kniebeuge', 'Kniebeugen'),
  ('squats', 'Kniebeugen'),
  ('squat', 'Kniebeugen'),
  ('airsquats', 'Kniebeugen'),
  ('airsquat', 'Kniebeugen'),
  ('bodyweightsquats', 'Kniebeugen'),
  ('ausfallschritte', 'Ausfallschritte'),
  ('ausfallschritt', 'Ausfallschritte'),
  ('lunges', 'Ausfallschritte'),
  ('lunge', 'Ausfallschritte'),
  ('walkinglunges', 'Ausfallschritte'),
  ('bulgariansplitsquats', 'Bulgarian Split Squats'),
  ('bulgariansplitsquat', 'Bulgarian Split Squats'),
  ('bulgariansquats', 'Bulgarian Split Squats'),
  ('splitsquats', 'Bulgarian Split Squats'),
  ('splitsquat', 'Bulgarian Split Squats'),
  ('bulgarischekniebeugen', 'Bulgarian Split Squats'),
  ('pistolsquats', 'Pistol Squats'),
  ('pistolsquat', 'Pistol Squats'),
  ('pistols', 'Pistol Squats'),
  ('pistol', 'Pistol Squats'),
  ('einbeinigekniebeugen', 'Pistol Squats'),
  ('einbeinigekniebeuge', 'Pistol Squats'),
  ('sprungkniebeugen', 'Sprungkniebeugen'),
  ('jumpsquats', 'Sprungkniebeugen'),
  ('jumpsquat', 'Sprungkniebeugen'),
  ('squatjumps', 'Sprungkniebeugen'),
  ('squatjump', 'Sprungkniebeugen'),
  ('hocksprünge', 'Sprungkniebeugen'),
  ('wadenheben', 'Wadenheben'),
  ('calfraises', 'Wadenheben'),
  ('calfraise', 'Wadenheben'),
  ('wadenheber', 'Wadenheben'),
  ('zehenstand', 'Wadenheben'),
  ('glutebridges', 'Glute Bridges'),
  ('glutebridge', 'Glute Bridges'),
  ('beckenheben', 'Glute Bridges'),
  ('hipbridge', 'Glute Bridges'),
  ('hipbridges', 'Glute Bridges'),
  ('hipthrusts', 'Glute Bridges'),
  ('hipthrust', 'Glute Bridges'),
  ('nordiccurls', 'Nordic Curls'),
  ('nordiccurl', 'Nordic Curls'),
  ('nordichamstringcurls', 'Nordic Curls'),
  ('nordichamstringcurl', 'Nordic Curls'),
  ('nordics', 'Nordic Curls'),
  ('situps', 'Sit-ups'),
  ('situp', 'Sit-ups'),
  ('crunches', 'Crunches'),
  ('crunch', 'Crunches'),
  ('bauchpressen', 'Crunches'),
  ('legraises', 'Leg Raises'),
  ('legraise', 'Leg Raises'),
  ('beinheben', 'Leg Raises'),
  ('beineheben', 'Leg Raises'),
  ('kneeraises', 'Knee Raises'),
  ('kneeraise', 'Knee Raises'),
  ('hangingkneeraises', 'Knee Raises'),
  ('hangingkneeraise', 'Knee Raises'),
  ('knieheben', 'Knee Raises'),
  ('toestobar', 'Toes-to-Bar'),
  ('t2b', 'Toes-to-Bar'),
  ('ttb', 'Toes-to-Bar'),
  ('toestobars', 'Toes-to-Bar'),
  ('vups', 'V-ups'),
  ('vup', 'V-ups'),
  ('klappmesser', 'V-ups'),
  ('russiantwists', 'Russian Twists'),
  ('russiantwist', 'Russian Twists'),
  ('russiantwister', 'Russian Twists'),
  ('dragonflags', 'Dragon Flags'),
  ('dragonflag', 'Dragon Flags'),
  ('mountainclimbers', 'Mountain Climbers'),
  ('mountainclimber', 'Mountain Climbers'),
  ('bergsteiger', 'Mountain Climbers'),
  ('burpees', 'Burpees'),
  ('burpee', 'Burpees'),
  ('hampelmänner', 'Hampelmänner'),
  ('hampelmann', 'Hampelmänner'),
  ('jumpingjacks', 'Hampelmänner'),
  ('jumpingjack', 'Hampelmänner'),
  ('hampelmaenner', 'Hampelmänner')
on conflict (alias) do update set category_name = excluded.category_name;

create or replace function public.guard_catalog_names() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.competition_id is not null and (
    exists (
      select 1 from categories c
      where c.competition_id is null and lower(c.name) = lower(trim(new.name))
    )
    or (coalesce(new.kind, 'sports') = 'sports' and exists (
      select 1 from exercise_aliases a
      join categories c on c.competition_id is null and c.name = a.category_name
      where a.alias = exercise_alias_key(new.name)
    ))
  ) then
    raise exception 'catalog_name';
  end if;
  return new;
end $$;

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
