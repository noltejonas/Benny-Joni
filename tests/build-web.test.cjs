// Prüft den App-Start ohne CDN: lokale Bibliotheken (sha384), den Plugin-Shim in
// www/index.html und das Vorkompilieren aus tools/build-web.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const TOOL = path.join(ROOT, 'tools', 'build-web.cjs');
const B = require(TOOL);
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');

// Babel nur einmal laden (3 MB).
let babel = null;
const Babel = () => babel || (babel = B.loadBabel(path.join(WWW, 'vendor', B.BABEL_FILE)));

// Kopie der Teile von www, die der Build braucht.
function copyWww() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-build-web-'));
  for (const f of fs.readdirSync(WWW)) {
    if (f === 'index.html' || /\.(js|jsx)$/.test(f)) fs.copyFileSync(path.join(WWW, f), path.join(dir, f));
  }
  fs.cpSync(path.join(WWW, 'vendor'), path.join(dir, 'vendor'), { recursive: true });
  return dir;
}

function runTool(args, env = {}) {
  const clean = { ...process.env };
  delete clean.CAPACITOR_PLATFORM_NAME;
  delete clean.CAPACITOR_ROOT_DIR;
  return spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env: { ...clean, ...env } });
}

// ── Lokale Bibliotheken ─────────────────────────────────────────────────────

test('www/vendor: jede Datei hat den erwarteten sha384', () => {
  assert.deepEqual(B.verifyVendor(path.join(WWW, 'vendor')), []);
});

test('index.html lädt nichts von fremden Servern und alle Skripte liegen in www', () => {
  assert.doesNotMatch(html, /unpkg|jsdelivr|googleapis|gstatic/i);
  assert.doesNotMatch(html, /type="module"/);
  const srcs = [...html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 20);
  for (const s of srcs) {
    assert.doesNotMatch(s, /^[a-z]+:|^\/\//i, s);
    assert.ok(fs.existsSync(path.join(WWW, s)), `${s} fehlt`);
  }
  for (const name of Object.keys(B.VENDOR).filter((n) => n.endsWith('.js'))) {
    assert.ok(html.includes(`src="vendor/${name}"`), `${name} nicht eingebunden`);
  }
});

// ── Plugin-Shim ─────────────────────────────────────────────────────────────

function runShim(capacitor) {
  const shim = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('PTCelebrationHaptics'));
  assert.ok(shim, 'Shim-Skript nicht gefunden');
  const win = { Capacitor: capacitor };
  const ctx = vm.createContext({ window: win, Promise });
  vm.runInContext(shim, ctx);
  return win;
}

test('Shim: nativ kommen die Plugins aus window.Capacitor.Plugins, Form wie bisher', async () => {
  const Plugins = { App: { a: 1 }, Preferences: { p: 1 }, PushNotifications: { n: 1 }, Haptics: { h: 1 } };
  const w = runShim({ isNativePlatform: () => true, Plugins });
  assert.equal((await w.PTAppReady).App, Plugins.App);
  assert.equal((await w.PTPreferencesReady).Preferences, Plugins.Preferences);
  assert.equal(w.PTPushNotifications.PushNotifications, Plugins.PushNotifications);
  assert.equal(w.PTCelebrationHaptics.Haptics, Plugins.Haptics);
  assert.equal(w.PTCelebrationHaptics.ImpactStyle.Heavy, 'HEAVY');
  assert.equal(w.PTCelebrationHaptics.ImpactStyle.Light, 'LIGHT');
  assert.equal(w.PTCelebrationHaptics.NotificationType.Success, 'SUCCESS');
});

test('Shim: im Browser und ohne Capacitor ist alles null', async () => {
  for (const cap of [undefined, { isNativePlatform: () => false, Plugins: { App: {}, Haptics: {} } }]) {
    const w = runShim(cap);
    assert.equal(await w.PTAppReady, null);
    assert.equal(await w.PTPreferencesReady, null);
    assert.equal(w.PTPushNotifications, null);
    assert.equal(w.PTCelebrationHaptics, null);
  }
});

test('Shim: fehlt nativ ein Plugin, ist nur dieses null', async () => {
  const w = runShim({ isNativePlatform: () => true, Plugins: { Preferences: {} } });
  assert.ok(await w.PTPreferencesReady);
  assert.equal(await w.PTAppReady, null);
  assert.equal(w.PTCelebrationHaptics, null);
});

// ── Vorkompilieren ──────────────────────────────────────────────────────────

test('Übersetzung ist identisch mit babel-standalone im Browser (transformScriptTags)', () => {
  const tags = B.babelTags(html);
  // Jede .jsx in www muss in index.html eingebunden sein, sonst fehlt sie in der App.
  const missing = fs.readdirSync(WWW).filter((f) => f.endsWith('.jsx') && !tags.some((t) => t.src === f));
  assert.deepEqual(missing, [], `nicht in index.html eingebunden: ${missing.join(', ')}`);
  const { files } = B.compileHtml(html, (src) => fs.readFileSync(path.join(WWW, src), 'utf8'), Babel());
  for (const [i, t] of tags.entries()) {
    // Optionen exakt wie transformScriptTags in babel-standalone 7.29.0 (mit Inline-Sourcemap).
    const url = 'capacitor://localhost/' + t.src;
    const browser = Babel().transform(fs.readFileSync(path.join(WWW, t.src), 'utf8'), {
      filename: url,
      presets: t.presets || ['react', 'env'],
      plugins: ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'],
      sourceMaps: 'inline',
      sourceFileName: url,
      targets: { browsers: undefined },
    }).code.replace(/\n\/\/# sourceMappingURL=data:application\/json[^\n]*$/, '');
    assert.equal(files[i].src, t.src);
    assert.equal(files[i].code, browser, `${t.src} weicht ab`);
  }
});

test('data-presets wird wie im Browser übernommen (strafkonto.jsx)', () => {
  const t = B.babelTags(html).find((x) => x.src === 'strafkonto.jsx');
  assert.deepEqual(t.presets, ['env', 'react']);
  assert.equal(B.babelTags(html).find((x) => x.src === 'app.jsx').presets, undefined);
});

test('buildPublic: keine .jsx, kein Babel, defer-Skripte in derselben Reihenfolge', () => {
  const dir = copyWww();
  try {
    const before = B.babelTags(html).map((t) => t.out);
    const r = B.buildPublic(dir, path.join(WWW, 'vendor', B.BABEL_FILE));
    assert.equal(r.files, before.length);
    const out = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.doesNotMatch(out, B.FORBIDDEN);
    assert.doesNotMatch(out, /babel/i);
    assert.deepEqual([...out.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((m) => m[1]), before);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.jsx')), []);
    assert.equal(fs.existsSync(path.join(dir, 'vendor', B.BABEL_FILE)), false);
    // Klassische Skripte (Daten, React) bleiben unverändert vor den defer-Skripten.
    assert.ok(out.indexOf('src="data.js"') < out.indexOf('src="tweaks-panel.js"'));
    assert.deepEqual(B.verifyPublic(dir), []);
    // Ein zweiter Lauf ändert nichts.
    assert.equal(B.buildPublic(dir, path.join(WWW, 'vendor', B.BABEL_FILE)).files, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI bricht ab, wenn text/babel übrig bliebe (Inline-Skript)', () => {
  const dir = copyWww();
  try {
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, html.replace('</body>', '<script type="text/babel">const x = <b />;</script>\n</body>'));
    const r = runTool(['--public', dir]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /nicht unterstützt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --verify meldet text/babel, fremde Hosts und fehlende Skripte', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-build-web-'));
  try {
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!-- type="text/babel" --><link href="https://fonts.googleapis.com/x" /><script defer src="fehlt.js"></script>');
    const r = runTool(['--verify', '--public', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /text\/babel/);
    assert.match(r.stderr, /fehlt\.js fehlt/);
    fs.writeFileSync(file, '<script defer src="ok.js"></script>');
    fs.writeFileSync(path.join(dir, 'ok.js'), '');
    assert.equal(runTool(['--verify', '--public', dir]).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Hook läuft nur für iOS', () => {
  const r = runTool([], { CAPACITOR_PLATFORM_NAME: 'android', CAPACITOR_ROOT_DIR: os.tmpdir() });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nichts zu tun/);
  assert.equal(runTool([]).status, 1);
});

test('package.json: Testskript und Hook', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test tests/');
  // Wenn der Hook eingetragen ist, dann genau so.
  const hook = pkg.scripts['capacitor:copy:after'];
  if (hook !== undefined) assert.equal(hook, 'node tools/build-web.cjs');
});
