# STATUS.md – Stand des Umbaus zum Ghostrunner-PvP

Diese Datei wird nach jedem Arbeitsschritt aktualisiert. Wer hier weiterarbeitet (Mensch oder
KI): zuerst `CLAUDE.md` lesen, dann diese Liste von oben nach unten abarbeiten.

Legende: ✅ fertig und getestet · 🔧 in Arbeit · ⬜ offen

| # | Schritt | Stand |
|---|---|---|
| 1 | Kampfregeln: One-Hit-Kill, Parry-Fenster/-Cooldown/-Stun, Dash-Angriff, Cooldowns (alles Daten in `combat/weapons.ts` + `combat/combatConfig.ts`) | ✅ |
| 2 | Rundensystem: Best-of-5, Countdown, Punktestand, Rematch | ⬜ |
| 3 | 3 Parkour-Maps + Map-Auswahl | ⬜ |
| 4 | Lag-Kompensation für Treffer | ⬜ |
| 5 | Kollision zwischen Spielern | ⬜ |
| 6 | Reconnect nach Verbindungsabbruch | ⬜ |
| 7 | Optik (Figuren, Schwung-Animation, Partikel, Kamera, Sky, Nebel) | ⬜ |
| 8 | Sound (Web Audio, prozedural) | ⬜ |
| 9 | Deutsche Oberfläche, HUD, Hauptmenü, Steuerungshilfe | ⬜ |
| 10 | Bots nutzen Wall-Run, Parry, Dash-Angriff | ⬜ |
| 11 | Tests erweitert + Playwright-Browser-Tests als eigenes Skript | ⬜ |
| 12 | Anleitung „Spielen übers Internet“ + Tunnel-Test | ⬜ |

## Entscheidungen (bei Unklarheit die einfachere Variante)

- **One-Hit-Kill über Daten:** Alle Angriffe haben `damage: 100` (= `MAX_HP`). HP bleiben im
  Code erhalten, damit spätere Waffen mit weniger Schaden möglich sind.
- **Dash-Angriff ohne neue Taste:** Angriff während eines Dashes (oder bis 0,1 s danach, oder
  im selben Tick wie der Dash) benutzt das Angriffsprofil `dash` der Waffe.
- **Erfolgreicher Parry:** Angreifer 1 s gestunt + zurückgestoßen, Verteidiger sofort wieder
  handlungsfähig (Konter). Ein Parry ins Leere hat 0,3 s Erholung + 0,5 s Cooldown.

## Nächste Schritte

Siehe Tabelle oben – der erste Eintrag mit ⬜ ist als Nächstes dran.
