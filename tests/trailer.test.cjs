// Prüft das Modell des Wochen-Trailers (www/trailer-model.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'trailer-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.PTTrailer;
}
const T = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

const side = (key, label, isMine = false) => ({ key, label, isMine, userIds: [key] });
// weekResult-Attrappe: totals[0] ist die eigene Seite
function res(id, totals, extra = {}) {
  const sides = totals.map((_, i) => side(i ? `u${i}` : 'me', i ? `Gegner ${i}` : 'Ich', i === 0));
  const sorted = [...totals].sort((a, b) => b - a);
  const top = sorted[0];
  const winners = totals.filter(v => v === top).length;
  const winner = winners === 1 && top > 0 ? totals.indexOf(top) : null;
  return {
    c: { id, name: `Challenge ${id}`, emoji: '💪' }, weekStart: '2026-11-09', sides, totals, unit: 'reps',
    winner, won: sides.length > 1 && winner === 0, tie: sides.length > 1 && winner == null && top > 0,
    solo: sides.length < 2, margin: sides.length > 1 ? sorted[0] - sorted[1] : 0,
    myRank: 1 + totals.filter(v => v > totals[0]).length, goalsHit: 1, goalsTotal: 2,
    ...extra,
  };
}

test('Trailer erst ab drei Challenges', () => {
  assert.equal(T.TRAILER_MIN, 3);
});

test('Zeitplan: Schnitte in ganzen Schlägen, Finale danach', () => {
  for (const n of [3, 5, 7, 8, 12]) {
    const t = T.timeline(n);
    assert.equal(t.cut % t.beat, 0, `n=${n}`);
    assert.equal(t.finale, t.cuts + n * t.cut);
    assert.ok(t.cut >= 2 || n > 8, `n=${n}: genug Zeit für den Spruch`);
  }
  // Soundtrack (22 s) reicht bis zum Finale bei acht Challenges
  assert.ok(T.timeline(8).finale <= 22);
});

test('Art des Ausgangs: Sieg, knapp, Gleichstand, Gruppe, Solo, nichts gemacht', () => {
  assert.equal(T.kindOf(res('a', [200, 100])), 'winBig');
  assert.equal(T.kindOf(res('a', [105, 100])), 'winClose');
  assert.equal(T.kindOf(res('a', [98, 100])), 'lossClose');
  assert.equal(T.kindOf(res('a', [40, 100])), 'lossBig');
  assert.equal(T.kindOf(res('a', [50, 50])), 'tie');
  assert.equal(T.kindOf(res('a', [90, 50, 70])), 'first');
  assert.equal(T.kindOf(res('a', [60, 50, 70])), 'mid');
  assert.equal(T.kindOf(res('a', [10, 50, 70])), 'last');
  assert.equal(T.kindOf(res('a', [80], { goalsHit: 2, goalsTotal: 2 })), 'soloDone');
  assert.equal(T.kindOf(res('a', [30], { goalsHit: 1, goalsTotal: 2 })), 'soloMiss');
  assert.equal(T.kindOf(res('a', [0, 70], { goalsHit: 0 })), 'ghost');
});

test('script: Bilanz, bester Auftritt und feste, verschiedene Sprüche', () => {
  const results = [res('a', [200, 100]), res('b', [40, 100]), res('c', [90, 50, 70]), res('d', [120, 100])];
  const S = T.script(results, { fmt: (v) => `${v} Reps`, nextWeek: 47 });
  assert.equal(S.count, 4);
  assert.deepEqual(plain(S.record), { wins: 3, losses: 1, ties: 0, duels: 3, reps: 450, goalsHit: 4, goalsTotal: 8, competitive: true });
  assert.equal(S.mvp.r.c.id, 'a');
  assert.equal(S.big, true);
  assert.equal(S.verdictLine, '3 Siege. Die Konkurrenz sucht schon Ausreden.');
  assert.deepEqual(S.cuts.map(c => c.verdict), ['SIEG', 'NIEDERLAGE', 'PLATZ 1', 'SIEG']);
  assert.deepEqual(S.cuts.map(c => c.look), ['versus', 'number', 'rank', 'bars']);
  assert.equal(S.cold.length, 2);
  // Dieselbe Woche ergibt dieselben Sprüche, keiner doppelt
  const again = T.script(results, { fmt: (v) => `${v} Reps`, nextWeek: 47 });
  assert.deepEqual(S.cuts.map(c => c.line), again.cuts.map(c => c.line));
  const lines = S.cuts.map(c => c.line);
  assert.equal(new Set(lines).size, lines.length);
  assert.ok(lines.every(l => l && !/\{\w+\}/.test(l)), 'alle Platzhalter gefüllt');
  assert.ok(!/\{\w+\}/.test(S.tagline));
});

test('script: nur Niederlagen und ohne Duelle', () => {
  const lost = T.script([res('a', [10, 100]), res('b', [20, 100]), res('c', [30, 100])]);
  assert.equal(lost.verdictLine, 'Null Siege. Dafür 100 % Comeback-Potenzial.');
  assert.equal(lost.mvp, null);
  assert.equal(lost.big, false);
  const solo = T.script([res('a', [80], { goalsHit: 2, goalsTotal: 2 }), res('b', [10]), res('c', [5])]);
  assert.equal(solo.record.competitive, false);
  assert.equal(solo.verdictLine, '4 von 6 Zielen. Die Woche ist im Kasten.');
  assert.deepEqual(solo.cuts.map(c => c.look), ['goals', 'goals', 'goals']);
});

test('Soundtrack liegt bei und ist lang genug', () => {
  const wav = fs.readFileSync(path.join(__dirname, '..', 'www', 'sounds', 'trailer.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  const rate = wav.readUInt32LE(24), channels = wav.readUInt16LE(22), bytes = wav.readUInt32LE(40);
  const seconds = bytes / (rate * channels * 2);
  assert.ok(seconds >= T.timeline(8).finale, `${seconds}s`);
  assert.ok(wav.length < 1.2 * 1024 * 1024, 'unter 1,2 MB');
});
