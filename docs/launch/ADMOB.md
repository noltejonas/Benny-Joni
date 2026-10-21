# AdMob für den Launch

Stand 21.10.2026: **Technisch für iOS und Android vorbereitet, noch nicht für produktive Werbung freigeschaltet.**
Das AdMob-Konto wird neu angelegt. Echte App- und Banner-IDs, veröffentlichte
Einwilligungsnachrichten und die Prüfung der Store-Verknüpfung stehen noch aus.
Die App verwendet deshalb ausschließlich Googles Testanzeigen. Store-Release-Lanes
müssen weiter abbrechen, solange Werbung aktiviert ist und produktive IDs fehlen.
Ein TestFlight- oder interner Testbuild darf Testanzeigen enthalten.

## Bereits umgesetzt

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
  Nutzer-ID an AdMob. iOS und Android deaktivieren zusätzlich Googles Publisher
  first-party ID vor der Initialisierung.
- iOS: Google-App-ID, SKAdNetwork-Liste und Privacy-Manifeste vorhanden.
  Der Code fordert keine ATT-Berechtigung an. Keine IDFA-Nachricht in AdMob
  konfigurieren, solange das Anzeigenmodell ohne ATT vorgesehen ist.
- Android: natives Capacitor-Projekt, separate Test-App-ID, verzögerte
  Anzeigenmessung und Release-Sperre vorhanden. Ein Android-Build und echte
  Gerätetests stehen noch aus; hierfür fehlen lokal JDK/Android-SDK.
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
`/Benny-Joni/app-ads.txt` genügt nicht. Entweder eine eigene Domain verwenden oder
auf dem GitHub-Pages-Host ein Root-Repository `noltejonas.github.io` mit dieser
Datei einrichten. Den personalisierten Eintrag aus der AdMob-Konsole übernehmen:

```text
google.com, pub-<eigene Publisher-ID>, DIRECT, f08c47fec0942fa0
```

Keine Platzhalterdatei veröffentlichen. Danach in AdMob die Erkennung und
Verifizierung prüfen. Bis Google die App freigegeben hat, können produktive
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

Die beiden Prüfungen mit `ADS_REQUIRE_LIVE=1` sollen aktuell fehlschlagen,
weil noch keine echten Anzeigen-IDs vorliegen. Die Sperre nicht umgehen.

Vor Einreichung je Plattform auf echtem Gerät prüfen: Einwilligung, korrekt
markierte Testanzeige über der Tab-Leiste, letzter Eintrag und Toast sichtbar,
Banner bei Sheets/Vollbild verborgen, Änderung/Widerruf in den Einstellungen,
keine Banner in Onboarding, Heute, Strafkonto oder Demo. Einwilligung ablehnen
und Offline-Start ebenfalls prüfen. Browsertests ersetzen diese Prüfung nicht.

Datenschutzerklärung und Store-Datenschutzauskünfte müssen das tatsächliche
Verhalten von App und Google-SDK wiedergeben. Vorhandene Entwürfe und Platzhalter
in `docs/launch/site/` sowie `STORE_LISTING.md` vor Upload vervollständigen.
Das eingebettete SDK-Manifest und Xcodes Privacy Report dabei abgleichen.

## Offizielle Grundlagen

- [Plugin: UMP-Ablauf](https://github.com/capacitor-community/admob/blob/main/docs/consent.md)
- [iOS-Testanzeigen](https://developers.google.com/admob/ios/test-ads)
- [Android-Testanzeigen](https://developers.google.com/admob/android/test-ads)
- [iOS: Publisher first-party ID deaktivieren](https://developers.google.com/admob/ios/privacy/strategies)
- [Android: Publisher first-party ID deaktivieren](https://developers.google.com/admob/android/privacy/strategies)
- [app-ads.txt und Store-Website-Felder](https://support.google.com/admob/answer/9363762?hl=en-GB)
- [iOS-Datenoffenlegung des SDKs](https://developers.google.com/admob/ios/privacy/data-disclosure)
