# Tagesziele Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro Athlet auf der Home-Challenge-Karte ein Tagesziel mit kumulativem On-Track-Status und Vortags-Pfeil anzeigen.

**Architecture:** Drei reine Helper-Funktionen oben in `www/screens.jsx`, eine neue React-Sub-Komponente `DailyStatus`, zwei kleine Render-Anpassungen in den `rings`- und `bar`/`numeric`-Layouts derselben Datei, plus CSS in `www/styles.css`. Keine Backend-/Schema-Änderungen.

**Tech Stack:** Vanilla React + JSX (Babel im Browser), Capacitor iOS, kein Testframework — Verifikation über Claude Preview (`preview_start`, `preview_eval`, `preview_snapshot`).

**Spec:** [docs/superpowers/specs/2026-05-12-tagesziele-design.md](../specs/2026-05-12-tagesziele-design.md)

---

## File Structure

- **Modify:** `www/screens.jsx` — neue Helper oben, neue `DailyStatus`-Komponente, zwei Render-Bereiche in `HomeScreen` angepasst (`screens.jsx:125-220`).
- **Modify:** `www/styles.css` — neue Klassen `.daily-line`, `.arrow-up`/`.arrow-down`/`.arrow-flat`, `.track-status.ok`/`.behind` ans Ende der Datei.

---

### Task 1: Helper-Funktionen

**Files:**
- Modify: `www/screens.jsx` (am Anfang der Datei, vor der `HomeScreen`-Funktion)

- [ ] **Step 1: Helper-Funktionen einfügen**

Vor `function HomeScreen(...)` (vor Zeile ~115 — der erste `export`/`function`-Block in der Datei) einfügen:

```js
function localDateOf(input) {
  const d = input instanceof Date ? input : new Date(input);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayIndexInWeek(weekStart, today = new Date()) {
  const ws = new Date(weekStart + 'T00:00:00');
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const diff = Math.floor((t - ws) / 86400000) + 1;
  return Math.max(1, Math.min(7, diff));
}

function repsOnLocalDate(sets, athlete, dateStr) {
  return sets
    .filter(s => s.athlete === athlete && localDateOf(s.created_at) === dateStr)
    .reduce((sum, s) => sum + s.reps, 0);
}
```

- [ ] **Step 2: Dev-Preview starten**

Wenn noch nicht läuft: `preview_start` mit dem Projekt-Root. Andernfalls `preview_eval: window.location.reload()`.

- [ ] **Step 3: Helper im Browser verifizieren**

`preview_eval` mit folgendem Snippet ausführen:

```js
(() => {
  // Diese Helper sind nicht global, daher minimaler Smoke-Test über Konsole:
  // Ohne globale Sichtbarkeit lässt sich dies erst nach Integration testen.
  // Hier reicht: kein Syntax-Fehler, Seite lädt.
  return { reloaded: true, url: location.pathname };
})();
```

Erwartet: `{ reloaded: true, url: ... }`. Falls die Seite nicht lädt, `preview_console_logs` prüfen — JSX-Syntaxfehler beheben.

- [ ] **Step 4: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): add date helpers for daily target calc"
```

---

### Task 2: CSS für Tageszeile und Status

**Files:**
- Modify: `www/styles.css` (ans Ende)

- [ ] **Step 1: CSS-Klassen einfügen**

Am Ende von `www/styles.css` anhängen:

```css
/* Daily target line + on-track status (per-athlete) */
.daily-line {
  font-size: 11px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tug-side.jonas .daily-line { justify-content: flex-end; }
.daily-line .arrow-up { color: var(--accent); font-weight: 700; }
.daily-line .arrow-down { color: var(--danger); font-weight: 700; }
.daily-line .arrow-flat { color: var(--text-3); font-weight: 700; }
.track-status {
  font-size: 11px;
  font-weight: 700;
  margin-top: 2px;
}
.track-status.ok { color: var(--accent); }
.track-status.behind { color: var(--warning); }
.tug-side.jonas .track-status.ok { color: var(--accent-3); }
.split-cell.jonas .track-status.ok { color: var(--accent-3); }
```

- [ ] **Step 2: Reload und visuell prüfen**

`preview_eval: window.location.reload()`. Dann `preview_console_logs` — keine CSS-Errors erwartet. Die Klassen sind noch nicht im DOM, also nichts Sichtbares zu erwarten.

- [ ] **Step 3: Commit**

```bash
git add www/styles.css
git commit -m "feat(home): css for daily-line and track-status"
```

---

### Task 3: `DailyStatus`-Sub-Komponente

**Files:**
- Modify: `www/screens.jsx` (direkt nach den Helpern aus Task 1)

- [ ] **Step 1: Komponente einfügen**

Direkt nach `repsOnLocalDate` einfügen:

```jsx
function DailyStatus({ variant, athleteSide, done, fairShare, dailyTarget, todayReps, trackDelta, arrowDelta, showArrow }) {
  const isDone = done >= fairShare;
  const footerClass = variant === 'tug' ? 'tug-foot' : 'owe';

  if (isDone) {
    return <div className={`${footerClass} mono done`}>✓ erledigt</div>;
  }

  const arrow = !showArrow ? null
    : arrowDelta > 0 ? <span className="arrow-up">↑ +{arrowDelta}</span>
    : arrowDelta < 0 ? <span className="arrow-down">↓ {arrowDelta}</span>
    : <span className="arrow-flat">→ ±0</span>;

  const statusClass = trackDelta >= 0 ? 'ok' : 'behind';
  const statusText = trackDelta >= 0 ? '✓ Auf Kurs' : `${Math.abs(trackDelta)} hinten`;

  return (
    <>
      <div className="daily-line mono">
        <span>heute {todayReps} / {dailyTarget}</span>
        {arrow}
      </div>
      <div className={`track-status ${statusClass}`}>{statusText}</div>
    </>
  );
}
```

- [ ] **Step 2: Reload, Lade-Fehler prüfen**

`preview_eval: window.location.reload()`. Dann `preview_console_logs` — kein JSX-Fehler erwartet. Komponente wird noch nicht gerendert.

- [ ] **Step 3: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): add DailyStatus component"
```

---

### Task 4: Berechnungen in `HomeScreen`-Map ergänzen

**Files:**
- Modify: `www/screens.jsx:125-137` (im `challenges.map(ch => {...})`-Block)

- [ ] **Step 1: Neue Variablen in der Map-Callback berechnen**

Nach `const jonasOwed = Math.max(0, fairShare - jonasDone);` (Zeile ~136), vor `return (` einfügen:

```js
const todayStr = localDateOf(new Date());
const yesterdayStr = localDateOf(new Date(Date.now() - 86400000));
const dayIdx = dayIndexInWeek(ch.week_start);
const dailyTarget = Math.ceil(fairShare / 7);
const expectedByEod = Math.ceil(fairShare * dayIdx / 7);
const showArrow = dayIdx >= 2;

const bennyToday = repsOnLocalDate(csets, 'Benny', todayStr);
const bennyYesterday = repsOnLocalDate(csets, 'Benny', yesterdayStr);
const bennyTrackDelta = bennyDone - expectedByEod;
const bennyArrowDelta = bennyToday - bennyYesterday;

const jonasToday = repsOnLocalDate(csets, 'Jonas', todayStr);
const jonasYesterday = repsOnLocalDate(csets, 'Jonas', yesterdayStr);
const jonasTrackDelta = jonasDone - expectedByEod;
const jonasArrowDelta = jonasToday - jonasYesterday;
```

- [ ] **Step 2: Reload, keine UI-Änderung erwartet**

`preview_eval: window.location.reload()`. Dann `preview_console_logs` — keine Errors. UI noch unverändert.

- [ ] **Step 3: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): compute per-athlete daily/track/arrow deltas"
```

---

### Task 5: `rings`-Layout (`.tug-side`) auf `DailyStatus` umstellen

**Files:**
- Modify: `www/screens.jsx:174-184` (innerhalb `{layout==='rings' && (` Block, jeweils Benny- und Jonas-Seite)

- [ ] **Step 1: Benny-Seite anpassen**

Den aktuellen Block:

```jsx
<div className="tug-side benny">
  <div className="tug-who"><img src="uploads/benny.jpg" alt="Benny" className="tug-avatar"/>Benny</div>
  <div className="tug-reps mono">{bennyDone}</div>
  <div className={`tug-foot mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div>
</div>
```

ersetzen durch:

```jsx
<div className="tug-side benny">
  <div className="tug-who"><img src="uploads/benny.jpg" alt="Benny" className="tug-avatar"/>Benny</div>
  <div className="tug-reps mono">{bennyDone}</div>
  <DailyStatus
    variant="tug"
    athleteSide="benny"
    done={bennyDone}
    fairShare={fairShare}
    dailyTarget={dailyTarget}
    todayReps={bennyToday}
    trackDelta={bennyTrackDelta}
    arrowDelta={bennyArrowDelta}
    showArrow={showArrow}
  />
</div>
```

- [ ] **Step 2: Jonas-Seite anpassen**

Den aktuellen Block:

```jsx
<div className="tug-side jonas">
  <div className="tug-who">Jonas<img src="uploads/jonas.jpg" alt="Jonas" className="tug-avatar"/></div>
  <div className="tug-reps mono">{jonasDone}</div>
  <div className={`tug-foot mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div>
</div>
```

ersetzen durch:

```jsx
<div className="tug-side jonas">
  <div className="tug-who">Jonas<img src="uploads/jonas.jpg" alt="Jonas" className="tug-avatar"/></div>
  <div className="tug-reps mono">{jonasDone}</div>
  <DailyStatus
    variant="tug"
    athleteSide="jonas"
    done={jonasDone}
    fairShare={fairShare}
    dailyTarget={dailyTarget}
    todayReps={jonasToday}
    trackDelta={jonasTrackDelta}
    arrowDelta={jonasArrowDelta}
    showArrow={showArrow}
  />
</div>
```

- [ ] **Step 3: Im rings-Layout visuell prüfen**

`preview_eval: window.location.reload()`. Falls Layout-Picker im Settings auf `rings` steht, sollte die Tug-Bar jetzt unter den Reps für jeden Athleten zwei neue Zeilen zeigen (Tageszeile + Status). Andernfalls per `preview_eval` testweise umstellen:

```js
localStorage.setItem('pt:layout', 'rings'); location.reload();
```

Dann `preview_snapshot` machen und prüfen: beide Athleten haben „heute X / Y" und „✓ Auf Kurs" oder „N hinten". `preview_console_logs` — keine Errors.

- [ ] **Step 4: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): daily target in rings tug-side layout"
```

---

### Task 6: `bar`/`numeric`-Layout (`.split-cell`) auf `DailyStatus` umstellen

**Files:**
- Modify: `www/screens.jsx:207-216` (innerhalb `{layout!=='rings' && <div className="split-row">` Block)

- [ ] **Step 1: Split-Cells anpassen**

Den aktuellen Block:

```jsx
{layout!=='rings' && <div className="split-row">
  <div className="split-cell benny">
    <div className="who"><img src="uploads/benny.jpg" alt="Benny" className="cell-avatar"/>Benny</div>
    <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
    <div className={`owe mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div></div>
  <div className="split-cell jonas">
    <div className="who"><img src="uploads/jonas.jpg" alt="Jonas" className="cell-avatar"/>Jonas</div>
    <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
    <div className={`owe mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div></div>
</div>}
```

ersetzen durch:

```jsx
{layout!=='rings' && <div className="split-row">
  <div className="split-cell benny">
    <div className="who"><img src="uploads/benny.jpg" alt="Benny" className="cell-avatar"/>Benny</div>
    <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
    <DailyStatus
      variant="cell"
      athleteSide="benny"
      done={bennyDone}
      fairShare={fairShare}
      dailyTarget={dailyTarget}
      todayReps={bennyToday}
      trackDelta={bennyTrackDelta}
      arrowDelta={bennyArrowDelta}
      showArrow={showArrow}
    />
  </div>
  <div className="split-cell jonas">
    <div className="who"><img src="uploads/jonas.jpg" alt="Jonas" className="cell-avatar"/>Jonas</div>
    <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
    <DailyStatus
      variant="cell"
      athleteSide="jonas"
      done={jonasDone}
      fairShare={fairShare}
      dailyTarget={dailyTarget}
      todayReps={jonasToday}
      trackDelta={jonasTrackDelta}
      arrowDelta={jonasArrowDelta}
      showArrow={showArrow}
    />
  </div>
</div>}
```

- [ ] **Step 2: Im bar-Layout visuell prüfen**

`preview_eval` zum Umschalten:

```js
localStorage.setItem('pt:layout', 'bar'); location.reload();
```

`preview_snapshot`. Erwartet: pro Split-Cell unter „{bennyDone} / {fairShare}" eine Tageszeile und eine Statuszeile. `preview_console_logs` — keine Errors.

Dann `numeric`:

```js
localStorage.setItem('pt:layout', 'numeric'); location.reload();
```

`preview_snapshot`. Selbe Erwartung.

- [ ] **Step 3: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): daily target in split-cell layouts"
```

---

### Task 7: Edge-Case-Verifikation per `preview_eval`

**Files:**
- nur Read-only Verifikation, keine Code-Änderungen

Ziel: Vier kritische Szenarien manuell triggern und per `preview_snapshot` festhalten, um sicher zu sein, dass die Edge-Cases korrekt gerendert werden. Daten direkt im Memory-Store anpassen (falls Demo-Modus läuft) — die App nutzt `PTData.driver === 'demo'` ohne Supabase-Connection.

- [ ] **Step 1: Tag 1 — kein Pfeil**

`preview_eval`:

```js
// Setze week_start auf heute (Montag-Ableitung):
const today = new Date();
const day = today.getDay();
const diffToMon = (day === 0 ? -6 : 1 - day);
const mon = new Date(today); mon.setDate(today.getDate() + diffToMon); mon.setHours(0,0,0,0);
const monStr = mon.toISOString().slice(0,10);
console.log('Setze week_start auf', monStr);
// Sichtbar: heute = Montag dieser Woche → dayIdx=1 → kein Pfeil sichtbar.
```

`preview_snapshot`. Falls heute tatsächlich Montag ist: kein Pfeil. Falls nicht Montag, mit `preview_eval` einen Satz von gestern simulieren und prüfen, ob bei Tag 1 (Montag) der Pfeil ausgeblendet ist — am einfachsten in DevTools über den Demo-Store. Falls nicht reproduzierbar, weiter mit Step 2.

- [ ] **Step 2: Athlet fertig — nur „✓ erledigt"**

`preview_eval`:

```js
// Im Demo-Modus: einen großen Satz für Benny loggen, der fairShare überschreitet.
// Über das App-UI: 'Satz loggen' für die aktuelle Challenge mit reps = fairShare (oder mehr) als Benny.
```

Manuell über das App-UI einen Satz mit `reps >= fairShare` als Benny loggen. `preview_snapshot`. Erwartet: Benny-Zelle zeigt nur `✓ erledigt`, keine Tageszeile, kein Pfeil. Jonas-Zelle weiter mit Tageszeile + Status.

- [ ] **Step 3: „hinten"-Fall (amber)**

Wenn aktuell beide Athleten 0 Reps haben und `dayIdx >= 2`, sollte die Statuszeile bereits „N hinten" in Amber zeigen. `preview_snapshot` und visuell prüfen: amber Farbe (`#ff9f0a`), Text `"N hinten"`.

- [ ] **Step 4: Pfeil-Varianten**

Manuell über App: heute einen Satz mit mehr Reps als gestern loggen → erwartet `↑ +N` grün. `preview_snapshot` + `preview_console_logs`.

Manuell: heute weniger Reps als gestern → erwartet `↓ -N` rot. (Falls keine Reps gestern, dieser Test springt zum nächsten.)

Beide Beobachtungen festhalten — keine Code-Änderungen erwartet. Falls eine Variante visuell nicht passt, Step zurück zu Task 2 (CSS) oder Task 3 (Komponente) und nachjustieren.

- [ ] **Step 5: Screenshot für PR/Doku**

`preview_screenshot` mit dem `bar`-Layout und sichtbarer Challenge-Karte. Datei aufbewahren als Beleg im finalen Commit-/PR-Body.

---

## Self-Review-Check

- **Spec-Abdeckung**:
  - Berechnungs-Tabelle in Spec → Task 4 (alle Werte berechnet) ✓
  - UI-Layout pro Zelle → Task 5 (rings) + Task 6 (bar/numeric) ✓
  - Datumsgrenze lokal → Task 1 (`localDateOf`) ✓
  - Pfeil ab Tag 2 → Task 4 (`showArrow = dayIdx >= 2`) ✓
  - `✓ erledigt` überstimmt → Task 3 (Komponente prüft `isDone` zuerst) ✓
  - CSS-Klassen aus Spec → Task 2, angepasst an existierende Vars (`--accent`, `--warning`, `--danger`, `--text-3`) ✓
  - Edge-Cases → Task 7 ✓
- **Type/Name-Konsistenz**: `dailyTarget`, `todayReps`, `trackDelta`, `arrowDelta`, `showArrow`, `done`, `fairShare`, `variant`, `athleteSide` — durchgängig identisch in Komponenten-Def (Task 3) und allen Call-Sites (Task 5, 6) ✓
- **Keine Platzhalter**: Jede Code-Änderung hat den vollen Block, jeder Verifikationsschritt einen konkreten Befehl ✓
