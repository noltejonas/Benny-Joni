/* global React, PTData, PTStats, PTPeople, Avatar, SideAvatar, Icon, ChartFullscreen, GapChart, RaceChart, ActivityHeatmap, sideFill, sideInk, sideName, buildSides, formatDuration, weekNumber, tr, trn, PTi18n */
// Stats-Tab: Challenge | Ich (alle Challenges) | Duelle
//
// Aufbau pro Vergleich, jede Karte beantwortet eine Frage:
//   Bilanz     – wer gewinnt die Wochen?          (Wochensiege, Reps gesamt)
//   Vorsprung  – wie hat sich das entwickelt?     (Duell: Vorsprung, sonst kumulierte Reps)
//   Wochen     – Ergebnisse Woche für Woche       (aufklappbar bis auf jede Übung)
//   Kategorien – wer ist wo stärker?
//   Kennzahlen – Zielquote, Konstanz, Bestwerte
// Rechenlogik: www/stats-model.js (PTStats).

const fmtNum = (n) => PTi18n.number(n ?? 0);
const fmtPct = (r) => (r == null ? '–' : PTi18n.number(r, { style: 'percent', maximumFractionDigits: 0 }));

// Workout-Werte ohne Einheit: Tom Holland als Rundenzahl, Bring Sally Up als Zeit
const fmtWorkout = (type, v) => (type === 'tom_holland' ? fmtNum(v) : PTData.workoutValueLabel(type, v));
function fmtWorkoutRuns(type, sets) {
  if (!sets.length) return '0×';
  const vals = [...sets]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(s => fmtWorkout(type, s.reps));
  return `${sets.length}× · ${vals.join(', ')}`;
}

// „12.–18.10.“ bzw. „28.9.–4.10.“ über den Monatswechsel (englisch „12/10–18/10“, „28/09–04/10“)
const weekDayFmt = new Intl.DateTimeFormat(PTi18n.locale, { day: 'numeric', month: 'numeric' });
function fmtWeekRange(weekStart) {
  const a = new Date(weekStart + 'T00:00:00');
  const b = new Date(a); b.setDate(a.getDate() + 6);
  return a.getMonth() === b.getMonth()
    ? weekDayFmt.formatRange(a, b).replace(/\s*–\s*/, '–')
    : `${weekDayFmt.format(a)}–${weekDayFmt.format(b)}`;
}

function StatsTab({ api, me, profile, competition, sides, members, challenges, categories, allSets }) {
  const [view, setView] = React.useState(() => {
    try { return sessionStorage.getItem('pt_stats_view') || 'challenge'; } catch (e) { return 'challenge'; }
  });
  const switchView = (v) => { setView(v); try { sessionStorage.setItem('pt_stats_view', v); } catch (e) {} };

  // Cross-Challenge-Daten erst laden, wenn „Ich“ oder „Duelle“ geöffnet wird.
  const [bundle, setBundle] = React.useState(null);
  const [comps, setComps] = React.useState([]);
  const [error, setError] = React.useState('');
  const load = React.useCallback(async () => {
    setError('');
    try {
      // Freies Training zählt in „Ich“ mit, ist aber keine eigene Challenge.
      const list = await api.listMyCompetitions({ includeSolo: true });
      const b = await api.getStatsBundle(list.map(c => c.id));
      PTData.annotateWorkouts(b.sets, b.challenges, b.categories);
      PTPeople.set(b.members.map(m => m.profile).filter(Boolean));
      setComps(list.filter(c => c.mode !== 'solo'));
      setBundle(b);
    } catch (e) { setError(e.message); }
  }, [api]);
  React.useEffect(() => { if (view !== 'challenge' && !bundle) load(); }, [view, bundle, load]);
  // Noch keine Woche vorbei: Hinweis statt rätselhafter Nullkarten.
  const monday = PTData.isoDate(PTData.mondayOf(new Date()));
  const firstWeek = challenges.length > 0 && !challenges.some(c => c.week_start < monday);

  return (
    <>
      <div className="segmented mu-stats-switch">
        <button className={view === 'challenge' ? 'active' : ''} onClick={() => switchView('challenge')}>{tr('Challenge')}</button>
        <button className={view === 'me' ? 'active' : ''} onClick={() => switchView('me')}>{tr('Ich')}</button>
        <button className={view === 'duel' ? 'active' : ''} onClick={() => switchView('duel')}>{tr('Duelle')}</button>
      </div>
      {view === 'challenge' && firstWeek && (
        <div className="ob-note"><span className="ob-note-emoji" aria-hidden="true">📊</span>
          {tr('Woche 1 läuft. Ab Montag steht hier eure erste Bilanz.')}</div>
      )}
      {view === 'challenge' && (
        <ChallengeStats sides={sides} members={members} challenges={challenges} categories={categories} sets={allSets} />
      )}
      {view !== 'challenge' && !bundle && (
        error
          ? <div className="empty"><div className="title">{tr('Laden fehlgeschlagen')}</div><div>{error}</div>
              <button className="btn" style={{ marginTop: 16 }} onClick={load}>{tr('Erneut versuchen')}</button></div>
          : <div className="app-loader"><div className="app-loader-spinner" /><div className="app-loader-text">{tr('Lade Stats…')}</div></div>
      )}
      {view === 'me' && bundle && <AllTimeStats me={me} profile={profile} bundle={bundle} comps={comps} />}
      {view === 'duel' && bundle && <DuelStats me={me} bundle={bundle} comps={comps} />}
    </>
  );
}

// ─── Vergleich (Challenge & Duell) ──────────────────────────────────────────
// title: Überschrift der Vollbild-Ansicht (z.B. „Du vs. Jonas“)
// comps: nur im Duell, um gleiche Übungen aus mehreren Challenges zu unterscheiden
function ChallengeStats({ sides, members = [], challenges, categories, sets, title, comps = [] }) {
  // Filter nach Übungen (leer = alle mit Wiederholungen)
  const [keys, setKeys] = React.useState([]);
  const f = React.useMemo(
    () => PTStats.applyExerciseFilter({ challenges, sets, categories, keys }),
    [challenges, sets, categories, keys],
  );
  const st = React.useMemo(
    () => PTStats.challengeStats({ sides, challenges: f.challenges, categories, sets: f.sets, members, kinds: f.kinds }),
    [sides, f, categories, members],
  );
  const fmtVal = f.unit === 'min' ? (v) => formatDuration(v ?? 0) : fmtNum;
  const pick = (key) => { setKeys(k => (k.length === 1 && k[0] === key ? [] : [key])); window.scrollTo?.({ top: 0, behavior: 'smooth' }); };

  if (!challenges.length || !sides.length) {
    return <div className="rd-empty"><div className="rd-empty-title">{tr('Noch keine Historie')}</div>
      <div className="rd-empty-text">{tr('Sobald ihr ein Wochenziel habt, geht es hier los.')}</div></div>;
  }
  if (!st.weeks.length) {
    return <div className="rd-empty"><div className="rd-empty-title">{tr('Noch keine Sport-Challenges')}</div>
      <div className="rd-empty-text">{tr('Sobald ihr Sport-Ziele loggt, erscheinen hier eure Stats.')}</div></div>;
  }
  return (
    <>
      <ExerciseChips options={f.options} keys={keys} onChange={setKeys} />
      <ScoreCard st={st} sides={sides} unit={f.unit} fmtVal={fmtVal} />
      <TrendCard st={st} sides={sides} title={title} unit={f.unit} fmtVal={fmtVal} />
      {st.categories.length > (f.filtered ? 0 : 1) && <ExerciseRace st={st} sides={sides} fmtVal={fmtVal} keys={keys} onPick={pick} />}
      <WeeksCard st={st} sides={sides} comps={comps} fmtVal={fmtVal} />
      <RecordsCard st={st} sides={sides} fmtVal={fmtVal} />
    </>
  );
}

// Filter-Chips: Alle oder einzelne Übungen (mehrere wählbar)
function ExerciseChips({ options, keys, onChange }) {
  if (options.length < 2) return null;
  return (
    <div className="rk-chips stats-chips" role="group" aria-label={tr('Nach Übung filtern')}>
      <button className={`rk-chip ${!keys.length ? 'active' : ''}`} aria-pressed={!keys.length} onClick={() => onChange([])}>{tr('Alle')}</button>
      {options.map(o => {
        const on = keys.includes(o.key);
        return (
          <button key={o.key} className={`rk-chip ${on ? 'active' : ''}`} aria-pressed={on}
            onClick={() => onChange(on ? keys.filter(k => k !== o.key) : [...keys, o.key])}>
            {o.cat?.name}{o.minutes ? ' ⏱' : ''}
          </button>
        );
      })}
    </div>
  );
}

function CardHead({ label, children }) {
  return <div className="stats-head"><span className="label">{label}</span>{children}</div>;
}

function SideLegend({ sides }) {
  return (
    <span className="stats-legend">
      {sides.map(s => <span key={s.key}><i style={{ background: sideFill(s) }} />{sideName(s)}</span>)}
    </span>
  );
}

function ScoreCard({ st, sides, unit = 'reps', fmtVal = fmtNum }) {
  const amount = (v) => (unit === 'min' ? fmtVal(v) : trn(v, '{n} Rep', '{n} Reps', { n: fmtNum(v) }));
  const meta = st.decided > 0 && <span className="stats-meta">{trn(st.decided, '{n} Woche', '{n} Wochen')}</span>;

  if (sides.length === 2) {
    const [a, b] = st.totals;
    const share = a + b ? (a / (a + b)) * 100 : 50;
    return (
      <section className="card rd-duel stats-score" aria-label={tr('Bilanz')}>
        <CardHead label={tr('Bilanz')}>{meta}</CardHead>
        <div className="rd-duel-main">
          {[0, null, 1].map(i => i == null ? (
            <div key="score" className="rd-duel-score">
              <div className="rd-duel-num">
                <span style={{ color: sideInk(sides[0]) }}>{st.wins[0]}</span> : <span style={{ color: sideInk(sides[1]) }}>{st.wins[1]}</span>
              </div>
              <div className="rd-duel-cap">{tr('Wochensiege')}{st.ties ? ` · ${trn(st.ties, '{n} Remis', '{n} Remis')}` : ''}</div>
            </div>
          ) : (
            <div key={sides[i].key} className="rd-duel-player">
              <SideAvatar side={sides[i]} size={sides[i].userIds.length > 1 ? 44 : 56} />
              <span>{sideName(sides[i])}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="rd-split" role="img" aria-label={tr('Reps gesamt: {name1} {reps1}, {name2} {reps2}', { name1: sideName(sides[0]), reps1: fmtNum(a), name2: sideName(sides[1]), reps2: fmtNum(b) })}>
            <div className="rd-split-a" style={{ width: `${share}%`, '--sc': sideFill(sides[0]) }} />
            <div className="rd-split-b" style={{ '--sc': sideFill(sides[1]) }} />
          </div>
          <div className="stats-split-legend mono">
            <span>{amount(a)}</span><span>{amount(b)}</span>
          </div>
        </div>
      </section>
    );
  }

  // Drei und mehr Seiten: Tabelle nach Wochensiegen, bei Gleichstand nach Reps
  const order = sides.map((_, i) => i).sort((x, y) => st.wins[y] - st.wins[x] || st.totals[y] - st.totals[x]);
  return (
    <section className="card" aria-label={tr('Tabelle')}>
      <CardHead label={tr('Tabelle')}>{meta}</CardHead>
      <table className="stats-table stats-standings">
        <thead><tr><th className="stats-pos">#</th><th /><th>{tr('Siege')}</th><th>{unit === 'min' ? tr('Minuten') : tr('Reps')}</th></tr></thead>
        <tbody>
          {order.map((i, pos) => (
            <tr key={sides[i].key} className={sides[i].isMine ? 'is-me' : ''}>
              <td className="stats-pos mono">{pos + 1}</td>
              <td><span className="stats-who"><SideAvatar side={sides[i]} size={26} /><span>{sideName(sides[i])}</span></span></td>
              <td className="mono">{st.wins[i]}</td>
              <td className="mono">{fmtVal(st.totals[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TrendCard({ st, sides, title, unit = 'reps', fmtVal = fmtNum }) {
  const duel = sides.length === 2;
  const [fullscreen, setFullscreen] = React.useState(false);
  const [range, setRange] = React.useState('all');
  const [cumulative, setCumulative] = React.useState(true);
  const cum = React.useMemo(() => PTStats.cumulative(st.daily), [st]);
  const gap = React.useMemo(() => (duel ? PTStats.gapSeries(st.daily) : null), [st, duel]);
  const last = gap ? gap[gap.length - 1] : 0;
  const leadSide = last > 0 ? sides[0] : last < 0 ? sides[1] : null;

  // Vollbild: Tageswerte bzw. kumuliert ab Beginn des gewählten Zeitraums
  const from = range === 'all' ? 0 : Math.max(0, st.dates.length - Number(range));
  const dates = st.dates.slice(from);
  const daily = st.daily.map(arr => arr.slice(from));
  const asSeries = (arrs) => arrs.map((arr, i) => ({
    key: sides[i].key, label: sideName(sides[i]), color: sideFill(sides[i]),
    data: arr.map((v, k) => ({ date: dates[k], reps: v })),
  }));
  const open = () => setFullscreen(true);

  return (
    <>
      <section className="card stats-trend" role="button" tabIndex={0} aria-label={tr('Verlauf im Vollbild öffnen')}
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
        <CardHead label={duel ? tr('Vorsprung') : tr('Verlauf')}>
          <span className="stats-head-right">
            {duel
              ? (leadSide
                ? <span className="stats-lead mono" style={{ color: sideInk(leadSide) }}>{sideName(leadSide)} +{fmtVal(Math.abs(last))}</span>
                : <span className="stats-meta">{tr('Gleichstand')}</span>)
              : <span className="stats-meta">{unit === 'min' ? tr('Minuten kumuliert') : tr('Reps kumuliert')}</span>}
            <Icon name="expand" size={14} color="var(--text-3)" />
          </span>
        </CardHead>
        {duel
          ? <GapChart dates={st.dates} gap={gap} sides={sides} />
          : <RaceChart dates={st.dates} cum={cum} sides={sides} />}
      </section>
      {fullscreen && (
        <ChartFullscreen
          title={title || (duel ? tr('{name1} vs. {name2}', { name1: sideName(sides[0]), name2: sideName(sides[1]) }) : unit === 'min' ? tr('Minuten im Verlauf') : tr('Reps im Verlauf'))}
          series={asSeries(daily)}
          cumSeries={asSeries(PTStats.cumulative(daily))}
          totalDays={dates.length}
          range={range}
          setRange={setRange}
          cumulative={cumulative}
          setCumulative={setCumulative}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}

const WEEKS_SHOWN = 6;

function WeeksCard({ st, sides, comps, fmtVal = fmtNum }) {
  const [openWeek, setOpenWeek] = React.useState(null);
  const [showAll, setShowAll] = React.useState(false);
  const weeks = showAll ? st.weeks : st.weeks.slice(0, WEEKS_SHOWN);

  return (
    <section className="card stats-weeks" aria-label={tr('Wochen')}>
      <CardHead label={tr('Wochen')}>{sides.length === 2 && <SideLegend sides={sides} />}</CardHead>
      <ul className="stats-week-list">
        {weeks.map(w => {
          const isOpen = openWeek === w.weekStart;
          return (
            <li key={w.weekStart} className={isOpen ? 'is-open' : ''}>
              <button className="stats-week" aria-expanded={isOpen} onClick={() => setOpenWeek(isOpen ? null : w.weekStart)}>
                <span className="stats-week-kw"><b>{tr('KW {n}', { n: weekNumber(w.weekStart) })}</b><small>{fmtWeekRange(w.weekStart)}</small></span>
                <WeekBar w={w} sides={sides} fmtVal={fmtVal} />
                <span className="stats-week-res">
                  {w.current ? <span className="stats-live">{tr('läuft')}</span>
                    : w.winner != null ? <SideAvatar side={sides[w.winner]} size={24} />
                    : <span className="stats-tie">{w.active ? '=' : '–'}</span>}
                </span>
                <span className="stats-chev"><Icon name="chevron" size={16} /></span>
              </button>
              {isOpen && <WeekDetail w={w} sides={sides} comps={comps} fmtVal={fmtVal} />}
            </li>
          );
        })}
      </ul>
      {st.weeks.length > WEEKS_SHOWN && (
        <button className="stats-more" onClick={() => setShowAll(v => !v)}>
          {showAll ? tr('Weniger anzeigen') : tr('Alle {n} Wochen', { n: st.weeks.length })}
        </button>
      )}
    </section>
  );
}

function WeekBar({ w, sides, fmtVal = fmtNum }) {
  const wide = fmtVal !== fmtNum; // Minuten brauchen mehr Platz („1h 15m“)
  const segs = sides.map((s, i) => ({ s, v: w.totals[i] })).filter(x => x.v > 0);
  const bar = (
    <span className="stats-bar">
      {segs.map(({ s, v }) => <i key={s.key} style={{ flex: v, background: sideFill(s) }} />)}
    </span>
  );
  if (sides.length !== 2) return <span className="stats-week-bar is-multi">{bar}</span>;
  return (
    <span className={`stats-week-bar${wide ? ' is-wide' : ''}`}>
      <span className={`mono ${w.winner === 0 ? 'is-win' : ''}`}>{fmtVal(w.totals[0])}</span>
      {bar}
      <span className={`mono ${w.winner === 1 ? 'is-win' : ''}`}>{fmtVal(w.totals[1])}</span>
    </span>
  );
}

function WeekDetail({ w, sides, comps, fmtVal = fmtNum }) {
  const multiComp = new Set(w.rows.map(r => r.ch.competition_id)).size > 1;
  const compName = (ch) => comps.find(c => c.id === ch.competition_id)?.name;
  return (
    <div className="stats-wd">
      <div className="stats-wd-goals">
        {sides.map((s, i) => (
          <span key={s.key}>{trn(w.goals[i], '{name} {n} Ziel', '{name} {n} Ziele', {
            name: <b style={{ color: sideInk(s) }}>{sideName(s)}</b>,
            n: <span className="mono">{w.goalsHit[i]}/{w.goals[i]}</span>,
          })}</span>
        ))}
      </div>
      {w.rows.map(({ ch, cat, share, perSide }) => (
        <div className="stats-wd-row" key={ch.id}>
          <div className="stats-wd-name">
            <span>{cat?.name}{multiComp && <span className="stats-muted"> · {compName(ch)}</span>}</span>
            <small className="mono">{ch.workout ? tr('1× p. P.') : tr('{n} p. P.', { n: fmtVal(share) })}</small>
          </div>
          {perSide.map((p, i) => (
            <div className="stats-wd-side" key={sides[i].key}>
              <span className="stats-wd-who" style={{ color: sideInk(sides[i]) }}>{sides[i].short}</span>
              {ch.workout ? (
                <span className="stats-wd-val is-wide mono">{fmtWorkoutRuns(ch.workout, p.sets)}</span>
              ) : (
                <>
                  <span className="stats-wd-track">
                    <i style={{ width: `${p.goal ? Math.min(100, (100 * p.value) / p.goal) : 0}%`, background: sideFill(sides[i]) }} />
                  </span>
                  <span className="stats-wd-val mono">{fmtVal(p.value)}/{fmtVal(p.goal)}</span>
                </>
              )}
              <span className={`stats-wd-hit ${p.hit ? 'is-hit' : ''}`} aria-label={p.hit ? tr('Ziel erfüllt') : tr('Ziel offen')}>
                {p.hit ? <Icon name="check" size={14} strokeWidth={3} /> : null}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Nach Übung: jede Seite mit eigenem Balken, die Balken laufen gegeneinander.
// Antippen filtert die ganze Ansicht auf diese Übung.
function ExerciseRace({ st, sides, fmtVal, keys, onPick }) {
  const duel = sides.length === 2;
  return (
    <section className="card" aria-label={tr('Nach Übung')}>
      <CardHead label={tr('Nach Übung')}>{duel && <SideLegend sides={sides} />}</CardHead>
      <div className="stats-race">
        {st.categories.map(({ key, cat, vals, leader }) => {
          const max = Math.max(1, ...vals);
          const sorted = [...vals].sort((a, b) => b - a);
          const diff = sorted[0] - (sorted[1] ?? 0);
          let order = sides.map((_, i) => i);
          if (!duel) {
            order = order.sort((a, b) => vals[b] - vals[a]).slice(0, 4);
            if (!order.includes(0)) order[order.length - 1] = 0;
          }
          const on = keys.length === 1 && keys[0] === key;
          return (
            <button type="button" key={key} className={`stats-race-item${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onPick(key)}>
              <span className="stats-race-head">
                <span className="stats-race-name">{cat?.name}</span>
                {leader != null
                  ? <span className="stats-race-lead" style={{ color: sideInk(sides[leader]) }}>👑 {sideName(sides[leader])} <span className="mono">+{fmtVal(diff)}</span></span>
                  : <span className="stats-race-tie">{vals.some(v => v > 0) ? tr('Gleichstand') : '–'}</span>}
              </span>
              {order.map(i => (
                <span key={sides[i].key} className={`stats-race-row${leader === i ? ' is-lead' : leader != null ? ' is-trail' : ''}`}>
                  <span className="stats-race-who" style={{ color: sideInk(sides[i]) }}>{duel ? sideName(sides[i]) : sides[i].short}</span>
                  <span className="stats-race-track"><i style={{ width: `${(vals[i] / max) * 100}%`, background: sideFill(sides[i]) }} /></span>
                  <span className="stats-race-val mono">{fmtVal(vals[i])}</span>
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecordsCard({ st, sides, fmtVal = fmtNum }) {
  const r = st.records;
  const rows = [
    { label: tr('Ziele erfüllt'), vals: r.goalRate, fmt: fmtPct },
    { label: tr('Aktive Tage'), vals: r.activeDays },
    { label: tr('Längste Serie'), vals: r.longestStreak },
    { label: tr('Bester Tag'), vals: r.bestDay, fmt: fmtVal },
    { label: tr('Beste Woche'), vals: r.bestWeek, fmt: fmtVal },
    { label: tr('Größter Satz'), vals: r.maxSet, fmt: fmtVal },
    ...r.workouts.map(wk => ({
      label: wk.cat?.name || tr('Workout'), vals: wk.best,
      fmt: (v) => (v == null ? '–' : fmtWorkout(wk.type, v)),
    })),
  ];
  const show = (row, v) => (row.fmt ? row.fmt(v) : fmtNum(v));

  if (sides.length === 2) {
    return (
      <section className="card" aria-label={tr('Kennzahlen')}>
        <CardHead label={tr('Kennzahlen')} />
        <table className="stats-table stats-records">
          <thead>
            <tr><th />{sides.map(s => <th key={s.key} style={{ color: sideInk(s) }}>{sideName(s)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const lead = PTStats.leaderIndex(row.vals);
              return (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {sides.map((s, i) => (
                    <td key={s.key} className={`mono ${lead === i ? 'is-win' : lead != null ? 'is-lose' : ''}`}
                      style={lead === i ? { color: sideInk(s) } : undefined}>{show(row, row.vals[i])}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  // Drei und mehr Seiten: Bestwert und wer ihn hält (bei Gleichstand alle)
  return (
    <section className="card" aria-label={tr('Bestwerte')}>
      <CardHead label={tr('Bestwerte')} />
      <table className="stats-table stats-holders">
        <tbody>
          {rows.map(row => {
            const best = Math.max(...row.vals.map(v => v ?? 0));
            const holders = best > 0 ? sides.filter((_, i) => row.vals[i] === best) : [];
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>
                  {holders.length === 1 && <span className="stats-who"><SideAvatar side={holders[0]} size={22} /><span>{sideName(holders[0])}</span></span>}
                  {holders.length > 1 && (
                    <span className="stats-who-stack" aria-label={holders.map(sideName).join(', ')}>
                      {holders.slice(0, 4).map(s => <SideAvatar key={s.key} side={s} size={22} />)}
                    </span>
                  )}
                </td>
                <td className="mono">{holders.length ? show(row, best) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ─── Ich (alle Challenges) ──────────────────────────────────────────────────
function AllTimeStats({ me, profile, bundle, comps }) {
  const today = PTData.isoDate(new Date());
  const [keys, setKeys] = React.useState([]);
  const f = React.useMemo(
    () => PTStats.applyExerciseFilter({ challenges: bundle.challenges, sets: bundle.sets, categories: bundle.categories, keys }),
    [bundle, keys],
  );
  const stats = React.useMemo(() => {
    const sidesByComp = {};
    for (const c of comps) sidesByComp[c.id] = buildSides(c, bundle.members.filter(m => m.competition_id === c.id), me);
    return PTStats.personalStats({ me, comps, sidesByComp, bundle: { ...bundle, challenges: f.challenges, sets: f.sets }, today, kinds: f.kinds });
  }, [bundle, comps, me, today, f]);
  const fmtVal = f.unit === 'min' ? (v) => formatDuration(v ?? 0) : fmtNum;

  if (!f.filtered && !stats.setCount && !stats.categories.length) {
    return <div className="empty"><div className="title">{tr('Noch keine Daten')}</div><div>{tr('Logge deinen ersten Satz.')}</div></div>;
  }

  return (
    <>
      <ExerciseChips options={f.options} keys={keys} onChange={setKeys} />
      <section className="card stats-me" aria-label={tr('Überblick')}>
        <div className="stats-me-head">
          <Avatar profile={profile} size={48} />
          <div>
            <div className="stats-me-name">{profile.display_name}</div>
            <div className="stats-meta">{trn(comps.length, '{n} Challenge', '{n} Challenges')}</div>
          </div>
        </div>
        <div className="stats-kpis">
          <div><b className="mono">{fmtVal(stats.totalReps)}</b><span>{f.unit === 'min' ? tr('Minuten') : tr('Reps')}</span></div>
          <div><b className="mono">{fmtNum(stats.activeDays)}</b><span>{tr('Aktive Tage')}</span></div>
          <div><b className="mono">{fmtPct(stats.goalRate)}</b><span>{tr('Ziele erfüllt')}</span></div>
        </div>
      </section>

      <section className="card" aria-label={tr('Aktivität')}>
        <CardHead label={tr('Aktivität')}>
          <span className="stats-meta">{tr('Serie {streak} · Rekord {record}', {
            streak: <b className="mono">{stats.streak}</b>,
            record: <b className="mono">{stats.longestStreak}</b>,
          })}</span>
        </CardHead>
        <ActivityHeatmap repsByDay={stats.repsByDay} today={today} />
      </section>

      <section className="card" aria-label={tr('Übungen')}>
        <table className="stats-table stats-ex">
          <thead><tr><th /><th>{tr('Gesamt')}</th><th>{tr('Max. Satz')}</th><th>{tr('Max. Tag')}</th></tr></thead>
          <tbody>
            {stats.categories.map(e => {
              const type = e.cat?.challenge_type;
              const cells = e.kind === 'work'
                ? [formatDuration(e.total), formatDuration(e.maxSet), formatDuration(e.bestDay)]
                : e.kind === 'workout'
                  ? [`${e.total}×`, fmtWorkout(type, e.maxSet), '–']
                  : [fmtNum(e.total), fmtNum(e.maxSet), fmtNum(e.bestDay)];
              return (
                <tr key={e.cat?.id}>
                  <td><span className="stats-ex-name">{e.cat?.name || '—'}</span></td>
                  {cells.map((v, k) => <td key={k} className="mono">{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {stats.perComp.length > 0 && (
        <section className="card" aria-label={tr('Challenges')}>
          <CardHead label={tr('Challenges')}><span className="stats-meta">{trn(stats.weeksWon, '{n} Wochensieg', '{n} Wochensiege')}</span></CardHead>
          <ul className="stats-comps">
            {stats.perComp.map(({ c, played, wins, total, rank, of }) => (
              <li key={c.id}>
                <span className="stats-comp-text">
                  <span className="stats-comp-name">{c.name}</span>
                  <span className="stats-meta">{tr('{wins}/{played} Siege', { wins, played })} · {f.unit === 'min' ? fmtVal(total) : trn(total, '{n} Rep', '{n} Reps', { n: fmtNum(total) })}</span>
                </span>
                <span className="stats-comp-rank"><b className="mono">{tr('{rank}.', { rank })}</b><small>{tr('von {total}', { total: of })}</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─── Duelle ─────────────────────────────────────────────────────────────────
function DuelStats({ me, bundle, comps }) {
  // Alle, mit denen ich mindestens eine Challenge teile
  const opponents = React.useMemo(() => {
    const myComps = new Set(bundle.members.filter(m => m.user_id === me).map(m => m.competition_id));
    const map = {};
    for (const m of bundle.members) {
      if (m.user_id === me || !myComps.has(m.competition_id) || !m.profile) continue;
      const e = map[m.user_id] ||= { profile: m.profile, compIds: new Set() };
      e.compIds.add(m.competition_id);
    }
    return Object.values(map).sort((a, b) => b.compIds.size - a.compIds.size || a.profile.display_name.localeCompare(b.profile.display_name));
  }, [bundle, me]);

  const [otherId, setOtherId] = React.useState(() => opponents[0]?.profile.id || null);
  React.useEffect(() => {
    if (!opponents.some(o => o.profile.id === otherId)) setOtherId(opponents[0]?.profile.id || null);
  }, [opponents, otherId]);

  const other = opponents.find(o => o.profile.id === otherId);
  const data = React.useMemo(() => {
    if (!other) return null;
    const ids = other.compIds;
    const challenges = bundle.challenges.filter(ch => ids.has(ch.competition_id));
    const sets = bundle.sets.filter(s => ids.has(s.competition_id) && (s.athlete === me || s.athlete === other.profile.id));
    const sides = [
      { key: me, index: 0, label: tr('Du'), short: window.initialOf(tr('Du')), userIds: [me], statUserIds: [me], cls: 'side-0', color: window.SIDE_COLORS[0], isMine: true },
      { key: other.profile.id, index: 1, label: other.profile.display_name, short: window.initialOf(other.profile.display_name),
        userIds: [other.profile.id], statUserIds: [other.profile.id], cls: 'side-1', color: window.SIDE_COLORS[1], isMine: false },
    ];
    return { challenges, sets, sides };
  }, [bundle, other, me]);

  if (!opponents.length) {
    return <div className="empty"><div className="title">{tr('Noch keine Gegner')}</div>
      <div>{tr('Sobald jemand deiner Challenge beitritt, kannst du hier eure Bilanz sehen.')}</div></div>;
  }

  const sharedNames = other ? comps.filter(c => other.compIds.has(c.id)).map(c => c.name) : [];

  return (
    <>
      <div>
        <div className="mu-duel-pick">
          {opponents.map(o => (
            <button key={o.profile.id} className={`mu-duel-chip ${o.profile.id === otherId ? 'active' : ''}`}
              onClick={() => setOtherId(o.profile.id)}>
              <Avatar profile={o.profile} size={24} />
              <span>{o.profile.display_name}</span>
            </button>
          ))}
        </div>
        {other && <div className="mu-hint">{tr('Gemeinsam in: {names}', { names: sharedNames.join(' · ') })}</div>}
      </div>
      {data && (
        <ChallengeStats key={otherId} sides={data.sides} members={bundle.members} challenges={data.challenges}
          categories={bundle.categories} sets={data.sets} comps={comps} title={tr('{name1} vs. {name2}', { name1: tr('Du'), name2: other.profile.display_name })} />
      )}
    </>
  );
}

Object.assign(window, { StatsTab, ChallengeStats, AllTimeStats, DuelStats });
