# CLAUDE.md – Projektregeln für KI-Assistenten

Dieses Repo ist **Ghostrunner-PvP**: ein 1v1-Schwertkampf im Browser (ein Treffer tötet,
Parry, Klingen-Clash, Dash, Doppelsprung, Wall-Run, Sprungfelder), gebaut auf einem Multiplayer-Template (autoritativer Server,
Client-Side-Prediction). Zwei Spielarten: Mehrspieler über den Server und „Solo gegen Bot“,
bei dem derselbe Server-Kern im Browser-Tab läuft (`src/solo/`, veröffentlichbar auf GitHub Pages). Lies diese Datei komplett, bevor du etwas änderst. Der Besitzer ist
Programmieranfänger: erkläre, was du tust, und halte Änderungen klein.

Weitere Doku: `ARCHITECTURE.md` (wie alles zusammenhängt), `HOW_TO_EXTEND.md` (Rezepte für
Features/Waffen/Maps), `LEARNING.md` (Konzepte für Anfänger), `README.md` (Start),
`INTERNET.md` (mit Freunden übers Internet spielen, GitHub Pages), `BALANCE.md` (gemessene
Stärke der Bot-Stufen, wird erzeugt), **`STATUS.md` (Übergabe: was fertig ist, was offen ist,
bekannte Fehler, nächste Schritte – zuerst lesen, wenn du hier weiterarbeitest).**

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren (einmalig) |
| `npm run dev` | Server (Port 3000) + Vite-Client (Port 5173) mit Auto-Reload |
| `npm run host` | Client bauen + Server starten, der alles auf Port 3000 ausliefert (zum Spielen mit anderen) |
| `npm test` | Typecheck + alle Tests (Unit, Bot-Simulation, echter Server). ~20 s |
| `npm run bots:sim` | 20 Bot-Matches auf allen Maps und in allen Modi (Duell, Arena) im Speicher mit Lag/Jitter. ~3 s. **Schnellster Desync-Check** |
| `npm run bots` | Bot-Matches über echte WebSockets gegen einen echten Server. ~20 s |
| `npm run test:browser` | Playwright: echte Chromium-Tabs spielen gegeneinander und solo gegen den Bot (auch ohne Server). ~2,5 min. Nach Client-/UI-Änderungen ausführen |
| `npm run build:pages` / `npm run preview:pages` | Statische Solo-Version für GitHub Pages bauen (`dist/pages`) / lokal ansehen |
| `npm run tune` | Bot-Selbstspiel: sucht die Stärke der drei Schwierigkeitsstufen **je Modus** und schreibt `BALANCE.md`. ~10 min (`-- --quick`: nur messen, ~3 min; `-- --mode arena`: nur ein Modus, schreibt nichts). Nach Änderungen an Bot-KI, Kampfregeln oder einem Modus ausführen |
| `npm run check` | `npm test` + `npm run bots:sim` – vor jedem Commit ausführen |
| `npm run check:all` | `check` + `bots` + `test:browser` – vor größeren Abgaben |
| `npm run typecheck` | Nur TypeScript prüfen |
| `npm run build` / `npm start` | Client bauen / Server starten, der den gebauten Client mit ausliefert |

Optionen für Bots stehen oben in `src/bots/cli.ts` (z. B. `npm run bots:sim -- --matches 100 --lag 150`).

## Pflicht-Ablauf bei jeder Änderung

1. Passende Anleitung in `HOW_TO_EXTEND.md` suchen und befolgen.
2. Kleine Änderung machen, **Test dazu schreiben** (`tests/unit/...`).
3. `npm run check` ausführen. Es muss enden mit `RESULT: OK - no desyncs, no errors.`
4. Erst dann committen (klare Nachricht, eine Sache pro Commit).
5. Nie behaupten, etwas funktioniere, ohne es ausgeführt zu haben. Wenn etwas nicht geht: sagen.

## Ordner und was wohin gehört

```
src/shared/    Spiellogik + Protokoll. Läuft auf Server UND Client. Kein DOM, kein Three.js, kein Node-API.
               sim/ (stepWorld, PlayerState) · movement/ · physics/ (Map- und Spieler-Kollision) ·
               combat/ (Waffen, Aktionen, Treffer, Lag-Kompensation) · match/ (Runden, Pause, Rematch) ·
               maps/ · protocol/ · math/ · replay/ (Replay-Format, Nachrechnen, Wiedergabe-Uhr)
src/server/    Nur Server: Tick-Loop, Räume (game/room.ts, seat.ts), Lobby, WebSocket. Darf shared importieren.
src/netcode/   Client-Netzwerklogik OHNE Browser-Abhängigkeit (Prediction, Reconciliation,
               Interpolation, Reconnect). Wird vom Browser-Client und von den Bots benutzt.
src/client/    Nur Browser. Darf shared + netcode + solo importieren.
               replay/ Replay-Ansicht und Killcam (Kamera, Bedienleiste, Datei-Export/-Import)
               app/    Verdrahtung, Spielschleife, effects.ts (Partikel/Sound/Texte bei Ereignissen),
                       stateWatcher.ts, connection.ts (Verbinden/Neuverbinden), settings.ts
               render/ Three.js: Himmel, Map, Figuren (fighterModel/fighterPose), Schwungbogen,
                       Partikel, Kamera-Effekte. Liest nur.
               audio/  Web Audio: audioEngine.ts + sounds.ts (alle Geräusche als Rezepte)
               ui/     Menü (lobbyUi), HUD (hud + hudTexts), Hilfe, Debug-Anzeige
               input/  Tastatur/Maus → InputSample
src/bots/      Bots (brain, brainFight, nav, parkour, steering), simuliertes Netzwerk, Reports.
               Darf alles außer client und solo importieren. brain/bot/nav/parkour laufen auch im Browser.
src/solo/      Solo-Modus: GameServer + Bot + GameClient in EINEM Programm, verbunden per
               Loopback (soloMatch.ts, loopback.ts), Schwierigkeitsstufen (difficulty.ts).
               Darf shared, netcode, server (nur den Kern) und bots importieren – nie client.
scripts/       Werkzeuge, die nur in Node laufen (tune.ts = Bot-Selbstspiel für die Balance).
tests/         unit/ (einzelne Funktionen), sim/ (Bot-Matches, Solo-Matches, Bot-Qualität),
               integration/ (echter Server, auch hinter einem Reverse-Proxy),
               browser/ (Playwright, eigenes Skript). Helfer: helpers.ts, serverHelpers.ts, soloHelpers.ts.
```

Import-Regeln (nicht brechen): `shared` importiert **nichts** aus den anderen Ordnern.
`server` und `client` importieren sich **nie** gegenseitig. Die einzige Brücke ist `solo`:
`client` → `solo` → Server-Kern + Bot.
**Alles, was `client` (auch über `solo`) erreicht, muss im Browser laufen:** kein `node:…`,
kein `ws`. Node-APIs sind nur erlaubt in `server/main.ts`, `server/startServer.ts`,
`server/http/` und `server/net/wsTransport.ts`.
Diese Regeln und das `Math.random()`-Verbot prüft `tests/unit/architecture.test.ts` automatisch.

## Die 7 goldenen Regeln (Netcode)

Wenn du eine davon brichst, entstehen Desyncs. Die Bots finden sie – also Bots laufen lassen.

1. **Der Client sendet nur Inputs** (`InputCmd`: Tasten + Blickrichtung). Niemals Positionen,
   Treffer oder HP. Alles Spielentscheidende berechnet der Server.
2. **Spiellogik gehört nach `src/shared/`** und muss deterministisch sein: kein `Math.random()`
   (nimm `createRng` aus `shared/math/rng.ts`), kein `Date.now()`/`performance.now()`, keine
   Abhängigkeit von Bildrate oder Echtzeit.
3. **Zeit wird in Ticks gezählt** (60 pro Sekunde), nie in Sekunden. In Configs
   `secondsToTicks(0.5)` benutzen. Physik benutzt `TICK_DT`.
4. **Aller Spielerzustand steht in `PlayerState`** (`shared/sim/playerState.ts`) – keine
   versteckten Variablen in Klassen oder Modulen. Nur einfache JSON-Daten (Zahlen, Booleans,
   Strings, verschachtelte einfache Objekte). Neue verschachtelte Objekte auch in
   `clonePlayer` kopieren.
5. **Zwei Arten von Logik – richtig einsortieren:**
   - *Vorhersagbar* (hängt nur vom eigenen Zustand + eigenem Input + Map ab) → in
     `stepPlayer` (`shared/sim/stepPlayer.ts`) bzw. `movement/`, `combat/actions.ts`.
     Der Client sagt das voraus.
   - *Interaktion* (hängt vom anderen Spieler oder Match-Regeln ab: Treffer, Parry, Tod,
     Respawn, Spieler-Kollision) → in `resolveCombat`, `separatePlayers` oder `stepMatch`,
     aufgerufen von `stepWorld`. Nur der Server entscheidet; der Client bekommt das Ergebnis
     per Snapshot.
6. **Welt-Änderungen nur in `stepWorld`.** Wenn der Server die Welt außerhalb davon ändert
   (wie `Room.join/leave`), muss er `markAllDisturbed()` aufrufen – **und** die Änderung als
   `ReplayAction` aufzeichnen (wie die Rematch-Stimme) oder die Aufnahme beenden, sonst
   rechnen Replays falsch nach (`tests/sim/replay.test.ts` merkt das).
7. **Buttons sind flankengesteuert**: Ein neuer Druck (`wasPressed`) füllt den Tasten-Puffer
   (`sim/inputBuffer.ts`, `p.bufferAttack` usw., 0,15 s); Schlag, Parry, Dash und Sprung starten
   aus dem Puffer und leeren ihn dabei. Nie `isDown` für Aktionen benutzen, sonst lösen sie
   jeden Tick aus. Halte-Tasten (Gehen, Ducken) dürfen `isDown` benutzen.

## Konventionen

- Sprache: Code, Bezeichner und Code-Kommentare **Englisch**; Doku-Dateien **Deutsch**.
- TypeScript `strict`. Kein `any`. Relative Imports ohne Dateiendung.
- Kleine Dateien (Richtwert < 150 Zeilen), eine Aufgabe pro Datei, Kommentar-Kopf, der erklärt,
  wozu die Datei da ist.
- Tuning-Werte nie im Code verstreuen, sondern in den Config-Dateien:
  `movement/movementConfig.ts`, `combat/weapons.ts` (Angriffsprofile `light`/`dash`),
  `combat/combatConfig.ts` (Parry, Stun, Lag-Kompensation), `match/matchConfig.ts`,
  `match/gameModes.ts` (Spielregeln je Modus: Leben, Schaden, Cooldowns, Rundenzahl),
  `shared/config.ts`, `client/input/bindings.ts`.
- Texte, die der Spieler sieht, sind **Deutsch** (auch `name`/`description` von Maps und Waffen).
- Koordinaten: +X rechts, +Y oben, **−Z ist vorwärts bei Yaw 0** (wie Three.js). `pos` eines
  Spielers ist die Position der **Füße**. Richtungen über `forwardFromYaw`/`rightFromYaw`.
- Rendering (`src/client/render`) liest Zustand nur und verändert ihn nie.
- Tests: Vitest. Helfer in `tests/helpers.ts` (Simulation) und `tests/serverHelpers.ts` (Server).

## Fallstricke (schon passiert oder leicht zu übersehen)

- **`desyncs > 0` im Bot-Report** heißt: Client und Server rechnen verschieden. Der Report nennt
  das abweichende Feld (z. B. `vel.y`). Häufigste Ursachen: Regel 2, 4 oder 5 verletzt; Logik
  nur auf einer Seite geändert; Zustand außerhalb von `PlayerState` gespeichert.
- **`corrections` sind normal** (Treffer, Respawn, Lag). Nur `desyncs` sind Fehler.
- **Fließkomma-Kanten:** Kollision benutzt eine Toleranz (`EPSILON` in `physics/collision.ts`).
  Nicht entfernen, sonst bleiben Spieler an Wänden kleben.
- **Maps aus mehreren Boxen:** Boden-Boxen müssen lückenlos aneinanderstoßen. Boxen dünner
  als 0,25 m vermeiden (Tunneling-Schutz arbeitet mit 0,2-m-Schritten).
- **Neuer Button:** auch `ALL_BUTTONS` in `shared/input.ts` erweitern, sonst filtert der
  Server ihn weg.
- **Server-Zustand, den der Client nicht sieht:** `WorldState.history` (Positionen für die
  Lag-Kompensation) und `WorldState.pendingHits` (noch nicht entschiedene Treffer). Beides
  wird beim Rundenstart geleert (`respawnAll`). Wer Spieler teleportiert, muss das auch tun.
- **Treffer sind verzögert:** Ein Schwung, der trifft, wird erst entschieden, wenn der
  Verteidiger ihn gesehen hat (`resolveCombat.ts`, max. `COMBAT.maxRewindTicks`). Tests ohne
  `viewTick` (= 0) entscheiden sofort. Die Runde endet erst, wenn `pendingHits` leer ist.
- **Winkel normalisieren:** `wrapAngle` muss idempotent bleiben (zweimal anwenden = einmal
  anwenden), weil Client UND Server jeden Input durch `sanitizeInput` schicken. Das war schon
  einmal ein Desync (`yaw: -3.14159… vs 3.14159…`).
- **Neue Match-Phase:** in `MatchPhase` (`sim/world.ts`), `stepMatch`, `phaseAllowsAction`
  und im HUD (`client/ui/hudTexts.ts`) ergänzen. TypeScript meldet vergessene Stellen.
- **Verbindungsabbruch ≠ Verlassen:** `Room.disconnect` reserviert den Sitz und pausiert das
  Match (Phase `paused`), `Room.leave` gibt ihn sofort frei. Bots/Tests, die „fertig“ sind,
  müssen `leaveRoom()` senden und der Nachricht Zeit geben, bevor sie die Verbindung schließen.
- **Körperhöhe ist variabel:** Beim Ducken/Slide ist der Spieler `CROUCH_HEIGHT` hoch
  (`p.crouching`). Kollision immer mit `heightOf(p)` (`physics/playerCollision.ts`) aufrufen,
  nie mit der festen `PLAYER_HEIGHT`.
- **Zielhilfe ist ein Eingabe-Flag** (`Button.AimAssist`, keine Taste): Der Client setzt es
  nach Einstellung in jede Eingabe, der Server weitet damit den Trefferkegel
  (`isInMeleeRange(..., aimAssist)`). Bots setzen es immer (`bots/bot.ts`). Der Sofort-Funke
  des Clients (`contactWatcher.ts`) muss dieselbe Prüfung benutzen.
- **Dash geht durch den Gegner, Dash-Angriff nicht** (`passesThrough` in
  `physics/playerCollision.ts`) – sonst überfliegt der Dash-Angriff sein Ziel und verfehlt.
- **Vorwärtsdrang:** Jeder Schlag schiebt nach vorn (`lungeSpeed`/`lungeTicks` im
  Angriffsprofil). Tests, die genaue Abstände brauchen, müssen das einrechnen.
- **Spielmodi:** Regeln stehen in `GameMode` (`match/gameModes.ts`), nicht in Waffen oder
  Configs. `hp` zählt **Leben** (Duell: 1). Der Modus „Duell“ ist das Original und bleibt
  unverändert. `stepPlayer` und `resolveCombat` bekommen den Modus übergeben – wer eine neue
  vorhersagbare Regel einbaut, muss sie über `mode` lesen, sonst rechnet der Client mit
  anderen Zahlen (Desync). Rezept 15 in `HOW_TO_EXTEND.md`.
- **Neue Map:** braucht `description` und `links` (darf leer sein); `pads` (Sprungfelder) und
  `theme` (Himmelsfarben) sind freiwillig. `tests/unit/maps.test.ts` prüft jede registrierte
  Map automatisch (Spawns, Fußweg, jeden Parkour-Link – auch Sprungfelder und Aufstiege).
- **Map geändert?** Danach `npx vitest run tests/unit/maps.test.ts tests/sim/botQuality.test.ts`
  – die zeigen sofort, ob Bots irgendwo abstürzen oder stehen bleiben. Und `npm run tune`:
  Eine Map, auf der die Bot-Stufen kaum Unterschied machen (`BALANCE.md`, Spalte je Map),
  hat fast immer eine Stelle, an der Spieler zufällig sterben.
- **Versenkte Böden brauchen Wände:** Ein tiefer liegender Boden muss lückenlos an die
  Böden daneben stoßen, und die müssen bis unter ihn reichen. Sonst entsteht ein tödlicher
  Spalt (so geschehen auf Reaktor). `maps.test.ts` prüft das.
- **Sprungfelder setzen die ganze Geschwindigkeit** (`movement/jumpPad.ts`), auch seitlich.
  Der Flug ist dadurch immer derselbe Bogen. Weite ≈ `launch.x * 2 * launch.y / 24` (gleiche
  Höhe). Ein Dash trägt über ein Feld hinweg, ohne auszulösen.
- **Luftsteuerung nimmt keinen Schwung weg** (`steerInAir` in `movement/locomotion.ts`). Wer
  das zurückbaut, lässt Spieler nach jedem Sprungfeld zu kurz fliegen.
- **Klingen-Clash:** Schlagen beide innerhalb von `COMBAT.clashWindowTicks` zu, stirbt niemand
  (`isClash` in `resolveCombat.ts`). Tests, die einen „Doppel-K.O.“ brauchen, müssen die
  Schläge weiter auseinanderlegen (siehe `lagCompensation.test.ts`, „a real trade“).
- **Bot eingefroren?** `BotBrain.think(..., canAct)` muss `false` bekommen, solange der Bot
  nicht handeln darf (Countdown). Sonst hält er sich für „festgefahren“ und springt beim
  Rundenstart los. `Bot.tick` macht das richtig – eigene Aufrufer müssen es auch tun.
- **Bot läuft nicht in Blickrichtung:** Laufrichtung (`steering.ts`) und Blickrichtung sind
  getrennt. Im Kampf schaut der Bot zum Gegner und läuft zum Wegpunkt.
- **Ein Dash geht in die gedrückte Laufrichtung**, nicht in Blickrichtung. Wer einen Bot
  dashen lässt, muss die Laufrichtung passend setzen (Dash-Angriff: zum Gegner; Ausweichen:
  `dodge()` in `brain.ts`). Sonst dasht der Bot z. B. rückwärts über eine Kante – genau so
  ist es schon passiert.
- **Schwierigkeit nie von Hand „nach Gefühl“ ändern:** `SKILL` in `src/solo/difficulty.ts`
  kommt aus `npm run tune` (eine Zeile je Modus). Nach Änderungen an Bot-KI/Kampf/Modus neu
  ausführen und `BALANCE.md` mit committen. Duell-Taktik in `bots/modeTactics.ts` neutral
  lassen, sonst ändert sich das Duell-Verhalten der Bots.
- **Bots sehen den Gegner interpoliert** (wie ein Mensch, ~100 ms in der Vergangenheit) und
  nicht den neuesten Snapshot – sonst würde die Lag-Kompensation für sie nicht stimmen.
- **Neue Nachricht Client→Server:** muss in `parseClientMessage` (`shared/protocol/codec.ts`)
  validiert werden, sonst lehnt der Server sie als `bad_message` ab.
- **Protokoll geändert?** `PROTOCOL_VERSION` in `shared/config.ts` erhöhen.
- **Blickrichtung beim Respawn:** Der Client richtet die Kamera selbst auf die Spawn-Richtung
  (`faceSpawnDirection` in `client/app/gameApp.ts`), weil Inputs die Blickrichtung bestimmen.
- **Hintergrund-Tab:** Browser pausieren `requestAnimationFrame`; der Spieler bleibt dann stehen
  (Server ersetzt fehlende Inputs nach 0,5 s durch „nichts gedrückt“). Das ist gewollt.
- **Effekte erst nach dem Server?** Nein: Sprung, Dash, Schwung usw. des eigenen Spielers
  werden sofort aus dem vorhergesagten `PlayerState` abgelesen (`client/app/stateWatcher.ts`).
  Nur Treffer/Parry/Tod kommen als `GameEvent` vom Server.
- **Browser-Tests warten auf Zustände, nie auf feste Zeiten.** Im Test-Chromium ohne
  Grafikkarte läuft das Bild langsam; kurze Phasen (Countdown) kann ein Test verpassen. Und:
  HUD-Texte ändern sich erst einen Frame nach dem Zustand (`expectText` benutzen).
- **Funktionen in `page.evaluate`:** keine benannten inneren Funktionen/Pfeilfunktionen in
  Variablen (`tsx` fügt dort einen Helfer `__name` ein, den es im Browser nicht gibt).
  Größere Skripte als Text übergeben (siehe `PARRY_ON_SIGHT` in `tests/browser/run.ts`).
- **Zwei Clients im Browser:** `gameApp.ts` kennt `online` (Netzwerk, kann `null` sein) und
  `solo` (lokal). Alles Sichtbare benutzt `current()`. Nie direkt auf „den“ Client zugreifen,
  und nichts voraussetzen, was es ohne Server nicht gibt (das Menü muss offline funktionieren).
- **Solo hat keinen Timer:** `SoloMatch.step()` wird von der Spielschleife nach jedem
  `client.tick()` aufgerufen (Server-Tick + Bot-Tick). Wer woanders Ticks auslöst, bringt
  Mensch und Server aus dem Takt.
- **Loopback ist synchron:** Eine Nachricht kommt an, noch bevor `send()` zurückkehrt.
  Callbacks deshalb VOR `solo.start()` setzen.
- **Neuer Pfad zu Dateien im Client?** Nie mit `/` am Anfang fest verdrahten – auf GitHub
  Pages liegt die Seite in einem Unterordner (`base` in `vite.config.ts`). Links in
  `index.html` schreibt Vite selbst um; in Code `import.meta.env.BASE_URL` benutzen.
- **Replays rechnen das Match nach**, sie speichern keine Positionen. Jede Änderung an der
  Spiellogik macht alte Replay-Dateien ungültig (die Ansicht zeigt dann „weicht ab Tick …
  ab“). Das ist gewollt; `PROTOCOL_VERSION` erhöhen, dann warnt die Ansicht schon beim Öffnen.
- **JSON verliert `-0`.** Replay-Dateien schreiben `-0` deshalb als Text `"-0"`
  (`serializeReplay`/`parseReplay`). Nie `JSON.stringify` direkt für Replays benutzen.
- **Während ein Replay oder die Killcam läuft, steht das Solo-Match** (die Spielschleife tickt
  es nicht). Der Replay-Betrachter fängt alle Tasten ab (`stopImmediatePropagation`).
- **Port belegt:** `PORT=3001 npm run dev` (Vite liest dieselbe Variable für den Proxy).
- Die Integrationstests starten einen echten Server auf einem freien Port – keine festen Ports
  in Tests verwenden.

## Was bewusst NICHT eingebaut ist (nicht als Bug melden)

Accounts/Persistenz/Ranglisten, mehr als 2 Spieler pro Raum, echte 3D-Modelle (Figuren sind
aus Primitiven gebaut), Sound-Dateien (alle Geräusche werden erzeugt), Mobile-/Gamepad-
Steuerung, Binärprotokoll, schräge Flächen/Rampen, Zuschauer. Replays und Killcam gibt es
nur im Solo-Modus (Ausbau für Online steht in `STATUS.md`, 5.1). Hinweise dazu stehen in
`HOW_TO_EXTEND.md` (Abschnitt „Größere Baustellen“).
