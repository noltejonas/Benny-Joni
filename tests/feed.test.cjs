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

// ── Plausibilität ─────────────────────────────────────────────────────
test('repsCheck: ab 200 nachfragen, über 500 ablehnen', () => {
  assert.equal(F.repsCheck(10), 'ok');
  assert.equal(F.repsCheck(199), 'ok');
  assert.equal(F.repsCheck(200), 'ask');
  assert.equal(F.repsCheck(250), 'ask');
  assert.equal(F.repsCheck(500), 'ask');
  assert.equal(F.repsCheck(501), 'too_many');
  assert.equal(F.repsCheck(600), 'too_many');
  assert.equal(F.repsCheck(0), 'invalid');
  assert.equal(F.repsCheck(NaN), 'invalid');
});

// ── Blockieren ────────────────────────────────────────────────────────
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
// Eigener vm-Kontext pro Test, damit die Blockliste nicht durchsickert.
function loadWith(localStorage) {
  const ctx = { window: { localStorage }, console };
  vm.createContext(ctx);
  for (const f of ['data.js', 'feed-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.window.PTFeed;
}

test('Blockliste: setBlocked speichert unter pt:blocked, isBlocked liest es', () => {
  const store = memoryStorage();
  const B = loadWith(store);
  assert.equal(B.isBlocked('u-jonas'), false);
  assert.deepEqual(plain(B.setBlocked('u-jonas', true)), ['u-jonas']);
  assert.equal(B.isBlocked('u-jonas'), true);
  assert.equal(B.isBlocked('u-benny'), false);
  assert.deepEqual(JSON.parse(store.data['pt:blocked']), ['u-jonas']);
  // doppelt blockieren legt keinen zweiten Eintrag an
  B.setBlocked('u-jonas', true);
  assert.deepEqual(plain(B.blockedIds()), ['u-jonas']);
  // entsperren
  assert.deepEqual(plain(B.setBlocked('u-jonas', false)), []);
  assert.equal(B.isBlocked('u-jonas'), false);
});

test('Blockliste: bleibt nach dem Neuladen bestehen', () => {
  const store = memoryStorage();
  loadWith(store).setBlocked('u-jonas', true);
  assert.equal(loadWith(store).isBlocked('u-jonas'), true);
});

test('Blockliste: kaputter oder fehlender Speicher wirft nie', () => {
  const broken = loadWith(memoryStorage({ 'pt:blocked': '{kein json' }));
  assert.deepEqual(plain(broken.blockedIds()), []);
  assert.equal(broken.isBlocked('u-jonas'), false);

  const throwing = loadWith({
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceeded'); },
  });
  assert.equal(throwing.isBlocked('u-jonas'), false);
  assert.deepEqual(plain(throwing.setBlocked('u-jonas', true)), ['u-jonas'], 'gilt bis zum Neuladen');

  const none = loadWith(undefined);
  assert.equal(none.isBlocked('u-jonas'), false);
  assert.deepEqual(plain(none.setBlocked('u-jonas', true)), ['u-jonas']);
  assert.equal(none.isBlocked(''), false);
});

test('Blockliste: fremde Werte im Speicher werden ignoriert', () => {
  const B = loadWith(memoryStorage({ 'pt:blocked': JSON.stringify(['u-a', 42, null, '']) }));
  assert.deepEqual(plain(B.blockedIds()), ['u-a']);
});

// ── Melden ────────────────────────────────────────────────────────────
test('reportMailto: mailto mit Betreff und IDs, leer ohne Adresse', () => {
  const info = { kind: 'set', setId: 's-1', userId: 'u-jonas', challengeId: 'c-bj', note: 'blöder Spruch' };
  assert.equal(F.reportMailto(info, ''), '');
  const url = F.reportMailto(info, 'support@example.org');
  assert.ok(url.startsWith('mailto:support@example.org?subject='));
  const q = new URLSearchParams(url.split('?')[1]);
  assert.equal(q.get('subject'), 'Meldung: Eintrag im Feed');
  const body = q.get('body');
  for (const part of ['Satz-ID: s-1', 'User-ID: u-jonas', 'Challenge-ID: c-bj', 'blöder Spruch']) {
    assert.ok(body.includes(part), part);
  }
});

// ── Teilen ────────────────────────────────────────────────────────────
test('recapShareText: Duell gewonnen, verloren, unentschieden', () => {
  const opts = { sides, kw: 43, name: 'Duell', appName: 'Benny & Joni', appUrl: '', code: 'abc234' };
  const won = F.recapShareText({ ...opts, recap: { totals: [312, 270], winnerIdx: 0 } });
  assert.equal(won, '🏁 KW 43 in „Duell“\nIch hab die Woche geholt: 312 zu 270 Reps 💪\n\nMach mit bei Benny & Joni\nCode: ABC234');
  const lost = F.recapShareText({ ...opts, recap: { totals: [200, 250], winnerIdx: 1 } });
  assert.ok(lost.includes('Jonas hat die Woche geholt: 250 zu 200 Reps. Revanche läuft.'));
  const tie = F.recapShareText({ ...opts, recap: { totals: [100, 100], winnerIdx: null } });
  assert.ok(tie.includes('Unentschieden: 100 zu 100 Reps.'));
});

test('recapShareText: Rangliste, Team, Work-Woche, App-Store-Link', () => {
  const many = [...sides, { index: 2, userIds: ['x'], label: 'Max' }];
  const third = F.recapShareText({ recap: { totals: [50, 80, 90], winnerIdx: 2 }, sides: many, kw: 43 });
  assert.ok(third.includes('Platz 3 von 3 mit 50 Reps.'));
  const team = [{ userIds: ['me', 'b'], label: 'Benny & Ben' }, { userIds: ['jo', 'j'], label: 'Jonas & Jo' }];
  assert.ok(F.recapShareText({ recap: { totals: [9, 3], winnerIdx: 0 }, sides: team }).includes('Wir haben die Woche geholt'));
  assert.ok(F.recapShareText({ recap: { totals: [3, 9], winnerIdx: 1 }, sides: team }).includes('Jonas & Jo haben die Woche geholt'));
  const work = F.recapShareText({ recap: { totals: [90, 60], winnerIdx: 0 }, sides, unit: '', fmt: (m) => `${m / 60} h` });
  assert.ok(work.includes('1.5 h zu 1 h 💪'));
  const linked = F.recapShareText({ recap: { totals: [1, 0], winnerIdx: 0 }, sides, appUrl: 'https://apps.apple.com/de/app/id1' });
  assert.ok(linked.endsWith('Mach mit bei Benny & Joni: https://apps.apple.com/de/app/id1'));
  assert.ok(!linked.includes('Code:'), 'ohne Code keine Code-Zeile');
});

test('weekOneShareText: Ergebnis, Tage und Fokuszeit', () => {
  const won = F.weekOneShareText({ summary: { myReps: 120, activeDays: 4, result: 'won', diff: 20 }, code: 'ABC234' });
  assert.equal(won, '🏁 Woche 1 bei Benny & Joni geschafft\n120 Reps an 4 Tagen. Ich hab die Woche geholt, 20 vorne.\n\nMach mit bei Benny & Joni\nCode: ABC234');
  const solo = F.weekOneShareText({ summary: { myReps: 30, activeDays: 1, result: 'solo' } });
  assert.ok(solo.includes('30 Reps an 1 Tag.\n'));
  const lost = F.weekOneShareText({ summary: { myReps: 10, activeDays: 2, result: 'lost', leader: 'Jonas', diff: 5 } });
  assert.ok(lost.includes('Jonas lag 5 vorne. Revanche läuft.'));
  const work = F.weekOneShareText({ summary: { myReps: 0, myMinutes: 90, activeDays: 2, result: 'tie' }, fmtMinutes: () => '1:30 h' });
  assert.ok(work.includes('1:30 h Fokuszeit an 2 Tagen. Gleichstand. Woche 2 entscheidet.'));
});
