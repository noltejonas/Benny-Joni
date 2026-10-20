// Prüft das Onboarding-Modell aus www/onboarding-model.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['data.js', 'onboarding-model.js']) {
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
  const base = { session: {}, profile: {}, competitions: [] };
  assert.equal(O.entryRoute({ ...base, state: {} }), 'profile');
  assert.equal(O.entryRoute({ ...base, state: { profileDone: daysAgo(0) } }), 'start');
  assert.equal(O.entryRoute({ ...base, state: { profileDone: daysAgo(0) }, invite: 'BJ4K7X' }), 'join');
});

test('entryRoute: nur archivierte Challenges = bestehendes Konto, kein Profilschritt', () => {
  const base = { session: {}, profile: {}, competitions: [comp({ archived_at: daysAgo(3) })], state: {} };
  assert.equal(O.entryRoute(base), 'start');
  assert.equal(O.entryRoute({ ...base, invite: 'BJ4K7X' }), 'join');
});

test('isNewcomer: begonnenes Onboarding oder junges Profil', () => {
  assert.equal(O.isNewcomer({ state: { started: daysAgo(30) }, profile: { created_at: daysAgo(30) }, now: NOW }), true);
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
