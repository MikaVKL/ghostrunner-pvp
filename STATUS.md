# STATUS.md – Übergabe

Diese Datei ist die Übergabe an die nächste Person oder KI. Sie setzt **kein Vorwissen**
voraus. Lies zuerst `CLAUDE.md` (Regeln), dann diese Datei, dann arbeite den Abschnitt
„Nächste Schritte“ von oben nach unten ab.

Das Spiel heißt in der Oberfläche **Neonklinge** (1v1-Schwertduell im Browser). Es gibt zwei
Spielarten: Mehrspieler über einen Server und „Solo gegen Bot“ komplett im Browser (auch
auf GitHub Pages veröffentlicht).

---

## 0. Aktuelle Aufgabe (17.11.): Ghostrunner-Flow – Plan

Ziel: Kein stumpfes Aufeinander-Zulaufen mehr. One-Shot bleibt im Duell, Block/Parry und
Ausweichen werden der Kern. Alles im geteilten Kern, Desync-Tests bleiben grün.

1. **Gefühl (nur Client):** Bloom, Speedlines, Schwertspur, Hitstop, sofortiger Treffer-Funke
   (Kill-Effekt erst nach Server-Bestätigung), deutlicheres Ausholen – alles abschaltbar.
2. **Bewegung:** immer sprinten (C = gehen), Tempo neu, Schwung erhalten, Slide/Ducken (Ctrl),
   Tasten-Puffer, Erholung per Dash/Sprung abbrechen, Dash durch den Gegner, Schlag mit
   Vorwärtsdrang, Luftschlag, Zielhilfe (Eingabe-Flag, abschaltbar), Tastenbelegung im Menü.
   → **Playtest-Checkpoint 1** (Anhalten, auf Feedback warten).
3. Dash-Ladungen (2, je ~3 s, HUD, max. 1 Luft-Dash bis Boden/Wand, Treffer/Parry gibt zurück).
4. Haltungsleiste: Block (Q halten) füllt eigene Leiste, Parry (0,15 s) füllt die des Angreifers,
   voll = 1,5 s betäubt, HUD. → **Playtest-Checkpoint 2**.
5. Shuriken (rechte Maus: zielen/loslassen, Vorlauf-Indikator, langsamer Flug, betäubt).
6. Maps: mehr Höhe, lange Wall-Run-Wände, Deckung.
7. Bot-KI mit Stilen (Rusher, Konterer, Flanker, Shuriken-Kiter), Stil-Matrix in `BALANCE.md`.
8. Nach jedem Schritt: `npm run check`, Bots unter Lag (`bots:sim -- --lag 150`), bei
   Regeländerungen `npm run tune`, STATUS aktualisieren, committen, pushen.
9. KANN: Modus „Flow“ (Sofort-Respawn, 10 Kills). SPÄTER (nur vorgemerkt, Abschnitt 5.4):
   Greifhaken, Spezialangriff, schwere Angriffe, Third-Person, Gamepad, Hosting, Lebensleisten.
10. NICHT: Zeitrennen.

### Stand der Schritte

| # | Schritt | Stand |
|---|---|---|
| 1 | Gefühl (nur Client) | ✅ – siehe unten; Schwertspur und Sounds von keinem Menschen gesehen/gehört |
| 2 | Bewegung | ✅ – Playtest 1 erledigt (18.11.): „gutes Tempo/Gefühl“, Dash und Wall-Run fühlen sich gut an |
| 3 | Dash-Ladungen | ✅ – siehe unten |
| 4 | Haltungsleiste, Block, Parry | ✅ – siehe unten; **wartet auf Playtest** (Checkpoint 2) |
| 5–7 | Shuriken, Maps, Bot-Stile | ⏸ nicht begonnen |

### ⏸ PLAYTEST-CHECKPOINT 2 – bitte testen und Rückmeldung geben

Ich habe nach Schritt 4 angehalten. `npm run dev` → <http://localhost:5173> → „Solo gegen Bot“
(oder die GitHub-Pages-Seite). Wenn du früher schon Tasten umgelegt hast: im Menü unter
„Tastenbelegung“ einmal **„Standard wiederherstellen“**, sonst fehlen die neuen Standardtasten.

**Dash-Ladungen (Schritt 3):**
1. Zwei Dashes hintereinander, dann ist leer (HUD „Dash ○○“); jede Ladung kommt nach 3 s
   einzeln zurück. Reicht das für den Flow, oder fühlt es sich zu knapp an?
2. In der Luft geht nur ein Dash, bis du Boden oder eine Wand (Wall-Run) berührst. Stört das
   beim Parkour, z. B. Wandsprung → Dash → Wall-Run?
3. Ein Treffer oder gelungener Parry gibt eine Ladung zurück – merkst du das?
4. Ein verfehlter Dash-Angriff lässt dich ~0,8 s wehrlos (0,45 + 0,35 s). Zu hart, zu weich?

**Haltung, Block, Parry (Schritt 4):**
5. **Q kurz tippen = Parry**, kurz bevor der Schlag einschlägt (Fenster 0,15 s – sehr knapp).
   Schaffst du Parrys gegen „Leicht“ und „Mittel“? Tipp: Die Angriffsanzeige (Menü) zeigt
   das Ausholen; das Fenster öffnet sich *beim Drücken*, also eher spät drücken.
6. **Q halten = Block:** sicher, aber deine Haltung (Leiste unten in der Mitte) füllt sich
   (ein normaler Schlag 25 von 100, Dash-Angriff 35). Beim Blocken gehst du nur noch.
7. **Volle Haltung = 1,5 s betäubt** (gelb, „HALTUNG GEBROCHEN“). Kommt das zu oft/zu selten?
   Die gegnerische Leiste steht oben unter den Namen – füllst du sie mit Parrys (40 pro Parry)?
8. Die Leiste baut sich nach 1 s ohne Druck mit 12 pro Sekunde ab. Zu schnell, zu langsam?
9. Ein geparierter Angreifer ist nur noch 0,6 s betäubt (vorher 1 s) – reicht die Zeit für
   einen Konter?
10. **Das Kernproblem:** Läuft es jetzt weniger auf „beide rennen aufeinander zu, wer zuerst
    dash-angreift, gewinnt“ hinaus? Was machst du, was macht der Bot?

Am hilfreichsten wieder: Zahlen oder konkrete Momente. Die Werte stehen in
`src/shared/combat/combatConfig.ts` (Parry-Fenster, Haltung, Betäubung),
`src/shared/combat/weapons.ts` (`postureDamage` je Angriff) und
`src/shared/movement/movementConfig.ts` / `src/shared/match/gameModes.ts` (Dash-Ladungen).

**Schritt 4 – Haltung, Block, Parry, so funktioniert es** (geteilter Kern):

- Neue Aktion **`guard`** ersetzt `parry` (`combat/guard.ts`): Ein Q-Druck startet sie. Ist das
  Parry-Fenster bereit (`parryCooldown` 0), sind die ersten 0,15 s **Parry**, danach bei
  gehaltenem Q **Block**; Loslassen beendet (ein Tippen bekommt trotzdem das ganze Fenster).
  Das nächste Fenster öffnet frühestens 0,5 s nach dem letzten – Hämmern auf Q blockt nur.
  Wer Q hält, während z. B. ein Schlag endet, geht direkt in den Block (ohne Fenster).
- **Blocken** (`isBlocking`): Gehtempo, kein Schwung-Erhalt, kein Sprint, kein Dash (also auch
  kein Dash-Angriff), kein Schlag. Das Parry-Fenster selbst bremst nicht.
- **Haltung** (`combat/posture.ts`, Felder `posture`, `postureRegenDelay`): Block = Haltung des
  Verteidigers + `postureDamage` des Angriffs (25/35/25), Parry = Haltung des Angreifers + 40
  und 0,6 s Betäubung. Voll (100) = 1,5 s betäubt (`stunTicks`), danach leer. Abbau nach 1 s
  ohne Druck mit 12/s. Füllen entscheidet der Server, Abbau ist vorhersagbar.
- Ein ungeblockter Treffer tötet weiterhin (Duell). Block und Parry wirken nur nach vorn.
- Ereignisse: `block` (neu, mit `broken`), `parry` hat jetzt `broken`. Effekte: dumpfer
  Block-Klang, Funken, „GEBLOCKT“; Haltungsbruch mit Krachen, gelbem Funkenregen und Text.
- HUD: Haltungsleisten (oben Gegner, unten du; rot ab 70 %), „Parry/Block“-Feld zeigt, ob das
  nächste Q ein Parry-Fenster öffnet. Hilfe-Text erklärt Q tippen/halten und die Haltung.
- **Q ist jetzt die einzige Block/Parry-Taste**, die rechte Maustaste ist frei für Schritt 5.
- **Bots:** Persönlichkeitswert `blockChance` (wird von `npm run tune` mit eingestellt). Ein
  geplanter Parry wird erst kurz vor dem Einschlag gedrückt (`parryWhenDue`), ein Block hält Q
  bis zum Ende des Schwungs, und nah am Gegner heben sie manchmal vorab die Deckung
  (`raiseGuard`). Bei mehr als 60 % Haltung blocken sie nicht mehr.
  Dabei gefunden und behoben: `FightHabits.decide` hat die Haltedauer verworfen – Bots hätten
  nie gehalten.
- Tests: `tests/unit/posture.test.ts` (11), angepasst `combat.test.ts`, `botQuality.test.ts`,
  neuer Netzwerk-Test „Haltung bricht ohne Desync“ (`botMatch.test.ts`, Arena, 60 ms Lag),
  Browser-Test „Block und Haltung“ (16 Browser-Tests). `PROTOCOL_VERSION` 9.

**Ehrliche Befunde aus Schritt 3 und 4:**

- **Parry unter Lag ist für Bots schwer:** Ein Testbot, der *jeden* Schlag parieren will,
  schafft ohne Lag ~82 %, mit 30–60 ms Lag nur ~45 % (der alte Parry mit 0,25-s-Fenster:
  50–63 %). Bei 200 ms Lag parieren Bots fast nie – Lag-Kompensation schaut höchstens 0,3 s
  zurück (`COMBAT.maxRewindTicks`), und Interpolation + 200 ms füllen das fast aus. Für
  Menschen ist das 0,15-s-Fenster vermutlich ebenfalls knapp; deshalb Punkt 5 der Checkliste.
- **Haltungsbrüche sind im Duell selten**, weil ein ungeblockter Treffer vorher tötet. In
  Bot-Matches: 20 Matches (Duell + Arena) → 1 Haltungsbruch. Im Arena-Modus (3 Leben) kommen
  sie öfter vor. Ob das im Duell gewollt ist, entscheidet der Playtest.
- **Balance nach Schritt 4** (`npm run tune`, `BALANCE.md`): `SKILL` Duell 0,05/0,09/0,33,
  Arena 0,05/0,11/0,44. Gemessen: Duell Mittel gegen Leicht **71 %**, Schwer gegen Mittel
  **93 %**; Arena 77 % / 91 % – im Ziel. Die „Parry-Quote“ in `BALANCE.md` bleibt bei 0–1 %
  (sie teilt durch alle Schwünge, auch die außer Reichweite; Blocks zählt sie nicht).
- Neue Bot-Persönlichkeit `blockChance` ist Teil des Tunings; die Kampf-Stile (aggressiv,
  Konter, Ausweicher) haben einen Block-Faktor bekommen. Die eigentlichen Stile aus Schritt 7
  (Rusher, Konterer, Flanker, Shuriken-Kiter) gibt es noch nicht.

### Rückmeldung zu Playtest 1 (18.11.) und was daraus wurde

- Standardtasten: **C = Slide/Ducken, V = Gehen (halten)**, Strg ist nicht mehr belegt (Strg+W).
  Weil V bisher „Replay ansehen“ war, ist das Replay jetzt auf **B**. Wer seine Tasten schon
  einmal umgelegt hat, behält die gespeicherte Belegung – „Standard wiederherstellen“ im Menü
  holt die neuen Standardtasten.
- Q = Block/Parry und rechte Maustaste = Shuriken kommen mit Schritt 4 bzw. 5.
- „Falle oft ins Void“ – laut Besitzer eher eigene Schuld (ohne Maus gespielt). Nicht geändert;
  Schritt 6 (Maps) kann mehr Geländer/Deckung bringen, falls es mit Maus auch so bleibt.

**Schritt 3 – Dash-Ladungen, so funktioniert es** (`movement/dash.ts`, geteilter Kern):

- `PlayerState.dashCharges` (max. `MOVE.dashMaxCharges` = 2), `dashRecharge`, `airDashUsed`.
- Jede leere Ladung lädt **einzeln** nach `GameMode.dashRechargeTicks` nach (Duell 3 s, Arena
  3,6 s – „Dash lädt langsamer“ bleibt so der Arena-Unterschied). Dash und Dash-Angriff kosten
  je eine Ladung (ein Dash-Angriff ist ein Dash + Schlag, also eine Ladung).
- Zwischen zwei Dashes liegen mindestens `dashCooldownTicks` (Duell 0,35 s, Arena 0,5 s) –
  der frühere 1-s-Cooldown ist damit ersetzt.
- In der Luft geht nur **ein** Dash, bis Boden oder Wand (Wall-Run) berührt wird; das setzt
  nur das Limit zurück, nicht die Ladungen.
- **Treffer** (Angreifer) und **gelungener Parry** (Verteidiger) geben eine Ladung zurück
  (`refundDashCharge`, entscheidet der Server in `resolveCombat.ts`).
- **Verfehlter Dash-Angriff:** +0,35 s Erholung (`COMBAT.dashAttackMissRecoveryTicks`). Ob er
  „verfehlt“ hat, weiß erst der Server (`attackConnected`); der Client sagt die lange Erholung
  voraus und wird bei einem Treffer korrigiert (normale Korrektur, kein Desync).
- HUD: „Dash ●●“ (●○ = eine Ladung), der Balken zeigt auch das Nachladen.
- Bots dashen nur mit Ladung (`canStartDash`), zufällige Dashes nur bei vollen Ladungen.
- Tests: `tests/unit/dashCharges.test.ts`, `movement.test.ts` (zwei Dashes, dritter erst nach
  dem Nachladen), `hudTexts.test.ts`. Im Desync-Abdeckungstest pariert der Testbot jetzt immer
  (sonst waren es zu wenige Parrys, um den Pfad sicher abzudecken).
- Balance (`npm run tune`): `SKILL` Duell 0,05/0,11/0,35, Arena 0,05/0,11/0,47. Gemessen:
  Duell Mittel gegen Leicht **75 %**, Schwer gegen Mittel **92 %**; Arena 70 % / 93 % – damit
  wieder im Ziel (nach Schritt 2 waren es 63 % / 91 %).
- Gefundener Bot-Fehler (durch die neuen Stärkewerte sichtbar geworden): Stand der Gegner auf
  der Deckungskiste auf dem Turmdach von „Dächer“ (1,2 m hoch, kein Navigationspunkt), blieb
  der Bot 15 s darunter stehen. Jetzt läuft er im Kampf direkt auf einen leicht erhöhten
  Gegner zu und springt hinauf (`isClimbable` in `bots/brain.ts`). Die Änderung kam nach dem
  Tuning; sie betrifft nur diesen Sonderfall.

### ✅ PLAYTEST-CHECKPOINT 1 (erledigt) – was getestet werden sollte

Ich habe hier angehalten. Starte `npm run dev` → <http://localhost:5173> → „Solo gegen Bot“
(oder die GitHub-Pages-Seite, sobald der Workflow durch ist). Bitte probiere, am besten
erst gegen „Leicht“, dann „Mittel“, auf **Neonschlucht** und **Dächer**:

1. **Grundtempo:** Sprinten ist jetzt Standard (8,5 m/s statt 7). Zu schnell, zu langsam,
   gerade richtig? Fühlt sich **C halten = Gehen** (4 m/s) für Abstand/Kreisen sinnvoll an?
2. **Schwung:** Nach einem Dash (endet mit 12 m/s), Wandsprung oder Sprungfeld W gedrückt
   halten – das Übertempo baut sich am Boden über ~0,5–1 s ab. Fühlt sich das flüssig an,
   oder „rutschig“?
3. **Slide (Strg beim Sprinten):** ~0,7 s, mind. 12,5 m/s, Sprung aus dem Slide behält den
   Schwung. Zu lang/kurz? **Ducken** (Strg im Stand/Gehen) – merkst du den Unterschied?
   ⚠ **Strg+W schließt im Browser den Tab** und lässt sich von einer Webseite nicht
   abfangen. Während eines Matches fragt der Browser deshalb vor dem Verlassen nach. Wenn
   dich das stört: unter „Tastenbelegung“ Slide auf eine andere Taste legen (z. B. Shift
   links und Dash auf eine Maustaste). (Vollbild allein hilft nicht; dafür bräuchte es die
   Keyboard-Lock-API des Browsers – nicht eingebaut, ginge aber, wenn du es willst.)
4. **Tasten-Puffer:** Sprung kurz vor der Landung, Schlag kurz vor Ende der Abklingzeit –
   wird beides ausgeführt? Löst es je etwas aus, das du *nicht* wolltest?
5. **Erholung abbrechen:** Nach einem normalen Schlag sofort Dash oder Sprung – kommst du
   flüssig weiter? (Der Dash-Angriff ist absichtlich nicht abbrechbar.)
6. **Dash durch den Gegner:** Normaler Dash geht durch ihn hindurch (hinter ihn kommen,
   Parry geht nur nach vorn). Der Dash-*Angriff* prallt dagegen am Körper ab und trifft.
7. **Vorwärtsdrang:** Ein Schlag aus dem Stand schiebt ~0,7 m nach vorn. Hilft das, oder
   rutschst du an seitlich stehenden Gegnern vorbei?
8. **Luftschlag:** Schlag in der Luft = kurzes Schweben, trifft weiter nach oben/unten.
9. **Zielhilfe** (Menü, standardmäßig an): Trefferkegel 12° je Seite breiter. Merkst du
   sie? Zu stark/schwach? Fühlt es sich mit ausgeschalteter Zielhilfe fair an?
10. **Gefühl aus Schritt 1:** Bloom, Speedlines, Schwertspur, Hitstop, Sofort-Funke, betontes
    Ausholen (Klinge glüht, „Shing“-Ton). Was ist zu viel/zu wenig? Alles einzeln im Menü
    unter „Grafik & Spielgefühl“ abschaltbar. Ruckelt es auf deinem Rechner? (Bloom schaltet
    sich unter 30 Bildern/s selbst ab.)
11. **Tastenbelegung** (Menü): Umbelegen, Neuladen – bleibt es gespeichert?
12. **Das Kernproblem:** Laufen Bots und du immer noch nur stumpf aufeinander zu? (Erwartet:
    ja, noch weitgehend – das sollen Schritte 3, 4 und 7 lösen. Aber sag, ob die Bewegung
    schon mehr Möglichkeiten gibt.)

Am hilfreichsten: konkrete Zahlen („Slide eher 1 s“) oder Momente („nach dem Wandsprung bin
ich immer über die Kante gerutscht“). Alle Werte stehen in `src/shared/movement/movementConfig.ts`
(Bewegung), `src/shared/combat/weapons.ts` (Vorwärtsdrang, Luftschlag) und
`src/shared/combat/combatConfig.ts` (Zielhilfe, Parry-Rückstoß).

**Schritt 2 – so funktioniert es** (alles im geteilten Kern `src/shared`, also auf Server,
Client-Vorhersage, Bots und Replays gleich; `PROTOCOL_VERSION` 8, alte Replays ungültig):

- **Immer sprinten / Gehen:** `MOVE.runSpeed` ist jetzt das Sprinttempo (8,5), `MOVE.walkSpeed`
  (4) gilt, solange `Button.Walk` gehalten wird. Bots gehen im Nahkampf-Footwork (sonst
  rutschten sie während ihres eigenen Ausholens am Gegner vorbei), sprinten sonst.
- **Schwung erhalten** (`keptMomentum` in `movement/locomotion.ts`): Am Boden baut sich Tempo
  über dem Laufziel nur mit `MOVE.overspeedDecay` (9 m/s²) ab, solange man grob (≤ 45°) in
  Bewegungsrichtung drückt. Loslassen oder Umdrehen bremst wie bisher. `dashExitSpeed` 8 → 12.
- **Slide/Ducken** (`movement/slide.ts`, `Button.Crouch`, Felder `crouching`, `slideTicks`,
  `slideCooldown`): Kollision benutzt die aktuelle Körperhöhe (`heightOf`, 1,1 m geduckt);
  unter niedriger Decke bleibt man geduckt. Slide-Spam bringt keinen Dauer-Schub
  (`slideCooldownTicks`). Kamera geht runter, Gegnerfigur wird gestaucht, Slide-Ton/-Funken.
- **Tasten-Puffer** (`sim/inputBuffer.ts`, `INPUT_BUFFER_TICKS` = 0,15 s in `shared/config.ts`).
- **Erholung abbrechen** (`canCancelRecovery` in `combat/actions.ts`): Dash oder Sprung in
  der Erholungsphase eines normalen oder Luftschlags → sofort `idle` (Abklingzeit bleibt).
- **Dash durch den Gegner** (`passesThrough` in `physics/playerCollision.ts`).
- **Vorwärtsdrang** (`movement/lunge.ts`, `lungeSpeed`/`lungeTicks` im Angriffsprofil):
  setzt die Geschwindigkeit in Blickrichtung auf mindestens 5,5 m/s für 8 Ticks – bremst nie.
- **Luftschlag:** neue Angriffsart `air` (`weapons.ts`): Kegel 100°, Höhenreichweite 2,6 m
  (statt 1,8), Ausholen 0,15 s, kleiner Hüpfer `COMBAT.airAttackHop`. Schaden je Modus
  (`GameMode.damage.air`, Duell 1).
- **Zielhilfe:** `Button.AimAssist` in jeder Eingabe (Einstellung „Zielhilfe für Schläge“),
  `COMBAT.aimAssistDegrees` = 12° mehr Kegel je Seite, entschieden in `findContacts`
  (Server, mit Lag-Kompensation). Keine Zielsuche, keine Kamerabewegung.
- **Parry-Rückstoß** jetzt spürbar (5 m/s + Hüpfer `COMBAT.parryLift`).
- **Tastenbelegung** (`client/input/bindings.ts` Standard, `keymap.ts` Laden/Umlegen,
  `ui/keymapUi.ts` Menü): 2 Felder je Aktion, eine Taste macht genau eine Sache, Esc/R/M/H/V
  sind gesperrt. Rechte Maustaste pariert noch, bis Schritt 5 (Shuriken) sie übernimmt.
- Tests: `tests/unit/flowMovement.test.ts` (18 Tests), `tests/unit/keymap.test.ts`, angepasst
  `playerCollision`, `lagCompensation`, `combat`, Browser-Test „Tastenbelegung“ (15 Browser-Tests).
- Bot-Tests unter Lag: `npm run bots:sim -- --lag 150 --jitter 50` und `--lag 250 --jitter 80`
  ohne Desync nach jedem Teilschritt.

**Ehrliche Befunde aus Schritt 2:**

- **Bots parieren beim neuen Tempo praktisch nicht mehr** (20 Bot-Matches: 0 Parrys; vorher
  ~10). Sie kommen schneller in Reichweite, als ihre Reaktionszeit erlaubt. Damit die
  Desync-Prüfung Parrys weiter abdeckt, spielt im Abdeckungstest (`tests/sim/botMatch.test.ts`)
  ein parierfreudiger Bot mit. Wird mit Schritt 4 (Block/Parry neu) und 7 (Bot-Stile) angegangen.
- Zwei Bot-Tests musste ich an das Tempo anpassen (mehr Matches statt niedrigerer Schwelle;
  ein Countdown-Test prüft jetzt 1,5 statt 2 s, weil der Bot danach legitim einen Parkour-Sprung
  erreicht). Der Korrektur-Anteil-Test erlaubt 15 % statt 10 % – gemessen waren schon vorher
  6–13 % je nach Seed; Seed 2 lag nur zufällig darunter.
- Der Vorwärtsdrang geht in Blickrichtung, nicht zum Gegner (das müsste der Client sonst aus
  der Gegnerposition vorhersagen → ständige Korrekturen). Folge: An einem seitlich stehenden
  Gegner kann man vorbeirutschen. Die Zielhilfe gleicht das nur teilweise aus.
- Der Sofort-Funke wird jetzt in jedem 60-Hz-Tick geprüft statt einmal pro Bild – bei
  wenigen Bildern/s (schwacher Rechner, Test-Chromium) übersprang ein Bild sonst die ganze
  Trefferphase (0,1 s).
- Beobachtung im Browser-Test: Ein Testskript, das während des Ausholens nicht nachzielt,
  verfehlt den (jetzt gehend kreisenden) Bot aus 1–1,5 m regelmäßig. Für Menschen mit Maus
  vermutlich kein Problem – aber bitte beim Playtest darauf achten, ob Treffen zu schwer ist.
- **Balance nach Schritt 2** (`npm run tune`, `BALANCE.md`): `SKILL` Duell 0,05/0,08/0,25
  (vorher 0,05/0,09/0,55), Arena 0,05/0,09/0,45. Duell gemessen: Mittel gegen Leicht **63 %**
  (Ziel 70; die Suche fand 70 % mit 128 Matches, die Endmessung mit 160 liegt darunter),
  Schwer gegen Mittel **91 %**. Arena: 57 % / 91 %. Leicht und Mittel unterscheiden sich
  also weniger als gewünscht, und Parrys kommen in Bot-Matches praktisch nicht vor (0 %).
  Ursache vermutlich dieselbe wie oben: Beim Sprinttempo entscheidet fast nur, wer zuerst
  trifft. Nicht weiter nachgestellt – Schritte 3, 4 und 7 ändern genau das.
- `client/app/gameApp.ts` ist auf ~290 Zeilen gewachsen (Richtwert 150) – Einstellungs-
  Verdrahtung sollte in eine eigene Datei.

**Schritt 1 – so funktioniert es** (alles nur Darstellung, die Simulation weiß nichts davon;
jedes Effekt im Menü unter „Grafik & Spielgefühl“ abschaltbar, `FxSettings` in
`client/app/settings.ts`):

- **Bloom** (`client/render/postFx.ts`): Three.js-`EffectComposer` + `UnrealBloomPass`. Helle
  Dinge (Klingen, Neonkanten, Funken) leuchten. **Bildraten-Wächter**
  (`client/app/frameRateGuard.ts`): Läuft das Spiel mit Bloom länger als 2 s unter
  30 Bildern/s, schaltet sich Bloom für diese Sitzung ab (Hinweis im Bild, gespeicherte
  Einstellung bleibt). Grund: Im Test-Chromium ohne Grafikkarte fiel die Bildrate mit Bloom
  von 13 auf 4 Bilder/s, mehrere Browser-Tests liefen dadurch in Zeitüberschreitungen.
  Browser-Tests starten deshalb mit Bloom aus (`tests/browser/harness.ts`); der Test
  „Spielgefühl“ schaltet ihn ein und prüft die Abschaltung.
- **Speedlines** (`render/speedLines.ts`): Streifen am Bildrand ab etwas über Lauftempo,
  voll beim Dash.
- **Schwertspur** (`render/swordTrail.ts`): Lichtband zwischen Klingenbasis und -spitze der
  letzten Bilder, kurz vor bis kurz nach der Treffer-Phase. Der alte Reichweiten-Bogen
  (`slashArc.ts`) bleibt, ist aber schwächer (er war mit Bloom grell) und erscheint nur,
  während die Runde läuft (vorher stand er nach einem Kill eingefroren im Bild).
- **Hitstop** (`app/hitstop.ts`): Das *Bild* stockt 55–110 ms (Kontakt, Treffer, Parry,
  Clash). Simulation, Netzwerk und Maus laufen weiter – sonst käme der Client aus dem Takt.
  Zweimal Stocken innerhalb 220 ms wird übersprungen.
- **Sofortiger Treffer-Funke** (`app/contactWatcher.ts`): Erreicht der eigene Schlag den
  Gegner *so wie er angezeigt wird* (genau das prüft auch die Lag-Kompensation des
  Servers), gibt es sofort Funke, „Tick“-Ton und Mini-Hitstop. Tod/Kill-Effekte kommen
  weiterhin erst mit dem `hit`-Event des Servers (ein Parry kann den Funken also noch
  „überstimmen“).
- **Ausholen betonen** (`render/bladeGlow.ts`, `fighterPose.ts`): Klinge leuchtet während
  des Ausholens immer heller auf, die Figur holt weiter aus (lehnt sich zurück, freie Hand
  zeigt auf das Ziel), Ton „draw“ (Klinge wird gezogen). Unabhängig von der roten
  Angriffsanzeige (Ring + Piepton), die es weiterhin gibt.
- Tests: `tests/unit/feel.test.ts`, Browser-Test „Spielgefühl“ (14 Browser-Tests grün).
- Beobachtung beim Testen: Mit W halten + Schlag-Spam habe ich (Testskript) „Mittel“ 3:1
  geschlagen – genau das „stumpfe Zulaufen“, das die Schritte 2–7 beheben sollen.

---

## 1. So prüfst du, ob alles funktioniert

**Letzter Stand (18.11., nach Schritt 4 Flow):** `npm run check` grün (476 Tests), alle 16 Browser-Tests grün (mit Moduswahl,
Angriffsanzeige und Arena), GitHub-Pages-Workflow grün.

| Befehl | Dauer | Muss enden mit |
|---|---|---|
| `npm install` | einmalig | – |
| `npm run check` | ~40 s | `RESULT: OK - no desyncs, no errors.` und `Tests … passed` (zuletzt 418) |
| `npm run test:browser` | ~2,5 min | `RESULT: OK - all browser tests passed.` (16 Tests). Einmalig vorher: `npx playwright install chromium` |
| `npm run bots` | ~20 s | `RESULT: OK - no desyncs, no errors.` |
| `npm run tune -- --quick` | ~3 min | schreibt `BALANCE.md` neu (Gewinnquoten der Bot-Stufen je Modus) |
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
| 4 | Bot-KI je Modus, `npm run tune` je Modus | ✅ – siehe `BALANCE.md` |
| 5 | Replays und Killcam an die Modi anpassen | ✅ – weiterhin nur im Solo-Modus (Online-Replays: Abschnitt 5.1) |

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
**Bot-KI je Modus** (Schritt 4): `src/bots/modeTactics.ts` – im Duell neutral (Duell-Bots
verhalten sich exakt wie vorher: `npm run tune -- --quick` ergab vor und nach dem Umbau auf
allen 640 Matches dieselben Zahlen). In der Arena: Parry ×1,3 (Konter lohnt), Ausweichen ×0,6
(Dash lädt langsam), Dash-Angriff ×0,5 außer zum Bestrafen, kein Schlag in die
Unverwundbarkeit des Gegners, eigene Unverwundbarkeit zum Angreifen nutzen (dann auch nicht
parieren), eigenes Konter-Fenster wie einen freien Treffer nutzen. `SKILL` gibt es je Modus
(`src/solo/difficulty.ts`, `difficultyPersonality(level, modeId)`); `npm run tune` stellt
jeden Modus ein (Duell unverändert 0,05/0,09/0,55, Arena 0,05/0,11/0,50: Mittel 70 % gegen
Leicht, Schwer 93 % gegen Mittel). Die Parry-Quote der Bots ist in der Arena höher (7 % statt
1 % aller gegnerischen Schwünge). Tests: `tests/sim/botQuality.test.ts` („fight tactics per
game mode“), `tests/sim/difficulty.test.ts` (je Modus).

**Replays je Modus** (Schritt 5): Die Datei speichert `modeId` (Format-Version 2, ältere
Dateien werden abgelehnt), der `ReplaySimulator` rechnet mit den Regeln dieses Modus nach.
Die Ansicht zeigt den Modus im Titel, in der Arena die Herzen beider Spieler
(`#replay-lives`) und die Angriffsanzeige nach der Einstellung. Dateiname
`neonklinge-<modus>-<map>-<zeit>.json`. Killcam weiterhin nur beim tödlichen Treffer.
Tests: `tests/sim/replay.test.ts` (Hash-Vergleich auf jeder Map in jedem Modus, falscher
Modus wird erkannt, Datei ohne Modus wird abgelehnt), Browser-Test „Arena gegen Bot“ (Replay).

**Bekannte Grenzen:** Ein Konter mit dem Dash-Angriff macht 2+1 = 3 Schaden und tötet damit
sofort aus vollen Leben – gewollt als große Belohnung, aber nicht von Menschen erprobt. Die
Map „Arena“ und der Modus „Arena“ heißen gleich (HUD zeigt „Arena · Arena“).

---

## 3. Offen (priorisiert)

1. ~~Replays und Killcam~~ – fertig (nur Solo). Ausbau: Replays für Online-Matches (Abschnitt 5.1)
2. **Bot-KI weiter ausbauen** (Grundstufe F ist fertig) – Ideen in Abschnitt 5.2
3. **Die neuen Mechaniken von einem Menschen spielen lassen** und Werte nachstellen
   (Rezept 1 in `HOW_TO_EXTEND.md`) – niemand hat Doppelsprung, Clash, Sprungfelder, die
   neuen Maps, den Modus **Arena** und die **Angriffsanzeige** bisher *gespielt*, nur getestet.
   Arena-Werte stehen in `ARENA_MODE` (`src/shared/match/gameModes.ts`); nach einer Änderung
   `npm run tune` (Bots je Modus neu einstellen).
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

Können-Werte (`SKILL`): leicht 0,05 · mittel 0,09 · schwer 0,55. **Veraltet** – aktueller Stand
nach Schritt 2 der Flow-Aufgabe in Abschnitt 0 und in `BALANCE.md`.

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

- ~~Parry-Rückstoß schwach~~ – behoben (Schritt 2): kleiner Hüpfer `COMBAT.parryLift`, Rückstoß 5 m/s.
- Dateien über dem Richtwert von 150 Zeilen: `netcode/gameClient.ts`, `bots/brain.ts`,
  `bots/nav.ts`, `server/game/room.ts`, `client/app/gameApp.ts`, `client/app/effects.ts`.
- Ein echter Tunnel, Hosting und `docker build` wurden nie getestet (`INTERNET.md` sagt das).
- Mehrspieler-Clients mit altem Stand vertragen sich nicht mit einem neuen Server
  (`PROTOCOL_VERSION` ist jetzt 8; es gibt keine Versionsprüfung beim Verbinden).

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
- `brain.ts` und `gameClient.ts` in kleinere Dateien teilen.

---

### 5.4 Später (vom Besitzer vorgemerkt, nicht anfangen ohne Auftrag)

- Greifhaken (nur falls er für den Flow nicht doch nötig wird)
- Spezialangriff mit Indikator (nicht parierbar, nur ausweichbar)
- Schwere Angriffe
- Third-Person-Ansicht
- Gamepad-Steuerung
- Mehrspieler-Hosting
- Lebensleisten-Modus

Ausdrücklich **nicht**: Zeitrennen.

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
