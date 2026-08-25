/* global React, Ring, Icon, Sheet, Stepper, Toast, formatRelative, formatWeek, weekNumber, todayGreeting, formatDuration */
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

function repsOnLocalDate(sets, athlete, dateStr) {
  return sets
    .filter(s => s.athlete === athlete && localDateOf(s.created_at) === dateStr)
    .reduce((sum, s) => sum + (s.reps ?? s.duration_minutes ?? 0), 0);
}

// Mo-first weekly breakdown of reps per athlete for a given set of sets.
// Future days are forced to zero so a stray future-dated set never inflates a bar.
function dailyBreakdownFor(weekStart, sets) {
  const ws = weekStart || localDateOf(PTData.mondayOf(new Date()));
  const todayIso = localDateOf(new Date());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = localDateOf(d);
    days.push({
      iso, dow: d.getDay(),
      Benny: 0, Jonas: 0,
      isFuture: iso > todayIso,
      isToday: iso === todayIso,
    });
  }
  const byIso = Object.fromEntries(days.map(d => [d.iso, d]));
  for (const s of sets) {
    const day = localDateOf(s.created_at);
    const bucket = byIso[day];
    if (bucket && !bucket.isFuture) bucket[s.athlete] += (s.reps ?? s.duration_minutes ?? 0);
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

function HomeScreen({ api, me, challenges = [], categories = [], allSets = [], layout,
  weekStart, nextWeekStart, nextWeekChallenges = [], nextWeekProposals = [],
  openClosures = [], onCloseWeek,
  onAddGoal, onEditChallenge, onLogChallenge, onQuickLog,
  // back-compat with old prop names if file got reverted
  challenge, category, sets, onSetup, onLog }) {
  // If invoked with old single-challenge API, normalize to new shape
  if (!challenges?.length && challenge) {
    challenges = [challenge];
    allSets = sets || [];
    categories = category ? [category] : categories;
    onAddGoal = onSetup; onEditChallenge = () => onSetup?.(); onLogChallenge = () => onLog?.();
  }
  const [activeTab, setActiveTab] = React.useState(
    () => sessionStorage.getItem('pt_home_tab') || 'sports'
  );
  React.useEffect(() => {
    sessionStorage.setItem('pt_home_tab', activeTab);
    if (scrollerRef.current) {
      scrollerRef.current.scrollTo({ left: 0, behavior: 'instant' });
    }
    setActiveIdx(0);
  }, [activeTab]);
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
    return (cat?.kind || 'sports') === activeTab;
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

  return (
    <>
      <div className="work-tab-toggle">
        <button
          className={`work-tab-btn ${activeTab === 'sports' ? 'active' : ''}`}
          onClick={() => setActiveTab('sports')}>
          🏋️ Sports
        </button>
        <button
          className={`work-tab-btn ${activeTab === 'work' ? 'active' : ''}`}
          onClick={() => setActiveTab('work')}>
          💻 Work
        </button>
      </div>
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
        const chDailyBreakdown = dailyBreakdownFor(ch.week_start, csets);
        const total = totalsByChallenge.get(ch.id) ?? 0;
        const isWorkCh = cat?.kind === 'work';
        const sumVal = (s) => isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
        const bennyDone = csets.filter(s => s.athlete === 'Benny').reduce((a,x)=>a+sumVal(x), 0);
        const jonasDone = csets.filter(s => s.athlete === 'Jonas').reduce((a,x)=>a+sumVal(x), 0);
        const fmtVal = (v) => isWorkCh ? formatDuration(v) : v;
        const pct = Math.min(1, total / ch.target_reps);
        const pctInt = Math.round(pct * 100);
        const remaining = Math.max(0, ch.target_reps - total);
        const fairShare = Math.ceil(ch.target_reps / 2);
        const todayStr = localDateOf(new Date());
        const dayIdx = dayIndexInWeek(ch.week_start);
        const dailyTarget = Math.ceil(fairShare / 7);
        const expectedByEod = Math.ceil(fairShare * dayIdx / 7);

        const bennyToday = repsOnLocalDate(csets, 'Benny', todayStr);
        const bennyTrackDelta = bennyDone - expectedByEod;

        const jonasToday = repsOnLocalDate(csets, 'Jonas', todayStr);
        const jonasTrackDelta = jonasDone - expectedByEod;

        // Active user goes left in comparisons.
        const leftA  = me === 'Jonas' ? 'Jonas' : 'Benny';
        const rightA = leftA === 'Benny' ? 'Jonas' : 'Benny';
        const stats = {
          Benny: { done: bennyDone, today: bennyToday, trackDelta: bennyTrackDelta },
          Jonas: { done: jonasDone, today: jonasToday, trackDelta: jonasTrackDelta },
        };
        const widths = {
          Benny: Math.min(100, (bennyDone/ch.target_reps)*100),
          Jonas: Math.min(100, (jonasDone/ch.target_reps)*100),
        };
        const tugSide = (athlete, isRight) => {
          const cls = athlete.toLowerCase();
          const s = stats[athlete];
          return (
            <div className={`tug-side ${cls}${isRight ? ' is-right' : ''}`}>
              <div className="tug-who">
                {isRight
                  ? <>{athlete}<img src={`uploads/${cls}.jpg`} alt={athlete} className="tug-avatar"/></>
                  : <><img src={`uploads/${cls}.jpg`} alt={athlete} className="tug-avatar"/>{athlete}</>}
              </div>
              <div className="tug-reps mono">{fmtVal(s.done)}</div>
              <DailyStatus variant="tug" done={s.done} fairShare={fairShare}
                dailyTarget={dailyTarget} todayReps={s.today} trackDelta={s.trackDelta}/>
            </div>
          );
        };
        const splitCell = (athlete) => {
          const cls = athlete.toLowerCase();
          const s = stats[athlete];
          return (
            <div className={`split-cell ${cls}`}>
              <div className="who"><img src={`uploads/${cls}.jpg`} alt={athlete} className="cell-avatar"/>{athlete}</div>
              <div className="v mono">{fmtVal(s.done)}<span className="owe-of"> / {fmtVal(fairShare)}</span></div>
              <DailyStatus variant="cell" done={s.done} fairShare={fairShare}
                dailyTarget={dailyTarget} todayReps={s.today} trackDelta={s.trackDelta}/>
            </div>
          );
        };
        return (
          <div key={ch.id} className="challenge-slide"><div className={`hero-card ${celebration.getPersistentStyle(ch) ? 'pm-' + celebration.getPersistentStyle(ch) : ''}`}>
            <SparkleLayer active={celebration.getPersistentStyle(ch) === 'sparkle'} />
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:20,fontWeight:700,letterSpacing:'-0.03em'}}>
                  <span style={{marginRight:8}}>{cat?.emoji}</span>{cat?.name}
                </div>
                <div className="subtitle" style={{marginTop:2,fontSize:13,fontWeight:500}}>Gewählt von {ch.chosen_by}</div>
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
                  <div>
                    <div className="pm-trophy-stat-v">{fmtVal(stats[leftA].done)}</div>
                    <div className="pm-trophy-stat-l">{leftA}</div>
                  </div>
                  <div>
                    <div className="pm-trophy-stat-v">{fmtVal(stats[rightA].done)}</div>
                    <div className="pm-trophy-stat-l">{rightA}</div>
                  </div>
                </div>
              </div>
            ) : (<>
              {layout==='rings' && (
                <div className={`tug-section${bennyDone > jonasDone ? ' lead-benny' : jonasDone > bennyDone ? ' lead-jonas' : ''}`}>
                  <div className="tug-labels">
                    {tugSide(leftA, false)}
                    <div className="tug-side team">
                      <div className="tug-who">Gesamt</div>
                      <div className="tug-reps mono">{fmtVal(total)}</div>
                      <div className={`tug-foot mono ${remaining===0?'done':''}`}>{remaining===0?'✓ erledigt':`noch ${fmtVal(remaining)}`}</div>
                    </div>
                    {tugSide(rightA, true)}
                  </div>
                  {(() => {
                    let lW = widths[leftA];
                    let rW = widths[rightA];
                    if (lW + rW > 100) { const s = 100 / (lW + rW); lW *= s; rW *= s; }
                    const teamRemaining = Math.max(0, ch.target_reps - total);
                    return (
                      <>
                        <div className="tug-bar opposing">
                          <div className={`tug-fill ${leftA.toLowerCase()}`} style={{width:`${lW}%`}}/>
                          <div className={`tug-fill ${rightA.toLowerCase()} from-right`} style={{width:`${rW}%`}}/>
                        </div>
                        <div className="tug-summary mono">
                          {teamRemaining===0 ? (
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
                {splitCell(leftA)}
                {splitCell(rightA)}
              </div>}
            </>)}
            <QuickLogRow me={me} catId={ch.category_id} onQuick={(v) => onQuickLog?.(ch, v)} onLog={() => onLogChallenge(ch)} />
          </div>
          {(() => {
            const maxV = Math.max(1, ...chDailyBreakdown.flatMap(d => [d.Benny, d.Jonas]));
            return (
              <div className="daily-breakdown">
                <div className="db-header">
                  <span className="db-eyebrow">Diese Woche · pro Tag</span>
                </div>
                <div className="db-grid">
                  {chDailyBreakdown.map(d => {
                    const bH = d.Benny ? Math.max(6, (d.Benny / maxV) * 38) : 0;
                    const jH = d.Jonas ? Math.max(6, (d.Jonas / maxV) * 38) : 0;
                    return (
                      <div key={d.iso} className={`db-day${d.isToday ? ' today' : ''}${d.isFuture ? ' future' : ''}`}>
                        <div className="db-bars">
                          <div className="db-bar benny" style={{height: `${bH}px`}} title={`Benny: ${d.Benny}`} />
                          <div className="db-bar jonas" style={{height: `${jH}px`}} title={`Jonas: ${d.Jonas}`} />
                        </div>
                        <div className="db-values">
                          <div className="db-val benny mono">{d.isFuture ? '—' : d.Benny}</div>
                          <div className="db-val jonas mono">{d.isFuture ? '—' : d.Jonas}</div>
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
                    <div className="nwp-picker">{isConfirmed && ch.chosen_by ? `von ${ch.chosen_by}` : 'noch offen'}</div>
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
function _HomeScreenOld_unused({ api, me, challenge, category, sets, layout, onSetup, onLog, onSwitchUser }) {
  const total = (sets||[]).reduce((s, x) => s + x.reps, 0);
  const bennyDone = sets.filter((s) => s.athlete === 'Benny').reduce((s, x) => s + x.reps, 0);
  const jonasDone = sets.filter((s) => s.athlete === 'Jonas').reduce((s, x) => s + x.reps, 0);
  const pct = challenge ? Math.min(1, total / challenge.target_reps) : 0;
  const pctInt = Math.round(pct * 100);
  const remaining = challenge ? Math.max(0, challenge.target_reps - total) : 0;
  const fairShare = challenge ? Math.ceil(challenge.target_reps / 2) : 0;
  const bennyOwed = Math.max(0, fairShare - bennyDone);
  const jonasOwed = Math.max(0, fairShare - jonasDone);

  if (!challenge) {
    return (
      <div className="empty">
        <div className="emoji">🏁</div>
        <div className="title">Diese Woche ist offen</div>
        <div style={{ marginBottom: 24 }}>Wer legt Kategorie & Ziel fest?</div>
        <button className="btn" onClick={onSetup}>Woche starten</button>
      </div>);

  }

  return (
    <div className={`layout-${layout}`}>
      <div className="hero-card" style={{ borderRadius: "14px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div className="label">Diese Woche</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 2 }}>
              <span style={{ marginRight: 8 }}>{category?.emoji}</span>{category?.name}
            </div>
            <div className="subtitle" style={{ marginTop: 2, fontSize: 15, fontWeight: 500 }}>
              Gewählt von {challenge.chosen_by}
            </div>
          </div>
          <button className="btn-ghost" style={{ padding: '6px 0' }} onClick={onSetup}>Ändern</button>
        </div>

        {layout === 'rings' &&
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Ring pct={pct} size={220} stroke={22}>
              <div className="display mono" style={{ fontSize: 56, lineHeight: 1 }}>{pctInt}%</div>
              <div className="subtitle mono" style={{ marginTop: 4, fontSize: 15 }}>{total} / {challenge.target_reps}</div>
            </Ring>
          </div>
        }

        {layout === 'bar' &&
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
              <div className="display mono" style={{ fontSize: 56, lineHeight: 1 }}>{pctInt}%</div>
              <div className="subtitle mono">{total} / {challenge.target_reps}</div>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="subtitle" style={{ fontSize: 15, fontWeight: 500 }}>
              {remaining > 0 ? `Noch ${remaining} Reps` : '🎉 Ziel erreicht!'}
            </div>
          </>
        }

        {layout === 'numeric' &&
        <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div className="big-number mono">{pctInt}%</div>
            <div className="of mono">{total} / {challenge.target_reps} Reps</div>
            <div style={{ marginTop: 10, fontSize: 15, color: 'var(--text-2)' }}>
              {remaining > 0 ? `Noch ${remaining} bis zum Wochenziel` : '🎉 Ziel erreicht'}
            </div>
          </div>
        }

        <div className="split-row">
          <div className="split-cell benny">
            <div className="who">Benny</div>
            <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
            <div className={`owe mono ${bennyOwed === 0 ? 'done' : ''}`}>
              {bennyOwed === 0 ? '✓ erledigt' : `noch ${bennyOwed}`}
            </div>
          </div>
          <div className="split-cell jonas">
            <div className="who">Jonas</div>
            <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
            <div className={`owe mono ${jonasOwed === 0 ? 'done' : ''}`}>
              {jonasOwed === 0 ? '✓ erledigt' : `noch ${jonasOwed}`}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: "14px 0px", borderRadius: "1px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Deine Sätze diese Woche</div>
          <div className="conn-pill">{sets.filter((s) => s.athlete === me).length} Sätze</div>
        </div>
        {sets.filter((s) => s.athlete === me).length === 0 ?
        <div style={{ color: 'var(--text-2)', fontSize: 15, padding: '10px 0' }}>
            Noch nichts geloggt. Tipp unten auf „Satz loggen".
          </div> :

        sets.filter((s) => s.athlete === me).slice(0, 5).map((s) =>
        <div className="list-item" key={s.id}>
              <div className="left">
                <div className="display mono" style={{ fontSize: 20, color: 'var(--accent)', minWidth: 50 }}>+{s.reps}</div>
                <div>
                  <div className="what">{s.note || 'Satz'}</div>
                  <div className="when">{formatRelative(s.created_at)}</div>
                </div>
              </div>
              <button className="del-btn" onClick={() => api.deleteSet(s.id)}>✕</button>
            </div>
        )
        }
      </div>
    </div>);

}

// ─── SETUP WEEK ─────────────────────────────────────────────────────────────
function SetupSheet({ api, me, categories, weekStart, existing, onClose, onSaved, onDeleted, onAddCategory }) {
  const [catId, setCatId] = useState(existing?.category_id || categories[0]?.id || '');
  const [target, setTarget] = useState(existing?.target_reps || 100);
  const [chosenBy, setChosenBy] = useState(existing?.chosen_by || me);
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

      <div className="label" style={{ marginBottom: 8 }}>Wer hat gewählt?</div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        {['Benny', 'Jonas'].map((n) =>
        <button key={n} className={chosenBy === n ? 'active' : ''} onClick={() => setChosenBy(n)}>
            {n}
          </button>
        )}
      </div>

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
                  <button className="cat-edit" aria-label="Bearbeiten"
                    onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                    ✎
                  </button>
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
                      <button className="cat-edit" aria-label="Bearbeiten"
                        onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                        ✎
                      </button>
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
          <div className="segmented" style={{ flexShrink: 0 }}>
            <button className={newCatKind === 'sports' ? 'active' : ''} onClick={() => setNewCatKind('sports')}>🏋️</button>
            <button className={newCatKind === 'work'   ? 'active' : ''} onClick={() => setNewCatKind('work')}>💻</button>
          </div>
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
          <Stepper value={target} onChange={setTarget} step={target < 50 ? 5 : target < 200 ? 10 : 25} />
          <div className="chip-row" style={{ justifyContent: 'center' }}>
            {[50, 100, 200, 500].map((v) =>
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
          {category?.emoji} {category?.name} · {me}
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
        {category?.emoji} {category?.name} · {me}
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

// ─── FEED ────────────────────────────────────────────────────────────────────
function WeekRecap({ recap, me }) {
  const { week_start, challStats, bennyTotal, jonasTotal, winner, diff, sumAll, hitCount, totalChallenges, analysis, bennyByCat = [], jonasByCat = [], bennySetCount = 0, jonasSetCount = 0, bennyMaxSet = 0, jonasMaxSet = 0, weekNumber, bennyPenCents = 0, jonasPenCents = 0 } = recap;
  const isWorkWeek = challStats.length > 0 && challStats.every(c => c.cat?.kind === 'work');
  const unit = isWorkWeek ? 'min' : 'Reps';
  const fmtRecapVal = (v) => isWorkWeek ? formatDuration(v) : v;
  const penCents = { Benny: bennyPenCents, Jonas: jonasPenCents };
  const formatEuroCents = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  const leftA  = me === 'Jonas' ? 'Jonas' : 'Benny';
  const rightA = leftA === 'Benny' ? 'Jonas' : 'Benny';
  const tallyTotals = { Benny: bennyTotal, Jonas: jonasTotal };
  const recapTallySide = (athlete, isRight) => {
    const cls = athlete.toLowerCase();
    return (
      <div className={`recap-tally-side ${cls}${isRight ? ' is-right' : ''} ${winner === athlete ? 'win' : ''}`}>
        <div className="recap-tally-who">
          {isRight
            ? <>{athlete}<img src={`uploads/${cls}.jpg`} alt={athlete} className="cell-avatar"/></>
            : <><img src={`uploads/${cls}.jpg`} alt={athlete} className="cell-avatar"/>{athlete}</>}
        </div>
        <div className="recap-tally-v mono">{fmtRecapVal(tallyTotals[athlete])}</div>
      </div>
    );
  };
  const monday = new Date(week_start + 'T00:00:00');
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmtD = (d) => `${d.getDate()}.${d.getMonth()+1}.`;
  const winnerCls = winner ? winner.toLowerCase() : 'tie';
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
  return (
    <div className={`recap-card recap-${winnerCls}`}>
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
              <img src={`uploads/${winner.toLowerCase()}.jpg`} alt={winner} className="recap-winner-avatar"/>
              <span className="recap-winner-crown">👑</span>
            </div>
            <div className={`recap-winner-name ${winnerCls}`}>{winner}</div>
            <div className="recap-winner-sub">gewinnt die Woche</div>
          </>
        ) : (
          <>
            <div className="recap-trophy">🤝</div>
            <div className="recap-winner-name tie">Unentschieden</div>
            <div className="recap-winner-sub">{fmtRecapVal(sumAll)} {unit} · beide gleichauf</div>
          </>
        )}
      </div>
      <div className="recap-tally">
        {recapTallySide(leftA, false)}
        <div className="recap-tally-vs">vs</div>
        {recapTallySide(rightA, true)}
      </div>
      <div className="recap-challs">
        {challStats.map((c, i) => (
          <div className="recap-chall" key={i}>
            <span className="recap-chall-emoji">{c.cat?.emoji}</span>
            <span className="recap-chall-name">{c.cat?.name || '—'}</span>
            <span className="recap-chall-tally mono">
              <span style={{color:'var(--accent)'}}>{fmtRecapVal(c.bennyDone)}</span>
              {' · '}
              <span style={{color:'var(--accent-3)'}}>{fmtRecapVal(c.jonasDone)}</span>
              {' / '}{fmtRecapVal(c.ch.target_reps)}
            </span>
            <span className={`recap-chall-badge ${c.hit?'hit':'miss'}`}>{c.hit?'✓':(c.bennyHit||c.jonasHit?'½':'🚧')}</span>
          </div>
        ))}
      </div>
      <div className="recap-athlete-stats">
        <div className="recap-athlete-line">
          <img src="uploads/benny.jpg" alt="Benny" className="recap-athlete-mini-avatar"/>
          <div className="recap-athlete-stats-text">
            <div>
              {bennyByCat.length === 0 ? '— keine Reps —' : bennyByCat.map((x, i) => (
                <span key={i}>{i > 0 && ' · '}<span className="mono">{x.reps}</span> {x.name}</span>
              ))}
            </div>
            {bennySetCount > 0 && (
              <div className="recap-athlete-meta">
                in <span className="mono">{bennySetCount}</span> {bennySetCount === 1 ? 'Satz' : 'Sätzen'} · größter <span className="mono">+{bennyMaxSet}</span>
              </div>
            )}
          </div>
        </div>
        <div className="recap-athlete-line">
          <img src="uploads/jonas.jpg" alt="Jonas" className="recap-athlete-mini-avatar"/>
          <div className="recap-athlete-stats-text">
            <div>
              {jonasByCat.length === 0 ? '— keine Reps —' : jonasByCat.map((x, i) => (
                <span key={i}>{i > 0 && ' · '}<span className="mono">{x.reps}</span> {x.name}</span>
              ))}
            </div>
            {jonasSetCount > 0 && (
              <div className="recap-athlete-meta">
                in <span className="mono">{jonasSetCount}</span> {jonasSetCount === 1 ? 'Satz' : 'Sätzen'} · größter <span className="mono">+{jonasMaxSet}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="recap-analysis">{analysis}</div>
      {(bennyPenCents > 0 || jonasPenCents > 0) && (
        <div className="recap-penalties">
          <div className="recap-penalties-label">Neue Schulden</div>
          <div className="recap-penalties-row">
            <span className={`b ${penCents[leftA] > 0 ? 'has' : ''}`}>
              {leftA} {penCents[leftA] > 0 ? `–${formatEuroCents(penCents[leftA])}` : '✓'}
            </span>
            <span className={`j ${penCents[rightA] > 0 ? 'has' : ''}`}>
              {rightA} {penCents[rightA] > 0 ? `–${formatEuroCents(penCents[rightA])}` : '✓'}
            </span>
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

function FeedScreen({ feed, me, categories = [], projectTags = [], toolTags = [], onEditSet, onDeleteSet, onToggleReaction, onPickEmoji, onBackfill }) {
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
        if (s.kind === 'recap') return <WeekRecap key={s.id} recap={s} me={me} />;
        const mine = !me || s.athlete === me;
        const editing = editId === s.id;
        const trackingNum = trackingNumById[s.id];
        const isToday = s.created_at && localDateOf(s.created_at) === localDateOf(new Date());
        const fireTier = trackingNum >= 15 ? 3 : trackingNum >= 10 ? 2 : trackingNum >= 5 ? 1 : 0;
        const flames = fireTier === 0 ? '' : fireTier === 1 ? '🔥' : `${fireTier}x 🔥`;
        const isNew = !!me && s.athlete !== me && lastSeen && String(s.created_at) > lastSeen;
        return (
        <div className={`feed-item fire-${fireTier} ${editing?'editing':''} ${isNew ? 'is-new' : ''}`} key={s.id}>
          <div className={`feed-avatar ${s.athlete.toLowerCase()}`}><img src={`uploads/${s.athlete.toLowerCase()}.jpg`} alt={s.athlete} className="avatar-img"/></div>
          <div className="feed-content">
            <div className="feed-title">
              <strong>{s.athlete}</strong> · {s.category?.name || '—'}
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
            <div className={`feed-reps ${s.athlete.toLowerCase()} mono`}>
              <div className="feed-reps-val">
                {s.duration_minutes != null ? formatDuration(s.duration_minutes) : `+${s.reps}`}
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
function StatsChart({ benny, jonas, days, accent, accent3 }) {
  // benny/jonas: array of {date: 'YYYY-MM-DD', reps: number} length == days
  const W = 320, H = 140, PAD_X = 28, PAD_Y = 18;
  const maxV = Math.max(1, ...benny.map(d => d.reps), ...jonas.map(d => d.reps));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // x labels — 4-5 evenly spaced
  const labelIdx = days <= 7 ? benny.map((_, i) => i) : [0, Math.floor(days/4), Math.floor(days/2), Math.floor(3*days/4), days - 1];
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth()+1}`; };

  // Week boundaries — Mondays within the range
  const weekMarks = [];
  for (let i = 0; i < benny.length; i++) {
    const d = new Date(benny[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(benny[i].date) });
  }
  const showWeekLabels = weekMarks.length <= 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stats-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-benny" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="grad-jonas" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent3} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent3} stopOpacity="0"/>
        </linearGradient>
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
      <path d={areaFor(benny)} fill="url(#grad-benny)"/>
      <path d={areaFor(jonas)} fill="url(#grad-jonas)"/>
      <path d={pathFor(benny)} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={pathFor(jonas)} fill="none" stroke={accent3} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {labelIdx.map(i => benny[i] && (
        <text key={i} x={xPos(i)} y={H - 4} fill="var(--text-2)" fontSize="9" textAnchor="middle">{fmt(benny[i].date)}</text>
      ))}
      <text x={PAD_X - 4} y={yScale(maxV) + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">{maxV}</text>
      <text x={PAD_X - 4} y={H - PAD_Y + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">0</text>
    </svg>
  );
}

// Shared between FullscreenChart and ChartFullscreen's scrubber math.
// Changing this value updates both the rendered chart and the touch-to-data-index mapping.
const FULLSCREEN_PAD_X = 44;

function FullscreenChart({ benny, jonas, days, accent, accent3, activeIdx, vw, vh }) {
  // Viewport-driven sizing. vw/vh are the body container's pixel size.
  const W = Math.max(300, vw);
  const H = Math.max(200, vh);
  const PAD_X = FULLSCREEN_PAD_X;
  const PAD_Y = 32;
  const maxV = Math.max(1, ...benny.map(d => d.reps), ...jonas.map(d => d.reps));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // X labels — more of them than the inline chart (we have space)
  const labelCount = days <= 7 ? days : days <= 30 ? 7 : 9;
  const labelIdx = days <= 7
    ? benny.map((_, i) => i)
    : Array.from({ length: labelCount }, (_, k) => Math.round((k * (days - 1)) / (labelCount - 1)));
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth() + 1}`; };

  // Y labels — 5 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxV));

  // Week boundaries — Mondays within the range
  const weekMarks = [];
  for (let i = 0; i < benny.length; i++) {
    const d = new Date(benny[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(benny[i].date) });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-benny-fs" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="grad-jonas-fs" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent3} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent3} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {gridLines.map((y, i) => <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
      {weekMarks.map(({idx, kw}) => (
        <g key={`wk${idx}`}>
          <line className="chart-week-line" x1={xPos(idx)} x2={xPos(idx)} y1={PAD_Y * 0.7} y2={H - PAD_Y}/>
          <text x={xPos(idx)} y={PAD_Y * 0.6} fill="var(--text-2)" fontSize="10" textAnchor="middle" opacity="0.8">KW {kw}</text>
        </g>
      ))}
      <path d={areaFor(benny)} fill="url(#grad-benny-fs)"/>
      <path d={areaFor(jonas)} fill="url(#grad-jonas-fs)"/>
      <path d={pathFor(benny)} fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={pathFor(jonas)} fill="none" stroke={accent3} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      {labelIdx.map(i => benny[i] && (
        <text key={`x${i}`} x={xPos(i)} y={H - 8} fill="var(--text-2)" fontSize="11" textAnchor="middle">{fmt(benny[i].date)}</text>
      ))}
      {yTicks.map((v, i) => (
        <text key={`y${i}`} x={PAD_X - 8} y={yScale(v) + 4} fill="var(--text-2)" fontSize="11" textAnchor="end">{v}</text>
      ))}
      {activeIdx !== null && activeIdx >= 0 && activeIdx < benny.length && (
        <g>
          <line
            className="chart-scrubber-line"
            x1={xPos(activeIdx)} x2={xPos(activeIdx)}
            y1={PAD_Y * 0.5} y2={H - PAD_Y * 0.6}
          />
          <circle
            className="chart-scrubber-dot"
            cx={xPos(activeIdx)} cy={yScale(benny[activeIdx].reps)}
            r="5" fill={accent}
          />
          <circle
            className="chart-scrubber-dot"
            cx={xPos(activeIdx)} cy={yScale(jonas[activeIdx].reps)}
            r="5" fill={accent3}
          />
        </g>
      )}
    </svg>
  );
}

function ChartFullscreen({
  bennySeries, jonasSeries, bennyCumSeries, jonasCumSeries, totalDays,
  range, setRange,
  cumulative, setCumulative,
  accent, accent3,
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
  const benny = cumulative ? bennyCumSeries : bennySeries;
  const jonas = cumulative ? jonasCumSeries : jonasSeries;

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
        <div className="chart-fs-title">Benny vs. Jonas</div>
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
          benny={benny}
          jonas={jonas}
          days={totalDays}
          accent={accent}
          accent3={accent3}
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
            <span className="chart-fs-date">{fmtDate(benny[activeIdx].date)}</span>
            <span className="chart-fs-val benny">Benny: <b>{benny[activeIdx].reps}</b></span>
            <span className="chart-fs-val jonas">Jonas: <b>{jonas[activeIdx].reps}</b></span>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryScreen({ challenges, categories, allSets }) {
  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const setsByCh = useMemo(() => {
    const m = {};
    for (const s of allSets) {
      (m[s.challenge_id] ||= []).push(s);
    }
    return m;
  }, [allSets]);

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
    for (const x of allSets) days.add(localDay(new Date(x.created_at)));
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
    let s = 0;
    while (days.has(localDay(cursor))) {
      s++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return s;
  }, [allSets]);

  const totalReps = allSets.reduce((s, x) => s + (x.reps ?? x.duration_minutes ?? 0), 0);
  // Wochen: jede Kalenderwoche zählt, in der mindestens ein Satz geloggt wurde
  // (unabhängig davon, ob das Wochenziel erreicht wurde).
  const weeksDone = new Set(
    challenges
      .filter(ch => (setsByCh[ch.id] || []).length > 0)
      .map(ch => ch.week_start)
  ).size;

  if (challenges.length === 0) {
    return <div className="empty">
      <div className="emoji">📅</div>
      <div className="title">Noch keine Historie</div>
      <div>Starte deine erste Wochen-Challenge.</div>
    </div>;
  }

  return <HistoryView {...{challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone}} />;
}

function HistoryView({ challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone }) {
  const [range, setRange] = useState('30'); // '7', '30', 'all'
  const [selectedCats, setSelectedCats] = useState([]); // [] = alle
  const [cumulative, setCumulative] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  // Resolve accent colors from CSS vars (read at render time)
  const [accentColors, setAccentColors] = useState({ accent: '#30D158', accent3: '#FFD60A' });
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    setAccentColors({
      accent: s.getPropertyValue('--accent').trim() || '#30D158',
      accent3: s.getPropertyValue('--accent-3').trim() || '#FFD60A',
    });
  }, []);

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

  // Compute date-range buckets (per day, per athlete)
  const { bennySeries, jonasSeries, bennyCumSeries, jonasCumSeries, rangeStart, totalDays } = useMemo(() => {
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
    const bennyArr = [], jonasArr = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = PTData.isoDate(d);
      bennyArr.push({ date: iso, reps: 0 });
      jonasArr.push({ date: iso, reps: 0 });
    }
    for (const s of filteredSets) {
      const day = PTData.isoDate(new Date(s.created_at));
      const i = Math.round((new Date(day + 'T00:00:00') - start) / 86400000);
      if (i < 0 || i >= total) continue;
      const arr = s.athlete === 'Benny' ? bennyArr : jonasArr;
      arr[i].reps += (s.reps ?? s.duration_minutes ?? 0);
    }
    // Cumulative variants (running sum within the range)
    let bennyAcc = 0, jonasAcc = 0;
    const bennyCumArr = bennyArr.map(d => ({ date: d.date, reps: (bennyAcc += d.reps) }));
    const jonasCumArr = jonasArr.map(d => ({ date: d.date, reps: (jonasAcc += d.reps) }));
    return { bennySeries: bennyArr, jonasSeries: jonasArr, bennyCumSeries: bennyCumArr, jonasCumSeries: jonasCumArr, rangeStart: start, totalDays: total };
  }, [filteredSets, days, range]);

  // Range-scoped sets (apply both range + category filter)
  const setsInRange = useMemo(() => {
    return filteredSets.filter(s => new Date(String(s.created_at).slice(0,10)) >= rangeStart);
  }, [filteredSets, rangeStart]);

  const bennyStats = useMemo(() => computeAthleteStats(setsInRange, 'Benny', bennySeries), [setsInRange, bennySeries]);
  const jonasStats = useMemo(() => computeAthleteStats(setsInRange, 'Jonas', jonasSeries), [setsInRange, jonasSeries]);

  // ⌀ Sätze bis Ziel: for each challenge where an athlete reached the target,
  // count the sets they needed to first hit target_reps. Respect category filter.
  const setsToTarget = useMemo(() => {
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    const acc = { Benny: { totalSets: 0, hits: 0 }, Jonas: { totalSets: 0, hits: 0 } };
    for (const ch of challenges) {
      if (catSet && !catSet.has(ch.category_id)) continue;
      for (const athlete of ['Benny', 'Jonas']) {
        const own = allSets
          .filter(s => s.challenge_id === ch.id && s.athlete === athlete)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        let sum = 0;
        for (let i = 0; i < own.length; i++) {
          sum += (own[i].reps ?? own[i].duration_minutes ?? 0);
          if (sum >= ch.target_reps) {
            acc[athlete].totalSets += i + 1;
            acc[athlete].hits += 1;
            break;
          }
        }
      }
    }
    const avg = (a) => a.hits ? Math.round((a.totalSets / a.hits) * 10) / 10 : 0;
    return {
      benny: avg(acc.Benny),
      jonas: avg(acc.Jonas),
      bennyHits: acc.Benny.hits,
      jonasHits: acc.Jonas.hits,
    };
  }, [challenges, allSets, selectedCats]);
  const maxReps = Math.max(bennyStats.total, jonasStats.total, 1);
  const leader = bennyStats.total > jonasStats.total ? 'Benny' : jonasStats.total > bennyStats.total ? 'Jonas' : null;
  const diff = Math.abs(bennyStats.total - jonasStats.total);

  // Momentum: who's gaining in the last 7 days?
  // Only meaningful when the range is ≥ 2 weeks — otherwise "last 7" ≈ "all" and the line just repeats the headline.
  const momentum = useMemo(() => {
    if (!leader || totalDays < 14) return null;
    const W = 7;
    const rB = bennySeries.slice(-W).reduce((a, x) => a + x.reps, 0);
    const rJ = jonasSeries.slice(-W).reduce((a, x) => a + x.reps, 0);
    if (rB === rJ) return null;
    const recentLeader = rB > rJ ? 'Benny' : 'Jonas';
    const gap = Math.abs(rB - rJ);
    const isCatchingUp = recentLeader !== leader;
    const daysToOvertake = isCatchingUp && gap >= 5 && (diff / gap) <= 8
      ? Math.max(0.1, Math.round((diff / gap) * 7 * 10) / 10)
      : null;
    return { who: recentLeader, gap, isCatchingUp, daysToOvertake };
  }, [bennySeries, jonasSeries, totalDays, leader, diff]);

  // All-time lead history: who currently leads overall, since when, and weekly tally.
  // Uses filteredSets (category filter applied) but ignores the range selector — these are
  // historical aggregates, not range-scoped views.
  const leadHistory = useMemo(() => {
    if (!filteredSets.length) return null;
    const dayMap = new Map();
    for (const s of filteredSets) {
      const day = String(s.created_at).slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, { Benny: 0, Jonas: 0 });
      dayMap.get(day)[s.athlete] += (s.reps ?? s.duration_minutes ?? 0);
    }
    const days = Array.from(dayMap.keys()).sort();
    let cumB = 0, cumJ = 0;
    let currentLeader = null;
    let leaderSinceDate = null;
    for (const day of days) {
      const dd = dayMap.get(day);
      cumB += dd.Benny;
      cumJ += dd.Jonas;
      const todayLeader = cumB > cumJ ? 'Benny' : cumJ > cumB ? 'Jonas' : null;
      if (todayLeader !== currentLeader) {
        currentLeader = todayLeader;
        leaderSinceDate = day;
      }
    }
    if (!currentLeader) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since = new Date(leaderSinceDate);
    const daysSince = Math.max(1, Math.round((today - since) / 86400000) + 1);
    return { leader: currentLeader, sinceDate: leaderSinceDate, daysSince };
  }, [filteredSets]);

  // Per-week win tally: for each completed calendar week, who had more reps in
  // that week's challenges? Skips the current (in-progress) week and applies the
  // category filter via selectedCats.
  const weeklyTally = useMemo(() => {
    const byWeek = new Map();
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    for (const ch of challenges) {
      if (catSet && !catSet.has(ch.category_id)) continue;
      const wk = ch.week_start;
      if (!byWeek.has(wk)) byWeek.set(wk, { Benny: 0, Jonas: 0 });
      const sets = setsByCh[ch.id] || [];
      for (const s of sets) byWeek.get(wk)[s.athlete] += (s.reps ?? s.duration_minutes ?? 0);
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let bennyWins = 0, jonasWins = 0, ties = 0;
    for (const [wkStart, t] of byWeek) {
      const wEnd = new Date(wkStart); wEnd.setHours(0, 0, 0, 0); wEnd.setDate(wEnd.getDate() + 6);
      if (wEnd >= today) continue; // skip current/future week
      if (t.Benny === 0 && t.Jonas === 0) continue; // no activity
      if (t.Benny > t.Jonas) bennyWins++;
      else if (t.Jonas > t.Benny) jonasWins++;
      else ties++;
    }
    return { bennyWins, jonasWins, ties };
  }, [challenges, setsByCh, selectedCats]);

  const fmtDateShort = (iso) => {
    const d = new Date(iso);
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('de-DE', opts);
  };

  // Per-category breakdown in range
  const perCat = useMemo(() => {
    const m = {};
    for (const s of setsInRange) {
      const ch = challenges.find(c => c.id === s.challenge_id);
      if (!ch) continue;
      m[ch.category_id] ||= { Benny: 0, Jonas: 0 };
      m[ch.category_id][s.athlete] = (m[ch.category_id][s.athlete] || 0) + s.reps;
    }
    return Object.entries(m)
      .map(([cid, v]) => ({ cat: catById[cid], ...v, total: v.Benny + v.Jonas }))
      .sort((a,b) => b.total - a.total);
  }, [setsInRange, challenges, catById]);

  // Hall of Fame: all-time records. Respects category filter, ignores date range.
  // Each medal goes to a single winner; ties yield no medal.
  const hallOfFame = useMemo(() => {
    const catSet = selectedCats.length ? new Set(selectedCats) : null;
    const chMap = new Map(challenges.map(c => [c.id, c]));
    const relevant = allSets.filter(s => {
      const ch = chMap.get(s.challenge_id);
      return ch && (!catSet || catSet.has(ch.category_id));
    });
    const maxSet = { Benny: 0, Jonas: 0 };
    const byDay = { Benny: {}, Jonas: {} };
    for (const s of relevant) {
      if (s.reps > maxSet[s.athlete]) maxSet[s.athlete] = s.reps;
      const d = PTData.isoDate(new Date(s.created_at));
      byDay[s.athlete][d] = (byDay[s.athlete][d] || 0) + s.reps;
    }
    const bestDay = { Benny: 0, Jonas: 0 };
    const longestStreak = { Benny: 0, Jonas: 0 };
    for (const a of ['Benny', 'Jonas']) {
      const days = Object.keys(byDay[a]).sort();
      let cur = 0, best = 0, prev = null;
      for (const d of days) {
        if (byDay[a][d] > bestDay[a]) bestDay[a] = byDay[a][d];
        const dt = new Date(d + 'T00:00:00');
        if (prev && Math.round((dt - prev) / 86400000) === 1) cur++; else cur = 1;
        if (cur > best) best = cur;
        prev = dt;
      }
      longestStreak[a] = best;
    }
    const perCatAll = {};
    for (const s of relevant) {
      const ch = chMap.get(s.challenge_id);
      perCatAll[ch.category_id] ||= { Benny: 0, Jonas: 0 };
      perCatAll[ch.category_id][s.athlete] += (s.reps ?? s.duration_minutes ?? 0);
    }
    const catWins = { Benny: 0, Jonas: 0 };
    for (const v of Object.values(perCatAll)) {
      if (v.Benny > v.Jonas) catWins.Benny++;
      else if (v.Jonas > v.Benny) catWins.Jonas++;
    }
    const medals = [];
    const push = (m) => medals.push(m);
    if (leadHistory) push({
      key: 'lead', icon: '👑', title: 'Aktueller Anführer', tier: 'gold',
      winner: leadHistory.leader,
      value: `${leadHistory.daysSince} ${leadHistory.daysSince === 1 ? 'Tag' : 'Tage'}`,
      sub: `seit ${fmtDateShort(leadHistory.sinceDate)}`,
    });
    if (weeklyTally.bennyWins !== weeklyTally.jonasWins && (weeklyTally.bennyWins || weeklyTally.jonasWins)) {
      const w = weeklyTally.bennyWins > weeklyTally.jonasWins ? 'Benny' : 'Jonas';
      const loser = w === 'Benny' ? weeklyTally.jonasWins : weeklyTally.bennyWins;
      push({
        key: 'weekly', icon: '🏆', title: 'Wochenkönig', tier: 'gold',
        winner: w,
        value: `${w === 'Benny' ? weeklyTally.bennyWins : weeklyTally.jonasWins} Siege`,
        sub: `gegen ${loser}${weeklyTally.ties ? ` · ${weeklyTally.ties}× geteilt` : ''}`,
      });
    }
    if (setsToTarget.bennyHits !== setsToTarget.jonasHits && (setsToTarget.bennyHits || setsToTarget.jonasHits)) {
      const w = setsToTarget.bennyHits > setsToTarget.jonasHits ? 'Benny' : 'Jonas';
      push({
        key: 'hits', icon: '🎯', title: 'Zielgenau', tier: 'gold',
        winner: w,
        value: `${w === 'Benny' ? setsToTarget.bennyHits : setsToTarget.jonasHits} Ziele`,
        sub: 'erreicht',
      });
    }
    if (catWins.Benny !== catWins.Jonas && (catWins.Benny || catWins.Jonas)) {
      const w = catWins.Benny > catWins.Jonas ? 'Benny' : 'Jonas';
      push({
        key: 'cats', icon: '🥇', title: 'Kategoriekönig', tier: 'gold',
        winner: w,
        value: `${catWins[w]} ${catWins[w] === 1 ? 'Kategorie' : 'Kategorien'}`,
        sub: 'angeführt',
      });
    }
    if (maxSet.Benny !== maxSet.Jonas && (maxSet.Benny || maxSet.Jonas)) {
      const w = maxSet.Benny > maxSet.Jonas ? 'Benny' : 'Jonas';
      push({
        key: 'maxSet', icon: '💪', title: 'Rekord-Satz', tier: 'silver',
        winner: w, value: `${maxSet[w]} Reps`, sub: 'in einem Satz',
      });
    }
    if (bestDay.Benny !== bestDay.Jonas && (bestDay.Benny || bestDay.Jonas)) {
      const w = bestDay.Benny > bestDay.Jonas ? 'Benny' : 'Jonas';
      push({
        key: 'bestDay', icon: '📅', title: 'Bester Tag', tier: 'silver',
        winner: w, value: `${bestDay[w]} Reps`, sub: 'an einem Tag',
      });
    }
    if (longestStreak.Benny !== longestStreak.Jonas && (longestStreak.Benny || longestStreak.Jonas)) {
      const w = longestStreak.Benny > longestStreak.Jonas ? 'Benny' : 'Jonas';
      push({
        key: 'streak', icon: '🔥', title: 'Streak-King', tier: 'silver',
        winner: w,
        value: `${longestStreak[w]} ${longestStreak[w] === 1 ? 'Tag' : 'Tage'}`,
        sub: 'in Folge',
      });
    }
    return medals;
  }, [challenges, allSets, selectedCats, leadHistory, weeklyTally, setsToTarget]);

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
          <div className="k">Reps gesamt</div>
        </div>
      </div>

      <div className="card">
        <div className="vs-head">
          <div className="label" style={{margin: 0}}>Benny vs. Jonas</div>
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

        {leader && diff > 0 && (
          <div className="winner-banner">
            <div className="winner-avatar-wrap">
              <img src={`uploads/${leader.toLowerCase()}.jpg`} alt={leader} className="winner-avatar"/>
              <span className="winner-crown">👑</span>
            </div>
            <div className="winner-text">
              <div className="winner-name">{leader}</div>
              <div className="winner-lead">führt mit <span className="mono">+{diff}</span> Reps</div>
              {momentum && (
                <div className={`winner-momentum ${momentum.who.toLowerCase()}`}>
                  {momentum.isCatchingUp ? '📈' : '🔒'} {momentum.who} {momentum.isCatchingUp ? 'holt auf' : 'baut aus'} · <span className="mono">+{momentum.gap}</span> in 7T
                  {momentum.daysToOvertake != null && (
                    <> · überholt in ~<span className="mono">{momentum.daysToOvertake.toFixed(1)}</span>T</>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="vs-row">
          <div className="vs-side benny">
            <div className="vs-name">Benny</div>
            <div className="vs-reps mono">{bennyStats.total}</div>
            <div className="vs-meta mono">{bennyStats.sets} Sätze · ⌀ {bennyStats.avgSet}/Satz</div>
          </div>
          <div className="vs-side jonas">
            <div className="vs-name">Jonas</div>
            <div className="vs-reps mono">{jonasStats.total}</div>
            <div className="vs-meta mono">{jonasStats.sets} Sätze · ⌀ {jonasStats.avgSet}/Satz</div>
          </div>
        </div>

        <div className="vs-bar">
          <div className="vs-bar-benny" style={{flex: bennyStats.total / maxReps}} />
          <div className="vs-bar-jonas" style={{flex: jonasStats.total / maxReps}} />
        </div>

        <div className="chart-wrap" onClick={() => setFullscreen(true)} role="button" tabIndex={0}>
          <div className="chart-legend">
            <span><span className="dot" style={{background: accentColors.accent}}/>Benny</span>
            <span><span className="dot" style={{background: accentColors.accent3}}/>Jonas</span>
            <span className="chart-title">{cumulative ? 'Kumuliert' : 'Reps pro Tag'}</span>
            <Icon name="expand" size={14} color="var(--text-2)" />
          </div>
          <StatsChart
            benny={cumulative ? bennyCumSeries : bennySeries}
            jonas={cumulative ? jonasCumSeries : jonasSeries}
            days={totalDays}
            accent={accentColors.accent}
            accent3={accentColors.accent3}
          />
        </div>

        {(() => {
          const rows = [
            { label: 'Aktive Tage', b: bennyStats.activeDays, j: jonasStats.activeDays },
            { label: 'Bester Tag', b: bennyStats.bestDay, j: jonasStats.bestDay },
            { label: 'Größter Satz', b: bennyStats.maxSet, j: jonasStats.maxSet },
            { label: '⌀ Reps/Tag', b: bennyStats.avgDay, j: jonasStats.avgDay },
            {
              label: '⌀ Sätze bis Ziel',
              b: setsToTarget.bennyHits ? setsToTarget.benny : null,
              j: setsToTarget.jonasHits ? setsToTarget.jonas : null,
              lowerWins: true,
            },
            { label: 'Ziele erreicht', b: setsToTarget.bennyHits, j: setsToTarget.jonasHits },
          ];
          const winnerOf = (r) => {
            if (r.b == null || r.j == null || r.b === r.j) return null;
            const benWins = r.lowerWins ? r.b < r.j : r.b > r.j;
            return benWins ? 'benny' : 'jonas';
          };
          return (
            <table className="stats-table">
              <thead>
                <tr>
                  <th></th>
                  <th className="benny">Benny</th>
                  <th className="jonas">Jonas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const w = winnerOf(r);
                  return (
                    <tr key={i}>
                      <td className="st-label">
                        {r.label}
                        {r.hint && <span className="st-hint">{r.hint}</span>}
                      </td>
                      <td className={`st-val mono benny${w === 'benny' ? ' win' : w === 'jonas' ? ' lose' : ''}`}>
                        <span className="st-pill">{r.b == null ? '–' : r.b}</span>
                      </td>
                      <td className={`st-val mono jonas${w === 'jonas' ? ' win' : w === 'benny' ? ' lose' : ''}`}>
                        <span className="st-pill">{r.j == null ? '–' : r.j}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}

        {perCat.length > 0 && (
          <div style={{marginTop: 18}}>
            <div className="label" style={{marginBottom: 8}}>Nach Kategorie</div>
            {perCat.map(({cat, Benny, Jonas, total}) => {
              const m = Math.max(Benny, Jonas, 1);
              const catLeader = Benny === Jonas ? null : (Benny > Jonas ? 'Benny' : 'Jonas');
              const catDiff = Math.abs(Benny - Jonas);
              return (
                <div className={`vs-cat${catLeader ? ` leader-${catLeader.toLowerCase()}` : ''}`} key={cat?.id || total}>
                  <div className="vs-cat-head">
                    <div className="vs-cat-name">{cat?.emoji} {cat?.name}</div>
                    {catLeader ? (
                      <div className={`vs-cat-leader ${catLeader.toLowerCase()}`}>
                        <span className="vs-cat-leader-crown">👑</span>
                        <span className="vs-cat-leader-name">{catLeader}</span>
                        <span className="vs-cat-leader-diff mono">+{catDiff}</span>
                      </div>
                    ) : (
                      total > 0 && <div className="vs-cat-leader tie"><span className="mono">=</span> Gleichstand</div>
                    )}
                  </div>
                  <div className="vs-cat-bars">
                    <div className={`vs-cat-row${catLeader === 'Benny' ? ' lead' : catLeader === 'Jonas' ? ' trail' : ''}`}>
                      <span className="vs-cat-label benny">B</span>
                      <div className="vs-cat-track"><div className="vs-cat-fill benny" style={{width: `${(Benny/m)*100}%`}}/></div>
                      <span className="vs-cat-val mono">{Benny}</span>
                    </div>
                    <div className={`vs-cat-row${catLeader === 'Jonas' ? ' lead' : catLeader === 'Benny' ? ' trail' : ''}`}>
                      <span className="vs-cat-label jonas">J</span>
                      <div className="vs-cat-track"><div className="vs-cat-fill jonas" style={{width: `${(Jonas/m)*100}%`}}/></div>
                      <span className="vs-cat-val mono">{Jonas}</span>
                    </div>
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
          <div className="hof-halls">
            {['Benny', 'Jonas'].map(athlete => {
              const meds = hallOfFame.filter(m => m.winner === athlete);
              return (
                <div className={`hof-hall ${athlete.toLowerCase()}`} key={athlete}>
                  <div className="hof-hall-head">
                    <img className="hof-avatar" src={`uploads/${athlete.toLowerCase()}.jpg`} alt={athlete} />
                    <div className="hof-hall-name">{athlete}</div>
                    <div className="hof-hall-count mono">{meds.length}</div>
                  </div>
                  <div className="hof-shelf">
                    {meds.length === 0 ? (
                      <div className="hof-empty">Keine Trophäen</div>
                    ) : meds.map(m => (
                      <div className={`trophy tier-${m.tier} ${athlete.toLowerCase()}`} key={m.key}>
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
          {(weeklyTally.bennyWins || weeklyTally.jonasWins || weeklyTally.ties) > 0 && (() => {
            const total = weeklyTally.bennyWins + weeklyTally.jonasWins + weeklyTally.ties;
            const bennyPct = Math.round((weeklyTally.bennyWins / total) * 100);
            const jonasPct = Math.round((weeklyTally.jonasWins / total) * 100);
            const tiePct = Math.max(0, 100 - bennyPct - jonasPct);
            const bennyLead = weeklyTally.bennyWins > weeklyTally.jonasWins;
            const jonasLead = weeklyTally.jonasWins > weeklyTally.bennyWins;
            return (
              <div className="hof-weekly">
                <div className="hof-weekly-head">
                  <div className="hof-weekly-title">Wochen-Bilanz</div>
                  <div className="hof-weekly-meta">
                    <span className="mono">{total}</span> {total === 1 ? 'Woche' : 'Wochen'} abgeschlossen
                  </div>
                </div>
                <div className="hof-weekly-bar" aria-hidden="true">
                  {weeklyTally.bennyWins > 0 && (
                    <div className="hof-weekly-seg benny" style={{flex: weeklyTally.bennyWins}}>
                      {bennyPct >= 18 && <span className="hof-weekly-seg-label mono">{bennyPct}%</span>}
                    </div>
                  )}
                  {weeklyTally.ties > 0 && (
                    <div className="hof-weekly-seg tie" style={{flex: weeklyTally.ties}}>
                      {tiePct >= 18 && <span className="hof-weekly-seg-label mono">{tiePct}%</span>}
                    </div>
                  )}
                  {weeklyTally.jonasWins > 0 && (
                    <div className="hof-weekly-seg jonas" style={{flex: weeklyTally.jonasWins}}>
                      {jonasPct >= 18 && <span className="hof-weekly-seg-label mono">{jonasPct}%</span>}
                    </div>
                  )}
                </div>
                <div className="hof-weekly-legend">
                  <div className={`hof-weekly-card benny${bennyLead ? ' lead' : jonasLead ? ' trail' : ''}`}>
                    <div className="hof-weekly-card-num mono">{weeklyTally.bennyWins}</div>
                    <div className="hof-weekly-card-name">Benny</div>
                  </div>
                  {weeklyTally.ties > 0 && (
                    <div className="hof-weekly-card tie">
                      <div className="hof-weekly-card-num mono">{weeklyTally.ties}</div>
                      <div className="hof-weekly-card-name">Geteilt</div>
                    </div>
                  )}
                  <div className={`hof-weekly-card jonas${jonasLead ? ' lead' : bennyLead ? ' trail' : ''}`}>
                    <div className="hof-weekly-card-num mono">{weeklyTally.jonasWins}</div>
                    <div className="hof-weekly-card-name">Jonas</div>
                  </div>
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
        const challengeIsDone = (ch) => {
          const sets = setsByCh[ch.id] || [];
          const bT = sets.filter(s => s.athlete === 'Benny').reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
          const jT = sets.filter(s => s.athlete === 'Jonas').reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
          return bT >= ch.target_reps && jT >= ch.target_reps;
        };
        const progressRows = (ch) => {
          const sets = setsByCh[ch.id] || [];
          const bT = sets.filter(s => s.athlete === 'Benny').reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
          const jT = sets.filter(s => s.athlete === 'Jonas').reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
          const bPct = Math.round(100 * bT / ch.target_reps);
          const jPct = Math.round(100 * jT / ch.target_reps);
          const bDone = bT >= ch.target_reps;
          const jDone = jT >= ch.target_reps;
          return (
            <div className="right">
              <div style={{display:'flex',justifyContent:'flex-end',alignItems:'baseline',gap:8}}>
                <span className="mono" style={{color:'var(--accent)',fontWeight:700,fontSize:15}}>B</span>
                <span className={`pct mono ${bDone ? 'done' : bPct < 50 ? 'miss' : ''}`} style={{fontSize:18}}>{bPct}%</span>
                <span className="wk mono" style={{minWidth:72,textAlign:'right'}}>{bT}/{ch.target_reps}</span>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',alignItems:'baseline',gap:8,marginTop:4}}>
                <span className="mono" style={{color:'var(--accent-3)',fontWeight:700,fontSize:15}}>J</span>
                <span className={`pct mono ${jDone ? 'done' : jPct < 50 ? 'miss' : ''}`} style={{fontSize:18}}>{jPct}%</span>
                <span className="wk mono" style={{minWidth:72,textAlign:'right'}}>{jT}/{ch.target_reps}</span>
              </div>
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
                  <div className="wk" style={{ marginTop: 4 }}>Ziel {ch.target_reps} / Person</div>
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
                      <div className="wk" style={{ marginTop: 2 }}>Ziel {ch.target_reps} / Person</div>
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
          bennySeries={bennySeries}
          jonasSeries={jonasSeries}
          bennyCumSeries={bennyCumSeries}
          jonasCumSeries={jonasCumSeries}
          totalDays={totalDays}
          range={range}
          setRange={setRange}
          cumulative={cumulative}
          setCumulative={setCumulative}
          accent={accentColors.accent}
          accent3={accentColors.accent3}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>);

}

function computeAthleteStats(sets, athlete, series) {
  const own = sets.filter(s => s.athlete === athlete);
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
  const avgDay = series.length ? Math.round(total / series.length) : 0;
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

Object.assign(window, { HomeScreen, SetupSheet, LogSheet, FeedScreen, BackfillSheet, HistoryScreen, StatsChart, FullscreenChart, ChartFullscreen, HistoryView, computeAthleteStats, EmojiPickerSheet });