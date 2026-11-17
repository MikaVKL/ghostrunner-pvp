/**
 * Watches the frame rate. If the game runs too slowly for a while, it reports it once,
 * so expensive effects (bloom) can be switched off for this session. A weak laptop then
 * still gets a playable picture; the saved setting is not changed.
 */

/** Below this many frames per second (on average over the window) the game is "too slow". */
const MIN_FPS = 30;
const WINDOW_MS = 2000;

export class FrameRateGuard {
  private frames = 0;
  private elapsedMs = 0;
  private reported = false;

  /** Call once per drawn frame. Returns true exactly once, when the game is too slow. */
  observe(deltaMs: number): boolean {
    if (this.reported) return false;
    this.frames++;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < WINDOW_MS) return false;
    const fps = (this.frames * 1000) / this.elapsedMs;
    this.frames = 0;
    this.elapsedMs = 0;
    if (fps >= MIN_FPS) return false;
    this.reported = true;
    return true;
  }

  /** Start measuring again (e.g. after the player switched the effect back on). */
  reset(): void {
    this.frames = 0;
    this.elapsedMs = 0;
    this.reported = false;
  }
}
