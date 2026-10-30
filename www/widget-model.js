// Benny & Joni — Homescreen-Widget (iOS, WidgetKit): Daten und Links.
//
// Das Widget (ios/App/BennyJoniWidget) kann nicht selbst auf den Server
// zugreifen. Die App legt deshalb nach jedem Laden einen kleinen, fertig
// formulierten Schnappschuss der Woche ab (WidgetBridge → geteilte Keychain), aus
// demselben Modell wie „Heute“ (PTDashboard.buildDashboard). Was sich ohne
// App von Tag zu Tag ändert („heute noch …“, „noch n Tage“), steht für jeden
// Wochentag schon drin; das Widget wählt nur den heutigen Eintrag. Gehört der
// Schnappschuss zu einer vergangenen Woche, zeigt das Widget „Neue Woche“.
//
// Links aus dem Widget: projektterminator://widget/home,
// …/widget/challenge/<id> und …/widget/exercise/<Übungsschlüssel>.
// Tests: tests/widget-model.test.cjs.

(function () {
  const VERSION = 1;
  const SCHEME = 'projektterminator';
  const MAX_COMPS = 4;
  const MAX_EXERCISES = 6;

  const linkHome = () => `${SCHEME}://widget/home`;
  const linkChallenge = (id) => `${SCHEME}://widget/challenge/${encodeURIComponent(id)}`;
  const linkExercise = (key) => `${SCHEME}://widget/exercise/${encodeURIComponent(key)}`;

  // { kind: 'home' } | { kind: 'challenge', id } | { kind: 'exercise', key } | null
  function parseLink(url) {
    const m = String(url || '').match(new RegExp(`^${SCHEME}://widget/(home|challenge|exercise)(?:/([^?#]*))?`, 'i'));
    if (!m) return null;
    const kind = m[1].toLowerCase();
    let arg = '';
    try { arg = decodeURIComponent(m[2] || ''); } catch (e) { return null; }
    if (kind === 'home') return { kind };
    if (!arg) return null;
    return kind === 'challenge' ? { kind, id: arg } : { kind, key: arg };
  }

  // Wie viel bis heute Abend fehlt, an Tag d (1 = Montag … 7 = Sonntag):
  // dieselbe Rechnung wie PTDashboard.challengeRows (myTodayLeft).
  function todayLeftOn(entries, d) {
    return Math.max(0, ...entries.map(({ row }) => Math.max(0, Math.ceil(row.share * d / 7) - row.myDone)));
  }

  // Untertitel einer Übung an Tag d, wie die Fokus-Karte auf „Heute“.
  function exerciseLine(ex, d, fmt) {
    if (ex.isObligatory) {
      if (ex.finished) return tr('erledigt');
      return ex.shareMax === 1 ? tr('einmal diese Woche') : tr('{done} / {total} Durchgänge', { done: ex.myWeek, total: ex.shareMax });
    }
    if (ex.finished) return tr('erledigt');
    const left = todayLeftOn(ex.entries, d);
    return left > 0 ? tr('heute noch {amount}', { amount: fmt(ex.minutes, left) }) : tr('du bist auf Kurs');
  }

  const daysLeftLine = (d) => (d >= 7 ? tr('letzter Tag') : trn(7 - d, 'noch {n} Tag', 'noch {n} Tage'));

  // model: PTDashboard.buildDashboard. fmt(minutes, value) formatiert Mengen
  // (fmtAmount aus dashboard.jsx), statusOf(card) liefert die Statuszeile einer
  // Challenge (compStatusLine). colors: { light, dark } mit Grundfarben aus
  // PTTheme (tile0, tile1, side0, side1, accent), damit das Widget zur
  // gewählten Palette passt.
  function snapshot({ model, weekStart, weekNumber, fmt, statusOf, colors = null, now = new Date() }) {
    if (!model) return null;
    const days = [1, 2, 3, 4, 5, 6, 7];
    const exercises = [...model.exercises.filter(e => !e.finished), ...model.exercises.filter(e => e.finished)]
      .slice(0, MAX_EXERCISES)
      .map(ex => ({
        key: ex.key,
        name: ex.cat?.name || '—',
        pct: Math.max(0, Math.min(1, ex.pct || 0)),
        finished: !!ex.finished,
        emojis: ex.entries.map(e => e.card.c.emoji).filter(Boolean).slice(0, 3).join(''),
        lines: days.map(d => exerciseLine(ex, d, fmt)),
        link: linkExercise(ex.key),
      }));
    const comps = model.cards.slice(0, MAX_COMPS).map(card => {
      const two = card.sides.length === 2;
      return {
        id: card.c.id,
        name: card.c.name,
        emoji: card.c.emoji || '',
        score: two ? `${card.duel[0].wins} : ${card.duel[1].wins}` : '',
        status: statusOf ? statusOf(card) : '',
        progress: card.total ? tr('{done}/{total} erledigt', { done: card.done, total: card.total }) : tr('Ziel festlegen'),
        link: linkChallenge(card.c.id),
      };
    });
    const total = model.exercises.length;
    const done = model.exercises.filter(e => e.finished).length;
    return {
      v: VERSION,
      updatedAt: new Date(now).toISOString(),
      weekStart,
      title: tr('KW {week}', { week: weekNumber }),
      daysLeft: days.map(daysLeftLine),
      done, total,
      pct: total ? model.exercises.reduce((a, e) => a + Math.min(1, e.pct || 0), 0) / total : 0,
      doneLabel: total ? tr('{done} von {total} erledigt', { done, total }) : tr('Diese Woche ist noch offen'),
      allDone: total > 0 && done === total ? tr('Alles erledigt 💪') : '',
      exercises,
      comps,
      colors,
      labels: {
        app: window.PTOnboarding?.APP_NAME || 'Benny & Joni',
        newWeek: tr('Neue Woche'),
        openApp: tr('Öffne die App für deine neuen Ziele.'),
        empty: tr('Öffne eine Challenge und leg das erste Wochenziel fest.'),
        exercises: tr('Deine Übungen'),
        challenges: tr('Deine Challenges'),
      },
      links: { home: linkHome() },
    };
  }

  // Ohne Uhrzeit vergleichen: nur Inhalte, die sich wirklich geändert haben, an
  // die native Seite geben (jedes Neuladen kostet Widget-Budget).
  const contentOf = (snap) => (snap ? JSON.stringify({ ...snap, updatedAt: null }) : '');

  // ── Native Brücke (nur iOS-App) ────────────────────────────────────────
  let plugin;
  function bridge() {
    if (plugin !== undefined) return plugin;
    plugin = null;
    try {
      const C = window.Capacitor;
      if (C?.isNativePlatform?.() && C.getPlatform?.() === 'ios') {
        plugin = C.registerPlugin ? C.registerPlugin('WidgetBridge') : (C.Plugins?.WidgetBridge || null);
      }
    } catch (e) { plugin = null; }
    return plugin;
  }

  let lastSent = null;
  async function sync(snap) {
    const p = bridge();
    const content = contentOf(snap);
    if (!p || !snap || content === lastSent) return false;
    lastSent = content;
    try { await p.update({ snapshot: JSON.stringify(snap) }); return true; }
    catch (e) { lastSent = null; console.warn('Widget-Update fehlgeschlagen', e); return false; }
  }
  // Abmelden, Konto löschen: keine fremden Daten auf dem Homescreen lassen.
  async function clear() {
    lastSent = null;
    const p = bridge();
    if (!p) return;
    try { await p.clear(); } catch (e) { console.warn('Widget leeren fehlgeschlagen', e); }
  }

  window.PTWidget = { VERSION, parseLink, linkHome, linkChallenge, linkExercise, todayLeftOn, snapshot, contentOf, sync, clear };
})();
