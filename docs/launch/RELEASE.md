# App bauen und hochladen (Version 1.4)

Zwei Wege. **Heute Weg A nehmen**: Auf diesem Mac läuft nur das System-Ruby
2.6, fastlane ist nicht installiert, und das Einrichten kostet 30 Minuten auf
dem kritischen Pfad. Weg B lohnt sich für die Hotfixes danach.

Gemeinsame Werte:

| | |
|---|---|
| Bundle-ID | `com.bennyjoni.terminator` |
| Team | `HHJ498GCL6` |
| Version | `MARKETING_VERSION = 1.4` (muss zur Version in App Store Connect passen) |
| Build | `CURRENT_PROJECT_VERSION = 20` (über allen bisherigen TestFlight-Builds) |
| Xcode-Projekt | `ios/App/App.xcodeproj`, Scheme `App` |

## Weg A: Xcode, ohne fastlane (ca. 40 min, davon 5–30 min Warten auf Apple)

Voraussetzung: Xcode ist installiert, in Xcode → Settings → Accounts ist eine
Apple-ID aus dem Team angemeldet, Node und npm sind da.

1. Stand holen (im Launch-Checkout, nach dem Merge des Nacht-PRs):
   ```bash
   git switch main && git pull
   ```
2. Abhängigkeiten exakt nach `package-lock.json` installieren. **Nicht
   überspringen:** Ohne `node_modules/@capacitor/app` findet Xcode das Paket
   aus `ios/App/CapApp-SPM/Package.swift` nicht und der Build scheitert.
   ```bash
   npm ci
   ```
3. Web-Code ins iOS-Projekt kopieren (bei aktivem Hook werden dabei die
   JSX-Dateien vorkompiliert):
   ```bash
   npx cap sync ios
   ```
   Bricht das mit einer Meldung aus `tools/build-web.cjs` ab: nicht weiterbauen,
   Meldung an Claude. Notlösung: in `package.json` die Zeile
   `"capacitor:copy:after"` entfernen und Schritt 3 wiederholen. Die App
   übersetzt dann wie bisher im Gerät (langsamerer Start, funktioniert aber).
4. Kurz prüfen, dass nichts Unerwartetes geändert wurde:
   ```bash
   git status --short
   ```
   Erwartet: keine Änderungen, höchstens unter `ios/App/App/public` (ignoriert).
   Ändert sich `ios/App/CapApp-SPM/Package.swift`, ist das meist ein
   Windows-Pfad-Problem: Datei mit `git checkout -- ios/App/CapApp-SPM/Package.swift`
   zurücksetzen.
5. Projekt öffnen:
   ```bash
   open ios/App/App.xcodeproj
   ```
6. In Xcode links das Projekt „App“ → Target „App“:
   - **Signing & Capabilities**: „Automatically manage signing“ an, Team
     `HHJ498GCL6`. Push Notifications muss als Capability da sein.
   - **General**: Version `1.4`, Build `20`. Wurde schon ein Build 20
     hochgeladen, Build auf 21 usw. erhöhen.
7. Oben als Ziel **„Any iOS Device (arm64)“** wählen (kein Simulator).
8. **Product → Archive**. Dauert 3–10 Minuten. Danach öffnet sich der Organizer.
9. Im Organizer das neue Archiv wählen → **Distribute App** → **App Store
   Connect** → **Upload** → Standardoptionen lassen → **Upload**.
10. Apple verarbeitet den Build 5–30 Minuten. Es kommt eine Mail „The
    following build has completed processing“. Erst dann lässt er sich in der
    Version 1.4 unter „Build“ auswählen.

Typische Fehler:

- **„No Accounts“ / „No signing certificate“**: Xcode → Settings → Accounts →
  „+“ → Apple-ID anmelden, dann „Download Manual Profiles“.
- **„The bundle version must be higher …“**: Build-Nummer in Schritt 6 erhöhen.
- **ITMS-91053 (Privacy-Manifest fehlt)**: `ios/App/App/PrivacyInfo.xcprivacy`
  muss im Target sein (kommt aus dem Nacht-Paket „iOS-Projekt“).
- **`FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`**: Der Account Holder
  muss in App Store Connect unter „Business“ die offene Vereinbarung annehmen.
- **Build fehlt in App Store Connect**: noch in Verarbeitung, oder unter
  TestFlight steht „Fehlende Compliance“. Das beantwortet
  `ITSAppUsesNonExemptEncryption = false` in der Info.plist bereits.

## Weg B: fastlane

### Einmalig einrichten (ca. 30 min)

Das System-Ruby 2.6 reicht nicht (`Gemfile.lock` verlangt Bundler 4).

1. Ruby über Homebrew installieren und in den PATH nehmen:
   ```bash
   brew install ruby
   echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
   exec zsh
   ruby -v    # muss 3.x oder neuer zeigen, nicht 2.6
   ```
2. Gems installieren (Versionen gepinnt in `ios/App/Gemfile.lock`):
   ```bash
   cd ios/App
   bundle config set --local path vendor/bundle
   bundle install
   ```
   Meldet Bundler eine falsche eigene Version: `gem install bundler -v 4.0.11`,
   dann `bundle install` wiederholen.
3. App-Store-Connect-API-Key anlegen, falls es noch keinen gibt: App Store
   Connect → Benutzer und Zugriff → Integrationen → App Store Connect API →
   „+“ → Zugriff „App Manager“. Die `.p8` lässt sich **nur einmal**
   herunterladen. Außerhalb des Repos ablegen, z. B. `~/Keys/`.
4. `.env` anlegen und ausfüllen (gitignored):
   ```bash
   cp fastlane/.env.example fastlane/.env
   open -e fastlane/.env
   ```
   Für `beta` reichen `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`. Für
   `release` zusätzlich die `REVIEW_*`-Werte.
5. Zugang prüfen:
   ```bash
   bundle exec fastlane verify_auth
   ```

### Lanes

```bash
cd ios/App
bundle exec fastlane beta                       # TestFlight, wie bisher
bundle exec fastlane release                    # bauen, Build + Store-Texte hochladen, NICHT einreichen
bundle exec fastlane release metadata_only:true # nur Texte und Review-Daten (z. B. nach Upload aus Xcode)
bundle exec fastlane release submit:true        # zusätzlich zur Prüfung einreichen
```

`release` macht:

1. Prüft `ios/App/fastlane/metadata` auf `[BITTE AUSFÜLLEN` und auf die
   Zeichenlimits. Bricht sonst vor dem Bauen ab.
2. Prüft die Review-Daten aus der `.env`. Fehlt einer der Werte
   `REVIEW_FIRST_NAME`, `REVIEW_LAST_NAME`, `REVIEW_EMAIL`, `REVIEW_PHONE`,
   `REVIEW_USER`, `REVIEW_PASSWORD`, lädt sie gar keine Review-Daten hoch (dann
   von Hand eintragen). Sonst nimmt sie die englischen Notizen aus
   `docs/launch/REVIEW_NOTES.md` und setzt `REVIEW_CODE` als Einladungscode ein.
3. Baut genau wie `beta` (gemeinsame `build_ipa`-Lane: Build-Nummer aus
   TestFlight + 1, `npm ci`, `npx cap sync ios`, Archiv, Export).
4. Lädt Build, Texte, URLs, Copyright, Kategorie und Review-Daten hoch, legt die
   Version 1.4 an bzw. benennt die vorbereitete um. Screenshots nicht.
5. Veröffentlichung immer **manuell** nach der Freigabe, keine phasenweise
   Veröffentlichung. Mit `submit:true` reicht sie ein und zieht dabei eine noch
   wartende Einreichung zurück.

Nicht per fastlane (bleibt Handarbeit in App Store Connect, siehe
`STORE_LISTING.md`): Altersfreigabe, App-Datenschutz, Preis und
Verfügbarkeit, Screenshots, DSA-Händlerangaben.

## Nach der Freigabe

- Status „Ausstehende Entwicklerfreigabe“ → zum gewünschten Zeitpunkt
  „Diese Version veröffentlichen“.
- Nach 1–2 Stunden den Direktlink `https://apps.apple.com/de/app/id<APP_STORE_ID>`
  testen. Die Suche findet neue Apps oft erst nach 1–2 Tagen.

## Hotfix 1.4.1

1. Fix auf `main`, Tests grün.
2. In Xcode Version auf `1.4.1` erhöhen (Target App → General → Version).
3. `ios/App/fastlane/metadata/de-DE/release_notes.txt` anpassen. Bei der ersten
   Version hat fastlane das Feld übersprungen, ab 1.4.1 wird es verwendet.
4. Weg A oder `bundle exec fastlane release submit:true`.
5. Jede neue Version geht wieder durch die Prüfung (meist schneller als die
   erste).
