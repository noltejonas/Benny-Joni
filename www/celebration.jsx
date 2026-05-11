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
