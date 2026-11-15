/**
 * Buffers the inputs of one player between "arrived from the network" and "simulated".
 *
 * The server simulates exactly ONE input per player per tick, no matter how many arrive.
 * That makes speed hacks impossible: sending inputs faster does not make you faster.
 *
 * - Queue empty (lag)?  -> repeat the last input ("starved"). After a while, stand still.
 * - Queue too long (burst after lag)? -> drop the oldest inputs to catch up.
 * Both cases make the client's prediction wrong for a moment; `predictable` reports that.
 */
import { neutralInput, type InputCmd } from '../../shared/input';

/** Drop inputs when more than this many are waiting (6 ticks = 100 ms of extra delay). */
const MAX_QUEUED = 6;
/** After dropping, keep this many of the newest inputs. */
const KEEP_AFTER_DROP = 2;
/** After this many ticks without any input, stop repeating the last one (0.5 s). */
const NEUTRAL_AFTER_STARVED_TICKS = 30;

export interface NextInput {
  /** The input to simulate, or null if this player has never sent one yet. */
  input: InputCmd | null;
  /** True if this is exactly the input the client expects the server to simulate next. */
  predictable: boolean;
}

export class InputQueue {
  private queue: InputCmd[] = [];
  private lastInput: InputCmd | null = null;
  private starvedTicks = 0;
  /** Highest sequence number received so far. */
  lastReceivedSeq = 0;
  /** Sequence number of the last input that was simulated. Sent back to the client as `ack`. */
  lastProcessedSeq = 0;
  /** Counters for diagnostics. */
  starvedTotal = 0;
  droppedTotal = 0;

  /** Add an input from the network. Old or duplicate sequence numbers are ignored. */
  push(cmd: InputCmd): boolean {
    if (cmd.seq <= this.lastReceivedSeq) return false;
    this.lastReceivedSeq = cmd.seq;
    this.queue.push(cmd);
    if (this.queue.length > MAX_QUEUED) {
      const dropCount = this.queue.length - KEEP_AFTER_DROP;
      this.queue.splice(0, dropCount);
      this.droppedTotal += dropCount;
    }
    return true;
  }

  /** Take the input to simulate this tick. Call exactly once per tick. */
  next(): NextInput {
    const cmd = this.queue.shift();
    if (cmd) {
      const predictable = cmd.seq === this.lastProcessedSeq + 1;
      this.lastProcessedSeq = cmd.seq;
      this.lastInput = cmd;
      this.starvedTicks = 0;
      return { input: cmd, predictable };
    }
    this.starvedTicks++;
    this.starvedTotal++;
    if (this.lastInput && this.starvedTicks > NEUTRAL_AFTER_STARVED_TICKS) {
      this.lastInput = neutralInput(this.lastInput.yaw, this.lastInput.pitch);
    }
    return { input: this.lastInput, predictable: false };
  }

  get length(): number {
    return this.queue.length;
  }
}
