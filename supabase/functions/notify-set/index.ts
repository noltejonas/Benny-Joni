import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
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
  profile: { display_name: string } | null;
}

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

  // 1. Sender daily total in this challenge
  const { data: senderToday, error: senderErr } = await supabase.rpc(
    "user_reps_today",
    { p_user: record.user_id, p_competition: record.competition_id },
  );
  if (senderErr) {
    return Response.json({ error: "sender_rpc", detail: senderErr.message }, { status: 500 });
  }
  // Strict-greater than threshold — spec says "more than 100", not "at least 100".
  if ((senderToday ?? 0) <= RIVAL_THRESHOLD) {
    return Response.json({
      ignored: true,
      reason: "sender_below_threshold",
      senderToday,
      threshold: RIVAL_THRESHOLD,
    });
  }

  // 2. Challenge + Mitglieder. Empfänger sind die Gegner: alle anderen aktiven
  //    Mitglieder, bei 2v2 nur das andere Team.
  const [{ data: competition }, { data: members, error: memErr }] = await Promise.all([
    supabase.from("competitions").select("id, name, emoji, mode").eq("id", record.competition_id).single(),
    supabase.from("competition_members")
      .select("user_id, team, profile:user_id(display_name)")
      .eq("competition_id", record.competition_id)
      .is("left_at", null),
  ]);
  if (memErr || !competition) {
    return Response.json({ error: "members", detail: memErr?.message }, { status: 500 });
  }
  const all = (members ?? []) as unknown as Member[];
  const sender = all.find((m) => m.user_id === record.user_id);
  const senderName = sender?.profile?.display_name ?? "Jemand";
  const opponents = all.filter((m) =>
    m.user_id !== record.user_id &&
    !(competition.mode === "2v2" && sender?.team && m.team === sender.team)
  );
  if (opponents.length === 0) {
    return Response.json({ ignored: true, reason: "no_opponents" });
  }

  // 3. Today's Berlin date
  const { data: today, error: todayErr } = await supabase.rpc("berlin_today");
  if (todayErr || !today) {
    return Response.json({ error: "today_rpc", detail: todayErr?.message }, { status: 500 });
  }

  const jwt = await buildApnsJwt({
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    privateKeyPem: APNS_PRIVATE_KEY,
  });

  const outcome: Record<string, unknown>[] = [];
  const dead: string[] = [];

  for (const recipient of opponents) {
    // Nur wer heute in dieser Challenge noch bei 0 ist
    const { data: recipientToday, error: recipientErr } = await supabase.rpc(
      "user_reps_today",
      { p_user: recipient.user_id, p_competition: record.competition_id },
    );
    if (recipientErr) {
      outcome.push({ user: recipient.user_id, error: recipientErr.message });
      continue;
    }
    if ((recipientToday ?? 0) > 0) {
      outcome.push({ user: recipient.user_id, ignored: "recipient_active" });
      continue;
    }

    // Tokens BEFORE claiming the daily slot so we don't burn the slot when the
    // recipient has no device registered yet.
    const { data: tokens } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", recipient.user_id);
    const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios");
    if (iosTokens.length === 0) {
      outcome.push({ user: recipient.user_id, ignored: "no_tokens" });
      continue;
    }

    // Dedup: push_log insert claims the daily slot per recipient + challenge
    const { error: logErr } = await supabase
      .from("push_log")
      .insert({ user_id: recipient.user_id, competition_id: record.competition_id, kind: "rival", day: today });
    if (logErr) {
      outcome.push({ user: recipient.user_id, ignored: logErr.code === "23505" ? "already_sent_today" : logErr.message });
      continue;
    }

    const apsPayload = {
      aps: {
        alert: {
          title: `🔥 ${senderName} ist los`,
          subtitle: `${competition.emoji} ${competition.name}`,
          body: `Schon ${senderToday} Reps heute — du noch bei 0.`,
        },
        sound: "default",
      },
      kind: "rival",
      competition_id: record.competition_id,
      sender_id: record.user_id,
      sender_today: senderToday,
    };

    const results = await Promise.all(
      iosTokens.map((t) =>
        sendApns({
          deviceToken: t.token,
          jwt,
          bundleId: APNS_BUNDLE_ID,
          env: APNS_ENV,
          payload: apsPayload,
        })
      ),
    );
    for (const r of results) {
      if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") dead.push(r.deviceToken);
    }
    outcome.push({
      user: recipient.user_id,
      sent: results.filter((r) => r.status === 200).length,
      failures: results.filter((r) => r.status !== 200).map((r) => ({ status: r.status, reason: r.reason })),
    });
  }

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }

  return Response.json({ senderToday, cleaned: dead.length, recipients: outcome });
});
