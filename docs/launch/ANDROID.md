# Android bis zum Play-Store-Upload

**Stand 24.10.2026:** 1.4.1 (Code 2) ist in Produktion live. 1.5.0 (Code 3)
ist gebaut und als interner Entwurf **1.5.0 – Heute über alle Challenges**
mit Changelog (`play-metadata/*/changelogs/3.txt`) und neuer Beschreibung
hochgeladen. Das Dienstkonto darf nur Testkanäle bedienen; die Freigabe in
Produktion läuft über die Play Console (Produktion → Neuen Release erstellen →
Aus Bundle-Bibliothek hinzufügen → Code 3 → Zur Prüfung senden). Änderungen
gehen bei dieser App automatisch in die Prüfung; `changesNotSentForReview`
darf deshalb nicht gesetzt sein (die Lane `internal_draft` bricht damit ab).

Der Abschnitt darunter beschreibt den Stand bis 1.4.1.

Das native Projekt verwendet `com.bennyjoni.terminator`, Version 1.4.1,
**Version Code 2** und Ziel-API 36. Debug-APK und signiertes Release-AAB sind
gebaut; das AAB ist in Play Console als interner Entwurf
**1.4.1 – Werbefreier Start** gespeichert. Keine Verteilung an Tester;
Produktion 2 ist mit elf Änderungen **zur Prüfung gesendet**; die Console
bestätigt „Deine Änderungen werden jetzt überprüft.“ Vorabprüfungen sind
abgeschlossen. Managed Publishing ist aktiviert und nach Neuladen bestätigt;
kein öffentlicher Release.

Der Launch-Schalter `app_release_settings.id = 1`, `ads_enabled = false`
ist produktiv gesetzt: keine Werbung, kein UMP-Dialog und kein Werbe-SDK-Start.
Der originale Code-2-Gate-Smoke ist bestanden, einschließlich erneutem
Kaltstart/Heute/Feed/Stats/Hintergrund-Vordergrund nach Wiederherstellung
des Originals aus den getrennten UMP-Versuchen. Null AdMob-/AdPrivacy-Aufrufe,
keine FATAL-Exception, ANR oder ungefangenen JavaScript-Fehler. Beleg:
`.local/qa/android-final-vcode2-gate-off/restored/summary.json`.

Der schreibende Android-Funktionstest im isolierten Wegwerfkonto ist
bestanden: Satz 10 anlegen → auf 15 ändern → Kaltstart zeigt 15 → Satz
löschen → Feed/Stats zeigen null. Die Reviewfixture wurde dafür nicht verändert.

Der frühere Feed-Zeichenfehler wurde durch deckende Tagesüberschriften und
eine ausschließlich im Feed deckende Tab-Leiste behoben und nach Live-Updates
und Wischen geprüft. Beim erweiterten iOS-Funktionstest sind Teile bestanden,
weitere Prüfungen bleiben offen; Details stehen in [RELEASE.md](RELEASE.md).
Werbe-QA und ihre offenen Grenzen stehen unten und in [ADMOB.md](ADMOB.md).

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
1.4.1 (Code 2), Ziel-SDK 36. Die APK-Signatur und die enthaltenen produktiven
Android-AdMob-IDs stimmen mit dem Projekt überein. Diese APK verwendet den
üblichen lokalen Debug-Schlüssel. Das separat signierte Release-Bundle steht
im nächsten Abschnitt. Die registrierte `AdPrivacy`-Bridge startet kein SDK
beim App-Start; nach UMP und `AdMob.initialize()` muss ihre persistierte
Publisher-ID-Deaktivierung bestätigt sein, bevor eine Anzeige angefordert wird.
Der erfolgreiche Kaltstart wurde mit genau dieser APK im genannten AVD geprüft.

SHA-256 von `android/app/build/outputs/apk/debug/app-debug.apk`:
`e33a219fa79f3d86904481f13d95c31e4b3b75cc91d3d1398ec02aaaf49ef81c`

Unveränderte Vorher-Belege liegen unter
`.local/screenshots/android/{de-DE,en-GB}/03-feed.png`; die bestandene
Vergleichsfolge liegt unter `.local/screenshots/android/feed-after-tabbar/`.

## Android-Laufzeitprüfung der Werbung

Die ursprüngliche Konfiguration vor dem Freigabeschalter wurde mit UMP
`NOT_REQUIRED`, SDK-Initialisierung, bestätigter Publisher-ID-Deaktivierung
und nicht personalisierten Anfragen geprüft; Feed/Stats lieferten `NO_FILL`.
Das ist ein historischer Anfrage-/Fehlernachweis, kein aktueller Launchbetrieb.
Der aktuelle originale Code-2-Lauf bleibt vollständig ohne Werbeaufrufe.

In einer lokalen QA-Kopie wurden danach Google-Demo-Testbanner wirklich
geladen (`npa: true`, `disabled: true`). Heute und Overlays verbergen die
Banner; nach Abbruch/Rückkehr erscheinen sie wieder. Beleg:
`.local/qa/ump-eea/gate-on-corrected/summary.json`.

**EWR-Auswahl und Widerruf sind offen.** Auch mit originaler Paket-ID,
produktiver AdMob-App-ID, offiziellem Testreset und Debug-EWR meldet UMP
`NOT_REQUIRED` ohne Formular. Die passende Zwei-App-Botschaft ist
veröffentlicht; Ursache ungeklärt. Beleg:
`.local/qa/ump-eea/same-package/summary.json`. Vor späterer Aktivierung
klären; Testbanner belegen keine Monetarisierungsfreigabe. Das Originalpaket
ist nach diesen Versuchen mit geprüftem Hash wiederhergestellt.

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

Der signierte Code-2-Release-Build ist erfolgreich. Das neue Bundle liegt
unter `android/app/build/outputs/bundle/release/app-release.aab`.
SHA-256: `4773dcdf4f60d254acf7fbc5caccc375ffbe5184b527b708417e74af319a38da`.
Die Webinhalte von AAB/APK entsprechen `dist/`; der originale APK-Hash ist
nach der Wiederherstellung unabhängig bestätigt.

Das AAB ist hochgeladen und als interner Entwurf
**1.4.1 – Werbefreier Start** gespeichert. Die Delegation an Play App Signing
ist ausdrücklich freigegeben. Keine Tester-Verteilung und noch keine
Testerbenachrichtigung. Produktion 2 ist mit elf Änderungen zur Prüfung
gesendet. Die Vorschau zeigte null Fehler und zwei Warnungen (native
Symbole/R8-Mapping). Produktionsländer bleiben Deutschland, Österreich
und Schweiz. Review läuft, die Console bestätigt
„Deine Änderungen werden jetzt überprüft.“ Beleg:
`.local/qa/google-submission-vcode2-20261021/status.json`.

Managed Publishing ist in dieser Console erfolgreich aktiviert und nach
Neuladen bestätigt. Nach Google-Freigabe bleibt die Veröffentlichung
zurückgehalten; es gab keinen öffentlichen Release.

Bei jedem weiteren Upload `versionCode` in `android/app/build.gradle` erhöhen.
Die bereits eingerichteten Fastlane-Zugänge für weitere Uploads stehen in:
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
