# Wochenziel-Celebration: Crazy-Effekt bei Ziel-Erreichen

**Status:** Spec — bereit für Implementation Plan
**Datum:** 2026-05-11

## Ziel

Wenn eine Wochen-Challenge ihr Ziel erreicht (`total_reps >= target_reps`), zeigt die App
eine intensive, mehrschichtige Feier im iMessage-Stil (Firework + Laser + Celebration als
Mashup). Der Effekt feuert einmalig pro User pro Challenge als Vollbild-Übernahme; danach
bleibt die Challenge-Karte für den Rest der Woche in einem von drei rotierenden
"Stolz-Modus"-Stilen.

## Scope

- Auslöser pro Challenge (jede Challenge feiert ihr eigenes Ziel separat).
- Beide User (Benny und Jonas) sehen die Vollbild-Show, je beim nächsten Öffnen der App
  bei dem die Show für sie noch ungesehen ist.
- Persistenter Modus rotiert per App-Session zufällig zwischen drei visuellen Stilen
  (Gold-Glow, Sparkle-Float, Trophy-Takeover).
- Sound + Haptic werden ausgelöst (iOS native via Capacitor Haptics + bundled MP3).
- `prefers-reduced-motion` Fallback auf abgespeckte Variante.

Nicht Teil dieser Spec: Backend-Änderungen, neue Datenbank-Tabellen, Realtime-Push (wir
nutzen den existierenden Supabase-Channel implizit über Resync beim Open), Konfetti-Library-Migration
(DOM-Partikel zuerst, Canvas erst wenn nötig).

## Architektur — drei Einheiten

### 1. `useCelebration(challenges, allSets, me)` Hook

**Location:** Neue Datei `www/celebration.jsx` (zusammen mit dem Overlay-Component, da sie
nur dafür existieren).

**Verantwortung:** Detektiert ungesehene Ziel-Erreichungen für den aktuellen User und
liefert die nächste anstehende Celebration.

**Input:**
- `challenges`: Array der aktiven Challenges dieser Woche (aus dem bestehenden HomeScreen-State).
- `allSets`: Array aller Sets der Woche (aus bestehendem State).
- `me`: aktueller Benutzer-Name (`'Benny'` oder `'Jonas'`).

**Internal State:**
- Liest/schreibt `localStorage` key `pt_celebrated_v1` mit Schema:
  ```json
  { "Benny": { "<challenge_id>": true }, "Jonas": { "<challenge_id>": true } }
  ```

**Output:**
- `pendingCelebration: { challenge, category } | null` — die nächste ungesehene
  abgeschlossene Challenge. `null` wenn nichts zu feiern.
- `dismissCurrent(): void` — setzt den `seen`-Flag für `(me, pendingCelebration.challenge.id)`
  und re-evaluiert. Wenn mehrere ungesehene anliegen, gibt der nächste Hook-Run das nächste
  zurück → sequenzielle Wiedergabe.
- `getPersistentStyle(challenge): 'gold' | 'sparkle' | 'trophy' | null` — falls
  Challenge ≥ 100 %, gibt den Style aus `sessionStorage` (`pt_persistent_style_v1`)
  zurück. Würfelt einmal beim ersten Aufruf in der Session.

**Re-evaluation Trigger:** React-Hook-Standard — bei jedem Re-render des Consumers.
Performance unkritisch (max. 1-stellige Challenge-Anzahl, max. dreistellige Sets-Anzahl).

### 2. `<CelebrationOverlay/>` Component

**Location:** Gleiche Datei `www/celebration.jsx`.

**Verantwortung:** Spielt das v2-Mashup-Vollbild ab. Kennt keine Challenge-Logic, nur Anzeige.

**Props:**
- `category: { name, emoji }` — für Subtext (`💪 [target] Klimmzüge geknackt`).
- `targetReps: number` — Endwert für den Counter.
- `onDone: () => void` — wird nach kompletter Sequenz (oder Skip via Tap) aufgerufen.

**Verhalten:**
- Rendert sich als fixed-positioned Overlay über alles (z-index sehr hoch).
- Spielt die Sequenz aus Sektion "Vollbild-Explosion" unten ab.
- Tap auf den Overlay → früher Fade-Out (300 ms) + `onDone()`.
- Cleanup-Effekt: alle Timer/Intervals beim Unmount cancellen, Audio stoppen.

### 3. Persistent-Mode CSS-Klassen

**Location:** `www/styles.css` — neue Regeln am Ende der Datei.

**Klassen:**
- `.pm-gold` — atmender Gold-Rahmen, Goldverlauf-Background, Goldgradient-Progress-Bar.
- `.pm-sparkle` — Lila/Gold-Gradient-Background, treibende Funken-Partikel via JS-Spawn.
- `.pm-trophy` — Layout-Swap: ersetzt Progress/Tug-of-War-Sektion durch Trophäen-Hero.

Die Klassen werden in `screens.jsx` auf `.hero-card` aufgesetzt wenn der Hook
`getPersistentStyle(challenge)` einen Wert liefert. Für `pm-trophy` wird zusätzlich
conditional gerendert (siehe unten).

### Daten-Fluss

```
1. User loggt Rep → addSet() → React-State update
2. HomeScreen re-rendert → useCelebration sieht Crossover bei challenge X
3. pendingCelebration = { challenge: X, category: Y }
4. HomeScreen mountet <CelebrationOverlay/>
5. Overlay läuft 5 s, ruft onDone()
6. dismissCurrent() setzt seen[me][X] = true, schreibt localStorage
7. pendingCelebration wird null (oder nächste ungesehene)
8. Overlay unmountet, Card zeigt jetzt persistent style aus sessionStorage
```

## Vollbild-Explosion (Spezifikation)

**Dauer:** 5.0 s aktive Sequenz + 600 ms Fade-Out.

### Phasen-Timeline

| t (ms) | Event |
|---:|---|
| 0 | Flash-Bang: Overlay-Layer `#fff` → `#ffbe0b` → transparent über 250 ms |
| 0 | Stage-Shake startet (400 ms intensiv: translate ±12 px + rotate ±1.5°, dann idle-wobble) |
| 0 | Haptic-Sequenz: `Haptics.impact(Heavy)` bei 0, 60, 120 ms; `Haptics.notification(Success)` bei 200 ms |
| 0 | Sound startet: `goal-reached.mp3` |
| 0–5000 | Laser-Pulse-Background: radiale Verläufe Magenta/Cyan/Gold, opacity 0.4↔1.0 bei 450 ms |
| 0–5000 | 8 Laser-Beams diagonal, gestaffelt mit `--delay` 0/0.2/0.5/0.8/1.1/1.4/1.7/0.6 s, je 1.5–2.0 s Dauer, infinite loop |
| 0–5000 | Strobe-Color-Wash: 5 radiale Verläufe (Pink, Cyan, Gold, Lila, Grün), Wechsel alle 400 ms via `steps(1, end)` |
| 100 | Shockwave-Ring #1 spawnt aus Zentrum, expand 0.1× → 28×, 1.6 s |
| 300 | Shockwave-Ring #2 |
| 500 | Shockwave-Ring #3 |
| 200 | Hero-Text "ZIEL ERREICHT" zoomt rein (rotateX -90° → 0°, scale 0.05 → 1.6 → 1.0, mit Rainbow-Echo-Layer drunter) |
| 700 | Number-Counter startet bei 0, easeOutCubic über 1400 ms → `targetReps`, mit `toLocaleString('de-DE')` formatiert |
| 800 | Subtext fadet ein: "💪 [targetReps] [category.name] geknackt" |
| 0–5000 | Halo-Emoji-Orbit: 4 Emojis (💪 🔥 ⚡ 🏆) kreisen um den Hero-Text, 4 s/Umdrehung, gestaffelte delays |
| 0–5000 | Firework-Spawn alle 350 ms: Aufstiegs-Trail 500 ms + Burst aus 36–60 farbigen Partikeln, je 1.7–2.6 s Lebensdauer |
| 0–5000 | Konfetti-Spawn alle 50 ms: Rechteck/Kreis/Emoji (Gewicht 55%/25%/20%), 2.0–4.0 s Falldauer, 1080° Rotation |
| 0–5000 | Giant-Emoji-Spawn alle 400 ms: 💪🔥⚡🏆💯🚀⭐🎉, 40–76 px, 2.5–4.0 s Falldauer |
| 5000 | Fade-Out beginnt, `onDone()` wird gefeuert nach 600 ms |

### Sound

- Asset: `www/sounds/goal-reached.mp3`, ~150 KB, 3 s lang.
- Anforderung: Whoosh (0–200 ms) + Pop (200–400 ms) + Sparkle-Tail (1000–3000 ms).
- Quelle: Royalty-free (Pixabay/Freesound, Suche "achievement whoosh sparkle"); Asset
  wird vom User gewählt und committed.
- Playback via `new Audio(src)` + `.play()` direkt im `<CelebrationOverlay/>` mount-Effekt.
- iOS-Mute-Switch wird respektiert vom Browser; kein eigener Mute-Toggle nötig in v1.
- Bei `play()`-Promise-Reject (Autoplay-Block, sehr unwahrscheinlich da der Trigger ein
  User-Tap auf den Log-Button ist): silently catchen, kein Sound aber Show läuft weiter.

### Haptic

- Capacitor Plugin `@capacitor/haptics` (neue Dependency in `package.json`).
- Pattern in `<CelebrationOverlay/>`:
  ```js
  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 60);
  setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 120);
  setTimeout(() => Haptics.notification({ type: NotificationType.Success }), 200);
  ```
- Im Web-Browser-Demo-Modus (Capacitor Plugin nicht verfügbar): try/catch macht alle Calls
  zu No-Ops, Visual läuft weiter.
- Nach `npm install @capacitor/haptics` muss `npx cap sync ios` ausgeführt werden.

### Reduced-Motion-Fallback

CSS-Media-Query `@media (prefers-reduced-motion: reduce)`:

- Kein Stage-Shake, kein Flash-Bang, kein Strobe.
- Keine fliegenden Emojis (Konfetti und Giants).
- Statt der Phasen-Sequenz: einmaliger Konfetti-Burst (30 Stück fallen 1.5 s), Hero-Text
  fadet ein (kein 3D-Flip), Sound + Haptic bleiben aktiv (das sind Bestätigungen, kein
  Motion).
- Dauer ebenfalls 5 s, damit der Persistent-Mode-Crossover gleich bleibt.

### Performance

- DOM-Partikel mit `position: absolute`, GPU-accelerated via `transform` + `opacity`.
- Peak gleichzeitig sichtbare Elemente: ~250 (Konfetti 4 s × 20/s ≈ 80, Fireworks 60×3 ≈
  180, Giant 4 s × 2.5/s ≈ 10).
- Jedes Element kriegt `setTimeout(el.remove(), lifetime)` → Garbage-Collection sauber.
- Falls iOS-Performance schlecht (ruckelt unter 30 fps): Plan B ist Migration auf
  `canvas-confetti` (~3 KB lib). Initial nicht umsetzen; messen erst.

## Persistenter Stolz-Modus

### Style-Auswahl pro Session

- Bei App-Mount (`app.jsx`): wenn `sessionStorage.getItem('pt_persistent_style_v1')` leer,
  würfeln aus `['gold', 'sparkle', 'trophy']`, speichern.
- Bleibt für die gesamte App-Session stabil — egal wie viele Challenges 100 % sind,
  alle nutzen denselben Style innerhalb einer Session.
- Beim nächsten App-Open (neue Session) wird neu gewürfelt.

### Style A — `pm-gold` (Gold-Glow)

```css
.pm-gold {
  background: linear-gradient(180deg, #1c1c1e 0%, #2a2210 100%);
  border: 2px solid #ffbe0b;
  animation: gold-glow-breath 2.6s ease-in-out infinite;
}
@keyframes gold-glow-breath {
  0%, 100% { box-shadow: 0 0 18px 0 rgba(255,190,11,0.35),
                       inset 0 0 32px 0 rgba(255,190,11,0.12);
             border-color: #b8860b; }
  50%      { box-shadow: 0 0 32px 4px rgba(255,190,11,0.7),
                       inset 0 0 48px 0 rgba(255,190,11,0.28);
             border-color: #ffd700; }
}
.pm-gold .progress-bar-fill {
  background: linear-gradient(90deg, #ffbe0b, #ffd700, #ffbe0b);
  background-size: 200% 100%;
  animation: gold-slide 2s linear infinite;
}
```

Bestehende Layout-Komponenten (Tug-of-War, Progress-Bar, Numeric) bleiben sichtbar — der
Style legt sich nur als Hülle drüber.

### Style B — `pm-sparkle` (Sparkle-Float)

```css
.pm-sparkle {
  background: linear-gradient(135deg, #1c1c1e 0%, #2a1a3e 50%, #1c1c1e 100%);
  position: relative;
}
.pm-sparkle-stars { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.pm-sparkle-star {
  position: absolute; width: 4px; height: 4px;
  background: #fff; border-radius: 50%;
  box-shadow: 0 0 6px #fff, 0 0 12px #ffbe0b;
  animation: drift 4s linear infinite;
}
@keyframes drift {
  0%   { transform: translateY(120px) scale(0); opacity: 0; }
  20%  { opacity: 1; transform: translateY(80px) scale(1); }
  80%  { opacity: 1; }
  100% { transform: translateY(-20px) scale(0); opacity: 0; }
}
```

**Particle-Spawn:** JS-Effect in `screens.jsx` (oder kleines Helper-Component `<SparkleLayer/>`),
spawnt alle 300 ms einen `.pm-sparkle-star` mit zufälliger `left`-Position. Lifetime 7 s,
dann `el.remove()`.

**Wichtig — Viewport-Optimization:** Bei mehreren 100 %-Challenges im Swiper läuft das
Spawning nur für die aktuell sichtbare Karte. Implementierung via `IntersectionObserver`
oder durch Bindung an den `activeIdx` aus dem HomeSwiper-State (einfacher).

### Style C — `pm-trophy` (Trophy-Takeover)

Komplettes Layout-Replacement der Mittel-Sektion. Statt
`{layout === 'rings' && <TugOfWar />}` etc. wird gerendert:

```jsx
{persistent === 'trophy' ? (
  <div className="pm-trophy-hero">
    <div className="pm-trophy-icon">🏆</div>
    <div className="pm-trophy-title">ZIEL ERREICHT</div>
    <div className="pm-trophy-sub">{category.emoji} {category.name} • Diese Woche</div>
    <div className="pm-trophy-stats">
      <Stat value={total} label="Reps" />
      <Stat value={bennyDone} label="Benny" />
      <Stat value={jonasDone} label="Jonas" />
    </div>
  </div>
) : (
  /* bestehendes Layout (rings/bar/numeric) */
)}
```

CSS:
```css
.hero-card.pm-trophy {
  background: radial-gradient(circle at 50% 0%, #4a3811 0%, #1c1c1e 70%);
}
.pm-trophy-icon {
  font-size: 64px; line-height: 1;
  filter: drop-shadow(0 0 20px #ffbe0b);
  animation: trophy-bob 2.4s ease-in-out infinite;
  display: inline-block;
}
@keyframes trophy-bob {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-6px) rotate(3deg); }
}
.pm-trophy-title {
  font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
  background: linear-gradient(90deg, #ffbe0b, #ffd700, #ff8c00, #ffbe0b);
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gold-slide 3s linear infinite;
}
```

**Header und Action-Button bleiben:** Der obere Kategorie-Header (Emoji + Name + "Gewählt
von …") und der "+ Satz loggen"-Button am Ende der Karte bleiben sichtbar. User soll auch
nach Ziel-Erreichen weiter loggen können — die Trophy ersetzt nur die Mitte.

## State, Persistenz, Edge-Cases

### `seen`-Flag Lebenszyklus

- **Setzen:** Nach Ablauf der vollständigen Vollbild-Sequenz (also in `onDone()`), oder bei
  vorzeitigem Skip via Tap auf das Overlay. Schreibvorgang:
  ```js
  const flags = JSON.parse(localStorage.getItem('pt_celebrated_v1') || '{}');
  flags[me] = flags[me] || {};
  flags[me][challengeId] = true;
  localStorage.setItem('pt_celebrated_v1', JSON.stringify(flags));
  ```
- **Lesen:** Beim Hook-Re-evaluation. Wenn Challenge `pct ≥ 1` UND `!flags[me]?.[challenge.id]`
  → `pendingCelebration` setzen.
- **Reset:** Nicht vorgesehen — Show wird pro User pro Challenge nur einmal gefeiert.

### Mehrere ungesehene Crossovers gleichzeitig

User war eine Weile offline, mehrere Challenges sind 100 %.
**Reihenfolge:** Sortiert nach `challenge.id` (stabil und deterministisch). Sequentielle
Wiedergabe: nach jedem `onDone()` checked der Hook erneut, gibt die nächste ungesehene
zurück, Overlay re-mountet.

### Skip / Dismiss

- Tap irgendwo auf das Overlay → `onClick` callback → `setSkipping(true)` → CSS-class
  `.skipping` löst 300 ms Fade-Out aus → `onDone()`.
- Kein eigener Skip-Button (UI sauber lassen). Hint-Text "Tap zum überspringen" nach 2 s
  klein und transparent unten einblenden — nur wenn User noch nichts gemacht hat.

### Challenge gelöscht/editiert

- Wenn `challenge.id` aus dem State verschwindet (gelöscht) und ein `seen`-Eintrag dafür
  existiert: nichts passiert, der verwaisten Eintrag bleibt liegen. Cleanup nicht initial
  umsetzen.
- Wenn `target_reps` editiert wird und `pct` rutscht unter 100 %: Persistent Mode
  verschwindet (Hook gibt `null` zurück). `seen`-Flag bleibt — wenn `pct` später wieder
  über 100 % geht, **keine** zweite Explosion (Anti-Grinding).

### Set gelöscht (Unlogging unter Ziel)

- Selbes Verhalten wie Target-Edit: Persistent-Mode weg, `seen`-Flag bleibt.

### Bestehende Challenges beim Feature-Deploy

- Wenn das Feature live geht und Benny/Jonas haben bereits abgeschlossene Challenges:
  beim nächsten App-Open feuert die Show für jede abgeschlossene Challenge einmal.
  Begründung: "ihr habt's verdient zu sehen". Wenn das nervt → Migration-Script setzt
  alle existierenden `pct ≥ 1`-Challenges auf `seen = true` für beide User.

### App-Backgrounding mitten in der Show

- iOS pausiert JS-Timer/Animationen wenn die App in den Hintergrund geht. Beim
  Foregrounding läuft die Show weiter. Falls User die App killt: `seen`-Flag wurde noch
  nicht gesetzt → beim nächsten Open läuft die Show erneut komplett. Bewusst so.

## Test-Plan

Manuell testen (es gibt keine automatisierten Tests im Code-Base):

1. **Trigger-Detection:** Eine Challenge auf 99 % bringen, einen weiteren Rep loggen → Explosion feuert.
2. **Persistent-Mode-Würfeln:** App schließen, mehrmals neu öffnen → über mehrere
   Sessions sollten alle 3 Styles auftauchen.
3. **`seen`-Flag:** Show abgespielt, App neu starten → Persistent-Mode aber keine zweite
   Explosion.
4. **Multi-User:** Avatar-Switch nach Jonas's Trigger → Benny öffnet (= Avatar wechseln),
   bekommt die Show.
5. **Multiple Crossovers:** localStorage manuell leeren bei 2 abgeschlossenen Challenges
   → beide Shows laufen nacheinander.
6. **Skip:** Tap auf Overlay → früher Fade-Out, `seen` ist gesetzt.
7. **Edge: Unlogging:** Set löschen sodass pct unter 100% → Persistent-Mode verschwindet,
   re-loggen → keine zweite Explosion.
8. **Edge: Target-Erhöhung:** Target editieren auf höher als total → Persistent-Mode weg.
   Target wieder runter → Persistent-Mode da, keine Explosion.
9. **Reduced-Motion:** macOS / iOS Setting "Reduce Motion" aktivieren → abgespeckte
   Variante läuft.
10. **Sound mute:** iOS-Hardware-Mute-Switch aktivieren → keine Audio, Show läuft.
11. **Haptic auf echtem Gerät:** Show triggern, fühlen ob Vibration kommt.
12. **Performance:** Show mit Safari Web Inspector messen, frame rate prüfen (Ziel: ≥30 fps
    durchgehend auf einem mittel-alten iPhone).

## Implementations-Reihenfolge (für den Plan)

1. Hook-Skelett + LocalStorage-State + Detection-Logik (testbar via console.log).
2. CelebrationOverlay-Component leer mounten, `onDone()` nach 5 s, Flag setzen.
3. Vollbild-Effekt-Layer für Layer einbauen (Konfetti zuerst, dann Lasers, dann Hero-Text, etc.).
4. Sound + Haptic einbauen.
5. Persistent-Modus-CSS-Klassen + sessionStorage-Würfel.
6. Trophy-Layout-Swap in `screens.jsx`.
7. Sparkle-Partikel-Spawning mit IntersectionObserver / activeIdx-Binding.
8. Reduced-Motion-CSS.
9. Skip-Mechanik.
10. Manuelles Testing nach Test-Plan.

## Risiken / Offene Punkte

- **Sound-Asset wählen:** User muss Royalty-free-MP3 finden und committen. Bis dahin
  Stub-Audio (kurzer Web-Audio-API-Pop). Nicht-Blocker für ersten Implementierungs-Run.
- **iOS-Performance:** DOM-Partikel-Approach könnte auf alten Geräten ruckeln. Messen,
  ggf. `canvas-confetti` als Plan B.
- **localStorage-Quota:** Pro Challenge ein Boolean — vernachlässigbar selbst bei
  hunderten Challenges. Kein Risiko.
- **Cross-Device-Sync:** Wenn der User auf zwei Geräten dasselbe Konto nutzt, sieht er die
  Show auf jedem Gerät einmal (localStorage ist gerätelokal). Akzeptables Verhalten.
