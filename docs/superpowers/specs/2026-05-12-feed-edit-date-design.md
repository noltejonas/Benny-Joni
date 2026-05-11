# Feed-Edit: Datum bearbeiten

**Status:** Spec — bereit für Plan
**Datum:** 2026-05-12

## Ziel

Im Feed-Tab soll beim Bearbeiten eines Satzes nicht nur die Rep-Zahl, sondern auch der **Tag** des Satzes änderbar sein (`created_at`). Die Uhrzeit bleibt unverändert.

## Kontext

- Aktuell zeigt `FeedScreen` (`www/screens.jsx:609`) jeden Satz mit Reps + relativer Zeit. Edit-Klick aktiviert ein Inline-Number-Input, das nur `reps` patcht.
- Datenebene (`api.updateSet`, siehe `www/data.js:115` und `www/data.js:266`) akzeptiert bereits beliebige Patches — `created_at` kann mitgeschickt werden, keine Backend-Änderung nötig.
- Sätze gehören zu einer `challenge` mit `week_start`. Wochenstatistiken (`WeekRecap`) bauen auf der Annahme auf, dass alle Sätze einer Challenge in derselben Woche liegen.

## Entscheidungen (durch Brainstorming geklärt)

1. **Was wird editiert:** Nur der **Tag**. Uhrzeit bleibt erhalten (`neues Datum + alte Uhrzeit`).
2. **Wochen-Constraint:** Das neue Datum darf nur innerhalb der Woche der zugehörigen Challenge liegen (Mo–So aus `challenge.week_start`). Verschieben in andere Wochen ist **nicht erlaubt**, um Wochenstatistik konsistent zu halten.
3. **UI-Pattern:** **Bottom-Sheet** (analog zu `LogSheet`), ersetzt den bisherigen Inline-Reps-Edit. Eine Edit-Flow für beides.
4. **Datums-Eingabe:** Nativer `<input type="date">` mit `min`/`max`.
5. **Notiz:** Wird in diesem Schritt **nicht** editierbar gemacht.

## Architektur

### Neue Komponente: `EditSetSheet`

Liegt in `www/screens.jsx` direkt nach `LogSheet` (Zeile ~530), exportiert über `Object.assign(window, …)` am Dateiende.

**Props:**

- `set` — der zu editierende Satz (inkl. joined `challenge`)
- `onClose()` — schließt das Sheet ohne Speichern
- `onSave(patch)` — übergibt das Patch-Objekt an den Aufrufer

**Lokaler State:**

- `reps` (initial `set.reps`)
- `date` (initial `set.created_at.slice(0, 10)` — `YYYY-MM-DD`)
- `saving`

**Render:**

- Überschrift: "Satz bearbeiten", Sub: `category.emoji category.name · athlete`
- Reps-Input mit gleichen Chip-Shortcuts wie `LogSheet` (5, 10, 15, 20, 25, 30)
- Datums-Input `<input type="date" min={weekMonday} max={weekSunday}>`
- Button-Row: Abbrechen / Speichern (Default-Pattern aus `LogSheet`)

**Validation:**

- Reps > 0
- Datum innerhalb `[week_start, week_start+6]`
- Speichern-Button disabled, wenn Validierung fehlschlägt oder nichts geändert wurde

### Save-Logik

```
oldDate   = new Date(set.created_at)
newDate   = new Date(`${date}T00:00:00`)
// alte Uhrzeit beibehalten:
newDate.setHours(oldDate.getHours(), oldDate.getMinutes(),
                 oldDate.getSeconds(), oldDate.getMilliseconds())

patch = {}
if (reps !== set.reps)            patch.reps = reps
if (newDate.getTime() !== oldDate.getTime())
                                   patch.created_at = newDate.toISOString()

if (Object.keys(patch).length === 0) { onClose(); return }
onSave(patch)
```

### Änderungen an `FeedScreen`

`www/screens.jsx:609` ff.

- Entfernen: `editId`, `editVal`-State und alles, was den Inline-Reps-Edit rendert (`feed-edit`-Div, `startEdit`, `commitEdit`).
- Edit-Button-`onClick` wird zu `onEditSet?.(s)` (nur das Set, kein zweites Patch-Argument mehr).
- Reps werden immer als `feed-reps` angezeigt (kein editing-Branch).
- Das `editing`-CSS-Klassen-Toggle entfällt.

### Änderungen an `app.jsx`

`www/app.jsx`

- Neuer State: `const [editingSet, setEditingSet] = useState(null)`
- `onEditSet` (Zeile 270) wird zu `onEditSet={(s) => setEditingSet(s)}`
- Neuer `<Sheet>`-Block nach den vorhandenen Sheets (~Zeile 322):

```jsx
<Sheet open={!!editingSet} onClose={() => setEditingSet(null)}>
  <EditSetSheet
    set={editingSet}
    onClose={() => setEditingSet(null)}
    onSave={async (patch) => {
      try {
        await api.updateSet(editingSet.id, patch)
        setToast('Satz aktualisiert')
        setEditingSet(null)
        reload()
      } catch (e) { alert(e.message) }
    }} />
</Sheet>
```

- `EditSetSheet` muss in der `/* global … */`-Liste oben in `app.jsx:1` aufgenommen werden.

### Datenebene

Keine Änderung nötig. Sowohl `demoApi.updateSet` (`data.js:115`) als auch `supabaseApi.updateSet` (`data.js:266`) akzeptieren beliebige Felder im Patch-Objekt, inkl. `created_at`.

### Daten-Annahmen

- Sätze im Feed haben ein `challenge`-Feld (joined in `recentFeed`). Falls dieses fehlt (defensive coding), Sheet nicht öffnen und Toast "Challenge fehlt" — sollte in der Praxis nie passieren, aber Save würde sonst nicht validieren.
- Recap-Items (`s.kind === 'recap'`) haben keinen Edit-Button (Code zeigt `mine && !editing` — Recap-Items haben kein `athlete`-Feld in der gleichen Form). Bleibt unverändert.

## Wochen-Berechnung

Hilfsfunktion in `EditSetSheet`:

```
function weekBounds(weekStart) {
  // week_start ist 'YYYY-MM-DD' (Montag)
  const mon = new Date(weekStart + 'T00:00:00')
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toISOString().slice(0, 10)
  return { min: fmt(mon), max: fmt(sun) }
}
```

## Out of Scope (für eine spätere Iteration)

- Notiz editieren
- Verschieben in andere Wochen (würde automatische `challenge_id`-Umhängung erfordern)
- Uhrzeit editieren
- Edit-Funktion in `HistoryView`

## Testing

Manuell auf dem iPhone-Simulator/Gerät:

1. Edit-Button im Feed → Sheet öffnet, korrekte Vorbelegung.
2. Reps ändern → Speichern → Feed reloaded, neue Zahl sichtbar.
3. Tag ändern (innerhalb der Woche) → Speichern → `formatRelative` zeigt neuen Tag, Wochenrecap-Statistik konsistent.
4. Tag außerhalb der Woche → Picker blockiert auswählen (`min`/`max`).
5. Beides ändern → ein Patch-Roundtrip, beides aktualisiert.
6. Nichts ändern + Speichern → Sheet schließt ohne API-Call.
7. Abbrechen → Sheet schließt, keine Änderung.
