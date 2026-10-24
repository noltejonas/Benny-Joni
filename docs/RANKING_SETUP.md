# Monatsrangliste einspielen

> **Seit 24.10.2026: Wochenwertung.** Mit `supabase/migrations/20261024130000_weekly_ranking.sql` gibt es Medaillen pro Woche (Abschluss montags 12 Uhr, Cron `ranking-close-weeks`), Monat, Saison und Ewig zählen die Wochen zusammen. Die Schritte unten bleiben die Grundlage, Details in `docs/HEUTE_UPDATE.md`.

Reihenfolge: erst Datenbank, dann Functions, dann App-Build. Die App fällt beim Loggen auf das alte Einfügen zurück, solange die Migration fehlt; der Rangliste-Tab zeigt dann „Rangliste nicht verfügbar“.

Spec: `docs/superpowers/specs/2026-10-20-monatsrangliste-design.md`

## 1. Migration

Vorher ein Backup im Supabase-Dashboard anlegen.

```bash
supabase db push
```

Alternativ den Inhalt von `supabase/migrations/20261020120000_monthly_ranking.sql` im SQL-Editor ausführen.

Danach prüfen:

```sql
-- Gewertete Grundübungen (Liegestütze, Klimmzüge, Dips, Leg Raises, HSPU,
-- Sit-ups, Kniebeugen, Burpees, Bring Sally Up, Tom Holland, soweit vorhanden)
select name, ranked, metric, max_per_day from categories where competition_id is null order by name;

-- Admins für Meldungen (Benny und Jonas über legacy_athlete)
select p.display_name from ranking_admins a join profiles p on p.id = a.user_id;

-- Erster gewerteter Monat
select * from ranking_settings;

-- Stündlicher Monatsabschluss
select jobname, schedule, command from cron.job where jobname = 'ranking-close-months';
```

- **Meldungen der Migration:** Gibt es eigene Übungen, die wie eine Katalog-Übung heißen, listet die Migration sie als `NOTICE`. Diese von Hand umbenennen (z. B. „Liegestütze (alt)“), sonst wundert sich jemand, warum sie nicht zählen.
- **Startmonat:** Steht auf dem 1. November 2026. Geht die App später live, auf den ersten vollen Monat danach setzen: `update ranking_settings set start_month = '2026-12-01';`
- **Admin fehlt:** `insert into ranking_admins select id from profiles where display_name = 'Benny';`
- **Kein Cron-Job:** pg_cron im Dashboard unter Database → Extensions aktivieren, dann `select cron.schedule('ranking-close-months', '5 * * * *', 'select public.close_due_months()');`. Ohne Cron schließt die App fällige Monate beim Öffnen der Rangliste ab.

## 2. Edge Functions

Aus diesem Branch deployen (auf `main` liegt noch der alte Stand). Die CLI muss mit dem Konto eingeloggt sein, dem Projekt Terminator gehört (`npx supabase login`). Beide Functions prüfen den Header `x-webhook-secret` selbst und laufen deshalb ohne JWT-Prüfung, wie `notify-set` bisher.

```bash
npx supabase functions deploy notify-set --project-ref jczyyupxxqrdgbeifcwe --no-verify-jwt
```

```bash
npx supabase functions deploy ranking-push --project-ref jczyyupxxqrdgbeifcwe --no-verify-jwt
```

`notify-set` verschickt zusätzlich „X hat dich bei Y auf Platz N verdrängt“ (höchstens einmal pro Tag). `ranking-push` schließt fällige Monate ab und verschickt die Erinnerung am letzten Tag des Monats und die Monatsergebnisse. Beide nutzen die vorhandenen Secrets (`APNS_*`, `WEBHOOK_SECRET`).

Danach den stündlichen Aufruf von `ranking-push` anlegen: `supabase/migrations/20261020130000_ranking_push_cron.sql` einspielen (wie Schritt 1). Der Job ruft die Function über `pg_net` mit dem Secret aus `app.webhook_secret` auf, genau wie der Push-Trigger auf `sets`.

SQL-Dateien lassen sich auch ohne SQL-Editor einspielen (über die Management API, ohne Datenbank-Passwort und ohne die Migrationshistorie):

```bash
npx supabase db query --linked -f supabase/migrations/20261020130000_ranking_push_cron.sql
```

Stand 21.10.2026: Alles ist eingespielt, dazu `20261021080000_rank_crunches.sql` (Crunches gewertet) und `20261021090000_ranking_opt_in_grant.sql` (die App darf `ranking_opt_in` setzen; seit Migration A2 sind Updates auf `profiles` nur für freigegebene Spalten erlaubt). `notify-set` und `ranking-push` sind aus diesem Branch deployed, inklusive der Sprachtexte aus `main`. Ein Testaufruf von `ranking-push` lieferte 200; der Cron-Job wartet bis zu 30 Sekunden auf die Antwort, weil ein Kaltstart länger als die 5 Sekunden Standard von `pg_net` dauern kann. **Webhook-Secret (seit 21.10.2026):** `notify-set` und `ranking-push` lehnen Aufrufe ohne den Header `x-webhook-secret` ab (401). Der Wert steht als `WEBHOOK_SECRET` in den Function-Secrets und als Eintrag `webhook_secret` in Supabase Vault; Trigger `notify_set_inserted` und der Cron-Job lesen ihn über `public.webhook_secret()` (Migration `20261021100000_webhook_secret_vault.sql`, für App-Nutzer gesperrt). Neues Secret: beide Stellen ändern, zuerst den Vault-Eintrag (`select vault.update_secret(id, '<neu>') from vault.secrets where name = 'webhook_secret';`), dann `npx supabase secrets set WEBHOOK_SECRET=<neu>`. Ebenfalls eingespielt: `20261021000000_profile_language.sql` aus `main`, Pushes kommen damit in der Sprache der Empfänger.

Prüfen:

```sql
select jobname, schedule from cron.job where jobname in ('ranking-push', 'ranking-close-months');
-- nach der nächsten vollen Stunde + 15 Minuten: Antwort der Function
select status_code, content from net._http_response order by created desc limit 5;
```

## 3. App

Build wie gewohnt (`bundle exec fastlane beta`). Wichtig für alle, die in mehreren Challenges dieselbe Übung haben: **Sätze nur noch einmal eintragen.** Die App trägt einen Satz einer Grundübung automatisch in alle Challenges ein, die die Übung diese Woche haben; im Log-Dialog lässt sich das pro Challenge abwählen.

## Prüfen

- Rangliste-Tab öffnen → Frage nach der Zustimmung → „Ja, mitmachen“.
- Einen Satz Liegestütze in einer Challenge loggen, die auch in einer zweiten Challenge Liegestütze hat: In beiden Feeds taucht er auf, in der Rangliste zählt er einmal.
- Im Demo-Modus (`?demo=reset`) lässt sich alles ohne echte Daten durchklicken.
