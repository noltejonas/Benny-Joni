# iOS-Deploy → TestFlight

Web-App in nativen iOS-Container packen (Capacitor), in Xcode signieren, hochladen → Benny + Jonas installieren über TestFlight.

## Voraussetzungen
- **Mac** mit aktuellem **Xcode**
- **Apple Developer Account** ($99/Jahr) — hast du
- **Node.js** ≥ 20 (`node -v`)
- Bundle-ID: **`com.bennyjoni.terminator`**

## 1. Capacitor-Wrapper anlegen (einmalig)

In einem leeren Ordner auf dem Mac:

```bash
mkdir terminator-ios && cd terminator-ios
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Projekt Terminator" com.dein-nachname.terminator --web-dir=www
mkdir www
```

`capacitor.config.json` editieren:
```json
{
  "appId": "com.dein-nachname.terminator",
  "appName": "Projekt Terminator",
  "webDir": "www",
  "ios": { "contentInset": "always" }
}
```

## 2. Web-App reinkopieren

Alle Projektdateien (`index.html`, `app.jsx`, `screens.jsx`, `components.jsx`, `data.js`, `styles.css`, `tweaks-panel.jsx`, `manifest.webmanifest`, `icons/`) **in den `www/`-Ordner** kopieren.

Dann iOS-Plattform hinzufügen + syncen:
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

Xcode öffnet sich.

## 3. In Xcode: Signing + Build

1. Links im Projekt-Tree **App** anklicken → Tab **Signing & Capabilities**
2. **Team** auf deinen Developer-Account setzen
3. **Bundle Identifier** prüfen (`com.dein-nachname.terminator`)
4. Oben Device-Auswahl auf **„Any iOS Device (arm64)"** stellen
5. Menü **Product → Archive** (5–10 min Build)
6. Wenn fertig: **Distribute App → App Store Connect → Upload**

## 4. App Store Connect → TestFlight

1. https://appstoreconnect.apple.com → **Meine Apps → +** → Neue App anlegen (Bundle-ID auswählen, Name "Projekt Terminator", Sprache Deutsch, Kategorie Health & Fitness)
2. Nach Upload (5–15 min Processing): Tab **TestFlight**
3. **Interne Tester-Gruppe** anlegen, Jonas per Apple-ID-Mail einladen
4. Jonas bekommt Mail → installiert **TestFlight-App** aus App Store → akzeptiert Einladung → installiert Terminator

Interne Tests brauchen **keine Apple Review** → sofort verfügbar nach Processing.

## 5. Updates pushen

Bei jeder Code-Änderung:
```bash
# Web-Dateien aktualisieren in www/, dann:
npx cap sync ios
# Xcode → Version-Build hochzählen (z.B. 1.0 → 1.0.1) → Archive → Upload
```

Jonas bekommt das Update automatisch in TestFlight.

---

## Was noch optional sinnvoll ist

**App-Icons**: in `www/icons/` brauchst du `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`. Schnellster Weg: ein 1024×1024 PNG bauen (Canva/Figma), dann via https://www.pwabuilder.com/imageGenerator alle Größen auf einmal generieren. In Xcode landen die App-Icons unter `App/App/Assets.xcassets/AppIcon`.

**Echte Push-Notifications** (statt nur Browser-Notif): braucht
- `npm install @capacitor/push-notifications`
- APNs-Key in Apple Developer Portal generieren
- Supabase Edge Function, die bei neuem `sets`-Row APNs-Push schickt

Lohnt sich, wenn ihr aktiv pusht — können wir nachrüsten sobald die App-Basis läuft.

**Status-Bar Inset**: die App nutzt schon `viewport-fit=cover` + Safe-Area-CSS, sieht in TestFlight direkt sauber aus.
