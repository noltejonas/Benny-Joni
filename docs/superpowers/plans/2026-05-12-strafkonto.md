# Strafkonto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Konfigurierbares Strafsystem mit gemeinsamem Pot, manuellem Wochenabschluss, einzeln abhakbaren Strafen und eigenem Bottom-Nav-Tab.

**Architecture:** Drei neue Postgres-Tabellen (`penalty_config`, `penalties`, `week_closures`) plus eine reine Berechnungs-Funktion `computePenalties()`. Demo-Mode und Supabase-Pfad in `www/data.js` parallel implementiert. UI: neuer Tab `StrafkontoScreen` (eigene Datei), Banner im `HomeScreen`, Config-Card in `SettingsScreen`.

**Tech Stack:** Vanilla React + JSX (Babel im Browser), Supabase, Capacitor iOS, kein Testframework — Verifikation via Browser-Preview und MCP Supabase-Tools.

**Spec:** [docs/superpowers/specs/2026-05-12-strafkonto-design.md](../specs/2026-05-12-strafkonto-design.md)

---

## File Structure

- **Create:** `www/SETUP_PENALTY.sql` — DDL für die drei neuen Tabellen + Indexe (für Setup-Doku).
- **Create:** `www/strafkonto.jsx` — `StrafkontoScreen`, `WeekCloseSheet`, `SettlementSheet`, `PenaltyConfigCard`.
- **Modify:** `www/data.js` — neue API-Methoden (Demo + Supabase), Realtime-Subscriptions, `computePenalties()`.
- **Modify:** `www/screens.jsx` — `WeekCloseBanner` im `HomeScreen` einbauen.
- **Modify:** `www/app.jsx` — vierter Bottom-Nav-Slot, State + Reload um `openClosures`/`penalties`/`penaltyConfig`.
- **Modify:** `www/settings.jsx` — `PenaltyConfigCard` importieren und rendern.
- **Modify:** `www/index.html` — `<script>` für `strafkonto.jsx`.
- **Modify:** `www/styles.css` — Klassen für Strafkonto-Tab, Banner, Config-Card.
- **Apply:** Postgres-Migration via `mcp__claude_ai_Supabase__apply_migration`.

---

### Task 1: Postgres-Migration anlegen und anwenden

**Files:**
- Create: `www/SETUP_PENALTY.sql`
- Apply via: MCP `apply_migration`

- [ ] **Step 1: SQL-Datei für Setup-Doku schreiben**

`www/SETUP_PENALTY.sql`:

```sql
-- Strafkonto: penalty_config (Singleton), penalties, week_closures
-- 2026-05-12

CREATE TABLE IF NOT EXISTS penalty_config (
  id           int PRIMARY KEY CHECK (id = 1),
  enabled      bool NOT NULL DEFAULT false,
  rule_mode    text NOT NULL DEFAULT 'per_week_aggregate'
               CHECK (rule_mode IN ('per_challenge','per_week_any','per_week_all','per_week_aggregate')),
  amount_cents int  NOT NULL DEFAULT 500 CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'EUR',
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO penalty_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS penalties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL,
  athlete      text NOT NULL REFERENCES athletes(name),
  challenge_id uuid REFERENCES weekly_challenges(id) ON DELETE SET NULL,
  amount_cents int  NOT NULL CHECK (amount_cents > 0),
  rule_mode    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid         bool NOT NULL DEFAULT false,
  paid_at      timestamptz,
  paid_by      text REFERENCES athletes(name),
  note         text
);
CREATE INDEX IF NOT EXISTS penalties_week_idx         ON penalties(week_start);
CREATE INDEX IF NOT EXISTS penalties_athlete_paid_idx ON penalties(athlete, paid);
CREATE INDEX IF NOT EXISTS penalties_paid_idx         ON penalties(paid);

CREATE TABLE IF NOT EXISTS week_closures (
  week_start date PRIMARY KEY,
  closed_at  timestamptz NOT NULL DEFAULT now(),
  closed_by  text NOT NULL REFERENCES athletes(name)
);

ALTER TABLE penalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_closures  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY penalty_config_all ON penalty_config FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY penalties_all ON penalties FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY week_closures_all ON week_closures FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Migration auf Supabase anwenden**

`mcp__claude_ai_Supabase__apply_migration` mit `project_id="jczyyupxxqrdgbeifcwe"`, `name="penalty_system"`, `query` = Inhalt von `SETUP_PENALTY.sql`.

- [ ] **Step 3: Verifizieren**

`mcp__claude_ai_Supabase__execute_sql`: `SELECT * FROM penalty_config;` → eine Row mit `id=1, enabled=false`. `SELECT count(*) FROM penalties;` → 0. `SELECT count(*) FROM week_closures;` → 0.

- [ ] **Step 4: Commit**

```bash
git add www/SETUP_PENALTY.sql
git commit -m "feat(db): add penalty_config, penalties, week_closures tables"
```

---

### Task 2: Reine Berechnungs-Funktion `computePenalties`

**Files:**
- Modify: `www/data.js` — oben, vor `createDemoAPI`

- [ ] **Step 1: Funktion einfügen**

In `www/data.js` direkt nach den bestehenden `mondayOf`/`isoDate`-Helpern (ca. Zeile 44), vor `function createDemoAPI()`, einfügen:

```js
function fairShareOf(targetReps) {
  return Math.ceil(targetReps / 2);
}

function repsForAthleteOnChallenge(sets, athlete, challengeId) {
  let total = 0;
  for (const s of sets) {
    if (s.challenge_id === challengeId && s.athlete === athlete) total += s.reps;
  }
  return total;
}

// Returns array of penalty descriptors for one athlete on one week.
// challenges: weekly_challenges rows for that week
// sets: all sets for that week (any athlete, any challenge)
// athlete: 'Benny' | 'Jonas'
// cfg: { rule_mode, amount_cents }
function computePenalties(challenges, sets, athlete, cfg) {
  if (!challenges.length) return [];
  const mode = cfg.rule_mode;
  const amount = cfg.amount_cents;

  if (mode === 'per_challenge') {
    const out = [];
    for (const ch of challenges) {
      const reps = repsForAthleteOnChallenge(sets, athlete, ch.id);
      const share = fairShareOf(ch.target_reps);
      if (reps < share) out.push({
        athlete, challenge_id: ch.id, amount_cents: amount, rule_mode: mode,
        reason: `${ch.target_reps - reps * 2} Reps unter fairShare`,
      });
    }
    return out;
  }

  const perChMiss = challenges.map(ch => {
    const reps = repsForAthleteOnChallenge(sets, athlete, ch.id);
    const share = fairShareOf(ch.target_reps);
    return { ch, reps, share, missed: reps < share };
  });

  let failed = false;
  let reason = '';
  if (mode === 'per_week_any') {
    failed = perChMiss.some(x => x.missed);
    reason = failed ? `${perChMiss.filter(x => x.missed).length} Challenge(s) verfehlt` : '';
  } else if (mode === 'per_week_all') {
    failed = perChMiss.every(x => x.missed);
    reason = failed ? 'alle Challenges verfehlt' : '';
  } else { // per_week_aggregate (default)
    const totalReps = perChMiss.reduce((a, x) => a + x.reps, 0);
    const totalShare = perChMiss.reduce((a, x) => a + x.share, 0);
    failed = totalReps < totalShare;
    reason = failed ? `aggregiert ${totalShare - totalReps} Reps unter fairShare` : '';
  }

  return failed
    ? [{ athlete, challenge_id: null, amount_cents: amount, rule_mode: mode, reason }]
    : [];
}
```

- [ ] **Step 2: Funktion in `PTData` exportieren**

In `www/data.js` am Ende der IIFE, dort wo `window.PTData = {...}` zusammengebaut wird (Suche: `window.PTData =`), die Funktion mit aufnehmen:

```js
window.PTData = {
  ...existing,
  computePenalties,
};
```

Falls die existing-Struktur anders aussieht: einfach `computePenalties` und `fairShareOf` als zusätzliche Properties anhängen.

- [ ] **Step 3: Sanity-Check im Browser**

Preview öffnen, in DevTools-Konsole:

```js
PTData.computePenalties(
  [{id:'a', target_reps: 100}],
  [{challenge_id:'a', athlete:'Benny', reps: 60}],
  'Benny',
  { rule_mode: 'per_week_aggregate', amount_cents: 500 }
);
```

Erwartet: `[]` (Benny hat 60 ≥ ceil(100/2) = 50).

```js
PTData.computePenalties(
  [{id:'a', target_reps: 100}],
  [{challenge_id:'a', athlete:'Benny', reps: 30}],
  'Benny',
  { rule_mode: 'per_week_aggregate', amount_cents: 500 }
);
```

Erwartet: `[{athlete:'Benny', challenge_id: null, amount_cents: 500, rule_mode: 'per_week_aggregate', reason: 'aggregiert 20 Reps unter fairShare'}]`.

- [ ] **Step 4: Commit**

```bash
git add www/data.js
git commit -m "feat(data): add computePenalties pure function"
```

---

### Task 3: Demo-Mode API für Strafkonto

**Files:**
- Modify: `www/data.js` — `createDemoAPI` und `loadDemo`

- [ ] **Step 1: `loadDemo()` um neue Felder erweitern**

In `loadDemo()` den Default-Return-Wert ergänzen:

```js
return {
  categories: [...],
  challenges: [],
  sets: [],
  reactions: [],
  penalty_config: { id: 1, enabled: false, rule_mode: 'per_week_aggregate', amount_cents: 500, currency: 'EUR', updated_at: new Date().toISOString() },
  penalties: [],
  week_closures: [],
};
```

In `loadDemo()` auch die Migration für gespeicherte Stores ergänzen (falls existing Store ohne penalty_*-Felder geladen wird):

```js
function loadDemo() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.penalty_config ||= { id: 1, enabled: false, rule_mode: 'per_week_aggregate', amount_cents: 500, currency: 'EUR', updated_at: new Date().toISOString() };
      s.penalties ||= [];
      s.week_closures ||= [];
      return s;
    }
  } catch (e) {}
  return {
    categories: [/* ... bestehend ... */],
    challenges: [],
    sets: [],
    reactions: [],
    penalty_config: { id: 1, enabled: false, rule_mode: 'per_week_aggregate', amount_cents: 500, currency: 'EUR', updated_at: new Date().toISOString() },
    penalties: [],
    week_closures: [],
  };
}
```

- [ ] **Step 2: Demo-API-Methoden einfügen**

In `createDemoAPI()` im returned Object, am Ende vor dem schließenden `}` der Demo-API, einfügen:

```js
      // ── Penalty system ─────────────────────────────────────────────────
      async getPenaltyConfig() {
        return { ...loadDemo().penalty_config };
      },
      async setPenaltyConfig(patch) {
        const s = loadDemo();
        Object.assign(s.penalty_config, patch, { updated_at: new Date().toISOString() });
        // Bei Aktivierung: alle vergangenen Challenge-Wochen stumm schließen
        if (patch.enabled === true) {
          const today = new Date(); today.setHours(0,0,0,0);
          const monday = mondayOf(today);
          const pastWeeks = new Set();
          for (const ch of s.challenges) {
            if (ch.week_start < isoDate(monday)) pastWeeks.add(ch.week_start);
          }
          for (const w of pastWeeks) {
            if (!s.week_closures.find(c => c.week_start === w)) {
              s.week_closures.push({ week_start: w, closed_at: new Date().toISOString(), closed_by: patch._by || 'Benny' });
            }
          }
        }
        saveDemo(s); emit();
        return { ...s.penalty_config };
      },
      async previewWeekClose(weekStart) {
        const s = loadDemo();
        const cfg = s.penalty_config;
        const chs = s.challenges.filter(c => c.week_start === weekStart);
        const wkSets = s.sets.filter(set => chs.find(c => c.id === set.challenge_id));
        if (!cfg.enabled) return { penalties: [], cfg };
        const pens = [];
        for (const a of ['Benny','Jonas']) {
          pens.push(...computePenalties(chs, wkSets, a, cfg));
        }
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart, by) {
        const s = loadDemo();
        if (s.week_closures.find(c => c.week_start === weekStart)) {
          throw new Error('Woche bereits abgeschlossen');
        }
        const cfg = s.penalty_config;
        const chs = s.challenges.filter(c => c.week_start === weekStart);
        const wkSets = s.sets.filter(set => chs.find(c => c.id === set.challenge_id));
        if (cfg.enabled) {
          for (const a of ['Benny','Jonas']) {
            const pens = computePenalties(chs, wkSets, a, cfg);
            for (const p of pens) {
              s.penalties.push({
                id: uid(),
                week_start: weekStart,
                athlete: p.athlete,
                challenge_id: p.challenge_id,
                amount_cents: p.amount_cents,
                rule_mode: p.rule_mode,
                created_at: new Date().toISOString(),
                paid: false,
                paid_at: null,
                paid_by: null,
                note: null,
              });
            }
          }
        }
        s.week_closures.push({ week_start: weekStart, closed_at: new Date().toISOString(), closed_by: by });
        saveDemo(s); emit();
        return { closed: true };
      },
      async reopenWeek(weekStart) {
        const s = loadDemo();
        s.penalties = s.penalties.filter(p => !(p.week_start === weekStart && !p.paid));
        s.week_closures = s.week_closures.filter(c => c.week_start !== weekStart);
        saveDemo(s); emit();
      },
      async listPenalties() {
        return [...loadDemo().penalties]
          .sort((a,b) => b.week_start.localeCompare(a.week_start) || b.created_at.localeCompare(a.created_at));
      },
      async markPenaltyPaid(id, { note, by }) {
        const s = loadDemo();
        const p = s.penalties.find(x => x.id === id);
        if (!p) throw new Error('Strafe nicht gefunden');
        p.paid = true; p.paid_at = new Date().toISOString(); p.paid_by = by; p.note = note ?? p.note;
        saveDemo(s); emit();
        return { ...p };
      },
      async unmarkPenaltyPaid(id) {
        const s = loadDemo();
        const p = s.penalties.find(x => x.id === id);
        if (!p) throw new Error('Strafe nicht gefunden');
        p.paid = false; p.paid_at = null; p.paid_by = null;
        saveDemo(s); emit();
        return { ...p };
      },
      async deletePenalty(id) {
        const s = loadDemo();
        s.penalties = s.penalties.filter(p => p.id !== id);
        saveDemo(s); emit();
      },
      async listClosures() {
        return [...loadDemo().week_closures].sort((a,b) => b.week_start.localeCompare(a.week_start));
      },
      async listOpenClosures() {
        const s = loadDemo();
        const today = new Date(); today.setHours(0,0,0,0);
        const monday = mondayOf(today);
        const closed = new Set(s.week_closures.map(c => c.week_start));
        const weeks = new Set();
        for (const ch of s.challenges) {
          if (ch.week_start < isoDate(monday) && !closed.has(ch.week_start)) weeks.add(ch.week_start);
        }
        return [...weeks].sort();
      },
```

- [ ] **Step 3: Sanity-Check im Browser (demo mode)**

Falls App im Demo-Mode läuft: in DevTools

```js
await PTData.api.getPenaltyConfig();
// → { id: 1, enabled: false, ... }

await PTData.api.setPenaltyConfig({ enabled: true, _by: 'Benny' });
await PTData.api.listClosures();
// → eine Row pro vergangener Challenge-Woche
```

- [ ] **Step 4: Commit**

```bash
git add www/data.js
git commit -m "feat(data): add demo-mode penalty API"
```

---

### Task 4: Supabase-API für Strafkonto

**Files:**
- Modify: `www/data.js` — `createSupabaseAPI` (oder wie sie heißt) inkl. Realtime-Channel

- [ ] **Step 1: API-Methoden in der Supabase-Implementierung einfügen**

Suche in `www/data.js` die Sektion, in der Supabase-Methoden definiert sind (analog zu `async listChallenges()` der Supabase-Variante, Zeile ~277). Direkt vor dem `}`, das die Supabase-API schließt, einfügen:

```js
      // ── Penalty system ─────────────────────────────────────────────────
      async getPenaltyConfig() {
        const { data, error } = await client.from('penalty_config').select('*').eq('id', 1).single();
        if (error) throw error;
        return data;
      },
      async setPenaltyConfig(patch) {
        const { _by, ...rest } = patch;
        const { data: cfg, error } = await client.from('penalty_config')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', 1).select().single();
        if (error) throw error;
        // Bei Aktivierung: stille Closures für vergangene Wochen
        if (patch.enabled === true) {
          const today = new Date(); today.setHours(0,0,0,0);
          const monday = mondayOf(today);
          const { data: chs } = await client.from('weekly_challenges')
            .select('week_start').lt('week_start', isoDate(monday));
          const seen = new Set();
          const rows = [];
          for (const c of chs || []) {
            if (!seen.has(c.week_start)) {
              seen.add(c.week_start);
              rows.push({ week_start: c.week_start, closed_by: _by || 'Benny' });
            }
          }
          if (rows.length) {
            await client.from('week_closures').upsert(rows, { onConflict: 'week_start', ignoreDuplicates: true });
          }
        }
        emit();
        return cfg;
      },
      async previewWeekClose(weekStart) {
        const cfg = await this.getPenaltyConfig();
        const { data: chs } = await client.from('weekly_challenges').select('*').eq('week_start', weekStart);
        const challengeIds = (chs || []).map(c => c.id);
        let wkSets = [];
        if (challengeIds.length) {
          const { data } = await client.from('sets').select('*').in('challenge_id', challengeIds);
          wkSets = data || [];
        }
        if (!cfg.enabled) return { penalties: [], cfg };
        const pens = [];
        for (const a of ['Benny','Jonas']) {
          pens.push(...computePenalties(chs || [], wkSets, a, cfg));
        }
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart, by) {
        // Atomare Verbuchung: closure-insert zuerst (PK schützt vor doppeltem Verbuchen)
        const { error: clErr } = await client.from('week_closures')
          .insert({ week_start: weekStart, closed_by: by });
        if (clErr) {
          if (clErr.code === '23505') throw new Error('Woche bereits abgeschlossen');
          throw clErr;
        }
        const { penalties } = await this.previewWeekClose(weekStart);
        if (penalties.length) {
          const rows = penalties.map(p => ({
            week_start: weekStart,
            athlete: p.athlete,
            challenge_id: p.challenge_id,
            amount_cents: p.amount_cents,
            rule_mode: p.rule_mode,
          }));
          const { error: pErr } = await client.from('penalties').insert(rows);
          if (pErr) throw pErr;
        }
        emit();
        return { closed: true };
      },
      async reopenWeek(weekStart) {
        await client.from('penalties').delete().eq('week_start', weekStart).eq('paid', false);
        await client.from('week_closures').delete().eq('week_start', weekStart);
        emit();
      },
      async listPenalties() {
        const { data, error } = await client.from('penalties').select('*')
          .order('week_start', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async markPenaltyPaid(id, { note, by }) {
        const { data, error } = await client.from('penalties')
          .update({ paid: true, paid_at: new Date().toISOString(), paid_by: by, note: note ?? null })
          .eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async unmarkPenaltyPaid(id) {
        const { data, error } = await client.from('penalties')
          .update({ paid: false, paid_at: null, paid_by: null })
          .eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deletePenalty(id) {
        const { error } = await client.from('penalties').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async listClosures() {
        const { data, error } = await client.from('week_closures').select('*')
          .order('week_start', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async listOpenClosures() {
        const today = new Date(); today.setHours(0,0,0,0);
        const monday = mondayOf(today);
        const [chsRes, clRes] = await Promise.all([
          client.from('weekly_challenges').select('week_start').lt('week_start', isoDate(monday)),
          client.from('week_closures').select('week_start'),
        ]);
        if (chsRes.error) throw chsRes.error;
        if (clRes.error) throw clRes.error;
        const closed = new Set((clRes.data || []).map(c => c.week_start));
        const weeks = new Set();
        for (const ch of chsRes.data || []) if (!closed.has(ch.week_start)) weeks.add(ch.week_start);
        return [...weeks].sort();
      },
```

- [ ] **Step 2: Realtime-Subscriptions erweitern**

Suche in derselben Datei die Stelle, an der bestehende Realtime-Channels eingerichtet werden (z.B. Zeile ~219 mit `.on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_challenges' }, emit)`). Direkt nach den bestehenden Subscriptions analog ergänzen:

```js
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalties' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_closures' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalty_config' }, emit)
```

- [ ] **Step 3: Sanity-Check via MCP**

```sql
-- nach setPenaltyConfig({enabled: true}):
SELECT * FROM penalty_config WHERE id = 1;
SELECT count(*) FROM week_closures;
```

- [ ] **Step 4: Commit**

```bash
git add www/data.js
git commit -m "feat(data): add supabase penalty API + realtime"
```

---

### Task 5: CSS für Strafkonto-UI

**Files:**
- Modify: `www/styles.css` — ans Ende anhängen

- [ ] **Step 1: CSS-Block anhängen**

```css
/* ── Strafkonto ──────────────────────────────────────────────────────── */
.strafkonto-screen { padding: 0; }
.strafkonto-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 4px 12px;
}
.strafkonto-header .title { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; }
.strafkonto-pot {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
  margin-bottom: 14px;
}
.strafkonto-pot-amount {
  font-family: "SF Pro Display", -apple-system, system-ui, sans-serif;
  font-size: 44px; font-weight: 700; letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  line-height: 1;
}
.strafkonto-pot-label { font-size: 13px; color: var(--text-2); margin-top: 6px; font-weight: 500; }
.strafkonto-pot-split { font-size: 13px; color: var(--text-2); margin-top: 10px; }
.strafkonto-pot-split .b { color: var(--accent); font-weight: 700; }
.strafkonto-pot-split .j { color: var(--accent-3); font-weight: 700; }

.strafkonto-section { margin-top: 18px; }
.strafkonto-section-label {
  font-size: 11px; font-weight: 700; color: var(--text-2);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.penalty-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  cursor: pointer;
  transition: background .15s;
}
.penalty-row:hover { background: var(--surface-2); }
.penalty-row-main { flex: 1; min-width: 0; }
.penalty-row-head { font-size: 15px; font-weight: 600; }
.penalty-row-meta { font-size: 13px; color: var(--text-2); margin-top: 2px; }
.penalty-row-amount {
  font-size: 17px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-right: 10px;
}
.penalty-row.paid { opacity: 0.55; }
.penalty-row.paid .penalty-row-amount { text-decoration: line-through; }
.penalty-check {
  width: 22px; height: 22px; border-radius: 999px;
  border: 1.5px solid var(--border);
  background: transparent;
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--accent);
  font-size: 13px;
}
.penalty-row.paid .penalty-check { background: var(--accent); border-color: var(--accent); color: #000; }

.strafkonto-empty {
  text-align: center; padding: 40px 20px;
  color: var(--text-2);
  font-size: 15px;
}
.strafkonto-empty .emoji { font-size: 48px; margin-bottom: 12px; }

/* Open-closures section in Strafkonto tab */
.open-closure-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  background: color-mix(in oklab, var(--warning) 10%, var(--surface));
  border: 1px solid color-mix(in oklab, var(--warning) 30%, transparent);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  cursor: pointer;
}
.open-closure-row:hover { background: color-mix(in oklab, var(--warning) 16%, var(--surface)); }
.open-closure-label { font-size: 15px; font-weight: 600; }
.open-closure-chev { color: var(--text-2); }

/* Week-close banner on Home */
.weekclose-banner {
  background: color-mix(in oklab, var(--warning) 10%, var(--surface));
  border: 1px solid color-mix(in oklab, var(--warning) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  margin: 14px 0;
}
.weekclose-banner-title { font-size: 15px; font-weight: 700; }
.weekclose-banner-sub { font-size: 13px; color: var(--text-2); margin-top: 4px; }
.weekclose-banner-btn {
  margin-top: 10px;
  width: 100%; padding: 10px 14px;
  background: var(--accent);
  color: #000;
  border: none; border-radius: 999px;
  font-size: 15px; font-weight: 700;
  cursor: pointer;
}

/* Penalty config card in settings */
.penalty-config { display: flex; flex-direction: column; gap: 12px; }
.penalty-config-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
}
.penalty-config-row label { font-size: 15px; font-weight: 500; }
.penalty-config-row input[type="number"] {
  width: 80px; padding: 8px 10px; border-radius: 8px;
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text);
  font-size: 15px; text-align: right;
  font-variant-numeric: tabular-nums;
}
.penalty-mode-list { display: flex; flex-direction: column; gap: 6px; }
.penalty-mode-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.penalty-mode-row.active {
  background: color-mix(in oklab, var(--accent) 10%, var(--surface-2));
  border: 1px solid color-mix(in oklab, var(--accent) 28%, transparent);
}
.penalty-mode-radio {
  width: 20px; height: 20px; border-radius: 999px;
  border: 1.5px solid var(--border);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.penalty-mode-row.active .penalty-mode-radio {
  border-color: var(--accent);
  background: var(--accent);
}
.penalty-mode-row.active .penalty-mode-radio::after {
  content: ''; width: 8px; height: 8px; border-radius: 999px; background: #000;
}
.penalty-mode-text { flex: 1; }
.penalty-mode-name { font-size: 15px; font-weight: 600; }
.penalty-mode-desc { font-size: 13px; color: var(--text-2); margin-top: 2px; }
```

- [ ] **Step 2: Commit**

```bash
git add www/styles.css
git commit -m "style(strafkonto): add styles for tab, banner, config card"
```

---

### Task 6: `StrafkontoScreen` Komponente (neue Datei)

**Files:**
- Create: `www/strafkonto.jsx`
- Modify: `www/index.html` — Script-Tag einfügen

- [ ] **Step 1: `www/strafkonto.jsx` schreiben**

```jsx
/* global React, PTData */
const { useState } = React;

function formatEuro(cents) {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

function weekLabel(weekStart) {
  // Mo 06.05.
  const d = new Date(weekStart + 'T00:00:00');
  const kw = (() => {
    const a = new Date(d); a.setHours(0,0,0,0);
    a.setDate(a.getDate() + 4 - (a.getDay() || 7));
    const yStart = new Date(a.getFullYear(), 0, 1);
    return Math.ceil((((a - yStart) / 86400000) + 1) / 7);
  })();
  return `KW ${kw}`;
}

function reasonText(p) {
  switch (p.rule_mode) {
    case 'per_challenge':       return 'einzelne Challenge verfehlt';
    case 'per_week_any':        return 'min. 1 Challenge verfehlt';
    case 'per_week_all':        return 'alle Challenges verfehlt';
    case 'per_week_aggregate':  return 'aggregiert verfehlt';
    default:                    return p.rule_mode;
  }
}

function StrafkontoScreen({ api, me, penalties, closures, openClosures, onChange, onOpenSettings }) {
  const [settlement, setSettlement] = useState(null); // penalty being settled
  const [closing, setClosing] = useState(null);       // weekStart being closed

  const open = penalties.filter(p => !p.paid);
  const paid = penalties.filter(p => p.paid);
  const potTotal = open.reduce((a, p) => a + p.amount_cents, 0);
  const potBenny = open.filter(p => p.athlete === 'Benny').reduce((a, p) => a + p.amount_cents, 0);
  const potJonas = open.filter(p => p.athlete === 'Jonas').reduce((a, p) => a + p.amount_cents, 0);

  const closuresWithoutPenalty = closures.filter(c => !penalties.find(p => p.week_start === c.week_start));

  if (!penalties.length && !openClosures.length && !closures.length) {
    return (
      <div className="strafkonto-screen">
        <div className="strafkonto-header">
          <div className="title">Strafkonto</div>
          <button className="icon-btn" aria-label="Einstellungen" onClick={onOpenSettings}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
        <div className="strafkonto-empty">
          <div className="emoji">🧼</div>
          <div>Noch sauber. Lasst es so.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="strafkonto-screen">
      <div className="strafkonto-header">
        <div className="title">Strafkonto</div>
        <button className="icon-btn" aria-label="Einstellungen" onClick={onOpenSettings}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
        </button>
      </div>

      <div className="strafkonto-pot">
        <div className="strafkonto-pot-amount mono">{formatEuro(potTotal)}</div>
        <div className="strafkonto-pot-label">im Topf</div>
        {(potBenny > 0 || potJonas > 0) && (
          <div className="strafkonto-pot-split">
            <span className="b">Benny: {formatEuro(potBenny)}</span>
            {' · '}
            <span className="j">Jonas: {formatEuro(potJonas)}</span>
          </div>
        )}
      </div>

      {openClosures.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Offene Abschlüsse</div>
          {openClosures.map(w => (
            <div key={w} className="open-closure-row" onClick={() => setClosing(w)}>
              <span className="open-closure-label">{weekLabel(w)} abschließen</span>
              <span className="open-closure-chev">▸</span>
            </div>
          ))}
        </div>
      )}

      {open.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Offen</div>
          {open.map(p => (
            <div key={p.id} className="penalty-row" onClick={() => setSettlement(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {p.athlete}</div>
                <div className="penalty-row-meta">{reasonText(p)}</div>
              </div>
              <div className="penalty-row-amount mono">{formatEuro(p.amount_cents)}</div>
              <div className="penalty-check"/>
            </div>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Bezahlt</div>
          {paid.map(p => (
            <div key={p.id} className="penalty-row paid" onClick={() => setSettlement(p)}>
              <div className="penalty-row-main">
                <div className="penalty-row-head">{weekLabel(p.week_start)} · {p.athlete}</div>
                <div className="penalty-row-meta">
                  {p.note || 'bezahlt'}{p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString('de-DE')}` : ''}
                </div>
              </div>
              <div className="penalty-row-amount mono">{formatEuro(p.amount_cents)}</div>
              <div className="penalty-check">✓</div>
            </div>
          ))}
        </div>
      )}

      {closuresWithoutPenalty.length > 0 && (
        <div className="strafkonto-section">
          <div className="strafkonto-section-label">Abgeschlossene Wochen — straffrei</div>
          {closuresWithoutPenalty.map(c => (
            <div key={c.week_start} className="penalty-row">
              <div className="penalty-row-main">
                <div className="penalty-row-head">✓ {weekLabel(c.week_start)} · alles geschafft</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settlement-Sheet */}
      {settlement && (
        <SettlementSheet
          penalty={settlement}
          api={api}
          me={me}
          onClose={() => setSettlement(null)}
          onDone={() => { setSettlement(null); onChange?.(); }}
        />
      )}

      {/* Wochenabschluss-Sheet */}
      {closing && (
        <WeekCloseSheet
          weekStart={closing}
          api={api}
          me={me}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); onChange?.(); }}
        />
      )}
    </div>
  );
}

function SettlementSheet({ penalty, api, me, onClose, onDone }) {
  const [note, setNote] = useState(penalty.note || '');
  const [busy, setBusy] = useState(false);

  async function settle() {
    setBusy(true);
    try {
      await api.markPenaltyPaid(penalty.id, { note: note || null, by: me });
      onDone();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  async function unsettle() {
    setBusy(true);
    try { await api.unmarkPenaltyPaid(penalty.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('Strafe wirklich löschen?')) return;
    setBusy(true);
    try { await api.deletePenalty(penalty.id); onDone(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>Strafe</h2>
      <div className="subtitle" style={{marginBottom:18}}>
        {weekLabel(penalty.week_start)} · {penalty.athlete} · {formatEuro(penalty.amount_cents)}
      </div>
      {!penalty.paid ? (
        <>
          <div className="label" style={{marginBottom:6}}>Notiz (optional)</div>
          <input className="quick-chip-input" style={{width:'100%'}}
            type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="z.B. Pizza ausgegeben"/>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button className="btn-ghost-sm" onClick={onClose}>Abbrechen</button>
            <button className="btn-ghost-sm" onClick={remove} disabled={busy}>Löschen</button>
            <button className="btn-ghost-sm primary" onClick={settle} disabled={busy}>Einlösen</button>
          </div>
        </>
      ) : (
        <>
          <div style={{marginBottom:16,color:'var(--text-2)'}}>
            Bezahlt von {penalty.paid_by || '–'} am {penalty.paid_at ? new Date(penalty.paid_at).toLocaleDateString('de-DE') : '–'}
            {penalty.note ? ` · „${penalty.note}"` : ''}
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button className="btn-ghost-sm" onClick={onClose}>Schließen</button>
            <button className="btn-ghost-sm" onClick={remove} disabled={busy}>Löschen</button>
            <button className="btn-ghost-sm primary" onClick={unsettle} disabled={busy}>Zurücksetzen</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function WeekCloseSheet({ weekStart, api, me, onClose, onDone }) {
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    let alive = true;
    api.previewWeekClose(weekStart).then(r => { if (alive) setPreview(r); });
    return () => { alive = false; };
  }, [api, weekStart]);

  async function confirm() {
    setBusy(true);
    try {
      await api.closeWeek(weekStart, me);
      onDone();
    } catch (e) { alert(e.message); onClose(); }
    finally { setBusy(false); }
  }

  const pens = preview?.penalties || [];
  const total = pens.reduce((a, p) => a + p.amount_cents, 0);

  return (
    <Sheet open={true} onClose={onClose}>
      <h2 className="title" style={{marginBottom:8}}>{weekLabel(weekStart)} abschließen?</h2>
      {!preview ? <div className="subtitle">Lade Vorschau…</div> : pens.length ? (
        <>
          <div className="subtitle" style={{marginBottom:12}}>Folgende Strafen werden gebucht:</div>
          {pens.map((p, i) => (
            <div key={i} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontWeight:600}}>{p.athlete} — {formatEuro(p.amount_cents)}</div>
              <div style={{fontSize:13,color:'var(--text-2)',marginTop:2}}>{p.reason}</div>
            </div>
          ))}
          <div style={{marginTop:12,fontWeight:700,fontSize:17}}>
            Gesamt: {formatEuro(total)}
          </div>
        </>
      ) : (
        <div className="subtitle">✓ Beide haben geschafft. Keine Strafen.</div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
        <button className="btn-ghost-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button className="btn-ghost-sm primary" onClick={confirm} disabled={busy || !preview}>
          {pens.length ? 'Verbuchen' : 'Abschließen'}
        </button>
      </div>
    </Sheet>
  );
}

function PenaltyConfigCard({ api, cfg, onChange }) {
  const [busy, setBusy] = useState(false);
  const modes = [
    { id: 'per_week_aggregate', name: 'Aggregiert pro Woche', desc: 'Summe Reps < Summe fairShare → Strafe' },
    { id: 'per_challenge',      name: 'Pro Challenge',         desc: 'Eine Strafe pro verfehlter Challenge' },
    { id: 'per_week_any',       name: 'Min. 1 Challenge verfehlt', desc: 'Eine Strafe pro Woche, falls min. 1 nicht geschafft' },
    { id: 'per_week_all',       name: 'Alle Challenges verfehlt',  desc: 'Strafe nur, wenn gar nichts geschafft' },
  ];

  async function patch(p) {
    setBusy(true);
    try { await api.setPenaltyConfig(p); onChange?.(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="label" style={{marginBottom:10}}>Strafkonto</div>
      <div className="penalty-config">
        <div className="penalty-config-row">
          <label>Aktiv</label>
          <label className="toggle-switch">
            <input type="checkbox" checked={!!cfg?.enabled}
              onChange={e => patch({ enabled: e.target.checked, _by: 'Benny' })} disabled={busy}/>
            <span className="toggle-slider"/>
          </label>
        </div>
        <div className="penalty-config-row">
          <label>Betrag pro Strafe (€)</label>
          <input type="number" min="1" step="1" disabled={busy}
            defaultValue={cfg ? Math.round(cfg.amount_cents / 100) : 5}
            onBlur={e => {
              const eur = parseInt(e.target.value);
              if (Number.isFinite(eur) && eur > 0) patch({ amount_cents: eur * 100 });
            }}/>
        </div>
        <div className="penalty-mode-list">
          {modes.map(m => (
            <div key={m.id}
              className={`penalty-mode-row ${cfg?.rule_mode === m.id ? 'active' : ''}`}
              onClick={() => !busy && patch({ rule_mode: m.id })}>
              <span className="penalty-mode-radio"/>
              <div className="penalty-mode-text">
                <div className="penalty-mode-name">{m.name}</div>
                <div className="penalty-mode-desc">{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.StrafkontoScreen = StrafkontoScreen;
window.PenaltyConfigCard = PenaltyConfigCard;
```

- [ ] **Step 2: Script-Tag in `www/index.html` einfügen**

Suche in `www/index.html` die Stelle, an der `screens.jsx`, `settings.jsx`, `app.jsx` etc. geladen werden. Direkt nach `screens.jsx` einfügen:

```html
<script type="text/babel" data-presets="env,react" src="strafkonto.jsx"></script>
```

- [ ] **Step 3: Smoke-Test im Browser**

Preview reloaden. Console: `window.StrafkontoScreen && window.PenaltyConfigCard` → beide truthy.

- [ ] **Step 4: Commit**

```bash
git add www/strafkonto.jsx www/index.html
git commit -m "feat(strafkonto): add screen, settlement, weekclose, config card"
```

---

### Task 7: Week-Close-Banner im HomeScreen

**Files:**
- Modify: `www/screens.jsx` — `HomeScreen` Render

- [ ] **Step 1: Banner-Komponente einfügen**

In `www/screens.jsx` direkt vor der `HomeScreen`-Funktion einfügen:

```jsx
function WeekCloseBanner({ weekStart, openClosures, onClose }) {
  if (!openClosures.includes(weekStart)) return null;
  return (
    <div className="weekclose-banner">
      <div className="weekclose-banner-title">Woche ist um.</div>
      <div className="weekclose-banner-sub">Strafkonto-Abschluss noch offen.</div>
      <button className="weekclose-banner-btn" onClick={onClose}>Woche abschließen</button>
    </div>
  );
}
```

- [ ] **Step 2: Banner im HomeScreen einbinden**

`HomeScreen` bekommt zwei neue Props: `openClosures` (Array von weekStart-Strings) und `onCloseWeek(weekStart)`. Diese Props in der Signatur ergänzen (Zeile ~159):

```jsx
function HomeScreen({ api, me, challenges = [], categories = [], allSets = [], layout,
  weekStart, nextWeekStart, nextWeekChallenges = [], nextWeekProposals = [],
  openClosures = [], onCloseWeek,
  onAddGoal, onEditChallenge, onLogChallenge, onQuickLog,
  challenge, category, sets, onSetup, onLog }) {
```

Das Banner rendern — direkt nach dem Header der Heute-Ansicht, vor der ersten Challenge-Karte. Konkret: im JSX-Return, nach den Empty-State-Checks, vor dem `swiper`/`challenges.map`:

```jsx
{openClosures.length > 0 && openClosures.map(w => (
  <WeekCloseBanner key={w} weekStart={w} openClosures={openClosures} onClose={() => onCloseWeek(w)}/>
))}
```

- [ ] **Step 3: Smoke-Test**

Preview reloaden. Im Demo-Mode (oder Supabase): manuell eine vergangene Woche kreieren und über `api.setPenaltyConfig({enabled: true})` aktivieren. Banner sollte erscheinen.

- [ ] **Step 4: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): add weekclose banner for past unclosed weeks"
```

---

### Task 8: App.jsx — Tab + State + Routing

**Files:**
- Modify: `www/app.jsx`

- [ ] **Step 1: State + Reload erweitern**

Im `App`-Component (Zeile ~15-100 Bereich):

```jsx
const [penalties, setPenalties] = useState([]);
const [closures, setClosures] = useState([]);
const [openClosures, setOpenClosures] = useState([]);
const [penaltyConfig, setPenaltyConfig] = useState(null);
```

In der `reload`-Funktion (ca. Zeile 169) den `Promise.all`-Block erweitern:

```jsx
const [cats, challs, feedData, allSetsData, slots, cfg, pens, cls, openCls, penCfg] = await Promise.all([
  api.getCategories(),
  api.listChallenges(),
  api.recentFeed(100),
  api.getAllSets ? api.getAllSets() : api.recentFeed(10000),
  api.getPlanSlots ? api.getPlanSlots() : [],
  api.getRotationConfig ? api.getRotationConfig() : null,
  api.listPenalties ? api.listPenalties() : [],
  api.listClosures ? api.listClosures() : [],
  api.listOpenClosures ? api.listOpenClosures() : [],
  api.getPenaltyConfig ? api.getPenaltyConfig() : null,
]);
setCategories(cats);
setAllChallenges(challs);
setFeed(feedData);
setAllSets(allSetsData);
setPlanSlots(slots);
setRotationConfig(cfg);
setPenalties(pens);
setClosures(cls);
setOpenClosures(openCls);
setPenaltyConfig(penCfg);
```

- [ ] **Step 2: HomeScreen-Props erweitern**

Beim Render des HomeScreen (ca. Zeile 351-372) die neuen Props übergeben:

```jsx
challenges={currentChallenges}
...existing props...
openClosures={openClosures}
onCloseWeek={(w) => setTab('strafkonto')}  // einfacher: zum Strafkonto-Tab springen, dort wird das Sheet geöffnet
```

Alternativ ein In-Place-Sheet auf der Home-Seite: dazu einen `closingWeek` State auf App-Ebene + `WeekCloseSheet` im JSX. Für Minimal-Path: zum Tab springen.

- [ ] **Step 3: Strafkonto-Tab rendern**

Vor dem schließenden `</main>`-Tag (nach dem Settings-Block, ca. Zeile 402):

```jsx
{tab === 'strafkonto' &&
  <StrafkontoScreen
    api={api} me={me}
    penalties={penalties}
    closures={closures}
    openClosures={openClosures}
    onChange={reload}
    onOpenSettings={() => setTab('settings')}/>
}
```

- [ ] **Step 4: Bottom-Nav-Slot ergänzen**

Im `<nav className="tabbar">`-Block (Zeile 405-417), nach dem `history`-Button:

```jsx
<button className={`tab-btn ${tab === 'strafkonto' ? 'active' : ''}`} onClick={() => setTab('strafkonto')}>
  <Icon name="strafkonto" /> Strafkonto
  {penalties.filter(p => !p.paid).length > 0 && (
    <span className="tab-badge">{penalties.filter(p => !p.paid).length}</span>
  )}
</button>
```

- [ ] **Step 5: Icon `strafkonto` in `components.jsx` ergänzen**

Suche in `www/components.jsx` die `Icon`-Komponente (oder vergleichbar). Im switch/case für `name` einen neuen Fall:

```jsx
case 'strafkonto':
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M8 9h6.5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 0 0 5H16"/></svg>);
```

Falls keine Icon-Komponente existiert oder anders strukturiert ist: direkt inline-SVG im app.jsx Tab-Button verwenden.

- [ ] **Step 6: CSS für Tab-Badge** (kleines Add-on)

In `www/styles.css`:

```css
.tab-btn { position: relative; }
.tab-badge {
  position: absolute; top: 4px; right: calc(50% - 18px);
  background: var(--danger);
  color: #fff;
  font-size: 10px; font-weight: 700;
  min-width: 16px; height: 16px;
  border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0 4px;
}
```

- [ ] **Step 7: Smoke-Test im Browser**

Preview reloaden. Bottom-Nav zeigt vier Slots. Tap auf „Strafkonto" → Empty-State oder Liste. Wenn Strafen offen → Badge auf Tab.

- [ ] **Step 8: Commit**

```bash
git add www/app.jsx www/components.jsx www/styles.css
git commit -m "feat(app): add strafkonto tab + state wiring"
```

---

### Task 9: Settings.jsx — `PenaltyConfigCard` einbinden

**Files:**
- Modify: `www/settings.jsx`

- [ ] **Step 1: Card in `SettingsScreen` rendern**

In `www/settings.jsx` in der `SettingsScreen`-Komponente, an passender Stelle (z.B. nach `AppearanceCard`):

```jsx
const [penaltyCfg, setPenaltyCfg] = useState(null);
useEffect(() => {
  if (!api.getPenaltyConfig) return;
  let alive = true;
  api.getPenaltyConfig().then(c => { if (alive) setPenaltyCfg(c); });
  return () => { alive = false; };
}, [api]);
```

Im Render:

```jsx
{penaltyCfg !== null && <PenaltyConfigCard api={api} cfg={penaltyCfg}
  onChange={() => api.getPenaltyConfig?.().then(setPenaltyCfg)}/>}
```

- [ ] **Step 2: Re-Open-Sektion ergänzen** (optional, kann später)

Wenn Zeit: kleine Section unter der Config-Card mit „Vergangene Woche neu öffnen" Liste. Für jetzt: weglassen — re-open kann über Direct-DB-Edit oder spätere Iteration.

- [ ] **Step 3: Smoke-Test**

Preview, in Einstellungen scrollen → Card sichtbar → Toggle, Betrag, Modus änderbar. Werte persistieren nach Reload.

- [ ] **Step 4: Commit**

```bash
git add www/settings.jsx
git commit -m "feat(settings): mount penalty config card"
```

---

### Task 10: End-to-End-Smoke + Polish

**Files:**
- Test via Browser-Preview + MCP

- [ ] **Step 1: Vollen Flow durchspielen (Supabase)**

1. Settings → Strafkonto „Aktiv" einschalten → Toast sollte erscheinen, Banner ggf. auf Home für vergangene Woche.
2. Banner-Button → Sheet öffnet sich → Vorschau zeigt 0 oder n Strafen → „Verbuchen".
3. Strafkonto-Tab → Pot zeigt Summe; offene Strafen in Liste.
4. Auf eine offene Strafe tappen → Sheet → Notiz „Bier" → „Einlösen".
5. Strafe wandert in „Bezahlt"-Sektion mit durchgestrichenem Betrag.
6. Tap auf bezahlte Strafe → „Zurücksetzen" oder „Löschen".
7. Settings → Betrag von 5 auf 10 ändern → Reload → neue Strafen verwenden 10 €, alte bleiben bei 5 €.

- [ ] **Step 2: Race-Condition manuell prüfen**

Per MCP `execute_sql`:

```sql
SELECT week_start FROM week_closures ORDER BY closed_at DESC LIMIT 5;
```

Zweimal hintereinander `closeWeek(w)` aus DevTools aufrufen → zweiter Aufruf wirft „Woche bereits abgeschlossen".

- [ ] **Step 3: Demo-Mode verifizieren**

LocalStorage löschen, neu laden ohne Supabase → App läuft im Demo-Mode → Strafkonto-Features funktionieren weiterhin (vor allem `setPenaltyConfig`, `closeWeek`, `markPaid`).

- [ ] **Step 4: README / SETUP-Notiz**

`www/SETUP.md` (falls existent) ergänzen oder `SETUP_PENALTY.sql` als eigenständige Anleitung referenzieren. Eine Zeile am Ende der Spec genügt.

- [ ] **Step 5: Final commit**

```bash
git status
# falls noch ungespeicherte Änderungen:
git add -p
git commit -m "feat(strafkonto): polish + e2e verification"
```

---

## Spec-Coverage-Check

| Spec-Sektion | Task |
|---|---|
| Datenmodell `penalty_config` | Task 1 |
| Datenmodell `penalties` | Task 1 |
| Datenmodell `week_closures` | Task 1 |
| Berechnungslogik 4 Modi | Task 2 |
| Demo-Mode | Task 3 |
| Supabase-API + Realtime | Task 4 |
| `closeWeek` Race Condition | Task 4 (PK-Constraint) |
| Initiale Aktivierung (stille Closures) | Task 3 + Task 4 (in `setPenaltyConfig`) |
| UI Strafkonto-Tab | Task 6 |
| UI Settlement-Sheet | Task 6 |
| UI WeekClose-Sheet | Task 6 |
| UI Config-Card | Task 6 + Task 9 |
| UI Week-Close-Banner | Task 7 |
| App-Routing + Bottom-Nav | Task 8 |
| Re-Open-Flow | Vorhanden in API (Task 3+4) — UI bewusst out-of-scope für MVP, kommt mit Task 9 Step 2 als Optional |
| Edge Cases 1-10 | Über die o.g. Tasks abgedeckt |
