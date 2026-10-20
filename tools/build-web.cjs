// Übersetzt die JSX-Dateien für die iOS-App einmal beim Build statt bei jedem
// App-Start im Gerät. Läuft als capacitor:copy:after-Hook (package.json), also
// bei `npx cap copy ios` und `npx cap sync ios` (auch in der fastlane-Lane), und
// arbeitet nur auf ios/App/App/public. www/ bleibt die Quelle: Im Browser
// übersetzt babel-standalone weiter beim Laden, der Entwicklungsablauf bleibt.
//
// Übersetzt wird mit derselben Babel-Datei (www/vendor, Hash geprüft) und
// denselben Optionen wie transformScriptTags in babel-standalone: presets aus
// data-presets oder ['react','env'], die drei Standard-Plugins, targets ohne
// Browserliste. Nur die Inline-Sourcemaps fallen weg. Aus
// <script type="text/babel" src="X.jsx"> wird <script defer src="X.js">;
// X.jsx und Babel selbst fliegen aus public. Zeitpunkt: vorher nach
// DOMContentLoaded, jetzt „defer“ (kurz davor, gleiche Reihenfolge). Keine
// JSX-Datei hört auf DOMContentLoaded oder load.
//
//   node tools/build-web.cjs                   als Hook (CAPACITOR_PLATFORM_NAME=ios)
//   node tools/build-web.cjs --public <ordner> beliebige Kopie von www übersetzen
//   node tools/build-web.cjs --verify [--public <ordner>]  nur prüfen
// Bei jedem Problem: Meldung und Exit-Code 1, dann bricht auch cap copy/sync ab.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const IOS_PUBLIC = path.join('ios', 'App', 'App', 'public');
const BABEL_FILE = 'babel-standalone-7.29.0.min.js';

// Fremdbibliotheken in www/vendor mit sha384 (SRI-Format). Quelle jeweils der
// npm-Tarball der exakten Version (Registry-Integrity geprüft), Bytes identisch
// mit unpkg. Supabase: npm liefert nur dist/umd/supabase.js (bereits minifiziert);
// das bisherige jsDelivr-„supabase.min.js“ sind dieselben Bytes plus 291 Byte
// Kopfkommentar (sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug).
// Schrift: fonts.gstatic.com plusjakartasans/v12 (latin, latin-ext).
const VENDOR = {
  'react-18.3.1.production.min.js': 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z',
  'react-dom-18.3.1.production.min.js': 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1',
  'supabase-js-2.45.4.min.js': 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o',
  [BABEL_FILE]: 'sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y',
  'fonts/plus-jakarta-sans-latin.woff2': 'sha384-zAoIbUguuVPwBFBD4D1E0HKq9+SsBT2QjsvXVauH/AI0bE0WaKYB5Gt2FzvzUZUH',
  'fonts/plus-jakarta-sans-latin-ext.woff2': 'sha384-Tt5s3xv1lKdC4cBgPxae/d89FmpqWFtn8yBU+wL5M0fUZl3W222KJAnO1dJ1EuwY',
};

// Standardwerte aus babel-standalone 7.29.0 (transformScriptTags).
const DEFAULT_PRESETS = ['react', 'env'];
const DEFAULT_PLUGINS = ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'];

// Darf nach dem Build nicht mehr in public/index.html stehen.
const FORBIDDEN = /text\/babel|unpkg|jsdelivr|googleapis|gstatic/i;

function sri(buf) {
  return 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
}

// Prüft die Dateien aus VENDOR in vendorDir; skip = Namen, die fehlen dürfen.
function verifyVendor(vendorDir, skip = []) {
  const problems = [];
  for (const [name, want] of Object.entries(VENDOR)) {
    const file = path.join(vendorDir, name);
    if (!fs.existsSync(file)) {
      if (!skip.includes(name)) problems.push(`${name} fehlt`);
      continue;
    }
    const got = sri(fs.readFileSync(file));
    if (got !== want) problems.push(`${name}: ${got} statt ${want}`);
  }
  return problems;
}

// Babel erst nach Hash-Prüfung laden: der Code läuft hier in Node.
function loadBabel(file) {
  const got = sri(fs.readFileSync(file));
  if (got !== VENDOR[BABEL_FILE]) throw new Error(`${file} hat sha384 ${got}, erwartet ${VENDOR[BABEL_FILE]}`);
  return require(file);
}

function babelOptions(filename, presets) {
  return {
    filename,
    presets: presets || DEFAULT_PRESETS,
    plugins: DEFAULT_PLUGINS,
    sourceMaps: false,
    targets: { browsers: undefined },
    babelrc: false,
    configFile: false,
    browserslistConfigFile: false,
  };
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] !== undefined ? m[1] : m[2]) : undefined;
}

// Alle text/babel-Skripte in Dokumentreihenfolge. Was transformScriptTags anders
// behandeln würde (inline, async, eigene Plugins/Targets, Module), wird nicht
// still übersetzt, sondern bricht ab.
function babelTags(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const out = [];
  for (const m of html.matchAll(re)) {
    const attrs = m[1];
    const type = (attr(attrs, 'type') || '').trim().toLowerCase();
    if (type !== 'text/babel' && type !== 'text/jsx') continue;
    const src = attr(attrs, 'src');
    if (!src || m[2].trim()) throw new Error(`Inline-Skript mit type="${type}" wird nicht unterstützt`);
    for (const a of ['data-plugins', 'data-targets', 'data-type', 'async']) {
      if (new RegExp(`\\s${a}(\\s|=|$)`, 'i').test(attrs)) throw new Error(`${src}: Attribut ${a} wird nicht unterstützt`);
    }
    if (!/^[\w./-]+\.jsx$/.test(src) || src.includes('..')) throw new Error(`${src}: erwartet wird ein relativer Pfad auf .jsx`);
    const p = attr(attrs, 'data-presets');
    const presets = p === undefined ? undefined : p === '' ? [] : p.split(',').map((s) => s.trim());
    out.push({ tag: m[0], src, out: src.replace(/\.jsx$/, '.js'), presets });
  }
  return out;
}

// Übersetzt alle text/babel-Skripte aus html. readSource(src) liefert den Quelltext.
// Ergebnis: neues HTML (defer-Tags, ohne Babel-Tag) und die erzeugten Dateien.
function compileHtml(html, readSource, Babel) {
  const tags = babelTags(html);
  const files = [];
  let next = html;
  for (const t of tags) {
    const code = Babel.transform(readSource(t.src), babelOptions(t.src, t.presets)).code;
    // Syntax-Check wie im Browser: klassisches Skript im globalen Bereich.
    new vm.Script(code, { filename: t.out });
    files.push({ src: t.src, out: t.out, code });
    next = next.replace(t.tag, `<script defer src="${t.out}"></script>`);
  }
  // Babel selbst wird nicht mehr gebraucht.
  next = next.replace(/[ \t]*<script\b[^>]*\ssrc\s*=\s*["'][^"']*babel[^"']*\.js["'][^>]*>\s*<\/script\s*>[ \t]*\r?\n?/gi, '');
  return { html: next, files };
}

function listFiles(dir, pred, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, pred, acc);
    else if (pred(e.name)) acc.push(p);
  }
  return acc;
}

// Prüft einen fertigen public-Ordner. Liefert eine Liste von Problemen.
function verifyPublic(pub) {
  const problems = [];
  const indexFile = path.join(pub, 'index.html');
  if (!fs.existsSync(indexFile)) return [`${indexFile} fehlt`];
  const html = fs.readFileSync(indexFile, 'utf8');
  const hit = html.match(FORBIDDEN);
  if (hit) problems.push(`index.html enthält noch „${hit[0]}“`);
  for (const f of listFiles(pub, (n) => /\.jsx$/i.test(n) || /^babel.*\.js$/i.test(n))) {
    problems.push(`${path.relative(pub, f)} liegt noch in public`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    if (/^[a-z]+:|^\/\//i.test(m[1])) problems.push(`externes Skript ${m[1]}`);
    else if (!fs.existsSync(path.join(pub, m[1]))) problems.push(`Skript ${m[1]} fehlt`);
  }
  if (fs.existsSync(path.join(pub, 'vendor'))) problems.push(...verifyVendor(path.join(pub, 'vendor'), [BABEL_FILE]));
  return problems;
}

// Übersetzt pub an Ort und Stelle. Babel kommt aus babelPath (Hash geprüft).
function buildPublic(pub, babelPath) {
  const indexFile = path.join(pub, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');
  const t0 = Date.now();
  let files = [];
  if (babelTags(html).length) {
    const Babel = loadBabel(babelPath);
    const res = compileHtml(html, (src) => fs.readFileSync(path.join(pub, src), 'utf8'), Babel);
    files = res.files;
    for (const f of files) {
      const target = path.join(pub, f.out);
      if (fs.existsSync(target)) throw new Error(`${f.out} gibt es schon in public, würde überschrieben`);
    }
    for (const f of files) fs.writeFileSync(path.join(pub, f.out), f.code);
    for (const f of files) fs.unlinkSync(path.join(pub, f.src));
    fs.writeFileSync(indexFile, res.html);
  }
  // Babel und übrige JSX-Quellen (nicht eingebunden) gehören nicht ins Bundle.
  for (const f of listFiles(pub, (n) => /\.jsx$/i.test(n) || /^babel.*\.js$/i.test(n))) fs.unlinkSync(f);
  const problems = verifyPublic(pub);
  if (problems.length) throw new Error('Prüfung fehlgeschlagen:\n  - ' + problems.join('\n  - '));
  const bytes = files.reduce((n, f) => n + Buffer.byteLength(f.code), 0);
  return { files: files.length, bytes, ms: Date.now() - t0 };
}

function shown(p) {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel : p;
}

function main(argv, env) {
  const i = argv.indexOf('--public');
  const verifyOnly = argv.includes('--verify');
  const root = env.CAPACITOR_ROOT_DIR || ROOT;
  let pub;
  if (i >= 0) {
    if (!argv[i + 1]) throw new Error('--public braucht einen Ordner');
    pub = path.resolve(argv[i + 1]);
  } else if (env.CAPACITOR_PLATFORM_NAME) {
    if (env.CAPACITOR_PLATFORM_NAME !== 'ios') {
      console.log(`build-web: nichts zu tun für ${env.CAPACITOR_PLATFORM_NAME}`);
      return 0;
    }
    pub = path.join(root, IOS_PUBLIC);
  } else if (verifyOnly) {
    pub = path.join(root, IOS_PUBLIC);
  } else {
    throw new Error('nur als capacitor:copy:after-Hook (CAPACITOR_PLATFORM_NAME=ios) oder mit --public <ordner>');
  }
  if (verifyOnly) {
    const problems = verifyPublic(pub);
    if (problems.length) throw new Error('Prüfung fehlgeschlagen:\n  - ' + problems.join('\n  - '));
    console.log(`build-web: ${shown(pub)} geprüft, alles in Ordnung`);
    return 0;
  }
  const r = buildPublic(pub, path.join(root, 'www', 'vendor', BABEL_FILE));
  console.log(`build-web: ${r.files} JSX-Dateien übersetzt (${Math.round(r.bytes / 1024)} KB, ${r.ms} ms), ${shown(pub)} geprüft`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2), process.env);
  } catch (e) {
    console.error('build-web: ' + e.message);
    process.exitCode = 1;
  }
}

module.exports = {
  VENDOR, BABEL_FILE, DEFAULT_PRESETS, DEFAULT_PLUGINS, FORBIDDEN,
  sri, verifyVendor, loadBabel, babelOptions, babelTags, compileHtml, verifyPublic, buildPublic, main,
};
