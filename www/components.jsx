/* global React */
// Shared UI components for Projekt Terminator
const { useState, useEffect, useRef, useMemo } = React;

// ─── Icons (SF-style) ────────────────────────────────────────────────────────
function Icon({ name, size = 24, color = 'currentColor' }) {
  const paths = {
    home: <><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.7" fill="none"/><circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.7" fill="none"/></>,
    feed: <><path d="M4 6h16M4 12h16M4 18h10" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/><path d="M3 4v5h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M12 7v5l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/></>,
    plus: <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2" strokeLinecap="round"/>,
    check: <path d="M5 12l4 4 10-10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
    flame: <path d="M12 3s-1 4 1 6c2.5 2.5 4 4 4 7a5 5 0 1 1-10 0c0-2 1-3 2-4-.5 2 .5 3 1.5 3 1 0 1.5-1 1.5-2 0-3-4-5 0-10z" fill={color}/>,
    settings: <><circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.7" fill="none"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke={color} strokeWidth="1.7" strokeLinecap="round" fill="none"/></>,
    swap: <><path d="M7 5l-4 4 4 4M3 9h14M17 19l4-4-4-4M21 15H7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>,
    bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
    expand: <path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {paths[name]}
    </svg>
  );
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
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `vor ${days} d`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

function formatWeek(weekStart) {
  const d = new Date(weekStart);
  const end = new Date(d); end.setDate(d.getDate() + 6);
  const fmt = (x) => x.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  return `${fmt(d)} – ${fmt(end)}`;
}

function weekNumber(weekStart) {
  const d = new Date(weekStart);
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
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

Object.assign(window, {
  Icon, Ring, Toast, Sheet, Stepper,
  formatRelative, formatWeek, weekNumber, todayGreeting,
});
