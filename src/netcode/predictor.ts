/**
 * Client-side prediction and reconciliation (rollback) for the local player.
 *
 * predict():   apply an input immediately, without waiting for the server, and remember it.
 * reconcile(): when the server's state arrives, throw away our guess, start again from the
 *              server's (true) state and re-apply all inputs the server has not seen yet.
 *
 * See LEARNING.md for the idea behind it.
 */
import type { InputCmd } from '../shared/input';
import type { MapDef } from '../shared/maps/mapTypes';
import { distance } from '../shared/math/vec3';
import { clonePlayer, type PlayerState } from '../shared/sim/playerState';
import { stateDifference } from '../shared/sim/stateDiff';
import { stepPlayer } from '../shared/sim/stepPlayer';
import type { MatchPhase } from '../shared/sim/world';

/** An input the server has not confirmed yet, plus the state we predicted after it. */
interface PendingInput {
  cmd: InputCmd;
  predicted: PlayerState;
}

/** Oldest pending inputs are discarded beyond this (4 s without any server answer). */
const MAX_PENDING = 240;

export interface ReconcileResult {
  /** False if we had no prediction for the acknowledged input (nothing to compare). */
  compared: boolean;
  /** Largest difference of any state field between prediction and server (0 = perfect). */
  difference: number;
  /** Distance in meters between the predicted and the true position. */
  positionError: number;
  /** What we had predicted for the acknowledged input (for desync reports). */
  predicted: PlayerState | null;
  /** How many inputs were re-applied on top of the server state. */
  replayed: number;
}

export class Predictor {
  /** The current predicted state of the local player (null until the first snapshot). */
  state: PlayerState | null = null;
  private pending: PendingInput[] = [];

  reset(): void {
    this.state = null;
    this.pending = [];
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Apply one input right now and remember it until the server confirms it. */
  predict(cmd: InputCmd, map: MapDef, phase: MatchPhase): void {
    if (!this.state) return;
    stepPlayer(this.state, cmd, map, phase);
    this.pending.push({ cmd, predicted: clonePlayer(this.state) });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  /**
   * Take over the authoritative server state and replay unconfirmed inputs.
   * @param server state of the local player from the snapshot
   * @param ack    sequence number of the last input included in that state
   */
  reconcile(server: PlayerState, ack: number, map: MapDef, phase: MatchPhase): ReconcileResult {
    // 1) What did we predict for the input the server just confirmed?
    let predicted: PlayerState | null = null;
    while (this.pending.length > 0 && this.pending[0].cmd.seq <= ack) {
      const confirmed = this.pending.shift()!;
      if (confirmed.cmd.seq === ack) predicted = confirmed.predicted;
    }

    // 2) Roll back to the server state and replay everything it has not seen yet.
    this.state = clonePlayer(server);
    for (const entry of this.pending) {
      stepPlayer(this.state, entry.cmd, map, phase);
      entry.predicted = clonePlayer(this.state);
    }

    return {
      compared: predicted !== null,
      difference: predicted ? stateDifference(predicted, server) : 0,
      positionError: predicted ? distance(predicted.pos, server.pos) : 0,
      predicted,
      replayed: this.pending.length,
    };
  }
}
