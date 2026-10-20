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

Vorschläge (siehe Offene Fragen):

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
| Bring Sally Up | `best` | längster Durchgang (Sekunden, max. 204) | – |
| Tom Holland | `best` | meiste Runden | 40 pro Durchgang |
| Work-Kategorien | – | nicht gewertet | – |

- **Tageslimit:** Pro Tag zählt höchstens `max_per_day`. Mehr wird nicht blockiert und zählt in den Challenges weiter, in der Rangliste aber nur bis zur Grenze. Das fängt Tippfehler und erfundene Werte ab, ohne dass jemand Einträge prüfen muss.
- **`rule`:** ein Satz zur Ausführung (z. B. „Aus dem toten Hang, Kinn über die Stange“), angezeigt in der Rangliste unter „So zählt’s“.
- Eine **eigene Übung mit Katalognamen** (Groß-/Kleinschreibung egal) wird abgelehnt. Bestehende Dubletten listet die Migration auf, sie werden von Hand umbenannt.
- In der Übungsauswahl tragen eigene Übungen den Hinweis „zählt nicht für die Rangliste“.

### Zeitraum

- Kalendermonat in Europe/Berlin, nach dem Tag von `sets.created_at`.
- **Nachtragsfrist** bis zum 2. des Folgemonats, 12:00. Dann wird der Monat abgeschlossen: `monthly_results` ist ein fester Stand, spätere Änderungen an Sätzen wirken nicht zurück.
- Der erste gewertete Monat ist der erste volle Monat nach dem Release von Phase 1. Vergangene Monate werden nicht gewertet, weil doppelt eingetragene Sätze rückwirkend nicht zu trennen sind.

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
- Gewertete Übungen loggt die App über die RPC `log_ranked_set(p_category, p_reps, p_day, p_skip uuid[])`. Sie legt in jeder aktiven Challenge, die die Übung in dieser Woche als Wochenziel hat, eine Zeile mit derselben `log_id` an. Mit `p_skip` lassen sich Challenges abwählen.
- Das LogSheet zeigt bei gewerteten Übungen „Zählt für: Benny vs Jonas, Freundeskreis“. Jede Challenge ist abwählbar, standardmäßig sind alle an.
- Bearbeiten und Löschen wirken auf alle Zeilen mit derselben `log_id` (`api.updateSet`/`deleteSet` filtern auf `log_id` und `user_id`).
- Die Rangliste zählt pro `log_id` nur einen Wert.
- Nicht gewertete Übungen (eigene, Work) laufen wie bisher über `addSet` in eine Challenge.

### Freies Training

- Hat keine Challenge die Übung in dieser Woche, landet der Satz im **Freien Training**: eine versteckte Solo-Challenge pro User (`competitions.mode = 'solo'`), die `log_ranked_set` bei Bedarf anlegt, samt Wochenziel (`target_reps = 0`). Loggen, RLS, Feed-Daten und „Ich“-Stats funktionieren damit ohne Sonderweg.
- Eintragen geht direkt aus der Rangliste („+ Eintragen“ in der Übungsansicht) und aus dem LogSheet.
- Die Solo-Challenge erscheint nicht im Challenge-Switcher, nicht in Duellen und nicht bei Wochensiegen und Zielquoten. Ihr Volumen zählt in „Reps gesamt“ und den Bestwerten.

## Sichtbarkeit & Schutz

- `profiles.ranking_opt_in boolean` (`null` = noch nicht gefragt). Beim ersten Öffnen der Rangliste kommt ein Sheet: „Mit Name und Bild in der Rangliste erscheinen?“
  - **Ja:** wird gewertet und gelistet.
  - **Nein:** wird nicht gewertet (sonst hätten andere unsichtbare Gegner) und sieht nur „Du wärst Platz 14“. Die Entscheidung lässt sich in den Einstellungen ändern und gilt ab dem laufenden Monat.
- Fremde sehen nur Name, Bild, Farbe, Werte und Medaillen. Die RPCs liefern genau diese Felder, an `profiles`-RLS ändert sich nichts.
- **Melden** (Apple-Guideline 1.2): an jedem Eintrag, Grund „Unrealistische Werte“ oder „Name/Bild unangemessen“. Ab 3 Meldungen von verschiedenen Leuten wird der Eintrag ausgeblendet, bis ein Admin (`profiles.is_admin`) ihn freigibt oder entfernt.
- **Blockieren:** Der Blockierte erscheint für mich als „Ausgeblendet“ ohne Bild, bleibt aber gewertet.
- **Konto löschen** (Apple-Guideline 5.1.1(v)): in den Einstellungen, mit Bestätigung. Eine Edge Function löscht den Auth-User per Service Role, das Profil folgt per Cascade. Vorher geht `competitions.created_by` an ein anderes Mitglied über; Challenges ohne Mitglieder werden gelöscht.

## Darstellung

- **Neuer Tab „Rangliste“** (Pokal-Icon) zwischen Feed und Stats. Er ist global und hängt nicht an der aktiven Challenge.
- **Kopf:** Übungs-Chips (Gesamt + jede gewertete Übung), Segment Monat · Saison · Ewig, Filter Alle · Meine Leute.
- **Monat:** „noch 11 Tage“. Zeilen mit Platz, Avatar, Name und Wert (Reps, `m:ss` bzw. „N Runden“), auf den Plätzen 1–10 die Punkte grau dahinter. Die eigene Zeile ist hervorgehoben und unten angeheftet, wenn sie nicht im Bild ist, mit „noch 42 bis Platz 3“.
- **Saison/Ewig:** Punkte und Medaillen pro Zeile (🥇3 🥈1).
- **Tipp auf eine Zeile:** kleine Karte mit Name, Bild, Medaillen und Pokalen sowie Melden/Blockieren. Mehr gibt es nicht.
- **Eigenes Profil:** Trophäenschrank mit Medaillen nach Monat und Pokalen.
- **Monatsende:** Beim nächsten App-Start nach dem Abschluss eine Feier (`celebration.jsx`), wenn man eine Medaille geholt hat. Im Feed jeder Challenge eine Karte „Oktober“ mit den Platzierungen ihrer Mitglieder.

## Push

Über `notify-set` bzw. Cron, Dedup über `push_log`:

| Art | Auslöser | Text | Grenze |
|---|---|---|---|
| `rank_overtaken` | neuer Satz | „Lea hat dich bei Klimmzügen auf Platz 4 verdrängt“ | 1× pro Tag, nur Plätze 1–10 |
| `month_last_day` | Cron, letzter Tag 18:00 | „Letzter Tag: Dir fehlen 18 Liegestütze bis Platz 2“ | 1× pro Monat, nur wenn der Abstand unter 20 % liegt |
| `month_closed` | `close_month` | „Oktober: 🥇 Klimmzüge, 🥉 Dips · 40 Punkte“ | 1× pro Monat, nur mit Punkten |

Wegen der `log_id`-Zeilen in mehreren Challenges feuert `notify-set` pro Zeile. `rank_overtaken` und `month_*` dürfen nur einmal pro `log_id` bzw. Monat zählen.

## Datenmodell

```sql
alter table categories
  add column ranked      boolean not null default false,
  add column metric      text check (metric in ('volume','best')),
  add column rule        text,
  add column max_per_day int,
  add constraint ranked_only_catalog check (not ranked or competition_id is null);

alter table sets add column log_id uuid not null default gen_random_uuid();
create index sets_log_id_idx on sets (log_id);

alter table competitions drop constraint competitions_mode_check,
  add constraint competitions_mode_check check (mode in ('1v1','2v2','ffa','solo'));

alter table profiles
  add column ranking_opt_in boolean,
  add column is_admin       boolean not null default false;

create table monthly_results (
  month       date not null,                 -- 1. des Monats
  category_id text not null references categories(id),
  user_id     uuid not null references profiles(id) on delete cascade,
  value       int  not null,
  rank        int  not null,
  points      int  not null default 0,
  medal       text check (medal in ('gold','silver','bronze')),
  primary key (month, category_id, user_id)
);

create table month_closures (month date primary key, closed_at timestamptz not null default now());

create table ranking_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null references profiles(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  category_id text references categories(id),
  month       date,
  reason      text not null check (reason in ('values','profile')),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (reporter, user_id, category_id, month)
);

create table user_blocks (
  blocker    uuid not null references profiles(id) on delete cascade,
  blocked    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
```

RPCs (security definer, `search_path` gepinnt):

| RPC | Zweck |
|---|---|
| `log_ranked_set(p_category, p_reps, p_day, p_skip)` | Fan-out auf alle passenden Challenges bzw. Freies Training, gemeinsame `log_id` |
| `monthly_ranking(p_category, p_month)` | Live-Liste: pro User Wert (je `log_id` einmal, pro Tag gedeckelt bzw. Bestwert), `rank()`, Profilfelder; nur `ranking_opt_in`, ohne ausgeblendete Einträge |
| `ranking_table(p_scope, p_category)` | Saison/Ewig aus `monthly_results`, `p_category = null` = Gesamt |
| `close_month(p_month)` | schreibt `monthly_results` + `month_closures`, idempotent; nur Service Role |
| `report_ranking_entry(…)`, `set_block(…)` | Melden, Blockieren |

`close_month` läuft per `pg_cron` am 2. jedes Monats um 12:00 Berlin (Cron rechnet in UTC, Sommerzeit beachten).

## Code

- `www/ranking-model.js` (`window.PTRanking`): Punkte-Tabelle, Rangfolge mit Gleichstand, Tageslimit, `log_id`-Dedup, Bestwert, Saison/Ewig-Summen, Abstand zum nächsten Platz. Grundlage für den Demo-Modus und die Anzeige; die DB rechnet dieselben Regeln in `monthly_ranking`/`close_month`.
- `www/ranking.jsx`: `RankingScreen`, Zeilen, Profilkarte, Opt-in-Sheet, Melden-Sheet.
- `www/app.jsx`: Tab „Rangliste“, Opt-in-Status, Feier nach Monatsabschluss.
- `www/screens.jsx` (`LogSheet`): gewertete Übungen über `api.logRankedSet`, Zeile „Zählt für: …“; Hinweis bei eigenen Übungen.
- `www/data.js`: `logRankedSet`, `getMonthlyRanking`, `getRankingTable`, `getMyMedals`, `setRankingOptIn`, `reportRankingEntry`, `setBlock`, `deleteAccount`; `updateSet`/`deleteSet` über `log_id`.
- `www/demo.js`: dieselben Methoden auf den Demo-Daten, mit weiteren Demo-Usern, damit die Liste voll aussieht.
- `www/competitions.jsx`, `www/stats-global.jsx`, `www/stats-model.js`: Solo-Challenge ausblenden bzw. aus Wochensiegen und Duellen herausnehmen.
- `www/settings.jsx`: „In der Rangliste erscheinen“, „Konto löschen“.
- `supabase/functions/notify-set`: `rank_overtaken`. Neue Edge Function `delete-account`.
- Migration `supabase/migrations/<datum>_monthly_ranking.sql`.

## Umsetzung in Phasen

| Phase | Inhalt | Warum zuerst |
|---|---|---|
| 1 | Katalog markieren, `log_id`, `log_ranked_set`, Freies Training, Hinweis bei eigenen Übungen | Der erste gewertete Monat braucht saubere Daten ab Tag 1 |
| 2 | Rangliste-Tab (Monat live), Opt-in, Profilkarte, Melden/Blockieren, Konto löschen | sichtbar, ohne Punkte |
| 3 | `close_month` + Cron, Punkte, Saison/Ewig, Medaillen im Profil, Feier, Feed-Karte | braucht einen abgeschlossenen Monat |
| 4 | Push | Feinschliff |

## Prüfung

- `node --test tests/` mit neuem `tests/ranking-model.test.cjs`: Punkte, Gleichstand 1-1-3, Tageslimit, `log_id`-Dedup, Bestwert bei Sally/Tom Holland, Saison-/Ewig-Summen, Abstand zum nächsten Platz.
- Browser-Demo-Modus (`?demo=reset`), iPhone-Breite, hell und dunkel: Rangliste mit allen Segmenten und Filtern, eigene Zeile angeheftet, Eintragen aus der Rangliste, Fan-out in zwei Demo-Challenges mit derselben Übung, Opt-in ablehnen, Melden.
- SQL auf einem Supabase-Branch: `log_ranked_set` mit und ohne passendes Wochenziel, `monthly_ranking` gegen die JS-Werte, `close_month` zweimal hintereinander (idempotent), Konto löschen mit eigener Challenge.
- iOS-Build läuft durch.

## Nicht im Umfang

- Elo, Herausforderungen, Freundschaftsanfragen, Ligen, „Aufsteiger des Monats“ (später).
- Telefonnummer, Chat, Freitext-Bio (bewusst nie).
- Wertung vergangener Monate, Länder-Rangliste.

## Offene Fragen

1. **Punkte:** F1-Schema für die Plätze 1–10 (Vorschlag) oder nur fürs Podest?
2. **Einmal loggen, zählt überall + Freies Training:** passt das? Das ist der größte Umbau.
3. **Sally:** Bei 3:24 teilen sich schnell mehrere Gold. Ist das okay (Vorschlag), oder entscheidet bei Gleichstand die Zahl voller Durchgänge?
4. **Saison:** zusätzlich zur ewigen Tabelle (Vorschlag) oder nur ewig?
5. **Opt-in:** Wer ablehnt, wird nicht gewertet (Vorschlag)?
6. **Tageslimits:** passen die Startwerte?
7. **Admins:** Benny und Jonas prüfen gemeldete Einträge, wie und wo genau?
