# Heute-Ansicht: Challenge-Übersicht über dem Swiper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine kompakte, scannbare Übersicht über dem Challenge-Swiper in der Heute-Ansicht hinzufügen — eine Zeile pro Challenge mit Progress-Bar und Prozent. Tap auf eine Zeile springt zum Slide. Erfüllte Challenges rutschen ans Ende von Swiper und Übersicht.

**Architecture:** Alle Änderungen leben in der bestehenden `HomeScreen`-Komponente in `www/screens.jsx`. Ein neues `sortedChallenges`-Array (`useMemo`) sortiert offene Challenges nach vorn, erfüllte nach hinten; sowohl Swiper als auch Übersicht rendern aus diesem Array, damit Tap-Index und Slide-Position synchron bleiben. Die existierende Scroll-Logik (`activeIdx`, `goTo`) wird wiederverwendet. CSS-Klassen werden in `www/styles.css` ergänzt. Die alten `.swiper-dots` entfallen.

**Tech Stack:** Plain React (Babel-standalone, kein Build-Step), JSX als `<script type="text/babel">` in `www/index.html`. Capacitor 8 (iOS-Wrapper). Reines CSS, keine UI-Library.

> **Codebase note — no test framework:** Dieses Projekt hat keine automatisierten Tests. Jede Task wird **manuell im Browser verifiziert** über Claude Preview MCP (`mcp__Claude_Preview__preview_*`). Server starten mit `preview_start` auf `www/`. Verifikation per `preview_snapshot`, `preview_click`, `preview_screenshot`, `preview_inspect`.

> **Worktree:** Optional. Wer Isolation möchte: `git worktree add ../terminator-ios-overview -b feat/home-challenge-overview`. Andernfalls direkt in `/Users/jonasnolte/Desktop/terminator-ios` arbeiten.

> **Spec:** `docs/superpowers/specs/2026-05-12-home-challenge-overview-design.md`

---

## File Structure

| File | Role |
|---|---|
| `www/screens.jsx` (modified) | `HomeScreen`: `sortedChallenges`-Memo, neuer Overview-Block, Swiper-Map auf sortiertes Array umstellen, `swiper-dots` entfernen |
| `www/styles.css` (modified) | Neue Klassen `.challenge-overview`, `.co-row`, `.co-emoji`, `.co-name`, `.co-bar`, `.co-bar-fill`, `.co-val`; alte `.swiper-dots*` entfernen |

Keine neuen Dateien. Keine Datenmodelländerungen. Keine neuen Dependencies.

---

## Task 1: Sortierung — erfüllte Challenges ans Ende

**Files:**
- Modify: `www/screens.jsx:81-242` (`HomeScreen`)

**Ziel:** Eine `useMemo`-Ableitung `sortedChallenges` einführen, die offene Challenges zuerst und erfüllte ans Ende stellt. Swiper rendert aus dieser Liste.

- [ ] **Step 1: Preview-Server starten und Baseline-Snapshot machen**

Run via Claude Preview MCP:
```
preview_start  → cwd: /Users/jonasnolte/Desktop/terminator-ios/www
preview_snapshot
preview_screenshot  → speichert Baseline
```
Expected: App lädt, Heute-Tab sichtbar, Swiper zeigt aktuelle Challenges, unten die existierenden `.swiper-dots`. **Notiere wie viele Challenges sichtbar sind und ob welche erfüllt sind** — das ist die Baseline.

- [ ] **Step 2: `sortedChallenges` per `useMemo` ableiten**

Öffne `www/screens.jsx`. Suche im `HomeScreen` (Funktion startet bei Zeile 81) die folgende Stelle nach den Hooks `useState` und `useEffect`, direkt **vor** dem `if (!challenges.length)` (Zeile 110):

Aktuell, Zeile 104–108:
```jsx
  const goTo = (i) => {
    const el = scrollerRef.current; if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  // Rules of Hooks: this early return must come AFTER all hooks above.
  if (!challenges.length) {
```

Füge **direkt nach** der `goTo`-Definition (vor dem Kommentar `// Rules of Hooks`) folgenden Block ein:

```jsx
  // Erfüllte Challenges (total >= target_reps) rutschen ans Ende.
  // Offene Reihenfolge bleibt erhalten — gleiche Quelle für Swiper UND Overview.
  const sortedChallenges = React.useMemo(() => {
    const totalFor = (chId) => allSets.filter(s => s.challenge_id === chId).reduce((s, x) => s + x.reps, 0);
    const open = [], done = [];
    for (const ch of challenges) {
      if (totalFor(ch.id) >= ch.target_reps) done.push(ch); else open.push(ch);
    }
    return [...open, ...done];
  }, [challenges, allSets]);
```

- [ ] **Step 3: Swiper-Map auf `sortedChallenges` umstellen**

Suche Zeile 125:
```jsx
      {challenges.map(ch => {
```

Ersetze durch:
```jsx
      {sortedChallenges.map(ch => {
```

Suche Zeile 224–231:
```jsx
      {challenges.length > 1 && (
        <div className="swiper-dots">
          {challenges.map((c, i) => (
            <button key={c.id} className={`swiper-dot ${i===activeIdx?'active':''}`}
              aria-label={`Challenge ${i+1}`} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
```

**Behalte diesen Block für jetzt unverändert** — wir entfernen ihn in Task 4. So bleibt die Navigation während der Zwischenstadien funktional.

- [ ] **Step 4: Verifikation — erfüllte Challenges sitzen hinten**

Run via Claude Preview MCP:
```
preview_eval  → window.location.reload()
preview_snapshot
```
Expected:
- Wenn alle Challenges offen: Reihenfolge unverändert
- Wenn ≥ 1 Challenge erfüllt ist: diese sitzt jetzt am ENDE des Swipers (letzter Slide). Die Dots darunter zeigen weiter `challenges.length` Punkte (Reihenfolge unsortiert) — das wird in Task 4 aufgeräumt.

Wenn aktuell keine erfüllten Challenges existieren, fake-test im DevTools: 
```
preview_eval  → 
  // Inspect: bei welcher Challenge ist total >= target? Sollte am Slide-Ende sein.
  document.querySelectorAll('.challenge-slide .display, .challenge-slide .big-number').length
```
Erwartet: gleiche Anzahl wie vor der Änderung.

- [ ] **Step 5: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): sort completed challenges to end of swiper

Derive sortedChallenges via useMemo and render the swiper from it.
Open challenges keep their input order; completed ones move to the
back so the user lands on actionable work first.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Overview-Zeilen rendern (Visual only, ohne Tap)

**Files:**
- Modify: `www/screens.jsx` (insertion above `<div className="challenge-swiper">`)
- Modify: `www/styles.css` (append new classes at end of the existing `Home challenge swiper` block, ~line 1117)

**Ziel:** Pro Challenge eine kompakte Zeile mit Emoji + Name + Progress-Bar + % über dem Swiper anzeigen. Noch keine Interaktion und kein Aktiv-Highlight — nur Sichtbarkeit.

- [ ] **Step 1: Overview-JSX in HomeScreen einfügen**

In `www/screens.jsx`, suche Zeile 123–124:
```jsx
    <div className={`layout-${layout} home-swiper-wrap`}>
      <div className="challenge-swiper" ref={scrollerRef}>
```

Ersetze durch:
```jsx
    <div className={`layout-${layout} home-swiper-wrap`}>
      {sortedChallenges.length >= 2 && (
        <div className="challenge-overview" role="list">
          {sortedChallenges.map((ch, i) => {
            const cat = catById[ch.category_id];
            const total = allSets.filter(s => s.challenge_id === ch.id).reduce((s, x) => s + x.reps, 0);
            const done = total >= ch.target_reps;
            const pct = Math.min(1, total / ch.target_reps);
            const pctInt = Math.round(pct * 100);
            return (
              <div key={ch.id} className={`co-row ${done ? 'done' : ''}`} role="listitem">
                <span className="co-emoji">{cat?.emoji}</span>
                <span className="co-name">{cat?.name}</span>
                <span className="co-bar"><span className="co-bar-fill" style={{width: `${pct*100}%`}}/></span>
                <span className="co-val mono">{done ? '✓' : `${pctInt}%`}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="challenge-swiper" ref={scrollerRef}>
```

- [ ] **Step 2: CSS für die Overview anhängen**

Öffne `www/styles.css`. Suche Zeile 1116 (das Ende der `.swiper-dot.active`-Regel):
```css
.swiper-dot.active { background:var(--accent); width:22px; border-radius:4px; }
```

Füge **direkt darunter** (also vor der leeren Zeile 1117/1118) folgende neuen Regeln ein:

```css
/* ─── Heute-Übersicht über dem Swiper ─── */
.challenge-overview {
  display: flex; flex-direction: column;
  padding: 6px 16px 14px;
  gap: 2px;
}
.co-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 38px;
  padding: 6px 8px 6px 10px;
  border-left: 2px solid transparent;
  border-radius: 4px;
  color: var(--text);
  transition: color .2s, font-weight .2s, border-color .2s, background .15s;
}
.co-row.done { color: var(--text-2); }
.co-emoji { font-size: 18px; line-height: 1; flex: 0 0 auto; }
.co-name {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14px;
}
.co-bar {
  flex: 1.4 1 auto; height: 5px;
  background: var(--border); border-radius: 3px; overflow: hidden;
  min-width: 60px; max-width: 140px;
}
.co-bar-fill {
  display: block; height: 100%;
  background: var(--accent); border-radius: 3px;
  transition: width .35s cubic-bezier(.2,.7,.2,1);
}
.co-val {
  flex: 0 0 auto; min-width: 36px;
  text-align: right;
  font-size: 12px; color: var(--text-2);
}
.co-row.done .co-val { color: var(--accent); }
```

- [ ] **Step 3: Verifikation — Zeilen sichtbar**

Run via Claude Preview MCP:
```
preview_eval  → window.location.reload()
preview_snapshot
preview_screenshot
```
Expected:
- Bei **≥ 2 Challenges**: Über dem Swiper erscheint eine vertikale Liste von Zeilen — eine pro Challenge — mit Emoji, Name, Bar und Prozent.
- Bei **1 Challenge**: Übersicht ist NICHT sichtbar (Hero-Card sitzt direkt unter dem Header).
- Erfüllte Zeile zeigt `✓` statt `%`, Text leicht gedämpft.
- Reihenfolge spiegelt den Swiper (offene oben, erfüllte unten).

Wenn aktuell nur 1 Challenge da ist, temporär per DevTools eine zweite konstruieren:
```
preview_eval  → 
  // Snapshot der Anzahl Hero-Cards — als Sanity-Check, dass der Swiper noch rendert
  document.querySelectorAll('.challenge-slide').length
```
Erwartet: gleiche Anzahl wie vor der Änderung.

- [ ] **Step 4: CSS-Inspect — Bar-Fill stimmt mit %**

Run:
```
preview_inspect  → selector: ".challenge-overview .co-row:first-child .co-bar-fill"  → properties: ["width"]
preview_snapshot  → liest den Text der gleichen Zeile
```
Expected: Die `width` in Pixeln entspricht plausibel dem Prozentwert aus dem Snapshot (z. B. `73%` → Bar-Fill ist ~73 % der Bar-Breite). Eine exakte Pixel-Berechnung ist nicht nötig — nur ein Plausibilitäts-Check.

- [ ] **Step 5: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "feat(home): add at-a-glance challenge overview above swiper

One row per challenge with emoji, name, mini progress bar, and
percent (or check mark when done). Only shown when there are 2+
challenges. No interaction yet — visual layer only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Interaktion — Tap-to-Navigate + Aktiv-Highlight

**Files:**
- Modify: `www/screens.jsx` (Overview-Block aus Task 2)
- Modify: `www/styles.css` (`.co-row.active`-Regel)

**Ziel:** Die Zeile wird zu einem `<button>` (Tappable, Touch-Target ≥ 38 px). Tap ruft `goTo(i)`. Der aktive Slide-Index markiert die entsprechende Zeile als `.active`.

- [ ] **Step 1: Zeile als Button rendern + onClick verdrahten**

In `www/screens.jsx` der Overview-Block aus Task 2. Ersetze den `<div key={ch.id} ...>` Block:

Aktuell:
```jsx
              <div key={ch.id} className={`co-row ${done ? 'done' : ''}`} role="listitem">
                <span className="co-emoji">{cat?.emoji}</span>
                <span className="co-name">{cat?.name}</span>
                <span className="co-bar"><span className="co-bar-fill" style={{width: `${pct*100}%`}}/></span>
                <span className="co-val mono">{done ? '✓' : `${pctInt}%`}</span>
              </div>
```

Ersetze durch:
```jsx
              <button
                key={ch.id}
                type="button"
                className={`co-row ${done ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Zu ${cat?.name} springen, ${done ? 'erfüllt' : pctInt + ' Prozent'}`}>
                <span className="co-emoji">{cat?.emoji}</span>
                <span className="co-name">{cat?.name}</span>
                <span className="co-bar"><span className="co-bar-fill" style={{width: `${pct*100}%`}}/></span>
                <span className="co-val mono">{done ? '✓' : `${pctInt}%`}</span>
              </button>
```

Zusätzlich: Da `co-row` jetzt ein `<button>` ist, muss das CSS Button-Defaults überschreiben (Hintergrund, Border, Cursor, Text-Align). In Step 2 unten ergänzt.

Den `role="list"` am Container kannst du entfernen — er ist nicht mehr semantisch korrekt. Suche im Overview-Block:
```jsx
        <div className="challenge-overview" role="list">
```
Ersetze durch:
```jsx
        <div className="challenge-overview">
```

- [ ] **Step 2: CSS für Button-Defaults und Aktiv-State**

Öffne `www/styles.css`. Suche die in Task 2 hinzugefügte Regel:

```css
.co-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 38px;
  padding: 6px 8px 6px 10px;
  border-left: 2px solid transparent;
  border-radius: 4px;
  color: var(--text);
  transition: color .2s, font-weight .2s, border-color .2s, background .15s;
}
```

Ersetze durch (Button-Resets ergänzt):

```css
.co-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 38px;
  padding: 6px 8px 6px 10px;
  border: none; border-left: 2px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color .2s, font-weight .2s, border-color .2s, background .15s;
}
.co-row:active { background: var(--surface-2); }
.co-row.active { font-weight: 700; border-left-color: var(--accent); }
```

- [ ] **Step 3: Verifikation — Tap navigiert + aktive Zeile ist markiert**

Run via Claude Preview MCP:
```
preview_eval  → window.location.reload()
preview_snapshot
preview_screenshot  → "before tap"
```
Notiere welche Zeile als `active` markiert ist (sollte die erste sein, `activeIdx=0`).

Dann Tap auf die zweite Zeile testen:
```
preview_click  → selector: ".challenge-overview .co-row:nth-child(2)"
preview_eval  → 
  // kurz warten, scroll smooth braucht ~300 ms
  new Promise(r => setTimeout(r, 500))
preview_snapshot
preview_screenshot  → "after tap"
```

Expected:
- Der Swiper scrollt smooth zum zweiten Slide.
- Im Snapshot ist die **zweite Zeile** der Overview als aktiv markiert (fettere Schrift + Akzent-Balken links). Die erste ist nicht mehr aktiv.

Optional zur Bestätigung des Aktiv-Highlights:
```
preview_inspect  → selector: ".challenge-overview .co-row.active"  → properties: ["font-weight", "border-left-color"]
```
Expected: `font-weight: 700`, `border-left-color` ist die Akzentfarbe (CSS-Variable aufgelöst).

- [ ] **Step 4: Verifikation — manuelles Swipen markiert Zeile aktiv**

Run:
```
preview_eval  → 
  const sw = document.querySelector('.challenge-swiper');
  sw.scrollTo({left: sw.clientWidth * 2, behavior: 'smooth'});
  new Promise(r => setTimeout(r, 600))
preview_snapshot
```
Expected: Die **dritte Zeile** ist jetzt aktiv (sofern 3+ Challenges existieren). Damit ist bewiesen, dass `activeIdx` aus dem Scroll-Listener weiterhin korrekt durch das CSS spiegelt.

- [ ] **Step 5: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "feat(home): make challenge overview rows tappable

Each row is a button that smooth-scrolls the swiper to the matching
slide. The row tied to the currently visible slide is highlighted
with bolder weight and an accent left border.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Alte `.swiper-dots` entfernen

**Files:**
- Modify: `www/screens.jsx:224-231` (remove JSX block)
- Modify: `www/styles.css:1114-1116` (remove three CSS rules)

**Ziel:** Die `swiper-dots` werden ersatzlos entfernt — die neue Übersicht macht denselben Job. Damit sparen wir vertikalen Platz und vermeiden doppelte Navigation.

- [ ] **Step 1: JSX-Block entfernen**

In `www/screens.jsx`, suche den Block (Zeile 224–231 nach den vorigen Tasks; Zeilennummern können leicht abweichen):

```jsx
      {challenges.length > 1 && (
        <div className="swiper-dots">
          {challenges.map((c, i) => (
            <button key={c.id} className={`swiper-dot ${i===activeIdx?'active':''}`}
              aria-label={`Challenge ${i+1}`} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
```

**Lösche diesen kompletten Block.**

- [ ] **Step 2: CSS-Regeln entfernen**

In `www/styles.css`, suche die drei Zeilen 1114–1116:

```css
.swiper-dots { display:flex; justify-content:center; gap:7px; padding: 12px 0 4px; }
.swiper-dot { width:7px; height:7px; border-radius:50%; border:none; background:var(--border); padding:0; cursor:pointer; transition:all 0.25s ease; }
.swiper-dot.active { background:var(--accent); width:22px; border-radius:4px; }
```

**Lösche diese drei Zeilen.**

- [ ] **Step 3: Verifikation — Dots sind weg, Overview übernimmt**

Run via Claude Preview MCP:
```
preview_eval  → window.location.reload()
preview_snapshot
preview_screenshot
```
Expected:
- Über dem Swiper: Overview-Zeilen (wie in Task 2/3)
- Unter dem Swiper: KEINE Dots mehr
- Im DOM: `document.querySelectorAll('.swiper-dot').length === 0`
- Navigation funktioniert weiterhin: Tap auf Overview-Zeile scrollt den Swiper.

Sanity-Check:
```
preview_eval  → document.querySelectorAll('.swiper-dot, .swiper-dots').length
```
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "refactor(home): remove redundant swiper-dots

The overview row above the swiper now serves as both progress
indicator and navigation, so the dots are duplicate UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: End-to-End Verifikation aller Edge Cases

**Files:** (keine Code-Änderungen — nur falls Bugs gefunden werden)

**Ziel:** Alle im Spec aufgeführten Szenarien einmal durchspielen. Bei Bugs zurück zur passenden Task gehen.

- [ ] **Step 1: Szenario "1 Challenge"**

Setup: Achte darauf, dass nur eine Challenge in `currentChallenges` ist (z. B. via App-State oder DB-Override für Test).

Run:
```
preview_eval  → window.location.reload()
preview_snapshot
```
Expected:
- `.challenge-overview` ist NICHT im DOM (`document.querySelector('.challenge-overview') === null`)
- Hero-Card sitzt direkt unter dem Header
- Kein `.swiper-dots`-Element

- [ ] **Step 2: Szenario "2+ Challenges, alle offen"**

Setup: 2+ Challenges, keine erfüllt.

Run:
```
preview_snapshot
```
Expected:
- Overview zeigt alle Challenges in der Eingangsreihenfolge
- Alle Zeilen haben einen `%`-Wert (kein ✓)
- Erste Zeile ist als `active` markiert

- [ ] **Step 3: Szenario "Mix offen + erfüllt"**

Setup: ≥ 2 Challenges, mindestens eine ist erfüllt.

Run:
```
preview_snapshot
```
Expected:
- Offene Challenges sitzen OBEN in der Overview UND vorne im Swiper.
- Erfüllte sitzen UNTEN in der Overview UND als letzte Slides.
- Erfüllte Zeile: `✓` (grün/Akzent), gedämpfte Schrift.

- [ ] **Step 4: Szenario "Live-Erfüllung mit Celebration"**

Setup: Eine Challenge fast erfüllt (z. B. 280/300). User navigiert zu ihrem Slide.

Run:
```
preview_click  → selector: button containing text "+ Satz für ... loggen"  (oder Quick-Log auf den fehlenden Rest)
// loggen, sodass total >= target_reps wird
preview_eval  → new Promise(r => setTimeout(r, 200))
preview_snapshot  → während Celebration-Overlay läuft
preview_eval  → new Promise(r => setTimeout(r, 5500))  // Celebration ist 5s lang
preview_snapshot  → nach Celebration
preview_screenshot
```
Expected:
- Während Celebration: Overlay sichtbar, Swiper im Hintergrund verdeckt
- Nach Celebration: User landet auf der nächsten OFFENEN Challenge (weil die gerade erfüllte ans Ende rutscht und `scrollLeft` jetzt den ersten offenen Slide zeigt)
- In der Overview: die gerade erfüllte Challenge ist unten mit ✓ sichtbar
- Aktive Zeile ist die jetzt sichtbare (offene) Challenge

- [ ] **Step 5: Szenario "Alle erfüllt"**

Setup: Alle Challenges erfüllt.

Run:
```
preview_snapshot
preview_screenshot
```
Expected:
- Alle Overview-Zeilen mit ✓
- Reihenfolge stabil (Eingangsreihenfolge, da alle im `done`-Bucket landen und ihre interne Reihenfolge behalten)
- Aktive Zeile ist die mit `activeIdx`

- [ ] **Step 6: Szenario "Langer Kategorie-Name"**

Setup: Eine Challenge mit langem Namen (z. B. temporär in DB oder via DevTools: Edit-Sheet öffnen und Kategorie umbenennen).

Run:
```
preview_snapshot
preview_inspect  → selector: ".challenge-overview .co-row:nth-child(N) .co-name"  → properties: ["text-overflow", "white-space", "overflow"]
preview_screenshot
```
Expected:
- Lange Namen werden mit `…` abgeschnitten (`text-overflow: ellipsis`)
- Bar und % bleiben rechtsbündig sichtbar, kein Wrap auf eine zweite Zeile
- `min-height` der Zeile bleibt bei ~38 px

- [ ] **Step 7: Final Screenshot + Cleanup**

Run:
```
preview_screenshot  → finaler Beweis für PR/Review
preview_stop
```

Wenn alle Szenarien grün:
```bash
git log --oneline -5  # sanity check: vier saubere Commits aus Task 1-4
```

Wenn ein Szenario rot ist, gehe zur entsprechenden Task zurück und behebe das Issue. Erst dann diese Verifikations-Task als grün abhaken.

---

## Self-Review-Notiz

Vor Übergabe an die Implementierung selbst geprüft:
- **Spec-Coverage:** alle 6 Sektionen der Spec sind in Tasks abgebildet (Sortierung → Task 1, Layout → Task 2, Inhalt pro Zeile → Task 2, Interaktion + Aktiv-State → Task 3, `swiper-dots` raus → Task 4, Edge Cases → Task 5). ✓
- **Keine Platzhalter:** jede Step enthält den exakten Code-Block oder Befehl. ✓
- **Type-Konsistenz:** Klassennamen (`co-row`, `co-bar`, `co-bar-fill`, `co-val`, `co-name`, `co-emoji`, `challenge-overview`, `done`, `active`) sind in allen Tasks identisch. ✓
- **Reihenfolge:** Task 1 (Sortierung) muss vor Task 2 (Overview) laufen, weil die Overview aus `sortedChallenges` rendert. Task 4 (Dots raus) bewusst zuletzt, damit zwischendurch keine Navigations-Lücke entsteht. ✓
