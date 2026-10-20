# Store-Eintrag „Benny & Joni“ (Version 1.4, Deutsch)

Alles, was in App Store Connect für die erste Einreichung eingetragen wird.
Die Texte liegen maschinenlesbar unter `ios/App/fastlane/metadata/`. **Diese
Dateien sind die Quelle.** Ändert ihr einen Text, dann dort, und danach den
Längen-Check unten laufen lassen.

Stand: Entscheidungen der Nacht zum 21.10.2026 (Name „Benny & Joni“, keine
Werbung in V1, nur iPhone, nur Deutsch, DE/AT/CH). Weicht eine Entscheidung
ab, müssen die markierten Stellen mitgeändert werden.

## 1. Texte

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

### Längen-Check (vom Repo-Root aus)

```bash
node -e '
const fs = require("fs"), dir = "ios/App/fastlane/metadata/de-DE/";
const read = f => fs.readFileSync(dir + f + ".txt", "utf8").trim();
const limits = { name: 30, subtitle: 30, promotional_text: 170, keywords: 100, description: 4000, release_notes: 4000 };
let ok = true;
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
console.log(ok ? "Alle Limits eingehalten." : "Bitte kürzen bzw. korrigieren.");
process.exit(ok ? 0 : 1);
'
```

Ergebnis am 21.10.2026, 02:00:

```
ok      name             27/30 Zeichen
ok      subtitle         28/30 Zeichen
ok      promotional_text 140/170 Zeichen
ok      keywords         97/100 Zeichen, 99 Byte
ok      description      1445/4000 Zeichen
ok      release_notes    149/4000 Zeichen
Alle Limits eingehalten.
```

## 2. App-Informationen und Version

| Wo | Was eintragen |
|---|---|
| App-Informationen → Primäre Sprache | **Deutsch**. Steht hier Englisch, verlangt App Store Connect zusätzlich englische Texte. |
| App-Informationen → Kategorie | Primär **Gesundheit und Fitness** (`primary_category.txt`). Sekundär: leer lassen oder „Sport“. |
| App-Informationen → Inhaltsrechte | „Enthält die App Inhalte Dritter?“ **Ja** (Fotos und Texte der Nutzer). „Hast du die Rechte?“ **Ja**. |
| App-Informationen → Altersfreigabe | Fragebogen nach Abschnitt 3. |
| App-Datenschutz | Nach Abschnitt 4. Datenschutz-URL siehe oben. |
| Preise und Verfügbarkeit | Preis **0 € (Kostenlos)**. Länder: nur **Deutschland, Österreich, Schweiz**. |
| Version | **1.4** anlegen bzw. die vorbereitete „1.0“ umbenennen. Muss zu `MARKETING_VERSION = 1.4` passen, nicht auf 1.0 zurückgehen. |
| Version → Build | Den neuen Build wählen (Build-Nummer ab 20). |
| Version → Verschlüsselung | Beantwortet die Info.plist (`ITSAppUsesNonExemptEncryption = false`), keine Frage mehr. |
| Version → Screenshots | `docs/launch/screenshots/iphone-6.3/` (1206×2622) bzw. `iphone-6.9/` (1320×2868), je nachdem, welche Größe App Store Connect als Pflicht anzeigt. Keine iPad-Screenshots: die App ist nur fürs iPhone. |
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
| Funktionen | Nachrichten und Chat | Nein | Es gibt keinen Chat. Notizen hängen nur an Sätzen. |
| Funktionen | Werbung | Nein | Kein Werbe-SDK in V1. **Ab 1.4.1 mit AdMob: Ja.** |
| Reife Themen | Vulgäre Sprache, Horror, Alkohol/Tabak/Drogen | Keine | |
| Medizin/Wellness | Medizinische oder Behandlungsinformationen | Keine | Keine medizinischen Inhalte. |
| Medizin/Wellness | Gesundheits- oder Wellness-Themen | Keine | Die App zeigt keine Gesundheitsinhalte, nur selbst eingetragene Übungszahlen. Nennt App Store Connect Fitness-Tracking ausdrücklich als Beispiel: ehrlich „Ja/Selten“ wählen. |
| Sexualität/Nacktheit | alle Fragen | Keine | |
| Gewalt | alle Fragen, auch Waffen | Keine | |
| Zufall | Simuliertes Glücksspiel | Keine | |
| Zufall | Glücksspiel mit echtem Geld | Nein | Das Strafkonto ist nur eine Liste, die App bewegt kein Geld. |
| Zufall | Wettbewerbe (Contests) | Keine | Es gibt keine Preise; Duelle unter Freunden ohne Gewinn. |
| Zufall | Lootboxen | Nein | |

Erwartete Stufe: 4+. Optional könnt ihr eine höhere Stufe wählen (z. B. passend
zum Mindestalter 16). Empfehlung: die errechnete Stufe übernehmen, das
Mindestalter regeln die Nutzungsbedingungen.

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
- Nur Deutsch, Länder DE, AT, CH.
- Kostenlos, keine In-App-Käufe. Ab 1.4.1 Werbebanner (AdMob) in Feed und Stats.
- Android gibt es zum Start nicht. Im Marketing „fürs iPhone“ sagen.
