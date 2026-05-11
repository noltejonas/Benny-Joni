# Push Notifications — Design Spec

**Datum:** 2026-05-12
**Autor:** Claude (autonomer Nachtlauf, mit User-Freigabe)
**Status:** Approved (User: „ab jetzt musst Du alles selber entscheiden")

---

## Ziel

Wenn Benny oder Jonas einen Satz loggt, bekommt **der jeweils andere** auf dem iPhone eine native Push-Notification — **auch wenn die App geschlossen ist**. Notiz aus dem Satz steht in der Notification.

## Out of Scope

- Push für Wochenabschluss / Goal-Reached (kann später nachgerüstet werden — `weekly_challenges` UPDATE-Webhook genügt)
- Reaktionen-Push
- Android (App ist iOS-only via TestFlight)
- Web Push API auf Safari (Browser-Notifications via Realtime bleiben als Fallback)

---

## Architektur

```
[Phone A loggt Set]
   │  api.addSet() — Supabase JS SDK
   ▼
[Postgres: INSERT INTO sets]
   │  Database Webhook (Supabase Dashboard-Konfig)
   ▼
[Edge Function `notify-set`]
   │  - x-webhook-secret prüfen
   │  - Empfänger = NOT record.athlete
   │  - Category + Emoji laden (service_role)
   │  - Device-Tokens des Empfängers laden
   │  - APNs JWT (ES256) signieren
   │  - HTTP/2 POST an api.push.apple.com pro Token
   │  - 410 Gone → Token löschen
   ▼
[APNs] → [Phone B: Banner mit Notiz]
   │  Tap → App öffnet → Feed-Tab
```

**Foreground-Verhalten:** wenn der Empfänger die App offen hat, unterdrückt iOS den Banner per default. Stattdessen läuft der schon vorhandene `notify()`-Toast (via Realtime). Kein doppeltes Feedback.

**Web-Fallback:** läuft die App im Safari (kein Capacitor-native-Context), bleibt alles wie heute — Realtime + Web Notification API. Keine Regression.

---

## Datenbank

### Neue Tabelle: `device_tokens`

```sql
create table if not exists device_tokens (
  token text primary key,
  athlete text references athletes(name) not null,
  platform text not null check (platform in ('ios','web')),
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists device_tokens_athlete_idx on device_tokens(athlete);

alter table device_tokens enable row level security;

create policy "public read device_tokens" on device_tokens
  for select using (true);
create policy "public insert device_tokens" on device_tokens
  for insert with check (true);
create policy "public update device_tokens" on device_tokens
  for update using (true);
create policy "public delete device_tokens" on device_tokens
  for delete using (true);
```

Rationale `token` als PK: ein physisches Gerät hat genau einen APNs-Token. Wechselt Benny → Jonas auf demselben Gerät, machen wir ein UPSERT, das `athlete` neu setzt.

### Konsistenz mit existierendem Schema

Bestehende Tabellen (`athletes`, `categories`, `weekly_challenges`, `sets`, `reactions`) haben anon-public RLS — wir spiegeln das Pattern. Auth gibt's nicht, App nutzt nur den anon-Key.

---

## Edge Function

**Pfad:** `supabase/functions/notify-set/index.ts`
**Runtime:** Deno (Supabase Standard)

### Eingang

```jsonc
// Supabase Database Webhook payload, type: INSERT, table: sets
{
  "type": "INSERT",
  "table": "sets",
  "schema": "public",
  "record": {
    "id": "...",
    "challenge_id": "...",
    "athlete": "Benny",
    "reps": 50,
    "note": "morgens vor der Arbeit",
    "created_at": "..."
  },
  "old_record": null
}
```

### Logik

1. **Auth:** `x-webhook-secret` Header gegen `WEBHOOK_SECRET` aus Env. Mismatch → 401.
2. **Ignorieren:** wenn `type !== 'INSERT'` oder kein `record` → 200 mit `{ignored: true}`.
3. **Lookup (service_role client):**
   - Challenge → `category_id`
   - Categories → `name`, `emoji`
   - device_tokens WHERE `athlete != record.athlete` → Token-Liste
4. **Payload bauen:**
   - `title`: `"{emoji} {athlete}: +{reps} {category_name}"`
   - `body`: `record.note ? "„" + record.note + """` : ""` (deutsche Anführungszeichen, fett im OS gar nicht relevant)
   - `data`: `{ kind: "set", set_id, challenge_id, athlete }`
5. **JWT bauen (ES256):**
   - Header: `{ alg: "ES256", kid: APNS_KEY_ID }`
   - Payload: `{ iss: APNS_TEAM_ID, iat: now }` (Apple-Doc: <1h gültig)
   - Sign mit `.p8`-Private-Key via WebCrypto SubtleCrypto
6. **Send pro Token:**
   - URL: `APNS_ENV === 'production' ? 'https://api.push.apple.com' : 'https://api.development.push.apple.com'`
   - `POST /3/device/{token}`
   - Headers:
     - `authorization: bearer {jwt}`
     - `apns-topic: {APNS_BUNDLE_ID}`
     - `apns-push-type: alert`
     - `apns-priority: 10`
   - Body:
     ```json
     {
       "aps": {
         "alert": { "title": "…", "body": "…" },
         "sound": "default"
       },
       "kind": "set",
       "set_id": "…",
       "challenge_id": "…",
       "athlete": "…"
     }
     ```
7. **Cleanup:** Response 410 Gone (BadDeviceToken/Unregistered) → DELETE FROM device_tokens WHERE token=...
8. **Response:** `{ sent: N, cleaned: M }` (für Webhook-Log).

### Env-Vars (Supabase secrets)

```
APNS_KEY_ID          # 10 chars, e.g. ABC1234567
APNS_TEAM_ID         # 10 chars, your Apple Developer Team ID
APNS_BUNDLE_ID       # com.bennyjoni.terminator
APNS_PRIVATE_KEY     # full .p8 file contents, multi-line
APNS_ENV             # "production" (TestFlight zählt als production!)
WEBHOOK_SECRET       # random 32-byte hex, frei wählbar
SUPABASE_URL         # auto-provided
SUPABASE_SERVICE_ROLE_KEY  # auto-provided
```

**Wichtig:** TestFlight-Builds nutzen **production APNs**, nicht sandbox. Sandbox brauchst du nur, wenn du via `npx cap run ios` einen Debug-Build aufs Gerät schiebst.

---

## iOS Native

### Capacitor Plugin

```bash
npm install @capacitor/push-notifications@^8
npx cap sync ios
```

Plugin-Autoinstall fügt `ios/App/Podfile.lock` etc. hinzu — manuelle Eingriffe brauchen wir trotzdem:

### Entitlement

**Datei:** `ios/App/App/App.entitlements`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>aps-environment</key>
  <string>production</string>
</dict>
</plist>
```

### AppDelegate

Capacitor 8 erwartet, dass App-Delegate APNs-Events an Plugin weiterleitet:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

Werden in vorhandenes `AppDelegate.swift` eingefügt.

### Xcode-Capabilities

Manuell im Morning-Checklist:
- **Push Notifications** aktivieren (zieht das Entitlement-File ein)
- Bundle ID muss mit Apple Developer App ID matchen

---

## Client-Code

### `data.js` — neue API-Methoden

```js
async upsertDeviceToken({ token, athlete, platform }) {
  // demo mode: no-op
  // supabase: upsert into device_tokens by token
},
async deleteDeviceToken(token) {
  // delete from device_tokens where token = ...
}
```

### `app.jsx` — Registrierungs-Flow

Neuer `useEffect` (nur Native-Path):

```js
useEffect(() => {
  if (!me || !window.PTPushNotifications) return;  // not native
  if (!t.notifications) {
    // Toggle OFF → Token löschen
    const saved = localStorage.getItem('pt_apns_token');
    if (saved) {
      api.deleteDeviceToken(saved);
      localStorage.removeItem('pt_apns_token');
    }
    return;
  }

  let removeListeners = () => {};

  (async () => {
    const Push = window.PTPushNotifications.PushNotifications;
    const perm = await Push.checkPermissions();
    if (perm.receive === 'prompt') {
      const req = await Push.requestPermissions();
      if (req.receive !== 'granted') return;
    } else if (perm.receive !== 'granted') {
      return;
    }
    await Push.register();

    const onReg = await Push.addListener('registration', (info) => {
      api.upsertDeviceToken({ token: info.value, athlete: me, platform: 'ios' });
      localStorage.setItem('pt_apns_token', info.value);
    });
    const onTap = await Push.addListener('pushNotificationActionPerformed', () => {
      window.dispatchEvent(new CustomEvent('pt:nav-feed'));
    });
    // foreground push: no-op, existing realtime toast handles it
    removeListeners = () => { onReg.remove(); onTap.remove(); };
  })();

  return () => removeListeners();
}, [me, t.notifications, api]);
```

Tap-Routing:

```js
useEffect(() => {
  const onNavFeed = () => setTab('feed');
  window.addEventListener('pt:nav-feed', onNavFeed);
  return () => window.removeEventListener('pt:nav-feed', onNavFeed);
}, []);
```

### `index.html` — Plugin global expose

Capacitor-Plugins werden über den nativen Bridge angesprochen. Das aus `jsdelivr` geladene ESM ist nur der dünne JS-Wrapper; auf Web wirft jede Methode einen `UNIMPLEMENTED`-Error. Wir markieren `PTPushNotifications` deshalb nur dann als nutzbar, wenn der Capacitor-Bridge anzeigt, dass wir auf Native laufen.

```html
<script type="module">
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@capacitor/push-notifications@7/+esm');
    if (window.Capacitor?.isNativePlatform?.()) {
      window.PTPushNotifications = mod;
    } else {
      window.PTPushNotifications = null;
    }
  } catch (e) {
    window.PTPushNotifications = null;
  }
</script>
```

**Version:** wir installieren `@capacitor/push-notifications@^7` (kompatibel mit Capacitor Core 8.x — wird beim `npm install` resolved). Sollte `@8` stabil vorhanden sein, gerne hochziehen.

---

## Tests / Verifikation

Da TestFlight + zwei echte iPhones gebraucht werden, ist Vollverifikation nur möglich nach dem Morning-Setup. Was Claude in der Nacht verifizieren kann:

- Edge Function lokal testen: `supabase functions serve notify-set` + curl mit dummy payload → erwarte `{sent:0}` weil keine Tokens
- Migration anwenden: `device_tokens` Tabelle existiert
- App im Web öffnen (kein Capacitor): existing Web-Notif-Flow soll weiterlaufen, keine Crashes

Was im Morning verifiziert werden muss:
- Permission-Prompt erscheint nach erstem Tap
- Token landet in `device_tokens` (SQL `SELECT * FROM device_tokens`)
- Set loggen auf Phone A → Phone B bekommt Banner mit Notiz innerhalb 2s
- Tap auf Banner → App öffnet → Feed-Tab aktiv
- Toggle OFF in Tweaks → Token verschwindet aus DB

---

## Morning-Checklist (User-Action am 2026-05-13)

Siehe separate Datei `docs/PUSH_SETUP_MORNING.md` für Schritt-für-Schritt — kurz:

1. Apple Developer Portal → Keys → APNs Auth Key generieren, `.p8` runterladen, Key ID notieren, Team ID notieren
2. Im App ID `com.bennyjoni.terminator` → Push Notifications capability aktivieren
3. Supabase Dashboard → Edge Functions → secrets setzen (oder via `npx supabase secrets set ...`)
4. Supabase Dashboard → Database → Webhooks → neuer Webhook auf `sets` INSERT → `notify-set`, mit `x-webhook-secret` Header
5. Xcode öffnen, Signing & Capabilities → Push Notifications + Background Modes(Remote notifications) anhaken, Archive → TestFlight Upload
6. Beide iPhones updaten via TestFlight
7. App öffnen, Namen wählen, Tap irgendwo → Permission akzeptieren
8. Anderes Phone loggt einen Set → Banner muss kommen

---

## Risiken

- **APNs JWT-Signing in Deno:** WebCrypto SubtleCrypto kann ES256 — aber das `.p8`-Format ist PEM-PKCS8, muss erst dekodiert werden. Es gibt etablierte Deno-Snippets dafür, ich nehme die.
- **Token-Drift:** wenn User TestFlight neu installiert, kriegt das Phone einen neuen Token. Alte Tokens werden bei nächstem Push als 410 erkannt und gelöscht. Self-healing.
- **Webhook-Retries:** Supabase Database Webhooks retryen bei Non-2xx. Wir geben immer 200 zurück, außer bei 401-Auth — damit kein Loop.
- **Latenz:** APNs zu Bestzeiten ~1s, manchmal bis 30s. Akzeptabel für „workout logged"-Use-Case.
- **Race Condition Login + Notification:** wenn User in Sekunde 1 Namen wählt und in Sekunde 2 ein Set kommt, ist der Token vielleicht noch nicht registriert. Edge Case, ignorieren.
