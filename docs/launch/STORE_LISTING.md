# Store-Unterlagen für Benny & Joni

Die aktuellen Texte stehen maschinenlesbar unter
`ios/App/fastlane/metadata/` (App Store) und `play-metadata/` (Google Play).
Beide Stores erhalten Deutsch (`de-DE`) und Englisch (`en-GB`). Ändert Texte
in diesen Dateien und prüft sie danach mit `node tools/check-store.cjs`.

Am 21. Oktober 2026 wurden die Apple-Metadaten für Version **1.4.1** mit
`tools/fastlane.sh ios store_metadata` hochgeladen und anschließend direkt
über Apples API verglichen: Beide Lokalisierungen und ihre URLs stimmen mit
den lokalen Dateien überein. Je Sprache sind vier Screenshots vollständig
verarbeitet (`COMPLETE`, keine Fehler/Warnungen). Die Review-Angaben sind
hinterlegt. Status: `PREPARE_FOR_SUBMISSION`, Veröffentlichung `MANUAL`,
Build 24 zugeordnet und keine Einreichung zur Prüfung.
Der neueste TestFlight-Build **1.4.1 (24)** ist erfolgreich hochgeladen und
per API als `VALID` bestätigt; die Zuordnung zur Store-Version ist ebenfalls
per API zurückgelesen, weiterhin im Entwurf mit manueller Veröffentlichung.
IPA-Pfad, SHA-256 und Tests stehen in [RELEASE.md](RELEASE.md).

## Texte und Bilder

| Store | Felder | Grenzen |
|---|---|---|
| Apple | Name / Untertitel | je 30 Zeichen |
| Apple | Werbetext / Schlüsselwörter | 170 / 100 Zeichen; Keywords zusätzlich konservativ höchstens 100 Byte |
| Apple | Beschreibung / Neuerungen | je 4000 Zeichen |
| Google Play | Titel / Kurzbeschreibung | 30 / 80 Zeichen |
| Google Play | Vollständige Beschreibung / Neuerungen | 4000 / 500 Zeichen |

Die Beschreibungen nennen private Fitness-Challenges, Wochenziele,
Live-Feed, Statistiken, Workouts und die freiwillige appweite Rangliste.
Sie versprechen weder Werbefreiheit noch pauschal fehlende Datenverarbeitung
durch AdMob. Das Strafkonto ist eine Liste privater Absprachen; die App
verarbeitet und überweist kein Geld. Der Work-Modus ist nicht aktivierbar.

Für Apple sind vier gestaltete Bilder je Sprache im Format 1320 × 2868 aus
`docs/launch/screenshots/iphone-6.9-de/` und `iphone-6.9-en/` hochgeladen.
Sie enthalten vollständige echte App-Captures, gleichmäßig skaliert und mit
äußerem Markenrahmen. Die alten 6,3-Zoll-Bilder werden nicht hochgeladen,
weil der Feed dort noch historische Work-Einträge zeigt.

Für Play liegen ein 512 × 512 Icon, lokalisierte 1024 × 500 Feature-Grafiken
und je vier echte Android-Screenshots auf Deutsch und Englisch vor.
Die Aufnahmen zeigen Willkommen, Heute, Statistik und Strafkonto in
1080 × 1920 Pixeln; optische Prüfung, pixelgleicher RGB-Export und lokaler
Bereitschaftscheck sind bestanden. Der aktuelle Android-Build startet
nachweislich im API-36-Pixel-2-Emulator; auch die Feed-Reproduktion nach
Live-Updates und Wischen ist bestanden. Google verlangt mindestens zwei Screenshots;
die längere Seite darf höchstens doppelt so lang wie die kürzere sein.

## App Store Connect ausfüllen

- Bundle-ID: `com.bennyjoni.terminator`, Name aus dem jeweiligen `name.txt`.
- Primäre Sprache: Deutsch; zusätzliche Lokalisierung: Englisch (UK).
- Kategorie: Gesundheit und Fitness; die App erfasst vom Nutzer eingetragene Trainingswerte.
- Der Store-Entwurf ist auf Version 1.4.1 gesetzt und enthält den passenden Build 24; `MARKETING_VERSION` steht im Xcode-Projekt.
- Copyright: Jonas Nolte und Benjamin Frey, wie in den veröffentlichten Anbieterangaben.
- Support-, Marketing- und Datenschutz-URL: Dateien `*_url.txt`; die öffentlich erreichbaren Seiten müssen vollständig und aktuell sein.
- Review-Zugang und Notizen: `REVIEW_NOTES.md`; `REVIEW_*` nur in der ignorierten `.env`.
- Preis und Länder: im Konto bewusst festlegen. Die App ist auf Deutsch und Englisch verfügbar; die vorbereiteten Rechtstexte sind deutsch.
- Veröffentlichung: manuell. Fastlane lädt ausschließlich Entwürfe hoch.

Das Feld „Neuerungen“ bleibt für diesen ersten App-Store-Eintrag leer;
Fastlane überspringt `release_notes.txt` erwartungsgemäß. Das Feld ist erst
für spätere Versionen verfügbar, kein fehlgeschlagener Textupload.
[Apple: Versionsinformationen](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

Die Altersfreigabe muss die tatsächlichen Funktionen berücksichtigen:
Nutzerinhalte, öffentliche Ranglistenprofile nach Zustimmung, Fitnessziele,
Wettbewerbe und AdMob-Werbung. Die Nutzungsbedingungen setzen ein Mindestalter
von 16 Jahren voraus; eine eventuell nötige höhere Überschreibung im
Store-Fragebogen entsprechend setzen. Ein Banner-Inhaltsfilter „General“
ersetzt den Altersfragebogen nicht.

## Datenschutzangaben für den tatsächlichen Release

Die App verarbeitet Kontaktdaten (E-Mail/Anzeigename), Profilbilder,
Nutzer-IDs, Trainingswerte, Challenge-Inhalte, optionale Strafkonto-Daten,
Mitgliedschaften, Push-Tokens sowie gegebenenfalls technische Fehlerberichte.
Die freiwillige Rangliste veröffentlicht Anzeigename, Foto und gewertete
Übungswerte gegenüber anderen angemeldeten App-Nutzern. E-Mail-Adressen,
private Challenge-Namen und Notizen erscheinen dort nicht.

Bei AdMob kommen Daten des Google Mobile Ads SDK hinzu, unter anderem
IP-basierter ungefährer Standort, Gerätekennungen, Anzeigeninteraktionen
und Diagnose-/Leistungsdaten. Die Einstufung nach Zweck, Verknüpfung und
Tracking muss mit der konkreten SDK-Konfiguration und dem Xcode Privacy
Report abgeglichen werden. Fehlendes ATT und nicht personalisierte Anzeigen
allein sind kein Beleg, dass keine Gerätekennungen oder Anzeigenanalysen
verarbeitet werden. Grundlage: [Googles SDK-Datenoffenlegung](https://developers.google.com/admob/ios/privacy/data-disclosure)
und [Apples Datenschutzangaben](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).
Die konkrete Ausfüllhilfe für beide Formulare steht in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md).

Am 21. Oktober 2026 hat Play Console das Speichern von Datenschutz-URL,
Werbung, isoliertem Review-Zugang, Zielgruppe 16–17/18+, „Activity and
Fitness“, Kategorie/Kontakt sowie Data safety mit allen zwölf Datentypen
bestätigt. Regierungs-App und Finanzfunktionen: No; optionale Partnertests:
aus. Die genauen gespeicherten Antworten stehen in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md). Inzwischen sind IARC
und beide Play-Store-Listings ebenfalls vollständig gespeichert; Status
„Bereit für Überprüfung“, alle elf Einrichtungsschritte abgeschlossen.
IARC ergibt USK 12, ESRB Teen und PEGI Parental Guidance; die Zielgruppe
bleibt 16+. Acht reale Android-Screenshots, ein Icon und zwei lokalisierte
Feature-Grafiken sind hinterlegt. Für alle elf Assets wurde die
KI-Kennzeichnung gespeichert, weil auch die echten App-Aufnahmen
KI-erstellte Avatare/Maskottchen enthalten. Apples App-Privacy-Formular
bleibt offen.

## Was aktuell noch fehlt

- AdMob-Zahlungsprofil (auf Wunsch vorerst offen), Store-Verknüpfung und Googles Bestätigung von `app-ads.txt`. Beide Apps/Banner und die UMP-Nachricht sind eingerichtet; die Datei ist am Domain-Stamm erreichbar.
- Produktions-E-Mail-Versand und verbleibende Betriebsfakten aus `LEGAL_FACTS.md` überprüfen. Anbieter-/Supportdaten sind eingesetzt und die fünf App-/Rechtsseiten öffentlich erreichbar.
- Apple: App Privacy, Altersfreigabe, Preis/Länder und erforderliche Kontoangaben abschließen. Build 24 ist im Entwurf zugeordnet; API-Zugang und Metadatenupload sind geprüft. Beide isolierten Review-Logins sind gegen Supabase Auth bestätigt. Die Abläufe im hochgeladenen Build vor der Einreichung prüfen.
- Google Play: Das finale AAB (1.4.1, Version Code 1, SHA-256 `5745afb5…`) ist hochgeladen und als interner Entwurf **1.4.1 – Initial internal test** mit DE-/EN-Neuerungen (2/2) gespeichert. Kein Rollout und keine Testerbenachrichtigung. Für Fastlane zusätzlich eigenen API-Zugang einrichten. Alle elf Einrichtungsschritte einschließlich IARC, Data safety und DE-/EN-Listing sind abgeschlossen. Der Apple-Key ist für Play nicht verwendbar.
- Für Android: externes Backup des lokal erstellten Upload-Keys sowie vollständige Funktionstests und AdMob-/UMP-Geräteprüfung. Kaltstart, Feed-Reproduktion und der Export von acht echten Screenshots sind bestanden.

Die Release-Sperren stoppen bei Test-Anzeigenkennungen oder unvollständigen
Unterlagen. Die vollständigen Befehle stehen in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Es wurde keine App-Version zur
Store-Prüfung abgesendet oder veröffentlicht.
