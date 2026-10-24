# Tatsachengrundlage der Rechts- und Supportseiten

Interne Arbeitsnotiz, Stand 21. Oktober 2026. Der Pages-Workflow veröffentlicht
nur `docs/launch/site/`; diese Notiz gehört nicht zur öffentlichen Website.

## Eingetragen und vom Nutzer vorgegeben

- Anbieter: Jonas Nolte und Benjamin Frey, gemeinsame Anschrift in Stuttgart.
- Support: `bennyundjoni@gmail.com`; direkter Telefonkontakt Jonas Nolte,
  `+491781479821`.
- Keine Firmenbezeichnung, Rechtsform, Register- oder Steuernummer erfunden.
  Eine für dieses Angebot tatsächlich vorhandene Umsatzsteuer- oder
  Wirtschafts-Identifikationsnummer muss nachgetragen werden; eine private
  Steuernummer gehört nicht ins Impressum.
- Ein Store-Download-Link wird erst nach Vorliegen des tatsächlichen
  Store-Eintrags gesetzt. Die Startseite nennt bis dahin die Vorbereitung.

## Aus dem Code beziehungsweise der Konfiguration abgeleitet

- Supabase Auth, Datenbank, Storage, Serverfunktionen und optionale technische
  Fehlerberichte. Maximal fünf Versuche für Fehlerberichte pro Sitzung;
  Konto-Löschung kaskadiert auf `client_errors`, wenn diese optionale Tabelle
  produktiv eingerichtet ist. Keine automatische 90-Tage-Löschung vorhanden.
- Profilbilder werden vor der Konto-Löschung über die Storage-API entfernt.
  Der Client prüft durch erneutes Listen, dass keine eigenen Dateien mehr
  übrig sind; bei Fehlern bleiben Konto und Sitzung zum Wiederholen erhalten.
  Keine Zusage einer ausnahmslos sofortigen Dateilöschung bei Netzwerkfehlern.
- Freiwillig öffentliche Ranglistenwerte; Challenge-Inhalte nur für Mitglieder.
  Profilbilder sind bei Kenntnis ihrer URL öffentlich abrufbar.
- iOS-Push über APNs; Android-FCM ist noch nicht eingerichtet.
- AdMob ist zum Launch serverseitig ausgeschaltet: `app_release_settings`
  mit `id = 1`, `ads_enabled = false`. Kein UMP-Dialog, kein Werbe-SDK-Start
  und keine Anzeigen, auch keine Testanzeigen. Bei späterer Freigabe gelten
  nur nicht personalisierte Anfragen und UMP-Freigabe vor Werbung,
  Publisher-first-party-ID deaktiviert. Das schließt technische Kennungen,
  Android-Werbe-ID/App-Set-ID und Diagnosedaten des SDKs nicht pauschal aus.
  Banner können bewegte Inhalte enthalten; keine Vollbild-/Prämien-Placements.

## Bestätigte Dienstkonfiguration

Die Ads-Gate-Migration `20261021140000_app_release_ads_gate` ist produktiv
angewendet und registriert. Der Readback bestätigt die ausgeschaltete Zeile,
aktive RLS, Client-Leserechte und gesperrte Client-Schreibrechte; Beleg:
`.local/qa/ads-release-gate-20261021/migration-readback.json`.
Nach Zahlungseinrichtung und Google-Freigabe ist eine spätere Aktivierung
per Supabase Table Editor oder entsprechendem Nutzerauftrag ohne weiteren
Store-Build vorgesehen. Vorher gibt es keine AdMob-Anzeigen und keinen
Aufbau von Werbeguthaben. Start, Vordergrundwechsel und Online-Rückkehr
lesen die Freigabe neu; Offline-Status bleibt aus. [Ablauf](ADMOB.md)

Die bestehende Supabase Management API bestätigt für das aktive Projekt am
21. Oktober 2026 die Region `eu-west-1` und den Tarif Free. Gmail-SMTP ist
als `smtp.gmail.com:587` mit Benutzer/Absender `bennyundjoni@gmail.com`,
Absendername `Benny & Joni` und vorhandenem Passwort gespeichert; der
geheime Wert wird nicht ausgegeben. E-Mail-Limit: 30 pro Stunde bei
60 Sekunden Mindestabstand. Die Recovery-Vorlage enthält `{{ .Token }}`,
keinen Bestätigungslink; die OTP-Länge beträgt acht Ziffern mit 3600 Sekunden
Gültigkeit. E-Mail-Autoconfirm bleibt aktiviert.

Zustellung einer eigenen Testmail, Recovery-Code-Verifikation und der
authentisierte Nutzerabruf sind bestanden. Das kurzzeitig angelegte
Testkonto samt Profil sowie Code-/temporäre Passwortdatei sind entfernt;
Store-Review-Konten blieben unberührt. Das Setzen eines neuen Passworts in
der App und die erneute Anmeldung damit wurden nicht getestet. Details und
geheimnisfreier Beleg stehen in [SMTP.md](SMTP.md).
Die konkrete Gmail-Nennung für Sicherheits-E-Mails ist auf der öffentlichen
Datenschutzseite ergänzt. HTTP 200 und Bytegleichheit sind bestätigt;
Root-Pages-Commit `d783559a9531169b29341ef0070aea85c9cefc53` ändert
ausschließlich `Benny-Joni/datenschutz.html`.
Die Hinweise zum zunächst ausgeschalteten Werbebetrieb in Datenschutz,
Nutzungsbedingungen, Start- und Supportseite sind ebenfalls gezielt
veröffentlicht: Root-Pages-Commit `b9ba3c78f3314c7f85c226f53cb80b2706b9a357`.
Alle vier Seiten wurden mit HTTP 200 und Bytegleichheit bestätigt; Beleg:
`.local/qa/ads-release-gate-20261021/pages-http-readback.json`.
Die längenneutrale Recovery-Anleitung auf der öffentlichen Supportseite ist
veröffentlicht und bytegleich geprüft (HTTP 200; Root-Pages-Commit
`9b55f30aa335f51d22de554c3749f8af8371a3fd`, nur `Benny-Joni/support.html`).

## Noch am tatsächlich verwendeten Dienst prüfen

Diese Punkte werden auf den öffentlichen Seiten nicht durch erfundene
Anbieter-, Regions- oder Tagesangaben ersetzt:

- Tatsächlich anwendbarer Supabase-Vertrag/DPA.
- Aufbewahrungszyklen von Serverprotokollen und Sicherungskopien. Die Erklärung
  beschreibt deren Konfigurationsbezug, verspricht weder 1–7 Tage noch eine
  ausschließlich europäische Verarbeitung.
- Die Passwortoberfläche bis zum Setzen eines neuen Passworts und erneuter
  Anmeldung prüfen; der separate SMTP-/Recovery-Code-Test ist bestanden.
  Eine Registrierungsbestätigung wurde bei aktiviertem Autoconfirm nicht
  getestet.
- Tatsächliche Betriebsabläufe für Entfernung von Fehlerberichten und
  beantworteten Support-Nachrichten sowie Bearbeitung von Inhaltsmeldungen.
  Die Moderationstexte nennen 24 Stunden; diese Zusage muss im Betrieb
  eingehalten werden. Für normale Support-Antworten ist keine feste Frist
  zugesagt.
- Die vorhandenen Nutzungsbedingungen enthalten weiterhin ein Mindestalter
  von 16 Jahren. Zielgruppenangaben in den Stores müssen dazu passen; die
  technische Registrierung enthält keine eigenständige Altersprüfung.

## Verwendete Primärquellen

- [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html)
- [DSGVO, insbesondere Art. 13 und 14](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de)
- [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Supabase: Datenstandorte und Übermittlungen](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
- [Supabase: SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Google: iOS-SDK-Daten](https://developers.google.com/admob/ios/privacy/data-disclosure)
- [Google: Android-SDK-Daten](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [GitHub-Datenschutzerklärung](https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement)
