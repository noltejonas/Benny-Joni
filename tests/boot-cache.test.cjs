// Prüft den Start-Zwischenspeicher aus www/boot-cache.js (Browser-Skript, per vm geladen).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Frischer Kontext mit eigenem localStorage; quota begrenzt die Zeichen insgesamt.
function load({ lang = 'de', quota = Infinity } = {}) {
  const store = new Map();
  const used = () => [...store].reduce((a, [k, v]) => a + k.length + v.length, 0);
  const localStorage = {
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      const before = store.get(k);
      store.set(k, String(v));
      if (used() > quota) {
        if (before === undefined) store.delete(k); else store.set(k, before);
        throw new Error('QuotaExceededError');
      }
    },
    removeItem: k => store.delete(k),
  };
  const ctx = { window: { PTi18n: { lang } }, localStorage, setTimeout, clearTimeout, console, JSON, Date };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'boot-cache.js'), 'utf8'), ctx, { filename: 'boot-cache.js' });
  return { C: ctx.window.PTBootCache, store, ctx };
}

test('read liefert, was write gespeichert hat, auch vor dem Schreiben', () => {
  const { C, store } = load();
  C.write('u1', 'account', { profile: { id: 'u1' }, competitions: [] });
  assert.deepEqual(C.read('u1', 'account'), { profile: { id: 'u1' }, competitions: [] });
  assert.equal(store.size, 0, 'write wartet und bündelt');
  C.flush();
  assert.ok(store.has('pt:boot:u1:account'));
  const fresh = load();
  fresh.store.set('pt:boot:u1:account', store.get('pt:boot:u1:account'));
  assert.deepEqual(fresh.C.read('u1', 'account'), { profile: { id: 'u1' }, competitions: [] });
});

test('write bündelt: nur der letzte Stand landet im Speicher', () => {
  const { C, store } = load();
  C.write('u1', 'comp:a', { n: 1 });
  C.write('u1', 'comp:a', { n: 2 });
  C.flush();
  assert.equal(JSON.parse(store.get('pt:boot:u1:comp:a')).data.n, 2);
});

test('pro Konto getrennt, ohne Konto nichts', () => {
  const { C } = load();
  C.store('u1', 'account', { who: 1 });
  assert.equal(C.read('u2', 'account'), null);
  assert.equal(C.read(null, 'account'), null);
  C.write(null, 'account', { who: 0 });
  C.flush();
  assert.equal(C.read(null, 'account'), null);
});

test('andere Sprache, alte Version oder zu alt: kein Treffer', () => {
  const { C, store, ctx } = load({ lang: 'de' });
  C.store('u1', 'account', { x: 1 });
  ctx.window.PTi18n.lang = 'en';
  assert.equal(C.read('u1', 'account'), null, 'Kategorienamen wären in der falschen Sprache');
  ctx.window.PTi18n.lang = 'de';
  assert.deepEqual(C.read('u1', 'account'), { x: 1 });
  assert.equal(C.read('u1', 'account', Date.now() + 15 * 86400000), null);
  const entry = JSON.parse(store.get('pt:boot:u1:account'));
  store.set('pt:boot:u1:account', JSON.stringify({ ...entry, v: 0 }));
  assert.equal(C.read('u1', 'account'), null);
  store.set('pt:boot:u1:account', '{kaputt');
  assert.equal(C.read('u1', 'account'), null);
});

test('hält die Daten von höchstens drei Challenges, das Konto bleibt', () => {
  const { C, store } = load();
  C.store('u1', 'account', { a: 1 }, 1000);
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) C.store('u1', `comp:${id}`, { id }, 2000 + i);
  assert.equal(C.read('u1', 'comp:a', 3000), null, 'älteste fliegt raus');
  for (const id of ['b', 'c', 'd']) assert.deepEqual(C.read('u1', `comp:${id}`, 3000), { id });
  assert.deepEqual(C.read('u1', 'account', 3000), { a: 1 });
  assert.ok(!store.has('pt:boot:u1:comp:a'));
});

test('zu groß: nicht speichern und alten Stand entfernen', () => {
  const { C, store } = load();
  C.store('u1', 'comp:a', { small: true });
  C.store('u1', 'comp:a', { big: 'x'.repeat(1600000) });
  assert.ok(!store.has('pt:boot:u1:comp:a'));
  assert.equal(C.read('u1', 'comp:a'), null);
});

test('Speicher voll: andere Challenges weichen, sonst ohne Zwischenspeicher', () => {
  const { C, store } = load({ quota: 3000 });
  C.store('u1', 'comp:a', { pad: 'a'.repeat(1200) });
  C.store('u1', 'comp:b', { pad: 'b'.repeat(1200) });
  assert.ok(store.has('pt:boot:u1:comp:a') && store.has('pt:boot:u1:comp:b'));
  C.store('u1', 'comp:c', { pad: 'c'.repeat(1200) });
  assert.ok(store.has('pt:boot:u1:comp:c'));
  assert.ok(!store.has('pt:boot:u1:comp:a') && !store.has('pt:boot:u1:comp:b'));
  C.store('u1', 'comp:d', { pad: 'd'.repeat(5000) });
  assert.equal(C.read('u1', 'comp:d'), null);
});

test('clear löscht alle Konten und verwirft wartende Schreibvorgänge', async () => {
  const { C, store } = load();
  store.set('pt:theme2', 'dark');
  C.store('u1', 'account', { a: 1 });
  C.store('u2', 'comp:x', { b: 1 });
  C.write('u1', 'comp:y', { c: 1 });
  C.clear();
  await new Promise(r => setTimeout(r, 1100));
  assert.deepEqual([...store.keys()], ['pt:theme2']);
  assert.equal(C.read('u1', 'comp:y'), null);
});
