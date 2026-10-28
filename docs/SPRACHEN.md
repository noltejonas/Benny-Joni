# Sprachen

Der Quellstand unterstützt Deutsch, Englisch, Finnisch (`fi`, Suomi) und
Schwedisch (`sv`, Svenska). Finnisch und Schwedisch wurden am 28. Oktober 2026
ergänzt. Sie sind in den geprüften Artefakten **1.5.2** (iOS Build 31,
Android Version Code 6, Quellstand `94e8a84`) enthalten. Apple bestätigt
für 1.5.2 `WAITING_FOR_REVIEW` und Build 31 `VALID`, Veröffentlichung
`AFTER_APPROVAL`. Bei Google sind der interne Entwurf mit Code 6 und das
Bundle in der Bibliothek gültig. Der Produktionsentwurf hat noch kein
zugeordnetes Bundle und keine Neuerungen; die Produktion wurde noch nicht
eingereicht. Das Servicekonto erhält dort HTTP 403, die native
Computersteuerung übernimmt Eingaben nicht zuverlässig. Für die Fortsetzung
in der geöffneten Play Console im In-App-Browser steht die Nutzeranmeldung
aus. Eine Veröffentlichung ist noch nicht bestätigt. Details und
Submission-Beleg: [RELEASE.md](launch/RELEASE.md).
Deutsch ist die Quellsprache: Texte stehen deutsch im Code und sind zugleich
der Schlüssel für jede Übersetzung.

## Wie die Sprache gewählt wird

1. Einstellung in der App (Einstellungen → App → Sprache), gespeichert in `localStorage`
   unter `pt:lang`.
2. Sonst die Gerätesprache (`navigator.languages`). Unterstützt das Gerät keine der
   App-Sprachen, gilt Englisch.

Die Sprache steht beim Laden fest; ein Wechsel lädt die App neu. Damit iOS der WebView
die Gerätesprache meldet, nennt `ios/App/App/Info.plist` die Sprachen in
`CFBundleLocalizations` (dadurch gibt es in den iOS-Einstellungen der App auch einen
Punkt „Sprache“). Die iOS-Rückfragen für Kamera und Fotos stehen in
`ios/App/App/<sprache>.lproj/InfoPlist.strings`.

`CFBundleDevelopmentRegion` (Info.plist) und `developmentRegion` (Xcode-Projekt) sind
`en`: Läuft das iPhone in einer Sprache, die die App nicht hat (z. B. Französisch),
wählt iOS die Entwicklungsregion. Dann sind WebView, Systemdialoge (Mitteilungen
erlauben, Fotoauswahl, Kopieren/Einsetzen) und die App einheitlich englisch, wie
`FALLBACK = 'en'` in `www/i18n.js`. Auf deutschen Geräten bleibt alles deutsch.

Datum, Zahlen und Euro folgen der Region des Geräts, wenn dessen Sprache zur App-Sprache
passt (`en-US` → 12-Stunden-Uhr, `sv-FI` → schwedische Formate für Finnland),
sonst `de-DE`, `en-GB`, `fi-FI` beziehungsweise `sv-SE`.

## Texte schreiben

`www/i18n.js` stellt überall bereit:

```js
tr('Einstellungen')
tr('Noch {n} offen', { n })
tr('Mit {name} trainieren', { name: <b>{x}</b> })   // JSX in Platzhaltern
trn(n, '{n} Satz', '{n} Sätze')                      // Einzahl/Mehrzahl
trc('Arbeit', 'Tag')                                 // gleiches Wort, andere Bedeutung
PTi18n.date(d, opts), PTi18n.day(iso, opts), PTi18n.time(d), PTi18n.number(n), PTi18n.euro(cents), PTi18n.weekdays()
```

Regeln:

- Immer ganze Sätze mit Platzhaltern, nie Bruchstücke zusammensetzen — im Englischen
  stehen die Teile oft anders.
- Schlüssel müssen feste Texte sein (`tr(variable)` geht nicht).
- Nicht übersetzt werden Werte aus der Datenbank (Namen, Challenge-Namen, eigene Übungen),
  IDs, Logs und die Marke „Benny & Joni“. Ausnahme: Die Standard-Übungen
  (`competition_id` leer) übersetzt `PTData.localizeCategory` beim Laden.
- Absichtlich deutscher Text bekommt einen Kommentar mit `i18n-ignore`.

Neue Texte brauchen einen Eintrag in `www/i18n/en.js`, `fi.js` und `sv.js`. Fehlt er, steht in der App der
deutsche Text und der Test schlägt fehl. Das gilt auch nach dem Launch unverändert für
jede neue Funktion: Text deutsch in `tr()`/`trn()`/`trc()` schreiben, passenden Eintrag
in allen drei Wörterbüchern ergänzen (Englisch: British English und typografischer
Apostroph ’; überall gleiche Platzhalter). Die Tests prüfen alle Wörterbücher.

## Prüfen

```bash
node --test tests/
node tools/i18n-check.cjs
node tools/i18n-check.cjs --lang fi
node tools/i18n-check.cjs --lang sv
```

`tests/i18n.test.cjs` (über `tools/i18n-check.cjs`) findet fehlende Einträge, falsche
Platzhalter, verwaiste Einträge und deutschen Text ohne `tr()`. Die Erkennung von
deutschem Text ist eine Heuristik; Fehlalarme mit `i18n-ignore` markieren.

## Neue Sprache hinzufügen (Beispiel Französisch)

1. In `www/i18n.js` bei `LANGUAGES` eintragen: `{ code: 'fr', name: 'Français', locale: 'fr-FR' }`
   und bei `WEEKDAYS` die kurzen Wochentage ergänzen.
2. Vorlage erzeugen und übersetzen:
   `node tools/i18n-check.cjs --lang fr --todo > fr.json`
3. `www/i18n/fr.js` anlegen (Aufbau wie `en.js`: `PTi18n.add('fr', { … })`) und in
   `www/index.html` nach `i18n/en.js` laden.
4. Mehrzahl: Einträge für `trn` haben die Formen, die `Intl.PluralRules('fr')` kennt
   (`one`, `many`, `other` …).
5. `node tools/i18n-check.cjs --lang fr` muss „alles übersetzt“ melden.
6. iOS: `fr` in `CFBundleLocalizations` (Info.plist), `fr.lproj/InfoPlist.strings`
   anlegen und in Xcode der Variantengruppe `InfoPlist.strings` hinzufügen.
7. Push: in `supabase/functions/_shared/push-rules.ts` bei `PushLang`, `PUSH_TEXT`,
   `STANDARD_CATEGORY_NAMES` und `RANKING_TEXT` ergänzen, Test in
   `tests/push-rules.test.mjs` erweitern. Die betroffenen produktiven Functions
   (`notify-set`, `ranking-push`) neu deployen. `daily-nudge` ist nur im Quellstand
   vorhanden; eine erstmalige Einführung benötigt eine eigene Konfiguration.
8. Optional eine eigene Store-Lokalisierung ergänzen: Ordner
   `ios/App/fastlane/metadata/fr-FR/` wie `en-GB/` anlegen (Limits mit dem
   Längen-Check aus `docs/launch/STORE_LISTING.md` prüfen). Die Länderfreigabe
   wird in jedem Store separat verwaltet und benötigt keine Übersetzung.

## Push-Mitteilungen

Die App meldet ihre Sprache in `profiles.language` (Migration
`20261021000000_profile_language.sql`, nur wenn die Spalte existiert).
Produktiv deployt und am 28. Oktober 2026 geprüft sind `notify-set` Version 15
(Rivale, Beitritt, Reaktion, Überholen, Ziel erfüllt), `ranking-push` Version 9
(Wochenrangliste und Monatsabschluss als Rückfall) sowie `kick-teammate`
Version 1. Sie unterstützen Deutsch, Englisch, Finnisch und Schwedisch.
Ohne Eintrag, ohne Spalte oder bei einer Sprache ohne Push-Texte gilt Deutsch.
Die Texte stehen in `supabase/functions/_shared/push-rules.ts` (`PUSH_TEXT`,
`RANKING_TEXT`); Standard-Übungen übersetzt `localizedCategoryName` wie
`PTData.localizeCategory` in der App.

`daily-nudge` (Tageserinnerung, „Letzte Chance“) enthält ebenfalls finnische
und schwedische Texte im Quellstand, ist produktiv aber nicht eingerichtet
oder deployt. Für dieses Update wurden keine neuen Erinnerungs-Cronjobs
angelegt. Die vorhandene APNs-Zustellung unterstützt iOS; Android und Web
haben noch keine Push-Zustellung.

Manuelle Arschkicks verwenden `supabase/functions/_shared/kick.ts` mit je drei
festen Sprüchen auf Deutsch, Englisch, Finnisch und Schwedisch. Neue Sprachen
dort ebenfalls ergänzen und `kick-teammate` deployen. Empfänger können diese
Mitteilungen kontoweit über `profiles.kick_enabled` abschalten. Die benötigte
Migration ist produktiv angewendet. Deployment- und Migrationsbelege stehen
im aktuellen Update-Abschnitt von [RELEASE.md](launch/RELEASE.md).

## App Store

Die Store-Texte liegen in `ios/App/fastlane/metadata/de-DE/` (Hauptsprache) und
`ios/App/fastlane/metadata/en-GB/` (Englisch, Vereinigtes Königreich). Details:
`docs/launch/STORE_LISTING.md`.

Nicht in diesem Repo: die E-Mail-Vorlage von Supabase Auth für den Passwort-Code (kennt
die App-Sprache nicht, deshalb zweisprachig, siehe `docs/launch/MORGEN.md` Schritt 8).
Die Rechtstexte unter `docs/launch/site/` gibt es bisher nur auf Deutsch.
