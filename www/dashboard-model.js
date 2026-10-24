// Projekt Terminator — Rechenmodell für „Heute“ (rein, ohne React).
//
// - challengeRows: Kennzahlen pro Wochenziel einer Challenge (Liste, Fokus-
//   Karte, Tauziehen-Balken, Duell). Genutzt von HomeScreen und Dashboard.
// - buildDashboard: alle laufenden Challenges auf einen Blick; gleiche Übungen
//   (PTData.exerciseKey) werden zu einer Zeile zusammengeführt, ein Eintrag
//   zählt dann in jeder dieser Challenges (api.logEverywhere).
// - weekResult: Ergebnis einer abgeschlossenen Woche für die große Feier.
//   Wochensieg = meiste Wiederholungen (2 vs 2: Teamsumme), wie in den Stats;
//   Pflicht-Workouts zählen nicht, reine Minuten-Wochen zählen Minuten.

(function () {
  const P = window.PTData;

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

  // 1 (Montag) bis 7 (Sonntag) für `today` in der Woche ab weekStart.
  function dayIndexInWeek(weekStart, today = new Date()) {
    const ws = new Date(weekStart + 'T00:00:00');
    const t = new Date(today); t.setHours(0, 0, 0, 0);
    return Math.max(1, Math.min(7, Math.floor((t - ws) / 86400000) + 1));
  }

  const idsOf = (side) => side.statUserIds || side.userIds;

  // sides: buildSides (Index 0 = eigene Seite). participantCount: Personen,
  // auf die sich das Wochenziel verteilt (fairer Anteil).
  function challengeRows({ challenges, categories, sets, sides, me, participantCount = 0, today = new Date() }) {
    const catById = Object.fromEntries((categories || []).map(c => [c.id, c]));
    return (challenges || []).map(ch => {
      const cat = catById[ch.category_id];
      const minutes = P.usesMinutes(cat);
      const isWork = cat?.kind === 'work';
      const catType = cat?.challenge_type || 'standard';
      // Pflicht-Workout: jeder Eintrag ist ein Durchgang, Ziel ist einer pro Person.
      const isObligatory = P.isWorkoutType(catType);
      const val = (x) => (minutes ? (x.duration_minutes ?? 0) : (x.reps ?? 0));
      const csets = (sets || []).filter(x => x.challenge_id === ch.id);
      const doneBySide = sides.map(side => (isObligatory
        ? P.workoutPeopleDone(csets, idsOf(side))
        : csets.filter(s => idsOf(side).includes(s.athlete)).reduce((a, s) => a + val(s), 0)));
      const total = isObligatory ? doneBySide.reduce((a, x) => a + x, 0) : csets.reduce((a, x) => a + val(x), 0);
      const people = participantCount || sides.length || 1;
      const share = isObligatory ? 1 : P.fairShareOf(ch.target_reps, people);
      const goal = isObligatory ? people : ch.target_reps;
      // Ziel einer Seite: Anteil pro Person mal Personen (Team = Summe)
      const sideGoals = sides.map(side => share * Math.max(1, side.userIds.length));
      const expectedByEod = Math.ceil(share * dayIndexInWeek(ch.week_start, today) / 7);
      const mine = csets.filter(x => x.athlete === me);
      const myDone = isObligatory ? mine.length : mine.reduce((a, x) => a + val(x), 0);
      return {
        ch, cat, minutes, isWork, catType, isObligatory, total, goal, share, doneBySide, sideGoals,
        leader: isObligatory ? null : leaderIndex(doneBySide),
        myDone, meFinished: myDone >= share, mine,
        mySummary: isObligatory ? P.workoutSummary(catType, mine) : '',
        myTodayLeft: Math.max(0, expectedByEod - myDone),
      };
    });
  }

  // Duell auf einen Blick: Übungen vorne und Wiederholungen pro Seite.
  function duelOf(rows, sides) {
    return sides.map((side, i) => ({
      side,
      wins: rows.filter(r => r.leader === i).length,
      reps: rows.reduce((a, r) => a + (r.minutes || r.isObligatory ? 0 : r.doneBySide[i]), 0),
    }));
  }

  // Wie liegt die eigene Seite? { rank, of, lead } — lead: Übungen vorne minus
  // die beste andere Seite (nur bei zwei Seiten aussagekräftig).
  function standingOf(duel) {
    if (duel.length < 2) return { rank: 1, of: duel.length, lead: 0 };
    const score = (e) => e.wins * 1e7 + e.reps;
    const mine = score(duel[0]);
    const rank = 1 + duel.filter((e, i) => i > 0 && score(e) > mine).length;
    const bestOther = Math.max(...duel.slice(1).map(e => e.wins));
    return { rank, of: duel.length, lead: duel[0].wins - bestOther };
  }

  // comps: [{ c, sides, participantCount }] in Anzeigereihenfolge.
  // bundle: api.getDashboard (Wochenziele, Sätze, Übungen).
  function buildDashboard({ me, comps, bundle, weekStart, today = new Date() }) {
    const cards = comps.map(({ c, sides, participantCount }) => {
      const challenges = bundle.challenges.filter(ch => ch.competition_id === c.id && ch.week_start === weekStart);
      const rows = challengeRows({ challenges, categories: bundle.categories, sets: bundle.sets, sides, me, participantCount, today });
      const duel = duelOf(rows, sides);
      return {
        c, sides, rows, duel, standing: standingOf(duel),
        done: rows.filter(r => r.meFinished).length, total: rows.length,
      };
    });

    const groups = new Map();
    for (const card of cards) {
      for (const row of card.rows) {
        let key = P.exerciseKey(row.cat, card.c.id) || `ch:${row.ch.id}`;
        // Zwei gleich benannte eigene Übungen in derselben Challenge bleiben getrennt
        if (groups.get(key)?.entries.some(e => e.card.c.id === card.c.id)) key = `${key}#${row.ch.id}`;
        if (!groups.has(key)) {
          groups.set(key, { key, cat: row.cat, minutes: row.minutes, isWork: row.isWork,
            isObligatory: row.isObligatory, catType: row.catType, entries: [] });
        }
        groups.get(key).entries.push({ card, row });
      }
    }

    const exercises = [...groups.values()].map(g => {
      // Meine Einträge dieser Woche über alle Challenges, jede log_id einmal
      const seen = new Set();
      let myWeek = 0;
      for (const { row } of g.entries) {
        for (const s of row.mine) {
          const k = s.log_id || s.id;
          if (seen.has(k)) continue;
          seen.add(k);
          myWeek += g.isObligatory ? 1 : g.minutes ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
        }
      }
      const finished = g.entries.every(e => e.row.meFinished);
      // Fortschritt = die Challenge, in der ich am weitesten zurück bin
      const pct = g.isObligatory
        ? (finished ? 1 : 0)
        : Math.min(...g.entries.map(e => Math.min(1, e.row.myDone / Math.max(1, e.row.share))));
      return {
        ...g, myWeek, finished, pct,
        shareMax: Math.max(...g.entries.map(e => e.row.share)),
        todayLeft: Math.max(0, ...g.entries.map(e => e.row.myTodayLeft)),
        targets: g.entries.map(e => ({ challenge_id: e.row.ch.id, competition_id: e.card.c.id })),
      };
    });
    // Liste: offene zuerst. Die Fokus-Karten behalten die feste Reihenfolge
    // (exercises), damit eine fertige Übung beim Wischen nicht wegspringt.
    const ordered = [...exercises.filter(e => !e.finished), ...exercises.filter(e => e.finished)];
    return { cards, exercises, ordered };
  }

  // Andere eigene Wochenziele derselben Übung in derselben Woche
  // (für „Zählt auch für“). Liefert [{ challenge_id, competition_id, name, emoji }].
  function matchingTargets({ bundle, comps, ch, cat, competitionId }) {
    if (!bundle || !cat) return [];
    const key = P.exerciseKey(cat, competitionId);
    const catById = Object.fromEntries(bundle.categories.map(c => [c.id, c]));
    const out = [];
    for (const x of bundle.challenges) {
      if (x.week_start !== ch.week_start || x.competition_id === competitionId) continue;
      const comp = comps.find(c => c.id === x.competition_id);
      if (!comp || comp.archived_at) continue;
      if (P.exerciseKey(catById[x.category_id], x.competition_id) !== key) continue;
      if (out.some(o => o.competition_id === x.competition_id)) continue;
      out.push({ challenge_id: x.id, competition_id: x.competition_id, name: comp.name, emoji: comp.emoji });
    }
    return out;
  }

  // Ergebnis einer abgeschlossenen Woche einer Challenge.
  // participantCount: wer in dieser Woche dabei war (PTData.participantsFor).
  function weekResult({ me, c, sides, challenges, categories, sets, participantCount, weekStart }) {
    const rows = challengeRows({ challenges, categories, sets, sides, me, participantCount,
      today: new Date(P.addDays(weekStart, 6) + 'T12:00:00') });
    if (!rows.length || sides.length < 1) return null;
    const repRows = rows.filter(r => !r.isObligatory && !r.minutes);
    const minRows = rows.filter(r => !r.isObligatory && r.minutes);
    const unit = repRows.length ? 'reps' : minRows.length ? 'min' : null;
    const scored = unit === 'reps' ? repRows : unit === 'min' ? minRows : [];
    const totals = sides.map((_, i) => scored.reduce((a, r) => a + r.doneBySide[i], 0));
    const sum = totals.reduce((a, v) => a + v, 0);
    const winner = leaderIndex(totals);
    const sorted = [...totals].sort((a, b) => b - a);
    const goalsHit = rows.filter(r => r.meFinished).length;
    // Übungen, die die eigene Seite angeführt hat
    const exercisesWon = rows.filter(r => r.leader === 0).length;
    return {
      c, sides, weekStart, rows, unit, totals, sum, winner,
      won: sides.length > 1 && winner === 0,
      tie: sides.length > 1 && winner == null && sum > 0,
      solo: sides.length < 2,
      margin: sides.length > 1 ? sorted[0] - sorted[1] : 0,
      myRank: 1 + totals.filter(v => v > totals[0]).length,
      goalsHit, goalsTotal: rows.length, exercisesWon,
      active: sum > 0 || rows.some(r => r.total > 0),
    };
  }

  window.PTDashboard = { leaderIndex, dayIndexInWeek, challengeRows, duelOf, standingOf, buildDashboard, matchingTargets, weekResult };
})();
