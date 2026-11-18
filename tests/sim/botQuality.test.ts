/**
 * Does the bot behave sensibly? These tests measure typical "the bot is broken" moments
 * that a player notices: falling into the abyss on its own, standing around, never
 * reaching the player. Each one was a real bug once (see STATUS.md).
 */
import { describe, expect, it } from 'vitest';
import { BotBrain, DEFAULT_PERSONALITY } from '../../src/bots/brain';
import { FightHabits, FIGHT_STYLES, isOpen, type FightSituation } from '../../src/bots/brainFight';
import { canStandAt, nearestStandable } from '../../src/bots/nav';
import { totalUsage } from '../../src/bots/report';
import { runSimulatedMatch } from '../../src/bots/simulation';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { createRng } from '../../src/shared/math/rng';
import { directionOf, directionTo, keysFor } from '../../src/bots/steering';
import { Button } from '../../src/shared/input';
import { MAPS } from '../../src/shared/maps';
import { DAECHER } from '../../src/shared/maps/daecher';
import { forwardFromYaw } from '../../src/shared/math/vec3';
import { createPlayer, type PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { DIFFICULTIES, type Difficulty } from '../../src/solo/difficulty';
import { expectHealthy, playMatch } from '../soloHelpers';
import { DUEL } from '../../src/shared/match/gameModes';
import { MODE_TACTICS } from '../../src/bots/modeTactics';

const LEVELS = Object.keys(DIFFICULTIES) as Difficulty[];
const cases = Object.keys(MAPS).flatMap((mapId) => LEVELS.map((difficulty) => ({ mapId, difficulty })));

describe('bot against a player who just stands there', () => {
  it.each(cases)('$mapId / $difficulty: reaches the player every round, never falls, never stands around', ({ mapId, difficulty }) => {
    for (const seed of [1, 2, 3]) {
      const run = playMatch({ mapId, difficulty, seed, human: 'idle' });
      const b = run.behavior;
      expect(b.botFalls, `seed ${seed}: bot fell into the abyss`).toBe(0);
      expect(b.botKills, `seed ${seed}: every round must end with a sword kill`).toBe(b.rounds);
      // 3 s: the easy bot turns slowly, so lining up for a parkour link takes it up to ~2 s.
      expect(b.longestStandstillSec, `seed ${seed}: bot stood around`).toBeLessThan(3);
      expectHealthy(run);
    }
  });
});

describe('bot against a player who fights back', () => {
  it.each(Object.keys(MAPS))('%s: no standoff - nobody stands around for long (cover between the fighters)', (mapId) => {
    for (const difficulty of ['mittel', 'schwer'] as Difficulty[]) {
      for (const seed of [1, 2, 3, 4]) {
        const run = playMatch({ mapId, difficulty, seed, human: 'fights' });
        expect(run.behavior.longestStandstillSec, `${difficulty}, seed ${seed}`).toBeLessThan(3);
        expect(run.behavior.botFalls, `${difficulty}, seed ${seed}: bot falls`).toBeLessThanOrEqual(1);
        expectHealthy(run);
      }
    }
  });
});

describe('bot brain details', () => {
  it('does not think it is stuck while frozen in the countdown (it used to jump at round start)', () => {
    const map = MAPS.daecher;
    const brain = new BotBrain(1, { ...DEFAULT_PERSONALITY, jumpChance: 0, dashChance: 0 });
    const me = createPlayer(1, map.spawns[1]);
    const enemy = createPlayer(0, map.spawns[0]);
    stepPlayer(me, { seq: 1, moveX: 0, moveZ: 0, yaw: me.yaw, pitch: 0, buttons: 0, viewTick: 0 }, map, 'playing', DUEL);
    for (let tick = 0; tick < 400; tick++) brain.think(me, enemy, map, false); // a long countdown
    // 1.5 s: later the bot may really jump (since the faster sprint it reaches a parkour link in ~2 s).
    for (let tick = 0; tick < 90; tick++) {
      const sample = brain.think(me, enemy, map, true);
      expect(sample.buttons & Button.Jump, `jumped at tick ${tick} after the countdown`).toBe(0);
      stepPlayer(me, { ...sample, seq: tick + 2, viewTick: 0 }, map, 'playing', DUEL);
    }
    expect(me.pos.y).toBeGreaterThan(map.killY);
  });

  it('finds the way back from the very edge of a platform', () => {
    // On the rim of roof M nothing counts as "safe to stand" - there must still be a way back.
    const edge = { x: -4.95, y: 0, z: 0 };
    expect(canStandAt(DAECHER, edge.x, edge.z, edge.y)).toBe(false);
    const safe = nearestStandable(DAECHER, edge);
    expect(safe).not.toBeNull();
    expect(canStandAt(DAECHER, safe!.x, safe!.z, safe!.y)).toBe(true);
    expect(nearestStandable(DAECHER, { x: 0, y: 0, z: 40 })).toBeNull(); // far out in the void
  });
});

describe('steering: walking somewhere while looking somewhere else', () => {
  it('picks the keys that move toward the wanted direction for any view direction', () => {
    for (let yaw = -3; yaw <= 3; yaw += 0.37) {
      for (let angle = 0; angle < 6.28; angle += 0.41) {
        const wanted = { x: Math.cos(angle), z: Math.sin(angle) };
        const actual = directionOf(keysFor(wanted, yaw), yaw)!;
        // Keys allow 8 directions, so at most 22.5 degrees off: cos(22.5°) = 0.92.
        expect(actual.x * wanted.x + actual.z * wanted.z).toBeGreaterThan(0.92);
      }
    }
  });

  it('walks forward when looking at the goal and backward when looking away', () => {
    const forward = forwardFromYaw(1.2);
    expect(keysFor(forward, 1.2)).toEqual({ moveX: 0, moveZ: 1 });
    expect(keysFor({ x: -forward.x, z: -forward.z }, 1.2)).toEqual({ moveX: 0, moveZ: -1 });
    expect(keysFor(null, 1.2)).toEqual({ moveX: 0, moveZ: 0 });
    expect(directionTo({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    expect(directionTo({ x: 0, z: 0 }, { x: 3, z: 4 })).toEqual({ x: 0.6, z: 0.8 });
  });
});

describe('fight habits: the bot reacts like a fighter, not like a dice', () => {
  const light = WEAPONS.sword.attacks.light;

  /** Two fighters 2 m apart, looking at each other. */
  function situation(
    change: (enemy: ReturnType<typeof createPlayer>, me: ReturnType<typeof createPlayer>) => void = () => {},
    tactics = MODE_TACTICS.duel,
  ): FightSituation {
    const me = createPlayer(0, { pos: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 2 });
    const enemy = createPlayer(1, { pos: { x: 2, y: 0, z: 0 }, yaw: Math.PI / 2 });
    me.grounded = enemy.grounded = true;
    change(enemy, me);
    return { me, enemy, distance: 2, aimError: 0, pathIsSafe: () => true, tactics };
  }
  const habits = (overrides: Partial<typeof DEFAULT_PERSONALITY>) => {
    const h = new FightHabits(createRng(3), { ...DEFAULT_PERSONALITY, ...overrides });
    h.style = { name: 'counter', attack: 1, parry: 1, block: 0, dodge: 1 }; // neutral style for exact chances
    return h;
  };

  it('knows when an opponent cannot defend itself', () => {
    expect(isOpen(situation().enemy)).toBe(false);
    expect(isOpen(situation((e) => (e.action = 'stunned')).enemy)).toBe(true);
    const winding = situation((e) => { e.action = 'attack'; e.actionTicks = 2; }).enemy;
    const recovering = situation((e) => { e.action = 'attack'; e.actionTicks = light.startupTicks + light.activeTicks + 1; }).enemy;
    expect(isOpen(winding)).toBe(false);
    expect(isOpen(recovering)).toBe(true);
  });

  it('punishes a stunned opponent at once, even if it normally hesitates', () => {
    const h = habits({ attackChance: 0, punishChance: 1 });
    expect(h.decide(situation()).buttons & Button.Attack).toBe(0); // no opening: it waits
    expect(h.decide(situation((e) => (e.action = 'stunned'))).buttons & Button.Attack).toBe(Button.Attack);
    expect(h.stats.punishes).toBe(1);
  });

  it('answers a swing only after its reaction time', () => {
    const reactionTicks = 8;
    const h = habits({ attackChance: 0, parryChance: 1, reactionTicks });
    // The blade is about to land (a planned parry is pressed only then, see the test below).
    const swing = situation((e) => ((e.action = 'attack'), (e.actionTicks = light.startupTicks - 5)));
    for (let tick = 0; tick < reactionTicks; tick++) expect(h.decide(swing).buttons, `tick ${tick}`).toBe(0);
    expect(h.decide(swing).buttons).toBe(Button.Parry);
    expect(h.decide(swing).buttons).toBe(0); // one answer per swing
  });

  it('a slow bot reacts too late to parry in time, a fast one does not', () => {
    // The parry must start before the blade lands (lag compensation gives no extra time here).
    expect(habits({ reactionTicks: 16 })['personality'].reactionTicks).toBeGreaterThan(light.startupTicks);
    expect(habits({ reactionTicks: 3 })['personality'].reactionTicks).toBeLessThan(light.startupTicks);
  });

  it('the parry window is shorter than a wind-up, so the bot waits until the blade is about to land', () => {
    expect(COMBAT.parryWindowTicks).toBeLessThan(light.startupTicks);
    const h = habits({ attackChance: 0, parryChance: 1, blockChance: 0, reactionTicks: 0 });
    const early = h.decide(situation((e) => ((e.action = 'attack'), (e.actionTicks = 1))));
    expect(early.buttons & Button.Parry).toBe(0); // decided, but too early to press
    const due = h.decide(situation((e) => ((e.action = 'attack'), (e.actionTicks = light.startupTicks - 5))));
    expect(due.buttons & Button.Parry).toBe(Button.Parry);
  });

  it('blocks by pressing and HOLDING the guard key until the swing is over', () => {
    const h = habits({ attackChance: 0, parryChance: 0, blockChance: 1, dodgeChance: 0, reactionTicks: 0 });
    h.style = { ...h.style, block: 1 };
    const plan = h.decide(situation((e) => (e.action = 'attack')));
    expect(plan.buttons & Button.Parry).toBe(Button.Parry);
    expect(plan.holdTicks).toBeGreaterThan(light.startupTicks);
    expect(h.stats.blocks).toBe(1);
  });

  it('does not block with an almost broken posture', () => {
    const h = habits({ attackChance: 0, parryChance: 0, blockChance: 1, dodgeChance: 0, reactionTicks: 0 });
    h.style = { ...h.style, block: 1 };
    const plan = h.decide(situation((e, me) => ((e.action = 'attack'), (me.posture = COMBAT.postureMax * 0.8))));
    expect(plan.buttons).toBe(0);
  });

  it('dodges instead of parrying when its style says so', () => {
    const h = habits({ attackChance: 0, parryChance: 0, dodgeChance: 1, reactionTicks: 0 });
    const plan = h.decide(situation((e) => (e.action = 'attack')));
    expect(plan).toEqual({ buttons: 0, dodge: true });
    expect(h.stats.dodges).toBe(1);
  });

  it('picks one of the fighting styles every round', () => {
    const h = habits({});
    const seen = new Set<string>();
    for (let round = 0; round < 40; round++) {
      h.newRound();
      seen.add(h.style.name);
    }
    expect([...seen].sort()).toEqual(FIGHT_STYLES.map((style) => style.name).sort());
  });

  it('in whole matches the bots really punish and dodge', () => {
    // 16 matches: since the faster sprint (flow update) there are fewer chances per match.
    const reports = Array.from({ length: 16 }, (_, i) => i + 1).map((seed) =>
      runSimulatedMatch({ seed, mapId: seed % 2 ? 'schlucht' : 'arena', latencyMs: 30 }),
    );
    const usage = totalUsage(reports);
    expect(usage.punishes).toBeGreaterThan(3);
    expect(usage.dodges).toBeGreaterThan(3);
  });
});

describe('fight tactics per game mode', () => {
  const arena = MODE_TACTICS.arena;
  const light = WEAPONS.sword.attacks.light;
  function situation(change: (enemy: PlayerState, me: PlayerState) => void, tactics = arena): FightSituation {
    const me = createPlayer(0, { pos: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 2 });
    const enemy = createPlayer(1, { pos: { x: 2, y: 0, z: 0 }, yaw: Math.PI / 2 });
    me.grounded = enemy.grounded = true;
    change(enemy, me);
    return { me, enemy, distance: 2, aimError: 0, pathIsSafe: () => true, tactics };
  }
  const eagerHabits = () => {
    const h = new FightHabits(createRng(3), { ...DEFAULT_PERSONALITY, attackChance: 1, punishChance: 1, parryChance: 1 });
    h.style = { name: 'counter', attack: 1, parry: 1, block: 0, dodge: 1 };
    return h;
  };

  it('the duel tactics are neutral (duel bots behave as before the modes)', () => {
    const duel = MODE_TACTICS.duel;
    expect([duel.parry, duel.dodge, duel.dashAttack]).toEqual([1, 1, 1]);
    expect([duel.waitOutInvulnerability, duel.pressWhileInvulnerable, duel.useCounter]).toEqual([false, false, false]);
  });

  it('arena: does not swing at an enemy that cannot be hit, but does once it can', () => {
    const h = eagerHabits();
    expect(h.decide(situation((e) => (e.invulnerableTicks = 40))).buttons & Button.Attack).toBe(0);
    expect(h.decide(situation((e) => (e.invulnerableTicks = light.startupTicks))).buttons & Button.Attack).toBe(Button.Attack);
  });

  it('duel: invulnerability does not exist, so it is ignored', () => {
    const h = eagerHabits();
    const s = situation((e) => (e.invulnerableTicks = 40), MODE_TACTICS.duel);
    expect(h.decide(s).buttons & Button.Attack).toBe(Button.Attack);
  });

  it('arena: uses its parry counter like a free hit', () => {
    const h = new FightHabits(createRng(3), { ...DEFAULT_PERSONALITY, attackChance: 0, punishChance: 1 });
    h.style = { name: 'counter', attack: 1, parry: 1, block: 0, dodge: 1 };
    expect(h.decide(situation(() => {})).buttons & Button.Attack).toBe(0);
    expect(h.decide(situation((_e, me) => (me.counterTicks = 30))).buttons & Button.Attack).toBe(Button.Attack);
  });

  it('arena: does not bother to parry while it cannot be hit itself', () => {
    const swinging = (invulnerable: number) =>
      situation((e, me) => {
        e.action = 'attack';
        e.actionTicks = light.startupTicks - 5; // the blade is about to land
        me.invulnerableTicks = invulnerable;
      });
    const h = new FightHabits(createRng(3), { ...DEFAULT_PERSONALITY, attackChance: 0, parryChance: 1, reactionTicks: 0 });
    h.style = { name: 'counter', attack: 1, parry: 1, block: 0, dodge: 1 };
    expect(h.decide(swinging(40)).buttons & Button.Parry).toBe(0);
    const fresh = new FightHabits(createRng(3), { ...DEFAULT_PERSONALITY, attackChance: 0, parryChance: 1, reactionTicks: 0 });
    fresh.style = h.style;
    expect(fresh.decide(swinging(0)).buttons & Button.Parry).toBe(Button.Parry);
  });

  it('arena: parries more and dodges less than in the duel', () => {
    expect(arena.parry).toBeGreaterThan(1);
    expect(arena.dodge).toBeLessThan(1);
  });
});
