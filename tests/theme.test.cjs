// Prüft die Farbpaletten und eigenen Farben (www/theme.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(stored) {
  const store = new Map(stored ? [['pt:colors', JSON.stringify(stored)]] : []);
  const props = new Map();
  const ctx = {
    window: {},
    console,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: {
      documentElement: {
        dataset: { theme: 'dark' },
        style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'theme.js'), 'utf8'), ctx, { filename: 'theme.js' });
  return { T: ctx.window.PTTheme, props, store };
}

test('Standardpalette lässt <html> frei, andere Palette setzt die Tokens', () => {
  const plain = load();
  assert.equal(plain.props.size, 0);
  const { T, props } = load({ palette: 'graphit' });
  assert.equal(props.get('--bg'), '#000000');
  assert.equal(props.get('--side0'), '#0A84FF');
  T.apply({ palette: 'violett' }, 'dark');
  assert.equal(props.size, 0);
});

test('Violett dunkel ergibt die Werte aus redesign.css', () => {
  const { T } = load();
  const t = T.tokens(T.baseFor({ palette: 'violett' }, 'dark'), 'dark');
  assert.equal(t['--bg'], '#16151F');
  assert.equal(t['--surface'], '#211F2C');
  assert.equal(t['--grad'], 'linear-gradient(135deg, #6A4CF5 0%, #4338CA 100%)');
  assert.equal(t['--on-grad'], '#FFFFFF');
});

test('helle Akzente bekommen dunkle Schrift', () => {
  const { T } = load();
  const t = T.tokens(T.baseFor({ palette: 'mitternacht' }, 'dark'), 'dark');
  assert.equal(t['--on-grad'], '#0B0B0D');
  assert.equal(t['--on-primary'], '#0B0B0D');
});

test('eigene Farbe macht aus der Palette „custom“ und gilt nur für den Modus', () => {
  const { T } = load();
  const next = T.setCustom({ palette: 'ozean' }, 'dark', 'side0', '#ff00aa');
  assert.equal(next.palette, 'custom');
  assert.equal(next.from, 'ozean');
  assert.equal(T.baseFor(next, 'dark').side0, '#ff00aa');
  assert.equal(T.baseFor(next, 'dark').bg.toLowerCase(), '#031c22');
  assert.equal(T.baseFor(next, 'light').side0, '#0369A1');
  const again = T.setCustom(next, 'dark', 'bg', '#101010');
  assert.equal(T.baseFor(again, 'dark').side0, '#ff00aa');
  assert.equal(T.baseFor(again, 'dark').bg, '#101010');
});

test('jede Palette hat helle und dunkle Grundfarben', () => {
  const { T } = load();
  assert.ok(T.PALETTES.some((p) => p.id === 'girly'));
  for (const p of T.PALETTES) for (const m of ['dark', 'light']) {
    for (const k of ['bg', 'surface', 'text', 'accent', 'grad0', 'grad1', 'tile0', 'tile1', 'side0', 'side1']) {
      assert.match(p[m][k], /^#[0-9A-Fa-f]{6}$/, `${p.id}.${m}.${k}`);
    }
  }
});

test('kaputte gespeicherte Werte fallen auf die Palette zurück', () => {
  const { T } = load();
  const s = { palette: 'custom', from: 'kreide', custom: { light: { bg: 'nope', text: '#123' } } };
  const b = T.baseFor(s, 'light');
  assert.equal(b.bg, '#F5F3EE');
  assert.equal(b.text, '#112233');
  assert.equal(T.baseFor({ palette: 'gibtsnicht' }, 'dark').bg, '#16151F');
});
