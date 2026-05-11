# Wochenziel-Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iMessage-style fullscreen celebration (Firework + Laser + Confetti mashup) when a weekly challenge reaches its goal, plus a persistent celebration mode that rotates between three visual styles for the rest of the week.

**Architecture:** A new `www/celebration.jsx` file contains the `useCelebration` React hook (state detection + localStorage flag) and a `<CelebrationOverlay/>` component (5-second fullscreen FX layer). `screens.jsx` integrates the hook in `HomeScreen` and renders the overlay when needed. Three CSS classes in `styles.css` (`.pm-gold`, `.pm-sparkle`, `.pm-trophy`) drive the persistent mode; the active style is rolled once per app-session and stored in `sessionStorage`. The `.pm-trophy` style additionally swaps the middle of the hero card layout. The native iOS haptic feedback uses `@capacitor/haptics`. Sound is a bundled MP3 played via the standard `Audio` API.

**Tech Stack:** Plain React (no build step, Babel-standalone in browser), JSX files loaded as `<script type="text/babel">` in `www/index.html`. Capacitor 8 for iOS. localStorage / sessionStorage for state. CSS animations + JS particle spawning. No bundler, no test framework.

> **Codebase note — no test framework:** This codebase has no automated tests. Every task uses **manual verification** in the browser (open `www/index.html` via a static server, e.g. `npx http-server www` on port 8080, or use the existing iOS sim). Replace TDD where it would normally go.

> **Worktree:** Optional but recommended. If you want isolation, create one with `git worktree add ../terminator-ios-celebration -b feat/wochenziel-celebration`. Otherwise work directly in `/Users/jonasnolte/Desktop/terminator-ios`.

---

## File Structure

| File | Role |
|---|---|
| `www/celebration.jsx` **(new)** | Hook `useCelebration` + component `<CelebrationOverlay/>` |
| `www/sounds/goal-reached.mp3` **(new)** | 3 s audio: Whoosh + Pop + Sparkle-Tail |
| `www/index.html` (modified) | Add `<script type="text/babel" src="celebration.jsx">` |
| `www/styles.css` (modified) | Append persistent-mode CSS + reduced-motion overrides + overlay base styles |
| `www/app.jsx` (modified) | Roll `pt_persistent_style_v1` once per session |
| `www/screens.jsx` (modified) | Use `useCelebration`, render overlay, apply `.pm-*` classes, swap trophy layout |
| `package.json` (modified) | Add `@capacitor/haptics` dependency |

Each task below lists the exact file paths it touches.

---

## Task 1: Bootstrap — Empty celebration.jsx + script tag

**Files:**
- Create: `www/celebration.jsx`
- Modify: `www/index.html` (add script tag)

- [ ] **Step 1: Create celebration.jsx with stub exports**

Write `www/celebration.jsx` with this content:

```jsx
/* global React */
/* eslint-disable no-unused-vars */

// Hook: detect unseen goal crossings + provide persistent style.
// Implementation comes in Task 2.
function useCelebration(challenges, allSets, me) {
  return {
    pendingCelebration: null,
    dismissCurrent: () => {},
    getPersistentStyle: () => null,
  };
}

// Component: 5-second fullscreen celebration overlay.
// Implementation grows over Tasks 4–7.
function CelebrationOverlay({ category, targetReps, onDone }) {
  const { useEffect } = React;
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 48, fontWeight: 900,
    }}>
      ZIEL ERREICHT (Stub)
    </div>
  );
}
```

- [ ] **Step 2: Wire celebration.jsx into index.html**

Open `www/index.html`. Find the existing line:

```html
<script type="text/babel" src="screens.jsx"></script>
```

Add this NEW line directly BELOW it (so it loads after screens.jsx but before app.jsx):

Actually re-check current order. The current order is:
1. tweaks-panel.jsx
2. components.jsx
3. screens.jsx
4. settings.jsx
5. account-switch.jsx
6. app.jsx

Insert celebration.jsx between `screens.jsx` and `settings.jsx`. The `useCelebration` hook is used in screens.jsx, but at function-call time, not at definition time — global hoisting via Babel-standalone means the function is reachable as long as celebration.jsx has loaded before any render happens. Safer order: put it BEFORE `screens.jsx` so screens.jsx can call it during render.

The exact edit:

Find:
```html
<script type="text/babel" src="components.jsx"></script>
```

Insert directly AFTER that, BEFORE the `screens.jsx` line:

```html
<script type="text/babel" src="celebration.jsx"></script>
```

The resulting block:
```html
<script type="text/babel" src="components.jsx"></script>
<script type="text/babel" src="celebration.jsx"></script>
<script type="text/babel" src="screens.jsx"></script>
```

- [ ] **Step 3: Manual verification — file loads, no console errors**

In a terminal at the project root, run:
```bash
cd www && npx http-server -p 8080 -c-1
```
(`-c-1` disables caching so edits show immediately.)

Open `http://localhost:8080/` in Chrome. Open DevTools Console. Expected:
- No red errors mentioning `celebration.jsx`.
- The app loads normally.
- Type `useCelebration` in the console → returns the function definition.

- [ ] **Step 4: Commit**

```bash
git add www/celebration.jsx www/index.html
git commit -m "feat(celebration): bootstrap celebration.jsx stub and load it from index.html"
```

---

## Task 2: useCelebration hook — detection + localStorage flag

**Files:**
- Modify: `www/celebration.jsx` (replace stub hook with real implementation)

- [ ] **Step 1: Implement the hook**

Replace the `useCelebration` stub in `www/celebration.jsx` with:

```jsx
const PT_CELEBRATED_KEY = 'pt_celebrated_v1';
const PT_PERSISTENT_STYLE_KEY = 'pt_persistent_style_v1';
const PERSISTENT_STYLES = ['gold', 'sparkle', 'trophy'];

function readSeenFlags() {
  try {
    return JSON.parse(localStorage.getItem(PT_CELEBRATED_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function markSeen(athlete, challengeId) {
  const flags = readSeenFlags();
  flags[athlete] = flags[athlete] || {};
  flags[athlete][challengeId] = true;
  localStorage.setItem(PT_CELEBRATED_KEY, JSON.stringify(flags));
}

function useCelebration(challenges, allSets, me, categories) {
  const { useState, useEffect, useMemo, useCallback } = React;
  const [tick, setTick] = useState(0); // bumps to re-evaluate after dismiss

  const pendingCelebration = useMemo(() => {
    if (!me || !challenges?.length) return null;
    const flags = readSeenFlags()[me] || {};
    // Sort by challenge.id for stable ordering when multiple unseen
    const sorted = [...challenges].sort((a, b) => String(a.id).localeCompare(String(b.id)));
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
    return null;
  }, [challenges, allSets, me, categories, tick]);

  const dismissCurrent = useCallback(() => {
    if (pendingCelebration) {
      markSeen(me, pendingCelebration.challenge.id);
      setTick(t => t + 1);
    }
  }, [pendingCelebration, me]);

  const getPersistentStyle = useCallback((challenge) => {
    if (!challenge) return null;
    const total = (allSets || [])
      .filter(s => s.challenge_id === challenge.id)
      .reduce((sum, s) => sum + s.reps, 0);
    if (total < challenge.target_reps) return null;
    return sessionStorage.getItem(PT_PERSISTENT_STYLE_KEY) || 'gold';
  }, [allSets]);

  return { pendingCelebration, dismissCurrent, getPersistentStyle };
}
```

- [ ] **Step 2: Manual verification — hook reports state correctly**

The hook is not wired in yet. Verify by adding a one-liner debug in browser console after the page loads:

```js
// In DevTools console:
window.localStorage.removeItem('pt_celebrated_v1');
```

Then check that `readSeenFlags()` from console returns `{}`. The full integration test happens in Task 3.

- [ ] **Step 3: Commit**

```bash
git add www/celebration.jsx
git commit -m "feat(celebration): implement useCelebration hook with localStorage seen-flag"
```

---

## Task 3: Wire hook into HomeScreen + mount stub overlay

**Files:**
- Modify: `www/screens.jsx` (HomeScreen function)

- [ ] **Step 1: Inspect current HomeScreen signature**

Open `www/screens.jsx`. Find line 81:

```jsx
function HomeScreen({ api, me, challenges = [], categories = [], allSets = [], layout, onAddGoal, onEditChallenge, onLogChallenge, onQuickLog,
```

The function already receives all the inputs the hook needs. Good.

- [ ] **Step 2: Call the hook and render the overlay**

In `www/screens.jsx`, inside the `HomeScreen` function, just after the opening line and any existing state hooks, add:

```jsx
const celebration = useCelebration(challenges, allSets, me, categories);
```

Then, find the outermost `return` of `HomeScreen` (the one that starts the JSX). Wrap the existing return JSX so the overlay sits as a sibling at the top:

```jsx
return (
  <>
    {/* existing JSX of HomeScreen goes here, unchanged */}
    {celebration.pendingCelebration && (
      <CelebrationOverlay
        category={celebration.pendingCelebration.category}
        targetReps={celebration.pendingCelebration.challenge.target_reps}
        onDone={celebration.dismissCurrent}
      />
    )}
  </>
);
```

If the current return is `return (<div className="layout-...">...</div>);`, the change is:
- Replace the outer `return (` with `return (<>` and the closing `);` with the new block above.

- [ ] **Step 3: Manual verification — overlay appears on crossover**

1. Start dev server: `cd www && npx http-server -p 8080 -c-1`.
2. Open `http://localhost:8080/` in Chrome.
3. Pick a user (e.g. Jonas) if not already chosen.
4. In DevTools Console, reset state for testing:
   ```js
   localStorage.removeItem('pt_celebrated_v1');
   ```
5. Reload the page. If you don't have a challenge near 100%, create one with a tiny target (e.g. target_reps = 5) via the Setup sheet, then log 5 reps.
6. Expected: the stub overlay ("ZIEL ERREICHT (Stub)") appears and disappears after 5 s.
7. Reload again. Expected: no overlay (seen-flag is set).
8. Run `localStorage.removeItem('pt_celebrated_v1')` and reload. Expected: overlay reappears.

- [ ] **Step 4: Commit**

```bash
git add www/screens.jsx
git commit -m "feat(celebration): wire useCelebration hook into HomeScreen with stub overlay"
```

---

## Task 4: Overlay structure + static CSS-driven layers (Hero, Lasers, Strobe, Flash-Bang, Halo)

**Files:**
- Modify: `www/celebration.jsx` (expand CelebrationOverlay)
- Modify: `www/styles.css` (append celebration overlay styles)

- [ ] **Step 1: Replace the stub overlay in celebration.jsx**

In `www/celebration.jsx`, replace the entire `CelebrationOverlay` function with:

```jsx
function CelebrationOverlay({ category, targetReps, onDone }) {
  const { useEffect, useState } = React;
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSkipping(true), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (skipping) {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
  }, [skipping, onDone]);

  const targetFormatted = (targetReps || 0).toLocaleString('de-DE');

  return (
    <div
      className={`celebration-overlay ${skipping ? 'is-skipping' : ''}`}
      onClick={() => setSkipping(true)}
    >
      <div className="cel-flashbang" />
      <div className="cel-laser-bg" />
      <div className="cel-strobe" />

      <div className="cel-laser-beam" style={{ '--top': '12%',  '--angle': '14deg',  '--delay': '0s',   '--dur': '1.6s', '--color': '#ff00ff' }} />
      <div className="cel-laser-beam" style={{ '--top': '24%',  '--angle': '-22deg', '--delay': '0.2s', '--dur': '1.8s', '--color': '#00ffff' }} />
      <div className="cel-laser-beam" style={{ '--top': '38%',  '--angle': '9deg',   '--delay': '0.5s', '--dur': '1.5s', '--color': '#ffff33' }} />
      <div className="cel-laser-beam" style={{ '--top': '50%',  '--angle': '-14deg', '--delay': '0.8s', '--dur': '2.0s', '--color': '#ff0099' }} />
      <div className="cel-laser-beam" style={{ '--top': '62%',  '--angle': '20deg',  '--delay': '1.1s', '--dur': '1.6s', '--color': '#00ff88' }} />
      <div className="cel-laser-beam" style={{ '--top': '75%',  '--angle': '-8deg',  '--delay': '1.4s', '--dur': '1.8s', '--color': '#a855f7' }} />
      <div className="cel-laser-beam" style={{ '--top': '86%',  '--angle': '16deg',  '--delay': '1.7s', '--dur': '1.5s', '--color': '#ff7700' }} />
      <div className="cel-laser-beam" style={{ '--top': '6%',   '--angle': '-12deg', '--delay': '0.6s', '--dur': '1.7s', '--color': '#33ddff' }} />

      <div className="cel-hero-wrap">
        <div className="cel-hero-stage">
          <div className="cel-halo cel-halo-1">💪</div>
          <div className="cel-halo cel-halo-2">🔥</div>
          <div className="cel-halo cel-halo-3">⚡</div>
          <div className="cel-halo cel-halo-4">🏆</div>
          <div className="cel-hero-text">ZIEL<br/>ERREICHT</div>
        </div>
        <div className="cel-counter-row">
          <span className="cel-counter-num" data-target={targetReps}>0</span>
          <span className="cel-counter-of">/ {targetFormatted} {category?.name || 'Reps'}</span>
        </div>
        <div className="cel-subtext">{category?.emoji || '🏆'} {targetFormatted} {category?.name || 'Reps'} geknackt</div>
      </div>

      <div className="cel-skip-hint">tap zum Überspringen</div>
    </div>
  );
}
```

- [ ] **Step 2: Append celebration CSS to styles.css**

Open `www/styles.css`. Append this at the END of the file:

```css
/* ============================================================ */
/* Celebration Overlay — fullscreen takeover when goal reached  */
/* ============================================================ */
.celebration-overlay {
  position: fixed; inset: 0; z-index: 9999;
  overflow: hidden;
  background: linear-gradient(180deg, #08081a 0%, #1a0a2e 100%);
  isolation: isolate;
  opacity: 1;
  transition: opacity 0.6s ease-out;
  animation: cel-stage-shake 5s ease-out;
  cursor: pointer;
}
.celebration-overlay.is-skipping { opacity: 0; pointer-events: none; }

@keyframes cel-stage-shake {
  0%   { transform: translate(0, 0); }
  1%   { transform: translate(-12px, 8px) rotate(-1.5deg); }
  2%   { transform: translate(10px, -10px) rotate(1.5deg); }
  3%   { transform: translate(-8px, 6px) rotate(-1deg); }
  4%   { transform: translate(8px, -4px) rotate(1deg); }
  5%   { transform: translate(-6px, 4px) rotate(-0.6deg); }
  6%   { transform: translate(4px, -2px) rotate(0.6deg); }
  8%   { transform: translate(0, 0); }
  100% { transform: translate(0, 0); }
}

.cel-flashbang {
  position: absolute; inset: 0; z-index: 50;
  background: #fff;
  pointer-events: none;
  animation: cel-flashbang 0.25s ease-out forwards;
}
@keyframes cel-flashbang {
  0%   { opacity: 0; background: #fff; }
  20%  { opacity: 1; background: #fff; }
  60%  { opacity: 0.6; background: #ffbe0b; }
  100% { opacity: 0; }
}

.cel-laser-bg {
  position: absolute; inset: 0; z-index: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(255,0,255,0.6), transparent 45%),
    radial-gradient(circle at 70% 80%, rgba(0,255,255,0.6), transparent 45%),
    radial-gradient(circle at 50% 50%, rgba(255,190,11,0.4), transparent 60%);
  animation: cel-laser-pulse 0.45s ease-in-out infinite;
}
@keyframes cel-laser-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}

.cel-strobe {
  position: absolute; inset: 0; z-index: 1;
  mix-blend-mode: screen;
  opacity: 0.55;
  animation: cel-strobe 0.4s steps(1, end) infinite;
}
@keyframes cel-strobe {
  0%   { background: radial-gradient(circle at 20% 30%, #ff006e, transparent 60%); }
  25%  { background: radial-gradient(circle at 80% 30%, #00ffff, transparent 60%); }
  50%  { background: radial-gradient(circle at 50% 70%, #ffbe0b, transparent 60%); }
  75%  { background: radial-gradient(circle at 30% 80%, #8338ec, transparent 60%); }
  100% { background: radial-gradient(circle at 70% 50%, #06d6a0, transparent 60%); }
}

.cel-laser-beam {
  position: absolute;
  top: var(--top);
  width: 240%;
  height: 5px;
  left: -70%;
  background: linear-gradient(90deg, transparent 0%, var(--color) 35%, #fff 50%, var(--color) 65%, transparent 100%);
  filter: blur(1.2px) drop-shadow(0 0 14px var(--color)) drop-shadow(0 0 28px var(--color));
  rotate: var(--angle);
  translate: -120% 0;
  animation: cel-laser-streak var(--dur) ease-out infinite;
  animation-delay: var(--delay);
  z-index: 2;
}
@keyframes cel-laser-streak {
  0%   { translate: -130% 0; opacity: 0; }
  8%   { opacity: 1; }
  50%  { translate: 0% 0; opacity: 1; }
  100% { translate: 130% 0; opacity: 0; }
}

.cel-hero-wrap {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 10;
  pointer-events: none;
  perspective: 800px;
  padding: 20px;
  text-align: center;
}
.cel-hero-stage {
  position: relative;
  width: 0; height: 0;
}
.cel-hero-text {
  color: #fff;
  font-weight: 900;
  font-size: clamp(48px, 14vw, 96px);
  letter-spacing: -0.05em;
  line-height: 0.88;
  text-shadow:
    0 0 16px #fff,
    0 0 36px #ffbe0b,
    0 0 70px #ff006e,
    0 0 110px #8338ec,
    0 6px 24px rgba(0,0,0,0.7);
  animation: cel-hero-mega 5s ease-out;
  white-space: nowrap;
  position: relative;
  z-index: 11;
}
@keyframes cel-hero-mega {
  0%   { transform: scale(0.05) rotateX(-90deg) rotate(-20deg); opacity: 0; }
  4%   { transform: scale(1.6) rotateX(0) rotate(6deg); opacity: 1; }
  8%   { transform: scale(0.88) rotate(-3deg); }
  12%  { transform: scale(1.08) rotate(2deg); }
  16%  { transform: scale(0.96) rotate(-1deg); }
  20%  { transform: scale(1.02) rotate(0); }
  24%  { transform: scale(1) rotate(0); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

.cel-halo {
  position: absolute;
  left: 0; top: 0;
  font-size: 36px;
  filter: drop-shadow(0 0 8px #ffbe0b);
  animation: cel-halo-orbit 4s linear infinite;
}
.cel-halo-1 { animation-delay: 0s; }
.cel-halo-2 { animation-delay: -1s; }
.cel-halo-3 { animation-delay: -2s; }
.cel-halo-4 { animation-delay: -3s; }
@keyframes cel-halo-orbit {
  from { transform: rotate(0deg) translateX(170px) rotate(0deg); }
  to   { transform: rotate(360deg) translateX(170px) rotate(-360deg); }
}

.cel-counter-row {
  margin-top: 24px;
  display: flex; align-items: baseline; gap: 8px;
  color: #fff;
  font-weight: 900;
  text-shadow: 0 0 16px #ffbe0b, 0 0 32px #ff006e, 0 2px 8px rgba(0,0,0,0.7);
  animation: cel-counter-pop 5s ease-out;
}
.cel-counter-num {
  font-size: 44px;
  font-feature-settings: "tnum";
  letter-spacing: -0.02em;
}
.cel-counter-of {
  font-size: 22px;
  opacity: 0.85;
}
@keyframes cel-counter-pop {
  0%, 12% { opacity: 0; transform: translateY(30px) scale(0.6); }
  20%     { opacity: 1; transform: translateY(0) scale(1.15); }
  24%     { opacity: 1; transform: translateY(0) scale(1); }
  100%    { opacity: 1; transform: translateY(0) scale(1); }
}

.cel-subtext {
  margin-top: 12px;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-shadow: 0 0 12px #ffbe0b, 0 0 24px #ff006e, 0 2px 6px rgba(0,0,0,0.6);
  animation: cel-subtext-fade 5s ease-out;
}
@keyframes cel-subtext-fade {
  0%, 16% { opacity: 0; transform: translateY(20px); }
  24%     { opacity: 1; transform: translateY(0); }
  100%    { opacity: 1; transform: translateY(0); }
}

.cel-skip-hint {
  position: absolute;
  left: 50%; bottom: 24px;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  z-index: 100;
  pointer-events: none;
  opacity: 0;
  animation: cel-skip-hint 5s ease-out;
}
@keyframes cel-skip-hint {
  0%, 30% { opacity: 0; }
  50%     { opacity: 0.8; }
  100%    { opacity: 0.5; }
}
```

- [ ] **Step 3: Manual verification — visual check**

1. Reset seen-flag and reload (see Task 3 verification).
2. Trigger crossover. Expected on screen:
   - White flash-bang fading to gold (250 ms).
   - Whole screen shakes briefly at start.
   - 8 laser beams shoot diagonally across.
   - Strobe color washes pulse the background.
   - "ZIEL ERREICHT" text zooms in big with multi-color glow.
   - 4 emojis (💪🔥⚡🏆) orbit around it.
   - Counter row shows "0 / X Reps" (no animation yet).
   - Subtext fades in below.
   - "tap zum Überspringen" hint appears at the bottom.
   - Tap → overlay fades out.
   - After 5 s without tap → fades out automatically.

- [ ] **Step 4: Commit**

```bash
git add www/celebration.jsx www/styles.css
git commit -m "feat(celebration): add fullscreen overlay structure with hero text, lasers, strobe, halo orbit"
```

---

## Task 5: Dynamic JS layers — Counter animation, Shockwaves, Fireworks, Confetti, Giant emojis

**Files:**
- Modify: `www/celebration.jsx` (add `useEffect` block in CelebrationOverlay)
- Modify: `www/styles.css` (append particle CSS)

- [ ] **Step 1: Append particle CSS to styles.css**

Append at the END of `www/styles.css`:

```css
/* === Celebration particle layers === */
.cel-shockwave {
  position: absolute;
  left: 50%; top: 50%;
  width: 40px; height: 40px;
  margin: -20px 0 0 -20px;
  border-radius: 50%;
  border: 4px solid currentColor;
  box-shadow: 0 0 24px currentColor, inset 0 0 24px currentColor;
  z-index: 6;
  pointer-events: none;
  animation: cel-shockwave 1.6s ease-out forwards;
}
@keyframes cel-shockwave {
  0%   { transform: scale(0.1); opacity: 1; border-width: 6px; }
  100% { transform: scale(28); opacity: 0; border-width: 1px; }
}

.cel-firework-trail {
  position: absolute;
  width: 3px;
  background: linear-gradient(180deg, transparent, currentColor);
  z-index: 3;
  transform-origin: bottom center;
  pointer-events: none;
  animation: cel-fw-rise 0.5s ease-out forwards;
}
@keyframes cel-fw-rise {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

.cel-firework-particle {
  position: absolute;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 12px currentColor, 0 0 24px currentColor, 0 0 36px currentColor;
  z-index: 3;
  pointer-events: none;
  animation: cel-fw-explode 2s cubic-bezier(.2,.7,.6,1) forwards;
}
@keyframes cel-fw-explode {
  0%   { transform: translate(0, 0) scale(0.4); opacity: 1; }
  20%  { transform: translate(calc(var(--dx) * 0.5), calc(var(--dy) * 0.5)) scale(1.2); opacity: 1; }
  100% { transform: translate(var(--dx), calc(var(--dy) + 80px)) scale(0.5); opacity: 0; }
}

.cel-confetti {
  position: absolute;
  top: -30px;
  z-index: 4;
  pointer-events: none;
  animation: cel-confetti-fall linear forwards;
}
@keyframes cel-confetti-fall {
  0%   { transform: translateY(-30px) rotate(0deg) rotateY(0deg); }
  100% { transform: translateY(110vh) rotate(1080deg) rotateY(900deg); opacity: 0.6; }
}

.cel-giant-emoji {
  position: absolute;
  top: -80px;
  z-index: 4;
  pointer-events: none;
  filter: drop-shadow(0 0 12px rgba(255,190,11,0.9));
  animation: cel-giant-fall linear forwards;
}
@keyframes cel-giant-fall {
  0%   { transform: translateY(-80px) rotate(0deg) scale(0.4); opacity: 0; }
  10%  { transform: translateY(0) rotate(120deg) scale(1); opacity: 1; }
  100% { transform: translateY(110vh) rotate(900deg) scale(0.9); opacity: 0.8; }
}
```

- [ ] **Step 2: Add particle-spawn + counter animation in celebration.jsx**

Open `www/celebration.jsx`. Inside `CelebrationOverlay`, ABOVE the existing `useEffect` blocks but AFTER the `useState` calls, add this `useEffect`:

```jsx
useEffect(() => {
  const overlay = document.querySelector('.celebration-overlay');
  if (!overlay) return;
  const colors = ['#ff006e','#fb5607','#ffbe0b','#8338ec','#3a86ff','#06d6a0','#ef476f','#ffd60a','#ff00ff','#00ffff','#ff3399','#33ff99','#a855f7'];
  const emojis = ['💪','🔥','⚡','🏆','💯','🚀','⭐','🎉'];
  const intervals = [];
  const timeouts = [];

  function pickColor() { return colors[Math.floor(Math.random() * colors.length)]; }
  function pickEmoji() { return emojis[Math.floor(Math.random() * emojis.length)]; }

  function fireShockwave() {
    const sw = document.createElement('div');
    sw.className = 'cel-shockwave';
    sw.style.color = pickColor();
    overlay.appendChild(sw);
    const t = setTimeout(() => sw.remove(), 1700);
    timeouts.push(t);
  }

  function fireFirework(centerOnly = false) {
    const w = overlay.clientWidth, h = overlay.clientHeight;
    const cx = centerOnly ? w / 2 : 60 + Math.random() * (w - 120);
    const cy = centerOnly ? h / 2 : 60 + Math.random() * (h * 0.55);
    const color = pickColor();

    const trail = document.createElement('div');
    trail.className = 'cel-firework-trail';
    trail.style.color = color;
    trail.style.left = cx + 'px';
    trail.style.top = cy + 'px';
    trail.style.height = (h - cy) + 'px';
    overlay.appendChild(trail);
    const tt = setTimeout(() => trail.remove(), 600);
    timeouts.push(tt);

    const burstT = setTimeout(() => {
      const burstSize = 36 + Math.floor(Math.random() * 24);
      for (let i = 0; i < burstSize; i++) {
        const p = document.createElement('div');
        p.className = 'cel-firework-particle';
        p.style.color = color;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        const angle = (i / burstSize) * Math.PI * 2 + Math.random() * 0.15;
        const speed = 90 + Math.random() * 120;
        p.style.setProperty('--dx', Math.cos(angle) * speed + 'px');
        p.style.setProperty('--dy', Math.sin(angle) * speed + 'px');
        p.style.animationDuration = (1.7 + Math.random() * 0.9) + 's';
        overlay.appendChild(p);
        const rt = setTimeout(() => p.remove(), 2600);
        timeouts.push(rt);
      }
    }, 500);
    timeouts.push(burstT);
  }

  function spawnConfetti() {
    const w = overlay.clientWidth;
    const c = document.createElement('div');
    c.className = 'cel-confetti';
    c.style.left = Math.random() * w + 'px';
    const shape = Math.random();
    if (shape < 0.55) {
      c.style.background = pickColor();
      c.style.width = (5 + Math.random() * 8) + 'px';
      c.style.height = (10 + Math.random() * 14) + 'px';
    } else if (shape < 0.8) {
      c.style.background = pickColor();
      c.style.width = c.style.height = (8 + Math.random() * 7) + 'px';
      c.style.borderRadius = '50%';
    } else {
      c.textContent = pickEmoji();
      c.style.fontSize = '22px';
    }
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    overlay.appendChild(c);
    const t = setTimeout(() => c.remove(), 4500);
    timeouts.push(t);
  }

  function spawnGiantEmoji() {
    const w = overlay.clientWidth;
    const e = document.createElement('div');
    e.className = 'cel-giant-emoji';
    e.textContent = pickEmoji();
    e.style.left = Math.random() * w + 'px';
    e.style.fontSize = (40 + Math.random() * 36) + 'px';
    e.style.animationDuration = (2.5 + Math.random() * 1.5) + 's';
    overlay.appendChild(e);
    const t = setTimeout(() => e.remove(), 4500);
    timeouts.push(t);
  }

  // Initial burst
  setTimeout(fireShockwave, 100);
  setTimeout(fireShockwave, 300);
  setTimeout(fireShockwave, 500);
  setTimeout(() => fireFirework(true), 200);

  intervals.push(setInterval(fireFirework, 350));
  intervals.push(setInterval(spawnConfetti, 50));
  intervals.push(setInterval(spawnGiantEmoji, 400));

  // Counter animation (0 → targetReps, easeOutCubic over 1400 ms starting at 700 ms)
  const counterEl = overlay.querySelector('.cel-counter-num');
  const target = parseInt(counterEl?.dataset.target || '0', 10);
  let rafId;
  const COUNT_DELAY = 700;
  const COUNT_DURATION = 1400;
  const startTime = performance.now();
  function tickCounter() {
    if (!counterEl) return;
    const elapsed = performance.now() - startTime;
    let v;
    if (elapsed < COUNT_DELAY) v = 0;
    else if (elapsed < COUNT_DELAY + COUNT_DURATION) {
      const p = (elapsed - COUNT_DELAY) / COUNT_DURATION;
      const eased = 1 - Math.pow(1 - p, 3);
      v = Math.round(eased * target);
    } else v = target;
    counterEl.textContent = v.toLocaleString('de-DE');
    if (elapsed < COUNT_DELAY + COUNT_DURATION) {
      rafId = requestAnimationFrame(tickCounter);
    }
  }
  rafId = requestAnimationFrame(tickCounter);

  return () => {
    intervals.forEach(clearInterval);
    timeouts.forEach(clearTimeout);
    if (rafId) cancelAnimationFrame(rafId);
  };
}, []);
```

- [ ] **Step 3: Manual verification — full FX visible**

1. Reset seen-flag, trigger crossover.
2. Expected on screen:
   - 3 shockwave rings expand from center within the first 500 ms.
   - Fireworks pop continuously at random spots.
   - Confetti rains from the top (rectangles + circles + emojis).
   - Giant emojis fall slowly.
   - Counter ticks from 0 to target over ~1.4 s with deceleration.
3. Tap the overlay → fade out, no errors in console.

- [ ] **Step 4: Commit**

```bash
git add www/celebration.jsx www/styles.css
git commit -m "feat(celebration): add fireworks, confetti, shockwaves, giant emojis, animated counter"
```

---

## Task 6: Sound playback

**Files:**
- Create: `www/sounds/goal-reached.mp3` (placeholder, see Step 1)
- Modify: `www/celebration.jsx` (play audio on mount)

- [ ] **Step 1: Add a placeholder sound asset**

Until a final royalty-free MP3 is sourced, use a short Web-Audio-API-generated beep as a stand-in. Create `www/sounds/.gitkeep`:

```bash
mkdir -p www/sounds && touch www/sounds/.gitkeep
```

Place a real `goal-reached.mp3` in `www/sounds/` if one is available. Otherwise leave the directory empty — the code in Step 2 falls back gracefully.

- [ ] **Step 2: Add audio playback in CelebrationOverlay**

In `www/celebration.jsx`, inside `CelebrationOverlay`, add a NEW `useEffect` right after the particle-spawn `useEffect` from Task 5:

```jsx
useEffect(() => {
  const audio = new Audio('sounds/goal-reached.mp3');
  audio.volume = 0.85;
  audio.play().catch(() => {
    // Audio asset missing or autoplay blocked — synthesize a fallback beep
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // No-op
    }
  });
  return () => {
    audio.pause();
    audio.currentTime = 0;
  };
}, []);
```

- [ ] **Step 3: Manual verification — audio plays**

1. Unmute the system, ensure browser tab is not muted.
2. Trigger crossover. Expected: a short whoosh/beep at the start of the overlay.
3. If `goal-reached.mp3` is in place, you hear the real sound. Otherwise the synthesized fallback beep plays.

- [ ] **Step 4: Commit**

```bash
git add www/celebration.jsx www/sounds/.gitkeep
git commit -m "feat(celebration): play goal-reached audio with WebAudio fallback beep"
```

---

## Task 7: Haptic feedback (Capacitor Haptics)

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `www/celebration.jsx` (trigger haptic pattern)
- Modify: `www/index.html` (expose Haptics to global window — see Step 2)

- [ ] **Step 1: Install Capacitor Haptics**

From the project root:

```bash
npm install @capacitor/haptics
npx cap sync ios
```

Verify `package.json` now lists `"@capacitor/haptics"` under `dependencies`.

- [ ] **Step 2: Expose Haptics on `window`**

The codebase uses no module system — JSX files run in global scope under Babel-standalone. Capacitor's Haptics ships as an ES module, so we wire it up via a small inline module in `www/index.html` that puts the API on `window`.

Open `www/index.html`. Find the line that loads `data.js`:

```html
<script src="data.js"></script>
```

Add this NEW block directly BELOW the Supabase script tag (around line 19), BEFORE the React tags:

```html
<script type="module">
  // Expose Capacitor Haptics globally for our non-module JSX files.
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@capacitor/haptics@6/+esm');
    window.PTCelebrationHaptics = mod;
  } catch (e) {
    window.PTCelebrationHaptics = null;
  }
</script>
```

> Note: this uses jsDelivr's ESM CDN to mirror the npm package. The native iOS build picks up the same plugin via the npm install + `cap sync` in Step 1; the CDN copy is only for the web preview path. If the user prefers bundling the plugin into the Capacitor app and never hitting CDN, swap to the local `node_modules` path served by the dev server (e.g. via a symlink), but that's a follow-up — the CDN approach works for both web and iOS in our setup because iOS uses the native plugin and the CDN code only runs when the JS is loaded in a browser (the CDN fetch is cached).

- [ ] **Step 3: Trigger haptic pattern in CelebrationOverlay**

In `www/celebration.jsx`, inside `CelebrationOverlay`, add a NEW `useEffect` directly after the audio `useEffect`:

```jsx
useEffect(() => {
  const H = window.PTCelebrationHaptics;
  if (!H) return;
  const safeCall = (fn) => { try { fn(); } catch (e) { /* no-op */ } };
  safeCall(() => H.Haptics.impact({ style: H.ImpactStyle.Heavy }));
  const t1 = setTimeout(() => safeCall(() => H.Haptics.impact({ style: H.ImpactStyle.Heavy })), 60);
  const t2 = setTimeout(() => safeCall(() => H.Haptics.impact({ style: H.ImpactStyle.Heavy })), 120);
  const t3 = setTimeout(() => safeCall(() => H.Haptics.notification({ type: H.NotificationType.Success })), 200);
  return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
}, []);
```

- [ ] **Step 4: Manual verification — on iOS device**

Web browsers don't support haptics. Verify on a real iPhone:

```bash
npx cap copy ios && npx cap open ios
```

Build and run in Xcode on an iPhone (not the simulator — the simulator doesn't produce haptic feedback). Trigger crossover. Expected: 3 heavy bumps in the first 200 ms followed by a success notification pattern.

If you don't have an iOS device handy, verify only that `window.PTCelebrationHaptics` is non-null in DevTools console when running the web version, and that the overlay does not throw.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json www/index.html www/celebration.jsx
git commit -m "feat(celebration): trigger haptic pattern via @capacitor/haptics"
```

---

## Task 8: Persistent style — session roll in app.jsx

**Files:**
- Modify: `www/app.jsx` (roll style on mount)

- [ ] **Step 1: Add a session-storage roll on App mount**

Open `www/app.jsx`. Find the first `useEffect` block inside `function App() {` — it's the one that sets `document.documentElement.dataset.theme`. Directly BEFORE that `useEffect`, add this NEW block:

```jsx
useEffect(() => {
  if (!sessionStorage.getItem('pt_persistent_style_v1')) {
    const styles = ['gold', 'sparkle', 'trophy'];
    const pick = styles[Math.floor(Math.random() * styles.length)];
    sessionStorage.setItem('pt_persistent_style_v1', pick);
  }
}, []);
```

- [ ] **Step 2: Manual verification — style cycles per session**

1. Open the app, open DevTools Console.
2. Run `sessionStorage.getItem('pt_persistent_style_v1')`. Expected: one of `'gold'`, `'sparkle'`, `'trophy'`.
3. Close the tab, open a new tab to the app. Expected: a new random pick.
4. Within the SAME tab: reload (hard reload doesn't clear sessionStorage in many browsers, but a new tab does). The value should persist across hard reloads in the same tab.

- [ ] **Step 3: Commit**

```bash
git add www/app.jsx
git commit -m "feat(celebration): roll persistent celebration style once per session"
```

---

## Task 9: pm-gold persistent style — CSS + apply in screens.jsx

**Files:**
- Modify: `www/styles.css` (append pm-gold rules)
- Modify: `www/screens.jsx` (apply class conditionally to hero-card)

- [ ] **Step 1: Append pm-gold CSS to styles.css**

Append at the END of `www/styles.css`:

```css
/* ============================================================ */
/* Persistent Stolz-Modus — applied to .hero-card when pct>=1   */
/* ============================================================ */

/* Style A: Gold-Glow */
.hero-card.pm-gold {
  background: linear-gradient(180deg, #1c1c1e 0%, #2a2210 100%);
  border: 2px solid #ffbe0b;
  animation: pm-gold-breath 2.6s ease-in-out infinite;
}
@keyframes pm-gold-breath {
  0%, 100% {
    box-shadow: 0 0 18px 0 rgba(255,190,11,0.35), inset 0 0 32px 0 rgba(255,190,11,0.12);
    border-color: #b8860b;
  }
  50% {
    box-shadow: 0 0 32px 4px rgba(255,190,11,0.7), inset 0 0 48px 0 rgba(255,190,11,0.28);
    border-color: #ffd700;
  }
}
.hero-card.pm-gold .progress-bar-fill,
.hero-card.pm-gold .tug-fill {
  background: linear-gradient(90deg, #ffbe0b, #ffd700, #ffbe0b) !important;
  background-size: 200% 100% !important;
  animation: pm-gold-slide 2s linear infinite;
}
@keyframes pm-gold-slide {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.hero-card.pm-gold .ziel-erreicht-status {
  color: #ffd700;
  text-shadow: 0 0 12px rgba(255,215,0,0.6);
}
```

- [ ] **Step 2: Apply pm-* class via getPersistentStyle in screens.jsx**

In `www/screens.jsx`, find the existing line 134:

```jsx
<div key={ch.id} className="challenge-slide"><div className="hero-card">
```

Replace it with:

```jsx
<div key={ch.id} className="challenge-slide"><div className={`hero-card ${celebration.getPersistentStyle(ch) ? 'pm-' + celebration.getPersistentStyle(ch) : ''}`}>
```

- [ ] **Step 3: Manual verification — gold-glow shows when ziel reached**

1. In DevTools console, force the style: `sessionStorage.setItem('pt_persistent_style_v1', 'gold')`, then reload.
2. Ensure at least one challenge has `total >= target_reps`.
3. Expected: the corresponding hero-card has a breathing gold border + gold-shimmer progress bar / tug-of-war fill.

- [ ] **Step 4: Commit**

```bash
git add www/styles.css www/screens.jsx
git commit -m "feat(celebration): add pm-gold persistent style and apply it conditionally"
```

---

## Task 10: pm-sparkle persistent style — CSS + JS particle spawn

**Files:**
- Modify: `www/styles.css` (append pm-sparkle rules)
- Modify: `www/celebration.jsx` (add `<SparkleLayer/>` component)
- Modify: `www/screens.jsx` (render `<SparkleLayer/>` inside sparkle cards)

- [ ] **Step 1: Append pm-sparkle CSS**

Append at the END of `www/styles.css`:

```css
/* Style B: Sparkle-Float */
.hero-card.pm-sparkle {
  background: linear-gradient(135deg, #1c1c1e 0%, #2a1a3e 50%, #1c1c1e 100%);
  position: relative;
  overflow: hidden;
}
.pm-sparkle-stars {
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 0;
}
.pm-sparkle-star {
  position: absolute;
  width: 4px; height: 4px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 0 6px #fff, 0 0 12px #ffbe0b;
  animation: pm-sparkle-drift linear infinite;
  opacity: 0;
}
@keyframes pm-sparkle-drift {
  0%   { transform: translateY(120px) scale(0); opacity: 0; }
  20%  { opacity: 1; transform: translateY(80px) scale(1); }
  80%  { opacity: 1; }
  100% { transform: translateY(-20px) scale(0); opacity: 0; }
}
.hero-card.pm-sparkle > * { position: relative; z-index: 1; }
.hero-card.pm-sparkle .ziel-erreicht-status {
  background: linear-gradient(90deg, #ffbe0b, #ff006e, #ffbe0b);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pm-gold-slide 3s linear infinite;
}
```

- [ ] **Step 2: Add SparkleLayer component in celebration.jsx**

At the END of `www/celebration.jsx`, add a new component:

```jsx
function SparkleLayer({ active }) {
  const { useEffect, useRef } = React;
  const containerRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const intervalId = setInterval(() => {
      // Only spawn while the card is visible (saves CPU when swiped away)
      const rect = container.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (!visible) return;
      const s = document.createElement('div');
      s.className = 'pm-sparkle-star';
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDuration = (3 + Math.random() * 3) + 's';
      container.appendChild(s);
      setTimeout(() => s.remove(), 7000);
    }, 300);
    return () => clearInterval(intervalId);
  }, [active]);

  if (!active) return null;
  return <div className="pm-sparkle-stars" ref={containerRef} />;
}
```

- [ ] **Step 3: Render SparkleLayer inside hero-card in screens.jsx**

In `www/screens.jsx`, find the line modified in Task 9:

```jsx
<div key={ch.id} className="challenge-slide"><div className={`hero-card ${celebration.getPersistentStyle(ch) ? 'pm-' + celebration.getPersistentStyle(ch) : ''}`}>
```

Directly INSIDE the `hero-card` opening div (as the FIRST child), add:

```jsx
<SparkleLayer active={celebration.getPersistentStyle(ch) === 'sparkle'} />
```

The final structure is:
```jsx
<div className={`hero-card ${...}`}>
  <SparkleLayer active={celebration.getPersistentStyle(ch) === 'sparkle'} />
  {/* existing hero-card content */}
</div>
```

- [ ] **Step 4: Manual verification — sparkle drift visible**

1. Force `sessionStorage.setItem('pt_persistent_style_v1', 'sparkle')` and reload.
2. With a completed challenge, expected: purple/dark gradient card with white-gold sparkles drifting upward across the surface (~3 per second).
3. Swipe to a non-completed card and back — sparkles still spawn (we use IntersectionObserver-style viewport check inside the layer, but spawning runs always; the visibility check just skips DOM appendChild when off-screen). Use Performance tab in DevTools to confirm CPU is reasonable.

- [ ] **Step 5: Commit**

```bash
git add www/celebration.jsx www/screens.jsx www/styles.css
git commit -m "feat(celebration): add pm-sparkle style with drifting particles"
```

---

## Task 11: pm-trophy persistent style — full layout swap

**Files:**
- Modify: `www/styles.css` (append pm-trophy rules)
- Modify: `www/screens.jsx` (conditional render of trophy layout)

- [ ] **Step 1: Append pm-trophy CSS**

Append at the END of `www/styles.css`:

```css
/* Style C: Trophy-Takeover */
.hero-card.pm-trophy {
  background: radial-gradient(circle at 50% 0%, #4a3811 0%, #1c1c1e 70%);
}
.pm-trophy-hero {
  text-align: center;
  padding: 12px 0 8px;
}
.pm-trophy-icon {
  font-size: 64px; line-height: 1;
  filter: drop-shadow(0 0 20px #ffbe0b);
  animation: pm-trophy-bob 2.4s ease-in-out infinite;
  display: inline-block;
}
@keyframes pm-trophy-bob {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-6px) rotate(3deg); }
}
.pm-trophy-title {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #ffbe0b, #ffd700, #ff8c00, #ffbe0b);
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: pm-gold-slide 3s linear infinite;
}
.pm-trophy-sub {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  margin-top: 2px;
  font-weight: 600;
}
.pm-trophy-stats {
  margin-top: 14px;
  display: flex;
  justify-content: space-around;
  gap: 12px;
}
.pm-trophy-stat-v {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  font-feature-settings: "tnum";
}
.pm-trophy-stat-l {
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  margin-top: 2px;
}
```

- [ ] **Step 2: Swap middle layout in screens.jsx**

In `www/screens.jsx`, find the block at lines 146–188 (the four conditional layouts: rings, bar, numeric, split-row). The complete CURRENT block reads:

```jsx
            {layout==='rings' && (
              <div className="tug-section">
                <div className="tug-labels">
                  <div className="tug-side benny">
                    <div className="tug-who">Benny</div>
                    <div className="tug-reps mono">{bennyDone}</div>
                    <div className={`tug-foot mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div>
                  </div>
                  <div className="tug-side jonas">
                    <div className="tug-who">Jonas</div>
                    <div className="tug-reps mono">{jonasDone}</div>
                    <div className={`tug-foot mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div>
                  </div>
                </div>
                <div className="tug-bar">
                  <div className="tug-fill benny" style={{width:`${Math.min(100, (bennyDone/ch.target_reps)*100)}%`}}/>
                  <div className="tug-fill jonas" style={{width:`${Math.min(100, (jonasDone/ch.target_reps)*100)}%`}}/>
                  <div className="tug-mid" aria-hidden="true"/>
                  <div className="tug-total mono">
                    <span className="tug-total-now">{total}</span>
                    <span className="tug-total-of"> / {ch.target_reps}</span>
                  </div>
                </div>
              </div>
            )}
            {layout==='bar' && <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:12}}>
                <div className="display mono" style={{fontSize:44,lineHeight:1}}>{pctInt}%</div>
                <div className="subtitle mono">{total} / {ch.target_reps}</div></div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${pct*100}%`}}/></div>
              <div className="subtitle" style={{fontSize:13,fontWeight:500}}>{remaining>0?`Noch ${remaining} Reps`:'🎉 Ziel erreicht!'}</div></>}
            {layout==='numeric' && <div style={{textAlign:'center',marginTop:12}}>
              <div className="big-number mono" style={{fontSize:72}}>{pctInt}%</div>
              <div className="of mono">{total} / {ch.target_reps} Reps</div>
              <div style={{marginTop:8,fontSize:13,color:'var(--text-2)'}}>{remaining>0?`Noch ${remaining}`:'🎉 Ziel erreicht'}</div></div>}
            {layout!=='rings' && <div className="split-row">
              <div className="split-cell benny"><div className="who">Benny</div>
                <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
                <div className={`owe mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div></div>
              <div className="split-cell jonas"><div className="who">Jonas</div>
                <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
                <div className={`owe mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div></div>
            </div>}
```

REPLACE that entire block (lines 146–188) with:

```jsx
            {celebration.getPersistentStyle(ch) === 'trophy' ? (
              <div className="pm-trophy-hero">
                <div className="pm-trophy-icon">🏆</div>
                <div className="pm-trophy-title">ZIEL ERREICHT</div>
                <div className="pm-trophy-sub">{cat?.emoji} {cat?.name} • Diese Woche</div>
                <div className="pm-trophy-stats">
                  <div>
                    <div className="pm-trophy-stat-v">{total.toLocaleString('de-DE')}</div>
                    <div className="pm-trophy-stat-l">Reps</div>
                  </div>
                  <div>
                    <div className="pm-trophy-stat-v">{bennyDone.toLocaleString('de-DE')}</div>
                    <div className="pm-trophy-stat-l">Benny</div>
                  </div>
                  <div>
                    <div className="pm-trophy-stat-v">{jonasDone.toLocaleString('de-DE')}</div>
                    <div className="pm-trophy-stat-l">Jonas</div>
                  </div>
                </div>
              </div>
            ) : (<>
              {layout==='rings' && (
                <div className="tug-section">
                  <div className="tug-labels">
                    <div className="tug-side benny">
                      <div className="tug-who">Benny</div>
                      <div className="tug-reps mono">{bennyDone}</div>
                      <div className={`tug-foot mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div>
                    </div>
                    <div className="tug-side jonas">
                      <div className="tug-who">Jonas</div>
                      <div className="tug-reps mono">{jonasDone}</div>
                      <div className={`tug-foot mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div>
                    </div>
                  </div>
                  <div className="tug-bar">
                    <div className="tug-fill benny" style={{width:`${Math.min(100, (bennyDone/ch.target_reps)*100)}%`}}/>
                    <div className="tug-fill jonas" style={{width:`${Math.min(100, (jonasDone/ch.target_reps)*100)}%`}}/>
                    <div className="tug-mid" aria-hidden="true"/>
                    <div className="tug-total mono">
                      <span className="tug-total-now">{total}</span>
                      <span className="tug-total-of"> / {ch.target_reps}</span>
                    </div>
                  </div>
                </div>
              )}
              {layout==='bar' && <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginTop:12}}>
                  <div className="display mono" style={{fontSize:44,lineHeight:1}}>{pctInt}%</div>
                  <div className="subtitle mono">{total} / {ch.target_reps}</div></div>
                <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${pct*100}%`}}/></div>
                <div className="subtitle" style={{fontSize:13,fontWeight:500}}>{remaining>0?`Noch ${remaining} Reps`:'🎉 Ziel erreicht!'}</div></>}
              {layout==='numeric' && <div style={{textAlign:'center',marginTop:12}}>
                <div className="big-number mono" style={{fontSize:72}}>{pctInt}%</div>
                <div className="of mono">{total} / {ch.target_reps} Reps</div>
                <div style={{marginTop:8,fontSize:13,color:'var(--text-2)'}}>{remaining>0?`Noch ${remaining}`:'🎉 Ziel erreicht'}</div></div>}
              {layout!=='rings' && <div className="split-row">
                <div className="split-cell benny"><div className="who">Benny</div>
                  <div className="v mono">{bennyDone}<span className="owe-of"> / {fairShare}</span></div>
                  <div className={`owe mono ${bennyOwed===0?'done':''}`}>{bennyOwed===0?'✓ erledigt':`noch ${bennyOwed}`}</div></div>
                <div className="split-cell jonas"><div className="who">Jonas</div>
                  <div className="v mono">{jonasDone}<span className="owe-of"> / {fairShare}</span></div>
                  <div className={`owe mono ${jonasOwed===0?'done':''}`}>{jonasOwed===0?'✓ erledigt':`noch ${jonasOwed}`}</div></div>
              </div>}
            </>)}
```

Lines 189–190 (the `+ Satz loggen` button and `<QuickLogRow/>`) stay UNCHANGED and remain visible in trophy mode.

- [ ] **Step 3: Manual verification — trophy layout shows**

1. Force `sessionStorage.setItem('pt_persistent_style_v1', 'trophy')` and reload.
2. With a completed challenge, expected:
   - Hero-card has a dark-amber radial background.
   - Big 🏆 emoji with bob animation.
   - "ZIEL ERREICHT" title with gold gradient text.
   - Sub-line "💪 Klimmzüge • Diese Woche".
   - 3-column stats: Reps total, Benny total, Jonas total.
   - The "+ Satz loggen" button still visible at the bottom of the card.
3. Swipe to a non-completed challenge — it should render normally (rings/bar/numeric per current layout setting).

- [ ] **Step 4: Commit**

```bash
git add www/styles.css www/screens.jsx
git commit -m "feat(celebration): add pm-trophy style with full middle-layout swap"
```

---

## Task 12: Reduced-motion fallback

**Files:**
- Modify: `www/styles.css` (append reduced-motion overrides)

- [ ] **Step 1: Append reduced-motion CSS**

Append at the END of `www/styles.css`:

```css
/* ============================================================ */
/* Reduced motion — strip the most jarring effects              */
/* ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .celebration-overlay {
    animation: none;
  }
  .cel-flashbang,
  .cel-strobe,
  .cel-laser-beam,
  .cel-giant-emoji,
  .cel-shockwave {
    display: none !important;
  }
  .cel-hero-text {
    animation: cel-hero-fade-in 0.5s ease-out forwards !important;
  }
  @keyframes cel-hero-fade-in {
    0%   { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }
  .cel-halo {
    animation-duration: 12s !important;
  }
  .cel-confetti {
    animation-duration: 1.5s !important;
  }
  .hero-card.pm-gold,
  .hero-card.pm-sparkle .pm-sparkle-star,
  .pm-trophy-icon {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Manual verification — reduced motion respected**

1. macOS: System Preferences → Accessibility → Display → "Reduce motion" ON.
2. Reload the app, trigger crossover.
3. Expected:
   - No screen shake.
   - No flash-bang.
   - No strobe.
   - No giant emoji rain.
   - No shockwaves.
   - No fireworks-style laser beams.
   - Hero text fades in calmly.
   - Confetti only briefly (1.5 s instead of 5 s).
   - Sound + haptic still play.
   - Persistent-mode card has no animations.
4. Turn the OS setting OFF, reload, trigger again — full FX returns.

- [ ] **Step 3: Commit**

```bash
git add www/styles.css
git commit -m "feat(celebration): add prefers-reduced-motion fallback that strips jarring effects"
```

---

## Task 13: Final manual test pass

**Files:** none (verification only)

- [ ] **Step 1: Run through the spec's Test-Plan**

Open `docs/superpowers/specs/2026-05-11-wochenziel-celebration-design.md` and execute the 12-point Test-Plan from the "Test-Plan" section. For each item, write PASS/FAIL plus notes in a scratch file. Tests cover:

1. Trigger detection (99% → +1 rep → fires).
2. Persistent-mode random rotation across sessions.
3. Seen-flag stops repeat fire.
4. Multi-user — Avatar-Switch picks up the unseen show.
5. Multiple ungesehene Crossovers — sequenzielle Wiedergabe.
6. Skip via tap.
7. Edge: Unlogging unter target → persistent disappears, no re-fire on re-cross.
8. Edge: Target erhöht → persistent disappears.
9. Reduced-motion override.
10. iOS Hardware-Mute → no audio, show runs.
11. Haptic on real iPhone (3 heavy + 1 success).
12. Performance ≥30 fps on mid-old iPhone (DevTools / iOS web inspector).

- [ ] **Step 2: Fix any failures inline**

For each FAIL, identify the cause and fix in a new commit with a clear message. If the fix is large, return to writing-plans skill for a follow-up plan.

- [ ] **Step 3: Final commit / push**

If everything passes:

```bash
git log --oneline | head -20    # sanity check the history
git push origin HEAD             # if a remote is set up
```

The feature is shippable.

---

## Risk Log

- **Sound asset:** The user must source a real royalty-free MP3 for `www/sounds/goal-reached.mp3`. Until then, the synthesized fallback beep plays. This is documented in Task 6.
- **iOS Performance:** The DOM-particle approach may struggle on iPhone 8 / older. If frames drop below 30 fps in Task 13.12, migrate to `canvas-confetti` (~3 KB) in a follow-up plan.
- **Haptics on Web:** The `window.PTCelebrationHaptics` import will work in iOS-Capacitor (Capacitor's bridge picks up the native plugin via `npm install`); the CDN-imported web version is mostly a no-op in browser since web haptics is unsupported. This is acceptable per the spec — haptic is a bonus, not a hard requirement.
- **Babel-standalone:** All JSX runs through in-browser Babel. New files MUST use `<script type="text/babel">` in `index.html` and global-scoped names. Module syntax is NOT supported in the JSX files (only in the inline ES module block in Task 7).
