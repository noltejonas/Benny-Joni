# Passwort-E-Mails mit dem vorhandenen Gmail-Konto

Stand 21. Oktober 2026: **SMTP-Versand und Recovery-Code-Verifikation bestanden**.
Der Management-Readback bestätigt `smtp.gmail.com:587`, Benutzer und
Absender `bennyundjoni@gmail.com`, Absendername `Benny & Joni` und ein
vorhandenes SMTP-Passwort. Der Passwortwert wird nicht ausgegeben.
Eine eigene Testmail wurde zugestellt und der achtstellige Recovery-Code
erfolgreich geprüft. Das Setzen eines neuen Passworts in der App und die
anschließende Anmeldung mit diesem Passwort wurden dabei nicht getestet.

## Tatsächlicher Readback

Die produktive Supabase-Auth-Konfiguration wurde nach dem Speichern rein lesend geprüft:

| Einstellung | Bestätigter Wert |
|---|---|
| Eigener SMTP-Host | `smtp.gmail.com` |
| SMTP-Port | `587` |
| Benutzer / Absenderadresse | `bennyundjoni@gmail.com` |
| Absendername | `Benny & Joni` |
| SMTP-Passwort | Vorhanden; nur Existenz bestätigt, kein Wert ausgegeben |
| E-Mail-Limit | 30 Nachrichten pro Stunde |
| Mindestabstand | 60 Sekunden |
| Recovery-Vorlage | Enthält `{{ .Token }}`, keinen `{{ .ConfirmationURL }}` |
| OTP-Länge | **Acht Ziffern**, beibehalten |
| OTP-Gültigkeit | 3600 Sekunden |
| E-Mail-Autoconfirm | Aktiviert, unverändert; Registrierungsbestätigung nicht getestet |

Die App akzeptiert den Code ohne feste Längenbegrenzung und übergibt ihn an
`verifyOtp` mit `type: 'recovery'`. Die acht Ziffern erfordern keinen neuen
App-Build. Der Codekommentar in `www/data.js` nennt noch sechs Ziffern;
die tatsächliche Oberfläche verlangt nur den Code aus der E-Mail.
Die öffentliche Supportseite ist bereits längenneutral korrigiert:
[Support](https://noltejonas.github.io/Benny-Joni/support.html), HTTP 200
und bytegleich mit `docs/launch/site/support.html` geprüft. Der Root-Pages-
Commit `9b55f30aa335f51d22de554c3749f8af8371a3fd` ändert ausschließlich
`Benny-Joni/support.html`; der Pages-Build ist abgeschlossen.

## Durchgeführter Test

Mit einem eigenen, kurzzeitig angelegten Plusalias-Testkonto wurde genau
eine Recovery-Mail angefordert (HTTP 200). Empfänger, Absender und
achtstelliger Code wurden im eigenen Gmail-Postfach geprüft; die Mail kam
am 21. Oktober 2026 um 17:26 Uhr an. `verifyOtp` mit `type: 'recovery'`
antwortete mit HTTP 200; der authentisierte `/user`-Abruf bestätigte mit
HTTP 200 dasselbe Testkonto. Es wurde kein Passwort geändert.

Das Testkonto wurde anschließend gelöscht (DELETE 200, GET 404); auch das
Profil war danach entfernt. Code- und temporäre Passwortdatei wurden
gelöscht. Die dauerhaften Store-Review-Konten blieben unberührt.
Geheimnisfreier lokaler Beleg: `.local/qa/smtp-20261021/status.json`.

Die öffentliche Datenschutzerklärung nennt den tatsächlichen Gmail-Versand
und die verarbeiteten Recovery-Daten. Die gezielte Aktualisierung ist
veröffentlicht und bytegleich geprüft (HTTP 200, Pages-Build abgeschlossen;
Root-Pages-Commit `d783559a9531169b29341ef0070aea85c9cefc53`, ausschließlich
`Benny-Joni/datenschutz.html`).

## Hinterlegte Konfiguration und erneute Einrichtung

1. Im Google-Konto **bennyundjoni@gmail.com** die Zwei-Faktor-Authentifizierung
   selbst einrichten bzw. bestätigen. Dann
   [App-Passwörter](https://myaccount.google.com/apppasswords) öffnen und ein
   eigenes App-Passwort für „Supabase SMTP“ erstellen. Google verlangt dafür
   aktivierte Zwei-Faktor-Authentifizierung; manche Kontoschutz-Einstellungen
   können die Option ausblenden. [Google: App-Passwörter](https://support.google.com/accounts/answer/185833?hl=de)
2. In Supabase → Authentication → E-Mail-/SMTP-Einstellungen diese Werte
   vorbereiten. Das App-Passwort trägt der Nutzer direkt ins geschützte
   Passwortfeld ein; es gehört weder in Chat noch Repository oder Screenshot.

| Supabase-Feld | Wert |
|---|---|
| SMTP host | `smtp.gmail.com` |
| SMTP port | `587`, TLS/STARTTLS |
| Username | `bennyundjoni@gmail.com` |
| Password | Das für diesen Zweck erstellte Google-App-Passwort |
| Sender email | `bennyundjoni@gmail.com` |
| Sender name | `Benny & Joni` |

Google dokumentiert SMTP mit TLS und Port 587; Supabase benötigt Host, Port,
Benutzer, Passwort und Absender. Das normale Google-Kontopasswort wird hier
nicht verwendet. Bestehende Auth-Optionen wie Autoconfirm und OTP-Länge bleiben
erhalten. [Google: Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp),
[Supabase: eigener SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)

3. Die vorhandene Recovery-Vorlage mit `{{ .Token }}` beibehalten. Die App
   nutzt den Code in der E-Mail statt eines Bestätigungslinks.
   [Supabase: Vorlagenvariablen](https://supabase.com/docs/guides/auth/auth-email-templates)
4. Nach späteren Konfigurationsänderungen den Versand und die Code-Prüfung
   mit einem separaten eigenen Testkonto wiederholen. Für einen vollständigen
   Test der Passwortoberfläche zusätzlich ein neues Passwort setzen und sich
   damit erneut anmelden. Den hinterlegten Store-Review-Zugang dafür nicht
   verändern. Dieser zusätzliche Oberflächentest ist noch offen.

Supabase- und Gmail-Versandlimits gelten gemeinsam. Das Live-Limit steht
jetzt bei 30 pro Stunde. Für private Gmail-Konten nennt Google mehr als 500 Nachrichten
pro Tag als möglichen Sperrauslöser; das ist keine garantierte Sendekapazität
für ein neues Konto. [Google: Gmail-Limits](https://support.google.com/mail/answer/22839?hl=de)

Das bestehende Support-Konto reicht für diesen vorbereiteten Weg. Es wurden
kein weiterer Versanddienst und kein neues Konto eingerichtet.
