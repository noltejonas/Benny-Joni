# Einstellungen neu aufgebaut — Design

Stand 2026-10-20. Der Einstellungen-Tab (Avatar oben rechts) ist über mehrere Features gewachsen und wird neu strukturiert.

## Ausgangslage

- **Eine endlose Seite** (~5.400 px auf dem iPhone): Profil, Challenge-Karte (Name, Code, Module, Teilnehmer, Archivieren/Verlassen), Gerät (Erscheinungsbild, Push), dann wieder Challenge-Regeln (Strafkonto, Work-Tags, Wochenplan mit zwei Wochen × sieben großen Slot-Karten).
- **Persönliches und Challenge gemischt**, „Challenge verlassen“ steht mitten auf der Seite vor dem Erscheinungsbild.
- **Doppelte Schalter:** Modul „Strafkonto“ (`competitions.penalties_enabled`, nur Ersteller) und „Aktiv“ in der Strafkonto-Karte (`penalty_config.enabled`, alle). Genauso Modul „Rotationsplan“ und der Schalter „Wochen-Plan“ (`rotation_config.enabled`). Jemand kann das Modul anlassen und die Strafen trotzdem abschalten — der Tab bleibt, gebucht wird nichts.
- **Push-Schalter wird nicht gespeichert:** Er hängt an `useTweaks` (nur React-State, Standard `true`). Nach jedem App-Start ist Push wieder an und das Gerät registriert sich erneut.
- **Kein Abmelden** in den Einstellungen (nur im Challenge-Switcher und im Profil-Sheet).
- **Wochenplan:** Der „Slider“ ist reine Deko (nicht bedienbar), Emoji doppelt (vor und im Select), Pflicht-Workouts bekommen Basis/Max-Felder, obwohl dort keine Reps gelten.
- **Strafregeln** mit Jargon („Summe Reps < Summe fairShare → Strafe“), Betrag als `defaultValue` (springt nicht mit, wenn jemand anders ändert).
- Optisch drei Stile nebeneinander (`.card`+`.label`, `.mu-toggle-row`, `.penalty-config-row`), Glyphen ✎ 🗑 ✓ ✕ statt Icons.

## Entscheidungen

1. **iOS-Muster „Inset Grouped“ mit Unterseiten.** Die Startseite ist eine kurze Übersicht; jedes Thema hat eine eigene Seite mit Zurück-Knopf. Navigation bleibt im Einstellungen-Tab (kein Router).
2. **Ein Schalter pro Modul.** Der Modul-Schalter (nur Ersteller, wie RLS auf `competitions`) ist die einzige Ein/Aus-Stelle und schaltet die zugehörige Config wie bisher mit. Die inneren Schalter entfallen. Steht eine alte Config noch auf „aus“, zeigt die Modulseite einen Hinweis mit „Wieder einschalten“ (für alle, wie RLS auf den Config-Tabellen).
3. **Rechte unverändert:** Name, Emoji, Module, Code erneuern, Archivieren, Teilnehmer entfernen = Ersteller. Wochenplan, Strafregeln, Tags = alle Teilnehmer. Gesperrte Schalter bekommen nur den Hinweis „Nur <Name> kann das ändern.“
4. **Wenig Text:** keine erklärenden Fußnoten oder Beschreibungen, nur Beschriftungen und knappe Werte.
5. **Gerätebezogenes bleibt lokal** (`localStorage`): Erscheinungsbild (`pt:theme2`, neu mit „System“) und Push (`pt:notifications`, neu persistiert).

## Aufbau

**Startseite „Einstellungen“**

- Profil-Karte: Avatar, Name, E-Mail → `ProfileSheet`
- **Challenge** — Kopfzeile mit Emoji, Name, Modus · Startdatum → Seite „Challenge“; „Teilnehmer & Einladen“ (Anzahl) → Seite; Schalter „Beim App-Start öffnen“ (Haupt-Challenge, bisher nur als Stern im Switcher)
- **Module** — Wochenplan, Strafkonto, Work-Tracking: rechts „An“/„Aus“, darunter der Stand („2-Wochen-Zyklus“, „5 € pro Strafe · Wochensumme“, „3 Tags“)
- **App** — Erscheinungsbild (System · Hell · Dunkel), Push-Mitteilungen; Hinweis nur, falls iOS die Mitteilungen blockiert
- **Abmelden**

**Unterseiten**

- *Challenge:* Emoji und Name (Ersteller). Ein Tipp aufs Emoji öffnet eine Auswahl (Vorschläge + eigenes Emoji), der Name speichert beim Verlassen des Feldes. Dazu Modus, Start, Ende; unten Archivieren / Wieder aktivieren und Verlassen.
- *Teilnehmer & Einladen:* Code groß, „Einladung teilen“, „Neuen Code erzeugen“ (Ersteller); Teilnehmerliste, bei 2 vs 2 nach Team gruppiert mit A/B-Wahl; Entfernen (Ersteller).
- *Wochenplan:* Modul-Schalter; pro Zykluswoche eine Gruppe (aktuelle Woche markiert), Übungen als kompakte Zeilen mit Spanne „100 bis 120 Reps“; Pflicht-Workouts ohne Reps-Felder; Übung/Woche hinzufügen; „Diese Woche auf Vorschläge setzen“.
- *Strafkonto:* Modul-Schalter; Betrag pro Strafe; Regel als Auswahlliste mit einer kurzen Zeile pro Regel.
- *Work-Tracking:* Modul-Schalter; Projekte und Tools mit Hinzufügen, Umbenennen, Löschen.

Das Zahnrad im Strafkonto-Tab öffnet direkt die Seite *Strafkonto*.

## Code

- `www/settings.jsx`: Bausteine (`SettingsGroup`, `SettingsRow`, `SettingsSwitchRow`, `SettingsPageHeader`) und die Seiten. `WeekFixCard` bleibt dort.
- `CompetitionSettingsCard` (`competitions.jsx`) und `PenaltyConfigCard` (`strafkonto.jsx`) gehen in den neuen Seiten auf und entfallen.
- `www/app.jsx`: Push-Einstellung persistiert, Theme „System“ (inkl. Inline-Skript in `index.html`), Unterseite des Einstellungen-Tabs als State in `CompetitionApp`, Abmelden/Haupt-Challenge/E-Mail werden durchgereicht. Plan-Slots und Rotation-Config kommen als Props aus `CompetitionApp` statt doppelt geladen zu werden.
- Styles als `.st-*` in `www/redesign.css`; nicht mehr genutzte Regeln aus `styles.css` entfernt.

## Prüfung

Browser-Demo-Modus (`?demo=reset`), iPhone-Breite, hell und dunkel: alle Seiten, Ersteller- und Mitglieder-Sicht (Challenge „Büro-Duell“ gehört Lea), 2 vs 2, Push-Schalter über Neuladen hinweg, Zahnrad im Strafkonto.
