# Sprachen

Die App gibt es auf Deutsch und Englisch. Deutsch ist die Quellsprache: Texte stehen
deutsch im Code und sind zugleich der Schlüssel für jede Übersetzung.

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

Datum, Zahlen und Euro folgen der Region des Geräts, wenn dessen Sprache zur App-Sprache
passt (`en-US` → 12-Stunden-Uhr), sonst `de-DE` bzw. `en-GB`.

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
  IDs, Logs und die Marke „Projekt Terminator“. Ausnahme: Die Standard-Übungen
  (`competition_id` leer) übersetzt `PTData.localizeCategory` beim Laden.
- Absichtlich deutscher Text bekommt einen Kommentar mit `i18n-ignore`.

Neue Texte brauchen einen Eintrag in `www/i18n/en.js`. Fehlt er, steht in der App der
deutsche Text und der Test schlägt fehl.

## Prüfen

```bash
node --test tests/
node tools/i18n-check.cjs
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
7. Push: Texte in `supabase/functions/notify-set/index.ts` (`TEXT`) ergänzen.

## Push-Mitteilungen

Die App meldet ihre Sprache in `profiles.language` (Migration
`20261021000000_profile_language.sql`, nur wenn die Spalte existiert). `notify-set`
schreibt die Rivalen-Mitteilung in der Sprache der Empfänger; ohne Eintrag Deutsch.

Nicht in diesem Repo: die E-Mail-Vorlagen von Supabase Auth (Bestätigungsmail) und die
App-Store-Texte.
