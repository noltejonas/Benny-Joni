# Projekt Terminator — Setup

## 1. Supabase Projekt anlegen

1. Auf https://supabase.com einloggen → **New project**
2. Region: `eu-central-1` (Frankfurt) → schnellste Latenz
3. Datenbank-Passwort merken (brauchst du selten, aber gut zu haben)
4. Warten bis Projekt provisioniert ist (~2 min)

## 2. Schema anlegen

Im Supabase Dashboard → **SQL Editor** → neuer Query → folgendes einfügen und ausführen:

```sql
-- Athleten (statisch, kein Auth)
create table if not exists athletes (
  name text primary key
);
insert into athletes (name) values ('Benny'), ('Jonas')
  on conflict do nothing;

-- Verfügbare Kategorien (erweiterbar)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  emoji text default '💪',
  created_at timestamptz default now()
);
insert into categories (name, emoji) values
  ('Liegestütze', '🤜'),
  ('Klimmzüge', '🆙'),
  ('Sit-ups', '🧘'),
  ('Kniebeugen', '🦵'),
  ('Burpees', '🔥')
  on conflict do nothing;

-- Wochen-Challenge: pro Woche mehrere Kategorien + Ziele möglich
create table if not exists weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,                    -- Montag der Woche
  category_id uuid references categories(id),
  chosen_by text references athletes(name),
  target_reps int not null check (target_reps > 0),
  created_at timestamptz default now(),
  unique(week_start, category_id)              -- ein Ziel pro Kategorie pro Woche
);

-- Geloggte Sätze
create table if not exists sets (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references weekly_challenges(id) on delete cascade,
  athlete text references athletes(name) not null,
  reps int not null check (reps > 0),
  note text,
  created_at timestamptz default now()
);

create index if not exists sets_challenge_idx on sets(challenge_id);
create index if not exists sets_athlete_idx on sets(athlete);
create index if not exists sets_created_idx on sets(created_at desc);

-- Public access (kein Auth, simple MVP) – wenn du Auth später willst, hier RLS aktivieren
alter table athletes enable row level security;
alter table categories enable row level security;
alter table weekly_challenges enable row level security;
alter table sets enable row level security;

create policy "public read athletes" on athletes for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public insert categories" on categories for insert with check (true);
create policy "public read challenges" on weekly_challenges for select using (true);
create policy "public insert challenges" on weekly_challenges for insert with check (true);
create policy "public update challenges" on weekly_challenges for update using (true);
create policy "public read sets" on sets for select using (true);
create policy "public insert sets" on sets for insert with check (true);
create policy "public delete sets" on sets for delete using (true);
```

## 3. Realtime aktivieren

Im Dashboard → **Database** → **Replication** → unter "supabase_realtime" diese Tabellen aktivieren:

- `sets`
- `weekly_challenges`

Damit kommen Live-Updates rein, sobald jemand einen Satz loggt.

## 4. API-Keys ins App eintragen

Im Dashboard → **Settings → API**, kopier:
- **Project URL** (z.B. `https://xxxx.supabase.co`)
- **anon public key**

Im Projekt: `index.html` öffnen, oben im `<script>` Block die beiden Konstanten ersetzen:

```js
const SUPABASE_URL = "https://DEIN-PROJEKT.supabase.co";
const SUPABASE_ANON_KEY = "DEIN-ANON-KEY";
```

Speichern → fertig. App nutzt jetzt Supabase. Solange leer / falsch, läuft die App im **Demo-Modus** (localStorage), du kannst alles ausprobieren ohne Backend.

## 5. Als PWA installieren (optional)

Im Handy-Browser (iOS Safari / Android Chrome) die App öffnen → "Zum Home-Bildschirm" → läuft fullscreen.

## Push-Benachrichtigungen

Web Push auf iOS Safari ist heikel und braucht Apple Push Service + Service Worker — für den MVP nutzen wir stattdessen **Browser-Notifications via Realtime**: wenn die App offen ist (oder als PWA im Hintergrund), ploppt ein Notification-Banner, sobald der/die andere loggt. Echte Server-Side Push können wir nachrüsten via Supabase Edge Function + VAPID.
