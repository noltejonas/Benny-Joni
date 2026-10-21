// Projekt Terminator — lokaler Demo-Modus
//
// Aktiv nur mit `?demo` in der URL (bleibt dann für diesen Browser gemerkt) oder
// über „Demo ansehen“ auf dem Willkommen-Bildschirm.
//   ?demo=reset  Beispieldaten neu erzeugen
//   ?demo=new    Demo abgemeldet starten (Onboarding als neue Person durchspielen)
//   ?demo=off    zurück auf Supabase
// Ersetzt PTData.init durch eine In-Memory-API mit denselben Methoden wie data.js.
// Es gibt keinen Netzwerkzugriff; alles liegt in localStorage (`pt_demo_db_v1`).
// Ohne Netz (navigator.onLine === false) scheitern Aufrufe wie bei Supabase.
//
// Zum Testen: localStorage.pt_demo_confirm = '1' → Registrieren verlangt die
// Mail-Bestätigung; localStorage.pt_demo_offline = '1' → alle Aufrufe scheitern
// wie ohne Netz; PTDemo.shiftWeek() spult eine Woche vor.

(function () {
  // Onboarding-Stände (pt:onboarding:<id>) gehören zu Demo-Personen, die es nach
  // einem Zurücksetzen nicht mehr gibt.
  function clearDemoState() {
    for (const k of Object.keys(localStorage)) if (k.startsWith('pt:onboarding:u-')) localStorage.removeItem(k);
  }
  const params = new URLSearchParams(location.search);
  const flag = params.get('demo');
  try {
    if (flag === 'off') { localStorage.removeItem('pt_demo'); localStorage.removeItem('pt_demo_user'); }
    else if (flag !== null) localStorage.setItem('pt_demo', '1');
    if (flag === 'reset') { localStorage.removeItem('pt_demo_db_v1'); localStorage.removeItem('pt_demo_user'); clearDemoState(); }
    if (flag === 'new') { sessionStorage.setItem('pt_demo_signed_out', '1'); localStorage.removeItem('pt_demo_user'); }
    if (flag !== null) {
      // Einmalige Schalter nicht beim Neuladen wiederholen; ?join= & Co. bleiben.
      params.delete('demo');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
    if (localStorage.getItem('pt_demo') !== '1') return;
  } catch (e) { return; }

  const { mondayOf, isoDate, addDays, computePenalties, participantsFor, annotateWorkouts, friendlyError, localizeCategory } = window.PTData;
  const DB_KEY = 'pt_demo_db_v1';
  const USER_KEY = 'pt_demo_user';
  const ME = 'u-benny';
  const SEED_IDS = ['u-benny', 'u-jonas', 'u-lea', 'u-max', 'u-sara', 'u-tim'];
  const COLORS = ['#2B8A9A', '#E8914A', '#D9667A', '#4A86D9', '#7FA34A', '#9A5BB0'];
  // 3: Monatsrangliste (Welt-Leute, Freies Training, Monatsergebnisse, log_id)
  const DB_VERSION = 3;

  // ── Seed ───────────────────────────────────────────────────────────
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function seed() {
    const r = rng(42);
    const rint = (a, b) => a + Math.floor(r() * (b - a + 1));
    const now = new Date();
    const monday = isoDate(mondayOf(now));
    let n = 0;
    const id = (p) => `${p}-${++n}`;

    // Rangliste: Benny wird beim ersten Öffnen gefragt (null), Sara hat abgelehnt.
    // Die „Welt“-Leute trainieren nur im Freien Training und füllen die Liste.
    // i18n-ignore: Namen
    const WORLD = ['Mia', 'Paul', 'Emma', 'Noah', 'Hannah', 'Elias', 'Lina', 'Finn', 'Clara', 'Luis', 'Ida', 'Ben'];
    const profiles = [
      ['u-benny', 'Benny', 'uploads/benny.jpg', COLORS[0], null], // i18n-ignore: Namen
      ['u-jonas', 'Jonas', 'uploads/jonas.jpg', COLORS[1], true], // i18n-ignore: Namen
      ['u-lea', 'Lea', null, COLORS[2], true], // i18n-ignore: Namen
      ['u-max', 'Max', null, COLORS[3], true], // i18n-ignore: Namen
      ['u-sara', 'Sara', null, COLORS[4], false], // i18n-ignore: Namen
      ['u-tim', 'Tim', null, COLORS[5], true], // i18n-ignore: Namen
      ...WORLD.map((name, i) => [`u-w${i + 1}`, name, null, COLORS[i % COLORS.length], true]),
    ].map(([pid, name, avatar, color, optIn]) => ({
      id: pid, display_name: name, avatar_url: avatar, color, ranking_opt_in: optIn,
      main_competition_id: pid === ME ? 'c-bj' : null, created_at: addDays(monday, -60) + 'T08:00:00Z',
      onboarding: {},
    }));

    // Standard-Übungen wie in der Datenbank (deutsche Namen und Regeln); übersetzt
    // wird beim Laden über PTData.localizeCategory. Gewertet wie nach der
    // Migration monthly_ranking: [metric, max_per_day, rule].
    const cat = (cid, name, emoji, kind = 'sports', type = 'standard', rank = null) =>
      ({ id: cid, name, emoji, kind, challenge_type: type, competition_id: null, created_at: '2026-01-01T00:00:00Z',
         ranked: !!rank, metric: rank?.[0] || null, max_per_day: rank?.[1] || null, rule: rank?.[2] || null });
    // Datenbank-Namen und -Regeln (je Zeile i18n-ignore)
    const categories = [
      cat('cat-push', 'Liegestütze', '🤜', 'sports', 'standard', ['volume', 1000, 'Brust fast am Boden, oben Arme ganz gestreckt.']), // i18n-ignore
      cat('cat-pull', 'Klimmzüge', '🆙', 'sports', 'standard', ['volume', 400, 'Aus dem toten Hang, Kinn über die Stange.']), // i18n-ignore
      cat('cat-dips', 'Dips', '🔽', 'sports', 'standard', ['volume', 600, 'Oberarme mindestens parallel zum Boden, oben ganz gestreckt.']), // i18n-ignore
      cat('cat-legs', 'Leg Raises', '🦵', 'sports', 'standard', ['volume', 600, 'Gestreckte Beine bis mindestens 90 Grad anheben.']), // i18n-ignore
      cat('cat-hspu', 'HSPU', '🤸', 'sports', 'standard', ['volume', 300, 'Kopf berührt Boden oder Matte, oben ganz gestreckt.']), // i18n-ignore
      cat('cat-sit', 'Sit-ups', '🧘', 'sports', 'standard', ['volume', 1000, 'Schultern ganz ab, Brust bis zu den Knien.']), // i18n-ignore
      cat('cat-squat', 'Kniebeugen', '🍑', 'sports', 'standard', ['volume', 1000, 'Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.']), // i18n-ignore
      cat('cat-th', 'Tom Holland', '🦸', 'sports', 'tom_holland', ['best', 40, 'Volle Runden in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen.']), // i18n-ignore
      cat('cat-bsu', 'Bring Sally Up', '🌸', 'sports', 'bring_sally_up', ['best', 204, 'Zeit bis zum ersten Absetzen, 3:24 ist das Maximum.']), // i18n-ignore
      cat('cat-vibe', 'Vibe Coding', '💻', 'work'), // i18n-ignore: Übungsname
    ];

    const startOf = (weeksBack) => addDays(monday, -7 * weeksBack);
    const comp = (cid, name, emoji, mode, code, mods, weeksBack, owner) => ({
      id: cid, name, emoji, mode, invite_code: code,
      rotation_enabled: !!mods.rotation, penalties_enabled: !!mods.penalties, work_enabled: !!mods.work,
      start_date: startOf(weeksBack), end_date: null, archived_at: null,
      created_by: owner, created_at: startOf(weeksBack) + 'T08:00:00Z',
    });
    const competitions = [
      comp('c-bj', 'Benny vs Jonas', '💪', '1v1', 'BJ4K7X', { rotation: 1, penalties: 1, work: 1 }, 6, 'u-benny'), // i18n-ignore: Namen
      comp('c-team', tr('Büro-Duell'), '🏢', '2v2', 'TEAM42', {}, 3, 'u-lea'),
      comp('c-ffa', tr('Freundeskreis'), '🔥', 'ffa', 'FFA777', { penalties: 1 }, 3, 'u-benny'),
      comp('c-run', tr('Laufgruppe'), '🏃', 'ffa', 'RUN555', {}, 2, 'u-tim'),
    ];
    const mem = (cid, uid, role, team, weeksBack) =>
      ({ competition_id: cid, user_id: uid, role, team, joined_at: startOf(weeksBack) + 'T08:00:00Z', left_at: null });
    const members = [
      mem('c-bj', 'u-benny', 'owner', null, 6), mem('c-bj', 'u-jonas', 'member', null, 6),
      mem('c-team', 'u-lea', 'owner', 'A', 3), mem('c-team', 'u-benny', 'member', 'A', 3),
      mem('c-team', 'u-max', 'member', 'B', 3), mem('c-team', 'u-sara', 'member', 'B', 3),
      mem('c-ffa', 'u-benny', 'owner', null, 3), mem('c-ffa', 'u-jonas', 'member', null, 3),
      mem('c-ffa', 'u-lea', 'member', null, 3), mem('c-ffa', 'u-tim', 'member', null, 3),
      mem('c-ffa', 'u-sara', 'member', null, 2),
      mem('c-run', 'u-tim', 'owner', null, 2), mem('c-run', 'u-max', 'member', null, 2),
    ];

    const plans = {
      'c-bj': [['cat-push', 280], ['cat-pull', 60], ['cat-dips', 60], ['cat-legs', 80], ['cat-hspu', 40], ['cat-th', 1], ['cat-bsu', 1]],
      'c-team': [['cat-push', 400], ['cat-sit', 300], ['cat-pull', 120]],
      'c-ffa': [['cat-push', 500], ['cat-dips', 250], ['cat-legs', 300], ['cat-th', 1]],
      'c-run': [['cat-sit', 200]],
    };
    const weekly_challenges = [], sets = [], reactions = [];
    const nowMs = now.getTime();
    for (const c of competitions) {
      const ms = members.filter(m => m.competition_id === c.id);
      const weeks = Math.round((new Date(monday) - new Date(c.start_date)) / (7 * 86400000));
      for (let w = weeks; w >= 0; w--) {
        const ws = startOf(w);
        plans[c.id].forEach(([catId, target], i) => {
          const chId = id('ch');
          const chooser = ms[(w + i) % ms.length].user_id;
          weekly_challenges.push({
            id: chId, competition_id: c.id, week_start: ws, category_id: catId, target_reps: target,
            chosen_by_user: chooser, chosen_by: chooser, created_at: ws + 'T07:00:00Z',
          });
          const share = Math.ceil(target / ms.length);
          const type = categories.find(x => x.id === catId).challenge_type;
          for (const m of ms) {
            const drive = 0.55 + r() * 0.7; // wie fleißig diese Person diese Woche ist
            if (type !== 'standard') {
              if (r() < 0.8) {
                const day = rint(0, 6);
                const t = new Date(ws + 'T00:00:00'); t.setDate(t.getDate() + day); t.setHours(rint(7, 20), rint(0, 59));
                if (t.getTime() < nowMs) sets.push({ id: id('s'), challenge_id: chId, competition_id: c.id, user_id: m.user_id, log_id: id('log'),
                  reps: type === 'tom_holland' ? rint(7, 12) : rint(140, 204), duration_minutes: null, note: null, created_at: t.toISOString() });
              }
              continue;
            }
            let left = Math.round(share * drive);
            for (let day = 0; day < 7 && left > 0; day++) {
              const perDay = Math.max(1, Math.round((share * drive) / 6));
              const count = r() < 0.25 ? 0 : rint(1, 3);
              for (let k = 0; k < count && left > 0; k++) {
                const reps = Math.min(left, Math.max(5, Math.round(perDay / count * (0.7 + r() * 0.6))));
                const t = new Date(ws + 'T00:00:00'); t.setDate(t.getDate() + day); t.setHours(rint(7, 21), rint(0, 59));
                if (t.getTime() >= nowMs) continue;
                left -= reps;
                sets.push({ id: id('s'), challenge_id: chId, competition_id: c.id, user_id: m.user_id, log_id: id('log'),
                  reps, duration_minutes: null, note: null, created_at: t.toISOString() });
              }
            }
          }
        });
      }
    }
    // Work-Tracking im Haupt-Duell, aktuelle Woche
    const vibe = id('ch');
    weekly_challenges.push({ id: vibe, competition_id: 'c-bj', week_start: monday, category_id: 'cat-vibe', target_reps: 600,
      chosen_by_user: ME, chosen_by: ME, created_at: monday + 'T07:00:00Z' });
    for (const u of ['u-benny', 'u-jonas']) for (let d = 0; d < 3; d++) {
      const t = new Date(monday + 'T00:00:00'); t.setDate(t.getDate() + d); t.setHours(19, 30);
      if (t.getTime() < nowMs) sets.push({ id: id('s'), challenge_id: vibe, competition_id: 'c-bj', user_id: u, log_id: id('log'),
        reps: null, duration_minutes: rint(40, 120), note: null, created_at: t.toISOString(), project_tag_id: 'pt-1', tool_tag_id: 'tt-1' });
    }
    // Freies Training der Welt-Leute: je eine Solo-Challenge, ein paar Übungen pro Woche
    const worldCats = ['cat-push', 'cat-pull', 'cat-dips', 'cat-sit', 'cat-squat', 'cat-legs', 'cat-hspu'];
    WORLD.forEach((_, i) => {
      const uidW = `u-w${i + 1}`, cidW = `c-solo-${uidW}`;
      const level = 0.4 + r() * 1.5;
      competitions.push({ id: cidW, name: 'Freies Training', emoji: '🏋️', mode: 'solo', invite_code: `SOLO-${uidW}`,
        rotation_enabled: false, penalties_enabled: false, work_enabled: false, start_date: startOf(7), end_date: null,
        archived_at: null, created_by: uidW, created_at: startOf(7) + 'T08:00:00Z' });
      members.push({ competition_id: cidW, user_id: uidW, role: 'owner', team: null, joined_at: startOf(7) + 'T08:00:00Z', left_at: null });
      const mineCats = worldCats.filter(() => r() < 0.6);
      for (let w = 7; w >= 0; w--) {
        const ws = startOf(w);
        for (const catId of [...mineCats, ...(r() < 0.5 ? ['cat-th'] : []), ...(r() < 0.4 ? ['cat-bsu'] : [])]) {
          const chId = id('ch');
          weekly_challenges.push({ id: chId, competition_id: cidW, week_start: ws, category_id: catId, target_reps: 1,
            chosen_by_user: uidW, chosen_by: uidW, created_at: ws + 'T07:00:00Z' });
          const type = categories.find(x => x.id === catId).challenge_type;
          for (let day = 0; day < 7; day++) {
            if (r() < (type === 'standard' ? 0.45 : 0.85)) continue;
            const t = new Date(ws + 'T00:00:00'); t.setDate(t.getDate() + day); t.setHours(rint(6, 21), rint(0, 59));
            if (t.getTime() >= nowMs) continue;
            const base = catId === 'cat-pull' || catId === 'cat-hspu' ? 25 : catId === 'cat-dips' || catId === 'cat-legs' ? 40 : 70;
            const reps = type === 'tom_holland' ? rint(6, 14) : type === 'bring_sally_up' ? rint(120, 204) : Math.max(5, Math.round(base * level * (0.6 + r())));
            sets.push({ id: id('s'), challenge_id: chId, competition_id: cidW, user_id: uidW, log_id: id('log'),
              reps, duration_minutes: null, note: null, created_at: t.toISOString() });
          }
        }
      }
    });

    // Abgeschlossene Monate: Wertung startet vor sechs Monaten, Ergebnisse
    // vergangener Monate sind ausgedacht (die Beispielsätze reichen nur ~8 Wochen zurück).
    const thisMonth = PTRanking.monthOf(now);
    const ranking_settings = { id: 1, start_month: PTRanking.addMonths(thisMonth, -6) };
    const monthly_results = [], month_closures = [];
    const rankedIds = categories.filter(c => c.ranked).map(c => c.id);
    const optedIn = profiles.filter(p => p.ranking_opt_in).map(p => p.id);
    for (let k = 6; k >= 1; k--) {
      const month = PTRanking.addMonths(thisMonth, -k);
      month_closures.push({ month, closed_at: PTRanking.closeDeadline(month).toISOString() });
      for (const catId of rankedIds) {
        const field = [...optedIn, ...(k <= 5 ? [ME] : [])].filter(() => r() < 0.7)
          .map(u => ({ category_id: catId, user_id: u, value: catId === 'cat-bsu' ? rint(130, 204) : catId === 'cat-th' ? rint(6, 15) : rint(80, 2400) }));
        for (const b of PTRanking.board(field)) monthly_results.push({ month, ...b });
      }
    }
    const ranking_reports = [{ id: id('rr'), reporter: 'u-jonas', user_id: 'u-w3', reason: 'values', category_id: 'cat-push',
      month: thisMonth, resolution: null, resolved_by: null, resolved_at: null, created_at: now.toISOString() }];

    // Reaktionen auf die letzten Sätze
    const recent = [...sets].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
    for (const s of recent) {
      if (r() < 0.35) {
        const others = members.filter(m => m.competition_id === s.competition_id && m.user_id !== s.user_id);
        const who = others[rint(0, others.length - 1)];
        if (who) reactions.push({ id: id('r'), set_id: s.id, user_id: who.user_id, emoji: ['🔥', '💪', '👏'][rint(0, 2)] });
      }
    }

    const penalty_config = competitions.map(c => ({
      competition_id: c.id, enabled: c.penalties_enabled, amount_cents: 500, rule_mode: 'per_week_aggregate',
    }));
    // Strafen: vergangene Wochen bis auf die letzte abschließen (so gibt es einen offenen Abschluss).
    const week_closures = [], penalties = [];
    for (const c of competitions.filter(x => x.penalties_enabled)) {
      const cfg = penalty_config.find(p => p.competition_id === c.id);
      const ms = members.filter(m => m.competition_id === c.id);
      const weeks = [...new Set(weekly_challenges.filter(x => x.competition_id === c.id && x.week_start < monday).map(x => x.week_start))].sort();
      for (const ws of weeks.slice(0, -1)) {
        week_closures.push({ competition_id: c.id, week_start: ws, closed_by_user: ME, created_at: addDays(ws, 7) + 'T09:00:00Z' });
        const chs = weekly_challenges.filter(x => x.competition_id === c.id && x.week_start === ws);
        const ss = sets.filter(x => chs.some(ch => ch.id === x.challenge_id)).map(x => ({ ...x, athlete: x.user_id }));
        annotateWorkouts(ss, chs, categories);
        const parts = participantsFor(ms, ws);
        for (const m of parts) for (const p of computePenalties(chs, ss, m.user_id, cfg, parts.length)) {
          penalties.push({ id: id('p'), competition_id: c.id, week_start: ws, user_id: p.athlete, challenge_id: p.challenge_id,
            amount_cents: p.amount_cents, rule_mode: p.rule_mode, paid: false, paid_at: null, paid_by_user: null, note: null,
            created_at: addDays(ws, 7) + 'T09:00:00Z' });
        }
      }
    }
    const payouts = [{ id: id('po'), competition_id: 'c-bj', user_id: 'u-jonas', amount_cents: 500, note: tr('Bar beim Training'),
      paid_at: addDays(monday, -10) + 'T18:00:00Z' }];

    const rotation_config = competitions.map(c => ({ competition_id: c.id, enabled: c.rotation_enabled, start_date: c.start_date }));
    const plan_slots = [];
    plans['c-bj'].forEach(([catId, target], i) => {
      plan_slots.push({ id: id('ps'), competition_id: 'c-bj', week_index: 0, category_id: catId, start_target: target, bonus_max: 0, position: i });
      plan_slots.push({ id: id('ps'), competition_id: 'c-bj', week_index: 1, category_id: catId, start_target: Math.round(target * 1.1), bonus_max: Math.round(target * 0.2), position: i });
    });

    return {
      profiles, categories, competitions, members, weekly_challenges, sets, reactions,
      penalty_config, penalties, week_closures, payouts, rotation_config, plan_slots,
      // i18n-ignore: Projekt- und Tool-Namen
      project_tags: [{ id: 'pt-1', competition_id: 'c-bj', name: 'Terminator', emoji: '📁', created_at: monday }],
      tool_tags: [{ id: 'tt-1', competition_id: 'c-bj', name: 'Claude Code', emoji: '🤖', created_at: monday }], // i18n-ignore: Tool-Name
      ranking_settings, monthly_results, month_closures, ranking_reports,
      user_blocks: [], ranking_admins: [ME],
      accounts: [{ email: 'benny@demo.local', user_id: ME }],
      v: DB_VERSION,
      seq: n,
    };
  }

  // Ältere Demo-Daten ergänzen statt verwerfen (v1 → v2: Konten, Onboarding-Spalte,
  // Seed-Profile älter als 14 Tage, damit Benny nicht als „neu“ gilt).
  // v2 → v3: Die Rangliste braucht neue Personen, Sätze und Ergebnisse; diese
  // Demo-Daten werden neu erzeugt.
  function upgrade(d) {
    if ((d.v || 1) >= DB_VERSION) return d;
    if ((d.v || 1) < 3) return seed();
    d.accounts = d.accounts || [{ email: 'benny@demo.local', user_id: ME }];
    const old = addDays(isoDate(mondayOf(new Date())), -60) + 'T08:00:00Z';
    for (const p of d.profiles) {
      if (!p.onboarding) p.onboarding = {};
      if (SEED_IDS.includes(p.id)) p.created_at = old;
    }
    d.v = DB_VERSION;
    return d;
  }

  // ── Store ──────────────────────────────────────────────────────────
  let db;
  try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { db = null; }
  db = db ? upgrade(db) : seed();
  const save = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} };
  save();
  const newId = (p) => `${p}-${++db.seq}`;
  const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
  const offline = () => (typeof navigator !== 'undefined' && navigator.onLine === false)
    || (() => { try { return localStorage.getItem('pt_demo_offline') === '1'; } catch (e) { return false; } })();
  // Wie ein Netzaufruf: kurz warten, ohne Netz mit demselben Fehler wie Supabase scheitern.
  const later = (v) => new Promise((res, rej) => setTimeout(() => (
    offline() ? rej(friendlyError(new TypeError('Failed to fetch'))) : res(clone(v)) // i18n-ignore: Netzfehler-Text des Browsers
  ), 60));
  const local = (v) => Promise.resolve(clone(v));
  const fail = (message, code) => friendlyError(Object.assign(new Error(message), code ? { code } : {}));
  const profileOf = (uid) => { const p = db.profiles.find(x => x.id === uid); return p && { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, color: p.color }; };
  const withAthlete = (row) => (row && 'user_id' in row ? { ...row, athlete: row.user_id } : row);
  const normCh = (row) => ({ ...row, chosen_by: row.chosen_by_user });
  const capacity = (mode) => (mode === '1v1' ? 2 : mode === '2v2' ? 4 : 12);
  const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const activeMembers = (cid) => db.members.filter(m => m.competition_id === cid && !m.left_at);

  // Session: wer angemeldet ist, merkt sich pt_demo_user; Abmelden gilt pro Tab.
  const sessionFor = (userId) => {
    const acc = db.accounts.find(a => a.user_id === userId);
    return { user: { id: userId, email: acc?.email || null }, demo: true };
  };
  let session = null;
  try {
    const stored = localStorage.getItem(USER_KEY);
    const userId = stored && db.profiles.some(p => p.id === stored) ? stored : ME;
    if (sessionStorage.getItem('pt_demo_signed_out') !== '1') session = sessionFor(userId);
  } catch (e) { session = sessionFor(ME); }
  const authListeners = new Set();
  const setSession = (s, evt) => {
    session = s;
    try {
      if (s) { sessionStorage.removeItem('pt_demo_signed_out'); localStorage.setItem(USER_KEY, s.user.id); }
      else sessionStorage.setItem('pt_demo_signed_out', '1');
    } catch (e) {}
    authListeners.forEach(fn => fn(s, evt));
  };
  const me = () => session?.user?.id || ME;

  const blobToDataUrl = (blob) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob);
  });

  function createDemoAPI() {
    const uid = () => { if (!session) throw new Error(tr('Bitte zuerst anmelden.')); return session.user.id; };
    const base = {
      mode: 'demo', client: null, mondayOf, isoDate,

      async getSession() { return local(session); },
      onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
      // Neue Adresse = neue Person mit leerem Profil; bekannte Adresse = Fehler wie bei Supabase.
      async signUp({ email, password, displayName } = {}) {
        await later(null);
        const mail = String(email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw fail('Unable to validate email address: invalid format', 'validation_failed');
        if (String(password || '').length < 6) throw fail('Password should be at least 6 characters.', 'weak_password');
        if (db.accounts.some(a => a.email === mail)) throw fail('User already registered', 'user_already_exists'); // i18n-ignore: Supabase-Fehlertext
        // Eindeutig über Zurücksetzen hinweg (seq beginnt dann neu).
        const userId = `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        db.profiles.push({
          id: userId, display_name: (String(displayName || '').trim() || mail.split('@')[0]).slice(0, 30),
          avatar_url: null, color: COLORS[db.profiles.length % COLORS.length], main_competition_id: null,
          created_at: new Date().toISOString(), onboarding: {},
        });
        let needsConfirm = false;
        try { needsConfirm = localStorage.getItem('pt_demo_confirm') === '1'; } catch (e) {}
        db.accounts.push({ email: mail, user_id: userId });
        save();
        if (needsConfirm) return { session: null, user: { id: userId, email: mail }, needsConfirm: true };
        setSession(sessionFor(userId), 'SIGNED_IN');
        return { session: clone(session), user: clone(session.user), needsConfirm: false };
      },
      // Bekannte Adresse → diese Person (gilt auch als bestätigt); sonst Bennys Showcase.
      async signIn({ email } = {}) {
        await later(null);
        const acc = db.accounts.find(a => a.email === String(email || '').trim().toLowerCase());
        setSession(sessionFor(acc ? acc.user_id : ME), 'SIGNED_IN');
        return clone(session);
      },
      async signOut() { setSession(null, 'SIGNED_OUT'); },
      async resendSignup() { return later(null); },
      async requestPasswordReset() { return later(null); },
      async resetPasswordWithCode() { return later(null); },

      async getMyProfile() { return later(db.profiles.find(p => p.id === uid())); },
      async updateProfile(patch) {
        await later(null);
        const p = db.profiles.find(x => x.id === uid()); Object.assign(p, patch); save(); emitAll(); return clone(p);
      },
      async saveOnboarding(state) { return base.updateProfile({ onboarding: state }); },
      // Data-URL statt blob:, damit das Bild ein Neuladen übersteht.
      async uploadAvatar(blob) { return base.updateProfile({ avatar_url: await blobToDataUrl(blob) }); },

      async listMyCompetitions({ includeSolo = false } = {}) {
        const mine = db.members.filter(m => m.user_id === uid() && !m.left_at);
        return later(mine.map(m => ({ ...db.competitions.find(c => c.id === m.competition_id), my_role: m.role, my_team: m.team }))
          .filter(c => c.id && (includeSolo || c.mode !== 'solo')).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
      },
      async getMembers(cid) { return later(membersOf(cid)); },
      async createCompetition({ name, emoji, mode, rotation, penalties, work, startDate, endDate }) {
        await later(null);
        const start = startDate || isoDate(new Date());
        const c = { id: newId('c'), name, emoji, mode, invite_code: code6(), rotation_enabled: !!rotation, penalties_enabled: !!penalties,
          work_enabled: !!work, start_date: start, end_date: endDate || null, archived_at: null,
          created_by: uid(), created_at: new Date().toISOString() };
        db.competitions.push(c);
        db.members.push({ competition_id: c.id, user_id: uid(), role: 'owner', team: mode === '2v2' ? 'A' : null, joined_at: c.created_at, left_at: null });
        db.penalty_config.push({ competition_id: c.id, enabled: !!penalties, amount_cents: 500, rule_mode: 'per_week_aggregate' });
        db.rotation_config.push({ competition_id: c.id, enabled: !!rotation, start_date: isoDate(mondayOf(new Date(start + 'T00:00:00'))) });
        const p = db.profiles.find(x => x.id === uid());
        if (p && !p.main_competition_id) p.main_competition_id = c.id;
        save(); return clone(c);
      },
      async previewCompetition(code) {
        const c = db.competitions.find(x => x.invite_code === String(code).trim().toUpperCase() && !x.archived_at && x.mode !== 'solo');
        if (!c) return later(null);
        const ms = activeMembers(c.id);
        return later({ id: c.id, name: c.name, emoji: c.emoji, mode: c.mode, capacity: capacity(c.mode),
          already_member: ms.some(m => m.user_id === uid()),
          members: ms.map(m => { const p = profileOf(m.user_id); return { display_name: p.display_name, team: m.team, avatar_url: p.avatar_url, color: p.color }; }) });
      },
      // Wie join_competition: voll/Team voll/ungültiges Team, 2 vs 2 ohne Wahl
      // ins kleinere Team, Wiedereintritt reaktiviert die alte Zeile.
      async joinCompetition(code, team = null) {
        await later(null);
        const c = db.competitions.find(x => x.invite_code === String(code).trim().toUpperCase() && !x.archived_at && x.mode !== 'solo');
        if (!c) throw fail('invalid_code');
        const ms = activeMembers(c.id);
        if (ms.some(m => m.user_id === uid())) return c.id;
        if (ms.length >= capacity(c.mode)) throw fail('competition_full');
        let t = null;
        if (c.mode === '2v2') {
          if (team && !['A', 'B'].includes(team)) throw fail('invalid_team');
          const count = (x) => ms.filter(m => m.team === x).length;
          t = team || (count('A') <= count('B') ? 'A' : 'B');
          if (count(t) >= 2) throw fail('team_full');
        }
        const row = { competition_id: c.id, user_id: uid(), role: 'member', team: t, joined_at: new Date().toISOString(), left_at: null };
        const old = db.members.find(m => m.competition_id === c.id && m.user_id === uid());
        if (old) Object.assign(old, row); else db.members.push(row);
        const p = db.profiles.find(x => x.id === uid());
        if (p && !p.main_competition_id) p.main_competition_id = c.id;
        save(); emitAll();
        return c.id;
      },
      async updateCompetition(cid, patch) {
        const c = db.competitions.find(x => x.id === cid); Object.assign(c, patch);
        if ('penalties_enabled' in patch) { const pc = db.penalty_config.find(x => x.competition_id === cid); if (pc) pc.enabled = patch.penalties_enabled; }
        save(); emitAll(); return later(c);
      },
      async setMemberTeam(cid, userId, team) { const m = db.members.find(x => x.competition_id === cid && x.user_id === userId); if (m) m.team = team; save(); emitAll(); },
      async removeMember(cid, userId) { const m = db.members.find(x => x.competition_id === cid && x.user_id === userId); if (m) m.left_at = new Date().toISOString(); save(); emitAll(); },
      async leaveCompetition(cid) { return base.removeMember(cid, uid()); },
      async regenerateInviteCode(cid) { const c = db.competitions.find(x => x.id === cid); c.invite_code = code6(); save(); emitAll(); return later(c.invite_code); },

      async getStatsBundle(ids) {
        const set = new Set(ids);
        return later({
          members: db.members.filter(m => set.has(m.competition_id)).map(m => ({ ...m, profile: profileOf(m.user_id) })),
          challenges: db.weekly_challenges.filter(c => set.has(c.competition_id)).map(normCh),
          sets: db.sets.filter(s => set.has(s.competition_id)).map(withAthlete),
          categories: db.categories.map(localizeCategory),
        });
      },
      async upsertDeviceToken() { return null; },
      async deleteDeviceToken() {},
      forCompetition(cid) { return competitionAPI(cid, uid); },

      // ── Rangliste (wie die RPCs der Migration monthly_ranking) ─────
      async getRankingSettings() { return later(db.ranking_settings); },
      async getRankedCategories() { return later(db.categories.filter(c => c.ranked && !c.competition_id)); },
      async rankingMonth(month) { return later(rankingMonth(uid(), month)); },
      async rankingTotals({ from = null, to = null } = {}) {
        const me = uid();
        const rows = PTRanking.totals(visibleResults(me), { from, to });
        return later(rows.map(r => ({ ...r, ...profileFields(me, r.user_id) })));
      },
      async rankingProfile(userId) {
        const me = uid();
        return later(visibleResults(me).filter(r => r.user_id === userId && r.points > 0)
          .sort((a, b) => b.month.localeCompare(a.month) || a.rank - b.rank));
      },
      async seasonChampions() {
        return later(PTRanking.seasonChampions(visibleResults(uid()), db.month_closures.map(m => m.month)));
      },
      async closeDueMonths() {
        let n = 0;
        for (let m = db.ranking_settings.start_month; PTRanking.closeDeadline(m) <= new Date(); m = PTRanking.addMonths(m, 1)) {
          if (db.month_closures.some(x => x.month === m)) continue;
          db.month_closures.push({ month: m, closed_at: new Date().toISOString() });
          for (const b of liveBoard(m)) { db.monthly_results.push({ month: m, ...b }); n++; }
        }
        if (n) save();
        return later(n);
      },
      async logTargets(categoryId, weekStart) { return later(logTargets(uid(), categoryId, weekStart)); },
      async logFreeSet({ categoryId, reps, note = null, createdAt = null }) {
        const me = uid();
        const cat = db.categories.find(c => c.id === categoryId);
        if (!cat?.ranked) throw new Error('Diese Übung zählt nicht für die Rangliste.');
        if (!(reps > 0)) throw new Error('Bitte einen Wert größer als 0 eingeben.');
        const at = createdAt || new Date().toISOString();
        const ws = isoDate(mondayOf(new Date(at)));
        let ch = logTargets(me, categoryId, ws)[0];
        let chId = ch?.challenge_id;
        if (!chId) {
          let solo = db.competitions.find(c => c.mode === 'solo' && c.created_by === me);
          if (!solo) {
            solo = { id: newId('c'), name: 'Freies Training', emoji: '🏋️', mode: 'solo', invite_code: `SOLO-${newId('x')}`,
              rotation_enabled: false, penalties_enabled: false, work_enabled: false, start_date: ws, end_date: null,
              archived_at: null, created_by: me, created_at: new Date().toISOString() };
            db.competitions.push(solo);
            db.members.push({ competition_id: solo.id, user_id: me, role: 'owner', team: null, joined_at: solo.created_at, left_at: null });
          }
          let wc = db.weekly_challenges.find(w => w.competition_id === solo.id && w.week_start === ws && w.category_id === categoryId);
          if (!wc) {
            wc = { id: newId('ch'), competition_id: solo.id, week_start: ws, category_id: categoryId, target_reps: 1,
              chosen_by_user: me, chosen_by: me, created_at: new Date().toISOString() };
            db.weekly_challenges.push(wc);
          }
          chId = wc.id;
        }
        const s = insertSet(me, chId, { reps, note, created_at: at });
        save(); emitAll();
        return later(withAthlete(s));
      },
      async setRankingOptIn(on) { return base.updateProfile({ ranking_opt_in: !!on }); },
      async reportRankingEntry({ userId, reason, categoryId = null, month = null }) {
        const me = uid();
        if (userId === me) throw new Error('Das darf nur der Ersteller der Challenge.');
        const cat = reason === 'values' ? categoryId : null, mon = reason === 'values' ? month : null;
        if (!db.ranking_reports.some(r => r.reporter === me && r.user_id === userId && r.reason === reason
          && r.category_id === cat && r.month === mon && !r.resolved_at)) {
          db.ranking_reports.push({ id: newId('rr'), reporter: me, user_id: userId, reason, category_id: cat, month: mon,
            resolution: null, resolved_by: null, resolved_at: null, created_at: new Date().toISOString() });
          save();
        }
      },
      async setBlock(userId, blocked) {
        const me = uid();
        db.user_blocks = db.user_blocks.filter(b => !(b.blocker === me && b.blocked === userId));
        if (blocked) db.user_blocks.push({ blocker: me, blocked: userId, created_at: new Date().toISOString() });
        save();
      },
      async myBlocks() {
        const me = uid();
        return later(db.user_blocks.filter(b => b.blocker === me).map(b => {
          const p = profileOf(b.blocked); return { user_id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, color: p.color };
        }));
      },
      async isRankingAdmin() { return later(db.ranking_admins.includes(uid())); },
      async rankingReportsOpen() {
        if (!db.ranking_admins.includes(uid())) throw new Error('Das darf nur der Ersteller der Challenge.');
        const groups = {};
        for (const r of db.ranking_reports.filter(x => !x.resolved_at)) {
          const k = [r.user_id, r.reason, r.category_id, r.month].join('|');
          const p = profileOf(r.user_id);
          const g = groups[k] ||= { user_id: r.user_id, display_name: p.display_name, avatar_url: p.avatar_url, color: p.color,
            reason: r.reason, category_id: r.category_id, month: r.month, reporters: new Set(), first_at: r.created_at };
          g.reporters.add(r.reporter);
        }
        return later(Object.values(groups).map(g => ({ ...g, reporters: g.reporters.size,
          hidden: rankingHidden(g.user_id, g.category_id, g.month) })));
      },
      async resolveRankingReports({ userId, reason, categoryId = null, month = null, resolution }) {
        for (const r of db.ranking_reports) {
          if (r.user_id === userId && r.reason === reason && r.category_id === categoryId && r.month === month && !r.resolved_at) {
            Object.assign(r, { resolution, resolved_by: uid(), resolved_at: new Date().toISOString() });
          }
        }
        if (resolution === 'removed' && reason === 'profile') { const p = db.profiles.find(x => x.id === userId); if (p) p.avatar_url = null; }
        save();
      },
      // Demo: Konto „löschen“ heißt Beispieldaten verwerfen und abmelden
      async deleteMyAccount() {
        try { localStorage.removeItem(DB_KEY); } catch (e) {}
        db = seed(); save();
        setSession(null, 'SIGNED_OUT');
      },
    };
    return base;
  }

  // ── Rangliste: Hilfen ────────────────────────────────────────────
  const optedIn = (id) => db.profiles.find(p => p.id === id)?.ranking_opt_in === true;
  function rankingHidden(userId, categoryId, month) {
    const rs = db.ranking_reports.filter(r => r.user_id === userId);
    if (rs.some(r => r.resolution === 'removed' && (r.reason === 'profile' || (r.category_id === categoryId && r.month === month)))) return true;
    const open = rs.filter(r => r.reason === 'values' && !r.resolved_at && r.category_id === categoryId && r.month === month);
    return new Set(open.map(r => r.reporter)).size >= 3;
  }
  function shares(me, other) {
    if (me === other) return true;
    const mine = new Set(db.members.filter(m => m.user_id === me).map(m => m.competition_id));
    return db.members.some(m => m.user_id === other && mine.has(m.competition_id));
  }
  function profileFields(me, userId) {
    const p = db.profiles.find(x => x.id === userId) || {};
    return { display_name: p.display_name, avatar_url: p.avatar_url, color: p.color, is_me: userId === me,
      is_mine: shares(me, userId), blocked: db.user_blocks.some(b => b.blocker === me && b.blocked === userId) };
  }
  function rankedSets() {
    const chById = Object.fromEntries(db.weekly_challenges.map(w => [w.id, w]));
    return db.sets.map(s => ({ ...s, category_id: chById[s.challenge_id]?.category_id }));
  }
  function liveBoard(month) {
    const values = PTRanking.monthValues({ sets: rankedSets(), categories: db.categories, month });
    return PTRanking.board(values, v => optedIn(v.user_id) && !rankingHidden(v.user_id, v.category_id, month));
  }
  function rankingMonth(me, month) {
    const closed = db.month_closures.some(m => m.month === month);
    const board = closed
      ? db.monthly_results.filter(r => r.month === month && optedIn(r.user_id) && !rankingHidden(r.user_id, r.category_id, month))
      : liveBoard(month);
    const rows = board.map(b => ({ category_id: b.category_id, user_id: b.user_id, value: b.value, rank: b.rank,
      points: b.points, counted: true, ...profileFields(me, b.user_id) }));
    if (!closed) {
      const mine = PTRanking.monthValues({ sets: rankedSets(), categories: db.categories, month })
        .filter(v => v.user_id === me && v.value > 0 && !board.some(b => b.user_id === me && b.category_id === v.category_id));
      for (const v of mine) {
        rows.push({ ...v, rank: PTRanking.hypotheticalRank(board.filter(b => b.category_id === v.category_id), v.value),
          points: 0, counted: false, ...profileFields(me, me) });
      }
    }
    return rows;
  }
  function visibleResults(me) {
    return db.monthly_results.filter(r => (optedIn(r.user_id) || r.user_id === me) && !rankingHidden(r.user_id, r.category_id, r.month));
  }
  function logTargets(me, categoryId, weekStart) {
    return db.weekly_challenges
      .filter(w => w.category_id === categoryId && w.week_start === weekStart)
      .map(w => ({ w, c: db.competitions.find(c => c.id === w.competition_id) }))
      .filter(({ c }) => c && c.mode !== 'solo' && !c.archived_at
        && db.members.some(m => m.competition_id === c.id && m.user_id === me && !m.left_at))
      .sort((a, b) => String(a.c.created_at).localeCompare(String(b.c.created_at)))
      .map(({ w, c }) => ({ competition_id: c.id, name: c.name, emoji: c.emoji, challenge_id: w.id }));
  }
  // Wie log_set: Satz auf das Wochenziel, bei gewerteten Übungen auch in alle
  // anderen eigenen Challenges mit derselben Übung der Woche (außer skip).
  function insertSet(me, challengeId, payload, skip = []) {
    const ch = db.weekly_challenges.find(w => w.id === challengeId);
    const row = { competition_id: ch.competition_id, user_id: me, reps: null, duration_minutes: null, note: null,
      created_at: new Date().toISOString(), ...payload, challenge_id: challengeId, log_id: newId('log') };
    const first = { id: newId('s'), ...row };
    db.sets.push(first);
    const cat = db.categories.find(c => c.id === ch.category_id);
    if (cat?.ranked && row.duration_minutes == null) {
      for (const t of logTargets(me, ch.category_id, ch.week_start)) {
        if (t.competition_id === ch.competition_id || skip.includes(t.competition_id)) continue;
        db.sets.push({ ...row, id: newId('s'), competition_id: t.competition_id, challenge_id: t.challenge_id });
      }
    }
    return first;
  }

  function membersOf(cid) {
    return db.members.filter(m => m.competition_id === cid)
      .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))
      .map(m => ({ user_id: m.user_id, role: m.role, team: m.team, joined_at: m.joined_at, left_at: m.left_at, profile: profileOf(m.user_id) }));
  }

  const compListeners = new Map();
  function emitAll() { for (const set of compListeners.values()) set.forEach(fn => setTimeout(fn, 0)); }

  function competitionAPI(cid, uid) {
    if (!compListeners.has(cid)) compListeners.set(cid, new Set());
    const listeners = compListeners.get(cid);
    const emit = () => { save(); listeners.forEach(fn => setTimeout(fn, 0)); };
    const byWeek = (a, b) => b.week_start.localeCompare(a.week_start) || String(a.created_at).localeCompare(String(b.created_at));
    const mine = (table) => db[table].filter(x => x.competition_id === cid);
    const crud = (table, prefix) => ({
      add(row) { const r = { id: newId(prefix), competition_id: cid, created_at: new Date().toISOString(), ...row }; db[table].push(r); emit(); return later(r); },
      update(rid, patch) { const r = db[table].find(x => x.id === rid); if (r) Object.assign(r, patch); emit(); return later(r); },
      remove(rid) { db[table] = db[table].filter(x => x.id !== rid); emit(); return later(null); },
    });
    const tagsP = crud('project_tags', 'pt'), tagsT = crud('tool_tags', 'tt'), slots = crud('plan_slots', 'ps');

    const api = {
      mode: 'demo', client: null, competitionId: cid, mondayOf, isoDate,
      async getCompetition() { return later(db.competitions.find(c => c.id === cid)); },
      async getMembers() { return later(membersOf(cid)); },

      async getCategories() { return later(db.categories.filter(c => !c.competition_id || c.competition_id === cid).map(localizeCategory)); },
      async addCategory(name, emoji = '💪', kind = 'sports') {
        const c = { id: newId('cat'), name, emoji, kind, challenge_type: 'standard', competition_id: cid, created_by: uid(), created_at: new Date().toISOString() };
        db.categories.push(c); emit(); return later(c);
      },
      async updateCategory(id, patch) {
        const c = db.categories.find(x => x.id === id && x.competition_id === cid);
        if (!c) throw new Error(tr('Standard-Kategorien können nicht bearbeitet werden.'));
        Object.assign(c, patch); emit(); return later(c);
      },
      async deleteCategory(id) {
        const c = db.categories.find(x => x.id === id && x.competition_id === cid);
        if (!c) throw new Error(tr('Standard-Kategorien können nicht gelöscht werden.'));
        if (db.weekly_challenges.some(w => w.category_id === id)) throw new Error(tr('Kategorie wird genutzt – nicht löschbar'));
        db.categories = db.categories.filter(x => x.id !== id); emit();
      },

      async getProjectTags() { return later(mine('project_tags')); },
      addProjectTag: (name, emoji = '📁') => tagsP.add({ name, emoji }),
      updateProjectTag: (id, patch) => tagsP.update(id, patch),
      deleteProjectTag: (id) => tagsP.remove(id),
      async getToolTags() { return later(mine('tool_tags')); },
      addToolTag: (name, emoji = '🔧') => tagsT.add({ name, emoji }),
      updateToolTag: (id, patch) => tagsT.update(id, patch),
      deleteToolTag: (id) => tagsT.remove(id),

      async getChallengeForWeek(ws) { return later(mine('weekly_challenges').filter(c => c.week_start === ws).map(normCh)); },
      async upsertChallenge(payload) {
        const row = { category_id: payload.category_id, target_reps: payload.target_reps, chosen_by_user: payload.chosen_by || uid() };
        let c = payload.id ? db.weekly_challenges.find(x => x.id === payload.id)
          : mine('weekly_challenges').find(x => x.week_start === payload.week_start && x.category_id === payload.category_id);
        if (c) Object.assign(c, row);
        else { c = { id: newId('ch'), competition_id: cid, week_start: payload.week_start, created_at: new Date().toISOString(), ...row }; db.weekly_challenges.push(c); }
        emit(); return later(normCh(c));
      },
      async deleteChallenge(id) {
        db.weekly_challenges = db.weekly_challenges.filter(x => x.id !== id);
        db.sets = db.sets.filter(s => s.challenge_id !== id); emit();
      },
      async listChallenges() { return later(mine('weekly_challenges').sort(byWeek).map(normCh)); },

      async listSets(challengeId) {
        return later(db.sets.filter(s => s.challenge_id === challengeId).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withAthlete));
      },
      async addSet({ athlete, skip, ...payload }) {
        const s = insertSet(uid(), payload.challenge_id, payload, skip || []);
        emit(); emitAll(); return later(withAthlete(s));
      },
      // Wie der Trigger sync_log_siblings: Änderungen gelten für alle Zeilen der log_id
      async updateSet(id, patch) {
        const { athlete, ...rest } = patch; const s = db.sets.find(x => x.id === id); Object.assign(s, rest);
        const shared = {};
        for (const k of ['reps', 'created_at', 'note']) if (k in rest) shared[k] = rest[k];
        for (const x of db.sets) if (x.log_id === s.log_id && x.user_id === s.user_id && x.id !== s.id) Object.assign(x, shared);
        emit(); emitAll(); return later(withAthlete(s));
      },
      async deleteSet(id) {
        const s = db.sets.find(x => x.id === id);
        const gone = new Set(db.sets.filter(x => x.id === id || (s && x.log_id === s.log_id && x.user_id === s.user_id)).map(x => x.id));
        db.sets = db.sets.filter(x => !gone.has(x.id)); db.reactions = db.reactions.filter(r => !gone.has(r.set_id)); emit(); emitAll();
      },
      async recentFeed(limit = 50) {
        const rows = mine('sets').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
        return later(rows.map(s => {
          const ch = db.weekly_challenges.find(c => c.id === s.challenge_id);
          const category = ch && localizeCategory(db.categories.find(c => c.id === ch.category_id));
          return { ...withAthlete(s), challenge: ch ? { ...normCh(ch), category } : null, category,
            reactions: db.reactions.filter(r => r.set_id === s.id).map(withAthlete) };
        }));
      },
      async getAllSets() { return later(mine('sets').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withAthlete)); },
      async logTargets(categoryId, weekStart) { return later(logTargets(uid(), categoryId, weekStart)); },
      async addReaction({ set_id, emoji }) {
        if (db.reactions.some(r => r.set_id === set_id && r.user_id === uid() && r.emoji === emoji)) return null;
        const r = { id: newId('r'), set_id, user_id: uid(), emoji }; db.reactions.push(r); emit(); return later(withAthlete(r));
      },
      async removeReaction({ set_id, emoji }) {
        db.reactions = db.reactions.filter(r => !(r.set_id === set_id && r.user_id === uid() && r.emoji === emoji)); emit();
      },

      async getPlanSlots() { return later(mine('plan_slots').sort((a, b) => a.week_index - b.week_index || a.position - b.position)); },
      addPlanSlot: (p) => slots.add({ week_index: p.week_index, category_id: p.category_id, start_target: p.start_target || 100, bonus_max: p.bonus_max ?? 0, position: p.position || 0 }),
      updatePlanSlot: (id, patch) => slots.update(id, patch),
      deletePlanSlot: (id) => slots.remove(id),
      async getRotationConfig() {
        let r = db.rotation_config.find(x => x.competition_id === cid);
        if (!r) { r = { competition_id: cid, enabled: true, start_date: isoDate(mondayOf(new Date())) }; db.rotation_config.push(r); save(); }
        return later(r);
      },
      async setRotationConfig(patch) { const r = await api.getRotationConfig(); Object.assign(db.rotation_config.find(x => x.competition_id === cid), patch); emit(); return later({ ...r, ...patch }); },

      async getPenaltyConfig() {
        let p = db.penalty_config.find(x => x.competition_id === cid);
        if (!p) { p = { competition_id: cid, enabled: false, amount_cents: 500, rule_mode: 'per_week_aggregate' }; db.penalty_config.push(p); save(); }
        return later(p);
      },
      async setPenaltyConfig(patch) {
        const { _by, ...rest } = patch;
        await api.getPenaltyConfig();
        const p = db.penalty_config.find(x => x.competition_id === cid); Object.assign(p, rest);
        if (patch.enabled === true) {
          const monday = isoDate(mondayOf(new Date()));
          const weeks = [...new Set(mine('weekly_challenges').filter(c => c.week_start < monday).map(c => c.week_start))];
          for (const w of weeks) if (!mine('week_closures').some(x => x.week_start === w)) db.week_closures.push({ competition_id: cid, week_start: w, closed_by_user: uid() });
        }
        emit(); return later(p);
      },
      async previewWeekClose(ws) {
        const cfg = await api.getPenaltyConfig();
        if (!cfg.enabled) return { penalties: [], cfg };
        const chs = mine('weekly_challenges').filter(c => c.week_start === ws);
        const ss = db.sets.filter(s => chs.some(c => c.id === s.challenge_id)).map(withAthlete);
        annotateWorkouts(ss, chs, db.categories);
        const parts = participantsFor(membersOf(cid), ws);
        const pens = [];
        for (const m of parts) pens.push(...computePenalties(chs, ss, m.user_id, cfg, parts.length));
        return { penalties: pens, cfg };
      },
      async closeWeek(ws) {
        if (mine('week_closures').some(x => x.week_start === ws)) throw new Error(tr('Woche bereits abgeschlossen'));
        db.week_closures.push({ competition_id: cid, week_start: ws, closed_by_user: uid(), created_at: new Date().toISOString() });
        const { penalties } = await api.previewWeekClose(ws);
        for (const p of penalties) db.penalties.push({ id: newId('p'), competition_id: cid, week_start: ws, user_id: p.athlete, challenge_id: p.challenge_id,
          amount_cents: p.amount_cents, rule_mode: p.rule_mode, paid: false, paid_at: null, paid_by_user: null, note: null, created_at: new Date().toISOString() });
        emit(); return { closed: true };
      },
      async reopenWeek(ws) {
        db.penalties = db.penalties.filter(p => !(p.competition_id === cid && p.week_start === ws && !p.paid));
        db.week_closures = db.week_closures.filter(c => !(c.competition_id === cid && c.week_start === ws)); emit();
      },
      async listPenalties() {
        return later(mine('penalties').sort((a, b) => b.week_start.localeCompare(a.week_start)).map(p => ({ ...withAthlete(p), paid_by: p.paid_by_user })));
      },
      async markPenaltyPaid(id, { note }) {
        const p = db.penalties.find(x => x.id === id); Object.assign(p, { paid: true, paid_at: new Date().toISOString(), paid_by_user: uid(), note: note ?? null });
        emit(); return later(withAthlete(p));
      },
      async unmarkPenaltyPaid(id) {
        const p = db.penalties.find(x => x.id === id); Object.assign(p, { paid: false, paid_at: null, paid_by_user: null }); emit(); return later(withAthlete(p));
      },
      async deletePenalty(id) { db.penalties = db.penalties.filter(x => x.id !== id); emit(); },
      async listClosures() { return later(mine('week_closures').sort((a, b) => b.week_start.localeCompare(a.week_start))); },
      async listOpenClosures() {
        const monday = isoDate(mondayOf(new Date()));
        const closed = new Set(mine('week_closures').map(c => c.week_start));
        return later([...new Set(mine('weekly_challenges').filter(c => c.week_start < monday && !closed.has(c.week_start)).map(c => c.week_start))].sort());
      },
      async listPayouts() { return later(mine('payouts').sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map(withAthlete)); },
      async addPayout({ athlete, amount_cents, note }) {
        const p = { id: newId('po'), competition_id: cid, user_id: athlete, amount_cents, note: note || null, paid_at: new Date().toISOString() };
        db.payouts.push(p); emit(); return later(withAthlete(p));
      },
      async deletePayout(id) { db.payouts = db.payouts.filter(x => x.id !== id); emit(); },

      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
    return api;
  }

  // ── Live-Simulation ───────────────────────────────────────────────
  // Damit sich der Live-Feed wie im Echtbetrieb anfühlt, loggt ab und zu ein
  // anderes Mitglied der offenen Challenge einen Satz oder reagiert auf deinen
  // letzten. Nur bei sichtbarer App und aktiver Session.
  // Abschalten: PTDemo.live(false) bzw. localStorage pt_demo_live = '0'.
  const LIVE_KEY = 'pt_demo_live';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function simulateTick() {
    try { if (localStorage.getItem(LIVE_KEY) === '0') return; } catch (e) {}
    if (!session || document.visibilityState !== 'visible') return;
    const open = [...compListeners.entries()].filter(([, l]) => l.size > 0).map(([cid]) => cid);
    if (!open.length) return;
    const cid = pick(open);
    const monday = isoDate(mondayOf(new Date()));
    const others = db.members.filter(m => m.competition_id === cid && !m.left_at && m.user_id !== me());
    const challs = db.weekly_challenges.filter(c => c.competition_id === cid && c.week_start === monday && db.categories
      .some(cat => cat.id === c.category_id && (cat.challenge_type || 'standard') === 'standard'));
    if (!others.length || !challs.length) return;
    const who = pick(others).user_id;
    const myLatest = db.sets.filter(s => s.competition_id === cid && s.user_id === me())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (myLatest && Math.random() < 0.25) {
      const emoji = pick(['🔥', '💪', '👏', '😤']);
      if (db.reactions.some(r => r.set_id === myLatest.id && r.user_id === who && r.emoji === emoji)) return;
      db.reactions.push({ id: newId('r'), set_id: myLatest.id, user_id: who, emoji });
    } else {
      const ch = pick(challs);
      const work = db.categories.find(cat => cat.id === ch.category_id)?.kind === 'work';
      db.sets.push({ id: newId('s'), challenge_id: ch.id, competition_id: cid, user_id: who, log_id: newId('log'),
        reps: work ? null : pick([5, 6, 8, 10, 12, 15]),
        duration_minutes: work ? pick([15, 25, 30, 45]) : null,
        note: null, created_at: new Date().toISOString() });
    }
    save();
    compListeners.get(cid).forEach(fn => setTimeout(fn, 0));
  }
  (function schedule() {
    setTimeout(() => { simulateTick(); schedule(); }, 18000 + Math.random() * 17000);
  })();

  // ── Beitritt simulieren ───────────────────────────────────────────
  // Nach „Einladung senden“ tritt nach ein paar Sekunden eine freie Seed-Person
  // bei (in 2 vs 2 ins kleinere Team, bei Gleichstand ins gegnerische).
  const joinTimers = new Map();
  function simulateJoin(cid, delay = 6000) {
    if (joinTimers.has(cid)) return;
    joinTimers.set(cid, setTimeout(() => {
      joinTimers.delete(cid);
      const c = db.competitions.find(x => x.id === cid);
      if (!c || c.archived_at) return;
      const ms = activeMembers(cid);
      if (ms.length >= capacity(c.mode)) return;
      const order = ['u-jonas', 'u-lea', 'u-max', 'u-sara', 'u-tim', 'u-benny'];
      const who = order.find(id => id !== me() && !ms.some(m => m.user_id === id));
      if (!who) return;
      const count = (t) => ms.filter(m => m.team === t).length;
      const team = c.mode === '2v2' ? (count('B') <= count('A') ? 'B' : 'A') : null;
      const old = db.members.find(m => m.competition_id === cid && m.user_id === who);
      const row = { competition_id: cid, user_id: who, role: 'member', team, joined_at: new Date().toISOString(), left_at: null };
      if (old) Object.assign(old, row); else db.members.push(row);
      save(); emitAll();
    }, delay));
  }

  // ── Eine Woche vorspulen ─────────────────────────────────────────
  // Schiebt alle Datumswerte 7 Tage zurück: die laufende Woche wird zur Vorwoche
  // (z. B. für den Rückblick nach Woche 1).
  const DATE_KEYS = ['created_at', 'start_date', 'end_date', 'archived_at', 'joined_at', 'left_at', 'week_start', 'paid_at'];
  function shiftValue(v, days) {
    if (typeof v !== 'string' || !v) return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return addDays(v, days);
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t + days * 86400000).toISOString() : v;
  }
  function shiftWeek(weeks = 1) {
    for (const [table, rows] of Object.entries(db)) {
      if (!Array.isArray(rows) || table === 'categories') continue;
      for (const row of rows) for (const k of DATE_KEYS) if (k in row) row[k] = shiftValue(row[k], -7 * weeks);
    }
    save();
  }

  window.PTData.init = () => createDemoAPI();
  window.PTDemo = {
    reset() { localStorage.removeItem(DB_KEY); localStorage.removeItem(USER_KEY); clearDemoState(); location.reload(); },
    live(on = true) { try { localStorage.setItem(LIVE_KEY, on ? '1' : '0'); } catch (e) {} },
    simulateJoin,
    shiftWeek(weeks = 1) { shiftWeek(weeks); location.reload(); },
    exit() {
      try { localStorage.removeItem('pt_demo'); localStorage.removeItem(USER_KEY); sessionStorage.removeItem('pt_demo_signed_out'); } catch (e) {}
      location.reload();
    },
  };

  // Kleiner Hinweis, damit niemand Demo und echte Daten verwechselt.
  const showBadge = () => {
    const el = document.createElement('a');
    el.href = '?demo=off';
    el.textContent = tr('Demo-Daten · beenden');
    el.setAttribute('style', 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:4px 10px;border-radius:999px;background:#1C1B2E;color:#fff;font:600 11px/1.4 system-ui,sans-serif;text-decoration:none;opacity:.78');
    document.body.appendChild(el);
  };
  if (document.body) showBadge(); else document.addEventListener('DOMContentLoaded', showBadge);
})();
