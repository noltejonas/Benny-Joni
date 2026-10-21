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
Build 25 zugeordnet und keine Einreichung zur Prüfung.
Der neueste TestFlight-Build **1.4.1 (25)** ist erfolgreich hochgeladen und
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
- Der Store-Entwurf ist auf Version 1.4.1 gesetzt und enthält den passenden Build 25; `MARKETING_VERSION` steht im Xcode-Projekt.
- Copyright: Jonas Nolte und Benjamin Frey, wie in den veröffentlichten Anbieterangaben.
- Support-, Marketing- und Datenschutz-URL: Dateien `*_url.txt`; die öffentlich erreichbaren Seiten müssen vollständig und aktuell sein.
- Review-Zugang und Notizen: `REVIEW_NOTES.md`; `REVIEW_*` nur in der ignorierten `.env`.
- Preis: kostenlos, Basisland Deutschland 0 € und gleichwertige Storefront-Preise ebenfalls 0; nach Neuladen bestätigt.
- Länder: ausschließlich Deutschland, Österreich und Schweiz; UI-Readback zeigt drei Länder „Verfügbar bei App-Veröffentlichung“. Verfügbarkeit auf Mac und Apple Vision ist ausgeschaltet und nach Neuladen bestätigt; diese Plattformen wurden nicht getestet.
- Veröffentlichung: manuell. Fastlane lädt ausschließlich Entwürfe hoch.

Das Feld „Neuerungen“ bleibt für diesen ersten App-Store-Eintrag leer;
Fastlane überspringt `release_notes.txt` erwartungsgemäß. Das Feld ist erst
für spätere Versionen verfügbar, kein fehlgeschlagener Textupload.
[Apple: Versionsinformationen](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

Der Altersfragebogen ist abgeschlossen: berechnet 13+, wegen des Mindestalters
in den Nutzungsbedingungen manuell auf **16+** angehoben und gespeichert.
Nutzerinhalte, Werbung und Wellness sind mit Ja beantwortet, Chat/DM,
Elternkontrollen, technischer Altersnachweis und Browser mit Nein.
Wettbewerbe sind häufig, simuliertes Glücksspiel Nie, Glücksspiel/Lootboxen Nein;
Alkohol ist wegen der vom Nutzer bestätigten „Bier-Runde“ selten.
Die Inhaltsrechte-Erklärung („erforderliche Rechte vorhanden“) und
„kein reguliertes Medizinprodukt“ sind gespeichert. Der bestehende
DSA-Trader-Status bleibt unverändert; eine neue Verifizierung ist nicht belegt.
Die aktualisierte Apple Developer Program License Agreement ist nach
ausdrücklicher kontoweiter Nutzerzustimmung akzeptiert; Neuladen bestätigt
Ausgabe 14. Oktober und Annahme 21. Oktober 2026, das Warnbanner ist entfernt.
Die vollständigen gespeicherten Antworten stehen in
[STORE_PRIVACY_ANSWERS.md](STORE_PRIVACY_ANSWERS.md).

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
KI-erstellte Avatare/Maskottchen enthalten. Apples App Privacy ist ebenfalls
vollständig gesetzt und nach ausdrücklicher Nutzerzustimmung veröffentlicht:
15 Datentypen, davon 13 verknüpft und zwei nicht verknüpft, keine
Tracking-Daten; die Datenschutz-URL ist im UI-Readback korrekt. Die
Veröffentlichung der Datenschutzangaben reicht die App-Version nicht ein.
Die Play-Produktionsländer sind auf Deutschland, Österreich und Schweiz
ausgerichtet, UI-Readback „Ausgerichtet (3)“. Der Produktionstrack bleibt
inaktiv; ein Produktionsrelease wurde weder erstellt noch veröffentlicht.
Die tatsächlich gespeicherten Play-Titel lauten
**Benny & Joni: Fitness-Duell** (Deutsch) und **Benny & Joni: Fitness Duel**
(Englisch). Beide wurden in der Console als Entwurf gespeichert und nach
Neuladen sowie Sprachwechsel bestätigt; Status „Bereit für die Überprüfung“.
Nach ausdrücklicher Freigabe des zusätzlichen appbezogenen Entwurfsrechts
besteht auch die vollständige DE-/EN-Validierung. Der separate API-
Speicherversuch wurde bei der Commit-Ablehnung von `changesNotSentForReview`
sicher abgebrochen; der automatische Fallback bleibt ausgeschaltet. Kein
erfolgreicher API-Commit und keine Review-Einreichung bestätigt.

## Was aktuell noch fehlt

- AdMob-Zahlungsprofil (auf Wunsch vorerst offen), Store-Verknüpfung und Googles Bestätigung von `app-ads.txt`. Beide Apps/Banner und die UMP-Nachricht sind eingerichtet; die Datei ist am Domain-Stamm erreichbar.
- Verbleibende Betriebsfakten aus `LEGAL_FACTS.md` und die Passwortoberfläche bis zum neuen Passwort/erneuten Login prüfen. Gmail-SMTP (`smtp.gmail.com:587`, Absender `bennyundjoni@gmail.com`, Limit 30/h) ist gespeichert; eigene Testmail, Recovery-Code-Verifikation und authentisierter Nutzerabruf sind bestanden. Testkonto und temporäre Geheimnisdateien sind bereinigt; Review-Konten unverändert. Siehe [SMTP.md](SMTP.md). Die fünf App-/Rechtsseiten sind öffentlich erreichbar; auch die konkrete Gmail-Nennung in der Datenschutzerklärung ist veröffentlicht und bytegleich geprüft (HTTP 200, Root-Pages-Commit `d783559a…`).
- Apple: abschließende Prüfung der Abläufe im hochgeladenen Build sowie gegebenenfalls noch im Konto angezeigte Anforderungen. App Privacy ist mit allen 15 Datentypen veröffentlicht; Build 25 ist zugeordnet. Altersfreigabe 16+, Inhaltsrechte, Medizinprodukt-Antwort Nein, kostenlose Preise und ausschließliche DACH-Verfügbarkeit sind gespeichert. Mac/Apple Vision sind ausgeschlossen. Beide isolierten Review-Logins sind gegen Supabase Auth bestätigt. Der bestehende Trader-Status ist keine hier neu geprüfte DSA-Verifizierung.
- Google Play: Das finale AAB (1.4.1, Version Code 1, SHA-256 `5745afb5…`) ist als interner Entwurf gespeichert. Kein Rollout und keine Testerbenachrichtigung. Das zusätzliche appbezogene Entwurfsrecht ist ausdrücklich genehmigt und gespeichert; sechs Apprechte, keine neuen Accountrechte. `verify_auth` und vollständige DE-/EN-Textvalidierung bestehen. API-Speichern scheitert sicher am nicht akzeptierten `changesNotSentForReview`; Fallback bleibt aus, kein erfolgreicher API-Commit/keine Review-Einreichung bestätigt. Die fertigen UI-Listings enthalten inzwischen die oben bestätigten längeren Titel.
- Für Android: externes Backup des lokal erstellten Upload-Keys sowie vollständige Funktionstests, EWR-Dialogwahl/Widerruf und tatsächliche Anzeigenauslieferung. Kaltstart, Review-Login, Feed-Reproduktion und acht echte Screenshots sind geprüft. Der Emulator verifiziert UMP-Freigabe → SDK → native Datenschutzbestätigung → `npa: true`-Anfragen; Feed/Stats jeweils `NO_FILL`, keine Anzeigen oder Leerfläche, keine finalen Laufzeitfehler. Details/Beleg in [ADMOB.md](ADMOB.md). Beide Store-Bereitschaftschecks sind bestanden; keine vollständige Geräte-QA behauptet.

Die Release-Sperren stoppen bei Test-Anzeigenkennungen oder unvollständigen
Unterlagen. Die vollständigen Befehle stehen in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Es wurde keine App-Version zur
Store-Prüfung abgesendet oder veröffentlicht.
