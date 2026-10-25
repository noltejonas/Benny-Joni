import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { HELP_TEXT, isDemoName, parseWindow, slackEscape, verifySlackSignature, type WhatsNew, whatsNewText } from "../_shared/slack-rules.ts";

// Slack-Befehl /neues im Benny-&-Joni-Workspace: Was ist seit … in der App
// passiert? Liest die Datenbank nur (Service-Rolle) und antwortet im Channel.
//
// Einrichtung (docs/launch/SLACK_AGENT.md):
//   supabase functions deploy slack-agent --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
//   SLACK_SIGNING_SECRET  aus der Slack-App (Basic Information), Pflicht
//   SLACK_TEAM_ID         optional: nur Anfragen aus diesem Workspace (T…)
// Ohne Signing Secret bleibt die Funktion zu.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";
const TEAM_ID = Deno.env.get("SLACK_TEAM_ID") ?? "";

const reply = (text: string, inChannel = true) =>
  Response.json({ response_type: inChannel ? "in_channel" : "ephemeral", text });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();
  const ok = await verifySlackSignature(
    SIGNING_SECRET,
    req.headers.get("x-slack-request-timestamp"),
    body,
    req.headers.get("x-slack-signature"),
  );
  if (!ok) return new Response("unauthorized", { status: 401 });

  const form = new URLSearchParams(body);
  if (TEAM_ID && form.get("team_id") !== TEAM_ID) return reply("Dieser Befehl ist nur für den Benny-&amp;-Joni-Workspace.", false);
  const text = (form.get("text") ?? "").trim();
  if (/^(hilfe|help|\?)$/i.test(text)) return reply(HELP_TEXT, false);
  const window = parseWindow(text);
  if (!window) return reply(`Den Zeitraum „${slackEscape(text)}“ kenne ich nicht.\n\n${HELP_TEXT}`, false);

  try {
    const data = await whatsNew(createClient(SUPABASE_URL, SERVICE_KEY), window.since, window.label);
    return reply(whatsNewText(data));
  } catch (e) {
    console.error("slack-agent", String((e as Error)?.message ?? e));
    return reply("Die Datenbank hat gerade nicht geantwortet. Versuch es gleich noch einmal.", false);
  }
});

async function whatsNew(supabase: SupabaseClient, since: Date, label: string): Promise<WhatsNew> {
  const iso = since.toISOString();
  const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return (r.data ?? []) as T;
  };
  const [profiles, comps, joins, sets, reactions, closures] = await Promise.all([
    supabase.from("profiles").select("id, display_name, created_at, ranking_opt_in"),
    supabase.from("competitions").select("name, emoji, mode, created_at").gte("created_at", iso).neq("mode", "solo").order("created_at"),
    supabase.from("competition_members").select("user_id, role").gte("joined_at", iso).neq("role", "owner").is("left_at", null),
    supabase.from("sets").select("user_id, log_id, created_at").gte("created_at", iso).not("user_id", "is", null).limit(5000),
    supabase.from("reactions").select("id", { count: "exact", head: true }).gte("created_at", iso).not("user_id", "is", null),
    supabase.from("ranking_week_closures").select("week, closed_at").gte("closed_at", iso),
  ]).then((rs) => rs as unknown as { data: unknown; error: { message: string } | null; count?: number | null }[]);

  const people = must(profiles) as { id: string; display_name: string; created_at: string; ranking_opt_in: boolean }[];
  const nameOf = new Map(people.map((p) => [p.id, p.display_name]));

  // Ein Eintrag zählt einmal, auch wenn er in mehreren Challenges steht.
  const seen = new Set<string>();
  const perUser = new Map<string, number>();
  for (const s of must(sets) as { user_id: string; log_id: string | null; created_at: string }[]) {
    const key = s.log_id ?? `${s.user_id}:${s.created_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    perUser.set(s.user_id, (perUser.get(s.user_id) ?? 0) + 1);
  }
  const topUsers = [...perUser.entries()]
    .map(([id, logs]) => ({ name: nameOf.get(id) ?? "?", logs }))
    .filter((u) => !isDemoName(u.name))
    .sort((a, b) => b.logs - a.logs).slice(0, 3);

  // Medaillen nur von Personen, die in der Rangliste sichtbar sein wollen.
  const weeks = (must(closures) as { week: string }[]).map((c) => c.week);
  let medals: WhatsNew["medals"] = [];
  if (weeks.length) {
    const [{ data: results, error }, { data: cats }] = await Promise.all([
      supabase.from("weekly_results").select("week, category_id, user_id, medal").in("week", weeks).not("medal", "is", null),
      supabase.from("categories").select("id, name").is("competition_id", null),
    ]);
    if (error) throw new Error(error.message);
    const catName = new Map((cats ?? []).map((c: { id: string; name: string }) => [String(c.id), c.name]));
    const visible = new Set(people.filter((p) => p.ranking_opt_in).map((p) => p.id));
    const order: Record<string, number> = { gold: 0, silver: 1, bronze: 2 };
    medals = (results ?? [])
      .filter((r: { user_id: string }) => visible.has(r.user_id))
      .sort((a: { medal: string }, b: { medal: string }) => order[a.medal] - order[b.medal])
      .map((r: { week: string; category_id: string; user_id: string; medal: string }) => ({
        week: r.week, category: catName.get(String(r.category_id)) ?? "?", name: nameOf.get(r.user_id) ?? "?", medal: r.medal,
      }));
  }

  return {
    label,
    newUsers: people.filter((p) => p.created_at >= iso && !isDemoName(p.display_name))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => p.display_name),
    newChallenges: (must(comps) as WhatsNew["newChallenges"]).filter((c) => !isDemoName(c.name)),
    joins: (must(joins) as unknown[]).length,
    logs: seen.size,
    activeUsers: perUser.size,
    topUsers,
    reactions: (reactions as { count?: number | null }).count ?? 0,
    medals,
  };
}
