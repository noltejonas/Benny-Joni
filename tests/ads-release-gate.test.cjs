// Lifecycle tests execute the actual plain-JS helper from app.jsx, without
// rendering unrelated React views or contacting Supabase/Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('@babel/parser');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'www/app.jsx'), 'utf8');
const ast = parser.parse(source, { sourceType: 'script', plugins: ['jsx'] });
const helper = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'watchAdsRelease');
assert.ok(helper, 'watchAdsRelease is missing');
const helperSource = source.slice(helper.start, helper.end);
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function environment({ read = async () => false, eligible = true, mode = 'supabase', online = true } = {}) {
  const events = new Map();
  const calls = [];
  let reads = 0;
  const eventTarget = prefix => ({
    addEventListener(name, callback) { events.set(`${prefix}:${name}`, callback); },
    removeEventListener(name) { events.delete(`${prefix}:${name}`); },
  });
  const document = { ...eventTarget('document'), visibilityState: 'visible' };
  const navigator = { onLine: online };
  const window = {
    ...eventTarget('window'),
    PTAds: {
      setEnabled(value) { calls.push(value); },
      checkConsent() { calls.push('consent'); return Promise.resolve(true); },
    },
    PTAppReady: Promise.resolve({ App: {
      async addListener(name, callback) {
        events.set(`native:${name}`, callback);
        return { remove() { events.delete(`native:${name}`); } };
      },
    } }),
  };
  const api = { mode, async getAdsEnabled() { reads++; return read(); } };
  const context = vm.createContext({ window, document, navigator });
  vm.runInContext(`${helperSource}\nwindow.watchAdsRelease = watchAdsRelease;`, context);
  const stop = window.watchAdsRelease(api, eligible);
  return { calls, document, navigator, reads: () => reads, stop,
    fire(target, event) { return events.get(`${target}:${event}`)?.(); }, events };
}

test('Lifecycle stays closed for false, missing, malformed or failed flag responses', async () => {
  for (const read of [async () => false, async () => undefined, async () => 'true', async () => { throw new Error('fetch failed'); }]) {
    const env = environment({ read });
    assert.deepEqual(env.calls, [false]);
    await settle();
    assert.equal(env.calls.includes(true), false);
    assert.equal(env.calls.includes('consent'), false);
    env.stop();
  }
});

test('Demo, onboarding and offline never fetch a release flag or start consent', async () => {
  for (const option of [{ mode: 'demo' }, { eligible: false }, { online: false }]) {
    const env = environment({ read: async () => true, ...option });
    await settle();
    assert.equal(env.reads(), 0);
    assert.deepEqual(env.calls, [false]);
    env.stop();
  }
});

test('A fresh positive flag allows consent; foreground rechecks and revokes on false/error', async () => {
  let flag = true;
  const env = environment({ read: async () => {
    if (flag instanceof Error) throw flag;
    return flag;
  } });
  await settle();
  assert.deepEqual(env.calls, [false, true, 'consent']);
  env.document.visibilityState = 'hidden';
  env.fire('document', 'visibilitychange');
  assert.equal(env.calls.at(-1), false);
  flag = false;
  env.document.visibilityState = 'visible';
  await env.fire('document', 'visibilitychange');
  assert.equal(env.reads(), 2);
  assert.equal(env.calls.at(-1), false);
  flag = new Error('offline');
  await env.fire('native', 'resume');
  assert.equal(env.reads(), 3);
  assert.equal(env.calls.at(-1), false);
  assert.equal(env.calls.filter(value => value === 'consent').length, 1);
  env.stop();
});

test('Offline closes immediately; a delayed positive response cannot reopen after pause/cleanup', async () => {
  for (const event of ['pause', 'offline', 'stop']) {
    let complete;
    const env = environment({ read: () => new Promise(resolve => { complete = resolve; }) });
    await settle();
    if (event === 'stop') env.stop();
    else if (event === 'offline') env.fire('window', 'offline');
    else env.fire('native', 'pause');
    complete(true);
    await settle();
    assert.equal(env.calls.includes(true), false, event);
    assert.equal(env.calls.includes('consent'), false, event);
    env.stop();
  }
});

test('Last foreground response wins; old positive response and old listener cannot reenable', async () => {
  const responses = [];
  const env = environment({ read: () => new Promise(resolve => responses.push(resolve)) });
  await settle();
  env.fire('native', 'resume');
  responses[1](false);
  responses[0](true);
  await settle();
  assert.equal(env.calls.includes(true), false);
  env.stop();
  await settle();
  assert.equal(env.events.size, 0);
});

test('Migration seeds an off singleton without resetting an existing operational choice', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261021140000_app_release_ads_gate.sql'), 'utf8');
  assert.match(sql, /ads_enabled boolean not null default false/);
  assert.match(sql, /check \(id = 1\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.app_release_settings from public, anon, authenticated/);
  assert.match(sql, /grant select on table public\.app_release_settings to anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)[^;]*\bto\s+(?:anon|authenticated)/i);
  assert.match(sql, /for select to anon, authenticated using \(id = 1\)/);
  assert.match(sql, /values \(1, false\)\s+on conflict \(id\) do nothing/);
});
