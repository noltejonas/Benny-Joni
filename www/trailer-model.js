// Projekt Terminator — Wochen-Trailer (ohne React)
//
// Ab TRAILER_MIN Challenges läuft der Wochenabschluss nicht mehr Challenge für
// Challenge (gleicher Sound, gleiche Animation, siebenmal), sondern als ein
// Trailer: Kino-Intro, schnelle Schnitte pro Challenge mit frechem Spruch,
// Finale mit der Bilanz. Darunter einzeln wie bisher (finale.jsx).
//
// - script(results): Ablauf aus PTDashboard.weekResult (eine pro Challenge)
// - timeline(n):     Zeitpunkte in Sekunden; passen zu sounds/trailer.wav
//                    (tools/make-sounds.cjs, gleiche Zahlen dort)
// Sprüche werden pro Woche und Challenge fest ausgewählt (Hash), damit
// „Nochmal ansehen“ dasselbe zeigt und jede Woche andere kommen.

(function () {
  const TRAILER_MIN = 3;
  // Soundtrack: Intro-Schläge bei 0 und 1,5 s, Titel bei 3 s, Beat ab 4,5 s mit
  // 120 BPM (ein Schlag = 0,5 s). Schnitte dauern ganze Schläge.
  const T = { cold2: 1.5, title: 3.0, cuts: 4.5, beat: 0.5 };

  // Lang genug, um den Spruch zu lesen; erst ab neun Challenges schneller
  function cutSeconds(n) {
    return n <= 3 ? 2.5 : n <= 8 ? 2.0 : 1.5;
  }
  function timeline(n) {
    const cut = cutSeconds(n);
    return { ...T, cut, finale: T.cuts + n * cut };
  }

  // Kleiner Hash für die feste Auswahl
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }

  const COLD = [
    () => [tr('In einer Welt, in der jede Wiederholung zählt …'), tr('… gab es eine Woche, die alles verändert hat.')],
    (n) => [tr('Sieben Tage.'), tr('{n} Challenges. Null Ausreden.', { n })],
    () => [tr('Was bisher geschah …'), tr('Schweiß. Drama. Muskelkater.')],
  ];

  // v: { name, margin, rank }
  const LINES = {
    winBig: [
      (v) => tr('Gegen {name} war das kein Duell, das war eine Demo.', v),
      (v) => tr('{margin} Vorsprung. Jemand sollte mal bei {name} nach dem Rechten sehen.', v),
      () => tr('Gegner? Eher Sparringspartner.'),
      () => tr('So sieht Dominanz aus. Bitte ausdrucken und an den Kühlschrank hängen.'),
    ],
    winClose: [
      (v) => tr('Knapp ist auch gewonnen. Frag mal {name}.', v),
      () => tr('Herzschlag-Finale. Der Puls ist immer noch oben.'),
      () => tr('Zentimeterarbeit. Aber Sieg ist Sieg.'),
    ],
    lossClose: [
      () => tr('So knapp. Tut fast so weh wie der Muskelkater.'),
      () => tr('Fast. Und „fast“ zählt nur beim Hufeisenwerfen.'),
      () => tr('Ein paar Reps mehr und das wäre ein ganz anderer Film.'),
    ],
    lossBig: [
      () => tr('Verloren. Aber hey: Muskelkater gibt’s trotzdem.'),
      () => tr('Das war kein Verlieren. Das war strategisches Aufwärmen.'),
      (v) => tr('Diesmal: Punkt für {name}. Diesmal.', v),
      () => tr('Plot-Twist: Die Revanche beginnt am Montag.'),
    ],
    tie: [
      () => tr('Gleichstand. Niemand gewinnt, alle schwitzen.'),
      () => tr('Perfekt ausbalanciert, so wie alle Dinge sein sollten.'),
    ],
    first: [
      () => tr('Platz 1. Die anderen waren auch da.'),
      () => tr('Ganz oben. Die Aussicht ist fantastisch.'),
    ],
    mid: [
      (v) => tr('Platz {rank}. Solides Mittelfeld, nächste Woche Treppchen.', v),
      (v) => tr('Platz {rank}. Nicht Gold, aber auch nicht peinlich.', v),
    ],
    last: [
      () => tr('Letzter Platz. Irgendwer muss die Statistik ja tragen.'),
      () => tr('Von hier aus geht’s nur noch nach oben.'),
    ],
    soloDone: [
      () => tr('Solo-Mission erfüllt. Gegner? Nicht nötig.'),
      () => tr('Alle Ziele geschafft. Allein. Wie ein Actionheld.'),
    ],
    soloMiss: [
      () => tr('Der einzige Gegner war das Sofa. Das Sofa hat gewonnen.'),
      () => tr('Solo und trotzdem knapp verloren: gegen dich selbst.'),
    ],
    ghost: [
      () => tr('Null Reps. Bist du sicher, dass du mitgemacht hast?'),
      () => tr('Diese Challenge hat dich vermisst.'),
    ],
  };

  const TAGLINES = [
    (v) => tr('Demnächst: KW {week}. Diesmal wird’s persönlich.', v),
    () => tr('Fortsetzung folgt. Ab Montag in deiner App.'),
    () => tr('Nach dem Abspann: Wasser trinken. Dehnen. Revanche planen.'),
  ];

  // Art des Ausgangs einer Challenge (weekResult)
  function kindOf(r) {
    const mine = r.totals?.[0] || 0;
    if (r.solo) return r.goalsHit >= r.goalsTotal ? 'soloDone' : 'soloMiss';
    if (!mine && !r.goalsHit) return 'ghost';
    if (r.sides.length > 2) {
      if (r.myRank === 1) return 'first';
      return r.myRank >= r.sides.length ? 'last' : 'mid';
    }
    if (r.tie) return 'tie';
    const other = r.totals[1] || 0;
    const top = Math.max(mine, other);
    const close = Math.abs(mine - other) <= Math.max(3, Math.round(top * 0.1));
    if (r.won) return close ? 'winClose' : 'winBig';
    return close ? 'lossClose' : 'lossBig';
  }

  // Bester Gegner: die stärkste andere Seite
  function rivalOf(r) {
    let best = null;
    r.sides.forEach((s, i) => {
      if (i > 0 && (best == null || (r.totals[i] || 0) > (r.totals[best] || 0))) best = i;
    });
    return best;
  }

  // results: weekResult je Challenge (gleiche Woche). Liefert den Ablauf mit
  // fertigen Texten; Zahlen formatiert die Oberfläche.
  function script(results, { fmt = (v) => String(v), nextWeek = null } = {}) {
    const list = (results || []).filter(Boolean);
    const weekStart = list[0]?.weekStart || '';
    const used = new Set();
    // Spruch aus pool, fest pro Woche und Schlüssel, ohne Wiederholung im Trailer
    const pick = (pool, key, vars) => {
      let i = hash(`${weekStart}|${key}`) % pool.length;
      for (let n = 0; n < pool.length && used.has(pool[i]); n++) i = (i + 1) % pool.length;
      used.add(pool[i]);
      return pool[i](vars);
    };

    const cuts = list.map((r, i) => {
      const kind = kindOf(r);
      const rival = rivalOf(r);
      const rivalSide = rival != null ? r.sides[rival] : null;
      const mine = r.totals?.[0] || 0;
      const vars = {
        name: rivalSide?.label || '',
        margin: fmt(Math.abs(mine - (rival != null ? r.totals[rival] || 0 : 0)), r.unit),
        rank: r.myRank,
      };
      const won = kind === 'winBig' || kind === 'winClose' || kind === 'first' || kind === 'soloDone';
      const lost = kind === 'lossBig' || kind === 'lossClose' || kind === 'last' || kind === 'soloMiss' || kind === 'ghost';
      const verdict = kind === 'tie' ? tr('UNENTSCHIEDEN')
        : kind === 'soloDone' ? tr('GESCHAFFT') : kind === 'soloMiss' ? tr('VERPASST')
        : r.sides.length > 2 ? tr('PLATZ {rank}', { rank: r.myRank })
        : won ? tr('SIEG') : tr('NIEDERLAGE');
      // Aussehen: Gruppen zeigen den Platz, Solo die Ziele, Duelle wechseln ab
      const look = r.solo ? 'goals' : r.sides.length > 2 ? 'rank' : ['versus', 'number', 'stamp', 'bars'][i % 4];
      return {
        key: `${r.c.id}|${r.weekStart}`, r, kind, look, verdict,
        mood: won ? 'win' : lost ? 'loss' : 'even',
        mine, rival, rivalTotal: rival != null ? r.totals[rival] || 0 : 0,
        line: pick(LINES[kind], `${r.c.id}|${kind}`, vars),
      };
    });

    const duels = cuts.filter(c => !c.r.solo && c.r.sides.length === 2);
    const wins = cuts.filter(c => c.mood === 'win' && !c.r.solo).length;
    const losses = cuts.filter(c => c.mood === 'loss' && !c.r.solo).length;
    const ties = cuts.filter(c => c.kind === 'tie').length;
    const reps = list.filter(r => r.unit === 'reps').reduce((a, r) => a + (r.totals?.[0] || 0), 0);
    const goalsHit = list.reduce((a, r) => a + (r.goalsHit || 0), 0);
    const goalsTotal = list.reduce((a, r) => a + (r.goalsTotal || 0), 0);
    // Bester Auftritt (nur ein Sieg): höchster relativer Vorsprung, bei Gleichstand meiste Reps
    const score = (c) => (c.mood === 'win' ? 2 + (c.mine - c.rivalTotal) / Math.max(1, c.mine) : c.mood === 'even' ? 1 : 0) * 1e9 + c.mine;
    const mvp = cuts.length ? cuts.reduce((a, c) => (score(c) > score(a) ? c : a)) : null;

    const competitive = wins + losses + ties > 0;
    const verdictLine = !competitive
      ? tr('{done} von {total} Zielen. Die Woche ist im Kasten.', { done: goalsHit, total: goalsTotal })
      : losses === 0 && wins > 0 ? tr('Makellose Woche. Fast schon verdächtig.')
      : wins > losses ? tr('{wins} Siege. Die Konkurrenz sucht schon Ausreden.', { wins })
      : wins === losses ? tr('Ausgeglichen. Das Universum ist zufrieden.')
      : wins > 0 ? tr('Mehr Niederlagen als Siege. Aber wer zählt schon mit? Ach ja: die App.')
      : tr('Null Siege. Dafür 100 % Comeback-Potenzial.');

    return {
      weekStart, count: cuts.length,
      cold: COLD[hash(weekStart) % COLD.length](cuts.length),
      cuts,
      record: { wins, losses, ties, duels: duels.length, reps, goalsHit, goalsTotal, competitive },
      mvp: mvp && mvp.mood === 'win' ? mvp : null,
      big: competitive ? wins > losses : goalsHit >= goalsTotal && goalsTotal > 0,
      verdictLine,
      tagline: pick(TAGLINES, 'tagline', { week: nextWeek ?? '' }),
    };
  }

  window.PTTrailer = { TRAILER_MIN, timeline, cutSeconds, script, kindOf, _hash: hash };
})();
