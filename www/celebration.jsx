/* global React */
/* eslint-disable no-unused-vars */

// Hook: detect unseen goal crossings + provide persistent style.
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

// Component: 5-second fullscreen celebration overlay.
// Implementation grows over Tasks 4–7.
function CelebrationOverlay({ category, targetReps, onDone }) {
  const { useEffect, useState } = React;
  const [skipping, setSkipping] = useState(false);

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

    // Initial burst (push to timeouts array so cleanup can cancel them if unmount happens early)
    timeouts.push(setTimeout(fireShockwave, 100));
    timeouts.push(setTimeout(fireShockwave, 300));
    timeouts.push(setTimeout(fireShockwave, 500));
    timeouts.push(setTimeout(() => fireFirework(true), 200));

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
