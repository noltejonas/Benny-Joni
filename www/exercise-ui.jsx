/* global React, PTExercises, PTData, tr */
// Übungskatalog in der Oberfläche: Strichfigur, Erklärung und die Auswahl
// beim Wochenziel. Daten und Posen: exercises.js (PTExercises).

const EX_REDUCED = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const exEase = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function ExFigProp({ p }) {
  const [kind] = p;
  if (kind === 'bar') return <line className="exfig-prop" x1="20" x2="80" y1={p[1]} y2={p[1]} />;
  if (kind === 'lowbar') {
    return (
      <g className="exfig-prop">
        <line x1="56" x2="86" y1={p[1]} y2={p[1]} />
        <line x1="82" x2="82" y1={p[1]} y2="95" />
      </g>
    );
  }
  if (kind === 'pbar') {
    const [, x1, x2, y] = p;
    return (
      <g className="exfig-prop">
        <line x1={x1} x2={x2} y1={y} y2={y} />
        <line x1={x2 - 4} x2={x2 - 4} y1={y} y2="95" />
      </g>
    );
  }
  if (kind === 'box') {
    const [, x, y, w, h] = p;
    return <rect className="exfig-box" x={x} y={y} width={w} height={h} rx="2" />;
  }
  if (kind === 'bench') {
    const [, x, y, w] = p;
    return (
      <g className="exfig-prop">
        <rect className="exfig-box" x={x} y={y} width={w} height="5" rx="2" />
        <line x1={x + 6} x2={x + 6} y1={y + 5} y2="95" />
        <line x1={x + w - 6} x2={x + w - 6} y1={y + 5} y2="95" />
      </g>
    );
  }
  if (kind === 'wall') return <line className="exfig-prop" x1={p[1]} x2={p[1]} y1="4" y2="95" />;
  return null;
}

// fig: Schlüssel aus PTExercises (Liegestütze → 'pushup'). size: Höhe, die
// Breite ist size · ASPECT. animate: Bewegung in Schleife, sonst die
// Endposition (phase).
function ExerciseFigure({ fig, size = 56, animate = false, phase = 1, className = '' }) {
  const [k, setK] = React.useState(animate ? 0 : phase);
  const info = PTExercises.figure(fig);
  React.useEffect(() => {
    if (!animate || !info) { setK(phase); return; }
    if (EX_REDUCED()) { setK(1); return; }
    let raf;
    const t0 = performance.now();
    const period = info.hold ? 3400 : 1900;
    const tick = (now) => {
      const x = ((now - t0) % period) / period;
      const tri = x < 0.5 ? x * 2 : 2 - x * 2;
      setK(exEase(Math.max(0, Math.min(1, (tri - 0.12) / 0.76))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fig, animate, phase]);
  const p = info && PTExercises.pose(fig, k);
  if (!p) return null;
  const line = (a, b, cls) => <line className={cls} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
  const back = p.front ? 'exfig-limb' : 'exfig-limb is-back';
  return (
    <svg className={`exfig ${className}`} viewBox={info.box.join(' ')} width={Math.round(size * PTExercises.ASPECT)} height={size}
      aria-hidden="true" focusable="false">
      <line className="exfig-floor" x1={info.box[0] + 1} x2={info.box[0] + info.box[2] - 1} y1="95" y2="95" />
      {info.props.map((pr, i) => <ExFigProp key={i} p={pr} />)}
      <g className={back}>
        {line(p.sh, p.el2)}{line(p.el2, p.ha2)}
        {line(p.hip, p.kn2)}{line(p.kn2, p.ft2)}
      </g>
      <g className="exfig-body">
        {line(p.hip, p.sh, 'exfig-torso')}
        <circle className="exfig-head" cx={p.head[0]} cy={p.head[1]} r="6" />
        {line(p.hip, p.kn)}{line(p.kn, p.ft)}
        {line(p.sh, p.el)}{line(p.el, p.ha)}
      </g>
      {info.marks.map(([kind, x, y], i) => kind === 'diamond'
        ? <rect key={i} className="exfig-mark" x={x - 3} y={y - 3} width="6" height="6" transform={`rotate(45 ${x} ${y})`} />
        : null)}
    </svg>
  );
}

// Figur zu einer Kategorie; ohne Katalog-Eintrag das Emoji.
function ExerciseThumb({ cat, size = 44, animate = false }) {
  const m = PTExercises.metaOf(cat);
  if (m?.fig) return <ExerciseFigure fig={m.fig} size={size} animate={animate} />;
  return <span className="exthumb-emoji" style={{ fontSize: Math.round(size * 0.6), width: size, height: size }} aria-hidden="true">{cat?.emoji || '💪'}</span>;
}

// Erklärung zur gewählten Übung: Figur in Bewegung, So geht's, Muskeln und
// was für die Rangliste zählt. Eigene Übungen haben keine Erklärung.
function ExerciseInfo({ cat, compact = false }) {
  const m = PTExercises.metaOf(cat);
  if (!m) return null;
  const level = PTExercises.LEVELS[m.level];
  return (
    <div className={`exinfo${compact ? ' is-compact' : ''}`}>
      <div className="exinfo-fig"><ExerciseFigure fig={m.fig} size={compact ? 64 : 80} animate /></div>
      <div className="exinfo-text">
        <div className="exinfo-head">
          <b>{cat.name}</b>
          {level && <span className={`exinfo-level is-${m.level}`}>{level}</span>}
        </div>
        <p className="exinfo-how">{m.how}</p>
        <div className="exinfo-meta"><span>{tr('Muskeln')}</span> {m.muscles}</div>
        {cat.ranked && (cat.rule || m.rule) && <div className="exinfo-meta"><span>{tr('Zählt, wenn')}</span> {cat.rule || m.rule}</div>}
      </div>
    </div>
  );
}

// Übungsauswahl beim Wochenziel. options: Kategorien (Katalog und eigene),
// selectedId, onPick(cat). isUsed(id): diese Woche schon belegt.
// recentIds: Übungen, die es in dieser Challenge schon gab (stehen bei Basics).
// renderExtra(cat): Zusatz auf der Karte (Bearbeiten-Knopf eigener Übungen).
// addOpen/onToggleAdd: Karte „Eigene Übung“; onSearchAdd(text) legt sie mit
// dem Suchtext an.
function ExercisePicker({ options, selectedId, onPick, isUsed = () => false, recentIds = [], busy = false,
  allowAdd = true, addOpen = false, onToggleAdd, onSearchAdd, renderExtra }) {
  const X = PTExercises;
  const selected = options.find(c => c.id === selectedId);
  const recent = new Set(recentIds);
  const inBasics = (c) => !!X.metaOf(c)?.basic || recent.has(c.id);
  const groupIds = (c) => {
    const g = X.groupOf(c);
    return inBasics(c) ? ['basics', g] : [g];
  };
  const [group, setGroup] = React.useState(() => (selected && !inBasics(selected) ? X.groupOf(selected) : 'basics'));
  const [query, setQuery] = React.useState('');
  // Neu gewählte Übung (z. B. gerade angelegt) ins Bild holen
  const [seenId, setSeenId] = React.useState(selectedId);
  let wanted = group;
  if (selectedId !== seenId) {
    setSeenId(selectedId);
    if (selected && !groupIds(selected).includes(group)) { wanted = X.groupOf(selected); setGroup(wanted); }
  }
  const sorted = [...options].sort((a, b) => X.orderOf(a) - X.orderOf(b));
  const tabs = [
    ...X.GROUPS.filter(g => sorted.some(c => groupIds(c).includes(g.id))),
    ...(sorted.some(c => X.groupOf(c) === 'own') ? [{ id: 'own', label: tr('Eigene') }] : []),
  ];
  const activeGroup = tabs.some(g => g.id === wanted) ? wanted : tabs[0]?.id;
  const q = query.trim();
  const shown = q ? X.search(sorted, q) : sorted.filter(c => groupIds(c).includes(activeGroup));

  const card = (c) => {
    const used = isUsed(c.id);
    const on = !addOpen && selectedId === c.id;
    return (
      <div key={c.id} className={`cat-card-wrap ${on ? 'selected' : ''}`}>
        <button className={`cat-card exp-card ${on ? 'selected' : ''}`} disabled={used || busy} onClick={() => onPick(c)}
          aria-pressed={on}
          aria-label={used ? tr('{name}, hat diese Woche schon ein Ziel', { name: c.name }) : undefined}>
          <ExerciseThumb cat={c} size={42} />
          <div className="name">{c.name}</div>
          {used ? <div className="cat-note">{tr('läuft schon')}</div>
            : PTData.usesMinutes(c) ? <div className="cat-note">{tr('in Minuten')}</div>
            : c.competition_id && <div className="cat-note">{tr('zählt nicht für die Rangliste')}</div>}
        </button>
        {renderExtra?.(c)}
      </div>
    );
  };

  return (
    <div className="exp">
      <div className="exp-search">
        <input className="input" type="search" value={query} placeholder={tr('Übung suchen')}
          aria-label={tr('Übung suchen')} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
      </div>
      {!q && tabs.length > 1 && (
        <div className="exp-tabs" role="tablist" aria-label={tr('Übungsgruppen')}>
          {tabs.map(g => (
            <button key={g.id} type="button" role="tab" aria-selected={activeGroup === g.id}
              className={`exp-tab ${activeGroup === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>
          ))}
        </div>
      )}
      <div className="cat-grid exp-grid">
        {shown.map(card)}
        {q && shown.length === 0 && <div className="exp-empty">{tr('Keine Übung gefunden.')}</div>}
        {allowAdd && (
          <button className={`cat-card cat-card-add exp-card ${addOpen ? 'open' : ''}`} disabled={busy}
            onClick={() => (q && shown.length === 0 && onSearchAdd ? onSearchAdd(q) : onToggleAdd?.())}>
            <div className="emoji">＋</div>
            <div className="name">{q && shown.length === 0 ? tr('„{name}“ anlegen', { name: q }) : tr('Eigene Übung')}</div>
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ExerciseFigure, ExerciseThumb, ExerciseInfo, ExercisePicker });
