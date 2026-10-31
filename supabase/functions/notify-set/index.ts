import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { apnsConfigFrom, apnsConfigured, buildApnsJwt, sendToDevices } from "../_shared/apns.ts";
import {
  type Alert,
  berlinDate,
  berlinWeekStart,
  completesAll,
  expectedPeople,
  fairShareOf,
  goalAlert,
  isFresh,
  isQuietHour,
  joinAlert,
  localizedCategoryName,
  overtakeAlert,
  overtakenSides,
  participantsFor,
  PUSH_KIND,
  type PushKind,
  type PushLang,
  pushLang,
  rankOvertakenAlert,
  reactionAlert,
  WORKOUT_TYPES,
  workoutRunsRequired,
} from "../_shared/push-rules.ts";

// Ein Endpunkt für alle Ereignis-Pushes. Auslöser sind DB-Trigger per pg_net:
//   sets                → Überholt (je Übung der laufenden Woche), 100 % einer
//                         Challenge, Rangliste (Trigger notify_set_after_insert)
//   competition_members → „X ist dabei“ (Migration 20261024150000_push_events.sql)
//   reactions           → Reaktion auf einen Satz (dieselbe Migration)
// Regeln (Ruhezeit, Obergrenzen, Texte) stehen in ../_shared/push-rules.ts.
// Texte kommen in der Sprache der Empfänger (profiles.language, Migration
// 20261021000000_profile_language.sql). Ohne Eintrag oder ohne Spalte: Deutsch.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS = apnsConfigFrom((k) => Deno.env.get(k));
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

interface Member {
  user_id: string;
  team: string | null;
  left_at: string | null;
  joined_at?: string | null;
  profile: { display_name: string; language?: string | null } | null;
}

interface Category {
  name: string | null;
  competition_id: string | null;
  kind: string | null;
  challenge_type: string | null;
}

interface Goal {
  id: string;
  week_start: string;
  target_reps: number | null;
  target_runs?: number | null;
  category: Category | null;
}

interface SetRow {
  id: string;
  user_id: string;
  challenge_id: string;
  reps: number | null;
  duration_minutes: number | null;
}

interface Competition {
  id: string;
  name: string;
  emoji: string;
  mode: string;
  archived_at: string | null;
}

interface Recipient {
  user_id: string;
  lang: PushLang;
}

const recipientOf = (m: Member): Recipient => ({ user_id: m.user_id, lang: pushLang(m.profile?.language) });

// Was eine Verzweigung verschicken möchte. Empfänger werden in deliver()
// noch auf Token und Tages-Obergrenze geprüft. Den Text baut alert() je
// Empfänger in dessen Sprache. ref grenzt die Obergrenze feiner ein
// (push_log.ref): eine Mitteilung pro Empfänger, Challenge, Art, ref und Tag.
interface PushJob {
  kind: PushKind;
  competition: Competition;
  recipients: Recipient[];
  alert: (lang: PushLang, userId: string) => Alert;
  ref?: string | null;
  extra?: Record<string, unknown>;
}

type Outcome = PushJob | Response;

const ignored = (reason: string, extra: Record<string, unknown> = {}) =>
  Response.json({ ignored: true, reason, ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  // Die Trigger schicken public.webhook_secret() (Vault) mit; ohne gesetztes
  // Secret bleibt die Funktion zu (JWT-Prüfung ist aus).
  if (!WEBHOOK_SECRET || !sameSecret(req.headers.get("x-webhook-secret") ?? "", WEBHOOK_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch (_) {
    return new Response("invalid json", { status: 400 });
  }

  // Probelauf (nur mit gültigem Secret): rechnet alles durch, ohne Ruhezeit und
  // Frische-Prüfung, schickt nichts und belegt keinen Platz in push_log.
  const dryRun = req.headers.get("x-dry-run") === "1";
  const table = payload?.table ?? "sets";
  const isMemberUpdate = table === "competition_members" && payload?.type === "UPDATE";
  if ((payload?.type !== "INSERT" && !isMemberUpdate) || !payload.record) {
    return ignored("not_insert");
  }
  if (!apnsConfigured(APNS)) {
    // 503: the function can't fulfill its purpose without APNs creds.
    // Returning non-200 makes this visible in pg_net._http_response.status_code
    // without having to inspect the body.
    return Response.json(
      { error: "apns_not_configured" },
      { status: 503 },
    );
  }
  // Ruhezeit 22–7 Uhr Berlin: abbrechen, bevor ein push_log-Platz belegt wird.
  if (!dryRun && isQuietHour(new Date())) {
    return ignored("quiet_hours");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let outcome: Outcome;
  try {
    if (table === "sets") {
      // Überholt und 100 % je Challenge, Rangliste übergreifend. Wie bei den
      // anderen Push-Arten nur Zählwerte zurückgeben.
      const ctx = await setContext(supabase, payload.record);
      const overtake = ctx instanceof Response ? await ctx.clone().json() : await send(supabase, overtakeJob(ctx), dryRun);
      const goal = ctx instanceof Response ? await ctx.json() : await send(supabase, goalJob(ctx), dryRun);
      const rank = dryRun ? { dry_run: true } : await rankPush(supabase, payload.record);
      return Response.json({ overtake, goal, rank });
    } else if (table === "competition_members") outcome = await joinJob(supabase, payload.record, dryRun);
    else if (table === "reactions") outcome = await reactionJob(supabase, payload.record, dryRun);
    else return ignored("unknown_table");
  } catch (e) {
    return Response.json({ error: "lookup", detail: String((e as Error)?.message ?? e) }, { status: 500 });
  }
  if (outcome instanceof Response) return outcome;
  // Datenminimierung: nur Zählwerte, keine Nutzer-IDs und keine Tageswerte.
  return Response.json(await send(supabase, outcome, dryRun));
});

function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

async function send(supabase: SupabaseClient, outcome: Outcome, dryRun = false) {
  if (outcome instanceof Response) return await outcome.json();
  if (dryRun) {
    // Nur Zählwerte und der Text für die erste Person, nichts verschicken.
    const first = outcome.recipients[0];
    return { kind: outcome.kind, dry_run: true, would_send: outcome.recipients.length, sample: first ? outcome.alert(first.lang, first.user_id) : null };
  }
  const result = await deliver(supabase, outcome);
  console.log("notify-set", outcome.kind, JSON.stringify(result));
  return { kind: outcome.kind, ...result };
}

// ── Satz: Woche der Challenge laden ──────────────────────────────────────────
interface SetContext {
  set: SetRow;
  goal: Goal; // Wochenziel dieses Satzes
  goals: Goal[]; // alle Wochenziele der Challenge in dieser Woche
  sets: SetRow[]; // alle Sätze zu diesen Zielen
  competition: Competition;
  members: Member[]; // auch ausgetretene (für den Anteil wie in der App)
}

async function setContext(supabase: SupabaseClient, record: Record<string, unknown>): Promise<SetContext | Response> {
  // Satz aus der DB lesen statt dem Payload zu glauben.
  if (!isUuid(record.id)) return ignored("legacy_record");
  const { data: set, error: setErr } = await supabase
    .from("sets")
    .select("id, user_id, competition_id, challenge_id, reps, duration_minutes")
    .eq("id", record.id)
    .maybeSingle();
  if (setErr) return Response.json({ error: "set", detail: setErr.message }, { status: 500 });
  if (!set) return ignored("set_not_found");
  if (!set.user_id || !set.competition_id || !set.challenge_id) return ignored("legacy_record");

  const goalCols = "id, week_start, target_reps, target_runs, category:category_id(name, competition_id, kind, challenge_type)";
  const { data: goal } = await supabase.from("weekly_challenges").select(goalCols).eq("id", set.challenge_id).maybeSingle();
  if (!goal) return ignored("challenge_not_found");
  // Nur die laufende Woche: nachgetragene Sätze alter Wochen melden nichts.
  if (goal.week_start !== berlinWeekStart(new Date())) return ignored("past_week");

  const [{ data: competition }, { data: members, error: memErr }, { data: goals }] = await Promise.all([
    supabase.from("competitions").select("id, name, emoji, mode, archived_at").eq("id", set.competition_id).maybeSingle(),
    supabase.from("competition_members")
      .select("user_id, team, joined_at, left_at, profile:user_id(display_name, language)")
      .eq("competition_id", set.competition_id),
    supabase.from("weekly_challenges").select(goalCols)
      .eq("competition_id", set.competition_id).eq("week_start", goal.week_start),
  ]);
  if (memErr || !competition) return Response.json({ error: "members", detail: memErr?.message }, { status: 500 });
  if (competition.archived_at) return ignored("archived");
  if (competition.mode === "solo") return ignored("solo");

  const goalIds = (goals ?? []).map((g) => g.id);
  const { data: sets, error: setsErr } = await supabase.from("sets")
    .select("id, user_id, challenge_id, reps, duration_minutes").in("challenge_id", goalIds);
  if (setsErr) return Response.json({ error: "sets", detail: setsErr.message }, { status: 500 });

  return {
    set: set as SetRow,
    goal: goal as unknown as Goal,
    goals: (goals ?? []) as unknown as Goal[],
    sets: (sets ?? []) as SetRow[],
    competition: competition as Competition,
    members: (members ?? []) as unknown as Member[],
  };
}

const isWorkout = (g: Goal) => WORKOUT_TYPES.includes(g.category?.challenge_type || "standard");
const usesMinutes = (g: Goal) => g.category?.kind === "time" || g.category?.kind === "work";
const isRepGoal = (g: Goal) => (g.category?.kind || "sports") === "sports" && !isWorkout(g);
const valueOf = (g: Goal, s: SetRow) => (usesMinutes(g) ? s.duration_minutes ?? 0 : s.reps ?? 0);

// ── Überholt: mehr Reps in dieser Übung als du (2v2: als dein Team) ──────────
// Nur, wenn die überholte Seite selbst schon etwas hat; der erste Satz der
// Woche gegen 0 meldet nichts. Höchstens eine Mitteilung pro Übung und Tag.
function overtakeJob(ctx: SetContext): Outcome {
  const { set, goal, competition, members } = ctx;
  if (!isRepGoal(goal)) return ignored("not_reps");
  const added = set.reps ?? 0;
  if (added <= 0) return ignored("no_reps");

  const active = members.filter((m) => !m.left_at);
  const sender = active.find((m) => m.user_id === set.user_id);
  if (!sender) return ignored("not_member");
  const teams = competition.mode === "2v2";
  const sideKey = (m: Member) => (teams && m.team ? `team:${m.team}` : `user:${m.user_id}`);
  const byUser: Record<string, number> = {};
  for (const s of ctx.sets) if (s.challenge_id === goal.id) byUser[s.user_id] = (byUser[s.user_id] ?? 0) + (s.reps ?? 0);

  const sides = new Map<string, { key: string; members: Member[]; value: number }>();
  for (const m of active) {
    const key = sideKey(m);
    if (!sides.has(key)) sides.set(key, { key, members: [], value: 0 });
    const side = sides.get(key)!;
    side.members.push(m);
    side.value += byUser[m.user_id] ?? 0;
  }
  const mine = sides.get(sideKey(sender))!;
  const after = mine.value;
  const others = [...sides.values()].filter((x) => x.key !== mine.key);
  const overtaken = overtakenSides(after - added, after, others);
  if (overtaken.length === 0) return ignored("nobody_overtaken");

  const valueFor: Record<string, number> = {};
  const recipients: Recipient[] = [];
  for (const side of overtaken) {
    for (const m of side.members) { valueFor[m.user_id] = side.value; recipients.push(recipientOf(m)); }
  }
  return {
    kind: PUSH_KIND.overtake,
    competition,
    recipients,
    ref: goal.id,
    alert: (lang, userId) =>
      overtakeAlert({
        lang,
        senderName: sender.profile?.display_name ?? "",
        unitName: localizedCategoryName(goal.category, lang),
        theirs: after,
        mine: valueFor[userId] ?? 0,
        team: teams,
        compName: competition.name,
        compEmoji: competition.emoji,
      }),
    extra: { sender_id: set.user_id, challenge_id: goal.id },
  };
}

// ── 100 %: alle Wochenziele der Challenge geschafft ─────────────────────────
// Anteil wie in der App (www/dashboard-model.js): Wochenziel geteilt durch die
// erwartete Besetzung, Pflicht-Workouts gemäß target_runs pro Person. Meldet nur den Satz,
// mit dem die letzte Lücke zugeht; an alle anderen aktiven Mitglieder.
function goalJob(ctx: SetContext): Outcome {
  const { set, goals, competition, members } = ctx;
  if (goals.length === 0) return ignored("no_goals");
  const sender = members.find((m) => m.user_id === set.user_id && !m.left_at);
  if (!sender) return ignored("not_member");
  const people = expectedPeople(competition.mode, participantsFor(members, ctx.goal.week_start).length);
  const progress = goals.map((g) => {
    const mine = ctx.sets.filter((s) => s.challenge_id === g.id && s.user_id === set.user_id);
    const workout = isWorkout(g);
    const own = g.id === set.challenge_id;
    return {
      share: workout ? workoutRunsRequired(g) : fairShareOf(g.target_reps ?? 0, people),
      value: workout ? mine.length : mine.reduce((a, s) => a + valueOf(g, s), 0),
      added: own ? (workout ? 1 : valueOf(g, set)) : 0,
    };
  });
  if (!completesAll(progress)) return ignored("not_complete");

  const recipients = members.filter((m) => !m.left_at && m.user_id !== set.user_id).map(recipientOf);
  if (recipients.length === 0) return ignored("no_recipients");
  return {
    kind: PUSH_KIND.goal,
    competition,
    recipients,
    ref: set.user_id,
    alert: (lang) =>
      goalAlert({
        lang,
        name: sender.profile?.display_name ?? "",
        compName: competition.name,
        compEmoji: competition.emoji,
      }),
    extra: { sender_id: set.user_id },
  };
}

// ── Beitritt: „X ist dabei 🎉“ an alle anderen aktiven Mitglieder ────────────
async function joinJob(supabase: SupabaseClient, record: Record<string, unknown>, dryRun = false): Promise<Outcome> {
  if (!isUuid(record.competition_id) || !isUuid(record.user_id)) return ignored("invalid_record");
  const { data: row, error } = await supabase
    .from("competition_members")
    .select("competition_id, user_id, left_at, joined_at")
    .eq("competition_id", record.competition_id)
    .eq("user_id", record.user_id)
    .maybeSingle();
  if (error) return Response.json({ error: "member", detail: error.message }, { status: 500 });
  if (!row || row.left_at) return ignored("not_member");
  if (!dryRun && !isFresh(row.joined_at)) return ignored("stale");

  const loaded = await loadCompetition(supabase, row.competition_id);
  if (loaded instanceof Response) return loaded;
  const { competition, members } = loaded;
  const joiner = members.find((m) => m.user_id === row.user_id);
  const recipients = members.filter((m) => !m.left_at && m.user_id !== row.user_id).map(recipientOf);
  if (recipients.length === 0) return ignored("no_recipients");

  return {
    kind: PUSH_KIND.join,
    competition,
    recipients,
    ref: row.user_id,
    alert: (lang) =>
      joinAlert({
        lang,
        name: joiner?.profile?.display_name ?? "",
        mode: competition.mode,
        compName: competition.name,
        compEmoji: competition.emoji,
      }),
  };
}

// ── Reaktion: Mitteilung an den Besitzer des Satzes ──────────────────────────
async function reactionJob(supabase: SupabaseClient, record: Record<string, unknown>, dryRun = false): Promise<Outcome> {
  if (!isUuid(record.id)) return ignored("invalid_record");
  const { data: reaction, error } = await supabase
    .from("reactions")
    .select("id, set_id, user_id, emoji, created_at")
    .eq("id", record.id)
    .maybeSingle();
  if (error) return Response.json({ error: "reaction", detail: error.message }, { status: 500 });
  if (!reaction || !reaction.user_id) return ignored("reaction_not_found");
  if (!dryRun && !isFresh(reaction.created_at)) return ignored("stale");

  const { data: set, error: setErr } = await supabase
    .from("sets")
    .select("id, user_id, competition_id, reps, challenge:challenge_id(category:category_id(name, competition_id, kind, challenge_type))")
    .eq("id", reaction.set_id)
    .maybeSingle();
  if (setErr) return Response.json({ error: "set", detail: setErr.message }, { status: 500 });
  if (!set || !set.user_id || !set.competition_id) return ignored("set_not_found");
  if (set.user_id === reaction.user_id) return ignored("own_set");

  const loaded = await loadCompetition(supabase, set.competition_id);
  if (loaded instanceof Response) return loaded;
  const { competition, members } = loaded;
  const owner = members.find((m) => m.user_id === set.user_id && !m.left_at);
  const reactor = members.find((m) => m.user_id === reaction.user_id && !m.left_at);
  if (!owner || !reactor) return ignored("not_member");

  // deno-lint-ignore no-explicit-any
  const category = (set as any).challenge?.category ?? null;
  const isReps = (category?.kind || "sports") === "sports" && (category?.challenge_type || "standard") === "standard";
  return {
    kind: PUSH_KIND.reaction,
    competition,
    recipients: [recipientOf(owner)],
    // Eine Mitteilung pro reagierender Person und Tag, nicht pro Emoji.
    ref: reaction.user_id,
    alert: (lang) =>
      reactionAlert({
        lang,
        reactorName: reactor.profile?.display_name ?? "",
        emoji: reaction.emoji,
        amount: isReps ? set.reps : null,
        unitName: isReps ? localizedCategoryName(category, lang) : null,
        compName: competition.name,
        compEmoji: competition.emoji,
      }),
    extra: { set_id: set.id },
  };
}

async function loadCompetition(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<{ competition: Competition; members: Member[] } | Response> {
  const fetchMembers = (profileCols: string) =>
    supabase.from("competition_members")
      .select(`user_id, team, left_at, profile:user_id(${profileCols})`)
      .eq("competition_id", competitionId)
      .is("left_at", null);
  const [{ data: competition }, firstTry] = await Promise.all([
    supabase.from("competitions").select("id, name, emoji, mode, archived_at").eq("id", competitionId).maybeSingle(),
    fetchMembers("display_name, language"),
  ]);
  // Ohne Spalte profiles.language (Migration noch nicht eingespielt) wie bisher
  // laden; die Texte sind dann Deutsch.
  let { data: members, error: memErr } = firstTry;
  if (memErr && /language/.test(memErr.message)) ({ data: members, error: memErr } = await fetchMembers("display_name"));
  if (memErr || !competition) {
    return Response.json({ error: "members", detail: memErr?.message }, { status: 500 });
  }
  if (competition.archived_at) return ignored("archived");
  return { competition: competition as Competition, members: (members ?? []) as unknown as Member[] };
}

// ── Zustellen: Token, Tages-Obergrenze über alle Arten, APNs ────────────────
async function deliver(supabase: SupabaseClient, job: PushJob) {
  const today = berlinDate(new Date());
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };

  const userIds = job.recipients.map((r) => r.user_id);
  // Tokens BEFORE claiming the daily slot so we don't burn the slot when the
  // recipient has no device registered yet.
  const { data: tokens } = await supabase.from("device_tokens").select("user_id, token, platform").in("user_id", userIds);

  let jwt: string | null = null;
  let sent = 0;
  const dead: string[] = [];
  const failures: Record<string, number> = {};

  for (const { user_id: userId, lang } of job.recipients) {
    const iosTokens = (tokens ?? []).filter((t) => t.user_id === userId && t.platform === "ios").map((t) => t.token);
    if (iosTokens.length === 0) { skip("no_tokens"); continue; }

    // Obergrenze: der Eintrag belegt den Tagesplatz pro Empfänger, Challenge,
    // Art und ref; der Unique-Index push_log_scope_ref_idx macht das atomar.
    const row = { user_id: userId, competition_id: job.competition.id, kind: job.kind, day: today };
    let { error: logErr } = await supabase.from("push_log").insert({ ...row, ref: job.ref ?? null });
    // Ohne Spalte ref (Migration noch nicht eingespielt): eine pro Art und Tag.
    if (logErr && /\bref\b/.test(logErr.message)) ({ error: logErr } = await supabase.from("push_log").insert(row));
    if (logErr) { skip(logErr.code === "23505" ? "already_sent_today" : "log_error"); continue; }

    jwt ??= await buildApnsJwt({ keyId: APNS.keyId, teamId: APNS.teamId, privateKeyPem: APNS.privateKeyPem });
    const r = await sendToDevices(APNS, jwt, iosTokens, {
      aps: { alert: job.alert(lang, userId), sound: "default" },
      kind: job.kind,
      competition_id: job.competition.id,
      ...job.extra,
    });
    sent += r.sent;
    dead.push(...r.dead);
    for (const f of r.failures) {
      const k = `${f.status}${f.reason ? ` ${f.reason}` : ""}`;
      failures[k] = (failures[k] ?? 0) + 1;
    }
  }

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }
  return { sent, skipped, failures, cleaned: dead.length };
}

// ── Rangliste: „X hat dich bei Y auf Platz N verdrängt“ ──────────────────────
// ranking_overtaken wertet nur die erste Zeile einer log_id aus; ein Satz, der
// in mehreren Challenges zählt, löst also höchstens einen Durchlauf aus.
// Die Rangliste hat wie bisher einen eigenen Tagesplatz (competition_id=null).
async function rankPush(supabase: SupabaseClient, record: Record<string, unknown>) {
  if (!isUuid(record.id)) return { ignored: true, reason: "legacy_record" };
  const { data, error } = await supabase.rpc("ranking_overtaken", { p_set: record.id });
  if (error) return { error: "overtaken_rpc", detail: error.message };
  const overtaken = (data ?? []) as {
    user_id: string; category_id: string; category_name: string; sender_name: string; new_rank: number;
  }[];
  if (overtaken.length === 0) return { ignored: true, reason: "nobody_overtaken" };

  const languages: Record<string, string | null> = {};
  const { data: langRows, error: langErr } = await supabase.from("profiles")
    .select("id, language").in("id", overtaken.map((o) => o.user_id));
  if (!langErr) for (const row of langRows ?? []) languages[row.id] = row.language;

  const today = berlinDate(new Date());
  let jwt: string | null = null;
  let sent = 0;
  let skipped = 0;
  const dead: string[] = [];
  const failures: Record<string, number> = {};
  for (const entry of overtaken) {
    // Ohne Gerät den Tagesplatz nicht verbrauchen.
    const { data: tokens } = await supabase.from("device_tokens").select("token, platform").eq("user_id", entry.user_id);
    const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios").map((t) => t.token);
    if (iosTokens.length === 0) { skipped++; continue; }
    const { error: logErr } = await supabase.from("push_log").insert({
      user_id: entry.user_id, competition_id: null, kind: "rank_overtaken", day: today,
    });
    if (logErr) { skipped++; continue; }

    jwt ??= await buildApnsJwt({ keyId: APNS.keyId, teamId: APNS.teamId, privateKeyPem: APNS.privateKeyPem });
    const result = await sendToDevices(APNS, jwt, iosTokens, {
      aps: {
        alert: rankOvertakenAlert({
          lang: languages[entry.user_id], senderName: entry.sender_name,
          categoryName: entry.category_name, rank: entry.new_rank,
        }),
        sound: "default",
      },
      kind: "rank_overtaken",
      category_id: entry.category_id,
    });
    sent += result.sent;
    dead.push(...result.dead);
    for (const failure of result.failures) {
      const key = `${failure.status}${failure.reason ? ` ${failure.reason}` : ""}`;
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  if (dead.length > 0) await supabase.from("device_tokens").delete().in("token", dead);
  return { sent, skipped, failures, cleaned: dead.length };
}
