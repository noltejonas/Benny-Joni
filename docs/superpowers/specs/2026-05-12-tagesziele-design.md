# Tagesziele aus Wochenzielen — Design

## Ziel

Pro Person Tagesziele aus dem Wochenziel ableiten und im Home-Challenge-Card anzeigen, damit Benny und Jonas auf einen Blick sehen, ob sie auf Kurs sind. Zusätzlich ein Pfeil-Indikator, der die heutige Performance gegen den Vortag vergleicht.

## Scope

- Erweiterung des bestehenden HomeScreen-Challenge-Cards (`www/screens.jsx`).
- Pro Athleten-Zelle (`.tug-side` im `rings`-Layout und `.split-cell` im `bar`/`numeric`-Layout) zwei neue Informationselemente: Tages-Zeile und kumulative Statuszeile.
- Keine Änderungen an Datenbankschema, API oder Datenflüssen — alle Werte werden aus bereits geladenen `sets` und `challenge.target_reps` lokal berechnet.

## Berechnung

Pro Challenge und pro Athlet (Benny/Jonas):

| Wert | Formel |
|---|---|
| `fairShare` | `Math.ceil(target_reps / 2)` (bereits vorhanden) |
| `dayIndex` | Tagindex 1..7 relativ zu `challenge.week_start` (Mo=1 … So=7), geclamped |
| `dailyTarget` | `Math.ceil(fairShare / 7)` |
| `expectedByEod` | `Math.ceil(fairShare * dayIndex / 7)` |
| `personalReps` | Summe aller Reps des Athleten in dieser Challenge (bereits vorhanden als `bennyDone`/`jonasDone`) |
| `trackDelta` | `personalReps - expectedByEod` |
| `todayReps` | Summe Reps des Athleten mit lokalem Datum = heute |
| `yesterdayReps` | Summe Reps des Athleten mit lokalem Datum = gestern (0 wenn vor `week_start`) |
| `arrowDelta` | `todayReps - yesterdayReps` |

**Datumsgrenze**: lokale Mitternacht. Implementierung über `localDateOf(created_at)` Helper, der das ISO-Timestamp via `new Date(...)` parst und im lokalen Zeitformat (`YYYY-MM-DD`) zurückgibt — vergleichbar mit `PTData.isoDate(new Date())`.

## UI

Erweiterung pro Athleten-Zelle. Reihenfolge von oben nach unten:

1. **Avatar + Name** (unverändert)
2. **Reps-Zahl** dieser Person für die Woche (unverändert)
3. **NEU – Tageszeile**: `heute X / Y  ↑+N` — kleine mono-Schrift
   - `↑ +N` grün, wenn `arrowDelta > 0`
   - `↓ -N` rot, wenn `arrowDelta < 0`
   - `→ ±0` grau, wenn gleich
   - Pfeil und Delta nur ab `dayIndex >= 2` sichtbar (Tag 1 hat kein „gestern")
4. **Statuszeile** (ersetzt aktuelle „noch X" / „✓ erledigt"-Anzeige):
   - `✓ erledigt` (grün) wenn `personalReps >= fairShare` — überstimmt alles und blendet die Tageszeile aus
   - `✓ Auf Kurs` (grün) wenn `trackDelta >= 0` und Woche noch offen
   - `N hinten` (amber) wenn `trackDelta < 0`

Beide Layouts (`rings` über `.tug-foot` und `bar`/`numeric` über `.split-cell .owe`) bekommen dieselbe Tageszeile darüber eingefügt und dieselbe Statuszeile als Ersatz.

## Implementierung

### Helper-Funktionen

In `www/screens.jsx` (oben in der Datei, vor `HomeScreen`):

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

### Anwendung im Render

In `HomeScreen` innerhalb der `challenges.map(ch => {...})`-Schleife (`www/screens.jsx:125`), neben den bestehenden Berechnungen:

```js
const todayStr = localDateOf(new Date());
const yesterdayStr = localDateOf(new Date(Date.now() - 86400000));
const dayIdx = dayIndexInWeek(ch.week_start);
const dailyTarget = Math.ceil(fairShare / 7);
const expectedByEod = Math.ceil(fairShare * dayIdx / 7);

const bennyToday = repsOnLocalDate(csets, 'Benny', todayStr);
const bennyYesterday = repsOnLocalDate(csets, 'Benny', yesterdayStr);
const bennyTrackDelta = bennyDone - expectedByEod;
const bennyArrowDelta = bennyToday - bennyYesterday;

// analog für Jonas
```

### Sub-Komponente

Neue Funktion `DailyStatus({ done, fairShare, dailyTarget, todayReps, trackDelta, arrowDelta, showArrow })` in `screens.jsx`. Rendert:
- Wenn `done >= fairShare`: nur `<div class="track-status done">✓ erledigt</div>`
- Sonst:
  - `<div class="daily-line">heute X / Y {arrow}</div>` (Pfeil-Span nur wenn `showArrow`)
  - `<div class="track-status {ok|behind}">…</div>`

`showArrow` = `dayIdx >= 2`.

Wird zweimal pro Challenge gerendert (Benny, Jonas) und in beide Layout-Varianten integriert.

### CSS

In `www/styles.css`:

```css
.daily-line { font-size: 11px; color: var(--text-2); font-variant-numeric: tabular-nums; margin-top: 2px; }
.daily-line .arrow-up { color: var(--ok, #1aa260); margin-left: 6px; }
.daily-line .arrow-down { color: var(--bad, #d24545); margin-left: 6px; }
.daily-line .arrow-flat { color: var(--text-3); margin-left: 6px; }
.track-status { font-size: 12px; font-weight: 600; margin-top: 2px; }
.track-status.ok { color: var(--ok, #1aa260); }
.track-status.behind { color: var(--warn, #c98a2b); }
.track-status.done { color: var(--ok, #1aa260); }
```

Existierende `.owe` und `.tug-foot` Klassen bleiben für Layout, neue `.track-status`-Klasse fügt die Farb-Variante hinzu.

## Edge Cases

- **Tag 1 (Montag, `dayIndex === 1`)**: Kein Pfeil-Indikator anzeigen (kein Vortag innerhalb der Woche).
- **Challenge vor heute fertig**: `done >= fairShare` → nur `✓ erledigt`, keine Tageszeile.
- **Reps gestern = 0, heute = 0**: Pfeil zeigt `→ ±0` grau.
- **Sätze nach lokaler Mitternacht aber mit UTC-Timestamp gestern**: Durch `localDateOf` korrekt der heutigen lokalen Datumsgrenze zugeordnet.
- **Negative `dayIndex`** (Challenge in der Zukunft, sollte nicht vorkommen): geclamped auf 1.
- **Mehr als 7 Tage seit `week_start`** (Challenge nicht beendet): geclamped auf 7, `expectedByEod === fairShare`, Status entweder `✓ erledigt` oder `N hinten`.

## Nicht im Scope

- Änderungen am Wochen-Setup-Flow oder am Logging-Flow.
- Anpassung der Übersichtsseite (`screens.jsx:1300+`) — nur HomeScreen-Card.
- Backend/Schema-Änderungen.
- Konfigurierbarkeit des Tagesziels (z. B. „nur Werktage zählen").
- Push-Notifications zu täglichem Soll.
