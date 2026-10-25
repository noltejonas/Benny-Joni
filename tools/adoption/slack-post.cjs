// Schickt den Wochenpost (slack-message.cjs) per Slack-Incoming-Webhook:
//
//   node tools/adoption/slack-post.cjs <Datenordner> [--dry-run]
//
// Die Webhook-URL steht in einer Datei, nie im Repo und nie in der Ausgabe:
// SLACK_WEBHOOK_FILE oder <Datenordner>/../slack-webhook-url. Mit --dry-run wird
// nur die Nachricht gezeigt und geprüft, ob die URL-Datei passt.

const fs = require('node:fs');
const path = require('node:path');
const { render } = require('./slack-message.cjs');

const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', '..', '.local', 'adoption'));
const dryRun = args.includes('--dry-run');
const file = path.resolve(process.env.SLACK_WEBHOOK_FILE || path.join(dir, '..', 'slack-webhook-url'));

const text = render(dir, { mrkdwn: true });
let url = '';
try { url = fs.readFileSync(file, 'utf8').trim(); } catch { /* fehlt */ }
const valid = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url);

if (dryRun) {
  process.stdout.write(text + '\n\n');
  console.log(valid ? 'Webhook-Datei gefunden und gültig.' : `Webhook-Datei fehlt oder ist ungültig: ${file}`);
  process.exit(0);
}
if (!valid) {
  console.error(`Webhook-Datei fehlt oder ist ungültig: ${file}`);
  process.exit(2);
}

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
}).then(async (res) => {
  const body = (await res.text()).slice(0, 80);
  if (!res.ok) { console.error(`Slack lehnte ab: ${res.status} ${body}`); process.exit(1); }
  console.log('Wochenpost gesendet.');
}).catch((e) => { console.error(`Senden fehlgeschlagen: ${e.message}`); process.exit(1); });
