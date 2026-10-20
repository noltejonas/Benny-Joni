# Hinweise für die App-Prüfung (App Review)

Wohin: App Store Connect → App → Version 1.4.1 → „App-Prüfung“ (App Review
Information). Dort gehören hin:

- **Anmeldung erforderlich:** Haken setzen. Benutzername und Passwort des
  Review-Kontos eintragen. **Zugangsdaten nur dort, nie in dieses Repo.** Das
  Repo ist öffentlich.
- **Kontakt:** Vorname, Nachname, Telefon, E-Mail einer Person, die heute
  erreichbar ist.
- **Notizen:** den englischen Block unten kopieren, vorher die zwei
  Platzhalter ersetzen. Den Einladungscode nur in App Store Connect eintragen,
  nicht hier im Repo; sonst könnte jemand der Review-Challenge beitreten.

Die fastlane-Lane `release` liest den englischen Block zwischen den
Markierungen automatisch, ersetzt `[BITTE AUSFÜLLEN: Einladungscode]` durch
`REVIEW_CODE` aus `ios/App/fastlane/.env` und bricht ab, solange ein anderer
Platzhalter übrig ist (siehe `docs/launch/RELEASE.md`).

## Review-Konto vorbereiten (zweite Person, ca. 25 min)

1. In der Produktions-App zwei Konten anlegen, z. B. `review@<eure Domain>` und
   `review2@<eure Domain>` (eigene Postfächer, keine privaten Adressen).
2. Mit Konto 1: Challenge „Review“ erstellen, Strafkonto einschalten,
   Profilfoto setzen, ein Wochenziel anlegen.
3. Mit Konto 2: per Code beitreten, an zwei Tagen Sätze loggen (ein Nachtrag
   für gestern reicht), Reaktionen setzen.
4. Mit Konto 1: ein paar Sätze loggen, auf Sätze von Konto 2 reagieren.
5. Konto 1 kommt als Login in App Store Connect. Den Einladungscode der
   Challenge notieren (Einstellungen → „Teilnehmer & Einladen“).
6. Nach dem Launch die Konten stehen lassen; Apple prüft auch Updates damit.

## Notizen für Apple (Englisch, zum Kopieren)

<!-- review-notes:start -->
Benny & Joni is a fitness challenge app for small groups of friends. Members agree on a weekly goal (for example 300 push-ups together), log their sets and see each other's progress in a live feed. Groups are closed: you can only join with a 6-character invite code from a friend. There is no public feed, no chat and no phone number.

HOW TO REVIEW
1. Tap "Schon dabei? Anmelden" on the welcome screen and sign in with the demo account provided in the App Review Information. It already belongs to a challenge with a second member, logged sets, reactions and an enabled penalty box ("Strafkonto").
2. To test joining a challenge: register a new account (no email confirmation needed), choose "Code eingeben" and enter the invite code [BITTE AUSFÜLLEN: Einladungscode].
3. Without an account: "Demo ansehen" on the welcome screen opens a local demo with sample data. Nothing is sent to our server.

PENALTY BOX ("Strafkonto")
Optional per challenge. It only records amounts that friends agreed to pay into their own group kitty when they miss their weekly share. The app does not process, hold or transfer money. There are no payments, no in-app purchases and no prizes. It is not gambling.

ACCOUNT DELETION (Guideline 5.1.1(v))
Settings (tap your avatar at the top right) > "Konto löschen", confirm twice. Also in the profile sheet (tap the challenge name at the top > your profile > "Konto löschen"). Profile, sets, reactions, penalty entries and the profile photo are deleted immediately.

USER-GENERATED CONTENT (Guideline 1.2)
Users can report content and people ("Melden" on a feed entry, in Settings > "Teilnehmer & Einladen" and in Settings > "Problem oder Inhalt melden") and block people ("Blockieren" on a feed entry). Reports go to our support address and are reviewed within 24 hours; offending content is removed and accounts are banned. The terms of use include a zero-tolerance policy: https://noltejonas.github.io/Benny-Joni/nutzungsbedingungen.html

SIGN-IN
Email and password only. There is no third-party or social login, so Sign in with Apple is not required (Guideline 4.8).

ADS (new in 1.4.1)
Google AdMob banner ads, only on the "Feed" and "Stats" tabs. Never during onboarding, never in the demo, no interstitials, no rewarded or app-open ads. Only non-personalized ads (npa=1), ad content limited to "General". In the EEA, UK and Switzerland, Google's consent form (User Messaging Platform, IAB TCF) appears the first time the Feed or Stats tab is opened; users can change or withdraw their choice under Settings > "Werbe-Einwilligung". The app does not request App Tracking Transparency and does not use the IDFA.

OTHER
No tracking, no analytics SDK. Push notifications are optional (at most one per day and challenge). The camera and photo library are only used to pick a profile photo. The app is in German and for iPhone only. Legal pages open in Safari: Settings > "Info & Rechtliches".

Support: [BITTE AUSFÜLLEN: Support-E-Mail-Adresse] (we reply within 24 hours)
<!-- review-notes:end -->

## Dasselbe auf Deutsch (für euch)

Benny & Joni ist eine Fitness-Challenge-App für kleine Freundesgruppen. Ihr
einigt euch auf ein Wochenziel, loggt Sätze und seht den Fortschritt der
anderen im Live-Feed. Die Gruppen sind geschlossen: Beitreten geht nur mit
einem 6-stelligen Einladungscode. Es gibt keinen öffentlichen Feed, keinen
Chat und keine Telefonnummer.

**So prüfen:**
1. Auf dem Willkommen-Bildschirm „Schon dabei? Anmelden“ und mit dem
   Review-Konto einloggen. Es ist schon in einer Challenge mit zweitem
   Mitglied, Sätzen, Reaktionen und eingeschaltetem Strafkonto.
2. Beitreten testen: neues Konto registrieren (keine Mail-Bestätigung nötig),
   „Code eingeben“ und den Einladungscode eintragen.
3. Ohne Konto: „Demo ansehen“ zeigt eine lokale Demo mit Beispieldaten, nichts
   geht an den Server.

**Strafkonto:** pro Challenge optional. Es hält nur fest, was Freunde in ihre
eigene Kasse zahlen wollen, wenn sie ihren Anteil verpassen. Die App wickelt
kein Geld ab, es gibt keine Zahlungen, keine In-App-Käufe und keine Preise.
Kein Glücksspiel.

**Konto löschen (5.1.1(v)):** Einstellungen (Profilbild oben rechts) →
„Konto löschen“, zweimal bestätigen. Außerdem im Profil (oben auf den
Challenge-Namen → Profil → „Konto löschen“). Profil, Sätze, Reaktionen,
Strafkonto-Einträge und Foto werden sofort gelöscht.

**Nutzerinhalte (1.2):** Melden an einem Feed-Eintrag, bei den Teilnehmern
und unter „Problem oder Inhalt melden“; Blockieren am Feed-Eintrag. Meldungen
landen in der Support-Mail und werden binnen 24 h geprüft. Die
Nutzungsbedingungen enthalten eine Null-Toleranz-Regel.

**Login:** nur E-Mail und Passwort, kein Drittanbieter-Login. Deshalb ist
„Mit Apple anmelden“ nicht nötig (4.8).

**Werbung (neu in 1.4.1):** AdMob-Banner nur in den Tabs Feed und Stats. Nie
im Onboarding, nie in der Demo, keine Vollbild-, Prämien- oder App-Start-Anzeigen.
Nur nicht-personalisierte Anzeigen, Inhalte höchstens „General“. In EWR, UK und
Schweiz fragt Googles Einwilligungsdialog beim ersten Öffnen von Feed oder
Stats; ändern unter Einstellungen → „Werbe-Einwilligung“. Kein ATT-Dialog, die
IDFA wird nicht genutzt.

**Sonst:** kein Tracking, kein Analyse-SDK. Push ist optional
(höchstens eine Mitteilung pro Tag und Challenge). Kamera und Fotos nur fürs
Profilbild. Nur Deutsch, nur iPhone. Rechtstexte öffnen in Safari:
Einstellungen → „Info & Rechtliches“.

## Vor dem Absenden prüfen

- Die Wege oben im gemergten Build einmal nachklicken. Die Beschriftungen
  „Melden“, „Blockieren“, „Konto löschen“ und „Info & Rechtliches“ kommen aus
  den Nacht-Paketen; heißen sie anders, den englischen Block anpassen.
- „Confirm email“ in Supabase ist AUS (sonst stimmt Schritt 2 nicht).
- Die Support-Adresse beantwortet wirklich jemand, auch am Launch-Wochenende.
- 1.4.1: Mit dem Review-Konto Feed öffnen. In der EU erscheint Googles
  Einwilligungsdialog, danach das Banner über der Tab-Leiste. Erscheint kein
  Banner, ist die App in AdMob noch nicht freigegeben bzw. nicht mit dem
  Store-Eintrag verknüpft (docs/launch/ADMOB.md). Das ist kein Ablehnungsgrund,
  aber vor dem Einreichen wissen.
