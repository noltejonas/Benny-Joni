# Work Tracking Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Work" category to the Benny-Joni fitness tracker so users can log vibe-coding sessions with duration (manual or live timer) and two tags (Project + Tool), alongside the existing sports challenges, with a tab toggle to switch between Sports and Work views.

**Architecture:** Extend the existing categories table with a `kind` discriminator (`sports` | `work`); add `project_tags` and `tool_tags` tables following the same schema; add nullable `duration_minutes`, `project_tag_id`, `tool_tag_id` columns to `sets`. All new tables follow the existing dual-mode (Supabase / localStorage demo) API pattern. UI switches between Sports and Work via a tab toggle on HomeScreen; LogSheet branches on `kind` to show timer + tag pickers instead of reps.

**Tech Stack:** Vanilla React (no JSX build step), Supabase JS client, plain SQL migrations, CSS variables for theming

**Spec:** `work-tracking-plan.md`

## Global Constraints

- No new npm dependencies; all JS is browser-loaded vanilla React
- Follow existing dual-API pattern: every new API method must exist in both `createDemoAPI()` and `createSupabaseAPI()` in `www/data.js`
- Demo data persisted in localStorage key `pt_demo_store_v1` (extend the existing object, never replace its shape)
- Default seed data: Project tags → IBM 🏢, Bauerlieferant 🚜, FarmerOS 🌱; Tool tags → Claude Code 🤖, Codex ⚡, Bob 🦾
- `target_reps` stores minutes for work challenges (hours × 60) — no schema change, only label/display changes
- All new SQL migrations use timestamp prefix `20260513______`
- The app has no test runner; verification is done by opening the app in a browser and following manual test steps

---

### Task 1: DB migration — `categories.kind` + `project_tags` + `tool_tags`

**Files:**
- Create: `supabase/migrations/20260513000000_work_tags.sql`

**Interfaces:**
- Produces: `categories.kind text NOT NULL DEFAULT 'sports'`, table `project_tags(id uuid, name text, emoji text, created_at timestamptz)`, table `tool_tags` (same schema)

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260513000000_work_tags.sql

-- 1. Add kind discriminator to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sports';
UPDATE categories SET kind = 'sports' WHERE kind IS NULL OR kind = '';

-- 2. project_tags table
CREATE TABLE IF NOT EXISTS project_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '📁',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read project_tags"  ON project_tags FOR SELECT USING (true);
CREATE POLICY "public write project_tags" ON project_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public update project_tags" ON project_tags FOR UPDATE USING (true);
CREATE POLICY "public delete project_tags" ON project_tags FOR DELETE USING (true);

-- 3. tool_tags table
CREATE TABLE IF NOT EXISTS tool_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '🔧',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tool_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tool_tags"  ON tool_tags FOR SELECT USING (true);
CREATE POLICY "public write tool_tags" ON tool_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "public update tool_tags" ON tool_tags FOR UPDATE USING (true);
CREATE POLICY "public delete tool_tags" ON tool_tags FOR DELETE USING (true);

-- 4. Seed default tags
INSERT INTO project_tags (name, emoji) VALUES
  ('IBM', '🏢'),
  ('Bauerlieferant', '🚜'),
  ('FarmerOS', '🌱')
ON CONFLICT DO NOTHING;

INSERT INTO tool_tags (name, emoji) VALUES
  ('Claude Code', '🤖'),
  ('Codex', '⚡'),
  ('Bob', '🦾')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply migration (Supabase CLI or dashboard SQL editor)**

```bash
supabase db push
# OR paste into Supabase dashboard → SQL Editor → Run
```

- [ ] **Step 3: Verify in Supabase dashboard**

Open Table Editor → categories: confirm `kind` column exists with value `'sports'` on all rows.
Open Table Editor → project_tags: confirm 3 seed rows (IBM, Bauerlieferant, FarmerOS).
Open Table Editor → tool_tags: confirm 3 seed rows (Claude Code, Codex, Bob).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000000_work_tags.sql
git commit -m "feat: add categories.kind and project_tags/tool_tags tables"
```

---

### Task 2: DB migration — extend `sets` table

**Files:**
- Create: `supabase/migrations/20260513010000_sets_work_columns.sql`

**Interfaces:**
- Consumes: Task 1 tables (`project_tags`, `tool_tags`) must exist
- Produces: `sets.duration_minutes integer`, `sets.project_tag_id uuid`, `sets.tool_tag_id uuid`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260513010000_sets_work_columns.sql

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS project_tag_id   uuid REFERENCES project_tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tool_tag_id      uuid REFERENCES tool_tags(id)    ON DELETE SET NULL;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

- [ ] **Step 3: Verify**

Open Supabase dashboard → Table Editor → sets: confirm three new nullable columns. Existing rows should show NULL for all three.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513010000_sets_work_columns.sql
git commit -m "feat: add duration_minutes, project_tag_id, tool_tag_id to sets"
```

---

### Task 3: Demo API — seed defaults + tag CRUD

**Files:**
- Modify: `www/data.js:24-40` (demo defaults), `www/data.js:115-401` (createDemoAPI)

**Interfaces:**
- Produces (demo API):
  - `api.getProjectTags() → Promise<Array<{id, name, emoji}>>`
  - `api.addProjectTag(name, emoji) → Promise<{id, name, emoji}>`
  - `api.updateProjectTag(id, {name?, emoji?}) → Promise<{id, name, emoji}>`
  - `api.deleteProjectTag(id) → Promise<void>`
  - `api.getToolTags()` / `api.addToolTag()` / `api.updateToolTag()` / `api.deleteToolTag()` — same signatures

- [ ] **Step 1: Add seed defaults for project_tags and tool_tags in `loadDemo()`**

In `www/data.js`, find the `return { categories: [...], challenges: [], sets: [], ... }` block (lines ~24-39) and add:

```js
    return {
      categories: [
        { id: 'c1', name: 'Liegestütze', emoji: '🤜', kind: 'sports' },
        { id: 'c2', name: 'Klimmzüge',  emoji: '🆙', kind: 'sports' },
        { id: 'c3', name: 'Sit-ups',    emoji: '🧘', kind: 'sports' },
        { id: 'c4', name: 'Kniebeugen', emoji: '🦵', kind: 'sports' },
        { id: 'c5', name: 'Burpees',    emoji: '🔥', kind: 'sports' },
      ],
      project_tags: [
        { id: 'pt1', name: 'IBM',           emoji: '🏢', created_at: new Date().toISOString() },
        { id: 'pt2', name: 'Bauerlieferant', emoji: '🚜', created_at: new Date().toISOString() },
        { id: 'pt3', name: 'FarmerOS',      emoji: '🌱', created_at: new Date().toISOString() },
      ],
      tool_tags: [
        { id: 'tt1', name: 'Claude Code', emoji: '🤖', created_at: new Date().toISOString() },
        { id: 'tt2', name: 'Codex',       emoji: '⚡', created_at: new Date().toISOString() },
        { id: 'tt3', name: 'Bob',         emoji: '🦾', created_at: new Date().toISOString() },
      ],
      challenges: [],
      sets: [],
      reactions: [],
      penalty_config: defaultPenaltyConfig(),
      penalties: [],
      week_closures: [],
      payouts: [],
    };
```

Also in the `loadDemo()` hydration block (lines ~17-22), add guards so existing stored data gets the new arrays:

```js
        s.project_tags ||= [
          { id: 'pt1', name: 'IBM',           emoji: '🏢', created_at: new Date().toISOString() },
          { id: 'pt2', name: 'Bauerlieferant', emoji: '🚜', created_at: new Date().toISOString() },
          { id: 'pt3', name: 'FarmerOS',      emoji: '🌱', created_at: new Date().toISOString() },
        ];
        s.tool_tags ||= [
          { id: 'tt1', name: 'Claude Code', emoji: '🤖', created_at: new Date().toISOString() },
          { id: 'tt2', name: 'Codex',       emoji: '⚡', created_at: new Date().toISOString() },
          { id: 'tt3', name: 'Bob',         emoji: '🦾', created_at: new Date().toISOString() },
        ];
        // Back-fill kind on legacy categories
        for (const c of (s.categories || [])) { c.kind ||= 'sports'; }
```

- [ ] **Step 2: Add tag CRUD methods to `createDemoAPI()`**

After the `deleteCategory` method (around line 151), add:

```js
      async getProjectTags() {
        return [...loadDemo().project_tags];
      },
      async addProjectTag(name, emoji = '📁') {
        const s = loadDemo();
        const tag = { id: uid(), name, emoji, created_at: new Date().toISOString() };
        s.project_tags.push(tag);
        saveDemo(s); emit();
        return tag;
      },
      async updateProjectTag(id, { name, emoji }) {
        const s = loadDemo();
        const tag = s.project_tags.find(t => t.id === id);
        if (!tag) throw new Error('Tag nicht gefunden');
        if (name  !== undefined) tag.name  = name;
        if (emoji !== undefined) tag.emoji = emoji;
        saveDemo(s); emit();
        return tag;
      },
      async deleteProjectTag(id) {
        const s = loadDemo();
        s.project_tags = s.project_tags.filter(t => t.id !== id);
        saveDemo(s); emit();
      },
      async getToolTags() {
        return [...loadDemo().tool_tags];
      },
      async addToolTag(name, emoji = '🔧') {
        const s = loadDemo();
        const tag = { id: uid(), name, emoji, created_at: new Date().toISOString() };
        s.tool_tags.push(tag);
        saveDemo(s); emit();
        return tag;
      },
      async updateToolTag(id, { name, emoji }) {
        const s = loadDemo();
        const tag = s.tool_tags.find(t => t.id === id);
        if (!tag) throw new Error('Tag nicht gefunden');
        if (name  !== undefined) tag.name  = name;
        if (emoji !== undefined) tag.emoji = emoji;
        saveDemo(s); emit();
        return tag;
      },
      async deleteToolTag(id) {
        const s = loadDemo();
        s.tool_tags = s.tool_tags.filter(t => t.id !== id);
        saveDemo(s); emit();
      },
```

- [ ] **Step 3: Update demo `addSet` to persist new columns**

Replace the existing `addSet` (around line 189):

```js
      async addSet({ challenge_id, athlete, reps, note, created_at, duration_minutes, project_tag_id, tool_tag_id }) {
        const s = loadDemo();
        const set = {
          id: uid(), challenge_id, athlete,
          reps: reps ?? null,
          note: note || null,
          duration_minutes: duration_minutes ?? null,
          project_tag_id: project_tag_id ?? null,
          tool_tag_id: tool_tag_id ?? null,
          created_at: created_at || new Date().toISOString(),
        };
        s.sets.push(set);
        saveDemo(s); emit();
        return set;
      },
```

- [ ] **Step 4: Manual verification — open app in browser**

Open browser console and run:
```js
const api = PTData.init({ url: '', key: '' }); // force demo mode
api.getProjectTags().then(console.log); // should print 3 IBM/Bauerlieferant/FarmerOS tags
api.addProjectTag('TestProj', '🧪').then(console.log); // should return new tag
api.getProjectTags().then(t => console.log(t.length)); // should be 4
```

- [ ] **Step 5: Commit**

```bash
git add www/data.js
git commit -m "feat: demo API — project_tags and tool_tags CRUD + addSet work columns"
```

---

### Task 4: Supabase API — tag CRUD methods

**Files:**
- Modify: `www/data.js:404-741` (createSupabaseAPI)

**Interfaces:**
- Consumes: Task 1 DB tables (`project_tags`, `tool_tags`), Task 2 `sets` columns
- Produces: same method signatures as Task 3 but backed by Supabase

- [ ] **Step 1: Add tag CRUD to `createSupabaseAPI()`**

After `deleteCategory` (around line 447) add:

```js
      async getProjectTags() {
        const { data, error } = await client.from('project_tags').select('*').order('created_at');
        if (error) throw error;
        return data;
      },
      async addProjectTag(name, emoji = '📁') {
        const { data, error } = await client.from('project_tags').insert({ name, emoji }).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async updateProjectTag(id, patch) {
        const { data, error } = await client.from('project_tags').update(patch).eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deleteProjectTag(id) {
        const { error } = await client.from('project_tags').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async getToolTags() {
        const { data, error } = await client.from('tool_tags').select('*').order('created_at');
        if (error) throw error;
        return data;
      },
      async addToolTag(name, emoji = '🔧') {
        const { data, error } = await client.from('tool_tags').insert({ name, emoji }).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async updateToolTag(id, patch) {
        const { data, error } = await client.from('tool_tags').update(patch).eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deleteToolTag(id) {
        const { error } = await client.from('tool_tags').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
```

- [ ] **Step 2: Update Supabase `addSet` to pass new columns**

The existing Supabase `addSet` (line ~487) already forwards the entire payload object to Supabase insert — no change needed because `duration_minutes`, `project_tag_id`, `tool_tag_id` will be included in the payload automatically. Verify the existing implementation:

```js
      async addSet(payload) {
        const { data, error } = await client.from('sets').insert(payload).select().single();
        // ↑ passes all payload keys — new columns included automatically
        if (error) throw error;
        emit();
        return data;
      },
```

If the existing code matches this pattern, no edit is required. If it destructures fields explicitly, add the three new fields to the destructure.

- [ ] **Step 3: Add Supabase realtime subscriptions for new tables**

In the subscription block (lines ~408-419), add:

```js
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tags' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tool_tags' }, emit)
```

- [ ] **Step 4: Commit**

```bash
git add www/data.js
git commit -m "feat: supabase API — project_tags and tool_tags CRUD + realtime subscriptions"
```

---

### Task 5: App state — wire projectTags and toolTags into React

**Files:**
- Modify: `www/app.jsx:59-70` (state declarations), `www/app.jsx:208-246` (reload), `www/app.jsx:320-567` (JSX render/prop passing)

**Interfaces:**
- Consumes: Task 3+4 API methods
- Produces: `projectTags` and `toolTags` available as props on `SetupSheet`, `LogSheet`, Settings

- [ ] **Step 1: Add state declarations**

After line 69 (`const [payouts, setPayouts] = useState([]);`) add:

```js
  const [projectTags, setProjectTags] = useState([]);
  const [toolTags, setToolTags]       = useState([]);
```

- [ ] **Step 2: Load tags in `reload()`**

The current `reload` function (lines ~208-246) calls `Promise.all([...])` with 11 items. Extend it:

```js
  const reload = useCallback(async () => {
    try {
      const [cats, challs, feedData, allSetsData, slots, cfg, pens, cls, openCls, penCfg, pys, projTags, toolTagsData] = await Promise.all([
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
        api.listPayouts ? api.listPayouts() : [],
        api.getProjectTags ? api.getProjectTags() : [],
        api.getToolTags    ? api.getToolTags()    : [],
      ]);
      setCategories(cats);
      setAllChallenges(challs);
      setFeed(feedData);
      setAllSets(allSetsData);
      setPlanSlots(slots);
      setRotationConfig(cfg);
      setPenalties(pens || []);
      setClosures(cls || []);
      setOpenClosures(openCls || []);
      setPenaltyConfig(penCfg);
      setPayouts(pys || []);
      setProjectTags(projTags || []);
      setToolTags(toolTagsData || []);
      // ... rest of reload unchanged
    }
  }, [api, me, t.notifications]);
```

- [ ] **Step 3: Pass tags as props to screens**

Find where `<LogSheet ...>` is rendered (search for `logForChallenge` in app.jsx) and add props:

```jsx
<LogSheet
  api={api} me={me}
  challenge={logForChallenge}
  category={categories.find(c => c.id === logForChallenge?.category_id)}
  projectTags={projectTags}
  toolTags={toolTags}
  onClose={() => setLogForChallenge(null)}
  onLogged={(n) => { setLogForChallenge(null); reload(); setToast(`+${n} geloggt!`); }}
/>
```

Find where `<SetupSheet ...>` is rendered and add:

```jsx
<SetupSheet
  api={api} me={me} categories={categories}
  weekStart={weekStart} existing={setupForChallenge}
  projectTags={projectTags} toolTags={toolTags}
  onClose={() => setSetupForChallenge(null)}
  onSaved={() => { setSetupForChallenge(null); reload(); }}
  onDeleted={() => { setSetupForChallenge(null); reload(); }}
  onAddCategory={reload}
/>
```

- [ ] **Step 4: Manual verification**

Open browser → DevTools Console → check that `window.__pt_app_state` or React DevTools show `projectTags` and `toolTags` arrays with 3 items each.

- [ ] **Step 5: Commit**

```bash
git add www/app.jsx
git commit -m "feat: wire projectTags and toolTags into app state and reload"
```

---

### Task 6: Home screen — Sports / Work tab toggle

**Files:**
- Modify: `www/screens.jsx:177-233` (HomeScreen function signature and early-return logic), `www/screens.jsx:235-260` (return JSX)

**Interfaces:**
- Consumes: `categories` prop already on HomeScreen (each cat now has `.kind`)
- Produces: `activeTab` state (`'sports'` | `'work'`), challenges filtered by tab

- [ ] **Step 1: Add `activeTab` state at the top of `HomeScreen`**

After line 192 (`const scrollerRef = React.useRef(null);`), add:

```js
  const [activeTab, setActiveTab] = React.useState(
    () => sessionStorage.getItem('pt_home_tab') || 'sports'
  );
  React.useEffect(() => {
    sessionStorage.setItem('pt_home_tab', activeTab);
  }, [activeTab]);
```

- [ ] **Step 2: Filter challenges by active tab**

After the `catById` declaration (line 190), add:

```js
  const tabChallenges = challenges.filter(ch => {
    const cat = catById[ch.category_id];
    return (cat?.kind || 'sports') === activeTab;
  });
```

Then replace all references to `challenges` inside `HomeScreen` with `tabChallenges` EXCEPT the prop itself. Specifically:
- In the `useMemo` that produces `sortedChallenges` and `totalsByChallenge` (line ~211): change `challenges.map(...)` → `tabChallenges.map(...)` and `for (const ch of challenges)` → `for (const ch of tabChallenges)` and `for (const ch of challenges)` in the open/done split.
- The `if (!challenges.length)` empty-state check (line ~224) becomes `if (!tabChallenges.length)`.

- [ ] **Step 3: Render the tab toggle bar**

In the `return (` JSX (line ~235), insert the toggle as the first child of the root fragment, before `.layout-${layout} home-swiper-wrap`:

```jsx
  return (
    <>
      <div className="work-tab-toggle">
        <button
          className={`work-tab-btn ${activeTab === 'sports' ? 'active' : ''}`}
          onClick={() => setActiveTab('sports')}>
          🏋️ Sports
        </button>
        <button
          className={`work-tab-btn ${activeTab === 'work' ? 'active' : ''}`}
          onClick={() => setActiveTab('work')}>
          💻 Work
        </button>
      </div>
      <div className={`layout-${layout} home-swiper-wrap`}>
        {/* ... rest of existing JSX ... */}
      </div>
    </>
  );
```

- [ ] **Step 4: Add CSS for the tab toggle to `www/styles.css`**

Append to end of file:

```css
/* ── Work / Sports tab toggle ─────────────────────────────────────────────── */
.work-tab-toggle {
  display: flex;
  gap: 8px;
  padding: 12px 16px 0;
}
.work-tab-btn {
  flex: 1;
  padding: 8px 0;
  border-radius: 10px;
  border: none;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.work-tab-btn.active {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 5: Manual verification**

Open app. Home screen should show "🏋️ Sports" and "💻 Work" tabs. Sports tab (default) shows existing challenges. Work tab shows empty state ("Diese Woche ist offen") until a Work challenge is created.

- [ ] **Step 6: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "feat: Sports/Work tab toggle on HomeScreen"
```

---

### Task 7: Setup Sheet — Work challenge creation (hours input)

**Files:**
- Modify: `www/screens.jsx:616-775` (SetupSheet function)

**Interfaces:**
- Consumes: `categories` prop now has `.kind`; no new props needed for setup
- Produces: For work categories, `target_reps` stored as `hoursInput * 60`

- [ ] **Step 1: Detect selected category kind**

At the top of `SetupSheet`, after line 625 (`const [deleting, setDeleting] = useState(false);`), add:

```js
  const selectedCat = categories.find(c => c.id === catId);
  const isWork = selectedCat?.kind === 'work';
  // For work challenges: target is in hours; stored value = hours * 60
  const [hoursTarget, setHoursTarget] = useState(
    existing?.target_reps ? (isWork ? existing.target_reps / 60 : null) : null
  );
```

- [ ] **Step 2: Update the `save()` function**

Replace the `target_reps: target` in the `upsertChallenge` call (line ~650) with:

```js
      await api.upsertChallenge({
        week_start: weekStart,
        category_id: catId,
        chosen_by: chosenBy,
        target_reps: isWork ? Math.round((hoursTarget || 1) * 60) : target,
      });
```

- [ ] **Step 3: Replace the target input area**

Find the block starting with `<div className="label" ...>Ziel-Wiederholungen / Woche</div>` (line ~754) and replace it with:

```jsx
      {isWork ? (
        <>
          <div className="label" style={{ marginBottom: 0 }}>Ziel-Stunden / Woche</div>
          <Stepper value={hoursTarget ?? 10} onChange={setHoursTarget} step={1} min={1} />
          <div className="chip-row" style={{ justifyContent: 'center' }}>
            {[5, 10, 20, 40].map((v) =>
              <button key={v} className="chip" onClick={() => setHoursTarget(v)}>{v}h</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="label" style={{ marginBottom: 0 }}>Ziel-Wiederholungen / Woche</div>
          <Stepper value={target} onChange={setTarget} step={target < 50 ? 5 : target < 200 ? 10 : 25} />
          <div className="chip-row" style={{ justifyContent: 'center' }}>
            {[50, 100, 200, 500].map((v) =>
              <button key={v} className="chip" onClick={() => setTarget(v)}>{v}</button>
            )}
          </div>
        </>
      )}
```

- [ ] **Step 4: Add a visual divider in the category grid between Sports and Work**

In the `categories.map(...)` in the category grid (line ~709), group categories by kind and insert a label between them:

```jsx
      <div className="cat-grid">
        {(() => {
          const sports = categories.filter(c => (c.kind || 'sports') === 'sports');
          const work   = categories.filter(c => c.kind === 'work');
          return (
            <>
              {sports.map((c) => /* existing cat-card JSX */ (
                <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
                  <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} onClick={() => setCatId(c.id)}>
                    <div className="emoji">{c.emoji}</div>
                    <div className="name">{c.name}</div>
                  </button>
                  <button className="cat-edit" aria-label="Bearbeiten"
                    onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                    ✎
                  </button>
                </div>
              ))}
              {work.length > 0 && (
                <>
                  <div className="cat-grid-divider">💻 Work</div>
                  {work.map((c) => (
                    <div key={c.id} className={`cat-card-wrap ${catId === c.id ? 'selected' : ''}`}>
                      <button className={`cat-card ${catId === c.id ? 'selected' : ''}`} onClick={() => setCatId(c.id)}>
                        <div className="emoji">{c.emoji}</div>
                        <div className="name">{c.name}</div>
                      </button>
                      <button className="cat-edit" aria-label="Bearbeiten"
                        onClick={(e) => {e.stopPropagation();setEditingCat({ ...c });setShowNewCat(false);}}>
                        ✎
                      </button>
                    </div>
                  ))}
                </>
              )}
              <button className={`cat-card cat-card-add ${showNewCat ? 'open' : ''}`}
                onClick={() => {setShowNewCat((s) => !s);setEditingCat(null);}}>
                <div className="emoji">＋</div>
                <div className="name">Neue Kategorie</div>
              </button>
            </>
          );
        })()}
      </div>
```

- [ ] **Step 5: Add CSS for the divider**

Append to `www/styles.css`:

```css
.cat-grid-divider {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  padding: 8px 0 4px;
}
```

- [ ] **Step 6: Manual verification**

Open Setup Sheet. Select a Sports category → target shows "Ziel-Wiederholungen". Add a new Work category (kind must be set — see Task 8 for adding `kind` to `addCategory`). Select it → target shows "Ziel-Stunden".

- [ ] **Step 7: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "feat: SetupSheet hours input for work challenges + category kind divider"
```

---

### Task 8: `addCategory` — support `kind` parameter

**Files:**
- Modify: `www/data.js` (both `createDemoAPI` and `createSupabaseAPI` `addCategory` methods)
- Modify: `www/screens.jsx:660-670` (addNewCat in SetupSheet)

**Interfaces:**
- Produces: `api.addCategory(name, emoji, kind)` where `kind` defaults to `'sports'`

- [ ] **Step 1: Update demo `addCategory`**

Replace (around line 126):

```js
      async addCategory(name, emoji='💪', kind='sports') {
        const s = loadDemo();
        if (s.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('Kategorie existiert bereits');
        }
        const cat = { id: uid(), name, emoji, kind };
        s.categories.push(cat);
        saveDemo(s); emit();
        return cat;
      },
```

- [ ] **Step 2: Update Supabase `addCategory`**

Replace (around line 431):

```js
      async addCategory(name, emoji='💪', kind='sports') {
        const { data, error } = await client.from('categories').insert({ name, emoji, kind }).select().single();
        if (error) throw error;
        emit();
        return data;
      },
```

- [ ] **Step 3: Add kind selector to the "Neue Kategorie" form in SetupSheet**

In `SetupSheet`, add a `newCatKind` state and a toggle in the new-category row:

```js
  const [newCatKind, setNewCatKind] = useState('sports');
```

In `addNewCat()`, pass the kind:

```js
  async function addNewCat() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.addCategory(newCatName.trim(), newCatEmoji, newCatKind);
      onAddCategory();
      setCatId(cat.id);
      setShowNewCat(false);
      setNewCatName('');
      setNewCatKind('sports');
    } catch (e) {
      alert(e.message);
    }
  }
```

In the `showNewCat` inline form (line ~743), add a mini toggle after the emoji input:

```jsx
      {showNewCat &&
        <div className="new-cat-row">
          <input className="input new-cat-emoji"
            value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} maxLength={2} />
          <input className="input" placeholder="Name (z.B. Dips)" autoFocus
            value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewCat()} />
          <div className="segmented" style={{ flexShrink: 0 }}>
            <button className={newCatKind === 'sports' ? 'active' : ''} onClick={() => setNewCatKind('sports')}>🏋️</button>
            <button className={newCatKind === 'work'   ? 'active' : ''} onClick={() => setNewCatKind('work')}>💻</button>
          </div>
          <button className="new-cat-add" onClick={addNewCat} aria-label="Hinzufügen">✓</button>
        </div>
      }
```

- [ ] **Step 4: Commit**

```bash
git add www/data.js www/screens.jsx
git commit -m "feat: addCategory supports kind param; new-category form has sports/work toggle"
```

---

### Task 9: Log Sheet — work session UI (timer + tag pickers)

**Files:**
- Modify: `www/screens.jsx:778-838` (LogSheet function)

**Interfaces:**
- Consumes: `category.kind`, `projectTags`, `toolTags` props (added in Task 5)
- Produces: Calls `api.addSet({ ..., duration_minutes, project_tag_id, tool_tag_id })`

- [ ] **Step 1: Add work-specific state and timer logic**

Replace the `LogSheet` function signature and initial state (lines 778-781):

```js
function LogSheet({ api, me, challenge, category, projectTags = [], toolTags = [], onClose, onLogged }) {
  const isWork = category?.kind === 'work';
  const [reps, setReps] = useState(10);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Work-mode state
  const TIMER_KEY = 'pt_work_timer_start';
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [projectTagId, setProjectTagId] = useState(null);
  const [toolTagId, setToolTagId] = useState(null);
  const [timerStart, setTimerStart] = React.useState(() => {
    const v = localStorage.getItem(TIMER_KEY);
    return v ? parseInt(v) : null;
  });
  const [elapsedSec, setElapsedSec] = React.useState(0);

  React.useEffect(() => {
    if (!isWork || !timerStart) return;
    const iv = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isWork, timerStart]);

  function startTimer() {
    const now = Date.now();
    localStorage.setItem(TIMER_KEY, String(now));
    setTimerStart(now);
    setElapsedSec(0);
    setDurationMinutes(0);
  }
  function stopTimer() {
    const mins = Math.max(1, Math.floor((Date.now() - timerStart) / 60000));
    localStorage.removeItem(TIMER_KEY);
    setTimerStart(null);
    setElapsedSec(0);
    setDurationMinutes(mins);
  }

  function fmtElapsed(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
```

- [ ] **Step 2: Update `save()` to branch on `isWork`**

Replace the `save` function (lines ~783-799):

```js
  async function save() {
    if (isWork) {
      if (durationMinutes <= 0) return;
      setSaving(true);
      try {
        await api.addSet({
          challenge_id: challenge.id,
          athlete: me,
          reps: null,
          duration_minutes: durationMinutes,
          project_tag_id: projectTagId || null,
          tool_tag_id: toolTagId || null,
          note: note.trim() || null,
        });
        onLogged(durationMinutes);
      } catch (e) {
        alert(e.message || 'Fehler');
      } finally {
        setSaving(false);
      }
    } else {
      if (reps <= 0) return;
      setSaving(true);
      try {
        await api.addSet({
          challenge_id: challenge.id,
          athlete: me,
          reps: parseInt(reps),
          note: note.trim() || null,
        });
        onLogged(reps);
      } catch (e) {
        alert(e.message || 'Fehler');
      } finally {
        setSaving(false);
      }
    }
  }
```

- [ ] **Step 3: Replace the JSX return with work/sports branches**

Replace lines 801-838 with:

```jsx
  if (isWork) {
    return (
      <>
        <h2 className="title" style={{ marginBottom: 4 }}>Session loggen</h2>
        <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
          {category?.emoji} {category?.name} · {me}
        </div>

        {/* Timer */}
        <div className="work-timer-block">
          {timerStart ? (
            <>
              <div className="work-timer-display mono">{fmtElapsed(elapsedSec)}</div>
              <button className="btn btn-danger" onClick={stopTimer}>⏹ Stop</button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={startTimer}>▶ Timer starten</button>
          )}
        </div>

        {/* Manual duration input */}
        <div className="label" style={{ marginTop: 16, marginBottom: 0 }}>Minuten (manuell)</div>
        <Stepper value={durationMinutes} onChange={setDurationMinutes} step={15} min={0} />
        <div className="chip-row" style={{ justifyContent: 'center', marginTop: 8 }}>
          {[30, 60, 90, 120].map((v) =>
            <button key={v} className="chip" onClick={() => setDurationMinutes(v)}>{v}m</button>
          )}
        </div>

        {/* Project tag picker */}
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Projekt</div>
        <div className="chip-row" style={{ flexWrap: 'wrap' }}>
          {projectTags.map(t =>
            <button key={t.id}
              className={`chip ${projectTagId === t.id ? 'chip-active' : ''}`}
              onClick={() => setProjectTagId(t.id)}>
              {t.emoji} {t.name}
            </button>
          )}
        </div>

        {/* Tool tag picker */}
        <div className="label" style={{ marginTop: 16, marginBottom: 8 }}>Tool</div>
        <div className="chip-row" style={{ flexWrap: 'wrap' }}>
          {toolTags.map(t =>
            <button key={t.id}
              className={`chip ${toolTagId === t.id ? 'chip-active' : ''}`}
              onClick={() => setToolTagId(t.id)}>
              {t.emoji} {t.name}
            </button>
          )}
        </div>

        <input
          className="input"
          placeholder="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ marginTop: 16 }} />

        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" onClick={save}
            disabled={saving || durationMinutes <= 0}>
            {saving ? '…' : `${durationMinutes}m loggen`}
          </button>
        </div>
      </>
    );
  }

  // Sports branch (original UI)
  return (
    <>
      <h2 className="title" style={{ marginBottom: 4 }}>Satz loggen</h2>
      <div className="subtitle" style={{ marginBottom: 20, fontSize: 15 }}>
        {category?.emoji} {category?.name} · {me}
      </div>
      <input
        className="input input-lg mono"
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()} />
      <div className="chip-row" style={{ justifyContent: 'center', marginTop: 12 }}>
        {[5, 10, 15, 20, 25, 30].map((v) =>
          <button key={v} className="chip" onClick={() => setReps(v)}>{v}</button>
        )}
      </div>
      <input
        className="input"
        placeholder="Notiz (optional, z.B. ‚saubere Form')"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 16 }} />
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
        <button className="btn" onClick={save} disabled={saving || reps <= 0}>
          {saving ? '…' : `+${reps} loggen`}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add CSS for work session UI**

Append to `www/styles.css`:

```css
/* ── Work session log sheet ───────────────────────────────────────────────── */
.work-timer-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}
.work-timer-display {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--accent);
}
.chip-active {
  background: var(--accent) !important;
  color: #fff !important;
}
```

- [ ] **Step 5: Manual verification**

1. Create a Work category (e.g. "Vibe Coding 💻" with kind=work) via SetupSheet.
2. Create a weekly Work challenge (10h target → stores 600 in target_reps).
3. Open Log Sheet → Work sheet shown (no reps input visible).
4. Press "▶ Timer starten" → close browser tab → reopen → timer still counting.
5. Press "⏹ Stop" → duration field fills automatically.
6. Select a project tag and tool tag → "loggen" button enables.
7. Log → success.

- [ ] **Step 6: Commit**

```bash
git add www/screens.jsx www/styles.css
git commit -m "feat: LogSheet work session UI — timer, tag pickers, duration input"
```

---

### Task 10: Feed & History — work session display

**Files:**
- Modify: `www/components.jsx:102-139` (add `formatDuration` helper)
- Modify: `www/screens.jsx:1048-...` (FeedScreen set card renderer)
- Modify: `www/app.jsx` (pass `projectTags`/`toolTags` to FeedScreen)

**Interfaces:**
- Consumes: `set.duration_minutes`, `set.project_tag_id`, `set.tool_tag_id`; `projectTags` and `toolTags` arrays
- Produces: `formatDuration(minutes) → string`

- [ ] **Step 1: Add `formatDuration` to `www/components.jsx`**

After the `formatRelative` function (around line 120), add:

```js
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
```

- [ ] **Step 2: Pass tags to FeedScreen in `www/app.jsx`**

Find the `<FeedScreen ...>` JSX in app.jsx and add props:

```jsx
<FeedScreen
  ...existingProps
  projectTags={projectTags}
  toolTags={toolTags}
/>
```

- [ ] **Step 3: Update FeedScreen to accept and use tag props**

In `www/screens.jsx`, update `FeedScreen`'s function signature to accept `projectTags = []` and `toolTags = []`. Then in the individual set card render, find the line that shows reps (search for `set.reps` inside FeedScreen) and replace the display logic with:

```jsx
{/* Amount display */}
{set.duration_minutes != null
  ? <span className="feed-reps mono">{formatDuration(set.duration_minutes)}</span>
  : <span className="feed-reps mono">+{set.reps}</span>
}
{/* Tag badges for work sessions */}
{set.project_tag_id && (() => {
  const pt = projectTags.find(t => t.id === set.project_tag_id);
  return pt ? <span className="feed-tag">{pt.emoji} {pt.name}</span> : null;
})()}
{set.tool_tag_id && (() => {
  const tt = toolTags.find(t => t.id === set.tool_tag_id);
  return tt ? <span className="feed-tag">{tt.emoji} {tt.name}</span> : null;
})()}
```

- [ ] **Step 4: Add CSS for feed tags**

Append to `www/styles.css`:

```css
/* ── Feed work tags ───────────────────────────────────────────────────────── */
.feed-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-2);
  margin-left: 4px;
}
```

- [ ] **Step 5: Manual verification**

Log a work session. Open Feed → see duration ("45m") instead of reps, and two tag chips for project and tool.

- [ ] **Step 6: Commit**

```bash
git add www/components.jsx www/screens.jsx www/app.jsx www/styles.css
git commit -m "feat: feed shows work session duration and tag chips"
```

---

### Task 11: Settings — tag management UI

**Files:**
- Modify: `www/settings.jsx` (add WorkTagsCard component)
- Modify: `www/app.jsx` (pass tags + reload to Settings)

**Interfaces:**
- Consumes: `api.addProjectTag`, `api.updateProjectTag`, `api.deleteProjectTag`, `api.addToolTag`, `api.updateToolTag`, `api.deleteToolTag`

- [ ] **Step 1: Add `WorkTagsCard` to `www/settings.jsx`**

At the end of the file, before the closing IIFE or export, add:

```jsx
function TagList({ tags, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newEmoji, setNewEmoji] = React.useState('📁');
  const [editingId, setEditingId] = React.useState(null);
  const [editName, setEditName] = React.useState('');
  const [editEmoji, setEditEmoji] = React.useState('');

  async function doAdd() {
    if (!newName.trim()) return;
    await onAdd(newName.trim(), newEmoji);
    setAdding(false); setNewName(''); setNewEmoji('📁');
  }
  async function doUpdate() {
    await onUpdate(editingId, { name: editName.trim(), emoji: editEmoji });
    setEditingId(null);
  }
  async function doDelete(id) {
    if (!confirm('Tag löschen?')) return;
    await onDelete(id);
  }

  return (
    <div className="tag-list">
      {tags.map(t => (
        <div key={t.id} className="tag-row">
          {editingId === t.id ? (
            <>
              <input className="input new-cat-emoji" value={editEmoji}
                onChange={e => setEditEmoji(e.target.value)} maxLength={2} />
              <input className="input" value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doUpdate()} />
              <button className="new-cat-add new-cat-del" onClick={() => doDelete(t.id)}>🗑</button>
              <button className="new-cat-add" onClick={doUpdate}>✓</button>
            </>
          ) : (
            <>
              <span className="tag-emoji">{t.emoji}</span>
              <span className="tag-name">{t.name}</span>
              <button className="cat-edit" onClick={() => { setEditingId(t.id); setEditName(t.name); setEditEmoji(t.emoji); }}>✎</button>
            </>
          )}
        </div>
      ))}
      {adding ? (
        <div className="new-cat-row">
          <input className="input new-cat-emoji" value={newEmoji}
            onChange={e => setNewEmoji(e.target.value)} maxLength={2} />
          <input className="input" placeholder="Name" autoFocus value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doAdd()} />
          <button className="new-cat-add" onClick={doAdd}>✓</button>
        </div>
      ) : (
        <button className="btn btn-secondary" style={{ marginTop: 8, width: '100%' }}
          onClick={() => setAdding(true)}>+ Tag hinzufügen</button>
      )}
    </div>
  );
}

function WorkTagsCard({ api, projectTags, toolTags, reload }) {
  const wrap = (fn) => async (...args) => { try { await fn(...args); reload(); } catch (e) { alert(e.message); } };
  return (
    <div className="settings-card">
      <div className="settings-card-title">💻 Work Tags</div>

      <div className="settings-section-label">Projekte</div>
      <TagList
        tags={projectTags}
        onAdd={wrap((n,e) => api.addProjectTag(n, e))}
        onUpdate={wrap((id, p) => api.updateProjectTag(id, p))}
        onDelete={wrap((id) => api.deleteProjectTag(id))}
      />

      <div className="settings-section-label" style={{ marginTop: 20 }}>Tools</div>
      <TagList
        tags={toolTags}
        onAdd={wrap((n,e) => api.addToolTag(n, e))}
        onUpdate={wrap((id, p) => api.updateToolTag(id, p))}
        onDelete={wrap((id) => api.deleteToolTag(id))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Mount `WorkTagsCard` in the SettingsScreen**

In `www/settings.jsx`, find the `SettingsScreen` (or `SettingsView`) function and add `WorkTagsCard` after the existing settings cards:

```jsx
<WorkTagsCard api={api} projectTags={projectTags} toolTags={toolTags} reload={reload} />
```

Update the `SettingsScreen` function signature to accept `projectTags`, `toolTags`, `reload` props.

- [ ] **Step 3: Pass tags to Settings in `www/app.jsx`**

Find where `<SettingsScreen ...>` is rendered in app.jsx and add:

```jsx
<SettingsScreen
  ...existingProps
  projectTags={projectTags}
  toolTags={toolTags}
  reload={reload}
/>
```

- [ ] **Step 4: Add CSS for tag list**

Append to `www/styles.css`:

```css
/* ── Settings tag list ────────────────────────────────────────────────────── */
.settings-section-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  margin-bottom: 8px;
}
.tag-list { display: flex; flex-direction: column; gap: 4px; }
.tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 8px;
}
.tag-emoji { font-size: 18px; }
.tag-name  { flex: 1; font-size: 14px; }
```

- [ ] **Step 5: Manual verification**

Open Settings. A "💻 Work Tags" card should appear. Add a new project tag "Personal 🏠". Verify it appears in the LogSheet tag picker.

- [ ] **Step 6: Commit**

```bash
git add www/settings.jsx www/app.jsx www/styles.css
git commit -m "feat: Settings — Work Tags management (project + tool tags CRUD)"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Track hours/minutes per work session | Task 9 (duration_minutes), Task 2 (DB) |
| Live timer persisting across close/reopen | Task 9 (localStorage TIMER_KEY) |
| Manual time entry | Task 9 (Stepper + chips) |
| Project tag per session | Tasks 1+3+4+9 |
| Tool tag per session | Tasks 1+3+4+9 |
| Tags customizable | Task 11 (Settings WorkTagsCard) |
| Default projects: IBM, Bauerlieferant, FarmerOS | Tasks 1 (SQL seed), 3 (demo seed) |
| Default tools: Claude Code, Codex, Bob | Tasks 1 (SQL seed), 3 (demo seed) |
| Work category (`kind='work'`) | Tasks 1+8 |
| Sports vs Work tab toggle on Home | Task 6 |
| Work challenge target in hours | Task 7 |
| Shared weekly challenge model | No change — existing model reused |
| Feed shows duration + tags | Task 10 |
| Demo mode supported | Tasks 3+9 |
| DB migrations | Tasks 1+2 |
