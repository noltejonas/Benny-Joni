/* global React, PTData, PTStats, weekNumber, tr, trn, PTi18n */
// Diagramme für den Stats-Tab. SVGs werden in echter Pixelbreite gezeichnet
// (kein preserveAspectRatio="none"), damit Schrift und Linien nicht verzerren.

// Füll- und Textfarbe einer Seite: Seite 0/1 folgen dem Theme, weitere ihrer festen Farbe.
function sideFill(side) {
  return side.index === 0 ? 'var(--side0)' : side.index === 1 ? 'var(--side1)' : side.color;
}
function sideInk(side) {
  return side.index === 0 ? 'var(--side0-ink)' : side.index === 1 ? 'var(--side1-ink)' : side.color;
}

// Anzeigename einer Seite: „Du“ für mich allein, Vorname für Personen, Teamname für Teams.
function sideName(side) {
  if (side.isMine && side.userIds.length === 1) return tr('Du');
  return side.userIds.length === 1 ? side.label.split(/\s+/)[0] : side.label;
}

function useElementWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Kleinster „runder“ Wert ≥ v für die Achsen (z.B. 565 → 600, 125 → 150).
function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= f * mag) return f * mag;
  return 10 * mag;
}

// Montage im Zeitraum als KW-Marken, ausgedünnt auf höchstens maxLabels.
function weekTicks(dates, maxLabels) {
  const mondays = [];
  dates.forEach((d, i) => { if (new Date(d + 'T00:00:00').getDay() === 1) mondays.push({ i, kw: weekNumber(d) }); });
  const step = Math.max(1, Math.ceil(mondays.length / Math.max(1, maxLabels)));
  return mondays.filter((_, k) => k % step === 0);
}

const svgId = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '');

// Vorsprung im Duell: kumulierte Reps von Seite 0 minus Seite 1.
// Über der Nulllinie führt Seite 0, darunter Seite 1.
function GapChart({ dates, gap, sides }) {
  const [ref, W] = useElementWidth();
  const id = svgId(React.useId());
  const H = 168, TOP = 10, BOTTOM = 24, RIGHT = 34;
  const n = gap.length;
  const M = niceMax(Math.max(1, ...gap.map(Math.abs)));
  const plotW = Math.max(1, W - RIGHT);
  const x = (i) => (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v) => TOP + ((M - v) / (2 * M)) * (H - TOP - BOTTOM);
  const y0 = y(0);
  const line = gap.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${y0.toFixed(1)}L${x(0).toFixed(1)},${y0.toFixed(1)}Z`;
  const ticks = weekTicks(dates, Math.floor(plotW / 52));
  const last = gap[n - 1] || 0;
  const halo = { paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4, strokeLinejoin: 'round' };

  return (
    <div ref={ref} className="stats-chart">
      {W > 0 && n > 0 && (
        <svg width={W} height={H} role="img"
          aria-label={trn(n, 'Vorsprung über {n} Tag, aktuell {reps} Reps für {name}', 'Vorsprung über {n} Tage, aktuell {reps} Reps für {name}',
            { reps: PTi18n.number(Math.abs(last)), name: sideName(sides[last >= 0 ? 0 : 1]) })}>
          <defs>
            <clipPath id={`${id}-up`}><rect x="0" y="0" width={W} height={y0} /></clipPath>
            <clipPath id={`${id}-down`}><rect x="0" y={y0} width={W} height={H - y0} /></clipPath>
          </defs>
          {ticks.map(t => (
            <g key={t.i}>
              <line x1={x(t.i)} x2={x(t.i)} y1={TOP} y2={H - BOTTOM} stroke="var(--line)" strokeWidth="1" />
              <text x={x(t.i)} y={H - 7} fontSize="10" fill="var(--text-3)" textAnchor="middle">{tr('KW {n}', { n: t.kw })}</text>
            </g>
          ))}
          <g clipPath={`url(#${id}-up)`}>
            <path d={area} fill={sideFill(sides[0])} fillOpacity="0.18" />
            <path d={line} fill="none" stroke={sideFill(sides[0])} strokeWidth="2" strokeLinejoin="round" />
          </g>
          <g clipPath={`url(#${id}-down)`}>
            <path d={area} fill={sideFill(sides[1])} fillOpacity="0.18" />
            <path d={line} fill="none" stroke={sideFill(sides[1])} strokeWidth="2" strokeLinejoin="round" />
          </g>
          <line x1="0" x2={plotW} y1={y0} y2={y0} stroke="var(--text-4)" strokeWidth="1" />
          <circle cx={x(n - 1)} cy={y(last)} r="4" fill={sideFill(sides[last >= 0 ? 0 : 1])} stroke="var(--surface)" strokeWidth="2" />
          <text x="2" y={TOP + 10} fontSize="11" fontWeight="700" fill={sideInk(sides[0])} style={halo}>{sideName(sides[0])}</text>
          <text x="2" y={H - BOTTOM - 6} fontSize="11" fontWeight="700" fill={sideInk(sides[1])} style={halo}>{sideName(sides[1])}</text>
          {[M, 0, -M].map(v => (
            <text key={v} x={W - 2} y={y(v) + 4} fontSize="10" fill="var(--text-3)" textAnchor="end" className="mono">
              {PTi18n.number(Math.abs(v))}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

// Kumulierte Reps für drei und mehr Seiten, Namen direkt am Linienende.
function RaceChart({ dates, cum, sides }) {
  const [ref, W] = useElementWidth();
  const H = 180, TOP = 10, BOTTOM = 24, RIGHT = 64;
  const n = dates.length;
  const M = niceMax(Math.max(1, ...cum.map(arr => arr[n - 1] || 0)));
  const plotW = Math.max(1, W - RIGHT);
  const x = (i) => (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v) => TOP + (1 - v / M) * (H - TOP - BOTTOM);
  const ticks = weekTicks(dates, Math.floor(plotW / 52));

  // Endbeschriftungen ohne Überlappung: nach Höhe sortieren, mindestens 13 px Abstand
  const labels = sides.map((side, i) => ({ side, y: y(cum[i][n - 1] || 0) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 13);
  const overflow = labels.length ? labels[labels.length - 1].y - (H - BOTTOM) : 0;
  if (overflow > 0) labels.forEach(l => { l.y -= overflow; });

  return (
    <div ref={ref} className="stats-chart">
      {W > 0 && n > 0 && (
        <svg width={W} height={H} role="img" aria-label={tr('Kumulierte Reps pro Seite')}>
          {[0.5, 1].map(f => (
            <g key={f}>
              <line x1="0" x2={plotW} y1={y(f * M)} y2={y(f * M)} stroke="var(--line)" strokeWidth="1" />
              <text x="0" y={y(f * M) - 4} fontSize="10" fill="var(--text-3)" className="mono">{PTi18n.number(f * M)}</text>
            </g>
          ))}
          <line x1="0" x2={plotW} y1={y(0)} y2={y(0)} stroke="var(--text-4)" strokeWidth="1" />
          {ticks.map(t => (
            <text key={t.i} x={x(t.i)} y={H - 7} fontSize="10" fill="var(--text-3)" textAnchor="middle">{tr('KW {n}', { n: t.kw })}</text>
          ))}
          {sides.map((side, i) => (
            <path key={side.key}
              d={cum[i].map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('')}
              fill="none" stroke={sideFill(side)} strokeWidth={side.isMine ? 2.75 : 1.75}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {labels.map(({ side, y: ly }) => (
            <text key={side.key} x={plotW + 6} y={ly + 4} fontSize="11" fontWeight={side.isMine ? 800 : 600} fill={sideInk(side)}>
              {sideName(side)}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

// Trainingskalender: Spalten = Wochen (Mo–So), Farbe = Reps-Stufe des Tages.
function ActivityHeatmap({ repsByDay, today }) {
  const [ref, W] = useElementWidth();
  const [picked, setPicked] = React.useState(null);
  // Wochentage Mo/Mi/Fr links; Platz je nach Länge (de „Mo“ → 22 px, en „Wed“ → 29 px)
  const wd = PTi18n.weekdays();
  const dayLabels = [wd[0], wd[2], wd[4]];
  const GAP = 3, LABEL_W = 8 + 7 * Math.max(...dayLabels.map(d => d.length)), MONTH_H = 16;
  const weeks = Math.max(8, Math.min(26, Math.floor((W - LABEL_W + GAP) / (14 + GAP))));
  const cell = Math.min(18, Math.floor((W - LABEL_W - GAP * (weeks - 1)) / weeks));
  const start = PTData.addDays(PTData.isoDate(PTData.mondayOf(new Date(today + 'T00:00:00'))), -7 * (weeks - 1));
  const level = React.useMemo(() => PTStats.intensityLevels(Object.values(repsByDay)), [repsByDay]);
  const opacity = [0, 0.28, 0.5, 0.75, 1];

  const cols = Array.from({ length: weeks }, (_, c) => {
    const monday = PTData.addDays(start, 7 * c);
    return { c, monday, days: Array.from({ length: 7 }, (_, r) => PTData.addDays(monday, r)) };
  });
  const monthLabel = (iso) => PTi18n.day(iso, { month: 'short' });
  const fmtDay = (iso) => PTi18n.day(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const H = MONTH_H + 7 * cell + 6 * GAP;

  return (
    <div ref={ref} className="stats-heat">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={tr('Trainingstage der letzten {n} Wochen', { n: weeks })}>
          {cols.map(({ c, monday }) => {
            const prev = c ? cols[c - 1].monday : null;
            if (prev && monthLabel(prev) === monthLabel(monday)) return null;
            if (!prev && new Date(monday + 'T00:00:00').getDate() > 21) return null;
            return <text key={`m${c}`} x={LABEL_W + c * (cell + GAP)} y="11" fontSize="10" fill="var(--text-3)">{monthLabel(monday)}</text>;
          })}
          {dayLabels.map((d, k) => (
            <text key={d} x="0" y={MONTH_H + k * 2 * (cell + GAP) + cell - 2} fontSize="10" fill="var(--text-3)">{d}</text>
          ))}
          {cols.map(({ c, days }) => days.map((d, r) => {
            if (d > today) return null;
            const v = repsByDay[d];
            const lv = level(v || 0, v != null);
            return (
              <rect key={d} x={LABEL_W + c * (cell + GAP)} y={MONTH_H + r * (cell + GAP)} width={cell} height={cell} rx="3"
                fill={lv ? 'var(--primary)' : 'var(--track)'} fillOpacity={lv ? opacity[lv] : 1}
                stroke={d === picked ? 'var(--text)' : d === today ? 'var(--text-3)' : 'none'} strokeWidth="1.5"
                onClick={() => setPicked(p => (p === d ? null : d))} />
            );
          }))}
        </svg>
      )}
      <div className="stats-heat-foot">
        {picked ? (
          <span className="mono">{fmtDay(picked)} · {repsByDay[picked] != null
            ? trn(repsByDay[picked], '{n} Rep', '{n} Reps', { n: PTi18n.number(repsByDay[picked]) })
            : tr('kein Training')}</span>
        ) : (
          <span className="stats-heat-scale">
            {tr('weniger')}
            {opacity.map((o, i) => <i key={i} style={{ background: i ? 'var(--primary)' : 'var(--track)', opacity: i ? o : 1 }} />)}
            {tr('mehr')}
          </span>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { sideFill, sideInk, sideName, useElementWidth, GapChart, RaceChart, ActivityHeatmap });
