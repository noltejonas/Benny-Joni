# Hinweise für die App-Prüfung

Anbieter sind Jonas Nolte und Benjamin Frey, beide unter Furtbachstraße 16A,
70178 Stuttgart, Deutschland. Support und Review-Ansprechpartner: Jonas Nolte,
`bennyundjoni@gmail.com`, `+491781479821`. Die Support-Adresse ist in der App
hinterlegt. Ein funktionierendes Review-Setup ist vorbereitet; Login und
Einladungscode sind ausschließlich lokal konfiguriert.

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
testet. Vor der Einreichung weiterhin prüfen, dass Anmeldung,
Einladung, Melden/Blockieren und Kontolöschung im hochgeladenen Build
funktionieren. Bei AdMob die echte Einwilligungsnachricht veröffentlichen;
Testanzeigen sind ausschließlich für TestFlight vorgesehen.

<!-- review-notes:start -->
Benny & Joni is a fitness challenge app. Friends agree on weekly exercise goals, log sets and follow their group's progress in a live feed. Challenges are joined by invite code. A separate, app-wide leaderboard is available to signed-in users; appearing in it is optional.

LANGUAGE AND ACCESS
The app supports German and English. Change the language in Settings > App > Language. Sign in with the production review account supplied in App Review Information. It belongs to a prepared challenge with sample activity. The welcome screen also offers "Try the demo" ("Demo ansehen"), which uses local sample data and needs no account.

HOW TO REVIEW
1. Sign in, open the challenge, log a set and review Feed and Stats.
2. To test joining, create another account, follow the registration prompts and enter this invite code: [BITTE AUSFÜLLEN: Einladungscode].
3. Open the leaderboard. The participation prompt explains that opting in makes the display name, profile photo and ranked exercise results visible to other app users. This choice can be changed under Settings > "In der Rangliste erscheinen". Email addresses and private challenge details are not displayed in the leaderboard.

USER CONTENT AND MODERATION
Challenge feeds are visible to their members. Opted-in leaderboard profiles and results are visible more broadly inside the app. Feed entries can be reported or their author blocked. Leaderboard profile sheets also provide reporting and blocking; Settings contains the blocked list. Leaderboard reports go to the moderation queue; challenge reports and general problems can be sent through the app's support links. Terms: https://noltejonas.github.io/Benny-Joni/nutzungsbedingungen.html

PENALTY POT
The optional "Strafkonto" records amounts agreed privately by a group when members miss their weekly share. The app does not process, hold or transfer money and awards no cash prizes. There are no in-app purchases.

ACCOUNT DELETION
Open Settings using the avatar at the top right, choose "Delete account" ("Konto löschen") and confirm the prompts. Please create a spare account for this test so the supplied review login remains available.

ADS
Google AdMob is integrated for banner ads in Feed and Stats. There are no interstitial, rewarded or app-open ad placements. Ads are absent from onboarding and the local demo and hidden while sheets or full-screen overlays are open. Only non-personalised ads are requested. Where required, Google's User Messaging Platform obtains consent; Settings > "Ad consent" ("Werbe-Einwilligung") reopens the privacy options when Google requires this entry point. Ad availability depends on consent status and supply. The app does not request ATT or provide training data, account IDs or challenge data to AdMob.

OTHER
Email and password sign-in; optional push notifications. Profile photos are chosen by the user. Legal and support pages open externally. Support contact: Jonas Nolte, bennyundjoni@gmail.com, +49 178 1479821. The store's Support URL and the contact supplied in App Review Information can also be used for questions.
<!-- review-notes:end -->

Die Notizen beschreiben den vorgesehenen Release mit produktiven AdMob-IDs.
`check_ads_live!` prüft die tatsächlich eingetragenen IDs und verhindert einen
App-Store-Build mit Testanzeigen. Vor dem Einreichen müssen die Angaben zu
Werbung und SDK-Daten mit dem tatsächlich hochgeladenen Build übereinstimmen.
Es wird weder automatisch eingereicht noch veröffentlicht.
