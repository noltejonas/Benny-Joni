// Prüft das Onboarding-Modell aus www/onboarding-model.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'data.js', 'onboarding-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return { O: ctx.window.PTOnboarding, D: ctx.window.PTData };
}
const { O } = load();

// ── Codes und Links ─────────────────────────────────────────────────────────

test('normalizeCode nimmt getippte Codes in jeder Schreibweise', () => {
  assert.equal(O.normalizeCode('abc234'), 'ABC234');
  assert.equal(O.normalizeCode('  bj4k7x '), 'BJ4K7X');
  assert.equal(O.normalizeCode('BJ4 K7X'), 'BJ4K7X');
  assert.equal(O.normalizeCode('BJ4-K7X'), 'BJ4K7X');
});

test('normalizeCode lehnt falsche Länge und Sonderzeichen ab', () => {
  assert.equal(O.normalizeCode(''), null);
  assert.equal(O.normalizeCode(null), null);
  assert.equal(O.normalizeCode('ABC23'), null);
  assert.equal(O.normalizeCode('ABC2345'), null);
  assert.equal(O.normalizeCode('ABC!23'), null);
});

test('normalizeCode holt den Code aus einer ganzen Einladung', () => {
  const msg = 'Komm in meine Challenge „Büro-Battle“ bei Projekt Terminator 💪\nCode: 3a9uqm\n';
  assert.equal(O.normalizeCode(msg), '3A9UQM');
  // Wörter mit sechs Buchstaben („BATTLE“) sind kein Code
  assert.equal(O.normalizeCode('Büro-Battle ist super'), null);
});

test('normalizeCode versteht Links im Text', () => {
  assert.equal(O.normalizeCode('Direkt öffnen: projektterminator://join/3A9UQM'), '3A9UQM');
  assert.equal(O.normalizeCode('https://example.app/?join=team42'), 'TEAM42');
});

test('parseInviteUrl erkennt Schema, Query und Hash', () => {
  assert.equal(O.parseInviteUrl('projektterminator://join/BJ4K7X'), 'BJ4K7X');
  assert.equal(O.parseInviteUrl('projektterminator://join?code=bj4k7x'), 'BJ4K7X');
  assert.equal(O.parseInviteUrl('http://localhost:8000/?join=BJ4K7X'), 'BJ4K7X');
  assert.equal(O.parseInviteUrl('http://localhost:8000/?demo=new&join=BJ4K7X'), 'BJ4K7X');
  assert.equal(O.parseInviteUrl('http://localhost:8000/#join=BJ4K7X'), 'BJ4K7X');
  assert.equal(O.parseInviteUrl('http://localhost:8000/?demo=1'), null);
  assert.equal(O.parseInviteUrl('projektterminator://join/'), null);
  assert.equal(O.parseInviteUrl(''), null);
});

test('inviteLink und inviteText enthalten Code, Name und Link', () => {
  assert.equal(O.inviteLink('bj4k7x'), 'projektterminator://join/BJ4K7X');
  const text = O.inviteText({ name: 'Büro-Battle', invite_code: 'BJ4K7X' });
  assert.match(text, /„Büro-Battle“/);
  assert.match(text, /Code: BJ4K7X/);
  assert.match(text, /projektterminator:\/\/join\/BJ4K7X/);
  assert.equal(O.normalizeCode(text), 'BJ4K7X', 'die eigene Einladung lässt sich wieder einlesen');
});

// Wie auf einem englischen Gerät. Die Einladungstexte stehen hier selbst, damit
// der Test nicht vom Stand von i18n/en.js abhängt.
function loadEnglish() {
  const ctx = { window: {}, console, navigator: { languages: ['en-US'], language: 'en-US' } };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'i18n/en.js', 'data.js', 'onboarding-model.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  ctx.PTi18n.add('en', {
    'Komm in meine Challenge „{name}“ bei Projekt Terminator 💪': 'Join my challenge “{name}” on Projekt Terminator 💪',
    'Direkt öffnen: {link}': 'Open in the app: {link}',
  });
  return { O: ctx.window.PTOnboarding, I: ctx.PTi18n };
}

test('englische Einladung lässt sich wieder einlesen, auch ohne Link', () => {
  const { O: E, I } = loadEnglish();
  assert.equal(I.lang, 'en');
  const text = E.inviteText({ name: 'Office Battle', invite_code: 'bj4k7x' });
  assert.match(text, /^Join my challenge “Office Battle”/);
  assert.match(text, /Code: BJ4K7X/);
  assert.match(text, /projektterminator:\/\/join\/BJ4K7X/);
  assert.equal(E.normalizeCode(text), 'BJ4K7X');
  const withoutLink = text.split('\n').slice(0, 2).join('\n');
  assert.equal(E.normalizeCode(withoutLink), 'BJ4K7X', 'nur über „Code:“');
  // englische Wörter mit sechs Buchstaben („Office“, „Battle“) sind kein Code
  assert.equal(E.normalizeCode('Office Battle is great'), null);
  assert.equal(E.normalizeCode('Join my challenge “Office” on Projekt Terminator 💪'), null);
  // Einladungen in der jeweils anderen Sprache gehen auch
  assert.equal(O.normalizeCode(text), 'BJ4K7X');
  assert.equal(E.normalizeCode(O.inviteText({ name: 'Büro-Battle', invite_code: '3A9UQM' })), '3A9UQM');
});

// ── Einstieg ────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 9, 21, 12, 0).getTime(); // Mi 21.10.2026
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const comp = (extra = {}) => ({ id: 'c1', name: 'Duell', mode: '1v1', archived_at: null, ...extra });

test('entryRoute: Laden und ohne Konto', () => {
  assert.equal(O.entryRoute({ session: undefined }), 'loading');
  assert.equal(O.entryRoute({ session: null }), 'welcome');
  assert.equal(O.entryRoute({ session: {}, profile: null, competitions: null }), 'loading');
});

test('entryRoute: wer eine aktive Challenge hat, geht direkt in die App', () => {
  const r = O.entryRoute({ session: {}, profile: {}, competitions: [comp()], state: {}, invite: 'BJ4K7X' });
  assert.equal(r, 'app');
});

test('entryRoute: neue Person erst Profil, dann Einladung oder Start', () => {
  const base = { session: {}, profile: { created_at: daysAgo(0) }, competitions: [], now: NOW };
  assert.equal(O.entryRoute({ ...base, state: {} }), 'profile');
  assert.equal(O.entryRoute({ ...base, state: { profileDone: daysAgo(0) } }), 'start');
  assert.equal(O.entryRoute({ ...base, state: { profileDone: daysAgo(0) }, invite: 'BJ4K7X' }), 'join');
});

test('entryRoute: altes Konto ohne Challenge bekommt keinen Profilschritt', () => {
  const base = { session: {}, profile: { created_at: daysAgo(60) }, competitions: [], state: {}, now: NOW };
  assert.equal(O.entryRoute(base), 'start');
  assert.equal(O.entryRoute({ ...base, invite: 'BJ4K7X' }), 'join');
});

test('entryRoute: nur archivierte Challenges = bestehendes Konto, kein Profilschritt', () => {
  const base = { session: {}, profile: {}, competitions: [comp({ archived_at: daysAgo(3) })], state: {} };
  assert.equal(O.entryRoute(base), 'start');
  assert.equal(O.entryRoute({ ...base, invite: 'BJ4K7X' }), 'join');
});

test('isNewcomer: begonnenes Onboarding (30 Tage) oder junges Profil (14 Tage)', () => {
  assert.equal(O.isNewcomer({ state: { started: daysAgo(20) }, profile: { created_at: daysAgo(60) }, now: NOW }), true);
  assert.equal(O.isNewcomer({ state: { started: daysAgo(40) }, profile: { created_at: daysAgo(60) }, now: NOW }), false);
  assert.equal(O.isNewcomer({ state: {}, profile: { created_at: daysAgo(3) }, now: NOW }), true);
  assert.equal(O.isNewcomer({ state: {}, profile: { created_at: daysAgo(15) }, now: NOW }), false);
  assert.equal(O.isNewcomer({ state: {}, profile: {}, now: NOW }), false);
});

test('suggestName macht aus der E-Mail einen Vornamen', () => {
  assert.equal(O.suggestName('lenn.hoffmann@bauerlieferant.de'), 'Lenn');
  assert.equal(O.suggestName('max_99@example.com'), 'Max');
  assert.equal(O.suggestName('JONAS@example.com'), 'Jonas');
  assert.equal(O.suggestName('a.b@example.com'), '');
  assert.equal(O.suggestName(''), '');
  assert.equal(O.suggestName(undefined), '');
});

test('mergeState vereint Gerät und Profil', () => {
  const local = { started: 't1', dismissed: { c1: 't2' } };
  const remote = { profileDone: 't3', dismissed: { c2: 't4' }, weekOne: { c1: '2026-10-12' } };
  assert.deepEqual(JSON.parse(JSON.stringify(O.mergeState(local, remote))), {
    started: 't1', profileDone: 't3', dismissed: { c1: 't2', c2: 't4' }, weekOne: { c1: '2026-10-12' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(O.mergeState(null, undefined))), {});
});

// ── Wochenziel ──────────────────────────────────────────────────────────────

test('expectedPeople rechnet mit freien Plätzen, nie unter der echten Zahl', () => {
  assert.equal(O.expectedPeople('1v1', 1), 2);
  assert.equal(O.expectedPeople('1v1', 2), 2);
  assert.equal(O.expectedPeople('2v2', 1), 4);
  assert.equal(O.expectedPeople('ffa', 1), 2);
  assert.equal(O.expectedPeople('ffa', 5), 5);
  assert.equal(O.expectedPeople('2v2', 0), 4);
});

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const MON = at(2026, 10, 19), THU = at(2026, 10, 22), SUN = at(2026, 10, 25);

test('weekProgress: Tag der Woche und Resttage inklusive heute', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(O.weekProgress(MON))), { dayIndex: 1, daysLeft: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(O.weekProgress(THU))), { dayIndex: 4, daysLeft: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(O.weekProgress(SUN))), { dayIndex: 7, daysLeft: 1 });
});

test('goalDefault: Vorschlag je Übung, unter der Woche anteilig', () => {
  const push = { name: 'Liegestütze' }, pull = { name: 'Klimmzüge' }, other = { name: 'Burpee-Variante X' };
  assert.equal(O.goalDefault(push, MON), 100);
  assert.equal(O.goalDefault(pull, MON), 30);
  assert.equal(O.goalDefault(push, THU), 55, '100 × 4/7 ≈ 57 → auf 5 gerundet');
  assert.equal(O.goalDefault(push, SUN), 15);
  assert.equal(O.goalDefault({ name: 'HSPU' }, SUN), 10, 'nie unter 10');
  assert.equal(O.goalDefault(other, MON), 50);
});

test('goalChoices liefert Chips rund um den Vorschlag', () => {
  assert.deepEqual([...O.goalChoices(100)], [50, 100, 150, 200]);
  assert.deepEqual([...O.goalChoices(10)], [5, 10, 15, 20]);
});

test('goalTarget = pro Person × Personen', () => {
  assert.equal(O.goalTarget(100, 2), 200);
  assert.equal(O.goalTarget(30, 4), 120);
  assert.equal(O.goalTarget(0, 2), 1, 'Datenbank verlangt target_reps > 0');
});

// ── Startkarte ──────────────────────────────────────────────────────────────

test('starterItems: Daten haken Punkte ab, Push nur wenn fragbar oder erlaubt', () => {
  const items = O.starterItems({ activeMembers: 1, weekGoals: 0, mySets: 0, push: 'prompt' });
  assert.deepEqual(JSON.parse(JSON.stringify(items.map(i => [i.id, i.done]))), [['invite', false], ['goal', false], ['log', false], ['push', false]]);
  const done = O.starterItems({ activeMembers: 2, weekGoals: 1, mySets: 3, push: 'granted' });
  assert.ok(done.every(i => i.done));
  assert.deepEqual([...O.starterItems({ activeMembers: 2, weekGoals: 1, mySets: 0, push: 'denied' }).map(i => i.id)], ['invite', 'goal', 'log']);
  assert.deepEqual([...O.starterItems({ activeMembers: 2, weekGoals: 1, mySets: 0, push: 'unsupported' }).map(i => i.id)], ['invite', 'goal', 'log']);
});

test('showStarter: nur für Neue, nicht weggetippt, offen und in den ersten 14 Tagen', () => {
  const open = O.starterItems({ activeMembers: 1, weekGoals: 0, mySets: 0, push: 'prompt' });
  const all = O.starterItems({ activeMembers: 2, weekGoals: 1, mySets: 1, push: 'granted' });
  const base = { newcomer: true, items: open, dismissedAt: null, joinedAt: daysAgo(2), now: NOW };
  assert.equal(O.showStarter(base), true);
  assert.equal(O.showStarter({ ...base, newcomer: false }), false);
  assert.equal(O.showStarter({ ...base, dismissedAt: daysAgo(1) }), false);
  assert.equal(O.showStarter({ ...base, items: all }), false);
  assert.equal(O.showStarter({ ...base, joinedAt: daysAgo(15) }), false);
});

test('joinedMidWeek: Beitritt nach Montag in der laufenden Woche', () => {
  assert.equal(O.joinedMidWeek({ joinedAt: new Date(THU).toISOString(), now: THU }), true);
  assert.equal(O.joinedMidWeek({ joinedAt: new Date(MON).toISOString(), now: THU }), false);
  assert.equal(O.joinedMidWeek({ joinedAt: new Date(at(2026, 10, 15)).toISOString(), now: THU }), false, 'letzte Woche');
});

// ── Push ────────────────────────────────────────────────────────────────────

test('pushPrimerDue: nur wenn iOS noch fragen darf, mit wachsender Pause', () => {
  const D = 86400000;
  const base = { permission: 'prompt', enabled: true, primer: {}, now: NOW };
  assert.equal(O.pushPrimerDue(base), true);
  assert.equal(O.pushPrimerDue({ ...base, permission: 'granted' }), false);
  assert.equal(O.pushPrimerDue({ ...base, permission: 'denied' }), false);
  assert.equal(O.pushPrimerDue({ ...base, permission: 'unsupported' }), false);
  assert.equal(O.pushPrimerDue({ ...base, enabled: false }), false, 'in der App ausgeschaltet');
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 1, lastAt: NOW - 2 * D } }), false);
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 1, lastAt: NOW - 3 * D } }), true);
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 2, lastAt: NOW - 5 * D } }), false);
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 2, lastAt: NOW - 7 * D } }), true);
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 3, lastAt: NOW - 30 * D } }), false);
  assert.equal(O.pushPrimerDue({ ...base, primer: { asks: 3, lastAt: NOW }, manual: true }), true, 'selbst angetippt');
});

test('nextPrimerState zählt Nachfragen und merkt das Ergebnis', () => {
  const s1 = O.nextPrimerState({}, 'later', NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(s1)), { asks: 1, lastAt: NOW });
  const s2 = O.nextPrimerState(s1, 'granted', NOW + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s2)), { asks: 2, lastAt: NOW + 1, result: 'granted' });
});

// ── Woche 1 ─────────────────────────────────────────────────────────────────

test('weekOneDue: genau in Woche 2 der Mitgliedschaft und nur einmal', () => {
  const joined = new Date(at(2026, 10, 14)).toISOString(); // Mi der Vorwoche
  assert.equal(O.weekOneDue({ joinedAt: joined, startDate: '2026-10-01', now: THU }), '2026-10-12');
  assert.equal(O.weekOneDue({ joinedAt: joined, startDate: '2026-10-01', now: THU, seen: '2026-10-12' }), null);
  assert.equal(O.weekOneDue({ joinedAt: new Date(MON).toISOString(), startDate: '2026-10-01', now: THU }), null, 'noch Woche 1');
  assert.equal(O.weekOneDue({ joinedAt: new Date(at(2026, 10, 5)).toISOString(), startDate: '2026-10-01', now: THU }), null, 'schon Woche 3');
  assert.equal(O.weekOneDue({ joinedAt: new Date(at(2026, 10, 5)).toISOString(), startDate: '2026-10-14', now: THU }), '2026-10-12',
    'Start der Challenge nach dem Beitritt zählt');
});

test('weekOneSummary: Reps, aktive Tage, erfüllte Teile und Ergebnis', () => {
  const ws = '2026-10-12';
  const categories = [
    { id: 'push', name: 'Liegestütze', kind: 'sports', challenge_type: 'standard' },
    { id: 'th', name: 'Tom Holland', kind: 'sports', challenge_type: 'tom_holland' },
  ];
  const challenges = [
    { id: 'ch1', week_start: ws, category_id: 'push', target_reps: 200 },
    { id: 'ch2', week_start: ws, category_id: 'th', target_reps: 1 },
    { id: 'old', week_start: '2026-10-05', category_id: 'push', target_reps: 200 },
  ];
  const t = (d, h) => new Date(2026, 9, d, h).toISOString();
  const sets = [
    { challenge_id: 'ch1', athlete: 'me', reps: 60, created_at: t(12, 9) },
    { challenge_id: 'ch1', athlete: 'me', reps: 50, created_at: t(12, 19) },
    { challenge_id: 'ch1', athlete: 'me', reps: 20, created_at: t(14, 9) },
    { challenge_id: 'ch2', athlete: 'me', reps: 8, created_at: t(15, 9) },
    { challenge_id: 'ch1', athlete: 'jo', reps: 90, created_at: t(13, 9) },
    { challenge_id: 'old', athlete: 'me', reps: 999, created_at: t(6, 9) },
  ];
  const sides = [
    { userIds: ['me'], label: 'Benny', isMine: true },
    { userIds: ['jo'], label: 'Jonas', isMine: false },
  ];
  const s = O.weekOneSummary({ weekStart: ws, me: 'me', sides, sets, challenges, categories, participantCount: 2 });
  assert.equal(s.myReps, 130, 'Pflicht-Workouts und alte Wochen zählen nicht');
  assert.equal(s.activeDays, 3);
  assert.equal(s.sharesTotal, 2);
  assert.equal(s.sharesHit, 2, '130 ≥ 100 und ein Tom-Holland-Durchgang');
  assert.equal(s.result, 'won');
  assert.equal(s.diff, 40);

  const jonasView = [{ ...sides[1], isMine: true }, { ...sides[0], isMine: false }];
  const lost = O.weekOneSummary({ weekStart: ws, me: 'jo', sides: jonasView, sets, challenges, categories, participantCount: 2 });
  assert.equal(lost.result, 'lost');
  assert.equal(lost.leader, 'Benny');
  assert.equal(lost.sharesHit, 0);

  const solo = O.weekOneSummary({ weekStart: ws, me: 'me', sides: [sides[0]], sets, challenges, categories, participantCount: 1 });
  assert.equal(solo.result, 'solo');
});

// ── Fehlertexte (www/data.js) ───────────────────────────────────────────────

const { D } = load();
const err = (message, code) => Object.assign(new Error(message), code ? { code } : {});

test('friendlyError übersetzt Auth-Fehler nach Code und Text', () => {
  const cases = [
    [err('User already registered', 'user_already_exists'), 'Für diese E-Mail gibt es schon einen Account.'],
    [err('A user with this email address has already been registered', 'email_exists'), 'Für diese E-Mail gibt es schon einen Account.'],
    [err('Unable to validate email address: invalid format', 'validation_failed'), 'Diese E-Mail-Adresse sieht nicht richtig aus.'],
    [err('Email address "x@y" is invalid', 'email_address_invalid'), 'Diese E-Mail-Adresse sieht nicht richtig aus.'],
    [err('Password should be at least 6 characters.', 'weak_password'), 'Passwort muss mindestens 6 Zeichen haben.'],
    [err('Password is known to be weak and easy to guess', 'weak_password'), 'Passwort zu schwach. Nimm ein anderes.'],
    [err('email rate limit exceeded', 'over_email_send_rate_limit'), 'Zu viele Versuche. Warte kurz und probier es dann nochmal.'],
    [err('For security purposes, you can only request this after 42 seconds.', 'over_email_send_rate_limit'), 'Zu viele Versuche. Warte kurz und probier es dann nochmal.'],
    [err('Signups not allowed for this instance', 'signup_disabled'), 'Neue Konten sind gerade gesperrt.'],
    [err('Email not confirmed', 'email_not_confirmed'), 'E-Mail ist noch nicht bestätigt.'],
    [err('Invalid login credentials', 'invalid_credentials'), 'E-Mail oder Passwort falsch.'],
  ];
  for (const [input, text] of cases) assert.equal(D.friendlyError(input).message, text, input.message);
});

test('friendlyError erkennt Netzfehler', () => {
  for (const m of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
    const e = D.friendlyError(new TypeError(m));
    assert.equal(e.message, 'Keine Verbindung. Prüf dein Internet.');
    assert.equal(e.code, 'offline');
  }
  const retry = Object.assign(new Error('{}'), { name: 'AuthRetryableFetchError' });
  assert.equal(D.friendlyError(retry).message, 'Keine Verbindung. Prüf dein Internet.');
});

test('friendlyError behält RPC-Fehler und den Code', () => {
  const e = D.friendlyError(err('competition_full', 'P0001'));
  assert.equal(e.message, 'Diese Challenge ist schon voll.');
  assert.equal(e.code, 'P0001');
  const own = new Error('Bitte gib deinen Namen ein.');
  assert.equal(D.friendlyError(own).message, own.message, 'eigene Texte bleiben unverändert');
});

test('mergeState: der erste Stand gewinnt (so überschreibt ein Patch alte Werte)', () => {
  const patch = { weekOne: { c1: '2026-10-19' }, dismissed: { c1: 'neu' } };
  const current = { weekOne: { c1: '2026-10-12' }, dismissed: { c1: 'alt', c2: 'x' }, started: 't0' };
  assert.deepEqual(JSON.parse(JSON.stringify(O.mergeState(patch, current))), {
    weekOne: { c1: '2026-10-19' }, dismissed: { c1: 'neu', c2: 'x' }, started: 't0',
  });
});
