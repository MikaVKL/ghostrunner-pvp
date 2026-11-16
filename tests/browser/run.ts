/**
 * Browser tests: the REAL game in a REAL (headless) Chromium, two tabs playing against
 * each other on a real server. Run with:   npm run test:browser
 *
 * They check what the unit tests cannot: that the page loads, the German menu works, the
 * 3D view starts without errors, and that keyboard input leads to kills, parries, falls,
 * a rematch and a reconnect - all the way through server, netcode and HUD.
 *
 * Screenshots of every test end up in tests/browser/screenshots/.
 * First time on your own computer: `npx playwright install chromium`.
 */
import { assert, assertEqual, openTwo, startDuel, startEnv, type GamePage, type TestEnv } from './harness';

const YAW_MINUS_Z = 0; // from spawn 0 on "schlucht" this looks along the platform edge

/**
 * Runs inside the page (as text, so the build tool does not rewrite it): press the parry
 * key in the very frame in which the opponent's swing becomes VISIBLE. It watches the
 * interpolated opponent (what is drawn on screen), not the newest snapshot - parry timing
 * is judged by what the defender saw (lag compensation), so that is what a player reacts to.
 */
const PARRY_ON_SIGHT = `(() => {
  const started = performance.now();
  (function watch() {
    const shown = window.game.room ? window.game.sampleRemote(1 - window.game.room.slot) : null;
    if (shown && shown.action === 'attack') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })), 80);
    } else if (performance.now() - started < 4000) requestAnimationFrame(watch);
  })();
})()`;

type TestFn = (env: TestEnv) => Promise<void>;
const tests: { name: string; run: TestFn }[] = [];
const test = (name: string, run: TestFn) => tests.push({ name, run });

/** Walk forward until the opponent is within `distance` meters, then stop. */
async function walkToEnemy(player: GamePage, distance: number): Promise<void> {
  await player.page.keyboard.down('KeyW');
  await player.waitFor(`enemy within ${distance} m`, (s) => s.distance < distance || s.phase !== 'playing');
  await player.page.keyboard.up('KeyW');
}

/** The player walks off the platform and falls into the abyss. */
async function jumpIntoAbyss(player: GamePage): Promise<void> {
  await player.look(YAW_MINUS_Z);
  await player.page.keyboard.down('KeyW');
  await player.waitFor('death by falling', (s) => s.me !== null && !s.me.alive);
  await player.page.keyboard.up('KeyW');
}

function noErrors(...pages: GamePage[]): void {
  for (const p of pages) assertEqual(p.errors, [], `errors in the browser console of ${p.name}`);
}

async function noDesyncs(...pages: GamePage[]): Promise<void> {
  for (const p of pages) assertEqual((await p.state()).desyncs, 0, `desyncs of ${p.name}`);
}

test('Hauptmenü: deutsch, alle Maps, Steuerungshilfe', async (env) => {
  const { a } = await openTwo(env);
  assert((await a.page.title()).includes('Neonklinge'), 'page title');
  assertEqual(await a.text('#quick-button'), 'Schnelles Spiel', 'quick match button');
  assertEqual(await a.text('#create-button'), 'Raum erstellen', 'create button');
  const maps = await a.page.locator('.map-card b').allInnerTexts();
  assertEqual(maps, ['Neonschlucht', 'Dächer', 'Reaktor', 'Arena'], 'map cards');

  await a.page.click('#help-button');
  assert(await a.page.isVisible('#help'), 'help opens');
  assert((await a.text('#help')).includes('Ein Treffer tötet'), 'help explains the rules');
  await a.page.keyboard.press('Escape');
  assert(!(await a.page.isVisible('#help')), 'help closes with Esc');

  await a.page.fill('#code-input', 'ZZZZ');
  await a.page.click('#join-button');
  await a.page.waitForFunction(() => document.getElementById('lobby-status')!.textContent!.includes('gibt es nicht'));
  await a.screenshot('01-menu');
  noErrors(a);
});

test('Raum erstellen, per Code beitreten, 3D-Ansicht und HUD', async (env) => {
  const { a, b } = await openTwo(env);
  await a.page.click('.map-card[data-map="daecher"]');
  await a.page.click('#create-button');
  await a.waitFor('practice mode', (s) => s.phase === 'waiting' && s.me !== null);
  assert(await a.page.isVisible('#hud'), 'HUD visible');
  assert(!(await a.page.isVisible('#lobby')), 'menu hidden');
  await a.expectText('#map-name', 'Dächer');
  await a.expectText('#message', 'Warte auf Gegner');
  await a.screenshot('02-waiting');

  const code = await a.text('#room-code');
  await b.page.fill('#code-input', code.toLowerCase());
  await b.page.click('#join-button');
  await a.waitFor('round running', (s) => s.phase === 'playing');
  await b.waitFor('round running', (s) => s.phase === 'playing');
  await a.expectText('#my-name', 'Anna');
  await a.expectText('#enemy-name', 'Ben');
  await a.expectText('#my-pips', '◇◇◇'); // best-of-5: three wins needed
  assert((await a.state()).enemy !== null, 'the opponent is in the snapshot');
  // The 3D picture is really drawn: the canvas is not one flat color.
  const colors = await a.page.evaluate(() => {
    const source = document.getElementById('game') as HTMLCanvasElement;
    const copy = document.createElement('canvas');
    copy.width = copy.height = 16;
    const ctx = copy.getContext('2d')!;
    return new Promise<number>((resolve) =>
      requestAnimationFrame(() => {
        ctx.drawImage(source, 0, 0, 16, 16);
        resolve(new Set(Array.from(ctx.getImageData(0, 0, 16, 16).data)).size);
      }),
    );
  });
  assert(colors > 8, `canvas shows a picture (only ${colors} different color values)`);
  await a.screenshot('03-duel-start');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Schwertkampf: ein Treffer tötet und gibt den Rundenpunkt', async (env) => {
  const { a, b } = await openTwo(env);
  await startDuel(a, b);
  await walkToEnemy(a, 2.4);
  await a.screenshot('04-face-to-face');
  // Swing until the hit lands (one press should do; retry in case of a hiccup).
  for (let i = 0; i < 5 && (await a.state()).phase === 'playing'; i++) {
    await a.page.keyboard.press('KeyJ');
    await a.page.waitForTimeout(700);
  }
  const after = await a.waitFor('round won', (s) => s.scores[0] === 1);
  assertEqual(after.scores, [1, 0], 'score');
  const events = await a.events();
  assert(events.some((e) => e.type === 'hit' && e.attacker === 0 && e.hpLeft === 0), 'a deadly hit event arrived');
  assert(events.some((e) => e.type === 'death' && e.slot === 1 && e.cause === 'hp'), 'death event arrived');
  await b.waitFor('Ben sees the lost round', (s) => s.scores[0] === 1);
  await a.expectText('#my-pips', '◆◇◇'); // Anna has one point in the HUD
  await a.screenshot('05-round-won');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Parry: betäubt den Angreifer, der Verteidiger überlebt', async (env) => {
  const { a, b } = await openTwo(env);
  await startDuel(a, b);
  let parried = false;
  // A failed attempt costs Ben the round, so there are at most three tries per match.
  for (let attempt = 0; attempt < 3 && !parried; attempt++) {
    await a.waitFor('round running', (s) => s.phase === 'playing' && s.me !== null && s.me.alive);
    await walkToEnemy(a, 2.4);
    // Ben parries the moment he sees the swing start (decided inside his page, frame-exact).
    await b.page.evaluate(PARRY_ON_SIGHT);
    await a.page.keyboard.press('KeyJ');
    await a.page.waitForTimeout(900);
    parried = (await a.events()).some((e) => e.type === 'parry' && e.defender === 1);
  }
  assert(parried, 'Ben parried a swing within 3 attempts');
  await b.screenshot('06-parry');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Sturz in den Abgrund, Match-Ende und Rematch', async (env) => {
  const { a, b } = await openTwo(env);
  await startDuel(a, b);
  await jumpIntoAbyss(a);
  await a.waitFor('Ben gets the point', (s) => s.scores[1] === 1);
  assert((await a.events()).some((e) => e.type === 'death' && e.slot === 0 && e.cause === 'fall'), 'fall death event');
  for (const round of [2, 3]) {
    await a.waitFor(`round ${round} running`, (s) => s.phase === 'playing' && s.round === round && s.me !== null && s.me.alive);
    await jumpIntoAbyss(a);
  }

  await a.waitFor('match over', (s) => s.phase === 'matchEnd');
  await b.waitFor('match over', (s) => s.phase === 'matchEnd');
  await a.expectText('#message', 'NIEDERLAGE');
  await b.expectText('#message', 'SIEG');
  await b.expectText('#sub-message', '3 : 0');
  await b.expectText('#sub-message', 'Drücke R');
  await b.screenshot('07-match-won');

  await a.page.keyboard.press('KeyR');
  await b.waitFor('Anna voted', (s) => s.rematchVotes[0] === true);
  await b.expectText('#sub-message', 'Dein Gegner will ein Rematch');
  assertEqual((await b.state()).phase, 'matchEnd', 'one vote is not enough');
  await b.page.keyboard.press('KeyR');
  const fresh = await a.waitFor('new match', (s) => s.phase === 'playing' && s.round === 1);
  assertEqual(fresh.scores, [0, 0], 'scores are reset');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Reconnect: Verbindungsabbruch und Seiten-Reload', async (env) => {
  const { a, b } = await openTwo(env);
  const code = await startDuel(a, b);

  // 1) The connection breaks: the client reconnects by itself and takes its seat again.
  await a.page.evaluate(() => (window as unknown as { game: { close(): void } }).game.close());
  await b.waitFor('match paused', (s) => s.phase === 'paused');
  await b.expectText('#sub-message', 'Verbindung verloren');
  await b.expectText('#enemy-name', 'getrennt');
  await b.screenshot('08-paused');
  await a.waitFor('Anna is back', (s) => s.connected && s.inRoom && s.phase === 'playing');
  await b.waitFor('match continues', (s) => s.phase === 'playing');
  assert(!(await a.page.isVisible('#connection-lost')), 'the banner is gone');
  await a.expectText('#room-code', code);

  // 2) Anna reloads the page: the seat is remembered and taken again.
  await a.page.reload();
  await a.page.waitForFunction(() => 'game' in window);
  await a.waitFor('Anna is back after the reload', (s) => s.inRoom && s.phase === 'playing');
  await a.expectText('#room-code', code);
  assertEqual(env.server.game.stats().rooms, 1, 'still one room on the server');
  assertEqual(env.server.game.stats().errors, 0, 'server errors');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Schnelles Spiel und Verlassen', async (env) => {
  const { a, b } = await openTwo(env);
  await a.page.click('#quick-button');
  await a.waitFor('waiting for an opponent', (s) => s.phase === 'waiting');
  await b.page.click('#quick-button');
  await a.waitFor('paired', (s) => s.phase === 'playing');
  assertEqual(await a.text('#room-code'), await b.text('#room-code'), 'both are in the same room');

  await b.page.click('#leave-button');
  await b.page.waitForSelector('#lobby', { state: 'visible' });
  await a.waitFor('back to practice mode', (s) => s.phase === 'waiting');
  await a.expectText('#round-label', 'Übungsmodus');
  noErrors(a, b);
});

// ---------- runner ----------

const only = process.argv[2]; // optional: run only tests whose name contains this text
const env = await startEnv();
let failed = 0;
console.log(`Browser tests against ${env.url}\n`);
for (const { name, run } of tests) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  const startedAt = Date.now();
  try {
    await run(env);
    console.log(`  ✓ ${name}  (${((Date.now() - startedAt) / 1000).toFixed(1)} s)`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const context of env.browser.contexts()) await context.close();
}
const stats = env.server.game.stats();
console.log(`\nserver: errors ${stats.errors}, invalid messages ${stats.badMessages}`);
if (stats.errors > 0) failed++;
await env.browser.close();
await env.server.close();
console.log(failed === 0 ? '\nRESULT: OK - all browser tests passed.' : `\nRESULT: ${failed} browser test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
