/* global React, Ring, Icon, Sheet, Stepper, Toast, formatRelative, formatWeek, weekNumber, todayGreeting, formatDuration, PTPeople, Avatar, SideAvatar, sideStyle, totalsBySide, uniqueMaxIndex, sideIndexByUser */
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
    .reduce((sum, s) => sum + (s.reps ?? s.duration_minutes ?? 0), 0);
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
    if (bucket && !bucket.isFuture && g != null) bucket.vals[g] += (s.reps ?? s.duration_minutes ?? 0);
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
  const scrollerRef = React.useRef(null);
  const [activeIdx, setActiveIdx] = React.useState(0);
  React.useEffect(() => {
    const el = scrollerRef.current; if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth; if (!w) return;
      setActiveIdx(Math.round(el.scrollLeft / w));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [tabChallenges.length]);
  const goTo = (i) => {
    const el = scrollerRef.current; if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  // Pro Challenge die Summe aller geloggten Reps einmal ermitteln,
  // dann erfüllte (total >= target_reps) ans Ende sortieren.
  // Gleiche Quelle für Swiper UND Overview, kein Mehrfach-Filter.
  const { sortedChallenges, totalsByChallenge } = React.useMemo(() => {
    const catKind = Object.fromEntries(tabChallenges.map(c => [c.id, catById[c.category_id]?.kind || 'sports']));
    const totals = new Map(tabChallenges.map(c => [c.id, 0]));
    for (const s of allSets) {
      if (totals.has(s.challenge_id)) {
        const v = catKind[s.challenge_id] === 'work' ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
        totals.set(s.challenge_id, totals.get(s.challenge_id) + v);
      }
    }
    const open = [], done = [];
    for (const ch of tabChallenges) {
      if ((totals.get(ch.id) ?? 0) >= ch.target_reps) done.push(ch); else open.push(ch);
    }
    return { sortedChallenges: [...open, ...done], totalsByChallenge: totals };
  }, [tabChallenges, allSets]);

  // Rules of Hooks: this early return must come AFTER all hooks above.
  if (!tabChallenges.length) {
    return (
      <div className="empty">
        <div className="emoji">🏁</div>
        <div className="title">Diese Woche ist offen</div>
        <div style={{marginBottom: 24}}>Legt euer erstes Wochenziel fest.</div>
        <button className="btn" onClick={onAddGoal}>Ziel anlegen</button>
      </div>
    );
  }

  const twoSided = sides.length === 2;
  // Tagesbalken: bei mehr als zwei Seiten „Du vs. Ø der anderen“
  const breakdownGroups = twoSided || sides.length < 2
    ? sides.map(s => s.statUserIds || s.userIds)
    : [sides[0].statUserIds, sides.slice(1).flatMap(s => s.statUserIds)];
  const breakdownLabels = twoSided
    ? sides.map(s => s.isMine ? 'Du' : s.label)
    : sides.length < 2 ? ['Du'] : ['Du', 'Ø andere'];
  const othersCount = Math.max(1, sides.length - 1);

  return (
    <>
      {timerRunning && (
        <div className="timer-banner" onClick={onAddGoal}>
          <span className="timer-banner-dot" />
          <span>⏱️ Timer läuft · tippe zum Loggen</span>
        </div>
      )}
    <div className={`layout-${layout} home-swiper-wrap`}>
      {sortedChallenges.length >= 2 && (
        <div className="challenge-overview">
          {sortedChallenges.map((ch, i) => {
            const cat = catById[ch.category_id];
            const total = totalsByChallenge.get(ch.id) ?? 0;
            const done = total >= ch.target_reps;
            const pct = Math.min(1, total / ch.target_reps);
            const pctInt = Math.round(pct * 100);
            return (
              <button
                key={ch.id}
                type="button"
                className={`co-row ${done ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Zu ${cat?.name} springen, ${done ? 'erfüllt' : pctInt + ' Prozent'}`}>
                <span className="co-name">{cat?.name}</span>
                <span className="co-bar"><span className="co-bar-fill" style={{width: `${pct*100}%`}}/></span>
                <span className="co-val mono">{done ? '✓' : `${pctInt}%`}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="challenge-swiper" ref={scrollerRef}>
      {sortedChallenges.map(ch => {
        const cat = catById[ch.category_id];
        const csets = allSets.filter(s => s.challenge_id === ch.id);
        const total = totalsByChallenge.get(ch.id) ?? 0;
        const isWorkCh = cat?.kind === 'work';
        const sumVal = (s) => isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
        const doneBySide = totalsBySide(csets, sides, sumVal);
        const fmtVal = (v) => isWorkCh ? formatDuration(v) : v;
        const pct = Math.min(1, total / ch.target_reps);
        const pctInt = Math.round(pct * 100);
        const remaining = Math.max(0, ch.target_reps - total);
        // Fairer Anteil pro Person; ein Team schuldet die Summe seiner Mitglieder.
        const personShare = PTData.fairShareOf(ch.target_reps, participantCount || sides.length || 1);
        const sideShares = sides.map(s => personShare * Math.max(1, s.userIds.length));
        const todayStr = localDateOf(new Date());
        const dayIdx = dayIndexInWeek(ch.week_start);

        const stats = sides.map((side, i) => {
          const share = sideShares[i];
          return {
            done: doneBySide[i],
            today: repsOnLocalDate(csets, side.statUserIds || side.userIds, todayStr),
            trackDelta: doneBySide[i] - Math.ceil(share * dayIdx / 7),
            dailyTarget: Math.ceil(share / 7),
            share,
          };
        });
        const widths = sides.map((_, i) => Math.min(100, (doneBySide[i] / ch.target_reps) * 100));
        const chDailyBreakdown = dailyBreakdownFor(ch.week_start, csets, breakdownGroups);
        // Vergleichsseiten für Zellen/Trophäe: ich + stärkste andere Seite
        const bestOther = sides.length > 1
          ? sides.slice(1).reduce((b, s) => (doneBySide[s.index] > doneBySide[b.index] ? s : b), sides[1])
          : null;
        const compareSides = [sides[0], bestOther].filter(Boolean);

        const sideName = (side) => side.isMine && side.userIds.length === 1 ? 'Du' : side.label;
        const tugSide = (side, isRight) => {
          const s = stats[side.index];
          return (
            <div className={`tug-side ${side.cls}${isRight ? ' is-right' : ''}`} style={sideStyle(side)}>
              <div className="tug-who">
                {isRight
                  ? <>{side.label}<SideAvatar side={side} size={28} className="tug-avatar"/></>
                  : <><SideAvatar side={side} size={28} className="tug-avatar"/>{side.label}</>}
              </div>
              <div className="tug-reps mono">{fmtVal(s.done)}</div>
              <DailyStatus variant="tug" done={s.done} fairShare={s.share}
                dailyTarget={s.dailyTarget} todayReps={s.today} trackDelta={s.trackDelta}/>
            </div>
          );
        };
        const splitCell = (side) => {
          const s = stats[side.index];
          return (
            <div className={`split-cell ${side.cls}`} style={sideStyle(side)} key={side.key}>
              <div className="who"><SideAvatar side={side} size={22} className="cell-avatar"/>{sideName(side)}</div>
              <div className="v mono">{fmtVal(s.done)}<span className="owe-of"> / {fmtVal(s.share)}</span></div>
              <DailyStatus variant="cell" done={s.done} fairShare={s.share}
                dailyTarget={s.dailyTarget} todayReps={s.today} trackDelta={s.trackDelta}/>
            </div>
          );
        };
        const catType = cat?.challenge_type || 'standard';
        const isObligatory = catType === 'tom_holland' || catType === 'bring_sally_up';
        // Check if athlete already logged this challenge this week
        const thisWeekStr = ch.week_start;
        const myDoneThisWeek = csets.filter(s => s.athlete === me && s.created_at && localDateOf(s.created_at) >= thisWeekStr).length > 0;
        const leadCls = twoSided
          ? (doneBySide[0] > doneBySide[1] ? ' lead-side-0' : doneBySide[1] > doneBySide[0] ? ' lead-side-1' : '')
          : '';

        return (
          <div key={ch.id} className="challenge-slide"><div className={`hero-card ${isObligatory ? 'hero-card--obligatory' : ''} ${celebration.getPersistentStyle(ch) ? 'pm-' + celebration.getPersistentStyle(ch) : ''}`}>
            <SparkleLayer active={celebration.getPersistentStyle(ch) === 'sparkle'} />
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.03em'}}>
                  <span style={{marginRight:8}}>{cat?.emoji}</span>{cat?.name}
                  {isObligatory && (
                    <span className={`obligatory-badge${myDoneThisWeek ? ' done' : ''}`}>
                      {myDoneThisWeek ? '✓ diese Woche' : 'Pflicht'}
                    </span>
                  )}
                </div>
                {ch.chosen_by && (
                  <div className="subtitle" style={{marginTop:2,fontSize:13,fontWeight:500}}>
                    Gewählt von {ch.chosen_by === me ? 'dir' : PTPeople.firstNameOf(ch.chosen_by)}
                  </div>
                )}
              </div>
              <button className="icon-btn" aria-label="Bearbeiten" onClick={() => onEditChallenge(ch)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            </div>
            {celebration.getPersistentStyle(ch) === 'trophy' ? (
              <div className="pm-trophy-hero">
                <div className="pm-trophy-icon">🏆</div>
                <div className="pm-trophy-title">ZIEL ERREICHT</div>
                <div className="pm-trophy-sub">{cat?.emoji} {cat?.name} • Diese Woche</div>
                <div className="pm-trophy-stats">
                  <div>
                    <div className="pm-trophy-stat-v">{isWorkCh ? formatDuration(total) : total.toLocaleString('de-DE')}</div>
                    <div className="pm-trophy-stat-l">{isWorkCh ? 'Zeit' : 'Reps'}</div>
                  </div>
                  {compareSides.map(side => (
                    <div key={side.key}>
                      <div className="pm-trophy-stat-v">{fmtVal(stats[side.index].done)}</div>
                      <div className="pm-trophy-stat-l">{sideName(side)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (<>
              {layout==='rings' && twoSided && (
                <div className={`tug-section${leadCls}`}>
                  <div className="tug-labels">
                    {tugSide(sides[0], false)}
                    <div className="tug-side team">
                      <div className="tug-who">Gesamt</div>
                      <div className="tug-reps mono">{fmtVal(total)}</div>
                      <div className={`tug-foot mono ${remaining===0?'done':''}`}>{remaining===0?'✓ erledigt':`noch ${fmtVal(remaining)}`}</div>
                    </div>
                    {tugSide(sides[1], true)}
                  </div>
                  {(() => {
                    let lW = widths[0];
                    let rW = widths[1];
                    if (lW + rW > 100) { const s = 100 / (lW + rW); lW *= s; rW *= s; }
                    return (
                      <>
                        <div className="tug-bar opposing">
                          <div className="tug-fill side-0" style={{width:`${lW}%`}}/>
                          <div className="tug-fill side-1 from-right" style={{width:`${rW}%`}}/>
                        </div>
                        <div className="tug-summary mono">
                          {remaining===0 ? (
                            <span className="tug-summary-done">🎉 Gesamtziel erreicht!</span>
                          ) : (
                            <>Wochenziel <span className="tug-summary-target">{fmtVal(ch.target_reps)}</span></>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              {layout==='rings' && !twoSided && (
                <RankList sides={sides} stats={stats} target={ch.target_reps} sideShares={sideShares}
                  fmtVal={fmtVal} total={total} remaining={remaining} />
              )}
              {layout==='bar' && <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:12}}>
                  <div className="display mono" style={{fontSize:44,lineHeight:1}}>{pctInt}%</div>
                  <div className="subtitle mono">{fmtVal(total)} / {fmtVal(ch.target_reps)}</div></div>
                <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${pct*100}%`}}/></div>
                <div className="subtitle" style={{fontSize:13,fontWeight:500}}>{remaining>0?`Noch ${fmtVal(remaining)} ${isWorkCh?'':'Reps'}`:'🎉 Ziel erreicht!'}</div></>}
              {layout==='numeric' && <div style={{textAlign:'center',marginTop:12}}>
                <div className="big-number mono" style={{fontSize:72}}>{pctInt}%</div>
                <div className="of mono">{fmtVal(total)} / {fmtVal(ch.target_reps)} {isWorkCh?'':'Reps'}</div>
                <div style={{marginTop:8,fontSize:13,color:'var(--text-2)'}}>{remaining>0?`Noch ${fmtVal(remaining)}`:'🎉 Ziel erreicht'}</div></div>}
              {layout!=='rings' && <div className="split-row">
                {compareSides.map(splitCell)}
              </div>}
            </>)}
            {catType === 'tom_holland' || catType === 'bring_sally_up' ? (
              <div style={{ marginTop: 16 }}>
                <button className="btn" style={{ width: '100%' }} onClick={() => onLogChallenge(ch)}>
                  {catType === 'tom_holland' ? '▶ Workout starten' : '▶ Bring Sally Up starten'}
                </button>
              </div>
            ) : (
              <QuickLogRow me={me} catId={ch.category_id} onQuick={(v) => onQuickLog?.(ch, v)} onLog={() => onLogChallenge(ch)} />
            )}
          </div>
          {(() => {
            const dayVals = (d) => twoSided || sides.length < 2
              ? d.vals
              : [d.vals[0], Math.round(d.vals[1] / othersCount)];
            const maxV = Math.max(1, ...chDailyBreakdown.flatMap(dayVals));
            return (
              <div className="daily-breakdown">
                <div className="db-header">
                  <span className="db-eyebrow">Diese Woche · pro Tag{!twoSided && sides.length > 2 ? ' · Du vs. Ø andere' : ''}</span>
                </div>
                <div className="db-grid">
                  {chDailyBreakdown.map(d => {
                    const vals = dayVals(d);
                    return (
                      <div key={d.iso} className={`db-day${d.isToday ? ' today' : ''}${d.isFuture ? ' future' : ''}`}>
                        <div className="db-bars">
                          {vals.map((v, i) => (
                            <div key={i} className={`db-bar side-${i}`}
                              style={{height: `${v ? Math.max(6, (v / maxV) * 38) : 0}px`}}
                              title={`${breakdownLabels[i]}: ${v}`} />
                          ))}
                        </div>
                        <div className="db-values">
                          {vals.map((v, i) => (
                            <div key={i} className={`db-val side-${i} mono`}>{d.isFuture ? '—' : v}</div>
                          ))}
                        </div>
                        <div className="db-label">{d.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
        );
      })}
      </div>
    </div>
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
        <div className="next-week-preview">
          <div className="nwp-header">
            <span className="nwp-eyebrow">Nächste Woche</span>
            <span className="nwp-when">{whenLabel}</span>
          </div>
          <div className="nwp-subtitle">
            KW {weekNumber(nextWeekStart)} · ab {formatWeek(nextWeekStart).split(' – ')[0]}
            {!isConfirmed && ' · Vorschau'}
          </div>
          <div className="nwp-items">
            {items.map((ch, i) => {
              const cat = catById[ch.category_id];
              return (
                <div className="nwp-item" key={ch.id || `p-${i}`}>
                  <span className="nwp-emoji">{cat?.emoji}</span>
                  <div className="nwp-meta">
                    <div className="nwp-name">{cat?.name}</div>
                    <div className="nwp-picker">{isConfirmed && ch.chosen_by ? `von ${PTPeople.firstNameOf(ch.chosen_by)}` : 'noch offen'}</div>
                  </div>
                  <div className="nwp-target">
                    {!isConfirmed && ch.bonus_max > 0
                      ? <span className="mono">{ch.target_reps}&ndash;{ch.target_reps + ch.bonus_max}</span>
                      : <span className="mono">{ch.target_reps}</span>}
                    <span className="nwp-target-unit">Reps</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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

// ─── SETUP WEEK ─────────────────────────────────────────────────────────────
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
          <button className="new-cat-add new-cat-del" onClick={deleteEdit} aria-label="Löschen">🗑</button>
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
          {deleting ? '…' : '🗑 Challenge aus dieser Woche entfernen'}
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
    const palette = ['var(--accent)', 'var(--accent-3)', 'var(--warning)', 'var(--accent-2)', '#fff'];
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
              {twoSided ? <>
                <span style={{color:'var(--accent)'}}>{fmtRecapVal(c.doneBySide[0])}</span>
                {' · '}
                <span style={{color:'var(--accent-3)'}}>{fmtRecapVal(c.doneBySide[1])}</span>
              </> : <span>{fmtRecapVal(c.total)}</span>}
              {' / '}{fmtRecapVal(c.ch.target_reps)}
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

function ReactionBar({ set, me, onToggle, onPick }) {
  const reactions = set.reactions || [];
  // Gruppieren nach emoji: { emoji, count, byMe }
  const grouped = {};
  for (const r of reactions) {
    const g = grouped[r.emoji] ||= { emoji: r.emoji, count: 0, byMe: false };
    g.count++;
    if (r.athlete === me) g.byMe = true;
  }
  const pills = Object.values(grouped);
  return (
    <div className="feed-reactions">
      {pills.map(p => (
        <button
          key={p.emoji}
          className={`reaction-pill ${p.byMe ? 'mine' : ''}`}
          onClick={() => onToggle?.(set, p.emoji)}
          aria-label={`${p.emoji} ${p.count}`}>
          <span className="reaction-emoji">{p.emoji}</span>
          <span className="reaction-count mono">{p.count}</span>
        </button>
      ))}
      <button className="reaction-add" aria-label="Reaktion hinzufügen" onClick={() => onPick?.(set)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><line x1="18" y1="6" x2="18" y2="10"/><line x1="16" y1="8" x2="20" y2="8"/></svg>
      </button>
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

function FeedScreen({ feed, me, sides = [], categories = [], projectTags = [], toolTags = [], onEditSet, onDeleteSet, onToggleReaction, onPickEmoji, onBackfill }) {
  const [editId, setEditId] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');
  // Snapshot last-seen timestamp; on tab-unmount, persist "now" so next visit
  // only highlights items created after this view.
  const [lastSeen, setLastSeen] = React.useState(() => me ? (localStorage.getItem(`pt_feed_lastseen_${me}`) || '') : '');
  React.useEffect(() => {
    if (!me) return;
    const key = `pt_feed_lastseen_${me}`;
    setLastSeen(localStorage.getItem(key) || '');
    return () => { localStorage.setItem(key, new Date().toISOString()); };
  }, [me]);
  const sideIdx = React.useMemo(() => sideIndexByUser(sides), [sides]);
  const trackingNumById = React.useMemo(() => {
    const counters = {};
    const out = {};
    const sets = feed.filter(s => s.kind !== 'recap' && s.challenge_id);
    const chronological = [...sets].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (const s of chronological) {
      const key = `${s.athlete}|${s.challenge_id}|${localDateOf(s.created_at)}`;
      counters[key] = (counters[key] || 0) + 1;
      out[s.id] = counters[key];
    }
    return out;
  }, [feed]);
  if (feed.length === 0) {
    return <div className="empty">
      <div className="emoji">📭</div>
      <div className="title">Noch keine Aktivität</div>
      <div>Logge den ersten Satz, um den Feed zu starten.</div>
    </div>;
  }
  const isWorkSet = (s) => s.duration_minutes != null;
  const startEdit = (s) => { setEditId(s.id); setEditVal(String(isWorkSet(s) ? s.duration_minutes : s.reps)); };
  const commitEdit = (s) => {
    const v = parseInt(editVal) || 0;
    if (isWorkSet(s)) {
      if (v > 0 && v !== s.duration_minutes) onEditSet?.(s, { duration_minutes: v });
    } else {
      if (v > 0 && v !== s.reps) onEditSet?.(s, { reps: v });
    }
    setEditId(null);
  };
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div className="label">Live-Feed</div>
        {onBackfill && me && (
          <button className="btn-link" onClick={onBackfill}>Nachtrag</button>
        )}
      </div>
      {feed.map((s) => {
        if (s.kind === 'recap') return <WeekRecap key={s.id} recap={s} me={me} sides={sides} />;
        const mine = !me || s.athlete === me;
        const editing = editId === s.id;
        const trackingNum = trackingNumById[s.id];
        const isToday = s.created_at && localDateOf(s.created_at) === localDateOf(new Date());
        const fireTier = trackingNum >= 15 ? 3 : trackingNum >= 10 ? 2 : trackingNum >= 5 ? 1 : 0;
        const flames = fireTier === 0 ? '' : fireTier === 1 ? '🔥' : `${fireTier}x 🔥`;
        const isNew = !!me && s.athlete !== me && lastSeen && String(s.created_at) > lastSeen;
        const side = sides[sideIdx[s.athlete]];
        const sideCls = side ? side.cls : 'side-n';
        return (
        <div className={`feed-item fire-${fireTier} ${editing?'editing':''} ${isNew ? 'is-new' : ''}`} key={s.id}>
          <div className={`feed-avatar ${sideCls}`} style={sideStyle(side)}><Avatar userId={s.athlete} size={36} className="avatar-img"/></div>
          <div className="feed-content">
            <div className="feed-title">
              <strong>{s.athlete === me ? 'Du' : PTPeople.nameOf(s.athlete)}</strong> · {s.category?.name || '—'}
            </div>
            <div className="feed-meta">
              {formatRelative(s.created_at)}
              {s.note ? ` · „${s.note}"` : ''}
              {trackingNum != null && (
                <>
                  {' · '}
                  <span className="feed-meta-tracking">
                    {trackingNum}. Tracking{isToday ? ' heute' : ''}
                    {flames && <span className="reps-fire"> {flames}</span>}
                  </span>
                </>
              )}
            </div>
            <ReactionBar set={s} me={me} onToggle={onToggleReaction} onPick={onPickEmoji} />
          </div>
          {editing ? (
            <div className="feed-edit">
              <div className="feed-edit-unit">{isWorkSet(s) ? 'min' : 'reps'}</div>
              <input className="input mono" type="number" inputMode="numeric"
                value={editVal} autoFocus
                onChange={e => setEditVal(e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key==='Enter') commitEdit(s); if (e.key==='Escape') setEditId(null); }}
                onBlur={() => commitEdit(s)} />
            </div>
          ) : (
            <div className={`feed-reps ${sideCls} mono`} style={sideStyle(side)}>
              <div className="feed-reps-val">
                {s.duration_minutes != null
                  ? formatDuration(s.duration_minutes)
                  : s.category?.challenge_type === 'tom_holland'
                    ? `${s.reps} Rd.`
                    : s.category?.challenge_type === 'bring_sally_up'
                      ? (s.reps >= BSU_MAX_SEC ? '✅ 3:24' : bsuFmt(s.reps))
                      : `+${s.reps}`}
              </div>
              {(s.project_tag_id || s.tool_tag_id) && (
                <div className="feed-tags-row">
                  {s.project_tag_id && (() => {
                    const pt = projectTags.find(t => t.id === s.project_tag_id);
                    return pt ? <span className="feed-tag">{pt.emoji} {pt.name}</span> : null;
                  })()}
                  {s.tool_tag_id && (() => {
                    const tt = toolTags.find(t => t.id === s.tool_tag_id);
                    return tt ? <span className="feed-tag">{tt.emoji} {tt.name}</span> : null;
                  })()}
                </div>
              )}
            </div>
          )}
          {mine && !editing && (
            <div className="feed-actions">
              <button className="icon-btn feed-action-btn" aria-label="Bearbeiten" onClick={() => startEdit(s)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button className="icon-btn icon-btn-danger feed-action-btn" aria-label="Löschen" onClick={() => { if (confirm(`${isWorkSet(s) ? formatDuration(s.duration_minutes) : `+${s.reps}`} löschen?`)) onDeleteSet?.(s); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          )}
        </div>);
      })}
    </div>);

}

// ─── HISTORY ────────────────────────────────────────────────────────────────
// series: [{ key, label, color, data: [{date: 'YYYY-MM-DD', reps: number}] }] — alle gleich lang
function StatsChart({ series, days }) {
  const W = 320, H = 140, PAD_X = 28, PAD_Y = 18;
  const axis = series[0]?.data || [];
  const maxV = Math.max(1, ...series.flatMap(s => s.data.map(d => d.reps)));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // x labels — 4-5 evenly spaced
  const labelIdx = days <= 7 ? axis.map((_, i) => i) : [0, Math.floor(days/4), Math.floor(days/2), Math.floor(3*days/4), days - 1];
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth()+1}`; };

  // Week boundaries — Mondays within the range
  const weekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  const showWeekLabels = weekMarks.length <= 5;
  // Flächen nur bei wenigen Linien, sonst wird es unleserlich
  const showArea = series.length <= 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stats-chart" preserveAspectRatio="none">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`grad-s${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.35"/>
            <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
          </linearGradient>
        ))}
      </defs>
      {gridLines.map((y, i) => <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
      {weekMarks.map(({idx, kw}) => (
        <g key={`wk${idx}`}>
          <line className="chart-week-line" x1={xPos(idx)} x2={xPos(idx)} y1={PAD_Y * 0.6} y2={H - PAD_Y}/>
          {showWeekLabels && (
            <text x={xPos(idx)} y={PAD_Y * 0.55} fill="var(--text-2)" fontSize="8" textAnchor="middle" opacity="0.75">KW{kw}</text>
          )}
        </g>
      ))}
      {showArea && series.map((s, i) => <path key={`a${s.key}`} d={areaFor(s.data)} fill={`url(#grad-s${i})`}/>)}
      {series.map(s => (
        <path key={`l${s.key}`} d={pathFor(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      ))}
      {labelIdx.map(i => axis[i] && (
        <text key={i} x={xPos(i)} y={H - 4} fill="var(--text-2)" fontSize="9" textAnchor="middle">{fmt(axis[i].date)}</text>
      ))}
      <text x={PAD_X - 4} y={yScale(maxV) + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">{maxV}</text>
      <text x={PAD_X - 4} y={H - PAD_Y + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">0</text>
    </svg>
  );
}

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
  const weekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
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

// title: Überschrift der Vergleichskarte (z.B. „Benny vs. Jonas“)
function HistoryScreen({ challenges, categories, allSets, sides = [], title }) {
  const [kindTab, setKindTab] = React.useState(() =>
    sessionStorage.getItem('pt_history_kind') || 'all'
  );
  const switchKind = (k) => { setKindTab(k); sessionStorage.setItem('pt_history_kind', k); };

  // Determine which categories exist across all data (to decide whether to show the toggle)
  const usedCatIds = useMemo(() => new Set(challenges.map(c => c.category_id)), [challenges]);
  const hasWork   = useMemo(() => categories.some(c => c.kind === 'work' && usedCatIds.has(c.id)), [categories, usedCatIds]);
  const hasSports = useMemo(() => categories.some(c => (c.kind || 'sports') === 'sports' && usedCatIds.has(c.id)), [categories, usedCatIds]);
  const showToggle = hasWork && hasSports;

  // Apply kind filter to challenges + sets
  const filteredChallenges = useMemo(() => {
    if (kindTab === 'all') return challenges;
    return challenges.filter(ch => {
      const cat = categories.find(c => c.id === ch.category_id);
      return (cat?.kind || 'sports') === kindTab;
    });
  }, [challenges, categories, kindTab]);

  const filteredChallengeIds = useMemo(() => new Set(filteredChallenges.map(c => c.id)), [filteredChallenges]);

  const filteredAllSets = useMemo(() =>
    kindTab === 'all' ? allSets : allSets.filter(s => filteredChallengeIds.has(s.challenge_id)),
    [allSets, filteredChallengeIds, kindTab]
  );

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const setsByCh = useMemo(() => {
    const m = {};
    for (const s of filteredAllSets) {
      (m[s.challenge_id] ||= []).push(s);
    }
    return m;
  }, [filteredAllSets]);

  // Streak: aufeinanderfolgende Tage (Local Time) mit mindestens einem geloggten Satz.
  // Wenn heute noch nichts geloggt ist, wird gestern als Start genommen (Grace-Tag), damit
  // der Streak nicht morgens auf 0 fällt, bevor jemand den Tag startet.
  const streak = useMemo(() => {
    const localDay = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const days = new Set();
    for (const x of filteredAllSets) days.add(localDay(new Date(x.created_at)));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
    let s = 0;
    while (days.has(localDay(cursor))) {
      s++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return s;
  }, [filteredAllSets]);

  const totalReps = filteredAllSets.reduce((s, x) => s + (x.reps ?? x.duration_minutes ?? 0), 0);
  // Wochen: jede Kalenderwoche zählt, in der mindestens ein Satz geloggt wurde
  // (unabhängig davon, ob das Wochenziel erreicht wurde).
  const weeksDone = new Set(
    filteredChallenges
      .filter(ch => (setsByCh[ch.id] || []).length > 0)
      .map(ch => ch.week_start)
  ).size;

  if (challenges.length === 0 || !sides.length) {
    return <div className="empty">
      <div className="emoji">📅</div>
      <div className="title">Noch keine Historie</div>
      <div>Starte deine erste Wochen-Challenge.</div>
    </div>;
  }

  const emptyFilter = filteredChallenges.length === 0;
  const kindLabel = kindTab === 'work' ? 'Work' : 'Sports';

  return (
    <>
      {showToggle && (
        <div className="work-tab-toggle" style={{marginBottom: 12}}>
          <button className={`work-tab-btn${kindTab === 'all' ? ' active' : ''}`} onClick={() => switchKind('all')}>Alle</button>
          <button className={`work-tab-btn${kindTab === 'sports' ? ' active' : ''}`} onClick={() => switchKind('sports')}>🏋️ Sports</button>
          <button className={`work-tab-btn${kindTab === 'work' ? ' active' : ''}`} onClick={() => switchKind('work')}>💻 Work</button>
        </div>
      )}
      {emptyFilter ? (
        <div className="empty">
          <div className="emoji">{kindTab === 'work' ? '💻' : '🏋️'}</div>
          <div className="title">Keine {kindLabel}-Challenges</div>
          <div>Starte eine {kindLabel}-Challenge, um hier Daten zu sehen.</div>
        </div>
      ) : (
        <HistoryView {...{challenges: filteredChallenges, categories, allSets: filteredAllSets, catById, setsByCh, streak, totalReps, weeksDone, kindTab, sides, title}} />
      )}
    </>
  );
}

function HistoryView({ challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone, kindTab = 'all', sides, title }) {
  const [range, setRange] = useState('30'); // '7', '30', 'all'
  const [selectedCats, setSelectedCats] = useState([]); // [] = alle

  // Determine if the current filter is exclusively work or sports for unit labels.
  // When no category chips are selected, inherit kind from the parent toggle (kindTab).
  const filterKind = useMemo(() => {
    if (!selectedCats.length) return kindTab === 'all' ? 'mixed' : kindTab;
    const kinds = [...new Set(selectedCats.map(id => catById[id]?.kind || 'sports'))];
    return kinds.length === 1 ? kinds[0] : 'mixed';
  }, [selectedCats, catById, kindTab]);
  const unitLabel = filterKind === 'work' ? 'Min.' : 'Reps';
  const [cumulative, setCumulative] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  // Seite 0/1 folgen den Theme-Akzenten, alle weiteren ihrer festen Farbe.
  const [accentColors, setAccentColors] = useState({ accent: '#30D158', accent3: '#FFD60A' });
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    setAccentColors({
      accent: s.getPropertyValue('--accent').trim() || '#30D158',
      accent3: s.getPropertyValue('--accent-3').trim() || '#FFD60A',
    });
  }, []);
  const colorOf = (i) => i === 0 ? accentColors.accent : i === 1 ? accentColors.accent3 : sides[i].color;
  const sideIdx = useMemo(() => sideIndexByUser(sides), [sides]);
  const twoSided = sides.length === 2;
  const N = sides.length;
  const zeros = () => sides.map(() => 0);
  const val = (s) => s.reps ?? s.duration_minutes ?? 0;
  const cardTitle = title || (twoSided ? `${sides[0].label} vs. ${sides[1].label}` : 'Rangliste');

  const days = range === '7' ? 7 : range === '30' ? 30 : null;

  // Which categories were actually used at some point — filter chip source
  const usedCats = useMemo(() => {
    const ids = new Set(challenges.map(c => c.category_id));
    return categories.filter(c => ids.has(c.id));
  }, [categories, challenges]);

  // Map challenge_id -> category_id for fast filtering
  const chCatMap = useMemo(() => Object.fromEntries(challenges.map(c => [c.id, c.category_id])), [challenges]);

  // Apply category filter to sets
  const filteredSets = useMemo(() => {
    if (!selectedCats.length) return allSets;
    const set = new Set(selectedCats);
    return allSets.filter(s => set.has(chCatMap[s.challenge_id]));
  }, [allSets, selectedCats, chCatMap]);

  // Compute date-range buckets (per day, per side)
  const { series, cumSeries, rangeStart, totalDays } = useMemo(() => {
    let start, total;
    if (days) {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() - (days - 1));
      start = d;
      total = days;
    } else {
      // all time — from earliest set
      const earliest = filteredSets.length
        ? new Date(filteredSets.reduce((m, s) => s.created_at < m ? s.created_at : m, filteredSets[0].created_at))
        : new Date();
      earliest.setHours(0,0,0,0);
      start = earliest;
      const now = new Date(); now.setHours(0,0,0,0);
      total = Math.max(1, Math.round((now - start) / 86400000) + 1);
      total = Math.min(total, 90); // cap for chart
      if (total >= 90) {
        const d2 = new Date(); d2.setHours(0,0,0,0);
        d2.setDate(d2.getDate() - 89);
        start = d2;
      }
    }
    const arrs = sides.map(() => []);
    for (let i = 0; i < total; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = PTData.isoDate(d);
      arrs.forEach(a => a.push({ date: iso, reps: 0 }));
    }
    for (const s of filteredSets) {
      const si = sideIdx[s.athlete];
      if (si == null) continue;
      const day = PTData.isoDate(new Date(s.created_at));
      const i = Math.round((new Date(day + 'T00:00:00') - start) / 86400000);
      if (i < 0 || i >= total) continue;
      arrs[si][i].reps += val(s);
    }
    const cum = arrs.map(arr => { let acc = 0; return arr.map(d => ({ date: d.date, reps: (acc += d.reps) })); });
    return { series: arrs, cumSeries: cum, rangeStart: start, totalDays: total };
  }, [filteredSets, days, range, sides, sideIdx]);

  const asSeries = (arrs) => arrs.map((data, i) => ({
    key: sides[i].key, label: sides[i].isMine && sides[i].userIds.length === 1 ? 'Du' : sides[i].label,
    color: colorOf(i), data,
  }));

  // Range-scoped sets (apply both range + category filter)
  const setsInRange = useMemo(() => {
    return filteredSets.filter(s => new Date(String(s.created_at).slice(0,10)) >= rangeStart);
  }, [filteredSets, rangeStart]);

  const sideStats = useMemo(
    () => sides.map((side, i) => computeAthleteStats(setsInRange, side.statUserIds || side.userIds, series[i])),
    [setsInRange, series, sides]
  );

  // ⌀ Sätze bis Ziel: for each challenge where a side reached the target,
  // count the sets they needed to first hit target_reps. Respect category filter.
  const setsToTarget = useMemo(() => {
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    const acc = sides.map(() => ({ totalSets: 0, hits: 0 }));
    for (const ch of challenges) {
      if (catSet && !catSet.has(ch.category_id)) continue;
      const chSets = (setsByCh[ch.id] || [])
        .slice()
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      sides.forEach((_, si) => {
        const own = chSets.filter(s => sideIdx[s.athlete] === si);
        let sum = 0;
        for (let i = 0; i < own.length; i++) {
          sum += val(own[i]);
          if (sum >= ch.target_reps) {
            acc[si].totalSets += i + 1;
            acc[si].hits += 1;
            break;
          }
        }
      });
    }
    return acc.map(a => ({ avg: a.hits ? Math.round((a.totalSets / a.hits) * 10) / 10 : 0, hits: a.hits }));
  }, [challenges, setsByCh, selectedCats, sides, sideIdx]);

  const totals = sideStats.map(s => s.total);
  const maxReps = Math.max(...totals, 1);
  const leaderIdx = uniqueMaxIndex(totals);
  const sortedTotals = [...totals].sort((a, b) => b - a);
  const diff = N > 1 ? sortedTotals[0] - sortedTotals[1] : 0;

  // Momentum: who's gaining in the last 7 days?
  // Only meaningful when the range is ≥ 2 weeks — otherwise "last 7" ≈ "all" and the line just repeats the headline.
  const momentum = useMemo(() => {
    if (leaderIdx == null || totalDays < 14 || N < 2) return null;
    const W = 7;
    const recent = series.map(arr => arr.slice(-W).reduce((a, x) => a + x.reps, 0));
    const recentIdx = uniqueMaxIndex(recent);
    if (recentIdx == null) return null;
    const isCatchingUp = recentIdx !== leaderIdx;
    const gap = isCatchingUp
      ? recent[recentIdx] - recent[leaderIdx]
      : recent[recentIdx] - Math.max(...recent.filter((_, i) => i !== recentIdx));
    if (gap <= 0) return null;
    const behind = totals[leaderIdx] - totals[recentIdx];
    const daysToOvertake = isCatchingUp && gap >= 5 && (behind / gap) <= 8
      ? Math.max(0.1, Math.round((behind / gap) * 7 * 10) / 10)
      : null;
    return { idx: recentIdx, gap, isCatchingUp, daysToOvertake };
  }, [series, totalDays, leaderIdx, totals, N]);

  // All-time lead history: who currently leads overall, since when, and weekly tally.
  // Uses filteredSets (category filter applied) but ignores the range selector — these are
  // historical aggregates, not range-scoped views.
  const leadHistory = useMemo(() => {
    if (!filteredSets.length) return null;
    const dayMap = new Map();
    for (const s of filteredSets) {
      const si = sideIdx[s.athlete];
      if (si == null) continue;
      const day = String(s.created_at).slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, zeros());
      dayMap.get(day)[si] += val(s);
    }
    const dayKeys = Array.from(dayMap.keys()).sort();
    const cum = zeros();
    let currentLeader = null;
    let leaderSinceDate = null;
    for (const day of dayKeys) {
      dayMap.get(day).forEach((v, i) => { cum[i] += v; });
      const todayLeader = uniqueMaxIndex(cum);
      if (todayLeader !== currentLeader) {
        currentLeader = todayLeader;
        leaderSinceDate = day;
      }
    }
    if (currentLeader == null) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since = new Date(leaderSinceDate);
    const daysSince = Math.max(1, Math.round((today - since) / 86400000) + 1);
    return { leader: currentLeader, sinceDate: leaderSinceDate, daysSince };
  }, [filteredSets, sideIdx]);

  // Per-week win tally: for each completed calendar week, who had the most reps in
  // that week's challenges? Skips the current (in-progress) week and applies the
  // category filter via selectedCats.
  const weeklyTally = useMemo(() => {
    const byWeek = new Map();
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    for (const ch of challenges) {
      if (catSet && !catSet.has(ch.category_id)) continue;
      const wk = ch.week_start;
      if (!byWeek.has(wk)) byWeek.set(wk, zeros());
      for (const s of setsByCh[ch.id] || []) {
        const si = sideIdx[s.athlete];
        if (si != null) byWeek.get(wk)[si] += val(s);
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const wins = zeros();
    let ties = 0;
    for (const [wkStart, t] of byWeek) {
      const wEnd = new Date(wkStart); wEnd.setHours(0, 0, 0, 0); wEnd.setDate(wEnd.getDate() + 6);
      if (wEnd >= today) continue; // skip current/future week
      if (t.every(v => v === 0)) continue; // no activity
      const w = uniqueMaxIndex(t);
      if (w == null) ties++; else wins[w]++;
    }
    return { wins, ties };
  }, [challenges, setsByCh, selectedCats, sideIdx]);

  const fmtDateShort = (iso) => {
    const d = new Date(iso);
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('de-DE', opts);
  };

  // Per-category breakdown in range
  const perCat = useMemo(() => {
    const m = {};
    const chById = Object.fromEntries(challenges.map(c => [c.id, c]));
    for (const s of setsInRange) {
      const ch = chById[s.challenge_id];
      const si = sideIdx[s.athlete];
      if (!ch || si == null) continue;
      m[ch.category_id] ||= zeros();
      m[ch.category_id][si] += val(s);
    }
    return Object.entries(m)
      .map(([cid, v]) => ({ cat: catById[cid], vals: v, total: v.reduce((a, x) => a + x, 0) }))
      .sort((a,b) => b.total - a.total);
  }, [setsInRange, challenges, catById, sideIdx]);

  // Hall of Fame: all-time records. Respects category filter, ignores date range.
  // Each medal goes to a single winner; ties yield no medal.
  const hallOfFame = useMemo(() => {
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    const chMap = new Map(challenges.map(c => [c.id, c]));
    const relevant = allSets.filter(s => {
      const ch = chMap.get(s.challenge_id);
      return ch && (!catSet || catSet.has(ch.category_id)) && sideIdx[s.athlete] != null;
    });
    const maxSet = zeros();
    const byDay = sides.map(() => ({}));
    for (const s of relevant) {
      const si = sideIdx[s.athlete];
      const v = val(s);
      if (v > maxSet[si]) maxSet[si] = v;
      const d = PTData.isoDate(new Date(s.created_at));
      byDay[si][d] = (byDay[si][d] || 0) + v;
    }
    const bestDay = zeros();
    const longestStreak = zeros();
    sides.forEach((_, a) => {
      const dayKeys = Object.keys(byDay[a]).sort();
      let cur = 0, best = 0, prev = null;
      for (const d of dayKeys) {
        if (byDay[a][d] > bestDay[a]) bestDay[a] = byDay[a][d];
        const dt = new Date(d + 'T00:00:00');
        if (prev && Math.round((dt - prev) / 86400000) === 1) cur++; else cur = 1;
        if (cur > best) best = cur;
        prev = dt;
      }
      longestStreak[a] = best;
    });
    const perCatAll = {};
    for (const s of relevant) {
      const ch = chMap.get(s.challenge_id);
      perCatAll[ch.category_id] ||= zeros();
      perCatAll[ch.category_id][sideIdx[s.athlete]] += val(s);
    }
    const catWins = zeros();
    for (const v of Object.values(perCatAll)) {
      const w = uniqueMaxIndex(v);
      if (w != null) catWins[w]++;
    }
    const runnerUp = (arr, w) => Math.max(...arr.filter((_, i) => i !== w), 0);
    const medals = [];
    const push = (m) => medals.push(m);
    if (leadHistory) push({
      key: 'lead', icon: '👑', title: 'Aktueller Anführer', tier: 'gold',
      winner: leadHistory.leader,
      value: `${leadHistory.daysSince} ${leadHistory.daysSince === 1 ? 'Tag' : 'Tage'}`,
      sub: `seit ${fmtDateShort(leadHistory.sinceDate)}`,
    });
    const weeklyWinner = uniqueMaxIndex(weeklyTally.wins);
    if (weeklyWinner != null) {
      const w = weeklyWinner;
      push({
        key: 'weekly', icon: '🏆', title: 'Wochenkönig', tier: 'gold',
        winner: w,
        value: `${weeklyTally.wins[w]} Siege`,
        sub: `${N === 2 ? 'gegen' : 'nächster:'} ${runnerUp(weeklyTally.wins, w)}${weeklyTally.ties ? ` · ${weeklyTally.ties}× geteilt` : ''}`,
      });
    }
    const hitsWinner = uniqueMaxIndex(setsToTarget.map(x => x.hits));
    if (hitsWinner != null) {
      push({
        key: 'hits', icon: '🎯', title: 'Zielgenau', tier: 'gold',
        winner: hitsWinner,
        value: `${setsToTarget[hitsWinner].hits} Ziele`,
        sub: 'erreicht',
      });
    }
    const catWinner = uniqueMaxIndex(catWins);
    if (catWinner != null) {
      push({
        key: 'cats', icon: '🥇', title: 'Kategoriekönig', tier: 'gold',
        winner: catWinner,
        value: `${catWins[catWinner]} ${catWins[catWinner] === 1 ? 'Kategorie' : 'Kategorien'}`,
        sub: 'angeführt',
      });
    }
    const maxSetWinner = uniqueMaxIndex(maxSet);
    if (maxSetWinner != null) {
      push({
        key: 'maxSet', icon: '💪', title: 'Rekord-Satz', tier: 'silver',
        winner: maxSetWinner, value: `${maxSet[maxSetWinner]} ${unitLabel}`, sub: 'in einem Satz',
      });
    }
    const bestDayWinner = uniqueMaxIndex(bestDay);
    if (bestDayWinner != null) {
      push({
        key: 'bestDay', icon: '📅', title: 'Bester Tag', tier: 'silver',
        winner: bestDayWinner, value: `${bestDay[bestDayWinner]} ${unitLabel}`, sub: 'an einem Tag',
      });
    }
    const streakWinner = uniqueMaxIndex(longestStreak);
    if (streakWinner != null) {
      push({
        key: 'streak', icon: '🔥', title: 'Streak-King', tier: 'silver',
        winner: streakWinner,
        value: `${longestStreak[streakWinner]} ${longestStreak[streakWinner] === 1 ? 'Tag' : 'Tage'}`,
        sub: 'in Folge',
      });
    }
    return medals;
  }, [challenges, allSets, selectedCats, leadHistory, weeklyTally, setsToTarget, sides, sideIdx]);

  const shortName = (side) => side.isMine && side.userIds.length === 1 ? 'Du' : side.label.split(/\s+/)[0];

  return (
    <>
      <div className="stat-row" style={{ marginBottom: 14, marginTop: 0 }}>
        <div className="stat">
          <div className="v mono">{streak}🔥</div>
          <div className="k">Streak</div>
        </div>
        <div className="stat">
          <div className="v mono">{weeksDone}</div>
          <div className="k">Wochen aktiv</div>
        </div>
        <div className="stat">
          <div className="v mono">{totalReps}</div>
          <div className="k">{unitLabel} gesamt</div>
        </div>
      </div>

      <div className="card">
        <div className="vs-head">
          <div className="label" style={{margin: 0}}>{cardTitle}</div>
          <div className="vs-toggles">
            <div className="segmented segmented-sm">
              <button className={cumulative?'active':''} onClick={()=>setCumulative(true)} aria-label="Kumuliert">Σ</button>
              <button className={!cumulative?'active':''} onClick={()=>setCumulative(false)} aria-label="Pro Tag">Tag</button>
            </div>
            <div className="segmented segmented-sm">
              <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
              <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
              <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
            </div>
          </div>
        </div>

        {usedCats.length > 0 && (
          <div className="cat-filter-row">
            <button
              className={`cat-filter-chip ${selectedCats.length === 0 ? 'active' : ''}`}
              onClick={() => setSelectedCats([])}
            >Alle</button>
            {usedCats.map(c => {
              const on = selectedCats.includes(c.id);
              return (
                <button key={c.id}
                  className={`cat-filter-chip ${on ? 'active' : ''}`}
                  onClick={() => setSelectedCats(on ? selectedCats.filter(x => x !== c.id) : [...selectedCats, c.id])}
                >{c.name}</button>
              );
            })}
          </div>
        )}

        {leaderIdx != null && diff > 0 && N > 1 && (
          <div className="winner-banner">
            <div className="winner-avatar-wrap">
              <SideAvatar side={sides[leaderIdx]} size={52} className="winner-avatar"/>
              <span className="winner-crown">👑</span>
            </div>
            <div className="winner-text">
              <div className="winner-name">{sides[leaderIdx].label}</div>
              <div className="winner-lead">führt mit <span className="mono">+{diff}</span> {unitLabel}</div>
              {momentum && (
                <div className={`winner-momentum ${sides[momentum.idx].cls}`} style={sideStyle(sides[momentum.idx])}>
                  {momentum.isCatchingUp ? '📈' : '🔒'} {sides[momentum.idx].label} {momentum.isCatchingUp ? 'holt auf' : 'baut aus'} · <span className="mono">+{momentum.gap}</span> in 7T
                  {momentum.daysToOvertake != null && (
                    <> · überholt in ~<span className="mono">{momentum.daysToOvertake.toFixed(1)}</span>T</>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {N <= 2 ? (
          <div className="vs-row">
            {sides.map((side, i) => (
              <div className={`vs-side ${side.cls}`} key={side.key}>
                <div className="vs-name">{side.label}</div>
                <div className="vs-reps mono">{sideStats[i].total}</div>
                <div className="vs-meta mono">{sideStats[i].sets} Sätze · ⌀ {sideStats[i].avgSet}/Satz</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mu-rank" style={{ marginTop: 6 }}>
            {sides.map((s, i) => i).sort((a, b) => totals[b] - totals[a]).map((i, rank) => (
              <div key={sides[i].key} className={`mu-rank-row ${sides[i].isMine ? 'mine' : ''}`}>
                <span className="mu-rank-pos mono">{rank + 1}</span>
                <SideAvatar side={sides[i]} size={24} />
                <span className="mu-rank-name">{shortName(sides[i])}</span>
                <span className="mu-rank-bar"><span className="mu-rank-fill" style={{ width: `${(totals[i] / maxReps) * 100}%`, background: colorOf(i) }} /></span>
                <span className="mu-rank-val mono">{totals[i]}</span>
              </div>
            ))}
          </div>
        )}

        {N <= 2 && (
          <div className="vs-bar">
            {sides.map((side, i) => (
              <div key={side.key} className={`vs-bar-${side.cls}`} style={{flex: totals[i] / maxReps}} />
            ))}
          </div>
        )}

        <div className="chart-wrap" onClick={() => setFullscreen(true)} role="button" tabIndex={0}>
          <div className="chart-legend">
            {sides.map((side, i) => (
              <span key={side.key}><span className="dot" style={{background: colorOf(i)}}/>{shortName(side)}</span>
            ))}
            <span className="chart-title">{cumulative ? 'Kumuliert' : `${unitLabel} pro Tag`}</span>
            <Icon name="expand" size={14} color="var(--text-2)" />
          </div>
          <StatsChart series={asSeries(cumulative ? cumSeries : series)} days={totalDays} />
        </div>

        {(() => {
          const rows = [
            { label: 'Aktive Tage', vals: sideStats.map(s => s.activeDays) },
            { label: 'Bester Tag', vals: sideStats.map(s => s.bestDay) },
            { label: 'Größter Satz', vals: sideStats.map(s => s.maxSet) },
            { label: `⌀ ${unitLabel}/Tag`, vals: sideStats.map(s => s.avgDay) },
            { label: '⌀ Sätze bis Ziel', vals: setsToTarget.map(x => x.hits ? x.avg : null), lowerWins: true },
            { label: 'Ziele erreicht', vals: setsToTarget.map(x => x.hits) },
          ];
          return (
            <div className={N > 3 ? 'mu-table-scroll' : ''}>
              <table className="stats-table">
                <thead>
                  <tr>
                    <th></th>
                    {sides.map((side, i) => (
                      <th key={side.key} className={side.cls} style={i > 1 ? { color: side.color } : undefined}>{shortName(side)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const w = uniqueMaxIndex(r.vals, r.lowerWins);
                    return (
                      <tr key={ri}>
                        <td className="st-label">{r.label}</td>
                        {sides.map((side, i) => (
                          <td key={side.key} className={`st-val mono ${side.cls}${w === i ? ' win' : w != null ? ' lose' : ''}`} style={sideStyle(side)}>
                            <span className="st-pill">{r.vals[i] == null ? '–' : r.vals[i]}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {perCat.length > 0 && (
          <div style={{marginTop: 18}}>
            <div className="label" style={{marginBottom: 8}}>Nach Kategorie</div>
            {perCat.map(({cat, vals, total}) => {
              const m = Math.max(...vals, 1);
              const catLeader = uniqueMaxIndex(vals);
              const sortedVals = [...vals].sort((a, b) => b - a);
              const catDiff = N > 1 ? sortedVals[0] - sortedVals[1] : 0;
              const leaderSide = catLeader != null ? sides[catLeader] : null;
              return (
                <div className={`vs-cat${leaderSide && catLeader < 2 ? ` leader-${leaderSide.cls}` : ''}`} key={cat?.id || total}>
                  <div className="vs-cat-head">
                    <div className="vs-cat-name">{cat?.emoji} {cat?.name}</div>
                    {leaderSide ? (
                      <div className={`vs-cat-leader ${leaderSide.cls}`} style={sideStyle(leaderSide)}>
                        <span className="vs-cat-leader-crown">👑</span>
                        <span className="vs-cat-leader-name">{shortName(leaderSide)}</span>
                        <span className="vs-cat-leader-diff mono">+{catDiff}</span>
                      </div>
                    ) : (
                      total > 0 && <div className="vs-cat-leader tie"><span className="mono">=</span> Gleichstand</div>
                    )}
                  </div>
                  <div className="vs-cat-bars">
                    {sides.map((side, i) => (
                      <div key={side.key} className={`vs-cat-row${catLeader === i ? ' lead' : catLeader != null ? ' trail' : ''}`}>
                        <span className={`vs-cat-label ${side.cls}`} style={sideStyle(side)}>{side.short}</span>
                        <div className="vs-cat-track"><div className={`vs-cat-fill ${side.cls}`} style={{...sideStyle(side), width: `${(vals[i]/m)*100}%`}}/></div>
                        <span className="vs-cat-val mono">{vals[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hallOfFame.length > 0 && (
        <div className="card hof-card" style={{ marginTop: 14 }}>
          <div className="hof-header">
            <div className="hof-eyebrow">Hall of Fame</div>
            <div className="hof-sub">{hallOfFame.length} {hallOfFame.length === 1 ? 'Trophäe vergeben' : 'Trophäen vergeben'}</div>
          </div>
          <div className={`hof-halls ${N > 2 ? 'mu-hof-many' : ''}`}>
            {sides.map((side, si) => {
              const meds = hallOfFame.filter(m => m.winner === si);
              if (N > 2 && !meds.length) return null;
              return (
                <div className={`hof-hall ${side.cls}`} style={sideStyle(side)} key={side.key}>
                  <div className="hof-hall-head">
                    <SideAvatar side={side} size={28} className="hof-avatar" />
                    <div className="hof-hall-name">{shortName(side)}</div>
                    <div className="hof-hall-count mono">{meds.length}</div>
                  </div>
                  <div className="hof-shelf">
                    {meds.length === 0 ? (
                      <div className="hof-empty">Keine Trophäen</div>
                    ) : meds.map(m => (
                      <div className={`trophy tier-${m.tier} ${side.cls}`} key={m.key}>
                        <div className="trophy-icon">{m.icon}</div>
                        <div className="trophy-body">
                          <div className="trophy-title">{m.title}</div>
                          <div className="trophy-value mono">{m.value}</div>
                          {m.sub && <div className="trophy-sub">{m.sub}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {(weeklyTally.wins.some(Boolean) || weeklyTally.ties > 0) && (() => {
            const total = weeklyTally.wins.reduce((a, x) => a + x, 0) + weeklyTally.ties;
            const pct = (n) => Math.round((n / total) * 100);
            const best = uniqueMaxIndex(weeklyTally.wins);
            return (
              <div className="hof-weekly">
                <div className="hof-weekly-head">
                  <div className="hof-weekly-title">Wochen-Bilanz</div>
                  <div className="hof-weekly-meta">
                    <span className="mono">{total}</span> {total === 1 ? 'Woche' : 'Wochen'} abgeschlossen
                  </div>
                </div>
                <div className="hof-weekly-bar" aria-hidden="true">
                  {sides.map((side, i) => weeklyTally.wins[i] > 0 && (
                    <div key={side.key} className={`hof-weekly-seg ${side.cls}`} style={{...sideStyle(side), flex: weeklyTally.wins[i]}}>
                      {pct(weeklyTally.wins[i]) >= 18 && <span className="hof-weekly-seg-label mono">{pct(weeklyTally.wins[i])}%</span>}
                    </div>
                  ))}
                  {weeklyTally.ties > 0 && (
                    <div className="hof-weekly-seg tie" style={{flex: weeklyTally.ties}}>
                      {pct(weeklyTally.ties) >= 18 && <span className="hof-weekly-seg-label mono">{pct(weeklyTally.ties)}%</span>}
                    </div>
                  )}
                </div>
                <div className="hof-weekly-legend mu-wrap">
                  {sides.map((side, i) => (
                    <div key={side.key} className={`hof-weekly-card ${side.cls}${best === i ? ' lead' : best != null ? ' trail' : ''}`} style={sideStyle(side)}>
                      <div className="hof-weekly-card-num mono">{weeklyTally.wins[i]}</div>
                      <div className="hof-weekly-card-name">{shortName(side)}</div>
                    </div>
                  ))}
                  {weeklyTally.ties > 0 && (
                    <div className="hof-weekly-card tie">
                      <div className="hof-weekly-card-num mono">{weeklyTally.ties}</div>
                      <div className="hof-weekly-card-name">Geteilt</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8, padding: '0 4px', marginTop: 18 }}>Verlauf</div>
      {(() => {
        const groups = [];
        for (const ch of challenges) {
          const last = groups[groups.length - 1];
          if (last && last.weekStart === ch.week_start) last.items.push(ch);
          else groups.push({ weekStart: ch.week_start, items: [ch] });
        }
        const currentWeekStart = PTData.isoDate(PTData.mondayOf(new Date()));
        const sideTotalsFor = (ch) => totalsBySide(setsByCh[ch.id] || [], sides);
        const challengeIsDone = (ch) => sideTotalsFor(ch).every(v => v >= ch.target_reps);
        const progressRows = (ch) => {
          const ts = sideTotalsFor(ch);
          return (
            <div className="right">
              {sides.map((side, i) => {
                const pctV = Math.round(100 * ts[i] / ch.target_reps);
                const done = ts[i] >= ch.target_reps;
                return (
                  <div key={side.key} style={{display:'flex',justifyContent:'flex-end',alignItems:'baseline',gap:8,marginTop: i ? 4 : 0}}>
                    <span className="mono" style={{color: colorOf(i),fontWeight:700,fontSize:15}}>{side.short}</span>
                    <span className={`pct mono ${done ? 'done' : pctV < 50 ? 'miss' : ''}`} style={{fontSize:18}}>{pctV}%</span>
                    <span className="wk mono" style={{minWidth:72,textAlign:'right'}}>{ts[i]}/{ch.target_reps}</span>
                  </div>
                );
              })}
            </div>
          );
        };
        return groups.map(({ weekStart, items }) => {
          const allDone = items.every(challengeIsDone);
          const isPast = weekStart < currentWeekStart;
          if (items.length === 1) {
            const ch = items[0];
            const cat = catById[ch.category_id];
            return (
              <div className={`week-row${allDone ? ' done' : ''}${isPast ? ' past' : ''}`} key={ch.id}>
                {allDone && <span className="week-done-badge" aria-label="geschafft">✓</span>}
                <div>
                  <div className="wk">KW {weekNumber(ch.week_start)} · {formatWeek(ch.week_start)}</div>
                  <div className="cat">{cat?.emoji} {cat?.name}</div>
                  <div className="wk" style={{ marginTop: 4 }}>Ziel {ch.target_reps}</div>
                </div>
                {progressRows(ch)}
              </div>
            );
          }
          return (
            <div className={`week-group${allDone ? ' done' : ''}${isPast ? ' past' : ''}`} key={weekStart}>
              <div className="week-group-header">
                <span className="wgh-kw">KW {weekNumber(weekStart)}</span>
                <span className="wgh-sep">·</span>
                <span className="wgh-range">{formatWeek(weekStart)}</span>
                {allDone && <span className="week-done-badge inline" aria-label="geschafft">✓</span>}
                <span className="wgh-count">{items.length} Challenges</span>
              </div>
              {items.map((ch) => {
                const cat = catById[ch.category_id];
                return (
                  <div className="week-group-item" key={ch.id}>
                    <div>
                      <div className="cat">{cat?.emoji} {cat?.name}</div>
                      <div className="wk" style={{ marginTop: 2 }}>Ziel {ch.target_reps}</div>
                    </div>
                    {progressRows(ch)}
                  </div>
                );
              })}
            </div>
          );
        });
      })()}
      {fullscreen && (
        <ChartFullscreen
          title={cardTitle}
          series={asSeries(series)}
          cumSeries={asSeries(cumSeries)}
          totalDays={totalDays}
          range={range}
          setRange={setRange}
          cumulative={cumulative}
          setCumulative={setCumulative}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>);

}

// athletes: Liste von User-IDs (eine Seite)
function computeAthleteStats(sets, athletes, series) {
  const ids = Array.isArray(athletes) ? athletes : [athletes];
  const own = sets.filter(s => ids.includes(s.athlete));
  const total = own.reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
  const setCount = own.length;
  const avgSet = setCount ? Math.round(total / setCount) : 0;
  const maxSet = own.reduce((m, x) => Math.max(m, x.reps ?? x.duration_minutes ?? 0), 0);
  const byDay = {};
  for (const s of own) {
    const d = String(s.created_at).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + (s.reps ?? s.duration_minutes ?? 0);
  }
  const activeDays = Object.keys(byDay).length;
  const bestDay = Object.values(byDay).reduce((m, v) => Math.max(m, v), 0);
  const avgDay = series?.length ? Math.round(total / series.length) : 0;
  return { total, sets: setCount, avgSet, maxSet, activeDays, bestDay, avgDay };
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

Object.assign(window, { HomeScreen, SetupSheet, LogSheet, FeedScreen, BackfillSheet, HistoryScreen, StatsChart, FullscreenChart, ChartFullscreen, HistoryView, computeAthleteStats, EmojiPickerSheet, WeekFixCard, TomHollandSheet, BringSallySheet });