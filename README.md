# Neonklinge – 1v1-Schwertduell im Browser

Schnelles **1-gegen-1-Schwertduell** in der Ich-Perspektive, inspiriert vom Genre der
Cyber-Ninja-Parkour-Spiele: **ein Treffer tötet**, Parry betäubt den Gegner, gleichzeitige
Schläge prallen ab (Klingen-Clash), dazu Dash, Doppelsprung, Wall-Run, Wandsprung und
Sprungfelder über Abgründe. Best-of-5, drei sehr unterschiedliche Parkour-Maps, alles im Browser.

Zwei Spielarten: **Mehrspieler** über einen Server (Raumcode oder schnelles Spiel) und
**Solo gegen Bot** – das läuft komplett im Browser, ohne Server, und lässt sich deshalb als
statische Seite auf GitHub Pages veröffentlichen.

Unter der Haube: autoritativer Server (60 Hz), Client-Side-Prediction mit Rollback,
Lag-Kompensation, Reconnect, Test-Bots und automatische Tests. Keine externen Grafiken oder
Sounddateien – Figuren, Himmel und alle Geräusche werden im Code erzeugt.

Technik: TypeScript · Three.js · Web Audio · Vite · Node.js · WebSockets (`ws`) · Vitest · Playwright

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
git clone https://github.com/mikavkl/ghostrunner-pvp.git
```

```bash
cd ghostrunner-pvp
```

```bash
npm install
```

### 3. Spiel starten

```bash
npm run dev
```

Dann im Browser (Chrome oder Safari) öffnen: **<http://localhost:5173>**

**Allein spielen:** im Menü Map und Schwierigkeit wählen und „Solo gegen Bot“ klicken.

Zum Testen des Mehrspielers allein: zwei Browser-**Fenster** nebeneinander öffnen (nicht zwei Tabs im selben
Fenster – Hintergrund-Tabs werden vom Browser pausiert). Im ersten eine Map wählen und
„Raum erstellen“ klicken, den 4-stelligen Code im zweiten Fenster eingeben und „Raum beitreten“
klicken. Oder in beiden „Schnelles Spiel“.

Beenden: im Terminal `Ctrl + C`.

## So wird gespielt

| Aktion | Taste |
|---|---|
| Laufen | `W` `A` `S` `D` |
| Umsehen | Maus (erst ins Spiel klicken; `Esc` gibt die Maus frei) |
| Springen · Doppelsprung (in der Luft noch einmal) · Wandsprung | `Leertaste` |
| Dash | `Shift` |
| Schwertschlag | Linksklick oder `J` |
| Parry | Rechtsklick (Trackpad: Zwei-Finger-Klick) oder `F` / `K` |
| Dash-Angriff | Schlag während eines Dashes (oder `Shift` + Schlag gleichzeitig) |
| Wall-Run | Im Sprung an eine Wand und `W` halten |
| Rematch | `R` (nach dem Match, beide müssen drücken) |
| Ton an/aus · Hilfe · Netzwerk-Anzeige | `M` · `H` · `F3` (MacBook: `fn + F3`, oder die Taste `` ` ``) |

Regeln in Kürze:

- **Ein Treffer tötet.** Der leuchtende Bogen zeigt genau die Reichweite deines Schlags.
- **Parry** kurz vor dem Einschlag (und zum Gegner schauen): Der Angreifer ist 1 Sekunde
  betäubt und leuchtet gelb – dein freier Treffer. Ein Parry ins Leere hat eine Abklingzeit.
- **Klingen-Clash:** Schlagt ihr im selben Moment zu, prallen die Klingen ab – niemand stirbt.
- **Sprungfelder** (grün) schleudern dich in Pfeilrichtung: Katapulte über die Schlucht,
  aufs Turmdach, aus der Reaktor-Grube.
- **Sturz in den Abgrund** tötet; der Punkt geht an den Gegner.
- **Best-of-5:** Wer zuerst 3 Runden gewinnt. Sterben beide, zählt die Runde nicht.
- Bricht die Verbindung ab, pausiert das Match bis zu 20 Sekunden und der Spieler kommt von
  selbst zurück.

Tasten ändern: `src/client/input/bindings.ts`. Werte ändern (Tempo, Reichweite, Zeiten):
siehe `HOW_TO_EXTEND.md`, Rezept 1.

## Solo gegen Bot

Im Hauptmenü: Map wählen, Schwierigkeit wählen (**Leicht**, **Mittel**, **Schwer**), „Solo
gegen Bot“ klicken. Es gelten exakt dieselben Regeln wie im Mehrspieler (Best-of-5, Parry,
Dash, Wall-Run, Abgrund). Nach dem Match ist der Bot immer für ein Rematch bereit – `R` drücken.

Wie das funktioniert: Im Browser-Tab läuft derselbe Server-Kern wie beim Mehrspieler, nur
über eine Verbindung im Arbeitsspeicher statt über das Internet (`src/solo/`). Der Gegner ist
einer der Test-Bots. Deshalb braucht der Solo-Modus keinen Server und kein Internet – und
pausiert von selbst, wenn der Tab im Hintergrund ist.

Die Schwierigkeit ist pro Stufe eine Zahl („Können“), aus der sich ergibt, wie schnell der
Bot sich dreht und wie oft er schlägt und pariert (`src/solo/difficulty.ts`). Die Zahlen
sind per Bot-Selbstspiel eingestellt (`npm run tune`); die gemessenen Gewinnquoten stehen in
[BALANCE.md](BALANCE.md).

Ist kein Spielserver erreichbar (z. B. auf GitHub Pages), sind die Mehrspieler-Knöpfe grau
und ein Hinweis erklärt, warum. Solo funktioniert trotzdem.

### Als Webseite veröffentlichen (GitHub Pages)

Die Solo-Version lässt sich kostenlos als statische Seite veröffentlichen. Der Workflow
`.github/workflows/pages.yml` baut und veröffentlicht sie bei jedem Push. Einmalig nötig:
im Repo **Settings → Pages → Source: „GitHub Actions“** auswählen. Alle Schritte und
Stolpersteine: **[INTERNET.md](INTERNET.md), Variante E**.

Lokal ansehen, was veröffentlicht würde:

```bash
npm run build:pages
```

```bash
npm run preview:pages
```

Dann <http://localhost:4173/ghostrunner-pvp/> öffnen.

## Mit einem Freund spielen

```bash
npm run host
```

baut das Spiel und startet den Server auf Port 3000 (Seite und WebSocket über denselben Port).

- **Im selben WLAN:** Der Server zeigt eine Zeile wie `same Wi-Fi: http://192.168.x.x:3000` –
  diese Adresse öffnet dein Freund.
- **Über das Internet:** per Tunnel (z. B. `cloudflared tunnel --url http://localhost:3000`)
  oder Hosting. Die ausführliche Anleitung mit allen Varianten steht in
  **[INTERNET.md](INTERNET.md)** – dort steht auch ehrlich, was davon getestet ist.

## Alle Befehle

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Entwicklungsmodus: Server (Port 3000) + Client (Port 5173), lädt bei Änderungen neu |
| `npm run host` | Client bauen und Server starten (zum Spielen mit anderen, Port 3000) |
| `npm run build:pages` | Statische Solo-Version für GitHub Pages bauen (`dist/pages`) |
| `npm run preview:pages` | Die gebaute Pages-Version lokal ansehen (Port 4173) |
| `npm test` | Typprüfung + alle automatischen Tests inkl. Solo-Matches (~25 s) |
| `npm run bots:sim` | 20 Bot-Matches auf allen Maps in ~3 Sekunden (simuliertes Netzwerk mit Lag) |
| `npm run bots` | Bot-Matches über echte WebSockets gegen einen echten Server |
| `npm run test:browser` | Browser-Tests: echte Chromium-Tabs spielen gegeneinander und solo gegen den Bot, auch ohne Server (~2,5 min) |
| `npm run tune` | Bot-Selbstspiel: stellt die Stärke der drei Bot-Stufen ein und schreibt `BALANCE.md` (~4 min) |
| `npm run check` | `npm test` + `npm run bots:sim` (vor jedem Commit) |
| `npm run check:all` | alles zusammen: `check` + `bots` + `test:browser` |
| `npm run build` / `npm start` | Client bauen / Server starten (einzeln; `host` macht beides) |

Einmalig für die Browser-Tests auf dem eigenen Rechner: `npx playwright install chromium`.

Nützlich:

- `FAST_MATCH=1 npm run dev` – sehr kurze Runden zum Testen.
- `MAP=reaktor npm run dev` – alle Räume auf dieser Map (`schlucht`, `daecher`, `reaktor`, `arena`).
- `PORT=3001 npm run dev` – anderer Port.
- `http://localhost:5173/?lag=100` – 100 ms künstliche Verzögerung pro Richtung.
- `http://localhost:5173/?predict=0` – Prediction aus (zum Spüren, wozu sie gut ist).
- `http://localhost:3000/stats` – Live-Statistik des Servers (Räume, Tick-Zeiten, Fehler).

## Bot-Report lesen

```
match   map       bot   result  rounds  time(s)  snaps  corrections  maxCorr(m)  desyncs  rtt(ms)
sim#1   schlucht  botA  win     3       13.6     404    12           0.121       0        140
...
mechanics used by the bots: wall-run 1103 ticks, wall-jumps 14, dashes 74, swings 110 (dash attacks 17), parries 4, kills 48
server: 14089 ticks, avg 0.010 ms, p99 0.028 ms, max 2.129 ms, overruns 0, errors 0
RESULT: OK - no desyncs, no errors.
```

- **desyncs** muss `0` sein. Sonst rechnen Client und Server unterschiedlich → Bug.
- **corrections** sind normal (Treffer, Respawn, Lag, Gegner berührt); **maxCorr** ist die
  größte davon in Metern.
- **mechanics used** zeigt, dass die Bots die Mechaniken wirklich benutzen – nur was die Bots
  tun, wird auch auf Desyncs geprüft.
- **server … avg/p99/max** ist die Rechenzeit pro Tick. Ein Tick darf höchstens 16,67 ms
  dauern; **overruns** zählt Überschreitungen.

## Doku

| Datei | Inhalt |
|---|---|
| [STATUS.md](STATUS.md) | Übergabe: was fertig ist, was offen ist, bekannte Fehler, nächste Schritte |
| [BALANCE.md](BALANCE.md) | Gemessene Gewinnquoten der Bot-Stufen gegeneinander (wird von `npm run tune` erzeugt) |
| [INTERNET.md](INTERNET.md) | Mit Freunden spielen: WLAN, Tunnel, Hosting – und die Solo-Version auf GitHub Pages |
| [LEARNING.md](LEARNING.md) | Die Konzepte einfach erklärt: Tick-Rate, Prediction, Rollback, Interpolation, Lag-Kompensation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Aufbau, Datenfluss, Diagramme |
| [HOW_TO_EXTEND.md](HOW_TO_EXTEND.md) | Schritt-für-Schritt: Features, Waffen, Maps, Sounds, Effekte hinzufügen |
| [CLAUDE.md](CLAUDE.md) | Regeln, Konventionen und Fallstricke für KI-Assistenten |

## Probleme?

| Problem | Lösung |
|---|---|
| „Kein Spielserver erreichbar“ im Menü, Mehrspieler-Knöpfe grau | Läuft `npm run dev` noch? Terminal auf Fehler prüfen, dann „Erneut verbinden“. Auf GitHub Pages ist das normal – dort gibt es nur Solo |
| `EADDRINUSE` / Port belegt | Altes Terminal beenden oder `PORT=3001 npm run dev` |
| Maus bewegt die Kamera nicht | Einmal ins Spielfeld klicken (Pointer-Lock) |
| Kein Ton | Einmal klicken oder eine Taste drücken (Browser erlauben Ton erst danach); `M` schaltet stumm; Lautstärke im Menü |
| Zweiter Spieler steht nur herum | Sein Tab ist im Hintergrund → eigenes Fenster benutzen |
| `node: command not found` oder Syntaxfehler beim Start | Node.js ≥ 22 installieren (Schritt 1) |
| Browser-Tests: „Executable doesn't exist“ | `npx playwright install chromium` |

## Hinweis zum Namen

Das Repo heißt `ghostrunner-pvp`, weil es als „Ghostrunner-artiges PvP“ geplant wurde. Das
Spiel selbst heißt **Neonklinge**: Name, Maps, Figuren, Grafik und Sound sind eigene
Entwürfe; übernommen wurden nur genretypische Mechaniken (One-Hit-Kill, Parry, Dash, Wall-Run).
