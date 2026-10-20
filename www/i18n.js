// Projekt Terminator — Sprachen (ohne React)
//
// Die Texte im Code sind Deutsch und zugleich der Schlüssel der Übersetzung:
//   tr('Einstellungen')                       → "Settings"
//   tr('Noch {n} offen', { n })               → Platzhalter in geschweiften Klammern
//   tr('Mit {name} trainieren', { name: <b>{x}</b> }) → React-Elemente gehen auch
//   trn(n, '{n} Satz', '{n} Sätze')            → Einzahl/Mehrzahl, `n` ist gesetzt
//   trc('Arbeit', 'Tag')                      → gleiches Wort, andere Bedeutung
// Wörterbücher liegen in i18n/<sprache>.js (PTi18n.add). Fehlt ein Eintrag, steht
// der deutsche Text da; tests/i18n.test.cjs prüft, dass alles übersetzt ist.
//
// Die Sprache steht beim Laden fest (Einstellung `pt:lang`, sonst die Gerätesprache),
// damit auch Konstanten auf oberster Ebene übersetzt werden. Ein Wechsel lädt die
// App neu.

(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const STORE_KEY = 'pt:lang';
  const SOURCE = 'de';
  // Reihenfolge = Liste in den Einstellungen. Namen in der jeweiligen Sprache.
  const LANGUAGES = [
    { code: 'de', name: 'Deutsch', locale: 'de-DE' },
    { code: 'en', name: 'English', locale: 'en-GB' },
  ];
  // Gerät in keiner unterstützten Sprache: Englisch versteht man eher.
  const FALLBACK = 'en';
  const dicts = {};

  const supported = (code) => LANGUAGES.some(l => l.code === code);
  const baseOf = (tag) => String(tag || '').toLowerCase().split(/[-_]/)[0];

  function readPref() {
    try { return root.localStorage?.getItem(STORE_KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function deviceTags() {
    const nav = root.navigator;
    if (!nav) return [];
    return (nav.languages && nav.languages.length ? Array.from(nav.languages) : [nav.language]).filter(Boolean);
  }

  // pref: 'system' | Sprachcode; tags: Gerätesprachen in Vorzugsreihenfolge.
  // Ohne Gerätesprache (Node-Tests) bleibt es beim Deutschen.
  function resolve(pref, tags) {
    if (supported(pref)) return pref;
    for (const tag of tags) if (supported(baseOf(tag))) return baseOf(tag);
    return tags.length ? FALLBACK : SOURCE;
  }

  // Datums- und Zahlenformat: die Region des Geräts, wenn seine Sprache passt
  // (en-US → 12-Stunden-Uhr), sonst die übliche Region der Sprache.
  function resolveLocale(lang, tags) {
    const own = tags.find(tag => baseOf(tag) === lang && /[-_]/.test(tag));
    if (own) {
      try { return Intl.getCanonicalLocales(own.replace('_', '-'))[0]; } catch (e) {}
    }
    return LANGUAGES.find(l => l.code === lang).locale;
  }

  const pref = readPref();
  const tags = deviceTags();
  const lang = resolve(pref, tags);
  const locale = resolveLocale(lang, tags);
  let plural = null;

  function lookup(key) {
    const d = dicts[lang];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }

  // Ersetzt {name}. Sind Werte React-Elemente, kommt ein Array für JSX zurück.
  function fill(text, vars) {
    if (!vars || text.indexOf('{') < 0) return text;
    let rich = false;
    const parts = text.split(/(\{\w+\})/).map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m || !Object.prototype.hasOwnProperty.call(vars, m[1])) return part;
      const v = vars[m[1]];
      if (v != null && typeof v === 'object') {
        rich = true;
        const R = root.React;
        return R && R.isValidElement(v) ? R.cloneElement(v, { key: 'i18n-' + i }) : v;
      }
      return v == null ? '' : String(v);
    });
    return rich ? parts.filter(p => p !== '') : parts.join('');
  }

  function tr(text, vars) {
    const hit = lookup(text);
    return fill(typeof hit === 'string' ? hit : text, vars);
  }

  // Schlüssel ist die deutsche Mehrzahl; der Eintrag hat je Form einen Text
  // ({ one, other }, für andere Sprachen auch few, many …).
  function trn(n, one, other, vars) {
    const all = Object.assign({ n }, vars);
    const hit = lookup(other);
    if (hit && typeof hit === 'object') {
      if (!plural) plural = new Intl.PluralRules(locale);
      return fill(hit[plural.select(n)] ?? hit.other, all);
    }
    return fill(n === 1 ? one : other, all);
  }

  // Kontext für Wörter mit mehreren Bedeutungen; Schlüssel "Kontext|Text".
  function trc(context, text, vars) {
    const hit = lookup(context + '|' + text);
    return fill(typeof hit === 'string' ? hit : text, vars);
  }

  function add(code, entries) {
    dicts[code] = Object.assign(dicts[code] || {}, entries);
  }

  function setPref(value) {
    try {
      if (value === 'system') root.localStorage?.removeItem(STORE_KEY);
      else root.localStorage?.setItem(STORE_KEY, value);
    } catch (e) {}
  }

  // ─── Formate ──────────────────────────────────────────────────────────────
  const number = (n, opts) => Number(n ?? 0).toLocaleString(locale, opts);
  const date = (d, opts) => (d instanceof Date ? d : new Date(d)).toLocaleDateString(locale, opts);
  const time = (d, opts) => (d instanceof Date ? d : new Date(d)).toLocaleTimeString(locale, opts || { hour: '2-digit', minute: '2-digit' });
  // ISO-Tag 'YYYY-MM-DD' als lokaler Kalendertag
  const day = (iso, opts) => date(new Date(iso + 'T00:00:00'), opts);
  // 500 → "5 €" / "€5", 250 → "2,50 €" / "€2.50"
  function euro(cents, opts) {
    const v = (cents || 0) / 100;
    const digits = Number.isInteger(v) ? 0 : 2;
    return v.toLocaleString(locale, Object.assign({
      style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: 2,
    }, opts));
  }
  // Kurze Wochentage ab Montag: Mo Di … / Mon Tue …
  const WEEKDAYS = {
    de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  };
  const weekdays = () => (WEEKDAYS[lang] || WEEKDAYS[SOURCE]).slice();

  if (root.document?.documentElement) root.document.documentElement.lang = lang;

  const api = {
    lang, locale, pref, source: SOURCE, storeKey: STORE_KEY,
    languages: LANGUAGES.map(l => Object.assign({}, l)),
    tr, trn, trc, add, setPref,
    number, date, time, day, euro, weekdays,
    // für Tests
    _resolve: resolve, _resolveLocale: resolveLocale, _dicts: dicts,
  };
  root.PTi18n = api;
  if (typeof window !== 'undefined') window.PTi18n = api;
  root.tr = tr;
  root.trn = trn;
  root.trc = trc;
})();
