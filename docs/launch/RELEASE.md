# Release mit Fastlane

Der aktuelle Ablauf für beide Stores steht in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Apples Store-Texte und acht
Screenshots sind für Version 1.4.1 hochgeladen und per API geprüft; offene
Build- und Store-Schritte sind in
[STORE_LISTING.md](STORE_LISTING.md) aufgeführt.

Stand 21. Oktober 2026: Beide Apple-Lokalisierungen (`de-DE`, `en-GB`)
einschließlich Namen, Untertiteln und URLs stimmen mit den lokalen Metadaten
überein. Je vier Screenshots sind `COMPLETE`, ohne Fehler oder Warnungen.
Review-Angaben sind hinterlegt; Status `PREPARE_FOR_SUBMISSION`, Release-Typ
`MANUAL`, Build 25 zugeordnet und per API zurückgelesen. „Neuerungen“ ist für diese erste
App-Version nicht verfügbar und wird von Fastlane korrekt übersprungen.

Der neueste TestFlight-Build **1.4.1 (25)** ist erfolgreich hochgeladen
und per App-Store-Connect-API als `processingState=VALID` bestätigt.
Er ist nicht abgelaufen; `usesNonExemptEncryption=false`, intern
`IN_BETA_TESTING`, extern `READY_FOR_BETA_SUBMISSION`.
Der Store-Version 1.4.1 ist Build 25 zugeordnet; es wurde nichts zur
Store-Prüfung eingereicht oder veröffentlicht.

Die geprüfte IPA liegt unter
`ios/App/build/fastlane/BennyJoni-1.4.1-25.ipa`.
SHA-256: `a31c70025e3465a2a88e6bda8e92895a05d207e9b2caffedd63290cb35b718a8`.
Sie enthält die aktuellen Store-Links, den Avatarfix und den korrigierten
AdMob-Ablauf sowie die im Android-Emulator geprüfte Feed-Korrektur.
Der überflüssige ATT-Purpose-Key ist im Haupt-Plist und in den beiden
kompilierten Sprachdateien der finalen IPA nachweislich nicht vorhanden;
die App fordert keine Tracking-Erlaubnis an. Der dazu angepasste
Ads-Konfigurationscheck besteht mit 27 Tests und einem erwarteten Skip.
Android wurde dafür nicht neu gebaut; das zuletzt geprüfte AAB ist unverändert.
Der letzte Gesamtcheck ergab 220 bestandene Tests und einen
bewusst übersprungenen Release-Check (221 insgesamt). Webbuild, beide
Capacitor-Syncs, Android-Debug- und Release-Build sowie der iOS-Release-
Simulatorbuild waren erfolgreich. Der Android-Release-Build führte den
zusätzlichen Check für produktive AdMob-IDs erfolgreich aus.

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

Alle Upload-Lanes lassen einen Entwurf zurück. `submit:true` ist gesperrt.
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
Das finale AAB (1.4.1, Version Code 1, SHA-256 `5745afb5…`) ist hochgeladen;
die Console bestätigt ein App Bundle und zeigt `1 (1.4.1)`. Der interne
Entwurf **1.4.1 – Initial internal test** ist mit DE-/EN-Neuerungen (2/2)
gespeichert. Kein Rollout und keine Testerbenachrichtigung. Apples App Privacy
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
eine neue DSA-Verifizierung ist nicht belegt. Die App-Version wurde nicht
eingereicht oder veröffentlicht.
Die Play-Vorschau zeigt keine Fehler und drei Warnungen: keine internen
Tester, kein R8-Mapping bei `minifyEnabled=false` und fehlende native
SDK-Debugsymbole. „Save and publish“ wurde nicht betätigt.

JDK 21 und Android SDK sind auf diesem Mac eingerichtet. Die Debug-APK mit
Version 1.4.1 (Code 1, Ziel-API 36) wurde am 21. Oktober 2026 erfolgreich
gebaut und mit der lokalen Debug-Signatur geprüft. Anschließend wurden der
lokale Upload-Keystore und das signierte Release-Bundle
`android/app/build/outputs/bundle/release/app-release.aab` erstellt und geprüft.
Der Kaltstart und die Feed-Reproduktion mit Live-Updates und Abwärtswischen
im API-36-Emulator sind bestanden. Je vier echte Android-Screenshots für
Deutsch und Englisch sind exportiert und geprüft. Vor einer Einführung
fehlen das externe Schlüssel-Backup, vollständige Funktionstests und die
AdMob-/UMP-Geräteprüfung. Artefakt-
Hashes und Details stehen in [ANDROID.md](ANDROID.md).
Eventuell vorgeschriebene geschlossene Tests bleiben Kontoschritte. Die Play-Lanes
senden keine Änderung zur Prüfung und veröffentlichen keine Version.

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
