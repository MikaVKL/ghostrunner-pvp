/**
 * Block, parry and posture (flow update, step 4): holding Q blocks (safe, fills your own
 * posture, walk speed, no sprint/dash/swing), a timed press parries (fills the attacker's
 * posture), a full bar stuns for 1.5 s, the bar drains slowly without pressure.
 */
import { describe, expect, it } from 'vitest';
import { isBlocking, isParryActive } from '../../src/shared/combat/actions';
import { COMBAT } from '../../src/shared/combat/combatConfig';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { MOVE } from '../../src/shared/movement/movementConfig';
import type { GameEvent } from '../../src/shared/sim/events';
import type { PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import type { WorldState } from '../../src/shared/sim/world';
import { DUEL } from '../../src/shared/match/gameModes';
import { Button, hold, input, playingWorld, runWorld, standingPlayer, TEST_CTX, TEST_MAP } from '../helpers';

const light = WEAPONS.sword.attacks.light;
const speed = (p: PlayerState) => Math.hypot(p.vel.x, p.vel.z);
const step = (p: PlayerState, buttons = 0, moveZ = 0) =>
  stepPlayer(p, input({ yaw: p.yaw, buttons, moveZ }), TEST_MAP, 'playing', DUEL);

/** Slot 0 swings once at slot 1, who holds Q from the start (a block, no parry window). */
function swingAtBlocker(world: WorldState): GameEvent[] {
  const [a, b] = world.players;
  b.parryCooldown = COMBAT.parryCooldownTicks; // the parry window is not ready: pure block
  const events: GameEvent[] = [];
  for (let tick = 0; tick < light.startupTicks + light.activeTicks + 4; tick++) {
    const result = stepWorld(
      world,
      { 0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }), 1: hold(b, { buttons: Button.Parry }) },
      TEST_CTX,
    );
    events.push(...result.events);
  }
  return events;
}

describe('guard: parry window, then block', () => {
  it('a press opens a 0.15 s parry window; holding on blocks', () => {
    const p = standingPlayer();
    step(p, Button.Parry);
    expect(p.action).toBe('guard');
    expect(isParryActive(p)).toBe(true);
    expect(COMBAT.parryWindowTicks).toBe(9);
    for (let i = 0; i < COMBAT.parryWindowTicks; i++) step(p, Button.Parry);
    expect(isParryActive(p)).toBe(false);
    expect(isBlocking(p)).toBe(true);
    step(p); // release
    expect(p.action).toBe('idle');
  });

  it('the parry window does not slow you down, blocking slows to walk speed', () => {
    const p = standingPlayer(-18, 5, -Math.PI / 2);
    for (let i = 0; i < 40; i++) step(p, 0, 1);
    step(p, Button.Parry, 1);
    for (let i = 0; i < COMBAT.parryWindowTicks - 2; i++) step(p, Button.Parry, 1);
    expect(speed(p)).toBeCloseTo(MOVE.runSpeed); // still sprinting in the window
    for (let i = 0; i < 30; i++) step(p, Button.Parry, 1);
    expect(isBlocking(p)).toBe(true);
    expect(speed(p)).toBeCloseTo(MOVE.walkSpeed);
  });

  it('while guarding you can neither dash nor swing', () => {
    const p = standingPlayer();
    step(p, Button.Parry);
    step(p, Button.Parry | Button.Dash | Button.Attack);
    expect(p.dashTicks).toBe(0);
    expect(p.action).toBe('guard');
  });

  it('holding Q when a swing ends goes straight into a block (no parry window)', () => {
    const p = standingPlayer();
    step(p, Button.Attack);
    while (p.action === 'attack') step(p, Button.Parry);
    step(p, Button.Parry);
    expect(p.action).toBe('guard');
    expect(isParryActive(p)).toBe(false);
  });
});

describe('block and posture', () => {
  it("a block is safe but fills the defender's posture", () => {
    const world = playingWorld();
    const events = swingAtBlocker(world);
    expect(events.some((e) => e.type === 'block')).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(world.players[1].alive).toBe(true);
    expect(world.players[1].posture).toBeCloseTo(light.postureDamage, 0);
  });

  it('a full bar breaks the posture: stunned for 1.5 s, then the bar is empty', () => {
    const world = playingWorld();
    const b = world.players[1];
    b.posture = COMBAT.postureMax - 1;
    const events = swingAtBlocker(world);
    expect(events).toContainEqual(expect.objectContaining({ type: 'block', broken: true }));
    expect(b.action).toBe('stunned');
    expect(b.stunTicks).toBe(COMBAT.postureBreakTicks);
    expect(b.posture).toBe(0);
  });

  it("a parry fills the attacker's posture a lot and stuns it briefly", () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < light.startupTicks + 2; tick++) {
      const parry = tick === light.startupTicks - 4 ? Button.Parry : 0;
      events.push(...stepWorld(world, { 0: hold(a, { buttons: tick === 0 ? Button.Attack : 0 }), 1: hold(b, { buttons: parry }) }, TEST_CTX).events);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'parry', broken: false }));
    expect(a.posture).toBeCloseTo(COMBAT.parryPostureDamage, 0);
    expect(a.action).toBe('stunned');
    expect(a.stunTicks).toBe(COMBAT.parryStunTicks);
  });

  it('the bar drains slowly once there is no pressure', () => {
    const p = standingPlayer();
    p.posture = 50;
    p.postureRegenDelay = COMBAT.postureRegenDelayTicks;
    for (let i = 0; i < COMBAT.postureRegenDelayTicks; i++) step(p);
    expect(p.posture).toBe(50); // the delay first
    for (let i = 0; i < 60; i++) step(p);
    expect(p.posture).toBeCloseTo(50 - COMBAT.postureRegenPerSecond, 0);
  });

  it('an unblocked hit still kills (duel)', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { buttons: Button.Attack }), 1: hold(b) }, TEST_CTX);
    runWorld(world, { 0: hold(a), 1: hold(b) }, light.startupTicks + 2);
    expect(b.alive).toBe(false);
  });

  it('blocking only works facing the attacker', () => {
    const world = playingWorld();
    world.players[1].yaw = -Math.PI / 2; // defender looks away (+X)
    const events = swingAtBlocker(world);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });
});
