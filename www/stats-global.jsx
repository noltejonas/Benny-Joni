/* global React, PTData, PTPeople, Avatar, HistoryScreen, buildSides, totalsBySide, uniqueMaxIndex, formatDuration, modeLabel */
// Stats-Tab: Challenge | Ich (All-Time) | Duelle

function StatsTab({ api, me, profile, competition, sides, challenges, categories, allSets }) {
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
        <HistoryScreen challenges={challenges} categories={categories} allSets={allSets} sides={sides} />
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

// ─── All-Time ───────────────────────────────────────────────────────────────
function AllTimeStats({ me, profile, bundle, comps }) {
  const stats = React.useMemo(() => {
    const catById = Object.fromEntries(bundle.categories.map(c => [c.id, c]));
    const chById = Object.fromEntries(bundle.challenges.map(c => [c.id, c]));
    const isWork = (s) => catById[chById[s.challenge_id]?.category_id]?.kind === 'work';
    const mine = bundle.sets.filter(s => s.athlete === me);
    const sport = mine.filter(s => !isWork(s));
    const work = mine.filter(isWork);
    const totalReps = sport.reduce((a, s) => a + (s.reps ?? 0), 0);
    const totalMinutes = work.reduce((a, s) => a + (s.duration_minutes ?? 0), 0);

    // Tage & Streaks
    const days = [...new Set(mine.map(s => PTData.isoDate(new Date(s.created_at))))].sort();
    let longest = 0, cur = 0, prev = null;
    for (const d of days) {
      const dt = new Date(d + 'T00:00:00');
      cur = prev && Math.round((dt - prev) / 86400000) === 1 ? cur + 1 : 1;
      longest = Math.max(longest, cur);
      prev = dt;
    }
    const daySet = new Set(days);
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!daySet.has(PTData.isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (daySet.has(PTData.isoDate(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }

    // Pro Kategorie
    const perCat = {};
    const byDayCat = {};
    for (const s of mine) {
      const cid = chById[s.challenge_id]?.category_id;
      if (!cid) continue;
      const v = s.reps ?? s.duration_minutes ?? 0;
      const e = perCat[cid] ||= { cat: catById[cid], total: 0, sets: 0, best: 0, bestDay: 0 };
      e.total += v; e.sets++; e.best = Math.max(e.best, v);
      const k = `${cid}|${PTData.isoDate(new Date(s.created_at))}`;
      byDayCat[k] = (byDayCat[k] || 0) + v;
      e.bestDay = Math.max(e.bestDay, byDayCat[k]);
    }
    const cats = Object.values(perCat).sort((a, b) => b.total - a.total);

    // Wochen pro Challenge: Sieg, Podium, fairer Anteil geschafft
    const monday = PTData.isoDate(PTData.mondayOf(new Date()));
    let weeksPlayed = 0, weeksWon = 0, podiums = 0, sharesMet = 0;
    const perComp = [];
    for (const c of comps) {
      const members = bundle.members.filter(m => m.competition_id === c.id);
      const sides = buildSides(c, members, me);
      if (!sides.length) continue;
      const compChs = bundle.challenges.filter(ch => ch.competition_id === c.id);
      const compSets = bundle.sets.filter(s => s.competition_id === c.id);
      const byWeek = {};
      for (const ch of compChs) (byWeek[ch.week_start] ||= []).push(ch);
      let wins = 0, played = 0;
      for (const [ws, chs] of Object.entries(byWeek)) {
        if (ws >= monday) continue;
        const ids = new Set(chs.map(ch => ch.id));
        const wSets = compSets.filter(s => ids.has(s.challenge_id));
        const myIn = wSets.some(s => s.athlete === me);
        const participants = PTData.participantsFor(members, ws);
        if (!participants.some(m => m.user_id === me) && !myIn) continue;
        played++;
        const totals = totalsBySide(wSets, sides);
        const w = uniqueMaxIndex(totals);
        if (w === 0) wins++;
        const rank = 1 + totals.filter(v => v > totals[0]).length;
        if (sides.length > 2 && rank <= 3) podiums++;
        const n = Math.max(1, participants.length);
        const metAll = chs.every(ch => {
          const mineVal = wSets.filter(s => s.challenge_id === ch.id && s.athlete === me)
            .reduce((a, s) => a + (s.reps ?? s.duration_minutes ?? 0), 0);
          return mineVal >= PTData.fairShareOf(ch.target_reps, n);
        });
        if (metAll) sharesMet++;
      }
      weeksPlayed += played; weeksWon += wins;
      const myTotal = compSets.filter(s => s.athlete === me).reduce((a, s) => a + (s.reps ?? s.duration_minutes ?? 0), 0);
      const allTotals = totalsBySide(compSets, sides);
      const rank = 1 + allTotals.filter(v => v > allTotals[0]).length;
      perComp.push({ c, played, wins, myTotal, rank, of: sides.length });
    }
    return { totalReps, totalMinutes, activeDays: days.length, streak, longest, cats, weeksPlayed, weeksWon, podiums, sharesMet, perComp, setCount: mine.length };
  }, [bundle, comps, me]);

  if (!stats.setCount) {
    return <div className="empty"><div className="emoji">📊</div><div className="title">Noch keine Daten</div><div>Logge deinen ersten Satz.</div></div>;
  }

  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

  return (
    <>
      <div className="card mu-me-hero">
        <Avatar profile={profile} size={56} />
        <div>
          <div className="mu-me-name">{profile.display_name}</div>
          <div className="subtitle" style={{ fontSize: 13 }}>Über alle {comps.length} Challenge{comps.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="v mono">{stats.totalReps.toLocaleString('de-DE')}</div><div className="k">Reps gesamt</div></div>
        <div className="stat"><div className="v mono">{stats.streak}🔥</div><div className="k">Streak</div></div>
        <div className="stat"><div className="v mono">{stats.activeDays}</div><div className="k">Aktive Tage</div></div>
      </div>
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="v mono">{stats.weeksWon}</div><div className="k">Wochensiege</div></div>
        <div className="stat"><div className="v mono">{pct(stats.sharesMet, stats.weeksPlayed)}%</div><div className="k">Anteil geschafft</div></div>
        <div className="stat"><div className="v mono">{stats.longest}</div><div className="k">Längste Serie</div></div>
      </div>
      {stats.totalMinutes > 0 && (
        <div className="card"><div className="label" style={{ margin: 0 }}>Work</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{formatDuration(stats.totalMinutes)}</div></div>
      )}

      <div className="card">
        <div className="label" style={{ margin: 0, marginBottom: 10 }}>Nach Kategorie</div>
        {stats.cats.map(e => (
          <div className="mu-cat-stat" key={e.cat?.id || e.total}>
            <div className="mu-cat-stat-name">{e.cat?.emoji} {e.cat?.name || '—'}</div>
            <div className="mu-cat-stat-vals mono">
              <span><b>{e.cat?.kind === 'work' ? formatDuration(e.total) : e.total.toLocaleString('de-DE')}</b> gesamt</span>
              <span>Satz {e.best}</span>
              <span>Tag {e.bestDay}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="label" style={{ margin: 0, marginBottom: 10 }}>Pro Challenge</div>
        {stats.perComp.map(({ c, played, wins, myTotal, rank, of }) => (
          <div className="mu-comp-stat" key={c.id}>
            <span className="mu-comp-emoji">{c.emoji}</span>
            <span className="mu-comp-text">
              <span className="mu-comp-name">{c.name}</span>
              <span className="mu-comp-meta">{modeLabel(c.mode)} · {wins}/{played} Wochen gewonnen</span>
            </span>
            <span className="mu-comp-rank mono">
              <b>#{rank}</b><small>/{of}</small>
              <span className="mu-comp-total">{myTotal.toLocaleString('de-DE')}</span>
            </span>
          </div>
        ))}
      </div>
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
    return <div className="empty"><div className="emoji">🤺</div><div className="title">Noch keine Gegner</div>
      <div>Sobald jemand deiner Challenge beitritt, kannst du hier eure Bilanz sehen.</div></div>;
  }

  const sharedNames = other ? comps.filter(c => other.compIds.has(c.id)).map(c => `${c.emoji} ${c.name}`) : [];

  return (
    <>
      <div className="mu-duel-pick">
        {opponents.map(o => (
          <button key={o.profile.id} className={`mu-duel-chip ${o.profile.id === otherId ? 'active' : ''}`}
            onClick={() => setOtherId(o.profile.id)}>
            <Avatar profile={o.profile} size={24} />
            <span>{o.profile.display_name}</span>
          </button>
        ))}
      </div>
      {other && <div className="mu-hint" style={{ marginBottom: 10 }}>Gemeinsam in: {sharedNames.join(' · ')}</div>}
      {data && (
        <HistoryScreen key={otherId} challenges={data.challenges} categories={bundle.categories}
          allSets={data.sets} sides={data.sides} title={`Du vs. ${other.profile.display_name}`} />
      )}
    </>
  );
}

Object.assign(window, { StatsTab, AllTimeStats, DuelStats });
