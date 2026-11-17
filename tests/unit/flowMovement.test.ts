/**
 * Flow movement (step 2 of the flow update): always sprint with a walk key, keeping
 * momentum, slide and crouch, input buffer, cancelling recovery, dashing through the
 * enemy, lunge, air attack and aim assist.
 */
import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { boxFromBounds, type MapDef } from '../../src/shared/maps/mapTypes';
import { DUEL } from '../../src/shared/match/gameModes';
import { MOVE } from '../../src/shared/movement/movementConfig';
import type { PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { Button, input, runPlayer, standingPlayer, TEST_MAP } from '../helpers';

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

/** Sprinting toward +X from the left side of the test floor. */
function sprinter(): PlayerState {
  const p = standingPlayer(-18, 5, -Math.PI / 2);
  runPlayer(p, { moveZ: 1 }, 40);
  return p;
}

describe('slide and crouch (Ctrl)', () => {
  it('Ctrl while sprinting slides: low, faster than sprinting, slow to lose speed', () => {
    const p = sprinter();
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 1);
    expect(p.slideTicks).toBeGreaterThan(0);
    expect(p.crouching).toBe(true);
    expect(speed(p)).toBeGreaterThanOrEqual(MOVE.slideSpeed - 0.2);
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 20);
    expect(speed(p)).toBeGreaterThan(MOVE.runSpeed + 1);
    runPlayer(p, { moveZ: 1 }, 1); // let go: the slide ends and we stand up
    expect(p.slideTicks).toBe(0);
    expect(p.crouching).toBe(false);
  });

  it('jumping out of a slide keeps the speed', () => {
    const p = sprinter();
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 5);
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch | Button.Jump }, 1);
    expect(p.grounded).toBe(false);
    expect(p.slideTicks).toBe(0);
    runPlayer(p, { moveZ: 1 }, 10);
    expect(speed(p)).toBeGreaterThan(MOVE.runSpeed + 2);
  });

  it('sliding again right away gives no new boost (no endless speed by spamming)', () => {
    const p = sprinter();
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 5);
    runPlayer(p, { moveZ: 1 }, 1);
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 1);
    expect(p.slideTicks).toBe(0);
  });

  it('Ctrl without speed crouches: low and slow', () => {
    const p = standingPlayer(0, 5, 0);
    runPlayer(p, { moveZ: 1, buttons: Button.Crouch }, 40);
    expect(p.slideTicks).toBe(0);
    expect(p.crouching).toBe(true);
    expect(speed(p)).toBeCloseTo(MOVE.crouchSpeed);
  });

  it('stays low under a low ceiling and stands up once there is room', () => {
    const map: MapDef = {
      ...TEST_MAP,
      boxes: [...TEST_MAP.boxes, boxFromBounds(-2, 2, 1.3, 2, -2, 2)], // a low ceiling (1.3 m)
    };
    const p = standingPlayer(-3, 0, -Math.PI / 2); // looks toward +X, right next to the ceiling
    const step = (buttons: number, moveZ = 1) => stepPlayer(p, input({ yaw: p.yaw, moveZ, buttons }), map, 'playing', DUEL);
    for (let i = 0; i < 40; i++) step(Button.Crouch); // crawl under it
    expect(p.pos.x).toBeGreaterThan(-1);
    step(0, 0); // let go of Ctrl under the ceiling
    expect(p.crouching).toBe(true);
    for (let i = 0; i < 60; i++) step(0); // walk out on the other side
    expect(p.pos.x).toBeGreaterThan(2.5);
    expect(p.crouching).toBe(false);
  });

  it('standing players cannot pass under the low ceiling', () => {
    const map: MapDef = { ...TEST_MAP, boxes: [...TEST_MAP.boxes, boxFromBounds(-2, 2, 1.3, 2, -2, 2)] };
    const p = standingPlayer(-3, 0, -Math.PI / 2);
    for (let i = 0; i < 40; i++) stepPlayer(p, input({ yaw: p.yaw, moveZ: 1 }), map, 'playing', DUEL);
    expect(p.pos.x).toBeLessThan(-2.3);
  });
});

describe('input buffer', () => {
  const step = (p: PlayerState, buttons = 0, moveZ = 0) =>
    stepPlayer(p, input({ yaw: p.yaw, buttons, moveZ }), TEST_MAP, 'playing', DUEL);

  it('a jump pressed shortly before landing is done on landing', () => {
    const p = standingPlayer(0, 5, 0);
    p.pos.y = 0.6; // falling, no double jump left
    p.vel.y = -6;
    p.grounded = false;
    p.airJumpsLeft = 0;
    step(p, Button.Jump);
    for (let i = 0; i < 6 && !p.grounded; i++) step(p, Button.Jump); // held, no new press
    let jumped = false;
    for (let i = 0; i < 6; i++) {
      step(p);
      if (p.vel.y > 4) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('a swing pressed a moment too early starts as soon as the cooldown is over', () => {
    const p = standingPlayer();
    p.attackCooldown = 5;
    step(p, Button.Attack);
    expect(p.action).toBe('idle');
    for (let i = 0; i < 5; i++) step(p);
    expect(p.action).toBe('attack');
  });

  it('a press that is too old is forgotten, and holding a button does not repeat it', () => {
    const p = standingPlayer();
    p.attackCooldown = 20;
    step(p, Button.Attack);
    for (let i = 0; i < 25; i++) step(p, Button.Attack); // still held
    expect(p.action).toBe('idle');
  });
});

describe('cancelling the recovery of a swing', () => {
  const step = (p: PlayerState, buttons = 0) => stepPlayer(p, input({ yaw: p.yaw, buttons, moveZ: 1 }), TEST_MAP, 'playing', DUEL);
  const light = WEAPONS.sword.attacks.light;

  it('a dash or a jump ends the recovery of a normal swing at once', () => {
    for (const button of [Button.Dash, Button.Jump]) {
      const p = standingPlayer(0, 5, -Math.PI / 2);
      step(p, Button.Attack);
      for (let i = 0; i < light.startupTicks + light.activeTicks + 1; i++) step(p);
      expect(p.action).toBe('attack');
      step(p, button);
      expect(p.action).toBe('idle');
    }
  });

  it('the wind-up cannot be cancelled, and the dash attack keeps its long recovery', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2);
    step(p, Button.Attack);
    step(p, Button.Jump); // during the wind-up
    expect(p.action).toBe('attack');

    const d = standingPlayer(0, 5, -Math.PI / 2);
    step(d, Button.Dash | Button.Attack);
    expect(d.attackKind).toBe('dash');
    const dash = WEAPONS.sword.attacks.dash;
    for (let i = 0; i < dash.startupTicks + dash.activeTicks + 2; i++) step(d);
    step(d, Button.Jump);
    expect(d.action).toBe('attack');
  });
});
