/**
 * Helpers for tests of the solo mode and of the bots' behavior: run a SoloMatch tick by
 * tick with a scripted "human" and measure what the bot does.
 */
import { expect } from 'vitest';
import { BotBrain, DEFAULT_PERSONALITY } from '../src/bots/brain';
import type { GameClient } from '../src/netcode/gameClient';
import { TICK_MS, TICK_RATE } from '../src/shared/config';
import type { InputSample } from '../src/shared/input';
import { FAST_MATCH_CONFIG, type MatchConfig } from '../src/shared/match/matchConfig';
import type { GameEvent } from '../src/shared/sim/events';
import type { PlayerState } from '../src/shared/sim/playerState';
import { phaseAllowsAction } from '../src/shared/sim/world';
import type { Difficulty } from '../src/solo/difficulty';
import { SoloMatch } from '../src/solo/soloMatch';

/** Short timers, but rematch only by vote - like the real rules. */
export const QUICK_RULES: MatchConfig = { ...FAST_MATCH_CONFIG, matchEndTicks: 0 };

/**
 * How the human side is played in a test:
 *   idle   - stands still
 *   fights - steered by a second bot brain (default personality)
 *   or a function that returns the input for each tick
 */
export type HumanScript = 'idle' | 'fights' | ((me: PlayerState, enemy: PlayerState | null, tick: number) => InputSample);

export interface SoloRunOptions {
  difficulty?: Difficulty;
  mapId?: string;
  seed?: number;
  human?: HumanScript;
  rules?: MatchConfig;
}

/** What the bot did during a run (see `measure`). */
export interface BotBehavior {
  rounds: number;
  /** Rounds in which the bot killed the human with its sword. */
  botKills: number;
  humanKills: number;
  /** How often the bot fell into the abyss. */
  botFalls: number;
  humanFalls: number;
  clashes: number;
  parriesByBot: number;
  /** Longest time the bot stood still while the human was more than 4 m away, in seconds. */
  longestStandstillSec: number;
}

export interface SoloRun {
  solo: SoloMatch;
  events: GameEvent[];
  behavior: BotBehavior;
  /** Advance the match by one tick (human input, then server + bot). */
  tick: () => void;
  /** Tick until `done()` is true; fails after `maxTicks`. */
  runUntil: (what: string, done: () => boolean, maxTicks?: number) => void;
  phase: () => string | undefined;
}

/** Steers a GameClient like a human would - with a bot brain, a script, or not at all. */
function pilot(client: GameClient, script: HumanScript, brain: BotBrain | null, tick: number): void {
  client.renderClock.advance(TICK_MS);
  const me = client.localPlayer;
  if (!me || !client.map || script === 'idle') {
    client.tick({ moveX: 0, moveZ: 0, yaw: me?.yaw ?? 0, pitch: 0, buttons: 0 });
    return;
  }
  const enemySlot = client.opponent?.slot;
  const enemy = enemySlot === undefined ? null : (client.sampleRemote(enemySlot) ?? client.opponent);
  if (typeof script === 'function') return client.tick(script(me, enemy, tick));
  const canAct = me.alive && phaseAllowsAction(client.snapshot?.match.phase ?? 'waiting');
  client.tick(brain!.think(me, enemy, client.map, canAct));
}

function countEvent(behavior: BotBehavior, event: GameEvent): void {
  if (event.type === 'roundEnd') behavior.rounds++;
  if (event.type === 'death' && event.cause === 'fall') event.slot === 1 ? behavior.botFalls++ : behavior.humanFalls++;
  if (event.type === 'hit' && event.hpLeft === 0) event.attacker === 1 ? behavior.botKills++ : behavior.humanKills++;
  if (event.type === 'parry' && event.defender === 1) behavior.parriesByBot++;
  if (event.type === 'clash') behavior.clashes++;
}

export function startSolo(options: SoloRunOptions = {}): SoloRun {
  const seed = options.seed ?? 1;
  const human = options.human ?? 'idle';
  const solo = new SoloMatch({
    playerName: 'Mika',
    mapId: options.mapId ?? 'schlucht',
    difficulty: options.difficulty ?? 'mittel',
    seed,
    matchConfig: options.rules ?? QUICK_RULES,
  });
  const events: GameEvent[] = [];
  const behavior: BotBehavior = {
    rounds: 0, botKills: 0, humanKills: 0, botFalls: 0, humanFalls: 0, clashes: 0, parriesByBot: 0, longestStandstillSec: 0,
  };
  solo.client.onGameEvent = (event) => {
    events.push(event);
    countEvent(behavior, event);
  };
  solo.start();
  const brain = human === 'fights' ? new BotBrain(seed + 1000, DEFAULT_PERSONALITY) : null;
  let ticks = 0;
  let standing = 0;

  const tick = () => {
    pilot(solo.client, human, brain, ticks++);
    solo.step();
    // Measure standing around: only while the round runs and both are alive.
    const snapshot = solo.client.snapshot;
    const bot = snapshot?.players.find((p) => p.slot === 1);
    const me = snapshot?.players.find((p) => p.slot === 0);
    const active = snapshot?.match.phase === 'playing' && bot && me && bot.alive && me.alive;
    const far = active && Math.hypot(bot.pos.x - me.pos.x, bot.pos.z - me.pos.z) > 4;
    standing = far && bot.grounded && Math.hypot(bot.vel.x, bot.vel.z) < 0.5 ? standing + 1 : 0;
    behavior.longestStandstillSec = Math.max(behavior.longestStandstillSec, standing / TICK_RATE);
  };
  const runUntil = (what: string, done: () => boolean, maxTicks = 60 * 240) => {
    for (let i = 0; i < maxTicks && !done(); i++) tick();
    expect(done(), `never happened: ${what}`).toBe(true);
  };
  return { solo, events, behavior, tick, runUntil, phase: () => solo.client.snapshot?.match.phase };
}

/** Play a whole match and return what the bot did. */
export function playMatch(options: SoloRunOptions): SoloRun {
  const run = startSolo(options);
  run.runUntil('match end', () => run.phase() === 'matchEnd');
  return run;
}

/** Nothing went wrong anywhere: no desync, no error, no rejected message. */
export function expectHealthy({ solo }: SoloRun): void {
  expect(solo.client.stats.desyncs, solo.client.stats.desyncDetails[0]).toBe(0);
  expect(solo.bot.client.stats.desyncs, solo.bot.client.stats.desyncDetails[0]).toBe(0);
  expect(solo.client.stats.serverErrors).toEqual([]);
  expect(solo.bot.errors).toEqual([]);
  expect(solo.server.stats().errors).toBe(0);
  expect(solo.server.stats().badMessages).toBe(0);
}
