/* global React, PTData, PTOnboarding, Icon, Avatar, Sheet, modeLabel */
// Onboarding vor der Challenge: Willkommen, Konto, Profil, Start, Erstellen,
// Beitreten. Welcher Bildschirm dran ist, entscheidet PTOnboarding.entryRoute
// (onboarding-model.js); die Ebenen in der Challenge liegen in onboarding-intro.jsx.
// Alle Namen mit Ob/ob-Präfix, weil Babel-Skripte ihre Funktionen global ablegen.

// ─── Haptik und Ton ─────────────────────────────────────────────────────────
const PTHaptics = {
  run(fn) {
    const H = window.PTCelebrationHaptics;
    if (!H?.Haptics) return;
    // Im Browser nutzt das Plugin navigator.vibrate, das vor dem ersten Tippen
    // blockiert (Konsolenfehler). Nativ gibt es diese Einschränkung nicht.
    const native = window.Capacitor?.isNativePlatform?.();
    if (!native && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
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
function ObScreen({ onBack, left, steps = 0, step = 0, aside, foot, children, className = '', center, stepKey }) {
  const online = useObOnline();
  return (
    <div className={`ob-screen ${className}`}>
      <div className="ob-top">
        {onBack
          ? <button type="button" className="ob-back" onClick={onBack} aria-label="Zurück"><Icon name="chevron" size={22} strokeWidth={2.5} /></button>
          : (left || <span />)}
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
    // Läuft rAF nicht (Hintergrund, Energiesparen), steht der Endwert trotzdem da.
    const done = setTimeout(() => setV(target), delay + duration + 80);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
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
      <div className="ob-brand">{PTOnboarding.APP_NAME}</div>
      {invite && <div className="ob-ticket"><span aria-hidden="true">🎟️</span> Einladung · Code <span className="mono">{invite}</span></div>}
      <ObHeroDuel />
      <h1 className="ob-title">Trainier gegen deine Freunde.</h1>
      <p className="ob-sub">Ein Wochenziel, jeder seinen Teil, und du siehst live, wer liefert.</p>
    </ObScreen>
  );
}

// ─── Codefeld ───────────────────────────────────────────────────────────────
// Nimmt getippte Codes, eingefügte Nachrichten und Links (normalizeCode).
// `onComplete` meldet einen vollständigen Code (z. B. für die Auto-Vorschau),
// `onSubmit` die Return-Taste („Los“ auf der iOS-Tastatur) wie „Weiter“.
function ObCodeField({ value, onChange, onComplete, onSubmit, autoFocus, onPasteFail }) {
  const take = (raw) => {
    const code = PTOnboarding.normalizeCode(raw);
    if (code) { onChange(code); onComplete?.(code); return true; }
    onChange(String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    return false;
  };
  const enter = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    onSubmit?.();
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
        onChange={e => take(e.target.value)} onKeyDown={enter} />
      {navigator.clipboard?.readText && (
        <button type="button" className="ob-paste" onClick={paste}>
          <Icon name="clipboard" size={18} strokeWidth={2.2} />Einfügen
        </button>
      )}
    </div>
  );
}

// ─── Zustimmung bei der Registrierung ───────────────────────────────────────
// Kleine Zeile unter „Weiter“; die Adressen stehen in PTOnboarding.LEGAL und
// öffnen in Safari (openExternal).
function ObLegalConsent() {
  const L = PTOnboarding.LEGAL;
  const link = (url, text) => (
    <button type="button" className="btn-link" onClick={() => PTOnboarding.openExternal(url)}
      style={{ padding: 0, fontSize: 'inherit', lineHeight: 'inherit', verticalAlign: 'baseline' }}>{text}</button>
  );
  return (
    <p className="ob-hint" style={{ margin: 0, textAlign: 'center' }}>
      Mit ‚Weiter‘ akzeptierst du die {link(L.terms, 'Nutzungsbedingungen')}.
      {' '}Infos zum Datenschutz findest du in der {link(L.privacy, 'Datenschutzerklärung')}.
    </p>
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
    const next = () => { if (!valid) return; onInvite?.(PTOnboarding.normalizeCode(code)); go('signup'); };
    return (
      <ObScreen onBack={() => go('welcome')} stepKey="code" foot={
        <button type="button" className="btn" disabled={!valid} onClick={next}>Weiter</button>
      }>
        <h1 className="ob-title">Hast du einen Code?</h1>
        <p className="ob-sub">Steht in der Einladung. Danach legst du kurz ein Konto an und bist drin.</p>
        <ObCodeField value={code} onChange={setCode} onSubmit={next} autoFocus onPasteFail={(m) => setInfo(m)} />
        <ObMessage error={error} info={info} />
      </ObScreen>
    );
  }

  if (view === 'signup') {
    return (
      <ObScreen onBack={() => go('welcome')} steps={3} step={1} stepKey="signup" foot={<>
        <button type="submit" form="ob-signup" className="btn" disabled={busy || !email || !password}>{label('Weiter')}</button>
        <ObLegalConsent />
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
        {step2 && <div className="ob-hint">Keine Mail da? Schau auch im Spam-Ordner.</div>}
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

// ─── Profil ─────────────────────────────────────────────────────────────────
// Name Pflicht (vorbelegt), Foto optional. Ohne eigenen Namen setzt der
// Supabase-Trigger den Teil vor dem @ ein — dann lieber den Vorschlag zeigen.
function obInitialName(profile, email) {
  const current = (profile?.display_name || '').trim();
  const local = String(email || '').split('@')[0];
  if (!current || current === local) return PTOnboarding.suggestName(email) || current;
  return current;
}

function ObProfile({ api, profile, email, onSaved, onDone, onSignOut }) {
  const online = useObOnline();
  const [name, setName] = React.useState(() => obInitialName(profile, email));
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef(null);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setUploading(true);
    try { onSaved(await api.uploadAvatar(await window.resizeImage(file))); }
    catch (err) { setError(err?.code === 'offline' ? err.message : 'Foto ging nicht hoch. Versuch es nochmal.'); }
    finally { setUploading(false); }
  }

  async function next() {
    const clean = name.trim();
    if (!clean) return;
    if (!online) { setError('Keine Verbindung. Prüf dein Internet.'); return; }
    setError(''); setBusy(true);
    try {
      if (clean !== profile.display_name) onSaved(await api.updateProfile({ display_name: clean.slice(0, 30) }));
      onDone();
    } catch (err) { setError(err.message || String(err)); }
    finally { setBusy(false); }
  }

  const preview = { ...profile, display_name: name.trim() || profile.display_name };
  return (
    <ObScreen steps={3} step={2} stepKey="profile"
      left={onSignOut && <button type="button" className="btn-link ob-top-link" onClick={onSignOut}>Abmelden</button>}
      foot={<button type="button" className="btn" disabled={busy || uploading || !name.trim()} onClick={next}>{busy ? '…' : 'Weiter'}</button>}>
      <h1 className="ob-title">Wie sollen dich die anderen sehen?</h1>
      <p className="ob-sub">So erscheinst du in Feed und Rangliste.</p>
      <button type="button" className={`ob-avatar-pick${uploading ? ' is-busy' : ''}`} disabled={uploading}
        onClick={() => fileRef.current?.click()} aria-label={profile.avatar_url ? 'Foto ändern' : 'Foto wählen'}>
        <Avatar profile={preview} size={120} />
        <span className="ob-avatar-badge"><Icon name="camera" size={20} strokeWidth={2.2} /></span>
      </button>
      <div className="ob-avatar-caption">{uploading ? 'Lädt hoch …' : profile.avatar_url ? 'Foto ändern' : 'Foto wählen (optional)'}</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickPhoto} />
      <div className="ob-label">Dein Name</div>
      <input className="input" value={name} maxLength={30} placeholder="Vorname" autoComplete="given-name"
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') next(); }} />
      <ObMessage error={error} />
    </ObScreen>
  );
}

// ─── Start (Konto ohne Challenge) ───────────────────────────────────────────
// `onArchived`: nur archivierte Challenges vorhanden → über den Switcher erreichbar.
function ObStart({ profile, onCreate, onJoin, onProfile, onDemo, onArchived }) {
  const first = (profile.display_name || '').split(/\s+/)[0];
  return (
    <ObScreen steps={3} step={3} stepKey="start"
      left={<button type="button" className="ob-corner-avatar" onClick={onProfile} aria-label="Profil"><Avatar profile={profile} size={40} /></button>}
      foot={<>
        {onArchived && <button type="button" className="btn-link" onClick={onArchived}>Archivierte Challenges</button>}
        <button type="button" className="btn-link" onClick={onDemo}>Erst mal die Demo ansehen</button>
      </>}>
      <h1 className="ob-title">Hi {first} 👋</h1>
      <p className="ob-sub">Wie startest du?</p>
      <div className="ob-choices">
        <button type="button" className="ob-choice is-primary" onClick={onCreate}>
          <span className="ob-choice-icon" aria-hidden="true">🏁</span>
          <span className="ob-choice-text">
            <span className="ob-choice-title">Challenge starten</span>
            <span className="ob-choice-desc">Du lädst deine Leute ein.</span>
          </span>
          <span className="ob-choice-chev"><Icon name="chevron" size={20} /></span>
        </button>
        <button type="button" className="ob-choice" onClick={onJoin}>
          <span className="ob-choice-icon" aria-hidden="true">🎟️</span>
          <span className="ob-choice-text">
            <span className="ob-choice-title">Ich habe einen Code</span>
            <span className="ob-choice-desc">Jemand hat dich eingeladen.</span>
          </span>
          <span className="ob-choice-chev"><Icon name="chevron" size={20} /></span>
        </button>
      </div>
    </ObScreen>
  );
}

// ─── Plätze: Mitglieder als Avatare, freie Plätze gestrichelt ───────────────
function ObSlots({ members = [], capacity = 2, newIds = [], size = 52 }) {
  const free = Math.max(0, capacity - members.length);
  const shown = Math.min(free, Math.max(1, 4 - members.length)); // höchstens vier Kreise in einer Reihe
  return (
    <div className="ob-slots">
      {members.map((m, i) => (
        <div key={m.user_id || m.id || i} className={`ob-slot${newIds.includes(m.user_id || m.id) ? ' is-new' : ''}`}>
          <Avatar profile={m.profile || m} size={size} />
          <span className="ob-slot-name">{((m.profile || m).display_name || '').split(/\s+/)[0]}</span>
        </div>
      ))}
      {Array.from({ length: shown }, (_, i) => (
        <div key={`free-${i}`} className="ob-slot"><span className="ob-slot-empty" style={{ width: size, height: size }} aria-hidden="true">?</span><span className="ob-slot-name">frei</span></div>
      ))}
      {free > shown && <span className="ob-slots-more">bis {capacity}</span>}
    </div>
  );
}

// ─── Challenge erstellen ────────────────────────────────────────────────────
const OB_MODES = [
  { id: '1v1', title: '1 vs 1', desc: 'Du gegen eine Person', name: 'Duell', emoji: '⚔️', pic: <><i /><em>vs</em><i className="b" /></> },
  { id: '2v2', title: '2 vs 2', desc: 'Zwei Teams à zwei Personen', name: 'Team-Duell', emoji: '💪', pic: <><i /><i /><em>vs</em><i className="b" /><i className="b" /></> },
  { id: 'ffa', title: 'Jeder gegen jeden', desc: 'Bis zu 12 Personen, Rangliste', name: 'Freundeskreis', emoji: '🔥', pic: <><i /><i className="b" /><i className="c" /><i className="d" /></> },
];
const OB_EMOJIS = ['⚔️', '💪', '🔥', '🏆', '🦾', '🏋️', '🤸', '🚀', '🐺', '🦁', '🏃', '🧗'];

// `variant`: 'screen' (Onboarding) oder 'sheet' (zweite Challenge über den Switcher).
function CreatePanel({ api, variant = 'screen', onCreated, onCancel }) {
  const online = useObOnline();
  const [mode, setMode] = React.useState('1v1');
  const [name, setName] = React.useState('');
  const [emoji, setEmoji] = React.useState('⚔️');
  const [emojiTouched, setEmojiTouched] = React.useState(false);
  const [extrasOpen, setExtrasOpen] = React.useState(false);
  const [penalties, setPenalties] = React.useState(false);
  const [rotation, setRotation] = React.useState(false);
  const [work, setWork] = React.useState(false);
  const [startDate, setStartDate] = React.useState(() => PTData.isoDate(new Date()));
  const [endDate, setEndDate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const current = OB_MODES.find(m => m.id === mode);
  const pickMode = (m) => { setMode(m.id); if (!emojiTouched) setEmoji(m.emoji); };
  const on = [penalties && 'Strafkasse', rotation && 'Wochenplan', work && 'Arbeitszeit'].filter(Boolean);

  async function create() {
    if (!online) { setError('Keine Verbindung. Prüf dein Internet.'); return; }
    setError(''); setBusy(true);
    try {
      const c = await api.createCompetition({
        name: (name.trim() || current.name).slice(0, 40), emoji, mode, rotation, penalties, work,
        startDate, endDate: endDate || null,
      });
      onCreated(c);
    } catch (e) { setError(e.message || String(e)); setBusy(false); }
  }

  const toggle = (title, desc, value, set) => (
    <label className="ob-toggle">
      <span className="ob-toggle-text">
        <span className="ob-toggle-title">{title}</span>
        <span className="ob-toggle-desc">{desc}</span>
      </span>
      <span className="toggle-switch">
        <input type="checkbox" role="switch" checked={value} onChange={e => set(e.target.checked)} />
        <span className="toggle-slider" />
      </span>
    </label>
  );

  const body = <>
    <div className="ob-label">Gegen wen?</div>
    <div className="ob-modes" role="radiogroup" aria-label="Modus">
      {OB_MODES.map(m => (
        <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
          className={`ob-mode${mode === m.id ? ' is-on' : ''}`} onClick={() => pickMode(m)}>
          <span className="ob-mode-pic" aria-hidden="true">{m.pic}</span>
          <span className="ob-mode-text">
            <span className="ob-mode-title">{m.title}</span>
            <span className="ob-mode-desc">{m.desc}</span>
          </span>
          <span className="ob-radio">{mode === m.id && <Icon name="check" size={14} strokeWidth={3} />}</span>
        </button>
      ))}
    </div>

    <div className="ob-label">Name</div>
    <div className="ob-name-row">
      <span className="ob-emoji-btn" aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{emoji}</span>
      <input className="input" value={name} maxLength={40} placeholder={current.name} aria-label="Name der Challenge"
        onChange={e => setName(e.target.value)} />
    </div>
    <div className="ob-emoji-row" role="radiogroup" aria-label="Emoji">
      {OB_EMOJIS.map(e => (
        <button key={e} type="button" role="radio" aria-checked={emoji === e} className={`ob-emoji${emoji === e ? ' is-on' : ''}`}
          onClick={() => { setEmoji(e); setEmojiTouched(true); }}>{e}</button>
      ))}
    </div>

    <div className={`ob-extras${extrasOpen ? ' is-open' : ''}`}>
      <button type="button" className="ob-extras-head" aria-expanded={extrasOpen} onClick={() => setExtrasOpen(v => !v)}>
        <span className="ob-extras-title">Extras</span>
        <span className="ob-extras-sub">{on.length ? on.join(' · ') : 'alles aus, geht auch später'}</span>
        <Icon name="chevron" size={18} />
      </button>
      {extrasOpen && (
        <div className="ob-extras-body">
          {toggle('Strafkasse', 'Wer seinen Wochenteil nicht schafft, zahlt 5 € in die Kasse.', penalties, setPenalties)}
          {toggle('Wochenplan', 'Ihr legt Übungen fest, die jede Woche wiederkommen.', rotation, setRotation)}
          {toggle('Arbeitszeit', 'Zählt auch Minuten am Schreibtisch, nicht nur Wiederholungen.', work, setWork)}
          <div className="ob-dates">
            <label>Start<input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value || PTData.isoDate(new Date()))} /></label>
            <label>Ende (optional)<input className="input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></label>
          </div>
        </div>
      )}
    </div>
    <ObMessage error={error} />
  </>;

  const cta = <button type="button" className="btn" disabled={busy} onClick={create}>{busy ? '…' : 'Challenge erstellen'}</button>;

  if (variant === 'sheet') {
    return <>
      <h2 className="title" style={{ marginBottom: 4 }}>Neue Challenge</h2>
      <div className="ob-fields" style={{ gap: 12 }}>{body}</div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
        {cta}
      </div>
    </>;
  }
  return (
    <ObScreen onBack={onCancel} stepKey="create" foot={cta}>
      <h1 className="ob-title">Neue Challenge</h1>
      {body}
    </ObScreen>
  );
}

function CreateCompetitionSheet({ open, api, onClose, onCreated }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {open && <CreatePanel api={api} variant="sheet" onCancel={onClose} onCreated={onCreated} />}
    </Sheet>
  );
}

// ─── Beitreten ──────────────────────────────────────────────────────────────
// Mit gültigem `initialCode` lädt die Vorschau sofort (Einladungslink).
function JoinPanel({ api, initialCode = '', variant = 'screen', onJoined, onCancel, onSkip }) {
  const online = useObOnline();
  const [code, setCode] = React.useState(initialCode || '');
  const [preview, setPreview] = React.useState(null);
  const [team, setTeam] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');

  async function lookup(c = code) {
    const clean = PTOnboarding.normalizeCode(c);
    if (!clean) return;
    if (!online) { setError('Keine Verbindung. Prüf dein Internet.'); return; }
    setError(''); setInfo(''); setBusy(true);
    try {
      const p = await api.previewCompetition(clean);
      if (!p) throw new Error('Code nicht gefunden. Prüf ihn nochmal oder frag nach einem neuen.');
      setPreview(p);
      if (p.mode === '2v2') {
        const n = (t) => p.members.filter(m => m.team === t).length;
        setTeam(n('A') <= n('B') ? 'A' : 'B');
      }
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }

  React.useEffect(() => {
    if (PTOnboarding.normalizeCode(initialCode)) lookup(initialCode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function join() {
    if (!online) { setError('Keine Verbindung. Prüf dein Internet.'); return; }
    setError(''); setBusy(true);
    try {
      const id = await api.joinCompetition(PTOnboarding.normalizeCode(code), preview.mode === '2v2' ? team : null);
      onJoined(id);
    } catch (e) { setError(e.message || String(e)); setBusy(false); }
  }

  const full = preview && preview.members.length >= preview.capacity;
  const week = PTOnboarding.weekProgress();
  const back = preview ? () => { setPreview(null); setError(''); } : onCancel;

  const codeBody = <>
    <ObCodeField value={code} onChange={setCode} autoFocus={!initialCode} onComplete={(c) => lookup(c)}
      onSubmit={() => { if (!busy) lookup(); }} onPasteFail={(m) => setInfo(m)} />
    <ObMessage error={error} info={info} />
  </>;

  const previewBody = preview && <>
    <div className="ob-preview">
      <div className="ob-preview-emoji" aria-hidden="true">{preview.emoji}</div>
      <div className="ob-preview-name">{preview.name}</div>
      <div className="ob-preview-meta">{modeLabel(preview.mode)} · {preview.members.length}/{preview.capacity} dabei</div>
      {preview.mode !== '2v2' && <ObSlots members={preview.members} capacity={preview.capacity} />}
    </div>
    {preview.mode === '2v2' && (
      <div className="ob-teams" role="radiogroup" aria-label="Team wählen">
        {['A', 'B'].map(t => {
          const ms = preview.members.filter(m => m.team === t);
          const teamFull = ms.length >= 2;
          return (
            <button key={t} type="button" role="radio" aria-checked={team === t} disabled={teamFull && !preview.already_member}
              className={`ob-team${team === t ? ' is-on' : ''}`} onClick={() => setTeam(t)}>
              <span className="ob-team-title">Team {t}</span>
              {ms.map((m, i) => <span key={i} className="ob-team-member"><Avatar profile={m} size={24} /> {m.display_name}</span>)}
              {!ms.length && <span className="ob-team-member is-muted">noch leer</span>}
              {teamFull && <span className="ob-team-member is-muted">voll</span>}
            </button>
          );
        })}
      </div>
    )}
    {!preview.already_member && !full && week.dayIndex > 1 && (
      <div className="ob-note"><span className="ob-note-emoji" aria-hidden="true">📅</span>
        Die Woche läuft seit Montag · noch {week.daysLeft} {week.daysLeft === 1 ? 'Tag' : 'Tage'}.</div>
    )}
    {preview.already_member && <ObMessage info="Du bist schon dabei." />}
    {full && !preview.already_member && <ObMessage error="Diese Challenge ist voll." />}
    <ObMessage error={error} />
  </>;

  const cta = preview
    ? <button type="button" className="btn" disabled={busy || (full && !preview.already_member)}
        onClick={preview.already_member ? () => onJoined(preview.id) : join}>
        {busy ? '…' : preview.already_member ? 'Öffnen' : 'Beitreten'}
      </button>
    : <button type="button" className="btn" disabled={busy || !PTOnboarding.normalizeCode(code)} onClick={() => lookup()}>
        {busy ? '…' : 'Weiter'}
      </button>;

  if (variant === 'sheet') {
    return <>
      <h2 className="title" style={{ marginBottom: 4 }}>Challenge beitreten</h2>
      {!preview && <div className="subtitle" style={{ marginBottom: 16 }}>Gib den Code aus der Einladung ein.</div>}
      <div className="ob-fields" style={{ gap: 12, marginTop: preview ? 12 : 0 }}>{preview ? previewBody : codeBody}</div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={back}>{preview ? 'Zurück' : 'Abbrechen'}</button>
        {cta}
      </div>
    </>;
  }
  return (
    <ObScreen onBack={back} stepKey={preview ? 'preview' : 'code'} foot={<>
      {cta}
      {onSkip && <button type="button" className="btn-link" onClick={onSkip}>Ohne Code weiter</button>}
    </>}>
      <h1 className="ob-title">{preview ? 'Bist du dabei?' : 'Challenge beitreten'}</h1>
      {!preview && <p className="ob-sub">Gib den Code aus der Einladung ein. Ganze Nachricht einfügen geht auch.</p>}
      {preview ? previewBody : codeBody}
    </ObScreen>
  );
}

function JoinCompetitionSheet({ open, api, onClose, onJoined, initialCode = '' }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {open && <JoinPanel api={api} variant="sheet" initialCode={initialCode} onCancel={onClose} onJoined={onJoined} />}
    </Sheet>
  );
}

Object.assign(window, {
  PTHaptics, PTSound, useObOnline, ObScreen, ObMessage, obSetDemo, ObWelcome, ObHeroDuel,
  ObCodeField, ObLegalConsent, ObAuthFlow, obMarkStarted, ObProfile, ObStart, ObSlots,
  CreatePanel, CreateCompetitionSheet, JoinPanel, JoinCompetitionSheet,
});
