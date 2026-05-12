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
  athlete: string;
  reps: number;
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

// Binary by design — the app is hard-wired to two athletes. If a third
// athlete is ever added, recipient resolution must move to a pair/challenge
// model rather than extending this helper.
function otherAthlete(name: string): string {
  if (name === "Benny") return "Jonas";
  if (name === "Jonas") return "Benny";
  throw new Error(`unknown athlete: ${name}`);
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
    return Response.json({ ignored: true, reason: "apns_not_configured" });
  }

  const record = payload.record;
  const recipient = otherAthlete(record.athlete);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Sender daily total
  const { data: senderToday, error: senderErr } = await supabase.rpc(
    "athlete_reps_today",
    { p_athlete: record.athlete },
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

  // 2. Recipient daily total
  const { data: recipientToday, error: recipientErr } = await supabase.rpc(
    "athlete_reps_today",
    { p_athlete: recipient },
  );
  if (recipientErr) {
    return Response.json({ error: "recipient_rpc", detail: recipientErr.message }, { status: 500 });
  }
  if ((recipientToday ?? 0) > 0) {
    return Response.json({
      ignored: true,
      reason: "recipient_active",
      recipientToday,
    });
  }

  // 3. Today's Berlin date
  const { data: today, error: todayErr } = await supabase.rpc("berlin_today");
  if (todayErr || !today) {
    return Response.json({ error: "today_rpc", detail: todayErr?.message }, { status: 500 });
  }

  // 4. Dedup: push_log insert claims the daily slot
  const { error: logErr } = await supabase
    .from("push_log")
    .insert({ athlete: recipient, kind: "rival", day: today });
  if (logErr) {
    if (logErr.code === "23505") {
      return Response.json({ ignored: true, reason: "already_sent_today" });
    }
    return Response.json({ error: "log_insert", detail: logErr.message }, { status: 500 });
  }

  // 5. Recipient tokens
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .eq("athlete", recipient);

  const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios");
  if (iosTokens.length === 0) {
    return Response.json({
      sent: 0,
      cleaned: 0,
      attempted: 0,
      senderToday,
      failures: [],
      reason: "no_recipient_tokens",
      logged: true,
    });
  }

  // 6. APNs push
  const title = `🔥 ${record.athlete} ist los`;
  const body = `Schon ${senderToday} Reps heute — du noch bei 0.`;

  const apsPayload = {
    aps: {
      alert: { title, body },
      sound: "default",
    },
    kind: "rival",
    athlete: record.athlete,
    sender_today: senderToday,
  };

  const jwt = await buildApnsJwt({
    keyId: APNS_KEY_ID,
    teamId: APNS_TEAM_ID,
    privateKeyPem: APNS_PRIVATE_KEY,
  });

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

  const dead = results
    .filter((r) =>
      r.status === 410 ||
      r.reason === "BadDeviceToken" ||
      r.reason === "Unregistered"
    )
    .map((r) => r.deviceToken);

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }

  const sent = results.filter((r) => r.status === 200).length;
  return Response.json({
    sent,
    cleaned: dead.length,
    attempted: results.length,
    senderToday,
    failures: results
      .filter((r) => r.status !== 200)
      .map((r) => ({ status: r.status, reason: r.reason })),
  });
});
