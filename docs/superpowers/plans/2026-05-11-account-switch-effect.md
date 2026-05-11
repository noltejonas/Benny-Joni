# Account-Switch Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a premium multi-sensory effect (3D coin-flip + radial color-wave overlay + haptic + synthesized sound) when tapping the top-right avatar button to switch between Benny and Jonas.

**Architecture:** A new file `www/account-switch.jsx` exposes a global `useAccountSwitch` hook. The hook owns the animation lifecycle, mounts a portal overlay on `document.body` for the color-wave, fires Capacitor haptics with a `navigator.vibrate` fallback, and synthesizes sound via the Web Audio API (no asset files). The Tweak-controlled `--accent` CSS variable is NEVER mutated; the wave is purely a transient overlay.

**Tech Stack:** React 18 (CDN), Babel-in-browser (`type="text/babel"`), CSS animations, Web Audio API, Capacitor 8 + `@capacitor/haptics` plugin (new dependency).

**Testing note:** This project has no test infrastructure (Jest/Vitest are not set up; `npm test` exits with an error). Babel-in-browser means there's no build step to instrument either. All verification is **manual** — performed in the iOS Simulator (or Safari for browser-only checks) with the steps spelled out in each task. The plan therefore replaces TDD with explicit manual verification checkpoints; treat them as binding.

**Reference spec:** `docs/superpowers/specs/2026-05-11-account-switch-effect-design.md`

---

## File Structure

| Path                                            | Status   | Responsibility                                                                 |
|-------------------------------------------------|----------|---------------------------------------------------------------------------------|
| `package.json`                                  | modify   | Add `@capacitor/haptics` dependency.                                            |
| `www/styles.css`                                | modify   | Append a self-contained `/* === Account Switch === */` section.                 |
| `www/account-switch.jsx`                        | create   | The `useAccountSwitch` hook + helpers (audio synth, haptic, overlay, color resolution). Exposed on `window` for use by `app.jsx`. |
| `www/index.html`                                | modify   | Load `account-switch.jsx` before `app.jsx`.                                     |
| `www/app.jsx`                                   | modify   | Wire the avatar button to the trigger function.                                 |
| `ios/App/Podfile.lock` + `ios/App/App/capacitor.config.json` | auto | Updated by `npx cap sync ios`.                                          |

`account-switch.jsx` is intentionally small and self-contained (target: <150 LOC). Splitting it further would just add indirection — keep it together.

---

## Task 1: Install `@capacitor/haptics` and sync iOS

**Files:**
- Modify: `package.json` (auto, via npm)
- Modify: `package-lock.json` (auto)
- Modify: `ios/App/Podfile.lock` (auto, via cap sync)

- [ ] **Step 1: Install the package**

Run from the project root:

```bash
cd /Users/jonasnolte/Desktop/terminator-ios && npm install @capacitor/haptics@^8.0.0
```

Expected: package added to `package.json` `dependencies`, no errors.

- [ ] **Step 2: Verify installation**

```bash
cat /Users/jonasnolte/Desktop/terminator-ios/package.json | grep haptics
```

Expected output: a line like `"@capacitor/haptics": "^8.0.0"`.

- [ ] **Step 3: Sync iOS pods**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios && npx cap sync ios
```

Expected: output includes `✔ Updating iOS plugins` and `CapacitorHaptics` appears in the plugin list. No errors.

- [ ] **Step 4: Verify Capacitor sees the plugin**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios && grep -i haptics ios/App/Podfile
```

Expected: a line like `pod 'CapacitorHaptics', :path => '../../node_modules/@capacitor/haptics'`.

- [ ] **Step 5: Commit**

This project is not a git repo (`git status` returns "fatal: not a git repository"). Skip the commit step — there is no version control. If a git repo gets initialized later, batch the commit then.

---

## Task 2: Add CSS for the avatar flip + wave overlay + reduced-motion fallback

**Files:**
- Modify: `www/styles.css` (append a new section after line ~109, immediately after the existing `.avatar-btn` block)

- [ ] **Step 1: Append the Account Switch CSS section**

Open `www/styles.css` and add the following section at the END of the file. (Appending is fine — CSS is not order-sensitive for these selectors.)

```css

/* === Account Switch === */
/* Avatar 3D coin-flip. backface-visibility:hidden makes the button invisible
   between rotateY 90deg and 270deg, hiding the mid-flip class swap. */
.avatar-btn {
  /* Add to existing rule via cascade — original .avatar-btn already exists earlier in file */
  transform-style: preserve-3d;
  backface-visibility: hidden;
  transition: box-shadow 200ms ease;
}
.avatar-btn.switching {
  animation: account-switch-flip 700ms cubic-bezier(0.65, 0, 0.35, 1);
}
@keyframes account-switch-flip {
  0%   { transform: rotateY(0deg)   scale(1);   box-shadow: 0 0 0 0 var(--switch-glow, transparent); }
  25%  { transform: rotateY(90deg)  scale(1.3); box-shadow: 0 0 16px 3px var(--switch-glow, transparent); }
  50%  { transform: rotateY(180deg) scale(1.4); box-shadow: 0 0 20px 4px var(--switch-glow, transparent); }
  75%  { transform: rotateY(270deg) scale(1.3); box-shadow: 0 0 16px 3px var(--switch-glow, transparent); }
  100% { transform: rotateY(360deg) scale(1);   box-shadow: 0 0 0 0 var(--switch-glow, transparent); }
}

/* Radial color-wave overlay, mounted on body via JS. */
.account-switch-wave {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: var(--wave-color, transparent);
  clip-path: circle(0% at var(--wave-x, 50%) var(--wave-y, 50%));
  animation: account-switch-wave 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: 100ms;
}
@keyframes account-switch-wave {
  to {
    clip-path: circle(150% at var(--wave-x, 50%) var(--wave-y, 50%));
    opacity: 0;
  }
}

/* Reduced motion: replace flip with a soft crossfade, skip the wave entirely
   (wave is also skipped in JS via matchMedia, this is belt-and-suspenders). */
@media (prefers-reduced-motion: reduce) {
  .avatar-btn.switching {
    animation: account-switch-fade 200ms ease-in-out;
  }
  @keyframes account-switch-fade {
    0%   { opacity: 1; }
    50%  { opacity: 0.3; }
    100% { opacity: 1; }
  }
  .account-switch-wave {
    display: none;
  }
}
```

- [ ] **Step 2: Resolve the duplicate `.avatar-btn` selector**

The append above declares `.avatar-btn { transform-style: ...; backface-visibility: ...; transition: ...; }` but `.avatar-btn` is also declared earlier in the file (around line 97). CSS handles duplicates by merging via the cascade — the new properties are additive. Verify the original rule (around line 97-107) still exists and has not been touched. No edits to the original `.avatar-btn` rule are needed.

Run:
```bash
grep -n "^\.avatar-btn" /Users/jonasnolte/Desktop/terminator-ios/www/styles.css
```

Expected: two lines — one at the original location (~97), one in the new section.

- [ ] **Step 3: Verify CSS parses (no syntax errors)**

Open `www/index.html` in a browser (or the iOS simulator) and confirm the page renders. Open DevTools → Console. There should be no CSS parse errors. The avatar button should look identical to before (the new properties only take effect when `.switching` is added).

If there's no easy way to open DevTools yet, defer this verification to Task 6's manual smoke test.

- [ ] **Step 4: Commit**

Skip — no git repo (see Task 1 Step 5).

---

## Task 3: Create `www/account-switch.jsx` with the hook, audio synth, haptic, and overlay logic

**Files:**
- Create: `www/account-switch.jsx`

- [ ] **Step 1: Create the file with full contents**

Create `www/account-switch.jsx` with EXACTLY these contents:

```jsx
/* global React */
/* Exposes window.useAccountSwitch — a hook for the avatar-button account swap effect.
   Spec: docs/superpowers/specs/2026-05-11-account-switch-effect-design.md */
(function () {
  const { useState, useRef, useCallback } = React;

  // ─── Audio: lazy AudioContext ─────────────────────────────────────────────
  let _audioCtx = null;
  function getAudioCtx() {
    if (_audioCtx) return _audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { _audioCtx = new AC(); } catch { return null; }
    return _audioCtx;
  }

  function playSwitchSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Safari iOS requires resume() inside the gesture handler.
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
    const now = ctx.currentTime;

    // Whoosh: white-noise burst through bandpass 800Hz → 200Hz over 400ms.
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(800, now);
    bp.frequency.exponentialRampToValueAtTime(200, now + 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(0.08, now + 0.1);
    ng.gain.linearRampToValueAtTime(0, now + 0.4);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.4);

    // Pop at t=350ms: sine 440Hz → 220Hz exponential over 80ms.
    const popStart = now + 0.35;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, popStart);
    osc.frequency.exponentialRampToValueAtTime(220, popStart + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, popStart);
    og.gain.linearRampToValueAtTime(0.15, popStart + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, popStart + 0.08);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(popStart);
    osc.stop(popStart + 0.1);
  }

  // ─── Haptics: Capacitor plugin with vibrate fallback ──────────────────────
  async function haptic(style /* 'Light' | 'Medium' */) {
    try {
      const cap = window.Capacitor;
      if (cap && cap.Plugins && cap.Plugins.Haptics) {
        await cap.Plugins.Haptics.impact({ style });
        return;
      }
    } catch {}
    if (navigator.vibrate) {
      try { navigator.vibrate(style === 'Light' ? 10 : 25); } catch {}
    }
  }

  // ─── Color resolution: read user identity color from CSS vars ─────────────
  function resolveUserColor(user) {
    const cssVar = user === 'Jonas' ? '--accent-3' : '--accent';
    const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    return parseColorToRgb(raw) || { r: 50, g: 215, b: 75 }; // green fallback
  }

  // Accepts #rgb, #rrggbb, or rgb(r,g,b). Returns {r,g,b} or null.
  function parseColorToRgb(s) {
    if (!s) return null;
    s = s.trim();
    if (s.startsWith('#')) {
      let hex = s.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length !== 6) return null;
      const n = parseInt(hex, 16);
      if (Number.isNaN(n)) return null;
      return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
    }
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return null;
  }

  // ─── Wave overlay mount/unmount ───────────────────────────────────────────
  function mountWave(buttonEl, newUser) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return null; // CSS also hides it, but no point creating the node
    const rect = buttonEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const { r, g, b } = resolveUserColor(newUser);

    const el = document.createElement('div');
    el.className = 'account-switch-wave';
    el.style.setProperty('--wave-x', cx + 'px');
    el.style.setProperty('--wave-y', cy + 'px');
    el.style.setProperty('--wave-color', `rgba(${r}, ${g}, ${b}, 0.22)`);
    document.body.appendChild(el);

    const cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('animationend', cleanup, { once: true });
    // Safety net: hard timeout in case animationend never fires (e.g., tab backgrounded).
    setTimeout(cleanup, 1200);
    return el;
  }

  function setGlow(buttonEl, newUser) {
    const { r, g, b } = resolveUserColor(newUser);
    buttonEl.style.setProperty('--switch-glow', `rgba(${r}, ${g}, ${b}, 0.85)`);
    // Clean up after animation so the glow var doesn't leak into other states.
    setTimeout(() => buttonEl.style.removeProperty('--switch-glow'), 800);
  }

  // ─── The hook ─────────────────────────────────────────────────────────────
  function useAccountSwitch() {
    const [switching, setSwitching] = useState(false);
    const lockRef = useRef(false);

    const triggerSwitch = useCallback((otherUser, buttonEl, setMe) => {
      if (lockRef.current) return;
      if (!buttonEl) { setMe(otherUser); return; } // graceful skip if no element
      lockRef.current = true;
      setSwitching(true);

      // t=0: glow + flip class + wave + light haptic + sound
      setGlow(buttonEl, otherUser);
      buttonEl.classList.add('switching');
      mountWave(buttonEl, otherUser);
      haptic('Light');
      playSwitchSound();

      // t=350ms: medium haptic + actual state swap (hidden behind backface)
      setTimeout(() => {
        haptic('Medium');
        setMe(otherUser);
      }, 350);

      // t=700ms: cleanup
      setTimeout(() => {
        buttonEl.classList.remove('switching');
        setSwitching(false);
        lockRef.current = false;
      }, 700);
    }, []);

    return { switching, triggerSwitch };
  }

  window.useAccountSwitch = useAccountSwitch;
})();
```

- [ ] **Step 2: Verify syntax via Babel**

The browser's Babel will parse the file at load time. To pre-flight verify, do a quick syntax check by opening the file in your editor (lint/highlight should be clean). If you have Node available, run:

```bash
cd /Users/jonasnolte/Desktop/terminator-ios && node --check www/account-switch.jsx 2>&1 || echo "Note: node --check rejects JSX, that's OK; only fail on parse errors not related to JSX angle brackets"
```

This file uses NO JSX (it's all plain JS inside a IIFE that closes over React). So `node --check` should pass cleanly with no output. If it reports a syntax error, fix it before continuing.

- [ ] **Step 3: Commit**

Skip — no git repo.

---

## Task 4: Wire `account-switch.jsx` into `index.html`

**Files:**
- Modify: `www/index.html` (insert a `<script>` tag before the `app.jsx` script)

- [ ] **Step 1: Add the script tag**

Edit `www/index.html`. Find the line:

```html
  <!-- App -->
  <script type="text/babel" src="app.jsx"></script>
```

Replace with:

```html
  <!-- Account switch effect (must load before app.jsx so window.useAccountSwitch is defined) -->
  <script type="text/babel" src="account-switch.jsx"></script>

  <!-- App -->
  <script type="text/babel" src="app.jsx"></script>
```

- [ ] **Step 2: Verify the tag is in the correct order**

```bash
grep -n "type=\"text/babel\"" /Users/jonasnolte/Desktop/terminator-ios/www/index.html
```

Expected output (order matters): tweaks-panel.jsx, components.jsx, screens.jsx, settings.jsx, **account-switch.jsx**, app.jsx.

- [ ] **Step 3: Commit**

Skip — no git repo.

---

## Task 5: Wire the trigger into the avatar button in `app.jsx`

**Files:**
- Modify: `www/app.jsx` (line 168 area, and the function header around line 15)

- [ ] **Step 1: Call the hook inside the App component**

In `www/app.jsx`, find the line near the top of `App()`:

```jsx
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
```

Immediately after this line, add the hook call:

```jsx
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { switching, triggerSwitch } = window.useAccountSwitch();
```

- [ ] **Step 2: Update the avatar button JSX**

In `www/app.jsx`, find the existing avatar button (currently around line 168):

```jsx
          <button className={`avatar-btn ${me.toLowerCase()}`} onClick={() => setMe(other)} title="Benutzer wechseln">
            {me[0]}
          </button>
```

Replace with:

```jsx
          <button
            className={`avatar-btn ${me.toLowerCase()}${switching ? ' switching' : ''}`}
            onClick={(e) => triggerSwitch(other, e.currentTarget, setMe)}
            disabled={switching}
            title="Benutzer wechseln">
            {me[0]}
          </button>
```

Notes:
- We keep `me.toLowerCase()` (NOT `other.toLowerCase()`) — the class change happens at t=350ms when React re-renders after `setMe(other)` fires inside the trigger. Until then the button correctly shows the old user's color.
- The `${switching ? ' switching' : ''}` part is critical. The hook also imperatively calls `buttonEl.classList.add('switching')`, but at t=350ms when `setMe(other)` causes React to re-render, React would overwrite the entire `className` attribute. Including `switching` in the React-managed className keeps it on the element across that re-render, so the 700ms animation isn't cut short at the midpoint.

- [ ] **Step 3: Verify the file's other references to `setMe` are untouched**

The other `setMe` callers (the name-picker tiles at lines 139 and 143) should remain `onClick={() => setMe('Benny')}` and `onClick={() => setMe('Jonas')}` — those are the initial picker, no animation needed.

```bash
grep -n "setMe" /Users/jonasnolte/Desktop/terminator-ios/www/app.jsx
```

Expected: 4 references — 2 picker tiles, 1 useState, 1 inside the new triggerSwitch call.

- [ ] **Step 4: Commit**

Skip — no git repo.

---

## Task 6: Manual verification in iOS Simulator (and browser)

**Files:** none modified — this is a verification gate.

- [ ] **Step 1: Run the app in iOS Simulator**

```bash
cd /Users/jonasnolte/Desktop/terminator-ios && npx cap sync ios && npx cap open ios
```

Then in Xcode, select an iPhone simulator and press the Run button (⌘R). Wait for the app to launch.

Alternative for quick browser-only check (no haptics): open `www/index.html` in Safari directly (file://) or serve with `python3 -m http.server 8080` from the `www/` directory and visit `http://localhost:8080`.

- [ ] **Step 2: Smoke test — Golden path**

Pick a user from the name-picker (e.g., Benny). You should land on the home screen with a green avatar in the top right.

Tap the green avatar. Verify in order:
- The avatar performs a 3D coin-flip (full 360° rotation over ~700ms).
- A colored ripple (blue/orange — Jonas's color) expands radially from the avatar across the screen and fades out.
- A haptic tap is felt (on a real device — the simulator does not produce haptics, this is expected and is NOT a bug).
- A soft whoosh+pop sound is heard (volume ~30% — quiet but audible).
- After the animation, the avatar shows `J` in Jonas's color, the greeting updates to "…, Jonas".

Tap again. The reverse should happen, ending at Benny (green).

- [ ] **Step 3: Verify the animation hides the mid-flip class swap**

Tap the avatar and watch carefully. The color/letter swap should not be visible — the button should appear smoothly transition from B-green to J-blue (or vice versa) without any flash of the wrong color or upside-down letter. If you can SEE the swap, the timing is off (the swap should land at t=350ms when the button is edge-on/back-facing).

- [ ] **Step 4: Stress test — rapid tap protection**

Tap the avatar 10 times in quick succession (faster than 700ms per tap). Verify:
- The animation plays once per cycle, no overlapping animations.
- The user state alternates one-per-cycle, not faster.
- No DOM leaks: in Safari Web Inspector (Develop menu → Simulator → app), inspect the body. Count `.account-switch-wave` elements after the storm ends. Expected: **zero** (all unmounted via animationend or the 1200ms safety timeout).

- [ ] **Step 5: Verify Tweak-accent is NOT mutated**

Open the Settings/Tweaks panel (gear icon) and change the accent color to something custom (e.g., red). Close the tweaks. Tap the avatar to switch users.
- Benny's avatar should now be red (because Benny uses `--accent`).
- Jonas's avatar should still be its `--accent-3` color (unchanged by the tweak).
- The wave when switching to Benny should be red (correctly reading the live `--accent`).
- The wave when switching to Jonas should be `--accent-3`-colored.
- After the switch, the Tweak-accent is still red — it was NOT overwritten.

- [ ] **Step 6: Reduced-motion check**

In the iOS Simulator: Settings → Accessibility → Motion → Reduce Motion → ON. Return to the app. Tap the avatar.
- The flip animation should be replaced by a soft 200ms opacity fade.
- The radial wave should NOT appear at all.
- Haptic and sound should still fire.

Turn Reduce Motion back OFF when done.

- [ ] **Step 7: Browser-only check (Web Audio in Safari)**

iOS Safari requires user gesture to start AudioContext. The first avatar tap IS the gesture — so sound should work on first tap. Verify on a real device (not simulator — simulator audio is often muted by default).

- [ ] **Step 8: Console error scan**

In Safari Web Inspector → Console, do a full app-usage pass (load app, pick user, tap avatar twice, open tweaks, change accent, tap avatar again). Expected: **zero red errors**. Yellow warnings are OK if they're pre-existing.

- [ ] **Step 9: Commit**

Skip — no git repo.

---

## Self-Review

**Spec coverage check:**

| Spec section                       | Implementing task(s)                                  |
|------------------------------------|-------------------------------------------------------|
| Sequence (700ms timing)            | Task 2 (CSS keyframes), Task 3 (setTimeout schedule)  |
| Avatar-Morph (3D flip)             | Task 2 (CSS), Task 3 (`switching` class toggle)       |
| Color-Wave (decorative, no accent mutation) | Task 2 (CSS), Task 3 (`mountWave`, resolved colors) |
| Haptics (Light @ 0, Medium @ 350)  | Task 3 (`haptic` calls in `triggerSwitch`)            |
| Sound (Whoosh + Pop, Web Audio)    | Task 3 (`playSwitchSound`)                            |
| Reduced motion                     | Task 2 (`@media` block), Task 3 (`mountWave` early return) |
| Error handling (plugin missing, audio blocked, double-tap, unmount) | Task 3 (try/catch on haptic, null-check on audio, `lockRef`, `setTimeout` safety net) |
| @capacitor/haptics dependency      | Task 1                                                |
| index.html script order            | Task 4                                                |
| `app.jsx` wiring                   | Task 5                                                |
| Manual smoke test (5-point list from spec) | Task 6 steps 2–6                                |

All spec items covered.

**Type / name consistency check:**
- `useAccountSwitch` exposed on `window` in Task 3, called in Task 5 — match ✔
- `triggerSwitch(otherUser, buttonEl, setMe)` signature in Task 3 — called with `triggerSwitch(other, e.currentTarget, setMe)` in Task 5 — match ✔
- `--switch-glow`, `--wave-x`, `--wave-y`, `--wave-color` CSS custom properties — declared in Task 2 CSS, set via JS in Task 3 — match ✔
- `.avatar-btn.switching` class — referenced in Task 2 CSS, added/removed in Task 3 — match ✔
- `.account-switch-wave` class — declared in Task 2 CSS, applied in Task 3 — match ✔

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N" placeholders. All code blocks are complete and pastable.

**Scope check:** Single focused feature, single component touched, ~3 files modified + 1 file created. No need to split.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-11-account-switch-effect.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
