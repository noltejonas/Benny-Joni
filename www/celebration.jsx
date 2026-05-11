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
