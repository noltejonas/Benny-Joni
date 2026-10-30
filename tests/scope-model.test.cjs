// Prüft den gemeinsamen Filter „Alle Challenges“ aus www/scope-model.js und
// den Feed über mehrere Challenges (www/feed-model.js, buildFeedAll).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js', 'feed-model.js', 'scope-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  return { S: ctx.window.PTScope, F: ctx.window.PTFeed };
}
const { S, F } = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

const at = (hh, mm) => new Date(2026, 9, 27, hh, mm).toISOString();

// ── resolve ────────────────────────────────────────────────────────────────
test('„Alle“ gibt es erst ab zwei laufenden Challenges', () => {
  assert.equal(S.resolve('all', 3), 'all');
  assert.equal(S.resolve(undefined, 2), 'all', 'Standard ist „Alle“');
  assert.equal(S.resolve('one', 3), 'one');
  assert.equal(S.resolve('all', 1), 'one', 'mit einer Challenge ist „Alle“ diese eine');
  assert.equal(S.resolve('all', 0), 'one');
});

test('orderComps stellt die Haupt-Challenge nach vorn', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(plain(S.orderComps(list, 'c').map(c => c.id)), ['c', 'a', 'b']);
  assert.deepEqual(plain(S.orderComps(list, null).map(c => c.id)), ['a', 'b', 'c']);
});

// ── mergeLogCopies ─────────────────────────────────────────────────────────
const copy = (id, cid, extra = {}) => ({
  id, athlete: 'me', log_id: 'L1', competition_id: cid, challenge_id: `ch-${cid}`, reps: 10, created_at: at(9, 0), reactions: [], ...extra,
});

test('ein Eintrag in drei Challenges wird ein Satz, vertreten von der Haupt-Challenge', () => {
  const out = S.mergeLogCopies([copy('s1', 'b'), copy('s2', 'main'), copy('s3', 'c')], ['main', 'b', 'c']);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 's2');
  assert.equal(out[0].competition_id, 'main');
  assert.deepEqual(plain(out[0].competition_ids), ['main', 'b', 'c']);
  assert.deepEqual(plain(out[0].copies.map(c => c.id)), ['s2', 's1', 's3']);
});

test('Sätze ohne log_id und verschiedene Personen bleiben getrennt', () => {
  const out = S.mergeLogCopies([
    copy('s1', 'a', { log_id: null }),
    copy('s2', 'b', { log_id: null }),
    copy('s3', 'a', { athlete: 'jo' }),
    copy('s4', 'b', { athlete: 'me', created_at: at(10, 0) }),
  ], ['a', 'b']);
  // s4 hat dieselbe log_id L1 wie s3, aber eine andere Person → zwei Einträge
  assert.deepEqual(plain(out.map(x => x.id)).sort(), ['s1', 's2', 's3', 's4']);
  assert.equal(out[0].id, 's4', 'neueste zuerst');
});

test('Reaktionen über Kopien: je Person und Emoji einmal', () => {
  const out = S.mergeLogCopies([
    copy('s1', 'a', { reactions: [{ athlete: 'jo', emoji: '🔥' }, { athlete: 'me', emoji: '💪' }] }),
    copy('s2', 'b', { reactions: [{ athlete: 'jo', emoji: '🔥' }, { athlete: 'lea', emoji: '🔥' }] }),
  ], ['a', 'b']);
  assert.equal(out.length, 1);
  const r = plain(out[0].reactions).map(x => `${x.athlete}${x.emoji}`).sort();
  assert.deepEqual(r, ['jo🔥', 'lea🔥', 'me💪']);
});

test('reactionOps: an auf der vertretenden Kopie, aus auf allen Kopien mit meiner Reaktion', () => {
  const [merged] = S.mergeLogCopies([
    copy('s1', 'a', { reactions: [{ athlete: 'me', emoji: '🔥' }] }),
    copy('s2', 'b', { reactions: [{ athlete: 'me', emoji: '🔥' }] }),
    copy('s3', 'c'),
  ], ['a', 'b', 'c']);
  assert.deepEqual(plain(S.reactionOps(merged, '🔥', 'me')), [
    { op: 'remove', set_id: 's1', competition_id: 'a' },
    { op: 'remove', set_id: 's2', competition_id: 'b' },
  ]);
  assert.deepEqual(plain(S.reactionOps(merged, '💯', 'me')), [{ op: 'add', set_id: 's1', competition_id: 'a' }]);
  // Einzelner Satz ohne copies
  assert.deepEqual(plain(S.reactionOps({ id: 'x', competition_id: 'z', reactions: [] }, '👏', 'me')),
    [{ op: 'add', set_id: 'x', competition_id: 'z' }]);
});

// ── Strafkonto ─────────────────────────────────────────────────────────────
const pen = (cid, athlete, cents, week = '2026-10-19') => ({ competition_id: cid, athlete, amount_cents: cents, week_start: week });
const pay = (cid, athlete, cents) => ({ competition_id: cid, athlete, amount_cents: cents });

test('penaltySummary wie im Strafkonto: Saldo pro Person, offene Personen', () => {
  const s = S.penaltySummary([pen('a', 'me', 500), pen('a', 'jo', 1000)], [pay('a', 'jo', 1000)]);
  assert.equal(s.potOpen, 500);
  assert.equal(s.saldo.me, 500);
  assert.equal(s.saldo.jo, 0);
  assert.equal(s.openPeople, 1);
  assert.deepEqual(plain(s.openIds), ['me']);
  assert.equal(S.penaltySummary([pen('a', 'me', 500)], [pay('a', 'me', 500)]).openPeople, 0);
});

test('penaltyOverview rechnet pro Challenge und summiert ohne Doppelte', () => {
  const comps = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const ov = S.penaltyOverview({
    comps, me: 'me', monday: '2026-10-26',
    penalties: [pen('a', 'me', 500), pen('a', 'jo', 1000), pen('b', 'me', 300), pen('b', 'lea', 200), pen('x', 'me', 9999)],
    payouts: [pay('a', 'jo', 400), pay('b', 'lea', 500)],
    closures: [{ competition_id: 'a', week_start: '2026-10-19' }],
    challengeWeeks: [
      { competition_id: 'a', week_start: '2026-10-19' }, { competition_id: 'a', week_start: '2026-10-19' },
      { competition_id: 'b', week_start: '2026-10-12' }, { competition_id: 'b', week_start: '2026-10-19' },
      { competition_id: 'b', week_start: '2026-10-26' },
    ],
  });
  const [a, b] = ov.rows;
  assert.equal(a.potOpen, 1100); // 1500 Strafen − 400 eingezahlt
  assert.equal(a.myOpen, 500);
  assert.deepEqual(plain(a.openWeeks), [], 'geschlossene Woche zählt nicht');
  // b: 500 Strafen − 500 eingezahlt = 0; Lea hat überzahlt, das gleicht a nicht aus
  assert.equal(b.potOpen, 0);
  assert.equal(b.myOpen, 300);
  assert.deepEqual(plain(b.openWeeks), ['2026-10-12', '2026-10-19'], 'laufende Woche ist noch nicht abzuschließen');
  assert.equal(ov.total.potOpen, 1100, 'Strafen anderer Challenges (x) zählen nicht');
  assert.equal(ov.total.myOpen, 800);
  assert.equal(ov.total.penaltyCount, 4);
  assert.equal(ov.total.openWeeks, 2);
  // b ist insgesamt beglichen → dort niemand offen; a: me und jo
  assert.deepEqual(plain(ov.total.openIds).sort(), ['jo', 'me']);
  assert.equal(ov.total.openPeople, 2);
});

test('penaltyOverview: dieselbe Person in zwei Challenges zählt einmal', () => {
  const ov = S.penaltyOverview({
    comps: [{ id: 'a' }, { id: 'b' }], me: 'me', monday: '2026-10-26',
    penalties: [pen('a', 'jo', 500), pen('b', 'jo', 500)],
  });
  assert.equal(ov.rows[0].openPeople + ov.rows[1].openPeople, 2);
  assert.equal(ov.total.openPeople, 1);
  assert.equal(ov.total.potOpen, 1000);
});

// ── Feed über alle Challenges ──────────────────────────────────────────────
const sides = (me, other) => [
  { index: 0, userIds: [me], statUserIds: [me], label: 'Du', isMine: true },
  { index: 1, userIds: [other], statUserIds: [other], label: other, isMine: false },
];

test('buildFeedAll: ein Eintrag in zwei Challenges steht einmal da, Meilensteine je Challenge', () => {
  const chA = { id: 'chA', competition_id: 'A', category_id: 'push', target_reps: 20, week_start: '2026-10-26' };
  const chB = { id: 'chB', competition_id: 'B', category_id: 'push', target_reps: 40, week_start: '2026-10-26' };
  const raw = [
    { id: 'a1', athlete: 'me', log_id: 'L1', competition_id: 'A', challenge_id: 'chA', reps: 10, created_at: at(9, 0), reactions: [] },
    { id: 'b1', athlete: 'me', log_id: 'L1', competition_id: 'B', challenge_id: 'chB', reps: 10, created_at: at(9, 0), reactions: [] },
    { id: 'b2', athlete: 'jo', log_id: 'L2', competition_id: 'B', challenge_id: 'chB', reps: 5, created_at: at(8, 0), reactions: [] },
  ];
  const sets = S.mergeLogCopies(raw, ['A', 'B']).map(s => ({ kind: 'set', ...s }));
  const entries = F.buildFeedAll({
    items: sets,
    comps: [
      { c: { id: 'A' }, sides: sides('me', 'jo'), participantCount: 2, challenges: [chA], weekSets: raw.filter(s => s.competition_id === 'A') },
      { c: { id: 'B' }, sides: sides('me', 'jo'), participantCount: 2, challenges: [chB], weekSets: raw.filter(s => s.competition_id === 'B') },
    ],
  });
  const bursts = entries.filter(e => e.kind === 'burst');
  assert.equal(bursts.length, 2, 'Benny einmal (A+B), Jonas einmal');
  const mine = bursts.find(e => e.athlete === 'me');
  assert.deepEqual(plain(mine.competition_ids), ['A', 'B']);
  assert.equal(mine.progress, null, 'Anteil ist bei mehreren Challenges nicht eindeutig');
  const jo = bursts.find(e => e.athlete === 'jo');
  assert.deepEqual(plain(jo.competition_ids), ['B']);
  assert.deepEqual(plain(jo.progress), { value: 5, share: 20 });
  // A: Benny schafft seinen Anteil (10 von 10); B: Führungswechsel jo → me
  const ms = plain(entries.filter(e => e.kind === 'milestone').map(e => `${e.competition_id}:${e.type}`)).sort();
  assert.deepEqual(ms, ['A:share', 'B:lead']);
  // neueste zuerst, Meilenstein vor seiner Zeile
  assert.equal(entries[0].kind, 'milestone');
  assert.equal(entries[entries.length - 1].athlete, 'jo');
});

test('buildFeedAll: Rückblicke behalten ihre Challenge', () => {
  const entries = F.buildFeedAll({
    items: [{ kind: 'recap', id: 'A-recap-2026-10-19', competition_id: 'A', created_at: '2026-10-25T22:59:59.999Z' }],
    comps: [],
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, 'A-recap-2026-10-19');
  assert.equal(entries[0].competition_id, 'A');
});
