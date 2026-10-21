import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { apnsConfigFrom, apnsConfigured, buildApnsJwt, sendToDevices } from "../_shared/apns.ts";
import {
  berlinTime,
  berlinWeekStart,
  type CompetitionRow,
  flagFromEnv,
  type GoalRow,
  isQuietHour,
  isRepGoal,
  isRunning,
  type MemberRow,
  type NudgeKind,
  nudgeKindFor,
  type NudgePlan,
  planNudges,
  pushKey,
  type SetRow,
} from "../_shared/push-rules.ts";

// Tageserinnerung und „Letzte Chance“ am Sonntag.
//
// pg_cron ruft die Function stündlich auf (Migration 20261021001000_daily_nudge_cron.sql).
// Sie prüft selbst die Berliner Stunde: Mo–Sa 19 Uhr Tageserinnerung, So 18 Uhr
// „Letzte Chance“, sonst passiert nichts. Wer was bekommt, entscheidet
// planNudges() in ../_shared/push-rules.ts.
//
// Texte kommen in der Sprache der Empfänger (profiles.language, Migration
// 20261021000000_profile_language.sql); ohne Eintrag oder ohne Spalte Deutsch.
//
// DRY_RUN ist Standard: Dann werden nur die Kandidaten geloggt (Edge Functions →
// daily-nudge → Logs), es wird nichts verschickt und nichts in push_log
// geschrieben. Scharf schalten mit dem Secret DRY_RUN=false.
//
// Aufruf von Hand (immer als Probelauf):
//   curl -X POST https://<ref>.supabase.co/functions/v1/daily-nudge \
//     -H "x-webhook-secret: $NUDGE_SECRET" -H 'content-type: application/json' \
//     -d '{"force":"daily"}'      # oder "last_call"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS = apnsConfigFrom((k) => Deno.env.get(k));
// Eigenes Secret, fail closed: ohne NUDGE_SECRET läuft gar nichts.
const NUDGE_SECRET = Deno.env.get("NUDGE_SECRET") ?? "";
const DRY_RUN = flagFromEnv(Deno.env.get("DRY_RUN"), true);

const CHUNK = 100; // IDs pro .in()-Abfrage (URL-Länge)
const SEND_CONCURRENCY = 8;

const ignored = (reason: string, extra: Record<string, unknown> = {}) =>
  Response.json({ ignored: true, reason, ...extra });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!NUDGE_SECRET) {
    return Response.json({ error: "nudge_secret_missing" }, { status: 500 });
  }
  if (req.headers.get("x-webhook-secret") !== NUDGE_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { force?: unknown; dry_run?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch (_) {
    body = {};
  }

  const now = new Date();
  const t = berlinTime(now);
  const wanted = body.force;
  const force: NudgeKind | null = wanted === "daily" || wanted === "last_call" ? wanted : null;
  const kind = force ?? nudgeKindFor(t.weekday, t.hour);
  if (!kind) return ignored("not_nudge_hour", { hour: t.hour, weekday: t.weekday });

  // Erzwungene Läufe sind immer Probeläufe, damit ein Test nie alle Nutzer anschreibt.
  const dryRun = DRY_RUN || force !== null || body.dry_run === true;
  if (!dryRun && !apnsConfigured(APNS)) {
    return Response.json({ error: "apns_not_configured" }, { status: 503 });
  }
  if (!dryRun && isQuietHour(now)) return ignored("quiet_hours");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let loaded: Awaited<ReturnType<typeof loadAndPlan>>;
  try {
    loaded = await loadAndPlan(supabase, kind, t.date, berlinWeekStart(now));
  } catch (e) {
    return Response.json({ error: "load", detail: String((e as Error)?.message ?? e) }, { status: 500 });
  }
  const { plans, tokensByUser, stats } = loaded;

  if (dryRun) {
    // Nur Kandidaten loggen. Kein push_log, kein APNs.
    for (const p of plans) {
      console.log("daily-nudge DRY_RUN", JSON.stringify({
        kind: p.kind,
        user: p.user_id.slice(0, 8),
        competition: p.competition_id.slice(0, 8),
        title: p.alert.title,
        body: p.alert.body,
      }));
    }
    console.log("daily-nudge DRY_RUN summary", JSON.stringify({ kind, day: t.date, planned: plans.length, ...stats }));
    return Response.json({ dry_run: true, kind, day: t.date, planned: plans.length, ...stats });
  }

  const result = await sendPlans(supabase, plans, tokensByUser, t.date);
  console.log("daily-nudge", JSON.stringify({ kind, day: t.date, planned: plans.length, ...result }));
  return Response.json({ dry_run: false, kind, day: t.date, planned: plans.length, ...result });
});

// ── Laden und planen ────────────────────────────────────────────────────────
async function loadAndPlan(supabase: SupabaseClient, kind: NudgeKind, today: string, weekStart: string) {
  // 1. Nutzer mit iOS-Token
  const tokenRows = await fetchAll<{ user_id: string; token: string }>((from, to) =>
    supabase.from("device_tokens").select("user_id, token")
      .eq("platform", "ios").not("user_id", "is", null)
      .order("token").range(from, to)
  );
  const tokensByUser = new Map<string, string[]>();
  for (const r of tokenRows) tokensByUser.set(r.user_id, [...(tokensByUser.get(r.user_id) ?? []), r.token]);
  const tokenUsers = [...tokensByUser.keys()];
  const stats = { users_with_token: tokenUsers.length, competitions: 0, goals: 0 };
  if (!tokenUsers.length) return { plans: [] as NudgePlan[], tokensByUser, stats };

  // 2. Aktive Mitgliedschaften dieser Nutzer → laufende Challenges
  const memberships = await inChunks(tokenUsers, (ids) =>
    fetchAll<{ competition_id: string }>((from, to) =>
      supabase.from("competition_members").select("competition_id, user_id")
        .in("user_id", ids).is("left_at", null)
        .order("competition_id").order("user_id").range(from, to)
    )
  );
  const competitions = (await inChunks(unique(memberships.map((m) => m.competition_id)), (ids) =>
    fetchAll<CompetitionRow>((from, to) =>
      supabase.from("competitions").select("id, name, emoji, mode, start_date, end_date, archived_at")
        .in("id", ids).is("archived_at", null)
        .order("id").range(from, to)
    )
  )).filter((c) => isRunning(c, today));

  // 3. Ziele dieser Woche (week_start = Montag in Berlin) mit Kategorie
  //    (competition_id der Kategorie: leer = Standard-Übung, Name wird übersetzt)
  const goals = await inChunks(competitions.map((c) => c.id), (ids) =>
    fetchAll<GoalRow>((from, to) =>
      supabase.from("weekly_challenges")
        .select("id, competition_id, target_reps, category:category_id(name, competition_id, emoji, kind, challenge_type)")
        .in("competition_id", ids).eq("week_start", weekStart)
        .order("id").range(from, to)
    )
  );
  const withGoals = new Set(goals.filter(isRepGoal).map((g) => g.competition_id));
  const relevantComps = competitions.filter((c) => withGoals.has(c.id));
  const relevantGoals = goals.filter((g) => withGoals.has(g.competition_id));
  stats.competitions = relevantComps.length;
  stats.goals = relevantGoals.length;
  if (!relevantComps.length) return { plans: [] as NudgePlan[], tokensByUser, stats };

  // 4. Alle Mitglieder dieser Challenges, auch ausgetretene (Teilnehmer der Woche)
  const loadMembers = (profileCols: string) =>
    inChunks(relevantComps.map((c) => c.id), (ids) =>
      fetchAll<{
        competition_id: string;
        user_id: string;
        team: string | null;
        joined_at: string | null;
        left_at: string | null;
        profile: { display_name: string | null; main_competition_id: string | null; language?: string | null } | null;
      }>((from, to) =>
        supabase.from("competition_members")
          .select(`competition_id, user_id, team, joined_at, left_at, profile:user_id(${profileCols})`)
          .in("competition_id", ids)
          .order("competition_id").order("user_id").range(from, to)
      )
    );
  let memberRows: Awaited<ReturnType<typeof loadMembers>>;
  try {
    memberRows = await loadMembers("display_name, main_competition_id, language");
  } catch (e) {
    // Ohne Spalte profiles.language (Migration noch nicht eingespielt) wie bisher
    // laden; die Texte sind dann Deutsch.
    if (!/language/.test(String((e as Error)?.message ?? e))) throw e;
    memberRows = await loadMembers("display_name, main_competition_id");
  }
  const members: MemberRow[] = memberRows.map((m) => ({
    competition_id: m.competition_id,
    user_id: m.user_id,
    team: m.team,
    joined_at: m.joined_at,
    left_at: m.left_at,
    display_name: m.profile?.display_name ?? null,
    main_competition_id: m.profile?.main_competition_id ?? null,
    language: m.profile?.language ?? null,
  }));

  // 5. Sätze zu den Zielen dieser Woche (Wochenanteil und „heute schon was?“)
  const sets = await inChunks(relevantGoals.map((g) => g.id), (ids) =>
    fetchAll<SetRow>((from, to) =>
      supabase.from("sets").select("user_id, competition_id, challenge_id, reps, created_at")
        .in("challenge_id", ids)
        .order("id").range(from, to)
    )
  );

  // 6. Heute schon eine Mitteilung in dieser Challenge, egal welcher Art?
  const pushedRows = await inChunks(tokenUsers, (ids) =>
    fetchAll<{ user_id: string; competition_id: string }>((from, to) =>
      supabase.from("push_log").select("user_id, competition_id")
        .eq("day", today).in("user_id", ids).not("competition_id", "is", null)
        .order("user_id").order("competition_id").order("kind").range(from, to)
    )
  );

  const plans = planNudges({
    kind,
    today,
    weekStart,
    tokenUsers,
    competitions: relevantComps,
    members,
    goals: relevantGoals,
    sets,
    alreadyPushed: pushedRows.map((r) => pushKey(r.user_id, r.competition_id)),
  });
  return { plans, tokensByUser, stats };
}

// ── Verschicken (nur außerhalb des DRY_RUN) ─────────────────────────────────
async function sendPlans(
  supabase: SupabaseClient,
  plans: NudgePlan[],
  tokensByUser: Map<string, string[]>,
  today: string,
) {
  const jwt = await buildApnsJwt({ keyId: APNS.keyId, teamId: APNS.teamId, privateKeyPem: APNS.privateKeyPem });
  let sent = 0;
  const skipped: Record<string, number> = {};
  const failures: Record<string, number> = {};
  const dead: string[] = [];
  const count = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1; };

  await forEachLimit(plans, SEND_CONCURRENCY, async (p) => {
    const tokens = tokensByUser.get(p.user_id) ?? [];
    if (!tokens.length) return count(skipped, "no_tokens");
    // Platz für heute belegen. Mit push_log_one_per_day_idx scheitert das auch,
    // wenn inzwischen eine Mitteilung anderer Art (z. B. Rivale) rausging.
    const { error } = await supabase
      .from("push_log")
      .insert({ user_id: p.user_id, competition_id: p.competition_id, kind: p.kind, day: today });
    if (error) return count(skipped, error.code === "23505" ? "already_sent_today" : "log_error");

    const r = await sendToDevices(APNS, jwt, tokens, {
      aps: { alert: p.alert, sound: "default" },
      kind: p.kind,
      competition_id: p.competition_id,
    });
    sent += r.sent;
    dead.push(...r.dead);
    for (const f of r.failures) count(failures, `${f.status}${f.reason ? ` ${f.reason}` : ""}`);
  });

  if (dead.length > 0) {
    await supabase.from("device_tokens").delete().in("token", dead);
  }
  return { sent, skipped, failures, cleaned: dead.length };
}

// ── Helfer ───────────────────────────────────────────────────────────────────
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Liest seitenweise, bis eine leere Seite kommt. So geht nichts verloren, auch
// wenn das Projekt weniger als 1000 Zeilen pro Antwort erlaubt (max_rows).
async function fetchAll<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 1_000_000;) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    from += data.length;
  }
  return out;
}

async function inChunks<T>(ids: string[], load: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await load(ids.slice(i, i + CHUNK))));
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.warn("daily-nudge send failed", String((e as Error)?.message ?? e));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
