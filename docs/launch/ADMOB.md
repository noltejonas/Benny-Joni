# AdMob für den Launch

Stand 21.10.2026: **Der Launch startet ohne Werbung, Testanzeigen,
Werbeeinwilligungsdialog und Start des Google-Werbe-SDKs.** Die Werbefunktion
ist eingebaut, aber `public.app_release_settings`, Zeile `id = 1`, steht
produktiv auf `ads_enabled = false`. Beide produktiven ID-Paare bleiben
für eine spätere Freischaltung eingetragen.
Publisher: `pub-8393455800337394`.

| Plattform | App-ID | Banner-ID |
|---|---|---|
| iOS | `ca-app-pub-8393455800337394~4603844935` | `ca-app-pub-8393455800337394/7259209697` |
| Android | `ca-app-pub-8393455800337394~1570487484` | `ca-app-pub-8393455800337394/3252516074` |

Die Werte stimmen zwischen `www/ads.js` und der jeweiligen nativen
App-Konfiguration (`Info.plist` bzw. `AndroidManifest.xml`) überein.
Das Zahlungsprofil bleibt auf Wunsch des Betreibers vorerst offen.
Store-Verknüpfung, Googles app-ads.txt-Verifizierung, produktive
Anzeigenauslieferung und EWR-Einwilligungswahl/Widerruf stehen noch aus.
Der Android-Anfrageablauf und die Behandlung von NO_FILL sind im Emulator
geprüft, siehe unten. Die eingetragenen IDs allein bestätigen keine Anzeigenfreigabe.
Die neuen Launch-Artefakte (iOS Build 26 / Android Version Code 2) sind
gebaut und hochgeladen. Apple 26 wartet auf Prüfung, Android 2 liegt als
interner Entwurf vor und ist als Produktion 2 zur Prüfung gesendet;
Google-Review läuft. Beide Stores halten die Veröffentlichung zurück.
Beide enthalten diesen Schalter. Isolierte QA darf
Google-Testanzeigen nutzen, der ausgeschaltete Launch zeigt auch diese nicht.

## Zentraler Schalter und spätere Aktivierung

Die additive Migration `20261021140000_app_release_ads_gate.sql` ist
produktiv angewendet und atomar in der Migrationshistorie registriert.
Der Readback bestätigt die einzelne Zeile `id = 1`, `ads_enabled = false`,
aktive RLS und ausschließlich SELECT für `anon`/`authenticated`.
Client-UPDATE, INSERT und DELETE sind gesperrt. Beleg:
`.local/qa/ads-release-gate-20261021/migration-readback.json`.

Die App liest die Freigabe beim Start, bei Rückkehr in den Vordergrund und
wenn die Verbindung wieder verfügbar ist frisch über Supabase. Bis zu
einem ausdrücklichen `true` bleiben UMP-Abfragen, Einwilligungsdialog,
SDK-Initialisierung und Werbeanfragen gesperrt. Fehlende Zeile, Ladefehler,
Offline-Status und Demo erlauben keine Werbung; ein positives Ergebnis
wird nicht als Offline-Freigabe gespeichert. Der Gate-Quellstand ist mit
234 bestandenen Tests und einem erwarteten Release-Skip geprüft; die
Release-ID-Prüfungen bestehen für beide Plattformen mit je 34 Tests.
Im getrennten Android-Debugpaket `com.bennyjoni.terminator.umpqa` ist der
ausgeschaltete Pfad mit exakt den finalen drei Gate-Webquellen und ohne
Gate-/Testmodus-Override bestanden: Kaltstart, Review-Login, Heute, Feed,
Stats, Einstellungen, Hintergrund/Vordergrund und authentisierter
Kaltstart liefern null AdMob-/AdPrivacy-Aufrufe sowie keine FATAL-Exception,
ANR oder ungefangenen JavaScript-Fehler. Beleg:
`.local/qa/ump-eea/gate-off/summary.json`.
Zusätzlich ist der Smoke-Test des originalen Pakets mit Version Code 2
bestanden. Nach den isolierten UMP-Versuchen wurde dieses Originalpaket
wiederhergestellt und sein SHA-256
`e33a219fa79f3d86904481f13d95c31e4b3b75cc91d3d1398ec02aaaf49ef81c`
erneut bestätigt. Authentisierter Kaltstart, Heute/Feed/Stats,
Hintergrund/Vordergrund und Einstellungen: null AdMob-/AdPrivacy-Aufrufe,
keine FATAL-Exception, ANR oder ungefangenen JavaScript-Fehler. Beleg:
`.local/qa/android-final-vcode2-gate-off/restored/summary.json`.

Auf einem echten iPhone 11/iOS 26.2.1 bestand ein separates QA-Bundle den
Lese-/Lifecycle-Test (61 Sekunden). Eine 35-sekündige Kaltstartkonsole zeigt
39 normale Preferences-/App-/Push-Prüfaufrufe, null AdMob-/AdPrivacy-/UMP-/
ATT-Methoden. Teile der schreibenden Gerätefunktionstests sind bestanden,
weitere Prüfungen bleiben offen; Details stehen in [RELEASE.md](RELEASE.md).
Dies ist keine vollständige Abnahme der Store-IPA.

In einer ausschließlich lokalen Werbe-QA-Kopie wurden Google-Demo-Banner
mit `npa: true` und bestätigter Publisher-ID-Deaktivierung geladen. Heute
und Overlays verbergen Banner, nach Abbruch/Rückkehr erscheinen sie wieder.
Beleg: `.local/qa/ump-eea/gate-on-corrected/summary.json`.
**EWR-Auswahl/Widerruf bleiben ungeprüft:** Auch die originale Paket-ID mit
produktiver AdMob-App-ID, offiziellem UMP-Testreset und Debug-EWR liefert
`NOT_REQUIRED` ohne Formular. Die korrekte Nachricht ist für beide Apps
veröffentlicht; die Ursache ist noch ungeklärt. Beleg:
`.local/qa/ump-eea/same-package/summary.json`. Daraus folgt keine
Monetarisierungsfreigabe; vor späterem Einschalten klären.

Später ohne weiteres App-Update aktivieren:

1. AdMob-Zahlungsinformationen vervollständigen, Store-Verknüpfungen und
   `app-ads.txt` prüfen und Googles Freigabe abwarten. **Ohne Zahlungsdaten
   zeigt AdMob keine Anzeigen und prüft die App nicht zur Monetarisierung;
   vorher wird auch kein Werbeguthaben aufgebaut.** [Google: Einrichtung](https://support.google.com/admob/answer/15948559?hl=en)
2. EWR-Auswahl und Widerruf mit einer isolierten Testkonfiguration prüfen.
   Produktive Anzeigen dürfen nicht für eigene Testklicks verwendet werden.
3. In Supabase → Table Editor → Schema `public` → `app_release_settings`
   bei `id = 1` den Wert `ads_enabled` auf `true` setzen und speichern.
   Alternativ diesen konkreten Auftrag geben: „AdMob-Zahlungsprofil und
   Google-Freigabe sind abgeschlossen. Prüfe die Voraussetzungen und aktiviere
   Benny-&-Joni-Werbung über `app_release_settings.id=1.ads_enabled=true`.“
4. Beim nächsten Start/Vordergrundwechsel wird die Freigabe gelesen; erst
   dann folgen der normale UMP-Ablauf und gegebenenfalls NPA-Banner.

Zum Ausschalten dieselbe Zeile auf `false` setzen. Beim nächsten frischen
Abruf entfernt die App vorhandene Banner, verwirft alte Antworten und
sperrt weitere Werbeaufrufe. Ein bereits zuvor initialisiertes Google-SDK
kann nicht deinitialisiert werden; laufende Verarbeitung wird damit nicht
rückwirkend aufgehoben. Es gibt keine Zusage „werbefrei für immer“.
`Contains ads`, Altersfreigabe und Werbe-Datenoffenlegungen bleiben für die
ohne Update aktivierbare Funktion erhalten.

## Eingebaute Funktion nach späterer Freischaltung

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
  Der Code fordert keine ATT-Berechtigung an. Plugin 8.2.1 ruft bei
  `initialize()` nur die Anzeigenkonfiguration und den SDK-Start auf;
  die separate ATT-Methode wird von der App nicht aufgerufen. Der ungenutzte
  `NSUserTrackingUsageDescription`-Eintrag wurde aus Haupt-Plist und beiden
  Übersetzungen entfernt; seine Abwesenheit wurde bereits in IPA 1.4.1 (25)
  geprüft. Keine IDFA-Nachricht in AdMob
  konfigurieren, solange das Anzeigenmodell ohne ATT vorgesehen ist.
- Android: natives Capacitor-Projekt, eigene produktive App-ID, verzögerte
  Anzeigenmessung und Release-Sperre vorhanden. JDK 21 und Android SDK sind
  eingerichtet; die Debug-APK wurde am 21. Oktober 2026 erfolgreich gebaut.
  Die produktive App-ID und Banner-ID wurden im APK-Inhalt geprüft.
  Der Kaltstart im API-36-Pixel-2-Emulator ist ohne nativen Absturz oder
  JavaScript-/WebView-Fehler bestanden; `AdPrivacy` ist nativ registriert.
  Review-Login, UMP-Freigabe, native Datenschutzbestätigung und nicht
  personalisierte Banneranfragen sind im Emulator geprüft. EWR-Dialogwahl,
  Widerruf und tatsächlich gelieferte Anzeigen bleiben ungeprüft;
  Build-Details stehen in [ANDROID.md](ANDROID.md).
  Android-Push bleibt bis zur separaten FCM-Einrichtung deaktiviert.

## Vor dem Freigabeschalter geprüfter Android-Anzeigenablauf

Die zuvor gebaute APK wurde im lokalen API-36-Pixel-2-Emulator nach der
Host-GPU-Wiederherstellung mit dem isolierten Reviewkonto normal angemeldet
und kalt gestartet. UMP meldet `NOT_REQUIRED`, `canRequestAds: true`,
kein verfügbares Einwilligungsformular und Datenschutzoptionen
`NOT_REQUIRED`, ohne Debug-Geografie. Die Logreihenfolge ist geprüft:
Einwilligungsabfrage → Freigabe → `initialize` → native
`disablePublisherFirstPartyId` → `disabled: true` → erst dann `showBanner`.

Feed und Stats fordern jeweils mit `npa: true` an. Beide Anfragen enden mit
SDK-Code 3 / `NO_FILL`; keine Anzeige wurde geladen oder angeklickt und es
bleibt keine reservierte Leerfläche. Das SDK erkennt den Emulator als
Testgerät. Im abschließenden Lauf wurden keine FATAL-Exception, ANR,
ungefangenen JavaScript- oder Datenschutzfehler gefunden. Das belegt den
sicheren Anfrage-/Fehlerablauf, keine vollständige Geräte-QA oder Auslieferung.

Geheimnisfreier lokaler Bericht:
`.local/qa/android-ads-review-20261021/recovered/summary.json`.
Er referenziert im privaten finalen Laufzeitlog die Zeilen 266, 278, 281,
287, 289, 324 und 344 für die obige Reihenfolge. Die privaten Auth-Dateien
und Logs gehören nicht ins Repository. Für die Review-Fixture wurde nur
der Fortschrittsmarker des ersten Satzes anhand eines vorhandenen
synthetischen Satzes ergänzt; alle übrigen Profil-/Onboardingfelder,
Einwilligungen und Trainingszeilen blieben gleich. Vorher-/Nachherstand
und abgesicherte Wiederherstellung sind privat abgelegt.

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

Vor Einreichung des werbefreien Launch-Builds je Plattform prüfen:
Serverfreigabe `false` → keine UMP-/SDK-/Anzeigenaufrufe, kein Dialog,
keine Bannerfläche; ebenso nach Neustart, Offline-Start und Rückkehr in den
Vordergrund. Für eine spätere Aktivierung separat in isolierter QA prüfen:
EWR-Auswahl einschließlich Ablehnung/Widerruf, markierte Testanzeige über
der Tab-Leiste, letzter Eintrag/Toast sichtbar, Banner unter Sheets verborgen.
Browsertests ersetzen diese native Prüfung nicht.

Datenschutzerklärung und Store-Datenschutzauskünfte müssen das tatsächliche
Verhalten von App und Google-SDK wiedergeben. Die lokalen Rechtsseiten in
`docs/launch/site/` beschreiben den serverseitig ausgeschalteten Start und
sind gezielt veröffentlicht (Root-Pages-Commit
`b9ba3c78f3314c7f85c226f53cb80b2706b9a357`). Alle vier geänderten HTML-Seiten
sind mit HTTP 200 und Bytegleichheit geprüft; Beleg:
`.local/qa/ads-release-gate-20261021/pages-http-readback.json`.
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
