import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { apnsConfigFrom, apnsConfigured, buildApnsJwt, sendToDevices } from "../_shared/apns.ts";
import {
  type Alert,
  berlinDate,
  isFresh,
  isQuietHour,
  joinAlert,
  localizedCategoryName,
  opponentsOf,
  PUSH_KIND,
  type PushKind,
  type PushLang,
  pushLang,
  reactionAlert,
  rivalAlert,
  rivalReached,
  thresholdFromEnv,
} from "../_shared/push-rules.ts";

// Ein Endpunkt für alle Ereignis-Pushes. Auslöser sind DB-Trigger per pg_net:
//   sets                → Rivalen-Push (Trigger notify_set_after_insert)
//   competition_members → „X ist dabei“ (Migration 20261021002000_social_push.sql)
//   reactions           → Reaktion auf einen Satz (dieselbe Migration)
// Regeln (Schwelle, Ruhezeit, Texte) stehen in ../_shared/push-rules.ts.
// Texte kommen in der Sprache der Empfänger (profiles.language, Migration
// 20261021000000_profile_language.sql). Ohne Eintrag oder ohne Spalte: Deutsch.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS = apnsConfigFrom((k) => Deno.env.get(k));
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

// Ab so vielen Wiederholungen am Tag (Standard 10, Env RIVAL_THRESHOLD).
const RIVAL_THRESHOLD = thresholdFromEnv(Deno.env.get("RIVAL_THRESHOLD"));

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
  profile: { display_name: string; language?: string | null } | null;
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
// Empfänger in dessen Sprache.
interface PushJob {
  kind: PushKind;
  competition: Competition;
  recipients: Recipient[];
  alert: (lang: PushLang) => Alert;
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
  // Unverändert: Prüfung nur, wenn WEBHOOK_SECRET gesetzt ist. Fail-closed würde
  // heute alle Pushes stoppen, solange in der DB kein app.webhook_secret steht,
  // das der Trigger mitschicken kann (docs/PUSH_SETUP_MORNING.md, A2).
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch (_) {
    return new Response("invalid json", { status: 400 });
  }

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
  if (isQuietHour(new Date())) {
    return ignored("quiet_hours");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let outcome: Outcome;
  try {
    if (table === "sets") {
      // Die Rangliste bleibt unabhängig von der Rivalen-Schwelle: auch ein
      // einzelner Satz kann jemanden in der Monatsrangliste überholen.
      outcome = await rivalJob(supabase, payload.record);
      const rival = outcome instanceof Response ? await outcome.json() : await deliver(supabase, outcome);
      const rank = await rankPush(supabase, payload.record);
      // Wie bei den anderen Push-Arten nur Zählwerte zurückgeben.
      return Response.json({ rival, rank }, { status: outcome instanceof Response ? outcome.status : 200 });
    } else if (table === "competition_members") outcome = await joinJob(supabase, payload.record);
    else if (table === "reactions") outcome = await reactionJob(supabase, payload.record);
    else return ignored("unknown_table");
  } catch (e) {
    return Response.json({ error: "lookup", detail: String((e as Error)?.message ?? e) }, { status: 500 });
  }
  if (outcome instanceof Response) return outcome;

  const result = await deliver(supabase, outcome);
  console.log("notify-set", outcome.kind, JSON.stringify(result));
  // Datenminimierung: nur Zählwerte, keine Nutzer-IDs und keine Tageswerte.
  return Response.json({ kind: outcome.kind, ...result });
});

// ── Rivalen-Push: Satz über der Tagesschwelle, Gegner steht heute bei 0 ───────
async function rivalJob(supabase: SupabaseClient, record: Record<string, unknown>): Promise<Outcome> {
  // Satz aus der DB lesen statt dem Payload zu glauben.
  if (!isUuid(record.id)) return ignored("legacy_record");
  const { data: set, error: setErr } = await supabase
    .from("sets")
    .select("id, user_id, competition_id")
    .eq("id", record.id)
    .maybeSingle();
  if (setErr) return Response.json({ error: "set", detail: setErr.message }, { status: 500 });
  if (!set) return ignored("set_not_found");
  if (!set.user_id || !set.competition_id) return ignored("legacy_record");

  // 1. Tagessumme des Senders in dieser Challenge
  const { data: senderToday, error: senderErr } = await supabase.rpc(
    "user_reps_today",
    { p_user: set.user_id, p_competition: set.competition_id },
  );
  if (senderErr) {
    return Response.json({ error: "sender_rpc", detail: senderErr.message }, { status: 500 });
  }
  if (!rivalReached(senderToday, RIVAL_THRESHOLD)) {
    return ignored("sender_below_threshold", { threshold: RIVAL_THRESHOLD });
  }

  // 2. Challenge + Mitglieder. Empfänger sind die Gegner: alle anderen aktiven
  //    Mitglieder, bei 2v2 nur das andere Team.
  const loaded = await loadCompetition(supabase, set.competition_id);
  if (loaded instanceof Response) return loaded;
  const { competition, members } = loaded;
  const sender = members.find((m) => m.user_id === set.user_id);
  const opponents = opponentsOf(members, set.user_id, competition.mode);
  if (opponents.length === 0) return ignored("no_opponents");

  // 3. Nur wer heute in dieser Challenge noch bei 0 ist
  const recipients: Recipient[] = [];
  for (const o of opponents) {
    const { data: n, error } = await supabase.rpc(
      "user_reps_today",
      { p_user: o.user_id, p_competition: set.competition_id },
    );
    if (!error && (n ?? 0) === 0) recipients.push(recipientOf(o));
  }
  if (recipients.length === 0) return ignored("recipients_active");

  return {
    kind: PUSH_KIND.rival,
    competition,
    recipients,
    alert: (lang) =>
      rivalAlert({
        lang,
        senderName: sender?.profile?.display_name ?? "",
        senderToday,
        compName: competition.name,
        compEmoji: competition.emoji,
      }),
    extra: { sender_id: set.user_id },
  };
}

// ── Beitritt: „X ist dabei 🎉“ an alle anderen aktiven Mitglieder ────────────
async function joinJob(supabase: SupabaseClient, record: Record<string, unknown>): Promise<Outcome> {
  if (!isUuid(record.competition_id) || !isUuid(record.user_id)) return ignored("invalid_record");
  const { data: row, error } = await supabase
    .from("competition_members")
    .select("competition_id, user_id, left_at, joined_at")
    .eq("competition_id", record.competition_id)
    .eq("user_id", record.user_id)
    .maybeSingle();
  if (error) return Response.json({ error: "member", detail: error.message }, { status: 500 });
  if (!row || row.left_at) return ignored("not_member");
  if (!isFresh(row.joined_at)) return ignored("stale");

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
async function reactionJob(supabase: SupabaseClient, record: Record<string, unknown>): Promise<Outcome> {
  if (!isUuid(record.id)) return ignored("invalid_record");
  const { data: reaction, error } = await supabase
    .from("reactions")
    .select("id, set_id, user_id, emoji, created_at")
    .eq("id", record.id)
    .maybeSingle();
  if (error) return Response.json({ error: "reaction", detail: error.message }, { status: 500 });
  if (!reaction || !reaction.user_id) return ignored("reaction_not_found");
  if (!isFresh(reaction.created_at)) return ignored("stale");

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
  const [{ data: tokens }, { data: sentToday }] = await Promise.all([
    supabase.from("device_tokens").select("user_id, token, platform").in("user_id", userIds),
    // Obergrenze: höchstens eine Mitteilung pro Nutzer, Challenge und Tag, egal welcher Art.
    supabase.from("push_log").select("user_id")
      .eq("competition_id", job.competition.id).eq("day", today).in("user_id", userIds),
  ]);
  const alreadyPushed = new Set((sentToday ?? []).map((r) => r.user_id));

  let jwt: string | null = null;
  let sent = 0;
  const dead: string[] = [];
  const failures: Record<string, number> = {};

  for (const { user_id: userId, lang } of job.recipients) {
    const iosTokens = (tokens ?? []).filter((t) => t.user_id === userId && t.platform === "ios").map((t) => t.token);
    if (iosTokens.length === 0) { skip("no_tokens"); continue; }
    if (alreadyPushed.has(userId)) { skip("already_sent_today"); continue; }

    // Dedup: push_log insert claims the daily slot per recipient + challenge.
    // Der Unique-Index push_log_one_per_day_idx (falls angelegt) macht das auch
    // über verschiedene Arten hinweg atomar.
    const { error: logErr } = await supabase
      .from("push_log")
      .insert({ user_id: userId, competition_id: job.competition.id, kind: job.kind, day: today });
    if (logErr) { skip(logErr.code === "23505" ? "already_sent_today" : "log_error"); continue; }

    jwt ??= await buildApnsJwt({ keyId: APNS.keyId, teamId: APNS.teamId, privateKeyPem: APNS.privateKeyPem });
    const r = await sendToDevices(APNS, jwt, iosTokens, {
      aps: { alert: job.alert(lang), sound: "default" },
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

    const english = pushLang(languages[entry.user_id]) === "en";
    jwt ??= await buildApnsJwt({ keyId: APNS.keyId, teamId: APNS.teamId, privateKeyPem: APNS.privateKeyPem });
    const result = await sendToDevices(APNS, jwt, iosTokens, {
      aps: {
        alert: {
          title: english ? "🏆 Leaderboard" : "🏆 Rangliste",
          body: english
            ? `${entry.sender_name} pushed you down to #${entry.new_rank} in ${entry.category_name}.`
            : `${entry.sender_name} hat dich bei ${entry.category_name} auf Platz ${entry.new_rank} verdrängt.`,
        },
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
