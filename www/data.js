// Benny & Joni — Data Layer
// Supabase-Client mit Auth, Profilen, Challenges (Tabelle `competitions`) und
// einem pro Challenge gescopten API (`api.forCompetition(id)`), das dieselben
// Methoden wie früher anbietet (listChallenges, addSet, …).
//
// Konvention: Zeilen mit `user_id` bekommen zusätzlich `athlete = user_id`,
// damit die Screens weiter mit `s.athlete === me` arbeiten können — `me` ist
// jetzt die User-ID, nicht mehr ein Name.

(function() {
  const PAGE = 1000;

  // Release app supports sports only. Filter views without deleting stored Work history.
  // Accept both cached competition bundles and cross-challenge stats bundles.
  function sportsOnlyBundle(bundle) {
    const workCategories = new Set((bundle.categories || []).filter(c => c.kind === 'work').map(c => c.id));
    const allChallenges = [...(bundle.challenges || []), ...(bundle.allChallenges || [])];
    const workChallenges = new Set(allChallenges
      .filter(ch => workCategories.has(ch.category_id) || ch.category?.kind === 'work').map(ch => ch.id));
    // Minuten gehören zu Zeit-Übungen (bleiben) oder zu Work (fliegt raus). Ohne
    // bekannte Challenge und ohne Zeit-Kategorie gilt ein Minuten-Satz als Work.
    const knownChallenges = new Set(allChallenges.map(ch => ch.id));
    const isTime = (s) => s.category?.kind === 'time' || s.challenge?.category?.kind === 'time';
    const isWorkSet = (s) => workChallenges.has(s.challenge_id) || s.category?.kind === 'work'
      || s.challenge?.category?.kind === 'work'
      || (s.duration_minutes != null && !knownChallenges.has(s.challenge_id) && !isTime(s));
    const result = { ...bundle };
    if (bundle.categories) result.categories = bundle.categories.filter(c => c.kind !== 'work');
    for (const key of ['challenges', 'allChallenges', 'planSlots']) {
      if (Array.isArray(bundle[key])) result[key] = bundle[key]
        .filter(ch => !workCategories.has(ch.category_id) && ch.category?.kind !== 'work');
    }
    for (const key of ['sets', 'allSets', 'feed']) {
      if (Array.isArray(bundle[key])) result[key] = bundle[key].filter(s => !isWorkSet(s));
    }
    return result;
  }

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
  // Wiederholungs-Summen. target_runs ist die Zahl der Durchgänge pro Person;
  // alte Ziele ohne dieses Feld verlangen weiterhin einen Durchgang.
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

  function workoutTargetRuns(ch) {
    const n = Number(ch?.target_runs);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  // Eine log_id bezeichnet denselben Trainingseintrag auch bei Wiederholungen
  // im Cache. Alte Sätze ohne ID sind jeweils ein eigener Durchgang.
  function workoutRunCount(sets) {
    const seen = new Set();
    let count = 0;
    for (const s of sets || []) {
      const key = s.log_id || s.id;
      if (key) {
        const ownKey = `${s.athlete || s.user_id || ''}|${key}`;
        if (seen.has(ownKey)) continue;
        seen.add(ownKey);
      }
      count++;
    }
    return count;
  }

  // Fortschritt wird pro Person gedeckelt: zusätzliche Durchgänge einer Person
  // ersetzen den fehlenden Anteil eines anderen Mitglieds nicht.
  function workoutProgress(sets, userIds, targetRuns = 1) {
    const target = workoutTargetRuns({ target_runs: targetRuns });
    return [...new Set(userIds)].reduce((sum, id) =>
      sum + Math.min(target, workoutRunCount(sets.filter(s => s.athlete === id))), 0);
  }

  function workoutPeopleDone(sets, userIds, targetRuns = 1) {
    const target = workoutTargetRuns({ target_runs: targetRuns });
    return [...new Set(userIds)].filter(id => workoutRunCount(sets.filter(s => s.athlete === id)) >= target).length;
  }

  // ── Einheiten und gleiche Übungen ───────────────────────────────────
  // categories.kind: 'sports' zählt Wiederholungen (reps), 'time' Minuten
  // (z. B. Bibellesen, Planks), 'work' Minuten mit Projekt und Tool. Zeit und
  // Work speichern duration_minutes statt reps.
  function usesMinutes(cat) {
    return cat?.kind === 'time' || cat?.kind === 'work';
  }

  // „Dieselbe Übung“ über Challenges hinweg: Standard-Übungen über ihre ID,
  // eigene über Art und Namen (Groß-/Kleinschreibung und Leerzeichen egal).
  // Work bleibt pro Challenge, weil Projekte und Tools zur Challenge gehören.
  function exerciseKey(cat, competitionId) {
    if (!cat) return null;
    if (cat.kind === 'work') return `work:${competitionId || cat.competition_id}:${cat.id}`;
    if (cat.competition_id == null) return `cat:${cat.id}`;
    return `own:${cat.kind || 'sports'}:${String(cat.name || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
  }

  // Gemeinsame log_id für einen Satz, der in mehreren Challenges zählt.
  function newLogId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${h()}${h()}-${h()}-4${h().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
  }

  // ── Penalty system: pure computation ────────────────────────────────
  // Pflicht-Workouts (ch.workout, s. annotateWorkouts) zählen Durchgänge und
  // verlangen target_runs pro Person (standardmäßig einen).
  function doneOnChallenge(sets, athlete, ch) {
    if (ch.workout) return workoutRunCount(sets.filter(s => s.challenge_id === ch.id && s.athlete === athlete));
    let total = 0;
    for (const s of sets) {
      if (s.challenge_id === ch.id && s.athlete === athlete) {
        total += s.reps ?? s.duration_minutes ?? 0;
      }
    }
    return total;
  }
  function shareOn(ch, participantCount) {
    return ch.workout ? workoutTargetRuns(ch) : fairShareOf(ch.target_reps, participantCount);
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
          reason: ch.workout ? 'Pflicht-Workout fehlt' : `${share - reps} unter dem eigenen Anteil`,
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
      reason = totalReps < totalShare ? `Insgesamt ${totalShare - totalReps} unter dem eigenen Anteil`
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
    let name = row.name;
    switch (row.name) {
      case 'Liegestütze': name = tr('Liegestütze'); break;
      case 'Klimmzüge': name = tr('Klimmzüge'); break;
      case 'Kniebeugen': name = tr('Kniebeugen'); break;
      case '20-Min-AMRAP': name = tr('20-Min-AMRAP'); break;
    }
    const rule = localizeRule(row.rule);
    return name === row.name && rule === row.rule ? row : { ...row, name, rule };
  }

  // Ausführungsregeln der Rangliste (categories.rule, Migrationen monthly_ranking
  // und rank_crunches), ebenfalls deutsch in der Datenbank.
  function localizeRule(rule) {
    switch (rule) {
      case 'Brust fast am Boden, oben Arme ganz gestreckt.': return tr('Brust fast am Boden, oben Arme ganz gestreckt.');
      case 'Aus dem toten Hang, Kinn über die Stange.': return tr('Aus dem toten Hang, Kinn über die Stange.');
      case 'Oberarme mindestens parallel zum Boden, oben ganz gestreckt.': return tr('Oberarme mindestens parallel zum Boden, oben ganz gestreckt.');
      case 'Gestreckte Beine bis mindestens 90 Grad anheben.': return tr('Gestreckte Beine bis mindestens 90 Grad anheben.');
      case 'Kopf berührt Boden oder Matte, oben ganz gestreckt.': return tr('Kopf berührt Boden oder Matte, oben ganz gestreckt.');
      case 'Schultern ganz ab, Brust bis zu den Knien.': return tr('Schultern ganz ab, Brust bis zu den Knien.');
      case 'Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.': return tr('Hüfte mindestens auf Kniehöhe, oben ganz aufrichten.');
      case 'Brust am Boden, oben Sprung mit den Händen über dem Kopf.': return tr('Brust am Boden, oben Sprung mit den Händen über dem Kopf.');
      case 'Zeit bis zum ersten Absetzen, 3:24 ist das Maximum.': return tr('Zeit bis zum ersten Absetzen, 3:24 ist das Maximum.');
      case 'Volle Runden in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen.': return tr('Volle Runden in 20 Minuten: 5 Klimmzüge, 10 Liegestütze, 15 Kniebeugen.');
      case 'Schulterblätter vom Boden, Hände nicht am Kopf ziehen.': return tr('Schulterblätter vom Boden, Hände nicht am Kopf ziehen.');
      default: return rule;
    }
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
    duplicate: tr('Gibt es schon.'),
    invalid: tr('Ungültiger Wert.'),
    noAccess: tr('Keine Berechtigung – bist du noch in der Challenge?'),
    generic: tr('Etwas ist schiefgelaufen. Versuch es nochmal.'),
    profilePending: tr('Dein Profil wird noch angelegt. Versuch es gleich nochmal.'),
    hasSets: tr('Für dieses Ziel gibt es schon Sätze. Ändere stattdessen die Zielmenge.'),
    categoryLocked: tr('Die Übung lässt sich nicht mehr wechseln, es gibt schon Sätze.'),
    deleteFailed: tr('Konto konnte nicht gelöscht werden. Prüfe deine Verbindung und versuch es nochmal.'),
  };

  // Mailversand (Bestätigung, Passwort-Reset) gescheitert; mit Support-Adresse,
  // sobald PTOnboarding.SUPPORT_EMAIL gesetzt ist.
  function mailText() {
    const mail = window.PTOnboarding?.SUPPORT_EMAIL;
    return mail
      ? tr('Mail konnte gerade nicht verschickt werden. Versuch es später nochmal oder schreib uns an {mail}.', { mail })
      : tr('Mail konnte gerade nicht verschickt werden. Versuch es später nochmal oder schreib uns.');
  }

  // Eigene Fehler mit festem Code (z. B. 'has_sets'); auch demo.js baut sie hiermit.
  const APP_ERRORS = { has_sets: TEXT.hasSets, category_locked: TEXT.categoryLocked, delete_failed: TEXT.deleteFailed };
  function appError(code) {
    const e = new Error(APP_ERRORS[code] || TEXT.generic);
    e.code = code;
    e.friendly = true;
    return e;
  }

  // Roh-Fehler von Supabase (PostgREST, Auth, Storage, Functions) erkennt man am
  // Objekt ohne Error-Typ oder an code/status/details. Eigene Texte (`new Error('…')`)
  // bleiben unverändert. Kein instanceof: Tests laden data.js in einem eigenen vm-Kontext.
  function isBackendError(error) {
    if (Object.prototype.toString.call(error) !== '[object Error]') return true;
    return !!(error.code || error.status || error.details || error.hint)
      || /^(Auth|Storage|Functions|Postgrest)/.test(error.name || '');
  }

  // Supabase-Fehler (Text oder `code`) → Text in der App-Sprache, `code` bleibt erhalten.
  // Netzfehler bekommen `code = 'offline'`. Unbekannte Roh-Fehler landen in der
  // Konsole, die Person sieht einen allgemeinen Satz statt englischem Fachtext.
  function friendlyError(error) {
    if (error?.friendly) return error;
    const msg = error?.message || String(error);
    const code = error?.code || '';
    const wrap = (text, c = code) => { const e = new Error(text); e.code = c; e.friendly = true; return e; };
    const map = {
      workout_update_required: tr('Bitte aktualisiere die App, um diese Woche abzuschließen.'),
      invalid_code: tr('Code nicht gefunden.'),
      competition_full: tr('Diese Challenge ist schon voll.'),
      team_full: tr('Dieses Team ist schon voll.'),
      invalid_team: tr('Ungültiges Team.'),
      catalog_name: tr('Diese Übung gibt es schon im Katalog. Nimm die, dann zählt sie für die Rangliste.'),
      not_ranked: tr('Diese Übung zählt nicht für die Rangliste.'),
      invalid_value: tr('Bitte einen Wert größer als 0 eingeben.'),
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
    if (code === 'email_address_not_authorized' || /Error sending|not authorized/i.test(msg)) return wrap(mailText());
    const byCode = {
      user_already_exists: TEXT.exists, email_exists: TEXT.exists,
      email_address_invalid: TEXT.badEmail, weak_password: TEXT.weakPassword,
      over_email_send_rate_limit: TEXT.rateLimit, over_request_rate_limit: TEXT.rateLimit,
      signup_disabled: TEXT.signupOff, email_not_confirmed: TEXT.unconfirmed,
      invalid_credentials: TEXT.credentials, otp_expired: TEXT.otp,
      // Postgres: doppelter Eintrag, Check-Constraint, Zahl zu groß, RLS/Rechte
      23505: TEXT.duplicate, 23514: TEXT.invalid, 22003: TEXT.invalid, 42501: TEXT.noAccess,
    };
    if (byCode[code]) return wrap(byCode[code]);
    if (/already been registered/i.test(msg)) return wrap(TEXT.exists);
    if (/validate email address|email address .* is invalid/i.test(msg)) return wrap(TEXT.badEmail);
    if (/rate limit|For security purposes/i.test(msg)) return wrap(TEXT.rateLimit);
    if (/Signups not allowed/i.test(msg)) return wrap(TEXT.signupOff);
    if (/Token has expired or is invalid/i.test(msg)) return wrap(TEXT.otp);
    if (isBackendError(error)) {
      console.error('Unbekannter Fehler', error);
      return wrap(TEXT.generic);
    }
    return error;
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
  // RPC fehlt (Migration noch nicht eingespielt)
  const missingRpc = (error) => error?.code === 'PGRST202' || /Could not find the function/i.test(error?.message || '');

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

    // ── Konto löschen: Hilfen ──────────────────────────────────────────
    // Profilbilder liegen unter avatars/<uid>/ (jeder Upload eine neue Datei). Die
    // Datenbank-Kaskade erreicht den Storage nicht, deshalb vorher hier löschen.
    // Das Konto erst löschen, wenn die Dateien entfernt sind: Danach würde
    // der Nutzer seinen Storage-Zugriff und damit die Möglichkeit zum Aufräumen verlieren.
    async function removeOwnAvatars(id) {
      const bucket = client.storage.from('avatars');
      for (let round = 0; round <= 20; round++) {
        const { data, error } = await bucket.list(id, { limit: 100 });
        if (error) throw error;
        if (!Array.isArray(data)) throw appError('delete_failed');
        const paths = data.filter(f => f.id && f.name).map(f => `${id}/${f.name}`);
        if (!paths.length) return;
        if (round === 20) throw appError('delete_failed');
        const { data: removed, error: rmError } = await bucket.remove(paths);
        if (rmError) throw rmError;
        if (!removed?.length) throw appError('delete_failed');
        // Auch nach einer kleinen oder nur teilweise bestätigten Antwort
        // erneut listen, bis der eigene Ordner nachweislich leer ist.
      }
    }
    // Darf delete_my_account() auth.users nicht anfassen, übernimmt die Edge Function.
    const needsAdminDelete = (error) =>
      error?.code === '42501' || /permission denied/i.test(error?.message || '');
    // Lokal abmelden; scheitert das (kein Netz), das gespeicherte Token selbst entfernen.
    async function signOutLocal() {
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (e) {
        console.warn('Abmelden nach dem Löschen', e);
        try { if (client.auth.storageKey) await sessionStorageAdapter.removeItem(client.auth.storageKey); } catch (_) {}
      }
      currentUserId = null;
    }

    const base = {
      mode: 'supabase',
      client,
      mondayOf, isoDate,

      // Öffentliche Betriebsfreigabe, ohne Offline-Cache. Fehlende Migration,
      // keine Zeile oder Netz-/Rechtefehler lassen Werbung ausgeschaltet.
      async getAdsEnabled() {
        try {
          const { data, error } = await client.from('app_release_settings')
            .select('ads_enabled').eq('id', 1).maybeSingle();
          return !error && data?.ads_enabled === true;
        } catch (_) { return false; }
      },

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
      // Konto endgültig löschen (App Store 5.1.1(v)): Profilbilder, dann das Konto
      // per RPC delete_my_account (Migration 20261021000010; Ausweichweg Edge Function
      // delete-account), dann lokal abmelden und Gerätedaten entfernen. Die Oberfläche
      // lädt danach die Startseite neu.
      async deleteAccount() {
        const id = uid();
        try {
          await removeOwnAvatars(id);
          const { error } = await client.rpc('delete_my_account');
          if (error) {
            if (!needsAdminDelete(error)) throw error;
            const { error: fnError } = await client.functions.invoke('delete-account', { method: 'POST' });
            if (fnError) throw fnError;
          }
        } catch (e) {
          console.error('Konto löschen fehlgeschlagen', e);
          throw appError('delete_failed');
        }
        await signOutLocal();
        clearLocalData();
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
        throw new Error(TEXT.profilePending);
      },
      async updateProfile(patch) {
        return check(await client.from('profiles').update(patch).eq('id', uid()).select().single());
      },
      async setKickEnabled(on) {
        return base.updateProfile({ kick_enabled: !!on });
      },
      async kickMember(competitionId, recipientId) {
        uid();
        let response;
        try {
          response = await client.functions.invoke('kick-teammate', {
            body: { competition_id: competitionId, recipient_id: recipientId },
          });
        } catch (error) { throw friendlyError(error); }
        const { data, error } = response;
        if (error) throw friendlyError(error);
        if (!data || typeof data.sent !== 'boolean') throw new Error(tr('Arschkick konnte nicht gesendet werden. Versuch es später nochmal.'));
        return data;
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
      // Das Freie Training (mode 'solo') ist eine versteckte Challenge und
      // kommt nur mit includeSolo mit (Stats „Ich“).
      async listMyCompetitions({ includeSolo = false } = {}) {
        const rows = check(await client.from('competition_members')
          .select('role, team, joined_at, competition:competition_id(*)')
          .eq('user_id', uid())
          .is('left_at', null));
        return (rows || [])
          .filter(r => r.competition && (includeSolo || r.competition.mode !== 'solo'))
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
      async createCompetition({ name, emoji, mode, rotation, penalties, startDate, endDate }) {
        return check(await client.rpc('create_competition', {
          p_name: name, p_emoji: emoji, p_mode: mode,
          p_rotation: !!rotation, p_penalties: !!penalties, p_work: false,
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
        return check(await client.from('competitions').update({ ...patch, work_enabled: false }).eq('id', id).select().single());
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
            .select('id, challenge_id, competition_id, user_id, reps, duration_minutes, created_at, log_id')
            .in('competition_id', competitionIds).order('created_at', { ascending: false })),
          selectAll(() => client.from('categories').select('*').order('created_at')),
        ]);
        return sportsOnlyBundle({
          members,
          challenges: challenges.map(normChallenge),
          sets: sets.map(withAthlete),
          categories: categories.map(localizeCategory),
        });
      },

      // ── Dashboard „Heute“ über alle Challenges ───────────────────────
      // Wochenziele ab fromWeek (Montag, laufende und letzte Woche) mit ihren
      // Sätzen, dazu Mitglieder und Übungen.
      async getDashboard(competitionIds, fromWeek) {
        if (!competitionIds.length) return { members: [], challenges: [], sets: [], categories: [] };
        const [members, challenges, categories] = await Promise.all([
          selectAll(() => client.from('competition_members')
            .select('competition_id, user_id, role, team, joined_at, left_at, profile:user_id(id, display_name, avatar_url, color)')
            .in('competition_id', competitionIds)),
          selectAll(() => client.from('weekly_challenges').select('*')
            .in('competition_id', competitionIds).gte('week_start', fromWeek)
            .order('week_start', { ascending: false }).order('created_at')),
          selectAll(() => client.from('categories').select('*').order('created_at')),
        ]);
        const ids = challenges.map(c => c.id);
        const chunks = [];
        for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
        const sets = (await Promise.all(chunks.map(part => selectAll(() => client.from('sets')
          .select('id, challenge_id, competition_id, user_id, reps, duration_minutes, note, created_at, log_id')
          .in('challenge_id', part).order('created_at', { ascending: false }))))).flat();
        return sportsOnlyBundle({
          members,
          challenges: challenges.map(normChallenge),
          sets: sets.map(withAthlete),
          categories: categories.map(localizeCategory),
        });
      },
      // Live-Änderungen an Sätzen und Wochenzielen dieser Challenges
      onCompetitionsChange(competitionIds, fn) {
        if (!competitionIds.length) return () => {};
        let timer = null;
        const ping = () => { clearTimeout(timer); timer = setTimeout(fn, 250); };
        const filter = `competition_id=in.(${competitionIds.join(',')})`;
        const channel = client.channel(`pt-dash-${Math.random().toString(36).slice(2, 8)}`);
        for (const table of ['sets', 'weekly_challenges', 'competition_members']) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, ping);
        }
        channel.subscribe();
        return () => { clearTimeout(timer); client.removeChannel(channel); };
      },

      // Ein Satz für mehrere Wochenziele derselben Übung (eine Zeile pro
      // Challenge, alle mit derselben log_id). Bearbeiten und Löschen wirken
      // auf alle Zeilen (Trigger sync_log_siblings), Rangliste und „Ich“ zählen
      // ihn einmal. targets: [{ challenge_id, competition_id }], die erste ist
      // die Haupt-Challenge. values: { reps } oder { duration_minutes, … }.
      // skip: abgewählte Challenges. Sport läuft über log_set (Rangliste, Push
      // „überholt“), das bei gewerteten Übungen selbst Kopien anlegt; fehlende
      // Ziele (eigene Übungen, Zeit) trägt die App danach mit derselben log_id ein.
      async logEverywhere({ targets, values, note = null, createdAt = null, skip = [] }) {
        const [first] = targets;
        if (!first) throw friendlyError(new Error('invalid_value'));
        const me = uid();
        const clean = note && String(note).trim() ? String(note).trim() : null;
        let row = null;
        if (values.duration_minutes == null) {
          const { data, error } = await client.rpc('log_set', {
            p_challenge: first.challenge_id, p_reps: values.reps, p_note: clean,
            p_created_at: createdAt, p_skip: skip,
          });
          if (!error) row = data;
          else if (!missingRpc(error)) throw friendlyError(error);
        }
        const base = { user_id: me, reps: values.reps ?? null, duration_minutes: values.duration_minutes ?? null,
          note: clean, created_at: row?.created_at || createdAt || new Date().toISOString(), log_id: row?.log_id || newLogId() };
        const rowsFor = (list, withTags) => list.map((t, i) => ({
          ...base, challenge_id: t.challenge_id, competition_id: t.competition_id,
          // Projekt und Tool (Work) nur an der Haupt-Challenge
          ...(withTags && i === 0 ? { project_tag_id: values.project_tag_id ?? null, tool_tag_id: values.tool_tag_id ?? null } : {}),
        }));
        if (!row) {
          // Ohne log_set (Minuten, alte Datenbank): alles in einem Insert
          const inserted = check(await client.from('sets').insert(rowsFor(targets, true)).select());
          return Object.assign(normSet(inserted[0]), { missing: 0 });
        }
        // Der Satz ist gespeichert. Fehlende Kopien nachtragen; scheitert das
        // (z. B. Netz weg), nicht als „nicht gespeichert“ melden, sondern zählen.
        let pending = null;
        try {
          const have = new Set((check(await client.from('sets').select('challenge_id')
            .eq('log_id', row.log_id).eq('user_id', me)) || []).map(r => r.challenge_id));
          pending = targets.filter(t => !have.has(t.challenge_id));
          if (pending.length) check(await client.from('sets').insert(rowsFor(pending, false)).select('id'));
          return Object.assign(normSet(row), { missing: 0 });
        } catch (e) {
          console.warn('logEverywhere: Kopien fehlen', e);
          return Object.assign(normSet(row), { missing: pending ? pending.length : Math.max(0, targets.length - 1) });
        }
      },

      // „Meine Leute“: alle, mit denen ich gerade in einer laufenden Challenge
      // bin (beide aktiv, Challenge nicht archiviert, ohne Freies Training).
      async myPeople() {
        const comps = (await base.listMyCompetitions()).filter(c => !c.archived_at);
        if (!comps.length) return [];
        const rows = check(await client.from('competition_members')
          .select('competition_id, user_id, left_at, profile:user_id(id, display_name, avatar_url, color, ranking_opt_in)')
          .in('competition_id', comps.map(c => c.id)).is('left_at', null)) || [];
        const byId = {};
        for (const r of rows) {
          if (!r.profile) continue;
          const e = byId[r.user_id] ||= { ...r.profile, competitionIds: [] };
          e.competitionIds.push(r.competition_id);
        }
        return Object.values(byId);
      },

      // ── Rangliste ────────────────────────────────────────────────────
      async getRankingSettings() {
        const { data, error } = await client.from('ranking_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw friendlyError(error);
        return data;
      },
      async getRankedCategories() {
        return (check(await client.from('categories').select('*')
          .is('competition_id', null).eq('ranked', true).order('created_at')) || []).map(localizeCategory);
      },
      async rankingMonth(month) {
        return check(await client.rpc('ranking_month', { p_month: month })) || [];
      },
      async rankingTotals({ from = null, to = null } = {}) {
        return check(await client.rpc('ranking_totals', { p_from: from, p_to: to })) || [];
      },
      async rankingProfile(userId) {
        return check(await client.rpc('ranking_profile', { p_user: userId })) || [];
      },
      async seasonChampions() {
        return check(await client.rpc('season_champions')) || [];
      },
      // ── Wochenwertung (Migration weekly_ranking) ─────────────────────
      // Ohne Migration liefern rankingWeek und Co. null, die App bleibt dann
      // bei der Monatswertung.
      async rankingWeek(week) {
        const { data, error } = await client.rpc('ranking_week', { p_week: week });
        if (error) { if (missingRpc(error)) return null; throw friendlyError(error); }
        return data || [];
      },
      async rankingClosedWeeks() {
        const { data, error } = await client.rpc('ranking_closed_weeks');
        if (error) { if (missingRpc(error)) return null; throw friendlyError(error); }
        return (data || []).map(r => r.week);
      },
      async rankingProfileWeeks(userId) {
        const { data, error } = await client.rpc('ranking_profile_weeks', { p_user: userId });
        if (error) { if (missingRpc(error)) return null; throw friendlyError(error); }
        return data || [];
      },
      async closeDueWeeks() {
        const { data } = await client.rpc('close_due_weeks');
        return data || 0;
      },
      // Fällige Monate abschließen (idempotent, läuft sonst per pg_cron)
      async closeDueMonths() {
        const { data } = await client.rpc('close_due_months');
        return data || 0;
      },
      // Wohin ein Satz dieser Übung in dieser Woche geht
      async logTargets(categoryId, weekStart) {
        const { data, error } = await client.rpc('log_targets', { p_category: categoryId, p_week: weekStart });
        if (error) { if (missingRpc(error)) return []; throw friendlyError(error); }
        return data || [];
      },
      // Aus der Rangliste: passende Challenge der Woche, sonst Freies Training
      async logFreeSet({ categoryId, reps, note = null, createdAt = null }) {
        return normSet(check(await client.rpc('log_free_set', {
          p_category: categoryId, p_reps: reps, p_note: note, p_created_at: createdAt,
        })));
      },
      async setRankingOptIn(on) {
        return base.updateProfile({ ranking_opt_in: !!on });
      },
      async reportRankingEntry({ userId, reason, categoryId = null, month = null }) {
        check(await client.rpc('report_ranking_entry', { p_user: userId, p_reason: reason, p_category: categoryId, p_month: month }));
      },
      async setBlock(userId, blocked) {
        check(await client.rpc('set_block', { p_user: userId, p_blocked: !!blocked }));
      },
      async myBlocks() {
        return check(await client.rpc('my_blocks')) || [];
      },
      async isRankingAdmin() {
        const { data, error } = await client.rpc('is_ranking_admin');
        return !error && !!data;
      },
      async rankingReportsOpen() {
        return check(await client.rpc('ranking_reports_open')) || [];
      },
      async resolveRankingReports({ userId, reason, categoryId = null, month = null, resolution }) {
        check(await client.rpc('resolve_ranking_reports', {
          p_user: userId, p_reason: reason, p_category: categoryId, p_month: month, p_resolution: resolution,
        }));
      },

      // ── Konto löschen ────────────────────────────────────────────────
      async deleteMyAccount() { return base.deleteAccount(); },

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
        // reactions hat keine competition_id: nur neue Reaktionen, sonst lädt jedes
        // Entfernen irgendwo (DELETE kommt ohne RLS bei allen an) alle Apps neu.
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, emit)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'competitions', filter: `id=eq.${cid}` }, emit)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, emit)
        .subscribe();
    }

    // Anzahl Sätze eines Wochenziels (alle Mitglieder; RLS zeigt Mitgliedern alle).
    async function countSets(challengeId) {
      const { count, error } = await client.from('sets')
        .select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId);
      if (error) throw friendlyError(error);
      return count || 0;
    }

    async function ensureClosures(rows) {
      if (!rows.length) return;
      const { data: existing } = await client.from('week_closures').select('week_start').eq('competition_id', cid);
      const have = new Set((existing || []).map(r => r.week_start));
      const missing = rows.filter(r => !have.has(r.week_start));
      if (missing.length) check(await client.from('week_closures').insert(missing.map(row => ({ ...row, workout_targets_version: 2 }))));
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
      // kind: 'time' (Minuten) oder Sport; Work gibt es nicht mehr (Sport-Launch)
      async addCategory(name, emoji='💪', kind='sports') {
        const data = check(await client.from('categories')
          .insert({ name, emoji, kind: kind === 'time' ? 'time' : 'sports', competition_id: cid, created_by: uid() }).select().single());
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
          ...(payload.target_runs == null ? {} : { target_runs: workoutTargetRuns(payload) }),
        };
        if (payload.id) {
          // Übung wechseln, obwohl schon Sätze geloggt sind, würde aus 100 Liegestützen
          // stillschweigend 100 Klimmzüge machen. Die Zielmenge bleibt änderbar.
          if (row.category_id != null) {
            const current = check(await client.from('weekly_challenges').select('category_id').eq('id', payload.id).maybeSingle());
            if (current && current.category_id !== row.category_id && await countSets(payload.id) > 0) {
              throw appError('category_locked');
            }
          }
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
      // sets.challenge_id hängt per on delete cascade am Wochenziel: Löschen nähme die
      // Sätze aller Mitglieder mit (die Kaskade umgeht RLS). Mit Sätzen daher abbrechen.
      async deleteChallenge(id) {
        if (await countSets(id) > 0) throw appError('has_sets');
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
      // Sport-Sätze laufen über log_set: bei gewerteten Übungen zählt der Satz
      // in allen Challenges mit derselben Übung dieser Woche (außer skip).
      // Work-Sätze (Minuten, Tags) gehen wie bisher direkt in die Tabelle.
      async addSet({ athlete, skip, ...payload }) {
        if (payload.duration_minutes == null) {
          const { data, error } = await client.rpc('log_set', {
            p_challenge: payload.challenge_id, p_reps: payload.reps, p_note: payload.note ?? null,
            p_created_at: payload.created_at ?? null, p_skip: skip || [],
          });
          if (!error) { emit(); return normSet(data); }
          if (!missingRpc(error)) throw friendlyError(error);
        }
        const data = check(await client.from('sets')
          .insert({ ...payload, user_id: uid(), competition_id: cid }).select().single());
        emit();
        return normSet(data);
      },
      async updateSet(id, patch) {
        const { athlete, ...rest } = patch;
        const data = check(await client.from('sets').update(rest).eq('id', id).select().single());
        // Kopien in anderen Challenges (gleiche log_id) mitziehen. Wiederholungen,
        // Datum und Notiz macht auch der Trigger sync_log_siblings, Minuten nicht.
        const shared = {};
        for (const k of ['reps', 'duration_minutes', 'created_at', 'note']) if (k in rest) shared[k] = rest[k];
        if (data?.log_id && Object.keys(shared).length) {
          await client.from('sets').update(shared).eq('log_id', data.log_id).eq('user_id', data.user_id).neq('id', id);
        }
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
      // Andere eigene Challenges, in denen ein Satz dieser Übung mitzählt
      async logTargets(categoryId, weekStart) {
        const { data, error } = await client.rpc('log_targets', { p_category: categoryId, p_week: weekStart });
        if (error) { if (missingRpc(error)) return []; throw friendlyError(error); }
        return data || [];
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
          target_runs: workoutTargetRuns(payload),
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
        const sports = sportsOnlyBundle({ categories: cats, challenges: chs, sets: wkSets });
        annotateWorkouts(sports.sets, sports.challenges, sports.categories);
        const participants = participantsFor(members, weekStart);
        const pens = [];
        for (const m of participants) {
          pens.push(...computePenalties(sports.challenges, sports.sets, m.user_id, cfg, participants.length));
        }
        return { penalties: pens, cfg };
      },
      async closeWeek(weekStart) {
        const { error: clErr } = await client.from('week_closures')
          .insert({ week_start: weekStart, competition_id: cid, closed_by_user: uid(), workout_targets_version: 2 });
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
        target_runs: workoutTargetRuns(s),
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
      target_runs: t.target_runs,
      slot_id: t.slot_id,
      week_in_cycle: t.week_in_cycle,
    }));
  }

  // ── Gerätedaten nach dem Löschen des Kontos ─────────────────────────
  // Alle Schlüssel mit pt: und pt_ (Einladung, Onboarding-Stand, aktive Challenge,
  // Push-Token, Timer, „Willkommen zurück“ …) plus die Schnellwerte. Erscheinungsbild
  // und Sprache (pt:lang, i18n.js) gehören zum Gerät und bleiben.
  const KEEP_LOCAL_KEYS = ['pt:theme2', 'pt:lang'];
  const isAppKey = (k) => (/^pt[:_]/.test(k) || k === 'quickSets') && !KEEP_LOCAL_KEYS.includes(k);
  function clearLocalData() {
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        const store = window[name];
        if (!store) continue;
        const keys = [];
        for (let i = 0; i < store.length; i++) keys.push(store.key(i));
        for (const k of keys) if (k && isAppKey(k)) store.removeItem(k);
      } catch (e) {}
    }
  }

  // ── Fehlerprotokoll (optional, Tabelle client_errors) ───────────────
  // Die ErrorBoundary meldet Abstürze über window.PTReportError(err, ctx). Höchstens
  // 5 pro Sitzung, nur mit Anmeldung. Wirft nie: eine fehlende Tabelle
  // (Migration 20261021000100 nicht eingespielt) oder fehlendes Netz bleiben still.
  const REPORT_MAX = 5;
  let reportClient = null;
  let reportCount = 0;
  const clip = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
  function reportError(err, ctx) {
    try {
      const client = reportClient;
      if (!client || reportCount >= REPORT_MAX) return;
      reportCount++;
      let context = ctx;
      if (ctx != null && typeof ctx !== 'string') {
        try { context = ctx.componentStack || JSON.stringify(ctx); } catch (e) { context = String(ctx); }
      }
      const row = {
        message: clip(err?.message || err, 500) || 'Unbekannt', // i18n-ignore: Protokoll, nicht sichtbar
        stack: clip(err?.stack, 4000),
        context: clip(context, 1000),
        url: clip(typeof location !== 'undefined' ? location.pathname : null, 300),
        user_agent: clip(typeof navigator !== 'undefined' ? navigator.userAgent : null, 300),
      };
      Promise.resolve()
        .then(async () => {
          const { data } = await client.auth.getSession();
          if (!data?.session) return;
          await client.from('client_errors').insert(row);
        })
        .catch(() => {});
    } catch (e) {}
  }
  window.PTReportError = reportError;

  window.PTData = {
    init({ url, key }) {
      if (!url || !key || !window.supabase) return null;
      const client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: sessionStorageAdapter },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      reportClient = client;
      return createAPI(client);
    },
    mondayOf, isoDate, addDays, suggestForWeek, weekTemplateFor, computePenalties, fairShareOf, participantsFor,
    isWorkoutType, annotateWorkouts, setValue, workoutValueLabel, noteText, workoutSummary,
    workoutTargetRuns, workoutRunCount, workoutProgress, workoutPeopleDone,
    friendlyError, appError, clearLocalData, localizeCategory, sportsOnlyBundle, usesMinutes, exerciseKey, newLogId,
  };
})();
