# App Store und Google Play mit Fastlane

Die Store-Texte liegen für Deutsch und Englisch vor. Der Apple-Metadaten-
Upload für Version 1.4.1 ist abgeschlossen und per API geprüft; Build 24 ist
dieser Version im Entwurf zugeordnet. TestFlight-Build 1.4.1 (24) ist
erfolgreich hochgeladen und per API als `VALID` bestätigt. Apple liest
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

Der Wrapper verwendet die ignorierte `ios/App/fastlane/.env`. Der bestehende
Apple-Team-Key und die Review-Angaben sind lokal hinterlegt;
`ios verify_auth` war erfolgreich. Die private `.p8` liegt nicht versioniert
unter `.local/release/apple/` mit Dateirechten `0600`. Der Google-Play-Zugang
wird separat eingerichtet; die Apple-Zugangsdaten ersetzen ihn nicht.

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

**Geprüfter Stand vom 21. Oktober 2026:**
`tools/fastlane.sh ios store_metadata` hat den Entwurf 1.4.1 hochgeladen.
Der anschließende API-Abgleich bestätigt:

- Status `PREPARE_FOR_SUBMISSION`, Release-Typ `MANUAL`, Build 24 zugeordnet;
  nach dem gezielten Update ausschließlich dieser Build-Beziehung per API
  zurückgelesen. Keine Einreichung oder Veröffentlichung.
- Der neueste TestFlight-Build 1.4.1 (24) ist erfolgreich hochgeladen und
  per API als `VALID` bestätigt. Die zusätzlichen Beta-Statusfelder sind
  unmittelbar nach der Verarbeitung noch leer. Build 23 ist bereits intern
  `IN_BETA_TESTING`, extern `READY_FOR_BETA_SUBMISSION`.
  Es wurde nichts extern zur Beta-Prüfung oder
  zur App-Store-Prüfung eingereicht. IPA-Pfad, SHA-256 und die lokalen
  Prüfergebnisse stehen in [RELEASE.md](RELEASE.md).
- `de-DE` und `en-GB`: Name, Untertitel, Beschreibung, Keywords, Werbetext,
  Support-/Marketing-/Datenschutz-URL und Copyright stimmen mit den lokalen
  Metadaten überein.
- Je Sprache vier Screenshots, alle acht im Zustand `COMPLETE`, ohne
  Verarbeitungsfehler oder Warnungen.
- Der Review-Kontakt ist vollständig; erforderlicher Login, Passwort und
  Notizen sind vorhanden. Login, Passwort und Challenge-Code stimmen mit
  der lokalen Konfiguration überein. Private Werte werden hier nicht
  dokumentiert.

`release_notes.txt` wird für diese erste App-Version erwartungsgemäß
übersprungen: Apple stellt „What's New“ erst für Folgeversionen bereit.
[Apple: Versionsinformationen](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

Für eine neue lokale Einrichtung werden in `ios/App/fastlane/.env` benötigt:

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
Je Sprache sind vier Bilder im Format 1320 × 2868 hochgeladen: echte,
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
werden. Konkrete Datenschutzantworten stehen in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md). Anschließend zur Prüfung
einreichen. Der aktuelle Entwurf wurde noch nicht eingereicht; die
Veröffentlichung bleibt manuell.

## 3. Google Play

Native Build- und Signierungsschritte: [ANDROID.md](ANDROID.md).

Der App-Eintrag besteht in [Play Console](https://play.google.com/console/).
Am 21. Oktober 2026 wurden Datenschutz-URL, Werbung, isolierter Review-Zugang,
Zielgruppe 16–17/18+, Gesundheitsfunktionen, Kategorie und öffentliche
Kontaktdaten sowie Data safety mit allen zwölf Datentypen gespeichert.
Regierungs-App und Finanzfunktionen sind mit No beantwortet; optionale
Partnertests sind ausgeschaltet. Details zum tatsächlich gespeicherten Stand
stehen in [STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md).
Inzwischen sind auch IARC und beide Store-Listings gespeichert: USK 12,
ESRB Teen, PEGI Parental Guidance; Zielgruppe weiterhin 16+. Das Listing
steht auf „Bereit für Überprüfung“. Je Sprache sind vier echte Android-
Screenshots, dazu Icon und lokalisierte Feature-Grafik hinterlegt. Alle elf
Assets tragen in der Console die KI-Kennzeichnung, da auch die realen
App-Aufnahmen KI-erstellte Avatare/Maskottchen zeigen. Alle elf
Einrichtungsschritte sind abgeschlossen. Das finale AAB (1.4.1, Version Code 1,
SHA-256 `5745afb5…`) ist hochgeladen; die Console zeigt ein App Bundle und
`1 (1.4.1)`. Der interne Entwurf **1.4.1 – Initial internal test** ist mit
Neuerungen in Deutsch und Englisch (2/2) gespeichert. Kein Rollout und keine
Testerbenachrichtigung.

Fastlane braucht zusätzlich einen eigenen Google-Play-API-Zugang; der
Apple-Key funktioniert hier nicht. Google Play Developer API aktivieren
und einem Dienstkonto Zugriff auf diese App geben. Einen JSON-Schlüssel außerhalb des Repos speichern und
in der `.env` dessen Pfad hinterlegen:

```dotenv
PLAY_JSON_KEY_PATH=
PLAY_PACKAGE_NAME=com.bennyjoni.terminator
```

Vor dem ersten Einsatz von Fastlane muss mindestens ein signiertes
Android-Build im Play-Console-Eintrag hochgeladen worden sein. Dafür werden
ein Android-Projekt, ein dauerhaft gesicherter Upload-Keystore und ein
signiertes Android App Bundle (`.aab`) benötigt. Das Android-Projekt im Repo
enthält Icons sowie die Signierungs-Konfiguration. JDK 21 und Android SDK
sind auf diesem Mac eingerichtet; am 21. Oktober 2026 wurde die Debug-APK
mit Version 1.4.1 (Code 1, Ziel-API 36) erfolgreich gebaut und ihre Signatur
geprüft. Auch Upload-Keystore und signiertes Release-AAB sind lokal erstellt
und geprüft. Der Kaltstart der aktuellen APK im API-36-Pixel-2-Emulator ist
bestanden, ebenso die Feed-Reproduktion nach Live-Updates und Wischen.
Der Export von acht echten Android-Screenshots ist abgeschlossen.
Vor einer Einführung fehlen das externe Schlüssel-Backup,
vollständige Funktionstests und die AdMob-/UMP-Geräteprüfung.
Build-Befehle, Hashes und den konkreten
AAB-Pfad beschreibt [ANDROID.md](ANDROID.md). Die Upload-Lanes erzeugen
keinen Keystore. Android-Server-Push benötigt zusätzlich eine
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

Je Sprache liegen vier echte, geprüfte Android-Screenshots mit 1080 × 1920
Pixeln vor. Der lokale Bereitschaftscheck einschließlich Bildern besteht.
Die lange Seite darf höchstens doppelt so lang sein wie die kurze; die
vorhandenen iPhone-Bilder im Format 1206 × 2622 passen nicht unverändert in
dieses Verhältnis. Bilder und Screenshots werden beim Play-Upload ersetzt;
deshalb gehört die vollständige gewünschte Auswahl in diese Ordner.

In der Play Console ist das finale AAB hochgeladen und als interner Entwurf
mit DE-/EN-Neuerungen gespeichert. Die elf Einrichtungsschritte, einschließlich IARC und beider
Store-Listings, sind abgeschlossen. Gespeicherte App-Inhalte und der Status
„Bereit für Überprüfung“ sind keine Einreichung zur Prüfung. Die öffentlich
erreichbare Supportseite ermöglicht die Kontolöschanfrage.

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
