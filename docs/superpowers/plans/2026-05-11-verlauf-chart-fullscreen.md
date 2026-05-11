# Verlauf Chart — Kumuliert + Fullscreen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitere den Verlauf-Statistik-Chart um (1) einen Kumuliert-Toggle (Reps pro Tag ↔ kumulative Summe innerhalb des Zeitraums) und (2) einen Fullscreen-Modus mit Scrubber, der die Werte einzelner Tage präzise ablesbar macht.

**Architecture:** Neue States `cumulative` + `fullscreen` in `HistoryView`. Bestehender `StatsChart` bleibt unverändert in der Signatur und bekommt nur die richtigen Serien rein (daily oder kumuliert). Neue Komponente `ChartFullscreen` rendert eine bildschirmfüllende Variante mit Top-Bar (Close, Titel, Range + Kumuliert-Controls), Body (große SVG-Variante `FullscreenChart` mit Scrubber-Visuals) und Bottom-Bar (Datum + Werte). Body-Scroll-Lock + Resize-Listener via `useEffect`. Keine Änderung an Rotations-Config — Layout passt sich nur responsiv an die Viewport-Größe.

**Tech Stack:** React 18 (CDN, `window`-globals), Babel-in-Browser (`type="text/babel"`), SVG, CSS (kein Preprocessor), Capacitor 8 für iOS.

**Testing note:** Das Projekt hat keine automatisierten Tests (`npm test` exit 1, kein Jest/Vitest, kein Build-Step). Alle Verifikation ist **manuell** — entweder im iOS-Simulator (`npx cap run ios`) oder im Browser (öffne `www/index.html` über einen lokalen Static-Server). Diese Schritte sind verbindlich; treat manual checkpoints as binding.

**Git note:** Das Projekt ist KEIN git-Repo (`git status` → "fatal: not a git repository"). Alle "Commit"-Schritte werden übersprungen. Falls das Projekt später ge-initted wird, kann gebatcht committet werden.

**Reference spec:** `docs/superpowers/specs/2026-05-11-verlauf-chart-fullscreen-design.md`

---

## File Structure

| Path                                | Status   | Responsibility                                                                                                  |
|-------------------------------------|----------|------------------------------------------------------------------------------------------------------------------|
| `www/screens.jsx`                   | modify   | Erweitere `HistoryView` (State + UI), füge `ChartFullscreen` + `FullscreenChart` Komponenten hinzu.              |
| `www/components.jsx`                | modify   | Erweitere `Icon`-Komponente um `expand`-Pfad.                                                                    |
| `www/styles.css`                    | modify   | Hänge neuen `/* === Verlauf Chart Fullscreen === */`-Block an.                                                  |

Keine neuen Dateien. Bewusst: Alle Komponenten leben weiter in `screens.jsx` (konsistent mit dem bestehenden Pattern — `StatsChart`, `HistoryScreen`, `HistoryView`, `MiniStat` etc. teilen sich diese Datei).

---

## Task 1: Add `expand` icon to `Icon` component

**Files:**
- Modify: `www/components.jsx:7-17` (paths object inside Icon)

- [ ] **Step 1: Add the new icon path**

Open `www/components.jsx`. The `Icon` component has a `paths` object (around line 7). Add a new entry `expand` after `bell` (line 16). It should be an arrows-out diagonal icon (two arrows pointing to opposite corners).

Find this block:
```jsx
    bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  };
```

Replace with:
```jsx
    bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
    expand: <path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  };
```

- [ ] **Step 2: Manual verification**

Refresh the app (live-reload or rebuild). In any place that renders this icon, you should see two arrows pointing diagonally outward. We'll verify it appears correctly in context in Task 4.

For now, just check the file saved cleanly:
```bash
grep -n "expand:" /Users/jonasnolte/Desktop/terminator-ios/www/components.jsx
```
Expected output: a line matching `expand: <path d="M4 10V4h6...`.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 2: Add cumulative + fullscreen state to HistoryView

**Files:**
- Modify: `www/screens.jsx:753-765` (HistoryView state declarations)

- [ ] **Step 1: Add state declarations**

Open `www/screens.jsx`. Find the start of `HistoryView`:

```jsx
function HistoryView({ challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone }) {
  const [range, setRange] = useState('30'); // '7', '30', 'all'
  const [selectedCats, setSelectedCats] = useState([]); // [] = alle
```

Replace with:

```jsx
function HistoryView({ challenges, categories, allSets, catById, setsByCh, streak, totalReps, weeksDone }) {
  const [range, setRange] = useState('30'); // '7', '30', 'all'
  const [selectedCats, setSelectedCats] = useState([]); // [] = alle
  const [cumulative, setCumulative] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
```

- [ ] **Step 2: Manual verification**

Open the app, navigate to Verlauf tab. The screen should look unchanged (state is added but not used yet). No errors in console.

If you have devtools open, type into the console:
```js
// nothing observable yet — state is private to the component
```
Just verify no JS errors appear and the History view renders.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 3: Compute cumulative series alongside daily series

**Files:**
- Modify: `www/screens.jsx:786-824` (the `useMemo` for bennySeries / jonasSeries)

- [ ] **Step 1: Extend the useMemo**

Find this block (around line 786):

```jsx
  // Compute date-range buckets (per day, per athlete)
  const { bennySeries, jonasSeries, rangeStart, totalDays } = useMemo(() => {
    let start, total;
    if (days) {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() - (days - 1));
      start = d;
      total = days;
    } else {
      // all time — from earliest set
      const earliest = filteredSets.length
        ? new Date(filteredSets.reduce((m, s) => s.created_at < m ? s.created_at : m, filteredSets[0].created_at))
        : new Date();
      earliest.setHours(0,0,0,0);
      start = earliest;
      const now = new Date(); now.setHours(0,0,0,0);
      total = Math.max(1, Math.round((now - start) / 86400000) + 1);
      total = Math.min(total, 90); // cap for chart
      if (total >= 90) {
        const d2 = new Date(); d2.setHours(0,0,0,0);
        d2.setDate(d2.getDate() - 89);
        start = d2;
      }
    }
    const bennyArr = [], jonasArr = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      bennyArr.push({ date: iso, reps: 0 });
      jonasArr.push({ date: iso, reps: 0 });
    }
    for (const s of filteredSets) {
      const day = String(s.created_at).slice(0, 10);
      const i = Math.round((new Date(day) - start) / 86400000);
      if (i < 0 || i >= total) continue;
      const arr = s.athlete === 'Benny' ? bennyArr : jonasArr;
      arr[i].reps += s.reps;
    }
    return { bennySeries: bennyArr, jonasSeries: jonasArr, rangeStart: start, totalDays: total };
  }, [filteredSets, days, range]);
```

Replace the final lines (from `for (const s of filteredSets) {...}` to `}, [...]);`) with:

```jsx
    for (const s of filteredSets) {
      const day = String(s.created_at).slice(0, 10);
      const i = Math.round((new Date(day) - start) / 86400000);
      if (i < 0 || i >= total) continue;
      const arr = s.athlete === 'Benny' ? bennyArr : jonasArr;
      arr[i].reps += s.reps;
    }
    // Cumulative variants (running sum within the range)
    let bennyAcc = 0, jonasAcc = 0;
    const bennyCumArr = bennyArr.map(d => ({ date: d.date, reps: (bennyAcc += d.reps) }));
    const jonasCumArr = jonasArr.map(d => ({ date: d.date, reps: (jonasAcc += d.reps) }));
    return { bennySeries: bennyArr, jonasSeries: jonasArr, bennyCumSeries: bennyCumArr, jonasCumSeries: jonasCumArr, rangeStart: start, totalDays: total };
  }, [filteredSets, days, range]);
```

And update the destructuring on the same line (line ~786):

Find:
```jsx
  const { bennySeries, jonasSeries, rangeStart, totalDays } = useMemo(() => {
```

Replace with:
```jsx
  const { bennySeries, jonasSeries, bennyCumSeries, jonasCumSeries, rangeStart, totalDays } = useMemo(() => {
```

- [ ] **Step 2: Manual verification**

Refresh. The Verlauf view should look identical (we computed new arrays but don't render them yet). Open browser devtools console; should be free of errors.

If you want to sanity-check the computation: temporarily add `console.log('cum benny last', bennyCumArr[bennyCumArr.length - 1])` after the bennyCumArr definition. The `.reps` of the last element should equal `bennyStats.total` shown in the UI. Remove the log after.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 4: Add cumulative-toggle segmented control to the card header

**Files:**
- Modify: `www/screens.jsx:859-867` (the `.vs-head` block)

- [ ] **Step 1: Add the second segmented control row**

Find this block (around line 859):

```jsx
      <div className="card">
        <div className="vs-head">
          <div className="label" style={{margin: 0}}>Benny vs. Jonas</div>
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
            <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
            <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
          </div>
        </div>
```

Replace with:

```jsx
      <div className="card">
        <div className="vs-head">
          <div className="label" style={{margin: 0}}>Benny vs. Jonas</div>
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
            <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
            <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
          </div>
        </div>
        <div className="vs-head" style={{ marginTop: -4, marginBottom: 10, justifyContent: 'flex-end' }}>
          <div className="segmented segmented-sm">
            <button className={!cumulative?'active':''} onClick={()=>setCumulative(false)}>⌀ Tag</button>
            <button className={cumulative?'active':''} onClick={()=>setCumulative(true)}>Σ Kumuliert</button>
          </div>
        </div>
```

- [ ] **Step 2: Manual verification**

Refresh the app, go to Verlauf. Below the "Benny vs. Jonas / 7T 30T All" row, a new segmented control "⌀ Tag / Σ Kumuliert" appears, right-aligned. "⌀ Tag" is active by default. Tap "Σ Kumuliert" — visual highlight switches. The chart itself does NOT change yet (we wire it in next task), but the toggle is clickable and visually correct.

If the segmented buttons overlap with category chips or look squished, take a screenshot and let the user know — minor padding adjustment might be needed.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 5: Wire cumulative state to the inline chart

**Files:**
- Modify: `www/screens.jsx:909-916` (the `.chart-wrap` block)

- [ ] **Step 1: Pass conditional series + dynamic title**

Find this block (around line 909):

```jsx
        <div className="chart-wrap">
          <div className="chart-legend">
            <span><span className="dot" style={{background: accentColors.accent}}/>Benny</span>
            <span><span className="dot" style={{background: accentColors.accent3}}/>Jonas</span>
            <span className="chart-title">Reps pro Tag</span>
          </div>
          <StatsChart benny={bennySeries} jonas={jonasSeries} days={totalDays} accent={accentColors.accent} accent3={accentColors.accent3}/>
        </div>
```

Replace with:

```jsx
        <div className="chart-wrap" onClick={() => setFullscreen(true)} role="button" tabIndex={0}>
          <div className="chart-legend">
            <span><span className="dot" style={{background: accentColors.accent}}/>Benny</span>
            <span><span className="dot" style={{background: accentColors.accent3}}/>Jonas</span>
            <span className="chart-title">{cumulative ? 'Kumuliert' : 'Reps pro Tag'}</span>
            <Icon name="expand" size={14} color="var(--text-2)" />
          </div>
          <StatsChart
            benny={cumulative ? bennyCumSeries : bennySeries}
            jonas={cumulative ? jonasCumSeries : jonasSeries}
            days={totalDays}
            accent={accentColors.accent}
            accent3={accentColors.accent3}
          />
        </div>
```

Note: this also adds the tap-to-fullscreen handler and the expand icon. The fullscreen render itself comes in Task 8 — for now, `setFullscreen(true)` updates the state but nothing visible yet. We need the `chart-expand-icon`-ish CSS too (Task 7).

- [ ] **Step 2: Manual verification**

Refresh, go to Verlauf:
1. The chart shows reps per day, unchanged shape. Title says "Reps pro Tag".
2. Tap "Σ Kumuliert" toggle. Chart lines now show monotonically rising curves (cumulative sum). Title says "Kumuliert".
3. Tap "⌀ Tag" — back to per-day shape.
4. The legend area on the right now shows a small expand icon (two diagonal arrows).
5. Tapping anywhere on the chart sets `fullscreen=true` but nothing visible happens yet (no fullscreen component exists). No JS errors.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 6: Add CSS for inline chart affordance + fullscreen overlay

**Files:**
- Modify: `www/styles.css` (append at end of file)

- [ ] **Step 1: Append the new CSS block**

Open `www/styles.css`. Append at the end of the file (after the last existing block):

```css
/* === Verlauf Chart Fullscreen === */

/* Inline chart — tappable affordance */
.chart-wrap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.chart-wrap:active { opacity: 0.85; }
.chart-legend svg { opacity: 0.6; margin-left: 6px; flex-shrink: 0; }

/* Fullscreen overlay */
.chart-fs {
  position: fixed; inset: 0;
  background: var(--bg);
  z-index: 1000;
  display: flex; flex-direction: column;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  color: var(--text);
}

.chart-fs-top {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border);
}
.chart-fs-close {
  background: transparent; border: 0;
  font-size: 22px; line-height: 1;
  padding: 6px 10px;
  color: var(--text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.chart-fs-close:active { opacity: 0.6; }
.chart-fs-title {
  flex: 1;
  text-align: center;
  font-weight: 600;
  font-size: 15px;
  padding-top: 8px;
}
.chart-fs-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.chart-fs-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  /* No padding — SVG fills the body exactly, so the scrubber's PAD_X
     in viewBox units lines up 1:1 with CSS pixels. Visual breathing
     room is provided by the SVG's internal PAD_X / PAD_Y instead. */
  padding: 0;
  touch-action: none; /* prevent page scroll while scrubbing */
  user-select: none;
  -webkit-user-select: none;
}
.chart-fs-body svg {
  width: 100%;
  height: 100%;
  display: block;
}

.chart-fs-bottom {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  font-size: 14px;
}
.chart-fs-hint { color: var(--text-2); font-size: 13px; }
.chart-fs-values { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; }
.chart-fs-date { color: var(--text-2); font-weight: 600; }
.chart-fs-val.benny b { color: var(--accent); }
.chart-fs-val.jonas b { color: var(--accent-3); }

/* Scrubber visuals inside the SVG */
.chart-scrubber-line { stroke: var(--text-2); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.7; }
.chart-scrubber-dot { stroke: var(--bg); stroke-width: 2.5; }
```

- [ ] **Step 2: Manual verification**

Refresh. Go to Verlauf. Confirm:
1. The chart area shows the pointer cursor on hover (desktop) / tap-highlight is suppressed (mobile).
2. Tapping the chart briefly fades it slightly (opacity 0.85). No fullscreen yet (component not rendered) — but the affordance is right.
3. No layout regressions on the rest of the page.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 7: Build `FullscreenChart` component (the large SVG)

**Files:**
- Modify: `www/screens.jsx` — add the new component definition just below the existing `StatsChart` function (insert at the end of the `StatsChart` block, around line 713, before `function HistoryScreen`).

- [ ] **Step 1: Add the FullscreenChart component**

Locate the end of `StatsChart` (around line 712-713):

```jsx
      <text x={PAD_X - 4} y={H - PAD_Y + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">0</text>
    </svg>
  );
}

function HistoryScreen({ challenges, categories, allSets }) {
```

Insert a new component between `}` and `function HistoryScreen`:

```jsx
      <text x={PAD_X - 4} y={H - PAD_Y + 3} fill="var(--text-2)" fontSize="9" textAnchor="end">0</text>
    </svg>
  );
}

function FullscreenChart({ benny, jonas, days, accent, accent3, activeIdx, vw, vh }) {
  // Viewport-driven sizing. vw/vh are the body container's pixel size.
  const W = Math.max(300, vw);
  const H = Math.max(200, vh);
  const PAD_X = 44;
  const PAD_Y = 32;
  const maxV = Math.max(1, ...benny.map(d => d.reps), ...jonas.map(d => d.reps));
  const xStep = (W - PAD_X * 2) / Math.max(1, days - 1);
  const yScale = (v) => H - PAD_Y - (v / maxV) * (H - PAD_Y * 2);
  const xPos = (i) => PAD_X + i * xStep;

  const pathFor = (arr) => arr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yScale(d.reps).toFixed(1)}`).join(' ');
  const areaFor = (arr) => pathFor(arr) + ` L ${xPos(arr.length - 1).toFixed(1)} ${H - PAD_Y} L ${xPos(0).toFixed(1)} ${H - PAD_Y} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => H - PAD_Y - f * (H - PAD_Y * 2));

  // X labels — more of them than the inline chart (we have space)
  const labelCount = days <= 7 ? days : days <= 30 ? 7 : 9;
  const labelIdx = days <= 7
    ? benny.map((_, i) => i)
    : Array.from({ length: labelCount }, (_, k) => Math.round((k * (days - 1)) / (labelCount - 1)));
  const fmt = (s) => { const d = new Date(s); return `${d.getDate()}.${d.getMonth() + 1}`; };

  // Y labels — 4 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxV));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-benny-fs" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="grad-jonas-fs" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent3} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={accent3} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {gridLines.map((y, i) => <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
      <path d={areaFor(benny)} fill="url(#grad-benny-fs)"/>
      <path d={areaFor(jonas)} fill="url(#grad-jonas-fs)"/>
      <path d={pathFor(benny)} fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      <path d={pathFor(jonas)} fill="none" stroke={accent3} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
      {labelIdx.map(i => benny[i] && (
        <text key={`x${i}`} x={xPos(i)} y={H - 8} fill="var(--text-2)" fontSize="11" textAnchor="middle">{fmt(benny[i].date)}</text>
      ))}
      {yTicks.map((v, i) => (
        <text key={`y${i}`} x={PAD_X - 8} y={yScale(v) + 4} fill="var(--text-2)" fontSize="11" textAnchor="end">{v}</text>
      ))}
      {activeIdx !== null && activeIdx >= 0 && activeIdx < benny.length && (
        <g>
          <line
            className="chart-scrubber-line"
            x1={xPos(activeIdx)} x2={xPos(activeIdx)}
            y1={PAD_Y * 0.5} y2={H - PAD_Y * 0.6}
          />
          <circle
            className="chart-scrubber-dot"
            cx={xPos(activeIdx)} cy={yScale(benny[activeIdx].reps)}
            r="5" fill={accent}
          />
          <circle
            className="chart-scrubber-dot"
            cx={xPos(activeIdx)} cy={yScale(jonas[activeIdx].reps)}
            r="5" fill={accent3}
          />
        </g>
      )}
    </svg>
  );
}

function HistoryScreen({ challenges, categories, allSets }) {
```

- [ ] **Step 2: Manual verification**

This component is not used yet. Just verify the file parses (no JS errors on refresh, the Verlauf tab still renders normally).

```bash
grep -n "function FullscreenChart" /Users/jonasnolte/Desktop/terminator-ios/www/screens.jsx
```
Expected output: one line showing the function definition was added.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 8: Build `ChartFullscreen` component (the modal wrapper)

**Files:**
- Modify: `www/screens.jsx` — add the new component definition right after `FullscreenChart` (so before `function HistoryScreen`).

- [ ] **Step 1: Add the ChartFullscreen component**

Right before `function HistoryScreen({ challenges, categories, allSets }) {`, insert:

```jsx
function ChartFullscreen({
  bennySeries, jonasSeries, bennyCumSeries, jonasCumSeries, totalDays,
  range, setRange,
  cumulative, setCumulative,
  accent, accent3,
  onClose,
}) {
  const [activeIdx, setActiveIdx] = useState(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const bodyRef = React.useRef(null);

  // Body scroll lock while fullscreen is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Track viewport changes (rotation, browser resize).
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Reset scrubber when range changes (series length changes -> activeIdx may be out of bounds).
  useEffect(() => { setActiveIdx(null); }, [totalDays]);

  // Resolve which series to render based on cumulative flag.
  const benny = cumulative ? bennyCumSeries : bennySeries;
  const jonas = cumulative ? jonasCumSeries : jonasSeries;

  // Scrubber pointer handlers.
  const handlePointer = (e) => {
    const el = bodyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Account for the SVG's internal PAD_X (must match FullscreenChart's PAD_X = 44).
    const PAD_X = 44;
    const innerW = rect.width - PAD_X * 2;
    if (innerW <= 0) return;
    const xLocal = e.clientX - rect.left - PAD_X;
    const ratio = Math.max(0, Math.min(1, xLocal / innerW));
    const idx = Math.round(ratio * (totalDays - 1));
    setActiveIdx(Math.max(0, Math.min(totalDays - 1, idx)));
  };

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Body container dimensions for the chart (set via ref measurement).
  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!bodyRef.current) return;
    const el = bodyRef.current;
    const update = () => setBodySize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vp.w, vp.h]);

  return (
    <div className="chart-fs">
      <div className="chart-fs-top">
        <button className="chart-fs-close" onClick={onClose} aria-label="Schließen">✕</button>
        <div className="chart-fs-title">Benny vs. Jonas</div>
        <div className="chart-fs-controls">
          <div className="segmented segmented-sm">
            <button className={range==='7'?'active':''} onClick={()=>setRange('7')}>7T</button>
            <button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30T</button>
            <button className={range==='all'?'active':''} onClick={()=>setRange('all')}>All</button>
          </div>
          <div className="segmented segmented-sm">
            <button className={!cumulative?'active':''} onClick={()=>setCumulative(false)}>⌀ Tag</button>
            <button className={cumulative?'active':''} onClick={()=>setCumulative(true)}>Σ Kumuliert</button>
          </div>
        </div>
      </div>

      <div
        className="chart-fs-body"
        ref={bodyRef}
        onPointerDown={handlePointer}
        onPointerMove={(e) => { if (e.buttons) handlePointer(e); }}
      >
        <FullscreenChart
          benny={benny}
          jonas={jonas}
          days={totalDays}
          accent={accent}
          accent3={accent3}
          activeIdx={activeIdx}
          vw={bodySize.w}
          vh={bodySize.h}
        />
      </div>

      <div className="chart-fs-bottom">
        {activeIdx === null ? (
          <div className="chart-fs-hint">Tippe in das Diagramm für Tageswerte</div>
        ) : (
          <div className="chart-fs-values">
            <span className="chart-fs-date">{fmtDate(benny[activeIdx].date)}</span>
            <span className="chart-fs-val benny">Benny: <b>{benny[activeIdx].reps}</b></span>
            <span className="chart-fs-val jonas">Jonas: <b>{jonas[activeIdx].reps}</b></span>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryScreen({ challenges, categories, allSets }) {
```

- [ ] **Step 2: Manual verification**

Component is defined but not rendered yet. Verify the file parses:

```bash
grep -n "function ChartFullscreen" /Users/jonasnolte/Desktop/terminator-ios/www/screens.jsx
```
Expected: one line showing the function exists. Refresh the app — Verlauf still works, no console errors.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 9: Render `ChartFullscreen` conditionally in HistoryView

**Files:**
- Modify: `www/screens.jsx` — inside the `HistoryView` return statement, append the conditional render at the bottom (just before the closing `</>`)

- [ ] **Step 1: Locate the end of the HistoryView JSX**

Around line 949–951 (depending on current state), the JSX inside `HistoryView` ends like:

```jsx
            })}
          </div>
        )}
      </div>    {/* closes <div className="card"> */}
    </>
  );
}
```

(The exact line numbers will have shifted slightly due to Task 4 additions. Find the closing `</>` of the `HistoryView` return.)

- [ ] **Step 2: Add the conditional render before the closing `</>`**

Replace:

```jsx
            })}
          </div>
        )}
      </div>
    </>
  );
}
```

With:

```jsx
            })}
          </div>
        )}
      </div>
      {fullscreen && (
        <ChartFullscreen
          bennySeries={bennySeries}
          jonasSeries={jonasSeries}
          bennyCumSeries={bennyCumSeries}
          jonasCumSeries={jonasCumSeries}
          totalDays={totalDays}
          range={range}
          setRange={setRange}
          cumulative={cumulative}
          setCumulative={setCumulative}
          accent={accentColors.accent}
          accent3={accentColors.accent3}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Update `window` exports**

Find the last line of `www/screens.jsx` (around line 1006):

```jsx
Object.assign(window, { HomeScreen, SetupSheet, LogSheet, FeedScreen, HistoryScreen, StatsChart, HistoryView, computeAthleteStats, MiniStat });
```

Replace with:

```jsx
Object.assign(window, { HomeScreen, SetupSheet, LogSheet, FeedScreen, HistoryScreen, StatsChart, FullscreenChart, ChartFullscreen, HistoryView, computeAthleteStats, MiniStat });
```

This is consistent with the project's pattern (every top-level screen/chart component is exported to `window`).

- [ ] **Step 4: Manual verification**

Refresh. In Verlauf:

1. Tap the chart. The screen should be replaced by a fullscreen view: top bar with ✕, "Benny vs. Jonas" title, and the two segmented controls (range + cumulative) on the right.
2. The middle area shows the chart filling most of the screen.
3. The bottom bar says "Tippe in das Diagramm für Tageswerte".
4. Tap ✕. The fullscreen closes, you're back at the Verlauf list.
5. The page underneath should still be scroll-locked while fullscreen is open (try scrolling — won't scroll). After closing, scroll works again.
6. Open fullscreen again, tap 7T / 30T / All — the chart and underlying data update. Switch ⌀/Σ — the chart shape changes. Close — the inline chart in Verlauf reflects the last-chosen range and cumulative state (since state lives in HistoryView).

- [ ] **Step 5: Skip commit (no git)**

---

## Task 10: Verify scrubber interaction

**Files:** None to modify — this is purely a manual verification task to ensure the scrubber implementation from Task 7+8 works end-to-end.

- [ ] **Step 1: Manual scrubber test**

Open Verlauf, tap the chart to open Fullscreen. With finger or mouse:

1. **Single tap inside chart area** — a vertical dashed line appears at that x-position, and two colored dots (green/yellow accents) appear on the curves. The bottom bar updates from the hint to show `<date> · Benny: <reps> · Jonas: <reps>`.
2. **Drag horizontally** — the scrubber line and dots follow your finger. Values in the bottom bar update live.
3. **Release** — the scrubber stays at the last position. Values stay visible.
4. **Tap elsewhere** — scrubber jumps to new position.
5. **Switch range (7T → 30T)** — scrubber disappears (hint comes back) because the series length changed.
6. **Switch ⌀ → Σ** with scrubber active — scrubber stays at the same index, but the dots and values now reflect cumulative numbers. Verify: Benny's cumulative value should equal sum of all Benny daily values up to (and including) that day.

- [ ] **Step 2: Verify edge cases**

1. **Empty filter** — Apply a category filter that yields no sets (or no sets at all). The fullscreen chart still opens; lines are flat at 0. Scrubber works — values show 0 / 0.
2. **All-mode with old data** — If you have data older than 89 days, the All range is capped at 90 days starting today-89. Verify scrubber's left edge corresponds to "today - 89" and right edge to today.
3. **Orientation** (if not portrait-locked) — Rotate the device to landscape. The chart re-renders into the wider area. The scrubber still tracks the finger correctly.

If any of these fail, note which and report back before continuing.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 11: Polish — verify visual consistency

**Files:** None to modify (or minor CSS tweaks if visual issues found).

- [ ] **Step 1: Visual review**

In Verlauf:

1. **Inline-Chart**: Expand icon visible in the legend row, no layout shift on hover/tap. Title text reads "Reps pro Tag" or "Kumuliert" correctly. Tap-to-open works smoothly.
2. **Card header**: Two segmented control rows are vertically stacked with reasonable spacing. The second row aligns to the right edge. Not visually crowded.
3. **Fullscreen top bar**: Close button (✕) on left, title centered, controls on the right. Both segmented controls fit in the right column. Padding feels comfortable.
4. **Fullscreen body**: Chart fills the available space with adequate padding. Y-axis labels visible on the left (0, 25%, 50%, 75%, 100% of max). X-axis labels visible at the bottom, evenly spaced and readable.
5. **Fullscreen bottom bar**: Hint state is muted text-2 color. Active state shows date + values with colored numbers (Benny = accent, Jonas = accent-3).
6. **Dark mode** (if app supports it via CSS vars): Re-check all the above in dark mode. The `var(--bg)`, `var(--text)`, `var(--border)`, `var(--text-2)` references should make this work automatically.

- [ ] **Step 2: Adjust CSS if anything looks off**

If something needs tweaking — for example the close button feels too small, or the controls overflow the top-bar on narrow screens — adjust `www/styles.css`. Common quick fixes:

- Close button too small for fingers: increase `.chart-fs-close { padding: 10px 14px; }`.
- Top bar wraps on narrow screens: `.chart-fs-top { flex-wrap: wrap; }`.
- Bottom bar text too long: `.chart-fs-values { gap: 10px; font-size: 13px; }`.

Document any changes you made here in this checkbox so a reviewer knows what was adjusted.

- [ ] **Step 3: Skip commit (no git)**

---

## Task 12: Final end-to-end manual test

**Files:** None — final verification pass.

- [ ] **Step 1: Run all scenarios from the spec's Testing section**

Open Verlauf with realistic data:

1. ☐ Toggle Kumuliert ein/aus — Linien-Form ändert sich, Y-Achsen-Max passt sich an.
2. ☐ Tap auf Inline-Chart → Fullscreen öffnet, Body scrollt nicht mehr.
3. ☐ Im Fullscreen ✕ tappen → schließt, Body scrollt wieder.
4. ☐ Im Fullscreen tappen + ziehen → Scrubber folgt Finger, Bottom-Bar zeigt korrekte Werte.
5. ☐ Loslassen → Scrubber bleibt stehen, Werte weiter sichtbar.
6. ☐ Range im Fullscreen ändern → Serien refreshen, Scrubber-Hint erscheint wieder.
7. ☐ Kumuliert im Fullscreen toggeln → Linien ändern Form, Scrubber zeigt jetzt kumulierte Werte.
8. ☐ Falls Gerät rotierbar: in Fullscreen rotieren → Chart füllt neue Viewport-Größe.

For each, tick the box once verified. If any fail, stop and report which.

- [ ] **Step 2: iOS-Simulator check**

Run `npx cap sync ios && npx cap run ios` from the project root and repeat the scenarios above on the simulator. Web-only verification can miss safe-area issues. Specifically:

- The top bar should not overlap with the iOS status bar (the safe-area padding is applied).
- The bottom bar should not be cut off by the home indicator on devices with a notch.

- [ ] **Step 3: Report success**

When all 8 scenarios pass on both browser and simulator, report back to the user with a brief summary of what's working.

- [ ] **Step 4: Skip commit (no git)**

---

## Out of Scope

Explicitly NOT in this plan (deferred to future iterations):
- Hardware-Back / Swipe-Down-Geste zum Schließen
- Erzwungene Landscape-Rotation in Capacitor config
- Scrubber im Inline-Chart
- Crossfade-Animationen beim Öffnen/Schließen des Fullscreen
- Pinch-to-Zoom auf Sub-Bereiche des Charts
- Y-Achsen-Auto-Scaling auf zoom-Range statt globalem Max
