# Slack: Wochenupdate und `/neues`

Beides läuft über **eine** Slack-App im Workspace **Benny & Joni**. Der
Slack-Connector von Claude bleibt im Bauer-Lieferant-Workspace und wird dafür
nicht gebraucht.

| Was | Wie | Wo im Repo |
|---|---|---|
| Wochenupdate, montags 8 Uhr in #agenten-berichte | Incoming Webhook, geschickt von der Routine „Benny & Joni Wochenupdate in Slack“ auf dem Mac | `tools/adoption/slack-message.cjs`, `slack-post.cjs` |
| `/neues` in jedem Channel | Slash-Befehl → Edge Function `slack-agent` (liest nur) | `supabase/functions/slack-agent`, `_shared/slack-rules.ts` |

## Slack-App anlegen (einmal)

1. Auf <https://api.slack.com/apps> auf **Create New App** und dann **From scratch** klicken. Name „Benny & Joni Agent“, Workspace **Benny & Joni**.
2. **Incoming Webhooks** → einschalten → **Add New Webhook to Workspace** →
   Channel **#agenten-berichte** → Allow. URL kopieren und speichern, ohne
   sie irgendwo einzufügen:

   ```bash
   pbpaste > /Users/jonasnolte/Developer/Benny-Joni/.local/adoption/slack-webhook-url && chmod 600 /Users/jonasnolte/Developer/Benny-Joni/.local/adoption/slack-webhook-url
   ```

3. **Slash Commands** → **Create New Command**:
   - Command: `/neues`
   - Request URL: `https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/slack-agent`
   - Short Description: „Was gibt's Neues in der App?“
   - Usage Hint: `[heute | woche | 48h | 3 tage]`
4. **Basic Information** → **Signing Secret** → Show → kopieren und als
   Supabase-Secret setzen (aus dem Repo-Ordner, mit angemeldeter Supabase-CLI):

   ```bash
   npx supabase secrets set SLACK_SIGNING_SECRET="$(pbpaste)" --project-ref jczyyupxxqrdgbeifcwe
   ```

5. **Install App** → in den Workspace installieren (bzw. nach Änderungen neu
   installieren).

Optional nur den eigenen Workspace zulassen: Workspace-ID (beginnt mit `T`,
steht in der Slack-URL `app.slack.com/client/T…/…`) als `SLACK_TEAM_ID` setzen.

## Benutzen

- `/neues`: letzte 24 Stunden
- `/neues heute`, `/neues woche` (seit Montag)
- `/neues 48h`, `/neues 3 tage`, `/neues 2 wochen` (bis 90 Tage)
- `/neues hilfe`

Die Antwort steht für alle im Channel: neue Anmeldungen, neue Challenges,
Beitritte, Einträge (jeder Eintrag einmal, auch wenn er in mehreren Challenges
zählt), die Aktivsten, Reaktionen und abgeschlossene Wochenwertungen mit
Medaillen. Medaillen erscheinen nur bei Personen mit Ranglisten-Zustimmung.
Review-Testkonten („… Demo“) werden nicht hervorgehoben.

Wochenupdates sowie `/neues`-Berichte und die Hilfe enthalten immer denselben
Link zur [Live-Übersicht](https://noltejonas.github.io/Benny-Joni/uebersicht.html).
Sie lädt beim Öffnen, bei Rückkehr in den Tab und alle 60 Sekunden im sichtbaren
Tab die aktuellen Nutzer, Challenges, Kennzahlen und Wochenverläufe aus Supabase.
Damit sind keine gespeicherten HTML-Kopien oder manuellen Artifact-Updates nötig.

Anmeldung mit dem bestehenden Benny-&-Joni-App-Konto. Die SQL-Funktion
`adoption_report()` prüft bei jedem Abruf die bestehende Rolle `ranking_admins`
(Benny/Jonas). Anonyme und normale App-Konten erhalten keinen Bericht. Auf
GitHub Pages liegen nur die Oberfläche und der bereits öffentliche anon-Key;
keine Berichte, Nutzerlisten, Passwörter oder Service-Schlüssel.

Anmeldung und Bericht bleiben ausschließlich im Arbeitsspeicher des Tabs.
Beim Schließen/Neuladen ist eine erneute Anmeldung erforderlich. Abmelden oder
eine ungültige Sitzung entfernt die Berichtsdaten aus der Ansicht. Bei einem
Ladefehler bleibt der letzte Stand ausdrücklich als nicht aktualisiert markiert.

Für die Einrichtung zuerst Migration `20261026120000_adoption_report.sql`
anwenden. Die vier Dateien `uebersicht.html`, `adoption.css`, `adoption.mjs` und
`adoption-client.mjs` aus `docs/launch/site` nach `Benny-Joni/` im bereits aktiven
Hosting-Repository `noltejonas/noltejonas.github.io` übernehmen; dessen Pages-Build
veröffentlicht die Übersicht. Danach `slack-agent` mit dem neuen Link deployen.
Der separate Projekt-Workflow `legal-pages` setzt eine eigene, konfigurierte
Projekt-Pages-Site voraus; sie ist für diesen bestehenden Hostingweg nicht nötig.
Die bestehende Slack-Signaturprüfung
und `verify_jwt=false` bleiben dabei erhalten. Der Wochenpost führt weiterhin
seine vorhandene lesende DB-Abfrage aus und verlinkt dieselbe Live-Seite.

## Prüfen

- Ohne gültige Slack-Signatur antwortet `slack-agent` mit 401, ohne gesetztes
  Signing Secret immer.
- Logs: Supabase Dashboard → Edge Functions → slack-agent → Logs.
- Wochenupdate ohne Senden ansehen:
  `node tools/adoption/slack-post.cjs /Users/jonasnolte/Developer/Benny-Joni/.local/adoption/out --dry-run`
