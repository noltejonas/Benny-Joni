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
