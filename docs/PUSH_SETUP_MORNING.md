# Push Notifications — Morgen-Checklist

Alles was in der Nacht autonom gebaut wurde, ist in den Commits.
Was du morgens machst, dauert ~20 Minuten und ist hier Schritt für Schritt.

**Was schon erledigt ist (kein Anfassen nötig):**
- ✅ `device_tokens`-Tabelle in Supabase angelegt
- ✅ Edge Function `notify-set` deployed (Status: ACTIVE)
- ✅ `@capacitor/push-notifications@8.0.4` installiert + cap sync
- ✅ `App.entitlements` mit `aps-environment=production`
- ✅ `AppDelegate.swift` leitet APNs-Events an Capacitor weiter
- ✅ Client registriert Token + zeigt Banner bei fremden Sets
- ✅ Tap auf Banner → Feed-Tab

**Was du morgens machst:**

---

## 1. APNs Auth Key generieren (Apple Developer)

1. https://developer.apple.com/account/resources/authkeys/list öffnen
2. **+** klicken → "Apple Push Notifications service (APNs)" anhaken → Continue → Register
3. **Key herunterladen** als `AuthKey_XXXXXXXXXX.p8` — du kannst die Datei **nur einmal** runterladen, also gut speichern (z.B. `~/Documents/`)
4. **Key ID notieren** (10 Zeichen, steht auf der Detailseite des Keys)
5. **Team ID notieren** (oben rechts in der Apple Developer Konsole, neben deinem Namen, 10 Zeichen)

## 2. Push capability auf App ID aktivieren

1. https://developer.apple.com/account/resources/identifiers/list öffnen
2. App ID `com.bennyjoni.terminator` anklicken
3. **Capabilities** scrollen → "Push Notifications" anhaken (falls noch nicht)
4. Save

## 3. Edge Function Secrets setzen

Im Terminal aus dem Projekt-Root:

```bash
# Erstmal CLI installieren falls noch nicht da
npm install -g supabase

# Login (öffnet Browser)
supabase login

# Projekt linken (Project Ref kommt aus www/app.jsx:5)
supabase link --project-ref jczyyupxxqrdgbeifcwe

# Zufälliges Webhook-Secret merken — kopieren!
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "Webhook secret (kopieren für Step 4): $WEBHOOK_SECRET"

# Alle Secrets in einem Rutsch setzen (Werte ersetzen!)
supabase secrets set \
  APNS_KEY_ID=ABC1234567 \
  APNS_TEAM_ID=DEF1234567 \
  APNS_BUNDLE_ID=com.bennyjoni.terminator \
  APNS_ENV=production \
  WEBHOOK_SECRET="$WEBHOOK_SECRET"

# Multi-line .p8 separat (Pfad zur .p8-Datei anpassen)
supabase secrets set APNS_PRIVATE_KEY="$(cat ~/Documents/AuthKey_ABC1234567.p8)"
```

**Sanity check:**
```bash
supabase secrets list
```
Sollte 6 Secrets zeigen: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`, `WEBHOOK_SECRET`, `APNS_PRIVATE_KEY`.

> **Falls Dashboard lieber:** Supabase Dashboard → Edge Functions → `notify-set` → "Manage secrets" (oder Project Settings → Edge Functions → Secrets).

## 4. Database Webhook anlegen

Supabase Dashboard:

1. https://supabase.com/dashboard/project/jczyyupxxqrdgbeifcwe/database/hooks
2. **Create a new hook**
3. Felder:
   - **Name:** `notify-set-insert`
   - **Table:** `sets`
   - **Events:** nur `Insert` anhaken
   - **Type:** `Supabase Edge Functions`
   - **Edge Function:** `notify-set`
   - **HTTP Headers** → "Add new header":
     - Name: `x-webhook-secret`
     - Value: das `WEBHOOK_SECRET` aus Step 3
4. **Create hook**

## 5. Xcode: Capability + Archive

```bash
npx cap open ios
```

In Xcode:

1. Links im Projekt-Tree **App** anklicken
2. Target **App** → Tab **Signing & Capabilities**
3. **+ Capability** → `Push Notifications` doppelklicken
   → Das verlinkt automatisch unsere `App.entitlements`-Datei
4. Optional aber empfohlen: **+ Capability** → `Background Modes` → Häkchen bei `Remote notifications`
5. Build-Nummer hochzählen (Build → z.B. 2)
6. Device-Auswahl oben auf **"Any iOS Device (arm64)"**
7. Menü **Product → Archive** (5–10 min Build)
8. Im Organizer-Fenster: **Distribute App** → App Store Connect → Upload

## 6. TestFlight Update auf beide Handys

- App Store Connect → TestFlight → neuer Build erscheint nach ~5–15 min Processing
- Beide iPhones: TestFlight App → Projekt Terminator → "Update"

## 7. First-Run-Setup auf jedem Phone

1. App öffnen
2. Namen wählen (Benny bzw. Jonas)
3. **Irgendwo in die App tippen** — das triggert den Permission-Prompt
4. „Erlauben" bei der iOS-Benachrichtigung
5. Kurz warten bis Token registriert ist

**Verifikation:**

Supabase Dashboard → Table Editor → `device_tokens` — sollten 2 Reihen drin sein (eine pro Phone, jeweils mit Athlete-Name).

## 8. Test

- Phone A (Benny): Heute-Tab → einen Satz loggen mit Notiz „testing push"
- Phone B (Jonas): innerhalb von 1–3 Sekunden Banner mit
  - Title: `🤜 Benny: +X Klimmzüge`
  - Body: `„testing push"`
- Banner antippen → App öffnet sich, Feed-Tab aktiv

Wenn das funktioniert: 🎉 fertig.

---

## Troubleshooting

**Banner kommt nicht:**

1. Supabase Dashboard → Database → Webhooks → `notify-set-insert` → "Logs" → letzter Aufruf:
   - 200 + `{sent: 0, reason: "no recipients"}` → Token wurde nicht registriert. Check Step 7.
   - 200 + `{sent: 0, ..., failures: [...]}` → APNs hat geantwortet, aber abgelehnt. Häufige Ursachen:
     - `reason: "BadDeviceToken"` → Token gehört zu Sandbox aber wir senden Production (oder umgekehrt). Prüfen: ist `APNS_ENV=production` UND wurde via TestFlight installiert? Dev-Builds via `npx cap run ios` brauchen `APNS_ENV=development`.
     - `reason: "InvalidProviderToken"` → JWT-Signatur falsch. Key ID, Team ID oder `.p8` prüfen.
     - `reason: "TopicDisallowed"` → `APNS_BUNDLE_ID` matched nicht. Muss `com.bennyjoni.terminator` sein.
   - 401 → `WEBHOOK_SECRET` im Webhook-Header weicht von dem im Edge-Secrets ab. Step 3+4 nochmal abgleichen.
   - 500 → Edge Function Crash. Edge Functions → `notify-set` → "Invocations" → Stacktrace lesen.

2. Edge Function direkt testen (ohne DB-Trigger):
   ```bash
   curl -X POST 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set' \
     -H "x-webhook-secret: $WEBHOOK_SECRET" \
     -H 'content-type: application/json' \
     -d '{"type":"INSERT","table":"sets","schema":"public","record":{"id":"x","challenge_id":"y","athlete":"Jonas","reps":5,"note":"manual test","created_at":"2026-05-12T00:00:00Z"},"old_record":null}'
   ```
   - `{sent: 1, ...}` → APNs hat genommen, Banner sollte kommen.
   - `{sent: 0, ...}` → Token-Liste war leer oder APNs hat alle abgelehnt.

**Token-Inspektion:**

```sql
-- Im Supabase SQL Editor:
select athlete, platform, substring(token, 1, 12) as token_prefix, last_seen
from device_tokens order by last_seen desc;
```
