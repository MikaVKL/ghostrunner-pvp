/**
 * Records a match for a replay (see shared/replay/replayFormat.ts): the world when the
 * match starts, then every tick the inputs the server really used. The room calls
 * `recordTick` right before stepWorld and `afterTick` right after it.
 *
 * Limits: recording stops after MAX_TICKS (to keep the file small) and as soon as a
 * player leaves, disconnects or comes back - those change the world in ways a replay
 * does not need to reproduce.
 */
import { PROTOCOL_VERSION } from '../../shared/config';
import { packInput, copyWorld, REPLAY_FORMAT, REPLAY_VERSION, type PackedInput, type ReplayAction, type ReplayFile } from '../../shared/replay/replayFormat';
import { hashState } from '../../shared/sim/stateDiff';
import type { InputsBySlot } from '../../shared/sim/stepWorld';
import type { SimContext, WorldState } from '../../shared/sim/world';

/** 20 minutes. About 45 bytes per player and tick, so at most ~6 MB. */
const MAX_TICKS = 60 * 60 * 20;
const CHECKPOINT_EVERY = 60;

export class ReplayRecorder {
  private readonly startWorld: WorldState;
  private readonly ticks: (PackedInput | null)[][] = [];
  private readonly actions: ReplayAction[] = [];
  private readonly checkpoints: { tick: number; hash: number }[] = [];
  private lastHash: number;
  private stopped = false;

  constructor(
    private readonly world: WorldState,
    private readonly ctx: SimContext,
    private readonly players: { slot: number; name: string }[],
    private readonly seed: number,
  ) {
    this.startWorld = copyWorld(world);
    this.lastHash = hashState(world);
  }

  get recording(): boolean {
    return !this.stopped;
  }

  /** Call right before stepWorld with exactly the inputs it will get. */
  recordTick(inputs: InputsBySlot): void {
    if (this.stopped) return;
    if (this.ticks.length >= MAX_TICKS) return this.stop();
    const slots = Math.max(...this.world.players.map((p) => p.slot), 1) + 1;
    this.ticks.push(Array.from({ length: slots }, (_, slot) => (inputs[slot] ? packInput(inputs[slot]!) : null)));
  }

  /** Call right after stepWorld. */
  afterTick(): void {
    if (this.stopped) return;
    if ((this.world.tick - this.startWorld.tick) % CHECKPOINT_EVERY === 0) {
      this.checkpoints.push({ tick: this.world.tick, hash: hashState(this.world) });
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.lastHash = hashState(this.world);
    this.stopped = true;
  }

  /** A change of the world between ticks (currently only rematch votes). */
  recordAction(action: Omit<ReplayAction, 'tick'>): void {
    if (!this.stopped) this.actions.push({ ...action, tick: this.world.tick });
  }

  /** The replay up to now. Can be called while recording goes on. */
  file(): ReplayFile {
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      protocol: PROTOCOL_VERSION,
      mapId: this.ctx.map.id,
      matchConfig: this.ctx.matchConfig,
      seed: this.seed,
      players: this.players,
      startWorld: copyWorld(this.startWorld),
      ticks: this.ticks.map((tick) => [...tick]),
      actions: [...this.actions],
      checkpoints: [...this.checkpoints],
      // While recording, the world right now (including rematch votes after the last tick);
      // once stopped, the world at the last recorded tick.
      finalHash: this.stopped ? this.lastHash : hashState(this.world),
    };
  }
}
