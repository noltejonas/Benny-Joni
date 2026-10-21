# Passwort-E-Mails mit dem vorhandenen Gmail-Konto

Stand 21. Oktober 2026: **vorbereitet, nicht eingerichtet**. Bei dieser
Prüfung wurden keine Auth-Einstellungen geändert und keine E-Mails versendet.
Das Supabase-Formular ist inzwischen vorbereitet: Host, Port 587, Benutzer,
Absenderadresse und Absendername sind korrekt befüllt. Der SMTP-Schalter ist
nur im **ungespeicherten Formular** an; das Passwortfeld ist leer und Save
wurde nicht betätigt. Im benachbarten Google-App-Passwortdialog steht die
Passkey-Bestätigung durch den Nutzer aus. Die Aufforderung, ein App-Passwort
selbst zu erstellen, direkt ins Supabase-Passwortfeld einzutragen und zu
speichern, ist übergeben; eine Antwort liegt noch nicht vor.

## Tatsächlicher Readback

Die produktive Supabase-Auth-Konfiguration wurde rein lesend geprüft:

| Einstellung | Bestätigter Wert |
|---|---|
| Eigener SMTP-Host | Nicht konfiguriert |
| SMTP-Port | Nicht gesetzt |
| E-Mail-Limit | Zwei Nachrichten pro Stunde |
| Mindestabstand | 60 Sekunden |
| Recovery-Vorlage | Enthält `{{ .Token }}`, keinen `{{ .ConfirmationURL }}` |
| OTP-Länge | **Acht Ziffern**, beibehalten |

Die App akzeptiert den Code ohne feste Längenbegrenzung und übergibt ihn an
`verifyOtp` mit `type: 'recovery'`. Die acht Ziffern erfordern keinen neuen
App-Build. Der Codekommentar in `www/data.js` nennt noch sechs Ziffern;
die tatsächliche Oberfläche verlangt nur den Code aus der E-Mail.
Die öffentliche Supportseite ist bereits längenneutral korrigiert:
[Support](https://noltejonas.github.io/Benny-Joni/support.html), HTTP 200
und bytegleich mit `docs/launch/site/support.html` geprüft. Der Root-Pages-
Commit `9b55f30aa335f51d22de554c3749f8af8371a3fd` ändert ausschließlich
`Benny-Joni/support.html`; der Pages-Build ist abgeschlossen.

## Nutzerübergabe und Konfiguration

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
4. Erst nach tatsächlichem Speichern und erneuter Prüfung der Konfiguration
   mit einem separaten eigenen Testkonto an einem Postfach außerhalb des
   Supabase-Teams „Passwort vergessen“ durchlaufen: Zustellung, achtstelliger
   Code, neues Passwort und erneute Anmeldung. Damit bleibt der hinterlegte
   Store-Review-Zugang unverändert. Einen Erfolg erst nach diesem Test melden.

Supabase- und Gmail-Versandlimits gelten gemeinsam. Das Live-Limit steht
derzeit bei zwei pro Stunde; nach der Einrichtung erneut ablesen und bewusst
festlegen. Für private Gmail-Konten nennt Google mehr als 500 Nachrichten
pro Tag als möglichen Sperrauslöser; das ist keine garantierte Sendekapazität
für ein neues Konto. [Google: Gmail-Limits](https://support.google.com/mail/answer/22839?hl=de)

Das bestehende Support-Konto reicht für diesen vorbereiteten Weg. Es wurden
kein weiterer Versanddienst und kein neues Konto eingerichtet.
