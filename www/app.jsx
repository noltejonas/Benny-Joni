/* global React, ReactDOM, PTData, PTPeople, Icon, Sheet, Toast, HomeScreen, SetupSheet, LogSheet, TomHollandSheet, BringSallySheet, FeedScreen, HistoryScreen, EmojiPickerSheet, BackfillSheet, todayGreeting, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, WeekFixCard, buildSides, totalsBySide, uniqueMaxIndex, Avatar, PTOnboarding, PTStats, PTHaptics, ObScreen, ObAuthFlow, ObProfile, ObStart, CreatePanel, JoinPanel, obSetDemo, ObInviteLayer, ObGoalLayer, ObFirstLogLayer, ObCelebrate, ObPushPrimer, PTPush, ObStarterCard, ObInviteCard, ObWeekOne, ChallengeSwitcherSheet, CreateCompetitionSheet, JoinCompetitionSheet, ProfileSheet, tr, trn, trc, PTi18n, PTBootCache */
const { useState, useEffect, useMemo, useCallback } = React;

const SUPABASE_URL = "https://jczyyupxxqrdgbeifcwe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjenl5dXB4eHFyZGdiZWlmY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMjgsImV4cCI6MjA5NDA4MjIyOH0.2Bz6R3N3p3evHXB7j5cKamq2egHrE1zYfgLcV2R8awg";

const ACTIVE_KEY = 'pt_active_competition';
const RETURNING_KEY = 'pt:returning';
const INVITE_KEY = 'pt:invite'; // offene Einladung { code, at }, 7 Tage gültig
const INVITE_TTL = 7 * 86400000;
const THEME_KEY = 'pt:theme2';
const PUSH_KEY = 'pt:notifications';
const TAB_KEY = 'pt:tab'; // zuletzt offener Tab (sessionStorage)
const RESUME_RELOAD_MS = 20000; // Rückkehr aus dem Hintergrund: ab 20 s neu laden
const QUICK_LOG_LOCK_MS = 700; // Schnellsatz: Sperre gegen Doppeltipp

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}
function readInvite() {
  try {
    const v = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null');
    if (v?.code && Date.now() - v.at < INVITE_TTL) return v.code;
  } catch (e) {}
  return null;
}
function readObLocal(userId) {
  try { return JSON.parse(localStorage.getItem(PTOnboarding.stateKey(userId)) || '{}'); } catch (e) { return {}; }
}
function writeInvite(code) {
  try {
    if (code) localStorage.setItem(INVITE_KEY, JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem(INVITE_KEY);
  } catch (e) {}
}

// Folgt dem Hell/Dunkel-Modus des Systems (iOS-Kontrollzentrum, macOS).
function useSystemDark() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq?.addEventListener) return;
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#32d74b",
  "layout": "rings",
  "notifications": true
} /*EDITMODE-END*/;

function Loader({ text = tr('Lade Daten…') }) {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <div className="app-loader-spinner" aria-hidden="true" />
      <div className="app-loader-text">{text}</div>
    </div>
  );
}

// ─── Fehlergrenze ───────────────────────────────────────────────────────────
// Ein Renderfehler soll nicht die ganze App abräumen (weißer Bildschirm).
// variant 'screen' (um <App/>) ersetzt den Bildschirm, 'card' (um den Tab-
// Inhalt) nur den Inhalt; Kopf und Tab-Leiste bleiben bedienbar. Der Fallback
// nutzt nur einfache Elemente, damit er selbst nicht scheitert.
class PTErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Renderfehler', error, info?.componentStack);
    try { window.PTReportError?.(error, { where: this.props.where || 'app', componentStack: info?.componentStack }); }
    catch (e) {}
  }

  reset = () => {
    try { sessionStorage.setItem(TAB_KEY, 'home'); } catch (e) {}
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const title = tr('Da ist etwas schiefgelaufen');
    const actions = (
      <>
        <button className="btn" onClick={() => location.reload()}>{tr('Neu laden')}</button>
        {/* Nur die Karte: Um <App/> würde reset die App neu mounten und einen
            zweiten Supabase-Client anlegen, während der alte weiterläuft. */}
        {this.props.variant === 'card' && <button className="btn-link" onClick={this.reset}>{tr('Zur Übersicht')}</button>}
      </>
    );
    if (this.props.variant === 'card') {
      return (
        <div className="rd-empty" role="alert">
          <div className="rd-empty-title">{title}</div>
          <div className="rd-empty-text">{tr('Dieser Bereich lässt sich gerade nicht anzeigen. Deine Sätze sind gespeichert.')}</div>
          {actions}
        </div>
      );
    }
    return (
      <div className="ob-screen" role="alert">
        <div className="ob-top"><span /></div>
        <main className="ob-body is-center">
          <div className="ob-trophy" aria-hidden="true">😵</div>
          <h1 className="ob-title" style={{ textAlign: 'center' }}>{title}</h1>
          <p className="ob-sub" style={{ textAlign: 'center' }}>{tr('Lade die App neu, dann geht’s weiter. Deine Sätze sind gespeichert.')}</p>
        </main>
        <div className="ob-foot">{actions}</div>
      </div>
    );
  }
}

// Toast nach dem Loggen; value ist schon formatiert („+12“, „+30 min“, „1h 30m“).
function loggedToast(value, name) {
  return name ? tr('{value} {name} geloggt', { value, name }) : tr('{value} geloggt', { value });
}

// ─── Hülle: Session, Profil, Challenge-Auswahl ──────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    if (!sessionStorage.getItem('pt_persistent_style_v1')) {
      const styles = ['gold', 'sparkle', 'trophy'];
      const pick = styles[Math.floor(Math.random() * styles.length)];
      sessionStorage.setItem('pt_persistent_style_v1', pick);
    }
  }, []);

  // Gerätebezogene Einstellungen liegen in localStorage (nicht im Profil):
  // Erscheinungsbild 'system' | 'light' | 'dark' und Push an/aus.
  const [themePref, setThemePref] = useState(() => readPref(THEME_KEY, 'system'));
  const systemDark = useSystemDark();
  const theme = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  useEffect(() => { writePref(THEME_KEY, themePref); }, [themePref]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#16151F' : '#F4F3F8');
  }, [theme]);

  const [notificationsOn, setNotificationsOn] = useState(() => readPref(PUSH_KEY, 'on') !== 'off');
  useEffect(() => { writePref(PUSH_KEY, notificationsOn ? 'on' : 'off'); }, [notificationsOn]);

  const api = useMemo(() => PTData.init({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }), []);

  const [session, setSession] = useState(undefined); // undefined = lädt, null = abgemeldet
  const [profile, setProfile] = useState(null);
  const [competitions, setCompetitions] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [accountError, setAccountError] = useState(null); // { text, offline } nach einem Ladefehler
  const [sheet, setSheet] = useState(null); // 'switcher' | 'create' | 'join' | 'profile'
  const [toast, setToast] = useState('');
  const [invite, setInviteState] = useState(readInvite);
  const setInvite = useCallback((code) => { writeInvite(code); setInviteState(code || null); }, []);
  const [startView, setStartView] = useState(null); // Start-Bildschirm: null | 'create' | 'join'
  const [intro, setIntro] = useState(null); // { kind: 'created' | 'joined', id } → Ebenen in der Challenge
  const [joinCode, setJoinCode] = useState(''); // Code fürs Beitreten-Sheet (Einladungslink in der App)

  // Einladungslinks: im Browser ?join=CODE, in der App projektterminator://join/CODE
  // (Kaltstart über getLaunchUrl, sonst appUrlOpen). Der Code wird als offene
  // Einladung gemerkt; entryRoute bzw. der Effekt unten führen in die Vorschau.
  useEffect(() => {
    const take = (url) => {
      const code = PTOnboarding.parseInviteUrl(url);
      if (code) setInvite(code);
      return code;
    };
    if (take(location.href)) {
      const u = new URL(location.href);
      u.searchParams.delete('join');
      if (/^#join=/i.test(u.hash)) u.hash = '';
      history.replaceState(null, '', u.toString());
    }
    let alive = true, handle = null;
    (window.PTAppReady || Promise.resolve(null)).then(async (mod) => {
      const AppPlugin = mod?.App;
      if (!AppPlugin || !alive) return;
      try {
        // Der Startlink bleibt die ganze Laufzeit gleich; nach einem Neuladen nicht erneut öffnen.
        const launch = await AppPlugin.getLaunchUrl();
        if (launch?.url && sessionStorage.getItem('pt:launch-url') !== launch.url) {
          sessionStorage.setItem('pt:launch-url', launch.url);
          take(launch.url);
        }
        handle = await AppPlugin.addListener('appUrlOpen', (e) => take(e?.url));
        if (!alive) handle.remove();
      } catch (e) { console.warn('App-Plugin nicht verfügbar', e); }
    });
    return () => { alive = false; handle?.remove(); };
  }, [setInvite]);

  // Auswahl beim Start: Haupt-Challenge → zuletzt geöffnete → erste aktive.
  const pickActive = useCallback((p, list, current) => {
    const usable = list.filter(c => !c.archived_at);
    const valid = (id) => id && list.some(c => c.id === id);
    if (valid(current)) return current;
    if (valid(p.main_competition_id) && usable.some(c => c.id === p.main_competition_id)) return p.main_competition_id;
    let last = null;
    try { last = localStorage.getItem(ACTIVE_KEY); } catch (e) {}
    if (valid(last)) return last;
    return usable[0]?.id || null;
  }, []);

  // Onboarding-Stand: Gerät (localStorage) + Konto (profiles.onboarding, nur
  // wenn die Spalte existiert — Migration 20261020000000).
  const [obLocal, setObLocal] = useState({});

  // Session übernehmen. Für ein neu angemeldetes Konto im selben Render den
  // Stand vom letzten Öffnen zeigen (PTBootCache), statt „Lade Profil…“;
  // loadAccount lädt danach frisch.
  const sessionUserRef = React.useRef(null);
  const adoptSession = useCallback((s) => {
    const id = s?.user?.id || null;
    if (id && id !== sessionUserRef.current) {
      setObLocal(readObLocal(id));
      const cached = PTBootCache.read(id, 'account');
      if (cached?.profile && cached.competitions) {
        PTPeople.set([cached.profile]);
        setProfile(cached.profile);
        setCompetitions(cached.competitions);
        setActiveId(cur => pickActive(cached.profile, cached.competitions, cur));
      }
    }
    sessionUserRef.current = id;
    setSession(s);
  }, [pickActive]);

  useEffect(() => {
    if (!api) return;
    api.getSession().then(adoptSession).catch(() => setSession(null));
    return api.onAuthChange((s, evt) => {
      if (evt === 'SIGNED_OUT') PTBootCache.clear();
      adoptSession(s);
    });
  }, [api, adoptSession]);

  const userId = session?.user?.id || null;
  // Demo-Besuche gelten nicht als echte Anmeldung.
  const isDemo = api?.mode === 'demo' || !!session?.demo;
  useEffect(() => { if (userId && !isDemo) writePref(RETURNING_KEY, '1'); }, [userId, isDemo]);
  useEffect(() => { if (!userId) setObLocal({}); }, [userId]);

  const obState = useMemo(() => PTOnboarding.mergeState(obLocal, profile?.onboarding), [obLocal, profile]);
  const obStateRef = React.useRef(obState);
  obStateRef.current = obState;
  const patchOb = useCallback((patch) => {
    if (!userId) return;
    const next = PTOnboarding.mergeState(patch, obStateRef.current); // neue Werte gewinnen
    obStateRef.current = next;
    try { localStorage.setItem(PTOnboarding.stateKey(userId), JSON.stringify(next)); } catch (e) {}
    setObLocal(next);
    if (profile && 'onboarding' in profile) {
      api.saveOnboarding(next)
        .then(p => { PTPeople.set([p]); setProfile(p); })
        .catch(e => console.warn('saveOnboarding failed', e));
    }
  }, [userId, profile, api]);

  const loadAccount = useCallback(async (preferId) => {
    if (!api || !userId) return;
    try {
      const [p, list] = await Promise.all([api.getMyProfile(), api.listMyCompetitions()]);
      PTPeople.set([p]);
      setProfile(p);
      setCompetitions(list);
      setActiveId(cur => pickActive(p, list, preferId ?? cur));
      setAccountError(null);
      PTBootCache.write(userId, 'account', { profile: p, competitions: list });
    } catch (e) {
      console.error('loadAccount failed', e);
      setAccountError({ text: e.message || String(e), offline: e?.code === 'offline' });
    }
  }, [api, userId, pickActive]);

  useEffect(() => {
    if (userId) loadAccount();
    else { setProfile(null); setCompetitions(null); setActiveId(null); }
  }, [userId, loadAccount]);

  // App-Sprache ins Profil, damit Push-Mitteilungen in dieser Sprache kommen
  // (Spalte profiles.language, Migration 20261021000000; ohne Spalte nichts tun).
  useEffect(() => {
    if (!profile || !('language' in profile) || profile.language === PTi18n.lang) return;
    api.updateProfile({ language: PTi18n.lang })
      .then(p => { PTPeople.set([p]); setProfile(p); })
      .catch(e => console.warn('save language failed', e));
  }, [profile, api]);

  // Ladefehler (meist offline): automatisch neu versuchen, sobald das Netz zurück ist.
  useEffect(() => {
    if (!accountError) return;
    const retry = () => loadAccount();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [accountError, loadAccount]);
  useEffect(() => {
    if (api) return;
    const reload = () => location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [api]);

  useEffect(() => {
    if (activeId) { try { localStorage.setItem(ACTIVE_KEY, activeId); } catch (e) {} }
  }, [activeId]);

  // Einladung, während man schon in der App ist: eigene Challenge → öffnen,
  // sonst das Beitreten-Sheet mit Vorschau.
  useEffect(() => {
    if (!invite || !competitions?.some(c => !c.archived_at)) return;
    const mine = competitions.find(c => c.invite_code === invite && !c.archived_at);
    setInvite(null);
    if (mine) { setActiveId(mine.id); setSheet(null); setToast(tr('Du bist schon dabei.')); }
    else { setJoinCode(invite); setSheet('join'); }
  }, [invite, competitions, setInvite]);

  // Welcher Bildschirm vor der App (onboarding-model.js). Wer im Onboarding
  // landet, gilt ab jetzt als neu (Startkarte, Tipps, Feiern).
  const route = PTOnboarding.entryRoute({ session, profile: userId ? profile : null, competitions, invite, state: obState });
  useEffect(() => {
    if (['profile', 'start', 'join'].includes(route) && !obState.started && PTOnboarding.youngProfile(profile)) {
      patchOb({ started: new Date().toISOString() });
    }
  }, [route, obState.started, patchOb, profile]);

  // Push-Tap mit competition_id → passende Challenge öffnen
  useEffect(() => {
    const onOpen = (e) => {
      const id = e?.detail?.competitionId;
      if (id && competitions?.some(c => c.id === id)) setActiveId(id);
    };
    window.addEventListener('pt:open-competition', onOpen);
    return () => window.removeEventListener('pt:open-competition', onOpen);
  }, [competitions]);

  async function signOut() {
    if (!confirm(tr('Abmelden?'))) return;
    try {
      const saved = localStorage.getItem('pt_apns_token');
      if (saved) { await api.deleteDeviceToken(saved).catch(() => {}); localStorage.removeItem('pt_apns_token'); }
    } catch (e) {}
    setSheet(null);
    PTBootCache.clear();
    // Nach dem nächsten Anmelden auf „Heute“ starten, nicht im zuletzt offenen Tab.
    try { sessionStorage.removeItem('pt:tab'); } catch (e) {}
    await api.signOut();
  }

  const newcomer = PTOnboarding.isNewcomer({ state: obState, profile });

  // Start-Ansicht und Einladung erst nach dem Laden zurücksetzen, sonst blitzt
  // „Wie startest du?“ auf und ließe sich ein zweites Mal antippen.
  async function handleCreated(c) {
    setSheet(null);
    setIntro({ kind: 'created', id: c.id });
    await loadAccount(c.id);
    setActiveId(c.id);
    setStartView(null);
  }

  async function handleJoined(id) {
    setSheet(null); setJoinCode('');
    setIntro({ kind: 'joined', id });
    await loadAccount(id);
    setActiveId(id);
    setInvite(null); setStartView(null);
    if (!newcomer) setToast(tr('Willkommen in der Challenge 💪'));
  }

  async function setMain(id) {
    try {
      const p = await api.updateProfile({ main_competition_id: id });
      setProfile(p);
      setToast(id ? tr('Haupt-Challenge gesetzt ★') : tr('Haupt-Challenge entfernt'));
    } catch (e) { alert(e.message); }
  }

  if (!api) {
    return (
      <ObScreen center foot={<button className="btn" onClick={() => location.reload()}>{tr('Erneut versuchen')}</button>}>
        <div className="ob-trophy" aria-hidden="true">📡</div>
        <h1 className="ob-title" style={{ textAlign: 'center' }}>{tr('Keine Verbindung')}</h1>
        <p className="ob-sub" style={{ textAlign: 'center' }}>{tr('Die App braucht Internet, um deine Challenges zu laden. Sobald du online bist, geht’s weiter.')}</p>
      </ObScreen>
    );
  }
  if (session === undefined) return <Loader text={tr('Starte…')} />;
  if (!session) {
    return <ObAuthFlow api={api} invite={invite} onInvite={setInvite}
      returning={readPref(RETURNING_KEY, '') === '1'} />;
  }
  if (accountError && !profile) {
    const offline = navigator.onLine === false || accountError.offline;
    return (
      <ObScreen center foot={<>
        <button className="btn" onClick={() => loadAccount()}>{tr('Erneut versuchen')}</button>
        <button className="btn-link" onClick={signOut}>{tr('Abmelden')}</button>
      </>}>
        <div className="ob-trophy" aria-hidden="true">{offline ? '📡' : '😵'}</div>
        <h1 className="ob-title" style={{ textAlign: 'center' }}>{offline ? tr('Keine Verbindung') : tr('Laden fehlgeschlagen')}</h1>
        <p className="ob-sub" style={{ textAlign: 'center' }}>{offline ? tr('Sobald du wieder online bist, geht’s weiter.') : accountError.text}</p>
      </ObScreen>
    );
  }
  if (!profile || !competitions) return <Loader text={tr('Lade Profil…')} />;

  if (route === 'profile') {
    return (
      <ObProfile api={api} profile={profile} email={session.user?.email}
        onSaved={(p) => { PTPeople.set([p]); setProfile(p); }}
        onDone={() => patchOb({ profileDone: new Date().toISOString() })}
        onSignOut={signOut} />
    );
  }

  const active = competitions.find(c => c.id === activeId) || null;

  const sheets = (
    <>
      <ChallengeSwitcherSheet open={sheet === 'switcher'} onClose={() => setSheet(null)}
        profile={profile} competitions={competitions} activeId={activeId}
        onSelect={(id) => { setActiveId(id); setSheet(null); }}
        onSetMain={setMain}
        onCreate={() => setSheet('create')}
        onJoin={() => setSheet('join')}
        onProfile={() => setSheet('profile')}
        onSignOut={signOut} />
      <CreateCompetitionSheet open={sheet === 'create'} api={api} onClose={() => setSheet(null)}
        onCreated={handleCreated} />
      <JoinCompetitionSheet open={sheet === 'join'} api={api} initialCode={joinCode}
        onClose={() => { setSheet(null); setJoinCode(''); }} onJoined={handleJoined} />
      <ProfileSheet open={sheet === 'profile'} api={api} profile={profile} onClose={() => setSheet(null)}
        onSignOut={signOut}
        onSaved={(p, opts) => { PTPeople.set([p]); setProfile(p); if (!opts?.keepOpen) { setSheet(null); setToast(tr('Profil gespeichert')); } }} />
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );

  // Konto ohne aktive Challenge: offene Einladung → Vorschau, sonst Start.
  if (route === 'join' || route === 'start') {
    let screen;
    if (route === 'join') {
      screen = <JoinPanel key={invite} api={api} initialCode={invite} onJoined={handleJoined}
        onCancel={() => setInvite(null)} onSkip={() => setInvite(null)} />;
    } else if (startView === 'create') {
      screen = <CreatePanel api={api} onCancel={() => setStartView(null)} onCreated={handleCreated} />;
    } else if (startView === 'join') {
      screen = <JoinPanel api={api} onCancel={() => setStartView(null)} onJoined={handleJoined} />;
    } else {
      screen = <ObStart profile={profile} onCreate={() => setStartView('create')} onJoin={() => setStartView('join')}
        onProfile={() => setSheet('profile')} onDemo={() => obSetDemo(true)}
        onArchived={competitions.length ? () => setSheet('switcher') : null} />;
    }
    return <>{screen}{sheets}</>;
  }
  if (!active) return <Loader text={tr('Lade Challenge…')} />;

  return (
    <>
      <CompetitionApp key={active.id}
        api={api} competition={active} profile={profile} me={profile.id}
        email={session.user?.email}
        competitions={competitions}
        t={t} setTweak={setTweak}
        themePref={themePref} onSetThemePref={setThemePref}
        notificationsOn={notificationsOn} onSetNotifications={setNotificationsOn}
        onOpenSwitcher={() => setSheet('switcher')}
        onOpenProfile={() => setSheet('profile')}
        onProfileChanged={(p) => { PTPeople.set([p]); setProfile(p); }}
        onSetMain={setMain}
        onSignOut={signOut}
        onCompetitionChanged={() => loadAccount()}
        onLeft={async () => { setActiveId(null); await loadAccount(null); setToast(trc('Meldung', 'Challenge verlassen')); }}
        intro={intro?.id === active.id ? intro.kind : null} onIntroDone={() => setIntro(null)}
        newcomer={newcomer} obState={obState} onObPatch={patchOb} />
      {sheets}
    </>
  );
}

// ─── Wochen-Recaps (pure) ───────────────────────────────────────────────────
function buildWeekRecaps({ allChallenges, allSets, categories, penalties, sides, members }) {
  if (!allChallenges.length || !sides.length) return [];
  const byWeek = {};
  for (const ch of allChallenges) (byWeek[ch.week_start] ||= []).push(ch);
  const catById = Object.fromEntries(categories.map(c => [c.id, c]));
  const firstWeekStart = Object.keys(byWeek).sort()[0];
  const firstMonday = new Date(firstWeekStart + 'T00:00:00');
  const now = new Date();
  const out = [];
  for (const ws of Object.keys(byWeek)) {
    const monday = new Date(ws + 'T00:00:00');
    const sundayEnd = new Date(monday); sundayEnd.setDate(monday.getDate() + 6); sundayEnd.setHours(23,59,59,999);
    if (now <= sundayEnd) continue;
    const challs = byWeek[ws];
    const participants = PTData.participantsFor(members, ws);
    const challStats = challs.map(ch => {
      const cat = catById[ch.category_id];
      const isWorkCh = (cat?.kind || 'sports') === 'work';
      // Pflicht-Workouts fließen nicht in die Wiederholungs-Wertung; erreicht = jede Person ein Durchgang.
      const workout = PTData.isWorkoutType(cat?.challenge_type) ? cat.challenge_type : null;
      const val = (s) => workout ? 0 : isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
      const csets = allSets.filter(s => s.challenge_id === ch.id);
      const doneBySide = totalsBySide(csets, sides, val);
      const total = doneBySide.reduce((a, x) => a + x, 0);
      const idsOf = (side) => side.statUserIds || side.userIds;
      const countBySide = workout ? sides.map(side => csets.filter(s => idsOf(side).includes(s.athlete)).length) : null;
      const hitBySide = workout
        ? sides.map(side => PTData.workoutPeopleDone(csets, idsOf(side)) === idsOf(side).length)
        : doneBySide.map(d => d >= ch.target_reps);
      const fairShare = workout ? 1 : PTData.fairShareOf(ch.target_reps, participants.length || sides.length);
      return { ch, cat, total, doneBySide, countBySide, hitBySide, hit: hitBySide.every(Boolean), isWorkCh, workout, val, fairShare };
    });
    const totals = sides.map((_, i) => challStats.reduce((s, x) => s + x.doneBySide[i], 0));
    const sumAll = totals.reduce((a, x) => a + x, 0);
    const winnerIdx = uniqueMaxIndex(totals);
    const ranked = totals.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    const diff = ranked.length > 1 ? ranked[0].v - ranked[1].v : ranked[0]?.v || 0;
    const hitCount = challStats.filter(c => c.hit).length;
    // Einheit min (nur Work) oder Reps; je eigener Satz für die Übersetzung.
    const allWork = challStats.length > 0 && challStats.every(c => c.isWorkCh);
    const winnerLabel = winnerIdx != null ? sides[winnerIdx].label : null;
    const v = { name: winnerLabel, n: diff };
    let analysis;
    if (sumAll === 0) analysis = tr('Stille Woche. Auf in die nächste!');
    else if (winnerIdx == null) analysis = tr('Unentschieden an der Spitze — perfekt ausbalanciert.');
    else if (diff / sumAll > 0.4) analysis = allWork ? tr('Klare Sache: {name} dominiert mit {n} min Vorsprung.', v) : trn(v.n, 'Klare Sache: {name} dominiert mit {n} Rep Vorsprung.', 'Klare Sache: {name} dominiert mit {n} Reps Vorsprung.', v);
    else if (diff / sumAll > 0.15) analysis = allWork ? tr('{name} setzt sich durch — {n} min Vorsprung.', v) : trn(v.n, '{name} setzt sich durch — {n} Rep Vorsprung.', '{name} setzt sich durch — {n} Reps Vorsprung.', v);
    else analysis = allWork ? tr('Knapper Sieg für {name} — nur {n} min Unterschied.', v) : trn(v.n, 'Knapper Sieg für {name} — nur {n} Rep Unterschied.', 'Knapper Sieg für {name} — nur {n} Reps Unterschied.', v);

    const weekSets = allSets.filter(s => challs.some(ch => ch.id === s.challenge_id));
    const sideIdx = window.sideIndexByUser(sides);
    const perSide = sides.map((side, i) => {
      const own = weekSets.filter(s => sideIdx[s.athlete] === i);
      const byCat = challStats
        .filter(c => c.doneBySide[i] > 0)
        .map(c => ({ name: c.cat?.name || '—', reps: c.doneBySide[i] }))
        .sort((a, b) => b.reps - a.reps);
      const maxSet = own.reduce((m, s) => {
        const stat = challStats.find(c => c.ch.id === s.challenge_id);
        return Math.max(m, stat ? stat.val(s) : (s.reps ?? 0));
      }, 0);
      return { byCat, setCount: own.length, maxSet };
    });
    const weekPens = penalties.filter(p => p.week_start === ws);
    const penCentsBySide = sides.map((_, i) =>
      weekPens.filter(p => sideIdx[p.athlete] === i).reduce((a, p) => a + p.amount_cents, 0));
    const weekNumber = Math.round((monday - firstMonday) / (7 * 86400000)) + 1;
    out.push({
      kind: 'recap', id: `recap-${ws}`, week_start: ws, created_at: sundayEnd.toISOString(),
      weekNumber, challStats, totals, winnerIdx, diff, sumAll, hitCount, totalChallenges: challs.length,
      perSide, penCentsBySide, analysis,
    });
  }
  return out;
}

// ─── App pro Challenge ──────────────────────────────────────────────────────
// Schon gesehene Ziel-Feiern (celebration.jsx, pt_celebrated_v1) — beim
// Beitritt für bereits geknackte Gruppenziele setzen.
function markCelebrated(me, challengeIds) {
  try {
    const flags = JSON.parse(localStorage.getItem('pt_celebrated_v1') || '{}');
    flags[me] = flags[me] || {};
    for (const id of challengeIds) flags[me][id] = true;
    localStorage.setItem('pt_celebrated_v1', JSON.stringify(flags));
  } catch (e) {}
}

function CompetitionApp({ api, competition: initialCompetition, profile, me, email, t, setTweak,
  themePref, onSetThemePref, notificationsOn, onSetNotifications,
  onOpenSwitcher, onOpenProfile, onProfileChanged, onSetMain, onSignOut, onCompetitionChanged, onLeft,
  intro, onIntroDone, newcomer, obState = {}, onObPatch }) {
  const capi = useMemo(() => api.forCompetition(initialCompetition.id), [api, initialCompetition.id]);

  const [competition, setCompetition] = useState(initialCompetition);
  useEffect(() => { setCompetition(c => ({ ...c, ...initialCompetition })); }, [initialCompetition]);

  // Tabs
  const [tab, setTab] = useState(() => {
    if (intro) return 'home'; // frisch erstellt oder beigetreten: immer „Heute“
    try { return sessionStorage.getItem(TAB_KEY) || 'home'; } catch { return 'home'; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(TAB_KEY, tab); } catch {}
    // Neuer Tab beginnt oben, nicht auf der Scrollhöhe des vorigen.
    try { window.scrollTo(0, 0); } catch {}
  }, [tab]);
  // reload() ist memoisiert; notify() braucht trotzdem den aktuellen Tab.
  const tabRef = React.useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (tab === 'strafkonto' && !competition.penalties_enabled) setTab('home');
  }, [tab, competition.penalties_enabled]);
  // Unterseite im Einstellungen-Tab ('root', 'challenge', 'members', 'plan', 'penalties', 'work', 'language').
  // Nach einem Sprachwechsel lädt die App neu und öffnet wieder die Sprachseite.
  const [settingsPage, setSettingsPage] = useState(() => {
    try {
      const page = sessionStorage.getItem('pt:reopen-settings');
      sessionStorage.removeItem('pt:reopen-settings');
      if (page) return page;
    } catch (e) {}
    return 'root';
  });
  const openSettings = (page = 'root') => { setSettingsPage(page); setTab('settings'); };

  // Data. Startwerte: Stand vom letzten Öffnen (PTBootCache), reload() holt
  // frisch. Frisch erstellt oder beigetreten (intro) gibt es keinen.
  const cacheName = `comp:${initialCompetition.id}`;
  const [boot] = useState(() => {
    const b = intro ? null : PTBootCache.read(me, cacheName);
    if (!b) return null;
    PTPeople.set(b.members.map(m => m.profile).filter(Boolean));
    PTData.annotateWorkouts(b.allSets, b.allChallenges, b.categories);
    PTData.annotateWorkouts(b.feed, b.allChallenges, b.categories);
    return b;
  });
  const [members, setMembers] = useState(() => boot?.members || []);
  const [categories, setCategories] = useState(() => boot?.categories || []);
  const [allChallenges, setAllChallenges] = useState(() => boot?.allChallenges || []);
  const [feed, setFeed] = useState(() => boot?.feed || []);
  const [allSets, setAllSets] = useState(() => boot?.allSets || []);
  const [planSlots, setPlanSlots] = useState(() => boot?.planSlots || []);
  const [rotationConfig, setRotationConfig] = useState(() => boot?.rotationConfig || null);
  const [penalties, setPenalties] = useState(() => boot?.penalties || []);
  const [closures, setClosures] = useState(() => boot?.closures || []);
  const [openClosures, setOpenClosures] = useState(() => boot?.openClosures || []);
  const [payouts, setPayouts] = useState(() => boot?.payouts || []);
  const [projectTags, setProjectTags] = useState(() => boot?.projectTags || []);
  const [toolTags, setToolTags]       = useState(() => boot?.toolTags || []);
  const [closingWeek, setClosingWeek] = useState(null);
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const [loading, setLoading] = useState(!boot);
  const [synced, setSynced] = useState(false);
  // Cached data remains visible when a refresh fails.
  const [loadError, setLoadError] = useState(null);
  const dataReady = synced && !loading && !loadError;

  // UI state
  const [setupForChallenge, setSetupForChallenge] = useState(null); // null=closed, {} = new, {id, ...} = edit
  const [logForChallenge, setLogForChallenge] = useState(null); // null=closed, {challenge}=open
  const [pickerForSet, setPickerForSet] = useState(null); // null=closed, set object = emoji picker open
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [toast, setToast] = useState('');
  const quickBusy = React.useRef({}); // Schnellsatz läuft: { [challengeId]: true }
  const lastFeedRef = React.useRef(null);
  // Onboarding-Ebenen über Home (onboarding-intro.jsx): { kind, … } oder null.
  const [layer, setLayer] = useState(null);
  const layerQueue = React.useRef([]);
  const introStarted = React.useRef(false);
  const introRef = React.useRef(intro);
  const firstLoadRef = React.useRef(true);
  const celebratedRef = React.useRef(false);

  const sides = useMemo(() => buildSides(competition, members, me), [competition, members, me]);
  const allowWork = !!competition.work_enabled;
  const usePenalties = !!competition.penalties_enabled;
  const useRotation = !!competition.rotation_enabled;

  // Heute als State: um Mitternacht und nach der Rückkehr aus dem Hintergrund
  // springt der Tag (und montags die Woche) um, auch ohne neues Rendern von außen.
  const [today, setToday] = useState(() => PTData.isoDate(new Date()));
  const todayRef = React.useRef(today);
  // Prüft den Kalendertag; true, wenn er sich seit dem letzten Prüfen geändert hat.
  const checkDay = useCallback(() => {
    const d = PTData.isoDate(new Date());
    if (d === todayRef.current) return false;
    todayRef.current = d;
    setToday(d);
    return true;
  }, []);

  // This week
  const weekStart = useMemo(() => PTData.isoDate(PTData.mondayOf(new Date(today + 'T00:00:00'))), [today]);
  const currentChallenges = useMemo(() => allChallenges.filter((c) => c.week_start === weekStart), [allChallenges, weekStart]);
  const currentWeekSets = useMemo(() => {
    const ids = new Set(currentChallenges.map((c) => c.id));
    return allSets.filter((s) => ids.has(s.challenge_id));
  }, [allSets, currentChallenges]);
  const participantsNow = useMemo(() => PTData.participantsFor(members, weekStart), [members, weekStart]);

  // ── Push-Erlaubnis und Vorab-Bildschirm ─────────────────────────────────
  const [pushPerm, setPushPerm] = useState('unsupported');
  const [primer, setPrimer] = useState(() => PTPush.readPrimer());
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () => PTPush.permission().then(p => { if (alive) setPushPerm(p); });
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onChange = (e) => setPushPerm(e.detail);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pt:push-permission', onChange);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pt:push-permission', onChange); };
  }, []);
  const pushDue = PTOnboarding.pushPrimerDue({ permission: pushPerm, enabled: notificationsOn, primer });

  // ── Onboarding in der Challenge ──────────────────────────────────────────
  const activeMembers = useMemo(() => members.filter(m => !m.left_at), [members]);
  const catTypeOf = useCallback((ch) => {
    const c = categories.find(x => x.id === ch.category_id);
    return (c?.kind || 'sports') === 'sports' && (c?.challenge_type || 'standard') === 'standard';
  }, [categories]);
  const sportsGoalsNow = useMemo(() => currentChallenges.filter(catTypeOf), [currentChallenges, catTypeOf]);
  const mySetCount = useMemo(() => allSets.filter(s => s.athlete === me).length, [allSets, me]);
  // Anteil-Regel (PTStats.SHARE_BASIS): ab 2 Aktiven die tatsächlichen Teilnehmer
  // wie Stats und Strafe, allein die volle Besetzung (Spec, Entscheidung 10).
  const sharePeopleFor = useCallback((mode, active) => {
    const expected = PTOnboarding.expectedPeople(mode, active);
    return window.PTStats?.sharePeople ? PTStats.sharePeople({ active, expected }) : expected;
  }, []);
  const peopleForShare = sharePeopleFor(competition.mode, participantsNow.length);
  const live = React.useRef({});
  live.current = { goals: sportsGoalsNow.length, sets: mySetCount, pushDue, pushPerm };

  // Nächste Ebene aus der Warteschlange; überspringt, was die Daten schon erledigen.
  const advance = useCallback((ctx = {}) => {
    const goals = ctx.goals ?? live.current.goals;
    const sets = ctx.sets ?? live.current.sets;
    while (layerQueue.current.length) {
      const kind = layerQueue.current.shift();
      if (kind === 'goal' && goals > 0) continue;
      if (kind === 'log' && (sets > 0 || goals === 0)) continue;
      if (kind === 'push' && !(ctx.manual ? live.current.pushPerm === 'prompt' : live.current.pushDue)) continue;
      setLayer({ kind, ...(ctx.data || {}) });
      return;
    }
    setLayer(null);
    onIntroDone?.();
  }, [onIntroDone]);

  const openLayer = useCallback((kinds, ctx) => {
    layerQueue.current = [...kinds];
    advance(ctx);
  }, [advance]);

  async function allowPush() {
    setPushBusy(true);
    const result = await PTPush.request();
    setPushBusy(false);
    const next = PTOnboarding.nextPrimerState(primer, result);
    PTPush.writePrimer(next); setPrimer(next); setPushPerm(result);
    if (result === 'granted') { onSetNotifications(true); setToast(tr('Mitteilungen sind an 🔔')); }
    else if (result === 'denied') setToast(tr('Alles klar. Geht auch später in den Einstellungen.'));
    advance();
  }
  function laterPush() {
    const next = PTOnboarding.nextPrimerState(primer, 'later');
    PTPush.writePrimer(next); setPrimer(next);
    advance();
  }
  // Nach einem Satz: Vorab-Bildschirm, wenn er dran ist (pushPrimerDue).
  const maybePushPrimer = () => { if (live.current.pushDue) openLayer(['push']); };

  // Nach Erstellen bzw. Beitreten: Ebenen einmal starten, sobald die Daten da sind.
  useEffect(() => {
    if (!dataReady || !intro || introStarted.current) return;
    introStarted.current = true;
    // Erster Satz mit Feier gibt es einmal pro Konto (obState.firstLog).
    const firstLog = obState.firstLog ? [] : ['log'];
    const kinds = intro === 'created' ? (newcomer ? ['invite', 'goal', ...firstLog] : ['invite'])
      : newcomer ? ['goal', ...firstLog] : [];
    openLayer(kinds);
  }, [dataReady, intro, newcomer, openLayer, obState.firstLog]);

  // Erster eigener Satz einer neuen Person: Feier statt Toast (einmal pro Konto).
  const celebrateFirst = useCallback((value, ch, cat) => {
    if (celebratedRef.current) return; // zwei schnelle Tipps feiern nur einmal
    celebratedRef.current = true;
    const share = PTData.fairShareOf(ch.target_reps, peopleForShare);
    const before = allSets.filter(x => x.challenge_id === ch.id && x.athlete === me).reduce((a, x) => a + (x.reps || 0), 0);
    onObPatch?.({ firstLog: new Date().toISOString() });
    layerQueue.current = ['push']; // nach der Feier ist der richtige Moment für den Push-Vorab-Bildschirm
    setLayer({ kind: 'cele', value, cat, share, myDone: before + value });
  }, [peopleForShare, allSets, me, onObPatch]);
  const isFirstLog = newcomer && !obState.firstLog && mySetCount === 0 && !celebratedRef.current;

  // Startkarte (nur neue Leute, erste 14 Tage, nicht weggetippt).
  const myMembership = members.find(m => m.user_id === me);
  const starterItems = PTOnboarding.starterItems({
    activeMembers: activeMembers.length, weekGoals: sportsGoalsNow.length, mySets: mySetCount, push: pushPerm,
  });
  const starterVisible = dataReady && PTOnboarding.showStarter({
    newcomer, items: starterItems, dismissedAt: obState.dismissed?.[competition.id], joinedAt: myMembership?.joined_at,
  });
  function openStarter(id) {
    if (id === 'invite') openLayer(['invite']);
    else if (id === 'goal') openLayer(['goal', 'log']);
    else if (id === 'log') openLayer(sportsGoalsNow.length ? ['log'] : ['goal', 'log']);
    else if (id === 'push') openLayer(['push'], { manual: true });
  }
  // Rückblick beim ersten Öffnen in Woche 2 einer Mitgliedschaft (nur neue Leute, einmal).
  const weekOneChecked = React.useRef(false);
  useEffect(() => {
    if (!dataReady || intro || !newcomer || weekOneChecked.current || !myMembership) return;
    weekOneChecked.current = true;
    const first = PTOnboarding.weekOneDue({ joinedAt: myMembership.joined_at, startDate: competition.start_date,
      seen: obState.weekOne?.[competition.id] });
    if (!first) return;
    const people = sharePeopleFor(competition.mode, PTData.participantsFor(members, first).length);
    const summary = PTOnboarding.weekOneSummary({ weekStart: first, me, sides, sets: allSets,
      challenges: allChallenges, categories, participantCount: people });
    setTab('home');
    setLayer({ kind: 'week1', summary, first });
  }, [dataReady, intro, newcomer, myMembership, competition, obState, members, me, sides, allSets, allChallenges, categories, sharePeopleFor]);

  // „Ersten Satz loggen“ aus leeren Zuständen: Ziel fehlt → Ziel, sonst Satz.
  function startFirstLog() {
    setTab('home');
    if (!sportsGoalsNow.length) { if (newcomer) openLayer(['goal', 'log']); else setSetupForChallenge({}); return; }
    if (newcomer && mySetCount === 0) openLayer(['log']);
    else setLogForChallenge(sportsGoalsNow[0]);
  }
  const layerRef = React.useRef(null);
  layerRef.current = layer;
  const memberIdsRef = React.useRef(null);

  const weekTemplate = useMemo(() => {
    if (!useRotation || !rotationConfig || !planSlots.length) return [];
    return PTData.weekTemplateFor({ weekStart, slots: planSlots, config: rotationConfig });
  }, [useRotation, weekStart, planSlots, rotationConfig]);

  // Ohne Wochenplan: „Wie letzte Woche starten“ – die Ziele der Vorwoche als
  // Vorlage für dieselbe WeekFixCard, damit Woche 2 nicht leer beginnt. Eine
  // angebrochene erste Woche wird auf sieben Tage hochgerechnet (stats-model.js).
  const prevWeekTemplate = useMemo(() => {
    if (useRotation || currentChallenges.length || !window.PTStats?.weekTemplateFromPrevious) return [];
    const prevWeek = PTData.addDays(weekStart, -7);
    const usable = new Set(categories.filter(c => allowWork || (c.kind || 'sports') !== 'work').map(c => c.id));
    const prev = allChallenges.filter(c => c.week_start === prevWeek && usable.has(c.category_id));
    if (!prev.length) return [];
    return PTStats.weekTemplateFromPrevious(prev, {
      fullWeekFactor: (ch) => PTStats.fullWeekFactor({ weekStart: prevWeek, startDate: competition.start_date, createdAt: ch.created_at }),
    });
  }, [useRotation, currentChallenges, weekStart, categories, allowWork, allChallenges, competition.start_date]);
  const fixTemplate = weekTemplate.length ? weekTemplate : prevWeekTemplate;
  const fixFromPrev = !weekTemplate.length && prevWeekTemplate.length > 0;

  // Next week preview — actual challenges if already set up, otherwise rotation suggestions.
  const nextWeekStart = useMemo(() => PTData.addDays(weekStart, 7), [weekStart]);
  const nextWeekChallenges = useMemo(
    () => allChallenges.filter(c => c.week_start === nextWeekStart),
    [allChallenges, nextWeekStart]
  );
  const nextWeekProposals = useMemo(() => {
    if (!useRotation || !rotationConfig || !planSlots.length) return [];
    return PTData.suggestForWeek({ weekStart: nextWeekStart, slots: planSlots, config: rotationConfig });
  }, [useRotation, nextWeekStart, planSlots, rotationConfig]);

  const weekRecaps = useMemo(
    () => buildWeekRecaps({ allChallenges, allSets, categories, penalties, sides, members }),
    [allChallenges, allSets, categories, penalties, sides, members]
  );

/* global PTRanking, RankingScreen, MonthRecapCard, lastClosedMonth, CelebrationOverlay */
  // Rangliste: Ergebnis des letzten abgeschlossenen Monats für die Feed-Karte
  // und die Feier, wenn ich eine Medaille geholt habe.
  const [monthRecap, setMonthRecap] = useState(null);
  const [medalCelebration, setMedalCelebration] = useState(null);
  const memberKey = members.filter(m => !m.left_at).map(m => m.user_id).sort().join(',');
  useEffect(() => {
    if (!memberKey) return;
    let off = false;
    (async () => {
      try {
        await api.closeDueMonths().catch(() => 0);
        const month = lastClosedMonth(await api.getRankingSettings());
        if (!month) return;
        const [rows, cats] = await Promise.all([api.rankingMonth(month), api.getRankedCategories()]);
        if (off) return;
        const ids = new Set(memberKey.split(','));
        const mine = rows.filter(r => r.counted && r.points > 0 && ids.has(r.user_id));
        setMonthRecap(mine.length ? { kind: 'month', id: `month-${month}`, month, rows: mine, cats,
          created_at: PTRanking.closeDeadline(month).toISOString() } : null);
        const medals = mine.filter(r => r.user_id === me && r.rank <= 3).sort((a, b) => a.rank - b.rank);
        const key = `pt_month_celebrated_${month}_${me}`;
        let seen = false;
        try { seen = localStorage.getItem(key) === '1'; } catch (e) {}
        if (medals.length && !seen) {
          const catById = Object.fromEntries(cats.map(c => [c.id, c]));
          const emoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
          setMedalCelebration({
            key,
            hero: medals[0].rank === 1 ? tr('MONATS{br}SIEG', { br: <br/> }) : tr('PODIUM'),
            points: rows.filter(r => r.user_id === me && r.counted).reduce((a, r) => a + r.points, 0),
            counterLabel: tr('Punkte im {month}', { month: PTRanking.monthLabel(month, false) }),
            subtext: medals.slice(0, 3).map(r => `${emoji[r.rank]} ${catById[r.category_id]?.name || ''}`).join(' · ')
              + (medals.length > 3 ? ` · +${medals.length - 3}` : ''),
          });
        }
      } catch (e) { /* Rangliste noch nicht eingerichtet */ }
    })();
    return () => { off = true; };
  }, [api, memberKey, me]);

  const feedItems = useMemo(() => {
    // Past-week sets are represented by their WeekRecap card — drop the
    // individual entries so the feed stays bounded.
    const currentSets = feed.filter(s => {
      if (!s.created_at) return true;
      return PTData.isoDate(new Date(s.created_at)) >= weekStart;
    });
    const items = [...weekRecaps, ...(monthRecap ? [monthRecap] : []), ...currentSets.map(s => ({ kind: 'set', ...s }))];
    items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return items;
  }, [feed, weekRecaps, monthRecap, weekStart]);

  async function fixWeek(picks) {
    try {
      for (const p of picks) {
        if (currentChallenges.find(c => c.category_id === p.category_id)) continue;
        await capi.upsertChallenge({
          week_start: weekStart,
          category_id: p.category_id,
          chosen_by: me,
          target_reps: p.target_reps,
        });
      }
      setToast(tr("Woche fixiert – los geht's, {name}!", { name: profile.display_name.split(/\s+/)[0] }));
      reload();
    } catch (e) { alert(e.message); }
  }

  // ── Laden ───────────────────────────────────────────────────────────────
  // Ein Durchgang lädt alles neu. Realtime, eigene Aktionen und die Rückkehr in
  // die App fallen oft zusammen: Läuft schon ein Durchgang, folgt höchstens genau
  // einer danach. reloadSeq verwirft Antworten, die nicht mehr die neueste sind
  // (z. B. nach dem Wechsel in eine andere Challenge).
  const reloadSeq = React.useRef(0);
  const reloadRun = React.useRef(null);
  const reloadAgain = React.useRef(false);
  const loadedOnce = React.useRef(!!boot);
  const leftRef = React.useRef(false);
  const unmounted = React.useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; reloadSeq.current++; };
  }, []);

  // Mitgliedschaft beendet: nur einmal melden, auch wenn weitere Antworten kommen.
  const leave = () => {
    if (leftRef.current || unmounted.current) return;
    leftRef.current = true;
    onLeft?.();
  };

  const loadOnce = async () => {
    const seq = ++reloadSeq.current;
    try {
      const [comp, mems, cats, challs, feedData, allSetsData, slots, cfg, pens, cls, openCls, pys, projTags, toolTagsData] = await Promise.all([
        capi.getCompetition(),
        capi.getMembers(),
        capi.getCategories(),
        capi.listChallenges(),
        capi.recentFeed(100),
        capi.getAllSets(),
        capi.getPlanSlots(),
        capi.getRotationConfig(),
        capi.listPenalties(),
        capi.listClosures(),
        capi.listOpenClosures(),
        capi.listPayouts(),
        capi.getProjectTags(),
        capi.getToolTags(),
      ]);
      if (seq !== reloadSeq.current) return; // veraltet
      // Pflicht-Workouts markieren, damit Summen sie erkennen (PTData.setValue).
      PTData.annotateWorkouts(allSetsData, challs, cats);
      PTData.annotateWorkouts(feedData, challs, cats);
      // Frisch beigetreten: Gruppenziele, die vorher geknackt wurden, nicht als
      // Vollbild feiern. Vor dem ersten Rendern von Home setzen (useCelebration).
      if (firstLoadRef.current && introRef.current === 'joined') {
        const reached = challs.filter(ch => ch.target_reps > 0 && !ch.workout
          && allSetsData.filter(x => x.challenge_id === ch.id).reduce((a, x) => a + (x.reps || 0), 0) >= ch.target_reps);
        markCelebrated(me, reached.map(ch => ch.id));
      }
      firstLoadRef.current = false;
      PTPeople.set(mems.map(m => m.profile).filter(Boolean));
      // Neue Mitglieder ankündigen (nicht beim ersten Laden; die Einladen-Ebene zeigt es selbst).
      const activeIds = mems.filter(m => !m.left_at).map(m => m.user_id);
      if (memberIdsRef.current) {
        const fresh = mems.find(m => !m.left_at && m.user_id !== me && !memberIdsRef.current.includes(m.user_id));
        if (fresh && layerRef.current?.kind !== 'invite') {
          setToast(tr('{name} ist dabei 🎉', { name: (fresh.profile?.display_name || tr('Jemand')).split(/\s+/)[0] }));
          PTHaptics.success();
        }
      }
      memberIdsRef.current = activeIds;
      setCompetition(comp);
      setMembers(mems);
      setCategories(cats);
      setAllChallenges(challs);
      setFeed(feedData);
      setAllSets(allSetsData);
      setPlanSlots(slots);
      setRotationConfig(cfg);
      setPenalties(pens || []);
      setClosures(cls || []);
      setOpenClosures(openCls || []);
      setPayouts(pys || []);
      setProjectTags(projTags || []);
      setToolTags(toolTagsData || []);
      setSynced(true);
      const member = mems.some(m => m.user_id === me && !m.left_at);
      if (member) PTBootCache.write(me, cacheName, {
        members: mems, categories: cats, allChallenges: challs, feed: feedData, allSets: allSetsData,
        planSlots: slots, rotationConfig: cfg, penalties: pens || [], closures: cls || [],
        openClosures: openCls || [], payouts: pys || [], projectTags: projTags || [], toolTags: toolTagsData || [],
      });

      // Notification trigger
      if (lastFeedRef.current !== null && feedData[0] && feedData[0].id !== lastFeedRef.current &&
      feedData[0].athlete !== me && notificationsOn) {
        notify(feedData[0]);
      }
      lastFeedRef.current = feedData[0]?.id || null;
      loadedOnce.current = true;
      setLoadError(null);

      // Mitgliedschaft beendet (entfernt oder Challenge gelöscht)
      if (!mems.some(m => m.user_id === me && !m.left_at)) leave();
    } catch (e) {
      if (seq !== reloadSeq.current) return;
      console.error('reload failed', e);
      // Challenge nicht mehr sichtbar (PGRST116) oder keine Berechtigung mehr
      // (42501, z. B. aus der Challenge entfernt) → zurück zur Auswahl
      if (e?.code === 'PGRST116' || e?.code === '42501') { leave(); return; }
      if (!loadedOnce.current) setLoadError(e || new Error('reload failed'));
      else setToast(e?.code === 'offline' ? tr('Keine Verbindung – zeige letzten Stand') : tr('Aktualisieren hat nicht geklappt – zeige letzten Stand'));
    } finally {
      if (seq === reloadSeq.current) setLoading(false);
    }
  };
  const loadRef = React.useRef(loadOnce);
  loadRef.current = loadOnce; // immer der aktuelle Stand (me, notificationsOn, onLeft …)

  // Stabil über die ganze Lebensdauer: Realtime-Abo und Listener hängen nur einmal.
  const reload = useCallback(() => {
    if (reloadRun.current) { reloadAgain.current = true; return reloadRun.current; }
    const run = (async () => {
      try {
        do {
          reloadAgain.current = false;
          await loadRef.current();
        } while (reloadAgain.current && !unmounted.current);
      } finally {
        reloadRun.current = null;
      }
    })();
    reloadRun.current = run;
    return run;
  }, []);

  function notify(set) {
    const isWork = set.category?.kind === 'work';
    const who = PTPeople.firstNameOf(set.athlete);
    const valStr = isWork ? window.formatDuration?.(set.duration_minutes) ?? `${set.duration_minutes}m` : `+${set.reps}`;
    // Im offenen Feed erscheint der Satz ohnehin live; dort keinen Toast doppelt.
    if (tabRef.current !== 'feed') setToast(`${who}: ${valStr} ${set.category?.name || ''}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${isWork ? '💻' : '💪'} ${tr('{name} hat geliefert', { name: who })}`, {
        body: `${valStr} ${set.category?.name || (isWork ? 'min' : tr('Reps'))} · ${competition.name}`,
        icon: '/favicon.ico'
      });
    }
  }

  useEffect(() => {
    reload();
    const off = capi.onChange(reload);
    return off;
  }, [capi, reload]);

  // Erstes Laden gescheitert: alle 15 s still neu versuchen, solange die Karte steht.
  useEffect(() => {
    if (!loadError) return;
    const id = setTimeout(() => reload(), 15000);
    return () => clearTimeout(id);
  }, [loadError, reload]);
  function retryLoad() {
    setLoading(true);
    reload();
  }

  // Rückkehr aus dem Hintergrund: iOS friert die WebView ein, und Realtime liefert
  // verpasste Änderungen nicht nach. Nach mehr als 20 s im Hintergrund (oder an
  // einem neuen Tag) neu laden; ebenso, wenn das Netz zurück ist. visibilitychange
  // und das App-Ereignis resume kommen oft beide – hiddenAt sorgt für einen Reload.
  useEffect(() => {
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    const hide = () => { if (hiddenAt == null) hiddenAt = Date.now(); };
    const back = () => {
      const away = hiddenAt == null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      const newDay = checkDay();
      if (away > RESUME_RELOAD_MS || newDay) reload();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? hide() : back());
    const onOnline = () => reload();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    let alive = true;
    const handles = [];
    (window.PTAppReady || Promise.resolve(null)).then(async (mod) => {
      const AppPlugin = mod?.App;
      if (!AppPlugin || !alive) return;
      try {
        for (const [evt, fn] of [['pause', hide], ['resume', back]]) {
          const h = await AppPlugin.addListener(evt, fn);
          if (alive) handles.push(h); else h?.remove?.();
        }
      } catch (e) { console.warn('App-Plugin: pause/resume nicht verfügbar', e); }
    });
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      handles.forEach(h => h?.remove?.());
    };
  }, [reload, checkDay]);

  // Tageswechsel bei offener App: kurz nach Mitternacht Tag (und Woche) neu
  // setzen und laden. Feuert der Timer zu früh, wird er neu gestellt.
  useEffect(() => {
    let id;
    const arm = () => {
      const next = new Date();
      next.setHours(24, 0, 1, 0);
      id = setTimeout(() => { if (checkDay()) reload(); else arm(); }, Math.max(1000, next - Date.now()));
    };
    arm();
    return () => clearTimeout(id);
  }, [today, checkDay, reload]);
  // Sicherheitsnetz: Rendert die App nach Mitternacht aus anderem Grund neu
  // (Timer im Hintergrund pausiert), springt der Tag ebenfalls um.
  useEffect(() => { if (checkDay()) reload(); });

  // Neue Woche: offene Sheets gehören zur alten Woche und schließen sich, sonst
  // landet ein Satz in der Vorwoche. Laufende Pflicht-Workouts bleiben offen.
  const shownWeek = React.useRef(weekStart);
  useEffect(() => {
    if (shownWeek.current === weekStart) return;
    shownWeek.current = weekStart;
    setSetupForChallenge(null);
    setBackfillOpen(false);
    setProposalDismissed(false);
    setLogForChallenge(cur => {
      const type = cur && categories.find(c => c.id === cur.category_id)?.challenge_type;
      return cur && PTData.isWorkoutType(type) ? cur : null;
    });
  }, [weekStart]);

  // Native APNs registration (Capacitor only — web uses the Notification API above)
  useEffect(() => {
    const Push = window.PTPushNotifications?.PushNotifications;
    if (!Push) return; // not running natively, nothing to do

    if (!notificationsOn) {
      // Toggle is OFF → wipe this device's token from the server so we stop
      // receiving banners. Keep localStorage in sync.
      const saved = localStorage.getItem('pt_apns_token');
      if (saved) {
        api.deleteDeviceToken(saved).catch(() => {});
        localStorage.removeItem('pt_apns_token');
      }
      return;
    }

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        // Nie automatisch fragen: die Erlaubnis holt der Vorab-Bildschirm
        // (ObPushPrimer) bzw. der Schalter in den Einstellungen.
        const perm = await Push.checkPermissions();
        if (perm.receive !== 'granted' || cancelled) return;

        // Listener vor register(), sonst kann das Token-Ereignis verloren gehen.
        const onReg = await Push.addListener('registration', async (info) => {
          try {
            await api.upsertDeviceToken({ token: info.value, platform: 'ios' });
            localStorage.setItem('pt_apns_token', info.value);
          } catch (e) { console.warn('upsertDeviceToken failed', e); }
        });
        const onErr = await Push.addListener('registrationError', (e) => {
          console.warn('Push registrationError', e);
        });
        const onTap = await Push.addListener('pushNotificationActionPerformed', (action) => {
          const data = action?.notification?.data || {};
          // Rangliste-Pushes öffnen die Rangliste, auch nach einem Neustart.
          if (/^(rank_|month_)/.test(data.kind || '')) {
            try { sessionStorage.setItem(TAB_KEY, 'ranking'); } catch (e) {}
            window.dispatchEvent(new CustomEvent('pt:nav-ranking'));
            return;
          }
          const competitionId = data.competition_id;
          if (competitionId) {
            try { sessionStorage.setItem(TAB_KEY, 'feed'); } catch (e) {}
            window.dispatchEvent(new CustomEvent('pt:open-competition', { detail: { competitionId } }));
          }
          window.dispatchEvent(new CustomEvent('pt:nav-feed'));
        });
        // Foreground deliveries: do nothing here. Supabase Realtime + the
        // existing notify() toast covers in-app feedback. iOS suppresses
        // the banner automatically while the app is in the foreground.

        cleanup = () => { onReg.remove(); onErr.remove(); onTap.remove(); };
        if (cancelled) { cleanup(); return; }
        await Push.register();
      } catch (e) { console.warn('Push setup failed', e); }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [me, notificationsOn, api, pushPerm]);

  // Push-Taps öffnen den passenden Tab und aktualisieren nach dem Hintergrund.
  useEffect(() => {
    const onNavFeed = () => { setTab('feed'); reload(); };
    const onNavRanking = () => { setTab('ranking'); reload(); };
    window.addEventListener('pt:nav-feed', onNavFeed);
    window.addEventListener('pt:nav-ranking', onNavRanking);
    return () => {
      window.removeEventListener('pt:nav-feed', onNavFeed);
      window.removeEventListener('pt:nav-ranking', onNavRanking);
    };
  }, [reload]);

  const setupCategories = allowWork ? categories : categories.filter(c => (c.kind || 'sports') !== 'work');
  // Badge = Personen mit offenem Saldo (Strafen minus Einzahlungen), wie im Strafkonto.
  const openPenaltyCount = usePenalties ? (window.penaltySummary?.(penalties, payouts).openPeople ?? 0) : 0;

  return (
    <div className="app">
      <header className="app-header">
        <button className="app-header-text mu-header-title" onClick={onOpenSwitcher} aria-label={tr('Challenge wechseln, aktuell {name}', { name: competition.name })}>
          <span className="date">
            {todayGreeting()}, {profile.display_name.split(/\s+/)[0]} · {PTi18n.date(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="greeting">
            <span className="app-header-name">{competition.name}</span>
            <Icon name="chevron" size={20} strokeWidth={2.5} />
          </span>
        </button>
        <button className={`avatar-btn${tab === 'settings' ? ' is-active' : ''}`}
          onClick={() => tab === 'settings' ? setTab('home') : openSettings()}
          aria-label={tr('Profil und Einstellungen')}>
          <Avatar userId={me} profile={profile} size={44} />
        </button>
      </header>

      <main className="app-main">
        {/* key: Tab-Wechsel setzt die Fehlergrenze zurück */}
        <PTErrorBoundary key={tab} where={`tab:${tab}`} variant="card"
          onReset={() => { setSettingsPage('root'); setTab('home'); }}>
        {loading ? <Loader /> : loadError ? (
          <div className="rd-empty" role="alert">
            <div className="rd-empty-title">{tr('Konnte nicht laden')}</div>
            <div className="rd-empty-text">
              {loadError.code === 'offline' || navigator.onLine === false
                ? tr('Keine Verbindung. Sobald du online bist, geht’s weiter.')
                : tr('Gerade klappt es nicht. Versuch es gleich nochmal.')}
            </div>
            <button className="btn" onClick={retryLoad}>{tr('Erneut versuchen')}</button>
          </div>
        ) : (<>
        {tab === 'home' && starterVisible && (
          <ObStarterCard items={starterItems} daysLeft={PTOnboarding.weekProgress().daysLeft}
            midWeek={PTOnboarding.joinedMidWeek({ joinedAt: myMembership?.joined_at })}
            onOpen={openStarter}
            onDismiss={() => onObPatch?.({ dismissed: { [competition.id]: new Date().toISOString() } })} />
        )}
        {tab === 'home' && !starterVisible
          && (activeMembers.length < 2 || (competition.mode === '2v2' && sides.some(x => !x.userIds.length))) && (
          <ObInviteCard competition={competition} members={members} onInvite={() => openLayer(['invite'])} />
        )}

        {tab === 'home' && !currentChallenges.length && !proposalDismissed && fixTemplate.length > 0 &&
          <WeekFixCard key={`${weekStart}-${fixFromPrev ? 'prev' : 'plan'}`}
            template={fixTemplate} categories={categories} me={me}
            title={fixFromPrev ? tr('Wie letzte Woche starten') : undefined}
            sub={fixFromPrev ? tr('Gleiche Übungen wie letzte Woche. Ziele anpassen und los.') : undefined}
            onFix={fixWeek}
            onDismiss={() => setProposalDismissed(true)} />
        }

        {tab === 'home' &&
        <HomeScreen
          api={capi}
          me={me}
          sides={sides}
          participantCount={peopleForShare}
          challenges={currentChallenges}
          categories={categories}
          allSets={allSets}
          celebrate={synced}
          layout={t.layout}
          weekStart={weekStart}
          nextWeekStart={nextWeekStart}
          nextWeekChallenges={nextWeekChallenges}
          nextWeekProposals={nextWeekProposals}
          openClosures={usePenalties ? openClosures : []}
          onCloseWeek={(w) => setClosingWeek(w)}
          onAddGoal={() => (newcomer && !sportsGoalsNow.length ? openLayer(['goal', 'log']) : setSetupForChallenge({}))}
          onEditChallenge={(ch) => setSetupForChallenge(ch)}
          onLogChallenge={(ch) => setLogForChallenge(ch)}
          coach={newcomer && mySetCount === 0 && !layer}
          onQuickLog={async (ch, val) => {
            // Doppeltipp: pro Ziel gesperrt, bis addSet fertig ist, mindestens 700 ms.
            if (quickBusy.current[ch.id]) return;
            quickBusy.current[ch.id] = true;
            const started = Date.now();
            const unlock = () => setTimeout(() => { delete quickBusy.current[ch.id]; },
              Math.max(0, QUICK_LOG_LOCK_MS - (Date.now() - started)));
            try {
              const cat = categories.find(c => c.id === ch.category_id);
              const isWork = cat?.kind === 'work';
              const first = isFirstLog && !isWork;
              const payload = isWork
                ? { challenge_id: ch.id, reps: null, duration_minutes: parseInt(val), note: null }
                : { challenge_id: ch.id, reps: parseInt(val), note: null };
              await capi.addSet(payload);
              PTHaptics.tap();
              if (first) celebrateFirst(parseInt(val), ch, cat);
              else { setToast(loggedToast(`+${val}${isWork ? ' min' : ''}`, cat?.name)); maybePushPrimer(); }
              reload();
            } catch (e) {
              if (e?.code === 'offline') setToast(tr('Keine Verbindung. Satz nicht gespeichert.'));
              else alert(e.message);
            } finally {
              unlock();
            }
          }} />
        }

        {tab === 'strafkonto' && usePenalties &&
        <StrafkontoScreen
          api={capi} me={me} sides={sides} members={members}
          penalties={penalties}
          closures={closures}
          openClosures={openClosures}
          payouts={payouts}
          onChange={reload}
          onOpenSettings={() => openSettings('penalties')} />
        }

        {tab === 'feed' && <FeedScreen feed={feedItems} me={me} sides={sides} categories={categories} competition={competition}
          challenges={currentChallenges} weekSets={currentWeekSets} participantCount={peopleForShare}
          loading={loading}
          projectTags={projectTags} toolTags={toolTags}
          onEditSet={async (s, patch) => { try { await capi.updateSet(s.id, patch); setToast(tr('Satz aktualisiert')); reload(); } catch (e) { alert(e.message); } }}
          onDeleteSet={async (s) => { try { await capi.deleteSet(s.id); setToast(tr('Gelöscht')); reload(); } catch (e) { alert(e.message); } }}
          onToggleReaction={async (s, emoji) => {
            const mineHas = (s.reactions || []).some(r => r.athlete === me && r.emoji === emoji);
            try {
              if (mineHas) await capi.removeReaction({ set_id: s.id, emoji });
              else await capi.addReaction({ set_id: s.id, emoji });
              reload();
            } catch (e) { alert(e.message); }
          }}
          onPickEmoji={(s) => setPickerForSet(s)}
          onBackfill={() => setBackfillOpen(true)}
          alone={activeMembers.length < 2}
          onFirstLog={startFirstLog}
          onInvite={() => { setTab('home'); openLayer(['invite']); }} />}

        {tab === 'ranking' &&
        <RankingScreen api={api} me={me} profile={profile}
          onProfileSaved={onProfileChanged} onToast={setToast} />
        }

        {tab === 'history' &&
        <StatsTab
          api={api}
          me={me}
          profile={profile}
          competition={competition}
          sides={sides}
          members={members}
          challenges={allChallenges}
          categories={categories}
          allSets={allSets} />
        }

        {tab === 'settings' &&
        <SettingsScreen api={capi} baseApi={api}
          page={settingsPage} onNavigate={setSettingsPage}
          me={me} profile={profile} email={email}
          competition={competition} members={members} categories={categories}
          planSlots={planSlots} rotationConfig={rotationConfig}
          projectTags={projectTags} toolTags={toolTags}
          themePref={themePref} onSetThemePref={onSetThemePref}
          notificationsEnabled={notificationsOn} onSetNotifications={onSetNotifications}
          onProfile={onOpenProfile} onProfileChanged={onProfileChanged} onSetMain={onSetMain} onSignOut={onSignOut}
          onCompetitionChanged={() => { reload(); onCompetitionChanged?.(); }}
          onLeft={onLeft}
          onToast={setToast} />
        }
        </>)}
        </PTErrorBoundary>
      </main>

      <nav className="tabbar" aria-label={tr('Hauptnavigation')}>
        <div className="tabbar-inner">
          {[
            { id: 'home', icon: 'home', label: tr('Heute') },
            { id: 'feed', icon: 'feed', label: tr('Feed') },
            { id: 'ranking', icon: 'trophy', label: tr('Rangliste') },
            { id: 'history', icon: 'stats', label: tr('Stats') },
            ...(usePenalties ? [{ id: 'strafkonto', icon: 'wallet', label: tr('Strafkonto'), badge: openPenaltyCount }] : []),
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}>
              <span className="tab-icon">
                <Icon name={t.icon} size={22} />
                {t.badge > 0 && <span className="tab-badge" aria-label={trn(t.badge, '{n} Person mit offener Strafe', '{n} Personen mit offener Strafe')}>{t.badge}</span>}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {closingWeek && (
        <WeekCloseSheet weekStart={closingWeek} api={capi} me={me}
          onClose={() => setClosingWeek(null)}
          onDone={() => { setClosingWeek(null); setToast(tr('Woche abgeschlossen')); reload(); }} />
      )}

      <Sheet open={!!setupForChallenge} onClose={() => setSetupForChallenge(null)}>
        <SetupSheet
          api={capi}
          me={me}
          categories={setupCategories}
          allowWork={allowWork}
          weekStart={weekStart}
          existing={setupForChallenge?.id ? setupForChallenge : null}
          usedCategoryIds={currentChallenges.filter(c => c.id !== setupForChallenge?.id).map(c => c.category_id)}
          projectTags={projectTags}
          toolTags={toolTags}
          onClose={() => setSetupForChallenge(null)}
          onSaved={() => {setSetupForChallenge(null);setToast(tr('Ziel gespeichert'));reload();}}
          onDeleted={() => {setSetupForChallenge(null);setToast(tr('Ziel gelöscht'));reload();}}
          onAddCategory={reload} />
      </Sheet>

      <Sheet open={!!logForChallenge} onClose={() => setLogForChallenge(null)}>
        {(() => {
          if (!logForChallenge) return null;
          const logCat = categories.find(c => c.id === logForChallenge.category_id);
          const ctype = logCat?.challenge_type || 'standard';
          const catName = logCat?.name || '';
          if (ctype === 'tom_holland') {
            return (
              <TomHollandSheet
                api={capi}
                me={me}
                challenge={logForChallenge}
                allSets={allSets}
                onClose={() => setLogForChallenge(null)}
                onLogged={(rounds) => {
                  setLogForChallenge(null);
                  setToast(catName
                    ? trn(rounds, '{n} Runde {name} geloggt', '{n} Runden {name} geloggt', { name: catName })
                    : trn(rounds, '{n} Runde geloggt', '{n} Runden geloggt'));
                  reload();
                }} />
            );
          }
          if (ctype === 'bring_sally_up') {
            return (
              <BringSallySheet
                api={capi}
                me={me}
                challenge={logForChallenge}
                allSets={allSets}
                onClose={() => setLogForChallenge(null)}
                onLogged={(val) => {
                  setLogForChallenge(null);
                  const m = Math.floor(val/60), s = val%60;
                  setToast(val >= 204 ? tr('Bring Sally Up geschafft!') : loggedToast(`${m}:${String(s).padStart(2,'0')}`, catName));
                  reload();
                }} />
            );
          }
          return (
            <LogSheet
              api={capi}
              me={me}
              challenge={logForChallenge}
              category={logCat}
              projectTags={projectTags}
              toolTags={toolTags}
              onClose={() => setLogForChallenge(null)}
              onLogged={(r, isWork) => {
                const ch = logForChallenge;
                setLogForChallenge(null);
                PTHaptics.tap();
                const valStr = isWork ? (window.formatDuration?.(r) ?? `${r}m`) : `+${r}`;
                if (isFirstLog && !isWork) celebrateFirst(r, ch, logCat);
                else { setToast(loggedToast(valStr, catName)); maybePushPrimer(); }
                reload();
              }} />
          );
        })()}
      </Sheet>

      <Sheet open={backfillOpen} onClose={() => setBackfillOpen(false)}>
        <BackfillSheet
          api={capi}
          me={me}
          challenges={currentChallenges}
          categories={categories}
          projectTags={projectTags}
          toolTags={toolTags}
          onClose={() => setBackfillOpen(false)}
          onSaved={(r) => {setBackfillOpen(false);setToast(tr('+{n} nachgetragen', { n: r }));reload();}} />
      </Sheet>

      <Sheet open={!!pickerForSet} onClose={() => setPickerForSet(null)}>
        <EmojiPickerSheet
          onClose={() => setPickerForSet(null)}
          onPick={async (emoji) => {
            if (!pickerForSet) { setPickerForSet(null); return; }
            try {
              await capi.addReaction({ set_id: pickerForSet.id, emoji });
              setPickerForSet(null);
              reload();
            } catch (e) { alert(e.message); }
          }} />
      </Sheet>

      {layer?.kind === 'invite' && (
        <ObInviteLayer competition={competition} members={members} me={me} fresh={intro === 'created'}
          onDone={() => advance()} />
      )}
      {layer?.kind === 'goal' && (
        <ObGoalLayer api={capi} competition={competition} categories={categories} me={me}
          activeCount={participantsNow.length} weekStart={weekStart} title={layer.title}
          onDone={(ch) => { reload(); advance({ goals: 1, data: { extra: [ch] } }); }}
          onSkip={() => advance({ goals: live.current.goals })} />
      )}
      {layer?.kind === 'log' && (
        <ObFirstLogLayer api={capi} categories={categories} people={peopleForShare}
          challenges={[...currentChallenges, ...(layer.extra || []).filter(x => !currentChallenges.some(c => c.id === x.id))]}
          onLogged={(reps, ch, cat) => {
            PTHaptics.tap();
            if (!obState.firstLog) celebrateFirst(reps, ch, cat);
            else { setToast(loggedToast(`+${reps}`, cat?.name)); advance({ sets: 1 }); maybePushPrimer(); }
            reload();
          }}
          onSkip={() => advance()} />
      )}
      {layer?.kind === 'cele' && (
        <ObCelebrate value={layer.value} category={layer.cat} myDone={layer.myDone} share={layer.share}
          onDone={() => advance({ sets: 1 })} />
      )}
      {layer?.kind === 'week1' && (
        <ObWeekOne summary={layer.summary} competition={competition} onDone={() => {
          onObPatch?.({ weekOne: { [competition.id]: layer.first } });
          if (!sportsGoalsNow.length) openLayer(['goal'], { data: { title: tr('Ziel für Woche 2') } });
          else setLayer(null);
        }} />
      )}
      {layer?.kind === 'push' && (
        <ObPushPrimer competition={competition} busy={pushBusy}
          rival={activeMembers.filter(m => m.user_id !== me).map(m => m.profile?.display_name?.split(/\s+/)[0]).find(Boolean)}
          onAllow={allowPush} onLater={laterPush} />
      )}

      <Toast message={toast} onDone={() => setToast('')} />

      {medalCelebration && (
        <CelebrationOverlay targetReps={medalCelebration.points}
          hero={medalCelebration.hero} counterLabel={medalCelebration.counterLabel}
          subtext={medalCelebration.subtext}
          onDone={() => { try { localStorage.setItem(medalCelebration.key, '1'); } catch (e) {} setMedalCelebration(null); }} />
      )}

      {/* i18n-ignore: Entwickler-Panel (nur im Bearbeiten-Modus des Design-Hosts), bleibt deutsch */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />{/* i18n-ignore */}
        <TweakRadio label="Modus" value={t.theme} options={['dark', 'light']}
        onChange={(v) => setTweak('theme', v)} />{/* i18n-ignore */}
        <TweakColor label="Akzent" value={t.accent} onChange={(v) => setTweak('accent', v)}
        options={['#32d74b', '#0a84ff', '#ff375f', '#ff9f0a', '#bf5af2']} />
        <TweakSection label="Layout" />{/* i18n-ignore */}
        <TweakRadio label="Heute-Screen" value={t.layout} /* i18n-ignore */
        options={[{ label: 'Ring', value: 'rings' }, { label: 'Balken', value: 'bar' }, { label: 'Zahl', value: 'numeric' }]}
        onChange={(v) => setTweak('layout', v)} />
        <TweakSection label="Sonstiges" />{/* i18n-ignore */}
        <TweakToggle label="Benachrichtigungen" value={notificationsOn}
        onChange={onSetNotifications} />
      </TweaksPanel>
    </div>);

}

ReactDOM.createRoot(document.getElementById('root')).render(
  <PTErrorBoundary where="app"><App /></PTErrorBoundary>
);
