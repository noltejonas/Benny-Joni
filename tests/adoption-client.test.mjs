import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportClient } from '../docs/launch/site/adoption-client.mjs';

const token = (suffix = 'one') => ({ access_token: `access-${suffix}`, refresh_token: `refresh-${suffix}`, expires_in: 3600 });
const report = users => ({ generated_at: '2026-10-26T08:00:00Z', totals: { users },
  users: [], challenges: [], weeks: [] });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const client = fetchImpl => createReportClient({ fetchImpl, url: 'https://example.test', key: 'public-anon' });

test('Bericht ist ohne Anmeldung nicht abrufbar', async () => {
  let requests = 0;
  const api = client(async () => { requests++; return json(report(1)); });
  await assert.rejects(api.loadReport(), { code: 'NOT_AUTHENTICATED' });
  assert.equal(requests, 0);
});

test('jeder Abruf liest frische Daten mit Nutzertoken und ohne HTTP-Cache', async () => {
  const requests = [];
  let users = 1;
  const api = client(async (url, options) => {
    requests.push({ url, options });
    return json(url.includes('/token?') ? token() : report(users++));
  });
  await api.signIn(' admin@example.test ', 'dummy-password');
  assert.equal((await api.loadReport()).totals.users, 1);
  assert.equal((await api.loadReport()).totals.users, 2);
  for (const { url, options } of requests.slice(1)) {
    assert.equal(url, 'https://example.test/rest/v1/rpc/adoption_report');
    assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer access-one');
  }
});

test('fehlende Adminrechte geben keine Daten zurück', async () => {
  const api = client(async url => url.includes('/token?') ? json(token())
    : json({ message: 'internal detail must not be exposed' }, 403));
  await api.signIn('member@example.test', 'dummy-password');
  await assert.rejects(api.loadReport(), error => error.code === 'FORBIDDEN'
    && !error.message.includes('internal detail'));
});

test('abgelaufene Sitzung wird einmal erneuert; neue Abrufe nutzen das neue Token', async () => {
  let clock = 0;
  const requests = [];
  const api = createReportClient({ now: () => clock, url: 'https://example.test', key: 'public-anon',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return json(url.includes('grant_type=password') ? token()
        : url.includes('grant_type=refresh_token') ? token('two') : report(1));
    } });
  await api.signIn('admin@example.test', 'dummy-password');
  clock = 3600_000;
  await Promise.all([api.loadReport(), api.loadReport()]);
  assert.equal(requests.filter(r => r.url.includes('grant_type=refresh_token')).length, 1);
  for (const request of requests.filter(r => r.url.includes('/rpc/'))) {
    assert.equal(request.options.headers.Authorization, 'Bearer access-two');
  }
});

test('Abmelden verwirft auch eine noch laufende Berichtsantwort', async () => {
  let resolve;
  const api = client(async url => url.includes('/token?') ? json(token())
    : url.includes('/logout?') ? new Response(null, { status: 204 })
    : new Promise(done => { resolve = done; }));
  await api.signIn('admin@example.test', 'dummy-password');
  const loading = api.loadReport();
  await api.signOut();
  resolve(json(report(5)));
  await assert.rejects(loading, { code: 'NOT_AUTHENTICATED' });
  assert.equal(api.hasSession(), false);
});

test('ungültige Zugangsdaten und Netzwerkfehler zeigen keine Serverdetails', async () => {
  const api = client(async () => json({ error_description: 'private server response' }, 400));
  await assert.rejects(api.signIn('admin@example.test', 'dummy-password'), { code: 'INVALID_CREDENTIALS' });
  assert.equal(api.hasSession(), false);
  const offline = client(async () => { throw new Error('private transport detail'); });
  await assert.rejects(offline.signIn('admin@example.test', 'dummy-password'), { code: 'UNAVAILABLE' });
});

test('ungültige Erneuerung beendet die Sitzung statt alte Daten als aktuell auszugeben', async () => {
  const api = client(async url => url.includes('grant_type=password') ? json(token())
    : url.includes('grant_type=refresh_token') ? json({}, 400) : json({}, 401));
  await api.signIn('admin@example.test', 'dummy-password');
  await assert.rejects(api.loadReport(), { code: 'NOT_AUTHENTICATED' });
  assert.equal(api.hasSession(), false);
});
