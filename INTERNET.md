# INTERNET.md – Mit Freunden spielen (WLAN, Tunnel, Hosting)

Das Spiel braucht genau **einen** Server-Prozess. Er liefert die Webseite **und** die
WebSocket-Verbindung über **denselben Port** aus (Standard: 3000). Wer diese eine Adresse im
Browser öffnen kann, kann mitspielen – mehr muss nicht „durchgereicht“ werden.

```bash
npm run host
```

Das baut den Client (`dist/client`) und startet den Server. Du selbst spielst dann auf
<http://localhost:3000>. (`npm run dev` ist nur zum Entwickeln gedacht – dafür laufen zwei
Programme auf zwei Ports.)

Welche Variante passt?

| Variante | Für wen | Aufwand | Kosten |
|---|---|---|---|
| A – Gleiches WLAN | Freund sitzt bei dir | keiner | – |
| B – Tunnel | schnell mal übers Internet spielen | 2 Minuten | kostenlos |
| C – Hosting | dauerhaft erreichbar, auch wenn dein PC aus ist | 15–30 Minuten | kostenlos bis wenige €/Monat |
| D – Portfreigabe im Router | wer seinen Router kennt | mittel | – |

---

## Variante A: Gleiches WLAN

1. `npm run host`
2. Im Terminal steht eine Zeile wie `same Wi-Fi: http://192.168.178.23:3000`.
3. Dein Freund öffnet genau diese Adresse. Du erstellst einen Raum, er gibt den Code ein.

macOS/Windows fragen beim ersten Mal, ob Node eingehende Verbindungen annehmen darf → erlauben.

---

## Variante B: Tunnel (empfohlen zum Ausprobieren)

Ein Tunnel-Programm gibt deinem lokalen Server für die Dauer der Sitzung eine öffentliche
`https://…`-Adresse. Dein Computer ist der Server, dein Freund braucht nur den Link.

**Schritt 1 –** Spiel starten und laufen lassen:

```bash
npm run host
```

**Schritt 2 –** in einem **zweiten** Terminal einen Tunnel öffnen. Eine der drei Möglichkeiten:

*Cloudflare Tunnel (kein Konto nötig, stabil):*

```bash
brew install cloudflared        # macOS; Windows: winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Im Terminal erscheint eine Adresse wie `https://irgendwas-zufälliges.trycloudflare.com`.

*localtunnel (nichts installieren, dafür etwas wackeliger):*

```bash
npx localtunnel --port 3000
```

Beim ersten Öffnen der `https://….loca.lt`-Adresse fragt eine Zwischenseite nach einem
„Tunnel Password“ – das ist deine öffentliche IP-Adresse (die Seite erklärt, wo du sie findest).

*ngrok (Konto nötig, sehr verbreitet):*

```bash
ngrok http 3000
```

**Schritt 3 –** Schick deinem Freund die `https://…`-Adresse. Ihr öffnet sie beide (du kannst
auch weiter `http://localhost:3000` benutzen), du klickst „Raum erstellen“ und gibst ihm den
vierstelligen Code.

Gut zu wissen:

- Die Adresse gilt nur, solange beide Terminals offen sind, und ist bei jedem Start neu.
- Jeder, der die Adresse kennt, kommt auf dein Spiel (nicht auf deinen Computer). Tunnel
  schließen (`Ctrl + C`), wenn ihr fertig seid.
- Der Ping ist höher als bei Hosting, weil alles über den Tunnel-Anbieter läuft. `F3` im
  Spiel zeigt ihn an. Bis ~150 ms spielt es sich gut (Lag-Kompensation, siehe `LEARNING.md`).
- Die Seite benutzt automatisch `wss://` (verschlüsselter WebSocket), wenn sie über `https://`
  geöffnet wurde – du musst nichts umstellen.

---

## Variante C: Hosting (dauerhaft online)

Jeder Anbieter, der **Node.js-Webdienste mit WebSockets** betreibt, funktioniert, z. B.
Render, Railway, Fly.io oder ein eigener kleiner Server (VPS).

Einstellungen, die überall gleich sind:

| Einstellung | Wert |
|---|---|
| Build-Befehl | `npm install && npm run build` |
| Start-Befehl | `npm start` |
| Node-Version | 22 oder neuer |
| Port | Der Server liest die Umgebungsvariable `PORT` (setzen die meisten Anbieter selbst) |
| Health-Check-Pfad | `/health` |
| Region | möglichst nah bei euch (z. B. Frankfurt) – das bestimmt den Ping |
| Instanzen | genau **1** (Räume liegen im Arbeitsspeicher dieses einen Prozesses) |

Beispiel Render.com: „New → Web Service“, das GitHub-Repo auswählen, die Werte aus der Tabelle
eintragen, Region „Frankfurt“. Nach dem ersten Deploy ist das Spiel unter der angezeigten
`https://…onrender.com`-Adresse erreichbar. Kostenlose Tarife schlafen nach einiger Zeit ohne
Besucher ein – der erste Aufruf dauert dann etwa eine Minute.

Mit Docker (Fly.io, eigener Server): Im Repo liegt ein `Dockerfile`.

```bash
docker build -t neonklinge .
docker run -p 3000:3000 neonklinge
```

Nützliche Umgebungsvariablen: `PORT` (Port), `MAP=reaktor` (alle Räume auf dieser Map),
`FAST_MATCH=1` (sehr kurze Runden zum Testen).

Überwachen: `https://DEINE-ADRESSE/stats` zeigt Räume, Spieler, Tick-Zeiten und Fehler.

---

## Variante D: Portfreigabe im Router

Im Router eine Weiterleitung von TCP-Port 3000 auf deinen Computer einrichten und deinem
Freund `http://DEINE-ÖFFENTLICHE-IP:3000` geben. Funktioniert, ist aber fummelig (jeder
Router ist anders, manche Anschlüsse haben keine eigene öffentliche IPv4-Adresse). Variante B
ist einfacher und sicherer.

---

## Was davon getestet ist (ehrlich)

| Was | Getestet? |
|---|---|
| Produktionsmodus: ein Port liefert Seite + WebSocket (`npm run build`, `npm start`) | ✅ automatisch – die Browser-Tests (`npm run test:browser`) laufen genau so |
| Betrieb hinter einem Reverse-Proxy (das macht jeder Tunnel und jeder Hoster): Seite, `/health` und ein ganzes Bot-Match über den Proxy | ✅ automatisch – `tests/integration/behindProxy.test.ts` (Teil von `npm test`) |
| Spielen mit künstlichem Ping bis 300 ms + Jitter, Verbindungsabbruch und Wiederkehr | ✅ automatisch – `tests/sim/botMatch.test.ts` |
| Ein **echter** Tunnel (cloudflared / localtunnel / ngrok) | ❌ **nicht getestet.** Die Umgebung, in der das Spiel gebaut wurde, erlaubt keine Tunnel ins Internet. Die Befehle oben sind die normalen, dokumentierten Aufrufe dieser Programme – bitte beim ersten Mal selbst ausprobieren. |
| Hosting bei einem Anbieter, `docker build` | ❌ **nicht getestet** (kein Konto, kein Docker in der Bau-Umgebung). Das `Dockerfile` ist kurz und Standard, aber ungeprüft. |

So prüfst du einen laufenden Server oder Tunnel von außen – mit Bots statt Menschen:

```bash
npm run bots -- --url wss://DEINE-ADRESSE/ws --matches 2 --full
```

Am Ende muss `RESULT: OK - no desyncs, no errors.` stehen. In der Spalte `rtt(ms)` siehst du
den Ping über den Tunnel.

---

## Probleme?

| Problem | Ursache / Lösung |
|---|---|
| Seite lädt, aber „Der Spielserver ist nicht erreichbar“ | Der Tunnel/Hoster leitet keine WebSockets weiter, oder der Server-Prozess läuft nicht mehr |
| Freund sieht „Diesen Raum gibt es nicht“ | Er ist auf einer anderen Adresse (anderer Server) oder der Code ist falsch. Beide müssen denselben Server benutzen |
| Seite nicht erreichbar | Läuft `npm run host` noch? Läuft der Tunnel noch? Firewall-Abfrage erlaubt? |
| Alles ruckelt / Treffer wirken verspätet | `F3` drücken: Ping über ~200 ms? Dann Hosting in eurer Nähe statt Tunnel probieren |
| „Verbindung verloren – verbinde neu …“ | Der Client versucht es 25 Sekunden lang von selbst; dein Platz bleibt 20 Sekunden reserviert und das Match pausiert so lange |
