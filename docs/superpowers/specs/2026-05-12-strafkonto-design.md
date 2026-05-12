# Strafkonto — Design

## Ziel

Ein konfigurierbares Strafsystem: Wenn ein Athlet (Benny/Jonas) in einer abgelaufenen Woche seine Pflicht nicht erfüllt, fällt ein konfigurierbarer Geldbetrag (Default 5 €) an. Strafen sammeln sich in einem gemeinsamen Pot. Pot, Settlement und Konfiguration leben in einem eigenen Bottom-Nav-Tab „Strafkonto".

## Scope

- Zwei neue Postgres-Tabellen plus eine Singleton-Config-Tabelle.
- Demo-Mode-Unterstützung (`loadDemo()` in `www/data.js`).
- Neuer Bottom-Nav-Tab inkl. Settings-Sheet.
- Banner auf der Heute-Ansicht der jeweils letzten abgelaufenen, nicht-abgeschlossenen Woche.
- Realtime-Sync über Supabase (analog zu `weekly_challenges`).
- Manuelle Verbuchung („Woche abschließen") — keine automatischen Cron-/Timer-Trigger.
- Strafen erst ab Aktivierung — keine retroaktive Berechnung vergangener Wochen.

## Datenmodell

### `penalty_config` (Singleton)

```sql
CREATE TABLE penalty_config (
  id            int PRIMARY KEY CHECK (id = 1),
  enabled       bool DEFAULT false,
  rule_mode     text NOT NULL DEFAULT 'per_week_aggregate'
                CHECK (rule_mode IN ('per_challenge','per_week_any','per_week_all','per_week_aggregate')),
  amount_cents  int  NOT NULL DEFAULT 500 CHECK (amount_cents > 0),
  currency      text NOT NULL DEFAULT 'EUR',
  updated_at    timestamptz DEFAULT now()
);
INSERT INTO penalty_config (id) VALUES (1) ON CONFLICT DO NOTHING;
```

### `penalties`

```sql
CREATE TABLE penalties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start    date NOT NULL,
  athlete       text NOT NULL REFERENCES athletes(name),
  challenge_id  uuid REFERENCES weekly_challenges(id) ON DELETE SET NULL,
  amount_cents  int  NOT NULL CHECK (amount_cents > 0),
  rule_mode     text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  paid          bool DEFAULT false,
  paid_at       timestamptz,
  paid_by       text REFERENCES athletes(name),
  note          text
);
CREATE INDEX penalties_week_idx        ON penalties(week_start);
CREATE INDEX penalties_athlete_paid_idx ON penalties(athlete, paid);
CREATE INDEX penalties_paid_idx        ON penalties(paid);
```

- `challenge_id` nur bei `rule_mode = 'per_challenge'` gesetzt, sonst `NULL`.
- `amount_cents` und `rule_mode` sind Snapshots der zum Verbuchungs-Zeitpunkt aktiven Config — sie ändern sich nicht, wenn jemand später die Config tunet.

### `week_closures`

```sql
CREATE TABLE week_closures (
  week_start  date PRIMARY KEY,
  closed_at   timestamptz DEFAULT now(),
  closed_by   text NOT NULL REFERENCES athletes(name)
);
```

- Markiert, ob eine Woche abgeschlossen wurde. Existiert *immer*, sobald jemand auf „Verbuchen" tippt — auch wenn 0 Strafen entstanden sind.
- Bei initialer Aktivierung des Features werden alle bestehenden, schon abgelaufenen Wochen (`week_start < currentMonday`) als „stumm geschlossen" markiert, `closed_by = aktivierender Athlet`.

### RLS

Schreibrechte: authenticated. Reads: public read (analog zum Rest der App, die zwischen zwei Personen geteilt wird).

## Berechnungslogik

Für einen Athleten `A` und eine Woche `W`:

```
challenges     = SELECT * FROM weekly_challenges WHERE week_start = W
fairShare(c)   = ceil(c.target_reps / 2)
reps(A,c)      = SUM(sets.reps) WHERE sets.challenge_id = c.id AND sets.athlete = A
```

| `rule_mode` | „A hat verfehlt", wenn … | erzeugte Strafen pro (A,W) |
|---|---|---|
| `per_challenge` | `reps(A,c) < fairShare(c)` für jede Challenge `c` einzeln geprüft | 0..n (eine Penalty-Row pro verfehlter Challenge, `challenge_id` gesetzt) |
| `per_week_any` | mind. ein `c` mit `reps(A,c) < fairShare(c)` | 0 oder 1 (`challenge_id = NULL`) |
| `per_week_all` | ALLE `c` mit `reps(A,c) < fairShare(c)` | 0 oder 1 (`challenge_id = NULL`) |
| `per_week_aggregate` (Default) | `Σ reps(A,c) < Σ fairShare(c)` | 0 oder 1 (`challenge_id = NULL`) |

**Leere Woche** (keine Challenges): kein Modus erzeugt eine Strafe (`Σ fairShare = 0`, alle Bedingungen false oder vacuously erfüllt).

**Berechnungszeitpunkt**: Ausschließlich beim Tippen auf „Verbuchen". Vorschau im Confirm-Dialog rechnet identisch; Server rechnet beim Insert nochmal frisch (Vorschau könnte veraltet sein).

## Flows

### Wochenabschluss

**Banner auf der Heute-Ansicht** wenn alle drei Bedingungen erfüllt:
- `penalty_config.enabled = true`
- gezeigte Wochen-View hat `week_start < currentMonday`
- kein `week_closures`-Eintrag für `week_start`

```
┌─────────────────────────────────────┐
│  KW 19 ist um.                      │
│  [ Woche abschließen ]              │
│  → 2 Strafen, insgesamt 10 €        │
└─────────────────────────────────────┘
```

Tap → Confirm-Sheet:

```
KW 19 abschließen?

Folgende Strafen werden gebucht:
• Benny  — 5 € (aggregiert verfehlt, –123 reps)
• Jonas  — 5 € (aggregiert verfehlt,  –87 reps)

Gesamt: 10 €

[ Abbrechen ]   [ Verbuchen ]
```

Bei 0 Strafen:

```
KW 19 abschließen?
✓ Beide haben geschafft. Keine Strafen.

[ Abbrechen ]   [ Abschließen ]
```

Tap auf „Verbuchen" → Transaktion (siehe Pseudo unten) → Toast „KW 19 abgeschlossen · 10 € in den Topf" → Banner verschwindet.

```
closeWeek(weekStart, by):
  BEGIN;
  -- re-check (race condition)
  IF EXISTS (SELECT 1 FROM week_closures WHERE week_start = weekStart):
    ROLLBACK; RETURN 'already_closed';
  cfg = SELECT * FROM penalty_config WHERE id = 1;
  IF cfg.enabled:
    challenges = SELECT * FROM weekly_challenges WHERE week_start = weekStart;
    FOR athlete IN ('Benny','Jonas'):
      penalties = computePenalties(challenges, athlete, cfg);
      INSERT INTO penalties (...) VALUES (...) for each penalty;
  INSERT INTO week_closures (week_start, closed_by) VALUES (weekStart, by);
  COMMIT;
```

Da die App keine eigenen Postgres-Funktionen nutzt, läuft `closeWeek` als Client-seitige Transaktion via Supabase. Race-Condition-Schutz primär durch PK auf `week_closures.week_start` (zweiter Insert wirft `23505`, wird im Client als „bereits abgeschlossen" gehandhabt).

### Settlement

Tap auf offene Strafen-Row im Strafkonto-Tab → Sheet:

```
Strafe einlösen
KW 19 · Benny · 5 €

Notiz (optional):  [ ___________________ ]

[ Abbrechen ]   [ Einlösen ]
```

```sql
UPDATE penalties
SET paid = true, paid_at = now(), paid_by = $me, note = $note
WHERE id = $id;
```

Tap auf bereits bezahlte Strafe → Sheet mit „Korrektur: zurücksetzen?" → `UPDATE … SET paid = false, paid_at = NULL, paid_by = NULL`.

Long-press auf jede Strafe → „Strafe löschen?" (für falsche Einträge) → `DELETE`.

### Re-Open

Settings-Sheet → „Vergangene Woche neu öffnen ▸" → Liste der closed weeks (DESC) → Tap → Confirm:

```
KW 19 neu öffnen?
• Closure-Eintrag wird gelöscht.
• 1 unbezahlte Strafe wird gelöscht (Jonas, 5 €).
• 1 bezahlte Strafe bleibt erhalten (Benny, 5 €, eingelöst 03.05.).

[ Abbrechen ]   [ Neu öffnen ]
```

```sql
DELETE FROM penalties WHERE week_start = $w AND paid = false;
DELETE FROM week_closures WHERE week_start = $w;
```

Banner für KW 19 erscheint danach wieder auf der Heute-Ansicht.

### Initiale Aktivierung

Toggle in Settings → `enabled = false → true`:

```sql
UPDATE penalty_config SET enabled = true, updated_at = now();
INSERT INTO week_closures (week_start, closed_by)
  SELECT DISTINCT week_start, $me
  FROM weekly_challenges
  WHERE week_start < $currentMonday
  ON CONFLICT (week_start) DO NOTHING;
```

→ Alle vergangenen abgelaufenen Wochen werden stumm geschlossen (ohne Strafen). Aktive (laufende) Woche bleibt offen — wird beim nächsten Wochenwechsel ganz normal über das Banner geschlossen.

## UI — Strafkonto-Tab

Bottom-Nav-Erweiterung um vierten/fünften Slot, Icon `⚖️` oder `💰`, Label „Strafkonto", Badge mit Count offener Strafen (wenn > 0).

```
┌─────────────────────────────────────┐
│  STRAFKONTO                      ⚙ │
├─────────────────────────────────────┤
│         25,00 €                     │  display mono, 44px
│         im Topf                     │
│   Benny: 15 €  ·  Jonas: 10 €       │
├─────────────────────────────────────┤
│ OFFENE ABSCHLÜSSE                   │
│ ▸ KW 18 abschließen                 │  (nur wenn ≥1 offene closure)
│ ▸ KW 17 abschließen                 │
├─────────────────────────────────────┤
│ OFFEN                               │
│ KW 19 · Benny       5 €      ☐      │
│ KW 19 · Jonas       5 €      ☐      │
│ KW 18 · Benny       5 €      ☐      │
├─────────────────────────────────────┤
│ BEZAHLT                             │
│ KW 17 · Jonas   5 € · 03.05.        │
│   „Pizza ausgegeben"                │
├─────────────────────────────────────┤
│ ABGESCHLOSSENE WOCHEN — STRAFFREI   │
│ ✓ KW 16 · alles geschafft           │
│ ✓ KW 15 · alles geschafft           │
└─────────────────────────────────────┘
```

Sortierung: aktuellste zuerst.

Empty-State (noch nie eine Strafe entstanden, kein Pot): „Noch sauber. Lasst es so. 🧼"

### Settings-Sheet

```
☐  Strafkonto aktiv
Betrag pro Strafe:  [ 5 ] €
Regel:
  ◯ Pro nicht geschaffter Challenge
  ◉ Aggregiert pro Woche (Default)
  ◯ Min. 1 Challenge verfehlt
  ◯ Alle Challenges verfehlt

Vergangene Woche neu öffnen ▸
```

Toggle-Aus mit offenen Strafen → Hinweis: „Bestehende Strafen bleiben sichtbar, neue werden nicht erzeugt."

## Data-Layer (www/data.js)

Bestehende API um folgende Methoden erweitern (Demo + Supabase):

```js
api.getPenaltyConfig()            // → { enabled, rule_mode, amount_cents, currency }
api.setPenaltyConfig(patch)
api.previewWeekClose(weekStart)   // → { penalties: [{athlete, amount_cents, reason, challenge_id?}] }
api.closeWeek(weekStart)          // → { closure, penalties[] }
api.reopenWeek(weekStart)         // → void
api.listPenalties({ paid?: bool, athlete? })
                                  // → Penalty[] sortiert week_start DESC, created_at DESC
api.markPenaltyPaid(id, { note }) // → Penalty
api.unmarkPenaltyPaid(id)         // → Penalty
api.deletePenalty(id)             // → void
api.listClosures()                // → Closure[] (für Strafkonto-Tab "straffrei" Sektion)
api.listOpenClosures()            // → string[] week_starts mit week_start < currentMonday und keinem Closure
```

`previewWeekClose` und `closeWeek` teilen sich eine reine Berechnungs-Funktion (`computePenalties(challenges, sets, athlete, cfg)`), die sowohl client-seitig für die Vorschau als auch im Insert-Pfad genutzt wird.

Demo-Mode: `loadDemo()` initialisiert `penalty_config`, `penalties`, `week_closures` als leere/Default-Strukturen.

Realtime-Channel (Supabase): zusätzliche Subscriptions auf `penalties`, `week_closures`, `penalty_config` → bestehende `emit()`-Listener triggern Reload.

## Edge Cases

1. **Beide tippen gleichzeitig „Verbuchen"**: PK-Constraint auf `week_closures.week_start` → einer gewinnt, der andere bekommt `23505` → Toast „Bereits abgeschlossen durch …", refresh.
2. **Beide haken gleichzeitig dieselbe Strafe ab**: letzter Write gewinnt (`paid_by` wird überschrieben). Akzeptabel.
3. **Leere Woche (keine Challenges)**: `Σ fairShare = 0` → 0 Strafen in jedem Modus. Closure-Eintrag entsteht trotzdem.
4. **Athlet mit 0 Reps**: maximaler verfehlt-Betrag, Strafe wird verbucht.
5. **Challenge nach Closure gelöscht**: `penalties.challenge_id` wird via `ON DELETE SET NULL` gesetzt; Strafe selbst überlebt.
6. **Aktuelle Woche**: kann nie abgeschlossen werden — UI-Gate auf `week_start < currentMonday`.
7. **Mehrere ungeschlossene Wochen**: alle als eigene Sektion „Offene Abschlüsse" im Tab, älteste zuerst.
8. **Config-Änderung bei offenen Strafen**: alte Strafen behalten ihren Snapshot, neue verwenden neue Werte.
9. **Strafkonto deaktivieren**: Banner verschwindet, neue Strafen werden nicht erzeugt, bestehende bleiben sichtbar und abhakbar.
10. **`per_challenge` mit gelöschter Challenge**: ignoriert (nicht mehr in `weekly_challenges`-Query enthalten).

## Out of Scope

- Push-Notification beim Wochen-Abschluss („Du wurdest gestraft").
- Mehrere Währungen pro Strafe (eine globale Currency reicht).
- Belege/Quittungen anhängen.
- Strafen exportieren / Bericht generieren.
- Strafe „aufteilen" oder zwischen Personen verschieben.
- Automatische Verbuchung über Cron.

## Tests

- Unit-Test `computePenalties` für alle vier Modi gegen synthetische Daten (kein Verfehlen / einer verfehlt / beide verfehlen / gemischt).
- Integration: `closeWeek` race condition — zwei parallele Aufrufe, einer muss `23505` werfen.
- E2E (manuell): Aktivieren → Wochenabschluss → Settlement → Re-Open → Settings ändern → erneuter Abschluss.
