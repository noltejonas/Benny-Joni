# Datenschutzformulare für den Release

Ausfüllhilfe für Benny & Joni, Stand 21. Oktober 2026. Grundlage sind der
aktuelle Code und die unten verlinkten Store-/SDK-Definitionen. Dieses Dokument
ergänzt [STORE_LISTING.md](STORE_LISTING.md) mit konkreten Formularantworten.
Es enthält keine Zugangsdaten. Die unten dokumentierten Play-Angaben wurden
am 21. Oktober 2026 in der Console gespeichert; eine Einreichung oder
Veröffentlichung ist damit nicht erfolgt. Apples App-Privacy-Formular ist
weiterhin offen.

## Tatsächlich in Play Console gespeichert

Die Console bestätigte die folgenden Eingaben mit „Saved“:

| Bereich | Gespeicherter Stand |
|---|---|
| Privacy policy | Die unten genannte öffentlich erreichbare Datenschutz-URL. |
| Contains ads | Yes. |
| Government apps / Financial features | Jeweils No. Das freiwillige Strafkonto bleibt als „Other financial info“ in Data safety offengelegt; die App verarbeitet keine Zahlungen. |
| Health apps | Activity and Fitness. |
| App category / öffentlicher Kontakt | Health & Fitness; `bennyundjoni@gmail.com`, `+491781479821`, HTTPS-Website. |
| App access | Eingeschränkter Zugang, ausdrücklich freigegebener isolierter Review-Login, englische Anleitung mit 393 Zeichen und gesetzte Checkbox für vollständigen Prüferzugriff. Zugangsdaten bleiben ausschließlich in den privaten Feldern/Dateien. |
| Optionale Partnertests | Ausgeschaltet. |
| Target audience | 16–17 sowie 18 and over. |
| Data safety | Alle zwölf Datentypen der folgenden Play-Tabelle einschließlich Erhebung, Weitergabe, Pflicht/Optional und Zwecken gespeichert. Bei App interactions und Diagnostics ist App functionality ausschließlich Erhebungszweck der eigenen Funktionsdaten, kein Weitergabezweck der Google-SDK-Daten. Eigene Crash logs: collected, required, nicht shared. |
| IARC | Abgeschlossen und gespeichert: Other app; Fitness/UGC als primäre Inhalte; Melden/Blockieren vorhanden, keine Chatmoderation, Zugang per Einladung. Kein externer Content, keine altersbeschränkten Waren, GPS-Freigabe, Käufe, Auszahlungen, Browser- oder Nachrichtenfunktion. Ergebnis: USK 12, ESRB Teen, PEGI Parental Guidance. Die ausgewählte Zielgruppe bleibt 16+. |
| Store-Listing | Deutsch und Englisch vollständig gespeichert, Status „Bereit für Überprüfung“; je vier echte Android-Screenshots, ein Icon und zwei lokalisierte Feature-Grafiken. |
| KI-Kennzeichnung der Assets | Für alle elf Assets in der Play-Oberfläche gespeichert: ein Icon, zwei Feature-Grafiken und acht echte App-Aufnahmen, die KI-erstellte Avatare/Maskottchen enthalten. Echte Screenshots sind dadurch nicht als erfundene App-Oberflächen dargestellt. |

Alle elf Play-Einrichtungsschritte sind abgeschlossen. Das finale AAB ist
hochgeladen: Version 1.4.1, Version Code 1, SHA-256 beginnt mit `5745afb5`;
die Console bestätigt ein App Bundle und zeigt `1 (1.4.1)`. Der interne
Entwurf **1.4.1 – Initial internal test** ist einschließlich Neuerungen in
beiden Sprachen gespeichert (2/2). Kein Rollout und keine Testerbenachrichtigung.
Apples App-Privacy-Formular und das externe Keystore-Backup sind weiterhin offen.

## Gemeinsamer Ausgangspunkt

| Frage | Eintragen / zugrunde liegender Stand |
|---|---|
| Werden Daten erhoben? | **Ja**, auf beiden Plattformen. Supabase verarbeitet Konten und App-Inhalte; hinzu kommen Google-Werbedaten. |
| Datenschutzerklärung | `https://noltejonas.github.io/Benny-Joni/datenschutz.html` |
| Datenschutz-/Löschmöglichkeiten | `https://noltejonas.github.io/Benny-Joni/support.html` — enthält die Kontolöschanleitung und den E-Mail-Anfrageweg. |
| Werbung | **Ja**: AdMob-Banner im Feed und in Stats. Keine eigenen Marketing-E-Mails oder eigenen Werbekampagnen im Code. |
| Personalisierte Werbung | App fordert ausschließlich **nicht personalisierte Anzeigen** an (`npa: true`). UMP bestimmt, ob und welche Anzeigen zulässig sind. |
| Gerätekennungen | **Nicht pauschal verneinen.** Die Publisher-first-party-ID ist auf beiden Plattformen aus; Android-AD_ID/App-Set-ID und andere SDK-Daten sind damit nicht ausgeschaltet. |
| iOS / Android | iOS: APNs-Push nach Freigabe. Android: **kein eingerichtetes FCM**, daher keine behaupteten Android-Push-Tokens. |
| Zusätzliche Analytics | Keine eigene Verhaltensanalyse mit Firebase Analytics, Google Analytics, Sentry o. Ä. im App-Code. AdMob betreibt dennoch SDK-/Anzeigenanalysen. |
| Work-Modus | Nicht aktivierbar. Keine neue Arbeitszeiterfassung; historische Einträge können im Backend noch vorhanden sein. |

**Kennzeichnungen:** „Inferenz“ bezeichnet eine begründete Zuordnung zum
Formular, nicht einen zusätzlich nachgewiesenen Datenfluss. `T1` dokumentiert
die begründete Apple-Tracking-Antwort für die verifizierte Konfiguration;
`E1` erläutert eigene Fehlerberichte.
Aktuell geprüft: Supabase `eu-west-1`, Free-Tarif, kein Custom-SMTP,
E-Mail-Autoconfirm aktiviert. Log-/Backup-Fristen bleiben Betriebsfakten;
daraus entstehen keine erfundenen Tageszusagen. Die regionale Zuordnung
allein ändert keine der folgenden Store-Kategorien.

## Apple: App Privacy

In App Store Connect → App → App Privacy: **„Yes, we collect data from this
app“**. Die Angaben umfassen auch eingebundene SDKs. „Linked“ umfasst die
Zuordnung zu Konto **oder Gerät**; eine E-Mail muss dafür nicht an Google
geschickt werden. Apple hat hier keinen allgemeinen Pflicht/Optional-Schalter:
ein freiwilliges Profilfoto ist trotzdem anzugeben. [Apple: Definitionen und
Datentypen](https://developer.apple.com/app-store/app-privacy-details/)

### Eigene App-Funktionen und Supabase

In diesen Zeilen ist „Used for Tracking“ jeweils **No**: Der App-Code gibt
keine Kontodaten oder Trainingsinhalte an AdMob weiter und verknüpft sie nicht
mit fremden Werbedatensätzen.

| Datentyp im Apple-Formular | Tatsächlich enthalten | Zweck auswählen | Linked to the user | Freiwilligkeit / Begründung |
|---|---|---|---|---|
| Contact Info → **Name** | Anzeigename; kann ein echter Name sein | App Functionality | Yes | Anzeigename ist Pflicht, Pseudonym erlaubt. Zuordnung zu „Name“ ist eine Inferenz; das vorhandene App-Manifest nennt diesen Typ ebenfalls. |
| Contact Info → **Email Address** | Anmeldung, Bestätigung/Passwort-Reset, Support-Absender | App Functionality | Yes | Für das produktive Konto nötig; Demo ist kein vollständiger Ersatz für die Konto-Funktionen. |
| Identifiers → **User ID** | Supabase-UID, Anzeigename/Handle, kontobezogene Rollen/Zuordnungen | App Functionality | Yes | Für Konto und Challenge-Zuordnung nötig. Passwort/Hash sind Teil der Authentifizierung; sie werden nicht an das Werbe-SDK übergeben. |
| User Content → **Photos or Videos** | Ausgewähltes Profilfoto | App Functionality | Yes | Optional. Nur Fotos; kein Video-Upload. Datei-URL ist bei Kenntnis öffentlich abrufbar. |
| Health & Fitness → **Fitness** | Selbst eingetragene Übungen, Wiederholungen, Trainingszeiten/Runden, Ziele und Wertungen | App Functionality | Yes | Kernfunktion der Trainings-Challenges. Kein HealthKit, keine Vitalwerte oder medizinischen Datensätze. |
| User Content → **Other User Content** | Challenge-/Übungsnamen, Notizen, Reaktionen, Einladungs-/Mitgliedschaftsinhalte, Ranglistenmeldungen | App Functionality | Yes | Eigene Notizen/Übungen und Ranglisten-Teilnahme freiwillig; Gruppeninhalte sind für jeweilige Mitglieder sichtbar. |
| Financial Info → **Other Financial Info** | Freiwilliges Strafkonto: Betrag, offen/bezahlt, Einzahlungen und Notizen | App Functionality | Yes | Optional je Challenge. Inferenz: Beträge/Verpflichtungen sind Finanzinformationen, auch ohne Zahlungsabwicklung. Nicht als Bankdaten oder In-App-Käufe einordnen. |
| Identifiers → **Device ID** | APNs-Token mit Nutzer-ID/Plattform/letzter Aktivität | App Functionality | Yes | iOS-Push nach Betriebssystemfreigabe; kein Grund, diesen Typ im Gesamtformular wegen fehlender IDFA wegzulassen. |
| Usage Data → **Product Interaction** | Gespeicherter Onboarding-Fortschritt, Reaktionen, Push-Zustell-/Deduplizierungsdaten | App Functionality | Yes | Inferenz zur Formularzuordnung. Das sind Funktionsdaten, keine zusätzlich belegte eigene Werbeanalyse. |
| User Content → **Customer Support** | Support-/Meldeanfragen, mitgeschickte IDs und Antwortverlauf | App Functionality | Yes | Optional. Hier mit angeben; nicht auf Apples enge Ausnahme für seltene freiwillige Eingaben verlassen. |
| Diagnostics → **Other Diagnostic Data** | Server-/Sicherheitsprotokolle | App Functionality | Yes, soweit Konto-/Gerätebezug vorhanden | Keine belegte Anonymisierung vor Erhebung. Für Fehlerminimierung/Sicherheit, nicht zur Bewertung des Trainingsverhaltens. |
| Eigene ErrorBoundary-Berichte | Fehlertext, Stacktrace, Kontext, User-Agent, App-Pfad | Siehe E1 | Siehe E1 | Der Code versucht die Übertragung; die zugehörige Tabelle existiert produktiv derzeit nicht. Google erhebt separat ebenfalls Crash Data, siehe nächste Tabelle. |

Challenge-Zuordnungen werden hier unter Nutzerkennungen/Inhalten erfasst. Es
gibt keinen Adressbuchimport und keine eigenständige Kontakt-/Freundesliste.
„Contacts“ nicht allein wegen einer Liste von Challenge-Teilnehmern zusätzlich
ankreuzen; diese Abgrenzung zum von Apple ebenfalls genannten „social graph“
ist eine **Inferenz**, falls die Oberfläche dazu eine genauere Definition zeigt.

### Hinzu kommen Google Mobile Ads und UMP

Lokal aufgelöst: **Google Mobile Ads 13.11.0**, **UMP 3.1.0**. Die folgende
Verknüpfung folgt den tatsächlich vorhandenen SDK-Privacy-Manifesten und wird
bei einer Zusammenführung mit eigenen Daten nur strenger, nicht schwächer.
Google beschreibt IP-/Standort-, Kennungs-, Anzeigen-, Interaktions- und
Diagnosedaten in seiner [iOS-SDK-Datenoffenlegung](https://developers.google.com/admob/ios/privacy/data-disclosure).

| Apple-Datentyp | Zweck(e) für den aktuellen Einsatz | Linked | Tracking / Zusammenführung |
|---|---|---|---|
| **Coarse Location** | Third-Party Advertising, Analytics; zusätzlich App Functionality für UMP | Yes | No laut SDK-Manifest für diesen Datentyp. IP-basierte grobe Lage; keine GPS-Freigabe. |
| **Device ID** | Third-Party Advertising, Analytics; zusätzlich App Functionality wegen APNs | Yes | **No — Konfigurationsableitung T1** für den unten beschriebenen NPA-Google-Demand ohne ATT/Mediation, mit ausgeschalteter Publisher-first-party-ID. |
| **Advertising Data** | Third-Party Advertising, Analytics | Yes | No laut aktuellem SDK-Manifest. |
| **Product Interaction** | Third-Party Advertising, Analytics; zusätzlich App Functionality für UMP/eigene Funktionsdaten | Yes | No laut aktuellem SDK-Manifest. |
| **Performance Data** | Third-Party Advertising, Analytics; zusätzlich App Functionality für UMP | No laut SDK-Manifest | Kein eigener kontobezogener Performance-Telemetriekanal nachgewiesen. |
| **Crash Data** | Analytics | No für SDK alleine; eigene Berichte siehe E1 | No für Tracking. Bei später gespeicherten eigenen Fehlerberichten zusätzlich App Functionality und Linked=Yes. |
| **Other Diagnostic Data** | Third-Party Advertising, Analytics; zusätzlich App Functionality für eigene technische Protokolle/E1 | **Yes** bei eigenem Konto-/Gerätebezug; SDK alleine No | No für Tracking. |

**T1 — konkrete Formularantwort: „Used for Tracking“ = No.** Diese
beleggestützte Konfigurationsableitung gilt für den verifizierten Einsatz:

- Google-Demand mit nicht personalisierten Anzeigen; keine zusätzliche
  Mediation und keine weiteren Werbe-SDKs.
- `NON_PERSONALIZED = true` in `www/ads.js`; `showBanner` erhält dadurch
  `npa: true`. Der tatsächlich eingebundene iOS-Plugin-Code liest dieses
  Boolean, registriert `Extras.additionalParameters = ["npa": "1"]` am
  Google-Request und lädt das Banner mit genau diesem Request.
- Unter iOS keine ATT-Anfrage und damit keine freigegebene IDFA; die
  zusätzliche Publisher-first-party-ID wird im `AppDelegate.swift` vor
  SDK-Initialisierung ausgeschaltet. Unter Android folgt auf den von UMP
  freigegebenen `AdMob.initialize()`-Aufruf die lokale
  `AdPrivacy.disablePublisherFirstPartyId()`-Bridge. Erst wenn sie die
  erfolgreiche Persistierung bestätigt, gibt `www/ads.js` Anzeigenanfragen
  frei; bei fehlender Bridge oder einem Fehler bleiben sie gesperrt.
- In AdMob ist die RTB-Creative-Prüfung auf Ad-Partner-Einwilligung aktiviert.
  Die App übergibt Google keine Trainings-, Profil- oder Supabase-Kontodaten.

Apple definiert Tracking als Verknüpfung mit Daten anderer Unternehmen für
gezielte Werbung/Werbemessung oder die Weitergabe an Datenhändler. Apple
erlaubt beispielsweise IDFV-Analysen innerhalb desselben Anbieters ohne ATT.
Google bestätigt Werbung ohne IDFA und bei `NPA=1` den Ausschluss von
Drittanbieter-Adserving/-Adtracking für Google-Demand; für Non-Google-Demand
nennt Google zusätzlich die aktivierte RTB-Creative-Consentprüfung.
[Apple: Tracking und IDFV](https://developer.apple.com/app-store/user-privacy-and-data-use/),
[Google: Anzeigen ohne IDFA](https://developers.google.com/admob/ios/privacy/idfa),
[Google: NPA und Drittanbieter-Tracking](https://support.google.com/admob/answer/14323214),
[Google: First-party-IDs und deren Begrenzung](https://support.google.com/admob/answer/14199649)

Das allgemeine Google-SDK-Manifest markiert Device ID als potentiell für
Tracking verwendet. Es beschreibt die Fähigkeiten des SDKs über verschiedene
Konfigurationen hinweg und beweist kein Tracking in diesem konkreten Einsatz.
Den finalen Archive-Privacy-Report weiterhin mit der Integration abgleichen;
das allgemeine Flag allein begründet hier keine zusätzliche ATT-Anforderung
und keine offene T1-Launch-Sperre. Es gibt kein ausdrückliches Hersteller-
Attest für genau diese Kombination; die Antwort ist die dokumentierte
Ableitung aus Konfiguration, Datenflüssen und den oben genannten Regeln.

Bei späterer ATT-/IDFA-Nutzung, personalisierten Requests, zusätzlichen
Werbenetzwerken, geänderten Kontoeinstellungen oder übergebenen Nutzer-
Kennungen diese Ableitung erneut prüfen. Gerätekennungen, SDK-Diagnose und
Werbe-/Interaktionsdaten bleiben auch mit Tracking=No als erhoben und wie
oben verknüpft offenzulegen. Ein zusätzlicher PPT-Schalter wurde nicht
eingebaut; Google beschreibt PPT als optional und erlaubt damit alleine
weiterhin Drittanbieter-Adtracking. Er ersetzt die geprüfte NPA-Übergabe nicht.

Die SDK-Manifeste nennen bei mehreren Typen außerdem
`DeveloperAdvertising`. **Nicht unbegründet eigene Marketing-Nutzung
behaupten:** Solche Kampagnen sind für diese App nicht eingerichtet. Diese
generische SDK-Zweckdeklaration im finalen Bericht ebenfalls abgleichen;
die obige Zweckauswahl ist die **Inferenz für den aktuellen Einsatz**.

### Was Apple nach dem aktuellen Funktionsumfang nicht zusätzlich auswählen sollte

Keine präzise Position, medizinischen Gesundheitsdaten, Bank-/Kartendaten,
Kreditdaten, Kaufhistorie, Telefonnummern/Anschriften der Nutzer, Audio,
Such-/Browserhistorie oder Kontaktbuchdaten. Die öffentlichen Anbieter-
Kontaktdaten sind keine von Nutzern erhobenen Telefonnummern/Adressen.
Der Code liest auch keine fremden Mailpostfächer oder privaten Chats aus.
Frei formulierte Trainingsnotizen begründen nicht automatisch die Erhebung
jedes denkbaren sensiblen Datentyps.

## Google Play: Data safety

App content → Data safety. Für die Frage, ob Daten erhoben oder weitergegeben
werden: **Yes**. „Collected“ zählt auch SDK-Übertragungen direkt an Google.
„Shared“ und „Linked“ sind keine austauschbaren Begriffe; Play fragt nicht
Apples Verknüpfungsspalte ab. [Formulardefinitionen](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)

### Konkrete Datentypen und Häkchen

Bei allen unten genannten persistierten App-/SDK-Kategorien für
„processed ephemerally“ **No** wählen: keine belegte ausschließliche
RAM-/Echtzeitverarbeitung. „Required“ wird auf den vollständigen produktiven
Funktionsumfang bezogen. „Optional“ bedeutet hier eine tatsächliche Wahl,
nicht nur, dass man die App schließen oder ausschließlich die Demo ansehen kann.

| Play-Datentyp | Collected | Shared | Required / Optional | Zwecke auswählen | Enthaltene Daten / Beleg |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No¹ | Required | App functionality; Account management | Pflicht-Anzeigename/Pseudonym, ggf. aus E-Mail vorbelegt. Name-Zuordnung wie bei Apple als Inferenz. |
| Personal info → **Email address** | Yes | No¹ | Required | Account management; App functionality; Developer communications für Support/Antworten | Supabase Auth und freiwillige Support-Anfragen. Keine Marketing-Mails. |
| Personal info → **User IDs** | Yes | No¹ | Required | Account management; App functionality; Fraud prevention, security, and compliance für Moderation/Blocklisten | UID, Handle und kontobezogene Zuordnungen. Keine Übergabe dieser Supabase-UID an AdMob. |
| Health and fitness → **Fitness info** | Yes | No¹ | **Required²** | App functionality | Übungen, Wiederholungen, Zeit/Runden, Ziele, Ranglistenwerte. |
| Photos and videos → **Photos** | Yes | No¹ | Optional | App functionality | Nur ausgewähltes Profilfoto. „Videos“ nicht wegen eines möglichen Werbevideos auswählen. |
| App activity → **Other user-generated content** | Yes | No¹ | Optional² | App functionality; Fraud prevention, security, and compliance bei Meldungen | Eigene Notizen/Namen/Übungen, Reaktionen und Meldeinhalte. Keine separate Chat- oder Mailbox-Funktion. |
| Financial info → **Other financial info** | Yes | No¹ | Optional | App functionality | Strafkonto-Beträge und bezahlte/offene Verpflichtungen; Zuordnung ist eine Inferenz. Keine Bankdaten. |
| Location → **Approximate location** | Yes | **Yes** | Required³ | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | AdMob leitet ggf. grobe Lage aus der IP ab. Kein GPS nötig. |
| App activity → **App interactions** | Yes | **Yes** | Required³ | Advertising or marketing; Analytics; Fraud prevention, security, and compliance; zusätzlich App functionality für eigene Funktionsereignisse | SDK-Interaktionen/Anzeigenaufrufe; eigene Onboarding-/Reaktionsdaten gehen zusätzlich an Supabase. |
| App info and performance → **Diagnostics** | Yes | **Yes** | Required³ | Advertising or marketing; Analytics; Fraud prevention, security, and compliance; App functionality für eigene Fehlerdiagnose bei E1 | GMA-Start-/Hänger-/Energie-/Diagnosedaten; ggf. eigene technische Fehlerkontexte. |
| Device or other IDs → **Device or other IDs** | Yes | **Yes** | Required³ | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | Google-SDK-Kennungen einschließlich Android-Werbe-ID/App-Set-ID, soweit verfügbar. **Kein Android-FCM-Token behaupten.** |
| App info and performance → **Crash logs** | **Yes⁴** | No¹ für eigene Berichte | Required⁴ | App functionality | Eigene ErrorBoundary-Fehler/Stacktraces werden zur Übertragung versucht, obwohl derzeit keine Speichertabelle vorhanden ist. Nicht allein aus GMA ableiten: dessen Android-25.5-Tabelle nennt Diagnostics, aber nicht separat Crash logs. |

¹ **Sharing-Abgrenzung (Inferenz S1):** Supabase verarbeitet die App-Daten im
Auftrag; dafür ist die Service-provider-Ausnahme vorgesehen. Erwartete
Übertragungen an Challenge-Mitglieder beim Beitreten/Eintragen und die
ausdrücklich eingeschaltete Rangliste werden als nutzerinitiierte bzw.
erwartete Freigaben behandelt. Das ist kein Versprechen privater Profilfoto-
URLs. Diese Ausnahmen nicht auf Google-Werbung ausdehnen: Google bezeichnet
die unten genannten SDK-Daten ausdrücklich als collected **and shared**.
Bei den zusammengeführten Kategorien **App interactions** und **Diagnostics**
fragt die Console die Zwecke für collected und shared getrennt ab:
**App functionality nur bei collected** auswählen. Für shared gelten dort
nur Advertising or marketing, Analytics sowie Fraud prevention, security,
and compliance aus der Google-SDK-Offenlegung.

² **Required/Optional-Abgrenzung (Inferenz O1):** Fitness ist die Kernfunktion
dieser App, daher hier Required. Ergänzende eigene Notizen/Inhalte und das
Strafkonto sind abwählbar bzw. weglassbar. Wenn die endgültige Play-Oberfläche
eine auf einzelne optionale Funktionen bezogene Frage stellt, den konkreten
Wortlaut beachten; nicht „optional“, nur weil ein Nutzer keinen Satz einträgt.

³ UMP ist kein globaler Ausschalter für jede Datenerhebung. Außerhalb der
Regionen mit Dialog kann `canRequestAds` bereits wahr sein. Deshalb keine
globale Nutzer-Abwahl dieser SDK-Kategorien behaupten. Das Android-SDK
**25.5.0** beschreibt dieselben drei Werbe-/Analyse-/Sicherheitszwecke für die
vier SDK-Gruppen und verwendet TLS. NPA verhindert kein generelles Auslesen
von Kennungen für Messung/Frequenzbegrenzung.
[GMA 25.5.0: offizielle Datensicherheitsangaben](https://developers.google.com/admob/android/privacy/play-data-disclosure?hl=en),
[Android-Anzeigenmodi](https://developers.google.com/admob/android/privacy/ad-serving-modes),
[Android-Kennungen und Privatsphäre](https://developers.google.com/admob/android/privacy/strategies)

⁴ **E1 — bestätigter Produktionsstand und unterschiedliche Definitionen:**
`client_errors` existiert laut direktem Schema-Audit derzeit **nicht**;
`20261021000100_launch_optional.sql` wurde dafür nicht deployed. Der Code
versucht bei angemeldeten Konten trotzdem höchstens fünf POSTs pro Sitzung
mit Fehlertext, Stacktrace, Kontext, App-Pfad und User-Agent. Die fehlende
Tabelle verhindert Speicherung dort, nicht den Übertragungsversuch.

Für **Play** zählt bereits die Übertragung vom Gerät: eigene Crash logs hier
deshalb als collected/required deklarieren, Diagnose/App Functionality
einschließen und keine unbelegte Ephemeral-Ausnahme wählen. Das ist eine
**konservative Formular-Inferenz**, keine Behauptung vorhandener DB-Einträge.
Für **Apple** zählt dagegen eine Verfügbarkeit über die Echtzeit-Anfrage
hinaus. Ohne erfolgreiche Speicherung ist für diese eigenen Berichte keine
solche Aufbewahrung belegt; vorläufig die SDK-Crash-Zeile mit Linked=No
verwenden. Wird die Tabelle aktiviert oder werden Payloads anderweitig
aufbewahrt, eigene Crash Data/Other Diagnostic Data mit Linked=Yes und App
Functionality ergänzen. Es gibt **keinen automatischen 90-Tage-Löschjob**.

### Übergreifende Play-Antworten

| Formularfrage | Antwort |
|---|---|
| Are all user data collected encrypted in transit? | **Yes** nach aktueller Integration: Supabase über HTTPS/WSS, SDK laut Google über TLS. Externe Mailprogramme übernehmen nutzerinitiierte E-Mails; das ist keine Behauptung von Ende-zu-Ende-Verschlüsselung. |
| Account creation methods | **Username and password** / „E-Mail und Passwort“ passend zur vorhandenen Bezeichnung auswählen. E-Mail dient als Anmeldename. Kein OAuth, Social Login, SMS-OTP oder passwortloses Hauptlogin. Ein Wiederherstellungscode macht das normale Login nicht passwortlos. |
| Can users request deletion? | **Yes**: Konto in den App-Einstellungen löschen; zusätzlich E-Mail-Anfrage über die öffentliche Supportseite. |
| Account deletion web URL | `https://noltejonas.github.io/Benny-Joni/support.html` — Browserzugriff ohne Installation/Anmeldung, FAQ „Wie lösche ich mein Konto?“ und Kontakt vorhanden. |
| Data deletion without deleting account | Kein pauschales „Yes, all data“. Einzelne Sätze/Inhalte sind bearbeitbar/löschbar; für eine gesonderte allgemeine Datenlöschung gibt es keinen gleichwertigen automatischen Gesamtprozess. Falls das Formular diese optionale Zusage abfragt: **No** statt eine neue Funktion zu behaupten. |
| Automatic deletion within 90 days | **No**; keine entsprechende allgemeine Regel/Automatik vorhanden. |
| Independent security review / MASA | **No**; keine solche Zertifizierung vorgelegt. |
| End-to-end encryption | **No**; Betreiber/Dienstleister können Daten für den Betrieb verarbeiten. TLS nicht mit E2EE gleichsetzen. |
| Does the app use the advertising ID? | **Yes** für Android. Der tatsächliche Release-Manifest-Merge enthält `AD_ID`; Google kann die ID für Werbung/Messung/Sicherheit verwenden. NPA ist kein Ausschalten dieser Berechtigung. |

Die Kontolöschung entfernt Auth-Konto und zugeordnete App-Datensätze. Der
gehärtete Client entfernt vorher die eigenen Profilfotos über die Storage-API
und prüft erneut, dass der Ordner leer ist. Bei Fehlern oder unbestätigter
Entfernung bricht er vor der Konto-RPC ab. Reale Tests mit einem kleinen
synthetischen Foto und Wegwerfkonten haben Entfernung und Kontokaskade
bestätigt; die SQL-Kaskade alleine löscht keine Storage-Dateien. Backups sind
nicht sofort entfernt. Deshalb keine zusätzliche Zusage „alle Kopien sofort
und ausnahmslos gelöscht“ angeben.
[Google: zulässige Web-/E-Mail-Löschwege](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

## Zielgruppe, Werbung, Health und App-Zugriff

| Bereich | Praktische Antwort für den aktuellen Umfang |
|---|---|
| Play → Contains ads | **Yes**. Banner zählen, auch wenn nicht personalisiert oder derzeit keine Anzeige ausgeliefert wird. |
| Play → Target audience | Zu den bestehenden Bedingungen ab 16 passen **16–17** und **18 and over**. Keine jüngeren Gruppen/„alle Altersgruppen“ auswählen. Das ist die Ableitung aus der bestehenden Zielgruppenvorgabe, keine neu vereinbarte Absenkung. |
| Designed for children / Families | **No** nach vorhandenem Mindestalter und Auftritt. Keine Families-/Kinder-Zertifizierung behaupten. AdMob-Inhaltsfilter „General“ ist kein Altersnachweis. |
| Altersprüfung in der App | **Keine eigenständige technische Altersprüfung** nachgewiesen. Nicht „Age assurance vorhanden“ behaupten, nur weil Bedingungen ab 16 gelten. |
| Apple-Altersfragebogen / Play-IARC | **User-generated content: Yes**; Nutzer können über Namen/Notizen/Reaktionen Inhalte füreinander sichtbar machen. Falls nach Nutzerkommunikation gefragt wird, diese Möglichkeiten berücksichtigen, obwohl kein freier Direktchat existiert. Keine feste resultierende Altersstufe vorhersagen; der jeweilige Fragebogen berechnet sie. |
| Health apps declaration | **Activity and Fitness** auswählen. Die App speichert manuell eingegebene Trainingsaktivität/Workouts. Nicht „no health features“, nur weil sie keine Sensoren liest. |
| Medical / research features | Keine Diagnosen, Behandlung, klinischen Entscheidungen, Medikamentenverwaltung, Forschung oder Medizinprodukte-Funktion im aktuellen Umfang. Diese zusätzlichen Health-Bereiche nicht auswählen. |
| Health Connect / HealthKit access | **No**. „Fitness info“ bleibt wegen manueller Trainingseinträge trotzdem Yes. |
| Finanz-/Zahlungsfunktionen | Keine Zahlungsabwicklung, keine Bankdaten, keine In-App-Käufe/Abos. Strafkonto als private Betragsliste im Datenschutz trotzdem offenlegen. Keine Glücksspiel-Lizenz oder pauschale juristische Einordnung erfinden. |
| App access / Review access | **All or some functionality is restricted**: echtes Konto/Passwort erforderlich. Den privaten Review-Zugang und Challenge-Code aus der ignorierten `.env` in den vorgesehenen Store-Feldern einsetzen, nicht in diese öffentliche Datei. |

Quellen: [Play-Zielgruppe](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en),
[Health-Formular](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en),
[Apple App Privacy verwalten](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).

## Nachvollziehbare Codegrundlage

| Quelle im Repository | Was geprüft wurde |
|---|---|
| `www/data.js` | Supabase Auth/Profile/Trainings-/Strafkonto-Daten, Ranglistenmeldungen/Blocklisten, Foto-Upload/-Löschversuch, kontogebundene Fehlerberichte. |
| `www/onboarding.jsx`, `www/onboarding-model.js` | E-Mail/Passwort, Pflicht-Anzeigename, optionales Foto, Rechts-/Support-Links. |
| `www/app.jsx` | iOS-Push-Token mit Plattform `ios`, Funktionsfortschritt, Ads-Sichtbarkeit. |
| `www/ads.js` | `npa: true`, UMP-`canRequestAds`, keine Übergabe von Trainings-/Kontodaten, Banner. |
| `ios/App/App/AppDelegate.swift` | iOS: Publisher-first-party-ID vor SDK-Initialisierung ausgeschaltet. |
| `android/app/src/main/java/com/bennyjoni/terminator/MainActivity.java`, `AdPrivacyPlugin.java`, `www/ads.js` | Android: `MainActivity` registriert das lokale Plugin; nach dem von UMP freigegebenen `AdMob.initialize()` deaktiviert dessen Bridge die Publisher-first-party-ID. Anzeigenanfragen erst nach bestätigter Persistierung. |
| `ios/App/App/PrivacyInfo.xcprivacy` | Eigenes App-Manifest; ersetzt weder Store-Fragebogen noch SDK-Manifeste. |
| `ios/App/.../swiftpm/Package.resolved`, eingebundene Google-Framework-Manifeste | GMA 13.11.0, UMP 3.1.0; tatsächliche SDK-Datentypen/Linked-/Tracking-Deklaration. |
| `android/variables.gradle`, Release-Manifest-Merge | GMA 25.5.0 und Android-AD_ID. |
| `supabase/migrations/20261021000010_delete_account.sql` | Kontokaskade, Challenge-Verlassen, Sonderfall der alten migrierten Challenge. |
| `supabase/migrations/20261021000100_launch_optional.sql` | Eigene Fehlerbericht-Tabelle E1; keine feste automatische Löschfrist. |

Diese Ausfüllhilfe ändert weder Code noch die veröffentlichten Rechtstexte.
Bei SDK-, Datenfluss- oder Zielgruppenänderungen die jeweiligen Antworten
aktualisieren, statt diese Fassung unverändert für spätere Releases zu verwenden.
