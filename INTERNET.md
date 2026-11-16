# INTERNET.md – Mit Freunden spielen (WLAN, Tunnel, Hosting) und Solo auf GitHub Pages

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
| E – GitHub Pages | **nur Solo gegen Bot**, als öffentliche Webseite | 5 Minuten, einmalig | kostenlos |

Wichtig für die Wahl: **Mehrspieler braucht immer den Server-Prozess** (Varianten A–D).
GitHub Pages kann nur fertige Dateien ausliefern, keinen Server betreiben – dort läuft
deshalb nur der Solo-Modus (Variante E). Der Solo-Modus selbst funktioniert überall, auch
in den Varianten A–D und ganz ohne Internet.

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

## Variante E: GitHub Pages (nur Solo gegen Bot)

GitHub Pages veröffentlicht einen Ordner mit fertigen Dateien als Webseite unter
`https://DEIN-NAME.github.io/REPO-NAME/`. Der Solo-Modus braucht nichts anderes: Server-Kern
und Bot laufen im Browser (`src/solo/`). Die Mehrspieler-Knöpfe sind dort grau, mit dem
Hinweis „Kein Spielserver erreichbar“.

**Einmalig einrichten:**

1. Auf GitHub im Repo: **Settings → Pages → „Build and deployment“ → Source: „GitHub Actions“**.
2. Etwas pushen (oder im Tab **Actions** den Workflow „Deploy to GitHub Pages“ mit
   „Run workflow“ von Hand starten).
3. Im Tab **Actions** zusehen: erst läuft „build“, dann „deploy“. Danach steht die Adresse
   beim Job „deploy“ und unter Settings → Pages.

Ab dann wird bei **jedem Push** neu gebaut und veröffentlicht
(`.github/workflows/pages.yml`). Der Workflow prüft vorher Typen und Tests (Unit +
Bot-Simulation inklusive Solo-Matches) – schlägt etwas fehl, wird nicht veröffentlicht.

**Wenn der „deploy“-Job rot wird:**

| Meldung (sinngemäß) | Ursache / Lösung |
|---|---|
| „Get Pages site failed“ / „Not Found“ bei „Pages vorbereiten“ | Schritt 1 fehlt: Pages ist noch nicht auf „GitHub Actions“ gestellt |
| „Branch … is not allowed to deploy to github-pages due to environment protection rules“ | GitHub erlaubt das Veröffentlichen standardmäßig nur vom Standard-Branch. Entweder den Arbeits-Branch in den Standard-Branch mergen, oder unter **Settings → Environments → github-pages → Deployment branches** den Branch hinzufügen bzw. „No restriction“ wählen |
| Seite lädt, bleibt aber leer/weiß; im Browser-Log 404 für `/assets/…` | Der `base`-Pfad passt nicht zum Repo-Namen. Der Workflow setzt ihn automatisch (`BASE_PATH`); bei eigenem Build: `BASE_PATH=/REPO-NAME/ npm run build:pages` |

Mehrere Branches: Der Workflow läuft auf jedem Branch, und der zuletzt veröffentlichte Stand
gewinnt. Wer nur einen Branch veröffentlichen will, ergänzt in `pages.yml` unter `push:` die
Zeile `branches: [main]` (bzw. den Namen des gewünschten Branches).

**Lokal ausprobieren, was veröffentlicht würde:**

```bash
npm run build:pages
```

```bash
npm run preview:pages
```

Dann <http://localhost:4173/ghostrunner-pvp/> öffnen (genau mit dem Unterordner).

Eigener Server statt Pages? Nicht nötig: `npm run host` (Varianten A–D) liefert dieselbe
Seite aus – dort funktionieren Solo **und** Mehrspieler.

---

## Was davon getestet ist (ehrlich)

| Was | Getestet? |
|---|---|
| Produktionsmodus: ein Port liefert Seite + WebSocket (`npm run build`, `npm start`) | ✅ automatisch – die Browser-Tests (`npm run test:browser`) laufen genau so |
| Betrieb hinter einem Reverse-Proxy (das macht jeder Tunnel und jeder Hoster): Seite, `/health` und ein ganzes Bot-Match über den Proxy | ✅ automatisch – `tests/integration/behindProxy.test.ts` (Teil von `npm test`) |
| Spielen mit künstlichem Ping bis 300 ms + Jitter, Verbindungsabbruch und Wiederkehr | ✅ automatisch – `tests/sim/botMatch.test.ts` |
| Solo-Matches ohne Server: alle Maps × alle Schwierigkeiten bis zum Match-Ende, Rematch | ✅ automatisch – `tests/sim/soloMatch.test.ts` (Teil von `npm test`) |
| Die Pages-Version (`npm run build:pages`) als rein statische Seite im Unterordner, **ohne** Server: Menü, Mehrspieler deaktiviert, Solo-Runde | ✅ automatisch – Browser-Test „Ohne Server (wie GitHub Pages)“ |
| Die Befehle des Workflows (Typprüfung, Tests, Build mit `BASE_PATH`) | ✅ lokal von Hand ausgeführt |
| Der Workflow **auf GitHub** und die echte Pages-Seite | ❌ **nicht bestätigt.** Der Workflow ist gepusht, aber Pages muss erst von dir in den Repo-Einstellungen aktiviert werden (Schritt 1 oben); das kann nur der Besitzer des Repos. Stand dazu: siehe `STATUS.md`. |
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
| Seite lädt, aber „Kein Spielserver erreichbar“ und Mehrspieler ist grau | Der Tunnel/Hoster leitet keine WebSockets weiter, oder der Server-Prozess läuft nicht mehr. (Auf GitHub Pages ist das normal: dort gibt es nur Solo.) |
| Freund sieht „Diesen Raum gibt es nicht“ | Er ist auf einer anderen Adresse (anderer Server) oder der Code ist falsch. Beide müssen denselben Server benutzen |
| Seite nicht erreichbar | Läuft `npm run host` noch? Läuft der Tunnel noch? Firewall-Abfrage erlaubt? |
| Alles ruckelt / Treffer wirken verspätet | `F3` drücken: Ping über ~200 ms? Dann Hosting in eurer Nähe statt Tunnel probieren |
| „Verbindung verloren – verbinde neu …“ | Der Client versucht es 25 Sekunden lang von selbst; dein Platz bleibt 20 Sekunden reserviert und das Match pausiert so lange |
