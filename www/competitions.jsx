/* global React, Sheet, Avatar, PTPeople, SIDE_COLORS, modeLabel */
// Login, Onboarding, Challenge-Switcher, Erstellen/Beitreten, Profil und
// Challenge-Einstellungen.

const MODES = [
  { id: '1v1', title: '1 vs 1', desc: 'Du gegen eine Person' },
  { id: '2v2', title: '2 vs 2', desc: 'Zwei Teams à zwei Personen' },
  { id: 'ffa', title: 'Jeder gegen jeden', desc: 'Bis zu 12 Personen, Rangliste' },
];
const COMP_EMOJIS = ['💪', '⚔️', '🔥', '🏆', '🦾', '🏋️', '🤸', '🚀', '🐺', '🦁'];

function shareInvite(competition) {
  const text = `Komm in meine Challenge „${competition.name}“ bei Projekt Terminator. Code: ${competition.invite_code}`;
  if (navigator.share) {
    navigator.share({ title: competition.name, text }).catch(() => {});
    return 'shared';
  }
  try { navigator.clipboard?.writeText(text); } catch (e) {}
  return 'copied';
}

// ─── Login / Registrierung ──────────────────────────────────────────────────
function AuthScreen({ api }) {
  const [mode, setMode] = React.useState('login'); // login | signup | reset | reset-code
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');

  async function submit(e) {
    e?.preventDefault();
    setError(''); setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') await api.signIn({ email, password });
      else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Bitte gib deinen Namen ein.');
        await api.signUp({ email, password, displayName: name });
      } else if (mode === 'reset') {
        await api.requestPasswordReset(email);
        setMode('reset-code');
        setInfo('Wir haben dir einen Code per Mail geschickt.');
      } else if (mode === 'reset-code') {
        await api.resetPasswordWithCode({ email, code, password });
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    login: 'Anmelden', signup: 'Account erstellen',
    reset: 'Passwort vergessen', 'reset-code': 'Neues Passwort',
  };

  return (
    <div className="name-picker mu-auth">
      <div className="brand">Projekt Terminator</div>
      <h1>{titles[mode]}</h1>
      <p className="sub">
        {mode === 'signup' ? 'Einmal anlegen, danach bleibst du in der App angemeldet.'
          : mode === 'reset' ? 'Gib deine E-Mail ein, du bekommst einen Code.'
          : mode === 'reset-code' ? 'Code aus der Mail und neues Passwort eingeben.'
          : 'Melde dich an, um zu deinen Challenges zu kommen.'}
      </p>
      <form className="mu-auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <input className="input" placeholder="Dein Name" autoComplete="nickname" maxLength={30}
            value={name} onChange={e => setName(e.target.value)} />
        )}
        <input className="input" type="email" placeholder="E-Mail" autoComplete="email" autoCapitalize="none"
          value={email} onChange={e => setEmail(e.target.value)} disabled={mode === 'reset-code'} />
        {mode === 'reset-code' && (
          <input className="input mono" placeholder="Code aus der Mail" inputMode="numeric" autoComplete="one-time-code"
            value={code} onChange={e => setCode(e.target.value)} />
        )}
        {mode !== 'reset' && (
          <input className="input" type="password" placeholder={mode === 'reset-code' ? 'Neues Passwort' : 'Passwort'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password} onChange={e => setPassword(e.target.value)} />
        )}
        {error && <div className="mu-error">{error}</div>}
        {info && <div className="mu-info">{info}</div>}
        <button className="btn" type="submit" disabled={busy || !email || (mode !== 'reset' && !password)}>
          {busy ? '…' : mode === 'login' ? 'Anmelden' : mode === 'signup' ? 'Registrieren'
            : mode === 'reset' ? 'Code anfordern' : 'Passwort setzen'}
        </button>
      </form>
      <div className="mu-auth-links">
        {mode === 'login' && <>
          <button className="btn-link" onClick={() => { setMode('signup'); setError(''); }}>Neu hier? Account erstellen</button>
          <button className="btn-link" onClick={() => { setMode('reset'); setError(''); }}>Passwort vergessen</button>
        </>}
        {mode !== 'login' && (
          <button className="btn-link" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Zurück zum Login</button>
        )}
      </div>
    </div>
  );
}

// ─── Onboarding (noch keine Challenge) ──────────────────────────────────────
function OnboardingScreen({ profile, onCreate, onJoin, onProfile, onSignOut }) {
  return (
    <div className="name-picker mu-onboarding">
      <button className="mu-onboarding-profile" onClick={onProfile} aria-label="Profil">
        <Avatar profile={profile} size={40} />
      </button>
      <div className="brand">Projekt Terminator</div>
      <h1>Hi {profile.display_name.split(/\s+/)[0]} 👋</h1>
      <p className="sub">Starte eine eigene Challenge oder tritt mit einem Code bei.</p>
      <div className="mu-onboarding-actions">
        <button className="btn" onClick={onCreate}>Challenge erstellen</button>
        <button className="btn btn-secondary" onClick={onJoin}>Mit Code beitreten</button>
      </div>
      <button className="btn-link" style={{ marginTop: 28 }} onClick={onSignOut}>Abmelden</button>
    </div>
  );
}

// ─── Challenge-Switcher ─────────────────────────────────────────────────────
function ChallengeSwitcherSheet({ open, onClose, profile, competitions, activeId, onSelect, onSetMain,
  onCreate, onJoin, onProfile, onSignOut }) {
  const [showArchived, setShowArchived] = React.useState(false);
  const active = competitions.filter(c => !c.archived_at);
  const archived = competitions.filter(c => c.archived_at);
  const row = (c) => {
    const isMain = profile.main_competition_id === c.id;
    return (
      <div key={c.id} className={`mu-comp-row ${c.id === activeId ? 'active' : ''}`}>
        <button className="mu-comp-main" onClick={() => onSelect(c.id)}>
          <span className="mu-comp-emoji">{c.emoji}</span>
          <span className="mu-comp-text">
            <span className="mu-comp-name">{c.name}</span>
            <span className="mu-comp-meta">{modeLabel(c.mode)}{c.my_role === 'owner' ? ' · Ersteller' : ''}{c.archived_at ? ' · archiviert' : ''}</span>
          </span>
          {c.id === activeId && <span className="mu-comp-check">✓</span>}
        </button>
        {!c.archived_at && (
          <button className={`mu-comp-star ${isMain ? 'on' : ''}`}
            aria-label={isMain ? 'Haupt-Challenge' : 'Als Haupt-Challenge setzen'}
            onClick={() => onSetMain(isMain ? null : c.id)}>
            {isMain ? '★' : '☆'}
          </button>
        )}
      </div>
    );
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <button className="mu-profile-row" onClick={onProfile}>
        <Avatar profile={profile} size={44} />
        <span className="mu-profile-text">
          <span className="mu-profile-name">{profile.display_name}</span>
          <span className="mu-profile-sub">Profil bearbeiten</span>
        </span>
        <span className="mu-chev">›</span>
      </button>

      <div className="label" style={{ margin: '18px 0 8px' }}>Deine Challenges</div>
      <div className="mu-comp-list">
        {active.map(row)}
        {!active.length && <div className="subtitle">Noch keine aktive Challenge.</div>}
      </div>
      <div className="mu-hint">★ = Haupt-Challenge, öffnet sich beim Start der App</div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onCreate}>+ Neue Challenge</button>
        <button className="btn btn-secondary" onClick={onJoin}>Code eingeben</button>
      </div>

      {archived.length > 0 && (
        <>
          <button className="btn-link" style={{ marginTop: 14 }} onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Archivierte ausblenden' : `Archivierte anzeigen (${archived.length})`}
          </button>
          {showArchived && <div className="mu-comp-list" style={{ marginTop: 8 }}>{archived.map(row)}</div>}
        </>
      )}

      <button className="btn btn-danger-ghost" style={{ marginTop: 20 }} onClick={onSignOut}>Abmelden</button>
    </Sheet>
  );
}

// ─── Challenge erstellen ────────────────────────────────────────────────────
function CreateCompetitionSheet({ open, api, onClose, onCreated }) {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [emoji, setEmoji] = React.useState('💪');
  const [mode, setMode] = React.useState('1v1');
  const [rotation, setRotation] = React.useState(false);
  const [penalties, setPenalties] = React.useState(false);
  const [work, setWork] = React.useState(false);
  const [startDate, setStartDate] = React.useState(() => PTData.isoDate(new Date()));
  const [endDate, setEndDate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState(null);
  const [shareState, setShareState] = React.useState('');

  React.useEffect(() => {
    if (!open) { setStep(1); setName(''); setEmoji('💪'); setMode('1v1'); setRotation(false);
      setPenalties(false); setWork(false); setEndDate(''); setCreated(null); setShareState(''); }
  }, [open]);

  async function create() {
    setBusy(true);
    try {
      const c = await api.createCompetition({ name, emoji, mode, rotation, penalties, work, startDate, endDate });
      setCreated(c);
      setStep(3);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const toggle = (label, desc, value, set) => (
    <div className="mu-toggle-row">
      <div>
        <div className="mu-toggle-title">{label}</div>
        <div className="mu-toggle-desc">{desc}</div>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );

  return (
    <Sheet open={open} onClose={created ? () => onCreated(created) : onClose}>
      {step === 1 && <>
        <h2 className="title" style={{ marginBottom: 16 }}>Neue Challenge</h2>
        <div className="label" style={{ marginBottom: 8 }}>Name</div>
        <div className="new-cat-row" style={{ marginTop: 0 }}>
          <input className="input new-cat-emoji" value={emoji} maxLength={2} onChange={e => setEmoji(e.target.value)} />
          <input className="input" placeholder="z. B. Büro-Battle" maxLength={40} autoFocus
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          {COMP_EMOJIS.map(e => (
            <button key={e} className={`chip ${emoji === e ? 'chip-active' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
        <div className="label" style={{ margin: '18px 0 8px' }}>Modus</div>
        <div className="mu-mode-list">
          {MODES.map(m => (
            <button key={m.id} className={`mu-mode ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)}>
              <span className="mu-mode-title">{m.title}</span>
              <span className="mu-mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" disabled={!name.trim()} onClick={() => setStep(2)}>Weiter</button>
        </div>
      </>}

      {step === 2 && <>
        <h2 className="title" style={{ marginBottom: 4 }}>{emoji} {name}</h2>
        <div className="subtitle" style={{ marginBottom: 16 }}>{modeLabel(mode)} · Module wählen</div>
        {toggle('Rotationsplan', 'Wiederkehrender Wochenplan mit Vorschlägen für die Ziele', rotation, setRotation)}
        {toggle('Strafkonto', 'Wer seinen Anteil nicht schafft, zahlt in den Pot', penalties, setPenalties)}
        {toggle('Work-Tracking', 'Arbeitszeit statt Wiederholungen tracken', work, setWork)}
        <div className="mu-date-row">
          <label>
            <span className="label">Start</span>
            <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label>
            <span className="label">Ende (optional)</span>
            <input className="input" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={() => setStep(1)}>Zurück</button>
          <button className="btn" disabled={busy} onClick={create}>{busy ? '…' : 'Erstellen'}</button>
        </div>
      </>}

      {step === 3 && created && <>
        <h2 className="title" style={{ marginBottom: 4 }}>Challenge steht 🎉</h2>
        <div className="subtitle" style={{ marginBottom: 18 }}>Schick deinen Freunden diesen Code:</div>
        <div className="mu-code mono">{created.invite_code}</div>
        <button className="btn" style={{ width: '100%', marginTop: 16 }}
          onClick={() => setShareState(shareInvite(created))}>
          Einladung teilen
        </button>
        {shareState === 'copied' && <div className="mu-info" style={{ textAlign: 'center' }}>Einladung kopiert</div>}
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => onCreated(created)}>
          Zur Challenge
        </button>
      </>}
    </Sheet>
  );
}

// ─── Mit Code beitreten ─────────────────────────────────────────────────────
function JoinCompetitionSheet({ open, api, onClose, onJoined, initialCode = '' }) {
  const [code, setCode] = React.useState(initialCode);
  const [preview, setPreview] = React.useState(null);
  const [team, setTeam] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) { setCode(initialCode); setPreview(null); setTeam(null); setError(''); }
  }, [open, initialCode]);

  async function lookup() {
    setError(''); setBusy(true);
    try {
      const p = await api.previewCompetition(code);
      if (!p) throw new Error('Code nicht gefunden.');
      setPreview(p);
      if (p.mode === '2v2') {
        const a = p.members.filter(m => m.team === 'A').length;
        const b = p.members.filter(m => m.team === 'B').length;
        setTeam(a <= b ? 'A' : 'B');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function join() {
    setError(''); setBusy(true);
    try {
      const id = await api.joinCompetition(code, preview.mode === '2v2' ? team : null);
      onJoined(id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const full = preview && preview.members.length >= preview.capacity;

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="title" style={{ marginBottom: 4 }}>Challenge beitreten</h2>
      {!preview ? <>
        <div className="subtitle" style={{ marginBottom: 16 }}>Gib den 6-stelligen Code ein.</div>
        <input className="input input-lg mono mu-code-input" maxLength={6} autoFocus autoCapitalize="characters"
          placeholder="ABC123" value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) lookup(); }} />
        {error && <div className="mu-error">{error}</div>}
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn" disabled={busy || code.length !== 6} onClick={lookup}>{busy ? '…' : 'Weiter'}</button>
        </div>
      </> : <>
        <div className="mu-preview">
          <div className="mu-preview-emoji">{preview.emoji}</div>
          <div className="mu-preview-name">{preview.name}</div>
          <div className="mu-preview-meta">{modeLabel(preview.mode)} · {preview.members.length}/{preview.capacity} dabei</div>
        </div>
        {preview.mode === '2v2' ? (
          <div className="mu-teams">
            {['A', 'B'].map(t => {
              const ms = preview.members.filter(m => m.team === t);
              const teamFull = ms.length >= 2;
              return (
                <button key={t} className={`mu-team ${team === t ? 'active' : ''}`} disabled={teamFull}
                  onClick={() => setTeam(t)}>
                  <div className="mu-team-title">Team {t}</div>
                  {ms.map((m, i) => <div key={i} className="mu-team-member"><Avatar profile={m} size={22} /> {m.display_name}</div>)}
                  {!ms.length && <div className="mu-team-member muted">noch leer</div>}
                  {teamFull && <div className="mu-team-member muted">voll</div>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mu-member-chips">
            {preview.members.map((m, i) => (
              <span key={i} className="mu-member-chip"><Avatar profile={m} size={22} /> {m.display_name}</span>
            ))}
          </div>
        )}
        {preview.already_member && <div className="mu-info">Du bist schon dabei.</div>}
        {full && !preview.already_member && <div className="mu-error">Diese Challenge ist voll.</div>}
        {error && <div className="mu-error">{error}</div>}
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={() => setPreview(null)}>Zurück</button>
          <button className="btn" disabled={busy || (full && !preview.already_member)}
            onClick={preview.already_member ? () => onJoined(preview.id) : join}>
            {busy ? '…' : preview.already_member ? 'Öffnen' : 'Beitreten'}
          </button>
        </div>
      </>}
    </Sheet>
  );
}

// ─── Profil ─────────────────────────────────────────────────────────────────
async function resizeImage(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const s = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ProfileSheet({ open, api, profile, onClose, onSaved, onSignOut }) {
  const [name, setName] = React.useState(profile.display_name);
  const [color, setColor] = React.useState(profile.color);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => { if (open) { setName(profile.display_name); setColor(profile.color); } }, [open, profile]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try { onSaved(await api.updateProfile({ display_name: name.trim(), color })); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { onSaved(await api.uploadAvatar(await resizeImage(file)), { keepOpen: true }); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="title" style={{ marginBottom: 16 }}>Profil</h2>
      <div className="mu-avatar-edit">
        <button className="mu-avatar-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Avatar profile={{ ...profile, display_name: name || profile.display_name, color }} size={84} />
          <span className="mu-avatar-btn-label">Foto ändern</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickAvatar} />
      </div>
      <div className="label" style={{ marginBottom: 8 }}>Name</div>
      <input className="input" maxLength={30} value={name} onChange={e => setName(e.target.value)} />
      <div className="label" style={{ margin: '16px 0 8px' }}>Farbe</div>
      <div className="mu-color-row">
        {SIDE_COLORS.map(c => (
          <button key={c} className={`mu-color ${color === c ? 'active' : ''}`} style={{ background: c }}
            aria-label={c} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
        <button className="btn" disabled={busy || !name.trim()} onClick={save}>{busy ? '…' : 'Speichern'}</button>
      </div>
      {onSignOut && <button className="btn btn-danger-ghost" style={{ marginTop: 12 }} onClick={onSignOut}>Abmelden</button>}
    </Sheet>
  );
}

// ─── Challenge-Einstellungen (Karte im Settings-Screen) ─────────────────────
function CompetitionSettingsCard({ api, capi, competition, members, me, onChanged, onLeft }) {
  const isOwner = members.some(m => m.user_id === me && m.role === 'owner' && !m.left_at);
  const [name, setName] = React.useState(competition.name);
  const [emoji, setEmoji] = React.useState(competition.emoji);
  const [busy, setBusy] = React.useState(false);
  const [shareState, setShareState] = React.useState('');
  React.useEffect(() => { setName(competition.name); setEmoji(competition.emoji); }, [competition.name, competition.emoji]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged?.(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const saveName = () => {
    if (!name.trim() || (name === competition.name && emoji === competition.emoji)) return;
    run(() => api.updateCompetition(competition.id, { name: name.trim(), emoji: emoji || '💪' }));
  };

  const setModule = (key, value) => run(async () => {
    await api.updateCompetition(competition.id, { [key]: value });
    if (key === 'penalties_enabled') await capi.setPenaltyConfig({ enabled: value });
    if (key === 'rotation_enabled') await capi.setRotationConfig({ enabled: value });
  });

  const active = members.filter(m => !m.left_at);
  const moduleRow = (key, label, desc) => (
    <div className="mu-toggle-row">
      <div>
        <div className="mu-toggle-title">{label}</div>
        <div className="mu-toggle-desc">{desc}</div>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={!!competition[key]} disabled={!isOwner || busy}
          onChange={e => setModule(key, e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );

  return (
    <div className="card mu-settings">
      <div className="label" style={{ margin: 0, marginBottom: 10 }}>Challenge</div>
      {isOwner ? (
        <div className="new-cat-row" style={{ marginTop: 0 }}>
          <input className="input new-cat-emoji" value={emoji} maxLength={2}
            onChange={e => setEmoji(e.target.value)} onBlur={saveName} />
          <input className="input" value={name} maxLength={40}
            onChange={e => setName(e.target.value)} onBlur={saveName}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
        </div>
      ) : (
        <div className="mu-settings-name">{competition.emoji} {competition.name}</div>
      )}
      <div className="subtitle" style={{ fontSize: 13, marginTop: 6 }}>
        {modeLabel(competition.mode)} · seit {new Date(competition.start_date + 'T00:00:00').toLocaleDateString('de-DE')}
        {competition.end_date ? ` · bis ${new Date(competition.end_date + 'T00:00:00').toLocaleDateString('de-DE')}` : ''}
      </div>

      <div className="settings-section-label" style={{ marginTop: 18 }}>Einladungscode</div>
      <div className="mu-code-row">
        <span className="mu-code mono small">{competition.invite_code}</span>
        <button className="btn-ghost-sm primary" onClick={() => setShareState(shareInvite(competition))}>Teilen</button>
        {isOwner && (
          <button className="btn-ghost-sm" disabled={busy}
            onClick={() => confirm('Neuen Code erzeugen? Der alte funktioniert dann nicht mehr.') && run(() => api.regenerateInviteCode(competition.id))}>
            Neu
          </button>
        )}
      </div>
      {shareState === 'copied' && <div className="mu-info">Einladung kopiert</div>}

      <div className="settings-section-label" style={{ marginTop: 18 }}>Module</div>
      {moduleRow('rotation_enabled', 'Rotationsplan', 'Wochenplan mit Vorschlägen')}
      {moduleRow('penalties_enabled', 'Strafkonto', 'Strafen bei verfehltem Anteil')}
      {moduleRow('work_enabled', 'Work-Tracking', 'Arbeitszeit-Kategorien und Tags')}
      {!isOwner && <div className="mu-hint">Module kann nur der Ersteller ändern.</div>}

      <div className="settings-section-label" style={{ marginTop: 18 }}>
        Teilnehmer ({active.length})
      </div>
      <div className="mu-member-list">
        {active.map(m => (
          <div key={m.user_id} className="mu-member-row">
            <Avatar profile={m.profile} size={32} />
            <span className="mu-member-name">
              {m.profile?.display_name}{m.user_id === me ? ' (du)' : ''}
              {m.role === 'owner' && <span className="mu-badge">Ersteller</span>}
            </span>
            {competition.mode === '2v2' && (
              <div className="segmented segmented-sm">
                {['A', 'B'].map(t => (
                  <button key={t} className={m.team === t ? 'active' : ''}
                    disabled={busy || !(isOwner || m.user_id === me)}
                    onClick={() => m.team !== t && run(() => api.setMemberTeam(competition.id, m.user_id, t))}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            {isOwner && m.user_id !== me && (
              <button className="icon-btn icon-btn-danger" aria-label="Entfernen" disabled={busy}
                onClick={() => confirm(`${m.profile?.display_name} aus der Challenge entfernen? Die Sätze bleiben in der Historie.`)
                  && run(() => api.removeMember(competition.id, m.user_id))}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mu-settings-danger">
        {isOwner && (
          <button className="btn btn-secondary" disabled={busy}
            onClick={() => run(() => api.updateCompetition(competition.id,
              { archived_at: competition.archived_at ? null : new Date().toISOString() }))}>
            {competition.archived_at ? 'Wieder aktivieren' : 'Archivieren'}
          </button>
        )}
        <button className="btn btn-danger-ghost" disabled={busy}
          onClick={async () => {
            if (!confirm(`„${competition.name}“ verlassen? Deine Sätze bleiben in der Historie.`)) return;
            try { await api.leaveCompetition(competition.id); onLeft?.(); } catch (e) { alert(e.message); }
          }}>
          Challenge verlassen
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  AuthScreen, OnboardingScreen, ChallengeSwitcherSheet, CreateCompetitionSheet,
  JoinCompetitionSheet, ProfileSheet, CompetitionSettingsCard, shareInvite,
});
