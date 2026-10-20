# Onboarding neu aufgebaut — Design

Stand 2026-10-20. Neu gebaut wird der Weg vom ersten App-Start bis zu dem Moment, in dem jemand die erste Woche hinter sich hat und wiederkommt.

## Ausgangslage
- **Erster Start = Login-Formular.** Kein Wort dazu, was die App ist. Die Demo ist der dritte Textlink unter „Passwort vergessen“.
- **Registrierung fragt Name, E-Mail und Passwort auf einmal.** Kommt keine Session zurück, wirft `signUp` eine Entwickler-Meldung („… im Supabase-Dashboard unter Auth → Providers …“). Laut `/auth/v1/settings` ist die Bestätigung aus (`mailer_autoconfirm: true`), sie lässt sich aber jederzeit im Dashboard einschalten. Ungültige Adresse, Rate-Limit und Offline-Fehler kommen als englischer Rohtext.
- **Profilbild nur über Umwege** (Avatar → Profil-Sheet). Neue Leute stehen in Feed und Rangliste als Initiale.
- **Einladungen sind reiner Text mit Code.** Es gibt kein URL-Schema und kein `@capacitor/app`. `JoinCompetitionSheet` kennt `initialCode`, übergeben wird er nirgends. Der `SceneDelegate` reicht Links schon an Capacitor weiter, nur hört niemand zu. `preview_competition` ist nur für angemeldete Nutzer freigegeben.
- **Challenge erstellen in drei Schritten mit Fachbegriffen** („Rotationsplan“, „Strafkonto“, „Work-Tracking“). Der Name ist Pflicht, die Datumsfelder stehen mitten im Weg.
- **Allein in der Challenge** gibt es nur ein Text-Banner mit dem Code. Wer dazukommt, merkt man erst an der Duell-Karte.
- **Das Wochenziel ist eine Gruppensumme.** Dass `SetupSheet` („Ziel-Wiederholungen / Woche“, Chips 15–100) durch die Teilnehmer geteilt wird, steht nirgends. Allein zeigt Home den ganzen Wert als „deinen Teil“.
- **Der erste Satz bringt nur den Toast** „+5 Liegestütze geloggt“, ohne Haptik und ohne Ton. `www/sounds/` ist leer, `goal-reached.mp3` fehlt.
- **Push ohne Kontext:** nativ fragt die App sofort beim Öffnen einer Challenge, im Web beim ersten Klick irgendwohin. Wer ablehnt, bekommt nur noch „In den iOS-Einstellungen ausgeschaltet.“
- **Leere Zustände ohne Weg:** Feed „Noch keine Aktivität“ ohne Aktion, Stats mit Nullkarten, Strafkonto „Noch sauber.“ ohne Regel. Die erste Woche wird nicht gefeiert.
- **Wer einer Challenge beitritt**, deren Gruppenziel schon geknackt ist, bekommt sofort die Vollbild-Feier (`pt_celebrated_v1` merkt sich nur Gesehenes).
- **Die Demo kennt keine neuen Leute.** Jede Registrierung landet als Benny in vier fertigen Challenges.

## Entscheidungen
1. **Der Stand kommt aus echten Daten, nicht aus Tutorial-Flags.** Was als Nächstes dran ist (Profil, Challenge, Einladen, Ziel, erster Satz), ergibt sich aus Profil, Mitgliedschaften, Wochenzielen und Sätzen. Abbruch und Wiedereinstieg brauchen dadurch keine Extra-Logik, und auf einem zweiten Gerät stimmt der Stand. Die Regeln liegen ohne React in `www/onboarding-model.js` (`PTOnboarding`) und sind getestet.
2. **Als neu gilt, wer das neue Onboarding begonnen hat oder ein Profil jünger als 14 Tage hat.** Nur diese Leute sehen Startkarte, Tipp am Schnellsatz, Feier zum ersten Satz und Wochenrückblick. Bestehende Konten mit Challenges sehen nichts davon. Jeder Hinweis hängt außerdem an fehlenden Daten (kein Satz, kein Ziel …) und verschwindet damit von selbst.
3. **Willkommen statt Login.** Wer kein Konto hat, sieht zuerst die App in einem Blick (animierte Mini-Duellkarte) und einen Satz. Daneben stehen drei Wege: „Los geht's“, „Code eingeben“, „Demo ansehen“. Wer auf dem Gerät schon einmal angemeldet war (`pt:returning`), kommt direkt zum Login.
4. **Registrierung nur mit E-Mail und Passwort.** Der Name kommt im Profilschritt, vorbelegt aus der Adresse („lenn.hoffmann@…“ → „Lenn“). Diesen Vorschlag bekommt auch `display_name` beim `signUp`, damit niemand als „lenn.hoffmann“ im Feed steht.
5. **E-Mail-Bestätigung bleibt aus, wird aber sauber behandelt.**
   - Ohne Session zeigt die App „Check deine Mails“ mit „Ich hab bestätigt“ (Anmelden mit den eingegebenen Daten) und „Mail nochmal senden“ (`auth.resend`, 60 s Sperre).
   - Ein Deep Link ist nicht nötig, weil der Link in der Mail die Adresse auf dem Server bestätigt.
   - Ein Login mit unbestätigter Adresse landet auf demselben Bildschirm.
   - Jeder Auth-Fehler bekommt einen deutschen Text. Gibt es das Konto schon, wechselt die App zum Login mit vorbelegter Adresse.
6. **Profil: Name Pflicht und vorbelegt, Foto optional.** Ein Bildschirm, ein Tipp auf „Weiter“ reicht.
7. **Einladen per Link und Code.**
   - Neues URL-Schema `projektterminator://join/<CODE>` in der `Info.plist`. `@capacitor/app` liefert `appUrlOpen` und beim Kaltstart `getLaunchUrl`. Im Browser gilt `?join=<CODE>`.
   - Der Code wird als offene Einladung gemerkt (`pt:invite`, 7 Tage). So übersteht er Registrierung und Profil und öffnet danach direkt die Vorschau der richtigen Challenge.
   - Der Einladungstext enthält Code und Link.
   - Codefelder nehmen ganze Nachrichten oder Links an und ziehen den Code heraus. „Einfügen“ liest die Zwischenablage, die Vorschau lädt bei sechs Zeichen von selbst.
   - Universal Links (https) bräuchten eine eigene Domain und Associated Domains und bleiben offen.
8. **Challenge erstellen auf einer Seite.**
   - Der Modus steht als drei Karten da, vorgewählt „1 vs 1“.
   - Der Name ist optional; leer gilt der Vorschlag des Modus („Duell“, „Team-Duell“, „Freundeskreis“).
   - Das Emoji wählt man aus einer Reihe.
   - Die Module heißen im Klartext („Strafkasse“, „Wochenplan“, „Arbeitszeit“), sind aus und liegen zusammengeklappt unter „Extras“. Dort stehen auch Start (heute) und Ende (optional).
9. **Einladen ist ein eigener Moment.**
   - Nach dem Erstellen sieht man die Plätze der Challenge als Avatare (eigener Platz und freie Plätze), den Code groß, „Einladung senden“ (Teilen-Sheet) und „Kopieren“.
   - Tritt jemand bei, solange der Bildschirm offen ist, füllt sich der Platz live, mit Haptik.
   - Wer allein ist, sieht auf Home eine Einladen-Karte statt des Text-Banners.
   - Neue Mitglieder kündigt die App allen an: „Jonas ist dabei 🎉“.
10. **Das erste Wochenziel denkt pro Person.**
    - Eigener Schritt: Übung wählen (Sport ohne Pflicht-Workouts, weil Home nur Sport zeigt) und die Menge „pro Person bis Sonntag“ festlegen.
    - Jede Übung hat einen Vorschlag (Liegestütze 100, Klimmzüge 30 …), der unter der Woche anteilig sinkt.
    - Gespeichert wird wie bisher die Gruppensumme: `target_reps = pro Person × erwartete Teilnehmer` (1 vs 1 = 2, 2 vs 2 = 4, Jeder gegen jeden = mindestens 2).
    - Auch Home rechnet den Anteil mit den erwarteten Teilnehmern, solange noch Plätze frei sind. Sonst stünde allein „0 von 200“ statt der versprochenen 100.
    - `SetupSheet` bleibt für alle weiteren Ziele.
11. **Der erste Satz kommt direkt im Fluss.**
    - Nach dem Ziel folgt „Dein erster Satz“ mit großer Zahl, Chips und „+10 loggen“; „Später“ überspringt den Schritt.
    - Belohnung ist eine eigene kurze Feier:
      - die Zahl zählt hoch
      - der Ring füllt sich („10 von 100“)
      - 1,5 s Konfetti
      - Haptik „Erfolg“ plus zwei Impulse
      - Ton `www/sounds/first-log.wav`, erzeugt per `tools/make-sounds.cjs`
    - Ab dann gibt jeder Schnellsatz einen leichten Haptik-Impuls.
    - Wer den Schritt überspringt, sieht am Schnellsatz bis zum ersten Satz „Satz gemacht? Tipp hier.“ (Pfeil auf den ersten Zahl-Chip)
12. **Push nur nach einem Vorab-Bildschirm.**
    - Die automatische Abfrage fällt weg.
    - Der Vorab-Bildschirm kommt direkt nach der Feier zum ersten Satz. Er verspricht genau das, was `notify-set` verschickt:
      - „Dein Rivale legt los und du bist heute noch bei 0? Wir sagen Bescheid.“
      - „Höchstens eine Mitteilung pro Tag und Challenge.“
    - „Mitteilungen erlauben“ fragt iOS. „Jetzt nicht“ vertagt: frühestens nach 3, dann nach 7 Tagen wieder nach einem Satz, höchstens dreimal.
    - Nach einer Ablehnung kommt kein Vorab-Bildschirm mehr. Die Einstellungen zeigen dann „In den iOS-Einstellungen ausgeschaltet.“ und springen per `app-settings:` dorthin.
    - Wer den Schalter in den Einstellungen einschaltet, wird direkt gefragt.
    - Ist die Erlaubnis schon da, registriert sich das Gerät wie bisher, jetzt mit den Listenern vor `register()`.
13. **Startkarte statt Zwangs-Tutorial.**
    - Auf Home steht „Startklar“ mit bis zu vier Punkten: Leute einladen, Wochenziel, erster Satz, Mitteilungen. Nur für neue Leute und nur in den ersten 14 Tagen einer Challenge.
    - Jeder Punkt öffnet seinen Schritt. Erledigt ist, was die Daten hergeben.
    - Die Karte lässt sich wegtippen und verschwindet, wenn alles erledigt ist.
    - Wer mitten in der Woche beitritt, liest dort „Die Woche läuft seit Montag · noch 4 Tage“.
14. **Leere Zustände führen weiter.**
    - Feed: „Ersten Satz loggen“, allein zusätzlich „Einladen“.
    - Stats: „Woche 1 läuft. Ab Montag steht hier eure erste Bilanz.“, solange keine Woche vorbei ist.
    - Strafkonto: „Noch sauber.“ plus die Regel in einer Zeile.
15. **Die erste Woche wird gefeiert.**
    - Beim ersten Öffnen in Woche 2 einer Mitgliedschaft kommt „Woche 1 geschafft 🏁“.
    - Gezeigt werden eigene Reps, aktive Tage, erfüllte Teile und das Ergebnis („Du hast die Woche geholt 🏆“, „Jonas lag 20 vorne. Revanche?“, „Solo durchgezogen.“).
    - „Auf in Woche 2“ öffnet das Wochenziel, falls noch keins steht.
16. **Gerät in localStorage, Konto im Profil.**
    - Gerät: `pt:returning`, `pt:invite`, `pt:push-primer`, `pt:onboarding:<userId>`.
    - Konto: neue Spalte `profiles.onboarding jsonb` aus der Migration `20261020000000_profile_onboarding.sql`, die nicht auf Produktion läuft. Sie hält „begonnen“, „Profil erledigt“, weggetippte Startkarten und gesehene Wochenrückblicke.
    - Die App erkennt die Spalte am geladenen Profil. Fehlt sie, schreibt sie nur localStorage.
17. **Bestehende Daten bleiben unberührt.** Es gibt keinen Datenumzug und keine geänderten RPCs. Die Regeln für Anteil und Strafen bleiben gleich (siehe „Bewusst offen“).
18. **Ein Beitritt räumt alte Feiern ab.** Wer neu beitritt, bekommt keine Vollbild-Feier für Gruppenziele, die schon vorher geknackt waren.
19. **Offline:**
    - Onboarding-Bildschirme zeigen „Offline“ und sperren Aktionen, die Netz brauchen.
    - Netzfehler heißen „Keine Verbindung. Prüf dein Internet.“
    - Scheitert das Laden beim Start, versucht die App es von selbst wieder, sobald das Netz zurück ist.
20. **Die Demo spielt alles durch.**
    - „Demo ansehen“ öffnet wie bisher Bennys volle Challenge.
    - „Los geht's“ im Demo-Modus legt eine neue Person an und läuft durch das ganze Onboarding. Nach „Einladung senden“ tritt nach ein paar Sekunden eine Demo-Person bei.
    - Die Einstellungen haben im Demo-Modus „Eine Woche vorspulen“ (für den Wochenrückblick) und „Demo zurücksetzen“.
    - `?demo=new` startet die Demo abgemeldet. `localStorage.pt_demo_confirm = '1'` spielt die Mail-Bestätigung durch, `localStorage.pt_demo_offline = '1'` lässt alle Aufrufe wie ohne Netz scheitern.

## Aufbau
Alle Bildschirme haben oben einen Zurück-Knopf, wo es zurück geht, und unten die Aktion in Daumenreichweite. Abstände kommen aus den Safe Areas. Klassen tragen das Präfix `ob-`.

**Ohne Konto**
- *Willkommen:* „Projekt Terminator“, Mini-Duellkarte („Du 120 : 95 Jonas“, Balken wachsen, darunter „🔥 Jonas · +20 Liegestütze · gerade eben“).
  - Titel „Trainier gegen deine Freunde.“, darunter „Ein Wochenziel, jeder seinen Teil, und du siehst live, wer liefert.“
  - Knöpfe „Los geht's“, „Code eingeben“ und „Demo ansehen“, Link „Schon dabei? Anmelden“.
  - Mit offener Einladung: Hinweis „Einladung · Code ABC123“ und „Konto erstellen & beitreten“.
- *Code eingeben:* „Hast du einen Code?“ mit Codefeld und „Einfügen“, „Weiter“ merkt die Einladung und öffnet die Registrierung.
- *Konto erstellen:* „E-Mail“ und „Passwort“ (mind. 6 Zeichen, mit Auge zum Einblenden), dann „Weiter“.
- *Anmelden:* „Willkommen zurück“, „Passwort vergessen?“, „Neu hier? Konto erstellen“.
- *Passwort vergessen:* der bisherige Code-Ablauf, neu gestaltet.
- *Check deine Mails:* „Wir haben dir einen Link an … geschickt. Tipp ihn an und komm zurück.“

**Mit Konto, ohne Challenge**
1. *Profil:* „Wie sollen dich die anderen sehen?“ mit großem Avatar („Foto wählen“) und Name, dann „Weiter“.
2. *Offene Einladung → Beitreten*, sonst *Start:* „Hi Lenn 👋 / Wie startest du?“
   - Karte „Challenge starten“ („Du lädst deine Leute ein.“)
   - Karte „Ich habe einen Code“ („Jemand hat dich eingeladen.“)
   - Link „Erst mal die Demo ansehen“
3. *Beitreten:* Codefeld, dann die Vorschau.
   - Die Vorschau zeigt Emoji, Name, Modus, „1/2 dabei“, die Mitglieder, bei 2 vs 2 die Teamwahl und, falls die Woche schon läuft, „Die Woche läuft seit Montag · noch 4 Tage“.
   - Mögliche Hinweise: „Du bist schon dabei.“, „Diese Challenge ist voll.“, „Code nicht gefunden.“
   - „Ohne Code weiter“ verwirft die offene Einladung.
4. *Erstellen:* siehe Entscheidung 8, Knopf „Challenge erstellen“.

Abbruch an jeder Stelle: Beim nächsten Start führt die Ableitung aus Entscheidung 1 wieder zum richtigen Bildschirm. Steht die Challenge schon, übernimmt die Startkarte.

**In der Challenge (Ebenen über der App)**
- *Ersteller (neu):* Einladen → Wochenziel → Erster Satz → Feier → Push-Vorab → Home.
- *Eingeladene (neu):* Wochenziel, falls diese Woche keins steht → Erster Satz → Feier → Push-Vorab → Home.
- *Bestehende Konten:* nach dem Erstellen nur Einladen, nach dem Beitreten wie bisher „Willkommen in der Challenge 💪“.
- *Einladen:* „Challenge steht 🎉“, dann je nach Modus „Fehlt nur noch dein Gegner.“, „Fehlen noch drei.“ oder „Hol deine Leute rein.“ Darunter die Plätze, der Code mit „Kopieren“, „Einladung senden“ und „Weiter“ (vor dem Teilen „Später einladen“).
- *Wochenziel:* „Euer erstes Wochenziel / Was macht ihr bis Sonntag?“. Übungskarten, Menge mit −/+ und Chips, darunter „pro Person bis Sonntag · zusammen 200“. Knöpfe „Ziel setzen“ und „Später“.
- *Erster Satz:* „Dein erster Satz / Mach ein paar Liegestütze. Wir warten.“ Bei mehreren Zielen eine Übungswahl. Knöpfe „+10 loggen“ und „Später“.
- *Feier:* „Erster Satz! 💪“, „+10“, Ring „10 von 100 · dein Teil diese Woche“, Knopf „Weiter“.
- *Push-Vorab:* „Bleib im Rennen“ mit den zwei Zeilen aus Entscheidung 12. Knöpfe „Mitteilungen erlauben“ und „Jetzt nicht“.
- *Woche 1:* siehe Entscheidung 15.

**Home**
- *Startklar* (Entscheidung 13): „x von 4“, ✕ zum Ausblenden. Die Punkte heißen „Leute einladen“, „Wochenziel setzen“, „Ersten Satz loggen“, „Mitteilungen an“.
- *Einladen-Karte* für alle, die allein sind, solange keine Startkarte steht: Avatare und freie Plätze, „Noch allein hier.“, „Schick deinen Leuten den Code ABC123.“ und „Einladen“.
- *Tipp am Schnellsatz:* „Satz gemacht? Tipp hier.“ (Pfeil auf den ersten Zahl-Chip)
- Neue Mitglieder: Toast „Jonas ist dabei 🎉“.

**Einstellungen**
- Push-Schalter: Einschalten fragt iOS direkt. Ist die Erlaubnis abgelehnt, steht der Hinweis unter dem Schalter, dazu „iOS-Einstellungen öffnen“.
- Im Demo-Modus gibt es die Gruppe „Demo“ mit „Eine Woche vorspulen“, „Demo zurücksetzen“ und „Demo beenden“.

## Code
- `www/onboarding-model.js` (neu, ohne React, `window.PTOnboarding`):
  - Codes und Links (`normalizeCode`, `parseInviteUrl`, `inviteLink`, `inviteText`)
  - Einstieg (`entryRoute`, `isNewcomer`, `suggestName`)
  - Startkarte und Tipps (`starterItems`, `showStarter`)
  - Wochenziel (`expectedPeople`, `goalDefault`, `goalTarget`)
  - Push (`pushPrimerDue`, `nextPrimerState`)
  - Wochenrückblick (`weekOneDue`, `weekOneSummary`)
  - Beitritt mitten in der Woche (`weekProgress`) und Zusammenführen des Stands (`mergeState`)
- `www/onboarding.jsx` (neu): Bausteine (`ObScreen`, `ObCodeField`, `useObOnline`, `PTHaptics`, `PTSound`), Willkommen, Auth inklusive Mail-Bestätigung, Profil, Start, `CreatePanel` und `JoinPanel`. Dazu die Sheets `CreateCompetitionSheet` und `JoinCompetitionSheet` für die zweite Challenge.
- `www/onboarding-intro.jsx` (neu): die Ebenen in der Challenge (Einladen, Wochenziel, Erster Satz, Feier, Push-Vorab, Woche 1), `ObStarterCard`, `ObInviteCard`, dazu `PTPush`.
- `www/onboarding.css` (neu): alle `.ob-*`-Klassen. Sie nutzen nur die Tokens aus `redesign.css` und liegen hinter `redesign.css`.
- `www/competitions.jsx`: `AuthScreen`, `OnboardingScreen` und die alten Erstellen-/Beitreten-Sheets fallen weg. `shareInvite` nutzt `PTOnboarding.inviteText`.
- `www/app.jsx`: Einstieg über `entryRoute`, offene Einladungen (URL, `appUrlOpen`, Kaltstart) und die Ebenen-Reihenfolge. Außerdem Push ohne automatische Abfrage, Mitglieder-Toast, erwartete Teilnehmer für den Anteil, Offline-Neustart und Haptik beim Schnellsatz.
- `www/screens.jsx`: Tipp am Schnellsatz (`coach`). `www/feed.jsx`, `www/stats-global.jsx`, `www/strafkonto.jsx`: leere Zustände. `www/settings.jsx`: Push-Schalter und Demo-Gruppe.
- `www/data.js`:
  - `signUp` liefert `{ session, user, needsConfirm }`, neu ist `resendSignup`.
  - `friendlyError` kennt Codes und Netzfehler und wird für Tests exportiert.
  - Neu ist `saveOnboarding`.
- `www/demo.js`: mehrere Konten mit eigener Session (`pt_demo_user`), Profil beim Registrieren, Beitritts-Simulation nach dem Teilen, `PTDemo.shiftWeek()`, simulierte Mail-Bestätigung, Avatar als Data-URL, Demo-Datenbank Version 2.
- `www/index.html`: neue Skripte, CSS und `@capacitor/app` (nur nativ).
- `ios/App/App/Info.plist`: `CFBundleURLTypes` mit `projektterminator`. `package.json`, `package-lock.json` und `ios/App/CapApp-SPM/Package.swift` bekommen `@capacitor/app` (über `npx cap sync ios`).
- `supabase/migrations/20261020000000_profile_onboarding.sql`: Spalte und Update-Recht.
- `tests/onboarding.test.cjs`: Modell und Fehlertexte, Muster wie `tests/feed.test.cjs`.

## Prüfung
- `node --test tests/` muss grün sein.
- Browser im Demo-Modus mit 375 px Breite, hell und dunkel, Konsole ohne Fehler. Zwei Läufe von Null (`?demo=new`, localStorage leer):
  - als Ersteller bis zum ersten Satz und Push-Vorab
  - als Eingeladener über `?join=<Code>` bis zum ersten Satz
- Dazu:
  - Abbruch nach Registrierung, nach Profil und nach dem Erstellen
  - zweite Challenge über den Switcher
  - Beitritt mitten in der Woche
  - offline (DevTools)
  - Mail-Bestätigung (`pt_demo_confirm`)
  - Woche vorspulen → Woche 1
  - bestehendes Konto (Benny) ohne neue Hinweise
- iOS-Simulator: Build, Start, `projektterminator://join/BJ4K7X` per `simctl openurl`.

## Bewusst offen
- **Universal Links** (https-Einladungen, die überall antippbar sind) brauchen eine Domain mit `apple-app-site-association` und die Fähigkeit „Associated Domains“ im App-ID-Profil.
- **Sätze offline zwischenspeichern** (Warteschlange mit Abgleich).
- **Meilenstein-Push** („Wochenziel geknackt“). `notify-set` schickt heute nur den Rivalen-Push, deshalb verspricht der Vorab-Bildschirm nur den.
- **Anteil bei Beitritt mitten in der Woche:** Wer am Donnerstag beitritt, schuldet nach `participantsFor` den ganzen Wochenanteil. Strafen in einer 1 vs 1, in der der Gegner nie beitritt, rechnen mit einer Person. Beides wäre eine Regeländerung für alle.
- **Kaltstart ganz ohne Netz:** React und Babel kommen per CDN; ohne Verbindung beim allerersten Laden bleibt die App leer. Das betrifft die ganze App und bräuchte gebündelte Skripte.
- **Sign in with Apple**, Bildzuschnitt fürs Profilbild.
