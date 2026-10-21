# Onboarding neu aufgebaut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue Person kommt ohne Hilfe in unter zwei Minuten vom ersten Start zum ersten geloggten Satz. Eingeladene landen direkt in der richtigen Challenge. Push wird mit Begründung im richtigen Moment gefragt, und kein Bildschirm ist für Neue leer oder rätselhaft.

**Architecture:** Welcher Schritt dran ist, entscheidet `PTOnboarding` (`www/onboarding-model.js`, ohne React, mit `node:test` getestet) aus Profil, Mitgliedschaften, Wochenzielen und Sätzen. `App` (`www/app.jsx`) rendert davor die Vollbild-Schritte aus `www/onboarding.jsx`. In der Challenge legt `CompetitionApp` die Ebenen aus `www/onboarding-intro.jsx` über Home. Einladungslinks kommen über `@capacitor/app` (nativ) bzw. `?join=` (Web) als `pt:invite` herein.

**Tech Stack:** React 18 (UMD + Babel standalone), Supabase JS 2.45.4, Capacitor 8 (iOS, neu `@capacitor/app`), Node `node:test`.

Spec: `docs/superpowers/specs/2026-10-20-onboarding-design.md`. Alle Pfade relativ zum Worktree `/Users/jonasnolte/Developer/Benny-Joni/.claude/worktrees/terminator-onboarding-rebuild-ef1ac2`.

## Dateien

| Datei | Änderung |
|---|---|
| `www/onboarding-model.js` (neu) | Reine Regeln: Codes, Einstieg, Startkarte, Ziel, Push, Woche 1 |
| `tests/onboarding.test.cjs` (neu) | Tests für Modell und Fehlertexte |
| `www/data.js` | `signUp`-Ergebnis, `resendSignup`, `friendlyError` (Codes, Netz, Export), `saveOnboarding` |
| `supabase/migrations/20261020000000_profile_onboarding.sql` (neu) | `profiles.onboarding jsonb` + Update-Recht (nicht anwenden) |
| `www/demo.js` | Konten, neue Person, Beitritts-Simulation, Woche vorspulen, Bestätigung, Data-URL-Avatar |
| `www/onboarding.css` (neu) | `.ob-*` |
| `www/onboarding.jsx` (neu) | Willkommen, Auth, Profil, Start, Erstellen, Beitreten |
| `www/onboarding-intro.jsx` (neu) | Einladen, Wochenziel, Erster Satz, Feier, Push-Vorab, Woche 1, Startkarte, `PTPush`, `PTHaptics` |
| `www/competitions.jsx` | Alte Auth/Onboarding/Erstellen/Beitreten raus, `shareInvite` neu |
| `www/app.jsx` | Einstieg, Einladungen, Ebenen, Push, Mitglieder-Toast, Offline |
| `www/screens.jsx`, `www/feed.jsx`, `www/stats-global.jsx`, `www/strafkonto.jsx`, `www/settings.jsx` | Tipp, leere Zustände, Push-Schalter, Demo-Gruppe |
| `www/index.html` | Skripte, CSS, `@capacitor/app` |
| `www/sounds/first-log.wav` (neu), `tools/make-sounds.cjs` (neu) | Ton zum ersten Satz |
| `ios/App/App/Info.plist`, `package.json`, `package-lock.json`, `ios/App/CapApp-SPM/Package.swift` | URL-Schema, `@capacitor/app` |

Prüfung im Browser jeweils über `preview_start` „www (main / capacitor webDir)“, Viewport 375×812, `?demo=new` bzw. `?demo=reset`. Tests: `node --test tests/`.

---

### Task 1: Modell — Codes und Einladungslinks

**Files:** Create `www/onboarding-model.js`, `tests/onboarding.test.cjs`

- [ ] **Step 1: Tests schreiben:**
  - `normalizeCode` holt den Code aus „abc123“, aus der ganzen Einladungsnachricht und aus `projektterminator://join/ABC123`, lehnt falsche Länge und Zeichen außerhalb des Alphabets ab.
  - `parseInviteUrl` versteht `projektterminator://join/X`, `?join=X` und `#join=X`.
  - `inviteText` enthält Name, Code und Link.
- [ ] **Step 2:** `node --test tests/` → FAIL (Datei fehlt).
- [ ] **Step 3:** Implementieren (`window.PTOnboarding`, Alphabet wie `gen_invite_code`: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- [ ] **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): Modell für Einladungscodes und -links`

### Task 2: Modell — Einstieg, Neu-Erkennung, Namensvorschlag

- [ ] **Step 1: Tests:**
  - `entryRoute`: `loading`, `welcome`, `app` bei vorhandenen Challenges. Ohne Challenge: `profile`, mit offener Einladung `join`, sonst `start`.
  - `isNewcomer`: Flag `started` oder Profil jünger als 14 Tage.
  - `suggestName`: „lenn.hoffmann@x“ → „Lenn“, „max_99@x“ → „Max“, leer → „“.
  - `mergeState`: Union aus lokal und Profil.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): Einstieg aus Profil und Challenges ableiten`

### Task 3: Modell — Startkarte, Wochenziel, Push, Woche 1

- [ ] **Step 1: Tests:**
  - `expectedPeople` (1v1/2v2/ffa, nie unter der tatsächlichen Zahl).
  - `goalDefault` (Liegestütze 100, anteilig für die Restwoche, auf 5 gerundet, mindestens 10).
  - `goalTarget`.
  - `starterItems` / `showStarter` (Daten erledigen Punkte, Wegtippen, 14 Tage).
  - `pushPrimerDue` / `nextPrimerState` (nur bei `prompt`, 3/7 Tage, max. 3).
  - `weekProgress` (Tag der Woche, Resttage, `midWeek`).
  - `weekOneDue` (nur in Woche 2 der Mitgliedschaft, nicht doppelt).
  - `weekOneSummary` (Reps, aktive Tage, erfüllte Teile, Ergebnis gewonnen/verloren/solo).
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5: Commit** `feat(onboarding): Regeln für Startkarte, Wochenziel, Push und Woche 1`

---

### Task 4: Datenschicht — Registrierung und Fehlertexte

**Files:** `www/data.js`, `tests/onboarding.test.cjs`

- [ ] **Step 1: Tests** für `PTData.friendlyError`:
  - `user_already_exists` → „Für diese E-Mail gibt es schon einen Account.“
  - `email_address_invalid` → Adresse ungültig
  - `weak_password` → Passwort zu schwach
  - `over_email_send_rate_limit` → zu viele Versuche
  - `signup_disabled` → Registrierung gesperrt
  - `TypeError: Failed to fetch` und `Load failed` → „Keine Verbindung. Prüf dein Internet.“
  - Der `code` bleibt erhalten.
- [ ] **Step 2–4:** FAIL → `friendlyError` erweitern und exportieren → PASS.
- [ ] **Step 5:** `signUp` liefert `{ session, user, needsConfirm }`. `identities: []` → Fehler „schon ein Account“. Neu sind `resendSignup(email)` und `saveOnboarding(profile, state)` (schreibt nur, wenn `'onboarding' in profile`). `getSession` bleibt.
- [ ] **Step 6: Commit** `feat(auth): Registrierung ohne Entwickler-Meldung, deutsche Fehlertexte`

### Task 5: Migration `profiles.onboarding`

- [ ] **Step 1:** `supabase/migrations/20261020000000_profile_onboarding.sql`:
  - `add column if not exists onboarding jsonb not null default '{}'`
  - Größen-Check
  - `grant update (onboarding)`
  - Kommentar „nicht automatisch anwenden“
- [ ] **Step 2: Commit** `feat(db): Spalte für den Onboarding-Stand im Profil (nicht angewendet)`

### Task 6: Demo — neue Personen und Zeitreise

**Files:** `www/demo.js`

- [ ] **Step 1:** DB-Version 2:
  - Konten `{ email, user_id }`.
  - `onboarding: {}` an Profilen.
  - Seed-Profile älter als 14 Tage.
  - Bestehende v1-Daten werden ergänzt, nicht verworfen.
- [ ] **Step 2:** Session:
  - `pt_demo_user` merkt die angemeldete Person.
  - `signUp` legt eine neue Person an (Name aus `displayName`, Farbe), bei bekannter Adresse kommt ein Fehler.
  - `signIn` meldet bekannte Konten an, sonst Benny.
  - `getSession` liefert die E-Mail.
  - `?demo=new` startet abgemeldet.
  - `pt_demo_confirm = '1'` liefert beim ersten `signUp` keine Session, `signIn` bestätigt dann.
- [ ] **Step 3:** RPC-Verhalten wie Supabase:
  - `createCompetition` setzt die Haupt-Challenge.
  - `joinCompetition` gleicht Teams aus, prüft `team_full` und setzt die Haupt-Challenge.
  - `uploadAvatar` speichert eine Data-URL.
  - `resendSignup` gibt es auch hier.
- [ ] **Step 4:** `PTDemo.simulateJoin(cid)` lässt nach ~6 s eine freie Seed-Person beitreten. `PTDemo.shiftWeek()` schiebt alle Datumswerte 7 Tage zurück.
- [ ] **Step 5:** Browser-Prüfung:
  - `?demo=reset` → Benny wie bisher.
  - `?demo=new` → abgemeldet.
  - Konsole ohne Fehler.
- [ ] **Step 6: Commit** `feat(demo): neue Personen, Beitritts-Simulation und Woche vorspulen`

---

### Task 7: Bausteine und Willkommen

**Files:** Create `www/onboarding.css`, `www/onboarding.jsx`. Modify `www/index.html`, `www/app.jsx`, `www/competitions.jsx`

- [ ] **Step 1:** `index.html` lädt `onboarding.css` nach `redesign.css`, `onboarding-model.js` nach `feed-model.js` und `onboarding.jsx` vor `competitions.jsx`.
- [ ] **Step 2:** Bausteine:
  - `ObScreen` mit Kopf (Zurück, Punkte), Inhalt und Fuß (sticky, Safe Area)
  - `ObOffline`, `useOnline`, `ObCodeField` (Einfügen, Code-Extraktion)
- [ ] **Step 3:** `ObWelcome` mit Mini-Duellkarte und drei Wegen. Mit offener Einladung zeigt er den Hinweis-Chip.
- [ ] **Step 4:** Browser-Prüfung: 375 px, hell und dunkel, iPhone-SE-Höhe (667 px) ohne Scrollen.
- [ ] **Step 5: Commit** `feat(onboarding): Willkommen-Bildschirm mit Mini-Duell und drei Wegen`

### Task 8: Konto erstellen, Anmelden, Mail-Bestätigung

- [ ] **Step 1:** `ObAuth` mit `signup | login | reset | reset-code | confirm | code`:
  - Passwort-Auge, Inline-Fehler.
  - „Konto existiert“ wechselt zum Login mit vorbelegter Adresse.
  - „Check deine Mails“ mit „Ich hab bestätigt“ und „Mail nochmal senden“ (60 s).
- [ ] **Step 2:** `App`: ohne Session `ObAuthFlow` statt `AuthScreen`. `pt:returning` startet beim Login. Nach dem Registrieren wird `started` gesetzt.
- [ ] **Step 3:** Alte `AuthScreen` aus `competitions.jsx` entfernen.
- [ ] **Step 4:** Browser-Prüfung:
  - Registrieren in der Demo.
  - Bekannte Adresse → Login.
  - `pt_demo_confirm` → Mail-Bildschirm.
  - Offline → Hinweis.
- [ ] **Step 5: Commit** `feat(onboarding): Registrierung mit E-Mail und Passwort, Mail-Bestätigung`

### Task 9: Profilschritt

- [ ] **Step 1:** `ObProfile`:
  - Avatar 112 px mit „Foto wählen“ (Upload sofort, Fehlertext).
  - Name vorbelegt (`suggestName`, sonst `display_name`).
  - „Weiter“ speichert und setzt `profileDone`.
- [ ] **Step 2:** `App` routet über `entryRoute`.
- [ ] **Step 3:** Browser-Prüfung: Foto wählen in der Demo, Neuladen → Profil bleibt erledigt.
- [ ] **Step 4: Commit** `feat(onboarding): Profilschritt mit Name und Foto`

### Task 10: Start, Erstellen, Beitreten

- [ ] **Step 1:** `ObStart` (zwei Karten, Demo-Link, Avatar → Profil-Sheet).
- [ ] **Step 2:** `CreatePanel`:
  - Modus-Karten, optionaler Name mit Vorschlag, Emoji-Reihe.
  - „Extras“ mit Strafkasse, Wochenplan, Arbeitszeit, Start und Ende.
  - Läuft als Vollbild (`ObCreate`) und im Sheet (`CreateCompetitionSheet`).
- [ ] **Step 3:** `JoinPanel`:
  - Code mit Auto-Vorschau, Vorschau mit Teams, Resttage.
  - Läuft als Vollbild (`ObJoin`, „Ohne Code weiter“) und im Sheet (`JoinCompetitionSheet`).
- [ ] **Step 4:** `shareInvite` nutzt `inviteText`. In der Demo ruft es `PTDemo.simulateJoin` auf. Alte Komponenten aus `competitions.jsx` entfernen.
- [ ] **Step 5:** Browser-Prüfung:
  - Erstellen ohne Namen → „Duell“.
  - Beitreten mit RUN555 und TEAM42 (Team).
  - Voll, falscher Code, schon dabei.
- [ ] **Step 6: Commit** `feat(onboarding): Challenge starten und beitreten als eigene Schritte`

### Task 11: Einladungslinks

- [ ] **Step 1:**
  - `npm install @capacitor/app@^8`, dann `npx cap sync ios`.
  - Nur `Package.swift`, `package.json` und `package-lock.json` übernehmen; `Package.resolved` prüfen.
- [ ] **Step 2:** `Info.plist`: `CFBundleURLTypes` mit `projektterminator`. Prüfen mit `plutil -lint ios/App/App/Info.plist`.
- [ ] **Step 3:** `index.html` lädt nativ `@capacitor/app@8` als `window.PTAppPlugin`.
- [ ] **Step 4:** `App`:
  - `?join=` beim Start lesen, dazu `getLaunchUrl` und `appUrlOpen`.
  - Den Code in `pt:invite` merken und den Parameter aus der URL entfernen.
  - Angemeldet mit Challenge → Beitreten-Sheet mit Code.
  - Sonst führt `entryRoute` weiter.
- [ ] **Step 5:** Browser-Prüfung:
  - `?join=BJ4K7X` abgemeldet: Willkommen mit Einladung → Registrieren → Profil → Vorschau.
  - Angemeldet: Sheet öffnet mit Vorschau.
- [ ] **Step 6: Commit** `feat(einladung): Links projektterminator://join und ?join= öffnen die Challenge`

---

### Task 12: Ebenen in der Challenge — Einladen, Wochenziel, Erster Satz, Feier

**Files:** Create `www/onboarding-intro.jsx`, `tools/make-sounds.cjs`, `www/sounds/first-log.wav`. Modify `www/app.jsx`, `www/index.html`

- [ ] **Step 1:** `PTHaptics` (`tap`, `success`, `celebrate`) und `PTSound.play('first-log')`.
- [ ] **Step 2:** `ObInviteLayer`: Plätze live über `capi.onChange`, Code kopieren, teilen, Haptik bei Beitritt.
- [ ] **Step 3:** `ObGoalLayer`:
  - Übungen aus `getCategories` (Sport, Standard).
  - Vorschlag aus `goalDefault`.
  - Speichert `goalTarget` per `upsertChallenge`.
- [ ] **Step 4:** `ObFirstLogLayer` und `ObCelebrate` (CountUp, Ring, Konfetti, Haptik, Ton).
- [ ] **Step 5:** `CompetitionApp` bekommt eine `intro`-Queue: `created` → invite, goal, log; `joined` → goal (falls leer), log.
  - Bestehende Konten: `created` → nur invite.
  - Nach dem Beitritt erreichte Ziele als gefeiert markieren.
- [ ] **Step 6:** Ton erzeugen: `node tools/make-sounds.cjs` → `www/sounds/first-log.wav`.
- [ ] **Step 7:** Browser-Prüfung: als Ersteller alle Ebenen bis Home; Zeit messen.
- [ ] **Step 8: Commit** `feat(onboarding): Einladen, erstes Wochenziel und erster Satz mit Feier`

### Task 13: Push mit Vorab-Bildschirm

- [ ] **Step 1:** `PTPush`: `permission()` (nativ `checkPermissions`, Web `Notification.permission`, sonst `unsupported`) und `request()`.
- [ ] **Step 2:** `ObPushPrimer`. Auslöser: nach der Feier und nach weiteren Sätzen per `pushPrimerDue`. Stand in `pt:push-primer`.
- [ ] **Step 3:** `app.jsx`:
  - Automatische Abfrage (nativ und Web) entfernen.
  - Registrierung nur bei `granted`, Listener vor `register()`.
  - Neu registrieren, wenn die Erlaubnis erteilt wurde.
- [ ] **Step 4:** `settings.jsx`: Einschalten fragt direkt. Bei Ablehnung Hinweis plus „iOS-Einstellungen öffnen“ (`app-settings:`).
- [ ] **Step 5:** Browser-Prüfung: Vorab-Bildschirm nach dem ersten Satz, „Jetzt nicht“ → kein zweites Mal sofort.
- [ ] **Step 6: Commit** `feat(push): Erlaubnis erst nach Vorab-Bildschirm, nie beim ersten Tippen`

### Task 14: Home — Startkarte, Einladen-Karte, Tipp, Mitglieder

- [ ] **Step 1:** `ObStarterCard` (Punkte aus `starterItems`, Resttage bei Beitritt mitten in der Woche, ✕) und `ObInviteCard` (ersetzt das Banner).
- [ ] **Step 2:** `QuickLogRow` bekommt `coach`. Der Tipp erscheint, solange neu und noch kein eigener Satz.
- [ ] **Step 3:** Anteil mit `expectedPeople` an Home und Feed. Toast „Name ist dabei 🎉“ bei neuen Mitgliedern. Haptik beim Schnellsatz.
- [ ] **Step 4:** Browser-Prüfung: Punkte haken sich ab, ✕ hält über Neuladen, Benny sieht nichts Neues.
- [ ] **Step 5: Commit** `feat(home): Startkarte, Einladen-Karte und Tipp für den ersten Satz`

### Task 15: Leere Zustände

- [ ] **Step 1:** Feed: Aktionen „Ersten Satz loggen“ und, wenn allein, „Einladen“.
- [ ] **Step 2:** Stats: Hinweis zu Woche 1.
- [ ] **Step 3:** Strafkonto: Regelzeile mit Betrag aus `getPenaltyConfig`.
- [ ] **Step 4:** Browser-Prüfung aller drei, hell und dunkel.
- [ ] **Step 5: Commit** `feat(onboarding): leere Zustände in Feed, Stats und Strafkonto mit Weg`

### Task 16: Woche 1

- [ ] **Step 1:** `ObWeekOne` mit `weekOneSummary`, Konfetti, Ton beim Tippen und „Auf in Woche 2“ (öffnet das Ziel, falls keins steht).
- [ ] **Step 2:** Gesehen in `onboarding.weekOne[compId]`, gespeichert über `saveOnboarding` und lokal.
- [ ] **Step 3:** Demo-Gruppe in den Einstellungen: „Eine Woche vorspulen“, „Demo zurücksetzen“, „Demo beenden“.
- [ ] **Step 4:** Browser-Prüfung: vorspulen → Rückblick genau einmal.
- [ ] **Step 5: Commit** `feat(onboarding): Rückblick nach der ersten Woche`

### Task 17: Offline und Ladefehler

- [ ] **Step 1:** `App`: Ladefehler beim Start → „Keine Verbindung“, neuer Versuch bei `online`.
- [ ] **Step 2:** Schnellsatz offline → Toast „Keine Verbindung – Satz nicht gespeichert.“ statt `alert`.
- [ ] **Step 3:** Browser-Prüfung: offline.
- [ ] **Step 4: Commit** `fix(offline): verständliche Meldungen und automatischer Neustart`

---

### Task 18: Gesamtprüfung

- [ ] **Step 1:** `node --test tests/` → alle grün.
- [ ] **Step 2:** Zwei Läufe von Null, 375 px, hell und dunkel, Konsole sauber, Screenshots für den PR:
  - als Ersteller
  - als Eingeladener über `?join=`
- [ ] **Step 3:** Sonderfälle:
  - Abbruch nach Registrierung, nach Profil und nach dem Erstellen
  - zweite Challenge
  - Beitritt mitten in der Woche
  - Mail-Bestätigung
  - Woche vorspulen
  - Benny
- [ ] **Step 4:** iOS-Simulator:
  - Build und Start.
  - `xcrun simctl openurl booted projektterminator://join/BJ4K7X` mit Demo.

### Task 19: PR

- [ ] **Step 1:** Screenshots nach `docs/superpowers/assets/onboarding/` (vorher/nachher), committen.
- [ ] **Step 2:** Branch pushen und PR gegen `main` mit Vorher/Nachher pro Schritt, Entscheidungen und dem, was bewusst offen bleibt.
- [ ] **Nutzer-Schritte (nicht von Claude):**
  - Migration `20261020000000_profile_onboarding.sql` anwenden.
  - TestFlight-Upload (`bundle exec fastlane beta`).
