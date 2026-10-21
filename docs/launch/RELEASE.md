# Release mit Fastlane

Der aktuelle Ablauf für beide Stores steht in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Store-Texte und Screenshots sind
vorbereitet; noch offene persönliche Angaben und Store-Einrichtungen sind in
[STORE_LISTING.md](STORE_LISTING.md) aufgeführt.

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

JDK 21 und Android SDK sind auf diesem Mac eingerichtet. Die Debug-APK mit
Version 1.4.1 (Code 1, Ziel-API 36) wurde am 21. Oktober 2026 erfolgreich
gebaut und mit der lokalen Debug-Signatur geprüft. Anschließend wurden der
lokale Upload-Keystore und das signierte Release-Bundle
`android/app/build/outputs/bundle/release/app-release.aab` erstellt und geprüft.
Vor dem ersten Upload fehlen das externe Schlüssel-Backup, Gerätetests und
echte Android-Screenshots; siehe [ANDROID.md](ANDROID.md).
Der erste Play-Upload und eventuell
vorgeschriebene geschlossene Tests bleiben Kontoschritte. Die Play-Lanes
senden keine Änderung zur Prüfung und veröffentlichen keine Version.

Die lokalen Zugangsdaten bleiben in der ignorierten `.env`; `.p8`,
Dienstkonto-JSON und Upload-Keystore außerhalb des öffentlichen Repos
aufbewahren. Bei `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED` muss der
Account Holder die offene Apple-Vereinbarung im Konto prüfen.

Die Work-Sperrmigration `20261021120000_disable_work_mode.sql` ist seit dem
21. Oktober 2026 produktiv angewendet und in der Migrationshistorie registriert.
Eine zuvor aktive Work-Flag wurde deaktiviert; Challenge, Kategorien und
Trainingssätze sind erhalten. Der Trigger verhindert erneutes Aktivieren
auch durch alte Clients.
