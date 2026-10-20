/* global React, PTi18n, tr */
// Shared UI components for Projekt Terminator
const { useState, useEffect, useRef, useMemo } = React;

// ─── Icons (SF-style) ────────────────────────────────────────────────────────
function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 2 }) {
  // Linien-Icons im Lucide-Stil: einheitliche Strichstärke, runde Enden.
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></>,
    feed: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
    stats: <><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></>,
    wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 6V5a2 2 0 0 1 2-2h8"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="M20 6 9 17l-5-5"/>,
    flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .5 2 1.5 3 2.5 3-1-3 0-6 0-8z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></>,
    swap: <path d="M7 5l-4 4 4 4M3 9h14M17 19l4-4-4-4M21 15H7"/>,
    bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0"/>,
    expand: <path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7"/>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></>,
    scale: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M7 6V5a2 2 0 0 1 2-2h8"/></>,
    dumbbell: <path d="M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12"/>,
    timer: <><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></>,
    laptop: <><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/></>,
    play: <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill={color} stroke="none"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    arrowIn: <path d="M17 7 7 17M7 8v9h9"/>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    share: <><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4M12 2v13"/></>,
    contrast: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill={color} stroke="none"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>,
    archive: <><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    refresh: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h4"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {paths[name]}
    </svg>
  );
}

// Fortschrittsring für Listen und Karten (kein Verlauf, ruhige Linie).
function MiniRing({ pct, size = 32, stroke = 4, color = 'var(--primary)', track = 'var(--track)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, pct || 0));
  return (
    <span className="mini-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke}/>
        {p > 0 && <circle className="mini-ring-fg" cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${c * p} ${c}`}/>}
      </svg>
      {children != null && <span className="mini-ring-label">{children}</span>}
    </span>
  );
}

// Zählt eine Zahl beim ersten Rendern bzw. bei Änderung weich hoch.
function CountUp({ value, duration = 600, format = (v) => v }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = Number(value) || 0;
    prev.current = to;
    if (from === to || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(to); return; }
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

// ─── Ring (Apple Fitness style) ──────────────────────────────────────────────
function Ring({ pct, size = 220, stroke = 22, color, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, pct)));
  const gid = React.useId();
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg className="ring-svg" width={size} height={size}>
        <defs>
          <linearGradient id={`rg-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color || 'var(--accent)'} stopOpacity="1" />
            <stop offset="100%" stopColor={color || 'var(--accent)'} stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx={size/2} cy={size/2} r={r} strokeWidth={stroke} />
        <circle className="ring-fg"
          cx={size/2} cy={size/2} r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ stroke: `url(#rg-${gid})` }}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

// ─── Sheet ───────────────────────────────────────────────────────────────────
function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────
function Stepper({ value, onChange, step = 5, min = 1 }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input
        type="number"
        inputMode="numeric"
        className="val mono stepper-input"
        value={value}
        onChange={e => {
          const v = parseInt(e.target.value);
          onChange(isNaN(v) ? min : Math.max(min, v));
        }}
        onFocus={e => e.target.select()}
      />
      <button onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRelative(ts) {
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return tr('gerade eben');
  if (m < 60) return tr('vor {n} min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tr('vor {n} h', { n: h });
  const days = Math.floor(h / 24);
  if (days < 7) return tr('vor {n} d', { n: days });
  return PTi18n.date(d, { day: '2-digit', month: 'short' });
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// 'YYYY-MM-DD' als lokaler Kalendertag. new Date('2026-10-19') liest UTC und
// ist westlich davon schon Sonntag (falsche KW, falsche Wochenlinien).
function localDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T00:00:00') : new Date(value);
}

function formatWeek(weekStart) {
  const d = localDay(weekStart);
  const end = new Date(d); end.setDate(d.getDate() + 6);
  const fmt = (x) => PTi18n.date(x, { day: '2-digit', month: 'short' });
  return `${fmt(d)} – ${fmt(end)}`;
}

function weekNumber(weekStart) {
  const d = localDay(weekStart);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

function todayGreeting() {
  const h = new Date().getHours();
  if (h < 5) return tr('Gute Nacht');
  if (h < 11) return tr('Guten Morgen');
  if (h < 18) return tr('Guten Tag');
  return tr('Guten Abend');
}

Object.assign(window, {
  Icon, MiniRing, CountUp, Ring, Toast, Sheet, Stepper,
  formatRelative, formatDuration, formatWeek, weekNumber, localDay, todayGreeting,
});
