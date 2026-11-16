# STATUS.md – Stand des Umbaus zum Ghostrunner-PvP

Diese Datei wird nach jedem Arbeitsschritt aktualisiert. Wer hier weiterarbeitet (Mensch oder
KI): zuerst `CLAUDE.md` lesen, dann diese Liste von oben nach unten abarbeiten.

Legende: ✅ fertig und getestet · 🔧 in Arbeit · ⬜ offen

| # | Schritt | Stand |
|---|---|---|
| 1 | Kampfregeln: One-Hit-Kill, Parry-Fenster/-Cooldown/-Stun, Dash-Angriff, Cooldowns (alles Daten in `combat/weapons.ts` + `combat/combatConfig.ts`) | ✅ |
| 2 | Rundensystem: Best-of-5, Countdown, Punktestand, Rematch (Regeln + Netzwerk; Anzeige kommt mit Schritt 9) | ✅ |
| 3 | 3 Parkour-Maps (`schlucht`, `daecher`, `reaktor`) + Map-Wahl beim Raum-Erstellen, Quick-Match rotiert; Parkour-Links für Bots | ✅ |
| 4 | Lag-Kompensation: Treffer gegen die Position, die der Angreifer sah; Parry zählt, wenn er gedrückt wurde, bevor der Verteidiger den Treffer sah (max. 0,3 s) | ✅ |
| 5 | Kollision zwischen Spielern (`physics/playerCollision.ts`, Teil 2 von `stepWorld`) | ✅ |
| 6 | Reconnect nach Verbindungsabbruch | ⬜ |
| 7 | Optik (Figuren, Schwung-Animation, Partikel, Kamera, Sky, Nebel) | ⬜ |
| 8 | Sound (Web Audio, prozedural) | ⬜ |
| 9 | Deutsche Oberfläche, HUD, Hauptmenü, Steuerungshilfe | ⬜ |
| 10 | Bots nutzen Wall-Run, Wandsprung, Parry, Dash-Angriff (Zähler im Bot-Report, Test in `tests/sim`) | ✅ |
| 11 | Tests erweitert + Playwright-Browser-Tests als eigenes Skript | ⬜ |
| 12 | Anleitung „Spielen übers Internet“ + Tunnel-Test | ⬜ |

## Entscheidungen (bei Unklarheit die einfachere Variante)

- **One-Hit-Kill über Daten:** Alle Angriffe haben `damage: 100` (= `MAX_HP`). HP bleiben im
  Code erhalten, damit spätere Waffen mit weniger Schaden möglich sind.
- **Dash-Angriff ohne neue Taste:** Angriff während eines Dashes (oder bis 0,1 s danach, oder
  im selben Tick wie der Dash) benutzt das Angriffsprofil `dash` der Waffe.
- **Erfolgreicher Parry:** Angreifer 1 s gestunt + zurückgestoßen, Verteidiger sofort wieder
  handlungsfähig (Konter). Ein Parry ins Leere hat 0,3 s Erholung + 0,5 s Cooldown.

- **Best-of-5:** Wer zuerst 3 Runden gewinnt. Unentschiedene Runden (Doppel-K.O., Zeit
  abgelaufen) geben keinen Punkt; nach spätestens 9 Runden endet das Match.
- **Rematch per Abstimmung:** Nach dem Match startet ein neues erst, wenn beide Spieler
  „Rematch“ gesendet haben (`matchEndTicks: 0`). Die Test-Config startet weiterhin automatisch.

- **Maps:** Die alte `arena` bleibt als Übungs-/Test-Map. Jede Map hat einen sicheren Fußweg
  (Brücke/Steg) UND Wall-Run-Abkürzungen. `links` in der Map sagen den Bots, wo sie
  springen bzw. an der Wand laufen können; `tests/unit/maps.test.ts` spielt jeden Link durch.

- **Lag-Kompensation:** Jeder Input trägt `viewTick` (welchen Server-Tick der Client gerade
  anzeigt). Treffer werden gegen die gespeicherte Position zu diesem Tick geprüft (Abschnitt 13).
  Zusätzlich (weil Parry die Kernmechanik ist): Ein Treffer wird erst entschieden, wenn der
  Verteidiger ihn *gesehen* hat – bis dahin kann er noch parieren. Kills kommen dadurch
  ~0,1 s + Ping später, dafür ist Parry bei jedem Ping gleich schwer. Grenze: 0,3 s.
- **Gefundener Template-Bug:** `wrapAngle` war bei ±π nicht idempotent → seltener Desync. Behoben.

## Nächste Schritte

Siehe Tabelle oben – der erste Eintrag mit ⬜ ist als Nächstes dran.
