# STATUS.md – Stand des Umbaus zum Ghostrunner-artigen PvP („Neonklinge“)

Wer hier weiterarbeitet (Mensch oder KI): zuerst `CLAUDE.md` lesen, dann diese Datei.

Legende: ✅ fertig und automatisch getestet · ⚠️ fertig, aber nur teilweise prüfbar · ❌ nicht gemacht

## Die 12 Anforderungen

| # | Anforderung | Stand | Wo / Nachweis |
|---|---|---|---|
| 1 | Kampfregeln: One-Hit-Kill, Parry-Fenster + Stun, Dash-Angriff, Cooldowns – als Daten | ✅ | `shared/combat/weapons.ts`, `combatConfig.ts`; `tests/unit/combat.test.ts` |
| 2 | Rundensystem: Best-of-5, Countdown, Punktestand, Rematch | ✅ | `shared/match/`; `tests/unit/match.test.ts`, Browser-Test „Rematch“ |
| 3 | 3 Parkour-Maps mit Wall-Run-Wänden, Abgründen, Spawns | ✅ | `shared/maps/schlucht.ts`, `daecher.ts`, `reaktor.ts` (+ alte `arena`); `tests/unit/maps.test.ts` |
| 4 | Lag-Kompensation für Treffer | ✅ | `shared/combat/lagCompensation.ts`; `tests/unit/lagCompensation.test.ts` |
| 5 | Kollision zwischen Spielern | ✅ | `shared/physics/playerCollision.ts`; `tests/unit/playerCollision.test.ts` |
| 6 | Reconnect nach Verbindungsabbruch | ✅ | `server/game/room.ts`, `netcode/gameClient.ts`, `client/app/connection.ts`; `tests/unit/reconnect.test.ts`, Sim- und Browser-Test |
| 7 | Optik ohne Assets: Figuren mit Schwert + Schwung-Animation, Partikel, Kamera-Effekte, Sky, Nebel | ⚠️ | `client/render/`. Per Screenshot geprüft, dass alles gezeichnet wird. **Wie es sich in Bewegung anfühlt, konnte nur ein Mensch beurteilen – bitte ansehen.** |
| 8 | Sound mit Web Audio, prozedural | ⚠️ | `client/audio/` (18 Geräusche). Läuft im Browser-Test ohne Fehler, **aber niemand hat die Sounds gehört.** Klang bitte selbst prüfen und in `sounds.ts` nachstellen. |
| 9 | Deutsche Oberfläche, HUD, Hauptmenü, Steuerungshilfe | ✅ | `index.html`, `client/ui/`; Browser-Tests |
| 10 | Bots nutzen Wall-Run, Parry und die neuen Mechaniken | ✅ | `bots/brain.ts`, `brainFight.ts`, `parkour.ts`, `nav.ts`; Zähler im Bot-Report + Test in `tests/sim/botMatch.test.ts` |
| 11 | `npm test` erweitert + Playwright als eigenes Skript | ✅ | 264 Tests in `npm test`; 7 Browser-Tests in `npm run test:browser` |
| 12 | Anleitung „übers Internet“ + Tunnel testen | ⚠️ | `INTERNET.md`, `Dockerfile`. **Ein echter Tunnel wurde NICHT getestet** (siehe unten). Ersatz: Test hinter lokalem Reverse-Proxy. |

Letzter Komplettlauf (`npm run check:all`, nach der zweiten Aufgabe): 291/291 Tests grün,
Bot-Simulation und Live-Bots ohne Desync, 10/10 Browser-Tests grün.

## Zweite Aufgabe: Solo gegen Bot + GitHub Pages

| # | Anforderung | Stand | Wo / Nachweis |
|---|---|---|---|
| 1 | Button „Solo gegen Bot“: lokales Match, geteilte Spiellogik läuft im Browser, Gegner ist ein vorhandener Bot | ✅ | `src/solo/soloMatch.ts` (echter `GameServer` + `Bot` über Loopback), `client/app/gameApp.ts` |
| 2 | Map und Schwierigkeit (leicht/mittel/schwer) über Bot-Parameter | ✅ | `src/solo/difficulty.ts`, Menü; `tests/sim/difficulty.test.ts` („schwer“ schlägt „leicht“) |
| 3 | Alle Regeln gleich: Best-of-5, Parry, Dash, Wall-Run, Abgrund, Rematch mit R | ✅ | derselbe Code wie online; `tests/sim/soloMatch.test.ts`, Browser-Test „Solo gegen Bot“ |
| 4 | Mehrspieler bleibt; ohne Server deaktiviert mit klarem Hinweis, kein Absturz | ✅ | `client/ui/lobbyUi.ts` (`setOnlineState`), Browser-Test „Ohne Server (wie GitHub Pages)“ |
| 5 | Vite-Build mit `base`-Pfad für Pages + Actions-Workflow bei jedem Push | ⚠️ | `vite.config.ts` (`npm run build:pages`), `.github/workflows/pages.yml`. **Der Workflow läuft auf GitHub bis einschließlich Build durch, das Veröffentlichen scheitert noch** – siehe unten. |
| 6 | Tests in `npm test` und Browser-Tests für Solo, Solo ohne Server fehlerfrei | ✅ | 27 neue Tests in `npm test` (291 gesamt), 3 neue Browser-Tests (10 gesamt) |
| 7 | Doku in README, INTERNET, STATUS | ✅ | zusätzlich CLAUDE.md, ARCHITECTURE.md, HOW_TO_EXTEND.md |

**Stand GitHub Pages (wichtig):** Der Workflow wurde gepusht und ist auf GitHub zweimal
gelaufen. Beide Male waren Code holen, `npm ci`, Typprüfung, 285 Tests und der Build mit
`/ghostrunner-pvp/` **grün**. Rot wurde der Schritt „Pages vorbereiten“ mit der Meldung
*„Get Pages site failed. Please verify that the repository has Pages enabled and configured
to build using GitHub Actions“*. Das ist kein Fehler im Code: Pages muss einmal vom
Repo-Besitzer eingeschaltet werden (**Settings → Pages → Source: „GitHub Actions“**), das
kann ein Workflow nicht selbst. **Bis dahin schlägt der Workflow bei jedem Push fehl** (und
GitHub schickt dir dazu E-Mails). Die Schritte „Seite hochladen“ und „veröffentlichen“ sind
deshalb auf GitHub noch **nie gelaufen** und unbestätigt.

Mögliche zweite Hürde danach: Der Standard-Branch des Repos ist derzeit
`claude/multiplayer-game-template-j5o8if`, die Arbeit liegt auf `ccr-604843d9-gwr2ie`.
GitHub erlaubt das Veröffentlichen auf Pages üblicherweise nur vom Standard-Branch. Falls
der „deploy“-Job das meldet: Branch mergen oder unter Settings → Environments →
github-pages freigeben (genaue Schritte: `INTERNET.md`, Variante E).

Entscheidungen zu dieser Aufgabe:

- **Nichts nachgebaut:** Der Solo-Modus benutzt den echten Server-Kern im Browser statt einer
  zweiten, vereinfachten Spielschleife. Dafür durfte der Kern keine Node-Module mehr benutzen
  (das Reconnect-Token kommt jetzt aus der Web-Crypto-API). Ein Test wacht darüber.
- **Neuer Ordner `src/solo/`** als einzige erlaubte Brücke zwischen Client und Server-Kern.
- **Solo pausiert im Hintergrund-Tab** (der Takt kommt von der Bildschleife) – gewollt.
- **Der Bot stimmt einem Rematch immer sofort zu;** es fehlt nur `R` vom Spieler.
- **Workflow läuft auf jedem Branch** („bei jedem Push“). Vor dem Veröffentlichen laufen
  Typprüfung, Unit- und Simulationstests, aber bewusst nicht die Echtzeit-Integrationstests
  (auf CI-Rechnern wackelig) und nicht die Browser-Tests (bräuchten einen Browser-Download).
- **Pages kann nur Solo.** Mehrspieler braucht einen Server-Prozess; die Seite zeigt das an.

Nicht getestet bei dieser Aufgabe: die echte Pages-Seite (s. o.); wie sich die drei
Schwierigkeitsstufen für einen Menschen anfühlen (die Zahlen sind geschätzt – geprüft ist
nur, dass „schwer“ gegen „leicht“ gewinnt und jeder Bot einen stillstehenden Spieler besiegt).

## Dritte Aufgabe (läuft): Bot-Fehler, mehr Mechaniken, unterschiedlichere Maps, lebendigere Bot-KI

Auftrag des Besitzers nach dem ersten Spielen auf GitHub Pages: „Bot funktioniert manchmal
nicht richtig“, „Maps sind zu ähnlich/basic“, „Mechaniken ausbauen“, „Bot-KI erweitern und
mehr Bot-Tests, damit es sich dynamisch anfühlt“.

GitHub Pages ist inzwischen bestätigt: Der Workflow-Lauf Nr. 3 war komplett grün und der
Besitzer hat die Seite gespielt.

Reihenfolge (⬜ offen · 🔧 in Arbeit · ✅ fertig) – wer weitermacht, nimmt den ersten Punkt
ohne ✅:

| # | Schritt | Stand |
|---|---|---|
| A | Bot-Fehler beheben (Befund unten) + Qualitäts-Tests „Bot stürzt nicht von selbst ab / bleibt nicht stehen“ (`tests/sim/botQuality.test.ts`) | ✅ |
| B | Mechanik: Doppelsprung (`airJumpsLeft` in `PlayerState`, `movement/locomotion.ts`; `tests/unit/doubleJump.test.ts`) | ✅ |
| C | Mechanik: Klingen-Clash – zwei Schläge innerhalb von 0,1 s prallen ab statt Doppel-K.O. (`resolveCombat.ts`, Event `clash`). Unentschieden zwischen Bots: vorher ~17 %, jetzt ~2 % | ✅ |
| D | Mechanik: Sprungfelder als Map-Element (`MapDef.pads`, `movement/jumpPad.ts`; `tests/unit/jumpPad.test.ts`). Noch in keiner Map verbaut – kommt mit Schritt E | ✅ |
| E | Maps überarbeiten: echte Höhenunterschiede, Sprungfelder, eigenes Farbthema je Map (`MapDef.theme`) | ⬜ |
| F | Bot-KI: Ausweich-Dash, Fehlschläge/Stun bestrafen, Vor-und-Zurück, Kampfstil je Runde, Reaktionszeit je Schwierigkeit | ⬜ |
| G | Mehr Bot-Tests (Qualität, Nutzung der neuen Mechaniken, Reihenfolge der Schwierigkeiten) + Browser-Tests + Doku | ⬜ |

**Befund zu A (gemessen mit simulierten Solo-Matches gegen einen stillstehenden Spieler):**

1. *Bot springt kurz nach Rundenstart grundlos und stürzt ab* (auf „Dächer“ dreimal an
   derselben Stelle). Ursache: `BotBrain.unstick` zählt auch die Zeit, in der der Bot im
   Countdown eingefroren ist, als „ich stecke fest“ und drückt dann im vollen Lauf Springen.
   Lösung: Im eingefrorenen Zustand nicht zählen (`Bot.tick` weiß die Phase).
2. *Zufällige Sprünge/Dashes ins Leere:* `moveRandomly` springt ohne zu prüfen, wo der Bot
   landet, und 10 % der Zufalls-Dashes sind absichtlich ungeprüft (Altlast aus dem Template).
   Lösung: Landepunkt prüfen (`canStandAt`).
3. *Bot bleibt für immer stehen,* wenn er ganz am Rand einer Plattform landet: Von dort gilt
   kein Weg als „sicher begehbar“, `planRoute` liefert „bleib stehen“. Lösung: zum nächsten
   sicheren Punkt gehen (`nav.ts`).
4. *Zwei Bots stehen sich bis zu 42 s reglos gegenüber,* wenn eine Deckung zwischen ihnen
   steht: Im Nahkampf lief der Bot stur in Blickrichtung (zum Gegner) statt zum Wegpunkt.
   Lösung: Laufrichtung und Blickrichtung getrennt (`bots/steering.ts`).

Alle vier sind behoben. Messung danach (4 Maps × 3 Stufen × mehrere Seeds): 0 Abstürze gegen
einen stehenden Spieler, jede Runde endet mit einem Schwert-Treffer, längstes Stehen 0,6 s.

## Was NICHT oder nur teilweise umgesetzt ist (ehrlich)

- **Echter Tunnel nicht getestet.** Die Bau-Umgebung hat das Öffnen eines Tunnels ins
  Internet blockiert (Sicherheitsregel der Umgebung). Getestet ist stattdessen automatisch:
  Produktionsmodus auf einem Port und ein ganzes Bot-Match durch einen lokalen Reverse-Proxy
  (`tests/integration/behindProxy.test.ts`) – das ist technisch dieselbe Situation. Die
  Tunnel-Befehle in `INTERNET.md` sind die Standardaufrufe, aber ungeprüft.
- **Hosting und `docker build` nicht getestet** (kein Anbieter-Konto, kein Docker verfügbar).
- **Sound nie gehört, Spielgefühl nie „gespielt“.** Alles ist per Code und Screenshot geprüft.
  Maus-Steuerung (Pointer-Lock) lässt sich im Test-Browser nicht simulieren; die Tests steuern
  per Tastatur und setzen die Blickrichtung direkt. Der Maus-Code stammt unverändert aus dem
  Template (dort lief er).
- **Balancing ist geschätzt, nicht erspielt:** Schwung-Vorlauf 0,2 s, Parry-Fenster 0,25 s,
  Stun 1 s, Dash-Angriff-Reichweite 3,2 m usw. Das sind plausible Startwerte.
- **Bots:** nehmen Wall-Runs und Sprünge nur an den in der Map eingetragenen `links`. Freies
  Parkour (beliebige Wände) können sie nicht. Bei sehr langen Wall-Runs machen sie nur dort
  einen Wandsprung, wo sicher Boden ist.
- **Ein einziger unerklärter Test-Wackler:** `tests/integration/liveServer.test.ts` („two bots
  play full matches over real WebSockets“) ist während der Arbeit **einmal** fehlgeschlagen
  und danach in 15 Komplettläufen nie wieder. Ursache unbekannt (vermutlich Rechenlast, der
  Test läuft in Echtzeit). Falls er wieder auftritt: Die Fehlermeldung nennt das Problem
  (`findProblems`), bitte festhalten.
- **Dateigröße:** Der Richtwert „< 150 Zeilen“ wird von 4 Dateien überschritten:
  `netcode/gameClient.ts` (~300, war schon im Template groß), `bots/brain.ts` (~210),
  `server/game/room.ts` (~190), `bots/nav.ts` (~180).

## Entscheidungen (bei Unklarheit die einfachere Variante)

- **Name im Spiel: „Neonklinge“.** „Ghostrunner“ ist die Marke eines existierenden Spiels;
  übernommen wurden nur genretypische Mechaniken, keine Namen, Figuren, Level oder Grafiken.
- **One-Hit-Kill über Daten:** Alle Angriffe haben `damage: 100` (= `MAX_HP`). HP bleiben im
  Code erhalten, damit Waffen mit weniger Schaden möglich sind. Deshalb gibt es keine HP-Balken.
- **Dash-Angriff ohne neue Taste:** Angriff während eines Dashes (oder bis 0,1 s danach, oder
  im selben Tick) benutzt das Angriffsprofil `dash` der Waffe.
- **Erfolgreicher Parry:** Angreifer 1 s gestunt + zurückgestoßen, Verteidiger sofort wieder
  frei (Konter). Ein Parry ins Leere: 0,3 s Erholung + 0,5 s Cooldown.
- **Best-of-5:** Wer zuerst 3 Runden gewinnt. Unentschiedene Runden (Doppel-K.O., Zeit
  abgelaufen) geben keinen Punkt; nach spätestens 9 Runden endet das Match.
- **Rematch per Abstimmung:** Beide drücken `R`. Die Test-Config startet weiter automatisch.
- **Maps:** Jede hat einen sicheren Fußweg UND Wall-Run-Abkürzungen. Die alte `arena` bleibt
  als Übungs-/Test-Map. Private Räume: Ersteller wählt die Map; Quick-Match rotiert.
- **Lag-Kompensation geht über Abschnitt 13 hinaus:** Zusätzlich zum Zurückspulen der
  Zielposition wird ein Treffer erst entschieden, wenn der Verteidiger ihn *gesehen* hat –
  sonst wäre Parry (die Kernmechanik) schon bei 100 ms Ping kaum möglich. Preis: Kills werden
  ~0,1 s + Ping des Gegners später bestätigt. Grenze für beides: 0,3 s.
- **Reconnect pausiert das Match** (statt weiterzuspielen – bei One-Hit-Kill wäre der
  Abwesende sofort tot) und startet die unterbrochene Runde neu.
- **Spieler-Kollision ist serverseitig** (nicht vorhergesagt) → kleine Corrections bei Berührung.
- **Bots sehen den Gegner interpoliert** (wie ein Mensch), damit die Lag-Kompensation passt.
- **Browser-Tests als eigenes Skript ohne Test-Framework** (`tests/browser/run.ts`), damit
  `npm test` schnell bleibt und kein Browser nötig ist.

## Gefundene und behobene Fehler aus dem Template

- `wrapAngle` war bei ±π nicht idempotent → seltener Desync (`yaw: -3.14159… vs 3.14159…`).
  Von den Bots gefunden, behoben, Regressionstest in `tests/unit/math.test.ts`.

## Nächste Schritte (Vorschlag, in dieser Reihenfolge)

0. **GitHub Pages einschalten:** Settings → Pages → Source: „GitHub Actions“, dann im Tab
   Actions den letzten Lauf mit „Re-run jobs“ neu starten und prüfen, ob „deploy“ grün wird.
1. **Selbst spielen** (zuerst „Solo gegen Bot“, dann zwei Fenster, `npm run dev`) und aufschreiben, was sich falsch anfühlt:
   Tempo, Schwung-Timing, Parry-Fenster, Lautstärke/Klang der Sounds, Schwert-Position.
   Fast alles davon sind Zahlen (Rezept 1 in `HOW_TO_EXTEND.md`).
2. **Tunnel ausprobieren** (`INTERNET.md`, Variante B) und mit
   `npm run bots -- --url wss://DEINE-ADRESSE/ws --matches 2` prüfen.
3. Mit einem Freund spielen und den Ping beobachten (`F3`).
4. Danach nach Lust: Doppelsprung (Rezept 4), weitere Maps (Rezept 2), Bot als
   Trainingsgegner im Browser, Treffer-Zeitlupe.
