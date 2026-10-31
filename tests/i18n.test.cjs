// Prüft www/i18n.js und dass alle Texte in www/ übersetzt sind (tools/i18n-check.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { check } = require('../tools/i18n-check.cjs');

const WWW = path.join(__dirname, '..', 'www');

// Lädt i18n.js wie im Browser; navigator/localStorage nach Wunsch.
function load({ languages, stored } = {}) {
  const store = new Map(stored ? [['pt:lang', stored]] : []);
  const ctx = {
    window: {}, console,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  };
  if (languages) ctx.navigator = { languages, language: languages[0] };
  vm.createContext(ctx);
  for (const f of ['i18n.js', ...['en', 'fi', 'sv'].map(lang => `i18n/${lang}.js`)]) {
    vm.runInContext(fs.readFileSync(path.join(WWW, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// ─── Sprache wählen ─────────────────────────────────────────────────────────

test('Gerätesprache entscheidet, wenn nichts eingestellt ist', () => {
  assert.equal(load({ languages: ['en-US', 'de-DE'] }).PTi18n.lang, 'en');
  assert.equal(load({ languages: ['de-AT'] }).PTi18n.lang, 'de');
  assert.equal(load({ languages: ['fr-FR', 'de-DE'] }).PTi18n.lang, 'de');
  assert.equal(load({ languages: ['fi-FI', 'sv-SE'] }).PTi18n.lang, 'fi');
  assert.equal(load({ languages: ['sv-FI', 'fi-FI'] }).PTi18n.lang, 'sv');
  assert.equal(load({ languages: ['fr-FR', 'sv_SE'] }).PTi18n.lang, 'sv');
});

test('unbekannte Gerätesprache fällt auf Englisch, ohne Gerät (Node) auf Deutsch', () => {
  assert.equal(load({ languages: ['fr-FR'] }).PTi18n.lang, 'en');
  assert.equal(load().PTi18n.lang, 'de');
});

test('Einstellung schlägt Gerätesprache', () => {
  assert.equal(load({ languages: ['en-US'], stored: 'de' }).PTi18n.lang, 'de');
  assert.equal(load({ languages: ['de-DE'], stored: 'en' }).PTi18n.lang, 'en');
  assert.equal(load({ languages: ['de-DE'], stored: 'xx' }).PTi18n.lang, 'de');
  assert.equal(load({ languages: ['sv-SE'], stored: 'fi' }).PTi18n.lang, 'fi');
  assert.equal(load({ languages: ['fi-FI'], stored: 'sv' }).PTi18n.lang, 'sv');
});

test('Format-Region folgt dem Gerät, wenn die Sprache passt', () => {
  assert.equal(load({ languages: ['en-US'] }).PTi18n.locale, 'en-US');
  assert.equal(load({ languages: ['de-CH'] }).PTi18n.locale, 'de-CH');
  assert.equal(load({ languages: ['de-DE'], stored: 'en' }).PTi18n.locale, 'en-GB');
  // Englisch gewählt auf deutschem Gerät: keine deutsche Zahlenschreibweise aus en-DE
  assert.equal(load({ languages: ['de', 'de-DE', 'en-DE'], stored: 'en' }).PTi18n.locale, 'en-GB');
  assert.equal(load({ languages: ['en-DE', 'de-DE'] }).PTi18n.locale, 'en-DE');
  assert.equal(load({ languages: ['en'] }).PTi18n.locale, 'en-GB');
  assert.equal(load({ languages: ['fi-FI'] }).PTi18n.locale, 'fi-FI');
  assert.equal(load({ languages: ['sv-FI'] }).PTi18n.locale, 'sv-FI');
  assert.equal(load({ languages: ['de-DE'], stored: 'fi' }).PTi18n.locale, 'fi-FI');
  assert.equal(load({ languages: ['de-DE'], stored: 'sv' }).PTi18n.locale, 'sv-SE');
});

// ─── tr / trn / trc ─────────────────────────────────────────────────────────

test('tr übersetzt und füllt Platzhalter', () => {
  const en = load({ languages: ['en-US'] });
  const de = load({ languages: ['de-DE'] });
  assert.equal(en.tr('Unbekannt'), 'Unknown');
  assert.equal(de.tr('Unbekannt'), 'Unbekannt');
  assert.equal(en.tr('vor {n} min', { n: 5 }), '5 min ago');
  assert.equal(de.tr('vor {n} min', { n: 5 }), 'vor 5 min');
  // fehlender Eintrag: deutscher Text, Platzhalter trotzdem gefüllt
  assert.equal(en.tr('Gibt es nicht {x}', { x: 1 }), 'Gibt es nicht 1');
  // unbekannte Platzhalter bleiben stehen
  assert.equal(en.tr('Team {team}', {}), 'Team {team}');
});

test('trn wählt Einzahl/Mehrzahl je Sprache', () => {
  const en = load({ languages: ['en-US'] });
  const de = load({ languages: ['de-DE'] });
  en.PTi18n.add('en', { '{n} Sätze': { one: 'one set', other: '{n} sets' } });
  assert.equal(en.trn(1, '{n} Satz', '{n} Sätze'), 'one set');
  assert.equal(en.trn(3, '{n} Satz', '{n} Sätze'), '3 sets');
  assert.equal(de.trn(1, '{n} Satz', '{n} Sätze'), '1 Satz');
  assert.equal(de.trn(0, '{n} Satz', '{n} Sätze'), '0 Sätze');
  assert.equal(en.trn(2, '{n} Satz von {name}', '{n} Sätze von {name}', { name: 'Lea' }), '2 Sätze von Lea');
});

test('trc trennt gleiche Wörter nach Bedeutung', () => {
  const en = load({ languages: ['en-US'] });
  en.PTi18n.add('en', { 'Arbeit|Tag': 'Tag', 'Tag': 'Day' });
  assert.equal(en.trc('Arbeit', 'Tag'), 'Tag');
  assert.equal(en.tr('Tag'), 'Day');
  assert.equal(load({ languages: ['de-DE'] }).trc('Arbeit', 'Tag'), 'Tag');
});

test('tr mit Objekt-Werten liefert Teile für JSX', () => {
  const en = load({ languages: ['en-US'] });
  const el = { type: 'b' };
  assert.deepEqual(Array.from(en.tr('Team {team}', { team: el })), ['Team ', el]);
});

test('Euro und Wochentage je Sprache', () => {
  const en = load({ languages: ['en-GB'] }).PTi18n;
  const de = load({ languages: ['de-DE'] }).PTi18n;
  assert.equal(en.euro(500), '€5');
  assert.equal(en.euro(250), '€2.50');
  assert.equal(de.euro(250).replace(/\s/g, ' '), '2,50 €');
  assert.deepEqual(Array.from(en.weekdays()).slice(0, 2), ['Mon', 'Tue']);
  assert.deepEqual(Array.from(de.weekdays()).slice(0, 2), ['Mo', 'Di']);
});

test('Finnische und schwedische Zahlen und Kalenderformate', () => {
  const fi = load({ languages: ['fi-FI'] }).PTi18n;
  const sv = load({ languages: ['sv-SE'] }).PTi18n;
  assert.equal(fi.number(1234.5).replace(/\s/g, ' '), '1 234,5');
  assert.equal(sv.number(1234.5).replace(/\s/g, ' '), '1 234,5');
  assert.equal(fi.day('2026-10-28'), '28.10.2026');
  assert.equal(sv.day('2026-10-28'), '2026-10-28');
  assert.deepEqual(Array.from(fi.weekdays()), ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']);
  assert.deepEqual(Array.from(sv.weekdays()), ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']);
  assert.equal(fi.euro(250).replace(/\s/g, ' '), '2,50 €');
  assert.equal(sv.euro(250).replace(/\s/g, ' '), '2,50 €');
});

test('Start- und Fehleransicht folgen auch vor i18n.js der gewählten Sprache', () => {
  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const boot = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('var LIMIT_MS'));
  for (const [stored, languages, lang, start, reload] of [
    [null, ['fi-FI'], 'fi', 'Käynnistetään…', 'Lataa uudelleen'],
    ['sv', ['fi-FI'], 'sv', 'Startar…', 'Ladda om'],
    ['constructor', ['fi-FI'], 'fi', 'Käynnistetään…', 'Lataa uudelleen'],
  ]) {
    let timeout;
    const label = {};
    const root = { innerHTML: '', querySelector: () => ({ addEventListener() {} }) };
    const ctx = {
      localStorage: { getItem: () => stored }, navigator: { languages },
      window: { addEventListener() {} }, location: { reload() {} },
      document: { documentElement: {}, querySelector: () => label, getElementById: id => id === 'root' ? root : {} },
      setTimeout: fn => { timeout = fn; },
    };
    vm.runInNewContext(boot, ctx);
    assert.equal(ctx.document.documentElement.lang, lang);
    assert.equal(label.textContent, start);
    timeout();
    assert.ok(root.innerHTML.includes(reload));
    assert.doesNotMatch(root.innerHTML, /App konnte nicht|The app couldn’t/);
  }
});

// ─── Vollständigkeit ────────────────────────────────────────────────────────

const result = check();
const show = (list) => list.map(p => `${p.file}:${p.line} ${p.msg ?? p.text}`).join('\n');

test('tr-Schlüssel sind feste Texte', () => {
  assert.deepEqual(result.problems.filter(p => p.kind === 'dynamic'), [], show(result.problems.filter(p => p.kind === 'dynamic')));
});

for (const lang of ['en', 'fi', 'sv']) {
  const localized = lang === 'en' ? result : check({ lang });
  test(`jeder Text hat einen ${lang}-Eintrag mit passenden Platzhaltern`, () => {
    const bad = localized.problems.filter(p => p.kind !== 'dynamic');
    assert.equal(bad.length, 0, show(bad));
    assert.deepEqual(localized.unused, []);
  });
}

test('kein deutscher Text ohne tr()', () => {
  assert.equal(result.german.length, 0, show(result.german));
});

test('keine verwaisten Einträge im Wörterbuch', () => {
  assert.deepEqual(result.unused, []);
});
