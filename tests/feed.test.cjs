// Prüft das Live-Feed-Modell aus www/feed-model.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['data.js', 'feed-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.window.PTFeed;
}
const F = load();
// Werte aus dem vm-Kontext haben eigene Prototypen; für deepEqual in normale Objekte kopieren.
const plain = (x) => JSON.parse(JSON.stringify(x));

const at = (hh, mm) => new Date(2026, 9, 20, hh, mm).toISOString();
let n = 0;
const set = (athlete, challenge_id, reps, time, extra = {}) =>
  ({ id: `s${++n}`, athlete, challenge_id, reps, created_at: time, workout: null, ...extra });
const sides = [
  { index: 0, userIds: ['me'], label: 'Benny', isMine: true },
  { index: 1, userIds: ['jo'], label: 'Jonas', isMine: false },
];

test('bursts fasst Sätze derselben Person auf dieselbe Challenge zusammen', () => {
  const out = F.bursts([
    set('me', 'dips', 5, at(10, 0)),
    set('me', 'dips', 5, at(10, 20)),
    set('me', 'dips', 10, at(10, 40)),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 3);
  assert.equal(out[0].total, 20);
  assert.equal(out[0].created_at, at(10, 40));
  assert.equal(out[0].sets[0].reps, 10, 'neuester Satz zuerst');
});

test('bursts trennt bei Pause, anderer Person, anderer Challenge und Notiz', () => {
  const out = F.bursts([
    set('me', 'dips', 5, at(9, 0)),
    set('me', 'dips', 5, at(9, 50)),        // Pause > 45 min
    set('jo', 'dips', 5, at(9, 55)),        // andere Person
    set('jo', 'pull', 5, at(10, 0)),        // andere Challenge
    set('jo', 'pull', 5, at(10, 5), { note: 'zäh' }),
  ]);
  assert.equal(out.length, 5);
});

test('bursts lässt Pflicht-Workouts einzeln', () => {
  const out = F.bursts([
    set('me', 'th', 3, at(8, 0), { workout: 'tom_holland' }),
    set('me', 'th', 4, at(8, 10), { workout: 'tom_holland' }),
  ]);
  assert.equal(out.length, 2);
});

test('der Schlüssel einer wachsenden Serie bleibt gleich', () => {
  const a = set('me', 'dips', 5, at(11, 0));
  const before = F.bursts([a]);
  const after = F.bursts([a, set('me', 'dips', 5, at(11, 10))]);
  assert.equal(before[0].key, after[0].key);
  assert.equal(after[0].count, 2);
});

test('leaderIndex: eindeutiger Höchstwert, sonst null', () => {
  assert.equal(F.leaderIndex([3, 5]), 1);
  assert.equal(F.leaderIndex([5, 5]), null);
  assert.equal(F.leaderIndex([0, 0]), null);
});

test('weekTimeline meldet Anteil, Wochenziel und Führungswechsel', () => {
  // Ziel 80, Anteil 40 pro Person.
  const ch = { id: 'pull', target_reps: 80, workout: null };
  const s1 = set('me', 'pull', 10, at(8, 0));   // erste Führung: keine Meldung
  const s2 = set('jo', 'pull', 15, at(9, 0));   // Jonas übernimmt (15:10)
  const s3 = set('me', 'pull', 10, at(10, 0));  // Benny übernimmt (20:15)
  const s4 = set('jo', 'pull', 25, at(11, 0));  // Jonas: Anteil 40/40 und Führung (40:20)
  const s5 = set('me', 'pull', 45, at(12, 0));  // Ziel 105/80 schluckt Bennys Anteil, Führung 65:40
  const { events, progressBySet } = F.weekTimeline({
    weekSets: [s1, s2, s3, s4, s5], challenges: [ch], sides, participantCount: 2,
  });
  const types = events.map((e) => `${e.type}:${e.athlete}`);
  assert.deepEqual(plain(types), ['lead:jo', 'lead:me', 'share:jo', 'lead:jo', 'goal:me', 'lead:me']);
  assert.equal(events[0].sideIndex, 1);
  assert.deepEqual(plain(progressBySet[s3.id]), { value: 20, share: 40 });
});

test('weekTimeline ignoriert Pflicht-Workouts und Challenges ohne Ziel', () => {
  const { events } = F.weekTimeline({
    weekSets: [set('me', 'th', 5, at(8, 0), { workout: 'tom_holland' }), set('me', 'x', 99, at(8, 0))],
    challenges: [{ id: 'th', target_reps: 1, workout: 'tom_holland' }, { id: 'x', target_reps: 0 }],
    sides, participantCount: 2,
  });
  assert.equal(events.length, 0);
});

test('buildFeed sortiert neueste zuerst, Meilenstein vor seiner Zeile', () => {
  const ch = { id: 'dips', target_reps: 10, workout: null };
  const a = set('me', 'dips', 10, at(14, 0));
  const feed = F.buildFeed({
    items: [{ kind: 'set', ...a }, { kind: 'recap', id: 'recap-x', created_at: at(0, 0) }],
    weekSets: [a], challenges: [ch], sides, participantCount: 2,
  });
  assert.deepEqual(plain(feed.map((e) => e.kind)), ['milestone', 'burst', 'recap']);
  assert.deepEqual(plain(feed[1].progress), { value: 10, share: 5 });
});
