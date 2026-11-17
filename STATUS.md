# STATUS.md – Übergabe

Diese Datei ist die Übergabe an die nächste Person oder KI. Sie setzt **kein Vorwissen**
voraus. Lies zuerst `CLAUDE.md` (Regeln), dann diese Datei, dann arbeite den Abschnitt
„Nächste Schritte“ von oben nach unten ab.

Das Spiel heißt in der Oberfläche **Neonklinge** (1v1-Schwertduell im Browser). Es gibt zwei
Spielarten: Mehrspieler über einen Server und „Solo gegen Bot“ komplett im Browser (auch
auf GitHub Pages veröffentlicht).

---

## 1. So prüfst du, ob alles funktioniert

**Letzter Stand (17.11.):** `npm run check` grün, alle 13 Browser-Tests grün (mit Moduswahl,
Angriffsanzeige und Arena), GitHub-Pages-Workflow grün.

| Befehl | Dauer | Muss enden mit |
|---|---|---|
| `npm install` | einmalig | – |
| `npm run check` | ~40 s | `RESULT: OK - no desyncs, no errors.` und `Tests … passed` (zuletzt 404) |
| `npm run test:browser` | ~2,5 min | `RESULT: OK - all browser tests passed.` (13 Tests). Einmalig vorher: `npx playwright install chromium` |
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

### Vierte Aufgabe (17.11.): Reaktor, Replays, Killcam

| # | Schritt | Stand |
|---|---|---|
| 1 | Browser-Tests nach dem Bot-KI-Ausbau, Pages-Workflow | ✅ 10/10 grün, Workflow grün |
| 2 | Reaktor: Stufen machten kaum Unterschied → Ursache war ein tödlicher Spalt um die Grube (Details in Abschnitt 4, „Balance“). Behoben, neu getunt | ✅ |
| 3 | Replays: Startwelt + Eingaben speichern, exakt nachrechnen (Hash-Vergleich), Ansicht im Browser mit Pause, Zeitlupe, Vor-/Zurückspulen, freier Kamera, Export/Import als Datei; Killcam nach einem Schwert-Kill im Solo-Modus | ✅ – **nur im Solo-Modus** (siehe Abschnitt 4) |

**So funktionieren Replays** (Code: `src/shared/replay/`, `src/server/game/replayRecorder.ts`,
`src/client/replay/`, `src/client/app/replayWiring.ts`): Der Raum schreibt beim Matchstart
die ganze Welt mit (`startWorld`) und danach pro Tick die Eingaben beider Spieler, so wie
der Server sie benutzt hat, plus Rematch-Stimmen. `ReplaySimulator` rechnet das mit
`stepWorld` nach und springt per Keyframes (alle 2 s eine Kopie der Welt) auch zurück. Alle
60 Ticks steht ein Hash der Welt in der Datei; weicht das Nachrechnen ab, zeigt die Ansicht
den ersten abweichenden Tick. Tests: `tests/sim/replay.test.ts` (Hash-Vergleich auf allen
Maps, Export/Import, Springen, Manipulation wird erkannt), `tests/unit/replayPlayback.test.ts`,
Browser-Test „Replay und Killcam“.

### Fünfte Aufgabe (17.11.): Modus-System und Kampfmodi

Das zuerst geplante „Zeitrennen mit Geist“ ist gestrichen (der Besitzer hat umgeplant). Es
war schon gebaut (Commit `893bb45`) und wurde mit `git revert` wieder entfernt; wer es
zurückhaben will: `git revert ff8302d`.

| # | Schritt | Stand |
|---|---|---|
| 1 | Modus-System: Spielregeln als Daten, Moduswahl im Menü (Solo + Mehrspieler), „Duell“ = bisheriges Spiel | ✅ |
| 2 | Angriffsanzeige beim Ausholen (Ring + Ton), per Einstellung schaltbar | ✅ – Einstellung „Nach Modus / An / Aus“; Duell: aus. Nur für den Gegner, nicht im Replay |
| 3 | Modus „Arena“: Leben, Unverwundbarkeit, Konter-Bonus, Dash-Cooldown, Leben im HUD | ✅ – Werte geschätzt, von keinem Menschen gespielt; Bots noch nicht angepasst (Schritt 4) |
| 4 | Bot-KI je Modus, `npm run tune` je Modus | ❌ offen |
| 5 | Replays und Killcam an die Modi anpassen | ⏳ teilweise: die Replay-Datei speichert schon den Modus (`modeId`, Format-Version 2) |

**So funktioniert das Modus-System** (Schritt 1): `src/shared/match/gameModes.ts` enthält
`GameMode` (Leben, Schaden je Angriffsart, Unverwundbarkeit nach Treffer, Konter-Fenster und
-Bonus nach Parry, Dash-Cooldown, Extra-Erholung nach Dash-Angriff, Rundenzahl, Rundenzeit,
Standard der Angriffsanzeige) und `MODES`. Der Modus steht in `SimContext.mode` und wird an
`stepPlayer` (Vorhersage!) und `resolveCombat` übergeben. `hp` zählt jetzt **Leben** (Duell:
1 statt früher 100 – am Spiel ändert das nichts, alte Replay-Dateien passen aber nicht mehr).
Schaden steht nicht mehr in der Waffe, sondern im Modus. Protokoll: `createRoom.modeId`,
`quickMatch.modeId` (paart nur gleiche Modi), `roomJoined.modeId`; `PROTOCOL_VERSION` 7.
Menü: Abschnitt „Modus“ links (gilt für Solo, Schnelles Spiel und Raum erstellen; wer per
Code beitritt, spielt den Modus des Raums). HUD: Modusname neben der Map.
Tests: `tests/unit/gameModes.test.ts` (ein Test-Modus schaltet jede Regel einzeln ein).
**Angriffsanzeige** (Schritt 2): Während der Gegner ausholt (Startup-Phase des Schwungs),
zeigt sein Avatar einen roten Ring, der sich zusammenzieht, und eine rote Klinge
(`client/render/windupRing.ts`, `playerAvatar.ts`); beim Beginn des Schwungs piept es kurz
(Sound `windup` in `client/audio/sounds.ts`, ausgelöst in `client/app/effects.ts`).
Einstellung `windupCue` in `client/app/settings.ts`: `auto` (= `GameMode.windupCueByDefault`),
`on`, `off`; Menü: „Angriffsanzeige beim Ausholen“. Reine Darstellung – die Simulation weiß
nichts davon. Tests: `tests/unit/windupCue.test.ts`, Browser-Test „Angriffsanzeige“.
Grenze: Der Gegner wird ~100 ms in der Vergangenheit gezeigt (Interpolation), der Ring also
auch – genau wie der Schlag selbst, der ja erst entschieden wird, wenn du ihn gesehen hast.

**Modus Arena** (Schritt 3, `ARENA_MODE` in `gameModes.ts`): 3 Leben pro Runde, normaler
Schlag 1 Schaden, Dash-Angriff 2 (aber +0,2 s Erholung), nach einem Treffer 0,75 s
unverwundbar (Figur blinkt weiß), nach einem gelungenen Parry 1,5 s Konter-Fenster mit +1
Schaden (Event `hit.counter`, Text „KONTER!“), Dash-Cooldown 1,6 s statt 1 s, Best-of-3,
Runden 90 s, Angriffsanzeige standardmäßig an. Sturz in den Abgrund tötet weiterhin sofort.
HUD: Herzen neben den Namen (`livesText` in `hudTexts.ts`, nur bei mehr als einem Leben).
Ein nicht tödlicher Treffer klingt nicht mehr wie der Tod (`effects.ts`).
Tests: `tests/unit/gameModes.test.ts` (Arena-Regeln, drei Treffer pro Runde, schnelles Spiel
trennt Modi, Server ohne eigene Config nimmt die Rundenzahl des Modus), `tests/sim/botMatch.test.ts`
(Arena auf jeder Map ohne Desync), `tests/sim/soloMatch.test.ts` (Solo-Arena), Browser-Test
„Arena gegen Bot“. `npm run bots:sim` spielt jetzt abwechselnd 4 Maps Duell, 4 Maps Arena
(`--mode duel|arena` erzwingt einen Modus).
**Bekannte Grenzen:** Ein Konter mit dem Dash-Angriff macht 2+1 = 3 Schaden und tötet damit
sofort aus vollen Leben – gewollt als große Belohnung, aber nicht von Menschen erprobt. Die
Map „Arena“ und der Modus „Arena“ heißen gleich (HUD zeigt „Arena · Arena“).

---

## 3. Offen (priorisiert)

1. ~~Replays und Killcam~~ – fertig (nur Solo). Ausbau: Replays für Online-Matches (Abschnitt 5.1)
2. **Bot-KI weiter ausbauen** (Grundstufe F ist fertig) – Ideen in Abschnitt 5.2
3. **Die neuen Mechaniken von einem Menschen spielen lassen** und Werte nachstellen
   (Rezept 1 in `HOW_TO_EXTEND.md`) – niemand hat Doppelsprung, Clash, Sprungfelder und die
   neuen Maps bisher *gespielt*, nur getestet.
4. Kleinigkeiten aus Abschnitt 4.

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
| Leicht gegen Leicht (Kontrolle) | 50 % | 44 % |
| Mittel gegen Leicht | 70 % | **66 %** (je Map 60–70 %) |
| Schwer gegen Mittel | 90 % | **95 %** (je Map 90–98 %) |
| Schwer gegen Leicht | – | 98 % |

Können-Werte (`SKILL`): leicht 0,05 · mittel 0,09 · schwer 0,55.

- **Reaktor-Befund (17.11., behoben):** Auf Reaktor machte die Stufe kaum einen Unterschied
  (Schwer nur ~55 % gegen Mittel). Ursache war die Map-Geometrie, nicht die KI: Zwischen
  Grubenboden (±5 m) und Ring (±6,5 m) lag ein 1,5 m breiter tödlicher Spalt, und unter
  den 1 m dünnen Ring-Platten war offener Abgrund. Wenn zwei Bots sich beim Wall-Run über
  der Grube begegnen, schiebt die Spieler-Kollision sie von der Wand; mit 9 m/s flogen sie
  über die Grube hinaus in den Spalt. Der schwere Bot nimmt Wall-Runs am liebsten und
  starb so 443-mal (der leichte 41-mal). Lösung: Der Grubenboden füllt jetzt das ganze Loch,
  der Ring reicht bis unter den Grubenboden (die Grube hat feste Wände). Damit Reaktor
  trotzdem tödliche Kanten hat, sind die vier äußeren Ecken des Rings offen. Danach: 0
  Stürze; Test „falling into a lower area is never deadly by itself“ in
  `tests/unit/maps.test.ts` verhindert, dass so ein Spalt wieder entsteht.
- „Leicht gegen Leicht“ liegt mit 44 % (Arena: 30 %) etwas unter 50 %. Bei 160 Matches sind
  ±4 Prozentpunkte Zufall; auf der Arena hat vermutlich eine Spawn-Seite einen Vorteil.
  Nicht untersucht.
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

- **Replays nur im Solo-Modus.** Online-Matches werden nicht aufgezeichnet (Plan in 5.1).
  Die Aufnahme endet nach 20 Minuten (Dateigröße bis ~6 MB) und bei Verbindungsabbruch.
- **Alte Replay-Dateien passen nach jeder Regel-/Spiellogik-Änderung nicht mehr** (die Ansicht
  meldet „weicht ab Tick … ab“). Das ist die Kehrseite des Nachrechnens.
- **Killcam:** zeigt immer die 2,5 s vor dem Kill aus Sicht des Siegers. Bei einem Kill direkt
  nach Rundenstart beginnt sie entsprechend früher am Rundenanfang. Ob Länge und Tempo sich
  gut anfühlen, hat noch kein Mensch beurteilt.
- Die freie Replay-Kamera braucht die eingefangene Maus (ins Bild klicken); mit der Maus
  über der Bedienleiste wird nicht geschaut.

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

### 5.1 Replays für Online-Matches (Ausbau)

Replays gibt es nur im Solo-Modus, weil dort der Server im Browser läuft und der Client die
Aufzeichnung direkt lesen kann. Für Online-Matches:

1. `recordReplays: true` beim Start des echten Servers setzen (`src/server/startServer.ts`
   → `GameServer`-Optionen). Kostet bis zu ~6 MB Speicher pro Raum (Grenze: 20 Minuten).
2. Neue Nachricht Client→Server `{ type: 'getReplay' }` (Rezept 8 in `HOW_TO_EXTEND.md`:
   `messages.ts`, `codec.ts`, `messageRouter.ts`) und Antwort `{ type: 'replay', text }` mit
   `serializeReplay(room.replay())`. Achtung: Die Antwort kann mehrere MB groß sein – erst
   nach dem Match anbieten. `PROTOCOL_VERSION` erhöhen.
3. In `src/client/app/replayWiring.ts` den Replay-Knopf auch online zeigen und die Datei
   über diese Nachricht holen. Killcam online: Die Datei kommt mit Verzögerung; einfacher ist
   eine Killcam aus den letzten Snapshots (`SnapshotBuffer` in `netcode/interpolation.ts`).
4. Ein Replay wird beim Verbindungsabbruch beendet (`ReplayRecorder.stop`), weil Pausen
   nicht nachgerechnet werden. Wer das ändern will: Pause/Fortsetzen als `ReplayAction`
   aufnehmen (wie `rematch`) und in `ReplaySimulator.applyActions` nachspielen.

### 5.2 Bot-KI weiter ausbauen (Priorität 2)

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

### 5.3 Kleinere Aufgaben

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
