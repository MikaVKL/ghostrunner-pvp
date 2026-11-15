# ARCHITECTURE.md – Wie alles zusammenhängt

Kurzfassung: **Der Server ist der Schiedsrichter.** Clients schicken nur Tastendrücke, der
Server simuliert das Spiel 60-mal pro Sekunde und schickt 30-mal pro Sekunde den Spielstand
zurück. Damit es sich trotzdem verzögerungsfrei anfühlt, rechnet der Client seinen eigenen
Spieler mit **demselben Code** schon einmal voraus und korrigiert sich, wenn der Server etwas
anderes sagt. (Die Konzepte dahinter erklärt `LEARNING.md`.)

## 1. Die fünf Teile

```
┌──────────────────────────────── src/shared ────────────────────────────────┐
│  Spiellogik + Protokoll. Reine Daten und Funktionen, deterministisch.        │
│  sim/ movement/ physics/ combat/ match/ maps/ protocol/ math/                │
└───────▲───────────────────────────▲──────────────────────────▲──────────────┘
        │ benutzt                   │ benutzt                  │ benutzt
┌───────┴────────┐        ┌─────────┴─────────┐       ┌────────┴─────────┐
│  src/server    │        │   src/netcode     │       │    src/bots      │
│  Tick-Loop     │◄──────►│  GameClient       │◄──────│  Bot = GameClient│
│  Lobby, Räume  │  Netz  │  Predictor        │benutzt│      + BotBrain  │
│  Input-Queue   │ (JSON) │  Interpolation    │       │  MemoryNetwork   │
└────────────────┘        └─────────▲─────────┘       │  Reports, CLI    │
                                    │ benutzt         └──────────────────┘
                          ┌─────────┴─────────┐
                          │   src/client      │
                          │  Three.js, Input  │
                          │  HUD, Lobby-UI    │
                          └───────────────────┘
```

| Ordner | Aufgabe | Wichtigste Dateien |
|---|---|---|
| `src/shared` | Regeln des Spiels | `sim/stepWorld.ts`, `sim/stepPlayer.ts`, `sim/playerState.ts` |
| `src/server` | Autorität, Räume, Netzwerk | `gameServer.ts`, `game/room.ts`, `game/inputQueue.ts`, `lobby/lobby.ts` |
| `src/netcode` | Client-Netzlogik ohne Browser | `gameClient.ts`, `predictor.ts`, `interpolation.ts` |
| `src/client` | Bild, Eingabe, UI | `app/gameApp.ts`, `app/gameLoop.ts`, `render/gameView.ts` |
| `src/bots` | Automatische Spieler + Testnetz | `brain.ts`, `simulation.ts`, `liveRunner.ts`, `report.ts` |

Warum ist `netcode` vom `client` getrennt? Damit die Bots **exakt denselben Netzwerk-Code**
benutzen wie echte Spieler. Was die Bots testen, ist das, was im Browser läuft.

## 2. Der Weg eines Tastendrucks

```
 BROWSER (Client)                                        SERVER
 ───────────────                                         ──────
 Tastatur/Maus
      │  InputController.sample()        einmal pro Tick (60 Hz)
      ▼
 GameClient.tick(sample)
      │  1. seq vergeben, sanitizeInput()
      │  2. ──── {type:"input", cmd} ─────────────────►  parseClientMessage()  (validieren)
      │                                                   InputQueue.push()     (pro Spieler)
      │  3. Predictor.predict():                               │
      │     stepPlayer() SOFORT lokal anwenden,                │   Room.tick()  – 60 Hz:
      │     Input + Ergebnis merken                            ▼
      ▼                                                   InputQueue.next()  → genau 1 Input
 GameView.render()   ← zeigt vorhergesagten Zustand            │                pro Spieler/Tick
                                                               ▼
                                                          stepWorld(world, inputs)
                                                            1. stepPlayer() je Spieler
                                                            2. resolveCombat()  (Treffer/Parry)
                                                            3. stepMatch()      (Tod, Runden)
                                                               │
      ◄──── {type:"snapshot", tick, ack, clean, ──────────────┘   alle 2 Ticks (30 Hz)
             players, match, events}
      │
      ▼
 GameClient.handleSnapshot()
      ├─ eigener Spieler: Predictor.reconcile()
      │     • Vorhersage für Input `ack` mit Server-Zustand vergleichen
      │     • Server-Zustand übernehmen, alle Inputs > ack erneut anwenden (Rollback + Replay)
      ├─ Gegner: SnapshotBuffer.push()  → wird beim Rendern interpoliert (100 ms verzögert)
      └─ events → HUD-Effekte (Treffer-Flash, „PARRY!“)
```

## 3. Ein Server-Tick im Detail (`shared/sim/stepWorld.ts`)

```
stepWorld(world, inputs):
  ┌─ Teil 1: VORHERSAGBAR ──────────────────────────────────────────────┐
  │ für jeden Spieler: stepPlayer(player, input, map, phase)             │
  │    stepAction()    Angriff/Parry-Zustandsautomat (combat/actions.ts) │
  │    stepMovement()  Dash | Wall-Run | Laufen+Springen, dann Kollision │
  └──────────────────────────────────────────────────────────────────────┘
        Kopie aller Spieler merken ("so hätte es jeder Client vorhergesagt")
  ┌─ Teil 2: INTERAKTION (nur der Server weiß das) ─────────────────────┐
  │ resolveCombat()   wer trifft wen, Parry, Schaden, Knockback, Stun   │
  │ stepMatch()       Tod (HP/Sturz), Punkte, Phasenwechsel, Respawn    │
  └──────────────────────────────────────────────────────────────────────┘
        Vergleich mit der Kopie → Liste `disturbed` (wessen Zustand wurde
        durch Teil 2 verändert?)
```

Diese Zweiteilung ist das Herz des Templates:

- **Teil 1** läuft auch auf dem Client (Prediction). Deshalb fühlt sich die eigene Bewegung
  sofort an.
- **Teil 2** kennt nur der Server. Wird ein Spieler dadurch verändert, weicht die Vorhersage
  seines Clients kurz ab – das ist eine erwartete **Correction**.
- Der Server merkt sich pro Spieler, ob seit dem letzten Snapshot irgendetwas
  Unvorhersagbares passiert ist, und schickt das als `clean: true/false` mit.

### Desync-Erkennung

```
Snapshot kommt an → Vorhersage ≠ Server-Zustand?
        │ nein → alles gut
        │ ja
        ▼
   snapshot.clean?
        ├─ false → "correction"  (erwartet: Treffer, Respawn, Lag, verlorene Inputs)
        └─ true  → "DESYNC"      (Bug: Client und Server rechnen unterschiedlich)
```

`clean` ist `false`, wenn (a) Teil 2 den Spieler verändert hat, (b) die Phase gewechselt hat,
(c) der Server einen Input wiederholen oder verwerfen musste (`InputQueue`), oder (d) der Raum
die Welt direkt geändert hat (Join/Leave). Der Client meldet einen Desync mit den
abweichenden Feldern, z. B. `tick 812, ack 790: vel.y: -0.4 vs -0.8`.

## 4. Match-Ablauf (`shared/match/`)

```
              2. Spieler tritt bei                 Countdown vorbei
  waiting ───────────────────────► countdown ─────────────────────► playing
     ▲   (allein: freies Üben,        ▲  (eingefroren am Spawn)        │
     │    Sturz = Respawn)            │                                │ jemand stirbt
     │                                │ nächste Runde                  │ oder Zeit um
     │ ein Spieler geht               │                                ▼
     └──────────────◄─────────────────┴──────────────────────────── roundEnd
                                      ▲                                │ genug Siege oder
                                      │ automatischer Rematch          │ maxRounds erreicht
                                      └────────────── matchEnd ◄───────┘
```

Spieler werden nur in `waiting` und `playing` simuliert (`phaseAllowsAction`), sonst sind sie
eingefroren und können sich nur umsehen. Kampf zählt nur in `playing`.

## 5. Server-Aufbau

```
startServer.ts         HTTP (/health, /stats, statische Dateien) + WebSocket (/ws) + TickLoop
   └─ GameServer       netzwerk-unabhängiger Kern: attach(transport), tick(), stats()
        ├─ Session     ein verbundener Client (Name, Raum, Rate-Limit-Zähler)
        ├─ messageRouter   welche Nachricht → welche Aktion
        ├─ Lobby       alle Räume; createRoom / joinRoom(code) / quickMatch / leave
        │    └─ Room   2 Sitze + WorldState; tick(): Inputs holen → stepWorld → Snapshots
        │         └─ InputQueue  je Spieler; liefert genau 1 Input pro Tick
        └─ Metrics     Tick-Dauer (avg/p99/max), Fehler, ungültige Nachrichten
```

Sicherheit („nie dem Client vertrauen“):

- Jede Nachricht geht durch `parseClientMessage` (Typ, Länge, Wertebereiche).
- `sanitizeInput` begrenzt Bewegung auf −1/0/1, Winkel und erlaubte Buttons.
- `InputQueue` verarbeitet **einen Input pro Tick** – mehr senden macht nicht schneller.
- Rate-Limit: mehr als 240 Nachrichten/Sekunde → Verbindung wird getrennt.
- Der Server-Tick fängt Fehler ab und zählt sie, statt abzustürzen.

## 6. Transport-Abstraktion

Server und `GameClient` sprechen nie direkt mit einem WebSocket, sondern mit dem Interface
`Transport` (`send`, `close`, `onMessage`, `onClose`). Es gibt drei Umsetzungen:

| Umsetzung | Datei | Verwendet von |
|---|---|---|
| WebSocket im Browser / Node | `netcode/webSocketTransport.ts` | Browser-Client, Live-Bots |
| WebSocket auf dem Server (`ws`) | `server/net/wsTransport.ts` | `startServer.ts` |
| Simuliertes Netz mit virtueller Zeit | `bots/memoryNetwork.ts` | Tests, `npm run bots:sim` |

Dazu `netcode/lagTransport.ts`: verzögert einen beliebigen Transport künstlich (`?lag=100`).

Deshalb können Tests komplette Matches mit 300 ms Lag in Millisekunden durchspielen: gleicher
Server-Code, gleicher Client-Code, nur Netz und Uhr sind ausgetauscht.

## 7. Browser-Client

```
main.ts          verbindet, liest URL-Optionen (?lag ?jitter ?predict)
 └─ app/gameApp.ts       verdrahtet alles, reagiert auf Events (Effekte)
     ├─ app/gameLoop.ts      requestAnimationFrame + Akkumulator → feste 60-Hz-Ticks
     ├─ input/inputController.ts   Tastatur/Maus → InputSample (Tasten in input/bindings.ts)
     ├─ render/gameView.ts   zeichnet: Map (mapMesh), Gegner (playerAvatar), Schwert (sword, swordPose)
     └─ ui/                  lobbyUi, hud, debugOverlay   (HTML-Elemente aus index.html)
```

Regel: `render/` und `ui/` **lesen** nur. Sie ändern nie Spielzustand.

## 8. Wichtige Zahlen (alle in Config-Dateien änderbar)

| Wert | Standard | Datei |
|---|---|---|
| Tick-Rate | 60 Hz | `shared/config.ts` |
| Snapshot-Rate | 30 Hz (alle 2 Ticks) | `shared/config.ts` |
| Interpolations-Verzögerung | 6 Ticks = 100 ms | `netcode/interpolation.ts` |
| Input-Puffer max. | 6 Inputs = 100 ms | `server/game/inputQueue.ts` |
| Lauf-/Dash-Tempo, Sprung, Wall-Run | siehe Datei | `shared/movement/movementConfig.ts` |
| Schwert (Schaden, Reichweite, Phasen) | 34 / 2,6 m / 8+5+16 Ticks | `shared/combat/weapons.ts` |
| Parry-Fenster / Stun | 12 / 48 Ticks | `shared/combat/combatConfig.ts` |
| Runden, Zeiten | Best-of bis 3 Siege, 60 s | `shared/match/matchConfig.ts` |

## 9. Tests – was prüft was

| Ordner | Prüft | Beispiele |
|---|---|---|
| `tests/unit` | einzelne Funktionen und Klassen | Sprunghöhe, Dash-Distanz, Parry-Fenster, Raumcodes, Input-Validierung, Predictor |
| `tests/unit/architecture.test.ts` | die Projektregeln selbst | keine verbotenen Imports zwischen Ordnern, kein `Math.random()`/`Date.now()` in der Simulation |
| `tests/sim` | ganze Bot-Matches über simuliertes Netz | 0 Desyncs bei 0/80/300 ms Lag, Reproduzierbarkeit, „Detektor schlägt bei Manipulation an“ |
| `tests/integration` | echter Server + echte WebSockets | `/health`, Müll-Nachrichten, zwei Live-Matches |
