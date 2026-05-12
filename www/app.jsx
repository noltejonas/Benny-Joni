/* global React, ReactDOM, PTData, Icon, Sheet, Toast, HomeScreen, SetupSheet, LogSheet, FeedScreen, HistoryScreen, EmojiPickerSheet, todayGreeting, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, WeekFixCard */
const { useState, useEffect, useMemo, useCallback } = React;

// User edits these to point to their Supabase project. Empty = demo mode.
const SUPABASE_URL = "https://jczyyupxxqrdgbeifcwe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impjenl5dXB4eHFyZGdiZWlmY3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMjgsImV4cCI6MjA5NDA4MjIyOH0.2Bz6R3N3p3evHXB7j5cKamq2egHrE1zYfgLcV2R8awg";

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#32d74b",
  "layout": "rings",
  "notifications": true
} /*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { switching, triggerSwitch } = window.useAccountSwitch();

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

  // Data API (Supabase or demo)
  const api = useMemo(() => PTData.init({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY }), []);

  // Current user
  const [me, setMe] = useState(() => localStorage.getItem('pt_me') || null);
  useEffect(() => {if (me) localStorage.setItem('pt_me', me);}, [me]);

  // Tabs
  const [tab, setTab] = useState('home');

  // Data
  const [categories, setCategories] = useState([]);
  const [allChallenges, setAllChallenges] = useState([]);
  const [feed, setFeed] = useState([]);
  const [allSets, setAllSets] = useState([]);
  const [planSlots, setPlanSlots] = useState([]);
  const [rotationConfig, setRotationConfig] = useState(null);
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  // UI state
  const [setupForChallenge, setSetupForChallenge] = useState(null); // null=closed, {} = new, {id, ...} = edit
  const [logForChallenge, setLogForChallenge] = useState(null); // null=closed, {challenge}=open
  const [pickerForSet, setPickerForSet] = useState(null); // null=closed, set object = emoji picker open
  const [toast, setToast] = useState('');
  const lastFeedRef = React.useRef(null);

  // This week
  const weekStart = PTData.isoDate(PTData.mondayOf(new Date()));
  const currentChallenges = allChallenges.filter((c) => c.week_start === weekStart);

  const weekTemplate = useMemo(() => {
    if (!PTData.weekTemplateFor || !rotationConfig || !planSlots.length) return [];
    return PTData.weekTemplateFor({ weekStart, slots: planSlots, config: rotationConfig });
  }, [weekStart, planSlots, rotationConfig]);

  // Next week preview — actual challenges if already set up, otherwise rotation suggestions.
  const nextWeekStart = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return PTData.isoDate(d);
  }, [weekStart]);
  const nextWeekChallenges = useMemo(
    () => allChallenges.filter(c => c.week_start === nextWeekStart),
    [allChallenges, nextWeekStart]
  );
  const nextWeekProposals = useMemo(() => {
    if (!PTData.suggestForWeek || !rotationConfig || !planSlots.length) return [];
    return PTData.suggestForWeek({ weekStart: nextWeekStart, slots: planSlots, config: rotationConfig });
  }, [nextWeekStart, planSlots, rotationConfig]);

  // Wochenabschluss-Recaps für jede abgeschlossene Woche (Sonntag 23:59:59 < jetzt)
  const weekRecaps = useMemo(() => {
    if (!allChallenges.length) return [];
    const byWeek = {};
    for (const ch of allChallenges) {
      (byWeek[ch.week_start] ||= []).push(ch);
    }
    const catById = Object.fromEntries(categories.map(c => [c.id, c]));
    const now = new Date();
    const out = [];
    for (const ws of Object.keys(byWeek)) {
      const monday = new Date(ws + 'T00:00:00');
      const sundayEnd = new Date(monday); sundayEnd.setDate(monday.getDate() + 6); sundayEnd.setHours(23,59,59,999);
      if (now <= sundayEnd) continue;
      const challs = byWeek[ws];
      const challStats = challs.map(ch => {
        const csets = allSets.filter(s => s.challenge_id === ch.id);
        const bennyDone = csets.filter(s => s.athlete === 'Benny').reduce((a,x)=>a+x.reps,0);
        const jonasDone = csets.filter(s => s.athlete === 'Jonas').reduce((a,x)=>a+x.reps,0);
        const total = bennyDone + jonasDone;
        const bennyHit = bennyDone >= ch.target_reps;
        const jonasHit = jonasDone >= ch.target_reps;
        return { ch, cat: catById[ch.category_id], total, bennyDone, jonasDone, bennyHit, jonasHit, hit: bennyHit && jonasHit };
      });
      const bennyTotal = challStats.reduce((s,x)=>s+x.bennyDone,0);
      const jonasTotal = challStats.reduce((s,x)=>s+x.jonasDone,0);
      const sumAll = bennyTotal + jonasTotal;
      const winner = bennyTotal === jonasTotal ? null : (bennyTotal > jonasTotal ? 'Benny' : 'Jonas');
      const diff = Math.abs(bennyTotal - jonasTotal);
      const hitCount = challStats.filter(c => c.hit).length;
      let analysis;
      if (sumAll === 0) analysis = 'Stille Woche. Auf in die nächste!';
      else if (!winner) analysis = 'Unentschieden — perfekt ausbalanciert.';
      else if (diff / sumAll > 0.4) analysis = `Klare Sache: ${winner} dominiert mit ${diff} Reps Vorsprung.`;
      else if (diff / sumAll > 0.15) analysis = `${winner} setzt sich durch — ${diff} Reps Vorsprung.`;
      else analysis = `Knapper Sieg für ${winner} — nur ${diff} Reps Unterschied.`;
      out.push({
        kind: 'recap',
        id: `recap-${ws}`,
        week_start: ws,
        created_at: sundayEnd.toISOString(),
        challStats, bennyTotal, jonasTotal, winner, diff, sumAll, hitCount, totalChallenges: challs.length,
        analysis,
      });
    }
    return out;
  }, [allChallenges, allSets, categories]);

  const feedItems = useMemo(() => {
    const items = [...weekRecaps, ...feed.map(s => ({ kind: 'set', ...s }))];
    items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return items;
  }, [feed, weekRecaps]);

  async function fixWeek(picks) {
    try {
      for (const p of picks) {
        if (currentChallenges.find(c => c.category_id === p.category_id)) continue;
        await api.upsertChallenge({
          week_start: weekStart,
          category_id: p.category_id,
          chosen_by: me,
          target_reps: p.target_reps,
        });
      }
      setToast(`Woche fixiert – los geht's, ${me}!`);
      reload();
    } catch (e) { alert(e.message); }
  }

  const reload = useCallback(async () => {
    try {
      const [cats, challs, feedData, allSetsData, slots, cfg] = await Promise.all([
      api.getCategories(),
      api.listChallenges(),
      api.recentFeed(100),
      api.getAllSets ? api.getAllSets() : api.recentFeed(10000),
      api.getPlanSlots ? api.getPlanSlots() : [],
      api.getRotationConfig ? api.getRotationConfig() : null]
      );
      setCategories(cats);
      setAllChallenges(challs);
      setFeed(feedData);
      setAllSets(allSetsData);
      setPlanSlots(slots);
      setRotationConfig(cfg);

      // Notification trigger
      if (lastFeedRef.current !== null && feedData[0] && feedData[0].id !== lastFeedRef.current &&
      feedData[0].athlete !== me && t.notifications) {
        notify(feedData[0]);
      }
      lastFeedRef.current = feedData[0]?.id || null;
    } catch (e) {
      console.error('reload failed', e);
    } finally {
      setLoading(false);
    }
  }, [api, me, t.notifications]);

  function notify(set) {
    setToast(`${set.athlete}: +${set.reps} ${set.category?.name || ''}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`💪 ${set.athlete} hat geliefert`, {
        body: `+${set.reps} ${set.category?.name || 'Reps'}`,
        icon: '/favicon.ico'
      });
    }
  }

  useEffect(() => {
    reload();
    const off = api.onChange(reload);
    return off;
  }, [api, reload]);

  // Ask for notification permission on first interaction
  useEffect(() => {
    if (!me) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default' && t.notifications) {
      // Defer to first user gesture to avoid blocking
      const ask = () => {Notification.requestPermission();document.removeEventListener('click', ask);};
      document.addEventListener('click', ask, { once: true });
    }
  }, [me, t.notifications]);

  // Native APNs registration (Capacitor only — web uses the Notification API above)
  useEffect(() => {
    if (!me) return;
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
            await api.upsertDeviceToken({ token: info.value, athlete: me, platform: 'ios' });
            localStorage.setItem('pt_apns_token', info.value);
          } catch (e) { console.warn('upsertDeviceToken failed', e); }
        });
        const onErr = await Push.addListener('registrationError', (e) => {
          console.warn('Push registrationError', e);
        });
        const onTap = await Push.addListener('pushNotificationActionPerformed', () => {
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

  // ─── Name picker (initial) ────────────────────────────────────────────────
  if (!me) {
    return (
      <div className="name-picker">
        <div className="brand">Projekt Terminator</div>
        <h1>Wer trainiert?</h1>
        <p className="sub">Wähle deinen Namen aus. Beide trainieren auf das gleiche Wochenziel hin.</p>
        <div className="name-tiles">
          <button className="name-tile benny" onClick={() => setMe('Benny')}>
            <div className="name-tile-initial">B</div>
            Benny
          </button>
          <button className="name-tile jonas" onClick={() => setMe('Jonas')}>
            <div className="name-tile-initial">J</div>
            Jonas
          </button>
        </div>
      </div>);

  }

  const other = me === 'Benny' ? 'Jonas' : 'Benny';

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="greeting">{todayGreeting()}, {me}</div>
          <div className="date">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`conn-pill ${api.mode === 'demo' ? 'demo' : ''}`}>
            <span className="dot"></span> {api.mode === 'demo' ? 'Demo' : 'Live'}
          </span>
          <button className="icon-btn header-gear" aria-label="Einstellungen" onClick={() => setTab('settings')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button
            className={`avatar-btn ${me.toLowerCase()}${switching ? ' switching' : ''}`}
            onClick={(e) => triggerSwitch(other, e.currentTarget, setMe)}
            disabled={switching}
            title="Benutzer wechseln">
            <img src={`uploads/${me.toLowerCase()}.jpg`} alt={me} className="avatar-img" />
          </button>
        </div>
      </header>

      <main className="app-main">
        {api.mode === 'demo' && tab === 'home' &&
        <div className="banner">
            <div className="banner-icon">!</div>
            <div className="banner-text" style={{ borderRadius: "14px" }}>
              <strong>Demo-Modus.</strong> Trag in <code>index.html</code> deine Supabase-URL & Key ein. Siehe SETUP.md.
            </div>
          </div>
        }

        {tab === 'home' && !currentChallenges.length && !proposalDismissed && weekTemplate.length > 0 &&
          <WeekFixCard template={weekTemplate} categories={categories} me={me}
            onFix={fixWeek}
            onDismiss={() => setProposalDismissed(true)} />
        }

        {tab === 'home' &&
        <HomeScreen
          api={api}
          me={me}
          challenges={currentChallenges}
          categories={categories}
          allSets={allSets}
          layout={t.layout}
          weekStart={weekStart}
          nextWeekStart={nextWeekStart}
          nextWeekChallenges={nextWeekChallenges}
          nextWeekProposals={nextWeekProposals}
          onAddGoal={() => setSetupForChallenge({})}
          onEditChallenge={(ch) => setSetupForChallenge(ch)}
          onLogChallenge={(ch) => setLogForChallenge(ch)}
          onQuickLog={async (ch, reps) => {
            try {
              await api.addSet({ challenge_id: ch.id, athlete: me, reps: parseInt(reps), note: null });
              setToast(`+${reps} geloggt 💪`);
              reload();
            } catch (e) { alert(e.message); }
          }} />

        }

        {tab === 'feed' && <FeedScreen feed={feedItems} me={me} categories={categories}
          onEditSet={async (s, patch) => { try { await api.updateSet(s.id, patch); setToast('Satz aktualisiert'); reload(); } catch (e) { alert(e.message); } }}
          onDeleteSet={async (s) => { try { await api.deleteSet(s.id); setToast('Gelöscht'); reload(); } catch (e) { alert(e.message); } }}
          onToggleReaction={async (s, emoji) => {
            if (!me) { alert('Bitte zuerst Athlet wählen'); return; }
            const mineHas = (s.reactions || []).some(r => r.athlete === me && r.emoji === emoji);
            try {
              if (mineHas) await api.removeReaction({ set_id: s.id, athlete: me, emoji });
              else await api.addReaction({ set_id: s.id, athlete: me, emoji });
              reload();
            } catch (e) { alert(e.message); }
          }}
          onPickEmoji={(s) => setPickerForSet(s)} />}

        {tab === 'history' &&
        <HistoryScreen
          challenges={allChallenges}
          categories={categories}
          allSets={allSets} />

        }

        {tab === 'settings' &&
        <SettingsScreen api={api} categories={categories} onAddCategory={reload}
          notificationsEnabled={t.notifications}
          onSetNotifications={(v) => setTweak('notifications', v)} />
        }
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
            <Icon name="history" /> Verlauf
          </button>
        </div>
      </nav>

      <Sheet open={!!setupForChallenge} onClose={() => setSetupForChallenge(null)}>
        <SetupSheet
          api={api}
          me={me}
          categories={categories}
          weekStart={weekStart}
          existing={setupForChallenge?.id ? setupForChallenge : null}
          usedCategoryIds={currentChallenges.filter(c => c.id !== setupForChallenge?.id).map(c => c.category_id)}
          onClose={() => setSetupForChallenge(null)}
          onSaved={() => {setSetupForChallenge(null);setToast('Ziel gespeichert');reload();}}
          onDeleted={() => {setSetupForChallenge(null);setToast('Ziel gelöscht');reload();}}
          onAddCategory={reload} />
      </Sheet>

      <Sheet open={!!logForChallenge} onClose={() => setLogForChallenge(null)}>
        <LogSheet
          api={api}
          me={me}
          challenge={logForChallenge}
          category={logForChallenge ? categories.find(c => c.id === logForChallenge.category_id) : null}
          onClose={() => setLogForChallenge(null)}
          onLogged={(r) => {setLogForChallenge(null);setToast(`+${r} geloggt 💪`);reload();}} />
      </Sheet>

      <Sheet open={!!pickerForSet} onClose={() => setPickerForSet(null)}>
        <EmojiPickerSheet
          onClose={() => setPickerForSet(null)}
          onPick={async (emoji) => {
            if (!me || !pickerForSet) { setPickerForSet(null); return; }
            try {
              await api.addReaction({ set_id: pickerForSet.id, athlete: me, emoji });
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