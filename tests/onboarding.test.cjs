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
