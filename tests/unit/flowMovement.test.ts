/**
 * Flow movement (step 2 of the flow update): always sprint with a walk key, keeping
 * momentum, slide and crouch, input buffer, cancelling recovery, dashing through the
 * enemy, lunge, air attack and aim assist.
 */
import { describe, expect, it } from 'vitest';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { Button, runPlayer, standingPlayer } from '../helpers';

const speed = (p: { vel: { x: number; z: number } }) => Math.hypot(p.vel.x, p.vel.z);

describe('always sprint, walk key', () => {
  it('runs at sprint speed by default and at walk speed while the walk key is held', () => {
    const p = standingPlayer(0, 5, 0);
    runPlayer(p, { moveZ: 1 }, 40);
    expect(speed(p)).toBeCloseTo(MOVE.runSpeed);
    runPlayer(p, { moveZ: 1, buttons: Button.Walk }, 40);
    expect(speed(p)).toBeCloseTo(MOVE.walkSpeed);
    expect(MOVE.walkSpeed).toBeLessThan(MOVE.runSpeed / 1.5);
  });
});

describe('keeping momentum', () => {
  it('after a dash the extra speed bleeds away slowly while running on', () => {
    const p = standingPlayer(-18, 5, -Math.PI / 2); // runs toward +X across the whole floor
    runPlayer(p, { moveZ: 1 }, 30);
    runPlayer(p, { moveZ: 1, buttons: Button.Dash }, 1);
    runPlayer(p, { moveZ: 1 }, MOVE.dashTicks); // dash over
    expect(speed(p)).toBeGreaterThan(MOVE.runSpeed + 2);
    runPlayer(p, { moveZ: 1 }, 10);
    expect(speed(p)).toBeGreaterThan(MOVE.runSpeed + 1); // still faster than sprinting
    runPlayer(p, { moveZ: 1 }, 60);
    expect(speed(p)).toBeCloseTo(MOVE.runSpeed); // back to normal after a second
  });

  it('turning away or letting go of the keys still brakes quickly', () => {
    const turn = standingPlayer(0, 5, 0);
    turn.vel.z = -14; // fast forward (yaw 0 looks toward -Z)
    runPlayer(turn, { moveZ: -1 }, 20); // run backward
    expect(turn.vel.z).toBeGreaterThan(0);
    const stop = standingPlayer(0, 5, 0);
    stop.vel.z = -14;
    runPlayer(stop, {}, 20);
    expect(speed(stop)).toBe(0);
  });
});
