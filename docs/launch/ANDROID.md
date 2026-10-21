# Android bis zum Play-Store-Upload

Das native Projekt unter `android/` verwendet dieselbe App und die Paket-ID
`com.bennyjoni.terminator`. App-Icon, Startbild, Einladungslinks und Hochformat
sind eingerichtet. AdMob verwendet Android-Test-IDs. Native Builds und echte
Android-Screenshots sind auf diesem Mac noch nicht geprüft.

## Build-Umgebung

[Android Studio und Capacitor-Voraussetzungen](https://capacitorjs.com/docs/getting-started/environment-setup)
einrichten: JDK 21, Android SDK Platform 36 und die zugehörigen Build Tools.
SDK-Lizenzen im eigenen Konto lesen und akzeptieren. Den SDK-Pfad über
`ANDROID_HOME` oder die ignorierte `android/local.properties` setzen.

```bash
npm ci
npx cap sync android
cd android
./gradlew assembleDebug
```

Die Debug-APK liegt danach unter `app/build/outputs/apk/debug/`. Auf einem
Android-Gerät oder Emulator Registrierung, Anmeldung, Einladung, Sätze,
Wochenabschluss, Konto löschen und AdMob-Einwilligung testen. Die App
registriert aktuell nur iOS-Push-Tokens. Für Android fehlen FCM-Konfiguration
und Versand; Android-Tokens dürfen nicht an den APNs-Versand gehen.

## Signierter Release

Einen Upload-Keystore über Android Studio anlegen und dauerhaft außerhalb des
Repos sichern. Bei einer bereits vorhandenen Play-App deren vorhandenen
Upload-Key verwenden. Folgende Werte nur lokal oder als CI-Secrets setzen:

```text
ANDROID_KEYSTORE_PATH     absoluter Pfad zum Keystore
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Vor dem Release echte Android-AdMob-IDs in `PROD_ANDROID` in `www/ads.js` und
die gleiche App-ID im Manifest eintragen; Anleitung: [ADMOB.md](ADMOB.md).
Der Release-Build prüft Signierung und Anzeigenkonfiguration automatisch.

```bash
npx cap sync android
cd android
./gradlew bundleRelease
```

Das signierte Bundle liegt unter `app/build/outputs/bundle/release/`.
Bei jedem weiteren Upload `versionCode` in `android/app/build.gradle` erhöhen.
Den ersten Upload in Play Console durchführen und anschließend Fastlane
verwenden: [FASTLANE_STORES.md](FASTLANE_STORES.md).

Die Play-Grafiken sind vorbereitet. Je Sprache fehlen noch mindestens zwei
echte Android-Screenshots unter
`ios/App/fastlane/play-metadata/<Sprache>/images/phoneScreenshots/`.
