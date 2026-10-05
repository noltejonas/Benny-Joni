# Pflicht-Workouts, Verlauf „All“, Profilbild, Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 1.4 (11) mit korrekter Zählung von Bring Sally Up/Tom Holland als Durchgänge, Verlauf „All“ über den ganzen Zeitraum, erreichbarem Profilbild-Dialog und funktionierender Push-Registrierung.

**Architecture:** Die App (React per In-Browser-Babel, Globals `PTData`/`PTPeople`) markiert Sätze beim Laden mit `workout` (Typ oder `null`). Eine zentrale Wertfunktion `PTData.setValue` nimmt Workouts aus allen Wiederholungs-Summen; Workout-Challenges zählen Durchgänge (Ziel 1 pro Person). Datenbank bleibt unverändert bis auf `user_reps_today`. iOS bekommt Entitlements und Usage-Texte.

**Tech Stack:** React 18 (UMD + Babel standalone), Supabase JS 2.45.4, Capacitor 8 (iOS), Node 25 `node:test` für Rechenfunktionen, fastlane 2.240.1.

Spec: `docs/superpowers/specs/2026-10-04-workouts-profil-push-design.md`. Alle Pfade relativ zum Worktree `/Users/jonasnolte/Downloads/Benny-Joni-main/.claude/worktrees/testleitbilder-fastlane-77742e`. Dateien mit dem Read-Tool in Ausschnitten lesen.

## Dateien

| Datei | Änderung |
|---|---|
| `www/data.js` | Workout-Helfer, `computePenalties` workout-fähig, `previewWeekClose` markiert Sätze |
| `tests/workouts.test.cjs` (neu) | Node-Tests der Helfer und von `computePenalties` |
| `www/demo.js` | Demo-Strafen markieren Sätze |
| `www/people.jsx` | `valOfSet` → `PTData.setValue` |
| `www/app.jsx` | Sätze beim Laden markieren, Wochen-Recaps, Profil-Callback |
| `www/screens.jsx` | Home, Verlauf („All“, KW-Linien, Workout-Zeilen), Wochenrückblick, Feed-Einheit |
| `www/stats-global.jsx` | Markieren nach dem Laden, „Ich“-Statistik mit Workouts-Karte |
| `www/celebration.jsx` | keine Feier für Workouts |
| `www/settings.jsx` | Profil-Karte |
| `supabase/migrations/20261004000000_workout_reps_today.sql` (neu) | `user_reps_today` ohne Workouts |
| `ios/App/App/Info.plist` | Kamera-/Foto-Texte |
| `ios/App/App.xcodeproj/project.pbxproj` | `CODE_SIGN_ENTITLEMENTS` |
| `.claude/launch.json` | Python-Static-Server für die Browser-Prüfung |

---

### Task 1: Workout-Helfer in `www/data.js`

**Files:**
- Create: `tests/workouts.test.cjs`
- Modify: `www/data.js` (nach `fairShareOf`, Export-Zeile am Dateiende)

- [ ] **Step 1: Failing test schreiben** — `tests/workouts.test.cjs`:

```js
// Prüft die reinen Rechenfunktionen aus www/data.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPTData() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'data.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'data.js' });
  return ctx.window.PTData;
}
const P = loadPTData();

const cats = [
  { id: 'c-push', challenge_type: 'standard', kind: 'sports' },
  { id: 'c-sally', challenge_type: 'bring_sally_up', kind: 'sports' },
  { id: 'c-th', challenge_type: 'tom_holland', kind: 'sports' },
];
const weekChallenges = () => [
  { id: 'w-push', category_id: 'c-push', target_reps: 100 },
  { id: 'w-sally', category_id: 'c-sally', target_reps: 204 },
  { id: 'w-th', category_id: 'c-th', target_reps: 10 },
];

test('isWorkoutType erkennt nur die beiden Pflicht-Workouts', () => {
  assert.equal(P.isWorkoutType('bring_sally_up'), true);
  assert.equal(P.isWorkoutType('tom_holland'), true);
  assert.equal(P.isWorkoutType('standard'), false);
  assert.equal(P.isWorkoutType(undefined), false);
});

test('annotateWorkouts markiert Sätze und Wochen-Challenges', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', reps: 20 },
    { challenge_id: 'w-sally', reps: 180 },
    { challenge_id: 'fremd', reps: 5, category: { challenge_type: 'tom_holland' } },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  assert.deepEqual(sets.map(s => s.workout), [null, 'bring_sally_up', 'tom_holland']);
  assert.deepEqual(challenges.map(c => c.workout), [null, 'bring_sally_up', 'tom_holland']);
});

test('setValue lässt Workouts aus Summen heraus', () => {
  assert.equal(P.setValue({ reps: 20, workout: null }), 20);
  assert.equal(P.setValue({ reps: null, duration_minutes: 45, workout: null }), 45);
  assert.equal(P.setValue({ reps: 180, workout: 'bring_sally_up' }), 0);
});

test('workoutValueLabel formatiert Zeit und Runden', () => {
  assert.equal(P.workoutValueLabel('bring_sally_up', 180), '3:00');
  assert.equal(P.workoutValueLabel('bring_sally_up', 65), '1:05');
  assert.equal(P.workoutValueLabel('bring_sally_up', 204), '3:24 ✓');
  assert.equal(P.workoutValueLabel('tom_holland', 8), '8 Runden');
});

test('workoutSummary listet Durchgänge älteste zuerst', () => {
  const sets = [
    { reps: 204, created_at: '2026-10-02T18:00:00Z' },
    { reps: 180, created_at: '2026-10-01T18:00:00Z' },
  ];
  assert.equal(P.workoutSummary('bring_sally_up', sets), '2× · 3:00, 3:24 ✓');
  assert.equal(P.workoutSummary('tom_holland', []), '0×');
});

test('workoutPeopleDone zählt Personen mit mindestens einem Durchgang', () => {
  const sets = [{ athlete: 'u1' }, { athlete: 'u1' }, { athlete: 'u3' }];
  assert.equal(P.workoutPeopleDone(sets, ['u1', 'u2']), 1);
  assert.equal(P.workoutPeopleDone(sets, ['u1', 'u3']), 2);
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `node --test tests/`
Expected: FAIL, `P.isWorkoutType is not a function`.

- [ ] **Step 3: Helfer implementieren** — in `www/data.js` direkt nach der Funktion `fairShareOf` (endet mit `return Math.ceil(targetReps / Math.max(1, participantCount));\n  }`) einfügen:

```js

  // ── Pflicht-Workouts (Bring Sally Up, Tom Holland) ──────────────────
  // Ein Satz dieser Kategorien ist ein Durchgang; `reps` hält den Wert des
  // Durchgangs (Sally: Sekunden, Tom Holland: Runden). Workouts zählen nie in
  // Wiederholungs-Summen, ihr Wochenziel ist ein Durchgang pro Person.
  const WORKOUT_TYPES = ['bring_sally_up', 'tom_holland'];
  const SALLY_FULL_SECONDS = 204;

  function isWorkoutType(type) {
    return WORKOUT_TYPES.includes(type);
  }

  // Setzt `workout` (Typ oder null) auf Sätzen und Wochen-Challenges.
  function annotateWorkouts(sets, challenges, categories) {
    const typeByCat = {};
    for (const c of categories || []) typeByCat[c.id] = c.challenge_type;
    const typeByCh = {};
    for (const ch of challenges || []) {
      const t = typeByCat[ch.category_id];
      ch.workout = isWorkoutType(t) ? t : null;
      typeByCh[ch.id] = ch.workout;
    }
    for (const s of sets || []) {
      const t = typeByCh[s.challenge_id] ?? s.category?.challenge_type ?? null;
      s.workout = isWorkoutType(t) ? t : null;
    }
    return sets;
  }

  // Wert eines Satzes für Wiederholungs- und Minuten-Summen.
  function setValue(s) {
    return s.workout ? 0 : (s.reps ?? s.duration_minutes ?? 0);
  }

  function workoutValueLabel(type, value) {
    const v = value ?? 0;
    if (type === 'bring_sally_up') {
      return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}${v >= SALLY_FULL_SECONDS ? ' ✓' : ''}`;
    }
    if (type === 'tom_holland') return `${v} Runden`;
    return String(v);
  }

  // „2× · 3:00, 3:24 ✓“ für die Durchgänge einer Person, älteste zuerst.
  function workoutSummary(type, sets) {
    if (!sets.length) return '0×';
    const vals = [...sets]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map(s => workoutValueLabel(type, s.reps));
    return `${sets.length}× · ${vals.join(', ')}`;
  }

  // Wie viele der Personen haben mindestens einen Durchgang? `sets` = Sätze einer Challenge.
  function workoutPeopleDone(sets, userIds) {
    const did = new Set(sets.map(s => s.athlete));
    return userIds.filter(id => did.has(id)).length;
  }
```

Export-Zeile am Dateiende ersetzen:

```js
    mondayOf, isoDate, addDays, suggestForWeek, weekTemplateFor, computePenalties, fairShareOf, participantsFor,
```

durch:

```js
    mondayOf, isoDate, addDays, suggestForWeek, weekTemplateFor, computePenalties, fairShareOf, participantsFor,
    isWorkoutType, annotateWorkouts, setValue, workoutValueLabel, workoutSummary, workoutPeopleDone,
```

- [ ] **Step 4: Tests grün**

Run: `node --test tests/`
Expected: alle 6 Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/workouts.test.cjs www/data.js
git commit -m "feat(workouts): Helfer für Pflicht-Workouts mit Tests"
```

---

### Task 2: Strafkonto zählt Durchgänge

**Files:**
- Modify: `tests/workouts.test.cjs` (anhängen), `www/data.js` (`computePenalties`, `previewWeekClose`), `www/demo.js` (Zeile 18, Seed-Strafen, `previewWeekClose`)

- [ ] **Step 1: Failing tests anhängen** an `tests/workouts.test.cjs`:

```js
const cfg = (rule_mode) => ({ rule_mode, amount_cents: 500 });

test('per_challenge: Workout erfüllt mit einem Durchgang, fehlendes kostet', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 60 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 90 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_challenge'), 2);
  assert.deepEqual(pens.map(p => p.challenge_id), ['w-th']);
  assert.equal(pens[0].reason, 'Pflicht-Workout fehlt');
});

test('per_week_aggregate: fehlendes Workout lässt sich nicht mit Wiederholungen ausgleichen', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 500 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 120 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2);
  assert.equal(pens.length, 1);
  assert.equal(pens[0].reason, 'Pflicht-Workout fehlt');
});

test('per_week_aggregate: Sally-Sekunden zählen nicht als Wiederholungen', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 10 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 204 },
    { challenge_id: 'w-th', athlete: 'u1', reps: 9 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  const pens = P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2);
  assert.equal(pens.length, 1);
  assert.match(pens[0].reason, /unter fairShare/);
});

test('per_week_aggregate: alles erledigt ergibt keine Strafe', () => {
  const challenges = weekChallenges();
  const sets = [
    { challenge_id: 'w-push', athlete: 'u1', reps: 50 },
    { challenge_id: 'w-sally', athlete: 'u1', reps: 30 },
    { challenge_id: 'w-th', athlete: 'u1', reps: 4 },
  ];
  P.annotateWorkouts(sets, challenges, cats);
  assert.deepEqual(P.computePenalties(challenges, sets, 'u1', cfg('per_week_aggregate'), 2), []);
});
```

- [ ] **Step 2: Tests laufen, die neuen schlagen fehl**

Run: `node --test tests/`
Expected: FAIL bei den drei `per_week_aggregate`/`per_challenge`-Tests (alte Logik summiert Sekunden).

- [ ] **Step 3: `computePenalties` umbauen** — in `www/data.js` den Block von `// ── Penalty system: pure computation` bis einschließlich der Zeile `reason = failed ? \`aggregiert ${totalShare - totalReps} unter fairShare\` : '';` und der folgenden `}` ersetzen durch:

```js
  // ── Penalty system: pure computation ────────────────────────────────
  // Pflicht-Workouts (ch.workout, s. annotateWorkouts) zählen Durchgänge und
  // verlangen einen pro Person.
  function doneOnChallenge(sets, athlete, ch) {
    let total = 0;
    for (const s of sets) {
      if (s.challenge_id === ch.id && s.athlete === athlete) {
        total += ch.workout ? 1 : (s.reps ?? s.duration_minutes ?? 0);
      }
    }
    return total;
  }
  function shareOn(ch, participantCount) {
    return ch.workout ? 1 : fairShareOf(ch.target_reps, participantCount);
  }

  // Returns penalty descriptors for one athlete on one week.
  function computePenalties(challenges, sets, athlete, cfg, participantCount = 2) {
    if (!challenges || !challenges.length) return [];
    const mode = cfg.rule_mode;
    const amount = cfg.amount_cents;

    if (mode === 'per_challenge') {
      const out = [];
      for (const ch of challenges) {
        const reps = doneOnChallenge(sets, athlete, ch);
        const share = shareOn(ch, participantCount);
        if (reps < share) out.push({
          athlete, challenge_id: ch.id, amount_cents: amount, rule_mode: mode,
          reason: ch.workout ? 'Pflicht-Workout fehlt' : `${share - reps} unter fairShare`,
        });
      }
      return out;
    }

    const perCh = challenges.map(ch => {
      const reps = doneOnChallenge(sets, athlete, ch);
      const share = shareOn(ch, participantCount);
      return { ch, reps, share, missed: reps < share };
    });

    let failed = false, reason = '';
    if (mode === 'per_week_any') {
      failed = perCh.some(x => x.missed);
      reason = failed ? `${perCh.filter(x => x.missed).length} Challenge(s) verfehlt` : '';
    } else if (mode === 'per_week_all') {
      failed = perCh.every(x => x.missed);
      reason = failed ? 'alle Challenges verfehlt' : '';
    } else { // per_week_aggregate — ein fehlendes Pflicht-Workout gleichen Wiederholungen nicht aus
      const repCh = perCh.filter(x => !x.ch.workout);
      const totalReps  = repCh.reduce((a, x) => a + x.reps, 0);
      const totalShare = repCh.reduce((a, x) => a + x.share, 0);
      const workoutMissed = perCh.some(x => x.ch.workout && x.missed);
      failed = totalReps < totalShare || workoutMissed;
      reason = totalReps < totalShare ? `aggregiert ${totalShare - totalReps} unter fairShare`
        : workoutMissed ? 'Pflicht-Workout fehlt' : '';
    }
```

Die Funktion `repsForAthleteOnChallenge` entfällt (wird nur hier benutzt; vorher mit `grep -n repsForAthleteOnChallenge www/*.js www/*.jsx` prüfen).

- [ ] **Step 4: `previewWeekClose` in `www/data.js` markieren** — ersetzen:

```js
        const [chsRaw, members] = await Promise.all([
          api.getChallengeForWeek(weekStart),
          api.getMembers(),
        ]);
```

durch:

```js
        const [chsRaw, members, cats] = await Promise.all([
          api.getChallengeForWeek(weekStart),
          api.getMembers(),
          api.getCategories(),
        ]);
```

und ersetzen:

```js
          wkSets = (data || []).map(normSet);
        }
        const participants = participantsFor(members, weekStart);
```

durch:

```js
          wkSets = (data || []).map(normSet);
        }
        annotateWorkouts(wkSets, chs, cats);
        const participants = participantsFor(members, weekStart);
```

- [ ] **Step 5: `www/demo.js` anpassen** — Zeile 18:

```js
  const { mondayOf, isoDate, addDays, computePenalties, participantsFor } = window.PTData;
```

→

```js
  const { mondayOf, isoDate, addDays, computePenalties, participantsFor, annotateWorkouts } = window.PTData;
```

Seed-Strafen: ersetzen

```js
        const ss = sets.filter(x => chs.some(ch => ch.id === x.challenge_id)).map(x => ({ ...x, athlete: x.user_id }));
        const parts = participantsFor(ms, ws);
```

durch

```js
        const ss = sets.filter(x => chs.some(ch => ch.id === x.challenge_id)).map(x => ({ ...x, athlete: x.user_id }));
        annotateWorkouts(ss, chs, categories);
        const parts = participantsFor(ms, ws);
```

`previewWeekClose`: ersetzen

```js
        const ss = db.sets.filter(s => chs.some(c => c.id === s.challenge_id)).map(withAthlete);
        const parts = participantsFor(membersOf(cid), ws);
```

durch

```js
        const ss = db.sets.filter(s => chs.some(c => c.id === s.challenge_id)).map(withAthlete);
        annotateWorkouts(ss, chs, db.categories);
        const parts = participantsFor(membersOf(cid), ws);
```

- [ ] **Step 6: Tests grün**

Run: `node --test tests/`
Expected: alle 10 Tests PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/workouts.test.cjs www/data.js www/demo.js
git commit -m "feat(strafkonto): Pflicht-Workouts zählen Durchgänge statt Sekunden"
```

---

### Task 3: Sätze markieren, Summen ohne Workouts

**Files:** `www/app.jsx`, `www/stats-global.jsx`, `www/people.jsx`, `www/screens.jsx`, `www/celebration.jsx`

- [ ] **Step 1: `www/app.jsx` `reload`** — ersetzen:

```js
      PTPeople.set(mems.map(m => m.profile).filter(Boolean));
      setCompetition(comp);
```

durch:

```js
      // Pflicht-Workouts markieren, damit Summen sie erkennen (PTData.setValue).
      PTData.annotateWorkouts(allSetsData, challs, cats);
      PTData.annotateWorkouts(feedData, challs, cats);
      PTPeople.set(mems.map(m => m.profile).filter(Boolean));
      setCompetition(comp);
```

- [ ] **Step 2: `www/stats-global.jsx` `load`** — ersetzen:

```js
      const b = await api.getStatsBundle(list.map(c => c.id));
```

durch:

```js
      const b = await api.getStatsBundle(list.map(c => c.id));
      PTData.annotateWorkouts(b.sets, b.challenges, b.categories);
```

- [ ] **Step 3: `www/people.jsx`** — ersetzen:

```js
const valOfSet = (s) => s.reps ?? s.duration_minutes ?? 0;
```

durch:

```js
// Workouts (Sekunden/Runden) zählen nicht mit — siehe PTData.setValue.
const valOfSet = (s) => PTData.setValue(s);
```

- [ ] **Step 4: `www/screens.jsx` Summen** — vier Ersetzungen:

`repsOnLocalDate`:
```js
    .reduce((sum, s) => sum + (s.reps ?? s.duration_minutes ?? 0), 0);
```
→
```js
    .reduce((sum, s) => sum + PTData.setValue(s), 0);
```

`dailyBreakdownFor`:
```js
    if (bucket && !bucket.isFuture && g != null) bucket.vals[g] += (s.reps ?? s.duration_minutes ?? 0);
```
→
```js
    if (bucket && !bucket.isFuture && g != null) bucket.vals[g] += PTData.setValue(s);
```

`HistoryScreen`:
```js
  const totalReps = filteredAllSets.reduce((s, x) => s + (x.reps ?? x.duration_minutes ?? 0), 0);
```
→
```js
  const totalReps = filteredAllSets.reduce((s, x) => s + PTData.setValue(x), 0);
```

`computeAthleteStats` — ersetzen:
```js
  const total = own.reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
  const setCount = own.length;
  const avgSet = setCount ? Math.round(total / setCount) : 0;
  const maxSet = own.reduce((m, x) => Math.max(m, x.reps ?? x.duration_minutes ?? 0), 0);
  const byDay = {};
  for (const s of own) {
    const d = String(s.created_at).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + (s.reps ?? s.duration_minutes ?? 0);
  }
```
→
```js
  const total = own.reduce((a, x) => a + PTData.setValue(x), 0);
  const setCount = own.length;
  const avgSet = setCount ? Math.round(total / setCount) : 0;
  const maxSet = own.reduce((m, x) => Math.max(m, PTData.setValue(x)), 0);
  const byDay = {};
  for (const s of own) {
    const d = String(s.created_at).slice(0, 10);
    byDay[d] = (byDay[d] || 0) + PTData.setValue(s);
  }
```

`HistoryView`:
```js
  const val = (s) => s.reps ?? s.duration_minutes ?? 0;
```
→
```js
  const val = PTData.setValue;
```

- [ ] **Step 5: `www/celebration.jsx`** — ersetzen:

```js
    for (const ch of sorted) {
      if (flags[ch.id]) continue;
      const total = (allSets || [])
        .filter(s => s.challenge_id === ch.id)
        .reduce((sum, s) => sum + s.reps, 0);
      if (total >= ch.target_reps && ch.target_reps > 0) {
        const cat = (categories || []).find(c => c.id === ch.category_id);
        return { challenge: ch, category: cat || { name: '', emoji: '🏆' }, total };
      }
    }
```

durch:

```js
    for (const ch of sorted) {
      if (flags[ch.id]) continue;
      const cat = (categories || []).find(c => c.id === ch.category_id);
      if (PTData.isWorkoutType(cat?.challenge_type)) continue; // Pflicht-Workout: kein Wiederholungsziel
      const total = (allSets || [])
        .filter(s => s.challenge_id === ch.id)
        .reduce((sum, s) => sum + s.reps, 0);
      if (total >= ch.target_reps && ch.target_reps > 0) {
        return { challenge: ch, category: cat || { name: '', emoji: '🏆' }, total };
      }
    }
```

und in `getPersistentStyle`:

```js
      .filter(s => s.challenge_id === challenge.id)
      .reduce((sum, s) => sum + s.reps, 0);
    if (total < challenge.target_reps) return null;
```

→

```js
      .filter(s => s.challenge_id === challenge.id)
      .reduce((sum, s) => sum + (s.workout ? 0 : s.reps), 0);
    if (total < challenge.target_reps) return null;
```

- [ ] **Step 6: Tests weiter grün** — `node --test tests/` → PASS (JSX wird in Task 11 im Browser geprüft).

- [ ] **Step 7: Commit**

```bash
git add www/app.jsx www/stats-global.jsx www/people.jsx www/screens.jsx www/celebration.jsx
git commit -m "fix(stats): Pflicht-Workouts zählen nicht mehr als Wiederholungen"
```

---

### Task 4: Home-Screen mit Durchgängen

**Files:** `www/screens.jsx` (`HomeScreen`)

- [ ] **Step 1: `rows` ersetzen** — den gesamten Block von `const rows = React.useMemo(() => tabChallenges.map(ch => {` bis `}), [tabChallenges, allSets, me, sides, participantCount]);` durch:

```js
  const rows = React.useMemo(() => tabChallenges.map(ch => {
    const cat = catById[ch.category_id];
    const isWork = cat?.kind === 'work';
    const catType = cat?.challenge_type || 'standard';
    // Pflicht-Workout: jeder Eintrag ist ein Durchgang, Ziel ist einer pro Person.
    const isObligatory = PTData.isWorkoutType(catType);
    const val = (x) => isWork ? (x.duration_minutes ?? 0) : (x.reps ?? 0);
    const csets = allSets.filter(x => x.challenge_id === ch.id);
    const doneBySide = isObligatory
      ? sides.map(side => PTData.workoutPeopleDone(csets, side.statUserIds || side.userIds))
      : totalsBySide(csets, sides, val);
    const total = isObligatory
      ? doneBySide.reduce((a, x) => a + x, 0)
      : csets.reduce((a, x) => a + val(x), 0);
    const people = participantCount || sides.length || 1;
    // Fairer Anteil pro Person (Ziel / aktive Teilnehmer)
    const share = isObligatory ? 1 : PTData.fairShareOf(ch.target_reps, people);
    const goal = isObligatory ? people : ch.target_reps;
    const expectedByEod = Math.ceil(share * dayIndexInWeek(ch.week_start) / 7);
    const mine = csets.filter(x => x.athlete === me);
    const myDone = isObligatory ? mine.length : mine.reduce((a, x) => a + val(x), 0);
    const meFinished = myDone >= share;
    return {
      ch, cat, isWork, catType, isObligatory, total, goal, doneBySide, share,
      leader: isObligatory ? null : uniqueMaxIndex(doneBySide),
      myDone, meFinished,
      mySummary: isObligatory ? PTData.workoutSummary(catType, mine) : '',
      myTodayLeft: Math.max(0, expectedByEod - myDone),
      fmt: (v) => isWork ? formatDuration(v) : v,
    };
  }), [tabChallenges, allSets, me, sides, participantCount]);
```

- [ ] **Step 2: Duell-Reps** — ersetzen:

```js
    reps: rows.reduce((a, r) => a + (r.isWork ? 0 : r.doneBySide[i]), 0),
```

durch:

```js
    reps: rows.reduce((a, r) => a + (r.isWork || r.isObligatory ? 0 : r.doneBySide[i]), 0),
```

- [ ] **Step 3: Fokus-Ring** — ersetzen:

```js
  const fPct = focus ? Math.min(1, focus.total / focus.ch.target_reps) : 0;
```

durch:

```js
  const fPct = focus ? Math.min(1, focus.total / Math.max(1, focus.goal)) : 0;
```

- [ ] **Step 4: Fokus-Chips** — ersetzen:

```jsx
            <span className="rd-chip-glass">{focus.fmt(focus.total)} / {focus.fmt(focus.ch.target_reps)}{focus.isWork || focus.isObligatory ? '' : ' Reps'}</span>
            <span className="rd-chip-glass">
              {focus.meFinished ? 'dein Teil ist erledigt'
                : focus.isObligatory ? 'einmal diese Woche'
                : focus.myTodayLeft > 0 ? `heute noch ${focus.fmt(focus.myTodayLeft)}` : 'du bist auf Kurs'}
            </span>
```

durch:

```jsx
            <span className="rd-chip-glass">
              {focus.isObligatory
                ? `${focus.total} von ${focus.goal} erledigt`
                : <>{focus.fmt(focus.total)} / {focus.fmt(focus.ch.target_reps)}{focus.isWork ? '' : ' Reps'}</>}
            </span>
            <span className="rd-chip-glass">
              {focus.isObligatory ? (focus.meFinished ? `du: ${focus.mySummary}` : 'einmal diese Woche')
                : focus.meFinished ? 'dein Teil ist erledigt'
                : focus.myTodayLeft > 0 ? `heute noch ${focus.fmt(focus.myTodayLeft)}` : 'du bist auf Kurs'}
            </span>
```

- [ ] **Step 5: Listen-Untertitel** — ersetzen:

```js
              ? (r.meFinished ? 'diese Woche erledigt' : 'einmal diese Woche')
```

durch:

```js
              ? (r.meFinished ? `erledigt · ${r.mySummary}` : 'einmal diese Woche')
```

- [ ] **Step 6: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(home): Pflicht-Workouts als Durchgänge mit Zeit bzw. Runden"
```

---

### Task 5: Wochenrückblick

**Files:** `www/app.jsx` (`buildWeekRecaps`), `www/screens.jsx` (`WeekRecap`)

- [ ] **Step 1: `challStats` in `www/app.jsx`** — ersetzen:

```js
    const challStats = challs.map(ch => {
      const isWorkCh = (catById[ch.category_id]?.kind || 'sports') === 'work';
      const val = (s) => isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
      const csets = allSets.filter(s => s.challenge_id === ch.id);
      const doneBySide = totalsBySide(csets, sides, val);
      const total = doneBySide.reduce((a, x) => a + x, 0);
      const hitBySide = doneBySide.map(d => d >= ch.target_reps);
      const fairShare = PTData.fairShareOf(ch.target_reps, participants.length || sides.length);
      return { ch, cat: catById[ch.category_id], total, doneBySide, hitBySide, hit: hitBySide.every(Boolean), isWorkCh, val, fairShare };
    });
```

durch:

```js
    const challStats = challs.map(ch => {
      const cat = catById[ch.category_id];
      const isWorkCh = (cat?.kind || 'sports') === 'work';
      // Pflicht-Workouts fließen nicht in die Wiederholungs-Wertung; erreicht = jede Person ein Durchgang.
      const workout = PTData.isWorkoutType(cat?.challenge_type) ? cat.challenge_type : null;
      const val = (s) => workout ? 0 : isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
      const csets = allSets.filter(s => s.challenge_id === ch.id);
      const doneBySide = totalsBySide(csets, sides, val);
      const total = doneBySide.reduce((a, x) => a + x, 0);
      const idsOf = (side) => side.statUserIds || side.userIds;
      const countBySide = workout ? sides.map(side => csets.filter(s => idsOf(side).includes(s.athlete)).length) : null;
      const hitBySide = workout
        ? sides.map(side => PTData.workoutPeopleDone(csets, idsOf(side)) === idsOf(side).length)
        : doneBySide.map(d => d >= ch.target_reps);
      const fairShare = workout ? 1 : PTData.fairShareOf(ch.target_reps, participants.length || sides.length);
      return { ch, cat, total, doneBySide, countBySide, hitBySide, hit: hitBySide.every(Boolean), isWorkCh, workout, val, fairShare };
    });
```

- [ ] **Step 2: Anzeige in `WeekRecap` (`www/screens.jsx`)** — ersetzen:

```jsx
            <span className="recap-chall-tally mono">
              {twoSided ? <>
                <span style={{color:'var(--side0-ink)'}}>{fmtRecapVal(c.doneBySide[0])}</span>
                {' · '}
                <span style={{color:'var(--side1-ink)'}}>{fmtRecapVal(c.doneBySide[1])}</span>
              </> : <span>{fmtRecapVal(c.total)}</span>}
              {' / '}{fmtRecapVal(c.ch.target_reps)}
            </span>
```

durch:

```jsx
            <span className="recap-chall-tally mono">
              {c.workout ? (twoSided ? <>
                <span style={{color:'var(--side0-ink)'}}>{c.countBySide[0]}×</span>
                {' · '}
                <span style={{color:'var(--side1-ink)'}}>{c.countBySide[1]}×</span>
              </> : <span>{c.countBySide.reduce((a, x) => a + x, 0)}×</span>) : <>
                {twoSided ? <>
                  <span style={{color:'var(--side0-ink)'}}>{fmtRecapVal(c.doneBySide[0])}</span>
                  {' · '}
                  <span style={{color:'var(--side1-ink)'}}>{fmtRecapVal(c.doneBySide[1])}</span>
                </> : <span>{fmtRecapVal(c.total)}</span>}
                {' / '}{fmtRecapVal(c.ch.target_reps)}
              </>}
            </span>
```

- [ ] **Step 3: Commit**

```bash
git add www/app.jsx www/screens.jsx
git commit -m "feat(recap): Pflicht-Workouts im Wochenrückblick als Durchgänge"
```

---

### Task 6: Verlauf — „All“, KW-Linien, Workout-Zeilen, Feed-Einheit

**Files:** `www/screens.jsx`

- [ ] **Step 1: „All“ ohne 90-Tage-Grenze** — ersetzen:

```js
      // all time — from earliest set
      const earliest = filteredSets.length
        ? new Date(filteredSets.reduce((m, s) => s.created_at < m ? s.created_at : m, filteredSets[0].created_at))
        : new Date();
      earliest.setHours(0,0,0,0);
      start = earliest;
      const now = new Date(); now.setHours(0,0,0,0);
      total = Math.max(1, Math.round((now - start) / 86400000) + 1);
      total = Math.min(total, 90); // cap for chart
      if (total >= 90) {
        const d2 = new Date(); d2.setHours(0,0,0,0);
        d2.setDate(d2.getDate() - 89);
        start = d2;
      }
```

durch:

```js
      // all time — ab dem ersten Satz, ohne Obergrenze (Kennzahlen gelten für alles)
      const earliest = filteredSets.length
        ? new Date(filteredSets.reduce((m, s) => s.created_at < m ? s.created_at : m, filteredSets[0].created_at))
        : new Date();
      earliest.setHours(0,0,0,0);
      start = earliest;
      const now = new Date(); now.setHours(0,0,0,0);
      total = Math.max(1, Math.round((now - start) / 86400000) + 1);
```

- [ ] **Step 2: KW-Linien im kleinen Diagramm ausdünnen** — ersetzen:

```js
  const weekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  const showWeekLabels = weekMarks.length <= 5;
```

durch:

```js
  const allWeekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) allWeekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  // Bei langen Zeiträumen nur jede n-te Woche markieren
  const weekStep = Math.max(1, Math.ceil(allWeekMarks.length / 13));
  const weekMarks = allWeekMarks.filter((_, k) => k % weekStep === 0);
  const showWeekLabels = weekMarks.length <= 5;
```

- [ ] **Step 3: KW-Linien im Vollbild ausdünnen** — ersetzen:

```js
  const weekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) weekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  const showArea = series.length <= 2;
```

durch:

```js
  const allWeekMarks = [];
  for (let i = 0; i < axis.length; i++) {
    const d = new Date(axis[i].date);
    if (d.getDay() === 1) allWeekMarks.push({ idx: i, kw: weekNumber(axis[i].date) });
  }
  // Bei langen Zeiträumen nur jede n-te Woche beschriften
  const weekStep = Math.max(1, Math.ceil(allWeekMarks.length / 12));
  const weekMarks = allWeekMarks.filter((_, k) => k % weekStep === 0);
  const showArea = series.length <= 2;
```

- [ ] **Step 4: Workout-Kategorien nicht als Filter-Chip** — ersetzen:

```js
    const ids = new Set(challenges.map(c => c.category_id));
    return categories.filter(c => ids.has(c.id));
```

durch:

```js
    const ids = new Set(challenges.map(c => c.category_id));
    // Pflicht-Workouts haben keine Wiederholungen — als Filter wären sie leer.
    return categories.filter(c => ids.has(c.id) && !PTData.isWorkoutType(c.challenge_type));
```

- [ ] **Step 5: „⌀ Sätze bis Ziel“ ohne Workouts** — ersetzen:

```js
      if (catSet && !catSet.has(ch.category_id)) continue;
      const chSets = (setsByCh[ch.id] || [])
```

durch:

```js
      if (catSet && !catSet.has(ch.category_id)) continue;
      if (PTData.isWorkoutType(catById[ch.category_id]?.challenge_type)) continue;
      const chSets = (setsByCh[ch.id] || [])
```

- [ ] **Step 6: Kategorie-Aufschlüsselung ohne Workouts** — ersetzen:

```js
      const si = sideIdx[s.athlete];
      if (!ch || si == null) continue;
      m[ch.category_id] ||= zeros();
```

durch:

```js
      const si = sideIdx[s.athlete];
      if (!ch || si == null || s.workout) continue;
      m[ch.category_id] ||= zeros();
```

- [ ] **Step 7: Verlauf-Liste workout-fähig** — ersetzen:

```js
        const sideTotalsFor = (ch) => totalsBySide(setsByCh[ch.id] || [], sides);
        const challengeIsDone = (ch) => sideTotalsFor(ch).every(v => v >= ch.target_reps);
        const progressRows = (ch) => {
          const ts = sideTotalsFor(ch);
          return (
            <div className="right">
              {sides.map((side, i) => {
                const pctV = Math.round(100 * ts[i] / ch.target_reps);
                const done = ts[i] >= ch.target_reps;
                return (
                  <div key={side.key} style={{display:'flex',justifyContent:'flex-end',alignItems:'baseline',gap:8,marginTop: i ? 4 : 0}}>
                    <span className="mono" style={{color: colorOf(i),fontWeight:700,fontSize:15}}>{side.short}</span>
                    <span className={`pct mono ${done ? 'done' : pctV < 50 ? 'miss' : ''}`} style={{fontSize:18}}>{pctV}%</span>
                    <span className="wk mono" style={{minWidth:72,textAlign:'right'}}>{ts[i]}/{ch.target_reps}</span>
                  </div>
                );
              })}
            </div>
          );
        };
```

durch:

```js
        const workoutOf = (ch) => {
          const t = catById[ch.category_id]?.challenge_type;
          return PTData.isWorkoutType(t) ? t : null;
        };
        const idsOf = (side) => side.statUserIds || side.userIds;
        const goalFor = (ch, i) => workoutOf(ch) ? idsOf(sides[i]).length : ch.target_reps;
        const goalLabel = (ch) => workoutOf(ch) ? 'Pflicht · 1× pro Person' : `Ziel ${ch.target_reps}`;
        const sideTotalsFor = (ch) => workoutOf(ch)
          ? sides.map(side => PTData.workoutPeopleDone(setsByCh[ch.id] || [], idsOf(side)))
          : totalsBySide(setsByCh[ch.id] || [], sides);
        const challengeIsDone = (ch) => sideTotalsFor(ch).every((v, i) => v >= goalFor(ch, i));
        const progressRows = (ch) => {
          const ts = sideTotalsFor(ch);
          const workout = workoutOf(ch);
          return (
            <div className="right">
              {sides.map((side, i) => {
                const goal = goalFor(ch, i);
                const pctV = Math.round(100 * ts[i] / Math.max(1, goal));
                const done = ts[i] >= goal;
                const valueText = workout
                  ? PTData.workoutSummary(workout, (setsByCh[ch.id] || []).filter(s => idsOf(side).includes(s.athlete)))
                  : `${ts[i]}/${ch.target_reps}`;
                return (
                  <div key={side.key} style={{display:'flex',justifyContent:'flex-end',alignItems:'baseline',gap:8,marginTop: i ? 4 : 0}}>
                    <span className="mono" style={{color: colorOf(i),fontWeight:700,fontSize:15}}>{side.short}</span>
                    <span className={`pct mono ${done ? 'done' : pctV < 50 ? 'miss' : ''}`} style={{fontSize:18}}>{workout ? (done ? '✓' : '–') : `${pctV}%`}</span>
                    <span className="wk mono" style={{minWidth:72,textAlign:'right'}}>{valueText}</span>
                  </div>
                );
              })}
            </div>
          );
        };
```

Danach die beiden Ziel-Zeilen ersetzen:

```jsx
                  <div className="wk" style={{ marginTop: 4 }}>Ziel {ch.target_reps}</div>
```
→
```jsx
                  <div className="wk" style={{ marginTop: 4 }}>{goalLabel(ch)}</div>
```

```jsx
                      <div className="wk" style={{ marginTop: 2 }}>Ziel {ch.target_reps}</div>
```
→
```jsx
                      <div className="wk" style={{ marginTop: 2 }}>{goalLabel(ch)}</div>
```

- [ ] **Step 8: Feed-Bearbeiten-Einheit** — ersetzen:

```jsx
              <div className="feed-edit-unit">{isWorkSet(s) ? 'min' : 'reps'}</div>
```

durch:

```jsx
              <div className="feed-edit-unit">{isWorkSet(s) ? 'min'
                : s.category?.challenge_type === 'bring_sally_up' ? 'Sek.'
                : s.category?.challenge_type === 'tom_holland' ? 'Runden' : 'reps'}</div>
```

- [ ] **Step 9: Commit**

```bash
git add www/screens.jsx
git commit -m "fix(verlauf): „All“ zeigt alles, Workouts als Durchgänge im Verlauf"
```

---

### Task 7: Statistik „Ich“ mit Workouts-Karte

**Files:** `www/stats-global.jsx` (`AllTimeStats`)

- [ ] **Step 1: Sport ohne Workouts** — ersetzen:

```js
    const sport = mine.filter(s => !isWork(s));
```

durch:

```js
    // Pflicht-Workouts (Sekunden/Runden) zählen nicht als Wiederholungen.
    const sport = mine.filter(s => !isWork(s) && !s.workout);
```

- [ ] **Step 2: Kategorie-Werte** — ersetzen:

```js
      const v = s.reps ?? s.duration_minutes ?? 0;
      const e = perCat[cid] ||= { cat: catById[cid], total: 0, sets: 0, best: 0, bestDay: 0 };
      e.total += v; e.sets++; e.best = Math.max(e.best, v);
```

durch:

```js
      const v = s.reps ?? s.duration_minutes ?? 0;
      const e = perCat[cid] ||= { cat: catById[cid], total: 0, sets: 0, best: 0, bestDay: 0 };
      // Workout: total = Durchgänge, best = längste Zeit bzw. meiste Runden
      if (s.workout) { e.total += 1; e.sets++; e.best = Math.max(e.best, v); continue; }
      e.total += v; e.sets++; e.best = Math.max(e.best, v);
```

und

```js
    const cats = Object.values(perCat).sort((a, b) => b.total - a.total);
```

durch

```js
    const allCats = Object.values(perCat).sort((a, b) => b.total - a.total);
    const cats = allCats.filter(e => !PTData.isWorkoutType(e.cat?.challenge_type));
    const workouts = allCats.filter(e => PTData.isWorkoutType(e.cat?.challenge_type));
```

- [ ] **Step 3: Wochenziel und Summe pro Challenge** — ersetzen:

```js
        const metAll = chs.every(ch => {
          const mineVal = wSets.filter(s => s.challenge_id === ch.id && s.athlete === me)
            .reduce((a, s) => a + (s.reps ?? s.duration_minutes ?? 0), 0);
          return mineVal >= PTData.fairShareOf(ch.target_reps, n);
        });
```

durch:

```js
        const metAll = chs.every(ch => {
          const mySets = wSets.filter(s => s.challenge_id === ch.id && s.athlete === me);
          if (ch.workout) return mySets.length >= 1;
          const mineVal = mySets.reduce((a, s) => a + (s.reps ?? s.duration_minutes ?? 0), 0);
          return mineVal >= PTData.fairShareOf(ch.target_reps, n);
        });
```

und

```js
      const myTotal = compSets.filter(s => s.athlete === me).reduce((a, s) => a + (s.reps ?? s.duration_minutes ?? 0), 0);
```

durch

```js
      const myTotal = compSets.filter(s => s.athlete === me).reduce((a, s) => a + PTData.setValue(s), 0);
```

und im `return` des `useMemo` `cats,` durch `cats, workouts,` ersetzen.

- [ ] **Step 4: Workouts-Karte** — direkt nach der schließenden `</div>` der Karte „Nach Kategorie“ (vor `<div className="card">` mit „Pro Challenge“) einfügen:

```jsx
      {stats.workouts.length > 0 && (
        <div className="card">
          <div className="label" style={{ margin: 0, marginBottom: 10 }}>Workouts</div>
          {stats.workouts.map(e => (
            <div className="mu-cat-stat" key={e.cat?.id}>
              <div className="mu-cat-stat-name">{e.cat?.emoji} {e.cat?.name}</div>
              <div className="mu-cat-stat-vals mono">
                <span><b>{e.total}×</b> gemacht</span>
                <span>Bestwert {PTData.workoutValueLabel(e.cat.challenge_type, e.best)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add www/stats-global.jsx
git commit -m "feat(stats): Workouts-Karte, Reps gesamt ohne Sally/Tom Holland"
```

---

### Task 8: `user_reps_today` ohne Workouts

**Files:** Create `supabase/migrations/20261004000000_workout_reps_today.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Pflicht-Workouts (Bring Sally Up, Tom Holland) speichern Sekunden bzw. Runden
-- in sets.reps. Die Push-Nachricht „Schon X Reps heute“ soll nur echte
-- Wiederholungen zählen. Sätze ohne zuordenbare Kategorie zählen wie bisher.
-- create or replace behält Owner und Grants (nur service_role darf ausführen).
create or replace function public.user_reps_today(p_user uuid, p_competition uuid) returns int
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(coalesce(s.reps, 0)), 0)::int
  from sets s
  left join weekly_challenges wc on wc.id = s.challenge_id
  left join categories c on c.id = wc.category_id
  where s.user_id = p_user and s.competition_id = p_competition
    and coalesce(c.challenge_type, 'standard') not in ('bring_sally_up', 'tom_holland')
    and (s.created_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date
$$;
```

- [ ] **Step 2: Lokal gegen die Generalprobe-DB prüfen** (Scratchpad-Cluster `pgtest`, DB `tb` = A + A2 + B mit Testkonten). Erwartet vorher 200, nachher 20:

```bash
S=/private/tmp/claude-501/-Users-jonasnolte-Downloads-Benny-Joni-main--claude-worktrees-testleitbilder-fastlane-77742e/19348e0c-afb8-4dc1-94b4-d5faddf74ab4/scratchpad
PGBIN=/opt/homebrew/opt/postgresql@17/bin
export LC_ALL=en_US.UTF-8 PGHOST=127.0.0.1 PGPORT=54988 PGUSER=postgres
$PGBIN/pg_ctl -D $S/pgtest/pgdata -l $S/pgtest/postgres.log -w start
$PGBIN/psql -X -v ON_ERROR_STOP=1 -d tb <<'SQL'
begin;
with comp as (select id from competitions where legacy_key = 'benny-jonas'),
     u as (select id from profiles where display_name = 'Jonas'),
     ins as (
       insert into weekly_challenges (competition_id, week_start, category_id, target_reps, chosen_by_user)
       select comp.id, date_trunc('week', now())::date, c.id, 100, u.id
       from comp, u, categories c where c.name in ('Liegestütze', 'Bring Sally Up')
       on conflict do nothing returning id, category_id)
insert into sets (competition_id, user_id, challenge_id, reps)
select comp.id, u.id, ins.id, case c.challenge_type when 'bring_sally_up' then 180 else 20 end
from comp, u, ins join categories c on c.id = ins.category_id;
select 'vorher', user_reps_today((select id from profiles where display_name = 'Jonas'), (select id from competitions where legacy_key = 'benny-jonas'));
\i /Users/jonasnolte/Downloads/Benny-Joni-main/.claude/worktrees/testleitbilder-fastlane-77742e/supabase/migrations/20261004000000_workout_reps_today.sql
select 'nachher', user_reps_today((select id from profiles where display_name = 'Jonas'), (select id from competitions where legacy_key = 'benny-jonas'));
select 'grants', string_agg(grantee, ',') from information_schema.routine_privileges where routine_name = 'user_reps_today';
rollback;
SQL
$PGBIN/pg_ctl -D $S/pgtest/pgdata -m fast -w stop
```

Expected: `vorher | 200`, `nachher | 20`, Grants nur `postgres,service_role` (wie vorher).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261004000000_workout_reps_today.sql
git commit -m "fix(push): user_reps_today zählt Pflicht-Workouts nicht als Reps"
```

---

### Task 9: Profil-Karte in den Einstellungen, iOS-Texte

**Files:** `www/settings.jsx`, `www/app.jsx`, `ios/App/App/Info.plist`

- [ ] **Step 1: `SettingsScreen`-Signatur** — in `www/settings.jsx` ersetzen:

```js
function SettingsScreen({ api, baseApi, competition, members = [], onCompetitionChanged, onLeft, categories, onAddCategory, notificationsEnabled, onSetNotifications, me, projectTags, toolTags, reload: reloadProp }) {
```

durch:

```js
function SettingsScreen({ api, baseApi, competition, members = [], onCompetitionChanged, onLeft, categories, onAddCategory, notificationsEnabled, onSetNotifications, me, projectTags, toolTags, reload: reloadProp, profile, onProfile }) {
```

- [ ] **Step 2: Karte oben einfügen** — ersetzen:

```jsx
  return (
    <div>
      {competition && baseApi && window.CompetitionSettingsCard && (
```

durch:

```jsx
  return (
    <div>
      {profile && onProfile && (
        <button className="mu-profile-row" style={{ marginBottom: 14 }} onClick={onProfile}>
          <Avatar profile={profile} size={44} />
          <span className="mu-profile-text">
            <span className="mu-profile-name">{profile.display_name}</span>
            <span className="mu-profile-sub">Profilbild, Name und Farbe ändern</span>
          </span>
          <span className="mu-chev">›</span>
        </button>
      )}
      {competition && baseApi && window.CompetitionSettingsCard && (
```

- [ ] **Step 3: Callback durchreichen (`www/app.jsx`)** — ersetzen:

```js
function CompetitionApp({ api, competition: initialCompetition, profile, me, t, setTweak,
  onOpenSwitcher, onCompetitionChanged, onLeft }) {
```

durch:

```js
function CompetitionApp({ api, competition: initialCompetition, profile, me, t, setTweak,
  onOpenSwitcher, onOpenProfile, onCompetitionChanged, onLeft }) {
```

ersetzen:

```js
        onOpenSwitcher={() => setSheet('switcher')}
        onCompetitionChanged={() => loadAccount()}
```

durch:

```js
        onOpenSwitcher={() => setSheet('switcher')}
        onOpenProfile={() => setSheet('profile')}
        onCompetitionChanged={() => loadAccount()}
```

ersetzen:

```js
          onLeft={onLeft}
          reload={reload} />
```

durch:

```js
          onLeft={onLeft}
          profile={profile}
          onProfile={onOpenProfile}
          reload={reload} />
```

- [ ] **Step 4: `Info.plist`** — ersetzen:

```xml
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
```

durch:

```xml
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
	<key>NSCameraUsageDescription</key>
	<string>Damit du ein Foto als Profilbild aufnehmen kannst.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>Damit du ein Foto aus deiner Mediathek als Profilbild wählen kannst.</string>
```

Prüfen: `plutil -lint ios/App/App/Info.plist` → `OK`.

- [ ] **Step 5: Commit**

```bash
git add www/settings.jsx www/app.jsx ios/App/App/Info.plist
git commit -m "feat(profil): Profilbild über die Einstellungen erreichbar"
```

---

### Task 10: Push-Entitlement einbinden

**Files:** `ios/App/App.xcodeproj/project.pbxproj`

- [ ] **Step 1: Eintrag in Debug und Release des App-Targets** — in beiden Blöcken `504EC3171FED79650016851F /* Debug */` und `504EC3181FED79650016851F /* Release */` nach

```
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
```

die Zeile

```
				CODE_SIGN_ENTITLEMENTS = App/App.entitlements;
```

einfügen (genau zwei Vorkommen von `ASSETCATALOG_COMPILER_APPICON_NAME`; per `grep -c` vorher prüfen).

- [ ] **Step 2: Prüfen**

Run: `xcodebuild -project ios/App/App.xcodeproj -target App -configuration Release -showBuildSettings 2>/dev/null | grep CODE_SIGN_ENTITLEMENTS`
Expected: `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`

- [ ] **Step 3: Commit**

```bash
git add ios/App/App.xcodeproj/project.pbxproj
git commit -m "fix(ios): Push-Entitlement im App-Target einbinden"
```

---

### Task 11: Prüfung im Browser (Demo-Modus)

**Files:** `.claude/launch.json` (neue Konfiguration ohne npm-Download)

- [ ] **Step 1: Server-Konfiguration ergänzen** — in `configurations` hinzufügen:

```json
    {
      "name": "www (python, ohne npm)",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8010", "--directory", "www"],
      "port": 8010
    },
```

- [ ] **Step 2: Starten** — `preview_start` mit Name `www (python, ohne npm)`, dann `http://localhost:8010/?demo=reset` und anschließend `http://localhost:8010/?demo` öffnen.

- [ ] **Step 3: Prüfen** (mit `read_page`, `read_console_messages`, Screenshots):
  - Konsole ohne Fehler.
  - Home: Tom Holland/Bring Sally Up zeigen „einmal diese Woche“ bzw. „erledigt · N× · …“, Fokus-Chip „x von y erledigt“.
  - Statistik → „Ich“: Karte „Workouts“ mit „N× gemacht“ und Bestwert; „Reps gesamt“ = Summe der eigenen Nicht-Workout-Sport-Sätze (per `javascript_tool` aus `localStorage.pt_demo_db_v1` nachrechnen).
  - Statistik → „Challenge“ → „All“: Reps-Summe beider = alle Sätze seit dem ersten Satz (nachrechnen), Diagramm ohne überlappende KW-Beschriftung.
  - Verlauf-Liste: Workout-Zeilen zeigen „Pflicht · 1× pro Person“ und „N× · …“.
  - Einstellungen: Profil-Karte oben, Tippen öffnet den Dialog mit „Foto ändern“.

- [ ] **Step 4: Server stoppen, Commit**

```bash
git add .claude/launch.json
git commit -m "chore: Static-Server ohne npm-Download für die Browser-Prüfung"
```

---

### Task 12: Auslieferung 1.4 (11)

- [ ] **Step 1: Bisher unversionierte Teile committen** (fastlane-Setup, Doku, A2-Migration, `.gitignore`):

```bash
git add ios/.gitignore ios/App/Gemfile ios/App/Gemfile.lock ios/App/fastlane/Appfile ios/App/fastlane/Fastfile ios/App/fastlane/.env.example docs/FASTLANE_TESTFLIGHT.md supabase/migrations/20261002005000_multi_user_a2_harden.sql
git commit -m "chore: fastlane-TestFlight-Lane und Migration A2 versionieren"
```

`supabase/.temp/cli-latest` per `git checkout -- supabase/.temp/cli-latest` zurücksetzen (CLI-Nebenprodukt).

- [ ] **Step 2: Build und Upload**

```bash
cd ios/App && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec fastlane beta
```

Expected: `Baue 1.4 (11)`, `TestFlight-Upload abgeschlossen: 1.4 (11)`. Danach `git checkout -- ios/App/CapApp-SPM/Package.swift`.

- [ ] **Step 3: Verarbeitung abwarten** — im Hintergrund:

```bash
python3 /private/tmp/claude-501/-Users-jonasnolte-Downloads-Benny-Joni-main--claude-worktrees-testleitbilder-fastlane-77742e/19348e0c-afb8-4dc1-94b4-d5faddf74ab4/scratchpad/asc_wait_build.py 11
```

Ziel: `processing=VALID internal=IN_BETA_TESTING`.

- [ ] **Step 4: Nutzer-Schritte** (Claude darf Produktion nicht selbst ansprechen):
  1. Migration `user_reps_today` — mit Token im Schlüsselbund:
     ```bash
     cd /Users/jonasnolte/Downloads/Benny-Joni-main/.claude/worktrees/testleitbilder-fastlane-77742e && (export SUPABASE_ACCESS_TOKEN="$(security find-generic-password -a "$USER" -s supabase-benny-joni -w)"; supabase db query --linked --agent=no -o table -f supabase/migrations/20261004000000_workout_reps_today.sql)
     ```
     Ohne Token: Datei-Inhalt im SQL Editor ausführen.
  2. APNs-Secrets prüfen — mit Token:
     ```bash
     (export SUPABASE_ACCESS_TOKEN="$(security find-generic-password -a "$USER" -s supabase-benny-joni -w)"; supabase secrets list --project-ref jczyyupxxqrdgbeifcwe)
     ```
     Ohne Token: Dashboard → Edge Functions → Secrets. Erwartet `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`, `APNS_PRIVATE_KEY`; fehlen sie → `docs/PUSH_SETUP_MORNING.md` Schritte 1–3.
  3. Nach dem Update auf 1.4 (11): App öffnen, Benachrichtigungen erlauben; ein Satz von Benny → Push bei Jonas.
