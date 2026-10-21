# Android bis zum Play-Store-Upload

Das native Projekt unter `android/` verwendet dieselbe App und die Paket-ID
`com.bennyjoni.terminator`. App-Icon, Startbild, Einladungslinks und Hochformat
sind eingerichtet. Die aktuelle AdMob-Konfiguration steht in
[ADMOB.md](ADMOB.md). Debug-APK und signiertes Release-AAB wurden am
21. Oktober 2026 erfolgreich gebaut. Der Kaltstart der aktuellen APK wurde
im Android-Emulator bis zur vollständigen Willkommensoberfläche geprüft,
ohne neuen nativen Absturz oder JavaScript-/WebView-Fehler. Vollständige
Funktionstests und die Prüfung von AdMob/UMP auf einem Gerät bleiben offen.
Der zuvor sichtbare Feed-Zeichenfehler ist ebenfalls im Emulator geprüft:
Nach dem Tabwechsel, zwei natürlichen Live-Updatezyklen und demselben
Abwärtswischen bleiben Kopfzeile und Feed sauber. Dafür verwenden die
Tagesüberschrift und ausschließlich im Feed die Tab-Leiste deckende
Hintergründe ohne `backdrop-filter`.

## Build-Umgebung

[Android Studio und Capacitor-Voraussetzungen](https://capacitorjs.com/docs/getting-started/environment-setup)
einrichten: JDK 21, Android SDK Platform 36 und die zugehörigen Build Tools.
SDK-Lizenzen im eigenen Konto lesen und akzeptieren. Den SDK-Pfad über
`ANDROID_HOME` oder die ignorierte `android/local.properties` setzen.

JDK 21 und die offiziellen Android-Kommandozeilenwerkzeuge sind auf diesem Mac
installiert. Nach ausdrücklicher Annahme der Android-SDK-Lizenz wurden SDK
Platform 36, Build Tools 36.0.0 sowie die vom Android-Gradle-Plugin angeforderten
Build Tools 35.0.0 und Platform Tools installiert.
Zusätzlich sind der native ARM64-Emulator 37.2.12 und das stabile API-36-
Google-APIs-Systemimage für `arm64-v8a` (Revision 7) installiert. Auch die
zusätzliche ARM-SDK-Lizenz wurde ausdrücklich genehmigt. Das lokale AVD
`BennyJoni_API36_Pixel2` verwendet 1080 × 1920 Pixel und 2 GB RAM;
Hardwarebeschleunigung über Hypervisor.Framework ist verfügbar.
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
im nächsten Abschnitt. Die registrierte `AdPrivacy`-Bridge startet kein SDK
beim App-Start; nach UMP und `AdMob.initialize()` muss ihre persistierte
Publisher-ID-Deaktivierung bestätigt sein, bevor eine Anzeige angefordert wird.
Der erfolgreiche Kaltstart wurde mit genau dieser APK im genannten AVD geprüft.

SHA-256 von `android/app/build/outputs/apk/debug/app-debug.apk`:
`4b0782fa892830d3dd99ea49c99d06713a99ee6c94785eeeff0961fccfefc73b`

Unveränderte Vorher-Belege liegen unter
`.local/screenshots/android/{de-DE,en-GB}/03-feed.png`; die bestandene
Vergleichsfolge liegt unter `.local/screenshots/android/feed-after-tabbar/`.

## Signierter Release

Am 21. Oktober 2026 wurde für diese neue Android-App ein dauerhafter lokaler
Upload-Keystore angelegt: PKCS12, RSA 4096, SHA256withRSA, gültig bis März 2054.
Der Zertifikatsname ist `CN=Benny & Joni Android Upload`.
Die Dateien liegen im ignorierten Ordner `.local/release/android/`:

- `upload.keystore`: privater Upload-Schlüssel.
- `signing.env`: lokale Pfade, Alias und starke zufällig erzeugte Passwörter.
- `upload-certificate.pem`: öffentliches Upload-Zertifikat.

Dateien haben Modus `0600`, die lokalen Ordner `0700`. `git check-ignore`
bestätigt den Git-Ausschluss. Vor einer Einführung Keystore und
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
SHA-256: `5745afb5f8f66d3a42a048c7103e67e4f149767901d9793434379ae68ecffb10`.
Genau dieses finale AAB ist in Play Console hochgeladen: Die UI bestätigt
ein App Bundle und zeigt Version Code 1 (`1 (1.4.1)`). Die Delegation an
Play App Signing ist vom Nutzer ausdrücklich freigegeben. Der interne
Entwurf **1.4.1 – Initial internal test** ist mit Neuerungen in Deutsch und
Englisch (2/2) gespeichert. Kein Rollout und keine Testerbenachrichtigung.
Die Play-Vorschau meldet **keine Fehler und drei Warnungen**: noch keine
internen Tester, kein R8-Mapping (der Build nutzt `minifyEnabled=false`)
und fehlende native SDK-Debugsymbole. „Save and publish“ wurde nicht betätigt.

Bei jedem weiteren Upload `versionCode` in `android/app/build.gradle` erhöhen.
Für weitere Uploads Fastlane separat anbinden:
[FASTLANE_STORES.md](FASTLANE_STORES.md).

Die Play-Grafiken und je vier echte Android-Screenshots für Deutsch und
Englisch sind vorbereitet. Die acht Aufnahmen zeigen Willkommen, Heute,
Statistik und Strafkonto in 1080 × 1920 Pixeln. Sie liegen unter
`ios/App/fastlane/play-metadata/<Sprache>/images/phoneScreenshots/`;
`check-store --ready --platform=android --screenshots` besteht.
Die Rohaufnahmen bleiben in `.local/screenshots/` erhalten. Beim Export
wurde ausschließlich der vollständig deckende Alphakanal entfernt;
sämtliche RGB-Pixel sind unverändert. Die fehlerhaften Feed-Aufnahmen
gehören nicht zum Store-Material.
