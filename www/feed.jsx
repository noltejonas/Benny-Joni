/* global React, PTData, PTFeed, PTPeople, Icon, Avatar, sideStyle, sideIndexByUser, formatRelative, formatDuration, WeekRecap, bsuFmt, BSU_MAX_SEC, tr, trn, PTi18n */
// Live-Feed der Challenge. Das Rechenmodell (Serien, Meilensteine, Anteile)
// steckt in feed-model.js; hier geht es um die Darstellung:
// - Neue Einträge rutschen oben hinein. Wer weiter unten liest, wird nicht
//   verschoben, sondern bekommt eine Pille „↑ n neue Aktivitäten“.
// - Zeiten aktualisieren sich alle 30 Sekunden.
// - Antippen klappt eine Zeile auf: Schnell-Reaktionen, einzelne Sätze, für
//   eigene Sätze Bearbeiten und Löschen.
// - Reaktionen erscheinen sofort und werden danach vom Server bestätigt.

// Nur Emojis bis Version 13.1, die kennt jedes iPhone ab iOS 15.0 (Mindestversion der App).
const QUICK_REACTIONS = ['🔥', '💪', '👏', '😤', '💯'];
const ARRIVE_MS = 2400;
const PILL_SCROLL_Y = 160;

function feedHaptic() {
  const H = window.PTCelebrationHaptics;
  try { H?.Haptics?.impact({ style: H.ImpactStyle.Light }); } catch (e) {}
}

function useTicker(ms) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function useOnline() {
  const [online, setOnline] = React.useState(() => navigator.onLine !== false);
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

const isWorkSet = (s) => s.duration_minutes != null;

function setValueLabel(s) {
  if (isWorkSet(s)) return formatDuration(s.duration_minutes);
  const type = s.category?.challenge_type;
  if (type === 'tom_holland') return trn(s.reps, '{n} Rd.', '{n} Rd.');
  if (type === 'bring_sally_up') return s.reps >= BSU_MAX_SEC ? '3:24' : bsuFmt(s.reps);
  return `+${s.reps}`;
}

function burstValueLabel(b) {
  if (b.workout || b.count === 1) return setValueLabel(b.sets[0]);
  return isWorkSet(b.sets[0]) ? formatDuration(b.total) : `+${b.total}`;
}

const clockOf = (ts) => PTi18n.time(ts, { hour: '2-digit', minute: '2-digit' });
const personName = (id, me) => (id === me ? tr('Du') : PTPeople.firstNameOf(id));

// Reaktionen aller Sätze einer Serie, mit sofortiger Rückmeldung aus `opt`
// ({ emoji: 'on' | 'off' }), bis der Server den Stand bestätigt.
function groupReactions(sets, me, opt = {}) {
  const g = {};
  for (const s of sets) {
    for (const r of s.reactions || []) {
      const p = (g[r.emoji] ||= { emoji: r.emoji, count: 0, byMe: false });
      p.count++;
      if (r.athlete === me) p.byMe = true;
    }
  }
  for (const [emoji, state] of Object.entries(opt)) {
    const p = (g[emoji] ||= { emoji, count: 0, byMe: false });
    if (state === 'on' && !p.byMe) { p.count++; p.byMe = true; }
    if (state === 'off' && p.byMe) { p.count--; p.byMe = false; }
  }
  // Feste Reihenfolge, damit Pillen nicht springen, wenn Reaktionen eintreffen.
  const rank = (emoji) => { const i = QUICK_REACTIONS.indexOf(emoji); return i < 0 ? QUICK_REACTIONS.length : i; };
  return Object.values(g).filter((p) => p.count > 0)
    .sort((a, b) => rank(a.emoji) - rank(b.emoji) || a.emoji.localeCompare(b.emoji));
}

// Text eines Meilensteins, einmal mit Hervorhebung, einmal als reiner Text für Screenreader.
// `milestoneText` baut beide aus demselben Satz: `b` hebt hervor bzw. lässt den Text, wie er ist.
const milestoneText = (fn) => ({ text: fn((x) => <strong>{x}</strong>), plain: fn((x) => x) });

function milestoneParts(e, { me, sides, catName, fmt }) {
  const who = personName(e.athlete, me);
  if (e.type === 'share') {
    return {
      icon: 'check',
      ...milestoneText((b) => (e.athlete === me
        ? tr('Du hast deinen Anteil bei {exercise} erledigt', { exercise: b(catName) })
        : tr('{name} hat den Anteil bei {exercise} erledigt', { name: b(who), exercise: b(catName) }))),
      sub: tr('{value} von {target}', { value: fmt(e.value), target: fmt(e.target) }),
    };
  }
  if (e.type === 'goal') {
    const nums = { value: fmt(e.value), target: fmt(e.target) };
    return {
      icon: 'trophy',
      ...milestoneText((b) => tr('Wochenziel {exercise} geschafft', { exercise: b(catName) })),
      sub: e.athlete === me
        ? tr('{value} von {target} · letzter Satz: du', nums)
        : tr('{value} von {target} · letzter Satz: {name}', { ...nums, name: who }),
    };
  }
  const side = sides[e.sideIndex];
  const plural = (side?.userIds?.length || 0) > 1;
  const name = side?.label || who;
  // Stand aus Sicht der neuen Führung: ihr Wert zuerst, dann der nächstbeste.
  const sorted = [...(e.values || [])].sort((a, b) => b - a);
  return {
    icon: 'flame',
    ...milestoneText((b) => (side?.isMine
      ? (plural
        ? tr('Ihr übernehmt die Führung bei {exercise}', { exercise: b(catName) })
        : tr('Du übernimmst die Führung bei {exercise}', { exercise: b(catName) }))
      : (plural
        ? tr('{name} übernehmen die Führung bei {exercise}', { name: b(name), exercise: b(catName) })
        : tr('{name} übernimmt die Führung bei {exercise}', { name: b(name), exercise: b(catName) })))),
    sub: `${fmt(sorted[0] || 0)} : ${fmt(sorted[1] || 0)}`,
  };
}

function FeedSkeleton() {
  return (
    <div className="rd-feed lf" aria-busy="true" aria-label={tr('Aktivität wird geladen')}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="lf-row lf-skel">
          <span className="lf-skel-avatar" />
          <span className="lf-skel-lines"><span /><span /></span>
        </div>
      ))}
    </div>
  );
}

function FeedMilestone({ e, parts, side, arriving }) {
  return (
    <div className={`lf-event lf-event-${e.type}${arriving ? ' is-arriving' : ''}`} style={sideStyle(side)} data-lf-key={e.key}>
      <span className="lf-event-icon"><Icon name={parts.icon} size={16} strokeWidth={2.4} /></span>
      <span className="lf-event-body">
        <span className="lf-event-text">{parts.text}</span>
        <span className="lf-event-sub">{parts.sub} · {formatRelative(e.created_at)}</span>
      </span>
    </div>
  );
}

function FeedBurst({ b, me, side, isNew, arriving, open, onToggleOpen, reactions, onReact, onMore,
  progressLabel, tags, editId, editVal, setEditVal, startEdit, commitEdit, cancelEdit, onDeleteSet }) {
  const mine = b.athlete === me;
  const note = PTData.noteText(b.sets[0].note);
  const showSets = mine || b.count > 1;
  return (
    <div className={`lf-row ${side ? side.cls : 'side-n'}${arriving ? ' is-arriving' : ''}${open ? ' is-open' : ''}`}
      style={sideStyle(side)} data-lf-key={b.key}>
      <button className="lf-main" onClick={onToggleOpen} aria-expanded={open}>
        <span className="lf-avatar">
          <Avatar userId={b.athlete} size={36} className="avatar-img" />
          {isNew && <span className="lf-dot" aria-label={tr('neu')} />}
        </span>
        <span className="lf-body">
          <span className="lf-title"><strong>{personName(b.athlete, me)}</strong> · {b.category?.name || '—'}</span>
          <span className="lf-meta">
            {formatRelative(b.created_at)}
            {b.count > 1 && ` · ${trn(b.count, '{n} Satz', '{n} Sätze')}`}
            {progressLabel && ` · ${progressLabel}`}
          </span>
          {note && <span className="lf-note">{tr('„{note}“', { note })}</span>}
        </span>
        <span className="lf-value mono">{burstValueLabel(b)}</span>
      </button>

      {(reactions.length > 0 || tags.length > 0) && (
        <div className="lf-under">
          {tags.map((t) => <span key={t.id} className="lf-tag">{t.emoji} {t.name}</span>)}
          {reactions.map((p) => (
            <button key={p.emoji} className={`lf-react${p.byMe ? ' mine' : ''}`}
              onClick={() => onReact(p.emoji)} aria-pressed={p.byMe} aria-label={`${p.emoji} ${p.count}`}>
              <span>{p.emoji}</span><span className="lf-react-count mono">{p.count}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="lf-tray">
          <div className="lf-quick" role="group" aria-label={tr('Schnell reagieren')}>
            {QUICK_REACTIONS.map((emoji) => {
              const on = reactions.some((p) => p.emoji === emoji && p.byMe);
              return (
                <button key={emoji} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onReact(emoji)}>{emoji}</button>
              );
            })}
            <button className="lf-more" aria-label={tr('Andere Reaktion')} onClick={onMore}><Icon name="plus" size={18} /></button>
          </div>
          {showSets && (
            <div className="lf-sets">
              {b.sets.map((s) => (
                <div key={s.id} className="lf-set">
                  <span className="lf-set-time mono">{clockOf(s.created_at)}</span>
                  {editId === s.id ? (
                    <input className="input mono lf-set-input" type="number" inputMode="numeric" value={editVal} autoFocus
                      aria-label={tr('Neuer Wert')}
                      onChange={(ev) => setEditVal(ev.target.value)}
                      onFocus={(ev) => ev.target.select()}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') commitEdit(s); if (ev.key === 'Escape') cancelEdit(); }}
                      onBlur={() => commitEdit(s)} />
                  ) : (
                    <span className="lf-set-val mono">{setValueLabel(s)}</span>
                  )}
                  {mine && editId !== s.id && (
                    <>
                      <button className="icon-btn feed-action-btn" aria-label={tr('Bearbeiten')} onClick={() => startEdit(s)}>
                        <Icon name="edit" size={14} strokeWidth={2.2} />
                      </button>
                      <button className="icon-btn icon-btn-danger feed-action-btn" aria-label={tr('Löschen')}
                        onClick={() => { if (confirm(tr('{value} löschen?', { value: setValueLabel(s) }))) onDeleteSet?.(s); }}>
                        <Icon name="trash" size={14} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// `alone`, `onFirstLog`, `onInvite`: leerer Zustand und Hinweis für neue Challenges.
function FeedScreen({ feed, me, sides = [], categories = [], challenges = [], weekSets = [], participantCount = 2,
  projectTags = [], toolTags = [], loading = false, alone = false,
  onEditSet, onDeleteSet, onToggleReaction, onPickEmoji, onBackfill, onFirstLog, onInvite }) {
  useTicker(30000);
  const online = useOnline();

  const entries = React.useMemo(
    () => PTFeed.buildFeed({ items: feed, weekSets, challenges, sides, participantCount }),
    [feed, weekSets, challenges, sides, participantCount]
  );
  const sideIdx = React.useMemo(() => sideIndexByUser(sides), [sides]);
  const catOfChallenge = React.useMemo(() => {
    const out = {};
    for (const ch of challenges) out[ch.id] = categories.find((c) => c.id === ch.category_id) || null;
    return out;
  }, [challenges, categories]);
  const fmtFor = (challengeId) => (v) => (PTData.usesMinutes(catOfChallenge[challengeId]) ? formatDuration(v) : String(v));

  // Punkt an Einträgen anderer, die seit dem letzten Besuch dazugekommen sind.
  const [lastSeen, setLastSeen] = React.useState('');
  React.useEffect(() => {
    if (!me) return;
    const key = `pt_feed_lastseen_${me}`;
    try { setLastSeen(localStorage.getItem(key) || ''); } catch (e) {}
    return () => { try { localStorage.setItem(key, new Date().toISOString()); } catch (e) {} };
  }, [me]);

  // Neu eingetroffene Einträge erkennen: neue Schlüssel oder gewachsene Serien.
  const seenRef = React.useRef(null);
  const timersRef = React.useRef([]);
  const [arriving, setArriving] = React.useState({});
  const [pending, setPending] = React.useState(0);
  const [announce, setAnnounce] = React.useState('');
  React.useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  React.useEffect(() => {
    const sig = new Map();
    for (const e of entries) if (e.kind !== 'recap' && e.kind !== 'month') sig.set(e.key, e.count || 1);
    const prev = seenRef.current;
    seenRef.current = sig;
    if (!prev) return;
    const fresh = entries.filter((e) => e.kind !== 'recap' && e.kind !== 'month' && (!prev.has(e.key) || (e.count || 1) > prev.get(e.key)));
    if (!fresh.length) return;
    const keys = fresh.map((e) => e.key);
    setArriving((a) => { const n = { ...a }; for (const k of keys) n[k] = true; return n; });
    timersRef.current.push(setTimeout(() => {
      setArriving((a) => { const n = { ...a }; for (const k of keys) delete n[k]; return n; });
    }, ARRIVE_MS));
    const fromOthers = fresh.filter((e) => e.kind === 'milestone' || e.athlete !== me);
    if (!fromOthers.length) return;
    if (window.scrollY > PILL_SCROLL_Y) setPending((p) => p + fromOthers.length);
    const e = fromOthers[0];
    setAnnounce(e.kind === 'burst'
      ? `${personName(e.athlete, me)}: ${burstValueLabel(e)} ${e.category?.name || ''}`
      : milestoneParts(e, { me, sides, catName: catOfChallenge[e.challenge_id]?.name || '', fmt: fmtFor(e.challenge_id) }).plain);
  }, [entries, me]);
  // Leseposition halten: Wer weiter unten liest, soll nicht verrutschen, wenn
  // oben etwas dazukommt. Gemerkt wird der oberste sichtbare Eintrag; nach dem
  // Rendern wird um seine Verschiebung zurückgescrollt, bevor der Browser malt.
  // (WKWebView kennt kein zuverlässiges `overflow-anchor`, deshalb von Hand.)
  const anchorRef = React.useRef(null);
  const captureAnchor = React.useCallback(() => {
    anchorRef.current = null;
    if (window.scrollY <= PILL_SCROLL_Y) return;
    for (const el of document.querySelectorAll('[data-lf-key]')) {
      const top = el.getBoundingClientRect().top;
      if (top >= 60) { anchorRef.current = { key: el.dataset.lfKey, top }; return; }
    }
  }, []);
  React.useLayoutEffect(() => {
    const a = anchorRef.current;
    if (a) {
      const el = document.querySelector(`[data-lf-key="${CSS.escape(a.key)}"]`);
      const delta = el ? el.getBoundingClientRect().top - a.top : 0;
      if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    }
    captureAnchor();
  }, [entries, captureAnchor]);
  React.useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (window.scrollY < 80) setPending(0);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(captureAnchor);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [captureAnchor]);

  const [openKey, setOpenKey] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');

  // Sofortige Reaktionen: { [burstKey]: { emoji: 'on' | 'off' } }, bis der nächste Feed-Stand kommt.
  const [opt, setOpt] = React.useState({});
  const inflight = React.useRef(new Set());
  React.useEffect(() => { setOpt({}); }, [feed]);
  const react = async (b, emoji) => {
    const k = `${b.key}|${emoji}`;
    if (inflight.current.has(k)) return;
    const mineSet = b.sets.find((s) => (s.reactions || []).some((r) => r.athlete === me && r.emoji === emoji));
    const state = opt[b.key]?.[emoji];
    const isMine = state ? state === 'on' : !!mineSet;
    setOpt((o) => ({ ...o, [b.key]: { ...(o[b.key] || {}), [emoji]: isMine ? 'off' : 'on' } }));
    feedHaptic();
    inflight.current.add(k);
    try { await onToggleReaction?.(mineSet || b.sets[0], emoji); }
    finally { inflight.current.delete(k); }
  };

  const startEdit = (s) => { setEditId(s.id); setEditVal(String(isWorkSet(s) ? s.duration_minutes : s.reps)); };
  const cancelEdit = () => setEditId(null);
  const commitEdit = (s) => {
    const v = parseInt(editVal, 10) || 0;
    const field = isWorkSet(s) ? 'duration_minutes' : 'reps';
    if (v > 0 && v !== s[field]) onEditSet?.(s, { [field]: v });
    setEditId(null);
  };

  if (loading && !feed.length) return <FeedSkeleton />;
  if (!entries.length) {
    return (
      <div className="rd-empty">
        <div className="rd-empty-title">{tr('Noch keine Aktivität')}</div>
        <div className="rd-empty-text">{alone ? tr('Hier siehst du live jeden Satz, sobald jemand dabei ist.') : tr('Hier siehst du live jeden Satz.')}</div>
        <div className="ob-empty-actions">
          {onFirstLog && <button className="btn" onClick={onFirstLog}>{tr('Ersten Satz loggen')}</button>}
          {alone && onInvite && <button className="btn btn-secondary" onClick={onInvite}>{tr('Einladen')}</button>}
        </div>
      </div>
    );
  }

  const todayIso = PTData.isoDate(new Date());
  const yesterdayIso = PTData.isoDate(new Date(Date.now() - 86400000));
  const dayLabel = (iso) => (iso === todayIso ? tr('Heute') : iso === yesterdayIso ? tr('Gestern')
    : PTi18n.day(iso, { weekday: 'long', day: 'numeric', month: 'long' }));
  let lastDay = null;

  return (
    <div className="rd-feed lf">
      <div className="rd-section-head lf-head">
        <h2>{tr('Aktivität')}</h2>
        <span className={`lf-live${online ? '' : ' off'}`} title={online ? tr('Aktualisiert sich automatisch') : tr('Keine Verbindung')}>
          <span className="lf-live-dot" />{online ? tr('Live') : tr('Offline')}
        </span>
        <span className="lf-spacer" />
        {onBackfill && me && <button className="btn-link" onClick={onBackfill}>{tr('Nachtrag')}</button>}
      </div>

      {pending > 0 && (
        <button className="lf-pill" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setPending(0); }}>
          ↑ {trn(pending, '{n} neue Aktivität', '{n} neue Aktivitäten')}
        </button>
      )}
      <div className="lf-sr" role="status" aria-live="polite">{announce}</div>

      {entries.map((e) => {
        const day = e.created_at ? PTData.isoDate(new Date(e.created_at)) : null;
        const heading = day && day !== lastDay ? <h3 className="rd-day-label lf-day">{dayLabel(day)}</h3> : null;
        if (day) lastDay = day;

        if (e.kind === 'recap') {
          return <React.Fragment key={e.key}>{heading}<WeekRecap recap={e} me={me} sides={sides} /></React.Fragment>;
        }
        if (e.kind === 'month') {
          return <React.Fragment key={e.key}>{heading}<MonthRecapCard item={e} me={me} /></React.Fragment>;
        }
        if (e.kind === 'milestone') {
          const side = e.type === 'lead' ? sides[e.sideIndex] : sides[sideIdx[e.athlete]];
          const parts = milestoneParts(e, { me, sides, catName: catOfChallenge[e.challenge_id]?.name || '—', fmt: fmtFor(e.challenge_id) });
          return (
            <React.Fragment key={e.key}>{heading}
              <FeedMilestone e={e} parts={parts} side={side} arriving={!!arriving[e.key]} />
            </React.Fragment>
          );
        }

        const fmt = fmtFor(e.challenge_id);
        const progressLabel = e.progress && !e.workout
          ? tr('Anteil {value}/{share}', { value: fmt(e.progress.value), share: fmt(e.progress.share) }) + (e.progress.value >= e.progress.share ? ' ✓' : '')
          : null;
        const first = e.sets[0];
        const tags = [
          first.project_tag_id && projectTags.find((t) => t.id === first.project_tag_id),
          first.tool_tag_id && toolTags.find((t) => t.id === first.tool_tag_id),
        ].filter(Boolean);
        const isNew = !!me && e.athlete !== me && !!lastSeen && String(e.created_at) > lastSeen;
        return (
          <React.Fragment key={e.key}>{heading}
            <FeedBurst b={e} me={me} side={sides[sideIdx[e.athlete]]}
              isNew={isNew} arriving={!!arriving[e.key]}
              open={openKey === e.key}
              onToggleOpen={() => { setOpenKey((k) => (k === e.key ? null : e.key)); setEditId(null); }}
              reactions={groupReactions(e.sets, me, opt[e.key])}
              onReact={(emoji) => react(e, emoji)}
              onMore={() => onPickEmoji?.(first)}
              progressLabel={progressLabel} tags={tags}
              editId={editId} editVal={editVal} setEditVal={setEditVal}
              startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
              onDeleteSet={onDeleteSet} />
          </React.Fragment>
        );
      })}
      {alone && onInvite && (
        <div className="ob-note" style={{ marginTop: 8 }}>
          <span className="ob-note-emoji" aria-hidden="true">👋</span>
          <span>{tr('Sobald jemand dabei ist, siehst du hier jeden Satz live.')} <button className="btn-link" onClick={onInvite}>{tr('Einladen')}</button></span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { FeedScreen });
