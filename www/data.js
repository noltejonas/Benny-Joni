// Projekt Terminator — Data Layer
// Wraps Supabase with a localStorage fallback so the app works in demo mode
// before the user wires up their Supabase keys.

(function() {
  const LS_KEY = 'pt_demo_store_v1';

  function defaultPenaltyConfig() {
    return { id: 1, enabled: false, rule_mode: 'per_week_aggregate', amount_cents: 500, currency: 'EUR', updated_at: new Date().toISOString() };
  }

  function loadDemo() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        s.penalty_config ||= defaultPenaltyConfig();
        s.penalties ||= [];
        s.week_closures ||= [];
        return s;
      }
    } catch (e) {}
    return {
      categories: [
        { id: 'c1', name: 'Liegestütze', emoji: '🤜' },
        { id: 'c2', name: 'Klimmzüge', emoji: '🆙' },
        { id: 'c3', name: 'Sit-ups', emoji: '🧘' },
        { id: 'c4', name: 'Kniebeugen', emoji: '🦵' },
        { id: 'c5', name: 'Burpees', emoji: '🔥' },
      ],
      challenges: [],
      sets: [],
      reactions: [],
      penalty_config: defaultPenaltyConfig(),
      penalties: [],
      week_closures: [],
    };
  }
  function saveDemo(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
  function uid() { return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0..6 (Sun..Sat)
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function isoDate(d) {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Penalty system: pure computation ────────────────────────────────
  function fairShareOf(targetReps) { return Math.ceil(targetReps / 2); }

  function repsForAthleteOnChallenge(sets, athlete, challengeId) {
    let total = 0;
    for (const s of sets) {
      if (s.challenge_id === challengeId && s.athlete === athlete) total += s.reps;
    }
    return total;
  }

  // Returns penalty descriptors for one athlete on one week.
  function computePenalties(challenges, sets, athlete, cfg) {
    if (!challenges || !challenges.length) return [];
    const mode = cfg.rule_mode;
    const amount = cfg.amount_cents;

    if (mode === 'per_challenge') {
      const out = [];
      for (const ch of challenges) {
        const reps = repsForAthleteOnChallenge(sets, athlete, ch.id);
        const share = fairShareOf(ch.target_reps);
        if (reps < share) out.push({
          athlete, challenge_id: ch.id, amount_cents: amount, rule_mode: mode,
          reason: `${share - reps} Reps unter fairShare`,
        });
      }
      return out;
    }

    const perCh = challenges.map(ch => {
      const reps = repsForAthleteOnChallenge(sets, athlete, ch.id);
      const share = fairShareOf(ch.target_reps);
      return { ch, reps, share, missed: reps < share };
    });

    let failed = false, reason = '';
    if (mode === 'per_week_any') {
      failed = perCh.some(x => x.missed);
      reason = failed ? `${perCh.filter(x => x.missed).length} Challenge(s) verfehlt` : '';
    } else if (mode === 'per_week_all') {
      failed = perCh.every(x => x.missed);
      reason = failed ? 'alle Challenges verfehlt' : '';
    } else { // per_week_aggregate
      const totalReps  = perCh.reduce((a, x) => a + x.reps, 0);
      const totalShare = perCh.reduce((a, x) => a + x.share, 0);
      failed = totalReps < totalShare;
      reason = failed ? `aggregiert ${totalShare - totalReps} Reps unter fairShare` : '';
    }

    return failed
      ? [{ athlete, challenge_id: null, amount_cents: amount, rule_mode: mode, reason }]
      : [];
  }

  function createDemoAPI() {
    const listeners = new Set();
    function emit() { listeners.forEach(fn => fn()); }

    return {
      mode: 'demo',
      mondayOf, isoDate,

      async getCategories() {
        return loadDemo().categories;
      },
      async addCategory(name, emoji='💪') {
        const s = loadDemo();
        if (s.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('Kategorie existiert bereits');
        }
        const cat = { id: uid(), name, emoji };
        s.categories.push(cat);
        saveDemo(s); emit();
        return cat;
      },
      async updateCategory(id, { name, emoji }) {
        const s = loadDemo();
        const cat = s.categories.find(c => c.id === id);
        if (!cat) throw new Error('Kategorie nicht gefunden');
        if (name !== undefined) cat.name = name;
        if (emoji !== undefined) cat.emoji = emoji;
        saveDemo(s); emit();
        return cat;
      },
      async deleteCategory(id) {
        const s = loadDemo();
        const used = s.challenges.find(c => c.category_id === id);
        if (used) throw new Error('Kategorie wird in einer Woche genutzt – kann nicht gelöscht werden');
        s.categories = s.categories.filter(c => c.id !== id);
        saveDemo(s); emit();
      },
      async getChallengeForWeek(weekStart) {
        const s = loadDemo();
        return s.challenges.filter(c => c.week_start === weekStart);
      },
      async upsertChallenge({ id, week_start, category_id, chosen_by, target_reps }) {
        const s = loadDemo();
        let ch;
        if (id) {
          ch = s.challenges.find(c => c.id === id);
          if (!ch) throw new Error('Ziel nicht gefunden');
          Object.assign(ch, { category_id, chosen_by, target_reps });
        } else {
          const dupe = s.challenges.find(c => c.week_start === week_start && c.category_id === category_id);
          if (dupe) throw new Error('Diese Kategorie existiert in dieser Woche bereits');
          ch = { id: uid(), week_start, category_id, chosen_by, target_reps, created_at: new Date().toISOString() };
          s.challenges.push(ch);
        }
        saveDemo(s); emit();
        return ch;
      },
      async deleteChallenge(id) {
        const s = loadDemo();
        s.challenges = s.challenges.filter(c => c.id !== id);
        s.sets = s.sets.filter(x => x.challenge_id !== id);
        saveDemo(s); emit();
      },
      async listChallenges() {
        return [...loadDemo().challenges].sort((a,b) => {
          const w = b.week_start.localeCompare(a.week_start);
          if (w !== 0) return w;
          return (a.created_at || '').localeCompare(b.created_at || '');
        });
      },
      async listSets(challengeId) {
        return loadDemo().sets.filter(x => x.challenge_id === challengeId)
          .sort((a,b) => b.created_at.localeCompare(a.created_at));
      },
      async addSet({ challenge_id, athlete, reps, note, created_at }) {
        const s = loadDemo();
        const set = { id: uid(), challenge_id, athlete, reps, note: note || null, created_at: created_at || new Date().toISOString() };
        s.sets.push(set);
        saveDemo(s); emit();
        return set;
      },
      async updateSet(id, patch) {
        const s = loadDemo();
        const set = s.sets.find(x => x.id === id);
        if (!set) throw new Error('Satz nicht gefunden');
        Object.assign(set, patch);
        saveDemo(s); emit();
        return set;
      },
      async deleteSet(id) {
        const s = loadDemo();
        s.sets = s.sets.filter(x => x.id !== id);
        saveDemo(s); emit();
      },
      async recentFeed(limit=50) {
        const s = loadDemo();
        const catById = Object.fromEntries(s.categories.map(c => [c.id, c]));
        const chById = Object.fromEntries(s.challenges.map(c => [c.id, c]));
        const reactions = s.reactions || [];
        const reactionsBySet = {};
        for (const r of reactions) (reactionsBySet[r.set_id] ||= []).push(r);
        return [...s.sets]
          .sort((a,b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit)
          .map(set => {
            const ch = chById[set.challenge_id];
            const cat = ch ? catById[ch.category_id] : null;
            return { ...set, category: cat, challenge: ch, reactions: reactionsBySet[set.id] || [] };
          });
      },
      async getAllSets() {
        return [...loadDemo().sets];
      },
      async addReaction({ set_id, athlete, emoji }) {
        const s = loadDemo();
        s.reactions = s.reactions || [];
        if (s.reactions.find(r => r.set_id === set_id && r.athlete === athlete && r.emoji === emoji)) {
          return null; // already exists, no-op
        }
        const r = { id: uid(), set_id, athlete, emoji, created_at: new Date().toISOString() };
        s.reactions.push(r);
        saveDemo(s); emit();
        return r;
      },
      async removeReaction({ set_id, athlete, emoji }) {
        const s = loadDemo();
        s.reactions = (s.reactions || []).filter(r => !(r.set_id === set_id && r.athlete === athlete && r.emoji === emoji));
        saveDemo(s); emit();
      },
      // ── Rotation plan ─────────────────────────────────────────────────
      async getPlanSlots() {
        const s = loadDemo();
        return [...(s.plan_slots || [])].sort((a,b) => a.week_index - b.week_index || a.position - b.position);
      },
      async addPlanSlot({ week_index, category_id, start_target, bonus_max, position }) {
        const s = loadDemo();
        s.plan_slots = s.plan_slots || [];
        const slot = { id: uid(), week_index, category_id, start_target: start_target||100, bonus_max: bonus_max??0, growth_pct: 0, position: position||0, created_at: new Date().toISOString() };
        s.plan_slots.push(slot);
        saveDemo(s); emit();
        return slot;
      },
      async updatePlanSlot(id, patch) {
        const s = loadDemo();
        const slot = (s.plan_slots||[]).find(x => x.id === id);
        if (!slot) throw new Error('Slot nicht gefunden');
        Object.assign(slot, patch);
        saveDemo(s); emit();
        return slot;
      },
      async deletePlanSlot(id) {
        const s = loadDemo();
        s.plan_slots = (s.plan_slots||[]).filter(x => x.id !== id);
        saveDemo(s); emit();
      },
      async getRotationConfig() {
        const s = loadDemo();
        return s.rotation_config || { id: 1, start_date: isoDate(mondayOf(new Date())), enabled: true };
      },
      async setRotationConfig(patch) {
        const s = loadDemo();
        s.rotation_config = { ...(s.rotation_config || { id: 1, enabled: true, start_date: isoDate(mondayOf(new Date())) }), ...patch };
        saveDemo(s); emit();
        return s.rotation_config;
      },
      async upsertDeviceToken(_payload) { /* no-op in demo mode */ },
      async deleteDeviceToken(_token) { /* no-op in demo mode */ },
      // ── Penalty system ─────────────────────────────────────────────────
      async getPenaltyConfig() { return { ...loadDemo().penalty_config }; },
      async setPenaltyConfig(patch) {
        const s = loadDemo();
        const { _by, ...rest } = patch;
        Object.assign(s.penalty_config, rest, { updated_at: new Date().toISOString() });
        if (patch.enabled === true) {
          const today = new Date(); today.setHours(0,0,0,0);
          const monday = mondayOf(today);
          const pastWeeks = new Set();
          for (const ch of s.challenges) {
            if (ch.week_start < isoDate(monday)) pastWeeks.add(ch.week_start);
          }
          for (const w of pastWeeks) {
            if (!s.week_closures.find(c => c.week_start === w)) {
              s.week_closures.push({ week_start: w, closed_at: new Date().toISOString(), closed_by: _by || 'Benny' });
            }
          }
        }
        saveDemo(s); emit();
        return { ...s.penalty_config };
      },
      async previewWeekClose(weekStart) {
        const s = loadDemo();
        const cfg = s.penalty_config;
        const chs = s.challenges.filter(c => c.week_start === weekStart);
        const chIds = new Set(chs.map(c => c.id));
        const wkSets = s.sets.filter(x => chIds.has(x.challenge_id));
        if (!cfg.enabled) return { penalties: [], cfg };
        const pens = [];
        for (const a of ['Benny','Jonas']) pens.push(...computePenalties(chs, wkSets, a, cfg));
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart, by) {
        const s = loadDemo();
        if (s.week_closures.find(c => c.week_start === weekStart)) throw new Error('Woche bereits abgeschlossen');
        const cfg = s.penalty_config;
        const chs = s.challenges.filter(c => c.week_start === weekStart);
        const chIds = new Set(chs.map(c => c.id));
        const wkSets = s.sets.filter(x => chIds.has(x.challenge_id));
        if (cfg.enabled) {
          for (const a of ['Benny','Jonas']) {
            for (const p of computePenalties(chs, wkSets, a, cfg)) {
              s.penalties.push({
                id: uid(), week_start: weekStart, athlete: p.athlete,
                challenge_id: p.challenge_id, amount_cents: p.amount_cents,
                rule_mode: p.rule_mode, created_at: new Date().toISOString(),
                paid: false, paid_at: null, paid_by: null, note: null,
              });
            }
          }
        }
        s.week_closures.push({ week_start: weekStart, closed_at: new Date().toISOString(), closed_by: by });
        saveDemo(s); emit();
        return { closed: true };
      },
      async reopenWeek(weekStart) {
        const s = loadDemo();
        s.penalties = s.penalties.filter(p => !(p.week_start === weekStart && !p.paid));
        s.week_closures = s.week_closures.filter(c => c.week_start !== weekStart);
        saveDemo(s); emit();
      },
      async listPenalties() {
        return [...loadDemo().penalties]
          .sort((a,b) => b.week_start.localeCompare(a.week_start) || b.created_at.localeCompare(a.created_at));
      },
      async markPenaltyPaid(id, { note, by }) {
        const s = loadDemo();
        const p = s.penalties.find(x => x.id === id);
        if (!p) throw new Error('Strafe nicht gefunden');
        p.paid = true; p.paid_at = new Date().toISOString(); p.paid_by = by; p.note = note ?? p.note;
        saveDemo(s); emit();
        return { ...p };
      },
      async unmarkPenaltyPaid(id) {
        const s = loadDemo();
        const p = s.penalties.find(x => x.id === id);
        if (!p) throw new Error('Strafe nicht gefunden');
        p.paid = false; p.paid_at = null; p.paid_by = null;
        saveDemo(s); emit();
        return { ...p };
      },
      async deletePenalty(id) {
        const s = loadDemo();
        s.penalties = s.penalties.filter(p => p.id !== id);
        saveDemo(s); emit();
      },
      async listClosures() {
        return [...loadDemo().week_closures].sort((a,b) => b.week_start.localeCompare(a.week_start));
      },
      async listOpenClosures() {
        const s = loadDemo();
        const today = new Date(); today.setHours(0,0,0,0);
        const monday = mondayOf(today);
        const closed = new Set(s.week_closures.map(c => c.week_start));
        const weeks = new Set();
        for (const ch of s.challenges) {
          if (ch.week_start < isoDate(monday) && !closed.has(ch.week_start)) weeks.add(ch.week_start);
        }
        return [...weeks].sort();
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  function createSupabaseAPI(client) {
    const listeners = new Set();
    function emit() { listeners.forEach(fn => fn()); }

    // Subscribe to realtime
    client.channel('pt-sets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sets' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_challenges' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_slots' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rotation_config' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalties' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_closures' }, emit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'penalty_config' }, emit)
      .subscribe();

    return {
      mode: 'supabase',
      client,
      mondayOf, isoDate,

      async getCategories() {
        const { data, error } = await client.from('categories').select('*').order('created_at');
        if (error) throw error;
        return data;
      },
      async addCategory(name, emoji='💪') {
        const { data, error } = await client.from('categories').insert({ name, emoji }).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async updateCategory(id, patch) {
        const { data, error } = await client.from('categories').update(patch).eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deleteCategory(id) {
        const { error } = await client.from('categories').delete().eq('id', id);
        if (error) throw new Error(error.message.includes('foreign') ? 'Kategorie wird genutzt – nicht löschbar' : error.message);
        emit();
      },
      async getChallengeForWeek(weekStart) {
        const { data, error } = await client.from('weekly_challenges')
          .select('*').eq('week_start', weekStart);
        if (error) throw error;
        return data || [];
      },
      async upsertChallenge(payload) {
        const isUpdate = !!payload.id;
        const q = isUpdate
          ? client.from('weekly_challenges').update(payload).eq('id', payload.id).select().single()
          : client.from('weekly_challenges').insert(payload).select().single();
        const { data, error } = await q;
        if (error) {
          if (error.code === '23505') throw new Error('Diese Kategorie existiert in dieser Woche bereits');
          throw error;
        }
        emit();
        return data;
      },
      async deleteChallenge(id) {
        const { error } = await client.from('weekly_challenges').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async listChallenges() {
        const { data, error } = await client.from('weekly_challenges')
          .select('*')
          .order('week_start', { ascending: false })
          .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
      },
      async listSets(challengeId) {
        const { data, error } = await client.from('sets')
          .select('*').eq('challenge_id', challengeId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      },
      async addSet(payload) {
        const { data, error } = await client.from('sets').insert(payload).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async updateSet(id, patch) {
        const { data, error } = await client.from('sets').update(patch).eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deleteSet(id) {
        const { error } = await client.from('sets').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async recentFeed(limit=50) {
        const { data, error } = await client.from('sets')
          .select('*, challenge:challenge_id(*, category:category_id(*)), reactions(id, athlete, emoji)')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return (data || []).map(s => ({
          ...s,
          category: s.challenge?.category,
          challenge: s.challenge,
          reactions: s.reactions || [],
        }));
      },
      async getAllSets() {
        const { data, error } = await client.from('sets')
          .select('*')
          .order('created_at', { ascending: false })
          .range(0, 9999);
        if (error) throw error;
        return data || [];
      },
      async addReaction(payload) {
        const { data, error } = await client.from('reactions')
          .insert(payload)
          .select()
          .single();
        if (error) {
          if (error.code === '23505') return null; // unique violation, already exists
          throw error;
        }
        emit();
        return data;
      },
      async removeReaction({ set_id, athlete, emoji }) {
        const { error } = await client.from('reactions')
          .delete()
          .match({ set_id, athlete, emoji });
        if (error) throw error;
        emit();
      },
      // ── Rotation plan ─────────────────────────────────────────────────
      async getPlanSlots() {
        const { data, error } = await client.from('plan_slots').select('*').order('week_index').order('position');
        if (error) throw error;
        return data || [];
      },
      async addPlanSlot(payload) {
        const { data, error } = await client.from('plan_slots').insert({
          week_index: payload.week_index,
          category_id: payload.category_id,
          start_target: payload.start_target || 100,
          bonus_max: payload.bonus_max ?? 0,
          position: payload.position || 0,
        }).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async updatePlanSlot(id, patch) {
        const { data, error } = await client.from('plan_slots').update(patch).eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deletePlanSlot(id) {
        const { error } = await client.from('plan_slots').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async getRotationConfig() {
        const { data, error } = await client.from('rotation_config').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (data) return data;
        // bootstrap
        const ins = await client.from('rotation_config').insert({ id: 1, start_date: isoDate(mondayOf(new Date())), enabled: true }).select().single();
        return ins.data;
      },
      async setRotationConfig(patch) {
        const { data, error } = await client.from('rotation_config').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      // ── Push notification device tokens ───────────────────────────────
      async upsertDeviceToken({ token, athlete, platform }) {
        const { data, error } = await client.from('device_tokens')
          .upsert({ token, athlete, platform, last_seen: new Date().toISOString() }, { onConflict: 'token' })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      async deleteDeviceToken(token) {
        const { error } = await client.from('device_tokens').delete().eq('token', token);
        if (error) throw error;
      },
      // ── Penalty system ─────────────────────────────────────────────────
      async getPenaltyConfig() {
        const { data, error } = await client.from('penalty_config').select('*').eq('id', 1).single();
        if (error) throw error;
        return data;
      },
      async setPenaltyConfig(patch) {
        const { _by, ...rest } = patch;
        const { data: cfg, error } = await client.from('penalty_config')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', 1).select().single();
        if (error) throw error;
        if (patch.enabled === true) {
          const today = new Date(); today.setHours(0,0,0,0);
          const monday = mondayOf(today);
          const { data: chs } = await client.from('weekly_challenges')
            .select('week_start').lt('week_start', isoDate(monday));
          const seen = new Set();
          const rows = [];
          for (const c of chs || []) {
            if (!seen.has(c.week_start)) {
              seen.add(c.week_start);
              rows.push({ week_start: c.week_start, closed_by: _by || 'Benny' });
            }
          }
          if (rows.length) {
            await client.from('week_closures').upsert(rows, { onConflict: 'week_start', ignoreDuplicates: true });
          }
        }
        emit();
        return cfg;
      },
      async previewWeekClose(weekStart) {
        const cfg = await this.getPenaltyConfig();
        const { data: chs } = await client.from('weekly_challenges').select('*').eq('week_start', weekStart);
        const chIds = (chs || []).map(c => c.id);
        let wkSets = [];
        if (chIds.length) {
          const { data } = await client.from('sets').select('*').in('challenge_id', chIds);
          wkSets = data || [];
        }
        if (!cfg.enabled) return { penalties: [], cfg };
        const pens = [];
        for (const a of ['Benny','Jonas']) pens.push(...computePenalties(chs || [], wkSets, a, cfg));
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart, by) {
        const { error: clErr } = await client.from('week_closures').insert({ week_start: weekStart, closed_by: by });
        if (clErr) {
          if (clErr.code === '23505') throw new Error('Woche bereits abgeschlossen');
          throw clErr;
        }
        const { penalties } = await this.previewWeekClose(weekStart);
        if (penalties.length) {
          const rows = penalties.map(p => ({
            week_start: weekStart, athlete: p.athlete, challenge_id: p.challenge_id,
            amount_cents: p.amount_cents, rule_mode: p.rule_mode,
          }));
          const { error: pErr } = await client.from('penalties').insert(rows);
          if (pErr) throw pErr;
        }
        emit();
        return { closed: true };
      },
      async reopenWeek(weekStart) {
        await client.from('penalties').delete().eq('week_start', weekStart).eq('paid', false);
        await client.from('week_closures').delete().eq('week_start', weekStart);
        emit();
      },
      async listPenalties() {
        const { data, error } = await client.from('penalties').select('*')
          .order('week_start', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async markPenaltyPaid(id, { note, by }) {
        const { data, error } = await client.from('penalties')
          .update({ paid: true, paid_at: new Date().toISOString(), paid_by: by, note: note ?? null })
          .eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async unmarkPenaltyPaid(id) {
        const { data, error } = await client.from('penalties')
          .update({ paid: false, paid_at: null, paid_by: null })
          .eq('id', id).select().single();
        if (error) throw error;
        emit();
        return data;
      },
      async deletePenalty(id) {
        const { error } = await client.from('penalties').delete().eq('id', id);
        if (error) throw error;
        emit();
      },
      async listClosures() {
        const { data, error } = await client.from('week_closures').select('*')
          .order('week_start', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async listOpenClosures() {
        const today = new Date(); today.setHours(0,0,0,0);
        const monday = mondayOf(today);
        const [chsRes, clRes] = await Promise.all([
          client.from('weekly_challenges').select('week_start').lt('week_start', isoDate(monday)),
          client.from('week_closures').select('week_start'),
        ]);
        if (chsRes.error) throw chsRes.error;
        if (clRes.error) throw clRes.error;
        const closed = new Set((clRes.data || []).map(c => c.week_start));
        const weeks = new Set();
        for (const ch of chsRes.data || []) if (!closed.has(ch.week_start)) weeks.add(ch.week_start);
        return [...weeks].sort();
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  // ── Week template helper (pure) ─────────────────────────────────────
  // Returns the plan's template slots for a given weekStart: base reps
  // and bonus_max per exercise. No growth math, no owner alternation —
  // whoever fixes the week first picks the actual target via slider.
  function weekTemplateFor({ weekStart, slots, config }) {
    if (!config?.enabled || !slots?.length) return [];
    const cycleLength = Math.max(...slots.map(s => s.week_index)) + 1;
    const start = mondayOf(new Date(config.start_date + 'T00:00:00'));
    start.setHours(0,0,0,0);
    const target = new Date(weekStart + 'T00:00:00');
    target.setHours(0,0,0,0);
    const weeksSince = Math.round((target - start) / (7 * 86400000));
    if (weeksSince < 0) return [];
    const weekInCycle = ((weeksSince % cycleLength) + cycleLength) % cycleLength;
    return slots
      .filter(s => s.week_index === weekInCycle)
      .sort((a,b) => (a.position||0) - (b.position||0))
      .map(s => ({
        category_id: s.category_id,
        base_reps: Math.max(1, Math.round(Number(s.start_target) || 0)),
        bonus_max: Math.max(0, Math.round(Number(s.bonus_max) || 0)),
        slot_id: s.id,
        week_in_cycle: weekInCycle,
      }));
  }

  // Back-compat shim — older callers expect `target_reps` + `chosen_by`.
  // We now default the target to the base (no growth, no owner).
  function suggestForWeek(args) {
    return weekTemplateFor(args).map(t => ({
      category_id: t.category_id,
      target_reps: t.base_reps,
      bonus_max: t.bonus_max,
      slot_id: t.slot_id,
      week_in_cycle: t.week_in_cycle,
    }));
  }

  window.PTData = {
    init({ url, key }) {
      const hasReal = url && key && !url.includes('DEIN-PROJEKT') && !key.startsWith('DEIN-');
      if (hasReal && window.supabase) {
        try {
          const client = window.supabase.createClient(url, key, {
            realtime: { params: { eventsPerSecond: 5 } },
          });
          return createSupabaseAPI(client);
        } catch (e) {
          console.warn('Supabase init failed, falling back to demo:', e);
        }
      }
      return createDemoAPI();
    },
    mondayOf, isoDate, uid, suggestForWeek, weekTemplateFor, computePenalties, fairShareOf,
  };
})();
