import { describe, expect, it } from 'vitest';
import { isAttackActive, isParryActive } from '../../src/shared/combat/actions';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import { isInMeleeRange } from '../../src/shared/combat/hitDetection';
import { attackTotalTicks, WEAPONS } from '../../src/shared/combat/weapons';
import { MOVE } from '../../src/shared/movement/movementConfig';
import type { GameEvent } from '../../src/shared/sim/events';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import type { WorldState } from '../../src/shared/sim/world';
import { Button, hold, playingWorld, runWorld, standingPlayer, TEST_CTX } from '../helpers';
import { DUEL } from '../../src/shared/match/gameModes';

const sword = WEAPONS.sword;
const light = sword.attacks.light;
const dash = sword.attacks.dash;

/**
 * Player 0 presses attack once; returns all events until the swing is over
 * (or until the round ends, because the next round would reset both players).
 */
function swing(world: WorldState, defenderButtons = 0, defenderDelay = 0): GameEvent[] {
  const [a, b] = world.players;
  const events: GameEvent[] = [];
  for (let tick = 0; tick < attackTotalTicks(light) + 2 && world.match.phase === 'playing'; tick++) {
    const result = stepWorld(
      world,
      {
        0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }),
        1: hold(b, { buttons: tick >= defenderDelay ? defenderButtons : 0 }),
      },
      TEST_CTX,
    );
    events.push(...result.events);
  }
  return events;
}

/** Ticks after the attack press at which a parry press still blocks the light swing. */
const GOOD_PARRY_DELAY = light.startupTicks - 4;

describe('weapon data', () => {
  it('in the duel every attack is a one-hit kill (Ghostrunner rule)', () => {
    expect(Object.keys(DUEL.damage).sort()).toEqual(Object.keys(WEAPONS.sword.attacks).sort());
    for (const damage of Object.values(DUEL.damage)) expect(damage).toBeGreaterThanOrEqual(DUEL.lives);
  });

  it('the dash attack reaches further but recovers slower than the normal swing', () => {
    expect(dash.range).toBeGreaterThan(light.range);
    expect(dash.startupTicks).toBeLessThan(light.startupTicks);
    expect(dash.recoveryTicks).toBeGreaterThan(light.recoveryTicks);
  });
});

describe('attack state machine', () => {
  it('goes through startup, active and recovery, then back to idle', () => {
    const world = playingWorld();
    const a = world.players[0];
    world.players[1].pos.x = 15; // far away, nothing to hit

    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('attack');
    expect(a.attackKind).toBe('light');
    expect(isAttackActive(a)).toBe(false); // startup

    runWorld(world, { 0: hold(a) }, light.startupTicks);
    expect(isAttackActive(a)).toBe(true);

    runWorld(world, { 0: hold(a) }, light.activeTicks);
    expect(a.action).toBe('attack');
    expect(isAttackActive(a)).toBe(false); // recovery

    runWorld(world, { 0: hold(a) }, light.recoveryTicks);
    expect(a.action).toBe('idle');
  });

  it('cannot start a new action during a swing', () => {
    const world = playingWorld();
    const a = world.players[0];
    world.players[1].pos.x = 15;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    stepWorld(world, { 0: hold(a) }, TEST_CTX);
    stepWorld(world, { 0: hold(a, { buttons: Button.Parry }) }, TEST_CTX);
    expect(a.action).toBe('attack');
  });

  it('after a swing the attack is on cooldown for a moment', () => {
    const world = playingWorld();
    const a = world.players[0];
    world.players[1].pos.x = 15;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    runWorld(world, { 0: hold(a) }, attackTotalTicks(light));
    expect(a.action).toBe('idle');
    expect(a.attackCooldown).toBe(sword.cooldownTicks);

    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('idle'); // still cooling down
    runWorld(world, { 0: hold(a) }, sword.cooldownTicks);
    expect(a.attackCooldown).toBe(0);
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('attack');
  });
});

describe('hit detection', () => {
  it('hits a target in front within range', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2); // looks toward +X
    const t = standingPlayer(2, 0);
    expect(isInMeleeRange(a, t, light)).toBe(true);
  });

  it('misses a target that is too far away', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    const t = standingPlayer(light.range + 1, 0);
    expect(isInMeleeRange(a, t, light)).toBe(false);
  });

  it('misses a target behind or beside the attacker', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    expect(isInMeleeRange(a, standingPlayer(-2, 0), light)).toBe(false);
    expect(isInMeleeRange(a, standingPlayer(0, 2), light)).toBe(false);
  });

  it('misses a target far above', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    const t = standingPlayer(2, 0);
    t.pos.y = light.verticalReach + 0.5;
    expect(isInMeleeRange(a, t, light)).toBe(false);
  });
});

describe('hits (one hit kills)', () => {
  it('a swing kills the target with exactly one hit and ends the round', () => {
    const world = playingWorld();
    const events = swing(world);
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(events).toContainEqual({ type: 'death', slot: 1, cause: 'hp' });
    expect(world.players[1].hp).toBe(0);
    expect(world.players[1].alive).toBe(false);
    expect(world.players[0].alive).toBe(true);
    expect(world.match.scores).toEqual([1, 0]);
  });

  it('the target is reported as disturbed when it gets hit', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    const results = runWorld(world, { 0: hold(a), 1: hold(b) }, light.startupTicks + 1);
    const hitTick = results.find((r) => r.events.some((e) => e.type === 'hit'));
    expect(hitTick).toBeDefined();
    expect(hitTick!.disturbed).toContain(1);
  });
});

describe('parry', () => {
  it('a parry during the window blocks the hit, stuns and pushes back the attacker', () => {
    const world = playingWorld();
    const events = swing(world, Button.Parry, GOOD_PARRY_DELAY);
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(world.players[1].hp).toBe(DUEL.lives);
    expect(world.players[1].alive).toBe(true);
    expect(world.players[0].action).toBe('stunned');
    expect(world.players[0].pos.x).toBeLessThan(-1); // pushed away from the defender
  });

  it('after a successful parry the defender can strike back immediately', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    for (let tick = 0; tick < light.startupTicks + 1; tick++) {
      stepWorld(
        world,
        {
          0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }),
          1: hold(b, { buttons: tick === GOOD_PARRY_DELAY ? Button.Parry : 0 }),
        },
        TEST_CTX,
      );
    }
    expect(a.action).toBe('stunned');
    expect(b.action).toBe('idle');
    expect(b.parryCooldown).toBe(0);
    // Riposte: the stunned attacker cannot parry or get away in time.
    stepWorld(world, { 0: hold(a), 1: hold(b, { buttons: Button.Attack }) }, TEST_CTX);
    runWorld(world, { 0: hold(a, { buttons: Button.Parry }), 1: hold(b) }, light.startupTicks + 2);
    expect(a.alive).toBe(false);
    expect(world.match.scores).toEqual([0, 1]);
  });

  it('a parry that is too early does not block', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    // The defender taps parry, then the window is over before the attack comes.
    // (Holding the key would be a block - see posture.test.ts.)
    stepWorld(world, { 0: hold(a), 1: hold(b, { buttons: Button.Parry }) }, TEST_CTX);
    runWorld(world, { 0: hold(a), 1: hold(b) }, COMBAT.parryWindowTicks);
    expect(isParryActive(b)).toBe(false);
    expect(b.action).toBe('idle');
    const events = swing(world);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('a parry does not block when facing away from the attacker', () => {
    const world = playingWorld();
    world.players[1].yaw = -Math.PI / 2; // defender looks away (+X)
    const events = swing(world, Button.Parry, GOOD_PARRY_DELAY);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('mashing does not parry: a second press within the cooldown only blocks', () => {
    const world = playingWorld();
    const b = world.players[1];
    stepWorld(world, { 1: hold(b, { buttons: Button.Parry }) }, TEST_CTX);
    expect(isParryActive(b)).toBe(true);
    runWorld(world, { 1: hold(b) }, COMBAT.parryWindowTicks);
    expect(b.action).toBe('idle'); // a tap ends after its window
    stepWorld(world, { 1: hold(b, { buttons: Button.Parry }) }, TEST_CTX);
    expect(b.action).toBe('guard');
    expect(isParryActive(b)).toBe(false); // too soon: block only
    runWorld(world, { 1: hold(b) }, COMBAT.parryCooldownTicks);
    stepWorld(world, { 1: hold(b, { buttons: Button.Parry }) }, TEST_CTX);
    expect(isParryActive(b)).toBe(true);
  });

  it('the stun ends after the configured time', () => {
    const world = playingWorld();
    swing(world, Button.Parry, GOOD_PARRY_DELAY);
    const a = world.players[0];
    expect(a.action).toBe('stunned');
    runWorld(world, { 0: hold(a) }, COMBAT.parryStunTicks);
    expect(a.action).toBe('idle');
  });

  it('a stunned player can neither attack nor dash', () => {
    const world = playingWorld();
    swing(world, Button.Parry, GOOD_PARRY_DELAY);
    const a = world.players[0];
    expect(a.action).toBe('stunned');
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack | Button.Dash }) }, TEST_CTX);
    expect(a.action).toBe('stunned');
    expect(a.dashTicks).toBe(0);
  });
});

describe('dash attack', () => {
  /** Moves the defender `distance` meters in front of the attacker (attacker at x = -1). */
  function worldWithGap(distance: number): WorldState {
    const world = playingWorld();
    world.players[1].pos.x = world.players[0].pos.x + distance;
    return world;
  }

  it('attacking while dashing starts the dash attack profile', () => {
    const world = worldWithGap(15);
    const a = world.players[0];
    stepWorld(world, { 0: hold(a, { buttons: Button.Dash }) }, TEST_CTX);
    stepWorld(world, { 0: hold(a, { buttons: Button.Dash | Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('attack');
    expect(a.attackKind).toBe('dash');
  });

  it('pressing dash and attack in the same tick is a dash attack too', () => {
    const world = worldWithGap(15);
    const a = world.players[0];
    stepWorld(world, { 0: hold(a, { buttons: Button.Dash | Button.Attack }) }, TEST_CTX);
    expect(a.dashTicks).toBeGreaterThan(0);
    expect(a.attackKind).toBe('dash');
  });

  it('an attack well after the dash is a normal swing again', () => {
    const world = worldWithGap(15);
    const a = world.players[0];
    stepWorld(world, { 0: hold(a, { buttons: Button.Dash }) }, TEST_CTX);
    runWorld(world, { 0: hold(a) }, MOVE.dashTicks + COMBAT.dashAttackGraceTicks + 1);
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('attack');
    expect(a.attackKind).toBe('light');
  });

  it('closes a gap that a normal swing cannot reach', () => {
    const gap = 6;
    const standing = worldWithGap(gap);
    expect(swing(standing).some((e) => e.type === 'hit')).toBe(false);

    const world = worldWithGap(gap);
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < attackTotalTicks(dash) && world.match.phase === 'playing'; tick++) {
      const buttons = tick === 0 ? Button.Dash | Button.Attack : 0;
      events.push(...stepWorld(world, { 0: hold(a, { buttons }), 1: hold(b) }, TEST_CTX).events);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', kind: 'dash', target: 1 }));
    expect(b.alive).toBe(false);
    expect(world.match.scores).toEqual([1, 0]);
  });

  it('can be parried like any other swing', () => {
    const world = worldWithGap(6);
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < attackTotalTicks(dash); tick++) {
      const buttons = tick === 0 ? Button.Dash | Button.Attack : 0;
      const parry = tick === 2 ? Button.Parry : 0;
      events.push(...stepWorld(world, { 0: hold(a, { buttons }), 1: hold(b, { buttons: parry }) }, TEST_CTX).events);
    }
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(b.alive).toBe(true);
    expect(a.action).toBe('stunned');
  });
});

describe('blade clash', () => {
  /** Slot 0 swings at tick 0, slot 1 swings `delay` ticks later. Returns all events of the exchange. */
  function exchange(world: WorldState, delay: number): GameEvent[] {
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < attackTotalTicks(light) + delay && world.match.phase === 'playing'; tick++) {
      const inputs = {
        0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }),
        1: hold(b, { buttons: tick === delay ? Button.Attack : 0 }),
      };
      events.push(...stepWorld(world, inputs, TEST_CTX).events);
    }
    return events;
  }

  it('two simultaneous swings clash: nobody dies, both are thrown back', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const gapBefore = b.pos.x - a.pos.x;
    const events = exchange(world, 0);
    expect(events.filter((e) => e.type === 'clash')).toEqual([{ type: 'clash', a: 0, b: 1 }]);
    expect(events.some((e) => e.type === 'hit' || e.type === 'death')).toBe(false);
    expect(a.alive && b.alive).toBe(true);
    expect(world.match.phase).toBe('playing');
    expect(b.pos.x - a.pos.x).toBeGreaterThan(gapBefore + 1);
  });

  it('swings a few ticks apart still clash', () => {
    const world = playingWorld();
    const events = exchange(world, COMBAT.clashWindowTicks - 1);
    expect(events.some((e) => e.type === 'clash')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('a swing that comes clearly later does not save you: the first swing kills', () => {
    const world = playingWorld();
    const events = exchange(world, COMBAT.clashWindowTicks + 3);
    expect(events.some((e) => e.type === 'clash')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', attacker: 0, target: 1 }));
    expect(world.match.scores).toEqual([1, 0]);
  });

  it('no clash if the other swing could not reach (looking away)', () => {
    const world = playingWorld();
    world.players[1].yaw = -Math.PI / 2; // slot 1 swings into the air, away from slot 0
    const events = exchange(world, 0);
    expect(events.some((e) => e.type === 'clash')).toBe(false);
    expect(world.players[1].alive).toBe(false);
  });

  it('after a clash both must wait before swinging again', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    for (let tick = 0; tick <= light.startupTicks; tick++) {
      const press = tick === 0 ? Button.Attack : 0;
      stepWorld(world, { 0: hold(a, { buttons: press }), 1: hold(b, { buttons: press }) }, TEST_CTX);
    }
    expect(a.action).toBe('idle');
    expect(a.attackCooldown).toBeGreaterThan(COMBAT.clashCooldownTicks - 3);
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, TEST_CTX);
    expect(a.action).toBe('idle'); // still cooling down
    runWorld(world, { 0: hold(a), 1: hold(b) }, COMBAT.clashCooldownTicks);
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, TEST_CTX);
    expect(a.action).toBe('attack');
  });
});
