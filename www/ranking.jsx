/* global React, PTData, PTRanking, PTPeople, Avatar, Icon, Sheet, tr, trn, PTi18n */
// Rangliste-Tab: Monat (live) · Saison · Ewig, pro Grundübung oder gesamt.
// Daten über die RPCs der Migration monthly_ranking (bzw. den Demo-Modus),
// Rechenhilfen in www/ranking-model.js (PTRanking).
// Spec: docs/superpowers/specs/2026-10-20-monatsrangliste-design.md

const RK_VIEWS = [['month', tr('Monat')], ['season', tr('Saison')], ['all', tr('Ewig')]];
const RK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function useSessionPref(key, fallback) {
  const [v, setV] = React.useState(() => { try { return sessionStorage.getItem(key) || fallback; } catch (e) { return fallback; } });
  const set = (x) => { setV(x); try { sessionStorage.setItem(key, x); } catch (e) {} };
  return [v, set];
}

const rkName = (row) => (row.blocked ? tr('Ausgeblendet') : row.display_name || tr('Unbekannt'));
const rkProfile = (row) => ({ id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url, color: row.color });
const rkPts = (n) => tr('{n} P.', { n: PTi18n.number(n || 0) });
const rkDate = (d) => PTi18n.date(d, { day: 'numeric', month: 'numeric' });

function RankingAvatar({ row, size = 36 }) {
  if (row.blocked) {
    return <span className="pt-avatar pt-avatar-initial" aria-hidden="true"
      style={{ width: size, height: size, background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: Math.round(size * 0.45) }}>?</span>;
  }
  return <Avatar profile={rkProfile(row)} size={size} />;
}

function RankingMedals({ row }) {
  const parts = [['gold', '🥇'], ['silver', '🥈'], ['bronze', '🥉']].filter(([k]) => row[k] > 0);
  if (!parts.length) return null;
  return (
    <span className="rk-medals">
      {parts.map(([k, e]) => <span key={k}>{e}<b className="mono">{row[k]}</b></span>)}
    </span>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
function RankingScreen({ api, me, profile, onProfileSaved, onToast }) {
  const R = PTRanking;
  const nowMonth = R.monthOf(new Date());
  const [settings, setSettings] = React.useState(null);
  const [cats, setCats] = React.useState(null);
  const [champions, setChampions] = React.useState([]);
  const [view, setView] = useSessionPref('pt_rk_view', 'month');
  const [catKey, setCatKey] = useSessionPref('pt_rk_cat', 'all');
  const [filter, setFilter] = useSessionPref('pt_rk_filter', 'all');
  const [sortBy, setSortBy] = React.useState('points');
  const [month, setMonth] = React.useState(nowMonth);
  const [monthRows, setMonthRows] = React.useState(null);
  const [totals, setTotals] = React.useState({});
  const [error, setError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [optInOpen, setOptInOpen] = React.useState(profile?.ranking_opt_in == null);
  const [logCat, setLogCat] = React.useState(null);
  const [card, setCard] = React.useState(null);

  const reload = () => { setTotals({}); setReloadKey(k => k + 1); };

  // Gewählte Übung in der Chip-Leiste ins Bild holen (nur waagerecht)
  React.useEffect(() => {
    const chip = document.querySelector('.rk-chip.active');
    const bar = chip?.parentElement;
    if (bar) bar.scrollLeft = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
  }, [catKey, cats]);

  // Fällige Monate abschließen (idempotent), dann Grunddaten laden
  React.useEffect(() => {
    let off = false;
    (async () => {
      try {
        await api.closeDueMonths().catch(() => 0);
        const [st, cs, ch] = await Promise.all([
          api.getRankingSettings(), api.getRankedCategories(), api.seasonChampions().catch(() => []),
        ]);
        if (off) return;
        setSettings(st); setCats(cs); setChampions(ch);
      } catch (e) { if (!off) setError(e.message); }
    })();
    return () => { off = true; };
  }, [api]);

  React.useEffect(() => {
    if (view !== 'month') return;
    let off = false;
    setMonthRows(null);
    api.rankingMonth(month)
      .then(rows => { if (!off) setMonthRows(rows); })
      .catch(e => { if (!off) setError(e.message); });
    return () => { off = true; };
  }, [api, view, month, reloadKey]);

  React.useEffect(() => {
    if (view === 'month' || totals[view]) return;
    let off = false;
    const from = view === 'season' ? `${new Date().getFullYear()}-01-01` : null;
    api.rankingTotals({ from })
      .then(rows => { if (!off) setTotals(t => ({ ...t, [view]: rows })); })
      .catch(e => { if (!off) setError(e.message); });
    return () => { off = true; };
  }, [api, view, totals, reloadKey]);

  if (error && !cats) {
    return (
      <div className="rd-empty">
        <div className="rd-empty-title">{tr('Rangliste nicht verfügbar')}</div>
        <div className="rd-empty-text">{error}</div>
        <button className="btn" onClick={() => location.reload()}>{tr('Erneut versuchen')}</button>
      </div>
    );
  }
  if (!cats || !settings) {
    return <div className="app-loader"><div className="app-loader-spinner" /><div className="app-loader-text">{tr('Lade Rangliste…')}</div></div>;
  }

  const cat = cats.find(c => c.id === catKey) || null;
  const optIn = profile?.ranking_opt_in;
  const startMonth = settings.start_month;
  const minMonth = startMonth < nowMonth ? startMonth : nowMonth;
  const isLive = month === nowMonth;
  const loading = view === 'month' ? !monthRows : !totals[view];

  // ── Zeilen der aktuellen Ansicht ──
  let rows = [];
  let myHypo = null;
  if (view === 'month' && monthRows) {
    const counted = monthRows.filter(r => r.counted);
    if (cat) {
      rows = counted.filter(r => r.category_id === cat.id).map(r => ({ ...r, score: r.value }));
      myHypo = monthRows.find(r => !r.counted && r.category_id === cat.id) || null;
    } else {
      rows = R.overall(counted).filter(r => r.points > 0).map(r => ({ ...r, score: r.points }));
    }
  } else if (totals[view]) {
    const base = cat ? totals[view].filter(r => r.category_id === cat.id) : R.overall(totals[view]);
    rows = base.filter(r => r.points > 0).map(r => ({ ...r, score: r.points }));
  }
  const globalRank = {};
  for (const r of R.rankBy(rows, 'score')) globalRank[r.user_id] = r.rank;
  const shown = filter === 'mine' ? rows.filter(r => r.is_mine) : rows;
  const ranked = view !== 'month' && sortBy === 'medals' ? R.medalTable(shown) : R.rankBy(shown, 'score');
  const mine = ranked.find(r => r.is_me) || null;

  // ── Kopf: Zeitraum ──
  let periodNote = '';
  if (view === 'month') {
    if (isLive && month < startMonth) periodNote = tr('Probelauf · gewertet wird ab {month}', { month: R.monthLabel(startMonth) });
    else if (isLive) {
      const d = R.daysLeft(month);
      periodNote = d === 1 ? tr('Letzter Tag') : trn(d, 'noch {n} Tag', 'noch {n} Tage');
    } else if (new Date() < R.closeDeadline(month)) {
      const due = R.closeDeadline(month);
      periodNote = tr('Nachtragen bis {date}, {time}', { date: rkDate(due), time: PTi18n.time(due) });
    } else periodNote = month < startMonth ? tr('Nicht gewertet') : tr('Abgeschlossen');
  } else if (view === 'season') periodNote = tr('Punkte {year}', { year: new Date().getFullYear() });
  else periodNote = tr('Alle Punkte seit dem Start');

  // ── Eigene Lage (Monat, eine Übung) ──
  let myLine = null;
  if (view === 'month' && cat) {
    const me1 = rows.find(r => r.is_me);
    const ref = me1 || myHypo;
    if (ref) {
      const gap = R.gapAbove(rows.filter(r => !r.is_me), ref.value);
      const tied = rows.some(r => !r.is_me && r.value === ref.value);
      myLine = !me1 ? tr('Du wärst Platz {rank}', { rank: ref.rank })
        : ref.rank === 1 ? (tied ? tr('Geteilter erster Platz') : tr('Du führst'))
        : gap ? tr('noch {need} bis Platz {rank}', { need: R.formatNeed(cat, gap.need), rank: gap.rank }) : null;
    }
  }

  const emptyText = view === 'month'
    ? (cat ? tr('Diesen Monat hat noch niemand {name} eingetragen.', { name: cat.name }) : tr('Diesen Monat gibt es noch keine Punkte.'))
    : tr('Punkte gibt es, sobald ein Monat abgeschlossen ist (am 2. des Folgemonats, erstmals am {date}).', { date: rkDate(R.closeDeadline(startMonth)) });

  const onOpenRow = (r) => setCard({ ...r, category_id: cat?.id || null });

  return (
    <div className="rk">
      <div className="rd-section-head rk-head">
        <h2>{tr('Rangliste')}</h2>
        <button className="btn-link" onClick={() => setCard({ user_id: me, display_name: profile.display_name,
          avatar_url: profile.avatar_url, color: profile.color, is_me: true })}>{tr('Meine Medaillen')}</button>
      </div>

      <div className="segmented rk-views">
        {RK_VIEWS.map(([k, label]) => (
          <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      <div className="rk-chips" role="tablist" aria-label={tr('Übung')}>
        <button className={`rk-chip ${!cat ? 'active' : ''}`} onClick={() => setCatKey('all')}>🏆 {tr('Gesamt')}</button>
        {cats.map(c => (
          <button key={c.id} className={`rk-chip ${cat?.id === c.id ? 'active' : ''}`} onClick={() => setCatKey(c.id)}>
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      <div className="rk-bar">
        {view === 'month' ? (
          <div className="rk-month">
            <button className="rk-nav" aria-label={tr('Vormonat')} disabled={month <= minMonth}
              onClick={() => setMonth(R.addMonths(month, -1))}><span className="rk-flip"><Icon name="chevron" size={18} /></span></button>
            <div className="rk-month-text">
              <b>{R.monthLabel(month)}</b>
              <span>{periodNote}</span>
            </div>
            <button className="rk-nav" aria-label={tr('Nächster Monat')} disabled={month >= nowMonth}
              onClick={() => setMonth(R.addMonths(month, 1))}><Icon name="chevron" size={18} /></button>
          </div>
        ) : (
          <div className="rk-month-text rk-period"><b>{view === 'season' ? tr('Saison {year}', { year: new Date().getFullYear() }) : tr('Ewige Tabelle')}</b><span>{periodNote}</span></div>
        )}
        <div className="segmented rk-filter">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{tr('Alle')}</button>
          <button className={filter === 'mine' ? 'active' : ''} onClick={() => setFilter('mine')}>{tr('Meine Leute')}</button>
        </div>
      </div>

      {view === 'all' && (
        <div className="segmented rk-sort">
          <button className={sortBy === 'points' ? 'active' : ''} onClick={() => setSortBy('points')}>{tr('Punkte')}</button>
          <button className={sortBy === 'medals' ? 'active' : ''} onClick={() => setSortBy('medals')}>{tr('Medaillenspiegel')}</button>
        </div>
      )}

      {optIn !== true && (
        <div className="banner rk-optin">
          <div className="banner-text">
            <strong>{optIn === false ? tr('Du bist nicht in der Rangliste.') : tr('Noch nicht entschieden.')}</strong>{' '}
            {myLine && !rows.some(r => r.is_me) ? `${myLine}. ` : ''}
            {tr('Andere sehen dich erst, wenn du mitmachst.')}
            <button className="btn-link" onClick={() => setOptInOpen(true)}>{tr('Mitmachen')}</button>
          </div>
        </div>
      )}

      {cat && view === 'month' && (
        <div className="rk-rule">
          <span className="label">{tr('So zählt’s')}</span>
          <span>{cat.rule || tr('Saubere Wiederholungen.')}{cat.metric === 'volume' && cat.max_per_day
            ? ` ${tr('Pro Tag zählen höchstens {n}.', { n: PTi18n.number(cat.max_per_day) })}` : ''}{cat.metric === 'best' ? ` ${tr('Es zählt dein bester Durchgang.')}` : ''}</span>
        </div>
      )}

      {myLine && rows.some(r => r.is_me) && (
        <div className="rk-me-line"><Icon name="trophy" size={16} /> {myLine}</div>
      )}

      <section className="card rk-list" aria-label={tr('Rangliste')} aria-busy={loading}>
        {loading ? (
          <div className="app-loader rk-loader"><div className="app-loader-spinner" /></div>
        ) : ranked.length === 0 ? (
          <div className="rk-empty">{filter === 'mine' && rows.length ? tr('Von deinen Leuten ist hier noch niemand.') : emptyText}</div>
        ) : (
          <ol className="rk-rows">
            {ranked.map(r => (
              <RankingRow key={r.user_id} r={r} cat={cat} view={view}
                globalRank={filter === 'mine' ? globalRank[r.user_id] : null}
                onOpen={() => onOpenRow(r)} />
            ))}
          </ol>
        )}
      </section>

      {mine && <RankingStickyMe r={mine} cat={cat} view={view} line={view === 'month' && cat ? myLine : null} />}

      {view === 'month' && isLive && cat && (
        <button className="btn rk-log" onClick={() => setLogCat(cat)}>
          <Icon name="plus" size={20} /> {tr('{name} eintragen', { name: cat.name })}
        </button>
      )}

      <RankingOptInSheet open={optInOpen} api={api} current={optIn}
        onClose={() => setOptInOpen(false)}
        onSaved={(p, on) => { setOptInOpen(false); onProfileSaved?.(p); reload();
          onToast?.(on ? tr('Du bist jetzt in der Rangliste') : tr('Du bleibst aus der Rangliste raus')); }} />

      <Sheet open={!!logCat} onClose={() => setLogCat(null)}>
        {logCat && <RankingLogSheet api={api} cat={logCat} onClose={() => setLogCat(null)}
          onLogged={(label) => { setLogCat(null); reload(); onToast?.(tr('{what} eingetragen', { what: label })); }} />}
      </Sheet>

      <Sheet open={!!card} onClose={() => setCard(null)}>
        {card && <RankingCardSheet api={api} me={me} row={card} cats={cats} champions={champions}
          month={view === 'month' ? month : null}
          onClose={() => setCard(null)}
          onChanged={(msg) => { setCard(null); reload(); if (msg) onToast?.(msg); }}
          onToast={onToast} />}
      </Sheet>
    </div>
  );
}

function RankingRow({ r, cat, view, globalRank, onOpen }) {
  // Monat mit Übung: nach Wert, sonst nach Punkten mit Medaillen
  const byValue = view === 'month' && !!cat;
  return (
    <li className={`rk-row ${r.is_me ? 'is-me' : ''}`} data-me={r.is_me ? '1' : undefined}>
      <button className="rk-row-btn" onClick={onOpen}>
        <span className={`rk-rank ${r.rank <= 3 ? `top top-${r.rank}` : ''}`}>{(byValue && RK_MEDAL[r.rank]) || r.rank}</span>
        <RankingAvatar row={r} size={36} />
        <span className="rk-who">
          <span className="rk-name">{r.is_me ? tr('Du') : rkName(r)}</span>
          {(globalRank || !byValue) && (
            <span className="rk-sub">
              {globalRank ? <span>{tr('#{rank} gesamt', { rank: globalRank })}</span> : null}
              {!byValue && <RankingMedals row={r} />}
            </span>
          )}
        </span>
        <span className="rk-score">
          <b className="mono">{byValue ? PTRanking.formatValue(cat, r.value) : rkPts(r.points)}</b>
          {byValue && r.points > 0 && <small className="mono">{rkPts(r.points)}</small>}
        </span>
      </button>
    </li>
  );
}

// Eigene Zeile unten angeheftet, solange die echte Zeile nicht im Bild ist
function RankingStickyMe({ r, cat, view, line }) {
  const [hidden, setHidden] = React.useState(true);
  React.useEffect(() => {
    // Sichtbar heißt: oberhalb der Tab-Leiste und nicht nach oben rausgescrollt
    const check = () => {
      const el = document.querySelector('.rk-row[data-me="1"]');
      const rect = el?.getBoundingClientRect();
      setHidden(!rect || (rect.top < window.innerHeight - 110 && rect.bottom > 0));
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [r.rank, r.value, r.points, view, cat?.id]);
  if (hidden) return null;
  const main = view === 'month' && cat ? PTRanking.formatValue(cat, r.value) : rkPts(r.points);
  return (
    <div className="rk-sticky" aria-hidden="true">
      <span className="rk-rank">{r.rank}</span>
      <span className="rk-who"><span className="rk-name">{tr('Du')}</span>{line && <span className="rk-sub">{line}</span>}</span>
      <b className="mono">{main}</b>
    </div>
  );
}

// ─── Zustimmung ─────────────────────────────────────────────────────────────
function RankingOptInSheet({ open, api, current, onClose, onSaved }) {
  const [busy, setBusy] = React.useState(false);
  async function choose(on) {
    setBusy(true);
    try { const p = await api.setRankingOptIn(on); onSaved?.(p, on); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="rk-optin-sheet">
        <div className="rk-optin-icon">🏆</div>
        <h2 className="title">{tr('In der Rangliste erscheinen?')}</h2>
        <p className="subtitle">{tr('Alle, die die App nutzen, sehen dann deinen Namen, dein Profilbild und deine Werte bei den Grundübungen. Sonst nichts: keine E-Mail, keine Challenges.')}</p>
        <p className="subtitle">{tr('Wer nicht mitmacht, wird nicht gewertet und sieht nur, auf welchem Platz er stünde. Ändern kannst du das jederzeit in den Einstellungen.')}</p>
        <div className="btn-row">
          <button className="btn btn-secondary" disabled={busy} onClick={() => choose(false)}>
            {current === false ? tr('Weiter nicht') : tr('Nein danke')}
          </button>
          <button className="btn" disabled={busy} onClick={() => choose(true)}>{tr('Ja, mitmachen')}</button>
        </div>
      </div>
    </Sheet>
  );
}

// ─── Eintragen aus der Rangliste ────────────────────────────────────────────
function RankingLogSheet({ api, cat, onClose, onLogged }) {
  const type = cat.challenge_type;
  const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
  const [targets, setTargets] = React.useState(null);
  const [value, setValue] = React.useState(type === 'bring_sally_up' ? 180 : type === 'tom_holland' ? 8 : 10);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let off = false;
    api.logTargets(cat.id, weekStart).then(t => { if (!off) setTargets(t); }).catch(() => { if (!off) setTargets([]); });
    return () => { off = true; };
  }, [api, cat.id, weekStart]);

  const max = cat.metric === 'best' ? cat.max_per_day : null;
  const clamp = (v) => Math.max(0, Math.min(max || 99999, Math.round(v) || 0));
  async function save() {
    if (value <= 0) return;
    setBusy(true);
    try {
      await api.logFreeSet({ categoryId: cat.id, reps: value });
      onLogged?.(`${PTRanking.formatValue(cat, value)} ${cat.name}`);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const chips = type === 'bring_sally_up' ? [120, 150, 180, 204] : type === 'tom_holland' ? [6, 8, 10, 12] : [5, 10, 15, 20, 25, 30];
  const step = type === 'bring_sally_up' ? 5 : 1;
  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>{cat.emoji} {cat.name}</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {type === 'bring_sally_up' ? tr('Zeit bis zum ersten Absetzen') : type === 'tom_holland' ? tr('Volle Runden in 20 Minuten') : tr('Wiederholungen')}
      </div>
      {type === 'bring_sally_up' ? (
        <div className="rk-time">
          <button className="icon-btn" aria-label={tr('5 Sekunden weniger')} onClick={() => setValue(v => clamp(v - step))}>−</button>
          <b className="mono">{PTRanking.formatValue(cat, value)}</b>
          <button className="icon-btn" aria-label={tr('5 Sekunden mehr')} onClick={() => setValue(v => clamp(v + step))}>＋</button>
        </div>
      ) : (
        <input className="input input-lg mono" type="number" inputMode="numeric" value={value}
          onChange={(e) => setValue(clamp(parseInt(e.target.value, 10)))} onFocus={(e) => e.target.select()} />
      )}
      <div className="chip-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        {chips.map(v => <button key={v} className="chip" onClick={() => setValue(v)}>{PTRanking.formatValue(cat, v)}</button>)}
      </div>
      <div className="rk-targets">
        {targets === null ? '…'
          : targets.length ? tr('Zählt für: {list}', { list: targets.map(t => `${t.emoji} ${t.name}`).join(' · ') })
          : tr('Diese Woche hat keine deiner Challenges diese Übung. Der Eintrag landet im Freien Training und zählt für die Rangliste und deine Stats.')}
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onClose}>{tr('Abbrechen')}</button>
        <button className="btn" onClick={save} disabled={busy || value <= 0}>{busy ? '…' : tr('Eintragen')}</button>
      </div>
    </>
  );
}

// ─── Profilkarte ────────────────────────────────────────────────────────────
function RankingCardSheet({ api, me, row, cats, champions = [], month, onClose, onChanged, onToast }) {
  const [medals, setMedals] = React.useState(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const isMe = row.user_id === me;
  const catById = Object.fromEntries((cats || []).map(c => [c.id, c]));
  const cat = row.category_id ? catById[row.category_id] : null;
  React.useEffect(() => {
    let off = false;
    api.rankingProfile(row.user_id).then(m => { if (!off) setMedals(m); }).catch(() => { if (!off) setMedals([]); });
    return () => { off = true; };
  }, [api, row.user_id]);

  const cups = champions.filter(c => c.user_id === row.user_id);
  const total = (medals || []).reduce((a, m) => a + (m.points || 0), 0);
  const count = (k) => (medals || []).filter(m => m.medal === k).length;

  async function report(reason) {
    setBusy(true);
    try {
      await api.reportRankingEntry({ userId: row.user_id, reason,
        categoryId: reason === 'values' ? cat?.id : null, month: reason === 'values' ? month : null });
      setReportOpen(false);
      onToast?.(tr('Danke, wir schauen uns das an.'));
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function toggleBlock() {
    const name = row.display_name || tr('Diese Person');
    if (!row.blocked && !confirm(tr('{name} blockieren? Name und Bild siehst du dann in der Rangliste nicht mehr.', { name }))) return;
    setBusy(true);
    try {
      await api.setBlock(row.user_id, !row.blocked);
      onChanged?.(row.blocked ? tr('Blockierung aufgehoben') : tr('Blockiert'));
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="rk-card">
      <div className="rk-card-head">
        <RankingAvatar row={row} size={64} />
        <div>
          <div className="rk-card-name">{isMe ? tr('{name} (du)', { name: row.display_name }) : rkName(row)}</div>
          <div className="rk-card-sub">{medals ? tr('{points} gesamt', { points: rkPts(total) }) : '…'}</div>
        </div>
      </div>

      {medals && (
        <div className="rk-card-kpis">
          <div><b>🥇 {count('gold')}</b><span>{tr('Gold')}</span></div>
          <div><b>🥈 {count('silver')}</b><span>{tr('Silber')}</span></div>
          <div><b>🥉 {count('bronze')}</b><span>{tr('Bronze')}</span></div>
        </div>
      )}

      {cups.length > 0 && (
        <ul className="rk-cups">
          {cups.map((c, i) => (
            <li key={i}>🏆 {tr('Champion {year} · {what}', { year: c.year, what: c.category_id ? catById[c.category_id]?.name || tr('Übung') : tr('Gesamt') })}</li>
          ))}
        </ul>
      )}

      <div className="label rk-card-label">{tr('Trophäenschrank')}</div>
      {medals === null ? <div className="rk-empty">…</div>
        : medals.length === 0 ? <div className="rk-empty">{isMe ? tr('Noch keine Punkte. Der erste abgeschlossene Monat bringt welche.') : tr('Noch keine Punkte.')}</div>
        : (
          <ul className="rk-trophies">
            {medals.map((m, i) => {
              const c = catById[m.category_id];
              return (
                <li key={`${m.month}-${m.category_id}-${i}`}>
                  <span className="rk-trophy-medal">{RK_MEDAL[m.rank] || `${m.rank}.`}</span>
                  <span className="rk-trophy-text">
                    <b>{c ? `${c.emoji} ${c.name}` : tr('Übung')}</b>
                    <span>{PTRanking.monthLabel(m.month)} · {c ? PTRanking.formatValue(c, m.value) : m.value}</span>
                  </span>
                  <span className="mono rk-trophy-pts">{rkPts(m.points)}</span>
                </li>
              );
            })}
          </ul>
        )}

      {!isMe && (
        <div className="rk-card-actions">
          {reportOpen ? (
            <div className="rk-report">
              <div className="label">{tr('Was stimmt nicht?')}</div>
              {cat && month && (
                <button className="btn btn-secondary" disabled={busy} onClick={() => report('values')}>
                  {tr('Unrealistische Werte · {name}, {month}', { name: cat.name, month: PTRanking.monthLabel(month, false) })}
                </button>
              )}
              <button className="btn btn-secondary" disabled={busy} onClick={() => report('profile')}>{tr('Name oder Bild unangemessen')}</button>
              <button className="btn-link" onClick={() => setReportOpen(false)}>{tr('Abbrechen')}</button>
            </div>
          ) : (
            <div className="btn-row">
              <button className="btn btn-secondary" disabled={busy} onClick={() => setReportOpen(true)}>{tr('Melden')}</button>
              <button className="btn btn-secondary" disabled={busy} onClick={toggleBlock}>{row.blocked ? tr('Entblocken') : tr('Blockieren')}</button>
            </div>
          )}
        </div>
      )}
      <button className="btn-link rk-card-close" onClick={onClose}>{tr('Schließen')}</button>
    </div>
  );
}

// ─── Monatsabschluss: Feed-Karte und Feier ──────────────────────────────────
// Letzter abgeschlossener Monat (ab start_month) oder null
function lastClosedMonth(settings, now = new Date()) {
  if (!settings?.start_month) return null;
  const R = PTRanking;
  let m = R.addMonths(R.monthOf(now), -1);
  if (now < R.closeDeadline(m)) m = R.addMonths(m, -1);
  return m >= settings.start_month ? m : null;
}

function MonthRecapCard({ item, me }) {
  const { month, rows, cats } = item;
  const catById = Object.fromEntries(cats.map(c => [c.id, c]));
  const byUser = {};
  for (const r of rows) (byUser[r.user_id] ||= { ...r, items: [], points: 0 }).items.push(r);
  for (const u of Object.values(byUser)) u.points = u.items.reduce((a, r) => a + r.points, 0);
  const people = Object.values(byUser).sort((a, b) => b.points - a.points);
  return (
    <section className="card rk-recap" aria-label={tr('Rangliste · {month}', { month: PTRanking.monthLabel(month) })}>
      <div className="stats-head"><span className="label">{tr('Rangliste · {month}', { month: PTRanking.monthLabel(month) })}</span><span className="rk-recap-icon">🏆</span></div>
      <ul className="rk-recap-list">
        {people.map(u => (
          <li key={u.user_id}>
            <RankingAvatar row={u} size={32} />
            <span className="rk-recap-text">
              <b>{u.user_id === me ? tr('Du') : u.display_name}</b>
              <span>{u.items.sort((a, b) => a.rank - b.rank).slice(0, 3)
                .map(r => `${RK_MEDAL[r.rank] || `${r.rank}.`} ${catById[r.category_id]?.name || ''}`).join(' · ')}</span>
            </span>
            <b className="mono">{rkPts(u.points)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

Object.assign(window, {
  RankingScreen, RankingOptInSheet, RankingLogSheet, RankingCardSheet, MonthRecapCard, lastClosedMonth,
});
