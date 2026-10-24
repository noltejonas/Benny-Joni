// Projekt Terminator — Onboarding-Modell (ohne React)
//
// Entscheidet aus echten Daten (Profil, Mitgliedschaften, Wochenziele, Sätze),
// was eine neue Person als Nächstes sieht. Die Screens in onboarding.jsx und
// onboarding-intro.jsx lesen nur hieraus; Tests: tests/onboarding.test.cjs.

(function () {
  // Alphabet von gen_invite_code (ohne 0/O/1/I). Getippte Codes prüft der
  // Server; hier zählt nur die Form, damit kein gültiger Code abgelehnt wird.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SCHEME = 'projektterminator';

  // ── Codes und Links ─────────────────────────────────────────────────
  function cleanCode(raw) {
    const c = String(raw || '').toUpperCase();
    return /^[A-Z0-9]{6}$/.test(c) ? c : null;
  }

  // Einladungslinks: projektterminator://join/ABC123, …://join?code=ABC123,
  // im Browser ?join=ABC123 bzw. #join=ABC123.
  function parseInviteUrl(url) {
    const s = String(url || '');
    if (!s) return null;
    const scheme = s.match(new RegExp(`${SCHEME}://join(?:/([A-Za-z0-9]+)|\\?(?:[^#]*&)?code=([A-Za-z0-9]+))`, 'i'));
    if (scheme) return cleanCode(scheme[1] || scheme[2]);
    const web = s.match(/[?&#]join=([A-Za-z0-9]+)/i);
    if (web) return cleanCode(web[1]);
    return null;
  }

  // Code aus Eingabe, eingefügter Nachricht oder Link. Freitext nur über Link
  // oder „Code:“ — Wörter wie „BATTLE“ sehen sonst wie ein Code aus.
  function normalizeCode(input) {
    if (input == null) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    const fromLink = parseInviteUrl(raw);
    if (fromLink) return fromLink;
    const compact = raw.replace(/[\s-]/g, '');
    if (compact.length === 6) return cleanCode(compact);
    // Strengstes Etikett zuerst: die eigene Zeile „Code: ABC234“ aus inviteText,
    // dann „Code:“ irgendwo, zuletzt „Code ABC234“. Sonst gewinnt ein
    // Challenge-Name wie „Code Sprint“, der vor der Code-Zeile steht.
    const LABELS = [
      /^\s*code\s*[:=]\s*([A-Za-z0-9]{6})\s*$/im,
      /code\s*[:=]\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/i,
      /code\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/i,
    ];
    for (const re of LABELS) {
      const m = raw.match(re);
      if (m) return cleanCode(m[1]);
    }
    return null;
  }

  function inviteLink(code) {
    return `${SCHEME}://join/${String(code || '').toUpperCase()}`;
  }

  // In der Sprache des Absenders. Die Zeile „Code: …“ bleibt in jeder Sprache
  // gleich, weil normalizeCode den Code ohne Link nur über dieses Etikett findet.
  function inviteText(competition) {
    const code = String(competition.invite_code || '').toUpperCase();
    return tr('Komm in meine Challenge „{name}“ bei Projekt Terminator 💪', { name: competition.name }) + '\n'
      + `Code: ${code}\n`
      + tr('Direkt öffnen: {link}', { link: inviteLink(code) });
  }

  // ── Einstieg ────────────────────────────────────────────────────────
  const DAY = 86400000;
  const NEWCOMER_DAYS = 14;   // so lange gilt ein frisches Profil als neu
  const STARTED_DAYS = 30;    // so lange nach Beginn des neuen Onboardings

  function youngProfile(profile, now = Date.now()) {
    const created = Date.parse(profile?.created_at);
    return Number.isFinite(created) && now - created < NEWCOMER_DAYS * DAY;
  }

  // Welcher Bildschirm vor der App? Aus Session, Profil, Challenges, offener
  // Einladung und dem Onboarding-Stand (state, s. mergeState). Den
  // Profilschritt sehen nur junge Konten; wer schon länger dabei ist (z. B.
  // alle Challenges verlassen oder nur archivierte), landet direkt beim Start.
  function entryRoute({ session, profile, competitions, invite, state, now = Date.now() } = {}) {
    if (session === undefined) return 'loading';
    if (!session) return 'welcome';
    if (!profile || !competitions) return 'loading';
    if (competitions.some(c => !c.archived_at)) return 'app';
    if (!competitions.length && !state?.profileDone && youngProfile(profile, now)) return 'profile';
    return invite ? 'join' : 'start';
  }

  // Neue Begleitung (Startkarte, Tipps, Feiern) nur für Konten, deren Profil
  // jünger als 14 Tage ist oder die das neue Onboarding vor höchstens 30 Tagen
  // begonnen haben.
  function isNewcomer({ state, profile, now = Date.now() } = {}) {
    const started = Date.parse(state?.started);
    if (Number.isFinite(started) && now - started < STARTED_DAYS * DAY) return true;
    return youngProfile(profile, now);
  }

  // Neue Person ohne Challenge und ohne Einladung: statt „Wie startest du?“
  // gleich ein Duell anlegen. Nur solange das Konto nie in einer Challenge war
  // (state.firstChallenge, auch keine archivierte), sonst entstünde nach dem
  // Verlassen sofort die nächste.
  function autoDuelDue({ route, newcomer, competitions, state } = {}) {
    return route === 'start' && !!newcomer && !!competitions && !competitions.length && !state?.firstChallenge;
  }

  // Ebenen nach dem Erstellen bzw. Beitreten (intro: 'created' | 'joined').
  // Neue Leute: erst die Übungen, dann Einladen, dann der erste Satz; den gibt
  // es einmal pro Konto (firstLog = Zeitpunkt der ersten Feier, obState.firstLog).
  function introKinds({ intro, newcomer, firstLog } = {}) {
    if (!intro) return [];
    const log = firstLog ? [] : ['log'];
    if (intro === 'created') return newcomer ? ['goal', 'invite', ...log] : ['invite'];
    return newcomer ? ['goal', ...log] : [];
  }

  // „lenn.hoffmann@…“ → „Lenn“. Leer, wenn nichts Sinnvolles herauskommt.
  function suggestName(email) {
    const local = String(email || '').split('@')[0];
    const first = local.split(/[._\-+\d]+/).find(Boolean) || '';
    if (first.length < 2) return '';
    return (first[0].toUpperCase() + first.slice(1).toLowerCase()).slice(0, 30);
  }

  // ── E-Mail prüfen (nur Text, keine Bestätigungsmail) ────────────────
  // Form der Adresse plus Tippfehler bei großen Anbietern, damit sich niemand
  // mit „gmial.com“ registriert und später keine Mail zum Passwort bekommt.
  const MAIL_DOMAINS = [
    'gmail.com', 'googlemail.com', 'icloud.com', 'me.com', 'mac.com',
    'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com',
    'yahoo.com', 'yahoo.de', 'aol.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com',
    'web.de', 't-online.de', 'freenet.de', 'posteo.de', 'mailbox.org', 'mail.de', 'mail.com',
    'arcor.de', 'vodafone.de', 'bluewin.ch', 'proton.me', 'protonmail.com',
  ];
  // Anbieter mit genau einer Adresse: „gmail.de“ gibt es nicht.
  const MAIL_ONLY = { gmail: 'gmail.com', googlemail: 'googlemail.com', icloud: 'icloud.com', web: 'web.de', 't-online': 't-online.de' };
  // Endungen, die es nicht gibt, aber oft getippt werden.
  const TLD_FIX = {
    con: 'com', cmo: 'com', cpm: 'com', ocm: 'com', vom: 'com', xom: 'com', cim: 'com', comm: 'com', coom: 'com', conm: 'com',
    ed: 'de', dee: 'de', nte: 'net', nett: 'net', ner: 'net', ogr: 'org', orgg: 'org',
  };
  const LABEL_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
  const TLD_RE = /^(?:\p{L}{2,}|xn--[a-z0-9-]+)$/u;

  // Tippabstand mit Vertauschung als einem Fehler („gmial“ ↔ „gmail“ = 1).
  function typoDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function closestMailDomain(domain) {
    let best = null, bestDist = Infinity;
    for (const d of MAIL_DOMAINS) {
      const dist = typoDistance(domain, d);
      if (dist < bestDist) { best = d; bestDist = dist; }
    }
    return bestDist <= (domain.length > 7 ? 2 : 1) ? best : null;
  }

  // → { ok, suggestion }. `ok`: Form stimmt. `suggestion`: vermutlich gemeinte
  // Adresse („max@gmail.com“), auch bei ok = false („max@gmail“).
  function checkEmail(input) {
    const raw = String(input || '').trim();
    const at = raw.lastIndexOf('@');
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1).toLowerCase().replace(/\.$/, '');
    if (at < 1 || /[\s@]/.test(local) || /\s/.test(domain) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return { ok: false, suggestion: null };
    }
    const labels = domain.split('.');
    if (labels.length === 1) {
      const only = MAIL_ONLY[domain] || (domain && closestMailDomain(`${domain}.com`));
      return { ok: false, suggestion: only ? `${local}@${only}` : null };
    }
    const tld = labels[labels.length - 1];
    if (!labels.every(l => LABEL_RE.test(l)) || !TLD_RE.test(tld)) return { ok: false, suggestion: null };
    const name = labels.slice(0, -1).join('.');
    const fixed = TLD_FIX[tld] ? `${name}.${TLD_FIX[tld]}` : domain;
    let target = fixed;
    if (!MAIL_DOMAINS.includes(fixed)) target = MAIL_ONLY[name] || closestMailDomain(fixed) || fixed;
    // Endungen aus TLD_FIX gibt es nicht — dort kommt nie eine Mail an.
    return { ok: !TLD_FIX[tld], suggestion: target !== domain ? `${local}@${target}` : null };
  }

  // Stand auf dem Gerät (localStorage) und im Profil (profiles.onboarding)
  // zusammenführen: Zeitstempel bleiben, Maps werden vereint.
  function mergeState(local, remote) {
    const a = local || {}, b = remote || {};
    const out = {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const x = a[key], y = b[key];
      const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
      out[key] = isMap(x) || isMap(y) ? { ...(isMap(y) ? y : {}), ...(isMap(x) ? x : {}) } : (x || y);
    }
    return out;
  }

  function stateKey(userId) {
    return `pt:onboarding:${userId}`;
  }

  // ── Woche ───────────────────────────────────────────────────────────
  const D = () => window.PTData;
  const localIso = (ts) => D().isoDate(new Date(ts));
  const mondayIso = (ts) => D().isoDate(D().mondayOf(new Date(ts)));

  // Mo = 1 … So = 7; Resttage zählen heute mit.
  function weekProgress(now = Date.now()) {
    const dow = new Date(now).getDay();
    const dayIndex = dow === 0 ? 7 : dow;
    return { dayIndex, daysLeft: 8 - dayIndex };
  }

  function joinedMidWeek({ joinedAt, now = Date.now() }) {
    const t = Date.parse(joinedAt);
    if (!Number.isFinite(t)) return false;
    return mondayIso(t) === mondayIso(now) && weekProgress(t).dayIndex > 1;
  }

  // ── Wochenziel ──────────────────────────────────────────────────────
  // Gespeichert wird die Gruppensumme (target_reps), gefragt wird pro Person.
  // Solange Plätze frei sind, rechnet die App mit der vollen Besetzung.
  function expectedPeople(mode, activeCount = 0) {
    const full = mode === '1v1' ? 2 : mode === '2v2' ? 4 : 2;
    return Math.max(activeCount || 0, full);
  }

  const GOAL_BASE = [
    [/liegest|push/i, 100], [/klimmz|pull/i, 30], [/dips/i, 50], [/leg ?raise|beinheb/i, 50],
    [/hspu|handstand/i, 20], [/sit-?up|crunch/i, 100], [/squat|kniebeu/i, 100],
  ];
  const round5 = (v) => Math.round(v / 5) * 5;

  // Vorschlag pro Person bis Sonntag; unter der Woche anteilig gekürzt.
  function goalDefault(category, now = Date.now()) {
    const base = (GOAL_BASE.find(([re]) => re.test(category?.name || '')) || [null, 50])[1];
    return Math.max(10, round5(base * weekProgress(now).daysLeft / 7));
  }

  function goalChoices(def) {
    const vals = [def / 2, def, def * 1.5, def * 2].map(v => Math.max(5, round5(v)));
    return [...new Set(vals)];
  }

  function goalTarget(perPerson, people) {
    return Math.max(1, Math.round(perPerson) * Math.max(1, people));
  }

  // ── Startkarte ──────────────────────────────────────────────────────
  // Punkte erledigen sich aus den Daten. Push erscheint nur, solange iOS
  // fragen darf oder es schon erlaubt ist.
  function starterItems({ activeMembers = 0, weekGoals = 0, mySets = 0, push = 'unsupported' }) {
    const items = [
      { id: 'invite', done: activeMembers >= 2 },
      { id: 'goal', done: weekGoals > 0 },
      { id: 'log', done: mySets > 0 },
    ];
    if (push === 'prompt' || push === 'granted') items.push({ id: 'push', done: push === 'granted' });
    return items;
  }

  function showStarter({ newcomer, items, dismissedAt, joinedAt, now = Date.now() }) {
    if (!newcomer || dismissedAt || !items?.some(i => !i.done)) return false;
    const joined = Date.parse(joinedAt);
    return !Number.isFinite(joined) || now - joined < NEWCOMER_DAYS * DAY;
  }

  // ── Push-Vorab ──────────────────────────────────────────────────────
  // permission: 'prompt' | 'granted' | 'denied' | 'unsupported'.
  // primer: { asks, lastAt, result } (pt:push-primer, pro Gerät).
  function pushPrimerDue({ permission, enabled = true, primer = {}, now = Date.now(), manual = false }) {
    if (permission !== 'prompt') return false;
    if (manual) return true;
    if (!enabled) return false;
    const asks = primer.asks || 0;
    if (asks >= 3) return false;
    if (!primer.lastAt) return true;
    return now - primer.lastAt >= (asks <= 1 ? 3 : 7) * DAY;
  }

  function nextPrimerState(primer, outcome, now = Date.now()) {
    const next = { asks: (primer?.asks || 0) + 1, lastAt: now };
    if (outcome === 'granted' || outcome === 'denied') next.result = outcome;
    return next;
  }

  // ── Woche 1 ─────────────────────────────────────────────────────────
  // Rückblick beim ersten Öffnen in der zweiten Woche der Mitgliedschaft.
  // Liefert den Montag der ersten Woche oder null.
  function weekOneDue({ joinedAt, startDate, now = Date.now(), seen }) {
    const joined = Date.parse(joinedAt);
    if (!Number.isFinite(joined)) return null;
    const joinedIso = localIso(joined);
    const begin = startDate && startDate > joinedIso ? startDate : joinedIso;
    const first = mondayIso(new Date(begin + 'T00:00:00'));
    if (D().addDays(first, 7) !== mondayIso(now)) return null;
    return seen === first ? null : first;
  }

  function weekOneSummary({ weekStart, me, sides = [], sets = [], challenges = [], categories = [], participantCount = 1 }) {
    const catById = Object.fromEntries(categories.map(c => [c.id, c]));
    const week = challenges.filter(ch => ch.week_start === weekStart);
    const kindOf = (ch) => {
      const cat = catById[ch.category_id];
      if (D().isWorkoutType(cat?.challenge_type)) return 'workout';
      return D().usesMinutes(cat) ? 'work' : 'reps'; // Minuten: Zeit und Work
    };
    const kinds = Object.fromEntries(week.map(ch => [ch.id, kindOf(ch)]));
    const weekSets = sets.filter(s => kinds[s.challenge_id]);
    const mine = weekSets.filter(s => s.athlete === me);
    const sum = (list, key) => list.reduce((a, s) => a + (s[key] || 0), 0);

    const myReps = sum(mine.filter(s => kinds[s.challenge_id] === 'reps'), 'reps');
    const myMinutes = sum(mine.filter(s => kinds[s.challenge_id] === 'work'), 'duration_minutes');
    const activeDays = new Set(mine.map(s => localIso(s.created_at))).size;

    let sharesHit = 0;
    for (const ch of week) {
      const own = mine.filter(s => s.challenge_id === ch.id);
      if (kinds[ch.id] === 'workout') { if (own.length) sharesHit++; continue; }
      const done = sum(own, kinds[ch.id] === 'work' ? 'duration_minutes' : 'reps');
      if (done >= D().fairShareOf(ch.target_reps, participantCount)) sharesHit++;
    }

    let result = 'solo', leader = null, diff = 0;
    if (sides.length >= 2) {
      const repSets = weekSets.filter(s => kinds[s.challenge_id] === 'reps');
      const totals = sides.map(side => {
        const ids = side.statUserIds || side.userIds || [];
        return sum(repSets.filter(s => ids.includes(s.athlete)), 'reps');
      });
      const mineIdx = Math.max(0, sides.findIndex(s => s.isMine));
      const best = Math.max(...totals);
      const others = totals.filter((_, i) => i !== mineIdx);
      const bestOther = Math.max(...others);
      if (totals[mineIdx] > bestOther) { result = 'won'; diff = totals[mineIdx] - bestOther; }
      else if (totals[mineIdx] === best) { result = 'tie'; }
      else {
        result = 'lost';
        const leaderIdx = totals.findIndex((t, i) => i !== mineIdx && t === best);
        leader = sides[leaderIdx].label;
        diff = best - totals[mineIdx];
      }
    }
    return { myReps, myMinutes, activeDays, sharesHit, sharesTotal: week.length, result, leader, diff };
  }

  // ── Benny und Joni als Figuren ──────────────────────────────────────
  // Bilder und Maße pro Pose kommen aus www/figures/manifest.js
  // (tools/cut-figures.py): Bildgröße, Fußmitte `axis`, Kappe `top`, Boden
  // `ground` in Pixeln. figureLayout skaliert jede Pose so, dass der Körper
  // von Kappe bis Sohle zur echten Größe passt, egal wie weit die Kamera beim
  // Erzeugen weg war. `tall` ist Bennys Körperhöhe in CSS-Pixeln.
  const FIGURES = {
    benny: { name: 'Benny', cm: 190 }, // i18n-ignore: Name der Figur
    joni: { name: 'Joni', cm: 170 }, // i18n-ignore: Name der Figur
  };

  function figureLayout(meta, who, tall) {
    const f = FIGURES[who];
    if (!meta || !f || !(meta.ground > meta.top)) return null;
    const body = tall * f.cm / FIGURES.benny.cm;
    const k = body / (meta.ground - meta.top);
    return {
      body,
      width: meta.w * k,
      height: meta.h * k,
      left: -meta.axis * k,                  // links von der Fußmitte
      bottom: -(meta.h - meta.ground) * k,   // unter der Bodenlinie
    };
  }

  window.PTOnboarding = {
    ALPHABET, SCHEME, DAY,
    normalizeCode, parseInviteUrl, inviteLink, inviteText,
    entryRoute, isNewcomer, youngProfile, autoDuelDue, introKinds, suggestName, checkEmail, mergeState, stateKey,
    weekProgress, joinedMidWeek,
    expectedPeople, goalDefault, goalChoices, goalTarget,
    starterItems, showStarter,
    pushPrimerDue, nextPrimerState,
    weekOneDue, weekOneSummary,
    FIGURES, figureLayout,
  };
})();
