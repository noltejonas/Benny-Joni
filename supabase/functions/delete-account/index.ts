// Konto löschen – Ausweichweg, falls delete_my_account() in der Datenbank nicht auf
// auth.users zugreifen darf (Fehler 42501). Die App ruft die Function dann über
// client.functions.invoke('delete-account') mit dem Token der Person auf.
//
// Ablauf: Person über den Authorization-Header bestimmen → prepare_account_deletion()
// mit IHREM Token aufrufen (Challenges verlassen, Besitz übergeben, leere Challenges
// löschen) → auth.admin.deleteUser mit dem Service-Key. Den Rest erledigt die
// Kaskade über profiles. Die Antwort enthält keine Daten.
//
// Deploy (morgens, nur wenn nötig):
//   supabase functions deploy delete-account --project-ref jczyyupxxqrdgbeifcwe
// SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY setzt Supabase selbst.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Die App läuft in der WebView (capacitor://localhost) bzw. im Browser: Preflight erlauben.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return reply(405, { error: "method_not_allowed" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "not_authenticated" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Wer ruft auf? (prüft das Token beim Auth-Server)
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return reply(401, { error: "not_authenticated" });

  // 2. Challenges verlassen – als die Person selbst, damit auth.uid() stimmt.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { error: prepErr } = await asUser.rpc("prepare_account_deletion");
  if (prepErr) {
    console.error("prepare_account_deletion", prepErr.code, prepErr.message);
    return reply(500, { error: "prepare_failed" });
  }

  // 3. Konto löschen; die Kaskade über profiles nimmt alle Daten mit.
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error("deleteUser", delErr.message);
    return reply(500, { error: "delete_failed" });
  }

  return reply(200, { ok: true });
});
