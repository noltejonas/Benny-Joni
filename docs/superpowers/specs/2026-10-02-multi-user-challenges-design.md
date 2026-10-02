# Multi-User Challenges — Design

## Ziel

Die App ist heute fest auf zwei Athleten verdrahtet (`athletes`-Tabelle mit „Benny"/„Jonas", ~280 Stellen im Frontend, Push-Function mit `otherAthlete()`). Künftig kann jeder mitmachen:

- Einmaliger Login mit E-Mail + Passwort, Session bleibt in der App gespeichert.
- Challenges anlegen, per Code Freunde einladen, an mehreren Challenges gleichzeitig teilnehmen.
- Modi: **1 vs 1**, **2er-Team vs 2er-Team**, **Jeder gegen jeden** (Rangliste).
- Module pro Challenge wählbar: **Rotationsplan**, **Strafkonto**, **Work-Tracking**.
- Stats: pro Challenge, **All-Time** (über alle Challenges) und **Head-to-Head** gegen bestimmte User.
- Eine **Haupt-Challenge** öffnet sich beim App-Start automatisch.
- „Benny vs Jonas" wird zu einer normalen Challenge (1 vs 1, alle Module an). Alle bisherigen Daten bleiben erhalten.
- Der Benutzer-Umschalter Benny ↔ Jonas entfällt und wird durch den Challenge-Switcher ersetzt.

## Begriffe

| UI-Begriff | DB | Bedeutung |
|---|---|---|
| **Challenge** | `competitions` (neu) | Container: Teilnehmer, Modus, Module, Code |
| **Wochenziel** | `weekly_challenges` (bestehend) | Kategorie + Zielwert für eine Woche innerhalb einer Challenge |
| **Satz** | `sets` (bestehend) | Geloggte Reps/Minuten eines Users auf ein Wochenziel |
| **Seite** | — | 1v1 / FFA: eine Person. 2v2: ein Team |

Die Container-Tabelle heißt bewusst `competitions`, weil `challenge_id` in `sets`, `penalties` und im Frontend bereits „Wochenziel" bedeutet. Ein Umbenennen der Live-Spalten wäre riskanter als ein neuer Name. Im Frontend heißt das Ding trotzdem „Challenge".

## Scope

- Supabase Auth (E-Mail + Passwort), Profil-Tabelle, Avatar-Upload.
- Neue Tabellen `profiles`, `competitions`, `competition_members`.
- Alle bestehenden Tabellen bekommen `competition_id` bzw. `user_id`; Singletons (`penalty_config`, `rotation_config`) werden pro Challenge.
- RLS auf Mitgliedschaft umgestellt (heute: alles `public`).
- RPCs für Anlegen, Beitreten per Code, Team-Wechsel.
- Frontend: Login, Onboarding, Challenge-Switcher, Anlegen/Beitreten, Challenge-Einstellungen, Generalisierung aller Screens auf N Teilnehmer bzw. 2 Seiten.
- Push-Function auf Mitglieder der Challenge umstellen.
- Einmalige Migration der Benny-vs-Jonas-Daten.

Nicht im Scope (v1): Sign in with Apple, Magic Links, Passwort-Reset per Deep Link (siehe offene Fragen), öffentliche Challenges/Suche, Chat.

## Auth

- `supabase.auth.signUp({ email, password, options: { data: { display_name } } })` / `signInWithPassword`.
- Session-Persistenz: supabase-js `persistSession: true`. In der Capacitor-App wird als `storage` ein Adapter auf `@capacitor/preferences` gesetzt, damit iOS die Session nicht mit dem WebView-Cache verwirft. Im Browser bleibt `localStorage`.
- **E-Mail-Bestätigung im Supabase-Dashboard deaktivieren.** Sonst braucht es einen Deep Link zurück in die App. Bei einem Freundeskreis-Tool ist das vertretbar.
- Abmelden: `signOut()`, APNs-Token des Geräts löschen, lokalen State leeren.
- Ein Trigger auf `auth.users` legt automatisch ein `profiles`-Row an.

## Datenmodell

### Neu: `profiles`

```sql
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 30),
  avatar_url          text,
  color               text not null default '#32d74b',   -- Fallback-Avatar + Chart-Farbe
  main_competition_id uuid,                               -- FK nach Anlage von competitions
  legacy_athlete      text unique,                        -- 'Benny' / 'Jonas' für die Migration
  created_at          timestamptz not null default now()
);
```

Avatare liegen im Storage-Bucket `avatars/<user_id>.jpg`. Ohne Bild: Initiale auf `color`.

### Neu: `competitions`

```sql
create table competitions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 40),
  emoji             text not null default '💪',
  mode              text not null check (mode in ('1v1','2v2','ffa')),
  invite_code       text not null unique,        -- 6 Zeichen, ohne 0/O/1/I
  rotation_enabled  bool not null default false,
  penalties_enabled bool not null default false,
  work_enabled      bool not null default false,
  start_date        date not null default current_date,
  end_date          date,                         -- null = läuft unbegrenzt
  archived_at       timestamptz,
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now()
);
```

### Neu: `competition_members`

```sql
create table competition_members (
  competition_id uuid not null references competitions(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  role           text not null default 'member' check (role in ('owner','member')),
  team           text check (team in ('A','B')),          -- nur bei mode = '2v2'
  joined_at      timestamptz not null default now(),
  left_at        timestamptz,                             -- Austritt: Historie bleibt
  primary key (competition_id, user_id)
);
```

Kapazitäten: `1v1` = 2, `2v2` = 4 (2 pro Team), `ffa` = max. 12. Die Prüfung läuft im RPC `join_competition`.

### Bestehende Tabellen: Erweiterungen

| Tabelle | Änderung |
|---|---|
| `weekly_challenges` | `+ competition_id uuid not null`, `chosen_by` → `chosen_by_user uuid`. Unique `(week_start, category_id)` → `(competition_id, week_start, category_id)` |
| `sets` | `+ user_id uuid not null`, `+ competition_id uuid not null` (denormalisiert für RLS + Feed-Query) |
| `reactions` | `+ user_id uuid`; Unique `(set_id, user_id, emoji)` |
| `categories` | `+ competition_id uuid null`. `null` = System-Katalog (read-only), sonst eigene Kategorie der Challenge |
| `plan_slots` | `+ competition_id uuid not null` |
| `rotation_config` | PK `id=1` → PK `competition_id` |
| `penalty_config` | PK `id=1` → PK `competition_id` (das `enabled`-Flag ersetzt `competitions.penalties_enabled` nicht, sondern wird von ihm gesteuert) |
| `penalties` | `+ competition_id`, `athlete` → `user_id`, `paid_by` → `paid_by_user` |
| `week_closures` | PK `week_start` → `(competition_id, week_start)`, `closed_by` → `closed_by_user` |
| `payouts` | `+ competition_id`, `athlete` → `user_id` |
| `project_tags`, `tool_tags` | `+ competition_id` |
| `device_tokens` | `athlete` → `user_id` |
| `push_log` | PK `(athlete, kind, day)` → `(user_id, competition_id, kind, day)` |

Die alten Text-Spalten (`athlete`, `chosen_by`, …) bleiben bis zum Cutover nullable stehen und fliegen in einer späteren Migration raus.

### Zielwert-Semantik

Heute ist `target_reps` das **gemeinsame** Ziel beider; jeder schuldet `fairShare = ceil(target / 2)`. Das wird verallgemeinert, ohne bestehende Zielwerte umzurechnen:

- `target_reps` bleibt das gemeinsame Wochenziel aller aktiven Teilnehmer.
- `fairShare pro Person = ceil(target_reps / Anzahl aktiver Teilnehmer)`.
- 2v2: Team-Anteil = 2 × Personen-Anteil.
- Ring/Balken auf „Heute" zeigt weiterhin die Summe aller gegen `target_reps`.
- Strafkonto prüft pro Person gegen den Personen-Anteil (Logik in `computePenalties` bleibt, nur der Teiler wird dynamisch).

### Wertung / Rangliste

- Summe Reps bzw. Minuten der Woche (wie heute). Bei 2v2 Summe pro Team.
- Wochensieger = Platz 1. All-Time-Tabelle der Challenge = Anzahl Wochensiege, dann Gesamtvolumen.

## RLS & RPCs

Hilfsfunktion (security definer, `search_path` gepinnt):

```sql
create function is_member(c uuid) returns bool language sql stable security definer
set search_path = public as $$
  select exists (select 1 from competition_members
                 where competition_id = c and user_id = auth.uid() and left_at is null)
$$;
```

Policies (Auszug):

- `competitions`, `competition_members`, `weekly_challenges`, `plan_slots`, `rotation_config`, `penalty_config`, `penalties`, `week_closures`, `payouts`, Tags: `select/insert/update/delete` nur bei `is_member(competition_id)`.
- `sets`: `select` bei Mitgliedschaft; `insert/update/delete` nur bei `user_id = auth.uid()`. Heute kann jeder jeden Satz ändern, künftig nur die eigenen.
- `reactions`: `select` bei Mitgliedschaft der Challenge des Satzes; schreiben nur eigene.
- `profiles`: `select` für alle eingeloggten User, die mit mir in mindestens einer Challenge sind; `update` nur eigenes.
- `categories`: System-Katalog für alle lesbar, eigene nur für Mitglieder.
- `device_tokens`: nur eigene.

RPCs (security definer):

| RPC | Zweck |
|---|---|
| `create_competition(name, emoji, mode, modules…)` | Legt Challenge + Owner-Mitgliedschaft + Config-Rows an, generiert Code |
| `preview_competition(code)` | Name, Modus, Teilnehmer, freie Plätze. Nicht-Mitglieder sehen sonst nichts |
| `join_competition(code, team)` | Prüft Kapazität und Team-Größe, legt Mitgliedschaft an |
| `set_member_team(competition_id, user_id, team)` | Owner verschiebt Teammitglieder |
| `regenerate_invite_code(competition_id)` | Owner |
| `leave_competition(competition_id)` | setzt `left_at`, Daten bleiben für Stats |

## Frontend

### App-Start

1. Keine Session → **Login-Screen** (Tabs „Anmelden" / „Registrieren": Name, E-Mail, Passwort).
2. Session, aber keine Mitgliedschaft → **Onboarding**: „Challenge erstellen" oder „Mit Code beitreten".
3. Sonst: `profiles.main_competition_id`, falls aktiv; sonst die zuletzt geöffnete; sonst die erste.

Die aktive Challenge liegt im App-State (`activeCompetitionId`) und in `localStorage` (`pt_active_competition`). Sämtliche Ladefunktionen in `data.js` bekommen sie als Parameter, der Realtime-Channel filtert auf `competition_id=eq.<id>`.

### Header

- Links: Challenge-Name + Emoji (antippbar) statt „Guten Morgen, Benny".
- Rechts: eigener Avatar. Tippen öffnet den **Challenge-Switcher** (Bottom-Sheet). Die Avatar-Wechsel-Animation aus `account-switch.jsx` wird für den Challenge-Wechsel wiederverwendet.

### Challenge-Switcher (Sheet)

- Liste aktiver Challenges: Emoji, Name, Modus-Chip, Mini-Fortschritt der Woche, eigener Rang. Stern = Haupt-Challenge (Tippen setzt `main_competition_id`).
- „+ Neue Challenge", „Mit Code beitreten".
- Archivierte Challenges (eingeklappt).
- Profil (Name, Avatar, Farbe), Abmelden.

### Challenge erstellen (Sheet, 3 Schritte)

1. Name, Emoji, Modus (1v1 / 2v2 / Jeder gegen jeden).
2. Module: Rotationsplan, Strafkonto, Work-Tracking; Start, optionales Ende.
3. Fertig: großer Code, „Teilen"-Button (`navigator.share` bzw. Capacitor Share) mit Text inkl. Code.

### Beitreten

Code eingeben → Vorschau (Name, Modus, Teilnehmer) → bei 2v2 Team wählen → beitreten → Challenge wird aktiv.

### Tabs (pro aktiver Challenge)

- **Heute**: wie bisher. Vergleichsdarstellung je Modus:
  - 1v1: Tauziehen wie heute (ich links).
  - 2v2: Tauziehen Team A vs Team B, darunter Einzelbeiträge.
  - FFA: Rangliste mit Balken pro Person statt Tauziehen.
  - Tagesbalken: eine Säule pro Seite (FFA: gestapelt bzw. nur ich vs. Durchschnitt).
- **Feed**: wie bisher, Avatare aus `profiles`. Wochen-Recap generalisiert auf N Seiten (Podium statt „Benny vs Jonas").
- **Stats**: Segment-Control
  - *Challenge*: heutige Stats, Chart mit einer Linie pro Seite.
  - *Ich*: All-Time über alle Challenges: Gesamtvolumen pro Kategorie, Bestwerte (größter Satz, beste Woche), Streak, Quote erfüllter Fair Shares, Wochensiege.
  - *Duelle*: Auswahl eines Users, mit dem ich mindestens eine Challenge teile. Bilanz (Wochen gewonnen/verloren/unentschieden), Volumen-Vergleich pro Kategorie, Chart wie heute „Benny vs. Jonas".
- **Strafkonto**: nur sichtbar, wenn das Modul aktiv ist.
- **Einstellungen** (Zahnrad): oben neue Karte „Challenge" (Name, Emoji, Module, Teilnehmer & Teams, Code teilen/erneuern, verlassen/archivieren). Rotationsplan und Work-Tags nur bei aktivem Modul. Darstellung/Benachrichtigungen bleiben gerätebezogen.

### Code-Generalisierung

Alle `'Benny'`/`'Jonas'`-Literale werden ersetzt durch:

- `me` = `profile.id` (statt Name-String), `members` = Liste aus `competition_members` + `profiles`.
- Helper `sidesOf(competition, members)` → `[{ key, label, color, avatar, userIds }]` (1v1/FFA: eine Seite pro Person, 2v2: zwei Teams).
- `totalsBySide(sets, sides)`, `fairShareFor(goal, members)`.
- CSS-Klassen `.benny`/`.jonas` → `.side-0`/`.side-1` + Inline-Farbe aus `profile.color`.
- `uploads/benny.jpg`/`jonas.jpg` → `profile.avatar_url` (die beiden Bilder werden bei der Migration in den Bucket geladen).

### Demo-Modus

Der localStorage-Demo-Modus wird entfernt. Mit Auth, RLS und RPCs müsste er praktisch die halbe DB nachbauen. Entwicklung läuft gegen Supabase (empfohlen: separater Supabase-Branch oder Dev-Projekt).

## Push

`notify-set` bekommt `record.user_id` + `record.competition_id`:

- Empfänger = alle aktiven Mitglieder der Challenge außer dem Sender, mit Device-Token.
- 2v2: Teamkollege bekommt „X hat für euer Team geliefert", Gegner die Rivalen-Push.
- Rivalen-Schwelle (`RIVAL_THRESHOLD`) und Dedup über `push_log(user_id, competition_id, kind, day)`.
- Titel enthält den Challenge-Namen, Tap öffnet die passende Challenge (Payload `competition_id`).
- `athlete_reps_today(text)` → `user_reps_today(uuid, uuid)`.

## Migration Benny vs Jonas

1. **Migration A (additiv)**: neue Tabellen, neue nullable Spalten, RPCs. RLS bleibt vorerst offen, damit die installierte App weiterläuft.
2. Benny und Jonas registrieren sich in der neuen App-Version (TestFlight).
3. **Migration B (Daten)**: SQL-Skript mit den beiden E-Mail-Adressen als Parameter:
   - setzt `profiles.legacy_athlete`,
   - legt Challenge „Benny vs Jonas" (1v1, alle Module an, `start_date` = frühestes `week_start`) an,
   - füllt `competition_id`/`user_id` in allen Tabellen über das Name→User-Mapping,
   - überführt `penalty_config`/`rotation_config`/`plan_slots`/Tags,
   - setzt die Challenge als Haupt-Challenge für beide.
4. **Migration C (Cutover)**: `not null`-Constraints, neue Unique-Keys, membership-basierte RLS. Ab jetzt funktioniert nur noch die neue App-Version.
5. **Migration D (später)**: alte Text-Spalten und Tabelle `athletes` entfernen.

Zwischen 3 und 4 sollte nicht geloggt werden (kurzes Wartungsfenster, bei zwei Usern unkritisch). Vorher Backup über das Supabase-Dashboard.

## Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 1 | Migration A + RPCs + Policies (vorbereitet, noch nicht scharf) | Schema steht |
| 2 | Auth in `data.js`, Login/Registrierung, Profil, Session-Persistenz | Einloggen funktioniert |
| 3 | Competition-Kontext: `data.js` scoped, Switcher, Erstellen, Beitreten, Haupt-Challenge, Onboarding | Mehrere Challenges navigierbar |
| 4 | Screens generalisieren: Heute, Feed, Recap, Log/Backfill, Strafkonto, Einstellungen | Alle Modi bedienbar |
| 5 | Stats: Challenge (N Linien), Ich (All-Time), Duelle | Stats komplett |
| 6 | Push-Function | Pushes pro Challenge |
| 7 | Migration B + C, neuer TestFlight-Build | Live |

Jede Phase landet als eigener Commit-Block auf einem Feature-Branch `feat/multi-user-challenges`; Merge nach `main` erst zum Cutover.

## Entscheidungen (2026-10-02)

1. **Zielwert**: wie heute. `target_reps` ist das gemeinsame Ziel, fairer Anteil = Ziel / aktive Teilnehmer.
2. **Wertung**: Summe der Wiederholungen bzw. Minuten (`volume`). Die Spalte `scoring` entfällt.
3. **Wochenziele**: jedes Mitglied darf Ziele anlegen und ändern.
4. **Passwort vergessen**: Reset-Mail mit Link auf eine kleine Web-Seite, kein Deep Link.
5. FFA max. 12 Personen, App-Name bleibt „Projekt Terminator".
