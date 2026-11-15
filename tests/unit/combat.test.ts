import { describe, expect, it } from 'vitest';
import { isAttackActive, isParryActive } from '../../src/shared/combat/actions';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import { isInMeleeRange } from '../../src/shared/combat/hitDetection';
import { attackTotalTicks, WEAPONS } from '../../src/shared/combat/weapons';
import { MAX_HP } from '../../src/shared/sim/playerState';
import type { GameEvent } from '../../src/shared/sim/events';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import type { WorldState } from '../../src/shared/sim/world';
import { Button, hold, playingWorld, runWorld, standingPlayer, TEST_CTX } from '../helpers';

const sword = WEAPONS.sword;

/** Player 0 presses attack once; returns all events until the swing is over. */
function swing(world: WorldState, defenderButtons = 0, defenderDelay = 0): GameEvent[] {
  const [a, b] = world.players;
  const events: GameEvent[] = [];
  for (let tick = 0; tick < attackTotalTicks(sword) + 2; tick++) {
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

describe('attack state machine', () => {
  it('goes through startup, active and recovery, then back to idle', () => {
    const world = playingWorld();
    const a = world.players[0];
    world.players[1].pos.x = 15; // far away, nothing to hit

    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('attack');
    expect(isAttackActive(a)).toBe(false); // startup

    runWorld(world, { 0: hold(a) }, sword.startupTicks);
    expect(isAttackActive(a)).toBe(true);

    runWorld(world, { 0: hold(a) }, sword.activeTicks);
    expect(a.action).toBe('attack');
    expect(isAttackActive(a)).toBe(false); // recovery

    runWorld(world, { 0: hold(a) }, sword.recoveryTicks);
    expect(a.action).toBe('idle');
  });

  it('cannot start a new action during a swing', () => {
    const world = playingWorld();
    const a = world.players[0];
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    stepWorld(world, { 0: hold(a) }, TEST_CTX);
    stepWorld(world, { 0: hold(a, { buttons: Button.Parry }) }, TEST_CTX);
    expect(a.action).toBe('attack');
  });
});

describe('hit detection', () => {
  it('hits a target in front within range', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2); // looks toward +X
    const t = standingPlayer(2, 0);
    expect(isInMeleeRange(a, t, sword)).toBe(true);
  });

  it('misses a target that is too far away', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    const t = standingPlayer(sword.range + 1, 0);
    expect(isInMeleeRange(a, t, sword)).toBe(false);
  });

  it('misses a target behind or beside the attacker', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    expect(isInMeleeRange(a, standingPlayer(-2, 0), sword)).toBe(false);
    expect(isInMeleeRange(a, standingPlayer(0, 2), sword)).toBe(false);
  });

  it('misses a target far above', () => {
    const a = standingPlayer(0, 0, -Math.PI / 2);
    const t = standingPlayer(2, 0);
    t.pos.y = COMBAT.verticalReach + 0.5;
    expect(isInMeleeRange(a, t, sword)).toBe(false);
  });
});

describe('hits', () => {
  it('a swing damages the target exactly once and knocks it back', () => {
    const world = playingWorld();
    const events = swing(world);
    const hits = events.filter((e) => e.type === 'hit');
    expect(hits).toHaveLength(1);
    expect(world.players[1].hp).toBe(MAX_HP - sword.damage);
    expect(world.players[0].hp).toBe(MAX_HP);
    expect(world.players[1].pos.x).toBeGreaterThan(1); // pushed away from the attacker
  });

  it('two simultaneous swings both hit', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(
      world,
      { 0: hold(a, { buttons: Button.Attack }), 1: hold(b, { buttons: Button.Attack }) },
      TEST_CTX,
    );
    runWorld(world, { 0: hold(a), 1: hold(b) }, attackTotalTicks(sword));
    expect(a.hp).toBe(MAX_HP - sword.damage);
    expect(b.hp).toBe(MAX_HP - sword.damage);
  });

  it('the target is reported as disturbed, the attacker is not', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    const results = runWorld(world, { 0: hold(a), 1: hold(b) }, sword.startupTicks + 1);
    const hitTick = results.find((r) => r.events.some((e) => e.type === 'hit'));
    expect(hitTick).toBeDefined();
    expect(hitTick!.disturbed).toContain(1);
  });
});

describe('parry', () => {
  it('a parry during the window blocks the hit and stuns the attacker', () => {
    const world = playingWorld();
    // The defender presses parry shortly before the swing becomes active.
    const events = swing(world, Button.Parry, sword.startupTicks - 4);
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(world.players[1].hp).toBe(MAX_HP);
    expect(world.players[0].action).toBe('stunned');
  });

  it('a parry that is too early does not block', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    // The defender parries, then waits until the window is over before the attack comes.
    stepWorld(world, { 0: hold(a), 1: hold(b, { buttons: Button.Parry }) }, TEST_CTX);
    runWorld(world, { 0: hold(a), 1: hold(b, { buttons: Button.Parry }) }, COMBAT.parryWindowTicks);
    expect(isParryActive(b)).toBe(false);
    const events = swing(world, Button.Parry);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('a parry does not block when facing away from the attacker', () => {
    const world = playingWorld();
    world.players[1].yaw = -Math.PI / 2; // defender looks away (+X)
    const events = swing(world, Button.Parry, sword.startupTicks - 4);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('the stun ends after the configured time', () => {
    const world = playingWorld();
    swing(world, Button.Parry, sword.startupTicks - 4);
    const a = world.players[0];
    expect(a.action).toBe('stunned');
    runWorld(world, { 0: hold(a) }, COMBAT.parryStunTicks);
    expect(a.action).toBe('idle');
  });

  it('a stunned player cannot attack', () => {
    const world = playingWorld();
    swing(world, Button.Parry, sword.startupTicks - 4);
    const a = world.players[0];
    expect(a.action).toBe('stunned');
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }) }, TEST_CTX);
    expect(a.action).toBe('stunned');
  });
});
