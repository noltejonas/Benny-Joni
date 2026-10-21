# App Store und Google Play mit Fastlane

Die Store-Texte liegen für Deutsch und Englisch vor. Der Apple-Metadaten-
Upload für Version 1.4.1 ist abgeschlossen und per API geprüft; Build 26 ist
ausgewählt, `VALID` und seit 21. Oktober 2026, 18:15 Uhr CEST zur Prüfung
eingereicht: **`WAITING_FOR_REVIEW`**, Veröffentlichung **`MANUAL`**. Apple liest
`ios/App/fastlane/metadata/`, Google Play liest
`ios/App/fastlane/play-metadata/`. Zugangsdaten gehören ausschließlich in die
ignorierte `ios/App/fastlane/.env` oder in die Umgebung des Prozesses.

**Neuer Launch-Quellstand:** Werbung ist mit dem produktiven Serverflag
`app_release_settings.id = 1`, `ads_enabled = false` ausgeschaltet.
Kein UMP-Dialog, kein Werbe-SDK-Start und keine Anzeigen einschließlich
Testanzeigen. iOS Build 26 ist eingereicht. Android Version Code 2 ist
hochgeladen und als interner Entwurf **1.4.1 – Werbefreier Start** gespeichert;
Produktion 2 ist zur Prüfung gesendet; Review läuft und Managed
Publishing ist nach Neuladen bestätigt aktiviert. Die öffentlichen Texte sind live,
die aktualisierten Apple-Review-Notizen hochgeladen.
Spätere Aktivierung ohne weiteres Update: [ADMOB.md](ADMOB.md). Neue
Artefakthashes, bestandener originaler Android-Gate-Smoke und die physische
iPhone-Lese-/Lifecycle-QA stehen in [RELEASE.md](RELEASE.md).

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
unter `.local/release/apple/` mit Dateirechten `0600`. Der separate
Google-Play-Zugang ist ebenfalls eingerichtet; `android verify_auth`
war beim Einrichten mit dem damaligen Version Code 1 erfolgreich; der
aktuelle Console-Entwurf und die Produktion verwenden Code 2.

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
entsprechen. Der Start ist werbefrei, die eingebettete Funktion bleibt
serverseitig aktivierbar; deshalb bleiben `Contains ads` und die
Werbe-Datenoffenlegungen erhalten. Eine dauerhafte Werbefreiheit wird nicht zugesagt.

## 2. App Store Connect

**Geprüfter Stand vom 21. Oktober 2026:**
`tools/fastlane.sh ios store_metadata` hat den Entwurf 1.4.1 hochgeladen.
Der anschließende API-Abgleich bestätigt:

- Status **`WAITING_FOR_REVIEW`**, Release-Typ **`MANUAL`**, Build **26**
  ausgewählt. Per offizieller ReviewSubmissions-API eingereicht am
  21. Oktober 2026, 18:15:25 CEST; Submission-ID
  `04ba9efd-76a8-423d-911f-e3abc54178a7`. Version und Submission wurden
  anschließend als `WAITING_FOR_REVIEW` zurückgelesen. Keine Veröffentlichung.
- Build 1.4.1 (26) ist `VALID`, intern `IN_BETA_TESTING`, extern
  `READY_FOR_BETA_SUBMISSION`. Die neue Gate-Fassung ist eingebaut. IPA-Pfad,
  SHA-256 und Prüfergebnisse stehen in [RELEASE.md](RELEASE.md).
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

In [App Store Connect](https://appstoreconnect.apple.com/) ist Build 26
zugeordnet und zur Prüfung eingereicht. App Privacy ist mit allen 15 Datentypen nach ausdrücklicher
Nutzerzustimmung veröffentlicht; der UI-Readback bestätigt 13 verknüpfte,
zwei nicht verknüpfte Datentypen, keine Tracking-Daten und die korrekte
Datenschutz-URL. Altersfreigabe 16+ (berechnet 13+, Override wegen der
Nutzungsbedingungen), Inhaltsrechte und „kein reguliertes Medizinprodukt“
sind gespeichert. Preis: kostenlos mit Basisland Deutschland; Verfügbarkeit
ausschließlich Deutschland, Österreich und Schweiz, im UI-Readback bestätigt.
Mac und Apple Vision sind ausgeschlossen; beide Kästchen bleiben nach
Neuladen leer. Der bestehende DSA-Trader-Status wurde nicht geändert;
eine neue Verifizierung ist nicht belegt. Bei einem Build mit AdMob gehören die Daten des
Google-SDKs in die Datenschutzangaben und Werbung in die Altersfreigabe.
Auch die öffentliche Monatsrangliste muss bei Nutzerinhalten berücksichtigt
werden.
Die aktualisierte Apple Developer Program License Agreement wurde nach
ausdrücklicher kontoweiter Nutzerzustimmung akzeptiert. Neuladen bestätigt
Ausgabe 14. Oktober 2026 und Annahme 21. Oktober 2026; das Warnbanner ist entfernt.
Konkrete Datenschutzantworten stehen in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md). Die Einreichung ist
bestätigt; Veröffentlichung bleibt manuell. Die Metadaten-Lane selbst
reicht nicht ein. Bei `metadata_only:true` blieb trotz `build_number:26`
zunächst Build 25 ausgewählt; deshalb wurde die Build-Beziehung gezielt
per API auf 26 gesetzt und vor der getrennten ReviewSubmission geprüft.

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
Einrichtungsschritte sind abgeschlossen. Das neue AAB (1.4.1, Version Code 2,
SHA-256 `4773dcdf…`) ist hochgeladen; der interne Entwurf
**1.4.1 – Werbefreier Start** ist gespeichert. Kein Rollout und keine
Testerbenachrichtigung.
Die Produktionsländer sind auf Deutschland, Österreich und Schweiz begrenzt;
UI-Readback „Ausgerichtet (3)“. Produktion 2 ist mit elf Änderungen über die
Console zur Prüfung gesendet; der abschließende Dialog ist bestätigt.
Die UI zeigt „Änderungen, die überprüft werden“, Review läuft.
Managed Publishing wurde in dieser Console erfolgreich aktiviert und nach
Neuladen bestätigt. Keine automatische Veröffentlichung nach Freigabe,
keine Tester-Verteilung und kein öffentlicher Release. Beleg:
`.local/qa/google-submission-vcode2-20261021/status.json`.

Der separate Play-API-Zugang im Cloudprojekt `benny-joni-fastlane` ist
eingerichtet und die API als aktiviert bestätigt. Das Servicekonto hat
Zugriff ausschließlich auf Benny & Joni: Read, Manage Store Presence und
Release to Testing Tracks. Google hat Quality Read und Manage Policy
Declarations als automatisch gesetzte Abhängigkeiten ergänzt. Nach
ausdrücklicher Nutzerfreigabe ist zusätzlich Bearbeiten/Löschen von
App-Entwürfen ausschließlich für diese App gespeichert: sechs Apprechte,
keine zusätzlichen kontoweiten Rechte. Kontoweite
Play-Rechte, Cloud-IAM-Rollen und Impersonators sind nicht vergeben.
Der lokale JSON-Schlüssel liegt ausschließlich ignoriert unter
`.local/release/google-play/service-account.json` (`0600`, Ordner `0700`);
sein Pfad ist in der privaten `.env` gesetzt. `tools/fastlane.sh android
verify_auth` war beim Einrichten mit Version Code 1 erfolgreich.
Nach dieser Berechtigung besteht die vollständige DE-/EN-Textvalidierung
mit `android store_metadata screenshots:false validate:true`, einschließlich
echter Änderungen der längeren lokalen Titel. Das frühere 403 bei echten
Änderungen ist damit behoben. Der anschließende Speicherversuch ohne Bilder
wurde jedoch beim Commit sicher abgebrochen: Google antwortet
„Changes are sent for review automatically. The query parameter
changesNotSentForReview must not be set.“ Der Schutz
`rescue_changes_not_sent_for_review: false` ist unverändert. Es gibt keinen
bestätigten Metadaten-API-Commit. Die Produktion-2-Einreichung erfolgte
später getrennt über die Console.
Die längeren Titel wurden anschließend in Play Console als Entwurf
gespeichert und nach Neuladen sowie Sprachwechsel bestätigt:
Deutsch **Benny & Joni: Fitness-Duell**, Englisch **Benny & Joni: Fitness Duel**.
Die Listings stehen auf „Bereit für die Überprüfung“; nichts wurde zur
Prüfung gesendet. Dies ist ein UI-Speichervorgang, kein API-Commit.
Bei späteren API-Speichervorgängen gilt die unten beschriebene Commit-Grenze;
die aktuellen Store-Unterlagen sind bereits über die Console gespeichert.
Beispielvariablen:

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
mit Version 1.4.1 (Code 2, Ziel-API 36) erfolgreich gebaut und ihre Signatur
geprüft. Auch Upload-Keystore und signiertes Release-AAB sind lokal erstellt
und geprüft. Der Kaltstart der aktuellen APK im API-36-Pixel-2-Emulator ist
bestanden, ebenso die Feed-Reproduktion nach Live-Updates und Wischen.
Der Export von acht echten Android-Screenshots ist abgeschlossen.
Vor einer Einführung fehlen das externe Schlüssel-Backup,
der Abschluss der vollständigen Funktionstests. Der originale Code-2-
Gate-Smoke und die erneute Prüfung nach Wiederherstellung sind bestanden. Die
EWR-/Anzeigenprüfung bleibt Voraussetzung einer späteren Aktivierung.
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

Die Play-Lanes verlangen `changes_not_sent_for_review: true`; der automatische
Fallback bleibt mit `rescue_changes_not_sent_for_review: false` ausgeschaltet.
Der aktuelle Metadaten-Speicherversuch bricht an Googles Ablehnung dieses
Parameters ab. Ein Commit kann auch prüfbereite Console-Änderungen zur
Prüfung senden. `release_status: draft` garantiert beim reinen
`store_metadata` keine Review-Pause, da Supply dabei keinen Track schreibt.
`internal_draft` bereitet einen Draft im internen Testkanal vor; eine
generelle Garantie für alle Metadaten-Commits folgt daraus nicht.
[Google: Commit und Console-Änderungen](https://developers.google.com/android-publisher/concurrency-considerations)

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
Store-Listings, sind abgeschlossen. Zusätzlich wurde Produktion 2 mit elf
Änderungen zur Prüfung gesendet; Review läuft. Managed
Publishing ist aktiviert. Die öffentlich erreichbare Supportseite
ermöglicht die Kontolöschanfrage.

Für persönliche Entwicklerkonten, die nach dem 13. November 2023 angelegt
wurden, kann der Produktionszugang erst nach dem vorgeschriebenen
geschlossenen Test beantragt werden: mindestens zwölf Tester, die
durchgehend mindestens vierzehn Tage angemeldet bleiben. Interne Tests
erfüllen diese Voraussetzung nicht.

Der Passwort-E-Mail-Versand über das bestehende Gmail-Konto steht in
[SMTP.md](SMTP.md). Gmail-SMTP ist gespeichert und im Backend bestätigt
(`smtp.gmail.com:587`, Absender `bennyundjoni@gmail.com`, Limit 30/h).
Zustellung einer eigenen Testmail, achtstellige Recovery-Code-Verifikation
und authentisierter Nutzerabruf sind bestanden; das Testkonto wurde
bereinigt. Das Setzen eines neuen Passworts in der App und die anschließende
Anmeldung mit diesem Passwort wurden dabei nicht getestet.

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
