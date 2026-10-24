// Prüft die reinen Rechenfunktionen aus www/data.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPTData() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.window.PTData;
}
const P = loadPTData();

const cats = [
  { id: 'c-push', challenge_type: 'standard', kind: 'sports' },
  { id: 'c-sally', challenge_type: 'bring_sally_up', kind: 'sports' },
  { id: 'c-th', challenge_type: 'tom_holland', kind: 'sports' },
];
const weekChallenges = () => [
  { id: 'w-push', category_id: 'c-push', target_reps: 100 },
  { id: 'w-sally', category_id: 'c-sally', target_reps: 204 },
  { id: 'w-th', category_id: 'c-th', target_reps: 10 },
];

test('isWorkoutType erkennt nur die beiden Pflicht-Workouts', () => {
  assert.equal(P.isWorkoutType('bring_sally_up'), true);
  assert.equal(P.isWorkoutType('tom_holland'), true);
  assert.equal(P.isWorkoutType('standard'), false);
  assert.equal(P.isWorkoutType(undefined), false);
});

test('annotateWorkouts markiert Sätze und Wochen-Challenges', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', reps: 20 },
    { challenge_id: 'w-sally', reps: 180 },
    { challenge_id: 'fremd', reps: 5, category: { challenge_type: 'tom_holland' } },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  assert.deepEqual(sets.map(s => s.workout), [null, 'bring_sally_up', 'tom_holland']);
  assert.deepEqual(challenges.map(c => c.workout), [null, 'bring_sally_up', 'tom_holland']);
});

test('setValue lässt Workouts aus Summen heraus', () => {
  assert.equal(P.setValue({ reps: 20, workout: null }), 20);
  assert.equal(P.setValue({ reps: null, duration_minutes: 45, workout: null }), 45);
  assert.equal(P.setValue({ reps: 180, workout: 'bring_sally_up' }), 0);
});

test('workoutValueLabel formatiert Zeit und Runden', () => {
  assert.equal(P.workoutValueLabel('bring_sally_up', 180), '3:00');
  assert.equal(P.workoutValueLabel('bring_sally_up', 65), '1:05');
  assert.equal(P.workoutValueLabel('bring_sally_up', 204), '3:24 ✓');
  assert.equal(P.workoutValueLabel('tom_holland', 8), '8 Runden');
});

test('workoutSummary listet Durchgänge älteste zuerst', () => {
  const sets = [
    { reps: 204, created_at: '2026-10-02T18:00:00Z' },
    { reps: 180, created_at: '2026-10-01T18:00:00Z' },
  ];
  assert.equal(P.workoutSummary('bring_sally_up', sets), '2× · 3:00, 3:24 ✓');
  assert.equal(P.workoutSummary('tom_holland', []), '0×');
});

test('workoutPeopleDone zählt Personen mit mindestens einem Durchgang', () => {
  const sets = [{ athlete: 'u1' }, { athlete: 'u1' }, { athlete: 'u3' }];
  assert.equal(P.workoutPeopleDone(sets, ['u1', 'u2']), 1);
  assert.equal(P.workoutPeopleDone(sets, ['u1', 'u3']), 2);
});

const cfg = (rule_mode) => ({ rule_mode, amount_cents: 500 });

test('per_challenge: Workout erfüllt mit einem Durchgang, fehlendes kostet', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 60 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 90 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_challenge'), 2);
  // Arrays aus dem vm-Kontext haben einen eigenen Prototyp → in normale Arrays übernehmen
  assert.deepEqual([...pens.map(p => p.challenge_id)], ['w-th']);
  assert.equal(pens[0].reason, 'Pflicht-Workout fehlt');
});

test('per_week_aggregate: fehlendes Workout lässt sich nicht mit Wiederholungen ausgleichen', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 500 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 120 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2);
  assert.equal(pens.length, 1);
  assert.equal(pens[0].reason, 'Pflicht-Workout fehlt');
});

test('per_week_aggregate: Sally-Sekunden zählen nicht als Wiederholungen', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 10 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 204 },
    { challenge_id: 'w-th', athlete: 'u1', reps: 9 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2);
  assert.equal(pens.length, 1);
  assert.match(pens[0].reason, /unter dem eigenen Anteil/);
});

test('per_week_aggregate: alles erledigt ergibt keine Strafe', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 50 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 30 },
    { challenge_id: 'w-th', athlete: 'u1', reps: 4 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  assert.deepEqual([...P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2)], []);
});
