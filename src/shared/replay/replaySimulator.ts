/**
 * Calculates a recorded match again, tick by tick, and can jump to any tick (forward and
 * backward). Used by the replay viewer, the killcam and the tests.
 *
 * Jumping backward: the simulation cannot run backward. Instead it keeps a copy of the
 * world every KEYFRAME_EVERY ticks ("keyframes"), goes back to the nearest one and
 * calculates forward from there.
 */
import { getMap } from '../maps';
import type { GameEvent } from '../sim/events';
import { hashState } from '../sim/stateDiff';
import { stepWorld, type InputsBySlot } from '../sim/stepWorld';
import type { SimContext, WorldState } from '../sim/world';
import { voteRematch } from '../match/lifecycle';
import { copyWorld, unpackInput, type ReplayFile } from './replayFormat';

const KEYFRAME_EVERY = 120;

export class ReplaySimulator {
  /** The world at the current tick. Read it, never change it. */
  world: WorldState;
  readonly ctx: SimContext;
  /** First and last tick of the recording. */
  readonly firstTick: number;
  readonly lastTick: number;
  /** Ticks (and hashes) where the calculated world did not match the recording. */
  readonly mismatches: { tick: number; expected: number; actual: number }[] = [];
  private readonly keyframes = new Map<number, WorldState>();
  private readonly checkpoints: Map<number, number>;

  constructor(private readonly file: ReplayFile) {
    this.ctx = { map: getMap(file.mapId), matchConfig: file.matchConfig };
    this.world = copyWorld(file.startWorld);
    this.firstTick = file.startWorld.tick;
    this.lastTick = this.firstTick + file.ticks.length;
    this.checkpoints = new Map(file.checkpoints.map((c) => [c.tick, c.hash]));
    this.keyframes.set(this.firstTick, copyWorld(this.world));
  }

  get tick(): number {
    return this.world.tick;
  }

  get atEnd(): boolean {
    return this.world.tick >= this.lastTick;
  }

  /** Advance one tick. Returns the events of that tick (empty at the end). */
  step(): GameEvent[] {
    if (this.atEnd) return [];
    this.applyActions();
    const packed = this.file.ticks[this.world.tick - this.firstTick];
    const inputs: InputsBySlot = {};
    packed.forEach((input, slot) => {
      if (input) inputs[slot] = unpackInput(input);
    });
    const { events } = stepWorld(this.world, inputs, this.ctx);
    this.verify();
    if ((this.world.tick - this.firstTick) % KEYFRAME_EVERY === 0) this.keyframes.set(this.world.tick, copyWorld(this.world));
    return events;
  }

  /** Jump to `tick` (clamped to the recording). Events on the way are not reported. */
  seek(tick: number): void {
    const target = Math.max(this.firstTick, Math.min(this.lastTick, Math.round(tick)));
    if (target < this.world.tick || target - this.world.tick > KEYFRAME_EVERY) {
      let best = this.firstTick;
      for (const keyTick of this.keyframes.keys()) if (keyTick <= target && keyTick > best) best = keyTick;
      if (best > this.world.tick || target < this.world.tick) this.world = copyWorld(this.keyframes.get(best)!);
    }
    while (this.world.tick < target) this.step();
  }

  /** Calculate the whole recording; true if every checkpoint and the final hash matched. */
  verifyAll(): boolean {
    this.seek(this.lastTick);
    this.applyActions(); // changes made after the last tick belong to the final state
    return this.mismatches.length === 0 && hashState(this.world) === this.file.finalHash;
  }

  /** Apply what the server did to the world at the current tick (before the next step). */
  private applyActions(): void {
    for (const action of this.file.actions) {
      // voteRematch ignores a second vote, so applying an action twice changes nothing.
      if (action.tick === this.world.tick && action.type === 'rematch') voteRematch(this.world, action.slot);
    }
  }

  private verify(): void {
    const expected = this.checkpoints.get(this.world.tick);
    if (expected === undefined) return;
    const actual = hashState(this.world);
    if (actual !== expected && !this.mismatches.some((m) => m.tick === this.world.tick)) {
      this.mismatches.push({ tick: this.world.tick, expected, actual });
    }
  }
}
