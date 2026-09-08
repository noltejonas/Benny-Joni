# Work Tracking Feature — Plan

## Overview

Add a **"Work"** super-category to the app alongside the existing fitness challenges.
Users can set a weekly vibe-coding target (in hours), log work sessions with a **live timer or manual entry**, and tag each session with one **Project tag** (e.g. IBM, Bauerlieferant, FarmerOS) and one **Tool tag** (e.g. Claude Code, Codex, Bob).  
Work challenges follow the same shared weekly model as Sports: both athletes contribute toward a common weekly target.

The Home screen gains a **Sports / Work tab toggle** so neither view is cluttered.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Data separation | Extend existing `sets` table with nullable `duration_minutes`, `project_tag`, `tool_tag` columns |
| Time input UX | Both quick manual entry (minutes) AND a persistent live timer (start timestamp in localStorage) |
| Tag taxonomy | Two tag lists — `project_tags` and `tool_tags` — stored as new Supabase tables; customizable like categories |
| Categories scope | Existing categories stay as-is (Sports); new Work "activity types" are separate category rows with a `kind` discriminator (`sports` / `work`) |
| Home screen navigation | Tab toggle bar (Sports / Work) above the challenge cards |
| Weekly target unit | Hours for display, stored internally as minutes (integer) |
| Penalty system | Reuse existing penalty model unchanged; penalties apply to work challenges too |

---

## Sub-Tasks

---

### Sub-Task 1 — DB Schema: Add `kind` to `categories` & tag tables

**Status:** [ ] pending

**Intent**  
Introduce a `kind` column on `categories` so existing categories become `sports` and new work activity types become `work`. Add two new tables: `project_tags` and `tool_tags`, both customizable per athlete group (same RLS pattern as categories).

**Expected Outcomes**
- `categories` table has a `kind` column (`sports` | `work`) defaulting to `sports`
- All existing category rows are back-filled to `kind = 'sports'`
- `project_tags` table exists with columns: `id uuid PK`, `name text`, `emoji text`, `created_at timestamptz`
- `tool_tags` table exists with the same schema
- Default rows seeded: Projects → IBM, Bauerlieferant, FarmerOS; Tools → Claude Code, Codex, Bob
- RLS policies mirror the `categories` table (public read/write)

**Todo List**
- [ ] Create migration file `supabase/migrations/<timestamp>_work_categories.sql`
- [ ] Add `kind text NOT NULL DEFAULT 'sports'` to `categories`
- [ ] `UPDATE categories SET kind = 'sports'` back-fill
- [ ] Create `project_tags` table with same structure as `categories` (without `kind`)
- [ ] Create `tool_tags` table with same structure
- [ ] Seed default project and tool tag rows
- [ ] Apply RLS: enable row level security, add `anon` read/write policies

**Relevant Context**
- Existing `categories` migration: check `supabase/migrations/` for the original categories table DDL
- RLS pattern: follow `categories` table policies exactly
- Demo API seed data: `www/data.js` lines 25–31 (category defaults array)

---

### Sub-Task 2 — DB Schema: Extend `sets` table for work sessions

**Status:** [ ] pending

**Intent**  
Add nullable columns to `sets` so that a single set row can represent either a reps-based sports entry OR a time-based work session. No data migration needed — existing rows leave new columns NULL.

**Expected Outcomes**
- `sets` table has three new nullable columns:
  - `duration_minutes integer` — time logged in minutes (NULL for sports sets)
  - `project_tag_id uuid REFERENCES project_tags(id)` — nullable FK
  - `tool_tag_id uuid REFERENCES tool_tags(id)` — nullable FK
- Existing sets are unaffected (all three columns NULL)

**Todo List**
- [ ] Create migration file `supabase/migrations/<timestamp>_sets_work_columns.sql`
- [ ] `ALTER TABLE sets ADD COLUMN duration_minutes integer`
- [ ] `ALTER TABLE sets ADD COLUMN project_tag_id uuid REFERENCES project_tags(id) ON DELETE SET NULL`
- [ ] `ALTER TABLE sets ADD COLUMN tool_tag_id uuid REFERENCES tool_tags(id) ON DELETE SET NULL`

**Relevant Context**
- `sets` table definition: `www/data.js` lines ~481 and corresponding migration
- `project_tags` and `tool_tags` must exist before this migration runs (Sub-Task 1 must complete first)

---

### Sub-Task 3 — Data Layer: API methods for tags & work sessions

**Status:** [ ] pending

**Intent**  
Extend `www/data.js` with CRUD for `project_tags` and `tool_tags`, and update `addSet` / `loadSets` to handle the new columns. Add support for work-kind category filtering.

**Expected Outcomes**
- Demo API and Supabase API both support:
  - `api.loadProjectTags()` → array of `{id, name, emoji}`
  - `api.addProjectTag(name, emoji)` → new tag row
  - `api.updateProjectTag(id, {name?, emoji?})` → updated row
  - `api.deleteProjectTag(id)` → void
  - Same four methods for `tool_tags`
- `api.addSet({ challenge_id, athlete, reps?, duration_minutes?, project_tag_id?, tool_tag_id?, note? })`  
  accepts and persists the new fields
- `api.loadCategories()` returns `kind` field; callers can filter by `kind`
- Demo API stores tags in localStorage with same pattern as categories

**Todo List**
- [ ] Add `projectTags` and `toolTags` default seed arrays in demo data (`www/data.js`)
- [ ] Implement demo CRUD for `projectTags` (localStorage-backed) following existing `categories` pattern
- [ ] Implement demo CRUD for `toolTags` same way
- [ ] Update demo `addSet` to persist `duration_minutes`, `project_tag_id`, `tool_tag_id`
- [ ] Update demo `loadSets` to return new columns
- [ ] Add Supabase `loadProjectTags`, `addProjectTag`, `updateProjectTag`, `deleteProjectTag`
- [ ] Add Supabase equivalents for tool tags
- [ ] Update Supabase `addSet` INSERT to include new columns
- [ ] Update Supabase `loadSets` SELECT to include new columns
- [ ] Update `PTData.init()` to load `projectTags` and `toolTags` on startup

**Relevant Context**
- Categories API pattern: `www/data.js` lines ~426–447 (Supabase) and ~25–70 (demo)
- `addSet` Supabase: `www/data.js` lines ~481–525
- App state in `www/app.jsx` lines 59–69 — add `projectTags` and `toolTags` state vars

---

### Sub-Task 4 — App State: Wire tags into React state

**Status:** [ ] pending

**Intent**  
Add `projectTags` and `toolTags` to the top-level app state in `www/app.jsx`, include them in the `reload()` function, and pass them down as props to screens that need them.

**Expected Outcomes**
- `app.jsx` has `projectTags` and `toolTags` state
- `reload()` loads both tag lists alongside categories
- Tags flow down to `SetupSheet`, `LogSheet`, and Settings screen

**Todo List**
- [ ] Add `const [projectTags, setProjectTags] = useState([])` and same for toolTags (`www/app.jsx`)
- [ ] In `reload()`, call `api.loadProjectTags()` and `api.loadToolTags()` and set state
- [ ] Pass `projectTags` and `toolTags` as props into `SetupSheet` and `LogSheet`
- [ ] Pass both into the Settings screen for tag management UI

**Relevant Context**
- `www/app.jsx` lines 59–69: existing state declarations
- `reload()` function: loads categories, challenges, sets, etc.

---

### Sub-Task 5 — Home Screen: Sports / Work tab toggle

**Status:** [ ] pending

**Intent**  
Add a two-tab toggle at the top of the Home screen so users can switch between their Sports challenges and Work challenges. The active tab filters which challenge cards are displayed. Both Benny and Jonas see the same tab.

**Expected Outcomes**
- A pill/segment toggle bar appears at the top of HomeScreen: "🏋️ Sports" | "💻 Work"
- Default tab is Sports (existing behaviour unchanged)
- When Work tab is active, only challenges whose category has `kind = 'work'` are shown
- When Sports tab is active, only `kind = 'sports'` challenges are shown
- The ring/progress cards render identically for both tabs; the only difference is units (reps vs. time)

**Todo List**
- [ ] Add `activeTab` state (`'sports'` | `'work'`) to HomeScreen (`www/screens.jsx`)
- [ ] Render a tab toggle bar component above the challenge list
- [ ] Filter `weekChallenges` by `categories[challenge.category_id].kind === activeTab`
- [ ] For Work challenges, display duration in `h m` format instead of rep counts
- [ ] Persist `activeTab` in `sessionStorage` so it survives a hot reload

**Relevant Context**
- `HomeScreen` starts at `www/screens.jsx` line 177
- Challenge card rendering: look for `QuickLogRow` and challenge map loops inside HomeScreen
- `categories` prop is already available on HomeScreen

---

### Sub-Task 6 — Log Sheet: Work session logging UI

**Status:** [ ] pending

**Intent**  
Extend the existing `LogSheet` modal to support work session logging. When the challenge's category is `kind = 'work'`, the sheet transforms: reps input is replaced by a time input + live timer, and two tag pickers (Project, Tool) appear.

**Expected Outcomes**
- For a sports challenge: LogSheet looks and behaves exactly as before
- For a work challenge:
  - Reps input is hidden
  - Two time entry modes: manual minutes field OR a start/stop timer button
  - Timer button saves `work_timer_start` (ISO timestamp) to `localStorage` on start; reads it on open to show elapsed time
  - Stopping the timer fills the duration field with elapsed minutes and clears `localStorage` key
  - Project tag picker: horizontal scroll of tag chips; one selectable at a time
  - Tool tag picker: same, below project
  - "Log" button disabled until duration > 0 and both tags selected
  - Submitted set: `reps = null`, `duration_minutes = <elapsed>`, `project_tag_id`, `tool_tag_id`

**Todo List**
- [ ] Detect challenge kind inside `LogSheet` via `categories[challenge.category_id].kind`
- [ ] Add `durationMinutes`, `projectTagId`, `toolTagId` local state
- [ ] Add `timerStart` state, initialized from `localStorage.getItem('work_timer_start')`
- [ ] Render conditional UI branch: if `kind === 'work'` show timer/duration + tag pickers; else show current reps UI
- [ ] Implement timer start: set `localStorage.setItem('work_timer_start', Date.now())`
- [ ] Implement timer stop: compute `Math.floor((Date.now() - timerStart) / 60000)`, clear localStorage key, fill duration
- [ ] Render tag chip pickers for `projectTags` and `toolTags` (passed as props)
- [ ] Update form submit to pass `duration_minutes`, `project_tag_id`, `tool_tag_id` to `api.addSet()`
- [ ] Show elapsed time counter (updates every second via `setInterval`) while timer is running

**Relevant Context**
- `LogSheet` in `www/screens.jsx` — search for `LogSheet` function
- `addSet` call is at the bottom of `LogSheet`
- `Stepper` component (`www/components.jsx` line 81) used for reps — may be reused for manual minutes
- `projectTags` and `toolTags` must be passed as props (wired in Sub-Task 4)

---

### Sub-Task 7 — Setup Sheet: Work challenge creation

**Status:** [ ] pending

**Intent**  
When creating a new challenge, allow the user to set the target in **hours** (not reps) when a Work category is selected. The stored value is `target_reps = hours * 60` so the existing model is reused without a schema change.

**Expected Outcomes**
- In `SetupSheet`, when the selected category has `kind = 'work'`, the "Target reps" field label changes to "Target hours"
- Input value is treated as hours; stored as `hours × 60` in `target_reps`
- When editing an existing work challenge, the hours field shows `target_reps / 60`
- Category picker in SetupSheet shows a visual divider or label between Sports and Work categories

**Todo List**
- [ ] In `SetupSheet`, detect selected category kind via `categories[selectedCategoryId].kind`
- [ ] Conditionally render "Target reps" vs "Target hours" label
- [ ] On submit: `targetReps = isWork ? hoursInput * 60 : repsInput`
- [ ] On load (edit mode): `hoursInput = isWork ? challenge.target_reps / 60 : null`
- [ ] Add a visual section divider in the category dropdown between Sports and Work kinds

**Relevant Context**
- `SetupSheet` in `www/screens.jsx` starting around line 616
- Category list rendering in SetupSheet (category selector UI)

---

### Sub-Task 8 — History & Feed: Work session display

**Status:** [ ] pending

**Intent**  
Make work sessions display correctly in the feed and history screens. Instead of showing "25 reps", work sets show "45 min" or "1h 30m". Tag badges (project + tool) appear on each work set card.

**Expected Outcomes**
- Feed (`FeedScreen`) shows work sets with formatted duration and two tag chips
- History (`HistoryScreen`) aggregates work sessions as total hours per week per work category
- History charts show hours (not reps) on the y-axis for Work tab content

**Todo List**
- [ ] Create `formatDuration(minutes)` helper in `www/components.jsx` — returns `"45m"` or `"1h 30m"`
- [ ] In `FeedScreen` set card renderer: if `set.duration_minutes != null`, show `formatDuration` instead of `${reps} reps`
- [ ] Show project tag chip and tool tag chip on work set cards in feed (lookup tag name by id using passed-in tag lists)
- [ ] Pass `projectTags` and `toolTags` into `FeedScreen`
- [ ] In `HistoryScreen`, group work challenges separately; display aggregate hours per week
- [ ] Add a Sports/Work tab toggle to HistoryScreen mirroring the Home screen toggle

**Relevant Context**
- `FeedScreen` in `www/screens.jsx` line ~1048
- `HistoryScreen` in `www/screens.jsx` line ~1411
- `formatRelative` and `formatWeek` helpers in `www/components.jsx` lines 102–120

---

### Sub-Task 9 — Settings: Tag management UI

**Status:** [ ] pending

**Intent**  
Add a "Work Tags" section to the Settings screen where both Project tags and Tool tags can be added, renamed, and deleted — mirroring the existing category management UI in `SetupSheet`.

**Expected Outcomes**
- Settings screen has a "Work Tags" card with two sub-sections: "Projects" and "Tools"
- Each tag row shows emoji + name + edit/delete buttons
- "Add" button opens an inline form (emoji picker + name input) matching the existing add-category UX
- Changes are immediately reflected app-wide via React state

**Todo List**
- [ ] Add a `WorkTagsCard` component in `www/settings.jsx`
- [ ] Render two lists: projectTags and toolTags, each with edit/delete
- [ ] Implement inline add form for each list (re-use the pattern from SetupSheet category add UI)
- [ ] Wire to `api.addProjectTag`, `api.updateProjectTag`, `api.deleteProjectTag` (and tool equivalents)
- [ ] On success, call the parent `reload()` to refresh global tag state

**Relevant Context**
- Settings screen: `www/settings.jsx`
- Category add/edit/delete UI in SetupSheet: `www/screens.jsx` lines ~660–690
- `api` is passed as a prop to settings components

---

## Cross-Cutting Notes

- **Unit display rule:** anywhere a challenge or set is displayed, check `kind`. If `'work'`, format as time (hours/minutes); if `'sports'`, format as reps. Centralise this logic in a `formatActivity(set, kind)` helper.
- **Penalty system:** no changes needed. Work challenges contribute to penalties identically to sports challenges (the penalty model operates on `target_reps` and logged totals regardless of unit semantics).
- **Demo mode:** all new tables (project_tags, tool_tags) must have localStorage-backed demo implementations following the existing demo API pattern.
- **`superpowers` skill note:** the user requested installing https://github.com/obra/superpowers.git before spec writing. This is a Claude Code skill pack. Install it in the project's `.claude/` directory with: `git clone https://github.com/obra/superpowers.git .claude/superpowers` — run this before beginning implementation.
