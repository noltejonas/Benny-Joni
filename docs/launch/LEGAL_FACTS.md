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
- AdMob: nur nicht personalisierte Anfragen, UMP-Freigabe vor Werbung,
  Publisher-first-party-ID deaktiviert. Das schließt technische Kennungen,
  Android-Werbe-ID/App-Set-ID und Diagnosedaten des SDKs nicht pauschal aus.
  Banner können bewegte Inhalte enthalten; keine Vollbild-/Prämien-Placements.

## Noch am tatsächlich verwendeten Dienst prüfen

Die bestehende Supabase Management API bestätigt für das aktive Projekt am
21. Oktober 2026 die Region `eu-west-1` und den Tarif Free. Es ist kein eigener
SMTP-Server konfiguriert; das Standardlimit beträgt zwei E-Mails pro Stunde,
und automatische E-Mail-Bestätigung ist aktiviert. Produktionsfähiger
Passwort-Reset-Versand ist damit noch nicht nachgewiesen.
Der aktuelle Readback bestätigt `{{ .Token }}` in der Recovery-Vorlage,
keinen Bestätigungslink und eine OTP-Länge von acht Ziffern. Die App
akzeptiert diese Länge; ein neuer Build ist dafür nicht erforderlich.
Der Gmail-SMTP-Weg mit notwendiger Nutzerübergabe ist in [SMTP.md](SMTP.md)
vorbereitet; dabei wurden weder Auth-Einstellungen geändert noch E-Mails versendet.
Die längenneutrale Recovery-Anleitung auf der öffentlichen Supportseite ist
veröffentlicht und bytegleich geprüft (HTTP 200; Root-Pages-Commit
`9b55f30aa335f51d22de554c3749f8af8371a3fd`, nur `Benny-Joni/support.html`).

Diese Punkte werden auf den öffentlichen Seiten nicht durch erfundene
Anbieter-, Regions- oder Tagesangaben ersetzt:

- Tatsächlich anwendbarer Supabase-Vertrag/DPA und produktive E-Mail-Zustellung.
- Aufbewahrungszyklen von Serverprotokollen und Sicherungskopien. Die Erklärung
  beschreibt deren Konfigurationsbezug, verspricht weder 1–7 Tage noch eine
  ausschließlich europäische Verarbeitung.
- Produktions-SMTP: eigenen Versanddienst einrichten und erfolgreichen
  Registrierungs-/Passwort-Reset-Versand an eine Adresse außerhalb des
  Supabase-Teams. Der Standard-SMTP von Supabase ist laut Dokumentation ein
  Testdienst mit eingeschränktem Empfängerkreis.
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
