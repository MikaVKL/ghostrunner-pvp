import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../../src/shared/config';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { createPlayer } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { Button, input, runPlayer, standingPlayer, TEST_MAP } from '../helpers';
import { DUEL } from '../../src/shared/match/gameModes';

const speed = (p: { vel: { x: number; z: number } }) => Math.hypot(p.vel.x, p.vel.z);

describe('running', () => {
  it('accelerates to run speed in the look direction', () => {
    const p = standingPlayer(0, 5, 0); // yaw 0 looks along -Z
    runPlayer(p, { moveZ: 1 }, 30);
    expect(speed(p)).toBeCloseTo(MOVE.runSpeed);
    expect(p.vel.z).toBeLessThan(0);
    expect(p.grounded).toBe(true);
  });

  it('diagonal movement is not faster than straight movement', () => {
    const p = standingPlayer(0, 5, 0);
    runPlayer(p, { moveZ: 1, moveX: 1 }, 30);
    expect(speed(p)).toBeCloseTo(MOVE.runSpeed);
  });

  it('stops through friction when no key is held', () => {
    const p = standingPlayer(0, 5, 0);
    runPlayer(p, { moveZ: 1 }, 30);
    runPlayer(p, {}, 30);
    expect(speed(p)).toBe(0);
  });
});

describe('jumping', () => {
  it('reaches the expected jump height and lands again', () => {
    const p = standingPlayer(0, 5);
    const expectedHeight = MOVE.jumpSpeed ** 2 / (2 * MOVE.gravity);
    let maxY = 0;
    stepPlayer(p, input({ buttons: Button.Jump }), TEST_MAP, 'playing', DUEL);
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, input({ buttons: Button.Jump }), TEST_MAP, 'playing', DUEL);
      maxY = Math.max(maxY, p.pos.y);
    }
    expect(maxY).toBeGreaterThan(expectedHeight - 0.15);
    expect(maxY).toBeLessThan(expectedHeight + 0.05);
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBe(0);
  });

  it('holding the button does not jump again (needs a new press)', () => {
    const p = standingPlayer(0, 5);
    runPlayer(p, { buttons: Button.Jump }, 120);
    // After landing while still holding jump, the player must stay on the ground.
    expect(p.grounded).toBe(true);
    runPlayer(p, { buttons: Button.Jump }, 5);
    expect(p.pos.y).toBe(0);
  });

  it('cannot jump in mid-air', () => {
    const p = createPlayer(0, { pos: { x: 0, y: 5, z: 5 }, yaw: 0 });
    runPlayer(p, {}, 20);
    const before = p.vel.y;
    stepPlayer(p, input({ buttons: Button.Jump }), TEST_MAP, 'playing', DUEL);
    expect(p.vel.y).toBeLessThan(before);
  });

  it('allows a late jump shortly after leaving a ledge (coyote time)', () => {
    const p = standingPlayer(0, 5);
    // Fake "just walked off a ledge": lift the player slightly, keep the coyote timer.
    p.pos.y = 3;
    runPlayer(p, {}, 2);
    expect(p.grounded).toBe(false);
    stepPlayer(p, input({ buttons: Button.Jump }), TEST_MAP, 'playing', DUEL);
    expect(p.vel.y).toBeGreaterThan(0);
  });

  it('falls when there is no ground', () => {
    const p = createPlayer(0, { pos: { x: 100, y: 0, z: 100 }, yaw: 0 });
    runPlayer(p, {}, 60);
    expect(p.pos.y).toBeLessThan(-5);
    expect(p.vel.y).toBeGreaterThanOrEqual(-MOVE.terminalFallSpeed);
  });
});

describe('dash', () => {
  it('moves fast for a short time, then goes on cooldown', () => {
    const p = standingPlayer(0, 5, 0);
    const startZ = p.pos.z;
    stepPlayer(p, input({ buttons: Button.Dash }), TEST_MAP, 'playing', DUEL);
    expect(p.dashTicks).toBe(MOVE.dashTicks - 1);
    runPlayer(p, { buttons: Button.Dash }, MOVE.dashTicks - 1);
    const expected = ((MOVE.dashTicks - 1) * MOVE.dashSpeed + MOVE.dashExitSpeed) * TICK_DT;
    expect(startZ - p.pos.z).toBeCloseTo(expected);
    expect(p.dashTicks).toBe(0);
    expect(p.dashCooldown).toBeGreaterThan(0);
  });

  it('two charges: two dashes in a row, the third only after a charge refilled', () => {
    const p = standingPlayer(0, 10, 0);
    const dash = () => stepPlayer(p, input({ buttons: Button.Dash }), TEST_MAP, 'playing', DUEL);
    dash();
    runPlayer(p, {}, MOVE.dashCooldownTicks);
    dash();
    expect(p.dashTicks).toBeGreaterThan(0);
    expect(p.dashCharges).toBe(0);
    runPlayer(p, {}, MOVE.dashCooldownTicks);
    dash();
    expect(p.dashTicks).toBe(0); // no charge left

    runPlayer(p, {}, MOVE.dashRechargeTicks);
    dash();
    expect(p.dashTicks).toBeGreaterThan(0);
  });

  it('dashes in the held movement direction', () => {
    const p = standingPlayer(0, 5, 0);
    stepPlayer(p, input({ moveX: 1, buttons: Button.Dash }), TEST_MAP, 'playing', DUEL);
    expect(p.vel.x).toBeCloseTo(MOVE.dashSpeed);
    expect(p.vel.z).toBeCloseTo(0);
  });

  it('ignores gravity while dashing in the air', () => {
    const p = createPlayer(0, { pos: { x: 0, y: 4, z: 5 }, yaw: 0 });
    stepPlayer(p, input({ buttons: Button.Dash }), TEST_MAP, 'playing', DUEL);
    const y = p.pos.y;
    runPlayer(p, { buttons: Button.Dash }, MOVE.dashTicks - 2);
    expect(p.pos.y).toBe(y);
  });
});

describe('wall-run', () => {
  /** A player in the air, touching the wall face at z = -5, moving along +X. */
  function playerAtWall() {
    const yaw = -Math.PI / 2; // looks toward +X, the wall is on the left
    const p = createPlayer(0, { pos: { x: 0, y: 3, z: -5 + 0.4 }, yaw });
    p.vel.x = MOVE.runSpeed;
    p.wallRunLeft = MOVE.wallRunMaxTicks;
    return p;
  }

  it('starts when airborne next to a wall while holding forward', () => {
    const p = playerAtWall();
    runPlayer(p, { moveZ: 1 }, 1);
    expect(p.wallRunning).toBe(true);
    expect(p.wallNormalZ).toBe(1);
    expect(Math.abs(p.vel.x)).toBeCloseTo(MOVE.wallRunSpeed);
  });

  it('falls much slower than a normal fall', () => {
    const running = playerAtWall();
    runPlayer(running, { moveZ: 1 }, 30);
    const falling = playerAtWall();
    runPlayer(falling, {}, 30); // not holding forward => no wall-run
    expect(running.wallRunning).toBe(true);
    expect(falling.wallRunning).toBe(false);
    expect(3 - running.pos.y).toBeLessThan(0.6);
    expect(3 - falling.pos.y).toBeGreaterThan(2);
  });

  it('ends when the time budget is used up', () => {
    const p = playerAtWall();
    p.pos.y = 6;
    runPlayer(p, { moveZ: 1 }, MOVE.wallRunMaxTicks + 2);
    expect(p.wallRunning).toBe(false);
    expect(p.wallRunLeft).toBe(0);
  });

  it('does not start on the ground or without forward input', () => {
    const p = standingPlayer(0, -5 + 0.4, -Math.PI / 2);
    runPlayer(p, { moveZ: 1 }, 20);
    expect(p.wallRunning).toBe(false);
  });

  it('wall-jump pushes away from the wall and upward', () => {
    const p = playerAtWall();
    runPlayer(p, { moveZ: 1 }, 5);
    runPlayer(p, { moveZ: 1, buttons: Button.Jump }, 1);
    expect(p.wallRunning).toBe(false);
    expect(p.vel.y).toBeCloseTo(MOVE.wallJumpUp);
    expect(p.vel.z).toBeGreaterThan(0); // away from the wall (+Z)
    expect(p.wallCooldown).toBeGreaterThan(0);
  });

  it('refills the budget on the ground', () => {
    const p = playerAtWall();
    runPlayer(p, { moveZ: 1 }, 20);
    expect(p.wallRunLeft).toBeLessThan(MOVE.wallRunMaxTicks);
    runPlayer(p, {}, 120);
    expect(p.grounded).toBe(true);
    expect(p.wallRunLeft).toBe(MOVE.wallRunMaxTicks);
  });
});

describe('frozen players', () => {
  it('do not move during the countdown but can look around', () => {
    const p = standingPlayer(0, 5, 0);
    for (let i = 0; i < 30; i++) {
      stepPlayer(p, input({ moveZ: 1, yaw: 1, buttons: Button.Jump }), TEST_MAP, 'countdown', DUEL);
    }
    expect(p.pos).toEqual({ x: 0, y: 0, z: 5 });
    expect(p.yaw).toBe(1);
  });

  it('dead players do not move', () => {
    const p = standingPlayer(0, 5, 0);
    p.alive = false;
    runPlayer(p, { moveZ: 1 }, 30);
    expect(p.pos.z).toBe(5);
  });
});

describe('air control keeps momentum', () => {
  it('holding forward while flying faster than run speed does not slow you down', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2); // looks toward +X
    p.pos.y = 6;
    p.grounded = false;
    p.vel.x = 15;
    runPlayer(p, { moveZ: 1 }, 20);
    expect(p.vel.x).toBe(15);
  });

  it('you can still brake and steer sideways in the air', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2);
    p.pos.y = 8;
    p.grounded = false;
    p.vel.x = 15;
    runPlayer(p, { moveZ: -1 }, 20); // hold back
    expect(p.vel.x).toBeLessThan(10);
    const before = p.vel.z;
    runPlayer(p, { moveX: 1 }, 10); // steer to the right (+Z when looking toward +X)
    expect(p.vel.z).toBeGreaterThan(before + 2);
  });

  it('from a standing jump you still reach run speed in the air', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2);
    runPlayer(p, { buttons: Button.Jump }, 1);
    runPlayer(p, { moveZ: 1 }, 30);
    expect(p.vel.x).toBeCloseTo(MOVE.runSpeed, 5);
  });
});
