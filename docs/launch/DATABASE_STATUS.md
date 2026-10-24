# Datenbank und Review-Setup – Stand 21.10.2026

Die folgenden Launch-Migrationen wurden im produktiven Projekt über den
offiziellen Supabase-Management-Endpunkt ausgeführt. Jede Änderung und ihre
ursprüngliche Versionsregistrierung wurden gemeinsam in einer SQL-Transaktion
übernommen. Die Bestandsdaten blieben erhalten.

| Migration | Produktiver Stand |
|---|---|
| `20261021000010_delete_account` | Eigene Kontolöschung, Vorbereitung des Austritts und Übergabe verbleibender Challenges aktiv. |
| `20261021000050_launch_vor_review` | Avatar-Bucket auf 2 MB und JPEG/PNG/WebP begrenzt; Listing nur für den eigenen Ordner; globaler Workoutname `20-Min-AMRAP`. |
| `20261021120000_disable_work_mode` | Work ist deaktiviert; ein Trigger setzt auch Schreibversuche älterer Clients auf `false`. Vorhandene Kategorien und Trainingshistorie bleiben erhalten. |
| `20261021130000_rotation_config_multi_competition` | Der alte Singleton-CHECK blockiert neue Challenges nicht mehr. Eindeutigkeit je Challenge und die übrigen Constraints bleiben erhalten. |
| `20261021140000_app_release_ads_gate` | Produktiv angewendet und atomar registriert. Öffentlicher Singleton `app_release_settings.id = 1`, `ads_enabled = false`; RLS aktiv, Clients ausschließlich SELECT. |

Die neue Rotation-Migration entfernt ausschließlich `rotation_config.single_row`,
wenn dessen CHECK-Ausdruck nach Normalisierung genau `id=1` entspricht. Eine
abweichende Definition bricht ab; ein bereits entfernter CHECK ist ein No-op.
Der erneute No-op wurde innerhalb einer zurückgerollten Transaktion geprüft.

## Werbefreier Launch und spätere Freigabe

Der Management-Readback bestätigt `ads_enabled = false`, anonyme Leserechte
und gesperrte Client-Schreibrechte (UPDATE für `anon`, UPDATE/INSERT/DELETE
für `authenticated`). Beleg:
`.local/qa/ads-release-gate-20261021/migration-readback.json`.
Die App fragt die Zeile bei Start, Vordergrundwechsel und Online-Rückkehr
frisch ab; unbekannte/fehlerhafte Antworten und Offline-Status bleiben aus.
Bis zur Freigabe startet sie weder UMP noch das Werbe-SDK und zeigt keine
Werbung oder Einwilligungsabfrage. Der neue iOS-Build 26 und Android-Build
mit Version Code 2 sind hochgeladen: Apple 26 wartet auf Prüfung, Android 2
liegt als interner Entwurf vor und ist in Produktion 2 zur Prüfung gesendet;
Google-Review läuft. Der Gate-false-Smoke ist im originalen
Android-Paket und nach seiner Wiederherstellung mit null Werbeaufrufen
bestanden. Die physische iPhone-Lese-/Lifecycle-QA und Teile der schreibenden
Funktionstests sind bestanden; weitere Prüfungen bleiben offen. Siehe
[RELEASE.md](RELEASE.md) und [ADMOB.md](ADMOB.md).

Nach AdMob-Zahlungseinrichtung, Googles Freigabe und der separaten Werbe-QA
kann ein berechtigter Betreiber die Zeile im Supabase Table Editor auf
`true` setzen; kein zusätzliches App-Update nötig. Konkreter Ablauf und
Prompt-Beispiel: [ADMOB.md](ADMOB.md). Zum späteren Ausschalten `false`
setzen; das beendet nach dem nächsten Abruf neue Werbeaufrufe und entfernt
Banner, deinitialisiert aber kein bereits gestartetes SDK.

## Tatsächlich geprüfte Abläufe

- Zwei frische Wegwerfkonten wurden ohne E-Mail-Versand angelegt und über den
  normalen Auth-Endpunkt angemeldet.
- Neue Challenges ließen sich mit normalen Nutzerrechten erstellen. Versuche,
  Work beim Erstellen oder Aktualisieren einzuschalten, blieben deaktiviert.
- Die authentisierte Kontolöschung entfernte eine allein genutzte Test-Challenge
  samt Testdaten. Eine gemeinsame Test-Challenge einschließlich Ersteller- und
  Ownerrolle ging an das verbleibende Testkonto; dessen Satz blieb erhalten.
- Die anschließende Löschung des zweiten Testkontos entfernte alle übrigen
  Wegwerf-Testdaten. Beide Löschungen antworteten mit HTTP 204; beide Lösch-RPCs
  wurden ohne Anmeldung mit HTTP 401 abgewiesen.
- Die Bestandsdaten waren nach der vollständigen Testbereinigung unverändert.
  Ein Deployment des optionalen `delete-account`-Edge-Fallbacks war nicht nötig.
- Ein kleines synthetisches PNG wurde in einem kontrollierten Demokonto
  hochgeladen, im eigenen Ordner gelistet und wieder entfernt. Anonyme und
  fremde Nutzer konnten den Ordnerinhalt nicht listen. Die erneute eigene Liste
  war leer; kein Testbild blieb gespeichert.

Die SQL-Kontolöschung selbst entfernt keine Storage-Dateien. Die App löscht die
eigenen Profilbilder vorher über die Storage-API und muss vor dem Lösch-RPC
abbrechen, wenn eine vollständige Dateilöschung nicht bestätigt ist.

## Dauerhaftes Store-Review-Setup

Die kontrollierten Profile **Benny Demo** und **Joni Demo** besitzen eine eigene
Demo-Challenge mit aktuellen Wochenzielen, ausdrücklich synthetischen Sätzen
und Reaktionen. Die Challenge ist per Einladung zugänglich und lässt weitere
Prüfer zu. Die Profile haben normale Nutzerrechte, nehmen nicht an der globalen
Rangliste teil und sind keiner echten Challenge beigetreten.

Der Hauptzugang und Einladungscode liegen ausschließlich als `REVIEW_USER`,
`REVIEW_PASSWORD` und `REVIEW_CODE` in der ignorierten
`ios/App/fastlane/.env`. Der zweite Zugang liegt unter `.local/review/rival.env`.
Die Zugangsdaten-Dateien haben Modus `0600`, der private Review-Ordner `0700`.
Beide Logins wurden geprüft. Es wurden keine E-Mails versendet und keine
Store-Uploads durchgeführt. Zugangsdaten und interne IDs gehören nicht in
öffentliche Store-Notizen oder ins Repository.

## Übrige Migrationshistorie

Mehrere Änderungen wurden früher offenbar ohne Eintrag in
`supabase_migrations.schema_migrations` ausgeführt. Der Schema- und
Funktionsvergleich bestätigt bereits vorhandene Funktionalität:

| Nicht registrierte Migration | Geprüfter Iststand |
|---|---|
| `20261004000000_workout_reps_today` | Funktionskörper entspricht der Datei; Pflicht-Workouts werden aus Wiederholungs-Pushsummen ausgeschlossen. |
| `20261020000000_profile_onboarding` | Spalte, Größenconstraint und Nutzer-Schreibrecht vorhanden. |
| `20261020120000_monthly_ranking` | Tabellen, Ranking-Funktionskörper, Trigger, Indizes, RLS und Monatsabschluss vorhanden. |
| `20261020130000_ranking_push_cron` | Stündlicher Ranking-Push aktiv; nutzt bereits den späteren Vault-Helper. |
| `20261021000000_profile_language` | Spalte, Sprachconstraint und Nutzer-Schreibrecht vorhanden. |
| `20261021080000_rank_crunches` | Crunches-Wertung einschließlich Metrik und Tagesgrenze vorhanden. |
| `20261021090000_ranking_opt_in_grant` | Effektives Nutzer-Schreibrecht vorhanden. |
| `20261021100000_webhook_secret_vault` | Helper und Triggerfunktion entsprechen der Datei; Vault-Konfiguration vorhanden. |

Diese vorhandenen Änderungen wurden weder erneut ausgeführt noch nachträglich
pauschal registriert. Vor einem späteren allgemeinen `db push` muss die
Historienlücke gezielt abgeglichen werden.

Die ausdrücklich für nach dem Launch vorgesehenen Migrationen bleiben offen:
`20261021000100_launch_optional` (insbesondere `client_errors`, derzeit nicht
vorhanden), `20261021001000_daily_nudge_cron` und
`20261021002000_social_push`. Tageserinnerungs- und Social-Push-Setup wurden
nicht aktiviert. Der bereits aktive Rivalen- und Ranking-Push bleibt bestehen.

Custom SMTP ist über Gmail (`smtp.gmail.com:587`) eingerichtet. Zustellung
einer eigenen Testmail, achtstellige Recovery-Code-Verifikation und
authentisierter Nutzerabruf sind bestanden; das temporäre Testkonto samt
Profil ist bereinigt. Die Passwortoberfläche bis zum neuen Passwort und
erneuter Anmeldung wurde dabei nicht getestet. Details: [SMTP.md](SMTP.md).

Referenzen: [offizieller SQL-Endpunkt](https://supabase.com/docs/reference/api/v1-run-a-query),
[Supabase-Migrationshistorie](https://supabase.com/docs/guides/deployment/database-migrations).
