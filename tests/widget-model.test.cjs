// Prüft den Schnappschuss fürs iOS-Homescreen-Widget und die Widget-Links
// (www/widget-model.js), gerechnet aus demselben Modell wie „Heute“.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js', 'dashboard-model.js', 'widget-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  return { W: ctx.window.PTWidget, D: ctx.window.PTDashboard };
}
const { W, D } = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

test('parseLink: Heute, Challenge, Übung; fremde Links nicht', () => {
  assert.deepEqual(plain(W.parseLink('projektterminator://widget/home')), { kind: 'home' });
  assert.deepEqual(plain(W.parseLink(W.linkChallenge('c-1'))), { kind: 'challenge', id: 'c-1' });
  assert.deepEqual(plain(W.parseLink(W.linkExercise('own:sports:push ups'))), { kind: 'exercise', key: 'own:sports:push ups' });
  assert.equal(W.parseLink('projektterminator://join/ABC234'), null, 'Einladungen bleiben bei parseInviteUrl');
  assert.equal(W.parseLink('projektterminator://widget/challenge/'), null);
  assert.equal(W.parseLink('https://example.org/widget/home'), null);
  assert.equal(W.parseLink(''), null);
});

const WEEK = '2026-10-26'; // Montag
const comp = (id, name, emoji) => ({ id, name, emoji, mode: '1v1' });
const sidesFor = (me, other) => [
  { key: me, index: 0, userIds: [me], statUserIds: [me], label: 'Du', isMine: true },
  { key: other, index: 1, userIds: [other], statUserIds: [other], label: 'Jonas', isMine: false },
];
const bundle = {
  categories: [{ id: 'push', name: 'Liegestütze', kind: 'sports', challenge_type: 'standard' },
    { id: 'pull', name: 'Klimmzüge', kind: 'sports', challenge_type: 'standard' }],
  challenges: [
    { id: 'chA', competition_id: 'A', category_id: 'push', target_reps: 140, week_start: WEEK },
    { id: 'chB', competition_id: 'B', category_id: 'push', target_reps: 70, week_start: WEEK },
    { id: 'chA2', competition_id: 'A', category_id: 'pull', target_reps: 20, week_start: WEEK },
  ],
  sets: [
    { id: 's1', athlete: 'me', log_id: 'L1', competition_id: 'A', challenge_id: 'chA', reps: 20, created_at: `${WEEK}T09:00:00Z` },
    { id: 's2', athlete: 'me', log_id: 'L1', competition_id: 'B', challenge_id: 'chB', reps: 20, created_at: `${WEEK}T09:00:00Z` },
    { id: 's3', athlete: 'me', log_id: 'L2', competition_id: 'A', challenge_id: 'chA2', reps: 10, created_at: `${WEEK}T10:00:00Z` },
    { id: 's4', athlete: 'jo', log_id: 'L3', competition_id: 'A', challenge_id: 'chA', reps: 30, created_at: `${WEEK}T11:00:00Z` },
  ],
};
const model = () => D.buildDashboard({
  me: 'me', weekStart: WEEK, bundle, today: new Date(`${WEEK}T12:00:00`),
  comps: [
    { c: comp('A', 'Benny vs Jonas', '💪'), sides: sidesFor('me', 'jo'), participantCount: 2 },
    { c: comp('B', 'Büro-Duell', '🏢'), sides: sidesFor('me', 'jo'), participantCount: 2 },
  ],
});

test('todayLeftOn rechnet wie „heute noch“ in Heute, für jeden Wochentag', () => {
  const m = model();
  const push = m.exercises.find(e => e.key === 'cat:push');
  // A: Anteil 70, B: Anteil 35, je 20 erledigt. Mo: ceil(70/7)=10 → 0 offen, B: ceil(35/7)=5 → 0
  assert.equal(W.todayLeftOn(push.entries, 1), 0);
  // Mi (3): A ceil(30)=30-20=10, B ceil(15)=15-20<0 → 10
  assert.equal(W.todayLeftOn(push.entries, 3), 10);
  // So (7): A 70-20=50
  assert.equal(W.todayLeftOn(push.entries, 7), 50);
  assert.equal(push.todayLeft, W.todayLeftOn(push.entries, 1), 'Montag wie im Modell');
});

test('snapshot: Übungen, Challenges, Texte je Wochentag und Links', () => {
  const snap = W.snapshot({
    model: model(), weekStart: WEEK, weekNumber: 44, fmt: (minutes, v) => String(v),
    statusOf: (card) => `Stand ${card.c.name}`, colors: { light: { tile0: '#6A4CF5' }, dark: null },
    now: new Date('2026-10-26T12:00:00Z'),
  });
  assert.equal(snap.v, W.VERSION);
  assert.equal(snap.weekStart, WEEK);
  assert.equal(snap.title, 'KW 44');
  assert.equal(snap.daysLeft.length, 7);
  assert.equal(snap.daysLeft[0], 'noch 6 Tage');
  assert.equal(snap.daysLeft[5], 'noch 1 Tag');
  assert.equal(snap.daysLeft[6], 'letzter Tag');
  assert.equal(snap.total, 2, 'Liegestütze aus A und B zählen als eine Übung');
  assert.equal(snap.exercises.length, 2);
  const push = snap.exercises.find(e => e.key === 'cat:push');
  assert.equal(push.name, 'Liegestütze');
  assert.equal(push.emojis, '💪🏢');
  assert.equal(push.lines.length, 7);
  assert.equal(push.lines[0], 'du bist auf Kurs');
  assert.equal(push.lines[2], 'heute noch 10');
  assert.equal(push.link, 'projektterminator://widget/exercise/cat%3Apush');
  assert.ok(push.pct > 0 && push.pct < 1);
  assert.deepEqual(plain(snap.comps.map(c => [c.id, c.score, c.status, c.link])), [
    // A: Liegestütze führt Jonas (30:20), Klimmzüge ich (10:0); B: Liegestütze ich (20:0)
    ['A', '1 : 1', 'Stand Benny vs Jonas', 'projektterminator://widget/challenge/A'],
    ['B', '1 : 0', 'Stand Büro-Duell', 'projektterminator://widget/challenge/B'],
  ]);
  assert.equal(snap.links.home, 'projektterminator://widget/home');
  assert.equal(snap.colors.light.tile0, '#6A4CF5');
});

test('snapshot: erledigte Übungen ans Ende, alles erledigt meldet sich', () => {
  const done = D.buildDashboard({
    me: 'me', weekStart: WEEK, today: new Date(`${WEEK}T12:00:00`),
    bundle: { ...bundle, sets: [...bundle.sets,
      { id: 's5', athlete: 'me', log_id: 'L5', competition_id: 'A', challenge_id: 'chA2', reps: 5, created_at: `${WEEK}T12:00:00Z` }] },
    comps: [{ c: comp('A', 'Benny vs Jonas', '💪'), sides: sidesFor('me', 'jo'), participantCount: 2 }],
  });
  const snap = W.snapshot({ model: done, weekStart: WEEK, weekNumber: 44, fmt: (m, v) => String(v) });
  assert.deepEqual(plain(snap.exercises.map(e => [e.name, e.finished])), [['Liegestütze', false], ['Klimmzüge', true]]);
  assert.equal(snap.allDone, '');
  assert.equal(snap.doneLabel, '1 von 2 erledigt');
});

test('contentOf ignoriert nur die Uhrzeit', () => {
  const a = W.snapshot({ model: model(), weekStart: WEEK, weekNumber: 44, fmt: (m, v) => String(v), now: new Date('2026-10-26T12:00:00Z') });
  const b = W.snapshot({ model: model(), weekStart: WEEK, weekNumber: 44, fmt: (m, v) => String(v), now: new Date('2026-10-26T13:00:00Z') });
  assert.notEqual(a.updatedAt, b.updatedAt);
  assert.equal(W.contentOf(a), W.contentOf(b));
  assert.equal(W.snapshot({ model: null }), null);
});
