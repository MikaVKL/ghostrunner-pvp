# HOW_TO_EXTEND.md – Schritt für Schritt erweitern

Jedes Rezept nennt **die Dateien, die du anfassen musst, in der richtigen Reihenfolge**.
Die Rezepte 2, 3 und 4 wurden beim Bau des Templates genau so durchgespielt (Tests grün,
0 Desyncs).

**Nach jedem Rezept:** `npm run check` – am Ende muss stehen
`RESULT: OK - no desyncs, no errors.`

Inhalt:

1. [Werte ändern (Tuning)](#1-werte-ändern-tuning)
2. [Neue Map](#2-neue-map)
3. [Neue Waffe](#3-neue-waffe)
4. [Neue Bewegungsfähigkeit (Beispiel: Doppelsprung)](#4-neue-bewegungsfähigkeit-beispiel-doppelsprung)
5. [Neuer Button / neue Taste](#5-neuer-button--neue-taste)
6. [Neue Kampf-Interaktion (Beispiel: Rückstoß beim Parry)](#6-neue-kampf-interaktion)
7. [Neues Event + Effekt (Sound, Partikel, Text)](#7-neues-event--effekt)
8. [Neue Netzwerk-Nachricht](#8-neue-netzwerk-nachricht)
9. [Match-Regeln ändern](#9-match-regeln-ändern)
10. [HUD-Element hinzufügen](#10-hud-element-hinzufügen)
11. [Bots anpassen](#11-bots-anpassen)
12. [Desync gefunden – was nun?](#12-desync-gefunden--was-nun)
13. [Größere Baustellen (nicht eingebaut)](#13-größere-baustellen-nicht-eingebaut)
14. [Fahrplan: Ghostrunner-artiges PvP](#14-fahrplan-ghostrunner-artiges-pvp)

Die wichtigste Frage vor jedem Feature:

> **Hängt es nur vom eigenen Spieler ab?** (eigener Zustand + eigene Tasten + Map)
> → *vorhersagbar*, gehört in `stepPlayer` (Rezept 4).
>
> **Hängt es vom anderen Spieler oder vom Match ab?** (Treffer, Tod, Punkte, Pickups)
> → *Interaktion*, gehört in Teil 2 von `stepWorld` (Rezept 6).

---

## 1. Werte ändern (Tuning)

Kein Code nötig, nur Zahlen:

| Was | Datei |
|---|---|
| Lauftempo, Sprungkraft, Schwerkraft, Dash, Wall-Run | `src/shared/movement/movementConfig.ts` |
| Schaden, Reichweite, Schwung-Phasen, Knockback | `src/shared/combat/weapons.ts` |
| Parry-Fenster, Stun-Dauer | `src/shared/combat/combatConfig.ts` |
| Rundenzahl, Rundenzeit, Countdown | `src/shared/match/matchConfig.ts` |
| Lebenspunkte | `MAX_HP` in `src/shared/sim/playerState.ts` |
| Spielergröße, Augenhöhe | `src/shared/physics/collision.ts` |
| Tasten, Mausempfindlichkeit | `src/client/input/bindings.ts` |
| Sichtfeld (FOV), Himmel, Licht | `src/client/render/sceneSetup.ts` |

Zeiten immer als `secondsToTicks(0.25)` schreiben. Danach `npm test` – ein paar Tests prüfen
physikalische Werte relativ zur Config und sollten weiter grün sein.

**One-Hit-Kill wie in Ghostrunner:** in `weapons.ts` beim Schwert `damage: 100` setzen.

---

## 2. Neue Map

Eine Map ist nur Daten: Quader (`boxes`), Spawns, Todeshöhe, Wegpunkte für Bots.

**Schritt 1 –** Datei `src/shared/maps/duel.ts` anlegen:

```ts
import { boxFromBounds, boxFromCenter, type MapDef } from './mapTypes';

export const DUEL: MapDef = {
  id: 'duel',
  name: 'Duel',
  killY: -10, // wer tiefer fällt, stirbt
  boxes: [
    // boxFromBounds(x0, x1, y0, y1, z0, z1, farbe)
    boxFromBounds(-10, 10, -1, 0, -6, 6, 0x4a5568), // Boden, Oberkante bei y = 0
    // boxFromCenter(mitteX, mitteY, mitteZ, breiteX, höheY, tiefeZ, farbe)
    boxFromCenter(0, 2, 0, 2, 4, 2, 0x2b6cb0), // Säule
  ],
  spawns: [
    { pos: { x: -8, y: 0, z: 0 }, yaw: -Math.PI / 2 }, // Slot 0, schaut nach +X
    { pos: { x: 8, y: 0, z: 0 }, yaw: Math.PI / 2 }, //  Slot 1, schaut nach -X
  ],
  navPoints: [
    { x: -3, y: 0, z: -3 }, { x: 3, y: 0, z: -3 },
    { x: -3, y: 0, z: 3 }, { x: 3, y: 0, z: 3 },
  ],
};
```

**Schritt 2 –** in `src/shared/maps/index.ts` registrieren:

```ts
import { DUEL } from './duel';
export const MAPS: Record<string, MapDef> = {
  [ARENA.id]: ARENA,
  [DUEL.id]: DUEL,
};
```

**Schritt 3 –** testen und spielen:

```bash
npm run bots:sim -- --map duel
```

```bash
MAP=duel npm run dev
```

Als Standard-Map: `DEFAULT_MAP_ID` in `maps/index.ts` ändern.

Regeln für Maps:

- Genau **2 Spawns** (Index = Spieler-Slot), `pos.y` = Oberkante des Bodens darunter.
- Yaw: `0` schaut nach −Z, `-Math.PI / 2` nach +X, `Math.PI / 2` nach −X, `Math.PI` nach +Z.
- Boden-Quader lückenlos aneinandersetzen; nichts dünner als 0,25 m.
- Wall-Run funktioniert an jeder senkrechten Fläche, die den Oberkörper des Spielers abdeckt
  (mindestens ~1,5 m hoch).
- `navPoints`: Punkte auf begehbarem Boden, von denen aus Bots **geradeaus** zueinander
  laufen können. Setze sie an Engstellen (Brückenenden, um Hindernisse herum). Ohne passende
  Punkte bleiben Bots stehen statt in den Abgrund zu laufen.
- Die Darstellung entsteht automatisch aus den Quadern (`client/render/mapMesh.ts`).
- Karte per Raum wählbar machen (Map-Auswahl in der Lobby): siehe Rezept 8, `mapId` in der
  `createRoom`-Nachricht mitschicken und in `Lobby.createRoom` an den `Room` übergeben.

---

## 3. Neue Waffe

**Schritt 1 –** Eintrag in `WEAPONS` (`src/shared/combat/weapons.ts`):

```ts
dagger: {
  id: 'dagger',
  name: 'Dagger',
  damage: 20,
  range: 1.8,
  arcDegrees: 70,
  startupTicks: secondsToTicks(0.07),
  activeTicks: secondsToTicks(0.07),
  recoveryTicks: secondsToTicks(0.15),
  knockback: 3,
},
```

**Schritt 2 –** Wer bekommt sie?

- Alle: `DEFAULT_WEAPON_ID = 'dagger'` in derselben Datei.
- Pro Spieler: Das Feld `weaponId` in `PlayerState` bestimmt die Waffe und bleibt über
  Respawns erhalten. Setzen z. B. in `Room.join` (`src/server/game/room.ts`) direkt nach
  `addPlayer(...)`: `addPlayer(this.world, slot, this.ctx.map).weaponId = 'dagger';`
- Waffenwechsel per Taste: neuer Button (Rezept 5) + in `stepAction`
  (`combat/actions.ts`) im Zustand `'idle'` bei `wasPressed(...)` `p.weaponId` umschalten.
  Das ist vorhersagbar, also richtig in `stepAction`.

**Schritt 3 –** Aussehen (optional): `src/client/render/sword.ts` (Modell) und
`swordPose.ts` (Bewegung/Farbe). Dort kannst du nach `p.weaponId` unterscheiden.

**Schritt 4 –** `npm run check`. Die bestehenden Tests benutzen bewusst immer das Schwert
(`tests/helpers.ts`), sie bleiben also grün. Für die neue Waffe einen eigenen Test in
`tests/unit/combat.test.ts` ergänzen (Vorlage: „a swing damages the target exactly once“).

Waffen mit **anderem Verhalten** (Fernkampf, Block, Kombos) brauchen Logik: Geometrie in
`combat/hitDetection.ts`, Ablauf in `combat/resolveCombat.ts`, neue Felder in `WeaponDef`.

---

## 4. Neue Bewegungsfähigkeit (Beispiel: Doppelsprung)

Bewegung hängt nur vom eigenen Spieler ab → **vorhersagbar** → gehört in `src/shared/movement/`.

**Schritt 1 – Zustand:** `src/shared/sim/playerState.ts`

```ts
// im Interface PlayerState, bei "movement":
/** Extra jumps left while in the air. Refills on the ground. */
airJumpsLeft: number;

// in createPlayer():
airJumpsLeft: 0,
```

**Schritt 2 – Werte:** `src/shared/movement/movementConfig.ts`

```ts
airJumps: 1,
airJumpSpeed: 7.5,
```

**Schritt 3 – Logik:** `src/shared/movement/locomotion.ts`, in `stepLocomotion` direkt hinter
dem normalen Sprung:

```ts
  if (jumpPressed && (p.grounded || p.coyoteTicks > 0)) {
    p.vel.y = MOVE.jumpSpeed;
    p.grounded = false;
    p.coyoteTicks = 0;
  } else if (jumpPressed && p.airJumpsLeft > 0) {   // <-- neu
    p.vel.y = MOVE.airJumpSpeed;
    p.airJumpsLeft--;
  }
```

**Schritt 4 – Auffüllen am Boden:** `src/shared/movement/stepMovement.ts`, im Block
`if (p.grounded) { ... }`:

```ts
p.airJumpsLeft = MOVE.airJumps;
```

**Schritt 5 – Test:** `tests/unit/doubleJump.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Button, runPlayer, standingPlayer } from '../helpers';

describe('double jump', () => {
  it('allows exactly one extra jump in the air', () => {
    const p = standingPlayer(0, 5);
    runPlayer(p, { buttons: Button.Jump }, 1); // jump
    runPlayer(p, {}, 10);
    runPlayer(p, { buttons: Button.Jump }, 1); // air jump
    expect(p.vel.y).toBeGreaterThan(5);
    expect(p.airJumpsLeft).toBe(0);
    runPlayer(p, {}, 5);
    const before = p.vel.y;
    runPlayer(p, { buttons: Button.Jump }, 1); // no third jump
    expect(p.vel.y).toBeLessThan(before);
  });
});
```

**Schritt 6 –** `npm run check`.

Das Muster ist immer gleich: **Zustand → Config → Logik → Test → Bots.** Was du *nicht* tun
musst: Netzwerk-Code anfassen. Das neue Feld wird automatisch synchronisiert, vorhergesagt
und auf Desyncs geprüft, weil es in `PlayerState` steht.

Größere Fähigkeiten (Grappling Hook, Slide, Zeitlupe) bekommen eine eigene Datei in
`movement/` nach dem Vorbild von `dash.ts` (starten + pro Tick ausführen) und einen Aufruf in
`stepMovement.ts`.

---

## 5. Neuer Button / neue Taste

1. `src/shared/input.ts`: in `Button` das nächste Bit ergänzen (`16`, dann `32`, `64` …)
   **und** in `ALL_BUTTONS` aufnehmen. Vergisst du `ALL_BUTTONS`, filtert der Server den
   Button stillschweigend heraus.

   ```ts
   export const Button = { Jump: 1, Dash: 2, Attack: 4, Parry: 8, Heavy: 16 } as const;
   export const ALL_BUTTONS = Button.Jump | Button.Dash | Button.Attack | Button.Parry | Button.Heavy;
   ```

2. `src/client/input/bindings.ts`: Taste zuordnen, z. B. `KeyE: Button.Heavy` in
   `BUTTON_KEYS` (oder eine Maustaste in `MOUSE_BUTTONS`).
3. In der Spiellogik abfragen: `wasPressed(input, p.prevButtons, Button.Heavy)` für
   „gerade gedrückt“, `isDown(input, Button.Heavy)` für „wird gehalten“.
4. Optional: Bots drücken lassen – `this.press(Button.Heavy)` in `src/bots/brain.ts`.
5. Hinweistext im HUD anpassen (`#hint` in `index.html`).

---

## 6. Neue Kampf-Interaktion

Alles, was **zwischen** Spielern passiert, entscheidet nur der Server – in Teil 2 von
`stepWorld` (`src/shared/sim/stepWorld.ts`). Beispiel: Beim erfolgreichen Parry wird der
Angreifer zusätzlich zurückgestoßen.

1. `src/shared/combat/combatConfig.ts`: `parryPushback: 5,`
2. `src/shared/combat/resolveCombat.ts`, in `applyParry`:

   ```ts
   function applyParry(c: Contact, events: GameEvent[]): void {
     setAction(c.attacker, 'stunned');
     const dx = c.attacker.pos.x - c.target.pos.x;
     const dz = c.attacker.pos.z - c.target.pos.z;
     const dist = Math.hypot(dx, dz) || 1;
     c.attacker.vel.x += (dx / dist) * COMBAT.parryPushback;
     c.attacker.vel.z += (dz / dist) * COMBAT.parryPushback;
     events.push({ type: 'parry', attacker: c.attacker.slot, defender: c.target.slot });
   }
   ```

3. Test in `tests/unit/combat.test.ts` (Vorlage: „a parry during the window blocks the hit“),
   dann `npm run check`.

Für ganz neue Interaktionen (Pickups, Schadenszonen, Projektile):

- Eigene Datei, z. B. `src/shared/combat/resolveZones.ts`, mit einer Funktion
  `resolveZones(world, ctx, events)`.
- In `stepWorld.ts` **zwischen** `resolveCombat(...)` und `stepMatch(...)` aufrufen.
- Braucht die Interaktion eigenen Zustand (z. B. „Pickup ist weg“), gehört er in
  `WorldState` (`sim/world.ts`) – als einfache JSON-Daten. Soll der Client ihn sehen: Feld
  in `SnapshotMessage` (`protocol/messages.ts`) ergänzen und in `Room.sendSnapshots` füllen.
- Du musst **nichts** für die Desync-Erkennung tun: `stepWorld` merkt automatisch, welche
  Spieler von Teil 2 verändert wurden.

Reihenfolge-Regel: Erst alle Kontakte **sammeln**, dann **anwenden** (wie `findContacts` →
`applyHit`). Sonst hängt das Ergebnis davon ab, welcher Spieler zuerst in der Liste steht.

---

## 7. Neues Event + Effekt

Events sind Nachrichten „das ist gerade passiert“ für Effekte. Sie ändern nie die Simulation.

1. `src/shared/sim/events.ts`: Typ ergänzen, z. B. `| { type: 'dash'; slot: number }`.
2. Dort erzeugen, wo es passiert, per `events.push({...})`. (Events entstehen in Teil 2 von
   `stepWorld`, also in `resolveCombat`, `stepMatch` oder deiner eigenen Interaktions-Funktion.
   Für Dinge aus Teil 1 – wie ein Dash – das Event in `stepWorld` aus dem Vorher/Nachher-Zustand
   ableiten oder im Client direkt am `PlayerState` ablesen, z. B. `p.dashTicks > 0`.)
3. `src/client/app/gameApp.ts`, Funktion `showEventFeedback`: neuen `case` ergänzen und dort
   Text (`hud.toast('...')`), Sound oder Partikel auslösen.

Sound: am einfachsten `new Audio('/sounds/hit.mp3').play()` in `showEventFeedback`; Dateien
in einen Ordner `public/sounds/` legen (Vite liefert `public/` automatisch aus).

---

## 8. Neue Netzwerk-Nachricht

Beispiel: Chat-Emote vom Client an den Server.

1. `src/shared/protocol/messages.ts`: zu `ClientMessage` hinzufügen
   `| { type: 'emote'; id: number }` (und ggf. eine Antwort zu `ServerMessage`).
2. `src/shared/protocol/codec.ts`, `parseClientMessage`: `case 'emote':` mit **Prüfung**
   (Typ, Wertebereich) – ungültig → `null`.
3. `src/server/net/messageRouter.ts`: `case 'emote':` – was soll der Server tun?
4. `src/netcode/gameClient.ts`: Methode zum Senden (`sendEmote(id)`) und – falls der Server
   antwortet – ein `case` in `handleServerMessage` plus ein Callback wie `onEmote`.
5. `PROTOCOL_VERSION` in `src/shared/config.ts` erhöhen.
6. Tests: `tests/unit/protocol.test.ts` (gültig + ungültig) und `tests/unit/lobby.test.ts` /
   `server.test.ts` mit dem `TestClient` aus `tests/serverHelpers.ts`.

TypeScript hilft: Die `switch`-Blöcke in `messageRouter.ts` und `gameClient.ts` enden mit
`default: assertNever(message)`. Fehlt dort ein `case` für die neue Nachricht, meldet
`npm run typecheck` genau an dieser Stelle einen Fehler.

---

## 9. Match-Regeln ändern

- Zahlen: `src/shared/match/matchConfig.ts`.
- Ablauf (wann endet eine Runde, wer gewinnt): `src/shared/match/stepMatch.ts`.
  Die Phasen stehen in `MatchPhase` (`sim/world.ts`); Diagramm in `ARCHITECTURE.md`.
- Start/Reset: `src/shared/match/lifecycle.ts`.
- In welchen Phasen sich Spieler bewegen dürfen: `phaseAllowsAction` in `sim/world.ts`.
- Tests: `tests/unit/match.test.ts`.

---

## 10. HUD-Element hinzufügen

1. `index.html`: Element in `<div id="hud">` einfügen, mit einer `id`.
2. `src/client/style.css`: Position/Aussehen.
3. `src/client/ui/hud.ts`: Element im Konstruktor-Bereich holen (`element('meine-id')`) und in
   `update()` aus `client.localPlayer` / `client.snapshot` befüllen.

Das HUD **liest** nur. Wenn ein Wert fehlt, gehört er in `PlayerState` oder `MatchState`
(dann kommt er automatisch mit jedem Snapshot an).

---

## 11. Bots anpassen

- Verhalten: `src/bots/brain.ts` (`think()` liefert pro Tick einen `InputSample`).
  `BotPersonality` steuert Angriffs-/Parry-/Sprung-Häufigkeit.
- Wegfindung: `src/bots/nav.ts` + `navPoints` der Map.
- Bots benutzen den normalen `GameClient`. Neue Fähigkeiten testen sie nur, wenn das Brain die
  Taste auch drückt (`this.press(Button.X)`).
- Zufall immer über `this.rng()` (Seed), nie `Math.random()` – sonst sind Fehlläufe nicht
  reproduzierbar.
- Einen Fehllauf wiederholen: `npm run bots:sim -- --seed 17 --matches 1`.

---

## 12. Desync gefunden – was nun?

Der Report sagt z. B.:
`sim#3/botA: 12 DESYNCS, e.g. tick 812, ack 790: vel.y: -0.4 vs -0.8, wallRunning: false vs true`

1. **Feld ansehen.** Es zeigt, welche Logik betroffen ist (`wallRunning` → `movement/wallRun.ts`).
2. **Letzte Änderung prüfen** (`git diff`). Checkliste der üblichen Ursachen:
   - `Math.random()`, `Date.now()`, `performance.now()` in `src/shared/`?
   - Zustand in einer Modul-/Klassenvariable statt in `PlayerState`?
   - Neues verschachteltes Objekt in `PlayerState`, aber nicht in `clonePlayer` kopiert?
   - Logik in `stepPlayer`, die auf den **anderen** Spieler oder auf `world.match` zugreift?
     (Gehört in Teil 2, Rezept 6.)
   - Welt außerhalb von `stepWorld` geändert, ohne `markAllDisturbed()`?
   - Unterschiedliche Reihenfolge von Rechenschritten zwischen zwei Code-Pfaden?
3. **Reproduzieren:** `npm run bots:sim -- --seed <N> --matches 1 --lag 0 --jitter 0 --drift 0`.
   Bleibt der Desync ohne Lag bestehen, ist es ein reiner Logikfehler.
4. **Eingrenzen:** Änderung stückweise zurücknehmen (`git stash`), bis `desyncs: 0`.
5. Beweis, dass der Detektor selbst funktioniert, steht in `tests/sim/botMatch.test.ts`
   („the desync detector itself“).

---

## 13. Größere Baustellen (nicht eingebaut)

Ehrliche Liste dessen, was fehlt, mit Startpunkt:

**Lag-Kompensation für Treffer.** Aktuell prüft der Server Treffer gegen die *aktuelle*
Position des Ziels; der Angreifer sieht das Ziel aber ~100 ms + halber Ping in der
Vergangenheit. Lösung: In `Room` pro Tick die Positionen aller Spieler in einem Ringpuffer
speichern (letzte ~20 Ticks). Der Client schickt im Input mit, welchen Server-Tick er gerade
anzeigt (`client.renderClock.renderTick`). `resolveCombat` prüft dann gegen die gespeicherte
Position zu diesem Tick (maximal ~250 ms zurück, sonst ablehnen).

**Spieler-gegen-Spieler-Kollision.** Spieler können derzeit durcheinander hindurchlaufen.
Einfache Variante: in Teil 2 von `stepWorld` überlappende Spieler auseinanderschieben
(mit `moveAndCollide`, damit niemand in eine Wand geschoben wird). Achtung: Das ist eine
Interaktion, erzeugt also bei jedem Kontakt Corrections und fühlt sich bei hohem Ping
„gummiartig“ an. Erst testen, ob das Spiel es wirklich braucht.

**Reconnect.** Bei Verbindungsabbruch verlässt der Spieler den Raum. Für Reconnect: beim
Join ein geheimes Token ausgeben, Sitz bei Abbruch einige Sekunden reserviert halten
(`Room.leave` verzögern), bei erneutem Verbinden mit Token den Sitz wieder zuordnen.

**Mehr als 2 Spieler.** `MAX_PLAYERS_PER_ROOM`, Slot-Vergabe in `Room.join`, Spawns pro Map,
`scores` in `MatchState`, Siegbedingungen in `stepMatch`, `opponent` in `GameClient`, HUD.
Die Simulation selbst (`stepWorld`, `resolveCombat`) rechnet bereits mit beliebig vielen.

**3D-Modelle und Animationen.** `client/render/playerAvatar.ts` und `sword.ts` ersetzen
(z. B. `GLTFLoader` aus Three.js). Animation aus `PlayerState` ableiten wie in `swordPose.ts`.
Modelle nach `public/` legen. Die Kollision bleibt eine Box – das Aussehen ist unabhängig.

**Schräge Flächen, Rampen, bewegte Plattformen.** Die Kollision kann nur achsenparallele,
unbewegte Quader. Rampen brauchen eine neue Kollisionsroutine in `physics/collision.ts`.

**Bandbreite.** Snapshots sind JSON (~1 KB, 30×/s). Für 2 Spieler unkritisch. Bei Bedarf:
Zahlen runden ist **nicht** erlaubt, solange der Client exakt vergleicht – dann zuerst die
Vergleichstoleranz (`PREDICTION_EPSILON`) und das Rebase-Verhalten überdenken.

**Accounts, Ranglisten, Persistenz, Anti-Cheat über Input-Prüfung hinaus, Mobile-Steuerung,
Deployment-Skripte** – nichts davon ist vorhanden.

---

## 14. Fahrplan: Ghostrunner-artiges PvP

Vorschlag für die Reihenfolge, jeweils ein kleiner Schritt mit `npm run check` danach:

| # | Feature | Rezept |
|---|---|---|
| 1 | One-Hit-Kill oder wenige HP, schnellere Runden | 1, 9 |
| 2 | Parkour-Map mit Lücken, Wänden, Höhenstufen | 2 |
| 3 | Bewegungsgefühl tunen (Tempo, Luftkontrolle, Dash-Länge, Wall-Run-Dauer) | 1 |
| 4 | Doppelsprung oder Slide | 4 |
| 5 | Parry verfeinern (Rückstoß, perfektes Fenster, Parry-Cooldown) | 6 |
| 6 | Treffer-Feedback: Sound, Kamerawackeln, Partikel | 7 |
| 7 | Lag-Kompensation, damit Treffer bei Ping fair wirken | 13 |
| 8 | Dash-Angriff / schwerer Angriff als zweite Aktion | 5, 3, 6 |
| 9 | Richtige Modelle und Animationen | 13 |
| 10 | Map-Auswahl in der Lobby | 2, 8 |
