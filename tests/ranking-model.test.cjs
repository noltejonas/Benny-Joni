// Prüft das Rechenmodell der Monatsrangliste (www/ranking-model.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'ranking-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.window.PTRanking;
}
const R = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

const cats = [
  { id: 'push', name: 'Liegestütze', ranked: true, metric: 'volume', max_per_day: 1000, competition_id: null, challenge_type: 'standard' },
  { id: 'sally', name: 'Bring Sally Up', ranked: true, metric: 'best', max_per_day: 204, competition_id: null, challenge_type: 'bring_sally_up' },
  { id: 'th', name: 'Tom Holland', ranked: true, metric: 'best', max_per_day: 40, competition_id: null, challenge_type: 'tom_holland' },
  { id: 'own', name: 'Muscle-ups', ranked: false, competition_id: 'c1' },
];
const OCT = '2026-10-01';
const at = (day, h = 12) => new Date(2026, 9, day, h, 0, 0).toISOString();
let n = 0;
const set = (user, category, reps, day, log = `l${++n}`, h = 12) =>
  ({ user_id: user, category_id: category, reps, created_at: at(day, h), log_id: log });

test('Punkte nach F1-Schema, ab Platz 11 nichts', () => {
  assert.deepEqual(plain([1, 2, 3, 4, 10, 11].map(R.pointsFor)), [25, 18, 15, 12, 1, 0]);
  assert.deepEqual(plain([1, 2, 3, 4].map(R.medalFor)), ['gold', 'silver', 'bronze', null]);
});

test('Gleichstand teilt den Platz, der nächste wird übersprungen', () => {
  const rows = R.rankBy([{ u: 'a', value: 50 }, { u: 'b', value: 80 }, { u: 'c', value: 50 }, { u: 'd', value: 10 }]);
  assert.deepEqual(plain(rows.map((r) => [r.u, r.rank])), [['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
});

test('Monatswert: log_id zählt einmal, nur gewertete Übungen, nur der Monat', () => {
  const sets = [
    set('benny', 'push', 50, 3, 'x'), set('benny', 'push', 50, 3, 'x'), // gleiche log_id in zwei Challenges
    set('benny', 'push', 20, 4),
    set('benny', 'own', 99, 4),
    { user_id: 'benny', category_id: 'push', reps: 70, created_at: new Date(2026, 8, 30, 12).toISOString(), log_id: 'sep' },
  ];
  const v = R.monthValues({ sets, categories: cats, month: OCT });
  assert.deepEqual(plain(v), [{ category_id: 'push', user_id: 'benny', value: 70 }]);
});

test('Tageslimit deckelt pro Tag, Bestwert pro Durchgang', () => {
  const sets = [
    set('a', 'push', 900, 5), set('a', 'push', 300, 5), set('a', 'push', 100, 6),
    set('a', 'sally', 150, 5), set('a', 'sally', 999, 6),
    set('a', 'th', 12, 5), set('a', 'th', 9, 7),
  ];
  const v = Object.fromEntries(R.monthValues({ sets, categories: cats, month: OCT }).map((r) => [r.category_id, r.value]));
  assert.deepEqual(plain(v), { push: 1100, sally: 204, th: 12 });
});

test('excludeLog rechnet einen Satz heraus (für „überholt“)', () => {
  const sets = [set('a', 'push', 40, 5, 'old'), set('a', 'push', 60, 6, 'new')];
  assert.equal(R.monthValues({ sets, categories: cats, month: OCT, excludeLog: 'new' })[0].value, 40);
});

test('Board: Platz, Punkte, Medaille pro Übung; counted filtert', () => {
  const values = [
    { category_id: 'push', user_id: 'a', value: 300 }, { category_id: 'push', user_id: 'b', value: 200 },
    { category_id: 'push', user_id: 'c', value: 200 }, { category_id: 'push', user_id: 'hidden', value: 999 },
    { category_id: 'sally', user_id: 'a', value: 204 }, { category_id: 'sally', user_id: 'b', value: 204 },
    { category_id: 'push', user_id: 'zero', value: 0 },
  ];
  const b = R.board(values, (r) => r.user_id !== 'hidden');
  const get = (cat, u) => b.find((r) => r.category_id === cat && r.user_id === u);
  assert.deepEqual(plain([get('push', 'a').rank, get('push', 'a').points, get('push', 'a').medal]), [1, 25, 'gold']);
  assert.deepEqual(plain([get('push', 'b').rank, get('push', 'c').rank, get('push', 'c').points]), [2, 2, 18]);
  assert.equal(get('push', 'hidden'), undefined);
  assert.equal(get('push', 'zero'), undefined);
  assert.deepEqual(plain([get('sally', 'a').medal, get('sally', 'b').medal]), ['gold', 'gold'], 'geteiltes Gold bei 3:24');
});

test('Abstand nach oben und Platz ohne Wertung', () => {
  const rows = [{ value: 300 }, { value: 200 }, { value: 200 }, { value: 120 }];
  assert.deepEqual(plain(R.gapAbove(rows, 120)), { rank: 2, need: 80 });
  assert.deepEqual(plain(R.gapAbove(rows, 250)), { rank: 1, need: 50 });
  assert.equal(R.gapAbove(rows, 300), null);
  assert.equal(R.hypotheticalRank(rows, 210), 2);
  assert.equal(R.hypotheticalRank(rows, 120), 4);
});

test('Saison/Ewig: Summen, Gesamtwertung, Medaillenspiegel', () => {
  const results = [
    { month: '2026-11-01', category_id: 'push', user_id: 'a', points: 25, medal: 'gold' },
    { month: '2026-11-01', category_id: 'push', user_id: 'b', points: 18, medal: 'silver' },
    { month: '2026-11-01', category_id: 'th', user_id: 'b', points: 25, medal: 'gold' },
    { month: '2026-12-01', category_id: 'push', user_id: 'a', points: 18, medal: 'silver' },
    { month: '2026-12-01', category_id: 'push', user_id: 'b', points: 25, medal: 'gold' },
    { month: '2027-01-01', category_id: 'push', user_id: 'c', points: 25, medal: 'gold' },
  ];
  const season = R.totals(results, { from: '2026-01-01', to: '2026-12-01' });
  const a = season.find((r) => r.user_id === 'a');
  assert.deepEqual(plain([a.points, a.gold, a.silver, a.months]), [43, 1, 1, 2]);
  const all = R.overall(R.totals(results));
  const table = R.pointsTable(all);
  assert.deepEqual(plain(table.map((r) => [r.user_id, r.points, r.rank])), [['b', 68, 1], ['a', 43, 2], ['c', 25, 3]]);
  const medals = R.medalTable(all);
  assert.deepEqual(plain(medals.map((r) => r.user_id)), ['b', 'a', 'c']);
  assert.deepEqual(plain([medals[0].gold, medals[0].silver]), [2, 1]);
});

test('Gesamtwertung eines Monats leitet Medaillen aus dem Platz ab', () => {
  const rows = [
    { category_id: 'push', user_id: 'a', rank: 1, points: 25 },
    { category_id: 'th', user_id: 'a', rank: 3, points: 15 },
    { category_id: 'push', user_id: 'b', rank: 2, points: 18 },
    { category_id: 'th', user_id: 'b', rank: 11, points: 0 },
  ];
  const a = R.overall(rows).find((r) => r.user_id === 'a');
  assert.deepEqual(plain([a.points, a.gold, a.silver, a.bronze]), [40, 1, 0, 1]);
  assert.equal(a.rank, undefined, 'Platz wird erst in der Gesamtliste vergeben');
});

test('Saisonsieger erst nach abgeschlossenem Dezember, auch gesamt', () => {
  const results = [
    { month: '2026-11-01', category_id: 'push', user_id: 'a', points: 25, medal: 'gold' },
    { month: '2026-12-01', category_id: 'push', user_id: 'b', points: 25, medal: 'gold' },
    { month: '2026-12-01', category_id: 'th', user_id: 'b', points: 25, medal: 'gold' },
  ];
  assert.deepEqual(plain(R.seasonChampions(results, ['2026-11-01'])), []);
  const champs = R.seasonChampions(results, ['2026-11-01', '2026-12-01']);
  const push = champs.filter((c) => c.category_id === 'push').map((c) => c.user_id).sort();
  assert.deepEqual(plain(push), ['a', 'b'], 'Gleichstand: beide Sieger');
  assert.deepEqual(plain(champs.find((c) => c.category_id === null)), { year: 2026, category_id: null, user_id: 'b', points: 50 });
});

test('Monate: Beschriftung, Wechsel, Abschluss, Resttage', () => {
  assert.equal(R.monthOf(new Date(2026, 9, 20)), '2026-10-01');
  assert.equal(R.addMonths('2026-12-01', 1), '2027-01-01');
  assert.equal(R.addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(R.monthLabel('2026-03-01'), 'März 2026');
  assert.equal(R.closeDeadline('2026-12-01').getTime(), new Date(2027, 0, 2, 12).getTime());
  assert.equal(R.daysLeft('2026-10-01', new Date(2026, 9, 20)), 12);
  assert.equal(R.daysLeft('2026-09-01', new Date(2026, 9, 20)), 0);
});

test('Werte anzeigen', () => {
  assert.equal(R.formatValue(cats[0], 1234), '1.234');
  assert.equal(R.formatValue(cats[1], 204), '3:24');
  assert.equal(R.formatValue(cats[2], 1), '1 Runde');
  assert.equal(R.formatNeed(cats[0], 42), '42 Liegestütze');
});
