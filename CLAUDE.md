# CLAUDE.md – Projektregeln für KI-Assistenten

Dieses Repo ist ein **Template für Multiplayer-Browserspiele** (1v1, autoritativer Server,
Client-Side-Prediction). Lies diese Datei komplett, bevor du etwas änderst. Der Besitzer ist
Programmieranfänger: erkläre, was du tust, und halte Änderungen klein.

Weitere Doku: `ARCHITECTURE.md` (wie alles zusammenhängt), `HOW_TO_EXTEND.md` (Rezepte für
Features/Waffen/Maps), `LEARNING.md` (Konzepte für Anfänger), `README.md` (Start).

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren (einmalig) |
| `npm run dev` | Server (Port 3000) + Vite-Client (Port 5173) mit Auto-Reload |
| `npm test` | Typecheck + alle Tests (Unit, Bot-Simulation, echter Server). ~15 s |
| `npm run bots:sim` | 20 Bot-Matches im Speicher mit Lag/Jitter. ~2 s. **Schnellster Desync-Check** |
| `npm run bots` | Bot-Matches über echte WebSockets gegen einen echten Server. ~20 s |
| `npm run check` | `npm test` + `npm run bots:sim` – vor jedem Commit ausführen |
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
src/server/    Nur Server: Tick-Loop, Räume, Lobby, WebSocket. Darf shared importieren.
src/netcode/   Client-Netzwerklogik OHNE Browser-Abhängigkeit (Prediction, Reconciliation,
               Interpolation). Wird vom Browser-Client und von den Bots benutzt.
src/client/    Nur Browser: Three.js, Eingabe, HUD. Darf shared + netcode importieren.
src/bots/      Test-Bots, simuliertes Netzwerk, Reports. Darf alles außer client importieren.
tests/         unit/ (einzelne Funktionen), sim/ (Bot-Matches), integration/ (echter Server).
```

Import-Regeln (nicht brechen): `shared` importiert **nichts** aus den anderen Ordnern.
`server` und `client` importieren sich **nie** gegenseitig.
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
   - *Interaktion* (hängt vom anderen Spieler oder Match-Regeln ab: Treffer, Tod, Respawn)
     → in `resolveCombat` oder `stepMatch`, aufgerufen von `stepWorld`. Nur der Server
     entscheidet; der Client bekommt das Ergebnis per Snapshot.
6. **Welt-Änderungen nur in `stepWorld`.** Wenn der Server die Welt außerhalb davon ändert
   (wie `Room.join/leave`), muss er `markAllDisturbed()` aufrufen.
7. **Buttons sind flankengesteuert**: Aktionen starten mit `wasPressed(input, p.prevButtons, Button.X)`,
   nicht mit `isDown`, sonst lösen sie jeden Tick aus.

## Konventionen

- Sprache: Code, Bezeichner und Code-Kommentare **Englisch**; Doku-Dateien **Deutsch**.
- TypeScript `strict`. Kein `any`. Relative Imports ohne Dateiendung.
- Kleine Dateien (Richtwert < 150 Zeilen), eine Aufgabe pro Datei, Kommentar-Kopf, der erklärt,
  wozu die Datei da ist.
- Tuning-Werte nie im Code verstreuen, sondern in den Config-Dateien:
  `movement/movementConfig.ts`, `combat/weapons.ts`, `combat/combatConfig.ts`,
  `match/matchConfig.ts`, `shared/config.ts`, `client/input/bindings.ts`.
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
- **Neue Nachricht Client→Server:** muss in `parseClientMessage` (`shared/protocol/codec.ts`)
  validiert werden, sonst lehnt der Server sie als `bad_message` ab.
- **Protokoll geändert?** `PROTOCOL_VERSION` in `shared/config.ts` erhöhen.
- **Blickrichtung beim Respawn:** Der Client richtet die Kamera selbst auf die Spawn-Richtung
  (`faceSpawnDirection` in `client/app/gameApp.ts`), weil Inputs die Blickrichtung bestimmen.
- **Hintergrund-Tab:** Browser pausieren `requestAnimationFrame`; der Spieler bleibt dann stehen
  (Server ersetzt fehlende Inputs nach 0,5 s durch „nichts gedrückt“). Das ist gewollt.
- **Port belegt:** `PORT=3001 npm run dev` (Vite liest dieselbe Variable für den Proxy).
- Die Integrationstests starten einen echten Server auf einem freien Port – keine festen Ports
  in Tests verwenden.

## Was bewusst NICHT eingebaut ist (nicht als Bug melden)

Lag-Kompensation für Treffer, Spieler-gegen-Spieler-Kollision, Reconnect nach Verbindungsabbruch,
Accounts/Persistenz, Sound, echte 3D-Modelle/Animationen, Mobile-Steuerung, Binärprotokoll.
Hinweise dazu stehen in `HOW_TO_EXTEND.md` (Abschnitt „Größere Baustellen“).
