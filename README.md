# Multiplayer Game Template

Wiederverwendbares Fundament für **1v1-Online-Spiele im Browser**: autoritativer Server,
Client-Side-Prediction mit Rollback, Lobby mit Raumcodes, 3D-Bewegung (Laufen, Springen, Dash,
Wall-Run), Schwertkampf-Gerüst mit Parry, Test-Bots und automatische Tests.

Technik: TypeScript · Three.js · Vite · Node.js · WebSockets (`ws`) · Vitest

## Start auf macOS (Schritt für Schritt)

### 1. Einmalig: Node.js installieren

Du brauchst **Node.js 22 oder neuer**. Prüfen im Terminal (Programm „Terminal“ öffnen):

```bash
node -v
```

Wenn eine Version ab `v22` erscheint, weiter zu Schritt 2. Sonst installieren – entweder den
Installer von <https://nodejs.org> (LTS) herunterladen, oder mit Homebrew:

```bash
brew install node
```

### 2. Projekt holen und Abhängigkeiten installieren

```bash
git clone https://github.com/mikavkl/multiplayer-game-template.git
```

```bash
cd multiplayer-game-template
```

```bash
npm install
```

### 3. Spiel starten

```bash
npm run dev
```

Dann im Browser (Chrome oder Safari) öffnen: **<http://localhost:5173>**

Zum Testen allein: zwei Browser-**Fenster** nebeneinander öffnen (nicht zwei Tabs im selben
Fenster – Hintergrund-Tabs werden vom Browser pausiert). Im ersten „Create room“ klicken, den
4-stelligen Code im zweiten Fenster eingeben und „Join room“ klicken.

Beenden: im Terminal `Ctrl + C`.

### Steuerung

| Aktion | Taste |
|---|---|
| Bewegen | `W` `A` `S` `D` |
| Umsehen | Maus (erst ins Spiel klicken; `Esc` gibt die Maus frei) |
| Springen | `Leertaste` |
| Dash | `Shift` |
| Angriff | Linksklick oder `J` |
| Parry | Rechtsklick (Trackpad: Zwei-Finger-Klick) oder `F` / `K` |
| Wall-Run | In der Luft an einer Wand entlang, `W` halten. `Leertaste` = Wandsprung |
| Debug-Anzeige | `F3` (auf dem MacBook `fn + F3`) oder die Taste `` ` `` |

Tasten ändern: `src/client/input/bindings.ts`.

## Mit einem Freund spielen

**Im selben WLAN:** Beim Start zeigt der Server eine Zeile wie
`same Wi-Fi: http://192.168.x.x:3000`. Am einfachsten:

```bash
npm run build
```

```bash
npm start
```

Dein Freund öffnet dann `http://DEINE-IP:3000` (du selbst `http://localhost:3000`).
macOS fragt beim ersten Mal, ob Node eingehende Verbindungen annehmen darf → erlauben.

**Über das Internet:** Der Server muss von außen erreichbar sein. Zwei einfache Wege:

- *Tunnel* (schnell zum Testen): z. B. `brew install cloudflared`, dann
  `cloudflared tunnel --url http://localhost:3000` und die angezeigte `https://…`-Adresse teilen.
- *Hosting* (dauerhaft): das Repo bei einem Node-Hoster (z. B. Render, Railway, Fly.io)
  deployen. Build-Befehl `npm install && npm run build`, Start-Befehl `npm start`.
  Der Server liest den Port aus der Umgebungsvariable `PORT` und liefert Client und WebSocket
  über denselben Port aus.

Beides habe ich in diesem Template **nicht** für dich eingerichtet oder getestet.

## Alle Befehle

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Entwicklungsmodus: Server (Port 3000) + Client (Port 5173), lädt bei Änderungen neu |
| `npm test` | Typprüfung + alle automatischen Tests |
| `npm run bots:sim` | 20 Bot-Matches in ~2 Sekunden (simuliertes Netzwerk mit Lag) |
| `npm run bots` | Bot-Matches über echte WebSockets gegen einen echten Server |
| `npm run check` | `npm test` + `npm run bots:sim` (vor jedem Commit) |
| `npm run build` | Client für den Produktivbetrieb bauen (`dist/client`) |
| `npm start` | Server starten, der auch den gebauten Client ausliefert (Port 3000) |

Nützlich:

- `FAST_MATCH=1 npm run dev` – sehr kurze Runden zum Testen.
- `PORT=3001 npm run dev` – anderer Port.
- `http://localhost:5173/?lag=100` – 100 ms künstliche Verzögerung pro Richtung.
- `http://localhost:5173/?predict=0` – Prediction aus (zum Spüren, wozu sie gut ist).
- `http://localhost:3000/stats` – Live-Statistik des Servers (Räume, Tick-Zeiten, Fehler).

## Bot-Report lesen

```
match   bot   result  rounds  time(s)  snaps  corrections  maxCorr(m)  desyncs  rtt(ms)
sim#1   botA  win     2       8.9      263    10           0.459       0        153
...
server: 24557 ticks, avg 0.010 ms, p99 0.030 ms, max 1.839 ms, overruns 0, errors 0
RESULT: OK - no desyncs, no errors.
```

- **desyncs** muss `0` sein. Sonst rechnen Client und Server unterschiedlich → Bug.
- **corrections** sind normal (Treffer, Respawn, Lag); **maxCorr** ist die größte davon in Metern.
- **server … avg/p99/max** ist die Rechenzeit pro Tick. Ein Tick darf höchstens 16,67 ms
  dauern; **overruns** zählt Überschreitungen.

## Doku

| Datei | Inhalt |
|---|---|
| [LEARNING.md](LEARNING.md) | Die Konzepte einfach erklärt: Tick-Rate, Prediction, Rollback, Interpolation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Aufbau, Datenfluss, Diagramme |
| [HOW_TO_EXTEND.md](HOW_TO_EXTEND.md) | Schritt-für-Schritt: Features, Waffen, Maps, Buttons hinzufügen |
| [CLAUDE.md](CLAUDE.md) | Regeln, Konventionen und Fallstricke für KI-Assistenten |

## Probleme?

| Problem | Lösung |
|---|---|
| `Cannot reach the game server` im Browser | Läuft `npm run dev` noch? Terminal auf Fehler prüfen |
| `EADDRINUSE` / Port belegt | Altes Terminal beenden oder `PORT=3001 npm run dev` |
| Maus bewegt die Kamera nicht | Einmal ins Spielfeld klicken (Pointer-Lock) |
| Zweiter Spieler steht nur herum | Sein Tab ist im Hintergrund → eigenes Fenster benutzen |
| `node: command not found` oder Syntaxfehler beim Start | Node.js ≥ 22 installieren (Schritt 1) |
