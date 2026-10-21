# AdMob für den Launch

Stand 21.10.2026: **iOS- und Android-App mit je einem Banner in AdMob angelegt;
beide produktiven ID-Paare sind im Projekt eingetragen.**
Publisher: `pub-8393455800337394`.

| Plattform | App-ID | Banner-ID |
|---|---|---|
| iOS | `ca-app-pub-8393455800337394~4603844935` | `ca-app-pub-8393455800337394/7259209697` |
| Android | `ca-app-pub-8393455800337394~1570487484` | `ca-app-pub-8393455800337394/3252516074` |

Die Werte stimmen zwischen `www/ads.js` und der jeweiligen nativen
App-Konfiguration (`Info.plist` bzw. `AndroidManifest.xml`) überein.
Das Zahlungsprofil bleibt auf Wunsch des Betreibers vorerst offen.
Store-Verknüpfung, Googles app-ads.txt-Verifizierung und Tests von
Anzeigen und Einwilligung auf einem Gerät
stehen noch aus. Die eingetragenen IDs allein bestätigen keine Anzeigenfreigabe.
Ein TestFlight- oder interner Testbuild darf Testanzeigen enthalten.

## Bereits umgesetzt

- AdMob-Konsole: EU-Nachricht „Benny & Joni – EU-Einwilligung“ ist für beide
  Apps veröffentlicht. Standardsprache Deutsch, zusätzlich Englisch;
  Zielregion EWR/Vereinigtes Königreich/Schweiz. „Nicht einwilligen“ ist für
  alle Länder aktiviert, Schließen ohne Einwilligung bleibt deaktiviert.
  Beide Apps verwenden die erreichbare Datenschutzadresse.
- Im Konto ist Google der einzige ausgewählte Werbepartner; keine automatische
  Ergänzung weiterer Partner. Berechtigtes Interesse ist nicht vorausgewählt;
  die zusätzliche Einwilligungsprüfung für Echtzeitgebots-Creatives ist aktiv.
  Höchste Anzeigenfreigabe im Konto ist G (alle Altersgruppen), passend zum Code.
- `@capacitor-community/admob` 8.2.1; Capacitor 8.5.2.
- `www/ads.js` lädt das Plugin über die native Bridge, ohne CDN. Im Browser und
  in der Demo gibt es keine Anzeigen.
- Adaptive Banner nur in Feed und Stats, nach dem Onboarding und bei neuen
  Personen nach dem ersten Satz. Sheets, Vollbild und Feiern blenden sie aus.
- Google UMP prüft den Einwilligungsstand vor dem SDK-Start. Das Formular kommt
  erst auf einem Bildschirm mit Werbung, sofern UMP es verlangt. Ohne
  `canRequestAds` wird keine Anzeige angefordert.
- Einstellungen → „Werbe-Einwilligung“ öffnet die Datenschutzoptionen, wenn UMP
  diesen Einstieg verlangt. Ein vorhandenes Banner wird dabei entfernt. Nach
  einer Änderung wird es nur mit erneuter UMP-Freigabe neu angefordert.
- Alle Anfragen setzen `npa: true`. Die App übergibt keine Trainingsdaten oder
  Nutzer-ID an AdMob. iOS deaktiviert zusätzlich Googles Publisher first-party
  ID vor der Initialisierung. Android wartet nach dem von UMP freigegebenen
  SDK-Start auf die erfolgreiche, persistierte Deaktivierung über die lokale
  `AdPrivacy`-Bridge; erst dann sind Anzeigenanfragen erlaubt. Das entspricht
  [Googles Android-API-Reihenfolge](https://developers.google.com/admob/android/reference/com/google/android/gms/ads/MobileAds#putPublisherFirstPartyIdEnabled(boolean)).
- iOS: Google-App-ID, SKAdNetwork-Liste und Privacy-Manifeste vorhanden.
  Der Code fordert keine ATT-Berechtigung an. Keine IDFA-Nachricht in AdMob
  konfigurieren, solange das Anzeigenmodell ohne ATT vorgesehen ist.
- Android: natives Capacitor-Projekt, eigene produktive App-ID, verzögerte
  Anzeigenmessung und Release-Sperre vorhanden. JDK 21 und Android SDK sind
  eingerichtet; die Debug-APK wurde am 21. Oktober 2026 erfolgreich gebaut.
  Die produktive App-ID und Banner-ID wurden im APK-Inhalt geprüft.
  Der Kaltstart im API-36-Pixel-2-Emulator ist ohne nativen Absturz oder
  JavaScript-/WebView-Fehler bestanden; `AdPrivacy` ist nativ registriert.
  Anzeigen- und Einwilligungstests auf einem Android-Gerät stehen noch aus;
  Build-Details stehen in [ANDROID.md](ANDROID.md).
  Android-Push bleibt bis zur separaten FCM-Einrichtung deaktiviert.

## Konto und IDs einrichten

1. [AdMob](https://admob.google.com/) mit dem neuen Google-Konto öffnen und die
   tatsächlichen Unternehmens-/Zahlungsdaten eintragen.
2. Zwei Apps anlegen: **iOS** und **Android**, jeweils „Benny & Joni“. Solange die
   Store-Einträge noch fehlen, als unveröffentlicht anlegen. Später mit dem
   jeweiligen Store-Eintrag verknüpfen.
3. Je App einen **Banner-Anzeigenblock** anlegen. Es werden vier Werte benötigt:
   iOS-App-ID, iOS-Banner-ID, Android-App-ID, Android-Banner-ID.
4. In `www/ads.js` iOS unter `PROD` und Android unter `PROD_ANDROID` eintragen.
   App-ID und Banner-ID einer Plattform immer zusammen ändern. `rewarded` bleibt
   leer; Belohnungsvideos sind noch kein Teil des Produkts.
5. Dieselbe iOS-App-ID in `ios/App/App/Info.plist` unter
   `GADApplicationIdentifier` eintragen. Die Android-App-ID kommt in die
   Manifest-Metadaten `com.google.android.gms.ads.APPLICATION_ID`.
6. In AdMob unter Datenschutz und Mitteilungen eine Nachricht für europäische
   Vorschriften erstellen und veröffentlichen: beide Apps, Deutsch und Englisch,
   erreichbare Datenschutz-URL und eine Möglichkeit zum Ablehnen.
7. Eigene Geräte als Testgeräte konfigurieren (`TEST_DEVICES` oder AdMob-Konsole).

Aktuelle öffentliche Testwerte:

| Plattform | App-ID | Adaptive Banner-ID |
|---|---|---|
| iOS | `ca-app-pub-3940256099942544~1458002511` | `ca-app-pub-3940256099942544/2435281174` |
| Android | `ca-app-pub-3940256099942544~3347511713` | `ca-app-pub-3940256099942544/9214589741` |

Die Plattform-IDs dürfen nicht gegeneinander ausgetauscht werden. Ohne produktive
Banner-ID wählt die jeweilige Plattform automatisch ihre Testwerte.

## Website und app-ads.txt

AdMob sucht `app-ads.txt` an der **Wurzel des Hostnamens** der Entwicklerwebsite:

- Apple: Entwicklerwebsite aus dem Feld **Marketing-URL**.
- Google Play: Website aus den **Kontaktdaten des Store-Eintrags**.

Mit `https://noltejonas.github.io/Benny-Joni/` als Website sucht AdMob unter
`https://noltejonas.github.io/app-ads.txt`. Eine Datei im Unterverzeichnis
`/Benny-Joni/app-ads.txt` genügt nicht. Im bereits bestehenden Root-Repository
`noltejonas.github.io` wurde diese Datei additiv veröffentlicht. Der Eintrag:

```text
google.com, pub-8393455800337394, DIRECT, f08c47fec0942fa0
```

Der korrekte Inhalt liegt lokal in `docs/launch/app-ads.txt` und öffentlich unter
`https://noltejonas.github.io/app-ads.txt` (HTTP 200 und Inhalt geprüft).
Die fünf App-/Rechtsseiten sind unter `/Benny-Joni/` ebenfalls erreichbar.
Sie werden derzeit additiv aus dem Root-Repository bereitgestellt
(Commit `7b64ddba2ba1321f170e76ddb51914768eaa5a30`); die vorhandene Flutter-Website
bleibt erhalten. Spätere Änderungen müssen auch dort veröffentlicht werden,
bis der eigene Pages-Workflow des App-Repos aktiv ist.
In AdMob die Erkennung und Verifizierung nach der Store-Verknüpfung prüfen.
Bis Google die App freigegeben hat, können produktive
Anzeigen eingeschränkt bleiben.

## Prüfen

```bash
node --test tests/ads-config.test.cjs
# Produktive iOS-IDs und native Konfiguration prüfen:
ADS_REQUIRE_LIVE=1 node --test tests/ads-config.test.cjs
# Produktive Android-IDs prüfen:
ADS_PLATFORM=android ADS_REQUIRE_LIVE=1 node --test tests/ads-config.test.cjs
npm test
npm run build
npx cap sync ios
npx cap sync android
```

Beide Prüfungen mit `ADS_REQUIRE_LIVE=1` prüfen jetzt die echten IDs und müssen
bestehen. Das Bestehen der ID-Prüfung ersetzt weder UMP-/Zahlungseinrichtung
noch Geräteprüfung oder Googles Freigabe.

Vor Einreichung je Plattform auf echtem Gerät prüfen: Einwilligung, korrekt
markierte Testanzeige über der Tab-Leiste, letzter Eintrag und Toast sichtbar,
Banner bei Sheets/Vollbild verborgen, Änderung/Widerruf in den Einstellungen,
keine Banner in Onboarding, Heute, Strafkonto oder Demo. Einwilligung ablehnen
und Offline-Start ebenfalls prüfen. Browsertests ersetzen diese Prüfung nicht.

Datenschutzerklärung und Store-Datenschutzauskünfte müssen das tatsächliche
Verhalten von App und Google-SDK wiedergeben. Die lokalen Rechtsseiten in
`docs/launch/site/` stimmen mit der veröffentlichten Fassung überein.
Offene Betriebsfakten stehen in `LEGAL_FACTS.md`.
Das eingebettete SDK-Manifest und Xcodes Privacy Report dabei abgleichen.

## Offizielle Grundlagen

- [Plugin: UMP-Ablauf](https://github.com/capacitor-community/admob/blob/main/docs/consent.md)
- [iOS-Testanzeigen](https://developers.google.com/admob/ios/test-ads)
- [Android-Testanzeigen](https://developers.google.com/admob/android/test-ads)
- [iOS: Publisher first-party ID deaktivieren](https://developers.google.com/admob/ios/privacy/strategies)
- [Android: Publisher first-party ID deaktivieren](https://developers.google.com/admob/android/privacy/strategies)
- [app-ads.txt und Store-Website-Felder](https://support.google.com/admob/answer/9363762?hl=en-GB)
- [iOS-Datenoffenlegung des SDKs](https://developers.google.com/admob/ios/privacy/data-disclosure)
