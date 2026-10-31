import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../supabase/functions/_shared/kick.ts', import.meta.url), 'utf8');
const { createKickHandler, kickAlert } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const migration = readFileSync(new URL('../supabase/migrations/20261028010000_teammate_kicks.sql', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../supabase/functions/kick-teammate/index.ts', import.meta.url), 'utf8');
const sender = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
const competition = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';

function harness(overrides = {}) {
  const calls = [];
  const deps = {
    ready: () => true,
    authenticate: async token => { calls.push(['auth', token]); return sender; },
    reserve: async (...args) => { calls.push(['reserve', ...args]); return { request_id: requestId }; },
    loadDelivery: async (...args) => {
      calls.push(['context', ...args]);
      return { request_id: requestId, sender_id: sender, competition_id: competition,
        sender_name: 'Lea', competition_name: 'Büro-Battle', language: 'sv', tokens: ['device1'] };
    },
    send: async (...args) => { calls.push(['send', ...args]); return { sent: 1 }; },
    finish: async (...args) => { calls.push(['finish', ...args]); },
    ...overrides,
  };
  return { handle: createKickHandler(deps), calls };
}
const req = (body = { competition_id: competition, recipient_id: recipient }, token = 'signed-token') => new Request('https://example.test/kick-teammate', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('Kick: preflight and non-POST never touch authentication or delivery', async () => {
  const h = harness();
  const preflight = await h.handle(new Request('https://example.test', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  assert.equal((await h.handle(new Request('https://example.test'))).status, 405);
  assert.deepEqual(h.calls, []);
});

test('Kick: missing/invalid auth, bad IDs and self-target cannot send', async () => {
  let h = harness();
  assert.equal((await h.handle(new Request('https://example.test', { method: 'POST' }))).status, 401);
  assert.deepEqual(h.calls, []);
  assert.equal((await h.handle(req({ competition_id: [competition], recipient_id: recipient }))).status, 400);
  assert.equal((await h.handle(req({ competition_id: competition, recipient_id: 'not-a-user-id' }))).status, 400);
  assert.equal((await h.handle(req({ competition_id: competition, recipient_id: sender }))).status, 403);
  assert.equal(h.calls.filter(c => c[0] === 'reserve').length, 0);
  h = harness({ authenticate: async () => null });
  assert.equal((await h.handle(req())).status, 401);
  assert.deepEqual(h.calls, []);
});

test('Kick: sender identity comes from verified token, client sender_id is ignored', async () => {
  const h = harness();
  const response = await h.handle(req({ competition_id: competition, recipient_id: recipient, sender_id: recipient, message: 'untrusted custom message' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.deepEqual(h.calls[1], ['reserve', sender, competition, recipient]);
  const send = h.calls.find(c => c[0] === 'send');
  assert.deepEqual(send[1], ['device1']);
  assert.equal(send[2].sender_id, sender);
  assert.equal(send[2].competition_id, competition);
  assert.equal(send[2].kind, 'teammate_kick');
  assert.match(send[2].aps.alert.title, /En spark från Lea/);
  assert.doesNotMatch(send[2].aps.alert.body, /untrusted/);
  assert.deepEqual(h.calls.at(-1), ['finish', requestId, 'sent']);
});

test('Kick: opt-out, missing device, quiet hours and daily limits never dispatch', async () => {
  for (const reason of ['disabled', 'no_device', 'quiet_hours', 'already_sent_today', 'daily_limit', 'not_allowed']) {
    const h = harness({ reserve: async () => ({ reason }) });
    const response = await h.handle(req());
    assert.equal(response.status, reason === 'not_allowed' ? 403 : 200);
    assert.deepEqual(await response.json(), { sent: false, reason });
    assert.equal(h.calls.some(c => ['send', 'finish', 'context'].includes(c[0])), false);
  }
});

test('Kick: opt-out, removed membership or quiet-hour boundary after reservation cancels before send', async () => {
  for (const reason of ['disabled', 'not_allowed', 'quiet_hours']) {
    const h = harness({ loadDelivery: async () => ({ reason }) });
    const response = await h.handle(req());
    assert.equal(response.status, reason === 'not_allowed' ? 403 : 200);
    assert.deepEqual(await response.json(), { sent: false, reason });
    assert.equal(h.calls.some(c => c[0] === 'send'), false);
    assert.deepEqual(h.calls.at(-1), ['finish', requestId, 'cancelled']);
  }
  const h = harness({ loadDelivery: async () => ({ tokens: [] }) });
  assert.deepEqual(await (await h.handle(req())).json(), { sent: false, reason: 'no_device' });
  assert.equal(h.calls.some(c => c[0] === 'send'), false);
  assert.deepEqual(h.calls.at(-1), ['finish', requestId, 'cancelled']);
});

test('Kick: APNs unavailable does not reserve, failed/uncertain sends keep the daily slot', async () => {
  let h = harness({ ready: () => false });
  assert.equal((await h.handle(req())).status, 503);
  assert.equal(h.calls.some(c => c[0] === 'reserve'), false);
  h = harness({ send: async () => ({ sent: 0 }) });
  const failure = await h.handle(req());
  assert.equal(failure.status, 502);
  assert.deepEqual(await failure.json(), { sent: false, reason: 'delivery_failed' });
  assert.deepEqual(h.calls.at(-1), ['finish', requestId, 'failed']);
  h = harness({ send: async () => { throw new Error('network timeout'); } });
  assert.equal((await h.handle(req())).status, 503);
  assert.deepEqual(h.calls.at(-1), ['finish', requestId, 'failed']);
});

test('Kick: playful messages cover all app languages, keep names and strip control characters', () => {
  const titles = { de: 'Arschkick von Lea', en: 'A kick from Lea', fi: 'Treenipotku: Lea', sv: 'En spark från Lea' };
  for (const [language, title] of Object.entries(titles)) {
    const alert = kickAlert({ request_id: requestId, sender_name: 'Lea\n\u0000', competition_name: 'Team\nSport', language });
    assert.ok(alert.title.includes(title));
    assert.ok(alert.body.endsWith(' · Team Sport'));
    assert.doesNotMatch(alert.title + alert.body, /[\u0000-\u001f]/);
    assert.deepEqual(alert, kickAlert({ request_id: requestId, sender_name: 'Lea', competition_name: 'Team Sport', language }));
  }
  assert.match(kickAlert({ request_id: requestId, sender_name: '', competition_name: '', language: 'constructor' }).title, /Dein Trainingspartner/);
});

test('Kick: confirmed delivery remains successful if recording its status fails', async () => {
  const h = harness({ finish: async () => { throw new Error('database temporarily unavailable'); } });
  const response = await h.handle(req());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 1);
});

test('Kick schema: only backend can reserve/send; opt-out keeps profile owner RLS', () => {
  assert.match(migration, /add column if not exists kick_enabled boolean not null default true/);
  assert.match(migration, /grant update \(kick_enabled\) on public\.profiles to authenticated/);
  assert.doesNotMatch(migration, /grant update on public\.profiles/);
  assert.match(migration, /revoke all on public\.teammate_kicks from anon, authenticated/);
  for (const name of ['reserve_teammate_kick', 'teammate_kick_delivery']) {
    assert.ok(migration.includes(`revoke execute on function public.${name}`));
    assert.ok(migration.includes(`grant execute on function public.${name}`));
  }
  assert.match(endpoint, /admin\.auth\.getUser\(token\)/);
  assert.match(endpoint, /p_sender: sender/);
});

test('Kick schema: atomic recipient lock, global pair/day unique, max3 received, active membership and blocks', () => {
  assert.match(migration, /where p\.id = p_recipient for update/);
  assert.match(migration, /on public\.teammate_kicks \(sender_id, recipient_id, day\)/);
  assert.match(migration, /k\.day = v_local::date and k\.state <> 'cancelled'\) >= 3/);
  assert.equal((migration.match(/s\.left_at is null/g) ?? []).length, 2);
  assert.equal((migration.match(/r\.left_at is null/g) ?? []).length, 2);
  assert.equal((migration.match(/c\.archived_at is null/g) ?? []).length, 2);
  assert.match(migration, /b\.blocker = p_recipient and b\.blocked = p_sender/);
  assert.match(migration, /b\.blocker = v_kick\.recipient_id and b\.blocked = v_kick\.sender_id/);
});

test('Kick schema: final delivery rechecks the current local day and quiet hours', () => {
  const finalCheck = migration.slice(migration.indexOf('create or replace function public.teammate_kick_delivery'));
  assert.match(finalCheck, /v_local timestamp := now\(\) at time zone 'Europe\/Berlin'/);
  assert.match(finalCheck, /v_kick\.day <> v_local::date/);
  assert.match(finalCheck, /extract\(hour from v_local\) >= 22 or extract\(hour from v_local\) < 7/);
  assert.ok(finalCheck.indexOf("'reason', 'quiet_hours'") < finalCheck.indexOf("'tokens'"));
});
