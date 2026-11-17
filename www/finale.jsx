/* global React, PTi18n, PTHaptics, PTTrailer, PTData, SideAvatar, sideStyle, ObFigure, obFigTall, weekNumber, formatDuration, tr, trn */
// Wochenabschluss: die große Feier, wenn eine Woche vorbei ist (einmal pro
// Challenge und Woche) oder jemand im Strafkonto „Woche abschließen“ tippt.
// Ablauf pro Challenge: Blackout mit „KW 43 ist vorbei“ → die Balken laufen um
// die Wette → Auflösung. Bei einem Sieg machen Benny und Joni Rückwärtssaltos
// und alles eskaliert; sonst wird trotzdem gefeiert, nur mit anderem Text.
// results: PTDashboard.weekResult, eine pro Challenge.
// Ab PTTrailer.TRAILER_MIN Challenges läuft stattdessen ein Trailer (WeekTrailer
// unten): ein Soundtrack, schnelle Schnitte, eine Bilanz. Einzeln geht weiter.

const FIN_SEEN_KEY = 'pt_finale_seen_v1';

function finaleSeen(me, competitionId, weekStart) {
  try { return !!JSON.parse(localStorage.getItem(FIN_SEEN_KEY) || '{}')[me]?.[`${competitionId}|${weekStart}`]; }
  catch (e) { return false; }
}
function markFinaleSeen(me, competitionId, weekStart) {
  try {
    const all = JSON.parse(localStorage.getItem(FIN_SEEN_KEY) || '{}');
    all[me] = all[me] || {};
    all[me][`${competitionId}|${weekStart}`] = true;
    localStorage.setItem(FIN_SEEN_KEY, JSON.stringify(all));
  } catch (e) {}
}

const FIN_COLORS = ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06d6a0', '#ef476f', '#ffd60a', '#ff00ff', '#00ffff', '#33ff99'];

// Feuerwerk, Konfetti, Emoji-Regen und Schockwellen im Container `ref`.
// level: 0 aus, 1 Feier, 2 Eskalation.
function useFinaleFx(ref, level, emojis) {
  React.useEffect(() => {
    const stage = ref.current;
    if (!stage || !level) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timers = [], intervals = [];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const add = (el, ms) => { stage.appendChild(el); timers.push(setTimeout(() => el.remove(), ms)); };

    function shockwave() {
      const sw = document.createElement('div');
      sw.className = 'cel-shockwave';
      sw.style.color = pick(FIN_COLORS);
      add(sw, 1700);
    }
    function firework() {
      const w = stage.clientWidth, h = stage.clientHeight;
      const cx = 40 + Math.random() * (w - 80), cy = 60 + Math.random() * (h * 0.5);
      const color = pick(FIN_COLORS);
      const trail = document.createElement('div');
      trail.className = 'cel-firework-trail';
      Object.assign(trail.style, { color, left: `${cx}px`, top: `${cy}px`, height: `${h - cy}px` });
      add(trail, 600);
      timers.push(setTimeout(() => {
        const n = level > 1 ? 48 : 32;
        for (let i = 0; i < n; i++) {
          const p = document.createElement('div');
          p.className = 'cel-firework-particle';
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, v = 90 + Math.random() * (level > 1 ? 170 : 110);
          Object.assign(p.style, { color, left: `${cx}px`, top: `${cy}px`, animationDuration: `${1.6 + Math.random()}s` });
          p.style.setProperty('--dx', `${Math.cos(a) * v}px`);
          p.style.setProperty('--dy', `${Math.sin(a) * v}px`);
          add(p, 2700);
        }
      }, 480));
    }
    function confetti() {
      const c = document.createElement('div');
      c.className = 'cel-confetti';
      c.style.left = `${Math.random() * stage.clientWidth}px`;
      if (Math.random() < 0.8) {
        c.style.background = pick(FIN_COLORS);
        c.style.width = `${5 + Math.random() * 8}px`;
        c.style.height = `${9 + Math.random() * 14}px`;
        if (Math.random() < 0.3) c.style.borderRadius = '50%';
      } else { c.textContent = pick(emojis); c.style.fontSize = '22px'; }
      c.style.animationDuration = `${2 + Math.random() * 2}s`;
      add(c, 4400);
    }
    function giant() {
      const e = document.createElement('div');
      e.className = 'cel-giant-emoji';
      e.textContent = pick(emojis);
      e.style.left = `${Math.random() * stage.clientWidth}px`;
      e.style.fontSize = `${40 + Math.random() * 40}px`;
      e.style.animationDuration = `${2.4 + Math.random() * 1.5}s`;
      add(e, 4400);
    }

    [0, 180, 360].forEach(t => timers.push(setTimeout(shockwave, t)));
    timers.push(setTimeout(firework, 100));
    intervals.push(setInterval(firework, level > 1 ? 230 : 520));
    intervals.push(setInterval(confetti, level > 1 ? 28 : 75));
    intervals.push(setInterval(giant, level > 1 ? 260 : 650));
    if (level > 1) intervals.push(setInterval(shockwave, 1300));
    return () => { intervals.forEach(clearInterval); timers.forEach(clearTimeout); };
  }, [ref, level, emojis]);
}

function finaleHaptics(strong) {
  const H = window.PTCelebrationHaptics;
  const call = (fn) => { try { fn(); } catch (e) {} };
  if (!H) { PTHaptics?.success?.(); return () => {}; }
  const beats = strong ? [0, 70, 140, 260, 380, 520, 700] : [0, 120, 300];
  const ts = beats.map(t => setTimeout(() => call(() => H.Haptics.impact({ style: H.ImpactStyle.Heavy })), t));
  ts.push(setTimeout(() => call(() => H.Haptics.notification({ type: H.NotificationType.Success })), strong ? 820 : 420));
  return () => ts.forEach(clearTimeout);
}

// Sieg (Saltos): eigener Sound mit zwei Drops, sonst der vom Wochenziel
function finaleSound(big) {
  try {
    const audio = new Audio(big ? 'sounds/victory.wav' : 'sounds/goal-reached.wav');
    audio.volume = 0.9;
    audio.play().catch(() => {});
    return () => { audio.pause(); };
  } catch (e) { return () => {}; }
}

// Zahl, die in `ms` von 0 hochläuft (für die Balken im Rennen)
function FinCount({ value, ms = 2200, format = (v) => PTi18n.number(v) }) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(v)}</>;
}

function FinaleStage({ res, isLast, total, index, onNext }) {
  const [phase, setPhase] = React.useState('intro'); // intro → race → reveal
  const stageRef = React.useRef(null);
  const { c, sides, totals, unit } = res;
  const fmt = unit === 'min' ? (v) => formatDuration(v) : (v) => PTi18n.number(v);
  const sideName = (s) => (s.isMine && s.userIds.length === 1 ? tr('Du') : s.label);
  const winner = res.winner != null ? sides[res.winner] : null;
  const big = res.won || (sides.length > 2 && res.myRank === 1);
  const level = phase === 'reveal' ? (big ? 2 : 1) : phase === 'race' ? 0 : 0;
  const emojis = React.useMemo(() => (big ? ['🏆', '👑', '🔥', '💪', '⚡', '🚀', '🥇', '🎉', '💯'] : ['💪', '🔥', '⚡', '🎉', '👊']), [big]);
  useFinaleFx(stageRef, level, emojis);

  React.useEffect(() => {
    if (phase === 'intro') { const t = setTimeout(() => setPhase('race'), 1700); return () => clearTimeout(t); }
    if (phase === 'race') { const t = setTimeout(() => setPhase('reveal'), 2900); return () => clearTimeout(t); }
    if (phase === 'reveal') {
      const stopH = finaleHaptics(big);
      const stopS = finaleSound(big);
      return () => { stopH(); stopS(); };
    }
  }, [phase, big]);

  const skip = () => setPhase(p => (p === 'intro' ? 'race' : p === 'race' ? 'reveal' : p));
  const max = Math.max(1, ...totals);
  const order = sides.map((_, i) => i).sort((a, b) => totals[b] - totals[a]).slice(0, 5);
  if (sides.length > 5 && !order.includes(0)) order[order.length - 1] = 0;
  const unitWord = unit === 'min' ? tr('Minuten') : tr('Reps');

  let hero, sub;
  if (res.solo) { hero = tr('WOCHE{br}GESCHAFFT', { br: <br /> }); sub = tr('{done} von {total} Zielen geschafft', { done: res.goalsHit, total: res.goalsTotal }); }
  else if (res.won) {
    hero = sides[0].userIds.length > 1 ? tr('IHR{br}GEWINNT!', { br: <br /> }) : tr('WOCHEN{br}SIEG!', { br: <br /> });
    sub = unit === 'min'
      ? tr('{margin} Minuten Vorsprung · {done}/{total} Ziele', { margin: fmt(res.margin), done: res.goalsHit, total: res.goalsTotal })
      : trn(res.margin, '{n} Rep Vorsprung · {done}/{total} Ziele', '{n} Reps Vorsprung · {done}/{total} Ziele', { done: res.goalsHit, total: res.goalsTotal });
  } else if (res.tie) { hero = tr('UNENT{br}SCHIEDEN', { br: <br /> }); sub = tr('Exakt gleich viel. Nächste Woche entscheidet.'); }
  else if (sides.length > 2) {
    hero = res.myRank === 1 ? tr('PLATZ{br}EINS!', { br: <br /> }) : tr('PLATZ {rank}', { rank: res.myRank });
    sub = tr('{done} von {total} Zielen geschafft', { done: res.goalsHit, total: res.goalsTotal });
  } else {
    hero = tr('WOCHE{br}VORBEI', { br: <br /> });
    sub = winner ? (winner.userIds.length > 1
      ? tr('{name} gewinnen diesmal. Revanche ab Montag!', { name: winner.label })
      : tr('{name} gewinnt diesmal. Revanche ab Montag!', { name: winner.label })) : '';
  }

  return (
    <div className={`fin-stage is-${phase}${big ? ' is-big' : ''}`} ref={stageRef} onClick={phase === 'reveal' ? undefined : skip}>
      {phase === 'reveal' && <>
        <div className="cel-flashbang" />
        <div className="cel-laser-bg" />
        {big && <div className="cel-strobe" />}
        {(big ? ['14deg', '-22deg', '9deg', '-14deg', '20deg', '-8deg'] : ['12deg', '-16deg', '8deg']).map((a, i) => (
          <div key={i} className="cel-laser-beam" style={{ '--top': `${10 + i * 15}%`, '--angle': a, '--delay': `${i * 0.25}s`, '--dur': `${1.5 + (i % 3) * 0.2}s`, '--color': FIN_COLORS[i * 2 % FIN_COLORS.length] }} />
        ))}
      </>}

      <div className="fin-top">
        <span className="fin-comp">{c.emoji} {c.name}</span>
        {total > 1 && <span className="fin-count mono">{index + 1}/{total}</span>}
      </div>

      {phase === 'intro' && (
        <div className="fin-intro">
          <div className="fin-kw">{tr('KW {week}', { week: weekNumber(res.weekStart) })}</div>
          <div className="fin-over">{tr('ist vorbei')}</div>
        </div>
      )}

      {phase !== 'intro' && (
        <div className="fin-body">
          {phase === 'reveal' && (
            <div className="fin-hero-wrap">
              <div className="fin-hero">{hero}</div>
              {sub && <div className="fin-sub">{sub}</div>}
            </div>
          )}

          {!res.solo && (
            <div className={`fin-race${phase === 'reveal' ? ' is-done' : ''}`}>
              {order.map(i => {
                const s = sides[i];
                const isWin = phase === 'reveal' && res.winner === i;
                return (
                  <div key={s.key} className={`fin-lane${s.isMine ? ' is-me' : ''}${isWin ? ' is-win' : ''}`} style={sideStyle(s)}>
                    <span className="fin-lane-who">
                      <span className="fin-lane-avatar">
                        <SideAvatar side={s} size={isWin ? 44 : 36} />
                        {isWin && <span className="fin-crown" aria-hidden="true">👑</span>}
                      </span>
                      <span className="fin-lane-name">{sideName(s)}</span>
                    </span>
                    <span className="fin-lane-track"><i style={{ width: phase === 'intro' ? 0 : `${(totals[i] / max) * 100}%` }} /></span>
                    <span className="fin-lane-val mono"><FinCount value={totals[i]} format={fmt} /></span>
                  </div>
                );
              })}
              <div className="fin-unit">{unitWord}</div>
            </div>
          )}

          {phase === 'reveal' && (
            <div className={`fin-duo${big ? ' is-flipping' : ''}`} aria-hidden="true">
              <span className="fin-fig is-benny"><ObFigure who="benny" pose={big ? 'cheer' : res.won || res.tie ? 'flex' : 'point'} tall={obFigTall(big ? 132 : 118)} /></span>
              <span className="fin-fig is-joni"><ObFigure who="joni" pose={big ? 'cheer' : 'flex'} tall={obFigTall(big ? 132 : 118)} /></span>
            </div>
          )}
        </div>
      )}

      {phase === 'reveal' ? (
        <button className="fin-next" onClick={onNext}>{isLast ? tr('Weiter') : tr('Nächste Challenge')}</button>
      ) : (
        <div className="fin-hint">{tr('tap zum Überspringen')}</div>
      )}
    </div>
  );
}

// ─── Trailer ab drei Challenges ─────────────────────────────────────────────
const TRL_MOODS = { win: ['🏆', '👑', '🔥', '💪', '⚡', '🚀', '🥇', '🎉', '💯'], even: ['💪', '🔥', '⚡', '🎬', '🍿'] };

// Ein Ton, der sich weich ausblenden lässt
function trailerAudio(src, volume = 0.9) {
  try {
    const a = new Audio(src);
    a.volume = volume;
    a.play().catch(() => {});
    let fade = null;
    return {
      stop(ms = 0) {
        clearInterval(fade);
        if (!ms) { a.pause(); return; }
        const step = a.volume / Math.max(1, ms / 40);
        fade = setInterval(() => {
          a.volume = Math.max(0, a.volume - step);
          if (a.volume <= 0.01) { clearInterval(fade); a.pause(); }
        }, 40);
      },
    };
  } catch (e) { return { stop() {} }; }
}

function trailerTick(strong) {
  const H = window.PTCelebrationHaptics;
  try {
    if (H) H.Haptics.impact({ style: strong ? H.ImpactStyle.Heavy : H.ImpactStyle.Light });
    else if (strong) PTHaptics?.success?.();
  } catch (e) {}
}

const trlUnit = (unit) => (unit === 'min' ? tr('Minuten') : unit === 'reps' ? tr('Reps') : tr('Ziele'));

function TrailerCut({ cut, index, total, fmtNum }) {
  const { r, look, verdict, mood, line } = cut;
  const me = r.sides[0];
  const rival = cut.rival != null ? r.sides[cut.rival] : null;
  const ms = 900;
  const num = (v) => <FinCount value={v} ms={ms} format={fmtNum(r.unit)} />;
  const sideName = (s) => (s.isMine && s.userIds.length === 1 ? tr('Du') : s.label);
  let body;
  if (look === 'goals') {
    body = (
      <div className="trl-big">
        <div className="trl-big-num mono">{r.goalsHit}<span>/{r.goalsTotal}</span></div>
        <div className="trl-big-unit">{tr('Ziele')}</div>
      </div>
    );
  } else if (look === 'rank') {
    body = (
      <div className="trl-big">
        <div className="trl-big-num mono">#{r.myRank}</div>
        <div className="trl-big-unit">{tr('von {n}', { n: r.sides.length })} · {num(cut.mine)} {trlUnit(r.unit)}</div>
      </div>
    );
  } else if (look === 'versus' && rival) {
    body = (
      <div className="trl-vs">
        <div className="trl-vs-side is-me" style={sideStyle(me)}>
          <SideAvatar side={me} size={72} />
          <b>{sideName(me)}</b>
          <span className="mono">{num(cut.mine)}</span>
        </div>
        <div className="trl-vs-x">VS{/* i18n-ignore: überall VS */}</div>
        <div className="trl-vs-side" style={sideStyle(rival)}>
          <SideAvatar side={rival} size={72} />
          <b>{sideName(rival)}</b>
          <span className="mono">{num(cut.rivalTotal)}</span>
        </div>
      </div>
    );
  } else if (look === 'bars' && rival) {
    const max = Math.max(1, cut.mine, cut.rivalTotal);
    body = (
      <div className="fin-race trl-race">
        {[[me, cut.mine], [rival, cut.rivalTotal]].map(([s, v]) => (
          <div key={s.key} className={`fin-lane${s.isMine ? ' is-me' : ''}`} style={sideStyle(s)}>
            <span className="fin-lane-who"><span className="fin-lane-avatar"><SideAvatar side={s} size={34} /></span>
              <span className="fin-lane-name">{sideName(s)}</span></span>
            <span className="fin-lane-track"><i className="trl-grow" style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="fin-lane-val mono">{num(v)}</span>
          </div>
        ))}
        <div className="fin-unit">{trlUnit(r.unit)}</div>
      </div>
    );
  } else if (look === 'stamp') {
    body = <div className="trl-emoji" aria-hidden="true">{r.c.emoji || '💪'}</div>;
  } else {
    body = (
      <div className="trl-big">
        <div className="trl-big-num mono">{num(cut.mine)}</div>
        <div className="trl-big-unit">{trlUnit(r.unit)}{rival ? ` · ${tr('{name}: {n}', { name: sideName(rival), n: fmtNum(r.unit)(cut.rivalTotal) })}` : ''}</div>
      </div>
    );
  }
  return (
    <div className={`trl-cut trl-in-${index % 5} is-${mood} look-${look}`}>
      <div className="trl-cut-head">
        <span className="trl-cut-emoji" aria-hidden="true">{r.c.emoji}</span>
        <span className="trl-cut-name">{r.c.name}</span>
      </div>
      <div className="trl-cut-body">{body}</div>
      <div className={`trl-stamp is-${mood}`}>{verdict}</div>
      <p className="trl-line">{line}</p>
    </div>
  );
}

function TrailerFinale({ S, fmtNum, onDone, onReplay, onDetails }) {
  const { record } = S;
  return (
    <div className="trl-finale">
      <div className="trl-finale-kicker">{tr('Die Bilanz')}</div>
      {record.competitive ? (
        <div className="trl-score">
          <div className="trl-score-cell is-win"><b className="mono"><FinCount value={record.wins} ms={700} /></b><span>{tr('Gewonnen')}</span></div>
          {record.ties > 0 && <div className="trl-score-cell"><b className="mono"><FinCount value={record.ties} ms={700} /></b><span>{tr('Remis')}</span></div>}
          <div className="trl-score-cell is-loss"><b className="mono"><FinCount value={record.losses} ms={700} /></b><span>{tr('Verloren')}</span></div>
        </div>
      ) : (
        <div className="trl-score">
          <div className="trl-score-cell is-win"><b className="mono">{record.goalsHit}/{record.goalsTotal}</b><span>{tr('Ziele')}</span></div>
        </div>
      )}
      <div className="trl-finale-facts">
        {record.reps > 0 && <div><b className="mono"><FinCount value={record.reps} ms={1400} /></b> {tr('Reps diese Woche')}</div>}
        {record.competitive && <div><b className="mono">{record.goalsHit}/{record.goalsTotal}</b> {tr('Ziele geschafft')}</div>}
        {S.mvp && <div>🏆 {tr('Bester Auftritt: {name}', { name: `${S.mvp.r.c.emoji || ''} ${S.mvp.r.c.name}`.trim() })}</div>}
      </div>
      <p className="trl-verdict">{S.verdictLine}</p>
      <p className="trl-tagline">{S.tagline}</p>
      <div className={`fin-duo${S.big ? ' is-flipping' : ''}`} aria-hidden="true">
        <span className="fin-fig is-benny"><ObFigure who="benny" pose={S.big ? 'cheer' : 'flex'} tall={obFigTall(104)} /></span>
        <span className="fin-fig is-joni"><ObFigure who="joni" pose={S.big ? 'cheer' : 'point'} tall={obFigTall(104)} /></span>
      </div>
      <button className="fin-next" onClick={onDone}>{tr('Weiter')}</button>
      <div className="trl-more">
        <button type="button" onClick={onReplay}>↺ {tr('Nochmal ansehen')}</button>
        <button type="button" onClick={onDetails}>{tr('Einzeln ansehen')}</button>
      </div>
    </div>
  );
}

// Steps: 0 Intro-Zeile 1, 1 Intro-Zeile 2, 2 Titel, 3 … 3+n-1 Schnitte, 3+n Finale
function WeekTrailer({ results, onDone, onDetails }) {
  const weekStart = results[0]?.weekStart;
  const fmtNum = React.useCallback((unit) => (v) => (unit === 'min' ? formatDuration(v) : PTi18n.number(v)), []);
  const S = React.useMemo(() => PTTrailer.script(results, {
    fmt: (v, unit) => (unit === 'min' ? formatDuration(v) : trn(v, '{n} Rep', '{n} Reps', { n: PTi18n.number(v) })),
    nextWeek: weekNumber(PTData.addDays(weekStart, 7)),
  }), [results, weekStart]);
  const tl = PTTrailer.timeline(S.count);
  const FINALE = 3 + S.count;
  const [step, setStep] = React.useState(0);
  const [run, setRun] = React.useState(0); // Nochmal ansehen
  const stageRef = React.useRef(null);
  const bed = React.useRef(null);
  const reduced = React.useMemo(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  // Zeitplan: alle Schritte ab Start, passend zum Soundtrack
  React.useEffect(() => {
    setStep(0);
    bed.current = trailerAudio('sounds/trailer.wav', 0.85);
    const at = [0, tl.cold2, tl.title, ...S.cuts.map((_, i) => tl.cuts + i * tl.cut), tl.finale];
    const timers = at.map((sec, i) => setTimeout(() => setStep(s => Math.max(s, i)), sec * 1000));
    return () => { timers.forEach(clearTimeout); bed.current?.stop(); };
  }, [run]);

  const atFinale = step >= FINALE;
  React.useEffect(() => {
    if (step >= 3 && step < FINALE) trailerTick(false);
  }, [step]);
  // Finale: Soundtrack aus, ein Schlusston, ein Feuerwerk
  React.useEffect(() => {
    if (!atFinale) return;
    bed.current?.stop(500);
    const sting = trailerAudio(S.big ? 'sounds/victory.wav' : 'sounds/goal-reached.wav', 0.9);
    const stopH = finaleHaptics(S.big);
    return () => { sting.stop(); stopH(); };
  }, [atFinale, run]);

  const emojis = React.useMemo(() => (S.big ? TRL_MOODS.win : TRL_MOODS.even), [S.big]);
  useFinaleFx(stageRef, atFinale ? (S.big ? 2 : 1) : 0, emojis);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Tippen spult weiter: Intro → erster Schnitt, Schnitt → nächster
  const advance = () => { if (!atFinale) setStep(s => (s < 3 ? 3 : s + 1)); };
  const cutIndex = step - 3;
  const cut = step >= 3 && !atFinale ? S.cuts[cutIndex] : null;
  const phase = atFinale ? 'finale' : step < 2 ? 'cold' : step === 2 ? 'title' : 'cut';

  return (
    <div className="fin trl" role="dialog" aria-modal="true" aria-label={tr('Wochen-Trailer')}>
      {/* key: „Nochmal ansehen“ startet mit frischer Bühne (Feuerwerk und Scrollstand weg) */}
      <div key={run} className={`fin-stage trl-stage is-${phase}${cut ? ` mood-${cut.mood}` : ''}${atFinale && S.big ? ' is-big' : ''}${reduced ? ' is-reduced' : ''}`}
        ref={stageRef} onClick={atFinale ? undefined : advance}>
        {!atFinale && <div className="trl-letterbox" aria-hidden="true"><i /><i /></div>}
        {atFinale && <>
          <div className="cel-flashbang" />
          <div className="cel-laser-bg" />
          {['12deg', '-16deg', '8deg'].map((a, i) => (
            <div key={i} className="cel-laser-beam" style={{ '--top': `${12 + i * 18}%`, '--angle': a, '--delay': `${i * 0.25}s`, '--dur': `${1.5 + i * 0.2}s`, '--color': FIN_COLORS[i * 3 % FIN_COLORS.length] }} />
          ))}
        </>}

        <div className="trl-top">
          <div className="trl-progress" aria-hidden="true">
            {S.cuts.map((c, i) => (
              <i key={c.key} className={i < cutIndex || atFinale ? 'is-done' : i === cutIndex ? 'is-now' : ''}
                style={i === cutIndex ? { animationDuration: `${tl.cut}s` } : undefined} />
            ))}
          </div>
          {!atFinale && <button type="button" className="trl-skip" onClick={(e) => { e.stopPropagation(); setStep(FINALE); }}>{tr('Überspringen')}</button>}
        </div>

        {phase === 'cold' && (
          <div className="trl-cold">
            <p key={step} className="trl-cold-line">{S.cold[step]}</p>
          </div>
        )}
        {phase === 'title' && (
          <div className="trl-title">
            <div className="fin-kw">{tr('KW {week}', { week: weekNumber(weekStart) })}</div>
            <div className="trl-title-sub">{tr('Der Wochen-Trailer')}</div>
            <div className="cel-shockwave" />
          </div>
        )}
        {cut && <TrailerCut key={`${cut.key}|${run}`} cut={cut} index={cutIndex} total={S.count} fmtNum={fmtNum} />}
        {atFinale && (
          <TrailerFinale key={run} S={S} fmtNum={fmtNum} onDone={onDone}
            onReplay={() => { setRun(n => n + 1); }} onDetails={onDetails} />
        )}
      </div>
    </div>
  );
}

function WeekFinale({ results, onDone }) {
  const [index, setIndex] = React.useState(0);
  const [single, setSingle] = React.useState(false);
  const res = results[index];
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (!res) return null;
  if (!single && results.length >= PTTrailer.TRAILER_MIN) {
    return <WeekTrailer results={results} onDone={onDone} onDetails={() => { setIndex(0); setSingle(true); }} />;
  }
  const next = () => (index + 1 < results.length ? setIndex(index + 1) : onDone());
  return (
    <div className="fin" role="dialog" aria-modal="true" aria-label={tr('Wochenabschluss')}>
      <FinaleStage key={`${res.c.id}|${res.weekStart}`} res={res} index={index} total={results.length}
        isLast={index + 1 >= results.length} onNext={next} />
    </div>
  );
}

Object.assign(window, { WeekFinale, WeekTrailer, finaleSeen, markFinaleSeen });
