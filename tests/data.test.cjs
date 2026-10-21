// Prüft Fehlertexte, Konto-Löschen und die Schutzregeln für Wochenziele aus
// www/data.js (Browser-Skript, per vm geladen; Supabase durch eine Attrappe ersetzt).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Speicher wie localStorage (length/key/getItem/setItem/removeItem).
function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()].sort(),
  };
}

function load({ window: extra = {} } = {}) {
  const errors = [];
  const quietConsole = { ...console, error: (...a) => errors.push(a), warn: () => {} };
  const ctx = { window: { ...extra }, console: quietConsole, setTimeout, clearTimeout };
  vm.createContext(ctx);
  // i18n.js zuerst (tr/trn, ohne Gerätesprache bleibt es Deutsch), dann data.js
  for (const f of ['i18n.js', 'data.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return { D: ctx.window.PTData, win: ctx.window, errors };
}

const err = (message, code) => Object.assign(new Error(message), code ? { code } : {});

// ── friendlyError ───────────────────────────────────────────────────────────

test('friendlyError: Postgres-Codes werden deutsch, der Code bleibt', () => {
  const { D } = load();
  const cases = [
    [{ message: 'duplicate key value violates unique constraint "categories_scope_name_idx"', code: '23505' }, 'Gibt es schon.'],
    [{ message: 'new row for relation "sets" violates check constraint "sets_reps_check"', code: '23514' }, 'Ungültiger Wert.'],
    [{ message: 'value "99999999999" is out of range for type integer', code: '22003' }, 'Ungültiger Wert.'],
    [{ message: 'new row violates row-level security policy for table "sets"', code: '42501' }, 'Keine Berechtigung – bist du noch in der Challenge?'],
  ];
  for (const [input, text] of cases) {
    const e = D.friendlyError(input);
    assert.equal(e.message, text, input.message);
    assert.equal(e.code, input.code);
  }
});

test('friendlyError: Mail-Versandfehler mit und ohne Support-Adresse', () => {
  const inputs = [
    err('Error sending recovery email', 'unexpected_failure'),
    err('Error sending confirmation email'),
    err('Email address "a@b.de" cannot be used as it is not authorized', 'email_address_not_authorized'),
  ];
  const { D } = load();
  for (const input of inputs) {
    assert.equal(D.friendlyError(input).message,
      'Mail konnte gerade nicht verschickt werden. Versuch es später nochmal oder schreib uns.', input.message);
  }
  const withMail = load({ window: { PTOnboarding: { SUPPORT_EMAIL: 'hallo@example.de' } } });
  assert.equal(withMail.D.friendlyError(inputs[0]).message,
    'Mail konnte gerade nicht verschickt werden. Versuch es später nochmal oder schreib uns an hallo@example.de.');
});

test('friendlyError: unbekannter Roh-Fehler → allgemeiner Satz, Code bleibt, Original im Log', () => {
  const { D, errors } = load();
  const raw = { message: 'could not serialize access due to concurrent update', code: '40001', details: null, hint: null };
  const e = D.friendlyError(raw);
  assert.equal(e.message, 'Etwas ist schiefgelaufen. Versuch es nochmal.');
  assert.equal(e.code, '40001');
  assert.equal(errors.length, 1, 'Original landet per console.error im Log');

  const authRaw = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError', status: 400 });
  assert.equal(D.friendlyError(authRaw).message, 'Etwas ist schiefgelaufen. Versuch es nochmal.');
});

test('friendlyError: PGRST116 behält den Code (app.jsx erkennt daran „nicht mehr Mitglied“)', () => {
  const { D } = load();
  const e = D.friendlyError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains 0 rows' });
  assert.equal(e.code, 'PGRST116');
  assert.equal(e.message, 'Etwas ist schiefgelaufen. Versuch es nochmal.');
});

test('friendlyError: eigene Texte und bereits übersetzte Fehler bleiben unverändert', () => {
  const { D } = load();
  const own = new Error('Bitte gib deinen Namen ein.');
  assert.equal(D.friendlyError(own).message, own.message);
  const once = D.friendlyError({ message: 'x', code: '23505' });
  assert.equal(D.friendlyError(once), once, 'zweimal übersetzen ändert nichts');
  assert.equal(D.friendlyError(err('competition_full', 'P0001')).message, 'Diese Challenge ist schon voll.');
});

test('appError: feste deutsche Texte mit Code', () => {
  const { D } = load();
  assert.equal(D.appError('has_sets').message, 'Für dieses Ziel gibt es schon Sätze. Ändere stattdessen die Zielmenge.');
  assert.equal(D.appError('has_sets').code, 'has_sets');
  assert.equal(D.appError('category_locked').message, 'Die Übung lässt sich nicht mehr wechseln, es gibt schon Sätze.');
  assert.equal(D.appError('delete_failed').message, 'Konto konnte nicht gelöscht werden. Prüfe deine Verbindung und versuch es nochmal.');
});

test('Strafgründe ohne Fachbegriffe', () => {
  const { D } = load();
  const chs = [{ id: 'w1', category_id: 'c1', target_reps: 100 }];
  const sets = [{ challenge_id: 'w1', athlete: 'u1', reps: 20 }];
  for (const rule_mode of ['per_challenge', 'per_week_aggregate']) {
    const [p] = D.computePenalties(chs, sets, 'u1', { rule_mode, amount_cents: 500 }, 2);
    assert.ok(p, rule_mode);
    assert.doesNotMatch(p.reason, /fairShare|aggregiert/);
    assert.match(p.reason, /30 unter dem eigenen Anteil/);
  }
});

// ── Gerätedaten ─────────────────────────────────────────────────────────────

test('clearLocalData entfernt App-Schlüssel, Erscheinungsbild und Sprache bleiben', () => {
  const localStorage = memoryStorage({
    'pt:theme2': 'dark', 'pt:lang': 'en', 'pt:returning': '1', 'pt:invite': '{}', 'pt:onboarding:u1': '{}',
    pt_active_competition: 'c1', pt_apns_token: 't', quickSets: '{}', 'sb-x-auth-token': 's', other: 'x',
  });
  const sessionStorage = memoryStorage({ 'pt:tab': 'feed', keep: '1' });
  const { D } = load({ window: { localStorage, sessionStorage } });
  D.clearLocalData();
  assert.deepEqual(localStorage.keys(), ['other', 'pt:lang', 'pt:theme2', 'sb-x-auth-token']);
  assert.deepEqual(sessionStorage.keys(), ['keep']);
});

test('PTReportError wirft nie, auch ohne Client oder mit kaputtem Client', async () => {
  const { win } = load();
  assert.doesNotThrow(() => win.PTReportError(new Error('x'), { componentStack: 'at A' }));
  const broken = fakeClient({ getSession: async () => { throw new Error('kaputt'); } });
  const loaded = load({ window: { supabase: { createClient: () => broken.client } } });
  loaded.D.init({ url: 'u', key: 'k' });
  assert.doesNotThrow(() => loaded.win.PTReportError('Text', 'ctx'));
  const cyclic = {}; cyclic.self = cyclic;
  assert.doesNotThrow(() => loaded.win.PTReportError(null, cyclic));
  await new Promise(r => setTimeout(r, 0));
});

// ── Attrappe für den Supabase-Client ────────────────────────────────────────

// `respond(table, ops)` liefert { data, error, count } für eine Abfrage; ops = Liste
// der aufgerufenen Methoden. Alle Aufrufe landen in `calls`.
function fakeClient({ respond = () => ({ data: null, error: null }), rpc, invoke, signOut, getSession, list, remove } = {}) {
  const calls = [];
  const builder = (table) => {
    const ops = [];
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const res = respond(table, ops);
          calls.push({ table, ops: ops.map(o => o.name) });
          return (ok, fail) => Promise.resolve(res).then(ok, fail);
        }
        return (...args) => { ops.push({ name: prop, args }); return b; };
      },
    });
    return b;
  };
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: getSession || (async () => ({ data: { session: { user: { id: 'u1' } } } })),
      signOut: async (opts) => { calls.push({ signOut: opts }); return signOut ? signOut(opts) : { error: null }; },
      storageKey: 'sb-test-auth-token',
    },
    from: (table) => builder(table),
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpc ? rpc(name, args) : { data: null, error: null }; },
    functions: { invoke: async (name, opts) => { calls.push({ invoke: name, opts }); return invoke ? invoke(name, opts) : { data: { ok: true }, error: null }; } },
    storage: {
      from: (bucket) => ({
        list: async (prefix, opts) => { calls.push({ list: bucket, prefix, opts }); return list ? list(prefix) : { data: [], error: null }; },
        remove: async (paths) => { calls.push({ remove: bucket, paths }); return remove ? remove(paths) : { data: paths.map(name => ({ name })), error: null }; },
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };
  return { client, calls };
}

async function signedInApi(opts = {}, windowExtra = {}) {
  const fake = fakeClient(opts);
  const loaded = load({ window: { supabase: { createClient: () => fake.client }, ...windowExtra } });
  const api = loaded.D.init({ url: 'u', key: 'k' });
  await api.getSession();
  return { api, calls: fake.calls, ...loaded };
}

// ── Konto löschen ───────────────────────────────────────────────────────────

test('deleteAccount: Profilbilder, RPC, lokal abmelden, Gerätedaten weg', async () => {
  const localStorage = memoryStorage({ 'pt:theme2': 'light', 'pt:returning': '1', pt_active_competition: 'c1' });
  let listed = 0;
  const { api, calls } = await signedInApi({
    list: () => (listed++ ? { data: [], error: null }
      : { data: [{ id: 'f1', name: 'avatar-1.jpg' }, { id: 'f2', name: 'avatar-2.jpg' }, { id: null, name: 'ordner' }], error: null }),
  }, { localStorage, sessionStorage: memoryStorage() });
  await api.deleteAccount();

  const removeCall = calls.find(c => c.remove);
  assert.deepEqual([...removeCall.paths], ['u1/avatar-1.jpg', 'u1/avatar-2.jpg']);
  assert.equal(calls.find(c => c.list).prefix, 'u1');
  assert.ok(calls.find(c => c.rpc === 'delete_my_account'));
  assert.ok(!calls.find(c => c.invoke), 'ohne 42501 keine Edge Function');
  assert.equal(calls.find(c => c.signOut).signOut.scope, 'local');
  assert.ok(calls.indexOf(removeCall) < calls.findIndex(c => c.rpc), 'Bilder vor dem Konto');
  assert.deepEqual(localStorage.keys(), ['pt:theme2']);
});

test('deleteAccount: bei 42501 übernimmt die Edge Function delete-account', async () => {
  const { api, calls } = await signedInApi({
    rpc: () => ({ data: null, error: { message: 'permission denied for table users', code: '42501' } }),
  }, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  await api.deleteAccount();
  const inv = calls.find(c => c.invoke);
  assert.equal(inv.invoke, 'delete-account');
  assert.equal(inv.opts.method, 'POST');
  assert.ok(calls.find(c => c.signOut));
});

test('deleteAccount: Fehler → deutscher Text, Sitzung und Daten bleiben', async () => {
  const localStorage = memoryStorage({ 'pt:returning': '1' });
  const { api, calls } = await signedInApi({
    rpc: () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }),
  }, { localStorage, sessionStorage: memoryStorage() });
  await assert.rejects(api.deleteAccount(), (e) => {
    assert.equal(e.message, 'Konto konnte nicht gelöscht werden. Prüfe deine Verbindung und versuch es nochmal.');
    return true;
  });
  assert.ok(!calls.find(c => c.signOut), 'nicht abgemeldet');
  assert.deepEqual(localStorage.keys(), ['pt:returning']);

  const viaFunction = await signedInApi({
    rpc: () => ({ data: null, error: { message: 'permission denied for table users', code: '42501' } }),
    invoke: () => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError' }) }),
  }, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  await assert.rejects(viaFunction.api.deleteAccount(), /Konto konnte nicht gelöscht werden/);
});

test('deleteAccount: Fehler beim Bilder-Löschen hält das Löschen nicht auf', async () => {
  const { api, calls } = await signedInApi({
    list: () => ({ data: null, error: { message: 'Bucket not found' } }),
  }, { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  await api.deleteAccount();
  assert.ok(calls.find(c => c.rpc === 'delete_my_account'));
});

// ── Wochenziele mit Sätzen ──────────────────────────────────────────────────

test('deleteChallenge bricht ab, wenn es schon Sätze gibt', async () => {
  let setCount = 3;
  const { api, calls } = await signedInApi({
    respond: (table) => (table === 'sets' ? { data: null, error: null, count: setCount } : { data: null, error: null }),
  });
  const capi = api.forCompetition('c1');
  await assert.rejects(capi.deleteChallenge('w1'), (e) => {
    assert.equal(e.code, 'has_sets');
    assert.equal(e.message, 'Für dieses Ziel gibt es schon Sätze. Ändere stattdessen die Zielmenge.');
    return true;
  });
  assert.ok(!calls.some(c => c.table === 'weekly_challenges' && c.ops.includes('delete')), 'nichts gelöscht');

  setCount = 0;
  await capi.deleteChallenge('w1');
  assert.ok(calls.some(c => c.table === 'weekly_challenges' && c.ops.includes('delete')), 'ohne Sätze wird gelöscht');
});

test('upsertChallenge: Übung wechseln nur ohne Sätze, Zielmenge immer', async () => {
  const { api, calls } = await signedInApi({
    respond: (table, ops) => {
      if (table === 'sets') return { data: null, error: null, count: 5 };
      if (ops.some(o => o.name === 'update')) return { data: { id: 'w1', category_id: 'c-push', target_reps: 150, chosen_by_user: 'u1' }, error: null };
      return { data: { category_id: 'c-push' }, error: null };
    },
  });
  const capi = api.forCompetition('c1');
  await assert.rejects(capi.upsertChallenge({ id: 'w1', category_id: 'c-pull', target_reps: 100 }), (e) => {
    assert.equal(e.code, 'category_locked');
    assert.equal(e.message, 'Die Übung lässt sich nicht mehr wechseln, es gibt schon Sätze.');
    return true;
  });
  assert.ok(!calls.some(c => c.ops.includes('update')), 'nichts geändert');

  const setQueries = () => calls.filter(c => c.table === 'sets').length;
  const before = setQueries();
  const row = await capi.upsertChallenge({ id: 'w1', category_id: 'c-push', target_reps: 150 });
  assert.equal(row.target_reps, 150);
  assert.equal(setQueries(), before, 'gleiche Übung: keine Satz-Zählung nötig');
});

test('upsertChallenge: Anlegen mit vorhandener Übung bleibt still (23505 → bestehende Zeile)', async () => {
  const existing = { id: 'w9', category_id: 'c-push', target_reps: 100, chosen_by_user: 'u1' };
  const { api } = await signedInApi({
    respond: (table, ops) => (ops.some(o => o.name === 'insert')
      ? { data: null, error: { message: 'duplicate key value', code: '23505' } }
      : { data: existing, error: null }),
  });
  const row = await api.forCompetition('c1').upsertChallenge({ week_start: '2026-10-19', category_id: 'c-push', target_reps: 100 });
  assert.equal(row.id, 'w9');
});

// ── Standard-Übungen ────────────────────────────────────────────────────────

test('localizeCategory: Standard-Übungen auf Englisch, eigene bleiben', () => {
  const ctx = {
    window: {}, console, setTimeout, clearTimeout,
    localStorage: { getItem: k => (k === 'pt:lang' ? 'en' : null), setItem() {}, removeItem() {} },
  };
  vm.createContext(ctx);
  for (const f of ['i18n.js', 'i18n/en.js', 'data.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8'), ctx, { filename: f });
  }
  const L = ctx.window.PTData.localizeCategory;
  assert.equal(L({ name: 'Liegestütze', competition_id: null }).name, 'Push-ups');
  assert.equal(L({ name: '20-Min-AMRAP', competition_id: null }).name, '20-min AMRAP');
  assert.equal(L({ name: 'Bring Sally Up', competition_id: null }).name, 'Bring Sally Up');
  assert.equal(L({ name: '20-Min-AMRAP', competition_id: 'c1' }).name, '20-Min-AMRAP');
  // Deutsch: Name unverändert
  assert.equal(load().D.localizeCategory({ name: '20-Min-AMRAP', competition_id: null }).name, '20-Min-AMRAP');
});


test('Wochenabschluss wertet nur Sport: versteckte Work-Ziele erzeugen und tilgen keine Strafen', async () => {
  const historical = { id: 'old-work-penalty', user_id: 'u1', challenge_id: 'work-ch', amount_cents: 500, paid: true };
  const inserted = [];
  const mutations = [];
  const { api } = await signedInApi({
    respond(table, ops) {
      const write = ops.find(o => ['insert', 'update', 'delete'].includes(o.name));
      if (write) {
        mutations.push({ table, name: write.name });
        if (table === 'penalties' && write.name === 'insert') inserted.push(...write.args[0]);
        return { data: null, error: null };
      }
      const rows = {
        penalty_config: { enabled: true, rule_mode: 'per_week_aggregate', amount_cents: 500 },
        categories: [{ id: 'push', kind: 'sports' }, { id: 'work', kind: 'work' }],
        weekly_challenges: [
          { id: 'sport-ch', category_id: 'push', target_reps: 100, week_start: '2026-10-19' },
          { id: 'work-ch', category_id: 'work', target_reps: 600, week_start: '2026-10-19' },
        ],
        competition_members: [{ user_id: 'u1' }, { user_id: 'u2' }],
        sets: [
          { user_id: 'u1', challenge_id: 'sport-ch', reps: 50 },
          { user_id: 'u2', challenge_id: 'sport-ch', reps: 25 },
          { user_id: 'u2', challenge_id: 'work-ch', duration_minutes: 600 },
        ],
        penalties: [{ ...historical }],
      };
      return { data: rows[table] ?? null, error: null };
    },
  });
  const capi = api.forCompetition('c1');
  const before = await capi.listPenalties();
  const preview = await capi.previewWeekClose('2026-10-19');
  assert.deepEqual(Array.from(preview.penalties, p => p.athlete), ['u2']);
  await capi.closeWeek('2026-10-19');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].user_id, 'u2');
  assert.equal(inserted[0].challenge_id, null);
  assert.equal(inserted[0].amount_cents, 500);
  assert.deepEqual(await capi.listPenalties(), before, 'bestehende Strafe bleibt unverändert');
  assert.ok(!mutations.some(m => m.table === 'penalties' && m.name !== 'insert'));
});
