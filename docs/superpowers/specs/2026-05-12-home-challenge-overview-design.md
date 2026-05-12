# Heute-Ansicht: Challenge-Übersicht über dem Swiper

**Datum:** 2026-05-12
**Scope:** `www/screens.jsx` (`HomeScreen`), `www/styles.css`
**Größe:** klein — UI-Addition + leichte State-Ableitung, keine Datenmodelländerungen

## Problem / Motivation

Die Heute-Ansicht zeigt aktuell ausschließlich einen horizontalen Swiper mit einer Hero-Card pro Challenge der laufenden Woche. Wenn man mehrere Challenges gleichzeitig laufen hat, muss man durchswipen, um den Stand jeder einzelnen zu sehen. Unter dem Swiper sitzen lediglich `swiper-dots` als Navigations- und Positions-Indikator — sie zeigen weder Fortschritt noch welche Challenge gerade in welchem Zustand ist.

Wir wollen eine kompakte, scannbare Übersicht **oberhalb** des Swipers, die für jede Challenge auf einen Blick erkennen lässt, wie weit das Wochenziel erfüllt ist. Zusätzlich sollen erfüllte Challenges im Swiper an das Ende rutschen, weil dort nichts mehr zu tracken ist.

## Ziel

Auf den ersten Blick (ohne Swipen) sehen:
- Welche Challenges laufen diese Woche
- Wie weit jede einzelne erfüllt ist (%)
- Welche bereits geschafft sind
- Antippen einer Zeile springt direkt zum entsprechenden Slide

## Out of Scope

- Änderungen an der Hero-Card-Darstellung selbst
- Änderungen an `HistoryScreen` oder `FeedScreen`
- Persistierte Reihenfolge oder benutzerdefinierte Sortierung
- Animation der Re-Sortierung (Items "schieben sich nach hinten")

## Design

### Layout & Position

- Die Übersicht sitzt **innerhalb von `HomeScreen`**, oberhalb von `<div className="challenge-swiper">`, im selben `home-swiper-wrap`-Container.
- Stil: nackte Zeilen, kein Card-Rahmen, direkt auf App-Hintergrund. Vertikales Padding sorgt für Atemraum zur Hero-Card.
- Die Übersicht wird **nur gerendert, wenn `challenges.length >= 2`**. Bei einer einzigen Challenge wäre sie redundant zur Hero-Card.
- Die existierenden **`.swiper-dots` entfallen vollständig** — die Übersicht übernimmt deren Job inklusive Navigation und Aktiv-Anzeige.

### Inhalt pro Zeile

Eine Zeile pro Challenge, von links nach rechts:

1. **Emoji** der Kategorie (`cat.emoji`)
2. **Kategorie-Name** (`cat.name`), eine Zeile, `text-overflow: ellipsis` bei langen Namen
3. **Dünner Progress-Bar** (4–6 px hoch), füllt den verfügbaren Raum dazwischen aus
4. **Wert rechts**, monospaced:
   - Offen: `73%`
   - Erfüllt: grünes `✓` (Akzentfarbe)

Beispiel:
```
🏋️  Klimmzüge      ━━━━━━━━━━━━━━━░░░░░  73%
🦵  Squats         ━━━━━━░░░░░░░░░░░░░░  31%
🏃  Sprints        ━━━━━━━━━━━━━━━━━━━━  ✓
```

### Visueller Zustand pro Zeile

- **Inaktiv (offen):** Standard-Schriftfarbe (`var(--text)`), Bar-Fill in Akzentfarbe
- **Aktiv (gerade sichtbarer Slide):** fettere Schrift + 2 px farbiger Akzent-Balken am linken Rand
- **Erfüllt (`done`):** Text in `var(--text-2)` (gedämpft), Bar zu 100 % in Akzentgrün, `✓` statt `%`. Aktiv-Highlight ist mit `done` kombinierbar (z. B. wenn man auf einer erfüllten Challenge stehen bleibt)

### Sortierung

- Aus den Props `challenges` wird via `useMemo` ein `sortedChallenges`-Array berechnet:
  - Erst alle **offenen** Challenges (`total < target_reps`), in der bisherigen Eingangsreihenfolge
  - Dann alle **erfüllten** (`total >= target_reps`), ebenfalls in Eingangsreihenfolge
- `sortedChallenges` ist die einzige Quelle für **beide** Render-Pfade (Übersicht UND Swiper). Damit stimmen Tap-Index und Slide-Position immer überein.

### Interaktion

- Tap auf eine Zeile → ruft das existierende `goTo(i)` mit dem Zeilen-Index → smooth horizontal scroll zum entsprechenden Slide.
- `activeIdx` (existiert bereits) bestimmt, welche Zeile als aktiv markiert ist.
- Die ganze Zeile ist klickbar (`<button>` oder `<div role="button">`). Touch-Target mindestens 44 px hoch (iOS-Konvention) — also Zeilen mit `min-height: 44px` und vertikalem Padding.

### Re-Sortierung bei Zielerreichung

Der Ablauf, wenn der Nutzer den finalen Rep loggt:

1. `allSets` ändert sich → React re-rendert → `useMemo` rechnet `sortedChallenges` neu → die gerade erfüllte Challenge rutscht ans Ende.
2. Gleichzeitig setzt `useCelebration` `pendingCelebration` und blendet die **`CelebrationOverlay`** ein — vollflächiges Overlay, das den Swiper visuell verdeckt.
3. Hinter dem Overlay läuft die Re-Sortierung des DOM ab. Die `scrollLeft`-Position bleibt unverändert (z. B. 0), zeigt jetzt aber den nächsten Slide in der neuen Reihenfolge (typischerweise die nächste *offene* Challenge).
4. Wenn der Nutzer das Overlay dismisst, sieht er den Slide an `scrollLeft`-Position — also direkt die nächste offene Challenge. Das ist **gewollt**: man landet bei dem, woran man als Nächstes arbeiten kann, nicht beim gerade abgehakten.
5. Im Hintergrund (in der Übersicht und am Ende des Swipers) ist die fertige Challenge mit ✓ sichtbar.

Wichtig: Wir machen **keine explizite Animation** für das Umsortieren. KISS — die natürliche Re-Render-Mechanik in Kombination mit dem Celebration-Overlay reicht, um das Springen unauffällig zu machen.

### Edge Cases

| Fall | Verhalten |
|---|---|
| 0 Challenges | Empty-State greift bereits — Übersicht nicht erreicht |
| 1 Challenge | Übersicht & Dots beide unsichtbar |
| 2+ Challenges, alle offen | Übersicht zeigt alle in Eingangsreihenfolge |
| 2+ Challenges, alle erfüllt | Übersicht zeigt alle mit ✓ in Eingangsreihenfolge |
| 2+ Challenges, Mix | Offene oben, erfüllte unten |
| Lange Kategorie-Namen | Truncation per Ellipsis in der Name-Spalte |
| Wenn `activeIdx` größer ist als `sortedChallenges.length` (z. B. nach plötzlichem Reload) | Beim Initialisieren clamp via existierender Scroll-Logik; sollte in der Praxis nicht passieren weil `activeIdx` aus Scroll-Position derived ist |

## Implementierung — Skizze

### `HomeScreen` in `www/screens.jsx`

- Direkt nach `catById` und vor `celebration`: `sortedChallenges` per `useMemo` ableiten — Abhängigkeit: `challenges` und `allSets` (für total/target Vergleich).
- Im JSX nach `home-swiper-wrap` direkt unter dem Layout-Wrapper, vor `challenge-swiper`: neuer Block `<div className="challenge-overview">` mit Map über `sortedChallenges`. Wird konditional gerendert nur wenn `sortedChallenges.length >= 2`.
- Der bestehende `challenges.map` im Swiper wird auf `sortedChallenges.map` umgestellt.
- Die existierenden `swiper-dots` (Zeile 224–231) werden entfernt.
- Die existierende Scroll-Logik (Listener, `activeIdx`, `goTo`) bleibt unverändert; sie arbeitet weiterhin auf Basis von DOM-Index, der jetzt durch `sortedChallenges.length` bestimmt wird.

### `www/styles.css`

Neue Klassen-Familie unter dem `Home challenge swiper`-Abschnitt:

```css
.challenge-overview { display:flex; flex-direction:column; padding: 4px 16px 14px; gap: 2px; }
.co-row { display:flex; align-items:center; gap:10px; min-height:44px; padding: 6px 0 6px 10px;
          background:none; border:none; cursor:pointer; color:var(--text); text-align:left;
          border-left: 2px solid transparent; transition: color .2s, font-weight .2s, border-color .2s; }
.co-row.active { font-weight: 700; border-left-color: var(--accent); }
.co-row.done   { color: var(--text-2); }
.co-emoji { font-size:18px; line-height:1; flex:0 0 auto; }
.co-name  { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
.co-bar   { flex: 1.4 1 auto; height:5px; background:var(--border); border-radius:3px; overflow:hidden;
            min-width: 60px; max-width: 140px; }
.co-bar-fill { height:100%; background:var(--accent); border-radius:3px;
               transition: width .35s cubic-bezier(.2,.7,.2,1); }
.co-val   { flex:0 0 auto; font-size:12px; font-family: var(--font-mono); color:var(--text-2); min-width: 36px; text-align: right; }
.co-row.done .co-val { color: var(--accent); }
```

(Exakte Tokens & Farbnamen werden an die bestehenden CSS-Variablen angepasst — `--accent`, `--text`, `--text-2`, `--border` existieren bereits im Projekt.)

### Was entfernt wird

- Der gesamte `swiper-dots`-Block im JSX (Zeile 224–231 von `screens.jsx`)
- Die CSS-Regeln `.swiper-dots`, `.swiper-dot`, `.swiper-dot.active` in `styles.css` (Zeile 1114–1116)

## Testing / Verifikation

Manuelles Testen via Preview-Server in mehreren Konfigurationen:

1. **1 Challenge:** Übersicht erscheint NICHT, Hero-Card sitzt allein
2. **2 Challenges, beide offen:** Übersicht zeigt 2 Zeilen, Tap auf zweite springt zum zweiten Slide, aktive Zeile ist markiert
3. **3 Challenges, eine erfüllt:** erfüllte Zeile sitzt unten mit ✓, im Swiper ebenfalls als letzter Slide
4. **Alle erfüllt:** alle Zeilen mit ✓, Sortierung stabil
5. **Live-Erfüllung:** Auf einer Challenge stehen, durch `+ Satz loggen` über Target heben → Celebration läuft, Slide bleibt; nach `reload()` ist die Challenge in der Übersicht und im Swiper am Ende
6. **Langer Name:** Eine Challenge mit langer Kategorie ("Wadenmuskel-Sprünge mit Zusatzgewicht") → Truncation greift

Verifizieren via:
- `preview_snapshot` für Struktur & Inhalt
- `preview_click` für Tap-Navigation
- `preview_screenshot` als Beweis am Ende
- DevTools / `preview_inspect` für CSS-Werte (Höhe, Padding, Farben)

## Offene Fragen

Keine — alle wesentlichen Punkte sind im Verlauf des Brainstormings geklärt worden.
