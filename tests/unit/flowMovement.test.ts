/**
 * Flow movement (step 2 of the flow update): always sprint with a walk key, keeping
 * momentum, slide and crouch, input buffer, cancelling recovery, dashing through the
 * enemy, lunge, air attack and aim assist.
 */
import { describe, expect, it } from 'vitest';
import { isInMeleeRange } from '../../src/shared/combat/hitDetection';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { boxFromBounds, type MapDef } from '../../src/shared/maps/mapTypes';
import { DUEL } from '../../src/shared/match/gameModes';
import { MOVE } from '../../src/shared/movement/movementConfig';
import type { PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { Button, hold, input, playingWorld, runPlayer, runWorld, standingPlayer, TEST_MAP } from '../helpers';

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

describe('lunge and air attack', () => {
  const step = (p: PlayerState, buttons = 0, moveZ = 0) =>
    stepPlayer(p, input({ yaw: p.yaw, buttons, moveZ }), TEST_MAP, 'playing', DUEL);

  it('a swing from a standstill steps forward, a sprinting swing is not slowed down', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2); // looks toward +X
    step(p, Button.Attack);
    for (let i = 0; i < 30; i++) step(p);
    expect(p.pos.x).toBeGreaterThan(0.5);
    expect(p.pos.x).toBeLessThan(1.2);

    const runner = sprinter();
    step(runner, Button.Attack, 1);
    for (let i = 0; i < 8; i++) step(runner, 0, 1);
    expect(speed(runner)).toBeCloseTo(MOVE.runSpeed);
  });

  it('a swing in the air is an air attack with a short hang and a longer vertical reach', () => {
    const p = standingPlayer(0, 5, -Math.PI / 2);
    step(p, Button.Jump);
    for (let i = 0; i < 25; i++) step(p); // falling again
    expect(p.vel.y).toBeLessThan(0);
    step(p, Button.Attack);
    expect(p.attackKind).toBe('air');
    expect(p.vel.y).toBeGreaterThan(0);
    const air = WEAPONS.sword.attacks.air;
    expect(air.verticalReach).toBeGreaterThan(WEAPONS.sword.attacks.light.verticalReach);
  });
});

describe('aim assist (setting, decided by the server)', () => {
  const light = WEAPONS.sword.attacks.light;
  // Target 2 m away, 52 degrees off the view direction: just outside the 45 degree half cone.
  const angle = (52 * Math.PI) / 180;
  const attacker = () => standingPlayer(0, 0, -Math.PI / 2); // looks toward +X
  const target = () => standingPlayer(2 * Math.cos(angle), 2 * Math.sin(angle));

  it('widens the hit cone a little, but is no auto aim', () => {
    expect(isInMeleeRange(attacker(), target(), light)).toBe(false);
    expect(isInMeleeRange(attacker(), target(), light, undefined, true)).toBe(true);
    const behind = standingPlayer(-2, 0);
    expect(isInMeleeRange(attacker(), behind, light, undefined, true)).toBe(false);
    const far = standingPlayer(light.range + 1, 0);
    expect(isInMeleeRange(attacker(), far, light, undefined, true)).toBe(false);
  });

  it('the server uses the AimAssist flag of the attacker input', () => {
    for (const assist of [false, true]) {
      const world = playingWorld();
      const [a, b] = world.players;
      a.pos = { x: 0, y: 0, z: 0 };
      a.yaw = -Math.PI / 2;
      b.pos = { x: 2 * Math.cos(angle), y: 0, z: 2 * Math.sin(angle) };
      // The swing is right before its hit phase (no lunge left: only the cone matters here).
      a.action = 'attack';
      a.attackKind = 'light';
      a.actionTicks = light.startupTicks - 1;
      const flag = assist ? Button.AimAssist : 0;
      const results = runWorld(world, { 0: hold(a, { buttons: flag }), 1: hold(b) }, 10);
      const hit = results.some((r) => r.events.some((e) => e.type === 'hit'));
      expect(hit).toBe(assist);
    }
  });
});
