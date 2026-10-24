# Update: Heute über alle Challenges (24.10.2026)

## Was sich ändert

- **Heute = Dashboard über alle Challenges** (ab zwei laufenden Challenges). Oben die Challenges als Karten (Tipp → Schnellansicht mit Duell und Balken pro Übung, von dort „Challenge öffnen“). Darunter wischbare Fokus-Karten: jede Übung einmal, auch wenn sie in mehreren Challenges vorkommt. Ein Eintrag zählt in allen diesen Challenges. „Heute“ nochmal antippen oder „‹ Alle Challenges“ führt zurück.
- **Einmal eintragen, zählt überall:** Gleiche Übung = gleiche Katalog-Übung oder eigene Übung mit gleichem Namen und gleicher Einheit. Jede Challenge bekommt eine Zeile mit derselben `log_id`. Bearbeiten und Löschen wirken auf alle Zeilen, Rangliste und Stats zählen den Eintrag einmal. Im Log-Dialog lässt sich jede Challenge abwählen.
- **Fokus-Karte wischbar**, mit Tauziehen-Balken: Beide Seiten laufen von außen zur Mitte, wer vorne liegt, leuchtet.
- **Wochenziel festlegen:** Auf einen Blick Übung und Menge pro Person. Unter „Details“: Ziel gesamt statt pro Person, nächste Woche, „Auch anlegen in“ (dasselbe Ziel in weiteren Challenges). Eigene Übungen mit Einheit **Wiederholungen, Minuten** (z. B. Bibellesen, Planks) oder Work. Minuten-Übungen haben Timer und Schnell-Chips in Minuten, Projekt und Tool braucht nur Work.
- **Stats:** Filter-Chips nach Übung (Challenge, Ich, Duelle), Balken pro Übung wieder gegeneinander („Nach Übung“, antippen filtert). Minuten-Übungen werden in Minuten ausgewertet.
- **Rangliste mit Wochenmedaillen:** Neuer Reiter „Woche“ (live). Nach jeder abgeschlossenen Woche (Montag 12 Uhr, bis dahin darf man nachtragen) gibt es pro Übung 🥇🥈🥉 für die Plätze 1–3 und F1-Punkte für die Top 10. In der laufenden Woche sind Plätze und Punkte „vorläufig“, ohne Medaillen. Monat, Saison und Ewig zählen die abgeschlossenen Wochen zusammen (eine Woche gehört zum Monat ihres Donnerstags, wie die Kalenderwoche). Trophäenschrank nach Monaten, jede Medaille mit KW, dieselben Zahlen wie Saison und Ewig, dazu die laufende Woche als „vorläufig“. Beim ersten Öffnen nach dem Wochenabschluss: Feier bei einer Medaille und Karte „Rangliste · KW 42“ im Feed. „Meine Leute“ = alle, mit denen man gerade in einer laufenden Challenge ist (beide aktiv, nicht archiviert, ohne Freies Training); wer davon nicht mitmacht, steht im Hinweis.
- **Wochenabschluss-Feier:** Beim ersten Öffnen nach Sonntag pro Challenge „KW 43 ist vorbei“, Balken-Rennen, Auflösung. Bei einem Sieg Rückwärtssaltos von Benny und Joni und volle Eskalation. Auch nach „Woche abschließen“ im Strafkonto.

## Datenbank

Zwei Migrationen, in dieser Reihenfolge:

```bash
supabase db push
```

oder den Inhalt im SQL-Editor ausführen:

1. `supabase/migrations/20261024120000_heute_dashboard.sql`
   - zieht beim Bearbeiten auch Minuten (`duration_minutes`) auf alle Zeilen derselben `log_id` (die App macht das bis dahin selbst),
   - rechnet „Meine Leute“ (`is_mine`) nur noch über laufende Challenges (die App überschreibt `is_mine` bis dahin selbst).
2. `supabase/migrations/20261024130000_weekly_ranking.sql` (Wochenmedaillen)
   - Tabellen `weekly_results` und `ranking_week_closures`, Funktionen `ranking_week`, `ranking_closed_weeks`, `ranking_profile_weeks`, `close_due_weeks`,
   - `ranking_totals`, `season_champions` und `ranking_overtaken` rechnen ab dann mit Wochen,
   - pg_cron-Job `ranking-close-weeks` (stündlich, schließt die Woche montags ab 12 Uhr ab; ohne Cron macht das die App beim Öffnen).

   **Ohne diese Migration läuft die App mit der bisherigen Monatswertung weiter.** Sie erkennt die Wochenwertung an `ranking_week` und schaltet dann selbst um. `monthly_results` und `close_due_months` bleiben für ältere App-Versionen bestehen.

Danach die Push-Function neu deployen, sie schickt dann „🏆 KW 43 ist abgeschlossen“ und sonntags ab 18 Uhr „⏳ Letzter Tag der Woche“ (ohne Migration weiter die Monats-Pushes):

```bash
npx supabase functions deploy ranking-push --project-ref jczyyupxxqrdgbeifcwe --no-verify-jwt
```

Neue Übungsart: `categories.kind = 'time'` (Minuten). Die Spalte hat keinen Check-Constraint, es braucht dafür keine Migration.

## Testen

- Demo: `?demo=reset` (Daten werden neu erzeugt, mit „Bibellesen“ in zwei Challenges, einer abgeschlossenen Vorwoche für die Feier und abgeschlossenen Ranglisten-Wochen).
- Tests: `node --test tests/*.test.cjs`, Übersetzungen: `node tools/i18n-check.cjs`.
