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
hinterlegt. Apple **1.4.1 (26)** ist nach expliziter Nutzerfreigabe am
21. Oktober 2026 um **18:15:25 CEST** eingereicht. API-Readback:
Build 26 ausgewählt, `VALID`, Version und Submission **`WAITING_FOR_REVIEW`**,
Veröffentlichung **`MANUAL`**. Submission-ID:
`04ba9efd-76a8-423d-911f-e3abc54178a7`.
IPA-Pfad, SHA-256 und Tests stehen in [RELEASE.md](RELEASE.md).

**Änderung für den Launch:** Der produktive Schalter
`app_release_settings.id = 1`, `ads_enabled = false` sperrt Werbung,
Testanzeigen, UMP-Dialog und Werbe-SDK-Start. Der neue Quellstand ist für
iOS Build 26 zur Prüfung eingereicht. Android Version Code 2 ist als
interner Entwurf **1.4.1 – Werbefreier Start** gespeichert und als Produktion 2
mit elf Änderungen zur Prüfung gesendet. Review läuft; Managed
Publishing ist aktiviert und nach Neuladen bestätigt. Die Apple-Review-Notizen sind
hochgeladen; die vier öffentlichen Seiten sind live und bytegleich geprüft.

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
Sie versprechen weder dauerhafte Werbefreiheit noch pauschal fehlende Datenverarbeitung
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
- Version 1.4.1 enthält Build 26 und wartet auf Apple-Prüfung; `MARKETING_VERSION` steht im Xcode-Projekt.
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
sicher abgebrochen; der automatische Fallback bleibt ausgeschaltet. Es gab
keinen erfolgreichen Metadaten-API-Commit. Die spätere Produktionsversion 2
ist getrennt über die Console zur Prüfung gesendet, Review läuft.

## Was aktuell noch fehlt

- Schreibende Gerätefunktionstests abschließen. Der originale Android-Code-2-Gate-Smoke samt Wiederherstellung und die physische iPhone-Lese-/Lifecycle-QA sind bestanden. Apple Build 26 ist `WAITING_FOR_REVIEW`; Google Produktion 2 ist zur Prüfung gesendet, Review läuft. Beide Stores halten die Veröffentlichung nach Freigabe zurück.
- Vor späterer Werbeaktivierung: AdMob-Zahlungsprofil (auf Wunsch vorerst offen), Store-Verknüpfung, Googles Bestätigung von `app-ads.txt`, Google-Freigabe und EWR-/Anzeigen-QA. Ohne Zahlungsdaten gibt es weder Anzeigen noch Aufbau von Werbeguthaben. Beide Apps/Banner und UMP-Nachricht sind eingerichtet; die Datei ist am Domain-Stamm erreichbar. Der Schalter bleibt bis dahin `false`; spätere Aktivierung ohne weiteren Build siehe [ADMOB.md](ADMOB.md).
- Verbleibende Betriebsfakten aus `LEGAL_FACTS.md` und die Passwortoberfläche bis zum neuen Passwort/erneuten Login prüfen. Gmail-SMTP (`smtp.gmail.com:587`, Absender `bennyundjoni@gmail.com`, Limit 30/h) ist gespeichert; eigene Testmail, Recovery-Code-Verifikation und authentisierter Nutzerabruf sind bestanden. Testkonto und temporäre Geheimnisdateien sind bereinigt; Review-Konten unverändert. Siehe [SMTP.md](SMTP.md). Die App-/Rechtsseiten sind öffentlich erreichbar; auch die vier Gate-/Gmail-angepassten HTML-Seiten sind veröffentlicht und bytegleich geprüft (HTTP 200, Root-Pages-Commit `b9ba3c78…`).
- Apple: abschließende Prüfung der Abläufe im hochgeladenen Build sowie gegebenenfalls noch im Konto angezeigte Anforderungen. App Privacy ist mit allen 15 Datentypen veröffentlicht; Build 26 ist ausgewählt und zur Prüfung eingereicht. Altersfreigabe 16+, Inhaltsrechte, Medizinprodukt-Antwort Nein, kostenlose Preise und ausschließliche DACH-Verfügbarkeit sind gespeichert. Mac/Apple Vision sind ausgeschlossen. Beide isolierten Review-Logins sind gegen Supabase Auth bestätigt. Der bestehende Trader-Status ist keine hier neu geprüfte DSA-Verifizierung.
- Google Play: Das neue AAB (1.4.1, Version Code 2, SHA-256 `4773dcdf…`) ist als interner Entwurf **1.4.1 – Werbefreier Start** gespeichert und in Produktion 2 mit elf Änderungen zur Prüfung gesendet. Review läuft; Managed Publishing ist nach Neuladen bestätigt aktiviert. Kein öffentlicher Rollout und keine Testerbenachrichtigung. API-Zugang und Textvalidierung sind geprüft; der frühere Metadaten-API-Commit scheiterte am geschützten `changesNotSentForReview`, der Fallback bleibt aus. Die tatsächliche Einreichung erfolgte getrennt über die Console.
- Für Android: externes Backup des lokal erstellten Upload-Keys und vollständige Funktionstests des neuen Launch-Builds. Kaltstart, Review-Login, Feed-Reproduktion und acht echte Screenshots sind für den Vorgänger geprüft. Dessen Emulatorlauf verifiziert UMP-Freigabe → SDK → native Datenschutzbestätigung → `npa: true`-Anfragen; Feed/Stats jeweils `NO_FILL`, keine Anzeigen oder Leerfläche, keine finalen Laufzeitfehler. Der zusätzliche originale Code-2-Gate-false-Nachweis ist inzwischen bestanden. EWR-Wahl/Widerruf und ausgelieferte Anzeigen sind vor späterer Freischaltung zu prüfen. Details in [ADMOB.md](ADMOB.md).

Die Release-Sperren stoppen bei Test-Anzeigenkennungen oder unvollständigen
Unterlagen. Die vollständigen Befehle stehen in
[FASTLANE_STORES.md](FASTLANE_STORES.md). Beide Stores sind zur Prüfung
abgesendet; Google-Review läuft. Apple bleibt `MANUAL`, Google
Managed Publishing ist aktiviert. Keine öffentliche Veröffentlichung.
