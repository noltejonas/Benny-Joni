// Prüft, dass App, Widget-Extension und Web-Brücke zusammenpassen
// (ios/App/BennyJoniWidget, ios/App/Shared/WidgetStore.swift, www/widget-model.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');

test('App und Widget haben dieselbe Version und Build-Nummer (App Store prüft das)', () => {
  const versions = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1]);
  const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(m => m[1]);
  assert.equal(versions.length, 4, 'Debug und Release für App und Widget');
  assert.equal(new Set(versions).size, 1, versions.join(', '));
  assert.equal(new Set(builds).size, 1, builds.join(', '));
});

test('Widget-Extension ist eingebettet und hat eigene Bundle-ID unter der App', () => {
  assert.match(pbx, /BennyJoniWidget\.appex in Embed Foundation Extensions/);
  assert.match(pbx, /PRODUCT_BUNDLE_IDENTIFIER = com\.bennyjoni\.terminator\.widget;/);
  assert.match(pbx, /productType = "com\.apple\.product-type\.app-extension";/);
  assert.doesNotMatch(pbx, /iPhoneOS\d+\.\d+\.sdk/, 'keine fest verdrahteten SDK-Pfade');
});

test('Geteilte Keychain-Gruppe stimmt in App, Widget und Info.plist überein', () => {
  const group = '$(AppIdentifierPrefix)com.bennyjoni.terminator.shared';
  for (const f of ['ios/App/App/App.entitlements', 'ios/App/BennyJoniWidget/BennyJoniWidget.entitlements',
    'ios/App/App/Info.plist', 'ios/App/BennyJoniWidget/Info.plist']) {
    assert.ok(read(f).includes(`<string>${group}</string>`), f);
  }
  // Eigene Gruppe der App zuerst: sonst wechselt ihre Standard-Gruppe für Keychain-Einträge
  const app = read('ios/App/App/App.entitlements');
  assert.ok(app.indexOf('com.bennyjoni.terminator</string>') < app.indexOf('com.bennyjoni.terminator.shared</string>'));
  assert.match(read('ios/App/Shared/WidgetStore.swift'), /forInfoDictionaryKey: "BJSharedKeychainGroup"/);
  // Keine App Group mehr (nicht per API-Key signierbar)
  for (const f of ['ios/App/App/App.entitlements', 'ios/App/BennyJoniWidget/BennyJoniWidget.entitlements']) {
    assert.doesNotMatch(read(f), /application-groups/, f);
  }
});

test('Brücke: JS-Name, Plugin-Registrierung und Storyboard passen zusammen', () => {
  const plugin = read('ios/App/App/WidgetBridgePlugin.swift');
  const jsName = plugin.match(/jsName = "([^"]+)"/)[1];
  assert.ok(read('www/widget-model.js').includes(`registerPlugin('${jsName}')`));
  assert.match(read('ios/App/App/MainViewController.swift'), /registerPluginInstance\(WidgetBridgePlugin\(\)\)/);
  assert.match(read('ios/App/App/Base.lproj/Main.storyboard'), /customClass="MainViewController" customModule="App"/);
  for (const m of ['update', 'clear']) assert.ok(plugin.includes(`name: "${m}"`), m);
});

test('Widget-Kind und Datenformat-Version passen zum Web-Modell', () => {
  const store = read('ios/App/Shared/WidgetStore.swift');
  const widget = read('ios/App/BennyJoniWidget/BennyJoniWidget.swift');
  assert.match(store, /widgetKind = "BennyJoniWeek"/);
  assert.match(widget, /let kind = WidgetStore\.widgetKind/);
  assert.match(read('www/widget-model.js'), /const VERSION = 1;/);
  assert.match(store, /account = "snapshot\.v1"/);
});

test('Widget-Texte gibt es in allen App-Sprachen mit denselben Schlüsseln', () => {
  const keys = (lang) => [...read(`ios/App/BennyJoniWidget/${lang}.lproj/Localizable.strings`).matchAll(/^"([^"]+)" =/gm)].map(m => m[1]).sort();
  const de = keys('de');
  assert.ok(de.includes('widget.name') && de.includes('widget.noData.text') && de.includes('widget.updated %@'));
  for (const lang of ['en', 'fi', 'sv']) assert.deepEqual(keys(lang), de, lang);
});

test('Datenschutz: Widget nutzt keine Required-Reason-APIs, App nur UserDefaults (CA92.1)', () => {
  assert.match(read('ios/App/BennyJoniWidget/PrivacyInfo.xcprivacy'), /<key>NSPrivacyAccessedAPITypes<\/key>\s*<array\/>/);
  assert.match(read('ios/App/App/PrivacyInfo.xcprivacy'), /<string>CA92\.1<\/string>/);
});
