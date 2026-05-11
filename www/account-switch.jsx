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
