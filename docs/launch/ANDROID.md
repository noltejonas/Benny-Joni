# Android bis zum Play-Store-Upload

Das native Projekt unter `android/` verwendet dieselbe App und die Paket-ID
`com.bennyjoni.terminator`. App-Icon, Startbild, Einladungslinks und Hochformat
sind eingerichtet. Die aktuelle AdMob-Konfiguration steht in
[ADMOB.md](ADMOB.md). Der native Debug-Build wurde am 21. Oktober 2026
erfolgreich gebaut; ein Gerätetest und echte Android-Screenshots stehen noch aus.

## Build-Umgebung

[Android Studio und Capacitor-Voraussetzungen](https://capacitorjs.com/docs/getting-started/environment-setup)
einrichten: JDK 21, Android SDK Platform 36 und die zugehörigen Build Tools.
SDK-Lizenzen im eigenen Konto lesen und akzeptieren. Den SDK-Pfad über
`ANDROID_HOME` oder die ignorierte `android/local.properties` setzen.

JDK 21 und die offiziellen Android-Kommandozeilenwerkzeuge sind auf diesem Mac
installiert. Nach ausdrücklicher Annahme der Android-SDK-Lizenz wurden SDK
Platform 36, Build Tools 36.0.0 sowie die vom Android-Gradle-Plugin angeforderten
Build Tools 35.0.0 und Platform Tools installiert.
Der lokale Wrapper `tools/android.sh` findet
das Homebrew-JDK und verwendet ohne eigenes `ANDROID_HOME` den SDK-Pfad
`~/Library/Android/sdk`; er verändert keine globale Shell-Konfiguration.

Nach abgeschlossener SDK-Einrichtung kann der Debug-Build aus dem Repo-Ordner
gestartet werden:

```bash
npm ci
npx cap sync android
tools/android.sh assembleDebug
```

Die Debug-APK liegt danach unter `android/app/build/outputs/apk/debug/`. Auf einem
Android-Gerät oder Emulator Registrierung, Anmeldung, Einladung, Sätze,
Wochenabschluss, Konto löschen und AdMob-Einwilligung testen. Die App
registriert aktuell nur iOS-Push-Tokens. Für Android fehlen FCM-Konfiguration
und Versand; Android-Tokens dürfen nicht an den APNs-Versand gehen.

Geprüfter Stand: `app-debug.apk`, Paket `com.bennyjoni.terminator`, Version
1.4.1 (Code 1), Ziel-SDK 36. Die APK-Signatur und die enthaltenen produktiven
Android-AdMob-IDs stimmen mit dem Projekt überein. Diese APK verwendet den
üblichen lokalen Debug-Schlüssel. Das separat signierte Release-Bundle steht
im nächsten Abschnitt; beide Builds ersetzen keinen Gerätetest.

## Signierter Release

Am 21. Oktober 2026 wurde für diese neue Android-App ein dauerhafter lokaler
Upload-Keystore angelegt: PKCS12, RSA 4096, SHA256withRSA, gültig bis März 2054.
Der Zertifikatsname ist `CN=Benny & Joni Android Upload`.
Die Dateien liegen im ignorierten Ordner `.local/release/android/`:

- `upload.keystore`: privater Upload-Schlüssel.
- `signing.env`: lokale Pfade, Alias und starke zufällig erzeugte Passwörter.
- `upload-certificate.pem`: öffentliches Upload-Zertifikat.

Dateien haben Modus `0600`, die lokalen Ordner `0700`. `git check-ignore`
bestätigt den Git-Ausschluss. Vor dem ersten Play-Upload Keystore und
`signing.env` dauerhaft verschlüsselt außerhalb dieses Macs sichern; dieses
externe Backup ist noch offen. Die Dateien weder committen noch in Chat,
Screenshots oder Build-Logs kopieren. Für spätere Updates denselben Upload-Key
wiederverwenden. Die [Android-Signierungsanleitung](https://developer.android.com/studio/publish/app-signing)
beschreibt die Trennung von Upload-Schlüssel und Play App Signing.

`signing.env` exportiert die von Gradle verwendeten Werte:

```text
ANDROID_KEYSTORE_PATH     absoluter Pfad zum Keystore
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Die produktiven Android-AdMob-IDs sind in `PROD_ANDROID` und im Manifest
eingetragen; siehe [ADMOB.md](ADMOB.md). Der Release-Build prüft Signierung
und Anzeigenkonfiguration automatisch. Aus dem Repo-Ordner neu bauen:

```bash
npx cap sync android
source .local/release/android/signing.env
tools/android.sh bundleRelease
```

Der signierte Release-Build ist erfolgreich. Das geprüfte Bundle liegt unter
`android/app/build/outputs/bundle/release/app-release.aab` (ca. 13 MB), auf
diesem Mac unter
`/Users/jonasnolte/Developer/Benny-Joni/android/app/build/outputs/bundle/release/app-release.aab`.
`bundletool validate` und die JAR-Signaturprüfung bestehen; alle 630
Payload-Einträge sind mit dem erwarteten Upload-Zertifikat signiert.
Paket-ID `com.bennyjoni.terminator`, Version 1.4.1 (Code 1), Ziel-SDK 36,
`debuggable=false`, produktive AdMob-IDs und Support-Adresse sind im AAB geprüft.
Es wurde noch nichts in Play Console hochgeladen.

Bei jedem weiteren Upload `versionCode` in `android/app/build.gradle` erhöhen.
Den ersten Upload in Play Console durchführen und anschließend Fastlane
verwenden: [FASTLANE_STORES.md](FASTLANE_STORES.md).

Die Play-Grafiken sind vorbereitet. Je Sprache fehlen noch mindestens zwei
echte Android-Screenshots unter
`ios/App/fastlane/play-metadata/<Sprache>/images/phoneScreenshots/`.
