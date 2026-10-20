/* global React, PTData, PTOnboarding, Icon, Avatar, AuthScreen */
// Onboarding vor der Challenge: Willkommen, Konto, Profil, Start, Erstellen,
// Beitreten. Welcher Bildschirm dran ist, entscheidet PTOnboarding.entryRoute
// (onboarding-model.js); die Ebenen in der Challenge liegen in onboarding-intro.jsx.
// Alle Namen mit Ob/ob-Präfix, weil Babel-Skripte ihre Funktionen global ablegen.

// ─── Haptik und Ton ─────────────────────────────────────────────────────────
const PTHaptics = {
  run(fn) {
    const H = window.PTCelebrationHaptics;
    if (!H?.Haptics) return;
    try { fn(H)?.catch?.(() => {}); } catch (e) {}
  },
  tap() { this.run(H => H.Haptics.impact({ style: H.ImpactStyle.Light })); },
  success() { this.run(H => H.Haptics.notification({ type: H.NotificationType.Success })); },
  celebrate() {
    this.success();
    setTimeout(() => this.run(H => H.Haptics.impact({ style: H.ImpactStyle.Medium })), 160);
    setTimeout(() => this.run(H => H.Haptics.impact({ style: H.ImpactStyle.Heavy })), 320);
  },
};

const PTSound = {
  play(name, volume = 0.8) {
    try {
      const a = new Audio(`sounds/${name}.wav`);
      a.volume = volume;
      a.play()?.catch?.(() => {});
    } catch (e) {}
  },
};

// ─── Bausteine ──────────────────────────────────────────────────────────────
function useObOnline() {
  const [online, setOnline] = React.useState(() => navigator.onLine !== false);
  React.useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

// Vollbild-Schritt: oben Zurück und Fortschritt, unten die Aktion (sticky,
// Safe Area). `stepKey` startet die Einblend-Animation bei Schrittwechsel neu.
function ObScreen({ onBack, steps = 0, step = 0, aside, foot, children, className = '', center, stepKey }) {
  const online = useObOnline();
  return (
    <div className={`ob-screen ${className}`}>
      <div className="ob-top">
        {onBack
          ? <button type="button" className="ob-back" onClick={onBack} aria-label="Zurück"><Icon name="chevron" size={22} strokeWidth={2.5} /></button>
          : <span />}
        {aside}
        {steps > 1 && (
          <div className="ob-steps" role="img" aria-label={`Schritt ${step} von ${steps}`}>
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className={`ob-step${i + 1 === step ? ' is-on' : i + 1 < step ? ' is-done' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <main className={`ob-body${center ? ' is-center' : ''}`} key={stepKey}>
        {!online && <div className="ob-offline" role="status">Offline</div>}
        {children}
      </main>
      {foot && <div className="ob-foot">{foot}</div>}
    </div>
  );
}

function ObMessage({ error, info }) {
  if (error) return <div className="ob-msg is-error" role="alert">{error}</div>;
  if (info) return <div className="ob-msg is-info" role="status">{info}</div>;
  return null;
}

// Demo öffnen (immer als Benny mit fertigen Challenges) bzw. beenden.
function obSetDemo(on) {
  try {
    if (on) { localStorage.setItem('pt_demo', '1'); localStorage.setItem('pt_demo_user', 'u-benny'); }
    else { localStorage.removeItem('pt_demo'); localStorage.removeItem('pt_demo_user'); }
    sessionStorage.removeItem('pt_demo_signed_out');
  } catch (e) {}
  const url = new URL(location.href);
  url.searchParams.delete('demo');
  location.replace(url.toString());
}

// ─── Willkommen ─────────────────────────────────────────────────────────────
// Zählt einmalig von 0 hoch (CountUp aus components.jsx zeigt zuerst den Endwert).
function useObCount(target, duration = 1100, delay = 250) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    let raf, t0;
    const tick = (t) => {
      if (t0 === undefined) t0 = t;
      const k = Math.min(1, Math.max(0, (t - t0 - delay) / duration));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return v;
}

function ObHeroDuel() {
  const mine = useObCount(120), theirs = useObCount(95);
  const kw = window.weekNumber ? window.weekNumber(PTData.isoDate(PTData.mondayOf(new Date()))) : '';
  return (
    <div className="ob-hero" role="img" aria-label="Beispiel: Du gegen Jonas, 120 zu 95 Liegestütze diese Woche">
      <div className="ob-hero-head"><span>KW {kw} · Duell</span><span className="ob-hero-live">Live</span></div>
      <div className="ob-hero-main">
        <div className="ob-hero-player"><span className="ob-hero-avatar" style={{ '--sc': 'var(--player-1)' }}>D</span>Du</div>
        <div className="ob-hero-score">{mine} : {theirs}</div>
        <div className="ob-hero-player"><span className="ob-hero-avatar" style={{ '--sc': 'var(--player-2)' }}>J</span>Jonas</div>
      </div>
      <div className="ob-hero-split">
        <span style={{ width: '56%', '--sc': 'var(--player-1)' }} />
        <span style={{ flex: 1, '--sc': 'var(--player-2)' }} />
      </div>
      <div className="ob-hero-feed">
        <span aria-hidden="true">🔥</span>
        <span><strong>Jonas</strong> · Liegestütze · gerade eben</span>
        <span className="ob-hero-plus">+20</span>
      </div>
    </div>
  );
}

function ObWelcome({ invite, onStart, onCode, onDemo, onLogin }) {
  return (
    <ObScreen className="ob-welcome" foot={<>
      <button type="button" className="btn" onClick={onStart}>{invite ? 'Konto erstellen & beitreten' : 'Los geht’s'}</button>
      <div className="ob-row2">
        {!invite && <button type="button" className="btn btn-secondary" onClick={onCode}>Code eingeben</button>}
        <button type="button" className="btn btn-secondary" onClick={onDemo}>Demo ansehen</button>
      </div>
      <button type="button" className="btn-link" onClick={onLogin}>Schon dabei? Anmelden</button>
    </>}>
      <div className="ob-brand">Projekt Terminator</div>
      {invite && <div className="ob-ticket"><span aria-hidden="true">🎟️</span> Einladung · Code <span className="mono">{invite}</span></div>}
      <ObHeroDuel />
      <h1 className="ob-title">Trainier gegen deine Freunde.</h1>
      <p className="ob-sub">Ein Wochenziel, jeder seinen Teil, und du siehst live, wer liefert.</p>
    </ObScreen>
  );
}

// ─── Ohne Konto: Willkommen → Konto ─────────────────────────────────────────
// `returning`: auf diesem Gerät war schon jemand angemeldet → direkt zum Login.
function ObAuthFlow({ api, invite, returning }) {
  const [view, setView] = React.useState(() => (returning && !invite ? 'login' : 'welcome'));
  if (view === 'welcome') {
    return <ObWelcome invite={invite}
      onStart={() => setView('signup')} onCode={() => setView('code')}
      onDemo={() => obSetDemo(true)} onLogin={() => setView('login')} />;
  }
  return <AuthScreen api={api} initialMode={view === 'login' ? 'login' : 'signup'} onBack={() => setView('welcome')} />;
}

Object.assign(window, {
  PTHaptics, PTSound, useObOnline, ObScreen, ObMessage, obSetDemo, ObWelcome, ObHeroDuel, ObAuthFlow,
});
