/**
 * Lag compensation: hits are checked where the attacker SAW the target, and a parry
 * counts if the defender pressed it before it SAW the hit land.
 */
import { describe, expect, it } from 'vitest';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import { effectiveViewTick, positionAt } from '../../src/shared/combat/lagCompensation';
import { WEAPONS } from '../../src/shared/combat/weapons';
import type { GameEvent } from '../../src/shared/sim/events';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import type { WorldState } from '../../src/shared/sim/world';
import { Button, hold, playingWorld, runWorld, TEST_CTX } from '../helpers';

const light = WEAPONS.sword.attacks.light;
const YAW_PLUS_X = -Math.PI / 2;

/** A world in which the target (slot 1) has been running away along +X for a while. */
function worldWithFleeingTarget(): WorldState {
  const world = playingWorld();
  const [a, b] = world.players;
  runWorld(world, { 0: hold(a), 1: hold(b, { yaw: YAW_PLUS_X, moveZ: 1 }) }, 12);
  return world;
}

describe('position history', () => {
  it('remembers where a player was and blends between ticks', () => {
    const world = worldWithFleeingTarget();
    const now = world.players[1].pos.x;
    const before = positionAt(world, 1, world.tick - 6)!.x;
    const between = positionAt(world, 1, world.tick - 5.5)!.x;
    const after = positionAt(world, 1, world.tick - 5)!.x;
    expect(before).toBeLessThan(now - 0.5);
    expect(between).toBeCloseTo((before + after) / 2, 6);
    expect(positionAt(world, 1, world.tick)!.x).toBe(now);
    expect(positionAt(world, 1, world.tick + 99)!.x).toBe(now); // the future = now
  });

  it('keeps only as much history as the rewind window needs', () => {
    const world = playingWorld();
    runWorld(world, {}, 200);
    expect(world.history.length).toBeLessThanOrEqual(COMBAT.maxRewindTicks + 2);
    expect(world.history.at(-1)!.tick).toBe(world.tick);
  });

  it('limits how far a client may look back', () => {
    const world = playingWorld();
    runWorld(world, {}, 100);
    expect(effectiveViewTick(world, 0)).toBe(world.tick); // unknown = no rewind
    expect(effectiveViewTick(world, world.tick - 5)).toBe(world.tick - 5);
    expect(effectiveViewTick(world, 1)).toBe(world.tick - COMBAT.maxRewindTicks);
    expect(effectiveViewTick(world, world.tick + 50)).toBe(world.tick);
  });
});

describe('lag-compensated hits', () => {
  /**
   * Slot 1 starts to run away in the moment slot 0 starts its swing. When the blade is
   * active, slot 1 is already out of reach - but slot 0, who sees the world `viewDelay`
   * ticks late, still sees it standing in range.
   */
  function swingAtFleeingTarget(viewDelay: number | null): GameEvent[] {
    const world = playingWorld();
    const [a, b] = world.players;
    runWorld(world, { 0: hold(a), 1: hold(b) }, 40); // stand still for a while (fills the history)
    const events: GameEvent[] = [];
    for (let tick = 0; tick < light.startupTicks + light.activeTicks + 2; tick++) {
      const viewTick = viewDelay === null ? 0 : Math.max(1, world.tick + 1 - viewDelay);
      events.push(
        ...stepWorld(
          world,
          {
            0: hold(a, { buttons: tick === 0 ? Button.Attack : 0, viewTick }),
            1: hold(b, { yaw: YAW_PLUS_X, moveZ: 1 }),
          },
          TEST_CTX,
        ).events,
      );
    }
    return events;
  }

  it('without lag compensation the swing misses a target that has run out of range', () => {
    expect(swingAtFleeingTarget(null).some((e) => e.type === 'hit')).toBe(false);
  });

  it('hits where the attacker SAW the target (12 ticks = 200 ms in the past)', () => {
    expect(swingAtFleeingTarget(light.startupTicks).some((e) => e.type === 'hit')).toBe(true);
  });

  it('does not rewind further than the allowed window', () => {
    const huge = swingAtFleeingTarget(500);
    const atLimit = swingAtFleeingTarget(COMBAT.maxRewindTicks);
    expect(huge).toEqual(atLimit);
  });
});

describe('lag-compensated parry', () => {
  /**
   * Slot 0 swings at tick 0. Slot 1 sees everything `viewDelay` ticks late and presses
   * parry at `parryAt`. Returns the events and the tick at which the swing was decided.
   */
  function swingAgainstLaggedDefender(viewDelay: number, parryAt: number) {
    const world = playingWorld();
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    let decidedAt = -1;
    for (let tick = 0; tick < 60 && world.match.phase === 'playing'; tick++) {
      const result = stepWorld(
        world,
        {
          0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }),
          1: hold(b, { buttons: tick === parryAt ? Button.Parry : 0, viewTick: Math.max(1, world.tick + 1 - viewDelay) }),
        },
        TEST_CTX,
      );
      events.push(...result.events);
      if (decidedAt < 0 && result.events.some((e) => e.type === 'hit' || e.type === 'parry')) decidedAt = tick;
    }
    return { events, decidedAt };
  }

  const HIT_TICK = light.startupTicks; // server tick (after the press) at which the swing connects
  const DELAY = 12; // the defender sees the world 200 ms late

  it('a hit is decided only when the defender has seen it', () => {
    const { events, decidedAt } = swingAgainstLaggedDefender(DELAY, 999);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(decidedAt).toBe(HIT_TICK + DELAY);
  });

  it('a parry pressed before the defender SAW the hit still blocks it', () => {
    // On the server the swing connected at HIT_TICK; the parry arrives 8 ticks "too late".
    const { events } = swingAgainstLaggedDefender(DELAY, HIT_TICK + 8);
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('a parry pressed after the defender saw the hit is too late', () => {
    const { events } = swingAgainstLaggedDefender(DELAY, HIT_TICK + DELAY + 1);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
    expect(events.some((e) => e.type === 'parry')).toBe(false);
  });

  it('never waits longer than the rewind window, however large the claimed lag', () => {
    const { decidedAt } = swingAgainstLaggedDefender(500, 999);
    expect(decidedAt).toBe(HIT_TICK + COMBAT.maxRewindTicks);
  });

  it('simultaneous swings of a lagging and a non-lagging player clash - lag gives no kill', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < 60 && world.match.phase === 'playing'; tick++) {
      const press = tick === 0 ? Button.Attack : 0;
      // Slot 0 has no lag, slot 1 sees everything 12 ticks late. Both swing at the same time.
      const inputs = { 0: hold(a, { buttons: press }), 1: hold(b, { buttons: press, viewTick: Math.max(1, world.tick + 1 - DELAY) }) };
      events.push(...stepWorld(world, inputs, TEST_CTX).events);
    }
    expect(events.filter((e) => e.type === 'clash')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'death')).toHaveLength(0);
    expect(world.pendingHits).toEqual([]);
    expect(world.match.scores).toEqual([0, 0]);
  });

  it('a real trade (second swing clearly later, but before the first hit is seen) is a draw', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const second = COMBAT.clashWindowTicks + 2; // too late for a clash
    const events: GameEvent[] = [];
    for (let tick = 0; tick < 80 && world.match.phase === 'playing'; tick++) {
      // Slot 0 sees the world 18 ticks late, so its death is decided late enough for its own swing to land.
      const inputs = {
        0: hold(a, { buttons: tick === second ? Button.Attack : 0, viewTick: Math.max(1, world.tick + 1 - COMBAT.maxRewindTicks) }),
        1: hold(b, { buttons: tick === 0 ? Button.Attack : 0 }),
      };
      events.push(...stepWorld(world, inputs, TEST_CTX).events);
    }
    expect(events.filter((e) => e.type === 'death')).toHaveLength(2);
    expect(world.match.roundWinner).toBe(-1);
  });

  it('undecided hits are thrown away when the next round starts', () => {
    const world = playingWorld();
    world.pendingHits.push({ attacker: 0, target: 1, tick: world.tick, kind: 'light' });
    world.players[1].pos.y = TEST_CTX.map.killY - 1; // slot 1 falls to its death
    runWorld(world, {}, 200);
    expect(world.pendingHits).toEqual([]);
    expect(world.match.round).toBeGreaterThan(1);
  });
});
