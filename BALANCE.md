# BALANCE.md – Wie stark sind die Schwierigkeitsstufen?

Diese Datei wird von `npm run tune` erzeugt (Bots spielen gegeneinander, ganze Matches
mit den Rundenregeln des jeweiligen Modus über das simulierte Netz mit 80 ms Ping).
**Nicht von Hand ändern** – nach Änderungen an der Bot-KI, den Kampfregeln oder einem
Modus `npm run tune` neu ausführen.

Stand: gesucht und gemessen. Ziel in jedem Modus: Mittel gewinnt ~70 % gegen Leicht, Schwer ~90 % gegen Mittel.

## Modus Duell

Regeln: 1 Leben, erster mit 3 Rundensiegen gewinnt.

| Paarung | gesamt | Neonschlucht | Dächer | Reaktor | Arena | Parry-Quote | Matches |
|---|---|---|---|---|---|---|---|
| Leicht gegen Leicht (Kontrolle, soll ~50 % sein) | **55 %** | 50 % | 63 % | 59 % | 50 % | 1 % | 160 |
| Mittel gegen Leicht (Ziel 70 %) | **71 %** | 73 % | 73 % | 73 % | 65 % | 0 % | 160 |
| Schwer gegen Mittel (Ziel 90 %) | **93 %** | 88 % | 93 % | 93 % | 98 % | 2 % | 160 |
| Schwer gegen Leicht | **93 %** | 98 % | 90 % | 93 % | 93 % | 2 % | 160 |

## Modus Arena

Regeln: 3 Leben, erster mit 2 Rundensiegen gewinnt.

| Paarung | gesamt | Neonschlucht | Dächer | Reaktor | Arena | Parry-Quote | Matches |
|---|---|---|---|---|---|---|---|
| Leicht gegen Leicht (Kontrolle, soll ~50 % sein) | **50 %** | 50 % | 45 % | 46 % | 60 % | 0 % | 160 |
| Mittel gegen Leicht (Ziel 70 %) | **77 %** | 78 % | 73 % | 86 % | 70 % | 0 % | 160 |
| Schwer gegen Mittel (Ziel 90 %) | **91 %** | 83 % | 95 % | 98 % | 88 % | 7 % | 160 |
| Schwer gegen Leicht | **95 %** | 98 % | 95 % | 98 % | 90 % | 7 % | 160 |

- **Gewinnquote:** Siege der zuerst genannten Stufe; ein Unentschieden zählt als halber Sieg.
- **Parry-Quote:** erfolgreiche Parrys der zuerst genannten Stufe, geteilt durch alle
  Schwünge des Gegners (auch die, die ohnehin danebengingen – die Zahl wirkt deshalb klein).
- Die Seiten werden nach jedem Durchgang durch alle Maps getauscht.
- Bei 160 Matches schwankt eine Quote zufällig um etwa ±4 Prozentpunkte, pro Map (40
  Matches) um etwa ±8.

## Können-Werte (`SKILL` in `src/solo/difficulty.ts`)

| Stufe | Duell | Arena |
|---|---|---|
| leicht | 0.05 | 0.05 |
| mittel | 0.09 | 0.11 |
| schwer | 0.33 | 0.44 |

Können: 0 = schwächster, 1 = stärkster Bot. Daraus werden alle Bot-Parameter berechnet
(`personalityForSkill`): Drehtempo, Reaktionszeit, Angriffs-, Dash-Angriffs- und
Parry-Wahrscheinlichkeit, Lust auf Parkour. Wie der Bot einen Modus spielt (z. B. in der
Arena öfter parieren), steht getrennt davon in `src/bots/modeTactics.ts`.

## Grenzen dieser Messung

- Bots spielen gegen Bots. Wie sich die Stufen für einen Menschen anfühlen, misst das nicht.
- Gemessen wird mit kurzen Pausen zwischen den Runden, sonst mit den echten Regeln.
