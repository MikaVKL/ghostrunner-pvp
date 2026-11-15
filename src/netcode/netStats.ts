/**
 * Network health counters of one client. Shown in the debug overlay and in bot reports.
 */

/** Differences smaller than this are treated as "equal" (float rounding between engines). */
export const PREDICTION_EPSILON = 1e-5;
/** At most this many desync descriptions are stored. */
const MAX_DESYNC_DETAILS = 5;

export interface NetStats {
  snapshots: number;
  inputsSent: number;
  /**
   * Predictions that were wrong for an EXPECTED reason (hit by the opponent, lag, round
   * restart ...). Normal; reconciliation fixes them.
   */
  corrections: number;
  /** Largest expected correction in meters (teleports are not included). */
  maxCorrection: number;
  /** Corrections so large that they were a respawn/teleport, not a small prediction error. */
  teleports: number;
  /**
   * Predictions that were wrong although the server said nothing unusual happened.
   * This must stay 0. If not, client and server simulate differently => bug.
   */
  desyncs: number;
  /** Human readable descriptions of the first few desyncs (which fields differed). */
  desyncDetails: string[];
  /** Last measured round trip time in milliseconds. */
  rttMs: number;
  /** Inputs sent but not yet confirmed by the server. */
  pendingInputs: number;
  /** Error messages received from the server. */
  serverErrors: string[];
}

export function createNetStats(): NetStats {
  return {
    snapshots: 0,
    inputsSent: 0,
    corrections: 0,
    maxCorrection: 0,
    teleports: 0,
    desyncs: 0,
    desyncDetails: [],
    rttMs: 0,
    pendingInputs: 0,
    serverErrors: [],
  };
}

export function recordDesync(stats: NetStats, description: string): void {
  stats.desyncs++;
  if (stats.desyncDetails.length < MAX_DESYNC_DETAILS) stats.desyncDetails.push(description);
}
