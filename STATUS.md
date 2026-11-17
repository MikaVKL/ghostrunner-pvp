# STATUS.md – Übergabe

Diese Datei ist die Übergabe an die nächste Person oder KI. Sie setzt **kein Vorwissen**
voraus. Lies zuerst `CLAUDE.md` (Regeln), dann diese Datei, dann arbeite den Abschnitt
„Nächste Schritte“ von oben nach unten ab.

Das Spiel heißt in der Oberfläche **Neonklinge** (1v1-Schwertduell im Browser). Es gibt zwei
Spielarten: Mehrspieler über einen Server und „Solo gegen Bot“ komplett im Browser (auch
auf GitHub Pages veröffentlicht).

---

## 1. So prüfst du, ob alles funktioniert

| Befehl | Dauer | Muss enden mit |
|---|---|---|
| `npm install` | einmalig | – |
| `npm run check` | ~40 s | `RESULT: OK - no desyncs, no errors.` und `Tests … passed` (zuletzt 341) |
| `npm run test:browser` | ~2,5 min | `RESULT: OK - all browser tests passed.` (10 Tests). Einmalig vorher: `npx playwright install chromium` |
| `npm run bots` | ~20 s | `RESULT: OK - no desyncs, no errors.` |
| `npm run tune -- --quick` | ~1 min | schreibt `BALANCE.md` neu (Gewinnquoten der Bot-Stufen) |
| `npm run check:all` | ~4 min | alles oben außer `tune` |

Spielen: `npm run dev`, dann <http://localhost:5173>. Solo geht sofort („Solo gegen Bot“),
für Mehrspieler zwei Browser-Fenster öffnen.

**Vor jedem Commit:** `npm run check`. Nach Änderungen an Menü, HUD oder Darstellung
zusätzlich `npm run test:browser`. Nach Änderungen an Bot-KI oder Kampfregeln zusätzlich
`npm run tune` (und `BALANCE.md` mit committen).

Jeder Push startet den GitHub-Workflow `.github/workflows/pages.yml` (Typprüfung, Tests,
Build, Veröffentlichung der Solo-Version auf GitHub Pages). Das funktioniert: Der Besitzer
hat die veröffentlichte Seite gespielt.

---

## 2. Was fertig ist

### Erste Aufgabe: das Spiel (alles ✅, Einschränkungen in Abschnitt 4)

One-Hit-Kill, Parry mit Stun, Dash-Angriff, Cooldowns (als Daten) · Best-of-5, Countdown,
Rematch per Abstimmung · Maps mit Map-Wahl · Lag-Kompensation für Treffer und Parry ·
Spieler-Kollision · Reconnect (Match pausiert, Sitz 20 s reserviert) · Figuren aus
Primitiven, Partikel, Kamera-Effekte, Himmel · prozeduraler Sound · deutsche Oberfläche ·
Bots · Unit-/Sim-/Integrations-/Browser-Tests · `INTERNET.md`.

### Zweite Aufgabe: Solo gegen Bot + GitHub Pages (alles ✅)

`src/solo/` lässt den echten Server-Kern und einen Bot im Browser-Tab laufen (Loopback
statt Netzwerk). Menü mit Schwierigkeit; ohne erreichbaren Server sind die
Mehrspieler-Knöpfe deaktiviert. `npm run build:pages` + Workflow veröffentlichen die Seite.

### Dritte Aufgabe: Bot-Fehler, Mechaniken, Maps, Balance

| # | Schritt | Stand |
|---|---|---|
| A | Bot-Fehler behoben: grundloser Sprung nach Rundenstart, Stürze in den Abgrund, Stehenbleiben am Plattformrand, Patt hinter Deckung. Tests: `tests/sim/botQuality.test.ts` | ✅ |
| B | Doppelsprung (`movement/locomotion.ts`, `airJumpsLeft`) | ✅ |
| C | Klingen-Clash: zwei Schläge innerhalb 0,1 s prallen ab (`combat/resolveCombat.ts`, Event `clash`). Unentschieden zwischen Bots: vorher ~17 %, jetzt ~2 % | ✅ |
| D | Sprungfelder (`MapDef.pads`, `movement/jumpPad.ts`) | ✅ |
| E | Maps überarbeitet: Neonschlucht (Katapulte), Dächer (Turm 4 m, Terrassen 2 m), Reaktor (versenkte Grube, Wand quer darüber); Farbthema je Map (`MapDef.theme`); Luftsteuerung nimmt keinen Schwung mehr weg; Bots bevorzugen jede Runde andere Wege | ✅ |
| T | `npm run tune`: Bot-Selbstspiel stellt die drei Stufen ein, Ergebnis in `BALANCE.md`, Werte in `SKILL` (`src/solo/difficulty.ts`) | ✅ – Ergebnis siehe Abschnitt 4 |
| F | Lebendigere Bot-KI: Reaktionszeit je Stufe, Bestrafen (betäubter/sich erholender Gegner), Ausweich-Dash, Footwork (Kreisen/Zurücktreten/Hineingehen), Kampfstil je Runde (aggressiv/Konter/Ausweicher). `src/bots/brainFight.ts`, `brain.ts`; Tests in `tests/sim/botQuality.test.ts` | ✅ – nur gegen Bots getestet, von keinem Menschen gespielt |
| G | Zusätzliche Tests für die neuen Mechaniken im Browser | ❌ offen – siehe Abschnitt 5 |

---

## 3. Offen (priorisiert)

1. **Replays und Killcam** – Plan in Abschnitt 5.1
2. **Zeitrennen mit Geist** – Plan in Abschnitt 5.2
3. **Bot-KI weiter ausbauen** (Grundstufe F ist fertig) – Ideen in Abschnitt 5.3
4. **Die neuen Mechaniken von einem Menschen spielen lassen** und Werte nachstellen
   (Rezept 1 in `HOW_TO_EXTEND.md`) – niemand hat Doppelsprung, Clash, Sprungfelder und die
   neuen Maps bisher *gespielt*, nur getestet.
5. Kleinigkeiten aus Abschnitt 4.

---

## 4. Bekannte Fehler und Grenzen (ehrlich)

**Nicht von einem Menschen geprüft:**

- Alle Sounds: laufen ohne Fehler, aber niemand hat sie gehört (`client/audio/sounds.ts`).
- Spielgefühl der neuen Mechaniken und der überarbeiteten Maps. Alle Tempo-, Reichweiten-
  und Zeitwerte sind plausible Schätzungen.
- Maus-Steuerung (Pointer-Lock) lässt sich im Test-Browser nicht simulieren.
- Die überarbeiteten Maps wurden nur über Tests und Test-Screenshots geprüft
  (`tests/browser/screenshots/`), nicht gezielt angesehen: Sprungfeld-Pfeile, Farbthemen und
  die Wand über der Reaktor-Grube könnten optisch Nacharbeit brauchen.

**Balance (gemessen, siehe `BALANCE.md`):**

| Paarung (Best-of-5, Bot gegen Bot, 160 Matches) | Ziel | gemessen |
|---|---|---|
| Leicht gegen Leicht (Kontrolle) | 50 % | 43 % |
| Mittel gegen Leicht | 70 % | **76 %** |
| Schwer gegen Mittel | 90 % | **88 %** |
| Schwer gegen Leicht | – | 88 % |

Können-Werte (`SKILL`): leicht 0,05 · mittel 0,17 · schwer 0,99 (nach dem Ausbau der Bot-KI
neu eingestellt; vorher lag Mittel mit 0,08 fast auf Leicht).

- Die Ziele sind ungefähr getroffen. **Schwer liegt am oberen Rand (0,99)** – stärker kann
  der Bot mit den jetzigen Regeln nicht werden. Soll Schwer noch stärker sein, muss
  `STRONGEST` in `src/solo/difficulty.ts` stärker werden (z. B. `reactionTicks` 1–2), danach
  `npm run tune`.
- **„Reaktor“ fällt deutlich aus dem Rahmen:** Dort gewinnt Schwer nur ~55 % gegen Mittel
  und ~51 % gegen Leicht, Mittel sogar nur 43 % gegen Leicht (auf den anderen Maps 85–100 %).
  Auf dieser Map ist Können also fast egal. Vermutete Ursache: Die Kämpfe finden in/um die
  Grube statt, wo Sprungfelder und Abstürze den Ausgang zufällig machen. **Nicht
  untersucht** – nächster Schritt: mit `tests/soloHelpers.ts` (`playMatch`, Feld
  `behavior`: `botFalls`, `humanFalls`, `botKills`) Schwer gegen Leicht auf `reaktor`
  spielen und nachsehen, wie die Runden enden.
- Auch „Leicht gegen Leicht“ ist mit 43 % (Arena: 30 %) nicht ganz ausgeglichen; bei 160
  Matches sind ±4 Prozentpunkte Zufall, das ist etwas mehr. Möglicherweise hat Spawn-Seite 0
  auf der Arena einen Vorteil.
- Die „Parry-Quote“ in `BALANCE.md` ist klein (2–3 %), weil sie durch *alle* Schwünge des
  Gegners geteilt wird, auch die außer Reichweite.
- Gemessen wird Bot gegen Bot. Ob die Stufen für Menschen passen, ist ungeprüft.

**Bots:**

- Bots nehmen Parkour nur an den in der Map eingetragenen `links`. Freies Parkour können
  sie nicht.
- Bots benutzen den Doppelsprung nur beim Klettern, nie im Kampf. Sie täuschen nicht an
  (z. B. Parry ködern) und lesen keine Muster des Spielers.
- Der Ausweich-Dash prüft nur, ob 2–5 m weiter Boden ist, nicht ob dort eine Wand im Weg ist.
- Die Parry-Quote der Bots ist trotz hoher `parryChance` niedrig, weil ein Parry vor dem
  Einschlag kommen muss: Leichte Bots (Reaktionszeit 16 Ticks) sind dafür fast immer zu
  langsam. Das ist gewollt, sollte aber von einem Menschen gegengespielt werden.
- Auf „Reaktor“ springt ein Bot auch dann in die Grube, wenn der Gegner oben bleibt
  (er kommt per Sprungfeld wieder heraus – kein Fehler, wirkt aber manchmal ziellos).

**Tests:**

- `tests/integration/liveServer.test.ts` ist einmal ohne erkennbaren Grund fehlgeschlagen
  und danach in über 20 Läufen nie wieder (läuft in Echtzeit, vermutlich Rechenlast).
- Browser-Tests laufen im Test-Chromium ohne Grafikkarte sehr langsam. Wenn ein Test wegen
  `rooms … expected` scheitert: Ein Raum eines vorherigen Tests ist noch 10 s reserviert –
  am Testanfang `await serverIsEmpty(env)` aufrufen (so wie im Solo- und Reconnect-Test).
- Für Doppelsprung, Clash und Sprungfelder gibt es Unit- und Simulations-Tests, aber
  keinen eigenen Browser-Test.

**Technik:**

- Der Rückstoß beim Parry ist schwach (~0,1 m), weil die Bodenreibung ihn sofort auffrisst.
  Beim Clash ist das gelöst (kleiner Hüpfer, `COMBAT.clashLift`); beim Parry könnte man
  dasselbe tun (`applyParry` in `resolveCombat.ts`).
- Dateien über dem Richtwert von 150 Zeilen: `netcode/gameClient.ts`, `bots/brain.ts`,
  `bots/nav.ts`, `server/game/room.ts`, `client/app/gameApp.ts`, `client/app/effects.ts`.
- Ein echter Tunnel, Hosting und `docker build` wurden nie getestet (`INTERNET.md` sagt das).
- Mehrspieler-Clients mit altem Stand vertragen sich nicht mit einem neuen Server
  (`PROTOCOL_VERSION` ist jetzt 6; es gibt keine Versionsprüfung beim Verbinden).

---

## 5. Nächste Schritte – konkret, der Reihe nach

Allgemein für jeden Schritt: klein anfangen, Test schreiben, `npm run check`, committen,
pushen. Die Rezepte in `HOW_TO_EXTEND.md` nennen die Dateien in der richtigen Reihenfolge.

### 5.1 Replays und Killcam (Priorität 1)

Ziel: Nach einem Treffer sehen beide Spieler die letzten Sekunden noch einmal in Zeitlupe
von außen („Wiederholung“), bevor die nächste Runde beginnt.

Warum das einfach ist: Der Client bekommt 30-mal pro Sekunde den kompletten Zustand beider
Spieler (`SnapshotMessage.players`). Man muss ihn nur aufheben und noch einmal abspielen.
Die Simulation wird dafür **nicht** angefasst (keine Desync-Gefahr).

1. **Aufzeichnen.** Neue Datei `src/netcode/replayBuffer.ts`: Klasse `ReplayBuffer` mit
   `push(tick, players)` (Kopien per `clonePlayer`, höchstens die letzten 240 Ticks = 4 s
   behalten) und `frames()` (Liste `{ tick, players }`, älteste zuerst). Vorbild:
   `SnapshotBuffer` in `src/netcode/interpolation.ts`.
   Test `tests/unit/replayBuffer.test.ts`: füllt 400 Einträge, erwartet ≤ 240 und die
   richtige Reihenfolge.
2. **Befüllen.** In `GameClient.handleSnapshot` (`src/netcode/gameClient.ts`) nach
   `this.remotes.push(...)` auch `this.replay.push(snapshot.tick, snapshot.players)`.
   `resetGameState` leert den Puffer.
3. **Abspielen.** In `src/client/app/gameLoop.ts`: Wenn `client.snapshot.match.phase ===
   'roundEnd'` und die Runde durch einen Treffer endete, nicht den Live-Zustand zeichnen,
   sondern die aufgezeichneten Frames der letzten 2 Sekunden, mit halber Geschwindigkeit
   (Frame-Index aus der seit Phasenbeginn vergangenen Zeit berechnen, zwischen zwei Frames
   mit `lerpVec3` mischen – wie `SnapshotBuffer.sample`).
4. **Kamera und eigene Figur.** `GameView.render` (`src/client/render/gameView.ts`) braucht
   einen zweiten Modus: Kamera nicht in den Augen des Spielers, sondern 4 m hinter und 2 m
   über dem Sieger, Blick auf den Verlierer. Der eigene Spieler muss dann als Figur
   gezeichnet werden: ihn in die Liste `remotes` aufnehmen (die Avatare entstehen pro Slot
   automatisch, siehe `updateAvatars`) und das Ich-Schwert ausblenden.
5. **Anzeige.** Text „WIEDERHOLUNG“ in `TEXT` (`src/client/ui/hudTexts.ts`) und im HUD
   einblenden, solange die Wiederholung läuft.
6. **Tests.** Browser-Test in `tests/browser/run.ts`: nach dem Kill im Test
   „Schwertkampf“ per `expectText('#message', …)` prüfen, dass der Hinweis erscheint.
7. **Später (größer):** ganze Matches speichern. Die Simulation ist deterministisch – der
   Server müsste pro Tick nur die Inputs beider Spieler aufzeichnen (`Room.tick`) und man
   könnte das Match mit `stepWorld` exakt nachrechnen. Nicht vor der Killcam anfangen.

### 5.2 Zeitrennen mit Geist (Priorität 2)

Ziel: Allein von einem Spawn zum anderen rennen, auf Zeit. Die beste eigene Fahrt läuft als
durchsichtiger „Geist“ mit.

1. **Grundlage ist der Übungsmodus.** Ein `SoloMatch` ohne Bot bleibt in der Phase
   `waiting`: freie Bewegung, ein Sturz setzt an den Spawn zurück (`stepWaiting` in
   `src/shared/match/stepMatch.ts`). In `src/solo/soloMatch.ts` eine Option `withBot: false`
   ergänzen (dann `bot` nicht anlegen und in `start`/`step`/`dispose` überspringen).
2. **Ziel und Uhr.** Neue Datei `src/solo/timeTrial.ts`: Klasse `TimeTrial` bekommt pro
   Tick den `PlayerState` des Spielers. Start = erster Tick mit Bewegung; Ziel = Abstand
   zum gegnerischen Spawn (`map.spawns[1].pos`) < 2 m. Zeit in Ticks zählen (Regel 3 in
   `CLAUDE.md`), Anzeige `ticks / 60` Sekunden. Ein Sturz (Position springt zurück zum
   Spawn) setzt die Uhr auf 0.
   Test `tests/unit/timeTrial.test.ts` mit einem per `stepPlayer` gesteuerten Spieler.
3. **Geist aufzeichnen.** In `TimeTrial` pro Tick `{ x, y, z, yaw }` speichern. Bei neuer
   Bestzeit die Liste in `localStorage` unter `ghost:<mapId>` ablegen (im Client, nicht in
   `src/solo` – dort kein `localStorage` benutzen, sonst laufen die Node-Tests nicht).
4. **Geist zeichnen.** In `GameView` einen `PlayerAvatar` mit halb durchsichtigen Materialien
   (`transparent: true, opacity: 0.35` in `fighterModel.ts`) und ihn pro Frame auf die
   Position des Geist-Ticks setzen.
5. **Menü und HUD.** Knopf „Zeitrennen“ in `index.html` + `ui/lobbyUi.ts` (Vorbild: der
   Solo-Knopf, Callback `onSolo`), Zeit und Bestzeit im HUD (`ui/hud.ts`, Texte in
   `hudTexts.ts`).
6. **Tests.** `tests/sim/…`: Ein Bot-Brain läuft die Strecke (Vorbild:
   „a default bot reaches the other spawn“ in `tests/unit/maps.test.ts`) und die Uhr stoppt.
   Browser-Test: Knopf klicken, HUD zeigt eine laufende Zeit.

### 5.3 Bot-KI weiter ausbauen (Priorität 3)

**Fertig (Schritt F):** In `src/bots/brainFight.ts` entscheidet der Bot pro Tick: Schlag,
Dash-Angriff, Bestrafen (`punishChance`, wenn `isOpen(enemy)`), Parry oder Ausweich-Dash –
Parry/Ausweichen erst `reactionTicks` nach dem Sichtbarwerden eines Schlags, einmal pro
Schlag. `FIGHT_STYLES` verschiebt die Chancen je Runde (`newRound()`, aufgerufen aus
`noticeRespawn` in `brain.ts`). In `brain.ts` wählt `footwork()` alle 0,25–0,75 s zwischen
Kreisen, Zurücktreten und Hineingehen; `dodge()` sucht eine Richtung mit Boden. Alle neuen
Werte sind Teil von `WEAKEST`/`STRONGEST` (`src/solo/difficulty.ts`), werden also von
`npm run tune` mit eingestellt. Der Bot-Report zählt `dodges` und `punishes`.

Mögliche nächste Ideen, je einzeln mit Test in `tests/sim/botQuality.test.ts` und danach
`npm run tune`:

1. **Doppelsprung im Kampf:** über einen heranstürmenden Dash-Angriff springen
   (`airJumpsLeft` prüfen, nur wenn unter dem Landepunkt Boden ist: `canStandAt`).
2. **Anpassen an den Spieler:** zählen, wie oft der Spieler pariert (Event `parry` mit
   `defender` = Spieler-Slot); pariert er oft, seltener zuschlagen und stattdessen auf einen
   Fehl-Parry warten (`isOpen` gilt auch in dessen Erholungszeit – dafür `isOpen` um
   `enemy.action === 'parry' && !isParryActive(enemy)` erweitern).
3. **Ausweichen gegen Wände prüfen:** in `dodge()` zusätzlich prüfen, ob auf dem Weg ein
   Quader steht (Vorbild: `isBlocked` in `src/bots/nav.ts`).
4. **Spielgefühl prüfen lassen:** Ein Mensch spielt gegen „Mittel“ und notiert, was
   unnatürlich wirkt. Erst danach weitere Regeln hinzufügen.

### 5.4 Kleinere Aufgaben

- Browser-Test für ein Sprungfeld: Solo auf „Neonschlucht“, Blick mit `a.look(...)` auf das
  Feld bei (−7, 4.5) richten, `W` halten, warten bis `me.pos.x > 5`.
- Parry-Rückstoß spürbar machen (siehe Abschnitt 4, „Technik“).
- `brain.ts` und `gameClient.ts` in kleinere Dateien teilen.

---

## 6. Entscheidungen, die man kennen muss

- **Name im Spiel: „Neonklinge“.** „Ghostrunner“ ist die Marke eines existierenden Spiels;
  übernommen wurden nur genretypische Mechaniken.
- **One-Hit-Kill über Daten:** Alle Angriffe haben `damage: 100` (= `MAX_HP`).
- **Dash-Angriff ohne neue Taste:** Angriff während eines Dashes (oder bis 0,1 s danach).
- **Best-of-5:** Wer zuerst 3 Runden gewinnt; unentschiedene Runden geben keinen Punkt.
- **Rematch per Abstimmung** (`R`); im Solo-Modus stimmt der Bot sofort zu.
- **Lag-Kompensation:** Treffer zählen dort, wo der Angreifer das Ziel sah; entschieden wird
  erst, wenn der Verteidiger den Treffer gesehen hat (bis dahin kann er parieren). Grenze 0,3 s.
- **Klingen-Clash statt Doppel-K.O.** bei fast gleichzeitigen Schlägen.
- **Reconnect pausiert das Match** und startet die unterbrochene Runde neu.
- **Solo-Modus benutzt den echten Server-Kern im Browser** (`src/solo/`); der Kern darf
  deshalb keine Node-Module benutzen (Test in `tests/unit/architecture.test.ts`).
- **Schwierigkeit = eine Zahl („Können“)**, eingestellt per Selbstspiel (`npm run tune`).
- **Jede Map hat einen sicheren Fußweg** zwischen den Spawns (für Anfänger und für Bots, die
  nicht springen wollen); alles andere sind Abkürzungen.
- **Luftsteuerung nimmt keinen Schwung weg** – sonst fliegt man nach Sprungfeldern zu kurz.
- **GitHub-Workflow läuft bei jedem Push auf jedem Branch**; er veröffentlicht nur, was
  Typprüfung, Unit- und Simulationstests besteht.

## 7. Bereits gefundene und behobene Fehler (zum Nachschlagen)

- `wrapAngle` war bei ±π nicht idempotent → seltener Desync. Test in `tests/unit/math.test.ts`.
- Bot sprang nach dem Countdown grundlos (Feststeck-Erkennung zählte die eingefrorene Zeit).
- Bot stand am Plattformrand für immer still; zwei Bots standen hinter einer Deckung im Patt.
- Luftsteuerung bremste auf Lauftempo ab (fiel erst mit den Sprungfeldern auf).
