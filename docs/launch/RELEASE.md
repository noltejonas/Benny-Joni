# Release mit Fastlane

Stand 21. Oktober 2026: **Beide Stores sind zur Prüfung eingereicht.**
Google-Review läuft; keine Freigabe oder Veröffentlichung.
Der Ablauf für weitere Uploads steht in
[FASTLANE_STORES.md](FASTLANE_STORES.md).

## Bestätigter Store-Stand

- Apple **1.4.1 (26)**: Verarbeitung `VALID`, Build 26 ausgewählt,
  Version und ReviewSubmission **`WAITING_FOR_REVIEW`**, Release-Typ
  **`MANUAL`**. Eingereicht am 21. Oktober 2026 um 18:15:25 CEST
  (`2026-10-21T16:15:25.406Z`), Submission-ID
  `04ba9efd-76a8-423d-911f-e3abc54178a7`.
  Beleg: `.local/release/apple/build26/submission-status.json`.
  Neue Review-Notizen, beide Sprachfassungen/URLs und Reviewkontakt/-login
  sind per API bestätigt; je vier Screenshots sind `COMPLETE`, ohne
  Verarbeitungsfehler oder Warnungen. Keine öffentliche Veröffentlichung.
- Google Play **1.4.1 (Version Code 2)**: AAB hochgeladen und interner
  Entwurf **1.4.1 – Werbefreier Start** gespeichert. Keine Verteilung an
  Tester. Produktion **2** ist mit DE-/EN-Neuerungen und DACH zur Prüfung
  gesendet: elf Änderungen, abschließender Bestätigungsdialog betätigt.
  Die Console zeigt „Änderungen, die überprüft werden“; Review läuft,
  die Console bestätigt „Deine Änderungen werden jetzt überprüft.“
  **Managed Publishing ist aktiviert und nach Neuladen bestätigt.** Damit
  bleibt auch Google nach Freigabe zurückgehalten; kein öffentlicher Release.
  Vorschau: null Fehler, zwei Warnungen (native Symbole/R8-Mapping).
  Beleg: `.local/qa/google-submission-vcode2-20261021/status.json`.

## Werbefreier Launch und geprüfte Artefakte

`public.app_release_settings.id = 1` steht produktiv auf
`ads_enabled = false`; die Migration ist angewendet und registriert.
Kein UMP-Dialog, kein Werbe-SDK-Start, keine Anzeigen oder Testanzeigen.
Start, Vordergrundwechsel und Online-Rückkehr lesen die Freigabe frisch;
Fehler/Offline bleiben aus. Später ohne weiteres App-Update aktivierbar,
erst nach Zahlungsprofil, Google-Freigabe und Werbe-QA. Ohne Zahlungsdaten
gibt es keine AdMob-Anzeigen und keinen Aufbau von Werbeguthaben.
Werbe-Datenangaben und `Contains ads` bleiben erhalten. Ausschalten
deinitialisiert kein zuvor gestartetes SDK. [Ablauf und Schalter](ADMOB.md)

| Artefakt | SHA-256 |
|---|---|
| `ios/App/build/fastlane/BennyJoni-1.4.1-26.ipa` | `0202bd05663c5ebbcd34473d3acd748072d563e1fc8706ffbb8fc1871e392b41` |
| `android/app/build/outputs/bundle/release/app-release.aab`, Code 2 | `4773dcdf4f60d254acf7fbc5caccc375ffbe5184b527b708417e74af319a38da` |
| `android/app/build/outputs/apk/debug/app-debug.apk`, Code 2 | `e33a219fa79f3d86904481f13d95c31e4b3b75cc91d3d1398ec02aaaf49ef81c` |

iOS Archive/Export und Android `assembleDebug`/`bundleRelease` sind bestanden.
Der Gate-Quellstand besteht 234 Tests und einen erwarteten Release-Skip;
beide produktiven ID-Prüfungen bestehen je 34 Tests. Beide strikten
Store-Bereitschaftschecks einschließlich Screenshots sind bestanden.

## Tatsächliche Geräte- und Werbetests

- Originales Android-Paket **Code 2**: authentisierter Kaltstart,
  Heute/Feed/Stats, Hintergrund/Vordergrund und Einstellungen bestanden.
  Null AdMob-/AdPrivacy-Aufrufe; keine FATAL-Exception, ANR oder ungefangenen
  JavaScript-Fehler. Nach den getrennten UMP-Tests ist das Originalpaket
  wiederhergestellt, APK-Hash exakt bestätigt und derselbe Smoke-Test erneut
  mit null Werbeaufrufen/Fehlern bestanden. Beleg:
  `.local/qa/android-final-vcode2-gate-off/restored/summary.json`.
- Android-Funktionstest im isolierten Wegwerfkonto bestanden: Satz 10
  anlegen, auf 15 ändern, Kaltstart zeigt weiterhin 15, Satz löschen;
  Feed und Stats zeigen danach null. Lokale Demo-Moderationskontrollen
  bestanden: Melden öffnet den E-Mail-Handler ohne Versand; Blockieren zeigt
  den richtigen Bestätigungsdialog und lässt sich abbrechen. Ein temporäres
  DNS-Problem nach Standortwechsel ist durch einen verlustfreien
  Emulatorneustart behoben. Nach ausdrücklicher Nutzerfreigabe wurde das
  eigene QA-Konto über den letzten App-Dialog gelöscht; die App zeigt
  anschließend den normalen Anmeldestart. Unabhängiger lesender
  Backend-Nachweis: Authuser, Profil, Mitgliedschaften, vorher gesicherte
  eigene Challenge, Sätze und Challenge-Wochenziele vollständig entfernt
  (alle geprüften Zähler null). Werbeschalter weiterhin aus. Beleg:
  `.local/qa/device-functional-20261021/android-deletion-readback-20261021T174841Z.private.json`.
  Keine Reviewfixture verändert und keine API-Ersatzlöschung.
- Echtes iPhone 11/iOS 26.2.1, getrenntes QA-Bundle: Review-Login,
  Heute, Feed/Scroll, Stats, Hintergrund/Vordergrund und Kaltstart bestanden
  (XCTest 61 Sekunden). Die 35-sekündige Kaltstartkonsole enthält 39 normale
  Preferences-/App-/Push-Berechtigungsaufrufe, null AdMob-/AdPrivacy-/UMP-/
  ATT-Methoden. Im eigenen Wegwerfkonto wurden Profil, eigene Challenge,
  Wochenziel und Satz mit fünf Wiederholungen tatsächlich per UI angelegt
  und im Backend lesend bestätigt. Der anschließende Funktionstest bestand
  ebenfalls (41,6 Sekunden): Satz von 5 auf 7 bearbeiten, Stats öffnen,
  Kaltstart mit weiterhin +7 im Feed, Satz über die bestätigte UI löschen
  und Stats erneut öffnen. Keine Authentifizierungs- oder Appfehler im
  erfolgreichen Fortsetzungstest. Datenschutz, Impressum und
  Nutzungsbedingungen wurden über die App in Safari mit den richtigen
  Überschriften geöffnet. Die Demo-Meldeauswahl ist visuell geprüft, ohne
  eine Meldung zu versenden; Blockieren auf iOS bleibt ungeprüft.
  Der erste reale Kontolöschversuch zeigte nach beiden Bestätigungen einen
  Fehleralert; der damalige Backend-Readback bestätigte unveränderte Daten.
  Die Ursache ist nicht gesichert. Nach genau einem gezielten Console-/
  Kaltstart-Repro bestand die erneute autorisierte UI-Löschung: beide
  Bestätigungen, anschließend Welcome/Login. Ein unabhängiger SELECT gegen
  die vorher gesicherte Fixture- und Challenge-ID bestätigt alle neun
  geprüften Zähler null: Authuser, Profil, Mitgliedschaften, eigene und
  konkrete Challenge, Sätze und Challenge-Wochenziele entfernt. Keine
  API-Ersatzlöschung, keine belegte Codekorrektur oder Netzwerkursache;
  der zwischenzeitliche Diagnoseaufruf wurde vollständig zurückgerollt.
  Der Werbeschalter bleibt aus. Beleg:
  `.local/qa/device-functional-20261021/ios-deletion-readback-20261021T180657Z.private.json`.
  System-Auto-Lock blieb unverändert; nur die getrennte QA-App hatte einen
  Wachhalteschalter und ist nach Testende beendet. Die Original-App blieb
  unberührt. Dies ist keine vollständige Abnahme der Store-IPA.
  Weitere Belege: `.local/qa/ios-device/status-summary.json`.

Beide neuen Wegwerfkonten sind damit über die App gelöscht und unabhängig
im Backend geprüft. Nach Abschluss aller UI-Eingaben sind nur ihre beiden
privaten Fixture-Passwörter genullt; IDs und Belegreferenzen bleiben mit
Dateimodus 0600 erhalten. Dauerhafte Review-, Fastlane- und SMTP-Zugänge
bleiben unverändert. Beide Store-Versionen bleiben in Prüfung mit
zurückgehaltener Veröffentlichung; für diesen Testabschluss wurde keine
Appquellen- oder Storeänderung vorgenommen.
- Separat geladene Google-Demo-Testbanner: `npa: true`, bestätigte
  Publisher-ID-Deaktivierung und Banner-Lifecycle bestanden; Heute/Overlay
  verbergen Banner, Abbruch/Rückkehr zeigen es wieder. Nur lokale QA-Kopie,
  kein Monetarisierungsnachweis.
- **EWR-Auswahl/Widerruf bleiben offen.** Auch mit Originalpaket-ID,
  produktiver AdMob-App-ID, offiziellem UMP-Testreset und Debug-EWR meldet
  UMP `NOT_REQUIRED`, ohne Formular. Die korrekte Zwei-App-Nachricht ist
  veröffentlicht; Ursache ungeklärt. Vor späterer Werbefreigabe klären.
  Belege: `.local/qa/ump-eea/gate-on-corrected/summary.json` und
  `.local/qa/ump-eea/same-package/summary.json`.

Die vier angepassten öffentlichen HTML-Seiten sind gezielt veröffentlicht:
Root-Pages-Commit `b9ba3c78f3314c7f85c226f53cb80b2706b9a357`, alle HTTP 200
und bytegleich geprüft. Beleg:
`.local/qa/ads-release-gate-20261021/pages-http-readback.json`.

Vom Repo-Root aus lokal prüfen:

```bash
npm ci
npm test
npm run build
node tools/check-store.cjs --platform=ios --screenshots
node tools/check-store.cjs --platform=android
```

Für echte Uploads muss der Bereitschaftscheck ohne offene Platzhalter
bestehen:

```bash
node tools/check-store.cjs --platform=ios --ready --screenshots
node tools/check-store.cjs --platform=android --ready --screenshots
```

Dann in `ios/App`:

```bash
bundle exec fastlane verify_auth
bundle exec fastlane beta
bundle exec fastlane store_metadata
```

`beta` erstellt einen TestFlight-Build und darf sichere Google-Testanzeigen
verwenden. `store_metadata` lädt die Texte und ausgewählten Screenshots in
die vorbereitete Store-Version. Ein kompletter App-Store-Build mit
Store-Unterlagen ist `bundle exec fastlane release`. Der Build setzt echte,
zusammenpassende AdMob-IDs voraus; diese sind für beide Plattformen eingesetzt
und geprüft. `screenshots:false` überspringt Bilder, `metadata_only:true`
überspringt den Build. Vor dem Upload werden lokale Rechts-/Support-Entwürfe
und Text-/Bilddateien geprüft.

Die iOS-Upload-Lanes lassen einen Entwurf zurück; `submit:true` ist gesperrt.
Bei Play ist die unten beschriebene API-Commit-Grenze zusätzlich zu beachten.
In App Store Connect den fertigen Build, Review-Zugang, Altersfreigabe,
Datenschutz, Länder und Preis prüfen und dort manuell einreichen. Auch die
Veröffentlichung nach einer Freigabe erfolgt manuell.

Für Play mit separatem Dienstkonto:

```bash
bundle exec fastlane android verify_auth
bundle exec fastlane android store_metadata
bundle exec fastlane android internal_draft aab:/absoluter/pfad/app-release.aab
```

In Play Console sind Datenschutz-URL, Werbung, isolierter Review-Zugang,
Zielgruppe 16–17/18+, Gesundheitsfunktionen, Kategorie/öffentlicher Kontakt
und Data safety mit allen zwölf Datentypen gespeichert; die UI hat „Saved“
bestätigt. Details stehen in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md). IARC und beide
Play-Listings sind inzwischen ebenfalls vollständig gespeichert; alle elf
Einrichtungsschritte abgeschlossen, Listing „Bereit für Überprüfung“.
IARC: USK 12, ESRB Teen, PEGI Parental Guidance; Zielgruppe weiterhin 16+.
Icon, zwei lokalisierte Feature-Grafiken und acht echte Android-Screenshots
sind einschließlich KI-Kennzeichnung ihrer Avatare/Maskottchen hinterlegt.
Das neue AAB (1.4.1, Version Code 2, SHA-256 `4773dcdf…`) ist hochgeladen;
der interne Entwurf **1.4.1 – Werbefreier Start** ist gespeichert. Kein Rollout und keine Testerbenachrichtigung. Apples App Privacy
ist mit allen 15 Datentypen nach ausdrücklicher Nutzerzustimmung
veröffentlicht; der UI-Readback bestätigt 13 verknüpfte und zwei nicht
verknüpfte Datentypen, keine Tracking-Daten und die korrekte Datenschutz-URL.
Auch Altersfreigabe und Inhaltsrechte sind gespeichert: berechnet 13+,
manueller Override 16+ wegen der Nutzungsbedingungen, erforderliche Rechte
bestätigt, reguliertes Medizinprodukt Nein. Die kostenlosen Preise mit
Basisland Deutschland und die ausschließliche Verfügbarkeit in Deutschland,
Österreich und Schweiz sind zurückgelesen; alle drei Länder stehen auf
„Verfügbar bei App-Veröffentlichung“. Mac und Apple Vision bleiben nach
Neuladen ausgeschlossen. Der vorhandene Trader-Status bleibt unverändert;
eine neue DSA-Verifizierung ist nicht belegt. Version 1.4.1 mit Build 26 ist
zur Prüfung eingereicht (`WAITING_FOR_REVIEW`); die Veröffentlichung bleibt
manuell und ist nicht erfolgt.
Die aktualisierte Apple Developer Program License Agreement ist nach
ausdrücklicher kontoweiter Nutzerzustimmung akzeptiert. Neuladen bestätigt
Ausgabe 14. Oktober und Annahme 21. Oktober 2026; das Warnbanner ist entfernt.
Play-Produktionsländer: Deutschland, Österreich und Schweiz, bestätigt als
„Ausgerichtet (3)“. Produktionsversion 2 ist zur Prüfung gesendet;
Review läuft, Managed Publishing ist aktiviert. Keine Veröffentlichung.
Der separate API-Zugang im Cloudprojekt
`benny-joni-fastlane` ist eingerichtet, mit aktivierter API und auf diese App
begrenztem Servicekonto. `android verify_auth` war beim Einrichten mit dem
damaligen Code 1 erfolgreich. Der private JSON-Schlüssel bleibt im ignorierten lokalen
Release-Ordner. Nach ausdrücklicher Nutzerfreigabe ist das zusätzliche
Entwurfsrecht nur für diese App gespeichert: sechs Apprechte, keine neuen
kontoweiten Rechte. Die vollständige DE-/EN-Textvalidierung besteht jetzt.
Der folgende Speicherversuch ohne Bilder wurde beim Commit sicher
abgebrochen: Google lehnt `changesNotSentForReview` mit dem Hinweis auf
automatisches Senden zur Prüfung ab. `rescue_changes_not_sent_for_review:
false` bleibt unverändert. Es gab keinen erfolgreichen Metadaten-API-Commit.
Die längeren Titel wurden anschließend über
die Console als Entwurf gespeichert: **Benny & Joni: Fitness-Duell** (de)
und **Benny & Joni: Fitness Duel** (en). Neuladen und Sprachwechsel bestätigen
die Werte. Die spätere Produktionsversion 2 wurde getrennt über die Console
zur Prüfung gesendet; Review läuft.
Ein API-Commit kann sämtliche prüfbereiten Änderungen einschließlich der
Console-Änderungen zur Prüfung senden. Ein Draft-Release-Status ist keine
allgemeine Garantie für einen reinen Metadaten-Commit: Bei `store_metadata`
schreibt Supply keinen Track, daher greift `release_status: draft` dort
nicht als Schutz. Der unveränderte `rescue: false` verhindert den
automatischen Fallback. [Google: Commit und parallele Console-Änderungen](https://developers.google.com/android-publisher/concurrency-considerations)

Die nach dem AAB-Upload neu verlangte Werbe-ID-Erklärung ist gespeichert:
Ja, mit Analyse, Werbung/Marketing und Betrugsprävention/Sicherheit/Compliance.
Die UI bestätigte die Änderung; App-Inhalte zeigte danach **„Alles erledigt“**
ohne offene Deklarationen. Die spätere Produktion-2-Einreichung ist oben
bestätigt. Deren Vorschau zeigt keine Fehler und zwei Warnungen:
kein R8-Mapping bei `minifyEnabled=false` und fehlende native SDK-Debugsymbole.

JDK 21 und Android SDK sind auf diesem Mac eingerichtet. Die Debug-APK mit
Version 1.4.1 (Code 2, Ziel-API 36) wurde am 21. Oktober 2026 erfolgreich
gebaut und mit der lokalen Debug-Signatur geprüft. Anschließend wurden der
lokale Upload-Keystore und das signierte Release-Bundle
`android/app/build/outputs/bundle/release/app-release.aab` erstellt und geprüft.
Der Kaltstart und die Feed-Reproduktion mit Live-Updates und Abwärtswischen
im API-36-Emulator sind bestanden. Je vier echte Android-Screenshots für
Deutsch und Englisch sind exportiert und geprüft. Vor einer Einführung
fehlen das externe Schlüssel-Backup und der Abschluss der vollständigen
Funktionstests. Der originale Gate-false-Smoke ist bestanden. EWR-Dialogwahl/Widerruf und
Anzeigenauslieferung gehören zur späteren Werbeaktivierung. Artefakt-
Hashes und Details stehen in [ANDROID.md](ANDROID.md).
Gmail-SMTP ist gespeichert und bestätigt: `smtp.gmail.com:587`, Benutzer
und Absender `bennyundjoni@gmail.com`, Absendername `Benny & Joni`, Passwort
vorhanden, 30 Mails pro Stunde und 60 Sekunden Mindestabstand. Eine eigene
Testmail kam an; Recovery-Code-Verifikation und authentisierter Nutzerabruf
lieferten HTTP 200. Das temporäre Konto samt Profil und privaten Code-/
Passwortdateien wurde bereinigt; Review-Konten blieben unberührt.
Das Setzen eines neuen Passworts in der App und die Anmeldung damit sind
noch ungeprüft; siehe [SMTP.md](SMTP.md). Die konkrete Gmail-Nennung ist
in der öffentlichen Datenschutzerklärung ergänzt und bytegleich geprüft
(HTTP 200, Root-Pages-Commit `d783559a9531169b29341ef0070aea85c9cefc53`).
Die Hinweise zur serverseitig ausgeschalteten Werbung sind ebenfalls
öffentlich veröffentlicht und bytegleich geprüft (Root-Pages-Commit
`b9ba3c78f3314c7f85c226f53cb80b2706b9a357`). Die angepassten Apple-Review-
Notizen sind hochgeladen und vor Einreichung per API bestätigt.
Eventuell vorgeschriebene geschlossene Tests bleiben Kontoschritte. Der
bisherige Play-API-Speicherversuch wurde abgebrochen; darüber wurde keine
Review-Einreichung oder Veröffentlichung ausgelöst. Die Commit-Grenze oben gilt
auch für spätere Aufrufe der Play-Lanes.

Der Apple-API-Zugang ist eingerichtet, `verify_auth` erfolgreich. Die lokalen
Zugangsdaten bleiben in der ignorierten `.env`; die private `.p8` liegt mit
Rechten `0600` im ignorierten `.local/release/apple/`. Schlüsseldateien,
Dienstkonto-JSON und Upload-Keystore nicht versionieren und separat sichern.
Bei `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` muss der
Account Holder die offene Apple-Vereinbarung im Konto prüfen.

Die Work-Sperrmigration `20261021120000_disable_work_mode.sql` ist seit dem
21. Oktober 2026 produktiv angewendet und in der Migrationshistorie registriert.
Eine zuvor aktive Work-Flag wurde deaktiviert; Challenge, Kategorien und
Trainingssätze sind erhalten. Der Trigger verhindert erneutes Aktivieren
auch durch alte Clients.
