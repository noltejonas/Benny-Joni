// Rangliste: Push zum Wochenende (Wochenwertung, Migration
// 20261024130000_weekly_ranking) bzw. ohne diese Migration zum Monatsende.
// Läuft stündlich (Cron, siehe docs/RANKING_SETUP.md) und ist idempotent,
// Dedup über push_log.
//
// 1. Fällige Wochen abschließen (close_due_weeks, wie der pg_cron-Job; ohne
//    Migration close_due_months).
// 2. Abschluss (bis 48 h danach): „KW 43: 🥇 Klimmzüge · 🥉 Dips · 40 Punkte“
//    an alle mit Punkten, einmal pro Woche bzw. Monat.
// 3. Sonntag (bzw. letzter Tag des Monats) ab 18 Uhr: „Dir fehlen 18 Liegestütze
//    bis Platz 2“, einmal pro Person, nur wenn der Abstand höchstens 20 % des
//    eigenen Werts ist.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildApnsJwt, sendApns } from "../notify-set/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.bennyjoni.terminator";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_ENV = (Deno.env.get("APNS_ENV") ?? "production") as "production" | "development";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const MEDAL: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };

// Texte je App-Sprache (profiles.language, Migration 20261021000000); ohne
// Eintrag oder ohne Spalte Deutsch. Standard-Übungen heißen in der Datenbank
// deutsch, die drei mit eigenem englischen Namen werden übersetzt.
const TEXT = {
  de: {
    locale: "de-DE",
    category: (name: string) => name,
    rounds: (n: number) => `${n} ${n === 1 ? "Runde" : "Runden"}`,
    points: (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`,
    closedTitle: (month: string) => `🏆 ${month} ist abgeschlossen`,
    weekTitle: (kw: number) => `🏆 KW ${kw} ist abgeschlossen`,
    closedBody: (medals: string, points: string) => medals ? `${medals} · ${points}` : `${points} in der Rangliste`,
    lastDayTitle: "⏳ Letzter Tag im Monat",
    lastWeekDayTitle: "⏳ Letzter Tag der Woche",
    lastDayBody: (need: string, rank: number) => `Dir fehlen ${need} bis Platz ${rank}.`,
  },
  en: {
    locale: "en-GB",
    category: (name: string) => ({ "Liegestütze": "Push-ups", "Klimmzüge": "Pull-ups", "Kniebeugen": "Squats" } as Record<string, string>)[name] ?? name,
    rounds: (n: number) => `${n} ${n === 1 ? "round" : "rounds"}`,
    points: (n: number) => `${n} ${n === 1 ? "point" : "points"}`,
    closedTitle: (month: string) => `🏆 ${month} is closed`,
    weekTitle: (kw: number) => `🏆 Week ${kw} is closed`,
    closedBody: (medals: string, points: string) => medals ? `${medals} · ${points}` : `${points} on the leaderboard`,
    lastDayTitle: "⏳ Last day of the month",
    lastWeekDayTitle: "⏳ Last day of the week",
    lastDayBody: (need: string, rank: number) => `${need} to go for #${rank}.`,
  },
};
type Lang = keyof typeof TEXT;
const textFor = (lang: string | null | undefined) => TEXT[(lang ?? "de") as Lang] ?? TEXT.de;
const LAST_DAY_HOUR = 18;
const LAST_DAY_MAX_GAP = 0.2;

interface Category { id: string; name: string; challenge_type: string; metric: string }
interface LiveRow { category_id: string; user_id: string; value: number; rank: number; points: number }
interface ResultRow { category_id: string; user_id: string; rank: number; points: number; medal: string | null }

// Datum und Stunde in Berlin
function berlinNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7;   // 0 = Montag
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}-01`,
    week: new Date(day.getTime() - dow * 86400000).toISOString().slice(0, 10),
    hour: Number(parts.hour),
    isLastDay: new Date(Date.UTC(y, m, 0)).getUTCDate() === d,
    isSunday: dow === 6,
  };
}

// ISO-Kalenderwoche einer Woche (Montag, YYYY-MM-DD)
function weekNumber(week: string) {
  const t = new Date(`${week}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 3);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
  return 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

// RPC fehlt (Migration nicht eingespielt)
const missingRpc = (e: { code?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883");

type Text = (typeof TEXT)[Lang];
const monthName = (t: Text, month: string) =>
  new Date(`${month}T12:00:00Z`).toLocaleDateString(t.locale, { month: "long", timeZone: "UTC" });
const fmtValue = (t: Text, cat: Category, v: number) =>
  cat.challenge_type === "bring_sally_up" ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
  : cat.challenge_type === "tom_holland" ? t.rounds(v)
  : `${v.toLocaleString(t.locale)} ${t.category(cat.name)}`;

// Sprache pro User; ohne Spalte profiles.language (Migration fehlt) Deutsch
async function languagesOf(supabase: SupabaseClient, userIds: string[]) {
  const out: Record<string, string | null> = {};
  if (!userIds.length) return out;
  const { data, error } = await supabase.from("profiles").select("id, language").in("id", userIds);
  if (!error) for (const r of data ?? []) out[r.id] = r.language;
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = berlinNow();

  // Wochenwertung, wenn die Migration da ist, sonst Monatswertung
  let weekly = true;
  let { data: closed, error: closeErr } = await supabase.rpc("close_due_weeks");
  if (missingRpc(closeErr)) {
    weekly = false;
    ({ data: closed, error: closeErr } = await supabase.rpc("close_due_months"));
  }
  if (closeErr) {
    const fn = weekly ? "close_due_weeks" : "close_due_months";
    return Response.json({ error: fn, detail: closeErr.message }, { status: 500 });
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    return Response.json({ closed, error: "apns_not_configured" }, { status: 503 });
  }
  const { data: cats } = await supabase.from("categories").select("id, name, challenge_type, metric")
    .is("competition_id", null).eq("ranked", true);
  const catById = Object.fromEntries(((cats ?? []) as Category[]).map((c) => [String(c.id), c]));

  const push = new Pusher(supabase);
  if (weekly) {
    const weekClosed = await weekClosedPush(supabase, push, catById);
    const lastDay = now.isSunday && now.hour >= LAST_DAY_HOUR
      ? await lastDayPush(supabase, push, catById, now, true)
      : { ignored: true, reason: "not_sunday_evening" };
    const cleaned = await push.cleanup();
    return Response.json({ mode: "weekly", closed, weekClosed, lastDay, cleaned });
  }
  const monthClosed = await monthClosedPush(supabase, push, catById);
  const lastDay = now.isLastDay && now.hour >= LAST_DAY_HOUR
    ? await lastDayPush(supabase, push, catById, now, false)
    : { ignored: true, reason: "not_last_day_evening" };
  const cleaned = await push.cleanup();
  return Response.json({ mode: "monthly", closed, monthClosed, lastDay, cleaned });
});

class Pusher {
  private dead: string[] = [];
  private jwt: string | null = null;
  constructor(private supabase: SupabaseClient) {}

  // Ein Push pro (User, Art, Tag/Monat): Slot erst belegen, wenn es Geräte gibt
  async once(userId: string, kind: string, day: string, aps: Record<string, unknown>) {
    const { data: tokens } = await this.supabase.from("device_tokens").select("token, platform").eq("user_id", userId);
    const ios = (tokens ?? []).filter((t) => t.platform === "ios").map((t) => t.token);
    if (!ios.length) return { user: userId, ignored: "no_tokens" };
    const { error } = await this.supabase.from("push_log").insert({ user_id: userId, competition_id: null, kind, day });
    if (error) return { user: userId, ignored: error.code === "23505" ? "already_sent" : error.message };
    this.jwt ??= await buildApnsJwt({ keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, privateKeyPem: APNS_PRIVATE_KEY });
    const results = await Promise.all(ios.map((deviceToken) =>
      sendApns({ deviceToken, jwt: this.jwt!, bundleId: APNS_BUNDLE_ID, env: APNS_ENV, payload: aps })));
    for (const r of results) {
      if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") this.dead.push(r.deviceToken);
    }
    return { user: userId, sent: results.filter((r) => r.status === 200).length };
  }

  async cleanup() {
    if (this.dead.length) await this.supabase.from("device_tokens").delete().in("token", this.dead);
    return this.dead.length;
  }
}

// Ergebnis-Push an alle mit Punkten in einem abgeschlossenen Zeitraum
async function closedPush(
  supabase: SupabaseClient, push: Pusher, catById: Record<string, Category>, results: ResultRow[],
  kind: string, day: string, title: (t: Text) => string, extra: Record<string, unknown>,
) {
  const out: Record<string, unknown>[] = [];
  const byUser: Record<string, ResultRow[]> = {};
  for (const r of results) (byUser[r.user_id] ||= []).push(r);
  const langs = await languagesOf(supabase, Object.keys(byUser));
  for (const [userId, rows] of Object.entries(byUser)) {
    const t = textFor(langs[userId]);
    rows.sort((a, b) => a.rank - b.rank);
    const points = rows.reduce((a, r) => a + r.points, 0);
    const medals = rows.filter((r) => r.medal).slice(0, 3)
      .map((r) => `${MEDAL[r.medal!]} ${t.category(catById[r.category_id]?.name ?? "")}`);
    out.push(await push.once(userId, kind, day, {
      aps: {
        alert: { title: title(t), body: t.closedBody(medals.join(" · "), t.points(points)) },
        sound: "default",
      },
      kind, ...extra,
    }));
  }
  return out;
}

async function weekClosedPush(supabase: SupabaseClient, push: Pusher, catById: Record<string, Category>) {
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: closures } = await supabase.from("ranking_week_closures").select("week").gte("closed_at", since);
  const out: Record<string, unknown>[] = [];
  for (const { week } of closures ?? []) {
    const { data } = await supabase.from("weekly_results").select("category_id, user_id, rank, points, medal")
      .eq("week", week).gt("points", 0);
    out.push(...await closedPush(supabase, push, catById, (data ?? []) as ResultRow[],
      "week_closed", week, (t) => t.weekTitle(weekNumber(week)), { week }));
  }
  return out;
}

async function monthClosedPush(supabase: SupabaseClient, push: Pusher, catById: Record<string, Category>) {
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: closures } = await supabase.from("month_closures").select("month").gte("closed_at", since);
  const out: Record<string, unknown>[] = [];
  for (const { month } of closures ?? []) {
    const { data } = await supabase.from("monthly_results").select("category_id, user_id, rank, points, medal")
      .eq("month", month).gt("points", 0);
    out.push(...await closedPush(supabase, push, catById, (data ?? []) as ResultRow[],
      "month_closed", month, (t) => t.closedTitle(monthName(t, month)), { month }));
  }
  return out;
}

async function lastDayPush(
  supabase: SupabaseClient, push: Pusher, catById: Record<string, Category>, now: ReturnType<typeof berlinNow>,
  weekly: boolean,
) {
  const { data, error } = weekly
    ? await supabase.rpc("ranking_week_live", { p_week: now.week, p_exclude_log: null })
    : await supabase.rpc("ranking_live", { p_month: now.month, p_exclude_log: null });
  if (error) return { error: weekly ? "ranking_week_live" : "ranking_live", detail: error.message };
  const rows = (data ?? []) as LiveRow[];
  // Pro User die Übung mit dem relativ kleinsten Abstand nach oben
  const best: Record<string, { cat: Category; need: number; rank: number; ratio: number }> = {};
  for (const r of rows) {
    const cat = catById[r.category_id];
    if (!cat || r.rank === 1) continue;
    const above = rows.filter((x) => x.category_id === r.category_id && x.value > r.value);
    const target = Math.min(...above.map((x) => x.value));
    const need = target - r.value;
    const ratio = need / Math.max(r.value, 1);
    if (ratio > LAST_DAY_MAX_GAP) continue;
    const rank = 1 + rows.filter((x) => x.category_id === r.category_id && x.value > target).length;
    if (!best[r.user_id] || ratio < best[r.user_id].ratio) best[r.user_id] = { cat, need, rank, ratio };
  }
  const out: Record<string, unknown>[] = [];
  const langs = await languagesOf(supabase, Object.keys(best));
  for (const [userId, b] of Object.entries(best)) {
    const t = textFor(langs[userId]);
    const kind = weekly ? "week_last_day" : "month_last_day";
    out.push(await push.once(userId, kind, now.today, {
      aps: {
        alert: { title: weekly ? t.lastWeekDayTitle : t.lastDayTitle, body: t.lastDayBody(fmtValue(t, b.cat, b.need), b.rank) },
        sound: "default",
      },
      kind, category_id: b.cat.id,
    }));
  }
  return out;
}
