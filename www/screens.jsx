/* global React, Ring, Icon, MiniRing, CountUp, Sheet, Stepper, Toast, formatRelative, formatWeek, weekNumber, todayGreeting, formatDuration, PTPeople, Avatar, SideAvatar, sideStyle, totalsBySide, uniqueMaxIndex, sideIndexByUser */
const { useState, useEffect, useMemo } = React;

// Per-athlete-per-category quick-log values, stored locally.
function getQuickSets(athlete, catId) {
  try {
    const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
    return all[`${athlete}:${catId}`] || [5, 10, 15];
  } catch { return [5, 10, 15]; }
}
function setQuickSets(athlete, catId, arr) {
  const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
  all[`${athlete}:${catId}`] = arr;
  localStorage.setItem('quickSets', JSON.stringify(all));
}

function QuickLogRow({ me, catId, onQuick, onLog }) {
  const [values, setValues] = useState(() => getQuickSets(me, catId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values);

  useEffect(() => { setValues(getQuickSets(me, catId)); setEditing(false); }, [me, catId]);

  function commit(next) {
    const clean = next.filter(n => Number.isFinite(n) && n > 0).slice(0, 6);
    setQuickSets(me, catId, clean);
    setValues(clean);
    setDraft(clean);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="quick-row quick-row-edit">
        <div className="quick-row-label">Schnellsatz bearbeiten</div>
        <div className="quick-chips">
          {draft.map((v, i) => (
            <div key={i} className="quick-chip-edit">
              <input className="quick-chip-input mono" type="number" inputMode="numeric"
                value={v}
                onChange={e => {
                  const n = parseInt(e.target.value);
                  const next = [...draft]; next[i] = Number.isFinite(n) ? n : 0; setDraft(next);
                }}
                onFocus={e => e.target.select()} />
              <button className="quick-chip-del" aria-label="Entfernen"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {draft.length < 6 && (
            <button className="quick-chip-add" aria-label="Wert hinzufügen" onClick={() => setDraft([...draft, 10])}>＋</button>
          )}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
          <button className="btn-ghost-sm" onClick={() => { setDraft(values); setEditing(false); }}>Abbrechen</button>
          <button className="btn-ghost-sm primary" onClick={() => commit(draft)}>Speichern</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quick-row">
      <div className="quick-row-head">
        <span className="quick-row-label">Schnellsatz</span>
        {values.length > 0 && (
          <button className="quick-edit-btn" aria-label="Schnellsatz bearbeiten" onClick={() => { setDraft(values); setEditing(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        )}
      </div>
      <div className="quick-chips">
        {onLog && (
          <button className="quick-chip-open" onClick={onLog}>+ Satz</button>
        )}
        {values.length === 0 ? (
          <button className="quick-chip-setup" onClick={() => { setDraft([5, 10, 15]); setEditing(true); }}>
            Schnellsatz festlegen
          </button>
        ) : values.map((v, i) => (
          <button key={i} className="quick-chip mono" onClick={() => onQuick(v)}>+{v}</button>
        ))}
      </div>
    </div>
  );
}

// ─── HEUTE (Home) ────────────────────────────────────────────────────────────

function localDateOf(input) {
  const d = input instanceof Date ? input : new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayIndexInWeek(weekStart, today = new Date()) {
  const ws = new Date(weekStart + 'T00:00:00');
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const diff = Math.floor((t - ws) / 86400000) + 1;
  return Math.max(1, Math.min(7, diff));
}

// athletes: eine User-ID oder eine Liste (Team).
function repsOnLocalDate(sets, athletes, dateStr) {
  const ids = Array.isArray(athletes) ? athletes : [athletes];
  return sets
    .filter(s => ids.includes(s.athlete) && localDateOf(s.created_at) === dateStr)
    .reduce((sum, s) => sum + PTData.setValue(s), 0);
}

// Mo-first weekly breakdown per group (Liste von User-ID-Listen) → day.vals[i].
// Future days are forced to zero so a stray future-dated set never inflates a bar.
function dailyBreakdownFor(weekStart, sets, groups) {
  const ws = weekStart || localDateOf(PTData.mondayOf(new Date()));
  const todayIso = localDateOf(new Date());
  const groupOf = {};
  groups.forEach((ids, i) => ids.forEach(id => { groupOf[id] = i; }));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = localDateOf(d);
    days.push({
      iso, dow: d.getDay(),
      vals: groups.map(() => 0),
      isFuture: iso > todayIso,
      isToday: iso === todayIso,
    });
  }
  const byIso = Object.fromEntries(days.map(d => [d.iso, d]));
  for (const s of sets) {
    const day = localDateOf(s.created_at);
    const bucket = byIso[day];
    const g = groupOf[s.athlete];
    if (bucket && !bucket.isFuture && g != null) bucket.vals[g] += PTData.setValue(s);
  }
  const labels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return days
    .map(d => ({ ...d, label: labels[d.dow] }))
    .sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));
}

function DailyStatus({ variant, done, fairShare, dailyTarget, todayReps, trackDelta }) {
  const isDone = done >= fairShare;
  const footerClass = variant === 'tug' ? 'tug-foot' : 'owe';

  if (isDone) {
    return <div className={`${footerClass} mono done`}>✓ erledigt</div>;
  }

  const statusClass = trackDelta >= 0 ? 'ok' : 'behind';
  const statusText = trackDelta >= 0 ? '✓ Auf Kurs' : `${Math.abs(trackDelta)} hinten`;

  return (
    <>
      <div className="daily-line mono">
        <span>heute {todayReps} / {dailyTarget}</span>
      </div>
      <div className={`track-status ${statusClass}`}>{statusText}</div>
    </>
  );
}

function WeekCloseBanner({ weekStart, onClose }) {
  function weekKW(ws) {
    const d = new Date(ws + 'T00:00:00'); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yStart) / 86400000) + 1) / 7);
  }
  return (
    <div className="weekclose-banner">
      <div className="weekclose-banner-title">KW {weekKW(weekStart)} ist um.</div>
      <div className="weekclose-banner-sub">Strafkonto-Abschluss noch offen.</div>
      <button className="weekclose-banner-btn" onClick={() => onClose(weekStart)}>Woche abschließen</button>
    </div>
  );
}

// Rangliste für „Jeder gegen jeden“ (statt Tauziehen).
function RankList({ sides, stats, target, sideShares, fmtVal, total, remaining }) {
  const order = sides.map((s, i) => i).sort((a, b) => stats[b].done - stats[a].done);
  const max = Math.max(1, ...stats.map(s => s.done));
  return (
    <div className="mu-rank">
      <div className="mu-rank-head mono">
        <span>Gesamt {fmtVal(total)} / {fmtVal(target)}</span>
        <span className={remaining === 0 ? 'done' : ''}>{remaining === 0 ? '🎉 erreicht' : `noch ${fmtVal(remaining)}`}</span>
      </div>
      {order.map((i, rank) => {
        const side = sides[i];
        const s = stats[i];
        const doneShare = s.done >= sideShares[i];
        return (
          <div key={side.key} className={`mu-rank-row ${side.cls} ${side.isMine ? 'mine' : ''}`} style={sideStyle(side)}>
            <span className="mu-rank-pos mono">{rank + 1}</span>
            <SideAvatar side={side} size={26} />
            <span className="mu-rank-name">{side.isMine ? 'Du' : side.label}</span>
            <span className="mu-rank-bar"><span className="mu-rank-fill" style={{ width: `${(s.done / max) * 100}%`, background: side.color }} /></span>
            <span className="mu-rank-val mono">{fmtVal(s.done)}{doneShare ? ' ✓' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

const challengeCount = (n) => n === 1 ? 'eine Challenge' : `${n} Challenges`;

// Vergleichskarte auf „Heute“. Zwei Seiten (1v1, 2v2): Duell mit Score und geteiltem Balken.
// Mehr Seiten (Jeder gegen jeden): Rangliste. entries[0] ist immer die eigene Seite.
function DuelCard({ entries, title, meta }) {
  const total = entries.reduce((a, e) => a + e.reps, 0);

  if (entries.length !== 2) {
    const ranked = [...entries].sort((x, y) => y.reps - x.reps);
    const max = Math.max(1, ranked[0]?.reps || 0);
    const myRank = ranked.findIndex(e => e.side.isMine) + 1;
    return (
      <section className="rd-card rd-duel" aria-label="Rangliste diese Woche">
        <div className="rd-duel-head"><span>{title}</span><span>{meta}</span></div>
        <p className="rd-duel-line">{total === 0 ? 'Noch nichts geloggt. Wer legt vor?' : `Du bist auf Platz ${myRank}.`}</p>
        <ol className="rd-rank">
          {ranked.map((e, i) => (
            <li key={e.side.key} className={e.side.isMine ? 'is-me' : ''} style={sideStyle(e.side)}>
              <span className="rd-rank-pos">{i + 1}</span>
              <SideAvatar side={e.side} size={32} />
              <span className="rd-rank-body">
                <span className="rd-rank-name">{e.side.isMine && e.side.userIds.length === 1 ? 'Du' : e.side.label}</span>
                <span className="rd-rank-track"><span className="rd-rank-fill" style={{ width: `${(e.reps / max) * 100}%` }} /></span>
              </span>
              <span className="rd-rank-val"><CountUp value={e.reps} /></span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const [a, b] = entries;
  const we = a.side.userIds.length > 1;
  const lead = a.wins - b.wins;
  const line = total === 0 ? 'Noch nichts geloggt. Wer legt vor?'
    : lead > 0 ? `${we ? 'Ihr liegt' : 'Du liegst'} ${challengeCount(lead)} vorne.`
    : lead < 0 ? `${b.side.label} ${b.side.userIds.length > 1 ? 'liegen' : 'liegt'} ${challengeCount(-lead)} vorne.`
    : 'Gleichstand. Jetzt zählt jeder Satz.';
  const aShare = total ? Math.round((a.reps / total) * 100) : 50;
  return (
    <section className="rd-card rd-duel" aria-label="Duell diese Woche">
      <div className="rd-duel-head"><span>{title}</span><span>{meta}</span></div>
      <div className="rd-duel-main">
        {[a, null, b].map((e, i) => e ? (
          <div key={e.side.key} className="rd-duel-player">
            <SideAvatar side={e.side} size={we || e.side.userIds.length > 1 ? 48 : 64} />
            <span>{e.side.label}</span>
          </div>
        ) : (
          <div key="score" className="rd-duel-score">
            <div className="rd-duel-num"><CountUp value={a.wins} /> : <CountUp value={b.wins} /></div>
            <div className="rd-duel-cap">Challenges vorne</div>
          </div>
        ))}
      </div>
      <p className="rd-duel-line">{line}</p>
      <div className="rd-split" role="img" aria-label={`${a.side.label} ${a.reps} Reps, ${b.side.label} ${b.reps} Reps`}>
        <div className="rd-split-a" style={{ width: `${aShare}%`, ...sideStyle(a.side) }} />
        <div className="rd-split-b" style={sideStyle(b.side)} />
      </div>
      <div className="rd-split-legend">
        <span><CountUp value={a.reps} /> Reps</span>
        <span><CountUp value={b.reps} /> Reps</span>
      </div>
    </section>
  );
}

function HomeScreen({ api, me, sides = [], participantCount = 0, challenges = [], categories = [], allSets = [], layout,
  weekStart, nextWeekStart, nextWeekChallenges = [], nextWeekProposals = [],
  openClosures = [], onCloseWeek,
  onAddGoal, onEditChallenge, onLogChallenge, onQuickLog }) {
  const [timerRunning, setTimerRunning] = React.useState(() => {
    const v = localStorage.getItem('pt_work_timer_start');
    const parsed = v ? parseInt(v) : null;
    return Number.isFinite(parsed) && parsed > 0 && Date.now() - parsed < 86_400_000;
  });
  // Re-check on focus (user may have started/stopped timer elsewhere)
  React.useEffect(() => {
    const check = () => {
      const v = localStorage.getItem('pt_work_timer_start');
      const parsed = v ? parseInt(v) : null;
      setTimerRunning(Number.isFinite(parsed) && parsed > 0 && Date.now() - parsed < 86_400_000);
    };
    window.addEventListener('focus', check);
    window.addEventListener('pt:timer-changed', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('pt:timer-changed', check); };
  }, []);
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const tabChallenges = challenges.filter(ch => {
    const cat = catById[ch.category_id];
    return (cat?.kind || 'sports') === 'sports';
  });
  const celebration = useCelebration(challenges, allSets, me, categories);
  const focusRef = React.useRef(null);
  const [selectedId, setSelectedId] = React.useState(null);

  // Kennzahlen pro Wochenziel einmal berechnen; Liste, Fokus-Karte und Duell lesen daraus.
  const rows = React.useMemo(() => tabChallenges.map(ch => {
    const cat = catById[ch.category_id];
    const isWork = cat?.kind === 'work';
    const catType = cat?.challenge_type || 'standard';
    // Pflicht-Workout: jeder Eintrag ist ein Durchgang, Ziel ist einer pro Person.
    const isObligatory = PTData.isWorkoutType(catType);
    const val = (x) => isWork ? (x.duration_minutes ?? 0) : (x.reps ?? 0);
    const csets = allSets.filter(x => x.challenge_id === ch.id);
    const doneBySide = isObligatory
      ? sides.map(side => PTData.workoutPeopleDone(csets, side.statUserIds || side.userIds))
      : totalsBySide(csets, sides, val);
    const total = isObligatory
      ? doneBySide.reduce((a, x) => a + x, 0)
      : csets.reduce((a, x) => a + val(x), 0);
    const people = participantCount || sides.length || 1;
    // Fairer Anteil pro Person (Ziel / aktive Teilnehmer)
    const share = isObligatory ? 1 : PTData.fairShareOf(ch.target_reps, people);
    const goal = isObligatory ? people : ch.target_reps;
    const expectedByEod = Math.ceil(share * dayIndexInWeek(ch.week_start) / 7);
    const mine = csets.filter(x => x.athlete === me);
    const myDone = isObligatory ? mine.length : mine.reduce((a, x) => a + val(x), 0);
    const meFinished = myDone >= share;
    return {
      ch, cat, isWork, catType, isObligatory, total, goal, doneBySide, share,
      leader: isObligatory ? null : uniqueMaxIndex(doneBySide),
      myDone, meFinished,
      mySummary: isObligatory ? PTData.workoutSummary(catType, mine) : '',
      myTodayLeft: Math.max(0, expectedByEod - myDone),
      fmt: (v) => isWork ? formatDuration(v) : v,
    };
  }), [tabChallenges, allSets, me, sides, participantCount]);

  const orderedRows = React.useMemo(
    () => [...rows.filter(r => !r.meFinished), ...rows.filter(r => r.meFinished)],
    [rows]
  );
  const focus = rows.find(r => r.ch.id === selectedId)
    || orderedRows.find(r => r.isObligatory && !r.meFinished)
    || orderedRows[0];

  const duelEntries = React.useMemo(() => sides.map((side, i) => ({
    side,
    wins: rows.filter(r => r.leader === i).length,
    reps: rows.reduce((a, r) => a + (r.isWork || r.isObligatory ? 0 : r.doneBySide[i]), 0),
  })), [rows, sides]);

  // Tagesbalken: bei mehr als zwei Seiten „Du vs. Ø der anderen“
  const twoSided = sides.length === 2;
  const othersCount = Math.max(1, sides.length - 1);
  const week = React.useMemo(() => {
    const groups = twoSided || sides.length < 2
      ? sides.map(s => s.statUserIds || s.userIds)
      : [sides[0].statUserIds, sides.slice(1).flatMap(s => s.statUserIds)];
    const ids = new Set(tabChallenges.map(c => c.id));
    const ws = tabChallenges[0]?.week_start || weekStart;
    const days = dailyBreakdownFor(ws, allSets.filter(x => ids.has(x.challenge_id)), groups);
    if (!twoSided && sides.length > 2) for (const d of days) d.vals[1] = Math.round(d.vals[1] / othersCount);
    return days;
  }, [tabChallenges, allSets, weekStart, sides]);
  const weekSeries = twoSided || sides.length < 2
    ? sides.map(s => ({ key: s.key, label: s.isMine && s.userIds.length === 1 ? 'Du' : s.label, style: sideStyle(s) }))
    : [{ key: 'me', label: 'Du', style: sideStyle(sides[0]) }, { key: 'avg', label: 'Ø andere', style: { '--sc': 'var(--text-4)' } }];
  const weekMax = Math.max(1, ...week.flatMap(d => d.vals));
  const daysLeft = week.filter(d => d.isFuture).length;
  const finishedCount = rows.filter(r => r.meFinished).length;
  const nameOf = (id) => id === me ? 'dir' : PTPeople.firstNameOf(id);

  const pick = (id) => {
    setSelectedId(id);
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Rules of Hooks: this early return must come AFTER all hooks above.
  if (!tabChallenges.length) {
    return (
      <div className="rd-empty">
        <div className="rd-empty-title">Diese Woche ist noch offen</div>
        <div className="rd-empty-text">Legt euer erstes Wochenziel fest.</div>
        <button className="btn" onClick={onAddGoal}>Ziel anlegen</button>
      </div>
    );
  }

  const fPct = focus ? Math.min(1, focus.total / Math.max(1, focus.goal)) : 0;

  return (
    <>
      {timerRunning && (
        <button type="button" className="timer-banner" onClick={onAddGoal}>
          <span className="timer-banner-dot" />
          <span>Timer läuft · tippe zum Loggen</span>
        </button>
      )}

      {sides.length >= 2 && (
        <DuelCard entries={duelEntries}
          title={`KW ${weekNumber(tabChallenges[0].week_start)} · ${twoSided ? 'Duell' : 'Rangliste'}`}
          meta={daysLeft === 0 ? 'letzter Tag' : daysLeft === 1 ? 'noch 1 Tag' : `noch ${daysLeft} Tage`} />
      )}

      {focus && (
        <section ref={focusRef} className="rd-focus" aria-label={focus.isObligatory ? 'Pflicht-Challenge' : 'Wochenziel im Fokus'}>
          <div className="rd-focus-top">
            <div className="rd-focus-text">
              <div className="rd-overline">{focus.isObligatory ? 'Pflicht-Challenge' : 'Im Fokus'}</div>
              <h2 className="rd-focus-title">{focus.cat?.name}</h2>
              {focus.ch.chosen_by && <div className="rd-focus-sub">gewählt von {nameOf(focus.ch.chosen_by)}</div>}
            </div>
            <MiniRing pct={fPct} size={72} stroke={7} color="#fff" track="rgba(255,255,255,0.22)">
              {Math.round(fPct * 100)}%
            </MiniRing>
          </div>
          <div className="rd-focus-chips">
            <span className="rd-chip-glass">
              {focus.isObligatory
                ? `${focus.total} von ${focus.goal} erledigt`
                : <>{focus.fmt(focus.total)} / {focus.fmt(focus.ch.target_reps)}{focus.isWork ? '' : ' Reps'}</>}
            </span>
            <span className="rd-chip-glass">
              {focus.isObligatory ? (focus.meFinished ? `du: ${focus.mySummary}` : 'einmal diese Woche')
                : focus.meFinished ? 'dein Teil ist erledigt'
                : focus.myTodayLeft > 0 ? `heute noch ${focus.fmt(focus.myTodayLeft)}` : 'du bist auf Kurs'}
            </span>
            <button className="rd-icon-glass" aria-label={`${focus.cat?.name} bearbeiten`} onClick={() => onEditChallenge(focus.ch)}>
              <Icon name="edit" size={16} />
            </button>
          </div>
          {focus.isObligatory ? (
            <button className="rd-btn-white" onClick={() => onLogChallenge(focus.ch)}>
              <Icon name="play" size={18} />
              {focus.catType === 'tom_holland' ? 'Workout starten' : 'Bring Sally Up starten'}
            </button>
          ) : (
            <QuickLogRow me={me} catId={focus.ch.category_id}
              onQuick={(v) => onQuickLog?.(focus.ch, v)} onLog={() => onLogChallenge(focus.ch)} />
          )}
        </section>
      )}

      <section className="rd-section" aria-label="Deine Übungen">
        <div className="rd-section-head">
          <h2>Deine Übungen</h2>
          <span>{finishedCount} von {rows.length} erledigt</span>
        </div>
        <ul className="rd-card rd-list">
          {orderedRows.map(r => {
            const isFocus = focus && r.ch.id === focus.ch.id;
            const sub = r.isObligatory
              ? (r.meFinished ? `erledigt · ${r.mySummary}` : 'einmal diese Woche')
              : r.meFinished
                ? `${r.fmt(r.myDone)} von ${r.fmt(r.share)}`
                : `${r.fmt(r.myDone)} von ${r.fmt(r.share)} · ${r.myTodayLeft > 0 ? `heute noch ${r.fmt(r.myTodayLeft)}` : 'auf Kurs'}`;
            return (
              <li key={r.ch.id}>
                <button type="button" className={`rd-row${r.meFinished ? ' is-done' : ''}${isFocus ? ' is-focus' : ''}`}
                  aria-pressed={isFocus} onClick={() => pick(r.ch.id)}>
                  <span className="rd-tile">
                    <Icon name={r.isObligatory ? 'timer' : r.isWork ? 'laptop' : 'dumbbell'} size={20} />
                  </span>
                  <span className="rd-row-text">
                    <span className="rd-row-name">{r.cat?.name}</span>
                    <span className="rd-row-sub">{sub}</span>
                  </span>
                  {r.meFinished ? (
                    <span className="rd-check" aria-label="Erledigt"><Icon name="check" size={16} strokeWidth={3} /></span>
                  ) : (
                    <MiniRing pct={r.isObligatory ? 0 : r.myDone / r.share} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rd-section" aria-label="Diese Woche">
        <div className="rd-section-head">
          <h2>Diese Woche</h2>
          <span className="rd-legend">
            {weekSeries.map(s => <span key={s.key} style={s.style}><i />{s.label}</span>)}
          </span>
        </div>
        <div className="rd-card rd-week">
          {week.map((d, i) => (
            <div key={d.iso} className={`rd-week-day${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`}
              aria-label={d.isFuture ? `${d.label}: noch offen` : `${d.label}: ${weekSeries.map((s, j) => `${s.label} ${d.vals[j] ?? 0}`).join(', ')}`}>
              <div className="rd-week-bars">
                {weekSeries.map((s, j) => (
                  <div key={s.key} className="rd-bar"
                    style={{ ...s.style, height: d.isFuture || !d.vals[j] ? 4 : Math.max(6, (d.vals[j] / weekMax) * 88), animationDelay: `${i * 40}ms` }} />
                ))}
              </div>
              <div className="rd-week-label">{d.label}</div>
            </div>
          ))}
        </div>
      </section>

    {openClosures.length > 0 && openClosures.map(w => (
      <WeekCloseBanner key={w} weekStart={w} onClose={onCloseWeek}/>
    ))}
    {nextWeekStart && (() => {
      const items = nextWeekChallenges.length ? nextWeekChallenges : nextWeekProposals;
      if (!items.length) return null;
      const isConfirmed = nextWeekChallenges.length > 0;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const monday = new Date(nextWeekStart + 'T00:00:00');
      const daysUntil = Math.max(0, Math.round((monday - today) / 86400000));
      const whenLabel = daysUntil === 0 ? 'heute' : daysUntil === 1 ? 'morgen' : `in ${daysUntil} Tagen`;
      return (
        <section className="rd-section" aria-label="Nächste Woche">
          <div className="rd-section-head">
            <h2>Nächste Woche</h2>
            <span>KW {weekNumber(nextWeekStart)} · {whenLabel}{!isConfirmed && ' · Vorschau'}</span>
          </div>
          <ul className="rd-card rd-list">
            {items.map((ch, i) => {
              const cat = catById[ch.category_id];
              const ctype = cat?.challenge_type || 'standard';
              return (
                <li key={ch.id || `p-${i}`}>
                  <div className="rd-row is-static">
                    <span className="rd-tile">
                      <Icon name={ctype !== 'standard' ? 'timer' : cat?.kind === 'work' ? 'laptop' : 'dumbbell'} size={20} />
                    </span>
                    <span className="rd-row-text">
                      <span className="rd-row-name">{cat?.name}</span>
                      <span className="rd-row-sub">{isConfirmed && ch.chosen_by ? `gewählt von ${nameOf(ch.chosen_by)}` : 'noch offen'}</span>
                    </span>
                    <span className="rd-row-value">
                      {PTData.isWorkoutType(ctype) ? <>1×<small>pro Person</small></> : <>
                        {!isConfirmed && ch.bonus_max > 0
                          ? <>{ch.target_reps}–{ch.target_reps + ch.bonus_max}</>
                          : ch.target_reps}
                        <small>Reps</small>
                      </>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      );
    })()}
    {celebration.pendingCelebration && (
      <CelebrationOverlay
        category={celebration.pendingCelebration.category}
        targetReps={celebration.pendingCelebration.challenge.target_reps}
        onDone={celebration.dismissCurrent}
      />
    )}
    </>
  );
}

function SetupSheet({ api, me, categories, allowWork = true, weekStart, existing, onClose, onSaved, onDeleted, onAddCategory }) {
  const [catId, setCatId] = useState(existing?.category_id || categories[0]?.id || '');
  const [target, setTarget] = useState(existing?.target_reps || 100);
  const chosenBy = existing?.chosen_by || me;
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('💪');
  const [newCatKind, setNewCatKind] = useState('sports');
  const [editingCat, setEditingCat] = useState(null); // {id, name, emoji}
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedCat = categories.find(c => c.id === catId);
  const isWork = selectedCat?.kind === 'work';
  // For work challenges: target is in hours; stored value = hours * 60
  const [hoursTarget, setHoursTarget] = useState(
    existing?.target_reps ? (isWork ? existing.target_reps / 60 : null) : null
  );
  React.useEffect(() => {
    if (isWork && existing?.target_reps) {
      setHoursTarget(existing.target_reps / 60);
    }
  }, [isWork]);

  async function deleteChallenge() {
    if (!existing?.id) return;
    const cat = categories.find(c => c.id === existing.category_id);
    if (!confirm(`„${cat?.name || 'Challenge'}" wirklich aus dieser Woche entfernen? Bisher geloggte Sätze bleiben erhalten.`)) return;
    setDeleting(true);
    try {
      await api.deleteChallenge(existing.id);
      onDeleted?.();
    } catch (e) {
      alert(e.message || 'Fehler beim Löschen');
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!catId) return;
    setSaving(true);
    try {
      await api.upsertChallenge({
        ...(existing?.id ? { id: existing.id } : { week_start: weekStart }),
        category_id: catId,
        chosen_by: chosenBy,
        target_reps: isWork ? Math.round((hoursTarget || 1) * 60) : target,
      });
      onSaved();
    } catch (e) {
      alert(e.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  async function addNewCat() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.addCategory(newCatName.trim(), newCatEmoji, newCatKind);
      onAddCategory();
      setCatId(cat.id);
      setShowNewCat(false);
      setNewCatName('');
      setNewCatKind('sports');
      setNewCatEmoji('💪');
    } catch (e) {
      alert(e.message);
    }
  }

  async function saveEdit() {
    if (!editingCat?.name.trim()) return;
    try {
      await api.updateCategory(editingCat.id, { name: editingCat.name.trim(), emoji: editingCat.emoji });
      setEditingCat(null);
      onAddCategory();
    } catch (e) {alert(e.message);}
  }
  async function deleteEdit() {
    if (!editingCat) return;
    if (!confirm(`Kategorie „${editingCat.name}" wirklich löschen?`)) return;
    try {
      await api.deleteCategory(editingCat.id);
      if (catId === editingCat.id) setCatId(categories.find((c) => c.id !== editingCat.id)?.id || '');
      setEditingCat(null);
      onAddCategory();
    } catch (e) {alert(e.message);}
  }

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Wochen-Ziel festlegen</h2>
      <div className="subtitle" style={{ marginBottom: 18, fontSize: 15 }}>{formatWeek(weekStart)}</div>

      <div className="label" style={{ marginBottom: 8 }}>Kategorie</div>

      <div className="cat-grid">
        {(() => {
          const sports = categories.filter(c => (c.kind || 'sports') === 'sports');
          const work   = categories.filter(c => c.kind === 'work');
          return (
            <>
              {sports.map((c) => (
                <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
                  <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} onClick={() => setCatId(c.id)}>
                    <div className="emoji">{c.emoji}</div>
                    <div className="name">{c.name}</div>
                  </button>
                  {c.competition_id && (
                    <button className="cat-edit" aria-label="Bearbeiten"
                      onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                      ✎
                    </button>
                  )}
                </div>
              ))}
              {work.length > 0 && (
                <>
                  <div className="cat-grid-divider">💻 Work</div>
                  {work.map((c) => (
                    <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
                      <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} onClick={() => setCatId(c.id)}>
                        <div className="emoji">{c.emoji}</div>
                        <div className="name">{c.name}</div>
                      </button>
                      {c.competition_id && (
                        <button className="cat-edit" aria-label="Bearbeiten"
                          onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                          ✎
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
              <button className={`cat-card cat-card-add ${showNewCat ? 'open' : ''}`}
                onClick={() => {setShowNewCat((s) => !s);setEditingCat(null);}}>
                <div className="emoji">＋</div>
                <div className="name">Neue Kategorie</div>
              </button>
            </>
          );
        })()}
      </div>

      {editingCat &&
      <div className="new-cat-row">
          <input className="input new-cat-emoji"
        value={editingCat.emoji}
        onChange={(e) => setEditingCat({ ...editingCat, emoji: e.target.value })}
        maxLength={2} />
          <input className="input"
        value={editingCat.name} autoFocus
        onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
          <button className="new-cat-add new-cat-del" onClick={deleteEdit} aria-label="Löschen">🗑️</button>
          <button className="new-cat-add" onClick={saveEdit} aria-label="Speichern">✓</button>
        </div>
      }

      {showNewCat &&
        <div className="new-cat-row">
          <input className="input new-cat-emoji"
            value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} maxLength={2} />
          <input className="input" placeholder="Name (z.B. Dips)" autoFocus
            value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewCat()} />
          {allowWork && (
            <div className="segmented" style={{ flexShrink: 0 }}>
              <button className={newCatKind === 'sports' ? 'active' : ''} onClick={() => setNewCatKind('sports')}>🏋️</button>
              <button className={newCatKind === 'work'   ? 'active' : ''} onClick={() => setNewCatKind('work')}>💻</button>
            </div>
          )}
          <button className="new-cat-add" onClick={addNewCat} aria-label="Hinzufügen">✓</button>
        </div>
      }

      {isWork ? (
        <>
          <div className="label" style={{ marginBottom: 0 }}>Ziel-Stunden / Woche</div>
          <Stepper value={hoursTarget ?? 10} onChange={setHoursTarget} step={1} min={1} />
          <div className="chip-row" style={{ justifyContent: 'center' }}>
            {[5, 10, 20, 40].map((v) =>
              <button key={v} className="chip" onClick={() => setHoursTarget(v)}>{v}h</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="label" style={{ marginBottom: 0 }}>Ziel-Wiederholungen / Woche</div>
          <Stepper value={target} onChange={setTarget} step={target < 30 ? 1 : target < 100 ? 5 : 10} />
          <div className="chip-row" style={{ justifyContent: 'center' }}>
            {[15, 25, 40, 60, 80, 100].map((v) =>
              <button key={v} className="chip" onClick={() => setTarget(v)}>{v}</button>
            )}
          </div>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={saving || !catId}>
          {saving ? '…' : 'Speichern'}
        </button>
      </div>
      {existing?.id &&
        <button className="btn btn-danger-ghost" style={{ marginTop: 12 }} onClick={deleteChallenge} disabled={deleting}>
          {deleting ? '…' : '🗑️ Challenge aus dieser Woche entfernen'}
        </button>
      }
    </>);

}

// ─── LOG SHEET ──────────────────────────────────────────────────────────────
function LogSheet({ api, me, challenge, category, projectTags = [], toolTags = [], onClose, onLogged }) {
  const isWork = category?.kind === 'work';
  const [reps, setReps] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Work-mode state
  const TIMER_KEY = 'pt_work_timer_start';
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [projectTagId, setProjectTagId] = useState(null);
  const [toolTagId, setToolTagId] = useState(null);
  const [timerStart, setTimerStart] = React.useState(() => {
    const v = localStorage.getItem(TIMER_KEY);
    const parsed = v ? parseInt(v) : null;
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    if (Date.now() - parsed > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(TIMER_KEY);
      return null;
    }
    return parsed;
  });
  const [elapsedSec, setElapsedSec] = React.useState(0);

  React.useEffect(() => {
    if (!isWork || !timerStart) return;
    const iv = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isWork, timerStart]);

  function startTimer() {
    const now = Date.now();
    localStorage.setItem(TIMER_KEY, String(now));
    setTimerStart(now);
    setElapsedSec(0);
    setDurationMinutes(0);
    window.dispatchEvent(new Event('pt:timer-changed'));
  }
  function stopTimer() {
    const mins = Math.max(1, Math.floor((Date.now() - timerStart) / 60000));
    localStorage.removeItem(TIMER_KEY);
    setTimerStart(null);
    setElapsedSec(0);
    setDurationMinutes(mins);
    window.dispatchEvent(new Event('pt:timer-changed'));
  }

  function fmtElapsed(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  async function save() {
    if (isWork) {
      if (durationMinutes <= 0) return;
      setSaving(true);
      try {
        await api.addSet({
          challenge_id: challenge.id,
          athlete: me,
          reps: null,
          duration_minutes: durationMinutes,
          project_tag_id: projectTagId || null,
          tool_tag_id: toolTagId || null,
          note: note.trim() || null,
        });
        localStorage.removeItem(TIMER_KEY);
        window.dispatchEvent(new Event('pt:timer-changed'));
        setTimerStart(null);
        setElapsedSec(0);
        onLogged(durationMinutes, true);
      } catch (e) {
        alert(e.message || 'Fehler');
      } finally {
        setSaving(false);
      }
    } else {
      if (reps <= 0) return;
      setSaving(true);
      try {
        await api.addSet({
          challenge_id: challenge.id,
          athlete: me,
          reps: parseInt(reps),
          note: note.trim() || null,
        });
        onLogged(reps, false);
      } catch (e) {
        alert(e.message || 'Fehler');
      } finally {
        setSaving(false);
      }
    }
  }

  if (isWork) {
    return (
      <>
        <h2 className="title" style={{ marginBottom: 4 }}>Session loggen</h2>
        <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
          {category?.emoji} {category?.name} · {PTPeople.firstNameOf(me)}
        </div>

        {/* Timer */}
        <div className="work-timer-block">
          {timerStart ? (
            <>
              <div className="work-timer-display mono">{fmtElapsed(elapsedSec)}</div>
              <button className="btn btn-danger" onClick={stopTimer}>⏹ Stop</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startTimer}>▶ Timer starten</button>
          )}
        </div>

        {/* Manual duration input */}
        <div className="label" style={{ marginTop: 16, marginBottom: 0 }}>Minuten (manuell)</div>
        <Stepper value={durationMinutes} onChange={setDurationMinutes} step={15} min={0} />
        <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
          {[30, 60, 90, 120].map((v) =>
            <button key={v} className="chip" onClick={() => setDurationMinutes(v)}>{v}m</button>
          )}
        </div>

        {/* Project tag picker */}
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Projekt</div>
        {projectTags.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>Keine Projekte — in Einstellungen hinzufügen</div>
          : <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {projectTags.map(t =>
                <button key={t.id}
                  className={`chip ${projectTagId === t.id ? 'chip-active' : ''}`}
                  onClick={() => setProjectTagId(prev => prev === t.id ? null : t.id)}>
                  {t.emoji} {t.name}
                </button>
              )}
            </div>
        }

        {/* Tool tag picker */}
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Tool</div>
        {toolTags.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>Keine Tools — in Einstellungen hinzufügen</div>
          : <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {toolTags.map(t =>
                <button key={t.id}
                  className={`chip ${toolTagId === t.id ? 'chip-active' : ''}`}
                  onClick={() => setToolTagId(prev => prev === t.id ? null : t.id)}>
                  {t.emoji} {t.name}
                </button>
              )}
            </div>
        }

        <input
          className="input"
          placeholder="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: 16 }} />

        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" onClick={save}
            disabled={saving || durationMinutes <= 0 || !projectTagId || !toolTagId}>
            {saving ? '…' : `${durationMinutes}m loggen`}
          </button>
        </div>
      </>
    );
  }

  // Sports branch (original UI)
  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Satz loggen</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {category?.emoji} {category?.name} · {PTPeople.firstNameOf(me)}
      </div>
      <input
        className="input input-lg mono"
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()} />
      <div className="chip-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        {[5, 10, 15, 20, 25, 30].map((v) =>
          <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
        )}
      </div>
      <input
        className="input"
        placeholder="Notiz (optional, z.B. ‚saubere Form')"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 16 }} />
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={saving || reps <= 0}>
          {saving ? '…' : `+${reps} loggen`}
        </button>
      </div>
    </>
  );
}

// ─── WEEK FIX CARD ───────────────────────────────────────────────────────────
// Shown at the top of the home screen when no challenges exist yet this week.
// Renders all template slots with individually editable targets,
// then creates all challenges in one tap.
function WeekFixCard({ template, categories, me, onFix, onDismiss }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const [targets, setTargets] = React.useState(() =>
    Object.fromEntries(template.map(t => [t.category_id, t.base_reps]))
  );

  // Keep targets in sync if template changes (e.g. after load)
  React.useEffect(() => {
    setTargets(Object.fromEntries(template.map(t => [t.category_id, t.base_reps])));
  }, [template.map(t => t.category_id + t.base_reps).join(',')]);

  const OBLIGATORY_TYPES = new Set(['tom_holland', 'bring_sally_up']);

  function handleFix() {
    const picks = template.map(t => ({
      category_id: t.category_id,
      target_reps: Math.max(1, targets[t.category_id] || t.base_reps),
    }));
    onFix(picks);
  }

  return (
    <div className="weekfix-card">
      <div className="weekfix-header">
        <div className="weekfix-title">Woche starten</div>
        <div className="weekfix-sub">Targets anpassen & alle Challenges anlegen</div>
      </div>

      <div className="weekfix-slots">
        {template.map(t => {
          const cat = catById[t.category_id];
          if (!cat) return null;
          const isObligatory = OBLIGATORY_TYPES.has(cat.challenge_type);
          const val = targets[t.category_id] ?? t.base_reps;
          return (
            <div key={t.category_id} className="weekfix-row">
              <span className="weekfix-emoji">{cat.emoji}</span>
              <span className="weekfix-name">{cat.name}</span>
              {isObligatory ? (
                <span className="weekfix-pflicht">PFLICHT</span>
              ) : (
                <div className="weekfix-stepper">
                  <button className="weekfix-step-btn"
                    onClick={() => setTargets(p => ({ ...p, [t.category_id]: Math.max(1, (p[t.category_id] || t.base_reps) - 5) }))}>−</button>
                  <input
                    className="weekfix-input mono"
                    type="number"
                    inputMode="numeric"
                    value={val}
                    onChange={e => {
                      const n = parseInt(e.target.value);
                      if (Number.isFinite(n) && n > 0)
                        setTargets(p => ({ ...p, [t.category_id]: n }));
                    }}
                    onFocus={e => e.target.select()} />
                  <button className="weekfix-step-btn"
                    onClick={() => setTargets(p => ({ ...p, [t.category_id]: (p[t.category_id] || t.base_reps) + 5 }))}>＋</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onDismiss}>Später</button>
        <button className="btn" onClick={handleFix}>🏁 Woche starten</button>
      </div>
    </div>
  );
}

// ─── TOM HOLLAND WORKOUT ─────────────────────────────────────────────────────
// 20-min AMRAP timer + round counter. Logs reps=rounds, note=elapsed time.
const TH_TIMER_KEY   = 'pt_th_timer_start';
const TH_ROUNDS_KEY  = 'pt_th_rounds';
const TH_CHALL_KEY   = 'pt_th_challenge_id';
const TH_DURATION_MS = 20 * 60 * 1000; // 20 minutes

function TomHollandSheet({ api, me, challenge, allSets = [], onClose, onLogged }) {
  const [rounds, setRounds] = React.useState(() => {
    const saved = localStorage.getItem(TH_ROUNDS_KEY);
    const savedCh = localStorage.getItem(TH_CHALL_KEY);
    if (savedCh === challenge?.id) return parseInt(saved || '0') || 0;
    return 0;
  });
  const [timerStart, setTimerStart] = React.useState(() => {
    const v = localStorage.getItem(TH_TIMER_KEY);
    const savedCh = localStorage.getItem(TH_CHALL_KEY);
    const parsed = v ? parseInt(v) : null;
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    if (savedCh !== challenge?.id) return null;
    if (Date.now() - parsed > TH_DURATION_MS + 60000) { localStorage.removeItem(TH_TIMER_KEY); return null; }
    return parsed;
  });
  const [elapsed, setElapsed] = React.useState(() => timerStart ? Math.min(TH_DURATION_MS, Date.now() - timerStart) : 0);
  const [saving, setSaving] = React.useState(false);

  // Tick every second while timer is running
  React.useEffect(() => {
    if (!timerStart) return;
    const iv = setInterval(() => {
      const e = Date.now() - timerStart;
      if (e >= TH_DURATION_MS) { setElapsed(TH_DURATION_MS); clearInterval(iv); }
      else setElapsed(e);
    }, 500);
    return () => clearInterval(iv);
  }, [timerStart]);

  const timeUp = elapsed >= TH_DURATION_MS;
  const remaining = Math.max(0, TH_DURATION_MS - elapsed);
  const remMin  = Math.floor(remaining / 60000);
  const remSec  = Math.floor((remaining % 60000) / 1000);
  const countdownStr = `${String(remMin).padStart(2,'0')}:${String(remSec).padStart(2,'0')}`;

  // Elapsed string for logging note
  function elapsedStr() {
    const ms = timerStart ? Math.min(TH_DURATION_MS, Date.now() - timerStart) : elapsed;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function startTimer() {
    const now = Date.now();
    localStorage.setItem(TH_TIMER_KEY, String(now));
    localStorage.setItem(TH_CHALL_KEY, challenge.id);
    localStorage.setItem(TH_ROUNDS_KEY, '0');
    setTimerStart(now);
    setElapsed(0);
    setRounds(0);
  }

  function addRound() {
    const next = rounds + 1;
    setRounds(next);
    localStorage.setItem(TH_ROUNDS_KEY, String(next));
  }

  function cancelSession() {
    localStorage.removeItem(TH_TIMER_KEY);
    localStorage.removeItem(TH_ROUNDS_KEY);
    localStorage.removeItem(TH_CHALL_KEY);
    onClose();
  }

  async function saveSession() {
    if (rounds <= 0 && !timerStart) { onClose(); return; }
    setSaving(true);
    try {
      await api.addSet({
        challenge_id: challenge.id,
        athlete: me,
        reps: rounds,
        note: `Zeit: ${elapsedStr()}`,
      });
      localStorage.removeItem(TH_TIMER_KEY);
      localStorage.removeItem(TH_ROUNDS_KEY);
      localStorage.removeItem(TH_CHALL_KEY);
      onLogged(rounds);
    } catch (e) {
      alert(e.message || 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  const timerRunning = !!timerStart && !timeUp;
  const canSave = rounds > 0 || timeUp;

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Tom Holland Workout</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        🦸 5 Klimmzüge · 10 Liegestütze · 15 Squats · {PTPeople.firstNameOf(me)}
      </div>

      {/* Countdown display */}
      <div className={`th-countdown${timeUp ? ' time-up' : ''}`}>
        {countdownStr}
      </div>

      {/* Start timer button — only before first start */}
      {!timerStart && (
        <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 20 }} onClick={startTimer}>
          ▶ 20-Minuten-Timer starten
        </button>
      )}

      {/* Giant round counter button */}
      <div className="th-round-wrap">
        <button
          className="th-round-btn"
          onClick={addRound}
          disabled={!timerRunning && !timeUp}
          aria-label="Runde hinzufügen">
          <span className="th-round-count">{rounds}</span>
          <span className="th-round-label">Runden</span>
          <span className="th-round-plus">＋</span>
        </button>
      </div>

      {timeUp && (
        <div className="th-time-up-banner">⏰ Zeit ist um! Drücke + für jede fertige Runde.</div>
      )}

      {/* History: last weeks */}
      {(() => {
        // Use all sets that belong to the same category (tom_holland) for history,
        // by finding sets from other challenges with the same category_id.
        const catSets = allSets.filter(s => s.athlete === me && s.reps != null && typeof s.reps === 'number');
        const chSets  = catSets.filter(s => s.challenge_id === challenge?.id);
        if (chSets.length === 0) return null;
        const best = Math.max(...chSets.map(s => s.reps));
        return (
          <div className="th-history">
            <div className="th-history-label">Diese Woche bisher</div>
            <div className="th-history-best mono">{best} Rd. persönliches Best</div>
            <div className="th-history-sets">
              {chSets.slice(-5).reverse().map(s => (
                <div key={s.id} className="th-history-row">
                  <span className="mono">{s.reps} Rd.</span>
                  <span className="th-history-time">{s.note || ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={cancelSession}>Abbrechen</button>
        <button className="btn" onClick={saveSession} disabled={saving || !canSave}>
          {saving ? '…' : `${rounds} Runden loggen`}
        </button>
      </div>
    </>
  );
}

// ─── BRING SALLY UP ──────────────────────────────────────────────────────────
// Logs reps=100 for completed, or 1–99 for partial completion (percent).
// Song length: 3:24 = 204 seconds. reps stores seconds (1–204). 204 = completed.
const BSU_MAX_SEC = 204; // 3:24

function bsuFmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function BringSallySheet({ api, me, challenge, allSets = [], onClose, onLogged }) {
  const [sec, setSec] = React.useState(Math.round(BSU_MAX_SEC / 2)); // default ~1:42
  const [saving, setSaving] = React.useState(false);

  async function saveResult(value) {
    setSaving(true);
    try {
      await api.addSet({
        challenge_id: challenge.id,
        athlete: me,
        reps: value,
        note: value >= BSU_MAX_SEC ? null : `${bsuFmt(value)} von 3:24`,
      });
      onLogged(value);
    } catch (e) {
      alert(e.message || 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Bring Sally Up</h2>
      <div className="subtitle" style={{ marginBottom: 24, fontSize: 15 }}>
        🌸 Liegestütze zum Song · {PTPeople.firstNameOf(me)} · Max: 3:24
      </div>

      {/* Success button */}
      <button
        className="bsu-done-btn"
        onClick={() => saveResult(BSU_MAX_SEC)}
        disabled={saving}
        aria-label="Komplett geschafft">
        <span className="bsu-done-icon">✅</span>
        <span className="bsu-done-label">Geschafft! (3:24)</span>
      </button>

      {/* Partial progress */}
      <div className="bsu-partial">
        <div className="label" style={{ marginBottom: 12 }}>Nicht ganz... wie weit?</div>

        {/* Quick-chips: landmark times */}
        <div className="chip-row" style={{ justifyContent: 'center', marginBottom: 16 }}>
          {[{ l: '0:30', v: 30 }, { l: '1:00', v: 60 }, { l: '1:42', v: 102 }, { l: '2:33', v: 153 }].map(({ l, v }) =>
            <button key={v} className={`chip ${sec === v ? 'chip-active' : ''}`}
              onClick={() => setSec(v)}>{l}</button>
          )}
        </div>

        {/* Slider */}
        <input
          type="range"
          min="1" max={BSU_MAX_SEC - 1}
          value={sec}
          onChange={e => setSec(parseInt(e.target.value))}
          className="bsu-slider"
          aria-label="Zeitfortschritt" />
        <div className="bsu-slider-val mono">{bsuFmt(sec)}</div>

        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }}
          onClick={() => saveResult(sec)}
          disabled={saving}>
          {saving ? '…' : `${bsuFmt(sec)} loggen`}
        </button>
      </div>

      {/* History: previous attempts this week */}
      {(() => {
        const chSets = allSets.filter(s => s.challenge_id === challenge?.id && s.athlete === me && s.reps != null);
        if (chSets.length === 0) return null;
        const best = Math.max(...chSets.map(s => s.reps));
        return (
          <div className="bsu-history">
            <div className="bsu-history-label">Bisherige Versuche diese Woche</div>
            <div className="bsu-history-sets">
              {chSets.slice(-5).reverse().map(s => (
                <div key={s.id} className="bsu-history-row">
                  <span className={`mono ${s.reps >= BSU_MAX_SEC ? 'bsu-hist-done' : ''}`}>
                    {s.reps >= BSU_MAX_SEC ? '✅ 3:24' : bsuFmt(s.reps)}
                  </span>
                  {s.reps === best && chSets.length > 1 && <span className="bsu-hist-best">🏆 Best</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button className="btn-link" onClick={onClose}>Schließen</button>
      </div>
    </>
  );
}

// ─── FEED ────────────────────────────────────────────────────────────────────
function WeekRecap({ recap, me, sides = [] }) {
  const { week_start, challStats, totals = [], winnerIdx, sumAll, hitCount, totalChallenges, analysis,
    perSide = [], penCentsBySide = [], weekNumber } = recap;
  const isWorkWeek = challStats.length > 0 && challStats.every(c => c.cat?.kind === 'work');
  const unit = isWorkWeek ? 'min' : 'Reps';
  const fmtRecapVal = (v) => isWorkWeek ? formatDuration(v) : v;
  const formatEuroCents = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  const winner = winnerIdx != null ? sides[winnerIdx] : null;
  const twoSided = sides.length === 2;
  const order = sides.map((s, i) => i).sort((a, b) => (totals[b] || 0) - (totals[a] || 0));
  const recapTallySide = (side, isRight) => (
    <div className={`recap-tally-side ${side.cls}${isRight ? ' is-right' : ''} ${winnerIdx === side.index ? 'win' : ''}`} style={sideStyle(side)}>
      <div className="recap-tally-who">
        {isRight
          ? <>{side.label}<SideAvatar side={side} size={22} className="cell-avatar"/></>
          : <><SideAvatar side={side} size={22} className="cell-avatar"/>{side.label}</>}
      </div>
      <div className="recap-tally-v mono">{fmtRecapVal(totals[side.index] || 0)}</div>
    </div>
  );
  const monday = new Date(week_start + 'T00:00:00');
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmtD = (d) => `${d.getDate()}.${d.getMonth()+1}.`;
  const winnerCls = winner ? winner.cls : 'tie';
  // Confetti pieces (only when there's a winner)
  const confetti = winner ? Array.from({ length: 28 }, (_, i) => {
    const dx = (Math.random() * 240 - 120).toFixed(0);
    const delay = (Math.random() * 1.4).toFixed(2);
    const dur = (1.8 + Math.random() * 1.6).toFixed(2);
    const left = (Math.random() * 100).toFixed(0);
    const palette = ['var(--side0)', 'var(--side1)', 'var(--primary)', 'var(--player-3)', 'var(--player-7)'];
    const c = palette[i % palette.length];
    const rot = Math.floor(Math.random() * 720 + 360);
    return { dx, delay, dur, left, c, rot };
  }) : [];
  const anyPenalty = penCentsBySide.some(c => c > 0);
  return (
    <div className={`recap-card recap-${winnerCls}`} style={sideStyle(winner)}>
      {confetti.map((p, i) => (
        <span key={i} className="recap-confetti" style={{
          left: `${p.left}%`,
          background: p.c,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
          '--dx': `${p.dx}px`,
          '--rot': `${p.rot}deg`,
        }}/>
      ))}
      <div className="recap-head">
        <div className="recap-head-left">
          <div className="recap-label">🏁 Wochenabschluss</div>
          {weekNumber != null && <div className="recap-week-num">Woche {weekNumber}</div>}
        </div>
        <div className="recap-date">{fmtD(monday)} – {fmtD(sunday)}</div>
      </div>
      <div className="recap-winner">
        {winner ? (
          <>
            <div className="recap-winner-avatar-wrap">
              <SideAvatar side={winner} size={64} className="recap-winner-avatar"/>
              <span className="recap-winner-crown">👑</span>
            </div>
            <div className={`recap-winner-name ${winnerCls}`} style={sideStyle(winner)}>{winner.label}</div>
            <div className="recap-winner-sub">{winner.userIds.length > 1 ? 'gewinnen die Woche' : 'gewinnt die Woche'}</div>
          </>
        ) : (
          <>
            <div className="recap-trophy">🤝</div>
            <div className="recap-winner-name tie">Unentschieden</div>
            <div className="recap-winner-sub">{fmtRecapVal(sumAll)} {unit} · gleichauf an der Spitze</div>
          </>
        )}
      </div>
      {twoSided ? (
        <div className="recap-tally">
          {recapTallySide(sides[0], false)}
          <div className="recap-tally-vs">vs</div>
          {recapTallySide(sides[1], true)}
        </div>
      ) : (
        <div className="mu-recap-podium">
          {order.map((i, rank) => (
            <div key={sides[i].key} className={`mu-recap-podium-row ${winnerIdx === i ? 'win' : ''}`} style={sideStyle(sides[i])}>
              <span className="mono mu-rank-pos">{rank + 1}</span>
              <SideAvatar side={sides[i]} size={22} />
              <span className="mu-rank-name">{sides[i].label}</span>
              <span className="mono mu-recap-podium-v" style={{ color: sides[i].color }}>{fmtRecapVal(totals[i] || 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="recap-challs">
        {challStats.map((c, i) => (
          <div className="recap-chall" key={i}>
            <span className="recap-chall-emoji">{c.cat?.emoji}</span>
            <span className="recap-chall-name">{c.cat?.name || '—'}</span>
            <span className="recap-chall-tally mono">
              {c.workout ? (twoSided ? <>
                <span style={{color:'var(--side0-ink)'}}>{c.countBySide[0]}×</span>
                {' · '}
                <span style={{color:'var(--side1-ink)'}}>{c.countBySide[1]}×</span>
              </> : <span>{c.countBySide.reduce((a, x) => a + x, 0)}×</span>) : <>
                {twoSided ? <>
                  <span style={{color:'var(--side0-ink)'}}>{fmtRecapVal(c.doneBySide[0])}</span>
                  {' · '}
                  <span style={{color:'var(--side1-ink)'}}>{fmtRecapVal(c.doneBySide[1])}</span>
                </> : <span>{fmtRecapVal(c.total)}</span>}
                {' / '}{fmtRecapVal(c.ch.target_reps)}
              </>}
            </span>
            <span className={`recap-chall-badge ${c.hit?'hit':'miss'}`}>{c.hit?'✓':(c.hitBySide.some(Boolean)?'½':'🚧')}</span>
          </div>
        ))}
      </div>
      <div className="recap-athlete-stats">
        {sides.map((side, i) => {
          const ps = perSide[i] || { byCat: [], setCount: 0, maxSet: 0 };
          return (
            <div className="recap-athlete-line" key={side.key}>
              <SideAvatar side={side} size={22} className="recap-athlete-mini-avatar"/>
              <div className="recap-athlete-stats-text">
                <div>
                  {ps.byCat.length === 0 ? '— keine Reps —' : ps.byCat.map((x, j) => (
                    <span key={j}>{j > 0 && ' · '}<span className="mono">{x.reps}</span> {x.name}</span>
                  ))}
                </div>
                {ps.setCount > 0 && (
                  <div className="recap-athlete-meta">
                    in <span className="mono">{ps.setCount}</span> {ps.setCount === 1 ? 'Satz' : 'Sätzen'} · größter <span className="mono">+{ps.maxSet}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="recap-analysis">{analysis}</div>
      {anyPenalty && (
        <div className="recap-penalties">
          <div className="recap-penalties-label">Neue Schulden</div>
          <div className="recap-penalties-row mu-wrap">
            {sides.map((side, i) => (
              <span key={side.key} className={`${i === 0 ? 'b' : 'j'} ${penCentsBySide[i] > 0 ? 'has' : ''}`}>
                {side.label} {penCentsBySide[i] > 0 ? `–${formatEuroCents(penCentsBySide[i])}` : '✓'}
              </span>
            ))}
          </div>
        </div>
      )}
      {totalChallenges > 0 && (
        <div className="recap-foot">
          {hitCount} von {totalChallenges} Ziel{totalChallenges===1?'':'en'} erreicht
        </div>
      )}
    </div>
  );
}

function EmojiPickerSheet({ onPick, onClose }) {
  const [val, setVal] = useState('');
  const submit = () => {
    const e = val.trim();
    if (!e) return;
    onPick?.(e);
  };
  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Reaktion hinzufügen</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        Tippe einen Emoji ein (iOS-Tastatur 🌐 → Emoji)
      </div>
      <input
        className="input input-lg"
        type="text"
        value={val}
        autoFocus
        placeholder="z. B. 🔥"
        style={{ textAlign: 'center', fontSize: 32 }}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={submit} disabled={!val.trim()}>Hinzufügen</button>
      </div>
    </>
  );
}

// ─── Verlauf im Vollbild (Stats-Tab) ─────────────────────────────────────────
// series: [{ key, label, color, data: [{date: 'YYYY-MM-DD', reps: number}] }] — alle gleich lang
// Shared between FullscreenChart and ChartFullscreen's scrubber math.
// Changing this value updates both the rendered chart and the touch-to-data-index mapping.
const FULLSCREEN_PAD_X = 44;

function FullscreenChart({ series, days, activeIdx, vw, vh }) {
  // Viewport-driven sizing. vw/vh are the body container's pixel size.
  const W = Math.max(300, vw);
  const H = Math.max(200, vh);
  const PAD_X = FULLSCREEN_PAD_X;
  const PAD_Y = 32;
  const axis = series[0]?.data || [];
  const maxV = Math.max(1, ...series.flatMap(s => s.data.map(d => d.reps)));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // X labels — more of them than the inline chart (we have space)
  const labelCount = days <= 7 ? days : days <= 30 ? 7 : 9;
  const labelIdx = days <= 7
    ? axis.map((_, i) => i)
    : Array.from({ length: labelCount }, (_, k) => Math.round((k * (days - 1)) / (labelCount - 1)));
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth() + 1}`; };

  // Y labels — 5 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxV));

  // Week boundaries — Mondays within the range
  const allWeekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) allWeekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  // Bei langen Zeiträumen nur jede n-te Woche beschriften
  const weekStep = Math.max(1, Math.ceil(allWeekMarks.length / 12));
  const weekMarks = allWeekMarks.filter((_, k) => k % weekStep === 0);
  const showArea = series.length <= 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`grad-fs-s${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.35"/>
            <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
          </linearGradient>
        ))}
      </defs>
      {gridLines.map((y, i) => <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
      {weekMarks.map(({idx, kw}) => (
        <g key={`wk${idx}`}>
          <line className="chart-week-line" x1={xPos(idx)} x2={xPos(idx)} y1={PAD_Y * 0.7} y2={H - PAD_Y}/>
          <text x={xPos(idx)} y={PAD_Y * 0.6} fill="var(--text-2)" fontSize="10" textAnchor="middle" opacity="0.8">KW {kw}</text>
        </g>
      ))}
      {showArea && series.map((s, i) => <path key={`a${s.key}`} d={areaFor(s.data)} fill={`url(#grad-fs-s${i})`}/>)}
      {series.map(s => (
        <path key={`l${s.key}`} d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      ))}
      {labelIdx.map(i => axis[i] && (
        <text key={`x${i}`} x={xPos(i)} y={H - 8} fill="var(--text-2)" fontSize="11" textAnchor="middle">{fmt(axis[i].date)}</text>
      ))}
      {yTicks.map((v, i) => (
        <text key={`y${i}`} x={PAD_X - 8} y={yScale(v) + 4} fill="var(--text-2)" fontSize="11" textAnchor="end">{v}</text>
      ))}
      {activeIdx !== null && activeIdx >= 0 && activeIdx < axis.length && (
        <g>
          <line
            className="chart-scrubber-line"
            x1={xPos(activeIdx)} x2={xPos(activeIdx)}
            y1={PAD_Y * 0.5} y2={H - PAD_Y * 0.6}
          />
          {series.map(s => (
            <circle key={s.key}
              className="chart-scrubber-dot"
              cx={xPos(activeIdx)} cy={yScale(s.data[activeIdx].reps)}
              r="5" fill={s.color}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

function ChartFullscreen({
  title, series, cumSeries, totalDays,
  range, setRange,
  cumulative, setCumulative,
  onClose,
}) {
  const [activeIdx, setActiveIdx] = useState(null);
  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });
  const bodyRef = React.useRef(null);

  // Body scroll lock while fullscreen is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Measure the body container; ResizeObserver handles window/orientation changes
  // automatically because .chart-fs is position:fixed inset:0 and the body is flex:1.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () => setBodySize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset scrubber when range changes (series length changes -> activeIdx may be out of bounds).
  useEffect(() => { setActiveIdx(null); }, [totalDays]);

  // Resolve which series to render based on cumulative flag.
  const shown = cumulative ? cumSeries : series;
  const axis = shown[0]?.data || [];

  // Scrubber pointer handlers.
  const handlePointer = (e) => {
    const el = bodyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const innerW = rect.width - FULLSCREEN_PAD_X * 2;
    if (innerW <= 0) return;
    const xLocal = e.clientX - rect.left - FULLSCREEN_PAD_X;
    const ratio = Math.max(0, Math.min(1, xLocal / innerW));
    const idx = Math.round(ratio * (totalDays - 1));
    setActiveIdx(Math.max(0, Math.min(totalDays - 1, idx)));
  };

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  };


  return (
    <div className="chart-fs">
      <div className="chart-fs-top">
        <button className="chart-fs-close" onClick={onClose} aria-label="Schließen">✕</button>
        <div className="chart-fs-title">{title}</div>
        <div className="chart-fs-controls">
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
            <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
            <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
          </div>
          <div className="segmented segmented-sm">
            <button className={cumulative?'active':''} onClick={()=>setCumulative(true)} aria-label="Kumuliert">Σ</button>
            <button className={!cumulative?'active':''} onClick={()=>setCumulative(false)} aria-label="Pro Tag">Tag</button>
          </div>
        </div>
      </div>

      <div
        className="chart-fs-body"
        ref={bodyRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={(e) => { if (e.buttons) handlePointer(e); }}
      >
        <FullscreenChart
          series={shown}
          days={totalDays}
          activeIdx={activeIdx}
          vw={bodySize.w}
          vh={bodySize.h}
        />
      </div>

      <div className="chart-fs-bottom">
        {activeIdx === null ? (
          <div className="chart-fs-hint">Tippe in das Diagramm für Tageswerte</div>
        ) : (
          <div className="chart-fs-values">
            <span className="chart-fs-date">{fmtDate(axis[activeIdx].date)}</span>
            {shown.map(s => (
              <span key={s.key} className="chart-fs-val side-n" style={{ '--sc': s.color }}>{s.label}: <b>{s.data[activeIdx].reps}</b></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackfillSheet({ api, me, challenges = [], categories = [], projectTags = [], toolTags = [], onClose, onSaved }) {
  const today = new Date();
  const monday = PTData.mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const todayIso = localDateOf(today);
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));

  const [dateIso, setDateIso] = React.useState(todayIso);
  const [challengeId, setChallengeId] = React.useState(challenges[0]?.id || '');
  const [reps, setReps] = React.useState(10);
  const [saving, setSaving] = React.useState(false);
  const [durationMinutes, setDurationMinutes] = React.useState(60);
  const [projectTagId, setProjectTagId] = React.useState(null);
  const [toolTagId, setToolTagId] = React.useState(null);

  const selectedChallenge = challenges.find(c => c.id === challengeId);
  const selectedCat = catById[selectedChallenge?.category_id];
  const isWork = selectedCat?.kind === 'work';

  async function save() {
    if (!challengeId) return;
    if (isWork ? durationMinutes <= 0 : reps <= 0) return;
    setSaving(true);
    try {
      const [y, m, d] = dateIso.split('-').map(Number);
      // Pick midday of the chosen date so it sorts predictably relative to
      // any other entries that day without leaking real-time-of-day info.
      const created = new Date(y, m - 1, d, 12, 0, 0);
      const payload = isWork
        ? {
            challenge_id: challengeId,
            athlete: me,
            reps: null,
            duration_minutes: durationMinutes,
            project_tag_id: projectTagId || null,
            tool_tag_id: toolTagId || null,
            note: null,
            created_at: created.toISOString(),
          }
        : {
            challenge_id: challengeId,
            athlete: me,
            reps: parseInt(reps),
            note: null,
            created_at: created.toISOString(),
          };
      await api.addSet(payload);
      onSaved?.(isWork ? durationMinutes : reps, isWork);
    } catch (e) {
      alert(e.message || 'Fehler');
    } finally {
      setSaving(false);
    }
  }

  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Nachtrag</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        Satz für diese Woche nachtragen
      </div>

      <div className="label" style={{ marginBottom: 8 }}>Tag</div>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {days.map((d, i) => {
          const iso = localDateOf(d);
          const disabled = iso > todayIso;
          const selected = iso === dateIso;
          return (
            <button
              key={iso}
              className="chip"
              disabled={disabled}
              onClick={() => setDateIso(iso)}
              style={{
                opacity: disabled ? 0.25 : 1,
                background: selected ? 'var(--accent)' : undefined,
                color: selected ? '#000' : undefined,
              }}>
              {dayLabels[i]} {d.getDate()}.
            </button>
          );
        })}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>Challenge</div>
      {challenges.length === 0 ? (
        <div className="subtitle" style={{ marginBottom: 16 }}>Keine Challenges diese Woche</div>
      ) : (
        <div className="chip-row" style={{ marginBottom: 16 }}>
          {challenges.map(ch => {
            const cat = catById[ch.category_id];
            const selected = ch.id === challengeId;
            return (
              <button
                key={ch.id}
                className="chip"
                onClick={() => setChallengeId(ch.id)}
                style={{
                  background: selected ? 'var(--accent)' : undefined,
                  color: selected ? '#000' : undefined,
                }}>
                {cat?.name || '—'}
              </button>
            );
          })}
        </div>
      )}

      {isWork ? (
        <>
          <div className="label" style={{ marginBottom: 0 }}>Minuten</div>
          <Stepper value={durationMinutes} onChange={setDurationMinutes} step={15} min={15} />
          <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            {[30, 60, 90, 120].map(v =>
              <button key={v} className="chip" onClick={() => setDurationMinutes(v)}>{v}m</button>
            )}
          </div>
          <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Projekt</div>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {projectTags.map(t =>
              <button key={t.id}
                className={`chip ${projectTagId === t.id ? 'chip-active' : ''}`}
                onClick={() => setProjectTagId(prev => prev === t.id ? null : t.id)}>
                {t.emoji} {t.name}
              </button>
            )}
          </div>
          <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Tool</div>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {toolTags.map(t =>
              <button key={t.id}
                className={`chip ${toolTagId === t.id ? 'chip-active' : ''}`}
                onClick={() => setToolTagId(prev => prev === t.id ? null : t.id)}>
                {t.emoji} {t.name}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="label" style={{ marginBottom: 8 }}>Reps</div>
          <input
            className="input input-lg mono"
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.target.select()} />

          <div className="chip-row" style={{ justifyContent: 'center', marginTop: 12 }}>
            {[5, 10, 15, 20, 25, 30].map((v) =>
              <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
            )}
          </div>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save}
          disabled={saving || !challengeId || (isWork ? durationMinutes <= 0 : reps <= 0)}>
          {saving ? '…' : isWork ? `+${durationMinutes}min nachtragen` : `+${reps} nachtragen`}
        </button>
      </div>
    </>
  );
}

Object.assign(window, { HomeScreen, SetupSheet, LogSheet, WeekRecap, bsuFmt, BSU_MAX_SEC, BackfillSheet, FullscreenChart, ChartFullscreen, EmojiPickerSheet, WeekFixCard, TomHollandSheet, BringSallySheet });