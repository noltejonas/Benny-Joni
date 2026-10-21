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
7. Ein drittes Konto `review3@<eure Domain>` als Reserve anlegen und der
   Review-Challenge beitreten lassen. Nicht in App Store Connect eintragen.
   Löscht der Prüfer Konto 1 trotzdem, in App Store Connect die Login-Daten
   auf Konto 3 umstellen.

## Notizen für Apple (Englisch, zum Kopieren)

<!-- review-notes:start -->
Benny & Joni is a fitness challenge app for small groups of friends. Members agree on a weekly goal (for example 300 push-ups together), log their sets and see each other's progress in a live feed. Groups are closed: you can only join with a 6-character invite code from a friend. There is no public feed, no chat and no phone number.

LANGUAGE
The app is in English and German. It follows the device language (any other language shows English) and can be switched in Settings > App > "Language". Below, button labels are given in English with the German label in brackets.

HOW TO REVIEW
1. Tap "Already a member? Sign in" ("Schon dabei? Anmelden") on the welcome screen and sign in with the demo account provided in the App Review Information. It already belongs to a challenge with a second member, logged sets, reactions and an enabled penalty pot ("Strafkonto").
2. To test joining a challenge: register a new account (no email confirmation needed), choose "Enter code" ("Code eingeben") and enter the invite code [BITTE AUSFÜLLEN: Einladungscode].
3. Without an account: "Try the demo" ("Demo ansehen") on the welcome screen opens a local demo with sample data. Nothing is sent to our server.

PENALTY POT ("Strafkonto")
Optional per challenge. It only records amounts that friends agreed to pay into their own group kitty when they miss their weekly share. The app does not process, hold or transfer money. There are no payments, no in-app purchases and no prizes. It is not gambling.

ACCOUNT DELETION (Guideline 5.1.1(v))
Settings (tap your avatar at the top right) > "Delete account" ("Konto löschen"), confirm twice. Also in the profile sheet (tap the challenge name at the top > your profile > "Delete account"). Profile, sets, reactions, penalty entries and the profile photo are deleted immediately. To test deletion, please register a new account first (no email confirmation needed) and delete that one, so the demo account stays available for future reviews.

USER-GENERATED CONTENT (Guideline 1.2)
Report/block: open the "Feed" tab and tap an entry of the other member to expand it, then "Report" ("Melden") or "Block" ("Blockieren"). People can also be reported in Settings (avatar top right) > "Members & invites" ("Teilnehmer & Einladen") > "Report", anything else via Settings > "Report a problem or content" ("Problem oder Inhalt melden"). Reports open a pre-filled email to our support address with the IDs; we review within 24 hours, remove offending content and ban the account. Blocking hides that person's notes and photo on this device; leaving the challenge in Settings removes all contact. Content is only visible inside invite-only groups; there is no public feed, search or discovery. Zero-tolerance terms: https://noltejonas.github.io/Benny-Joni/nutzungsbedingungen.html

SIGN-IN
Email and password only. There is no third-party or social login, so Sign in with Apple is not required (Guideline 4.8).

ADS (new in 1.4.1)
Google AdMob banner ads, only on the "Feed" and "Stats" tabs. Never during onboarding, never in the demo, no interstitials, no rewarded or app-open ads. Only non-personalized ads (npa=1), ad content limited to "General". In the EEA, UK and Switzerland, Google's consent form (User Messaging Platform, IAB TCF) appears the first time the Feed or Stats tab is opened; users can change or withdraw their choice under Settings > "Ad consent" ("Werbe-Einwilligung"). The app does not request App Tracking Transparency and does not use the IDFA.

OTHER
No tracking, no analytics SDK. Push notifications are optional (at most one per day and challenge). The camera and photo library are only used to pick a profile photo. iPhone only. Legal pages (German) open in Safari: Settings > "Info & legal" ("Info & Rechtliches").

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
Strafkonto-Einträge und Foto werden sofort gelöscht. Zum Testen bitte ein
neues Konto anlegen und dieses löschen, nicht das Review-Konto.

**Nutzerinhalte (1.2):** Tab „Feed“ → fremden Eintrag antippen (klappt auf)
→ „Melden“ oder „Blockieren“. Personen außerdem unter Einstellungen
(Profilbild oben rechts) → „Teilnehmer & Einladen“ → „Melden“, alles andere
unter Einstellungen → „Problem oder Inhalt melden“. Meldungen öffnen eine
vorausgefüllte Mail an die Support-Adresse mit den IDs und werden binnen 24 h
geprüft; Inhalte werden entfernt, Konten gesperrt. Blockieren blendet Notizen
und Foto der Person auf diesem Gerät aus; wer die Challenge in den
Einstellungen verlässt, hat keinen Kontakt mehr. Inhalte sind nur in
geschlossenen Gruppen sichtbar, es gibt keinen öffentlichen Feed, keine Suche
und keine Entdeckung. Die Nutzungsbedingungen enthalten eine
Null-Toleranz-Regel.

**Login:** nur E-Mail und Passwort, kein Drittanbieter-Login. Deshalb ist
„Mit Apple anmelden“ nicht nötig (4.8).

**Werbung (neu in 1.4.1):** AdMob-Banner nur in den Tabs Feed und Stats. Nie
im Onboarding, nie in der Demo, keine Vollbild-, Prämien- oder App-Start-Anzeigen.
Nur nicht-personalisierte Anzeigen, Inhalte höchstens „General“. In EWR, UK und
Schweiz fragt Googles Einwilligungsdialog beim ersten Öffnen von Feed oder
Stats; ändern unter Einstellungen → „Werbe-Einwilligung“. Kein ATT-Dialog, die
IDFA wird nicht genutzt.

**Sprache:** Die App gibt es auf Englisch und Deutsch. Sie folgt der
Gerätesprache (andere Sprachen → Englisch) und lässt sich unter Einstellungen
→ App → „Sprache“ umstellen. Prüfer nutzen meist ein englisches iPhone und
sehen die App deshalb auf Englisch; die Notizen nennen die Knöpfe auf
Englisch mit dem deutschen Text in Klammern.

**Sonst:** kein Tracking, kein Analyse-SDK. Push ist optional
(höchstens eine Mitteilung pro Tag und Challenge). Kamera und Fotos nur fürs
Profilbild. Nur iPhone. Rechtstexte (deutsch) öffnen in Safari:
Einstellungen → „Info & Rechtliches“.

## Vor dem Absenden prüfen

- Die Wege oben im gemergten Build einmal nachklicken, **einmal auf Deutsch
  und einmal auf Englisch** (Einstellungen → App → Sprache → English, die App
  lädt neu). Die englischen Beschriftungen im Block („Delete account“,
  „Report“, „Block“, „Info & legal“, „Report a problem or content“) müssen zu
  `www/i18n/en.js` passen; heißen sie anders, den englischen Block anpassen.
- „Confirm email“ in Supabase ist AUS (sonst stimmt Schritt 2 nicht).
- Die Support-Adresse beantwortet wirklich jemand, auch am Launch-Wochenende.
- 1.4.1: Mit dem Review-Konto Feed öffnen. In der EU erscheint Googles
  Einwilligungsdialog, danach das Banner über der Tab-Leiste. Erscheint kein
  Banner, ist die App in AdMob noch nicht freigegeben bzw. nicht mit dem
  Store-Eintrag verknüpft (docs/launch/ADMOB.md). Das ist kein Ablehnungsgrund,
  aber vor dem Einreichen wissen.
