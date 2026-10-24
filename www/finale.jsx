/* global React, PTi18n, PTHaptics, SideAvatar, ObFigure, obFigTall, weekNumber, formatDuration, tr, trn */
// Wochenabschluss: die große Feier, wenn eine Woche vorbei ist (einmal pro
// Challenge und Woche) oder jemand im Strafkonto „Woche abschließen“ tippt.
// Ablauf pro Challenge: Blackout mit „KW 43 ist vorbei“ → die Balken laufen um
// die Wette → Auflösung. Bei einem Sieg machen Benny und Joni Rückwärtssaltos
// und alles eskaliert; sonst wird trotzdem gefeiert, nur mit anderem Text.
// results: PTDashboard.weekResult, eine pro Challenge.

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

function finaleSound() {
  try {
    const audio = new Audio('sounds/goal-reached.wav');
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
      const stopS = finaleSound();
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
                  <div key={s.key} className={`fin-lane${s.isMine ? ' is-me' : ''}${isWin ? ' is-win' : ''}`} style={{ '--sc': s.color }}>
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

function WeekFinale({ results, onDone }) {
  const [index, setIndex] = React.useState(0);
  const res = results[index];
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (!res) return null;
  const next = () => (index + 1 < results.length ? setIndex(index + 1) : onDone());
  return (
    <div className="fin" role="dialog" aria-modal="true" aria-label={tr('Wochenabschluss')}>
      <FinaleStage key={`${res.c.id}|${res.weekStart}`} res={res} index={index} total={results.length}
        isLast={index + 1 >= results.length} onNext={next} />
    </div>
  );
}

Object.assign(window, { WeekFinale, finaleSeen, markFinaleSeen });
