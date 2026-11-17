import { describe, expect, it } from 'vitest';
import type { InputCmd } from '../../src/shared/input';
import { boxFromBounds, jumpPad, type MapDef } from '../../src/shared/maps/mapTypes';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { padUnder } from '../../src/shared/movement/jumpPad';
import { createPlayer, type PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { Button } from '../helpers';
import { DUEL } from '../../src/shared/match/gameModes';

/** Two platforms with a 6 m gap; a pad on the left one throws you 12 m far, over to the right one. */
const LAUNCH = { x: 12, y: 12, z: 0 };
const PAD_MAP: MapDef = {
  id: 'pads',
  name: 'Pads',
  description: 'Test map with a jump pad.',
  killY: -10,
  boxes: [boxFromBounds(-10, 0, -1, 0, -5, 5), boxFromBounds(6, 24, -1, 0, -5, 5)],
  spawns: [
    { pos: { x: -8, y: 0, z: 0 }, yaw: -Math.PI / 2 },
    { pos: { x: 20, y: 0, z: 0 }, yaw: Math.PI / 2 },
  ],
  navPoints: [],
  links: [],
  pads: [jumpPad(-2, 0, 0, LAUNCH)],
};

function step(p: PlayerState, partial: Partial<InputCmd> = {}): void {
  stepPlayer(p, { seq: 1, moveX: 0, moveZ: 0, yaw: p.yaw, pitch: 0, buttons: 0, viewTick: 0, ...partial }, PAD_MAP, 'playing', DUEL);
}

function playerAt(x: number, z = 0): PlayerState {
  const p = createPlayer(0, { pos: { x, y: 0, z }, yaw: -Math.PI / 2 });
  return p;
}

describe('jump pads', () => {
  it('throws a player who steps on it into the air with the launch velocity of the pad', () => {
    const p = playerAt(-2);
    step(p); // lands on the pad in this tick
    expect(p.grounded).toBe(false);
    expect(p.vel).toEqual(LAUNCH);
  });

  it('does nothing next to the pad or above it', () => {
    const beside = playerAt(-6);
    step(beside);
    expect(beside.grounded).toBe(true);
    expect(beside.vel.y).toBe(0);
    expect(padUnder(beside, PAD_MAP)).toBeNull();

    const above = playerAt(-2);
    above.pos.y = 3;
    expect(padUnder(above, PAD_MAP)).toBeNull();
  });

  it('carries a player without any input across the gap, always along the same arc', () => {
    const landings: number[] = [];
    for (const startX of [-2.9, -2, -1.1]) {
      const p = playerAt(startX);
      let top = 0;
      for (let tick = 0; tick < 300 && !(p.grounded && p.pos.x > 5); tick++) {
        step(p);
        top = Math.max(top, p.pos.y);
        expect(p.pos.y).toBeGreaterThan(PAD_MAP.killY);
      }
      expect(p.grounded).toBe(true);
      expect(top).toBeCloseTo((LAUNCH.y * LAUNCH.y) / (2 * MOVE.gravity), 0);
      landings.push(p.pos.x - startX);
    }
    // The flight is the same length wherever on the pad it started.
    expect(Math.max(...landings) - Math.min(...landings)).toBeLessThan(0.01);
    expect(landings[0]).toBeGreaterThan(11);
  });

  it('gives the double jump back, and the launch cannot be topped up with a ground jump', () => {
    const p = playerAt(-2);
    step(p, { buttons: Button.Jump }); // pressing jump while landing on the pad
    expect(p.vel.y).toBe(LAUNCH.y);
    expect(p.airJumpsLeft).toBe(MOVE.airJumps);
    step(p);
    step(p, { buttons: 0 });
    step(p, { buttons: Button.Jump }); // the double jump still works in flight
    expect(p.airJumpsLeft).toBe(0);
  });

  it('a dash carries you across a pad without being launched', () => {
    const p = playerAt(-5);
    step(p);
    step(p, { buttons: Button.Dash });
    let launched = false;
    for (let tick = 0; tick < MOVE.dashTicks - 1; tick++) {
      step(p, { buttons: Button.Dash });
      launched ||= p.vel.y > 0;
    }
    expect(p.pos.x).toBeGreaterThan(-3);
    expect(launched).toBe(false);
  });
});
