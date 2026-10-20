/* global React, Sheet, Avatar, PTPeople, PTOnboarding, SIDE_COLORS, modeLabel */
// Challenge-Switcher, Einladen und Profil. Login, Onboarding, Erstellen und
// Beitreten liegen in onboarding.jsx, die Challenge-Einstellungen in settings.jsx.

const COMP_EMOJIS = ['💪', '⚔️', '🔥', '🏆', '🦾', '🏋️', '🤸', '🚀', '🐺', '🦁'];

// Teilen-Sheet mit Code und Link (PTOnboarding.inviteText), sonst in die
// Zwischenablage. Liefert 'shared' | 'copied' | 'cancelled' | 'failed'.
// Im Demo-Modus tritt danach eine Demo-Person bei.
async function shareInvite(competition) {
  const text = PTOnboarding.inviteText(competition);
  window.PTDemo?.simulateJoin?.(competition.id);
  if (navigator.share) {
    try { await navigator.share({ title: competition.name, text }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'failed'; }
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

Object.assign(window, {
  ChallengeSwitcherSheet, ProfileSheet, shareInvite, COMP_EMOJIS, resizeImage,
});
