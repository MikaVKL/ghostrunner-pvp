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
│  Input-Queue   │ (JSON) │  Interpolation    │       │  Parkour, Nav    │
│  Reconnect     │        │  Reconnect        │       │  MemoryNetwork   │
└────────────────┘        └─────────▲─────────┘       │  Reports, CLI    │
                                    │ benutzt         └──────────────────┘
                          ┌─────────┴─────────┐
                          │   src/client      │
                          │  Three.js, Audio  │
                          │  Input, HUD, Menü │
                          └───────────────────┘
```

| Ordner | Aufgabe | Wichtigste Dateien |
|---|---|---|
| `src/shared` | Regeln des Spiels | `sim/stepWorld.ts`, `sim/stepPlayer.ts`, `sim/playerState.ts` |
| `src/server` | Autorität, Räume, Netzwerk, Reconnect | `gameServer.ts`, `game/room.ts`, `game/inputQueue.ts`, `lobby/lobby.ts` |
| `src/netcode` | Client-Netzlogik ohne Browser | `gameClient.ts`, `predictor.ts`, `interpolation.ts` |
| `src/client` | Bild, Ton, Eingabe, UI | `app/gameApp.ts`, `app/effects.ts`, `render/gameView.ts`, `audio/sounds.ts`, `ui/hud.ts` |
| `src/bots` | Automatische Spieler + Testnetz | `brain.ts`, `parkour.ts`, `simulation.ts`, `report.ts` |

| `src/solo` | Solo gegen Bot ohne Netzwerk | `soloMatch.ts`, `loopback.ts`, `difficulty.ts` |

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
      │  1. seq + viewTick vergeben, sanitizeInput()
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
                                                               separatePlayers() (Kollision)
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
      └─ events → Effekte (Partikel, Sound, Kamerawackeln, „PARIERT!“)
```

## 3. Ein Server-Tick im Detail (`shared/sim/stepWorld.ts`)

```
stepWorld(world, inputs):
  ┌─ Teil 1: VORHERSAGBAR ──────────────────────────────────────────────┐
  │ für jeden Spieler: stepPlayer(player, input, map, phase)             │
  │    stepMovement()  Dash | Wall-Run | Laufen+Springen+Doppelsprung,   │
  │                    dann Kollision, dann Sprungfelder (jumpPad.ts)    │
  │    stepAction()    Angriff/Parry-Zustandsautomat + Cooldowns         │
  │                    (combat/actions.ts; Angriff im Dash = Dash-Angriff)│
  └──────────────────────────────────────────────────────────────────────┘
        Kopie aller Spieler merken ("so hätte es jeder Client vorhergesagt")
  ┌─ Teil 2: INTERAKTION (nur der Server weiß das) ─────────────────────┐
  │ resolveCombat()    Schwung trifft (Lag-Kompensation) → pendingHits; │
  │                    entscheiden: Clash (beide schlagen gleichzeitig), │
  │                    Parry (Stun, Rückstoß) oder Treffer               │
  │ separatePlayers()  Spieler, die ineinander stehen, auseinander-     │
  │                    schieben                                          │
  │ stepMatch()        Tod (HP/Sturz), Punkte, Phasenwechsel, Respawn   │
  └──────────────────────────────────────────────────────────────────────┘
        Vergleich mit der Kopie → Liste `disturbed` (wessen Zustand wurde
        durch Teil 2 verändert?)
  recordPositions()    Positionen dieses Ticks für die Lag-Kompensation merken
```

Diese Zweiteilung ist das Herz des Netcodes:

- **Teil 1** läuft auch auf dem Client (Prediction). Deshalb fühlt sich die eigene Bewegung
  sofort an.
- **Teil 2** kennt nur der Server. Wird ein Spieler dadurch verändert (getroffen, pariert,
  weggeschoben), weicht die Vorhersage seines Clients kurz ab – das ist eine erwartete
  **Correction**.
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
                                      ▲                                │ jemand hat 3 Siege
                                      │ BEIDE drücken „Rematch“        │ (oder maxRounds)
                                      └────────────── matchEnd ◄───────┘

  Verbindungsabbruch in irgendeiner Match-Phase:
     Phase ──► paused ──► (Spieler ist zurück)   unterbrochene Runde startet neu ab Countdown,
                 │                               Pausen zwischen Runden laufen einfach weiter
                 └──────► (20 s vorbei)          Sitz wird frei → waiting
```

- **Best-of-5:** `roundsToWin: 3`. Unentschiedene Runden (Doppel-K.O., Zeit abgelaufen) geben
  keinen Punkt; `maxRounds` (9) sorgt dafür, dass ein Match trotzdem endet.
- **Rundenende wartet auf offene Treffer:** Ist jemand tot, endet die Runde erst, wenn
  `world.pendingHits` leer ist (höchstens 0,3 s). So wird ein echter Schlagabtausch ein
  Unentschieden statt ein Sieg für den Spieler mit dem höheren Ping.
- **Rematch:** `match.rematchVotes[slot]`; die Nachricht `rematch` setzt die Stimme
  (`voteRematch`). Die Test-Config (`FAST_MATCH_CONFIG`) startet zusätzlich automatisch neu.

Spieler werden nur in `waiting` und `playing` simuliert (`phaseAllowsAction`), sonst sind sie
eingefroren und können sich nur umsehen. Kampf und Spieler-Kollision zählen nur in `playing`.

## 4b. Lag-Kompensation (`shared/combat/lagCompensation.ts`, `resolveCombat.ts`)

Jeder Client zeigt den Gegner leicht in der Vergangenheit (Interpolation 100 ms + Laufzeit).
Jeder Input trägt deshalb `viewTick`: den Server-Tick, den der Client gerade **anzeigt**.

```
 Angreifer schlägt zu (Server-Tick H)
      │  Wo war das Ziel bei viewTick des Angreifers?  → world.history (letzte ~20 Ticks)
      ▼
 in Reichweite?  ──nein──► kein Treffer
      │ ja
      ▼
 world.pendingHits += { attacker, target, tick: H }       (Treffer ist „unterwegs“)
      │
      │  jeden Tick: hat das Ziel Tick H schon GESEHEN?  (viewTick des Ziels ≥ H)
      ▼
 Ziel pariert gerade und schaut zum Angreifer?
      ├─ ja  → Parry: Angreifer 1 s betäubt + zurückgestoßen, Verteidiger sofort frei
      └─ nein → Treffer: damage (100 = tot), Rückstoß
```

Vor alledem wird geprüft, ob es ein **Klingen-Clash** ist: Schlägt das Ziel selbst gerade zu
und würde seine Klinge den Angreifer innerhalb von 0,1 s (`COMBAT.clashWindowTicks`) treffen,
prallen beide ab – niemand stirbt, beide werden zurückgeworfen, Event `clash`. Das ersetzt
den früher häufigen Doppel-K.O.

Beide Blicke in die Vergangenheit sind auf `COMBAT.maxRewindTicks` (0,3 s) begrenzt. Ohne
`viewTick` (0, z. B. in Unit-Tests) wird nichts zurückgespult und sofort entschieden.
`history` und `pendingHits` liegen im `WorldState`, werden aber nicht an Clients gesendet.

## 4c. Maps als Daten (`shared/maps/`)

Eine Map (`MapDef`) besteht nur aus Daten – Kollision, Darstellung und Bots lesen dieselben:

| Feld | Bedeutung | Wer benutzt es |
|---|---|---|
| `boxes` | alles Feste: achsenparallele Quader (Böden in verschiedenen Höhen, Wände, Deckung) | Kollision, Wall-Run, Darstellung, Bot-Wegfindung |
| `pads` | Sprungfelder: Rechteck am Boden + feste Abwurf-Geschwindigkeit | `movement/jumpPad.ts`, Darstellung |
| `spawns`, `killY` | Startpunkte, Todeshöhe | Match-Regeln |
| `navPoints`, `links` | Wegpunkte und Parkour-Abkürzungen (Sprung, Abstieg, Aufstieg, Sprungfeld, Wall-Run) | nur Bots (`bots/nav.ts`, `bots/parkour.ts`) |
| `theme` | Himmel- und Nebelfarben | nur Darstellung |

| Map | Idee |
|---|---|
| `schlucht` | flach: Brücke, zwei Wall-Run-Wände, Katapulte über den Abgrund |
| `daecher` | vertikal: Turm (4 m), Terrassen (2 m), unten Rundgang mit Stegen; Sprungfelder aufs Turmdach |
| `reaktor` | Ring mit offenen Ecken um eine versenkte Grube (−3 m, feste Wände); hinaus nur per Sprungfeld; Wand quer über die Grube |
| `arena` | einfacher Übungsplatz; viele Tests benutzen seine Koordinaten – nicht umbauen |

## 5. Server-Aufbau

```
startServer.ts         HTTP (/health, /stats, statische Dateien) + WebSocket (/ws) + TickLoop
   └─ GameServer       netzwerk-unabhängiger Kern: attach(transport), tick(), stats()
        ├─ Session     ein verbundener Client (Name, Raum, Rate-Limit-Zähler)
        ├─ messageRouter   welche Nachricht → welche Aktion
        ├─ Lobby       alle Räume; createRoom(mapId) / joinRoom(code) / quickMatch / rejoin / leave
        │    └─ Room   2 Sitze + WorldState + Map; tick(): Inputs holen → stepWorld → Snapshots
        │         ├─ Seat        Sitz eines Spielers: Session (oder null = getrennt), Token
        │         └─ InputQueue  je Sitz; liefert genau 1 Input pro Tick
        └─ Metrics     Tick-Dauer (avg/p99/max), Fehler, ungültige Nachrichten
```

Maps: Wer einen Raum erstellt, wählt die Map (`createRoom.mapId`). Quick-Match-Räume wechseln
reihum durch `MAP_ROTATION`. Mit `MAP=...` erzwingt der Server eine Map für alle Räume.

Reconnect:

```
 roomJoined { token }          Client merkt sich Raumcode + Token (auch in sessionStorage)
 Verbindung bricht ab    →     Room.disconnect: Sitz bleibt, session = null, Match → paused
 Client verbindet neu    →     { type: 'rejoin', code, token } → Room.rejoin: gleicher Sitz,
                               neue InputQueue, Match geht weiter (roomJoined kommt erneut)
 20 s ohne Rückkehr      →     Sitz wird entfernt, der andere Spieler → waiting
 „Verlassen“-Knopf       →     Room.leave: Sitz sofort frei (keine Reservierung)
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

## 6b. Solo-Modus: derselbe Aufbau, nur ohne Netz (`src/solo/`)

```
 ONLINE                                         SOLO (alles im Browser-Tab)

 GameClient ──WebSocket──► GameServer           GameClient ──Loopback──┐
 (Browser)                 (Node-Prozess,       (Mensch)               ├─► GameServer
                            eigener 60-Hz-      Bot = GameClient ──────┘    (derselbe Kern:
                            Timer)                    + BotBrain  Loopback   Lobby, Room,
                                                                             stepWorld)
```

`SoloMatch` baut genau das zusammen. Es wird nichts nachgebaut: Raum, Runden, Treffer,
Lag-Kompensation, Rematch und sogar die Desync-Erkennung (`F3`) sind derselbe Code wie online.
Unterschiede:

- **Verbindung:** `loopback.ts` – was ein Ende sendet, kommt sofort beim anderen an.
- **Takt:** kein eigener Timer. Die Spielschleife ruft nach jedem `client.tick()` einmal
  `solo.step()` auf (Server-Tick, dann Bot-Tick). Tab im Hintergrund = Spiel pausiert.
- **Rematch:** Der Bot stimmt am Match-Ende sofort zu; es fehlt nur noch `R` vom Menschen.
- **Schwierigkeit:** `difficulty.ts` – jede Stufe ist eine Zahl („Können“ 0…1), aus der alle
  Bot-Parameter (`BotPersonality`) berechnet werden. Die Zahlen findet `npm run tune`
  (`scripts/tune.ts`) per Bot-Selbstspiel; das Ergebnis steht in `BALANCE.md`.

So denkt ein Bot pro Tick (`bots/brain.ts`):

```
think(me, enemy, map, canAct)
  eingefroren?            → nur zum Gegner drehen (waitFrozen)
  gerade auf einem Link?  → LinkRunner steuert (parkour.ts): ausrichten → anlaufen → Flug/Wall-Run
  Route planen            → nav.planRoute: direkter Weg, sonst über navPoints + links
                            (jede Runde andere Lieblings-Links: linkMood)
  am Plattformrand?       → erst zurück auf sicheren Boden (nearestStandable)
  schauen                 → im Kampf zum Gegner, sonst zum Wegpunkt
  laufen                  → Richtung zum Wegpunkt, unabhängig vom Blick (steering.ts);
                            nie über eine Kante (avoidLedges)
  Nahkampf-Footwork       → kreisen / zurücktreten / hineingehen (nur auf sicherem Boden)
  kämpfen                 → brainFight.ts: Schlag, Dash-Angriff, Bestrafen (Gegner betäubt
                            oder erholt sich), Parry oder Ausweich-Dash – Abwehr erst nach der
                            Reaktionszeit; Chancen aus BotPersonality × Kampfstil der Runde
```

Damit das im Browser läuft, benutzt der Server-Kern keine Node-Module (nur `startServer.ts`,
`main.ts`, `http/` und `net/wsTransport.ts` tun das). Ohne erreichbaren Server (z. B. auf
GitHub Pages) deaktiviert das Menü die Mehrspieler-Knöpfe; Solo läuft trotzdem.

## 6c. Replays und Killcam (`shared/replay/`, `server/game/replayRecorder.ts`, `client/replay/`)

```
 AUFNEHMEN (Room, nur wenn recordReplays – im Solo-Modus an)
   Matchstart      → startWorld = Kopie der ganzen Welt
   jeder Tick      → Eingaben beider Spieler (genau die, die stepWorld bekommt)
   Rematch-Stimme  → ReplayAction { tick, 'rematch', slot }
   alle 60 Ticks   → Hash der Welt (Checkpoint)
   Abbruch/Verlassen → Aufnahme endet

 ABSPIELEN (ReplaySimulator / ReplayPlayback)
   Welt = startWorld; pro Tick: Aktionen anwenden, stepWorld(Eingaben), Hash prüfen
   Zurückspulen    → nächste Keyframe-Kopie (alle 2 s) laden und vorwärts rechnen
   Zeitlupe        → Uhr läuft langsamer; Bild = Mischung aus zwei Ticks
```

Weil die Simulation deterministisch ist, ergibt das **exakt** dasselbe Match – der Test
vergleicht Hashes der ganzen Welt. Die Ansicht (`ReplayViewer`) zeichnet mit derselben
`GameView`: beide Spieler als Figuren, Kamera frei, hinter einem Spieler oder als Killcam
(über die Schulter des Siegers). Die Killcam spielt nach einem Schwert-Kill im Solo-Modus die
letzten 2,5 s mit 0,35-facher Geschwindigkeit; das Match steht so lange.

## 6d. Zeitrennen (`solo/timeTrial.ts`, `solo/trialRun.ts`, `client/app/timeTrialMode.ts`)

`TrialRun` ist wie `SoloMatch`, aber ohne Bot: Server-Kern + ein `GameClient` im Tab. Mit
einem Spieler bleibt die Match-Phase `waiting` (freies Laufen, Sturz = zurück zum Start).
`TimeTrial` bekommt pro Tick den Spieler: Start beim ersten Schritt, Ziel = gegnerischer Spawn
(Radius 2,5 m), Sprung zurück = Sturz = Neustart. Der beste Lauf (`GhostRun`: Zeit + Position
pro Tick) liegt im `localStorage`; `GameView` zeichnet ihn als durchsichtige Figur.

## 7. Browser-Client

```
main.ts          verbindet, liest URL-Optionen (?lag ?jitter ?predict)
 └─ app/gameApp.ts       verdrahtet alles (Menü ↔ Spiel, Tasten R/M/H, Reconnect);
     │                   hält zwei Clients: `online` (Netz, evtl. null) und `solo` (lokal)
     ├─ app/gameLoop.ts      requestAnimationFrame + Akkumulator → feste 60-Hz-Ticks
     ├─ app/stateWatcher.ts  erkennt „Momente“ (Sprung, Dash, Schwung …) am PlayerState
     ├─ app/effects.ts       Momente + GameEvents → Partikel, Sound, Wackeln, Texte
     ├─ app/connection.ts    Verbinden, automatisches Neuverbinden, Sitz merken
     ├─ input/inputController.ts   Tastatur/Maus → InputSample (Tasten in input/bindings.ts)
     ├─ render/gameView.ts   zeichnet einen Frame:
     │     sceneSetup + sky      Renderer, Licht, Nebel, Nachthimmel mit Skyline
     │     mapMesh               Quader mit Raster und Neon-Kanten, Dunst im Abgrund
     │     playerAvatar          Gegner: fighterModel (Figur aus Quadern) + fighterPose (Animation)
     │     sword + swordPose     eigenes Schwert in der Ich-Ansicht
     │     slashArc              leuchtender Bogen = exakte Trefferzone des Schwungs
     │     particles, cameraFx   Funken/Staub; Wackeln, Sichtfeld, Neigung
     ├─ app/replayWiring.ts  Replay-Knopf (V), Killcam nach einem Kill, „Replay laden …“
     ├─ app/timeTrialMode.ts Zeitrennen: Uhr im HUD, Ziel-Strahl, Geist, Bestzeit (trialStorage.ts)
     ├─ replay/              ReplayViewer, ReplayCamera, ReplayControls, Dateien speichern/laden
     ├─ audio/               audioEngine (Web Audio) + sounds (Rezepte, keine Dateien)
     └─ ui/                  lobbyUi (Hauptmenü), hud + hudTexts, helpOverlay, debugOverlay
```

Regel: `render/`, `audio/` und `ui/` **lesen** nur. Sie ändern nie Spielzustand.
Zufall für Optik (Partikel, Wackeln) darf `Math.random()` benutzen – er ist kein Spielzustand.

## 8. Wichtige Zahlen (alle in Config-Dateien änderbar)

| Wert | Standard | Datei |
|---|---|---|
| Tick-Rate | 60 Hz | `shared/config.ts` |
| Snapshot-Rate | 30 Hz (alle 2 Ticks) | `shared/config.ts` |
| Interpolations-Verzögerung | 6 Ticks = 100 ms | `netcode/interpolation.ts` |
| Input-Puffer max. | 6 Inputs = 100 ms | `server/game/inputQueue.ts` |
| Lauf-/Dash-Tempo, Sprung, Wall-Run | 7 / 22 m/s, 1,5 m hoch, 1,5 s | `shared/movement/movementConfig.ts` |
| Doppelsprung | 1 zusätzlicher Sprung in der Luft, +1,2 m | `shared/movement/movementConfig.ts` |
| Klingen-Clash: Zeitfenster / Rückstoß / Cooldown | 6 Ticks (0,1 s) / 7 m/s / 21 Ticks | `shared/combat/combatConfig.ts` |
| Sprungfelder | je Feld eigene Abwurf-Geschwindigkeit | `shared/maps/*.ts` (`pads`) |
| Bot-Stufen (Können) | siehe `BALANCE.md` | `solo/difficulty.ts` (`SKILL`) |
| Schwert normal: Schaden / Reichweite / Phasen | 100 / 2,4 m / 12+6+18 Ticks | `shared/combat/weapons.ts` |
| Schwert Dash-Angriff | 100 / 3,2 m / 6+6+27 Ticks | `shared/combat/weapons.ts` |
| Angriffs-Cooldown | 15 Ticks (0,25 s) | `shared/combat/weapons.ts` |
| Parry: Fenster / Erholung / Cooldown / Stun | 15 / 18 / 30 / 60 Ticks | `shared/combat/combatConfig.ts` |
| Lag-Kompensation max. | 18 Ticks (0,3 s) | `shared/combat/combatConfig.ts` |
| Match | Best-of-5 (3 Siege), 60 s pro Runde, 3 s Countdown | `shared/match/matchConfig.ts` |
| Reconnect-Zeit | 20 s | `shared/match/matchConfig.ts` |

## 9. Tests – was prüft was

| Ordner | Prüft | Beispiele |
|---|---|---|
| `tests/unit` | einzelne Funktionen und Klassen | Sprunghöhe, Doppelsprung, Sprungfelder, Klingen-Clash, One-Hit-Kill, Parry-Fenster und -Cooldown, Dash-Angriff, Best-of-5, Rematch, Lag-Kompensation, Spieler-Kollision, Reconnect, Raumcodes, Input-Validierung, Predictor |
| `tests/unit/maps.test.ts` | jede registrierte Map | Spawns, Abgrund, sicherer Fußweg, jeder Parkour-Link wird durchgespielt, Bots erreichen den Gegner |
| `tests/unit/architecture.test.ts` | die Projektregeln selbst | keine verbotenen Imports zwischen Ordnern, kein `Math.random()`/`Date.now()` in der Simulation |
| `tests/sim` | ganze Bot-Matches über simuliertes Netz | 0 Desyncs auf allen Maps bei 0/80/300 ms Lag, Verbindungsabbruch mitten im Match, „Bots benutzen alle Mechaniken“, „Detektor schlägt bei Manipulation an“ |
| `tests/sim/soloMatch.test.ts`, `difficulty.test.ts` | Solo-Modus ohne Server | alle Maps × alle Schwierigkeiten bis zum Match-Ende, Rematch, Verlassen; „schwer“ schlägt „leicht“ |
| `tests/sim/botQuality.test.ts` | „Benimmt sich der Bot vernünftig?“ | stürzt nie von selbst ab, bleibt nicht stehen, erreicht den Spieler jede Runde, kein Patt hinter Deckung |
| `tests/integration` | echter Server + echte WebSockets | `/health`, Müll-Nachrichten, Live-Matches, Betrieb hinter einem Reverse-Proxy (wie ein Tunnel) |
| `tests/browser` (eigenes Skript: `npm run test:browser`) | das echte Spiel in echtem Chromium | Menü, Raum erstellen/beitreten, Kill, Parry, Sturz, Match-Ende, Rematch, Reconnect, Seiten-Reload; Solo-Match komplett; Solo auf einer rein statischen Seite ohne Server (wie GitHub Pages) |
