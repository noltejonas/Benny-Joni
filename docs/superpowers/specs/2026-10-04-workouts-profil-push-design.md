# Pflicht-Workouts, Verlauf „All“, Profilbild, Push — Design

Stand 2026-10-04. Ein gemeinsamer TestFlight-Build 1.4 (11) mit vier Korrekturen nach dem Multi-User-Rollout.

## Ausgangslage

- **Verlauf „All“** (`HistoryView` in `www/screens.jsx`) startet mit 30 Tagen und kappt auch „All“ auf 90 Tage. Jonas sah deshalb ~5.000 statt ~15.700 Wiederholungen und hielt Daten für verloren.
- **Bring Sally Up** (`challenge_type = 'bring_sally_up'`) speichert die gehaltenen Sekunden in `sets.reps`, **Tom Holland** (`'tom_holland'`, 20-Minuten-Workout: 5 Klimmzüge · 10 Liegestütze · 15 Squats) die geschafften Runden. Überall wird der Wert wie Wiederholungen summiert: 180 Sekunden erscheinen als „180“, fließen in „Reps gesamt“, Verlauf, Duelle, Strafkonto und die Push-Nachricht ein.
- **Profilbild:** Upload in den Storage-Bucket `avatars` ist fertig (`api.updateProfile`, `ProfileSheet` mit „Foto ändern“, Bucket und Policies aus Migration A). Der Dialog ist aber nur über das Onboarding und die Challenge-Auswahl erreichbar, nicht über die Einstellungen. In der `Info.plist` fehlen `NSCameraUsageDescription` und `NSPhotoLibraryUsageDescription`; „Foto aufnehmen“ im iOS-Dateidialog bringt die App ohne sie zum Absturz.
- **Push:** `ios/App/App/App.entitlements` (`aps-environment = production`) ist im Xcode-Projekt nicht als `CODE_SIGN_ENTITLEMENTS` eingetragen. Kein Gerät registriert sich, `device_tokens` ist leer.

## Entscheidungen

1. Bei Sally und Tom Holland zählt **jeder geloggte Versuch** als Durchgang, auch ein Sally-Versuch unter 3:24.
2. Ansatz: **Auswertung nach Übungstyp in der App, Datenbank unverändert.** Ein Eintrag = ein Durchgang, `reps` bleibt der Wert des Durchgangs (Sekunden bzw. Runden). Keine neuen Spalten, kein Datenumzug; bestehende Einträge passen automatisch.

## 1. Verlauf „All“

- „All“ beginnt beim ersten Satz der gefilterten Menge, ohne 90-Tage-Grenze.
- Summen, Kennzahlen und Ranglisten im Verlauf gelten für den gewählten Zeitraum, bei „All“ also für alles.
- Das Diagramm zeigt den ganzen Zeitraum tageweise (Standard ist „Kumuliert“, also eine glatte Kurve). Bei vielen Wochen werden KW-Linien und -Beschriftungen ausgedünnt (höchstens ~13 im kleinen, ~12 im Vollbild-Diagramm).
- Die Voreinstellung bleibt 30T.

## 2. Pflicht-Workouts (Bring Sally Up, Tom Holland)

Gemeinsame Helfer in `www/data.js` (exportiert über `PTData`), damit alle Stellen gleich rechnen:

- `isWorkoutType(type)` — `true` für `bring_sally_up` und `tom_holland`.
- `annotateWorkouts(sets, challenges, categories)` — setzt beim Laden `workout` (Typ oder `null`) auf Sätzen und Wochen-Challenges.
- `setValue(set)` — Wert für Wiederholungs-/Minuten-Summen; Workout-Sätze liefern 0. `valOfSet` in `people.jsx` (Standard von `totalsBySide`) nutzt ihn.
- `workoutValueLabel(type, value)` — Sally `m:ss` (ab 204 s mit „✓“), Tom Holland `N Runden`.
- `workoutSummary(type, sets)` — „2× · 3:00, 3:24 ✓“, älteste zuerst.
- `workoutPeopleDone(sets, userIds)` — wie viele der Personen mindestens einen Durchgang haben.

Verhalten:

- **Anzeige** (Home, Wochenkarte, Feed, Verlauf der Woche): „2× · 3:00, 3:24 ✓“ bzw. „1× · 8 Runden“; Fortschritt pro Person „1/1 ✓“ oder „0/1“.
- **Wochenziel:** pro Person mindestens 1 Durchgang, unabhängig von `target_reps` und der Teilnehmerzahl.
- **Summen:** Workouts zählen nicht in Wiederholungs-Summen („Reps gesamt“, Verlauf, Duelle, Tauziehen, Rekorde „in einem Satz“/„an einem Tag“). Unter Statistik → „Ich“ eine eigene Zeile „Workouts“ mit Durchgängen je Workout und Bestwert (längste Sally-Zeit, meiste Runden).
- **Wochensieg/Rangliste einer Workout-Challenge:** kein Sieger; jede Person hat das Ziel erreicht oder nicht.
- **Strafkonto** (`computePenalties`): für Workout-Challenges `reps` = Anzahl Durchgänge, Anteil = 1. In `per_week_aggregate` werden Workout-Challenges nicht mit Wiederholungen verrechnet: Die Woche ist verfehlt, wenn die Wiederholungs-Summe unter dem Anteil liegt **oder** ein Workout ohne Durchgang ist.
- **Push-Text** „Schon X Reps heute“: Die DB-Funktion `user_reps_today` zählt Sätze von Workout-Kategorien nicht mit. Neue Migration `supabase/migrations/20261004000000_workout_reps_today.sql` (`create or replace`, Grants bleiben erhalten; Sätze ohne Kategorie zählen weiter mit).
- **Bestehende Daten:** bleiben unverändert; Jonas' 4 Sally- und 2 Tom-Holland-Einträge werden zu 4 bzw. 2 Durchgängen.

## 3. Profilbild

- Oben im Einstellungen-Tab eine Profil-Karte: Bild, Name, Button „Profil bearbeiten“ → öffnet den bestehenden `ProfileSheet` (Name, Farbe, „Foto ändern“).
- `Info.plist`: `NSPhotoLibraryUsageDescription` und `NSCameraUsageDescription` mit deutschem Text (Profilbild aufnehmen bzw. auswählen).

## 4. Push

- `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` für Debug und Release des App-Targets.
- Signieren läuft über fastlane mit `-allowProvisioningUpdates` und dem ASC-API-Key; Xcode aktiviert die Push-Capability der App-ID und erzeugt ein passendes Profil.
- Prüfen (Befehl führt der Nutzer aus): `supabase secrets list` muss `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`, `APNS_PRIVATE_KEY` und das Webhook-Secret zeigen. Fehlen sie, gilt `docs/PUSH_SETUP_MORNING.md` (APNs-Key anlegen, Secrets setzen).
- Erfolg = nach Installation von 1.4 (11) erscheint pro Gerät eine Zeile in `device_tokens`, und ein Satz von Benny löst bei Jonas eine Benachrichtigung aus.

## Auslieferung

1. Code-Änderungen in `www/` und `ios/`, Migration-Datei für `user_reps_today`.
2. Lokal im Browser-Demo-Modus (`?demo`) prüfen.
3. Migration `user_reps_today` einspielen (Nutzer führt den Befehl aus) — unabhängig vom Build.
4. `bundle exec fastlane beta` → 1.4 (11) in TestFlight.
5. Push-Secrets prüfen, Push Ende-zu-Ende testen.

## Tests

- Demo-Modus: Verlauf „All“ zeigt die Summe aller Demo-Sätze; Sally/Tom Holland loggen → Anzeige als Durchgänge mit Zeit/Runden, Ziel „1/1 ✓“, keine Erhöhung von „Reps gesamt“; Strafkonto-Vorschau einer Woche ohne Workout-Durchgang zeigt die Strafe; Profil-Karte öffnet den Dialog.
- Rechenhelfer: Node-Tests (`node --test tests/`) für die Workout-Helfer und `computePenalties` mit Standard- und Workout-Challenges.
- iOS: Build läuft durch; signierte App enthält `aps-environment`.

## Nicht im Umfang

- Keine neuen Datenbank-Spalten, kein Umbau bestehender Einträge.
- Kein Bildzuschnitt-Editor fürs Profilbild.
- Keine Rangliste für Workout-Bestwerte über das „Ich“-Profil hinaus.
