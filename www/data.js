// Projekt Terminator — Data Layer
// Wraps Supabase with a localStorage fallback so the app works in demo mode
// before the user wires up their Supabase keys.

(function() {
  const LS_KEY = 'pt_demo_store_v1';

  function loadDemo() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
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
  function isoDate(d) { return d.toISOString().slice(0, 10); }

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
        return [...loadDemo().challenges].sort((a,b) => b.week_start.localeCompare(a.week_start));
      },
      async listSets(challengeId) {
        return loadDemo().sets.filter(x => x.challenge_id === challengeId)
          .sort((a,b) => b.created_at.localeCompare(a.created_at));
      },
      async addSet({ challenge_id, athlete, reps, note }) {
        const s = loadDemo();
        const set = { id: uid(), challenge_id, athlete, reps, note: note || null, created_at: new Date().toISOString() };
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
        return [...s.sets]
          .sort((a,b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit)
          .map(set => {
            const ch = chById[set.challenge_id];
            const cat = ch ? catById[ch.category_id] : null;
            return { ...set, category: cat, challenge: ch };
          });
      },
      async getAllSets() {
        return [...loadDemo().sets];
      },
      // ── Rotation plan ─────────────────────────────────────────────────
      async getPlanSlots() {
        const s = loadDemo();
        return [...(s.plan_slots || [])].sort((a,b) => a.week_index - b.week_index || a.position - b.position);
      },
      async addPlanSlot({ week_index, category_id, start_target, growth_pct, position }) {
        const s = loadDemo();
        s.plan_slots = s.plan_slots || [];
        const slot = { id: uid(), week_index, category_id, start_target: start_target||100, growth_pct: growth_pct??10, position: position||0, created_at: new Date().toISOString() };
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
          .select('*').order('week_start', { ascending: false });
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
          .select('*, challenge:challenge_id(*, category:category_id(*))')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return (data || []).map(s => ({
          ...s,
          category: s.challenge?.category,
          challenge: s.challenge,
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
          growth_pct: payload.growth_pct ?? 10,
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
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  // ── Suggestion helper (pure) ────────────────────────────────────────
  function suggestForWeek({ weekStart, slots, config }) {
    if (!config?.enabled || !slots?.length) return [];
    const cycleLength = Math.max(...slots.map(s => s.week_index)) + 1;
    const start = mondayOf(new Date(config.start_date));
    start.setHours(0,0,0,0);
    const target = new Date(weekStart);
    target.setHours(0,0,0,0);
    const weeksSince = Math.round((target - start) / (7 * 86400000));
    if (weeksSince < 0) return [];
    const cycleCount = Math.floor(weeksSince / cycleLength);
    const weekInCycle = ((weeksSince % cycleLength) + cycleLength) % cycleLength;
    return slots
      .filter(s => s.week_index === weekInCycle)
      .map(s => {
        const g = Number(s.growth_pct) || 0;
        const mode = s.growth_mode || 'pct';
        const target = mode === 'abs'
          ? s.start_target + g * cycleCount
          : s.start_target * Math.pow(1 + g/100, cycleCount);
        const first = config.first_picker === 'Jonas' ? 'Jonas' : 'Benny';
        const other = first === 'Benny' ? 'Jonas' : 'Benny';
        const owner = weekInCycle % 2 === 0 ? first : other;
        return {
          category_id: s.category_id,
          target_reps: Math.max(1, Math.round(target)),
          slot_id: s.id,
          chosen_by: owner,
          week_in_cycle: weekInCycle,
        };
      });
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
    mondayOf, isoDate, uid, suggestForWeek,
  };
})();
