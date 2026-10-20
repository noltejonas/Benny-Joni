/* global React, PTData, PTOnboarding, Icon, Avatar */
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

// ─── Codefeld ───────────────────────────────────────────────────────────────
// Nimmt getippte Codes, eingefügte Nachrichten und Links (normalizeCode).
// `onComplete` meldet einen vollständigen Code (z. B. für die Auto-Vorschau).
function ObCodeField({ value, onChange, onComplete, autoFocus, onPasteFail }) {
  const take = (raw) => {
    const code = PTOnboarding.normalizeCode(raw);
    if (code) { onChange(code); onComplete?.(code); return true; }
    onChange(String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    return false;
  };
  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!take(text)) onPasteFail?.('In der Zwischenablage steht kein Code.');
    } catch (e) {
      onPasteFail?.('Tipp lange ins Feld und wähle „Einsetzen“.');
    }
  }
  return (
    <div className="ob-code">
      <input className="input mono" value={value} placeholder="ABC234" autoFocus={autoFocus}
        aria-label="Einladungscode" autoCapitalize="characters" autoCorrect="off" autoComplete="one-time-code"
        spellCheck={false} enterKeyHint="go"
        onChange={e => take(e.target.value)} />
      {navigator.clipboard?.readText && (
        <button type="button" className="ob-paste" onClick={paste}>
          <Icon name="clipboard" size={18} strokeWidth={2.2} />Einfügen
        </button>
      )}
    </div>
  );
}

// ─── Ohne Konto: Willkommen, Code, Konto, Mail-Bestätigung ──────────────────
const OB_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const obIsExisting = (e) => e?.code === 'user_already_exists' || /schon einen Account/.test(e?.message || '');
const obIsUnconfirmed = (e) => e?.code === 'email_not_confirmed' || /nicht bestätigt/.test(e?.message || '');

function obMarkStarted(userId) {
  if (!userId) return;
  try {
    const key = PTOnboarding.stateKey(userId);
    const cur = JSON.parse(localStorage.getItem(key) || '{}');
    if (!cur.started) localStorage.setItem(key, JSON.stringify({ ...cur, started: new Date().toISOString() }));
  } catch (e) {}
}

// `returning`: auf diesem Gerät war schon jemand angemeldet → direkt zum Login.
// `invite`: offene Einladung (Code), `onInvite` merkt einen eingegebenen Code.
function ObAuthFlow({ api, invite, returning, onInvite }) {
  const isDemo = api.mode === 'demo';
  const online = useObOnline();
  const [view, setView] = React.useState(() => (returning && !invite ? 'login' : 'welcome'));
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [resetCode, setResetCode] = React.useState('');
  const [code, setCode] = React.useState(invite || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (v, msg = {}) => { setView(v); setError(msg.error || ''); setInfo(msg.info || ''); };

  async function run(fn) {
    if (!online) { setError('Keine Verbindung. Prüf dein Internet.'); return; }
    setError(''); setInfo(''); setBusy(true);
    try { await fn(); }
    catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }

  function checkFields({ withPassword = true } = {}) {
    if (!OB_EMAIL_RE.test(email.trim())) throw new Error('Diese E-Mail-Adresse sieht nicht richtig aus.');
    if (withPassword && password.length < 6) throw new Error('Passwort muss mindestens 6 Zeichen haben.');
  }

  const signup = () => run(async () => {
    checkFields();
    try {
      const r = await api.signUp({ email, password, displayName: PTOnboarding.suggestName(email) });
      obMarkStarted(r?.user?.id);
      if (r?.needsConfirm) { go('confirm'); setCooldown(60); }
      // Mit Session übernimmt App (onAuthChange) und zeigt den Profilschritt.
    } catch (e) {
      if (obIsExisting(e)) { go('login', { info: 'Du hast schon ein Konto. Melde dich an.' }); return; }
      throw e;
    }
  });

  const login = () => run(async () => {
    checkFields({ withPassword: false });
    try { await api.signIn({ email, password }); }
    catch (e) {
      if (obIsUnconfirmed(e)) { go('confirm'); return; }
      throw e;
    }
  });

  const confirmed = () => run(async () => {
    try { await api.signIn({ email, password }); }
    catch (e) {
      if (obIsUnconfirmed(e)) throw new Error('Noch nicht bestätigt. Schau auch im Spam-Ordner.');
      throw e;
    }
  });

  const resend = () => run(async () => {
    await api.resendSignup(email);
    setInfo('Neue Mail ist unterwegs.');
    setCooldown(60);
  });

  const requestReset = () => run(async () => {
    checkFields({ withPassword: false });
    await api.requestPasswordReset(email);
    go('reset-code', { info: 'Wir haben dir einen Code per Mail geschickt.' });
  });

  const setNewPassword = () => run(async () => {
    if (!resetCode.trim()) throw new Error('Gib den Code aus der Mail ein.');
    if (password.length < 6) throw new Error('Passwort muss mindestens 6 Zeichen haben.');
    await api.resetPasswordWithCode({ email, code: resetCode, password });
  });

  const submitOn = (fn) => (e) => { e.preventDefault(); if (!busy) fn(); };
  const label = (text) => (busy ? '…' : text);

  if (view === 'welcome') {
    return <ObWelcome invite={invite}
      onStart={() => go('signup')} onCode={() => go('code')}
      onDemo={() => obSetDemo(true)} onLogin={() => go('login')} />;
  }

  const emailInput = (
    <input className="input" type="email" placeholder="E-Mail" autoComplete="email" inputMode="email"
      autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email}
      onChange={e => setEmail(e.target.value)} disabled={view === 'reset-code'} />
  );
  const passwordInput = (placeholder, autoComplete) => (
    <div className="ob-pass">
      <input className="input" type={showPw ? 'text' : 'password'} placeholder={placeholder}
        autoComplete={autoComplete} value={password} onChange={e => setPassword(e.target.value)} />
      <button type="button" className="ob-eye" onClick={() => setShowPw(v => !v)}
        aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}>
        <Icon name={showPw ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );

  if (view === 'code') {
    const valid = !!PTOnboarding.normalizeCode(code);
    return (
      <ObScreen onBack={() => go('welcome')} stepKey="code" foot={
        <button type="button" className="btn" disabled={!valid}
          onClick={() => { onInvite?.(PTOnboarding.normalizeCode(code)); go('signup'); }}>Weiter</button>
      }>
        <h1 className="ob-title">Hast du einen Code?</h1>
        <p className="ob-sub">Steht in der Einladung. Danach legst du kurz ein Konto an und bist drin.</p>
        <ObCodeField value={code} onChange={setCode} autoFocus onPasteFail={(m) => setInfo(m)} />
        <ObMessage error={error} info={info} />
      </ObScreen>
    );
  }

  if (view === 'signup') {
    return (
      <ObScreen onBack={() => go('welcome')} steps={3} step={1} stepKey="signup" foot={<>
        <button type="submit" form="ob-signup" className="btn" disabled={busy || !email || !password}>{label('Weiter')}</button>
        <button type="button" className="btn-link" onClick={() => go('login')}>Schon ein Konto? Anmelden</button>
      </>}>
        <h1 className="ob-title">Konto erstellen</h1>
        <p className="ob-sub">{invite ? 'Danach bist du direkt in der Challenge.' : 'Dauert keine Minute.'}</p>
        {isDemo && <div className="ob-hint">Demo: Jede Adresse funktioniert, nichts verlässt dein Gerät.</div>}
        <form id="ob-signup" className="ob-fields" onSubmit={submitOn(signup)} noValidate>
          {emailInput}
          {passwordInput('Passwort (mind. 6 Zeichen)', 'new-password')}
        </form>
        <ObMessage error={error} info={info} />
      </ObScreen>
    );
  }

  if (view === 'login') {
    return (
      <ObScreen onBack={() => go('welcome')} stepKey="login" foot={<>
        <button type="submit" form="ob-login" className="btn" disabled={busy || !email || !password}>{label('Anmelden')}</button>
        <button type="button" className="btn-link" onClick={() => go('signup')}>Neu hier? Konto erstellen</button>
      </>}>
        <h1 className="ob-title">Willkommen zurück</h1>
        <p className="ob-sub">{isDemo ? 'Demo: Jede Adresse funktioniert.' : 'Schön, dass du da bist.'}</p>
        <form id="ob-login" className="ob-fields" onSubmit={submitOn(login)} noValidate>
          {emailInput}
          {passwordInput('Passwort', 'current-password')}
        </form>
        <button type="button" className="btn-link" style={{ alignSelf: 'flex-start' }} onClick={() => go('reset')}>Passwort vergessen?</button>
        <ObMessage error={error} info={info} />
      </ObScreen>
    );
  }

  if (view === 'reset' || view === 'reset-code') {
    const step2 = view === 'reset-code';
    return (
      <ObScreen onBack={() => go(step2 ? 'reset' : 'login')} stepKey={view} foot={
        <button type="submit" form="ob-reset" className="btn" disabled={busy || !email || (step2 && (!resetCode || !password))}>
          {label(step2 ? 'Passwort setzen' : 'Code anfordern')}
        </button>
      }>
        <h1 className="ob-title">{step2 ? 'Neues Passwort' : 'Passwort vergessen'}</h1>
        <p className="ob-sub">{step2 ? 'Code aus der Mail und dein neues Passwort.' : 'Gib deine E-Mail ein, du bekommst einen Code.'}</p>
        <form id="ob-reset" className="ob-fields" onSubmit={submitOn(step2 ? setNewPassword : requestReset)} noValidate>
          {emailInput}
          {step2 && <input className="input mono" placeholder="Code aus der Mail" inputMode="numeric" autoComplete="one-time-code"
            value={resetCode} onChange={e => setResetCode(e.target.value)} />}
          {step2 && passwordInput('Neues Passwort (mind. 6 Zeichen)', 'new-password')}
        </form>
        <ObMessage error={error} info={info} />
      </ObScreen>
    );
  }

  // view === 'confirm'
  return (
    <ObScreen onBack={() => go('signup')} stepKey="confirm" center foot={<>
      <button type="button" className="btn" disabled={busy} onClick={confirmed}>{label('Ich hab bestätigt')}</button>
      <button type="button" className="btn btn-secondary" disabled={busy || cooldown > 0} onClick={resend}>
        {cooldown > 0 ? `Nochmal senden in ${cooldown} s` : 'Mail nochmal senden'}
      </button>
      <button type="button" className="btn-link" onClick={() => go('signup')}>Andere E-Mail</button>
    </>}>
      <div className="ob-trophy" aria-hidden="true">📬</div>
      <h1 className="ob-title" style={{ textAlign: 'center' }}>Check deine Mails</h1>
      <p className="ob-sub" style={{ textAlign: 'center' }}>
        Wir haben dir einen Link an <strong>{email.trim()}</strong> geschickt. Tipp ihn an und komm dann hierher zurück.
      </p>
      <ObMessage error={error} info={info} />
    </ObScreen>
  );
}

Object.assign(window, {
  PTHaptics, PTSound, useObOnline, ObScreen, ObMessage, obSetDemo, ObWelcome, ObHeroDuel,
  ObCodeField, ObAuthFlow, obMarkStarted,
});
