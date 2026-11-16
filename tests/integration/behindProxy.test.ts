/**
 * "Playing over the internet" test, as far as it can be tested on one machine:
 * the real server runs like in production (one port serves the built web page AND the
 * WebSocket), and all traffic goes through a reverse proxy on another port - exactly the
 * situation behind a tunnel (cloudflared, ngrok ...) or a hosting provider. See INTERNET.md.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runLiveMatch } from '../../src/bots/liveRunner';
import { findProblems } from '../../src/bots/report';
import { startServer, type RunningServer } from '../../src/server/startServer';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { startReverseProxy, type RunningProxy } from '../reverseProxy';

let server: RunningServer;
let proxy: RunningProxy;
let staticDir: string;

beforeAll(async () => {
  // Stand-in for the built client (dist/client), so the test does not need `npm run build`.
  staticDir = mkdtempSync(join(tmpdir(), 'client-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Neonklinge</title>');
  server = await startServer({ port: 0, matchConfig: FAST_MATCH_CONFIG, staticDir });
  proxy = await startReverseProxy(server.port);
});

afterAll(async () => {
  await proxy.close();
  await server.close();
  rmSync(staticDir, { recursive: true, force: true });
});

describe('server behind a reverse proxy (like a tunnel or a hosting provider)', () => {
  it('serves the web page and the health check through the proxy', async () => {
    const page = await fetch(`http://localhost:${proxy.port}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Neonklinge');
    expect(await fetch(`http://localhost:${proxy.port}/health`).then((r) => r.json())).toEqual({ ok: true });
    // Unknown paths fall back to the page (so a shared link with a path still works).
    expect((await fetch(`http://localhost:${proxy.port}/some/path`)).status).toBe(200);
  });

  it('two bots play a full match through the proxy without desyncs', async () => {
    const report = await runLiveMatch({
      url: `ws://localhost:${proxy.port}/ws`,
      label: 'proxied',
      seed: 5,
      lagMs: 30,
      jitterMs: 10,
      timeoutSec: 25,
    });
    expect(findProblems({ matches: [report], server: server.game.stats() })).toEqual([]);
    expect(report.finished).toBe(true);
    expect(proxy.upgrades()).toBe(2); // both WebSockets really went through the proxy
    for (const bot of report.bots) expect(bot.desyncs).toBe(0);
  }, 30_000);
});
