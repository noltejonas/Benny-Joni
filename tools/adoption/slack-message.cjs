// Wochenpost fürs Team aus dem Wochenbericht (tools/adoption/report.cjs):
//
//   node tools/adoption/slack-message.cjs [Ordner mit kpis/users/challenges.json] [--mrkdwn]
//
// Gibt die Nachricht als Markdown aus (wie slack_send_message), mit --mrkdwn im
// Slack-Format für Webhooks (*fett* statt **fett**). Liest nur die JSON-Dateien,
// fragt keine Datenbank an. slack-post.cjs nutzt render().

const fs = require('node:fs');
const path = require('node:path');

function render(dir, { mrkdwn = false } = {}) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const k = read('kpis.json')[0];
  const users = read('users.json');
  const challenges = read('challenges.json');
  const DASHBOARD = 'https://claude.ai/artifact/TPW3gjPshgBHyasGTMmoy9';

  const nf = new Intl.NumberFormat('de-DE');
  const n = (v) => nf.format(Number(v) || 0);
  const signed = (v) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : '±0');

  // ISO-Kalenderwoche des Berichts (Berliner Datum)
  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }
  const stamp = new Date(k.generated_at);
  const berlin = new Date(stamp.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const dateText = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' }).format(stamp);

  const total = users.length;
  const inChallenge = users.filter((u) => Number(u.challenge_count) > 0).length;
  const firstLog = users.filter((u) => Number(u.logs) > 0).length;
  const active = users.filter((u) => Number(u.logs_7d) > 0).length;
  const pct = (x) => (total ? Math.round((x / total) * 100) : 0);

  // Review- und Testkonten zählen mit, werden aber nicht hervorgehoben.
  const isDemo = (name) => /\bdemo\b/i.test(String(name || ''));
  const real = users.filter((u) => !isDemo(u.name));

  const since = new Date(stamp.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const newcomers = real.filter((u) => u.joined && u.joined >= since).map((u) => u.name);
  const top = real.filter((u) => Number(u.logs_7d) > 0)
    .sort((a, b) => Number(b.logs_7d) - Number(a.logs_7d)).slice(0, 3)
    .map((u) => `${u.name} (${n(u.logs_7d)})`);
  const busy = challenges.filter((c) => c.status === 'läuft' && Number(c.sets_7d) > 0 && !isDemo(c.name))
    .sort((a, b) => Number(b.sets_7d) - Number(a.sets_7d)).slice(0, 3)
    .map((c) => `${c.name} (${n(c.sets_7d)})`);
  const quiet = challenges.filter((c) => c.status === 'läuft' && Number(c.members) >= 2 && !Number(c.sets_7d)).length;
  const names = (list, max = 8) => (list.length > max ? `${list.slice(0, max).join(', ')} und ${list.length - max} weitere` : list.join(', '));

  const lines = [
    `**Benny & Joni · Wochenupdate KW ${isoWeek(berlin)}** (Stand ${dateText})`,
    '',
    `👥 **${n(k.users)} Nutzer**, ${signed(k.signups_7d)} neu in 7 Tagen (Woche davor ${signed(k.signups_prev_7d)})`,
    `🔥 **${n(k.active_7d)} aktiv** in 7 Tagen, ${signed(k.active_7d - k.active_prev_7d)} zur Woche davor`,
    `💪 **${n(k.logs_7d)} Einträge** in 7 Tagen, ${signed(k.logs_7d - k.logs_prev_7d)} zur Woche davor`,
    `🏆 **${n(k.challenges_active)} laufende Challenges**, ${n(k.with_challenge)} Nutzer stecken in einer`,
    '',
    `**Aktivierung:** ${n(total)} registriert → ${n(inChallenge)} in einer Challenge (${pct(inChallenge)} %) → ${n(firstLog)} mit erstem Eintrag (${pct(firstLog)} %) → ${n(active)} aktiv (${pct(active)} %)`,
  ];
  if (top.length) lines.push(`**Am fleißigsten:** ${top.join(' · ')}`);
  if (busy.length) lines.push(`**Meiste Bewegung:** ${busy.join(' · ')}`);
  if (newcomers.length) lines.push(`**Neu dabei:** ${names(newcomers)}`);
  if (quiet) lines.push(`**Still:** ${n(quiet)} laufende Challenge${quiet === 1 ? '' : 's'} mit Mitspielern ohne Eintrag in 7 Tagen`);
  lines.push('', `HTML-Übersicht mit allen Nutzern und Challenges: ${DASHBOARD}`);

  const text = lines.join('\n');
  if (!mrkdwn) return text;
  // Slack-mrkdwn: &, <, > maskieren, **fett** wird *fett*
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '*$1*');
}

module.exports = { render };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', '..', '.local', 'adoption'));
  process.stdout.write(render(dir, { mrkdwn: args.includes('--mrkdwn') }) + '\n');
}
