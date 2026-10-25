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

Wochenupdates sowie `/neues`-Berichte und die Hilfe enthalten immer einen Link
zur bestehenden HTML-Übersicht mit allen Nutzern und Challenges. Die Übersicht
liegt als Claude-Artifact vor und erfordert eine Claude-Anmeldung; ihr Datenstand
wird durch das Anhängen des Links nicht aktualisiert.

## Prüfen

- Ohne gültige Slack-Signatur antwortet `slack-agent` mit 401, ohne gesetztes
  Signing Secret immer.
- Logs: Supabase Dashboard → Edge Functions → slack-agent → Logs.
- Wochenupdate ohne Senden ansehen:
  `node tools/adoption/slack-post.cjs /Users/jonasnolte/Developer/Benny-Joni/.local/adoption/out --dry-run`
