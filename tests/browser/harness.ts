/**
 * Helpers for the browser tests (run.ts): start a real server that serves the built
 * client, open Chromium pages, and small functions to look at / steer the game in a page.
 *
 * In a page, `window.game` is the GameClient and `window.gameInput` the InputController
 * (both are set by the client as debugging aids).
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { startServer, type RunningServer } from '../../src/server/startServer';
import { secondsToTicks } from '../../src/shared/config';
import type { MatchConfig } from '../../src/shared/match/matchConfig';
import type { GameEvent } from '../../src/shared/sim/events';
import type { PlayerState } from '../../src/shared/sim/playerState';
import type { MatchState } from '../../src/shared/sim/world';

export const SCREENSHOT_DIR = join(import.meta.dirname, 'screenshots');

/** Short countdowns and pauses, but the real rules (best-of-5). */
const BROWSER_TEST_CONFIG: MatchConfig = {
  countdownTicks: secondsToTicks(1),
  roundTicks: secondsToTicks(40),
  roundEndTicks: secondsToTicks(1),
  matchEndTicks: 0,
  reconnectTicks: secondsToTicks(10),
  roundsToWin: 3,
  maxRounds: 9,
};

export interface TestEnv {
  server: RunningServer;
  browser: Browser;
  /** Address of the real game server (page + WebSocket). */
  url: string;
  /** Address of the static copy of the game WITHOUT any game server (like GitHub Pages). */
  staticUrl: string;
  staticSite: Server;
}

/** Must match `PAGES_BASE` in vite.config.ts. */
const PAGES_BASE = process.env.BASE_PATH ?? '/ghostrunner-pvp/';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/**
 * Serves the GitHub Pages build (dist/pages) the way GitHub Pages does: plain files
 * below the repository's sub-folder, 404 for everything else, and no WebSocket.
 */
async function startStaticSite(): Promise<Server> {
  const root = 'dist/pages';
  if (!existsSync(join(root, 'index.html'))) throw new Error('dist/pages is missing - run "npm run build:pages" first');
  const site = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const inside = path.startsWith(PAGES_BASE) ? normalize(path.slice(PAGES_BASE.length)) : null;
    const file = inside === null || inside.startsWith('..') ? null : join(root, inside === '.' ? 'index.html' : inside);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 - not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => site.listen(0, resolve));
  return site;
}

export async function startEnv(): Promise<TestEnv> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const server = await startServer({ port: 0, matchConfig: BROWSER_TEST_CONFIG, staticDir: 'dist/client' });
  const browser = await chromium.launch({
    // Lets WebGL work without a graphics card (software rendering).
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const staticSite = await startStaticSite();
  const staticUrl = `http://localhost:${(staticSite.address() as AddressInfo).port}${PAGES_BASE}`;
  return { server, browser, url: `http://localhost:${server.port}`, staticUrl, staticSite };
}

/** What a test sees of the game inside one page. */
export interface GameView {
  phase: MatchState['phase'] | null;
  scores: number[];
  round: number;
  rematchVotes: boolean[];
  me: PlayerState | null;
  enemy: PlayerState | null;
  distance: number;
  connected: boolean;
  inRoom: boolean;
  desyncs: number;
}

/** One browser tab with the game, plus the errors it reported. */
export class GamePage {
  readonly errors: string[] = [];

  constructor(
    readonly page: Page,
    readonly name: string,
  ) {
    page.on('pageerror', (error) => this.errors.push(String(error)));
    page.on('console', (message) => {
      // A dropped connection logs a network error in the console - that is expected in the reconnect test.
      if (message.type() === 'error' && !message.text().includes('WebSocket')) this.errors.push(message.text());
    });
  }

  /**
   * Open the game and wait for the menu.
   * @param expectServer wait until the game server is connected (false for the static site)
   */
  async open(url: string, expectServer = true): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForSelector('#map-list .map-card');
    await this.page.fill('#name-input', this.name);
    await this.page.waitForSelector(`#multiplayer[data-state="${expectServer ? 'online' : 'offline'}"]`);
    // Record all game events of this page, so tests can ask "was there a parry?".
    if (expectServer) await this.installEventLog();
  }

  /**
   * Start recording the game events of the CURRENT client (`window.game`). Call it again
   * after starting a solo match - that one has its own client.
   */
  async installEventLog(): Promise<void> {
    await this.page.evaluate(() => {
      const w = window as unknown as { game: { onGameEvent: (e: unknown) => void }; gameEvents: unknown[] };
      w.gameEvents = [];
      const original = w.game.onGameEvent;
      w.game.onGameEvent = (event) => {
        w.gameEvents.push(event);
        original(event);
      };
    });
  }

  events(): Promise<GameEvent[]> {
    return this.page.evaluate(() => (window as unknown as { gameEvents: GameEvent[] }).gameEvents);
  }

  state(): Promise<GameView> {
    return this.page.evaluate(() => {
      const game = (window as unknown as { game: import('../../src/netcode/gameClient').GameClient | null }).game;
      const me = game?.localPlayer ?? null;
      const enemy = game?.opponent ?? null;
      const match = game?.snapshot?.match ?? null;
      return {
        phase: match?.phase ?? null,
        scores: match?.scores ?? [],
        round: match?.round ?? 0,
        rematchVotes: match?.rematchVotes ?? [],
        me,
        enemy,
        distance: me && enemy ? Math.hypot(me.pos.x - enemy.pos.x, me.pos.z - enemy.pos.z) : Infinity,
        connected: game?.connected ?? false,
        inRoom: game !== null && game.room !== null,
        desyncs: game?.stats.desyncs ?? 0,
      };
    });
  }

  /** Wait until `check(state)` is true. Fails with `what` in the message after the timeout. */
  async waitFor(what: string, check: (s: GameView) => boolean, timeoutMs = 20_000): Promise<GameView> {
    const start = Date.now();
    for (;;) {
      const state = await this.state();
      if (check(state)) return state;
      if (Date.now() - start > timeoutMs) {
        await this.screenshot(`FAILED-${this.name}`);
        throw new Error(`${this.name}: timed out waiting for: ${what} (phase ${state.phase}, scores ${state.scores})`);
      }
      await this.page.waitForTimeout(50);
    }
  }

  text(selector: string): Promise<string> {
    return this.page.locator(selector).innerText();
  }

  /** Wait until the element shows `expected` (the HUD is redrawn one frame after the state changes). */
  async expectText(selector: string, expected: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const actual = await this.text(selector);
      if (actual.includes(expected)) return;
      if (Date.now() - start > timeoutMs) {
        await this.screenshot(`FAILED-${this.name}`);
        throw new Error(`${this.name}: ${selector} should show "${expected}", but shows "${actual}"`);
      }
      await this.page.waitForTimeout(50);
    }
  }

  /** Turn the camera (the test cannot move a captured mouse). */
  async look(yaw: number, pitch = 0): Promise<void> {
    await this.page.evaluate(
      ([y, p]) => (window as unknown as { gameInput: { setView(y: number, p: number): void } }).gameInput.setView(y, p),
      [yaw, pitch],
    );
  }

  async screenshot(label: string): Promise<void> {
    await this.page.screenshot({ path: join(SCREENSHOT_DIR, `${label}.png`) });
  }
}

/** One fresh tab. `url` is the game server (env.url) or the static site (env.staticUrl). */
export async function openOne(env: TestEnv, url: string, expectServer = true): Promise<GamePage> {
  const context = await env.browser.newContext({ viewport: { width: 960, height: 540 } });
  const player = new GamePage(await context.newPage(), 'Anna');
  await player.open(url, expectServer);
  return player;
}

/** Two fresh tabs (separate storage, like two different players). */
export async function openTwo(env: TestEnv): Promise<{ a: GamePage; b: GamePage; contexts: BrowserContext[] }> {
  const contexts = await Promise.all([0, 1].map(() => env.browser.newContext({ viewport: { width: 960, height: 540 } })));
  const a = new GamePage(await contexts[0].newPage(), 'Anna');
  const b = new GamePage(await contexts[1].newPage(), 'Ben');
  await Promise.all([a.open(env.url), b.open(env.url)]);
  return { a, b, contexts };
}

/** Anna creates a room on `mapId`, Ben joins with the code. Returns once the round is running. */
export async function startDuel(a: GamePage, b: GamePage, mapId = 'schlucht'): Promise<string> {
  await a.page.click(`.map-card[data-map="${mapId}"]`);
  await a.page.click('#create-button');
  await a.waitFor('room created', (s) => s.inRoom && s.phase === 'waiting');
  const code = await a.text('#room-code');
  await b.page.fill('#code-input', code);
  await b.page.click('#join-button');
  await a.waitFor('round running', (s) => s.phase === 'playing');
  await b.waitFor('round running', (s) => s.phase === 'playing');
  return code;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual<T>(actual: T, expected: T, what: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
