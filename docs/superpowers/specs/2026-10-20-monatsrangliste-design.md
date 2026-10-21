# Monatsrangliste — Design

Stand 2026-10-20. Eine globale Rangliste für die Grundübungen, die jeden Monat bei null beginnt. Platzierungen bringen Punkte; daraus entstehen eine Saison- und eine ewige Tabelle.

## Ausgangslage

- **Wertung gibt es nur innerhalb einer Challenge:** Wochensieg = meiste Reps (2 vs 2: Teamsumme), Pflicht-Workouts haben keinen Sieger.
- **Kategorien:** `competition_id = null` ist der System-Katalog (laut Migrationen und Demo-Daten: Liegestütze, Klimmzüge, Dips, Leg Raises, HSPU, Sit-ups, Tom Holland, Bring Sally Up, dazu Work-Kategorien wie Vibe Coding). Alles andere ist eine eigene Übung einer Challenge. `categories.id` ist `text`.
- **Ein Satz gehört zu genau einer Challenge** (`sets.competition_id not null`) und hängt an einem Wochenziel. Loggen geht nur auf Übungen, die in dieser Woche Wochenziel sind. Wer in mehreren Challenges dieselbe Übung hat, trägt denselben Satz mehrfach ein.
- **Rotationsplan:** Eine Übung ist je nach Plan nicht jede Woche dran.
- **Sichtbarkeit:** `profiles` nur für Mitspieler (`shares_competition`), `sets` nur für Mitglieder (`is_member`). Der Bucket `avatars` ist öffentlich.
- **Rückdatieren:** Den Tag eines Satzes kann man im Feed innerhalb seiner Woche ändern.
- **Kein „Konto löschen“** in der App. `competitions.created_by` ist `not null` ohne `on delete`, ein Profil mit eigener Challenge lässt sich heute nicht löschen.
- Echte Tageswerte bisher: höchstens 250 Liegestütze an einem Tag (`klimmzug_challenge_backfill.csv`).

## Entscheidungen

Bestätigt:

1. **Kein Elo.** Freundeskreise, die nie gegeneinander antreten, hätten getrennte Skalen. Wiederholungen dagegen sind direkt vergleichbar.
2. **Nur Grundübungen werden gewertet.** Eigene Übungen bleiben erlaubt, zählen aber nicht.
3. **Rangliste pro Monat**, Reset am 1. Platzierungen bringen Punkte, die All-Time-Tabelle entsteht aus den Monatsergebnissen.
4. **Keine Telefonnummer, kein Chat**, auch keine Freitext-Bio. Kontakt zwischen Fremden gibt es nicht.

Umgesetzt nach Vorschlag (lässt sich später ändern, siehe Offene Fragen):

5. Punkte nach dem **F1-Schema** für die Plätze 1–10.
6. **Einmal loggen, zählt überall**, dazu **Freies Training** für Grundübungen ohne passendes Wochenziel.
7. **Saisontabelle** pro Kalenderjahr zusätzlich zur ewigen Tabelle.
8. **Gleichstand** = gleicher Platz und gleiche Punkte.
9. **Rangliste nur mit Zustimmung.** Wer ablehnt, wird nicht gewertet.

## Wertung

### Übungen

`categories` bekommt `ranked`, `metric`, `rule` und `max_per_day`. Nur Katalog-Einträge können `ranked` sein.

| Übung | `metric` | Wert im Monat | `max_per_day` (Startwert) |
|---|---|---|---|
| Liegestütze | `volume` | Summe der Reps | 1.000 |
| Sit-ups | `volume` | Summe der Reps | 1.000 |
| Dips | `volume` | Summe der Reps | 600 |
| Leg Raises | `volume` | Summe der Reps | 600 |
| Klimmzüge | `volume` | Summe der Reps | 400 |
| HSPU | `volume` | Summe der Reps | 300 |
| Crunches | `volume` | Summe der Reps | 1.000 |
| Kniebeugen | `volume` | Summe der Reps | 1.000 |
| Burpees | `volume` | Summe der Reps | 500 |
| Bring Sally Up | `best` | längster Durchgang (Sekunden) | 204 pro Durchgang |
| Tom Holland | `best` | meiste Runden | 40 pro Durchgang |
| Work-Kategorien | – | nicht gewertet | – |

- **Tageslimit:** Pro Tag zählt höchstens `max_per_day`. Mehr wird nicht blockiert und zählt in den Challenges weiter, in der Rangliste aber nur bis zur Grenze. Das fängt Tippfehler und erfundene Werte ab, ohne dass jemand Einträge prüfen muss.
- **`rule`:** ein Satz zur Ausführung (z. B. „Aus dem toten Hang, Kinn über die Stange“), angezeigt in der Rangliste unter „So zählt’s“.
- Eine **eigene Übung mit Katalognamen** (Groß-/Kleinschreibung egal) wird abgelehnt. Bestehende Dubletten listet die Migration auf, sie werden von Hand umbenannt.
- In der Übungsauswahl tragen eigene Übungen den Hinweis „zählt nicht für die Rangliste“.
- Die Migration markiert Übungen über den Namen; was es in der Datenbank nicht gibt, wird übersprungen. Live gewertet sind seit dem 21.10.2026: Liegestütze, Klimmzüge, Dips, Leg Raises, HSPU, Sit-ups, Crunches (eigene Migration `20261021080000_rank_crunches.sql`), Burpees, Bring Sally Up, Tom Holland. Kniebeugen gibt es live nicht; „Bibel lesen“ steht als Sport im Katalog und bleibt ungewertet.

### Zeitraum

- Kalendermonat in Europe/Berlin, nach dem Tag von `sets.created_at`.
- **Nachtragsfrist** bis zum 2. des Folgemonats, 12:00. Dann wird der Monat abgeschlossen: `monthly_results` ist ein fester Stand, spätere Änderungen an Sätzen wirken nicht zurück.
- Der erste gewertete Monat ist der erste volle Monat nach dem Release von Phase 1 (`ranking_settings.start_month`, Standard 1. November 2026). Vergangene Monate werden nicht gewertet, weil doppelt eingetragene Sätze rückwirkend nicht zu trennen sind. Davor läuft der aktuelle Monat als „Probelauf“.

### Punkte

| Platz | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Punkte | 25 | 18 | 15 | 12 | 10 | 8 | 6 | 4 | 2 | 1 |
| Medaille | 🥇 | 🥈 | 🥉 | | | | | | | |

- Pro Übung und Monat. Gewertet wird nur, wer einen Wert über 0 hat.
- Gleichstand: gleicher Platz, gleiche Punkte, der nächste Platz wird übersprungen (1, 1, 3), wie `rank()` in SQL.

### Tabellen

| Tabelle | Inhalt |
|---|---|
| **Monat** | live, Wert und Platz; Punkte erscheinen als Vorschau |
| **Saison** | Summe der Punkte im Kalenderjahr. Am Jahresende bekommt der Erste jeder Übung und der Gesamtwertung einen Pokal 🏆 („Champion 2027“) |
| **Ewig** | Summe aller Punkte seit Start, umschaltbar auf Medaillenspiegel (Gold, dann Silber, dann Bronze, dann Punkte) |

- Jede Tabelle gibt es pro Übung und als **Gesamtwertung** (Punkte aller Übungen).
- **Filter „Alle | Meine Leute“** (alle, mit denen ich eine Challenge teile). Im Filter zeigt die Zeile den Platz in der gefilterten Liste und klein den Gesamtplatz („#14 gesamt“). Punkte kommen immer aus der Gesamtliste.

## Loggen

### Ein Satz zählt einmal

- `sets.log_id uuid not null default gen_random_uuid()`. Bestehende Sätze bekommen je eine eigene `log_id`.
- Sport-Sätze loggt die App über die RPC `log_set(p_challenge, p_reps, p_note, p_created_at, p_skip)`. Bei gewerteten Übungen legt sie in jeder anderen aktiven Challenge, die die Übung in derselben Woche als Wochenziel hat, eine Zeile mit derselben `log_id` an. Mit `p_skip` lassen sich Challenges abwählen. Work-Sätze gehen wie bisher direkt in die Tabelle; fehlt die RPC (Migration noch nicht eingespielt), fällt `addSet` auf das direkte Einfügen zurück.
- Das LogSheet zeigt bei gewerteten Übungen „Zählt auch für: …“ mit einem Chip pro Challenge, standardmäßig alle an. Pflicht-Workouts, Schnellsatz und Nachtrag verteilen immer auf alle.
- Bearbeiten und Löschen wirken auf alle Zeilen derselben `log_id`: Trigger `sync_log_siblings`. Löschungen per Cascade (Challenge, Wochenziel oder Profil gelöscht) reicht er nicht weiter.
- Die Rangliste und „Ich“-Stats zählen pro `log_id` nur einen Wert.

### Freies Training

- `log_free_set(p_category, p_reps, …)` aus der Rangliste nimmt die erste eigene Challenge, die die Übung diese Woche hat. Gibt es keine, landet der Satz im **Freien Training**: eine versteckte Solo-Challenge pro User (`competitions.mode = 'solo'`, Code `SOLO-…` ist lang und zufällig) samt Wochenziel (`target_reps = 1`, weil die Spalte > 0 verlangt). Loggen, RLS, Feed-Daten und „Ich“-Stats funktionieren damit ohne Sonderweg.
- `log_targets(p_category, p_week)` liefert, wohin ein Satz geht; der Eintragen-Dialog zeigt das an.
- Die Solo-Challenge erscheint nicht im Challenge-Switcher (`listMyCompetitions` ohne `includeSolo`), nicht in Duellen und nicht bei Wochensiegen. Ihr Volumen zählt in „Reps gesamt“ und den Bestwerten.

## Sichtbarkeit & Schutz

- `profiles.ranking_opt_in boolean` (`null` = noch nicht gefragt). Beim ersten Öffnen der Rangliste kommt ein Sheet: „In der Rangliste erscheinen?“
  - **Ja:** wird gewertet und gelistet.
  - **Nein:** wird nicht gewertet (sonst hätten andere unsichtbare Gegner) und sieht nur „Du wärst Platz 14“. Die Entscheidung lässt sich in den Einstellungen ändern.
- Fremde sehen nur Name, Bild, Farbe, Werte und Medaillen. Die RPCs liefern genau diese Felder, an `profiles`-RLS ändert sich nichts.
- **Melden** (Apple-Guideline 1.2): in der Profilkarte, Grund „Unrealistische Werte“ (Übung und Monat der Ansicht) oder „Name oder Bild unangemessen“. Ab 3 Meldungen von verschiedenen Leuten wird der Eintrag ausgeblendet. Admins stehen in `ranking_admins` (eigene Tabelle, weil `profiles` vom User selbst beschreibbar ist; die Migration trägt Benny und Jonas über `legacy_athlete` ein) und entscheiden unter Einstellungen → Meldungen prüfen: „In Ordnung“ oder „Entfernen“ (Eintrag weg; bei Profil-Meldungen die Person aus allen Listen, Profilbild gelöscht).
- **Blockieren:** Der Blockierte erscheint für mich als „Ausgeblendet“ ohne Bild, bleibt aber gewertet und bekommt keine „überholt“-Pushes über mich. Liste unter Einstellungen → Blockiert.
- **Konto löschen** (Apple-Guideline 5.1.1(v)): in den Einstellungen, zwei Bestätigungen. Die RPC `delete_my_account()` tritt aus allen Challenges aus (Owner-Rolle geht ans älteste Mitglied), löscht leere Challenges inkl. Freiem Training, setzt `created_by` auf den neuen Owner und löscht dann den Auth-User; der Rest folgt per Cascade. `competitions.created_by` ist dafür nullable mit `on delete set null`. Profilbilder löscht die App vorher aus dem Bucket.

## Darstellung

- **Neuer Tab „Rangliste“** (Pokal-Icon) zwischen Feed und Stats. Er ist global und hängt nicht an der aktiven Challenge.
- **Kopf:** Übungs-Chips (Gesamt + jede gewertete Übung), Segment Monat · Saison · Ewig, Filter Alle · Meine Leute.
- **Monat:** „noch 11 Tage“. Zeilen mit Platz, Avatar, Name und Wert (Reps, `m:ss` bzw. „N Runden“), auf den Plätzen 1–10 die Punkte grau dahinter. Die eigene Zeile ist hervorgehoben und unten angeheftet, wenn sie nicht im Bild ist, mit „noch 42 bis Platz 3“.
- **Monatswechsel** ‹ › zurück bis zum Startmonat. Abgeschlossene Monate zeigen den festen Stand, vor dem Abschluss steht „Nachtragen bis 2.11., 12 Uhr“, vor dem Startmonat „Probelauf“.
- **Saison/Ewig:** Punkte und Medaillen pro Zeile (🥇3 🥈1).
- **Tipp auf eine Zeile:** kleine Karte mit Name, Bild, Medaillen und Pokalen sowie Melden/Blockieren. Mehr gibt es nicht.
- **Eigenes Profil:** Trophäenschrank mit Medaillen nach Monat und Pokalen.
- **Monatsende:** Beim nächsten App-Start nach dem Abschluss eine Feier (`celebration.jsx`), wenn man eine Medaille geholt hat. Im Feed jeder Challenge eine Karte „Oktober“ mit den Platzierungen ihrer Mitglieder.

## Push

Dedup über `push_log` (`competition_id` leer):

| Art | Auslöser | Text | Grenze |
|---|---|---|---|
| `rank_overtaken` | `notify-set` bei jedem neuen Satz | „Lea hat dich bei Klimmzügen auf Platz 4 verdrängt.“ | 1× pro Tag, nur wer vorher in den Top 10 war |
| `month_last_day` | `ranking-push`, letzter Tag ab 18 Uhr | „Dir fehlen 18 Liegestütze bis Platz 2.“ | 1× pro Person, nur wenn der Abstand höchstens 20 % des eigenen Werts ist |
| `month_closed` | `ranking-push`, bis 48 h nach dem Abschluss | „🥇 Klimmzüge · 🥉 Dips · 40 Punkte“ | 1× pro Monat, nur mit Punkten |

`notify-set` feuert pro Zeile, also bei verteilten Sätzen mehrmals; `ranking_overtaken` wertet nur die Zeile mit der kleinsten ID einer `log_id` aus. Ein Tipp auf eine Rangliste-Push öffnet den Rangliste-Tab. `ranking-push` läuft stündlich per Dashboard-Cron (siehe `docs/RANKING_SETUP.md`).

## Datenmodell

Migration `supabase/migrations/20261020120000_monthly_ranking.sql`:

- `categories` + `ranked`, `metric`, `rule`, `max_per_day`; Check `not ranked or competition_id is null`; Trigger `guard_catalog_names`.
- `sets` + `log_id` (Index), Trigger `sync_log_siblings`.
- `competitions`: Modus `solo`, ein Solo pro User, `created_by` nullable.
- `profiles` + `ranking_opt_in`.
- Neu: `ranking_settings` (`start_month`), `ranking_admins`, `monthly_results` (`category_id` als Text, weil der Typ von `categories.id` zwischen den alten Setup-Skripten schwankt), `month_closures`, `ranking_reports`, `user_blocks`. RLS überall an; Zugriff über die Funktionen, nur `user_blocks` und `ranking_settings` haben Policies.

Funktionen (security definer, `search_path` gepinnt):

| Funktion | Für | Zweck |
|---|---|---|
| `log_set`, `log_free_set`, `log_targets` | App | Loggen mit Verteilung, Freies Training, Ziele anzeigen |
| `ranking_month(p_month)` | App | Monatsliste (live bzw. aus `monthly_results`), plus eigene Zeile mit `counted = false` |
| `ranking_totals(p_from, p_to)` | App | Saison/Ewig pro User und Übung |
| `ranking_profile(p_user)`, `season_champions()` | App | Trophäenschrank, Pokale |
| `close_due_months()` | App, Cron | fällige Monate abschließen, idempotent |
| `report_ranking_entry`, `set_block`, `my_blocks` | App | Melden, Blockieren |
| `is_ranking_admin`, `ranking_reports_open`, `resolve_ranking_reports` | Admins | Meldungen prüfen |
| `delete_my_account()` | App | Konto löschen |
| `ranking_values`, `ranking_live`, `ranking_hidden`, `close_month`, `ranking_overtaken` | intern, Service Role | Rechnung, Abschluss, Push |

`close_due_months()` läuft per `pg_cron` stündlich (`ranking-close-months`) und zusätzlich, wenn jemand die Rangliste öffnet.

## Code

- `www/ranking-model.js` (`PTRanking`): Punkte, Rangfolge mit Gleichstand, Tageslimit, `log_id`-Dedup, Bestwert, Saison/Ewig-Summen, Medaillenspiegel, Saisonsieger, Abstand nach oben, Monatshilfen. Für Demo-Modus und Anzeige; die DB rechnet dieselben Regeln.
- `www/ranking.jsx`: `RankingScreen` (Monat mit Monatswechsel, Saison, Ewig; Übungs-Chips; Alle/Meine Leute), angeheftete eigene Zeile, Zustimmung, Eintragen, Profilkarte mit Melden/Blockieren, Feed-Karte `MonthRecapCard`.
- `www/app.jsx`: Tab „Rangliste“, Feed-Karte und Medaillen-Feier für den letzten abgeschlossenen Monat, Push-Tap.
- `www/celebration.jsx`: `CelebrationOverlay` mit eigenen Texten.
- `www/screens.jsx`: „Zählt auch für“ im LogSheet, Hinweis bei eigenen Übungen.
- `www/data.js`, `www/demo.js`: Rangliste-API; `addSet` über `log_set`; Solo ausgeblendet.
- `www/stats-model.js`, `www/stats-global.jsx`: „Ich“ zählt jede `log_id` einmal und nimmt das Freie Training mit.
- `www/settings.jsx`: Gruppe „Rangliste“, Seiten „Blockiert“ und „Meldungen“, „Konto löschen“.
- `supabase/functions/notify-set`: zusätzlich `rank_overtaken`. Neu: `supabase/functions/ranking-push`.

## Prüfung

- `node --test tests/` mit `tests/ranking-model.test.cjs`.
- Migration gegen ein nachgebautes Mini-Schema in PGlite (Postgres als WASM): Katalog, Katalognamen-Sperre, Verteilen und `p_skip`, Bearbeiten/Löschen über die `log_id`, Cascade lässt Geschwister stehen, Freies Training, Zustimmung, Gleichstand, Tageslimit, Bestwert, „überholt“, Melden/Admin, Blockieren, Monatsabschluss (idempotent, eingefroren), Totals, Konto löschen. Zweimal einspielen geht.
- Browser-Demo-Modus (`?demo=reset`), iPhone-Breite, hell und dunkel.
- Offen: echte Datenbank (Supabase-Branch), iOS-Build, Push auf Geräten.

## Nicht im Umfang

- Elo, Herausforderungen, Freundschaftsanfragen, Ligen, „Aufsteiger des Monats“ (später).
- Telefonnummer, Chat, Freitext-Bio (bewusst nie).
- Wertung vergangener Monate, Länder-Rangliste.

## Offene Fragen

Umgesetzt ist jeweils der Vorschlag; alles lässt sich später ändern.

1. **Punkte:** F1-Schema für die Plätze 1–10 oder nur fürs Podest?
2. **Sally:** Bei 3:24 teilen sich schnell mehrere Gold. Bleibt das so, oder entscheidet bei Gleichstand die Zahl voller Durchgänge?
3. **Saison:** zusätzlich zur ewigen Tabelle oder nur ewig?
4. **Tageslimits:** passen die Startwerte?
5. **Startmonat:** 1. November 2026 oder später, je nach Release?
