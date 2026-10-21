// Prüft das Stats-Rechenmodell (www/stats-model.js) zusammen mit www/data.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js', 'stats-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return { P: ctx.window.PTData, S: ctx.window.PTStats };
}
const { P, S } = load();

// Mittwoch, KW 42/2026 läuft; Vorwoche beginnt am 05.10.
const TODAY = '2026-10-14';
const LAST_WEEK = '2026-10-05';
const THIS_WEEK = '2026-10-12';
const at = (day, h = 12) => `${day}T${String(h).padStart(2, '0')}:00:00`;

const cats = [
  { id: 'push', kind: 'sports', challenge_type: 'standard' },
  { id: 'pull', kind: 'sports', challenge_type: 'standard' },
  { id: 'th', kind: 'sports', challenge_type: 'tom_holland' },
  { id: 'code', kind: 'work', challenge_type: 'standard' },
];
const member = (user_id, extra = {}) => ({ user_id, joined_at: '2026-09-01T00:00:00', left_at: null, ...extra });
const duel = [{ key: 'a', userIds: ['a'] }, { key: 'b', userIds: ['b'] }];

function prepare(challenges, sets) {
  P.annotateWorkouts(sets, challenges, cats);
  return { challenges, sets };
}

test('leaderIndex: eindeutiger Höchstwert, sonst null', () => {
  assert.equal(S.leaderIndex([3, 5, 1]), 1);
  assert.equal(S.leaderIndex([5, 5, 1]), null);
  assert.equal(S.leaderIndex([0, 0]), null);
});

test('streaks: heute ohne Satz reißt die Serie nicht', () => {
  const r = S.streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-12', '2026-10-13'], TODAY);
  assert.equal(r.current, 2);
  assert.equal(r.longest, 3);
  assert.equal(S.streaks(['2026-10-11'], TODAY).current, 0);
});

test('challengeStats misst Ziele am fairen Anteil, nicht am gemeinsamen Ziel', () => {
  const { challenges, sets } = prepare(
    [{ id: 'w1', category_id: 'push', week_start: LAST_WEEK, target_reps: 100 }],
    [
      { challenge_id: 'w1', athlete: 'a', reps: 30, created_at: at('2026-10-06') },
      { challenge_id: 'w1', athlete: 'a', reps: 30, created_at: at('2026-10-07') },
      { challenge_id: 'w1', athlete: 'b', reps: 40, created_at: at('2026-10-07') },
    ],
  );
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, members: [member('a'), member('b')], today: TODAY });
  const row = st.weeks[0].rows[0];
  assert.equal(row.share, 50);
  assert.deepEqual(row.perSide.map(p => p.hit), [true, false]);
  assert.deepEqual(st.weeks[0].totals, [60, 40]);
  assert.equal(st.weeks[0].winner, 0);
  assert.deepEqual(st.wins, [1, 0]);
  assert.equal(st.ties, 0);
  assert.deepEqual(st.records.goalsHit, [1, 0]);
  assert.deepEqual(st.records.bestDay, [30, 40]);
  assert.deepEqual(st.records.maxSet, [30, 40]);
});

test('challengeStats: laufende Woche hat keinen Sieger und zählt nicht in die Bilanz', () => {
  const { challenges, sets } = prepare(
    [{ id: 'w2', category_id: 'push', week_start: THIS_WEEK, target_reps: 100 }],
    [{ challenge_id: 'w2', athlete: 'b', reps: 80, created_at: at('2026-10-13') }],
  );
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, members: [member('a'), member('b')], today: TODAY });
  assert.equal(st.weeks[0].current, true);
  assert.equal(st.weeks[0].winner, null);
  assert.deepEqual(st.wins, [0, 0]);
  assert.equal(st.decided, 0);
  assert.deepEqual(st.totals, [0, 80]);
});

test('challengeStats: Pflicht-Workouts zählen nicht als Reps, Ziel ist ein Durchgang', () => {
  const { challenges, sets } = prepare(
    [
      { id: 'w1', category_id: 'push', week_start: LAST_WEEK, target_reps: 20 },
      { id: 'w1th', category_id: 'th', week_start: LAST_WEEK, target_reps: 10 },
    ],
    [
      { challenge_id: 'w1', athlete: 'a', reps: 10, created_at: at('2026-10-06') },
      { challenge_id: 'w1th', athlete: 'a', reps: 12, created_at: at('2026-10-06') },
      { challenge_id: 'w1th', athlete: 'b', reps: 9, created_at: at('2026-10-08') },
    ],
  );
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, members: [member('a'), member('b')], today: TODAY });
  assert.deepEqual(st.totals, [10, 0]);
  const th = st.weeks[0].rows.find(r => r.ch.id === 'w1th');
  assert.deepEqual(th.perSide.map(p => p.hit), [true, true]);
  assert.deepEqual(st.records.workouts[0].best, [12, 9]);
  assert.deepEqual(st.records.activeDays, [1, 1]);
  assert.deepEqual([...st.categories.map(c => c.cat.id)], ['push']);
});

test('challengeStats: Team-Ziel ist die Summe der Personen-Anteile', () => {
  const teams = [{ key: 'A', userIds: ['a1', 'a2'] }, { key: 'B', userIds: ['b1', 'b2'] }];
  const { challenges, sets } = prepare(
    [{ id: 'w1', category_id: 'push', week_start: LAST_WEEK, target_reps: 100 }],
    [
      { challenge_id: 'w1', athlete: 'a1', reps: 30, created_at: at('2026-10-06') },
      { challenge_id: 'w1', athlete: 'a2', reps: 20, created_at: at('2026-10-06') },
      { challenge_id: 'w1', athlete: 'b1', reps: 45, created_at: at('2026-10-06') },
    ],
  );
  const members = ['a1', 'a2', 'b1', 'b2'].map(id => member(id));
  const st = S.challengeStats({ sides: teams, challenges, categories: cats, sets, members, today: TODAY });
  const p = st.weeks[0].rows[0].perSide;
  assert.equal(st.weeks[0].rows[0].share, 25);
  assert.deepEqual(p.map(x => x.goal), [50, 50]);
  assert.deepEqual(p.map(x => x.hit), [true, false]);
});

test('challengeStats: Woche nur mit Workouts zählt nicht als Remis', () => {
  const { challenges, sets } = prepare(
    [{ id: 'w1th', category_id: 'th', week_start: LAST_WEEK, target_reps: 10 }],
    [{ challenge_id: 'w1th', athlete: 'a', reps: 12, created_at: at('2026-10-06') }],
  );
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, members: [member('a'), member('b')], today: TODAY });
  assert.equal(st.decided, 0);
  assert.equal(st.ties, 0);
  assert.deepEqual(st.records.goalsHit, [1, 0]);
});

test('challengeStats ignoriert Work-Challenges', () => {
  const { challenges, sets } = prepare(
    [{ id: 'wc', category_id: 'code', week_start: LAST_WEEK, target_reps: 120 }],
    [{ challenge_id: 'wc', athlete: 'a', duration_minutes: 90, created_at: at('2026-10-06') }],
  );
  const st = S.challengeStats({ sides: duel, challenges, categories: cats, sets, members: [member('a'), member('b')], today: TODAY });
  assert.equal(st.weeks.length, 0);
  assert.deepEqual(st.totals, [0, 0]);
});

test('gapSeries ist der kumulierte Vorsprung von Seite 0', () => {
  assert.deepEqual(S.gapSeries([[5, 0, 10], [0, 8, 0]]), [5, -3, 7]);
});

test('personalStats: Zielquote am fairen Anteil, Platz nur aus Sport-Reps', () => {
  const comp = { id: 'c1' };
  const challenges = [
    { id: 'w1', competition_id: 'c1', category_id: 'push', week_start: LAST_WEEK, target_reps: 100 },
    { id: 'w1p', competition_id: 'c1', category_id: 'pull', week_start: LAST_WEEK, target_reps: 40 },
    { id: 'wc', competition_id: 'c1', category_id: 'code', week_start: LAST_WEEK, target_reps: 600 },
  ];
  const sets = [
    { challenge_id: 'w1', competition_id: 'c1', athlete: 'a', reps: 50, created_at: at('2026-10-06') },
    { challenge_id: 'w1p', competition_id: 'c1', athlete: 'a', reps: 5, created_at: at('2026-10-06') },
    { challenge_id: 'wc', competition_id: 'c1', athlete: 'a', duration_minutes: 500, created_at: at('2026-10-06') },
    { challenge_id: 'w1', competition_id: 'c1', athlete: 'b', reps: 70, created_at: at('2026-10-07') },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const bundle = {
    categories: cats, challenges, sets,
    members: [member('a', { competition_id: 'c1' }), member('b', { competition_id: 'c1' })],
  };
  const st = S.personalStats({ me: 'a', comps: [comp], sidesByComp: { c1: duel }, bundle, today: TODAY });
  assert.equal(st.totalReps, 55);
  assert.equal(st.goals, 2);
  assert.equal(st.goalsHit, 1);
  assert.equal(st.perComp[0].total, 55);
  assert.equal(st.perComp[0].rank, 2);
  assert.equal(st.perComp[0].played, 1);
  assert.equal(st.weeksWon, 0);
  const work = st.categories.find(c => c.kind === 'work');
  assert.equal(work.total, 500);
});

test('intensityLevels: Quartile der aktiven Tage, Workout-Tag ist Stufe 1', () => {
  const level = S.intensityLevels([10, 20, 30, 40, 50, 60, 70, 80]);
  assert.equal(level(0, false), 0);
  assert.equal(level(0, true), 1);
  assert.equal(level(10, true), 1);
  assert.equal(level(80, true), 4);
});
