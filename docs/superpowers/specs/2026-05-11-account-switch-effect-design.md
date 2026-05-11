# Account-Switch Spectacle — Design

**Date:** 2026-05-11
**Scope:** Visual + haptic + audio effect when tapping the avatar button (top-right) to switch between Benny and Jonas.

## Goal

Replace the silent, instant `setMe(other)` toggle with a high-quality multi-sensory effect that feels premium and confirms the account switch unambiguously.

## User Decisions (from brainstorming)

- **Direction:** Avatar-Morph (A) + decorative Color-Wave (B)
- **Feedback:** Visual + Haptic + Sound (Tier 3)
- **Color-Wave is decorative** — the user's Tweak-controlled `--accent` is NOT overwritten. The wave is a transient overlay; the app's accent color stays under the user's control via the Tweaks panel.
- **Sound:** synthesized via Web Audio API (no asset file).

## Architecture

### New file: `www/account-switch.jsx`
Exports a single hook `useAccountSwitch()` that returns `triggerSwitch(otherUser, buttonEl, setMe)`.

The hook owns:
- The animation lifecycle (lock, sequence, unlock).
- Portal-mounted overlay element for the color-wave (mounted on `document.body` so it's not clipped by ancestor `overflow:hidden`).
- Haptic invocation (Capacitor plugin with browser `vibrate` fallback).
- Sound synthesis via Web Audio API.

### Modified: `www/app.jsx`
Avatar button changes from:
```jsx
<button className={`avatar-btn ${me.toLowerCase()}`} onClick={() => setMe(other)} ...>
```
to:
```jsx
<button className={`avatar-btn ${me.toLowerCase()} ${switching ? 'switching' : ''}`}
        onClick={(e) => triggerSwitch(other, e.currentTarget, setMe)}
        disabled={switching} ...>
```

### Modified: `www/styles.css`
New section `/* === Account Switch === */` with:
- `.avatar-btn.switching` — applies the 3D flip animation
- `.account-switch-wave` — the radial color-wave overlay
- `@keyframes` for both
- `@media (prefers-reduced-motion: reduce)` overrides

### New dependency: `@capacitor/haptics`
Install via `npm i @capacitor/haptics` and run `npx cap sync ios`. If the plugin import fails (web context, plugin missing), code falls back gracefully.

## Sequence (Total: 700ms)

The avatar uses a full 360° spin with `backface-visibility: hidden`, so the button is visually invisible between rotateY(90°) and rotateY(270°). The class-swap (Benny↔Jonas color/initial) happens at the midpoint (t=350ms, rotateY 180°) when the backface is facing the camera — completely hidden from the user.

| t (ms) | rotateY | scale | Visible?       | Wave overlay                                | Haptik              | Sound          | App state                              |
|-------:|--------:|------:|----------------|----------------------------------------------|---------------------|----------------|----------------------------------------|
| 0      | 0°      | 1.0   | yes (old)      | mounted, clip-path: circle(0% at btn-center) | ImpactStyle.Light   | Whoosh starts  | `switching=true`                       |
| 100    | ~36°    | ~1.1  | yes            | starts expanding (animation-delay: 100ms)    | —                   | —              | —                                      |
| 175    | 90°     | 1.3   | edge-on        | ~15% radius                                  | —                   | —              | —                                      |
| 350    | 180°    | 1.4   | no (backface)  | ~55% radius                                  | ImpactStyle.Medium  | Pop transient  | **`setMe(other)` fires**, class swap   |
| 525    | 270°    | 1.3   | edge-on        | ~90% radius                                  | —                   | —              | —                                      |
| 700    | 360°(=0°)| 1.0  | yes (new)      | clip-path: circle(150%), overlay removed     | —                   | sound ends     | `switching=false`                      |

Timing chosen so the class-swap (`setMe(other)`) is hidden behind the backface — the user never sees an unstyled or mid-transition state. The audible pop and medium haptic land at the exact same moment as the swap, making it feel like one discrete event.

## Avatar-Morph Details

CSS animation `account-switch-flip` runs 700ms with `cubic-bezier(0.65, 0, 0.35, 1)`:

```css
@keyframes account-switch-flip {
  0%   { transform: rotateY(0deg)   scale(1);   box-shadow: 0 0 0 0 var(--switch-glow); }
  25%  { transform: rotateY(90deg)  scale(1.3); box-shadow: 0 0 16px 3px var(--switch-glow); }
  50%  { transform: rotateY(180deg) scale(1.4); box-shadow: 0 0 20px 4px var(--switch-glow); }
  75%  { transform: rotateY(270deg) scale(1.3); box-shadow: 0 0 16px 3px var(--switch-glow); }
  100% { transform: rotateY(360deg) scale(1);   box-shadow: 0 0 0 0 var(--switch-glow); }
}
.avatar-btn.switching {
  animation: account-switch-flip 700ms cubic-bezier(0.65, 0, 0.35, 1);
  transform-style: preserve-3d;
  backface-visibility: hidden;
}
```

`--switch-glow` is set as an inline style on the button at trigger time, e.g. `buttonEl.style.setProperty('--switch-glow', otherUserColor)`. The value is the new user's identity color (resolved via `getComputedStyle(document.documentElement).getPropertyValue('--accent')` for Benny, `--accent-3` for Jonas).

The button keeps its existing `.benny` / `.jonas` background-color classes. Because `setMe(other)` fires at t=350ms (rotateY 180°) when the backface is facing the camera and `backface-visibility: hidden` makes the button invisible, the class swap is completely hidden from view.

## Color-Wave Details

Overlay element appended to `document.body` at trigger time. Positioned `fixed`, full viewport, `pointer-events: none`, `z-index: 9999`.

At trigger time, the JS code:
1. Reads the button center via `buttonEl.getBoundingClientRect()` → `cx`, `cy` (pixels from viewport top-left).
2. Resolves the new user's color via `getComputedStyle(document.documentElement).getPropertyValue('--accent')` (for Benny) or `--accent-3` (for Jonas), and parses it to `r,g,b` triplets (e.g. `#32d74b` → `50, 215, 75`).
3. Sets three CSS custom properties on the overlay element:
   - `--wave-x: <cx>px`
   - `--wave-y: <cy>px`
   - `--wave-color: rgba(<r>, <g>, <b>, 0.22)` — semi-transparent so UI stays readable

```css
.account-switch-wave {
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: var(--wave-color);
  clip-path: circle(0% at var(--wave-x) var(--wave-y));
  animation: account-switch-wave 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: 100ms; /* starts 100ms after flip begins */
}
@keyframes account-switch-wave {
  to { clip-path: circle(150% at var(--wave-x) var(--wave-y)); opacity: 0; }
}
```

After the animation completes (`animationend` event), the overlay is removed from the DOM.

**Important:** Tweak-controlled `--accent` on `:root` is NOT mutated. The wave reads colors at trigger time and applies them only to the transient overlay's `--wave-color`. The Tweaks panel remains the sole owner of `--accent`.

## Haptics

```js
async function haptic(style) {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle[style] });
  } catch {
    if (navigator.vibrate) navigator.vibrate(style === 'Light' ? 10 : 25);
  }
}
```

Called at t=0 (`Light`) and t=350 (`Medium`).

## Sound (Web Audio API)

Single AudioContext lazily created on first switch. Two scheduled oscillators:

- **Whoosh (t=0 to t=400ms):** white-noise burst through a bandpass filter sweeping from 800Hz → 200Hz, gain ramping 0 → 0.08 → 0 (very soft).
- **Pop (t=350ms, 80ms duration):** sine oscillator at 440Hz with exponential pitch drop to 220Hz, gain envelope 0 → 0.15 → 0.

Both played at master gain `0.3`. No external assets.

```js
function playSwitchSound(ctx) {
  const now = ctx.currentTime;
  // Whoosh: noise + bandpass
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(800, now);
  bp.frequency.exponentialRampToValueAtTime(200, now + 0.4);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, now);
  ng.gain.linearRampToValueAtTime(0.08, now + 0.1);
  ng.gain.linearRampToValueAtTime(0, now + 0.4);
  noise.connect(bp).connect(ng).connect(ctx.destination);
  noise.start(now);

  // Pop at t=0.35
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(440, now + 0.35);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.43);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, now + 0.35);
  og.gain.linearRampToValueAtTime(0.15, now + 0.36);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.43);
  osc.connect(og).connect(ctx.destination);
  osc.start(now + 0.35); osc.stop(now + 0.45);
}
```

AudioContext is created on first user gesture (the tap itself), avoiding autoplay restrictions.

## Reduced Motion

`@media (prefers-reduced-motion: reduce)`:
- `.avatar-btn.switching` animation → 150ms opacity crossfade instead of 3D flip
- `.account-switch-wave` → not mounted at all (skip in JS via `matchMedia` check)
- Haptik and sound remain active (non-visual, no motion-sickness concern)

## Error Handling

Boundaries where things can fail:
- **Capacitor plugin missing** → fall back to `navigator.vibrate`, then silent.
- **AudioContext blocked** (Safari, no user gesture yet) → swallow error, no sound, continue with visual + haptic.
- **Double-tap during animation** → button has `disabled={switching}`; ignored.
- **Component unmount during animation** → wave overlay cleanup uses a stored DOM ref + null-check on `animationend`.

The visual flip MUST run even if everything else fails — the user must see something happen on tap.

## Testing

Manual smoke test in iOS simulator + browser:
1. Tap avatar → flip plays, wave expands, account switches, haptic fires (device only), sound plays.
2. Tap during animation → no effect, no double-trigger.
3. Toggle `prefers-reduced-motion` in macOS → flip becomes fade, no wave.
4. Tap avatar with Tweaks-accent changed to a custom color → wave still uses the user's identity color (Benny=green / Jonas=accent-3), Tweak `--accent` remains unchanged after switch.
5. Tap 20× rapidly → no visual artifacts, no leaking overlay elements (verify with DevTools Elements panel — `.account-switch-wave` count returns to 0 after each cycle).

No automated tests; the project has none and this is purely presentational.

## Out of Scope

- Changing the account-switch UX beyond the visual effect (e.g., picker sheet, multi-account support, confirmation dialog).
- Replacing the existing Tweaks-accent system with per-user accents.
- Persisting any switch-related state across sessions.
- Animating other UI elements (header text, tabs, etc.) on account switch.

## File Manifest

**New files:**
- `www/account-switch.jsx` — `useAccountSwitch` hook + helpers (~120 LOC).

**Modified files:**
- `www/app.jsx` — wire trigger into avatar button (one-line swap).
- `www/styles.css` — add `/* === Account Switch === */` section (~50 LOC).
- `www/index.html` — add `<script src="account-switch.jsx" ...>` tag in correct order (after React, before app.jsx).
- `package.json` — add `@capacitor/haptics` dependency.
- `ios/App/Podfile.lock` (auto-updated by `npx cap sync`).
