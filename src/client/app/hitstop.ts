/**
 * Hitstop: when blades connect, the picture freezes for a few hundredths of a second.
 * That makes a hit feel heavy.
 *
 * ONLY THE PICTURE freezes: the simulation, the network and the mouse view keep running
 * (freezing the simulation would put us out of step with the server). While frozen, the
 * game loop shows the other fighters, the own sword and the particles as they were.
 */

/** Durations in milliseconds. */
export const HITSTOP_MS = {
  /** Our swing reached the enemy (shown at once, before the server decides). */
  contact: 55,
  hit: 85,
  parry: 110,
  clash: 80,
};

/** A second freeze this soon after the last one is skipped (no stutter for one exchange). */
const MIN_GAP_MS = 220;

export class Hitstop {
  /** Switched by the settings (Settings.hitstop). */
  enabled = true;
  private leftMs = 0;
  private sinceLastMs = Number.POSITIVE_INFINITY;

  get frozen(): boolean {
    return this.leftMs > 0;
  }

  trigger(ms: number): void {
    if (!this.enabled || this.sinceLastMs < MIN_GAP_MS) return;
    this.leftMs = ms;
    this.sinceLastMs = 0;
  }

  /** Advance by the frame time. Returns the time the picture should move this frame (ms). */
  advance(deltaMs: number): number {
    this.sinceLastMs += deltaMs;
    if (this.leftMs <= 0) return deltaMs;
    const frozenPart = Math.min(this.leftMs, deltaMs);
    this.leftMs -= frozenPart;
    return deltaMs - frozenPart;
  }
}
