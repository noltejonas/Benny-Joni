-- Anzahl gespeicherter Workout-Durchgänge pro Person und Woche.
-- target_reps bleibt unverändert: Alte Sally-Ziele speichern hier Sekunden,
-- Tom-Holland-Ziele Runden. Bestehende Ziele verlangen weiterhin einen Lauf.
begin;

alter table public.weekly_challenges
  add column if not exists target_runs integer not null default 1
  check (target_runs >= 1);

alter table public.plan_slots
  add column if not exists target_runs integer not null default 1
  check (target_runs >= 1);

comment on column public.weekly_challenges.target_runs is
  'Workout completions required per person per week; standard repetition goals ignore this field.';
comment on column public.plan_slots.target_runs is
  'Per-person workout completions copied to weekly goals when fixing the week.';

commit;
