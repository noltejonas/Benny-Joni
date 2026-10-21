// Benny & Joni — Rechenmodell für den Stats-Tab (rein, ohne React).
//
// Stats zeigen nur Sport: Work-Kategorien fließen nicht ein. Pflicht-Workouts
// (s.workout / ch.workout, siehe PTData.annotateWorkouts) zählen nie als Reps;
// ihr Ziel ist ein Durchgang pro Person.
//
// Ziele werden immer gegen den fairen Anteil gemessen: target_reps ist das
// gemeinsame Wochenziel, jede Person schuldet ceil(target / Teilnehmer), ein
// Team die Summe seiner Personen-Anteile.
//
// Tage sind lokale Kalendertage (PTData.isoDate), Wochen beginnen montags.

(function () {
  const P = window.PTData;

  const dayOf = (ts) => P.isoDate(new Date(ts));
  const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const mondayIso = (iso) => P.isoDate(P.mondayOf(new Date(iso + 'T00:00:00')));

  // Index des einzigen Höchstwerts; null bei Gleichstand oder wenn alles 0 ist.
  function leaderIndex(values) {
    let best = null, bestVal = null, tie = false;
    values.forEach((v, i) => {
      if (v == null) return;
      if (bestVal == null || v > bestVal) { best = i; bestVal = v; tie = false; }
      else if (v === bestVal) tie = true;
    });
    return tie || !bestVal ? null : best;
  }

  // Aktuelle und längste Serie aufeinanderfolgender Tage. Ist heute noch nichts
  // geloggt, zählt die Serie ab gestern weiter (sie reißt erst morgen).
  function streaks(days, today) {
    const sorted = [...new Set(days)].sort();
    let longest = 0, run = 0, prev = null;
    for (const d of sorted) {
      run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    const set = new Set(sorted);
    let cursor = set.has(today) ? today : P.addDays(today, -1);
    let current = 0;
    while (set.has(cursor)) { current++; cursor = P.addDays(cursor, -1); }
    return { current, longest };
  }

  // Mitglieder, die für eine Challenge-Woche zählen. Mitgliederzeilen mit
  // competition_id (Stats-Bundle) werden auf die Challenge eingegrenzt.
  function participantsOf(members, ch) {
    const pool = members.some(m => m.competition_id)
      ? members.filter(m => m.competition_id === ch.competition_id)
      : members;
    return P.participantsFor(pool, ch.week_start);
  }

  const isSportCh = (catById) => (ch) => (catById[ch.category_id]?.kind || 'sports') === 'sports';

  // ── Challenge / Duell ────────────────────────────────────────────────
  // sides: [{ userIds, statUserIds? }], Index 0 = eigene Seite.
  function challengeStats({ sides, challenges, categories, sets, members = [], today = P.isoDate(new Date()) }) {
    const catById = Object.fromEntries(categories.map(c => [c.id, c]));
    const idsOf = (side) => side.statUserIds || side.userIds;
    const sideOf = {};
    sides.forEach((side, i) => idsOf(side).forEach(id => { sideOf[id] = i; }));
    const zeros = () => sides.map(() => 0);

    const chs = challenges.filter(isSportCh(catById));
    const chById = Object.fromEntries(chs.map(ch => [ch.id, ch]));
    const own = sets.filter(s => chById[s.challenge_id] && sideOf[s.athlete] != null);
    const setsByCh = {};
    for (const s of own) (setsByCh[s.challenge_id] ||= []).push(s);

    const currentWeek = mondayIso(today);

    // Wochen, neueste zuerst
    const byWeek = {};
    for (const ch of chs) (byWeek[ch.week_start] ||= []).push(ch);
    const weeks = Object.keys(byWeek).sort().reverse().map(ws => {
      const totals = zeros();
      const goalsHit = zeros();
      const goals = zeros();
      const rows = byWeek[ws].map(ch => {
        const cs = setsByCh[ch.id] || [];
        const participants = participantsOf(members, ch);
        const partIds = new Set(participants.map(m => m.user_id));
        const share = ch.workout ? 1 : P.fairShareOf(ch.target_reps, participants.length || sides.length);
        const perSide = sides.map((side, i) => {
          const mine = cs.filter(s => sideOf[s.athlete] === i);
          // Wer auf dieser Seite schuldet in dieser Woche einen Anteil?
          const owing = participants.length ? idsOf(side).filter(id => partIds.has(id)) : idsOf(side);
          if (ch.workout) {
            const did = new Set(mine.map(s => s.athlete));
            const hit = owing.length > 0 && owing.every(id => did.has(id));
            return { value: mine.length, goal: owing.length, hit, sets: mine, owing };
          }
          const value = mine.reduce((a, s) => a + P.setValue(s), 0);
          const goal = share * owing.length;
          return { value, goal, hit: goal > 0 && value >= goal, sets: mine, owing };
        });
        perSide.forEach((p, i) => {
          if (!ch.workout) totals[i] += p.value;
          if (p.goal > 0) { goals[i]++; if (p.hit) goalsHit[i]++; }
        });
        return { ch, cat: catById[ch.category_id], share, perSide };
      });
      const done = ws < currentWeek;
      // Wochen ohne Reps (nur Workouts oder gar nichts) werden nicht gewertet
      const active = totals.some(v => v > 0);
      return {
        weekStart: ws, done, current: ws === currentWeek, active,
        totals, goals, goalsHit, rows,
        winner: done ? leaderIndex(totals) : null,
      };
    });

    // Bilanz: abgeschlossene Wochen mit Reps
    const wins = zeros();
    let ties = 0, decided = 0;
    for (const w of weeks) {
      if (!w.done || !w.active) continue;
      decided++;
      if (w.winner == null) ties++; else wins[w.winner]++;
    }

    // Tagesreihen ab Challenge-Start bis heute
    const repSets = own.filter(s => !s.workout);
    const firstDay = [
      ...chs.map(ch => ch.week_start),
      ...own.map(s => dayOf(s.created_at)),
    ].sort()[0] || today;
    const start = firstDay < today ? firstDay : today;
    const dayCount = daysBetween(start, today) + 1;
    const dates = Array.from({ length: dayCount }, (_, i) => P.addDays(start, i));
    const daily = sides.map(() => new Array(dayCount).fill(0));
    for (const s of repSets) {
      const i = daysBetween(start, dayOf(s.created_at));
      if (i >= 0 && i < dayCount) daily[sideOf[s.athlete]][i] += P.setValue(s);
    }
    const totals = daily.map(arr => arr.reduce((a, v) => a + v, 0));

    // Kategorien (ohne Pflicht-Workouts)
    const catTotals = {};
    for (const s of repSets) {
      const cid = chById[s.challenge_id].category_id;
      (catTotals[cid] ||= zeros())[sideOf[s.athlete]] += P.setValue(s);
    }
    const categoriesOut = Object.entries(catTotals)
      .map(([cid, vals]) => ({ cat: catById[cid], vals, total: vals.reduce((a, v) => a + v, 0), leader: leaderIndex(vals) }))
      .sort((a, b) => b.total - a.total);

    // Bestwerte pro Seite
    const activeDays = sides.map(() => new Set());
    const byDay = sides.map(() => ({}));
    const maxSet = zeros();
    for (const s of own) {
      const i = sideOf[s.athlete];
      const d = dayOf(s.created_at);
      activeDays[i].add(d);
      if (s.workout) continue;
      const v = P.setValue(s);
      byDay[i][d] = (byDay[i][d] || 0) + v;
      if (v > maxSet[i]) maxSet[i] = v;
    }
    const goalsAll = zeros(), goalsHitAll = zeros();
    for (const w of weeks) {
      if (!w.done) continue;
      sides.forEach((_, i) => { goalsAll[i] += w.goals[i]; goalsHitAll[i] += w.goalsHit[i]; });
    }
    const workoutBest = {};
    for (const s of own) {
      if (!s.workout) continue;
      const cid = chById[s.challenge_id].category_id;
      const e = workoutBest[cid] ||= { cat: catById[cid], type: s.workout, best: sides.map(() => null), runs: zeros() };
      const i = sideOf[s.athlete];
      e.runs[i]++;
      e.best[i] = Math.max(e.best[i] ?? 0, s.reps ?? 0);
    }
    const records = {
      goalRate: sides.map((_, i) => goalsAll[i] ? goalsHitAll[i] / goalsAll[i] : null),
      goalsHit: goalsHitAll,
      goals: goalsAll,
      activeDays: activeDays.map(set => set.size),
      longestStreak: activeDays.map(set => streaks([...set], today).longest),
      bestDay: byDay.map(m => Object.values(m).reduce((a, v) => Math.max(a, v), 0)),
      bestWeek: sides.map((_, i) => weeks.reduce((a, w) => Math.max(a, w.totals[i]), 0)),
      maxSet,
      workouts: Object.values(workoutBest),
    };

    return { weeks, wins, ties, decided, totals, dates, daily, categories: categoriesOut, records };
  }

  // Kumulierte Reihen und Vorsprung (Seite 0 minus Seite 1) aus Tageswerten.
  function cumulative(daily) {
    return daily.map(arr => { let acc = 0; return arr.map(v => (acc += v)); });
  }
  function gapSeries(daily) {
    const [a, b] = cumulative(daily);
    return a.map((v, i) => v - (b?.[i] ?? 0));
  }

  // ── Ich (alle Challenges) ────────────────────────────────────────────
  // sidesByComp: { [competitionId]: sides } aus buildSides, eigene Seite = Index 0.
  function personalStats({ me, comps, sidesByComp, bundle, today = P.isoDate(new Date()) }) {
    const catById = Object.fromEntries(bundle.categories.map(c => [c.id, c]));
    const chById = Object.fromEntries(bundle.challenges.map(ch => [ch.id, ch]));
    const kindOf = (s) => catById[chById[s.challenge_id]?.category_id]?.kind || 'sports';
    // Ein Satz, der in mehreren Challenges zählt (gleiche log_id), nur einmal
    const seenLogs = new Set();
    const mine = bundle.sets.filter(s => {
      if (s.athlete !== me || !chById[s.challenge_id]) return false;
      if (!s.log_id) return true;
      if (seenLogs.has(s.log_id)) return false;
      seenLogs.add(s.log_id);
      return true;
    });
    const sport = mine.filter(s => kindOf(s) === 'sports');

    // Tageswerte (Reps); Workout-Tage zählen als aktiv
    const repsByDay = {};
    for (const s of sport) {
      const d = dayOf(s.created_at);
      repsByDay[d] = (repsByDay[d] || 0) + P.setValue(s);
    }
    const days = Object.keys(repsByDay);
    const { current, longest } = streaks(days, today);
    const totalReps = sport.reduce((a, s) => a + P.setValue(s), 0);

    // Pro Kategorie: Summe, größter Satz, bester Tag (Workouts: Durchgänge, Bestwert)
    const perCat = {};
    const catDay = {};
    for (const s of mine) {
      const cid = chById[s.challenge_id].category_id;
      const cat = catById[cid];
      const isWork = cat?.kind === 'work';
      const e = perCat[cid] ||= { cat, kind: isWork ? 'work' : s.workout ? 'workout' : 'reps', total: 0, maxSet: 0, bestDay: 0 };
      const v = s.workout ? (s.reps ?? 0) : (s.reps ?? s.duration_minutes ?? 0);
      e.maxSet = Math.max(e.maxSet, v);
      if (s.workout) { e.total += 1; continue; }
      e.total += v;
      const k = `${cid}|${dayOf(s.created_at)}`;
      catDay[k] = (catDay[k] || 0) + v;
      e.bestDay = Math.max(e.bestDay, catDay[k]);
    }
    const order = { reps: 0, workout: 1, work: 2 };
    const categories = Object.values(perCat)
      .sort((a, b) => order[a.kind] - order[b.kind] || b.total - a.total);

    // Ziele und Wochensiege pro Challenge, nur abgeschlossene Wochen
    let goals = 0, goalsHit = 0, weeksWon = 0;
    const perComp = [];
    for (const c of comps) {
      const sides = sidesByComp[c.id] || [];
      if (!sides.length) continue;
      const st = challengeStats({
        sides,
        challenges: bundle.challenges.filter(ch => ch.competition_id === c.id),
        categories: bundle.categories,
        sets: bundle.sets.filter(s => s.competition_id === c.id),
        members: bundle.members.filter(m => m.competition_id === c.id),
        today,
      });
      const myIdx = sides.findIndex(s => (s.statUserIds || s.userIds).includes(me));
      if (myIdx < 0) continue;
      let played = 0;
      for (const w of st.weeks) {
        if (!w.done) continue;
        // Gespielt = ich schuldete etwas oder habe geloggt
        const mineIn = w.rows.map(r => r.perSide[myIdx]);
        if (!mineIn.some(p => p.owing.includes(me) || p.sets.some(s => s.athlete === me))) continue;
        played++;
        for (const r of w.rows) {
          const p = r.perSide[myIdx];
          if (!p.owing.includes(me)) continue;
          const myOwn = p.sets.filter(s => s.athlete === me);
          const hit = r.ch.workout
            ? myOwn.length > 0
            : myOwn.reduce((a, s) => a + P.setValue(s), 0) >= r.share;
          goals++;
          if (hit) goalsHit++;
        }
      }
      const wins = st.weeks.filter(w => w.done && w.winner === myIdx).length;
      weeksWon += wins;
      const rank = 1 + st.totals.filter(v => v > st.totals[myIdx]).length;
      perComp.push({ c, played, wins, total: st.totals[myIdx], rank, of: sides.length });
    }

    return {
      totalReps, activeDays: days.length, streak: current, longestStreak: longest,
      repsByDay, categories, perComp, weeksWon,
      goalRate: goals ? goalsHit / goals : null, goals, goalsHit,
      setCount: sport.length,
    };
  }

  // Intensitätsstufen 1–4 aus Quartilen der aktiven Tage (0 = kein Training).
  function intensityLevels(values) {
    const sorted = values.filter(v => v > 0).sort((a, b) => a - b);
    const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    return (v, active) => {
      if (!active) return 0;
      if (!v) return 1;
      return 1 + cuts.filter(c => v > c).length;
    };
  }

  // ── Anteil-Regel ─────────────────────────────────────────────────────
  // Durch wie viele Personen wird das Wochenziel geteilt? Entscheidung der
  // Gründer, hier an einer Stelle umschaltbar:
  //   'actual'   – tatsächliche Teilnehmer, sobald mindestens 2 aktiv sind,
  //                sonst die volle Besetzung (expected). So rechnen Home, Stats
  //                und Strafe gleich.
  //   'expected' – immer die volle Besetzung (alter Stand von Home).
  const SHARE_BASIS = 'actual';
  function sharePeople({ active = 0, expected = 0, basis = SHARE_BASIS } = {}) {
    if (basis === 'actual' && active >= 2) return active;
    return Math.max(1, active || 0, expected || 0);
  }

  // ── Woche 2: Ziele der Vorwoche als Vorlage ──────────────────────────
  // Lokaler Kalendertag aus 'YYYY-MM-DD' oder einem Zeitstempel.
  const dayKey = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : dayOf(v));

  // Faktor auf die volle Woche, wenn die Challenge erst in dieser Woche nach
  // Montag gestartet ist (angebrochene erste Woche). Ein Ziel, das noch später
  // angelegt wurde, lief entsprechend kürzer. Sonst 1.
  function fullWeekFactor({ weekStart, startDate, createdAt } = {}) {
    if (!weekStart || !startDate) return 1;
    const start = dayKey(startDate);
    const offset = daysBetween(weekStart, start);
    if (!(offset >= 1 && offset <= 6)) return 1;
    let from = offset;
    if (createdAt) {
      const created = daysBetween(weekStart, dayKey(createdAt));
      if (created > from && created <= 6) from = created;
    }
    return 7 / (7 - from);
  }

  // „Wie letzte Woche starten“: dieselben Übungen mit denselben Gruppenzielen,
  // im Format der Wochenplan-Vorlage (WeekFixCard). fullWeekFactor ist eine Zahl
  // oder eine Funktion (ch) → Zahl; hochgerechnet wird ab 20 auf 5 gerundet,
  // nie weniger als vorher. Pflicht-Workouts (ch.workout) bleiben unverändert.
  function weekTemplateFromPrevious(prevChallenges, { fullWeekFactor: factorOf = 1 } = {}) {
    const seen = new Set();
    const out = [];
    for (const ch of prevChallenges || []) {
      if (!ch?.category_id || seen.has(ch.category_id)) continue;
      seen.add(ch.category_id);
      const target = Math.max(1, Math.round(Number(ch.target_reps) || 0));
      const raw = typeof factorOf === 'function' ? factorOf(ch) : factorOf;
      const factor = Number.isFinite(raw) && raw > 1 ? Math.min(raw, 7) : 1;
      const scaled = target * factor;
      const nice = scaled >= 20 ? Math.round(scaled / 5) * 5 : Math.round(scaled);
      const base = ch.workout || factor === 1 ? target : Math.max(target, nice);
      out.push({ category_id: ch.category_id, base_reps: base, bonus_max: 0, slot_id: `prev-${ch.category_id}` });
    }
    return out;
  }

  window.PTStats = {
    leaderIndex, streaks, challengeStats, cumulative, gapSeries, personalStats, intensityLevels,
    SHARE_BASIS, sharePeople, fullWeekFactor, weekTemplateFromPrevious,
  };
})();
