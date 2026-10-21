// Baut die iOS-App: www/ → dist/ (webDir in capacitor.config.json).
//
//   npm run build        läuft auch automatisch vor `npx cap sync` / `npx cap copy`
//
// www/ bleibt die Quelle und läuft im Browser wie bisher: Babel übersetzt das
// JSX beim Laden, React, Supabase und die Schrift kommen vom CDN. Für die App
// ist das zu langsam, Babel allein braucht auf dem iPhone über eine Sekunde,
// und vor dem ersten Bild muss alles aus dem Netz kommen. Der Build
//   - übersetzt die JSX-Dateien vorab, mit denselben Einstellungen wie Babel im
//     Browser (buildBabelOptions in @babel/standalone),
//   - nimmt React (Produktions-Build), Supabase, die Capacitor-Plugins und die
//     Schrift aus node_modules (dist/vendor/),
//   - ersetzt in index.html die Blöcke <!-- build:fonts --> und
//     <!-- build:vendor --> (jeweils bis <!-- /build -->).
const fs = require('node:fs');
const path = require('node:path');
const Babel = require('@babel/standalone');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const DIST = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');

// Nur für die Entwicklung, gehört nicht in die App.
const SKIP = /(\.md|\.sql|\.jsx|\.DS_Store)$/;

const VENDOR = {
  'react.js': 'react/umd/react.production.min.js',
  'react-dom.js': 'react-dom/umd/react-dom.production.min.js',
  'supabase.js': '@supabase/supabase-js/dist/umd/supabase.js',
  'capacitor.js': '@capacitor/core/dist/capacitor.js',
  'capacitor-app.js': '@capacitor/app/dist/plugin.js',
  'capacitor-preferences.js': '@capacitor/preferences/dist/plugin.js',
  'capacitor-haptics.js': '@capacitor/haptics/dist/plugin.js',
  'capacitor-push-notifications.js': '@capacitor/push-notifications/dist/plugin.js',
};
const FONT_DIR = '@fontsource-variable/plus-jakarta-sans';
const FONTS = ['latin', 'latin-ext']; // Deutsch und Englisch; Umlaute stecken in latin

// Wie buildBabelOptions in @babel/standalone für <script type="text/babel">.
function babelOptions(filename, presets) {
  return {
    filename,
    sourceFileName: filename,
    presets: presets || ['react', 'env'],
    plugins: ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'],
    targets: { browsers: undefined },
    sourceMaps: true,
    // Im Browser gibt es keine Konfigurationsdateien; hier keine aus dem Projekt lesen.
    babelrc: false,
    configFile: false,
    browserslistConfigFile: false,
  };
}

function compileJsx(src, presets) {
  const input = fs.readFileSync(path.join(WWW, src), 'utf8');
  const out = src.replace(/\.jsx$/, '.js');
  if (fs.existsSync(path.join(WWW, out))) throw new Error(`${out} gibt es schon in www/, ${src} würde es überschreiben`);
  let result;
  try { result = Babel.transform(input, babelOptions(path.basename(src), presets)); }
  catch (e) { throw new Error(`${src}: ${e.message}`); }
  const file = path.join(DIST, out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${result.code}\n//# sourceMappingURL=${path.basename(out)}.map\n`);
  fs.writeFileSync(`${file}.map`, JSON.stringify(result.map));
  return out;
}

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.test(entry.name)) continue;
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyTree(a, b); }
    else fs.copyFileSync(a, b);
  }
}

function copyVendor() {
  const dir = path.join(DIST, 'vendor');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, from] of Object.entries(VENDOR)) {
    const src = path.join(NM, from);
    if (!fs.existsSync(src)) throw new Error(`${from} fehlt, erst npm install ausführen`);
    // sourceMappingURL-Kommentare entfernen: die .map-Dateien kopieren wir nicht.
    const code = fs.readFileSync(src, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
    fs.writeFileSync(path.join(dir, name), code);
  }
  // @font-face aus dem Fontsource-Paket, Familie wie bei Google Fonts benannt,
  // damit --font in redesign.css unverändert greift.
  const css = fs.readFileSync(path.join(NM, FONT_DIR, 'wght.css'), 'utf8');
  const faces = FONTS.map(subset => {
    const block = css.match(new RegExp(`/\\* plus-jakarta-sans-${subset}-wght-normal \\*/\\s*@font-face\\s*\\{([^}]*)\\}`));
    if (!block) throw new Error(`Schrift-Subset ${subset} nicht in ${FONT_DIR}/wght.css`);
    const range = block[1].match(/unicode-range:\s*([^;]+);/)[1];
    const file = `plus-jakarta-sans-${subset}.woff2`;
    fs.copyFileSync(path.join(NM, FONT_DIR, 'files', `plus-jakarta-sans-${subset}-wght-normal.woff2`), path.join(dir, file));
    return { file, css: `@font-face { font-family: 'Plus Jakarta Sans'; font-style: normal; font-display: swap; font-weight: 200 800; src: url(vendor/${file}) format('woff2'); unicode-range: ${range}; }` };
  });
  return faces;
}

function replaceBlock(html, name, replacement) {
  const re = new RegExp(`([ \\t]*)<!-- build:${name} -->[\\s\\S]*?<!-- /build -->`);
  if (!re.test(html)) throw new Error(`<!-- build:${name} --> … <!-- /build --> fehlt in www/index.html`);
  return html.replace(re, (_, indent) => replacement.trim().split('\n').map(l => indent + l.trim()).join('\n'));
}

function build() {
  const started = Date.now();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyTree(WWW, DIST);
  const faces = copyVendor();

  let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  let compiled = 0;
  html = html.replace(/<script\b([^>]*)><\/script>/g, (tag, attrs) => {
    if (!/\btype="text\/babel"/.test(attrs)) return tag;
    const src = attrs.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) throw new Error(`Inline-Babel-Skript in index.html wird nicht unterstützt: ${tag}`);
    const presets = attrs.match(/\bdata-presets="([^"]*)"/)?.[1].split(',').map(s => s.trim());
    compiled++;
    return `<script src="${compileJsx(src, presets)}"></script>`;
  });

  html = replaceBlock(html, 'fonts', `
    ${faces.map(f => `<link rel="preload" href="vendor/${f.file}" as="font" type="font/woff2" crossorigin />`).join('\n')}
    <style>
    ${faces.map(f => f.css).join('\n')}
    </style>
  `);
  html = replaceBlock(html, 'vendor', `
    <script src="vendor/supabase.js"></script>
    <script src="vendor/capacitor.js"></script>
    <script src="vendor/capacitor-app.js"></script>
    <script src="vendor/capacitor-preferences.js"></script>
    <script src="vendor/capacitor-haptics.js"></script>
    <script src="vendor/capacitor-push-notifications.js"></script>
    <script>
    // Dieselben Globals wie die CDN-Module in www/index.html, nur sofort da.
    (function () {
    var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    window.PTPreferencesReady = Promise.resolve(native ? window.capacitorPreferences : null);
    window.PTAppReady = Promise.resolve(native ? window.capacitorApp : null);
    window.PTCelebrationHaptics = window.capacitorHaptics || null;
    window.PTPushNotifications = native ? window.capacitorPushNotifications : null;
    })();
    </script>
    <script src="vendor/react.js"></script>
    <script src="vendor/react-dom.js"></script>
  `);

  const leftover = html.match(/text\/babel|unpkg\.com|cdn\.jsdelivr\.net|fonts\.g(oogleapis|static)\.com/);
  if (leftover) throw new Error(`dist/index.html lädt noch „${leftover[0]}“, bitte einen build:-Block in www/index.html ergänzen`);
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  console.log(`dist/ gebaut: ${compiled} JSX-Dateien übersetzt, ${Object.keys(VENDOR).length + faces.length} Vendor-Dateien, ${Date.now() - started} ms`);
}

if (require.main === module) {
  try { build(); }
  catch (e) { console.error(`Build fehlgeschlagen: ${e.message}`); process.exit(1); }
}

module.exports = { build, babelOptions };
