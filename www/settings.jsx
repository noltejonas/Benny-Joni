/* global React, PTData, PTOnboarding, Icon, Avatar, Sheet, modeLabel, shareInvite, formatEuro, COMP_EMOJIS */
// Einstellungen im iOS-Stil: Startseite mit Gruppen, je Thema eine Unterseite.
// Welche Seite offen ist, steuert CompetitionApp (`page`/`onNavigate`), damit
// z. B. das Zahnrad im Strafkonto direkt die Strafregeln öffnet.
//
// Rechte wie in der Datenbank: Name, Emoji, Module, Code erneuern, Archivieren
// und Entfernen nur für den Ersteller; Wochenplan, Strafregeln und Tags für alle.
const { useState, useEffect, useMemo } = React;

const ST_PENALTY_RULES = [
  { id: 'per_week_aggregate', name: 'Wochensumme', desc: 'Alle Übungen zusammen unter deinem Anteil' },
  { id: 'per_challenge', name: 'Pro Übung', desc: 'Eine Strafe je verfehlter Übung' },
  { id: 'per_week_any', name: 'Mindestens eine verfehlt', desc: 'Eine Strafe pro Woche' },
  { id: 'per_week_all', name: 'Alle verfehlt', desc: 'Nur wenn gar nichts geschafft ist' },
];

function stDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Erstes sichtbares Zeichen, damit auch Emojis aus mehreren Codepoints (🏋️) passen.
function stFirstGrapheme(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    if (Intl.Segmenter) return new Intl.Segmenter('de').segment(s)[Symbol.iterator]().next().value.segment;
  } catch (e) {}
  return Array.from(s)[0];
}

// 500 → "5", 250 → "2,50"
function stEuroInput(cents) {
  const digits = cents % 100 === 0 ? 0 : 2;
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}

// ─── Rechtliches, Support, Melden ───────────────────────────────────────────
// Adressen und Links stehen zentral in PTOnboarding (APP_NAME, LEGAL, SUPPORT_EMAIL,
// APP_STORE_ID). Fehlt etwas davon, bleibt die jeweilige Zeile weg.
const stLaunch = () => window.PTOnboarding || {};

// Öffnet Links in Safari bzw. der Mail-App.
function stOpen(url) {
  if (!url) return;
  const O = stLaunch();
  if (typeof O.openExternal === 'function') { O.openExternal(url); return; }
  if (/^(mailto|itms-apps):/i.test(url)) { window.location.href = url; return; }
  window.open(url, '_blank');
}

// mailto an den Support mit Betreff und Text; ohne Adresse die Support-Seite.
function stSupportUrl(subject, body) {
  const O = stLaunch();
  const mail = typeof O.supportMailto === 'function' ? O.supportMailto(subject, body)
    : O.SUPPORT_EMAIL ? `mailto:${O.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '';
  return mail || O.LEGAL?.support || '';
}

const stIds = (userId, challengeId) =>
  [userId && `Nutzer-ID: ${userId}`, challengeId && `Challenge-ID: ${challengeId}`].filter(Boolean).join('\n');

function stCanReport() {
  const O = stLaunch();
  return typeof O.reportContent === 'function' || !!stSupportUrl('-', '-');
}

// Meldung per Mail (Apple 1.2). `label` landet im Betreff, wenn wir die Mail selbst bauen.
function stReport({ kind, label, userId, challengeId, note }) {
  const O = stLaunch();
  if (typeof O.reportContent === 'function') { O.reportContent({ kind, userId, challengeId, note }); return; }
  stOpen(stSupportUrl(`Meldung: ${label}`, `${note}\n\n\n${stIds(userId, challengeId)}`));
}

// ─── Bausteine ──────────────────────────────────────────────────────────────
function SettingsPageHeader({ title, onBack }) {
  return (
    <header className="st-head">
      {onBack && (
        <button className="st-back" onClick={onBack}>
          <span className="st-back-icon"><Icon name="chevron" size={20} strokeWidth={2.5} /></span>
          Einstellungen
        </button>
      )}
      <h1 className="st-title">{title}</h1>
    </header>
  );
}

function SettingsGroup({ title, action, footer, children }) {
  return (
    <section className="st-group">
      {(title || action) && (
        <div className="st-group-head">
          {title && <h2 className="st-group-title">{title}</h2>}
          {action}
        </div>
      )}
      <div className="st-card">{children}</div>
      {footer && <p className="st-footer">{footer}</p>}
    </section>
  );
}

function SettingsTile({ icon, emoji }) {
  if (emoji != null) return <span className="st-tile is-emoji" aria-hidden="true">{emoji}</span>;
  return <span className="st-tile" aria-hidden="true"><Icon name={icon} size={18} /></span>;
}

// `chevron` nur für Zeilen, die eine Unterseite öffnen; Aktionen bleiben ohne.
function SettingsRow({ icon, emoji, leading, title, subtitle, value, onClick, chevron = false, tone, disabled, children }) {
  const Tag = onClick ? 'button' : 'div';
  const props = onClick ? { type: 'button', onClick, disabled } : {};
  return (
    <Tag className={`st-row${tone ? ` is-${tone}` : ''}`} {...props}>
      {leading || ((icon || emoji != null) && <SettingsTile icon={icon} emoji={emoji} />)}
      <span className="st-row-text">
        <span className="st-row-title">{title}</span>
        {subtitle && <span className="st-row-sub">{subtitle}</span>}
      </span>
      {value != null && value !== '' && <span className="st-row-value">{value}</span>}
      {children}
      {chevron && <span className="st-chev"><Icon name="chevron" size={18} /></span>}
    </Tag>
  );
}

function SettingsSwitchRow({ icon, title, subtitle, checked, onChange, disabled }) {
  const id = React.useId();
  return (
    <label className={`st-row${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      {icon && <SettingsTile icon={icon} />}
      <span className="st-row-text">
        <span className="st-row-title">{title}</span>
        {subtitle && <span className="st-row-sub">{subtitle}</span>}
      </span>
      <span className="toggle-switch">
        <input id={id} type="checkbox" role="switch" checked={!!checked} disabled={disabled}
          onChange={e => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </span>
    </label>
  );
}

function SettingsNotice({ title, action, onAction, busy }) {
  return (
    <div className="st-notice" role="status">
      <strong className="st-notice-text">{title}</strong>
      {action && <button className="st-notice-btn" onClick={onAction} disabled={busy}>{action}</button>}
    </div>
  );
}

function SettingsIconButton({ icon, label, onClick, tone, disabled }) {
  return (
    <button type="button" className={`st-icon-btn${tone ? ` is-${tone}` : ''}`} aria-label={label} title={label}
      onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={16} strokeWidth={2.2} />
    </button>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
function SettingsScreen({ api, baseApi, competition, members = [], categories = [], me, profile, email,
  planSlots = [], rotationConfig = null, projectTags = [], toolTags = [],
  page = 'root', onNavigate, themePref, onSetThemePref, notificationsEnabled, onSetNotifications,
  onProfile, onSetMain, onSignOut, onCompetitionChanged, onLeft, onToast }) {
  const [penaltyCfg, setPenaltyCfg] = useState(null);
  const [busyModule, setBusyModule] = useState(false);

  // Die Strafregeln lädt nur dieser Screen; nach eigenen Änderungen und beim
  // Öffnen der Strafkonto-Seite neu holen.
  const loadPenalty = React.useCallback(async () => {
    try {
      const c = await api.getPenaltyConfig();
      setPenaltyCfg(c ? { ...c } : null);
    } catch (e) { console.warn('getPenaltyConfig failed', e); }
  }, [api]);
  useEffect(() => { loadPenalty(); }, [loadPenalty]);
  useEffect(() => { if (page === 'penalties') loadPenalty(); }, [page, loadPenalty]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);

  const active = members.filter(m => !m.left_at);
  const owner = active.find(m => m.role === 'owner');
  const isOwner = owner?.user_id === me;
  const ownerName = owner?.profile?.display_name || 'der Ersteller';
  const go = (p) => onNavigate?.(p);
  const back = () => go('root');

  // Modul-Schalter = einzige Ein/Aus-Stelle; die zugehörige Config läuft mit.
  async function setModule(key, value) {
    setBusyModule(true);
    try {
      await baseApi.updateCompetition(competition.id, { [key]: value });
      if (key === 'penalties_enabled') { await api.setPenaltyConfig({ enabled: value }); await loadPenalty(); }
      if (key === 'rotation_enabled') await api.setRotationConfig({ enabled: value });
      onCompetitionChanged?.();
    } catch (e) { alert(e.message); }
    finally { setBusyModule(false); }
  }

  const moduleProps = { api, competition, isOwner, ownerName, busyModule, onModule: setModule, onBack: back, onToast };

  if (page === 'challenge') {
    return <SettingsChallengePage baseApi={baseApi} competition={competition} isOwner={isOwner} ownerName={ownerName}
      onBack={back} onChanged={onCompetitionChanged} onLeft={onLeft} onToast={onToast} />;
  }
  if (page === 'members') {
    return <SettingsMembersPage baseApi={baseApi} competition={competition} members={active} me={me}
      isOwner={isOwner} ownerName={ownerName} onBack={back} onChanged={onCompetitionChanged} onToast={onToast} />;
  }
  if (page === 'plan') {
    return <SettingsPlanPage {...moduleProps} me={me} categories={categories} planSlots={planSlots} rotationConfig={rotationConfig} />;
  }
  if (page === 'penalties') {
    return <SettingsPenaltyPage {...moduleProps} cfg={penaltyCfg} onCfgChanged={loadPenalty} />;
  }
  if (page === 'work') {
    return <SettingsWorkPage {...moduleProps} projectTags={projectTags} toolTags={toolTags} />;
  }

  // Module: rechts An/Aus, darunter der Stand, wenn das Modul an ist.
  const onOff = (v) => v ? 'An' : 'Aus';
  const cycleLength = planSlots.length ? Math.max(...planSlots.map(s => s.week_index)) + 1 : 0;
  const planSub = !competition.rotation_enabled ? null
    : rotationConfig && !rotationConfig.enabled ? 'Pausiert'
    : cycleLength ? `${cycleLength}-Wochen-Zyklus` : 'Leer';
  const rule = ST_PENALTY_RULES.find(r => r.id === penaltyCfg?.rule_mode);
  const penaltySub = !competition.penalties_enabled || !penaltyCfg ? null
    : !penaltyCfg.enabled ? 'Pausiert'
    : `${formatEuro(penaltyCfg.amount_cents)} pro Strafe${rule ? ` · ${rule.name}` : ''}`;
  const tagCount = projectTags.length + toolTags.length;
  const workSub = !competition.work_enabled ? null
    : tagCount ? `${tagCount} ${tagCount === 1 ? 'Tag' : 'Tags'}` : 'Keine Tags';
  const isMain = profile?.main_competition_id === competition.id;

  return (
    <div className="st-screen">
      <SettingsPageHeader title="Einstellungen" />

      {profile && (
        <button className="st-profile" onClick={onProfile}>
          <Avatar profile={profile} size={56} />
          <span className="st-profile-text">
            <span className="st-profile-name">{profile.display_name}</span>
            <span className="st-profile-sub">{email || 'Profil bearbeiten'}</span>
          </span>
          <span className="st-chev"><Icon name="chevron" size={18} /></span>
        </button>
      )}

      <SettingsGroup title="Challenge">
        <SettingsRow emoji={competition.emoji} title={competition.name}
          subtitle={`${modeLabel(competition.mode)} · seit ${stDate(competition.start_date)}${competition.archived_at ? ' · archiviert' : ''}`}
          onClick={() => go('challenge')} chevron />
        <SettingsRow icon="users" title="Teilnehmer & Einladen" value={active.length} onClick={() => go('members')} chevron />
        {!competition.archived_at && onSetMain && (
          <SettingsSwitchRow icon="star" title="Beim App-Start öffnen" checked={isMain}
            onChange={v => onSetMain(v ? competition.id : null)} />
        )}
      </SettingsGroup>

      <SettingsGroup title="Module" footer={isOwner ? null : `Nur ${ownerName} kann Module ändern.`}>
        <SettingsRow icon="calendar" title="Wochenplan" subtitle={planSub} value={onOff(competition.rotation_enabled)}
          onClick={() => go('plan')} chevron />
        <SettingsRow icon="wallet" title="Strafkonto" subtitle={penaltySub} value={onOff(competition.penalties_enabled)}
          onClick={() => go('penalties')} chevron />
        <SettingsRow icon="laptop" title="Work-Tracking" subtitle={workSub} value={onOff(competition.work_enabled)}
          onClick={() => go('work')} chevron />
      </SettingsGroup>

      <SettingsDeviceGroup themePref={themePref} onSetThemePref={onSetThemePref}
        notificationsEnabled={notificationsEnabled} onSetNotifications={onSetNotifications} />

      {api?.mode === 'demo' && window.PTDemo && (
        <SettingsGroup title="Demo">
          <SettingsRow icon="calendar" title="Eine Woche vorspulen" onClick={() => window.PTDemo.shiftWeek()} />
          <SettingsRow icon="refresh" title="Demo zurücksetzen"
            onClick={() => { if (confirm('Alle Demo-Daten neu erzeugen?')) window.PTDemo.reset(); }} />
          <SettingsRow icon="close" title="Demo beenden" onClick={() => window.PTDemo.exit()} />
        </SettingsGroup>
      )}

      <SettingsInfoGroup me={me} competition={competition} />

      {onSignOut && (
        <SettingsGroup>
          <SettingsRow title="Abmelden" tone="danger" onClick={onSignOut} />
        </SettingsGroup>
      )}

      <SettingsDeleteAccountGroup baseApi={baseApi} />
    </div>
  );
}

// ─── Info & Rechtliches ─────────────────────────────────────────────────────
function SettingsInfoGroup({ me, competition }) {
  const O = stLaunch();
  const legal = O.LEGAL || null;
  const appName = O.APP_NAME || 'Benny & Joni';
  const ids = stIds(me, competition?.id);
  const supportUrl = stSupportUrl(`${appName}: Support & Feedback`, `\n\n\n${ids}`);
  const rateUrl = O.APP_STORE_ID ? `itms-apps://apps.apple.com/app/id${O.APP_STORE_ID}?action=write-review` : '';
  const canReport = stCanReport();
  if (!legal && !supportUrl && !rateUrl) return null;

  const report = () => stReport({
    kind: 'problem', label: 'Problem oder Inhalt', userId: me, challengeId: competition?.id,
    note: 'Beschreib kurz, was passiert ist oder welchen Inhalt du meldest:',
  });

  return (
    <SettingsGroup title="Info & Rechtliches">
      {legal?.privacy && <SettingsRow title="Datenschutz" onClick={() => stOpen(legal.privacy)} />}
      {legal?.imprint && <SettingsRow title="Impressum" onClick={() => stOpen(legal.imprint)} />}
      {legal?.terms && <SettingsRow title="Nutzungsbedingungen" onClick={() => stOpen(legal.terms)} />}
      {supportUrl && <SettingsRow title="Support & Feedback" onClick={() => stOpen(supportUrl)} />}
      {canReport && <SettingsRow title="Problem oder Inhalt melden" onClick={report} />}
      {rateUrl && <SettingsRow title="App bewerten" onClick={() => stOpen(rateUrl)} />}
    </SettingsGroup>
  );
}

// ─── Konto löschen (App Store 5.1.1(v)) ─────────────────────────────────────
// Zweimal fragen, dann löschen; danach startet die App neu auf der Startseite.
function SettingsDeleteAccountGroup({ baseApi }) {
  const [busy, setBusy] = useState(false);
  if (typeof baseApi?.deleteAccount !== 'function') return null;

  async function remove() {
    if (!confirm('Dein Profil, alle Sätze, Reaktionen, Strafkonto-Einträge und dein Foto werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.')) return;
    if (!confirm('Konto jetzt wirklich löschen?')) return;
    setBusy(true);
    try {
      await baseApi.deleteAccount();
      window.location.replace(window.location.pathname);
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <SettingsGroup footer="Challenges mit anderen laufen ohne dich weiter.">
      <SettingsRow title={busy ? 'Konto wird gelöscht…' : 'Konto löschen'} tone="danger" disabled={busy} onClick={remove} />
    </SettingsGroup>
  );
}

// ─── App (gerätebezogen) ────────────────────────────────────────────────────
const ST_THEMES = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']];

function SettingsDeviceGroup({ themePref, onSetThemePref, notificationsEnabled, onSetNotifications }) {
  // Erlaubnis über PTPush (onboarding-intro.jsx); beim Zurückkehren aus den
  // iOS-Einstellungen neu prüfen.
  const [perm, setPerm] = useState('unsupported');
  useEffect(() => {
    let alive = true;
    const check = () => window.PTPush?.permission().then(p => { if (alive) setPerm(p); });
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [notificationsEnabled]);
  const native = !!window.PTPushNotifications?.PushNotifications;
  const pushBlocked = notificationsEnabled && perm === 'denied';

  // Einschalten ist der richtige Moment zum Fragen, wenn iOS noch fragen darf.
  async function setPush(on) {
    onSetNotifications(on);
    if (!on || perm !== 'prompt' || !window.PTPush) return;
    const result = await window.PTPush.request();
    setPerm(result);
    window.PTPush.writePrimer(PTOnboarding.nextPrimerState(window.PTPush.readPrimer(), result));
    window.dispatchEvent(new CustomEvent('pt:push-permission', { detail: result }));
  }

  return (
    <SettingsGroup title="App"
      footer={pushBlocked ? (native ? 'In den iOS-Einstellungen ausgeschaltet.' : 'Im Browser blockiert.') : null}>
      <div className="st-row is-stacked">
        <span className="st-row-line">
          <SettingsTile icon="contrast" />
          <span className="st-row-title" id="st-theme-label">Erscheinungsbild</span>
        </span>
        <div className="segmented st-segmented" role="radiogroup" aria-labelledby="st-theme-label">
          {ST_THEMES.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={themePref === value}
              className={themePref === value ? 'active' : ''} onClick={() => onSetThemePref(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <SettingsSwitchRow icon="bell" title="Push-Mitteilungen"
        checked={notificationsEnabled} onChange={setPush} />
      {pushBlocked && native && (
        <SettingsRow icon="settings" title="iOS-Einstellungen öffnen" tone="accent" onClick={() => window.PTPush.openSettings()} />
      )}
    </SettingsGroup>
  );
}

// ─── Unterseite: Challenge ──────────────────────────────────────────────────
function SettingsChallengePage({ baseApi, competition, isOwner, ownerName, onBack, onChanged, onLeft, onToast }) {
  const [name, setName] = useState(competition.name);
  const [emoji, setEmoji] = useState(competition.emoji);
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(competition.name); setEmoji(competition.emoji); }, [competition.name, competition.emoji]);

  async function run(fn, message) {
    setBusy(true);
    try { await fn(); onChanged?.(); if (message) onToast?.(message); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  // Speichert beim Verlassen des Feldes bzw. mit Enter, wie iOS-Einstellungen.
  function save(next = {}) {
    const nextName = (next.name ?? name).trim();
    const nextEmoji = stFirstGrapheme(next.emoji ?? emoji) || competition.emoji;
    if (!nextName) { setName(competition.name); return; }
    setEmoji(nextEmoji);
    if (nextName === competition.name && nextEmoji === competition.emoji) return;
    run(() => baseApi.updateCompetition(competition.id, { name: nextName, emoji: nextEmoji }), 'Gespeichert');
  }

  async function leave() {
    if (!confirm(`„${competition.name}“ verlassen? Deine Sätze bleiben in der Historie.`)) return;
    setBusy(true);
    try { await baseApi.leaveCompetition(competition.id); onLeft?.(); }
    catch (e) { alert(e.message); setBusy(false); }
  }

  const archived = !!competition.archived_at;

  return (
    <div className="st-screen">
      <SettingsPageHeader title="Challenge" onBack={onBack} />

      {isOwner ? (
        <SettingsGroup title="Name & Emoji">
          <div className="st-block">
            <div className="st-edit-row">
              <button type="button" className="st-emoji-btn" aria-label={`Emoji ${emoji} ändern`}
                disabled={busy} onClick={() => setPickingEmoji(true)}>{emoji}</button>
              <input className="input" aria-label="Name" value={name} maxLength={40}
                onChange={e => setName(e.target.value)} onBlur={() => save()}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            </div>
          </div>
        </SettingsGroup>
      ) : (
        <SettingsGroup title="Name & Emoji" footer={`Nur ${ownerName} kann das ändern.`}>
          <SettingsRow emoji={competition.emoji} title={competition.name} />
        </SettingsGroup>
      )}

      <SettingsGroup title="Details">
        <SettingsRow title="Modus" value={modeLabel(competition.mode)} />
        <SettingsRow title="Start" value={stDate(competition.start_date)} />
        <SettingsRow title="Ende" value={competition.end_date ? stDate(competition.end_date) : 'Offen'} />
      </SettingsGroup>

      <SettingsGroup>
        {isOwner && (
          <SettingsRow icon="archive" title={archived ? 'Wieder aktivieren' : 'Challenge archivieren'} disabled={busy}
            onClick={() => run(() => baseApi.updateCompetition(competition.id, { archived_at: archived ? null : new Date().toISOString() }),
              archived ? 'Challenge ist wieder aktiv' : 'Challenge archiviert')} />
        )}
        <SettingsRow title="Challenge verlassen" tone="danger" disabled={busy} onClick={leave} />
      </SettingsGroup>

      {isOwner && (
        <SettingsEmojiSheet open={pickingEmoji} current={emoji} onClose={() => setPickingEmoji(false)}
          onPick={e => { setPickingEmoji(false); save({ emoji: e }); }} />
      )}
    </div>
  );
}

function SettingsEmojiSheet({ open, current, onPick, onClose }) {
  const [custom, setCustom] = useState('');
  useEffect(() => { if (open) setCustom(''); }, [open]);
  const submitCustom = () => { const e = stFirstGrapheme(custom); if (e) onPick(e); };
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="title st-sheet-title">Emoji</h2>
      <div className="st-emoji-grid">
        {COMP_EMOJIS.map(e => (
          <button key={e} type="button" className={`st-emoji-option${e === current ? ' is-active' : ''}`}
            aria-label={`Emoji ${e}`} aria-pressed={e === current} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
      <div className="st-edit-row">
        <input className="input" aria-label="Eigenes Emoji" placeholder="Eigenes Emoji" value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitCustom(); }} />
        <button type="button" className="btn" disabled={!custom.trim()} onClick={submitCustom}>Übernehmen</button>
      </div>
    </Sheet>
  );
}

// ─── Unterseite: Teilnehmer & Einladen ──────────────────────────────────────
function SettingsMembersPage({ baseApi, competition, members, me, isOwner, ownerName, onBack, onChanged, onToast }) {
  const [busy, setBusy] = useState(false);
  const is2v2 = competition.mode === '2v2';

  async function run(fn, message) {
    setBusy(true);
    try { await fn(); onChanged?.(); if (message) onToast?.(message); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const share = async () => { if (await shareInvite(competition) === 'copied') onToast?.('Einladung kopiert'); };
  const regenerate = () => {
    if (!confirm('Neuen Code erzeugen? Der alte Code funktioniert dann nicht mehr.')) return;
    run(() => baseApi.regenerateInviteCode(competition.id), 'Neuer Code erzeugt');
  };
  const remove = (m) => {
    const who = m.profile?.display_name || 'Diese Person';
    if (!confirm(`${who} aus der Challenge entfernen? Die Sätze bleiben in der Historie.`)) return;
    run(() => baseApi.removeMember(competition.id, m.user_id), `${who} entfernt`);
  };
  // Melden per Mail an den Support (Apple 1.2); Name, Nutzer- und Challenge-ID im Text.
  const canReport = stCanReport();
  const report = (m) => stReport({
    kind: 'member', label: 'Person', userId: m.user_id, challengeId: competition.id,
    note: `Gemeldete Person: ${m.profile?.display_name || 'Unbekannt'}\nWas ist passiert?`,
  });

  const memberRow = (m) => {
    const isMe = m.user_id === me;
    return (
      <div key={m.user_id} className="st-row">
        <Avatar profile={m.profile} size={36} />
        <span className="st-row-text">
          <span className="st-row-title">{m.profile?.display_name}{isMe ? ' (du)' : ''}</span>
          {m.role === 'owner' && <span className="st-row-sub">Ersteller</span>}
        </span>
        {is2v2 && (isOwner || isMe) && (
          <div className="segmented segmented-sm st-team-switch" role="radiogroup" aria-label={`Team von ${m.profile?.display_name}`}>
            {['A', 'B'].map(t => (
              <button key={t} type="button" role="radio" aria-checked={m.team === t}
                className={m.team === t ? 'active' : ''} disabled={busy}
                onClick={() => m.team !== t && run(() => baseApi.setMemberTeam(competition.id, m.user_id, t))}>
                {t}
              </button>
            ))}
          </div>
        )}
        {canReport && !isMe && (
          <button type="button" className="st-link" aria-label={`${m.profile?.display_name} melden`}
            onClick={() => report(m)}>Melden</button>
        )}
        {isOwner && !isMe && (
          <SettingsIconButton icon="close" label={`${m.profile?.display_name} entfernen`} tone="danger"
            disabled={busy} onClick={() => remove(m)} />
        )}
      </div>
    );
  };

  const groups = is2v2
    ? ['A', 'B'].map(t => ({ key: t, title: `Team ${t}`, rows: members.filter(m => (m.team || 'A') === t) }))
    : [{ key: 'all', title: `Teilnehmer (${members.length})`, rows: members }];

  return (
    <div className="st-screen">
      <SettingsPageHeader title="Teilnehmer" onBack={onBack} />

      <SettingsGroup title="Einladen">
        <div className="st-block st-invite">
          <div className="st-invite-code mono" aria-label={`Einladungscode ${competition.invite_code}`}>{competition.invite_code}</div>
          <button className="btn st-invite-share" onClick={share}>
            <Icon name="share" size={18} /> Einladung teilen
          </button>
          {isOwner && (
            <button className="st-link" onClick={regenerate} disabled={busy}>Neuen Code erzeugen</button>
          )}
        </div>
      </SettingsGroup>

      {groups.map(g => (
        <SettingsGroup key={g.key} title={g.title}>
          {g.rows.map(memberRow)}
          {!g.rows.length && <SettingsRow title="Noch niemand" />}
        </SettingsGroup>
      ))}
    </div>
  );
}

// ─── Unterseite: Wochenplan ─────────────────────────────────────────────────
function SettingsPlanPage({ api, competition, categories, planSlots, rotationConfig, me,
  isOwner, ownerName, busyModule, onModule, onBack, onToast }) {
  const enabled = !!competition.rotation_enabled;
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const byWeek = useMemo(() => {
    const m = {};
    for (const s of planSlots) (m[s.week_index] ||= []).push(s);
    for (const k in m) m[k].sort((a, b) => (a.position || 0) - (b.position || 0));
    return m;
  }, [planSlots]);
  const cycleLength = planSlots.length ? Math.max(...planSlots.map(s => s.week_index)) + 1 : 0;
  const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
  const currentWeek = useMemo(() => {
    if (!rotationConfig || !planSlots.length) return null;
    const t = PTData.weekTemplateFor({ weekStart, slots: planSlots, config: { ...rotationConfig, enabled: true } });
    return t[0]?.week_in_cycle ?? null;
  }, [rotationConfig, planSlots, weekStart]);

  // Work-Kategorien nur, wenn Work-Tracking an ist.
  const pickable = competition.work_enabled ? categories : categories.filter(c => (c.kind || 'sports') !== 'work');

  // Änderungen lösen über api.onChange ein Neuladen in CompetitionApp aus.
  const call = async (fn) => { try { await fn(); } catch (e) { alert(e.message); } };

  const addSlot = (weekIndex) => call(async () => {
    const week = byWeek[weekIndex] || [];
    const used = new Set(week.map(s => s.category_id));
    const cat = pickable.find(c => !used.has(c.id)) || pickable[0];
    if (!cat) return;
    await api.addPlanSlot({ week_index: weekIndex, category_id: cat.id, start_target: 100, bonus_max: 0, position: week.length });
  });

  const deleteWeek = (weekIndex) => {
    if (!confirm(`Woche ${weekIndex + 1} komplett aus dem Plan entfernen?`)) return;
    call(async () => {
      await Promise.all((byWeek[weekIndex] || []).map(s => api.deletePlanSlot(s.id)));
      // spätere Wochen rücken nach
      await Promise.all(planSlots.filter(s => s.week_index > weekIndex)
        .map(s => api.updatePlanSlot(s.id, { week_index: s.week_index - 1 })));
    });
  };

  const applyToCurrentWeek = () => {
    const template = PTData.weekTemplateFor({ weekStart, slots: planSlots, config: { ...rotationConfig, enabled: true } });
    if (!template.length) return;
    if (!confirm('Ziele dieser Woche auf die Vorschläge setzen?')) return;
    call(async () => {
      const thisWeek = (await api.listChallenges()).filter(c => c.week_start === weekStart);
      for (const t of template) {
        const match = thisWeek.find(c => c.category_id === t.category_id);
        await api.upsertChallenge(match
          ? { id: match.id, week_start: weekStart, category_id: t.category_id, chosen_by: match.chosen_by, target_reps: t.base_reps }
          : { week_start: weekStart, category_id: t.category_id, chosen_by: me, target_reps: t.base_reps });
      }
      onToast?.('Woche auf Vorschläge gesetzt');
    });
  };

  return (
    <div className="st-screen">
      <SettingsPageHeader title="Wochenplan" onBack={onBack} />

      <SettingsGroup footer={isOwner ? null : `Nur ${ownerName} kann das ändern.`}>
        <SettingsSwitchRow icon="calendar" title="Wochenplan verwenden" checked={enabled}
          disabled={!isOwner || busyModule} onChange={v => onModule('rotation_enabled', v)} />
      </SettingsGroup>

      {enabled && rotationConfig && !rotationConfig.enabled && (
        <SettingsNotice title="Vorschläge pausiert"
          action="Fortsetzen" onAction={() => call(() => api.setRotationConfig({ enabled: true }))} />
      )}

      {enabled && cycleLength === 0 && (
        <div className="st-empty">
          <SettingsTile icon="calendar" />
          <div className="st-empty-title">Noch keine Woche geplant</div>
          <button className="btn" onClick={() => addSlot(0)}>Erste Woche anlegen</button>
        </div>
      )}

      {enabled && cycleLength > 0 && <>
        {Array.from({ length: cycleLength }, (_, w) => {
          const slots = byWeek[w] || [];
          return (
            <SettingsGroup key={w}
              title={<>Woche {w + 1}{currentWeek === w && <span className="st-badge">Diese Woche</span>}</>}
              action={<SettingsIconButton icon="trash" label={`Woche ${w + 1} löschen`} onClick={() => deleteWeek(w)} />}>
              {slots.map(slot => (
                <PlanSlotRow key={slot.id} slot={slot} catById={catById}
                  categories={pickable.some(c => c.id === slot.category_id) || !catById[slot.category_id] ? pickable : [catById[slot.category_id], ...pickable]}
                  usedInWeek={slots.filter(s => s.id !== slot.id).map(s => s.category_id)}
                  onChange={patch => call(() => api.updatePlanSlot(slot.id, patch))}
                  onDelete={() => confirm('Diese Übung aus dem Plan entfernen?') && call(() => api.deletePlanSlot(slot.id))} />
              ))}
              <SettingsRow icon="plus" tone="accent" title="Übung hinzufügen" onClick={() => addSlot(w)} chevron={false} />
            </SettingsGroup>
          );
        })}

        <SettingsGroup>
          <SettingsRow icon="plus" tone="accent" title={`Woche ${cycleLength + 1} hinzufügen`} onClick={() => addSlot(cycleLength)} chevron={false} />
          {rotationConfig?.enabled && (
            <SettingsRow icon="refresh" title="Diese Woche auf Vorschläge setzen" onClick={applyToCurrentWeek} chevron={false} />
          )}
        </SettingsGroup>
      </>}
    </div>
  );
}

// Eine Übung im Wochenplan: Kategorie + Reps-Spanne (start_target … start_target + bonus_max).
function PlanSlotRow({ slot, catById, categories, usedInWeek, onChange, onDelete }) {
  const cat = catById[slot.category_id];
  const used = new Set(usedInWeek);
  const workout = PTData.isWorkoutType(cat?.challenge_type);
  const unit = cat?.kind === 'work' ? 'min' : 'Reps';
  const [base, setBase] = useState(String(slot.start_target));
  const [max, setMax] = useState(String(slot.start_target + (slot.bonus_max || 0)));
  useEffect(() => { setBase(String(slot.start_target)); }, [slot.start_target]);
  useEffect(() => { setMax(String(slot.start_target + (slot.bonus_max || 0))); }, [slot.start_target, slot.bonus_max]);

  const commitBase = () => {
    const v = Math.max(1, parseInt(base) || 1);
    const m = Math.max(v, parseInt(max) || v);
    const patch = {};
    if (v !== slot.start_target) patch.start_target = v;
    if (m - v !== (slot.bonus_max || 0)) patch.bonus_max = m - v;
    if (Object.keys(patch).length) onChange(patch);
    setBase(String(v));
    setMax(String(m));
  };
  const commitMax = () => {
    const v = parseInt(base) || 1;
    const m = Math.max(v, parseInt(max) || v);
    if (m - v !== (slot.bonus_max || 0)) onChange({ bonus_max: m - v });
    setMax(String(m));
  };
  const numProps = {
    className: 'input st-num mono', type: 'number', inputMode: 'numeric', min: 1,
    onFocus: e => e.target.select(),
    onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); },
  };

  return (
    <div className="st-row st-slot">
      <SettingsTile emoji={cat?.emoji || '?'} />
      <div className="st-slot-main">
        <label className="st-select">
          <select value={slot.category_id || ''} aria-label="Übung" onChange={e => onChange({ category_id: e.target.value })}>
            {!cat && <option value="">Unbekannt</option>}
            {categories.map(c => (
              <option key={c.id} value={c.id} disabled={used.has(c.id)}>{c.name}</option>
            ))}
          </select>
          <span className="st-select-caret"><Icon name="chevron" size={14} strokeWidth={2.5} /></span>
        </label>
        {workout ? (
          <span className="st-row-sub">Pflicht-Workout</span>
        ) : (
          <div className="st-range">
            <input {...numProps} aria-label={`${cat?.name || 'Übung'}: Vorschlag von`} value={base}
              onChange={e => setBase(e.target.value)} onBlur={commitBase} />
            <span>bis</span>
            <input {...numProps} aria-label={`${cat?.name || 'Übung'}: Vorschlag bis`} value={max}
              onChange={e => setMax(e.target.value)} onBlur={commitMax} />
            <span>{unit}</span>
          </div>
        )}
      </div>
      <SettingsIconButton icon="close" label={`${cat?.name || 'Übung'} entfernen`} onClick={onDelete} />
    </div>
  );
}

// ─── Unterseite: Strafkonto ─────────────────────────────────────────────────
function SettingsPenaltyPage({ api, competition, cfg, isOwner, ownerName, busyModule, onModule, onCfgChanged, onBack, onToast }) {
  const enabled = !!competition.penalties_enabled;
  const [amount, setAmount] = useState(cfg ? stEuroInput(cfg.amount_cents) : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg) setAmount(stEuroInput(cfg.amount_cents)); }, [cfg?.amount_cents]);

  async function patch(p, message) {
    setBusy(true);
    try { await api.setPenaltyConfig(p); await onCfgChanged(); if (message) onToast?.(message); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const commitAmount = () => {
    const eur = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) { setAmount(stEuroInput(cfg.amount_cents)); return; }
    const cents = Math.round(eur * 100);
    setAmount(stEuroInput(cents));
    if (cents !== cfg.amount_cents) patch({ amount_cents: cents }, 'Betrag gespeichert');
  };

  return (
    <div className="st-screen">
      <SettingsPageHeader title="Strafkonto" onBack={onBack} />

      <SettingsGroup footer={isOwner ? null : `Nur ${ownerName} kann das ändern.`}>
        <SettingsSwitchRow icon="wallet" title="Strafkonto verwenden" checked={enabled}
          disabled={!isOwner || busyModule} onChange={v => onModule('penalties_enabled', v)} />
      </SettingsGroup>

      {enabled && cfg && <>
        {!cfg.enabled && (
          <SettingsNotice title="Strafen pausiert"
            action="Einschalten" busy={busy} onAction={() => patch({ enabled: true }, 'Strafen eingeschaltet')} />
        )}

        <SettingsGroup title="Betrag">
          <label className="st-row">
            <span className="st-row-text"><span className="st-row-title">Pro Strafe</span></span>
            <span className="st-amount">
              <input className="input st-num mono" type="text" inputMode="decimal" aria-label="Betrag pro Strafe in Euro"
                value={amount} disabled={busy}
                onFocus={e => e.target.select()}
                onChange={e => setAmount(e.target.value)}
                onBlur={commitAmount}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
              <span>€</span>
            </span>
          </label>
        </SettingsGroup>

        <SettingsGroup title="Regel">
          <div className="st-choices" role="radiogroup" aria-label="Strafregel">
            {ST_PENALTY_RULES.map(r => {
              const selected = cfg.rule_mode === r.id;
              return (
                <button key={r.id} type="button" role="radio" aria-checked={selected} disabled={busy}
                  className={`st-row st-choice${selected ? ' is-selected' : ''}`}
                  onClick={() => !selected && patch({ rule_mode: r.id }, 'Regel gespeichert')}>
                  <span className="st-row-text">
                    <span className="st-row-title">{r.name}</span>
                    <span className="st-row-sub">{r.desc}</span>
                  </span>
                  <span className="st-check" aria-hidden="true">{selected && <Icon name="check" size={18} strokeWidth={2.5} />}</span>
                </button>
              );
            })}
          </div>
        </SettingsGroup>
      </>}
    </div>
  );
}

// ─── Unterseite: Work-Tracking ──────────────────────────────────────────────
function SettingsWorkPage({ api, competition, projectTags, toolTags, isOwner, ownerName, busyModule, onModule, onBack }) {
  const enabled = !!competition.work_enabled;
  return (
    <div className="st-screen">
      <SettingsPageHeader title="Work-Tracking" onBack={onBack} />

      <SettingsGroup footer={isOwner ? null : `Nur ${ownerName} kann das ändern.`}>
        <SettingsSwitchRow icon="laptop" title="Work-Tracking verwenden" checked={enabled}
          disabled={!isOwner || busyModule} onChange={v => onModule('work_enabled', v)} />
      </SettingsGroup>

      {enabled && <>
        <TagList title="Projekte" addLabel="Projekt hinzufügen" defaultEmoji="📁" tags={projectTags}
          onAdd={(n, e) => api.addProjectTag(n, e)}
          onUpdate={(id, p) => api.updateProjectTag(id, p)}
          onDelete={(id) => api.deleteProjectTag(id)} />
        <TagList title="Tools" addLabel="Tool hinzufügen" defaultEmoji="🔧" tags={toolTags}
          onAdd={(n, e) => api.addToolTag(n, e)}
          onUpdate={(id, p) => api.updateToolTag(id, p)}
          onDelete={(id) => api.deleteToolTag(id)} />
      </>}
    </div>
  );
}

// Tags anlegen, umbenennen, löschen. Ein Tipp auf die Zeile öffnet die Bearbeitung.
function TagList({ title, tags, addLabel, defaultEmoji, onAdd, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null); // Tag-ID, 'new' oder null
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState(defaultEmoji);
  const [busy, setBusy] = useState(false);

  const startEdit = (t) => { setEditingId(t.id); setDraftName(t.name); setDraftEmoji(t.emoji); };
  const startNew = () => { setEditingId('new'); setDraftName(''); setDraftEmoji(defaultEmoji); };

  async function run(fn) {
    setBusy(true);
    try { await fn(); setEditingId(null); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  const commit = () => {
    const name = draftName.trim();
    if (!name) return;
    const emoji = stFirstGrapheme(draftEmoji) || defaultEmoji;
    run(() => editingId === 'new' ? onAdd(name, emoji) : onUpdate(editingId, { name, emoji }));
  };
  const remove = () => {
    const tag = tags.find(t => t.id === editingId);
    if (tag && confirm(`„${tag.name}“ löschen?`)) run(() => onDelete(tag.id));
  };

  const form = (
    <div className="st-row st-tag-form" key={`form-${editingId}`}>
      <input className="input st-emoji-input" aria-label="Emoji" value={draftEmoji} maxLength={8}
        onChange={e => setDraftEmoji(e.target.value)} />
      <input className="input" aria-label="Name" placeholder="Name" autoFocus value={draftName}
        onChange={e => setDraftName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingId(null); }} />
      <SettingsIconButton icon="check" label="Speichern" tone="primary" disabled={busy || !draftName.trim()} onClick={commit} />
      {editingId !== 'new' && <SettingsIconButton icon="trash" label="Löschen" tone="danger" disabled={busy} onClick={remove} />}
      <SettingsIconButton icon="close" label="Abbrechen" disabled={busy} onClick={() => setEditingId(null)} />
    </div>
  );

  return (
    <SettingsGroup title={title}>
      {tags.map(t => editingId === t.id ? form : (
        <SettingsRow key={t.id} emoji={t.emoji} title={t.name} onClick={() => startEdit(t)} chevron={false}>
          <span className="st-chev"><Icon name="edit" size={16} /></span>
        </SettingsRow>
      ))}
      {editingId === 'new'
        ? form
        : <SettingsRow icon="plus" tone="accent" title={addLabel} onClick={startNew} chevron={false} />}
    </SettingsGroup>
  );
}

// Card on Home: the first person of the week picks the reps for every exercise.
// Default = base_reps, range = [base_reps, base_reps + bonus_max].
function WeekFixCard({ template, categories, me, onFix, onDismiss, title, sub }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const t of template) initial[t.slot_id] = t.base_reps;
    return initial;
  });
  const [busy, setBusy] = useState(false);
  if (!template?.length) return null;

  const step = (n) => n < 30 ? 1 : n < 100 ? 5 : 10;
  const bump = (t, dir) => {
    const cur = values[t.slot_id] ?? t.base_reps;
    const next = Math.max(1, cur + dir * step(cur));
    setValues({ ...values, [t.slot_id]: next });
  };
  const setExact = (t, raw) => {
    const v = parseInt(raw);
    if (!Number.isFinite(v) || v < 1) return;
    setValues({ ...values, [t.slot_id]: v });
  };

  const fix = async () => {
    setBusy(true);
    try { await onFix(template.map(t => ({ category_id: t.category_id, target_reps: values[t.slot_id] ?? t.base_reps }))); }
    finally { setBusy(false); }
  };

  return (
    <div className="weekfix-card">
      <div className="weekfix-head">
        <div>
          <div className="weekfix-label">Neue Woche</div>
          <div className="weekfix-title">{title || 'Reps für diese Woche fixieren'}</div>
          <div className="weekfix-sub">{sub || 'Wer zuerst da ist, setzt das Ziel für alle.'}</div>
        </div>
        {onDismiss && (
          <button className="weekfix-dismiss" aria-label="Später" onClick={onDismiss}>×</button>
        )}
      </div>
      <div className="weekfix-list">
        {template.map(t => {
          const cat = catById[t.category_id];
          const cur = values[t.slot_id] ?? t.base_reps;
          const isObligatory = cat?.challenge_type === 'tom_holland' || cat?.challenge_type === 'bring_sally_up';
          return (
            <div className="weekfix-item" key={t.slot_id}>
              <div className="weekfix-item-head">
                <span className="weekfix-item-emoji">{cat?.emoji || '?'}</span>
                <span className="weekfix-item-name">{cat?.name || 'Unbekannt'}</span>
                {isObligatory && <span className="weekfix-pflicht-badge">PFLICHT</span>}
              </div>
              {isObligatory ? (
                <div className="weekfix-range weekfix-range-fixed" style={{textAlign:'center',padding:'10px 0'}}>Wird jede Woche gemacht</div>
              ) : (
                <>
                  <div className="weekfix-stepper">
                    <button className="weekfix-step" disabled={cur <= 1}
                      onClick={() => bump(t, -1)} aria-label="weniger">−</button>
                    <input className="weekfix-val mono" type="number" inputMode="numeric"
                      value={cur}
                      onFocus={e => e.target.select()}
                      onChange={e => setExact(t, e.target.value)}/>
                    <button className="weekfix-step"
                      onClick={() => bump(t, 1)} aria-label="mehr">+</button>
                  </div>
                  <div className="weekfix-range weekfix-range-fixed">Vorschlag: {t.base_reps}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <button className={`btn weekfix-cta ${busy?'is-loading':''}`} disabled={busy} onClick={fix}>
        {busy ? 'Wird gesetzt…' : 'Woche starten'}
      </button>
    </div>
  );
}

Object.assign(window, { SettingsScreen, PlanSlotRow, TagList, WeekFixCard });
