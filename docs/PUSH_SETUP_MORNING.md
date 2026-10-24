# Push-Mitteilungen – Einrichtung und Prüfung

Stand 21.10.2026, Multi-User-Version (Login, beliebig viele Challenges).
Ersetzt die alte Checkliste aus der Benny-und-Jonas-Zeit (Namenswahl ohne Login,
Webhook-Test mit `athlete`). Projekt: `jczyyupxxqrdgbeifcwe`.

**Heute Morgen nötig:** Teil A (ca. 15 Minuten). Teil B und C kommen nach dem Launch.

---

## Was es gibt

| Art (`push_log.kind`) | Auslöser | Wer bekommt sie | Text (Beispiel) | Stand |
|---|---|---|---|---|
| `rival` | Trigger `notify_set_after_insert` auf `sets` → Function `notify-set` | Gegner, die heute in dieser Challenge noch bei 0 sind, sobald der Sender heute **ab 10** Wiederholungen hat (bei 2v2 nur das andere Team) | **🔥 Benny ist los** · 💪 Büro-Battle · Schon 12 Reps heute — du noch bei 0. | live nach Deploy (Teil A) |
| `daily` | pg_cron stündlich → Function `daily-nudge`, Mo–Sa 19 Uhr | Wer in einer laufenden Challenge mit Wiederholungs-Zielen diese Woche heute noch keinen Satz hat | **⏰ Heute noch nichts für Büro-Battle** · Joni hat schon 40 Reps – zieh nach! | DRY_RUN, scharf frühestens 22.10. (Teil B) |
| `last_call` | wie `daily`, sonntags 18 Uhr | Wer seinen Wochenanteil bei mindestens einem Wiederholungs-Ziel noch nicht hat | **⏳ Letzte Chance für Büro-Battle** · Dir fehlen noch 30 Liegestütze bis Mitternacht. | wie `daily` |
| `join` | Trigger auf `competition_members` → `notify-set` | Alle anderen aktiven Mitglieder | **🎉 Joni ist dabei** · ⚔️ Büro-Battle · Das Duell läuft. Leg los! | optional (Teil C) |
| `reaction` | Trigger auf `reactions` → `notify-set` | Besitzer des Satzes (nicht bei eigener Reaktion) | **🔥 Joni** · 💪 Büro-Battle · Joni hat auf deine 25 Klimmzüge reagiert. | optional (Teil C) |

Regeln für alle Arten:

- **Ruhezeit 22–7 Uhr** (Berliner Zeit): Es geht nichts raus, und der Tagesplatz bleibt frei.
- **Höchstens eine Mitteilung pro Nutzer, Challenge und Tag**, egal welcher Art. So bleibt der Satz im Vorab-Bildschirm der App wahr. Die neuen Migrationen legen dafür den Index `push_log_one_per_day_idx` an; bis dahin prüft der Code vorher in `push_log`.
- Nur Geräte mit iOS-Token **und** `user_id` in `device_tokens`.
- Pflicht-Workouts zählen nicht als Wiederholungen (wie `user_reps_today`). Erinnerungen gibt es nur für normale Sport-Ziele, nicht für Workouts oder Arbeitszeit.
- Anteil wie in der App (SHARE_BASIS): Wochenziel geteilt durch die echten Teilnehmer, sobald mindestens 2 aktiv sind, sonst durch die erwartete Besetzung (1v1: 2, 2v2: 4).
- Die Daily-Erinnerung schickt pro Lauf höchstens eine Mitteilung pro Nutzer, auch bei mehreren Challenges (zuerst die Haupt-Challenge).

- **Sprache der Empfänger:** Texte auf Englisch, wenn `profiles.language = 'en'`
  (die App meldet ihre Sprache, Migration `20261021000000_profile_language.sql`),
  sonst Deutsch. Beispiel Rivale: **🔥 Benny is on a roll** · 💪 Büro-Battle · Already 12 reps
  today — you’re still at 0. Namen von Personen, Challenges und eigenen Übungen bleiben, wie sie
  sind; Standard-Übungen (Liegestütze, Klimmzüge, Kniebeugen) werden übersetzt.

Code: `supabase/functions/notify-set/index.ts`, `supabase/functions/daily-nudge/index.ts`.
Alle Regeln und Texte stehen in `supabase/functions/_shared/push-rules.ts` und sind in
`tests/push-rules.test.mjs` geprüft (`node --test tests/push-rules.test.mjs`).

---

## Teil A – Rivalen-Push heute Morgen (ca. 15 Minuten)

### A1. Ist-Stand prüfen (SQL-Editor, nur lesend)

Dashboard → SQL Editor. Jede Abfrage einzeln markieren und mit Cmd+Enter ausführen
(der Editor zeigt nur das letzte Ergebnis). Mehr Abfragen: `docs/launch/supabase-checks.sql`.

```sql
-- Wurden schon Pushes verschickt? (leer ist bei einer frischen App normal)
select kind, count(*), max(day) from push_log group by 1;

-- Antworten der Function. pg_net hebt sie nur 6 Stunden auf.
-- 200 ok, 401 Secret passt nicht, 503 APNs-Secrets fehlen, 500 Fehler in der Function
select status_code, count(*), max(created) from net._http_response group by 1;

-- Geräte mit Token. Nur Zeilen mit user_id bekommen Pushes.
select platform, count(*), count(*) filter (where user_id is not null) as mit_user_id
from device_tokens group by 1;

-- Auslöser auf sets: es darf nur EINER aktiv sein (siehe A4)
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.sets'::regclass and not tgisinternal;

-- Ist ein Webhook-Secret in der DB gesetzt? (true/false, nicht der Wert)
select coalesce(current_setting('app.webhook_secret', true), '') <> '' as webhook_secret_gesetzt;
```

### A2. Secrets prüfen

Dashboard → Edge Functions → Secrets (oder `supabase secrets list --project-ref jczyyupxxqrdgbeifcwe`).

| Secret | Wert | Pflicht |
|---|---|---|
| `APNS_KEY_ID` | 10 Zeichen, vom APNs-Key | ja |
| `APNS_TEAM_ID` | 10 Zeichen, Apple-Team | ja |
| `APNS_PRIVATE_KEY` | Inhalt der `.p8`-Datei | ja |
| `APNS_ENV` | `production` (TestFlight und App Store) | ja |
| `APNS_BUNDLE_ID` | `com.bennyjoni.terminator` (Standard, darf fehlen) | nein |
| `RIVAL_THRESHOLD` | Schwelle für den Rivalen-Push, Standard `10` | nein |
| `WEBHOOK_SECRET` | **heute nicht neu setzen**, siehe unten | nein |

**WEBHOOK_SECRET:** Die Function prüft das Secret nur, wenn es gesetzt ist. Der Trigger
schickt den Wert aus `app.webhook_secret` mit. Ist `WEBHOOK_SECRET` gesetzt, aber
`webhook_secret_gesetzt` aus A1 `false`, antwortet die Function mit 401 und es kommt
**kein einziger** Push an. Dann vorerst `supabase secrets unset WEBHOOK_SECRET --project-ref jczyyupxxqrdgbeifcwe`.
Die saubere Härtung (Secret aus dem Vault, Function lehnt ohne Secret ab) kommt nach dem Launch.

**Falls APNs-Secrets fehlen (503 in A1):**

1. https://developer.apple.com/account/resources/authkeys/list → **+** → „Apple Push Notifications service (APNs)“ → Register.
2. `.p8` herunterladen (geht nur einmal), Key ID notieren. Team ID steht oben rechts im Developer-Konto.
3. App ID `com.bennyjoni.terminator` muss die Capability „Push Notifications“ haben (Identifiers → App ID).
4. Secrets setzen:
   ```bash
   supabase secrets set APNS_KEY_ID=… APNS_TEAM_ID=… APNS_ENV=production --project-ref jczyyupxxqrdgbeifcwe
   supabase secrets set APNS_PRIVATE_KEY="$(cat ~/Pfad/AuthKey_XXXXXXXXXX.p8)" --project-ref jczyyupxxqrdgbeifcwe
   ```

### A3. notify-set deployen

Auf diesem Mac ist keine Supabase-CLI installiert. Einmalig:

```bash
brew install supabase/tap/supabase     # alternativ ohne Installation: npx supabase …
supabase login                         # öffnet den Browser
```

Dann aus dem Repo-Ordner (die CLI nimmt `supabase/functions/notify-set` und den
gemeinsamen Ordner `supabase/functions/_shared` mit):

```bash
supabase functions deploy notify-set --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
```

- **`--no-verify-jwt` ist Pflicht.** Der Trigger schickt kein JWT mit. Ohne den Schalter
  lehnt Supabase jeden Aufruf mit 401 ab, bevor die Function läuft, und es gibt keinen Push.
  Danach im Dashboard (Edge Functions → notify-set → Details) prüfen, dass die JWT-Prüfung aus ist.
- Verlangt die CLI Docker, `--use-api` anhängen (dann baut Supabase auf dem Server).
- Der Dashboard-Editor ist diesmal **nicht** geeignet: notify-set importiert jetzt
  `../_shared/apns.ts` und `../_shared/push-rules.ts`, die der Editor nicht mitliefert.
- Secrets wie `RIVAL_THRESHOLD` wirken ohne neues Deploy. Kommt trotzdem der alte
  Wert an, die Function einfach noch einmal deployen.

### A4. Nur einen Auslöser behalten

In A1 („Auslöser auf sets“) sollte genau **ein** Eintrag stehen, der notify-set aufruft:

- `notify_set_after_insert` (aus den Migrationen) → so lassen.
- Zusätzlich ein Dashboard-Webhook (Trigger mit `supabase_functions.http_request`, z. B.
  `notify-set-insert`) → im Dashboard unter Database → Webhooks löschen. Doppelt ist dank
  Obergrenze kein doppelter Push, aber jeder Satz ruft die Function zweimal auf.
- Nur der Webhook und kein Trigger → Webhook behalten.

### A5. Test mit zwei Geräten

Voraussetzungen:

- Zwei iPhones mit dem TestFlight-Build, Konto A und Konto B in **derselben** Challenge.
- Auf beiden Mitteilungen erlaubt (Einstellungen in der App → Mitteilungen an). Danach
  zeigt `device_tokens` aus A1 zwei Zeilen mit `user_id`.
- B hat heute in dieser Challenge **noch nichts** geloggt und heute dort noch keine Mitteilung bekommen.
- Zwischen 7 und 22 Uhr. B hat die App geschlossen oder im Hintergrund (im Vordergrund zeigt iOS keinen Banner).

Ablauf:

1. A loggt einen Satz mit mindestens 10 Wiederholungen (oder mehrere, die zusammen 10 ergeben).
2. B bekommt nach wenigen Sekunden **🔥 A ist los** · Challenge · „Schon 12 Reps heute — du noch bei 0.“
3. Tippen öffnet die Challenge.
4. Gegenprobe im SQL-Editor:
   ```sql
   select kind, day, created_at from push_log order by created_at desc limit 5;
   select status_code, content from net._http_response order by created desc limit 5;
   ```
   Erwartet: `{"kind":"rival","sent":1,"skipped":{},"failures":{},"cleaned":0}`.
5. A loggt noch einen Satz: Diesmal kommt nichts (`"skipped":{"already_sent_today":1}`), das ist die Obergrenze.

Zum Wiederholen des Tests den Eintrag von heute löschen (schreibt in die DB, nur für Tests):
`delete from push_log where kind = 'rival' and day = (now() at time zone 'Europe/Berlin')::date;`

### Antworten von notify-set lesen

Die Antworten stehen in `net._http_response.content`. Sie enthalten nur Zählwerte, keine Nutzer-IDs.

| Antwort | Bedeutung |
|---|---|
| `{"kind":"rival","sent":1,…}` | Verschickt |
| `"reason":"quiet_hours"` | 22–7 Uhr, nichts verschickt |
| `"reason":"sender_below_threshold"` | Sender hat heute weniger als die Schwelle (`threshold` steht dabei) |
| `"reason":"recipients_active"` | Alle Gegner haben heute schon geloggt |
| `"reason":"no_opponents"` | Allein in der Challenge |
| `"skipped":{"no_tokens":1}` | Empfänger hat kein Token: App öffnen, Mitteilungen erlauben |
| `"skipped":{"already_sent_today":1}` | Obergrenze: heute in dieser Challenge schon eine Mitteilung |
| `"failures":{"400 BadDeviceToken":1}` | `APNS_ENV` passt nicht zum Build (TestFlight/App Store = `production`, Xcode-Run = `development`). Solche Tokens werden gelöscht; die App meldet sich beim nächsten Öffnen neu an. |
| `"failures":{"403 InvalidProviderToken":1}` | Key ID, Team ID oder `.p8` falsch |
| `"failures":{"400 DeviceTokenNotForTopic":1}` | `APNS_BUNDLE_ID` passt nicht |
| Status 401 `unauthorized` | `WEBHOOK_SECRET` passt nicht zu `app.webhook_secret` (siehe A2) |
| Status 401 mit „authorization header“ | Function wurde ohne `--no-verify-jwt` deployt (A3) |
| Status 503 `apns_not_configured` | APNs-Secrets fehlen (A2) |
| Status 500 | Fehler in der Function: Edge Functions → notify-set → Logs |

---

## Teil B – Tageserinnerung (daily-nudge), erst Probelauf

Die Function läuft stündlich, prüft selbst die Berliner Uhrzeit und tut nur Mo–Sa um 19 Uhr
(`daily`) und sonntags um 18 Uhr (`last_call`) etwas. pg_cron läuft in UTC; durch das
stündliche Auslösen stimmt die Uhrzeit auch nach der Zeitumstellung am 25.10.
Standard ist **DRY_RUN**: Die Function loggt nur, wem sie was schicken würde, verschickt
nichts und schreibt nichts in `push_log`. Ein eigenes Secret (`NUDGE_SECRET`) schützt sie;
ohne dieses Secret lehnt sie jeden Aufruf ab.

1. **pg_cron einschalten:** Dashboard → Integrations → Cron → pg_cron aktivieren.
   Prüfen: `select exists (select 1 from pg_extension where extname = 'pg_cron');`
2. **Secret erzeugen und in den Vault legen:**
   ```bash
   openssl rand -hex 32        # Wert kopieren
   ```
   ```sql
   select vault.create_secret('<WERT>', 'daily_nudge_secret');
   ```
3. **Function deployen, gleicher Wert als Secret, DRY_RUN bleibt an:**
   ```bash
   supabase secrets set NUDGE_SECRET=<WERT> DRY_RUN=true --project-ref jczyyupxxqrdgbeifcwe
   supabase functions deploy daily-nudge --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
   ```
4. **Probelauf von Hand** (jederzeit; `force` ist immer ein Probelauf):
   ```bash
   curl -X POST 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/daily-nudge' \
     -H "x-webhook-secret: <WERT>" -H 'content-type: application/json' \
     -d '{"force":"daily"}'        # oder {"force":"last_call"}
   ```
   Antwort z. B. `{"dry_run":true,"kind":"daily","planned":3,"users_with_token":5,…}`.
   Die einzelnen Kandidaten stehen unter Edge Functions → daily-nudge → Logs
   („daily-nudge DRY_RUN“ mit Titel und Text).
5. **Cron anlegen:** `supabase/migrations/20261021001000_daily_nudge_cron.sql` im SQL-Editor ausführen.
   Vorher Abschnitt 17 aus `docs/launch/supabase-checks.sql` (muss leer sein).
6. **Nach 19 Uhr prüfen:** Logs wie in Schritt 4 und
   ```sql
   select status_code, content from net._http_response order by created desc limit 5;
   select status, return_message, start_time from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'daily-nudge')
     order by start_time desc limit 5;
   ```
   Außerhalb von 19/18 Uhr antwortet die Function mit `"reason":"not_nudge_hour"`, das ist richtig.
7. **Scharf schalten** (frühestens 22.10., wenn die Kandidaten im Log stimmen):
   ```bash
   supabase secrets set DRY_RUN=false --project-ref jczyyupxxqrdgbeifcwe
   ```
8. **Am 25.10. (Zeitumstellung)** kontrollieren, dass die `last_call`-Einträge um 18 Uhr kamen:
   `select kind, created_at at time zone 'Europe/Berlin' from push_log where day = '2026-10-25';`

Abschalten: `select cron.unschedule('daily-nudge');` (sofort) oder `supabase secrets set DRY_RUN=true …`.

---

## Teil C – Beitritt und Reaktion (optional, nach dem Launch)

1. notify-set ist mit Teil A schon auf dem neuen Stand (die Function kennt beide Ereignisse).
2. `supabase/migrations/20261021002000_social_push.sql` im SQL-Editor ausführen. Sie legt drei
   Trigger an (Beitritt, Wiedereintritt, Reaktion). Das Secret kommt wie beim Rivalen-Trigger
   aus `app.webhook_secret`.
3. Test mit zwei Geräten (7–22 Uhr): B tritt per Code der Challenge von A bei → A bekommt
   „🎉 B ist dabei“. Dann loggt B einen Satz und A reagiert darauf → B bekommt die Reaktion.
   (Andersherum klappt es erst am nächsten Tag: A hat heute schon den Beitritts-Push, Obergrenze.)
4. Zurück: die drei `drop trigger …`-Zeilen aus dem Kopf der Migration ausführen.

Beitritt und Reaktion zählen zur selben Obergrenze. Wer heute schon den Rivalen-Push hatte,
bekommt in dieser Challenge heute keine Reaktions-Mitteilung mehr.

---

## Regeln ändern

| Was | Wo | Wirkung |
|---|---|---|
| Schwelle Rivalen-Push | Secret `RIVAL_THRESHOLD` (Standard 10) | ohne Deploy (notfalls neu deployen) |
| Probelauf an/aus | Secret `DRY_RUN` für daily-nudge (Standard an) | ohne Deploy (notfalls neu deployen) |
| Ruhezeit 22–7 Uhr | `QUIET_HOURS` in `supabase/functions/_shared/push-rules.ts` | nach Deploy beider Functions |
| Uhrzeiten 19 / So 18 Uhr | `DAILY_NUDGE_HOUR`, `LAST_CALL_HOUR` (gleiche Datei) | nach Deploy von daily-nudge |
| Erinnerungen pro Nutzer und Lauf | `MAX_NUDGES_PER_USER_PER_RUN` (gleiche Datei) | nach Deploy von daily-nudge |
| Texte | `rivalAlert`, `dailyNudgeAlert`, `lastCallAlert`, `joinAlert`, `reactionAlert` (gleiche Datei) | nach Deploy |

Nach jeder Änderung an `push-rules.ts`: `node --test tests/push-rules.test.mjs`.

---

## Offen nach dem Launch

- **Secret-Härtung:** notify-set lehnt ohne `WEBHOOK_SECRET` ab, die Trigger lesen das Secret aus dem Vault.
  Reihenfolge: Vault-Secret anlegen, Trigger-Funktionen umstellen, dann `WEBHOOK_SECRET` setzen und deployen.
- **Push-Token beim Kontowechsel:** Meldet sich auf einem Gerät ein anderes Konto an, bleibt der Token beim alten Konto (RPC `claim_device_token`).
- **„Rivale hat dich überholt“** als Push (bisher nur im Feed).
