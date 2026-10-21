# Store-Eintrag „Benny & Joni“ (Version 1.4, Deutsch und Englisch)

Alles, was in App Store Connect für die erste Einreichung eingetragen wird.
Die Texte liegen maschinenlesbar unter `ios/App/fastlane/metadata/`. **Diese
Dateien sind die Quelle.** Ändert ihr einen Text, dann dort, und danach den
Längen-Check unten laufen lassen.

Stand: Entscheidungen der Nacht zum 21.10.2026 (Name „Benny & Joni“, keine
Werbung in V1, nur iPhone, DE/AT/CH), ergänzt am 21.10. morgens: Die App gibt
es auf **Deutsch und Englisch** (folgt der Gerätesprache, umstellbar unter
Einstellungen → App → Sprache; siehe `docs/SPRACHEN.md`). Weicht eine
Entscheidung ab, müssen die markierten Stellen mitgeändert werden.

## 1. Texte (Deutsch, Pflicht)

| Feld in App Store Connect | Wert | Datei | Limit |
|---|---|---|---|
| Name | `Benny & Joni: Fitness-Duell` | `de-DE/name.txt` | 27/30 |
| Untertitel | `Trainier gegen deine Freunde` | `de-DE/subtitle.txt` | 28/30 |
| Werbetext | Ein Wochenziel, jeder seinen Teil: Fordere deine Freunde heraus, trag jeden Satz ein und sieh live, wer liefert. Kostenlos und ohne Tracking. | `de-DE/promotional_text.txt` | 141/170 |
| Beschreibung | Datei öffnen und komplett kopieren | `de-DE/description.txt` | 1509/4000 |
| Schlüsselwörter | `Liegestütze,Klimmzüge,Kniebeugen,Calisthenics,Challenge,Wochenziel,Workout,Wettkampf,Sport,Gruppe` | `de-DE/keywords.txt` | 97/100 |
| Neuerungen | Text für 1.4.1 (Werbebanner, Einwilligung) | `de-DE/release_notes.txt` | 387/4000 |
| Datenschutz-URL | https://noltejonas.github.io/Benny-Joni/datenschutz.html | `de-DE/privacy_url.txt` | |
| Support-URL | https://noltejonas.github.io/Benny-Joni/support.html | `de-DE/support_url.txt` | |
| Marketing-URL | https://noltejonas.github.io/Benny-Joni/ | `de-DE/marketing_url.txt` | |
| Copyright | `2026 <Name bzw. GbR wie im Impressum>` | `copyright.txt` | Platzhalter! |

Regeln, die der Check prüft: Schlüsselwörter ohne Leerzeichen nach den
Kommas, keine Wörter aus Name oder Untertitel (die zählt Apple ohnehin), keine
Dubletten. Umlaute zählen wir vorsichtshalber als 2 Byte, damit es auf keinen
Fall über 100 geht.

**Falls der Name im Store schon vergeben ist:** `Benny & Joni – Fitness-Duell`
oder `Benny & Joni: Trainings-Duell`. Dann `name.txt` anpassen; in der App
bleibt `PTOnboarding.APP_NAME = 'Benny & Joni'` gleich, der Homescreen-Name
(`CFBundleDisplayName`) auch.

## 1b. Englische Store-Seite (en-GB, optional, empfohlen)

Die App selbst ist zweisprachig, deshalb gibt es die Store-Texte auch auf
Englisch. In den Storefronts Deutschland, Österreich und Schweiz heißt
Englisch in App Store Connect **„Englisch (Vereinigtes Königreich)“**; dieselbe
Variante wie in der App (British English). Wer ein iPhone auf Englisch nutzt,
sieht dann die englische Store-Seite, alle anderen die deutsche. Die Liste
„Sprachen“ im Store (Deutsch, Englisch) kommt automatisch aus dem Build.

| Feld in App Store Connect | Wert | Datei | Limit |
|---|---|---|---|
| Name | `Benny & Joni: Fitness Duel` | `en-GB/name.txt` | 26/30 |
| Untertitel | `Train against your friends` | `en-GB/subtitle.txt` | 26/30 |
| Werbetext | One weekly goal, everyone does their share: challenge your friends, log every set and see live who’s delivering. Free and ad-free. | `en-GB/promotional_text.txt` | 130/170 |
| Beschreibung | Datei öffnen und komplett kopieren | `en-GB/description.txt` | 1421/4000 |
| Schlüsselwörter | `push-ups,pull-ups,squats,calisthenics,challenge,weekly goal,workout,competition,sport,group,reps` | `en-GB/keywords.txt` | 96/100 |
| Neuerungen | wie Deutsch: erst ab 1.4.1 sichtbar | `en-GB/release_notes.txt` | 144/4000 |
| Datenschutz-, Support-, Marketing-URL | dieselben wie Deutsch (die Seiten sind deutsch; Support hat einen englischen Absatz zur Sprache) | `en-GB/*_url.txt` | |

Eintragen von Hand: Version 1.4 → oben rechts Sprachauswahl → „Englisch
(Vereinigtes Königreich)“ hinzufügen → Felder aus `en-GB/*.txt` kopieren.
Screenshots: Ohne eigene englische Screenshots zeigt App Store Connect die
deutschen; das ist erlaubt. Englische Screenshots (Demo bei englischem
iPhone aufnehmen) können mit 1.4.1 nachkommen.

**fastlane:** `bundle exec fastlane release` lädt jeden Sprachordner unter
`ios/App/fastlane/metadata/` hoch, also auch `en-GB`. Wer heute keine
englische Store-Seite will, verschiebt den Ordner vor dem Lauf aus
`metadata/` heraus.

Ohne englische Store-Seite funktioniert die App trotzdem auf Englisch; nur
der Store-Text bleibt dann deutsch.

### Längen-Check (vom Repo-Root aus)

Prüft alle Sprachordner (`de-DE`, `en-GB`, …):

```bash
node -e '
const fs = require("fs"), base = "ios/App/fastlane/metadata/";
const limits = { name: 30, subtitle: 30, promotional_text: 170, keywords: 100, description: 4000, release_notes: 4000 };
let ok = true;
for (const lang of fs.readdirSync(base).filter(d => /^[a-z]{2}-[A-Z]{2}$/.test(d)).sort()) {
  const read = f => fs.readFileSync(base + lang + "/" + f + ".txt", "utf8").trim();
  console.log("── " + lang);
  for (const [f, max] of Object.entries(limits)) {
    const text = read(f), n = [...text].length, bytes = Buffer.byteLength(text);
    const bad = n > max || (f === "keywords" && bytes > max);
    if (bad) ok = false;
    console.log((bad ? "ZU LANG " : "ok      ") + f.padEnd(17) + n + "/" + max + " Zeichen" + (f === "keywords" ? ", " + bytes + " Byte" : ""));
  }
  const words = s => s.toLowerCase().split(/[^a-zäöüß0-9]+/).filter(Boolean);
  const taken = new Set([...words(read("name")), ...words(read("subtitle"))]);
  const kw = read("keywords").split(",");
  const clash = kw.filter(k => words(k).some(w => taken.has(w)));
  if (clash.length) { ok = false; console.log("Keywords wiederholen Name/Untertitel: " + clash.join(", ")); }
  if (kw.some(k => k !== k.trim() || !k)) { ok = false; console.log("Keywords: keine Leerzeichen nach Kommas, keine leeren Einträge"); }
  if (new Set(kw.map(k => k.toLowerCase())).size !== kw.length) { ok = false; console.log("Keywords doppelt"); }
  for (const f of ["privacy_url", "support_url", "marketing_url"]) {
    if (!/^https:\/\//.test(read(f))) { ok = false; console.log(f + ": muss mit https:// beginnen"); }
  }
}
console.log(ok ? "Alle Limits eingehalten." : "Bitte kürzen bzw. korrigieren.");
process.exit(ok ? 0 : 1);
'
```

Ergebnis am 21.10.2026 (Deutsch 02:00, Englisch morgens ergänzt):

```
── de-DE
ok      name             27/30 Zeichen
ok      subtitle         28/30 Zeichen
ok      promotional_text 140/170 Zeichen
ok      keywords         97/100 Zeichen, 99 Byte
ok      description      1445/4000 Zeichen
ok      release_notes    149/4000 Zeichen
── en-GB
ok      name             26/30 Zeichen
ok      subtitle         26/30 Zeichen
ok      promotional_text 130/170 Zeichen
ok      keywords         96/100 Zeichen, 96 Byte
ok      description      1421/4000 Zeichen
ok      release_notes    144/4000 Zeichen
Alle Limits eingehalten.
```

## 2. App-Informationen und Version

| Wo | Was eintragen |
|---|---|
| App-Informationen → Primäre Sprache | **Deutsch**. Steht hier Englisch, verlangt App Store Connect zusätzlich englische Texte für die Hauptsprache. Englisch kommt als zweite Lokalisierung dazu (Abschnitt 1b). |
| App-Informationen → Kategorie | Primär **Gesundheit und Fitness** (`primary_category.txt`). Sekundär: leer lassen oder „Sport“. |
| App-Informationen → Inhaltsrechte | „Enthält die App Inhalte Dritter?“ **Ja** (Fotos und Texte der Nutzer). „Hast du die Rechte?“ **Ja**. |
| App-Informationen → Altersfreigabe | Fragebogen nach Abschnitt 3, am Ende auf **16+** überschreiben. |
| App-Datenschutz | Nach Abschnitt 4. Datenschutz-URL siehe oben. |
| Preise und Verfügbarkeit | Preis **0 € (Kostenlos)**. Länder: **Deutschland, Österreich, Schweiz** (Empfehlung für heute, siehe Abschnitt 5). |
| Version | **1.4** anlegen bzw. die vorbereitete „1.0“ umbenennen. Muss zu `MARKETING_VERSION = 1.4` passen, nicht auf 1.0 zurückgehen. |
| Version → Build | Den neuen Build wählen (Build-Nummer ab 20). |
| Version → Verschlüsselung | Beantwortet die Info.plist (`ITSAppUsesNonExemptEncryption = false`), keine Frage mehr. |
| Version → Screenshots | Aus Schritt 11a in `MORGEN.md` (am Gerät bzw. in Chrome aufgenommen, als JPG ohne Alphakanal). Pflicht ist „iPhone mit Dynamic Island (mittel)“: 1206×2622 oder 1179×2556, 1 bis 10 Bilder. Größere Formate sind optional. Keine iPad-Screenshots: die App ist nur fürs iPhone. |
| Version → App-Prüfung | Login und Notizen aus `docs/launch/REVIEW_NOTES.md`. Zugangsdaten nur dort, nie im Repo. |
| Version → Veröffentlichung | **„Diese Version manuell veröffentlichen“**. |

## 3. Altersfreigabe-Fragebogen

App Store Connect → App-Informationen → Altersfreigabe → Bearbeiten. Die
Fragen heißen je nach Stand leicht anders; maßgeblich ist, was die App kann.

| Bereich | Frage | Antwort | Warum |
|---|---|---|---|
| Funktionen | Elterliche Kontrollen | Nein | Gibt es nicht. |
| Funktionen | Altersprüfung (Age Assurance) | Nein | Gibt es nicht; Mindestalter 16 steht in den Nutzungsbedingungen. |
| Funktionen | Uneingeschränkter Webzugriff | Nein | Die App öffnet nur unsere Rechtsseiten in Safari, keinen eigenen Browser. |
| Funktionen | Von Nutzern erstellte Inhalte | **Ja** | Anzeigenamen, Profilfotos, Challenge-Namen, Notizen, Reaktionen. Nur in geschlossenen Gruppen per Code, mit Melden und Blockieren. |
| Funktionen | Nachrichten und Chat | **Ja** | Es gibt keinen Chat, aber Notizen an Sätzen sind für die Gruppe sichtbar. „Ja“ ergibt 4+ und ist unschädlich. |
| Funktionen | Social Media | Nein | Nur geschlossene Gruppen per Einladungscode, keine Entdeckung, keine öffentliche Verbreitung (sonst 13+, wegen 16+ ohne Folgen). |
| Funktionen | Werbung | Nein | Kein Werbe-SDK in V1. **Ab 1.4.1 mit AdMob: Ja.** |
| Reife Themen | Vulgäre Sprache, Horror, Alkohol/Tabak/Drogen | Keine | |
| Medizin/Wellness | Medizinische oder Behandlungsinformationen | Keine | Keine medizinischen Inhalte. |
| Medizin/Wellness | Gesundheits- oder Wellness-Themen | **Ja** | Wochenziele und Übungsmengen. Apple zählt Übungsempfehlungen ausdrücklich dazu (9+). |
| Sexualität/Nacktheit | alle Fragen | Keine | |
| Gewalt | alle Fragen, auch Waffen | Keine | |
| Zufall | Simuliertes Glücksspiel | Keine | |
| Zufall | Glücksspiel mit echtem Geld | Nein | Das Strafkonto ist nur eine Liste, die App bewegt kein Geld. |
| Zufall | Wettbewerbe (Contests) | **Häufig** | Duelle, Rangliste und Wochenziele sind der Kern der App. Apple zählt Sport- und Fitness-Wettbewerbe um Ranglisten und persönliche Ziele ausdrücklich dazu, auch ohne Preise. |
| Zufall | Lootboxen | Nein | |

Errechnet: 13+ (Wettbewerbe häufig). **Unter „Altersgruppen und
Überschreibung“ → „Auf höhere Altersfreigabe überschreiben“ → 16+ wählen.**
Das ist Pflicht, weil die Nutzungsbedingungen 16 Jahre verlangen (Apple: „you
must override“, wenn eine Altersgrenze in den Nutzungsbedingungen über der
errechneten Stufe liegt). Ab 1.4.1 mit AdMob: Werbung Ja.

## 4. App-Datenschutz („Datenschutzetiketten“)

App Store Connect → App-Datenschutz → Loslegen → „Ja, wir erheben Daten“.
Gilt für V1 **ohne** Werbe-SDK. Für jeden Datentyp gilt, wenn nicht anders
genannt: **Zweck App-Funktionalität · mit der Identität verknüpft · kein
Tracking.**

| Kategorie | Datentyp | Erheben? | Was genau |
|---|---|---|---|
| Kontaktinformationen | E-Mail-Adresse | **Ja** | Login und Passwort-Reset |
| Kontaktinformationen | Name | **Ja** | Anzeigename (für andere sichtbar) |
| Kontaktinformationen | Telefonnummer, Adresse, andere | Nein | |
| Gesundheit und Fitness | Fitness | **Ja** | Sätze, Wiederholungen, Workouts |
| Gesundheit und Fitness | Gesundheit | Nein | keine Körper- oder Gesundheitswerte |
| Finanzinformationen | Andere Finanzinformationen | **Ja** (vorsichtig) | Strafkonto-Beträge und Einzahlungen unter Freunden. Keine Zahlungsdaten. |
| Finanzinformationen | Zahlungsinformationen, Kreditwürdigkeit | Nein | |
| Nutzerinhalte | Fotos oder Videos | **Ja** | Profilfoto |
| Nutzerinhalte | Andere Nutzerinhalte | **Ja** | Challenge-Namen, Notizen, Reaktionen, eigene Übungen, Work-Tracking |
| Nutzerinhalte | E-Mails oder Textnachrichten, Audio, Gameplay | Nein | kein Chat |
| Kennungen | Nutzer-ID | **Ja** | Konto-ID |
| Kennungen | Geräte-ID | **Ja** | Push-Token (passend zum PrivacyInfo.xcprivacy aus dem iOS-Paket) |
| Nutzungsdaten | Produktinteraktion, Werbedaten | Nein | keine Analyse, keine Werbung |
| Diagnose | Absturzdaten, Leistungsdaten | Nein | kein Crash-SDK |
| Diagnose | Sonstige Diagnosedaten | Nein (V1) | **Ja**, sobald die Tabelle `client_errors` eingespielt ist (optionale Migration nach dem Launch) |
| Standort, Kontakte, Browserverlauf, Suchverlauf, Sensible Daten, Käufe | | Nein | |

„Daten, die zum Tracking verwendet werden“: **keine**. Die App fragt nicht nach
App-Tracking-Transparenz.

**Ab 1.4.1 mit AdMob** (dieser Branch) kommen die Angaben aus
`docs/launch/ADMOB.md`, Abschnitt 11, dazu. Erst eintragen, wenn 1.4.1
eingereicht wird; die Tabelle oben bleibt der Stand für 1.4.

## 5. Verfügbarkeit und Zielgruppe

- Nur iPhone (iPad ist im Projekt abgeschaltet).
- App auf Deutsch und Englisch: automatisch nach Gerätesprache (andere
  Sprachen → Englisch), umstellbar in der App. iOS-Rückfragen (Kamera, Fotos,
  Tracking-Absicherung) ebenfalls in beiden Sprachen.
- Kostenlos, keine In-App-Käufe. Ab 1.4.1 Werbebanner (AdMob) in Feed und Stats.
- Android gibt es zum Start nicht. Im Marketing „fürs iPhone“ sagen.

**Länder: Empfehlung für heute DE, AT, CH lassen.** Breiter geht technisch
sofort (Preise und Verfügbarkeit → weitere Länder), aber:

- Datenschutzerklärung, Nutzungsbedingungen und Impressum gibt es nur auf
  Deutsch. Für Nutzer außerhalb des deutschen Sprachraums sollten mindestens
  Datenschutz und Nutzungsbedingungen auch auf Englisch vorliegen.
- Die Nutzungsbedingungen (Rechtswahl, Verbraucherschutz) und der Support
  sind auf DE/AT/CH ausgelegt; der DSA-Händlerstatus deckt die EU ab.
- Ein Länderwechsel braucht keinen neuen Build und keine neue Prüfung. Er
  geht also jederzeit nach dem Launch.

Vorschlag danach (z. B. mit 1.4.1): englische Rechtstexte unter
`docs/launch/site/en/`, dann weitere EU-Länder und Vereinigtes Königreich
freischalten (en-GB passt dort schon). Für die USA eine eigene Lokalisierung
„Englisch (USA)“ anlegen (Texte aus `en-GB/` kopieren, „mates“ → „friends“).
