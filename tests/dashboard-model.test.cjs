// Prüft „Heute“ über alle Challenges (www/dashboard-model.js), die Übungsfilter
// der Stats (www/stats-model.js) und die Helfer für gleiche Übungen (www/data.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js', 'stats-model.js', 'dashboard-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return { P: ctx.window.PTData, S: ctx.window.PTStats, D: ctx.window.PTDashboard };
}
const { P, S, D } = load();
// Arrays aus dem vm-Kontext haben einen anderen Prototyp; für deepEqual kopieren.
const ids = (list, key) => [...list].map(x => x[key]);

const WEEK = '2026-10-19';       // Montag KW 43
const LAST = '2026-10-12';
const WED = new Date('2026-10-21T12:00:00');
const at = (day, h = 12) => `${day}T${String(h).padStart(2, '0')}:00:00`;

// Katalog (competition_id null) und eigene Übungen zweier Challenges
const cats = [
  { id: 'push', name: 'Liegestütze', kind: 'sports', challenge_type: 'standard', competition_id: null, ranked: true },
  { id: 'th', name: 'Tom Holland', kind: 'sports', challenge_type: 'tom_holland', competition_id: null },
  { id: 'bible-a', name: 'Bibellesen', kind: 'time', challenge_type: 'standard', competition_id: 'A' },
  { id: 'bible-b', name: ' bibellesen ', kind: 'time', challenge_type: 'standard', competition_id: 'B' },
  { id: 'code-a', name: 'Coding', kind: 'work', challenge_type: 'standard', competition_id: 'A' },
  { id: 'code-b', name: 'Coding', kind: 'work', challenge_type: 'standard', competition_id: 'B' },
];
const side = (id, isMine = false) => ({ key: id, userIds: [id], statUserIds: [id], isMine, label: id, color: '#000' });
const duel = [side('me', true), side('jonas')];

test('exerciseKey: Katalog über die ID, eigene über Art und Namen, Work pro Challenge', () => {
  assert.equal(P.exerciseKey(cats[0]), 'cat:push');
  assert.equal(P.exerciseKey(cats[2]), P.exerciseKey(cats[3]));
  assert.notEqual(P.exerciseKey(cats[4], 'A'), P.exerciseKey(cats[5], 'B'));
  assert.equal(P.usesMinutes(cats[2]), true);
  assert.equal(P.usesMinutes(cats[0]), false);
});

test('challengeRows: Minuten-Übungen zählen duration_minutes, Anteil pro Person', () => {
  const challenges = [{ id: 'c1', category_id: 'bible-a', week_start: WEEK, target_reps: 240 }];
  const sets = [
    { challenge_id: 'c1', athlete: 'me', reps: null, duration_minutes: 30, created_at: at('2026-10-19') },
    { challenge_id: 'c1', athlete: 'jonas', reps: null, duration_minutes: 50, created_at: at('2026-10-20') },
  ];
  const [r] = D.challengeRows({ challenges, categories: cats, sets, sides: duel, me: 'me', participantCount: 2, today: WED });
  assert.equal(r.minutes, true);
  assert.equal(r.share, 120);
  assert.deepEqual(r.doneBySide, [30, 50]);
  assert.deepEqual(r.sideGoals, [120, 120]);
  assert.equal(r.leader, 1);
  // Mittwoch = Tag 3: bis heute ceil(120 * 3/7) = 52 erwartet
  assert.equal(r.myTodayLeft, 22);
});

test('buildDashboard führt gleiche Übungen zusammen und zählt eine log_id einmal', () => {
  const bundle = {
    categories: cats,
    challenges: [
      { id: 'a-push', competition_id: 'A', category_id: 'push', week_start: WEEK, target_reps: 200 },
      { id: 'b-push', competition_id: 'B', category_id: 'push', week_start: WEEK, target_reps: 300 },
      { id: 'a-bible', competition_id: 'A', category_id: 'bible-a', week_start: WEEK, target_reps: 120 },
      { id: 'b-bible', competition_id: 'B', category_id: 'bible-b', week_start: WEEK, target_reps: 300 },
      { id: 'a-old', competition_id: 'A', category_id: 'push', week_start: LAST, target_reps: 100 },
    ],
    sets: [
      { challenge_id: 'a-push', athlete: 'me', reps: 40, log_id: 'L1', created_at: at('2026-10-20') },
      { challenge_id: 'b-push', athlete: 'me', reps: 40, log_id: 'L1', created_at: at('2026-10-20') },
      { challenge_id: 'a-bible', athlete: 'me', reps: null, duration_minutes: 60, log_id: 'L2', created_at: at('2026-10-20') },
    ],
  };
  const comps = [
    { c: { id: 'A', name: 'A' }, sides: duel, participantCount: 2 },
    { c: { id: 'B', name: 'B' }, sides: [side('me', true), side('x'), side('y')], participantCount: 3 },
  ];
  const m = D.buildDashboard({ me: 'me', comps, bundle, weekStart: WEEK, today: WED });
  assert.equal(m.cards.length, 2);
  assert.equal(m.cards[0].rows.length, 2); // alte Woche zählt nicht
  const push = m.exercises.find(e => e.key === 'cat:push');
  const bible = m.exercises.find(e => e.key.startsWith('own:time:'));
  assert.equal(push.entries.length, 2);
  assert.equal(push.myWeek, 40); // gleiche log_id nur einmal
  assert.deepEqual(ids(push.targets, 'challenge_id'), ['a-push', 'b-push']);
  assert.equal(bible.entries.length, 2);
  assert.equal(bible.minutes, true);
  // A: 60 von 60 erledigt, B: 0 von 100 → überall erledigt erst, wenn beide fertig
  assert.equal(bible.finished, false);
  assert.equal(bible.pct, 0);
});

test('matchingTargets: andere Challenges mit derselben Übung derselben Woche', () => {
  const bundle = {
    categories: cats,
    challenges: [
      { id: 'a-bible', competition_id: 'A', category_id: 'bible-a', week_start: WEEK, target_reps: 120 },
      { id: 'b-bible', competition_id: 'B', category_id: 'bible-b', week_start: WEEK, target_reps: 300 },
      { id: 'b-bible-old', competition_id: 'B', category_id: 'bible-b', week_start: LAST, target_reps: 300 },
      { id: 'b-code', competition_id: 'B', category_id: 'code-b', week_start: WEEK, target_reps: 300 },
    ],
  };
  const comps = [{ id: 'A', name: 'A', emoji: 'a' }, { id: 'B', name: 'B', emoji: 'b' }];
  const ch = bundle.challenges[0];
  const t = D.matchingTargets({ bundle, comps, ch, cat: cats[2], competitionId: 'A' });
  assert.deepEqual(ids(t, 'challenge_id'), ['b-bible']);
  // Work bleibt pro Challenge
  assert.equal(D.matchingTargets({ bundle, comps, ch: { ...ch, category_id: 'code-a' }, cat: cats[4], competitionId: 'A' }).length, 0);
  // Archivierte Challenges zählen nicht
  assert.equal(D.matchingTargets({ bundle, comps: [comps[0], { ...comps[1], archived_at: '2026-10-01' }], ch, cat: cats[2], competitionId: 'A' }).length, 0);
});

test('weekResult: Sieger nach Wiederholungen, Pflicht-Workouts zählen nicht', () => {
  const challenges = [
    { id: 'p', category_id: 'push', week_start: LAST, target_reps: 100 },
    { id: 't', category_id: 'th', week_start: LAST, target_reps: 1 },
  ];
  const sets = [
    { challenge_id: 'p', athlete: 'me', reps: 70, created_at: at('2026-10-13') },
    { challenge_id: 'p', athlete: 'jonas', reps: 45, created_at: at('2026-10-14') },
    { challenge_id: 't', athlete: 'jonas', reps: 12, created_at: at('2026-10-15') },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const r = D.weekResult({ me: 'me', c: { id: 'A' }, sides: duel, challenges, categories: cats, sets, participantCount: 2, weekStart: LAST });
  assert.equal(r.unit, 'reps');
  assert.deepEqual(r.totals, [70, 45]);
  assert.equal(r.won, true);
  assert.equal(r.margin, 25);
  assert.equal(r.goalsHit, 1); // Liegestütze ja (70 ≥ 50), Tom Holland nein
  assert.equal(r.goalsTotal, 2);

  const tie = D.weekResult({ me: 'me', c: { id: 'A' }, sides: duel, challenges: [challenges[0]], categories: cats,
    sets: [sets[0], { ...sets[1], reps: 70 }], participantCount: 2, weekStart: LAST });
  assert.equal(tie.tie, true);
  assert.equal(tie.won, false);
});

test('weekResult: reine Minuten-Woche zählt Minuten', () => {
  const challenges = [{ id: 'b', category_id: 'bible-a', week_start: LAST, target_reps: 120 }];
  const sets = [
    { challenge_id: 'b', athlete: 'me', reps: null, duration_minutes: 40, created_at: at('2026-10-13') },
    { challenge_id: 'b', athlete: 'jonas', reps: null, duration_minutes: 90, created_at: at('2026-10-13') },
  ];
  const r = D.weekResult({ me: 'me', c: { id: 'A' }, sides: duel, challenges, categories: cats, sets, participantCount: 2, weekStart: LAST });
  assert.equal(r.unit, 'min');
  assert.deepEqual(r.totals, [40, 90]);
  assert.equal(r.won, false);
  assert.equal(r.winner, 1);
});

test('Stats-Filter: alle Wiederholungen, einzelne Übung oder Minuten', () => {
  const challenges = [
    { id: 'p', competition_id: 'A', category_id: 'push', week_start: LAST, target_reps: 100 },
    { id: 'b', competition_id: 'A', category_id: 'bible-a', week_start: LAST, target_reps: 100 },
    { id: 't', competition_id: 'A', category_id: 'th', week_start: LAST, target_reps: 1 },
  ];
  const sets = [
    { challenge_id: 'p', athlete: 'me', reps: 10, created_at: at('2026-10-13') },
    { challenge_id: 'b', athlete: 'me', duration_minutes: 30, created_at: at('2026-10-13') },
  ];
  const all = S.applyExerciseFilter({ challenges, sets, categories: cats, keys: [] });
  assert.equal(all.unit, 'reps');
  assert.deepEqual(ids(all.options, 'key'), ['cat:push', P.exerciseKey(cats[2])]); // ohne Pflicht-Workout
  const bible = S.applyExerciseFilter({ challenges, sets, categories: cats, keys: [P.exerciseKey(cats[2])] });
  assert.equal(bible.unit, 'min');
  assert.deepEqual([...bible.kinds], ['time', 'work']);
  assert.deepEqual(ids(bible.challenges, 'id'), ['b']);
  assert.deepEqual(ids(bible.sets, 'challenge_id'), ['b']);
});

test('challengeStats zählt einen Satz in zwei Challenges (gleiche log_id) nur einmal', () => {
  const challenges = [
    { id: 'a', competition_id: 'A', category_id: 'push', week_start: LAST, target_reps: 100 },
    { id: 'b', competition_id: 'B', category_id: 'push', week_start: LAST, target_reps: 100 },
  ];
  const sets = [
    { challenge_id: 'a', competition_id: 'A', athlete: 'me', reps: 30, log_id: 'L', created_at: at('2026-10-13') },
    { challenge_id: 'b', competition_id: 'B', athlete: 'me', reps: 30, log_id: 'L', created_at: at('2026-10-13') },
    { challenge_id: 'a', competition_id: 'A', athlete: 'jonas', reps: 20, log_id: 'M', created_at: at('2026-10-13') },
  ];
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, today: '2026-10-21' });
  assert.deepEqual(st.totals, [30, 20]);
  assert.deepEqual(st.weeks[0].totals, [30, 20]);
  assert.equal(st.categories.length, 1);
  assert.deepEqual(st.categories[0].vals, [30, 20]);
  // Pro Wochenziel bleibt der Satz sichtbar
  assert.equal(st.weeks[0].rows.find(r => r.ch.id === 'b').perSide[0].value, 30);
});


test('workout rows cap each team member at their own repeated-run goal', () => {
  const categories = [{ id: 'sally', name: 'Bring Sally Up', kind: 'sports', challenge_type: 'bring_sally_up' }];
  const challenges = [{ id: 's1', category_id: 'sally', week_start: WEEK, target_reps: 204, target_runs: 3 }];
  const sides = [{ userIds: ['me', 'lea'] }, { userIds: ['jonas', 'sam'] }];
  const sets = ['me', 'me', 'me', 'me', 'me', 'jonas', 'jonas', 'jonas', 'sam', 'sam', 'sam']
    .map((athlete, i) => ({ athlete, challenge_id: 's1', log_id: `log${i}`, reps: 204 }));
  sets.push({ ...sets[0] });
  const [row] = D.challengeRows({ challenges, categories, sets, sides, me: 'me', participantCount: 4, today: WED });
  assert.equal(row.share, 3);
  assert.equal(row.goal, 12);
  assert.equal(row.myDone, 5);
  assert.equal(row.meFinished, true);
  assert.deepEqual(row.doneBySide, [3, 6]);
  assert.deepEqual(row.sideGoals, [6, 6]);
  assert.equal(row.total, 9);
});

test('global dashboard shows partial repeated-workout progress across different goals', () => {
  const category = { id: 'sally', name: 'Bring Sally Up', kind: 'sports', challenge_type: 'bring_sally_up', competition_id: null };
  const bundle = { categories: [category], challenges: [
    { id: 's1', competition_id: 'A', category_id: 'sally', week_start: WEEK, target_reps: 204, target_runs: 3 },
    { id: 's2', competition_id: 'B', category_id: 'sally', week_start: WEEK, target_reps: 204, target_runs: 2 },
  ], sets: [
    { id: 'a1', log_id: 'run1', challenge_id: 's1', athlete: 'me', reps: 204 },
    { id: 'a2', log_id: 'run2', challenge_id: 's1', athlete: 'me', reps: 200 },
    { id: 'b1', log_id: 'run1', challenge_id: 's2', athlete: 'me', reps: 204 },
  ] };
  const result = D.buildDashboard({ me: 'me', comps: [
    { c: { id: 'A' }, sides: duel, participantCount: 2 },
    { c: { id: 'B' }, sides: duel, participantCount: 2 },
  ], bundle, weekStart: WEEK, today: WED });
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].myWeek, 2);
  assert.equal(result.exercises[0].shareMax, 3);
  assert.equal(result.exercises[0].finished, false);
  assert.equal(result.exercises[0].pct, 0.5);
});
