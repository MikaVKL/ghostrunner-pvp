# LEARNING.md – Die wichtigsten Konzepte, einfach erklärt

Du musst diese Datei nicht auswendig können. Aber wenn du die sechs Ideen hier verstanden
hast, verstehst du, **warum** der Code so gebaut ist – und kannst einer KI viel bessere
Anweisungen geben.

Zu jedem Abschnitt gibt es ein **Experiment zum Selbst-Ausprobieren**. Mach sie, das bringt
mehr als Lesen.

---

## 1. Das Grundproblem: Das Internet ist langsam

Wenn du eine Taste drückst, braucht diese Information Zeit bis zum Server (z. B. 30 ms) und
die Antwort braucht wieder Zeit zurück. Diese Hin-und-zurück-Zeit heißt **Ping** oder
**RTT** (Round Trip Time).

Die naive Lösung – „Taste drücken, Server fragen, auf Antwort warten, erst dann bewegen“ –
fühlt sich an wie Laufen durch Honig. Bei 100 ms Ping reagiert deine Figur immer eine
Zehntelsekunde zu spät.

Die zweite naive Lösung – „jeder Client berechnet seinen Spieler selbst und teilt allen die
Position mit“ – fühlt sich super an, aber dann kann jeder schummeln: Ein manipulierter Client
sagt einfach „ich bin jetzt hinter dir und du bist tot“.

Dieses Template löst beides gleichzeitig. Dafür braucht es die folgenden Ideen.

---

## 2. Autoritativer Server: Einer ist der Schiedsrichter

**Idee:** Nur der Server entscheidet, was wirklich passiert. Clients dürfen ihm nur sagen,
**welche Tasten sie drücken** – nicht, wo sie stehen oder wen sie getroffen haben.

Vergleich: Beim Fußball entscheidet der Schiedsrichter, ob es ein Tor war. Die Spieler können
rufen, was sie wollen.

Im Code: Der Client schickt `InputCmd` (`src/shared/input.ts`) – Bewegungstasten,
Blickrichtung, Buttons. Der Server prüft jede Nachricht (`sanitizeInput`) und simuliert dann
selbst (`stepWorld`). Selbst ein komplett umgeschriebener Client kann nicht schneller laufen
als erlaubt.

> **Experiment:** Öffne `tests/unit/server.test.ts` und lies den Test
> „speed hack: sending many inputs per tick does not make a player faster“. Er schickt dem
> Server dreimal so viele Inputs wie erlaubt – und der Spieler ist trotzdem nicht schneller.

---

## 3. Tick-Rate: Das Spiel läuft in festen Schritten

**Idee:** Die Simulation läuft nicht „flüssig“, sondern in kleinen, immer gleich langen
Schritten – **Ticks**. Hier sind es 60 Ticks pro Sekunde, jeder Tick ist also 16,67 ms lang.
In jedem Tick passiert genau einmal: Inputs lesen → Spieler bewegen → Kämpfe auswerten.

Vergleich: ein Daumenkino. Jede Seite ist ein Tick.

**Warum feste Schritte?** Weil dann die Rechnung überall identisch ist. Würde ein schneller
PC in 144 kleinen Schritten pro Sekunde rechnen und ein langsamer in 30 großen, kämen leicht
unterschiedliche Ergebnisse heraus (ein Sprung wäre mal höher, mal niedriger). Mit festen
Ticks gilt: **gleicher Startzustand + gleiche Inputs = exakt gleiches Ergebnis.** Das nennt
man **deterministisch** – und darauf baut alles Weitere auf.

Deshalb zählt der Code Zeit in Ticks statt Sekunden (`dashTicks`, `parryWindowTicks` …) und
deshalb ist `Math.random()` in der Spiellogik verboten (Server und Client würden
unterschiedlich würfeln).

**Tick-Rate ≠ Bildrate.** Dein Bildschirm zeichnet vielleicht 60 oder 120 Bilder pro Sekunde,
die Logik läuft trotzdem mit 60 Ticks. Zwischen zwei Ticks zeichnet der Client eine Mischung
aus alter und neuer Position, damit es flüssig aussieht (`src/client/app/gameLoop.ts`).

**Und Snapshots?** Der Server schickt nicht nach jedem Tick den Spielstand, sondern nur jeden
zweiten (30-mal pro Sekunde). Das spart Datenverkehr und reicht völlig.

> **Experiment:** Ändere in `src/shared/config.ts` kurz `SNAPSHOT_EVERY_TICKS` von `2` auf
> `12` (nur noch 5 Snapshots pro Sekunde) und spiel in zwei Fenstern. Dein eigener Spieler
> bleibt flüssig (Prediction!), der Gegner bewegt sich träger und verzögerter. Danach
> zurückstellen.

---

## 4. Client-Side-Prediction: Nicht warten, sondern raten

**Idee:** Der Client wartet nicht auf die Antwort des Servers. Er wendet deinen Input
**sofort** auf deinen eigenen Spieler an – mit genau demselben Code, den auch der Server
benutzt. Er „sagt vorher“, was der Server gleich berechnen wird.

Weil die Simulation deterministisch ist (Abschnitt 3), stimmt diese Vorhersage fast immer
exakt. Du spürst deinen Ping bei der eigenen Bewegung dadurch gar nicht.

Im Code: `Predictor.predict()` in `src/netcode/predictor.ts` ruft `stepPlayer()` auf –
dieselbe Funktion, die der Server in `stepWorld()` aufruft. Das ist der Grund, warum die
Spiellogik in `src/shared/` liegt: **ein** Code für beide Seiten.

> **Experiment:** Starte das Spiel mit `http://localhost:5173/?lag=150`. Die Bewegung fühlt
> sich trotz 300 ms Ping direkt an. Jetzt `http://localhost:5173/?lag=150&predict=0`:
> gleicher Lag, aber Prediction aus – jede Bewegung kommt spürbar verspätet. Genau diesen
> Unterschied macht Prediction.

---

## 5. Reconciliation / Rollback: Wenn die Vorhersage falsch war

Manchmal stimmt die Vorhersage nicht. Beispiel: Der Gegner trifft dich und du wirst
weggeschleudert. Dein Client konnte das nicht wissen – er kennt die Tasten des Gegners nicht.

**Idee:** Jeder Input bekommt eine fortlaufende Nummer (`seq`). Der Client merkt sich alle
Inputs, die der Server noch nicht bestätigt hat. Jeder Snapshot vom Server sagt: „Das ist dein
echter Zustand, **nachdem** ich deinen Input Nr. `ack` verarbeitet habe.“

Dann macht der Client drei Dinge (`Predictor.reconcile()`):

1. **Zurückspulen (Rollback):** eigenen Zustand wegwerfen, den des Servers übernehmen.
2. **Aufräumen:** alle Inputs bis einschließlich `ack` aus der Merkliste löschen.
3. **Nochmal abspielen (Replay):** alle noch unbestätigten Inputs erneut anwenden.

```
Zeit ──────────────────────────────────────────────────────────►
Client hat vorhergesagt:   Input 10 → 11 → 12 → 13 → 14          (steht bei "nach 14")
Server-Snapshot kommt an:  "Zustand nach Input 11"  (du wurdest getroffen!)

Client:  1. übernimmt den Server-Zustand (nach 11, inkl. Treffer)
         2. vergisst Input 10 und 11
         3. spielt 12 → 13 → 14 neu darauf ab
Ergebnis: wieder "nach 14", aber diesmal mit dem Treffer eingerechnet.
```

War die Vorhersage richtig, ändert Schritt 1–3 nichts (man landet am selben Punkt). War sie
falsch, springt die Position etwas – das heißt **Correction**. Damit das nicht ruckelt,
gleitet die Kamera weich zur korrigierten Position (`correctionOffset` in `gameClient.ts`).

**Correction vs. Desync** – der wichtigste Unterschied für dich:

- **Correction** = Vorhersage war falsch, weil etwas passiert ist, das der Client nicht
  wissen konnte (Treffer, Respawn, Lag). Völlig normal.
- **Desync** = Vorhersage war falsch, **obwohl nichts Besonderes passiert ist**. Das bedeutet,
  Client und Server rechnen unterschiedlich – ein Programmierfehler. Der Server schickt in
  jedem Snapshot ein Flag `clean` mit („bei dir war nichts Ungewöhnliches“). Weicht die
  Vorhersage bei `clean: true` ab, zählt der Client einen Desync.

Die Bots prüfen genau das in tausenden Ticks. **Solange `desyncs: 0` im Report steht, ist die
Netcode-Grundlage intakt.**

> **Experiment:** Drücke im Spiel `F3`. Lauf herum: `corrections` bleibt fast stehen. Lass
> dich vom zweiten Fenster treffen: `corrections` steigt, `desyncs` bleibt 0.
>
> **Experiment für Mutige:** Baue absichtlich einen Desync. Füge in
> `src/shared/movement/locomotion.ts` am Ende von `stepLocomotion` ein:
> `p.vel.x += Math.random() * 0.01;` Dann `npm run bots:sim`. Der Report zeigt sofort
> `DESYNCS` und nennt das Feld `vel.x`. Mach die Zeile danach wieder weg
> (`git checkout src/shared/movement/locomotion.ts`).

---

## 6. Interpolation: Der Gegner lebt leicht in der Vergangenheit

Für den **Gegner** kann dein Client nichts vorhersagen – er kennt dessen Tasten nicht. Er
bekommt nur 30-mal pro Sekunde eine Position, und die kommen nicht perfekt gleichmäßig an.
Würde man immer die neueste Position anzeigen, würde der Gegner ruckeln.

**Idee:** Zeige den Gegner absichtlich **100 ms in der Vergangenheit** und blende weich
zwischen den zwei Snapshots davor und danach. So gibt es immer zwei bekannte Punkte, zwischen
denen man mischen kann.

Im Code: `SnapshotBuffer` und `RenderClock` in `src/netcode/interpolation.ts`.

Der Preis: Du siehst den Gegner dort, wo er vor ~100 ms + halbem Ping war. Bei schnellen
Kämpfen kann sich ein Treffer deshalb „unfair“ anfühlen. Profi-Spiele gleichen das mit
**Lag-Kompensation** aus (der Server spult den Gegner für die Trefferprüfung kurz zurück).
Das ist hier **nicht** eingebaut – siehe `HOW_TO_EXTEND.md`.

---

## 7. Die Input-Queue: Was der Server bei Lag macht

Der Server verarbeitet pro Spieler **genau einen Input pro Tick** (`InputQueue`).

- Kommt mal kein Input rechtzeitig an (Lag), wiederholt er den letzten – du läufst also
  weiter, statt in der Luft stehen zu bleiben. Nach einer halben Sekunde ohne Input bleibt
  die Figur stehen.
- Kommen nach einem Hänger viele auf einmal, wirft er die ältesten weg, damit du nicht
  dauerhaft hinterherhinkst.

Beides macht die Vorhersage kurz falsch → eine Correction (und der Server markiert den
Snapshot als nicht `clean`).

---

## Spickzettel

| Begriff | In einem Satz | Wo im Code |
|---|---|---|
| Autoritativer Server | Nur der Server entscheidet, Clients senden nur Tasten | `server/game/room.ts`, `shared/input.ts` |
| Tick | Ein fester Simulationsschritt (1/60 s) | `shared/config.ts` |
| Deterministisch | Gleiche Inputs → exakt gleiches Ergebnis | alles in `shared/` |
| Snapshot | Der komplette Spielstand, 30× pro Sekunde vom Server | `shared/protocol/messages.ts` |
| Prediction | Client rechnet eigenen Spieler sofort voraus | `netcode/predictor.ts` → `predict()` |
| Reconciliation / Rollback | Server-Stand übernehmen, offene Inputs neu abspielen | `netcode/predictor.ts` → `reconcile()` |
| Correction | Erwartete Abweichung (Treffer, Lag) | `netStats.ts` |
| Desync | Unerwartete Abweichung = Bug | `netStats.ts`, Bot-Report |
| Interpolation | Gegner 100 ms verzögert und geglättet anzeigen | `netcode/interpolation.ts` |
| Ping / RTT | Zeit für Hin- und Rückweg einer Nachricht | F3-Anzeige |

## Wenn du tiefer einsteigen willst

Gute Suchbegriffe: „Gabriel Gambetta Fast-Paced Multiplayer“ (die klassische Artikelserie
genau zu diesem Thema), „Glenn Fiedler Fix Your Timestep“, „Overwatch Gameplay Architecture
and Netcode“ (GDC-Vortrag), „Valve Source Multiplayer Networking“.
