// Prüft die Werbung (AdMob) vor jedem Release:
// - Konfiguration: Test-App-ID nur im Testmodus, App-ID in Info.plist gleich
//   PROD.appId in www/ads.js, Publisher-IDs von App und Anzeigenblöcken gleich.
// - Einbindung: ads.js als klassisches Skript, Banner-Abstand --pt-ad-h, Overlays.
// - Verhalten von window.PTAds mit einem nachgebauten nativen AdMob-Plugin
//   (Einwilligung erst bei gewünschtem Banner, nie unter einem Overlay).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const ADS_SRC = fs.readFileSync(path.join(WWW, 'ads.js'), 'utf8');
// Verhalten immer gegen kontrollierte Test-IDs prüfen; die echte Konfiguration
// wird separat unverändert gegen die nativen Dateien und Release-Sperre geprüft.
const TEST_SOURCE = ADS_SRC.replace(/const PROD(?:_ANDROID)? = \{[\s\S]*?\n  \};/g,
  (block) => block.replace(/(appId|banner|rewarded): '[^']*'/g, "$1: ''"));
const PLIST = fs.readFileSync(path.join(ROOT, 'ios', 'App', 'App', 'Info.plist'), 'utf8');

// Googles öffentliche Test-Publisher-ID (developers.google.com/admob/ios/test-ads)
const TEST_PUB = '3940256099942544';
const APP_ID_RE = /^ca-app-pub-(\d{16})~(\d{10})$/;
const UNIT_RE = /^ca-app-pub-(\d{16})\/(\d{10})$/;

const plain = (x) => JSON.parse(JSON.stringify(x));

function plistValue(key) {
  const clean = PLIST.replace(/<!--[\s\S]*?-->/g, '');
  const m = clean.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1].trim() : null;
}

function androidAppId() {
  const manifestPath = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) return null;
  const xml = fs.readFileSync(manifestPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const tag = (xml.match(/<meta-data\b[^>]*>/g) || [])
    .find((tag) => /android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"/.test(tag));
  const value = tag?.match(/android:value="([^"]+)"/)?.[1];
  if (!value?.startsWith('@string/')) return value || null;
  const strings = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  const name = value.slice('@string/'.length);
  return strings.match(new RegExp(`<string name="${name}">([^<]+)</string>`))?.[1] || null;
}

// Was vor einem Release nicht passieren darf. Leere Liste = in Ordnung.
function configProblems({ config, plistAppId }) {
  const p = [];
  const prod = config.prod || {};
  const plist = APP_ID_RE.exec(plistAppId || '');
  if (!plist) p.push(`GADApplicationIdentifier „${plistAppId}“ hat nicht die Form ca-app-pub-<16 Ziffern>~<10 Ziffern>`);
  if (!!prod.appId !== !!prod.banner) p.push('PROD.appId und PROD.banner nur zusammen eintragen');
  if (config.testing !== !prod.banner) p.push('testing muss genau dann true sein, wenn PROD.banner leer ist');
  if (!config.testing) {
    if (plist && plist[1] === TEST_PUB) p.push('Info.plist hat noch die Google-Test-App-ID, testing ist aber false');
    if (plistAppId !== prod.appId) p.push(`Info.plist (${plistAppId}) und PROD.appId (${prod.appId}) unterscheiden sich`);
    const app = APP_ID_RE.exec(prod.appId || '');
    if (!app) p.push(`PROD.appId „${prod.appId}“ hat nicht die Form ca-app-pub-…~…`);
    for (const [name, unit] of Object.entries({ banner: prod.banner, rewarded: prod.rewarded })) {
      if (!unit) { if (name === 'banner') p.push('PROD.banner fehlt'); continue; }
      const u = UNIT_RE.exec(unit);
      if (!u) { p.push(`PROD.${name} „${unit}“ hat nicht die Form ca-app-pub-…/…`); continue; }
      if (u[1] === TEST_PUB) p.push(`PROD.${name} ist ein Google-Testblock`);
      if (app && u[1] !== app[1]) p.push(`Publisher-ID von PROD.${name} (pub-${u[1]}) passt nicht zur App-ID (pub-${app[1]})`);
      if (plist && u[1] !== plist[1]) p.push(`Publisher-ID von PROD.${name} passt nicht zu Info.plist`);
    }
  } else {
    for (const unit of [config.banner, config.rewarded]) {
      assert.ok(unit.startsWith(`ca-app-pub-${TEST_PUB}/`), `Testmodus ohne Test-Block: ${unit}`);
    }
    // Echte App-ID mit Testblöcken ist erlaubt (Google-Testblöcke laufen mit jeder App-ID).
    if (plist && plist[1] !== TEST_PUB && prod.appId && plistAppId !== prod.appId) {
      p.push('Info.plist und PROD.appId unterscheiden sich');
    }
  }
  return p;
}

// ── Nachgebaute Umgebung ────────────────────────────────────────────────────
// native: false = Browser, null = gar kein window.Capacitor.
function makeEnv({ native = true, platform = 'ios', plugin = true, info = {}, afterForm = {},
  failInfo = 0, afterPrivacy = {}, source = TEST_SOURCE } = {}) {
  const calls = [];
  const listeners = {};
  const present = new Set();
  const style = {};
  const winListeners = {};
  const timers = [];
  let events = 0;
  let observer = null;
  let infoFails = failInfo;
  const consent = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false,
    privacyOptionsRequirementStatus: 'REQUIRED', ...info };
  const AdMob = {
    async requestConsentInfo(o) {
      calls.push(['requestConsentInfo', o]);
      if (infoFails > 0) { infoFails--; throw new Error('offline'); }
      return { ...consent };
    },
    async showConsentForm() {
      calls.push(['showConsentForm']);
      Object.assign(consent, { status: 'OBTAINED', canRequestAds: true, ...afterForm });
      return { status: consent.status, canRequestAds: consent.canRequestAds,
        privacyOptionsRequirementStatus: consent.privacyOptionsRequirementStatus };
    },
    async showPrivacyOptionsForm() { calls.push(['showPrivacyOptionsForm']); Object.assign(consent, afterPrivacy); },
    async initialize(o) { calls.push(['initialize', o]); },
    async showBanner(o) { calls.push(['showBanner', o]); },
    async hideBanner() { calls.push(['hideBanner']); },
    async resumeBanner() { calls.push(['resumeBanner']); },
    async removeBanner() { calls.push(['removeBanner']); },
    addListener(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return { remove() {} }; },
  };
  const document = {
    documentElement: { style: { setProperty(k, v) { style[k] = v; } } },
    body: { appendChild() {} },
    createElement() { return { style: {}, remove() {} }; },
    querySelector(sel) {
      if (sel === '.tabbar-inner') return { getBoundingClientRect: () => ({ top: 700 }) };
      return sel.split(',').some((s) => present.has(s.trim())) ? {} : null;
    },
  };
  const window = {
    innerHeight: 800,
    dispatchEvent(e) { if (e.type === 'pt:ads-change') events++; },
    addEventListener(t, cb) { (winListeners[t] = winListeners[t] || []).push(cb); },
  };
  if (native !== null) {
    window.Capacitor = { isNativePlatform: () => native, getPlatform: () => platform, Plugins: plugin ? { AdMob } : {} };
  }
  class CustomEvent { constructor(type) { this.type = type; } }
  class MutationObserver { constructor(cb) { observer = cb; } observe() {} }
  const ctx = vm.createContext({
    window, document, CustomEvent, MutationObserver, Promise,
    requestAnimationFrame: (cb) => cb(),
    getComputedStyle: () => ({ paddingBottom: '34px' }),
    console: { warn() {}, log() {} },
    // Keine echten Timer: der 60-s-Neuversuch soll den Testlauf nicht aufhalten.
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  vm.runInContext(source, ctx, { filename: 'ads.js' });
  return {
    PTAds: window.PTAds,
    calls,
    names: () => calls.map((c) => c[0]),
    count: (name) => calls.filter((c) => c[0] === name).length,
    arg: (name) => plain(calls.find((c) => c[0] === name)?.[1] ?? null),
    fire: (ev, data) => (listeners[ev] || []).forEach((cb) => cb(data)),
    overlay(sel, on) { if (on) present.add(sel); else present.delete(sel); observer?.(); },
    online: () => (winListeners.online || []).forEach((cb) => cb()),
    inset: () => style['--pt-ad-h'],
    events: () => events,
    timers,
  };
}

// Viele Mikrotask-Runden, bis alle await-Ketten im Skript durch sind.
async function settle() { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); }

// ── Konfiguration ───────────────────────────────────────────────────────────

test('Konfiguration in www/ads.js und Info.plist passt zusammen (Release-Sperre)', () => {
  const { config } = makeEnv({ native: false, source: ADS_SRC }).PTAds;
  const plistAppId = plistValue('GADApplicationIdentifier');
  assert.deepEqual(configProblems({ config, plistAppId }), []);
});

// fastlane release (App Store) setzt ADS_REQUIRE_LIVE=1: Ist Werbung an, darf
// der Build keine Google-Testanzeigen ausliefern. TestFlight (beta) darf das.
test('Release-Sperre: mit ADS_REQUIRE_LIVE=1 keine Testanzeigen im App-Store-Build',
  { skip: process.env.ADS_REQUIRE_LIVE !== '1' && 'nur mit ADS_REQUIRE_LIVE=1 (fastlane release)' }, () => {
    const platform = process.env.ADS_PLATFORM || 'ios';
    const { config } = makeEnv({ native: false, platform, source: ADS_SRC }).PTAds;
    assert.ok(!config.enabled || !config.testing,
      `ADS_ENABLED ist an, aber die produktive Banner-ID für ${platform} fehlt: Der Build zeigt nur Testanzeigen. `
      + 'Echte IDs eintragen (docs/launch/ADMOB.md) oder ADS_ENABLED = false.');
    if (config.enabled) {
      const nativeId = platform === 'android' ? androidAppId() : plistValue('GADApplicationIdentifier');
      assert.deepEqual(configProblems({ config, plistAppId: nativeId }), []);
      assert.notEqual(APP_ID_RE.exec(nativeId || '')?.[1], TEST_PUB,
        `${platform}: Native Konfiguration hat noch die Google-Test-App-ID`);
    }
  });

test('Prüfregeln schlagen bei typischen Release-Fehlern an', () => {
  const real = { appId: 'ca-app-pub-1234567890123456~1111111111', banner: 'ca-app-pub-1234567890123456/2222222222', rewarded: '' };
  const testIds = { appId: `ca-app-pub-${TEST_PUB}~1458002511`, banner: `ca-app-pub-${TEST_PUB}/2435281174`, rewarded: `ca-app-pub-${TEST_PUB}/1712485313` };
  const live = { testing: false, prod: real, ...real };
  // Alles richtig.
  assert.deepEqual(configProblems({ config: live, plistAppId: real.appId }), []);
  // Echte Units, aber Info.plist noch mit der Test-App-ID.
  assert.match(configProblems({ config: live, plistAppId: testIds.appId }).join('\n'), /Test-App-ID/);
  // Publisher-ID der Units passt nicht zur App.
  const other = { ...real, banner: 'ca-app-pub-9999999999999999/2222222222' };
  assert.match(configProblems({ config: { testing: false, prod: other, ...other }, plistAppId: real.appId }).join('\n'), /Publisher-ID/);
  // Halb ausgefüllt: App-ID ohne Banner.
  const half = { appId: real.appId, banner: '', rewarded: '' };
  assert.match(configProblems({ config: { testing: true, prod: half, ...testIds }, plistAppId: real.appId }).join('\n'), /nur zusammen/);
  // testing false, obwohl PROD leer.
  assert.match(configProblems({ config: { testing: false, prod: { appId: '', banner: '', rewarded: '' }, ...testIds }, plistAppId: testIds.appId }).join('\n'), /testing muss/);
  // Testmodus mit Test-App-ID ist in Ordnung.
  assert.deepEqual(configProblems({ config: { testing: true, prod: { appId: '', banner: '', rewarded: '' }, ...testIds }, plistAppId: testIds.appId }), []);
});

test('Testmodus hängt nur an PROD.banner und nutzt Googles Test-Blöcke', () => {
  const env = makeEnv({ native: false });
  const c = env.PTAds.config;
  assert.equal(c.testing, !c.prod.banner);
  assert.equal(c.enabled, true);
  assert.equal(c.nonPersonalized, true);
  assert.equal(c.maxAdContentRating, 'General');
  if (c.testing) assert.ok(c.banner.startsWith(`ca-app-pub-${TEST_PUB}/`));
  // Mit echten IDs (per Quelltext ersetzt) ist der Testmodus aus und die echten Blöcke gelten.
  const src = TEST_SOURCE
    .replace(/appId: '',/, "appId: 'ca-app-pub-1234567890123456~1111111111',")
    .replace(/banner: '',/, "banner: 'ca-app-pub-1234567890123456/2222222222',");
  const live = makeEnv({ native: false, source: src }).PTAds.config;
  assert.equal(live.testing, false);
  assert.equal(live.banner, 'ca-app-pub-1234567890123456/2222222222');
});

test('Info.plist: SKAdNetwork-Liste, Tracking-Text als Absicherung', () => {
  const clean = PLIST.replace(/<!--[\s\S]*?-->/g, '');
  const ids = [...clean.matchAll(/<key>SKAdNetworkIdentifier<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  assert.ok(ids.includes('cstr6suwn9.skadnetwork'), 'Googles eigene SKAdNetwork-ID fehlt');
  assert.equal(new Set(ids).size, ids.length, 'doppelte SKAdNetwork-IDs');
  assert.ok(ids.every((id) => /^[a-z0-9]+\.skadnetwork$/.test(id)));
  assert.ok((plistValue('NSUserTrackingUsageDescription') || '').length > 20);
});

// ── Einbindung ──────────────────────────────────────────────────────────────

test('index.html bindet ads.js als klassisches Skript vor den JSX-Dateien ein', () => {
  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="ads\.js"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(tags, ['<script src="ads.js">']);
  const at = html.indexOf('src="ads.js"');
  assert.ok(at > html.indexOf('src="onboarding-model.js"'));
  assert.ok(at < html.indexOf('type="text/babel"'));
  // Kein CDN, kein Modul-Import: das Plugin kommt von der nativen Bridge.
  assert.doesNotMatch(ADS_SRC, /https?:\/\/|import\(/);
  assert.match(ADS_SRC, /Capacitor\.Plugins\.AdMob|C\.Plugins\.AdMob/);
});

test('Banner-Abstand --pt-ad-h an .app-main, .toast und Demo-Knopf', () => {
  const css = fs.readFileSync(path.join(WWW, 'redesign.css'), 'utf8');
  for (const sel of ['.app-main', '.toast']) {
    const block = css.match(new RegExp(`\\n\\${sel} \\{([^}]*)\\}`));
    assert.ok(block, `${sel} nicht gefunden`);
    assert.match(block[1], /var\(--pt-ad-h, 0px\)/, `${sel} ohne --pt-ad-h`);
  }
  assert.match(fs.readFileSync(path.join(WWW, 'demo.js'), 'utf8'), /pt-demo-badge[\s\S]*var\(--pt-ad-h,0px\)/);
});

test('Overlay-Selektor: jede Klasse gibt es im CSS (auch Onboarding-Ebenen)', () => {
  const sel = makeEnv({ native: false }).PTAds.config.overlaySelector;
  const css = fs.readdirSync(WWW).filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(WWW, f), 'utf8')).join('\n');
  const classes = sel.split(',').map((s) => s.trim()).filter((s) => s.startsWith('.'));
  for (const c of ['.sheet', '.chart-fs', '.celebration-overlay', '.ob-layer', '.ob-cele']) assert.ok(classes.includes(c), c);
  for (const c of classes) assert.match(css, new RegExp(`\\${c}\\s*\\{`), `${c} gibt es im CSS nicht mehr`);
  assert.ok(sel.includes('[aria-modal="true"]'));
});

test('app.jsx: Banner nur in Feed und Stats, erst nach dem Onboarding, nie in der Demo', () => {
  const app = fs.readFileSync(path.join(WWW, 'app.jsx'), 'utf8');
  assert.match(app, /const adsOk = api\?\.mode !== 'demo' && !intro && !layer && \(!newcomer \|\| !!obState\.firstLog\);/);
  assert.match(app, /PTAds\?\.setBannerWanted\(adsOk && \(tab === 'feed' \|\| tab === 'history'\)\)/);
  assert.match(app, /if \(adsOk\) window\.PTAds\?\.checkConsent\(\)/);
  // Kein Aufruf, der das Formular sofort zeigen könnte.
  assert.doesNotMatch(app, /PTAds\?*\.(init|showRewarded)\(/);
});

// ── Verhalten ───────────────────────────────────────────────────────────────

test('Browser, fremde Plattform oder fehlendes Plugin: alles No-op', async () => {
  for (const opts of [{ native: false }, { native: null }, { platform: 'windows' }, { plugin: false }]) {
    const env = makeEnv(opts);
    assert.equal(env.PTAds.config.active, false);
    assert.equal(await env.PTAds.checkConsent(), false);
    env.PTAds.setBannerWanted(true);
    await env.PTAds.showPrivacyOptions();
    assert.equal(await env.PTAds.showRewarded(), false);
    await settle();
    assert.deepEqual(env.calls, []);
    assert.equal(env.PTAds.privacyOptionsRequired(), false);
  }
});

test('ADS_ENABLED = false: kein SDK-Start, keine Anfrage an Google', async () => {
  const src = TEST_SOURCE.replace('const ADS_ENABLED = true;', 'const ADS_ENABLED = false;');
  assert.notEqual(src, ADS_SRC);
  const env = makeEnv({ source: src, info: { canRequestAds: true, status: 'OBTAINED' } });
  assert.equal(env.PTAds.config.enabled, false);
  assert.equal(await env.PTAds.checkConsent(), false);
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.deepEqual(env.calls, []);
});

test('checkConsent fragt nur den Stand ab, ohne Formular und ohne SDK-Start', async () => {
  const env = makeEnv();
  assert.equal(await env.PTAds.checkConsent(), false);
  assert.deepEqual(env.names(), ['requestConsentInfo']);
  // Testmodus: Debug-Geografie EWR (1).
  assert.deepEqual(env.arg('requestConsentInfo'), { debugGeography: 1, testDeviceIdentifiers: [] });
  assert.equal(env.PTAds.privacyOptionsRequired(), true);
  assert.ok(env.events() >= 1, 'pt:ads-change fehlt');
  // Zweiter Aufruf fragt nicht erneut.
  await env.PTAds.checkConsent();
  assert.equal(env.count('requestConsentInfo'), 1);
});

test('Banner gewünscht: erst Formular, dann SDK, dann Test-Banner über der Tab-Leiste', async () => {
  const env = makeEnv();
  await env.PTAds.checkConsent();
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.deepEqual(env.names(), ['requestConsentInfo', 'showConsentForm', 'initialize', 'showBanner']);
  assert.deepEqual(env.arg('initialize'), { testingDevices: [], initializeForTesting: false, maxAdContentRating: 'General' });
  assert.deepEqual(env.arg('showBanner'), {
    adId: `ca-app-pub-${TEST_PUB}/2435281174`, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER',
    margin: 800 - 700 - 34 + 8, isTesting: true, npa: true,
  });
  // Erst mit geladener Anzeige rückt der Inhalt nach oben.
  assert.equal(env.inset(), '0px');
  env.fire('bannerAdSizeChanged', { width: 390, height: 50 });
  env.fire('bannerAdLoaded', {});
  assert.equal(env.inset(), '58px');
  assert.equal(env.count('hideBanner'), 0);
});

test('Wiederkehrende Person mit Einwilligung: SDK startet still, Banner erst auf Wunsch', async () => {
  const env = makeEnv({ info: { status: 'OBTAINED', canRequestAds: true } });
  assert.equal(await env.PTAds.checkConsent(), true);
  assert.deepEqual(env.names(), ['requestConsentInfo', 'initialize']);
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.deepEqual(env.names(), ['requestConsentInfo', 'initialize', 'showBanner']);
});

test('Unter einem Overlay (z. B. Onboarding-Ebene) kommt kein Formular, erst danach', async () => {
  const env = makeEnv();
  env.overlay('.ob-layer', true);
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.equal(env.count('showConsentForm'), 0);
  assert.equal(env.count('showBanner'), 0);
  env.overlay('.ob-layer', false);
  await settle();
  assert.equal(env.count('showConsentForm'), 1);
  assert.equal(env.count('showBanner'), 1);
});

test('Sheet oder Vollbild blendet das Banner aus und wieder ein', async () => {
  const env = makeEnv({ info: { status: 'OBTAINED', canRequestAds: true } });
  env.PTAds.setBannerWanted(true);
  await settle();
  env.fire('bannerAdSizeChanged', { width: 390, height: 50 });
  for (const sel of ['.sheet', '.chart-fs', '.celebration-overlay', '.ob-cele']) {
    const hides = env.count('hideBanner');
    env.overlay(sel, true);
    await settle();
    assert.equal(env.count('hideBanner'), hides + 1, `${sel} blendet nicht aus`);
    const resumes = env.count('resumeBanner');
    env.overlay(sel, false);
    await settle();
    assert.equal(env.count('resumeBanner'), resumes + 1, `${sel} blendet nicht wieder ein`);
  }
  // Tab ohne Banner: ausblenden, Abstand 0.
  env.PTAds.setBannerWanted(false);
  await settle();
  assert.equal(env.inset(), '0px');
  assert.equal(env.names().at(-1), 'hideBanner');
});

test('Keine Anzeige (No-Fill): keine Lücke, Neuversuch nach 60 s', async () => {
  const env = makeEnv({ info: { status: 'OBTAINED', canRequestAds: true } });
  env.PTAds.setBannerWanted(true);
  await settle();
  env.fire('bannerAdSizeChanged', { width: 390, height: 50 });
  assert.equal(env.inset(), '58px');
  env.fire('bannerAdFailedToLoad', { code: 3, message: 'No fill' });
  assert.equal(env.inset(), '0px');
  const retry = env.timers.at(-1);
  assert.equal(retry.ms, 60000);
  retry.fn();
  await settle();
  assert.equal(env.count('showBanner'), 2);
});

test('Formular höchstens einmal pro Sitzung', async () => {
  // Formular ohne Entscheidung geschlossen: weiter keine Anzeigen, kein zweites Formular.
  const env = makeEnv({ afterForm: { status: 'REQUIRED', canRequestAds: false } });
  env.PTAds.setBannerWanted(true);
  await settle();
  env.PTAds.setBannerWanted(false);
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.equal(env.count('showConsentForm'), 1);
  assert.equal(env.count('initialize'), 0);
});

test('Offline gestartet: nach „online“ neuer Versuch', async () => {
  const env = makeEnv({ failInfo: 1, info: { status: 'OBTAINED', canRequestAds: true } });
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.equal(env.count('initialize'), 0);
  env.online();
  await settle();
  assert.equal(env.count('requestConsentInfo'), 2);
  assert.equal(env.count('showBanner'), 1);
});

test('Einstellungen → Werbe-Einwilligung öffnet Googles Datenschutzoptionen', async () => {
  const env = makeEnv();
  await env.PTAds.checkConsent();
  await env.PTAds.showPrivacyOptions();
  assert.deepEqual(env.names(), ['requestConsentInfo', 'showPrivacyOptionsForm', 'requestConsentInfo']);
});


test('Android nutzt eigene Test-IDs und denselben UMP-Ablauf', async () => {
  const env = makeEnv({ platform: 'android' });
  assert.equal(env.PTAds.config.active, true);
  assert.equal(env.PTAds.config.platform, 'android');
  assert.equal(env.PTAds.config.testing, true);
  assert.equal(env.PTAds.config.appId, `ca-app-pub-${TEST_PUB}~3347511713`);
  env.PTAds.setBannerWanted(true);
  await settle();
  assert.deepEqual(env.names(), ['requestConsentInfo', 'showConsentForm', 'initialize', 'showBanner']);
  assert.equal(env.arg('showBanner').adId, `ca-app-pub-${TEST_PUB}/9214589741`);
  assert.equal(env.arg('showBanner').npa, true);
});

test('Produktive iOS-IDs aktivieren keine Android-Anzeigen mit fremden IDs', () => {
  const src = TEST_SOURCE
    .replace(/appId: '',/, "appId: 'ca-app-pub-1234567890123456~1111111111',")
    .replace(/banner: '',/, "banner: 'ca-app-pub-1234567890123456/2222222222',");
  const android = makeEnv({ platform: 'android', source: src }).PTAds.config;
  assert.equal(android.testing, true);
  assert.equal(android.prod.banner, '');
  assert.equal(android.banner, `ca-app-pub-${TEST_PUB}/9214589741`);
});

test('Widerruf entfernt das alte Banner und sperrt neue Anfragen ohne UMP-Freigabe', async () => {
  const env = makeEnv({
    info: { status: 'OBTAINED', canRequestAds: true },
    afterPrivacy: { status: 'REQUIRED', canRequestAds: false },
  });
  env.PTAds.setBannerWanted(true);
  await settle();
  env.fire('bannerAdSizeChanged', { width: 390, height: 50 });
  assert.equal(env.count('showBanner'), 1);
  await env.PTAds.showPrivacyOptions();
  await settle();
  assert.equal(env.count('removeBanner'), 1);
  assert.equal(env.inset(), '0px');
  env.PTAds.setBannerWanted(false);
  env.PTAds.setBannerWanted(true);
  assert.equal(await env.PTAds.checkConsent(), false);
  await settle();
  assert.equal(env.count('showBanner'), 1);
  assert.equal(env.count('resumeBanner'), 0);
});

test('Nach neuer UMP-Freigabe wird ein neues Banner geladen', async () => {
  const env = makeEnv({ info: { status: 'OBTAINED', canRequestAds: true } });
  env.PTAds.setBannerWanted(true);
  await settle();
  await env.PTAds.showPrivacyOptions();
  await settle();
  assert.equal(env.count('removeBanner'), 1);
  assert.equal(env.count('showBanner'), 2);
  assert.equal(env.count('resumeBanner'), 0);
  assert.equal(env.count('initialize'), 1);
});

test('iOS deaktiviert Googles Publisher first-party ID vor dem SDK-Start', () => {
  const delegate = fs.readFileSync(path.join(ROOT, 'ios/App/App/AppDelegate.swift'), 'utf8');
  assert.match(delegate, /setPublisherFirstPartyIDEnabled\(false\)/);
});


test('Android-Manifest hat eine zur Anzeigenkonfiguration passende App-ID', () => {
  const { config } = makeEnv({ platform: 'android', native: false, source: ADS_SRC }).PTAds;
  assert.deepEqual(configProblems({ config, plistAppId: androidAppId() }), []);
});

test('Android deaktiviert Googles Publisher first-party ID vor dem SDK-Start', () => {
  const activity = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/bennyjoni/terminator/MainActivity.java'), 'utf8');
  assert.match(activity, /putPublisherFirstPartyIdEnabled\(false\)/);
});
