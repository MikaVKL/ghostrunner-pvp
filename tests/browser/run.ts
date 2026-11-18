/**
 * Browser tests: the REAL game in a REAL (headless) Chromium, two tabs playing against
 * each other on a real server. Run with:   npm run test:browser
 *
 * They check what the unit tests cannot: that the page loads, the German menu works, the
 * 3D view starts without errors, and that keyboard input leads to kills, parries, falls,
 * a rematch and a reconnect - all the way through server, netcode and HUD.
 *
 * The solo mode is tested twice: on the normal server, and on a purely static copy of the
 * game without any server (what GitHub Pages serves).
 *
 * Screenshots of every test end up in tests/browser/screenshots/.
 * First time on your own computer: `npx playwright install chromium`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { yawToward } from '../../src/shared/math/vec3';
import { parseReplay } from '../../src/shared/replay/replayFormat';
import { assert, assertEqual, openOne, openTwo, SCREENSHOT_DIR, startDuel, startEnv, type GamePage, type TestEnv } from './harness';

const YAW_MINUS_Z = 0; // from spawn 0 on "schlucht" this looks along the platform edge

/**
 * Runs inside the page (as text, so the build tool does not rewrite it): press the parry
 * key when the opponent's blade is ABOUT TO LAND as it is shown on screen. The parry window
 * is only 0.15 s (shorter than the 0.2 s wind-up), so pressing at the first sight of the
 * swing would be too early. It watches the interpolated opponent (what is drawn), not the
 * newest snapshot - parry timing is judged by what the defender saw (lag compensation).
 */
const LIGHT = WEAPONS.sword.attacks.light;
const PARRY_ON_SIGHT = `(() => {
  const started = performance.now();
  const timer = setInterval(() => {
    const shown = window.game.room ? window.game.sampleRemote(1 - window.game.room.slot) : null;
    if (shown && shown.action === 'attack' && shown.actionTicks >= ${LIGHT.startupTicks - 6}) {
      clearInterval(timer);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })), 80);
    } else if (performance.now() - started > 4000) clearInterval(timer);
  }, 4);
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
  assertEqual(await a.text('#solo-button'), 'Solo gegen Bot', 'solo button');
  assertEqual(await a.page.locator('#difficulty-list button').allInnerTexts(), ['Leicht', 'Mittel', 'Schwer'], 'difficulty buttons');
  await a.page.click('#difficulty-list button[data-difficulty="schwer"]');
  await a.expectText('#difficulty-description', 'pariert die meisten Schläge');
  assertEqual(await a.page.locator('#mode-list button').allInnerTexts(), ['Duell', 'Arena'], 'mode buttons');
  await a.page.click('#mode-list button[data-mode="arena"]');
  await a.expectText('#mode-description', '3 Leben');
  await a.page.click('#mode-list button[data-mode="duel"]');
  await a.expectText('#mode-description', 'Ein Treffer tötet');
  assert(await a.page.isEnabled('#quick-button'), 'multiplayer is enabled while a server is connected');
  assertEqual(await a.text('#online-status'), '', 'no warning while online');

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
  await a.expectText('#map-name', 'Dächer · Duell');
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
  await serverIsEmpty(env); // this test counts the rooms on the server
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

/** Start a solo match from the menu and wait until the first round runs. */
async function startSolo(player: GamePage, mapId: string, difficulty: string): Promise<void> {
  await player.page.click(`.map-card[data-map="${mapId}"]`);
  await player.page.click(`#difficulty-list button[data-difficulty="${difficulty}"]`);
  await player.page.click('#solo-button');
  await player.waitFor('solo round running', (s) => s.inRoom && s.phase === 'playing' && s.enemy !== null);
  await player.installEventLog(); // the solo match has its own client
}

/** Wait until rooms of earlier tests are gone (a closed tab keeps its seat reserved for a while). */
async function serverIsEmpty(env: TestEnv): Promise<void> {
  for (let i = 0; i < 300 && env.server.game.stats().rooms > 0; i++) await new Promise((r) => setTimeout(r, 100));
  assertEqual(env.server.game.stats().rooms, 0, 'rooms left over from earlier tests');
}

test('Solo gegen Bot: ganzes Match im Browser, Bot kämpft, Rematch mit R', async (env) => {
  await serverIsEmpty(env);
  const a = await openOne(env, env.url);
  await startSolo(a, 'schlucht', 'schwer');
  assert(await a.page.isVisible('#hud'), 'HUD visible');
  await a.expectText('#solo-info', 'Solo · Duell · Schwer');
  await a.expectText('#enemy-name', 'Bot Schwer');
  await a.expectText('#my-pips', '◇◇◇'); // the normal best-of-5 rules
  assertEqual(env.server.game.stats().rooms, 0, 'rooms on the real server (solo must not use it)');
  await a.screenshot('09-solo-start');

  // 1) We do nothing: the bot comes over (bridge or wall-run) and kills us with its sword.
  await a.waitFor('the bot wins a round by a sword kill', (s) => s.scores[1] >= 1, 90_000);
  await a.page.waitForFunction(() =>
    (window as unknown as { gameEvents: { type: string; attacker?: number }[] }).gameEvents.some((e) => e.type === 'hit' && e.attacker === 1),
  );
  const cues = await a.page.evaluate(() => (window as unknown as { gameEffects: { windupCues: number } }).gameEffects.windupCues);
  assertEqual(cues, 0, 'no wind-up cue in the duel with the default setting');

  // 2) Lose the rest quickly by jumping into the abyss, until the match is over.
  for (let i = 0; i < 6 && (await a.state()).phase !== 'matchEnd'; i++) {
    const s = await a.waitFor('next round or match end', (v) => v.phase === 'matchEnd' || (v.phase === 'playing' && v.me !== null && v.me.alive));
    if (s.phase === 'playing') await jumpIntoAbyss(a);
    await a.waitFor('round decided', (v) => v.phase !== 'playing');
  }
  await a.waitFor('match over', (s) => s.phase === 'matchEnd', 60_000);
  await a.expectText('#message', 'NIEDERLAGE');
  await a.expectText('#sub-message', 'Dein Gegner will ein Rematch'); // the bot always votes yes
  await a.screenshot('10-solo-match-end');

  // 3) Rematch with R, then leave.
  await a.page.keyboard.press('KeyR');
  const fresh = await a.waitFor('new match', (s) => s.round === 1 && (s.phase === 'countdown' || s.phase === 'playing'));
  assertEqual(fresh.scores, [0, 0], 'scores are reset');
  await a.page.click('#leave-button');
  await a.page.waitForSelector('#lobby', { state: 'visible' });
  assert(!(await a.page.isVisible('#hud')), 'HUD hidden after leaving');
  assert(await a.page.isEnabled('#quick-button'), 'multiplayer still available after a solo match');
  assertEqual(env.server.game.stats().rooms, 0, 'rooms on the real server after the solo match');
  noErrors(a);
});

test('Solo und Mehrspieler nacheinander im selben Tab', async (env) => {
  const { a, b } = await openTwo(env);
  await startSolo(a, 'arena', 'leicht');
  await a.page.click('#leave-button');
  await a.page.waitForSelector('#lobby', { state: 'visible' });
  await a.installEventLog();
  await startDuel(a, b);
  await a.expectText('#enemy-name', 'Ben');
  assert(await a.page.isVisible('#room-info'), 'room code is shown again');
  assert(!(await a.page.isVisible('#solo-info')), 'solo label is gone');
  noErrors(a, b);
  await noDesyncs(a, b);
});

test('Ohne Server (wie GitHub Pages): Mehrspieler deaktiviert, Solo läuft', async (env) => {
  const a = await openOne(env, env.staticUrl, false);
  assert((await a.page.title()).includes('Neonklinge'), 'the page loads from the sub-folder');
  for (const id of ['#quick-button', '#create-button', '#join-button', '#code-input']) {
    assert(await a.page.isDisabled(id), `${id} is disabled without a server`);
  }
  await a.expectText('#online-status', 'Kein Spielserver erreichbar');
  assert(await a.page.isVisible('#retry-button'), 'retry button is offered');
  await a.page.click('#retry-button');
  await a.page.waitForSelector('#multiplayer[data-state="offline"]');
  await a.screenshot('11-pages-menu');

  await startSolo(a, 'daecher', 'mittel');
  await a.expectText('#solo-info', 'Solo · Duell · Mittel');
  await a.expectText('#map-name', 'Dächer');
  await jumpIntoAbyss(a);
  await a.waitFor('the bot gets the point', (s) => s.scores[1] === 1);
  await a.waitFor('round 2 starts', (s) => s.round === 2 && s.phase === 'playing', 30_000);
  await a.screenshot('12-pages-solo');
  assertEqual((await a.state()).desyncs, 0, 'desyncs');
  noErrors(a);
});

test('Tastenbelegung: Schlag auf K umlegen, gespeichert; Slide mit C', async (env) => {
  const a = await openOne(env, env.staticUrl, false);
  await a.page.click('#keymap-settings summary');
  await a.page.click('.keymap-slot[data-action="attack"][data-slot="0"]');
  await a.page.keyboard.press('KeyK');
  assertEqual(await a.text('.keymap-slot[data-action="attack"][data-slot="0"]'), 'K', 'attack slot shows K');
  const stored = await a.page.evaluate("JSON.parse(localStorage.getItem('keymap')).attack[0]");
  assertEqual(stored, 'KeyK', 'binding saved in the browser');
  await a.page.uncheck('#killcam-checkbox');
  await startSolo(a, 'arena', 'leicht');
  await a.expectText('#key-attack', 'K');
  // K now swings.
  await a.page.keyboard.press('KeyK');
  await a.waitFor('swing with K', (s) => s.me !== null && s.me.action === 'attack');
  // C while sprinting slides.
  await a.page.waitForTimeout(800);
  await a.page.keyboard.down('KeyW');
  await a.page.waitForTimeout(500);
  await a.page.keyboard.down('KeyC');
  await a.waitFor('slide', (s) => s.me !== null && (s.me.slideTicks > 0 || !s.me.alive || s.phase !== 'playing'));
  await a.page.keyboard.up('KeyC');
  await a.page.keyboard.up('KeyW');
  noErrors(a);
});

test('Spielgefühl: Bloom, Treffer-Funke; Bloom schaltet sich bei zu langsamer Grafik ab', async (env) => {
  const a = await openOne(env, env.staticUrl, false);
  // Switch bloom on in the menu (the test pages start with it off).
  await a.page.click('#fx-settings summary');
  await a.page.check('#fx-bloom');
  assert(await a.page.evaluate('window.gameView.bloom'), 'bloom on after ticking the box');
  await a.page.uncheck('#killcam-checkbox'); // no killcam in between our swings
  await startSolo(a, 'arena', 'leicht');
  await a.screenshot('15-bloom');
  // The test browser draws without a graphics card (a few frames per second): the frame
  // rate guard must switch bloom off by itself after about two seconds.
  await a.page.waitForFunction('window.gameView.bloom === false', undefined, { timeout: 30_000 });
  const stored = await a.page.evaluate("JSON.parse(localStorage.getItem('settings')).bloom");
  assertEqual(stored, true, 'the saved setting stays on');
  // Run at the bot (looking at it) and swing once it is in reach: the spark comes at once.
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await a.page.evaluate('window.gameEffects.contacts > 0')) break;
    const s = await a.state();
    if (s.phase !== 'playing' || !s.me?.alive || !s.enemy) {
      await a.page.waitForTimeout(250);
      continue;
    }
    await a.look(yawToward(s.me.pos, s.enemy.pos));
    if (s.distance > 2.2) {
      await a.page.keyboard.down('KeyW');
      await a.page.waitForTimeout(100);
      await a.page.keyboard.up('KeyW');
      continue;
    }
    await a.page.keyboard.press('KeyJ');
    // Keep the bot in view during the wind-up, like a human with the mouse (it circles us).
    for (let i = 0; i < 8; i++) {
      const now = await a.state();
      if (now.me && now.enemy) await a.look(yawToward(now.me.pos, now.enemy.pos));
      await a.page.waitForTimeout(50);
    }
  }
  assert(await a.page.evaluate('window.gameEffects.contacts > 0'), 'contact spark shown when our swing reached the bot');
  noErrors(a);
});

test('Block und Haltung: Q halten blockt, die Haltungsleiste füllt sich', async (env) => {
  const a = await openOne(env, env.staticUrl, false);
  await a.page.uncheck('#killcam-checkbox');
  await a.page.click('#mode-list button[data-mode="arena"]'); // 3 lives: time for several blocks
  await startSolo(a, 'arena', 'schwer');
  await a.page.keyboard.down('KeyQ');
  // Hold the guard and keep looking at the bot until one of its swings is blocked.
  const blocked = "(window.gameEvents || []).some((e) => e.type === 'block' && e.defender === window.game.room.slot)";
  for (let i = 0; i < 600 && !(await a.page.evaluate(blocked)); i++) {
    const s = await a.state();
    if (s.me && s.enemy) await a.look(yawToward(s.me.pos, s.enemy.pos));
    // Q must be held again after a death or a new round (the key stays down, the guard restarts).
    await a.page.waitForTimeout(100);
  }
  assert(await a.page.evaluate(blocked), 'a swing of the bot was blocked');
  const width = Number(await a.page.evaluate("parseFloat(document.querySelector('#my-posture .fill').style.width)"));
  assert(width > 0, `own posture bar shows the block (width ${width} %)`);
  await a.screenshot('17-block-posture');
  await a.page.keyboard.up('KeyQ');
  noErrors(a);
});

test('Angriffsanzeige: roter Ring und Ton, wenn der Bot ausholt', async (env) => {
  const a = await openOne(env, env.url);
  await a.page.selectOption('#windup-select', 'on');
  await startSolo(a, 'arena', 'schwer');
  // We stand still; the bot comes and swings at us.
  await a.page.waitForFunction(
    () => (window as unknown as { gameEffects: { windupCues: number } }).gameEffects.windupCues > 0,
    undefined,
    { timeout: 90_000 },
  );
  await a.screenshot('14-windup-cue');
  noErrors(a);
});

test('Arena gegen Bot: Leben im HUD, ein Treffer kostet ein Leben, Angriffsanzeige an', async (env) => {
  const a = await openOne(env, env.url);
  await a.page.click('#mode-list button[data-mode="arena"]');
  await startSolo(a, 'arena', 'schwer');
  await a.expectText('#solo-info', 'Solo · Arena · Schwer');
  await a.expectText('#map-name', 'Arena · Arena');
  await a.expectText('#my-lives', '♥♥♥');
  await a.expectText('#enemy-lives', '♥♥♥');
  await a.expectText('#my-pips', '◇◇');
  assertEqual(await a.text('#my-pips'), '◇◇', 'best-of-3 in the arena');
  // We stand still; the bot hits us once - we survive with two lives.
  await a.page.waitForFunction(
    () =>
      (window as unknown as { gameEvents: { type: string; attacker?: number; hpLeft?: number }[] }).gameEvents.some(
        (e) => e.type === 'hit' && e.attacker === 1 && e.hpLeft === 2,
      ),
    undefined,
    { timeout: 90_000 },
  );
  await a.expectText('#my-lives', '♡');
  await a.screenshot('15-arena-lives');
  const cues = await a.page.evaluate(() => (window as unknown as { gameEffects: { windupCues: number } }).gameEffects.windupCues);
  assert(cues > 0, 'the wind-up cue is on by default in the arena');
  assertEqual((await a.state()).desyncs, 0, 'desyncs');

  // The replay knows the mode: title and lives of both fighters.
  await a.page.keyboard.press('KeyB');
  await a.page.waitForSelector('#replay:not(.killcam)', { state: 'visible' });
  await a.expectText('#replay-title', '· Arena · Arena');
  await a.expectText('#replay-lives', 'Bot Schwer ♥');
  await a.screenshot('16-arena-replay');
  await a.page.keyboard.press('KeyB');
  await a.page.waitForSelector('#replay', { state: 'hidden' });
  noErrors(a);
});

test('Replay und Killcam: ansehen, Pause, Spulen, Kamera, Export, Import, Hash-Prüfung', async (env) => {
  const a = await openOne(env, env.url);
  await startSolo(a, 'arena', 'schwer');
  // We stand still; the bot comes and kills us -> the killcam starts by itself.
  await a.page.waitForSelector('#replay.killcam', { state: 'visible', timeout: 90_000 });
  await a.expectText('#replay-title', 'KILLCAM');
  await a.screenshot('13-killcam');
  await a.page.keyboard.press('KeyX'); // any key skips it
  await a.page.waitForSelector('#replay', { state: 'hidden' });
  assert(await a.page.isVisible('#hud'), 'back in the match after the killcam');

  // Watch the whole match so far.
  await a.page.keyboard.press('KeyB');
  await a.page.waitForSelector('#replay:not(.killcam)', { state: 'visible' });
  await a.expectText('#replay-title', 'Bot Schwer');
  assertEqual(await a.text('#replay-lives'), '', 'no lives display in the duel');
  type ReplayWindow = { gameReplay: { state: { playing: boolean; speed: number; tick: number; sim: { lastTick: number; firstTick: number } } | null } };
  // Copy the values explicitly: `tick` is a getter, which page.evaluate would not transfer.
  const playback = () =>
    a.page.evaluate(() => {
      const s = (window as unknown as ReplayWindow).gameReplay.state;
      return s ? { playing: s.playing, speed: s.speed, tick: s.tick } : null;
    });
  await a.page.keyboard.press('KeyP');
  assertEqual((await playback())!.playing, false, 'paused with P');
  const before = (await playback())!.tick;
  await a.page.keyboard.press('Period');
  assertEqual(Math.round((await playback())!.tick - before), 300, 'spooled 5 s forward');
  await a.page.keyboard.press('Comma');
  assertEqual(Math.round((await playback())!.tick - before), 0, 'spooled 5 s back');
  await a.page.keyboard.press('BracketLeft');
  assertEqual((await playback())!.speed, 0.5, 'slow motion with [');
  await a.page.keyboard.press('KeyC');
  await a.expectText('#replay-camera', 'Spieler 2');
  await a.page.keyboard.press('KeyC');
  await a.expectText('#replay-camera', 'frei');
  await a.screenshot('14-replay');

  // Export: the browser downloads a file that is a valid replay.
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#replay-export')]);
  const path = `${SCREENSHOT_DIR}/test-replay.json`;
  await download.saveAs(path);
  assert(download.suggestedFilename().startsWith('neonklinge-duel-arena-'), `file name ${download.suggestedFilename()}`);
  assert(parseReplay(readFileSync(path, 'utf8')) !== null, 'the downloaded file is a replay');

  // Jump to the end: the viewer checks that the calculated match is identical to the recording.
  await a.page.evaluate(() => {
    const s = (window as unknown as { gameReplay: { state: { seekTo(t: number): void; sim: { lastTick: number } } } }).gameReplay.state;
    s.seekTo(s.sim.lastTick);
  });
  await a.expectText('#replay-check', 'identisch mit der Aufnahme', 20_000);
  await a.page.keyboard.press('KeyB');
  await a.page.waitForSelector('#replay', { state: 'hidden' });
  assert(await a.page.isVisible('#hud'), 'back in the match after closing the replay');

  // Leave, then load the file from the menu.
  await a.page.click('#leave-button');
  await a.page.waitForSelector('#lobby', { state: 'visible' });
  await a.page.setInputFiles('#replay-file', path);
  await a.page.waitForSelector('#replay', { state: 'visible' });
  await a.expectText('#replay-title', 'Arena');
  assert(!(await a.page.isVisible('#lobby')), 'the menu is hidden while watching');
  await a.page.click('#replay-close');
  await a.page.waitForSelector('#lobby', { state: 'visible' });

  // A file that is not a replay is refused with a message.
  const junk = `${SCREENSHOT_DIR}/not-a-replay.json`;
  writeFileSync(junk, '{"hello": 1}');
  await a.page.setInputFiles('#replay-file', junk);
  await a.expectText('#lobby-status', 'kein Neonklinge-Replay');
  noErrors(a);
});

// ---------- runner ----------

const only = process.argv[2]; // optional: run only tests whose name contains this text
const env = await startEnv();
let failed = 0;
console.log(`Browser tests against ${env.url} and the static site ${env.staticUrl}\n`);
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
env.staticSite.close();
console.log(failed === 0 ? '\nRESULT: OK - all browser tests passed.' : `\nRESULT: ${failed} browser test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
