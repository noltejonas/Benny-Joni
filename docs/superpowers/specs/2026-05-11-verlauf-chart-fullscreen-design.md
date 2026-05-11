# Verlauf Chart — Kumuliert + Fullscreen — Design

**Date:** 2026-05-11
**Scope:** Erweiterung des Statistik-Charts im "Verlauf"-Tab um (1) einen Kumuliert-Toggle und (2) einen Fullscreen-Modus mit Datenpunkt-Scrubber.

## Goal

Im Tab "Verlauf" zeigt der `StatsChart` aktuell die Reps pro Tag für Benny vs. Jonas innerhalb des gewählten Zeitraums (7T / 30T / All). Zwei Funktionen kommen dazu:

1. **Kumuliert-Toggle** — Umschalten zwischen "Reps pro Tag" und kumulativer Summe innerhalb des Zeitfensters.
2. **Fullscreen-Modus** — Tap auf den Inline-Chart öffnet eine bildschirmfüllende Ansicht mit einem Scrubber, der einzelne Datenpunkte (Datum + Werte für Benny und Jonas) präzise ablesbar macht.

## User Decisions (aus Brainstorming)

- **Kumuliert wirkt nur auf die Chart-Linien** — Mini-Stats, Leader-Pille, Kategorie-Aufschlüsselung bleiben unverändert (Frage 1: a).
- **Fullscreen unterstützt beide Orientierungen responsiv**, aber **erzwingt keine Rotation** — die App ändert nicht ihre Rotations-Konfiguration; das Layout passt sich nur an die aktuelle Viewport-Größe an (Frage 2: c, modifiziert).
- **Scrubber/Crosshair** für Datenpunkt-Inspektion (Frage 3: a).
- **Tap auf den Inline-Chart** öffnet Fullscreen (Frage 4: a).
- **Kumuliert-Toggle lebt im Card-Header** und gilt gemeinsam für Inline-Chart und Fullscreen (Frage 5: a).
- **Scrubber bleibt nach Loslassen stehen** — nicht auto-hide.

## Architecture

### Modified: `www/screens.jsx` — `HistoryView`

Neue States in `HistoryView` (neben `range`, `selectedCats`):

```js
const [cumulative, setCumulative] = useState(false);
const [fullscreen, setFullscreen] = useState(false);
```

Die bestehende `useMemo` (Zeilen 786–824), die `bennySeries` und `jonasSeries` berechnet, wird erweitert: zusätzlich zur per-Tag-Berechnung wird jeweils eine kumulierte Variante als laufende Summe innerhalb des gewählten Zeitfensters mitgerechnet:

```js
let bennyAcc = 0, jonasAcc = 0;
const bennyCumArr = bennyArr.map(d => ({ date: d.date, reps: (bennyAcc += d.reps) }));
const jonasCumArr = jonasArr.map(d => ({ date: d.date, reps: (jonasAcc += d.reps) }));
return { bennySeries, jonasSeries, bennyCumSeries: bennyCumArr, jonasCumSeries: jonasCumArr, rangeStart, totalDays };
```

Beim Render werden — abhängig von `cumulative` — die passenden Serien an `StatsChart` (Inline) und `ChartFullscreen` weitergegeben. Die Skalierung im Chart (`maxV = max(...)`) passt sich automatisch an, da kumuliert die Werte deutlich höher sind.

### Modified: `www/screens.jsx` — `StatsChart`

Bleibt eine reine Präsentationskomponente, keine Signatur-Änderung. Der `chart-title`-Text wird vom Eltern-Component gesetzt (siehe unten in `.chart-legend`).

Der Wrapper um `StatsChart` wird tappable:

```jsx
<div className="chart-wrap" onClick={() => setFullscreen(true)} role="button" tabIndex={0}>
  <div className="chart-legend">
    <span><span className="dot" style={{...}}/>Benny</span>
    <span><span className="dot" style={{...}}/>Jonas</span>
    <span className="chart-title">{cumulative ? 'Kumuliert' : 'Reps pro Tag'}</span>
    <Icon name="expand" className="chart-expand-icon" aria-hidden="true"/>
  </div>
  <StatsChart benny={cumulative ? bennyCumSeries : bennySeries}
              jonas={cumulative ? jonasCumSeries : jonasSeries}
              days={totalDays}
              accent={...} accent3={...}/>
</div>
```

Das Expand-Icon ist visuelles Affordance; der ganze `.chart-wrap` ist der Tap-Trigger.

### Modified: `www/screens.jsx` — Card-Header (`.vs-head` + neue Zeile)

Im selben Card oberhalb des Charts, im `.vs-head`-Block bleibt das bestehende 7T/30T/All-Segmented. Direkt darunter (oder als zweite Zeile innerhalb des Headers) kommt ein zweiter Segmented Control:

```jsx
<div className="segmented segmented-sm">
  <button className={!cumulative ? 'active' : ''} onClick={() => setCumulative(false)}>⌀ Tag</button>
  <button className={cumulative ? 'active' : ''} onClick={() => setCumulative(true)}>Σ Kumuliert</button>
</div>
```

Wiederverwendung der bestehenden `.segmented` / `.segmented-sm` Styles — keine neuen Komponenten-Designs.

### New: `www/screens.jsx` — `ChartFullscreen` Komponente

```jsx
function ChartFullscreen({
  bennySeries, jonasSeries, totalDays,
  range, setRange,
  cumulative, setCumulative,
  accent, accent3,
  onClose,
}) {
  const [activeIdx, setActiveIdx] = useState(null);

  // Body-Scroll-Lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Viewport-Größe für responsives Chart-Sizing
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Scrubber-Handler
  const onPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (totalDays - 1));
    setActiveIdx(Math.max(0, Math.min(totalDays - 1, idx)));
  };

  return (
    <div className="chart-fs">
      <div className="chart-fs-top">
        <button className="chart-fs-close" onClick={onClose}>✕</button>
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

      <div className="chart-fs-body"
           onPointerDown={onPointer}
           onPointerMove={(e) => { if (e.buttons) onPointer(e); }}>
        <FullscreenChart benny={bennySeries} jonas={jonasSeries} days={totalDays}
                         accent={accent} accent3={accent3}
                         activeIdx={activeIdx} vp={vp}/>
      </div>

      <div className="chart-fs-bottom">
        {activeIdx === null ? (
          <div className="chart-fs-hint">Tippe in das Diagramm für Tageswerte</div>
        ) : (
          <div className="chart-fs-values">
            <span className="chart-fs-date">{formatDate(bennySeries[activeIdx].date)}</span>
            <span className="chart-fs-val benny">Benny: <b>{bennySeries[activeIdx].reps}</b></span>
            <span className="chart-fs-val jonas">Jonas: <b>{jonasSeries[activeIdx].reps}</b></span>
          </div>
        )}
      </div>
    </div>
  );
}
```

`FullscreenChart` ist eine angepasste Version von `StatsChart`, die:
- Die Viewport-Breite/-Höhe als Basis für `W`/`H` nimmt (statt fest 320×140).
- Zusätzlich den Scrubber rendert: vertikale gestrichelte Linie an `xPos(activeIdx)`, zwei `<circle>` an den Datenpunkten.
- Mehr X-Achsen-Labels zeigt (mehr Platz).

`FullscreenChart` kann entweder als zweite Komponente nebenan stehen oder `StatsChart` wird so refaktoriert, dass es `viewportW/viewportH` + `activeIdx` als optionale Props bekommt. **Empfohlen: zweite Komponente** (`FullscreenChart`), weil die Logik (Scrubber, große X-Labels, responsives Sizing) signifikant abweicht und ein Refactor von `StatsChart` die kleine Variante unnötig kompliziert macht.

### Modified: `www/styles.css`

Neue Klassen:

```css
/* Inline expand affordance */
.chart-wrap { cursor: pointer; }
.chart-wrap:active { opacity: 0.85; }
.chart-expand-icon { width: 14px; height: 14px; opacity: 0.6; margin-left: 6px; }

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
}
.chart-fs-top {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
}
.chart-fs-close { background: transparent; border: 0; font-size: 20px; padding: 8px; color: var(--text); }
.chart-fs-title { font-weight: 600; flex: 1; text-align: center; }
.chart-fs-controls { display: flex; flex-direction: column; gap: 4px; }
.chart-fs-body {
  flex: 1; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  touch-action: none; /* prevent scroll while scrubbing */
}
.chart-fs-body svg { width: 100%; height: 100%; }
.chart-fs-bottom {
  padding: 10px 16px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  min-height: 40px;
}
.chart-fs-hint { color: var(--text-2); font-size: 13px; }
.chart-fs-values { display: flex; gap: 14px; align-items: center; font-size: 13px; }
.chart-fs-values .benny b { color: var(--accent); }
.chart-fs-values .jonas b { color: var(--accent-3); }

/* Scrubber visuals (inside SVG) */
.chart-scrubber-line { stroke: var(--text-2); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.6; }
.chart-scrubber-dot-benny { fill: var(--accent); stroke: white; stroke-width: 2; }
.chart-scrubber-dot-jonas { fill: var(--accent-3); stroke: white; stroke-width: 2; }
```

### `window` exports

Am Ende von `screens.jsx` wird `ChartFullscreen` (und ggf. `FullscreenChart`) zu `Object.assign(window, {...})` hinzugefügt, konsistent mit dem bestehenden Pattern.

## Interaktionsdetails

### Inline-Chart
- Tap irgendwo im `.chart-wrap` öffnet Fullscreen.
- Kein Scrubber, keine zusätzliche Touch-Interaktion (zu klein, würde mit Tap kollidieren).
- Active-State (leichte Opacity-Reduktion) gibt Tap-Feedback.

### Fullscreen-Chart
- **Öffnen**: `setFullscreen(true)` → Komponente mountet, Body-Scroll wird gelockt.
- **Scrubber-Default**: `activeIdx === null`. Bottom-Bar zeigt Hinweis "Tippe in das Diagramm für Tageswerte".
- **Scrubber-Interaktion**: `onPointerDown` setzt `activeIdx`, `onPointerMove` (während `buttons > 0`) updated live, `onPointerUp` lässt den Scrubber stehen. Bottom-Bar zeigt jetzt `Datum | Benny: X | Jonas: Y`.
- **Range / Kumuliert-Wechsel im Fullscreen**: Setter aus `HistoryView` werden durchgereicht — Wechsel im Fullscreen synchronisiert direkt den Inline-Chart, weil beide aus dem gleichen `HistoryView`-State lesen. `activeIdx` wird auf `null` zurückgesetzt, wenn `range` oder die Serienlänge ändert (sonst zeigt der Scrubber auf einen falschen Index).
- **Schließen**: Tap auf ✕ → `onClose()` → `setFullscreen(false)`. Body-Scroll-Lock wird im Cleanup-Hook gelöst.
- **Rotation**: Wenn iOS die App rotieren lässt, fängt der `resize` / `orientationchange` Listener das ab und passt das Chart-Sizing an. Die Komponente erzwingt nichts.

## Edge Cases

- **`totalDays === 1`** (nur ein Tag): Scrubber-Index immer 0, Linie fällt auf einen Punkt — funktioniert, aber visuell langweilig. Akzeptabel.
- **Leere Serien** (`filteredSets` leer wegen Kategorie-Filter): bennySeries/jonasSeries enthalten alle Tage mit `reps: 0`. Chart zeigt flache Linie bei 0. Scrubber funktioniert weiter (zeigt "0 / 0").
- **Range-Wechsel während Fullscreen offen**: Serien werden neu berechnet, `activeIdx` muss auf `null` zurückgesetzt werden (sonst Out-of-Bounds). Realisiert via `useEffect([totalDays])` in `ChartFullscreen`.
- **Toggle Kumuliert während Fullscreen offen**: Serien-Werte ändern sich, aber Länge bleibt gleich → `activeIdx` darf bleiben, der Scrubber zeigt automatisch die neuen Werte.
- **Sehr alte iOS-Versionen / kein `PointerEvent`**: Capacitor + iOS 13+ unterstützen `PointerEvent`. Falls Fallback nötig wird: Touch-Events. Nicht im Initial-Scope.

## Testing

- **Manuell** über live-reload im `www/`-Ordner (oder `npx cap run ios`), da keine automatisierten Tests im Projekt existieren.
- Test-Szenarien:
  1. Toggle Kumuliert ein/aus — Linien-Form ändert sich, Y-Achsen-Max passt sich an.
  2. Tap auf Inline-Chart → Fullscreen öffnet, Body scrollt nicht mehr.
  3. Im Fullscreen ✕ tappen → schließt, Body scrollt wieder.
  4. Im Fullscreen tappen + ziehen → Scrubber folgt Finger, Bottom-Bar zeigt korrekte Werte.
  5. Loslassen → Scrubber bleibt stehen, Werte weiter sichtbar.
  6. Range im Fullscreen ändern → Serien refreshen, Scrubber-Hint erscheint wieder.
  7. Kumuliert im Fullscreen toggeln → Linien ändern Form, Scrubber zeigt jetzt kumulierte Werte.
  8. Falls Gerät rotierbar: in Fullscreen rotieren → Chart füllt neue Viewport-Größe.

## Out of Scope

- Hardware-Back / Swipe-Down-Geste zum Schließen (kann in V2).
- Erzwungene Landscape-Rotation.
- Scrubber im Inline-Chart.
- Animationen beim Öffnen/Schließen des Fullscreen (Crossfade etc.) — falls gewünscht, kann in V2 dazu.
- Pinch-to-Zoom auf Sub-Bereiche des Charts.
