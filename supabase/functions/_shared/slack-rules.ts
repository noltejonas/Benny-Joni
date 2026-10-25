// Regeln für den Slack-Befehl /neues (Edge Function slack-agent).
//
// Reine Funktionen wie push-rules.ts: Node testet sie direkt
// (tests/slack-rules.test.mjs), nur „löschbare“ TypeScript-Syntax.

import { berlinTime, berlinWeekStart } from "./push-rules.ts";

// Slack signiert jede Anfrage: v0=HMAC-SHA256(signing secret, "v0:<ts>:<body>").
// Älter als 5 Minuten gilt als nachgespielt.
export const SLACK_MAX_AGE_SECONDS = 300;

export async function verifySlackSignature(
  secret: string,
  timestamp: string | null,
  body: string,
  signature: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SLACK_MAX_AGE_SECONDS) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${timestamp}:${body}`)));
  const expected = "v0=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  // Vergleich in konstanter Zeit
  const a = new TextEncoder().encode(signature);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

export interface Window {
  since: Date;
  label: string;
}

// „/neues“ = letzte 24 Stunden; „heute“, „woche“ (seit Montag), „7 tage“, „48h“.
// Höchstens 90 Tage zurück.
export function parseWindow(text: string | null | undefined, now: Date = new Date()): Window | null {
  const t = String(text ?? "").trim().toLowerCase();
  const hours = (h: number, label: string): Window => ({ since: new Date(now.getTime() - h * 3600_000), label });
  if (!t) return hours(24, "in den letzten 24 Stunden");
  if (/^(heute|today)$/.test(t)) return { since: berlinMidnight(berlinTime(now).date), label: "heute" };
  if (/^(woche|kw|diese woche|week)$/.test(t)) return { since: berlinMidnight(berlinWeekStart(now)), label: "diese Woche (seit Montag)" };
  const m = t.match(/^(\d{1,3})\s*(h|std|stunden?|d|t|tage?|days?|w|wochen?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2][0];
  const h = unit === "h" || unit === "s" ? n : unit === "w" ? n * 168 : n * 24;
  if (n < 1 || h > 90 * 24) return null;
  const one: Record<string, string> = { h: "in der letzten Stunde", s: "in der letzten Stunde", w: "in der letzten Woche", d: "am letzten Tag", t: "am letzten Tag" };
  const many: Record<string, string> = { h: "Stunden", s: "Stunden", w: "Wochen", d: "Tagen", t: "Tagen" };
  const label = n === 1 ? one[unit] : `in den letzten ${n} ${many[unit]}`;
  return hours(h, label);
}

// 0 Uhr Berlin an einem Berliner Datum, als UTC-Zeitpunkt.
export function berlinMidnight(isoDate: string): Date {
  // Kandidaten UTC+1 und UTC+2; der passende ergibt in Berlin genau 0 Uhr.
  for (const offset of [2, 1]) {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCHours(d.getUTCHours() - offset);
    const b = berlinTime(d);
    if (b.date === isoDate && b.hour === 0) return d;
  }
  return new Date(`${isoDate}T00:00:00Z`);
}

export const isDemoName = (name: unknown) => /\bdemo\b/i.test(String(name ?? ""));

export interface WhatsNew {
  label: string;
  newUsers: string[];
  newChallenges: { name: string; emoji?: string | null; mode: string }[];
  joins: number;
  logs: number;
  activeUsers: number;
  topUsers: { name: string; logs: number }[];
  reactions: number;
  medals: { week: string; category: string; name: string; medal: string }[];
}

const MODES: Record<string, string> = { "1v1": "1:1", "2v2": "2:2", ffa: "Jeder gegen jeden" };
const MEDALS: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
const DASHBOARD_LINK = "<https://claude.ai/artifact/TPW3gjPshgBHyasGTMmoy9|HTML-Übersicht mit allen Nutzern und Challenges>";

// Slack-mrkdwn: &, <, > maskieren (Namen kommen von Nutzern).
export const slackEscape = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function names(list: string[], max = 8): string {
  const shown = list.slice(0, max).map(slackEscape).join(", ");
  return list.length > max ? `${shown} und ${list.length - max} weitere` : shown;
}

export function whatsNewText(d: WhatsNew): string {
  const lines = [`*Was gibt's Neues bei Benny &amp; Joni* (${slackEscape(d.label)})`];
  const nothing = !d.newUsers.length && !d.newChallenges.length && !d.joins && !d.logs && !d.reactions && !d.medals.length;
  if (nothing) {
    lines.push("Nichts Neues. Keine Anmeldungen, keine Einträge, keine Reaktionen.");
  }
  if (d.newUsers.length) lines.push(`👋 *${d.newUsers.length} neu angemeldet:* ${names(d.newUsers)}`);
  if (d.newChallenges.length) {
    const list = d.newChallenges.slice(0, 6)
      .map((c) => `${slackEscape(`${c.emoji ?? ""} ${c.name}`.trim())} (${MODES[c.mode] ?? slackEscape(c.mode)})`);
    lines.push(`🏁 *${d.newChallenges.length} neue Challenge${d.newChallenges.length === 1 ? "" : "s"}:* ${list.join(" · ")}`);
  }
  if (d.joins) lines.push(`🤝 *${d.joins} Beitritt${d.joins === 1 ? "" : "e"}* zu bestehenden Challenges`);
  if (d.logs) {
    const top = d.topUsers.length ? ` · vorne: ${d.topUsers.map((u) => `${slackEscape(u.name)} (${u.logs})`).join(", ")}` : "";
    lines.push(`💪 *${d.logs} Einträge* von ${d.activeUsers} ${d.activeUsers === 1 ? "Person" : "Personen"}${top}`);
  }
  if (d.reactions) lines.push(`🔥 *${d.reactions} Reaktion${d.reactions === 1 ? "" : "en"}* im Feed`);
  if (d.medals.length) {
    const byWeek = d.medals.map((m) => `${MEDALS[m.medal] ?? ""} ${slackEscape(m.name)} (${slackEscape(m.category)})`);
    lines.push(`🏆 *Wochenwertung abgeschlossen:* ${byWeek.slice(0, 9).join(" · ")}`);
  }
  lines.push("", DASHBOARD_LINK);
  return lines.join("\n");
}

export const HELP_TEXT = [
  "*/neues* zeigt, was in der App passiert ist:",
  "• `/neues` letzte 24 Stunden",
  "• `/neues heute`, `/neues woche` (seit Montag)",
  "• `/neues 48h`, `/neues 3 tage`, `/neues 2 wochen` (bis 90 Tage)",
  "",
  DASHBOARD_LINK,
].join("\n");
