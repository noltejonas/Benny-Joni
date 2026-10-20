// Prüft die Push-Regeln aus supabase/functions/_shared/push-rules.ts (und die
// APNs-Helfer aus _shared/apns.ts) ohne Deno: Node entfernt die Typen, das
// Modul wird als data:-URL geladen (package.json steht auf commonjs).
// Aufruf: node --test tests/push-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fn = (p) => join(root, 'supabase', 'functions', p);

async function loadTs(path) {
  const js = stripTypeScriptTypes(readFileSync(path, 'utf8'));
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

const R = await loadTs(fn('_shared/push-rules.ts'));
const A = await loadTs(fn('_shared/apns.ts'));
const at = (iso) => new Date(iso);

// ── Berliner Zeit und Zeitumstellung (25.10.2026, 3 Uhr → 2 Uhr) ─────────────

test('berlinTime: Stunde, Datum und Wochentag in Berlin', () => {
  assert.deepEqual(R.berlinTime(at('2026-10-21T17:00:00Z')), { date: '2026-10-21', hour: 19, weekday: 3 });
  assert.deepEqual(R.berlinTime(at('2026-10-21T22:30:00Z')), { date: '2026-10-22', hour: 0, weekday: 4 });
  assert.equal(R.berlinHour('2026-10-21T18:00:00.123456+00:00'), 20);
});

test('Zeitumstellung: ab dem 25.10. ist 17:00 UTC = 18 Uhr Berlin', () => {
  // Samstag 24.10. noch Sommerzeit (UTC+2)
  assert.deepEqual(R.berlinTime(at('2026-10-24T17:00:00Z')), { date: '2026-10-24', hour: 19, weekday: 6 });
  // Sonntag 25.10. Winterzeit (UTC+1)
  assert.deepEqual(R.berlinTime(at('2026-10-25T17:00:00Z')), { date: '2026-10-25', hour: 18, weekday: 7 });
  assert.equal(R.berlinHour(at('2026-10-25T16:00:00Z')), 17);
  // Die doppelte Stunde in der Nacht: beide Male 2 Uhr am 25.10.
  assert.deepEqual(R.berlinTime(at('2026-10-25T00:30:00Z')), { date: '2026-10-25', hour: 2, weekday: 7 });
  assert.deepEqual(R.berlinTime(at('2026-10-25T01:30:00Z')), { date: '2026-10-25', hour: 2, weekday: 7 });
  // Montag 26.10.: 18:00 UTC = 19 Uhr
  assert.deepEqual(R.berlinTime(at('2026-10-26T18:00:00Z')), { date: '2026-10-26', hour: 19, weekday: 1 });
});

test('nudgeKindFor: Mo–Sa 19 Uhr Tageserinnerung, So 18 Uhr letzte Chance', () => {
  assert.equal(R.nudgeKindFor(1, 19), 'daily');
  assert.equal(R.nudgeKindFor(6, 19), 'daily');
  assert.equal(R.nudgeKindFor(3, 18), null);
  assert.equal(R.nudgeKindFor(3, 20), null);
  assert.equal(R.nudgeKindFor(7, 18), 'last_call');
  assert.equal(R.nudgeKindFor(7, 19), null);
  assert.equal(R.nudgeKindFor(7, 17), null);
});

test('stündlicher Cron trifft trotz Zeitumstellung genau eine Stunde', () => {
  const kinds = (fromIso, hours) => {
    const out = [];
    for (let h = 0; h < hours; h++) {
      const d = new Date(Date.parse(fromIso) + h * 3600_000);
      const t = R.berlinTime(d);
      const k = R.nudgeKindFor(t.weekday, t.hour);
      if (k) out.push(`${d.toISOString().slice(0, 13)}Z ${k}`);
    }
    return out;
  };
  // Samstag 24.10. bis Montag 26.10. (UTC)
  assert.deepEqual(kinds('2026-10-24T00:00:00Z', 72), [
    '2026-10-24T17Z daily', // 19 Uhr Sommerzeit
    '2026-10-25T17Z last_call', // 18 Uhr Winterzeit
    '2026-10-26T18Z daily', // 19 Uhr Winterzeit
  ]);
  // Sonntag davor, noch Sommerzeit: 18 Uhr = 16:00 UTC
  assert.deepEqual(kinds('2026-10-18T00:00:00Z', 24), ['2026-10-18T16Z last_call']);
});

test('isQuietHour: 22–7 Uhr Berlin, vor und nach der Zeitumstellung', () => {
  assert.equal(R.isQuietHour(at('2026-10-21T19:59:00Z')), false); // 21:59
  assert.equal(R.isQuietHour(at('2026-10-21T20:00:00Z')), true); // 22:00
  assert.equal(R.isQuietHour(at('2026-10-22T04:59:00Z')), true); // 06:59
  assert.equal(R.isQuietHour(at('2026-10-22T05:00:00Z')), false); // 07:00
  assert.equal(R.isQuietHour(at('2026-10-26T05:59:00Z')), true); // 06:59 Winterzeit
  assert.equal(R.isQuietHour(at('2026-10-26T06:00:00Z')), false); // 07:00
  assert.equal(R.isQuietHour(at('2026-10-26T20:59:00Z')), false); // 21:59
  assert.equal(R.isQuietHour(at('2026-10-26T21:00:00Z')), true); // 22:00
  assert.equal(R.hourIsQuiet(3, null), false);
  assert.equal(R.hourIsQuiet(13, { start: 12, end: 14 }), true);
});

test('berlinDate und berlinWeekStart um Mitternacht', () => {
  assert.equal(R.berlinDate(at('2026-10-26T22:30:00Z')), '2026-10-26'); // 23:30 MEZ
  assert.equal(R.berlinDate(at('2026-10-26T23:30:00Z')), '2026-10-27'); // 00:30 MEZ
  assert.equal(R.berlinWeekStart(at('2026-10-25T17:00:00Z')), '2026-10-19');
  assert.equal(R.berlinWeekStart(at('2026-10-25T23:30:00Z')), '2026-10-26'); // Montag 00:30
  assert.equal(R.berlinWeekStart(at('2026-10-18T22:30:00Z')), '2026-10-19'); // Montag 00:30 MESZ
  assert.equal(R.addDays('2026-10-31', 1), '2026-11-01');
});

// ── Env und Schwelle ─────────────────────────────────────────────────────────

test('thresholdFromEnv: Standard 10, sonst ganze Zahl ab 1', () => {
  assert.equal(R.RIVAL_THRESHOLD_DEFAULT, 10);
  assert.equal(R.thresholdFromEnv(undefined), 10);
  assert.equal(R.thresholdFromEnv(''), 10);
  assert.equal(R.thresholdFromEnv(' 20 '), 20);
  assert.equal(R.thresholdFromEnv('7.9'), 7);
  assert.equal(R.thresholdFromEnv('abc'), 10);
  assert.equal(R.thresholdFromEnv('0'), 10);
  assert.equal(R.thresholdFromEnv('-5'), 10);
});

test('rivalReached: ab der Schwelle einschließlich', () => {
  assert.equal(R.rivalReached(10, 10), true);
  assert.equal(R.rivalReached(9, 10), false);
  assert.equal(R.rivalReached(null, 10), false);
});

test('flagFromEnv: DRY_RUN ist ohne Angabe an', () => {
  assert.equal(R.flagFromEnv(undefined, true), true);
  assert.equal(R.flagFromEnv('false', true), false);
  assert.equal(R.flagFromEnv('FALSE', true), false);
  assert.equal(R.flagFromEnv('0', true), false);
  assert.equal(R.flagFromEnv('true', false), true);
  assert.equal(R.flagFromEnv('vielleicht', true), true);
});

test('isFresh: nur Ereignisse der letzten 15 Minuten', () => {
  const now = at('2026-10-21T10:00:00Z');
  assert.equal(R.isFresh('2026-10-21T09:50:00Z', now), true);
  assert.equal(R.isFresh('2026-10-21T09:40:00Z', now), false);
  assert.equal(R.isFresh(null, now), false);
});

// ── Anteil ──────────────────────────────────────────────────────────────────

test('sharePeople: echte Teilnehmer ab 2, sonst erwartete Besetzung', () => {
  assert.equal(R.sharePeople('1v1', 1), 2);
  assert.equal(R.sharePeople('2v2', 1), 4);
  assert.equal(R.sharePeople('2v2', 3), 3);
  assert.equal(R.sharePeople('ffa', 5), 5);
  assert.equal(R.sharePeople('ffa', 1), 2);
  assert.equal(R.fairShareOf(100, 2), 50);
  assert.equal(R.fairShareOf(101, 2), 51);
});

test('participantsFor: wie in der App, mit Austritt in der Woche', () => {
  const ms = [
    { user_id: 'a', joined_at: '2026-10-01T10:00:00Z', left_at: null },
    { user_id: 'b', joined_at: '2026-10-01T10:00:00Z', left_at: '2026-10-20T10:00:00Z' }, // in dieser Woche gegangen
    { user_id: 'c', joined_at: '2026-10-01T10:00:00Z', left_at: '2026-10-15T10:00:00Z' }, // Vorwoche
    { user_id: 'd', joined_at: '2026-10-26T08:00:00Z', left_at: null }, // erst nächste Woche
  ];
  assert.deepEqual(R.participantsFor(ms, '2026-10-19').map((m) => m.user_id), ['a', 'b']);
  assert.deepEqual(R.participantsFor([], '2026-10-19'), []);
});

// ── Texte ────────────────────────────────────────────────────────────────────

test('Texte: Rivale wie im Vorab-Bildschirm, Erinnerungen kurz', () => {
  assert.deepEqual(R.rivalAlert({ senderName: 'Benny', senderToday: 12, compName: 'Büro-Battle', compEmoji: '💪' }), {
    title: '🔥 Benny ist los', subtitle: '💪 Büro-Battle', body: 'Schon 12 Reps heute — du noch bei 0.',
  });
  assert.deepEqual(R.dailyNudgeAlert({ compName: 'Büro-Battle', rivalName: 'Joni', rivalToday: 40 }), {
    title: '⏰ Heute noch nichts für Büro-Battle', body: 'Joni hat schon 40 Reps – zieh nach!',
  });
  assert.equal(R.dailyNudgeAlert({ compName: 'Büro-Battle', rivalToday: 0 }).body, 'Ein Satz reicht, um vorzulegen.');
  assert.equal(
    R.lastCallAlert({ compName: 'X', missing: [{ amount: 20, name: 'Liegestütze' }, { amount: 5, name: 'Dips' }] }).body,
    'Dir fehlen noch 20 Liegestütze und 5 Dips bis Mitternacht.',
  );
  assert.equal(R.joinAlert({ name: 'Joni', mode: '1v1', compName: 'X', compEmoji: '⚔️' }).title, '🎉 Joni ist dabei');
  assert.equal(R.joinAlert({ name: 'Joni', mode: 'ffa', compName: 'X' }).body, 'Die Challenge läuft. Leg los!');
  assert.equal(
    R.reactionAlert({ reactorName: 'Joni', emoji: '🔥', amount: 25, unitName: 'Klimmzüge', compName: 'X' }).body,
    'Joni hat auf deine 25 Klimmzüge reagiert.',
  );
  assert.equal(R.reactionAlert({ reactorName: 'Joni', emoji: '🔥', compName: 'X' }).body, 'Joni hat auf deinen Satz reagiert.');
  assert.equal(R.cleanText('a'.repeat(50), 10), 'aaaaaaaaa…');
  assert.equal(R.cleanText('  ', 10, 'Jemand'), 'Jemand');
  assert.equal(R.joinList(['a', 'b', 'c']), 'a, b und c');
});

test('Texte nennen weder den alten Namen noch Tom Holland', () => {
  const src = readFileSync(fn('_shared/push-rules.ts'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(src, /Projekt Terminator|Tom Holland/);
});

// ── Tageserinnerung planen ──────────────────────────────────────────────────

const TODAY = '2026-10-21'; // Mittwoch
const WEEK = '2026-10-19';
const comp = (id, extra = {}) => ({ id, name: `C-${id}`, emoji: '💪', mode: '1v1', start_date: '2026-10-01', end_date: null, archived_at: null, ...extra });
const member = (competition_id, user_id, extra = {}) => ({
  competition_id, user_id, team: null, joined_at: '2026-10-01T10:00:00Z', left_at: null, display_name: user_id.toUpperCase(), main_competition_id: null, ...extra,
});
const goal = (id, competition_id, target, cat = {}) => ({
  id, competition_id, target_reps: target, category: { name: 'Liegestütze', kind: 'sports', challenge_type: 'standard', ...cat },
});
const set = (user_id, competition_id, challenge_id, reps, created_at) => ({ user_id, competition_id, challenge_id, reps, created_at });

function base(over = {}) {
  return {
    kind: 'daily', today: TODAY, weekStart: WEEK,
    tokenUsers: ['a', 'b'],
    competitions: [comp('c1')],
    members: [member('c1', 'a'), member('c1', 'b')],
    goals: [
      goal('g1', 'c1', 100),
      goal('g2', 'c1', 1, { name: 'Bring Sally Up', challenge_type: 'bring_sally_up' }),
      goal('g3', 'c1', 60, { name: 'Coding', kind: 'work' }),
    ],
    sets: [
      set('b', 'c1', 'g1', 15, '2026-10-21T10:00:00Z'),
      set('a', 'c1', 'g1', 20, '2026-10-19T10:00:00Z'),
    ],
    alreadyPushed: [],
    ...over,
  };
}

test('daily: wer heute nichts hat, bekommt die Erinnerung mit dem Rivalen', () => {
  const plans = R.planNudges(base());
  assert.deepEqual(plans, [{
    user_id: 'a', competition_id: 'c1', kind: 'daily',
    alert: { title: '⏰ Heute noch nichts für C-c1', body: 'B hat schon 15 Reps – zieh nach!' },
  }]);
});

test('daily: Obergrenze, fehlendes Token und Aktivität heute verhindern die Erinnerung', () => {
  assert.deepEqual(R.planNudges(base({ alreadyPushed: [R.pushKey('a', 'c1')] })), []);
  assert.deepEqual(R.planNudges(base({ tokenUsers: ['b'] })), []);
  // Ein Pflicht-Workout heute zählt als „heute schon was gemacht“.
  const withWorkout = base();
  withWorkout.sets.push(set('a', 'c1', 'g2', 180, '2026-10-21T06:00:00Z'));
  assert.deepEqual(R.planNudges(withWorkout), []);
});

test('daily: Workout-Sätze des Rivalen zählen nicht als Reps', () => {
  const p = base({ sets: [set('b', 'c1', 'g2', 204, '2026-10-21T10:00:00Z')] });
  assert.equal(R.planNudges(p)[0].alert.body, 'Ein Satz reicht, um vorzulegen.');
});

test('daily: Satz kurz nach Mitternacht (Winterzeit) zählt für den neuen Tag', () => {
  const p = base({
    today: '2026-10-26', weekStart: '2026-10-26',
    goals: [goal('g9', 'c1', 100)],
    sets: [set('a', 'c1', 'g9', 10, '2026-10-25T23:30:00Z')], // Montag 00:30 MEZ
  });
  assert.deepEqual(R.planNudges(p).map((x) => x.user_id), ['b']);
  // 22:30 UTC ist noch Sonntag → zählt nicht für Montag
  p.sets = [set('a', 'c1', 'g9', 10, '2026-10-25T22:30:00Z')];
  assert.deepEqual(R.planNudges(p).map((x) => x.user_id).sort(), ['a', 'b']);
});

test('daily: ohne Wiederholungs-Ziele, archiviert oder beendet keine Erinnerung', () => {
  assert.deepEqual(R.planNudges(base({ goals: [goal('g2', 'c1', 1, { challenge_type: 'tom_holland' })] })), []);
  assert.deepEqual(R.planNudges(base({ competitions: [comp('c1', { archived_at: '2026-10-20T10:00:00Z' })] })), []);
  assert.deepEqual(R.planNudges(base({ competitions: [comp('c1', { end_date: '2026-10-20' })] })), []);
  assert.deepEqual(R.planNudges(base({ competitions: [comp('c1', { start_date: '2026-10-22' })] })), []);
});

test('daily: bei 2v2 kommt der Rivale aus dem anderen Team, ausgetretene zählen nicht', () => {
  const p = base({
    tokenUsers: ['a'],
    competitions: [comp('c1', { mode: '2v2' })],
    members: [
      member('c1', 'a', { team: 'A' }), member('c1', 'c', { team: 'A' }),
      member('c1', 'b', { team: 'B' }), member('c1', 'd', { team: 'B', left_at: '2026-10-20T10:00:00Z' }),
    ],
    sets: [
      set('c', 'c1', 'g1', 50, '2026-10-21T09:00:00Z'),
      set('b', 'c1', 'g1', 10, '2026-10-21T09:00:00Z'),
      set('d', 'c1', 'g1', 99, '2026-10-21T09:00:00Z'),
    ],
  });
  assert.equal(R.planNudges(p)[0].alert.body, 'B hat schon 10 Reps – zieh nach!');
});

test('daily: höchstens eine Erinnerung pro Nutzer und Lauf, Haupt-Challenge zuerst', () => {
  const p = base({
    tokenUsers: ['a'],
    competitions: [comp('c1'), comp('c2')],
    members: [member('c1', 'a'), member('c1', 'b'), member('c2', 'a', { main_competition_id: 'c2' }), member('c2', 'e')],
    goals: [goal('g1', 'c1', 100), goal('g5', 'c2', 100)],
    sets: [set('b', 'c1', 'g1', 30, '2026-10-21T09:00:00Z')],
  });
  // Haupt-Challenge schlägt den aktiveren Rivalen
  p.members = p.members.map((m) => (m.user_id === 'a' ? { ...m, main_competition_id: 'c2' } : m));
  assert.deepEqual(R.planNudges(p).map((x) => x.competition_id), ['c2']);
  // Ohne Haupt-Challenge: die mit dem aktivsten Rivalen
  p.members = p.members.map((m) => ({ ...m, main_competition_id: null }));
  assert.deepEqual(R.planNudges(p).map((x) => x.competition_id), ['c1']);
  assert.equal(R.planNudges({ ...p, maxPerUser: 2 }).length, 2);
});

test('last_call: offener Wochenanteil nach SHARE_BASIS', () => {
  const p = base({ kind: 'last_call', today: '2026-10-25' });
  // 1v1, 2 Teilnehmer: Anteil 50. A hat 20, B 15.
  const plans = R.planNudges(p);
  assert.deepEqual(plans.map((x) => [x.user_id, x.alert.body]), [
    ['a', 'Dir fehlen noch 30 Liegestütze bis Mitternacht.'],
    ['b', 'Dir fehlen noch 35 Liegestütze bis Mitternacht.'],
  ]);
  assert.equal(plans[0].alert.title, '⏳ Letzte Chance für C-c1');
  // Wer den Anteil hat, bekommt nichts. Arbeit (Minuten) und Workouts zählen nicht.
  p.sets.push(set('a', 'c1', 'g1', 30, '2026-10-24T10:00:00Z'));
  assert.deepEqual(R.planNudges(p).map((x) => x.user_id), ['b']);
});

test('last_call: allein gerechnet mit erwarteter Besetzung, ausgetretene zählen in der Woche mit', () => {
  // Allein in 1v1: Anteil = 100 / 2
  const solo = base({ kind: 'last_call', today: '2026-10-25', tokenUsers: ['a'], members: [member('c1', 'a')], sets: [] });
  assert.equal(R.planNudges(solo)[0].alert.body, 'Dir fehlen noch 50 Liegestütze bis Mitternacht.');
  // ffa mit 3 Teilnehmern in dieser Woche (einer ist am Dienstag gegangen): 90 / 3 = 30
  const ffa = base({
    kind: 'last_call', today: '2026-10-25', tokenUsers: ['a'],
    competitions: [comp('c1', { mode: 'ffa' })],
    members: [member('c1', 'a'), member('c1', 'b'), member('c1', 'x', { left_at: '2026-10-20T10:00:00Z' })],
    goals: [goal('g1', 'c1', 90), goal('g4', 'c1', 30, { name: 'Dips' })],
    sets: [set('a', 'c1', 'g1', 10, '2026-10-20T10:00:00Z')],
  });
  assert.equal(R.planNudges(ffa)[0].alert.body, 'Dir fehlen noch 20 Liegestütze und 10 Dips bis Mitternacht.');
});

// ── APNs-Helfer (ohne Netz) ─────────────────────────────────────────────────

test('sendToDevices: zählt Zustellungen und sammelt tote Tokens', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const token = url.split('/').pop();
    if (token === 't4') throw new Error('offline');
    const reply = { t1: [200, ''], t2: [410, '{"reason":"Unregistered"}'], t3: [400, '{"reason":"BadDeviceToken"}'] }[token];
    return new Response(reply[1], { status: reply[0] });
  };
  try {
    const cfg = A.apnsConfigFrom((k) => ({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: 'P' })[k]);
    assert.equal(cfg.env, 'production');
    assert.equal(cfg.bundleId, 'com.bennyjoni.terminator');
    assert.equal(A.apnsConfigured(cfg), true);
    assert.equal(A.apnsConfigured(A.apnsConfigFrom(() => undefined)), false);
    const r = await A.sendToDevices(cfg, 'jwt', ['t1', 't2', 't3', 't4'], { aps: { alert: { body: 'x' } } });
    assert.equal(r.sent, 1);
    assert.deepEqual(r.dead, ['t2', 't3']);
    assert.equal(r.failures.length, 3);
    assert.ok(calls[0].url.startsWith('https://api.push.apple.com/3/device/'));
    assert.equal(calls[0].init.headers['apns-topic'], 'com.bennyjoni.terminator');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── Code-Regeln der Functions (statisch, Deno läuft hier nicht) ─────────────

test('notify-set: Schwelle aus Env, Antwort ohne Empfänger und Tageswert', () => {
  const src = readFileSync(fn('notify-set/index.ts'), 'utf8');
  assert.doesNotMatch(src, /RIVAL_THRESHOLD = 100/);
  assert.match(src, /thresholdFromEnv\(Deno\.env\.get\("RIVAL_THRESHOLD"\)\)/);
  for (const m of src.matchAll(/Response\.json\(([\s\S]*?)\);/g)) {
    assert.doesNotMatch(m[1], /recipients|senderToday/, `Antwort verrät Daten: ${m[1]}`);
  }
  // Ruhezeit vor dem Anlegen des Clients, also vor jedem push_log-Insert
  assert.ok(src.indexOf('isQuietHour(') < src.indexOf('createClient(SUPABASE_URL'));
});

test('daily-nudge: im DRY_RUN kein Versand und kein push_log', () => {
  const src = readFileSync(fn('daily-nudge/index.ts'), 'utf8');
  const dry = src.indexOf('if (dryRun) {');
  const ret = src.indexOf('return Response.json({ dry_run: true', dry);
  const send = src.indexOf('await sendPlans(');
  assert.ok(dry > 0 && ret > dry && send > ret, 'sendPlans darf erst nach dem DRY_RUN-Return kommen');
  assert.doesNotMatch(src.slice(0, send), /sendToDevices\(|sendApns\(|\.insert\(/);
  assert.doesNotMatch(src, /sendApns/);
  assert.match(src, /flagFromEnv\(Deno\.env\.get\("DRY_RUN"\), true\)/);
  // NUDGE_SECRET fail closed
  assert.match(src, /if \(!NUDGE_SECRET\)/);
});
