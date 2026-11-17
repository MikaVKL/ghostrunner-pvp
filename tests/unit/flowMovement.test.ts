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
