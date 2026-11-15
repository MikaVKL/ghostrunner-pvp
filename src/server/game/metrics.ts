/**
 * Server performance and error counters. Read them via GET /stats or in bot reports.
 */
import { TICK_MS } from '../../shared/config';

/** How many recent tick durations are kept for the statistics (60 s at 60 Hz). */
const WINDOW_SIZE = 3600;

export interface TickStats {
  ticks: number;
  avgMs: number;
  p99Ms: number;
  maxMs: number;
  /** Ticks that took longer than one tick interval (the server could not keep up). */
  overruns: number;
}

export class Metrics {
  private readonly durations = new Float64Array(WINDOW_SIZE);
  private ticks = 0;
  private maxMs = 0;
  private overruns = 0;
  /** Messages that failed validation. */
  badMessages = 0;
  /** Exceptions caught while handling messages or ticking. */
  errors = 0;
  lastError = '';

  recordTick(durationMs: number): void {
    this.durations[this.ticks % WINDOW_SIZE] = durationMs;
    this.ticks++;
    if (durationMs > this.maxMs) this.maxMs = durationMs;
    if (durationMs > TICK_MS) this.overruns++;
  }

  recordError(error: unknown): void {
    this.errors++;
    this.lastError = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }

  tickStats(): TickStats {
    const count = Math.min(this.ticks, WINDOW_SIZE);
    const recent = Array.from(this.durations.subarray(0, count)).sort((a, b) => a - b);
    const sum = recent.reduce((total, d) => total + d, 0);
    return {
      ticks: this.ticks,
      avgMs: count > 0 ? sum / count : 0,
      p99Ms: count > 0 ? recent[Math.min(count - 1, Math.floor(count * 0.99))] : 0,
      maxMs: this.maxMs,
      overruns: this.overruns,
    };
  }
}
