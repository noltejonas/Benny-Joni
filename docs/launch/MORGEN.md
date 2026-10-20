# Launch-Morgen 21.10.2026 – was ihr tun müsst

Ziel: **bis 09:00 eingereicht**, um 12:00 veröffentlichen, **falls** Apple
bis dahin freigegeben hat. Erst-Einreichungen dauern meist 24–48 h. Eine
Freigabe bis 12:00 klappt nur mit Glück und beschleunigter Prüfung. Deshalb:
manuell veröffentlichen und die Launch-Kommunikation erst starten, wenn die
App freigegeben ist (realistisch 21.10. nachmittags bis 22.10.).

- **A** = Account Holder bei Apple (nur er/sie kann DSA und Vereinbarungen).
- **B** = zweite Person.
- `<Repo>` = euer Launch-Checkout, Befehle laufen dort im Terminal.
- Platzhalter für euch heißen überall `[BITTE AUSFÜLLEN: …]`. Suchen mit:
  ```bash
  grep -rn "BITTE AUSFÜLLEN" docs/launch/site ios/App/fastlane/metadata docs/launch/REVIEW_NOTES.md www/onboarding-model.js
  ```
- `[INTEGRATOR: …]` sind Stellen, die Claude nach dem nächtlichen Merge füllt.
  Steht da morgens noch so ein Platzhalter, fragt Claude.

## Zeitplan auf einen Blick

| Zeit | A (Account Holder) | B | Schritt |
|---|---|---|---|
| 06:00–06:10 | Entscheidungen bestätigen, PR lesen | dasselbe | 1 |
| 06:10–06:30 | DSA-Händlerstatus | Nacht-PR mergen, Pages-Quelle umstellen, Rechtstexte ausfüllen | 2, 3, 5 |
| 06:30–06:40 | App-Infos: Apple-ID, Sprache, Name, Version | Rechtstexte weiter | 4, 5 |
| 06:40–06:50 | Apple-ID an B geben | Konstanten im Code eintragen | 6 |
| 06:50–07:05 | Rechtsseiten veröffentlichen, URLs prüfen | Supabase: Prüfskript, Migration | 7, 8 |
| 07:05–07:45 | Build bauen und hochladen | Review-Konten mit Daten anlegen | 9, 10 |
| 07:45–08:30 | Version 1.4 in App Store Connect ausfüllen | Gerätetest auf echtem iPhone + Screenshots | 11, 11a, 12 |
| 08:30–08:45 | Build wählen, einreichen, Expedited Review beantragen | | 13 |
| 09:00–11:30 | Status beobachten, Rückfragen sofort beantworten | Server-Aufgaben ohne Prüfung | 14 |
| 11:30 | Go/No-Go | | 15 |

Zusammen ca. 3 h Arbeit für zwei Personen. Puffer gibt es kaum: Wer bei
einem Schritt hängt, sofort Claude fragen statt suchen.

---

## 1. Entscheidungen bestätigen und Nacht-PR lesen (06:00, beide, 10 min)

Den Pull Request von `claude/app-store-launch-prep-2a43b4` nach `main` und
den Abschnitt „Was heute Nacht gebaut wurde“ unten lesen. Diese Vorgaben gelten;
jede Abweichung ist eine Konstante (Spalte „Wo ändern“):

| Entscheidung | Vorgabe | Wo ändern |
|---|---|---|
| App-Name | „Benny & Joni“, im Store „Benny & Joni: Fitness-Duell“ | `PTOnboarding.APP_NAME` in `www/onboarding-model.js`; Store: `ios/App/fastlane/metadata/de-DE/name.txt` |
| Werbung in V1 | Nein. AdMob kommt als 1.4.1 (Branch `claude/admob-1.4.1`) | `ADS_ENABLED` in `www/ads.js`, nur im AdMob-Branch |
| Rechtstexte | GitHub Pages, `https://noltejonas.github.io/Benny-Joni/` | `LEGAL_BASE` in `www/onboarding-model.js` |
| Veröffentlichung | Manuell nach Freigabe, dazu Expedited Review | App Store Connect, Schritt 11 |
| Anteil-Regel | Echte Teilnehmerzahl ab 2 Aktiven, sonst erwartete Personen | `SHARE_BASIS` in `www/app.jsx` |
| Push | Rivalen-Push ab 10 Wdh./Tag, Ruhezeit 22–7 Uhr, max. 1 pro Tag und Challenge; Tageserinnerung erst ab 22.10. | Secret `RIVAL_THRESHOLD`; Ruhezeit in `supabase/functions/_shared/push-rules.ts`; `DRY_RUN` bei daily-nudge |
| Sprache, Geräte, Länder | Nur Deutsch, nur iPhone, DE/AT/CH | App Store Connect (Schritt 11) |
| JSX vorkompiliert in V1 | [INTEGRATOR: ja/nein und Ergebnis des Simulator-Checks] | Zeile `"capacitor:copy:after"` in `package.json` |

Abweichungen sofort Claude melden.

## 2. DSA-Händlerstatus angeben (06:10, A, 20 min) – P0

Ohne bestätigten Status ist die App in Deutschland und Österreich nicht
erhältlich.

1. https://appstoreconnect.apple.com → **Business** (bzw. „Vereinbarungen,
   Steuern und Bankgeschäfte“) → **Digital Services Act** → Status angeben.
2. **„Händler“ (Trader)** wählen, weil später Werbeeinnahmen geplant sind.
3. Anschrift, Telefon und E-Mail eintragen. **Diese Angaben sind im EU-Store
   öffentlich.** Am besten eine Geschäftsadresse oder einen Impressum-Service
   statt der Privatanschrift. **Dieselbe Adresse kommt ins Impressum (Schritt 5).**
4. Bestätigungscodes eingeben, Nachweis hochladen (Gewerbeanmeldung,
   GbR-Vertrag o. Ä.). Die Prüfung kann dauern; trotzdem weitermachen.
5. Im selben Bereich prüfen: **Free Apps Agreement aktiv**, keine offene
   Vereinbarung (sonst scheitern Upload und API mit
   `REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`).

## 3. Nacht-PR mergen (06:10, B, 5 min)

Die Rechtsseiten werden nur von `main` veröffentlicht, deshalb zuerst mergen.

1. GitHub → Pull Request → **Merge**.
2. Gleich danach (wer Admin im Repo ist): GitHub → Repo `noltejonas/Benny-Joni`
   → **Settings → Pages** → „Build and deployment“ → Source **„GitHub
   Actions“**. Ohne diese Einstellung kann der Workflow nichts veröffentlichen.
   Der erste Lauf von **legal-pages** direkt nach dem Merge schlägt absichtlich
   fehl („noch [BITTE AUSFÜLLEN]“), das ist richtig so.
3. Lokal:
   ```bash
   cd <Repo>
   git switch main && git pull
   for f in tests/*.test.cjs; do node "$f" || echo "FEHLER $f"; done
   ```
   Alles muss ohne „FEHLER“ durchlaufen.

Ab hier arbeitet ihr direkt auf `main`.

## 4. App-Infos in App Store Connect (06:30, A, 10 min) – P0

App Store Connect → Apps → die App mit Bundle-ID `com.bennyjoni.terminator`:

1. **App-Informationen** → „Allgemeine Informationen“ → **Apple-ID** (nur
   Ziffern, z. B. 6741234567) notieren und an B geben.
2. **Primäre Sprache: Deutsch.** Steht dort Englisch, umstellen; sonst
   verlangt App Store Connect englische Texte.
3. **Name** `Benny & Joni: Fitness-Duell` und **Untertitel**
   `Trainier gegen deine Freunde` eintragen und sichern. Ist der Name vergeben:
   Ersatz aus `docs/launch/STORE_LISTING.md`, dann auch `name.txt` ändern.
4. Links bei „iOS-App“ die vorbereitete Version auf **1.4** umbenennen bzw.
   „+ Version“ → `1.4`. Nicht 1.0, sonst passt der Build nicht.

## 5. Rechtstexte ausfüllen (06:10–06:40, B, 30 min) – P0

Dateien unter `docs/launch/site/`. Jede `[BITTE AUSFÜLLEN: …]`-Stelle samt
`<mark class="todo">…</mark>` durch den echten Text ersetzen und in jeder Datei
den gelben Kasten `<div class="draft" …>…</div>` löschen. Vorschau: Datei im
Browser öffnen (`open docs/launch/site/datenschutz.html`).

| Datei | Platzhalter |
|---|---|
| `impressum.html` | Name bzw. Name der GbR; bei GbR „vertreten durch“ mit allen Gesellschaftern (sonst Zeile löschen); Straße und Hausnummer (ladungsfähig, kein Postfach, gleich wie DSA); PLZ und Ort; Support-E-Mail; Telefon oder anderer schneller Kontaktweg; USt-IdNr. (falls keine: Abschnitt löschen) |
| `datenschutz.html` | Verantwortlicher (Name/GbR, Straße, PLZ/Ort, E-Mail); Löschfrist für Fehlerberichte (Vorschlag 90 Tage); E-Mail-Anbieter der Support-Adresse; SMTP-Dienst für Passwort-Mails (oder „Standardversand von Supabase“, bis Schritt 14 erledigt ist); Bestätigung des AV-Vertrags mit Supabase (Kasten danach löschen); Support-E-Mail bei „Deine Rechte“; zuständige Landesdatenschutzbehörde mit Anschrift und Website |
| `nutzungsbedingungen.html` | Name/GbR wie im Impressum; Support-E-Mail bei „Melden“ |
| `support.html` | Support-E-Mail (gern als `<a href="mailto:…">…</a>`) |
| `index.html` | App-Store-Link im Knopf: `https://apps.apple.com/de/app/id<Apple-ID>` (Apple-ID aus Schritt 4) |

Dazu:

- **AV-Vertrag mit Supabase** abschließen, falls noch nicht geschehen:
  Supabase-Dashboard → Organization → **Legal Documents** → DPA anfordern und
  unterschreiben (5 min).
- Die Texte sind Entwürfe nach dem Stand des Codes, **keine Rechtsberatung**.
  Wenn irgend möglich mit einem Generator (z. B. eRecht24) abgleichen oder kurz
  anwaltlich gegenlesen lassen.
- Prüfen, dass die App wirklich keine Fremdserver mehr lädt (sonst stimmt
  „Kurz gesagt“ in der Datenschutzerklärung nicht):
  ```bash
  grep -nE 'unpkg|jsdelivr|googleapis|gstatic' www/index.html || echo "ok: keine CDNs"
  ```
- Kontrolle, dass nichts übrig ist:
  ```bash
  grep -rn -e 'BITTE AUSFÜLLEN' -e 'class="draft"' docs/launch/site || echo "ok: fertig"
  ```
- Committen und pushen:
  ```bash
  git add docs/launch/site
  git commit -m "docs(launch): Rechtstexte ausgefüllt"
  git push
  ```

## 6. Konstanten im Code eintragen (06:40, B, 10 min) – P0

1. `www/onboarding-model.js` öffnen, oben im Block „Launch-Konfiguration“:
   - `APP_STORE_ID = ''` → `APP_STORE_ID = '<Apple-ID aus Schritt 4>'`
   - `SUPPORT_EMAIL = ''` → `SUPPORT_EMAIL = '<eure Support-Adresse>'`.
     **Ohne Adresse laufen „Melden“ und „Support“ nur auf die Support-Webseite.**
   - `LEGAL_BASE` nur ändern, wenn ihr nicht GitHub Pages nutzt.
   ```bash
   grep -n "APP_STORE_ID\|SUPPORT_EMAIL\|LEGAL_BASE" www/onboarding-model.js
   ```
2. In `docs/launch/REVIEW_NOTES.md` im englischen Block die Support-Adresse
   eintragen. Den Einladungscode **nicht** (kommt nur in App Store Connect).
3. `ios/App/fastlane/metadata/copyright.txt`: `2026 <Name bzw. GbR>`.
4. Testen und committen:
   ```bash
   for f in tests/*.test.cjs; do node "$f" || echo "FEHLER $f"; done
   git add www/onboarding-model.js docs/launch/REVIEW_NOTES.md ios/App/fastlane/metadata/copyright.txt
   git commit -m "chore(launch): App-Store-ID und Support-Adresse eintragen"
   git push
   ```

## 7. Rechtsseiten veröffentlichen und URLs prüfen (06:50, A, 10 min) – P0

1. Prüfen, dass Settings → Pages → Source auf **„GitHub Actions“** steht
   (Schritt 3).
2. GitHub → **Actions** → Workflow **legal-pages**. Er läuft bei jedem Push auf
   `main`, der `docs/launch/site` ändert (also nach Schritt 5). Lief er vor dem
   Umstellen der Pages-Quelle oder ist er rot: „Run workflow“ → Branch `main`
   → Run (Haken „Platzhalter erlauben“ **aus**).
   Bricht er mit „noch [BITTE AUSFÜLLEN] …“ ab: Schritt 5 ist nicht fertig.
3. Alle vier Seiten und die Startseite müssen mit 200 antworten:
   ```bash
   for p in "" datenschutz.html impressum.html nutzungsbedingungen.html support.html; do
     curl -s -o /dev/null -w "%{http_code}  $p\n" "https://noltejonas.github.io/Benny-Joni/$p"
   done
   ```
4. Einmal auf dem Handy öffnen und lesen.

Achtung: Wird das Repo auf privat gestellt, schaltet GitHub Pages im
Free-Plan ab, und die App-Links laufen ins Leere.

## 8. Supabase: prüfen und „Konto löschen“ einspielen (06:50, B, 15 min) – P0

Dashboard: https://supabase.com/dashboard/project/jczyyupxxqrdgbeifcwe

1. **SQL Editor** → New query → Inhalt von `docs/launch/supabase-checks.sql`
   einfügen → Run. Das Skript liest nur. Ergebnisse kopieren und Claude geben.
2. **SQL Editor** → New query → Inhalt von
   `supabase/migrations/20261021000000_delete_account.sql` einfügen → Run.
   Muss ohne Fehler durchlaufen (die Datei ist idempotent, ein zweiter Lauf
   schadet nicht).
3. **Authentication → Sign In / Providers → Email**: „Confirm email“ muss
   **AUS** sein. Sonst kann sich niemand ohne Mail registrieren, auch nicht der
   Prüfer.
4. Später im Gerätetest (Schritt 12) mit einem Wegwerf-Konto „Konto löschen“
   testen. Scheitert es mit einem Rechtefehler auf `auth.users`: Function
   `delete-account` deployen (siehe „Supabase-Funktionen“ unten). Die App nutzt
   sie dann automatisch.

**Jetzt NICHT einspielen:** `20261021000100_launch_optional.sql` (nach dem
Launch), `20261021001000_daily_nudge_cron.sql` (ab 22.10.),
`20261021002000_social_push.sql` (später).

## 9. Build bauen und hochladen (07:05, A, 40 min) – P0

Genau nach `docs/launch/RELEASE.md`, **Weg A (Xcode)**. Kurzfassung:

```bash
cd <Repo>
git switch main && git pull
npm ci
npx cap sync ios
git status --short          # nichts Unerwartetes
open ios/App/App.xcodeproj
```

In Xcode: Team `HHJ498GCL6`, Version 1.4, Build 20 → Ziel „Any iOS Device“ →
Product → Archive → Distribute App → App Store Connect → Upload. Apple
verarbeitet 5–30 min. Den Build bekommen interne TestFlight-Tester
automatisch; damit geht der Gerätetest in Schritt 12.

fastlane läuft auf diesem Mac nicht (System-Ruby 2.6). Nur wenn schon
eingerichtet: `cd ios/App && bundle exec fastlane release`.

## 10. Review-Konten mit Daten anlegen (07:05, B, 25 min) – P0

Nach `docs/launch/REVIEW_NOTES.md`, Abschnitt „Review-Konto vorbereiten“:
zwei Konten in der Produktions-App, eine Challenge mit Strafkonto, Profilfoto,
Sätzen an zwei Tagen, Reaktionen. Login und Einladungscode **nur** in App
Store Connect eintragen, nie ins Repo, nie in Chats.

## 11. Version 1.4 in App Store Connect ausfüllen (07:45, A, 45 min) – P0

Alles steht in `docs/launch/STORE_LISTING.md`:

1. Texte: Werbetext, Beschreibung, Schlüsselwörter, Support-URL,
   Marketing-URL aus `ios/App/fastlane/metadata/de-DE/*.txt` kopieren.
2. Screenshots aus Schritt 11a hochladen, Pflicht ist „iPhone mit Dynamic
   Island (mittel)“ (1206×2622 oder 1179×2556). Die großen Größen sind
   optional. Keine iPad-Screenshots.
3. App-Informationen: Kategorie Gesundheit und Fitness, Inhaltsrechte,
   **Altersfreigabe** nach Abschnitt 3 der Liste, **am Ende auf 16+
   überschreiben**.
4. **App-Datenschutz** nach Abschnitt 4 (ohne Werbung, Tracking: Nein),
   Datenschutz-URL `https://noltejonas.github.io/Benny-Joni/datenschutz.html`.
5. Preise und Verfügbarkeit: kostenlos, nur Deutschland, Österreich, Schweiz.
6. Copyright: `2026 <Name bzw. GbR>`.
7. **App-Prüfung**: „Anmeldung erforderlich“ an, Login des Review-Kontos,
   Kontakt (Name, Telefon, E-Mail), Notizen = englischer Block aus
   `REVIEW_NOTES.md` mit eingesetztem Einladungscode.
8. **Veröffentlichung: „Diese Version manuell veröffentlichen“.**

## 11a. Screenshots (B, 08:00–08:30, parallel zum Gerätetest) – P0

Es gibt noch keine Screenshots im Repo. Ohne mindestens einen Screenshot für
**„iPhone mit Dynamic Island (mittel)“** lässt sich nicht einreichen. Erlaubt
sind 1206×2622 oder 1179×2556, JPG oder PNG ohne Alphakanal, höchstens 10.

**Weg 1 (bevorzugt): echtes iPhone**

1. Xcode → Run (Debug-Build) auf ein iPhone mit Dynamic Island, nicht Max oder
   Plus. iPhone 15/16 ergibt 1179×2556, iPhone 16 Pro/17/17 Pro ergibt
   1206×2622. **Nicht** den iOS-27.1-Simulator nehmen, der zeigt Emojis als
   Kästchen.
2. Auf dem Willkommen-Bildschirm „Demo ansehen“ wählen.
3. Am Mac: Safari → Entwickler → `<iPhone>` → `localhost` → Konsole:
   ```js
   localStorage.setItem('pt:shots','1'); location.reload()
   ```
   Das blendet den Demo-Knopf über der Tab-Leiste aus (`www/demo.js`).
4. 4–6 Motive aufnehmen (Seitentaste + Lauter): Heute mit Duell und Serie,
   Feed mit Reaktionen, Stats/Duell, Strafkonto, Einladen. Per AirDrop an den
   Mac schicken.

**Weg 2 (Notlösung ohne passendes iPhone): Chrome am Mac**

1. Im Repo:
   ```bash
   python3 -m http.server 8137 -d www
   ```
2. In Chrome http://localhost:8137/?demo=reset öffnen, DevTools → Gerätemodus
   → eigene Größe **402×874** mit **DPR 3**.
3. In der Konsole denselben Befehl wie oben ausführen
   (`localStorage.setItem('pt:shots','1'); location.reload()`).
4. Pro Motiv DevTools → ⋮ → „Capture screenshot“ (ergibt 1206×2622).

**Für beide Wege vor dem Hochladen** den Alphakanal entfernen und die Größe
prüfen (im Ordner mit den PNGs):

```bash
mkdir -p jpg && for f in *.png; do sips -s format jpeg "$f" --out "jpg/${f%.png}.jpg"; done
sips -g pixelWidth -g pixelHeight jpg/*
```

Die JPGs aus `jpg/` lädt A in Schritt 11.2 hoch.

## 12. Gerätetest auf einem echten iPhone (07:45, B, 25 min) – P0

Neuen Build über TestFlight (intern) installieren oder per Xcode → Run aufs
eigene iPhone. Prüfen:

- [ ] Neu installieren, im **Flugmodus** starten: Hinweis „App konnte nicht
      starten“ mit „Neu laden“ statt weißer Seite. Netz an: App lädt.
- [ ] Mit einer Wegwerf-Adresse registrieren (Zustimmungszeile mit Links zu
      Nutzungsbedingungen und Datenschutz sichtbar), Challenge erstellen,
      Einladung teilen: Text enthält App-Store-Link und „Code: …“.
- [ ] Satz loggen: Haptik spürbar. Push erlauben.
- [ ] App beenden und neu starten: Login bleibt.
- [ ] `projektterminator://join/<CODE>` (z. B. aus Notizen antippen) einmal
      bei geschlossener und einmal bei offener App.
- [ ] Einstellungen → „Info & Rechtliches“: Datenschutz, Impressum,
      Nutzungsbedingungen öffnen Safari mit den echten Seiten.
- [ ] „Support & Feedback“ und „Melden“ öffnen die Mail-App mit der
      Support-Adresse.
- [ ] Einstellungen → „Konto löschen“, zweimal bestätigen → Willkommen-
      Bildschirm. In Supabase (Table Editor → profiles) ist das Konto weg.
- [ ] Homescreen-Name und alle Texte: „Benny & Joni“, nirgends „Projekt
      Terminator“ oder „Tom Holland“.

Fehler sofort Claude melden, mit Screenshot.

## 13. Einreichen und beschleunigte Prüfung beantragen (08:30, A, 15 min) – P0

1. Version 1.4 → **Build** → den neuen Build wählen (Build 20 oder höher).
2. **„Zur Prüfung hinzufügen“ / „Zur Prüfung einreichen“**. Ziel: spätestens
   09:00.
3. Expedited Review beantragen:
   https://developer.apple.com/contact/app-store/?topic=expedite → App wählen →
   Begründung (Englisch), z. B.: *„Our launch with friends and press is
   announced for October 21, 12:00 CEST. The build fixes all known issues;
   a demo account is provided.“* Wird nicht garantiert gewährt.
4. Mails von Apple und das **Resolution Center** im Blick behalten,
   Rückfragen sofort beantworten.

## 14. Server-Aufgaben ohne App-Prüfung (09:00–11:30, B)

Diese Punkte hängen nicht an Apple und laufen parallel zur Prüfung.

1. **Rivalen-Push deployen (P1, 15 min).** Maßgeblich ist
   `docs/PUSH_SETUP_MORNING.md`; stehen dort andere Befehle, gelten die. Auf
   diesem Mac ist keine Supabase-CLI installiert; per `npx` geht es ohne
   Installation:
   ```bash
   npx supabase login
   npx supabase functions deploy notify-set --no-verify-jwt --project-ref jczyyupxxqrdgbeifcwe
   npx supabase secrets set RIVAL_THRESHOLD=10 --project-ref jczyyupxxqrdgbeifcwe   # optional, 10 ist Standard
   ```
   **`--no-verify-jwt` ist Pflicht** (der Trigger schickt kein JWT). Danach
   Dashboard → Edge Functions → notify-set: „Verify JWT“ muss AUS sein.
   Verlangt die CLI Docker: `--use-api` anhängen.

   Danach im SQL Editor
   `select status_code, count(*) from net._http_response group by 1;`:
   200 ok; 401 = ohne `--no-verify-jwt` deployt (Antwort nennt „authorization
   header“, dann mit Flag neu deployen) ODER `WEBHOOK_SECRET` gesetzt (dann
   `npx supabase secrets unset WEBHOOK_SECRET --project-ref jczyyupxxqrdgbeifcwe`);
   503 = APNs-Secrets fehlen. Nur **einen** Auslöser behalten (Trigger ODER
   Dashboard-Webhook).
2. **E-Mail-Versand (P1, 30 min).** Authentication → Emails → **SMTP
   Settings**: eigenen Anbieter eintragen (Resend, Brevo oder Postmark) mit
   SPF/DKIM für die Absender-Domain, Absendername „Benny & Joni“.
   Vorlage **„Reset Password“** auf Deutsch, mit `{{ .Token }}` als 6-stelligem
   Code (die App erwartet einen Code, keinen Link). Authentication → Rate
   Limits: Mails pro Stunde erhöhen (z. B. 100). URL Configuration: Site URL auf
   `https://noltejonas.github.io/Benny-Joni/`. Mit einer Adresse außerhalb des
   Teams testen. Danach in `datenschutz.html` Abschnitt 2.10 den Anbieter
   eintragen und pushen.
3. **Supabase-Tarif (P1, 10 min).** Organization → Billing → **Pro**
   (tägliche Backups, keine Pausierung), Spend Cap an, Usage-Alerts an. Beide
   Gründer als Owner mit MFA eintragen.
4. **Advisors (P2, 10 min).** Dashboard → Advisors → Security und
   Performance. ERROR-Meldungen an Claude geben, WARN kommt nach dem Launch.

## 15. Go/No-Go um 11:30

- Status **„Ausstehende Entwicklerfreigabe“**: um 12:00 „Diese Version
  veröffentlichen“. Nach 1–2 h den Direktlink
  `https://apps.apple.com/de/app/id<Apple-ID>` auf einem iPhone testen. Im
  Marketing nur Direktlink oder QR-Code nutzen; die App-Store-Suche findet
  neue Apps oft erst nach 1–2 Tagen. Ankündigung „fürs iPhone“, Android kommt
  später.
- **Noch „In Prüfung“ oder „Warten auf Prüfung“**: Launch-Post verschieben
  (Plan B: 21.10. abends oder 22.10.). Nicht vorher posten.
- **Abgelehnt**: Ablehnungsgrund komplett an Claude, Fix und neuer Build am
  selben Tag, Build-Nummer +1, sofort neu einreichen. Jede Ablehnung kostet
  etwa einen Tag.

## 16. Danach

- **22.10.:** `daily-nudge` im DRY_RUN-Log prüfen, dann scharf schalten
  (Migration `20261021001000_daily_nudge_cron.sql`, Secret `NUDGE_SECRET`,
  `DRY_RUN=false`). Reihenfolge steht im Kopf der Migration.
- **Nach dem Livegang:** optionale Migration `20261021000100_launch_optional.sql`
  (Avatar-Bucket härten, Kategorie „Tom Holland“ umbenennen, Tabelle
  `client_errors`). Ab dann im App-Datenschutz „Sonstige Diagnosedaten“ auf Ja.
- **25.10. (Zeitumstellung):** im `push_log` prüfen, ob Pushes zur richtigen
  Berliner Uhrzeit kamen.
- **Tag 2–5:** AdMob-Konto, App verknüpfen, `app-ads.txt` auf eigener Domain,
  Datenschutzerklärung um Werbung ergänzen, Branch `claude/admob-1.4.1` als
  1.4.1 einreichen (`docs/launch/ADMOB.md` im AdMob-Branch).

---

## Alle Platzhalter und Konstanten

### Code und Konfiguration

| Wo | Name | Jetzt | Was tun | Wann |
|---|---|---|---|---|
| `www/onboarding-model.js` | `APP_NAME` | `'Benny & Joni'` | nur bei anderem Namen | – |
| `www/onboarding-model.js` | `APP_STORE_ID` | `''` | Apple-ID (Ziffern) eintragen | Schritt 6, **P0** |
| `www/onboarding-model.js` | `APP_STORE_URL` | aus `APP_STORE_ID` | nichts, wird berechnet | – |
| `www/onboarding-model.js` | `SUPPORT_EMAIL` | `''` | Support-Adresse eintragen | Schritt 6, **P0** |
| `www/onboarding-model.js` | `LEGAL_BASE` / `LEGAL` | GitHub Pages | nur bei anderem Hosting | – |
| `www/app.jsx` | `SHARE_BASIS` | echte Teilnehmer ab 2 | nur bei anderer Anteil-Regel | – |
| `package.json` | `"capacitor:copy:after"` | [INTEGRATOR: drin/nicht drin] | Notlösung siehe `RELEASE.md` | nur bei Build-Problemen |
| `capacitor.config.json` | `appName` | `Benny & Joni` | – | – |
| `ios/App/App/Info.plist` | `CFBundleDisplayName` | `Benny & Joni` | – | – |
| `ios/App/App.xcodeproj` | `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | `1.4` / `20` | Build +1 bei jedem neuen Upload | Schritt 9 |
| `www/index.html`, `www/manifest.webmanifest` | Titel, Name | `Benny & Joni` | – | – |
| `www/ads.js` (nur Branch `claude/admob-1.4.1`) | `ADS_ENABLED`, `PROD` | aus / Test-IDs | echte AdMob-IDs | 1.4.1 |
| URL-Schema | `projektterminator://` | bleibt | technisch, nicht sichtbar | – |

### Rechtstexte (`docs/launch/site/`) – alle `[BITTE AUSFÜLLEN]`

| Datei | Anzahl | Inhalt |
|---|---|---|
| `impressum.html` | 8 | Name/GbR, Gesellschafter, Straße, PLZ/Ort, E-Mail, Telefon/zweiter Kontaktweg, USt-IdNr., Entwurfs-Kasten |
| `datenschutz.html` | 11 | Verantwortlicher (Name, Straße, PLZ/Ort, E-Mail), Löschfrist Fehlerberichte, E-Mail-Anbieter, SMTP-Dienst, AV-Vertrag Supabase, Support-E-Mail, Aufsichtsbehörde, Entwurfs-Kasten |
| `nutzungsbedingungen.html` | 3 | Name/GbR, Support-E-Mail, Entwurfs-Kasten |
| `support.html` | 2 | Support-E-Mail, Entwurfs-Kasten |
| `index.html` | 2 | App-Store-Link, Entwurfs-Kasten |

Der Workflow `legal-pages` veröffentlicht erst, wenn keine dieser Stellen und
kein Entwurfs-Kasten mehr da ist.

### Store und Prüfung

| Wo | Was | Wann |
|---|---|---|
| `ios/App/fastlane/metadata/copyright.txt` | `2026 <Name bzw. GbR>` | Schritt 6 |
| `docs/launch/REVIEW_NOTES.md` | Support-Adresse im englischen Block | Schritt 6 |
| App Store Connect → App-Prüfung | Login Review-Konto, Kontakt, Einladungscode | Schritt 11 |
| `ios/App/fastlane/.env` (nur für fastlane, gitignored) | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`, `REVIEW_FIRST_NAME`, `REVIEW_LAST_NAME`, `REVIEW_EMAIL`, `REVIEW_PHONE`, `REVIEW_USER`, `REVIEW_PASSWORD`, `REVIEW_CODE` | wenn ihr fastlane nutzt |

### Supabase (Projekt `jczyyupxxqrdgbeifcwe`, Region eu-west-1)

| Was | Datei / Ort | Wann |
|---|---|---|
| Prüfskript (nur lesend) | `docs/launch/supabase-checks.sql` | Schritt 8, **P0** |
| Migration „Konto löschen“ | `supabase/migrations/20261021000000_delete_account.sql` | Schritt 8, **P0** |
| „Confirm email“ AUS | Authentication → Providers → Email | Schritt 8, **P0** |
| AV-Vertrag (DPA) | Organization → Legal Documents | Schritt 5 |
| Function `delete-account` | `supabase/functions/delete-account/` | nur falls die Löschung mit Rechtefehler scheitert |
| Function `notify-set` (neue Version) | `supabase/functions/notify-set/` + `_shared/`. Deploy nur mit `--no-verify-jwt` | Schritt 14, P1 |
| Secret `RIVAL_THRESHOLD` | optional, Standard 10 | Schritt 14 |
| Secrets `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`, `APNS_PRIVATE_KEY` | sollten schon gesetzt sein; prüfen mit `npx supabase secrets list --project-ref jczyyupxxqrdgbeifcwe` | Schritt 14 |
| `WEBHOOK_SECRET` | in Prod nicht gesetzt; **nicht** heute setzen, sonst stoppen alle Pushes | nach dem Launch |
| SMTP, Vorlage „Reset Password“ mit `{{ .Token }}`, Rate Limits, Site URL | Authentication → Emails / Rate Limits / URL Configuration | Schritt 14, P1 |
| Function `daily-nudge` + Secret `NUDGE_SECRET` + `DRY_RUN` | `supabase/functions/daily-nudge/`, Migration `20261021001000_daily_nudge_cron.sql`. Deploy nur mit `--no-verify-jwt` | ab 22.10. |
| Optionale Migration | `20261021000100_launch_optional.sql` | nach dem Launch |
| Social-Push | `20261021002000_social_push.sql` | später |
| Tarif Pro, MFA, zwei Owner | Organization → Billing / Members | Schritt 14, P1 |

### GitHub

| Was | Wo | Wann |
|---|---|---|
| Pages-Quelle „GitHub Actions“ | Settings → Pages | Schritt 3, **P0** |
| Repo bleibt **öffentlich** | sonst ist Pages (Free) weg | immer |

### App Store Connect

DSA-Händlerstatus, Vereinbarungen, Apple-ID, primäre Sprache Deutsch, Name und
Untertitel, Version 1.4, Texte, Screenshots, Kategorie, Altersfreigabe,
App-Datenschutz, Preis kostenlos, Verfügbarkeit DE/AT/CH, App-Prüfung,
manuelle Veröffentlichung, Expedited Review. Alles in Schritt 2, 4, 11, 11a
(Screenshots) und 13.

### Nie ins Repo (es ist öffentlich)

`.p8`-Schlüssel (App Store Connect, APNs), Login und Passwort der
Review-Konten, Einladungscode der Review-Challenge, Supabase-`service_role`-Key,
SMTP-Passwörter, `ios/App/fastlane/.env`. `ios/.gitignore` fängt `*.p8` und
`fastlane/metadata/review_information/` ab, verlasst euch aber nicht darauf.

---

## Was heute Nacht gebaut wurde

Claude füllt diesen Abschnitt nach dem Merge. Pro Paket: was drin ist, was
offen blieb, worauf ihr achten müsst.

- **p0-konto-loeschen-daten** (Konto löschen, Rechtliches und Melden in den
  Einstellungen, Ziel-Löschen ohne Datenverlust, deutsche Fehlertexte):
  [INTEGRATOR: Ergebnis, offene Punkte]
- **p0-rechtliches-marke-einladung** (Launch-Konstanten, Name, Zustimmungszeile
  bei der Registrierung, Einladung mit App-Store-Link): [INTEGRATOR: Ergebnis,
  offene Punkte]
- **p0-ios-projekt** (Privacy-Manifest, nur iPhone, Deutsch, Startbildschirm,
  Build 20): [INTEGRATOR: Ergebnis, offene Punkte]
- **p0-start-ohne-cdn** (lokale Bibliotheken und Schrift, Start-Fallback,
  Vorkompilieren): [INTEGRATOR: Ergebnis, Vorkompilieren ja/nein]
- **p0-store-unterlagen-aufraeumen**:
  - Rechtstexte als Entwürfe unter `docs/launch/site/` (Datenschutz nach den
    echten Datenflüssen, Impressum, Nutzungsbedingungen mit Null-Toleranz,
    Mindestalter 16 und Strafkonto ohne Zahlungen, Support-FAQ, Startseite).
  - Workflow `.github/workflows/legal-pages.yml` (nur `docs/launch/site`,
    bricht bei Platzhaltern ab).
  - Store-Texte in `ios/App/fastlane/metadata/` und
    `docs/launch/STORE_LISTING.md` mit Altersfreigabe und App-Datenschutz;
    alle Zeichenlimits geprüft.
  - `docs/launch/REVIEW_NOTES.md` (Englisch/Deutsch), `docs/launch/RELEASE.md`
    (Xcode und fastlane), dieses Runbook.
  - fastlane: `build_ipa` ausgelagert, `beta` unverändert, neue Lane `release`.
  - Sicherheit: `supabase/.temp` nicht mehr im Repo, `*.p8` und
    Review-Daten ignoriert.
  - App-Bundle aufgeräumt: Bildschirmfotos, SETUP-Dateien und Icon-Quellen nach
    `docs/archive/`; `www/` von 24 auf 4,1 MB (vor den lokalen Bibliotheken).
- **p1-app-robustheit** (Error-Boundary, Neuladen nach Rückkehr, Ladefehler,
  „Wie letzte Woche starten“, Strafkonto-Badge, `SHARE_BASIS`):
  [INTEGRATOR: Ergebnis, offene Punkte]
- **p1-screens-feed-retention** (Diagramm-Absturz, weitere Übungen, Serie,
  Plausibilität, Melden und Blockieren im Feed): [INTEGRATOR: Ergebnis, offene
  Punkte]
- **p1-push-server** (Schwelle 10, Ruhezeit, daily-nudge im DRY_RUN,
  Prüfskript, Push-Doku): [INTEGRATOR: Ergebnis, offene Punkte]
- **p1-store-screenshots** (6 Motive in 1206×2622 und 1320×2868):
  [INTEGRATOR: Ergebnis]
- **p2-admob-update-branch** (eigener Branch `claude/admob-1.4.1`, NICHT im
  Launch-Build): [INTEGRATOR: Stand]

Ergebnis der Gesamtprüfung nach dem Merge (Tests, Browser, Simulator):
[INTEGRATOR: Zusammenfassung]
