# Archiv

Dateien, die früher in `www/` lagen und damit in jedem App-Build steckten
(`webDir: "www"` in `capacitor.config.json`). Sie werden in der App nicht
gebraucht und sind hierher verschoben, nicht gelöscht (Launch 21.10.2026).

| Ordner | Inhalt | Warum nicht mehr in `www/` |
|---|---|---|
| `www-setup/` | `SETUP.md`, `SETUP_*.sql`, `IOS_DEPLOY.md` | Alte Setup-Anleitungen aus der Zeit vor den Migrationen. Maßgeblich ist heute `supabase/migrations/`. Im IPA hätte jeder Schema und Policies lesen können. |
| `uploads/` | Bildschirmfotos vom 11.05.2026 und ein ChatGPT-Bild | Nirgends referenziert, zusammen ca. 16,5 MB Downloadgröße. |
| `icons/` | `source.png` und `appicon/` | Quellen für das App-Icon. Das iOS-Icon kommt aus `ios/App/App/Assets.xcassets/AppIcon.appiconset`. |

In `www/uploads/` bleiben nur `benny.jpg` und `jonas.jpg` (Demo-Avatare,
`www/demo.js`). In `www/icons/` bleiben die Icons, die `index.html` und
`manifest.webmanifest` brauchen.

Ältere Pläne unter `docs/superpowers/` verweisen noch auf `www/SETUP_*.sql`.
Das ist Historie; die Dateien liegen jetzt hier.
