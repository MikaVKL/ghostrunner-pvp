# HOW_TO_EXTEND.md – Schritt für Schritt erweitern

Jedes Rezept nennt **die Dateien, die du anfassen musst, in der richtigen Reihenfolge**.
Die Rezepte 2, 3, 6 und 8 wurden beim Umbau zum Ghostrunner-PvP genau so angewendet (Tests
grün, 0 Desyncs).

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
13. [Größere Baustellen](#13-größere-baustellen)
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
| Schaden, Reichweite, Schwung-Phasen, Knockback (je Angriffsart `light`/`dash`), Angriffs-Cooldown | `src/shared/combat/weapons.ts` |
| Parry-Fenster, Parry-Cooldown, Stun-Dauer, Rückstoß, Dash-Angriff-Zeitfenster, Lag-Kompensation | `src/shared/combat/combatConfig.ts` |
| Rundenzahl (Best-of), Rundenzeit, Countdown, Rematch, Reconnect-Zeit | `src/shared/match/matchConfig.ts` |
| Lebenspunkte | `MAX_HP` in `src/shared/sim/playerState.ts` |
| Spielergröße, Augenhöhe | `src/shared/physics/collision.ts` |
| Tasten, Mausempfindlichkeit | `src/client/input/bindings.ts` |
| Sichtfeld (FOV), Licht, Nebel | `src/client/render/sceneSetup.ts` |
| Farben (Spieler, Himmel, Effekte) | `src/client/render/palette.ts` |
| Kamera-Effekte (Wackeln, Neigung, Sichtfeld beim Dash) | `src/client/render/cameraFx.ts` |
| Geräusche | `src/client/audio/sounds.ts` |
| Texte im Spiel | `src/client/ui/hudTexts.ts`, `index.html` |

Zeiten immer als `secondsToTicks(0.25)` schreiben. Danach `npm test` – ein paar Tests prüfen
physikalische Werte relativ zur Config und sollten weiter grün sein.

**One-Hit-Kill** ist nur eine Zahl: Beide Angriffe des Schwerts haben `damage: 100`
(= `MAX_HP`). Für ein Spiel mit mehreren Treffern z. B. `damage: 34` setzen – der Rest
(HP, Tod bei 0 HP) funktioniert weiter. Der Test „every attack … is a one-hit kill“ in
`tests/unit/combat.test.ts` muss dann angepasst werden.

---

## 2. Neue Map

Eine Map ist nur Daten: Quader (`boxes`), Spawns, Todeshöhe, Wegpunkte und Parkour-Links
für Bots. Vorlagen: `src/shared/maps/schlucht.ts` (einfach), `daecher.ts` (mit Sprüngen),
`reaktor.ts` (Ring).

**Schritt 1 –** Datei `src/shared/maps/duel.ts` anlegen:

```ts
import { at, boxFromBounds, boxFromCenter, type MapDef } from './mapTypes';

export const DUEL: MapDef = {
  id: 'duel',
  name: 'Duell', // deutsch, steht im Menü
  description: 'Zwei Plattformen und eine Wand zum Wall-Run.',
  killY: -10, // wer tiefer fällt, stirbt
  boxes: [
    // boxFromBounds(x0, x1, y0, y1, z0, z1, farbe)
    boxFromBounds(-16, -4, -1, 0, -6, 6, 0x232a3d), // Plattform A, Oberkante bei y = 0
    boxFromBounds(4, 16, -1, 0, -6, 6, 0x232a3d), //   Plattform B
    boxFromBounds(-4, 4, -1, 0, -1, 1, 0x3a4566), //    Brücke (sicherer Fußweg)
    boxFromBounds(-8, 8, -3, 7, 6, 7, 0x14b8d4), //     Wand: Fläche bei z = 6 zeigt nach -Z
    // boxFromCenter(mitteX, mitteY, mitteZ, breiteX, höheY, tiefeZ, farbe)
    boxFromCenter(-10, 0.6, -3, 2, 1.2, 2, 0xd4267a), // Deckung
  ],
  spawns: [
    { pos: at(-12, 0), yaw: -Math.PI / 2 }, // Slot 0, schaut nach +X    (at(x, z) = Punkt am Boden)
    { pos: at(12, 0), yaw: Math.PI / 2 }, //   Slot 1, schaut nach -X
  ],
  navPoints: [at(-12, 0), at(-4.5, 0), at(4.5, 0), at(12, 0)],
  links: [
    // Wall-Run an der Wand entlang über die Lücke, je Richtung ein Eintrag.
    // z = 6 - 0.45: die Linie liegt 0,45 m vor der Wandfläche.
    { kind: 'wallRun', from: at(-7, 5.55), to: at(6.5, 5.55) },
    { kind: 'wallRun', from: at(7, 5.55), to: at(-6.5, 5.55) },
  ],
};
```

**Schritt 2 –** in `src/shared/maps/index.ts` registrieren (in `MAPS`; für Quick-Match
zusätzlich in `MAP_ROTATION`). Die Map erscheint dann automatisch in der Map-Auswahl im Menü.

**Schritt 3 –** prüfen und spielen:

```bash
npx vitest run tests/unit/maps.test.ts   # prüft JEDE Map: Spawns, Fußweg, jeden Link
npm run bots:sim -- --map duel           # Bot-Matches nur auf dieser Map
MAP=duel npm run dev                     # Server erzwingt diese Map für alle Räume
```

Als Standard-Map: `DEFAULT_MAP_ID` in `maps/index.ts` ändern.

Regeln für Maps:

- Genau **2 Spawns** (Index = Spieler-Slot), `pos.y` = Oberkante des Bodens darunter, sie
  schauen sich an. Am fairsten ist eine punktsymmetrische Map: `(x, z)` ↔ `(−x, −z)`.
- Yaw: `0` schaut nach −Z, `-Math.PI / 2` nach +X, `Math.PI / 2` nach −X, `Math.PI` nach +Z.
- Boden-Quader lückenlos aneinandersetzen; nichts dünner als 0,25 m.
- **Abgrund:** Zwischen den Spawns muss es Stellen ohne Boden geben (der Test verlangt es).
- **Sicherer Fußweg:** Es muss einen Weg zwischen den Spawns ohne Springen geben (Brücke,
  Steg). Bots, die nicht springen wollen, und Anfänger brauchen ihn.
- **Wall-Run** funktioniert an jeder senkrechten Fläche, die den Oberkörper abdeckt
  (mindestens ~1,5 m hoch). Reichweite: ca. 13 m (1,5 s bei 9 m/s) – Lücken unter 11 m halten.
- **Sprünge:** Ein Sprung aus vollem Lauf trägt ca. 4,9 m weit und 1,5 m hoch. Lücken für
  `jump`-Links höchstens ~3 m breit machen.
- `navPoints`: Punkte auf begehbarem Boden, von denen aus Bots **geradeaus** zueinander
  laufen können. Setze sie an Engstellen (Brückenenden, um Hindernisse herum).
- `links`: Abkürzungen für Bots, je Richtung ein Eintrag.
  - `wallRun`: `from` und `to` liegen auf einer Linie **parallel zur Wand, 0,45 m vor der
    Wandfläche**. `from` liegt 2–3 m vor der Kante (Anlauf), `to` auf dem Boden dahinter.
  - `jump`: `from` liegt 1–2 m vor der Kante, `to` ist der Landepunkt.
- Die Darstellung entsteht automatisch aus den Quadern (`client/render/mapMesh.ts`), die
  Farbe eines Quaders bestimmt auch die Farbe seiner Neon-Kanten.

---

## 3. Neue Waffe

**Schritt 1 –** Eintrag in `WEAPONS` (`src/shared/combat/weapons.ts`). Jede Waffe hat ein
Angriffsprofil pro Angriffsart: `light` (normaler Schwung) und `dash` (Schwung während eines
Dashes):

```ts
dagger: {
  id: 'dagger',
  name: 'Dolch',
  attacks: {
    light: {
      damage: 100, range: 1.8, arcDegrees: 70,
      startupTicks: secondsToTicks(0.12), activeTicks: secondsToTicks(0.08),
      recoveryTicks: secondsToTicks(0.15), knockback: 3,
    },
    dash: {
      damage: 100, range: 2.4, arcDegrees: 50,
      startupTicks: secondsToTicks(0.07), activeTicks: secondsToTicks(0.08),
      recoveryTicks: secondsToTicks(0.35), knockback: 5,
    },
  },
  cooldownTicks: secondsToTicks(0.15),
},
```

**Schritt 2 –** Wer bekommt sie?

- Alle: `DEFAULT_WEAPON_ID = 'dagger'` in derselben Datei.
- Pro Spieler: Das Feld `weaponId` in `PlayerState` bestimmt die Waffe und bleibt über
  Respawns erhalten. Setzen z. B. in `Room.join` (`src/server/game/room.ts`) direkt nach
  `addPlayer(...)`: `addPlayer(this.world, slot, this.ctx.map).weaponId = 'dagger';`
- Waffenwechsel per Taste: neuer Button (Rezept 5) + in `stepIdle`
  (`combat/actions.ts`) bei `wasPressed(...)` `p.weaponId` umschalten.
  Das ist vorhersagbar, also richtig dort.

**Schritt 3 –** Aussehen (optional): `src/client/render/sword.ts` (Modell) und
`swordPose.ts` (Bewegung/Farbe). Dort kannst du nach `p.weaponId` unterscheiden.

**Schritt 4 –** `npm run check`. Die bestehenden Tests benutzen bewusst immer das Schwert
(`tests/helpers.ts`), sie bleiben also grün. Für die neue Waffe einen eigenen Test in
`tests/unit/combat.test.ts` ergänzen (Vorlage: „a swing kills the target with exactly one hit“).

**Neue Angriffsart** (z. B. schwerer Angriff): `AttackKind` in `weapons.ts` erweitern, in
jeder Waffe ein Profil dafür anlegen, und in `stepIdle` (`combat/actions.ts`) entscheiden,
wann `p.attackKind` diesen Wert bekommt (Vorbild: `isDashAttackReady`).

Waffen mit **anderem Verhalten** (Fernkampf, Block, Kombos) brauchen Logik: Geometrie in
`combat/hitDetection.ts`, Ablauf in `combat/resolveCombat.ts`, neue Felder in `AttackProfile`.

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
5. Steuerungshilfe anpassen (Tabelle in `#help` in `index.html`) und, falls die Fähigkeit
   eine Abklingzeit hat, eine Anzeige in `#abilities` ergänzen (Rezept 10).

---

## 6. Neue Kampf-Interaktion

Alles, was **zwischen** Spielern passiert, entscheidet nur der Server – in Teil 2 von
`stepWorld` (`src/shared/sim/stepWorld.ts`). So ist z. B. der Rückstoß beim Parry gebaut:

1. `src/shared/combat/combatConfig.ts`: `parryPushback: 4,`
2. `src/shared/combat/resolveCombat.ts`, in `applyParry`:

   ```ts
   const away = directionBetween(target, attacker);
   attacker.vel.x = away.x * COMBAT.parryPushback;
   attacker.vel.z = away.z * COMBAT.parryPushback;
   ```

3. Test in `tests/unit/combat.test.ts` („a parry during the window blocks the hit, stuns and
   pushes back the attacker“), dann `npm run check`.

So läuft ein Treffer ab (wichtig, bevor du dort etwas änderst):

```
findContacts   Schwung aktiv + Ziel in Reichweite (an der Stelle, an der der Angreifer es
               GESEHEN hat) → Eintrag in world.pendingHits, attackConnected = true
decideHits     sobald das Ziel den Treffer gesehen hat (sein viewTick ≥ Treffer-Tick):
               pariert es gerade und schaut zum Angreifer? → applyParry, sonst applyHit
```

Für ganz neue Interaktionen (Pickups, Schadenszonen, Projektile):

- Eigene Datei, z. B. `src/shared/combat/resolveZones.ts`, mit einer Funktion
  `resolveZones(world, ctx, events)`.
- In `stepWorld.ts` **zwischen** `resolveCombat(...)` und `stepMatch(...)` aufrufen (dort
  steht schon `separatePlayers(...)`, die Spieler-Kollision – ein gutes kleines Vorbild).
- Braucht die Interaktion eigenen Zustand (z. B. „Pickup ist weg“), gehört er in
  `WorldState` (`sim/world.ts`) – als einfache JSON-Daten. Soll der Client ihn sehen: Feld
  in `SnapshotMessage` (`protocol/messages.ts`) ergänzen und in `Room.sendSnapshots` füllen.
- Du musst **nichts** für die Desync-Erkennung tun: `stepWorld` merkt automatisch, welche
  Spieler von Teil 2 verändert wurden.

Reihenfolge-Regel: Erst alle Kontakte **sammeln**, dann **anwenden** (wie `findContacts` →
`applyHit`). Sonst hängt das Ergebnis davon ab, welcher Spieler zuerst in der Liste steht.

---

## 7. Neues Event + Effekt

Es gibt zwei Quellen für „es ist etwas passiert“ – nimm die passende:

| Quelle | Wofür | Wo |
|---|---|---|
| **Moment** | etwas, das ein Spieler selbst beginnt (Sprung, Dash, Schwung …). Kommt ohne Verzögerung, weil es aus dem vorhergesagten Zustand abgelesen wird | `src/client/app/stateWatcher.ts` |
| **GameEvent** | etwas, das der Server entscheidet (Treffer, Parry, Tod, Rundenende) | `src/shared/sim/events.ts` |

Alle sichtbaren und hörbaren Reaktionen stehen in **`src/client/app/effects.ts`**.

**Neuer Moment** (Beispiel: Doppelsprung):

1. `stateWatcher.ts`: `'doubleJump'` zum Typ `Moment` hinzufügen und in `detectMoments`
   erkennen, z. B. `if (after.airJumpsLeft < before.airJumpsLeft) moments.push('doubleJump');`
2. `effects.ts`: in `MOMENT_SOUNDS` einen Sound zuordnen und/oder in `moment()` Partikel
   auslösen (`this.view.particles.burst({...})`).

**Neues GameEvent:**

1. `src/shared/sim/events.ts`: Typ ergänzen, z. B. `| { type: 'pickup'; slot: number }`.
2. Dort erzeugen, wo es passiert, per `events.push({...})` – immer in Teil 2 von `stepWorld`
   (`resolveCombat`, `stepMatch` oder deine eigene Interaktions-Funktion).
3. `effects.ts`, Funktion `gameEvent`: neuen `case` ergänzen.

**Neuer Sound** (es gibt keine Sounddateien – jeder Sound ist ein Rezept aus Tönen und Rauschen):

1. `src/client/audio/sounds.ts`: Name zu `SoundName` hinzufügen und ein Rezept in `RECIPES`
   schreiben. `a.tone(...)` = Ton, dessen Tonhöhe von `from` nach `to` gleitet;
   `a.noise(...)` = gefiltertes Rauschen (Zischen, Rumpeln). Am besten ein ähnliches Rezept kopieren.
2. Abspielen: `playSound(this.audio, 'meinSound')` in `effects.ts`.

**Neuer Text:** in `TEXT` (`src/client/ui/hudTexts.ts`) eintragen, anzeigen mit
`this.hud.toast(TEXT.meinText)`.

**Kamera:** `this.view.cameraFx.shake(0.2)` (Wackeln), `.bump(0.1)` (kurzes Absacken).
Dauerhafte Effekte (Sichtfeld, Neigung) in `src/client/render/cameraFx.ts`.

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
   Vorbilder im Code: `rematch` (einfach, ohne Antwort) und `rejoin` (mit Antwort/Fehler).
5. `PROTOCOL_VERSION` in `src/shared/config.ts` erhöhen.
6. Tests: `tests/unit/protocol.test.ts` (gültig + ungültig) und `tests/unit/lobby.test.ts` /
   `server.test.ts` mit dem `TestClient` aus `tests/serverHelpers.ts`.

TypeScript hilft: Die `switch`-Blöcke in `messageRouter.ts` und `gameClient.ts` enden mit
`default: assertNever(message)`. Fehlt dort ein `case` für die neue Nachricht, meldet
`npm run typecheck` genau an dieser Stelle einen Fehler.

---

## 9. Match-Regeln ändern

- Zahlen: `src/shared/match/matchConfig.ts` (Best-of-5 = `roundsToWin: 3`; Best-of-3 wäre
  `roundsToWin: 2, maxRounds: 5`).
- Rematch: `voteRematch` in `match/lifecycle.ts`, ausgewertet in `stepMatchEnd`.
- Pause bei Verbindungsabbruch: `pauseMatch` / `resumeMatch` in `match/lifecycle.ts`.
- Ablauf (wann endet eine Runde, wer gewinnt): `src/shared/match/stepMatch.ts`.
  Die Phasen stehen in `MatchPhase` (`sim/world.ts`); Diagramm in `ARCHITECTURE.md`.
- Start/Reset: `src/shared/match/lifecycle.ts`.
- In welchen Phasen sich Spieler bewegen dürfen: `phaseAllowsAction` in `sim/world.ts`.
- Tests: `tests/unit/match.test.ts`.

---

## 10. HUD-Element hinzufügen

1. `index.html`: Element in `<div id="hud">` einfügen, mit einer `id`.
2. `src/client/style.css`: Position/Aussehen.
3. `src/client/ui/hud.ts`: Element oben in der Klasse holen (`element('meine-id')`) und in
   `update()` aus `client.localPlayer` / `client.snapshot` befüllen.
4. Texte gehören nach `src/client/ui/hudTexts.ts` (alles Deutsch, an einer Stelle).

Das HUD **liest** nur. Wenn ein Wert fehlt, gehört er in `PlayerState` oder `MatchState`
(dann kommt er automatisch mit jedem Snapshot an).

Menü (`#lobby` in `index.html`, Logik in `ui/lobbyUi.ts`), Steuerungshilfe (`#help` in
`index.html`, reines HTML) und Einstellungen (`app/settings.ts`) funktionieren genauso.
Nach Änderungen an Menü/HUD: `npm run test:browser` (die Tests suchen Elemente über ihre `id`
und prüfen einige deutsche Texte).

---

## 11. Bots anpassen

- Verhalten: `src/bots/brain.ts` (`think()` liefert pro Tick einen `InputSample`),
  Kampfentscheidungen in `src/bots/brainFight.ts`. `BotPersonality` steuert Angriffs-/
  Dash-Angriffs-/Parry-/Sprung-Häufigkeit und wie gern der Bot Parkour-Abkürzungen nimmt
  (`linkCost`).
- Wegfindung: `src/bots/nav.ts` + `navPoints` und `links` der Map.
- Parkour: `src/bots/parkour.ts` (`LinkRunner`) läuft einen `link` der Map ab
  (ausrichten → anlaufen → abspringen → Wall-Run/Flug → landen).
- Der Bot-Report zeigt, wie oft die Bots jede Mechanik benutzt haben („mechanics used by the
  bots“). Steht dort bei deiner neuen Mechanik 0, testen die Bots sie nicht.
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

## 13. Größere Baustellen

### Schon eingebaut (hier steht, wo)

| Thema | Wo | Tests |
|---|---|---|
| Lag-Kompensation für Treffer und Parry | `shared/combat/lagCompensation.ts`, `resolveCombat.ts`; `viewTick` im `InputCmd` | `tests/unit/lagCompensation.test.ts` |
| Spieler-gegen-Spieler-Kollision | `shared/physics/playerCollision.ts` (Teil 2 von `stepWorld`) | `tests/unit/playerCollision.test.ts` |
| Reconnect | `server/game/room.ts` (`disconnect`/`rejoin`), `match/lifecycle.ts` (`pauseMatch`), `netcode/gameClient.ts` (`reconnect`), `client/app/connection.ts` | `tests/unit/reconnect.test.ts` |
| Map-Auswahl in der Lobby | `createRoom.mapId`, `server/lobby/lobby.ts` | `tests/unit/lobby.test.ts` |
| Figuren, Partikel, Kamera-Effekte | `client/render/` | `npm run test:browser` |
| Sound (prozedural, Web Audio) | `client/audio/` | – |

Bekannte Grenzen dieser Lösungen:

- **Lag-Kompensation** schaut höchstens 0,3 s zurück (`COMBAT.maxRewindTicks`). Ein Client
  kann lügen und immer das Maximum behaupten – der Vorteil ist auf diese 0,3 s begrenzt.
- **Spieler-Kollision** ist eine Interaktion: Wer gegen den Gegner läuft, bekommt jede
  Sekunde 30 kleine Corrections (gewollt, wird weich dargestellt). Bei hohem Ping wirkt
  Schieben „gummiartig“.
- **Reconnect** startet die unterbrochene Runde neu, statt mitten in der Runde weiterzumachen.

### Nicht eingebaut (ehrliche Liste, mit Startpunkt)

**Mehr als 2 Spieler.** `MAX_PLAYERS_PER_ROOM`, Slot-Vergabe in `Room.join`, Spawns pro Map,
`scores`/`rematchVotes` in `MatchState`, Siegbedingungen in `stepMatch`, `opponent` in
`GameClient`, HUD. Die Simulation selbst (`stepWorld`, `resolveCombat`, `separatePlayers`)
rechnet bereits mit beliebig vielen.

**Echte 3D-Modelle und Animationen.** `client/render/fighterModel.ts` und `sword.ts` ersetzen
(z. B. `GLTFLoader` aus Three.js). Animation aus `PlayerState` ableiten wie in
`fighterPose.ts`. Modelle nach `public/` legen. Die Kollision bleibt eine Box.

**Schräge Flächen, Rampen, bewegte Plattformen.** Die Kollision kann nur achsenparallele,
unbewegte Quader. Rampen brauchen eine neue Kollisionsroutine in `physics/collision.ts`.

**Bandbreite.** Snapshots sind JSON (~1,2 KB, 30×/s). Für 2 Spieler unkritisch. Bei Bedarf:
Zahlen runden ist **nicht** erlaubt, solange der Client exakt vergleicht – dann zuerst die
Vergleichstoleranz (`PREDICTION_EPSILON`) und das Rebase-Verhalten überdenken.

**Input-Puffer für Aktionen.** Ein Angriff, der während des Cooldowns gedrückt wird, verfällt.
Für „gepufferte“ Eingaben: Feld in `PlayerState` (z. B. `bufferedAttackTicks`), in
`stepAction` setzen/herunterzählen und in `stepIdle` einlösen.

**Accounts, Ranglisten, Persistenz, Anti-Cheat über Input-Prüfung hinaus, Mobile-/Gamepad-
Steuerung, Zuschauer** – nichts davon ist vorhanden.

---

## 14. Fahrplan: Ghostrunner-artiges PvP

Stand des ursprünglichen Fahrplans (✅ = eingebaut):

| # | Feature | Stand |
|---|---|---|
| 1 | One-Hit-Kill, schnelle Runden, Best-of-5 | ✅ |
| 2 | Parkour-Maps mit Lücken, Wänden | ✅ 3 Maps + Arena |
| 3 | Bewegungsgefühl tunen (Tempo, Luftkontrolle, Dash-Länge, Wall-Run-Dauer) | offen – nur Zahlen, Rezept 1 |
| 4 | Doppelsprung oder Slide | offen – Rezept 4 |
| 5 | Parry verfeinern (Rückstoß, Cooldown) | ✅ |
| 6 | Treffer-Feedback: Sound, Kamerawackeln, Partikel | ✅ |
| 7 | Lag-Kompensation | ✅ |
| 8 | Dash-Angriff | ✅ |
| 9 | Richtige Modelle und Animationen | teilweise: Figuren aus Primitiven |
| 10 | Map-Auswahl in der Lobby | ✅ |

Ideen für danach: Doppelsprung (Rezept 4), mehr Maps (Rezept 2), schwerer Angriff als dritte
Angriffsart (Rezept 3), Kill-Cam/Zeitlupe beim letzten Treffer (nur Client), Bots als
Trainingsgegner im Browser (`src/bots/brain.ts` läuft auch im Browser, weil es nur
`shared`/`netcode` benutzt).
