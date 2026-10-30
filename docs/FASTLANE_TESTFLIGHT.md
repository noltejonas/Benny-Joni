# TestFlight-Builds mit fastlane

> **App-Store-Einreichung:** Build ohne fastlane (Xcode Archive) und die Lane
> `release` stehen in [`docs/launch/RELEASE.md`](launch/RELEASE.md). Dort steht
> auch, wie fastlane auf einem Mac mit System-Ruby 2.6 läuft (Homebrew-Ruby).

Ein Befehl baut die App aus dem aktuellen Stand und lädt sie zu TestFlight hoch:

```bash
cd ios/App
bundle exec fastlane beta
```

## Einmalig einrichten

1. Ruby (Homebrew) und Xcode müssen installiert sein, Node/npm ebenso.
2. Gems installieren — die Versionen sind in `ios/App/Gemfile.lock` gepinnt:
   ```bash
   cd ios/App
   bundle config set --local path vendor/bundle
   bundle install
   ```
3. `ios/App/fastlane/.env.example` nach `ios/App/fastlane/.env` kopieren und den
   App-Store-Connect-API-Key eintragen (Key-ID, Issuer-ID, Pfad zur `.p8`).
4. Zugang prüfen, ohne zu bauen:
   ```bash
   bundle exec fastlane verify_auth
   ```

## Was `beta` macht

1. Holt die letzte Build-Nummer aus App Store Connect und nimmt die nächste.
   `project.pbxproj` bleibt dabei unverändert.
2. `npm ci`, `npm run build` und `npx cap sync ios` übernehmen die App und die
   Plugins ins Xcode-Projekt. Der Build (`tools/build.cjs`) macht aus `www/`
   den Ordner `dist/`: JSX vorab übersetzt, React, Supabase, Capacitor-Plugins
   und Schrift lokal statt vom CDN. So startet die App ohne Babel im WebView
   und ohne Netz vor dem ersten Bild.
3. Archiviert und exportiert die Release-IPA. Signiert wird automatisch über den
   API-Key, in Xcode muss keine Apple-ID angemeldet sein.
4. Lädt die IPA zu TestFlight hoch. Interne Tester bekommen den Build, sobald
   Apple ihn verarbeitet hat (meist 5–30 Minuten).

Optionen:

- `bundle exec fastlane beta build_number:12` setzt die Build-Nummer selbst.
- `bundle exec fastlane beta upload:false build_number:12` baut nur die IPA
  (landet in `ios/App/build/fastlane/`).

## Web-Teil bauen

`www/` ist die Quelle und läuft im Browser wie gehabt (Babel übersetzt beim
Laden). Die App lädt `dist/` (`webDir` in `capacitor.config.json`):

```bash
npm run build          # www/ → dist/
npx cap sync ios       # baut dist/ vorher selbst noch einmal (capacitor:copy:before)
```

Nach einem frischen Klon einmal `npm run build`, sonst bricht `cap sync` mit
„Could not find the web assets directory: ./dist“ ab. Den Build im Browser
prüfen: Startkonfiguration „dist (iOS-Build …)“ in `.claude/launch.json`.

## Homescreen-Widget (ab 1.6.0)

Die App bettet die WidgetKit-Extension `BennyJoniWidget`
(`com.bennyjoni.terminator.widget`, ab iOS 17) ein. Die Web-App schreibt nach
jedem Laden einen Schnappschuss der Woche (`www/widget-model.js` →
`WidgetBridgePlugin.swift`) in die geteilte Keychain-Gruppe
`<Team-ID>.com.bennyjoni.terminator.shared`, das Widget liest ihn.

- **Keine App Group**: Die ließe sich nur mit Apple-ID im Developer-Portal
  anlegen; Xcode bricht bei der Signierung per API-Key mit „Authentication
  failed“ ab. Keychain-Gruppen mit Team-Präfix erlaubt jedes Profil.
- **Bundle-ID** `com.bennyjoni.terminator.widget` ist registriert (30.10.2026,
  per API-Key); Profile legt die automatische Signierung selbst an.

- **Version erhöhen**: `MARKETING_VERSION` steht für App *und* Widget im
  Projekt (Debug und Release). Apple lehnt Builds ab, wenn die Extension eine
  andere Version oder Build-Nummer hat; `tests/ios-widget.test.cjs` prüft das.
- **Eigene Plugins**: `MainViewController.swift` registriert App-eigene
  Capacitor-Plugins; `Main.storyboard` muss diese Klasse verwenden.

## Typische Fehler

- **`FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`**: In App Store Connect
  wartet eine neue oder abgelaufene Vereinbarung (meist die aktualisierte
  Program License Agreement). Nur der Account Holder kann sie unter
  appstoreconnect.apple.com bzw. developer.apple.com/account annehmen. Bis dahin
  scheitern API-Abfragen, Signierung und Upload.
- **Build bleibt in TestFlight unsichtbar**: Export-Compliance prüfen.
  `ITSAppUsesNonExemptEncryption` muss in `ios/App/App/Info.plist` stehen.
- **Version geschlossen**: Ist `MARKETING_VERSION` schon im App Store
  freigegeben, lehnt Apple weitere Builds dafür ab. Dann die Version in Xcode
  erhöhen.

## Gems aktualisieren

Neue Gem-Versionen erst übernehmen, wenn sie mindestens 14 Tage alt sind
(Schutz vor kompromittierten Releases). Nach `bundle update` das
Veröffentlichungsdatum jeder geänderten Version auf rubygems.org prüfen.
