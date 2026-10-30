// Benny & Joni — „Alle Challenges“ oder eine Challenge (rein, ohne React).
//
// Ein gemeinsamer Filter für Heute, Feed, Stats und Strafkonto: 'all' zeigt
// alle laufenden Challenges zusammen, 'one' nur die gewählte (aktive). Die
// Auswahl trifft man im Kopf der App (Challenge-Switcher); sie gilt in jedem
// Tab gleich. Hier steckt die gemeinsame Rechenlogik dafür:
// - resolve: was gerade gilt; mit nur einer laufenden Challenge gibt es kein „Alle“.
// - mergeLogCopies: Ein Eintrag, der in mehreren Challenges zählt, liegt dort
//   als eigene Zeile mit derselben log_id (api.logEverywhere). Für „Alle“ wird
//   er wieder ein Satz, mit allen Kopien und zusammengeführten Reaktionen.
// - penaltySummary / penaltyOverview: Kontostand einer Challenge und die
//   Übersicht über mehrere. Gerechnet wird pro Challenge, dann summiert; jede
//   Strafe und Einzahlung gehört genau zu einer Challenge.
// Tests: tests/scope-model.test.cjs.

(function () {
  // 'all' nur, wenn es mehr als eine laufende Challenge gibt.
  function resolve(scope, liveCount) {
    return liveCount >= 2 && scope !== 'one' ? 'all' : 'one';
  }

  // Haupt-Challenge zuerst, sonst in der gegebenen Reihenfolge.
  function orderComps(comps = [], mainId = null) {
    return [...comps].sort((a, b) => (b.id === mainId) - (a.id === mainId));
  }

  // sets: Sätze aus mehreren Challenges (getFeedAll). order: Challenge-IDs in
  // Anzeigereihenfolge; die Kopie aus der vordersten Challenge vertritt den
  // Eintrag. Liefert Sätze mit
  //   competition_ids: alle Challenges, in denen der Eintrag zählt (geordnet)
  //   copies: [{ id, competition_id, challenge_id, reactions }]
  //   reactions: je Person und Emoji einmal, auch wenn auf mehreren Kopien
  // neueste zuerst.
  function mergeLogCopies(sets = [], order = []) {
    const rank = (cid) => { const i = order.indexOf(cid); return i < 0 ? order.length : i; };
    const groups = new Map();
    for (const s of sets) {
      const key = `${s.athlete}|${s.log_id || s.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const out = [];
    for (const copies of groups.values()) {
      const sorted = [...copies].sort((a, b) => rank(a.competition_id) - rank(b.competition_id) || String(a.id).localeCompare(String(b.id)));
      const rep = sorted[0];
      const seen = new Set();
      const reactions = [];
      for (const c of sorted) {
        for (const r of c.reactions || []) {
          const k = `${r.athlete}|${r.emoji}`;
          if (seen.has(k)) continue;
          seen.add(k);
          reactions.push(r);
        }
      }
      out.push({
        ...rep,
        reactions,
        competition_ids: [...new Set(sorted.map(c => c.competition_id))],
        copies: sorted.map(c => ({ id: c.id, competition_id: c.competition_id, challenge_id: c.challenge_id, reactions: c.reactions || [] })),
      });
    }
    return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  // Reaktion auf einen zusammengeführten Eintrag: an- auf der vertretenden
  // Kopie, aus auf jeder Kopie, die meine Reaktion trägt.
  // Liefert [{ op: 'add' | 'remove', set_id, competition_id }].
  function reactionOps(set, emoji, me) {
    const copies = set.copies?.length ? set.copies : [{ id: set.id, competition_id: set.competition_id, reactions: set.reactions || [] }];
    const mine = copies.filter(c => (c.reactions || []).some(r => r.athlete === me && r.emoji === emoji));
    if (mine.length) return mine.map(c => ({ op: 'remove', set_id: c.id, competition_id: c.competition_id }));
    return [{ op: 'add', set_id: copies[0].id, competition_id: copies[0].competition_id }];
  }

  // Kontostand einer Challenge: Strafen minus Einzahlungen, gesamt und pro
  // Person (Cent). openPeople = Personen mit offenem Saldo; 0, wenn insgesamt
  // nichts offen ist. Gemeinsam für Strafkonto, Übersicht und Tab-Badge.
  function penaltySummary(penalties = [], payouts = []) {
    const totalPenalties = penalties.reduce((a, p) => a + (p.amount_cents || 0), 0);
    const totalPayouts = payouts.reduce((a, p) => a + (p.amount_cents || 0), 0);
    const potOpen = totalPenalties - totalPayouts;
    const saldo = {};
    for (const p of penalties) saldo[p.athlete] = (saldo[p.athlete] || 0) + (p.amount_cents || 0);
    for (const p of payouts) saldo[p.athlete] = (saldo[p.athlete] || 0) - (p.amount_cents || 0);
    const openIds = potOpen > 0 ? Object.keys(saldo).filter(id => saldo[id] > 0) : [];
    return { totalPenalties, totalPayouts, potOpen, saldo, openPeople: openIds.length, openIds };
  }

  // Übersicht über die Strafkonten mehrerer Challenges.
  // comps: Challenges mit Strafkonto (Anzeigereihenfolge); penalties, payouts,
  // closures, challengeWeeks aus api.getPenaltyOverview; monday: laufende Woche.
  // rows: pro Challenge { c, potOpen, myOpen, penaltyCount, openPeople, openIds, openWeeks }.
  // total: Summen; openIds über alle Challenges ohne Doppelte (eine Person mit
  // offenen Strafen in zwei Challenges zählt einmal).
  function penaltyOverview({ comps = [], penalties = [], payouts = [], closures = [], challengeWeeks = [], me, monday }) {
    const of = (list, cid) => list.filter(x => x.competition_id === cid);
    const rows = comps.map(c => {
      const pens = of(penalties, c.id);
      const sum = penaltySummary(pens, of(payouts, c.id));
      const closed = new Set(of(closures, c.id).map(x => x.week_start));
      const openWeeks = [...new Set(of(challengeWeeks, c.id)
        .filter(w => (!monday || w.week_start < monday) && !closed.has(w.week_start))
        .map(w => w.week_start))].sort();
      return {
        c,
        potOpen: Math.max(0, sum.potOpen),
        myOpen: Math.max(0, sum.saldo[me] || 0),
        totalPenalties: sum.totalPenalties,
        totalPayouts: sum.totalPayouts,
        penaltyCount: pens.length,
        openPeople: sum.openPeople,
        openIds: sum.openIds,
        openWeeks,
      };
    });
    const add = (k) => rows.reduce((a, r) => a + r[k], 0);
    const openIds = [...new Set(rows.flatMap(r => r.openIds))];
    return {
      rows,
      total: {
        potOpen: add('potOpen'), myOpen: add('myOpen'), penaltyCount: add('penaltyCount'),
        openWeeks: rows.reduce((a, r) => a + r.openWeeks.length, 0),
        openIds, openPeople: openIds.length,
      },
    };
  }

  window.PTScope = { resolve, orderComps, mergeLogCopies, reactionOps, penaltySummary, penaltyOverview };
})();
