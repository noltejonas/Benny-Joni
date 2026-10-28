/* global React, PTData, PTRanking, PTOnboarding, Icon, Avatar, Sheet, modeLabel, shareInvite, formatEuro, COMP_EMOJIS, tr, trn, trc, PTi18n */
// Einstellungen im iOS-Stil: Startseite mit Gruppen, je Thema eine Unterseite.
// Welche Seite offen ist, steuert CompetitionApp (`page`/`onNavigate`), damit
// z. B. das Zahnrad im Strafkonto direkt die Strafregeln öffnet.
//
// Rechte wie in der Datenbank: Name, Emoji, Module, Code erneuern, Archivieren
// und Entfernen nur für den Ersteller; Wochenplan, Strafregeln und Tags für alle.
const { useState, useEffect, useMemo } = React;

const ST_PENALTY_RULES = [
  { id: 'per_week_aggregate', name: tr('Wochensumme'), desc: tr('Alle Übungen zusammen unter deinem Anteil') },
  { id: 'per_challenge', name: tr('Pro Übung'), desc: tr('Eine Strafe je verfehlter Übung') },
  { id: 'per_week_any', name: tr('Mindestens eine verfehlt'), desc: tr('Eine Strafe pro Woche') },
  { id: 'per_week_all', name: tr('Alle verfehlt'), desc: tr('Nur wenn gar nichts geschafft ist') },
];

function stDate(iso) {
  return PTi18n.day(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Erstes sichtbares Zeichen, damit auch Emojis aus mehreren Codepoints (🏋️) passen.
function stFirstGrapheme(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    if (Intl.Segmenter) return new Intl.Segmenter(PTi18n.locale).segment(s)[Symbol.iterator]().next().value.segment;
  } catch (e) {}
  return Array.from(s)[0];
}

// Euro-Zeichen vor dem Betrag (en: €5) oder dahinter (de: 5 €)
const ST_EURO_FIRST = /^\D/.test(PTi18n.euro(500).trim());

// 500 → "5", 250 → "2,50" (Englisch "2.50"); Dezimalzeichen der App-Sprache
function stEuroInput(cents) {
  const digits = cents % 100 === 0 ? 0 : 2;
  return PTi18n.number(cents / 100, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}

// ─── Rechtliches, Support, Melden ───────────────────────────────────────────
// Adressen und Links stehen zentral in PTOnboarding (APP_NAME, LEGAL, SUPPORT_EMAIL,
// APP_REVIEW_URL). Fehlt etwas davon, bleibt die jeweilige Zeile weg.
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
  [userId && tr('Nutzer-ID: {id}', { id: userId }), challengeId && tr('Challenge-ID: {id}', { id: challengeId })].filter(Boolean).join('\n');

function stCanReport() {
  const O = stLaunch();
  return typeof O.reportContent === 'function' || !!stSupportUrl('-', '-');
}

// Meldung per Mail (Apple 1.2). `label` landet im Betreff, wenn wir die Mail selbst bauen.
function stReport({ kind, label, userId, challengeId, note }) {
  const O = stLaunch();
  if (typeof O.reportContent === 'function') { O.reportContent({ kind, userId, challengeId, note }); return; }
  stOpen(stSupportUrl(tr('Meldung: {label}', { label }), `${note}\n\n\n${stIds(userId, challengeId)}`));
}

// ─── Bausteine ──────────────────────────────────────────────────────────────
function SettingsPageHeader({ title, onBack }) {
  return (
    <header className="st-head">
      {onBack && (
        <button className="st-back" onClick={onBack}>
          <span className="st-back-icon"><Icon name="chevron" size={20} strokeWidth={2.5} /></span>
          {tr('Einstellungen')}
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
  onProfile, onProfileChanged, onSetMain, onSignOut, onCompetitionChanged, onLeft, onToast }) {
  const [penaltyCfg, setPenaltyCfg] = useState(null);
  const [busyModule, setBusyModule] = useState(false);
  const [rankingAdmin, setRankingAdmin] = useState(false);
  const [busyRanking, setBusyRanking] = useState(false);
  const [busyKickPreference, setBusyKickPreference] = useState(false);
  const kickAvailable = typeof profile?.kick_enabled === 'boolean' && typeof baseApi.setKickEnabled === 'function';
  useEffect(() => {
    let off = false;
    baseApi.isRankingAdmin?.().then(v => { if (!off) setRankingAdmin(!!v); }).catch(() => {});
    return () => { off = true; };
  }, [baseApi]);

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
  const ownerName = owner?.profile?.display_name || tr('der Ersteller');
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
      isOwner={isOwner} ownerName={ownerName} canKick={kickAvailable && !competition.archived_at}
      onBack={back} onChanged={onCompetitionChanged} onToast={onToast} />;
  }
  if (page === 'plan') {
    return <SettingsPlanPage {...moduleProps} me={me} categories={categories} planSlots={planSlots} rotationConfig={rotationConfig} />;
  }
  if (page === 'penalties') {
    return <SettingsPenaltyPage {...moduleProps} cfg={penaltyCfg} onCfgChanged={loadPenalty} />;
  }
  if (page === 'language') {
    return <SettingsLanguagePage onBack={back} />;
  }
  if (page === 'colors') {
    return <SettingsColorsPage onBack={back} />;
  }
  if (page === 'blocks') {
    return <SettingsBlocksPage baseApi={baseApi} onBack={back} onToast={onToast} />;
  }
  if (page === 'reports' && rankingAdmin) {
    return <SettingsReportsPage baseApi={baseApi} onBack={back} onToast={onToast} />;
  }

  async function setRanking(on) {
    setBusyRanking(true);
    try {
      onProfileChanged?.(await baseApi.setRankingOptIn(on));
      onToast?.(on ? tr('Du bist in der Rangliste') : tr('Du bist raus aus der Rangliste'));
    }
    catch (e) { alert(e.message); }
    finally { setBusyRanking(false); }
  }
  async function setKickPreference(on) {
    if (!kickAvailable || busyKickPreference) return;
    setBusyKickPreference(true);
    try {
      onProfileChanged?.(await baseApi.setKickEnabled(on));
      onToast?.(on ? tr('Arschkicks sind an 🍑') : tr('Arschkicks sind ausgeschaltet'));
    } catch (e) { alert(e.message); }
    finally { setBusyKickPreference(false); }
  }
  // Module: rechts An/Aus, darunter der Stand, wenn das Modul an ist.
  const onOff = (v) => v ? tr('An') : tr('Aus');
  const cycleLength = planSlots.length ? Math.max(...planSlots.map(s => s.week_index)) + 1 : 0;
  const planSub = !competition.rotation_enabled ? null
    : rotationConfig && !rotationConfig.enabled ? tr('Pausiert')
    : cycleLength ? tr('{n}-Wochen-Zyklus', { n: cycleLength }) : tr('Leer');
  const rule = ST_PENALTY_RULES.find(r => r.id === penaltyCfg?.rule_mode);
  const penaltySub = !competition.penalties_enabled || !penaltyCfg ? null
    : !penaltyCfg.enabled ? tr('Pausiert')
    : tr('{amount} pro Strafe', { amount: formatEuro(penaltyCfg.amount_cents) }) + (rule ? ` · ${rule.name}` : '');
  const isMain = profile?.main_competition_id === competition.id;

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Einstellungen')} />

      {profile && (
        <button className="st-profile" onClick={onProfile}>
          <Avatar profile={profile} size={56} />
          <span className="st-profile-text">
            <span className="st-profile-name">{profile.display_name}</span>
            <span className="st-profile-sub">{email || tr('Profil bearbeiten')}</span>
          </span>
          <span className="st-chev"><Icon name="chevron" size={18} /></span>
        </button>
      )}

      <SettingsGroup title={tr('Challenge')}>
        <SettingsRow emoji={competition.emoji} title={competition.name}
          subtitle={`${modeLabel(competition.mode)} · ${tr('seit {date}', { date: stDate(competition.start_date) })}${competition.archived_at ? ` · ${tr('archiviert')}` : ''}`}
          onClick={() => go('challenge')} chevron />
        <SettingsRow icon="users" title={tr('Teilnehmer & Einladen')} value={active.length} onClick={() => go('members')} chevron />
        {!competition.archived_at && onSetMain && (
          <SettingsSwitchRow icon="star" title={tr('Beim App-Start öffnen')} checked={isMain}
            onChange={v => onSetMain(v ? competition.id : null)} />
        )}
      </SettingsGroup>

      <SettingsGroup title={tr('Module')} footer={isOwner ? null : tr('Nur {name} kann Module ändern.', { name: ownerName })}>
        <SettingsRow icon="calendar" title={tr('Wochenplan')} subtitle={planSub} value={onOff(competition.rotation_enabled)}
          onClick={() => go('plan')} chevron />
        <SettingsRow icon="wallet" title={tr('Strafkonto')} subtitle={penaltySub} value={onOff(competition.penalties_enabled)}
          onClick={() => go('penalties')} chevron />
      </SettingsGroup>

      <SettingsGroup title={tr('Rangliste')}>
        <SettingsSwitchRow icon="trophy" title={tr('In der Rangliste erscheinen')}
          subtitle={profile?.ranking_opt_in == null ? tr('Noch nicht entschieden') : null}
          checked={profile?.ranking_opt_in === true} disabled={busyRanking} onChange={setRanking} />
        <SettingsRow icon="users" title={tr('Blockiert')} onClick={() => go('blocks')} chevron />
        {rankingAdmin && <SettingsRow icon="bell" title={tr('Meldungen prüfen')} onClick={() => go('reports')} chevron />}
      </SettingsGroup>

      <SettingsDeviceGroup themePref={themePref} onSetThemePref={onSetThemePref} onLanguage={() => go('language')} onColors={() => go('colors')}
        notificationsEnabled={notificationsEnabled} onSetNotifications={onSetNotifications}
        kickAvailable={kickAvailable} kickEnabled={profile?.kick_enabled}
        onSetKickEnabled={setKickPreference} kickBusy={busyKickPreference} />

      {api?.mode === 'demo' && window.PTDemo && (
        <SettingsGroup title={tr('Demo')}>
          <SettingsRow icon="calendar" title={tr('Eine Woche vorspulen')} onClick={() => window.PTDemo.shiftWeek()} />
          <SettingsRow icon="refresh" title={tr('Demo zurücksetzen')}
            onClick={() => { if (confirm(tr('Alle Demo-Daten neu erzeugen?'))) window.PTDemo.reset(); }} />
          <SettingsRow icon="close" title={tr('Demo beenden')} onClick={() => window.PTDemo.exit()} />
        </SettingsGroup>
      )}

      <SettingsInfoGroup me={me} competition={competition} />

      {onSignOut && (
        <SettingsGroup>
          <SettingsRow title={tr('Abmelden')} tone="danger" onClick={onSignOut} />
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
  const supportUrl = stSupportUrl(tr('{app}: Support & Feedback', { app: appName }), `\n\n\n${ids}`);
  const rateUrl = O.APP_REVIEW_URL || '';
  const canReport = stCanReport();
  if (!legal && !supportUrl && !rateUrl) return null;

  const report = () => stReport({
    kind: 'problem', label: tr('Problem oder Inhalt'), userId: me, challengeId: competition?.id,
    note: tr('Beschreib kurz, was passiert ist oder welchen Inhalt du meldest:'),
  });

  return (
    <SettingsGroup title={tr('Info & Rechtliches')}>
      {legal?.privacy && <SettingsRow title={tr('Datenschutz')} onClick={() => stOpen(legal.privacy)} />}
      {legal?.imprint && <SettingsRow title={tr('Impressum')} onClick={() => stOpen(legal.imprint)} />}
      {legal?.terms && <SettingsRow title={tr('Nutzungsbedingungen')} onClick={() => stOpen(legal.terms)} />}
      {supportUrl && <SettingsRow title={tr('Support & Feedback')} onClick={() => stOpen(supportUrl)} />}
      {canReport && <SettingsRow title={tr('Problem oder Inhalt melden')} onClick={report} />}
      {rateUrl && <SettingsRow title={tr('App bewerten')} onClick={() => stOpen(rateUrl)} />}
    </SettingsGroup>
  );
}

// ─── Konto löschen (App Store 5.1.1(v)) ─────────────────────────────────────
// Zweimal fragen, dann löschen; danach startet die App neu auf der Startseite.
function SettingsDeleteAccountGroup({ baseApi }) {
  const [busy, setBusy] = useState(false);
  if (typeof baseApi?.deleteAccount !== 'function') return null;

  async function remove() {
    if (!confirm(tr('Dein Profil, alle Sätze, Reaktionen, Strafkonto-Einträge und dein Foto werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.'))) return;
    if (!confirm(tr('Konto jetzt wirklich löschen?'))) return;
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
    <SettingsGroup footer={tr('Challenges mit anderen laufen ohne dich weiter.')}>
      <SettingsRow title={busy ? tr('Konto wird gelöscht…') : tr('Konto löschen')} tone="danger" disabled={busy} onClick={remove} />
    </SettingsGroup>
  );
}

// ─── Unterseite: Blockiert ──────────────────────────────────────────────────
function SettingsBlocksPage({ baseApi, onBack, onToast }) {
  const [rows, setRows] = useState(null);
  const load = React.useCallback(() => baseApi.myBlocks().then(setRows).catch(() => setRows([])), [baseApi]);
  useEffect(() => { load(); }, [load]);
  async function unblock(r) {
    try { await baseApi.setBlock(r.user_id, false); onToast?.(tr('{name} entblockt', { name: r.display_name })); load(); }
    catch (e) { alert(e.message); }
  }
  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Blockiert')} onBack={onBack} />
      <SettingsGroup footer={tr('Blockierte erscheinen für dich in der Rangliste ohne Name und Bild.')}>
        {rows === null ? <SettingsRow title="…" />
          : !rows.length ? <SettingsRow title={tr('Niemand blockiert')} />
          : rows.map(r => (
            <div key={r.user_id} className="st-row">
              <Avatar profile={{ id: r.user_id, display_name: r.display_name, avatar_url: r.avatar_url, color: r.color }} size={36} />
              <span className="st-row-text"><span className="st-row-title">{r.display_name}</span></span>
              <button className="st-link" onClick={() => unblock(r)}>{tr('Entblocken')}</button>
            </div>
          ))}
      </SettingsGroup>
    </div>
  );
}

// ─── Unterseite: Meldungen (nur Admins) ─────────────────────────────────────
function SettingsReportsPage({ baseApi, onBack, onToast }) {
  const [rows, setRows] = useState(null);
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = React.useCallback(async () => {
    try {
      const [r, c] = await Promise.all([baseApi.rankingReportsOpen(), baseApi.getRankedCategories()]);
      setRows(r); setCats(c);
    } catch (e) { alert(e.message); setRows([]); }
  }, [baseApi]);
  useEffect(() => { load(); }, [load]);
  async function resolve(r, resolution) {
    setBusy(true);
    try {
      await baseApi.resolveRankingReports({ userId: r.user_id, reason: r.reason, categoryId: r.category_id, month: r.month, resolution });
      onToast?.(resolution === 'ok' ? tr('Freigegeben') : tr('Entfernt'));
      load();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  const what = (r) => {
    if (r.reason === 'profile') return tr('Name oder Bild');
    const c = cats.find(x => x.id === r.category_id);
    return tr('Werte · {name}, {month}', { name: c?.name || tr('Übung'), month: r.month ? PTRanking.monthLabel(r.month) : '' });
  };
  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Meldungen')} onBack={onBack} />
      <SettingsGroup footer={tr('Ab drei Meldungen ist ein Eintrag ausgeblendet, bis ihr entscheidet. „Entfernen“ nimmt den Eintrag bzw. bei Profil-Meldungen die Person ganz aus der Rangliste und löscht das Profilbild.')}>
        {rows === null ? <SettingsRow title="…" />
          : !rows.length ? <SettingsRow title={tr('Keine offenen Meldungen')} />
          : rows.map(r => (
            <div key={`${r.user_id}-${r.reason}-${r.category_id}-${r.month}`} className="st-row st-report">
              <Avatar profile={{ id: r.user_id, display_name: r.display_name, avatar_url: r.avatar_url, color: r.color }} size={36} />
              <span className="st-row-text">
                <span className="st-row-title">{r.display_name}</span>
                <span className="st-row-sub">{r.hidden
                  ? tr('{what} · {n}× gemeldet · ausgeblendet', { what: what(r), n: r.reporters })
                  : tr('{what} · {n}× gemeldet', { what: what(r), n: r.reporters })}</span>
              </span>
              <span className="st-report-actions">
                <button className="st-link" disabled={busy} onClick={() => resolve(r, 'ok')}>{tr('In Ordnung')}</button>
                <button className="st-link is-danger" disabled={busy} onClick={() => resolve(r, 'removed')}>{tr('Entfernen')}</button>
              </span>
            </div>
          ))}
      </SettingsGroup>
    </div>
  );
}

// ─── App (gerätebezogen) ────────────────────────────────────────────────────
const ST_THEMES = [['system', tr('System')], ['light', tr('Hell')], ['dark', tr('Dunkel')]];

function SettingsDeviceGroup({ themePref, onSetThemePref, onLanguage, onColors, notificationsEnabled, onSetNotifications,
  kickAvailable, kickEnabled, onSetKickEnabled, kickBusy }) {
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

  // Google verlangt in EU/EWR, UK und der Schweiz einen Weg zurück zur
  // Werbe-Einwilligung (www/ads.js meldet das über pt:ads-change).
  const [adsPrivacy, setAdsPrivacy] = useState(() => !!window.PTAds?.privacyOptionsRequired());
  useEffect(() => {
    const onChange = () => setAdsPrivacy(!!window.PTAds?.privacyOptionsRequired());
    onChange();
    window.addEventListener('pt:ads-change', onChange);
    return () => window.removeEventListener('pt:ads-change', onChange);
  }, []);

  return (
    <SettingsGroup title={tr('App')}
      footer={pushBlocked ? (native ? tr('In den iOS-Einstellungen ausgeschaltet.') : tr('Im Browser blockiert.')) : null}>
      <div className="st-row is-stacked">
        <span className="st-row-line">
          <SettingsTile icon="contrast" />
          <span className="st-row-title" id="st-theme-label">{tr('Erscheinungsbild')}</span>
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
      <SettingsRow icon="palette" title={tr('Farben')} value={stPaletteLabel(window.PTTheme?.read())} onClick={onColors} chevron />
      <SettingsRow icon="globe" title={tr('Sprache')} value={stLanguageName(PTi18n.lang)} onClick={onLanguage} chevron />
      <SettingsSwitchRow icon="bell" title={tr('Push-Mitteilungen')}
        checked={notificationsEnabled} onChange={setPush} />
      {kickAvailable && (
        <SettingsSwitchRow icon="flame" title={tr('Arschkicks empfangen')}
          subtitle={tr('Lustige Motivationssprüche von deinen Mitspielern. Höchstens drei pro Tag.')}
          checked={kickEnabled} disabled={kickBusy} onChange={onSetKickEnabled} />
      )}
      {pushBlocked && native && (
        <SettingsRow icon="settings" title={tr('iOS-Einstellungen öffnen')} tone="accent" onClick={() => window.PTPush.openSettings()} />
      )}
      {adsPrivacy && (
        <SettingsRow icon="shield" title={tr('Werbe-Einwilligung')} subtitle={tr('Auswahl ändern oder widerrufen')}
          onClick={() => window.PTAds?.showPrivacyOptions()} />
      )}
    </SettingsGroup>
  );
}

// ─── Unterseite: Farben ─────────────────────────────────────────────────────
// Paletten und eigene Farben aus theme.js (PTTheme). Gilt pro Gerät und sofort;
// die App hört auf „pt:colors“ und setzt auch die Statusleistenfarbe.
const ST_PALETTE_NAMES = {
  violett: tr('Violett'), graphit: tr('Graphit & Grün'), mitternacht: tr('Mitternacht & Lime'), ozean: tr('Ozean'),
  sonnenuntergang: tr('Sonnenuntergang'), kreide: tr('Kreide'), ruhig: tr('Violett ruhig'), girly: tr('Girly'),
};
const ST_COLOR_FIELDS = {
  bg: tr('Hintergrund'), surface: tr('Flächen'), text: tr('Text'), accent: tr('Akzent'),
  grad0: tr('Buttons, Verlauf Anfang'), grad1: tr('Buttons, Verlauf Ende'), tile0: tr('Fokus-Kachel'),
  side0: tr('Ich'), side1: tr('Gegner'),
};
function stPaletteLabel(state) {
  if (!state) return '';
  return state.palette === 'custom' ? tr('Eigene Farben') : (ST_PALETTE_NAMES[state.palette] || ST_PALETTE_NAMES.violett);
}

function SettingsColorsPage({ onBack }) {
  const T = window.PTTheme;
  const [colors, setColors] = useState(() => T.read());
  const mode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const base = T.baseFor(colors, mode);
  function update(next) {
    T.write(next); T.apply(next, mode); setColors(next);
    window.dispatchEvent(new CustomEvent('pt:colors'));
  }
  const pickPalette = (id) => update({ palette: id });
  const setField = (field, value) => update(T.setCustom(colors, mode, field, value));
  const reset = () => update({ palette: colors.from || T.DEFAULT });

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Farben')} onBack={onBack} />

      <div className="st-colors-preview" aria-label={tr('Vorschau')}>
        <div className="st-colors-tile">
          <div className="st-colors-tile-top">
            <span><small>{tr('heute noch {amount}', { amount: 28 })}</small><b>{tr('Liegestütze')}</b></span>
            <span className="st-colors-pct">58%</span>
          </div>
          <div className="st-colors-tug" aria-hidden="true"><i className="a" /><i className="b" /></div>
          <div className="st-colors-chips" aria-hidden="true"><span>+5</span><span className="is-main">+10</span><span>+15</span></div>
        </div>
        <span className="btn st-colors-btn" aria-hidden="true">{tr('+{n} loggen', { n: 10 })}</span>
      </div>

      <SettingsGroup title={tr('Paletten')}>
        <div className="st-palettes" role="radiogroup" aria-label={tr('Paletten')}>
          {T.PALETTES.map(p => {
            const c = p[mode];
            const on = colors.palette === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} className={`st-palette${on ? ' is-on' : ''}`}
                onClick={() => pickPalette(p.id)}>
                <span className="st-palette-swatches" aria-hidden="true">
                  <i style={{ background: c.bg }} />
                  <i style={{ background: `linear-gradient(135deg, ${c.tile0}, ${c.tile1})` }} />
                  <i style={{ background: c.accent }} />
                  <i style={{ background: c.side0 }} />
                  <i style={{ background: c.side1 }} />
                </span>
                <span className="st-palette-name">{ST_PALETTE_NAMES[p.id]}</span>
                {on && <span className="st-check" aria-hidden="true"><Icon name="check" size={16} strokeWidth={2.6} /></span>}
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup title={tr('Eigene Farben')}
        action={colors.palette === 'custom' ? <button type="button" className="btn-link" onClick={reset}>{tr('Zurücksetzen')}</button> : null}
        footer={mode === 'dark'
          ? tr('Gilt für das dunkle Erscheinungsbild, im hellen wählst du extra.')
          : tr('Gilt für das helle Erscheinungsbild, im dunklen wählst du extra.')}>
        {T.FIELDS.map(f => (
          <label key={f} className="st-row st-color-row">
            <span className="st-row-text"><span className="st-row-title">{ST_COLOR_FIELDS[f]}</span></span>
            <span className="st-color-swatch" style={{ background: base[f] }}>
              <input type="color" value={base[f]} aria-label={ST_COLOR_FIELDS[f]}
                onChange={e => setField(f, e.target.value)} />
            </span>
          </label>
        ))}
      </SettingsGroup>
    </div>
  );
}

// ─── Unterseite: Sprache ────────────────────────────────────────────────────
// Sprachnamen stehen in ihrer eigenen Sprache (PTi18n.languages). Die Sprache
// steht beim Laden fest, deshalb lädt ein Wechsel die App neu; danach öffnet
// app.jsx wieder diese Seite.
const stLanguageName = (code) => PTi18n.languages.find(l => l.code === code)?.name || code;

function SettingsLanguagePage({ onBack }) {
  const current = PTi18n.pref === 'system' || !PTi18n.languages.some(l => l.code === PTi18n.pref) ? 'system' : PTi18n.pref;
  const options = [
    { value: 'system', title: tr('Wie das Gerät'), sub: stLanguageName(PTi18n.deviceLang) },
    ...PTi18n.languages.map(l => ({ value: l.code, title: l.name, lang: l.code })),
  ];
  function choose(value) {
    if (value === current) return;
    PTi18n.setPref(value);
    try { sessionStorage.setItem('pt:reopen-settings', 'language'); } catch (e) {}
    location.reload();
  }
  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Sprache')} onBack={onBack} />
      <SettingsGroup footer={tr('Die App lädt beim Wechsel kurz neu.')}>
        <div className="st-choices" role="radiogroup" aria-label={tr('Sprache')}>
          {options.map(o => {
            const selected = current === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={selected} lang={o.lang}
                className={`st-row st-choice${selected ? ' is-selected' : ''}`} onClick={() => choose(o.value)}>
                <span className="st-row-text">
                  <span className="st-row-title">{o.title}</span>
                  {o.sub && <span className="st-row-sub">{o.sub}</span>}
                </span>
                <span className="st-check" aria-hidden="true">{selected && <Icon name="check" size={18} strokeWidth={2.5} />}</span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>
    </div>
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
    run(() => baseApi.updateCompetition(competition.id, { name: nextName, emoji: nextEmoji }), tr('Gespeichert'));
  }

  async function leave() {
    if (!confirm(tr('„{name}“ verlassen? Deine Sätze bleiben in der Historie.', { name: competition.name }))) return;
    setBusy(true);
    try { await baseApi.leaveCompetition(competition.id); onLeft?.(); }
    catch (e) { alert(e.message); setBusy(false); }
  }

  const archived = !!competition.archived_at;

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Challenge')} onBack={onBack} />

      {isOwner ? (
        <SettingsGroup title={tr('Name & Emoji')}>
          <div className="st-block">
            <div className="st-edit-row">
              <button type="button" className="st-emoji-btn" aria-label={tr('Emoji {emoji} ändern', { emoji })}
                disabled={busy} onClick={() => setPickingEmoji(true)}>{emoji}</button>
              <input className="input" aria-label={tr('Name')} value={name} maxLength={40}
                onChange={e => setName(e.target.value)} onBlur={() => save()}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
            </div>
          </div>
        </SettingsGroup>
      ) : (
        <SettingsGroup title={tr('Name & Emoji')} footer={tr('Nur {name} kann das ändern.', { name: ownerName })}>
          <SettingsRow emoji={competition.emoji} title={competition.name} />
        </SettingsGroup>
      )}

      <SettingsGroup title={tr('Details')}>
        <SettingsRow title={tr('Modus')} value={modeLabel(competition.mode)} />
        <SettingsRow title={tr('Start')} value={stDate(competition.start_date)} />
        <SettingsRow title={tr('Ende')} value={competition.end_date ? stDate(competition.end_date) : trc('Enddatum', 'Offen')} />
      </SettingsGroup>

      <SettingsGroup>
        {isOwner && (
          <SettingsRow icon="archive" title={archived ? tr('Wieder aktivieren') : tr('Challenge archivieren')} disabled={busy}
            onClick={() => run(() => baseApi.updateCompetition(competition.id, { archived_at: archived ? null : new Date().toISOString() }),
              archived ? tr('Challenge ist wieder aktiv') : tr('Challenge archiviert'))} />
        )}
        <SettingsRow title={tr('Challenge verlassen')} tone="danger" disabled={busy} onClick={leave} />
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
      <h2 className="title st-sheet-title">{tr('Emoji')}</h2>
      <div className="st-emoji-grid">
        {COMP_EMOJIS.map(e => (
          <button key={e} type="button" className={`st-emoji-option${e === current ? ' is-active' : ''}`}
            aria-label={tr('Emoji {emoji}', { emoji: e })} aria-pressed={e === current} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
      <div className="st-edit-row">
        <input className="input" aria-label={tr('Eigenes Emoji')} placeholder={tr('Eigenes Emoji')} value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitCustom(); }} />
        <button type="button" className="btn" disabled={!custom.trim()} onClick={submitCustom}>{tr('Übernehmen')}</button>
      </div>
    </Sheet>
  );
}

// ─── Unterseite: Teilnehmer & Einladen ──────────────────────────────────────
function stKickFeedback(result, name) {
  if (result.sent) return result.demo ? tr('Demo-Arschkick für {name} 🍑', { name }) : tr('Arschkick für {name} ist unterwegs 🍑', { name });
  switch (result.reason) {
    case 'disabled': return tr('{name} hat Arschkicks ausgeschaltet.', { name });
    case 'no_device': return tr('Für {name} ist gerade keine Push-Zustellung möglich.', { name });
    case 'quiet_hours': return tr('Gerade ist Ruhezeit. Versuch es später nochmal.');
    case 'already_sent_today': return tr('Du hast {name} heute schon motiviert. Morgen geht’s weiter!', { name });
    case 'daily_limit': return tr('{name} hat heute schon genug Arschkicks bekommen.', { name });
    default: return tr('Arschkick konnte nicht gesendet werden. Versuch es später nochmal.');
  }
}

function SettingsMembersPage({ baseApi, competition, members, me, isOwner, ownerName, canKick = false, onBack, onChanged, onToast }) {
  const [busy, setBusy] = useState(false);
  const [kicking, setKicking] = useState(null);
  const [kicked, setKicked] = useState({});
  const kickDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const kickedToday = id => kicked[id] === kickDay;
  const is2v2 = competition.mode === '2v2';

  async function kick(m) {
    if (kicking || kickedToday(m.user_id)) return;
    setKicking(m.user_id);
    try {
      const result = await baseApi.kickMember(competition.id, m.user_id);
      if (result.sent || result.reason === 'already_sent_today') setKicked(current => ({ ...current, [m.user_id]: kickDay }));
      onToast?.(stKickFeedback(result, m.profile?.display_name || tr('Diese Person')));
    } catch (e) { alert(e.message); }
    finally { setKicking(null); }
  }

  async function run(fn, message) {
    setBusy(true);
    try { await fn(); onChanged?.(); if (message) onToast?.(message); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const share = async () => { if (await shareInvite(competition) === 'copied') onToast?.(tr('Einladung kopiert')); };
  const regenerate = () => {
    if (!confirm(tr('Neuen Code erzeugen? Der alte Code funktioniert dann nicht mehr.'))) return;
    run(() => baseApi.regenerateInviteCode(competition.id), tr('Neuer Code erzeugt'));
  };
  const remove = (m) => {
    const who = m.profile?.display_name || tr('Diese Person');
    if (!confirm(tr('{name} aus der Challenge entfernen? Die Sätze bleiben in der Historie.', { name: who }))) return;
    run(() => baseApi.removeMember(competition.id, m.user_id), tr('{name} entfernt', { name: who }));
  };
  // Melden per Mail an den Support (Apple 1.2); Name, Nutzer- und Challenge-ID im Text.
  const canReport = stCanReport();
  const report = (m) => stReport({
    kind: 'member', label: tr('Person'), userId: m.user_id, challengeId: competition.id,
    note: tr('Gemeldete Person: {name}', { name: m.profile?.display_name || tr('Unbekannt') }) + '\n' + tr('Was ist passiert?'),
  });

  const memberRow = (m) => {
    const isMe = m.user_id === me;
    return (
      <div key={m.user_id} className="st-member">
      <div className="st-row">
        <Avatar profile={m.profile} size={36} />
        <span className="st-row-text">
          <span className="st-row-title">{isMe ? tr('{name} (du)', { name: m.profile?.display_name }) : m.profile?.display_name}</span>
          {m.role === 'owner' && <span className="st-row-sub">{tr('Ersteller')}</span>}
        </span>
        {is2v2 && (isOwner || isMe) && (
          <div className="segmented segmented-sm st-team-switch" role="radiogroup" aria-label={tr('Team von {name}', { name: m.profile?.display_name })}>
            {['A', 'B'].map(t => (
              <button key={t} type="button" role="radio" aria-checked={m.team === t}
                className={m.team === t ? 'active' : ''} disabled={busy}
                onClick={() => m.team !== t && run(() => baseApi.setMemberTeam(competition.id, m.user_id, t))}>
                {t}
              </button>
            ))}
          </div>
        )}
        {isOwner && !isMe && (
          <SettingsIconButton icon="close" label={tr('{name} entfernen', { name: m.profile?.display_name })} tone="danger"
            disabled={busy} onClick={() => remove(m)} />
        )}
      </div>
      {!isMe && (canKick || canReport) && (
        <div className="st-member-actions">
          {canKick && (
            <button type="button" className="st-kick-btn" disabled={busy || !!kicking || kickedToday(m.user_id)}
              aria-label={tr('{name} einen Arschkick geben', { name: m.profile?.display_name })}
              onClick={() => kick(m)}>
              <span aria-hidden="true">🍑</span> {kickedToday(m.user_id) ? tr('Motiviert!') : tr('Arschkick')}
            </button>
          )}
          {canReport && (
            <button type="button" className="st-link" aria-label={tr('{name} melden', { name: m.profile?.display_name })}
              onClick={() => report(m)}>{tr('Melden')}</button>
          )}
        </div>
      )}
      </div>
    );
  };

  const groups = is2v2
    ? ['A', 'B'].map(t => ({ key: t, title: tr('Team {team}', { team: t }), rows: members.filter(m => (m.team || 'A') === t) }))
    : [{ key: 'all', title: tr('Teilnehmer ({n})', { n: members.length }), rows: members }];

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Teilnehmer')} onBack={onBack} />

      <SettingsGroup title={tr('Einladen')}>
        <div className="st-block st-invite">
          <div className="st-invite-code mono" aria-label={tr('Einladungscode {code}', { code: competition.invite_code })}>{competition.invite_code}</div>
          <button className="btn st-invite-share" onClick={share}>
            <Icon name="share" size={18} /> {tr('Einladung teilen')}
          </button>
          {isOwner && (
            <button className="st-link" onClick={regenerate} disabled={busy}>{tr('Neuen Code erzeugen')}</button>
          )}
        </div>
      </SettingsGroup>

      {groups.map(g => (
        <SettingsGroup key={g.key} title={g.title}
          footer={canKick ? tr('Ein Arschkick schickt einen lustigen Motivationsspruch. Pro Person einmal am Tag.') : null}>
          {g.rows.map(memberRow)}
          {!g.rows.length && <SettingsRow title={tr('Noch niemand')} />}
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

  const pickable = categories.filter(c => (c.kind || 'sports') !== 'work');

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
    if (!confirm(tr('Woche {n} komplett aus dem Plan entfernen?', { n: weekIndex + 1 }))) return;
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
    if (!confirm(tr('Ziele dieser Woche auf die Vorschläge setzen?'))) return;
    call(async () => {
      const thisWeek = (await api.listChallenges()).filter(c => c.week_start === weekStart);
      for (const t of template) {
        const match = thisWeek.find(c => c.category_id === t.category_id);
        await api.upsertChallenge(match
          ? { id: match.id, week_start: weekStart, category_id: t.category_id, chosen_by: match.chosen_by, target_reps: t.base_reps, target_runs: t.target_runs }
          : { week_start: weekStart, category_id: t.category_id, chosen_by: me, target_reps: t.base_reps, target_runs: t.target_runs });
      }
      onToast?.(tr('Woche auf Vorschläge gesetzt'));
    });
  };

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Wochenplan')} onBack={onBack} />

      <SettingsGroup footer={isOwner ? null : tr('Nur {name} kann das ändern.', { name: ownerName })}>
        <SettingsSwitchRow icon="calendar" title={tr('Wochenplan verwenden')} checked={enabled}
          disabled={!isOwner || busyModule} onChange={v => onModule('rotation_enabled', v)} />
      </SettingsGroup>

      {enabled && rotationConfig && !rotationConfig.enabled && (
        <SettingsNotice title={tr('Vorschläge pausiert')}
          action={tr('Fortsetzen')} onAction={() => call(() => api.setRotationConfig({ enabled: true }))} />
      )}

      {enabled && cycleLength === 0 && (
        <div className="st-empty">
          <SettingsTile icon="calendar" />
          <div className="st-empty-title">{tr('Noch keine Woche geplant')}</div>
          <button className="btn" onClick={() => addSlot(0)}>{tr('Erste Woche anlegen')}</button>
        </div>
      )}

      {enabled && cycleLength > 0 && <>
        {Array.from({ length: cycleLength }, (_, w) => {
          const slots = byWeek[w] || [];
          return (
            <SettingsGroup key={w}
              title={<>{tr('Woche {n}', { n: w + 1 })}{currentWeek === w && <span className="st-badge">{tr('Diese Woche')}</span>}</>}
              action={<SettingsIconButton icon="trash" label={tr('Woche {n} löschen', { n: w + 1 })} onClick={() => deleteWeek(w)} />}>
              {slots.map(slot => (
                <PlanSlotRow key={slot.id} slot={slot} catById={catById}
                  categories={pickable.some(c => c.id === slot.category_id) || !catById[slot.category_id] ? pickable : [catById[slot.category_id], ...pickable]}
                  usedInWeek={slots.filter(s => s.id !== slot.id).map(s => s.category_id)}
                  onChange={patch => call(() => api.updatePlanSlot(slot.id, patch))}
                  onDelete={() => confirm(tr('Diese Übung aus dem Plan entfernen?')) && call(() => api.deletePlanSlot(slot.id))} />
              ))}
              <SettingsRow icon="plus" tone="accent" title={tr('Übung hinzufügen')} onClick={() => addSlot(w)} chevron={false} />
            </SettingsGroup>
          );
        })}

        <SettingsGroup>
          <SettingsRow icon="plus" tone="accent" title={tr('Woche {n} hinzufügen', { n: cycleLength + 1 })} onClick={() => addSlot(cycleLength)} chevron={false} />
          {rotationConfig?.enabled && (
            <SettingsRow icon="refresh" title={tr('Diese Woche auf Vorschläge setzen')} onClick={applyToCurrentWeek} chevron={false} />
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
  const catName = cat?.name || tr('Übung');
  const [base, setBase] = useState(String(slot.start_target));
  const [max, setMax] = useState(String(slot.start_target + (slot.bonus_max || 0)));
  const [runs, setRuns] = useState(String(PTData.workoutTargetRuns(slot)));
  useEffect(() => { setBase(String(slot.start_target)); }, [slot.start_target]);
  useEffect(() => { setMax(String(slot.start_target + (slot.bonus_max || 0))); }, [slot.start_target, slot.bonus_max]);
  useEffect(() => { setRuns(String(PTData.workoutTargetRuns(slot))); }, [slot.target_runs]);

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
  // Spanne als ganzer Satz: „100 bis 120 Reps“ (Einheit je nach Art der Kategorie)
  const range = {
    from: <input {...numProps} aria-label={tr('{name}: Vorschlag von', { name: catName })} value={base}
      onChange={e => setBase(e.target.value)} onBlur={commitBase} />,
    to: <input {...numProps} aria-label={tr('{name}: Vorschlag bis', { name: catName })} value={max}
      onChange={e => setMax(e.target.value)} onBlur={commitMax} />,
  };

  return (
    <div className="st-row st-slot">
      <div className="st-slot-main">
        <label className="st-select">
          <select value={slot.category_id || ''} aria-label={tr('Übung')} onChange={e => onChange({ category_id: e.target.value })}>
            {!cat && <option value="">{tr('Unbekannt')}</option>}
            {categories.map(c => (
              <option key={c.id} value={c.id} disabled={used.has(c.id)}>{c.name}</option>
            ))}
          </select>
          <span className="st-select-caret"><Icon name="chevron" size={14} strokeWidth={2.5} /></span>
        </label>
        {workout ? (
          <div className="st-range">
            <input {...numProps} aria-label={tr('Durchgänge pro Person / Woche')} value={runs}
              onChange={e => setRuns(e.target.value)}
              onBlur={() => {
                const target = PTData.workoutTargetRuns({ target_runs: runs });
                setRuns(String(target));
                if (target !== PTData.workoutTargetRuns(slot)) onChange({ target_runs: target });
              }} />
            <span>{tr('pro Person')}</span>
          </div>
        ) : (
          <div className="st-range">
            {PTData.usesMinutes(cat) ? tr('{from} bis {to} min', range) : tr('{from} bis {to} Reps', range)}
          </div>
        )}
      </div>
      <SettingsIconButton icon="close" label={tr('{name} entfernen', { name: catName })} onClick={onDelete} />
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
    // Komma und Punkt gelten beide als Dezimalzeichen ("2,50" und "2.50")
    const eur = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(eur) || eur <= 0) { setAmount(stEuroInput(cfg.amount_cents)); return; }
    const cents = Math.round(eur * 100);
    setAmount(stEuroInput(cents));
    if (cents !== cfg.amount_cents) patch({ amount_cents: cents }, tr('Betrag gespeichert'));
  };

  return (
    <div className="st-screen">
      <SettingsPageHeader title={tr('Strafkonto')} onBack={onBack} />

      <SettingsGroup footer={isOwner ? null : tr('Nur {name} kann das ändern.', { name: ownerName })}>
        <SettingsSwitchRow icon="wallet" title={tr('Strafkonto verwenden')} checked={enabled}
          disabled={!isOwner || busyModule} onChange={v => onModule('penalties_enabled', v)} />
      </SettingsGroup>

      {enabled && cfg && <>
        {!cfg.enabled && (
          <SettingsNotice title={tr('Strafen pausiert')}
            action={tr('Einschalten')} busy={busy} onAction={() => patch({ enabled: true }, tr('Strafen eingeschaltet'))} />
        )}

        <SettingsGroup title={tr('Betrag')}>
          <label className="st-row">
            <span className="st-row-text"><span className="st-row-title">{tr('Pro Strafe')}</span></span>
            <span className="st-amount">
              {ST_EURO_FIRST && <span>€</span>}
              <input className="input st-num mono" type="text" inputMode="decimal" aria-label={tr('Betrag pro Strafe in Euro')}
                value={amount} disabled={busy}
                onFocus={e => e.target.select()}
                onChange={e => setAmount(e.target.value)}
                onBlur={commitAmount}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />
              {!ST_EURO_FIRST && <span>€</span>}
            </span>
          </label>
        </SettingsGroup>

        <SettingsGroup title={tr('Regel')}>
          <div className="st-choices" role="radiogroup" aria-label={tr('Strafregel')}>
            {ST_PENALTY_RULES.map(r => {
              const selected = cfg.rule_mode === r.id;
              return (
                <button key={r.id} type="button" role="radio" aria-checked={selected} disabled={busy}
                  className={`st-row st-choice${selected ? ' is-selected' : ''}`}
                  onClick={() => !selected && patch({ rule_mode: r.id }, tr('Regel gespeichert'))}>
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

// Card on Home: the first person of the week picks the reps for every exercise.
// Default = base_reps, range = [base_reps, base_reps + bonus_max].
function WeekFixCard({ template, categories, me, onFix, onDismiss, title, sub }) {
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const isWorkout = t => PTData.isWorkoutType(catById[t.category_id]?.challenge_type);
  const initialValue = t => isWorkout(t) ? PTData.workoutTargetRuns(t) : t.base_reps;
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const t of template) initial[t.slot_id] = initialValue(t);
    return initial;
  });
  const [busy, setBusy] = useState(false);
  if (!template?.length) return null;

  const step = (n) => n < 30 ? 1 : n < 100 ? 5 : 10;
  const bump = (t, dir) => {
    const cur = values[t.slot_id] ?? initialValue(t);
    const next = Math.max(1, cur + dir * (isWorkout(t) ? 1 : step(cur)));
    setValues({ ...values, [t.slot_id]: next });
  };
  const setExact = (t, raw) => {
    const v = parseInt(raw);
    if (!Number.isFinite(v) || v < 1) return;
    setValues({ ...values, [t.slot_id]: v });
  };

  const fix = async () => {
    setBusy(true);
    try { await onFix(template.map(t => ({
      category_id: t.category_id,
      target_reps: isWorkout(t) ? t.base_reps : (values[t.slot_id] ?? t.base_reps),
      target_runs: isWorkout(t) ? (values[t.slot_id] ?? initialValue(t)) : 1,
    }))); }
    finally { setBusy(false); }
  };

  return (
    <div className="weekfix-card">
      <div className="weekfix-head">
        <div>
          <div className="weekfix-label">{tr('Neue Woche')}</div>
          <div className="weekfix-title">{title || tr('Reps für diese Woche fixieren')}</div>
          <div className="weekfix-sub">{sub || tr('Wer zuerst da ist, setzt das Ziel für alle.')}</div>
        </div>
        {onDismiss && (
          <button className="weekfix-dismiss" aria-label={tr('Später')} onClick={onDismiss}>×</button>
        )}
      </div>
      <div className="weekfix-list">
        {template.map(t => {
          const cat = catById[t.category_id];
          const cur = values[t.slot_id] ?? initialValue(t);
          const isObligatory = cat?.challenge_type === 'tom_holland' || cat?.challenge_type === 'bring_sally_up';
          return (
            <div className="weekfix-item" key={t.slot_id}>
              <div className="weekfix-item-head">
                <span className="weekfix-item-name">{cat?.name || tr('Unbekannt')}</span>
                {isObligatory && <span className="weekfix-pflicht-badge">{tr('PFLICHT')}</span>}
              </div>
              <>
                  <div className="weekfix-stepper">
                    <button className="weekfix-step" disabled={cur <= 1}
                      onClick={() => bump(t, -1)} aria-label={tr('weniger')}>−</button>
                    <input className="weekfix-val mono" type="number" inputMode="numeric"
                      value={cur} min={1} aria-label={isObligatory ? tr('Durchgänge pro Person / Woche') : tr('Ziel-Wiederholungen / Woche')}
                      onFocus={e => e.target.select()}
                      onChange={e => setExact(t, e.target.value)}/>
                    <button className="weekfix-step"
                      onClick={() => bump(t, 1)} aria-label={tr('mehr')}>+</button>
                  </div>
                  <div className="weekfix-range weekfix-range-fixed">{isObligatory
                    ? (cur === 1 ? tr('Wird jede Woche gemacht') : tr('{n}× pro Person', { n: cur }))
                    : tr('Vorschlag: {n}', { n: t.base_reps })}</div>
              </>
            </div>
          );
        })}
      </div>
      <button className={`btn weekfix-cta ${busy?'is-loading':''}`} disabled={busy} onClick={fix}>
        {busy ? tr('Wird gesetzt…') : tr('Woche starten')}
      </button>
    </div>
  );
}

Object.assign(window, { SettingsScreen, PlanSlotRow, WeekFixCard });
