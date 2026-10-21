# Store-Unterlagen für Benny & Joni

Die aktuellen Texte stehen maschinenlesbar unter
`ios/App/fastlane/metadata/` (App Store) und `play-metadata/` (Google Play).
Beide Stores erhalten Deutsch (`de-DE`) und Englisch (`en-GB`). Ändert Texte
in diesen Dateien und prüft sie danach mit `node tools/check-store.cjs`.

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

Für Apple sind vier gestaltete Bilder je Sprache im Format 1320 × 2868 unter
`docs/launch/screenshots/iphone-6.9-de/` und `iphone-6.9-en/` vorbereitet.
Sie enthalten vollständige echte App-Captures, gleichmäßig skaliert und mit
äußerem Markenrahmen. Die alten 6,3-Zoll-Bilder werden nicht hochgeladen,
weil der Feed dort noch historische Work-Einträge zeigt.

Für Play werden ein 512 × 512 Icon und eine lokalisierte 1024 × 500
Feature-Grafik vorbereitet. Android-Screenshots müssen nach dem ersten
lauffähigen Android-Build aufgenommen werden. iPhone-Captures werden nicht
als Android-Bilder ausgegeben. Google verlangt mindestens zwei Screenshots;
die längere Seite darf höchstens doppelt so lang wie die kürzere sein.

## App Store Connect ausfüllen

- Bundle-ID: `com.bennyjoni.terminator`, Name aus dem jeweiligen `name.txt`.
- Primäre Sprache: Deutsch; zusätzliche Lokalisierung: Englisch (UK).
- Kategorie: Gesundheit und Fitness; die App erfasst vom Nutzer eingetragene Trainingswerte.
- Version und Build müssen zum tatsächlichen Upload passen. Die aktuelle Version steht als `MARKETING_VERSION` im Xcode-Projekt.
- Copyright: tatsächlicher Betreiber wie im Impressum; der vorhandene Platzhalter muss ersetzt werden.
- Support-, Marketing- und Datenschutz-URL: Dateien `*_url.txt`; die öffentlich erreichbaren Seiten müssen vollständig und aktuell sein.
- Review-Zugang und Notizen: `REVIEW_NOTES.md`; `REVIEW_*` nur in der ignorierten `.env`.
- Preis und Länder: im Konto bewusst festlegen. Die App ist auf Deutsch und Englisch verfügbar; die vorbereiteten Rechtstexte sind deutsch.
- Veröffentlichung: manuell. Fastlane lädt ausschließlich Entwürfe hoch.

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

In Play Console außerdem angeben: enthält Werbung, App-Zugriff für die
Prüfung, Zielgruppe/Inhaltsbewertung, Datensicherheit, öffentlich erreichbare
Möglichkeit zur Kontolöschanfrage und das Formular für Gesundheits-Apps
(„Activity and Fitness“ entsprechend den Trainingsfunktionen).

## Was aktuell noch fehlt

- AdMob-Konto, echte App-/Banner-IDs je Plattform, veröffentlichte UMP-Nachricht und bestätigtes `app-ads.txt`.
- Tatsächliche Betreiber-/Supportdaten und weitere markierte Rechtsangaben; Veröffentlichung der vollständigen Rechtsseiten.
- Store-Zugänge und erreichbarer Review-Login, sofern nicht bereits lokal eingerichtet.
- Für Android: SDK/JDK, Upload-Keystore, signiertes AAB, echte Screenshots und erster Upload in Play Console.

Die Release-Sperren stoppen bei Test-Anzeigenkennungen oder unvollständigen
Unterlagen. Die vollständigen Befehle stehen in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Es wurde nichts zur Prüfung
abgesendet oder veröffentlicht.
