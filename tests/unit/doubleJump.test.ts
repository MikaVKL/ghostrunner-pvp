import { describe, expect, it } from 'vitest';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { Button, runPlayer, standingPlayer } from '../helpers';

/** Highest point reached while running `ticks` ticks with the given input. */
function peak(p: ReturnType<typeof standingPlayer>, ticks: number): number {
  let top = p.pos.y;
  for (let i = 0; i < ticks; i++) {
    runPlayer(p, {}, 1);
    top = Math.max(top, p.pos.y);
  }
  return top;
}

describe('double jump', () => {
  it('allows exactly one extra jump in the air', () => {
    const p = standingPlayer(0, 5);
    expect(p.airJumpsLeft).toBe(MOVE.airJumps);
    runPlayer(p, { buttons: Button.Jump }, 1); // jump
    runPlayer(p, {}, 15);
    runPlayer(p, { buttons: Button.Jump }, 1); // jump again in the air
    expect(p.vel.y).toBeGreaterThan(MOVE.airJumpSpeed - 1);
    expect(p.airJumpsLeft).toBe(0);
    runPlayer(p, {}, 8);
    const before = p.vel.y;
    runPlayer(p, { buttons: Button.Jump }, 1); // no third jump
    expect(p.vel.y).toBeLessThan(before);
  });

  it('gets you clearly higher than a single jump', () => {
    const single = standingPlayer(0, 5);
    runPlayer(single, { buttons: Button.Jump }, 1);
    const singlePeak = peak(single, 60);

    const double = standingPlayer(0, 5);
    runPlayer(double, { buttons: Button.Jump }, 1);
    runPlayer(double, {}, 20); // near the top of the first jump
    runPlayer(double, { buttons: Button.Jump }, 1);
    expect(peak(double, 60)).toBeGreaterThan(singlePeak + 0.9);
  });

  it('holding the jump button does not trigger the second jump (it needs a new press)', () => {
    const p = standingPlayer(0, 5);
    runPlayer(p, { buttons: Button.Jump }, 30);
    expect(p.airJumpsLeft).toBe(MOVE.airJumps);
  });

  it('is given back on the ground and when touching a wall', () => {
    const p = standingPlayer(0, 5);
    runPlayer(p, { buttons: Button.Jump }, 1);
    runPlayer(p, {}, 5);
    runPlayer(p, { buttons: Button.Jump }, 1);
    expect(p.airJumpsLeft).toBe(0);
    runPlayer(p, {}, 120); // land
    expect(p.grounded).toBe(true);
    expect(p.airJumpsLeft).toBe(MOVE.airJumps);

    // Jump along the wall of the test map (its face at z = -5): the wall-run refills the jump.
    const w = standingPlayer(0, -4.6, -Math.PI / 2);
    runPlayer(w, { moveZ: 1 }, 20);
    runPlayer(w, { moveZ: 1, buttons: Button.Jump }, 1);
    runPlayer(w, { moveZ: 1 }, 2);
    expect(w.wallRunning).toBe(true);
    w.airJumpsLeft = 0;
    runPlayer(w, {}, 3); // let go of the wall, then touch it again
    runPlayer(w, { moveZ: 1 }, 30);
    expect(w.airJumpsLeft).toBe(MOVE.airJumps);
  });

  it('works after a walk off a ledge too (first the late ground jump, then the air jump)', () => {
    const p = standingPlayer(0, 5);
    p.pos.y = 5; // in the air, long after leaving the ground
    p.grounded = false;
    p.coyoteTicks = 0;
    p.airJumpsLeft = 1;
    runPlayer(p, { buttons: Button.Jump }, 1);
    expect(p.vel.y).toBeGreaterThan(MOVE.airJumpSpeed - 1);
    expect(p.airJumpsLeft).toBe(0);
  });
});
