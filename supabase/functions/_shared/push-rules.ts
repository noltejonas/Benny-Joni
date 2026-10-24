// Push-Regeln für notify-set und daily-nudge.
//
// Reine Funktionen ohne Deno- oder Supabase-Importe: Node testet sie direkt
// (tests/push-rules.test.mjs per Typ-Stripping), die Edge Functions importieren
// sie über ../_shared/push-rules.ts. Deshalb nur „löschbare“ TypeScript-Syntax
// (keine enums, keine namespaces).
//
// Alle Uhrzeiten gelten in Europe/Berlin. pg_cron und die Edge Functions laufen
// in UTC, die Zeitumstellung (z. B. 25.10.2026) erledigt Intl.DateTimeFormat.

// ── Stellschrauben (Entscheidung „Push-Regeln“, morgens zu bestätigen) ────────
export const TIME_ZONE = "Europe/Berlin";
// Rivalen-Push ab so vielen Wiederholungen am Tag. Env RIVAL_THRESHOLD überschreibt.
export const RIVAL_THRESHOLD_DEFAULT = 10;
// Ruhezeit: ab 22 Uhr bis 7 Uhr keine Mitteilungen.
export const QUIET_HOURS = { start: 22, end: 7 };
// Tageserinnerung Mo–Sa um 19 Uhr, „Letzte Chance“ sonntags um 18 Uhr.
export const DAILY_NUDGE_HOUR = 19;
export const LAST_CALL_HOUR = 18;
// Höchstens so viele Erinnerungen pro Nutzer und Lauf, über alle Challenges.
export const MAX_NUDGES_PER_USER_PER_RUN = 1;
// Beitritt und Reaktion lösen nur frisch einen Push aus (schützt vor nachgespielten Aufrufen).
export const SOCIAL_MAX_AGE_MINUTES = 15;

// Werte für push_log.kind. Höchstens eine Mitteilung pro Nutzer, Challenge,
// Art und Tag; push_log.ref grenzt feiner ein (Überholen: je Übung, Reaktion:
// je reagierender Person, 100 %: je Person, die fertig ist).
// Migration 20261024150000_push_events.sql.
export const PUSH_KIND = {
  rival: "rival",
  daily: "daily",
  lastCall: "last_call",
  join: "join",
  reaction: "reaction",
  overtake: "overtake",
  goal: "goal",
} as const;
export type PushKind = typeof PUSH_KIND[keyof typeof PUSH_KIND];
export type NudgeKind = "daily" | "last_call";

// Pflicht-Workouts zählen nicht als Wiederholungen (wie user_reps_today,
// Migration 20261004000000_workout_reps_today.sql).
export const WORKOUT_TYPES = ["bring_sally_up", "tom_holland"];

export interface Alert {
  title: string;
  subtitle?: string;
  body: string;
}

// ── Zeit ─────────────────────────────────────────────────────────────────────
export interface BerlinTime {
  date: string; // YYYY-MM-DD
  hour: number; // 0–23
  weekday: number; // 1 = Montag … 7 = Sonntag
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
let berlinFormat: Intl.DateTimeFormat | null = null;

export function berlinTime(at: Date | string | number = new Date()): BerlinTime {
  berlinFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of berlinFormat.formatToParts(at instanceof Date ? at : new Date(at))) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    weekday: WEEKDAYS[parts.weekday],
  };
}

export function berlinHour(at: Date | string | number = new Date()): number {
  return berlinTime(at).hour;
}

export function berlinDate(at: Date | string | number = new Date()): string {
  return berlinTime(at).date;
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Montag der laufenden Woche in Berlin (= weekly_challenges.week_start).
export function berlinWeekStart(at: Date | string | number = new Date()): string {
  const t = berlinTime(at);
  return addDays(t.date, 1 - t.weekday);
}

export function hourIsQuiet(hour: number, quiet: { start: number; end: number } | null = QUIET_HOURS): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  return quiet.start > quiet.end
    ? hour >= quiet.start || hour < quiet.end
    : hour >= quiet.start && hour < quiet.end;
}

export function isQuietHour(at: Date | string | number = new Date(), quiet = QUIET_HOURS): boolean {
  return hourIsQuiet(berlinHour(at), quiet);
}

// Welche Erinnerung ist zu dieser Berliner Stunde dran? Sonntags nur die
// „Letzte Chance“, an den anderen Tagen nur die Tageserinnerung.
export function nudgeKindFor(weekday: number, hour: number): NudgeKind | null {
  if (weekday === 7) return hour === LAST_CALL_HOUR ? "last_call" : null;
  return hour === DAILY_NUDGE_HOUR ? "daily" : null;
}

// ── Env ──────────────────────────────────────────────────────────────────────
export function thresholdFromEnv(raw: string | null | undefined, fallback = RIVAL_THRESHOLD_DEFAULT): number {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const n = Number(text);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

// „true/1/yes/on“ bzw. „false/0/no/off“; alles andere ergibt den Standard.
export function flagFromEnv(raw: string | null | undefined, fallback: boolean): boolean {
  const text = String(raw ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
}

// Ab der Schwelle (einschließlich): „Rivalen-Push ab 10 Wiederholungen am Tag“.
export function rivalReached(senderToday: number | null | undefined, threshold: number): boolean {
  return (senderToday ?? 0) >= threshold;
}

// Überholen: Wer lag vor diesem Eintrag gleichauf oder vorn und liegt jetzt
// dahinter? Seiten bei 0 zählen nicht (das wäre nur der erste Satz der Woche).
export function overtakenSides<T extends { value: number }>(before: number, after: number, sides: T[]): T[] {
  return sides.filter((s) => s.value > 0 && before <= s.value && after > s.value);
}

export interface GoalProgress {
  share: number; // Anteil der Person am Wochenziel (Pflicht-Workout: 1)
  value: number; // Stand nach diesem Eintrag
  added: number; // Beitrag dieses Eintrags
}

// 100 %: alle Wochenziele der Challenge erreicht, und erst durch diesen Eintrag.
export function completesAll(goals: GoalProgress[]): boolean {
  return goals.length > 0 &&
    goals.every((g) => g.value >= g.share) &&
    goals.some((g) => g.value - g.added < g.share);
}

export function isFresh(createdAt: string | null | undefined, now: Date = new Date(), maxMinutes = SOCIAL_MAX_AGE_MINUTES): boolean {
  const t = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= -60_000 && age <= maxMinutes * 60_000;
}

// ── Anteil (SHARE_BASIS) ─────────────────────────────────────────────────────
// Wie in der App: Mit den tatsächlichen Teilnehmern, sobald mindestens 2 aktiv
// sind, sonst mit der erwarteten Besetzung (www/onboarding-model.js expectedPeople).
export function expectedPeople(mode: string, activeCount = 0): number {
  const full = mode === "1v1" ? 2 : mode === "2v2" ? 4 : 2;
  return Math.max(activeCount || 0, full);
}

export function sharePeople(mode: string, participantCount: number): number {
  return participantCount >= 2 ? participantCount : expectedPeople(mode, participantCount);
}

export function fairShareOf(targetReps: number, people: number): number {
  return Math.ceil(targetReps / Math.max(1, people));
}

export interface MemberLike {
  user_id: string;
  team?: string | null;
  left_at?: string | null;
}

export interface MemberRow extends MemberLike {
  competition_id: string;
  joined_at?: string | null;
  display_name?: string | null;
  main_competition_id?: string | null;
  language?: string | null; // profiles.language, bestimmt die Sprache der Erinnerung
}

// Wie PTData.participantsFor: wer bis Sonntag beigetreten und nicht vor Montag
// ausgetreten ist. Ohne Treffer zählen die aktiven Mitglieder.
export function participantsFor<T extends MemberLike & { joined_at?: string | null }>(members: T[], weekStart: string): T[] {
  if (!members?.length) return [];
  const weekEnd = addDays(weekStart, 6);
  const active = members.filter((m) => {
    const joined = m.joined_at ? berlinDate(m.joined_at) : "0000-00-00";
    const left = m.left_at ? berlinDate(m.left_at) : null;
    return joined <= weekEnd && (!left || left >= weekStart);
  });
  return active.length ? active : members.filter((m) => !m.left_at);
}

// Gegner: alle anderen aktiven Mitglieder, bei 2v2 nur das andere Team.
export function opponentsOf<T extends MemberLike>(members: T[], userId: string, mode: string): T[] {
  const me = members.find((m) => m.user_id === userId);
  return members.filter((m) =>
    !m.left_at &&
    m.user_id !== userId &&
    !(mode === "2v2" && me?.team && m.team === me.team)
  );
}

export interface GoalCategory {
  name?: string | null;
  competition_id?: string | null; // leer = Standard-Übung (Name wird übersetzt)
  emoji?: string | null;
  kind?: string | null;
  challenge_type?: string | null;
}

export interface GoalRow {
  id: string;
  competition_id: string;
  target_reps: number | null;
  category: GoalCategory | null;
}

// Nur normale Sport-Ziele zählen für Erinnerungen: keine Pflicht-Workouts
// (Durchgänge statt Wiederholungen), keine Arbeitszeit (Minuten).
export function isRepGoal(goal: GoalRow): boolean {
  const c = goal.category;
  return (c?.kind || "sports") === "sports" &&
    (c?.challenge_type || "standard") === "standard" &&
    (goal.target_reps ?? 0) > 0;
}

// ── Sprache der Empfänger ────────────────────────────────────────────────────
// Die App meldet ihre Sprache in profiles.language (Migration
// 20261021000000_profile_language.sql, Codes wie in www/i18n.js). Ohne Eintrag,
// ohne Spalte oder bei einer Sprache ohne Push-Texte: Deutsch wie bisher.
// Neue Sprache: Eintrag in PUSH_TEXT (und STANDARD_CATEGORY_NAMES) ergänzen.
export type PushLang = "de" | "en";
export const PUSH_LANG_DEFAULT: PushLang = "de";

export function pushLang(raw: string | null | undefined): PushLang {
  const code = String(raw ?? "").trim().toLowerCase();
  return Object.hasOwn(PUSH_TEXT, code) ? (code as PushLang) : PUSH_LANG_DEFAULT;
}

interface PushTexts {
  someone: string;
  yourChallenge: string;
  yourRival: string;
  reps: string;
  and: string;
  rivalTitle: (name: string) => string;
  rivalBody: (n: number) => string;
  dailyTitle: (comp: string) => string;
  dailyBody: (rival: string, n: number) => string;
  dailyBodyFirst: string;
  lastCallTitle: (comp: string) => string;
  lastCallBody: (list: string) => string;
  joinTitle: (name: string) => string;
  joinBodyDuel: string;
  joinBodyGroup: string;
  reactionAmount: (who: string, amount: number, unit: string) => string;
  reactionSet: (who: string) => string;
  overtakeTitle: (name: string) => string;
  overtakeTeamTitle: (name: string) => string;
  overtakeBody: (unit: string, theirs: number, mine: number) => string;
  overtakeTeamBody: (unit: string, theirs: number, ours: number) => string;
  goalTitle: (name: string) => string;
  goalBody: string;
}

// Gleiche Wortwahl wie in der App (www/i18n/en.js: British English, typografischer
// Apostroph). Namen, Challenge-Namen und eigene Übungen bleiben, wie sie sind.
export const PUSH_TEXT: Record<PushLang, PushTexts> = {
  de: {
    someone: "Jemand",
    yourChallenge: "deine Challenge",
    yourRival: "Dein Rivale",
    reps: "Wiederholungen",
    and: "und",
    rivalTitle: (name) => `🔥 ${name} ist los`,
    rivalBody: (n) => `Schon ${n} Reps heute — du noch bei 0.`,
    dailyTitle: (comp) => `⏰ Heute noch nichts für ${comp}`,
    dailyBody: (rival, n) => `${rival} hat schon ${n} Reps – zieh nach!`,
    dailyBodyFirst: "Ein Satz reicht, um vorzulegen.",
    lastCallTitle: (comp) => `⏳ Letzte Chance für ${comp}`,
    lastCallBody: (list) => `Dir fehlen noch ${list} bis Mitternacht.`,
    joinTitle: (name) => `🎉 ${name} ist dabei`,
    joinBodyDuel: "Das Duell läuft. Leg los!",
    joinBodyGroup: "Die Challenge läuft. Leg los!",
    reactionAmount: (who, amount, unit) => `${who} hat auf deine ${amount} ${unit} reagiert.`,
    reactionSet: (who) => `${who} hat auf deinen Satz reagiert.`,
    overtakeTitle: (name) => `⚡ ${name} hat dich überholt`,
    overtakeTeamTitle: (name) => `⚡ ${name} hat euch überholt`,
    overtakeBody: (unit, theirs, mine) => `${unit}: ${theirs} zu ${mine}. Hol dir die Führung zurück!`,
    overtakeTeamBody: (unit, theirs, ours) => `${unit}: ${theirs} zu ${ours}. Holt euch die Führung zurück!`,
    goalTitle: (name) => `🏁 ${name} hat 100 % geschafft`,
    goalBody: "Alle Wochenziele erledigt. Und du?",
  },
  en: {
    someone: "Someone",
    yourChallenge: "your challenge",
    yourRival: "Your rival",
    reps: "reps",
    and: "and",
    rivalTitle: (name) => `🔥 ${name} is on a roll`,
    rivalBody: (n) => `Already ${n} ${n === 1 ? "rep" : "reps"} today — you’re still at 0.`,
    dailyTitle: (comp) => `⏰ Nothing yet today for ${comp}`,
    dailyBody: (rival, n) => `${rival} already has ${n} ${n === 1 ? "rep" : "reps"} – time to catch up!`,
    dailyBodyFirst: "One set is all it takes to get ahead.",
    lastCallTitle: (comp) => `⏳ Last chance for ${comp}`,
    lastCallBody: (list) => `You still need ${list} before midnight.`,
    joinTitle: (name) => `🎉 ${name} is in`,
    joinBodyDuel: "The duel is on. Let’s go!",
    joinBodyGroup: "The challenge is on. Let’s go!",
    reactionAmount: (who, amount, unit) => `${who} reacted to your ${amount} ${unit}.`,
    reactionSet: (who) => `${who} reacted to your set.`,
    overtakeTitle: (name) => `⚡ ${name} overtook you`,
    overtakeTeamTitle: (name) => `⚡ ${name} overtook your team`,
    overtakeBody: (unit, theirs, mine) => `${unit}: ${theirs} to ${mine}. Take the lead back!`,
    overtakeTeamBody: (unit, theirs, ours) => `${unit}: ${theirs} to ${ours}. Take the lead back together!`,
    goalTitle: (name) => `🏁 ${name} hit 100%`,
    goalBody: "Every weekly goal done. Your turn?",
  },
};

const textFor = (lang: string | null | undefined): PushTexts => PUSH_TEXT[pushLang(lang)];

// Standard-Übungen (categories.competition_id leer) übersetzt die App beim Laden
// (PTData.localizeCategory in www/data.js); hier dieselben Namen für Mitteilungen.
// Eigene Übungen und andere Namen bleiben unverändert.
export const STANDARD_CATEGORY_NAMES: Record<PushLang, Record<string, string>> = {
  de: {},
  en: { "Liegestütze": "Push-ups", "Klimmzüge": "Pull-ups", "Kniebeugen": "Squats", "20-Min-AMRAP": "20-min AMRAP" },
};

export function localizedCategoryName(
  category: { name?: string | null; competition_id?: string | null } | null | undefined,
  lang: string | null | undefined,
): string {
  const name = String(category?.name ?? "");
  if (category?.competition_id != null) return name;
  const names = STANDARD_CATEGORY_NAMES[pushLang(lang)];
  return Object.hasOwn(names, name) ? names[name] : name;
}

// ── Texte ────────────────────────────────────────────────────────────────────
export function cleanText(value: unknown, max = 40, fallback = ""): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : text;
}

export function joinList(items: string[], and = PUSH_TEXT.de.and): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

interface CompText {
  compName: string;
  compEmoji?: string | null;
  lang?: string | null; // Sprache der Empfänger, Standard Deutsch
}

function compLine({ compName, compEmoji }: CompText): string {
  return `${cleanText(compEmoji, 8)} ${cleanText(compName, 40, "Challenge")}`.trim();
}

export function rivalAlert(o: CompText & { senderName: string; senderToday: number }): Alert {
  const t = textFor(o.lang);
  return {
    title: t.rivalTitle(cleanText(o.senderName, 30, t.someone)),
    subtitle: compLine(o),
    body: t.rivalBody(o.senderToday),
  };
}

export function dailyNudgeAlert(o: CompText & { rivalName?: string | null; rivalToday?: number }): Alert {
  const t = textFor(o.lang);
  const n = o.rivalToday ?? 0;
  return {
    title: t.dailyTitle(cleanText(o.compName, 40, t.yourChallenge)),
    body: n > 0 ? t.dailyBody(cleanText(o.rivalName, 30, t.yourRival), n) : t.dailyBodyFirst,
  };
}

// missing[].name ist schon in der Sprache der Empfänger (localizedCategoryName).
export function lastCallAlert(o: CompText & { missing: { amount: number; name: string }[] }): Alert {
  const t = textFor(o.lang);
  const items = o.missing.slice(0, 3).map((x) => `${x.amount} ${cleanText(x.name, 30, t.reps)}`);
  return {
    title: t.lastCallTitle(cleanText(o.compName, 40, t.yourChallenge)),
    body: t.lastCallBody(joinList(items, t.and)),
  };
}

export function joinAlert(o: CompText & { name: string; mode: string }): Alert {
  const t = textFor(o.lang);
  return {
    title: t.joinTitle(cleanText(o.name, 30, t.someone)),
    subtitle: compLine(o),
    body: o.mode === "1v1" ? t.joinBodyDuel : t.joinBodyGroup,
  };
}

// unitName ist schon in der Sprache der Empfänger (localizedCategoryName).
export function reactionAlert(o: CompText & { reactorName: string; emoji: string; amount?: number | null; unitName?: string | null }): Alert {
  const t = textFor(o.lang);
  const who = cleanText(o.reactorName, 30, t.someone);
  const amount = o.amount ?? 0;
  const unit = cleanText(o.unitName, 30);
  return {
    title: `${cleanText(o.emoji, 8, "👏")} ${who}`,
    subtitle: compLine(o),
    body: amount > 1 && unit ? t.reactionAmount(who, amount, unit) : t.reactionSet(who),
  };
}

// unitName ist schon in der Sprache der Empfänger (localizedCategoryName).
export function overtakeAlert(o: CompText & { senderName: string; unitName: string; theirs: number; mine: number; team?: boolean }): Alert {
  const t = textFor(o.lang);
  const who = cleanText(o.senderName, 30, t.someone);
  const unit = cleanText(o.unitName, 30, t.reps);
  return {
    title: o.team ? t.overtakeTeamTitle(who) : t.overtakeTitle(who),
    subtitle: compLine(o),
    body: o.team ? t.overtakeTeamBody(unit, o.theirs, o.mine) : t.overtakeBody(unit, o.theirs, o.mine),
  };
}

export function goalAlert(o: CompText & { name: string }): Alert {
  const t = textFor(o.lang);
  return {
    title: t.goalTitle(cleanText(o.name, 30, t.someone)),
    subtitle: compLine(o),
    body: t.goalBody,
  };
}

// ── Tageserinnerung planen ───────────────────────────────────────────────────
export interface CompetitionRow {
  id: string;
  name: string;
  emoji?: string | null;
  mode: string;
  start_date?: string | null;
  end_date?: string | null;
  archived_at?: string | null;
}

export interface SetRow {
  user_id: string;
  competition_id: string;
  challenge_id: string | null;
  reps: number | null;
  created_at: string;
}

export interface NudgeInput {
  kind: NudgeKind;
  today: string; // Berliner Datum
  weekStart: string; // Montag dieser Woche
  tokenUsers: Iterable<string>; // Nutzer mit iOS-Token
  competitions: CompetitionRow[];
  members: MemberRow[]; // alle Mitglieder der Challenges, auch ausgetretene
  goals: GoalRow[]; // Ziele dieser Woche
  sets: SetRow[]; // Sätze zu diesen Zielen
  alreadyPushed: Iterable<string>; // pushKey(user, challenge) mit Push heute, egal welcher Art
  maxPerUser?: number;
}

export interface NudgePlan {
  user_id: string;
  competition_id: string;
  kind: NudgeKind;
  alert: Alert;
}

export function pushKey(userId: string, competitionId: string): string {
  return `${userId}|${competitionId}`;
}

export function isRunning(c: CompetitionRow, today: string): boolean {
  return !c.archived_at &&
    (!c.start_date || c.start_date <= today) &&
    (!c.end_date || c.end_date >= today);
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

// Wer bekommt jetzt welche Erinnerung? Reine Planung, verschickt nichts.
//   daily:     aktive Challenge mit Wiederholungs-Zielen diese Woche, heute noch
//              kein Satz in dieser Challenge.
//   last_call: offener Wochenanteil bei mindestens einem Wiederholungs-Ziel.
// Beide nur für Nutzer mit Token und nur, wenn heute in dieser Challenge noch
// keine Mitteilung (egal welcher Art) rausging.
export function planNudges(input: NudgeInput): NudgePlan[] {
  const tokens = new Set(input.tokenUsers);
  const pushed = new Set(input.alreadyPushed);
  const goalById = new Map(input.goals.map((g) => [g.id, g]));
  const goalsByComp = groupBy(input.goals, (g) => g.competition_id);
  const membersByComp = groupBy(input.members, (m) => m.competition_id);

  const weekDone = new Map<string, number>(); // user|goal → Wiederholungen diese Woche
  const todayAny = new Set<string>(); // user|challenge mit Satz heute
  const todayReps = new Map<string, number>(); // user|challenge → Wiederholungen heute
  for (const s of input.sets) {
    const goal = s.challenge_id ? goalById.get(s.challenge_id) : undefined;
    if (goal && isRepGoal(goal)) {
      const k = pushKey(s.user_id, goal.id);
      weekDone.set(k, (weekDone.get(k) ?? 0) + (s.reps ?? 0));
    }
    if (berlinDate(s.created_at) !== input.today) continue;
    const k = pushKey(s.user_id, s.competition_id);
    todayAny.add(k);
    if (!WORKOUT_TYPES.includes(goal?.category?.challenge_type ?? "standard")) {
      todayReps.set(k, (todayReps.get(k) ?? 0) + (s.reps ?? 0));
    }
  }

  const candidates: (NudgePlan & { main: boolean; score: number; name: string })[] = [];
  for (const c of input.competitions) {
    if (!isRunning(c, input.today)) continue;
    const repGoals = (goalsByComp.get(c.id) ?? []).filter(isRepGoal);
    if (!repGoals.length) continue;
    const all = membersByComp.get(c.id) ?? [];
    const comp = { compName: c.name, compEmoji: c.emoji };
    const people = sharePeople(c.mode, participantsFor(all, input.weekStart).length);

    for (const me of all) {
      if (me.left_at || !tokens.has(me.user_id)) continue;
      const key = pushKey(me.user_id, c.id);
      if (pushed.has(key)) continue;
      const base = { user_id: me.user_id, competition_id: c.id, main: me.main_competition_id === c.id, name: c.name };
      const lang = pushLang(me.language);

      if (input.kind === "daily") {
        if (todayAny.has(key)) continue;
        let best: MemberRow | null = null;
        let bestToday = 0;
        for (const o of opponentsOf(all, me.user_id, c.mode)) {
          const n = todayReps.get(pushKey(o.user_id, c.id)) ?? 0;
          if (n > bestToday) { best = o; bestToday = n; }
        }
        candidates.push({
          ...base, kind: "daily", score: bestToday,
          alert: dailyNudgeAlert({ ...comp, lang, rivalName: best?.display_name, rivalToday: bestToday }),
        });
      } else {
        const missing = repGoals
          .map((g) => ({
            amount: fairShareOf(g.target_reps ?? 0, people) - (weekDone.get(pushKey(me.user_id, g.id)) ?? 0),
            name: localizedCategoryName(g.category, lang),
          }))
          .filter((x) => x.amount > 0);
        if (!missing.length) continue;
        candidates.push({ ...base, kind: "last_call", score: 0, alert: lastCallAlert({ ...comp, lang, missing }) });
      }
    }
  }

  // Pro Nutzer zuerst die Haupt-Challenge, dann die mit dem aktivsten Rivalen.
  const max = input.maxPerUser ?? MAX_NUDGES_PER_USER_PER_RUN;
  const out: NudgePlan[] = [];
  for (const list of groupBy(candidates, (x) => x.user_id).values()) {
    list.sort((a, b) => Number(b.main) - Number(a.main) || b.score - a.score || a.name.localeCompare(b.name));
    for (const x of list.slice(0, max)) {
      out.push({ user_id: x.user_id, competition_id: x.competition_id, kind: x.kind, alert: x.alert });
    }
  }
  return out;
}
