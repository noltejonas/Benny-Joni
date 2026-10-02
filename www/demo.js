// Projekt Terminator — lokaler Demo-Modus
//
// Aktiv nur mit `?demo` in der URL (bleibt dann für diesen Browser gemerkt).
// `?demo=reset` erzeugt die Beispieldaten neu, `?demo=off` schaltet zurück auf Supabase.
// Ersetzt PTData.init durch eine In-Memory-API mit denselben Methoden wie data.js.
// Es gibt keinen Netzwerkzugriff; alles liegt in localStorage (`pt_demo_db_v1`).

(function () {
  const params = new URLSearchParams(location.search);
  const flag = params.get('demo');
  try {
    if (flag === 'off') localStorage.removeItem('pt_demo');
    else if (flag !== null) localStorage.setItem('pt_demo', '1');
    if (flag === 'reset') localStorage.removeItem('pt_demo_db_v1');
    if (localStorage.getItem('pt_demo') !== '1') return;
  } catch (e) { return; }

  const { mondayOf, isoDate, addDays, computePenalties, participantsFor } = window.PTData;
  const DB_KEY = 'pt_demo_db_v1';
  const ME = 'u-benny';
  const COLORS = ['#2B8A9A', '#E8914A', '#D9667A', '#4A86D9', '#7FA34A', '#9A5BB0'];

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

    const profiles = [
      ['u-benny', 'Benny', 'uploads/benny.jpg', COLORS[0]],
      ['u-jonas', 'Jonas', 'uploads/jonas.jpg', COLORS[1]],
      ['u-lea', 'Lea', null, COLORS[2]],
      ['u-max', 'Max', null, COLORS[3]],
      ['u-sara', 'Sara', null, COLORS[4]],
      ['u-tim', 'Tim', null, COLORS[5]],
    ].map(([pid, name, avatar, color]) => ({
      id: pid, display_name: name, avatar_url: avatar, color,
      main_competition_id: pid === ME ? 'c-bj' : null, created_at: now.toISOString(),
    }));

    const cat = (cid, name, emoji, kind = 'sports', type = 'standard') =>
      ({ id: cid, name, emoji, kind, challenge_type: type, competition_id: null, created_at: '2026-01-01T00:00:00Z' });
    const categories = [
      cat('cat-push', 'Liegestütze', '🤜'), cat('cat-pull', 'Klimmzüge', '🆙'), cat('cat-dips', 'Dips', '🔽'),
      cat('cat-legs', 'Leg Raises', '🦵'), cat('cat-hspu', 'HSPU', '🤸'), cat('cat-sit', 'Sit-ups', '🧘'),
      cat('cat-th', 'Tom Holland', '🦸', 'sports', 'tom_holland'),
      cat('cat-bsu', 'Bring Sally Up', '🌸', 'sports', 'bring_sally_up'),
      cat('cat-vibe', 'Vibe Coding', '💻', 'work'),
    ];

    const startOf = (weeksBack) => addDays(monday, -7 * weeksBack);
    const comp = (cid, name, emoji, mode, code, mods, weeksBack, owner) => ({
      id: cid, name, emoji, mode, invite_code: code,
      rotation_enabled: !!mods.rotation, penalties_enabled: !!mods.penalties, work_enabled: !!mods.work,
      start_date: startOf(weeksBack), end_date: null, archived_at: null,
      created_by: owner, created_at: startOf(weeksBack) + 'T08:00:00Z',
    });
    const competitions = [
      comp('c-bj', 'Benny vs Jonas', '💪', '1v1', 'BJ4K7X', { rotation: 1, penalties: 1, work: 1 }, 6, 'u-benny'),
      comp('c-team', 'Büro-Duell', '🏢', '2v2', 'TEAM42', {}, 3, 'u-lea'),
      comp('c-ffa', 'Freundeskreis', '🔥', 'ffa', 'FFA777', { penalties: 1 }, 3, 'u-benny'),
      comp('c-run', 'Laufgruppe', '🏃', 'ffa', 'RUN555', {}, 2, 'u-tim'),
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
                if (t.getTime() < nowMs) sets.push({ id: id('s'), challenge_id: chId, competition_id: c.id, user_id: m.user_id,
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
                sets.push({ id: id('s'), challenge_id: chId, competition_id: c.id, user_id: m.user_id,
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
      if (t.getTime() < nowMs) sets.push({ id: id('s'), challenge_id: vibe, competition_id: 'c-bj', user_id: u,
        reps: null, duration_minutes: rint(40, 120), note: null, created_at: t.toISOString(), project_tag_id: 'pt-1', tool_tag_id: 'tt-1' });
    }
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
        const parts = participantsFor(ms, ws);
        for (const m of parts) for (const p of computePenalties(chs, ss, m.user_id, cfg, parts.length)) {
          penalties.push({ id: id('p'), competition_id: c.id, week_start: ws, user_id: p.athlete, challenge_id: p.challenge_id,
            amount_cents: p.amount_cents, rule_mode: p.rule_mode, paid: false, paid_at: null, paid_by_user: null, note: null,
            created_at: addDays(ws, 7) + 'T09:00:00Z' });
        }
      }
    }
    const payouts = [{ id: id('po'), competition_id: 'c-bj', user_id: 'u-jonas', amount_cents: 500, note: 'Bar beim Training',
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
      project_tags: [{ id: 'pt-1', competition_id: 'c-bj', name: 'Terminator', emoji: '📁', created_at: monday }],
      tool_tags: [{ id: 'tt-1', competition_id: 'c-bj', name: 'Claude Code', emoji: '🤖', created_at: monday }],
      seq: n,
    };
  }

  // ── Store ──────────────────────────────────────────────────────────
  let db;
  try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { db = null; }
  if (!db) db = seed();
  const save = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} };
  save();
  const newId = (p) => `${p}-${++db.seq}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const later = (v) => new Promise(res => setTimeout(() => res(clone(v)), 60));
  const profileOf = (uid) => { const p = db.profiles.find(x => x.id === uid); return p && { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, color: p.color }; };
  const withAthlete = (row) => (row && 'user_id' in row ? { ...row, athlete: row.user_id } : row);
  const normCh = (row) => ({ ...row, chosen_by: row.chosen_by_user });
  const capacity = (mode) => (mode === '1v1' ? 2 : mode === '2v2' ? 4 : 12);
  const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  let session = null;
  try { if (sessionStorage.getItem('pt_demo_signed_out') !== '1') session = { user: { id: ME }, demo: true }; } catch (e) { session = { user: { id: ME }, demo: true }; }
  const authListeners = new Set();
  const setSession = (s, evt) => {
    session = s;
    try { s ? sessionStorage.removeItem('pt_demo_signed_out') : sessionStorage.setItem('pt_demo_signed_out', '1'); } catch (e) {}
    authListeners.forEach(fn => fn(s, evt));
  };

  function createDemoAPI() {
    const uid = () => { if (!session) throw new Error('Bitte zuerst anmelden.'); return session.user.id; };
    const base = {
      mode: 'demo', client: null, mondayOf, isoDate,

      async getSession() { return later(session); },
      onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
      async signUp() { setSession({ user: { id: ME }, demo: true }, 'SIGNED_IN'); return later(session); },
      async signIn() { setSession({ user: { id: ME }, demo: true }, 'SIGNED_IN'); return later(session); },
      async signOut() { setSession(null, 'SIGNED_OUT'); },
      async requestPasswordReset() {},
      async resetPasswordWithCode() {},

      async getMyProfile() { return later(db.profiles.find(p => p.id === uid())); },
      async updateProfile(patch) {
        const p = db.profiles.find(x => x.id === uid()); Object.assign(p, patch); save(); emitAll(); return later(p);
      },
      async uploadAvatar(blob) { return base.updateProfile({ avatar_url: URL.createObjectURL(blob) }); },

      async listMyCompetitions() {
        const mine = db.members.filter(m => m.user_id === uid() && !m.left_at);
        return later(mine.map(m => ({ ...db.competitions.find(c => c.id === m.competition_id), my_role: m.role, my_team: m.team }))
          .filter(c => c.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
      },
      async getMembers(cid) { return later(membersOf(cid)); },
      async createCompetition({ name, emoji, mode, rotation, penalties, work, startDate, endDate }) {
        const c = { id: newId('c'), name, emoji, mode, invite_code: code6(), rotation_enabled: !!rotation, penalties_enabled: !!penalties,
          work_enabled: !!work, start_date: startDate || isoDate(new Date()), end_date: endDate || null, archived_at: null,
          created_by: uid(), created_at: new Date().toISOString() };
        db.competitions.push(c);
        db.members.push({ competition_id: c.id, user_id: uid(), role: 'owner', team: mode === '2v2' ? 'A' : null, joined_at: c.created_at, left_at: null });
        db.penalty_config.push({ competition_id: c.id, enabled: !!penalties, amount_cents: 500, rule_mode: 'per_week_aggregate' });
        db.rotation_config.push({ competition_id: c.id, enabled: !!rotation, start_date: isoDate(mondayOf(new Date())) });
        save(); return later(c);
      },
      async previewCompetition(code) {
        const c = db.competitions.find(x => x.invite_code === String(code).trim().toUpperCase() && !x.archived_at);
        if (!c) return later(null);
        const ms = db.members.filter(m => m.competition_id === c.id && !m.left_at);
        return later({ id: c.id, name: c.name, emoji: c.emoji, mode: c.mode, capacity: capacity(c.mode),
          already_member: ms.some(m => m.user_id === uid()),
          members: ms.map(m => { const p = profileOf(m.user_id); return { display_name: p.display_name, team: m.team, avatar_url: p.avatar_url, color: p.color }; }) });
      },
      async joinCompetition(code, team = null) {
        const c = db.competitions.find(x => x.invite_code === String(code).trim().toUpperCase());
        if (!c) throw new Error('Code nicht gefunden.');
        const ms = db.members.filter(m => m.competition_id === c.id && !m.left_at);
        if (!ms.some(m => m.user_id === uid())) {
          if (ms.length >= capacity(c.mode)) throw new Error('Diese Challenge ist schon voll.');
          db.members.push({ competition_id: c.id, user_id: uid(), role: 'member', team: c.mode === '2v2' ? (team || 'A') : null,
            joined_at: new Date().toISOString(), left_at: null });
          save(); emitAll();
        }
        return later(c.id);
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
          categories: db.categories,
        });
      },
      async upsertDeviceToken() { return null; },
      async deleteDeviceToken() {},
      forCompetition(cid) { return competitionAPI(cid, uid); },
    };
    return base;
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

      async getCategories() { return later(db.categories.filter(c => !c.competition_id || c.competition_id === cid)); },
      async addCategory(name, emoji = '💪', kind = 'sports') {
        const c = { id: newId('cat'), name, emoji, kind, challenge_type: 'standard', competition_id: cid, created_by: uid(), created_at: new Date().toISOString() };
        db.categories.push(c); emit(); return later(c);
      },
      async updateCategory(id, patch) {
        const c = db.categories.find(x => x.id === id && x.competition_id === cid);
        if (!c) throw new Error('Standard-Kategorien können nicht bearbeitet werden.');
        Object.assign(c, patch); emit(); return later(c);
      },
      async deleteCategory(id) {
        const c = db.categories.find(x => x.id === id && x.competition_id === cid);
        if (!c) throw new Error('Standard-Kategorien können nicht gelöscht werden.');
        if (db.weekly_challenges.some(w => w.category_id === id)) throw new Error('Kategorie wird genutzt – nicht löschbar');
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
      async addSet({ athlete, ...payload }) {
        const s = { id: newId('s'), competition_id: cid, user_id: uid(), reps: null, duration_minutes: null, note: null, created_at: new Date().toISOString(), ...payload };
        db.sets.push(s); emit(); return later(withAthlete(s));
      },
      async updateSet(id, patch) {
        const { athlete, ...rest } = patch; const s = db.sets.find(x => x.id === id); Object.assign(s, rest); emit(); return later(withAthlete(s));
      },
      async deleteSet(id) { db.sets = db.sets.filter(x => x.id !== id); db.reactions = db.reactions.filter(r => r.set_id !== id); emit(); },
      async recentFeed(limit = 50) {
        const rows = mine('sets').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
        return later(rows.map(s => {
          const ch = db.weekly_challenges.find(c => c.id === s.challenge_id);
          const category = ch && db.categories.find(c => c.id === ch.category_id);
          return { ...withAthlete(s), challenge: ch ? { ...normCh(ch), category } : null, category,
            reactions: db.reactions.filter(r => r.set_id === s.id).map(withAthlete) };
        }));
      },
      async getAllSets() { return later(mine('sets').sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withAthlete)); },
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
        const parts = participantsFor(membersOf(cid), ws);
        const pens = [];
        for (const m of parts) pens.push(...computePenalties(chs, ss, m.user_id, cfg, parts.length));
        return { penalties: pens, cfg };
      },
      async closeWeek(ws) {
        if (mine('week_closures').some(x => x.week_start === ws)) throw new Error('Woche bereits abgeschlossen');
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

  window.PTData.init = () => createDemoAPI();
  window.PTDemo = { reset() { localStorage.removeItem(DB_KEY); location.reload(); } };

  // Kleiner Hinweis, damit niemand Demo und echte Daten verwechselt.
  const showBadge = () => {
    const el = document.createElement('a');
    el.href = '?demo=off';
    el.textContent = 'Demo-Daten · beenden';
    el.setAttribute('style', 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:4px 10px;border-radius:999px;background:#1C1B2E;color:#fff;font:600 11px/1.4 system-ui,sans-serif;text-decoration:none;opacity:.78');
    document.body.appendChild(el);
  };
  if (document.body) showBadge(); else document.addEventListener('DOMContentLoaded', showBadge);
})();
