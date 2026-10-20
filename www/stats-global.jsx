/* global React, PTData, PTStats, PTPeople, Avatar, SideAvatar, Icon, ChartFullscreen, GapChart, RaceChart, ActivityHeatmap, sideFill, sideInk, sideName, buildSides, formatDuration, weekNumber */
// Stats-Tab: Challenge | Ich (alle Challenges) | Duelle
//
// Aufbau pro Vergleich, jede Karte beantwortet eine Frage:
//   Bilanz     – wer gewinnt die Wochen?          (Wochensiege, Reps gesamt)
//   Vorsprung  – wie hat sich das entwickelt?     (Duell: Vorsprung, sonst kumulierte Reps)
//   Wochen     – Ergebnisse Woche für Woche       (aufklappbar bis auf jede Übung)
//   Kategorien – wer ist wo stärker?
//   Kennzahlen – Zielquote, Konstanz, Bestwerte
// Rechenlogik: www/stats-model.js (PTStats).

const fmtNum = (n) => (n ?? 0).toLocaleString('de-DE');
const fmtPct = (r) => (r == null ? '–' : `${Math.round(r * 100)} %`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Workout-Werte ohne Einheit: Tom Holland als Rundenzahl, Bring Sally Up als Zeit
const fmtWorkout = (type, v) => (type === 'tom_holland' ? fmtNum(v) : PTData.workoutValueLabel(type, v));
function fmtWorkoutRuns(type, sets) {
  if (!sets.length) return '0×';
  const vals = [...sets]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(s => fmtWorkout(type, s.reps));
  return `${sets.length}× · ${vals.join(', ')}`;
}

// „12.–18.10.“ bzw. „28.9.–4.10.“ über den Monatswechsel
function fmtWeekRange(weekStart) {
  const a = new Date(weekStart + 'T00:00:00');
  const b = new Date(a); b.setDate(a.getDate() + 6);
  const dm = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${dm(b)}` : `${dm(a)}–${dm(b)}`;
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
      const list = await api.listMyCompetitions();
      const b = await api.getStatsBundle(list.map(c => c.id));
      PTData.annotateWorkouts(b.sets, b.challenges, b.categories);
      PTPeople.set(b.members.map(m => m.profile).filter(Boolean));
      setComps(list);
      setBundle(b);
    } catch (e) { setError(e.message); }
  }, [api]);
  React.useEffect(() => { if (view !== 'challenge' && !bundle) load(); }, [view, bundle, load]);

  return (
    <>
      <div className="segmented mu-stats-switch">
        <button className={view === 'challenge' ? 'active' : ''} onClick={() => switchView('challenge')}>Challenge</button>
        <button className={view === 'me' ? 'active' : ''} onClick={() => switchView('me')}>Ich</button>
        <button className={view === 'duel' ? 'active' : ''} onClick={() => switchView('duel')}>Duelle</button>
      </div>
      {view === 'challenge' && (
        <ChallengeStats sides={sides} members={members} challenges={challenges} categories={categories} sets={allSets} />
      )}
      {view !== 'challenge' && !bundle && (
        error
          ? <div className="empty"><div className="title">Laden fehlgeschlagen</div><div>{error}</div>
              <button className="btn" style={{ marginTop: 16 }} onClick={load}>Erneut versuchen</button></div>
          : <div className="app-loader"><div className="app-loader-spinner" /><div className="app-loader-text">Lade Stats…</div></div>
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
  const st = React.useMemo(
    () => PTStats.challengeStats({ sides, challenges, categories, sets, members }),
    [sides, challenges, categories, sets, members],
  );

  if (!challenges.length || !sides.length) {
    return <div className="empty"><div className="title">Noch keine Historie</div>
      <div>Starte deine erste Wochen-Challenge.</div></div>;
  }
  if (!st.weeks.length) {
    return <div className="rd-empty"><div className="rd-empty-title">Noch keine Sport-Challenges</div>
      <div className="rd-empty-text">Sobald ihr Sport-Ziele loggt, erscheinen hier eure Stats.</div></div>;
  }
  return (
    <>
      <ScoreCard st={st} sides={sides} />
      <TrendCard st={st} sides={sides} title={title} />
      <WeeksCard st={st} sides={sides} comps={comps} />
      {st.categories.length > 0 && <CategoryCard st={st} sides={sides} />}
      <RecordsCard st={st} sides={sides} />
    </>
  );
}

function CardHead({ label, children }) {
  return <div className="st-head"><span className="label">{label}</span>{children}</div>;
}

function SideLegend({ sides }) {
  return (
    <span className="st-legend">
      {sides.map(s => <span key={s.key}><i style={{ background: sideFill(s) }} />{sideName(s)}</span>)}
    </span>
  );
}

function ScoreCard({ st, sides }) {
  const meta = st.decided > 0 && <span className="st-meta">{plural(st.decided, 'Woche', 'Wochen')}</span>;

  if (sides.length === 2) {
    const [a, b] = st.totals;
    const share = a + b ? (a / (a + b)) * 100 : 50;
    return (
      <section className="card rd-duel st-score" aria-label="Bilanz">
        <CardHead label="Bilanz">{meta}</CardHead>
        <div className="rd-duel-main">
          {[0, null, 1].map(i => i == null ? (
            <div key="score" className="rd-duel-score">
              <div className="rd-duel-num">
                <span style={{ color: sideInk(sides[0]) }}>{st.wins[0]}</span> : <span style={{ color: sideInk(sides[1]) }}>{st.wins[1]}</span>
              </div>
              <div className="rd-duel-cap">Wochensiege{st.ties ? ` · ${st.ties} Remis` : ''}</div>
            </div>
          ) : (
            <div key={sides[i].key} className="rd-duel-player">
              <SideAvatar side={sides[i]} size={sides[i].userIds.length > 1 ? 44 : 56} />
              <span>{sideName(sides[i])}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="rd-split" role="img" aria-label={`Reps gesamt: ${sideName(sides[0])} ${a}, ${sideName(sides[1])} ${b}`}>
            <div className="rd-split-a" style={{ width: `${share}%`, '--sc': sideFill(sides[0]) }} />
            <div className="rd-split-b" style={{ '--sc': sideFill(sides[1]) }} />
          </div>
          <div className="st-split-legend mono">
            <span>{fmtNum(a)} Reps</span><span>{fmtNum(b)} Reps</span>
          </div>
        </div>
      </section>
    );
  }

  // Drei und mehr Seiten: Tabelle nach Wochensiegen, bei Gleichstand nach Reps
  const order = sides.map((_, i) => i).sort((x, y) => st.wins[y] - st.wins[x] || st.totals[y] - st.totals[x]);
  return (
    <section className="card" aria-label="Tabelle">
      <CardHead label="Tabelle">{meta}</CardHead>
      <table className="st-table st-standings">
        <thead><tr><th className="st-pos">#</th><th /><th>Siege</th><th>Reps</th></tr></thead>
        <tbody>
          {order.map((i, pos) => (
            <tr key={sides[i].key} className={sides[i].isMine ? 'is-me' : ''}>
              <td className="st-pos mono">{pos + 1}</td>
              <td><span className="st-who"><SideAvatar side={sides[i]} size={26} /><span>{sideName(sides[i])}</span></span></td>
              <td className="mono">{st.wins[i]}</td>
              <td className="mono">{fmtNum(st.totals[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TrendCard({ st, sides, title }) {
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
      <section className="card st-trend" role="button" tabIndex={0} aria-label="Verlauf im Vollbild öffnen"
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
        <CardHead label={duel ? 'Vorsprung' : 'Verlauf'}>
          <span className="st-head-right">
            {duel
              ? (leadSide
                ? <span className="st-lead mono" style={{ color: sideInk(leadSide) }}>{sideName(leadSide)} +{fmtNum(Math.abs(last))}</span>
                : <span className="st-meta">Gleichstand</span>)
              : <span className="st-meta">Reps kumuliert</span>}
            <Icon name="expand" size={14} color="var(--text-3)" />
          </span>
        </CardHead>
        {duel
          ? <GapChart dates={st.dates} gap={gap} sides={sides} />
          : <RaceChart dates={st.dates} cum={cum} sides={sides} />}
      </section>
      {fullscreen && (
        <ChartFullscreen
          title={title || (duel ? `${sideName(sides[0])} vs. ${sideName(sides[1])}` : 'Reps im Verlauf')}
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

function WeeksCard({ st, sides, comps }) {
  const [openWeek, setOpenWeek] = React.useState(null);
  const [showAll, setShowAll] = React.useState(false);
  const weeks = showAll ? st.weeks : st.weeks.slice(0, WEEKS_SHOWN);

  return (
    <section className="card st-weeks" aria-label="Wochen">
      <CardHead label="Wochen">{sides.length === 2 && <SideLegend sides={sides} />}</CardHead>
      <ul className="st-week-list">
        {weeks.map(w => {
          const isOpen = openWeek === w.weekStart;
          return (
            <li key={w.weekStart} className={isOpen ? 'is-open' : ''}>
              <button className="st-week" aria-expanded={isOpen} onClick={() => setOpenWeek(isOpen ? null : w.weekStart)}>
                <span className="st-week-kw"><b>KW {weekNumber(w.weekStart)}</b><small>{fmtWeekRange(w.weekStart)}</small></span>
                <WeekBar w={w} sides={sides} />
                <span className="st-week-res">
                  {w.current ? <span className="st-live">läuft</span>
                    : w.winner != null ? <SideAvatar side={sides[w.winner]} size={24} />
                    : <span className="st-tie">{w.active ? '=' : '–'}</span>}
                </span>
                <span className="st-chev"><Icon name="chevron" size={16} /></span>
              </button>
              {isOpen && <WeekDetail w={w} sides={sides} comps={comps} />}
            </li>
          );
        })}
      </ul>
      {st.weeks.length > WEEKS_SHOWN && (
        <button className="st-more" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Weniger anzeigen' : `Alle ${st.weeks.length} Wochen`}
        </button>
      )}
    </section>
  );
}

function WeekBar({ w, sides }) {
  const segs = sides.map((s, i) => ({ s, v: w.totals[i] })).filter(x => x.v > 0);
  const bar = (
    <span className="st-bar">
      {segs.map(({ s, v }) => <i key={s.key} style={{ flex: v, background: sideFill(s) }} />)}
    </span>
  );
  if (sides.length !== 2) return <span className="st-week-bar is-multi">{bar}</span>;
  return (
    <span className="st-week-bar">
      <span className={`mono ${w.winner === 0 ? 'is-win' : ''}`}>{fmtNum(w.totals[0])}</span>
      {bar}
      <span className={`mono ${w.winner === 1 ? 'is-win' : ''}`}>{fmtNum(w.totals[1])}</span>
    </span>
  );
}

function WeekDetail({ w, sides, comps }) {
  const multiComp = new Set(w.rows.map(r => r.ch.competition_id)).size > 1;
  const compName = (ch) => comps.find(c => c.id === ch.competition_id)?.name;
  return (
    <div className="st-wd">
      <div className="st-wd-goals">
        {sides.map((s, i) => (
          <span key={s.key}><b style={{ color: sideInk(s) }}>{sideName(s)}</b> <span className="mono">{w.goalsHit[i]}/{w.goals[i]}</span> Ziele</span>
        ))}
      </div>
      {w.rows.map(({ ch, cat, share, perSide }) => (
        <div className="st-wd-row" key={ch.id}>
          <div className="st-wd-name">
            <span>{cat?.name}{multiComp && <span className="st-muted"> · {compName(ch)}</span>}</span>
            <small className="mono">{ch.workout ? '1× p. P.' : `${fmtNum(share)} p. P.`}</small>
          </div>
          {perSide.map((p, i) => (
            <div className="st-wd-side" key={sides[i].key}>
              <span className="st-wd-who" style={{ color: sideInk(sides[i]) }}>{sides[i].short}</span>
              {ch.workout ? (
                <span className="st-wd-val is-wide mono">{fmtWorkoutRuns(ch.workout, p.sets)}</span>
              ) : (
                <>
                  <span className="st-wd-track">
                    <i style={{ width: `${p.goal ? Math.min(100, (100 * p.value) / p.goal) : 0}%`, background: sideFill(sides[i]) }} />
                  </span>
                  <span className="st-wd-val mono">{fmtNum(p.value)}/{fmtNum(p.goal)}</span>
                </>
              )}
              <span className={`st-wd-hit ${p.hit ? 'is-hit' : ''}`} aria-label={p.hit ? 'Ziel erfüllt' : 'Ziel offen'}>
                {p.hit ? <Icon name="check" size={14} strokeWidth={3} /> : null}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CategoryCard({ st, sides }) {
  const duel = sides.length === 2;
  return (
    <section className="card" aria-label="Kategorien">
      <CardHead label="Kategorien">{duel && <SideLegend sides={sides} />}</CardHead>
      <div className="st-cats">
        {st.categories.map(({ cat, vals, leader }) => (
          <div className={`st-cat ${duel ? '' : 'is-multi'}`} key={cat?.id}>
            <span className="st-cat-name">{cat?.name}</span>
            {duel && <span className={`st-cat-val mono ${leader === 0 ? 'is-win' : ''}`}>{fmtNum(vals[0])}</span>}
            <span className="st-bar">
              {sides.map((s, i) => vals[i] > 0 && <i key={s.key} style={{ flex: vals[i], background: sideFill(s) }} />)}
            </span>
            {duel
              ? <span className={`st-cat-val mono ${leader === 1 ? 'is-win' : ''}`}>{fmtNum(vals[1])}</span>
              : <span className="st-cat-lead">
                  {leader != null && <SideAvatar side={sides[leader]} size={20} />}
                  <span className="mono">{leader != null ? fmtNum(vals[leader]) : '='}</span>
                </span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function RecordsCard({ st, sides }) {
  const r = st.records;
  const rows = [
    { label: 'Ziele erfüllt', vals: r.goalRate, fmt: fmtPct },
    { label: 'Aktive Tage', vals: r.activeDays },
    { label: 'Längste Serie', vals: r.longestStreak },
    { label: 'Bester Tag', vals: r.bestDay },
    { label: 'Beste Woche', vals: r.bestWeek },
    { label: 'Größter Satz', vals: r.maxSet },
    ...r.workouts.map(wk => ({
      label: wk.cat?.name || 'Workout', vals: wk.best,
      fmt: (v) => (v == null ? '–' : fmtWorkout(wk.type, v)),
    })),
  ];
  const show = (row, v) => (row.fmt ? row.fmt(v) : fmtNum(v));

  if (sides.length === 2) {
    return (
      <section className="card" aria-label="Kennzahlen">
        <CardHead label="Kennzahlen" />
        <table className="st-table st-records">
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
    <section className="card" aria-label="Bestwerte">
      <CardHead label="Bestwerte" />
      <table className="st-table st-holders">
        <tbody>
          {rows.map(row => {
            const best = Math.max(...row.vals.map(v => v ?? 0));
            const holders = best > 0 ? sides.filter((_, i) => row.vals[i] === best) : [];
            return (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>
                  {holders.length === 1 && <span className="st-who"><SideAvatar side={holders[0]} size={22} /><span>{sideName(holders[0])}</span></span>}
                  {holders.length > 1 && (
                    <span className="st-who-stack" aria-label={holders.map(sideName).join(', ')}>
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
  const stats = React.useMemo(() => {
    const sidesByComp = {};
    for (const c of comps) sidesByComp[c.id] = buildSides(c, bundle.members.filter(m => m.competition_id === c.id), me);
    return PTStats.personalStats({ me, comps, sidesByComp, bundle, today });
  }, [bundle, comps, me, today]);

  if (!stats.setCount && !stats.categories.length) {
    return <div className="empty"><div className="title">Noch keine Daten</div><div>Logge deinen ersten Satz.</div></div>;
  }

  return (
    <>
      <section className="card st-me" aria-label="Überblick">
        <div className="st-me-head">
          <Avatar profile={profile} size={48} />
          <div>
            <div className="st-me-name">{profile.display_name}</div>
            <div className="st-meta">{plural(comps.length, 'Challenge', 'Challenges')}</div>
          </div>
        </div>
        <div className="st-kpis">
          <div><b className="mono">{fmtNum(stats.totalReps)}</b><span>Reps</span></div>
          <div><b className="mono">{fmtNum(stats.activeDays)}</b><span>Aktive Tage</span></div>
          <div><b className="mono">{fmtPct(stats.goalRate)}</b><span>Ziele erfüllt</span></div>
        </div>
      </section>

      <section className="card" aria-label="Aktivität">
        <CardHead label="Aktivität">
          <span className="st-meta">Serie <b className="mono">{stats.streak}</b> · Rekord <b className="mono">{stats.longestStreak}</b></span>
        </CardHead>
        <ActivityHeatmap repsByDay={stats.repsByDay} today={today} />
      </section>

      <section className="card" aria-label="Übungen">
        <CardHead label="Übungen" />
        <table className="st-table st-ex">
          <thead><tr><th /><th>Gesamt</th><th>Max. Satz</th><th>Max. Tag</th></tr></thead>
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
                  <td><span className="st-ex-name">{e.cat?.name || '—'}</span></td>
                  {cells.map((v, k) => <td key={k} className="mono">{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {stats.perComp.length > 0 && (
        <section className="card" aria-label="Challenges">
          <CardHead label="Challenges"><span className="st-meta">{plural(stats.weeksWon, 'Wochensieg', 'Wochensiege')}</span></CardHead>
          <ul className="st-comps">
            {stats.perComp.map(({ c, played, wins, total, rank, of }) => (
              <li key={c.id}>
                <span className="st-comp-text">
                  <span className="st-comp-name">{c.name}</span>
                  <span className="st-meta">{wins}/{played} Siege · {fmtNum(total)} Reps</span>
                </span>
                <span className="st-comp-rank"><b className="mono">{rank}.</b><small>von {of}</small></span>
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
      { key: me, index: 0, label: 'Du', short: 'D', userIds: [me], statUserIds: [me], cls: 'side-0', color: window.SIDE_COLORS[0], isMine: true },
      { key: other.profile.id, index: 1, label: other.profile.display_name, short: window.initialOf(other.profile.display_name),
        userIds: [other.profile.id], statUserIds: [other.profile.id], cls: 'side-1', color: window.SIDE_COLORS[1], isMine: false },
    ];
    return { challenges, sets, sides };
  }, [bundle, other, me]);

  if (!opponents.length) {
    return <div className="empty"><div className="title">Noch keine Gegner</div>
      <div>Sobald jemand deiner Challenge beitritt, kannst du hier eure Bilanz sehen.</div></div>;
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
        {other && <div className="mu-hint">Gemeinsam in: {sharedNames.join(' · ')}</div>}
      </div>
      {data && (
        <ChallengeStats key={otherId} sides={data.sides} members={bundle.members} challenges={data.challenges}
          categories={bundle.categories} sets={data.sets} comps={comps} title={`Du vs. ${other.profile.display_name}`} />
      )}
    </>
  );
}

Object.assign(window, { StatsTab, ChallengeStats, AllTimeStats, DuelStats });
