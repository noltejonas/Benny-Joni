# App Store und Google Play mit Fastlane

Die Store-Texte sind für Deutsch und Englisch vorbereitet. Apple liest
`ios/App/fastlane/metadata/`, Google Play liest
`ios/App/fastlane/play-metadata/`. Zugangsdaten gehören ausschließlich in die
ignorierte `ios/App/fastlane/.env` oder in die Umgebung des Prozesses.

## 1. Lokale Vorbereitung

Auf diesem Mac sind Ruby und die festgelegten Fastlane-Gems installiert.
Vom Repo-Verzeichnis aus lädt `tools/fastlane.sh lanes` alle Befehle mit
dem passenden Ruby und Gem-Pfad. Beispielsweise:

```bash
tools/fastlane.sh ios verify_auth
tools/fastlane.sh ios store_metadata
tools/fastlane.sh android store_metadata
```

Der Wrapper verwendet die ignorierte `ios/App/fastlane/.env`; deren Vorlage
ist angelegt, die echten Schlüssel und Review-Daten fehlen noch.

Die Gem-Versionen sind in `ios/App/Gemfile.lock` festgelegt. Auf einem
anderen Mac werden sie vor dem ersten Aufruf mit `bundle install` installiert.

```bash
npm ci
npm run build
node tools/check-store.cjs
```

Der Textcheck prüft Pflichtdateien und Zeichenlimits. Mit `--ready` stoppt er
zusätzlich bei offenen Rechts- und Support-Entwürfen; mit `--screenshots`
prüft er Bildanzahl und Abmessungen. Er kontaktiert keinen Store.

```bash
node tools/check-store.cjs --platform=ios --ready --screenshots
node tools/check-store.cjs --platform=android --ready --screenshots
```

Vor dem Upload müssen die tatsächlichen Betreiber- und Supportdaten in den
Rechtsseiten stehen und diese öffentlich erreichbar sein. Die URLs in den
Store-Texten müssen zu den veröffentlichten Seiten führen. Die Rechte und
Datenschutzangaben müssen den verwendeten SDKs und dem fertigen Build
entsprechen. Die bisherige Aussage „keine Werbung“ gilt mit AdMob nicht mehr.

## 2. App Store Connect

In `ios/App/fastlane/.env` werden benötigt:

```dotenv
ASC_KEY_ID=
ASC_ISSUER_ID=
ASC_KEY_PATH=
REVIEW_FIRST_NAME=
REVIEW_LAST_NAME=
REVIEW_EMAIL=
REVIEW_PHONE=
REVIEW_USER=
REVIEW_PASSWORD=
REVIEW_CODE=
```

Die App ist über die Bundle-ID `com.bennyjoni.terminator` zugeordnet. Das
Review-Konto muss in der Produktions-App funktionieren und nachvollziehbare
Beispieldaten enthalten. Die lokale Demo ist für einen ersten Blick
verfügbar; für die Prüfung von Konten, Einladungen und Serverfunktionen wird
ein echter Prüfzugang bereitgestellt.

```bash
cd ios/App
bundle install
bundle exec fastlane verify_auth
bundle exec fastlane beta
bundle exec fastlane store_metadata
```

`beta` baut und lädt zu TestFlight hoch. `store_metadata` lädt Texte,
Review-Daten und die deutschen und englischen Screenshots in die
vorbereitete App-Store-Version. Es reicht nichts zur Prüfung ein. Die
Screenshots stammen aus `docs/launch/screenshots/iphone-6.9-de/` und
`iphone-6.9-en/` und werden für den Upload nach Store-Sprache zugeordnet.
Je Sprache sind vier Bilder im Format 1320 × 2868 vorbereitet: echte,
vollständige App-Captures innerhalb eines gestalteten Rahmens. Der
eingebettete Bildschirm wird gleichmäßig skaliert, kein App-Inhalt verändert.
Die historischen 6,3-Zoll-Bilder werden nicht hochgeladen; ihr Feed enthält
noch Work-Einträge. Die Grafiken lassen sich mit Pillow über
`python3 tools/prepare-store-screenshots.py` erneut erzeugen.

Ein kompletter Build mit Store-Unterlagen ist möglich mit:

```bash
bundle exec fastlane release
```

Danach in [App Store Connect](https://appstoreconnect.apple.com/): Build
auswählen, Altersfreigabe und App-Datenschutz ausfüllen, Preis/Verfügbarkeit
und Händlerangaben prüfen. Bei einem Build mit AdMob gehören die Daten des
Google-SDKs in die Datenschutzangaben und Werbung in die Altersfreigabe.
Auch die öffentliche Monatsrangliste muss bei Nutzerinhalten berücksichtigt
werden. Anschließend zur Prüfung einreichen. Die Veröffentlichung bleibt
manuell.

## 3. Google Play

Native Build- und Signierungsschritte: [ANDROID.md](ANDROID.md).

Fastlane braucht einen eigenen Google-Play-Zugang; der Apple-Key funktioniert
hier nicht. In [Play Console](https://play.google.com/console/) die App
anlegen, Google Play Developer API aktivieren und einem Dienstkonto Zugriff
auf diese App geben. Einen JSON-Schlüssel außerhalb des Repos speichern und
in der `.env` dessen Pfad hinterlegen:

```dotenv
PLAY_JSON_KEY_PATH=
PLAY_PACKAGE_NAME=com.bennyjoni.terminator
```

Vor dem ersten Einsatz von Fastlane muss mindestens ein signiertes
Android-Build im Play-Console-Eintrag hochgeladen worden sein. Dafür werden
ein Android-Projekt, ein dauerhaft gesicherter Upload-Keystore und ein
signiertes Android App Bundle (`.aab`) benötigt. Ein Android-Projekt wird
im Repo vorbereitet und enthält Icons sowie die Signierungs-Konfiguration.
Auf dem aktuellen Mac fehlen noch Android SDK/JDK und der Upload-Keystore;
deshalb liegt noch kein signiertes AAB vor. Der native Android-Build und das
Verhalten auf einem Android-Gerät sind noch nicht geprüft. Die Upload-Lanes
erzeugen keinen Keystore. Android-Server-Push benötigt zusätzlich eine
FCM-Einrichtung; APNs ist nur für iOS eingerichtet. Die Play-Texte versprechen
deshalb keine Android-Push-Mitteilungen.

Vom selben Fastlane-Verzeichnis aus:

```bash
cd ios/App
bundle exec fastlane android verify_auth
bundle exec fastlane android store_metadata
bundle exec fastlane android internal_draft aab:/absoluter/pfad/app-release.aab
```

Die Play-Lanes speichern Änderungen als Entwurf und senden sie nicht zur
Prüfung. `store_metadata` lädt nur die Store-Unterlagen. `internal_draft`
lädt das angegebene AAB als Entwurf im internen Testkanal und die vorhandenen
Unterlagen hoch. Ein AAB muss vorher signiert gebaut worden sein.

Play-Bilder liegen je Sprache unter:

```text
play-metadata/de-DE/images/icon.png                 512 × 512
play-metadata/de-DE/images/featureGraphic.png       1024 × 500
play-metadata/de-DE/images/phoneScreenshots/01.png  z. B. 1080 × 1920
play-metadata/en-GB/images/…
```

Es werden mindestens zwei echte Android-Screenshots je Sprache vorbereitet.
Die lange Seite darf höchstens doppelt so lang sein wie die kurze; die
vorhandenen iPhone-Bilder im Format 1206 × 2622 passen nicht unverändert in
dieses Verhältnis. Bilder und Screenshots werden beim Play-Upload ersetzt;
deshalb gehört die vollständige gewünschte Auswahl in diese Ordner.

In der Play Console bleiben die kontobezogenen Schritte: Kontakt und
Händlerangaben, App-Zugriff für die Prüfung, Werbung, Inhaltsbewertung,
Zielgruppe, Datensicherheit einschließlich AdMob und die öffentlich
erreichbare Seite zum Anfordern einer Kontolöschung. Der Support-Link kann
dafür dienen, wenn er die Löschanfrage eindeutig ermöglicht. Auch das
Formular für Gesundheits-Apps ist anhand der tatsächlichen Fitnessfunktionen
auszufüllen.

Für persönliche Entwicklerkonten, die nach dem 13. November 2023 angelegt
wurden, kann der Produktionszugang erst nach dem vorgeschriebenen
geschlossenen Test beantragt werden: mindestens zwölf Tester, die
durchgehend mindestens vierzehn Tage angemeldet bleiben. Interne Tests
erfüllen diese Voraussetzung nicht.

## Quellen

- [Fastlane: App-Store-Metadaten und Screenshots](https://docs.fastlane.tools/actions/upload_to_app_store/)
- [Fastlane: Google-Play-Uploads und Entwürfe](https://docs.fastlane.tools/actions/upload_to_play_store/)
- [Fastlane: erster Android-Upload und Einrichtung](https://docs.fastlane.tools/getting-started/android/setup/)
- [Google Play: Grafik- und Screenshot-Anforderungen](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Apple: Screenshot-Anforderungen](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Google Play: Kontolöschung](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play: Tests für neue persönliche Konten](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google AdMob: Datentypen für App Store Connect](https://developers.google.com/admob/ios/privacy/data-disclosure)
- [Google Play: Erklärung zu Gesundheits- und Fitnessfunktionen](https://support.google.com/googleplay/android-developer/answer/14738291)

Stand der verlinkten Anforderungen: 21. Oktober 2026. Maßgeblich sind die
Formulare und Hinweise im jeweiligen Konto.
