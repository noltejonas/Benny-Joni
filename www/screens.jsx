/* global React, PTData, PTDashboard, PTOnboarding, ObAmount, TugBar, FocusCarousel, Ring, Icon, MiniRing, CountUp, Sheet, Stepper, Toast, formatRelative, formatWeek, weekNumber, localDay, todayGreeting, formatDuration, PTPeople, Avatar, SideAvatar, sideStyle, totalsBySide, uniqueMaxIndex, sideIndexByUser, tr, trn, trc, PTi18n */
const { useState, useEffect, useMemo } = React;

// Schnellsatz-Werte pro Person und Übung, lokal gespeichert. Schlüssel ist
// PTData.exerciseKey (gleiche Übung in mehreren Challenges teilt sich die Werte),
// legacyId die Kategorie-ID, unter der frühere Versionen gespeichert haben.
const QUICK_DEFAULTS = { reps: [5, 10, 15], minutes: [10, 15, 30] };
function getQuickSets(athlete, catId, { legacyId = null, minutes = false } = {}) {
  const fallback = minutes ? QUICK_DEFAULTS.minutes : QUICK_DEFAULTS.reps;
  try {
    const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
    return all[`${athlete}:${catId}`] || (legacyId && all[`${athlete}:${legacyId}`]) || fallback;
  } catch { return fallback; }
}
function setQuickSets(athlete, catId, arr) {
  try {
    const all = JSON.parse(localStorage.getItem('quickSets') || '{}');
    all[`${athlete}:${catId}`] = arr;
    localStorage.setItem('quickSets', JSON.stringify(all));
  } catch (e) {}
}

// Plausibilität pro Satz (PTFeed.repsCheck): über 500 ablehnen, ab 200
// nachfragen. true = speichern. Nur für Wiederholungen, nicht für Workouts
// (Sekunden, Runden) und Work-Minuten. Auch von feed.jsx und onboarding-intro.jsx genutzt.
const REPS_MAX = window.PTFeed?.REPS_MAX || 500;
function confirmReps(n) {
  const r = window.PTFeed?.repsCheck?.(n) || 'ok';
  if (r === 'too_many') {
    alert(tr('Höchstens {max} Wiederholungen pro Satz. Mehr bitte auf mehrere Sätze aufteilen.', { max: REPS_MAX }));
    return false;
  }
  if (r === 'ask') return confirm(tr('Wirklich {n} Wiederholungen in einem Satz?', { n }));
  return r !== 'invalid';
}

// Text teilen wie shareInvite (competitions.jsx): Teilen-Sheet, sonst
// Zwischenablage. Liefert 'shared' | 'copied' | 'cancelled' | 'failed'.
async function shareResultText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'failed'; }
}

// Knopf „Ergebnis teilen“. getText liefert den Text erst beim Tippen.
function ShareResultButton({ getText, title = tr('Ergebnis'), className = 'btn btn-secondary share-result-btn' }) {
  const [info, setInfo] = useState('');
  async function share() {
    let text = '';
    try { text = getText(); } catch (e) { console.warn('Teilen', e); }
    if (!text) { setInfo(tr('Teilen ging nicht.')); return; }
    const r = await shareResultText(text, title);
    setInfo(r === 'copied' ? tr('Kopiert. Füg es in den Chat ein.') : r === 'failed' ? tr('Teilen ging nicht.') : '');
  }
  return (
    <>
      <button type="button" className={className} onClick={share}>
        <Icon name="share" size={18} /> {tr('Ergebnis teilen')}
      </button>
      {info && <div className="share-result-info" role="status">{info}</div>}
    </>
  );
}

// `coach`: Tipp für den allerersten Satz (Onboarding), bis er geloggt ist.
// `minutes`: Zeit-Übung, die Chips sind Minuten.
// `compact`: ohne Kopfzeile, mittlerer Wert hervorgehoben, „+“ am Ende öffnet das Log-Sheet.
function QuickLogRow({ me, catId, legacyId = null, minutes = false, onQuick, onLog, coach, compact = false }) {
  const [values, setValues] = useState(() => getQuickSets(me, catId, { legacyId, minutes }));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values);
  // Pfeil des Tipps zeigt auf die Mitte des ersten Zahl-Chips.
  const rowRef = React.useRef(null);
  const [arrowX, setArrowX] = useState(null);
  React.useLayoutEffect(() => {
    if (!coach || editing) return;
    const row = rowRef.current, chip = row?.querySelector('.quick-chip');
    if (!row || !chip) return;
    const a = row.getBoundingClientRect(), b = chip.getBoundingClientRect();
    setArrowX(Math.round(b.left - a.left + b.width / 2));
  }, [coach, editing, values]);

  useEffect(() => { setValues(getQuickSets(me, catId, { legacyId, minutes })); setEditing(false); }, [me, catId, legacyId, minutes]);
  // Einheit steht bei Minuten in der Überschrift, die Chips bleiben kurz (eine Reihe)
  const chipAria = (v) => (minutes ? tr('+{n} min', { n: v }) : undefined);

  function commit(next) {
    // Schnellsätze loggen ohne Rückfrage, darum hier schon auf das Maximum begrenzen.
    const clean = next.filter(n => Number.isFinite(n) && n > 0).map(n => Math.min(REPS_MAX, n)).slice(0, 6);
    setQuickSets(me, catId, clean);
    setValues(clean);
    setDraft(clean);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="quick-row quick-row-edit">
        <div className="quick-row-label">{tr('Schnellsatz bearbeiten')}</div>
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
              <button className="quick-chip-del" aria-label={tr('Entfernen')}
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {draft.length < 6 && (
            <button className="quick-chip-add" aria-label={tr('Wert hinzufügen')} onClick={() => setDraft([...draft, minutes ? 30 : 10])}>＋</button>
          )}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:10}}>
          <button className="btn-ghost-sm" onClick={() => { setDraft(values); setEditing(false); }}>{tr('Abbrechen')}</button>
          <button className="btn-ghost-sm primary" onClick={() => commit(draft)}>{tr('Speichern')}</button>
        </div>
      </div>
    );
  }

  if (compact && values.length > 0) {
    const main = values.length >= 3 ? 1 : 0;
    return (
      <div className="quick-row is-compact">
        <div className={`quick-chips${values.length > 4 ? ' is-many' : ''}`}>
          {values.map((v, i) => (
            <button key={i} className={`quick-chip mono${i === main ? ' is-main' : ''}`} aria-label={chipAria(v)} onClick={() => onQuick(v)}>+{v}</button>
          ))}
          {onLog && (
            <button className="quick-chip-more" aria-label={minutes ? tr('Zeit eintragen') : tr('Satz eintragen')} onClick={onLog}>＋</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="quick-row" ref={rowRef}>
      <div className="quick-row-head">
        <span className="quick-row-label">{minutes ? tr('Minuten eintragen') : tr('Schnellsatz')}</span>
        {values.length > 0 && (
          <button className="quick-edit-btn" aria-label={tr('Schnellsatz bearbeiten')} onClick={() => { setDraft(values); setEditing(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        )}
      </div>
      {coach && values.length > 0 && (
        <div className="ob-coach" role="note" style={arrowX != null ? { '--ob-arrow-x': `${arrowX}px` } : undefined}>
          {tr('Satz gemacht? Tipp hier.')}
        </div>
      )}
      <div className={`quick-chips${values.length > 4 ? ' is-many' : ''}`}>
        {onLog && (
          <button className="quick-chip-open" onClick={onLog}>{minutes ? tr('+ Zeit') : tr('+ Satz')}</button>
        )}
        {values.length === 0 ? (
          <button className="quick-chip-setup" onClick={() => { setDraft(minutes ? QUICK_DEFAULTS.minutes : QUICK_DEFAULTS.reps); setEditing(true); }}>
            {tr('Schnellsatz festlegen')}
          </button>
        ) : values.map((v, i) => (
          <button key={i} className={`quick-chip mono${coach && i === 0 ? ' ob-pulse' : ''}`} aria-label={chipAria(v)} onClick={() => onQuick(v)}>+{v}</button>
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
  // Wochentage ab Montag; getDay() zählt ab Sonntag (0)
  const labels = PTi18n.weekdays();
  return days
    .map(d => ({ ...d, label: labels[(d.dow + 6) % 7] }))
    .sort((a, b) => (a.dow === 0 ? 7 : a.dow) - (b.dow === 0 ? 7 : b.dow));
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
      <div className="weekclose-banner-title">{tr('KW {week} ist um.', { week: weekKW(weekStart) })}</div>
      <div className="weekclose-banner-sub">{tr('Strafkonto-Abschluss noch offen.')}</div>
      <button className="weekclose-banner-btn" onClick={() => onClose(weekStart)}>{tr('Woche abschließen')}</button>
    </div>
  );
}

// Vergleichskarte auf „Heute“. Zwei Seiten (1v1, 2v2): Duell mit Score und geteiltem Balken.
// Mehr Seiten (Jeder gegen jeden): Rangliste. entries[0] ist immer die eigene Seite.
function DuelCard({ entries, title, meta }) {
  const total = entries.reduce((a, e) => a + e.reps, 0);

  if (entries.length !== 2) {
    const ranked = [...entries].sort((x, y) => y.reps - x.reps);
    const max = Math.max(1, ranked[0]?.reps || 0);
    const myRank = ranked.findIndex(e => e.side.isMine) + 1;
    return (
      <section className="rd-card rd-duel" aria-label={tr('Rangliste diese Woche')}>
        <div className="rd-duel-head"><span>{title}</span><span>{meta}</span></div>
        <p className="rd-duel-line">{total === 0 ? tr('Noch nichts geloggt. Wer legt vor?') : tr('Du bist auf Platz {rank}.', { rank: myRank })}</p>
        <ol className="rd-rank">
          {ranked.map((e, i) => (
            <li key={e.side.key} className={e.side.isMine ? 'is-me' : ''} style={sideStyle(e.side)}>
              <span className="rd-rank-pos">{i + 1}</span>
              <SideAvatar side={e.side} size={32} />
              <span className="rd-rank-body">
                <span className="rd-rank-name">{e.side.isMine && e.side.userIds.length === 1 ? tr('Du') : e.side.label}</span>
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
  const line = total === 0 ? tr('Noch nichts geloggt. Wer legt vor?')
    : lead > 0 ? (we
      ? trn(lead, 'Ihr liegt bei einer Übung vorne.', 'Ihr liegt bei {n} Übungen vorne.')
      : trn(lead, 'Du liegst bei einer Übung vorne.', 'Du liegst bei {n} Übungen vorne.'))
    : lead < 0 ? (b.side.userIds.length > 1
      ? trn(-lead, '{name} liegen bei einer Übung vorne.', '{name} liegen bei {n} Übungen vorne.', { name: b.side.label })
      : trn(-lead, '{name} liegt bei einer Übung vorne.', '{name} liegt bei {n} Übungen vorne.', { name: b.side.label }))
    : tr('Gleichstand. Jetzt zählt jeder Satz.');
  const aShare = total ? Math.round((a.reps / total) * 100) : 50;
  return (
    <section className="rd-card rd-duel" aria-label={tr('Duell diese Woche')}>
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
            <div className="rd-duel-cap">{tr('Übungen vorne')}</div>
          </div>
        ))}
      </div>
      <p className="rd-duel-line">{line}</p>
      <div className="rd-split" role="img" aria-label={tr('{nameA} {repsA} Reps, {nameB} {repsB} Reps', { nameA: a.side.label, repsA: a.reps, nameB: b.side.label, repsB: b.reps })}>
        <div className="rd-split-a" style={{ width: `${aShare}%`, ...sideStyle(a.side) }} />
        <div className="rd-split-b" style={sideStyle(b.side)} />
      </div>
      <div className="rd-split-legend">
        <span>{trn(a.reps, '{n} Reps', '{n} Reps', { n: <CountUp value={a.reps} /> })}</span>
        <span>{trn(b.reps, '{n} Reps', '{n} Reps', { n: <CountUp value={b.reps} /> })}</span>
      </div>
    </section>
  );
}

function HomeScreen({ api, me, sides = [], participantCount = 0, challenges = [], categories = [], allSets = [], layout,
  competitionId = null, weekStart, nextWeekStart, nextWeekChallenges = [], nextWeekProposals = [],
  openClosures = [], onCloseWeek,
  onAddGoal, onEditChallenge, onLogChallenge, onQuickLog, coach = false, celebrate = true }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const tabChallenges = challenges;
  const celebration = useCelebration(challenges, allSets, me, categories);
  const [selectedId, setSelectedId] = React.useState(null);

  // Kennzahlen pro Wochenziel einmal berechnen; Karten, Liste und Duell lesen daraus.
  const rows = React.useMemo(
    () => PTDashboard.challengeRows({ challenges: tabChallenges, categories, sets: allSets, sides, me, participantCount }),
    [tabChallenges, categories, allSets, me, sides, participantCount]
  );

  const orderedRows = React.useMemo(
    () => [...rows.filter(r => !r.meFinished), ...rows.filter(r => r.meFinished)],
    [rows]
  );
  const focus = rows.find(r => r.ch.id === selectedId)
    || orderedRows.find(r => r.isObligatory && !r.meFinished)
    || orderedRows[0];
  // Fokus-Karten: offene zuerst, erledigte (grün) am Ende, damit Blau und Grün
  // nicht durcheinander wechseln. Die angezeigte Karte bleibt beim Umsortieren im Bild.
  const slides = React.useMemo(() => orderedRows.map(r => ({ key: r.ch.id, done: r.meFinished, row: r })), [orderedRows]);
  const onSlide = React.useCallback((id) => setSelectedId(id), []);

  const duelEntries = React.useMemo(() => PTDashboard.duelOf(rows, sides), [rows, sides]);

  // Tagesbalken (nur Wiederholungen): bei mehr als zwei Seiten „Du vs. Ø der anderen“
  const twoSided = sides.length === 2;
  const othersCount = Math.max(1, sides.length - 1);
  const week = React.useMemo(() => {
    const groups = twoSided || sides.length < 2
      ? sides.map(s => s.statUserIds || s.userIds)
      : [sides[0].statUserIds, sides.slice(1).flatMap(s => s.statUserIds)];
    const ids = new Set(rows.filter(r => !r.minutes).map(r => r.ch.id));
    const ws = tabChallenges[0]?.week_start || weekStart;
    const days = dailyBreakdownFor(ws, allSets.filter(x => ids.has(x.challenge_id)), groups);
    if (!twoSided && sides.length > 2) for (const d of days) d.vals[1] = Math.round(d.vals[1] / othersCount);
    return days;
  }, [rows, tabChallenges, allSets, weekStart, sides]);
  const weekSeries = twoSided || sides.length < 2
    ? sides.map(s => ({ key: s.key, label: s.isMine && s.userIds.length === 1 ? tr('Du') : s.label, style: sideStyle(s) }))
    : [{ key: 'me', label: tr('Du'), style: sideStyle(sides[0]) }, { key: 'avg', label: tr('Ø andere'), style: { '--sc': 'var(--text-4)' } }];
  const weekMax = Math.max(1, ...week.flatMap(d => d.vals));
  // Resttage zählen heute mit, wie die Startkarte (PTOnboarding.weekProgress).
  const daysLeft = week.filter(d => d.isFuture || d.isToday).length;

  // Serie: Tage in Folge mit eigenem Sport-Satz in dieser Challenge, ohne
  // Workouts und Work. Ohne Satz heute zählt sie ab gestern (PTStats.streaks)
  // und hält bis Mitternacht.
  const streak = React.useMemo(() => {
    if (!me || typeof window.PTStats?.streaks !== 'function') return null;
    const days = allSets
      .filter(s => s.athlete === me && !s.workout && s.duration_minutes == null && s.created_at)
      .map(s => PTData.isoDate(new Date(s.created_at)));
    const today = PTData.isoDate(new Date());
    const { current } = PTStats.streaks(days, today);
    return { days: current, today: days.includes(today) };
  }, [allSets, me]);

  const finishedCount = rows.filter(r => r.meFinished).length;
  const chosenByLabel = (id) => id === me ? tr('gewählt von dir') : tr('gewählt von {name}', { name: PTPeople.firstNameOf(id) });
  const fmtOf = (r) => (v) => (r.minutes ? formatDuration(v) : v);

  // Rules of Hooks: this early return must come AFTER all hooks above.
  if (!tabChallenges.length) {
    return (
      <div className="rd-empty">
        <div className="rd-empty-title">{tr('Diese Woche ist noch offen')}</div>
        <div className="rd-empty-text">{tr('Legt die Ziele für diese Woche fest.')}</div>
        <button className="btn" onClick={onAddGoal}>{tr('Ziel anlegen')}</button>
      </div>
    );
  }

  const renderSlide = ({ row: f }) => {
    const fmt = fmtOf(f);
    const pct = Math.min(1, f.total / Math.max(1, f.goal));
    return (
      <div className={`rd-focus fc-card${f.meFinished ? ' is-done' : ''}`} aria-label={f.isObligatory ? tr('Pflicht-Challenge') : tr('Wochenziel im Fokus')}>
        <div className="rd-focus-top">
          <div className="rd-focus-text">
            {f.isObligatory && <div className="rd-overline">{tr('Pflicht-Challenge')}</div>}
            <h2 className="rd-focus-title">{f.cat?.name}</h2>
            {f.ch.chosen_by && <div className="rd-focus-sub">{chosenByLabel(f.ch.chosen_by)}</div>}
          </div>
          {f.meFinished ? (
            // Erledigt: Haken statt Prozent, erklärt die grüne Karte
            <span className="fc-pct is-check is-lg" role="img" aria-label={tr('Erledigt')}><Icon name="check" size={34} strokeWidth={3} /></span>
          ) : (
            <MiniRing pct={pct} size={72} stroke={7} color="#fff" track="rgba(255,255,255,0.22)">
              {Math.round(pct * 100)}%
            </MiniRing>
          )}
        </div>
        {!f.isObligatory && sides.length >= 1 && (
          <div className="fc-tug">
            <TugBar sides={sides} values={f.doneBySide} goals={f.sideGoals} minutes={f.minutes} onDark />
          </div>
        )}
        <div className="rd-focus-chips">
          {streak?.days >= 2 && (
            <span className={`rd-chip-glass rd-chip-streak${streak.today ? '' : ' is-open'}`}>
              <span aria-hidden="true">🔥</span> {trn(streak.days, '{n} Tag in Folge', '{n} Tage in Folge')}
            </span>
          )}
          <span className="rd-chip-glass">
            {f.isObligatory
              ? tr('{done} von {total} erledigt', { done: f.total, total: f.goal })
              : f.minutes
                ? tr('gemeinsam {done} / {target}', { done: fmt(f.total), target: fmt(f.ch.target_reps) })
                : tr('gemeinsam {done} / {target} Reps', { done: fmt(f.total), target: fmt(f.ch.target_reps) })}
          </span>
          <span className="rd-chip-glass">
            {f.isObligatory ? (f.meFinished ? tr('du: {summary}', { summary: f.mySummary }) : tr('einmal diese Woche'))
              : f.meFinished ? tr('dein Teil ist erledigt')
              : f.myTodayLeft > 0 ? tr('heute noch {amount}', { amount: fmt(f.myTodayLeft) }) : tr('du bist auf Kurs')}
          </span>
          <button className="rd-icon-glass" aria-label={tr('{name} bearbeiten', { name: f.cat?.name })} onClick={() => onEditChallenge(f.ch)}>
            <Icon name="edit" size={16} />
          </button>
        </div>
        {f.isObligatory ? (
          <button className="rd-btn-white" onClick={() => onLogChallenge(f.ch)}>
            <Icon name="play" size={18} />
            {f.catType === 'tom_holland' ? tr('Workout starten') : tr('Bring Sally Up starten')}
          </button>
        ) : (
          <QuickLogRow me={me} catId={PTData.exerciseKey(f.cat, competitionId) || f.ch.category_id} legacyId={f.ch.category_id}
            minutes={f.minutes} coach={coach && f === focus}
            onQuick={(v) => onQuickLog?.(f.ch, v)} onLog={() => onLogChallenge(f.ch)} />
        )}
      </div>
    );
  };

  return (
    <>
      {sides.length >= 2 && (
        <DuelCard entries={duelEntries}
          title={twoSided
            ? tr('KW {week} · Duell', { week: weekNumber(tabChallenges[0].week_start) })
            : tr('KW {week} · Rangliste', { week: weekNumber(tabChallenges[0].week_start) })}
          meta={daysLeft <= 1 ? tr('letzter Tag') : trn(daysLeft, 'noch {n} Tag', 'noch {n} Tage')} />
      )}

      {focus && (
        <FocusCarousel items={slides} activeKey={focus.ch.id} onActive={onSlide}
          label={tr('Wochenziele im Fokus')} render={renderSlide} />
      )}

      <section className="rd-section" aria-label={tr('Deine Übungen')}>
        <div className="rd-section-head">
          <h2>{tr('Deine Übungen')}</h2>
          <span>{tr('{done} von {total} erledigt', { done: finishedCount, total: rows.length })}</span>
          <button type="button" className="rd-head-btn" onClick={onAddGoal} aria-label={tr('Wochenziel hinzufügen')}>
            <Icon name="plus" size={16} strokeWidth={2.5} /> {tr('Ziel')}
          </button>
        </div>
        <ul className="rd-card rd-list">
          {orderedRows.map(r => {
            const isFocus = focus && r.ch.id === focus.ch.id;
            const fmt = fmtOf(r);
            const progress = { done: fmt(r.myDone), total: fmt(r.share) };
            const sub = r.isObligatory
              ? (r.meFinished ? tr('erledigt · {summary}', { summary: r.mySummary }) : tr('einmal diese Woche'))
              : r.meFinished
                ? tr('{done} von {total}', progress)
                : r.myTodayLeft > 0
                  ? tr('{done} von {total} · heute noch {left}', { ...progress, left: fmt(r.myTodayLeft) })
                  : tr('{done} von {total} · auf Kurs', progress);
            return (
              <li key={r.ch.id}>
                <button type="button" className={`rd-row${r.meFinished ? ' is-done' : ''}${isFocus ? ' is-focus' : ''}`}
                  aria-pressed={isFocus} onClick={() => setSelectedId(r.ch.id)}>
                  <span className="rd-row-text">
                    <span className="rd-row-name">{r.cat?.name}</span>
                    <span className="rd-row-sub">{sub}</span>
                  </span>
                  {r.meFinished ? (
                    <span className="rd-check" aria-label={tr('Erledigt')}><Icon name="check" size={16} strokeWidth={3} /></span>
                  ) : (
                    <MiniRing pct={r.isObligatory ? 0 : r.myDone / r.share} />
                  )}
                </button>
              </li>
            );
          })}
          {onAddGoal && (
            <li>
              <button type="button" className="rd-row rd-row-add" onClick={onAddGoal}>
                <span className="rd-tile"><Icon name="plus" size={20} /></span>
                <span className="rd-row-text"><span className="rd-row-name">{tr('Übung hinzufügen')}</span></span>
              </button>
            </li>
          )}
        </ul>
      </section>

      <section className="rd-section" aria-label={tr('Diese Woche')}>
        <div className="rd-section-head">
          <h2>{tr('Diese Woche')}</h2>
          <span className="rd-legend">
            {weekSeries.map(s => <span key={s.key} style={s.style}><i />{s.label}</span>)}
          </span>
        </div>
        <div className="rd-card rd-week">
          {week.map((d, i) => (
            <div key={d.iso} className={`rd-week-day${d.isToday ? ' is-today' : ''}${d.isFuture ? ' is-future' : ''}`}
              aria-label={d.isFuture ? tr('{day}: noch offen', { day: d.label }) : `${d.label}: ${weekSeries.map((s, j) => `${s.label} ${d.vals[j] ?? 0}`).join(', ')}`}>
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
      const whenLabel = daysUntil === 0 ? tr('heute') : daysUntil === 1 ? tr('morgen') : tr('in {n} Tagen', { n: daysUntil });
      const weekVars = { week: weekNumber(nextWeekStart), when: whenLabel };
      return (
        <section className="rd-section" aria-label={tr('Nächste Woche')}>
          <div className="rd-section-head">
            <h2>{tr('Nächste Woche')}</h2>
            <span>{isConfirmed ? tr('KW {week} · {when}', weekVars) : tr('KW {week} · {when} · Vorschau', weekVars)}</span>
          </div>
          <ul className="rd-card rd-list">
            {items.map((ch, i) => {
              const cat = catById[ch.category_id];
              const ctype = cat?.challenge_type || 'standard';
              return (
                <li key={ch.id || `p-${i}`}>
                  <div className="rd-row is-static">
                    <span className="rd-row-text">
                      <span className="rd-row-name">{cat?.name}</span>
                      <span className="rd-row-sub">{isConfirmed && ch.chosen_by ? chosenByLabel(ch.chosen_by) : tr('noch offen')}</span>
                    </span>
                    <span className="rd-row-value">
                      {PTData.isWorkoutType(ctype) ? <>1×<small>{tr('pro Person')}</small></> : <>
                        {!isConfirmed && ch.bonus_max > 0
                          ? <>{ch.target_reps}–{ch.target_reps + ch.bonus_max}</>
                          : ch.target_reps}
                        <small>{PTData.usesMinutes(cat) ? 'min' : trc('Einheit', 'Reps')}</small>
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
    {/* Erst mit frischen Daten feiern, nicht aus dem Stand vom letzten Öffnen */}
    {celebrate && celebration.pendingCelebration && (
      <CelebrationOverlay
        category={celebration.pendingCelebration.category}
        targetReps={celebration.pendingCelebration.challenge.target_reps}
        onDone={celebration.dismissCurrent}
      />
    )}
    </>
  );
}

// ─── WOCHENZIEL ─────────────────────────────────────────────────────────────
// Auf einen Blick: Übung und Menge pro Person bis Sonntag. Unter „Details“:
// Ziel gesamt statt pro Person, nächste Woche, eigene Übung mit Einheit
// (Wiederholungen, Minuten oder Work) und dasselbe Ziel in weiteren Challenges.
// target_reps bleibt das gemeinsame Wochenziel (Minuten bei Zeit-Übungen).
const GOAL_INPUT_KEY = 'pt:goal-input'; // 'person' | 'total'
const UNIT_KIND = { reps: 'sports', minutes: 'time', work: 'work' };

function SetupSheet({ api, baseApi, me, categories, allowWork = true, weekStart, existing, participantCount = 2,
  competitionName = '', usedCategoryIds = [], otherComps = [], onClose, onSaved, onDeleted, onAddCategory }) {
  const people = Math.max(1, participantCount);
  const [catId, setCatId] = useState(existing?.category_id || categories.find(c => !usedCategoryIds.includes(c.id))?.id || categories[0]?.id || '');
  const selectedCat = categories.find(c => c.id === catId);
  const minutes = PTData.usesMinutes(selectedCat);
  const isWorkout = PTData.isWorkoutType(selectedCat?.challenge_type);
  const [perPerson, setPerPerson] = useState(() => { try { return localStorage.getItem(GOAL_INPUT_KEY) !== 'total'; } catch (e) { return true; } });
  const defaultAmount = (cat, pp = perPerson) => {
    const base = cat?.kind === 'work' ? 300 : PTData.usesMinutes(cat) ? 60 : PTOnboarding.goalDefault(cat);
    return pp ? base : base * people;
  };
  const [amount, setAmount] = useState(() => existing?.target_reps
    ? (perPerson ? Math.max(1, Math.round(existing.target_reps / people)) : existing.target_reps)
    : defaultAmount(selectedCat));
  const [touched, setTouched] = useState(!!existing);
  // Bestehendes Ziel unverändert lassen, solange die Menge nicht angefasst wurde
  // (100 bei 3 Personen würde sonst über „33 pro Person“ zu 99).
  const [dirty, setDirty] = useState(false);
  const [nextWeek, setNextWeek] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [alsoIn, setAlsoIn] = useState([]);
  const chosenBy = existing?.chosen_by || me;
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatUnit, setNewCatUnit] = useState('reps');
  const [editingCat, setEditingCat] = useState(null); // {id, name, emoji}
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const target = isWorkout ? 1 : existing && !dirty && existing.category_id === catId ? existing.target_reps
    : perPerson ? amount * people : amount;
  const ws = existing ? existing.week_start || weekStart : nextWeek ? PTData.addDays(weekStart, 7) : weekStart;

  function pick(c) {
    setCatId(c.id);
    if (!touched) setAmount(defaultAmount(c));
  }
  function switchInput(pp) {
    if (pp === perPerson) return;
    setPerPerson(pp);
    try { localStorage.setItem(GOAL_INPUT_KEY, pp ? 'person' : 'total'); } catch (e) {}
    if (existing && !dirty) setAmount(pp ? Math.max(1, Math.round(existing.target_reps / people)) : existing.target_reps);
    else setAmount(a => (pp ? Math.max(1, Math.round(a / people)) : a * people));
  }

  // Weitere Challenges: gleiche Übung (Katalog-ID bzw. gleicher Name und Einheit)
  const key = PTData.exerciseKey(selectedCat);
  const others = otherComps.map(o => {
    const has = o.challenges.some(ch => ch.week_start === ws && PTData.exerciseKey(o.categoryOf(ch.category_id), o.c.id) === key);
    return { ...o, has };
  });
  const canCopy = !existing && selectedCat && selectedCat.kind !== 'work' && others.length > 0;

  async function deleteChallenge() {
    if (!existing?.id) return;
    const cat = categories.find(c => c.id === existing.category_id);
    // Ziele mit Sätzen lehnt api.deleteChallenge mit eigener Meldung ab.
    if (!confirm(tr('„{name}“ aus dieser Woche entfernen?', { name: cat?.name || tr('Ziel') }))) return;
    setDeleting(true);
    try {
      await api.deleteChallenge(existing.id);
      onDeleted?.();
    } catch (e) {
      alert(e.message || tr('Fehler beim Löschen'));
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!catId) return;
    if (isUsed(catId)) { alert(tr('Diese Übung hat diese Woche schon ein Ziel. Wähl eine andere.')); return; }
    setSaving(true);
    try {
      await api.upsertChallenge({
        ...(existing?.id ? { id: existing.id } : { week_start: ws }),
        category_id: catId,
        chosen_by: chosenBy,
        target_reps: Math.max(1, Math.round(target)),
      });
      // Dasselbe Ziel in den ausgewählten anderen Challenges
      let copied = 0;
      for (const o of others.filter(x => alsoIn.includes(x.c.id) && !x.has)) {
        const capi = baseApi.forCompetition(o.c.id);
        let otherCat = selectedCat.competition_id == null ? selectedCat
          : o.categories.find(c => PTData.exerciseKey(c) === key);
        if (!otherCat) otherCat = await capi.addCategory(selectedCat.name, selectedCat.emoji, selectedCat.kind || 'sports');
        await capi.upsertChallenge({
          week_start: ws, category_id: otherCat.id, chosen_by: me,
          target_reps: isWorkout ? 1 : Math.max(1, Math.round(perPerson ? amount * o.participantCount : amount)),
        });
        copied++;
      }
      onSaved(copied);
    } catch (e) {
      alert(e.message || tr('Fehler beim Speichern'));
    } finally {
      setSaving(false);
    }
  }

  async function addNewCat() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.addCategory(newCatName.trim(), '💪', UNIT_KIND[newCatUnit] || 'sports');
      onAddCategory();
      setCatId(cat.id);
      if (!touched) setAmount(defaultAmount(cat));
      setShowNewCat(false);
      setNewCatName('');
      setNewCatUnit('reps');
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
    if (!confirm(tr('Kategorie „{name}“ wirklich löschen?', { name: editingCat.name }))) return;
    try {
      await api.deleteCategory(editingCat.id);
      if (catId === editingCat.id) setCatId(firstFree(editingCat.id));
      setEditingCat(null);
      onAddCategory();
    } catch (e) {alert(e.message);}
  }

  const groups = [
    { id: 'sports', label: null, items: categories.filter(c => (c.kind || 'sports') === 'sports') },
    { id: 'time', label: tr('⏱️ Zeit'), items: categories.filter(c => c.kind === 'time') },
    { id: 'work', label: tr('💻 Work'), items: allowWork ? categories.filter(c => c.kind === 'work') : [] },
  ];
  const card = (c) => {
    const used = !existing && usedCategoryIds.includes(c.id) && !nextWeek;
    return (
      <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
        <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} disabled={used} onClick={() => pick(c)}
          aria-label={used ? tr('{name}, hat diese Woche schon ein Ziel', { name: c.name }) : undefined}>
          <div className="name">{c.name}</div>
          {used ? <div className="cat-note">{tr('läuft schon')}</div>
            : PTData.usesMinutes(c) ? <div className="cat-note">{tr('in Minuten')}</div>
            : c.competition_id && <div className="cat-note">{tr('zählt nicht für die Rangliste')}</div>}
        </button>
        {c.competition_id && (
          <button className="cat-edit" aria-label={tr('Bearbeiten')}
            onClick={(e) => { e.stopPropagation(); setEditingCat({ ...c }); setShowNewCat(false); }}>
            ✎
          </button>
        )}
      </div>
    );
  };

  const unitLabel = minutes
    ? (perPerson ? tr('Minuten pro Person bis Sonntag') : tr('Minuten zusammen bis Sonntag'))
    : (perPerson ? tr('Wiederholungen pro Person bis Sonntag') : tr('Wiederholungen zusammen bis Sonntag'));
  const baseChoices = minutes ? (selectedCat?.kind === 'work' ? [120, 300, 600, 1200] : [30, 60, 120, 300]) : PTOnboarding.goalChoices(defaultAmount(selectedCat, true));
  const choices = perPerson ? baseChoices : baseChoices.map(v => v * people);
  const fmtTarget = (v) => (minutes ? formatDuration(v) : PTi18n.number(v));
  const note = isWorkout ? null : perPerson
    ? tr('Wochenziel zusammen: {total} ({n} Personen)', { total: fmtTarget(target), n: people })
    : tr('Pro Person: {share}', { share: fmtTarget(PTData.fairShareOf(target, people)) });

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>{existing ? tr('Wochenziel bearbeiten') : tr('Wochen-Ziel festlegen')}</h2>
      <div className="subtitle" style={{ marginBottom: 18, fontSize: 15 }}>
        {competitionName && <>{competitionName} · </>}{tr('KW {week}', { week: weekNumber(ws) })} · {formatWeek(ws)}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>{tr('Übung')}</div>
      <div className="cat-grid">
        {groups.map(g => g.items.length > 0 && (
          <React.Fragment key={g.id}>
            {g.label && <div className="cat-grid-divider">{g.label}</div>}
            {g.items.map(card)}
          </React.Fragment>
        ))}
        <button className={`cat-card cat-card-add ${showNewCat ? 'open' : ''}`}
          onClick={() => { setShowNewCat((v) => !v); setEditingCat(null); }}>
          <div className="emoji">＋</div>
          <div className="name">{tr('Eigene Übung')}</div>
        </button>
      </div>

      {editingCat &&
        <div className="new-cat-row">
          <input className="input" value={editingCat.name} autoFocus
            onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()} />
          <button className="new-cat-add new-cat-del" onClick={deleteEdit} aria-label={tr('Löschen')}>🗑️</button>
          <button className="new-cat-add" onClick={saveEdit} aria-label={tr('Speichern')}>✓</button>
        </div>
      }

      {showNewCat &&
        <div className="goal-new">
          <div className="new-cat-row" style={{ marginTop: 0 }}>
            <input className="input" placeholder={tr('Name (z.B. Bibellesen, Planks)')} autoFocus
              value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewCat()} />
          </div>
          <div className="label" style={{ margin: '12px 0 8px' }}>{tr('Einheit')}</div>
          <div className="segmented goal-seg" role="radiogroup" aria-label={tr('Einheit')}>
            <button role="radio" aria-checked={newCatUnit === 'reps'} className={newCatUnit === 'reps' ? 'active' : ''} onClick={() => setNewCatUnit('reps')}>{tr('Wiederholungen')}</button>
            <button role="radio" aria-checked={newCatUnit === 'minutes'} className={newCatUnit === 'minutes' ? 'active' : ''} onClick={() => setNewCatUnit('minutes')}>{tr('Minuten')}</button>
            {allowWork && <button role="radio" aria-checked={newCatUnit === 'work'} className={newCatUnit === 'work' ? 'active' : ''} onClick={() => setNewCatUnit('work')}>{tr('Work')}</button>}
          </div>
          <div className="goal-hint">
            {newCatUnit === 'minutes' ? tr('Für alles, was man nach Zeit misst: Lesen, Planks, Laufen, Dehnen.')
              : newCatUnit === 'work' ? tr('Arbeitszeit mit Projekt und Tool, nur mit Work-Tracking.')
              : tr('Gezählt wird in Wiederholungen.')}
          </div>
          <button className="btn" style={{ marginTop: 12 }} disabled={!newCatName.trim()} onClick={addNewCat}>{tr('Übung anlegen')}</button>
        </div>
      }

      {isWorkout ? (
        <div className="goal-workout">{tr('Pflicht-Workout: jede Person einmal pro Woche.')}</div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <ObAmount value={amount} onChange={(v) => { setTouched(true); setDirty(true); setAmount(v); }} unit={unitLabel}
            choices={choices} note={note} />
          {minutes && amount >= 60 && <div className="goal-hint" style={{ textAlign: 'center' }}>{tr('= {time}', { time: formatDuration(amount) })}</div>}
        </div>
      )}

      <div className={`ob-extras goal-details${detailsOpen ? ' is-open' : ''}`} style={{ marginTop: 20 }}>
        <button type="button" className="ob-extras-head" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(v => !v)}>
          <span className="ob-extras-title">{tr('Details')}</span>
          <span className="ob-extras-sub">
            {[perPerson ? tr('pro Person') : tr('gesamt'), nextWeek && tr('nächste Woche'), alsoIn.length > 0 && trn(alsoIn.length, '+{n} Challenge', '+{n} Challenges')].filter(Boolean).join(' · ')}
          </span>
          <Icon name="chevron" size={18} />
        </button>
        {detailsOpen && (
          <div className="ob-extras-body goal-details-body">
            {!isWorkout && <>
              <div className="label">{tr('Ziel angeben')}</div>
              <div className="segmented goal-seg">
                <button className={perPerson ? 'active' : ''} onClick={() => switchInput(true)}>{tr('pro Person')}</button>
                <button className={!perPerson ? 'active' : ''} onClick={() => switchInput(false)}>{tr('gesamt')}</button>
              </div>
            </>}
            {!existing && <>
              <div className="label">{tr('Woche')}</div>
              <div className="segmented goal-seg">
                <button className={!nextWeek ? 'active' : ''} onClick={() => setNextWeek(false)}>{tr('Diese (KW {week})', { week: weekNumber(weekStart) })}</button>
                <button className={nextWeek ? 'active' : ''} onClick={() => setNextWeek(true)}>{tr('Nächste (KW {week})', { week: weekNumber(PTData.addDays(weekStart, 7)) })}</button>
              </div>
            </>}
            {canCopy && <>
              <div className="label">{tr('Auch anlegen in')}</div>
              <div className="chip-row goal-also">
                {others.map(o => {
                  const on = alsoIn.includes(o.c.id);
                  return (
                    <button key={o.c.id} className={`chip ${on || o.has ? 'chip-active' : ''}`} disabled={o.has} aria-pressed={on || o.has}
                      onClick={() => setAlsoIn(a => on ? a.filter(x => x !== o.c.id) : [...a, o.c.id])}>
                      {o.c.emoji} {o.c.name}{o.has ? ` · ${tr('schon drin')}` : ''}
                    </button>
                  );
                })}
              </div>
              <div className="goal-hint">{tr('Ein Eintrag zählt dann in allen diesen Challenges.')}</div>
            </>}
            {selectedCat && (
              <div className="goal-hint">
                {selectedCat.competition_id == null && selectedCat.ranked
                  ? tr('Zählt für die Monatsrangliste.')
                  : tr('Eigene Übung: zählt in euren Challenges, nicht in der Rangliste.')}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={save} disabled={saving || !catId}>
          {saving ? '…' : tr('Speichern')}
        </button>
      </div>
      {existing?.id &&
        <button className="btn btn-danger-ghost" style={{ marginTop: 12 }} onClick={deleteChallenge} disabled={deleting}>
          {deleting ? '…' : tr('🗑️ Challenge aus dieser Woche entfernen')}
        </button>
      }
    </>);

}

// ─── LOG SHEET ──────────────────────────────────────────────────────────────
// others: weitere eigene Challenges mit derselben Übung diese Woche
// ([{ competition_id, name, emoji }], vorausgewählt, einzeln abwählbar).
// onSubmit({ values, note, skip }) trägt ein (CompetitionApp → api.logEverywhere).
// Ohne `others` fragt das Sheet bei gewerteten Übungen selbst (log_targets),
// ohne onSubmit loggt es direkt per api.addSet.
function LogSheet({ api, me, challenge, category, projectTags = [], toolTags = [], others: givenOthers, onSubmit, onClose, onLogged }) {
  const isWork = PTData.usesMinutes(category);   // Minuten statt Wiederholungen
  const withTags = category?.kind === 'work';    // Work: Projekt und Tool
  const [reps, setReps] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetched, setFetched] = useState([]);
  const [skip, setSkip] = useState([]);
  React.useEffect(() => {
    if (givenOthers || !category?.ranked || !api?.logTargets) return;
    let off = false;
    api.logTargets(category.id, challenge.week_start)
      .then(t => { if (!off) setFetched(t.filter(x => x.competition_id !== challenge.competition_id)); })
      .catch(() => {});
    return () => { off = true; };
  }, [api, givenOthers, category?.id, category?.ranked, challenge.week_start, challenge.competition_id]);
  const others = givenOthers || fetched;
  const toggleSkip = (id) => setSkip(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  // Work-mode state
  const TIMER_KEY = 'pt_work_timer_start';
  const [durationMinutes, setDurationMinutes] = useState(withTags ? 0 : 15);
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

  async function submit(values, value) {
    setSaving(true);
    try {
      if (onSubmit) await onSubmit({ values, note: note.trim() || null, skip });
      else await api.addSet({ challenge_id: challenge.id, athlete: me, ...values, note: note.trim() || null, skip });
      if (isWork) {
        localStorage.removeItem(TIMER_KEY);
        window.dispatchEvent(new Event('pt:timer-changed'));
        setTimerStart(null);
        setElapsedSec(0);
      }
      onLogged(value, isWork);
    } catch (e) {
      alert(e.message || tr('Fehler'));
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (isWork) {
      if (durationMinutes <= 0) return;
      submit({ reps: null, duration_minutes: durationMinutes,
        ...(withTags ? { project_tag_id: projectTagId || null, tool_tag_id: toolTagId || null } : {}) }, durationMinutes);
    } else {
      if (reps <= 0) return;
      if (!confirmReps(reps)) return;
      submit({ reps: parseInt(reps) }, reps);
    }
  }

  const alsoFor = others.length > 0 && (
    <div className="log-also">
      <div className="label">{tr('Zählt auch für')}</div>
      <div className="chip-row">
        {others.map(o => (
          <button key={o.competition_id} className={`chip ${skip.includes(o.competition_id) ? '' : 'chip-active'}`}
            aria-pressed={!skip.includes(o.competition_id)} onClick={() => toggleSkip(o.competition_id)}>
            {o.emoji} {o.name}
          </button>
        ))}
      </div>
    </div>
  );

  if (isWork) {
    return (
      <>
        <h2 className="title" style={{ marginBottom: 4 }}>{withTags ? tr('Session loggen') : tr('Zeit eintragen')}</h2>
        <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
          {category?.name} · {PTPeople.firstNameOf(me)}
        </div>

        {/* Timer */}
        <div className="work-timer-block">
          {timerStart ? (
            <>
              <div className="work-timer-display mono">{fmtElapsed(elapsedSec)}</div>
              <button className="btn btn-danger" onClick={stopTimer}>{tr('⏹ Stop')}</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startTimer}>{tr('▶ Timer starten')}</button>
          )}
        </div>

        {/* Manual duration input */}
        <div className="label" style={{ marginTop: 16, marginBottom: 0 }}>{tr('Minuten (manuell)')}</div>
        <Stepper value={durationMinutes} onChange={setDurationMinutes} step={withTags ? 15 : 5} min={0} />
        <div className="chip-row is-one-line" style={{ marginTop: 8 }}>
          {(withTags ? [30, 60, 90, 120] : [10, 15, 30, 60]).map((v) =>
            <button key={v} className="chip" onClick={() => setDurationMinutes(v)}>{v}m</button> // i18n-ignore: Einheit
          )}
        </div>

        {withTags && <>
        {/* Project tag picker */}
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>{tr('Projekt')}</div>
        {projectTags.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>{tr('Keine Projekte — in Einstellungen hinzufügen')}</div>
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
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>{tr('Tool')}</div>
        {toolTags.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '4px 0' }}>{tr('Keine Tools — in Einstellungen hinzufügen')}</div>
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
        </>}

        <input
          className="input"
          placeholder={tr('Notiz')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: 16 }} />
        {alsoFor}

        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
          <button className="btn" onClick={save} disabled={saving || durationMinutes <= 0}>
            {saving ? '…' : tr('{n}m loggen', { n: durationMinutes })}
          </button>
        </div>
      </>
    );
  }

  // Sports branch (original UI)
  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>{tr('Satz loggen')}</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {category?.name} · {PTPeople.firstNameOf(me)}
      </div>
      <input
        className="input input-lg mono"
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()} />
      <div className="chip-row is-one-line" style={{ marginTop: 12 }}>
        {[5, 10, 15, 20, 25, 30].map((v) =>
          <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
        )}
      </div>
      <input
        className="input"
        placeholder={tr('Notiz')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 16 }} />
      {alsoFor}
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={save} disabled={saving || reps <= 0}>
          {saving ? '…' : tr('+{n} loggen', { n: reps })}
        </button>
      </div>
    </>
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
    // 0 Runden lehnt die Datenbank ab (reps > 0); dann ist der Knopf ohnehin aus.
    if (rounds <= 0) return;
    setSaving(true);
    try {
      await api.addSet({
        challenge_id: challenge.id,
        athlete: me,
        reps: rounds,
        note: `Zeit: ${elapsedStr()}`, // i18n-ignore: steht in der DB und im Feed aller Mitglieder
      });
      localStorage.removeItem(TH_TIMER_KEY);
      localStorage.removeItem(TH_ROUNDS_KEY);
      localStorage.removeItem(TH_CHALL_KEY);
      onLogged(rounds);
    } catch (e) {
      alert(e.message || tr('Fehler'));
    } finally {
      setSaving(false);
    }
  }

  const timerRunning = !!timerStart && !timeUp;
  const canSave = rounds > 0;

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>{tr('20-Min-AMRAP')}</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {tr('🦸 5 Klimmzüge · 10 Liegestütze · 15 Squats · {name}', { name: PTPeople.firstNameOf(me) })}
      </div>

      {/* Countdown display */}
      <div className={`th-countdown${timeUp ? ' time-up' : ''}`}>
        {countdownStr}
      </div>

      {/* Start timer button — only before first start */}
      {!timerStart && (
        <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 20 }} onClick={startTimer}>
          {tr('▶ 20-Minuten-Timer starten')}
        </button>
      )}

      {/* Giant round counter button */}
      <div className="th-round-wrap">
        <button
          className="th-round-btn"
          onClick={addRound}
          disabled={!timerRunning && !timeUp}
          aria-label={tr('Runde hinzufügen')}>
          <span className="th-round-count">{rounds}</span>
          <span className="th-round-label">{tr('Runden')}</span>
          <span className="th-round-plus">＋</span>
        </button>
      </div>

      {timeUp && (
        <div className="th-time-up-banner">{tr('⏰ Zeit ist um! Drücke + für jede fertige Runde.')}</div>
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
            <div className="th-history-label">{tr('Diese Woche bisher')}</div>
            <div className="th-history-best mono">{trn(best, '{n} Rd. persönliches Best', '{n} Rd. persönliches Best')}</div>
            <div className="th-history-sets">
              {chSets.slice(-5).reverse().map(s => (
                <div key={s.id} className="th-history-row">
                  <span className="mono">{trn(s.reps, '{n} Rd.', '{n} Rd.')}</span>
                  {/* Notiz steht deutsch in der DB („Zeit: 12:34“, siehe saveSession) */}
                  <span className="th-history-time">{PTData.noteText(s.note) || ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={cancelSession}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={saveSession} disabled={saving || !canSave}>
          {saving ? '…' : trn(rounds, '{n} Runde loggen', '{n} Runden loggen')}
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
        note: value >= BSU_MAX_SEC ? null : `${bsuFmt(value)} von 3:24`, // i18n-ignore: steht in der DB und im Feed aller Mitglieder
      });
      onLogged(value);
    } catch (e) {
      alert(e.message || tr('Fehler'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* i18n-ignore: Name des Songs */}
      <h2 className="title" style={{ marginBottom: 4 }}>Bring Sally Up</h2>
      <div className="subtitle" style={{ marginBottom: 24, fontSize: 15 }}>
        {tr('🌸 Liegestütze zum Song · {name} · Max: 3:24', { name: PTPeople.firstNameOf(me) })}
      </div>

      {/* Success button */}
      <button
        className="bsu-done-btn"
        onClick={() => saveResult(BSU_MAX_SEC)}
        disabled={saving}
        aria-label={tr('Komplett geschafft')}>
        <span className="bsu-done-icon">✅</span>
        <span className="bsu-done-label">{tr('Geschafft! (3:24)')}</span>
      </button>

      {/* Partial progress */}
      <div className="bsu-partial">
        <div className="label" style={{ marginBottom: 12 }}>{tr('Nicht ganz... wie weit?')}</div>

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
          aria-label={tr('Zeitfortschritt')} />
        <div className="bsu-slider-val mono">{bsuFmt(sec)}</div>

        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 16 }}
          onClick={() => saveResult(sec)}
          disabled={saving}>
          {saving ? '…' : tr('{time} loggen', { time: bsuFmt(sec) })}
        </button>
      </div>

      {/* History: previous attempts this week */}
      {(() => {
        const chSets = allSets.filter(s => s.challenge_id === challenge?.id && s.athlete === me && s.reps != null);
        if (chSets.length === 0) return null;
        const best = Math.max(...chSets.map(s => s.reps));
        return (
          <div className="bsu-history">
            <div className="bsu-history-label">{tr('Bisherige Versuche diese Woche')}</div>
            <div className="bsu-history-sets">
              {chSets.slice(-5).reverse().map(s => (
                <div key={s.id} className="bsu-history-row">
                  <span className={`mono ${s.reps >= BSU_MAX_SEC ? 'bsu-hist-done' : ''}`}>
                    {s.reps >= BSU_MAX_SEC ? '✅ 3:24' : bsuFmt(s.reps)}
                  </span>
                  {s.reps === best && chSets.length > 1 && <span className="bsu-hist-best">{tr('🏆 Best')}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button className="btn-link" onClick={onClose}>{tr('Schließen')}</button>
      </div>
    </>
  );
}

// ─── FEED ────────────────────────────────────────────────────────────────────
// getShareText: nur auf der neuesten Karte (FeedScreen), liefert den Text für „Ergebnis teilen“.
function WeekRecap({ recap, me, sides = [], getShareText }) {
  const { week_start, challStats, totals = [], winnerIdx, sumAll, hitCount, totalChallenges, analysis,
    perSide = [], penCentsBySide = [], weekNumber } = recap;
  const isWorkWeek = challStats.length > 0 && challStats.every(c => PTData.usesMinutes(c.cat));
  const fmtRecapVal = (v) => isWorkWeek ? formatDuration(v) : v;
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
  const fmtD = (d) => PTi18n.date(d, { day: 'numeric', month: 'numeric' });
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
          <div className="recap-label">{tr('🏁 Wochenabschluss')}</div>
          {weekNumber != null && <div className="recap-week-num">{tr('Woche {n}', { n: weekNumber })}</div>}
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
            <div className="recap-winner-sub">{winner.userIds.length > 1 ? tr('gewinnen die Woche') : tr('gewinnt die Woche')}</div>
          </>
        ) : (
          <>
            <div className="recap-trophy">🤝</div>
            <div className="recap-winner-name tie">{tr('Unentschieden')}</div>
            <div className="recap-winner-sub">{isWorkWeek
              ? tr('{time} · gleichauf an der Spitze', { time: formatDuration(sumAll) })
              : trn(sumAll, '{n} Reps · gleichauf an der Spitze', '{n} Reps · gleichauf an der Spitze')}</div>
          </>
        )}
      </div>
      {twoSided ? (
        <div className="recap-tally">
          {recapTallySide(sides[0], false)}
          {/* i18n-ignore: in beiden Sprachen gleich */}
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
              <span className="mono mu-recap-podium-v" style={{ ...sideStyle(sides[i]), color: 'var(--sc)' }}>{fmtRecapVal(totals[i] || 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="recap-challs">
        {challStats.map((c, i) => (
          <div className="recap-chall" key={i}>
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
                  {ps.byCat.length === 0 ? tr('— keine Reps —') : ps.byCat.map((x, j) => (
                    <span key={j}>{j > 0 && ' · '}<span className="mono">{x.reps}</span> {x.name}</span>
                  ))}
                </div>
                {ps.setCount > 0 && (
                  <div className="recap-athlete-meta">
                    {trn(ps.setCount, 'in {n} Satz · größter {max}', 'in {n} Sätzen · größter {max}', {
                      n: <span className="mono">{ps.setCount}</span>,
                      max: <span className="mono">+{ps.maxSet}</span>,
                    })}
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
          <div className="recap-penalties-label">{tr('Neue Schulden')}</div>
          <div className="recap-penalties-row mu-wrap">
            {sides.map((side, i) => (
              <span key={side.key} className={`${i === 0 ? 'b' : 'j'} ${penCentsBySide[i] > 0 ? 'has' : ''}`}>
                {side.label} {penCentsBySide[i] > 0 ? `–${PTi18n.euro(penCentsBySide[i])}` : '✓'}
              </span>
            ))}
          </div>
        </div>
      )}
      {totalChallenges > 0 && (
        <div className="recap-foot">
          {trn(totalChallenges, '{done} von {n} Ziel erreicht', '{done} von {n} Zielen erreicht', { done: hitCount })}
        </div>
      )}
      {getShareText && (
        <div className="recap-share">
          <ShareResultButton getText={getShareText} title={tr('Wochenergebnis')} />
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
      <h2 className="title" style={{ marginBottom: 4 }}>{tr('Reaktion hinzufügen')}</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {tr('Tippe einen Emoji ein (iOS-Tastatur 🌐 → Emoji)')}
      </div>
      <input
        className="input input-lg"
        type="text"
        value={val}
        autoFocus
        placeholder={tr('z. B. 🔥')}
        style={{ textAlign: 'center', fontSize: 32 }}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={submit} disabled={!val.trim()}>{tr('Hinzufügen')}</button>
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
  // Ohne führende Null (en-GB „07/09“ → „7/9“), sonst stoßen bei „All“ die
  // Beschriftungen auf schmalen Geräten aneinander.
  const fmt = (s) => PTi18n.day(s, { day: 'numeric', month: 'numeric' }).replace(/\b0(?=\d)/g, '');

  // Y labels — 5 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxV));

  // Week boundaries — Mondays within the range
  const allWeekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = localDay(axis[i].date);
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
          <text x={xPos(idx)} y={PAD_Y * 0.6} fill="var(--text-2)" fontSize="10" textAnchor="middle" opacity="0.8">{tr('KW {week}', { week: kw })}</text>
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
              cx={xPos(activeIdx)} cy={yScale(s.data[activeIdx]?.reps ?? 0)}
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
  // Der Effect läuft erst nach dem Render. Darum den Index beim Wechsel sofort
  // zurücksetzen und unten zusätzlich auf die aktuelle Länge begrenzen –
  // sonst greift die Leiste auf einen Tag zu, den es im kürzeren Zeitraum nicht gibt.
  const pickRange = (r) => { setActiveIdx(null); setRange(r); };

  // Resolve which series to render based on cumulative flag.
  const shown = cumulative ? cumSeries : series;
  const axis = shown[0]?.data || [];
  const idx = activeIdx != null && activeIdx >= 0 && activeIdx < axis.length ? activeIdx : null;

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

  const fmtDate = (iso) => PTi18n.day(iso, { day: '2-digit', month: 'short', year: 'numeric' });


  return (
    <div className="chart-fs">
      <div className="chart-fs-top">
        <button className="chart-fs-close" onClick={onClose} aria-label={tr('Schließen')}>✕</button>
        <div className="chart-fs-title">{title}</div>
        <div className="chart-fs-controls">
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>pickRange('7')}>{tr('{n}T', { n: 7 })}</button>
            <button className={range==='30'?'active':''} onClick={()=>pickRange('30')}>{tr('{n}T', { n: 30 })}</button>
            <button className={range==='all'?'active':''} onClick={()=>pickRange('all')}>{tr('All')}</button>
          </div>
          <div className="segmented segmented-sm">
            <button className={cumulative?'active':''} onClick={()=>setCumulative(true)} aria-label={tr('Kumuliert')}>Σ</button>
            <button className={!cumulative?'active':''} onClick={()=>setCumulative(false)} aria-label={tr('Pro Tag')}>{tr('Tag')}</button>
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
          activeIdx={idx}
          vw={bodySize.w}
          vh={bodySize.h}
        />
      </div>

      <div className="chart-fs-bottom">
        {idx === null ? (
          <div className="chart-fs-hint">{tr('Tippe in das Diagramm für Tageswerte')}</div>
        ) : (
          <div className="chart-fs-values">
            <span className="chart-fs-date">{fmtDate(axis[idx].date)}</span>
            {shown.map(s => (
              <span key={s.key} className="chart-fs-val side-n" style={{ '--sc': s.color }}>{s.label}: <b>{s.data[idx]?.reps ?? 0}</b></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// onSubmit({ challenge, category, values, createdAt }): trägt den Satz ein (CompetitionApp
// schreibt ihn in alle Challenges mit derselben Übung); ohne onSubmit direkt per api.addSet.
function BackfillSheet({ api, me, challenges = [], categories = [], projectTags = [], toolTags = [], onClose, onSaved, onSubmit }) {
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
  const isWork = PTData.usesMinutes(selectedCat);
  const withTags = selectedCat?.kind === 'work';
  // Pflicht-Workouts zählen Sekunden bzw. Runden: keine Wiederholungs-Rückfrage.
  const isWorkout = PTData.isWorkoutType(selectedCat?.challenge_type);

  async function save() {
    if (!challengeId) return;
    if (isWork ? durationMinutes <= 0 : reps <= 0) return;
    if (!isWork && !isWorkout && !confirmReps(reps)) return;
    setSaving(true);
    try {
      const [y, m, d] = dateIso.split('-').map(Number);
      // Vergangene Tage: 12:00 Uhr, damit der Satz berechenbar einsortiert wird.
      // Heute: jetzt – 12:00 läge am Vormittag in der Zukunft und stünde im Feed
      // über neueren Sätzen.
      const created = dateIso === todayIso ? new Date() : new Date(y, m - 1, d, 12, 0, 0);
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
      if (onSubmit) {
        const { challenge_id, athlete, note, created_at, ...values } = payload;
        await onSubmit({ challenge: selectedChallenge, category: selectedCat, values, createdAt: created_at });
      } else await api.addSet(payload);
      onSaved?.(isWork ? durationMinutes : reps, isWork);
    } catch (e) {
      alert(e.message || tr('Fehler'));
    } finally {
      setSaving(false);
    }
  }

  const dayLabels = PTi18n.weekdays();

  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>{tr('Nachtrag')}</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {tr('Satz für diese Woche nachtragen')}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>{tr('Tag')}</div>
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
              {tr('{weekday} {day}.', { weekday: dayLabels[i], day: d.getDate() })}
            </button>
          );
        })}
      </div>

      <div className="label" style={{ marginBottom: 8 }}>{tr('Challenge')}</div>
      {challenges.length === 0 ? (
        <div className="subtitle" style={{ marginBottom: 16 }}>{tr('Keine Challenges diese Woche')}</div>
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
          <div className="label" style={{ marginBottom: 0 }}>{tr('Minuten')}</div>
          <Stepper value={durationMinutes} onChange={setDurationMinutes} step={withTags ? 15 : 5} min={withTags ? 15 : 1} />
          <div className="chip-row is-one-line" style={{ marginTop: 8 }}>
            {(withTags ? [30, 60, 90, 120] : [10, 15, 30, 60]).map(v =>
              <button key={v} className="chip" onClick={() => setDurationMinutes(v)}>{v}m</button> // i18n-ignore: Einheit
            )}
          </div>
          {withTags && <>
          <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>{tr('Projekt')}</div>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {projectTags.map(t =>
              <button key={t.id}
                className={`chip ${projectTagId === t.id ? 'chip-active' : ''}`}
                onClick={() => setProjectTagId(prev => prev === t.id ? null : t.id)}>
                {t.emoji} {t.name}
              </button>
            )}
          </div>
          <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>{tr('Tool')}</div>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {toolTags.map(t =>
              <button key={t.id}
                className={`chip ${toolTagId === t.id ? 'chip-active' : ''}`}
                onClick={() => setToolTagId(prev => prev === t.id ? null : t.id)}>
                {t.emoji} {t.name}
              </button>
            )}
          </div>
          </>}
        </>
      ) : (
        <>
          <div className="label" style={{ marginBottom: 8 }}>{tr('Reps')}</div>
          <input
            className="input input-lg mono"
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.target.select()} />

          <div className="chip-row is-one-line" style={{ marginTop: 12 }}>
            {[5, 10, 15, 20, 25, 30].map((v) =>
              <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
            )}
          </div>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={save}
          disabled={saving || !challengeId || (isWork ? durationMinutes <= 0 : reps <= 0)}>
          {saving ? '…' : isWork ? tr('+{n}min nachtragen', { n: durationMinutes }) : tr('+{n} nachtragen', { n: reps })}
        </button>
      </div>
    </>
  );
}

// WeekFixCard kommt aus settings.jsx (die Kopie hier ist entfernt).
Object.assign(window, { HomeScreen, SetupSheet, LogSheet, WeekRecap, bsuFmt, BSU_MAX_SEC, BackfillSheet, FullscreenChart, ChartFullscreen, EmojiPickerSheet, TomHollandSheet, BringSallySheet,
  confirmReps, shareResultText, ShareResultButton });
