/**
 * Dash charges (flow update, step 3): a pool of 2 charges for ground and air, refilled
 * one at a time, one air dash until ground or wall contact, a charge back for a hit or a
 * successful parry, and a long recovery for a dash attack that hits nothing.
 */
import { describe, expect, it } from 'vitest';
import { attackTotalTicks, WEAPONS } from '../../src/shared/combat/weapons';
import { ARENA_MODE, DUEL, type GameMode } from '../../src/shared/match/gameModes';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import type { PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { Button, hold, input, playingWorld, runWorld, standingPlayer, TEST_CTX, TEST_MAP } from '../helpers';

const step = (p: PlayerState, buttons = 0, mode: GameMode = DUEL, moveZ = 0) =>
  stepPlayer(p, input({ yaw: p.yaw, buttons, moveZ }), TEST_MAP, 'playing', mode);
const idle = (p: PlayerState, ticks: number, mode: GameMode = DUEL) => {
  for (let i = 0; i < ticks; i++) step(p, 0, mode);
};

describe('dash charges', () => {
  it('a fresh player has two charges; each dash costs one', () => {
    const p = standingPlayer();
    expect(p.dashCharges).toBe(MOVE.dashMaxCharges);
    expect(MOVE.dashMaxCharges).toBe(2);
    step(p, Button.Dash);
    expect(p.dashCharges).toBe(1);
  });

  it('empty charges refill one at a time, about 3 seconds each', () => {
    const p = standingPlayer();
    step(p, Button.Dash);
    idle(p, MOVE.dashCooldownTicks);
    step(p, Button.Dash);
    expect(p.dashCharges).toBe(0);
    expect(MOVE.dashRechargeTicks).toBe(180);
    idle(p, DUEL.dashRechargeTicks);
    expect(p.dashCharges).toBe(1);
    idle(p, DUEL.dashRechargeTicks);
    expect(p.dashCharges).toBe(2);
  });

  it('the arena refills slower', () => {
    const p = standingPlayer();
    step(p, Button.Dash, ARENA_MODE);
    idle(p, DUEL.dashRechargeTicks, ARENA_MODE);
    expect(p.dashCharges).toBe(1);
    idle(p, ARENA_MODE.dashRechargeTicks - DUEL.dashRechargeTicks, ARENA_MODE);
    expect(p.dashCharges).toBe(2);
  });

  it('a dash attack costs one charge too', () => {
    const p = standingPlayer();
    step(p, Button.Dash | Button.Attack);
    expect(p.attackKind).toBe('dash');
    expect(p.dashCharges).toBe(1);
  });
});

describe('one dash in the air', () => {
  function inTheAir(): PlayerState {
    const p = standingPlayer(0, 5, 0);
    step(p, Button.Jump);
    idle(p, 5);
    expect(p.grounded).toBe(false);
    return p;
  }

  it('only one dash until the ground is touched again, even with a charge left', () => {
    const p = inTheAir();
    step(p, Button.Dash);
    expect(p.dashTicks).toBeGreaterThan(0);
    idle(p, MOVE.dashCooldownTicks);
    expect(p.grounded).toBe(false);
    step(p, Button.Dash);
    expect(p.dashTicks).toBe(0);
    expect(p.dashCharges).toBe(1); // the charge is still there
    while (!p.grounded) step(p);
    step(p, Button.Dash);
    expect(p.dashTicks).toBeGreaterThan(0); // landing reset the air limit
  });

  it('touching a wall (wall-run) also resets the air limit', () => {
    const p = inTheAir();
    step(p, Button.Dash);
    expect(p.airDashUsed).toBe(true);
    p.wallRunning = true; // a wall-run started
    idle(p, 1);
    expect(p.airDashUsed).toBe(false);
  });
});

describe('charges back and the price of missing', () => {
  const light = WEAPONS.sword.attacks.light;

  it('a hit gives the attacker a charge back', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    a.dashCharges = 0;
    a.dashRecharge = 100;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, TEST_CTX);
    const results = runWorld(world, { 0: hold(a), 1: hold(b) }, light.startupTicks + 2);
    expect(results.some((r) => r.events.some((e) => e.type === 'hit'))).toBe(true);
    expect(a.dashCharges).toBe(1);
  });

  it('a successful parry gives the defender a charge back', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    b.dashCharges = 0;
    b.dashRecharge = 100;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, TEST_CTX);
    runWorld(world, { 0: hold(a), 1: hold(b) }, light.startupTicks - 4);
    const results = runWorld(world, { 0: hold(a), 1: hold(b, { buttons: Button.Parry }) }, 6);
    expect(results.some((r) => r.events.some((e) => e.type === 'parry'))).toBe(true);
    expect(b.dashCharges).toBe(1);
  });

  it('a dash attack that hits nothing recovers much longer than one that connects', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2);
    step(p, Button.Dash | Button.Attack);
    let ticks = 1;
    while (p.action === 'attack') {
      step(p);
      ticks++;
    }
    const dash = WEAPONS.sword.attacks.dash;
    expect(ticks).toBeGreaterThanOrEqual(attackTotalTicks(dash) + COMBAT.dashAttackMissRecoveryTicks);
  });
});
