// Projekt Terminator — Data Layer
// Supabase-Client mit Auth, Profilen, Challenges (Tabelle `competitions`) und
// einem pro Challenge gescopten API (`api.forCompetition(id)`), das dieselben
// Methoden wie früher anbietet (listChallenges, addSet, …).
//
// Konvention: Zeilen mit `user_id` bekommen zusätzlich `athlete = user_id`,
// damit die Screens weiter mit `s.athlete === me` arbeiten können — `me` ist
// jetzt die User-ID, nicht mehr ein Name.

(function() {
  const PAGE = 1000;

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
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  // ── Teilnehmer & Fair Share ─────────────────────────────────────────
  // Wer zählt für eine Woche? Mitglieder, die spätestens am Sonntag der Woche
  // beigetreten sind und nicht vor ihrem Montag ausgetreten sind.
  function participantsFor(members, weekStart) {
    if (!members?.length) return [];
    const weekEnd = addDays(weekStart, 6);
    const active = members.filter(m => {
      const joined = m.joined_at ? isoDate(new Date(m.joined_at)) : '0000-00-00';
      const left = m.left_at ? isoDate(new Date(m.left_at)) : null;
      return joined <= weekEnd && (!left || left >= weekStart);
    });
    return active.length ? active : members.filter(m => !m.left_at);
  }

  // Gemeinsames Wochenziel, jeder schuldet seinen Anteil.
  function fairShareOf(targetReps, participantCount = 2) {
    return Math.ceil(targetReps / Math.max(1, participantCount));
  }

  // ── Pflicht-Workouts (Bring Sally Up, Tom Holland) ──────────────────
  // Ein Satz dieser Kategorien ist ein Durchgang; `reps` hält den Wert des
  // Durchgangs (Sally: Sekunden, Tom Holland: Runden). Workouts zählen nie in
  // Wiederholungs-Summen, ihr Wochenziel ist ein Durchgang pro Person.
  const WORKOUT_TYPES = ['bring_sally_up', 'tom_holland'];
  const SALLY_FULL_SECONDS = 204;

  function isWorkoutType(type) {
    return WORKOUT_TYPES.includes(type);
  }

  // Setzt `workout` (Typ oder null) auf Sätzen und Wochen-Challenges.
  function annotateWorkouts(sets, challenges, categories) {
    const typeByCat = {};
    for (const c of categories || []) typeByCat[c.id] = c.challenge_type;
    const typeByCh = {};
    for (const ch of challenges || []) {
      const t = typeByCat[ch.category_id];
      ch.workout = isWorkoutType(t) ? t : null;
      typeByCh[ch.id] = ch.workout;
    }
    for (const s of sets || []) {
      const t = typeByCh[s.challenge_id] ?? s.category?.challenge_type ?? null;
      s.workout = isWorkoutType(t) ? t : null;
    }
    return sets;
  }

  // Wert eines Satzes für Wiederholungs- und Minuten-Summen.
  function setValue(s) {
    return s.workout ? 0 : (s.reps ?? s.duration_minutes ?? 0);
  }

  function workoutValueLabel(type, value) {
    const v = value ?? 0;
    if (type === 'bring_sally_up') {
      return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}${v >= SALLY_FULL_SECONDS ? ' ✓' : ''}`;
    }
    if (type === 'tom_holland') return trn(v, '{n} Runde', '{n} Runden');
    return String(v);
  }

  // Pflicht-Workouts speichern eine deutsche Notiz für alle Mitglieder
  // („Zeit: 12:34“ bei Tom Holland, „3:10 von 3:24“ bei Bring Sally Up).
  // Angezeigt wird sie in der App-Sprache; eigene Notizen bleiben, wie sie sind.
  function noteText(note) {
    if (!note) return note;
    let m = /^Zeit: (\d+:\d{2})$/.exec(note);
    if (m) return tr('Zeit: {time}', { time: m[1] });
    m = /^(\d+:\d{2}) von (\d+:\d{2})$/.exec(note);
    if (m) return tr('{time} von {total}', { time: m[1], total: m[2] });
    return note;
  }

  // „2× · 3:00, 3:24 ✓“ für die Durchgänge einer Person, älteste zuerst.
  function workoutSummary(type, sets) {
    if (!sets.length) return '0×';
    const vals = [...sets]
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map(s => workoutValueLabel(type, s.reps));
    return `${sets.length}× · ${vals.join(', ')}`;
  }

  // Wie viele der Personen haben mindestens einen Durchgang? `sets` = Sätze einer Challenge.
  function workoutPeopleDone(sets, userIds) {
    const did = new Set(sets.map(s => s.athlete));
    return userIds.filter(id => did.has(id)).length;
  }

  // ── Penalty system: pure computation ────────────────────────────────
  // Pflicht-Workouts (ch.workout, s. annotateWorkouts) zählen Durchgänge und
  // verlangen einen pro Person.
  function doneOnChallenge(sets, athlete, ch) {
    let total = 0;
    for (const s of sets) {
      if (s.challenge_id === ch.id && s.athlete === athlete) {
        total += ch.workout ? 1 : (s.reps ?? s.duration_minutes ?? 0);
      }
    }
    return total;
  }
  function shareOn(ch, participantCount) {
    return ch.workout ? 1 : fairShareOf(ch.target_reps, participantCount);
  }

  // Returns penalty descriptors for one athlete on one week.
  function computePenalties(challenges, sets, athlete, cfg, participantCount = 2) {
    if (!challenges || !challenges.length) return [];
    const mode = cfg.rule_mode;
    const amount = cfg.amount_cents;

    if (mode === 'per_challenge') {
      const out = [];
      for (const ch of challenges) {
        const reps = doneOnChallenge(sets, athlete, ch);
        const share = shareOn(ch, participantCount);
        if (reps < share) out.push({
          athlete, challenge_id: ch.id, amount_cents: amount, rule_mode: mode,
          // i18n-ignore: `reason` ist nur intern, angezeigt wird aus rule_mode
          reason: ch.workout ? 'Pflicht-Workout fehlt' : `${share - reps} unter fairShare`,
        });
      }
      return out;
    }

    const perCh = challenges.map(ch => {
      const reps = doneOnChallenge(sets, athlete, ch);
      const share = shareOn(ch, participantCount);
      return { ch, reps, share, missed: reps < share };
    });

    let failed = false, reason = '';
    if (mode === 'per_week_any') {
      failed = perCh.some(x => x.missed);
      reason = failed ? `${perCh.filter(x => x.missed).length} Challenge(s) verfehlt` : ''; // i18n-ignore: nur intern
    } else if (mode === 'per_week_all') {
      failed = perCh.every(x => x.missed);
      reason = failed ? 'alle Challenges verfehlt' : ''; // i18n-ignore: nur intern
    } else { // per_week_aggregate — ein fehlendes Pflicht-Workout gleichen Wiederholungen nicht aus
      const repCh = perCh.filter(x => !x.ch.workout);
      const totalReps  = repCh.reduce((a, x) => a + x.reps, 0);
      const totalShare = repCh.reduce((a, x) => a + x.share, 0);
      const workoutMissed = perCh.some(x => x.ch.workout && x.missed);
      failed = totalReps < totalShare || workoutMissed;
      // i18n-ignore: `reason` ist nur intern, angezeigt wird aus rule_mode
      reason = totalReps < totalShare ? `aggregiert ${totalShare - totalReps} unter fairShare`
        : workoutMissed ? 'Pflicht-Workout fehlt' : ''; // i18n-ignore: nur intern
    }

    return failed
      ? [{ athlete, challenge_id: null, amount_cents: amount, rule_mode: mode, reason }]
      : [];
  }

  // ── Standard-Übungen ────────────────────────────────────────────────
  // Die globalen Standard-Kategorien (competition_id null) heißen in der
  // Datenbank deutsch. Beim Laden bekommt die Zeile den Namen in der
  // App-Sprache; in die Datenbank geht nie ein übersetzter Name zurück.
  // Eigene Kategorien einer Challenge bleiben, wie sie sind.
  function localizeCategory(row) {
    if (!row || row.competition_id != null) return row;
    let name = null;
    switch (row.name) {
      case 'Liegestütze': name = tr('Liegestütze'); break;
      case 'Klimmzüge': name = tr('Klimmzüge'); break;
      case 'Kniebeugen': name = tr('Kniebeugen'); break;
      default: return row;
    }
    return name === row.name ? row : { ...row, name };
  }

  // ── Row normalisation ───────────────────────────────────────────────
  function withAthlete(row) {
    if (!row) return row;
    if ('user_id' in row) row.athlete = row.user_id;
    return row;
  }
  function normSet(row) {
    withAthlete(row);
    if (row.reactions) row.reactions = row.reactions.map(withAthlete);
    return row;
  }
  function normChallenge(row) {
    if (row && 'chosen_by_user' in row) row.chosen_by = row.chosen_by_user;
    return row;
  }
  function normPenalty(row) {
    withAthlete(row);
    if (row && 'paid_by_user' in row) row.paid_by = row.paid_by_user;
    return row;
  }

  const TEXT = {
    exists: tr('Für diese E-Mail gibt es schon einen Account.'),
    badEmail: tr('Diese E-Mail-Adresse sieht nicht richtig aus.'),
    shortPassword: tr('Passwort muss mindestens 6 Zeichen haben.'),
    weakPassword: tr('Passwort zu schwach. Nimm ein anderes.'),
    rateLimit: tr('Zu viele Versuche. Warte kurz und probier es dann nochmal.'),
    signupOff: tr('Neue Konten sind gerade gesperrt.'),
    unconfirmed: tr('E-Mail ist noch nicht bestätigt.'),
    credentials: tr('E-Mail oder Passwort falsch.'),
    otp: tr('Code ungültig oder abgelaufen.'),
    offline: tr('Keine Verbindung. Prüf dein Internet.'),
  };

  // Supabase-Fehler (Text oder `code`) → Text in der App-Sprache, `code` bleibt erhalten.
  // Netzfehler bekommen `code = 'offline'`.
  function friendlyError(error) {
    const msg = error?.message || String(error);
    const code = error?.code || '';
    const wrap = (text, c = code) => { const e = new Error(text); e.code = c; return e; };
    const map = {
      invalid_code: tr('Code nicht gefunden.'),
      competition_full: tr('Diese Challenge ist schon voll.'),
      team_full: tr('Dieses Team ist schon voll.'),
      invalid_team: tr('Ungültiges Team.'),
      forbidden: tr('Das darf nur der Ersteller der Challenge.'),
      not_authenticated: tr('Bitte zuerst anmelden.'),
      'Invalid login credentials': TEXT.credentials,
      'User already registered': TEXT.exists,
      'Email not confirmed': TEXT.unconfirmed,
    };
    for (const [k, v] of Object.entries(map)) if (msg.includes(k)) return wrap(v);
    if (/Failed to fetch|Load failed|NetworkError|Network request failed|fetch failed/i.test(msg)
      || error?.name === 'AuthRetryableFetchError') return wrap(TEXT.offline, 'offline');
    if (/Password should be at least/i.test(msg)) return wrap(TEXT.shortPassword);
    const byCode = {
      user_already_exists: TEXT.exists, email_exists: TEXT.exists,
      email_address_invalid: TEXT.badEmail, weak_password: TEXT.weakPassword,
      over_email_send_rate_limit: TEXT.rateLimit, over_request_rate_limit: TEXT.rateLimit,
      signup_disabled: TEXT.signupOff, email_not_confirmed: TEXT.unconfirmed,
      invalid_credentials: TEXT.credentials, otp_expired: TEXT.otp,
    };
    if (byCode[code]) return wrap(byCode[code]);
    if (/already been registered/i.test(msg)) return wrap(TEXT.exists);
    if (/validate email address|email address .* is invalid/i.test(msg)) return wrap(TEXT.badEmail);
    if (/rate limit|For security purposes/i.test(msg)) return wrap(TEXT.rateLimit);
    if (/Signups not allowed/i.test(msg)) return wrap(TEXT.signupOff);
    if (/Token has expired or is invalid/i.test(msg)) return wrap(TEXT.otp);
    return error instanceof Error ? error : wrap(msg);
  }
  function check({ data, error }) {
    if (error) throw friendlyError(error);
    return data;
  }
  // Wie check, fängt aber auch geworfene Netzfehler (fetch) ab.
  async function guard(run) {
    let res;
    try { res = await run(); } catch (e) { throw friendlyError(e); }
    return check(res);
  }

  // Paged select — PostgREST liefert max. 1000 Zeilen pro Request.
  async function selectAll(buildQuery) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await buildQuery().range(from, from + PAGE - 1);
      if (error) throw friendlyError(error);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  // Session-Storage: in der iOS-App @capacitor/preferences (überlebt WebView-
  // Cache-Bereinigung), im Browser localStorage.
  const sessionStorageAdapter = {
    async getItem(key) {
      const prefs = await (window.PTPreferencesReady || Promise.resolve(null));
      if (prefs) return (await prefs.Preferences.get({ key })).value;
      try { return localStorage.getItem(key); } catch { return null; }
    },
    async setItem(key, value) {
      const prefs = await (window.PTPreferencesReady || Promise.resolve(null));
      if (prefs) return prefs.Preferences.set({ key, value });
      try { localStorage.setItem(key, value); } catch {}
    },
    async removeItem(key) {
      const prefs = await (window.PTPreferencesReady || Promise.resolve(null));
      if (prefs) return prefs.Preferences.remove({ key });
      try { localStorage.removeItem(key); } catch {}
    },
  };

  function createAPI(client) {
    let currentUserId = null;
    client.auth.onAuthStateChange((_evt, session) => { currentUserId = session?.user?.id || null; });
    const uid = () => {
      if (!currentUserId) throw new Error(tr('Bitte zuerst anmelden.'));
      return currentUserId;
    };

    const base = {
      mode: 'supabase',
      client,
      mondayOf, isoDate,

      // ── Auth ─────────────────────────────────────────────────────────
      async getSession() {
        const { data } = await client.auth.getSession();
        currentUserId = data.session?.user?.id || null;
        return data.session;
      },
      onAuthChange(fn) {
        const { data } = client.auth.onAuthStateChange((evt, session) => {
          currentUserId = session?.user?.id || null;
          fn(session, evt);
        });
        return () => data.subscription.unsubscribe();
      },
      // Ohne Session (E-Mail-Bestätigung im Dashboard an) zeigt die App
      // „Check deine Mails“. Bei aktiver Bestätigung meldet Supabase eine schon
      // registrierte Adresse nicht als Fehler, sondern mit leeren identities.
      async signUp({ email, password, displayName }) {
        const name = (displayName || '').trim();
        const data = await guard(() => client.auth.signUp({
          email: email.trim(), password,
          options: { data: name ? { display_name: name } : {} },
        }));
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          // i18n-ignore: Supabase-Fehlertext, wird oben in friendlyError übersetzt
          throw friendlyError({ message: 'User already registered', code: 'user_already_exists' });
        }
        return { session: data.session, user: data.user, needsConfirm: !data.session };
      },
      async signIn({ email, password }) {
        return (await guard(() => client.auth.signInWithPassword({ email: email.trim(), password }))).session;
      },
      async resendSignup(email) {
        await guard(() => client.auth.resend({ type: 'signup', email: email.trim() }));
      },
      async signOut() {
        await client.auth.signOut();
        currentUserId = null;
      },
      // Passwort vergessen: Mail enthält einen 6-stelligen Code ({{ .Token }}),
      // der in der App eingegeben wird — kein Deep Link nötig.
      async requestPasswordReset(email) {
        await guard(() => client.auth.resetPasswordForEmail(email.trim()));
      },
      async resetPasswordWithCode({ email, code, password }) {
        await guard(() => client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' }));
        await guard(() => client.auth.updateUser({ password }));
      },

      // ── Profile ──────────────────────────────────────────────────────
      async getMyProfile() {
        const id = uid();
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data, error } = await client.from('profiles').select('*').eq('id', id).maybeSingle();
          if (error) throw friendlyError(error);
          if (data) return data;
          // Trigger on_auth_user_created läuft async zur Session — kurz warten.
          await new Promise(r => setTimeout(r, 400));
        }
        throw new Error(tr('Profil nicht gefunden. Ist Migration A eingespielt?'));
      },
      async updateProfile(patch) {
        return check(await client.from('profiles').update(patch).eq('id', uid()).select().single());
      },
      // Onboarding-Stand fürs Konto (Spalte profiles.onboarding, Migration
      // 20261020000000). Aufrufen nur, wenn das geladene Profil die Spalte hat.
      async saveOnboarding(state) {
        return base.updateProfile({ onboarding: state });
      },
      async uploadAvatar(blob) {
        const path = `${uid()}/avatar-${Date.now()}.jpg`;
        check(await client.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
        const { data } = client.storage.from('avatars').getPublicUrl(path);
        return base.updateProfile({ avatar_url: data.publicUrl });
      },

      // ── Challenges ───────────────────────────────────────────────────
      async listMyCompetitions() {
        const rows = check(await client.from('competition_members')
          .select('role, team, joined_at, competition:competition_id(*)')
          .eq('user_id', uid())
          .is('left_at', null));
        return (rows || [])
          .filter(r => r.competition)
          .map(r => ({ ...r.competition, my_role: r.role, my_team: r.team }))
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      },
      async getMembers(competitionId) {
        const rows = check(await client.from('competition_members')
          .select('user_id, role, team, joined_at, left_at, profile:user_id(id, display_name, avatar_url, color)')
          .eq('competition_id', competitionId)
          .order('joined_at'));
        return rows || [];
      },
      async createCompetition({ name, emoji, mode, rotation, penalties, work, startDate, endDate }) {
        return check(await client.rpc('create_competition', {
          p_name: name, p_emoji: emoji, p_mode: mode,
          p_rotation: !!rotation, p_penalties: !!penalties, p_work: !!work,
          p_start_date: startDate || isoDate(new Date()), p_end_date: endDate || null,
        }));
      },
      async previewCompetition(code) {
        return check(await client.rpc('preview_competition', { p_code: code }));
      },
      async joinCompetition(code, team = null) {
        return check(await client.rpc('join_competition', { p_code: code, p_team: team }));
      },
      async updateCompetition(id, patch) {
        return check(await client.from('competitions').update(patch).eq('id', id).select().single());
      },
      async setMemberTeam(competitionId, userId, team) {
        check(await client.rpc('set_member_team', { p_competition: competitionId, p_user: userId, p_team: team }));
      },
      async removeMember(competitionId, userId) {
        check(await client.rpc('remove_member', { p_competition: competitionId, p_user: userId }));
      },
      async leaveCompetition(competitionId) {
        check(await client.rpc('leave_competition', { p_competition: competitionId }));
      },
      async regenerateInviteCode(competitionId) {
        return check(await client.rpc('regenerate_invite_code', { p_competition: competitionId }));
      },

      // ── Cross-Challenge-Daten für All-Time- und Duell-Stats ──────────
      async getStatsBundle(competitionIds) {
        if (!competitionIds.length) return { members: [], challenges: [], sets: [], categories: [] };
        const [members, challenges, sets, categories] = await Promise.all([
          selectAll(() => client.from('competition_members')
            .select('competition_id, user_id, role, team, joined_at, left_at, profile:user_id(id, display_name, avatar_url, color)')
            .in('competition_id', competitionIds)),
          selectAll(() => client.from('weekly_challenges').select('*')
            .in('competition_id', competitionIds).order('week_start', { ascending: false }).order('created_at')),
          selectAll(() => client.from('sets')
            .select('id, challenge_id, competition_id, user_id, reps, duration_minutes, created_at')
            .in('competition_id', competitionIds).order('created_at', { ascending: false })),
          selectAll(() => client.from('categories').select('*').order('created_at')),
        ]);
        return {
          members,
          challenges: challenges.map(normChallenge),
          sets: sets.map(withAthlete),
          categories: categories.map(localizeCategory),
        };
      },

      // ── Push notification device tokens ──────────────────────────────
      async upsertDeviceToken({ token, platform }) {
        return check(await client.from('device_tokens')
          .upsert({ token, user_id: uid(), platform, last_seen: new Date().toISOString() }, { onConflict: 'token' })
          .select().single());
      },
      async deleteDeviceToken(token) {
        check(await client.from('device_tokens').delete().eq('token', token));
      },

      forCompetition(competitionId) {
        return createCompetitionAPI(client, competitionId, uid);
      },
    };
    return base;
  }

  function createCompetitionAPI(client, cid, uid) {
    const listeners = new Set();
    let emitTimer = null;
    function emit() {
      // Realtime feuert bei Batch-Operationen viele Events — bündeln.
      clearTimeout(emitTimer);
      emitTimer = setTimeout(() => listeners.forEach(fn => fn()), 120);
    }

    const filter = `competition_id=eq.${cid}`;
    let channel = null;
    function subscribe() {
      if (channel) return;
      channel = client.channel(`pt-${cid}`);
      for (const table of ['sets','weekly_challenges','plan_slots','rotation_config','penalties','week_closures',
                           'penalty_config','payouts','project_tags','tool_tags','competition_members','categories']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, emit);
      }
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, emit)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'competitions', filter: `id=eq.${cid}` }, emit)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, emit)
        .subscribe();
    }

    async function ensureClosures(rows) {
      if (!rows.length) return;
      const { data: existing } = await client.from('week_closures').select('week_start').eq('competition_id', cid);
      const have = new Set((existing || []).map(r => r.week_start));
      const missing = rows.filter(r => !have.has(r.week_start));
      if (missing.length) check(await client.from('week_closures').insert(missing));
    }

    const api = {
      mode: 'supabase',
      client,
      competitionId: cid,
      mondayOf, isoDate,

      async getCompetition() {
        return check(await client.from('competitions').select('*').eq('id', cid).single());
      },
      async getMembers() {
        return check(await client.from('competition_members')
          .select('user_id, role, team, joined_at, left_at, profile:user_id(id, display_name, avatar_url, color)')
          .eq('competition_id', cid)
          .order('joined_at')) || [];
      },

      async getCategories() {
        const rows = check(await client.from('categories').select('*')
          .or(`competition_id.is.null,competition_id.eq.${cid}`)
          .order('created_at'));
        return (rows || []).map(localizeCategory);
      },
      async addCategory(name, emoji='💪', kind='sports') {
        const data = check(await client.from('categories')
          .insert({ name, emoji, kind, competition_id: cid, created_by: uid() }).select().single());
        emit();
        return data;
      },
      async updateCategory(id, patch) {
        const { data, error } = await client.from('categories').update(patch).eq('id', id).select();
        if (error) throw friendlyError(error);
        if (!data?.length) throw new Error(tr('Standard-Kategorien können nicht bearbeitet werden.'));
        emit();
        return data[0];
      },
      async deleteCategory(id) {
        const { data, error } = await client.from('categories').delete().eq('id', id).select('id');
        if (error) throw new Error(error.message.includes('foreign') ? tr('Kategorie wird genutzt – nicht löschbar') : error.message);
        if (!data?.length) throw new Error(tr('Standard-Kategorien können nicht gelöscht werden.'));
        emit();
      },

      async getProjectTags() {
        return check(await client.from('project_tags').select('*').eq('competition_id', cid).order('created_at'));
      },
      async addProjectTag(name, emoji = '📁') {
        const data = check(await client.from('project_tags').insert({ name, emoji, competition_id: cid }).select().single());
        emit(); return data;
      },
      async updateProjectTag(id, patch) {
        const data = check(await client.from('project_tags').update(patch).eq('id', id).select().single());
        emit(); return data;
      },
      async deleteProjectTag(id) {
        check(await client.from('project_tags').delete().eq('id', id)); emit();
      },
      async getToolTags() {
        return check(await client.from('tool_tags').select('*').eq('competition_id', cid).order('created_at'));
      },
      async addToolTag(name, emoji = '🔧') {
        const data = check(await client.from('tool_tags').insert({ name, emoji, competition_id: cid }).select().single());
        emit(); return data;
      },
      async updateToolTag(id, patch) {
        const data = check(await client.from('tool_tags').update(patch).eq('id', id).select().single());
        emit(); return data;
      },
      async deleteToolTag(id) {
        check(await client.from('tool_tags').delete().eq('id', id)); emit();
      },

      // ── Wochenziele (Tabelle weekly_challenges) ──────────────────────
      async getChallengeForWeek(weekStart) {
        const data = check(await client.from('weekly_challenges').select('*')
          .eq('competition_id', cid).eq('week_start', weekStart));
        return (data || []).map(normChallenge);
      },
      async upsertChallenge(payload) {
        const row = {
          category_id: payload.category_id,
          target_reps: payload.target_reps,
          chosen_by_user: payload.chosen_by || uid(),
        };
        if (payload.id) {
          const data = check(await client.from('weekly_challenges').update(row).eq('id', payload.id).select().single());
          emit();
          return normChallenge(data);
        }
        const { data, error } = await client.from('weekly_challenges')
          .insert({ ...row, week_start: payload.week_start, competition_id: cid }).select().single();
        if (error) {
          // Kategorie existiert in dieser Woche schon — bestehende Zeile zurückgeben
          if (error.code === '23505') {
            const { data: existing } = await client.from('weekly_challenges').select('*')
              .eq('competition_id', cid).eq('week_start', payload.week_start).eq('category_id', payload.category_id)
              .maybeSingle();
            if (existing) { emit(); return normChallenge(existing); }
          }
          throw friendlyError(error);
        }
        emit();
        return normChallenge(data);
      },
      async deleteChallenge(id) {
        check(await client.from('weekly_challenges').delete().eq('id', id));
        emit();
      },
      async listChallenges() {
        const data = await selectAll(() => client.from('weekly_challenges').select('*')
          .eq('competition_id', cid)
          .order('week_start', { ascending: false })
          .order('created_at', { ascending: true }));
        return data.map(normChallenge);
      },

      // ── Sätze ────────────────────────────────────────────────────────
      async listSets(challengeId) {
        const data = check(await client.from('sets').select('*').eq('challenge_id', challengeId)
          .order('created_at', { ascending: false }));
        return (data || []).map(normSet);
      },
      async addSet({ athlete, ...payload }) {
        const data = check(await client.from('sets')
          .insert({ ...payload, user_id: uid(), competition_id: cid }).select().single());
        emit();
        return normSet(data);
      },
      async updateSet(id, patch) {
        const { athlete, ...rest } = patch;
        const data = check(await client.from('sets').update(rest).eq('id', id).select().single());
        emit();
        return normSet(data);
      },
      async deleteSet(id) {
        check(await client.from('sets').delete().eq('id', id));
        emit();
      },
      async recentFeed(limit=50) {
        const data = check(await client.from('sets')
          .select('*, challenge:challenge_id(*, category:category_id(*)), reactions(id, user_id, emoji)')
          .eq('competition_id', cid)
          .order('created_at', { ascending: false })
          .limit(limit));
        return (data || []).map(s => {
          normSet(s);
          return { ...s, category: localizeCategory(s.challenge?.category), challenge: normChallenge(s.challenge), reactions: s.reactions || [] };
        });
      },
      async getAllSets() {
        const data = await selectAll(() => client.from('sets').select('*')
          .eq('competition_id', cid)
          .order('created_at', { ascending: false }));
        return data.map(normSet);
      },
      async addReaction({ set_id, emoji }) {
        const { data, error } = await client.from('reactions')
          .insert({ set_id, emoji, user_id: uid() }).select().single();
        if (error) {
          if (error.code === '23505') return null; // unique violation, already exists
          throw friendlyError(error);
        }
        emit();
        return withAthlete(data);
      },
      async removeReaction({ set_id, emoji }) {
        check(await client.from('reactions').delete().match({ set_id, emoji, user_id: uid() }));
        emit();
      },

      // ── Rotation plan ────────────────────────────────────────────────
      async getPlanSlots() {
        return check(await client.from('plan_slots').select('*')
          .eq('competition_id', cid).order('week_index').order('position')) || [];
      },
      async addPlanSlot(payload) {
        const data = check(await client.from('plan_slots').insert({
          competition_id: cid,
          week_index: payload.week_index,
          category_id: payload.category_id,
          start_target: payload.start_target || 100,
          bonus_max: payload.bonus_max ?? 0,
          position: payload.position || 0,
        }).select().single());
        emit();
        return data;
      },
      async updatePlanSlot(id, patch) {
        const data = check(await client.from('plan_slots').update(patch).eq('id', id).select().single());
        emit();
        return data;
      },
      async deletePlanSlot(id) {
        check(await client.from('plan_slots').delete().eq('id', id));
        emit();
      },
      async getRotationConfig() {
        const data = check(await client.from('rotation_config').select('*').eq('competition_id', cid).maybeSingle());
        if (data) return data;
        return check(await client.from('rotation_config')
          .insert({ competition_id: cid, start_date: isoDate(mondayOf(new Date())), enabled: true })
          .select().single());
      },
      async setRotationConfig(patch) {
        const data = check(await client.from('rotation_config')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('competition_id', cid).select().single());
        emit();
        return data;
      },

      // ── Penalty system ───────────────────────────────────────────────
      async getPenaltyConfig() {
        const data = check(await client.from('penalty_config').select('*').eq('competition_id', cid).maybeSingle());
        if (data) return data;
        return check(await client.from('penalty_config')
          .insert({ competition_id: cid, enabled: false }).select().single());
      },
      async setPenaltyConfig(patch) {
        const { _by, ...rest } = patch;
        const cfg = check(await client.from('penalty_config')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('competition_id', cid).select().single());
        if (patch.enabled === true) {
          // Aktivierung wirkt nicht rückwirkend: vergangene Wochen als abgeschlossen markieren.
          const monday = isoDate(mondayOf(new Date()));
          const { data: chs } = await client.from('weekly_challenges')
            .select('week_start').eq('competition_id', cid).lt('week_start', monday);
          const weeks = [...new Set((chs || []).map(c => c.week_start))];
          await ensureClosures(weeks.map(w => ({ week_start: w, competition_id: cid, closed_by_user: uid() })));
        }
        emit();
        return cfg;
      },
      async previewWeekClose(weekStart) {
        const cfg = await api.getPenaltyConfig();
        if (!cfg.enabled) return { penalties: [], cfg };
        const [chsRaw, members, cats] = await Promise.all([
          api.getChallengeForWeek(weekStart),
          api.getMembers(),
          api.getCategories(),
        ]);
        const chs = chsRaw || [];
        const chIds = chs.map(c => c.id);
        let wkSets = [];
        if (chIds.length) {
          const data = check(await client.from('sets').select('*').in('challenge_id', chIds));
          wkSets = (data || []).map(normSet);
        }
        annotateWorkouts(wkSets, chs, cats);
        const participants = participantsFor(members, weekStart);
        const pens = [];
        for (const m of participants) {
          pens.push(...computePenalties(chs, wkSets, m.user_id, cfg, participants.length));
        }
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart) {
        const { error: clErr } = await client.from('week_closures')
          .insert({ week_start: weekStart, competition_id: cid, closed_by_user: uid() });
        if (clErr) {
          if (clErr.code === '23505') throw new Error(tr('Woche bereits abgeschlossen'));
          throw friendlyError(clErr);
        }
        const { penalties } = await api.previewWeekClose(weekStart);
        if (penalties.length) {
          check(await client.from('penalties').insert(penalties.map(p => ({
            competition_id: cid, week_start: weekStart, user_id: p.athlete, challenge_id: p.challenge_id,
            amount_cents: p.amount_cents, rule_mode: p.rule_mode,
          }))));
        }
        emit();
        return { closed: true };
      },
      async reopenWeek(weekStart) {
        await client.from('penalties').delete().eq('competition_id', cid).eq('week_start', weekStart).eq('paid', false);
        await client.from('week_closures').delete().eq('competition_id', cid).eq('week_start', weekStart);
        emit();
      },
      async listPenalties() {
        const data = check(await client.from('penalties').select('*')
          .eq('competition_id', cid)
          .order('week_start', { ascending: false })
          .order('created_at', { ascending: false }));
        return (data || []).map(normPenalty);
      },
      async markPenaltyPaid(id, { note }) {
        const data = check(await client.from('penalties')
          .update({ paid: true, paid_at: new Date().toISOString(), paid_by_user: uid(), note: note ?? null })
          .eq('id', id).select().single());
        emit();
        return normPenalty(data);
      },
      async unmarkPenaltyPaid(id) {
        const data = check(await client.from('penalties')
          .update({ paid: false, paid_at: null, paid_by_user: null })
          .eq('id', id).select().single());
        emit();
        return normPenalty(data);
      },
      async deletePenalty(id) {
        check(await client.from('penalties').delete().eq('id', id));
        emit();
      },
      async listClosures() {
        return check(await client.from('week_closures').select('*')
          .eq('competition_id', cid).order('week_start', { ascending: false })) || [];
      },
      async listOpenClosures() {
        const monday = isoDate(mondayOf(new Date()));
        const [chs, cls] = await Promise.all([
          client.from('weekly_challenges').select('week_start').eq('competition_id', cid).lt('week_start', monday),
          client.from('week_closures').select('week_start').eq('competition_id', cid),
        ]);
        const chsData = check(chs), clsData = check(cls);
        const closed = new Set((clsData || []).map(c => c.week_start));
        const weeks = new Set();
        for (const ch of chsData || []) if (!closed.has(ch.week_start)) weeks.add(ch.week_start);
        return [...weeks].sort();
      },
      async listPayouts() {
        const data = check(await client.from('payouts').select('*')
          .eq('competition_id', cid).order('paid_at', { ascending: false }));
        return (data || []).map(withAthlete);
      },
      async addPayout({ athlete, amount_cents, note }) {
        const data = check(await client.from('payouts')
          .insert({ competition_id: cid, user_id: athlete, amount_cents, note: note || null })
          .select().single());
        emit();
        return withAthlete(data);
      },
      async deletePayout(id) {
        check(await client.from('payouts').delete().eq('id', id));
        emit();
      },

      onChange(fn) {
        subscribe();
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
          if (!listeners.size && channel) { client.removeChannel(channel); channel = null; }
        };
      },
    };
    return api;
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
      if (!url || !key || !window.supabase) return null;
      const client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: sessionStorageAdapter },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      return createAPI(client);
    },
    mondayOf, isoDate, addDays, suggestForWeek, weekTemplateFor, computePenalties, fairShareOf, participantsFor,
    isWorkoutType, annotateWorkouts, setValue, workoutValueLabel, noteText, workoutSummary, workoutPeopleDone,
    friendlyError, localizeCategory,
  };
})();
