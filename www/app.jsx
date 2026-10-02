/* global React, ReactDOM, PTData, PTPeople, Icon, Sheet, Toast, HomeScreen, SetupSheet, LogSheet, TomHollandSheet, BringSallySheet, FeedScreen, HistoryScreen, EmojiPickerSheet, BackfillSheet, todayGreeting, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, WeekFixCard, buildSides, totalsBySide, uniqueMaxIndex, Avatar, AuthScreen, OnboardingScreen, ChallengeSwitcherSheet, CreateCompetitionSheet, JoinCompetitionSheet, ProfileSheet */
const { useState, useEffect, useMemo, useCallback } = React;

const SUPABASE_URL = "https://jczyyupxxqrdgbeifcwe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjenl5dXB4eHFyZGdiZWlmY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMjgsImV4cCI6MjA5NDA4MjIyOH0.2Bz6R3N3p3evHXB7j5cKamq2egHrE1zYfgLcV2R8awg";

const ACTIVE_KEY = 'pt_active_competition';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#32d74b",
  "layout": "rings",
  "notifications": true
} /*EDITMODE-END*/;

function Loader({ text = 'Lade Daten…' }) {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <div className="app-loader-spinner" aria-hidden="true" />
      <div className="app-loader-text">{text}</div>
    </div>
  );
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

  // Theme: end-user preference persists in localStorage (override of tweak default).
  // Settings dispatches 'pt:theme-change' to update without reload.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pt:theme') || t.theme || 'dark'; }
    catch (e) { return t.theme || 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pt:theme', theme); } catch (e) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
  }, [theme]);
  useEffect(() => {
    const onChange = (e) => { if (e?.detail?.theme) setTheme(e.detail.theme); };
    window.addEventListener('pt:theme-change', onChange);
    return () => window.removeEventListener('pt:theme-change', onChange);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
  }, [t.accent]);

  const api = useMemo(() => PTData.init({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }), []);

  const [session, setSession] = useState(undefined); // undefined = lädt, null = abgemeldet
  const [profile, setProfile] = useState(null);
  const [competitions, setCompetitions] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [sheet, setSheet] = useState(null); // 'switcher' | 'create' | 'join' | 'profile'
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!api) return;
    api.getSession().then(setSession).catch(() => setSession(null));
    return api.onAuthChange((s) => setSession(s));
  }, [api]);

  const userId = session?.user?.id || null;

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

  const loadAccount = useCallback(async (preferId) => {
    if (!api || !userId) return;
    try {
      const [p, list] = await Promise.all([api.getMyProfile(), api.listMyCompetitions()]);
      PTPeople.set([p]);
      setProfile(p);
      setCompetitions(list);
      setActiveId(cur => pickActive(p, list, preferId ?? cur));
      setAccountError('');
    } catch (e) {
      console.error('loadAccount failed', e);
      setAccountError(e.message || String(e));
    }
  }, [api, userId, pickActive]);

  useEffect(() => {
    if (userId) loadAccount();
    else { setProfile(null); setCompetitions(null); setActiveId(null); }
  }, [userId, loadAccount]);

  useEffect(() => {
    if (activeId) { try { localStorage.setItem(ACTIVE_KEY, activeId); } catch (e) {} }
  }, [activeId]);

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
    if (!confirm('Abmelden?')) return;
    try {
      const saved = localStorage.getItem('pt_apns_token');
      if (saved) { await api.deleteDeviceToken(saved).catch(() => {}); localStorage.removeItem('pt_apns_token'); }
    } catch (e) {}
    setSheet(null);
    await api.signOut();
  }

  async function setMain(id) {
    try {
      const p = await api.updateProfile({ main_competition_id: id });
      setProfile(p);
      setToast(id ? 'Haupt-Challenge gesetzt ★' : 'Haupt-Challenge entfernt');
    } catch (e) { alert(e.message); }
  }

  if (!api) {
    return (
      <div className="name-picker">
        <div className="brand">Projekt Terminator</div>
        <h1>Keine Verbindung</h1>
        <p className="sub">Die App braucht Internet, um deine Challenges zu laden.</p>
        <button className="btn" onClick={() => location.reload()}>Erneut versuchen</button>
      </div>
    );
  }
  if (session === undefined) return <Loader text="Starte…" />;
  if (!session) return <AuthScreen api={api} />;
  if (accountError && !profile) {
    return (
      <div className="name-picker">
        <div className="brand">Projekt Terminator</div>
        <h1>Laden fehlgeschlagen</h1>
        <p className="sub">{accountError}</p>
        <button className="btn" onClick={() => loadAccount()}>Erneut versuchen</button>
        <button className="btn-link" style={{ marginTop: 16 }} onClick={() => api.signOut()}>Abmelden</button>
      </div>
    );
  }
  if (!profile || !competitions) return <Loader text="Lade Profil…" />;

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
        onCreated={async (c) => { setSheet(null); await loadAccount(c.id); setActiveId(c.id); }} />
      <JoinCompetitionSheet open={sheet === 'join'} api={api} onClose={() => setSheet(null)}
        onJoined={async (id) => { setSheet(null); await loadAccount(id); setActiveId(id); setToast('Willkommen in der Challenge 💪'); }} />
      <ProfileSheet open={sheet === 'profile'} api={api} profile={profile} onClose={() => setSheet(null)}
        onSignOut={signOut}
        onSaved={(p, opts) => { PTPeople.set([p]); setProfile(p); if (!opts?.keepOpen) { setSheet(null); setToast('Profil gespeichert'); } }} />
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );

  if (!active) {
    return (
      <>
        <OnboardingScreen profile={profile}
          onCreate={() => setSheet('create')} onJoin={() => setSheet('join')}
          onProfile={() => setSheet('profile')} onSignOut={signOut} />
        {sheets}
      </>
    );
  }

  return (
    <>
      <CompetitionApp key={active.id}
        api={api} competition={active} profile={profile} me={profile.id}
        competitions={competitions}
        t={t} setTweak={setTweak}
        onOpenSwitcher={() => setSheet('switcher')}
        onCompetitionChanged={() => loadAccount()}
        onLeft={async () => { setActiveId(null); await loadAccount(null); setToast('Challenge verlassen'); }} />
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
      const isWorkCh = (catById[ch.category_id]?.kind || 'sports') === 'work';
      const val = (s) => isWorkCh ? (s.duration_minutes ?? 0) : (s.reps ?? 0);
      const csets = allSets.filter(s => s.challenge_id === ch.id);
      const doneBySide = totalsBySide(csets, sides, val);
      const total = doneBySide.reduce((a, x) => a + x, 0);
      const hitBySide = doneBySide.map(d => d >= ch.target_reps);
      const fairShare = PTData.fairShareOf(ch.target_reps, participants.length || sides.length);
      return { ch, cat: catById[ch.category_id], total, doneBySide, hitBySide, hit: hitBySide.every(Boolean), isWorkCh, val, fairShare };
    });
    const totals = sides.map((_, i) => challStats.reduce((s, x) => s + x.doneBySide[i], 0));
    const sumAll = totals.reduce((a, x) => a + x, 0);
    const winnerIdx = uniqueMaxIndex(totals);
    const ranked = totals.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    const diff = ranked.length > 1 ? ranked[0].v - ranked[1].v : ranked[0]?.v || 0;
    const hitCount = challStats.filter(c => c.hit).length;
    const allWork = challStats.length > 0 && challStats.every(c => c.isWorkCh);
    const unit = allWork ? 'min' : 'Reps';
    const winnerLabel = winnerIdx != null ? sides[winnerIdx].label : null;
    let analysis;
    if (sumAll === 0) analysis = 'Stille Woche. Auf in die nächste!';
    else if (winnerIdx == null) analysis = 'Unentschieden an der Spitze — perfekt ausbalanciert.';
    else if (diff / sumAll > 0.4) analysis = `Klare Sache: ${winnerLabel} dominiert mit ${diff} ${unit} Vorsprung.`;
    else if (diff / sumAll > 0.15) analysis = `${winnerLabel} setzt sich durch — ${diff} ${unit} Vorsprung.`;
    else analysis = `Knapper Sieg für ${winnerLabel} — nur ${diff} ${unit} Unterschied.`;

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
function CompetitionApp({ api, competition: initialCompetition, profile, me, t, setTweak,
  onOpenSwitcher, onCompetitionChanged, onLeft }) {
  const capi = useMemo(() => api.forCompetition(initialCompetition.id), [api, initialCompetition.id]);

  const [competition, setCompetition] = useState(initialCompetition);
  useEffect(() => { setCompetition(c => ({ ...c, ...initialCompetition })); }, [initialCompetition]);

  // Tabs
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('pt:tab') || 'home'; } catch { return 'home'; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('pt:tab', tab); } catch {}
  }, [tab]);
  useEffect(() => {
    if (tab === 'strafkonto' && !competition.penalties_enabled) setTab('home');
  }, [tab, competition.penalties_enabled]);

  // Data
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allChallenges, setAllChallenges] = useState([]);
  const [feed, setFeed] = useState([]);
  const [allSets, setAllSets] = useState([]);
  const [planSlots, setPlanSlots] = useState([]);
  const [rotationConfig, setRotationConfig] = useState(null);
  const [penalties, setPenalties] = useState([]);
  const [closures, setClosures] = useState([]);
  const [openClosures, setOpenClosures] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [projectTags, setProjectTags] = useState([]);
  const [toolTags, setToolTags]       = useState([]);
  const [closingWeek, setClosingWeek] = useState(null);
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  // UI state
  const [setupForChallenge, setSetupForChallenge] = useState(null); // null=closed, {} = new, {id, ...} = edit
  const [logForChallenge, setLogForChallenge] = useState(null); // null=closed, {challenge}=open
  const [pickerForSet, setPickerForSet] = useState(null); // null=closed, set object = emoji picker open
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [toast, setToast] = useState('');
  const lastFeedRef = React.useRef(null);

  const sides = useMemo(() => buildSides(competition, members, me), [competition, members, me]);
  const allowWork = !!competition.work_enabled;
  const usePenalties = !!competition.penalties_enabled;
  const useRotation = !!competition.rotation_enabled;

  // This week
  const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
  const currentChallenges = allChallenges.filter((c) => c.week_start === weekStart);
  const participantsNow = useMemo(() => PTData.participantsFor(members, weekStart), [members, weekStart]);

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

  const feedItems = useMemo(() => {
    // Past-week sets are represented by their WeekRecap card — drop the
    // individual entries so the feed stays bounded.
    const currentSets = feed.filter(s => {
      if (!s.created_at) return true;
      return PTData.isoDate(new Date(s.created_at)) >= weekStart;
    });
    const items = [...weekRecaps, ...currentSets.map(s => ({ kind: 'set', ...s }))];
    items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return items;
  }, [feed, weekRecaps, weekStart]);

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
      setToast(`Woche fixiert – los geht's, ${profile.display_name.split(/\s+/)[0]}!`);
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
      PTPeople.set(mems.map(m => m.profile).filter(Boolean));
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

      // Notification trigger
      if (lastFeedRef.current !== null && feedData[0] && feedData[0].id !== lastFeedRef.current &&
      feedData[0].athlete !== me && t.notifications) {
        notify(feedData[0]);
      }
      lastFeedRef.current = feedData[0]?.id || null;

      // Mitgliedschaft beendet (entfernt oder Challenge gelöscht)
      if (!mems.some(m => m.user_id === me && !m.left_at)) onLeft?.();
    } catch (e) {
      console.error('reload failed', e);
      // Challenge nicht mehr sichtbar (entfernt worden) → zurück zur Auswahl
      if (e?.code === 'PGRST116') onLeft?.();
    } finally {
      setLoading(false);
    }
  }, [capi, me, t.notifications]);

  function notify(set) {
    const isWork = set.category?.kind === 'work';
    const who = PTPeople.firstNameOf(set.athlete);
    const valStr = isWork ? window.formatDuration?.(set.duration_minutes) ?? `${set.duration_minutes}m` : `+${set.reps}`;
    setToast(`${who}: ${valStr} ${set.category?.name || ''}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${isWork ? '💻' : '💪'} ${who} hat geliefert`, {
        body: `${valStr} ${set.category?.name || (isWork ? 'min' : 'Reps')} · ${competition.name}`,
        icon: '/favicon.ico'
      });
    }
  }

  useEffect(() => {
    reload();
    const off = capi.onChange(reload);
    return off;
  }, [capi, reload]);

  // Ask for notification permission on first interaction
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default' && t.notifications) {
      // Defer to first user gesture to avoid blocking
      const ask = () => {Notification.requestPermission();document.removeEventListener('click', ask);};
      document.addEventListener('click', ask, { once: true });
    }
  }, [t.notifications]);

  // Native APNs registration (Capacitor only — web uses the Notification API above)
  useEffect(() => {
    const Push = window.PTPushNotifications?.PushNotifications;
    if (!Push) return; // not running natively, nothing to do

    if (!t.notifications) {
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
        const perm = await Push.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          const req = await Push.requestPermissions();
          if (req.receive !== 'granted') return;
        } else if (perm.receive !== 'granted') {
          return;
        }
        if (cancelled) return;
        await Push.register();

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
          const competitionId = action?.notification?.data?.competition_id;
          if (competitionId) window.dispatchEvent(new CustomEvent('pt:open-competition', { detail: { competitionId } }));
          window.dispatchEvent(new CustomEvent('pt:nav-feed'));
        });
        // Foreground deliveries: do nothing here. Supabase Realtime + the
        // existing notify() toast covers in-app feedback. iOS suppresses
        // the banner automatically while the app is in the foreground.

        cleanup = () => { onReg.remove(); onErr.remove(); onTap.remove(); };
      } catch (e) { console.warn('Push setup failed', e); }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [me, t.notifications, api]);

  // Tap on push → switch to Feed tab
  useEffect(() => {
    const onNavFeed = () => setTab('feed');
    window.addEventListener('pt:nav-feed', onNavFeed);
    return () => window.removeEventListener('pt:nav-feed', onNavFeed);
  }, []);

  const setupCategories = allowWork ? categories : categories.filter(c => (c.kind || 'sports') !== 'work');
  const openPenaltyCount = usePenalties ? penalties.filter(p => !p.paid).length : 0;

  return (
    <div className="app">
      <header className="app-header">
        <button className="mu-header-title" onClick={onOpenSwitcher} aria-label="Challenge wechseln">
          <div className="greeting">{todayGreeting()}, {profile.display_name.split(/\s+/)[0]}</div>
          <div className="date mu-header-comp">
            <span className="mu-header-emoji">{competition.emoji}</span>
            <span className="mu-header-name">{competition.name}</span>
            <span className="mu-header-caret">▾</span>
          </div>
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="icon-btn header-gear" aria-label="Einstellungen" onClick={() => setTab('settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="avatar-btn side-0" onClick={onOpenSwitcher} title="Challenges & Profil">
            <Avatar userId={me} profile={profile} size={36} className="avatar-img" />
          </button>
        </div>
      </header>

      <main className="app-main">
        {loading ? <Loader /> : (<>
        {tab === 'home' && sides.length < 2 && (
          <div className="banner mu-invite-banner">
            <div className="banner-icon">👋</div>
            <div className="banner-text">
              <strong>Noch allein hier.</strong> Lade Freunde mit dem Code <span className="mono">{competition.invite_code}</span> ein.
              <button className="btn-link" onClick={() => window.shareInvite(competition)}>Einladen</button>
            </div>
          </div>
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
          participantCount={participantsNow.length}
          challenges={currentChallenges}
          categories={categories}
          allSets={allSets}
          layout={t.layout}
          weekStart={weekStart}
          nextWeekStart={nextWeekStart}
          nextWeekChallenges={nextWeekChallenges}
          nextWeekProposals={nextWeekProposals}
          openClosures={usePenalties ? openClosures : []}
          onCloseWeek={(w) => setClosingWeek(w)}
          onAddGoal={() => setSetupForChallenge({})}
          onEditChallenge={(ch) => setSetupForChallenge(ch)}
          onLogChallenge={(ch) => setLogForChallenge(ch)}
          onQuickLog={async (ch, val) => {
            try {
              const cat = categories.find(c => c.id === ch.category_id);
              const isWork = cat?.kind === 'work';
              const payload = isWork
                ? { challenge_id: ch.id, reps: null, duration_minutes: parseInt(val), note: null }
                : { challenge_id: ch.id, reps: parseInt(val), note: null };
              await capi.addSet(payload);
              setToast(`+${val} ${isWork ? 'min 💻' : 'geloggt 💪'}`);
              reload();
            } catch (e) { alert(e.message); }
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
          onOpenSettings={() => setTab('settings')} />
        }

        {tab === 'feed' && <FeedScreen feed={feedItems} me={me} sides={sides} categories={categories}
          projectTags={projectTags} toolTags={toolTags}
          onEditSet={async (s, patch) => { try { await capi.updateSet(s.id, patch); setToast('Satz aktualisiert'); reload(); } catch (e) { alert(e.message); } }}
          onDeleteSet={async (s) => { try { await capi.deleteSet(s.id); setToast('Gelöscht'); reload(); } catch (e) { alert(e.message); } }}
          onToggleReaction={async (s, emoji) => {
            const mineHas = (s.reactions || []).some(r => r.athlete === me && r.emoji === emoji);
            try {
              if (mineHas) await capi.removeReaction({ set_id: s.id, emoji });
              else await capi.addReaction({ set_id: s.id, emoji });
              reload();
            } catch (e) { alert(e.message); }
          }}
          onPickEmoji={(s) => setPickerForSet(s)}
          onBackfill={() => setBackfillOpen(true)} />}

        {tab === 'history' &&
        <StatsTab
          api={api}
          me={me}
          profile={profile}
          competition={competition}
          sides={sides}
          challenges={allChallenges}
          categories={categories}
          allSets={allSets} />
        }

        {tab === 'settings' &&
        <SettingsScreen api={capi} baseApi={api} categories={categories} onAddCategory={reload}
          me={me}
          competition={competition}
          members={members}
          notificationsEnabled={t.notifications}
          onSetNotifications={(v) => setTweak('notifications', v)}
          projectTags={projectTags}
          toolTags={toolTags}
          onCompetitionChanged={() => { reload(); onCompetitionChanged?.(); }}
          onLeft={onLeft}
          reload={reload} />
        }
        </>)}
      </main>

      <nav className="tabbar">
        <div className="tabbar-inner">
          <button className={`tab-btn ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            <Icon name="home" /> Heute
          </button>
          <button className={`tab-btn ${tab === 'feed' ? 'active' : ''}`} onClick={() => setTab('feed')}>
            <Icon name="feed" /> Feed
          </button>
          <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <Icon name="trophy" /> Stats
          </button>
          {usePenalties && (
            <button className={`tab-btn ${tab === 'strafkonto' ? 'active' : ''}`} onClick={() => setTab('strafkonto')}>
              <Icon name="scale" /> Strafkonto
              {openPenaltyCount > 0 && <span className="tab-badge">{openPenaltyCount}</span>}
            </button>
          )}
        </div>
      </nav>

      {closingWeek && (
        <WeekCloseSheet weekStart={closingWeek} api={capi} me={me}
          onClose={() => setClosingWeek(null)}
          onDone={() => { setClosingWeek(null); setToast('Woche abgeschlossen'); reload(); }} />
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
          onSaved={() => {setSetupForChallenge(null);setToast('Ziel gespeichert');reload();}}
          onDeleted={() => {setSetupForChallenge(null);setToast('Ziel gelöscht');reload();}}
          onAddCategory={reload} />
      </Sheet>

      <Sheet open={!!logForChallenge} onClose={() => setLogForChallenge(null)}>
        {(() => {
          if (!logForChallenge) return null;
          const logCat = categories.find(c => c.id === logForChallenge.category_id);
          const ctype = logCat?.challenge_type || 'standard';
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
                  setToast(`${rounds} Runden geloggt 🦸`);
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
                  setToast(val >= 204 ? '✅ Bring Sally Up geschafft!' : `${m}:${String(s).padStart(2,'0')} geloggt 🌸`);
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
                setLogForChallenge(null);
                const valStr = isWork ? (window.formatDuration?.(r) ?? `${r}m`) : `+${r}`;
                setToast(`${valStr} geloggt ${isWork ? '💻' : '💪'}`);
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
          onSaved={(r) => {setBackfillOpen(false);setToast(`+${r} nachgetragen`);reload();}} />
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

      <Toast message={toast} onDone={() => setToast('')} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakRadio label="Modus" value={t.theme} options={['dark', 'light']}
        onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Akzent" value={t.accent} onChange={(v) => setTweak('accent', v)}
        options={['#32d74b', '#0a84ff', '#ff375f', '#ff9f0a', '#bf5af2']} />
        <TweakSection label="Layout" />
        <TweakRadio label="Heute-Screen" value={t.layout}
        options={[{ label: 'Ring', value: 'rings' }, { label: 'Balken', value: 'bar' }, { label: 'Zahl', value: 'numeric' }]}
        onChange={(v) => setTweak('layout', v)} />
        <TweakSection label="Sonstiges" />
        <TweakToggle label="Benachrichtigungen" value={t.notifications}
        onChange={(v) => setTweak('notifications', v)} />
      </TweaksPanel>
    </div>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
