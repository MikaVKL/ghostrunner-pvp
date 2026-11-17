# BALANCE.md – Wie stark sind die Schwierigkeitsstufen?

Diese Datei wird von `npm run tune` erzeugt (Bots spielen gegeneinander, ganze
Best-of-5-Matches über das simulierte Netz mit 80 ms Ping). **Nicht von Hand ändern** –
nach Änderungen an der Bot-KI oder den Kampfregeln `npm run tune` neu ausführen.

Stand: gesucht und gemessen. Ziel: Mittel gewinnt ~70 % gegen Leicht, Schwer ~90 % gegen Mittel.

## Gewinnquote der stärkeren Stufe

| Paarung | gesamt | Neonschlucht | Dächer | Reaktor | Arena | Parry-Quote | Matches |
|---|---|---|---|---|---|---|---|
| Leicht gegen Leicht (Kontrolle, soll ~50 % sein) | **43 %** | 48 % | 43 % | 50 % | 30 % | 0 % | 160 |
| Mittel gegen Leicht (Ziel 70 %) | **76 %** | 85 % | 90 % | 43 % | 85 % | 0 % | 160 |
| Schwer gegen Mittel (Ziel 90 %) | **88 %** | 100 % | 95 % | 56 % | 100 % | 3 % | 160 |
| Schwer gegen Leicht | **88 %** | 100 % | 100 % | 51 % | 100 % | 2 % | 160 |

- **Gewinnquote:** Siege der zuerst genannten Stufe; ein Unentschieden zählt als halber Sieg.
- **Parry-Quote:** erfolgreiche Parrys der zuerst genannten Stufe, geteilt durch alle
  Schwünge des Gegners (auch die, die ohnehin danebengingen – die Zahl wirkt deshalb klein).
- Die Seiten werden nach jedem Durchgang durch alle Maps getauscht.
- Bei 160 Matches schwankt eine Quote zufällig um etwa ±4 Prozentpunkte, pro Map (40
  Matches) um etwa ±8.

## Können-Werte (`SKILL` in `src/solo/difficulty.ts`)

| Stufe | Können (0 = schwächster, 1 = stärkster Bot) |
|---|---|
| leicht | 0.05 |
| mittel | 0.17 |
| schwer | 0.99 |

Aus dem Können werden alle Bot-Parameter berechnet (`personalityForSkill`): Drehtempo,
Angriffs-, Dash-Angriffs- und Parry-Wahrscheinlichkeit, Lust auf Parkour.

## Grenzen dieser Messung

- Bots spielen gegen Bots. Wie sich die Stufen für einen Menschen anfühlen, misst das nicht.
- Gemessen wird mit kurzen Pausen zwischen den Runden, sonst mit den echten Regeln.
