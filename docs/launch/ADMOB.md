# Werbung mit Google AdMob (Version 1.4.1)

Branch `claude/admob-1.4.1`, aufgesetzt auf den gemergten Launch-Stand.
**Nicht in den Launch-Build mergen.** Dieser Branch wird Version 1.4.1,
sobald 1.4 live ist und die App in AdMob mit dem Store-Eintrag verknüpft ist.

Platzhalter heißen wie überall `[BITTE AUSFÜLLEN: …]`.

## 1. Was der Branch schon enthält

| Was | Wo |
|---|---|
| Plugin `@capacitor-community/admob` **8.2.1**, exakt gepinnt. Capacitor bleibt 8.3.3, nur das Plugin kommt dazu. | `package.json`, `package-lock.json`, `ios/App/CapApp-SPM/Package.swift`, `Package.resolved` (GoogleMobileAds 13.11.0, UMP 3.1.0) |
| Werbelogik. Das Plugin kommt direkt von der nativen Bridge (`window.Capacitor.Plugins.AdMob`), ohne CDN. | `www/ads.js`, in `www/index.html` als klassisches Skript nach `onboarding-model.js` |
| Banner nur in **Feed** und **Stats**. Nie im Onboarding, nie in der Demo, nie auf Heute, im Strafkonto oder in den Einstellungen. | `www/app.jsx` (`adsOk`) |
| Einwilligung (Google UMP) erst, wenn Feed oder Stats das Banner wollen, höchstens einmal pro Sitzung und nie unter einem Sheet, Vollbild oder einer Onboarding-Ebene | `www/ads.js` (`checkConsent`, `ensureConsent`) |
| Banner wird ausgeblendet bei Sheets, Vollbild-Diagramm, Feier, Onboarding-Ebenen und jedem `aria-modal`-Dialog. Ohne Anzeige bleibt keine Lücke, neuer Versuch nach 60 s. | `www/ads.js` (`OVERLAY_SELECTOR`, `--pt-ad-h`), `www/redesign.css`, `www/demo.js` |
| Einstellungen → „Werbe-Einwilligung“ (nur wenn Google sie verlangt) | `www/settings.jsx` |
| Nur nicht personalisierte Anzeigen (`npa=1`), Inhalte höchstens „General“, kein ATT-Dialog | `www/ads.js` |
| Info.plist: `GADApplicationIdentifier` (**Platzhalter: Google-Test-ID**), 50 SKAdNetwork-IDs, `NSUserTrackingUsageDescription` als Absicherung | `ios/App/App/Info.plist` |
| Release-Sperre: Test-App-ID nur im Testmodus, Info.plist gleich `PROD.appId`, Publisher-IDs passen. `fastlane release` bricht ab, solange nur Test-IDs drin sind. | `tests/ads-config.test.cjs`, `ios/App/fastlane/Fastfile` (`check_ads_live!`) |
| Datenschutzerklärung Abschnitt 2.11, Store-Texte, Review-Notizen | `docs/launch/site/datenschutz.html`, `ios/App/fastlane/metadata/de-DE/*.txt`, `docs/launch/REVIEW_NOTES.md` |
| Version 1.4.1, Build 21 | `ios/App/App.xcodeproj/project.pbxproj` |

Im Simulator geprüft (iPhone 17 Pro, Testmodus): Googles Einwilligungsdialog
erscheint über die native Bridge. Mit übersprungenem Dialog (nur im Test-Aufbau,
der Simulator kann nicht tippen) lädt das adaptive Test-Banner (402 × 63 pt),
und `--pt-ad-h` steht auf 71 px. Das Banner über der echten Tab-Leiste in Feed
und Stats ist noch **nicht** auf einem Gerät geprüft, das ist Teil von Schritt 15. Vor `checkConsent()` baut die App keine
Verbindung zu Google auf. Es gibt nur eine DNS-Erreichbarkeitsprüfung von
`www.google.com` beim Start, ausgelöst vom SDK.

### So läuft es in der App

1. Nach dem Onboarding (keine Einstiegs-Ebene offen, bei neuen Leuten erst
   nach dem ersten Satz, nicht in der Demo) fragt `checkConsent()` still den
   Einwilligungsstand bei Google ab. Hat jemand schon entschieden, startet das
   SDK sofort.
2. Öffnet die Person Feed oder Stats, zeigt Google bei Bedarf **einmal** den
   Einwilligungsdialog. Danach startet das SDK, das Banner erscheint direkt
   über der Tab-Leiste.
3. Lehnt jemand ab, kann Google trotzdem eingeschränkte Anzeigen zeigen. Die
   App funktioniert in jedem Fall normal.

## 2. Reihenfolge

| Wann | Wer | Schritt |
|---|---|---|
| Sofort (auch vor dem Livegang) | A | 3 Konto, 4 Zahlungsprofil, 5 App (als „nicht veröffentlicht“), 6 Anzeigenblock |
| Sofort | A oder B | 7 DSGVO-Nachricht, 8 Blockierungen, 9 Domain + `app-ads.txt` vorbereiten |
| Nach dem Livegang von 1.4 | A | App in AdMob mit dem App-Store-Eintrag verknüpfen (Schritt 5), `app-ads.txt` prüfen |
| Danach | Claude oder B | 10 echte IDs eintragen, 11 Testgeräte, Tests, TestFlight |
| Vor dem Einreichen | A | 12 Datenschutzerklärung live, 13 App-Datenschutz, 14 Altersfreigabe, 15 einreichen |

Hinweis: In `docs/launch/RELEASE.md` heißt der erste Hotfix ebenfalls 1.4.1.
Kommt ein Hotfix vorher, diesen Branch auf `main` rebasen und die Version auf
die nächste freie Nummer setzen (z. B. 1.4.2, Build über dem letzten Upload).

## 3. AdMob-Konto (A, ca. 15 min)

1. https://admob.google.com mit dem Firmen-Google-Konto öffnen (nicht privat).
2. Land **Deutschland**, Zeitzone **Europe/Berlin**, Währung **EUR**.
3. AdMob-Bedingungen akzeptieren. Google prüft das Konto, das kann einige
   Tage dauern. Bis dahin liefert AdMob eingeschränkt oder gar nicht aus.

## 4. Zahlungsprofil (A, ca. 15 min)

1. Zahlungen → Zahlungsinformationen: Name bzw. GbR und Adresse genau wie im
   Impressum.
2. Steuerangaben (USt-IdNr., falls vorhanden; sonst Kleinunternehmer-Angabe)
   und Bankkonto. **[BITTE AUSFÜLLEN: Steuerstatus mit Steuerberatung klären]**
3. Google schickt ab ca. 10 € Guthaben einen PIN-Brief an die Adresse.
   Ausgezahlt wird ab 70 € Guthaben, monatlich.

## 5. App in AdMob anlegen und verknüpfen (A, ca. 10 min)

1. Apps → App hinzufügen → **iOS**.
2. „Ist die App in einem unterstützten App-Store veröffentlicht?“
   - Vor dem Livegang: **Nein**, Name „Benny & Joni“.
   - Nach dem Livegang: **Ja**, nach „Benny & Joni“ bzw. der App-Store-ID suchen.
3. Nutzerbezogene Messwerte: aus lassen (kein Tracking).
4. Die **App-ID** (`ca-app-pub-…~…`) notieren → Schritt 10.
5. Nach dem Livegang von 1.4: App-Einstellungen → „App-Store-Details
   hinzufügen“ (Verknüpfen). Danach prüft Google die App, meist 1–3 Tage. Erst
   dann gibt es volle Auslieferung. Vorher steht dort „Eingeschränkte
   Anzeigenbereitstellung“, und die App zeigt oft kein Banner. Das ist kein
   Fehler, der Platz bleibt einfach leer.

## 6. Anzeigenblock (A, ca. 5 min)

1. In der App → Anzeigenblöcke → **Banner**.
2. Name „iOS Banner Feed/Stats“, Aktualisierungsrate „Von Google optimiert“.
3. Die **Anzeigenblock-ID** (`ca-app-pub-…/…`) notieren → Schritt 10.
4. Optional „Prämie“ für später (24 h werbefrei gegen ein Video, noch nicht
   eingebaut). **Keine** Interstitials und keine App-Start-Anzeigen: Sie
   würden das schnelle Loggen stören.

## 7. DSGVO-Einwilligungsnachricht (A oder B, ca. 20 min)

Ohne veröffentlichte Nachricht gibt es in EWR, UK und der Schweiz **keine
Anzeigen**. Die App ruft dann nie ein Formular auf und das SDK startet nicht.

1. Datenschutz und Mitteilungen → **Europäische Vorschriften** → Nachricht
   erstellen.
2. App „Benny & Joni“ wählen. Sprachen: **Deutsch** als Standard, Englisch dazu.
3. Datenschutz-URL: `https://noltejonas.github.io/Benny-Joni/datenschutz.html`
   (bzw. die eigene Domain aus Schritt 9). Die Seite muss den Abschnitt 2.11
   enthalten und live sein, bevor 1.4.1 eingereicht wird (Schritt 12).
4. Schaltflächen: **„Nicht einwilligen“ einschalten.** „Schließen“ optional.
5. Gilt für EWR, UK und die Schweiz.
6. Speichern und **Veröffentlichen**.
7. **Keine „IDFA-Erläuterung“ bzw. ATT-Nachricht anlegen.** Sonst zeigt iOS
   einen Tracking-Dialog. Die App ist auf „kein Tracking“ ausgelegt
   (App-Datenschutz, Store-Texte, Datenschutzerklärung).
8. Eine Nachricht für US-Bundesstaaten ist nicht nötig, die App ist nur in
   DE/AT/CH erhältlich.

## 8. Blockierungen (A oder B, ca. 10 min)

Blockierungseinstellungen → für alle Apps bzw. diese App:

- **Inhalte → maximale Anzeigeninhaltsklassifizierung: G** (passt zu
  `MAX_AD_CONTENT_RATING = 'General'` in `www/ads.js` und Altersfreigabe 4+).
- **Sensible Kategorien sperren:** Glücksspiel, Dating, Alkohol, Gewichtsverlust
  und Diäten, Kosmetische Eingriffe und Körperbild. Bei einer Fitness-App unter
  Freunden schaden genau diese Anzeigen der Marke.

## 9. Eigene Domain und `app-ads.txt` (B, ca. 30 min)

AdMob sucht `app-ads.txt` auf der **Wurzel der Domain** der Website aus dem
App-Store-Eintrag (laut Google die Marketing-URL; **[BITTE AUSFÜLLEN: in der
AdMob-Hilfe prüfen, welches Store-Feld AdMob ausliest]**). Heute steht dort
`https://noltejonas.github.io/Benny-Joni/`. Unter
`https://noltejonas.github.io/Benny-Joni/app-ads.txt` findet AdMob die Datei
nicht, weil sie im Unterordner liegt.

Empfohlen: **eigene Domain** (z. B. `bennyjoni.de`, ca. 10 €/Jahr).

1. Domain kaufen. GitHub → Repo → Settings → Pages → Custom domain eintragen,
   DNS nach GitHub-Anleitung setzen, „Enforce HTTPS“ an. GitHub leitet die
   alten `github.io`-Links automatisch weiter, die Links in 1.4 bleiben also gültig.
2. Datei `docs/launch/site/app-ads.txt` anlegen. Mit einer eigenen Domain liegt
   die Seite auf der Wurzel, und der Workflow `legal-pages` veröffentlicht die
   Datei mit:
   ```
   google.com, pub-[BITTE AUSFÜLLEN: 16 Ziffern aus der App-ID], DIRECT, f08c47fec0942fa0
   ```
   Die Publisher-ID ist der Teil `pub-…` vor der Tilde der App-ID.
3. In App Store Connect Marketing- und Support-URL auf die neue Domain setzen
   (`ios/App/fastlane/metadata/de-DE/*_url.txt`), dazu `LEGAL_BASE` in
   `www/onboarding-model.js` für 1.4.1.
4. AdMob → Apps → app-ads.txt → „Nach Updates suchen“. Die Prüfung dauert bis
   zu 24 h.

Notlösung ohne Domain: ein Repo `noltejonas/noltejonas.github.io` mit
`app-ads.txt` im Wurzelverzeichnis. Dann liegt die Datei unter
`https://noltejonas.github.io/app-ads.txt`.

## 10. Auf echte IDs umstellen (Claude oder B, ca. 10 min)

1. `www/ads.js`, Block `PROD`:
   ```js
   const PROD = {
     appId: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX',
     banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
     rewarded: '',
   };
   ```
   Sobald `PROD.banner` gesetzt ist, ist der Testmodus automatisch aus.
2. `ios/App/App/Info.plist`: `GADApplicationIdentifier` auf **dieselbe** App-ID
   setzen und den Platzhalter-Kommentar anpassen.
3. Prüfen:
   ```bash
   node tests/ads-config.test.cjs                         # muss grün sein
   ADS_REQUIRE_LIVE=1 node --test tests/ads-config.test.cjs # Release-Sperre, muss jetzt auch grün sein
   npm ci && npx cap sync ios
   ```
4. Committen. `fastlane release` führt die Release-Sperre selbst aus und bricht
   ab, solange nur Test-IDs eingetragen sind.

Werbung ganz aus, ohne Code zu löschen: `const ADS_ENABLED = false;` in
`www/ads.js`. Dann startet das SDK nicht, die App fragt nichts bei Google an
und zeigt keinen Dialog. Das braucht aber einen neuen Build mit Prüfung.
**Schneller Notschalter ohne Update:** Anzeigenblock in AdMob archivieren. Die
App bekommt dann keine Anzeige, der Platz bleibt leer (keine Lücke), sie
fragt nur jede Minute erneut an.

## 11. Eigene Geräte als Testgeräte (je Gerät ca. 5 min)

Eigene Klicks oder viele eigene Impressionen auf **echte** Anzeigen zählen als
ungültige Zugriffe. Neue AdMob-Konten werden dafür schnell eingeschränkt.

1. TestFlight-Build mit echten IDs auf dem eigenen iPhone starten, Feed öffnen.
2. In Xcode → Window → Devices and Simulators → Gerät → Open Console nach
   `testDeviceIdentifiers` suchen und die ID kopieren.
3. In `www/ads.js` in `TEST_DEVICES` eintragen. Diese Geräte bekommen dann auch
   im Release nur Testanzeigen.
4. Bis dahin: **nie auf eigene Anzeigen tippen.**

## 12. Datenschutzerklärung (A, ca. 15 min + Prüfung)

Auf diesem Branch schon eingebaut in `docs/launch/site/datenschutz.html`:

- „Kurz gesagt“: Werbung ab 1.4.1 statt „Keine Werbung“.
- 2.6: Der Einwilligungsdialog speichert die Auswahl auf dem Gerät.
- **2.11 Werbung (Google AdMob)**: neuer Abschnitt, Text unten.
- 3: Google als Empfänger. 5: Art. 6 Abs. 1 lit. a DSGVO und § 25 Abs. 1 TDDDG.
  9: auch für die Werbung nur nicht personalisierte Anzeigen.
- `docs/launch/site/index.html`: „ohne Werbung“ → „ohne Tracking“.

Der Abschnitt 2.11 enthält eine Markierung `[BITTE AUSFÜLLEN: … rechtlich
prüfen …]`. Der Workflow `legal-pages` veröffentlicht nichts, solange sie
drin ist. Erst prüfen lassen (Generator oder Anwalt), dann die Markierung
löschen und auf `main` bringen. Die Seite muss **vor** dem Einreichen von 1.4.1
live sein, weil die AdMob-Nachricht und Apple darauf verlinken. Nutzer von 1.4
sehen den Abschnitt dann schon, er ist deshalb mit „ab Version 1.4.1“ formuliert.

Text des Abschnitts 2.11 zum Einfügen nach 2.10:

```html
    <h3>2.11 Werbung (Google AdMob, ab Version 1.4.1)</h3>
    <p>
      <mark class="todo">[BITTE AUSFÜLLEN: Abschnitt 2.11 rechtlich prüfen lassen, dann diese Markierung löschen]</mark>
    </p>
    <p>
      Ab Version 1.4.1 zeigt die App in den Bereichen „Feed“ und „Stats“ ein Werbebanner. Auf „Heute“, im Strafkonto, in den Einstellungen,
      während des Einstiegs und in der Demo gibt es keine Werbung, Vollbild- oder Videowerbung gar nicht.
      Die Anzeigen liefert Google AdMob. Anbieter ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland („Google“).
      Google verarbeitet die Daten für die Werbung in eigener Verantwortung (Google Ads Controller-Controller Data Protection Terms).
    </p>
    <p>
      <strong>Nur nicht personalisierte Anzeigen.</strong> Die App fordert bei Google ausschließlich nicht personalisierte Anzeigen an.
      Google wählt sie nach dem Umfeld und dem ungefähren Standort aus, nicht nach einem Profil von dir.
      Deine Trainingsdaten, dein Profil, deine Challenges und deine Nutzer-ID gibt die App nicht an Google weiter.
      Die App fragt nicht nach App-Tracking-Transparenz. Die Werbe-ID (IDFA) deines iPhones bleibt damit für die App und für Google gesperrt.
    </p>
    <p><strong>Was Google dabei verarbeitet:</strong></p>
    <ul>
      <li>IP-Adresse und daraus abgeleitet ein ungefährer Standort (Land, Region)</li>
      <li>Geräte- und App-Angaben, z.&nbsp;B. Gerätemodell, iOS-Version, Sprache und App-Version, sowie Kennungen, die Google für diese App auf deinem Gerät speichert oder ausliest</li>
      <li>Interaktionen mit Anzeigen: welche Anzeige gezeigt wurde und ob du sie angetippt hast</li>
      <li>Diagnose- und Leistungsdaten des Werbe-SDKs, z.&nbsp;B. Ladezeiten und Abstürze</li>
    </ul>
    <p>
      Google nutzt diese Daten, um Anzeigen auszuliefern, ihre Häufigkeit zu begrenzen, sie zu messen und abzurechnen und um Betrug und Missbrauch zu verhindern.
      Mehr dazu: <a href="https://policies.google.com/technologies/partner-sites">Wie Google Daten aus Apps von Partnern nutzt</a> und
      <a href="https://policies.google.com/privacy">Datenschutzerklärung von Google</a>.
    </p>
    <p>
      <strong>Einwilligung.</strong> Bevor Werbung geladen wird, fragt die App beim ersten Öffnen von „Feed“ oder „Stats“ mit dem Einwilligungsdialog von Google
      (User Messaging Platform, IAB Transparency &amp; Consent Framework) nach deiner Einwilligung.
      Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, für das Speichern und Auslesen auf deinem Gerät § 25 Abs. 1 TDDDG).
      Lehnst du ab, kannst du die App ganz normal weiter nutzen. Google kann dann eingeschränkte Anzeigen („Limited Ads“) zeigen, ohne dafür etwas auf deinem Gerät zu speichern oder auszulesen.
      Einzelne Verarbeitungen, etwa zur Messung und Betrugsabwehr, stützt Google dabei auf berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO); dem kannst du im Dialog widersprechen.
    </p>
    <p>
      <strong>Ändern und widerrufen:</strong> jederzeit in der App unter Einstellungen (dein Profilbild oben rechts) → „Werbe-Einwilligung“. Der Widerruf gilt für die Zukunft.
      Deine Auswahl speichert der Dialog auf deinem Gerät, bis du sie änderst oder die App löschst.
    </p>
    <p>
      <strong>Übermittlung in die USA.</strong> Google kann Daten auch an die Google LLC in den USA übermitteln.
      Die Google LLC ist nach dem EU-US Data Privacy Framework zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO); daneben gelten EU-Standardvertragsklauseln.
      Wie lange Google die Daten speichert, regelt Google selbst (siehe Links oben).
    </p>
```

## 13. App-Datenschutz in App Store Connect (A, ca. 20 min)

Erst beim Einreichen von 1.4.1 ändern; die Angaben gelten sofort auch für die
Live-Version. Zusätzlich zu `docs/launch/STORE_LISTING.md`, Abschnitt 4:

| Kategorie | Datentyp | Zwecke | Mit Identität verknüpft | Tracking |
|---|---|---|---|---|
| Standort | Ungefährer Standort | Werbung von Drittanbietern, Analysen | Ja | Nein |
| Kennungen | Geräte-ID | wie bisher App-Funktionalität (Push), **neu** Werbung von Drittanbietern, Analysen | Ja | Nein (siehe unten) |
| Nutzungsdaten | Produktinteraktion | Werbung von Drittanbietern, Analysen | Ja | Nein |
| Nutzungsdaten | Werbedaten | Werbung von Drittanbietern, Analysen | Ja | Nein |
| Diagnose | Absturzdaten | Analysen | Nein | Nein |
| Diagnose | Leistungsdaten | Werbung von Drittanbietern, Analysen | Nein | Nein |
| Diagnose | Sonstige Diagnosedaten | Werbung von Drittanbietern, Analysen (dazu App-Funktionalität, falls `client_errors` aktiv ist) | wie bisher | Nein |

Quelle: Die Datenschutz-Manifeste von `GoogleMobileAds.framework` und
`UserMessagingPlatform.framework`, die Xcode in `App.app/Frameworks/`
einbettet (Debug und Release geprüft). Vor dem Eintragen abgleichen:

1. Xcode → Product → Archive → im Organizer Rechtsklick auf das Archiv →
   **Generate Privacy Report**. Der Bericht führt App und SDKs zusammen.
2. Googles Seite zur App-Store-Datenoffenlegung:
   https://developers.google.com/admob/ios/privacy/data-disclosure

**Tracking:** Das Manifest des Google-SDKs markiert die Geräte-ID als
„Tracking“. Das gilt, wenn eine App per ATT die IDFA freigibt. Diese App fragt
nie nach ATT und fordert nur nicht personalisierte Anzeigen an. Deshalb
„Tracking: Nein“ und „Daten zum Tracking: keine“. **Entscheidung der
Gründer:** Wer auf Nummer sicher gehen will, gibt „Geräte-ID → Tracking: Ja“
an. Dann verlangt Apple aber einen ATT-Dialog (Richtlinie 5.1.2), und die App
müsste ihn zeigen. Empfehlung: Nein, und keine IDFA-Nachricht in AdMob anlegen.

Das App-eigene Manifest `ios/App/App/PrivacyInfo.xcprivacy` bekommt **keine**
neuen Datentypen. Der eigene Code gibt dem SDK keine Nutzerdaten, nur die
Anzeigenblock-ID, `npa=1` und den Testmodus. Er ruft auch keine weiteren
Required-Reason-APIs auf. Die SDK-Manifeste decken den Rest ab. Schickt Apple
nach dem Upload trotzdem eine Mail „ITMS-91053: Missing API declaration“
(z. B. `SystemBootTime` oder `DiskSpace`), die genannten Gründe (`35F9.1`,
`E174.1`) ins App-Manifest übernehmen.

## 14. Altersfreigabe (A, 5 min)

App Store Connect → App-Informationen → Altersfreigabe → „Werbung“ auf **Ja**
(siehe `docs/launch/STORE_LISTING.md`, Abschnitt 3). Bleibt die Stufe 4+,
passt `MAX_AD_CONTENT_RATING = 'General'`. Bei 9+ ginge `'ParentalGuidance'`,
bei 13+ `'Teen'`. Empfehlung: „General“ lassen, das passt besser zur Marke.

## 15. Vor dem Einreichen prüfen

- [ ] `node tests/ads-config.test.cjs` und `ADS_REQUIRE_LIVE=1 node --test tests/ads-config.test.cjs` grün
- [ ] alle Tests grün: `npm test`
- [ ] TestFlight auf dem eigenen iPhone (als Testgerät eingetragen): Feed öffnen
      → Einwilligungsdialog → Banner über der Tab-Leiste, „Test Ad“-Kennzeichnung
- [ ] Sheet öffnen (z. B. Reaktion) → Banner weg, schließen → Banner wieder da
- [ ] Stats → Diagramm im Vollbild → Banner weg
- [ ] Toast über dem Banner, letzter Feed-Eintrag nicht verdeckt
- [ ] Heute, Strafkonto, Einstellungen, Onboarding, Demo: kein Banner, kein Dialog
- [ ] Einstellungen → „Werbe-Einwilligung“ öffnet Googles Dialog
- [ ] AdMob: App verknüpft und geprüft, Nachricht veröffentlicht, `app-ads.txt` „Gefunden“
- [ ] Datenschutzerklärung mit 2.11 live, App-Datenschutz und Altersfreigabe angepasst
- [ ] Store-Texte: `description.txt`, `promotional_text.txt` und `release_notes.txt`
      sind auf diesem Branch schon angepasst („ohne Tracking“ statt „ohne Werbung“)
- [ ] Review-Notizen: Abschnitt „ADS“ ist im englischen Block in `docs/launch/REVIEW_NOTES.md`

Einreichen wie in `docs/launch/RELEASE.md` (Weg A oder `fastlane release`).

## 16. Später (nicht in 1.4.1)

- „24 Stunden werbefrei“ gegen ein Prämienvideo (`PTAds.showRewarded()` ist
  vorbereitet, hat aber noch keinen Aufrufer).
- Ein Fernschalter (z. B. `ads_enabled` in einer Supabase-Konfigurationstabelle),
  damit sich Werbung ohne neues Review abschalten lässt.
- Kein Strafkonto-Joker per Video: Echtes Gruppengeld gegen Werbeerlös sorgt
  für Streit.
- Capacitor-Update (8.3.3 → aktuell) getrennt und mit eigenem TestFlight-Lauf.
