# Hinweise für die App-Prüfung

Anbieter sind Jonas Nolte und Benjamin Frey, beide unter Furtbachstraße 16A,
70178 Stuttgart, Deutschland. Support und Review-Ansprechpartner: Jonas Nolte,
`bennyundjoni@gmail.com`, `+491781479821`. Die Support-Adresse ist in der App
hinterlegt. Ein funktionierendes Review-Setup ist vorbereitet; Login und
Einladungscode sind ausschließlich privat konfiguriert.

Die englischen Notizen zwischen den Markierungen werden von Fastlane
übernommen. Der Einladungscode wird ausschließlich aus `REVIEW_CODE` in der
ignorierten `.env` eingesetzt. Die tatsächlichen Kontaktdaten und der echte
Login kommen aus `REVIEW_FIRST_NAME`, `REVIEW_LAST_NAME`, `REVIEW_EMAIL`,
`REVIEW_PHONE`, `REVIEW_USER` und `REVIEW_PASSWORD`.

Die kontrollierten Profile „Benny Demo“ und „Joni Demo“ gehören zu einer eigenen
Demo-Challenge mit aktuellen Wochenzielen, synthetischen Sätzen und Reaktionen.
Beide Logins wurden geprüft; die Profile haben normale Nutzerrechte und die
globale Ranglistenteilnahme ist deaktiviert. Die Challenge lässt zusätzliche
Prüfer per Einladung zu. Der zweite Zugang liegt geschützt unter
`.local/review/rival.env`; er gehört nicht in öffentliche Notizen. Ein Reservekonto
erleichtert spätere Prüfungen, falls Apple die Kontolöschung am ersten Konto
testet. Teile der schreibenden Gerätefunktionstests sind bestanden, weitere
Prüfungen bleiben offen; Details stehen in [RELEASE.md](RELEASE.md).
Für den Launch ist die Werbefunktion zentral ausgeschaltet; weder Werbung
noch UMP-Dialog sollen erscheinen. Die folgenden Notizen wurden am 28. Oktober 2026 für das Update mit
Finnisch/Schwedisch, eigenen Übungen, Workout-Häufigkeit und Arschkicks
überarbeitet. Den aktuellen Upload- und Einreichungsstand dokumentiert
[RELEASE.md](RELEASE.md); ältere Review-Angaben aus dem Launch gelten dafür
nicht als Bestätigung.

<!-- review-notes:start -->
Benny & Joni is a fitness challenge app. Friends agree on weekly goals, log sets and follow their group's progress in a private challenge feed. An app-wide leaderboard is optional.

LANGUAGE AND ACCESS
German, English, Finnish and Swedish are available under Settings > App > Language. Sign in with the production review account in App Review Information; it belongs to a prepared challenge with sample activity. The welcome screen's "Try the demo" uses local sample data without an account.

THIS UPDATE
Custom exercises now save with their correct name and identity. Bring Sally Up and other compulsory workouts support a chosen number of saved runs per person per week. Existing workout goals retain one run. Time and round results remain separate from the weekly run count.

HOW TO REVIEW
1. Log a set, then review Feed and Stats.
2. Today > Add weekly goal > Own exercise: enter a name and press Save. The saved goal uses that custom exercise.
3. Create or edit a Bring Sally Up goal and choose multiple runs per person per week. Each saved attempt counts towards that person's goal; a teammate's extra runs do not replace it.
4. Settings > Participants: "Kick" sends a fixed, playful training reminder to another active member. The recipient can disable these under Settings > App > Receive kicks. Push delivery requires a registered iOS device and enabled notifications; Android does not yet receive pushes. Kicks respect block lists, one per sender/recipient per day, a maximum of three received per day, and quiet hours (22:00-07:00 Berlin time). In the local demo the action is simulated and sends nothing.
5. To test joining, register another account and enter invite code: [BITTE AUSFÜLLEN: Einladungscode].

LEADERBOARD AND MODERATION
Leaderboard opt-in makes the display name, profile photo and ranked exercise results visible to other app users; it is reversible in Settings. Email addresses and private challenge details stay private. Feed entries and leaderboard profiles can be reported or their author blocked. Settings contains the blocked list. Leaderboard reports enter a moderation queue; challenge reports and general issues use the support links. Terms: https://noltejonas.github.io/Benny-Joni/nutzungsbedingungen.html

PENALTY POT AND ACCOUNT DELETION
The optional penalty pot records amounts privately agreed by a group. The app does not process, hold or transfer money, award cash prizes or offer in-app purchases. For deletion, open the avatar > Settings > Delete account and confirm. Please use a spare account so the supplied review login remains available.

ADS
The embedded AdMob feature remains centrally disabled. No ads, test ads, UMP consent dialog or advertising SDK initialization occur while the server switch is off. Startup and foreground checks fail closed. It may be enabled later after AdMob setup and Google's approval.
If enabled, only non-personalised banners appear in Feed and Stats after onboarding. No interstitial, rewarded or app-open ads. Ads stay absent from onboarding and the local demo, and hide under sheets/full-screen overlays. Google's UMP obtains consent where required; Settings > Ad consent provides privacy options when required. The app does not request ATT or supply training data, account IDs or challenge data to AdMob. Ads and SDK-data disclosures remain because the feature can be enabled remotely.

OTHER
Email/password login; optional user-chosen profile photos. Legal/support pages open externally. Support: Jonas Nolte, bennyundjoni@gmail.com, +49 178 1479821.
<!-- review-notes:end -->

Die Notizen beschreiben den vorgesehenen Release mit produktiven AdMob-IDs
und ausgeschalteter serverseitiger Freigabe.
`check_ads_live!` prüft die tatsächlich eingetragenen IDs und verhindert einen
App-Store-Build mit Testanzeigen. Vor dem Einreichen müssen die Angaben zu
Werbung und SDK-Daten mit dem tatsächlich hochgeladenen Build übereinstimmen.
Die Metadaten-Lane reicht nicht automatisch ein. Einreichungen erfolgen
getrennt für den ausdrücklich freigegebenen Update-Build und werden in
[RELEASE.md](RELEASE.md) mit dem zurückgelesenen Store-Status bestätigt.
