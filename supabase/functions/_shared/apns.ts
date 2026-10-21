// APNs HTTP/2 sender + ES256 JWT signer for Supabase Edge Functions.
// Gemeinsam genutzt von notify-set und daily-nudge (vorher notify-set/apns.ts).

const APNS_PROD = "https://api.push.apple.com";
const APNS_DEV = "https://api.development.push.apple.com";

interface JwtOptions {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
}

let cachedJwt: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importApnsKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pemToPkcs8(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export async function buildApnsJwt(opts: JwtOptions): Promise<string> {
  // APNs JWTs may be reused for up to 1h; cache for ~50min to be safe.
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token;

  const header = { alg: "ES256", kid: opts.keyId };
  const payload = { iss: opts.teamId, iat: now };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const key = await importApnsKey(opts.privateKeyPem);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(data),
  );
  const sigB64 = base64UrlEncode(sig);

  const token = `${data}.${sigB64}`;
  cachedJwt = { token, expiresAt: now + 50 * 60 };
  return token;
}

export interface ApnsSendInput {
  deviceToken: string;
  jwt: string;
  bundleId: string;
  env: "production" | "development";
  payload: Record<string, unknown>;
}

export interface ApnsSendResult {
  deviceToken: string;
  status: number;
  body: string;
  reason?: string;
}

export async function sendApns(input: ApnsSendInput): Promise<ApnsSendResult> {
  const host = input.env === "production" ? APNS_PROD : APNS_DEV;
  const url = `${host}/3/device/${input.deviceToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${input.jwt}`,
      "apns-topic": input.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });
  const body = await res.text();
  let reason: string | undefined;
  try {
    reason = body ? JSON.parse(body).reason : undefined;
  } catch (_) {
    /* ignore non-JSON */
  }
  return { deviceToken: input.deviceToken, status: res.status, body, reason };
}

// ── Gemeinsame Helfer für notify-set und daily-nudge ────────────────────────
export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKeyPem: string;
  bundleId: string;
  env: "production" | "development";
}

// Liest die APNs-Secrets. `get` ist z. B. (k) => Deno.env.get(k).
// TestFlight- und App-Store-Builds brauchen APNS_ENV=production.
export function apnsConfigFrom(get: (key: string) => string | undefined): ApnsConfig {
  return {
    keyId: get("APNS_KEY_ID") ?? "",
    teamId: get("APNS_TEAM_ID") ?? "",
    privateKeyPem: get("APNS_PRIVATE_KEY") ?? "",
    bundleId: get("APNS_BUNDLE_ID") ?? "com.bennyjoni.terminator",
    env: get("APNS_ENV") === "development" ? "development" : "production",
  };
}

export function apnsConfigured(cfg: ApnsConfig): boolean {
  return Boolean(cfg.keyId && cfg.teamId && cfg.privateKeyPem);
}

export interface DeviceSendResult {
  sent: number;
  failures: { status: number; reason?: string }[];
  dead: string[]; // Tokens, die APNs nicht mehr kennt → aus device_tokens löschen
}

// Schickt eine Mitteilung an alle Geräte eines Empfängers.
export async function sendToDevices(
  cfg: ApnsConfig,
  jwt: string,
  deviceTokens: string[],
  payload: Record<string, unknown>,
): Promise<DeviceSendResult> {
  const results = await Promise.all(
    deviceTokens.map((deviceToken) =>
      sendApns({ deviceToken, jwt, bundleId: cfg.bundleId, env: cfg.env, payload }).catch((e) => ({
        deviceToken,
        status: 0,
        body: String(e),
        reason: "network_error",
      }))
    ),
  );
  return {
    sent: results.filter((r) => r.status === 200).length,
    failures: results.filter((r) => r.status !== 200).map((r) => ({ status: r.status, reason: r.reason })),
    dead: results
      .filter((r) => r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered")
      .map((r) => r.deviceToken),
  };
}
