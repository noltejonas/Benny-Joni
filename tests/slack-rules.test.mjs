// Prüft die Regeln für den Slack-Befehl /neues (supabase/functions/_shared/slack-rules.ts)
// ohne Deno, wie tests/push-rules.test.mjs. Aufruf: node --test tests/slack-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fn = (p) => join(root, 'supabase', 'functions', p);
const dataUrl = (js) => 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
const pushJs = stripTypeScriptTypes(readFileSync(fn('_shared/push-rules.ts'), 'utf8'));
const slackJs = stripTypeScriptTypes(readFileSync(fn('_shared/slack-rules.ts'), 'utf8'))
  .replace('"./push-rules.ts"', JSON.stringify(dataUrl(pushJs)));
const S = await import(dataUrl(slackJs));

const sign = (secret, ts, body) => 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');

test('verifySlackSignature: gültig, falsch, zu alt, ohne Secret', async () => {
  const body = 'command=%2Fneues&text=woche';
  const ts = '1793000000';
  const ok = sign('geheim', ts, body);
  assert.equal(await S.verifySlackSignature('geheim', ts, body, ok, 1793000010), true);
  assert.equal(await S.verifySlackSignature('anders', ts, body, ok, 1793000010), false);
  assert.equal(await S.verifySlackSignature('geheim', ts, body + 'x', ok, 1793000010), false);
  assert.equal(await S.verifySlackSignature('geheim', ts, body, ok, 1793000000 + 301), false);
  assert.equal(await S.verifySlackSignature('', ts, body, ok, 1793000010), false);
  assert.equal(await S.verifySlackSignature('geheim', null, body, ok, 1793000010), false);
});

test('parseWindow: Standard 24 h, heute, Woche, Zahlen, Grenzen', () => {
  const now = new Date('2026-10-25T10:00:00Z'); // Sonntag, 11 Uhr Berlin (Winterzeit)
  const h = (w) => (now - w.since) / 3600_000;
  assert.equal(h(S.parseWindow('', now)), 24);
  assert.equal(S.parseWindow('heute', now).since.toISOString(), '2026-10-24T22:00:00.000Z');
  // Montag 19.10. 0 Uhr Berlin = 18.10. 22 Uhr UTC (Sommerzeit)
  assert.equal(S.parseWindow('woche', now).since.toISOString(), '2026-10-18T22:00:00.000Z');
  assert.equal(h(S.parseWindow('48h', now)), 48);
  assert.equal(h(S.parseWindow('3 tage', now)), 72);
  assert.equal(h(S.parseWindow('2 wochen', now)), 336);
  assert.equal(S.parseWindow('1 tag', now).label, 'am letzten Tag');
  assert.equal(S.parseWindow('3 tage', now).label, 'in den letzten 3 Tagen');
  assert.equal(S.parseWindow('100 tage', now), null);
  assert.equal(S.parseWindow('irgendwas', now), null);
});

test('whatsNewText: Inhalte, Maskierung, nichts Neues', () => {
  const text = S.whatsNewText({
    label: 'in den letzten 24 Stunden',
    newUsers: ['Eva', 'Tom <x>'],
    newChallenges: [{ name: 'Duell', emoji: '⚔️', mode: '1v1' }],
    joins: 1, logs: 12, activeUsers: 3, topUsers: [{ name: 'Benny', logs: 5 }],
    reactions: 4, medals: [{ week: '2026-10-19', category: 'Liegestütze', name: 'Jonas', medal: 'gold' }],
  });
  assert.match(text, /^\*Was gibt's Neues bei Benny &amp; Joni\* \(in den letzten 24 Stunden\)/);
  assert.match(text, /👋 \*2 neu angemeldet:\* Eva, Tom &lt;x&gt;/);
  assert.match(text, /🏁 \*1 neue Challenge:\* ⚔️ Duell \(1:1\)/);
  assert.match(text, /🤝 \*1 Beitritt\*/);
  assert.match(text, /💪 \*12 Einträge\* von 3 Personen · vorne: Benny \(5\)/);
  assert.match(text, /🔥 \*4 Reaktionen\*/);
  assert.match(text, /🥇 Jonas \(Liegestütze\)/);
  const empty = S.whatsNewText({ label: 'heute', newUsers: [], newChallenges: [], joins: 0, logs: 0, activeUsers: 0, topUsers: [], reactions: 0, medals: [] });
  assert.match(empty, /Nichts Neues/);
});
