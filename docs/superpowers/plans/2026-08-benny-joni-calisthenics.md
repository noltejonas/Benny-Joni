# Benny & Joni — Calisthenics Progression System

## Overview

Erweitert die Benny-Joni App um ein strukturiertes Calisthenics-Trainingssystem mit:
- 5 festen Übungen (Klimmzüge, Liegestütze, Leg Raises, HSPU, Dips) mit wöchentlich manuell gesetzten Satz-Zielen
- Einem abwechselnden Fokus-Schema (Woche 1: Klimmzüge + Dips / Woche 2: Liegestütze + Leg Raises; HSPU immer Pflicht)
- Pflichtmäßigen Wochenaufgaben: **Tom Holland Workout** (20-Min-Timer + Rundenzähler) und **Bring Sally Up** (Liegestütz-Challenge mit Fortschrittslogik)
- Integration in das bestehende `weekly_challenges` + `sets`-Datenmodell der App

Alle Steigerungen werden manuell pro Woche festgelegt. Die App trackt nur was eingetragen wird — kein Auto-Progression.

---

## Sub-Task 1 — Datenmodell: Spezial-Challenge-Typen

**Status:** [x] done

### Intent
Einige Challenges haben eigene Logging-Logik (Tom Holland: Runden + Zeit; Bring Sally Up: Prozentwert). Das bestehende `sets`-Schema (reps + note) reicht aus — es braucht aber eine Kennzeichnung auf der Category-Ebene, damit die App weiß, welchen UI-Modus sie anzeigen soll.

### Expected Outcomes
- Categories können einen `challenge_type`-Wert haben: `'standard'` | `'tom_holland'` | `'bring_sally_up'`
- Bestehende Kategorien bleiben `'standard'` (kein Breaking Change)
- Demo-Seed enthält die 5 neuen Calisthenics-Kategorien mit korrektem `challenge_type`

### Todo List
1. Supabase-Migration erstellen: `ALTER TABLE categories ADD COLUMN challenge_type text NOT NULL DEFAULT 'standard'`
2. In `www/data.js` Demo-Seed updaten: Die 5 Kategorien mit `challenge_type` eintragen
3. `loadDemo()` Back-fill: Bestehende Categories ohne `challenge_type` auf `'standard'` setzen
4. In der Supabase-API (`getCategories`) sicherstellen dass `challenge_type` im SELECT mit dabei ist

### Relevant Context
- `www/data.js` Zeilen 36–44: Demo-Seed `categories`-Array
- `www/data.js` Zeilen 32–33: Back-fill Pattern für neue Felder (Vorbild: `kind` Back-fill)
- `supabase/migrations/` — bestehende Migration als Vorlage

---

## Sub-Task 2 — Tom Holland Workout Screen

**Status:** [x] done

### Intent
Wöchentliche Pflichtaufgabe: 20 Minuten AMRAP (5 Klimmzüge, 10 Liegestütze, 15 Squats). Die Challenge braucht einen eigenen UI-Modus mit Countdown-Timer und großem Plus-Button zum Runden-Zählen. Nach Ablauf (oder manuellem Stopp) wird das Ergebnis als Set geloggt.

### Expected Outcomes
- Wenn eine Challenge vom Typ `tom_holland` eingeloggt wird, öffnet sich der `TomHollandSheet`
- Der Sheet zeigt: 20:00 Countdown, einen riesigen "+ Runde"-Button, aktuellen Rundenstand
- Nach 0:00 oder manuell "Beenden": Set wird mit `reps = vollständige_runden` und `note = "Zeit: MM:SS"` geloggt
- Wenn Timer noch läuft und Sheet geschlossen wird: Timer läuft weiter (wie Work-Timer) — beim Wiederöffnen sieht man den laufenden Stand
- Im Feed erscheint: "X Runden in 20:00" (bzw. der echten gestoppten Zeit)
- Jede Woche muss mindestens ein Tom-Holland-Set geloggt sein (Warnindikator wenn noch keins in der Woche)

### Todo List
1. `TomHollandSheet`-Komponente in `www/screens.jsx` erstellen:
   - 20:00 Countdown (localStorage-Persistenz: `pt_th_timer_start`)
   - Großer runder "+ Runde"-Button (zentriert, nimmt 60% der Fläche ein)
   - Rundenanzeige über dem Button
   - "Beenden & Loggen"-Button (immer sichtbar, nicht nur bei 0:00)
   - "Abbrechen"-Option (löscht Timer + Runden aus localStorage)
2. Beim Öffnen: Prüfen ob `pt_th_timer_start` + `pt_th_rounds` in localStorage — wenn ja, laufende Session weitermachen
3. Log-Logik: `addSet({ reps: rounds, note: Laufzeit })` auf der Tom-Holland-Challenge
4. In `HomeScreen` / `LogSheet`: Wenn `challenge_type === 'tom_holland'` → `TomHollandSheet` öffnen statt normalem `LogSheet`
5. Weekly-Pflicht-Indikator: In HomeScreen bei Tom-Holland-Challenge ein Badge/Icon wenn noch kein Set diese Woche

### Relevant Context
- `www/screens.jsx` Zeilen 891–1099: Work-Timer im `LogSheet` als Vorlage für Timer-Persistenz
- `www/screens.jsx` Zeilen 190–282: HomeScreen mit Challenge-Cards — hier der Einstiegspunkt
- `localStorage` Keys: Bereits genutzte Keys: `pt_work_timer_start` — neuen Key `pt_th_timer_start` + `pt_th_rounds` + `pt_th_challenge_id` nutzen

---

## Sub-Task 3 — Bring Sally Up Challenge Screen

**Status:** [x] done

### Intent
Wöchentliche Pflichtaufgabe: Liegestütze zum Song "Flower" (Bring Sally Up / Sally Down). Das Logging soll erfassen wie weit man gekommen ist — entweder "geschafft" (100%) oder ein Prozentwert (z.B. 67%).

### Expected Outcomes
- Wenn eine Challenge vom Typ `bring_sally_up` eingeloggt wird, öffnet sich der `BringSallySheet`
- Der Sheet zeigt: Einen großen "✅ Geschafft!"-Button und einen Schieberegler / Percent-Picker für "wie weit"
- Logging: `reps = 100` für komplett geschafft; `reps = <prozentwert>` für teilweise (1–99)
- Im Feed erscheint: "✅ Geschafft!" oder "X% — Fast!" mit passendem Emoji
- Wöchentlicher Pflicht-Indikator wie bei Tom Holland

### Todo List
1. `BringSallySheet`-Komponente in `www/screens.jsx` erstellen:
   - Großer grüner "✅ Geschafft!"-Button (sofort loggbar, setzt reps=100)
   - Darunter: "Nicht ganz..." Bereich mit Prozent-Slider (0–99) oder Quick-Chips (25%, 50%, 75%)
   - "Loggen"-Button für den Teilfortschritt
2. In `HomeScreen` / LogSheet: Wenn `challenge_type === 'bring_sally_up'` → `BringSallySheet` öffnen
3. Feed-Formatierung: In `recentFeed`-Darstellung — wenn Category `bring_sally_up` und `reps === 100`: "✅ Geschafft!"; sonst: `${reps}% erreicht`
4. Weekly-Pflicht-Indikator analog zu Tom Holland

### Relevant Context
- `www/screens.jsx` Zeilen 1343–1420: Feed-Item-Rendering — hier Feed-Display-Logik ergänzen
- `www/screens.jsx` Zeilen 190–282: HomeScreen Challenge-Cards — Einstiegspunkt
- Pattern für `reps`-basiertes Logging bereits vollständig vorhanden

---

## Sub-Task 4 — Weekly Obligatory Challenges UI

**Status:** [x] done

### Intent
Tom Holland und Bring Sally Up sind jede Woche Pflicht — unabhängig vom manuell gesetzten Satz-Ziel der anderen Übungen. Die HomeScreen soll klar kommunizieren welche Pflichtaufgaben diese Woche noch offen sind.

### Expected Outcomes
- Tom Holland und Bring Sally Up Challenges haben in der HomeScreen eine eigene visuelle Behandlung (z.B. "Pflicht"-Badge oder ein eigener Abschnitt "Diese Woche Pflicht")
- Wenn beide erledigt: grüner Haken / Celebration-Anzeige
- Wenn eine Woche endet und eine Pflichtaufgabe fehlt: Strafkonto-Logik kann greifen (optional, nutzt bestehendes Penalty-System)

### Todo List
1. In `HomeScreen`: Challenges nach `challenge_type` gruppieren:
   - "Pflicht dieser Woche" Sektion oben: zeigt Tom Holland + Bring Sally Up Cards mit speziellem Styling
   - "Trainingsübungen" Sektion darunter: die 5 regulären Calisthenics
2. Pflicht-Card-Styling: Eigener CSS-Style `.challenge-card--obligatory` mit Akzentrahmen
3. Erledigungs-Status: Badge "✅ Diese Woche erledigt" wenn min. 1 Set diese Woche geloggt wurde
4. (Optional) Penalty-Integration: `bring_sally_up` und `tom_holland` Categories können mit eigenem Target versehen werden — nutzt schon das bestehende Penalty-System

### Relevant Context
- `www/screens.jsx` HomeScreen ab Zeile 190: Challenge-Karten-Rendering mit Swiper
- `www/styles.css`: Bestehende Card-Styles für konsistentes Design
- Bestehende Penalty-Logik funktioniert auf `target_reps` — für Pflichtaufgaben einfach `target_reps = 1` setzen

---

## Sub-Task 5 — Calisthenics Kategorie-Setup + Schwerpunkt-Schema

**Status:** [x] done

### Intent
Die 5 Calisthenics-Übungen (Klimmzüge, Liegestütze, Leg Raises, HSPU, Dips) müssen als Standard-Kategorien in der App vorhanden sein. Das Schwerpunkt-Schema (Woche 1: Klimmzüge + Dips als Fokus, Woche 2: Liegestütze + Leg Raises als Fokus) soll im bestehenden `plan_slots`-Rotationssystem abgebildet werden.

### Expected Outcomes
- Die 5 Calisthenics-Kategorien sind im Demo-Seed und können über Settings verwaltet werden
- Tom Holland + Bring Sally Up sind als eigene Kategorien mit korrektem `challenge_type` vorhanden
- Im Rotations-Plan (Settings → Rotation Plan) können Woche-1/Woche-2-Slots mit Fokus-Markierung eingetragen werden
- Die "Fix week"-Karte in HomeScreen schlägt automatisch die richtigen Übungen für die aktuelle Woche vor

### Todo List
1. Demo-Seed in `www/data.js` updaten:
   ```
   Klimmzüge 🏋️  (kind: sports, challenge_type: standard)
   Liegestütze 💪 (kind: sports, challenge_type: standard)
   Leg Raises 🦵  (kind: sports, challenge_type: standard)
   HSPU 🤸        (kind: sports, challenge_type: standard)
   Dips 🔽        (kind: sports, challenge_type: standard)
   Tom Holland 🦸 (kind: sports, challenge_type: tom_holland)
   Bring Sally Up 🌸 (kind: sports, challenge_type: bring_sally_up)
   ```
2. `plan_slots` Seed-Daten: 2 Wochen-Rotation in `data.js` defaultem Store eintragen (week_index 0 und 1 mit passenden Kategorien und `growth_pct`)
3. Bestehende Demo-Kategorien (Sit-ups, Kniebeugen, Burpees) aus Default-Seed entfernen oder beibehalten — Entscheidung: beibehalten, damit bestehende Demo-Nutzer keine Daten verlieren; neue Kategorien ergänzen
4. Supabase-Migration: Seed-Script für die 7 neuen Kategorien (nur für Fresh-Setups, kein Delete von bestehenden)

### Relevant Context
- `www/data.js` Zeilen 36–61: Demo-Seed `categories` + `plan_slots`
- `www/screens.jsx` "Fix week"-Karte: nutzt `planSlots` + `rotationConfig` — bleibt unverändert
- `supabase/migrations/` — bestehende Seed-Migration als Vorlage

---

## Architektur-Überblick

```
categories (kind='sports', challenge_type)
    ├── standard       → normaler LogSheet (Sätze + Reps)
    ├── tom_holland    → TomHollandSheet (20min Timer + Runden)
    └── bring_sally_up → BringSallySheet (Geschafft / % Slider)

HomeScreen
    ├── [Pflicht] Tom Holland Card   → TomHollandSheet
    ├── [Pflicht] Bring Sally Up Card → BringSallySheet
    └── [Training] Klimmzüge / Liegestütze / Leg Raises / HSPU / Dips
            └── LogSheet (wie bisher)

Schwerpunkt-Rotation (plan_slots)
    ├── week_index 0: Klimmzüge + Dips (Fokus), Rest Pflicht
    └── week_index 1: Liegestütze + Leg Raises (Fokus), Rest Pflicht

Logging
    ├── Tom Holland: reps = Runden, note = "Zeit: MM:SS"
    └── Bring Sally Up: reps = 100 (geschafft) oder 1–99 (%)
```

---

## Offene Entscheidungen

- **Dips-Equipment:** Wenn keine Dips-Station vorhanden, kann die Kategorie deaktiviert/ausgeblendet werden — das ist über Settings bereits möglich (Kategorie löschen). Kein spezieller App-Support nötig.
- **Pflicht-Penalty:** Ob Tom Holland + Bring Sally Up ins Strafkonto fließen, ist optional. Kann über `target_reps = 1` + bestehendes Penalty-System gesteuert werden — keine neue Logik nötig.
