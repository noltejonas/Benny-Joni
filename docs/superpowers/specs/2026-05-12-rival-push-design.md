# Rival-Push „Andere hat geliefert" — Design Spec

**Datum:** 2026-05-12
**Autor:** Claude (User-Brainstorm)
**Status:** Design genehmigt, bereit für Plan

---

## Ziel

Wenn die andere Person heute insgesamt **mehr als 100 Reps** geloggt hat und ich heute noch **bei 0** stehe, bekomme ich eine **einzige** Push-Notification pro Tag, die mich anstupst.

Diese Dosierung ersetzt das bisherige „jeder Set löst Push aus"-Verhalten der bestehenden `notify-set` Edge-Function. Der In-App-Toast über Supabase Realtime bleibt unverändert.

## Out of Scope

- Per-Type-Toggle (kommt mit späteren Reminder-Phasen)
- Per-Device-Preferences (alle Devices eines Athleten verhalten sich gleich)
- Konfigurierbarer Schwellwert (fest auf 100 Reps)
- Mehrere Push-Typen (Wochenstart, Deadline, Tägliche Reminder — eigene Phasen)
- Android, Web-Push (App ist iOS-only, Web behält Realtime-Toasts)

---

## Architektur

```
[Phone A loggt Set]
   │  api.addSet() — Supabase JS SDK
   ▼
[Postgres: INSERT INTO sets]
   │  Trigger AFTER INSERT (pg_net.http_post)
   ▼
[Edge Function `notify-set`]
   │  - Sender today_total > 100 ?           (RPC athlete_reps_today)
   │  - Recipient today_total == 0 ?         (RPC athlete_reps_today)
   │  - push_log INSERT (PK-Conflict = bereits raus → skip)
   │  - Tokens des Empfängers laden
   │  - APNs-Push senden
   ▼
[APNs] → [Phone B: Banner „Benny ist los"]
```

**Foreground:** App offen → iOS unterdrückt Banner, der bestehende Realtime-Toast greift weiter. Kein Double-Feedback.

---

## Datenbank-Änderungen

### Neue Tabelle: `push_log`

```sql
create table push_log (
  athlete text not null references athletes(name) on delete cascade,
  kind text not null,                      -- 'rival' für jetzt, später z.B. 'weekstart','deadline'
  day date not null,                       -- Tag in Europe/Berlin
  created_at timestamptz default now(),
  primary key (athlete, kind, day)
);

create index if not exists push_log_day_idx on push_log(day);

alter table push_log enable row level security;
create policy "public read push_log" on push_log for select using (true);
create policy "public write push_log" on push_log for all using (true) with check (true);
```

Rationale für Composite-PK: garantiert „max 1 Push pro Empfänger pro Tag pro Kind" auf DB-Ebene. Dedup-Check in der Edge Function kann optional weggelassen werden, weil INSERT-Conflict ohnehin fängt.

### `pg_net` aktivieren

```sql
create extension if not exists pg_net with schema extensions;
```

### Trigger auf `sets`

```sql
create or replace function notify_set_inserted() returns trigger
  language plpgsql security definer as $$
declare
  fn_url text := 'https://jczyyupxxqrdgbeifcwe.supabase.co/functions/v1/notify-set';
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
  for each row execute function notify_set_inserted();
```

Webhook-Secret wird per `alter database … set app.webhook_secret = '…'` gesetzt (oder über `alter system`).

---

## Edge Function: `notify-set` Logik-Update

**Pfad:** `supabase/functions/notify-set/index.ts`

Bestehender Flow (JWT bauen, APNs senden, dead tokens cleanen) bleibt. Vor dem Senden kommen drei neue Checks. Der Notification-Text ändert sich.

### Helper-RPC in Postgres

Statt die Timezone-Logik in JS zu jonglieren (Sommer-/Winterzeit, ISO-Offset-Strings, DST-Übergänge), liegt sie in einer SQL-Funktion:

```sql
create or replace function athlete_reps_today(p_athlete text)
  returns int
  language sql stable as $$
  select coalesce(sum(reps), 0)::int
  from sets
  where athlete = p_athlete
    and (created_at at time zone 'Europe/Berlin')::date
        = (now() at time zone 'Europe/Berlin')::date
$$;

create or replace function berlin_today() returns date
  language sql stable as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;
```

`stable` damit Supabase REST-RPC sie aufrufen darf, kein `security definer` nötig (lesen nur).

### Pre-Send-Checks in der Edge Function

```ts
const recipientName = record.athlete === 'Benny' ? 'Jonas' : 'Benny';

// 1. Sender-Tageszahl
const { data: senderToday } = await supabase.rpc('athlete_reps_today', { p_athlete: record.athlete });
if ((senderToday ?? 0) <= 100) {
  return Response.json({ ignored: true, reason: 'sender_below_threshold', senderToday });
}

// 2. Empfänger-Tageszahl
const { data: recipientToday } = await supabase.rpc('athlete_reps_today', { p_athlete: recipientName });
if ((recipientToday ?? 0) > 0) {
  return Response.json({ ignored: true, reason: 'recipient_active', recipientToday });
}

// 3. Heute-Datum (Berlin) für push_log
const { data: todayDate } = await supabase.rpc('berlin_today'); // "YYYY-MM-DD"

// 4. Dedup via push_log — Insert ist die Lock-Operation
const { error: logErr } = await supabase.from('push_log').insert({
  athlete: recipientName,
  kind: 'rival',
  day: todayDate,
});
if (logErr) {
  if (logErr.code === '23505') {
    return Response.json({ ignored: true, reason: 'already_sent_today' });
  }
  throw logErr;
}
// push_log Eintrag steht — Push darf raus
```

### Reihenfolge wichtig

`push_log.insert` **vor** dem APNs-Senden. Falls APNs failed, bleibt der Log-Eintrag trotzdem stehen — das ist gewollt, damit ein retry-Loop bei Apple-Ausfall keine 50 Pushes spammt. Trade-off: bei seltenem APNs-Outage verpasst der User den Stupser. Akzeptabel.

### Notification-Text neu

```ts
const senderEmoji = '🔥'; // generisch — category-Emoji ergibt hier wenig Sinn,
                           // weil senderToday eine Summe ist
const title = `${senderEmoji} ${record.athlete} ist los`;
const body = `Schon ${senderToday} Reps heute — du noch bei 0.`;

const apsPayload = {
  aps: { alert: { title, body }, sound: 'default' },
  kind: 'rival',
  athlete: record.athlete,
};
```

`record.note` wird nicht mehr in den Body übernommen (war beim alten Per-Set-Verhalten sinnvoll, bei der Tages-Summe nicht).

---

## Client-Code

### `data.js` — keine Änderungen nötig

Das `addSet` Verhalten bleibt. Trigger feuert serverseitig.

### `app.jsx` — keine Änderungen am Push-Flow nötig

`t.notifications`-Toggle registriert/löscht den Token wie heute.

### `settings.jsx` — neue Card

In `SettingsScreen` zwischen `AppearanceCard` und Wochen-Plan:

```jsx
function NotificationsCard({ t, setTweak }) {
  return (
    <div className="card">
      <div className="settings-row">
        <div>
          <div className="label" style={{margin:0}}>Benachrichtigungen</div>
          <div className="subtitle" style={{fontSize:13,marginTop:2}}>
            Stupser, wenn der/die andere geliefert hat und du heute noch 0 Reps hast. Max 1×/Tag.
          </div>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={!!t.notifications}
                 onChange={(e) => setTweak('notifications', e.target.checked)}/>
          <span className="toggle-slider"/>
        </label>
      </div>
    </div>
  );
}
```

In `App` als Prop-Drilling oder via Tweaks-Hook hochreichen (`useTweaks` ist schon da).

Settings-Bezug auf `t` & `setTweak` heißt: `SettingsScreen` Signatur erweitern, `App` reicht beides durch. Tweaks-Panel verliert seinen Notifications-Toggle (oder behält ihn als Duplikat — okay, weil derselbe State).

---

## Env-Vars

Bestehend (keine neuen):
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, `APNS_ENV`
- `WEBHOOK_SECRET`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto)

Webhook-Secret muss in der Postgres-Konfig auch verfügbar sein:
```sql
alter database postgres set app.webhook_secret = '<dasselbe-secret>';
```

---

## Tests / Verifikation

**Auto-verifizierbar (Edge-Function-Tests):**
- Edge Function mit Mock-Payload und 0 Tokens → `{sent:0,...}`
- Mit Sender<=100 Reps → `{ignored:'sender_below_threshold'}`
- Mit Recipient>0 Reps → `{ignored:'recipient_active'}`
- Zweimal mit gleichem Payload am selben Tag → zweites Mal `{ignored:'already_sent_today'}`

**Manuell auf Devices:**
- Phone A: Benny loggt 150 Reps Liegestütze (Sender>100 ✓)
- Phone B (Jonas, heute 0 Reps): Banner erscheint „🔥 Benny ist los — Schon 150 Reps heute, du noch bei 0"
- Phone A loggt weitere 50 Reps → Phone B kriegt **keine** zweite Notification (Dedup ✓)
- Phone B loggt 5 Reps → ab jetzt für heute keine Pushes mehr in beide Richtungen (Empfänger nicht mehr 0)
- Nächster Tag: Counter resettet, Push wieder möglich

---

## Risiken

- **Timezone Edge-Cases:** wenn jemand um 23:55 Uhr loggt und der/die andere um 00:05, kann der „heute"-Check unterschiedlich landen. Akzeptabel, weil push_log auf Berlin-Datum locked.
- **`pg_net` Latenz:** asynchron, kann mal 1-2s dauern. Schlimmer Fall: Push kommt mit Verzögerung. Vergleichbar mit APNs-Latenz selbst.
- **`security definer` im Trigger:** notwendig damit der Trigger HTTP-Calls darf. Funktion ist klein, kein Injection-Vektor.
- **Atomizität:** wenn `push_log.insert` erfolgt aber APNs failed, kriegt User heute keinen Push mehr. Gewollt — siehe Reihenfolge oben.
- **Bestehender Webhook (falls existiert):** falls im Dashboard eine alte Webhook-Konfig schlummert, könnte sie parallel zum Trigger feuern (doppelte Pushes). Pre-Implementation: Dashboard checken, falls vorhanden deaktivieren.

---

## Implementierungs-Reihenfolge

1. Migration: `push_log` Tabelle + `pg_net` Extension + Trigger anlegen
2. Edge Function `notify-set` neu deployen mit Threshold/Dedup-Logik
3. Settings-UI: `NotificationsCard` einbauen, `App` reicht Tweaks durch
4. Manuell auf zwei iPhones verifizieren

Wenn Schritt 3 nicht in derselben Session passieren kann (z.B. nur Edge-Function-Tweak gewollt), kann er separat laufen — Settings ist vom Server entkoppelt.
