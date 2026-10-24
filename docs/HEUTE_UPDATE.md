# Update: Heute über alle Challenges (24.10.2026)

## Was sich ändert

- **Heute = Dashboard über alle Challenges** (ab zwei laufenden Challenges). Oben die Challenges als Karten (Tipp → Schnellansicht mit Duell und Balken pro Übung, von dort „Challenge öffnen“). Darunter wischbare Fokus-Karten: jede Übung einmal, auch wenn sie in mehreren Challenges vorkommt. Ein Eintrag zählt in allen diesen Challenges. „Heute“ nochmal antippen oder „‹ Alle Challenges“ führt zurück.
- **Einmal eintragen, zählt überall:** Gleiche Übung = gleiche Katalog-Übung oder eigene Übung mit gleichem Namen und gleicher Einheit. Jede Challenge bekommt eine Zeile mit derselben `log_id`. Bearbeiten und Löschen wirken auf alle Zeilen, Rangliste und Stats zählen den Eintrag einmal. Im Log-Dialog lässt sich jede Challenge abwählen.
- **Fokus-Karte wischbar**, mit Tauziehen-Balken: Beide Seiten laufen von außen zur Mitte, wer vorne liegt, leuchtet.
- **Wochenziel festlegen:** Auf einen Blick Übung und Menge pro Person. Unter „Details“: Ziel gesamt statt pro Person, nächste Woche, „Auch anlegen in“ (dasselbe Ziel in weiteren Challenges). Eigene Übungen mit Einheit **Wiederholungen, Minuten** (z. B. Bibellesen, Planks) oder Work. Minuten-Übungen haben Timer und Schnell-Chips in Minuten, Projekt und Tool braucht nur Work.
- **Stats:** Filter-Chips nach Übung (Challenge, Ich, Duelle), Balken pro Übung wieder gegeneinander („Nach Übung“, antippen filtert). Minuten-Übungen werden in Minuten ausgewertet.
- **Rangliste:** Medaillen erst nach dem Monatsabschluss. Im laufenden Monat sind Plätze und Punkte „vorläufig“, ohne 🥇🥈🥉. „Meine Leute“ = alle, mit denen man gerade in einer laufenden Challenge ist (beide aktiv, nicht archiviert, ohne Freies Training); wer davon nicht mitmacht, steht im Hinweis. Trophäenschrank nach Monaten, dieselben Zahlen wie Saison und Ewig, dazu der laufende Monat als „vorläufig“.
- **Wochenabschluss-Feier:** Beim ersten Öffnen nach Sonntag pro Challenge „KW 43 ist vorbei“, Balken-Rennen, Auflösung. Bei einem Sieg Rückwärtssaltos von Benny und Joni und volle Eskalation. Auch nach „Woche abschließen“ im Strafkonto.

## Datenbank

Die App läuft ohne neue Migration. Für einen sauberen Server-Stand einspielen:

```bash
supabase db push
```

oder den Inhalt von `supabase/migrations/20261024120000_heute_dashboard.sql` im SQL-Editor ausführen. Die Migration

1. zieht beim Bearbeiten auch Minuten (`duration_minutes`) auf alle Zeilen derselben `log_id` (die App macht das bis dahin selbst),
2. rechnet „Meine Leute“ (`is_mine` in `ranking_month` und `ranking_totals`) nur noch über laufende Challenges (die App überschreibt `is_mine` bis dahin selbst).

Neue Übungsart: `categories.kind = 'time'` (Minuten). Die Spalte hat keinen Check-Constraint, es braucht dafür keine Migration.

## Testen

- Demo: `?demo=reset` (Daten werden neu erzeugt, mit „Bibellesen“ in zwei Challenges und einer abgeschlossenen Vorwoche für die Feier).
- Tests: `node --test tests/*.test.cjs`, Übersetzungen: `node tools/i18n-check.cjs`.
