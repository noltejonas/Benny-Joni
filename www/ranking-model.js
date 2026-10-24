// Projekt Terminator — Rechenmodell der Monatsrangliste (rein, ohne React).
//
// Die Datenbank rechnet dieselben Regeln (ranking_values, ranking_live,
// close_month in supabase/migrations/20261020120000_monthly_ranking.sql).
// Hier liegen sie für den Demo-Modus und die Anzeige:
// - Wert pro Monat: jede log_id einmal; volume = Summe, pro Tag höchstens
//   max_per_day; best = bester Durchgang, höchstens max_per_day.
// - Platz: Gleichstand teilt den Platz, der nächste wird übersprungen (1, 1, 3).
// - Punkte nach F1-Schema für die Plätze 1–10, Medaillen für 1–3.
//
// Wochenwertung (Migration weekly_ranking): Dieselben Regeln pro Woche
// (Montag bis Sonntag), Abschluss Montag 12:00. Eine Woche zählt im Monat ihres
// Donnerstags; Monat, Saison und Ewig summieren die abgeschlossenen Wochen.

(function () {
  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const MEDALS = { 1: 'gold', 2: 'silver', 3: 'bronze' };
  const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' };

  const pointsFor = (rank) => POINTS[rank - 1] || 0;
  const medalFor = (rank) => MEDALS[rank] || null;

  // ── Monate ('YYYY-MM-01') ────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, '0');
  function monthOf(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }
  function addMonths(month, n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return monthOf(d);
  }
  // „Oktober 2026“ bzw. „October 2026“ je App-Sprache
  function monthLabel(month, withYear = true) {
    const [y, m] = month.split('-').map(Number);
    return PTi18n.date(new Date(y, m - 1, 1), withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });
  }
  // Abschluss: 2. des Folgemonats, 12:00 (Gerätezeit, in Deutschland = Berlin)
  function closeDeadline(month) {
    const [y, m] = addMonths(month, 1).split('-').map(Number);
    return new Date(y, m - 1, 2, 12, 0, 0);
  }
  // Verbleibende Tage inklusive heute; 0 = Monat vorbei
  function daysLeft(month, now = new Date()) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    if (monthOf(now) !== month) return monthOf(now) > month ? 0 : last;
    return last - now.getDate() + 1;
  }
  const inMonth = (iso, month) => monthOf(iso) === month;

  // ── Wochen ('YYYY-MM-DD', Montag) ────────────────────────────────────
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  function weekOf(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return isoDay(d);
  }
  function addWeeks(week, n) {
    const d = parseDay(week);
    d.setDate(d.getDate() + 7 * n);
    return isoDay(d);
  }
  // Monat der Woche: der ihres Donnerstags
  const weekMonth = (week) => monthOf(addDaysIso(week, 3));
  function addDaysIso(iso, n) { const d = parseDay(iso); d.setDate(d.getDate() + n); return isoDay(d); }
  // Abschluss: Montag nach der Woche, 12:00 (Gerätezeit, in Deutschland = Berlin)
  function weekCloseDeadline(week) {
    const d = parseDay(addWeeks(week, 1));
    d.setHours(12, 0, 0, 0);
    return d;
  }
  // Verbleibende Tage inklusive heute; 0 = Woche vorbei
  function weekDaysLeft(week, now = new Date()) {
    const cur = weekOf(now);
    if (cur !== week) return cur > week ? 0 : 7;
    return 7 - ((now.getDay() + 6) % 7);
  }
  // Erste gewertete Woche: Donnerstag ab start_month
  function startWeek(startMonth) {
    const w = weekOf(parseDay(startMonth));
    return weekMonth(w) < startMonth ? addWeeks(w, 1) : w;
  }
  // „KW 43“ (ISO-Kalenderwoche)
  function weekNumberOf(week) {
    const t = parseDay(addDaysIso(week, 3));
    const jan4 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  }
  // „KW 43 · 19.–25.10.“
  function weekLabel(week) {
    const a = parseDay(week), b = parseDay(addDaysIso(week, 6));
    const fmt = new Intl.DateTimeFormat(PTi18n.locale, { day: 'numeric', month: 'numeric' });
    const range = a.getMonth() === b.getMonth() && fmt.formatRange
      ? fmt.formatRange(a, b).replace(/\s*–\s*/, '–')
      : `${fmt.format(a)}–${fmt.format(b)}`;
    return `${tr('KW {week}', { week: weekNumberOf(week) })} · ${range}`;
  }
  const dayOf = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // ── Werte ────────────────────────────────────────────────────────────
  // sets: [{ user_id, log_id, reps, created_at, category_id }]
  // categories: Katalog mit ranked, metric, max_per_day
  function monthValues({ sets, categories, month, excludeLog = null }) {
    return periodValues({ sets, categories, excludeLog, inPeriod: (iso) => inMonth(iso, month) });
  }
  function weekValues({ sets, categories, week, excludeLog = null }) {
    return periodValues({ sets, categories, excludeLog, inPeriod: (iso) => weekOf(new Date(iso)) === week });
  }
  function periodValues({ sets, categories, inPeriod, excludeLog = null }) {
    const catById = {};
    for (const c of categories || []) if (c.ranked && !c.competition_id) catById[c.id] = c;
    const seen = new Set();
    const logs = [...(sets || [])]
      .filter((s) => catById[s.category_id] && s.reps > 0 && inPeriod(s.created_at) && s.log_id !== excludeLog)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .filter((s) => {
        const k = `${s.user_id}|${s.log_id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const perDay = {};
    for (const s of logs) {
      const cat = catById[s.category_id];
      const k = `${s.category_id}|${s.user_id}|${dayOf(s.created_at)}`;
      const e = perDay[k] ||= { category_id: s.category_id, user_id: s.user_id, cat, sum: 0, best: 0 };
      e.sum += s.reps;
      e.best = Math.max(e.best, s.reps);
    }
    const out = {};
    for (const e of Object.values(perDay)) {
      const cap = e.cat.max_per_day || Infinity;
      const k = `${e.category_id}|${e.user_id}`;
      const r = out[k] ||= { category_id: e.category_id, user_id: e.user_id, value: 0 };
      if (e.cat.metric === 'best') r.value = Math.max(r.value, Math.min(e.best, cap));
      else r.value += Math.min(e.sum, cap);
    }
    return Object.values(out);
  }

  // Standard-Rangfolge (1, 1, 3) innerhalb einer Liste
  function rankBy(rows, key = 'value') {
    const sorted = [...rows].sort((a, b) => b[key] - a[key]);
    let rank = 0, prev = null;
    return sorted.map((r, i) => {
      if (prev === null || r[key] !== prev) { rank = i + 1; prev = r[key]; }
      return { ...r, rank };
    });
  }

  // Gewertete Monatsliste pro Übung mit Platz und Punkten.
  // counted(row) entscheidet, wer mitzählt (Zustimmung, nicht ausgeblendet).
  function board(values, counted = () => true) {
    const byCat = {};
    for (const v of values) if (v.value > 0 && counted(v)) (byCat[v.category_id] ||= []).push(v);
    const out = [];
    for (const rows of Object.values(byCat)) {
      for (const r of rankBy(rows)) out.push({ ...r, points: pointsFor(r.rank), medal: medalFor(r.rank) });
    }
    return out;
  }

  // Platz, auf dem ein Wert in einer Liste stünde
  const hypotheticalRank = (rows, value) => 1 + rows.filter((r) => r.value > value).length;

  // Abstand zum nächstbesseren Platz: { rank, value } des Platzes darüber und
  // wie viel fehlt, um ihn zu erreichen (Gleichstand teilt den Platz).
  function gapAbove(rows, myValue, key = 'value') {
    const better = rows.filter((r) => r[key] > myValue);
    if (!better.length) return null;
    const target = Math.min(...better.map((r) => r[key]));
    const rank = 1 + rows.filter((r) => r[key] > target).length;
    return { rank, need: target - myValue };
  }

  // ── Saison & Ewig ────────────────────────────────────────────────────
  // results: monthly_results-Zeilen { month, category_id, user_id, points, medal }
  // Zeilen mit `week` (Wochenwertung) zählen im Monat ihres Donnerstags.
  function totals(results, { from = null, to = null } = {}) {
    const out = {};
    for (const r of results || []) {
      const month = r.month || weekMonth(r.week);
      if ((from && month < from) || (to && month > to)) continue;
      const k = `${r.category_id}|${r.user_id}`;
      const e = out[k] ||= { category_id: r.category_id, user_id: r.user_id, points: 0, gold: 0, silver: 0, bronze: 0, months: 0 };
      e.points += r.points || 0;
      e.months += 1;
      if (r.medal) e[r.medal] += 1;
    }
    return Object.values(out);
  }

  // Gesamtwertung: Punkte und Medaillen aller Übungen pro User.
  // rows: Summen (gold/silver/bronze) oder Monatszeilen (medal bzw. rank)
  function overall(rows) {
    const byUser = {};
    for (const r of rows) {
      const e = byUser[r.user_id] ||= { ...r, category_id: null, rank: undefined, points: 0, gold: 0, silver: 0, bronze: 0, value: 0 };
      const medal = r.medal || (r.rank && r.points > 0 ? medalFor(r.rank) : null);
      e.points += r.points || 0;
      e.gold += r.gold || (medal === 'gold' ? 1 : 0);
      e.silver += r.silver || (medal === 'silver' ? 1 : 0);
      e.bronze += r.bronze || (medal === 'bronze' ? 1 : 0);
    }
    return Object.values(byUser);
  }

  // Punkte-Tabelle: Punkte, bei Gleichstand teilen sich alle den Platz
  function pointsTable(rows) {
    return rankBy(rows.filter((r) => r.points > 0), 'points');
  }

  // Medaillenspiegel: Gold, dann Silber, dann Bronze, dann Punkte
  function medalTable(rows) {
    const key = (r) => [r.gold || 0, r.silver || 0, r.bronze || 0, r.points || 0];
    const cmp = (a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return 0;
    };
    const sorted = rows.filter((r) => r.points > 0 || r.gold || r.silver || r.bronze).sort(cmp);
    let rank = 0;
    return sorted.map((r, i) => {
      if (i === 0 || cmp(sorted[i - 1], r) !== 0) rank = i + 1;
      return { ...r, rank };
    });
  }

  // Saisonsieger pro Übung und gesamt (category_id null), sobald der Dezember
  // abgeschlossen ist. closedMonths: Liste 'YYYY-MM-01'.
  function seasonChampions(results, closedMonths) {
    const closed = new Set(closedMonths || []);
    const years = [...new Set((results || []).map((r) => Number((r.month || weekMonth(r.week)).slice(0, 4))))]
      .filter((y) => closed.has(`${y}-12-01`));
    const out = [];
    for (const y of years) {
      const rows = totals(results, { from: `${y}-01-01`, to: `${y}-12-01` });
      const cats = [...new Set(rows.map((r) => r.category_id))];
      const groups = [...cats.map((c) => rows.filter((r) => r.category_id === c)), overall(rows)];
      for (const g of groups) {
        const top = Math.max(0, ...g.map((r) => r.points));
        if (top <= 0) continue;
        for (const r of g) if (r.points === top) out.push({ year: y, category_id: r.category_id ?? null, user_id: r.user_id, points: top });
      }
    }
    return out;
  }

  // ── Anzeige ──────────────────────────────────────────────────────────
  function formatValue(cat, value) {
    const v = value ?? 0;
    if (cat?.challenge_type === 'bring_sally_up') return `${Math.floor(v / 60)}:${pad(v % 60)}`;
    if (cat?.challenge_type === 'tom_holland') return trn(v, '{n} Runde', '{n} Runden', { n: PTi18n.number(v) });
    return PTi18n.number(v);
  }
  // „42 Liegestütze“, „0:12“, „2 Runden“ (für „noch … bis Platz 3“)
  function formatNeed(cat, need) {
    if (cat?.challenge_type === 'bring_sally_up' || cat?.challenge_type === 'tom_holland') return formatValue(cat, need);
    return `${PTi18n.number(need)} ${cat?.name || tr('Reps')}`;
  }

  // Ist das Jahr für die Saisonsieger fertig? Letzte Woche des Dezembers
  // (Wochenwertung) abgeschlossen. Liefert Monate wie seasonChampions sie braucht.
  function closedMonthsFromWeeks(closedWeeks) {
    const out = new Set();
    for (const w of closedWeeks || []) if (weekMonth(w).endsWith('-12-01') && weekMonth(addWeeks(w, 1)) !== weekMonth(w)) out.add(weekMonth(w));
    return [...out];
  }

  window.PTRanking = {
    POINTS, MEDAL_EMOJI, pointsFor, medalFor,
    monthOf, addMonths, monthLabel, closeDeadline, daysLeft,
    weekOf, addWeeks, weekMonth, weekCloseDeadline, weekDaysLeft, startWeek, weekNumberOf, weekLabel, closedMonthsFromWeeks,
    monthValues, weekValues, rankBy, board, hypotheticalRank, gapAbove,
    totals, overall, pointsTable, medalTable, seasonChampions,
    formatValue, formatNeed,
  };
})();
