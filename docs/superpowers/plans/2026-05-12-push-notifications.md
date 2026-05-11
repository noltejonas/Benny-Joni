# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver native iOS push notifications via APNs when one athlete logs a workout set, with the set's note in the alert body and tap-to-feed routing.

**Architecture:** Supabase Database Webhook on `sets` INSERT → Edge Function `notify-set` → APNs HTTP/2 with ES256 JWT. Client uses `@capacitor/push-notifications` to register a device token, upserted into a new `device_tokens` table.

**Tech Stack:** Capacitor 8 (iOS), `@capacitor/push-notifications@^7`, Supabase (Postgres + Edge Functions / Deno), APNs HTTP/2 + ES256 JWT.

---

## File Map

**Create:**
- `supabase/migrations/20260512000000_device_tokens.sql` — Migration (kept under git for replay)
- `supabase/functions/notify-set/index.ts` — Webhook handler
- `supabase/functions/notify-set/apns.ts` — APNs JWT signer + sender
- `supabase/functions/notify-set/deno.json` — Deno import map (optional but tidy)
- `ios/App/App/App.entitlements` — `aps-environment = production`
- `www/SETUP_PUSH.sql` — Human-readable copy of the migration (for manual replay)
- `docs/PUSH_SETUP_MORNING.md` — Morning checklist for the user

**Modify:**
- `package.json` — Add `@capacitor/push-notifications`
- `package-lock.json` — npm install result
- `www/index.html` — Expose `window.PTPushNotifications`
- `www/data.js` — Add `upsertDeviceToken` + `deleteDeviceToken` to both demo + Supabase APIs
- `www/app.jsx` — Registration + foreground/tap useEffects
- `ios/App/App/AppDelegate.swift` — APNs delegate forwarding methods
- `ios/App/App.xcodeproj/project.pbxproj` — Link `App.entitlements` (if not auto-linked by Capacitor)

---

## Task 1 — Database migration: `device_tokens`

**Files:**
- Create: `supabase/migrations/20260512000000_device_tokens.sql`
- Create: `www/SETUP_PUSH.sql` (mirror, for human reference)
- Apply: via Supabase MCP `apply_migration`

- [ ] **Step 1.1 — Write migration SQL**

Create `supabase/migrations/20260512000000_device_tokens.sql`:

```sql
-- Push notification device tokens (APNs etc.)
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

- [ ] **Step 1.2 — Mirror to `www/SETUP_PUSH.sql`**

Copy the same SQL content to `www/SETUP_PUSH.sql` so the user can replay it manually if needed (matches the `SETUP_REACTIONS.sql` pattern already in repo).

- [ ] **Step 1.3 — Apply migration via Supabase MCP**

Use `mcp__1069aeee-..._apply_migration` with `name="device_tokens"` and the SQL above. Project ref from the existing `SUPABASE_URL` in `www/app.jsx:5` (`jczyyupxxqrdgbeifcwe`).

- [ ] **Step 1.4 — Verify**

Run `mcp__..._execute_sql` with `select count(*) from device_tokens;` and confirm `0`.

- [ ] **Step 1.5 — Commit**

```bash
git add supabase/migrations/20260512000000_device_tokens.sql www/SETUP_PUSH.sql
git commit -m "feat(push): add device_tokens table"
```

---

## Task 2 — Edge Function: `notify-set` (APNs sender)

**Files:**
- Create: `supabase/functions/notify-set/index.ts`
- Create: `supabase/functions/notify-set/apns.ts`
- Create: `supabase/functions/notify-set/deno.json`
- Deploy: via Supabase MCP `deploy_edge_function`

- [ ] **Step 2.1 — Write `apns.ts` (JWT + send helper)**

Create `supabase/functions/notify-set/apns.ts`:

```typescript
// APNs HTTP/2 sender + ES256 JWT signer for Supabase Edge Functions.

const APNS_PROD = "https://api.push.apple.com";
const APNS_DEV = "https://api.development.push.apple.com";

interface JwtOptions {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
}

let cachedJwt: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importApnsKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pemToPkcs8(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export async function buildApnsJwt(opts: JwtOptions): Promise<string> {
  // APNs JWTs may be reused for up to 1h; cache for 50min to be safe.
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token;

  const header = { alg: "ES256", kid: opts.keyId };
  const payload = { iss: opts.teamId, iat: now };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const key = await importApnsKey(opts.privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data),
  );
  const sigB64 = base64UrlEncode(sig);

  const token = `${data}.${sigB64}`;
  cachedJwt = { token, expiresAt: now + 50 * 60 };
  return token;
}

export interface ApnsSendInput {
  deviceToken: string;
  jwt: string;
  bundleId: string;
  env: "production" | "development";
  payload: Record<string, unknown>;
}

export interface ApnsSendResult {
  deviceToken: string;
  status: number;
  body: string;
  reason?: string;
}

export async function sendApns(input: ApnsSendInput): Promise<ApnsSendResult> {
  const host = input.env === "production" ? APNS_PROD : APNS_DEV;
  const url = `${host}/3/device/${input.deviceToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${input.jwt}`,
      "apns-topic": input.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });
  const body = await res.text();
  let reason: string | undefined;
  try {
    reason = body ? JSON.parse(body).reason : undefined;
  } catch (_) {
    /* ignore non-JSON */
  }
  return { deviceToken: input.deviceToken, status: res.status, body, reason };
}
```

- [ ] **Step 2.2 — Write `index.ts` (handler)**

Create `supabase/functions/notify-set/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildApnsJwt, sendApns } from "./apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID")!;
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY")!;
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production") as
  | "production"
  | "development";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

interface SetRecord {
  id: string;
  challenge_id: string;
  athlete: string;
  reps: number;
  note: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: SetRecord | null;
  old_record: SetRecord | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch (_) {
    return new Response("invalid json", { status: 400 });
  }

  if (payload.type !== "INSERT" || !payload.record) {
    return Response.json({ ignored: true });
  }
  const record = payload.record;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Lookup category via challenge → categories
  const { data: challenge } = await supabase
    .from("weekly_challenges")
    .select("category_id")
    .eq("id", record.challenge_id)
    .maybeSingle();

  let categoryName = "Reps";
  let categoryEmoji = "💪";
  if (challenge?.category_id) {
    const { data: category } = await supabase
      .from("categories")
      .select("name, emoji")
      .eq("id", challenge.category_id)
      .maybeSingle();
    if (category) {
      categoryName = category.name ?? categoryName;
      categoryEmoji = category.emoji ?? categoryEmoji;
    }
  }

  // Recipients = every device whose athlete differs from the actor
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .neq("athlete", record.athlete);

  const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios");
  if (iosTokens.length === 0) {
    return Response.json({ sent: 0, cleaned: 0, reason: "no recipients" });
  }

  const title = `${categoryEmoji} ${record.athlete}: +${record.reps} ${categoryName}`;
  const body = record.note ? `„${record.note}"` : "";

  const apsPayload = {
    aps: {
      alert: body ? { title, body } : { title },
      sound: "default",
    },
    kind: "set",
    set_id: record.id,
    challenge_id: record.challenge_id,
    athlete: record.athlete,
  };

  const jwt = await buildApnsJwt({
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    privateKeyPem: APNS_PRIVATE_KEY,
  });

  const results = await Promise.all(
    iosTokens.map((t) =>
      sendApns({
        deviceToken: t.token,
        jwt,
        bundleId: APNS_BUNDLE_ID,
        env: APNS_ENV,
        payload: apsPayload,
      })
    ),
  );

  const dead = results
    .filter((r) => r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered")
    .map((r) => r.deviceToken);

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }

  const sent = results.filter((r) => r.status === 200).length;
  return Response.json({
    sent,
    cleaned: dead.length,
    attempted: results.length,
    failures: results
      .filter((r) => r.status !== 200)
      .map((r) => ({ status: r.status, reason: r.reason })),
  });
});
```

- [ ] **Step 2.3 — Write `deno.json` (optional metadata)**

Create `supabase/functions/notify-set/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.4"
  }
}
```

- [ ] **Step 2.4 — Deploy via Supabase MCP**

Use `mcp__1069aeee-..._deploy_edge_function` with the project ref + the three files (`index.ts`, `apns.ts`, `deno.json`).

- [ ] **Step 2.5 — Commit**

```bash
git add supabase/functions/notify-set/
git commit -m "feat(push): add notify-set Edge Function (APNs HTTP/2 + ES256 JWT)"
```

---

## Task 3 — Install Capacitor plugin + sync iOS

**Files:**
- Modify: `package.json`, `package-lock.json`
- Auto-modify: `ios/App/Podfile`, `ios/App/Podfile.lock`, `ios/App/App.xcworkspace`

- [ ] **Step 3.1 — Install plugin**

```bash
npm install @capacitor/push-notifications@^7
```

If npm errors that v7 is incompatible with Capacitor 8 core, fall back to:

```bash
npm install @capacitor/push-notifications@latest
```

- [ ] **Step 3.2 — Sync iOS**

```bash
npx cap sync ios
```

Expected: `Found 1 Capacitor plugin for ios: @capacitor/push-notifications@x.y.z` and no errors. Pods are updated.

- [ ] **Step 3.3 — Commit**

```bash
git add package.json package-lock.json ios/
git commit -m "feat(push): install @capacitor/push-notifications + cap sync ios"
```

---

## Task 4 — iOS native: entitlements + AppDelegate

**Files:**
- Create: `ios/App/App/App.entitlements`
- Modify: `ios/App/App/AppDelegate.swift`
- Maybe modify: `ios/App/App.xcodeproj/project.pbxproj` (entitlement file reference — Capacitor sync usually doesn't add this automatically for new files; the user adds it via Xcode "Signing & Capabilities → Push Notifications" in the morning, which Xcode does for them).

- [ ] **Step 4.1 — Create entitlements file**

Create `ios/App/App/App.entitlements`:

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

Note: if Xcode generates a new entitlements file via the Push Capability checkbox in the morning, it'll be functionally identical. Both is fine — Xcode reconciles.

- [ ] **Step 4.2 — Add APNs delegate methods to AppDelegate.swift**

Edit `ios/App/App/AppDelegate.swift`. Insert these two methods inside the `AppDelegate` class, right before the closing brace:

```swift
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
```

- [ ] **Step 4.3 — Commit**

```bash
git add ios/App/App/App.entitlements ios/App/App/AppDelegate.swift
git commit -m "feat(push): add iOS APNs entitlement + AppDelegate forwarding"
```

---

## Task 5 — Data layer: token APIs

**Files:**
- Modify: `www/data.js`

- [ ] **Step 5.1 — Add demo-mode no-ops**

In the `createDemoAPI()` return object (around line 200, before `onChange`), insert:

```js
      async upsertDeviceToken(_payload) { /* no-op in demo mode */ },
      async deleteDeviceToken(_token) { /* no-op in demo mode */ },
```

- [ ] **Step 5.2 — Add Supabase impls**

In the `createSupabaseAPI()` return object (after `setRotationConfig`, before `onChange`), insert:

```js
      async upsertDeviceToken({ token, athlete, platform }) {
        const { data, error } = await client.from('device_tokens')
          .upsert({ token, athlete, platform, last_seen: new Date().toISOString() }, { onConflict: 'token' })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async deleteDeviceToken(token) {
        const { error } = await client.from('device_tokens').delete().eq('token', token);
        if (error) throw error;
      },
```

- [ ] **Step 5.3 — Commit**

```bash
git add www/data.js
git commit -m "feat(push): add upsertDeviceToken + deleteDeviceToken APIs"
```

---

## Task 6 — `www/index.html`: expose Push plugin globally

**Files:**
- Modify: `www/index.html`

- [ ] **Step 6.1 — Add Push plugin module loader**

In `www/index.html`, immediately after the existing `<script type="module">` block that loads Haptics, append a sibling `<script type="module">` block:

```html
  <script type="module">
    // Only expose when running inside Capacitor native; web has no implementation.
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

- [ ] **Step 6.2 — Commit**

```bash
git add www/index.html
git commit -m "feat(push): expose @capacitor/push-notifications on window.PTPushNotifications"
```

---

## Task 7 — `www/app.jsx`: registration + tap routing

**Files:**
- Modify: `www/app.jsx`

- [ ] **Step 7.1 — Add registration useEffect**

After the existing notification-permission useEffect (around line 193, which ends `}, [me, t.notifications]);`), insert a new useEffect block:

```jsx
  // Native APNs registration (Capacitor only — web uses the existing Notification API path above)
  useEffect(() => {
    if (!me) return;
    const Push = window.PTPushNotifications?.PushNotifications;
    if (!Push) return; // not running natively

    if (!t.notifications) {
      const saved = localStorage.getItem('pt_apns_token');
      if (saved) {
        api.deleteDeviceToken(saved).catch(() => {});
        localStorage.removeItem('pt_apns_token');
      }
      return;
    }

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        const perm = await Push.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          const req = await Push.requestPermissions();
          if (req.receive !== 'granted') return;
        } else if (perm.receive !== 'granted') {
          return;
        }
        if (cancelled) return;
        await Push.register();

        const onReg = await Push.addListener('registration', async (info) => {
          try {
            await api.upsertDeviceToken({ token: info.value, athlete: me, platform: 'ios' });
            localStorage.setItem('pt_apns_token', info.value);
          } catch (e) { console.warn('upsertDeviceToken failed', e); }
        });
        const onErr = await Push.addListener('registrationError', (e) => {
          console.warn('Push registrationError', e);
        });
        const onTap = await Push.addListener('pushNotificationActionPerformed', () => {
          window.dispatchEvent(new CustomEvent('pt:nav-feed'));
        });
        // Foreground deliveries: do nothing — Realtime + existing notify() toast handles it.

        cleanup = () => { onReg.remove(); onErr.remove(); onTap.remove(); };
      } catch (e) { console.warn('Push setup failed', e); }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [me, t.notifications, api]);
```

- [ ] **Step 7.2 — Add tap-routing useEffect**

In the same file, right after the new registration useEffect, insert:

```jsx
  // Tap on push → switch to Feed tab
  useEffect(() => {
    const onNavFeed = () => setTab('feed');
    window.addEventListener('pt:nav-feed', onNavFeed);
    return () => window.removeEventListener('pt:nav-feed', onNavFeed);
  }, []);
```

- [ ] **Step 7.3 — Commit**

```bash
git add www/app.jsx
git commit -m "feat(push): register device token + tap-to-feed routing"
```

---

## Task 8 — Morning checklist for the user

**Files:**
- Create: `docs/PUSH_SETUP_MORNING.md`

- [ ] **Step 8.1 — Write checklist**

Create `docs/PUSH_SETUP_MORNING.md` with step-by-step instructions covering:

1. Generate APNs Auth Key (`.p8`) in Apple Developer → Keys, note Key ID + Team ID
2. Enable Push Notifications capability on App ID `com.bennyjoni.terminator`
3. Set Edge Function secrets:
   ```bash
   npx supabase login
   npx supabase link --project-ref jczyyupxxqrdgbeifcwe
   npx supabase secrets set \
     APNS_KEY_ID=XXXXXXXXXX \
     APNS_TEAM_ID=YYYYYYYYYY \
     APNS_BUNDLE_ID=com.bennyjoni.terminator \
     APNS_ENV=production \
     WEBHOOK_SECRET=$(openssl rand -hex 32)
   # And the multi-line .p8:
   npx supabase secrets set APNS_PRIVATE_KEY="$(cat /path/to/AuthKey_XXXXXXXXXX.p8)"
   ```
4. Create Database Webhook in Supabase Dashboard → Database → Webhooks:
   - Name: `notify-set-insert`
   - Table: `sets`, Events: `INSERT`
   - Type: Supabase Edge Functions → `notify-set`
   - HTTP Headers: `x-webhook-secret: <same value as WEBHOOK_SECRET>`
5. In Xcode → Signing & Capabilities → `+ Capability` → `Push Notifications` (and optionally `Background Modes → Remote notifications`). Archive → Distribute → TestFlight.
6. Both phones: install via TestFlight, open app, choose name, tap once → accept permission prompt.
7. Verify: log a set on phone A → phone B banner within ~2s, note visible.

- [ ] **Step 8.2 — Commit**

```bash
git add docs/PUSH_SETUP_MORNING.md
git commit -m "docs(push): morning setup checklist"
```

---

## Self-Review Coverage

| Spec section | Task |
|---|---|
| device_tokens schema | Task 1 |
| Edge Function logic + JWT + APNs send | Task 2 |
| Capacitor plugin install | Task 3 |
| iOS entitlement + AppDelegate forwarding | Task 4 |
| Token upsert/delete API | Task 5 |
| Web bridge for plugin | Task 6 |
| Registration flow + foreground handling + tap | Task 7 |
| User morning steps (APNs key, secrets, webhook) | Task 8 |

All spec items have a task. No placeholders remain. Method names consistent (`upsertDeviceToken`, `deleteDeviceToken`, `notify-set`, `pt_apns_token` localStorage key, `pt:nav-feed` event).
