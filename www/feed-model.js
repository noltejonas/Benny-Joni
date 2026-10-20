// Projekt Terminator — Rechenmodell für den Live-Feed (rein, ohne React).
//
// Aus den Sätzen der laufenden Woche entstehen Einträge:
// - Serien: aufeinanderfolgende Sätze einer Person auf dieselbe Challenge,
//   höchstens BURST_GAP_MIN Minuten auseinander und am selben Tag, werden zu
//   einer Zeile zusammengefasst. Pflicht-Workouts, Sätze mit Notiz und
//   unterschiedliche Work-Tags bleiben einzeln.
// - Meilensteine: eigener Anteil erledigt, Wochenziel geschafft,
//   Führungswechsel. Sie stehen zum Zeitpunkt des auslösenden Satzes.
// - Wochenrückblicke vergangener Wochen kommen fertig aus buildWeekRecaps.
//
// Werte zählen über PTData.setValue: Workouts tragen nie zu Summen bei.

(function () {
  const P = window.PTData;
  const BURST_GAP_MIN = 45;

  const ms = (t) => new Date(t).getTime();
  const dayOf = (t) => P.isoDate(new Date(t));
  const asc = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
  const desc = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

  function groupable(prev, s) {
    return prev.athlete === s.athlete
      && prev.challenge_id === s.challenge_id
      && !prev.workout && !s.workout
      && !prev.note && !s.note
      && (prev.project_tag_id || null) === (s.project_tag_id || null)
      && (prev.tool_tag_id || null) === (s.tool_tag_id || null)
      && dayOf(prev.created_at) === dayOf(s.created_at)
      && ms(s.created_at) - ms(prev.created_at) <= BURST_GAP_MIN * 60000;
  }

  // Serien aus Sätzen in beliebiger Reihenfolge, neueste zuerst. Der Schlüssel
  // hängt am ersten Satz, damit eine wachsende Serie dieselbe Zeile bleibt.
  function bursts(sets) {
    const groups = [];
    let cur = null;
    for (const s of [...sets].sort(asc)) {
      if (cur && groupable(cur[cur.length - 1], s)) cur.push(s);
      else { cur = [s]; groups.push(cur); }
    }
    return groups.map((g) => {
      const first = g[0], last = g[g.length - 1];
      return {
        kind: 'burst',
        key: `b-${first.id}`,
        athlete: first.athlete,
        challenge_id: first.challenge_id,
        category: last.category || first.category || null,
        workout: first.workout || null,
        sets: [...g].reverse(),
        count: g.length,
        total: g.reduce((a, s) => a + P.setValue(s), 0),
        first_at: first.created_at,
        created_at: last.created_at,
      };
    }).sort(desc);
  }

  // Index des einzigen Höchstwerts; null bei Gleichstand oder wenn alles 0 ist.
  function leaderIndex(values) {
    let best = -1, bestVal = 0, tie = false;
    values.forEach((v, i) => {
      if (v > bestVal) { best = i; bestVal = v; tie = false; }
      else if (v === bestVal && v > 0) tie = true;
    });
    return best < 0 || tie ? null : best;
  }

  // Meilensteine und laufende Anteile der Woche.
  // weekSets: alle Sätze der Woche; challenges: Wochen-Challenges; sides aus
  // buildSides; participantCount für den fairen Anteil.
  // Liefert { events, progressBySet } mit progressBySet[setId] = { value, share }:
  // Stand der Person auf dieser Challenge nach diesem Satz.
  function weekTimeline({ weekSets = [], challenges = [], sides = [], participantCount = 2 }) {
    const sideOf = {};
    for (const sd of sides) for (const id of (sd.statUserIds || sd.userIds || [])) sideOf[id] = sd.index;
    const events = [];
    const progressBySet = {};
    for (const ch of challenges) {
      if (ch.workout || !(ch.target_reps > 0)) continue;
      const share = P.fairShareOf(ch.target_reps, participantCount);
      const sets = weekSets.filter((s) => s.challenge_id === ch.id).sort(asc);
      let total = 0, goalDone = false, leader = null;
      const byUser = {};
      const bySide = sides.map(() => 0);
      const shareDone = new Set();
      for (const s of sets) {
        const v = P.setValue(s);
        byUser[s.athlete] = (byUser[s.athlete] || 0) + v;
        progressBySet[s.id] = { value: byUser[s.athlete], share };
        if (!v) continue;
        total += v;
        const si = sideOf[s.athlete];
        if (si != null) bySide[si] += v;

        const reachedGoal = !goalDone && total >= ch.target_reps;
        if (!shareDone.has(s.athlete) && byUser[s.athlete] >= share) {
          shareDone.add(s.athlete);
          // Wer mit dem Satz auch das Wochenziel schließt, bekommt nur die Ziel-Meldung.
          if (!reachedGoal) {
            events.push({ kind: 'milestone', type: 'share', key: `m-share-${ch.id}-${s.athlete}`,
              created_at: s.created_at, athlete: s.athlete, challenge_id: ch.id,
              value: byUser[s.athlete], target: share });
          }
        }
        if (reachedGoal) {
          goalDone = true;
          events.push({ kind: 'milestone', type: 'goal', key: `m-goal-${ch.id}`,
            created_at: s.created_at, athlete: s.athlete, challenge_id: ch.id,
            value: total, target: ch.target_reps });
        }
        if (sides.length >= 2) {
          const li = leaderIndex(bySide);
          if (li != null && li !== leader) {
            if (leader != null) {
              events.push({ kind: 'milestone', type: 'lead', key: `m-lead-${ch.id}-${s.id}`,
                created_at: s.created_at, athlete: s.athlete, challenge_id: ch.id,
                sideIndex: li, values: bySide.slice() });
            }
            leader = li;
          }
        }
      }
    }
    return { events, progressBySet };
  }

  // Alles zusammen, neueste zuerst. items: Feed-Einträge der App (Sätze mit
  // kind 'set' der laufenden Woche plus Wochenrückblicke).
  function buildFeed({ items = [], weekSets = [], challenges = [], sides = [], participantCount = 2 }) {
    const sets = items.filter((x) => x.kind !== 'recap');
    const recaps = items.filter((x) => x.kind === 'recap').map((r) => ({ ...r, key: r.id }));
    const { events, progressBySet } = weekTimeline({ weekSets, challenges, sides, participantCount });
    const runs = bursts(sets).map((b) => ({ ...b, progress: progressBySet[b.sets[0].id] || null }));
    // Bei gleicher Zeit steht der Meilenstein über der Zeile, die ihn ausgelöst hat.
    const rank = (e) => (e.kind === 'milestone' ? 0 : 1);
    return [...runs, ...events, ...recaps]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || rank(a) - rank(b));
  }

  window.PTFeed = { BURST_GAP_MIN, bursts, leaderIndex, weekTimeline, buildFeed };
})();
