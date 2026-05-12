# Rival-Push Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wenn die andere Person heute mehr als 100 Reps geloggt hat und ich heute noch 0 stehe, kriege ich eine einzige APNs-Push-Notification pro Tag. Ersetzt das bisherige „jeder Set löst Push aus"-Verhalten.

**Architecture:** Supabase Postgres trigger auf `sets` INSERT ruft via `pg_net` die Edge-Function `notify-set`. Funktion prüft Sender-Tageszahl (RPC `athlete_reps_today`), Empfänger-Tageszahl, dedup via `push_log` PK-Conflict, sendet dann APNs. Settings-UI bekommt sichtbaren Notifications-Toggle.

**Tech Stack:** Postgres + pg_net Extension, Deno Edge Function, supabase-js Service-Role-Client, APNs HTTP/2 (existing JWT signer), React (Settings-Card).

**Spec:** `docs/superpowers/specs/2026-05-12-rival-push-design.md`

**Supabase Project ID:** `jczyyupxxqrdgbeifcwe`

---

## File Structure

**New files:**
- `supabase/migrations/20260512100000_rival_push.sql` — DB-Setup: pg_net, push_log Tabelle, Helper-Funktionen (`athlete_reps_today`, `berlin_today`), Trigger-Funktion und Trigger auf `sets`

**Modified files:**
- `supabase/functions/notify-set/index.ts` — Threshold-Checks + push_log-Dedup + neuer Notification-Text vor dem bestehenden APNs-Code
- `www/settings.jsx` — `NotificationsCard` neu, `SettingsScreen`-Signatur akzeptiert `t` und `setTweak`
- `www/app.jsx` — Reicht `t` und `setTweak` an `SettingsScreen` durch

**No tests changed:** Codebase hat kein automatisiertes Test-Framework. Verifikation erfolgt via SQL-Queries, curl-Calls gegen die Edge-Function und manuelle Smoke-Tests in der Browser-Vorschau.

---

## Task 1: DB-Migration — pg_net, push_log, Helper-Funktionen, Trigger

**Files:**
- Create: `supabase/migrations/20260512100000_rival_push.sql`

- [ ] **Step 1.1: Migration-Datei schreiben**

Inhalt von `supabase/migrations/20260512100000_rival_push.sql`:

```sql
-- 1. pg_net extension (async HTTP from Postgres)
create extension if not exists pg_net with schema extensions;

-- 2. push_log: dedup table. Composite PK garantiert max 1 Push pro
--    (athlete, kind, day) — Doppelsendung wird als unique_violation gefangen.
create table if not exists push_log (
  athlete text not null references athletes(name) on delete cascade,
  kind text not null,
  day date not null,
  created_at timestamptz default now(),
  primary key (athlete, kind, day)
);

create index if not exists push_log_day_idx on push_log(day);

alter table push_log enable row level security;
create policy "public read push_log" on push_log for select using (true);
create policy "public write push_log" on push_log for all using (true) with check (true);

-- 3. Helper: Tagessumme pro Athlet in Europe/Berlin-Zeitzone
create or replace function public.athlete_reps_today(p_athlete text)
  returns int
  language sql stable as $$
  select coalesce(sum(reps), 0)::int
  from sets
  where athlete = p_athlete
    and (created_at at time zone 'Europe/Berlin')::date
        = (now() at time zone 'Europe/Berlin')::date
$$;

-- 4. Helper: heutiges Datum in Berlin (für push_log.day)
create or replace function public.berlin_today() returns date
  language sql stable as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;

-- 5. Trigger-Funktion: ruft Edge-Function via pg_net
create or replace function public.notify_set_inserted() returns trigger
  language plpgsql security definer as $$
declare
  fn_url constant text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
  secret text := current_setting('app.webhook_secret', true);
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'sets',
    'schema', 'public',
    'record', to_jsonb(NEW),
    'old_record', null
  );
  perform net.http_post(
    url := fn_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(secret, '')
    )
  );
  return NEW;
end;
$$;

drop trigger if exists notify_set_after_insert on sets;
create trigger notify_set_after_insert
  after insert on sets
  for each row execute function public.notify_set_inserted();

-- 6. Webhook-Secret in Postgres-Config setzen (falls noch nicht). Wert wird
--    aus der Supabase-Edge-Function-Env gespiegelt; muss matchen.
--    Setze manuell (nicht in der Migration), wenn Secret bekannt:
--      alter database postgres set app.webhook_secret = '<dein-secret>';
```

- [ ] **Step 1.2: Migration anwenden**

Tool: `mcp__claude_ai_Supabase__apply_migration`
- `project_id`: `jczyyupxxqrdgbeifcwe`
- `name`: `rival_push`
- `query`: Inhalt der Datei (komplette SQL oben)

Expected: `{"success":true}`

- [ ] **Step 1.3: Verify push_log + Trigger existieren**

Tool: `mcp__claude_ai_Supabase__execute_sql`

```sql
select 'push_log' as obj where exists (select 1 from pg_class where relname='push_log' and relnamespace='public'::regnamespace)
union all
select 'trigger' where exists (select 1 from pg_trigger where tgname='notify_set_after_insert')
union all
select 'pg_net' where exists (select 1 from pg_extension where extname='pg_net');
```

Expected: drei Zeilen — `push_log`, `trigger`, `pg_net`.

- [ ] **Step 1.4: Helper-Funktionen smoketesten**

```sql
select berlin_today() as today,
       athlete_reps_today('Benny') as benny_today,
       athlete_reps_today('Jonas') as jonas_today;
```

Expected: heutiges Datum + zwei Zahlen (>= 0, je nach Aktivität).

- [ ] **Step 1.5: Webhook-Secret in DB setzen**

Erst `WEBHOOK_SECRET`-Wert aus den Supabase-Function-Env lesen (Dashboard → Edge Functions → notify-set → secrets). Falls noch nicht gesetzt: neuen 32-byte-Hex generieren und sowohl als Function-Secret als auch in der DB hinterlegen.

```sql
-- Hier mit dem realen Secret ersetzen:
alter database postgres set app.webhook_secret = '<das-secret>';
```

Run als execute_sql.

Verify:
```sql
show app.webhook_secret;
```

Expected: Das Secret als Wert.

- [ ] **Step 1.6: Commit**

```bash
git add supabase/migrations/20260512100000_rival_push.sql
git commit -m "feat(db): add push_log, helpers, and trigger for rival push"
```

---

## Task 2: Edge-Function — Threshold-Checks + Dedup

**Files:**
- Modify: `supabase/functions/notify-set/index.ts`

- [ ] **Step 2.1: Aktuellen Stand lesen**

Read: `supabase/functions/notify-set/index.ts` — Pflicht-Refresher vor dem Edit.

- [ ] **Step 2.2: Neuen `index.ts` schreiben**

Ersetze den gesamten Inhalt von `supabase/functions/notify-set/index.ts` durch:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildApnsJwt, sendApns } from "./apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.bennyjoni.terminator";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production") as
  | "production"
  | "development";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const RIVAL_THRESHOLD = 100;

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

function otherAthlete(name: string): string {
  return name === "Benny" ? "Jonas" : "Benny";
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
    return Response.json({ ignored: true, reason: "not_insert" });
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    return Response.json({ ignored: true, reason: "apns_not_configured" });
  }

  const record = payload.record;
  const recipient = otherAthlete(record.athlete);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 1. Sender-Tageszahl prüfen ───────────────────────────────────────────
  const { data: senderToday, error: senderErr } = await supabase.rpc(
    "athlete_reps_today",
    { p_athlete: record.athlete },
  );
  if (senderErr) {
    return Response.json({ error: "sender_rpc", detail: senderErr.message }, { status: 500 });
  }
  if ((senderToday ?? 0) <= RIVAL_THRESHOLD) {
    return Response.json({
      ignored: true,
      reason: "sender_below_threshold",
      senderToday,
      threshold: RIVAL_THRESHOLD,
    });
  }

  // ── 2. Empfänger-Tageszahl prüfen ────────────────────────────────────────
  const { data: recipientToday, error: recipientErr } = await supabase.rpc(
    "athlete_reps_today",
    { p_athlete: recipient },
  );
  if (recipientErr) {
    return Response.json({ error: "recipient_rpc", detail: recipientErr.message }, { status: 500 });
  }
  if ((recipientToday ?? 0) > 0) {
    return Response.json({
      ignored: true,
      reason: "recipient_active",
      recipientToday,
    });
  }

  // ── 3. Heute-Datum (Berlin) abrufen ──────────────────────────────────────
  const { data: today, error: todayErr } = await supabase.rpc("berlin_today");
  if (todayErr || !today) {
    return Response.json({ error: "today_rpc", detail: todayErr?.message }, { status: 500 });
  }

  // ── 4. Dedup: push_log-Insert claimed den Slot ───────────────────────────
  const { error: logErr } = await supabase
    .from("push_log")
    .insert({ athlete: recipient, kind: "rival", day: today });
  if (logErr) {
    if (logErr.code === "23505") {
      return Response.json({ ignored: true, reason: "already_sent_today" });
    }
    return Response.json({ error: "log_insert", detail: logErr.message }, { status: 500 });
  }

  // ── 5. Empfänger-Tokens laden ────────────────────────────────────────────
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .eq("athlete", recipient);

  const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios");
  if (iosTokens.length === 0) {
    return Response.json({
      sent: 0,
      reason: "no_recipient_tokens",
      logged: true,
    });
  }

  // ── 6. APNs-Push ─────────────────────────────────────────────────────────
  const title = `🔥 ${record.athlete} ist los`;
  const body = `Schon ${senderToday} Reps heute — du noch bei 0.`;

  const apsPayload = {
    aps: {
      alert: { title, body },
      sound: "default",
    },
    kind: "rival",
    athlete: record.athlete,
    sender_today: senderToday,
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
    .filter((r) =>
      r.status === 410 ||
      r.reason === "BadDeviceToken" ||
      r.reason === "Unregistered"
    )
    .map((r) => r.deviceToken);

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }

  const sent = results.filter((r) => r.status === 200).length;
  return Response.json({
    sent,
    cleaned: dead.length,
    attempted: results.length,
    senderToday,
    failures: results
      .filter((r) => r.status !== 200)
      .map((r) => ({ status: r.status, reason: r.reason })),
  });
});
```

Key changes vs old version:
- Neue Konstante `RIVAL_THRESHOLD = 100`
- Neue Helper `otherAthlete`
- Drei Pre-Send-Checks via RPC, dann Insert-as-claim, dann Token-Lookup & Send
- Token-Lookup nun explizit auf `athlete = recipient` (vorher: `!= sender`, was bei mehreren Athleten unsicher gewesen wäre)
- Notification-Text neu: „🔥 X ist los" / „Schon N Reps heute — du noch bei 0."
- `kind: "rival"` im APS-Payload (anstatt `"set"`)
- `record.note` wird nicht mehr genutzt (Tages-Summe macht Notiz unsinnig)

- [ ] **Step 2.3: Edge-Function deployen**

Tool: `mcp__claude_ai_Supabase__deploy_edge_function`
- `project_id`: `jczyyupxxqrdgbeifcwe`
- `slug`: `notify-set`
- `entrypoint_path`: `index.ts`
- `import_map_path`: `deno.json`
- `verify_jwt`: false
- `files`: [
    { name: `index.ts`, content: (kompletter Inhalt aus Step 2.2) },
    { name: `apns.ts`, content: (unverändert aus aktuellem Repo-Stand) },
    { name: `deno.json`, content: (unverändert) }
  ]

Tipp: vorher `mcp__claude_ai_Supabase__get_edge_function` mit slug `notify-set` aufrufen, um `apns.ts` und `deno.json` als Strings zu bekommen — die werden 1:1 mitgedeployed.

Expected: `{"status":"ACTIVE", ...}`

- [ ] **Step 2.4: Curl-Test 1 — Sender unter Schwelle**

Schritt 1: WEBHOOK_SECRET-Wert besorgen (aus Supabase Dashboard secrets oder per Bash auf der Maschine, falls dort gespeichert).

```bash
SECRET="<das-secret>"
URL="https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set"

# Sender = Benny, hat heute (z.B.) noch unter 100 Reps → ignored
curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $SECRET" \
  -d '{
    "type": "INSERT",
    "table": "sets",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "challenge_id": "00000000-0000-0000-0000-000000000002",
      "athlete": "Benny",
      "reps": 10,
      "note": null,
      "created_at": "2026-05-12T10:00:00Z"
    },
    "old_record": null
  }'
```

Expected: JSON mit `"ignored": true` und `"reason": "sender_below_threshold"` (falls Benny heute insgesamt <=100 Reps hat).

Wichtig: Der Test sendet **keinen** neuen Set in die DB — er ruft nur die Edge Function manuell auf. Die `sets`-Tabelle wird nur via Trigger eingeflochten, wenn ein echter `INSERT` passiert.

- [ ] **Step 2.5: Curl-Test 2 — Dedup-Pfad smoketesten**

Wenn Benny heute >100 Reps **und** Jonas heute >0 Reps hat, ist der Empfänger-Pfad blockiert. Wenn beide Bedingungen erfüllt sind (Benny>100, Jonas=0), feuert der Push einmal und der zweite Aufruf wird mit `already_sent_today` geignored.

Zum Verifizieren des Dedup-Pfads (ohne echte Pushes zu senden) kann man manuell einen `push_log`-Eintrag anlegen und dann curl ausführen:

```sql
-- Tool: mcp__claude_ai_Supabase__execute_sql
insert into push_log (athlete, kind, day)
  values (
    case when (select coalesce(sum(reps),0) from sets where athlete='Benny' and (created_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date) > 100
         then 'Jonas' else 'Benny' end,
    'rival',
    (now() at time zone 'Europe/Berlin')::date
  )
  on conflict do nothing;
```

Dann curl wie in Step 2.4 mit dem Sender, dessen Gegenüber im push_log steht. Expected: `"reason": "already_sent_today"`.

Nach dem Test: Eintrag wieder löschen.

```sql
delete from push_log where kind='rival' and day = (now() at time zone 'Europe/Berlin')::date;
```

- [ ] **Step 2.6: Edge-Function-Logs prüfen**

Tool: `mcp__claude_ai_Supabase__get_logs`
- `project_id`: `jczyyupxxqrdgbeifcwe`
- `service`: `edge-function`

Expected: pro Curl-Call einen Log-Eintrag, kein 5xx, alle Calls mit 200.

- [ ] **Step 2.7: Commit**

```bash
git add supabase/functions/notify-set/index.ts
git commit -m "feat(edge): dose notify-set to rival-only with daily dedup"
```

---

## Task 3: Settings-UI — NotificationsCard

**Files:**
- Modify: `www/settings.jsx`
- Modify: `www/app.jsx`

- [ ] **Step 3.1: `NotificationsCard` in `settings.jsx` definieren**

Suche in `www/settings.jsx` die Zeile mit `function AppearanceCard() {`. Direkt **nach** der schließenden `}` von `AppearanceCard` (also vor `function SettingsScreen`) folgendes einfügen:

```jsx
function NotificationsCard({ enabled, onChange }) {
  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <div>
          <div className="label" style={{margin:0}}>Benachrichtigungen</div>
          <div className="subtitle" style={{fontSize:13,marginTop:2}}>
            Push, wenn der/die andere heute schon >100 Reps hat und du noch bei 0 bist. Max 1×/Tag.
          </div>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={!!enabled} onChange={e => onChange(e.target.checked)}/>
          <span className="toggle-slider"/>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2: `SettingsScreen`-Signatur erweitern**

In `www/settings.jsx`, finde:

```jsx
function SettingsScreen({ api, categories, onAddCategory }) {
```

Ersetze durch:

```jsx
function SettingsScreen({ api, categories, onAddCategory, notificationsEnabled, onSetNotifications }) {
```

- [ ] **Step 3.3: NotificationsCard in den Render-Tree einbauen**

Im selben File, im JSX-Return von `SettingsScreen`, suche:

```jsx
  return (
    <div>
      <AppearanceCard />
      <div className="card">
```

Ersetze durch:

```jsx
  return (
    <div>
      <AppearanceCard />
      <NotificationsCard enabled={notificationsEnabled} onChange={onSetNotifications}/>
      <div className="card">
```

- [ ] **Step 3.4: Export von `NotificationsCard` ergänzen**

Im selben File, suche die letzte Zeile:

```jsx
Object.assign(window, { SettingsScreen, PlanSlotRow, WeekFixCard, AppearanceCard });
```

Ersetze durch:

```jsx
Object.assign(window, { SettingsScreen, PlanSlotRow, WeekFixCard, AppearanceCard, NotificationsCard });
```

- [ ] **Step 3.5: Props in `app.jsx` durchreichen**

In `www/app.jsx`, suche:

```jsx
        {tab === 'settings' &&
        <SettingsScreen api={api} categories={categories} onAddCategory={reload} />
        }
```

Ersetze durch:

```jsx
        {tab === 'settings' &&
        <SettingsScreen api={api} categories={categories} onAddCategory={reload}
          notificationsEnabled={t.notifications}
          onSetNotifications={(v) => setTweak('notifications', v)} />
        }
```

- [ ] **Step 3.6: JSX babel-transformieren als Smoke-Test**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios
node -e "
const babel = require('@babel/standalone');
const fs = require('fs');
for (const f of ['settings.jsx', 'app.jsx']) {
  const src = fs.readFileSync('www/' + f, 'utf8');
  try { babel.transform(src, { presets: ['react'] }); console.log(f + ': OK'); }
  catch (e) { console.log(f + ': FAIL ' + e.message.split('\n')[0]); process.exit(1); }
}
"
```

Expected:
```
settings.jsx: OK
app.jsx: OK
```

- [ ] **Step 3.7: Browser-Smoke-Test**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios/www && python3 -m http.server 8765 > /tmp/pt_server.log 2>&1 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/index.html
```

Expected: `200`.

Open in browser: `http://127.0.0.1:8765/index.html`
- Tippe einen Athleten an
- Öffne Einstellungen via Header-Zahnrad
- Erwarte: zwischen „Erscheinungsbild" und „Wochen-Plan" die neue `Benachrichtigungen`-Karte mit Toggle
- Toggle umschalten → kein Crash, persistiert nach Reload (Tweaks-localStorage)

Server stoppen:
```bash
pkill -f "http.server 8765"
```

- [ ] **Step 3.8: Commit**

```bash
git add www/settings.jsx www/app.jsx
git commit -m "feat(settings): expose notifications toggle as visible card"
```

---

## Task 4: End-to-End-Verifikation auf zwei iPhones

**Manuell**, kein Code. Erfordert TestFlight-Build mit aktueller `www/`-Version.

- [ ] **Step 4.1: Build erstellen und auf TestFlight pushen**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios
npx cap sync ios
# In Xcode öffnen:
open ios/App/App.xcworkspace
# Archive → Distribute App → TestFlight
```

Warten bis beide Phones (Benny, Jonas) das Update gezogen haben.

- [ ] **Step 4.2: Sicherstellen, dass APNs-Tokens registriert sind**

Auf beiden Phones: App öffnen, Namen wählen, kurz tippen (löst Push-Permission-Prompt aus, falls noch nicht da), in Einstellungen `Benachrichtigungen` einschalten.

Verify via SQL:

```sql
select athlete, platform, last_seen from device_tokens order by athlete;
```

Expected: zwei Zeilen, eine pro Athlet, beide mit aktuellem `last_seen`.

- [ ] **Step 4.3: Sender-Schwelle smoketesten**

Benny loggt 5 kleine Sets, gesamt < 100 Reps. Jonas darf keine Notification kriegen.

Verify: `select * from push_log where day = berlin_today();` — sollte leer sein.

- [ ] **Step 4.4: Schwelle überschreiten und Trigger erwarten**

Benny loggt weitere Sets, bis Tagessumme > 100. Sobald der nächste Set die 100er-Schwelle überschreitet, sollte Jonas innerhalb von 1-3 Sekunden den Banner sehen:

> 🔥 Benny ist los
> Schon X Reps heute — du noch bei 0.

Verify:
```sql
select * from push_log where day = berlin_today() and athlete = 'Jonas';
```

Expected: Eine Zeile, `kind='rival'`.

- [ ] **Step 4.5: Dedup verifizieren**

Benny loggt einen weiteren Set. **Keine** neue Notification bei Jonas (push_log-Eintrag verhindert).

Verify Edge-Function-Logs:
```
Tool: mcp__claude_ai_Supabase__get_logs (service: edge-function)
```
Expected: letzter Aufruf liefert `"ignored": true, "reason": "already_sent_today"`.

- [ ] **Step 4.6: Empfänger-aktiv verifizieren**

Jonas loggt einen Set (egal welche Reps). Ab jetzt sollte Jonas keine weiteren Rival-Pushes mehr bekommen, weil sein `athlete_reps_today` jetzt > 0 ist. Auch wenn Benny weitere Sets loggt — kein Push.

(Hinweis: Heute kommt sowieso keiner mehr, weil push_log schon einen Eintrag hat. Diesen Pfad richtig testen geht erst morgen, wenn der push_log-Eintrag neu wäre.)

- [ ] **Step 4.7: Tag-Reset verifizieren (am Folgetag)**

Am nächsten Tag: push_log muss leer sein für heute. Erste Schwellüberschreitung durch einen Athleten löst wieder Push aus.

```sql
select * from push_log where day = berlin_today();
```

Expected: leer am Morgen, gefüllt sobald Schwelle überschritten.

---

## Spec Coverage Check

- ✅ Sender-Schwelle 100 → Step 2.2 (Konstante `RIVAL_THRESHOLD`)
- ✅ Empfänger-Aktivitäts-Check → Step 2.2 (recipientToday > 0 → ignored)
- ✅ Push-Log Dedup → Steps 1.1, 2.2 (Composite-PK Insert)
- ✅ Berlin-Timezone → Step 1.1 (`athlete_reps_today`, `berlin_today`)
- ✅ pg_net + Trigger → Step 1.1
- ✅ Edge-Function-Verhaltensänderung → Step 2.2
- ✅ Settings-UI → Task 3
- ✅ Manuelle E2E-Verifikation → Task 4
- ✅ Webhook-Secret-Sync → Step 1.5

**Out of Scope (bestätigt nicht im Plan):**
- Per-Type-Toggle (kommt in Phase 2)
- Per-Device-Preferences
- Konfigurierbarer Schwellwert
- Push-Body-Customisierung
