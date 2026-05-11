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
    return Response.json({ ignored: true });
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    // Function deployed but APNs not configured yet — accept the webhook so
    // Supabase doesn't retry, but signal config gap.
    return Response.json({ ignored: true, reason: "apns not configured" });
  }
  const record = payload.record;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Lookup category via challenge → categories
  const { data: challenge } = await supabase
    .from("weekly_challenges")
    .select("category_id")
    .eq("id", record.challenge_id)
    .maybeSingle();

  let categoryName = "Reps";
  let categoryEmoji = "💪";
  if (challenge?.category_id) {
    const { data: category } = await supabase
      .from("categories")
      .select("name, emoji")
      .eq("id", challenge.category_id)
      .maybeSingle();
    if (category) {
      categoryName = category.name ?? categoryName;
      categoryEmoji = category.emoji ?? categoryEmoji;
    }
  }

  // Recipients = every device whose athlete differs from the actor
  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .neq("athlete", record.athlete);

  const iosTokens = (tokens ?? []).filter((t) => t.platform === "ios");
  if (iosTokens.length === 0) {
    return Response.json({ sent: 0, cleaned: 0, reason: "no recipients" });
  }

  const title = `${categoryEmoji} ${record.athlete}: +${record.reps} ${categoryName}`;
  const body = record.note ? `„${record.note}"` : "";

  const apsPayload = {
    aps: {
      alert: body ? { title, body } : { title },
      sound: "default",
    },
    kind: "set",
    set_id: record.id,
    challenge_id: record.challenge_id,
    athlete: record.athlete,
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
    failures: results
      .filter((r) => r.status !== 200)
      .map((r) => ({ status: r.status, reason: r.reason })),
  });
});
