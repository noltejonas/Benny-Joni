// Projekt Terminator — Start-Zwischenspeicher (ohne React)
//
// Hält fest, was die App zuletzt vom Server geladen hat: Profil und Challenges
// ('account') und die Daten je Challenge ('comp:<id>'). app.jsx zeigt beim
// Öffnen sofort diesen Stand und lädt im Hintergrund frisch, statt mit
// „Lade Profil…“ und „Lade Daten…“ auf das Netz zu warten.
//
// Liegt in localStorage, pro Konto und Sprache (Kategorienamen sind übersetzt).
// Abmelden löscht alles. Tests: tests/boot-cache.test.cjs.

(function () {
  const PREFIX = 'pt:boot:';
  const VERSION = 1;               // erhöhen, wenn sich die Form der Daten ändert
  const MAX_AGE = 14 * 86400000;   // älter: lieber kurz laden als Wochen alten Stand zeigen
  const MAX_CHARS = 1500000;       // größere Stände nicht speichern (localStorage ~5 MB)
  const KEEP_COMPETITIONS = 3;     // Daten der zuletzt geöffneten Challenges
  const DELAY = 1000;              // Schreiben bündeln: Realtime lädt oft mehrmals hintereinander

  const pending = new Map();       // Schlüssel → { userId, name, data, timer }

  const keyOf = (userId, name) => `${PREFIX}${userId}:${name}`;
  const indexKey = (userId) => `${PREFIX}${userId}`;
  const lang = () => (typeof window !== 'undefined' && window.PTi18n?.lang) || null;

  function readIndex(userId) {
    try { return JSON.parse(localStorage.getItem(indexKey(userId)) || '{}') || {}; } catch (e) { return {}; }
  }

  function read(userId, name, now = Date.now()) {
    if (!userId) return null;
    const p = pending.get(keyOf(userId, name));
    if (p) return p.data;
    try {
      const entry = JSON.parse(localStorage.getItem(keyOf(userId, name)) || 'null');
      if (!entry || entry.v !== VERSION || entry.lang !== lang()) return null;
      if (!(now - entry.at >= 0 && now - entry.at < MAX_AGE)) return null;
      return entry.data ?? null;
    } catch (e) { return null; }
  }

  // Sofort schreiben; Daten anderer Challenges über KEEP_COMPETITIONS hinaus fliegen raus.
  function store(userId, name, data, now = Date.now()) {
    const key = keyOf(userId, name);
    try {
      const text = JSON.stringify({ v: VERSION, lang: lang(), at: now, data });
      const index = readIndex(userId);
      if (text.length > MAX_CHARS) {
        localStorage.removeItem(key);
        delete index[name];
      } else {
        index[name] = now;
        const comps = Object.keys(index).filter(n => n.startsWith('comp:')).sort((a, b) => index[b] - index[a]);
        for (const old of comps.slice(KEEP_COMPETITIONS)) {
          localStorage.removeItem(keyOf(userId, old));
          delete index[old];
        }
        try { localStorage.setItem(key, text); }
        catch (e) {
          // Speicher voll: die anderen Challenges opfern, sonst eben ohne.
          for (const other of comps) {
            if (other === name) continue;
            localStorage.removeItem(keyOf(userId, other));
            delete index[other];
          }
          try { localStorage.setItem(key, text); }
          catch (e2) { localStorage.removeItem(key); delete index[name]; }
        }
      }
      localStorage.setItem(indexKey(userId), JSON.stringify(index));
    } catch (e) {}
  }

  function write(userId, name, data) {
    if (!userId) return;
    const key = keyOf(userId, name);
    clearTimeout(pending.get(key)?.timer);
    const timer = setTimeout(() => { pending.delete(key); store(userId, name, data); }, DELAY);
    pending.set(key, { userId, name, data, timer });
  }

  function flush() {
    for (const [key, p] of pending) {
      clearTimeout(p.timer);
      pending.delete(key);
      store(p.userId, p.name, p.data);
    }
  }

  // Alle Konten; auch Schreibvorgänge, die noch warten.
  function clear() {
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  // Bevor iOS die App einfriert oder beendet: Wartendes noch speichern.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  }

  window.PTBootCache = { read, write, flush, clear, store };
})();
