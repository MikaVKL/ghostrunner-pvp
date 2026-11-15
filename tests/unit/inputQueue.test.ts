import { describe, expect, it } from 'vitest';
import { InputQueue } from '../../src/server/game/inputQueue';
import { Button } from '../../src/shared/input';
import { input } from '../helpers';

describe('InputQueue', () => {
  it('returns inputs in order, one per tick, and marks them predictable', () => {
    const queue = new InputQueue();
    queue.push(input({ moveZ: 1 }, 1));
    queue.push(input({ moveZ: -1 }, 2));
    const first = queue.next();
    const second = queue.next();
    expect(first.input?.seq).toBe(1);
    expect(second.input?.seq).toBe(2);
    expect(first.predictable && second.predictable).toBe(true);
    expect(queue.lastProcessedSeq).toBe(2);
  });

  it('returns no input before the first one arrived', () => {
    const queue = new InputQueue();
    const next = queue.next();
    expect(next.input).toBeNull();
    expect(next.predictable).toBe(false);
  });

  it('repeats the last input when starved and flags it as not predictable', () => {
    const queue = new InputQueue();
    queue.push(input({ moveZ: 1, buttons: Button.Jump }, 1));
    queue.next();
    const repeated = queue.next();
    expect(repeated.input?.moveZ).toBe(1);
    expect(repeated.predictable).toBe(false);
    expect(queue.lastProcessedSeq).toBe(1);
    expect(queue.starvedTotal).toBe(1);
  });

  it('stops moving after being starved for a long time, but keeps the view direction', () => {
    const queue = new InputQueue();
    queue.push(input({ moveZ: 1, yaw: 1.2, buttons: Button.Attack }, 1));
    queue.next();
    let last = queue.next();
    for (let i = 0; i < 40; i++) last = queue.next();
    expect(last.input).toMatchObject({ moveZ: 0, buttons: 0, yaw: 1.2 });
  });

  it('ignores duplicate and out-of-order sequence numbers', () => {
    const queue = new InputQueue();
    expect(queue.push(input({}, 5))).toBe(true);
    expect(queue.push(input({}, 5))).toBe(false);
    expect(queue.push(input({}, 3))).toBe(false);
    expect(queue.length).toBe(1);
  });

  it('drops the oldest inputs when too many are waiting', () => {
    const queue = new InputQueue();
    for (let seq = 1; seq <= 20; seq++) queue.push(input({}, seq));
    expect(queue.length).toBeLessThanOrEqual(6);
    expect(queue.droppedTotal).toBeGreaterThan(0);
    const next = queue.next();
    // Inputs were skipped, so the client cannot have predicted this exactly.
    expect(next.predictable).toBe(false);
    expect(next.input!.seq).toBeGreaterThan(1);
  });

  it('after a gap, following inputs are predictable again', () => {
    const queue = new InputQueue();
    queue.push(input({}, 1));
    queue.next();
    queue.next(); // starved
    queue.push(input({}, 2));
    queue.push(input({}, 3));
    expect(queue.next().predictable).toBe(true);
    expect(queue.next().predictable).toBe(true);
  });
});
