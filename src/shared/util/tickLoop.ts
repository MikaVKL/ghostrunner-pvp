/**
 * Calls a function at a fixed rate (default 60 times per second) in real time.
 *
 * Timers in JavaScript are not precise, so we do not rely on them. Instead we keep track
 * of when the next tick is due and run as many ticks as are due each time we wake up.
 * Used by the server and by live bots. (The browser uses requestAnimationFrame instead.)
 */
import { TICK_MS } from '../config';

/** If we fall behind by more than this many ticks, skip ahead instead of catching up. */
const MAX_CATCH_UP_TICKS = 5;

export class TickLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextTickAt = 0;
  /** Number of times the loop fell too far behind and skipped ticks. */
  skips = 0;

  constructor(
    private readonly onTick: () => void,
    private readonly intervalMs = TICK_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextTickAt = performance.now() + this.intervalMs;
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const wait = Math.max(0, this.nextTickAt - performance.now());
    this.timer = setTimeout(this.wake, wait);
  }

  private wake = (): void => {
    let ran = 0;
    while (performance.now() >= this.nextTickAt && ran < MAX_CATCH_UP_TICKS) {
      this.onTick();
      this.nextTickAt += this.intervalMs;
      ran++;
    }
    if (performance.now() - this.nextTickAt > MAX_CATCH_UP_TICKS * this.intervalMs) {
      this.skips++;
      this.nextTickAt = performance.now() + this.intervalMs;
    }
    if (this.timer) this.schedule();
  };
}
