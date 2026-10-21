import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildApnsJwt, sendApns } from "./apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.bennyjoni.terminator";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production") as
  | "production"
  | "development";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const RIVAL_THRESHOLD = 100;

interface SetRecord {
  id: string;
  challenge_id: string;
  competition_id: string | null;
  user_id: string | null;
  reps: number | null;
  note: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: SetRecord | null;
  old_record: SetRecord | null;
}

interface Member {
  user_id: string;
  team: string | null;
  profile: { display_name: string; language?: string | null } | null;
}

// Texte je App-Sprache (profiles.language, Migration 20261021000000). Ohne
// Eintrag oder ohne Spalte: Deutsch wie bisher.
const TEXT = {
  de: {
    someone: "Jemand",
    title: (name: string) => `🔥 ${name} ist los`,
    body: (reps: number) => `Schon ${reps} Reps heute — du noch bei 0.`,
    rankTitle: "🏆 Rangliste",
    rankBody: (name: string, category: string, rank: number) =>
      `${name} hat dich bei ${category} auf Platz ${rank} verdrängt.`,
  },
  en: {
    someone: "Someone",
    title: (name: string) => `🔥 ${name} is on a roll`,
    body: (reps: number) => `Already ${reps} reps today — you’re still at 0.`,
    rankTitle: "🏆 Leaderboard",
    rankBody: (name: string, category: string, rank: number) =>
      `${name} pushed you down to #${rank} in ${category}.`,
  },
};
type Lang = keyof typeof TEXT;
const textFor = (lang: string | null | undefined) => TEXT[(lang ?? "de") as Lang] ?? TEXT.de;

interface Overtaken {
  user_id: string;
  category_id: string;
  category_name: string;
  sender_name: string;
  new_rank: number;
}

type Outcome = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
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

  if (payload.type !== "INSERT" || !payload.record) {
    return Response.json({ ignored: true, reason: "not_insert" });
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    // 503: the function can't fulfill its purpose without APNs creds.
    // Returning non-200 makes this visible in pg_net._http_response.status_code
    // without having to inspect the body.
    return Response.json(
      { error: "apns_not_configured" },
      { status: 503 },
    );
  }

  const record = payload.record;
  if (!record.user_id || !record.competition_id) {
    return Response.json({ ignored: true, reason: "legacy_record" });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: today, error: todayErr } = await supabase.rpc("berlin_today");
  if (todayErr || !today) {
    return Response.json({ error: "today_rpc", detail: todayErr?.message }, { status: 500 });
  }

  const sender = new Sender(supabase);
  const rival = await rivalPush(supabase, sender, record, today);
  const rank = await rankPush(supabase, sender, record, today);
  const cleaned = await sender.cleanup();

  return Response.json({ rival, rank, cleaned });
});

// ─── APNs an alle iOS-Geräte eines Users ────────────────────────────────────
class Sender {
  private dead: string[] = [];
  private jwt: string | null = null;
  constructor(private supabase: SupabaseClient) {}

  async tokensOf(userId: string): Promise<string[]> {
    const { data: tokens } = await this.supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", userId);
    return (tokens ?? []).filter((t) => t.platform === "ios").map((t) => t.token);
  }

  async send(tokens: string[], apsPayload: Record<string, unknown>): Promise<Outcome> {
    this.jwt ??= await buildApnsJwt({
      keyId: APNS_KEY_ID,
      teamId: APNS_TEAM_ID,
      privateKeyPem: APNS_PRIVATE_KEY,
    });
    const results = await Promise.all(
      tokens.map((deviceToken) =>
        sendApns({
          deviceToken,
          jwt: this.jwt!,
          bundleId: APNS_BUNDLE_ID,
          env: APNS_ENV,
          payload: apsPayload,
        })
      ),
    );
    for (const r of results) {
      if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") this.dead.push(r.deviceToken);
    }
    return {
      sent: results.filter((r) => r.status === 200).length,
      failures: results.filter((r) => r.status !== 200).map((r) => ({ status: r.status, reason: r.reason })),
    };
  }

  async cleanup(): Promise<number> {
    if (this.dead.length > 0) {
      await this.supabase.from("device_tokens").delete().in("token", this.dead);
    }
    return this.dead.length;
  }
}

// ─── Rivalen-Push: Gegner bei 0, Sender heute über der Schwelle ─────────────
async function rivalPush(
  supabase: SupabaseClient,
  sender: Sender,
  record: SetRecord,
  today: string,
): Promise<Outcome> {
  // 1. Sender daily total in this challenge
  const { data: senderToday, error: senderErr } = await supabase.rpc(
    "user_reps_today",
    { p_user: record.user_id, p_competition: record.competition_id },
  );
  if (senderErr) return { error: "sender_rpc", detail: senderErr.message };
  // Strict-greater than threshold — spec says "more than 100", not "at least 100".
  if ((senderToday ?? 0) <= RIVAL_THRESHOLD) {
    return { ignored: true, reason: "sender_below_threshold", senderToday, threshold: RIVAL_THRESHOLD };
  }

  // 2. Challenge + Mitglieder. Empfänger sind die Gegner: alle anderen aktiven
  //    Mitglieder, bei 2v2 nur das andere Team.
  const fetchMembers = (cols: string) =>
    supabase.from("competition_members")
      .select(`user_id, team, profile:user_id(${cols})`)
      .eq("competition_id", record.competition_id)
      .is("left_at", null);
  const [{ data: competition }, firstTry] = await Promise.all([
    supabase.from("competitions").select("id, name, emoji, mode").eq("id", record.competition_id).single(),
    fetchMembers("display_name, language"),
  ]);
  // Ohne Spalte profiles.language (Migration noch nicht eingespielt) wie bisher laden.
  let { data: members, error: memErr } = firstTry;
  if (memErr && /language/.test(memErr.message)) ({ data: members, error: memErr } = await fetchMembers("display_name"));
  if (memErr || !competition) return { error: "members", detail: memErr?.message };
  const all = (members ?? []) as unknown as Member[];
  const me = all.find((m) => m.user_id === record.user_id);
  const senderName = me?.profile?.display_name;
  const opponents = all.filter((m) =>
    m.user_id !== record.user_id &&
    !(competition.mode === "2v2" && me?.team && m.team === me.team)
  );
  if (opponents.length === 0) return { ignored: true, reason: "no_opponents" };

  const recipients: Outcome[] = [];
  for (const recipient of opponents) {
    // Nur wer heute in dieser Challenge noch bei 0 ist
    const { data: recipientToday, error: recipientErr } = await supabase.rpc(
      "user_reps_today",
      { p_user: recipient.user_id, p_competition: record.competition_id },
    );
    if (recipientErr) {
      recipients.push({ user: recipient.user_id, error: recipientErr.message });
      continue;
    }
    if ((recipientToday ?? 0) > 0) {
      recipients.push({ user: recipient.user_id, ignored: "recipient_active" });
      continue;
    }

    // Tokens BEFORE claiming the daily slot so we don't burn the slot when the
    // recipient has no device registered yet.
    const tokens = await sender.tokensOf(recipient.user_id);
    if (tokens.length === 0) {
      recipients.push({ user: recipient.user_id, ignored: "no_tokens" });
      continue;
    }

    // Dedup: push_log insert claims the daily slot per recipient + challenge
    const { error: logErr } = await supabase
      .from("push_log")
      .insert({ user_id: recipient.user_id, competition_id: record.competition_id, kind: "rival", day: today });
    if (logErr) {
      recipients.push({ user: recipient.user_id, ignored: logErr.code === "23505" ? "already_sent_today" : logErr.message });
      continue;
    }

    const text = textFor(recipient.profile?.language);
    const result = await sender.send(tokens, {
      aps: {
        alert: {
          title: text.title(senderName ?? text.someone),
          subtitle: `${competition.emoji} ${competition.name}`,
          body: text.body(senderToday),
        },
        sound: "default",
      },
      kind: "rival",
      competition_id: record.competition_id,
      sender_id: record.user_id,
      sender_today: senderToday,
    });
    recipients.push({ user: recipient.user_id, ...result });
  }
  return { senderToday, recipients };
}

// ─── Rangliste: „X hat dich bei Y auf Platz N verdrängt“ ────────────────────
// ranking_overtaken wertet nur die erste Zeile einer log_id aus; ein Satz, der
// in mehreren Challenges zählt, löst also höchstens einen Durchlauf aus.
// Höchstens ein Push pro Empfänger und Tag.
async function rankPush(
  supabase: SupabaseClient,
  sender: Sender,
  record: SetRecord,
  today: string,
): Promise<Outcome> {
  const { data, error } = await supabase.rpc("ranking_overtaken", { p_set: record.id });
  if (error) return { error: "overtaken_rpc", detail: error.message };
  const overtaken = (data ?? []) as Overtaken[];
  if (overtaken.length === 0) return { ignored: true, reason: "nobody_overtaken" };

  // Sprache der Empfänger; ohne Spalte profiles.language Deutsch
  const languages: Record<string, string | null> = {};
  const { data: langRows, error: langErr } = await supabase.from("profiles")
    .select("id, language").in("id", overtaken.map((o) => o.user_id));
  if (!langErr) for (const r of langRows ?? []) languages[r.id] = r.language;

  const recipients: Outcome[] = [];
  for (const o of overtaken) {
    const tokens = await sender.tokensOf(o.user_id);
    if (tokens.length === 0) {
      recipients.push({ user: o.user_id, ignored: "no_tokens" });
      continue;
    }
    const { error: logErr } = await supabase
      .from("push_log")
      .insert({ user_id: o.user_id, competition_id: null, kind: "rank_overtaken", day: today });
    if (logErr) {
      recipients.push({ user: o.user_id, ignored: logErr.code === "23505" ? "already_sent_today" : logErr.message });
      continue;
    }
    const text = textFor(languages[o.user_id]);
    const result = await sender.send(tokens, {
      aps: {
        alert: {
          title: text.rankTitle,
          body: text.rankBody(o.sender_name, o.category_name, o.new_rank),
        },
        sound: "default",
      },
      kind: "rank_overtaken",
      category_id: o.category_id,
    });
    recipients.push({ user: o.user_id, ...result });
  }
  return { recipients };
}
