// Wochenbericht fürs Nutzer-Dashboard: liest tools/adoption/report.sql über die
// verlinkte Supabase-CLI (nur lesen) und schreibt vier JSON-Dateien mit Zeilen:
//
//   node tools/adoption/report.cjs [Zielordner]    Standard: .local/adoption/
//
// kpis.json (eine Zeile), weeks.json, users.json, challenges.json. Der Ordner
// ist gitignored: Die Dateien enthalten Anzeigenamen und gehören nicht ins Repo.
// Voraussetzung: `npx supabase link --project-ref jczyyupxxqrdgbeifcwe` einmal
// im Repo (legt supabase/.temp an). ADOPTION_WORKDIR nimmt einen anderen
// verlinkten Ordner (z. B. für die Wochenroutine außerhalb des Repos).

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(root, '.local', 'adoption'));
const workdir = path.resolve(process.env.ADOPTION_WORKDIR || root);

const raw = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--workdir', workdir, '-o', 'json', '-f', path.join(__dirname, 'report.sql')],
  { cwd: workdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
let report = parsed.rows?.[0]?.report;
if (typeof report === 'string') report = JSON.parse(report);
if (!report?.totals) throw new Error('Bericht leer: Abfrage lieferte keine Kennzahlen');

const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : '');
const day = (v) => (v ? String(v).slice(0, 10) : null);
const MODES = { '1v1': '1:1', '2v2': '2:2', ffa: 'Jeder gegen jeden', solo: 'Freies Training' };

const files = {
  'kpis.json': [{ ...report.totals, generated_at: report.generated_at }],
  'weeks.json': report.weeks || [],
  'users.json': (report.users || []).map((u) => ({
    key: u.key, name: u.name, joined: day(u.joined), last_activity: day(u.last_activity),
    logs: u.logs, logs_7d: u.logs_7d, challenges: list(u.challenges),
    challenge_count: (u.challenges || []).length, push: list(u.platforms),
    language: u.language || '', ranking: u.ranking_opt_in ? 'ja' : 'nein',
  })),
  'challenges.json': (report.challenges || []).map((c) => ({
    key: c.key, name: [c.emoji, c.name].filter(Boolean).join(' '), mode: MODES[c.mode] || c.mode, created: day(c.created),
    status: c.archived ? 'archiviert' : 'läuft', members: c.members, people: list(c.people),
    sets: c.sets, sets_7d: c.sets_7d, last_activity: day(c.last_activity),
  })),
};

fs.mkdirSync(out, { recursive: true });
for (const [name, rows] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(rows));
}
console.log(`Bericht ${day(report.generated_at)}: ${report.totals.users} Nutzer, ${report.totals.active_7d} aktiv (7 Tage) → ${out}`);
