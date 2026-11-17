import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../src/shared/config';
import { ReplayPlayback } from '../../src/shared/replay/replayPlayback';
import { hashState } from '../../src/shared/sim/stateDiff';
import { startSolo } from '../soloHelpers';

/** A short recorded solo match (about 10 s). */
function shortReplay() {
  const run = startSolo({ mapId: 'arena', difficulty: 'schwer', seed: 2, human: 'fights' });
  for (let i = 0; i < 600; i++) run.tick();
  return run.solo.replay()!;
}

describe('replay playback', () => {
  const file = shortReplay();

  it('plays in real time at speed 1, slower in slow motion, not at all when paused', () => {
    const normal = new ReplayPlayback(file);
    normal.advance(1000);
    expect(normal.tick - file.startWorld.tick).toBeCloseTo(60, 5);

    const slow = new ReplayPlayback(file);
    slow.speed = 0.25;
    slow.advance(1000);
    expect(slow.tick - file.startWorld.tick).toBeCloseTo(15, 5);

    const paused = new ReplayPlayback(file);
    paused.togglePause();
    paused.advance(1000);
    expect(paused.tick).toBe(file.startWorld.tick);
  });

  it('shows smooth in-between positions in slow motion', () => {
    const p = new ReplayPlayback(file);
    p.seekTo(file.startWorld.tick + 300);
    p.advance(0); // a jump shows the exact tick
    p.speed = 0.1;
    const a = p.advance(TICK_MS * 3).players[0].pos.x; // 0.3 ticks further
    const exact = p.sim.world.players[0].pos.x;
    const before = p.advance(0).previous[0].pos.x;
    expect(Math.min(before, exact) - 1e-9).toBeLessThanOrEqual(a);
    expect(a).toBeLessThanOrEqual(Math.max(before, exact) + 1e-9);
  });

  it('spooling back and forth shows the same world as playing through', () => {
    const straight = new ReplayPlayback(file);
    straight.advance(5000);
    const hashAt5s = hashState(straight.sim.world);
    const spool = new ReplayPlayback(file);
    spool.seekBySeconds(8);
    spool.seekBySeconds(-6);
    spool.advance(3000);
    expect(spool.tick).toBeCloseTo(straight.tick, 6);
    expect(spool.sim.tick).toBe(straight.sim.tick);
    expect(hashState(spool.sim.world)).toBe(hashAt5s);
  });

  it('stops at the end (or at a chosen end tick) and plays again from the start', () => {
    const end = file.startWorld.tick + 120;
    const p = new ReplayPlayback(file, file.startWorld.tick + 60, end);
    p.advance(5000);
    expect(p.tick).toBe(end);
    expect(p.finished).toBe(true);
    expect(p.playing).toBe(false);
    p.togglePause();
    expect(p.playing).toBe(true);
    expect(p.tick).toBe(file.startWorld.tick);
  });

  it('changes speed in steps and stays within the limits', () => {
    const p = new ReplayPlayback(file);
    p.changeSpeed(-1);
    expect(p.speed).toBe(0.5);
    for (let i = 0; i < 10; i++) p.changeSpeed(-1);
    expect(p.speed).toBe(0.1);
    for (let i = 0; i < 10; i++) p.changeSpeed(1);
    expect(p.speed).toBe(4);
  });
});
