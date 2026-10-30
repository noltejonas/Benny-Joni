// Benny & Joni — Rechenmodell für den Live-Feed (rein, ohne React).
//
// Aus den Sätzen der laufenden Woche entstehen Einträge:
// - Serien: aufeinanderfolgende Sätze einer Person auf dieselbe Challenge,
//   höchstens BURST_GAP_MIN Minuten auseinander und am selben Tag, werden zu
//   einer Zeile zusammengefasst. Pflicht-Workouts, Sätze mit Notiz und
//   unterschiedliche Work-Tags bleiben einzeln.
// - Meilensteine: eigener Anteil erledigt, Wochenziel geschafft,
//   Führungswechsel. Sie stehen zum Zeitpunkt des auslösenden Satzes.
// - Wochenrückblicke vergangener Wochen kommen fertig aus buildWeekRecaps,
//   Monatskarten der Rangliste (kind 'month') aus CompetitionApp.
//
// Werte zählen über PTData.setValue: Workouts tragen nie zu Summen bei.
//
// Dazu kleine Helfer ohne React: Plausibilität pro Satz, Blockliste,
// Melde-Mail und die Texte für „Ergebnis teilen“.

(function () {
  const P = window.PTData;
  const BURST_GAP_MIN = 45;

  const ms = (t) => new Date(t).getTime();
  const dayOf = (t) => P.isoDate(new Date(t));
  const asc = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
  const desc = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

  // Zusammengeführte Einträge (PTScope.mergeLogCopies) nur in einer Serie,
  // wenn sie in denselben Challenges zählen.
  const compsSig = (s) => (s.competition_ids || []).join(',');

  function groupable(prev, s) {
    return prev.athlete === s.athlete
      && prev.challenge_id === s.challenge_id
      && compsSig(prev) === compsSig(s)
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
    const sets = items.filter((x) => x.kind !== 'recap' && x.kind !== 'month');
    const recaps = items.filter((x) => x.kind === 'recap' || x.kind === 'month').map((r) => ({ ...r, key: r.id }));
    const { events, progressBySet } = weekTimeline({ weekSets, challenges, sides, participantCount });
    const runs = bursts(sets).map((b) => ({ ...b, progress: progressBySet[b.sets[0].id] || null }));
    // Bei gleicher Zeit steht der Meilenstein über der Zeile, die ihn ausgelöst hat.
    const rank = (e) => (e.kind === 'milestone' ? 0 : 1);
    return [...runs, ...events, ...recaps]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || rank(a) - rank(b));
  }

  // Feed „Alle Challenges“. items: zusammengeführte Sätze (PTScope.mergeLogCopies,
  // kind 'set') plus Rückblicke mit competition_id. comps: pro Challenge
  // { c, sides, participantCount, challenges, weekSets } der laufenden Woche.
  // Meilensteine und Anteile rechnet jede Challenge für sich (eigene Seiten und
  // Ziele); jeder Eintrag trägt competition_id (vertretende Challenge) und
  // competition_ids. Ein Eintrag in mehreren Challenges steht einmal da, sein
  // Anteil gilt dann nicht eindeutig und entfällt.
  function buildFeedAll({ items = [], comps = [] }) {
    const sets = items.filter((x) => x.kind !== 'recap' && x.kind !== 'month');
    const recaps = items.filter((x) => x.kind === 'recap' || x.kind === 'month').map((r) => ({ ...r, key: r.id }));
    const events = [];
    const progressBySet = {};
    for (const x of comps) {
      const t = weekTimeline({ weekSets: x.weekSets, challenges: x.challenges, sides: x.sides, participantCount: x.participantCount });
      for (const e of t.events) events.push({ ...e, competition_id: x.c.id, competition_ids: [x.c.id] });
      Object.assign(progressBySet, t.progressBySet);
    }
    const runs = bursts(sets).map((b) => {
      const ids = b.sets[0].competition_ids || [b.sets[0].competition_id].filter(Boolean);
      return { ...b, competition_id: b.sets[0].competition_id, competition_ids: ids,
        progress: ids.length > 1 ? null : progressBySet[b.sets[0].id] || null };
    });
    const rank = (e) => (e.kind === 'milestone' ? 0 : 1);
    return [...runs, ...events, ...recaps]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || rank(a) - rank(b));
  }

  // ── Plausibilität ────────────────────────────────────────────────────
  // Wiederholungen pro Satz: ab REPS_ASK nachfragen, über REPS_MAX ablehnen,
  // damit ein Tippfehler (1000 statt 100) kein Duell entscheidet. Gilt nicht
  // für Workouts (Sekunden, Runden) und Work-Minuten.
  const REPS_MAX = 500;
  const REPS_ASK = 200;

  // 'ok' | 'ask' | 'too_many' | 'invalid'
  function repsCheck(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 'invalid';
    if (v > REPS_MAX) return 'too_many';
    if (v >= REPS_ASK) return 'ask';
    return 'ok';
  }

  // ── Blockieren ───────────────────────────────────────────────────────
  // Blockierte Personen (User-IDs) liegen auf dem Gerät in localStorage
  // 'pt:blocked'. Ihre Notizen und Fotos blendet der Feed aus. Ohne Speicher
  // (privater Modus, Tests) gilt niemand als blockiert; Fehler schlucken wir.
  const BLOCK_KEY = 'pt:blocked';

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }

  function blockedIds() {
    try {
      const raw = storage()?.getItem(BLOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((id) => typeof id === 'string' && id) : [];
    } catch (e) {
      return [];
    }
  }

  function isBlocked(userId) {
    return !!userId && blockedIds().includes(userId);
  }

  // Liefert die neue Liste, auch wenn das Speichern scheitert (gilt dann bis zum Neuladen).
  function setBlocked(userId, on) {
    const list = blockedIds().filter((id) => id !== userId);
    if (on && userId) list.push(String(userId));
    try { storage()?.setItem(BLOCK_KEY, JSON.stringify(list)); } catch (e) {}
    return list;
  }

  // ── Melden ───────────────────────────────────────────────────────────
  // mailto an den Support mit den IDs, die wir zum Prüfen brauchen. Leer,
  // solange keine Support-Adresse feststeht. Normalerweise übernimmt das
  // PTOnboarding.reportContent; das hier ist der Ersatz, falls es fehlt.
  // Die Mail steht in der Sprache der meldenden Person (gleiche Etiketten wie
  // PTOnboarding.reportText); IDs und Notiz bleiben, wie sie sind.
  function reportMailto({ kind = 'set', setId, userId, challengeId, note } = {}, email = '') {
    if (!email) return '';
    const label = kind === 'set' ? tr('Eintrag im Feed') : kind;
    const facts = [
      tr('Art: {label}', { label }),
      setId && tr('Satz-ID: {id}', { id: setId }),
      userId && tr('Nutzer-ID: {id}', { id: userId }),
      challengeId && tr('Challenge-ID: {id}', { id: challengeId }),
      note && tr('Notiz: „{note}“', { note }),
    ].filter(Boolean);
    const body = [tr('Was stimmt mit dem Eintrag nicht?'), '', '', tr('— Angaben für uns (bitte drinlassen) —'), ...facts].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent(tr('Meldung: {label}', { label }))}&body=${encodeURIComponent(body)}`;
  }

  // ── Teilen ───────────────────────────────────────────────────────────
  // Texte für „Ergebnis teilen“ (WhatsApp & Co.), in der Sprache der teilenden
  // Person. Link und Code nur, wenn vorhanden: appUrl kommt aus
  // PTOnboarding.APP_STORE_URL, code ist der Einladungscode der Challenge.
  function shareFooter({ appName = 'Benny & Joni', appUrl = '', code = '' } = {}) {
    const out = [appUrl
      ? tr('Mach mit bei {app}: {url}', { app: appName, url: appUrl })
      : tr('Mach mit bei {app}', { app: appName })];
    // „Code: …“ bleibt in jeder Sprache gleich: PTOnboarding.normalizeCode
    // findet den Code ohne Link nur über dieses Etikett.
    if (code) out.push(`Code: ${String(code).toUpperCase()}`);
    return out.join('\n');
  }

  // recap aus buildWeekRecaps (app.jsx), sides wie dort: Seite 0 ist die eigene.
  // kw: Kalenderwoche, name: Name der Challenge. fmt formatiert Werte
  // (Work-Wochen: Dauer, dann unit leer lassen).
  function recapShareText({ recap, sides = [], kw = null, name = '', unit = trc('Einheit', 'Reps'), fmt = String, appName, appUrl, code }) {
    const totals = recap?.totals || [];
    const mine = totals[0] || 0;
    const tail = unit ? ` ${unit}` : '';
    const one = (a) => `${fmt(a)}${tail}`;
    const pair = (a, b) => tr('{a} zu {b}', { a: fmt(a), b: fmt(b) }) + tail;
    const many = (side) => (side?.userIds?.length || 0) > 1;
    let line;
    if (sides.length === 2) {
      const other = totals[1] || 0;
      if (recap?.winnerIdx === 0) {
        line = many(sides[0])
          ? tr('Wir haben die Woche geholt: {score} 💪', { score: pair(mine, other) })
          : tr('Ich hab die Woche geholt: {score} 💪', { score: pair(mine, other) });
      } else if (recap?.winnerIdx === 1) {
        const vars = { name: sides[1].label, score: pair(other, mine) };
        line = many(sides[1])
          ? tr('{name} haben die Woche geholt: {score}. Revanche läuft.', vars)
          : tr('{name} hat die Woche geholt: {score}. Revanche läuft.', vars);
      } else {
        line = tr('Unentschieden: {score}.', { score: pair(mine, other) });
      }
    } else if (sides.length > 2) {
      const rank = 1 + totals.filter((v) => v > mine).length;
      const vars = { rank, total: sides.length, value: one(mine) };
      line = rank === 1
        ? tr('Platz {rank} von {total} mit {value} 🏆', vars)
        : tr('Platz {rank} von {total} mit {value}.', vars);
    } else {
      line = tr('{value} diese Woche.', { value: one(mine) });
    }
    const title = kw != null
      ? (name ? tr('KW {week} in „{name}“', { week: kw, name }) : tr('KW {week}', { week: kw }))
      : (name ? tr('Wochenergebnis in „{name}“', { name }) : tr('Wochenergebnis'));
    return [`🏁 ${title}`, line, '', shareFooter({ appName, appUrl, code })].join('\n');
  }

  // summary aus PTOnboarding.weekOneSummary. fmtMinutes für reine Work-Wochen.
  function weekOneShareText({ summary, fmtMinutes = (m) => `${m} min`, appName = 'Benny & Joni', appUrl, code }) {
    const s = summary || {};
    const days = s.activeDays > 0 ? s.activeDays : 0;
    let main;
    if (s.myMinutes && !s.myReps) {
      const time = fmtMinutes(s.myMinutes);
      main = days
        ? trn(days, '{time} Fokuszeit an {n} Tag.', '{time} Fokuszeit an {n} Tagen.', { time })
        : tr('{time} Fokuszeit.', { time });
    } else {
      const reps = s.myReps || 0;
      main = days
        ? trn(days, '{reps} Reps an {n} Tag.', '{reps} Reps an {n} Tagen.', { reps })
        : tr('{reps} Reps.', { reps });
    }
    const result = s.result === 'won'
      ? (s.diff > 0 ? tr('Ich hab die Woche geholt, {n} vorne.', { n: s.diff }) : tr('Ich hab die Woche geholt.'))
      : s.result === 'lost'
        ? (s.leader
          ? tr('{name} lag {n} vorne. Revanche läuft.', { name: s.leader, n: s.diff })
          : tr('Die anderen lagen {n} vorne. Revanche läuft.', { n: s.diff }))
      : s.result === 'tie' ? tr('Gleichstand. Woche 2 entscheidet.')
      : '';
    return [`🏁 ${tr('Woche 1 bei {app} geschafft', { app: appName })}`, [main, result].filter(Boolean).join(' '), '',
      shareFooter({ appName, appUrl, code })].join('\n');
  }

  window.PTFeed = {
    BURST_GAP_MIN, bursts, leaderIndex, weekTimeline, buildFeed, buildFeedAll,
    REPS_MAX, REPS_ASK, repsCheck,
    BLOCK_KEY, blockedIds, isBlocked, setBlocked,
    reportMailto,
    shareFooter, recapShareText, weekOneShareText,
  };
})();
