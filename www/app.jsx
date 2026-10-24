/* global React, ReactDOM, useCelebration, PTData, PTDashboard, DashboardScreen, ChallengeQuickSheet, WeekFinale, finaleSeen, markFinaleSeen, PTPeople, Icon, Sheet, Toast, HomeScreen, SetupSheet, LogSheet, TomHollandSheet, BringSallySheet, FeedScreen, HistoryScreen, EmojiPickerSheet, BackfillSheet, todayGreeting, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, WeekFixCard, buildSides, totalsBySide, uniqueMaxIndex, Avatar, PTOnboarding, PTHaptics, ObScreen, ObAuthFlow, ObProfile, ObStart, CreatePanel, JoinPanel, obSetDemo, ObInviteLayer, ObGoalLayer, ObFirstLogLayer, ObCelebrate, ObPushPrimer, PTPush, ObStarterCard, ObInviteCard, ObWeekOne, ChallengeSwitcherSheet, CreateCompetitionSheet, JoinCompetitionSheet, ProfileSheet, tr, trn, trc, PTi18n, PTBootCache */
const { useState, useEffect, useMemo, useCallback } = React;

const SUPABASE_URL = "https://jczyyupxxqrdgbeifcwe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjenl5dXB4eHFyZGdiZWlmY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMjgsImV4cCI6MjA5NDA4MjIyOH0.2Bz6R3N3p3evHXB7j5cKamq2egHrE1zYfgLcV2R8awg";

const ACTIVE_KEY = 'pt_active_competition';
const RETURNING_KEY = 'pt:returning';
const INVITE_KEY = 'pt:invite'; // offene Einladung { code, at }, 7 Tage gültig
const INVITE_TTL = 7 * 86400000;
const THEME_KEY = 'pt:theme2';
const PUSH_KEY = 'pt:notifications';

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

// Toast nach dem Loggen; value ist schon formatiert („+12“, „+30 min“, „1h 30m“).
// count: in wie vielen Challenges der Eintrag zählt.
function loggedToast(value, name, count = 1) {
  const base = name ? tr('{value} {name} geloggt', { value, name }) : tr('{value} geloggt', { value });
  return count > 1 ? `${base} · ${trn(count, 'zählt für {n} Challenge', 'zählt für {n} Challenges')}` : base;
}

const HOME_VIEW_KEY = 'pt:home-view'; // „Heute“: 'dashboard' (alle Challenges) | 'challenge'
function writeHomeView(v) { try { sessionStorage.setItem(HOME_VIEW_KEY, v); } catch (e) {} }

// Beim allerersten Dashboard auf diesem Gerät: schon geknackte Gruppenziele
// nicht nacheinander als Vollbild feiern, nur was ab jetzt geknackt wird.
function seedDashCelebrations(me, bundle) {
  const key = `pt_dash_seeded_v1:${me}`;
  try { if (localStorage.getItem(key)) return; } catch (e) { return; }
  const total = (id) => bundle.sets.filter(x => x.challenge_id === id).reduce((a, x) => a + (x.reps ?? x.duration_minutes ?? 0), 0);
  const reached = bundle.challenges.filter(ch => ch.target_reps > 0 && !ch.workout && total(ch.id) >= ch.target_reps);
  markCelebrated(me, reached.map(ch => ch.id));
  try { localStorage.setItem(key, '1'); } catch (e) {}
}

// Daten fürs Dashboard „Heute“: alle laufenden Challenges, laufende und letzte
// Woche (letzte für die Wochenabschluss-Feier). Startwert: Stand vom letzten
// Öffnen (PTBootCache), Realtime lädt bei Änderungen neu.
function useDashboardData(api, competitions, me) {
  const live = useMemo(() => (competitions || []).filter(c => !c.archived_at && c.mode !== 'solo'), [competitions]);
  const ids = live.map(c => c.id).join(',');
  const fromWeek = PTData.addDays(PTData.isoDate(PTData.mondayOf(new Date())), -7);
  const fromCache = (id) => {
    const cached = id ? PTBootCache.read(id, 'dash') : null;
    if (cached?.members) PTPeople.set(cached.members.map(m => m.profile).filter(Boolean));
    return { me: id, bundle: cached?.members ? cached : null, fresh: false };
  };
  const [state, setState] = useState(() => fromCache(me));
  // Die Session kommt asynchron: Stand vom letzten Öffnen erst lesen, wenn klar ist, wer angemeldet ist
  useEffect(() => { if (me) setState(s => (s.me === me ? s : fromCache(me))); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    if (!api || !me || !ids || !api.getDashboard) return;
    try {
      const b = await api.getDashboard(ids.split(','), fromWeek);
      PTData.annotateWorkouts(b.sets, b.challenges, b.categories);
      PTPeople.set(b.members.map(m => m.profile).filter(Boolean));
      seedDashCelebrations(me, b);
      setState({ me, bundle: b, fresh: true });
      PTBootCache.write(me, 'dash', b);
    } catch (e) { console.warn('getDashboard failed', e); }
  }, [api, me, ids, fromWeek]);
  useEffect(() => {
    load();
    if (!api?.onCompetitionsChange || !ids) return;
    return api.onCompetitionsChange(ids.split(','), load);
  }, [api, ids, load]);
  const mine = state.me === me;
  return { live, bundle: mine ? state.bundle : null, fresh: mine && state.fresh, reload: load };
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
  useEffect(() => { if (userId) writePref(RETURNING_KEY, '1'); }, [userId]);
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

  // Rangliste, Stats & Co. bleiben bei der aktiven Challenge; „Heute“ zeigt alle.
  const dash = useDashboardData(api, userId ? competitions : null, userId);
  const openCompetition = useCallback((id) => { writeHomeView('challenge'); setActiveId(id); }, []);

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
        <button className="btn-link" onClick={() => api.signOut()}>{tr('Abmelden')}</button>
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
        onSelect={(id) => {
          writeHomeView('challenge');
          if (id === activeId) window.dispatchEvent(new CustomEvent('pt:challenge-view'));
          setActiveId(id); setSheet(null);
        }}
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
        dash={dash} onOpenCompetition={openCompetition}
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
      const isWorkCh = PTData.usesMinutes(cat);
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
    // Wochensieg nach Wiederholungen; Minuten zählen nur in reinen Minuten-Wochen
    const repWeek = challStats.some(c => !c.isWorkCh && !c.workout);
    const totals = sides.map((_, i) => challStats.filter(c => !repWeek || !c.isWorkCh).reduce((s, x) => s + x.doneBySide[i], 0));
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
  competitions = [], dash = { live: [], bundle: null, reload: () => {} }, onOpenCompetition,
  themePref, onSetThemePref, notificationsOn, onSetNotifications,
  onOpenSwitcher, onOpenProfile, onProfileChanged, onSetMain, onSignOut, onCompetitionChanged, onLeft,
  intro, onIntroDone, newcomer, obState = {}, onObPatch }) {
  const capi = useMemo(() => api.forCompetition(initialCompetition.id), [api, initialCompetition.id]);

  const [competition, setCompetition] = useState(initialCompetition);
  useEffect(() => { setCompetition(c => ({ ...c, ...initialCompetition })); }, [initialCompetition]);

  // Tabs
  const [tab, setTab] = useState(() => {
    if (intro) return 'home'; // frisch erstellt oder beigetreten: immer „Heute“
    try { return sessionStorage.getItem('pt:tab') || 'home'; } catch { return 'home'; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('pt:tab', tab); } catch {}
  }, [tab]);
  // „Heute“ bei mehreren Challenges: Dashboard über alle oder diese Challenge.
  const [homeView, setHomeView] = useState(() => {
    if (intro) return 'challenge';
    try { return sessionStorage.getItem(HOME_VIEW_KEY) || 'dashboard'; } catch { return 'dashboard'; }
  });
  useEffect(() => { writeHomeView(homeView); }, [homeView]);
  // Dieselbe Challenge im Switcher gewählt: Challenge-Ansicht statt Dashboard
  useEffect(() => {
    const onView = () => { setHomeView('challenge'); setTab('home'); };
    window.addEventListener('pt:challenge-view', onView);
    return () => window.removeEventListener('pt:challenge-view', onView);
  }, []);
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
  const [loading, setLoading] = useState(!boot); // nichts zum Zeigen da
  const [synced, setSynced] = useState(false);   // erster reload() durch

  // UI state
  const [setupForChallenge, setSetupForChallenge] = useState(null); // null=closed, {} = new, {id, ...} = edit
  const [logForChallenge, setLogForChallenge] = useState(null); // null=closed, {challenge}=open
  // Eintragen aus dem Dashboard (auch für andere Challenges): { ex, entry }
  const [dashLog, setDashLog] = useState(null);
  const [quickCard, setQuickCard] = useState(null); // Schnellansicht einer Challenge (Dashboard)
  const [dashFocus, setDashFocus] = useState(null);
  const logCountRef = React.useRef(1);
  const [pickerForSet, setPickerForSet] = useState(null); // null=closed, set object = emoji picker open
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [toast, setToast] = useState('');
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

  // This week
  const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
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
  // Solange Plätze frei sind, rechnet der Anteil mit der vollen Besetzung (Spec, Entscheidung 10).
  const peopleForShare = PTOnboarding.expectedPeople(competition.mode, participantsNow.length);
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
    if (!synced || !intro || introStarted.current) return;
    introStarted.current = true;
    // Erster Satz mit Feier gibt es einmal pro Konto (obState.firstLog).
    const firstLog = obState.firstLog ? [] : ['log'];
    const kinds = intro === 'created' ? (newcomer ? ['invite', 'goal', ...firstLog] : ['invite'])
      : newcomer ? ['goal', ...firstLog] : [];
    openLayer(kinds);
  }, [synced, intro, newcomer, openLayer, obState.firstLog]);

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
  const starterVisible = !loading && PTOnboarding.showStarter({
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
    if (!synced || intro || !newcomer || weekOneChecked.current || !myMembership) return;
    weekOneChecked.current = true;
    const first = PTOnboarding.weekOneDue({ joinedAt: myMembership.joined_at, startDate: competition.start_date,
      seen: obState.weekOne?.[competition.id] });
    if (!first) return;
    const people = PTOnboarding.expectedPeople(competition.mode, PTData.participantsFor(members, first).length);
    const summary = PTOnboarding.weekOneSummary({ weekStart: first, me, sides, sets: allSets,
      challenges: allChallenges, categories, participantCount: people });
    setTab('home');
    markFinaleSeen(me, competition.id, first); // der Rückblick ersetzt hier die große Feier
    setLayer({ kind: 'week1', summary, first });
  }, [synced, intro, newcomer, myMembership, competition, obState, members, me, sides, allSets, allChallenges, categories]);

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

/* global PTRanking, RankingScreen, MonthRecapCard, lastClosedMonth, lastClosedWeek, CelebrationOverlay */
  // Rangliste: Ergebnis der letzten abgeschlossenen Woche (bzw. des Monats ohne
  // Wochenwertung) für die Feed-Karte und die Feier, wenn ich eine Medaille geholt habe.
  const [monthRecap, setMonthRecap] = useState(null);
  const [medalCelebration, setMedalCelebration] = useState(null);
  const memberKey = members.filter(m => !m.left_at).map(m => m.user_id).sort().join(',');
  useEffect(() => {
    if (!memberKey) return;
    let off = false;
    (async () => {
      try {
        const R = PTRanking;
        if (api.closeDueWeeks) await api.closeDueWeeks().catch(() => 0);
        const closedWeeks = api.rankingClosedWeeks ? await api.rankingClosedWeeks().catch(() => null) : null;
        const weekly = closedWeeks !== null;
        if (!weekly) await api.closeDueMonths().catch(() => 0);
        const settings = await api.getRankingSettings();
        // Wochenwertung: nur die zuletzt fällige Woche feiern, nicht eine ältere
        const week = weekly ? lastClosedWeek(settings) : null;
        const month = weekly ? null : lastClosedMonth(settings);
        if (weekly ? !week || !closedWeeks.includes(week) : !month) return;
        const [rows, cats] = await Promise.all([weekly ? api.rankingWeek(week) : api.rankingMonth(month), api.getRankedCategories()]);
        if (off || !rows) return;
        const ids = new Set(memberKey.split(','));
        const mine = rows.filter(r => r.counted && r.points > 0 && ids.has(r.user_id));
        setMonthRecap(!mine.length ? null : weekly
          ? { kind: 'month', id: `week-${week}`, month: R.weekMonth(week), label: R.weekLabel(week), rows: mine, cats,
            created_at: R.weekCloseDeadline(week).toISOString() }
          : { kind: 'month', id: `month-${month}`, month, rows: mine, cats, created_at: R.closeDeadline(month).toISOString() });
        const medals = mine.filter(r => r.user_id === me && r.rank <= 3).sort((a, b) => a.rank - b.rank);
        const key = weekly ? `pt_week_medal_celebrated_${week}_${me}` : `pt_month_celebrated_${month}_${me}`;
        let seen = false;
        try { seen = localStorage.getItem(key) === '1'; } catch (e) {}
        if (medals.length && !seen) {
          const catById = Object.fromEntries(cats.map(c => [c.id, c]));
          const emoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
          const gold = medals[0].rank === 1;
          setMedalCelebration({
            key,
            hero: weekly ? (gold ? tr('WOCHEN{br}GOLD', { br: <br/> }) : tr('PODIUM'))
              : (gold ? tr('MONATS{br}SIEG', { br: <br/> }) : tr('PODIUM')),
            points: rows.filter(r => r.user_id === me && r.counted).reduce((a, r) => a + r.points, 0),
            counterLabel: weekly ? tr('Punkte in KW {week}', { week: R.weekNumberOf(week) })
              : tr('Punkte im {month}', { month: R.monthLabel(month, false) }),
            subtext: medals.slice(0, 3).map(r => `${emoji[r.rank]} ${catById[r.category_id]?.name || ''}`).join(' · ')
              + (medals.length > 3 ? ` · +${medals.length - 3}` : ''),
          });
        }
      } catch (e) { /* Rangliste noch nicht eingerichtet */ }
    })();
    return () => { off = true; };
  }, [api, memberKey, me]);

  // ── Dashboard über alle Challenges ──────────────────────────────────────
  const dashComps = useMemo(() => {
    if (!dash.bundle) return [];
    const mainId = profile.main_competition_id;
    const order = [...dash.live].sort((a, b) => (b.id === mainId) - (a.id === mainId));
    return order.map(c => {
      const ms = dash.bundle.members.filter(m => m.competition_id === c.id);
      const parts = PTData.participantsFor(ms, weekStart).length;
      return { c, members: ms, sides: buildSides(c, ms, me), participantCount: PTOnboarding.expectedPeople(c.mode, parts) };
    });
  }, [dash.bundle, dash.live, me, weekStart, profile.main_competition_id]);
  const dashModel = useMemo(
    () => (dash.bundle && dashComps.length ? PTDashboard.buildDashboard({ me, comps: dashComps, bundle: dash.bundle, weekStart }) : null),
    [dash.bundle, dashComps, me, weekStart]
  );
  const multi = dash.live.length >= 2;
  const showDashboard = tab === 'home' && multi && homeView === 'dashboard' && !!dashModel;
  // Gruppenziel geknackt: auch im Dashboard feiern (gleiche Merker wie in der Challenge)
  const dashWeekChallenges = useMemo(
    () => (dash.bundle ? dash.bundle.challenges.filter(ch => ch.week_start === weekStart && dash.live.some(c => c.id === ch.competition_id)) : []),
    [dash.bundle, dash.live, weekStart]
  );
  const dashCelebration = useCelebration(showDashboard ? dashWeekChallenges : [], dash.bundle?.sets || [], me, dash.bundle?.categories || []);
  const daysLeftNow = 7 - PTDashboard.dayIndexInWeek(weekStart);

  // ── Wochenabschluss-Feier ───────────────────────────────────────────────
  // Beim ersten Öffnen nach Sonntag für jede Challenge, in der ich letzte Woche
  // dabei war (einmal pro Challenge und Woche), dazu nach „Woche abschließen“.
  const lastWeek = PTData.addDays(weekStart, -7);
  const [finaleDone, setFinaleDone] = useState(false);
  const [forcedFinale, setForcedFinale] = useState(null);
  const weekResultFor = useCallback((x, ws) => {
    const chs = dash.bundle.challenges.filter(ch => ch.competition_id === x.c.id && ch.week_start === ws);
    if (!chs.length) return null;
    const parts = PTData.participantsFor(x.members, ws);
    if (!parts.some(m => m.user_id === me)) return null;
    return PTDashboard.weekResult({ me, c: x.c, sides: x.sides, challenges: chs, categories: dash.bundle.categories,
      sets: dash.bundle.sets, participantCount: parts.length, weekStart: ws });
  }, [dash.bundle, me]);
  const finales = useMemo(() => {
    if (!dash.fresh || !dash.bundle || finaleDone) return [];
    return dashComps.map(x => (finaleSeen(me, x.c.id, lastWeek) ? null : weekResultFor(x, lastWeek)))
      .filter(r => r?.active);
  }, [dash.fresh, dash.bundle, dashComps, me, lastWeek, finaleDone, weekResultFor]);
  const finaleShown = forcedFinale ? [forcedFinale] : (!layer && !medalCelebration && !intro && !loading ? finales : []);
  function closeFinale() {
    for (const r of finaleShown) markFinaleSeen(me, r.c.id, r.weekStart);
    setForcedFinale(null);
    setFinaleDone(true);
  }
  // Nach „Woche abschließen“ im Strafkonto: Feier für genau diese Woche
  function finaleForWeek(ws) {
    const parts = PTData.participantsFor(members, ws);
    const res = PTDashboard.weekResult({ me, c: competition, sides, challenges: allChallenges.filter(ch => ch.week_start === ws),
      categories, sets: allSets, participantCount: parts.length || sides.length, weekStart: ws });
    return res?.active ? res : null;
  }

  // Für „Auch anlegen in“ beim Wochenziel: die anderen laufenden Challenges
  const otherCompsForSetup = useMemo(() => {
    if (!dash.bundle) return [];
    const catById = Object.fromEntries(dash.bundle.categories.map(c => [c.id, c]));
    return dashComps.filter(x => x.c.id !== competition.id).map(x => ({
      c: x.c, participantCount: x.participantCount,
      challenges: dash.bundle.challenges.filter(ch => ch.competition_id === x.c.id),
      categories: dash.bundle.categories.filter(cat => cat.competition_id === x.c.id),
      categoryOf: (id) => catById[id],
    }));
  }, [dash.bundle, dashComps, competition.id]);

  // Andere eigene Challenges mit derselben Übung diese Woche („zählt auch für“)
  // Ohne Dashboard-Daten (noch nicht geladen, offline) undefined: dann fragt das
  // Log-Sheet selbst nach (log_targets) und log_set kopiert gewertete Übungen.
  const otherTargets = useCallback(
    (ch, cat) => (dash.bundle ? PTDashboard.matchingTargets({ bundle: dash.bundle, comps: dash.live, ch, cat, competitionId: competition.id }) : undefined),
    [dash.bundle, dash.live, competition.id]
  );

  // Ein Eintrag für alle Challenges mit dieser Übung (api.logEverywhere).
  async function logEverywhere({ targets, values, note = null, skip = [], createdAt = null }) {
    const chosen = targets.filter(t => !skip.includes(t.competition_id));
    const res = await api.logEverywhere({ targets: chosen, values, note, skip, createdAt });
    if (chosen.some(t => t.competition_id === competition.id)) reload();
    dash.reload();
    // Gespeichert, aber Kopien fehlen (Netz weg): nach der Erfolgsmeldung Bescheid geben
    if (res?.missing > 0) setTimeout(() => setToast(tr('Gespeichert, aber nicht in allen Challenges. Prüf deine Verbindung.')), 2700);
    return chosen.length - (res?.missing || 0);
  }
  const valueLabel = (cat, v) => `+${PTData.usesMinutes(cat) ? (window.formatDuration?.(v) ?? `${v}m`) : v}`;
  function logFailed(e) {
    if (e?.code === 'offline') setToast(tr('Keine Verbindung. Satz nicht gespeichert.'));
    else alert(e.message);
  }

  // Schnellsatz auf der Fokus-Karte einer zusammengeführten Übung
  async function dashQuickLog(ex, v) {
    try {
      const n = await logEverywhere({ targets: ex.targets, values: ex.minutes ? { duration_minutes: v } : { reps: v } });
      PTHaptics.tap();
      setToast(loggedToast(valueLabel(ex.cat, v), ex.cat?.name, n));
      maybePushPrimer();
    } catch (e) { logFailed(e); }
  }
  function dashOpenLog(ex) {
    const entry = ex.entries[0];
    setDashLog({ ex, entry });
  }
  function dashOpenChallenge(id) {
    setQuickCard(null);
    if (id === competition.id) { setHomeView('challenge'); setTab('home'); window.scrollTo?.(0, 0); }
    else onOpenCompetition?.(id);
  }

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

  const reload = useCallback(async () => {
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

      // Mitgliedschaft beendet (entfernt oder Challenge gelöscht)
      if (!member) onLeft?.();
    } catch (e) {
      console.error('reload failed', e);
      // Challenge nicht mehr sichtbar (entfernt worden) → zurück zur Auswahl
      if (e?.code === 'PGRST116') onLeft?.();
    } finally {
      setLoading(false);
    }
  }, [capi, me, notificationsOn, cacheName]);

  function notify(set) {
    const isWork = PTData.usesMinutes(set.category);
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
          // Rangliste-Pushes (überholt, letzter Tag, Monatsabschluss) öffnen den Rangliste-Tab
          if (/^(rank_|month_|week_)/.test(data.kind || '')) { window.dispatchEvent(new CustomEvent('pt:nav-ranking')); return; }
          if (data.competition_id) window.dispatchEvent(new CustomEvent('pt:open-competition', { detail: { competitionId: data.competition_id } }));
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

  // Tap on push → switch to Feed tab (Rangliste-Pushes → Rangliste)
  useEffect(() => {
    const onNavFeed = () => setTab('feed');
    const onNavRanking = () => setTab('ranking');
    window.addEventListener('pt:nav-feed', onNavFeed);
    window.addEventListener('pt:nav-ranking', onNavRanking);
    return () => {
      window.removeEventListener('pt:nav-feed', onNavFeed);
      window.removeEventListener('pt:nav-ranking', onNavRanking);
    };
  }, []);

  const setupCategories = allowWork ? categories : categories.filter(c => (c.kind || 'sports') !== 'work');
  const openPenaltyCount = usePenalties ? penalties.filter(p => !p.paid).length : 0;

  return (
    <div className="app">
      <header className="app-header">
        <button className="app-header-text mu-header-title" onClick={onOpenSwitcher} aria-label={tr('Challenge wechseln, aktuell {name}', { name: competition.name })}>
          <span className="date">
            {todayGreeting()}, {profile.display_name.split(/\s+/)[0]} · {PTi18n.date(new Date(), { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="greeting">
            <span className="app-header-name">{showDashboard ? tr('Alle Challenges') : competition.name}</span>
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
        {showDashboard && (
          <DashboardScreen me={me} model={dashModel} weekStart={weekStart} daysLeft={daysLeftNow}
            focusKey={dashFocus} onFocus={setDashFocus}
            onOpenCard={(card) => setQuickCard(card)}
            onQuickLog={dashQuickLog}
            onOpenLog={dashOpenLog}
            onStartWorkout={dashOpenLog}
            onAddGoal={() => setSetupForChallenge({})} />
        )}
        {!showDashboard && tab === 'home' && multi && (
          <button type="button" className="db-back" onClick={() => setHomeView('dashboard')}>
            <Icon name="chevron" size={16} strokeWidth={2.5} /> {tr('Alle Challenges')}
          </button>
        )}
        {showDashboard ? null : loading ? <Loader /> : (<>
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

        {tab === 'home' && !currentChallenges.length && !proposalDismissed && weekTemplate.length > 0 &&
          <WeekFixCard template={weekTemplate} categories={categories} me={me}
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
          celebrate={synced && !finaleShown.length && !medalCelebration}
          layout={t.layout}
          competitionId={competition.id}
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
            try {
              const cat = categories.find(c => c.id === ch.category_id);
              const minutes = PTData.usesMinutes(cat);
              const first = isFirstLog && !minutes;
              const v = parseInt(val);
              const n = await logEverywhere({
                targets: [{ challenge_id: ch.id, competition_id: competition.id }, ...(otherTargets(ch, cat) || [])],
                values: minutes ? { duration_minutes: v } : { reps: v },
              });
              PTHaptics.tap();
              if (first) celebrateFirst(v, ch, cat);
              else { setToast(loggedToast(valueLabel(cat, v), cat?.name, n)); maybePushPrimer(); }
            } catch (e) { logFailed(e); }
          }} />
        }

        {tab === 'strafkonto' && usePenalties &&
        <StrafkontoScreen
          api={capi} me={me} sides={sides} members={members}
          penalties={penalties}
          closures={closures}
          openClosures={openClosures}
          payouts={payouts}
          onChange={reload} />
        }

        {tab === 'feed' && <FeedScreen feed={feedItems} me={me} sides={sides} categories={categories}
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
              onClick={() => {
                // „Heute“ nochmal antippen: zurück zum Dashboard über alle Challenges
                if (t.id === 'home' && tab === 'home' && multi && homeView === 'challenge') setHomeView('dashboard');
                setTab(t.id);
              }}>
              <span className="tab-icon">
                <Icon name={t.icon} size={22} />
                {t.badge > 0 && <span className="tab-badge" aria-label={trn(t.badge, '{n} offene Strafe', '{n} offene Strafen')}>{t.badge}</span>}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {closingWeek && (
        <WeekCloseSheet weekStart={closingWeek} api={capi} me={me}
          onClose={() => setClosingWeek(null)}
          onDone={() => { const res = finaleForWeek(closingWeek); setClosingWeek(null); if (res) setForcedFinale(res); else setToast(tr('Woche abgeschlossen')); reload(); }} />
      )}

      <Sheet open={!!setupForChallenge} onClose={() => setSetupForChallenge(null)}>
        <SetupSheet
          api={capi}
          baseApi={api}
          me={me}
          categories={setupCategories}
          allowWork={allowWork}
          weekStart={weekStart}
          participantCount={peopleForShare}
          competitionName={multi ? competition.name : ''}
          existing={setupForChallenge?.id ? setupForChallenge : null}
          usedCategoryIds={currentChallenges.filter(c => c.id !== setupForChallenge?.id).map(c => c.category_id)}
          otherComps={otherCompsForSetup}
          onClose={() => setSetupForChallenge(null)}
          onSaved={(copied) => {
            setSetupForChallenge(null);
            setToast(copied ? trn(copied, 'Ziel gespeichert, auch in {n} weiteren Challenge', 'Ziel gespeichert, auch in {n} weiteren Challenges') : tr('Ziel gespeichert'));
            reload(); dash.reload();
          }}
          onDeleted={() => {setSetupForChallenge(null);setToast(tr('Ziel gelöscht'));reload(); dash.reload();}}
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
                  reload(); dash.reload();
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
                  reload(); dash.reload();
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
              others={otherTargets(logForChallenge, logCat)}
              onSubmit={async ({ values, note, skip }) => {
                logCountRef.current = await logEverywhere({ values, note, skip,
                  targets: [{ challenge_id: logForChallenge.id, competition_id: competition.id }, ...(otherTargets(logForChallenge, logCat) || [])] });
              }}
              onClose={() => setLogForChallenge(null)}
              onLogged={(r, isWork) => {
                const ch = logForChallenge;
                setLogForChallenge(null);
                PTHaptics.tap();
                const valStr = isWork ? (window.formatDuration?.(r) ?? `${r}m`) : `+${r}`;
                if (isFirstLog && !isWork) celebrateFirst(r, ch, logCat);
                else { setToast(loggedToast(valStr, catName, logCountRef.current)); maybePushPrimer(); }
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
          onSubmit={({ challenge, category, values, createdAt }) => logEverywhere({ values, createdAt,
            targets: [{ challenge_id: challenge.id, competition_id: competition.id }, ...(otherTargets(challenge, category) || [])] })}
          onClose={() => setBackfillOpen(false)}
          onSaved={(r, isWork) => {setBackfillOpen(false);setToast(isWork ? tr('{value} nachgetragen', { value: window.formatDuration?.(r) ?? `${r}m` }) : tr('+{n} nachgetragen', { n: r }));}} />
      </Sheet>

      {/* Eintragen aus dem Dashboard: zählt für alle Challenges mit dieser Übung */}
      <Sheet open={!!dashLog} onClose={() => setDashLog(null)}>
        {dashLog && (() => {
          const { ex, entry } = dashLog;
          const cid = entry.card.c.id;
          const entryApi = cid === competition.id ? capi : api.forCompetition(cid);
          const close = () => setDashLog(null);
          const done = (text) => { close(); setToast(text); reload(); dash.reload(); };
          if (ex.catType === 'tom_holland') {
            return <TomHollandSheet api={entryApi} me={me} challenge={entry.row.ch} allSets={dash.bundle?.sets || []} onClose={close}
              onLogged={(rounds) => done(trn(rounds, '{n} Runde {name} geloggt', '{n} Runden {name} geloggt', { name: ex.cat?.name || '' }))} />;
          }
          if (ex.catType === 'bring_sally_up') {
            return <BringSallySheet api={entryApi} me={me} challenge={entry.row.ch} allSets={dash.bundle?.sets || []} onClose={close}
              onLogged={(val) => done(val >= 204 ? tr('Bring Sally Up geschafft!') : loggedToast(`${Math.floor(val / 60)}:${String(val % 60).padStart(2, '0')}`, ex.cat?.name))} />;
          }
          return (
            <LogSheet api={entryApi} me={me} challenge={entry.row.ch} category={ex.cat}
              projectTags={cid === competition.id ? projectTags : []} toolTags={cid === competition.id ? toolTags : []}
              others={ex.entries.slice(1).map(e => ({ competition_id: e.card.c.id, name: e.card.c.name, emoji: e.card.c.emoji }))}
              onSubmit={async ({ values, note, skip }) => { logCountRef.current = await logEverywhere({ targets: ex.targets, values, note, skip }); }}
              onClose={close}
              onLogged={(r, isWork) => {
                close();
                PTHaptics.tap();
                setToast(loggedToast(isWork ? (window.formatDuration?.(r) ?? `${r}m`) : `+${r}`, ex.cat?.name, logCountRef.current));
                maybePushPrimer();
              }} />
          );
        })()}
      </Sheet>

      <Sheet open={!!quickCard} onClose={() => setQuickCard(null)}>
        {quickCard && (
          <ChallengeQuickSheet
            card={dashModel?.cards.find(x => x.c.id === quickCard.c.id) || quickCard}
            weekStart={weekStart} daysLeft={daysLeftNow}
            onClose={() => setQuickCard(null)}
            onOpen={() => dashOpenChallenge(quickCard.c.id)} />
        )}
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
          onDone={(ch) => { reload(); dash.reload(); advance({ goals: 1, data: { extra: [ch] } }); }}
          onSkip={() => advance({ goals: live.current.goals })}
          onMore={() => { layerQueue.current = []; setLayer(null); onIntroDone?.(); setSetupForChallenge({}); }} />
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
        <ObWeekOne summary={layer.summary} onDone={() => {
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

      {finaleShown.length > 0 && <WeekFinale results={finaleShown} onDone={closeFinale} />}
      {/* Immer nur eine Feier gleichzeitig (CelebrationOverlay sucht sein Element per Klasse) */}
      {showDashboard && dash.fresh && !finaleShown.length && !medalCelebration && dashCelebration.pendingCelebration && (
        <CelebrationOverlay
          category={dashCelebration.pendingCelebration.category}
          targetReps={dashCelebration.pendingCelebration.challenge.target_reps}
          onDone={dashCelebration.dismissCurrent} />
      )}

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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
